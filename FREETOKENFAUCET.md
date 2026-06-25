# FreeTokenFaucet 自动签到

项目地址: https://freetokenfaucet.com/?ref=Y5ZUR3W7

## 🚀 快速开始

### 第一步：配置 Cookie

```bash
# 方式一（推荐）：浏览器自动获取
npm run faucet:browser
# 首次运行会打开浏览器，登录后自动保存 Cookie

# 方式二：手动输入 Cookie
npm run faucet:refresh
# 按提示粘贴 tf_session 值即可
```

### 第二步：每日签到

```bash
# 使用已保存的 Cookie 签到
npm run faucet

# 或使用浏览器模式（自动处理 Cookie 过期）
npm run faucet:auto
```

### 第三步：设置定时任务（可选）

```powershell
# 以管理员权限运行，创建每天 8:30 自动签到的 Windows 任务
.\freetokenfaucet-setup.ps1
```

## 📦 可用命令

| 命令 | 说明 |
|------|------|
| `npm run faucet` | 使用配置文件中的 Cookie 签到 |
| `npm run faucet:refresh` | 交互式更新 Cookie |
| `npm run faucet:browser` | 浏览器模式（有界面，首次登录用） |
| `npm run faucet:auto` | 浏览器模式（无头，定时任务用） |

## 📁 文件说明

| 文件 | 说明 |
|------|------|
| `freetokenfaucet-claim.js` | API 签到脚本（轻量，无需浏览器） |
| `freetokenfaucet-claim-browser.js` | 浏览器签到脚本（自动处理登录） |
| `freetokenfaucet-config.json` | Cookie 配置文件（自动生成） |
| `freetokenfaucet-setup.ps1` | Windows 定时任务设置 |

## ⚠️ 注意事项

- Cookie 有效期约 **1 天**，过期后需重新获取
- 每日可领取 **1M ~ 1.6M tokens**
- Token **3 天有效期**，过期自动失效
- 推荐设置定时任务，每天自动签到

## 🔧 手动获取 Cookie

1. 打开浏览器访问 https://freetokenfaucet.com 并登录
2. 按 `F12` 打开开发者工具
3. 切换到 `Application` → `Cookies` → `https://freetokenfaucet.com`
4. 找到 `tf_session`，复制它的值
5. 运行 `npm run faucet:refresh` 粘贴即可
