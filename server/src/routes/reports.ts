import ExcelJS from 'exceljs';
import { Router } from 'express';
import { z } from 'zod';
import { OVERSEER_ROLES, requireRole } from '../auth.js';
import { db } from '../db.js';
import { parse } from '../http.js';
import { taskScope } from '../lib/scope.js';
import { activityScope } from './activity.js';

export const reportsRouter = Router();

const duration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
};

const STATUS_LABEL: Record<string, string> = {
    NEW: 'New',
    IN_PROGRESS: 'In progress',
    BLOCKED: 'Blocked',
    COMPLETED: 'Completed',
};

reportsRouter.get('/tasks.xlsx', requireRole(...OVERSEER_ROLES), async (req, res) => {
    const f = parse(
        z.object({
            from: z.string().optional(),
            to: z.string().optional(),
            assigneeId: z.string().optional(),
            projectId: z.string().optional(),
            clientId: z.string().optional(),
            status: z.string().optional(),
        }),
        req.query,
    );
    const range = {
        ...(f.from ? { gte: new Date(f.from) } : {}),
        ...(f.to ? { lte: new Date(`${f.to}T23:59:59`) } : {}),
    };

    const tasks = await db.task.findMany({
        where: {
            AND: [
                await taskScope(req.user),
                f.from || f.to ? { createdAt: range } : {},
                f.assigneeId ? { assigneeId: f.assigneeId } : {},
                f.projectId ? { projectId: f.projectId } : {},
                f.clientId ? { clientId: f.clientId } : {},
                f.status ? { status: f.status } : {},
            ],
        },
        include: {
            assignee: { select: { name: true, team: { select: { name: true } } } },
            creator: { select: { name: true } },
            client: { select: { name: true } },
            project: { select: { name: true } },
            issues: { select: { description: true, status: true, resolution: true } },
        },
        orderBy: { createdAt: 'asc' },
    });

    const activity = await db.activity.findMany({
        where: {
            AND: [
                await activityScope(req.user),
                f.from || f.to ? { createdAt: range } : {},
                f.assigneeId ? { OR: [{ actorId: f.assigneeId }, { task: { assigneeId: f.assigneeId } }] } : {},
            ],
        },
        include: { actor: { select: { name: true } }, task: { select: { title: true } } },
        orderBy: { createdAt: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'TaskFlow';

    const sheet = wb.addWorksheet('Tasks', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
        { header: 'Assigned on', key: 'createdAt', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
        { header: 'Title', key: 'title', width: 32 },
        { header: 'Description', key: 'description', width: 50 },
        { header: 'Client', key: 'client', width: 20 },
        { header: 'Project', key: 'project', width: 22 },
        { header: 'Assigned by', key: 'creator', width: 20 },
        { header: 'Assigned to', key: 'assignee', width: 20 },
        { header: 'Team', key: 'team', width: 18 },
        { header: 'Priority', key: 'priority', width: 10 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Due', key: 'dueDate', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
        { header: 'Started', key: 'startedAt', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
        { header: 'Completed', key: 'completedAt', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
        { header: 'Time spent', key: 'duration', width: 12 },
        { header: 'Hours', key: 'hours', width: 8, style: { numFmt: '0.00' } },
        { header: 'Issues', key: 'issues', width: 45 },
        { header: 'Notes', key: 'notes', width: 35 },
        { header: 'Final notes', key: 'finalNotes', width: 35 },
    ];
    for (const t of tasks) {
        sheet.addRow({
            createdAt: t.createdAt,
            title: t.title,
            description: t.description,
            client: t.client?.name ?? '',
            project: t.project?.name ?? '',
            creator: t.creator.name,
            assignee: t.assignee.name,
            team: t.assignee.team?.name ?? '',
            priority: t.priority,
            status: STATUS_LABEL[t.status] ?? t.status,
            dueDate: t.dueDate,
            startedAt: t.startedAt,
            completedAt: t.completedAt,
            duration: duration(t.totalSeconds),
            hours: Math.round((t.totalSeconds / 3600) * 100) / 100,
            issues: t.issues
                .map((i) => `[${i.status}] ${i.description}${i.resolution ? ` → ${i.resolution}` : ''}`)
                .join('\n'),
            notes: t.notes,
            finalNotes: t.finalNotes,
        });
    }
    const total = tasks.reduce((n, t) => n + t.totalSeconds, 0);
    const totalRow = sheet.addRow({ title: `Total (${tasks.length} tasks)`, duration: duration(total), hours: total / 3600 });
    totalRow.font = { bold: true };

    const history = wb.addWorksheet('Assignment history', { views: [{ state: 'frozen', ySplit: 1 }] });
    history.columns = [
        { header: 'When', key: 'createdAt', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
        { header: 'Who', key: 'actor', width: 20 },
        { header: 'Action', key: 'action', width: 18 },
        { header: 'Task', key: 'task', width: 32 },
        { header: 'Details', key: 'message', width: 70 },
    ];
    for (const a of activity) {
        history.addRow({
            createdAt: a.createdAt,
            actor: a.actor?.name ?? 'System',
            action: a.action,
            task: a.task?.title ?? '',
            message: a.message,
        });
    }

    for (const ws of [sheet, history]) {
        const header = ws.getRow(1);
        header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5D50' } };
        ws.eachRow((row) => (row.alignment = { vertical: 'top', wrapText: true }));
    }

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="taskflow-report-${stamp}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
});
