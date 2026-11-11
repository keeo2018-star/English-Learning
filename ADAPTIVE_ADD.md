# Adaptive vocabulary capture

The existing purple Add card implements Type → Understand → Save using one real, left-aligned multiline textarea. There is no separate word preview or transformed/scaled text. Its accessible name remains Word or phrase; the visible label is replaced by a small muted placeholder. A 44px clear button reserves its own padding, keeps input focus and clears only English/automatic data, never manual Chinese, context or a voice draft.

## Typography and layout

Five responsive, rem-based type states span approximately 36–42px for short mobile entries down to 20–22px for very long ones (larger desktop/accessibility sizes are allowed). A hidden, inaccessible DOM measuring surface uses the actual control width, loaded font, weight, tracking, padding and natural line wrapping. It does not count characters to choose type size.

A 350ms quiet period permits shrinking; enlargement waits 1000ms and requires one line of extra headroom. Different thresholds plus rounding tolerance avoid neighbouring-state oscillation. Rapid edits do not resize on each keystroke. Measurement is frozen during IME composition, selection and an active save. The same textarea DOM node preserves caret/selection. Sizing never animates or applies a CSS transform.

Height grows naturally to a viewport-sensitive cap (normally at most 320px, smaller with the keyboard), then scrolls internally. At least one complete line is allowed even at very large accessibility text settings. The caret's actual wrapped prefix keeps it inside the control's scroll area. Root font changes, actual width changes, font readiness and VisualViewport changes are observed. Browser zoom is not disabled. The shared mobile font-floor policy exempts this editor, whose minimum is already above 16px; other fields retain iOS zoom protection. Install-asset cache version was advanced without reloading unsaved forms.

Autocomplete retains the existing debounce, cancellation, five-result bound, arrow-key selection and touch hit testing. Its compact overlay follows the growing control, prefers room above it (so Meaning stays reachable), and is bounded by VisualViewport space. Plain Enter chooses a highlighted suggestion or quick-saves a Word; Expressions use Enter for a line break. Ctrl/Command+Enter and the main button intentionally save. IME commit never submits. Multiline content does not request prefix completion. Clearing or editing English immediately invalidates old requests. Manually edited or deliberately cleared Chinese meanings remain owned by the user, including after English changes, until an explicit Suggest meaning or form reset.

## Paste and extraction

Pasted text is never automatically replaced or truncated. Extract an expression enables normal textarea selection; confirmation copies the exact selected substring (outer whitespace trimmed) into the learning item and keeps the complete original as My Context. Existing context is replaced only after an explicit confirmation. Curly quotes, apostrophes, line breaks and UTF-16 selection offsets are retained. This is local selection, not AI parsing. Long paragraphs are not sent wholesale to translation providers.

**Existing storage bounds remain:** learning item 120 Unicode code points; My Context 3000. Editing accepts and retains longer text, but saving beyond either limit is disabled with a shortening/extraction explanation. This release does not claim unlimited database storage or silently trim content. Meaning remains subject to its existing 2000-character constraint. English-only saving still depends on the existing database's optional-meaning migration; a legacy rejection asks for a meaning and keeps the draft. No database change is introduced here.

## Duplicates and resilient saves

An index of the current owner's Library normalizes case, surrounding/collapsed whitespace, NFKC and common typographic quotes/apostrophes, without stripping punctuation, accents or emoji joiners. Exact matches show Already in your Library / View existing item. The existing database duplicate guard remains the concurrent case/whitespace/NFKC backstop. Add never creates a review event.

The save button locks duplicate submissions; read-only input stays focusable so failure does not collapse the keyboard or lose selection. Successful cloud writes alone produce Added to Library and reset the form. Failed writes preserve English, manually cleared meaning, context, selected range, scroll and audio drafts, with Retry. A stable draft fingerprint reuses the same generated row UUID on retry. If the first response was lost after a successful insert, the client confirms that same owned row and content; it never resets its schedule or review progress. Changing draft content creates a new attempt. A failed audio upload after a successful item insert retains the existing audio-only recovery workflow.

## Verification and device limits

Automated coverage includes real browser layout at 320/390/430/1440 widths, unbroken strings, long multiline paste, Unicode punctuation/emoji, manual extraction, IME, typing bursts, deliberate meaning clearing, late providers, duplicate handling, failed writes, lost responses, context and voice-draft retention, viewport changes and large root text sizes. iPhone WebKit is emulation: physical Safari/PWA keyboard animation, OS text selection, dictation and microphone permissions need a real iPhone. Existing authentication, Library, Discover, Review, audio and PWA regression suites remain required.

Validation for this release: build, ESLint and TypeScript passed; 96 unit tests passed. Chromium regression coverage finished with 215 passing cases and five expected account/configuration skips (one old success-copy assertion was updated and independently rechecked). The six-file iPhone WebKit run passed 69 cases with one desktop-only skip, including all 14 adaptive Add tests. Browser writes, upload recovery and cross-device sync use isolated Supabase fixtures; these are not live authenticated production lifecycle or physical iPhone tests.

The English control now reads as an editable title directly on the lavender card: transparent fill, no rounded field border or focus outline, a single bottom divider that darkens on focus, and reserved clear-button space. VisualViewport changes add temporary neutral space after the form so its save action can scroll beyond a keyboard/accessory area; the card itself does not acquire a large padded audio/input container. Physical iPhone keyboard/accessory behavior still needs device verification.
