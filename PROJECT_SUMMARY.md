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
- Unlisted share links (`/?s=<id>`) backed by Cloudflare KV
- Cost estimate before generating, actual cost + token usage after, session total
- Reasoning-model aware: generous token budgets, per-provider reasoning
  minimisation, and automatic retry so "thinking" models still return answers
- ↻ Refresh pulls each provider's live model catalog at runtime

✅ **PWA (Progressive Web App)**
- Install on desktop (Chrome, Edge, Safari)
- Install on mobile (iOS/Android)
- App shell loads offline after the first online visit
- Update banner in open tabs when a new version deploys
- Service worker for caching & performance

✅ **Deployed on Cloudflare Pages**
- Live at https://rebuttal.m36x.com/ (project `m36x-rebuttal`)
- `public/_headers` carries the cache/security header rules
- Redeploy with `npm run build && npx wrangler pages deploy dist --project-name=m36x-rebuttal`

✅ **Security & Privacy**
- API keys stay in browser local storage; if you sign in, they are encrypted in the
  browser first and the server stores only ciphertext it has no way to decrypt
  (`functions/api/vault.js` holds `salt`, `iv`, `ciphertext` and nothing else)
- The server never sees a provider key, a passphrase, or a decryption key. It does
  store your language preference, and any rebuttal you explicitly publish as a
  share link — the private briefing and the weak-link note are never published
- No tracking or analytics
- HTTPS-only (enforced on all deployments)

---

## 📂 Project Structure

```
rebuttal-generator/
├── functions/api/
│   ├── article.js             # Article extraction + Internet Archive fallback
│   └── share.js               # Unlisted share links (Cloudflare KV)
├── wrangler.toml              # Pages config + SHARES KV binding
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

Live at https://rebuttal.m36x.com/ — see `DEPLOYMENT_GUIDE.md` for details.

---

## 🎯 How It Works

1. **User speaks, types, or pastes a URL** → Web Speech API, the textarea, or `/api/article` extraction
2. **User picks an AI** → provider + model dropdowns (`src/providers.ts` holds the curated registry and call adapters; read the CURATION RULE before adding models)
3. **The app searches first** → Tavily (keyless) returns a fixed citation set; the reply may cite only from it
4. **User clicks generate** → two parallel calls: the message and the honest check (sequential for local models)
5. **Results display** → one sendable message plus the weak link; the briefing is a third call, made only if opened
6. **PWA magic** → Service worker caches assets for instant reopens

---

## 📱 PWA Capabilities

### After Installation, Users Get:
- ✅ App icon on home screen / desktop
- ✅ Full-screen app experience (no browser chrome)
- ✅ Offline UI shell (generating rebuttals still requires internet; results are not persisted across reloads)
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
- `/api/article` receives the URL only, in URL mode — never typed text
- `/api/share` receives content only when the user clicks share; the private briefing
  and weak-link note are never published
- Audio never leaves the browser's own speech recognition
- No third-party analytics or tracking, and no server logs on your side

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
- **Cloudflare Pages + Pages Functions** - hosting, article extraction, share links

---

## 📄 License

MIT - Use this however you want!

---

## 🚀 Ready to Deploy?

See `DEPLOYMENT_GUIDE.md` for step-by-step deployment instructions.

**Happy rebuttal generating!** 🎤✨
