// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { clearStoredBreakState, getStoredBreakState, resolveInitialBreakState, setStoredBreakState } from './breakState'

describe('break state persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores break state per user', () => {
    setStoredBreakState('u1', true)

    expect(getStoredBreakState('u1')).toBe(true)
    expect(getStoredBreakState('u2')).toBe(false)
  })

  it('clears stored break state for a user', () => {
    setStoredBreakState('u1', true)
    clearStoredBreakState('u1')

    expect(getStoredBreakState('u1')).toBe(false)
  })

  it('restores break state only from explicit storage', () => {
    expect(resolveInitialBreakState({ userId: 'u1', tasks: [] })).toBe(false)

    setStoredBreakState('u1', true)
    expect(resolveInitialBreakState({ userId: 'u1', tasks: [] })).toBe(true)

    clearStoredBreakState('u1')
    expect(resolveInitialBreakState({
      userId: 'u1',
      tasks: [{ assignee: 'u1', pausedByBreak: true }]
    })).toBe(false)
  })
})
