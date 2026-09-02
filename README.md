# Subly — Subscription Ledger

A personal finance dashboard for tracking recurring subscriptions: monthly
spend, usage-based nudges for things you're paying for but not using,
shared/family plan splitting, a spend trend chart, and more.

Originally built as a Claude artifact — this is the same app packaged as a
standalone Vite + React project so it can run and be deployed anywhere.

## Run locally

```bash
npm install
npm run dev
```

Then open the printed local URL (usually http://localhost:5173).

## Build for production

```bash
npm run build
npm run preview   # serve the production build locally to check it
```

The build output goes to `dist/` — that folder is a static site you can
deploy to any static host (Vercel, Netlify, GitHub Pages, Cloudflare Pages,
S3, etc.).

## Data storage

Data is stored in the browser via `localStorage` (see `src/main.jsx`), so
each browser/device keeps its own separate data — nothing is sent to a
server. Clearing your browser data will clear the app's data too.

## Tech

- React 18 + Vite
- lucide-react for icons
- No backend — everything runs client-side
