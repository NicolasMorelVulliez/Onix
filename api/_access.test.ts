import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeEmail, OWNER } from '../shared/access.js'

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')

describe('access', () => {
  it('uses the same owner in the app, the API and firestore.rules', () => {
    expect(rules).toContain(`return '${OWNER}';`)
    expect(rules.match(/return '([\w-]{20,})';/g)).toHaveLength(1)
  })

  it('only lets the owner and added members in, and only into the owner space', () => {
    expect(rules).toMatch(/match \/users\/\{space\}\/\{table\}\/\{id\} \{\s*allow read, write: if space == ownerId\(\) && isMember\(\);/)
    expect(rules).toMatch(/match \/members\/\{email\} \{\s*allow read: if isMember\(\);\s*allow write: if isOwner\(\);/)
    // No other paths are open.
    expect(rules.match(/allow /g)).toHaveLength(3)
  })

  it('normalizes emails the way members are stored', () => {
    expect(normalizeEmail('  Nico@Gmail.com ')).toBe('nico@gmail.com')
  })
})
