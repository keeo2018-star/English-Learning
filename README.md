# Wordbook · English Learning

Next.js App Router + TypeScript vocabulary app with Supabase email/password authentication, private word storage, and a browser-local demo when Supabase is unconfigured.

## Develop

Requires Node.js 20.9+ and npm. From this repository:

```sh
npm ci
npm run dev -- --hostname 0.0.0.0
```

Routes: `/` welcome, `/auth` sign in / sign up / request password reset, `/auth/reset` set a new password, `/add` collect words, `/review` practice due cards, `/library` search, edit, and delete words. Local demo data stays in this browser and is not automatically uploaded when cloud storage is enabled.

## Random review

On `/review`, choose **Random review** to practice every saved word in shuffled order, including words that are not due yet. Reveal the meaning, then choose **Next word**. Each word appears once per round; **Shuffle again** starts a new round. This practice mode does not change review dates or intervals. **Due words** keeps the existing scheduled review workflow.

Random Review includes **Auto pronunciation**, enabled by default for the current Review session. Each new card speaks only its English title once using the browser SpeechSynthesis API, preferring en-GB and then another English voice. Revealing an answer does not repeat speech. Turn the setting off to practice silently; the speaker button still replays the title. Card changes, leaving Random Review, or disabling autoplay cancel previous speech and pending voice loading. No speech API keys or database changes are required. Some mobile browsers block automatic speech until a direct speaker-button tap; available voices and audible playback depend on the browser/device.

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

Production: `npm run build` then `npm run start -- --hostname 0.0.0.0`. Review scheduling uses 10 minutes for another practice, one day for first recall, and doubles the previous day interval on successful recall. Due cards refresh every 30 seconds. There is no background worker or external AI service.

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

`/add` saves the user's word, meaning and optional example through the existing Supabase/local flow. Review scheduling and ownership policies are unchanged. No dictionary definition is selected, copied, or saved automatically.

Library items provide a **Dictionary** button. Review provides it after revealing the personal meaning. An accessible modal bottom sheet keeps **My meaning** separate from reference content. UK/US pronunciation, Chinese and English definitions, and up to three bilingual examples appear when available; synonyms are collapsed. Audio never autoplays and failure does not affect the item.

`GET /api/dictionary?word=...` validates the English query, calls the fixed UAPI endpoint `https://uapis.cn/api/v1/dictionary/lookup`, and returns a bounded normalized result. The server has an eight-second upstream timeout and controlled 400/404/502 responses. Successful reference responses may be cached for an hour. Only HTTPS pronunciation URLs on UAPI's dictionary audio path are allowed. The browser requests pronunciation media directly from UAPI.

No database change is required. The earlier unapplied dictionary-metadata migration has been removed. Existing database columns, including metadata if previously added separately, are not dropped or modified. Dictionary requests perform no Supabase writes and no provider response is stored in the vocabulary table or demo storage.

Checks: `node --test tests/unit/dictionary-provider.mjs` (Node 24), `npm run build`, `npm run typecheck`, `npm run lint`, `npm run test:e2e`. Dictionary browser tests use controlled provider and cloud fixtures; they do not establish hosted account readiness.
