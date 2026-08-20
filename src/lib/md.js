// 极简 Markdown 渲染器：仅覆盖本项目 QA 回答所需的语法子集
// （**加粗**、- / 1. 列表、## 小标题、[文字](链接)、裸 URL、段落换行）
//
// 安全设计：先整体做 HTML 转义，再做受控替换 —— LLM 输出中的任何原始 HTML
// 都会被当作纯文本展示，链接仅允许 http(s) 协议（href 由渲染器生成）。

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

// 仅匹配 URL 合法字符，天然排除中文标点（。；，（）等）被吞进链接
const RE_URL_CHARS = /https?:\/\/[A-Za-z0-9\-._~:/?#@!$&*+,;=%]+/g

export function renderMarkdown(src) {
  const text = String(src ?? '').replace(/\r\n?/g, '\n').trim()
  if (!text) return ''

  let html = escapeHtml(text)

  // 1) Markdown 链接 [文字](url)：先换成占位符，避免步骤 2 的裸 URL 规则重复包裹 href
  const links = []
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s）]+)\)/g, (m, label, url) => {
    links.push({ label, url })
    return `@@MDLINK${links.length - 1}@@`
  })

  // 2) 裸 URL（严格字符集，自动在中文标点处截断）
  html = html.replace(RE_URL_CHARS, '<a href="$&" target="_blank" rel="noopener">$&</a>')

  // 3) 恢复 Markdown 链接占位符
  html = html.replace(/@@MDLINK(\d+)@@/g, (m, i) => {
    const l = links[Number(i)]
    return l ? `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>` : m
  })

  // 4) 加粗
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')

  // 5) 分块：按行解析列表 / 标题 / 段落
  const lines = html.split('\n')
  const blocks = []
  let listType = null
  const flushList = () => {
    if (listType) { blocks.push(`</${listType}>`); listType = null }
  }
  for (const line of lines) {
    const t = line.trim()
    if (!t) { flushList(); continue }
    let m
    if ((m = /^-\s+(.+)$/.exec(t))) {
      if (listType !== 'ul') { flushList(); listType = 'ul'; blocks.push('<ul>') }
      blocks.push(`<li>${m[1]}</li>`)
    } else if ((m = /^\d+\.\s+(.+)$/.exec(t))) {
      if (listType !== 'ol') { flushList(); listType = 'ol'; blocks.push('<ol>') }
      blocks.push(`<li>${m[1]}</li>`)
    } else {
      flushList()
      if (/^#{1,4}\s/.test(t)) blocks.push(`<h4>${t.replace(/^#{1,4}\s*/, '')}</h4>`)
      else blocks.push(`<p>${t}</p>`)
    }
  }
  flushList()
  return blocks.join('')
}
