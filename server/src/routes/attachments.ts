import crypto from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import type { AuthUser } from '../auth.js';
import { db } from '../db.js';
import { env } from '../env.js';
import { badRequest, forbidden, notFound } from '../http.js';
import { logActivity } from '../lib/activity.js';
import { clientScope, getVisibleTask, projectScope } from '../lib/scope.js';
import { removeFile, saveFile, sendFile } from '../lib/storage.js';

export const attachmentsRouter = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.maxUploadBytes, files: 10 },
});

type Target = { taskId?: string | null; projectId?: string | null; clientId?: string | null };

/** Read access follows the thing the file is attached to. */
async function assertCanRead(user: AuthUser, t: Target) {
    if (t.taskId) return void (await getVisibleTask(user, t.taskId));
    if (t.projectId) {
        const ok = await db.project.count({ where: { AND: [{ id: t.projectId }, await projectScope(user)] } });
        if (!ok) throw forbidden();
        return;
    }
    if (t.clientId) {
        const ok = await db.client.count({ where: { AND: [{ id: t.clientId }, await clientScope(user)] } });
        if (!ok) throw forbidden();
        return;
    }
    throw notFound();
}

/** Anyone who can see a task may attach to it; client and project documents are managed by admins. */
async function assertCanWrite(user: AuthUser, t: Target) {
    if (t.taskId) return assertCanRead(user, t);
    if (user.role !== 'ADMIN') throw forbidden('Only admins can attach client or project documents');
}

attachmentsRouter.post('/', upload.array('files'), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const target: Target = {
        taskId: req.body.taskId || null,
        projectId: req.body.projectId || null,
        clientId: req.body.clientId || null,
    };
    if (files.length === 0) throw badRequest('No files were uploaded');
    if ([target.taskId, target.projectId, target.clientId].filter(Boolean).length !== 1) {
        throw badRequest('Attach files to exactly one task, project or client');
    }
    await assertCanWrite(req.user, target);

    const storedNames = files.map((f) => `${crypto.randomUUID()}${path.extname(f.originalname)}`);
    await Promise.all(files.map((f, i) => saveFile(storedNames[i], f.buffer)));
    const saved = await db.$transaction(
        files.map((f, i) =>
            db.attachment.create({
                data: {
                    ...target,
                    storedName: storedNames[i],
                    originalName: f.originalname,
                    mimeType: f.mimetype,
                    size: f.size,
                    uploaderId: req.user.id,
                },
            }),
        ),
    );
    if (target.taskId) {
        await logActivity(req.user.id, 'task.attachment', `${req.user.name} attached ${files.length} file(s)`, target.taskId);
    }
    res.status(201).json(saved);
});

attachmentsRouter.get('/:id/download', async (req, res) => {
    const file = await db.attachment.findUnique({ where: { id: req.params.id } });
    if (!file) throw notFound('File not found');
    await assertCanRead(req.user, file);
    await sendFile(res, file.storedName, file.mimeType, file.originalName);
});

attachmentsRouter.delete('/:id', async (req, res) => {
    const file = await db.attachment.findUnique({ where: { id: req.params.id } });
    if (!file) throw notFound('File not found');
    if (file.uploaderId !== req.user.id && req.user.role !== 'ADMIN') throw forbidden('Only the uploader can remove this file');
    await db.attachment.delete({ where: { id: file.id } });
    removeFile(file.storedName);
    res.json({ ok: true });
});
