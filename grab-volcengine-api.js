/**
 * 火山引擎 方舟 Coding Plan - Lite 纯 API 抢购模块
 *
 * 纯 Node.js HTTP 请求，不依赖浏览器/Playwright
 * 依赖: 先运行 node volcengine-setup.js 提取 cookies
 *
 * API 流程：
 *   1. POST /api/activity/AllowCreateSubscribeTrade — 检查是否可下单
 *   2. POST /api/v2/top/activity/bill_volc_provider/CommonBuy/2020-01-01/cn-beijing — 创建订单
 *
 * 刷新时间：每天 0:00
 */

const https = require('https')
const fs = require('fs')
const path = require('path')
const {
  log,
  sleep,
  msUntil,
  formatMs,
  countdownWait,
  ensureDir,
} = require('./lib/common')

const PLATFORM = '火山API'
const CONFIG = {
  refreshHour: 0,
  grabTimeout: 300, // 抢购超时秒
  grabInterval: 80, // API 调用间隔 ms（纯 HTTP 比浏览器快 4 倍）
}

const AUTH_DIR = path.resolve(__dirname, '.auth')
const COOKIES_FILE = path.join(AUTH_DIR, 'volcengine-cookies.json')

// API 端点
const API_HOST = 'www.volcengine.com'
const API_PATHS = {
  allowTrade: '/api/activity/AllowCreateSubscribeTrade',
  commonBuy:
    '/api/v2/top/activity/bill_volc_provider/CommonBuy/2020-01-01/cn-beijing',
}

// 产品参数（从抓包获得，固定值）
const PRODUCT = {
  productCode: 'ark_bd',
  configurationCode: 'Coding_Plan_Lite_monthly',
  chargeItemCode: 'Coding_Plan_Lite_monthly_cn-beijing',
  defaultIndexKey: 'ark_bd||d6qje3vddelfm06eis90',
}

// ============ HTTP 工具 ============

function httpsPost(urlPath, body, cookieString, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body)
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
        Origin: 'https://www.volcengine.com',
        Referer:
          'https://www.volcengine.com/activity/codingplan?infrom=100009.902.26',
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

async function checkAllowOrder(auth) {
  try {
    const resp = await httpsPost(
      API_PATHS.allowTrade,
      {
        ProductCode: PRODUCT.productCode,
        ConfigurationCode: PRODUCT.configurationCode,
      },
      auth.cookieString,
      { 'x-use-bff-version': '1', 'x-csrf-token': auth.csrfToken },
    )
    const d = resp.data
    return {
      success: resp.status === 200,
      canOrder: d.Result?.CanOrder || false,
      isPurchased: d.Result?.IsPurchased || false,
      error: d.ResponseMetadata?.Error,
    }
  } catch (e) {
    return { success: false, error: { Message: e.message } }
  }
}

async function createOrder(auth, indexKey) {
  try {
    const resp = await httpsPost(
      API_PATHS.commonBuy,
      {
        IndexKey: indexKey || PRODUCT.defaultIndexKey,
        ConfigList: [
          {
            Product: PRODUCT.productCode,
            ConfigurationCode: PRODUCT.configurationCode,
            Quantity: 1,
            Duration: 12,
            DurationUnit: 'monthly',
            ChargeItemList: [
              { ChargeItemCode: PRODUCT.chargeItemCode, Count: '1' },
            ],
            RenewType: 2,
            PurchaseTimes: 1,
          },
        ],
        SignPay: true,
      },
      auth.cookieString,
      {
        'x-csrf-token': auth.csrfToken,
        'x-language': 'zh',
        'monitor-huoshan-web-id': auth.huoshanWebId || '',
      },
    )
    const d = resp.data
    return {
      status: resp.status,
      success: resp.status === 200 && !d.ResponseMetadata?.Error,
      error: d.ResponseMetadata?.Error,
      result: d.Result,
      requestId: d.ResponseMetadata?.RequestId,
    }
  } catch (e) {
    return { success: false, error: { Message: e.message } }
  }
}

// ============ 抢购循环 ============

async function apiGrabLoop(auth, indexKey) {
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
      const orderResult = await createOrder(auth, indexKey)

      if (orderResult.success) {
        log(PLATFORM, `🎉🎉🎉 #${attempt} | ${elapsed}s | 订单创建成功！`)
        log(PLATFORM, `   RequestId: ${orderResult.requestId}`)
        log(PLATFORM, `   Result: ${JSON.stringify(orderResult.result)}`)
        success = true
        break
      }

      const errorCode = orderResult.error?.Code || ''
      const errorMsg = orderResult.error?.Message || '未知错误'

      // 前 3 次输出完整响应用于调试
      if (attempt <= 3) {
        log(
          PLATFORM,
          `🔍 #${attempt} 响应: status=${orderResult.status}, error=${JSON.stringify(orderResult.error)}, result=${JSON.stringify(orderResult.result)}`,
        )
      }

      if (errorMsg.includes('库存不足')) {
        if (now - lastLogTime > 2000) {
          log(PLATFORM, `⏳ #${attempt} | ${elapsed}s | 库存不足，继续抢...`)
          lastLogTime = now
        }
      } else if (
        errorMsg.includes('未授权') ||
        errorMsg.includes('UnauthorizedAccess') ||
        errorMsg.includes('NotLogin') ||
        errorMsg.includes('not logged in')
      ) {
        log(PLATFORM, `❌ #${attempt} | 认证失效: ${errorMsg}`)
        log(PLATFORM, '💡 Cookies 已过期，请重新运行: node volcengine-setup.js')
        break
      } else if (errorMsg.includes('限购')) {
        log(PLATFORM, `❌ #${attempt} | 已达限购: ${errorMsg}`)
        break
      } else {
        if (now - lastLogTime > 3000) {
          log(
            PLATFORM,
            `⚠️  #${attempt} | ${elapsed}s | ${errorCode}: ${errorMsg}`,
          )
          lastLogTime = now
        }
      }

      // 定期检查
      if (attempt % 100 === 0) {
        const allowResult = await checkAllowOrder(auth)
        log(
          PLATFORM,
          `📋 例行检查: CanOrder=${allowResult.canOrder}, IsPurchased=${allowResult.isPurchased}`,
        )
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
  log(PLATFORM, '║   火山引擎 纯 API 抢购脚本 (无浏览器依赖)      ║')
  log(PLATFORM, '╚══════════════════════════════════════════════════╝')
  log(PLATFORM, '')
  log(PLATFORM, `📋 目标: Lite 连续包年 ¥419.80/年`)
  log(PLATFORM, `⚡ 模式: 纯 Node.js HTTPS 调用`)
  log(PLATFORM, `⏱️  间隔: ${CONFIG.grabInterval}ms/次`)
  log(PLATFORM, '')

  // 加载认证
  const auth = loadAuth()
  if (!auth) {
    log(PLATFORM, '❌ 未找到认证信息！')
    log(PLATFORM, '💡 请先运行: node volcengine-setup.js')
    return
  }

  // 检查认证时效
  if (auth.savedAt) {
    const hours = (Date.now() - new Date(auth.savedAt).getTime()) / 3600000
    if (hours > 6) {
      log(PLATFORM, `⚠️  认证已保存 ${hours.toFixed(1)} 小时，可能过期`)
    }
  }

  log(PLATFORM, `✅ 已加载认证 | AccountID: ${auth.accountId}`)
  log(PLATFORM, `   IndexKey: ${auth.indexKey}`)

  // 验证认证
  log(PLATFORM, '🔍 验证认证有效性...')
  const allowResult = await checkAllowOrder(auth)

  if (
    !allowResult.success &&
    allowResult.error?.Code === 'UnauthorizedAccess'
  ) {
    log(PLATFORM, '❌ 认证已失效！')
    log(PLATFORM, '💡 请重新运行: node volcengine-setup.js')
    return
  }

  log(
    PLATFORM,
    `📋 当前状态: CanOrder=${allowResult.canOrder}, IsPurchased=${allowResult.isPurchased}`,
  )

  if (allowResult.isPurchased) {
    log(PLATFORM, '✅ 已购买过此计划，无需重复购买')
    return
  }

  // 等待开抢
  const ms = msUntil(CONFIG.refreshHour, 0, 0)
  if (ms > 60000) {
    log(PLATFORM, `⏳ 距离 0:00 开抢还有 ${Math.ceil(ms / 60000)} 分钟`)
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

  const success = await apiGrabLoop(auth, auth.indexKey)

  if (success) {
    log(PLATFORM, '')
    log(PLATFORM, '🎊🎊🎊 抢购成功！请登录火山引擎完成支付')
    log(PLATFORM, '   https://www.volcengine.com/activity/codingplan')
  }

  log(PLATFORM, '')
  log(PLATFORM, '🏁 脚本执行完毕')
}

if (require.main === module) {
  run()
}

module.exports = { run }
