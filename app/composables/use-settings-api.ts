import { apiErrorSchema } from '#shared/contracts/errors'
import type { ApiError } from '#shared/contracts/errors'
import { settingsSchema } from '#shared/contracts/settings'
import type { Settings, UpdateSettingsRequest } from '#shared/contracts/settings'

export type UpdateSettingsResult
  = | Readonly<{ ok: true, settings: Settings }>
    | Readonly<{ ok: false, error: ApiError['error'] | null }>

export function useSettingsApi() {
  const { setSettings } = useCurrentUser()

  async function updateSettings(changes: UpdateSettingsRequest): Promise<UpdateSettingsResult> {
    try {
      const settings = settingsSchema.parse(await $fetch('/api/settings', { method: 'PATCH', body: changes }))
      setSettings(settings)
      return { ok: true, settings }
    }
    catch (error) {
      const details = fetchErrorDetails(error)
      const parsed = details ? apiErrorSchema.safeParse(details.data) : null
      return { ok: false, error: parsed?.success ? parsed.data.error : null }
    }
  }

  return { updateSettings }
}
