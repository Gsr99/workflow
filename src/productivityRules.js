export const PRODUCTIVE_GOAL_SECS = 7 * 3600
export const BREAK_LIMIT_SECS = 1 * 3600
export const IDLE_LIMIT_SECS = 30 * 60

export const BREAK_PENALTY_XP = 10
export const IDLE_PENALTY_XP = 5

export const getProductivityAdjustment = (timeLogs = [], memberId, resetAt = 0) => {
  const resetDate = resetAt ? new Date(resetAt).toISOString().slice(0, 10) : null
  const daily = new Map()
  timeLogs
    .filter(l => {
      if (l.userId !== memberId) return false
      if (!resetAt) return true
      if (!l.date || l.date < resetDate) return false
      if (l.date > resetDate) return true
      const logTime = l.loginAt || l.logoutAt || 0
      return logTime >= resetAt
    })
    .forEach(l => {
      const key = l.date || 'unknown'
      const prev = daily.get(key) || { breakSeconds: 0, idleSeconds: 0 }
      daily.set(key, {
        breakSeconds: prev.breakSeconds + (l.breakSeconds || 0),
        idleSeconds: prev.idleSeconds + (l.idleSeconds || 0),
      })
    })

  let breakViolations = 0
  let idleViolations = 0
  daily.forEach(day => {
    if (day.breakSeconds > BREAK_LIMIT_SECS) breakViolations += 1
    if (day.idleSeconds > IDLE_LIMIT_SECS) idleViolations += 1
  })

  const penalty = breakViolations * BREAK_PENALTY_XP + idleViolations * IDLE_PENALTY_XP
  return { breakViolations, idleViolations, penalty }
}

export const applyProductivityAdjustment = (baseXP, timeLogs, memberId, resetAt = 0) =>
  Math.max(0, baseXP - getProductivityAdjustment(timeLogs, memberId, resetAt).penalty)
