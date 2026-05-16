export const canShowFirstRun = ({ dbLoaded, members, dbLoadError }) => {
  return dbLoaded && !dbLoadError && Array.isArray(members) && members.length === 0
}

export const getDbErrorMessage = (dbLoadError) => {
  if (!dbLoadError) return null
  if (dbLoadError.code === 'permission-denied') {
    return '⚠️ Unable to load team data. Check Firestore security rules or contact your admin.'
  }
  if (dbLoadError.code === 'unavailable') {
    return '⚠️ Firestore is temporarily unavailable. Please refresh the page.'
  }
  return `⚠️ Database error: ${dbLoadError.message || 'Unknown error'}`
}

export const getLoginErrorMessage = ({ members, email }) => {
  const trimmed = (email || '').trim().toLowerCase()
  if (!trimmed) return 'Please enter your email address.'
  const match = members.find(m => m.email.toLowerCase() === trimmed)
  if (match) return null // found — no error
  if (!members.length) {
    return 'Unable to verify your account — team data has not loaded yet. Please wait a moment and try again, or use Google (SSO) sign-in.'
  }
  return 'No account found for that email.'
}

const CACHE_KEY = 'dl_members_cache'

export const cacheMembersToStorage = (members) => {
  // Never overwrite a valid cache with an empty array (Firestore may have failed)
  if (!Array.isArray(members) || members.length === 0) return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(members))
  } catch (e) {
    // localStorage full or unavailable — non-critical
  }
}

export const getCachedMembers = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}
