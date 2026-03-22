# Quick Deployment Guide

Get your Rebuttal Generator live in minutes!

## 🚀 Fastest Way: Netlify (Recommended)

### Step 1: Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/rebuttal-generator.git
git push -u origin main
```

### Step 2: Deploy on Netlify
1. Go to [netlify.com](https://netlify.com)
2. Click "Sign up" → choose "GitHub"
3. Click "New site from Git"
4. Select your GitHub repository
5. Netlify auto-detects the build settings
6. Click "Deploy site"
7. ✅ Your app is live in ~2 minutes!

**Your URL:** `https://your-site-name.netlify.app`

---

## 🎯 Alternative: Vercel

### Step 1: Same GitHub setup as above

### Step 2: Deploy on Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Vercel auto-detects everything
5. Click "Deploy"
6. ✅ Your app is live!

**Your URL:** `https://your-site-name.vercel.app`

---

## 📱 Enable PWA Installation

After deploying, users can install your app:

### On Desktop
- Chrome/Edge: Click install button in address bar
- Safari: Share → Add to Home Screen

### On Mobile
- iOS/iPad: Safari → Share → Add to Home Screen
- Android: Chrome menu → Install app

---

## 🔐 Security Best Practices

### Environment Variables (Optional)
If you want to add server-side features later, create a `.env.local` file:
```
VITE_API_URL=https://api.example.com
```

**Current Setup:**
- Your API key is stored only in browser local storage
- Never sent to any server except Anthropic
- Users can change it anytime

### CORS & API
- The app makes direct API calls from the browser
- No backend server needed
- API key stays private on user's device

---

## 🎨 Customization Before Deploy

### Update App Info
Edit `public/manifest.json`:
```json
{
  "name": "Your Custom Name",
  "short_name": "Custom",
  "description": "Your description",
  "theme_color": "#667eea"
}
```

### Add Icons
See `public/ICONS.md` for creating app icons

### Update README
Edit `README.md` with your deployment URL

---

## 📊 Monitoring & Updates

### Netlify Dashboard
- View analytics and deployments at [netlify.com](https://netlify.com)
- Auto-redeploy when you push to GitHub
- Manage custom domain

### Vercel Dashboard
- View analytics and deployments at [vercel.com](https://vercel.com)
- Auto-redeploy when you push to GitHub
- Manage custom domain

---

## 🌍 Custom Domain

### Netlify
1. Go to Site settings → Domain management
2. Click "Add custom domain"
3. Follow DNS setup instructions

### Vercel
1. Go to Settings → Domains
2. Click "Add"
3. Follow DNS setup instructions

---

## 🆘 Troubleshooting

### "Build failed"
- Check Node version: `node --version` (should be 16+)
- Run `npm install` locally first
- Check for errors in build logs

### "App shows blank page"
- Check browser console (F12) for errors
- Verify service worker is running (DevTools → Application → Service Workers)
- Clear browser cache and reload

### "Microphone not working"
- Check browser permissions
- Use HTTPS (all deployed sites use HTTPS automatically)
- Try a different browser

### "API calls failing"
- Verify API key is correct
- Check internet connection
- Check [Anthropic status page](https://status.anthropic.com)

---

## 📈 Performance Tips

### For PWA Users
- Service worker caches assets for instant loading
- App works offline (UI only, API calls need internet)
- Automatic updates when you deploy changes

### For All Users
- Vite builds highly optimized code
- Assets are minified and cached
- First load: ~2-3 seconds
- Subsequent loads: ~500ms

---

## 🎉 You're Done!

Share your app:
- Twitter/X: "Check out my Rebuttal Generator PWA!"
- LinkedIn: Professional AI-powered tool
- Friends: Get quick rebuttals with AI!

**Keep building!** 🚀
