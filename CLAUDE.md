# Portal Music — notes for Claude

Read README.md first for the architecture. Key rules:

- **Ads** are configured only in `js/app.js` (`AD_ZONES`, `loadAds`). Never add ad snippets to
  individual pages. Current choice (from Monetag stats): Glad popunder zone `10786944` on all
  content pages; none on `upgrade.html` / `pro.html` or for Pro members.
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

## Open items for the owner
- [ ] Publish latest `firestore.rules` in Firebase Console
- [ ] Do one real test subscription, then refund it
- [ ] Monetag: set popunder frequency cap (~1 per 12–24h); delete unused zones; add `ads.txt` line if prompted
- [ ] Optional: remove the tracked `covers/` folder from git once R2 is confirmed to hold every cover
