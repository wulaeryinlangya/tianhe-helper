import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { copyFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// Vite 配置：dev server 转发 /api/chat 到火山方舟（复用 Serverless 逻辑）
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const chatHandler = async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end(JSON.stringify({ message: 'Method not allowed' }))
      return
    }
    let body = ''
    for await (const chunk of req) body += chunk
    const { policy, profile, question } = JSON.parse(body || '{}')
    if (!policy || !question) {
      res.statusCode = 400
      res.end(JSON.stringify({ message: '缺少必要参数' }))
      return
    }

    const policyInfo = `
【政策】${policy.title}
【主管部门】${policy.unit}
【补贴金额】${policy.amount}
【申报窗口】${policy.window?.start} ~ ${policy.window?.end}
【申报条件】${JSON.stringify(policy.conditions || {})}
【所需材料】${(policy.materials || []).join('、')}
【政策摘要】${policy.summary}
`
    const profileInfo = `
【企业画像】行业=${profile?.industry} | 员工=${profile?.employees} | 年营收=${profile?.revenue} | 阶段=${profile?.stage} | 类型=${profile?.companyType}
`
    const prompt = `你是"天河政策通 AI政策申报助手"，帮助天河区企业主理解政策、判断是否符合申报条件、指导申报。
请基于以下政策信息和企业信息，用简洁、口语化的中文回答用户问题。

${policyInfo}
${profileInfo}

【用户问题】${question}

回答要求：
1. 直接回答是否符合条件，并说明原因
2. 给出具体的申报步骤和材料
3. 提及申报截止时间提醒
4. 如信息不足，建议联系主管部门咨询，并给出渠道`

    const baseUrl = env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/coding/v3'
    const model = env.ARK_MODEL || 'deepseek-v4-flash-ga-260731'
    const apiKey = env.ARK_API_KEY

    try {
      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: '你是一个专业、亲切的政策申报助手。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.5,
          max_tokens: 800
        })
      })
      const data = await r.json()
      const answer = data.choices?.[0]?.message?.content
      res.setHeader('Content-Type', 'application/json')
      if (!answer) {
        res.statusCode = 502
        res.end(JSON.stringify({ message: '大模型返回为空' }))
        return
      }
      res.end(JSON.stringify({ answer }))
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ message: '问答服务暂时不可用' }))
    }
  }

  const profileChatHandler = async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end(JSON.stringify({ message: 'Method not allowed' }))
      return
    }

    try {
      let body = ''
      for await (const chunk of req) body += chunk
      const { profile, history, round } = JSON.parse(body || '{}')

      console.log('=== Profile Chat Request ===')
      console.log('Round:', round)
      console.log('Profile:', profile)

      if (!profile || !history) {
        res.statusCode = 400
        res.end(JSON.stringify({ message: '缺少必要参数' }))
        return
      }

      // 前 2 轮使用规则化问题（0 延迟）
      if (round <= 2) {
        const ruleResponse = getRuleBasedQuestion(profile, history, round)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(ruleResponse))
        return
      }

      // 第 3-5 轮使用 DeepSeek API
      const apiKey = env.DEEPSEEK_API_KEY || 'sk-a4a2e4ead9fa45b0a1fc3d4781dcd0fb'

      const systemPrompt = `你是"天河政策通"的企业画像构建专家。当前是第${round}轮对话（共5轮）。

已知企业信息：
- 行业：${profile.industry}
- 员工数：${profile.employees}
- 年营收：${profile.revenue}
- 发展阶段：${profile.stage}
- 企业类型：${profile.companyType}
${profile.rdRatio ? `- 研发投入占比：${profile.rdRatio}%` : ''}
${profile.patents ? `- 专利/软著数量：${profile.patents}项` : ''}
${profile.certifications ? `- 资质认证：${profile.certifications.join('、')}` : ''}
${profile.annualGrowth ? `- 年增长率：${profile.annualGrowth}%` : ''}
${profile.mainProducts ? `- 主营产品：${profile.mainProducts}` : ''}

重要提示：
1. 仔细查看对话历史，不要重复已经问过的问题
2. 基于已有信息和用户最新回答，提出1个新的深度问题
3. 针对该行业的关键指标进行追问（市场、客户、竞争力等）
4. 第${round}轮，如果信息已足够或达到第5轮，必须设置 isComplete: true

输出 JSON 格式：
{
  "extractedData": { "targetMarket": "政企客户", "exportBusiness": false, ... },
  "nextQuestion": "您的主要竞争优势是什么？",
  "isComplete": ${round >= 5 ? 'true' : 'false'}
}`

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-6).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
      ]

      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          temperature: 0.7,
          max_tokens: 500,
          response_format: { type: 'json_object' }
        })
      })

      console.log('DeepSeek API status:', r.status)

      if (!r.ok) {
        const errorText = await r.text()
        console.error('DeepSeek API error:', errorText)
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ message: 'DeepSeek API 调用失败: ' + r.status }))
        return
      }

      const data = await r.json()
      console.log('DeepSeek response:', JSON.stringify(data).substring(0, 200))

      const content = data.choices?.[0]?.message?.content
      res.setHeader('Content-Type', 'application/json')

      if (!content) {
        console.error('No content in response:', data)
        res.statusCode = 502
        res.end(JSON.stringify({ message: '大模型返回为空' }))
        return
      }

      console.log('Content:', content)

      // 检查 content 是否为空或只有空格
      const trimmedContent = content?.trim()
      if (!trimmedContent) {
        console.warn('DeepSeek returned empty content, ending consultation')
        res.end(JSON.stringify({
          extractedData: {},
          nextQuestion: '问诊已完成！我已经充分了解您的企业情况。',
          isComplete: true
        }))
        return
      }

      // 尝试解析 JSON
      let parsed
      try {
        parsed = JSON.parse(trimmedContent)
      } catch (parseError) {
        console.error('JSON parse error:', parseError)
        console.error('Content was:', trimmedContent.substring(0, 200))
        // 降级：直接结束问诊
        res.end(JSON.stringify({
          extractedData: {},
          nextQuestion: '感谢您的回答！问诊已完成。',
          isComplete: true
        }))
        return
      }

      if (round >= 5) parsed.isComplete = true
      res.end(JSON.stringify(parsed))

    } catch (e) {
      console.error('Profile chat handler error:', e)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ message: '问诊服务暂时不可用: ' + e.message }))
    }
  }

  function getRuleBasedQuestion(profile, history, round) {
    const industry = profile.industry
    const stage = profile.stage

    if (round === 1) {
      return {
        extractedData: {},
        nextQuestion: getIndustrySpecificQuestion1(industry),
        isComplete: false
      }
    }

    if (round === 2) {
      const lastUserMsg = history.filter(m => m.role === 'user').pop()?.content || ''
      const extractedData = extractRdRatioAndPatents(lastUserMsg)

      return {
        extractedData,
        nextQuestion: getCertificationQuestion(industry, stage),
        isComplete: false
      }
    }

    return { extractedData: {}, nextQuestion: '请继续介绍您的企业情况', isComplete: false }
  }

  function getIndustrySpecificQuestion1(industry) {
    const questions = {
      '软件和信息技术服务': '您的企业在研发方面的投入大概占营收的多少比例？目前有多少项软件著作权或专利？',
      '人工智能与科技服务': '您的研发投入占比是多少？核心技术团队有多少人？有哪些技术专利或软著？',
      '高端制造': '您的生产设备总投资大概多少？年产能是多少？有多少项技术专利？',
      '生物医药': '您的研发投入占比是多少？有多少项药品批文或专利？是否通过 GMP 认证？',
      '文化创意': '您的核心业务是什么？年营收增长率大概多少？有哪些原创IP或著作权？'
    }
    return questions[industry] || '您的企业在研发或核心业务方面的投入大概占营收的多少比例？有多少项专利或资质？'
  }

  function getCertificationQuestion(industry, stage) {
    const hasTech = ['软件和信息技术服务', '人工智能与科技服务', '高端制造', '生物医药'].includes(industry)
    if (hasTech) {
      return '您的企业有哪些资质认证？（如高新技术企业、专精特新、ISO认证等，如果没有可以说"暂无"）'
    }
    return '您的企业近两年的营收增长率大概是多少？主要目标市场是什么？'
  }

  function extractRdRatioAndPatents(text) {
    const data = {}
    const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*[%％]/)
    if (percentMatch) data.rdRatio = parseFloat(percentMatch[1])

    const patentMatch = text.match(/(\d+)\s*[项个件]/)
    if (patentMatch) data.patents = parseInt(patentMatch[1])

    const certifications = []
    if (text.includes('高新') || text.includes('高企')) certifications.push('高新技术企业')
    if (text.includes('专精特新')) certifications.push('专精特新')
    if (text.includes('ISO')) certifications.push('ISO认证')
    if (text.includes('GMP')) certifications.push('GMP认证')
    if (certifications.length > 0) data.certifications = certifications

    return data
  }

  return {
    plugins: [
      vue(),
      {
        name: 'copy-data',
        closeBundle() {
          // 构建完成后，复制 data 目录到 dist
          try {
            mkdirSync('dist/data', { recursive: true })
            copyFileSync('data/news.json', 'dist/data/news.json')
            copyFileSync('data/policies.json', 'dist/data/policies.json')
            copyFileSync('data/verification.json', 'dist/data/verification.json')
            console.log('✅ Data files copied to dist/data')
          } catch (err) {
            console.error('❌ Failed to copy data files:', err)
          }
        }
      },
      {
        name: 'api-proxy',
        configureServer(server) {
          server.middlewares.use('/api/chat', chatHandler)
          server.middlewares.use('/api/profile-chat', profileChatHandler)
        }
      }
    ]
  }
})
