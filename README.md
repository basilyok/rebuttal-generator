# Rebuttal Generator

A modern, installable web app that uses Claude Haiku 4.5 to generate intelligent rebuttals to arguments. Simply speak your argument into the microphone, and the app will instantly generate a brief rebuttal with the option to expand and view a more detailed analysis.

**⚡ [Deploy in 2 minutes with Netlify or Vercel](DEPLOYMENT_GUIDE.md)** • **📱 Fully PWA-enabled** • **🚀 Works offline**

## Features

- 🎤 **Voice Input**: Capture arguments via browser microphone using the Web Speech API
- ⚡ **Instant Rebuttals**: Generate brief, punchy rebuttals in seconds
- 📖 **Expandable Details**: Click to view comprehensive, well-reasoned detailed rebuttals
- 🎨 **Beautiful UI**: Modern, responsive design that works on desktop and mobile
- 🔒 **Secure**: Your API key is stored locally in browser storage and never sent to any server except Anthropic
- 📱 **PWA (Progressive Web App)**: Install on phone/desktop, works offline, auto-updates
- ⚡ **Lightning Fast**: Vite builds + service worker caching = instant loads

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **AI**: Claude Haiku 4.5 via Anthropic API
- **Speech Recognition**: Web Speech API (native browser)

## Quick Start

### Prerequisites

- Node.js 16+ and npm
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
- ✅ Firefox (full support with SpeechRecognition)
- ❌ IE 11 (not supported)

## Privacy & Security

- Your API key is stored only in your browser's local storage
- Audio is processed only by your browser's speech recognition
- The text of your arguments is sent only to Anthropic's API for rebuttal generation
- No data is logged or stored on any third-party servers

## Troubleshooting

### "Speech recognition not supported"
- Make sure you're using a modern browser (Chrome, Edge, Safari, or Firefox)
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

This app uses Claude Haiku 4.5, which is the most cost-effective Claude model:
- Input: ~$0.80 per million tokens
- Output: ~$4.00 per million tokens

A typical argument/rebuttal pair uses ~200-400 tokens total, so costs are minimal.

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
- ✅ Works completely offline
- ✅ Uses cached assets for instant loading
- ✅ Gets automatic updates
- ✅ Takes less space than a native app
- ✅ Works just like a native mobile app

**Note**: API calls to Claude require internet, but the UI and offline features work without it.

## Deployment

### Option 1: Netlify (Recommended - Free)

1. Push your code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/rebuttal-generator.git
   git push -u origin main
   ```

2. Go to [netlify.com](https://netlify.com) and sign up with GitHub

3. Click "New site from Git" and select your repository

4. Netlify will auto-detect the build settings and deploy!

5. Your app is live at `yoursite.netlify.app`

### Option 2: Vercel (Free)

1. Push your code to GitHub (see Netlify steps above)

2. Go to [vercel.com](https://vercel.com) and sign up with GitHub

3. Click "New Project" and import your repository

4. Vercel will auto-detect settings and deploy!

5. Your app is live at `yoursite.vercel.app`

### Option 3: Docker (Self-hosted)

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:18-alpine
RUN npm install -g serve
WORKDIR /app
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
```

Build and run:
```bash
docker build -t rebuttal-generator .
docker run -p 3000:3000 rebuttal-generator
```

### Option 4: Manual Deploy

1. Build the app:
   ```bash
   npm run build
   ```

2. Upload the `dist/` folder to any web hosting:
   - AWS S3 + CloudFront
   - Google Cloud Storage
   - Azure Static Web Apps
   - DigitalOcean App Platform
   - Any traditional web host

Make sure to configure the host to redirect all routes to `index.html` (for client-side routing).

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
