# Contextual examples

## Why coverage differed

`words.example` is the existing user context / saved example field (text, maximum
3,000 characters). Add only populated it when My Context was supplied. Discover's
existing RPC copies its vocabulary-bank example into that same field. Review and
Library correctly read it, but never looked up an absent example for older rows.
Dictionary responses contain examples, but previously their memory cache and the
pronunciation lookup did not share or persist those examples.

## Sources and selection

Existing nonblank `example` always wins, including personal writing. Otherwise the
shared UAPI dictionary integration supplies real examples; no new provider,
generated text, AI API, payment, translation fabrication, or migration is added.
Unknown saved examples are not labelled as dictionary quotations. Discover bank
examples continue to be saved by its existing atomic RPC.

Selection requires the complete word/expression with valid boundaries, excludes
HTML, excessive length and a mere repetition of the target sentence, and prefers
Chinese translation overlap with the saved meaning. Clearly disjoint translated
senses are rejected. This is a conservative lexical heuristic, not semantic AI:
synonymous Chinese meanings can cause a useful example to be skipped, and sense
matching cannot be guaranteed. Some expressions/full sentences have no suitable
source; the interface then stays functional without an example.

## Older items, performance and safety

The shared ContextExample component serves Library details, revealed Due/Random
cards and revealed Discover cards, without new card styles. Library lookup starts
when the containing content is near the viewport. Only two supplement jobs run at
once; successful full dictionary responses are also shared with pronunciation
and Dictionary Reference. Duplicate requests share a promise; misses/errors have
short backoffs. Unmounted/stale components never display an old result.

New Add saves start supplementation after the item write is confirmed. Discover
still saves its bank example atomically; missing examples are supplemented only
after a successful Save, using the actual owned Library row. No supplementation
records a review, changes scheduling, or replaces a personal context.

Cloud persistence updates only `example`, restricted by owner, item ID and exact
original word, meaning and blank/null example. A concurrent edit/deletion wins;
there is no unconditional retry/upsert. Existing RLS and user-session credentials
apply. The primary-key lookup needs no additional index, schema or permissions.

Successful selected examples are cached locally per account/item/content snapshot
(maximum 300 entries). They remain usable if cloud sync fails and retry on later
encounters / connectivity restoration. No hundreds-item background backfill runs.
Owner-scoped Library snapshots support loading previously cached items when a
Library fetch fails while offline. Sign-out/account changes clear the previous
account's snapshots/example cache. The service worker still does not cache private
HTTP responses. Offline grading is not claimed: failed ratings retain the card and
require reconnection. A first visit to an uncached page still needs connectivity.

## Validation

`tests/unit/example-quality.mjs` checks whole-expression / Unicode matching,
repetition/length rejection, sense preference and missing results.
`tests/context-examples.spec.ts` covers older/new entries, personal context,
conditional-write conflicts, cached fallback after sync failure, dictionary
failure/no results, revealed-only rendering and mobile overflow. Existing
Discover/database tests verify bank example persistence, idempotent saves, user
isolation and review-history preservation. Browser tests use isolated Supabase
fixtures; they do not modify a production user's private vocabulary.

Physical iPhone Safari/PWA and private production-account cross-device checks
require manual validation; emulated WebKit is reported separately.
