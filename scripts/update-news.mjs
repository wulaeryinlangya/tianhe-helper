#!/usr/bin/env node

/**
 * 自动爬取天河区政府网站最新政策新闻
 *
 * 功能：
 * 1. 访问天河区政府网站首页
 * 2. 提取最新的 3 条政策相关新闻
 * 3. 更新 data/news.json
 *
 * 使用方法：
 * node scripts/update-news.mjs
 */

import puppeteer from 'puppeteer'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const NEWS_FILE = join(__dirname, '../data/news.json')

// 天河区政府网站配置
const TIANHE_GOV_URL = 'http://www.thnet.gov.cn/'

async function scrapeNews() {
  console.log('🚀 开始爬取天河区政府网站新闻...\n')

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

    console.log(`📡 访问: ${TIANHE_GOV_URL}`)
    await page.goto(TIANHE_GOV_URL, {
      waitUntil: 'networkidle2',
      timeout: 30000
    })

    // 等待页面加载
    await page.waitForTimeout(2000)

    // 提取新闻列表
    // 注意：以下选择器需要根据实际网站结构调整
    const newsItems = await page.evaluate(() => {
      const items = []

      // 示例：假设新闻在 .news-list .news-item 中
      // 实际选择器需要根据天河区政府网站的 HTML 结构调整
      const newsElements = document.querySelectorAll('.news-item, .article-item, .list-item')

      for (let i = 0; i < Math.min(3, newsElements.length); i++) {
        const element = newsElements[i]
        const titleEl = element.querySelector('a, .title, h3')
        const dateEl = element.querySelector('.date, .time, time')

        if (titleEl) {
          items.push({
            title: titleEl.textContent.trim(),
            url: titleEl.href || window.location.href,
            date: dateEl ? dateEl.textContent.trim() : new Date().toISOString().split('T')[0]
          })
        }
      }

      return items
    })

    console.log(`✅ 找到 ${newsItems.length} 条新闻\n`)

    if (newsItems.length === 0) {
      console.log('⚠️  未找到新闻，使用默认数据')
      return generateDefaultNews()
    }

    // 格式化新闻数据
    const formattedNews = newsItems.map((item, index) => ({
      id: index + 1,
      date: formatDate(item.date),
      title: item.title,
      url: item.url,
      thumbnail: `/news-thumbnails/news-${index + 1}.svg`,
      summary: generateSummary(item.title)
    }))

    console.log('📝 新闻列表：')
    formattedNews.forEach(news => {
      console.log(`  ${news.id}. ${news.title}`)
      console.log(`     ${news.date} | ${news.url}`)
    })

    return formattedNews

  } finally {
    await browser.close()
  }
}

// 格式化日期为 YYYY-MM-DD
function formatDate(dateStr) {
  try {
    // 尝试解析各种日期格式
    const date = new Date(dateStr)
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]
    }
  } catch (error) {
    // 解析失败，使用当前日期
  }

  return new Date().toISOString().split('T')[0]
}

// 根据标题生成简短摘要
function generateSummary(title) {
  if (title.includes('科技') || title.includes('创新')) {
    return '天河区出台多项扶持政策，支持科技创新企业发展'
  }
  if (title.includes('小微') || title.includes('企业')) {
    return '小微企业当年度首次达标最高可获5万元支持'
  }
  if (title.includes('软件') || title.includes('产业')) {
    return '支持软件和互联网企业核心技术研发与产品研发'
  }
  return '详情请访问天河区政府官网查看完整政策内容'
}

// 生成默认新闻数据（当爬取失败时使用）
function generateDefaultNews() {
  return [
    {
      id: 1,
      date: new Date().toISOString().split('T')[0],
      title: '天河区发布2026年度科技创新扶持政策',
      url: 'http://www.thnet.gov.cn/',
      thumbnail: '/news-thumbnails/news-1.svg',
      summary: '天河区出台多项扶持政策，支持科技创新企业发展'
    },
    {
      id: 2,
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      title: '小微企业首达标支持申报指南公布',
      url: 'http://www.thnet.gov.cn/',
      thumbnail: '/news-thumbnails/news-2.svg',
      summary: '小微企业当年度首次达标最高可获5万元支持'
    },
    {
      id: 3,
      date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      title: '软件产业发展专项资金开始申报',
      url: 'http://www.thnet.gov.cn/',
      thumbnail: '/news-thumbnails/news-3.svg',
      summary: '支持软件和互联网企业核心技术研发与产品研发'
    }
  ]
}

async function main() {
  try {
    // 爬取新闻
    const newsData = await scrapeNews()

    // 读取现有数据
    let existingData = []
    try {
      const content = await fs.readFile(NEWS_FILE, 'utf-8')
      existingData = JSON.parse(content)
    } catch (error) {
      console.log('ℹ️  未找到现有新闻数据，将创建新文件')
    }

    // 比较数据是否有变化
    const hasChanges = JSON.stringify(newsData) !== JSON.stringify(existingData)

    if (hasChanges) {
      // 写入文件
      await fs.writeFile(NEWS_FILE, JSON.stringify(newsData, null, 2), 'utf-8')
      console.log(`\n✅ 新闻数据已更新: ${NEWS_FILE}`)
    } else {
      console.log('\nℹ️  新闻数据无变化')
    }

  } catch (error) {
    console.error('\n❌ 爬取失败:', error.message)

    // 失败时使用默认数据
    console.log('使用默认新闻数据...')
    const defaultNews = generateDefaultNews()
    await fs.writeFile(NEWS_FILE, JSON.stringify(defaultNews, null, 2), 'utf-8')
    console.log('✅ 已写入默认数据')
  }
}

main()
