/**
 * GLM Coding Plan - Lite 连续包年 抢购脚本
 *
 * 使用方法：
 *   1. 确保已安装 Node.js (>= 16)
 *   2. 在本目录执行: npm install playwright
 *   3. 执行: npx playwright install chromium
 *   4. 运行: node grab-glm-lite.js
 *
 * 脚本会打开一个浏览器窗口，请先手动登录智谱账号。
 * 登录完成后，在终端按 Enter 键开始抢购循环。
 *
 * 环境变量配置（可选）：
 *   GRAB_INTERVAL  - 抢购间隔毫秒数，默认 500
 *   GRAB_TIMEOUT   - 抢购超时秒数，默认 300（5分钟）
 *   HEADLESS       - 是否无头模式，默认 false（有界面）
 */

const { chromium } = require('playwright')
const readline = require('readline')

// ============ 配置区 ============
const CONFIG = {
  // 目标页面
  url: 'https://www.bigmodel.cn/glm-coding?plantype=personal',

  // 抢购间隔（毫秒）—— 每次尝试点击的间隔
  interval: parseInt(process.env.GRAB_INTERVAL, 10) || 500,

  // 抢购超时（秒）—— 超过此时间停止
  timeoutSec: parseInt(process.env.GRAB_TIMEOUT, 10) || 300,

  // 是否无头模式
  headless: process.env.HEADLESS === 'true',

  // 截图保存目录
  screenshotDir: './screenshots',

  // 目标套餐：Lite
  targetPlan: 'Lite',

  // 目标周期：连续包年
  targetCycle: '连续包年',
}

// ============ 工具函数 ============
const fs = require('fs')
const path = require('path')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function timestamp() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function log(msg) {
  console.log(`[${timestamp()}] ${msg}`)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

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

// ============ 主流程 ============
async function main() {
  ensureDir(CONFIG.screenshotDir)

  log('🚀 启动浏览器...')
  const browser = await chromium.launch({
    headless: CONFIG.headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  })

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  })

  // 隐藏 webdriver 特征
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    // 删除 Playwright 痕迹
    delete window.__playwright
    delete window.__pw_manual
  })

  const page = await context.newPage()

  // ---------- 第一步：导航到目标页面 ----------
  log('📄 正在打开智谱 GLM Coding 页面...')
  await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(2000)

  // 截图记录初始状态
  await page.screenshot({
    path: path.join(CONFIG.screenshotDir, '01-initial.png'),
    fullPage: false,
  })
  log('📸 已截图: 01-initial.png')

  // ---------- 第二步：等待用户登录 ----------
  log('')
  log('========================================')
  log('⚠️  请在浏览器中手动登录智谱账号')
  log('   如果需要实名认证，请先完成认证')
  log('   登录完成后，回到此终端按 Enter 键')
  log('========================================')
  log('')

  await askQuestion('>>> 登录完成后按 Enter 继续...')

  // 刷新页面确保登录状态生效
  log('🔄 刷新页面...')
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(2000)
  await page.screenshot({
    path: path.join(CONFIG.screenshotDir, '02-logged-in.png'),
    fullPage: false,
  })
  log('📸 已截图: 02-logged-in.png')

  // ---------- 第三步：切换到「连续包年」标签 ----------
  log(`🏷️  正在切换到「${CONFIG.targetCycle}」标签...`)

  try {
    // 方法1：通过文本内容点击
    const annualTab = page.locator(`text=${CONFIG.targetCycle}`).first()
    await annualTab.waitFor({ state: 'visible', timeout: 10000 })
    await annualTab.click()
    await sleep(1000)
    log('✅ 已切换到连续包年')
  } catch (e) {
    log('⚠️  切换连续包年标签失败，尝试备用方式...')
    try {
      // 方法2：查找包含"8折"的元素（连续包年旁边有8折标签）
      const discountTab = page.locator('text=8折').first()
      await discountTab.click()
      await sleep(1000)
      log('✅ 通过8折标签切换到连续包年')
    } catch (e2) {
      log('⚠️  备用方式也失败了，可能已经在连续包年模式，继续...')
    }
  }

  await page.screenshot({
    path: path.join(CONFIG.screenshotDir, '03-annual-selected.png'),
    fullPage: false,
  })
  log('📸 已截图: 03-annual-selected.png')

  // ---------- 第四步：开始抢购循环 ----------
  log('')
  log('🎯 ══════════════════════════════════════')
  log(`🎯  开始抢购 [${CONFIG.targetPlan}] ${CONFIG.targetCycle} 套餐`)
  log(`🎯  抢购间隔: ${CONFIG.interval}ms`)
  log(`🎯  超时时间: ${CONFIG.timeoutSec}s`)
  log(`🎯  按 Ctrl+C 可随时停止`)
  log('🎯 ══════════════════════════════════════')
  log('')

  const startTime = Date.now()
  const deadline = startTime + CONFIG.timeoutSec * 1000
  let attempt = 0
  let success = false

  while (Date.now() < deadline && !success) {
    attempt++
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    const remaining = ((deadline - Date.now()) / 1000).toFixed(0)

    try {
      // ---- 查找 Lite 套餐卡片中的订阅按钮 ----
      // 策略：找到包含 "Lite" 文本的卡片，再找其中的按钮
      const subscribeBtn = await findLiteSubscribeButton(page)

      if (!subscribeBtn) {
        if (attempt % 10 === 1) {
          log(
            `⏳ 第 ${attempt} 次尝试 | ${elapsed}s | 剩余 ${remaining}s | 未找到订阅按钮，等待中...`,
          )
        }
        await sleep(CONFIG.interval)
        continue
      }

      // 检查按钮状态
      const btnText = await subscribeBtn.textContent().catch(() => '')
      const isDisabled = await subscribeBtn.isDisabled().catch(() => true)

      if (isDisabled) {
        if (attempt % 10 === 1) {
          log(
            `⏳ 第 ${attempt} 次尝试 | ${elapsed}s | 剩余 ${remaining}s | 按钮暂时不可用: "${btnText.trim()}"`,
          )
        }
        await sleep(CONFIG.interval)
        continue
      }

      // ---- 尝试点击订阅按钮 ----
      log(
        `🔥 第 ${attempt} 次尝试 | ${elapsed}s | 按钮可用: "${btnText.trim()}" | 正在点击...`,
      )
      await subscribeBtn.click({ force: true, timeout: 3000 })

      // 等待页面响应
      await sleep(1500)
      await page.screenshot({
        path: path.join(CONFIG.screenshotDir, `04-attempt-${attempt}.png`),
        fullPage: false,
      })

      // ---- 检查是否跳转到了支付/订单页面 ----
      const currentUrl = page.url()
      log(`📍 当前URL: ${currentUrl}`)

      if (
        currentUrl.includes('order') ||
        currentUrl.includes('pay') ||
        currentUrl.includes('checkout') ||
        currentUrl.includes('confirm')
      ) {
        log('🎉 ══════════════════════════════════════')
        log('🎉  抢购成功！已跳转到支付页面！')
        log(`🎉  URL: ${currentUrl}`)
        log('🎉  请尽快完成支付！')
        log('🎉 ══════════════════════════════════════')
        success = true
        await page.screenshot({
          path: path.join(CONFIG.screenshotDir, '05-success.png'),
          fullPage: false,
        })
        break
      }

      // 检查是否有弹窗（订单确认、支付选择等）
      const dialogVisible = await page
        .locator(
          '.el-dialog__wrapper:visible, [role="dialog"]:visible, .modal:visible',
        )
        .first()
        .isVisible()
        .catch(() => false)

      if (dialogVisible) {
        log('🔔 检测到弹窗，可能需要确认...')
        await page.screenshot({
          path: path.join(CONFIG.screenshotDir, `04b-dialog-${attempt}.png`),
          fullPage: false,
        })

        // 尝试点击确认按钮
        try {
          const confirmBtn = page
            .locator(
              'button:has-text("确认"), button:has-text("确定"), button:has-text("提交"), button:has-text("支付")',
            )
            .first()
          if (await confirmBtn.isVisible({ timeout: 2000 })) {
            await confirmBtn.click({ timeout: 3000 })
            log('✅ 已点击确认按钮')
            await sleep(2000)

            const newUrl = page.url()
            if (newUrl !== currentUrl) {
              log('🎉 页面已跳转，可能抢购成功！')
              log(`📍 新URL: ${newUrl}`)
              success = true
            }
          }
        } catch (dialogErr) {
          log(`⚠️  弹窗处理: ${dialogErr.message}`)
        }
      }

      // 检查是否有错误提示
      const errorMsg = await page
        .locator(
          '.el-message--error:visible, .el-notification__content:visible',
        )
        .first()
        .textContent()
        .catch(() => null)

      if (errorMsg) {
        log(`❌ 错误提示: ${errorMsg.trim()}`)
        if (errorMsg.includes('已购买') || errorMsg.includes('已订阅')) {
          log('ℹ️  检测到已购买提示，停止抢购')
          break
        }
      }
    } catch (err) {
      if (attempt % 10 === 1) {
        log(`⚠️  第 ${attempt} 次尝试异常: ${err.message.substring(0, 80)}`)
      }
    }

    await sleep(CONFIG.interval)
  }

  // ---------- 结果汇总 ----------
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)

  if (!success) {
    log('')
    log('⏰ ══════════════════════════════════════')
    log(`⏰  抢购超时，共尝试 ${attempt} 次，耗时 ${totalTime}s`)
    log('⏰  请检查截图目录确认状态')
    log('⏰ ══════════════════════════════════════')
  }

  log('')
  log('💡 浏览器将保持打开，您可以手动完成后续操作')
  log('💡 按 Ctrl+C 退出脚本并关闭浏览器')
  log('')

  // 保持浏览器打开，等待用户手动操作
  await new Promise((resolve) => {
    process.on('SIGINT', () => {
      log('👋 正在关闭...')
      resolve()
    })
  })

  await browser.close()
  log('✅ 已退出')
}

/**
 * 查找 Lite 套餐的订阅按钮
 *
 * 智谱页面使用 Vue + ElementUI，卡片结构大致为：
 *   - 包含 "Lite" 文本的父容器
 *   - 容器内有 "特惠订阅" 或 "立即订阅" 按钮
 */
async function findLiteSubscribeButton(page) {
  // 策略1：通过 Lite 标题定位到卡片，再找按钮
  try {
    const liteCards = page.locator('text=Lite')
    const count = await liteCards.count()

    for (let i = 0; i < count; i++) {
      const el = liteCards.nth(i)
      const text = (await el.textContent().catch(() => '')).trim()

      // 精确匹配 "Lite"（不含 Pro、Max 等）
      if (text === 'Lite') {
        // 向上找到卡片容器（通常3-5层父级）
        let card = el
        for (let j = 0; j < 6; j++) {
          card = card.locator('..')
          const btn = card.locator(
            'button:has-text("特惠订阅"), button:has-text("立即订阅"), button:has-text("订阅")',
          )
          const btnCount = await btn.count()
          if (btnCount > 0) {
            return btn.first()
          }
        }
      }
    }
  } catch (e) {
    // 策略1失败，继续尝试
  }

  // 策略2：直接查找所有订阅按钮，根据位置判断
  try {
    const allSubscribeBtns = page.locator(
      'button:has-text("特惠订阅"), button:has-text("立即订阅")',
    )
    const count = await allSubscribeBtns.count()

    if (count >= 1) {
      // 第一个通常是 Lite（Lite -> Pro -> Max 从左到右排列）
      return allSubscribeBtns.first()
    }
  } catch (e) {
    // 策略2失败
  }

  // 策略3：更宽泛的按钮搜索
  try {
    const btn = page.locator('button').filter({ hasText: '订阅' }).first()
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      return btn
    }
  } catch (e) {
    // 策略3失败
  }

  return null
}

// ============ 运行 ============
main().catch((err) => {
  console.error('💥 脚本异常退出:', err)
  process.exit(1)
})
