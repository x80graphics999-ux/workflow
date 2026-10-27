# Deploying TaskFlow online (Railway or Render)

TaskFlow runs as one always-on Node.js server with a SQLite database and an uploads folder. Hosting it needs a platform with a **persistent disk**, so the database and files survive restarts and deploys. Railway (recommended) and Render both do this; the project includes ready-made config for each (`railway.json`, `render.yaml`).

> **Prefer a free host?** TaskFlow also runs on Vercel with a free Neon Postgres database, with smaller uploads and less frequent reminders. See [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md).

The first deploy creates an empty database with **one admin account that you choose**. The demo accounts are not created online.

---

## Step 1: Put the code on GitHub

Both hosts deploy from a GitHub repository. In the project folder:

```powershell
git add .
git commit -m "TaskFlow"
```

Create an empty **private** repository on [github.com/new](https://github.com/new), then push to it:

```powershell
git branch -M main
git remote add origin https://github.com/<your-account>/taskflow.git
git push -u origin main
```

Your local database, `.env` secrets, uploads and logs are excluded by `.gitignore` and are not uploaded.

---

## Step 2 (Railway): Create the service

1. Sign in at [railway.com](https://railway.com) with GitHub. The Hobby plan (about $5/month, usage included) is enough for a team.
2. **New Project → Deploy from GitHub repo →** choose your `taskflow` repository.
   Railway reads `railway.json` for the build and start commands; you don't need to type them.
3. The first build may fail before the variables are set. That's expected; continue with the next steps.

### Add a volume (persistent disk)

In the project canvas, right-click the service (or press ⌘K / Ctrl+K) → **Attach Volume** → set **Mount path** to:

```
/data
```

### Set the variables

Open the service → **Variables** → **Raw Editor**, and paste (with your own values):

```
DATABASE_URL=file:/data/taskflow.db
UPLOAD_DIR=/data/uploads
JWT_SECRET=<a long random string>
ADMIN_EMAIL=you@yourcompany.com
ADMIN_PASSWORD=<at least 8 characters>
ADMIN_NAME=Your Name
```

Generate a `JWT_SECRET` with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Optional, for email notifications: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

### Get a web address

Service → **Settings → Networking → Generate Domain**. You get an address like `https://taskflow-production.up.railway.app`. You can add your own domain on the same screen.

### Deploy

Click **Deploy** (or redeploy the latest build). In **Deployments → View logs** you should see:

```
Your database is now in sync with your Prisma schema.
Created admin account you@yourcompany.com. Sign in and add your team under Users.
TaskFlow API listening on http://localhost:8080
```

Open your domain, sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`, then add your team under **Users** and **Teams**.

---

## Step 2 (Render, alternative): Create the service

Render needs a paid instance (**Starter** or above) for a persistent disk. On the free plan, all data is wiped on every restart.

1. Sign in at [render.com](https://render.com) with GitHub.
2. **New → Blueprint →** choose the `taskflow` repository. Render reads `render.yaml`: a web service with a 1 GB disk at `/var/data`, and a generated `JWT_SECRET`.
3. When asked, fill in `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_NAME`, then **Apply**.
4. Open the `onrender.com` address once the deploy is live and sign in.

---

## After the first deploy

- **`ADMIN_PASSWORD` is only used once**, to create the first admin on an empty database. Changing it later does nothing; change your password under **My account** instead. You can delete the `ADMIN_*` variables after the first sign-in.
- **Keep one instance.** Don't scale TaskFlow to multiple replicas: SQLite and the reminder scheduler expect a single server.
- **HTTPS is automatic**, so everyone can also turn on desktop alerts from the bell menu.
- **Upload limit:** files up to 25 MB, profile pictures up to 2 MB. They are stored on the volume; 1 GB holds a lot of documents, and you can grow the volume later.

## Updating

Push to GitHub (`git push`) and the host rebuilds and redeploys automatically. On start, TaskFlow applies database changes from `prisma/schema.prisma` and keeps existing data. If a change would delete data (e.g. dropping a column), the deploy stops with an error instead of losing anything; decide how to migrate that data before deploying it.

## Backups

All data lives on the volume: `taskflow.db` (everything except files) and `uploads/`.

- **Railway:** open the volume → **Backups** to create or schedule snapshots.
- **Render:** disks get automatic daily snapshots; restore them from the service's **Disks** page.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Deploy log: `ADMIN_PASSWORD must be set and at least 8 characters long` | Add `ADMIN_PASSWORD` (8+ characters) and redeploy. |
| Deploy log: `Missing environment variable JWT_SECRET` | Add `JWT_SECRET` and redeploy. |
| Health check failed | Open the deploy logs; the last lines say why the server didn't start (usually one of the two above). |
| Data disappears after each deploy | The volume isn't attached, or `DATABASE_URL` / `UPLOAD_DIR` don't point inside it (`/data/...` on Railway, `/var/data/...` on Render). |
| Can't sign in as `admin@taskflow.local` | Expected: demo accounts aren't created online. Use your `ADMIN_EMAIL`. |
| Everyone was signed out | `JWT_SECRET` changed. Sign in again. |

## Local development is unchanged

`npm run dev`, `npm run setup` (demo data) and the LAN setup in [LAN-SETUP.md](LAN-SETUP.md) work exactly as before. The hosting-only commands are `npm run build:deploy` and `npm run start:deploy`.
