import fs from 'node:fs';
import path from 'node:path';
import type { Response } from 'express';
import { db } from '../db.js';
import { env } from '../env.js';

/** Uploaded files live in UPLOAD_DIR, or in the StoredFile table on hosts without a persistent disk (Vercel). */
const inDatabase = env.fileStorage === 'database';

if (!inDatabase) fs.mkdirSync(path.join(env.uploadDir, 'avatars'), { recursive: true });

const diskPath = (name: string) => path.join(env.uploadDir, name);

export async function saveFile(name: string, data: Buffer) {
    if (inDatabase) await db.storedFile.create({ data: { name, data: new Uint8Array(data) } });
    else await fs.promises.writeFile(diskPath(name), data);
}

export function removeFile(name: string) {
    if (inDatabase) db.storedFile.deleteMany({ where: { name } }).catch(() => {});
    else fs.rm(diskPath(name), { force: true }, () => {});
}

/** Sends a stored file; with `downloadName` the browser saves it instead of showing it. */
export async function sendFile(res: Response, name: string, type: string, downloadName?: string) {
    if (downloadName) res.attachment(downloadName);
    if (!inDatabase) {
        res.type(type).sendFile(diskPath(name), (err) => {
            if (err && !res.headersSent) res.status(404).json({ error: 'File not found' });
        });
        return;
    }
    const file = await db.storedFile.findUnique({ where: { name } });
    if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
    }
    res.type(type).send(Buffer.from(file.data));
}
