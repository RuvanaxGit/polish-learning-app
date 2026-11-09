import type { AppConfig } from './config'
import { createDatabaseClient } from './db/client'
import type { Database } from './db/client'
import { createDatabaseHealthCheck } from './db/health'
import type { DatabaseHealth } from './db/health'

// Composition root (ARCHITECTURE.md section 2, principle 4). Wires adapters to
// use cases from a plain config object. Nitro builds it once per process; a
// future standalone backend would build the same container.
export type Container = Readonly<{
  config: AppConfig
  db: Database
  checkDatabaseHealth: () => Promise<DatabaseHealth>
  dispose: () => Promise<void>
}>

export function createContainer(config: AppConfig): Container {
  const database = createDatabaseClient(config.database)

  return {
    config,
    db: database.db,
    checkDatabaseHealth: createDatabaseHealthCheck(database.db),
    dispose: database.close,
  }
}
