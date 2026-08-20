import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

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

  return {
    plugins: [
      vue(),
      {
        name: 'api-chat-proxy',
        configureServer(server) {
          server.middlewares.use('/api/chat', chatHandler)
        }
      }
    ]
  }
})
