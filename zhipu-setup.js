/**
 * 智谱 GLM Coding - 一次性登录 & API 探测
 *
 * 运行一次，手动登录后自动：
 *   1. 拦截点击"订阅"按钮时的 API 请求
 *   2. 提取 cookies 和认证信息
 *   3. 保存到 .auth/zhipu-cookies.json
 *
 * 之后 grab-zhipu-api.js 直接读取 cookies 文件，无需浏览器
 *
 * 用法: node zhipu-setup.js
 */

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { log, sleep, ensureDir, createBrowserContext } = require('./lib/common')

const PLATFORM = '智谱Setup'
const URL = 'https://www.bigmodel.cn/glm-coding?plantype=personal'
const AUTH_DIR = path.resolve(__dirname, '.auth')
const COOKIES_FILE = path.join(AUTH_DIR, 'zhipu-cookies.json')

async function run() {
  await ensureDir(AUTH_DIR)

  log(PLATFORM, '🔧 智谱 GLM Coding - API 探测工具')
  log(PLATFORM, '')
  log(PLATFORM, '即将打开浏览器，请手动登录智谱账号')
  log(PLATFORM, '登录完成后脚本会自动探测 API 端点并保存认证信息')
  log(PLATFORM, '')

  const { browser, context } = await createBrowserContext(chromium, {
    headless: false,
  })

  const page = await context.newPage()

  try {
    // 打开页面
    log(PLATFORM, '📂 打开智谱 GLM Coding 页面...')
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(3000)

    // 检查登录状态（智谱可能用 localStorage 或 cookie）
    const isLoggedIn = await page.evaluate(() => {
      // 检查常见登录标识
      const cookies = document.cookie
      const hasToken = cookies.includes('token') || cookies.includes('session')
      const hasUserInfo = !!document.querySelector(
        '[class*="avatar"], [class*="user"], [class*="login"]',
      )
      return hasToken || hasUserInfo
    })

    if (!isLoggedIn) {
      log(PLATFORM, '')
      log(PLATFORM, '⏳ 等待登录... 请在浏览器中完成登录')
      log(PLATFORM, '   登录完成后，脚本会自动继续')
      log(PLATFORM, '')

      // 等待登录完成（检测页面变化）
      await page.waitForFunction(
        () => {
          const cookies = document.cookie
          return (
            cookies.includes('token') ||
            cookies.includes('session') ||
            !!document.querySelector('[class*="avatar"]')
          )
        },
        { timeout: 600000 },
      )
      await sleep(2000)
    }

    log(PLATFORM, '✅ 检测到登录状态')

    // 切换到连续包年 tab
    log(PLATFORM, '🏷️  切换到「连续包年」标签...')
    await page.evaluate(() => {
      // 查找并点击"连续包年"或"8折"标签
      const allEls = document.querySelectorAll('*')
      for (const el of allEls) {
        const text = el.innerText?.trim()
        if (
          (text === '连续包年' || text.includes('8折')) &&
          el.children.length <= 2
        ) {
          el.click()
          return
        }
      }
    })
    await sleep(1500)

    // 注入 fetch 拦截器
    log(PLATFORM, '🔍 注入 API 拦截器...')
    await page.evaluate(() => {
      window.__zhipuApiCapture = {
        requests: [],
        origFetch: window.fetch,
        origXHROpen: XMLHttpRequest.prototype.open,
        origXHRSend: XMLHttpRequest.prototype.send,
      }

      // 拦截 fetch
      window.fetch = function (url, options) {
        const entry = {
          type: 'fetch',
          url: typeof url === 'string' ? url : url.url,
          method: options?.method || 'GET',
          headers: options?.headers || {},
          body: options?.body || null,
          timestamp: Date.now(),
        }
        window.__zhipuApiCapture.requests.push(entry)
        return window.__zhipuApiCapture.origFetch.apply(this, arguments)
      }

      // 拦截 XMLHttpRequest
      XMLHttpRequest.prototype.open = function (method, url) {
        this.__captureMethod = method
        this.__captureUrl = url
        return window.__zhipuApiCapture.origXHROpen.apply(this, arguments)
      }
      XMLHttpRequest.prototype.send = function (body) {
        const entry = {
          type: 'xhr',
          url: this.__captureUrl,
          method: this.__captureMethod,
          body: body,
          timestamp: Date.now(),
        }
        window.__zhipuApiCapture.requests.push(entry)
        return window.__zhipuApiCapture.origXHRSend.apply(this, arguments)
      }
    })

    log(PLATFORM, '✅ 拦截器已注入')
    log(PLATFORM, '')
    log(PLATFORM, '══════════════════════════════════════')
    log(PLATFORM, '👉 请手动点击 [Lite] 的「特惠订阅」按钮')
    log(PLATFORM, '   然后完成弹窗中的确认操作')
    log(PLATFORM, '   脚本会拦截并记录所有 API 请求')
    log(PLATFORM, '   (可以多点几次，脚本会持续捕获)')
    log(PLATFORM, '══════════════════════════════════════')
    log(PLATFORM, '')

    // 等待用户点击按钮并捕获 API 请求（优先找 POST 请求）
    const apiInfo = await page.evaluate(() => {
      return new Promise((resolve) => {
        let checkCount = 0
        const maxChecks = 180 // 最多等 90 秒

        const checker = setInterval(() => {
          checkCount++
          const requests = window.__zhipuApiCapture.requests

          // 优先找 POST 请求（实际创建订单的 API）
          const postRequest = requests.find(
            (r) =>
              r.method === 'POST' &&
              r.url &&
              (r.url.includes('subscribe') ||
                r.url.includes('order') ||
                r.url.includes('purchase') ||
                r.url.includes('buy') ||
                r.url.includes('trade') ||
                r.url.includes('pay') ||
                r.url.includes('billing')),
          )

          if (postRequest) {
            clearInterval(checker)
            resolve({
              found: true,
              request: postRequest,
              allRequests: requests.filter(
                (r) =>
                  !r.url.includes('analytics') &&
                  !r.url.includes('log') &&
                  !r.url.includes('monitor') &&
                  !r.url.includes('sentry'),
              ),
            })
          } else if (checkCount >= maxChecks) {
            clearInterval(checker)
            // 没找到 POST，返回所有捕获的请求供分析
            resolve({
              found: false,
              allRequests: requests.filter(
                (r) =>
                  !r.url.includes('analytics') &&
                  !r.url.includes('log') &&
                  !r.url.includes('monitor') &&
                  !r.url.includes('sentry'),
              ),
            })
          }
        }, 500)
      })
    })

    // 恢复原始 fetch 和 XHR
    await page.evaluate(() => {
      window.fetch = window.__zhipuApiCapture.origFetch
      XMLHttpRequest.prototype.open = window.__zhipuApiCapture.origXHROpen
      XMLHttpRequest.prototype.send = window.__zhipuApiCapture.origXHRSend
    })

    // 提取 cookies
    const cookies = await context.cookies()
    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const authData = {
      cookieString,
      cookies: cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
      })),
      savedAt: new Date().toISOString(),
    }

    // 保存 API 信息
    if (apiInfo.found) {
      log(PLATFORM, '🎉 成功捕获订阅 API 请求！')
      log(PLATFORM, `   URL: ${apiInfo.request.url}`)
      log(PLATFORM, `   Method: ${apiInfo.request.method}`)
      log(PLATFORM, `   Body: ${apiInfo.request.body}`)

      authData.apiEndpoint = apiInfo.request.url
      authData.apiMethod = apiInfo.request.method
      authData.apiBody = apiInfo.request.body
      authData.apiHeaders = apiInfo.request.headers
    } else {
      log(PLATFORM, '⚠️  未捕获到 POST 订阅请求')
      log(PLATFORM, `   共捕获 ${apiInfo.allRequests.length} 个请求:`)
      apiInfo.allRequests.forEach((r, i) => {
        const bodyPreview = r.body
          ? ` | Body: ${String(r.body).substring(0, 100)}`
          : ''
        log(PLATFORM, `   ${i + 1}. [${r.method}] ${r.url}${bodyPreview}`)
      })

      // 保存所有请求供分析
      authData.allRequests = apiInfo.allRequests
    }

    // 保存到文件
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(authData, null, 2), 'utf-8')

    log(PLATFORM, '')
    log(PLATFORM, '✅ 认证信息已保存！')
    log(PLATFORM, `   文件: ${COOKIES_FILE}`)
    log(PLATFORM, `   Cookies: ${cookies.length} 个`)
    log(PLATFORM, `   保存时间: ${authData.savedAt}`)

    if (apiInfo.found) {
      log(PLATFORM, '')
      log(PLATFORM, '💡 现在可以使用纯 API 模式运行:')
      log(PLATFORM, '   node grab-all.js zhipu --api')
      log(PLATFORM, '   或')
      log(PLATFORM, '   node grab-zhipu-api.js')
    } else {
      log(PLATFORM, '')
      log(PLATFORM, '💡 请检查保存的请求信息，可能需要手动配置 API 端点')
      log(PLATFORM, '   文件位置: ' + COOKIES_FILE)
    }

    log(PLATFORM, '')
    log(PLATFORM, '⚠️  注意: Cookies 会在数小时后过期')
    log(PLATFORM, '   如果遇到认证错误，请重新运行此脚本')
    log(PLATFORM, '')

    // 等待用户确认
    log(PLATFORM, '按 Enter 关闭浏览器...')
    await new Promise((resolve) => {
      process.stdin.once('data', resolve)
    })
  } catch (e) {
    log(PLATFORM, `❌ 异常: ${e.message}`)
    console.error(e)
  } finally {
    await browser.close()
  }
}

if (require.main === module) {
  run()
}

module.exports = { run }
