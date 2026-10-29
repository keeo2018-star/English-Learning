# App visual-system audit

The app uses plain global CSS plus a scoped CSS Module for Home. The existing `--wb-*` design tokens, Card, Pill, Progress, ArrowIcon, and Navigation components are the shared foundation. No CSS framework or new dependency was added.

| Existing route or view | Before | Current implementation |
| --- | --- | --- |
| `/` | Redesigned Home | Preserved; loading/error UI now reuses shared states |
| Dictionary | Home saved-word search | Preserved search destination and behavior |
| `/add` | Old workspace/form | Shared app shell, editorial heading, rounded form and pill controls |
| `/library` | Old plain word list | Dominant search, neutral pending-recall cards, identity-colored learning cards, metadata pills |
| `/library?view=new` and `?view=learning` | Filtered old list | Collection header, progress and the same shared word cards |
| Word details | Inline Library and Review content | Large word typography, meaning/example hierarchy; existing edit/delete behavior |
| `/review` | Old review panel | Focused colored card, large type, recall controls and crossed-out completion state |
| `/auth` | Old auth form | Shared account/auth shell for sign-in, sign-up, reset request and callback errors |
| `/auth/reset` | Old reset form | Same form system and feedback component |
| `/auth/callback` and `/auth/confirm` | Old confirmation panel | Shared branded loading state; exchanges and redirects unchanged |
| Not found | Framework default | Shared branded 404 state |
| Unexpected route error | Framework default | Shared error state and framework retry action |
| Route loading | Framework default | Shared loading card |
| Delete confirmation | Browser-native confirmation | Styled native HTML dialog with trapped focus, Escape/cancel, explicit confirmation and focus restoration |

There are no separate dictionary lookup/result, collection CRUD/detail, word-detail, or profile-settings routes in this codebase. Profile continues to point to the existing account/auth screen. No new product routes or data fields were invented. CEFR, pronunciation, part of speech and a permanent mastery status are not recorded, so those values are not fabricated. Learning metadata uses the existing review interval; strikethrough marks the genuinely completed review queue.

## Shared UI

- `src/components/ui/app-shell.tsx`: branded page shell, footer, account actions and shared main navigation.
- `src/components/ui/navigation.tsx`: original destinations, with explicit active states; contextual Add/Review/Library links remain available.
- `src/components/ui/states.tsx`: feedback, loading, empty, error and completion states.
- `src/components/ui/confirm-dialog.tsx`: reusable accessible destructive confirmation.
- `src/components/ui/design-system.css`: original palette, typography, spacing, radii and primitives.
- `src/app/globals.css`: common controls and responsive app layouts using those tokens; obsolete green/serif styling removed.

No existing screen is intentionally left in the old visual style. Browser checks cover 320, 390, 768 and 1440 pixel widths, including collection views and auth/reset routes. Visual review covers desktop/mobile Library, Add, Review and Authentication. Unexpected-error recovery is implemented with the installed Next.js version's `retry` contract; a real production incident is not induced for visual testing.

Supabase queries, schema, authentication callbacks, session handling and review scheduling are preserved. Authenticated hosted lifecycle tests still need configured test credentials; skipped tests are not treated as passes. The demo suite exercises add, persistence, search, review, edit and the styled delete confirmation without a hosted account.

These changes remain in the workspace for review. They are not pushed or published.
