import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { requireAuth } from './auth.js';
import { env } from './env.js';
import { errorHandler, forbidden } from './http.js';
import { activityRouter } from './routes/activity.js';
import { attachmentsRouter } from './routes/attachments.js';
import { avatarsRouter } from './lib/avatars.js';
import { authRouter } from './routes/auth.js';
import { chatRouter, ensureDefaultChannel } from './routes/chat.js';
import { clientsRouter, projectsRouter } from './routes/clients.js';
import { dashboardRouter } from './routes/dashboard.js';
import { notificationsRouter } from './routes/notifications.js';
import { reportsRouter } from './routes/reports.js';
import { calendarRouter, schedulesRouter } from './routes/schedules.js';
import { tasksRouter } from './routes/tasks.js';
import { teamsRouter } from './routes/teams.js';
import { usersRouter } from './routes/users.js';
import { tick } from './scheduler.js';

export const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
});

if (env.serverless) {
    // No always-on process: the scheduler runs on Vercel Cron and, between cron runs,
    // at most once a minute when a request comes in (the client polls notifications).
    let lastTick = 0;
    let channelChecked = false;
    app.get('/api/cron/tick', async (req, res) => {
        if (env.cronSecret && req.headers.authorization !== `Bearer ${env.cronSecret}`) throw forbidden();
        await tick();
        res.json({ ok: true });
    });
    app.use('/api', async (_req, _res, next) => {
        if (!channelChecked) {
            channelChecked = true;
            await ensureDefaultChannel().catch((err) => console.error('Could not create the default chat channel', err));
        }
        if (Date.now() - lastTick >= 60 * 1000) {
            lastTick = Date.now();
            await tick();
        }
        next();
    });
}

app.use('/api/auth', authRouter);
// Profile pictures are public (random file names) so <img> tags can load them without the auth header.
app.use('/api/avatars', avatarsRouter);

const api = express.Router();
api.use(requireAuth);
api.use('/users', usersRouter);
api.use('/teams', teamsRouter);
api.use('/clients', clientsRouter);
api.use('/projects', projectsRouter);
api.use('/tasks', tasksRouter);
api.use('/attachments', attachmentsRouter);
api.use('/schedules', schedulesRouter);
api.use('/calendar', calendarRouter);
api.use('/notifications', notificationsRouter);
api.use('/activity', activityRouter);
api.use('/dashboard', dashboardRouter);
api.use('/reports', reportsRouter);
api.use('/chat', chatRouter);
app.use('/api', api);

// In production the API also serves the built client (on Vercel the CDN serves it instead).
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (!env.serverless && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
        res.sendFile(path.join(clientDist, 'index.html'));
    });
}

app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
});
app.use(errorHandler);
