# Portal Music — Development Checklist

Active branch: `claude/finish-remaining-tasks-g6Imc`

---

## Part 1 — Cloudflare R2 Migration (CODE DONE ✅ — Awaiting manual setup)

Move music/ (1.8 GB) and covers/ from git to Cloudflare R2 CDN (zero egress, 10 GB free).

### Manual Steps (you do these once):

- [ ] **1. Create R2 bucket**
  - cloudflare.com → R2 → Create bucket: `portal-music-assets`
  - Bucket Settings → Enable Public Access
  - (Optional) Cloudflare DNS → CNAME `assets` → your R2 public URL
    → gives `https://assets.portal-music.com/...`

- [ ] **2. Get R2 credentials**
  - Cloudflare Dashboard → My Profile → API Tokens → Create Token → R2 Read+Write
  - Save: `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

- [ ] **3. Bulk upload existing files** (run once on your machine)
  ```bash
  pip install awscli
  aws configure --profile r2
  # key: R2_ACCESS_KEY_ID, secret: R2_SECRET_ACCESS_KEY, region: auto

  ACCOUNT_ID=your_account_id
  aws s3 sync music/ s3://portal-music-assets/music/ \
    --profile r2 \
    --endpoint-url "https://${ACCOUNT_ID}.r2.cloudflarestorage.com" \
    --content-type "audio/mpeg" \
    --metadata "Content-Disposition=attachment"

  aws s3 sync covers/ s3://portal-music-assets/covers/ \
    --profile r2 \
    --endpoint-url "https://${ACCOUNT_ID}.r2.cloudflarestorage.com"
  ```

- [ ] **4. Migrate music.json paths** (run once after upload)
  ```bash
  R2_BASE_URL=https://assets.portal-music.com node scripts/migrate-to-r2.js
  # Verify a few entries in data/music.json look correct
  ```

- [ ] **5. Remove music/covers from git**
  ```bash
  echo "music/" >> .gitignore
  echo "covers/" >> .gitignore
  git rm -r --cached music/ covers/
  git add .gitignore data/music.json
  git commit -m "Migrate audio/covers to Cloudflare R2"
  git push
  ```

- [ ] **6. Add GitHub repo secrets** (Settings → Secrets → Actions)
  - `CLOUDFLARE_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`

### What's already done (code):
- [x] `scripts/migrate-to-r2.js` created
- [x] `scripts/update-catalog.js` — supports `R2_BASE_URL` env var for new entries
- [x] `.github/workflows/update-catalog.yml` — uploads to R2, strips music/covers from git

---

## Part 2 — Google Auth + Persistent Favorites (CODE DONE ✅ — Awaiting Firebase config)

Sign in with Google → favorites stored in Firestore across sessions and devices.

### Manual Steps (you do these once):

- [ ] **1. Create Firebase project**
  - console.firebase.google.com → Add project → name: `portal-music`

- [ ] **2. Enable Google Sign-In**
  - Authentication → Sign-in method → Google → Enable → add your support email → Save

- [ ] **3. Create Firestore database**
  - Firestore Database → Create → Start in production mode → choose `us-east1` → Done

- [ ] **4. Set Firestore security rules**
  - Firestore → Rules tab → replace with:
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /users/{uid} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
  ```
  → Publish

- [ ] **5. Register web app and get config**
  - Project Settings → Your apps → </> Web → Register app → copy `firebaseConfig`

- [ ] **6. Authorize your domain**
  - Authentication → Settings → Authorized domains → Add: `portal-music.com`

- [ ] **7. Paste config into js/firebase-auth.js**
  - Open `js/firebase-auth.js` → replace the 6 `REPLACE_WITH_YOUR_*` values
  - Commit and push

### What's already done (code):
- [x] `js/firebase-auth.js` created (with placeholder config guard — site works fine until filled in)
- [x] `js/app.js` — `toggleFavorite()` calls `window._fbSaveFavorites()` after each toggle
- [x] `js/app.js` — `initHeaderElements()` calls `window._renderAuthBtn()` after SPA navigation
- [x] All HTML pages — `<script type="module" src="js/firebase-auth.js"></script>` added
- [x] All HTML pages — `<button id="auth-btn" class="auth-btn">Sign in</button>` in header
- [x] `css/styles.css` — `.auth-btn` styles added

---

## Part 3 — Replace AdSense with Media.net (CODE DONE ✅ — Awaiting ad network approval)

AdSense has been non-functional. Ad slots are now empty placeholders.

### Why AdSense might not be working:
- Account status may still show "Getting ready" or "Needs attention" in AdSense → Sites
- Music download sites sometimes hit policy review delays
- Easiest fix: check AdSense dashboard → Sites → confirm `portal-music.com` is "Ready"

### Switch to Media.net (recommended):

- [ ] **1. Apply** at media.net → Sites → Add site: `portal-music.com`
- [ ] **2. Get your site ID and ad tag snippets** from the Media.net dashboard
- [ ] **3. Add Media.net script to `<head>`** of `index.html`, `browse.html`, etc.:
  ```html
  <script>window._mNHandle = window._mNHandle || {}; window._mNHandle.queue = window._mNHandle.queue || [];</script>
  <script async src="//contextual.media.net/dmedianet.js?cid=YOUR_SITE_ID"></script>
  ```
- [ ] **4. Replace `<!-- Ad network code goes here -->` comments** inside each `.ad-slot` div
  with the Media.net `<div id="...">` tag + push script that Media.net provides

### Fallback: PropellerAds
If Media.net rejects the site: propellerads.com → near-instant approval for music/entertainment sites.

### What's already done (code):
- [x] All HTML pages — AdSense `<ins>` blocks removed, `.ad-slot` divs left as clean placeholders
- [x] AdSense loader scripts removed from all `<head>` tags
- [x] Cookie banner text updated (no longer mentions "Google AdSense" specifically)
- [x] `css/styles.css` — `.side-ad:empty` collapses properly when no ads loaded

---

## Verification Checklist

- [ ] Play a track after R2 migration — audio streams from CDN URL
- [ ] Sign in with Google → close tab → reopen → favorites still show
- [ ] Firestore console shows `users/{uid}` document with `favorites` array
- [ ] Ad slots collapse cleanly (no empty white boxes) until ad network is set up
- [ ] `auth-btn` shows username when signed in, "Sign in" when not
- [ ] SPA navigation (clicking nav links) keeps auth button state correct
