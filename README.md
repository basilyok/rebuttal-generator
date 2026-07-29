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
- 🤖 **10 AI Providers, 50+ models**: Anthropic Claude, Google Gemini, Groq, OpenRouter, Mistral, DeepSeek, xAI Grok, Cohere, Together AI — or run a model locally in your browser for free with no API key (WebLLM/WebGPU)
- 🔗 **Real sources on every model**: the app searches the web itself (Tavily, keyless — no account needed) and the reply may cite *only* what was actually retrieved. Any URL the model invents is stripped before you see it
- ⚠️ **The weak link in your own position**, shown every time, before you send — if the other side is better supported, it says so
- ⚖️ **Their best case, and where you answer it**: a private briefing that checks your reply actually addresses their strongest argument, and flags anything it leaves unanswered
- 📤 **Shareable links**: publish a result to an unguessable URL you can send to anyone
- 💰 **Cost transparency**: estimated cost before you generate, actual cost and token counts after, and a running session total
- ↻ **Self-updating model list**: pull each provider's live catalog at runtime, so new model releases appear without a code change
- ⚡ **Instant Rebuttals**: Brief and detailed rebuttals generated in parallel
- 📖 **Expandable Details**: Click to view comprehensive, well-reasoned detailed rebuttals
- 🎨 **Beautiful UI**: Modern, responsive design that works on desktop and mobile
- 🔒 **Secure**: Your API key is stored locally in browser storage and never sent to any server except Anthropic
- 📱 **PWA (Progressive Web App)**: Install on phone/desktop; the app shell loads offline after your first visit (generating rebuttals requires internet)
- ⚡ **Lightning Fast**: Vite builds + service worker caching = instant loads

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **AI**: 10 providers via direct browser API calls (see below), plus in-browser inference via [WebLLM](https://webllm.mlc.ai/) (WebGPU)
- **Speech Recognition**: Web Speech API (native browser)

## Choosing an AI

| Provider | Cost | API key? | Notes |
|----------|------|----------|-------|
| Local in-browser (WebLLM) | **Free** | **No** | Llama/Phi/Gemma/Qwen run on your GPU via WebGPU; one-time model download (0.9–4.5 GB), fully private |
| Google Gemini | Free tier + paid | Yes (free) | Gemini 3.6 Flash, 3.5/3.1 Flash-Lite, 3.1 Pro. Free tier on all but 3.1 Pro |
| Groq | Free tier | Yes (free) | Extremely fast Llama 3.x, GPT-OSS, Qwen 3.6 |
| OpenRouter | Free models + paid | Yes (free) | Genuinely free models, plus paid GPT-5.6, Claude Opus 5, Gemini, Grok, Kimi — 350+ total |
| Mistral | Free tier + paid | Yes (free) | Mistral Small 4 / Medium 3.5 / Large 3, Magistral |
| Cohere | Free trial + paid | Yes (free) | Command A / R / R7B |
| Anthropic Claude | Paid | Yes | Claude Haiku 4.5 / Sonnet 5 / Opus 5 / Fable 5 |
| DeepSeek | Paid (very cheap) | Yes | DeepSeek V4 Flash / V4 Pro |
| xAI Grok | Paid | Yes | Grok 4.5 / 4.3 / 4.20 (reasoning and non-reasoning) |
| Together AI | Paid | Yes | Kimi K3, DeepSeek V4 Pro, Qwen3.7 Max, GLM-5.2, MiniMax M3 |

Every provider here was verified to support direct browser (CORS) calls — this
app has no backend. OpenAI's own API blocks browser calls, which is why GPT
models are offered through OpenRouter instead. API keys are stored per-provider
in your browser's local storage and sent only to that provider.

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
if a response still comes back empty. Models marked "no reasoning" in the
dropdown avoid the issue entirely and are the cheapest, fastest choice.

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
Groq, Mistral, DeepSeek, xAI, Cohere, Together, and the free local in-browser model, none
of which can search on their own. If Tavily is unavailable, models with native search
(Gemini, Claude, OpenRouter) fall back to it; otherwise the reply is generated without
sources and the badge says so plainly.

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

## Quick Start

### Prerequisites

- Node.js 18+ and npm (required by Vite 5)
- An Anthropic API key (get one at [console.anthropic.com](https://console.anthropic.com))
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

1. **Pick an AI**: Choose a provider and model from the dropdowns. For zero-cost, zero-signup use, pick **Local in-browser (FREE, no key)** — the model downloads once and runs on your GPU
2. **Enter API Key** (cloud providers only): the app links to each provider's key page; free-tier keys exist for Gemini, Groq, OpenRouter, Mistral, and Cohere
3. **Enter Your Argument**: Type it, click "Start Recording" and speak it, or switch to **🔗 Article URL** and paste a link — dictated and fetched text both stay editable afterwards
4. **Generate Rebuttal**: Click "Generate Rebuttal" to create a response
5. **View Details**: Click "View Detailed Rebuttal" to expand and see the comprehensive analysis

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

- Your API key is stored only in your browser's local storage
- Audio is processed only by your browser's speech recognition
- The text of your arguments is sent only to Anthropic's API for rebuttal generation
- No data is logged or stored on any third-party servers

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
free. Free tiers (Gemini, Groq, OpenRouter free models, Mistral, Cohere trial)
cost nothing within their limits. On paid providers a typical rebuttal pair
ranges from a fraction of a cent (Qwen3.7 Flash, Llama 3.1 8B, Claude Haiku 4.5)
to a few cents on the largest reasoning models (Claude Fable 5, GPT-5.6 Sol).

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

**Note**: Generating rebuttals calls the Anthropic API and requires internet.
Generated rebuttals live only in the current page session — they are not
persisted across reloads.

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
