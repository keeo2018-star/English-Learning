# Bilingual Dictionary / Translator deployment

Add now uses one bilingual query and one editable lavender card preview. English
entries appear instantly with debounced dictionary meaning suggestions; Chinese
translation and AI alternatives require explicit actions. Whole-query MyMemory
translation and manual English saving work without Gemini. The original query
stays intact while selecting English candidates and editing My Meaning. The
preview is the saved state; there is no separate translation form or preview copy.
The free Chinese-to-English translator supplies
one primary translation; nuanced alternatives require the optional AI provider.
Provider coverage and free quotas vary. No translations or attribution are invented.

This unified Add change requires no additional database migration. AI still needs
the separate optional setup below; it is not enabled by deploying this UI.

## Production Discover status

On 24 November 2026 the owner applied the existing continuous-Discover migration.
The subsequent production verification reported the batch table, owner SELECT RLS,
active batch column, version-2 snapshot and all four `noted-discover-batches-v1`
function markers. Do not rerun the original Discover seed or reset history.

## Optional AI setup — currently disabled

AI is not required for Add, saving, Dictionary, Review or translation. Do not enable
it before both the schema and free-tier configuration have been checked.

1. Run **only** `supabase/ai_dictionary_preflight.sql` first in the existing
   Supabase SQL Editor. This is read-only. Send back the entire
   `noted_ai_preflight` JSON (not a cropped screenshot). Do not send API keys.
2. Review those results before running
   `supabase/migrations/20261124_ai_dictionary.sql`. This replaces no previous
   migration. It adds a nullable `words.example_source` column and separate AI
   cache/quota tables and owner-scoped RPCs. It refuses unknown conflicting
   objects. Existing vocabulary, meanings, users and review data are retained.
3. Confirm the transaction succeeds and rerun the preflight: new objects should
   have `noted-ai-v1` markers and table RLS enabled. Run the ownership/quota tests
   against a disposable database, never production vocabulary.
4. In Google AI Studio confirm that `gemini-2.5-flash-lite` has a usable **free**
   quota for this project and that paid billing is not enabled. Availability is
   project-dependent. Review Google's free-tier data-use terms before opting in:
   https://ai.google.dev/gemini-api/docs/pricing
5. Set **server-only** Vercel environment variables `GEMINI_API_KEY` and
   `GEMINI_FREE_TIER_ENABLED=true`; the allowed model is fixed to
   `gemini-2.5-flash-lite`. Never use a `NEXT_PUBLIC_` key. Redeploy production.
6. Test explicit AI help while signed in. Optionally enable Profile's after-save
   setting. It sends only the English learning item, never the personal meaning,
   My Context or audio. Saving never waits for AI. Failed/quota-limited generation
   leaves the saved item intact. Cached explanations are labelled as AI output.

There is no paid-model fallback or automatic billing setup. Limits are enforced
in Postgres before provider requests: five fresh requests per user/day, fifty per
project/day, five per project/minute, plus a per-user cooldown. Cache reuse does
not consume generation quota. Cache results expire for reuse after 90 days;
this is not an automatic deletion policy. Generated explanations never overwrite
the user's meaning or example. Explicitly saved generated examples retain an AI
source label.

## Separate optional permission hardening

The earlier production preflight exposed a pre-existing `TRUNCATE` grant on
`public.words` for `anon` and `authenticated`. The standalone
`supabase/words_permissions_safety.sql` revokes only that permission. It does not
delete rows, change RLS, or remove SELECT/INSERT/UPDATE/DELETE permissions. This
has not been reported as applied. It is separate from all feature migrations.

## Verification boundaries

Browser fixtures exercise responsive layouts, IME, translation/save failures,
duplicate protection, consent and cache behaviour. They do not prove physical
iPhone keyboard/PWA behaviour or live Gemini availability. Offline review uses
existing cached vocabulary/examples; a rating only advances after its existing
review RPC confirms persistence. No new offline rating outbox is introduced.
