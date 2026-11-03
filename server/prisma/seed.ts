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

/** RESET_ADMIN=true: gives the first admin account the current ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME. */
async function resetAdmin() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? '';
    if (!email || password.length < 8) throw new Error('RESET_ADMIN needs ADMIN_EMAIL and an ADMIN_PASSWORD of at least 8 characters');
    const admin = await db.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } });
    if (!admin) throw new Error('RESET_ADMIN: there is no admin account to reset');
    const taken = await db.user.findUnique({ where: { email } });
    if (taken && taken.id !== admin.id) throw new Error(`RESET_ADMIN: ${email} already belongs to another user`);
    await db.user.update({
        where: { id: admin.id },
        data: {
            email,
            name: process.env.ADMIN_NAME?.trim() || admin.name,
            passwordHash: await bcrypt.hash(password, 10),
            active: true,
        },
    });
    console.log(`Reset admin account ${admin.email} → ${email}. Remove RESET_ADMIN from the project settings now.`);
}

async function main() {
    // The old EMPLOYEE role became ACCOUNTS_EXECUTIVE.
    const renamed = await db.user.updateMany({ where: { role: 'EMPLOYEE' }, data: { role: 'ACCOUNTS_EXECUTIVE' } });
    if (renamed.count) console.log(`Moved ${renamed.count} Employee account(s) to Accounts Executive.`);

    if (process.env.RESET_ADMIN === 'true' && (await db.user.count()) > 0) return resetAdmin();
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

    const admin = await user('Admin', 'admin@fixflow.local', 'ADMIN');
    const manager = await user('Maria Manager', 'manager@fixflow.local', 'MANAGER');
    const asstManager = await user('Aria Assistant', 'assistant@fixflow.local', 'ASSISTANT_MANAGER');
    const lead = await user('Liam Lead', 'lead@fixflow.local', 'TEAM_LEAD');
    const emp1 = await user('Emma Executive', 'emma@fixflow.local', 'SENIOR_ACCOUNTS_EXECUTIVE');
    const emp2 = await user('Noah Executive', 'noah@fixflow.local', 'ACCOUNTS_EXECUTIVE');
    const intern = await user('Ivy Intern', 'intern@fixflow.local', 'INTERN');

    const team = await db.team.create({
        data: {
            name: 'Delivery Team',
            description: 'Client delivery and support',
            managerId: manager.id,
        },
    });
    await db.user.updateMany({ where: { id: { in: [lead.id, emp1.id, emp2.id, intern.id] } }, data: { teamId: team.id } });

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
    console.log([admin, manager, asstManager, lead, emp1, emp2, intern].map((u) => `  ${u.role.padEnd(26)} ${u.email}`).join('\n'));
}

function nextWeekday(from: Date, days: number[]) {
    const d = new Date(from);
    while (!days.includes(d.getDay())) d.setDate(d.getDate() + 1);
    return d;
}

main().finally(() => db.$disconnect());
