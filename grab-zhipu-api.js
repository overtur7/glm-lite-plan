/**
 * 智谱 GLM Coding - Lite 纯 API 抢购模块
 *
 * 纯 Node.js HTTP 请求，不依赖浏览器/Playwright
 * 依赖: 先运行 node zhipu-setup.js 提取 cookies 和 API 端点
 *
 * 刷新时间：每天 10:00
 */

const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')
const {
  log,
  sleep,
  msUntil,
  countdownWait,
  ensureDir,
} = require('./lib/common')

const PLATFORM = '智谱API'
const CONFIG = {
  refreshHour: 10,
  grabTimeout: 300, // 抢购超时秒
  grabInterval: 80, // API 调用间隔 ms
  defaultApiPath: '/api/biz/pay/batch-preview', // 从 setup 探测获得
  defaultApiBody: { invitationCode: '' }, // 默认请求体
}

const AUTH_DIR = path.resolve(__dirname, '.auth')
const COOKIES_FILE = path.join(AUTH_DIR, 'zhipu-cookies.json')

// API 主机
const API_HOST = 'www.bigmodel.cn'

// ============ HTTP 工具 ============

function httpPost(urlPath, body, cookieString, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
    const options = {
      hostname: API_HOST,
      port: 443,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        Accept: 'application/json, text/plain, */*',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Origin: `https://${API_HOST}`,
        Referer: 'https://www.bigmodel.cn/glm-coding?plantype=personal',
        Cookie: cookieString,
        ...extraHeaders,
      },
      timeout: 10000,
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch (e) {
          resolve({ status: res.statusCode, data, parseError: e.message })
        }
      })
    })

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    req.write(bodyStr)
    req.end()
  })
}

// ============ 认证管理 ============

function loadAuth() {
  if (!fs.existsSync(COOKIES_FILE)) return null
  try {
    return JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'))
  } catch (e) {
    return null
  }
}

// ============ API 调用 ============

async function callSubscribeApi(auth) {
  const apiPath = auth.apiEndpoint || CONFIG.defaultApiPath
  const body = auth.apiBody || CONFIG.defaultApiBody

  // 从 cookies 提取 JWT token 作为 Authorization
  const tokenMatch = auth.cookieString.match(
    /bigmodel_token_production=([^;]+)/,
  )
  const jwtToken = tokenMatch ? tokenMatch[1] : ''
  const extraHeaders = {
    ...(auth.apiHeaders || {}),
  }
  if (jwtToken) {
    extraHeaders['Authorization'] = `Bearer ${jwtToken}`
  }

  try {
    const resp = await httpPost(apiPath, body, auth.cookieString, extraHeaders)
    const d = resp.data
    return {
      status: resp.status,
      success: resp.status === 200 && !d.error && !d.code,
      error: d.error || d.message || d.msg,
      result: d.data || d.result,
      requestId: d.requestId || d.request_id,
    }
  } catch (e) {
    return { success: false, error: { message: e.message } }
  }
}

// ============ 抢购循环 ============

async function apiGrabLoop(auth) {
  const startTime = Date.now()
  const deadline = startTime + CONFIG.grabTimeout * 1000
  let attempt = 0
  let success = false
  let lastLogTime = 0

  while (Date.now() < deadline && !success) {
    attempt++
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    const now = Date.now()

    try {
      const result = await callSubscribeApi(auth)

      if (result.success) {
        log(PLATFORM, `🎉🎉🎉 #${attempt} | ${elapsed}s | 订阅成功！`)
        log(PLATFORM, `   RequestId: ${result.requestId}`)
        log(PLATFORM, `   Result: ${JSON.stringify(result.result)}`)
        success = true
        break
      }

      const errorMsg = result.error?.message || result.error || '未知错误'

      // 前 3 次输出完整响应用于调试
      if (attempt <= 3) {
        log(
          PLATFORM,
          `🔍 #${attempt} 响应: status=${result.status}, success=${result.success}, error=${JSON.stringify(result.error)}, result=${JSON.stringify(result.result)}`,
        )
      }

      if (
        typeof errorMsg === 'string' &&
        (errorMsg.includes('库存不足') ||
          errorMsg.includes('sold out') ||
          errorMsg.includes('empty'))
      ) {
        if (now - lastLogTime > 2000) {
          log(PLATFORM, `⏳ #${attempt} | ${elapsed}s | 库存不足，继续抢...`)
          lastLogTime = now
        }
      } else if (
        typeof errorMsg === 'string' &&
        (errorMsg.includes('未授权') ||
          errorMsg.includes('unauthorized') ||
          errorMsg.includes('401') ||
          errorMsg.includes('token') ||
          errorMsg.includes('expired'))
      ) {
        log(PLATFORM, `❌ #${attempt} | 认证失效: ${errorMsg}`)
        log(PLATFORM, '💡 Cookies 已过期，请重新运行: node zhipu-setup.js')
        break
      } else if (result.status === 401 || result.status === 403) {
        log(PLATFORM, `❌ #${attempt} | HTTP ${result.status} 认证失效`)
        log(PLATFORM, '💡 Cookies 已过期，请重新运行: node zhipu-setup.js')
        break
      } else if (
        typeof errorMsg === 'string' &&
        (errorMsg.includes('已购买') ||
          errorMsg.includes('已订阅') ||
          errorMsg.includes('already'))
      ) {
        log(PLATFORM, `❌ #${attempt} | 已购买: ${errorMsg}`)
        break
      } else {
        if (now - lastLogTime > 3000) {
          log(PLATFORM, `⚠️  #${attempt} | ${elapsed}s | ${errorMsg}`)
          lastLogTime = now
        }
      }

      await sleep(CONFIG.grabInterval)
    } catch (e) {
      log(PLATFORM, `❌ #${attempt} | 异常: ${e.message}`)
      await sleep(CONFIG.grabInterval * 2)
    }
  }

  if (!success) {
    log(PLATFORM, `⏰ 抢购超时 (${CONFIG.grabTimeout}s)，共尝试 ${attempt} 次`)
  }
  return success
}

// ============ 主流程 ============

async function run() {
  log(PLATFORM, '╔══════════════════════════════════════════════════╗')
  log(PLATFORM, '║   智谱 GLM Coding 纯 API 抢购脚本 (无浏览器)   ║')
  log(PLATFORM, '╚══════════════════════════════════════════════════╝')
  log(PLATFORM, '')
  log(PLATFORM, `📋 目标: Lite 连续包年`)
  log(PLATFORM, `⚡ 模式: 纯 Node.js HTTPS 调用`)
  log(PLATFORM, `⏱️  间隔: ${CONFIG.grabInterval}ms/次`)
  log(PLATFORM, '')

  // 加载认证
  const auth = loadAuth()
  if (!auth) {
    log(PLATFORM, '❌ 未找到认证信息！')
    log(PLATFORM, '💡 请先运行: node zhipu-setup.js')
    return
  }

  // 检查认证时效
  if (auth.savedAt) {
    const hours = (Date.now() - new Date(auth.savedAt).getTime()) / 3600000
    if (hours > 6) {
      log(PLATFORM, `⚠️  认证已保存 ${hours.toFixed(1)} 小时，可能过期`)
    }
  }

  log(PLATFORM, `✅ 已加载认证 | Cookies: ${auth.cookies?.length || 0} 个`)
  const apiEndpoint = auth.apiEndpoint || CONFIG.defaultApiPath
  log(PLATFORM, `   API 端点: ${apiEndpoint}`)
  log(
    PLATFORM,
    `   请求体: ${JSON.stringify(auth.apiBody || CONFIG.defaultApiBody)}`,
  )

  // 等待开抢
  const ms = msUntil(CONFIG.refreshHour, 0, 0)
  if (ms > 60000) {
    log(PLATFORM, `⏳ 距离 10:00 开抢还有 ${Math.ceil(ms / 60000)} 分钟`)
    await countdownWait(PLATFORM, CONFIG.refreshHour, ms)
  }

  // 开始抢购
  log(PLATFORM, '')
  log(PLATFORM, '🔥🔥🔥 开始 API 抢购！')
  log(
    PLATFORM,
    `   间隔: ${CONFIG.grabInterval}ms | 超时: ${CONFIG.grabTimeout}s`,
  )
  log(PLATFORM, '')

  const success = await apiGrabLoop(auth)

  if (success) {
    log(PLATFORM, '')
    log(PLATFORM, '🎊🎊🎊 抢购成功！请登录智谱完成支付')
    log(PLATFORM, '   https://www.bigmodel.cn/glm-coding')
  }

  log(PLATFORM, '')
  log(PLATFORM, '🏁 脚本执行完毕')
}

if (require.main === module) {
  run()
}

module.exports = { run }
