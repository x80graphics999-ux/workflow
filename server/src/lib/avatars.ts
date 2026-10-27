import crypto from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { badRequest } from '../http.js';
import { removeFile, saveFile, sendFile } from './storage.js';

/** Profile pictures are stored as avatars/<random name> and served publicly under unguessable URLs. */
export const AVATAR_URL_PREFIX = '/api/avatars/';

const IMAGE_TYPES: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
};

export const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (IMAGE_TYPES[file.mimetype]) cb(null, true);
        else cb(badRequest('Profile pictures must be PNG, JPEG, WebP or GIF images'));
    },
});

/** Stores an uploaded picture and returns its public URL. */
export async function saveAvatar(file: Express.Multer.File) {
    const fileName = `${crypto.randomUUID()}${IMAGE_TYPES[file.mimetype]}`;
    await saveFile(`avatars/${fileName}`, file.buffer);
    return AVATAR_URL_PREFIX + fileName;
}

/** Deletes the file behind an avatar URL; ignores URLs that are not ours. */
export function removeAvatarFile(url: string | null | undefined) {
    if (!url?.startsWith(AVATAR_URL_PREFIX)) return;
    removeFile(`avatars/${path.basename(url)}`);
}

export const avatarsRouter = Router();

avatarsRouter.get('/:name', async (req, res) => {
    const name = path.basename(req.params.name);
    res.set('Cache-Control', 'public, max-age=2592000, immutable');
    await sendFile(res, `avatars/${name}`, path.extname(name));
});
