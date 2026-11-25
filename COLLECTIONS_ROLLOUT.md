# Collections rollout and compact learning UI

## Verified production foundation

The owner supplied the real schema preflight, successful foundation post-check and
both data audits on 25 November 2026. All nine original-field fingerprints and
counts matched: 441 words, 1,419 review events, 446 addition events, two Discover
profiles, two assessments, 16 daily sets, 16 batches, 58 known entries and one
Voice Notes metadata row. Collection ownership/unassigned counts were zero, both
new tables had RLS, anonymous RPC access was false, authenticated access true and
private helpers remained inaccessible. This confirms the foundation; it does not
establish deployment of the second-stage functions below.

Original IDs, manual meanings/examples, schedules, timestamps, histories, voice
paths and account relationships remain intact. The original English/Chinese
Collection retains old English sessions and cached vocabulary. Its new level is
initially unspecified; its prior Discover assessment is preserved. Choosing a
level explicitly updates recommendation difficulty, without resetting history.

## Prepared client functionality

- Profile creates owner-scoped English, French, Spanish or Simplified Chinese
  contexts, with English/Chinese explanations, separate levels, preferences and
  atomic ordering. Target and explanation define the Collection's identity;
  existing contexts are not reassigned or vocabulary silently retranslated.
- A compact, sticky header and lavender menu share the same active Collection on
  Add, Library, Review and Discover. One Collection hides the menu. Profile order
  prioritises favourites. Selecting the current Collection preserves its queue.
- Add restores separate IndexedDB drafts, including unsaved audio and stable save
  attempt IDs. IME composition, user-owned meanings and stale-response checks are
  retained. The same spelling can exist in different Collections.
- Library filters by active Collection; All Languages is a separate browsing
  scope, with language labels. Search/type/page state persists independently.
  Library retains Review as its global destination and offers a return action.
- Review keeps separate random queues/completions and unchanged scheduling.
  Offline snapshots/outboxes retain the real owner and item/Collection IDs;
  switching never replaces another Collection's snapshot or pending rating.
- Shared pronunciation uses English dictionary audio/TTS and appropriate
  fr-FR/es-ES/zh-CN TTS elsewhere. Personal recordings remain manual and use the
  same playback coordinator.
- Global navigation has exactly five consistent icons. Its selected icon has a
  black circle and white artwork; labels remain readable below.

Missing language metadata blocks context-sensitive Review rather than guessing
that mixed-language records are English. Clients without the foundation retain
legacy English behavior. New controls and compact headers remain gated by the
server snapshot until Phase 2 installation is verified and its separate activation is approved. Both `multilingual_enabled` and `learning_ready` must be true; the old single-flag snapshot/cache cannot enable it.

## Providers and deliberately unavailable capabilities

MyMemory is reused for whole-segment translation, with bounded input, one-hour
context-specific caches and duplicate-request suppression. It can exhaust its
free quota or return no useful translation; manual target-language saving remains
available. Chinese script and clear Latin phrase markers assist input detection;
short Latin cognates are ambiguous, so the compact Input language control allows
explicit correction. This is not a complete language-identification model.

The existing English dictionary supplies English/Chinese definitions and examples.
English explanations hide Chinese-only content. No French/Spanish/Chinese entry
is sent to an English-only reference endpoint. Other-language Reference currently
shows saved meanings/examples and pronunciation, with an accurate unavailable
message for verified dictionary content. Pinyin, noun gender and wider reference
providers are not yet implemented.

Gemini remains the existing optional, server-side English/Chinese workflow, with
its schema, consent and free-tier checks. The earlier production preflight had no
AI cache table; this release does not install it, configure billing or claim
multilingual AI explanations are available. Existing user text/voice/context is
not submitted to AI in the background.

Discover supports the original English/Chinese Collection only. Its existing
algorithm, profile/batch keys and response IDs remain. Second-stage SQL scopes
its vocabulary exclusions, saved-item lookup and review adaptation to English,
so another language cannot contaminate it. Other contexts show an unavailable
message. Curated recommendations/history for other languages remain a later
phase, not arbitrary generated recommendations.

## Phase 2 operator runbook — revised after f996b43

Production Phase 1 is verified. Production Phase 2 is **not established** by the
Phase 1 results, an empty SQL success message or a Vercel deployment. No production
SQL is executed by this repository's tests or deployment. Do not rerun Phase 1,
`schema.sql`, old Discover seed scripts or the f996b43 copy of Phase 2 SQL.

The old `20261125_collections_learning.sql` enabled the feature during installation.
**Replace that old copy with the current file of the same name.** This revision
installs with both feature flags false, even if an older version was previously
installed. It never resets saved learning data. Activation is now a separate,
manual, guarded SQL file. There are no additional foundation migrations, paid API
requirements or Storage bucket/path changes in Phase 2.

### Step 1 — read-only checks; run these first and return the results

1. Run `supabase/collections_learning_preflight.sql` in the existing production
   Supabase project's SQL Editor. Send the entire
   `noted_collections_learning_preflight` JSON. It reads schema catalogs and
   permissions without calling application RPCs or changing data. All column
   checks/patch anchors must be compatible; unknown existing objects require review.
2. Run `supabase/collections_learning_fingerprint.sql`. Export all **15 rows**
   (`relation`, `rows`, `full_data_hash`) and send them as the pre-migration baseline.
   Unlike the Phase 1 audit, this includes `collection_id`, Collection records,
   users, activity tracking start and Storage metadata. It emits no raw personal
   content. It is an integrity comparison, not a database backup.
3. Wait for review of those actual results and explicit approval of installation.
   Do not infer production compatibility from the local PostgreSQL fixtures.

### Step 2 — installation, only after the preflight is reviewed and approved

1. Confirm the compatible two-flag frontend deployment is Ready. Pause normal Add,
   edit, Review, Discover and recording activity on all devices for this short
   comparison window. Capture a **fresh** fingerprint immediately before installing;
   an earlier baseline can become stale through ordinary use or account login.
2. Run **the complete current**
   `supabase/migrations/20261125_collections_learning.sql` in one SQL Editor query.
   It installs the non-unique lookup index, Unicode-aware duplicate guard (including
   edits), scoped English Discover functions, Collection calendar/reordering and
   proficiency-level trigger. Known function markers and source anchors, required
   column types, existing index/trigger identity, RLS and RPC ACLs are checked.
3. Run `supabase/collections_learning_fingerprint.sql` again immediately.
   Every row count and full-row hash must match the fresh before result exactly.
   A mismatch can be legitimate concurrent use, but is **not automatically accepted**.
4. Run `supabase/collections_learning_verify.sql` and send the full
   `noted_collections_learning_verification` JSON, plus both fresh fingerprints.
   Expected: `dependencies_ready: true`; every entry under `checks` true;
   `marker` and `snapshot_marker`: `noted-collections-learning-v1`;
   **`enabled_in_snapshot: false`, `learning_ready_in_snapshot: false`**.
5. Wait for verification and separate approval to activate. Existing English learning
   stays available. Do not run the activation query in the same batch as installation.

### Step 3 — explicit activation after verified installation

1. Only after approval, run `supabase/collections_learning_activate.sql`. It rechecks
   function markers, owner links, RLS, private helper and RPC permissions, security
   mode/search paths, Discover/calendar scoping, index and trigger definitions.
   On success, only the snapshot function's two feature flags change to true.
   No learning, Collection, authentication or Storage rows are changed.
2. Run `supabase/collections_learning_verify.sql` again. Expected:
   `dependencies_ready`, `enabled_in_snapshot`, `learning_ready_in_snapshot` all true,
   with every `checks` value true. Send the full result.
3. Reload the installed PWA/browser so it receives the compatible frontend and
   fresh snapshot, then verify language creation/switching, per-language Add,
   Library, Due/Random Review and unchanged original English/Discover/Voice Notes.
   Local/fixture tests cannot establish production authenticated end-to-end success.

Installation and activation are separately repeatable. Rerunning installation
intentionally disables both flags until another approved activation. On an error
or lock timeout, send the exact error; the transaction rolls back. Do not drop
columns, reset data or rerun an older migration as a rollback. Supabase's generic
query warning is not proof of compatibility; use these exact reviewed files.

## Validation limits

Unit/PostgreSQL tests execute the actual migrations twice, compare original
fields/hashes/policies/storage metadata, and test ownership, duplicate spelling,
Unicode punctuation, scoped Discover saves/exclusions, local-day calendar counts,
legacy RPCs and idempotent offline review events. Browser tests cover per-language
drafts/audio, 17/30 session recovery, shared selection, Profile settings/order,
search restoration, menu keyboard handling, navigation icons, six widths, Chinese
composition, API failure and offline flows. Physical iPhone hardware and its
microphone/keyboard remain unverified. Production browser checks use isolated
fixtures; they do not write test entries into the owner's real Library.

Previous f996b43 checks: lint, typecheck and production build passed; 144 unit tests passed.
The final browser checks cover six widths, fast keyboard menu interaction,
keyboard-sized Add/Save/caret layout, per-Collection drafts/audio and 17/30 session
recovery. Expression/Voice Notes regressions passed 44 checks; one existing native
MP3 test was skipped for the Chromium environment. All 14 WebKit PWA offline
checks passed. A direct public MyMemory probe returned a French translation with
status 200 and no exhausted quota; the f996b43 production server route also returned a valid French translation. No real device testing is claimed.

Phase 2 safety release checks: lint, typecheck and production build passed; 145 unit
tests passed, including actual PostgreSQL migration fixtures. Final SQL regression
checks also verify same-name index collisions and disabled triggers abort safely.
All 32 Collection/legacy-fallback browser tests passed in Chromium and all 32 passed
in iPhone-configured WebKit, including unverified server/cache gate rejection.
Physical iPhone testing and production Phase 2 database verification remain pending.
