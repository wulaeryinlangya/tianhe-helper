const STORAGE_KEY_PROFILE = 'tianhe_user_profile'
const STORAGE_KEY_LAST_UPDATE = 'tianhe_last_update_check'

export function saveProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(profile))
  } catch (e) {
    console.warn('无法保存用户画像', e)
  }
}

export function loadProfile() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_PROFILE)
    return data ? JSON.parse(data) : null
  } catch (e) {
    return null
  }
}

export function clearProfile() {
  localStorage.removeItem(STORAGE_KEY_PROFILE)
}

export function saveLastUpdateCheck() {
  localStorage.setItem(STORAGE_KEY_LAST_UPDATE, new Date().toISOString())
}

export function getLastUpdateCheck() {
  const timestamp = localStorage.getItem(STORAGE_KEY_LAST_UPDATE)
  return timestamp ? new Date(timestamp) : null
}
