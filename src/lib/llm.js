// 大模型问答模块：通过 /api/chat 转发（本地 Vite 代理 / 部署 Serverless）
// 前端不直接持有 API Key

export async function askQuestion(policy, profile, question) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy, profile, question })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || '服务暂时不可用')
  }
  const data = await res.json()
  return data.answer
}
