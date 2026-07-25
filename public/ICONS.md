# PWA Icons

All required PWA icons are present in this folder:

- `icon-192.png` - 192x192px icon
- `icon-512.png` - 512x512px icon
- `icon-192-maskable.png` - 192x192px maskable icon (glyph inside the safe zone)
- `icon-512-maskable.png` - 512x512px maskable icon (glyph inside the safe zone)
- `favicon.svg` - scalable browser-tab icon

The design is a white microphone on the app's `#667eea → #764ba2` gradient.

## Regenerating

To replace them, produce PNGs at the same names/sizes (keep the maskable
variants' artwork within the center ~68% safe zone) and drop them in this
folder. Free generators like [PWA Asset Generator](https://www.pwa-asset-generator.com/)
work well; any 512x512 source image can be scaled down for the 192px versions.

## Screenshots (optional)

`screenshot-540.png` (540x720) and `screenshot-1280.png` (1280x800) can be
added for richer install UI on supported platforms. If you add them, also
restore the `screenshots` array in `manifest.json`.
