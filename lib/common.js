/**
 * 公共工具库 - 抢购脚本通用功能
 */

const fs = require('fs')
const path = require('path')
const readline = require('readline')

// ============ 时间工具 ============

function timestamp() {
  return new Date().toLocaleString('zh-CN', {
    hour12: false,
    fractionalSecondDigits: 3,
  })
}

function log(platform, msg) {
  console.log(`[${timestamp()}][${platform}] ${msg}`)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 计算距离目标时刻的毫秒数
 * @param {number} hour - 目标小时 (0-23)
 * @param {number} minute - 目标分钟 (0-59)
 * @param {number} second - 目标秒 (0-59)
 * @param {number} msOffset - 提前多少毫秒开始（负数=提前）
 * @returns {number} 距离目标时间的毫秒数（如果已过目标时间则返回0）
 */
function msUntil(hour, minute = 0, second = 0, msOffset = -500) {
  const now = new Date()
  const target = new Date()
  target.setHours(hour, minute, second, 0)

  // 如果目标时间已过（今天），设为明天
  if (target <= now) {
    target.setDate(target.getDate() + 1)
  }

  let diff = target.getTime() - now.getTime() + msOffset
  return Math.max(0, diff)
}

/**
 * 格式化毫秒为可读时间
 */
function formatMs(ms) {
  if (ms <= 0) return '0s'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const parts = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  parts.push(`${s}s`)
  return parts.join(' ')
}

/**
 * 倒计时等待到目标时间
 * @param {string} platform - 平台名称
 * @param {number} hour - 目标小时
 * @param {number} waitMs - 需要等待的毫秒数
 */
async function countdownWait(platform, hour, waitMs) {
  if (waitMs <= 0) {
    log(platform, `⏰ 已过今日 ${hour}:00，直接开始抢购！`)
    return
  }

  log(platform, `⏳ 距离 ${hour}:00 开抢还有 ${formatMs(waitMs)}`)
  log(platform, '   按 Ctrl+C 可随时取消')

  const startTime = Date.now()
  const endTime = startTime + waitMs

  // 每 30 秒输出一次倒计时
  while (Date.now() < endTime) {
    const remaining = endTime - Date.now()

    // 最后 10 秒每秒输出
    if (remaining <= 10000) {
      log(platform, `🔥 ${Math.ceil(remaining / 1000)} 秒后开抢!`)
      await sleep(1000)
    } else if (remaining <= 60000) {
      // 最后 1 分钟每 5 秒输出
      log(platform, `⏱️  ${formatMs(remaining)} 后开抢`)
      await sleep(5000)
    } else {
      // 其余每 30 秒输出
      log(platform, `⏳ ${formatMs(remaining)} 后开抢`)
      await sleep(30000)
    }
  }

  log(platform, `🚀 到达 ${hour}:00，开始抢购！`)
}

// ============ 浏览器工具 ============

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close()
      resolve(ans)
    }),
  )
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

async function createBrowserContext(chromium, config) {
  const browser = await chromium.launch({
    headless: config.headless || false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--start-maximized',
    ],
  })

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  })

  // 隐藏自动化特征
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    delete window.__playwright
    delete window.__pw_manual

    // 更彻底地隐藏 Playwright
    const origDefineProperty = Object.defineProperty
    Object.defineProperty = function (obj, prop, desc) {
      if (prop === 'webdriver' && obj === navigator) {
        return origDefineProperty.call(this, obj, prop, {
          get: () => false,
          configurable: true,
        })
      }
      return origDefineProperty.call(this, obj, prop, desc)
    }
  })

  return { browser, context }
}

module.exports = {
  timestamp,
  log,
  sleep,
  msUntil,
  formatMs,
  countdownWait,
  askQuestion,
  ensureDir,
  createBrowserContext,
}
