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
 * USAGE:
 *   node scripts/update-catalog.js
 */

const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const MUSIC_DIR    = path.join(__dirname, '..', 'music');
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'music.json');

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
  'melancholy':     'Playful & Mood'
};

// Artist folders (not genre folders)
const ARTIST_FOLDERS = ['Avilyn Grace', 'Dem Bois'];

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac']);

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

for (const folder of folders) {
  if (SKIP_FOLDERS.has(folder)) continue;

  const folderPath = path.join(MUSIC_DIR, folder);
  const isArtist = ARTIST_FOLDERS.includes(folder);

  // Determine genre and subgenre
  let genre, subgenre;
  if (isArtist) {
    genre = null; // Will be set per-track if existing, or left for manual edit
    subgenre = '';
  } else {
    genre = FOLDER_TO_PARENT[folder] || folder;
    subgenre = folder; // The folder name IS the subgenre
  }

  // Scan files in this folder
  const files = scanDir(folderPath);
  for (const file of files) {
    const filePath = `music/${folder}/${file}`;

    if (existing[filePath]) {
      catalog.push(existing[filePath]);
      kept++;
    } else {
      const title = toTitleCase(path.parse(file).name);
      catalog.push({
        id:       uid(),
        title:    title,
        artist:   isArtist ? folder : null,
        genre:    genre || '',
        subgenre: subgenre,
        tags:     [],
        file:     filePath,
        duration: '',
        featured: false
      });
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

      if (existing[filePath]) {
        catalog.push(existing[filePath]);
        kept++;
      } else {
        const title = toTitleCase(path.parse(file).name);
        catalog.push({
          id:       uid(),
          title:    title,
          artist:   isArtist ? folder : null,
          genre:    genre || '',
          subgenre: subdir,
          tags:     [],
          file:     filePath,
          duration: '',
          featured: false
        });
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

// ── Write ─────────────────────────────────────────────────────────────────────

fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true });
fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');

console.log(`
Done.
  ${added}   new track(s) added
  ${kept}   existing track(s) kept (metadata preserved)
  ${removed}   stale entry(s) removed
  ${catalog.length}   total tracks in catalog
`);

if (added > 0) {
  console.log('Tip: For each new entry you can optionally fill in subgenre, tags, artist, and featured.');
}
