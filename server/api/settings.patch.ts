import type { Settings } from '#shared/contracts/settings'

// The use case validates the body with the shared updateSettingsRequestSchema
// and throws ValidationError (-> 400) on failure.
export default defineApiHandler(async (event): Promise<Settings> => {
  const { userId } = await requireUser(event)
  const body = await readJsonBody(event)
  return useContainer().identity.updateSettings(userId, body)
})
