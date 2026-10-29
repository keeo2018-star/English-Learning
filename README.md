# Wordbook · English Learning

Next.js App Router + TypeScript vocabulary app with Supabase email/password authentication, private word storage, and a browser-local demo when Supabase is unconfigured.

## Develop

Requires Node.js 20.9+ and npm. From this repository:

```sh
npm ci
npm run dev -- --hostname 0.0.0.0
```

Routes: `/` welcome, `/auth` sign in / sign up / request password reset, `/auth/reset` set a new password, `/add` collect words, `/review` practice due cards, `/library` search, edit, and delete words. Local demo data stays in this browser and is not automatically uploaded when cloud storage is enabled.

## Supabase

1. Create a Supabase project and enable email/password authentication.
2. Run `supabase/schema.sql` in its SQL editor once. It creates the words table, owner-only row-level security policies, and a due-date index.
3. Copy `.env.example` to `.env.local` and provide `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the project's API settings. The legacy anonymous key is also supported through `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never use a service-role key in the frontend.
4. In Supabase Authentication URL settings, set the application Site URL and allow its `/library` and `/auth/reset` redirect URLs. Use your actual development/deployment origin.
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
