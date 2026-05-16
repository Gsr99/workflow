export const isAdminUser = user => user?.role === 'admin'

export const canSeeMember = (viewer, member) => {
  if (!member) return false
  return isAdminUser(viewer) || member.role !== 'admin'
}

export const visibleMembersForUser = (members = [], viewer) =>
  members.filter(member => canSeeMember(viewer, member))

export const visibleMemberIdsForUser = (members = [], viewer) =>
  new Set(visibleMembersForUser(members, viewer).map(member => member.id))
