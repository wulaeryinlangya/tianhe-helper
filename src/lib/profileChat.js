export async function askProfileQuestion({ profile, history, round }) {
  const response = await fetch('/api/profile-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, history, round })
  })

  if (!response.ok) {
    throw new Error('问诊服务请求失败')
  }

  return await response.json()
}
