<script setup lang="ts">
// Dashboard: the default authenticated landing page (DECISIONS.md D-18).
// Placeholder until the stats/dashboard feature is implemented.
const t = useUiStrings()

useHead({ title: `${t.dashboard.title} · ${t.app.name}` })
</script>

<template>
  <section class="space-y-2">
    <h1 class="text-2xl font-semibold">
      {{ t.dashboard.title }}
    </h1>
    <p class="text-muted">
      {{ t.app.tagline }}
    </p>
    <UAlert
      color="neutral"
      variant="subtle"
      :description="t.dashboard.placeholder"
      data-testid="foundation-placeholder"
    />
  </section>
</template>
