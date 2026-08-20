// 政策采集五层流水线骨架：抓取 → 解析 → 映射 → 校验 → 人工复核
//
// 用法：
//   node scripts/collect-policy.mjs <政策原文URL> [--id tianhe-020] [--llm]
//
// 五层设计（治理原则见 README / 数据治理说明）：
//   1. 抓取  fetchPolicyPage     —— 确定性：手动跟随重定向、记录最终URL/状态/字节，无模型参与
//   2. 解析  detectCharset 等    —— 确定性：字符集探测（政府站常见 GBK）→ 纯文本提取，无模型参与
//   3. 映射  buildMappingPrompt  —— LLM 唯一参与处：字段 ↔ 原文逐字引文（source_quote），
//                                    默认 dry-run（生成提示词供人工/外部模型完成），--llm 才调用 API
//   4. 校验  checkPolicyLocally  —— 确定性：复用 scripts/lib/policy-utils.js 的规则
//   5. 复核  写入 staging        —— 产出 data/staging/<id>.json，NEVER 直接写入 data/policies.json，
//                                    人工对照原文复核通过后才能手动合并
//
// 环境变量（可选，--llm 时必需）：ARK_API_KEY / ARK_BASE_URL / ARK_MODEL（或 .env.local）

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fetchPolicyPage,
  detectCharset,
  decodeBuffer,
  extractTitle,
  extractMetaDescription,
  htmlToText,
  checkPolicyLocally,
  isWhitelisted
} from './lib/policy-utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const STAGING_DIR = path.join(ROOT, 'data', 'staging')

// 模型映射时保留给上下文的正文长度上限（政府通知正文一般 2k-10k 字，超长截断并声明）
const MAX_TEXT_CHARS = 12000

// ---------------------------------------------------------------------------
// 环境变量加载：手写 .env.local 解析，避免引入 dotenv 依赖
// ---------------------------------------------------------------------------
async function loadEnvLocal() {
  try {
    const content = await readFile(path.join(ROOT, '.env.local'), 'utf8')
    for (const line of content.split('\n')) {
      const m = /^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*["']?([^"'\n]+)["']?\s*$/.exec(line)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim()
    }
  } catch {
    // .env.local 不存在则忽略
  }
}

// ---------------------------------------------------------------------------
// 第 3 层：映射 —— 要求模型输出"字段 → 原文逐字引文"，禁止凭记忆补全
// ---------------------------------------------------------------------------
const FIELDS_SCHEMA = [
  ['title', '政策名称（逐字，不缩写）'],
  ['unit', '印发/主管单位全称'],
  ['amount', '补贴金额（保留"最高X万元"原表述；无金额写"按官方申报指南"）'],
  ['window_note', '申报窗口/批次说明（从原文或通知中提取；没有就写"具体申报窗口以官方申报指南为准"）'],
  ['window_start', '申报开始日期 YYYY-MM-DD（原文无则 null）'],
  ['window_end', '申报截止日期 YYYY-MM-DD（原文无则 null）'],
  ['conditions_industry', '适用行业（数组；原文无行业限制写 ["不限"]）'],
  ['conditions_companyType', '适用企业类型（数组；原文无则 null）'],
  ['conditions_notes', '申报条件要点（数组，逐条引用原文表述）'],
  ['materials', '所需材料（数组；原文无则 []）'],
  ['summary', '一句话摘要（≤80字，只概括原文内容）'],
  ['tags', '匹配标签（数组，3-6个关键词）'],
  ['entry_url', '申报入口URL（原文无则 null）'],
  ['source', '政策依据（文件名+条款号，如《XX措施》第二条）'],
  ['source_url', '本通知原文URL（即抓取到的最终URL）'],
  ['policy_validity', '有效期（如"有效期至2028年12月31日"；原文无则 null）'],
  ['contact', '咨询电话（原文无则 null）'],
  ['publish_date', '印发日期 YYYY-MM-DD（原文无则 null）']
]

export function buildMappingPrompt({ title, text, finalUrl, metaDescription }) {
  const truncated = text.length > MAX_TEXT_CHARS
  const body = truncated ? text.slice(0, MAX_TEXT_CHARS) : text
  const schema = FIELDS_SCHEMA.map(([k, desc]) => `"${k}": <${desc}>`).join(',\n  ')

  return `你是"天河惠企"政策数据录入员。请把下面这份政府通知的**原文**转写为结构化 JSON。

【铁律】
1. 每个字段的值必须**逐字来自原文**（或 null/空），禁止任何凭常识补全、禁止改写数字和日期。
2. 金额、日期、电话、URL 是最容易出错的高风险字段：原文没有就写 null，绝不猜测。
3. 输出必须同时包含 "source_quotes"：每个非空字段给出**逐字引用的原文摘录**（原文中找不到摘录的字段一律置 null）。
4. 输出为纯 JSON，不要任何解释文字，不要 Markdown 代码块标记。
5. 若原文正文不完整（如被截断、乱码），在 "_warnings" 中说明，不要补全。

【原文标题】${title || '(未提取到)'}
【原文 URL】${finalUrl}
【meta 描述】${metaDescription || '(无)'}
${truncated ? `【注意】正文超长，已截断至前 ${MAX_TEXT_CHARS} 字，超出部分无法引用。` : ''}

【原文正文】
${body}

【输出 JSON 结构】
{
  ${schema},
  "source_quotes": { "<字段名>": "<原文逐字摘录>", ... },
  "_warnings": []
}`
}

async function callArkLlm(prompt) {
  const apiKey = process.env.ARK_API_KEY
  const baseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/coding/v3'
  const model = process.env.ARK_MODEL || 'deepseek-v4-flash-ga-260731'
  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0, // 转录任务：零温度，降低数字漂移
      max_tokens: 4000
    })
  })
  if (!r.ok) throw new Error(`模型服务错误: HTTP ${r.status}`)
  const data = await r.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('模型返回为空')
  // 容忍代码块围栏
  const jsonText = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  return JSON.parse(jsonText)
}

/** 将映射结果规整为 policies.json 的字段结构 */
export function normalizeCandidate(mapped, { finalUrl }) {
  return {
    id: null, // 由命令行 --id 或 URL 推导，合并前人工确认
    title: mapped.title || null,
    unit: mapped.unit || null,
    amount: mapped.amount || null,
    window: {
      start: mapped.window_start || undefined,
      end: mapped.window_end || undefined,
      note: mapped.window_note || undefined,
      source: mapped.source_quotes?.window_note || undefined
    },
    conditions: {
      industry: mapped.conditions_industry || undefined,
      companyType: mapped.conditions_companyType || undefined,
      notes: mapped.conditions_notes || undefined
    },
    materials: mapped.materials || [],
    summary: mapped.summary || null,
    tags: mapped.tags || [],
    entry_url: mapped.entry_url || null,
    source: mapped.source || null,
    source_url: finalUrl,
    policy_validity: mapped.policy_validity || null,
    contact: mapped.contact || null,
    publish_date: mapped.publish_date || null,
    _warnings: mapped._warnings || [],
    _source_quotes: mapped.source_quotes || {}
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')))
  const url = args[0]
  const useLlm = flags.has('--llm')

  if (!url) {
    console.error('用法: node scripts/collect-policy.mjs <政策原文URL> [--id tianhe-020] [--llm]')
    process.exit(1)
  }
  if (!isWhitelisted(url)) {
    console.error(`❌ 拒绝采集：URL 不在官方域名白名单内（thnet.gov.cn / gz.gov.cn）: ${url}`)
    console.error('   仅允许采集官方来源。如确属官方镜像，请先更新 scripts/lib/policy-utils.js 的 URL_WHITELIST。')
    process.exit(1)
  }

  // 默认 id 从 URL 的 post_ 编号推导，仅作暂存文件名，合并前必须人工确认
  const idFlag = flags.has('--id') ? process.argv[process.argv.indexOf('--id') + 1] : null
  const postId = /post_(\d+)\.html/.exec(url)?.[1]
  const candidateId = idFlag || (postId ? `tianhe-post-${postId}` : `tianhe-${Date.now()}`)

  // ---- 第 1 层：抓取（确定性） ----
  console.log(`【1/5 抓取】${url}`)
  const fetched = await fetchPolicyPage(url)
  if (!fetched.buffer || fetched.error) {
    console.error(`❌ 抓取失败: ${fetched.error || `HTTP ${fetched.status}`}`)
    process.exit(1)
  }
  console.log(`   HTTP ${fetched.status} · ${fetched.buffer.length} bytes · final=${fetched.finalUrl}${fetched.hops.length > 1 ? ` · 重定向${fetched.hops.length - 1}次` : ''}`)

  // ---- 第 2 层：解析（确定性） ----
  console.log('【2/5 解析】')
  const charset = detectCharset(fetched.buffer, fetched.contentType)
  const html = decodeBuffer(fetched.buffer, charset)
  const title = extractTitle(html)
  const metaDescription = extractMetaDescription(html)
  const text = htmlToText(html, { contentSelector: 'gkmlpt' })
  console.log(`   字符集=${charset} · 标题=${title || '(未提取到)'} · 正文约 ${text.length} 字`)
  if (text.length < 200) {
    console.error('❌ 正文提取过短（<200 字），页面可能为 JS 渲染空壳或提取规则失效。')
    console.error('   建议：浏览器打开确认内容 → 换稳定的官方发布页 → 或安装 cheerio 增强选择器提取。')
    process.exit(1)
  }

  // ---- 第 3 层：映射（LLM 唯一参与处，默认 dry-run） ----
  const prompt = buildMappingPrompt({ title, text, finalUrl: fetched.finalUrl, metaDescription })
  let mapped
  let mappingMode
  if (useLlm) {
    console.log('【3/5 映射】调用大模型转写（temperature=0，逐字引文模式）...')
    await loadEnvLocal()
    if (!process.env.ARK_API_KEY) {
      console.error('❌ 未配置 ARK_API_KEY（环境变量或 .env.local），无法使用 --llm。改为 dry-run。')
    } else {
      try {
        mapped = await callArkLlm(prompt)
        mappingMode = 'llm'
      } catch (e) {
        console.error(`❌ 模型调用失败: ${e.message}。改为 dry-run 输出提示词。`)
      }
    }
  }
  if (!mapped) {
    mappingMode = 'dry-run'
    console.log('【3/5 映射】dry-run：未调用模型，已生成映射提示词（供人工或外部模型完成）')
  }

  await mkdir(STAGING_DIR, { recursive: true })

  // ---- 第 4 层：校验（确定性） ----
  console.log('【4/5 校验】')
  let candidate = null
  if (mapped) {
    candidate = normalizeCandidate(mapped, { finalUrl: fetched.finalUrl })
    candidate.id = candidateId
    const { status, issues } = checkPolicyLocally(candidate)
    candidate._verification = { status, issues }
    console.log(`   校验结果: ${status === 'ok' ? '✅ 通过' : status === 'review' ? '⚠️ 待复核' : '❌ 失败'}`)
    for (const issue of issues) {
      if (issue.severity === 'info') continue
      console.log(`   ${issue.severity === 'error' ? '❌' : '⚠️'} [${issue.field}] ${issue.message}`)
    }
  }

  // ---- 第 5 层：复核（staging 产出，绝不直接写入 policies.json） ----
  console.log('【5/5 复核】')
  const staging = {
    _pipeline: {
      collected_at: new Date().toISOString(),
      input_url: url,
      final_url: fetched.finalUrl,
      http_status: fetched.status,
      hops: fetched.hops,
      charset,
      page_title: title,
      mapping_mode: mappingMode
    },
    candidate: candidate || null,
    mapping_prompt_file: `${candidateId}.prompt.md`
  }
  const stagingFile = path.join(STAGING_DIR, `${candidateId}.json`)
  await writeFile(stagingFile, JSON.stringify(staging, null, 2) + '\n', 'utf8')
  await writeFile(path.join(STAGING_DIR, `${candidateId}.prompt.md`), prompt, 'utf8')

  console.log(`\n产出：`)
  console.log(`  data/staging/${candidateId}.json   （流水线记录 + 候选数据 + 校验结果）`)
  console.log(`  data/staging/${candidateId}.prompt.md （映射提示词，dry-run 时手动完成）`)
  console.log('\n⚠️ 人工复核步骤（不可跳过）：')
  console.log('  1. 对照原文逐字检查候选字段（重点：金额/日期/电话/URL）与 source_quotes 引文')
  console.log('  2. 确认 id、窗口状态无误后，手动合并到 data/policies.json')
  console.log('  3. 运行 node scripts/verify-policies.mjs 做全量回归校验')
  console.log('  4. 本脚本与 staging 产物在任何情况下都不会自动改写 data/policies.json')
}

main().catch((e) => {
  console.error('流水线异常:', e)
  process.exit(1)
})
