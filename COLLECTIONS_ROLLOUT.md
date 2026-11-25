# Collections rollout: phase 1, not full multilingual availability

The current release remains English learning. The foundation migration adds
language metadata and owner-scoped Collections, associates existing records with
English/Chinese explanations, and preserves existing primary keys, contents,
review states, timestamps, Discover histories and voice paths. Existing APIs and
offline event IDs remain compatible. Unknown conflicting schema objects cause
atomic failure. No multilingual controls are enabled by this migration: the
snapshot explicitly reports `multilingual_enabled: false` until all clients and
RPCs are ready.

## Production prerequisites

The owner supplied the read-only preflight on 25 November 2026. Existing tables,
owner RLS, v2 Discover, voice-v1 and offline-review-v1 match this repository.
There is no Collections schema or Gemini cache table in that result. The current
meaning constraint still requires a nonempty meaning; this migration leaves it
unchanged. English and Chinese explanation languages are a catalogue capability,
not an assumption about the user's input language. Chinese general proficiency
levels are not equated with CEFR/HSK. Legacy English Discover retains its existing
assessment level; the new metadata is initially `unspecified` until bridged.

## Run order (existing production Supabase SQL Editor)

1. First run `supabase/collections_data_audit.sql`; save its nine count/hash rows.
   Use a short window without adding, editing or reviewing so normal user writes
   do not change the comparison. It outputs no vocabulary contents.
2. Run `supabase/migrations/20261125_collections_foundation.sql` as a whole.
   Do not rerun the original schema or Discover seed.
3. Run the same audit again. Every original-data hash and row count should match.
4. Run `supabase/collections_verify.sql` and send its JSON plus both audit results.
   Missing defaults, unassigned entries/events and wrong owners must be zero;
   both new tables must have RLS true, authenticated RPC access true, anonymous
   access false, and marker `noted-collections-v1`. Every `collection_links`
   unassigned/wrong_owner count, mismatched_voice_items and exposed_private_helpers
   must be zero. Reload Profile after verification to fetch the new metadata.

The SQL uses a transaction and fails on incompatible prerequisites. On an error,
retain the error text; no partial change commits. Do not delete/reset data to fix
it. On a post-check mismatch, keep the existing English frontend and disable
multilingual rollout, inspect legitimate concurrent writes and compare the saved
aggregate audit. Do not drop the new columns or tables as a rollback. The guarded
migration can be rerun without replacing existing Collection IDs.

## Remaining compatible phases

Phase 2 must wire Profile management, shared active Collection, per-Collection Add
and Voice drafts, scoped Library/duplicates and independent Review sessions. Old
local English sessions/queues must move logically to the default Collection,
without dropping pending event IDs or changing owner authentication.

Phase 3 must scope the English Discover RPCs before any second Collection is
exposed. Existing profiles/known keys remain intact; new languages need separate
state, not replacement user primary keys. New-language Discover stays unavailable
until curated quality and persistence are tested. Dictionary, TTS, bilingual
translation and Gemini cache keys must include target/explanation context, and
calendar RPC filtering must use actual Collection-tagged events. No English-only
provider may handle French/Spanish/Chinese entries by default.

The reusable model/switcher is prepared but deliberately not mounted in learning
screens. Database readiness alone does not mean these phases are implemented.
Physical iPhone testing and full multilingual production verification remain
outstanding. This document must not be interpreted as feature completion.

## Validation of this compatible release

- Local PostgreSQL (PGlite) executes the real activity, continuous Discover,
  Voice Notes and offline-review migrations, seeds existing records, applies the
  Collections migration twice, and compares every original field plus the audit
  hashes. Voice file paths and private Storage metadata/bucket settings survive.
- Existing Add/Discover/offline-review RPC calls still work; retried review event
  IDs count once. Cross-owner writes, within-Collection duplicates, moving old
  entries and unmarked function collisions are rejected.
- 132 unit tests pass. Chromium and WebKit browser regressions cover the internal
  titles, missing-schema fallback, read-only Profile metadata, existing Chinese
  composition, navigation and offline flows. Layout widths include 320, 375,
  390, 430, 768 and 1440 pixels. These are browser simulations, not a physical
  iPhone microphone/keyboard test.
- Lint, typecheck and production build pass. Production schema deployment and
  before/after data audit remain pending owner-supplied SQL results.
