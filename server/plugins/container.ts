export default defineNitroPlugin((nitroApp) => {
  // Build the container at startup so invalid configuration fails fast
  // instead of on the first request.
  const { config, identity } = useContainer()

  // Insert-only seeding of the allowlist (ARCHITECTURE.md section 8.4). Counts
  // are logged, never the addresses (AGENTS.md security rule 5).
  identity.seedAllowlist(config.allowedEmails)
    .then(({ added, invalidCount }) => {
      if (added > 0 || invalidCount > 0) {
        console.info(`[identity] allowlist seeded: ${added} added, ${invalidCount} invalid entries ignored`)
      }
    })
    .catch((error: unknown) => {
      console.error(`[identity] allowlist seeding failed: ${error instanceof Error ? error.name : 'unknown error'}`)
    })

  nitroApp.hooks.hook('close', async () => {
    await disposeContainer()
  })
})
