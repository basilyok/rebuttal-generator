# Deployment Guide

This app is deployed on **Cloudflare Pages** as project `m36x-rebuttal`, live at
**https://rebut.m36x.com/** (also `m36x-rebuttal.pages.dev`).

## Deploying an Update

```bash
npm run build
npx wrangler pages deploy
```

That's it. `wrangler` must be logged in (`npx wrangler login` once per machine;
check with `npx wrangler whoami`). The project name, output directory, and the
KV binding all come from `wrangler.toml`, so no flags are needed.

If anything under `limiter/` changed, deploy that Worker too — and do it
**before** the Pages deploy, because the Pages service binding resolves against
the deployed Worker:

```bash
cd limiter && npx wrangler deploy
```

### Share-link storage (one-time)

Share links live in a Cloudflare KV namespace bound as `SHARES`. It already
exists and its id is in `wrangler.toml`. To recreate it from scratch:

```bash
npx wrangler kv namespace create SHARES
```

Paste the returned id into the `[[kv_namespaces]]` block in `wrangler.toml`.
Without the binding the app still works — `/api/share` returns 501 and the share
button reports that sharing is unavailable.

Notes:

- `npm run build` type-checks (`tsc`) and then produces the `dist/` folder.
- `public/_headers` ships the Cloudflare Pages cache rules: `sw.js`, `index.html`
  and `manifest.json` are always revalidated; hashed `/assets/*` files are
  cached immutably for a year.
- The service worker's update banner shows in already-open tabs after a deploy;
  clicking **Reload** activates the new version.

## Instant Mode Setup (one-time)

Instant mode (free keyless replies through `/api/generate`) needs three things.
Do them in this order, with the Pages deploy last.

### 1. Deploy the limiter Worker

```bash
cd limiter && npx wrangler deploy
```

The Pages project reaches `m36x-limiter` through the `[[services]]` binding in
the root `wrangler.toml`, and that binding resolves against an already-deployed
Worker — so the limiter must be deployed before the Pages deploy. It has no
public URL (`workers_dev = false`); only this project's Functions can call it.

### 2. Create the OpenRouter provisioned key

At [openrouter.ai](https://openrouter.ai/) → **Settings → Provisioning API
keys**, create a runtime key **with a daily spend limit** (start at $2/day).
OpenRouter enforces that cap server-side, so spend stays bounded even if every
guard in the app fails. Store it as a Pages secret:

```bash
npx wrangler pages secret put OPENROUTER_PROXY_KEY --project-name=m36x-rebuttal
```

Without this secret, `/api/generate` returns 501 and the app behaves as plain
BYOK — nothing else breaks.

### 3. Create the Turnstile widget

In the Cloudflare dashboard (account level) → **Turnstile → Add widget**:
hostnames `rebut.m36x.com` and `rebuttal.m36x.com`, mode **Managed**. The sitekey is public and lives
in `src/turnstile.ts` (already committed); the secret goes in:

```bash
npx wrangler pages secret put TURNSTILE_SECRET --project-name=m36x-rebuttal
```

With the secret unset, the server skips verification — the intended local-dev
mode, not an error.

### 4. Deploy Pages last

Secrets bind at deploy time: a secret added after a deploy is invisible to the
deployment already serving traffic. Set both secrets (and deploy the limiter)
**before** the Pages deploy, then:

```bash
npm run build
npx wrangler pages deploy
```

## Operator Metrics (one-time, optional)

The limiter's `metrics` table keeps aggregate counters — a name and a daily
integer, nothing else (`share_view`, `instant_reply`, …; no ids, no payload, no
user agent, no referrer). The same Durable Object separately holds the quota
counters, which are keyed by the opaque quota id (the anonymous `rb_device`
cookie, or the account id when signed in) — an id and a number, never content.
`GET /api/metrics` reads the aggregate table back, and it is gated on being
signed in **as the operator**: set `OPERATOR_EMAIL` to the Google-account email
you sign in with. The gate specifically requires a *Google*-authenticated
session, not just a matching email — a password account's email is a
self-reported, unverified claim (`functions/api/auth/register.js` stores
whatever the sign-up form submits, with no proof of ownership), while Google's
is only ever stored once its `email_verified` claim checks out
(`functions/api/auth/google/callback.js`). See the provider check in
`functions/api/metrics.js`. So this feature specifically needs the OAuth pair
below plus the `ACCOUNTS` binding — even though `ACCOUNTS` alone is already
enough to turn sign-in on at all, via password accounts with no Google
involved (see [README.md](README.md#enabling-sign-in-on-your-own-deployment)).

```bash
npx wrangler pages secret put OPERATOR_EMAIL --project-name=m36x-rebuttal
```

Anyone else who calls that endpoint — signed in as another account (including
a password account registered with your email address — the gate above is
exactly what stops that from working), or not signed in at all — gets a plain
`404`, because the endpoint's existence is not worth advertising with a `403`.
With the secret unset the endpoint returns `501 Not configured` for everyone,
including you; counting still happens, you just cannot read it back. Set this
before the Pages deploy for the same bind-at-deploy-time reason as the others.

## Secrets This Deployment Uses

All five are optional — with none of them set the app runs as plain BYOK — but
they are not all independent of one another. The two Google values are one unit:
*Google* sign-in needs both halves *and* the `ACCOUNTS` binding, and either half
alone does nothing — though `ACCOUNTS` alone already turns sign-in on by itself,
via password accounts (see
[README.md](README.md#enabling-sign-in-on-your-own-deployment)).
`OPERATOR_EMAIL` depends on that Google unit specifically, not on sign-in in
general: `/api/metrics` accepts only a Google-authenticated session
(`functions/api/metrics.js` checks the session's provider, not merely its
email — see "Operator Metrics" above for why). Set `OPERATOR_EMAIL` on a
deployment that has `ACCOUNTS` bound but no Google pair and `/api/metrics`
never returns a readback — a permanent `404`, because no session on that
deployment can ever carry `provider === 'google'` — and `501` when `ACCOUNTS`
itself is missing, since that check runs first. The other two stand alone.
Each is set the same way, and **every one of them binds at deploy time**, so
adding one to a live project does nothing until you redeploy.

```bash
npx wrangler pages secret put <NAME> --project-name=m36x-rebuttal
```

| Secret | What it enables | What happens without it |
|---|---|---|
| `OPENROUTER_PROXY_KEY` | Instant mode: `/api/generate` spends this provisioned OpenRouter key so keyless visitors get free replies | `/api/generate` returns `501`; the app is plain BYOK and nothing else breaks |
| `TURNSTILE_SECRET` | Server-side Turnstile verification on `/api/generate`, keeping bots off the free pool | Verification is skipped, not failed — Instant mode still works, unguarded. This is the intended local-dev state |
| `OPERATOR_EMAIL` | `GET /api/metrics` for that one signed-in Google account — so it needs the sign-in pair below and `ACCOUNTS` to be usable at all | The endpoint returns `501` for everyone; the counters keep incrementing, they are just unreadable |
| `GOOGLE_CLIENT_ID` | *Google* sign-in (the OAuth authorize request, and the `aud` check on the returned token) | The Google option is simply missing from the sign-in dialog — `/api/auth/me`'s `providers` omits `google`, so no button, no divider. Password accounts are unaffected: with `ACCOUNTS` bound, `configured` stays `true` and sign-in, the vault, and history sync all still work with no Google involved |
| `GOOGLE_CLIENT_SECRET` | The OAuth code-for-token exchange in the callback | Same as above — both halves of the pair are required together |

**Not** secrets, and living in `wrangler.toml` instead: the `SHARES` and
`ACCOUNTS` KV namespace ids, and the `LIMITER` service binding.
Sign-in additionally needs `ACCOUNTS` to exist — the OAuth pair alone is not
enough — and without it `/api/vault` and `/api/history` return `501`.

## First-Time Setup (already done)

For reference, the project was created with:

```bash
npx wrangler pages project create m36x-rebuttal
npx wrangler pages deploy dist --project-name=m36x-rebuttal
```

The custom domain `rebut.m36x.com` is attached in the Cloudflare dashboard
under **Workers & Pages → m36x-rebuttal → Custom domains**.

### Primary domain

The canonical domain is **rebut.m36x.com**. `rebuttal.m36x.com` remains
attached and 301-redirects (path and query preserved) via a zone-level
Redirect Rule, because distributed share links point there. The four
dashboard pieces that must all know about a domain:

1. **Pages → m36x-rebuttal → Custom domains** — both domains attached.
2. **Turnstile → widget → Hostname management** — both hostnames listed;
   a missing hostname fails the widget silently and every Instant reply 403s.
3. **Google OAuth client → Authorised redirect URIs** — both
   `https://<domain>/api/auth/google/callback` entries.
4. **m36x.com zone → Rules → Redirect Rules** — "rebuttal-to-rebut":
   when hostname equals `rebuttal.m36x.com`, 301 to dynamic
   `concat("https://rebut.m36x.com", http.request.uri.path)`,
   "Preserve query string" checked.

## Other Hosts

The build output in `dist/` is a fully static site — any static host works
(Netlify, Vercel, S3+CloudFront, GitHub Pages…). If you move hosts, replicate
the caching rules from `public/_headers` in that host's config format. Note
that everything under `functions/` (article extraction, sharing, sign-in,
Instant mode) and the limiter Worker are Cloudflare-side — on another host the
app runs as plain BYOK.

## Troubleshooting

### "Build failed"
- Check Node version: `node --version` (Vite 5 requires Node 18+)
- Run `npm install` locally first
- `npm run build` surfaces TypeScript errors — fix them before deploying

### "App shows blank page"
- Check browser console (F12) for errors
- Verify the service worker (DevTools → Application → Service Workers)
- Hard refresh (Ctrl+Shift+R) to bypass caches

### "Microphone not working"
- Check browser permissions; microphone requires HTTPS (or localhost)
- Voice input needs Chrome, Edge, or Safari — Firefox does not support the
  Web Speech API's SpeechRecognition

### "API calls failing"
- Verify the API key is correct and has credits
- Check [Anthropic status page](https://status.anthropic.com)
