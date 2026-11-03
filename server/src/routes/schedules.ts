import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../auth.js';
import { OVERSEER_ROLES, requireRole } from '../auth.js';
import { db } from '../db.js';
import { badRequest, forbidden, notFound, parse } from '../http.js';
import { logActivity } from '../lib/activity.js';
import { notify } from '../lib/notify.js';
import { describeRule, firstOccurrence, occurrencesBetween } from '../lib/recurrence.js';
import { assertCanAssign, taskScope, visibleTeamIds, visibleUserIds } from '../lib/scope.js';
import { scheduleRecipients } from '../scheduler.js';

export const schedulesRouter = Router();
export const calendarRouter = Router();

const scheduleInclude = {
    createdBy: { select: { id: true, name: true } },
    assignee: { select: { id: true, name: true } },
    recipientUser: { select: { id: true, name: true } },
    recipientTeam: { select: { id: true, name: true } },
    client: { select: { id: true, name: true } },
    project: { select: { id: true, name: true } },
} satisfies Prisma.ScheduleInclude;

/** Schedules a person should see: ones they created, are assigned or targeted by, or (for overseers) within their scope. */
export async function scheduleScope(user: AuthUser): Promise<Prisma.ScheduleWhereInput> {
    if (user.role === 'ADMIN') return {};
    const userIds = (await visibleUserIds(user)) ?? [];
    const teamIds = (await visibleTeamIds(user)) ?? [];
    return {
        OR: [
            { createdById: user.id },
            { assigneeId: { in: userIds } },
            { recipientUserId: { in: userIds } },
            { recipientTeamId: { in: teamIds } },
            { recipientType: 'EVERYONE', createdBy: { role: 'ADMIN' } },
            { recipientType: 'EVERYONE', createdById: { in: userIds } },
            ...(user.teamId ? [{ recipientType: 'EVERYONE', createdBy: { managedTeams: { some: { id: user.teamId } } } }] : []),
        ],
    };
}

const withRule = <T extends Parameters<typeof describeRule>[0]>(s: T) => ({ ...s, ruleText: describeRule(s) });

schedulesRouter.get('/', async (req, res) => {
    const schedules = await db.schedule.findMany({
        where: await scheduleScope(req.user),
        include: scheduleInclude,
        orderBy: [{ active: 'desc' }, { nextRunAt: 'asc' }],
    });
    res.json(schedules.map(withRule));
});

const scheduleInput = z
    .object({
        title: z.string().trim().min(1),
        description: z.string().default(''),
        notes: z.string().default(''),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
        startAt: z.string().min(1, 'Pick a start date'),
        frequency: z.enum(['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY']),
        interval: z.coerce.number().int().min(1).max(365).default(1),
        weekdays: z.array(z.number().int().min(0).max(6)).default([]),
        endAt: z.string().nullable().optional(),
        dueInHours: z.coerce.number().int().min(1).max(24 * 60).default(24),
        remindMinutesBefore: z.coerce.number().int().min(0).max(60 * 24 * 30).default(60),
        recipientType: z.enum(['USER', 'TEAM', 'EVERYONE']),
        recipientUserId: z.string().nullable().optional(),
        recipientTeamId: z.string().nullable().optional(),
        assigneeId: z.string().nullable().optional(),
        clientId: z.string().nullable().optional(),
        projectId: z.string().nullable().optional(),
    })
    .refine((s) => s.recipientType !== 'USER' || !!s.recipientUserId || !!s.assigneeId, {
        message: 'Choose who should be reminded',
        path: ['recipientUserId'],
    })
    .refine((s) => s.recipientType !== 'TEAM' || !!s.recipientTeamId, { message: 'Choose a team', path: ['recipientTeamId'] });

schedulesRouter.post('/', requireRole(...OVERSEER_ROLES), async (req, res) => {
    const data = parse(scheduleInput, req.body);

    if (data.assigneeId) await assertCanAssign(req.user, data.assigneeId);
    if (data.recipientType === 'USER' && data.recipientUserId) {
        const ids = await visibleUserIds(req.user);
        if (ids && !ids.includes(data.recipientUserId)) throw forbidden('You cannot schedule reminders for this user');
    }
    if (data.recipientType === 'TEAM') {
        const ids = await visibleTeamIds(req.user);
        if (ids && !ids.includes(data.recipientTeamId!)) throw forbidden('You cannot schedule work for this team');
    }

    const rule = {
        startAt: new Date(data.startAt),
        frequency: data.frequency,
        interval: data.interval,
        weekdays: data.weekdays.join(','),
        endAt: data.endAt ? new Date(data.endAt) : null,
    };
    if (Number.isNaN(rule.startAt.getTime())) throw badRequest('Invalid start date');
    const nextRunAt = firstOccurrence(rule);
    if (!nextRunAt) throw badRequest('The schedule ends before its first occurrence');

    const schedule = await db.schedule.create({
        data: {
            ...rule,
            title: data.title,
            description: data.description,
            notes: data.notes,
            priority: data.priority,
            dueInHours: data.dueInHours,
            remindMinutesBefore: data.remindMinutesBefore,
            recipientType: data.recipientType,
            recipientUserId: data.recipientType === 'USER' ? data.recipientUserId || data.assigneeId || null : null,
            recipientTeamId: data.recipientType === 'TEAM' ? data.recipientTeamId || null : null,
            assigneeId: data.assigneeId || null,
            clientId: data.clientId || null,
            projectId: data.projectId || null,
            createdById: req.user.id,
            nextRunAt,
        },
        include: scheduleInclude,
    });

    const ruleText = describeRule(schedule);
    const recipients = (await scheduleRecipients(schedule)).filter((id) => id !== req.user.id);
    await logActivity(req.user.id, 'schedule.created', `${req.user.name} scheduled "${schedule.title}" (${ruleText})`, null, {
        notified: recipients,
    });
    await notify(
        recipients,
        `Scheduled: ${schedule.title}`,
        `${ruleText}, starting ${nextRunAt.toLocaleString()}. Added by ${req.user.name}.`,
        '/calendar',
    );
    res.status(201).json(withRule(schedule));
});

async function ownedSchedule(user: AuthUser, id: string) {
    const schedule = await db.schedule.findUnique({ where: { id } });
    if (!schedule) throw notFound('Schedule not found');
    if (user.role !== 'ADMIN' && schedule.createdById !== user.id) throw forbidden('Only the creator can change this schedule');
    return schedule;
}

schedulesRouter.patch('/:id', async (req, res) => {
    const schedule = await ownedSchedule(req.user, req.params.id);
    const { active } = parse(z.object({ active: z.boolean() }), req.body);
    let nextRunAt = schedule.nextRunAt;
    if (active && !schedule.active) {
        // Resuming skips occurrences that passed while paused.
        const upcoming = occurrencesBetween(schedule, new Date(), new Date(Date.now() + 5 * 366 * 24 * 3600 * 1000), 1);
        nextRunAt = upcoming[0] ?? null;
        if (!nextRunAt) throw badRequest('This schedule has no future occurrences');
    }
    const updated = await db.schedule.update({
        where: { id: schedule.id },
        data: { active, nextRunAt },
        include: scheduleInclude,
    });
    res.json(withRule(updated));
});

schedulesRouter.delete('/:id', async (req, res) => {
    const schedule = await ownedSchedule(req.user, req.params.id);
    await db.schedule.delete({ where: { id: schedule.id } });
    await logActivity(req.user.id, 'schedule.deleted', `${req.user.name} removed schedule "${schedule.title}"`);
    res.json({ ok: true });
});

// ---- Calendar: task due dates + schedule occurrences in a date range ----

calendarRouter.get('/', async (req, res) => {
    const { from, to } = parse(z.object({ from: z.string(), to: z.string() }), req.query);
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw badRequest('Invalid date range');

    const [tasks, schedules] = await Promise.all([
        db.task.findMany({
            where: { AND: [await taskScope(req.user), { dueDate: { gte: start, lte: end } }] },
            select: { id: true, title: true, status: true, dueDate: true, priority: true, assignee: { select: { name: true } } },
        }),
        db.schedule.findMany({
            where: { AND: [await scheduleScope(req.user), { active: true }] },
            include: scheduleInclude,
        }),
    ]);

    const events = [
        ...tasks.map((t) => ({
            id: `task-${t.id}`,
            kind: 'task' as const,
            taskId: t.id,
            title: t.title,
            date: t.dueDate!,
            status: t.status,
            priority: t.priority,
            who: t.assignee.name,
        })),
        ...schedules.flatMap((s) =>
            occurrencesBetween(s, start, end)
                // Past occurrences already became tasks (shown above), so only future ones are listed.
                .filter((d) => d >= (s.lastRunAt ?? new Date(0)) && d > new Date())
                .map((d) => ({
                    id: `schedule-${s.id}-${d.getTime()}`,
                    kind: 'schedule' as const,
                    scheduleId: s.id,
                    title: s.title,
                    date: d,
                    priority: s.priority,
                    recurring: s.frequency !== 'ONCE',
                    ruleText: describeRule(s),
                    who:
                        s.assignee?.name ??
                        s.recipientUser?.name ??
                        s.recipientTeam?.name ??
                        (s.recipientType === 'EVERYONE' ? 'Everyone' : ''),
                })),
        ),
    ].sort((a, b) => +new Date(a.date) - +new Date(b.date));

    res.json(events);
});
