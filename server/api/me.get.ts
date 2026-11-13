import type { MeResponse } from '#shared/contracts/me'

export default defineApiHandler(async (event): Promise<MeResponse> => {
  const user = await requireUser(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const settings = await useContainer().identity.getSettings(user.userId)
  return {
    user: { id: user.userId, name: user.name, email: user.email, image: user.image },
    settings,
  }
})
