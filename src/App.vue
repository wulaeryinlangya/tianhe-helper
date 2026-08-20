<script setup>
import { ref, onMounted } from 'vue'
import ProfileForm from './components/ProfileForm.vue'
import PolicyList from './components/PolicyList.vue'
import PolicyDetail from './components/PolicyDetail.vue'

const view = ref('form') // form | list | detail
const profile = ref(null)
const matchedPolicies = ref([])
const selectedPolicy = ref(null)
const demoMode = ref(false)

// 检查演示模式
onMounted(() => {
  demoMode.value = new URLSearchParams(window.location.search).get('demo') === '1'
})

function onProfileSubmitted(p, results) {
  profile.value = p
  matchedPolicies.value = results
  view.value = 'list'
}

function onPolicyClick(policy) {
  selectedPolicy.value = policy
  view.value = 'detail'
}

function onBackToList() {
  view.value = 'list'
}

function onReset() {
  view.value = 'form'
  profile.value = null
  matchedPolicies.value = []
  selectedPolicy.value = null
}
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="header-inner">
        <div class="brand">
          <span class="logo">天河惠企</span>
          <span class="logo-sub">政策申报助手</span>
        </div>
        <div class="header-actions">
          <span v-if="demoMode" class="demo-badge">演示模式</span>
          <button v-if="view !== 'form'" class="btn btn-ghost" @click="onReset">重新匹配</button>
        </div>
      </div>
    </header>

    <main class="app-main">
      <ProfileForm v-if="view === 'form'" :demo="demoMode" @submitted="onProfileSubmitted" />
      <PolicyList
        v-else-if="view === 'list'"
        :profile="profile"
        :policies="matchedPolicies"
        :demo="demoMode"
        @select="onPolicyClick"
        @back="onReset"
      />
      <PolicyDetail
        v-else
        :policy="selectedPolicy"
        :profile="profile"
        :demo="demoMode"
        @back="onBackToList"
      />
    </main>

    <footer class="app-footer">
      <p>天河区AI大赛 · AI应用创新数智天河 · 数据来源：天河区人民政府公开政策</p>
    </footer>
  </div>
</template>
