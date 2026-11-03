import { Router } from 'express';
import { z } from 'zod';
import { isManagerRole, requireRole } from '../auth.js';
import { db } from '../db.js';
import { badRequest, parse } from '../http.js';
import { logActivity } from '../lib/activity.js';
import { visibleTeamIds } from '../lib/scope.js';

export const teamsRouter = Router();

const teamInclude = {
    manager: { select: { id: true, name: true } },
    members: { select: { id: true, name: true, role: true, avatarUrl: true }, orderBy: { name: 'asc' } },
} as const;

teamsRouter.get('/', async (req, res) => {
    const ids = await visibleTeamIds(req.user);
    const teams = await db.team.findMany({
        where: ids ? { id: { in: ids } } : {},
        include: teamInclude,
        orderBy: { name: 'asc' },
    });
    res.json(teams);
});

const teamInput = z.object({
    name: z.string().trim().min(1),
    description: z.string().optional(),
    managerId: z.string().nullable().optional(),
    memberIds: z.array(z.string()).optional(),
});

async function validateManager(managerId?: string | null) {
    if (managerId) {
        const m = await db.user.findUnique({ where: { id: managerId } });
        if (!m || !isManagerRole(m.role)) throw badRequest('The selected manager must have the Manager or Assistant Manager role');
    }
}

async function saveTeam(id: string | null, data: z.infer<typeof teamInput>) {
    await validateManager(data.managerId);
    const fields = {
        name: data.name,
        description: data.description ?? '',
        managerId: data.managerId || null,
        leadId: null, // teams no longer have a separate lead; Team Leads are members
    };
    return db.$transaction(async (tx) => {
        const team = id ? await tx.team.update({ where: { id }, data: fields }) : await tx.team.create({ data: fields });
        if (data.memberIds) {
            const memberIds = new Set(data.memberIds);
            await tx.user.updateMany({ where: { teamId: team.id, id: { notIn: [...memberIds] } }, data: { teamId: null } });
            await tx.user.updateMany({ where: { id: { in: [...memberIds] } }, data: { teamId: team.id } });
        }
        return tx.team.findUniqueOrThrow({ where: { id: team.id }, include: teamInclude });
    });
}

teamsRouter.post('/', requireRole('ADMIN'), async (req, res) => {
    const team = await saveTeam(null, parse(teamInput, req.body));
    await logActivity(req.user.id, 'team.created', `${req.user.name} created team ${team.name}`);
    res.status(201).json(team);
});

teamsRouter.put('/:id', requireRole('ADMIN'), async (req, res) => {
    const team = await saveTeam(String(req.params.id), parse(teamInput, req.body));
    await logActivity(req.user.id, 'team.updated', `${req.user.name} updated team ${team.name}`);
    res.json(team);
});

teamsRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
    await db.team.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
});
