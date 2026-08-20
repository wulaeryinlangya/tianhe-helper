// Vercel Serverless 函数：转发 AI 问答到火山方舟
// API Key 从环境变量读取（ARK_API_KEY），不暴露到前端
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const apiKey = process.env.ARK_API_KEY
  if (!apiKey) {
    return res.status(500).json({ message: '服务端未配置 API Key' })
  }

  const { policy, profile, question } = req.body
  if (!policy || !question) {
    return res.status(400).json({ message: '缺少必要参数' })
  }

  // 构造提示词：结合政策内容 + 企业画像 + 问题
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

  const prompt = `你是"天河惠企政策申报助手"，帮助天河区企业主理解政策、判断是否符合申报条件、指导申报。
请基于以下政策信息和企业信息，用简洁、口语化的中文回答用户问题。

${policyInfo}
${profileInfo}

【用户问题】${question}

回答要求：
1. 直接回答是否符合条件，并说明原因
2. 给出具体的申报步骤和材料
3. 提及申报截止时间提醒
4. 如信息不足，建议联系主管部门咨询，并给出渠道`

  const baseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/coding/v3'
  const model = process.env.ARK_MODEL || 'deepseek-v4-flash-ga-260731'

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

    if (!r.ok) {
      const errText = await r.text().catch(() => '')
      return res.status(502).json({ message: `大模型服务错误: ${r.status}` })
    }

    const data = await r.json()
    const answer = data.choices?.[0]?.message?.content
    if (!answer) {
      return res.status(502).json({ message: '大模型返回为空' })
    }
    return res.json({ answer })
  } catch (e) {
    return res.status(500).json({ message: '问答服务暂时不可用' })
  }
}
