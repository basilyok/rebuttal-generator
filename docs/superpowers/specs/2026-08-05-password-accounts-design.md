# Password Accounts — Design

**Approved:** 2026-08-05, in conversation. Companion request: make rebut.m36x.com the
primary domain (small, handled in the same implementation plan; needs no spec of its own).

## Goal

Visitors can create an account with a self-chosen username and password (email
optional), or with Google as today. The sign-in button stops being Google-specific,
and a small popover explains what an account is for. Password accounts get
something Google accounts cannot have: **one secret** that both signs them in and
unlocks their vault — with the server still structurally unable to read the vault.

## The invariant that must survive

The server never holds anything that can decrypt a user's API keys or history.
This is the app's central promise (README, CONSTITUTION context, vault.js header
comments) and every choice below is subordinate to it.

## The security core: split derivation

A naive build — send the password, derive the vault key from it — silently hands
the server the vault key. Instead the browser derives two independent values
(the Bitwarden/1Password construction):

```
masterKey = PBKDF2-SHA256(password,  salt = "rebuttal|v1|" + username,  600_000 iterations)
authHash  = PBKDF2-SHA256(masterKey, salt = password,                   1 iteration)
```

- `authHash` is the ONLY secret transmitted. The server re-hashes it with its own
  per-user random salt (PBKDF2, server-side iterations) before storing, so a KV
  dump yields nothing replayable.
- `masterKey` never leaves the browser. The vault blob for a `local:` account is
  AES-GCM under a key imported from `masterKey`.
- `authHash` is a one-way function of `masterKey`; nothing the server holds walks
  back to the encryption key.
- The username inside the client salt is lowercased and trimmed first, so case
  differences at login cannot produce a wrong key.

Consequences, accepted deliberately:

- Login = unlock. Password users never see the vault passphrase dialog.
- Forgetting the password with no email set loses the account and the synced
  vault/history permanently. Local (device) copies survive, as with the existing
  passphrase design.
- Password change requires re-encrypting the vault client-side — **out of scope
  for v1** (see below).

Google accounts keep today's separate passphrase flow unchanged; Google gives us
no secret to derive from.

## Components

### Client

| File | Status | Responsibility |
|---|---|---|
| `src/account.ts` | new | The split derivation (WebCrypto PBKDF2), `register()`, `loginLocal()` wrappers; typed errors (taken username, bad credentials, rate-limited) |
| `src/AuthDialog.tsx` | new | One modal, two modes (sign in / sign up), styled after the existing `VaultDialog`. Sign-up: Google button, "or" divider, username / password / confirm / email (optional) with the no-email warning. Sign-in: Google button, divider, username / password |
| `src/AccountBar.tsx` | modify | Button label → `account.signInOrUp`; benefits popover anchored to it |
| `src/vault.ts` | modify | Accept an externally-supplied `masterKey` as the vault key (`adoptKey`), alongside today's passphrase derivation |
| `src/App.tsx` | modify | Mount `AuthDialog`; on local login, adopt the key and skip the passphrase prompt entirely |
| `src/index.css` | modify | `.auth-dialog`, `.auth-divider`, `.account-benefits` popover |
| `src/i18n/locales/*.ts` (12) | modify | ~16 new `account.*` keys |

### Server

| File | Status | Responsibility |
|---|---|---|
| `functions/_lib/password.js` | new | `hashAuth(authHash)` → `{salt, hash, iterations}`; `verifyAuth(stored, authHash)` with constant-time compare |
| `functions/api/auth/register.js` | new | Validate username/email, reserve the username, store the user + password record, mint a session |
| `functions/api/auth/login.js` | new | Verify `authHash`, mint a session |
| `functions/_lib/session.js` | modify | `usernameKey(name)` index; `passwordKey(userId)`; `upsertLocalUser()` |

## Data model

Extends the existing `provider:subject` id scheme, so a password account can never
collide with a Google one:

```
user:local:<lowercased-username>        the user record (provider: 'local')
username:<lowercased-username>          → userId          (uniqueness index)
password:local:<username>               → {salt, hash, iterations, version}
vault:local:<username>                  ciphertext, unchanged shape
history:local:<username>                ciphertext, unchanged shape
```

The user record reuses `upsertUser`'s field discipline — only named fields are
persisted, never raw client JSON. `email` is stored when supplied, `name` defaults
to the username, `picture` is absent.

## Validation rules

- **Username:** 3–32 chars, `[A-Za-z0-9_-]`, case-insensitively unique, checked
  against a small reserved list (`admin`, `root`, `api`, `support`, `help`, …).
- **Password:** minimum 10 characters. Advice, not a gate, beyond that minimum —
  matching the existing passphrase dialog's stance that refusing someone's own
  credentials is a worse outcome than a mediocre one.
- **Email:** optional; when present, shape-validated and length-capped only.
- **authHash:** exactly the base64 of 32 bytes; anything else is a 400.

## Abuse resistance

- Login and register are **rate-limited per IP**, reusing the in-memory flood-brake
  pattern already in `functions/api/generate.ts` and `share.js` — deliberately NOT
  per username, because per-username throttling lets anyone lock a victim out of
  their own account by failing logins on their behalf.
- 600k client-side iterations make offline attack on a leaked `authHash` expensive;
  the server-side re-hash means a KV dump does not even yield a replayable `authHash`.
- Register is additionally gated by the same-origin check (`functions/_lib/gate.js`).
- Failed login returns one generic error for both "no such user" and "wrong
  password", so the endpoint is not a username oracle.

## Error handling

| Case | Response |
|---|---|
| Username taken | 409 `{code: 'username-taken'}` — the dialog highlights the field |
| Bad credentials | 401 `{code: 'bad-credentials'}` — generic, never distinguishes the two causes |
| Rate limited | 429 `{code: 'rate-limited'}` |
| Malformed body / bad authHash | 400 |
| `ACCOUNTS` unbound | 501, matching every other account endpoint |

Client-side, `src/account.ts` maps these to typed errors so `AuthDialog` can render
each without string-matching.

## Testing

- **Derivation (unit, no network):** `authHash` is stable for the same inputs and
  changes with either input; the same password under different usernames yields
  different `masterKey`s; `masterKey` cannot be reconstructed from `authHash`;
  username case and surrounding whitespace do not change the result.
- **Round-trip:** a vault sealed under a derived `masterKey` opens after a simulated
  fresh login, and fails under the wrong password.
- **Endpoints (HTTP, against `wrangler pages dev`):** register → login happy path;
  duplicate username → 409; wrong password → 401; malformed `authHash` → 400;
  unauthenticated `/api/auth/me` → `configured` shape unchanged.
- **Regression:** the Google flow and the existing passphrase vault path are
  untouched — existing tests must stay green.

## Explicitly out of scope for v1

- **Password change / rotation.** Correct implementation must decrypt and
  re-encrypt the vault and swap the server credential atomically; done carelessly it
  strands the vault. Worth building deliberately, and it is a real gap for users who
  set no email — stated plainly rather than hidden.
- **Account linking** (adding a password to a Google account or vice versa).
- **Email verification and password reset.** Optional email is contact metadata in
  v1, not a proven recovery channel.
- Any change to Instant-mode caps or the quota model.

## Companion: primary domain

`rebut.m36x.com` becomes canonical. The code is already domain-agnostic —
`shareUrlFor` uses `window.location.origin`, the OAuth `redirect_uri` is built from
the request origin, and `og:url` comes from the request URL — so the only code
change is the hardcoded OpenRouter attribution header at
`functions/api/generate.ts:159`, plus stale comments in `src/providers.ts` and
`src/turnstile.ts`.

Three operator steps happen outside the code, and two of them break production
silently if missed:

1. Add the custom domain to the Pages project.
2. Add `rebut.m36x.com` to the **Turnstile widget's hostname list** — otherwise the
   widget errors, no token is issued, and every Instant reply 403s.
3. Add `https://rebut.m36x.com/api/auth/google/callback` to the **Google OAuth
   authorized redirect URIs** — otherwise sign-in breaks on the new domain.

`rebuttal.m36x.com` stays live with a path-preserving 301 to the new domain, because
every share link already distributed points there.
