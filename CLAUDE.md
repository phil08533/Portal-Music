# Portal Music — notes for Claude

Read README.md first for the architecture. Key rules:

- **Ads**: the code lives only in `js/app.js` (`loadAds`); the settings (on/off, zone, all pages vs
  download page only, hours between ads, first-ad delay) live in `data/ads.json`, edited in the admin
  studio's 💰 Ads tab. Never add ad snippets to individual pages. **Ads are currently OFF**
  (owner's choice). Never on `upgrade.html` / `pro.html` or for Pro members.
- **Pro status** can only be set server-side: the admin studio / Stripe Worker (service account)
  or by redeeming a single-use code (enforced in `firestore.rules`). Never add client code that
  writes `isPro` or other fields listed in `proFields()` in `firestore.rules`.
- If you change `firestore.rules`, the owner must paste it into Firebase Console → Firestore → Rules.
- If you change `workers/stripe-pro/worker.js`, the owner must re-paste it into the Cloudflare
  Worker `portal-music-webhook`.
- Audio and covers live on Cloudflare R2 (`assets.portal-music.com`); `music/` and `covers/` are
  gitignored locally.
- After catalog changes run `npm run seo`.
- `admin/` runs locally only (127.0.0.1 + per-launch token) and is never deployed.

## Owner to-do list
Keep `TODO.md` up to date: add anything the owner must do in a dashboard or decide,
and move finished items to its Done section.
