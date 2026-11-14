// Unmatched /api/* paths answer with a JSON 404 instead of falling through to
// the page renderer (which would redirect to /login). Specific routes, including
// /api/auth/* and the e2e-only route, take precedence over this catch-all.
export default defineApiHandler(async () => {
  throw new HttpFailure(404, 'not_found', 'Not found');
});
