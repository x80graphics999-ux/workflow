import { Router } from 'express';
import { isStaffRole } from '../auth.js';
import { db } from '../db.js';
import { describeRule } from '../lib/recurrence.js';
import { taskScope, visibleUserIds } from '../lib/scope.js';
import { activityScope } from './activity.js';
import { scheduleScope } from './schedules.js';
import { taskListInclude } from './tasks.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', async (req, res) => {
    const user = req.user;
    const now = new Date();
    const scope = isStaffRole(user.role) ? { assigneeId: user.id } : await taskScope(user);

    const [byStatus, timeSum, mine, upcomingTasks, upcomingSchedules, openIssues, recentActivity] = await Promise.all([
        db.task.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
        db.task.aggregate({ where: scope, _sum: { totalSeconds: true } }),
        db.task.findMany({
            where: { assigneeId: user.id },
            include: taskListInclude,
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
            take: 200,
        }),
        db.task.findMany({
            where: { AND: [scope, { status: { not: 'COMPLETED' }, dueDate: { gte: now } }] },
            include: taskListInclude,
            orderBy: { dueDate: 'asc' },
            take: 10,
        }),
        db.schedule.findMany({
            where: {
                AND: [
                    await scheduleScope(user),
                    { active: true, nextRunAt: { gte: now, lte: new Date(now.getTime() + 14 * 24 * 3600 * 1000) } },
                ],
            },
            include: { assignee: { select: { name: true } }, recipientTeam: { select: { name: true } } },
            orderBy: { nextRunAt: 'asc' },
            take: 10,
        }),
        db.issue.findMany({
            where: { status: 'OPEN', task: scope },
            include: {
                reporter: { select: { id: true, name: true } },
                task: { select: { id: true, title: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
        }),
        db.activity.findMany({
            where: isStaffRole(user.role) ? { OR: [{ actorId: user.id }, { task: { assigneeId: user.id } }] } : await activityScope(user),
            include: { actor: { select: { id: true, name: true } }, task: { select: { id: true, title: true } } },
            orderBy: { createdAt: 'desc' },
            take: 15,
        }),
    ]);

    const counts = { NEW: 0, IN_PROGRESS: 0, BLOCKED: 0, COMPLETED: 0 } as Record<string, number>;
    byStatus.forEach((g) => (counts[g.status] = g._count._all));

    // Per-person performance for admins, managers and leads.
    let team: unknown[] = [];
    if (!isStaffRole(user.role)) {
        const ids = await visibleUserIds(user);
        const people = await db.user.findMany({
            where: { active: true, role: { not: 'ADMIN' }, ...(ids ? { id: { in: ids.filter((id) => id !== user.id) } } : {}) },
            select: { id: true, name: true, role: true, team: { select: { name: true } } },
            orderBy: { name: 'asc' },
        });
        const tasks = await db.task.findMany({
            where: { assigneeId: { in: people.map((p) => p.id) } },
            select: {
                assigneeId: true,
                status: true,
                totalSeconds: true,
                timeLogs: { where: { endedAt: null }, select: { id: true } },
                _count: { select: { issues: { where: { status: 'OPEN' } } } },
            },
        });
        team = people.map((p) => {
            const own = tasks.filter((t) => t.assigneeId === p.id);
            const count = (s: string) => own.filter((t) => t.status === s).length;
            return {
                ...p,
                total: own.length,
                new: count('NEW'),
                inProgress: count('IN_PROGRESS'),
                blocked: count('BLOCKED'),
                completed: count('COMPLETED'),
                openIssues: own.reduce((n, t) => n + t._count.issues, 0),
                totalSeconds: own.reduce((n, t) => n + t.totalSeconds, 0),
                working: own.some((t) => t.timeLogs.length > 0),
            };
        });
    }

    res.json({
        counts,
        totalSeconds: timeSum._sum.totalSeconds ?? 0,
        mine,
        upcomingTasks,
        upcomingSchedules: upcomingSchedules.map((s) => ({ ...s, ruleText: describeRule(s) })),
        openIssues,
        recentActivity,
        team,
    });
});
