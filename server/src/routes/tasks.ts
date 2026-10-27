import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../auth.js';
import { db } from '../db.js';
import { env } from '../env.js';
import { badRequest, forbidden, notFound, parse } from '../http.js';
import { logActivity } from '../lib/activity.js';
import { notify } from '../lib/notify.js';
import { assertCanAssign, canManageTask, getVisibleTask, taskScope } from '../lib/scope.js';

export const tasksRouter = Router();

export const STATUSES = ['NEW', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export const taskListInclude = {
    assignee: { select: { id: true, name: true } },
    creator: { select: { id: true, name: true } },
    client: { select: { id: true, name: true } },
    project: { select: { id: true, name: true } },
    timeLogs: { where: { endedAt: null }, select: { id: true, startedAt: true, userId: true } },
    _count: { select: { issues: { where: { status: 'OPEN' } }, attachments: true } },
} satisfies Prisma.TaskInclude;

/** Ends every running timer of the user (optionally only on one task) and books the time on the task. */
export async function stopTimers(userId: string, taskId?: string) {
    const running = await db.timeLog.findMany({ where: { userId, endedAt: null, ...(taskId ? { taskId } : {}) } });
    const now = new Date();
    for (const log of running) {
        const seconds = Math.max(0, Math.round((now.getTime() - log.startedAt.getTime()) / 1000));
        await db.$transaction([
            db.timeLog.update({ where: { id: log.id }, data: { endedAt: now, seconds } }),
            db.task.update({ where: { id: log.taskId }, data: { totalSeconds: { increment: seconds } } }),
        ]);
    }
    return running.length;
}

/** People who oversee the task: its creator plus the assignee's team lead and manager. */
async function overseers(task: { creatorId: string; assigneeId: string }, exclude: string) {
    const assignee = await db.user.findUnique({
        where: { id: task.assigneeId },
        select: { team: { select: { leadId: true, managerId: true } } },
    });
    const ids = [task.creatorId, assignee?.team?.leadId, assignee?.team?.managerId];
    return ids.filter((id): id is string => !!id && id !== exclude && id !== task.assigneeId);
}

function assertAssignee(user: AuthUser, task: { assigneeId: string }) {
    if (task.assigneeId !== user.id) throw forbidden('Only the assignee can do this');
}

const link = (id: string) => `/tasks/${id}`;

/** SQLite's LIKE ignores case already; Postgres needs `mode: 'insensitive'`, which the SQLite client types don't know. */
const textSearch = (q: string) => ({ contains: q, ...(env.postgres ? { mode: 'insensitive' } : {}) }) as Prisma.StringFilter;

// ---- Queries ----

const listQuery = z.object({
    status: z.enum(STATUSES).optional(),
    assigneeId: z.string().optional(),
    clientId: z.string().optional(),
    projectId: z.string().optional(),
    q: z.string().optional(),
    mine: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
});

tasksRouter.get('/', async (req, res) => {
    const f = parse(listQuery, req.query);
    const where: Prisma.TaskWhereInput = {
        AND: [
            await taskScope(req.user),
            f.status ? { status: f.status } : {},
            f.assigneeId ? { assigneeId: f.assigneeId } : {},
            f.mine ? { assigneeId: req.user.id } : {},
            f.clientId ? { clientId: f.clientId } : {},
            f.projectId ? { projectId: f.projectId } : {},
            f.q ? { OR: [{ title: textSearch(f.q) }, { description: textSearch(f.q) }] } : {},
            f.from ? { createdAt: { gte: new Date(f.from) } } : {},
            f.to ? { createdAt: { lte: new Date(`${f.to}T23:59:59`) } } : {},
        ],
    };
    const tasks = await db.task.findMany({
        where,
        include: taskListInclude,
        orderBy: [{ updatedAt: 'desc' }],
        take: 500,
    });
    res.json(tasks);
});

tasksRouter.get('/:id', async (req, res) => {
    await getVisibleTask(req.user, req.params.id);
    const task = await db.task.findUniqueOrThrow({
        where: { id: req.params.id },
        include: {
            ...taskListInclude,
            team: { select: { id: true, name: true } },
            timeLogs: { include: { user: { select: { id: true, name: true } } }, orderBy: { startedAt: 'desc' } },
            issues: {
                include: { reporter: { select: { id: true, name: true } }, resolver: { select: { id: true, name: true } } },
                orderBy: { createdAt: 'desc' },
            },
            attachments: {
                include: { uploader: { select: { id: true, name: true } } },
                orderBy: { createdAt: 'desc' },
            },
            activities: { include: { actor: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
        },
    });
    res.json({
        ...task,
        canManage: await canManageTask(req.user, task),
        isAssignee: task.assigneeId === req.user.id,
    });
});

// ---- Create / edit ----

const taskInput = z.object({
    title: z.string().trim().min(1),
    description: z.string().default(''),
    notes: z.string().default(''),
    priority: z.enum(PRIORITIES).default('MEDIUM'),
    dueDate: z.string().nullable().optional(),
    assigneeId: z.string().min(1, 'Choose who the task is for'),
    clientId: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
});

tasksRouter.post('/', async (req, res) => {
    const data = parse(taskInput, req.body);
    await assertCanAssign(req.user, data.assigneeId);
    const assignee = await db.user.findUniqueOrThrow({ where: { id: data.assigneeId } });
    const task = await db.task.create({
        data: {
            title: data.title,
            description: data.description,
            notes: data.notes,
            priority: data.priority,
            dueDate: data.dueDate ? new Date(data.dueDate) : null,
            assigneeId: assignee.id,
            teamId: assignee.teamId,
            creatorId: req.user.id,
            clientId: data.clientId || null,
            projectId: data.projectId || null,
        },
    });
    await logActivity(req.user.id, 'task.assigned', `${req.user.name} assigned "${task.title}" to ${assignee.name}`, task.id, {
        notified: [assignee.id],
    });
    await notify([assignee.id], `New task: ${task.title}`, `Assigned by ${req.user.name}`, link(task.id));
    res.status(201).json(task);
});

tasksRouter.patch('/:id', async (req, res) => {
    const task = await getVisibleTask(req.user, req.params.id);
    if (!(await canManageTask(req.user, task))) throw forbidden('Only the person who assigned this task can edit it');
    const data = parse(taskInput.partial(), req.body);

    let teamId: string | null | undefined;
    if (data.assigneeId && data.assigneeId !== task.assigneeId) {
        await assertCanAssign(req.user, data.assigneeId);
        await stopTimers(task.assigneeId, task.id);
        const assignee = await db.user.findUniqueOrThrow({ where: { id: data.assigneeId } });
        teamId = assignee.teamId;
        await logActivity(req.user.id, 'task.reassigned', `${req.user.name} reassigned "${task.title}" to ${assignee.name}`, task.id, {
            notified: [assignee.id],
        });
        await notify([assignee.id], `Task assigned to you: ${task.title}`, `Assigned by ${req.user.name}`, link(task.id));
    }

    const updated = await db.task.update({
        where: { id: task.id },
        data: {
            ...data,
            teamId,
            dueDate: data.dueDate === undefined ? undefined : data.dueDate ? new Date(data.dueDate) : null,
            clientId: data.clientId === undefined ? undefined : data.clientId || null,
            projectId: data.projectId === undefined ? undefined : data.projectId || null,
            dueReminderSent: data.dueDate !== undefined ? false : undefined,
        },
    });
    await logActivity(req.user.id, 'task.updated', `${req.user.name} updated "${task.title}"`, task.id);
    res.json(updated);
});

tasksRouter.delete('/:id', async (req, res) => {
    const task = await getVisibleTask(req.user, req.params.id);
    if (!(await canManageTask(req.user, task))) throw forbidden('Only the person who assigned this task can delete it');
    await db.task.delete({ where: { id: task.id } });
    await logActivity(req.user.id, 'task.deleted', `${req.user.name} deleted "${task.title}"`, null, { subjectId: task.assigneeId });
    res.json({ ok: true });
});

// ---- Lifecycle ----

tasksRouter.post('/:id/start', async (req, res) => {
    const task = await getVisibleTask(req.user, req.params.id);
    assertAssignee(req.user, task);
    if (task.status === 'COMPLETED') throw badRequest('This task is already completed');
    if (task.status === 'BLOCKED') throw badRequest('This task is blocked until its issue is resolved');

    await stopTimers(req.user.id); // one running timer per person
    await db.timeLog.create({ data: { taskId: task.id, userId: req.user.id } });
    await db.task.update({
        where: { id: task.id },
        data: { status: 'IN_PROGRESS', startedAt: task.startedAt ?? new Date() },
    });
    const told = task.status === 'NEW' ? await overseers(task, req.user.id) : [];
    await notify(told, `Started: ${task.title}`, `${req.user.name} started working`, link(task.id));
    await logActivity(
        req.user.id,
        'task.started',
        `${req.user.name} ${task.status === 'NEW' ? 'started' : 'resumed'} "${task.title}"`,
        task.id,
        { notified: told },
    );
    res.json({ ok: true });
});

tasksRouter.post('/:id/stop', async (req, res) => {
    const task = await getVisibleTask(req.user, req.params.id);
    assertAssignee(req.user, task);
    if ((await stopTimers(req.user.id, task.id)) > 0) {
        await logActivity(req.user.id, 'task.paused', `${req.user.name} paused the timer on "${task.title}"`, task.id);
    }
    res.json({ ok: true });
});

tasksRouter.post('/:id/issues', async (req, res) => {
    const task = await getVisibleTask(req.user, req.params.id);
    assertAssignee(req.user, task);
    if (task.status === 'COMPLETED') throw badRequest('This task is already completed');
    const { description } = parse(z.object({ description: z.string().trim().min(1, 'Describe the issue') }), req.body);

    await stopTimers(req.user.id, task.id);
    const issue = await db.issue.create({ data: { taskId: task.id, reporterId: req.user.id, description } });
    await db.task.update({ where: { id: task.id }, data: { status: 'BLOCKED' } });
    const told = await overseers(task, req.user.id);
    await notify(told, `Blocked: ${task.title}`, `${req.user.name}: ${description}`, link(task.id));
    await logActivity(req.user.id, 'issue.reported', `${req.user.name} reported an issue on "${task.title}": ${description}`, task.id, {
        notified: told,
    });
    res.status(201).json(issue);
});

tasksRouter.post('/:id/issues/:issueId/resolve', async (req, res) => {
    const task = await getVisibleTask(req.user, req.params.id);
    if (!(await canManageTask(req.user, task))) throw forbidden('Only a manager, lead or the task creator can resolve issues');
    const { resolution } = parse(z.object({ resolution: z.string().default('') }), req.body);

    const issue = await db.issue.findFirst({ where: { id: req.params.issueId, taskId: task.id } });
    if (!issue) throw notFound('Issue not found');
    if (issue.status === 'RESOLVED') throw badRequest('This issue is already resolved');

    await db.issue.update({
        where: { id: issue.id },
        data: { status: 'RESOLVED', resolution, resolverId: req.user.id, resolvedAt: new Date() },
    });
    const stillOpen = await db.issue.count({ where: { taskId: task.id, status: 'OPEN' } });
    if (stillOpen === 0 && task.status === 'BLOCKED') {
        await db.task.update({ where: { id: task.id }, data: { status: 'IN_PROGRESS' } });
    }
    await logActivity(req.user.id, 'issue.resolved', `${req.user.name} resolved an issue on "${task.title}"`, task.id, {
        notified: [task.assigneeId],
    });
    await notify([task.assigneeId], `Issue resolved: ${task.title}`, resolution || 'You can continue working.', link(task.id));
    res.json({ ok: true });
});

tasksRouter.post('/:id/complete', async (req, res) => {
    const task = await getVisibleTask(req.user, req.params.id);
    assertAssignee(req.user, task);
    if (task.status === 'COMPLETED') throw badRequest('This task is already completed');
    if (task.status === 'BLOCKED') throw badRequest('Resolve the open issue before completing this task');
    const { finalNotes } = parse(z.object({ finalNotes: z.string().default('') }), req.body);

    await stopTimers(req.user.id, task.id);
    const done = await db.task.update({
        where: { id: task.id },
        data: { status: 'COMPLETED', completedAt: new Date(), finalNotes, startedAt: task.startedAt ?? new Date() },
    });
    const h = Math.floor(done.totalSeconds / 3600);
    const m = Math.floor((done.totalSeconds % 3600) / 60);
    const told = await overseers(task, req.user.id);
    await notify(told, `Completed: ${task.title}`, `${req.user.name} finished in ${h}h ${m}m`, link(task.id));
    await logActivity(req.user.id, 'task.completed', `${req.user.name} completed "${task.title}" in ${h}h ${m}m`, task.id, { notified: told });
    res.json(done);
});

tasksRouter.post('/:id/reopen', async (req, res) => {
    const task = await getVisibleTask(req.user, req.params.id);
    if (!(await canManageTask(req.user, task))) throw forbidden();
    if (task.status !== 'COMPLETED') throw badRequest('Only completed tasks can be reopened');
    await db.task.update({ where: { id: task.id }, data: { status: 'IN_PROGRESS', completedAt: null } });
    await logActivity(req.user.id, 'task.reopened', `${req.user.name} reopened "${task.title}"`, task.id, { notified: [task.assigneeId] });
    await notify([task.assigneeId], `Reopened: ${task.title}`, `Reopened by ${req.user.name}`, link(task.id));
    res.json({ ok: true });
});
