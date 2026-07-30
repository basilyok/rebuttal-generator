# Rebuttal Generator

An installable web app that writes a reply designed to **change the mind of the specific
person who made the argument** — not to score points for an audience.

Paste an argument, speak it, or give it a URL. You get one message you could actually
send, grounded in sources that were really retrieved, plus a private briefing that tells
you the weakest point in *your own* position before you send anything.

How it writes is governed by **[CONSTITUTION.md](CONSTITUTION.md)** — ten rules drawn from
the research on what actually changes minds. Read that first if you plan to change the
prompts.

**🌍 Live at [rebuttal.m36x.com](https://rebuttal.m36x.com/) on Cloudflare Pages** • **📱 Fully PWA-enabled** • **⚡ [Deployment guide](DEPLOYMENT_GUIDE.md)**

## Features

- 🎤 **Voice, Text, or URL Input**: Dictate the argument via the browser microphone (Web Speech API), type it, or paste a link to an article and let the app pull the text in
- 🤖 **A short, curated model list**: six providers, sixteen models — every one of them able to hold this app's long, constraint-heavy prompt. Anthropic Claude, Google Gemini, Groq, OpenRouter (the only browser route to GPT), DeepSeek, or a model running locally in your browser with no API key at all (WebLLM/WebGPU)
- 🔗 **Real sources on every model**: the app searches the web itself (Tavily, keyless — no account needed) and the reply may cite *only* what was actually retrieved. Any URL the model invents is stripped before you see it
- ⚠️ **The weak link in your own position**, shown every time, before you send — if the other side is better supported, it says so
- ⚖️ **Their best case, and where you answer it**: a private briefing that checks your reply actually addresses their strongest argument, and flags anything it leaves unanswered
- 📤 **Shareable links**: publish a result to an unguessable URL you can send to anyone
- 💰 **Cost transparency**: estimated cost before you generate, actual cost and token counts after, and a running session total
- ↻ **Off-menu access**: the curated list is a recommendation, not a cage — ↻ Refresh pulls any provider's full live catalog at runtime, so new releases appear without a code change
- 🎨 **Beautiful UI**: Modern, responsive design that works on desktop and mobile
- 🔒 **Secure**: Your API key is stored locally in browser storage and sent only to the provider it belongs to — never to this app's own servers
- 📱 **PWA (Progressive Web App)**: Install on phone/desktop; the app shell loads offline after your first visit (generating rebuttals requires internet)
- ⚡ **Lightning Fast**: Vite builds + service worker caching = instant loads

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **AI**: 5 cloud providers via direct browser API calls (see below), plus in-browser inference via [WebLLM](https://webllm.mlc.ai/) (WebGPU)
- **Speech Recognition**: Web Speech API (native browser)

## Choosing an AI

| Provider | Cost | API key? | Models |
|----------|------|----------|--------|
| OpenRouter | Free models + paid | Yes (free) | **Nemotron 3 Super 120B** and **Ultra 550B** (genuinely free), Qwen3.7 Flash, **GPT-5.6 Luna / Terra**, Grok 4.5 |
| Google Gemini | Free tier + paid | Yes (free) | Gemini 3.1 Flash-Lite, Gemini 3.6 Flash — free tier on both |
| Groq | Free tier | Yes (free) | Llama 3.3 70B, GPT-OSS 120B — the fastest responses here |
| Anthropic Claude | Paid | Yes | Claude Haiku 4.5 / **Sonnet 5** / Fable 5 |
| DeepSeek | Paid (very cheap) | Yes | DeepSeek V4 Pro — frontier reasoning at ~1/10 the price |
| Local in-browser (WebLLM) | **Free** | **No** | Qwen 2.5 7B, Llama 3.2 3B on your own GPU via WebGPU; downloads once, nothing leaves your device |

Every provider here was verified to support direct browser (CORS) calls — this
app has no backend. OpenAI's own API blocks browser calls, which is why GPT
models are offered through OpenRouter instead. API keys are stored per-provider
in your browser's local storage and sent only to that provider.

### Why the list is short

The bar is not "the API works." This app asks a model to hold a long,
almost entirely *negative* prompt — a fixed eight-step structure, plain prose
with no markdown, a list of banned phrases, and citations drawn only from a
supplied set (see [CONSTITUTION.md](CONSTITUTION.md)). A model that cannot hold
it does not return a slightly worse reply; it returns bullet points,
"Actually,", and an invented statistic — in a message you might send to your
father-in-law. **A model that produces a message you would regret sending is
worse than no model.**

So a model earns a slot only if it (1) can hold that prompt — which rules out
roughly anything under 30B, (2) beats everything else here on price *and*
quality, and (3) has actually worked in this app. Two things that used to
justify entries no longer do: native web search is irrelevant now that Tavily
grounds every provider, and duplicate routes to the same model are not choice.

**The curated list is a recommendation, not a limit.** ↻ Refresh loads any
provider's full live catalog — 350+ models on OpenRouter alone — so nothing is
actually out of reach.

### Cost estimates

The app shows an estimated cost per rebuttal under the model dropdown, and the
actual cost (with token counts) after each generation, plus a running session
total. Prices come from each model's published per-million-token rates and are
listed in `src/providers.ts`. Where a provider reports exact spend — OpenRouter
returns `usage.cost` — that real figure is used instead of the estimate. Free
models and local in-browser models show **Free**.

Estimates for reasoning models include the hidden "thinking" tokens, which are
billed as output tokens and typically dominate the cost of a short answer.

### Reasoning models

Most current models are *reasoning* models: they generate hidden thinking
tokens before the visible answer, drawn from the same output budget. A budget
that is too small is consumed entirely by thinking, and the API returns empty
content with a `length` finish reason. The app handles this by giving reasoning
models a much larger budget, asking each provider to minimise reasoning where
its API allows it (OpenRouter `reasoning.effort`, Groq `reasoning_effort`,
Gemini `thinkingConfig`), and automatically retrying once with double the budget
if a response still comes back empty. If a model still fails this way, the
non-reasoning options sidestep it entirely: **Claude Haiku 4.5**, **Groq Llama
3.3 70B**, and both local in-browser models answer directly with no hidden
thinking. They are not the cheapest — several reasoning models here cost less —
but they are the most predictable.

## Rebutting an article from a URL

Switch the input to **🔗 Article URL**, paste a link, and the app pulls the
article's text into the editable box so you can review or trim it before
generating.

Extraction runs in a Cloudflare Pages Function (`functions/api/article.js`) on
the same deployment, because browsers cannot fetch third-party pages directly —
almost no publisher sends permissive CORS headers. The function fetches the page
at the edge, pulls the prose out with `HTMLRewriter`, and caps the result at
~20,000 characters to keep requests and costs bounded. **Only the article URL is
sent to it — your API keys never leave the browser.** It rejects non-public
addresses (localhost, private ranges) so it cannot be used to probe internal
networks. When run locally with `npm run dev` no function is served, so the app
falls back to [Jina Reader](https://jina.ai/reader/), a CORS-enabled reader
service.

**When an article isn't readable** — a paywall, a login wall, or a bot check —
the function looks for a publicly archived copy in the
[Internet Archive's Wayback Machine](https://web.archive.org/) and uses that if
one exists, labelling the result so you know where the text came from. If there
is no readable copy anywhere, you get a plain-English message asking you to open
the article and paste its text instead, which always works.

A note on scope: this uses ordinary reader extraction plus a public library
archive. It is not a paywall bypass, and it will not defeat publishers' access
controls — if an article is paywalled and unarchived, the app tells you so
rather than trying to work around it. (`removepaywall.com`, mentioned as a
possible option, publishes no API — it is a browser UI only — so it cannot be
called from code in any case.)

## What you get back

Two zones, deliberately separated — mixing them is how you end up pasting your own doubts
to the person you're trying to convince.

**The send zone** is one message, written to be sent as-is. It opens by restating their
actual claim, concedes something real, gives them an off-ramp *before* disagreeing, then
carries the evidence. The Copy button takes this and nothing else.

**The briefing** is for you and is labelled "don't send": the weakest point in your own
position, anything you should verify first, and their strongest case mapped against the
paragraph of your reply that answers it — with anything unanswered flagged.

## Sources — and why a fabricated URL is structurally impossible

**Find real evidence to cite** searches the web *before* generating, using
[Tavily](https://tavily.com). Those results are injected as a fixed, numbered set and the
model is told it may cite only from that set. Afterwards, **any URL in the output that
wasn't in the set is stripped** and reported in the claim badge.

That ordering is the whole point. Asking a model politely not to invent citations does not
work — and the research is explicit that persuasion-tuned generation *systematically
degrades factual accuracy* (Hackenburg et al., *Science* 2025). Making the citation set
fixed and verifying against it turns a request into a guarantee.

Tavily needs **no account and no API key** — the app uses its keyless mode. A free key
(1,000 searches/month, no card) only raises the rate limit, and there's a field for it in
settings. Social platforms and forums are excluded from results: a LinkedIn post is not
evidence that will persuade anyone.

Because the app does its own searching, **every provider can cite sources now** — including
Groq, DeepSeek and the free local in-browser model, none of which can search on their own.
If Tavily is unavailable, models with native search (Gemini, Claude, OpenRouter) fall back
to it; otherwise the reply is generated without sources and the badge says so plainly.

This is also why native search is no longer a reason to keep a model in the curated list:
it only ever runs as a fallback.

## Sharing a rebuttal

**🔗 Get a shareable link** publishes the argument, the rebuttal, the steelman and
any sources to an unguessable URL (`/?s=<id>`) backed by Cloudflare KV. Opening
that link shows the result read-only, with a button to write your own.

Be aware of what this means: the link is **unlisted, not private**. It is not
browsable, indexed, or discoverable — there is no public gallery — but anyone you
give it to can read it, and so can anyone they forward it to. Links expire after
a year. Your API key is never sent to the sharing service; the endpoint stores
only known fields, so nothing else in the payload can be persisted.

## Keeping the model list current

New models ship constantly. Three ways this stays current, in order of effort:

1. **The ↻ Refresh button** next to the Model dropdown, which fetches the
   provider's live model list at runtime — no code change, no redeploy. The
   result is cached in local storage and the dropdown shows how many models it
   holds and when it was updated. For **OpenRouter this needs no API key at
   all** and returns live per-token pricing for 350+ models, so it is the
   fastest way to reach a brand-new model from any major lab. For other
   providers it uses your stored key and lists their current model IDs
   (pricing shows as unknown for models not in the built-in catalog).
2. **Use OpenRouter as the catch-all.** It proxies OpenAI, Anthropic, Google,
   xAI, Meta, Moonshot, Qwen and others, so new releases usually appear there
   first and refresh picks them up automatically.
3. **Edit `src/providers.ts`** to change the curated defaults — the per-provider
   `models` arrays hold the id, label, `inPrice`/`outPrice` (USD per million
   tokens) and a `reasoning` flag. This is the only place model data lives.
   **Read the CURATION RULE comment at the top of that array first**: the list is
   deliberately short, and adding a model that cannot hold the prompt in
   [CONSTITUTION.md](CONSTITUTION.md) makes the app worse, not more capable.

## Accounts, and how your API keys are stored

Signing in is **optional**. Without it the app behaves exactly as it always has:
keys live in this browser's local storage and never leave it. Signing in adds two
things — your keys follow you to a new device, and your language choice sticks to
your account instead of to one browser.

### The keys are encrypted before they leave your browser

This is the part worth understanding, because "let us hold your API keys" is a
request you should be suspicious of. Anthropic and OpenAI keys spend real money.

So the server never sees them. When you set a passphrase, the browser derives an
AES-256 key from it with PBKDF2 (600,000 iterations, SHA-256), encrypts your keys
with AES-GCM, and uploads only the ciphertext, salt and IV. **The passphrase is
never transmitted**, and there is no code path in `functions/api/vault.js` that
could decrypt a vault — it stores three opaque strings and hands the same three
back. A full dump of that KV namespace yields nothing spendable.

The cost is one passphrase per new device. After that the derived key is cached in
IndexedDB as a **non-extractable** `CryptoKey`: the browser will decrypt with it but
will not hand its bytes back to any script, so you are not asked again and the raw
key never sits in JavaScript. Signing out deletes it.

Forgetting the passphrase is not a disaster — nothing is recoverable, but nothing is
lost either. You re-enter your API keys, which you can always read from the
provider's own console.

See [`src/vault.ts`](src/vault.ts) and [`functions/api/vault.js`](functions/api/vault.js).
If a change ever makes the server able to read a provider key, that is a breaking
change to the app's privacy promise, not a refactor.

### Enabling sign-in on your own deployment

Sign-in stays hidden until you configure it, so a fork with no OAuth credentials
just works without it.

1. Create the accounts KV namespace and paste the id into `wrangler.toml`:

```bash
npx wrangler kv namespace create ACCOUNTS
```

2. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth 2.0 Client ID** of type *Web application*. Add your origin to
   Authorised JavaScript origins, and this exact callback to Authorised redirect URIs:

   `https://your-domain.example/api/auth/google/callback`

3. Store the credentials as Pages secrets (never commit them):

```bash
npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name=m36x-rebuttal
```

```bash
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name=m36x-rebuttal
```

Meta and Apple are not wired up. The session layer is provider-agnostic
(`functions/_lib/session.js` namespaces user ids by provider), so adding them is
mechanical — but Apple in particular needs a paid Apple Developer account and a
client secret that expires every six months.

## Languages

The interface ships in twelve languages: English, Spanish, French, German,
Portuguese, Italian, Japanese, Korean, Simplified Chinese, Arabic, Hindi and Greek.
It picks one from your browser's language settings on first visit, and Arabic
switches the whole layout to right-to-left.

**English is always one click away.** Whenever the interface is not in English, a
literal "English" button sits beside the language picker — because someone who has
landed in a language they cannot read cannot be expected to find "English" inside a
dropdown whose own label they also cannot read.

Your choice is remembered in this browser, and on your account if you are signed in,
so it follows you rather than resetting on each new device.

### The reply's language is not the interface's language

These are deliberately separate. The reply is aimed at **the person who wrote the
argument**, so it follows *their* language — an English reply to a Spanish post
persuades nobody, however good it is. Paste a Spanish article while reading the app
in English and you get a Spanish reply, with a chip telling you so and a dropdown to
override it.

The private briefing does the opposite: the weak-link note and their-best-case
section are for **you**, so they come back in your interface language even when the
reply is in another.

This also matters for quality in a way that is easy to miss. The constitution's
anti-reactance rule (rule 7) is enforced by banning specific phrases — "you must",
"the fact is", "Actually," — and a banned-phrase list is language-specific. Shipping
only the English list would let the model write *"debes"* or *"el hecho es"* freely
and the rule would silently stop working. So every language has its own list, in
[`src/i18n/persuasion.ts`](src/i18n/persuasion.ts), along with notes on things
English does not force you to decide — Japanese politeness level, French tu/vous,
Korean speech level. Adding a language means adding that entry too, not just the UI
strings.

## Quick Start

### Prerequisites

- Node.js 18+ and npm (required by Vite 5)
- An API key for one of the cloud providers above — free ones exist for Gemini, Groq and OpenRouter. Or no key at all, if you use the local in-browser option
- A modern browser with microphone access (Chrome, Edge, Safari, Firefox)

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will open automatically at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## How to Use

1. **Pick an AI**: the collapsed summary names the model and what it is good at; open it to change provider or model. For zero-cost, zero-signup use, pick **Local in-browser (FREE, no key)** — the model downloads once and runs on your GPU
2. **Enter API Key** (cloud providers only): the app links to each provider's key page; free-tier keys exist for Gemini, Groq and OpenRouter
3. **Enter Your Argument**: Type it, click "Start Recording" and speak it, or switch to **🔗 Article URL** and paste a link — dictated and fetched text both stay editable afterwards
4. **Say who will read it** (optional): one line about the recipient changes the register and which sources get used. Leave it blank and it is inferred from the text
5. **Write my reply**: produces one sendable message, plus the weak link in your own position
6. **Open the briefing** (optional): their strongest case, and whether your reply actually answers it — this part is never sent

## Features Explained

### Brief Rebuttal
Shows a concise, punchy counter-argument in 1-2 sentences. Perfect for quick comebacks.

### Detailed Rebuttal
Provides a comprehensive response with:
- Counterpoints to the original argument
- Evidence-based reasoning
- Logical fallacy identification (when applicable)
- Strong conclusions

## Browser Compatibility

- ✅ Chrome/Chromium (full support)
- ✅ Edge (full support)
- ✅ Safari (full support)
- ⚠️ Firefox (no voice input — Firefox does not implement SpeechRecognition)
- ❌ IE 11 (not supported)

## Privacy & Security

Keys are stored only in your browser's local storage, one entry per provider, and
are sent only to the provider they belong to — never to this app's own endpoints.

Where your argument text actually goes, in full:

- **The AI provider you picked**, to write the reply. With the local in-browser
  option it goes nowhere — inference runs on your own GPU.
- **Tavily**, as the evidence-search query, on every generation where sourcing is
  left on. Turn off "Find real evidence to cite" and no search request is made.
- **This app's `/api/article` function**, but only in URL mode, and only the URL —
  never your typed text. It fetches the page server-side because the browser cannot.
- **This app's `/api/share` function**, only if you click "Get a shareable link".
  That publishes deliberately; the private briefing and weak-link note are never sent.

Audio never leaves the browser's own speech recognition. There is no analytics, no
tracking, and no server-side logging by this app.

## Troubleshooting

### "Speech recognition not supported"
- Make sure you're using Chrome, Edge, or Safari (Firefox lacks SpeechRecognition)
- Check that microphone permissions are granted
- Try refreshing the page

### "Failed to generate rebuttal"
- Verify your API key is correct
- Check that you have API credits available
- Ensure you have a stable internet connection

### Microphone not working
- Check browser microphone permissions
- Try refreshing the page
- Test your microphone in other browser apps

## API Costs

Costs depend on the provider and model you pick, and the app shows them live —
see [Cost estimates](#cost-estimates). The local in-browser option is entirely
free. Free tiers (Gemini, Groq, and the OpenRouter free models) cost nothing
within their limits. On paid providers a reply ranges from a fraction of a cent
(Qwen3.7 Flash, GPT-OSS 120B, DeepSeek V4 Pro) through ~3¢ (Claude Sonnet 5,
GPT-5.6 Terra) to ~16¢ on the most capable model here (Claude Fable 5).

## Progressive Web App (PWA)

This app is fully PWA-enabled! You can:

### Install on Desktop
- **Chrome/Edge**: Click the install button in the address bar
- **Safari**: Use Share → Add to Home Screen
- **Firefox**: Right-click app name → Install

### Install on Mobile
- **iOS/iPadOS**: Safari → Share → Add to Home Screen
- **Android**: Chrome menu → Install app

Once installed, the app:
- ✅ Loads its UI offline (after the first full online visit caches the assets)
- ✅ Uses cached assets for instant loading
- ✅ Shows an update banner in open tabs when a new version deploys
- ✅ Takes less space than a native app
- ✅ Works just like a native mobile app

**Note**: Writing a reply calls your chosen provider (and Tavily for sourcing), so
it needs internet — except with the local in-browser option, which works offline
once the model has downloaded. Replies live only in the current page session; they
are not persisted across reloads.

## Deployment

The app is deployed on **Cloudflare Pages** (project `m36x-rebuttal`) and lives
at **https://rebuttal.m36x.com/**. To ship an update:

```bash
npm run build
npx wrangler pages deploy dist --project-name=m36x-rebuttal
```

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for details, caching rules
(`public/_headers`), and troubleshooting. The `dist/` output is fully static,
so any static host (Netlify, Vercel, S3+CloudFront, GitHub Pages…) also works.

## Environment Variables

The app stores sensitive data (API key) in browser local storage, not in environment variables. This keeps it private and secure.

If you want to customize the build, you can modify `vite.config.ts`.

## License

MIT

## Support

For issues or questions:
- Check the [Anthropic documentation](https://docs.anthropic.com)
- Review the [Web Speech API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- Review [PWA documentation](https://web.dev/progressive-web-apps/)
- Submit issues on GitHub

Enjoy generating witty rebuttals! 🚀
