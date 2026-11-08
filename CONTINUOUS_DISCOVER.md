# Continuous Discover and naturally sized Review cards

Review retains oversized centered words and colored cards. Its content uses natural height with 24px phone / 32px desktop padding, a 16px word-to-speaker gap and a 32px speaker-to-reveal gap. Hidden answers reserve no space; revealed meanings, examples and recall actions grow the card naturally. Random Review stays orange. Discover's other card styles and unrelated pages are retained.

## Database rollout

This upgrade needs `supabase/migrations/20261108_continuous_discover.sql`. Do not replace or rerun the original Discover migration on an existing production project.

1. Run **`supabase/continuous_discover_preflight.sql`** in the current project's SQL Editor and return the full `noted_continuous_discover_preflight` JSON for compatibility review. This is a read-only transaction ending in rollback.
2. After those results have been checked, execute **the whole `supabase/migrations/20261108_continuous_discover.sql`** in the same project. It requires the original Discover and learning-activity schemas. No admin database connection is available in this workspace, so production activation requires manual SQL execution and confirmation.
3. Verify a signed-in account can finish its existing batch, start another, and refresh on a second device. A `discover_version: 2` RPC result enables the new-batch action. Before the migration is active, the frontend retains the existing batch and displays an update-required notice; it does not pretend that continuous mode works.

The migration is transactional and additive: it creates `discover_batches`, copies all old daily-set rows with their existing IDs and responses, and adds a nullable current-batch pointer to the existing profile. The original table, its per-date uniqueness, vocabulary, user accounts, review events, schedules and assessment history are retained. A legacy-write mirror preserves old RPC transactions finishing during rollout without overwriting newer responses. Schema/function markers and required types are checked before changes; unfamiliar collisions abort. New tables have explicit RLS and owner-only SELECT; clients write only through the authenticated RPC. Private helpers and the mirror trigger function are not executable by clients. Existing Words permissions and owner policies remain unchanged.

The insert-only Library duplicate guard and an additive lookup index use matching NFKC/lowercase/whitespace normalization, including leading/trailing tabs. Existing duplicates and custom meanings are preserved; an already-saved matching item is reused without resetting its schedule. Migration reruns never overwrite current batch responses or reset history. Lock acquisition times out after three seconds, with full rollback on failure.

## Batch behavior

A batch contains up to ten eligible items. There is no day boundary or daily quota. Legacy `daily` RPC aliases and the JSON key remain only for backward compatibility; batch selection is no longer tied to a date. Refresh, timezone changes, foreground sync and another device return the same active batch, including unfinished progress. Completing a batch shows Nice work, the explored count, Saved / Already known totals and Discover 10 more. The completed predecessor ID makes repeated next-batch requests idempotent; another device or a lost response cannot skip a new batch. Unfinished batches cannot be abandoned through this action.

Selection retains the existing 8 near-level / 2 above-level heuristic, adjacent-band fallback and gradual adjustment from fresh evidence. Response timestamps, not batch creation dates, determine freshness when an old unfinished batch is resumed. The candidate pool excludes normalized Library words, every previously known word and every item assigned to any historical batch, including old daily sets. It also deduplicates normalized catalog spellings within a batch. There is no cooldown fallback that silently repeats words. An exhausted collection shows an explicit message; fewer than ten remaining items produce an honestly smaller final batch. No automatic revisit mode is added.

Know records one response without a Library item or review event. Save uses the existing Words model, real meaning/example/content type, the shared word-based pronunciation controller, and neutral initial scheduling. It advances only after the transaction commits. Errors preserve the revealed word and retry the same operation. Batch progress advances only on confirmed responses. Discover choices do not fabricate completed Review activity.

## Tests and reproduction

`python3 scripts/assemble-continuous-discover.py` assembles the reviewed schema, pool and RPC source files into the migration. The original migration remains immutable.

`tests/unit/continuous-discover-db.mjs` runs the upgrade twice against PostgreSQL-compatible PGlite containing the original production schema and legacy progress. It covers preservation, legacy in-flight writes, repeated batches on one date, failed-save rollback, idempotent next actions, normalized exclusions, permanent history, words/expressions, preserved custom schedules, finite-pool exhaustion, RLS and collision rollback. Browser fixtures independently exercise the UI, multiple batches, summaries, retries, refresh/device consistency, upgrade-required behavior and exhaustion. `tests/review-spacing.spec.ts` measures hidden/revealed composition at phone, tablet and desktop widths and exercises recall actions.

Production database activation must be confirmed independently of local tests and Vercel source deployment.

Validation on 2026-11-08: build, ESLint and TypeScript passed; 62 unit/database tests passed. Full Chromium regression passed 172 tests with five expected account/demo skips. The iPhone WebKit batch/audio/control/spacing checks covered 37 cases; the affected spacing cases were rerun successfully with steady-state, CSS-pixel measurements to avoid entrance-animation rounding. Mobile hidden/revealed Review cards and Discover completion were visually inspected. Production migration activation is not inferred from these tests and still requires the preflight review and manual SQL confirmation.
