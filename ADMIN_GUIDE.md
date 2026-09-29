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
   - Click **Save Changes** and the catalog updates immediately.
5. **Deleting Tracks**:
   - Click **🗑️** to safely remove a track from the catalog.

---

## ☁️ 3. Syncing to Cloudflare R2 & Deploying Live

When you add new MP3 files locally and want them live on your CDN:

1. Open the **Actions & Sync** tab in the Admin Studio.
2. Click **📋 Copy Sync Commands** or run:
   ```bash
   aws s3 sync music/ s3://portal-music-assets/music/ --endpoint-url "https://5d2f9b493e0a8358e1b201bd9834c99d.r2.cloudflarestorage.com" --content-type "audio/mpeg"
   aws s3 sync covers/ s3://portal-music-assets/covers/ --endpoint-url "https://5d2f9b493e0a8358e1b201bd9834c99d.r2.cloudflarestorage.com"
   ```
3. Commit and push your catalog changes:
   ```bash
   git add data/ tracks/ genres/ sitemap-tracks.xml
   git commit -m "Add new tracks"
   git push
   ```
   GitHub Pages will automatically deploy your live site!
