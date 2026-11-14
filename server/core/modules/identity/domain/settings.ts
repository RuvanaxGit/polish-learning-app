import { DEFAULT_TIMEZONE } from '../../../../../shared/contracts/settings';
import type { Settings, UpdateSettingsRequest } from '../../../../../shared/contracts/settings';

export type UserSettings = Readonly<{
  userId: string;
  uiLocale: 'en';
  translationLanguage: 'ru' | 'en' | 'uk';
  timezone: string | null;
  dailyNewLimit: number;
  desiredRetention: number;
}>;

export type SettingsChanges = UpdateSettingsRequest;

export function toSettingsView(settings: UserSettings): Settings {
  return {
    uiLocale: settings.uiLocale,
    translationLanguage: settings.translationLanguage,
    timezone: settings.timezone,
    effectiveTimezone: settings.timezone ?? DEFAULT_TIMEZONE,
    dailyNewLimit: settings.dailyNewLimit,
    desiredRetention: settings.desiredRetention,
  };
}
