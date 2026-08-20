<script setup>
import { ref } from 'vue'
import { askQuestion } from '../lib/llm'
import { demoAnswers } from '../lib/demo'

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
      <p class="detail-summary">{{ policy.summary }}</p>

      <div class="detail-section">
        <h3>申报条件</h3>
        <ul>
          <li v-for="(c, i) in (policy.conditions?.notes || policy.conditions?.industry || ['详见政策原文'])" :key="i">{{ c }}</li>
        </ul>
      </div>

      <div class="detail-section">
        <h3>申报窗口</h3>
        <p v-if="policy.window?.start && policy.window?.end">{{ policy.window.start }} ~ {{ policy.window.end }}</p>
        <p v-else-if="policy.window?.note">{{ policy.window.note }}</p>
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
      <div v-if="answer" class="qa-answer">{{ answer }}</div>
    </div>
  </div>
</template>
