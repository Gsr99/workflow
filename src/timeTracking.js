export const advanceTimeState = ({ state, deltaSeconds, mode, breakLimitSeconds = null, breakUsedSeconds = 0, productiveLimitSeconds = null, productiveUsedSeconds = 0 }) => {
  const delta = Math.max(0, Math.floor(deltaSeconds || 0))
  if (!delta || !['task', 'break', 'idle'].includes(mode)) return state
  if (mode === 'task' && Number.isFinite(productiveLimitSeconds)) {
    const currentTask = state.task || 0
    const productiveRoom = Math.max(0, Math.floor(productiveLimitSeconds) - Math.max(0, productiveUsedSeconds || 0) - currentTask)
    const taskDelta = Math.min(delta, productiveRoom)
    const idleDelta = delta - taskDelta
    return {
      ...state,
      task: currentTask + taskDelta,
      idle: (state.idle || 0) + idleDelta,
    }
  }
  if (mode === 'break' && Number.isFinite(breakLimitSeconds)) {
    const currentBreak = state.break || 0
    const breakRoom = Math.max(0, Math.floor(breakLimitSeconds) - Math.max(0, breakUsedSeconds || 0) - currentBreak)
    const breakDelta = Math.min(delta, breakRoom)
    const idleDelta = delta - breakDelta
    return {
      ...state,
      break: currentBreak + breakDelta,
      idle: (state.idle || 0) + idleDelta,
    }
  }
  return { ...state, [mode]: (state[mode] || 0) + delta }
}

export const getTodayTaskTimerSeconds = ({ tasks = [], userId, today, nowMs = Date.now() }) =>
  tasks
    .filter(t => t.assignee === userId && t.startedDate === today && !t.archived)
    .reduce((sum, t) => {
      const activeElapsed = t.timerState === 'running'
        ? Math.max(0, Math.floor((nowMs - (t.lastStartedAt || nowMs)) / 1000))
        : 0
      return sum + (t.accumulatedTime || 0) + activeElapsed
    }, 0)

export const getActiveTimerMode = ({ tasks = [], userId, onBreak = false, breakSeconds = 0, breakLimitSeconds = null }) => {
  const hasActiveTask = tasks.some(t => t.timerState === 'running' && t.assignee === userId)
  if (hasActiveTask) return 'task'
  if (onBreak && Number.isFinite(breakLimitSeconds) && (breakSeconds || 0) >= breakLimitSeconds) return 'idle'
  return onBreak ? 'break' : 'idle'
}
