/**
 * 火山引擎 方舟 Coding Plan - Lite 抢购模块
 *
 * 页面结构：
 *   - 切换周期：连续包月 / 连续包季 / 连续包年
 *   - Lite Plan / Pro Plan，每张卡片有一个 "立即订阅" 按钮
 *   - Lite 在左边，按钮文案为 "立即订阅"
 *   - 刷新时间：每天 0:00
 */

const { chromium } = require('playwright')
const {
  log,
  sleep,
  msUntil,
  countdownWait,
  askQuestion,
  ensureDir,
  createBrowserContext,
} = require('./lib/common')
const path = require('path')

const PLATFORM = '火山'
const CONFIG = {
  url: 'https://www.volcengine.com/activity/codingplan?infrom=100009.902.26',
  refreshHour: 0, // 每天 0:00 刷新
  grabInterval: 300, // 抢购间隔 ms
  grabTimeout: 300, // 抢购超时秒
  screenshotDir: './screenshots/volcengine',
  targetPlan: 'Lite',
  targetCycle: '连续包年',
  preStartMs: 500, // 提前 500ms 开始
}

async function findLiteSubscribeButton(page) {
  // 火山引擎页面结构：Lite Plan 在左边，按钮文案是 "立即订阅"

  // 策略1：找 Lite Plan 区域内的订阅按钮
  try {
    const litePlan = page.locator('text=Lite Plan').first()
    if (await litePlan.isVisible({ timeout: 1000 }).catch(() => false)) {
      let card = litePlan
      for (let j = 0; j < 8; j++) {
        card = card.locator('..')
        const btn = card
          .locator(
            '[class*="subscribe"]:visible, button:has-text("立即订阅"):visible, div:has-text("立即订阅"):visible',
          )
          .first()
        const btnCount = await btn.count()
        if (btnCount > 0) {
          // 确认按钮可点击
          const box = await btn.boundingBox()
          if (box && box.width > 10 && box.height > 10) {
            return btn
          }
        }
      }
    }
  } catch (e) {
    /* 继续 */
  }

  // 策略2：所有 "立即订阅" 元素，取第一个（Lite 在左边）
  try {
    const allBtns = page.locator('text=立即订阅')
    const count = await allBtns.count()

    for (let i = 0; i < count; i++) {
      const btn = allBtns.nth(i)
      const isVisible = await btn.isVisible().catch(() => false)
      if (isVisible) {
        const box = await btn.boundingBox()
        if (box && box.width > 10 && box.height > 10) {
          return btn
        }
      }
    }
  } catch (e) {
    /* 继续 */
  }

  // 策略3：CSS 选择器搜索
  try {
    const btn = page
      .locator(
        '[class*="subscribe-btn"]:visible, [class*="subscribeBtn"]:visible',
      )
      .first()
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      return btn
    }
  } catch (e) {
    /* 继续 */
  }

  return null
}

async function switchToAnnual(page) {
  log(PLATFORM, `🏷️  切换到「${CONFIG.targetCycle}」标签...`)
  try {
    const annualTab = page
      .locator('[aria-label="连续包年"], text=连续包年')
      .first()
    await annualTab.waitFor({ state: 'visible', timeout: 10000 })
    await annualTab.click()
    await sleep(800)
    log(PLATFORM, '✅ 已切换到连续包年')
  } catch (e) {
    try {
      // 备用：查找包含"年"的可点击元素
      const tabs = page.locator('[class*="tab"], [role="tab"]')
      const count = await tabs.count()
      for (let i = 0; i < count; i++) {
        const tab = tabs.nth(i)
        const text = await tab.textContent().catch(() => '')
        if (text.includes('年')) {
          await tab.click()
          await sleep(800)
          log(PLATFORM, '✅ 通过tab切换到连续包年')
          return
        }
      }
      log(PLATFORM, '⚠️  未找到连续包年标签')
    } catch (e2) {
      log(PLATFORM, '⚠️  切换失败')
    }
  }
}

async function grabLoop(page, screenshotDir) {
  const startTime = Date.now()
  const deadline = startTime + CONFIG.grabTimeout * 1000
  let attempt = 0
  let success = false

  while (Date.now() < deadline && !success) {
    attempt++
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    try {
      const btn = await findLiteSubscribeButton(page)

      if (!btn) {
        if (attempt % 20 === 1) {
          log(PLATFORM, `⏳ #${attempt} | ${elapsed}s | 未找到订阅按钮`)
        }
        // 定期刷新页面
        if (attempt > 0 && attempt % 30 === 0) {
          log(PLATFORM, '🔄 刷新页面重试...')
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 })
          await sleep(1000)
          await switchToAnnual(page)
        }
        await sleep(CONFIG.grabInterval)
        continue
      }

      // 检查按钮状态
      const isDisabled = await btn.isDisabled().catch(() => false)
      const opacity = await btn
        .evaluate((el) => getComputedStyle(el).opacity)
        .catch(() => '1')

      if (isDisabled || parseFloat(opacity) < 0.5) {
        if (attempt % 20 === 1) {
          log(
            PLATFORM,
            `⏳ #${attempt} | ${elapsed}s | 按钮不可用 (disabled=${isDisabled}, opacity=${opacity})`,
          )
        }
        if (attempt > 0 && attempt % 30 === 0) {
          log(PLATFORM, '🔄 刷新页面重试...')
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 })
          await sleep(1000)
          await switchToAnnual(page)
        }
        await sleep(CONFIG.grabInterval)
        continue
      }

      // 点击订阅！
      log(PLATFORM, `🔥 #${attempt} | ${elapsed}s | 点击立即订阅...`)

      // 火山引擎的按钮可能是 div 而非 button，尝试多种点击方式
      try {
        await btn.click({ force: true, timeout: 3000 })
      } catch (clickErr) {
        // 备用：直接 dispatchEvent
        await btn.evaluate((el) => {
          el.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true }),
          )
        })
      }

      await sleep(2000)

      const currentUrl = page.url()
      log(PLATFORM, `📍 URL: ${currentUrl}`)

      // 检查是否跳转
      if (
        currentUrl.includes('order') ||
        currentUrl.includes('pay') ||
        currentUrl.includes('checkout') ||
        currentUrl.includes('confirm') ||
        currentUrl.includes('subscribe') ||
        currentUrl.includes('purchase')
      ) {
        log(PLATFORM, '🎉 ══════════════════════════════════════')
        log(PLATFORM, '🎉  抢购成功！已跳转到支付页面！')
        log(PLATFORM, `🎉  URL: ${currentUrl}`)
        log(PLATFORM, '🎉 ══════════════════════════════════════')
        success = true
        await page.screenshot({
          path: path.join(screenshotDir, 'success.png'),
          fullPage: false,
        })
        break
      }

      // 检查弹窗（火山可能用不同弹窗组件）
      try {
        const dialog = page
          .locator(
            '[class*="modal"]:visible, [class*="dialog"]:visible, [class*="popup"]:visible, [role="dialog"]:visible',
          )
          .first()
        if (await dialog.isVisible({ timeout: 1000 }).catch(() => false)) {
          log(PLATFORM, '🔔 检测到弹窗')
          await page.screenshot({
            path: path.join(screenshotDir, `dialog-${attempt}.png`),
            fullPage: false,
          })

          // 查找确认/支付按钮
          const confirmBtn = dialog
            .locator(
              'button:has-text("确认"), button:has-text("确定"), button:has-text("支付"), button:has-text("提交"), button:has-text("订阅")',
            )
            .first()
          if (
            await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)
          ) {
            await confirmBtn.click({ timeout: 3000 })
            log(PLATFORM, '✅ 已点击确认')
            await sleep(2000)
            if (page.url() !== currentUrl) {
              log(PLATFORM, '🎉 页面跳转，可能成功！')
              success = true
            }
          }
        }
      } catch (e) {
        /* 继续 */
      }

      // 检查错误信息
      try {
        const errorMsgs = page.locator(
          '[class*="error"]:visible, [class*="toast"]:visible, [class*="message"]:visible',
        )
        const count = await errorMsgs.count()
        for (let i = 0; i < Math.min(count, 3); i++) {
          const text = await errorMsgs
            .nth(i)
            .textContent()
            .catch(() => '')
          if (text && text.trim().length > 0 && text.trim().length < 200) {
            log(PLATFORM, `❌ 提示: ${text.trim()}`)
            if (
              text.includes('已购买') ||
              text.includes('已订阅') ||
              text.includes('已开通')
            ) {
              log(PLATFORM, 'ℹ️  已购买，停止')
              success = true
              break
            }
          }
        }
      } catch (e) {
        /* 继续 */
      }
    } catch (err) {
      if (attempt % 20 === 1) {
        log(PLATFORM, `⚠️  #${attempt} 异常: ${err.message.substring(0, 80)}`)
      }
    }

    await sleep(CONFIG.grabInterval)
  }

  if (!success) {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
    log(PLATFORM, `⏰ 超时！共 ${attempt} 次尝试，耗时 ${totalTime}s`)
  }

  return success
}

async function run(waitForTime = true) {
  ensureDir(CONFIG.screenshotDir)

  // 倒计时到开抢时刻
  if (waitForTime) {
    const waitMs = msUntil(CONFIG.refreshHour, 0, 0, -CONFIG.preStartMs)
    await countdownWait(PLATFORM, CONFIG.refreshHour, waitMs)
  }

  log(PLATFORM, '🚀 启动浏览器...')
  const { browser, context } = await createBrowserContext(chromium, {
    headless: false,
  })
  const page = await context.newPage()

  // 导航
  log(PLATFORM, '📄 打开火山引擎页面...')
  await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(3000)
  await page.screenshot({
    path: path.join(CONFIG.screenshotDir, '01-initial.png'),
    fullPage: false,
  })

  // 等待登录
  log(PLATFORM, '')
  log(PLATFORM, '══════════════════════════════════════')
  log(PLATFORM, '⚠️  请在浏览器中手动登录火山引擎账号')
  log(PLATFORM, '   登录完成后，回到终端按 Enter')
  log(PLATFORM, '══════════════════════════════════════')
  log(PLATFORM, '')

  await askQuestion('>>> 登录完成后按 Enter 继续...')

  // 刷新 + 切换周期
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(2000)
  await switchToAnnual(page)
  await page.screenshot({
    path: path.join(CONFIG.screenshotDir, '02-ready.png'),
    fullPage: false,
  })

  // 开始抢购
  log(PLATFORM, '')
  log(PLATFORM, '🎯 ══════════════════════════════════════')
  log(PLATFORM, `🎯  开始抢购 [Lite] 连续包年`)
  log(
    PLATFORM,
    `🎯  间隔: ${CONFIG.grabInterval}ms | 超时: ${CONFIG.grabTimeout}s`,
  )
  log(PLATFORM, '🎯 ══════════════════════════════════════')

  const success = await grabLoop(page, CONFIG.screenshotDir)

  if (!success) {
    log(PLATFORM, '💡 浏览器保持打开，可手动操作。Ctrl+C 退出')
    await new Promise((resolve) => process.on('SIGINT', resolve))
  }

  await browser.close()
  log(PLATFORM, '✅ 已退出')
}

module.exports = { run, CONFIG }

// 直接运行
if (require.main === module) {
  run().catch((err) => {
    console.error('💥 火山脚本异常:', err)
    process.exit(1)
  })
}
