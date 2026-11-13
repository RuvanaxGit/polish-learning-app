<script setup lang="ts">
import { z } from 'zod'
import {
  DEFAULT_TIMEZONE,
  dailyNewLimitSchema,
  desiredRetentionSchema,
  timezoneSchema,
  translationLanguageSchema,
  translationLanguages,
  uiLocaleSchema,
  uiLocales,
} from '#shared/contracts/settings'
import type { UpdateSettingsRequest } from '#shared/contracts/settings'

const t = useUiStrings()
const toast = useToast()
const { me } = useCurrentUser()
const { updateSettings } = useSettingsApi()
const hydrated = useHydrated()

useHead({ title: `${t.settings.title} · ${t.app.name}` })

// Same rules as the API (shared contract), so invalid values never leave the browser.
const formSchema = z.object({
  translationLanguage: translationLanguageSchema,
  uiLocale: uiLocaleSchema,
  dailyNewLimit: dailyNewLimitSchema,
  desiredRetention: desiredRetentionSchema,
  timezone: timezoneSchema.nullable(),
})
type FormState = z.infer<typeof formSchema>

function stateFromSettings(): FormState {
  const settings = me.value?.settings
  return {
    translationLanguage: settings?.translationLanguage ?? 'ru',
    uiLocale: settings?.uiLocale ?? 'en',
    dailyNewLimit: settings?.dailyNewLimit ?? 20,
    desiredRetention: settings?.desiredRetention ?? 0.9,
    timezone: settings?.timezone ?? null,
  }
}

const state = reactive<FormState>(stateFromSettings())
const saving = ref(false)

// The browser may report its time zone after this page has rendered.
watch(() => me.value?.settings.timezone, (timezone) => {
  if (state.timezone === null && timezone) state.timezone = timezone
})

const languageItems = translationLanguages.map(value => ({ value, label: t.languages[value] }))
const uiLocaleItems = uiLocales.map(value => ({ value, label: t.uiLocales[value] }))
// USelectMenu models "no value" as undefined; the contract uses null.
const timezoneModel = computed({
  get: () => state.timezone ?? undefined,
  set: (value: string | undefined) => {
    state.timezone = value ?? null
  },
})
const timezoneItems = computed(() => {
  const zones = Intl.supportedValuesOf('timeZone')
  return state.timezone && !zones.includes(state.timezone) ? [state.timezone, ...zones] : zones
})

function changedFields(): UpdateSettingsRequest {
  const current = me.value?.settings
  if (!current) return {}
  const changes: UpdateSettingsRequest = {}
  if (state.translationLanguage !== current.translationLanguage) changes.translationLanguage = state.translationLanguage
  if (state.uiLocale !== current.uiLocale) changes.uiLocale = state.uiLocale
  if (state.dailyNewLimit !== current.dailyNewLimit) changes.dailyNewLimit = state.dailyNewLimit
  if (state.desiredRetention !== current.desiredRetention) changes.desiredRetention = state.desiredRetention
  if (state.timezone !== null && state.timezone !== current.timezone) changes.timezone = state.timezone
  return changes
}

async function onSubmit() {
  const changes = changedFields()
  if (Object.keys(changes).length === 0) {
    toast.add({ title: t.settings.noChanges, color: 'neutral' })
    return
  }
  saving.value = true
  try {
    const result = await updateSettings(changes)
    if (result.ok) {
      Object.assign(state, stateFromSettings())
      toast.add({ title: t.settings.saved, color: 'success', icon: 'i-lucide-check' })
    }
    else {
      toast.add({ title: t.settings.saveFailed, description: result.error?.message ?? t.errors.generic, color: 'error' })
    }
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold">
        {{ t.settings.title }}
      </h1>
      <p class="text-muted">
        {{ t.settings.subtitle }}
      </p>
    </div>

    <UForm
      :schema="formSchema"
      :state="state"
      class="space-y-6"
      data-testid="settings-form"
      @submit="onSubmit"
    >
      <UCard :ui="{ body: 'space-y-5' }">
        <template #header>
          <h2 class="font-medium">
            {{ t.settings.language.heading }}
          </h2>
        </template>

        <UFormField
          name="translationLanguage"
          :label="t.settings.language.translation"
          :help="t.settings.language.translationHelp"
        >
          <USelect
            v-model="state.translationLanguage"
            :items="languageItems"
            class="w-full sm:w-64"
            data-testid="translation-language"
          />
        </UFormField>
        <UAlert
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          :description="t.settings.language.translationNote"
          data-testid="translation-language-note"
        />

        <UFormField
          name="uiLocale"
          :label="t.settings.language.uiLocale"
          :help="t.settings.language.uiLocaleHelp"
        >
          <USelect
            v-model="state.uiLocale"
            :items="uiLocaleItems"
            class="w-full sm:w-64"
          />
        </UFormField>
      </UCard>

      <UCard :ui="{ body: 'space-y-5' }">
        <template #header>
          <h2 class="font-medium">
            {{ t.settings.review.heading }}
          </h2>
        </template>

        <UFormField
          name="dailyNewLimit"
          :label="t.settings.review.dailyNewLimit"
          :help="t.settings.review.dailyNewLimitHelp"
        >
          <UInputNumber
            v-model="state.dailyNewLimit"
            :step="1"
            class="w-full sm:w-40"
            data-testid="daily-new-limit"
          />
        </UFormField>

        <UFormField
          name="desiredRetention"
          :label="t.settings.review.desiredRetention"
          :help="t.settings.review.desiredRetentionHelp"
        >
          <UInputNumber
            v-model="state.desiredRetention"
            :step="0.01"
            :format-options="{ minimumFractionDigits: 2, maximumFractionDigits: 2 }"
            class="w-full sm:w-40"
            data-testid="desired-retention"
          />
        </UFormField>
      </UCard>

      <UCard :ui="{ body: 'space-y-5' }">
        <template #header>
          <h2 class="font-medium">
            {{ t.settings.time.heading }}
          </h2>
        </template>

        <UFormField
          name="timezone"
          :label="t.settings.time.timezone"
          :help="state.timezone === null ? t.settings.time.timezoneNotSet(DEFAULT_TIMEZONE) : t.settings.time.timezoneHelp"
        >
          <USelectMenu
            v-model="timezoneModel"
            :items="timezoneItems"
            :placeholder="DEFAULT_TIMEZONE"
            :search-input="{ placeholder: t.settings.time.timezonePlaceholder }"
            class="w-full sm:w-80"
            data-testid="timezone"
          />
        </UFormField>
      </UCard>

      <div class="flex justify-end">
        <UButton
          type="submit"
          icon="i-lucide-save"
          :loading="saving"
          :disabled="!hydrated"
          class="w-full justify-center sm:w-auto"
          data-testid="save-settings"
        >
          {{ t.settings.save }}
        </UButton>
      </div>
    </UForm>
  </section>
</template>
