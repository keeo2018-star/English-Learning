# Discover

The current continuous-batch upgrade is documented in [CONTINUOUS_DISCOVER.md](CONTINUOUS_DISCOVER.md). Existing projects should apply only the new upgrade after its read-only preflight; do not rerun the original migration. The daily-set behavior below describes the original v1 baseline and is superseded once the continuous migration is active.

Discover adds an optional 16-question vocabulary check and up to ten daily learning cards. It reuses the existing Supabase account, Library writes and shared pronunciation controller. Existing Review scheduling and events are unchanged. Home offers Add (lime), Discover (blue) and Random Review (orange); Library remains available through the learning controls and a secondary home link.

## Database rollout

1. Run `supabase/discover_preflight.sql` in the existing project's SQL Editor and review the full JSON result. Production preflight received on 2026-11-07 matches the expected words/auth/review-events columns and owner policies, with no Discover naming collisions. The existing nonempty meaning constraint is compatible; Discover saves nonempty dictionary meanings.
2. Run **only** `supabase/migrations/20261107_discover.sql` in full. Do not rerun schema.sql or unrelated historical migrations. The migration checks prerequisites before changes, runs in a transaction, creates five Discover tables and authenticated RPCs, enables owner-select RLS, and restricts writes to the authenticated action RPC. Internal helpers cannot be called by clients.
3. Confirm successful execution, then test `/discover` while signed in. A missing-schema setup state is intentional until the migration is deployed. Source-code deployment alone does not activate the database feature.

Existing vocabulary, accounts, review state, schedules, events, policies and triggers are retained. A nonunique normalized-word lookup index and insert-only duplicate guard prevent new duplicate Library inserts, including races with manual Add. Existing duplicates are preserved. The guard does not run on updates to review progress. Lock acquisition times out after three seconds rather than waiting indefinitely; failure rolls back the whole migration. Correctly marked migration objects can be rerun without reseeding or resetting progress; unrelated naming collisions abort.

There is no database admin credential in this workspace. SQL execution and production activation require the project owner's confirmation; local PostgreSQL tests do not establish that production has applied the migration.

## Data and recommendations

The initial collection has 749 selected word senses. See `src/data/discover/SOURCES.md`, permission notices, source hashes and `/discover/sources` for CEFR-J, Octanove, Princeton WordNet and Chinese Open WordNet attribution and license conditions. Definitions/examples are licensed lexical records, not AI-generated. Word-level bands are reference heuristics, not certified sense difficulty. Tagged WordNet counts are an attestation/usefulness signal, not a general corpus frequency ranking. Advanced coverage is limited; eligible nearby bands fill shortfalls.

The check begins at B1, uses real same-POS Chinese distractors with overlapping meanings/related senses excluded, includes usage context, avoids repeated questions, and changes bands after two consistent responses. Results are explicitly estimated vocabulary recommendation levels, not overall English proficiency or vocabulary-size measurements. Retakes retain history and change future recommendations gradually.

Daily sets are stored once per user/local date with a unique key and per-user transactional lock. Selection aims for eight current-band and two above-band words, excluding Library entries, recently recognised items and recent recommendations where possible. A small remaining bank yields fewer cards. A single recognition excludes a word for 30 days; repeated recognition extends this to 180 days, rather than permanent mastery. New evidence across twenty Discover responses, or ten real reviews across at least five relevant saved items, can adjust difficulty by at most a quarter-band when a new day is generated. Consumed evidence does not repeatedly move difficulty on later days. Saving is interest, never a failed recall.

Reveal does not advance progress. Know does not add a Library item or review event. Save inserts an ordinary neutral Library entry using existing addition tracking; an existing normalized word is reused without overwriting its custom meaning or progress. Account/session/set IDs and position validation make retries idempotent. Browser state is not the source of truth: refresh, foreground sync and another device recover the persisted account state. An already-generated day's set remains stable.

## Reproduction and validation

Bank generation: `python3 scripts/build-discover-bank.py /path/to/downloaded/source/files` (source inputs documented in the script); assemble SQL: `python3 scripts/assemble-discover-sql.py scripts/discover-sql`. Commit both generated artifacts when their sources change.

Run `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, and Playwright tests. `tests/unit/discover-db.mjs` executes the assembled migration twice against PostgreSQL-compatible PGlite with existing learning data, checking preservation, atomic/idempotent writes, adaptive checks, local dates, fresh evidence, limited collections, RLS and collision rollback. Browser fixtures test UI and cross-device state transitions, while the database suite checks real SQL behavior. iPhone WebKit uses `playwright.iphone.config.ts`; physical installed iOS behavior still requires device validation.

Validated on 2026-11-07: lint, typecheck and production build passed; 51 unit/database tests passed; full Chromium regression had 154 passes and five expected skips (three unconfigured-demo paths and two confirmed-account tests without credentials). Discover and home passed 13 combined checks in each of Chromium and iPhone WebKit; a supplementary shared-audio/cancellation check also passed in both engines. Production database activation must still be confirmed separately after the owner executes the final SQL.
