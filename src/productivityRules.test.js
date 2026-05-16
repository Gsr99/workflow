import { describe, expect, it } from 'vitest'
import {
  BREAK_LIMIT_SECS,
  BREAK_PENALTY_XP,
  IDLE_LIMIT_SECS,
  IDLE_PENALTY_XP,
  PRODUCTIVE_GOAL_SECS,
  getProductivityAdjustment,
} from './productivityRules'

describe('productivity rules', () => {
  it('uses a 7h productive goal, 1h break limit, and 30m idle limit', () => {
    expect(PRODUCTIVE_GOAL_SECS).toBe(7 * 3600)
    expect(BREAK_LIMIT_SECS).toBe(3600)
    expect(IDLE_LIMIT_SECS).toBe(30 * 60)
  })

  it('subtracts XP for days over break or idle limits', () => {
    const adjustment = getProductivityAdjustment([
      { userId: 'u1', date: '2026-04-28', breakSeconds: BREAK_LIMIT_SECS + 1, idleSeconds: IDLE_LIMIT_SECS + 1 },
      { userId: 'u1', date: '2026-04-29', breakSeconds: 0, idleSeconds: IDLE_LIMIT_SECS + 5 },
      { userId: 'u2', date: '2026-04-28', breakSeconds: BREAK_LIMIT_SECS + 1, idleSeconds: IDLE_LIMIT_SECS + 1 },
    ], 'u1')

    expect(adjustment.breakViolations).toBe(1)
    expect(adjustment.idleViolations).toBe(2)
    expect(adjustment.penalty).toBe(BREAK_PENALTY_XP + IDLE_PENALTY_XP * 2)
  })

  it('ignores focus penalties from before an awards reset timestamp', () => {
    const resetAt = new Date('2026-04-29T10:00:00Z').getTime()
    const adjustment = getProductivityAdjustment([
      { userId: 'u1', date: '2026-04-28', loginAt: resetAt - 86400000, breakSeconds: BREAK_LIMIT_SECS + 1, idleSeconds: 0 },
      { userId: 'u1', date: '2026-04-29', loginAt: resetAt - 1000, breakSeconds: BREAK_LIMIT_SECS + 1, idleSeconds: IDLE_LIMIT_SECS + 1 },
      { userId: 'u1', date: '2026-04-29', loginAt: resetAt + 1000, breakSeconds: 0, idleSeconds: IDLE_LIMIT_SECS + 1 },
    ], 'u1', resetAt)

    expect(adjustment.breakViolations).toBe(0)
    expect(adjustment.idleViolations).toBe(1)
    expect(adjustment.penalty).toBe(IDLE_PENALTY_XP)
  })
})
