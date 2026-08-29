<script setup>
import { ref, onMounted } from 'vue'
import { askProfileQuestion } from '../lib/profileChat'

const props = defineProps({
  initialProfile: Object
})

const emit = defineEmits(['complete', 'skip'])

const messages = ref([])
const userInput = ref('')
const isThinking = ref(false)
const enrichedProfile = ref({ ...props.initialProfile })
const round = ref(0)
const MAX_ROUNDS = 5
const canFinish = ref(false)

async function initChat() {
  isThinking.value = true

  try {
    // 调用后端获取第 1 轮规则化问题
    const response = await askProfileQuestion({
      profile: enrichedProfile.value,
      history: [],
      round: 1
    })

    messages.value.push({
      role: 'assistant',
      content: `您好！我是您的政策申报专家助手。根据您的填写，您是一家${props.initialProfile.industry}企业，处于${props.initialProfile.stage}阶段。\n\n为了帮您匹配到最适合的政策，我想了解更多细节。\n\n${response.nextQuestion}`
    })

    // 第 1 轮问题已经显示，下次用户回答时应该调用 round=2
    round.value = 1
    canFinish.value = false
  } catch (error) {
    console.error('初始化问诊失败:', error)
    messages.value.push({
      role: 'assistant',
      content: '抱歉，问诊初始化遇到问题。您可以选择跳过问诊直接查看匹配结果。'
    })
  } finally {
    isThinking.value = false
  }
}

async function sendMessage() {
  if (!userInput.value.trim()) return

  const userMsg = userInput.value.trim()
  messages.value.push({ role: 'user', content: userMsg })
  userInput.value = ''
  isThinking.value = true

  try {
    // 用户刚回答了 round 轮的问题，现在请求 round+1 轮的问题
    const nextRound = round.value + 1

    const response = await askProfileQuestion({
      profile: enrichedProfile.value,
      history: messages.value,
      round: nextRound
    })

    if (response.extractedData) {
      Object.assign(enrichedProfile.value, response.extractedData)
    }

    // 如果已完成或达到最大轮次，显示完成提示
    if (nextRound >= MAX_ROUNDS || response.isComplete) {
      messages.value.push({
        role: 'assistant',
        content: '问诊已完成！我已经充分了解您的企业情况。点击右上方"完成问诊"按钮查看企业画像。'
      })
    } else {
      // 否则显示下一个问题
      messages.value.push({
        role: 'assistant',
        content: response.nextQuestion || '感谢您的回答！'
      })
    }

    round.value = nextRound
    canFinish.value = true

  } catch (error) {
    console.error('问诊错误:', error)

    let errorMessage = '抱歉，问诊遇到问题。'

    // 根据错误类型给出不同提示
    if (error.message === '问诊服务请求失败') {
      // 来自 profileChat.js，服务端返回非 200
      errorMessage += '\n\n💡 可能原因：\n• DeepSeek API 配额不足\n• 服务器暂时不可用\n• 网络连接不稳定\n\n您可以：\n✓ 点击右上角"完成问诊"结束对话\n✓ 或稍后重试'
    } else if (error.name === 'TypeError') {
      // 网络错误
      errorMessage += '\n\n💡 网络连接中断，请检查网络后重试。\n\n您也可以点击"完成问诊"查看已收集的信息。'
    } else {
      // 其他未知错误
      errorMessage += '\n\n💡 您可以点击"完成问诊"直接查看企业画像。'
    }

    messages.value.push({
      role: 'assistant',
      content: errorMessage
    })
    canFinish.value = true
  } finally {
    isThinking.value = false
  }
}

function finishConsultation() {
  emit('complete', enrichedProfile.value)
}

function skipConsultation() {
  emit('skip')
}

onMounted(() => {
  initChat()
})
</script>

<template>
  <div class="ai-consultant">
    <div class="consultant-header">
      <div class="header-left">
        <span class="ai-badge">🤖 AI 智能问诊</span>
        <span class="round-counter">{{ round }}/{{ MAX_ROUNDS }} 轮</span>
      </div>
      <div class="header-actions">
        <button v-if="canFinish" class="btn-finish" @click="finishConsultation">完成问诊</button>
        <button class="btn-skip" @click="skipConsultation">跳过问诊</button>
      </div>
    </div>

    <div class="chat-container">
      <div class="messages">
        <div
          v-for="(msg, idx) in messages"
          :key="idx"
          :class="['message', msg.role]"
        >
          <div class="message-avatar">
            {{ msg.role === 'user' ? '👤' : '🤖' }}
          </div>
          <div class="message-content">{{ msg.content }}</div>
        </div>

        <div v-if="isThinking" class="message assistant">
          <div class="message-avatar">🤖</div>
          <div class="message-content thinking">正在思考...</div>
        </div>
      </div>

      <div class="input-area">
        <input
          v-model="userInput"
          type="text"
          placeholder="输入您的回答..."
          @keyup.enter="sendMessage"
          :disabled="isThinking"
        />
        <button
          class="btn-send"
          @click="sendMessage"
          :disabled="isThinking || !userInput.trim()"
        >
          发送
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-consultant {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
}

.consultant-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.ai-badge {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
}

.round-counter {
  color: #666;
  font-size: 14px;
}

.btn-finish {
  padding: 8px 16px;
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.btn-finish:hover {
  opacity: 0.9;
}

.btn-skip {
  padding: 8px 16px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-skip:hover {
  background: #f5f5f5;
}

.chat-container {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
}

.messages {
  height: 400px;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.message-content {
  max-width: 70%;
  padding: 12px 16px;
  border-radius: 12px;
  line-height: 1.5;
  font-size: 15px;
  white-space: pre-wrap;
}

.message.assistant .message-content {
  background: #f3f4f6;
  color: #374151;
}

.message.user .message-content {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.message-content.thinking {
  font-style: italic;
  opacity: 0.7;
}

.input-area {
  display: flex;
  padding: 16px;
  border-top: 1px solid #e5e7eb;
  gap: 12px;
}

.input-area input {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 15px;
}

.input-area input:focus {
  outline: none;
  border-color: #667eea;
}

.input-area input:disabled {
  background: #f9fafb;
  cursor: not-allowed;
}

.btn-send {
  padding: 10px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-send:not(:disabled):hover {
  opacity: 0.9;
}

@media (max-width: 640px) {
  .ai-consultant {
    padding: 16px;
  }

  .consultant-header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .header-left {
    justify-content: space-between;
  }

  .header-actions {
    width: 100%;
    gap: 8px;
  }

  .btn-finish,
  .btn-skip {
    flex: 1;
  }

  .messages {
    height: 300px;
  }

  .message-content {
    max-width: 80%;
  }
}
</style>
