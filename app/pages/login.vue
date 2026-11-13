<script setup lang="ts">
import { NOT_INVITED_ERROR_CODE } from '#shared/contracts/auth'

definePageMeta({ layout: 'auth' })

const t = useUiStrings()
const route = useRoute()
const { signInWithGoogle } = useAuth()
const hydrated = useHydrated()

useHead({ title: `${t.login.title} · ${t.app.name}` })

const errorCode = computed(() => typeof route.query.error === 'string' ? route.query.error.toUpperCase() : null)
const pending = ref(false)
const startFailed = ref(false)

const alert = computed(() => {
  if (errorCode.value === NOT_INVITED_ERROR_CODE) {
    return { title: t.login.errors.notInvitedTitle, description: t.login.errors.notInvited }
  }
  if (errorCode.value !== null || startFailed.value) {
    return { title: t.login.errors.genericTitle, description: t.login.errors.generic }
  }
  return null
})

async function onSignIn() {
  pending.value = true
  startFailed.value = false
  try {
    // Navigates away to Google on success.
    await signInWithGoogle()
  }
  catch {
    startFailed.value = true
    pending.value = false
  }
}
</script>

<template>
  <UCard :ui="{ body: 'space-y-6 p-6 sm:p-8' }">
    <div class="space-y-2 text-center">
      <p
        class="text-3xl font-semibold tracking-tight"
        lang="pl"
      >
        {{ t.app.name }}
      </p>
      <h1 class="text-lg font-medium">
        {{ t.login.title }}
      </h1>
      <p class="text-sm text-muted">
        {{ t.login.subtitle }}
      </p>
    </div>

    <UAlert
      v-if="alert"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="alert.title"
      :description="alert.description"
      role="alert"
      data-testid="login-error"
    />

    <UButton
      block
      size="lg"
      icon="i-lucide-log-in"
      :loading="pending"
      :disabled="!hydrated"
      data-testid="sign-in-google"
      @click="onSignIn"
    >
      {{ t.login.google }}
    </UButton>

    <p class="text-center text-xs text-muted">
      {{ t.login.inviteOnly }}
    </p>
  </UCard>
</template>
