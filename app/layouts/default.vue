<template>
  <div class="min-h-dvh flex flex-col bg-default">
    <header class="sticky top-0 z-10 border-b border-default bg-default/90 backdrop-blur">
      <div class="mx-auto flex h-14 max-w-3xl items-center gap-1 px-4">
        <NuxtLink
          to="/"
          class="mr-auto rounded-md text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-primary"
          lang="pl"
        >
          {{ t.app.name }}
        </NuxtLink>
        <nav
          :aria-label="t.nav.label"
          class="flex items-center gap-1"
        >
          <UButton
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            :icon="link.icon"
            :aria-label="link.label"
            :aria-current="route.path === link.to ? 'page' : undefined"
            :variant="route.path === link.to ? 'soft' : 'ghost'"
            color="neutral"
          >
            <span class="hidden sm:inline">{{ link.label }}</span>
          </UButton>
        </nav>
        <UButton
          icon="i-lucide-log-out"
          color="neutral"
          variant="ghost"
          :aria-label="t.nav.signOut"
          :loading="signingOut"
          :disabled="!hydrated"
          data-testid="sign-out"
          @click="onSignOut"
        >
          <span class="hidden sm:inline">{{ t.nav.signOut }}</span>
        </UButton>
      </div>
    </header>
    <main class="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const t = useUiStrings();
const route = useRoute();
const { signOut } = useAuth();
const hydrated = useHydrated();

// Only pages that exist are linked; unbuilt features get no nav entry (D-20 rule).
const links = [
  { label: t.nav.dashboard, icon: 'i-lucide-layout-dashboard', to: '/' },
  { label: t.nav.settings, icon: 'i-lucide-settings', to: '/settings' },
];

const signingOut = ref(false);
async function onSignOut() {
  signingOut.value = true;
  try {
    await signOut();
  }
  finally {
    signingOut.value = false;
  }
}
</script>
