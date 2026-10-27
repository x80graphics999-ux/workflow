// On an empty database: creates the admin from ADMIN_EMAIL / ADMIN_PASSWORD when they are set (hosting),
// otherwise the demo organization with shared demo passwords (local development).
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

try {
    process.loadEnvFile();
} catch {
    // ignore
}

const db = new PrismaClient();
const PASSWORD = 'Password@123';

async function main() {
    if ((await db.user.count()) > 0) {
        console.log('Database already has users — skipping seed.');
        return;
    }

    // Hosted installs set ADMIN_EMAIL / ADMIN_PASSWORD: create only that admin, without the demo accounts.
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    // Never put the demo accounts (with their published password) on a public Vercel deployment.
    if (!adminEmail && process.env.VERCEL) throw new Error('Set ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_NAME in the Vercel project settings');
    if (adminEmail) {
        const adminPassword = process.env.ADMIN_PASSWORD ?? '';
        if (adminPassword.length < 8) throw new Error('ADMIN_PASSWORD must be set and at least 8 characters long');
        await db.user.create({
            data: {
                name: process.env.ADMIN_NAME?.trim() || 'Admin',
                email: adminEmail,
                role: 'ADMIN',
                passwordHash: await bcrypt.hash(adminPassword, 10),
            },
        });
        console.log(`Created admin account ${adminEmail}. Sign in and add your team under Users.`);
        return;
    }

    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const user = (name: string, email: string, role: string) =>
        db.user.create({ data: { name, email, role, passwordHash } });

    const admin = await user('Admin', 'admin@taskflow.local', 'ADMIN');
    const manager = await user('Maria Manager', 'manager@taskflow.local', 'MANAGER');
    const lead = await user('Liam Lead', 'lead@taskflow.local', 'TEAM_LEAD');
    const emp1 = await user('Emma Employee', 'emma@taskflow.local', 'EMPLOYEE');
    const emp2 = await user('Noah Employee', 'noah@taskflow.local', 'EMPLOYEE');

    const team = await db.team.create({
        data: {
            name: 'Delivery Team',
            description: 'Client delivery and support',
            managerId: manager.id,
            leadId: lead.id,
        },
    });
    await db.user.updateMany({ where: { id: { in: [lead.id, emp1.id, emp2.id] } }, data: { teamId: team.id } });

    const client = await db.client.create({
        data: { name: 'Acme Corp', description: 'Retail client', managerId: manager.id },
    });
    const project = await db.project.create({
        data: { name: 'Acme Website Refresh', description: 'Redesign and migrate the storefront', clientId: client.id, managerId: manager.id },
    });

    const day = 24 * 3600 * 1000;
    const tasks = [
        { title: 'Audit current storefront pages', assignee: emp1, creator: lead, status: 'COMPLETED', seconds: 5400 },
        { title: 'Prepare product data export', assignee: emp2, creator: manager, status: 'IN_PROGRESS', seconds: 2700 },
        { title: 'Set up staging environment', assignee: emp1, creator: lead, status: 'NEW', seconds: 0 },
    ];
    for (const t of tasks) {
        const task = await db.task.create({
            data: {
                title: t.title,
                description: `${t.title} for the Acme website refresh.`,
                assigneeId: t.assignee.id,
                teamId: team.id,
                creatorId: t.creator.id,
                clientId: client.id,
                projectId: project.id,
                status: t.status,
                totalSeconds: t.seconds,
                dueDate: new Date(Date.now() + 3 * day),
                startedAt: t.status === 'NEW' ? null : new Date(Date.now() - day),
                completedAt: t.status === 'COMPLETED' ? new Date() : null,
                finalNotes: t.status === 'COMPLETED' ? 'Audit document attached to the project.' : '',
            },
        });
        await db.activity.create({
            data: {
                actorId: t.creator.id,
                action: 'task.assigned',
                message: `${t.creator.name} assigned "${t.title}" to ${t.assignee.name}`,
                taskId: task.id,
            },
        });
    }

    // A weekly stand-up report every Monday and Thursday at 09:00, assigned to the lead.
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
    await db.schedule.create({
        data: {
            title: 'Weekly status report',
            description: 'Summarize team progress and blockers.',
            startAt: start,
            frequency: 'WEEKLY',
            weekdays: '1,4',
            recipientType: 'TEAM',
            recipientTeamId: team.id,
            assigneeId: lead.id,
            createdById: manager.id,
            nextRunAt: nextWeekday(start, [1, 4]),
        },
    });

    console.log(`Seeded demo data. Every account uses the password: ${PASSWORD}`);
    console.log([admin, manager, lead, emp1, emp2].map((u) => `  ${u.role.padEnd(10)} ${u.email}`).join('\n'));
}

function nextWeekday(from: Date, days: number[]) {
    const d = new Date(from);
    while (!days.includes(d.getDay())) d.setDate(d.getDate() + 1);
    return d;
}

main().finally(() => db.$disconnect());
