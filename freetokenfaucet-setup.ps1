# FreeTokenFaucet 每日签到 - Windows 定时任务设置脚本
# 以管理员权限运行此脚本即可创建每日定时任务

$ErrorActionPreference = "Stop"

$taskName = "FreeTokenFaucet-DailyClaim"
$scriptPath = Join-Path $PSScriptRoot "freetokenfaucet-claim-browser.js"
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source

if (-not $nodePath) {
    Write-Host "❌ 未找到 Node.js，请先安装 Node.js" -ForegroundColor Red
    exit 1
}

# 检查 playwright 是否安装
$playwrightInstalled = npm list playwright 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "📦 正在安装 playwright..." -ForegroundColor Yellow
    npm install playwright
    npx playwright install chromium
}

# 创建定时任务 - 每天早上 8:30 执行
$action = New-ScheduledTaskAction `
    -Execute $nodePath `
    -Argument "`"$scriptPath`" --headless" `
    -WorkingDirectory $PSScriptRoot

# 每天 8:30 触发
$trigger = New-ScheduledTaskTrigger -Daily -At "08:30"

# 设置 - 无论用户是否登录都执行，启动时不显示窗口
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -MultipleInstances IgnoreNew

# 注册任务
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "⚠️  定时任务 '$taskName' 已存在，正在更新..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "FreeTokenFaucet 每日自动签到领取 Token" `
    -RunLevel Highest

Write-Host ""
Write-Host "✅ 定时任务创建成功！" -ForegroundColor Green
Write-Host "📋 任务名称: $taskName" -ForegroundColor Cyan
Write-Host "⏰ 执行时间: 每天 08:30" -ForegroundColor Cyan
Write-Host "📁 脚本路径: $scriptPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 提示:" -ForegroundColor Yellow
Write-Host "   - 首次运行需要在有界面的模式下登录（不加 --headless）"
Write-Host "   - 登录后 Cookie 会自动保存，后续可无头模式运行"
Write-Host "   - 手动运行: npm run faucet:browser"
Write-Host "   - 查看任务: Get-ScheduledTask -TaskName '$taskName'"
Write-Host "   - 删除任务: Unregister-ScheduledTask -TaskName '$taskName'"
