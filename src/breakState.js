const keyForUser = userId => `dl_on_break_${userId}`

export const getStoredBreakState = userId => {
  if (!userId) return false
  return localStorage.getItem(keyForUser(userId)) === 'true'
}

export const setStoredBreakState = (userId, onBreak) => {
  if (!userId) return
  localStorage.setItem(keyForUser(userId), String(Boolean(onBreak)))
}

export const clearStoredBreakState = userId => {
  if (!userId) return
  localStorage.removeItem(keyForUser(userId))
}

export const resolveInitialBreakState = ({ userId, tasks = [] }) => {
  if (!userId) return false
  return getStoredBreakState(userId)
}
