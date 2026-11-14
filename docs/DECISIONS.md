# Decisions, Open Questions, Risks, and Assumptions

Status: Living document (implementation started)
Last updated: 2026-11-14

This file keeps four things separate:

1. **Decided**: choices that are made. Change them only by adding a new entry that supersedes the old one.
2. **Open decisions**: choices that still need an owner decision, each with a recommendation.
3. **Risks**: things that could go wrong, with mitigations.
4. **Assumptions**: things we believe to be true but haven't verified. If one turns out false, revisit the related design.

Related: [PRD.md](PRD.md), [ARCHITECTURE.md](ARCHITECTURE.md), [../AGENTS.md](../AGENTS.md)

---

## 1. Decided

| ID | Decision | Rationale | Alternatives considered |
| --- | --- | --- | --- |
| D-01 | Modular monolith: one Nuxt 4 app, business logic in framework-independent `server/core/` | Few users, one deployable; keeps a cheap path to extracting the backend | Separate API server (Fastify) now; microservices |
| D-02 | Single package, not a pnpm workspace; boundaries enforced by ESLint `no-restricted-imports` | Less tooling. `server/core` can become a package later without code changes | pnpm workspace with `packages/core` |
| D-03 | PostgreSQL 18 + Drizzle (`node-postgres`), Docker Compose for local DB only | Requested stack. Postgres covers cache, quotas, sessions; no Redis | postgres.js driver; Prisma |
| D-04 | Better Auth core (1.7.x) mounted directly at `/api/auth/*`, Drizzle adapter, Google only, database sessions | Framework-agnostic (portable to Fastify), revocable sessions, mature core | `@nuxtjs/better-auth` (pre-1.0, Nuxt-bound); `nuxt-auth-utils` (h3-bound, stateless sessions) |
| D-05 | Invite-only sign-up via `allowed_emails` checked in a Better Auth `user.create.before` hook | MVP is for a few known users; caps LLM cost exposure | Open sign-up with quotas only |
| D-06 | OpenAI as the LLM provider, behind `LlmGateway` / `LlmProvider` ports; Responses API with structured outputs (`zodTextFormat`) | Owner's choice. Structured outputs give schema-valid JSON | Anthropic, Gemini; provider-agnostic SDK layer |
| D-07 | All LLM calls server-side with DB cache (`llm_cache`), usage log (`llm_usage`), per-user daily limits, and a global monthly budget | PRD requirement; predictable cost | Redis cache; no limits |
| D-08 | Shared (cross-user) dictionary cache; no `user_id` in cached content | Dictionary data is not personal; maximizes cache hits | Per-user cache |
| D-09 | `MorphologyProvider` port. MVP implementation is LLM-based. A dictionary-based provider (PoliMorf/SGJP) is documented but not imported | Owner's choice: ship without a multi-million-row import, keep the upgrade path | Import PoliMorf now; LLM only with no port |
| D-10 | All plausible analyses are preserved and shown. The user chooses the analysis and whether to save the lemma, the form, or both | Polish forms are frequently ambiguous (`mam`, `zamek`) | Auto-pick the most likely analysis |
| D-11 | Polish is the fixed learning language. Translation language is per-user (`ru` default, `en`, `uk`). UI locale is a separate setting, with English only in the MVP | Owner's choice. Separating the settings avoids a schema change when UI i18n ships | A single "language" setting |
| D-12 | ts-fsrs for scheduling behind a `Scheduler` port; the scheduler version is stored on each card and log | Requested FSRS. The port isolates ts-fsrs v6 API churn | Hand-written FSRS; SM-2 |
| D-13 | Append-only `review_logs` with before/after state | Statistics, future FSRS optimization, ability to rebuild state | Storing only current card state |
| D-14 | ~~"Classic flashcards" are a practice mode that never changes FSRS state~~ **Superseded by D-19** | Lets users browse freely without corrupting the schedule | Practice ratings feeding FSRS |
| D-15 | Node 26 LTS as runtime | Current Active LTS; ts-fsrs v6 needs Node ≥ 24 | Node 24 (now in maintenance) |
| D-16 | Enumerations as `text` + `CHECK`, timestamps as `timestamptz` (UTC) | Easier migrations; unambiguous time handling | PostgreSQL enums |
| D-17 | Fake LLM provider for all automated tests; test-only session seeding for E2E | No secrets or costs in CI; deterministic tests | Recording/replaying real OpenAI calls |
| D-18 | **The dashboard (`/`) is always the default authenticated landing page.** No automatic redirect to review, even when cards are due (2026-11-09, owner) | Predictable entry point; the dashboard shows due counts and links to review | Land on review when cards are due, else search (PRD revision 2) |
| D-19 | **FSRS-scheduled flashcard review is the only study mode in the MVP.** Supersedes D-14; free practice stays deferred (PRD US-09) (2026-11-09, owner) | One study mode, one data model (`cards` + `review_logs`) | Practice mode that leaves FSRS state untouched (D-14) |
| D-20 | **Audio pronunciation is deferred beyond the MVP. No audio controls are rendered**, not even disabled placeholders (2026-11-09, owner) | Nonfunctional buttons mislead users | Disabled "coming soon" buttons |
| D-21 | **Nitro (inside Nuxt) is the initial backend.** No Fastify or other separate server at this stage; the extraction path in ARCHITECTURE section 11 stays open (2026-11-09, owner) | Reaffirms D-01 | Separate API server now |
| D-22 | (Amended by D-30: now the visual *specification*.) The approved Figma Make prototype is the **visual reference only**. Screens are built with Vue + Nuxt UI; no React components, code, or dependencies are copied from it. Where it conflicts with the PRD (e.g. audio buttons, landing page), the PRD wins | Keeps the stack and the dependency list intact | Porting generated React code |
| D-23 | Phase 1 toolchain (2026-11-09): **TypeScript 6.0.x**, not 7.0; **pnpm 12** pinned via `packageManager` and installed without Corepack; dependency install scripts denied by default via `allowBuilds` in `pnpm-workspace.yaml` (`esbuild`, `vue-demi` reviewed and denied) | TS 7 (native compiler) is `latest` on npm, but `vue-tsc`/`nuxt typecheck` rely on the JS compiler API of TS ≤ 6. Node 26 no longer bundles Corepack. Install scripts are a supply-chain risk (AGENTS.md rule 10); both scripts are unnecessary | TS 7 for app code; `npm i -g corepack` |
| D-24 | Application config is parsed from `process.env` by `server/core/config.ts` (Zod), not through Nuxt `runtimeConfig` | Keeps `server/core` framework-independent; one parser for Nitro and a future backend. Nothing is exposed to the client | `runtimeConfig` + `useRuntimeConfig()` in handlers |
| D-25 | Drizzle ORM **0.45.4** / drizzle-kit **0.31.11** (resolves OD-01, option a). drizzle-orm 1.0 was not GA on 2026-11-09 | Stable line; one-time upgrade to 1.0 later (R-07) | 1.0 RC |
| D-26 | `GET /api/health` is the only unauthenticated app endpoint besides `/api/auth/*`. It returns `{ status, database: 'up' \| 'down' }` (503 when down) and never error details | Readiness probe for local dev, E2E, and future hosting | No health endpoint; authenticated health endpoint |
| D-27 | **LLM limits** (2026-11-10, owner; resolves the limits part of OD-03): per user per UTC day 30 uncached lookups (incl. short translations), 10 uncached details, 50,000 tokens; global $1.00 per UTC day and $10.00 per UTC calendar month (estimated). Accounting rules in ARCHITECTURE section 9.2.1 | PRD US-12 defaults; conservative for < 20 users | OD-03 recommendation (100 requests, 200k tokens, $30/month) |
| D-28 | **IDs** (2026-11-10, owner; resolves OD-06): entity primary keys are `uuid` generated by PostgreSQL 18 with `DEFAULT uuidv7()`, **including Better Auth tables** (`advanced.database.generateId: false`, so Better Auth leaves ID generation to the database). FKs to `"user".id` are `uuid`. Exceptions: tables keyed by a natural or composite key (`allowed_emails`, `user_settings`, `lexeme_translations`, `morph_lookup_results`); `review_logs.client_review_id` is generated by the client (any UUID version) | Time-ordered, index-friendly, one ID type everywhere, no app-side generator | Mixed `text` (Better Auth) + `uuid` (app); app-generated UUIDs. Fallback if Better Auth turns out to need the ID before insert: Better Auth generates UUIDs app-side (`generateId: "uuid"`) into the same `uuid` columns, recorded as a new decision |
| D-29 | **Quota locking** (2026-11-10, owner): per-user quotas are checked under a **per-user** transaction-level advisory lock; global budgets are checked under a **separate global** advisory lock taken afterwards in the same short transaction. Fixed lock order (user → global) prevents deadlocks. Details in ARCHITECTURE section 9.3 step 5 | Users don't serialize on each other for their own quota; global budget stays exact | One global lock for everything (ARCHITECTURE revision 2); counter rows with conditional `UPDATE` |
| D-30 | **The Figma Make prototype is the visual specification** for UI screens (layout, components, spacing, states), implemented with Vue + Nuxt UI. Amends D-22 ("reference only"); the rest of D-22 stands: no React code or dependencies are copied, and the PRD wins on conflicts (2026-11-10, owner) | One agreed design; PRD stays authoritative on behavior and scope | Design improvised per screen |
| D-31 | **E2E session seeding is compiled only into a separate e2e build** (`nuxt build --envName e2e` → `.output-e2e/`), answers 404 unless `NODE_ENV=test` + `E2E_AUTH_BYPASS=true`, and takes no input: it always creates a brand-new user under `.invalid`, so it cannot impersonate anyone (2026-11-10, Phase 2 requirement 2) | Absent from production builds rather than merely switched off; verified by `tests/build/` | Runtime flag only; a route that takes an email |
| D-32 | Better Auth runs with **`advanced.disableOriginCheck: false` set explicitly** (2026-11-10) | Better Auth 1.7.18 defaults to *skipping* its origin/CSRF check when `NODE_ENV=test`, so tests would not exercise production behavior. Found by an E2E test; production (`NODE_ENV=production`) was never affected | Library default |
| D-33 | Better Auth stores Google OAuth tokens **encrypted** (`account.encryptOAuthTokens: true`); `account` has an extra `UNIQUE (provider_id, account_id)` (2026-11-10) | We never use the tokens, so they're pure liability at rest; one Google identity must map to one account | Defaults |
| D-34 | The per-user LLM override columns of `user_settings` (ARCHITECTURE 7.2) are added in the LLM phase, not in Phase 2 (2026-11-10) | No unused columns; an additive migration later is cheap | Create them now |
| D-35 | Client-side action buttons (sign in, sign out, save) are **disabled until the page has hydrated** (2026-11-10) | Prevents clicks on server-rendered buttons from being silently dropped (seen as E2E flakiness; same risk for real users on slow networks) | Leave buttons active before hydration |
| D-36 | **Phase 3 plan (revision 2) approved as the architectural baseline** (2026-11-14, owner), with these conditions: (1) a search makes **at most one charged provider call**: a cold lookup never triggers a paid `short_translation` in the same request; (2) a concurrency test must show that an LLM result generated before a translation or morphology revision change cannot overwrite newer state; (3) the evaluation is staged (smoke 2–3 calls → pilot 10–15 words → full only after explicit approval); (4) live calls are off by default; (5) accounting fails closed when usage or pricing is unknown | Owner review of the Phase 3 plan | — |
| D-37 | **`openai` SDK 7.56.0**, exact pin (2026-11-14). 7.57.0 (released the day before) was not used because it is younger than pnpm 12's default `minimumReleaseAge`; no policy exclusion was added. The adapter calls `responses.create` with `zodTextFormat` (strict JSON schema; Zod 4 supported) and validates the output itself, instead of `responses.parse`, which throws on invalid output and would lose the usage of a billed call | Supply-chain policy kept intact; post-call accounting always has usage | Adding a `minimumReleaseAgeExclude` entry; `responses.parse` |
| D-38 | **Pre-gateway live evaluation**: a one-time, scope-limited exception to AGENTS security rule 3 (2026-11-14, owner, plan R2-5/N-1). Dev-only harness in `tests/eval/`, never in `pnpm test` or CI; each stage runs only when `LLM_EVAL_LIVE` names it; every call is priced before and after; the stage stops on unknown usage, cost above estimate, or account errors; per-stage cap $0.25 / $1 / $3. **The cap is an application-level estimate, not a hard limit** (the hard limit is OD-09). The exception ends in plan step 3.10, when the harness moves onto the gateway | Choose models and freeze prompt schemas before building the gateway around them | Building the full gateway first |
| D-39 | Grammar enums live in `shared/contracts/dictionary.ts`; `deriveDiscriminator` and `buildTagKey` live in `shared/dictionary/` (2026-11-14) | LLM prompt validation needs them, and llm must not depend on dictionary (that would be a cycle). The client will render the same tags | Placing them in the dictionary module (ARCHITECTURE 7.3 wording) |

---

## 2. Open decisions

Each has a recommendation. Defaults are applied at scaffolding time unless the owner decides otherwise.

### OD-01. Drizzle 0.45.x (stable) vs 1.0 (release candidate) — resolved by D-25

- **Context:** As of 2026-11-08, Drizzle ORM / drizzle-kit 1.0 is at `1.0.0-rc.5` (pre-release). 0.45.x is the stable line. 1.0 changes the migrations format and relational query API (RQBv2), and the 0.x → 1.0 upgrade includes a migration-folder conversion.
- **Options:**
  - (a) Start on 0.45.x and upgrade at 1.0 GA. You get stable releases now but pay a one-time conversion later.
  - (b) Start on 1.0 RC. No later conversion, but you are exposed to RC churn and some ecosystem lag (for example, adapters pinned to 0.x).
- **Recommendation:** (a), **unless** 1.0 GA ships before scaffolding starts, in which case use 1.0. Also check the Better Auth Drizzle adapter's supported Drizzle range at that time.

### OD-02. FSRS model version: FSRS-6 vs FSRS-7

- **Context:** ts-fsrs 6.0.0 (2026-10-28) supports FSRS-3 through FSRS-7, and `DefaultScheduler` defaults to **FSRS-7**. FSRS-6 is the long-established model used widely (e.g. in Anki).
- **Recommendation:** **FSRS-6** for the MVP, set explicitly (`version: 'FSRS-6'`). It has a longer track record, and the defaults are well understood. Because `scheduler_version` is stored per card and per log, switching to FSRS-7 later is a controlled migration: replay review logs to rebuild card state.
- **Reconsider if:** FSRS-7 gets clear benchmark evidence of better calibration for vocabulary cards, or ts-fsrs deprecates FSRS-6 paths.

### OD-03. OpenAI models, pricing, and default limits

- **Context:** The model lineup and prices change often, so model IDs are configured in env, not code. Prices at the time of writing ([pricing page](https://developers.openai.com/api/docs/pricing), per 1M tokens, input/output): `gpt-6-luna` $0.10/$0.50, `gpt-6.1-terra` $1/$5, `gpt-6.1-sol` $2/$10, `gpt-6-astra` $10/$50.
- **Rough cost model** (assumptions: lookup ≈ 500 input + 400 output tokens; details ≈ 700 input + 1,500 output tokens):
  - Lookup on `gpt-6-luna`: about $0.00025 per uncached call.
  - Details on `gpt-6.1-terra`: about $0.008 per uncached call.
  - 10 active users × (30 uncached lookups + 10 uncached details) per day ≈ $0.08 + $0.80 = **under $1/day, under $30/month**, before cache savings.
- **Recommendation:**
  - Build a small golden set first: about 50 tricky Polish forms (aspect pairs, participles, irregular plurals, `mam`, `zamek`, `poszłam`, `ludzi`, `lepszy`).
  - Evaluate `gpt-6-luna` vs `gpt-6.1-terra` for **lookup** (morphology accuracy matters more than cost here), and `gpt-6.1-terra` vs `gpt-6.1-sol` for **details**.
  - Start defaults: 100 uncached requests per user per day, 200k tokens per user per day, $30/month global budget (matches the uncached estimate above; cache hits should keep real spend lower). Adjust after two weeks of `llm_usage` data.
- **Limits resolved by D-27** (PRD defaults kept). Model choice and the golden-set evaluation are still open.

### OD-04. Hosting target

- **Context:** This affects the Nitro preset, the managed Postgres choice, the cookie domain, and HTTPS setup. It is not needed for local development.
- **Options:** a single VPS with Docker (app + Postgres); a PaaS with managed Postgres (Render, Railway, Fly.io); serverless (Vercel/Netlify + Neon). Serverless conflicts somewhat with the in-process single-flight map and long details calls, though both would still be correct.
- **Recommendation:** a single long-running Node server (Nitro `node-server` preset) next to managed Postgres or Postgres on the same VPS. Decide before the first deployment.

### OD-05. Reverse cards (translation → Polish) in the MVP

- **Context:** Production (recall in Polish) is harder and more valuable for active vocabulary, but doubles review load and makes inflected-form cards awkward.
- **Recommendation:** MVP ships **recognition only** (Polish → translation). The `card_type` column already allows adding `production` later as an opt-in per item.

### OD-06. ID strategy — resolved by D-28

- **Context:** Better Auth uses `text` IDs by default. App tables are planned as `uuid` with `uuidv7()`.
- **Options:** (a) mixed: Better Auth `text`, app `uuid` (FKs to `user.id` are `text`); (b) configure Better Auth to generate UUIDs and use `uuid` everywhere.
- **Recommendation:** (b) if Better Auth's ID generation option works cleanly with the Drizzle adapter at scaffolding time (verify with an integration test), otherwise (a). Decide before the first migration, because changing it afterwards is expensive.

### OD-07. Project licence

- Not chosen. Needed before publishing the repository or importing third-party datasets.

### OD-08. Data retention and account deletion

- **Context:** The MVP has no self-service deletion. Review logs grow indefinitely, and `llm_usage` rows contain user IDs.
- **Recommendation:** Document an operator procedure (delete `user` → cascades). Keep `llm_usage` for 12 months, then aggregate. Revisit before inviting users outside the owner's circle.

### OD-09. Provider-side spending cap

- **Context:** The app's LLM budgets (ARCHITECTURE section 9.2) are soft, estimate-based limits. They cannot stop spend caused by stale price tables, in-flight requests, provider-side billing of timed-out calls, bugs, or a leaked key.
- **Options:** (a) dedicated OpenAI project + key with project budget alerts; (b) additionally prepaid credits with auto-recharge off (a real hard cap); (c) rely on app limits only.
- **Recommendation:** (a) + (b). Configure before the first real (non-fake) LLM call; document the setup in README.

---

## 3. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R-01 | **LLM morphology errors**: wrong lemma, invented forms, wrong tags, inconsistent aspect pairs | High | Medium (learners save wrong data) | Show all analyses with confidence and an "AI-generated" label; report button; golden-set evaluation before choosing the model; prompt rules; dictionary provider later (D-09) |
| R-02 | **Cache poisoning**: a bad LLM answer is cached and served to all users | Medium | Medium | Zod validation before caching; `invalidated_at` for operator invalidation after reports; prompt version in the cache key enables bulk invalidation |
| R-03 | **Cost overrun** from a bug (retry loop) or heavy use | Low–Medium | Medium | Per-user daily request/token limits, global monthly budget kill switch, `max_output_tokens`, one retry max, usage logging for every call |
| R-04 | **Nitro v3 / h3 v2 migration** in a future Nuxt release changes handler APIs | High (eventually) | Low | Thin handlers; core has no h3 imports; `toWebRequest` / Fetch-standard Better Auth mount |
| R-05 | **Better Auth churn**: frequent releases, several recent security fixes (1.7.x) | Medium | Medium | Pin exact versions; apply patch releases promptly; integration tests for sign-in hooks and session checks; read changelog before upgrading |
| R-06 | **ts-fsrs v6 breaking changes** (enums → const objects, removed `elapsed_days`, new scheduler API) and Node ≥ 24 requirement | Medium | Low | Wrap in the `Scheduler` port; scheduling tests with fixed timestamps; pin version |
| R-07 | **Drizzle 1.0 transition** (see OD-01) | Medium | Low–Medium | Pin versions; plan the upgrade as a dedicated change |
| R-08 | **Polish text normalization**: diacritics, case (proper nouns), Unicode forms (NFC/NFD), multi-word expressions, reflexive `się` | High | Medium (cache misses, duplicate lexemes) | Single tested `normalize()` in `server/core/shared`: NFC, trim, whitespace collapse, lowercase key with original kept for display. Diacritic-less input yields a suggestion, never a silent rewrite |
| R-09 | **Homonyms and lexeme identity**: the LLM may split or merge lexemes inconsistently across calls (`zamek` castle/lock) | Medium | Medium | `homonym_no` + `gloss_hint`; upsert by natural key; operator merge procedure if duplicates appear |
| R-10 | **OpenAI outage or latency spikes** | Medium | Low (review still works) | Timeouts, clear error state, cached data still served; LLM features are isolated from review and vocabulary |
| R-11 | **Google OAuth app verification**: production consent screen limits for unverified apps | Medium | Low | With few users, keep the app in testing mode with listed test users, or complete basic verification (only `openid email profile` scopes) |
| R-12 | **Timezone bugs** in daily limits, new-card counts, and streaks | Medium | Low–Medium | Store UTC; compute local days in SQL with the user's IANA timezone; tests around midnight and DST changes |
| R-13 | **Scope creep** toward courses, audio, or social features | Medium | Medium | Deferred list in PRD; AGENTS.md requires approval for scope changes |
| R-14 | **Quota race conditions**: concurrent requests exceed per-user limits or the global budget | Low | Low | D-29: per-user transaction-level advisory lock for user quotas, then a separate global advisory lock for budgets, always in that order; worst-case estimates reserved before the call; integration tests at the limit boundary (ARCHITECTURE 9.3, section 13) |
| R-15 | **Toolchain churn** (found 2026-11-09): TypeScript 7 native compiler vs `vue-tsc`; Corepack removed from Node; pnpm 12 config keys (`allowBuilds`) differ from older pnpm docs | Medium | Low | Pin exact versions (D-23); revisit TS 7 when `vue-tsc` supports it; README documents pnpm installation |
| R-16 | **Request body consumed before Better Auth**: any Nitro middleware that reads the body breaks `auth.handler(toWebRequest(event))` | Medium | Medium (sign-in breaks) | Middleware reads headers only and skips `/api/auth/*` (ARCHITECTURE 8.2, 8.8); integration test for sign-in through the mount |
| R-17 | **Design drift**: the Figma Make prototype shows features that are deferred (e.g. audio) or flows that differ from the PRD | Medium | Low | D-22: PRD wins; review each screen against the PRD before building it |
| R-18 | **Figma Make prototype not machine-readable** (found 2026-11-10): the URL returns only a JavaScript shell without a Figma login, so the Phase 2 screens could not be compared with it | High (until exports are provided) | Medium (visual rework) | Phase 2 screens use Nuxt UI defaults with a consistent, minimal system; align them once the owner provides frame exports or screenshots |
| R-19 | **Library test-mode defaults** weaken security in tests only (e.g. Better Auth skipping origin checks under `NODE_ENV=test`, D-32) | Medium | Medium (tests miss regressions) | Set security options explicitly instead of relying on defaults; E2E checks run with production-equivalent settings |
| R-20 | **Price table not verified** (found 2026-11-14): `model-prices.ts` holds the OD-03 figures; cached-input prices are unknown (charged at full input price) | Medium | Medium (budget estimates wrong) | Owner verifies against the pricing page before any live run; unknown models fail closed; the provider-side cap (OD-09) is the hard limit |
| R-21 | **Golden set not yet reviewed** by a native speaker or checked against SGJP/Morfeusz 2 | Medium | Medium (wrong model choice) | Tiered scoring keeps debatable lemma choices out of the gates; review before the full stage gates anything |
| R-22 | **Token cap pressure** (plan C-13): the worst-case lookup estimate is ~2,160 input tokens (instructions + JSON schema), so the 50k tokens/user/day cap may bind before the 30-lookup cap | Medium | Low–Medium | The smoke and pilot runs measure actual input tokens; compact the prompts or bring numbers to the owner (changing D-27 needs approval) |

---

## 4. Assumptions

| ID | Assumption | If false |
| --- | --- | --- |
| A-01 | Fewer than about 20 invited users in the MVP; low, bursty traffic | Revisit single-instance design, in-memory rate limiting, and quotas |
| A-02 | A single long-running Node process serves the app (no serverless fan-out) | Single-flight dedup becomes per-instance only (still correct); Better Auth rate limiting needs database storage |
| A-03 | Users are adults with Russian, Ukrainian, or English as a strong language, at A2–B2 Polish level | Revisit explanation depth and UI language priority |
| A-04 | The cached dictionary data (translations, analyses, details) is not personal data and can be shared across users | Add per-user scoping or anonymization review |
| A-05 | Sending single Polish words or short phrases (no user identifiers) to OpenAI is acceptable for all users | Need a consent notice or an alternative provider |
| A-06 | Online-only use is acceptable (no offline review) | Requires PWA + sync design (deferred) |
| A-07 | ~~"Classic flashcards" means free practice that does not affect scheduling~~ No longer relevant: the MVP has no practice mode (D-19) | — |
| A-08 | One recognition card per vocabulary item is enough for the MVP | Implement OD-05 |
| A-09 | Default FSRS parameters are good enough until users have a few months of history | Add per-user optimization earlier |
| A-10 | The operator can manage the allowlist, reports, and account deletion via config and SQL | Build a minimal admin UI |
| A-11 | A single "local day" per user, based on a stored IANA timezone (default `Europe/Warsaw`), is enough for limits and stats | Detect timezone from the browser on each session |
| A-12 | Short expressions (up to 100 characters) are treated like words; full-sentence translation is not an MVP feature | Add a separate sentence feature with its own prompt and limits |
