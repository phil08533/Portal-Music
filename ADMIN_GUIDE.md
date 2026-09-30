# Portal Music — Admin & Upload Studio Guide

Welcome to your new **Portal Music Studio**! You no longer need to manually edit 5,600-line JSON files or memorize complex command line strings.

---

## 🚀 How to Launch the Admin Studio

In your terminal, navigate to your Portal-Music folder and run:

```bash
npm run admin
```

Then open your browser to:
👉 **[http://localhost:3030](http://localhost:3030)**

---

## 🎧 1. Uploading New Tracks

1. Open the **Upload & Add Track** tab.
2. **Drag & Drop your MP3 file** into the audio zone:
   - The studio automatically reads the MP3's ID3 tags (Title, Artist, Genre, and embedded cover image).
3. **Verify or adjust metadata**:
   - **Title**: Song title.
   - **Artist**: Select an existing artist (e.g. *Dem Bois*, *Avilyn Grace*, *Whiskey Pines*) or type a new one.
   - **Genre**: Choose from your 13 canonical genres (*Rock, Electronic, Cinematic, Hip-Hop, Pop, Country & Folk, etc.*).
   - **Subgenre**: Pick a subgenre or enter a custom style.
   - **Tags**: Comma-separated vibes (e.g. *upbeat, vlog, gaming*).
   - **New Release**: Check this box if you want this track highlighted in the "New Releases" shelf on the homepage.
4. **Cover Art**:
   - If your MP3 has embedded cover art, it loads automatically!
   - You can also drag & drop any `.jpg` or `.png` to set a custom cover.
5. Click **"✨ Add to Music Catalog"**:
   - The audio file is saved into the correct genre folder (`music/<Genre>/`).
   - The cover art is saved into `covers/<track-id>.jpg`.
   - `data/music.json` is updated instantly.
   - All SEO pages (`genres/*.html`, `tracks/*.html`, and `sitemap-tracks.xml`) are automatically regenerated in the background.

---

## 📚 2. Managing & Organizing Existing Music

1. Open the **Manage Catalog** tab.
2. **Instant Search & Filter**:
   - Search 470+ tracks by title, artist, or style.
   - Filter by genre dropdown.
3. **Audio Previews**:
   - Click **▶ Play** next to any track to preview its audio directly in the dashboard.
4. **Editing Track Details**:
   - Click **✏️ Edit** on any song to change its title, artist, genre, subgenre, or tags without touching code.
   - Click **Save Changes**. This updates `data/music.json` on your computer only — to put it on the
     live site, run **Actions & Sync → Run SEO Rebuild**, then push (step 3 on that tab).
5. **Deleting Tracks**:
   - Click **🗑️** to safely remove a track from the catalog.

---

## 👥 3. Managing User Accounts & Pro Members

### One-time setup (about 2 minutes)
1. Open **Firebase Console → Project Settings → Service accounts**
   (https://console.firebase.google.com/project/portal-music-3b1a1/settings/serviceaccounts/adminsdk)
2. Click **Generate new private key → Generate key**.
3. Rename the downloaded file to `serviceAccountKey.json` and move it into the `admin/` folder.
4. Run `npm install` (first time only), then `npm run admin`. The terminal prints
   `👥 User accounts: connected to Firebase project "portal-music-3b1a1"`.

> ⚠️ This key is a master password for your whole Firebase project. It is gitignored — never
> email it, paste it in chat, or upload it anywhere. If it ever leaks, delete it on that same
> Firebase page and generate a new one.

### What you can do in the **Users & Pro** tab
- **Stats**: total accounts, Pro members, new sign-ups (30 days), active users (7 days).
- **Grant Pro by email**: someone paid via Venmo/Cash App/PayPal? Type their Google email → **Grant Pro**.
  (They must have signed in on the site at least once.)
- **Pro switch**: flip Pro on/off for any user.
- **Details**: see their playlists and keep a private note (e.g. "Paid $5 Venmo 9/29").
- **🎟️ Pro codes**: generate single-use codes (for giveaways or people who paid another way).
  Use the **− / +** picker to choose how many months of Pro each code gives (0 = lifetime,
  a month = 30 days). Copy the code or its redeem link; each code works once and shows who used it.
- **Grant Pro by email** has the same months picker (0 = lifetime).
- **Details → Pro access**: see when a member's Pro ends, and **− 1 month / + 1 month / Make lifetime**.
  Pro that runs out turns off by itself (shown as "Expired" in red). Stripe subscribers are
  managed by Stripe, so these buttons don't apply to them.
- **Suspend / Restore**: blocks sign-in and signs them out everywhere.
- **🗑️ Delete**: permanently removes their account, favorites and playlists (type `DELETE` to confirm).
- **⬇ CSV**: export the current (filtered) user list.

### Is the admin studio safe with GitHub Pages?
Yes. The studio only runs on your own computer:
- The Pages deploy workflow strips `admin/`, `scripts/` and internal docs, so nothing admin-related is on portal-music.com.
- The server only listens on `127.0.0.1` (not reachable from other devices, even on your Wi-Fi).
- Every API call needs a random token that changes each time you start the studio, so other websites
  open in your browser can't talk to it.

---

## 🎬 4. Making Reels & YouTube videos

1. Open the **Reels & Videos** tab (or click 🎬 next to any track in **Manage Catalog**).
2. Type the track name, play it, and when you hear the best part click **⏱ Now**.
3. Pick a length (15–30 s for Reels/TikTok, or "Whole track" for YouTube) and a format:
   - **Vertical 9:16**: Instagram/Facebook Reels, TikTok, YouTube Shorts
   - **Landscape 16:9**: a regular YouTube video
4. Click **🎬 Make video**. A few seconds later you can preview it, **Download MP4**, and
   **Copy caption** (with hashtags that fit the genre).

Videos are also saved in `social/reels/` (not uploaded to GitHub). The first time, run
`npm install` so the bundled video engine (ffmpeg) is downloaded; there's nothing else to install.

---

## ☁️ 5. Syncing to Cloudflare R2 & Deploying Live

When you add new MP3 files locally and want them live on your CDN:

1. Open the **Actions & Sync** tab in the Admin Studio.
2. Click **📋 Copy Sync Commands** or run:
   ```bash
   aws s3 sync music/ s3://portal-music-assets/music/ --endpoint-url "https://5d2f9b493e0a8358e1b201bd9834c99d.r2.cloudflarestorage.com" --exclude "*.wav" --content-type "audio/mpeg"
   aws s3 sync music/ s3://portal-music-assets/music/ --endpoint-url "https://5d2f9b493e0a8358e1b201bd9834c99d.r2.cloudflarestorage.com" --exclude "*" --include "*.wav" --content-type "audio/wav"
   aws s3 sync covers/ s3://portal-music-assets/covers/ --endpoint-url "https://5d2f9b493e0a8358e1b201bd9834c99d.r2.cloudflarestorage.com"
   ```
3. Commit and push your catalog changes:
   ```bash
   git add data/ tracks/ genres/ sitemap-tracks.xml
   git commit -m "Add new tracks"
   git push
   ```
   GitHub Pages will automatically deploy your live site!

## Homepage sections

- **Featured Tracks:** tracks you pin (⭐, "Pin to Featured Tracks" in Edit) always show first; the rest
  of the row is a fresh random pick every day, so the homepage changes on its own.
- **New Releases:** fills itself. Uploads with "Show in New Releases" ticked (on by default) appear
  there for 45 days, newest first. Tick/untick it in Edit to add or remove a track by hand.
- **Spotlight:** Manage Catalog → 🌟 Homepage Spotlight. Give it a title ("🍂 Fall Hits"), tick
  "Show the Spotlight", and click 🌟 next to any track to add it. Untick to hide it.

All three are catalog changes: run the SEO rebuild and push to publish.

## Adding a song from Suno

1. Upload & Add Track → paste the song's Suno link (Share → Copy link) → **Get song**.
   Title, style tags, genre (best guess), length, artist and cover fill in; check them.
2. Suno locks its files (since Sept 2026), so get the audio with Suno's own button, which also keeps
   your commercial rights: click **open this song in Suno ↗** → ⋯ → Download → **MP3** (and **WAV** if
   you want to offer one). Drop the MP3 in the MP3 box and the WAV in the WAV box. The details stay.
   (If Suno ever serves the file openly, **Add** grabs it by itself.)
3. **Add to Music Catalog**, then R2 sync (uploads the MP3/WAV), SEO rebuild, push.

To add or remove a WAV on any track later: Manage Catalog → Edit → WAV download.
