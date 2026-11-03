import { Router } from 'express';
import { z } from 'zod';
import { isManagerRole, requireRole } from '../auth.js';
import { db } from '../db.js';
import { badRequest, parse } from '../http.js';
import { logActivity } from '../lib/activity.js';
import { notify } from '../lib/notify.js';
import { clientScope, projectScope } from '../lib/scope.js';

export const clientsRouter = Router();
export const projectsRouter = Router();

const attachmentSelect = {
    select: { id: true, originalName: true, size: true, mimeType: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
} as const;

async function assertManager(managerId?: string | null) {
    if (!managerId) return;
    const user = await db.user.findUnique({ where: { id: managerId } });
    if (!user || !(isManagerRole(user.role) || user.role === 'TEAM_LEAD')) {
        throw badRequest('Clients and projects can be assigned to a manager or team lead');
    }
}

// ---- Clients ----

clientsRouter.get('/', async (req, res) => {
    const clients = await db.client.findMany({
        where: await clientScope(req.user),
        include: {
            manager: { select: { id: true, name: true } },
            attachments: attachmentSelect,
            _count: { select: { projects: true, tasks: true } },
        },
        orderBy: { name: 'asc' },
    });
    res.json(clients);
});

const clientInput = z.object({
    name: z.string().trim().min(1),
    description: z.string().optional(),
    managerId: z.string().nullable().optional(),
});

clientsRouter.post('/', requireRole('ADMIN'), async (req, res) => {
    const data = parse(clientInput, req.body);
    await assertManager(data.managerId);
    const client = await db.client.create({
        data: { name: data.name, description: data.description ?? '', managerId: data.managerId || null },
    });
    await logActivity(req.user.id, 'client.created', `${req.user.name} created client ${client.name}`, null, {
        notified: client.managerId ? [client.managerId] : [],
    });
    if (client.managerId) await notify([client.managerId], `New client assigned: ${client.name}`, client.description, '/clients');
    res.status(201).json(client);
});

clientsRouter.put('/:id', requireRole('ADMIN'), async (req, res) => {
    const data = parse(clientInput, req.body);
    await assertManager(data.managerId);
    const before = await db.client.findUniqueOrThrow({ where: { id: String(req.params.id) } });
    const client = await db.client.update({
        where: { id: String(req.params.id) },
        data: { name: data.name, description: data.description ?? '', managerId: data.managerId || null },
    });
    if (client.managerId && client.managerId !== before.managerId) {
        await notify([client.managerId], `Client assigned to you: ${client.name}`, client.description, '/clients');
    }
    res.json(client);
});

clientsRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
    await db.client.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
});

// ---- Projects ----

projectsRouter.get('/', async (req, res) => {
    const projects = await db.project.findMany({
        where: await projectScope(req.user),
        include: {
            client: { select: { id: true, name: true } },
            manager: { select: { id: true, name: true } },
            attachments: attachmentSelect,
            _count: { select: { tasks: true } },
        },
        orderBy: { name: 'asc' },
    });
    res.json(projects);
});

const projectInput = z.object({
    name: z.string().trim().min(1),
    description: z.string().optional(),
    clientId: z.string().nullable().optional(),
    managerId: z.string().nullable().optional(),
});

projectsRouter.post('/', requireRole('ADMIN'), async (req, res) => {
    const data = parse(projectInput, req.body);
    await assertManager(data.managerId);
    const project = await db.project.create({
        data: {
            name: data.name,
            description: data.description ?? '',
            clientId: data.clientId || null,
            managerId: data.managerId || null,
        },
    });
    await logActivity(req.user.id, 'project.created', `${req.user.name} created project ${project.name}`, null, {
        notified: project.managerId ? [project.managerId] : [],
    });
    if (project.managerId) {
        await notify([project.managerId], `New project assigned: ${project.name}`, project.description, '/clients');
    }
    res.status(201).json(project);
});

projectsRouter.put('/:id', requireRole('ADMIN'), async (req, res) => {
    const data = parse(projectInput, req.body);
    await assertManager(data.managerId);
    const before = await db.project.findUniqueOrThrow({ where: { id: String(req.params.id) } });
    const project = await db.project.update({
        where: { id: String(req.params.id) },
        data: {
            name: data.name,
            description: data.description ?? '',
            clientId: data.clientId || null,
            managerId: data.managerId || null,
        },
    });
    if (project.managerId && project.managerId !== before.managerId) {
        await notify([project.managerId], `Project assigned to you: ${project.name}`, project.description, '/clients');
    }
    res.json(project);
});

projectsRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
    await db.project.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
});
