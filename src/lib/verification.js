// 政策数据核验状态读取：data/verification.json 由 `npm run verify:policies` 生成
// 使用 import.meta.glob 保证文件不存在时也能正常构建运行（返回空报告），
// 生成后刷新页面即可看到核验徽章，无需改代码。
const mods = import.meta.glob('../../data/verification.json', { eager: true })
const report = (Object.values(mods)[0] || {}).default || null

/** 某条政策的核验结果 { status, issues } 或 null */
export function policyVerification(id) {
  return (report && report.results && report.results[id]) || null
}

/** 报告生成时间（ISO 字符串） */
export function verificationGeneratedAt() {
  return report?.generated_at || null
}
