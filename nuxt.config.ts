import { fileURLToPath } from 'node:url';

// Forward slashes: Windows backslashes end up as escape sequences in generated imports.
const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url)).replaceAll('\\', '/');

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint'],

  // Build used only by Playwright: `nuxt build --envName e2e`. It is the only
  // build that contains the test-session route, and it writes to its own output
  // directory so it can never be mistaken for the production build (.output).
  $env: {
    e2e: {
      nitro: {
        output: { dir: fromRoot('./.output-e2e') },
        handlers: [
          {
            route: '/api/__e2e__/session',
            method: 'post',
            handler: fromRoot('./server/testing/e2e-session.ts'),
          },
        ],
      },
    },
  },

  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },

  css: ['~/assets/css/main.css'],

  // Application config is parsed from process.env by server/core/config.ts (Zod),
  // not through runtimeConfig, so server/core stays independent of Nuxt.
  // Nothing secret may ever be added to runtimeConfig.public.

  compatibilityDate: '2026-11-01',

  typescript: {
    strict: true,
  },

  telemetry: false,

  eslint: {
    config: {
      stylistic: {
        semi: true,
      },
    },
  },
});
