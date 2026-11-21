# Focused responsive layout audit

## Findings and fixes

- Dictionary's <=699px override forced its pronunciation group into a single-column
  grid. Removed that override. Shared pronunciation wrappers now use a wrapping
  flex row, 8px row/12px column gaps, nonshrinking 48px buttons and optional IPA
  text beside its own button. Missing IPA contributes no empty element/row.
  Playback, accent choice and the shared audio controller are unchanged.
- Dictionary My meaning used more header/padding space than necessary. Its header
  still has a 44px Edit target; padding is now 12px/16px with a 4px header gap.
  Chinese line height stays 1.7. Definition indentation falls from 24px total to
  16px, and consecutive definitions use the existing 12px spacing token.
- Dictionary examples previously displayed every returned result. Initially show
  two; a native button with aria-expanded/aria-controls exposes all remaining
  examples and can collapse them. Highlighting/translations remain intact; moving
  to another reference entry resets expansion. No dictionary information is lost.
- Related Words' fixed two-column grid cramped long terms on narrow phones.
  Content-width-based auto-fit columns now require 14rem each; narrower containers
  use one column, including enlarged root text. English wraps, Chinese previews
  retain their two-line limit, and Save stays in its own nonshrinking control.
- Mobile confirmation dialogs forced full-width stacked actions even at 375px
  where short actions fit. Wrapping flex actions now share a row when their
  minimum usable widths fit; narrow/large-text layouts still wrap naturally.
- Library's fixed mobile action grid overflowed Dictionary at 320px with enlarged
  text (85px available versus 106px scroll width in the measured baseline).
  It now uses a wrapping flex row with nonshrinking, >=44px-wide buttons. Normal
  labels remain together; larger labels wrap whole buttons rather than overflow.
- Global keyboard focus had a detached ring outside an existing border. A zero
  outline offset creates one contiguous boundary while retaining a visible 2px
  focus outline. Existing Add-title divider and Dictionary-close focus styles
  remain specialized and accessible.

## Shared system

Added semantic aliases --wb-control-gap (8px) and --wb-section-gap (24px), reusing
existing spacing tokens. Dictionary/Related Words/In the Wild reuse these aliases;
Related Words replaces repeated 16px corner literals with --wb-radius-small.
Existing card padding/radii, brand colors, natural vocabulary letter spacing,
centered flashcards, safe-area navigation clearance and Add editor are preserved.

Home, Add, Discover, Random Review, Due Words, Library and signed-in Profile were
checked at 320, 375, 390, 430, 768 and 1440px. No arbitrary page redesign or new
fixed heights were introduced. Scroll-to-bottom measurements wait for asynchronous
content rather than treating loading-induced height changes as a CSS defect.

## Verification

- tests/responsive-audit.spec.ts: six-width Dictionary screenshots, horizontal
  accent buttons without IPA, touch sizes, expandable examples, scrollable sheet,
  sticky Close, every main route's horizontal bounds and bottom-nav clearance,
  IPA, enlarged text, related-card readability, confirmation layout/focus, and
  long single-word/full-sentence titles.
- Existing Add/Review refinement tests cover editable multiline input and a
  keyboard-sized viewport with Save above the navigation/accessory region.
- Existing Dictionary controls/highlights, Related Words saves, IME and Review
  spacing regressions cover retained behavior. Contextual-example highlights are
  expected in Library/Review examples (the previous example-coverage feature),
  while vocabulary titles remain unhighlighted.
- Build, lint, typecheck and unit/database tests run before deployment.
- Mobile WebKit is browser emulation, not physical iPhone Safari/PWA testing.
  Real keyboard accessory bars, installed-PWA safe areas and OS text scaling still
  merit device checks. Supabase browser fixtures do not edit production user data.

Baseline screenshots: /tmp/noted-layout-before-dictionary-{width}.png.
Refined screenshots: /tmp/noted-layout-after-dictionary-{width}.png.
Capture baseline with NOTED_LAYOUT_BEFORE=1 and the pre-change build; use the
normal test mode for assertions against the refined build.

No SQL, Storage changes, new providers or paid services are required.
