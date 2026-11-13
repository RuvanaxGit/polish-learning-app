import { isValidTimeZone } from '#shared/contracts/settings'

// PRD US-02: the time zone defaults to the browser's at first sign-in. The
// server stores null until the browser reports it; this runs once per load and
// only while the stored value is still unset, so it never overrides a choice.
export default defineNuxtPlugin(() => {
  const { me } = useCurrentUser()
  const { updateSettings } = useSettingsApi()
  let reported = false

  watch(me, (current) => {
    if (reported || !current || current.settings.timezone !== null) return
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!timezone || !isValidTimeZone(timezone)) return
    reported = true
    void updateSettings({ timezone })
  }, { immediate: true })
})
