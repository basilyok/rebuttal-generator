# Rebuttal Generator

A modern, installable web app that uses AI to generate intelligent rebuttals to arguments. Simply speak your argument into the microphone, and the app will instantly generate a brief rebuttal with the option to expand and view a more detailed analysis. Choose from 10 AI providers — including a completely free option that runs the model locally in your browser with no API key.

**🌍 Live at [rebuttal.m36x.com](https://rebuttal.m36x.com/) on Cloudflare Pages** • **📱 Fully PWA-enabled** • **⚡ [Deployment guide](DEPLOYMENT_GUIDE.md)**

## Features

- 🎤 **Voice Input**: Capture arguments via browser microphone using the Web Speech API
- 🤖 **10 AI Providers**: Anthropic Claude, Google Gemini, Groq, OpenRouter, Mistral, DeepSeek, xAI Grok, Cohere, Together AI — or run a model locally in your browser for free with no API key (WebLLM/WebGPU)
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
| Google Gemini | Free tier + paid | Yes (free) | Generous free daily limits with an AI Studio key |
| Groq | Free tier | Yes (free) | Extremely fast Llama/Qwen/Kimi/GPT-OSS inference |
| OpenRouter | Free models + paid | Yes (free) | Genuinely free models, plus paid GPT-5.1, Claude, Gemini and 300+ others |
| Mistral | Free tier + paid | Yes (free) | Free experimentation tier |
| Cohere | Free trial + paid | Yes (free) | Rate-limited trial keys |
| Anthropic Claude | Paid | Yes | Claude Haiku 4.5 / Sonnet 5 / Opus 5 / Fable 5 |
| DeepSeek | Paid (very cheap) | Yes | DeepSeek V3 chat + R1 reasoner |
| xAI Grok | Paid | Yes | Grok 4 family |
| Together AI | Paid | Yes | Open models (Llama, DeepSeek, Qwen) |

Every provider here was verified to support direct browser (CORS) calls — this
app has no backend. OpenAI's own API blocks browser calls, which is why GPT
models are offered through OpenRouter instead. API keys are stored per-provider
in your browser's local storage and sent only to that provider.

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
3. **Record Your Argument**: Click "Start Recording" and speak your argument clearly
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

Costs depend on the provider you pick. The local in-browser option is entirely
free. Free tiers (Gemini, Groq, OpenRouter free models, Mistral, Cohere trial)
cost nothing within their limits. On paid providers a typical argument/rebuttal
pair is well under a cent — e.g. Claude Haiku 4.5 at $1.00/$5.00 per million
input/output tokens.

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
