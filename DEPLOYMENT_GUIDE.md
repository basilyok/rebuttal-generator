# Deployment Guide

This app is deployed on **Cloudflare Pages** as project `m36x-rebuttal`, live at
**https://rebuttal.m36x.com/** (also `m36x-rebuttal.pages.dev`).

## Deploying an Update

```bash
npm run build
npx wrangler pages deploy dist --project-name=m36x-rebuttal
```

That's it. `wrangler` must be logged in (`npx wrangler login` once per machine;
check with `npx wrangler whoami`).

Notes:

- `npm run build` type-checks (`tsc`) and then produces the `dist/` folder.
- `public/_headers` ships the Cloudflare Pages cache rules: `sw.js`, `index.html`
  and `manifest.json` are always revalidated; hashed `/assets/*` files are
  cached immutably for a year.
- The service worker's update banner shows in already-open tabs after a deploy;
  clicking **Reload** activates the new version.

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
the caching rules from `public/_headers` in that host's config format.

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
