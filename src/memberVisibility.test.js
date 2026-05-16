import { describe, expect, it } from 'vitest'
import { canSeeMember, visibleMembersForUser } from './memberVisibility'

const members = [
  { id: 'admin-1', name: 'Ada Admin', role: 'admin' },
  { id: 'member-1', name: 'Mina Member', role: 'member' },
  { id: 'member-2', name: 'Noah Member', role: 'member' },
]

describe('member visibility', () => {
  it('hides admins from non-admin viewers', () => {
    expect(visibleMembersForUser(members, members[1]).map(m => m.id)).toEqual(['member-1', 'member-2'])
    expect(canSeeMember(members[1], members[0])).toBe(false)
  })

  it('lets admins see everyone including themselves', () => {
    expect(visibleMembersForUser(members, members[0]).map(m => m.id)).toEqual(['admin-1', 'member-1', 'member-2'])
    expect(canSeeMember(members[0], members[0])).toBe(true)
  })
})
