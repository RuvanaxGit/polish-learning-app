// All user-facing UI strings live here so that UI localization can be added later
// without touching components (PRD section 4, AGENTS.md "Frontend").
export const en = {
  app: {
    name: 'Słówko',
    tagline: 'Polish vocabulary, looked up and remembered.',
  },
  dashboard: {
    title: 'Dashboard',
    placeholder: 'The project foundation is in place. Features will appear here as they are built.',
  },
} as const

export type UiStrings = typeof en
