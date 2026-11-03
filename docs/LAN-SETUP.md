# Running FixFlow on your local network (LAN)

This guide sets up one Windows PC as the FixFlow server so everyone on the same office network can use it from their browser, on computers, tablets or phones. Nothing is installed on the other devices.

```
 Colleague's laptop ─┐
 Colleague's phone ──┼──►  http://<server-ip>:4000  ──►  Server PC (FixFlow + database + uploaded files)
 Manager's desktop ──┘
```

FixFlow runs as a single program on port **4000**: it serves the web app, the API, uploaded files and the reminder scheduler. All data is stored on the server PC (`server/prisma/dev.db` and `server/uploads/`).

---

## What you need

- A Windows PC that stays on during working hours (the "server PC").
- [Node.js 22 or newer](https://nodejs.org) installed on it. Check with `node -v`.
- The FixFlow project folder on that PC (this guide uses `E:\taskflow`; replace it with your path).
- All devices connected to the same network (same office router or Wi-Fi). Guest Wi-Fi networks usually block devices from reaching each other.

---

## Step 1: Prepare the project (first time only)

Open PowerShell in the project folder:

```powershell
cd E:\taskflow
npm install
```

Check the settings in `server\.env` (copy `server\.env.example` if the file doesn't exist):

| Setting | What to set |
| --- | --- |
| `JWT_SECRET` | A long random string. It signs everyone's login sessions; never share it. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `PORT` | `4000` (default). Change it only if that port is taken. |
| `SMTP_*` | Optional. Fill these in if you want notifications by email as well. |

If this is a fresh installation with no database yet, create it and the demo accounts:

```powershell
npm run setup
```

---

## Step 2: Build and start FixFlow

```powershell
npm run build
npm start
```

When it's ready you'll see:

```
FixFlow API listening on http://localhost:4000
  On your network:  http://192.168.20.113:4000
```

The **"On your network"** line is the address colleagues will use. Open it in a browser on the server PC first to confirm it works.

> Run `npm run build` again every time the app is updated, otherwise people get the old version of the screens.
>
> Don't run `npm run dev` at the same time: both use port 4000. `npm run dev` is for development only.

---

## Step 3: Allow FixFlow through Windows Firewall

Windows blocks incoming connections by default, so other devices can't reach port 4000 until you allow it.

Open **PowerShell as Administrator** (right-click → *Run as administrator*) and run:

```powershell
New-NetFirewallRule -DisplayName "FixFlow (port 4000)" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private,Domain
```

The rule applies to **Private** and **Domain** networks. Check that Windows treats your office network as Private: **Settings → Network & Internet → (your connection) → Network profile type → Private**.

<details>
<summary>Prefer clicking? Do it through the Firewall window instead</summary>

1. Start menu → **Windows Defender Firewall with Advanced Security**.
2. **Inbound Rules → New Rule…**
3. **Port** → **TCP**, specific local port **4000** → **Allow the connection**.
4. Tick **Domain** and **Private** → name it **FixFlow (port 4000)** → Finish.
</details>

---

## Step 4: Give the server PC a fixed address

Routers can hand out a different IP address after a restart, which would break everyone's bookmarks. Reserve the address once:

1. Find the server PC's MAC address: run `ipconfig /all` and note the **Physical Address** of the active adapter.
2. Sign in to your router's admin page (often `http://192.168.1.1` or `http://192.168.0.1`; it's printed on the router).
3. Find **DHCP reservation** (also called *Address reservation* or *Static lease*) and reserve the current IP (e.g. `192.168.20.113`) for that MAC address.

If you don't manage the router, ask your IT administrator to do this.

---

## Step 5: Connect from other devices

On any device on the same network, open:

**http://192.168.20.113:4000** (use the address from Step 2)

Bookmark it, or create a desktop shortcut. Phones and tablets work too; the layout adapts to small screens.

**Optional: a friendly name.** To use `http://fixflow:4000` instead of the IP, add this line to each computer's hosts file (`C:\Windows\System32\drivers\etc\hosts`, edited as Administrator), or ask IT to add a DNS entry on the router:

```
192.168.20.113   fixflow
```

---

## Step 6: Start FixFlow automatically

So FixFlow comes back on its own after a restart or power cut, register it with Windows Task Scheduler. The project includes `scripts\start-fixflow.cmd`, which starts FixFlow and writes its output to `logs\fixflow.log`.

In **PowerShell as Administrator**:

```powershell
$action   = New-ScheduledTaskAction -Execute "E:\taskflow\scripts\start-fixflow.cmd"
$trigger  = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
            -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName "FixFlow" -Action $action -Trigger $trigger -Settings $settings `
            -User "$env:USERDOMAIN\$env:USERNAME" -Password (Read-Host "Your Windows password") -RunLevel Limited
```

Your Windows password is needed so the task can run before anyone signs in. Task Scheduler stores it; it isn't written anywhere in the project.

Then:

- **Start it now:** `Start-ScheduledTask -TaskName "FixFlow"` (close any `npm start` window first).
- **Check it's running:** open the network address in a browser, or read `E:\taskflow\logs\fixflow.log`.
- **Stop it:** `Stop-ScheduledTask -TaskName "FixFlow"`. If the site still answers, stop the process holding the port:
  ```powershell
  Stop-Process -Id (Get-NetTCPConnection -LocalPort 4000 -State Listen).OwningProcess -Force
  ```
- **Remove it:** `Unregister-ScheduledTask -TaskName "FixFlow"`.

**Keep the PC awake:** Settings → System → Power → set **Sleep** to **Never** when plugged in. A sleeping PC drops everyone's connection and stops the reminder scheduler.

---

## Before your team starts using it

- **Remove or secure the demo accounts.** Every demo user has the password `Password@123`. In **Users**, create real accounts, then disable the demo ones or reset their passwords. Change the admin password under **My account**.
- **Use a strong `JWT_SECRET`** (Step 1). Changing it later signs everyone out, which is harmless.
- **Keep it on the LAN.** Don't forward port 4000 on the router to the internet. FixFlow uses plain HTTP, which is fine inside the office but not safe over the internet. For remote staff, use the office VPN.

---

## Updating FixFlow

1. Stop FixFlow (Step 6 *Stop it*, or close the `npm start` window). Updating while it runs can fail with `EPERM` errors because Windows locks files that are in use.
2. Replace the code (e.g. `git pull`, or copy the new files over, keeping `server\.env`, `server\prisma\dev.db` and `server\uploads`).
3. Run:
   ```powershell
   npm install
   npm run db:push -w server   # applies database changes; existing data is kept
   npm run build
   ```
4. Start it again: `Start-ScheduledTask -TaskName "FixFlow"` or `npm start`.

Back up first (next section) before every update.

---

## Backups

Everything FixFlow stores is in two places:

| What | Where |
| --- | --- |
| Database (users, tasks, chat, history…) | `server\prisma\dev.db` |
| Uploaded files and profile pictures | `server\uploads\` |

A simple daily backup to another drive (run in PowerShell, or schedule it with Task Scheduler for after hours):

```powershell
$dest = "D:\FixFlowBackups\$(Get-Date -Format yyyy-MM-dd)"
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item E:\taskflow\server\prisma\dev.db $dest
robocopy E:\taskflow\server\uploads "$dest\uploads" /E /NFL /NDL /NJH /NJS
```

Back up when nobody is working, so the database isn't copied mid-change. Keep copies on a different disk or a network share, not only on the server PC.

**To restore:** stop FixFlow, copy `dev.db` back to `server\prisma\` and the `uploads` folder back to `server\`, then start FixFlow.

---

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Works on the server PC but not on other devices | Firewall rule (Step 3); network profile is **Private**; devices are on the same network, not guest Wi-Fi; VPN software on the device isn't routing traffic elsewhere. Test from another PC with `Test-NetConnection 192.168.20.113 -Port 4000` (should say `TcpTestSucceeded : True`). |
| "This site can't be reached" everywhere | FixFlow isn't running. Start it and check the last lines of `logs\fixflow.log`. |
| `EADDRINUSE` in the log | Another copy is already using port 4000, often a forgotten `npm run dev` or a second `npm start`. Stop it (Step 6 *Stop it*). |
| Old screens after an update | `npm run build` wasn't run. Run it and restart FixFlow; users press Ctrl+F5 once. |
| The address stopped working after a restart | The PC got a new IP. Check the "On your network" line in the log and set up the reservation in Step 4. |
| Everyone was signed out | `JWT_SECRET` changed, or sessions expired after 7 days. Sign in again. |
| `EPERM: operation not permitted` while updating | FixFlow was still running. Stop it and repeat the update. |
| Reminders or recurring tasks didn't arrive | The PC was asleep or FixFlow was stopped at that time. Keep it awake (Step 6). |
| Desktop alerts can't be turned on from other devices | Browsers only allow desktop alerts on `https://` sites or on the server PC itself. The bell, pop-ups and sidebar numbers still work for everyone. |

---

## Quick reference

| Task | Command |
| --- | --- |
| Start manually | `npm start` |
| Rebuild after changes | `npm run build` |
| Start / stop the background task | `Start-ScheduledTask -TaskName "FixFlow"` / `Stop-ScheduledTask -TaskName "FixFlow"` |
| Find the server's address | `ipconfig`, or the "On your network" line in `logs\fixflow.log` |
| Test a connection from another PC | `Test-NetConnection <server-ip> -Port 4000` |
| Apply database changes after an update | `npm run db:push -w server` |
