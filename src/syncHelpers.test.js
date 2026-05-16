import { describe, expect, it, vi } from 'vitest'
import { createSaveScheduler } from './syncHelpers'

describe('createSaveScheduler', () => {
  it('schedules a task and sets pending to true', () => {
    vi.useFakeTimers()
    const s = createSaveScheduler()
    const fn = vi.fn()
    s.schedule('tasks', fn, 800)
    expect(s.hasPending('tasks')).toBe(true)
    vi.advanceTimersByTime(800)
    expect(fn).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
