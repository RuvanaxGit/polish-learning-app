// All user-facing UI strings live here so that UI localization can be added later
// without touching components (PRD section 4, AGENTS.md "Frontend").
export const en = {
  app: {
    name: 'Słówko',
    tagline: 'Polish vocabulary, looked up and remembered.',
  },
  nav: {
    label: 'Main navigation',
    dashboard: 'Dashboard',
    settings: 'Settings',
    signOut: 'Sign out',
    account: 'Account',
  },
  login: {
    title: 'Sign in',
    subtitle: 'Look up Polish words, save them, and review them with spaced repetition.',
    google: 'Continue with Google',
    inviteOnly: 'Słówko is invite-only. Sign in with the Google account that was invited.',
    errors: {
      notInvitedTitle: 'This account is not invited',
      notInvited: 'Sign-in worked, but this Google account is not on the invite list. Ask the operator to invite it, or try another account.',
      genericTitle: 'Sign-in failed',
      generic: 'Something went wrong while signing in. Please try again.',
    },
  },
  dashboard: {
    title: 'Dashboard',
    greeting: (name: string) => `Welcome, ${name}`,
    placeholder: 'Your review progress and statistics will appear here as features are built.',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Your language and review preferences.',
    language: {
      heading: 'Language',
      translation: 'Translation language',
      translationHelp: 'Lookups, details, and new saves use this language.',
      translationNote: 'Changing it does not change words you have already saved: they keep their translation and review progress.',
      uiLocale: 'Interface language',
      uiLocaleHelp: 'More interface languages may come later.',
    },
    review: {
      heading: 'Review',
      dailyNewLimit: 'New cards per day',
      dailyNewLimitHelp: 'Between 0 and 200.',
      desiredRetention: 'Desired retention',
      desiredRetentionHelp: 'Between 0.70 and 0.97. Higher means more frequent reviews.',
    },
    time: {
      heading: 'Time',
      timezone: 'Time zone',
      timezoneHelp: 'Used for your daily new-card limit and streaks.',
      timezoneNotSet: (fallback: string) => `Not set yet; using ${fallback}.`,
      timezonePlaceholder: 'Search time zones',
    },
    save: 'Save changes',
    saved: 'Settings saved',
    saveFailed: 'Could not save settings',
    noChanges: 'No changes to save',
  },
  languages: {
    ru: 'Russian',
    en: 'English',
    uk: 'Ukrainian',
  },
  uiLocales: {
    en: 'English',
  },
  errors: {
    generic: 'Something went wrong. Please try again.',
  },
} as const;

export type UiStrings = typeof en;
