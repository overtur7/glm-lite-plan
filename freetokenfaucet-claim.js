#!/usr/bin/env node
/**
 * FreeTokenFaucet 每日自动签到脚本
 *
 * 使用方法：
 *   1. 在浏览器中登录 https://freetokenfaucet.com
 *   2. 打开开发者工具 → Application → Cookies → freetokenfaucet.com
 *   3. 复制所有 cookie，粘贴到下方 COOKIE 变量中
 *   4. 运行: node freetokenfaucet-claim.js
 *   5. (可选) 设置定时任务每天自动执行
 *
 * API 说明：
 *   - POST /api/claim     → 领取每日 Token（返回 amount）
 *   - GET  /api/me         → 查询用户信息和余额
 *   - GET  /api/pool       → 查询今日池子剩余
 *   - GET  /api/auth/session → 检查登录状态
 */

const https = require('https')
const fs = require('fs')
const path = require('path')

// ========== 配置 ==========
// Cookie 来源优先级：环境变量 > 配置文件 > 脚本内写死
const CONFIG_FILE = path.join(__dirname, 'freetokenfaucet-config.json')

let COOKIE = process.env.FT_COOKIE || ''
if (!COOKIE && fs.existsSync(CONFIG_FILE)) {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    COOKIE = config.cookie || ''
  } catch {}
}

// 推荐链接（首次访问时绑定）
const REF_CODE = 'Y5ZUR3W7'

// ========== 工具函数 ==========
function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'freetokenfaucet.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
        Referer: 'https://freetokenfaucet.com/',
        Origin: 'https://freetokenfaucet.com',
      },
    }

    if (COOKIE) {
      options.headers['Cookie'] = COOKIE
    }

    if (body) {
      options.headers['Content-Type'] = 'application/json'
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data),
            headers: res.headers,
          })
        } catch {
          resolve({ status: res.statusCode, data: data, headers: res.headers })
        }
      })
    })

    req.on('error', reject)

    if (body) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

// ========== 主要功能 ==========
async function checkSession() {
  console.log('🔍 检查登录状态...')
  const resp = await request('/api/auth/session')

  if (!resp.data || !resp.data.loggedIn) {
    console.error('❌ 未登录！请先在浏览器中登录，然后复制 Cookie 到脚本中')
    console.error(
      '   获取方法: F12 → Application → Cookies → 复制所有 cookie 值',
    )
    return null
  }

  console.log(
    `✅ 已登录: ${resp.data.user.provider} (${resp.data.user.id.slice(0, 8)}...)`,
  )
  return resp.data.user
}

async function checkPool() {
  const resp = await request('/api/pool')
  if (resp.data && resp.data.pool) {
    const { remaining, total, empty } = resp.data.pool
    const { min, max } = resp.data.claimRange || {}
    const percent = ((remaining / total) * 100).toFixed(2)
    console.log(
      `🏊 今日池子: ${formatTokens(remaining)} / ${formatTokens(total)} (${percent}%)`,
    )
    console.log(`🎁 每次可领: ${formatTokens(min)} ~ ${formatTokens(max)}`)

    if (empty) {
      console.warn('⚠️  今日池子已空，明天再来！')
      return false
    }

    if (resp.data.mine && resp.data.mine.claimedToday) {
      console.log(`✅ 今日已领取: ${formatTokens(resp.data.mine.todayAmount)}`)
      console.log(
        `💰 可用余额: ${formatTokens(resp.data.mine.availableTokens)}`,
      )
      return 'already_claimed'
    }

    return true
  }
  return false
}

async function claim() {
  console.log('🎰 正在领取今日 Token...')
  const resp = await request('/api/claim', 'POST')

  if (resp.status === 200 && resp.data.amount) {
    console.log(`🎉 领取成功！获得 ${formatTokens(resp.data.amount)} tokens`)
    return resp.data.amount
  }

  if (resp.data && resp.data.error === 'ALREADY_CLAIMED') {
    console.log('ℹ️  今日已领取过，无需重复操作')
    return 'already'
  }

  if (resp.data && resp.data.error === 'POOL_EMPTY') {
    console.warn('⚠️  今日池子已空，明天再来！')
    return 'empty'
  }

  console.error('❌ 领取失败:', resp.data)
  return null
}

async function getBalance() {
  const resp = await request('/api/me')
  if (resp.data && resp.data.tokenPlan) {
    const plan = resp.data.tokenPlan
    console.log('\n📊 账户概览:')
    console.log(`   💰 可用余额: ${formatTokens(plan.availableTokens)}`)
    console.log(`   📅 今日已用: ${formatTokens(plan.todayTokensUsed || 0)}`)

    if (plan.tokenBuckets && plan.tokenBuckets.length > 0) {
      console.log(`   🪣 Token 桶数: ${plan.tokenBuckets.length}`)
      const earliestExpiry = plan.tokenBuckets
        .map((b) => new Date(b.expiresAt))
        .sort((a, b) => a - b)[0]
      console.log(
        `   ⏰ 最早过期: ${earliestExpiry.toLocaleString()} (${plan.tokenExpiryDays}天有效期)`,
      )
    }
  }
}

function formatTokens(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K'
  return n.toString()
}

// ========== 主流程 ==========
async function main() {
  console.log('='.repeat(50))
  console.log('🪙 FreeTokenFaucet 每日签到')
  console.log(`📅 ${new Date().toLocaleString()}`)
  console.log('='.repeat(50))

  // 0. 刷新 Cookie 模式
  if (process.argv.includes('--refresh')) {
    await refreshCookie()
    return
  }

  // 1. 检查 Cookie
  if (!COOKIE) {
    console.error('\n❌ 未配置 Cookie！')
    console.error('请选择一种方式获取 Cookie:')
    console.error('')
    console.error('方式一（推荐）: 运行浏览器版本自动获取')
    console.error('  npm run faucet:browser')
    console.error('')
    console.error('方式二: 手动从浏览器复制')
    console.error('  1. 打开 https://freetokenfaucet.com 并登录')
    console.error('  2. F12 → Application → Cookies')
    console.error('  3. 复制 tf_session 的值')
    console.error('  4. 运行: node freetokenfaucet-claim.js --refresh')
    process.exit(1)
  }

  // 2. 检查登录状态
  const user = await checkSession()
  if (!user) {
    console.error('\n💡 Cookie 可能已过期，请运行:')
    console.error('  npm run faucet:browser  (重新登录)')
    console.error('  或')
    console.error(
      '  node freetokenfaucet-claim.js --refresh  (手动更新 Cookie)',
    )
    process.exit(1)
  }

  // 3. 检查池子状态
  const poolStatus = await checkPool()

  if (poolStatus === 'already_claimed') {
    await getBalance()
    console.log('\n✨ 签到完成（今日已领取过）')
    return
  }

  if (poolStatus === false) {
    console.log('\n💤 今日池子已空，明天再来')
    return
  }

  // 4. 领取 Token
  const result = await claim()

  // 5. 显示余额
  await getBalance()

  console.log('\n✨ 签到完成！')
}

main().catch((err) => {
  console.error('💥 脚本出错:', err.message)
  process.exit(1)
})

// ========== Cookie 刷新功能 ==========
async function refreshCookie() {
  const readline = require('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  console.log('\n📋 获取 Cookie 步骤:')
  console.log('1. 打开 https://freetokenfaucet.com 并登录')
  console.log('2. 按 F12 打开开发者工具')
  console.log('3. 切换到 Application → Cookies → https://freetokenfaucet.com')
  console.log('4. 找到 tf_session，复制它的值')
  console.log('')

  const sessionValue = await new Promise((resolve) => {
    rl.question('请粘贴 tf_session 的值: ', resolve)
  })

  rl.close()

  if (!sessionValue || sessionValue.trim().length < 10) {
    console.error('❌ 无效的 session 值')
    process.exit(1)
  }

  const config = {
    cookie: `tf_session=${sessionValue.trim()}; tf_ref=Y5ZUR3W7`,
    note: 'Cookie 有效期约1天，过期后需重新获取',
    lastUpdated: new Date().toISOString().split('T')[0],
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
  console.log(`\n✅ Cookie 已保存到 ${CONFIG_FILE}`)

  // 验证新 Cookie
  COOKIE = config.cookie
  const user = await checkSession()
  if (user) {
    console.log('✅ 新 Cookie 验证成功！')
    await getBalance()
  } else {
    console.error('❌ 新 Cookie 验证失败，请检查是否复制正确')
  }
}
