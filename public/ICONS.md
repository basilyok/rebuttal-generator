# PWA Icons

This app needs icon files for the PWA to work properly. You need to create/provide these files in the `public/` folder:

## Required Icons

- `icon-192.png` - 192x192px icon
- `icon-512.png` - 512x512px icon
- `icon-192-maskable.png` - 192x192px maskable icon
- `icon-512-maskable.png` - 512x512px maskable icon

## How to Generate Icons

### Option 1: Using a Free Tool (Easiest)

1. Go to [PWA Asset Generator](https://www.pwa-asset-generator.com/)
2. Upload your logo or design
3. Download all generated icons
4. Place them in the `public/` folder

### Option 2: Using Design Software

Create a 512x512px image in Figma, Illustrator, or similar:
- Background: `#667eea` (the app's primary color)
- Use a microphone icon or speech bubble emoji as the main element
- Export as PNG
- Scale down to 192x192px for the smaller version

For maskable icons:
- Keep the design within a safe zone (leave margin around edges)
- Export separately as maskable versions

### Option 3: Quick DIY with ImageMagick

```bash
# If you have a base image
convert your-image.png -resize 192x192 public/icon-192.png
convert your-image.png -resize 512x512 public/icon-512.png
convert your-image.png -resize 192x192 public/icon-192-maskable.png
convert your-image.png -resize 512x512 public/icon-512-maskable.png
```

### Option 4: Skip Icons (Not Recommended)

The app will still work without icons, but:
- PWA won't have a proper app icon
- Won't install properly on home screen
- Won't display correctly in app lists

## Icon Guidelines

- Make icons square (192x192, 512x512)
- Use PNG format with transparency
- Keep design simple and recognizable at small sizes
- Use your app's primary color (#667eea) if possible
- Maskable icons should have design within center 66% (for safe zone)

## After Adding Icons

The app will automatically:
- Use the icons for PWA installation
- Show them on home screen after installation
- Display them in browser extensions list
- Use them in system notifications

## Screenshots

Also create optional:
- `screenshot-540.png` - 540x720px (mobile/narrow form factor)
- `screenshot-1280.png` - 1280x800px (desktop/wide form factor)

These appear in app stores on supported platforms.

---

**Note**: The app functions perfectly fine without these icon files - they're only needed for optimal PWA experience. You can add them later!
