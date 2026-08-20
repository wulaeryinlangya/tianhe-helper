// 政策数据校验器：对 data/policies.json 逐条做确定性校验
//
// 用法：
//   node scripts/verify-policies.mjs            # 本地字段校验 + 链接存活检查
//   node scripts/verify-policies.mjs --offline  # 仅本地字段校验（CI / 断网）
//   node scripts/verify-policies.mjs --json     # 额外以 JSON 输出报告
//
// 输出：
//   1. 控制台可读报告（按政策分组的 issue 列表 + 汇总 + 待复核清单）
//   2. data/verification.json（供前端展示"数据核验状态"徽章）
//
// 判定口径（与 scripts/lib/policy-utils.js 一致）：
//   error → failed（数据有硬伤，应下架或立即修复）
//   warn  → review（疑似幻觉/抄录漂移，需人工对照原文复核）
//   info  → 不影响状态（如"窗口已过期"提示）

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkPolicyLocally,
  checkLink,
  collectLinkUrls,
  mapWithConcurrency
} from './lib/policy-utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, '..', 'data', 'policies.json')
const OUT_FILE = path.join(__dirname, '..', 'data', 'verification.json')

const ONLINE = !process.argv.includes('--offline')
const AS_JSON = process.argv.includes('--json')

const SEVERITY_ICON = { error: '❌', warn: '⚠️', info: 'ℹ️' }
const STATUS_LABEL = { ok: '通过', review: '待复核', failed: '失败' }
const STATUS_ICON = { ok: '✅', review: '⚠️', failed: '❌' }

async function main() {
  // ---- 读取数据（数据本身不可解析时直接失败退出，不做任何猜测） ----
  let policies
  try {
    policies = JSON.parse(await readFile(DATA_FILE, 'utf8'))
  } catch (e) {
    console.error(`❌ 无法解析 ${DATA_FILE}: ${e.message}`)
    process.exit(1)
  }
  if (!Array.isArray(policies)) {
    console.error(`❌ ${DATA_FILE} 根节点应为数组`)
    process.exit(1)
  }
  console.log(`开始校验 ${policies.length} 条政策（${ONLINE ? '含链接存活检查' : '离线模式'}）...\n`)

  // ---- 1) 本地字段校验 ----
  const results = {}
  for (const p of policies) {
    const { status, issues } = checkPolicyLocally(p)
    results[p.id] = { status, issues: issues || [] }
  }

  // ---- 2) id 唯一性（跨记录校验） ----
  const seen = new Map()
  for (const p of policies) {
    if (seen.has(p.id)) {
      const dup = seen.get(p.id)
      results[p.id].issues.push({ field: 'id', severity: 'error', message: `id 与第 ${dup + 1} 条重复` })
      results[p.id].status = 'failed'
    }
    seen.set(p.id, policies.indexOf(p))
  }

  // ---- 3) 链接存活检查（去重后并发执行） ----
  const linkChecks = new Map() // url -> result
  if (ONLINE) {
    const links = []
    for (const p of policies) {
      for (const l of collectLinkUrls(p)) {
        if (!linkChecks.has(l.url)) {
          linkChecks.set(l.url, null)
          links.push({ ...l, policyId: p.id })
        }
      }
    }
    console.log(`检查 ${links.length} 个唯一链接存活状态...`)
    const linkResults = await mapWithConcurrency(links, 4, async ({ url }) => checkLink(url))
    links.forEach((l, i) => linkChecks.set(l.url, linkResults[i]))
    for (const { policyId, field, url } of links) {
      const r = linkChecks.get(url)
      if (!r.ok) {
        const reason = r.error === 'timeout' ? '连接超时' : r.error ? `网络错误: ${r.error}` : `HTTP ${r.status}`
        results[policyId].issues.push({ field, severity: 'error', message: `链接不可达（${reason}）: ${url}` })
        results[policyId].status = 'failed'
      }
    }
  }

  // ---- 4) 汇总并输出 ----
  const summary = { total: policies.length, ok: 0, review: 0, failed: 0, info: 0 }
  for (const id of Object.keys(results)) {
    summary[results[id].status]++
    summary.info += results[id].issues.filter((i) => i.severity === 'info').length
  }

  const report = {
    generated_at: new Date().toISOString(),
    source: 'scripts/verify-policies.mjs',
    online: ONLINE,
    summary,
    results
  }
  await mkdir(path.dirname(OUT_FILE), { recursive: true })
  await writeFile(OUT_FILE, JSON.stringify(report, null, 2) + '\n', 'utf8')
  console.log(`\n报告已写入 ${path.relative(process.cwd(), OUT_FILE)}`)

  // ---- 控制台报告 ----
  console.log('\n' + '='.repeat(72))
  console.log(`天河惠企政策数据校验报告（${ONLINE ? '在线' : '离线'} · ${report.generated_at}）`)
  console.log(`总计 ${summary.total} 条：✅ 通过 ${summary.ok} | ⚠️ 待复核 ${summary.review} | ❌ 失败 ${summary.failed} | ℹ️ 提示 ${summary.info}`)
  console.log('='.repeat(72))

  const flagged = policies.filter((p) => results[p.id].status !== 'ok')
  if (flagged.length === 0) {
    console.log('🎉 全部通过，无待复核项。')
  }
  for (const p of flagged) {
    const r = results[p.id]
    console.log(`\n[${p.id}] ${p.title}  —— ${STATUS_ICON[r.status]}${STATUS_LABEL[r.status]}`)
    for (const issue of r.issues) {
      if (issue.severity === 'info') continue // 控制台不打印 info 噪音
      console.log(`   ${SEVERITY_ICON[issue.severity]} [${issue.field}] ${issue.message}`)
    }
  }

  // ---- 待复核清单（后续人工对照原文逐条复核用） ----
  if (flagged.length > 0) {
    console.log('\n' + '-'.repeat(72))
    console.log('待复核清单（按 id）：' + flagged.map((p) => p.id).join('、'))
    console.log('复核方法：对照 source_url 政策原文，逐条确认 issue 字段；修正 data/policies.json 后重跑本脚本。')
  }

  // ---- 提示信息（info：不影响通过/待复核状态，但建议关注） ----
  const infoLines = []
  for (const p of policies) {
    for (const issue of results[p.id].issues) {
      if (issue.severity === 'info') infoLines.push(`   ℹ️ [${p.id}] ${issue.field}: ${issue.message}`)
    }
  }
  if (infoLines.length > 0) {
    console.log('\n' + '-'.repeat(72))
    console.log(`提示信息（${infoLines.length} 条，不影响校验状态）：`)
    console.log(infoLines.join('\n'))
  }

  if (AS_JSON) console.log('\nJSON:\n' + JSON.stringify(report, null, 2))
  process.exit(summary.failed > 0 ? 2 : 0)
}

main().catch((e) => {
  console.error('校验脚本异常:', e)
  process.exit(1)
})
