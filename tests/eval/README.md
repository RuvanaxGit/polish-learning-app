# LLM evaluation (Phase 3, steps 3.1–3.2)

Measures the draft prompts in `server/core/modules/llm/prompts/` against a golden
dataset of Polish forms before the gateway exists. Used to choose models
(DECISIONS OD-03), confirm Structured Outputs compatibility, and finalize the
prompt schemas.

**Live runs make paid OpenAI calls. They are disabled by default and run only
when the owner authorizes a specific stage.**

## Layout

| Path | What |
| --- | --- |
| `golden/morphology.ts` | Golden dataset, scored in tiers (A, A-amb, C, negative, suggestion). Draft: not yet reviewed by a native speaker |
| `scoring.ts` | Per-item scoring, aggregate metrics, model-choice gates |
| `budget.ts`, `call.ts` | Cost guard and the single accounted call |
| `stages.ts`, `run-stage.ts` | Stage plans (smoke / pilot / full) and the sequential runner |
| `report.ts` | Writes `report.json`, `summary.md`, `translations.csv` to `eval-results/` (git-ignored) |
| `live/*.live.ts` | Paid entry points, one per stage (run with `vitest.eval.config.ts`) |
| `*.test.ts` | Offline checks, part of `pnpm test:unit`; a stub provider replaces OpenAI |

## Safety rules

- A stage runs only when `LLM_EVAL_LIVE` equals its name (`smoke`, `pilot`, or `full`). Any other value, including `true`, runs nothing. Set it in the shell for one run, not in `.env`.
- `pnpm test` and a bare `vitest` never include the live files (separate config).
- Every call is accounted:
  - **before the call**, the price must be known (unknown model = abort before any call), and the worst-case estimate must fit the remaining cap. The estimate is input at 2 characters per token (including the JSON schema) plus `max_output_tokens`, all priced as uncached input.
  - **after the call**, the provider-reported usage is charged. If usage is unknown (timeout, network error), the worst-case estimate is charged and the stage stops.
  - The stage also stops if an actual cost exceeds its estimate, and on `insufficient_quota`, authentication, or bad-request errors.
- `maxRetries: 0`, `store: false`, per-prompt `max_output_tokens` and timeouts. Only golden-set words are sent.
- **The cap is a conservative application-level estimate, not a hard spending limit.** It depends on the price table in `server/core/modules/llm/infrastructure/model-prices.ts` (verify it before a run) and on the provider honoring `max_output_tokens`. The hard limit is the provider-side project budget (DECISIONS OD-09), which must be configured first.

| Stage | Calls | Cap (max; `LLM_EVAL_CAP_USD` can only lower it) |
| --- | --- | --- |
| smoke | 3: lookup `psa` (ru), short translation `pies` (uk), details `pies` (ru) | $0.25 |
| pilot | 12 words × each fast model, plus 2 details × each detail model | $1.00 |
| full | all words × 2 repetitions × fast models, split variant, uk/en translations, 10 details × detail models | $3.00 (requires owner approval after the pilot) |

## Running a stage (owner only)

PowerShell, smoke test:

```powershell
$env:OPENAI_API_KEY = '<your key>'            # or keep it in your local .env
$env:LLM_EVAL_FAST_MODELS = 'gpt-6-luna'      # comma-separated, must be in the price table
$env:LLM_EVAL_DETAIL_MODELS = 'gpt-6.1-terra'
$env:LLM_EVAL_LIVE = 'smoke'
pnpm eval:smoke
Remove-Item Env:LLM_EVAL_LIVE
```

The same for `pilot` / `full` with `pnpm eval:pilot` / `pnpm eval:full` and the matching `LLM_EVAL_LIVE` value.
Optional: `LLM_EVAL_CAP_USD` (lower cap), `LLM_EVAL_OUTPUT_DIR` (default `eval-results`).

Without `LLM_EVAL_LIVE` set to the stage name, the command reports the test as skipped and makes no calls.
