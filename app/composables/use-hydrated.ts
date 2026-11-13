/**
 * False during SSR and until the component has mounted in the browser. Used to
 * keep server-rendered buttons disabled until their click handlers exist, so an
 * early click (slow network, fast user, or a test runner) is never lost.
 */
export function useHydrated() {
  const hydrated = ref(false)
  onMounted(() => {
    hydrated.value = true
  })
  return hydrated
}
