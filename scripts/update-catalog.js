/**
 * Portal Music — Catalog Generator
 *
 * Scans the music/ folder and rebuilds data/music.json from the actual files.
 *
 * HOW IT WORKS:
 *   - Reads every audio file from music/<folder>/ and music/<folder>/<subfolder>/
 *   - New files → added with auto-generated title, genre, and a unique id
 *   - Existing entries (matched by file path) → kept exactly as-is so you
 *     don't lose any edits you made (artist, tags, subgenre, featured, etc.)
 *   - Files that no longer exist on disk → removed from the catalog
 *
 * COVER ART:
 *   1. Looks for covers/<song-id>.<ext> — auto-links if found
 *   2. Looks for a matching image in the music folder:
 *        music/<folder>/<SongTitle>.jpg  (per-song cover)
 *        music/<folder>/cover.jpg        (folder-level fallback)
 *      Matching images are copied to covers/ with the song's ID as the filename.
 *   3. Assigns any remaining orphaned covers (in covers/ not linked to any song)
 *      to songs still missing covers, sorted alphabetically for determinism.
 *
 * USAGE:
 *   node scripts/update-catalog.js
 */

const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const MUSIC_DIR    = path.join(__dirname, '..', 'music');
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'music.json');
const COVERS_DIR   = path.join(__dirname, '..', 'covers');

// Map folder names to their parent genre (matches GENRES in app.js)
const FOLDER_TO_PARENT = {
  'Rock':           'Rock',
  'Hard Rock':      'Rock',
  'Hair Metal':     'Rock',
  'Cinematic Rock': 'Rock',
  'Punk Rock':      'Rock',
  'Calm Jazz':      'Jazz',
  'Fast Jazz':      'Jazz',
  'Hiphop':         'Hip-Hop',
  'Techno-Wave':    'Electronic',
  'Chillhop':       'Electronic',
  'dream-pop':      'Electronic',
  'Cinematic':      'Cinematic',
  'Dramatic':       'Cinematic',
  'Fantasy':        'Cinematic',
  'Space':          'Cinematic',
  'Classical':      'Classical',
  'Romantic':       'Classical',
  'medieval':       'Classical',
  'Country':        'Country & Folk',
  'Bluegrass':      'Country & Folk',
  'Western':        'Country & Folk',
  'Whiskey Pines':  'Country & Folk',
  'Peaceful':       'Ambient & Chill',
  'Meditative':     'Ambient & Chill',
  'Uplifting':      'Ambient & Chill',
  'Horror':         'Dark & Suspense',
  'Suspenseful':    'Dark & Suspense',
  'Unsettling':     'Dark & Suspense',
  'Playful':        'Playful & Mood',
  'Sad':            'Playful & Mood',
  'melancholy':     'Playful & Mood',
  // Artist folders — genre matches app.js GENRES subgenre mappings
  'Avilyn Grace':   'Pop',
  'Dem Bois':       'Pop'
};

// Artist folders — still used to set the artist field on track entries
const ARTIST_FOLDERS = ['Avilyn Grace', 'Dem Bois'];

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac']);
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

// Skip empty placeholder folders
const SKIP_FOLDERS = new Set(['acoustic', 'ambient', 'cinematic', 'electronic', 'hip-hop', 'lo-fi', 'pop', 'rb-soul']);

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTitleCase(str) {
  return str
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function scanDir(dirPath) {
  const files = [];
  if (!fs.existsSync(dirPath)) return files;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && AUDIO_EXTS.has(path.extname(entry.name).toLowerCase())) {
      files.push(entry.name);
    }
  }
  return files.sort();
}

function scanSubDirs(dirPath) {
  const subdirs = [];
  if (!fs.existsSync(dirPath)) return subdirs;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      subdirs.push(entry.name);
    }
  }
  return subdirs;
}

/**
 * Look for a cover image in a directory for a given base name.
 * Checks for an exact-match image (SongTitle.jpg) first, then a folder-level
 * cover (cover.jpg / folder.jpg).
 * Returns the absolute path to the image, or null if none found.
 */
function findImageInDir(dirPath, baseName) {
  // Per-song: exact filename match
  for (const ext of IMAGE_EXTS) {
    const p = path.join(dirPath, baseName + ext);
    if (fs.existsSync(p)) return p;
  }
  // Folder-level fallback
  for (const name of ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp', 'folder.jpg']) {
    const p = path.join(dirPath, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Copy a source image into covers/ named after the song ID.
 * Returns the relative cover path (e.g. "covers/abc123.jpg").
 * Skips the copy if the destination already exists.
 */
function importCover(srcPath, songId) {
  const ext = path.extname(srcPath).toLowerCase();
  const destName = songId + ext;
  const destPath = path.join(COVERS_DIR, destName);
  if (!fs.existsSync(destPath)) {
    fs.mkdirSync(COVERS_DIR, { recursive: true });
    fs.copyFileSync(srcPath, destPath);
  }
  return 'covers/' + destName;
}

// ── Load existing catalog ─────────────────────────────────────────────────────

let existing = {};
if (fs.existsSync(CATALOG_PATH)) {
  try {
    const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    raw.forEach(entry => { existing[entry.file] = entry; });
    console.log(`Loaded ${raw.length} existing catalog entries.`);
  } catch {
    console.warn('Could not parse existing catalog — starting fresh.');
  }
}

// ── Scan music/ folder ────────────────────────────────────────────────────────

if (!fs.existsSync(MUSIC_DIR)) {
  console.error('ERROR: music/ directory not found.');
  process.exit(1);
}

const catalog = [];
let added   = 0;
let kept    = 0;
let removed = 0;

const folders = fs.readdirSync(MUSIC_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort();

// Track folder-level covers so we copy them only once per folder
const folderCoverCache = {}; // absDir → 'covers/xxx.jpg'

for (const folder of folders) {
  if (SKIP_FOLDERS.has(folder)) continue;

  const folderPath = path.join(MUSIC_DIR, folder);
  const isArtist = ARTIST_FOLDERS.includes(folder);

  // Determine genre and subgenre — folder name is always the subgenre;
  // artist folders use the same FOLDER_TO_PARENT lookup as genre folders.
  const genre    = FOLDER_TO_PARENT[folder] || folder;
  const subgenre = folder;

  // Scan files in this folder
  const files = scanDir(folderPath);
  for (const file of files) {
    const filePath = `music/${folder}/${file}`;
    const baseName = path.parse(file).name;

    if (existing[filePath]) {
      const entry = Object.assign({}, existing[filePath]);
      // Repair: fill in missing genre/subgenre without overwriting manual edits
      if (!entry.genre)    entry.genre    = genre;
      if (!entry.subgenre) entry.subgenre = subgenre;
      // Assign cover from music folder if not already set
      if (!entry.cover) {
        const imgSrc = findImageInDir(folderPath, baseName);
        if (imgSrc) {
          const cacheKey = imgSrc;
          if (!folderCoverCache[cacheKey]) {
            folderCoverCache[cacheKey] = importCover(imgSrc, entry.id);
          }
          entry.cover = folderCoverCache[cacheKey];
        }
      }
      catalog.push(entry);
      kept++;
    } else {
      const title = toTitleCase(baseName);
      const id = uid();
      const newEntry = {
        id,
        title,
        artist:   isArtist ? folder : null,
        genre,
        subgenre,
        tags:     [],
        file:     filePath,
        duration: '',
        featured: false
      };
      // Look for cover in the music folder
      const imgSrc = findImageInDir(folderPath, baseName);
      if (imgSrc) {
        const cacheKey = imgSrc;
        if (!folderCoverCache[cacheKey]) {
          folderCoverCache[cacheKey] = importCover(imgSrc, id);
        }
        newEntry.cover = folderCoverCache[cacheKey];
      }
      catalog.push(newEntry);
      console.log(`  + Added:   ${filePath}`);
      added++;
    }
  }

  // Scan subdirectories (e.g., "Newest Release!")
  const subdirs = scanSubDirs(folderPath);
  for (const subdir of subdirs) {
    const subPath = path.join(folderPath, subdir);
    const subFiles = scanDir(subPath);
    for (const file of subFiles) {
      const filePath = `music/${folder}/${subdir}/${file}`;
      const baseName = path.parse(file).name;

      if (existing[filePath]) {
        const entry = Object.assign({}, existing[filePath]);
        // Repair: fill in missing genre without overwriting manual edits
        if (!entry.genre) entry.genre = genre;
        // Assign cover from music folder if not already set
        if (!entry.cover) {
          const imgSrc = findImageInDir(subPath, baseName) || findImageInDir(folderPath, baseName);
          if (imgSrc) {
            const cacheKey = imgSrc;
            if (!folderCoverCache[cacheKey]) {
              folderCoverCache[cacheKey] = importCover(imgSrc, entry.id);
            }
            entry.cover = folderCoverCache[cacheKey];
          }
        }
        catalog.push(entry);
        kept++;
      } else {
        const title = toTitleCase(baseName);
        const id = uid();
        const newEntry = {
          id,
          title,
          artist:   isArtist ? folder : null,
          genre,
          subgenre: subdir,
          tags:     [],
          file:     filePath,
          duration: '',
          featured: false
        };
        const imgSrc = findImageInDir(subPath, baseName) || findImageInDir(folderPath, baseName);
        if (imgSrc) {
          const cacheKey = imgSrc;
          if (!folderCoverCache[cacheKey]) {
            folderCoverCache[cacheKey] = importCover(imgSrc, id);
          }
          newEntry.cover = folderCoverCache[cacheKey];
        }
        catalog.push(newEntry);
        console.log(`  + Added:   ${filePath}`);
        added++;
      }
    }
  }
}

// Count removed
const catalogFiles = new Set(catalog.map(e => e.file));
Object.keys(existing).forEach(f => {
  if (!catalogFiles.has(f)) {
    console.log(`  - Removed: ${f} (file not found on disk)`);
    removed++;
  }
});

// ── Cover art pass 1: link covers/<id>.<ext> if file exists ──────────────────

let coverLinked = 0;
catalog.forEach(entry => {
  if (entry.cover) return;
  for (const ext of IMAGE_EXTS) {
    const coverPath = path.join(COVERS_DIR, entry.id + ext);
    if (fs.existsSync(coverPath)) {
      entry.cover = 'covers/' + entry.id + ext;
      coverLinked++;
      break;
    }
  }
});
if (coverLinked > 0) console.log(`  🖼  Linked ${coverLinked} cover(s) by song ID.`);

// ── Cover art pass 2: assign orphaned covers to songs still without ───────────

const usedCovers = new Set(catalog.filter(s => s.cover).map(s => s.cover));
const orphaned = fs.existsSync(COVERS_DIR)
  ? fs.readdirSync(COVERS_DIR)
      .map(f => 'covers/' + f)
      .filter(c => !usedCovers.has(c))
      .sort()
  : [];

const uncovered = catalog.filter(s => !s.cover);

let assigned = 0;
uncovered.forEach((song, i) => {
  if (i < orphaned.length) {
    song.cover = orphaned[i];
    assigned++;
  }
});
if (assigned > 0) console.log(`  🖼  Assigned ${assigned} orphaned cover(s) to songs without art.`);

// ── Write ─────────────────────────────────────────────────────────────────────

fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true });
fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');

const stillMissing = catalog.filter(s => !s.cover).length;
console.log(`
Done.
  ${added}   new track(s) added
  ${kept}   existing track(s) kept (metadata preserved)
  ${removed}   stale entry(s) removed
  ${catalog.length}   total tracks in catalog
  ${catalog.length - stillMissing} / ${catalog.length}  tracks with cover art
`);

if (added > 0) {
  console.log('Tip: For each new entry you can optionally fill in subgenre, tags, artist, and featured.');
}
if (stillMissing > 0) {
  console.log(`Tip: ${stillMissing} track(s) still have no cover. Add an image to the music folder`);
  console.log('     (e.g. music/Cinematic/cover.jpg) and re-run to assign it.');
}
