const PUBLIC_PATHS = new Set(['/login'])

// Signed-out users go to /login; signed-in users never see it. The dashboard
// (/) is the landing page after sign-in (D-18); there is no redirect to review.
export default defineNuxtRouteMiddleware(async (to) => {
  const { me, loaded, load } = useCurrentUser()
  if (!loaded.value) await load()

  const isPublic = PUBLIC_PATHS.has(to.path)
  if (!me.value && !isPublic) return navigateTo('/login', { replace: true })
  if (me.value && isPublic) return navigateTo('/', { replace: true })
})
