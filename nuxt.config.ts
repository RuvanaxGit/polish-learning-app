// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint'],

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
      stylistic: true,
    },
  },
})
