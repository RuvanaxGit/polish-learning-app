import { en } from '~/locales/en'
import type { UiStrings } from '~/locales/en'

// Single access point for UI strings. Only English ships in the MVP; when more UI
// locales are approved, this resolves the user's ui_locale instead.
export function useUiStrings(): UiStrings {
  return en
}
