# Portal Music

Free AI-generated music for creators. Hosted on GitHub Pages at [portal-music.com](https://portal-music.com).

---

## Adding Music

### Step 1 — Drop the audio file
Place your `.mp3` in the correct genre subfolder:

```
music/
  hip-hop/       Hip-Hop
  electronic/    Electronic
  cinematic/     Cinematic
  lo-fi/         Lo-Fi
  rb-soul/       R&B / Soul
  pop/           Pop
  ambient/       Ambient
  acoustic/      Acoustic
```

### Step 2 — Add an entry to `data/music.json`

```json
{
  "id": "unique-id",
  "title": "Track Title",
  "artist": "Artist Name",
  "genre": "Hip-Hop",
  "subgenre": "Trap",
  "tags": ["dark", "heavy", "808", "bass"],
  "file": "music/hip-hop/track-filename.mp3",
  "duration": "3:24",
  "featured": false
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | Yes | Any unique string |
| `title` | Yes | Display name |
| `artist` | — | Leave `null` if unattributed |
| `genre` | Yes | Must match a GENRES key in `js/app.js` |
| `subgenre` | Yes | Shown as a filter chip on the Browse page |
| `tags` | Yes | 3-6 mood/feel/instrument words |
| `file` | Yes | Relative path from the repo root |
| `duration` | — | "M:SS" format |
| `featured` | — | `true` to show on homepage Featured section |

### Auto-Update via GitHub Actions

Push audio files to `music/` on `main` and `.github/workflows/update-catalog.yml` automatically adds skeleton entries to `data/music.json`. You still need to fill in `subgenre`, `tags`, etc. manually.

Run locally:
```bash
node scripts/update-catalog.js
```

---

## Adding a Featured Artist Image

Drop the photo at `images/artists/artist-name.jpg`, then in `data/artists.json` set:
```json
"hasImage": true,
"image": "images/artists/artist-name.jpg"
```

---

## Ads

Ad slots are marked `<!-- PASTE YOUR AD NETWORK CODE HERE -->` in:

- `index.html` — top and bottom leaderboard
- `browse.html` — mid-page banner
- `search.html` — mid-page banner
- `download.html` — large interstitial (best revenue spot)

---

## Project Structure

```
Portal-Music/
├── index.html            Homepage (search, genres, featured artists, featured tracks)
├── browse.html           Browse by genre/artist + sub-genre filter
├── search.html           Fuzzy search (live, as-you-type)
├── download.html         Download interstitial with ad slot + countdown
├── license.html          License terms
├── css/styles.css        All styles — dark / light / sepia themes
├── js/app.js             Player, fuzzy search, favorites, recently played
├── data/
│   ├── music.json        Track catalog
│   └── artists.json      Featured artists
├── images/artists/       Artist photos
├── music/                Audio files by genre folder
├── scripts/
│   └── update-catalog.js Local catalog scanner
└── .github/workflows/
    └── update-catalog.yml Auto-scan on push
```