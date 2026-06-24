/**
 * 智谱 GLM Coding - Lite 连续包年 抢购模块
 *
 * 页面结构：
 *   - 切换周期：连续包月 / 连续包季(9折) / 连续包年(8折)
 *   - 套餐卡片：Lite / Pro / Max，每张卡片有一个订阅按钮
 *   - Lite 在最左边，按钮文案为 "特惠订阅"
 *   - 刷新时间：每天 10:00
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

const PLATFORM = '智谱'
const CONFIG = {
  url: 'https://www.bigmodel.cn/glm-coding?plantype=personal',
  refreshHour: 10, // 每天 10:00 刷新
  grabInterval: 300, // 抢购间隔 ms
  grabTimeout: 300, // 抢购超时秒
  screenshotDir: './screenshots/zhipu',
  targetPlan: 'Lite',
  targetCycle: '连续包年',
  preStartMs: 500, // 提前 500ms 开始
}

async function findLiteSubscribeButton(page) {
  // 策略1：通过 Lite 标题定位卡片，向上找按钮
  try {
    const liteElements = page.locator('text=Lite')
    const count = await liteElements.count()

    for (let i = 0; i < count; i++) {
      const el = liteElements.nth(i)
      const text = (await el.textContent().catch(() => '')).trim()

      if (text === 'Lite') {
        let card = el
        for (let j = 0; j < 6; j++) {
          card = card.locator('..')
          const btn = card.locator(
            'button:has-text("特惠订阅"), button:has-text("立即订阅"), button:has-text("订阅")',
          )
          const btnCount = await btn.count()
          if (btnCount > 0) return btn.first()
        }
      }
    }
  } catch (e) {
    /* 继续 */
  }

  // 策略2：所有订阅按钮，取第一个（Lite 在最左边）
  try {
    const allBtns = page.locator(
      'button:has-text("特惠订阅"), button:has-text("立即订阅")',
    )
    const count = await allBtns.count()
    if (count >= 1) return allBtns.first()
  } catch (e) {
    /* 继续 */
  }

  // 策略3：更宽泛搜索
  try {
    const btn = page.locator('button').filter({ hasText: '订阅' }).first()
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) return btn
  } catch (e) {
    /* 继续 */
  }

  return null
}

async function switchToAnnual(page) {
  log(PLATFORM, `🏷️  切换到「${CONFIG.targetCycle}」标签...`)
  try {
    const annualTab = page.locator(`text=${CONFIG.targetCycle}`).first()
    await annualTab.waitFor({ state: 'visible', timeout: 10000 })
    await annualTab.click()
    await sleep(800)
    log(PLATFORM, '✅ 已切换到连续包年')
  } catch (e) {
    try {
      const discountTab = page.locator('text=8折').first()
      await discountTab.click()
      await sleep(800)
      log(PLATFORM, '✅ 通过8折标签切换')
    } catch (e2) {
      log(PLATFORM, '⚠️  切换失败，可能已在连续包年模式')
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
        await sleep(CONFIG.grabInterval)
        continue
      }

      const btnText = await btn.textContent().catch(() => '')
      const isDisabled = await btn.isDisabled().catch(() => true)

      if (isDisabled) {
        if (attempt % 20 === 1) {
          log(
            PLATFORM,
            `⏳ #${attempt} | ${elapsed}s | 按钮不可用: "${btnText.trim()}"`,
          )
        }
        // 按钮不可用时刷新页面重试（可能在开抢时刻后需要刷新）
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
      log(PLATFORM, `🔥 #${attempt} | ${elapsed}s | 点击: "${btnText.trim()}"`)
      await btn.click({ force: true, timeout: 3000 })
      await sleep(1500)

      const currentUrl = page.url()
      log(PLATFORM, `📍 URL: ${currentUrl}`)

      // 检查是否跳转到支付页面
      if (
        currentUrl.includes('order') ||
        currentUrl.includes('pay') ||
        currentUrl.includes('checkout') ||
        currentUrl.includes('confirm')
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

      // 检查弹窗
      try {
        const dialog = page
          .locator('.el-dialog__wrapper:visible, [role="dialog"]:visible')
          .first()
        if (await dialog.isVisible({ timeout: 1000 }).catch(() => false)) {
          log(PLATFORM, '🔔 检测到弹窗')
          const confirmBtn = page
            .locator(
              'button:has-text("确认"), button:has-text("确定"), button:has-text("提交"), button:has-text("支付")',
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

      // 检查错误提示
      const errorMsg = await page
        .locator(
          '.el-message--error:visible, .el-notification__content:visible',
        )
        .first()
        .textContent()
        .catch(() => null)

      if (errorMsg) {
        log(PLATFORM, `❌ ${errorMsg.trim()}`)
        if (errorMsg.includes('已购买') || errorMsg.includes('已订阅')) {
          log(PLATFORM, 'ℹ️  已购买，停止')
          break
        }
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
  log(PLATFORM, '📄 打开智谱页面...')
  await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(2000)
  await page.screenshot({
    path: path.join(CONFIG.screenshotDir, '01-initial.png'),
    fullPage: false,
  })

  // 等待登录
  log(PLATFORM, '')
  log(PLATFORM, '══════════════════════════════════════')
  log(PLATFORM, '⚠️  请在浏览器中手动登录智谱账号')
  log(PLATFORM, '   完成实名认证后，回到终端按 Enter')
  log(PLATFORM, '══════════════════════════════════════')
  log(PLATFORM, '')

  await askQuestion('>>> 登录完成后按 Enter 继续...')

  // 刷新 + 切换周期
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(1500)
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
    console.error('💥 智谱脚本异常:', err)
    process.exit(1)
  })
}
