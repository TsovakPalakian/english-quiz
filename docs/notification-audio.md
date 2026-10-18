# Notification Audio

Settings > Notifications offers 146 built-in choices: the original 12 synthesized
musical signals plus 134 CC0 recordings. Recordings are grouped into animals/birds,
frogs/toads, insects, water/weather, leaves/wood, and everyday sounds. Common and
American toads are separate recordings, not renamed frog effects.

`production/notification-catalog.json` is the source of IDs for both the server and
the production builder. The builder embeds the small selection catalog in
messages.js and copies each audio asset only after verifying its SHA-256 hash.
Only the selected recording is fetched; decoded built-ins have an eight-item
memory cache. Playback uses the existing notification enable/volume settings.

Audio excerpts are mono PCM16 at 24 kHz, at most four seconds, normalized with
short fades. `production/notification-audio/SOURCES.json` records each author,
original source URL, CC0 license and output checksum. `CC0.txt` contains the license.
These files are also deployed under `/notification-audio/`. Runtime playback never
contacts Freesound or GitHub. The import script verifies each original source's
CC0 declaration and pins the source repository commit; it is a maintenance tool,
not a deployment dependency (its conversion step uses macOS afconvert).

Custom sounds retain their private per-account storage and optimistic revision.
They may now be up to 10 seconds: 480,044 bytes for the canonical WAV format.
Existing saved IDs and shorter recordings remain valid. Source uploads are still
limited to 10 MB and are trimmed/resampled before sending them to the server.

Checks: `node --test test/test-notification-sounds.mjs`,
`node test/test-notification-sounds-ui.mjs`, and the usual chat UI regression.
The browser test decodes every recording, previews a toad, uploads a 10-second
clip, and retains the previous short-clip/reload checks. The optional authenticated
production test restores the original user settings and removes its test upload.
