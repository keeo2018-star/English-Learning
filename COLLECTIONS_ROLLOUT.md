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
server snapshot until the second-stage migration is installed and commits.

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

## Required second-stage SQL, after the compatible client deployment is Ready

1. Run `supabase/collections_data_audit.sql` and save a fresh before result. Use a
   short window without normal additions, edits or reviews for comparison.
2. Run `supabase/migrations/20261125_collections_learning.sql` in full. Do not
   rerun the foundation, original schema or Discover seed.
3. Repeat the data audit. Counts and original-field hashes should match.
4. Run `supabase/collections_learning_verify.sql`; return its complete JSON and
   the two fresh audits. Expected marker/snapshot_marker are
   `noted-collections-learning-v1`, enabled_in_snapshot/discover_scoped/
   calendar_owner_check/authenticated access true, and both anonymous access
   fields false.
5. Reload the installed PWA/browser to load the new client and metadata.

This migration adds calendar/reordering functions and an update duplicate guard,
adds a non-unique normalised lookup index, updates known duplicate/Discover
functions, and enables the snapshot. It does not rewrite learning data, change
primary keys or create fictional history. Read-only calendar filtering uses local
date boundaries and distinct reviewed item IDs. The duplicate normaliser reads
no tables; authenticated writers need execute permission for its index expression.
All privileged helpers remain private. Permissions/owner checks must pass before
the activation transaction commits.

On incompatibility/lock timeout, retain the exact error. The transaction rolls
back; do not reset records or drop new columns. The second-stage SQL is idempotent.
An older foundation migration intentionally refuses to overwrite newer function
markers. Do not use it as a rollback. Production functionality is not reported as
fully active until the second-stage verification and audits are received.

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

Release checks: lint, typecheck and production build passed; 144 unit tests passed.
The final browser checks cover six widths, fast keyboard menu interaction,
keyboard-sized Add/Save/caret layout, per-Collection drafts/audio and 17/30 session
recovery. Expression/Voice Notes regressions passed 44 checks; one existing native
MP3 test was skipped for the Chromium environment. All 14 WebKit PWA offline
checks passed. A direct public MyMemory probe returned a French translation with
status 200 and no exhausted quota; the production server route still needs its
post-deployment probe. No real device testing is claimed.
