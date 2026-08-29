#!/usr/bin/env node

/**
 * 自动截取天河区政府网站新闻缩略图
 *
 * 使用方法：
 * 1. 安装依赖：npm install --save-dev puppeteer
 * 2. 运行脚本：node scripts/capture-news-thumbnails.mjs
 */

import puppeteer from 'puppeteer'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const OUTPUT_DIR = join(__dirname, '../public/news-thumbnails')

// 新闻页面配置
const NEWS_PAGES = [
  {
    id: 1,
    url: 'http://www.thnet.gov.cn/',
    title: '天河区发布2026年度科技创新扶持政策',
    outputFile: 'news-1.jpg'
  },
  {
    id: 2,
    url: 'http://www.thnet.gov.cn/',
    title: '小微企业首达标支持申报指南公布',
    outputFile: 'news-2.jpg'
  },
  {
    id: 3,
    url: 'http://www.thnet.gov.cn/',
    title: '软件产业发展专项资金开始申报',
    outputFile: 'news-3.jpg'
  }
]

async function captureScreenshot(page, config) {
  console.log(`📸 正在截取: ${config.title}`)
  console.log(`   URL: ${config.url}`)

  try {
    // 访问页面
    await page.goto(config.url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    })

    // 等待页面完全加载
    await page.waitForTimeout(2000)

    // 设置视口大小为截图尺寸
    await page.setViewport({
      width: 1400,
      height: 900
    })

    // 截取可见区域
    const outputPath = join(OUTPUT_DIR, config.outputFile)
    await page.screenshot({
      path: outputPath,
      clip: {
        x: 0,
        y: 0,
        width: 280,
        height: 160
      },
      type: 'jpeg',
      quality: 85
    })

    console.log(`   ✅ 已保存到: ${config.outputFile}`)
    return true
  } catch (error) {
    console.error(`   ❌ 截图失败: ${error.message}`)
    return false
  }
}

async function main() {
  console.log('🚀 开始截取天河区政府网站新闻缩略图...\n')

  // 确保输出目录存在
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true })
  } catch (error) {
    // 目录已存在，忽略错误
  }

  // 启动浏览器
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  try {
    const page = await browser.newPage()

    // 设置用户代理
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    let successCount = 0
    for (const config of NEWS_PAGES) {
      const success = await captureScreenshot(page, config)
      if (success) successCount++

      // 延迟避免请求过快
      await page.waitForTimeout(1000)
    }

    console.log(`\n📊 完成！成功截取 ${successCount}/${NEWS_PAGES.length} 张图片`)

    if (successCount < NEWS_PAGES.length) {
      console.log('\n⚠️  部分截图失败，请检查网络连接或 URL 是否正确')
    }
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error('❌ 脚本执行失败:', error)
  process.exit(1)
})
