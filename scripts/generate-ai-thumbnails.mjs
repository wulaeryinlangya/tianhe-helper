#!/usr/bin/env node

/**
 * AI 生成新闻缩略图
 *
 * 使用 AI 图片生成 API 根据新闻标题和摘要生成精美缩略图
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'
import https from 'https'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const OUTPUT_DIR = join(__dirname, '../public/news-thumbnails')
const NEWS_FILE = join(__dirname, '../data/news.json')

// AI 图片生成 API 配置
const API_KEY = 'sk-5220145f2f528c21739ec04e113476bc3c7f57bc473dce4d331354658683af37'
const API_BASE = 'https://api.denxio.com'

async function loadNewsData() {
  try {
    const content = await fs.readFile(NEWS_FILE, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.error('❌ 无法读取 data/news.json:', error.message)
    process.exit(1)
  }
}

/**
 * 生成图片提示词
 */
function generatePrompt(news) {
  const title = news.title
  const summary = news.summary

  // 根据标题关键词生成合适的提示词
  let theme = 'modern Chinese government policy illustration'

  if (title.includes('科技') || title.includes('创新')) {
    theme = 'high-tech innovation theme with digital elements, circuit boards, AI symbols'
  } else if (title.includes('小微') || title.includes('企业')) {
    theme = 'small business growth theme with office buildings, startup symbols, teamwork'
  } else if (title.includes('软件') || title.includes('产业')) {
    theme = 'software industry theme with coding symbols, computer screens, tech infrastructure'
  }

  return `Professional modern illustration for Chinese government policy announcement: "${title}". ${theme}. Clean minimal design, vibrant blue and orange gradient background, business style, flat design, no text overlay, 16:9 aspect ratio, high quality.`
}

/**
 * 调用 AI API 生成图片
 */
async function generateImage(prompt) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: 'gpt-image-2',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json'
    })

    const options = {
      hostname: 'api.denxio.com',
      port: 443,
      path: '/v1/images/generations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    }

    const req = https.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.data && result.data[0] && result.data[0].b64_json) {
            // 返回 base64 数据
            resolve(result.data[0].b64_json)
          } else {
            reject(new Error('API 返回格式异常'))
          }
        } catch (error) {
          reject(new Error('解析 API 响应失败: ' + error.message))
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.write(postData)
    req.end()
  })
}

/**
 * 保存 base64 图片到文件
 */
async function saveBase64Image(base64Data, outputPath) {
  const buffer = Buffer.from(base64Data, 'base64')
  await fs.writeFile(outputPath, buffer)
}

/**
 * 为单条新闻生成缩略图
 */
async function generateThumbnail(news) {
  console.log(`🎨 正在为「${news.title}」生成 AI 图片...`)

  try {
    // 生成提示词
    const prompt = generatePrompt(news)
    console.log(`   提示词: ${prompt.substring(0, 80)}...`)

    // 调用 AI API，返回 base64
    const base64Data = await generateImage(prompt)
    console.log(`   ✓ 图片已生成 (${Math.round(base64Data.length / 1024)}KB base64)`)

    // 保存到文件
    const thumbnailPath = news.thumbnail.replace(/^\//, '')
    const outputPath = join(__dirname, '../public', thumbnailPath.replace('.svg', '.jpg'))

    await saveBase64Image(base64Data, outputPath)
    console.log(`   ✅ 已保存到: ${thumbnailPath.replace('.svg', '.jpg')}`)

    return true
  } catch (error) {
    console.error(`   ❌ 生成失败: ${error.message}`)
    return false
  }
}

async function main() {
  console.log('🚀 开始使用 AI 生成新闻缩略图...\n')

  // 加载新闻数据
  const newsData = await loadNewsData()
  console.log(`📰 加载了 ${newsData.length} 条新闻\n`)

  // 确保输出目录存在
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true })
  } catch (error) {
    // 目录已存在，忽略错误
  }

  let successCount = 0
  for (const news of newsData) {
    const success = await generateThumbnail(news)
    if (success) successCount++

    // 延迟避免 API 限流
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  console.log(`\n📊 完成！成功生成 ${successCount}/${newsData.length} 张图片`)

  if (successCount < newsData.length) {
    console.log('\n⚠️  部分图片生成失败，请检查 API 配置或网络连接')
  }
}

main().catch(error => {
  console.error('❌ 脚本执行失败:', error)
  process.exit(1)
})
