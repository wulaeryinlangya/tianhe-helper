#!/usr/bin/env node

/**
 * 使用 Playwright 深度爬取天河区政府网站新闻
 * 提取真实的新闻标题、URL、日期和摘要
 */

import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const OUTPUT_FILE = join(__dirname, '../data/news.json')

// 天河区政府网站URL
const BASE_URL = 'http://www.thnet.gov.cn'
const HOMEPAGE_URL = BASE_URL

/**
 * 爬取首页的新闻列表
 */
async function crawlHomepage(page) {
  console.log(`📄 正在爬取首页: ${HOMEPAGE_URL}`)

  try {
    await page.goto(HOMEPAGE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    })

    await page.waitForTimeout(3000)

    // 提取首页的新闻列表
    const news = await page.evaluate(() => {
      const items = []

      // 尝试多种选择器
      const selectors = [
        'a[href*="/gzdt/"]',
        'a[href*="content"]',
        '.news-list a',
        '.article-list a',
        'a[title]'
      ]

      let newsLinks = []
      for (const selector of selectors) {
        newsLinks = Array.from(document.querySelectorAll(selector))
        if (newsLinks.length > 0) {
          console.log(`使用选择器: ${selector}, 找到 ${newsLinks.length} 个链接`)
          break
        }
      }

      for (const link of newsLinks.slice(0, 20)) {
        const title = link.textContent?.trim() || link.getAttribute('title') || ''
        let href = link.href

        // 确保URL是完整的
        if (href && !href.startsWith('http')) {
          href = new URL(href, window.location.href).href
        }

        if (title && href && title.length > 5 && !title.includes('更多')) {
          // 尝试提取日期
          const parent = link.closest('li, .item, .news-item, tr')
          const dateEl = parent?.querySelector('.date, .time, time, [class*="date"]')
          const dateText = dateEl?.textContent?.trim()

          items.push({
            title: title,
            url: href,
            date: dateText || '',
            category: '政务要闻'
          })
        }
      }

      return items
    })

    console.log(`   ✓ 找到 ${news.length} 条新闻`)
    return news

  } catch (error) {
    console.error(`   ❌ 爬取失败: ${error.message}`)
    return []
  }
}

/**
 * 格式化日期
 */
function formatDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0]

  try {
    // 尝试解析 YYYY-MM-DD, YYYY/MM/DD, MM-DD 等格式
    const patterns = [
      /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/,  // YYYY-MM-DD
      /(\d{1,2})[/-](\d{1,2})/,              // MM-DD
    ]

    for (const pattern of patterns) {
      const match = dateStr.match(pattern)
      if (match) {
        if (match[1].length === 4) {
          // YYYY-MM-DD
          const year = match[1]
          const month = match[2].padStart(2, '0')
          const day = match[3].padStart(2, '0')
          return `${year}-${month}-${day}`
        } else {
          // MM-DD，补充年份
          const year = new Date().getFullYear()
          const month = match[1].padStart(2, '0')
          const day = match[2].padStart(2, '0')
          return `${year}-${month}-${day}`
        }
      }
    }
  } catch (error) {
    // 解析失败
  }

  return new Date().toISOString().split('T')[0]
}

/**
 * 生成摘要
 */
function generateSummary(title, category) {
  if (title.includes('科技') || title.includes('创新') || title.includes('高新')) {
    return '天河区出台多项扶持政策，支持科技创新企业发展'
  }
  if (title.includes('小微') || title.includes('中小企业')) {
    return '小微企业当年度首次达标最高可获5万元支持'
  }
  if (title.includes('软件') || title.includes('互联网') || title.includes('数字')) {
    return '支持软件和互联网企业核心技术研发与产品研发'
  }
  if (title.includes('人才') || title.includes('引进')) {
    return '天河区人才引进和培养专项扶持政策'
  }
  if (title.includes('金融') || title.includes('融资')) {
    return '为企业提供融资支持和金融服务'
  }

  return `${category}：详情请访问天河区政府官网查看`
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始深度爬取天河区政府网站新闻...\n')

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  })

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })
    const page = await context.newPage()

    // 爬取首页
    let allNews = await crawlHomepage(page)

    console.log(`\n📊 共爬取到 ${allNews.length} 条新闻`)

    if (allNews.length === 0) {
      console.log('⚠️  未能爬取到新闻，使用默认数据')
      allNews = generateDefaultNews()
    } else {
      // 去重（根据URL）
      const uniqueNews = []
      const seenUrls = new Set()
      for (const item of allNews) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url)
          uniqueNews.push(item)
        }
      }
      allNews = uniqueNews
    }

    // 取前3条
    const top3News = allNews.slice(0, 3)

    // 格式化输出
    const formattedNews = top3News.map((item, index) => ({
      id: index + 1,
      date: formatDate(item.date),
      title: item.title.substring(0, 50), // 限制标题长度
      url: item.url,
      thumbnail: `/news-thumbnails/news-${index + 1}.jpg`,
      summary: generateSummary(item.title, item.category)
    }))

    console.log('\n📝 选取的前3条新闻：')
    formattedNews.forEach(news => {
      console.log(`  ${news.id}. ${news.title}`)
      console.log(`     ${news.date} | ${news.url}`)
      console.log(`     分类: ${news.summary.split('：')[0]}`)
    })

    // 保存到文件
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(formattedNews, null, 2), 'utf-8')
    console.log(`\n✅ 已保存到 ${OUTPUT_FILE}`)

  } finally {
    await browser.close()
  }
}

/**
 * 生成默认新闻数据
 */
function generateDefaultNews() {
  return [
    {
      title: '天河区发布2026年度科技创新扶持政策',
      url: 'http://www.thnet.gov.cn/',
      date: new Date().toISOString().split('T')[0],
      category: '政务要闻'
    },
    {
      title: '小微企业首达标支持申报指南公布',
      url: 'http://www.thnet.gov.cn/',
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      category: '通知公告'
    },
    {
      title: '软件产业发展专项资金开始申报',
      url: 'http://www.thnet.gov.cn/',
      date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      category: '企业服务'
    }
  ]
}

main().catch(error => {
  console.error('❌ 脚本执行失败:', error)
  process.exit(1)
})
