# Coding Plan Lite 抢购脚本

双平台 GLM Coding Plan & 方舟 Coding Plan 的 Lite 连续包年抢购。

**纯 API 模式**：使用 Node.js HTTPS 直接调用接口，无需浏览器，速度更快（80ms/次）。

## 刷新时间

| 平台 | 刷新时间 | 脚本 |
|------|----------|------|
| 火山引擎 方舟 Coding Plan | 每天 **0:00** | `grab-volcengine-api.js` |
| 智谱 AI GLM Coding Plan | 每天 **10:00** | `grab-zhipu-api.js` |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 提取认证信息（首次使用，每个平台只需运行一次）
npm run setup:volc    # 火山引擎 - 打开浏览器手动登录后自动提取
npm run setup:zhipu   # 智谱 AI - 打开浏览器手动登录后自动提取

# 3. 运行抢购
npm start             # 双平台同时抢（自动倒计时）
```

## 命令一览

```bash
# API 模式（推荐，默认）
npm start            # 双平台同时抢（自动倒计时）
npm run zhipu        # 只抢智谱（倒计时到 10:00）
npm run volc         # 只抢火山（倒计时到 0:00）
npm run now          # 跳过倒计时，立即开始双平台
npm run now:zhipu    # 立即开始 + 只抢智谱
npm run now:volc     # 立即开始 + 只抢火山

# 浏览器模式（备用）
npm run start:click  # 双平台浏览器模式
```

## 工作原理

```
1. 首次运行 setup 脚本 → 打开浏览器手动登录 → 自动提取认证信息保存到本地
2. 后续运行 npm start → 读取本地认证 → 倒计时到开抢时刻
3. 纯 HTTP 请求调用订阅 API（80ms 间隔，比浏览器快 4 倍）
4. 检测到库存不足 → 继续抢
5. 检测到订单创建成功 → 提示完成支付
```

## 文件结构

```
grab-glm-lite-plan/
├── grab-all.js              # 主入口
├── grab-volcengine-api.js   # 火山纯 API 抢购
├── grab-zhipu-api.js        # 智谱纯 API 抢购
├── volcengine-setup.js      # 火山认证提取（一次性）
├── zhipu-setup.js           # 智谱认证提取（一次性）
├── lib/common.js            # 公共工具库
├── .auth/                   # 认证信息（已 gitignore）
│   ├── volcengine-cookies.json
│   └── zhipu-cookies.json
└── package.json
```

## 认证说明

API 模式需要先提取认证信息，每个平台**首次使用时运行一次**：

```bash
# 火山引擎
npm run setup:volc
# → 打开浏览器 → 手动登录 → 自动提取 cookies → 保存到 .auth/volcengine-cookies.json

# 智谱 AI
npm run setup:zhipu
# → 打开浏览器 → 手动登录 → 自动探测 API → 保存到 .auth/zhipu-cookies.json
```

**注意**：Cookies 会在数小时后过期，如果遇到认证失效错误，重新运行 setup 脚本即可。

## 配置项

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GRAB_INTERVAL` | `80` | 每次抢购间隔（毫秒） |
| `GRAB_TIMEOUT` | `300` | 抢购超时时间（秒） |

示例：
```bash
# 每 50ms 尝试一次，超时 10 分钟
set GRAB_INTERVAL=50
set GRAB_TIMEOUT=600
npm start
```

## 注意事项

⚠️ **认证提取需手动登录**：两个平台都有验证码，setup 脚本会打开浏览器让你手动登录

⚠️ **Cookies 会过期**：如果遇到"未授权"或"NotLogin"错误，重新运行 setup 脚本

⚠️ **提前运行**：可以在开抢前运行，脚本会自动倒计时等待

⚠️ **网络环境**：建议在稳定的网络环境下运行

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| `NotLogin: Not logged in` | 重新运行 `npm run setup:volc` |
| `未知错误` | 检查 cookies 是否过期，重新运行 setup |
| `npm install` 失败 | 检查 Node.js 版本（推荐 v16+） |
| 脚本无响应 | 按 `Ctrl+C` 终止 |
