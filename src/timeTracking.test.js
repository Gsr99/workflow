import { describe, expect, it } from 'vitest'
import { advanceTimeState, getActiveTimerMode, getTodayTaskTimerSeconds } from './timeTracking'

describe('timeTracking', () => {
  it('adds elapsed wall-clock seconds to the active bucket', () => {
    expect(advanceTimeState({
      state: { task: 10, break: 3, idle: 1 },
      deltaSeconds: 120,
      mode: 'task',
    })).toEqual({ task: 130, break: 3, idle: 1 })
  })

  it('moves break overflow into idle after the break limit', () => {
    expect(advanceTimeState({
      state: { task: 10, break: 3598, idle: 4 },
      deltaSeconds: 5,
      mode: 'break',
      breakLimitSeconds: 3600,
    })).toEqual({ task: 10, break: 3600, idle: 7 })
  })

  it('counts all break ticks as idle once the break limit is already reached', () => {
    expect(advanceTimeState({
      state: { task: 10, break: 3600, idle: 4 },
      deltaSeconds: 5,
      mode: 'break',
      breakLimitSeconds: 3600,
    })).toEqual({ task: 10, break: 3600, idle: 9 })
  })

  it('counts break against the remaining daily break budget across sessions', () => {
    expect(advanceTimeState({
      state: { task: 10, break: 0, idle: 4 },
      deltaSeconds: 5,
      mode: 'break',
      breakLimitSeconds: 3600,
      breakUsedSeconds: 3598,
    })).toEqual({ task: 10, break: 2, idle: 7 })
  })

  it('moves productive overflow into idle after the daily productive limit', () => {
    expect(advanceTimeState({
      state: { task: 0, break: 3, idle: 1 },
      deltaSeconds: 5,
      mode: 'task',
      productiveLimitSeconds: 3600,
      productiveUsedSeconds: 3598,
    })).toEqual({ task: 2, break: 3, idle: 4 })
  })

  it('ignores invalid or zero deltas', () => {
    const state = { task: 10, break: 3, idle: 1 }
    expect(advanceTimeState({ state, deltaSeconds: 0, mode: 'task' })).toBe(state)
    expect(advanceTimeState({ state, deltaSeconds: 10, mode: 'unknown' })).toBe(state)
  })

  it('calculates today task timer seconds using accumulated and active elapsed time', () => {
    const nowMs = Date.parse('2026-04-29T10:10:00Z')
    const today = '2026-04-29'
    const tasks = [
      { assignee: 'u1', startedDate: today, accumulatedTime: 60, timerState: 'running', lastStartedAt: nowMs - 30_000 },
      { assignee: 'u1', startedDate: today, accumulatedTime: 20, timerState: 'paused' },
      { assignee: 'u1', startedDate: '2026-04-28', accumulatedTime: 999, timerState: 'paused' },
      { assignee: 'u2', startedDate: today, accumulatedTime: 999, timerState: 'paused' },
    ]

    expect(getTodayTaskTimerSeconds({ tasks, userId: 'u1', today, nowMs })).toBe(110)
  })

  it('treats paused task time as idle unless the user is on break', () => {
    const tasks = [{ assignee: 'u1', timerState: 'paused' }]

    expect(getActiveTimerMode({ tasks, userId: 'u1', onBreak: false })).toBe('idle')
    expect(getActiveTimerMode({ tasks, userId: 'u1', onBreak: true })).toBe('break')
  })

  it('reports idle while on break after the daily break limit is reached', () => {
    const tasks = [{ assignee: 'u1', timerState: 'paused' }]

    expect(getActiveTimerMode({
      tasks,
      userId: 'u1',
      onBreak: true,
      breakSeconds: 3600,
      breakLimitSeconds: 3600,
    })).toBe('idle')
  })

  it('keeps a running task productive even if break state is stale', () => {
    const tasks = [{ assignee: 'u1', timerState: 'running' }]

    expect(getActiveTimerMode({ tasks, userId: 'u1', onBreak: true })).toBe('task')
  })
})
