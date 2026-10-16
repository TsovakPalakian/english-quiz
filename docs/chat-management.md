# Chat management and encryption

Changes are scoped to chat. Personal contains direct conversations with history
(including conversations intentionally cleared). Contacts contains people followed
by groups. Blocked and archived contacts are excluded from ordinary lists.
Archived Chats opens a separate list at the top; new messages do not unarchive it
or contribute to global unread indicators, sounds, or desktop notifications.

Right-click a person or group for chat actions. Preferences apply only to the
current account, never to everyone in a group. Only an authorized teacher may
clear personal group history for everyone. Existing protections prevent deleting
and blocking protected educational contacts. Deleting a group chat blocks that
chat for the actor, not its individual members or academic membership. Study
alerts are not cleared by these actions.
Clear/delete are logical visibility removal, not a promise of physical erasure of
all backups. A self-only clear preserves the other participant's history.

Folders are account-private references, sorted after manually ordered pins.
Deleting a folder does not delete its chats. Timed mute is evaluated from a stored
UTC deadline; archiving overrides notification settings. Per-chat sound overrides
the selected melody, but not global disable/volume. Browser popup restrictions
still apply to Open in window.

## Encryption

Chat uses AES-256-GCM with a fresh random 96-bit nonce for every value and a
128-bit authentication tag, implemented by pinned @noble/ciphers. Tests compare
the result with native Web Crypto. Authenticated context separates storage
objects and fields. This is server-side encryption at rest, NOT end-to-end
encryption: authorized application servers decrypt responses.

CHAT_ENCRYPTION_KEY is a dedicated base64-encoded 32-byte Cloudflare secret.
`node scripts/provision-chat-encryption.mjs` creates it only when absent, never
overwrites an existing key, and stores a recovery copy in the git-ignored
`.local-secrets/chat-encryption-v1.key` (directory 0700, file 0600). Preserve this
copy in an access-controlled backup; losing all copies makes messages unreadable.
No key is embedded in frontend assets or source control.
Set CHAT_ENCRYPTION_REQUIRED="true" in the root worker configuration before
deploying this version (the local root wrangler.toml already has this setting).
Library API reference: https://github.com/paulmillr/noble-ciphers#usage

Encrypted fields: Durable Object message bodies and formatting, metadata
(including selected quotes/forward copies), inbox room summaries/events and room
delivery outbox. Plaintext full-text indexes are removed. Search decrypts
authorized candidate messages on the server, scanning in batches; very long
histories cost more CPU than an unencrypted FTS index.

Legacy Durable Object records migrate in transactions of up to 100 records per
field on access/alarms. Legacy SQL chat history is sealed after successful import;
new SQL messages and generated study events are sealed before insertion.
Thus migration is incremental, not an assertion that every dormant conversation
has already been encrypted. SQL business records,
attachment blobs, external logs, and old provider backups are not retroactively
encrypted by this field-encryption layer. Attachment access controls and provider
storage encryption remain unchanged.

An invalid key, missing required key, authentication-tag failure, or unknown key
version fails closed without returning ciphertext as a message. Keep old keys
when rotating: set CHAT_ENCRYPTION_KEY_ID to a new id, replace the active secret,
and retain the old id/base64 key mapping in CHAT_ENCRYPTION_PREVIOUS_KEYS (also a
Cloudflare secret). Deploying a wrong key or removing old keys is not a rollback.
Do not disable encryption or roll back to a version that cannot decrypt records.

## Validation

Write tests before implementation, then run the durable, encryption, notification,
security-session, application regression and local browser suites. Production
account interaction tests are intentionally not run for this change.
