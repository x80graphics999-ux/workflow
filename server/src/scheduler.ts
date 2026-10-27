import type { Schedule } from '@prisma/client';
import { db } from './db.js';
import { logActivity } from './lib/activity.js';
import { notify } from './lib/notify.js';
import { describeRule, nextOccurrence } from './lib/recurrence.js';

const MINUTE = 60 * 1000;

/**
 * Marks an occurrence as handled before acting on it. On Vercel several instances can tick at once;
 * the conditional update lets exactly one of them win, so nobody gets duplicate tasks or reminders.
 */
async function claim(update: Promise<{ count: number }>) {
    return (await update).count === 1;
}

/** Who receives a schedule's reminders: the target user, a whole team, or everyone in the creator's reach. */
export async function scheduleRecipients(s: Schedule): Promise<string[]> {
    const ids = new Set<string>();
    if (s.assigneeId) ids.add(s.assigneeId);

    if (s.recipientType === 'USER' && s.recipientUserId) ids.add(s.recipientUserId);

    if (s.recipientType === 'TEAM' && s.recipientTeamId) {
        const team = await db.team.findUnique({
            where: { id: s.recipientTeamId },
            select: { leadId: true, members: { where: { active: true }, select: { id: true } } },
        });
        if (team?.leadId) ids.add(team.leadId);
        team?.members.forEach((m) => ids.add(m.id));
    }

    if (s.recipientType === 'EVERYONE') {
        const creator = await db.user.findUnique({ where: { id: s.createdById } });
        if (creator?.role === 'ADMIN') {
            (await db.user.findMany({ where: { active: true }, select: { id: true } })).forEach((u) => ids.add(u.id));
        } else {
            const teams = await db.team.findMany({
                where: creator?.role === 'MANAGER' ? { managerId: s.createdById } : { leadId: s.createdById },
                select: { leadId: true, members: { where: { active: true }, select: { id: true } } },
            });
            for (const t of teams) {
                if (t.leadId) ids.add(t.leadId);
                t.members.forEach((m) => ids.add(m.id));
            }
        }
    }
    return [...ids];
}

/** Sends the "coming up" reminder once per occurrence, `remindMinutesBefore` ahead of it. */
async function sendUpcomingReminders(now: Date) {
    const schedules = await db.schedule.findMany({ where: { active: true, nextRunAt: { gt: now } } });
    for (const s of schedules) {
        const runAt = s.nextRunAt!;
        const alreadySent = s.remindedFor?.getTime() === runAt.getTime();
        if (alreadySent || s.remindMinutesBefore <= 0) continue;
        if (runAt.getTime() - s.remindMinutesBefore * MINUTE > now.getTime()) continue;
        if (!(await claim(db.schedule.updateMany({
            where: { id: s.id, OR: [{ remindedFor: null }, { remindedFor: { not: runAt } }] },
            data: { remindedFor: runAt },
        })))) continue;

        await notify(
            await scheduleRecipients(s),
            `Upcoming: ${s.title}`,
            `Starts ${runAt.toLocaleString()} (${describeRule(s)}).${s.description ? `\n${s.description}` : ''}`,
            '/calendar',
        );
    }
}

/** Creates the task instance for each schedule occurrence that is due, then moves the schedule forward. */
async function runDueSchedules(now: Date) {
    const due = await db.schedule.findMany({ where: { active: true, nextRunAt: { lte: now } } });
    for (const s of due) {
        const runAt = s.nextRunAt!;

        // Skip any occurrences missed while the server was down instead of flooding people with tasks.
        let next = nextOccurrence(s, runAt);
        while (next && next <= now) next = nextOccurrence(s, next);
        if (!(await claim(db.schedule.updateMany({
            where: { id: s.id, nextRunAt: runAt },
            data: { lastRunAt: runAt, nextRunAt: next, active: next !== null },
        })))) continue;

        if (s.assigneeId) {
            const assignee = await db.user.findUnique({ where: { id: s.assigneeId } });
            if (assignee?.active) {
                const task = await db.task.create({
                    data: {
                        title: s.title,
                        description: s.description,
                        notes: s.notes,
                        priority: s.priority,
                        dueDate: new Date(runAt.getTime() + s.dueInHours * 60 * MINUTE),
                        assigneeId: assignee.id,
                        teamId: assignee.teamId,
                        creatorId: s.createdById,
                        clientId: s.clientId,
                        projectId: s.projectId,
                        scheduleId: s.id,
                    },
                });
                await logActivity(
                    s.createdById,
                    'task.assigned',
                    `Scheduled task "${task.title}" was assigned to ${assignee.name} (${describeRule(s)})`,
                    task.id,
                    { notified: [assignee.id] },
                );
                await notify([assignee.id], `New task: ${task.title}`, `Scheduled task, ${describeRule(s).toLowerCase()}`, `/tasks/${task.id}`);
            }
        } else {
            // A calendar event without an assignee just alerts its recipients when it starts.
            await notify(await scheduleRecipients(s), `Today: ${s.title}`, s.description, '/calendar');
        }
    }
}

/** One reminder per open task once its due date is within a day. */
async function sendDueTaskReminders(now: Date) {
    const tasks = await db.task.findMany({
        where: {
            status: { not: 'COMPLETED' },
            dueReminderSent: false,
            dueDate: { lte: new Date(now.getTime() + 24 * 60 * MINUTE) },
        },
    });
    for (const t of tasks) {
        if (!(await claim(db.task.updateMany({ where: { id: t.id, dueReminderSent: false }, data: { dueReminderSent: true } })))) continue;
        const overdue = t.dueDate! < now;
        await notify(
            [t.assigneeId],
            `${overdue ? 'Overdue' : 'Due soon'}: ${t.title}`,
            `Due ${t.dueDate!.toLocaleString()}`,
            `/tasks/${t.id}`,
        );
    }
}

let running = false;

export async function tick() {
    if (running) return;
    running = true;
    try {
        const now = new Date();
        await runDueSchedules(now);
        await sendUpcomingReminders(now);
        await sendDueTaskReminders(now);
    } catch (err) {
        console.error('[scheduler]', err);
    } finally {
        running = false;
    }
}

export function startScheduler() {
    void tick();
    return setInterval(tick, MINUTE);
}
