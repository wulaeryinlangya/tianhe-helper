<script setup>
import { ref } from 'vue'
import { matchPolicies } from '../lib/matcher'
import { getDemoMatches } from '../lib/demo'

const props = defineProps({
  demo: { type: Boolean, default: false }
})
const emit = defineEmits(['submitted'])

const profile = ref({
  industry: '',
  employees: '',
  revenue: '',
  stage: '',
  companyType: ''
})
const loading = ref(false)
const error = ref('')

// 示例企业一键填入
const samples = [
  {
    name: 'SaaS创业公司',
    icon: '💻',
    profile: { industry: '软件和信息技术服务', employees: '20人以下', revenue: '500万以下', stage: '初创期', companyType: '科技型中小企业' }
  },
  {
    name: '餐饮连锁门店',
    icon: '🍜',
    profile: { industry: '餐饮业', employees: '50-100人', revenue: '500-1000万', stage: '成长期', companyType: '个体工商户' }
  },
  {
    name: '电商小卖家',
    icon: '🛍️',
    profile: { industry: '批发和零售业', employees: '20-50人', revenue: '1000-2000万', stage: '成长期', companyType: '小微企业' }
  }
]

function fillSample(s) {
  profile.value = { ...s.profile }
  error.value = ''
}

async function onSubmit() {
  error.value = ''
  if (!profile.value.industry || !profile.value.stage) {
    error.value = '请至少选择行业和发展阶段'
    return
  }
  loading.value = true
  try {
    const results = props.demo
      ? getDemoMatches(profile.value)
      : await matchPolicies(profile.value)
    emit('submitted', { ...profile.value }, results)
  } catch (e) {
    error.value = e.message || '匹配失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="form-page">
    <div class="hero">
      <h1>你的企业能领哪些<span class="hl">天河政策补贴</span>？</h1>
      <p class="hero-sub">输入企业信息，1秒匹配天河区可申报的惠企政策，含补贴金额与申报窗口倒计时</p>
    </div>

    <div class="sample-row">
      <button v-for="s in samples" :key="s.name" class="sample-chip" @click="fillSample(s)">
        <span class="chip-icon">{{ s.icon }}</span>{{ s.name }}
      </button>
    </div>

    <div class="form-card">
      <div class="form-group">
        <label>所属行业</label>
        <select v-model="profile.industry">
          <option value="">请选择行业</option>
          <option>软件和信息技术服务</option>
          <option>人工智能与科技服务</option>
          <option>高端制造</option>
          <option>批发和零售业</option>
          <option>餐饮业</option>
          <option>文化创意</option>
          <option>生物医药</option>
          <option>现代服务业</option>
          <option>其他</option>
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>员工人数</label>
          <select v-model="profile.employees">
            <option value="">请选择</option>
            <option>20人以下</option>
            <option>20-50人</option>
            <option>50-100人</option>
            <option>100-300人</option>
            <option>300人以上</option>
          </select>
        </div>
        <div class="form-group">
          <label>年营收</label>
          <select v-model="profile.revenue">
            <option value="">请选择</option>
            <option>500万以下</option>
            <option>500-1000万</option>
            <option>1000-2000万</option>
            <option>2000万-1亿</option>
            <option>1亿以上</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>发展阶段</label>
          <select v-model="profile.stage">
            <option value="">请选择</option>
            <option>初创期</option>
            <option>成长期</option>
            <option>成熟期</option>
          </select>
        </div>
        <div class="form-group">
          <label>企业类型</label>
          <select v-model="profile.companyType">
            <option value="">请选择</option>
            <option>小微企业</option>
            <option>科技型中小企业</option>
            <option>高新技术企业</option>
            <option>专精特新企业</option>
            <option>个体工商户</option>
            <option>其他</option>
          </select>
        </div>
      </div>

      <p v-if="error" class="form-error">{{ error }}</p>

      <button class="btn btn-primary btn-large" :disabled="loading" @click="onSubmit">
        {{ loading ? '匹配中...' : '智能匹配政策' }}
      </button>
    </div>
  </div>
</template>
