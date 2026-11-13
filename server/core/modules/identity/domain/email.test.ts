import { describe, expect, it } from 'vitest'
import { normalizeEmail, parseAllowlistEntries } from './email'

describe('normalizeEmail', () => {
  it.each([
    ['alice@example.com', 'alice@example.com'],
    ['  Alice@Example.COM ', 'alice@example.com'],
    ['ANNA.NOWAK@EXAMPLE.PL', 'anna.nowak@example.pl'],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected)
  })

  it.each(['', '   ', 'not-an-email', 'a@', '@example.com', `${'a'.repeat(250)}@example.com`])('rejects %j', (input) => {
    expect(normalizeEmail(input)).toBeNull()
  })
})

describe('parseAllowlistEntries', () => {
  it('deduplicates after normalization and counts invalid entries', () => {
    expect(parseAllowlistEntries(['a@example.com', 'A@EXAMPLE.COM', 'nope', 'b@example.com'])).toEqual({
      emails: ['a@example.com', 'b@example.com'],
      invalidCount: 1,
    })
  })
})
