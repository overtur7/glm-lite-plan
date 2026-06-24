/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║   GLM Coding Plan & 方舟 Coding Plan - Lite 抢购脚本   ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * 使用方法：
 *   node grab-all.js              # 双平台同时抢（推荐，浏览器点击模式）
 *   node grab-all.js --api        # 双平台同时抢（API 直调模式，更快更可靠）
 *   node grab-all.js zhipu        # 只抢智谱（10:00刷新）
 *   node grab-all.js volcengine   # 只抢火山（0:00刷新）
 *   node grab-all.js zhipu --api  # 只抢智谱（API 直调模式）
 *   node grab-all.js volcengine --api  # 只抢火山（API 直调模式）
 *   node grab-all.js --now        # 跳过倒计时，立即开始
 *
 * 前置条件（API 模式）：
 *   node volcengine-setup.js   # 火山引擎 cookies 提取（只需一次）
 *   node zhipu-setup.js        # 智谱 cookies 提取（只需一次）
 *
 * 工作流程：
 *   1. 启动后自动倒计时到各自的开抢时刻
 *   2. 开抢前 500ms 打开浏览器
 *   3. 用户手动登录（有验证码无法自动化）
 *   4. 登录后自动循环抢购
 *   5. 检测到支付页面即成功
 */

const { log, sleep } = require('./lib/common')

// 解析命令行参数
const args = process.argv.slice(2)
const skipWait = args.includes('--now')
const useApi = args.includes('--api')
const target = args.find((a) => !a.startsWith('--')) || 'all'

async function main() {
  log('MAIN', '╔══════════════════════════════════════════════════╗')
  log('MAIN', '║        Coding Plan Lite 双平台抢购脚本          ║')
  log('MAIN', '╚══════════════════════════════════════════════════╝')
  log('MAIN', '')
  log('MAIN', `🔧 模式: ${useApi ? 'API 直调（更快更可靠）' : '浏览器点击'}`)
  log('MAIN', '')

  const tasks = []

  if (target === 'all' || target === 'zhipu') {
    log('MAIN', '📌 智谱 GLM Coding - 每天 10:00 刷新订阅')
  }
  if (target === 'all' || target === 'volcengine') {
    log('MAIN', '📌 火山引擎 方舟 Coding Plan - 每天 0:00 刷新订阅')
  }
  log('MAIN', '')

  // 启动智谱抢购（支持 API 模式）
  if (target === 'all' || target === 'zhipu') {
    if (useApi) {
      // API 直调模式 — 直接调用后端 API，不依赖 DOM 操作
      log('MAIN', '🚀 智谱: 使用 API 直调模式')
      const zhipuApi = require('./grab-zhipu-api')
      tasks.push(
        zhipuApi.run().catch((err) => {
          log('MAIN', `💥 智谱 API 脚本异常: ${err.message}`)
        }),
      )
    } else {
      // 传统点击模式
      const zhipu = require('./grab-zhipu')
      tasks.push(
        zhipu.run(!skipWait).catch((err) => {
          log('MAIN', `💥 智谱脚本异常: ${err.message}`)
        }),
      )
    }
  }

  // 启动火山抢购（支持 API 模式）
  if (target === 'all' || target === 'volcengine') {
    if (useApi) {
      // API 直调模式 — 直接调用后端 API，不依赖 DOM 操作
      log('MAIN', '🚀 火山引擎: 使用 API 直调模式')
      const volcApi = require('./grab-volcengine-api')
      tasks.push(
        volcApi.run().catch((err) => {
          log('MAIN', `💥 火山 API 脚本异常: ${err.message}`)
        }),
      )
    } else {
      // 传统点击模式
      const volc = require('./grab-volcengine')
      tasks.push(
        volc.run(!skipWait).catch((err) => {
          log('MAIN', `💥 火山脚本异常: ${err.message}`)
        }),
      )
    }
  }

  // 等待所有任务完成
  await Promise.all(tasks)

  log('MAIN', '')
  log('MAIN', '🏁 所有抢购任务已完成')
}

main().catch((err) => {
  console.error('💥 主程序异常:', err)
  process.exit(1)
})
