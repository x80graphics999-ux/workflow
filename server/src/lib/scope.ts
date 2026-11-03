import type { Prisma } from '@prisma/client';
import { isManagerRole, isStaffRole, STAFF_ROLES, type AuthUser } from '../auth.js';
import { db } from '../db.js';
import { forbidden, notFound } from '../http.js';

/**
 * Ids of users whose work `user` can see, or null for "everyone" (admin).
 * Manager / assistant manager → every member of the teams they manage. Team lead → every member of their own team.
 * Senior accounts executive, accounts executive, intern → only themselves.
 */
export async function visibleUserIds(user: AuthUser): Promise<string[] | null> {
    if (user.role === 'ADMIN') return null;
    if (isStaffRole(user.role)) return [user.id];

    const teams = await db.team.findMany({
        where: isManagerRole(user.role) ? { managerId: user.id } : { id: user.teamId ?? '__none__' },
        select: { members: { select: { id: true } } },
    });
    const ids = new Set<string>([user.id]);
    for (const t of teams) t.members.forEach((m) => ids.add(m.id));
    return [...ids];
}

/** Team ids the user manages (manager) or belongs to (lead, staff). Null = all. */
export async function visibleTeamIds(user: AuthUser): Promise<string[] | null> {
    if (user.role === 'ADMIN') return null;
    if (!isManagerRole(user.role)) return user.teamId ? [user.teamId] : [];
    const teams = await db.team.findMany({ where: { managerId: user.id }, select: { id: true } });
    return teams.map((t) => t.id);
}

/** Users this person may hand a task to. Staff roles cannot assign. */
export async function assignableUsers(user: AuthUser) {
    if (isStaffRole(user.role)) return [];
    const ids = await visibleUserIds(user);
    return db.user.findMany({
        where: {
            active: true,
            id: ids ? { in: ids.filter((id) => id !== user.id) } : { not: user.id },
            ...(user.role === 'ADMIN' ? {} : { role: { in: ['TEAM_LEAD', ...STAFF_ROLES] } }),
        },
        select: { id: true, name: true, role: true, teamId: true },
        orderBy: { name: 'asc' },
    });
}

export async function assertCanAssign(user: AuthUser, assigneeId: string) {
    const allowed = await assignableUsers(user);
    if (!allowed.some((u) => u.id === assigneeId)) throw forbidden('You cannot assign work to this user');
}

/** Prisma filter for tasks visible to the user: their scope's assignees plus anything they created. */
export async function taskScope(user: AuthUser): Promise<Prisma.TaskWhereInput> {
    const ids = await visibleUserIds(user);
    if (!ids) return {};
    return { OR: [{ assigneeId: { in: ids } }, { creatorId: user.id }] };
}

export async function getVisibleTask(user: AuthUser, taskId: string) {
    const task = await db.task.findFirst({ where: { AND: [{ id: taskId }, await taskScope(user)] } });
    if (!task) throw notFound('Task not found');
    return task;
}

/** True when the user oversees the task (creator, admin, or manager/lead whose scope includes the assignee). */
export async function canManageTask(user: AuthUser, task: { creatorId: string; assigneeId: string }) {
    if (user.role === 'ADMIN' || task.creatorId === user.id) return true;
    if (isStaffRole(user.role)) return false;
    const ids = await visibleUserIds(user);
    return !!ids && ids.includes(task.assigneeId) && task.assigneeId !== user.id;
}

async function leadManagerIds(user: AuthUser) {
    const team = user.teamId ? await db.team.findUnique({ where: { id: user.teamId }, select: { managerId: true } }) : null;
    // The lead's own id is included so clients/projects assigned directly to them show up too.
    return [user.id, ...(team?.managerId ? [team.managerId] : [])];
}

/** Clients visible to the user: admin all, manager the ones assigned to them, lead their own and their manager's. */
export async function clientScope(user: AuthUser): Promise<Prisma.ClientWhereInput> {
    if (user.role === 'ADMIN') return {};
    if (isManagerRole(user.role)) return { managerId: user.id };
    if (user.role === 'TEAM_LEAD') return { managerId: { in: await leadManagerIds(user) } };
    return { id: '__none__' };
}

export async function projectScope(user: AuthUser): Promise<Prisma.ProjectWhereInput> {
    if (user.role === 'ADMIN') return {};
    if (isStaffRole(user.role)) return { id: '__none__' };
    const managerIds = isManagerRole(user.role) ? [user.id] : await leadManagerIds(user);
    return { OR: [{ managerId: { in: managerIds } }, { client: { managerId: { in: managerIds } } }] };
}
