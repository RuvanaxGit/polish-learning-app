import { z } from 'zod'

const emailSchema = z.email().max(254)

/**
 * Canonical form used for allowlist storage and comparison: Unicode NFC,
 * trimmed, lowercased. Returns null for anything that isn't an email address.
 */
export function normalizeEmail(raw: string): string | null {
  const candidate = raw.normalize('NFC').trim().toLowerCase()
  return emailSchema.safeParse(candidate).success ? candidate : null
}

export type ParsedAllowlist = Readonly<{ emails: readonly string[], invalidCount: number }>

export function parseAllowlistEntries(entries: readonly string[]): ParsedAllowlist {
  const emails = new Set<string>()
  let invalidCount = 0
  for (const entry of entries) {
    const email = normalizeEmail(entry)
    if (email === null) invalidCount += 1
    else emails.add(email)
  }
  return { emails: [...emails], invalidCount }
}
