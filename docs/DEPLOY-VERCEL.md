# Deploying TaskFlow on Vercel (free, with Neon Postgres)

On Vercel, the web app is served from Vercel's CDN, the API runs as a serverless function (`api/index.ts`), and data lives in a Neon Postgres database. Uploaded files are stored in that database too. Everything is configured in `vercel.json`; you only connect the repository, add the database and set a few variables.

Compared with an always-on server ([DEPLOY.md](DEPLOY.md), [LAN-SETUP.md](LAN-SETUP.md)):

| | Vercel | Always-on server |
| --- | --- | --- |
| Cost | Free (Hobby plan + Neon free tier) | About $5/month, or your own PC |
| Upload size | 4 MB per file | 25 MB per file |
| Reminders and recurring tasks | Checked whenever someone has TaskFlow open (at most once a minute), plus a daily run at 06:00 UTC | Every minute |
| Storage | Neon free tier: 0.5 GB for data and files together | Disk size |

---

## Step 1: Create the project

1. Sign in at [vercel.com](https://vercel.com) with GitHub.
2. **Add New → Project →** import the TaskFlow repository.
3. Leave **Framework Preset** on *Other*, **Root Directory** on `./`, and the build settings untouched (they come from `vercel.json`).
4. The first deploy fails until the database and variables exist. That's expected.

## Step 2: Add the database

Project → **Storage → Create Database → Neon (Serverless Postgres)** → Free plan → pick the region closest to your team → connect it to **all environments**.

This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to the project. The build uses the unpooled one to create the tables.

## Step 3: Set the variables

Project → **Settings → Environment Variables**, for all environments:

| Name | Value |
| --- | --- |
| `JWT_SECRET` | A long random string (signs everyone's sessions) |
| `CRON_SECRET` | Another long random string (protects the daily reminder run) |
| `ADMIN_EMAIL` | The first admin's email |
| `ADMIN_PASSWORD` | At least 8 characters |
| `ADMIN_NAME` | The first admin's name |

Generate random strings with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Optional, for email notifications: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

## Step 4: Deploy

**Deployments →** open the latest one **→ Redeploy**. The build log should show:

```
Your database is now in sync with your Prisma schema.
Created admin account you@yourcompany.com. Sign in and add your team under Users.
```

Open the `.vercel.app` address and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Step 5 (optional): Your own domain

1. Project → **Settings → Domains → Add** → e.g. `taskflow.yourcompany.com`. Vercel shows a DNS record.
2. Add that record where your domain's DNS is managed. On Bluehost: **cPanel → Zone Editor → + CNAME Record**, name `taskflow`, record = the value Vercel shows.
3. HTTPS is set up automatically once the record is live (minutes to an hour).

---

## Updating

Push to `main` and Vercel redeploys. Each build applies changes from `server/prisma/schema.prisma` to the database and keeps existing data; a change that would delete data stops the build instead.

`ADMIN_PASSWORD` is only used on an empty database. Afterwards, change passwords under **My account**.

## Don't run the Vercel build on your own PC

`npm run build:vercel` generates the Postgres database client. On a PC running TaskFlow with SQLite, the local server then fails with *"the URL must start with the protocol `postgresql://`"*. Fix it with:

```powershell
npm run db:generate -w server
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Build log: `Set ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_NAME` or `ADMIN_PASSWORD must be set` | Add the variables (Step 3) and redeploy. |
| Build log: `Environment variable not found: DATABASE_URL` | The Neon database isn't connected to this environment (Step 2). |
| Every API call fails with `Missing environment variable JWT_SECRET` | Add `JWT_SECRET` and redeploy. |
| "The file is too large" | Files over 4 MB can't be uploaded on Vercel. Use an always-on server ([DEPLOY.md](DEPLOY.md)) for larger files. |
| A reminder arrived late | Expected on Vercel when nobody had TaskFlow open; see the table at the top. |
