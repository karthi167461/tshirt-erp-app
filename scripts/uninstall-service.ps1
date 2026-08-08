# Removes the CompanyERP Windows Service and its firewall rule.
# Run in an ELEVATED PowerShell (Run as Administrator).

$ErrorActionPreference = "Stop"

$admin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Error "Please run this script in an elevated (Administrator) PowerShell."
  exit 1
}

$root = Split-Path -Parent $PSScriptRoot
$server = Join-Path $root "server"

Write-Host "==> Removing Windows Service..." -ForegroundColor Cyan
Push-Location $server
node service/uninstall.cjs
Pop-Location

Write-Host "==> Removing firewall rule(s)..." -ForegroundColor Cyan
Get-NetFirewallRule -DisplayName "CompanyERP*" -ErrorAction SilentlyContinue |
  Remove-NetFirewallRule

Write-Host "Done." -ForegroundColor Green
