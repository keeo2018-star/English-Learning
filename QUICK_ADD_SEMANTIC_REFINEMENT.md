# Quick Add, semantic connections and Dictionary refinement

## Inspection and boundaries

The repository has no Gemini client/server implementation, AI explanation model,
AI schema migration or configured Gemini key in the execution environment. The
existing app uses UAPI dictionary data, MyMemory whole-expression translation and
Datamuse. This release reuses them, does not introduce AI generation, does not
claim to persist AI explanations, and does not enable billing or new providers.
A transient explicit meaning-lookup status explains that dictionary fallback is
being used. Production-secret configuration is not inferred from local variables;
without an application integration, an unused remote key would not activate AI.

The existing words schema stores word, meaning, example and review scheduling;
owner RLS already governs its writes. Existing Library/related-save/voice-note
paths are reused. No migration, new table, Storage change or destructive action is
needed. Browser fixtures do not inspect/edit a real user's private production DB.

## Quick Add

The existing editable title, typography hysteresis, caret handling, autocomplete,
IME wrapper and save/retry pipeline stay in place. Minimum English height becomes
62px instead of 76px, with padding reduced to 8px; actual line metrics still govern
larger fonts. Meaning starts at one line, uses a transparent single-divider style,
and grows to a viewport-aware maximum of 200px before scrolling internally.
Sizing skips active IME composition. The detected type appears in a compact native
selector (Word/Expression · Auto), still allowing an explicit override and still
confirming when a recording draft would be discarded. Redundant footer copy is
removed; privacy/source information remains on the existing Privacy page.

Suggestions keep the existing 250ms autocomplete / 600ms meaning debounce,
cancellation, successful-result caching and manual-meaning ownership. Saving
cancels optional lookups and never awaits them. Personal text, failed-save drafts,
My Context and Voice Notes remain intact. No AI API key is shipped to the browser.

## Related Words

The main defect was prioritising rel_trg broad associations and placing unchecked
UAPI synonyms ahead of semantic recommendations. Datamuse now receives the entire
entry through ml, rel_syn and rel_ant. No token-based, spelling or trigger query is
issued. Single components/plurals of a phrase are excluded. Exact lexical links
and UAPI synonym candidates are considered before broad meaning candidates, but
candidates are checked before display rather than blindly appended.

The browser uses the saved sense (or the current dictionary sense when the
personal meaning is empty, without filling it in) and actual candidate Chinese/English
lexical data. Chinese text is not sent to Datamuse; the public server cache stores
only word-based candidate pools. Definition text after an explanatory colon is
not allowed to swamp the core saved Chinese sense. A single generic character
(such as 评 in 评级 versus 评估) is insufficient; matching senses are preferred over
an unrelated first gloss. Opposites from the explicit lexical endpoint are labelled
Antonym. Empty/unverifiable broad results are hidden; explicit lexical links can
remain English-only when their translation is missing. No word families or AI
recommendations are invented.

This is conservative lexical validation, not an AI semantic guarantee. Chinese
synonyms with no common characters may be omitted, and very broad/polysemous
source definitions still limit precision. Provider failure never blocks learning.

A bounded pool (24), at most twice the requested batch size checked per expansion,
and two validation workers reuse the shared dictionary cache.
Repeated lookup failures stop further validation rather than issuing a long chain
of failing requests. Only six approved entries appear initially. Explore more reuses cached metadata,
appends unique approved entries without shrinking/replacing existing rows or
Saved controls, and stops when the useful pool is exhausted. Stale completions are
ignored. API version v=2 avoids reusing old CDN association responses.

Cards use light separators, short one/two-line Chinese previews and independent
>=44px Save pills. Full selected source meanings/examples still go through the
existing Library save model; preview shortening does not truncate saved text.

## Dictionary and video

The existing horizontal pronunciation layout, examples disclosure, prominent title
and scrollable sheet remain. My meaning keeps its accessible name without a
second visible form label. The header now has an isolated high stacking layer and
an opaque backing over the sheet's top gutter. This fixes content peeking above
its original sticky box, in addition to containing high-z-index video frames in
an isolated section. Official player content is not cropped or modified. Embeds
still mount only after expansion and consent, and unmount on Hide/navigation.

## Validation

- tests/unit/related-words.mjs: complete-query provider contracts, lexical ordering,
  duplicate/spelling/frequency filtering, partial/full failures, saved-sense
  rejection (finance/weapons/ratings for take stock of), matching gloss selection.
- tests/quick-add-semantic.spec.ts: 320/375/390/430/768/1440 layouts; compact empty
  fields, long expressions/Chinese, type overrides, rejected false associations,
  stable Explore more / Saved state, full-meaning saves, independent pending
  suggestions, lazy frames, header/close hit testing and cleanup.
- Existing adaptive Add, Smart Add, Chinese IME, Voice draft recovery, Dictionary
  editing/dismissal, contextual examples/offline cache, responsive navigation and
  video lifecycle regressions remain covered.
- Before/after captures: /tmp/noted-quick-{before|after}-{width}.png and
  /tmp/noted-related-semantic-{before|after}.png.

Mobile WebKit/keyboard viewport tests are emulation. Physical iPhone Safari,
installed-PWA keyboard/accessory behavior and real private-account cross-device
writes are not claimed verified.
