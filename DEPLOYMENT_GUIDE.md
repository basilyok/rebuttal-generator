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
