# Editorial layout and centered flashcards

This refinement keeps the current Noted palette, type family, rounded controls, routes and learning behavior. It changes layout and presentation only; no database migration, dependency or API change is required.

## Shared rules

- Use the existing spacing scale: 8, 16, 24, 32 and 48px, with 4px for small optical/control gaps.
- Shared page gutters: 20px on phones, 40px on tablets and 64px on wider desktop screens.
- Editorial card padding: 24px on phones and 32px above 700px. Learning cards use 24/40px padding and a shared 24/32px responsive radius.
- Standard pages remain left aligned. Learning card content is centered within a maximum 760px width, with responsive 40–80px word type (40–49px across phone widths) and natural expression wrapping. Actions align at the bottom; meanings, examples and metadata use a tighter 16px rhythm.
- Normal controls retain 48px touch targets; secondary text actions retain 44px. Mobile form text remains at least 16px to avoid iPhone focus zoom.
- App bottom clearance and scroll padding share a 112px plus safe-area token. Repeated footer branding/slogan is removed; the understated privacy link remains.

## Screens

Discover and both Review modes share the `wb-learning-card` composition. Pronunciation uses the existing shared controller through a compact 48px speaker; part of speech is subtle metadata. Examples stay centered and lighter, without the heavy side rule. Review's dictionary action follows the example, before the primary recall buttons. Learning styles target direct card children so a nested dictionary dialog does not inherit oversized word styling.

Add keeps English, meaning, then content type. The English input and select are approximately 48px high; the resizable meaning field starts at three rows. Suggest meaning sits beside its label, with lookup status immediately under the field. Form groups use 16px spacing and the main submit action stays strong.

Dictionary is explicitly left aligned even when opened from a centered Review card. Its header, UK/US pronunciation rows, personal-meaning editor and reference sections are more compact. Definitions and examples precede the video section so reference content is visible sooner. POS labels are quiet metadata, Close retains its single contour/focus treatment, and edit, dismissal gestures and keyboard behavior remain intact. The smaller video preview retains the official player and controls; installed-PWA copy clearly identifies external YouGlish access.

Home retains its three current action colors and hero typography, with spacing aligned to the shared rhythm. Library, Profile/auth and collection views inherit the consistent gutters, card padding and calmer header/footer spacing.

## Validation

`tests/layout-refinement.spec.ts` checks 320, 390, 768 and 1440px layouts: compact form bounds, shared gutters, centered long-word/expression cards, left-aligned dictionary opened from Review, reference-before-video ordering, pronunciation touch targets, no overflow, and action clearance above bottom navigation. It captures screenshots for visual inspection. Existing interaction suites validate Add suggestions, review grading, dictionary editing and gestures, pronunciation, authentication and PWA behavior. iPhone WebKit is exercised through `playwright.iphone.config.ts`; this is browser simulation rather than physical device testing.

Validation on 2026-11-07: production build, ESLint and TypeScript checks passed; all 51 unit/database tests passed. The complete Chromium suite passed 159 tests with five expected environment/account skips. The relevant iPhone WebKit suite passed 44 tests, with one Chromium-only native-touch test skipped; portable dismissal gestures passed in WebKit. Visual snapshots were inspected for mobile and desktop Add, Dictionary, Discover and both Review modes. Legacy visual assertions were updated for the intended compact preview and shared desktop card padding; actual official-player dimensions remain checked independently.
