/**
 * Portal Music — Catalog Generator
 *
 * Scans the music/ folder and rebuilds data/music.json from the actual files.
 *
 * HOW IT WORKS:
 *   - Reads every audio file from music/<genre-folder>/
 *   - New files → added with auto-generated title, genre, and a unique id
 *   - Existing entries (matched by file path) → kept exactly as-is so you
 *     don't lose any edits you made (artist, tags, subgenre, featured, etc.)
 *   - Files that no longer exist on disk → removed from the catalog
 *
 * USAGE:
 *   node scripts/update-catalog.js
 *
 * NAMING CONVENTION (optional but recommended):
 *   Put files in the right genre folder and name them clearly:
 *     music/hip-hop/block-moves.mp3        → title "Block Moves"
 *     music/rb-soul/midnight-drive.mp3     → title "Midnight Drive"
 *   Hyphens and underscores are converted to spaces and title-cased.
 *
 * AFTER RUNNING:
 *   For each new entry, you can optionally fill in:
 *     "artist"    → featured artist name, or leave null
 *     "subgenre"  → e.g. "Trap", "Neo-Soul" (shows as filter chip)
 *     "tags"      → ["dark", "bass", "heavy"] (powers fuzzy search)
 *     "duration"  → "3:24"
 *     "featured"  → true to show on the homepage Featured section
 */

const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const MUSIC_DIR    = path.join(__dirname, '..', 'music');
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'music.json');

const FOLDER_TO_GENRE = {
  'hip-hop':    'Hip-Hop',
  'electronic': 'Electronic',
  'cinematic':  'Cinematic',
  'lo-fi':      'Lo-Fi',
  'rb-soul':    'R&B / Soul',
  'pop':        'Pop',
  'ambient':    'Ambient',
  'acoustic':   'Acoustic'
};

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac']);

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

// ── Load existing catalog (so we can preserve hand-edited fields) ─────────────

let existing = {};
if (fs.existsSync(CATALOG_PATH)) {
  try {
    const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    // Index by file path for fast lookup
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
  const genre      = FOLDER_TO_GENRE[folder] || toTitleCase(folder);
  const folderPath = path.join(MUSIC_DIR, folder);

  const files = fs.readdirSync(folderPath)
    .filter(f => AUDIO_EXTS.has(path.extname(f).toLowerCase()))
    .sort();

  for (const file of files) {
    const filePath = `music/${folder}/${file}`;

    if (existing[filePath]) {
      // File was already in the catalog — keep all existing metadata
      catalog.push(existing[filePath]);
      kept++;
    } else {
      // New file — generate a skeleton entry
      const title = toTitleCase(path.parse(file).name);
      catalog.push({
        id:       uid(),
        title:    title,
        artist:   null,
        genre:    genre,
        subgenre: '',
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

// Count removed (entries that were in catalog but file is gone from disk)
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
