# Portal Music — notes for Claude

Read README.md first for the architecture. Key rules:

- **Ads** are configured only in `js/app.js` (`ADS_ENABLED`, `AD_ZONES`, `loadAds`). Never add ad snippets to
  individual pages. **Ads are currently OFF** (`ADS_ENABLED = false`, owner's choice). When on, the setup is (from Monetag stats): Glad popunder zone `10786944` on all
  content pages, armed at most once per 12 h per visitor and never on a visitor's first page
  (after 30 s or on the 2nd page view); none on `upgrade.html` / `pro.html` or for Pro members.
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
