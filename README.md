# Rebuttal Generator

A modern, installable web app that uses Claude Haiku 4.5 to generate intelligent rebuttals to arguments. Simply speak your argument into the microphone, and the app will instantly generate a brief rebuttal with the option to expand and view a more detailed analysis.

**🌍 Live at [rebuttal.m36x.com](https://rebuttal.m36x.com/) on Cloudflare Pages** • **📱 Fully PWA-enabled** • **⚡ [Deployment guide](DEPLOYMENT_GUIDE.md)**

## Features

- 🎤 **Voice Input**: Capture arguments via browser microphone using the Web Speech API
- ⚡ **Instant Rebuttals**: Brief and detailed rebuttals generated in parallel
- 📖 **Expandable Details**: Click to view comprehensive, well-reasoned detailed rebuttals
- 🎨 **Beautiful UI**: Modern, responsive design that works on desktop and mobile
- 🔒 **Secure**: Your API key is stored locally in browser storage and never sent to any server except Anthropic
- 📱 **PWA (Progressive Web App)**: Install on phone/desktop; the app shell loads offline after your first visit (generating rebuttals requires internet)
- ⚡ **Lightning Fast**: Vite builds + service worker caching = instant loads

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **AI**: Claude Haiku 4.5 via Anthropic API
- **Speech Recognition**: Web Speech API (native browser)

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

1. **Get Your API Key**: Visit [console.anthropic.com](https://console.anthropic.com) and create an API key
2. **Enter API Key**: When you first open the app, you'll see a prompt to enter your API key
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

This app uses Claude Haiku 4.5, the most cost-effective Claude model:
- Input: $1.00 per million tokens
- Output: $5.00 per million tokens

A typical argument/rebuttal pair costs well under a cent.

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
