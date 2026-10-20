# Microsoft Sign-In Setup

Status: implemented locally, not configured or published. No live Microsoft account or email was used in tests.

## Register Lumiscia

1. Open [Microsoft Entra](https://entra.microsoft.com/) and select Entra ID -> App registrations -> New registration.
2. Name: `Lumiscia`.
3. Supported account types: **Any Entra ID Tenant + Personal Microsoft accounts**. Older portal wording is **Accounts in any organizational directory and personal Microsoft accounts**. This corresponds to `AzureADandPersonalMicrosoftAccount`, not single-tenant or organizations-only.
4. Platform: **Web**, not SPA. Add this exact redirect URI:

   ```text
   https://lumiscia.org/api/auth/microsoft/callback
   ```

5. Register the application. Record its **Application (client) ID**.
6. Open Certificates & secrets -> Client secrets -> New client secret. Record its **Value**, not Secret ID, using a secure local secret store. Note the expiry date and rotate it before expiry.

Do not enable implicit grants, public client flows, or grant subscription/resource administrator roles. The application uses authorization code + PKCE and requests only `openid profile email`; it does not use Microsoft Graph mailbox/file access or refresh tokens. Organizational administrators may restrict user consent and may need to allow this application under their own policy.

Registration requires access to a Microsoft Entra tenant and permission to register apps. If the portal reports that you lack these, resolve tenant/account access before proceeding; do not grant broad Azure resource roles merely to enable sign-in.

## Configure Cloudflare

Store these values in the `learn-english` Worker secrets using the root configuration. Enter values interactively; do not put secrets in chat, source code, screenshots, shell command arguments, or Git.

```sh
npx wrangler secret put MICROSOFT_CLIENT_ID --config wrangler.toml
npx wrangler secret put MICROSOFT_CLIENT_SECRET --config wrangler.toml
```

These commands modify the deployed Worker configuration. Run them only when ready to activate the integration. The existing session secret and EMAIL binding are also required. Do not replace them.

After configuration, publish with the production asset builder and root `wrangler.toml` under the normal deployment workflow. `/api/auth/providers` exposes only configuration booleans; Microsoft remains hidden until configured. Local role-preview servers mock the API and cannot validate real Microsoft sign-in.

## Account Behavior

- The first Microsoft sign-in asks the user to confirm a contact email by a one-time code. Microsoft email/preferred_username claims are suggestions, never automatic proof of ownership of an existing Lumiscia account.
- After confirmation, a stable issuer + subject identity is linked to the Lumiscia account or pending registration. Later sign-ins use that identity, even if Microsoft changes its email claim. A different tenant/account with the same email is not automatically linked.
- New accounts without an invite remain pending. Student invites automatically approve and assign the group. Teacher invites require matching verified email and manual approval by their inviter/developer.
- Existing inactive, revoked or deleted accounts remain blocked. Microsoft sign-in never grants roles from Microsoft token claims.
- The application verifies JWT signatures, key issuer, tenant issuer, audience, expiry, version and nonce. OAuth state is bound to an HttpOnly browser cookie and consumed transactionally; code exchange uses PKCE. Temporary flows expire after 10 minutes.
- Authentication API payloads are excluded from Bugs request capture so that OAuth state and confirmation codes are not recorded there.

## Verification After Activation

Check personal and work/school accounts separately. Verify the first email-confirmation step, subsequent direct sign-in, an uninvited pending registration, student/teacher invitations, account blocking, cancellation, and logout. Do not use a developer account for a new-student invitation test.

Local tests use signed synthetic JWTs, mocked Microsoft endpoints, in-memory SQLite and local D1/Miniflare. These do not prove tenant consent, configured redirect URIs, or real Microsoft token exchange.

## Official References

- [Register an application](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
- [OpenID Connect](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc)
- [ID token claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference)
- [Microsoft sign-in branding](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps)
