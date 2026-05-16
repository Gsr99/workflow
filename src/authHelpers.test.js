// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest'
import { canShowFirstRun, getDbErrorMessage, getLoginErrorMessage, cacheMembersToStorage, getCachedMembers } from './authHelpers'

describe('canShowFirstRun', () => {
  it('returns false when Firestore has not finished loading', () => {
    expect(canShowFirstRun({ dbLoaded: false, members: [], dbLoadError: null })).toBe(false)
  })

  it('returns true when Firestore loaded successfully and no members exist', () => {
    expect(canShowFirstRun({ dbLoaded: true, members: [], dbLoadError: null })).toBe(true)
  })

  it('returns false when Firestore load failed even if there are no members', () => {
    expect(canShowFirstRun({ dbLoaded: true, members: [], dbLoadError: { code: 'permission-denied' } })).toBe(false)
  })
})

describe('getDbErrorMessage', () => {
  it('returns null when there is no error', () => {
    expect(getDbErrorMessage(null)).toBe(null)
  })

  it('returns permission-denied message when Firestore rules are restrictive', () => {
    const msg = getDbErrorMessage({ code: 'permission-denied' })
    expect(msg).toContain('security rules')
  })

  it('returns unavailable message when Firestore is down', () => {
    const msg = getDbErrorMessage({ code: 'unavailable' })
    expect(msg).toContain('temporarily unavailable')
  })

  it('returns generic message for unknown errors', () => {
    const msg = getDbErrorMessage({ code: 'unknown', message: 'Test error' })
    expect(msg).toContain('Database error')
  })
})

describe('getLoginErrorMessage', () => {
  it('returns data-loading message when members array is empty', () => {
    const msg = getLoginErrorMessage({ members: [], email: 'test@example.com' })
    expect(msg).toContain('team data')
    expect(msg).not.toContain('No account found')
  })

  it('returns not-found message when email is absent from populated members', () => {
    const members = [{ email: 'alice@test.com' }, { email: 'bob@test.com' }]
    const msg = getLoginErrorMessage({ members, email: 'unknown@test.com' })
    expect(msg).toContain('No account found')
  })

  it('returns null when a matching member exists', () => {
    const members = [{ email: 'alice@test.com' }]
    const msg = getLoginErrorMessage({ members, email: 'Alice@Test.com' })
    expect(msg).toBe(null)
  })
})

describe('cacheMembersToStorage / getCachedMembers', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores and retrieves members from localStorage', () => {
    const members = [
      { id: '1', email: 'alice@test.com', name: 'Alice', role: 'admin', pw: 'secret' },
      { id: '2', email: 'bob@test.com', name: 'Bob', role: 'member', pw: '123456' }
    ]
    cacheMembersToStorage(members)
    const cached = getCachedMembers()
    expect(cached).toHaveLength(2)
    expect(cached[0].email).toBe('alice@test.com')
    expect(cached[1].email).toBe('bob@test.com')
  })

  it('returns empty array when no cache exists', () => {
    expect(getCachedMembers()).toEqual([])
  })

  it('returns empty array when cache is corrupted', () => {
    localStorage.setItem('dl_members_cache', 'not-valid-json')
    expect(getCachedMembers()).toEqual([])
  })

  it('does not cache an empty members array', () => {
    const members = [{ id: '1', email: 'test@test.com', name: 'Test' }]
    cacheMembersToStorage(members)
    // Now try caching empty — should NOT overwrite
    cacheMembersToStorage([])
    const cached = getCachedMembers()
    expect(cached).toHaveLength(1)
  })
})
