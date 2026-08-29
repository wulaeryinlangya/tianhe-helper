<script setup>
import { ref, onMounted } from 'vue'
import { getLastUpdateCheck, saveLastUpdateCheck } from '../lib/storage'

const lastUpdate = ref(null)
const daysSinceUpdate = ref(0)
const show = ref(false)
const isUpdating = ref(false)
const updateMessage = ref('')

onMounted(() => {
  checkUpdateStatus()
})

function checkUpdateStatus() {
  // 尝试从 localStorage 获取上次检查时间
  const lastCheck = getLastUpdateCheck()

  if (lastCheck) {
    lastUpdate.value = lastCheck
  } else {
    // 如果没有记录，使用固定日期（项目最后更新时间）
    lastUpdate.value = new Date('2026-08-25')
  }

  const now = new Date()
  daysSinceUpdate.value = Math.floor((now - lastUpdate.value) / (1000 * 60 * 60 * 24))

  // 3 天以上显示提醒（测试用，正式环境建议改回 7）
  show.value = daysSinceUpdate.value >= 3
}

async function handleUpdate() {
  isUpdating.value = true
  updateMessage.value = '正在检查更新...'

  try {
    // 方案1：如果部署在 Vercel/GitHub Pages，尝试重新加载页面
    // 方案2：调用后端 API 触发数据更新
    // 方案3：提示用户访问 GitHub 查看最新版本

    // 模拟检查过程
    await new Promise(resolve => setTimeout(resolve, 1500))

    // 检查是否有新的 policies.json（通过比对 ETag 或时间戳）
    const response = await fetch('/data/policies.json?' + Date.now(), {
      method: 'HEAD'
    })

    if (response.ok) {
      // 更新本地记录
      saveLastUpdateCheck()
      updateMessage.value = '✓ 数据已是最新！'

      setTimeout(() => {
        show.value = false
        updateMessage.value = ''
        // 建议刷新页面以加载最新数据
        if (confirm('数据已更新，是否刷新页面以加载最新政策？')) {
          window.location.reload()
        }
      }, 2000)
    } else {
      updateMessage.value = '⚠ 无法连接到服务器'
      setTimeout(() => {
        updateMessage.value = ''
      }, 3000)
    }
  } catch (error) {
    console.error('Update check failed:', error)
    updateMessage.value = '⚠ 检查失败，请稍后重试'
    setTimeout(() => {
      updateMessage.value = ''
    }, 3000)
  } finally {
    isUpdating.value = false
  }
}

function dismiss() {
  show.value = false
}
</script>

<template>
  <div v-if="show" class="update-notice">
    <span class="notice-icon">{{ updateMessage ? '🔄' : '⚠️' }}</span>
    <span class="notice-text">
      {{ updateMessage || `距上次更新已 ${daysSinceUpdate} 天，建议更新政策数据` }}
    </span>
    <button
      class="btn-update"
      @click="handleUpdate"
      :disabled="isUpdating"
    >
      {{ isUpdating ? '检查中...' : '立即更新' }}
    </button>
    <button class="btn-close" @click="dismiss" :disabled="isUpdating">×</button>
  </div>
</template>

<style scoped>
.update-notice {
  position: fixed;
  top: 70px;
  right: 20px;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  z-index: 1000;
  max-width: 400px;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.notice-icon {
  font-size: 20px;
}

.notice-text {
  flex: 1;
  font-size: 14px;
  color: #856404;
}

.btn-update {
  padding: 6px 12px;
  background: #ffc107;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  transition: background 0.2s;
}

.btn-update:hover:not(:disabled) {
  background: #e0a800;
}

.btn-update:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-close {
  padding: 0;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 20px;
  color: #856404;
  line-height: 1;
}

.btn-close:hover {
  opacity: 0.7;
}

@media (max-width: 640px) {
  .update-notice {
    top: 60px;
    right: 10px;
    left: 10px;
    max-width: none;
    flex-wrap: wrap;
  }

  .notice-text {
    flex-basis: 100%;
    margin-bottom: 8px;
  }

  .btn-update {
    flex: 1;
  }
}
</style>
