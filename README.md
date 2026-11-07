# Noted

Next.js App Router + TypeScript vocabulary app with Supabase email/password authentication, private word storage, and a browser-local demo when Supabase is unconfigured.

## Develop

Requires Node.js 20.9+ and npm. From this repository:

```sh
npm ci
npm run dev -- --hostname 0.0.0.0
```

Routes: `/` Add, Discover and Random Review, `/discover` optional vocabulary check and daily words, `/auth` sign in / sign up / request password reset, `/auth/reset` set a new password, `/add` collect words, `/review` practice due cards, `/library` search, edit, and delete words. Local demo data stays in this browser and is not automatically uploaded when cloud storage is enabled.

Smart Add uses [Datamuse](https://www.datamuse.com/api/) autocomplete, existing UAPI bilingual definitions and MyMemory for complete-expression translation. See [SMART_ADD.md](SMART_ADD.md) for provider limits, manual-edit guarantees and the separate preflight/migration required before English-only saves can work with the original production constraint.

Discover setup, licensed vocabulary sources, recommendation rules and migration safety are documented in [DISCOVER.md](DISCOVER.md).

## Random review

Reveal an item, then choose **Not sure** or **Sure**. The choice is saved before the next card appears; failed saves leave the answer available for retry. Both review modes use the same internal adaptive model. Technical scores and intervals are not shown in the controls.

Random Review samples up to 30 distinct Words and Expressions with the existing weighted randomness: overdue, uncertain, difficult and recently added items receive more weight. Strong items retain a nonzero chance. A smaller Library yields a smaller session. Not sure keeps its ten-minute schedule and higher future selection weight, without reinserting a duplicate into this finite session. The counter and native progress bar count successful submitted responses, starting at 0; reveal/display does not advance them. Completion shows the submitted count and Start another review.

An account-scoped browser-local session retains the selected item IDs, prompt directions, stable per-card event UUIDs and completed responses across refreshes and navigation. The same browser's tabs share progress. Scheduling and events sync through Supabase, while the unfinished queue is local to that browser/device. Deleted pending items are skipped without being counted as reviewed; already completed items remain counted. Storage restrictions fall back to an in-memory session. A completed session stays completed until explicitly restarted. Each successful cloud response is authoritative; a retry after a committed-but-lost response reuses the event ID.

Spaced successful recalls progress through approximately 1, 3, 7, 14, 30 and 60 days, with adaptive adjustments for difficulty. Successes less than 20 hours apart cannot increase the interval ladder or mastery streak. Not sure raises difficulty, lowers memory strength and schedules a near-term review. Existing rows remain neutral until explicitly rated, and their content is preserved.

Most cards show English → meaning. Occasionally meaning → English or a blanked personal example is used. Context requires an exact complete word/phrase match in the user's own saved example. Pronunciation of the answer stays hidden until reveal in reverse/context cards.

Apply `supabase/migrations/20261101_adaptive_review.sql` to an existing database before deploying this version. It adds only nullable `words.review_state` JSONB and refreshes the API schema; it does not change RLS, existing records or schedules. Fresh databases include the column in `supabase/schema.sql`. All cloud state is stored on the same owner-protected word row, so it follows the account across devices. Demo state uses the existing browser-local storage.

Every pronunciation control uses `src/lib/pronunciation.ts` through `usePronunciation` and `PronunciationControl`. Dictionary audio has priority, another available dictionary recording is next, and browser speech is the fallback. Due Words and Random Review share the same automatic pronunciation control. Current and up to two upcoming candidates are preloaded; for simple English words, metadata lookup and tentative recording download run in parallel, with playback gated on dictionary confirmation; cards render independently of media readiness. Successful, validated recording URLs are cached in memory and in a bounded one-hour tab-session cache, so route changes and reloads do not repeat dictionary resolution. Review reuses one media player across cards to retain browser gesture permission. A bounded four-recording Blob cache reuses downloaded audio bytes through the same-origin `/api/pronunciation` endpoint; that endpoint accepts only validated UAPI recording URLs, rejects redirects, bounds file size, and supplies browser/CDN caching headers. Review navigation, mode and enable-toggle gestures initialize the player before asynchronous lookup, while direct visits retain quiet manual/reveal recovery. Shared ownership cancels prior playback and pending speech before starting another card. Revealing a forward card never repeats autoplay. Blocked autoplay stays quiet and can resume on a trusted Reveal gesture or manual speaker tap. Strict Mode effect replay is coalesced in a microtask, with no playback timer. Empty fallback voice catalogs use an English locale immediately rather than waiting for a timer.

Adaptive model checks: `node --test tests/unit/adaptive-review.mjs`. Browser checks cover both ratings, retry spacing, persisted state, failures, legacy rows, prompt directions, mobile controls and pronunciation. Confirmed disposable accounts are required for live authenticated Supabase lifecycle tests.

## Learning activity migration and calendar

**First run only the read-only [`supabase/preflight_learning_activity.sql`](supabase/preflight_learning_activity.sql)** in the existing project's SQL Editor. Share the `noted_schema_preflight` JSON result (schema/security metadata, no vocabulary or auth-user records) for compatibility review. Column names were confirmed through the public production API; actual deployed types, grants, policies and custom triggers require this administrative catalog query. Do not treat local tests as proof of production compatibility.

After the preflight is reviewed, replace any earlier migration draft with the latest complete file. The migration now checks base-column types and UUID primary keys before DDL, refuses to replace unrelated same-named activity tables/functions/triggers, uses safe legacy state normalization, and rolls back on error. It preserves existing word policies/grants. Run as the existing project's postgres/admin SQL Editor role; no service-role key belongs in the frontend.

**After compatibility confirmation**, run the entire [`supabase/migrations/20261104_learning_activity.sql`](supabase/migrations/20261104_learning_activity.sql) in the existing project's **SQL Editor → New query → Run**. Fresh projects run `schema.sql` first, then this migration. It is additive and safe to re-run: nullable `item_type`, immutable review/addition logs, owner-only RLS, query indexes, tracking start, atomic review RPC, monthly aggregation and real-time words publication. Existing content, schedules, authentication and `review_state` remain intact. The application uses only the existing public client key; it cannot apply DDL. No new Vercel environment variables are required. A successful Vercel build does **not** establish that this migration has run.

`record_learning_review` authenticates the caller, locks and verifies ownership of the item, deduplicates the stable event UUID, checks the expected review count, and commits scheduling state and a server-timestamped event together. Direct event writes are denied. Its restricted SECURITY DEFINER search path and explicit ownership predicates are required. Conflicting writes from another session/device fail visibly, rather than overwriting progress. The legacy PATCH trigger records actual new review-count increases from older app versions, without backfilling historical review events. If the RPC is missing during rollout, the existing item scheduling save continues and reports activity tracking unavailable; it never fabricates activity. Full tracking/deduplication requires the migration.

Signed-in Profile (`/auth`) shows the **Learning calendar** expanded by default, in place of the sign-in form. Signed-out visitors retain sign-in, signup and password recovery. Review keeps its focus on the flashcard. Reviewed is the default; Added is separate. Server aggregation uses IANA timezone month boundaries and counts distinct item IDs per local date; every completed review event is retained. Dates before tracking began are unknown, the first day is partial, and subsequent empty days are confirmed zero. Added uses actual original `created_at` values; known existing items are backfilled, and future additions are snapshotted by a trigger so later deletion does not remove recorded activity. Deleted items from before installation cannot be reconstructed. The Added legend states this historical limitation. Month queries run only when expanded, show loading/failure instead of false zeroes, and refresh on return from reviews, foreground changes, and every 30 seconds while expanded. No homepage widgets were added.

Library metadata shows actual filtered totals, Word/Expression breakdown, and search matches versus full Library size. Legacy single-token items infer Word, multiword items infer Expression without rewriting text. Add offers Automatic/Word/Expression and editing permits an explicit type. Pagination avoids Supabase's default 1,000-row cap. Real-time owned-word changes refresh the Library, with foreground/visibility and 30-second refresh fallback for disconnected real-time channels and deletions. The app remains online-first; installed PWA shells do not cache private activity responses.

Validation: `npm test` (Node 24; includes isolated PostgreSQL/PGlite transaction, RLS, migration rerun, timezone and historical-data checks), `npm run test:e2e`, `npm run lint`, `npm run typecheck`, `npm run build`. `tests/learning-progress.spec.ts` covers mixed 30-item and smaller sessions, reveal versus submitted progress, completion/restart, refresh/navigation recovery, lost-response retry, concurrent tabs, local calendar dates, unknown history, Library mutations/filter/search/sync, and pagination. `playwright.iphone.config.ts` includes these regressions in an iPhone WebKit profile. Mocked APIs and isolated PostgreSQL do not prove hosted migrations or live user isolation; confirmed disposable accounts are needed for the live Supabase suite. Physical installed iOS PWA behavior still needs a real device.

## Shared selection system

Use `SelectableLink`, `SelectableButton`, or `SelectableToggle` from `src/components/ui/selection.tsx` for new navigation, tabs, filters, categories, sort-mode buttons, segmented controls, and toggles. The same selected-state renderer also recognizes standard ARIA current/pressed/selected/checked states. All selected visuals and the single focus outline live in `design-system.css`; pages should not add their own selected colors or rings. Labels are transparent alpha-mask holes over a black surface, with a multiply-compositing fallback and readable system colors in high-contrast mode. Native control semantics, accessibility labels, and hit areas are preserved.


## Install on your home screen (PWA)

The production HTTPS app can be installed without an app store. On iPhone, open it in Safari, choose **Share → Add to Home Screen**, then open the new **Noted** icon. On Android Chrome, choose **Install app** or **Add to Home screen** from the browser menu. The installed app opens standalone at the same origin and keeps the same Add, Review and Library routes. Sign in in the installed app; browsers may separate home-screen storage from regular browser tabs. Supabase persists sessions in that app's browser storage and refreshes tokens normally. Existing production callback URLs remain valid; PKCE email links still need the same browser context that started the flow.

`src/app/manifest.ts` defines the install identity, scope, colors and Android icons. The root layout provides Apple web-app metadata, a touch icon, portrait startup images for common iPhone sizes, and an accessible viewport with safe-area support. Other sizes use the operating system's available launch treatment. `public/sw.js` caches only install icons and the public offline notice. It never caches authenticated HTML, Supabase/API responses, or callback URLs. Offline cloud editing is not provided: reconnect and reload to continue. Worker updates are checked without automatically reloading unsaved forms; Vercel always serves the current app HTML. If changing cached install assets later, bump the worker cache version.

## UI text selection and mobile fields

`public/interaction-policy.css` is the single policy imported by the app and linked by the cached offline screen. Interface regions and semantic controls opt out of selection; neither `html` nor `body` disables selection. Use `wb-ui-text` for new helper/interface regions and `wb-learning-content` on actual vocabulary, meanings, definitions, examples or notes. Learning material and editable text remain selectable, including within forms or dialogs; no touch-callout suppression is applied. On narrow screens or coarse-pointer devices, interactive text fields use at least 16px before focus, with balanced field heights. Desktop typography is preserved. The viewport allows normal accessibility zoom. Safari-family checks use `npx playwright test --config playwright.iphone.config.ts` after installing Playwright WebKit and its supported system dependencies. These checks exercise an iPhone profile, native pointer selection, computed field sizes and focus/viewport behavior; physical iOS keyboard and long-press menus still depend on the device.

## Supabase

1. Create a Supabase project and enable email/password authentication.
2. Run `supabase/schema.sql` in its SQL editor once. It creates the words table, owner-only row-level security policies, and a due-date index.
3. Copy `.env.example` to `.env.local` and provide `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the project's API settings. The legacy anonymous key is also supported through `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never use a service-role key in the frontend.
4. In Supabase Authentication URL settings, set Site URL to your production Vercel origin (for example `https://your-app.vercel.app`). Allow that origin’s `/auth/callback` redirect, including the query parameters used for recovery and SDK flow IDs. Use a Supabase redirect allowlist pattern such as `https://your-app.vercel.app/auth/callback**` if required for those query strings. Add localhost separately for local development. Keep the production hostname explicit.
5. Restart development or rebuild production after changing public environment variables. These variables are included at build time.
6. Sign up, confirm the email, sign in, save a word, refresh, review it, and sign out. Verify a second account cannot see the first account's words. Hosted email delivery, redirects, and row-level security require a real configured project and are not covered by local demo tests.

Do not commit `.env.local`. The publishable key is intended for browser use; database isolation depends on the SQL policies.

## Validation

```sh
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests currently target unconfigured local demo mode: collecting, persistence across reloads, searching, revealing and scheduling cards, deletion, empty states, and mobile layout. Run them with the Supabase public variables unset at build time. Playwright starts a production server if port 3000 is unused. On minimal Linux machines, `npx playwright install --with-deps chromium` may be needed.

Production: `npm run build` then `npm run start -- --hostname 0.0.0.0`. Review scheduling uses 10 minutes for another practice and the adaptive interval ladder documented above for successful recall. Due cards refresh every 30 seconds. There is no background worker or external AI service.

## Live Supabase integration tests

After applying `supabase/schema.sql`, provide two distinct, confirmed test accounts through secure environment settings:
`SUPABASE_TEST_EMAIL_A`, `SUPABASE_TEST_PASSWORD_A`, `SUPABASE_TEST_EMAIL_B`, and `SUPABASE_TEST_PASSWORD_B`. Use disposable test accounts, not personal production accounts. Keep passwords out of source control and chat.

Build with the public Supabase variables configured, then run:

```sh
npm run build
NODE_USE_ENV_PROXY=1 npx playwright test tests/live-supabase.spec.ts
```

The live suite checks rejected sign-in against the actual service. With the two confirmed accounts it also checks UI sign-in, creation, persistence after reload, search, review scheduling, deletion, sign-out, and direct API isolation (cross-user select/update/delete/forged insert and anonymous reads). It creates a uniquely named item and cleans it up in a finally block. It never changes existing items. Missing test credentials skip the account-dependent test; a skip does not validate hosted flows. Sign-up email confirmation must be tested separately with an inbox you control. The Supabase publishable key cannot apply database migrations or confirm users.

### Single-account testing

A second account is optional. With one confirmed disposable account, configure `SUPABASE_TEST_EMAIL` and `SUPABASE_TEST_PASSWORD` securely and run:

```sh
npm run build
NODE_USE_ENV_PROXY=1 npx playwright test tests/live-supabase.spec.ts --grep-invert 'two confirmed accounts'
```

The single-account test checks sign-in, saving, reload persistence, search, review scheduling, editing and persistence of edits, deletion, and sign-out. It deletes only its uniquely named test item afterward. The two-account test runs only when explicitly enabled with `RUN_TWO_ACCOUNT_TESTS=1`; it is not required for this workflow. Sign-up with email confirmation needs an inbox owner to click the confirmation link before the authenticated lifecycle can run.

## Production email callbacks

`/auth/callback` is a browser-rendered App Router route because this app stores Supabase sessions in browser storage. It exchanges PKCE codes with the verifier from the originating browser, persists the returned session, and navigates to `/library`. Recovery links navigate to `/auth/reset`. It also accepts legacy implicit access/refresh-token fragments. `/auth/confirm` supports custom email templates containing `token_hash` and an email verification `type` (for example `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`). The default Supabase `{{ .ConfirmationURL }}` template works with the callback URL sent by sign-up.

Use the same browser for PKCE sign-up and confirmation. Custom token-hash templates can verify directly without a browser-local PKCE verifier. Failed, expired, missing, or reused credentials redirect to `/auth?error=auth_callback` with a friendly explanation. Callback credentials are removed from the address bar, and return destinations are restricted to app routes.

In Vercel, deploy the repository root as a Next.js application and configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the production deployment before building. Do not select a static-output directory. No localhost callback hostname or additional site-URL variable is hardcoded: email redirects use the origin where the user starts authentication. After deployment and updating Supabase’s redirect allowlist, request a fresh confirmation email; old emails retain their old redirect target.

Focused regression suite: `npx playwright test tests/auth-callback.spec.ts` with a Supabase-configured build. These tests mock the provider and cover PKCE, flow-specific verifiers, legacy implicit sessions, token-hash confirmation, recovery, failure messages, and a complete sign-up/callback round trip at a simulated HTTPS Vercel origin. They do not establish that a particular live Vercel deployment or its Supabase dashboard settings have been updated.

## Production readiness checks

The production UX regression suite (`tests/production-readiness.spec.ts`) uses mocked cloud responses to check 320px layouts, mobile sign-out, honest loading/error/empty states, failed-save retry, existing six-character passwords, session refresh, and late review responses after sign-out. Run it alongside the auth callback suite against a cloud-configured production build:

```sh
npm run lint
npm run build
npm run typecheck
npx playwright test tests/production-readiness.spec.ts tests/auth-callback.spec.ts tests/cloud-errors.spec.ts
```

For live deployed testing, securely supply one confirmed disposable test account as `SUPABASE_TEST_EMAIL` and `SUPABASE_TEST_PASSWORD`. Set `PLAYWRIGHT_BASE_URL` to the actual production HTTPS origin, then run `NODE_USE_ENV_PROXY=1 npx playwright test tests/live-supabase.spec.ts --grep-invert 'two confirmed accounts'`. The test signs in independently in desktop and mobile browser contexts (no copied browser storage), verifies cross-device visibility and persisted edits/deletion, and checks sign-out survives reload. It only deletes its own uniquely named temporary item. Omit `PLAYWRIGHT_BASE_URL` to use the locally built production server. Missing credentials skip the lifecycle test; invalid credentials fail it. Neither a skip nor a mocked-provider test establishes live production readiness. A fresh email-confirmation round trip requires an inbox owner to confirm the email.

## Personal meanings and dictionary reference

`/add` saves through the existing Supabase/local flow. Smart Add may suggest an editable Chinese meaning; only the user's submitted form values are saved, and saved items are never updated by later suggestion responses. Review scheduling and ownership policies are unchanged. English-only capture needs the focused constraint migration described in SMART_ADD.md.

Library items provide a **Dictionary** button. Review provides it after revealing the personal meaning. An accessible modal bottom sheet keeps **My meaning** separate from reference content. UK/US pronunciation, Chinese and English definitions, and up to three bilingual examples appear when available; synonyms are collapsed. Audio never autoplays and failure does not affect the item.

`GET /api/dictionary?word=...` validates the English query, calls the fixed UAPI endpoint `https://uapis.cn/api/v1/dictionary/lookup`, and returns a bounded normalized result. The server has an eight-second upstream timeout and controlled 400/404/502 responses. Successful reference responses may be cached for an hour. Only HTTPS pronunciation URLs on UAPI's dictionary audio path are allowed. The browser requests pronunciation media directly from UAPI.

Dictionary lookup itself requires no database change. Learning activity uses the additive migration documented above. The earlier unapplied dictionary-metadata migration has been removed. Existing database columns, including metadata if previously added separately, are not dropped or modified. Dictionary requests perform no Supabase writes and no provider response is stored in the vocabulary table or demo storage.

Checks: `node --test tests/unit/dictionary-provider.mjs` (Node 24), `npm run build`, `npm run typecheck`, `npm run lint`, `npm run test:e2e`. Dictionary browser tests use controlled provider and cloud fixtures; they do not establish hosted account readiness.

## Learning-word highlights

`HighlightWord` and `highlightParts` render selectable lime marks only in Dictionary reference definitions, examples and synonyms. Library and Review cards and personal meanings stay unhighlighted. Matching is case-insensitive and requires complete words/phrases, with Unicode-aware boundaries. Original text, case and whitespace are preserved. Inflections are not guessed. All dictionary content is rendered as React text, never injected HTML.

`tests/review-audio.spec.ts` covers Due autoplay, next-card preload, one shared player, cache reuse on reload, blocked-playback recovery and stale-response cancellation. `playwright.iphone.config.ts` includes these checks with an iPhone WebKit profile. Physical iOS installation and native autoplay policy still need device testing.

## Library search performance and usability review

Library displays 30 results per page and searches the entire synchronized Library using a memoized, normalized local index. Input updates are deferred separately from result rendering. Word pronunciation metadata is loaded near the viewport rather than for the complete Library. Background sync errors preserve the last loaded items and expose Retry sync; editing pauses background refresh. No database migration is required.

`tests/library-performance.spec.ts` guards row/request budgets, full-Library search, pagination/filter behavior, Chinese/full-width queries and sync failure recovery. Run the standalone 1,000-item profiling sample with `node tests/performance/library-benchmark.mjs` against a running production server. See [APP_USABILITY_AUDIT.md](APP_USABILITY_AUDIT.md) for the measured comparison, confirmed remaining user-facing issues, and test limitations.


Dictionary's Close control uses a single border with a lime keyboard-focus fill instead of a second outline. On mobile, pulling the header down dismisses the sheet; content pulls dismiss only from scroll-top, preserving normal reading/selection. Short, horizontal and cancelled gestures reset. Editing disables drag dismissal, dirty drafts require Save/Cancel before closing, and pending saves block duplicate submission/closure. **Edit** beside **My meaning** updates only the existing item's `meaning` through owner-filtered Supabase CRUD in Library and revealed Review; dictionary reference, scheduling and review events are unchanged. Errors retain the draft. No migration is required. `tests/dictionary-edit.spec.ts` covers both entry points, persistence, retries and gestures; Chromium also checks native CDP touch input. WebKit automation does not substitute for physical iPhone testing.

Review grading keeps top mode/account controls visually stable while their existing save lock remains active. Selected-control masks are cached until selection, label, size or font changes; unrelated card/search mutations no longer rewrite all masks. Library uses native immediate text input and React transitions for result updates. `tests/review-controls-stability.spec.ts` checks both ratings against dimming, remounting and mask/style churn; search and mask invalidation regressions cover query links, rapid typing, changed labels and resizing. No database change is needed.
