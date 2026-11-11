# Expression Voice Notes

Voice Notes are optional, private, and available only for Expressions. No service-role key, extra navigation, transcription, or external audio service is used.

## Production activation: preflight first

1. In the existing production Supabase project's SQL Editor, run **`supabase/voice_notes_preflight.sql`** by itself. It is a read-only transaction ending in rollback.
2. Return the complete `noted_voice_notes_preflight` JSON result (export/copy the cell, not a cropped screenshot). It includes schema, bucket configuration, policies and grants; it does not include vocabulary or audio content.
3. Have that result checked against **`supabase/migrations/20261110_expression_voice_notes.sql`** before running the migration. Deployment of frontend code does not prove database compatibility or activation. Do not run an older or partial Voice Notes SQL snippet.
4. After compatibility is confirmed, run that entire migration file in the same project. It creates the private `noted-voice-notes` bucket and policies automatically. Do not create a public bucket or disable RLS. Conflicting/unrecognised existing Voice Notes objects cause a transaction failure rather than replacement. The migration can be rerun on its own recognised schema without resetting data.
5. Confirm SQL success, then test an Expression: upload a short clip, refresh, play it in Library and Review, replace/delete the clip, and sign in on another device. With a second account verify that the first account's recording cannot be listed, signed or downloaded. No existing Word, account or review history should change.

This migration is independent of the earlier continuous-Discover migration. It requires the existing public.words ownership/UUID IDs and content fields, auth.users, standard Supabase Storage tables, and enabled Storage-object RLS. The SQL preflight and migration guards check exact dependencies. Only a database administrator should apply it; no administrative key belongs in the browser or chat.

## Behaviour

- Add: the collapsed optional section is shown for Expressions. Opening it checks that storage/schema is available. Permission is requested only on Record. Upload accepts browser-decodable M4A/MP4, MP3, AAC, WAV, WebM, Ogg or FLAC. iPhone codec availability varies. A recording is limited to 30 seconds and 8 MiB; 3–30 seconds is recommended. Browser recording stops slightly early to allow container padding. Unsupported microphones retain Upload.
- Save creates the Expression first. If audio fails, the Expression remains saved and a retry uploads only its recording. That unsaved local draft is held in memory: retry or explicitly discard it before closing the page. It cannot survive a browser process shutdown. An uploaded pending file can be recovered from Library on another device.
- Library: compact inline recording controls follow the meaning. Native progress/duration controls load on manual playback. Replace retains the previous active file until upload and activation succeed; permanent deletion requires confirmation and keeps the Expression. Unfinished uploads and replaced-file cleanup remain tracked with retry actions.
- Review: standard pronunciation/autoplay is unchanged. Only Expressions with an available recording gain Standard / My recording. My recording is manual. All standard, personal-preview and saved-recording audio share playback ownership. Switching cards/unmounting cancels pending playback and stops audio.
- Type changes: an Expression with audio requires an explicit preserve-or-remove choice before becoming a Word. Preserved audio stays private and hidden on Words; changing back to Expression restores access. Item deletion cleans Storage through its API before metadata and item deletion. A database guard blocks deletion if any tracked or stored attachment remains, including deletion from an older client.

## Storage and safety

`expression_voice_files` holds one active recording per item plus pending/retired files for safe recovery. Clients cannot write metadata directly. Authenticated RPCs reserve an owned Expression's immutable path, validate the uploaded object's MIME/size, activate with a stale-device conflict check, and forget only files already removed from Storage. Existing learning/SRS fields are not changed by these RPCs.

The private bucket allows canonical audio MIME types and at most 8 MiB. Storage policies check both user ownership and the registered item/path. Restrictive policies protect this bucket even if another application has broader permissive Storage policies. Other buckets remain unaffected. Playback uses short-lived signed URLs created only on request; they are bearer links until expiry and must not be shared. Library metadata is batched for visible Expressions; audio is never preloaded across the Library. Metadata refreshes on focus/visibility and periodically while visible.

Duration is decoded/checked in the browser and its declared value is constrained in SQL. SQL validates actual stored MIME and byte size, but does not independently decode audio duration/content. There is no server media-processing service. User-owned files can only be accessed by their owner through normal authenticated access (and by project administrators).

Recording releases microphone tracks on stop, interruption and unmount. Temporary preview URLs are revoked. Backgrounding stops a recording; preview it before saving. Real iPhone Safari and installed-PWA permission/interruption behaviour still needs physical-device testing; browser emulation is not proof of hardware permission behaviour.

## Validation for this release

- Lint, type checking and production build passed.
- All 92 unit/database tests passed, including recorder state/race tests, noise/quiet-input/boundary tests, real WAV bytes, one-pass decode and fallback/resource-cleanup tests. Existing data/RLS preservation tests remain included.
- The full browser suite was run; issues it exposed were corrected, then all affected flows were rerun: 62 desktop tests passed, including real Chromium MediaRecorder encoding with a synthetic microphone. Five account/configuration-dependent cases in the full suite were skipped.
- iPhone WebKit: 48 passed across Voice Notes, Related Words, Dictionary controls, layouts, video and calendar/typography refinements. These are browser/device emulation and controlled audio fixtures, not physical iPhone microphones.
- The upgrade requires no new database migration. Hosted account isolation and physical iOS permission/interruption/noise handling still need disposable accounts / real-device verification; mocked browser tests do not establish those results.

## Hold recording and reversible silence trimming

This upgrade reuses the deployed private bucket, metadata/RPCs, playback owner and file limits; **no additional SQL is needed**.

The first explicit interaction prepares the microphone and supported recorder, then displays Ready to record. Hold again to record; release anywhere to stop. Permission preparation never automatically turns into capture. Releasing while permission is pending cancels that attempt; a late stream is immediately stopped. Keyboard Enter/Space and the small Use tap recording option provide a start/stop alternative using the same button. Recording status/timer begin only on MediaRecorder's actual start event, not on permission resolution or a delay.

Pointer capture plus window-level release/cancel listeners cover release outside the button. Lost capture, backgrounding, window blur and closing/unmounting stop/cancel capture. Final data is collected before releasing microphone tracks. Late callbacks cannot stop a newer stream. Encoder start/finalization have bounded timeouts; a ready, unused microphone is released after twenty seconds. A small Web Audio level meter reports input energy, not recognised speech.

After capture, client-side analysis uses frequency-limited energy, zero-crossing activity, an estimated background-noise floor, sustained activity and hysteresis. Only leading/trailing silence is removed, with approximately 250 ms safety padding. Internal pauses are preserved. A new PCM16 WAV contains the actual selected samples at the original decoded sample rate and channel count, preserving timing/pitch. Oversized output or unsupported/failed processing retains the playable original. No audio is sent to an AI, transcription or VAD service.

Detection is intentionally conservative and cannot prove speech in arbitrary noise. Near-silent clips cannot be accepted as new notes; uncertain clips can be previewed and explicitly kept as originals. Original and trimmed versions can be compared/restored before Save. Existing saved recordings are never reprocessed. Only the selected version is uploaded after explicit Save; original comparison is for the current unsaved draft, not a second stored attachment. Uploaded files retain the existing validation workflow.

Automated coverage includes audio boundary/padding/internal-pause/noise/quiet-input tests, real WAV payload checks, recorder readiness and late-event races, hold/release/cancellation, tap/keyboard fallback, silence/uncertainty, restore-original playback and real Chromium MediaRecorder encoding with a synthetic microphone. iPhone WebKit emulation cannot certify physical Safari/PWA microphone permission, hardware startup or OS interruption behaviour. Those remain real-device checks.
