<script setup lang="ts">
// Dashboard: the default authenticated landing page (D-18). Statistics and
// review counts arrive with their phases.
const t = useUiStrings()
const { me } = useCurrentUser()

useHead({ title: `${t.dashboard.title} · ${t.app.name}` })
</script>

<template>
  <section class="space-y-4">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold">
        {{ t.dashboard.title }}
      </h1>
      <p
        v-if="me"
        class="text-muted"
        data-testid="greeting"
      >
        {{ t.dashboard.greeting(me.user.name) }}
      </p>
    </div>
    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-sparkles"
      :description="t.dashboard.placeholder"
      data-testid="foundation-placeholder"
    />
  </section>
</template>
