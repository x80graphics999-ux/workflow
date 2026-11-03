import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { isStaffRole } from '../auth.js';
import { db } from '../db.js';
import { parse } from '../http.js';
import { activityScope } from './activity.js';

export const notificationsRouter = Router();

notificationsRouter.get('/', async (req, res) => {
    const [items, unread] = await Promise.all([
        db.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
        db.notification.count({ where: { userId: req.user.id, read: false } }),
    ]);
    res.json({ items, unread });
});

/** Unread notifications that belong to each sidebar page, keyed by the page's link. */
const SECTIONS: Record<string, Prisma.StringNullableFilter> = {
    tasks: { startsWith: '/tasks' },
    clients: { equals: '/clients' },
    calendar: { equals: '/calendar' },
};

/** Numbers for the sidebar: new things on each page since the user last looked. */
notificationsRouter.get('/counts', async (req, res) => {
    const unreadFor = (link: Prisma.StringNullableFilter) => db.notification.count({ where: { userId: req.user.id, read: false, link } });
    const [tasks, clients, calendar, activity] = await Promise.all([
        unreadFor(SECTIONS.tasks),
        unreadFor(SECTIONS.clients),
        unreadFor(SECTIONS.calendar),
        newActivityCount(req.user),
    ]);
    res.json({ tasks, clients, calendar, activity });
});

/** Work history entries by other people, in the user's scope, since their last visit to the page. */
async function newActivityCount(user: Express.Request['user']) {
    if (isStaffRole(user.role)) return 0;
    const { activitySeenAt } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { activitySeenAt: true } });
    if (!activitySeenAt) {
        // First time: start counting from now rather than flagging the whole history as new.
        await db.user.update({ where: { id: user.id }, data: { activitySeenAt: new Date() } });
        return 0;
    }
    return db.activity.count({
        where: { AND: [await activityScope(user), { createdAt: { gt: activitySeenAt } }, { OR: [{ actorId: null }, { actorId: { not: user.id } }] }] },
    });
}

/** Called when the user opens a page: clears that page's number (and the matching bell items). */
notificationsRouter.post('/seen', async (req, res) => {
    const { path } = parse(z.object({ path: z.string() }), req.body);
    const mark = (link: Prisma.StringNullableFilter) =>
        db.notification.updateMany({ where: { userId: req.user.id, read: false, link }, data: { read: true } });

    if (path === '/tasks') await mark(SECTIONS.tasks);
    else if (/^\/tasks\/[\w-]+$/.test(path)) await mark({ equals: path });
    else if (path === '/clients') await mark(SECTIONS.clients);
    else if (path === '/calendar') await mark(SECTIONS.calendar);
    else if (path === '/activity') {
        await mark({ equals: '/activity' });
        await db.user.update({ where: { id: req.user.id }, data: { activitySeenAt: new Date() } });
    }
    res.json({ ok: true });
});

notificationsRouter.post('/read-all', async (req, res) => {
    await db.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } });
    res.json({ ok: true });
});

notificationsRouter.post('/:id/read', async (req, res) => {
    await db.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { read: true } });
    res.json({ ok: true });
});
