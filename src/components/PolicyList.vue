<script setup>
import { computed } from 'vue'

const props = defineProps({
  profile: Object,
  policies: Array,
  demo: { type: Boolean, default: false }
})
const emit = defineEmits(['select', 'back'])

// 申报窗口展示（支持真实日期或"以官方指南为准"两种形态）
function daysLeft(policy) {
  const end = policy.window?.end
  if (!end) return null
  const diff = new Date(end + 'T23:59:59') - new Date()
  return Math.ceil(diff / 86400000)
}

function formatWindow(policy) {
  const w = policy.window
  if (!w) return ''
  if (w.start && w.end) return `${w.start} ~ ${w.end}`
  if (w.note) return w.note
  return ''
}

function windowState(policy) {
  const d = daysLeft(policy)
  if (d === null) return ''
  if (d < 0) return '已截止'
  if (d <= 7) return '即将截止'
  return '申报中'
}

function hasRealWindow(policy) {
  return !!(policy.window?.start && policy.window?.end)
}

const sortedPolicies = computed(() => {
  return [...props.policies].sort((a, b) => {
    const scoreDiff = (b._score || 0) - (a._score || 0)
    if (scoreDiff !== 0) return scoreDiff
    // 有真实窗口的优先展示，其余按来源顺序
    const ra = hasRealWindow(a) ? 0 : 1
    const rb = hasRealWindow(b) ? 0 : 1
    return ra - rb
  })
})
</script>

<template>
  <div class="list-page">
    <div class="list-header">
      <div>
        <h2>匹配到 {{ policies.length }} 条天河政策</h2>
        <p class="profile-summary">
          {{ profile.industry }} · {{ profile.employees }} · {{ profile.revenue }} · {{ profile.stage }}
        </p>
      </div>
    </div>

    <div v-if="policies.length === 0" class="empty-state">
      <p>暂未匹配到符合条件的政策，请尝试调整企业信息。</p>
      <button class="btn btn-ghost" @click="emit('back')">返回修改</button>
    </div>

    <div class="policy-list">
      <div v-for="(p, i) in sortedPolicies" :key="p.id" class="policy-card" @click="emit('select', p)">
        <div class="card-top">
          <span class="rank">#{{ i + 1 }}</span>
          <h3 class="policy-title">{{ p.title }}</h3>
        </div>
        <p class="policy-summary">{{ p.summary }}</p>
        <div class="card-meta">
          <span class="meta-amount">💰 {{ p.amount }}</span>
          <span class="meta-unit">{{ p.unit }}</span>
        </div>
        <div class="card-reasons" v-if="p._reasons && p._reasons.length">
          <span class="reason-chip" v-for="(r, ri) in p._reasons" :key="ri">{{ r.label }}：{{ r.detail }}</span>
        </div>
        <div class="card-bottom">
          <span class="window-date">{{ formatWindow(p) }}</span>
          <span v-if="hasRealWindow(p)" class="countdown" :class="windowState(p) === '即将截止' ? 'urgent' : windowState(p) === '已截止' ? 'closed' : ''">
            {{ windowState(p) === '已截止' ? '已截止' : `剩 ${daysLeft(p)} 天` }}
          </span>
          <span class="match-tag">{{ p._score }} 分匹配</span>
        </div>
        <a v-if="p.source_url" :href="p.source_url" target="_blank" rel="noopener" class="policy-source" @click.stop>
          📄 政策原文（官方）
        </a>
      </div>
    </div>
  </div>
</template>
