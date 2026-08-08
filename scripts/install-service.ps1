# Company ERP — one-time server setup + Windows Service install.
# Run in an ELEVATED PowerShell (Right-click > Run as Administrator).
#
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\scripts\install-service.ps1
#
# Installs dependencies, prepares the database, builds the web app, opens the
# LAN firewall port, and registers the auto-start service.

$ErrorActionPreference = "Stop"

# --- must be admin (service install + firewall need it) ---
$admin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Error "Please run this script in an elevated (Administrator) PowerShell."
  exit 1
}

$root = Split-Path -Parent $PSScriptRoot
$server = Join-Path $root "server"
Set-Location $root

$port = 4000
if (Test-Path (Join-Path $server ".env")) {
  $portLine = Select-String -Path (Join-Path $server ".env") -Pattern '^\s*PORT\s*=' -ErrorAction SilentlyContinue
  if ($portLine) { $port = ($portLine.Line -replace '.*=\s*', '').Trim() }
}

Write-Host "==> Installing dependencies..." -ForegroundColor Cyan
npm install

Write-Host "==> Preparing database (generate + migrate)..." -ForegroundColor Cyan
Push-Location $server
npm run generate
npm run migrate:deploy
Pop-Location

Write-Host "==> Building web app..." -ForegroundColor Cyan
npm run build --workspace=web

Write-Host "==> Building server (compiled, for the service)..." -ForegroundColor Cyan
npm run build --workspace=server

Write-Host "==> Installing node-windows (service wrapper)..." -ForegroundColor Cyan
Push-Location $server
npm install node-windows --no-save
Pop-Location

Write-Host "==> Opening firewall port $port for the LAN..." -ForegroundColor Cyan
$ruleName = "CompanyERP ($port)"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
    -Protocol TCP -LocalPort $port -Profile Any | Out-Null
  Write-Host "    Firewall rule created."
} else {
  Write-Host "    Firewall rule already exists."
}

Write-Host "==> Registering Windows Service (auto-start on boot)..." -ForegroundColor Cyan
Push-Location $server
node service/install.cjs
Pop-Location

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "Done. The 'CompanyERP' service is installed and will start on every boot." -ForegroundColor Green
Write-Host "Open on this PC:      http://localhost:$port" -ForegroundColor Green
if ($ip) { Write-Host "Open on other devices: http://$ip`:$port" -ForegroundColor Green }
Write-Host "Tip: give this PC a static IP / DHCP reservation so the address never changes." -ForegroundColor Yellow
