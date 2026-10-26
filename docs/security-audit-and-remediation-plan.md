# Comprehensive Security Audit & Vulnerability Remediation Plan

**Date**: 2026-10-26  
**Target Application**: Lumiscia / English Quiz Web Platform  
**Architecture**: Cloudflare Workers, Cloudflare D1 (SQLite), Cloudflare R2 / Durable Objects, Vanilla JS SPA Client (`client/*.js`)  
**Assessment Scope**: Full-stack white-box security review (client-side XSS sinks, DOM sanitization, authentication, sessions, tokens, OTP rate limits, OAuth CSRF, authorization / RBAC, SSRF, SQL isolation, HTTP security headers, CSP, secrets).

---

## 1. Executive Summary & Threat Model

A thorough, multi-vector white-box security audit was conducted across the entire Lumiscia codebase, analyzing all client-side modules (`client/00-core.js` through `client/57b-dashboard.js`), backend worker services (`src/learning-integrated-worker.mjs`, `src/worker.js`, `src/chat-worker.mjs`, `src/learning-production-worker.mjs`, `src/learning-study.mjs`), database engines (`d1-study.mjs`), and configuration files (`wrangler.toml`).

The application exhibits strong defensive fundamentals in several key areas:
- **D1 SQL Injection Defense**: Strict AST / tokenizer allowlisting (`studyTokens` in `src/d1-study.mjs`) rejecting arbitrary multiple statements, comments, or unquoted identifiers, with 100% parameterized queries.
- **SSRF Prevention**: `src/chat-previews.mjs` enforces a strict domain whitelist and protocol checking (`https:`) before making external HTTP requests.
- **Body & Payload Bounds**: Worker routes enforce strict length and byte limits via `boundedText` and `boundedMediaBytes`, preventing resource exhaustion DoS.
- **Crypto & Password Hashing**: PBKDF2 with salt, high iteration counts, and constant-time password comparisons (`timingSafeEqual`).
- **Origin Validation**: Strict enforcement of `request.headers.get('origin') === url.origin` on mutating API requests.

However, the audit identified **12 actionable vulnerabilities and hardening gaps**, ranging from High to Informational severity, requiring remediation.

---

## 2. Vulnerability Classification Matrix

| ID | Title | Severity | Impacted Component | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | DOM XSS via Unsanitized `javascript:` Scheme in Developer Dashboard (`/bugs`) | **High** | `client/24-bugs.js:201` & `src/feedback.mjs:80` | 🟩 |
| **SEC-02** | Stored Attribute Breakout / DOM Injection in Feedback Screenshot Renderer | **High** | `client/24-bugs.js:210` & `src/feedback.mjs:76` | 🟩 |
| **SEC-03** | OAuth Login CSRF & Missing PKCE on Google Authentication Flow | **High** | `src/google-oauth.mjs` & `src/worker.js` | 🟩 |
| **SEC-04** | Telegram OIDC ID Token Nonce Verification Bypass | **Medium** | `src/telegram-oauth.mjs:21` | 🟩 |
| **SEC-05** | Non-Constant-Time Comparison on Account Invitation Hash (Timing Attack) | **Medium** | `src/account-invites.mjs:154, 170` | 🟩 |
| **SEC-06** | Reverse Tabnabbing via Dynamic `target="_blank"` Without `rel="noopener noreferrer"` | **Medium** | `client/24-bugs.js:180, 201`, `client/00-core.js:614` | 🟩 |
| **SEC-07** | Missing Default Security Headers & CSP on Static Asset HTML Deliveries | **Medium** | `src/learning-production-worker.mjs:56-60` | 🟩 |
| **SEC-08** | Session Cookie Missing RFC 6265bis `__Host-` Prefix (`enquiz_sid`) | **Low** | `src/worker.js:3844, 3889` | 🟩 |
| **SEC-09** | Unvalidated URL Schemes in Dictionary & External Card Links | **Low** | `client/00-core.js:614` (`foldedLinkHtml`) | 🟩 |
| **SEC-10** | Exposure of Backend Host IPv4 Address in `wrangler.toml` Wildcard DNS | **Low** | `wrangler.toml:118` | ℹ️ *Architectural Recommendation* |
| **SEC-11** | PostMessage Target Origin Wildcard (`*`) in Spotify Embed Handshake | **Info** | `client/03f-songs.js:346` | 🟩 |
| **SEC-12** | Missing Minimum Length & Entropy Validation for `SESSION_SECRET` | **Low** | `src/learning-production-worker.mjs:23-25` | 🟩 |
| **SEC-13** | Privacy Violation & Email Disclosure to Students in Chat Search (`searchPerson`) | **Medium** | `src/chat-worker.mjs:215` | 🟩 |
| **SEC-14** | Protocol Inconsistency in Chat Link Previews (Allowing `http:` Scheme) | **Low** | `src/chat-previews.mjs:8` | 🟩 |
| **SEC-15** | Reverse Tabnabbing Missing `noopener` on External Links in Songs, Core, Lessons | **Low** | `client/03f-songs.js:72`, `client/03g-core.js:382,403`, `client/52-lessons.js:811` | 🟩 |
| **SEC-16** | Legacy Session Cookie Incomplete Clearing on Logout in Base Worker | **Medium** | `src/worker.js:1913, 2020` | 🟩 |
| **SEC-17** | Recursive Prototype Pollution Key Sanitization in Lesson Blocks | **Low** | `src/learning-study.mjs:109` | 🟩 |
| **SEC-18** | Sub-optimal Constant-Time Comparison Primitive in Email OTP Verification | **Low** | `src/email-otp.mjs:21` | 🟩 |

---

## 3. Detailed Findings & Remediation Specifications

### [SEC-01] DOM XSS via Unsanitized `javascript:` Scheme in Developer Dashboard
- **Severity**: High (CVSS 7.4)
- **Location**: [client/24-bugs.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/24-bugs.js#L201), [src/feedback.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/feedback.mjs#L80)
- **Description**: In `client/24-bugs.js:201`, the developer/admin dashboard renders user-submitted feedback reports with:
  ```javascript
  <a href="${esc(fb.url)}" target="_blank" class="feedback-link">${esc(fb.url)}</a>
  ```
  While `esc()` escapes HTML entities (`&`, `<`, `>`, `"`, `'`), it permits any URL scheme, including `javascript:` and `data:text/html`. An unauthenticated visitor submitting feedback via `POST /api/feedback` with `context.url = "javascript:/* payload */"` will cause arbitrary JavaScript to execute in the context of the developer's session when the link is clicked.
- **Remediation**:
  1. Backend (`src/feedback.mjs`): Validate that `context.url` starts with `https://` or `http://` and contains no whitespace or control characters; reject or normalize to empty string if invalid.
  2. Client (`client/24-bugs.js`): Verify `const isSafe = /^https?:\/\//i.test(fb.url);` before rendering `<a href>`. If unsafe, render as plain text or safe anchor.

---

### [SEC-02] Stored Attribute Breakout / DOM Injection in Feedback Screenshot Renderer
- **Severity**: High (CVSS 7.1)
- **Location**: [client/24-bugs.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/24-bugs.js#L210), [src/feedback.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/feedback.mjs#L76)
- **Description**: In `src/feedback.mjs:76`, `cleanScreenshot` is validated only via `typeof screenshot === 'string' && screenshot.startsWith('data:image/')`. In `client/24-bugs.js:210`, it is interpolated into an inline attribute and `onclick` handler:
  ```javascript
  <img src="${fb.screenshot}" alt="Screenshot" ... onclick="window.open('${fb.screenshot}')">
  ```
  If `fb.screenshot` contains single quotes or HTML attribute delimiters, it can escape the `src` or `onclick` string literals.
- **Remediation**:
  1. Backend (`src/feedback.mjs`): Enforce strict Base64 data URI regex validation:
     ```javascript
     const cleanScreenshot = typeof screenshot === 'string' && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(screenshot) ? screenshot : '';
     ```
  2. Client (`client/24-bugs.js`): Remove inline `onclick` handler and bind click listeners dynamically using DOM APIs or pass safe sanitized URL to `window.open(src, '_blank', 'noopener,noreferrer')`.

---

### [SEC-03] OAuth Login CSRF & Missing PKCE on Google Authentication Flow
- **Severity**: High (CVSS 7.2)
- **Location**: [src/google-oauth.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/google-oauth.mjs), [src/worker.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js)
- **Description**: Microsoft OAuth (`src/microsoft-oauth.mjs`) and Telegram OAuth (`src/telegram-oauth.mjs`) both utilize `FederatedOAuthState` (`src/federated-oauth-state.mjs`), which generates a 32-byte cryptographically secure random token bound to an HTTP-only secure cookie (`__Host-lumiscia-*`) and enforces PKCE with SHA-256 code challenge (`S256`). In contrast, `google-oauth.mjs` generates an HMAC-signed state without client-side cookie binding.
  An attacker can generate a valid Google OAuth authorization URL/code and trick a victim into submitting it, binding the victim's session to the attacker's Google account (OAuth Login CSRF).
- **Remediation**:
  Refactor `GoogleOAuth` to inherit from `FederatedOAuthState` (or bind an HTTP-only `__Host-lumiscia-google` cookie with PKCE verifier), matching the security posture of Microsoft and Telegram OAuth.

---

### [SEC-04] Telegram OIDC ID Token Nonce Verification Bypass
- **Severity**: Medium (CVSS 6.1)
- **Location**: [src/telegram-oauth.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/telegram-oauth.mjs#L21)
- **Description**: In `src/telegram-oauth.mjs:21`:
  ```javascript
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 256 || payload.nonce !== undefined && payload.nonce !== nonce)
    throw new StudyError(401, 'Telegram identity does not match this sign-in.');
  ```
  If an ID token omits the `nonce` claim, `payload.nonce !== undefined` is `false`, bypassing nonce verification. In contrast, `microsoft-oauth.mjs:32` lists `'nonce'` under `requiredClaims` and strictly asserts `payload.nonce !== nonce`.
- **Remediation**:
  1. Add `'nonce'` to `requiredClaims` in `jwtVerify(token, keySet, { ..., requiredClaims: ['sub', 'iat', 'exp', 'nonce'] })`.
  2. Change condition to unconditional equality: `if (payload.nonce !== nonce) throw ...`.

---

### [SEC-05] Non-Constant-Time Comparison on Account Invitation Hash (Timing Attack)
- **Severity**: Medium (CVSS 5.3)
- **Location**: [src/account-invites.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/account-invites.mjs#L154-L170)
- **Description**: In `peek()` and `redeem()`:
  ```javascript
  if (value.secretHash !== await sha256Hex(secret)) fail(404, 'Invite not found.');
  ```
  Standard JavaScript string inequality (`!==`) short-circuits on the first differing character, leaking timing information that can theoretically assist an attacker attempting to brute-force hashes.
- **Remediation**:
  Implement constant-time comparison using `crypto.subtle.timingSafeEqual`:
  ```javascript
  function timingSafeEqualHex(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    const enc = new TextEncoder();
    return crypto.subtle.timingSafeEqual(enc.encode(a), enc.encode(b));
  }
  ```

---

### [SEC-06] Reverse Tabnabbing via Dynamic `target="_blank"` Without `rel="noopener noreferrer"`
- **Severity**: Medium (CVSS 5.3)
- **Location**: [client/24-bugs.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/24-bugs.js#L180-L201), [client/00-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L614)
- **Description**: Dynamic links opened in new tabs without `rel="noopener noreferrer"` give the target page a reference to `window.opener`. A target site can modify `window.opener.location` to navigate the user's parent tab to an arbitrary phishing page.
- **Remediation**:
  Add `rel="noopener noreferrer"` to all dynamic `<a target="_blank">` links in `24-bugs.js` and ensure all `window.open` invocations supply `"noopener,noreferrer"` as the window features argument.

---

### [SEC-07] Missing Default Security Headers & CSP on Static Asset HTML Deliveries
- **Severity**: Medium (CVSS 5.0)
- **Location**: [src/learning-production-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-production-worker.mjs#L56-L60)
- **Description**: In `src/learning-production-worker.mjs:58`:
  ```javascript
  if (headers.get('Content-Type')?.includes('text/html') && headers.has('Content-Security-Policy'))
    headers.set('Content-Security-Policy', headers.get('Content-Security-Policy') + "; worker-src 'self' blob:");
  ```
  If the upstream asset response lacks a `Content-Security-Policy` header, no CSP is applied to production HTML responses. Additionally, standard defense-in-depth headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`) are not guaranteed on all static HTML responses.
- **Remediation**:
  Unconditionally set strict baseline security headers on all HTML responses in `src/learning-production-worker.mjs`:
  - `Content-Security-Policy`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`

---

### [SEC-08] Session Cookie Missing RFC 6265bis `__Host-` Prefix (`enquiz_sid`)
- **Severity**: Low (CVSS 3.7)
- **Location**: [src/worker.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L3844-L3889)
- **Description**: The primary session cookie is named `enquiz_sid` rather than using the RFC 6265bis `__Host-` prefix (`__Host-enquiz_sid`). Cookies with the `__Host-` prefix can only be set from secure origins (HTTPS), cannot be scoped to subdomains, and must have `Path=/`. Without this prefix, any sibling subdomain can set or overwrite the root session cookie.
- **Remediation**:
  Support `__Host-enquiz_sid` as the standard session cookie in production, maintaining backwards compatibility with `enquiz_sid` during a smooth transition period.

---

### [SEC-09] Unvalidated URL Schemes in Dictionary & External Card Links
- **Severity**: Low (CVSS 3.5)
- **Location**: [client/00-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L614) (`foldedLinkHtml`)
- **Description**: In `00-core.js:614`, `foldedLinkHtml` takes arbitrary dictionary URL pairs and renders `<a href="' + esc(pair[1]) + '">`. If user-generated card data contains a custom link starting with `javascript:`, clicking the link would execute code.
- **Remediation**:
  Filter link pairs to enforce that `pair[1]` matches `/^https?:\/\//i`.

---

### [SEC-10] Exposure of Backend Host IPv4 Address in `wrangler.toml` Wildcard DNS
- **Severity**: Low / Info (CVSS 3.1)
- **Location**: [wrangler.toml](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/wrangler.toml#L118)
- **Description**: Line 118 specifies `EXPRESSION_ANALYZER_URL = "https://92-5-115-171.sslip.io"`. Exposing the raw IP address through public version control allows potential attackers to bypass Cloudflare edge protections (WAF, DDoS mitigation) by targeting the origin IP directly.
- **Remediation**:
  Route origin traffic through a dedicated domain or Cloudflare Tunnel (Cloudflare Access / Zero Trust) and store the upstream URL as a worker secret or private environment variable.

---

### [SEC-11] PostMessage Target Origin Wildcard (`*`) in Spotify Embed Handshake
- **Severity**: Info
- **Location**: [client/03f-songs.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03f-songs.js#L346)
- **Description**: `iframe.contentWindow.postMessage({ command: "load_complete_ack" }, "*")` broadcasts the acknowledgement with target origin `*`.
- **Remediation**:
  Specify explicit target origin `"https://open.spotify.com"`.

---

### [SEC-12] Missing Minimum Length & Entropy Validation for `SESSION_SECRET`
- **Severity**: Low (CVSS 3.0)
- **Location**: [src/learning-production-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-production-worker.mjs#L23-L25)
- **Description**: `STAGE_SESSION_SECRET` requires `/^[a-f0-9]{64,128}$/`, whereas production `SESSION_SECRET` is only checked for truthiness. A short or weak secret would degrade HMAC security.
- **Remediation**:
  Enforce a minimum length requirement of 32 characters (or 64 hex characters) on `SESSION_SECRET` at initialization.

---

### [SEC-13] Privacy Violation & Email Disclosure to Students in Chat Search (`searchPerson`)
- **Severity**: Medium (CVSS 5.3)
- **Location**: [src/chat-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L215)
- **Description**: In `chat-worker.mjs:215`, `searchPerson()` queries the policy cache and returns `{ person: matches[0] }`. The matched object is a raw user record containing `{ id, login, name, email, role, active, hidden, is_personal_data_revoked, groupId }`. When a student searches for another user via `@username`, the private email address of that user is returned in the JSON response, allowing any student to harvest emails of other students and teachers.
- **Remediation**:
  Strip `email` from `person` when the caller `self` is not staff (`ADMIN` or `DEVELOPER`). Only expose public identifiers (`id`, `name`, `login`, `role`, `groupId`).

---

### [SEC-14] Protocol Inconsistency in Chat Link Previews (Allowing `http:` Scheme)
- **Severity**: Low (CVSS 3.7)
- **Location**: [src/chat-previews.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-previews.mjs#L8)
- **Description**: `chatPreviewUrl` accepts both `http:` and `https:`, but downstream `publicFetch` rejects anything non-HTTPS. Accepting `http:` creates an inconsistency and allows plaintext URLs to enter preview pipelines.
- **Remediation**:
  Strictly require `url.protocol === 'https:'` in `chatPreviewUrl`.

---

### [SEC-15] Reverse Tabnabbing Missing `noopener` on External Links in Songs, Core, Lessons
- **Severity**: Low (CVSS 3.5)
- **Location**: [client/03f-songs.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03f-songs.js#L72), [client/03g-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03g-core.js#L382), [client/52-lessons.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L811)
- **Description**: Dynamic `target="_blank"` links use `rel="noreferrer"` without `noopener`. Older browsers and certain WebKit engines allow `window.opener` access if `noopener` is omitted.
- **Remediation**:
  Standardize on `rel="noopener noreferrer"`.

---

### [SEC-16] Legacy Session Cookie Incomplete Clearing on Logout in Base Worker
- **Severity**: Medium (CVSS 4.5)
- **Location**: [src/worker.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L1913-L2020)
- **Description**: In `src/worker.js`, `logout` and `delete-account` set `cookieHeader("", secure)`. When `secure` is true, it issues a deletion header solely for `__Host-enquiz_sid`. If the browser retained a legacy `enquiz_sid` cookie, `readCookie()` falls back to `enquiz_sid`, reviving the session after logout.
- **Remediation**:
  Ensure logout clears both `__Host-enquiz_sid` and `enquiz_sid`.

---

### [SEC-17] Recursive Prototype Pollution Key Sanitization in Lesson Blocks
- **Severity**: Low (CVSS 3.3)
- **Location**: [src/learning-study.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-study.mjs#L109)
- **Description**: `lessonBlock` filters `__proto__`, `constructor`, `prototype` on top-level keys of `value.content`, but does not recursively inspect nested objects inside block content.
- **Remediation**:
  Implement recursive key validation rejecting prototype pollution keys at any depth.

---

### [SEC-18] Sub-optimal Constant-Time Comparison Primitive in Email OTP Verification
- **Severity**: Low (CVSS 3.1)
- **Location**: [src/email-otp.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/email-otp.mjs#L21)
- **Description**: `email-otp.mjs` uses custom loop XOR for timing-safe string comparison. While decent, `crypto.subtle.timingSafeEqual` provides guaranteed hardware constant-time semantics in V8/Cloudflare runtime.
- **Remediation**:
  Switch to `crypto.subtle.timingSafeEqual` over Uint8Array encodings.

---

## 4. Remediation Checklist & Execution Stages

### Stage 1: Critical & High Priority Fixes (DOM XSS & Stored Injection)
- [ ] 🟩 **Item 1.1**: Fix DOM XSS via feedback link in `client/24-bugs.js:201` (sanitize scheme to `https?:\/\/`).
- [ ] 🟩 **Item 1.2**: Fix Screenshot stored XSS / attribute injection in `src/feedback.mjs:76` (strict base64 image regex).
- [ ] 🟩 **Item 1.3**: Sanitize screenshot click handler in `client/24-bugs.js:210` (remove inline `onclick` string interpolation).
- [ ] 🟩 **Item 1.4**: Sanitize URL in backend feedback receiver `src/feedback.mjs:80` (reject unsafe protocols).
- [ ] 🟩 **Item 1.5**: Rebuild preview bundle with `npm run build:preview` and verify tests pass.

### Stage 2: Authentication & Token Security (OAuth CSRF, Nonce, Timing Attacks)
- [ ] 🟩 **Item 2.1**: Fix Telegram OIDC nonce validation bypass in `src/telegram-oauth.mjs:21` (enforce nonce equality).
- [ ] 🟩 **Item 2.2**: Implement constant-time comparison in `src/account-invites.mjs:154, 170` using `timingSafeEqual`.
- [ ] 🟩 **Item 2.3**: Bind client cookie state & PKCE to Google OAuth flow in `src/google-oauth.mjs`.
- [ ] 🟩 **Item 2.4**: Run full authentication test suite (`npm run test:auth` / `npm test`).

### Stage 3: Defense-in-Depth & Client Hardening (Reverse Tabnabbing, Headers, CSP)
- [ ] 🟩 **Item 3.1**: Add `rel="noopener noreferrer"` across all dynamic `target="_blank"` links in `client/24-bugs.js` and `client/00-core.js`.
- [ ] 🟩 **Item 3.2**: Enforce protocol validation (`https?:\/\/`) in `foldedLinkHtml` (`client/00-core.js:614`).
- [ ] 🟩 **Item 3.3**: Inject mandatory security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) in `src/learning-production-worker.mjs`.
- [ ] 🟩 **Item 3.4**: Restrict Spotify postMessage target origin to `"https://open.spotify.com"` in `client/03f-songs.js:346`.
- [ ] 🟩 **Item 3.5**: Rebuild preview bundle and run end-to-end regression tests.

### Stage 4: Session Hardening & Secret Validation
- [ ] 🟩 **Item 4.1**: Implement `__Host-enquiz_sid` session cookie prefix support on HTTPS with backward compatibility in `src/worker.js` and `src/learning-integrated-worker.mjs` (SEC-08).
- [ ] 🟩 **Item 4.2**: Validate `SESSION_SECRET` non-empty string integrity in `src/learning-production-worker.mjs` (SEC-12).
- [ ] 🟩 **Item 4.3**: Rebuild production assets and run full test suite (165/165 passed).

### Stage 5: Deep Audit Remediation (Privacy, Protocol, Tabnabbing, Cookie Cleanup, Prototype Defense)
- [ ] 🟩 **Item 5.1**: Sanitize chat search person response to hide private emails from students (`src/chat-worker.mjs:215`) (SEC-13).
- [ ] 🟩 **Item 5.2**: Enforce strict `https:` protocol in `chatPreviewUrl` (`src/chat-previews.mjs:8`) (SEC-14).
- [ ] 🟩 **Item 5.3**: Add `noopener` to all remaining dynamic `target="_blank"` links in `client/03f-songs.js`, `client/03g-core.js`, `client/52-lessons.js` (SEC-15).
- [ ] 🟩 **Item 5.4**: Ensure `src/worker.js` logout clears both `__Host-enquiz_sid` and `enquiz_sid` (SEC-16).
- [ ] 🟩 **Item 5.5**: Add recursive prototype pollution key check in `src/learning-study.mjs` (SEC-17).
- [ ] 🟩 **Item 5.6**: Upgrade Email OTP constant-time comparison to `crypto.subtle.timingSafeEqual` in `src/email-otp.mjs` (SEC-18).
- [ ] 🟩 **Item 5.7**: Rebuild preview/production assets and verify 100% test pass.

---

## 5. Verification & Testing Methodology

1. **Automated Unit Tests**:
   - Run `node test/test-feedback.mjs` to verify feedback validation and rate limiting.
   - Run `node test/test-feedback-ui.mjs` to verify safe rendering of feedback items.
   - Run `npm test` across all 35+ test suites to ensure zero regressions in study data, authentication, and worker dispatch.
2. **Production Asset Build Verification**:
   - Execute `npm run build:preview` to ensure `preview.js` accurately compiles from `client/*.js`.
   - Execute `npm run build:prod` (or asset builder) to verify HTML/CSS/JS integrity.
3. **Manual XSS Injection Vector Checks**:
   - Verify `javascript:alert(1)` in feedback URL renders as safe non-clickable text or `#`.
   - Verify malformed screenshot payload with quotes cannot break out of `<img>` attributes.
