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
const NEWS_FILE = join(__dirname, '../data/news.json')

async function loadNewsData() {
  try {
    const content = await fs.readFile(NEWS_FILE, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.error('❌ 无法读取 data/news.json:', error.message)
    process.exit(1)
  }
}

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
    const thumbnailPath = config.thumbnail.replace(/^\//, '')
    const outputPath = join(__dirname, '../public', thumbnailPath)

    // 提取文件扩展名，如果是 SVG 则改为 JPG
    const ext = thumbnailPath.endsWith('.svg') ? 'jpg' : thumbnailPath.split('.').pop()
    const finalPath = outputPath.replace(/\.svg$/, '.jpg')

    await page.screenshot({
      path: finalPath,
      clip: {
        x: 0,
        y: 0,
        width: 280,
        height: 160
      },
      type: 'jpeg',
      quality: 85
    })

    console.log(`   ✅ 已保存到: ${thumbnailPath.replace(/\.svg$/, '.jpg')}`)
    return true
  } catch (error) {
    console.error(`   ❌ 截图失败: ${error.message}`)
    return false
  }
}

async function main() {
  console.log('🚀 开始截取天河区政府网站新闻缩略图...\n')

  // 从 data/news.json 加载新闻数据
  const newsData = await loadNewsData()
  console.log(`📰 加载了 ${newsData.length} 条新闻\n`)

  // 确保输出目录存在
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true })
  } catch (error) {
    // 目录已存在，忽略错误
  }

  // 启动浏览器
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  })

  try {
    const page = await browser.newPage()

    // 设置用户代理
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    let successCount = 0
    for (const news of newsData) {
      const success = await captureScreenshot(page, news)
      if (success) successCount++

      // 延迟避免请求过快
      await page.waitForTimeout(1000)
    }

    console.log(`\n📊 完成！成功截取 ${successCount}/${newsData.length} 张图片`)

    if (successCount < newsData.length) {
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
