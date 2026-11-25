# Offline investigation (before implementation, 25 November 2026)

The installed app's failure is reproducible from the implementation, rather than
an assumption about iPhone storage:

* `public/sw.js` v5 caches only install images, CSS and `offline.html`. Every
  navigation requires the network; on failure it deliberately returns the
  reconnect-only page. No Next HTML or JavaScript needed to start Review is cached.
* `offline-library.ts` stores per-owner snapshots in localStorage, not IndexedDB.
  This can help an already running page but cannot bootstrap a closed app when
  its JavaScript and route shell are unavailable.
* Workspace starts by awaiting Supabase `getSession()` and then a live words
  query. Its snapshot fallback only runs after failure with `navigator.onLine`
  false. An expired token refresh or a dead connection reported as online can
  therefore prevent or delay access to prepared local data.
* Grading has stable event IDs and the online RPC is idempotent, but there is no
  durable rating outbox. A failed request retains the card instead of recording
  local progress. There is nothing to sync after reopening.
* The existing review RPC timestamps events at server insertion. Replaying
  offline ratings through it alone would incorrectly date activity on reconnect.

Implementation requirements: cache only neutral, credential-free public shells
and their versioned static dependencies; retain owner-scoped snapshots; restore a
prepared local identity without waiting for refresh; atomically persist ratings
and optimistic snapshots in IndexedDB before advancing; use an owner-verified,
idempotent RPC for replay with original review time and concurrent-count checks.
Never cache authenticated HTTP responses, auth callbacks, tokens, AI or audio.
Explicit sign-out clears local access. Pending events remain owner-scoped until
that same account signs in and syncs; another account cannot submit them.

The offline RPC is an additive manual migration, separate from multilingual
architecture. Its schema must be checked before execution; deployment of the UI
alone does not establish that production replay is active.

## Implemented behaviour

The worker prepares credential-free shells and their versioned Next assets as a
complete set before activating. Successful navigations keep neutral shells fresh;
install failure retains the previous worker. Vercel's public commit SHA selects a
new shell-cache version; one previous generation is retained for existing tabs.
Auth callbacks, RSC/API responses, tokens and private recordings remain excluded.

IndexedDB commits each pending event and its optimistic Library snapshot in one
transaction. Events keep a stable UUID, original timestamp and local sequence.
An explicit sign-out removes local Library access; pending events stay scoped to
their owner. Reconnect/foreground retry verifies the current user, serializes by
owner where Web Locks is supported, rebases on fresh server state and acknowledges
only a confirmed response. Database event IDs and expected-count checks remain
correct even without Web Locks. Snapshot merging prevents stale tabs overwriting
newer review counts. Missing/deleted entries remain pending for attention while
other entries can sync; no unavailable item is fabricated or silently discarded.

Sync also runs from Home/Profile/Discover while the app is in the foreground.
Calendar refreshes after confirmed sync. It does not claim to run while the PWA
is closed: iOS Background Sync support is not assumed.

## Production schema verification

The owner ran the read-only preflight and additive migration on 25 November 2026.
The returned verification was:

```
marker: noted-offline-review-v1
owner_rls: true
offline_rpc_installed: true
authenticated_can_call: true
anon_can_call: false
```

An independent anonymous production probe was denied with SQLSTATE 42501 for the
new function. No real user vocabulary was modified by verification. PostgreSQL
fixture tests cover original review dates, duplicate retries, concurrency and
owner isolation. There is no multilingual migration or vocabulary reset.

## Limits and device verification

A new/unprepared device still needs an initial online visit and Library load.
Browser-managed caches/storage can be removed by the user or evicted by iOS;
without a remaining snapshot the app explains that preparation is needed. Local
storage failure does not advance a rating. Translation, Discover, uncached
Dictionary and uncached private audio remain online features. Physical iPhone
Safari/installed-PWA behaviour requires device testing; automated browser and
WebKit emulation do not establish it. Never clear site data before pending
reviews have synced.

Random Review session metadata also has an owner-scoped IndexedDB backup.
Offline grading commits its completed-card marker in the same transaction as the
rating and snapshot, so a localStorage quota error cannot reset the session after
reopening. Stale copies merge completed event IDs instead of removing progress.

## Final Add refinement (same palette and type weights)

The main field keeps its white fill and uses one 2px black boundary (3px on
focus with compensated padding). Its only internal action is Clear. Lookup is a
small external text action or keyboard Search/Enter; Shift+Enter inserts a line,
and Ctrl/Cmd+Enter saves. The meaning's accessible label remains, while its
visible heading and decorative card separators are removed. The initially empty
lavender card is compact. No additional SQL is required for these UI changes.

Browser tests use isolated backend fixtures and never write real production
vocabulary. Documents and static assets are served normally, networking is
actually disabled via the browser context, and pages are closed/reopened.
WebKit's service-worker-owned requests bypass Playwright routing, so its fake
backend transport is installed before the worker; app shells and assets still
exercise real service-worker/offline behaviour. This does not substitute for a
physical iPhone test or a real production-user write.
