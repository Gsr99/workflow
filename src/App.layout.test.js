import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')

describe('Overview and Time Log filter layout', () => {
  it('keeps Overview and Time Log filters inline instead of in page sidebars', () => {
    expect(appSource).not.toContain('sidebarOpen')
    expect(appSource).not.toMatch(/>\s*FILTERS\s*</)
    expect(appSource).not.toMatch(/>\s*VIEW\s*</)

    expect(appSource).toContain('Inline filter bar')
    expect(appSource).toContain("value={filterAssignee}")
    expect(appSource).toContain('View toggle pills')
    expect(appSource).toContain("value={weekFilter}")
  })
})
