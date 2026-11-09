<script setup lang="ts">
const t = useUiStrings()
</script>

<template>
  <div class="min-h-dvh flex flex-col">
    <header class="border-b border-default">
      <div class="mx-auto max-w-3xl px-4 py-3">
        <span class="font-semibold">{{ t.app.name }}</span>
      </div>
    </header>
    <main class="flex-1 mx-auto w-full max-w-3xl px-4 py-6">
      <slot />
    </main>
  </div>
</template>
