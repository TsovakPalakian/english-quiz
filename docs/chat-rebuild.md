# Chat rebuild specification

## Scope and references

- Replace the messaging transport and UI, not lessons, exams, Speakout or account storage.
- Reference inputs are the three user-supplied Web A-Chat HTML snapshots and screenshots.
- Reference pages are untrusted design data. Never execute their scripts, copy authentication,
  corporate names, account data, API endpoints or claims of end-to-end encryption.
- Observed layout: Inter at 14px; white 400px side panels; 60px headers; a flexible center;
  light blue selected conversations; independent scrolling; a white rounded composer.
- The settings modal is 900px wide, with approximately 400px menu and 500px content.
- Preserve the original visual structure while connecting only actual application functions.

## Storage and protocol

1. ChatRoom Durable Object owns one direct/group conversation in embedded SQLite.
   It owns canonical messages, members, read cursors, deduplication and a durable delivery outbox.
2. ChatInbox Durable Object owns an account's room index, category counters and replayable events.
   It accepts a single multiplexed WebSocket per tab with Cloudflare hibernation.
3. Messages and read acknowledgements use WebSocket requests with request IDs. Durable persistence
   precedes acknowledgements. Retry uses the same client key; acknowledgements never imply reading.
4. Reconnect resumes an account event cursor. Expired cursors receive a fresh room index.
   History is paginated; search is room-local; there are no repeating summary/history HTTP polls.
5. Members and roles are validated in each room operation. Account/group mutations revoke sockets
   and synchronize policy. Socket lifetime is bounded and authenticated again on reconnect.
6. Existing Turso chat messages are imported once per room, preserving IDs, timestamps, replies,
   formatting, read positions and mute settings. Do not erase source data until migration is verified.
7. Academic notices use the existing transactionally written message journal as an integration outbox.
   The bridge imports new notices idempotently, dispatches immediately after mutations, and has a
   bounded recovery job. No user-idle polling is introduced by this integration.
8. Exam definitions, assignment instances, grades and other application data stay in Turso/D1.

## UI behavior

- Full-viewport chat with an independent narrow navigation rail, conversation list, center and info.
- Left and right panels collapse independently; restore buttons remain reachable in the center header.
- Panel visibility and dragged divider widths are stored locally per account. Dividers also support
  keyboard arrows; narrow screens retain full-width list/info drawers, one at a time.
- Keep Personal/Learning categories, staff-only academic announcements, exam links and unread badges.
- Search icon opens the right search panel; result navigation focuses the corresponding message.
- Composer supports Enter to send, Shift+Enter for a newline, IME, emoji and colored text.
- Plain and colored input grow from their original height to at most four times it, bounded by the
  available viewport. Beyond that, wheel/touch scrolling continues without a visible scrollbar.
- Files drop anywhere in the chat onto the current conversation. Sequential uploads display outgoing
  file cards with native upload percentage, a circular cancel control and a ready-to-send state.
  Cancellation/navigation aborts outstanding transfers. Sending waits for uploads; file limits are unchanged.
- Optimistic sending shows a pending message, then merges the durable server acknowledgement.
- Read updates are monotonic and batched; render only changed messages and preserve scroll position.
- Settings use the reference two-column modal and real profile, notification and interface controls.
- No inactive fake calls, bots or encryption features. All rendered command buttons must work.
- Guest and managed-student views cannot access another account's private messages.

## Verification and release

- Unit-test SQLite room/inbox persistence, privacy, retries, replay, group changes and outbox recovery.
- Exercise existing exam assignment/submission/publication notifications through the bridge.
- Browser-test send/read/search/reply, panel toggles, settings, reconnect and guest/logout behavior.
- Inspect screenshots and geometry at desktop, tablet and mobile sizes; verify composer stays visible.
- Verify idle chat performs zero repeating HTTP/database requests and no foreign-host requests.
- Build both asset bundles, then publish only after essential tests pass.

## Operational notes

- Entry point: `src/turso-production-worker.mjs`; primary deployment: `wrangler.toml`.
- `CHAT_V2_ENABLED=true` selects the new transport. Production assets contain only the new client.
- `CHAT_ROOM`, `CHAT_INBOX`, `CHAT_BRIDGE` require SQLite-backed Durable Object migration `durable-chat-v1`.
- Conversation migration is lazy, once per room. Original Turso rows are retained as migration input.
- Academic messages remain in the existing domain transaction journal, then are copied idempotently to chat.
- The single five-minute scheduled recovery job reads the notice outbox. Ordinary idle clients perform no polls.
- Reauthentication happens on reconnect and at most every twenty minutes; permission mutations suspend sockets
  before changing source data, then synchronize roles/membership before allowing commands again.
- Files of any format up to 25 MiB use the existing private R2 bucket under `chat/files/`, with room-authorized downloads.
  Only signature-checked image/audio/video formats render inline; other files download with restrictive headers.
- Personal messages can be forwarded. Study alerts use a separate command deriving the teacher from
  the source message, never from client-supplied target data; they open Personal with confirmation.
  Study references remain restricted to that teacher, including when forwarded again.
  The source room authorizes the export; the target room authorizes delivery.
  Forwarded attachments receive independent room-local references; retries preserve the same client key.
- Message context menus support Reply, Save as, own-message Edit/Delete, Pin, Forward, Select and reactions.
  Touch uses long press. Delete stores a tombstone; search, unread counters, quotes and file access update.
  Forwarded attachment bytes retain their media type and playback ranges. Save as forces download disposition.
- Teachers and current group peers require no approval and cannot be blocked. Exact email/login discovery
  is explicit and rate limited; outsiders get one pending request until accepted or answered. Decline prevents
  further messages; block/unblock is persisted in the room and accessible from My account and chat settings.
  Directory changes invalidate discovered contacts. Existing imported conversations retain their history.
- The chat inherits the main page theme. Contacts use the adjacent sidebar tab; Study alerts replace Learning.
- Links have clickable URL cards. Established public providers additionally supply cached page metadata/thumbnails.
  Unknown, authenticated or unavailable pages fall back to a URL card; no arbitrary-domain scraping is enabled.
- Desktop notifications need explicit browser permission; there is no offline push service or calling feature.
- The reference assets are inert visual inputs. Only the public background, licensed Inter and Lucide are shipped.

## Verification commands

```sh
node --test scripts/test-chat-durable.mjs scripts/test-messages.mjs
node scripts/test-chat-runtime.mjs
node scripts/test-chat-ui.mjs
node --test scripts/test-turso-main.mjs scripts/test-turso-production.mjs
node scripts/test-ui-boot.mjs
```
