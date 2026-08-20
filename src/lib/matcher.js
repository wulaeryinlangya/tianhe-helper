// 政策匹配引擎：基于画像字段与政策条件的标签匹配 + 可解释打分
// 每条匹配结果附带 _reasons（为什么匹配/不匹配的逐条解释）
// 零 API 依赖，离线可用

import policies from '../../data/policies.json'

// 画像字段到政策标签的映射
const INDUSTRY_TAGS = {
  '软件和信息技术服务': ['软件', '信息技术', '科技', '数字经济'],
  '人工智能与科技服务': ['人工智能', '科技', 'AI', '数字经济'],
  '高端制造': ['制造', '工业', '装备'],
  '批发和零售业': ['商贸', '零售', '批发', '电商'],
  '餐饮业': ['餐饮', '服务业', '商贸'],
  '文化创意': ['文创', '文化', '数字创意'],
  '生物医药': ['生物医药', '医药', '大健康'],
  '现代服务业': ['服务业', '现代服务', '金融'],
  '其他': []
}

const TYPE_TAGS = {
  '小微企业': ['小微'],
  '科技型中小企业': ['科技型中小企业', '科技'],
  '高新技术企业': ['高新技术企业', '高企', '科技'],
  '专精特新企业': ['专精特新', '科技'],
  '个体工商户': ['个体工商户', '个体户'],
  '其他': []
}

// 计算标签命中：返回命中的条件列表
function matchReasons(tags, conditions, condLabel) {
  if (!conditions || conditions.length === 0) return { hits: [], score: 0 }
  const hits = []
  let score = 0
  for (const c of conditions) {
    // 精确命中：企业的某个标签直接等于政策条件
    const exact = tags.find(t => t === c || t.includes(c) || c.includes(t))
    if (exact) {
      // detail 只展示命中的政策条件本身（更直观），内部匹配到的画像标签不对外展示
      hits.push({ label: condLabel, detail: c, score: 1 })
      score += 1
    }
  }
  return { hits, score }
}

export function matchPolicies(profile) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const results = rankPolicies(profile)
      resolve(results)
    }, 500)
  })
}

export function rankPolicies(profile) {
  const indTags = INDUSTRY_TAGS[profile.industry] || []
  const typeTags = TYPE_TAGS[profile.companyType] || []
  const allTags = [...indTags, ...typeTags]

  const scored = policies.map((p) => {
    const conds = p.conditions || {}
    const reasons = []
    let score = 0

    // 行业匹配
    const ind = matchReasons(indTags, conds.industry || [], '行业')
    reasons.push(...ind.hits); score += ind.score
    // 无行业限制的通用政策
    if (!conds.industry || conds.industry.length === 0) {
      reasons.push({ label: '通用', detail: '不限行业', score: 1 })
      score += 1
    }

    // 企业类型匹配
    const typ = matchReasons(typeTags, conds.companyType || [], '企业类型')
    reasons.push(...typ.hits); score += typ.score

    // 发展阶段匹配
    if (conds.stage && profile.stage && conds.stage.includes(profile.stage)) {
      reasons.push({ label: '发展阶段', detail: `${profile.stage} ✓`, score: 2 })
      score += 2
    }

    // 规模匹配
    if (conds.employees && profile.employees && conds.employees.includes(profile.employees)) {
      reasons.push({ label: '员工规模', detail: `${profile.employees} ✓`, score: 2 })
      score += 2
    }
    if (conds.revenue && profile.revenue && conds.revenue.includes(profile.revenue)) {
      reasons.push({ label: '营收规模', detail: `${profile.revenue} ✓`, score: 2 })
      score += 2
    }

    // 标签关键词匹配
    const tagHit = (p.tags || []).filter(t => allTags.some(a => a && (t.includes(a) || a.includes(t))))
    if (tagHit.length > 0) {
      reasons.push({ label: '政策关键词', detail: tagHit.join('、'), score: tagHit.length * 2 })
      score += tagHit.length * 2
    }

    // 提取政策条件中的具体说明作为"参考条件"（用于展示需要满足但画像未覆盖的）
    const condNotes = conds.notes || []

    return {
      ...p,
      _score: score,
      _reasons: reasons,
      _condNotes: condNotes
    }
  })

  // 返回全部得分>0的结果，按分数降序；展示层（PolicyList）负责截断并提示总数
  return scored
    .filter(p => p._score > 0)
    .sort((a, b) => b._score - a._score)
}
