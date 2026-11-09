# Product Requirements Document: Polish Learning App (MVP)

Status: Approved for implementation (revision 3)
Last updated: 2026-11-09

Related documents: [ARCHITECTURE.md](ARCHITECTURE.md), [DECISIONS.md](DECISIONS.md), [../AGENTS.md](../AGENTS.md)

Approved visual design: [Figma Make prototype](https://www.figma.com/make/VBOPkf1LIvnR9nnCJZAEA7/Polish-Vocabulary-Learning-App). It is the visual specification for UI screens; where it differs from this document (for example audio buttons or the landing page), this document wins (D-22, D-30).

---

## 1. Problem

Learners of Polish run into two problems:

1. **Inflection.** Polish nouns, adjectives, and verbs have many forms. A learner who meets `psa`, `poszłam`, or `najlepszymi` in a text often cannot find the dictionary form. A plain dictionary lookup fails, and generic translators give a translation without telling you what form you're looking at.
2. **Retention.** Words that get looked up are forgotten unless they are reviewed systematically. Keeping a separate flashcard app (such as Anki) in sync with lookups takes effort, so most learners give up on it.

The app combines lookup, morphology-aware saving, and spaced repetition in one place. Explanations come in the learner's own language.

## 2. Goals and non-goals

### Goals (MVP)

- G1. Look up any Polish word, inflected form, or short expression and get a short translation in under a few seconds.
- G2. Get detailed meanings, usage examples, and grammatical forms on demand.
- G3. Save the dictionary form (lemma), the specific inflected form, or both, with an explicit choice when the analysis is ambiguous.
- G4. **Learn saved vocabulary through a daily FSRS-scheduled flashcard review.** This is the primary learning experience. Every saved item becomes a scheduled card.
- G5. See review progress and learning statistics.
- G6. Keep LLM costs predictable through server-side caching, usage tracking, and conservative per-user and global limits.

### Non-goals (MVP)

- Payments, subscriptions, or monetization.
- Social features (sharing, leaderboards, friends, public decks).
- Courses or structured lessons. The app is a lookup + vocabulary + review tool, not a curriculum.
- Unscheduled "free practice" modes (see section 8).
- Learning languages other than Polish.

## 3. Users and personas

The MVP serves **a small group of invited users** (fewer than 20). Sign-up is restricted by an email allowlist.

- **Primary persona: an adult self-learner living in or moving to Poland.** Native language is Russian, Ukrainian, or English, and the level is A2 to B2. They read Polish news, messages, and official letters, meet unknown inflected forms, and want to save and review them on their phone or laptop.
- **Secondary persona: the developer/operator.** Uses the app, watches LLM usage and costs, and manages the allowlist (through config or SQL in the MVP, with no admin UI).

## 4. Language model of the product

- **Learning language:** always Polish (`pl`).
- **Translation language:** per-user setting, one of Russian (`ru`, default), English (`en`), or Ukrainian (`uk`). Lookups, short translations, meanings, and grammatical explanations are produced in this language.
- **UI locale:** a separate per-user setting. The MVP ships only English (`en`), but the setting exists and UI strings are kept in one place so that localization can be added later without a schema change.

### 4.1 Saved translations are snapshots

When a word is saved, its short translation is **copied into the vocabulary item** together with the language it is in. From then on:

- The card's answer side always shows the item's own stored translation (plus note and grammar info), never a live lookup result. Improvements or corrections to the shared dictionary cache do **not** change existing cards.
- The app **never changes an existing item's translation automatically**: not when the translation language setting changes, not when cached data is corrected, not when prompts or models change.
- A translation the user has edited is marked as **edited**. It is only replaced if the user explicitly confirms that.

### 4.2 Switching the translation language

When the user changes the translation language (for example from Russian to Ukrainian):

| Affected | Behavior |
| --- | --- |
| New lookups, details, and new saves | Use the new language. |
| Existing vocabulary items | Unchanged. They keep their stored translation and language. |
| Existing cards | Unchanged answer, unchanged FSRS state. If an item's language differs from the current setting, the card shows a small language badge (e.g. `RU`). |
| Details page for a saved word | Shown in the current language (details are reference material, not the card answer). |
| Converting an item | Per item, on request: "Translate into <current language>" (US-07). |

Bulk re-translation of the whole vocabulary and keeping several translations per item are deferred.

## 5. User stories and acceptance criteria

Story IDs are stable references for issues, tests, and commits. Acceptance criteria are written as Given/When/Then. Deferred stories keep their ID and are marked **Deferred**.

### Authentication and settings

**US-01. Sign in with Google**
As a learner, I want to sign in with my Google account so that I don't need another password.

- Given I am signed out, when I open any app page, then I am redirected to the sign-in page.
- Given my email is on the allowlist, when I complete Google sign-in, then an account is created (first time) or reused (returning user), and I land on the **dashboard**. The app never redirects automatically to the review page, even when cards are due; the dashboard links to it ([DECISIONS.md](DECISIONS.md) D-18).
- Given my email is not on the allowlist, when I complete Google sign-in, then no account or session is created and I see a "not invited" message.
- Given I was removed from the allowlist after signing up, when I try to sign in again, then sign-in is refused with the same "not invited" message, and my existing sessions no longer work once the operator has revoked them.
- Given I am signed in, when I click "Sign out", then my session is revoked on the server and I am returned to the sign-in page.
- Given I sign in on two devices, then both sessions work independently, and signing out on one does not sign out the other.

**US-02. Configure my settings**
As a learner, I want to set my translation language and review preferences.

- Given I am a new user, then my translation language defaults to Russian, UI locale to English, daily new-card limit to 20, desired retention to 0.90, and timezone to the browser's timezone at first sign-in (fallback `Europe/Warsaw`).
- When I change the translation language, then subsequent lookups, details, and new saves use the new language, and **existing vocabulary items and cards are unchanged** (section 4.2). The settings page states this next to the selector.
- When I set the daily new-card limit (0 to 200) or desired retention (0.70 to 0.97), then values outside the range are rejected with a validation message.
- The settings page shows the UI locale selector with English as the only option in the MVP.

### Search and dictionary

**US-03. Search for a word or expression**
As a learner, I want to type a Polish word, inflected form, or short expression and see a short translation.

- Given I type `pies`, when I submit, then I see the lemma `pies`, part of speech (noun), and a short translation in my translation language (for example, `собака` for Russian).
- Input is trimmed, its whitespace is collapsed, and it is limited to 100 characters. Longer input is rejected with a message before any LLM call.
- Input that is clearly not Polish, or is empty, gets a helpful "no result" state instead of an error.
- Polish diacritics are preserved. Input without diacritics (for example `zolw`) may get a "did you mean `żółw`?" suggestion, but the app never silently replaces the user's input.
- Given the same query was answered before (by anyone) for the same translation language, then the result is served from the cache without a new LLM call and without using my quota.
- On a phone-sized screen, the search box and result are usable without horizontal scrolling.

**US-04. Look up an inflected form**
As a learner, I want to see which dictionary word an inflected form belongs to.

- Given I search `psa`, then the result shows the analysis: lemma `pies`, form `psa`, with grammatical tags (for example, genitive/accusative singular, masculine animate).
- Given a form is ambiguous (for example `mam`: `mieć` 1st person singular present, or `mama` genitive plural), then **all** plausible analyses are listed, each with lemma, part of speech, tags, and a short translation of the lemma.
- A word with several unrelated meanings but the same grammar (for example `zamek`: castle, lock, zipper) is shown as **one** entry whose short translation lists the main meanings. The meanings are separated in Details.
- Each analysis shows a source indicator. In the MVP that is always "AI-generated". This tells the user it may be wrong.
- Given I think an analysis is wrong, then I can report it with a single "report a problem" action, which flags the cached result for review.

**US-05. Request details**
As a learner, I want detailed meanings, usage examples, and grammatical forms for a word.

- Given a search result or a saved word, when I click "Details", then I see:
  - numbered meanings, each with a translation and, where relevant, a short note on register (formal, colloquial, vulgar)
  - 2 to 5 usage examples per main meaning, in Polish with a translation
  - grammatical forms: a declension table for nouns, adjectives, and pronouns, or the key conjugation forms for verbs (present/future, past by gender, imperative, aspect partner if any)
- Details are produced on demand (not with every search), in my **current** translation language, and cached per word + translation language.
- Generated content is labeled as AI-generated.
- If my daily details limit is reached and the details are not cached, then I see a quota message (US-12) instead of an error.

### Vocabulary

**US-06. Save a lemma, a form, or both**
As a learner, I want to choose exactly what goes into my vocabulary.

- Given a result for an inflected form (for example `psa`), then I can choose "Save `pies` (dictionary form)", "Save `psa` (this form)", or "Save both".
- Given multiple analyses, then I first pick the intended analysis and then choose what to save.
- Given the searched word is itself the lemma (for example `pies`), then only "Save" is offered.
- Before saving, I can edit the short translation (for example, narrow `zamek` to just "castle"). If I edit it here, it is stored as an edited translation.
- Saving the same lemma (or the same form of the same lemma) twice does not create a duplicate. Instead the app says "already in your vocabulary" and links to the existing item. This holds even if I double-click or save from two tabs at once.
- A saved item records: the lemma, the form (if any), grammatical tags, the translation snapshot and its language, whether the translation was edited, and the original query.
- Saving creates one scheduled review card per item, available immediately as a new card in today's review (subject to the daily new-card limit).

**US-07. Manage my vocabulary**
As a learner, I want to browse and edit my saved words.

- I can list my vocabulary with search (by Polish text or translation), a filter (lemma/form, part of speech, archived, translation language), and sorting (date added, due date, alphabetical).
- I can edit the translation and add a free-text note (up to 1000 characters). Editing the translation marks it as edited and does **not** reset the card's review progress.
- Given an item whose translation language differs from my current setting, I can choose "Translate into <current language>". The app shows the proposed translation first, and I confirm or cancel.
  - If the current translation is marked as edited, the confirmation explicitly warns that my edited text will be replaced.
  - After confirming, the item's translation and language are updated, the translation is marked as generated, and the card keeps its review progress (the meaning is the same).
  - The action uses my lookup quota only if the translation is not already cached.
- I can archive an item (US-14).
- I can delete an item permanently after a confirmation. This deletes its card and review history.
- I can only ever see and change my own vocabulary.

**US-14. Pause a word from review (archive)**
As a learner, I want to stop reviewing a word without losing its history.

- When I archive an item, its card is suspended: it no longer appears in the review queue or in "due" counts, and the item is hidden from the default vocabulary list (visible with the "archived" filter).
- When I unarchive it, the card resumes with its previous FSRS state. If its due date has passed, it is simply due now; no review history is created or changed by archiving.

### Review (primary learning experience)

**US-08. Daily FSRS review**
As a learner, I want a daily review session scheduled by FSRS, so I learn my saved words with the least effort.

- Each vocabulary item has exactly one card in the MVP: the Polish word or form on the front, the stored translation on the back. Reverse cards are an open decision (see [DECISIONS.md](DECISIONS.md) OD-05).
- **Card content:**
  - Front: the Polish lemma or form. For a saved form, the lemma is shown as a small hint (`psa` → from `pies`).
  - Back: the item's stored translation, grammatical tags for forms, my note, and a language badge if the item's language differs from my current setting. Back content always comes from the item (section 4.1).
- **Queue contents and order**, computed at request time:
  1. cards in learning or relearning whose due time has passed (short intra-day steps)
  2. review cards that are due (due time ≤ now), oldest due first
  3. new cards up to the remaining daily new-card limit, in the order they were added
- The new-card limit counts cards introduced since the start of my **local** day (my timezone setting).
- I reveal the answer, then rate the card **Again, Hard, Good, or Easy**. Each button shows the next interval the card would get (for example "10m", "1d", "4d").
- After rating, FSRS computes the next state and due time using my desired retention. The card state is saved and a review log entry is appended. A card rated Again or in a learning step comes back later in the same session when its short interval has passed.
- A double tap, a network retry, or the same rating submitted from two tabs does not record two reviews.
- The session works with one hand on a phone. On desktop, keyboard shortcuts work (Space to reveal, 1 to 4 to rate).
- When nothing is due, I see "All done for now", the time of my next due card, and a link to search.
- The dashboard and the review page show today's counts: due, learning, and new remaining.

**US-09. Free practice without scheduling** — **Deferred**
Flipping through vocabulary without affecting FSRS (browse/shuffle mode). Deferred to keep the MVP focused on scheduled review. See section 8.

### Progress and statistics

**US-10. See my learning statistics**
As a learner, I want to see my progress.

- The dashboard is the default page after sign-in (US-01). It shows:
  - cards due today and tomorrow
  - new cards remaining today
  - total vocabulary size by card state (new, learning, review, relearning) and archived count
  - reviews per day for the last 30 days
  - the current streak (consecutive local days with at least one review)
  - true retention over the last 30 days (share of reviews of review-state cards not rated Again)
- Statistics are computed from my own review logs only.
- The page is readable on a phone.

**US-11. See review history for a word**
As a learner, I want to see how a specific word has been going.

- The vocabulary item page shows its card state, next due date, number of reviews and lapses, and the list of past reviews (date and rating).

### LLM usage and limits

**US-12. Understand LLM limits**
As a learner, I want clear feedback when I hit a usage limit.

- Each user has separate daily limits for **uncached** LLM work. The defaults are conservative and configurable:
  - 30 uncached lookups per day (search and "translate into current language")
  - 10 uncached details per day
  - a daily token budget (default 50,000 tokens)
- Cached results never count against the limits.
- Daily limits reset at **00:00 UTC**. The message shows the reset time converted to my local time.
- When a limit is reached, the affected uncached feature is refused with a clear message. Cached content, vocabulary, and review keep working.
- If the global daily or monthly budget is exhausted, or the operator has disabled LLM features, all uncached LLM features are unavailable for everyone with a "temporarily unavailable" message. The rest of the app keeps working.
- The settings page shows today's usage (lookups and details used / limit).

**US-13. Operator visibility into LLM usage** (operator-facing, no UI in MVP)

- Every LLM request attempt (including cache hits, deduplicated requests, refusals, failures, and timeouts) is recorded with the user, feature, model, token counts, estimated cost, latency, and status.
- The operator can answer "cost per user per day", "cache hit rate", and "estimated spend this month" with documented SQL queries.
- The operator understands that the app's budget is an **estimate-based soft limit**, not a provider-side spending cap (see [DECISIONS.md](DECISIONS.md) OD-09).

## 6. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Responsiveness | Mobile-first layout from 360 px wide up to desktop. All features usable on touch devices. |
| Latency | Cached lookup: p95 under 300 ms server time. Uncached short translation: p95 under 4 s. Uncached details: p95 under 15 s, with a loading state. Review answer: p95 under 200 ms. Next card shown without a full page reload. |
| Availability | Best effort (single instance). LLM outages must not block review or vocabulary features. |
| Accessibility | Keyboard-operable, visible focus, sufficient contrast, labelled controls (WCAG 2.2 AA as a target, not certified). Polish text marked with `lang="pl"`. |
| Security & privacy | Google OAuth only; server-side sessions; all data scoped per user; LLM keys never reach the browser; no third-party analytics in the MVP. |
| Cost | LLM spend bounded in the app by per-user daily limits and global daily/monthly budgets (soft, estimate-based), backed by provider-side billing controls configured by the operator. |
| Data integrity | Saved translations and review history never change without a user action. Duplicate saves and duplicate review submissions are prevented by the database, not only by the UI. |
| Data | Users can delete vocabulary items. Full account deletion is done by the operator on request in the MVP. |

## 7. MVP scope

In scope:

- Google sign-in with an email allowlist (enforced for new and returning users); sign out; multiple sessions.
- User settings: translation language (ru/en/uk), UI locale (en only), daily new-card limit, desired retention, timezone.
- Search with short translation; inflected-form analysis with multiple analyses; details (meanings, examples, forms).
- Save lemma / form / both with an editable translation snapshot; vocabulary list, edit, per-item "translate into current language", archive (suspend), delete.
- **FSRS-scheduled flashcard review as the single study mode.**
- Statistics dashboard and per-item history.
- Server-side LLM gateway with database cache, request deduplication, usage tracking, per-user and global limits.
- Problem reporting on AI-generated results (stored flag only).

## 8. Explicitly deferred (not in MVP)

| Feature | Reason for deferring |
| --- | --- |
| Free practice / browse-and-flip without scheduling (US-09) | Keeps the MVP focused on FSRS review; avoids a second study mode with separate UX and rules. |
| Payments, subscriptions | No monetization in MVP. |
| Social features (sharing, public decks, leaderboards) | Out of scope for a small invited group. |
| Audio / text-to-speech / pronunciation | Extra provider, cost, and storage; valuable later. The MVP renders **no** audio or pronunciation controls (no placeholder or disabled buttons), even where the approved design shows them (D-20). |
| PWA / offline review | Needs a sync and conflict model; review is online-only in MVP. |
| Native mobile apps | The responsive web app covers mobile. |
| Full UI internationalization | Settings and string structure are prepared, but only English ships. |
| Dictionary-based morphology (PoliMorf/SGJP import) | Designed behind `MorphologyProvider`; the MVP uses the LLM provider. |
| Per-user FSRS parameter optimization | Needs enough review history; default parameters are used for now. |
| Undo last rating | Requires reversing card state from logs; can be added on top of the append-only log later. |
| Bulk re-translation of vocabulary; several translations per item | Per-item conversion covers the MVP need without risking silent changes. |
| Anki import/export, CSV export | Useful but not core. |
| Decks, tags, folders | A single vocabulary per user is enough for MVP. |
| Reverse cards (translation to Polish), cloze/sentence cards | Card type model allows them later; see OD-05. |
| Admin UI (allowlist, usage dashboards, report triage) | The operator uses config and SQL in MVP. |
| Email/password or other OAuth providers | Google only; account linking is disabled. |
| Self-service account deletion and data export | The operator handles requests manually. |
| Sentence/text mining (paste a text, extract unknown words) | Strong candidate for post-MVP. |

## 9. Success criteria for the MVP

- Each invited user can sign in, look up words, save them, and review daily without operator help.
- Active users complete their due reviews on at least 70% of the days on which they have due cards (measured over the first four weeks).
- Over two weeks of use, at least 80% of inflected-form lookups show the correct lemma among the analyses (checked by spot review of reported and random samples).
- The LLM cache hit rate for short translations exceeds 30% after the first two weeks.
- Estimated LLM spend stays within the configured app budgets, and actual provider spend stays within the provider-side limit, with no manual intervention.
