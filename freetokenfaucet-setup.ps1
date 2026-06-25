# FreeTokenFaucet Daily Claim - Windows Scheduled Task Setup
# Run as Administrator to create the scheduled task

$ErrorActionPreference = "Stop"

$taskName = "FreeTokenFaucet-DailyClaim"
$scriptPath = Join-Path $PSScriptRoot "freetokenfaucet-claim-browser.js"
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source

if (-not $nodePath) {
    Write-Host "[ERROR] Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check if playwright is installed
$playwrightInstalled = npm list playwright 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[INFO] Installing playwright..." -ForegroundColor Yellow
    npm install playwright
    npx playwright install chromium
}

# Create scheduled task - runs daily at 8:30 AM
$action = New-ScheduledTaskAction `
    -Execute $nodePath `
    -Argument "`"$scriptPath`" --headless" `
    -WorkingDirectory $PSScriptRoot

$trigger = New-ScheduledTaskTrigger -Daily -At "08:30"

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -MultipleInstances IgnoreNew

# Register task
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "[WARN] Task '$taskName' already exists, updating..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "FreeTokenFaucet Daily Auto Claim Token" `
    -RunLevel Highest

Write-Host ""
Write-Host "[OK] Scheduled task created!" -ForegroundColor Green
Write-Host "Task Name  : $taskName" -ForegroundColor Cyan
Write-Host "Run Time   : Daily 08:30" -ForegroundColor Cyan
Write-Host "Script Path: $scriptPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "Tips:" -ForegroundColor Yellow
Write-Host "   - First run: npm run faucet:browser (login in browser)"
Write-Host "   - After login, cookie is saved for headless mode"
Write-Host "   - Manual run: npm run faucet:browser"
Write-Host "   - View task:  Get-ScheduledTask -TaskName '$taskName'"
Write-Host "   - Delete task: Unregister-ScheduledTask -TaskName '$taskName'"
