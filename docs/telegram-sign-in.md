# Telegram Sign-In

Implemented locally; not configured or deployed. Existing approval and invitation rules are unchanged.

## Setup

1. Open the official [BotFather](https://t.me/BotFather) and create or select the Lumiscia bot. Use the Lumiscia name and logo.
2. In the BotFather mini app select the bot, then **Login Widget**. Register these Allowed URLs:
   - `https://lumiscia.org`
   - `https://lumiscia.org/api/auth/telegram/callback`
3. Keep the default RS256 signing algorithm. Obtain the Login Widget **Client ID** and **Client Secret**. The OAuth secret is not the Bot API token.
4. Add `TELEGRAM_CLIENT_ID` and `TELEGRAM_CLIENT_SECRET` as secrets in the Cloudflare `learn-english` Worker. Do not paste secrets into chat, screenshots, source code or command arguments.
5. Publish using the production builder and root wrangler.toml. Verify `/api/auth/providers` reports `telegram: true`.

The button remains hidden until both values are configured. Local preview servers mock authentication and cannot complete real Telegram login.

## Behavior And Security

- First sign-in requires a contact email confirmed with a code, preventing unverified linking to an existing Lumiscia account. Telegram email/username is never accepted as email ownership.
- Subsequent sign-ins use the verified Telegram issuer and subject, not the username.
- Uninvited new accounts remain pending; student invites auto-approve and assign the group; teacher invites require the invited email and manual approval.
- Authorization code + PKCE, one-use cookie-bound state, issuer/audience/signature/expiry validation, separate Telegram identities and email-code purposes. Nonce is checked when returned; PKCE binds the exchanged code even when the provider omits nonce.
- Requests only `openid profile`: no phone number or bot messaging permission. Tokens are exchanged server-side and not stored. Authentication requests are excluded from Bugs payload logging.
- Deleted/inactive/revoked accounts cannot log in. Account deletion removes the Telegram mapping.

## Verification

Synthetic JWT, local account-handler and isolated browser tests cover validation, provider separation, replay, email confirmation, approvals and invitations. Real Telegram authorization and live email delivery require configured credentials and user testing after publication.

Official protocol and setup reference: [Log In With Telegram](https://core.telegram.org/bots/telegram-login).
