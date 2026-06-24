/**
 * 火山引擎 一次性登录 & Cookies 提取
 *
 * 运行一次，手动登录后自动保存认证信息到 .auth/volcengine-cookies.json
 * 之后 grab-volcengine-api.js 直接读取 cookies 文件，无需再打开浏览器
 *
 * 用法: node volcengine-setup.js
 */

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { log, sleep, ensureDir, createBrowserContext } = require('./lib/common')

const PLATFORM = '火山Setup'
const URL =
  'https://www.volcengine.com/activity/codingplan?infrom=100009.902.26'
const AUTH_DIR = path.resolve(__dirname, '.auth')
const COOKIES_FILE = path.join(AUTH_DIR, 'volcengine-cookies.json')

async function run() {
  await ensureDir(AUTH_DIR)

  log(PLATFORM, '🔧 火山引擎 认证信息提取工具')
  log(PLATFORM, '')
  log(PLATFORM, '即将打开浏览器，请手动登录火山引擎')
  log(PLATFORM, '登录完成后脚本会自动提取并保存认证信息')
  log(PLATFORM, '')

  const { browser, context } = await createBrowserContext(chromium, {
    headless: false,
  })

  const page = await context.newPage()

  try {
    // 打开页面
    log(PLATFORM, '📂 打开火山引擎 Coding Plan 页面...')
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(3000)

    // 检查是否已登录
    const hasAccountId = await page.evaluate(() => {
      return !!document.cookie.match(/AccountID=\d+/)
    })

    if (!hasAccountId) {
      log(PLATFORM, '')
      log(PLATFORM, '⏳ 等待登录... 请在浏览器中完成登录')
      log(PLATFORM, '   (检测到 AccountID cookie 后自动继续)')
      log(PLATFORM, '')

      // 等待登录完成
      await page.waitForFunction(
        () => !!document.cookie.match(/AccountID=\d+/),
        { timeout: 600000 }, // 10 分钟超时
      )
      await sleep(2000) // 额外等待 cookie 写入
    }

    log(PLATFORM, '✅ 检测到登录状态，正在提取认证信息...')

    // 切换到连续包年 tab（让页面加载完整的 API 数据）
    log(PLATFORM, '🏷️  切换到「连续包年」标签...')
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('[role="tab"]')
      for (const tab of tabs) {
        if (tab.innerText?.includes('连续包年')) {
          tab.click()
          return
        }
      }
    })
    await sleep(2000)

    // 获取 IndexKey（通过拦截按钮点击的 API 请求）
    log(PLATFORM, '🔑 提取 IndexKey...')
    const indexKey = await page.evaluate(() => {
      return new Promise((resolve) => {
        const origFetch = window.fetch
        let found = ''

        window.fetch = function (url, options) {
          if (
            typeof url === 'string' &&
            url.includes('CommonBuy') &&
            options?.body
          ) {
            try {
              const body = JSON.parse(options.body)
              if (body.IndexKey) {
                found = body.IndexKey
                window.fetch = origFetch
                resolve(found)
              }
            } catch (e) {}
          }
          return origFetch.apply(this, arguments)
        }

        // 点击 Lite 立即订阅按钮来触发 API 请求
        const btns = document.querySelectorAll('[class*="buttonLabel"]')
        for (const btn of btns) {
          if (btn.innerText?.trim() === '立即订阅') {
            let parent = btn
            for (let i = 0; i < 10; i++) {
              parent = parent.parentElement
              if (!parent) break
              if (
                parent.innerText?.includes('Lite') &&
                !parent.innerText?.includes('Pro')
              ) {
                btn.click()
                setTimeout(() => {
                  if (!found) {
                    window.fetch = origFetch
                    resolve('')
                  }
                }, 8000)
                return
              }
            }
          }
        }

        setTimeout(() => {
          window.fetch = origFetch
          resolve('')
        }, 5000)
      })
    })

    // 提取认证信息（使用 context.cookies() 获取 HttpOnly cookies）
    const allCookies = await context.cookies()
    const cookieString = allCookies
      .filter((c) => c.domain.includes('volcengine.com'))
      .map((c) => `${c.name}=${c.value}`)
      .join('; ')

    const authData = {
      csrfToken: (cookieString.match(/csrfToken=([^;]+)/) || [])[1] || '',
      accountId: (cookieString.match(/AccountID=([^;]+)/) || [])[1] || '',
      huoshanWebId:
        (cookieString.match(/monitor_huoshan_web_id=([^;]+)/) || [])[1] || '',
      cookieString: cookieString,
      allCookies: allCookies.filter((c) => c.domain.includes('volcengine.com')),
    }

    // 合并 IndexKey
    authData.indexKey = indexKey || 'ark_bd||d6qje3vddelfm06eis90'
    authData.savedAt = new Date().toISOString()

    // 保存到文件
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(authData, null, 2), 'utf-8')

    log(PLATFORM, '')
    log(PLATFORM, '✅ 认证信息已保存！')
    log(PLATFORM, `   文件: ${COOKIES_FILE}`)
    log(PLATFORM, `   AccountID: ${authData.accountId}`)
    log(PLATFORM, `   CSRF Token: ${authData.csrfToken}`)
    log(PLATFORM, `   IndexKey: ${authData.indexKey}`)
    log(
      PLATFORM,
      `   Cookies 数量: ${authData.allCookies.length} 个（含 HttpOnly）`,
    )
    log(PLATFORM, `   保存时间: ${authData.savedAt}`)
    log(PLATFORM, '')
    log(PLATFORM, '💡 现在可以使用纯 API 模式运行:')
    log(PLATFORM, '   node grab-all.js volcengine --api')
    log(PLATFORM, '   或')
    log(PLATFORM, '   node grab-volcengine-api.js')
    log(PLATFORM, '')
    log(PLATFORM, '⚠️  注意: Cookies 会在数小时后过期')
    log(PLATFORM, '   如果遇到 "未授权访问" 错误，请重新运行此脚本')
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

run()
