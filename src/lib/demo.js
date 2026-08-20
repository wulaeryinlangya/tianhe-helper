// 演示模式离线数据：?demo=1 或 AI 问答失败降级时使用，不依赖网络/API
import { rankPolicies } from './matcher'

export function getDemoMatches(profile) {
  return rankPolicies(profile)
}

// 根据政策数据 + 企业画像生成离线回答（覆盖全部政策，不再落到通用兜底）。
// 字段全部取自 policies.json 真实数据，不编造；「是否符合」只提示匹配点、不下死结论，
// 引导用户对照官方申报指南最终确认。与 md.js 的渲染语法兼容（**加粗**、- 列表、1. 列表、[链接]）。
export function getDemoAnswer(policy, profile) {
  const profileText = [profile?.industry, profile?.companyType].filter(Boolean).join('、') || '您填写的企业画像'
  const reasons = (policy._reasons || []).filter(r => r.label !== '通用')
  const reasonText = reasons.length
    ? reasons.map(r => `${r.label}：${r.detail}`).join('；')
    : '本政策需结合您的具体经营数据进一步判断'

  const w = policy.window || {}
  const windowText = (w.start && w.end) ? `${w.start} ~ ${w.end}` : (w.note || '以官方申报指南为准')
  const validity = policy.policy_validity ? `；${policy.policy_validity}` : ''

  const notes = (policy.conditions?.notes || []).filter(Boolean)
  const condText = notes.length ? notes.map(n => `- ${n}`).join('\n') : '- 详见政策原文'

  const hasMaterials = Array.isArray(policy.materials) && policy.materials.length > 0
  const materialsText = hasMaterials
    ? policy.materials.map((m, i) => `${i + 1}. ${m}`).join('\n') + (policy.materials_note ? `\n（${policy.materials_note}）` : '')
    : (policy.materials_note || '详见官方申报指南')

  const entry = policy.entry_url || 'https://thzwb.thnet.gov.cn/policy'
  const sourceLink = policy.source_url ? `，[政策原文（官方）](${policy.source_url})` : ''
  const contactText = policy.contact
    ? `咨询电话：${policy.contact}（${policy.unit}）${sourceLink}`
    : `主管部门：${policy.unit}${sourceLink}`

  return [
    `您好！根据您的企业信息（**${profileText}**），本政策与您的画像匹配点如下：`,
    reasonText,
    '',
    `**政策依据**：${policy.source || '详见政策原文'}`,
    `**补贴金额**：${policy.amount}`,
    `**申报窗口**：${windowText}${validity}`,
    '',
    '**申报条件**：',
    condText,
    '',
    '**怎么申报**：',
    `1. 登录【天河区政策兑现服务平台】${entry}`,
    `2. 搜索「${policy.title}」对应的申报事项并填报`,
    '3. 按指南要求提交材料，等待主管部门审核',
    '',
    '**所需材料**：',
    materialsText,
    '',
    `**联系与核实**：${contactText}`,
    '',
    '补贴到账时间以主管部门审核与资金拨付流程为准，以上内容基于公开政策整理、仅供参考，是否符合以官方申报指南和主管部门审核为准。',
  ].join('\n')
}
