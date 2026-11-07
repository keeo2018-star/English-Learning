# Smart Add

Autocomplete uses the official [Datamuse /sug API](https://www.datamuse.com/api/), ranked with prefix matches first, at most five rows, with 250ms debounce and a bounded in-memory browser cache. It does not fetch five translations before displaying results. Datamuse's public API currently allows up to 100,000 requests/day without a key; its documentation says a key will become required on 2027-02-01. Optional DATAMUSE_API_KEY is server-only. No key or paid account was configured.

Chinese meanings prefer the existing UAPI bilingual dictionary. It is a dictionary, not a sentence translation engine. UAPI documentation currently describes visitor credits/rate limits; continued unlimited free availability is not guaranteed. We do not send an API key or purchase credits. The UAPI suggestion endpoint also consumes credits, so autocomplete uses Datamuse instead.

For full expressions or sentences without dictionary coverage, the official [MyMemory GET API](https://mymemory.translated.net/doc/spec.php) receives the complete English segment, never separate word-by-word requests. Its anonymous free allowance is [5,000 characters/day](https://mymemory.translated.net/doc/usagelimits.php), potentially shared by a deployment's outbound IP. No email, paid plan, private translation memory or API key is configured. Quota failure leaves manual capture available. Machine/translation-memory suggestions are explicitly labeled Translation, not dictionary definitions. Provider accuracy is not guaranteed. Successful suggestions have a bounded one-hour process cache. Private Chinese meanings are never sent. Privacy disclosures link the provider terms, including MyMemory's long-term segment retention.

Saving never waits for these requests and captures the actual form values. Manual typing, pasting, partial edits and deliberate clearing take precedence. A cleared meaning can be suggested again explicitly, or after changing the English item. Non-empty manual meanings survive English changes. Cancellation, a request generation and a submit lock prevent late results from changing a new or saved item. No background update to a saved item exists.

## Database prerequisite for English-only capture

The repository schema and the user's previous production preflight both contain words_meaning_check with a 1-character minimum. Frontend changes alone cannot make English-only capture work with that constraint. No placeholder meaning is stored to bypass it.

1. Run **supabase/smart_add_preflight.sql** first in the existing project's SQL Editor and share both result sets (meaning column metadata and check constraints).
2. After reviewing the current production results, run **supabase/migrations/20261106_optional_meaning.sql**. This is a new focused migration, not a replacement for the learning-activity migration. It atomically relaxes only the recognized length constraint from 1–2000 to 0–2000, keeps NOT NULL and all RLS/policies/progress, and makes no row edits. Unknown schemas or extra meaning checks cause a rollback. A short lock timeout avoids waiting behind active writes.
3. Verify the resulting check has a zero lower bound and test saving an English-only item. Until then, an empty-meaning rejection is explained, while normal items with meanings continue to save.

Do not report English-only production saving as active until the schema has actually been updated. This workspace has no production database administrator credential.

## Validation

Build, lint and typecheck passed. All 39 unit tests passed; the focused migration/provider tests also passed after the migration lock guard was added. The full browser regression run had 140 passes and 5 expected skips for unconfigured demo/confirmed-account flows. Final Smart Add runs passed all 18 cases in Chromium and all 18 in iPhone/WebKit, including actual touchscreen taps, Chinese IME ownership, explicit-retry failure, stale responses, saving during lookup, installed-PWA behavior and the old-schema fallback. Browser save tests use isolated Supabase fixtures, not production account credentials.

Real local application endpoints returned HTTP 200 with Datamuse word suggestions, UAPI Chinese word meanings and MyMemory complete-sentence translation. These checks do not establish that the production meaning constraint has changed; production SQL remains a separate manual prerequisite.
