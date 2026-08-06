# Project Summary: Rebuttal Generator

**Purpose: change the mind of the specific person who made the argument.** Not to score
points for a spectator. Everything below serves that, and [CONSTITUTION.md](CONSTITUTION.md)
governs how output is written — read it before touching `src/prompts.ts`.

## ✅ What's Been Created

You now have a **fully-functional, deployable PWA** (Progressive Web App) that generates AI-powered rebuttals with your choice of 33 models across 9 providers (Claude Sonnet 5 by default).

### 📦 Complete Features

✅ **Voice, Text, or Article URL Input**
- Real-time speech recognition using Web Speech API (Chrome, Edge, Safari)
- Manual typing/editing of the argument
- Paste an article URL and the text is fetched via a Cloudflare Pages Function,
  with an Internet Archive fallback when the live page isn't readable

✅ **AI Replies**
- One sendable message, structured for persuasion: restate → concede → off-ramp →
  narrowed disagreement → evidence → answer the concessions → ask
- A private briefing zone, never sent: the weak point in your own position, what to
  verify, and their best case mapped to where your reply answers it
- Web search runs *before* generation (Tavily, keyless) and the reply may cite only what
  was retrieved; invented URLs are stripped
- 9 providers, 33 models — the cloud models curated down to the ones that can
  actually hold this app's long, constraint-heavy prompt: Claude, Gemini, Groq,
  xAI Grok, Moonshot Kimi, Z.ai GLM, DeepSeek, OpenRouter (the only browser route
  to GPT, plus each provider's top + fast-cheap pair so one key covers the
  field), plus a free no-key local in-browser option (WebLLM/WebGPU) that is a
  deliberate exception to that bar and labelled as such in the UI. ↻ Refresh still loads any
  provider's full live catalog, except on Z.ai which publishes no such endpoint.
  OpenAI's own API is absent by necessity, not preference: it strips the CORS
  header from any request carrying an `Authorization` header, so a web page can
  never read a keyed response
- AI settings collapse behind a summary line naming the model and what it is good at
- Web-grounded sources with real citation links on Gemini, Claude and OpenRouter;
  models that cannot search say so instead of inventing URLs
- Collapsed steelman section arguing the strongest honest case FOR the argument,
  generated only when opened
- Unlisted share links at `/s/<id>`, backed by Cloudflare KV and served by a
  Pages Function that injects per-share Open Graph meta, so a pasted link
  unfurls with a title and an excerpt of the reply
- Cost estimate before generating, actual cost + token usage after, session total
- Reasoning-model aware: generous token budgets, per-provider reasoning
  minimisation, and automatic retry so "thinking" models still return answers
- ↻ Refresh pulls each provider's live model catalog at runtime

✅ **Instant Mode (free, keyless)**
- 3 free replies a day with no API key at all (6 signed in), counted per
  anonymous `rb_device` cookie or per account — never per IP — with the cap
  resetting at midnight UTC
- Quota lives in the **m36x-limiter Worker** (`limiter/`): a SQLite Durable
  Object doing atomic daily counting plus anonymous aggregate metrics, reached
  only through a `[[services]]` binding — it has no public URL
- `/api/generate` (`functions/api/generate.ts`) accepts structured fields only
  (argument, optional recipient line, languages, citations) and builds the
  prompt server-side, so the operator's OpenRouter key can never be driven as a
  general LLM API; it is same-origin gated and Turnstile-verified
- Model ladder: the first-ever reply goes to a paid model, later ones try the
  shared free pool and fall back to paid when it is busy; a reply missing the
  MESSAGE envelope is retried once, then refused — raw model output never
  leaves the server
- Spend is bounded twice: the limiter's caps, and the provisioned key's own
  daily spend limit enforced on OpenRouter's side
- A key saved for the selected provider bypasses Instant mode — those BYOK
  calls stay browser-direct and never touch `/api/generate`; selecting a
  provider with no saved key routes through Instant mode again

✅ **Reply History (local-first, encrypted sync)**
- Every generation is written to this device's IndexedDB immediately — signed
  in or not, BYOK or Instant mode — and the History panel browses, restores and
  deletes them (`src/history.ts`, `src/HistoryPanel.tsx`)
- Signed in **and** with the vault unlocked, the newest 100 entries also sync as
  ONE ciphertext blob through `PUT /api/history` — one KV write per save, sealed
  in the browser under the same key that protects the API-key vault
- `functions/api/history.js` is a deliberate near-clone of `vault.js`: same
  guard, same base64 validation, same `{salt, iv, ciphertext}` record, because
  the invariant is the same — the server must stay structurally unable to read
  what it stores. A longitudinal record of someone's disputes gets the vault
  treatment, not a smaller one
- Losing the vault key loses the synced copy by design; the local copy is
  unaffected. Signing out wipes the device copy (entries **and** derived key),
  leaving the server ciphertext for the next sign-in
- Deletes and clear-all push immediately when synced, so a removal does not come
  back from another device on the next merge

✅ **Share Pages (`/s/<id>`)**
- `functions/s/[id].js` serves the app shell with this share's Open Graph tags
  injected via `HTMLRewriter` — `og:title`, `og:description` (an ~140-char
  excerpt), `og:type`, `og:url`, `og:site_name`, `twitter:card`, plus `og:locale`
  when the record carries a language
- **Byte-identical HTML for every requester** — no User-Agent branching, so
  crawlers get exactly what people get; serving crawlers a different page is the
  URL-keyed cache-poisoning class this app has been bitten by before
- The unfurl can only draw on fields the user chose to publish: the briefing and
  the weak-link note never reach the share record at all (`functions/api/share.js`
  builds it field by field), so they cannot leak even by bug
- The legacy `/?s=<id>` shape stays recognised indefinitely (the records behind
  those links still expire on the normal one-year TTL); `src/share.ts` reads both
  shapes and mints the path form
- Pages Function responses fall outside `public/_headers`, so this route carries
  its own `X-Content-Type-Options` / `Referrer-Policy` / `X-Frame-Options`

✅ **Aggregate Metrics (names and daily counts only)**
- `functions/api/metric.js` is the browser-reachable bridge: same-origin gated,
  an allowlist of names (`share_cta`, `share_view`, `instant_reply`,
  `instant_exhausted`), and a metric is a NAME and nothing else — no ids, no
  payload, no user agent, no referrer
- The limiter's SQLite DO stores `(day, name, count)` rows, so the whole dataset
  is daily integers per name
- `functions/api/metrics.js` reads them back for the operator only: gated on the
  `OPERATOR_EMAIL` secret matching the signed-in account's email, `404` for
  everyone else, `501` when the secret is unset

✅ **PWA (Progressive Web App)**
- Install on desktop (Chrome, Edge, Safari)
- Install on mobile (iOS/Android)
- App shell loads offline after the first online visit
- Update banner in open tabs when a new version deploys
- Service worker for caching & performance

✅ **Deployed on Cloudflare Pages**
- Live at https://rebut.m36x.com/ (project `m36x-rebuttal`)
- `public/_headers` carries the cache/security header rules
- Redeploy with `npm run build && npx wrangler pages deploy dist --project-name=m36x-rebuttal`

✅ **Security & Privacy**
- API keys stay in browser local storage; if you sign in, they are encrypted in the
  browser first and the server stores only ciphertext it has no way to decrypt
  (`functions/api/vault.js` holds `salt`, `iv`, `ciphertext` and nothing else)
- Reply history gets the same treatment: sealed in the browser, stored as one
  opaque blob (`functions/api/history.js`), unreadable server-side by
  construction. The honest cost is stated in the README — lose the passphrase and
  the synced copy is gone, because nobody can decrypt it
- The server never sees a provider key, a passphrase, or a decryption key. It does
  store your language preference, your reply history *as ciphertext*, and any
  rebuttal you explicitly publish as a share link — the private briefing and the
  weak-link note are never published
- Argument text reaches this app's servers in exactly one case: Instant mode
  (no key saved for the selected provider) sends it to `/api/generate` so the
  operator's key can pay for the reply. Nothing from the request is logged or persisted; the limiter
  stores an opaque quota key and a count, never text
- No third-party analytics or tracking; the limiter keeps only anonymous
  aggregate counters — a name and a daily total (Instant replies served, share
  pages viewed), never an id, a payload, a user agent or a referrer. Only the
  account matching `OPERATOR_EMAIL` can read them back
- HTTPS-only (enforced on all deployments)

---

## 📂 Project Structure

```
rebuttal-generator/
├── functions/api/
│   ├── article.js             # Article extraction + Internet Archive fallback
│   ├── generate.ts            # Instant mode: server-side proxy on the operator's OpenRouter key
│   ├── share.js               # Unlisted share links (Cloudflare KV)
│   ├── history.js             # Encrypted reply history — one ciphertext blob per account
│   ├── metric.js              # Browser-reachable metric bridge (allowlisted names only)
│   └── metrics.js             # Operator-only readback, gated on OPERATOR_EMAIL
├── functions/s/[id].js        # Share pages: app shell + per-share Open Graph meta
├── limiter/                   # m36x-limiter Worker: SQLite Durable Object for
│                              #   atomic daily quotas + aggregate metrics
│                              #   (service-bound, no public URL; deployed separately)
├── wrangler.toml              # Pages config + KV bindings + LIMITER service binding
├── public/
│   ├── manifest.json          # PWA metadata
│   ├── sw.js                  # Service worker (offline support)
│   ├── _headers               # Cloudflare Pages cache/security headers
│   ├── favicon.svg            # Browser-tab icon
│   ├── icon-*.png             # PWA icons (regular + maskable)
│   └── ICONS.md               # Icon documentation
├── src/
│   ├── App.tsx                # Main React component
│   ├── App.css                # App styles
│   ├── history.ts             # Local-first history store + encrypted sync client
│   ├── HistoryPanel.tsx       # History list: browse, restore, delete, clear
│   ├── share.ts               # Share client; mints /s/<id>, still reads legacy ?s=
│   ├── main.tsx               # React entry point
│   └── index.css              # Global styles
├── index.html                 # HTML entry point (PWA meta tags added)
├── vite.config.ts             # Build configuration
├── tsconfig.json              # TypeScript configuration
├── package.json               # Dependencies
├── README.md                  # Full documentation
├── DEPLOYMENT_GUIDE.md        # Cloudflare deployment instructions
└── PROJECT_SUMMARY.md         # This file
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Locally
```bash
npm run dev
```
App opens at `http://localhost:5173`

### 3. Build for Production
```bash
npm run build
```

### 4. Deploy

```bash
npx wrangler pages deploy
```

Live at https://rebut.m36x.com/ — see `DEPLOYMENT_GUIDE.md` for details.

---

## 🎯 How It Works

1. **User speaks, types, or pastes a URL** → Web Speech API, the textarea, or `/api/article` extraction
2. **User picks an AI** → provider + model dropdowns (`src/providers.ts` holds the curated registry and call adapters; read the CURATION RULE before adding models)
3. **The app searches first** → Tavily (keyless) returns a fixed citation set; the reply may cite only from it
4. **User clicks generate** → two parallel calls: the message and the honest check (sequential for local models). With no key saved for the selected provider, Instant mode instead POSTs the structured fields to `/api/generate`, which builds the prompt server-side and calls OpenRouter on the operator's key, with the daily quota checked in the limiter Worker first
5. **Results display** → one sendable message plus the weak link; the briefing is a third call, made only if opened. The reply is written to this device's history at the same time, and pushed as ciphertext if the account's vault is unlocked
6. **PWA magic** → Service worker caches assets for instant reopens

---

## 📱 PWA Capabilities

### After Installation, Users Get:
- ✅ App icon on home screen / desktop
- ✅ Full-screen app experience (no browser chrome)
- ✅ Offline UI shell (generating rebuttals still requires internet; past replies are kept on the device and survive a reload)
- ✅ Update banner when a new version deploys
- ✅ Native-app-like experience
- ✅ Smaller footprint than native apps

### Install Instructions:
- **Desktop (Chrome/Edge)**: Click install button in address bar
- **Desktop (Safari)**: Share → Add to Home Screen
- **Mobile (iOS/iPad)**: Safari → Share → Add to Home Screen
- **Mobile (Android)**: Chrome menu → Install app

---

## 💰 Cost & Performance

### Pricing
- Free with no account at all: the local in-browser models (WebLLM)
- Free with a free key: Gemini, Groq, and the OpenRouter free models (Nemotron 3
  Ultra, Gemma 4 31B)
- Paid: a fifth of a cent (GPT-5.6 Luna, GPT-OSS 120B, DeepSeek V4 Pro) up to
  ~16¢ for the most capable option (Claude Fable 5); shown live before you generate

### Performance
- First load: ~2-3 seconds (downloads assets)
- Subsequent loads: ~500ms (service worker cache)
- Generation time: ~2-3 seconds (API response)
- Deployed on CDN edge servers for instant global delivery

---

## 🔒 Security Details

### API Key Management
- Stored in browser's `localStorage`, one entry per provider (`api_key_<id>`)
- Sent only to the provider it belongs to — never to this app's own endpoints
- User can change anytime via "Change API Key" button
- Revoke at the provider's own console

### Data Privacy
- Argument text goes to: the chosen AI provider, and Tavily as the search query
  (unless sourcing is switched off). With the local in-browser model it goes nowhere
- In Instant mode only (no key saved for the selected provider), argument text goes to `/api/generate`,
  which forwards it to OpenRouter on the operator's key. Nothing is persisted;
  the quota counter holds an opaque id and a count
- `/api/article` receives the URL only, in URL mode — never typed text
- `/api/share` receives content only when the user clicks share; the private briefing
  and weak-link note are never published. `/s/<id>` renders that record and nothing
  more, identically for every requester
- `/api/history` receives reply history only from a signed-in account with an
  unlocked vault, and only ever as ciphertext — never plaintext, and never at all
  while signed out
- Audio never leaves the browser's own speech recognition
- No third-party analytics or tracking; server-side, only the anonymous quota
  and aggregate counters described above — ids and numbers, never content

---

## 🎨 Customization

### Change App Name/Description
Edit `public/manifest.json`:
```json
{
  "name": "Your Custom Name",
  "short_name": "Custom",
  "description": "Your description",
  "theme_color": "#667eea"
}
```

### Change Colors
Edit `src/index.css`:
```css
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

### Add Icons
See `public/ICONS.md` for creating PWA icons

### Modify the Prompts
Edit `src/prompts.ts` — but read [CONSTITUTION.md](CONSTITUTION.md) first; every rule
in there traces to research on what actually changes someone's mind.

---

## 📋 Icons

All PWA icons (regular + maskable, 192px and 512px) plus `favicon.svg` are
included in `public/`. See `public/ICONS.md` to regenerate them.

---

## 🆘 Troubleshooting

### "Speech recognition not supported"
→ Use Chrome, Edge, or Safari (Firefox does not support SpeechRecognition)

### "Failed to generate rebuttal"
→ Check API key is correct and you have API credits

### "Microphone not working"
→ Grant browser microphone permissions

### "Service worker not updating"
→ Hard refresh (Ctrl+Shift+R on Windows, Cmd+Shift+R on Mac)

### "App is blank/white"
→ Check browser console (F12) for errors
→ Clear localStorage and reload

---

## 📊 Browser Support

| Browser | Desktop | Mobile | PWA Install | Voice Input |
|---------|---------|--------|-------------|-------------|
| Chrome  | ✅      | ✅     | ✅          | ✅          |
| Edge    | ✅      | ✅     | ✅          | ✅          |
| Safari  | ✅      | ✅     | ✅          | ✅          |
| Firefox | ✅      | ✅     | ⚠️ Limited  | ❌          |
| IE 11   | ❌      | ❌     | ❌          | ❌          |

---

## 📚 Next Steps

1. **Get API key**: [console.anthropic.com](https://console.anthropic.com)
2. **Test locally**: `npm run dev`
3. **Deploy**: Follow `DEPLOYMENT_GUIDE.md`
4. **Share your link**: Let users install your PWA!

---

## 🎓 Technologies Used

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Lightning-fast build tool
- **9 AI providers, 24 curated models** - reply generation (BYO key, browser-direct)
- **Tavily** - keyless web search, so every model can cite real sources
- **Web Speech API** - Voice recognition
- **Service Workers** - PWA offline support
- **Cloudflare Pages + Pages Functions** - hosting, article extraction, share links and their `/s/<id>` Open Graph pages, encrypted history sync, the Instant-mode proxy
- **IndexedDB + WebCrypto (AES-GCM)** - local reply history, and the non-extractable key that seals it before sync
- **Cloudflare Workers + Durable Objects** - the m36x-limiter quota/metrics Worker (SQLite DO, service-bound)

---

## 📄 License

MIT - Use this however you want!

---

## 🚀 Ready to Deploy?

See `DEPLOYMENT_GUIDE.md` for step-by-step deployment instructions.

**Happy rebuttal generating!** 🎤✨
