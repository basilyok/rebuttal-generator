# Deployment Guide

This app is deployed on **Cloudflare Pages** as project `m36x-rebuttal`, live at
**https://rebuttal.m36x.com/** (also `m36x-rebuttal.pages.dev`).

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
hostname `rebuttal.m36x.com`, mode **Managed**. The sitekey is public and lives
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

The limiter keeps aggregate counters — a name and a daily integer, nothing else
(`share_view`, `instant_reply`, …; no ids, no payload, no user agent, no
referrer). `GET /api/metrics` reads them back, and it is gated on being signed
in **as the operator**: set `OPERATOR_EMAIL` to the Google-account email you
sign in with.

```bash
npx wrangler pages secret put OPERATOR_EMAIL --project-name=m36x-rebuttal
```

Anyone else who calls that endpoint — signed in as another account or not
signed in at all — gets a plain `404`, because the endpoint's existence is not
worth advertising with a `403`. With the secret unset the endpoint returns
`501 Not configured` for everyone, including you; counting still happens, you
just cannot read it back. Set this before the Pages deploy for the same
bind-at-deploy-time reason as the others.

## Secrets This Deployment Uses

All five are optional and independent — with none of them set the app runs as
plain BYOK. Each is set the same way, and **every one of them binds at deploy
time**, so adding one to a live project does nothing until you redeploy.

```bash
npx wrangler pages secret put <NAME> --project-name=m36x-rebuttal
```

| Secret | What it enables | What happens without it |
|---|---|---|
| `OPENROUTER_PROXY_KEY` | Instant mode: `/api/generate` spends this provisioned OpenRouter key so keyless visitors get free replies | `/api/generate` returns `501`; the app is plain BYOK and nothing else breaks |
| `TURNSTILE_SECRET` | Server-side Turnstile verification on `/api/generate`, keeping bots off the free pool | Verification is skipped, not failed — Instant mode still works, unguarded. This is the intended local-dev state |
| `OPERATOR_EMAIL` | `GET /api/metrics` for that one signed-in Google account | The endpoint returns `501` for everyone; the counters keep incrementing, they are just unreadable |
| `GOOGLE_CLIENT_ID` | Sign-in (the OAuth authorize request, and the `aud` check on the returned token) | Sign-in stays hidden: `/api/auth/me` reports `configured: false` and the button never renders — so no vault, no history sync, no cross-device language preference |
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

The custom domain `rebuttal.m36x.com` is attached in the Cloudflare dashboard
under **Workers & Pages → m36x-rebuttal → Custom domains**.

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
