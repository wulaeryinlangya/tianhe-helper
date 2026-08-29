// 扩展的企业画像维度
export const EXTENDED_PROFILE_FIELDS = {
  // 基础字段（来自表单）
  industry: { label: '行业', type: 'select', required: true },
  employees: { label: '员工数', type: 'select', required: true },
  revenue: { label: '年营收', type: 'select', required: true },
  stage: { label: '发展阶段', type: 'select', required: true },
  companyType: { label: '企业类型', type: 'select', required: true },

  // AI 问诊扩展字段
  rdRatio: { label: '研发投入占比', type: 'number', unit: '%', radarDim: true },
  patents: { label: '专利/软著数量', type: 'number', unit: '项', radarDim: true },
  certifications: { label: '资质认证', type: 'array', radarDim: true },
  exportBusiness: { label: '是否有出口业务', type: 'boolean', radarDim: false },
  annualGrowth: { label: '年增长率', type: 'number', unit: '%', radarDim: true },
  employeeGrowth: { label: '员工增长率', type: 'number', unit: '%', radarDim: false },
  mainProducts: { label: '主营产品/服务', type: 'text', radarDim: false },
  targetMarket: { label: '目标市场', type: 'text', radarDim: false }
}

// 雷达图维度配置（6个维度）
export const RADAR_DIMENSIONS = [
  { key: 'scale', label: '企业规模', max: 100 },
  { key: 'innovation', label: '创新能力', max: 100 },
  { key: 'growth', label: '成长潜力', max: 100 },
  { key: 'qualification', label: '资质完备度', max: 100 },
  { key: 'industryMatch', label: '行业匹配度', max: 100 },
  { key: 'stageMaturity', label: '阶段成熟度', max: 100 }
]

// 计算雷达图数据
export function calculateRadarData(profile) {
  // 企业规模 (revenue + employees)
  const revenueScore = getRevenueScore(profile.revenue)
  const employeeScore = getEmployeeScore(profile.employees)
  const scale = (revenueScore + employeeScore) / 2

  // 创新能力 (rdRatio + patents)
  const rdScore = (profile.rdRatio || 0) // 0-100
  const patentScore = Math.min((profile.patents || 0) * 5, 100) // 20项专利=100分
  const innovation = (rdScore + patentScore) / 2

  // 成长潜力 (stage + growth)
  const stageScore = getStageScore(profile.stage)
  const growthScore = Math.min((profile.annualGrowth || 0) * 2, 100)
  const growth = (stageScore + growthScore) / 2

  // 资质完备度 (certifications)
  const certScore = (profile.certifications?.length || 0) * 20 // 5项认证=100分
  const qualification = Math.min(certScore, 100)

  // 行业匹配度 (基于 industry 与政策库的匹配度)
  const industryMatch = getIndustryMatchScore(profile.industry)

  // 阶段成熟度 (基于 stage)
  const stageMaturity = getStageScore(profile.stage)

  return [scale, innovation, growth, qualification, industryMatch, stageMaturity]
}

// 辅助函数
function getRevenueScore(revenue) {
  const map = {
    '500万以下': 20,
    '500万-2000万': 40,
    '2000万-1亿': 60,
    '1亿-5亿': 80,
    '5亿以上': 100
  }
  return map[revenue] || 50
}

function getEmployeeScore(employees) {
  const map = {
    '20人以下': 20,
    '20-50人': 40,
    '50-200人': 60,
    '200-1000人': 80,
    '1000人以上': 100
  }
  return map[employees] || 50
}

function getStageScore(stage) {
  const map = {
    '初创期': 30,
    '成长期': 60,
    '成熟期': 90
  }
  return map[stage] || 50
}

function getIndustryMatchScore(industry) {
  // TODO: 根据政策库中该行业的政策数量计算
  return 70 // 暂时固定值
}
