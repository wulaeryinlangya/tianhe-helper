<script setup>
import { computed, ref } from 'vue'
import { askQuestion } from '../lib/llm'
import { demoAnswers } from '../lib/demo'
import { renderMarkdown } from '../lib/md'
import { policyVerification, verificationGeneratedAt } from '../lib/verification'

const props = defineProps({
  policy: Object,
  profile: Object,
  demo: { type: Boolean, default: false }
})
const emit = defineEmits(['back'])

const question = ref('')
const answer = ref('')
const loading = ref(false)
const error = ref('')
const degraded = ref(false)
const suggested = ['我们符合条件吗？', '需要准备哪些材料？', '怎么申报？', '补贴多久到账？']

// QA 回答经极简 Markdown 渲染后展示（LLM 原始 HTML 会被转义，仅渲染受控语法）
const answerHtml = computed(() => renderMarkdown(answer.value))

// 申报条件分组展示：行业 / 企业类型 / 条件说明，全部为空时回退到匹配器提取的参考条件
const conditionGroups = computed(() => {
  const c = props.policy.conditions || {}
  const groups = []
  if (Array.isArray(c.industry) && c.industry.length) groups.push({ label: '面向行业', items: c.industry })
  if (Array.isArray(c.companyType) && c.companyType.length) groups.push({ label: '面向企业类型', items: c.companyType })
  if (Array.isArray(c.notes) && c.notes.length) groups.push({ label: '申报条件说明', items: c.notes })
  if (!groups.length && Array.isArray(props.policy._condNotes) && props.policy._condNotes.length) {
    groups.push({ label: '参考条件（以原文为准）', items: props.policy._condNotes })
  }
  return groups
})

// 数据核验状态（data/verification.json，由 npm run verify:policies 生成）
const verification = computed(() => policyVerification(props.policy.id))
const veriLabel = computed(() => (
  { ok: '✅ 已核验', review: '⚠️ 待复核', failed: '❌ 校验失败' }[verification.value?.status] || ''
))
const veriTime = computed(() => {
  const t = verificationGeneratedAt()
  return t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : null
})

async function onAsk(q) {
  const questionText = q || question.value
  if (!questionText.trim()) return
  loading.value = true
  error.value = ''
  answer.value = ''
  degraded.value = false
  try {
    if (props.demo) {
      answer.value = demoAnswers[props.policy.id] || demoAnswers.default
    } else {
      try {
        answer.value = await askQuestion(props.policy, props.profile, questionText)
      } catch (e) {
        // 端云协同：云端失败自动降级到本地预设回答
        degraded.value = true
        answer.value = demoAnswers[props.policy.id] || demoAnswers.default
      }
    }
  } finally {
    loading.value = false
  }
}

function useSuggestion(q) {
  question.value = q
  onAsk(q)
}
</script>

<template>
  <div class="detail-page">
    <button class="btn btn-ghost back-btn" @click="emit('back')">← 返回政策列表</button>

    <div class="detail-card">
      <h2>{{ policy.title }}</h2>
      <div class="detail-meta">
        <span class="meta-amount">💰 {{ policy.amount }}</span>
        <span class="meta-unit">{{ policy.unit }}</span>
      </div>
      <p v-if="policy.source" class="detail-source-line">政策依据：{{ policy.source }}</p>
      <p class="detail-summary">{{ policy.summary }}</p>

      <div class="detail-section">
        <h3>申报条件</h3>
        <template v-if="conditionGroups.length">
          <div v-for="(g, gi) in conditionGroups" :key="gi" class="condition-group">
            <p class="condition-label">{{ g.label }}</p>
            <ul>
              <li v-for="(c, i) in g.items" :key="i">{{ c }}</li>
            </ul>
          </div>
        </template>
        <p v-else>详见政策原文</p>
      </div>

      <div class="detail-section">
        <h3>申报窗口</h3>
        <p v-if="policy.window?.start && policy.window?.end">{{ policy.window.start }} ~ {{ policy.window.end }}</p>
        <p v-else-if="policy.window?.note">{{ policy.window.note }}</p>
        <p v-if="policy.policy_validity" class="validity-line">政策有效期：{{ policy.policy_validity }}</p>
        <p v-if="policy.contact" class="contact-line">咨询电话：{{ policy.contact }}</p>
        <p v-if="policy.entry_url" class="entry-link">
          <a :href="policy.entry_url" target="_blank" rel="noopener">进入申报入口 →</a>
        </p>
        <p v-if="policy.source_url" class="entry-link">
          <a :href="policy.source_url" target="_blank" rel="noopener">📄 查看政策原文（官方）→</a>
        </p>
      </div>

      <div class="detail-section">
        <h3>所需材料</h3>
        <ul v-if="policy.materials && policy.materials.length">
          <li v-for="(m, i) in policy.materials" :key="i">{{ m }}</li>
        </ul>
        <p v-else-if="policy.materials_note">{{ policy.materials_note }}</p>
        <p v-else>详见官方申报指南</p>
      </div>

      <!-- 数据核验状态：确定性脚本（scripts/verify-policies.mjs）的结果，与 AI 无关 -->
      <div v-if="verification" class="verify-block" :class="verification.status">
        <p class="verify-head">
          <span class="verify-label">{{ veriLabel }}</span>
          <span v-if="veriTime" class="verify-time">核验时间：{{ veriTime }}</span>
        </p>
        <ul v-if="verification.issues && verification.issues.length" class="verify-issues">
          <li v-for="(issue, i) in verification.issues" :key="i" :class="issue.severity">
            {{ issue.severity === 'error' ? '❌' : issue.severity === 'warn' ? '⚠️' : 'ℹ️' }}
            <strong>{{ issue.field }}</strong>：{{ issue.message }}
          </li>
        </ul>
      </div>
      <p v-else class="verify-missing">该条政策尚未通过数据核验脚本检查（npm run verify:policies）</p>
    </div>

    <div class="qa-card">
      <h3>🤖 AI 政策咨询</h3>
      <p class="qa-hint">针对本政策提问，AI 结合您的企业情况回答是否符合、怎么申报</p>

      <div class="suggestion-row">
        <button v-for="s in suggested" :key="s" class="suggestion-chip" @click="useSuggestion(s)">{{ s }}</button>
      </div>

      <div class="qa-input">
        <input v-model="question" placeholder="输入问题，如：我们符合条件吗？" @keyup.enter="onAsk()" />
        <button class="btn btn-primary" :disabled="loading" @click="onAsk()">
          {{ loading ? '思考中...' : '提问' }}
        </button>
      </div>

      <p v-if="error" class="form-error">{{ error }}</p>
      <div v-if="degraded" class="degrade-tip">⚡ 网络波动，已切换为本地智能回答（功能不受影响）</div>
      <div v-if="answer" class="qa-answer" v-html="answerHtml"></div>
    </div>
  </div>
</template>
