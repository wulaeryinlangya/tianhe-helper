// 政策数据校验工具库：全部为确定性规则校验，不依赖任何模型判断
// 供 scripts/verify-policies.mjs（存量数据校验）与 scripts/collect-policy.mjs（采集流水线第4层）共用
//
// 设计原则（对应数据层信任边界）：
// 1. 校验只基于可机器验证的规则（正则/格式/白名单/存活状态）
// 2. 每条问题必须携带 field + severity + message，可被 UI 直接展示
// 3. 网络检查与本地检查分离，支持 --offline 纯本地运行（CI 友好）

import { Buffer } from 'node:buffer'

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 TianheHelperPolicyBot/1.0'

// ---------------------------------------------------------------------------
// 域名白名单：政策链接只允许指向天河区/广州市政府官方域名
// ---------------------------------------------------------------------------
export const URL_WHITELIST = [
  /^https?:\/\/([a-z0-9-]+\.)*thnet\.gov\.cn(\/|$)/i,
  /^https?:\/\/([a-z0-9-]+\.)*gz\.gov\.cn(\/|$)/i,
]

/** URL 是否可解析且落在白名单域名内（含协议校验） */
export function isWhitelisted(rawUrl) {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    return URL_WHITELIST.some((re) => re.test(u.href))
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// 字段格式校验（本地、无网络）
// ---------------------------------------------------------------------------
export const RE_DATE = /^\d{4}-\d{2}-\d{2}$/
export const RE_PHONE = /^0\d{2,3}-\d{7,8}$/
export const RE_AMOUNT_NUMBER = /(?:\d+(?:\.\d+)?)\s*万元/
export const RE_GUIDE_FALLBACK = /按官方.{0,6}指南|以.{0,6}指南为准|培育（预申报）|培育\(预申报\)|详见.{0,6}指南/

export function isValidDate(s) {
  if (!RE_DATE.test(s)) return false
  const d = new Date(s + 'T00:00:00')
  return !Number.isNaN(d.getTime())
}

/** 从 "有效期至2028年12月31日" 之类文本中解析截止日期，解析失败返回 null */
export function parseValidityEnd(text) {
  const m = /有效期(?:至|到)(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(text || '')
  if (!m) return null
  const [, y, mo, d] = m
  const pad = (n) => String(n).padStart(2, '0')
  const s = `${y}-${pad(mo)}-${pad(d)}`
  return isValidDate(s) ? s : null
}

/**
 * 本地字段校验：返回 { status, issues }
 * status: ok | review | failed —— error → failed，warn → review
 */
export function checkPolicyLocally(policy) {
  const issues = []
  const add = (field, severity, message) => issues.push({ field, severity, message })

  // --- 必填字段 ---
  if (!policy.id || !/^[\w-]+$/.test(policy.id)) add('id', 'error', 'id 缺失或格式非法（仅允许字母数字-_）')
  if (!policy.title || policy.title.trim().length < 6) add('title', 'error', '标题缺失或过短')
  if (!policy.summary || policy.summary.trim().length < 10) add('summary', 'error', '摘要缺失或过短')
  if (!policy.unit) add('unit', 'error', '主管部门缺失')
  if (!policy.source) add('source', 'warn', '政策依据（文件+条款号）缺失，用户无法核对')
  if (!policy.source_url) add('source_url', 'error', '官方原文链接缺失（本项目硬性要求）')

  // --- URL ---
  for (const f of ['source_url', 'entry_url']) {
    if (!policy[f]) continue
    if (!/^https?:\/\//i.test(policy[f])) add(f, 'error', `URL 缺少 http(s) 协议: ${policy[f]}`)
    else if (!isWhitelisted(policy[f])) add(f, 'error', `URL 不在官方域名白名单内: ${policy[f]}`)
  }

  // --- 金额 ---
  const amount = (policy.amount || '').trim()
  if (!amount) {
    add('amount', 'error', '补贴金额缺失')
  } else if (!RE_AMOUNT_NUMBER.test(amount) && !RE_GUIDE_FALLBACK.test(amount)) {
    add('amount', 'warn', `金额字段既无数值也无"以申报指南为准"标识，可能为幻觉或漏填: ${amount}`)
  }

  // --- 电话 ---
  if (policy.contact !== undefined && policy.contact !== null && policy.contact !== '') {
    if (!RE_PHONE.test(policy.contact)) {
      add('contact', 'warn', `咨询电话格式异常（应为 020-XXXXXXXX）: ${policy.contact}`)
    }
  }

  // --- 日期 ---
  for (const f of ['publish_date']) {
    if (policy[f] === undefined) continue
    if (!isValidDate(policy[f])) add(f, 'error', `日期格式非法: ${policy[f]}`)
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (policy.publish_date && isValidDate(policy.publish_date)) {
    const pub = new Date(policy.publish_date + 'T00:00:00')
    if (pub > new Date(today.getTime() + 86400000)) add('publish_date', 'warn', `印发日期晚于今天，疑似抄录错误: ${policy.publish_date}`)
  }

  // --- 申报窗口 ---
  const w = policy.window || {}
  const hasStart = !!w.start
  const hasEnd = !!w.end
  if (hasStart !== hasEnd) {
    add('window', 'error', `申报窗口只有起/止日期之一（start=${w.start || '-'}, end=${w.end || '-'}）`)
  }
  if (hasStart && hasEnd) {
    if (!isValidDate(w.start)) add('window.start', 'error', `窗口开始日期格式非法: ${w.start}`)
    if (!isValidDate(w.end)) add('window.end', 'error', `窗口结束日期格式非法: ${w.end}`)
    if (isValidDate(w.start) && isValidDate(w.end) && w.start > w.end) {
      add('window', 'error', `窗口开始日期晚于结束日期: ${w.start} ~ ${w.end}`)
    }
    if (isValidDate(w.end) && new Date(w.end + 'T23:59:59') < today) {
      add('window', 'info', `申报窗口已过期（${w.end}），建议确认是否应保留在展示列表中`)
    }
    // 窗口月份与 note 中标注的批次季度一致性（防止"第一季度/7月"这类抄录矛盾）
    const quarterMatch = /第([一二三四])季度/.exec(w.note || '')
    if (quarterMatch && hasStart && isValidDate(w.start)) {
      const qMap = { 一: [1, 2, 3], 二: [4, 5, 6], 三: [7, 8, 9], 四: [10, 11, 12] }
      const month = Number(w.start.slice(5, 7))
      if (!qMap[quarterMatch[1]].includes(month)) {
        add('window', 'warn', `窗口开始月份（${month}月）与 note 中标注的"第${quarterMatch[1]}季度"矛盾，请对照原文复核`)
      }
    }
  }

  // --- 有效期与窗口的跨字段一致性 ---
  const validityEnd = parseValidityEnd(policy.policy_validity)
  if (policy.policy_validity && !validityEnd) {
    add('policy_validity', 'warn', `有效期文本无法解析出截止日期: ${policy.policy_validity}`)
  }
  if (validityEnd && hasEnd && isValidDate(w.end) && w.end > validityEnd) {
    add('window', 'error', `申报窗口结束日期（${w.end}）晚于政策有效期截止（${validityEnd}），二者必有一处错误`)
  }

  // --- 条件结构 ---
  const conds = policy.conditions || {}
  if (!Array.isArray(conds.industry) || conds.industry.length === 0) {
    add('conditions.industry', 'warn', 'conditions.industry 为空，匹配引擎只能靠标签兜底')
  }
  if (conds.companyType && !Array.isArray(conds.companyType)) {
    add('conditions.companyType', 'error', 'conditions.companyType 必须为数组')
  }
  if (conds.notes && !Array.isArray(conds.notes)) {
    add('conditions.notes', 'error', 'conditions.notes 必须为数组')
  }

  const status = issues.some((i) => i.severity === 'error')
    ? 'failed'
    : issues.some((i) => i.severity === 'warn')
      ? 'review'
      : 'ok'
  return { status, issues }
}

// ---------------------------------------------------------------------------
// 网络：抓取（采集流水线用）与链接存活（校验用）
// ---------------------------------------------------------------------------

/**
 * 确定性抓取：手动跟随重定向，记录每一跳与最终 URL、HTTP 状态、字节内容。
 * 不做任何模型参与的内容转换。
 */
export async function fetchPolicyPage(url, { timeoutMs = 20000, maxRedirects = 5 } = {}) {
  let current = String(url)
  const hops = []
  for (let i = 0; i <= maxRedirects; i++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    let res
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'zh-CN,zh;q=0.9' }
      })
    } catch (e) {
      return { finalUrl: current, status: 0, hops, buffer: null, contentType: '', error: e.name === 'AbortError' ? `超时(>${timeoutMs}ms)` : e.message }
    } finally {
      clearTimeout(timer)
    }
    hops.push({ url: current, status: res.status })
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location')
      if (!loc) return { finalUrl: current, status: res.status, hops, buffer: null, contentType: '', error: '重定向缺少 Location 头' }
      current = new URL(loc, current).href
      continue
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    return {
      finalUrl: current,
      status: res.status,
      hops,
      buffer,
      contentType: res.headers.get('content-type') || '',
      fetchedAt: new Date().toISOString()
    }
  }
  return { finalUrl: current, status: 0, hops, buffer: null, contentType: '', error: `重定向超过 ${maxRedirects} 次` }
}

/**
 * 字符集探测：优先响应头，其次 HTML meta，默认 utf-8。
 * 政府站常见 gb2312/gbk/gb18030，Node 官方构建（full-icu）的 TextDecoder 均可解码。
 */
export function detectCharset(buffer, contentType = '') {
  const head = buffer.subarray(0, 4096).toString('latin1')
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType || '')
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)
  const raw = (fromHeader?.[1] || fromMeta?.[1] || 'utf-8').toLowerCase()
  const aliases = { gb2312: 'gbk', 'gb-2312': 'gbk', gb_2312: 'gbk' }
  const cs = aliases[raw] || raw
  try {
    new TextDecoder(cs)
    return cs
  } catch {
    return 'utf-8'
  }
}

/** 按指定字符集解码字节为字符串 */
export function decodeBuffer(buffer, charset) {
  try {
    return new TextDecoder(charset).decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

const HTML_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '\u201c', rdquo: '\u201d', lsquo: '\u2018', rsquo: '\u2019',
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', middot: '\u00b7', times: '\u00d7'
}

export function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)) } catch { return '' } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)) } catch { return '' } })
    .replace(/&([a-z]+);/gi, (m, name) => (name in HTML_ENTITIES ? HTML_ENTITIES[name] : m))
}

/** 提取 <title> */
export function extractTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : ''
}

/** 提取 meta description */
export function extractMetaDescription(html) {
  const m = /<meta[^>]+name=["']?description["']?[^>]+content=["']([^"']*)["']/i.exec(html)
    || /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']?description["']?/i.exec(html)
  return m ? decodeEntities(m[1]).trim() : ''
}

/**
 * HTML → 纯文本（确定性规则，无模型参与）。
 * 政府 CMS 内容区常挂 .gkmlpt / .TRS_Editor / .view / .content 等容器，
 * 按优先级依次尝试截取；命中后在常见页尾噪声标记处截断（导航/版权/二维码等）。
 */
export function htmlToText(html, { contentSelector = null } = {}) {
  let s = html
  const selectors = [contentSelector, 'gkmlpt', 'pages_content', 'TRS_Editor', 'view', 'article-content', 'content', 'zoom'].filter(Boolean)
  for (const sel of selectors) {
    const re = new RegExp(`<[^>]+(?:id|class)=["']?${sel}["']?[^>]*>`)
    const m = re.exec(s)
    if (m) {
      const start = m.index
      let end = s.length
      const tailMarkers = ['扫一扫在手机打开当前页', '打印关闭', '网站地图', '主办：', 'copyright', '分享到']
      for (const tm of tailMarkers) {
        const idx = s.indexOf(tm, start)
        if (idx !== -1 && idx < end) end = idx
      }
      s = s.slice(start, end)
      break
    }
  }
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/(p|div|li|tr|h[1-6]|section|article|table|ul|ol)>/gi, '\n')
  s = s.replace(/<li[^>]*>/gi, '\n- ')
  s = s.replace(/<h[1-6][^>]*>/gi, '\n## ')
  s = s.replace(/<[^>]+>/g, '')
  s = decodeEntities(s)
  s = s.replace(/[ \t]+/g, ' ')
  s = s.replace(/\n[ \t]+/g, '\n')
  // 清理空列表项/空标题（导航菜单被剥离后遗留的 "- " / "## "）
  s = s.replace(/\n[-#]+\s*(?=\n|$)/g, '\n')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

/**
 * 链接存活检查：HEAD 优先，405/501 时降级 GET。
 * 返回 { ok, status, finalUrl, error? }，超时视为不可达（error: 'timeout'）。
 */
export async function checkLink(rawUrl, { timeoutMs = 12000 } = {}) {
  const doRequest = async (url, method) => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'zh-CN,zh;q=0.9' }
      })
      return { ok: res.ok, status: res.status, finalUrl: res.url }
    } catch (e) {
      return { ok: false, status: 0, error: e.name === 'AbortError' ? 'timeout' : e.message }
    } finally {
      clearTimeout(timer)
    }
  }
  const head = await doRequest(rawUrl, 'HEAD')
  if (!head.ok && (head.status === 405 || head.status === 501 || head.status === 403)) {
    return doRequest(rawUrl, 'GET')
  }
  return head
}

/** 提取政策记录里需要做存活检查的 URL 集合（去重） */
export function collectLinkUrls(policy) {
  const urls = []
  for (const f of ['source_url', 'entry_url']) {
    if (policy[f] && /^https?:\/\//i.test(policy[f])) urls.push({ field: f, url: policy[f] })
  }
  return urls
}

/** 并发限制执行器 */
export async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}
