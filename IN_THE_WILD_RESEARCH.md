# In the Wild: provider feasibility

Checked 2026-11-05. Updated after the owner confirmed current personal, non-commercial use and requested publication. The browser website now uses the standard official widget; installed PWA use remains external-only pending clarification. No database changes.

## Recommendation

Use the official YouGlish widget under its standard non-commercial website embedding policy for the present personal project. Do not infer permission for commercial use or installed PWAs. The published policy does not clearly classify installed PWAs, so these open the official provider website instead. Seek explicit approval before expanding this scope.

## Official options

| Provider | Verified capability | Limitation / decision |
| --- | --- | --- |
| [YouGlish widget](https://youglish.com/api/doc/widget) and [JS API](https://youglish.com/api/doc/js-api) | Embedded phrase search; UK/US filters; disable autoplay; replay/next; caption and playback-state callbacks. | Best candidate. Commercial and mobile-app use require explicit permission. PWA applicability and Noted's permitted usage are unconfirmed. Mandatory attribution and provider controls must remain. |
| [YouTube captions API](https://developers.google.com/youtube/v3/docs/captions/download) | Caption downloads for videos the authenticated user has permission to edit. | An API key does not unlock arbitrary public-video transcripts. Ordinary video search cannot establish that a phrase is spoken or its timestamp. Suitable for an explicitly licensed/owned catalog, not this open-catalog requirement alone. |
| [PlayPhrase.me policy](https://www.playphrase.me/fair-use-policy.html) | Phrase-oriented video discovery on its own website. | Explicitly offers no public or private API, free or paid. Do not use private endpoints or scrape results. |

The public widget requires no API key for standard website embedding. There is no guaranteed free quota or service-level commitment. Widget and JS documentation describe impression thresholds differently; seek clarification before significant traffic or commercial use. No paid service was purchased.

## Matching and player boundaries

The YouGlish documentation exposes query submission, result counts, caption text with matched spans, video IDs, playback events and replay/next controls. This is a supported widget API, not a confirmed standalone search/transcript/timestamp service. Do not infer a raw timestamp API or arbitrary content redistribution rights.

The implementation sends the whole learning text and never silently falls back to individual words. Full ordered phrase/sentence guarantees and cross-caption behavior remain unconfirmed. The UI explicitly labels these as provider search results whose exact spoken matches are not independently verified. Captions stay inside the official widget; Noted neither extracts nor stores them.

Use widget-supported replay rather than inventing segment boundaries. Preserve branding, visible official controls and minimum player dimensions. The widget includes material beyond the video; do not force the whole widget into a clipped 16:9 box. Check the official video-area sizing on narrow iPhones against the documented 200×200 minimum before claiming mobile compliance.

## Request to send to YouGlish

This draft has not been sent. Include the production URL: https://englishlearning-one.vercel.app.

> We maintain Noted, a public English vocabulary learning web app with an installable PWA. We would like to embed your official widget inside an expandable item-detail section, loading only after user interaction, retaining required attribution and official playback controls. Please confirm:
>
> 1. Permission for this website and installed PWA, including any commercial-use classification, license, partner key and fees.
> 2. Applicable free quota, usage accounting, throttling signals and production/domain restrictions.
> 3. Exact ordered word/phrase/sentence matching guarantees, query limits and cross-caption behavior.
> 4. Whether caption callbacks may be displayed temporarily in our native surrounding UI, without storing or redistributing transcripts.
> 5. Supported responsive video sizing and player cleanup, keeping all mandatory branding and controls visible.

Before enabling the integration, add the required YouTube Terms and Google Privacy links and any applicable cookie disclosures/consent flow. Never put private provider credentials in client code; ask whether any issued partner identifier is intended to be public.

## Implemented website integration

The existing DictionarySheet includes a reusable native section with an isolated official widget adapter. It is collapsed by default, loads only after explicit provider consent, disables autoplay, defaults to UK and removes the player/listeners on collapse or unmount. UK/US switching, official track replay and next-result navigation use documented methods. No raw timestamp or standalone search API is claimed.

The section now starts with a neutral Noted card containing a lime play control and the current learning text (not a fabricated video thumbnail). Clicking opens the consent and player area inside that same card. Browser widths including 320px and 390px use the embedded widget instead of redirecting based on a forced 16:9 ratio. The native card and widget reserve at least 200px height; the official widget determines its internal video layout and expands for captions/controls, without cropping. Provider ads and branding remain intact. Installed PWAs continue to use an official external search link pending permission. A Privacy & terms page and footer link disclose optional third-party loading and link the required policies.

Supported video playback events stop shared pronunciation; starting word pronunciation pauses registered context video players. Existing dictionary/TTS source priority is unchanged.

Automated tests exercise complete word/expression/long-sentence queries, consent/lazy loading, empty/error/retry/late-script cases, official controls, audio coordination, responsive fallback and installed PWA handling using a widget contract fixture. These do not establish live provider matching accuracy or actual YouTube playback.

## Current delivery status

Live integration check: the official script and embedded YouGlish page returned HTTP 200. This environment's proxy failed the connection to www.youtube.com with ERR_TUNNEL_CONNECTION_FAILED, preventing live ready/search callbacks and playback validation. The application times out to a friendly fallback and official search link. Do not report live playback as verified from this workspace. Final deployment status is reported separately after Vercel verification. No vocabulary, account, review or schema changes were made.

Validation: production build, lint, typecheck and all 32 unit tests passed. Full Chromium suite: 126 passed, 5 skipped and one live-auth timeout; that auth test passed when rerun with NODE_USE_ENV_PROXY=1. All 14 video tests passed in WebKit with iPhone settings, with explicit wide viewports for inline-player cases. Provider behavior is mocked in automated video tests; real playback remains subject to the network limitation above.
