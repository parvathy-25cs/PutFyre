# HRM Portal Server - Auto-Start Setup Script
# This script creates a Windows Task Scheduler task so the backend
# server starts automatically every time you log into Windows.
# Run this script ONCE to set it up. No admin rights required.

$TaskName = "HRM Portal Server"
$NodePath  = (Get-Command node -ErrorAction SilentlyContinue).Source
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ServerScript = Join-Path $ScriptDir "server.js"

if (-not $NodePath) {
    Write-Host "ERROR: Node.js was not found on PATH. Please install Node.js first." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  HRM Portal Server - Auto-Start Setup" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Node.js  : $NodePath" -ForegroundColor Gray
Write-Host "  Server   : $ServerScript" -ForegroundColor Gray
Write-Host ""

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing existing task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Build the action: run node server.js in the project directory (hidden window)
$Action = New-ScheduledTaskAction `
    -Execute $NodePath `
    -Argument "`"$ServerScript`"" `
    -WorkingDirectory $ScriptDir

# Trigger: run at user logon
$Trigger = New-ScheduledTaskTrigger -AtLogOn

# Settings: run whether logged on or not, restart on failure
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit 0 `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable

# Register the task for the current user
Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "Automatically starts the HRM Portal Express backend server on login." `
    -RunLevel Highest `
    -Force | Out-Null

Write-Host "✅ Task Scheduler entry created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "  The HRM Portal server will now auto-start every time" -ForegroundColor White
Write-Host "  you log into Windows (on port 3000)." -ForegroundColor White
Write-Host ""
Write-Host "  Starting server in background now..." -ForegroundColor Cyan

# Launch server in a hidden background window immediately
Start-Process -FilePath $NodePath -ArgumentList "`"$ServerScript`"" -WorkingDirectory $ScriptDir -WindowStyle Hidden

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  Server is running at http://localhost:3000" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor Gray
Write-Host "    Stop server  : taskkill /f /im node.exe" -ForegroundColor Gray
Write-Host "    Remove task  : schtasks /delete /tn `"HRM Portal Server`" /f" -ForegroundColor Gray
Write-Host ""
