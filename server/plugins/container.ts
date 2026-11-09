export default defineNitroPlugin((nitroApp) => {
  // Build the container at startup so invalid configuration fails fast
  // instead of on the first request.
  useContainer()

  nitroApp.hooks.hook('close', async () => {
    await disposeContainer()
  })
})
