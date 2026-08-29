// Vercel Serverless 函数：AI 问诊式画像构建（混合模式：规则化 + LLM）
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { profile, history, round } = req.body
  if (!profile || !history) {
    return res.status(400).json({ message: '缺少必要参数' })
  }

  // 前 2 轮使用规则化问题（快速，0 API 调用）
  if (round <= 2) {
    const ruleBasedResponse = getRuleBasedQuestion(profile, history, round)
    return res.json(ruleBasedResponse)
  }

  // 第 3-5 轮使用 LLM 深挖
  const apiKey = process.env.DEEPSEEK_API_KEY || 'sk-a4a2e4ead9fa45b0a1fc3d4781dcd0fb'

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

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }))
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

    if (!r.ok) {
      console.error('DeepSeek API error:', r.status)
      return res.status(502).json({ message: `DeepSeek 服务错误: ${r.status}` })
    }

    const data = await r.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return res.status(502).json({ message: '大模型返回为空' })
    }

    const parsed = JSON.parse(content)

    // 第 5 轮强制结束
    if (round >= 5) {
      parsed.isComplete = true
    }

    return res.json(parsed)

  } catch (e) {
    console.error('Profile chat error:', e)
    return res.status(500).json({ message: '问诊服务暂时不可用' })
  }
}

// 规则化问题生成（前 2 轮）
function getRuleBasedQuestion(profile, history, round) {
  const industry = profile.industry
  const stage = profile.stage

  // 第 1 轮：研发投入（通用）
  if (round === 1) {
    return {
      extractedData: {},
      nextQuestion: getIndustrySpecificQuestion1(industry),
      isComplete: false
    }
  }

  // 第 2 轮：根据第 1 轮回答提取数据，问资质认证
  if (round === 2) {
    const lastUserMsg = history.filter(m => m.role === 'user').pop()?.content || ''
    const extractedData = extractRdRatioAndPatents(lastUserMsg)

    return {
      extractedData,
      nextQuestion: getCertificationQuestion(industry, stage),
      isComplete: false
    }
  }

  return {
    extractedData: {},
    nextQuestion: '请继续介绍您的企业情况',
    isComplete: false
  }
}

// 第 1 轮：根据行业问研发/投入
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

// 第 2 轮：根据行业问资质
function getCertificationQuestion(industry, stage) {
  const hasTech = ['软件和信息技术服务', '人工智能与科技服务', '高端制造', '生物医药'].includes(industry)

  if (hasTech) {
    return '您的企业有哪些资质认证？（如高新技术企业、专精特新、ISO认证等，如果没有可以说"暂无"）'
  } else {
    return '您的企业近两年的营收增长率大概是多少？主要目标市场是什么？'
  }
}

// 从文本中提取研发占比和专利数
function extractRdRatioAndPatents(text) {
  const data = {}

  // 提取百分比
  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*[%％]/)
  if (percentMatch) {
    data.rdRatio = parseFloat(percentMatch[1])
  }

  // 提取专利数量
  const patentMatch = text.match(/(\d+)\s*[项个件]/)
  if (patentMatch) {
    data.patents = parseInt(patentMatch[1])
  }

  // 提取认证信息（关键词匹配）
  const certifications = []
  if (text.includes('高新') || text.includes('高企')) certifications.push('高新技术企业')
  if (text.includes('专精特新')) certifications.push('专精特新')
  if (text.includes('ISO')) certifications.push('ISO认证')
  if (text.includes('GMP')) certifications.push('GMP认证')
  if (certifications.length > 0) {
    data.certifications = certifications
  }

  return data
}
