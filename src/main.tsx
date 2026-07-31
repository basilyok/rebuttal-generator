import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Vite's asset filenames are a content hash, so rebuilding with no source change
// reuses the exact same /assets/index-*.js URL — a comment alone doesn't do it,
// since minification strips comments and leaves the compiled bytes untouched.
// That matters here: an earlier deploy's asset briefly 404'd on some Cloudflare
// edge during propagation, the edge's SPA fallback served index.html for it
// instead, and _headers' path-based matching cached that HTML under the JS
// asset's URL with a one-year immutable TTL — poisoning that URL at that edge
// regardless of which browser or network request it. A real code change forces
// a brand-new, never-cached URL, which is what actually clears it (see
// public/404.html for the fix that stops a missing asset from ever falling back
// to index.html in the first place).
//
// This also doubles as a standing diagnostic: window.__REBUTTAL_BUILD__ in the
// console tells you exactly which deploy a browser is actually running, without
// having to infer it from an asset hash you can't see from the outside.
;(window as unknown as { __REBUTTAL_BUILD__: string }).__REBUTTAL_BUILD__ = '2026-07-31-cache-poisoning-fix'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
