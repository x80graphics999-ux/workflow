import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, signToken } from '../auth.js';
import { db } from '../db.js';
import { badRequest, HttpError, parse } from '../http.js';
import { logActivity } from '../lib/activity.js';
import { avatarUpload, removeAvatarFile, saveAvatar } from '../lib/avatars.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
    const { email, password } = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        throw new HttpError(401, 'Incorrect email or password');
    }
    if (!user.active) throw new HttpError(401, 'Account is disabled');
    res.json({ token: signToken(user.id) });
});

authRouter.get('/me', requireAuth, async (req, res) => {
    const team = req.user.teamId ? await db.team.findUnique({ where: { id: req.user.teamId } }) : null;
    res.json({ ...req.user, team });
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = parse(
        z.object({ currentPassword: z.string(), newPassword: z.string().min(8) }),
        req.body,
    );
    const user = await db.user.findUniqueOrThrow({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw badRequest('Current password is incorrect');
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
    await logActivity(user.id, 'user.password_changed', `${user.name} changed their password`);
    res.json({ ok: true });
});

authRouter.post('/avatar', requireAuth, avatarUpload.single('avatar'), async (req, res) => {
    if (!req.file) throw badRequest('Choose an image to upload');
    const avatarUrl = await saveAvatar(req.file);
    await db.user.update({ where: { id: req.user.id }, data: { avatarUrl } });
    removeAvatarFile(req.user.avatarUrl);
    res.json({ avatarUrl });
});

authRouter.delete('/avatar', requireAuth, async (req, res) => {
    await db.user.update({ where: { id: req.user.id }, data: { avatarUrl: null } });
    removeAvatarFile(req.user.avatarUrl);
    res.json({ avatarUrl: null });
});
