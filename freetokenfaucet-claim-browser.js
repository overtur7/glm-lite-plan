#!/usr/bin/env node
/**
 * FreeTokenFaucet 浏览器自动签到脚本（无需手动提取 Cookie）
 *
 * 使用方法：
 *   1. 首次运行会打开浏览器，请手动登录
 *   2. 登录后 Cookie 会自动保存到 freetokenfaucet-cookies.json
 *   3. 后续运行会自动使用保存的 Cookie，无需再登录
 *   4. 运行: node freetokenfaucet-claim-browser.js
 *
 * 依赖: npm install playwright
 */

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const COOKIE_FILE = path.join(__dirname, 'freetokenfaucet-cookies.json')
const SITE_URL = 'https://freetokenfaucet.com/?ref=Y5ZUR3W7'
const HEADLESS = process.argv.includes('--headless')

async function saveCookies(context) {
  const cookies = await context.cookies()
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2))
  console.log('💾 Cookie 已保存')
}

async function loadCookies(context) {
  if (fs.existsSync(COOKIE_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'))
    await context.addCookies(cookies)
    console.log('📂 已加载保存的 Cookie')
    return true
  }
  return false
}

async function main() {
  console.log('='.repeat(50))
  console.log('🪙 FreeTokenFaucet 浏览器自动签到')
  console.log(`📅 ${new Date().toLocaleString()}`)
  console.log('='.repeat(50))

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--disable-blink-features=AutomationControlled'],
  })

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })

  // 尝试加载已保存的 Cookie
  const hasCookies = await loadCookies(context)

  const page = await context.newPage()

  // 拦截网络请求记录
  const apiResponses = []
  page.on('response', async (response) => {
    const url = response.url()
    if (url.includes('/api/')) {
      try {
        const body = await response.json()
        apiResponses.push({ url, status: response.status(), body })
      } catch {}
    }
  })

  console.log('🌐 正在打开网站...')
  await page.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)

  // 检查登录状态
  const sessionResp = await page.evaluate(async () => {
    const r = await fetch('/api/auth/session', { credentials: 'include' })
    return r.json()
  })

  if (!sessionResp.loggedIn) {
    console.log('⚠️  未登录，请在浏览器中手动登录...')
    console.log('   登录完成后脚本会自动继续')

    // 等待用户登录（最多5分钟）
    let loggedIn = false
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(5000)
      const check = await page.evaluate(async () => {
        const r = await fetch('/api/auth/session', { credentials: 'include' })
        return r.json()
      })
      if (check.loggedIn) {
        loggedIn = true
        break
      }
      if (i % 6 === 0) console.log(`   ⏳ 等待登录中... (${i * 5}秒)`)
    }

    if (!loggedIn) {
      console.error('❌ 登录超时（5分钟），请重新运行脚本')
      await browser.close()
      process.exit(1)
    }

    console.log('✅ 登录成功！')
    await saveCookies(context)
  } else {
    console.log(`✅ 已登录: ${sessionResp.user.provider}`)
  }

  // 检查今日是否已领取
  const poolResp = await page.evaluate(async () => {
    const r = await fetch('/api/pool', { credentials: 'include' })
    return r.json()
  })

  if (poolResp.mine && poolResp.mine.claimedToday) {
    console.log(`ℹ️  今日已领取: ${formatTokens(poolResp.mine.todayAmount)}`)
    console.log(`💰 可用余额: ${formatTokens(poolResp.mine.availableTokens)}`)
    await saveCookies(context) // 更新 Cookie
    await browser.close()
    return
  }

  // 检查池子是否为空
  if (poolResp.pool && poolResp.pool.empty) {
    console.warn('⚠️  今日池子已空，明天再来！')
    await browser.close()
    return
  }

  // 点击领取按钮
  console.log('🎰 正在领取今日 Token...')

  const claimBtn = page.locator('button:has-text("领取今日 Token")')
  if ((await claimBtn.count()) > 0) {
    await claimBtn.click()
    await page.waitForTimeout(3000)
  } else {
    // 备用方案：直接调用 API
    const claimResult = await page.evaluate(async () => {
      const r = await fetch('/api/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      return r.json()
    })

    if (claimResult.amount) {
      console.log(
        `🎉 领取成功！获得 ${formatTokens(claimResult.amount)} tokens`,
      )
    } else if (claimResult.error === 'ALREADY_CLAIMED') {
      console.log('ℹ️  今日已领取过')
    } else {
      console.error('❌ 领取失败:', claimResult)
    }
  }

  // 获取最终余额
  const meResp = await page.evaluate(async () => {
    const r = await fetch('/api/me', { credentials: 'include' })
    return r.json()
  })

  if (meResp.tokenPlan) {
    console.log('\n📊 账户概览:')
    console.log(
      `   💰 可用余额: ${formatTokens(meResp.tokenPlan.availableTokens)}`,
    )
    console.log(
      `   📅 今日已用: ${formatTokens(meResp.tokenPlan.todayTokensUsed || 0)}`,
    )
  }

  // 保存最新 Cookie
  await saveCookies(context)

  console.log('\n✨ 签到完成！')
  await browser.close()
}

function formatTokens(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K'
  return n.toString()
}

main().catch((err) => {
  console.error('💥 脚本出错:', err.message)
  process.exit(1)
})
