# Słówko

A responsive web app for learning Polish vocabulary. Look up words and inflected forms, get short translations and detailed explanations in your language (Russian, Ukrainian, or English), save the dictionary form or the exact form you met, and review with FSRS spaced repetition.

> **Status: implementation, Phase 2 (authentication, settings, app shell) complete.** Google sign-in with an invite allowlist, sign-out, a placeholder dashboard, and the settings page work. Lookup, vocabulary, review, and statistics come in later phases. See [docs/PRD.md](docs/PRD.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

- **Nuxt 4** (Vue 3, Nitro server) with **TypeScript 6** (strict)
- **Nuxt UI 4** + **Tailwind CSS 4**
- **PostgreSQL 18** via **Docker Compose** (local), **Drizzle ORM** (`node-postgres`)
- **Better Auth** with Google OAuth *(planned)*
- **Zod** for validation, **ts-fsrs** for scheduling *(planned)*
- **OpenAI** (server-side only) for translations, morphology, and details *(planned)*
- **Vitest** and **Playwright** for tests
- **pnpm 12** as the package manager

Architecture: a modular monolith with framework-independent business logic in `server/core/`, served by Nitro. Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Documentation

| Document | Contents |
| --- | --- |
| [docs/PRD.md](docs/PRD.md) | User stories, acceptance criteria, MVP scope, deferred features |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules, request flows, database design, auth, LLM integration |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log, open decisions, risks, assumptions |
| [AGENTS.md](AGENTS.md) | Coding conventions, security rules, testing requirements, change constraints |

## Prerequisites

- **Node.js 26 LTS** (see `.node-version`; ts-fsrs v6 requires Node ≥ 24).
- **pnpm 12.** Node 26 no longer ships Corepack, so install pnpm yourself, for example `npm install -g pnpm@12.18.0` (the exact version is pinned in `package.json` → `packageManager`). Alternatively prefix every command with `npx pnpm@12.18.0`.
- **Docker** with Docker Compose v2 (Docker Desktop on Windows/macOS). Docker Desktop must be running.
- Later phases: a **Google Cloud** project for OAuth credentials and, optionally, an **OpenAI API key** (`LLM_PROVIDER=fake` will work without one).

## Local development

```bash
# 1. Create your local env file
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
#    Edit .env: choose a local POSTGRES_PASSWORD and put the same password
#    into DATABASE_URL and TEST_DATABASE_URL; set BETTER_AUTH_SECRET
#    (openssl rand -base64 32), your Google OAuth client (see below), and
#    ALLOWED_EMAILS (your own Google address).

# 2. Start PostgreSQL (first start also creates the <POSTGRES_DB>_test database)
docker compose up -d --wait db

# 3. Install dependencies (also runs `nuxt prepare`)
pnpm install

# 4. Apply database migrations
pnpm db:migrate

# 5. Run the dev server
pnpm dev                        # http://localhost:3000, health: http://localhost:3000/api/health
```

Stop the database with `docker compose stop db`. Your data lives in the `slowko_pgdata` Docker volume.

### Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Nuxt dev server |
| `pnpm build` / `pnpm preview` | Production build and local preview (`node .output/server/index.mjs`) |
| `pnpm build:e2e` | Test-only build with the E2E session route, written to `.output-e2e/`. Never deploy it |
| `pnpm lint` / `pnpm lint:fix` | ESLint (`@nuxt/eslint`, stylistic formatting, architecture boundary rules) |
| `pnpm typecheck` | `nuxt typecheck` (vue-tsc over app, server, shared, and config files) |
| `pnpm test` | Unit + integration tests (needs the Docker database) |
| `pnpm test:unit` | Unit tests only (no database) |
| `pnpm test:integration` | Integration tests against `TEST_DATABASE_URL` (migrated first) |
| `pnpm test:build` | Production build, then checks that it contains no test-only code (`tests/build/`) |
| `pnpm test:e2e` | `test:build`, then the e2e build and Playwright at desktop and mobile viewports against the test database |
| `pnpm eval:smoke` / `eval:pilot` / `eval:full` | **Paid** live LLM evaluation, one stage each. Skipped unless `LLM_EVAL_LIVE` names that stage. See [tests/eval/README.md](tests/eval/README.md) |
| `pnpm db:generate` | Generate a SQL migration from Drizzle schema changes |
| `pnpm db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `pnpm db:studio` | Drizzle Studio for browsing local data |

First-time E2E setup: `pnpm exec playwright install chromium` (both Playwright projects use Chromium).

### Database

Only the database runs in Docker; the app runs on the host for fast reloads. `docker-compose.yml`:

- uses `postgres:18.6`, data in the `pgdata` volume at `/var/lib/postgresql` (the PostgreSQL 18 image path)
- reads `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` from `.env`; it refuses to start without `POSTGRES_PASSWORD`
- publishes the port on `127.0.0.1` only
- runs `docker/postgres/initdb/` on the **first** start, which creates `<POSTGRES_DB>_test` for integration and E2E tests

Troubleshooting:

- **Port 5432 already in use** (for example a local PostgreSQL install): set `POSTGRES_PORT=5433` in `.env` and use that port in both URLs.
- **Changed `POSTGRES_PASSWORD` after the first start:** the password is only applied when the volume is initialized. Either change it inside PostgreSQL (`ALTER USER ...`), or delete the volume with `docker compose down -v` — this **deletes all local data**.
- **Test database missing** (volume created before the init script existed): `docker compose exec db createdb -U slowko slowko_test`.

## Environment variables

All values in `.env.example` are **placeholders**. Never commit real values. `.env` is git-ignored, and only `.env.example` is committed. `nuxt dev`, `drizzle-kit`, Vitest, and Playwright read `.env` automatically; variables already set in the environment take precedence.

### Used now

| Variable | Required | Example / default | Purpose |
| --- | --- | --- | --- |
| `POSTGRES_USER` / `POSTGRES_DB` | no | `slowko` / `slowko` | Docker Compose database user and name |
| `POSTGRES_PASSWORD` | yes (compose) | `<choose-a-local-password>` | Local database password. Choose your own |
| `POSTGRES_PORT` | no | `5432` | Host port for the database |
| `DATABASE_URL` | yes | `postgresql://slowko:<password>@localhost:5432/slowko` | App database |
| `DATABASE_POOL_MAX` | no | `10` | Max pooled connections (1–50) |
| `TEST_DATABASE_URL` | for tests | `postgresql://slowko:<password>@localhost:5432/slowko_test` | Integration/E2E database. The name must end in `_test` |
| `BETTER_AUTH_SECRET` | yes | `<random 32+ chars>` | Signs and encrypts auth data (also encrypts stored OAuth tokens). Generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | yes | `http://localhost:3000` | Public base URL. Used for OAuth callbacks and as the only trusted origin |
| `GOOGLE_CLIENT_ID` | yes | `<your-client-id>.apps.googleusercontent.com` | Google OAuth client |
| `GOOGLE_CLIENT_SECRET` | yes | `<your-client-secret>` | Google OAuth client secret. Server-only |
| `ALLOWED_EMAILS` | no | `you@example.com,friend@example.com` | Seeds the sign-up allowlist at startup (insert-only; see `docs/operations.sql` to revoke) |
| `E2E_AUTH_BYPASS` | tests only | `false` | Test-only session seeding. Startup fails if `true` outside `NODE_ENV=test`; the route only exists in the e2e build |

### Planned (added with their features)

LLM limit defaults follow [PRD US-12](docs/PRD.md) and [ARCHITECTURE section 9.2](docs/ARCHITECTURE.md#92-limits-and-budgets), confirmed in DECISIONS D-27.

| Variable | Required | Example / default | Purpose |
| --- | --- | --- | --- |
| `LLM_PROVIDER` | yes | `fake` or `openai` | `fake` returns deterministic fixtures and needs no key |
| `OPENAI_API_KEY` | if `openai` | `<your-openai-key>` | Server-only |
| `OPENAI_MODEL_FAST` | if `openai` | see [DECISIONS.md OD-03](docs/DECISIONS.md) | Lookup and short translation |
| `OPENAI_MODEL_DETAIL` | if `openai` | see [DECISIONS.md OD-03](docs/DECISIONS.md) | Details (meanings, examples, forms) |
| `LLM_ENABLED` | no | `true` | Global kill switch for uncached LLM work |
| `LLM_DAILY_LOOKUPS_PER_USER` | no | `30` | Uncached lookups + short translations per user per UTC day |
| `LLM_DAILY_DETAILS_PER_USER` | no | `10` | Uncached details per user per UTC day |
| `LLM_DAILY_TOKENS_PER_USER` | no | `50000` | Token budget per user per UTC day |
| `LLM_DAILY_BUDGET_USD` | no | `1.00` | Estimated global spend per UTC day |
| `LLM_MONTHLY_BUDGET_USD` | no | `10.00` | Estimated global spend per UTC month |
| `MORPHOLOGY_PROVIDER` | no | `llm` | `llm` in MVP. `dictionary`/`composite` reserved for later |

The app's LLM budgets are soft, estimate-based limits. Configure a real cap at the provider before using a real key (DECISIONS OD-09).

## Google OAuth setup

1. Open **Google Cloud Console → APIs & Services → Credentials**.
2. Configure the **OAuth consent screen** (External, testing mode is fine; add your test users).
3. **Create Credentials → OAuth client ID → Web application**.
4. Add the authorized redirect URI:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://<your-domain>/api/auth/callback/google`
5. Put the client ID and secret into your local `.env`. Never commit them.

`BETTER_AUTH_URL` must match the origin you use in the browser, or Google will report `redirect_uri_mismatch`.

The credentials stay in your local `.env` (git-ignored). Tests never use them: integration tests stub Google's token endpoint, and E2E uses test-only session seeding.

## Operator procedures

Inviting users, revoking access (allowlist **and** sessions), and deleting accounts are SQL procedures in [docs/operations.sql](docs/operations.sql).

## Project layout

```text
app/              Vue pages, layouts, composables, UI strings (client + SSR)
shared/contracts/ Zod schemas shared by client and server
server/api/       Thin Nitro HTTP handlers
server/middleware/ CSRF origin check for mutating /api routes
server/plugins/   Nitro plugins (container lifecycle, allowlist seeding)
server/utils/     Nitro-side helpers (useContainer, requireUser, error mapping)
server/testing/   Test-only E2E session route (compiled into the e2e build only)
server/core/      Framework-independent config, composition root, DB, modules
drizzle/          Generated SQL migrations
docker/           Docker Compose init scripts
tests/            Integration, build-safety (Vitest) and E2E (Playwright) tests + support code
docs/             PRD, architecture, decisions
```

## Licence and third-party data

The licence for this project is not yet chosen. If a dictionary dataset (e.g. PoliMorf/SGJP, 2-clause BSD) is imported in the future, its notices will be kept in `THIRD_PARTY_NOTICES`.
