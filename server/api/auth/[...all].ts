// Better Auth mount (ARCHITECTURE.md section 8.2). Nothing may read the request
// body before this handler: toWebRequest passes the body stream through.
export default defineEventHandler(event => useContainer().auth.handler(toWebRequest(event)));
