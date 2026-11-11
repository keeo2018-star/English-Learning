# Dictionary vocabulary connections

Related Words lives at the bottom of the existing Dictionary / Reference dialog, after In the Wild. Six terms appear initially; Explore more exposes at most twelve. Related entries replace content in the same dialog, with Back navigation and retained entry scroll position. Personal-meaning edits must finish or be cancelled before exploring; related entries never edit the original item's meaning.

## Data and limitations

Existing UAPI dictionary synonyms are reused. Datamuse supplies complete-query semantic (`ml`) and topic-association (`rel_trg`) results with frequency/POS metadata (`md=pf`). Spelling/autocomplete endpoints are not used for connections. Results exclude the current term, case/whitespace duplicates, malformed terms, very rare vocabulary and explicit spelling matches. Topic associations are preferred when available to reduce misleading homonym senses. The live zodiac example was inspected during implementation; the semantic endpoint alone prioritised a boat-brand sense, while topic associations supplied astrological connections.

Meaning associations are not guaranteed to match the learner's intended sense. Frequency data comes from books, not a definitive everyday-learning syllabus. Long or unsupported Expressions may have no useful matches and the section then stays hidden. Word Family is intentionally absent: these providers do not supply a verified derivational-family relationship. Spelling similarity is never presented as a family.

Chinese meanings come from the existing UAPI dictionary endpoint, only when genuine Chinese data is returned. Datamuse is not treated as a translation service. Missing meanings leave English-only terms. Reference responses and successful suggestion lists are cached in bounded memory; production responses also use CDN caching. Chinese enrichment starts near the visible section, with two workers. Entry navigation aborts suggestion requests and ignores stale reference/enrichment results; shared public-reference requests finish with a ten-second timeout and can be reused. Add and Review do not request related data until Dictionary opens.

Datamuse's documentation was checked on 10 November 2026: https://www.datamuse.com/api/ . It currently permits free use up to 100,000 requests/day without a key, asks public apps to acknowledge Datamuse and customer-facing apps to describe their use. From **1 February 2027**, the documentation says a key is required and the allowance is 100,000 requests/day/key. The existing optional server-only `DATAMUSE_API_KEY` setting is supported. Obtain a key through Datamuse before that change; no paid API was introduced. Provider availability, policies and rate limits can change. Datamuse temporarily logs queries under its documented policy.

## Saving and data safety

Save uses the existing Library row model and authenticated owner. It keeps available Chinese meanings/examples, infers Word versus Expression, and starts the existing neutral schedule (due now, interval zero). Existing normalized Library terms are shown as Saved. The existing production Discover duplicate guard serializes same-user normalized inserts across devices; a duplicate response is treated as already saved. An inline meaning field handles older databases that still forbid blank meanings, without sending the user to Add or inventing a translation.

No new schema, migration, paid provider, public audio setting or service-role credential is needed. Existing vocabulary, review/Discover history, recordings and calendar data are untouched.

## Validation

Semantic/provider filtering and failure tests passed. Desktop and iPhone WebKit fixtures verified six initial terms, Chinese lookup, Explore more, no nested dialogs, Back navigation, saving/SRS defaults, duplicate Saved state, inline meaning fallback, empty results, provider failures and mobile overflow. Existing Dictionary, video and pronunciation regressions were rerun successfully after correcting a component-key conflict. The combined release passed 92 unit/database tests, 62 affected desktop tests and 48 iPhone WebKit tests. Live public provider output is verified separately from mocked UI; account-specific hosted writes are not exercised without disposable credentials.
