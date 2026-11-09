import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { createDatabaseClient } from '../../server/core/db/client'
import { createDatabaseHealthCheck } from '../../server/core/db/health'
import { requireTestDatabaseUrl } from '../support/test-database'

const client = createDatabaseClient({ url: requireTestDatabaseUrl(), poolMax: 2 })

afterAll(async () => {
  await client.close()
})

describe('database', () => {
  it('reports the database as up when it is reachable', async () => {
    const check = createDatabaseHealthCheck(client.db)
    await expect(check()).resolves.toEqual({ database: 'up' })
  })

  it('reports the database as down without throwing when it is unreachable', async () => {
    const url = new URL(requireTestDatabaseUrl())
    url.port = '1' // nothing listens here
    const unreachable = createDatabaseClient({ url: url.toString(), poolMax: 1 })
    try {
      const check = createDatabaseHealthCheck(unreachable.db)
      await expect(check()).resolves.toEqual({ database: 'down' })
    }
    finally {
      await unreachable.close()
    }
  })

  // The schema design relies on PostgreSQL 18 (built-in uuidv7(), ARCHITECTURE.md section 7).
  it('runs PostgreSQL 18 with built-in uuidv7()', async () => {
    const result = await client.db.execute<{ major: string, id: string }>(
      sql`select current_setting('server_version_num')::int / 10000 as major, uuidv7()::text as id`,
    )
    const row = result.rows[0]
    expect(Number(row?.major)).toBe(18)
    expect(row?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
