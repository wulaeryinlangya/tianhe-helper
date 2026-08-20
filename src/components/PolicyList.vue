<script setup>
import { computed, ref } from 'vue'
import { policyVerification, verificationGeneratedAt } from '../lib/verification'

const props = defineProps({
  profile: Object,
  policies: Array,
  demo: { type: Boolean, default: false }
})
const emit = defineEmits(['select', 'back'])

// 列表最多展示条数（matcher 已返回全部结果，这里负责截断并提示）
const MAX_DISPLAY = 8

const search = ref('')
const statusFilter = ref('all') // all | open | urgent | closed | none

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

const filteredPolicies = computed(() => {
  const q = search.value.trim().toLowerCase()
  return sortedPolicies.value.filter((p) => {
    if (statusFilter.value === 'open' && windowState(p) !== '申报中') return false
    if (statusFilter.value === 'urgent' && windowState(p) !== '即将截止') return false
    if (statusFilter.value === 'closed' && windowState(p) !== '已截止') return false
    if (statusFilter.value === 'none' && windowState(p) !== '') return false
    if (q) {
      const hay = `${p.title} ${p.summary} ${p.unit} ${(p.tags || []).join(' ')}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
})

const shownPolicies = computed(() => filteredPolicies.value.slice(0, MAX_DISPLAY))
const isTruncated = computed(() => filteredPolicies.value.length > MAX_DISPLAY)
const hasActiveFilters = computed(() => search.value.trim() !== '' || statusFilter.value !== 'all')

const statusFilters = [
  { value: 'all', label: '全部' },
  { value: 'open', label: '申报中' },
  { value: 'urgent', label: '即将截止' },
  { value: 'closed', label: '已截止' },
  { value: 'none', label: '窗口未定' }
]

function clearFilters() {
  search.value = ''
  statusFilter.value = 'all'
}

function onCardKeydown(e, p) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    emit('select', p)
  }
}

function veriBadge(p) {
  const v = policyVerification(p.id)
  if (!v) return null
  if (v.status === 'ok') return { cls: 'ok', label: '✅ 已核验' }
  if (v.status === 'review') return { cls: 'review', label: '⚠️ 待复核' }
  return { cls: 'failed', label: '❌ 校验失败' }
}

const veriTime = computed(() => {
  const t = verificationGeneratedAt()
  return t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : null
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

    <template v-else>
      <!-- 筛选工具栏 -->
      <div class="list-toolbar">
        <input
          v-model="search"
          class="search-input"
          type="search"
          placeholder="搜索政策名称 / 内容 / 部门..."
          aria-label="搜索政策"
        />
        <div class="filter-chips" role="group" aria-label="按申报状态筛选">
          <button
            v-for="f in statusFilters"
            :key="f.value"
            class="filter-chip"
            :class="{ active: statusFilter === f.value }"
            :aria-pressed="statusFilter === f.value"
            @click="statusFilter = f.value"
          >
            {{ f.label }}
          </button>
        </div>
        <p v-if="veriTime" class="veri-time">
          数据核验：{{ veriTime }} · 核验规则见 scripts/verify-policies.mjs
        </p>
      </div>

      <div v-if="filteredPolicies.length === 0" class="empty-state">
        <p>无符合当前筛选条件的政策。</p>
        <button class="btn btn-ghost" @click="clearFilters">清除筛选</button>
      </div>

      <div v-else class="policy-list">
        <div
          v-for="(p, i) in shownPolicies"
          :key="p.id"
          class="policy-card"
          role="button"
          tabindex="0"
          :aria-label="`查看政策：${p.title}`"
          @click="emit('select', p)"
          @keydown="onCardKeydown($event, p)"
        >
          <div class="card-top">
            <span class="rank">#{{ i + 1 }}</span>
            <h3 class="policy-title">{{ p.title }}</h3>
            <span v-if="veriBadge(p)" class="veri-badge" :class="veriBadge(p).cls">{{ veriBadge(p).label }}</span>
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

      <p v-if="isTruncated" class="truncate-hint">
        共匹配 {{ filteredPolicies.length }} 条，已展示得分最高的 {{ MAX_DISPLAY }} 条
        <template v-if="hasActiveFilters">（当前筛选范围内）</template>
        —— 可调整企业画像或搜索以查看其余政策。
      </p>
    </template>
  </div>
</template>
