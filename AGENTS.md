# AGENTS.md

Instructions for AI coding agents and human contributors working in this repository. Read this file before making changes.

Source-of-truth documents:

- Product scope: [docs/PRD.md](docs/PRD.md)
- Architecture, module boundaries, schema: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Decisions, open questions, risks: [docs/DECISIONS.md](docs/DECISIONS.md)
- Local setup: [README.md](README.md)

If a request conflicts with these documents, stop and ask. Don't silently diverge.

---

## 1. Project status

The project is in the **implementation phase** (approved by the owner on 2026-11-09). Work is delivered in phases; implement only what the current, owner-approved phase asks for.

- **Phase 1 — Project foundation: done.** Nuxt skeleton, Docker Compose PostgreSQL, Drizzle tooling, config, composition root, `GET /api/health`, lint/typecheck/test infrastructure.
- Not yet implemented: auth, LLM, dictionary, vocabulary, FSRS review, statistics, and the full UI.

Product decisions that shape all phases (see [DECISIONS.md](docs/DECISIONS.md)): the dashboard is always the landing page (D-18); FSRS review is the only study mode (D-19); no audio controls (D-20); Nitro is the backend, no Fastify for now (D-21); the Figma Make prototype is the visual specification, the PRD wins on conflicts (D-22, D-30); LLM limits (D-27); UUIDv7 IDs from PostgreSQL (D-28); per-user + global quota locks (D-29).

## 2. Stack summary

Nuxt 4 (Nitro, Vue 3), TypeScript 6 (strict; not 7, see D-23), Nuxt UI 4 + Tailwind CSS 4, PostgreSQL 18 + Drizzle ORM (`node-postgres`), Better Auth (Google OAuth), Zod 4, ts-fsrs, OpenAI Responses API, Vitest, Playwright, pnpm, Node 26 LTS. See [ARCHITECTURE.md section 1.1](docs/ARCHITECTURE.md#11-technology-baseline) for versions.

## 3. Coding conventions

### TypeScript

- `strict: true`. No `any`, no `@ts-ignore`. Use `unknown` + narrowing. `@ts-expect-error` is allowed only in tests, with a reason.
- Prefer `type` aliases and `interface` for ports. No classes for plain data. Classes are fine for adapters that hold dependencies.
- Named exports only (except where Nuxt/Nitro require a default export: pages, handlers, middleware, plugins).
- No barrel re-exports except each module's `index.ts` (its public API).
- No non-null assertions (`!`) outside tests. Validate instead.

### Naming

- Files and folders: `kebab-case` (`save-vocabulary.ts`). Vue components: `PascalCase.vue`.
- Database: `snake_case` tables and columns. Drizzle schema properties: `camelCase`.
- Use cases are verbs: `saveVocabulary`, `answerReview`, `lookupWord`.
- Ports are nouns describing the capability: `VocabularyRepository`, `LlmGateway`, `MorphologyProvider`, `Clock`.

### Architecture rules (enforced by lint and review)

- `server/core/**` must **not** import from `h3`, `nitropack`, `nuxt`, `#imports`, `#app`, `#shared`, `vue`, or anything under `app/` or `server/api|middleware|utils`. Use relative imports to reach `shared/contracts`.
- Modules interact only through each other's `index.ts`. Never import another module's `domain/`, `application/`, or `infrastructure/` directly.
- A module only writes its own tables (see the ownership table in ARCHITECTURE.md section 4).
- Handlers in `server/api/**` stay thin: `requireUser` → Zod parse → one use case call → map result. No SQL, no business rules, no LLM calls in handlers.
- Only `server/core/modules/llm/infrastructure` may import the `openai` SDK.
- Only `server/core/db` and `*/infrastructure` may import `drizzle-orm` or `pg`.
- Time comes from the injected `Clock`, never `new Date()` / `Date.now()` inside domain or application code.

### Validation and errors

- Every external input is validated with Zod: HTTP bodies, query params, route params, env vars, LLM outputs, and data read from JSON columns.
- Shared request/response schemas live in `shared/contracts/`. Server and client use the same schema.
- Object schemas for requests use `.strict()` and explicit `max()` lengths.
- Use cases return typed results or throw typed domain errors (`NotFoundError`, `ValidationError`, `QuotaExceededError`, ...) from `server/core/shared/errors.ts`. A single mapper in `server/utils` converts them to HTTP status codes. Never leak stack traces or raw provider errors to the client.

### Database

- All schema changes go through Drizzle schema files + `drizzle-kit generate`. Review the generated SQL before committing.
- **Never edit a migration that has been applied anywhere** (including someone's local database after it was committed). Add a new migration instead.
- `timestamptz` only, stored in UTC. Enumerations are `text` + `CHECK`.
- Every query on a user-owned table filters by `user_id`. Multi-row writes that must be atomic use a transaction.
- No raw SQL string concatenation. Use Drizzle's query builder or the `sql` tagged template with parameters.

### Frontend

- Use Nuxt UI components before writing custom ones. Tailwind utility classes for layout. No additional CSS frameworks.
- Mobile-first: design at 360 px wide, then enhance for larger screens.
- Data fetching goes through composables wrapping `$fetch`/`useFetch` with shared contract types.
- Polish text is wrapped with `lang="pl"`. UI strings live in `app/locales/en.ts` (no hard-coded user-facing strings in components), so i18n can be added later.
- Never use `v-html` with user or LLM content.
- Don't render nonfunctional controls (for example audio/pronunciation buttons, D-20). If a feature isn't built, its control isn't shown.
- The [Figma Make prototype](https://www.figma.com/make/VBOPkf1LIvnR9nnCJZAEA7/Polish-Vocabulary-Learning-App) is the **visual specification** for UI screens (D-30). Rebuild screens with Vue + Nuxt UI; never copy its React components, code, or dependencies (D-22). Where it conflicts with the PRD (behavior, scope, deferred features such as audio), the PRD wins. Note each deviation in the change description.

### Style

- Formatting and linting are automated (ESLint via `@nuxt/eslint`, configured at scaffolding time). Don't hand-format against the tool.
- Comments explain constraints the code can't express (why), not what the next line does.

## 4. Security rules

These are mandatory. A change that breaks one of them is not done, even if tests pass.

1. **No secrets in the repository.** No real API keys, client secrets, tokens, or connection strings with real passwords in code, docs, tests, fixtures, or commit messages. `.env` is git-ignored. `.env.example` contains placeholders only.
2. **Secrets stay on the server.** Never put secrets in `runtimeConfig.public`, client bundles, or responses. The OpenAI key, Google client secret, and Better Auth secret are server-only.
3. **LLM calls are server-only** and must go through `LlmGateway` (cache + quota + usage tracking). No direct provider calls from anywhere else, ever.
4. **Authorization on every access.** Every use case touching user data takes `userId` from the authenticated session (never from the request body) and scopes queries by it. Resources owned by other users return 404.
5. **No sensitive data in logs.** Don't log cookies, tokens, OAuth codes, email addresses, full LLM prompts/outputs, or request bodies. Log ids and hashes.
6. **Treat LLM output as untrusted.** Validate with Zod and render as text only.
7. **Treat user input sent to the LLM as data.** Pass it as a delimited input value, never concatenate it into instructions.
8. **CSRF.** Mutating `/api` routes rely on the origin-check middleware and JSON-only bodies. Don't add form-encoded mutation endpoints or bypass the middleware.
9. **Test-only auth bypass** must require both `NODE_ENV=test` and `E2E_AUTH_BYPASS=true`, and must fail startup if enabled in a production build.
10. **Dependencies.** Only well-maintained packages with a clear licence. No packages that post-install arbitrary scripts without review.

## 5. Testing requirements

- **Core changes** (domain, use cases) require Vitest unit tests using in-memory fakes for ports and a fixed `Clock`.
- **Repository or migration changes** require integration tests against the Docker Postgres test database.
- **New or changed endpoints** require tests for: unauthenticated (401), invalid input (400), other user's resource (404), and the happy path.
- **User-visible flows** (dashboard, search, save, review, settings, quota message) require or update a Playwright test, run at both a desktop and a mobile viewport.
- **FSRS scheduling** changes require tests with fixed timestamps and known expected intervals.
- **LLM-related code** uses the fake provider (`LLM_PROVIDER=fake`). Tests and CI must **never** call OpenAI or require a real API key.
- Bug fixes start with a failing test that reproduces the bug.
- Don't delete or weaken an existing test to make a change pass. If a test is wrong, explain why in the change description.

Before declaring work done, run and pass:

```bash
pnpm lint
pnpm typecheck
pnpm test          # unit + integration (requires `docker compose up -d db` and TEST_DATABASE_URL)
pnpm test:e2e      # when UI flows or endpoints changed (builds first; needs the test database)
```

- Integration and E2E tests refuse to run unless `TEST_DATABASE_URL` points to a database whose name ends in `_test`.
- Dependency install scripts are denied by default (`allowBuilds` in `pnpm-workspace.yaml`). If a new dependency needs one, review the script and record the decision there.

## 6. Constraints on autonomous changes

Agents may make focused changes within an approved task. The following need **explicit approval from the owner first**:

- Adding, removing, or major-version-upgrading any dependency (including dev dependencies).
- Changing the architecture: module boundaries, new modules, new ports, new infrastructure (Redis, queues, new services), or moving code out of `server/core`.
- Any change to authentication, session, CSRF, allowlist, or security-related configuration.
- Database migrations that drop or rename tables or columns, or rewrite data.
- Running destructive commands: dropping databases or volumes (`docker compose down -v`), `TRUNCATE`/`DELETE` on non-test databases, `git push --force`, history rewrites.
- Creating or modifying `.env` files, or anything containing credentials.
- Changing LLM models, prompt versions in a way that invalidates the cache broadly, or quota and budget defaults.
- Changing CI configuration or deployment settings.
- Editing `docs/PRD.md` scope (adding or removing features).

Always:

- Keep diffs small and focused on the task. Don't mix refactors with feature work.
- Update docs in the same change when behavior, schema, config, or decisions change (ARCHITECTURE.md, DECISIONS.md, README.md).
- Record new decisions or newly discovered risks in [docs/DECISIONS.md](docs/DECISIONS.md).
- If a requirement is ambiguous or seems wrong, ask instead of guessing.
- Never commit unless asked. Never push.
