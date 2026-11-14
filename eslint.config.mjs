// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs';

// Architecture boundaries from AGENTS.md section 3, enforced with built-in rules only.
// ESLint replaces (does not merge) a rule's options when several config objects
// match a file, so each file group below gets its complete option set.

const frameworkPaths = ['h3', 'nitropack', 'nuxt', '#imports', '#app', '#shared', 'vue'].map(name => ({
  name,
  message: 'server/core must stay framework-independent (ARCHITECTURE.md section 2).',
}));
const frameworkPatterns = [
  {
    group: ['h3/*', 'nitropack/*', 'nuxt/*', '#imports/*', '#app/*', '#shared/*', 'vue/*', '@nuxt/*', '~/*', '~~/*', '@/*', '@@/*'],
    message: 'server/core must stay framework-independent. Reach shared/contracts with a relative import.',
  },
  {
    // Relative escapes from server/core into the Nitro layer or the Vue app.
    regex: '^(\\.\\./)+(app|api|middleware|utils|routes|plugins)(/|$)',
    message: 'server/core must not import from app/ or server/api|middleware|utils|routes|plugins.',
  },
];

const dbPaths = ['drizzle-orm', 'pg'].map(name => ({
  name,
  message: 'Only server/core/db and */infrastructure may import drizzle-orm or pg.',
}));
const dbPatterns = [{ group: ['drizzle-orm/*'], message: 'Only server/core/db and */infrastructure may import drizzle-orm.' }];

const openaiPaths = [{ name: 'openai', message: 'Only server/core/modules/llm/infrastructure may import the openai SDK.' }];
const openaiPatterns = [{ group: ['openai/*'], message: 'Only server/core/modules/llm/infrastructure may import the openai SDK.' }];

const crossModulePatterns = [
  {
    regex: '(^|/)modules/[^/]+/(domain|application|infrastructure)(/|$)',
    message: 'Import another module only through its index.ts.',
  },
];
// From inside server/core/modules/<a>/<layer>/..., a path like ../../<b>/domain reaches into another module.
const insideModulePatterns = [
  {
    regex: '^(\\.\\./){2,}[\\w-]+/(domain|application|infrastructure)(/|$)',
    message: 'Import another module only through its index.ts.',
  },
];

/**
 * @param {{ framework?: boolean, db?: boolean, openai?: boolean, insideModule?: boolean }} restrict
 * @returns {import('eslint').Linter.RuleEntry}
 */
function restrictedImports(restrict) {
  return ['error', {
    paths: [
      ...(restrict.framework ? frameworkPaths : []),
      ...(restrict.db ? dbPaths : []),
      ...(restrict.openai ? openaiPaths : []),
    ],
    patterns: [
      ...(restrict.framework ? frameworkPatterns : []),
      ...(restrict.db ? dbPatterns : []),
      ...(restrict.openai ? openaiPatterns : []),
      ...crossModulePatterns,
      ...(restrict.insideModule ? insideModulePatterns : []),
    ],
  }];
}

const noDefaultExport = {
  selector: 'ExportDefaultDeclaration',
  message: 'Use named exports (AGENTS.md section 3).',
};
const noWallClock = [
  { selector: 'NewExpression[callee.name=\'Date\'][arguments.length=0]', message: 'Use the injected Clock port.' },
  { selector: 'CallExpression[callee.object.name=\'Date\'][callee.property.name=\'now\']', message: 'Use the injected Clock port.' },
];

const testFiles = ['**/*.test.ts', '**/*.spec.ts', 'tests/**'];

export default withNuxt(
  {
    ignores: ['drizzle/**', 'playwright-report/**', 'test-results/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': true, 'ts-nocheck': true, 'ts-expect-error': true }],
      'vue/no-v-html': 'error',
      'vue/block-order': ['error', { order: ['template', 'script', 'style'] }],
      'no-restricted-imports': restrictedImports({ db: true, openai: true }),
    },
  },
  {
    files: ['server/core/**/*.ts', 'shared/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', noDefaultExport],
    },
  },
  {
    files: ['server/core/modules/*/domain/**/*.ts', 'server/core/modules/*/application/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', noDefaultExport, ...noWallClock],
    },
  },
  {
    files: ['server/core/**/*.ts'],
    rules: { 'no-restricted-imports': restrictedImports({ framework: true, db: true, openai: true }) },
  },
  {
    files: ['server/core/modules/**/*.ts'],
    rules: { 'no-restricted-imports': restrictedImports({ framework: true, db: true, openai: true, insideModule: true }) },
  },
  {
    files: ['server/core/db/**/*.ts'],
    rules: { 'no-restricted-imports': restrictedImports({ framework: true, openai: true }) },
  },
  {
    files: ['server/core/modules/*/infrastructure/**/*.ts'],
    rules: { 'no-restricted-imports': restrictedImports({ framework: true, openai: true, insideModule: true }) },
  },
  {
    files: ['server/core/modules/llm/infrastructure/**/*.ts'],
    rules: { 'no-restricted-imports': restrictedImports({ framework: true, insideModule: true }) },
  },
  {
    // Integration/E2E tests and tooling may talk to the database directly
    // (migrations, fixtures). Colocated unit tests keep their folder's rules.
    files: ['tests/**', 'drizzle.config.ts', 'vitest.config.ts', 'playwright.config.ts'],
    rules: { 'no-restricted-imports': restrictedImports({ openai: true }) },
  },
  {
    files: testFiles,
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': true, 'ts-nocheck': true, 'ts-expect-error': 'allow-with-description' }],
    },
  },
);
