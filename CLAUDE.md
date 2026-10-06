# Portal Music — notes for Claude

Read README.md first for the architecture. Key rules:

- **Ads**: the code lives only in `js/app.js` (`loadAds`); the settings (on/off, zone, all pages vs
  download page only, hours between ads, first-ad delay) live in `data/ads.json`, edited in the admin
  studio's 💰 Ads tab. Never add ad snippets to individual pages. **Ads are currently ON for the
  download page only, on every download** (`gapHours: 0`, owner's choice); leaving a page with an ad does a full page load so the ad script
  doesn't follow the visitor around the site. Never on `upgrade.html` / `pro.html` or for Pro members.
- **Pro status** can only be set server-side: the admin studio / Stripe Worker (service account)
  or by redeeming a single-use code (enforced in `firestore.rules`). Never add client code that
  writes `isPro` or other fields listed in `proFields()` in `firestore.rules`.
- If you change `firestore.rules`, the owner must paste it into Firebase Console → Firestore → Rules.
- If you change `workers/stripe-pro/worker.js`, the owner must re-paste it into the Cloudflare
  Worker `portal-music-webhook`.
- Audio and covers live on Cloudflare R2 (`assets.portal-music.com`); `music/` and `covers/` are
  gitignored locally.
- After catalog changes run `npm run seo`.
- **Usage events**: `pmTrack(name, {track, v})` in `js/app.js` writes anonymous events to Firestore `events`
  (create-only, validated in `firestore.rules`); the admin studio's 📊 Stats tab reads them (`admin/stats.js`).
  A new event name must be added to both `PM_EVENT_NAMES` and the list in `firestore.rules`.
- **Stream overlay**: `overlay.html` is an OBS/Streamlabs Browser Source (plays a free radio station and shows a
  "Now playing · portal-music.com" card); streamers build their link in the box on `radio.html`. Its station
  filters must stay in sync with the free stations in `radio.html`. No ads ever run on it.
- **AI tags + "Search a sound"**: `data/tags.json` is the tag dictionary (facets, search synonyms, AudioSet
  labels for Model A, CLAP prompts for Model B). `admin/analyze/analyze.py` (owner's PC, Python venv) saves raw
  scores to `admin/analysis/<id>.json`; `admin/tagging.js` calibrates Model B to Model A per tag (prevalence
  matching), publishes a tag only when two sources agree, keeps one-model hits as hidden `hints`, settles
  vocals/energy/tempo itself and only queues true conflicts for review (owner review wins), and writes `labels`/`bpm`/`key`/`durationSec` into `data/music.json` + `data/similar.json`.
  `js/search.js` turns typed requests into tags on the browse page. Track pages and `use/<tag>.html` are built
  from the tags by `npm run seo`. Tests: `npm test`. Never publish `--mock` analyses.
- `admin/` runs locally only (127.0.0.1 + per-launch token) and is never deployed.

## Owner to-do list
Keep `TODO.md` up to date: add anything the owner must do in a dashboard or decide,
and move finished items to its Done section.
