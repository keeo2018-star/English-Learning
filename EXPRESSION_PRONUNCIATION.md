# Expression pronunciation and natural vocabulary tracking

## Findings

The previous speech sanitizer removed curly apostrophes as non-ASCII punctuation. `hors d’oeuvre` became `hors d oeuvre`: a production lookup of the latter returned 404 while the correct apostrophe form returned 200. Ligature spelling is now folded only for lookup; complete spoken text retains its lexical punctuation and Latin letters.

The lookup endpoint returned an empty phonetics list for `hors d'oeuvre`, `caught off guard` and `take stock of`. That did **not** mean their audio was missing. Independent checks through the existing production audio proxy returned complete-item MPEG recordings: hors d'oeuvre UK 8736 bytes / 1.092s, US 12064 bytes / 1.508s; caught off guard UK 37920 bytes / 1.896s; take stock of UK 34511 bytes / 1.78025s; I wouldn't put it that way UK 6264 bytes / 2.088s. The hors d'oeuvre files decoded with nonzero signal peaks around -4.5/-4.3 dB. Direct UAPI requests from this Cloud environment timed out; the production proxy path was tested independently and succeeded. No claim of missing provider recordings is based solely on lookup metadata.

The old controller also marked TTS as playing immediately after calling speak, without observing start, detecting a paused engine or bounding a silent/stalled request. These paths could leave a speaker looking active without confirmed playback. Actual iPhone restriction behavior is not verified on a physical device.

## Playback

All standard controls keep the same shared pronunciation controller and owner tokens. Source priority is complete-item metadata audio, then a verified response from the existing official UAPI audio endpoint for the entire canonical item (including when phonetics is empty), then complete-expression browser SpeechSynthesis, then a visible unavailable/blocked status. A partial-word metadata recording is rejected. Unconfirmed endpoint responses must pass the existing fixed-host proxy, audio MIME/size checks and browser playback; a failed candidate is not blindly played from an unverified external URL. Public audio preparation is deduplicated and bounded, with a short transient-negative cache. Private voice notes retain their separate purpose and shared playback ownership.

Manual speakers can recover their own blocked request in the trusted gesture; preparing a different manual control does not retry a stale owner. Existing selected-Due-mode recovery remains available. TTS resumes a paused engine, prefers the requested English locale, can use another English voice, handles delayed voices and rejects stale utterance callbacks. A newly available requested-accent voice supersedes a previous fallback on the next request without replaying already-started speech. Playback/start timers prevent indefinite false-playing states. New requests cancel previous audio/TTS, and cleanup removes per-request timers/listeners. Browser autoplay restrictions are respected and surfaced for manual recovery.

## Typography

`--wb-brand-tracking: -.055em` was explicitly applied by the learning-card rule, Dictionary module and Library mobile rule, as well as inherited from global headings. There are no Tailwind tracking classes or inline horizontal-stretch transforms causing this. Brand/page headings retain the current identity; actual vocabulary titles and the Add title/probe use `letter-spacing: normal`.

Computed values were measured on Due, Random, Library, Dictionary and Discover titles, at the same 390px and 1440px viewports before and after. At 390px the Review word was 40px / weight 700 / -2.2px tracking; natural tracking increased the measured text width from about 215px to 244px without changing font size or weight. Library was -1.716px and Dictionary -1.98px before. Final vocabulary computed tracking is `normal`. Existing font family, sizes, alignment, card colors and spacing are preserved; long content wraps instead of being horizontally stretched or shrunk.

## Verification limits

Audio failures, blocked autoplay/manual recovery, whole-Expression text, UK/US selection, delayed voices, stale requests and overlap are tested with isolated browser fixtures. A separate optional test decodes the real downloaded hors d'oeuvre MP3 and checks native desktop media time advancement. That is not a physical audio listening test or an iPhone test. Real iPhone Safari and installed PWA audible output, OS voice inventory and gesture policy remain unverified. No database migration, user-data reset or paid speech API is introduced.

## Release checks

Build, lint and typecheck passed; all 102 unit tests passed. The full Chromium run passed 252 cases with six expected configuration/live-sample skips and exposed one fixture that paired serendipity with meticulous audio; that fixture was corrected to match the requested item. Subsequent desktop rechecks passed the corrected Dictionary flow, the actual MP3 decoder check, natural-title/long-content cases, and the audio fallback suite. An added route-ownership regression exposed Library's Review-highlighted navigation retrying the previous item; the final four navigation/current-mode checks passed after routing by the actual pathname/mode. The final iPhone WebKit run passed 54 cases with one optional real-sample decoder skip. TTS mocks report real lifecycle start events rather than assuming a speak() call means audible playback. Physical-device audio is still unverified.
