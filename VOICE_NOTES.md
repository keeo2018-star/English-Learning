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

- `npm run lint`, `npm run typecheck`, `npm run build`: passed.
- `npm test`: 71 passed, including 9 PostgreSQL Voice Notes lifecycle/isolation tests. The updated read-only preflight was separately rerun against that database fixture.
- Chromium: 12 Voice Notes cases passed, including simulated permission denial, recording lifecycle/30-second stop/interruption/navigation cleanup, file validation, failed-upload retry without duplicate item insertion, lazy playback, mutual exclusion, deletion confirmation, type-change confirmation, stale URL cancellation, setup fallback and metadata refresh.
- Existing full browser suite was run; issues found were fixed and affected regressions rerun successfully. Five account/configuration-dependent cases were skipped. Hosted authenticated cross-user tests are not confirmed without disposable accounts and an applied migration.
- iPhone WebKit: 31 passed (Voice Notes plus Review audio and spacing). Microphone behaviour here uses controlled fixtures, not physical iPhone hardware.
- Production database/storage activation must still be confirmed through the preflight and administrator-run migration above; browser fixtures do not establish that activation.
