# TaskFlow — Employee Task Assistance & Workflow Platform

Task assignment, time tracking, blockers, recurring work, team chat and reporting for four roles: **Admin, Manager, Team Lead, Employee**. Branded for FixIT Consul-Tech.

## Quick start

Requires Node.js 22+.

```bash
npm install
npm run setup     # creates the SQLite database and demo data
npm run dev       # API on :4000, web app on http://localhost:5173
```

Demo accounts (password `Password@123` for all):

| Role      | Email                  |
| --------- | ---------------------- |
| Admin     | admin@taskflow.local   |
| Manager   | manager@taskflow.local |
| Team Lead | lead@taskflow.local    |
| Employee  | emma@taskflow.local    |
| Employee  | noah@taskflow.local    |

Change these passwords (or delete the demo users) before using it for real work.

**Production:** `npm run build && npm start`. The API serves the built web app on port 4000.

**Online (Railway or Render):** follow [docs/DEPLOY.md](docs/DEPLOY.md). The first deploy creates only the admin account you choose, not the demo accounts.

**Online for free (Vercel + Neon Postgres):** follow [docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md).

**Office network (LAN):** to let everyone on your network use TaskFlow from one PC, follow [docs/LAN-SETUP.md](docs/LAN-SETUP.md). It covers the firewall, a fixed address, starting automatically, updates and backups.

## What each role can do

| Capability                                                      | Admin | Manager       | Team Lead       | Employee |
| --------------------------------------------------------------- | ----- | ------------- | --------------- | -------- |
| Create users, set roles, reset passwords, disable accounts      | ✓     |               |                 |          |
| Create teams (manager + lead + members)                         | ✓     | view own      | view own        |          |
| Create clients / projects, assign to managers, attach documents | ✓     | view assigned | view manager's  |          |
| Assign tasks with notes and attachments                         | anyone | own teams    | own team        |          |
| Schedule future and recurring tasks and reminders                | ✓     | ✓             | ✓               |          |
| Dashboard                                                       | everyone | team performance | team progress | own tasks |
| Work history and Excel export                                   | all   | own teams     | own team        |          |
| Start/pause timer, report issues, complete tasks                 | own tasks | own tasks | own tasks     | ✓        |
| Resolve issues / blockers                                       | ✓     | ✓             | ✓               |          |
| Chat, create channels, direct messages, profile picture         | ✓     | ✓             | ✓               | ✓        |

## Task lifecycle

`New` → **Start** (timer runs) → `In progress` → **Report issue** → `Blocked` → manager/lead **Resolves** → `In progress` → **Complete** (final notes, total time recorded) → `Completed`.

Only one timer runs per person: starting a task pauses any other running timer. Each step is written to the activity log, and the people involved are notified.

## Calendar, recurring tasks and reminders

A schedule has a start date-time, a repeat rule (once, every N days, weeks on chosen weekdays, or months), and an optional end date.

- **Create a task for** (optional): at each occurrence the background scheduler creates a real task for that person, due `dueInHours` later.
- **Remind**: a specific person, a whole team, or everyone in the creator's scope, with an "upcoming" alert sent at the chosen lead time.
- Open tasks also get a one-time "due soon" or "overdue" alert within 24 hours of their due date.

The scheduler runs inside the API process every minute. Notifications appear in the bell icon. If `SMTP_*` is set in `server/.env`, they are also sent by email.

## Notifications and oversight alerts

Every event in the work history also alerts the people who oversee it:

- **Admins** are alerted about everything any user does: tasks assigned, started, paused, blocked, resolved, completed, reopened, edited or deleted; passwords changed or reset; users, teams, clients, projects and schedules created or changed.
- **Managers** get the same alerts for the teams they manage (the team of the person acting, the person affected, or the task's assignee).
- Nobody is alerted about their own actions, and people who already got a specific alert (for example, an assignee getting a new task) don't get a second one. These oversight alerts appear in the app only and aren't emailed.

The bell checks for new alerts every 15 seconds and whenever the tab regains focus. New alerts ring the bell, appear as pop-ups, and show the unread count in the browser tab title. Each user can turn on desktop alerts from the bell menu, so they still see alerts while the tab is in the background.

The sidebar shows a red number next to each page with something new: **Tasks** (tasks assigned, started, completed and so on), **Clients & projects** (new clients or projects assigned to you), **Calendar** (schedules and reminders), **Work history** (entries by other people since you last opened it) and **Chat** (unread messages). Opening a page clears its number. On phones, a red dot on the menu button shows there is something new.

## Chat

Everyone can use **Chat** in the sidebar:

- **Channels**: public channels are open to everyone (browse them under "Other channels" and join). Private channels are visible only to their members. Anyone can create a channel and add people; the creator or an admin can rename, make private, remove members or delete it.
- **Direct messages**: one-to-one conversations with any active colleague.
- `#general` is created automatically the first time the API starts, with every user in it. New users join it when they are created.
- New messages appear within a few seconds (the page polls), and unread counts show in the sidebar.

## Profile pictures

Each user can upload a photo (PNG, JPEG, WebP or GIF, up to 2 MB) under **My account**. Without a photo, the app shows the person's initials. Pictures are stored in `server/uploads/avatars` and served under random file names.

## Branding

The logo (`client/public/logo.png`), favicons and colour palette come from fixitconsultech.com. Colours are defined once in `client/src/index.css` (`brand-*` is the logo blue #2174BA, `accent-*` the logo red #C20B0B).

## Project layout

```
server/                 Express 5 + Prisma (SQLite) API
  prisma/schema.prisma  data model
  prisma/seed.ts        demo data
  src/lib/scope.ts      role-based visibility rules (who sees and assigns whom)
  src/lib/recurrence.ts repeat rules
  src/scheduler.ts      recurring task creation and reminders
  src/routes/           REST endpoints (chat.ts = channels, direct messages)
client/                 React 19 + Vite + Tailwind 4 web app
```

## Switching to PostgreSQL

In `server/prisma/schema.prisma`, set `provider = "postgresql"`. Then set `DATABASE_URL` in `server/.env` to your Postgres URL and run `npm run setup`.
