# Security Sessions

Settings > Security lists the authenticated account's sessions, not individual
chat tabs. Each login has a stable random ID; idle renewal keeps that ID.

## Persistence

- The active study database stores `security_sessions`: owner, opaque record ID,
  JSON audit metadata, optimistic revision, and expiry timestamp.
- Turso creates the additive table/index on first use. The generated Neon study
  migration includes both; run the existing developer database **Prepare** action
  before activating an older Neon schema. No account or learning rows are copied.
- Session records contain no cookies, passwords or API tokens. An internal digest
  detects credential changes; it is never returned by the sessions endpoint.
- R2 stores only the existing auth revocation markers, scoped to the auth provider.
  Ending a session writes its denylist marker before updating the SQL audit row.
- Scheduled cleanup removes session records older than 90 days after expiry/end.
  Existing R2 revocation-marker cleanup is unchanged.

## Boundaries

- GET/POST `/api/me/sessions` requires live authentication. SQL always filters by
  the authenticated owner; developers cannot use this endpoint to inspect others.
- Revocation invalidates the whole renewed-cookie lineage and closes only that
  session's identified chat sockets. Incoming/outgoing chat also checks revocation.
- Audit failures do not break existing login/logout. Security displays an error
  rather than silently substituting another database or an empty successful list.
- Audit metadata uses request User-Agent and trusted Cloudflare IP/geolocation;
  location is approximate and may describe a VPN/provider exit, not a home address.
  Google Maps is a normal click-through link; no map iframe is loaded.
- Old cookies are adopted when observed, with original sign-in time unknown.
  Prior sign-ins cannot be reconstructed. Last activity follows idle renewal and
  Security requests, not every keystroke. History contains successful sign-ins,
  not failed password attempts. Missing metadata is shown as unavailable.

## Checks

`node --test scripts/test-security-sessions.mjs scripts/test-neon-auth.mjs scripts/test-chat-durable.mjs scripts/test-turso-main.mjs`

`node scripts/build-turso-production-assets.mjs` then `node scripts/test-chat-ui.mjs`
