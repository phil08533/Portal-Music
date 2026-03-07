/**
 * Portal Music — Auto Catalog Updater
 *
 * Run this script whenever you add new .mp3 files to the music/ folder.
 * It scans all subdirectories and adds skeleton entries to data/music.json
 * for any tracks not already listed.
 *
 * Usage:
 *   node scripts/update-catalog.js
 *
 * After running, open data/music.json and fill in:
 *   - "title"     → human-readable track name
 *   - "artist"    → leave null if unattributed
 *   - "subgenre"  → pick from the sub-genres listed for that genre (see GENRES below)
 *   - "tags"      → 3–6 descriptive words (mood, feel, instruments)
 *   - "duration"  → "M:SS" format (optional but helpful)
 *   - "featured"  → true to show on the homepage Featured section
 */

const fs   = require('fs');
const path = require('path');

// ── Configuration ─────────────────────────────────────────────────────────────

const MUSIC_DIR    = path.join(__dirname, '..', 'music');
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'music.json');

// Maps folder name → display genre name
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

// Accepted audio extensions
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac']);

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTitleCase(str) {
  return str
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function shortId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Load existing catalog ─────────────────────────────────────────────────────

let catalog = [];
if (fs.existsSync(CATALOG_PATH)) {
  try {
    catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    console.log(`Loaded existing catalog: ${catalog.length} track(s)`);
  } catch (err) {
    console.warn('Warning: Could not parse existing catalog. Starting fresh.');
    catalog = [];
  }
}

const existingFiles = new Set(catalog.map(e => e.file));

// ── Scan music/ folder ────────────────────────────────────────────────────────

let added = 0;

if (!fs.existsSync(MUSIC_DIR)) {
  console.error('music/ directory not found. Create it and add subfolders.');
  process.exit(1);
}

const folders = fs.readdirSync(MUSIC_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

for (const folder of folders) {
  const genre      = FOLDER_TO_GENRE[folder] || toTitleCase(folder);
  const folderPath = path.join(MUSIC_DIR, folder);

  const files = fs.readdirSync(folderPath)
    .filter(f => AUDIO_EXTS.has(path.extname(f).toLowerCase()));

  for (const file of files) {
    const relativePath = `music/${folder}/${file}`;
    if (existingFiles.has(relativePath)) continue;  // already in catalog

    const nameNoExt = path.parse(file).name;
    const title     = toTitleCase(nameNoExt);

    catalog.push({
      id:       shortId(),
      title:    title,
      artist:   null,          // ← fill in if attributed to an artist
      genre:    genre,
      subgenre: '',            // ← fill in sub-genre (see js/app.js GENRES)
      tags:     [],            // ← add 3–6 descriptive tags
      file:     relativePath,
      duration: '',            // ← add "M:SS" duration (optional)
      featured: false          // ← set true to appear on homepage
    });

    existingFiles.add(relativePath);
    added++;
    console.log(`  ✅ Added: ${relativePath}`);
  }
}

// ── Write updated catalog ─────────────────────────────────────────────────────

fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true });
fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');

console.log(`\nDone. ${added} new track(s) added. Total in catalog: ${catalog.length}`);
if (added > 0) {
  console.log('\n👉 Open data/music.json and fill in the empty fields for each new entry.');
}
