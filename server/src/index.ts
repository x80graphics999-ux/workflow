import os from 'node:os';
import { app } from './app.js';
import { env } from './env.js';
import { ensureDefaultChannel } from './routes/chat.js';
import { startScheduler } from './scheduler.js';

app.listen(env.port, () => {
    console.log(`TaskFlow API listening on http://localhost:${env.port}`);
    // Addresses other computers on the network can use (see docs/LAN-SETUP.md).
    const lan = Object.values(os.networkInterfaces())
        .flat()
        .filter((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'));
    lan.forEach((a) => console.log(`  On your network:  http://${a!.address}:${env.port}`));
    startScheduler();
    ensureDefaultChannel().catch((err) => console.error('Could not create the default chat channel', err));
});
