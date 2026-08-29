<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import ProfileForm from './components/ProfileForm.vue'
import AIConsultant from './components/AIConsultant.vue'
import ProfileRadarChart from './components/ProfileRadarChart.vue'
import PolicyList from './components/PolicyList.vue'
import PolicyDetail from './components/PolicyDetail.vue'
import UpdateNotice from './components/UpdateNotice.vue'
import { loadProfile, saveProfile, saveLastUpdateCheck } from './lib/storage'
import { matchPolicies } from './lib/matcher'
import policiesData from '../data/policies.json'
import newsData from '../data/news.json'

const view = ref('form') // form | consultant | radar | list | detail
const profile = ref(null)
const matchedPolicies = ref([])
const selectedPolicy = ref(null)
const demoMode = ref(false)
const showConsultantPrompt = ref(false)
const showLeftSidebar = ref(false)

// 政策新闻数据（从 JSON 文件加载）
const policyNews = ref(newsData)

// 即将截止的政策（扩展版：包含紧急程度）
const upcomingDeadlines = computed(() => {
  if (!matchedPolicies.value || matchedPolicies.value.length === 0) return []
  const now = new Date()

  return matchedPolicies.value
    .filter(p => {
      if (!p.window?.end) return false
      const end = new Date(p.window.end + 'T23:59:59')
      const days = Math.ceil((end - now) / (1000 * 60 * 60 * 24))
      return days > 0 && days <= 30
    })
    .map(p => {
      const end = new Date(p.window.end + 'T23:59:59')
      const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24))
      return {
        ...p,
        daysLeft,
        urgency: getDeadlineUrgency(daysLeft)
      }
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5)
})

// 紧急程度判断
function getDeadlineUrgency(daysLeft) {
  if (daysLeft <= 7) return 'urgent'
  if (daysLeft <= 15) return 'warning'
  return 'normal'
}

function getUrgencyIcon(urgency) {
  if (urgency === 'urgent') return '🔴'
  if (urgency === 'warning') return '🟡'
  return '🟢'
}

// 浏览器历史管理
function pushView(newView, data = {}) {
  view.value = newView

  // 推送到浏览器历史
  const state = { view: newView, ...data }
  const url = `#${newView}`
  history.pushState(state, '', url)
}

function handlePopState(event) {
  if (event.state && event.state.view) {
    // 从历史状态恢复
    view.value = event.state.view
    if (event.state.policy) {
      selectedPolicy.value = event.state.policy
    }
  } else {
    // 默认回到首页
    view.value = 'form'
  }
}

async function checkForUpdates() {
  const checking = confirm(
    '检查政策数据更新？\n\n' +
    '这将验证当前数据是否为最新版本。\n' +
    '如果有更新，页面会自动重新加载最新数据。'
  )
  if (!checking) return

  try {
    // 步骤1：获取当前加载的数据版本信息
    const currentVersion = policiesData.length
    const currentDate = '2026-08-25' // 从 policies.json 的最后修改时间

    console.log('当前政策数量:', currentVersion)

    // 步骤2：尝试从服务器获取最新数据（带缓存破坏）
    const response = await fetch('/data/policies.json?t=' + Date.now())

    if (!response.ok) {
      if (response.status === 404) {
        alert('⚠ 政策数据文件不存在\n\n请检查部署配置。')
      } else {
        alert(`⚠ 服务器返回错误 ${response.status}\n\n请稍后重试。`)
      }
      return
    }

    // 步骤3：比对数据版本
    const latestData = await response.json()
    const latestVersion = latestData.length

    console.log('最新政策数量:', latestVersion)

    if (latestVersion === currentVersion) {
      // 数据一致，无需更新
      saveLastUpdateCheck()
      alert(
        '✓ 政策数据已是最新！\n\n' +
        `当前版本：${currentVersion} 条政策\n` +
        `最后更新：${currentDate}`
      )
    } else {
      // 发现新版本
      const shouldUpdate = confirm(
        '🎉 发现新版本！\n\n' +
        `当前版本：${currentVersion} 条政策\n` +
        `最新版本：${latestVersion} 条政策\n` +
        `变化：${latestVersion > currentVersion ? '+' : ''}${latestVersion - currentVersion} 条\n\n` +
        '是否立即更新？（页面将刷新）'
      )

      if (shouldUpdate) {
        saveLastUpdateCheck()
        // 清除缓存并强制刷新
        window.location.reload(true)
      }
    }
  } catch (error) {
    console.error('Update check failed:', error)

    let errorMsg = '⚠ 检查更新时出错\n\n'

    // 区分错误类型
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMsg += '网络连接失败，请检查网络连接。'
    } else if (error instanceof SyntaxError) {
      errorMsg += '数据格式错误，可能是文件损坏。'
    } else {
      errorMsg += '未知错误，请稍后重试或联系管理员。'
    }

    alert(errorMsg)
  }
}

// 检测屏幕宽度，控制侧边栏显示
function handleResize() {
  showLeftSidebar.value = window.innerWidth >= 1400
}

onMounted(() => {
  demoMode.value = new URLSearchParams(window.location.search).get('demo') === '1'

  const savedProfile = loadProfile()
  if (savedProfile) {
    console.log('发现历史画像数据')
  }

  // 监听浏览器后退/前进
  window.addEventListener('popstate', handlePopState)

  // 初始化：替换当前历史状态
  history.replaceState({ view: 'form' }, '', '#form')

  // 检测屏幕宽度，控制侧边栏显示
  handleResize()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('popstate', handlePopState)
  window.removeEventListener('resize', handleResize)
})

async function onProfileSubmitted(p, results) {
  profile.value = p
  matchedPolicies.value = results

  // 询问用户是否使用 AI 问诊
  showConsultantPrompt.value = true
}

function startConsultant() {
  showConsultantPrompt.value = false
  pushView('consultant')
}

function skipConsultant() {
  showConsultantPrompt.value = false
  pushView('list')
  saveProfile(profile.value)
}

function onConsultantComplete(enrichedProfile) {
  profile.value = enrichedProfile
  saveProfile(enrichedProfile)

  pushView('radar')
}

async function onRadarNext() {
  console.log('=== onRadarNext 调试信息 ===')
  console.log('profile:', profile.value)
  console.log('policiesData:', policiesData)

  try {
    const matched = await matchPolicies(profile.value)
    console.log('Matched policies:', matched)
    console.log('Matched count:', matched.length)
    matchedPolicies.value = matched

    console.log('切换视图到 list')
    pushView('list')
    console.log('当前 view:', view.value)
    console.log('matchedPolicies.value:', matchedPolicies.value)
  } catch (error) {
    console.error('匹配失败:', error)
  }
}

function onConsultantSkip() {
  pushView('list')
  saveProfile(profile.value)
}

function onPolicyClick(policy) {
  selectedPolicy.value = policy
  pushView('detail', { policy })
}

function onBackToList() {
  history.back()
}

function onReset() {
  view.value = 'form'
  profile.value = null
  matchedPolicies.value = []
  selectedPolicy.value = null
  showConsultantPrompt.value = false
  // 重置历史
  history.replaceState({ view: 'form' }, '', '#form')
}
</script>

<template>
  <div class="app">
    <UpdateNotice />

    <!-- AI 问诊提示模态框 -->
    <div v-if="showConsultantPrompt" class="modal-overlay" @click="skipConsultant">
      <div class="modal-content" @click.stop>
        <h3>🤖 AI 智能问诊</h3>
        <p>是否使用 AI 智能问诊，帮助您构建更精准的企业画像？</p>
        <p class="modal-hint">通过 3-5 轮对话深入了解企业特征，提升政策匹配精准度</p>
        <div class="modal-actions">
          <button class="btn btn-primary" @click="startConsultant">开始问诊</button>
          <button class="btn btn-secondary" @click="skipConsultant">跳过</button>
        </div>
      </div>
    </div>

    <header class="app-header">
      <div class="header-inner">
        <div class="brand">
          <span class="logo">天河政策通</span>
          <span class="logo-sub">AI政策申报助手</span>
        </div>
        <div class="header-actions">
          <button class="btn btn-update-header" @click="checkForUpdates" title="检查政策数据更新">
            🔄 检查更新
          </button>
          <span v-if="demoMode" class="demo-badge">演示模式</span>
          <button v-if="view !== 'form'" class="btn btn-ghost" @click="onReset">重新匹配</button>
        </div>
      </div>
    </header>

    <div class="app-container">
      <!-- 左侧：新闻展示区 -->
      <aside v-if="showLeftSidebar" class="app-left-sidebar">
        <div class="sidebar-card news-section">
          <h3>📰 天河政策动态</h3>
          <div class="news-list">
            <a
              v-for="news in policyNews"
              :key="news.id"
              :href="news.url"
              target="_blank"
              class="news-item-card"
            >
              <img
                :src="news.thumbnail"
                :alt="news.title"
                class="news-thumbnail"
                loading="lazy"
              />
              <div class="news-content">
                <span class="news-date">{{ news.date }}</span>
                <h4 class="news-title">{{ news.title }}</h4>
                <p class="news-summary">{{ news.summary }}</p>
              </div>
            </a>
          </div>
        </div>
      </aside>

      <!-- 中间：主要内容区 -->
      <main class="app-main">
        <ProfileForm v-if="view === 'form'" :demo="demoMode" @submitted="onProfileSubmitted" />

        <AIConsultant
          v-else-if="view === 'consultant'"
          :initial-profile="profile"
          @complete="onConsultantComplete"
          @skip="onConsultantSkip"
        />

        <div v-else-if="view === 'radar'" class="radar-view">
          <h2>您的企业画像</h2>
          <ProfileRadarChart :profile="profile" />
          <p class="radar-hint">基于您提供的信息，我们已生成多维企业画像</p>
          <button class="btn-next" @click="onRadarNext">查看匹配结果</button>
          <p style="margin-top: 10px; font-size: 12px; color: #999;">当前视图: {{ view }}</p>
        </div>

        <PolicyList
          v-else-if="view === 'list'"
          :profile="profile"
          :policies="matchedPolicies"
          :demo="demoMode"
          @select="onPolicyClick"
          @back="onReset"
        />

        <div v-else-if="view === 'detail'">
          <PolicyDetail
            :policy="selectedPolicy"
            :profile="profile"
            :demo="demoMode"
            @back="onBackToList"
          />
        </div>

        <div v-else style="padding: 40px; text-align: center;">
          <p>未知视图状态: {{ view }}</p>
          <p>Profile: {{ profile ? 'exists' : 'null' }}</p>
          <p>Policies: {{ matchedPolicies ? matchedPolicies.length : 'null' }}</p>
          <button @click="onReset">返回首页</button>
        </div>
      </main>

      <!-- 右侧：申报日历 -->
      <aside v-if="showLeftSidebar" class="app-right-spacer">
        <div class="deadline-calendar">
          <h3>📅 申报截止提醒</h3>

          <div v-if="upcomingDeadlines.length === 0" class="deadline-empty">
            <p>✅ 当前没有紧急申报窗口</p>
            <p>建议定期检查政策更新</p>
          </div>

          <div
            v-else
            v-for="item in upcomingDeadlines"
            :key="item.id"
            :class="['deadline-item', item.urgency]"
            @click="onPolicyClick(item)"
          >
            <div class="deadline-title">
              {{ getUrgencyIcon(item.urgency) }} {{ item.title }}
            </div>
            <div class="deadline-date">
              {{ item.window.end }} 截止
            </div>
            <div class="deadline-countdown">
              ⏰ 还剩 {{ item.daysLeft }} 天
            </div>
          </div>
        </div>
      </aside>
    </div>

    <footer class="app-footer">
      <p>天河区AI大赛 · AI应用创新数智天河 · 数据来源：天河区人民政府公开政策</p>
    </footer>
  </div>
</template>

<style>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  max-width: 480px;
  width: 90%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-content h3 {
  margin: 0 0 16px 0;
  font-size: 20px;
  color: #1f2937;
}

.modal-content p {
  margin: 0 0 12px 0;
  color: #4b5563;
  line-height: 1.6;
}

.modal-hint {
  font-size: 14px;
  color: #6b7280;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.modal-actions .btn {
  flex: 1;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-secondary {
  background: #f3f4f6;
  color: #4b5563;
}

.btn-secondary:hover {
  background: #e5e7eb;
}

.radar-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 24px;
  text-align: center;
}

.radar-view h2 {
  margin-bottom: 24px;
  font-size: 24px;
  color: #1f2937;
}

.radar-hint {
  margin-top: 20px;
  margin-bottom: 24px;
  color: #6b7280;
  font-size: 15px;
}

.btn-next {
  padding: 12px 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.btn-next:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-update-header {
  padding: 8px 16px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-update-header:hover {
  background: #e5e7eb;
  border-color: #9ca3af;
}

@media (max-width: 640px) {
  .modal-content {
    padding: 24px;
  }

  .modal-actions {
    flex-direction: column;
  }

  .radar-view {
    padding: 24px 16px;
  }

  .radar-view h2 {
    font-size: 20px;
  }

  .btn-next {
    width: 100%;
  }
}
</style>
