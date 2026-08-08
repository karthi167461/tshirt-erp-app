# Installing Company ERP on the office (client) PC

This guide sets up the ERP on **one Windows PC** at the shop/office. That PC runs
the app and database and stays on during work hours. Everyone else — phones,
tablets, other computers — just opens a web link in their browser. No app to
install on the phones.

> You only do Parts A–C **once**, on the office PC. After that it starts by
> itself every time the PC is turned on.

---

## What you need

- One **Windows 10/11 PC** that stays on during work hours (the "server").
- A **Wi-Fi router** the PC and all phones connect to.
- About **20 minutes** for the first-time setup.

---

## Part A — Install Node.js (one time)

1. On the office PC, open https://nodejs.org
2. Download the **LTS** version and install it (click Next → Next → Finish).
3. To confirm, open **PowerShell** and type:
   ```powershell
   node --version
   ```
   You should see a version like `v22.x`. If yes, Node is installed.

---

## Part B — Copy the app to the office PC

1. Copy the whole **`company app`** folder onto the office PC — for example to
   `C:\CompanyERP`.
   *(You can delete the `node_modules` folders before copying to make it smaller;
   the installer downloads them again.)*
2. Remember where you put it.

---

## Part C — Run the installer

1. Click **Start**, type **PowerShell**, **right-click → Run as administrator**.
2. Go to the app folder (use your real path):
   ```powershell
   cd "C:\CompanyERP"
   ```
3. Allow the script to run for this window, then run it:
   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\scripts\install-service.ps1
   ```

The script automatically:
- installs everything the app needs,
- creates the database,
- builds the app,
- opens the firewall so phones can connect,
- installs the **CompanyERP** background service that **starts on every boot**.

When it finishes it prints two links, for example:
```
Open on this PC:       http://localhost:4000
Open on other devices: http://192.168.1.50:4000
```
**Write down the second link** — that's what phones will use.

---

## Part D — Open the app and connect devices

- **On the office PC:** open a browser and go to `http://localhost:4000`
- **On a phone/tablet/other PC (same Wi-Fi):** open the browser and go to the
  second link, e.g. `http://192.168.1.50:4000`

Tip: on a phone, use the browser menu **"Add to Home screen"** to get an app-like
icon.

---

## Part E — First-time settings

1. Open the app → go to **Settings** (⚙️). The default PIN is **`1234`**.
2. Change these:
   - **Admin PIN** — set your own (this protects Settings and Salary).
   - **Company name** and **Theme color**.
   - **Prices per dozen** — Cutting, QC, Packing.
   - **Stretching types** — add each type and its amount per dozen.
   - **Employees** — add each worker and their section.
3. Now the shop can start entering work: **Cutting → Stretching → QC → Packing**.

---

## Part F — Daily backup to Telegram (optional but recommended)

The app already keeps 30 days of backups on the PC automatically. To also send a
daily copy to your Telegram:

1. In Telegram, search **@BotFather**, send `/newbot`, follow the steps, and copy
   the **bot token** it gives you.
2. Get your **chat id**: message **@userinfobot** in Telegram; it replies with
   your id. (For a group, add the bot to the group and use the group id.)
3. On the office PC, open `server\.env` in Notepad and fill in:
   ```
   TELEGRAM_BOT_TOKEN="paste-token-here"
   TELEGRAM_CHAT_ID="paste-id-here"
   ```
4. Restart the service (PowerShell as admin):
   ```powershell
   Restart-Service CompanyERP
   ```
5. Test it: in the app go to **Settings → Backup → Backup now**. You should get
   the backup file in your Telegram chat.

Backups run automatically every day at **10:30 PM** (change `BACKUP_CRON` in
`server\.env` if you want a different time).

---

## Part G — Give the PC a fixed address (recommended)

So the phone link never changes, give the office PC a **static IP** or a **DHCP
reservation** in your Wi-Fi router settings. Ask whoever set up your internet, or
search your router model + "DHCP reservation". Then the `http://…:4000` link
stays the same forever.

---

## Check that auto-start works

1. **Restart the office PC.**
2. Without opening anything, go to a phone and open the link again.
3. If the app loads, auto-start is working. 🎉

---

## Everyday use

- Just keep the office PC on. The app is always running.
- Staff open the link on their phones and enter their work.
- Salary is weekly — open **Salary**, pick the employee and week.

---

## Managing the service (PowerShell as administrator)

| Task | Command |
|---|---|
| Check it's running | `Get-Service CompanyERP` |
| Stop it | `Stop-Service CompanyERP` |
| Start it | `Start-Service CompanyERP` |
| Restart it | `Restart-Service CompanyERP` |
| Remove it | `.\scripts\uninstall-service.ps1` |

---

## Updating the app later

1. Replace the app files with the new version (keep `server\prisma\data\` — that
   folder holds your database and backups).
2. In PowerShell as admin, from the app folder:
   ```powershell
   Restart-Service CompanyERP
   ```
   If the update changed the screens, also run `.\scripts\install-service.ps1`
   again (safe to re-run).

---

## Restoring from a backup

Backups are gzip files in `server\prisma\data\backups\` (and in your Telegram
chat). To restore one:

1. `Stop-Service CompanyERP`
2. Unzip the chosen `erp-YYYY-MM-DD.db.gz` to get `erp.db`.
3. Replace `server\prisma\data\erp.db` with it.
4. `Start-Service CompanyERP`

---

## Troubleshooting

**Phone can't open the link**
- Phone and PC must be on the **same Wi-Fi**.
- Re-check the PC's address: PowerShell → `ipconfig` → look at **IPv4 Address**
  under Wi-Fi. Use that in `http://<that>:4000`.
- Firewall: re-run `.\scripts\install-service.ps1` (it opens the port), or in
  admin PowerShell:
  ```powershell
  New-NetFirewallRule -DisplayName "CompanyERP (4000)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4000 -Profile Any
  ```

**The link worked before, now it doesn't**
- The PC's IP probably changed. Do **Part G** (fixed address), or just look up the
  new IP with `ipconfig`.

**Is the app actually running?**
- `Get-Service CompanyERP` should say **Running**. If not: `Start-Service CompanyERP`.

**Forgot the admin PIN**
- Open `server\.env`? No — the PIN is in the database. Ask your developer to reset
  it, or reinstall settings. (Default was `1234` before you changed it.)

**See what the server is doing**
- The service writes logs to a `daemon` folder created by node-windows inside the
  `server\service\` area — look for the `*.out.log` and `*.err.log` files there.
