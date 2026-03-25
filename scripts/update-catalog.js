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

const fs     = require('fs');
const path   = require('path');
const NodeID3 = require('node-id3');

// ── Config ────────────────────────────────────────────────────────────────────

const MUSIC_DIR    = path.join(__dirname, '..', 'music');
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'music.json');
const COVERS_DIR   = path.join(__dirname, '..', 'covers');
const GENRES_PATH  = path.join(__dirname, '..', 'data', 'genres.json');

// Load genre/folder mappings from the shared genres.json (single source of truth)
let _genreData = {};
try {
  _genreData = JSON.parse(fs.readFileSync(GENRES_PATH, 'utf8'));
} catch {
  console.warn('WARNING: Could not load data/genres.json — using empty mappings.');
}

const FOLDER_TO_PARENT   = _genreData.folderToGenre      || {};
const SUBGENRE_NORMALIZE = _genreData.subgenreNormalize   || {};
const ARTIST_FOLDERS     = _genreData.artistFolders       || [];

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac']);
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

// No folders are skipped — all subfolders under music/ are scanned
const SKIP_FOLDERS = new Set();

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

/**
 * Extract embedded cover art from an MP3's ID3 tag and save it to covers/.
 * Returns the relative cover path (e.g. "covers/abc123.jpg"), or null if none.
 */
function extractCoverFromMp3(absFilePath, songId) {
  try {
    const tags = NodeID3.read(absFilePath);
    const img  = tags && tags.image;
    if (!img || !img.imageBuffer) return null;
    const ext  = img.mime === 'image/png' ? '.png' : '.jpg';
    const dest = path.join(COVERS_DIR, songId + ext);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(COVERS_DIR, { recursive: true });
      fs.writeFileSync(dest, img.imageBuffer);
    }
    return 'covers/' + songId + ext;
  } catch {
    return null;
  }
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
  const subgenre = SUBGENRE_NORMALIZE[folder] || folder;

  // Scan files in this folder
  const files = scanDir(folderPath);
  for (const file of files) {
    const filePath = `music/${folder}/${file}`;
    const baseName = path.parse(file).name;

    if (existing[filePath]) {
      const entry = Object.assign({}, existing[filePath]);
      // Repair: fill in missing genre/subgenre without overwriting manual edits,
      // and always normalize subgenre display names (e.g. 'Hiphop' → 'Hip-Hop').
      if (!entry.genre)    entry.genre    = genre;
      if (!entry.subgenre) entry.subgenre = subgenre;
      entry.subgenre = SUBGENRE_NORMALIZE[entry.subgenre] ?? entry.subgenre;
      // Assign cover from MP3 tag or music folder if not already set
      if (!entry.cover) {
        const absPath = path.join(folderPath, file);
        entry.cover = extractCoverFromMp3(absPath, entry.id);
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
      // Look for cover in MP3 tag first, then music folder
      const absPath = path.join(folderPath, file);
      newEntry.cover = extractCoverFromMp3(absPath, id);
      if (!newEntry.cover) {
        const imgSrc = findImageInDir(folderPath, baseName);
        if (imgSrc) {
          const cacheKey = imgSrc;
          if (!folderCoverCache[cacheKey]) {
            folderCoverCache[cacheKey] = importCover(imgSrc, id);
          }
          newEntry.cover = folderCoverCache[cacheKey];
        }
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
        // Assign cover from MP3 tag or music folder if not already set
        if (!entry.cover) {
          const absPath = path.join(subPath, file);
          entry.cover = extractCoverFromMp3(absPath, entry.id);
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
          // For artist subfolders, use the artist name as subgenre (keeps chip filter working).
          // For genre subfolders, use the subfolder name (it's a new album/subgenre).
          subgenre: isArtist ? folder : subdir,
          tags:     [],
          file:     filePath,
          duration: '',
          featured: false
        };
        const absPath = path.join(subPath, file);
        newEntry.cover = extractCoverFromMp3(absPath, id);
        if (!newEntry.cover) {
          const imgSrc = findImageInDir(subPath, baseName) || findImageInDir(folderPath, baseName);
          if (imgSrc) {
            const cacheKey = imgSrc;
            if (!folderCoverCache[cacheKey]) {
              folderCoverCache[cacheKey] = importCover(imgSrc, id);
            }
            newEntry.cover = folderCoverCache[cacheKey];
          }
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

// ── Write catalog ─────────────────────────────────────────────────────────────

fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true });
fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');

// ── Write ID3 metadata to MP3 files ──────────────────────────────────────────
//
// Sets: title, artist, copyright, comment (website + usage note), and clears
// encoder/encoded-by so no Suno markers remain.
//
// Only MP3 files are touched (node-id3 handles ID3 tags only).

const SITE_URL   = 'https://portal-music.com';
const CONTACT    = 'creatitproductions@gmail.com';
const COPYRIGHT  = `\u00a9 ${new Date().getFullYear()} Portal Music. Free for public use.`;
const COMMENT    = `Free for YouTube, TikTok, and more. No attribution required. ${SITE_URL}`;

console.log('\nWriting ID3 metadata to MP3 files…');
let metaUpdated = 0;
let metaSkipped = 0;

for (const entry of catalog) {
  if (!entry.file.endsWith('.mp3')) { metaSkipped++; continue; }

  const absPath = path.join(__dirname, '..', entry.file);
  if (!fs.existsSync(absPath)) continue;

  const artistName = entry.artist || 'Portal Music';

  const tags = {
    title:      entry.title  || '',
    artist:     artistName,
    album:      entry.genre  || 'Portal Music',
    copyright:  COPYRIGHT,
    comment:    { language: 'eng', text: COMMENT },
    encodedBy:  '',        // clear any Suno encoder marker
    fileOwner:  'Portal Music',
    userDefinedUrl: [{ description: 'Website', url: SITE_URL }],
  };

  const result = NodeID3.write(tags, absPath);
  if (result === true) {
    metaUpdated++;
  } else {
    console.warn(`  ⚠  Could not write tags to ${entry.file}`);
  }
}

console.log(`  ✓  ${metaUpdated} MP3(s) updated  |  ${metaSkipped} non-MP3(s) skipped`);

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
  console.log(`Tip: ${stillMissing} track(s) still have no cover.`);
  console.log('     Embed cover art in the MP3 file\'s ID3 tag, or place an image in the');
  console.log('     music folder (e.g. music/Cinematic/cover.jpg), then re-run this script.');
}

// ── Generate license PDF ──────────────────────────────────────────────────────
console.log('\nGenerating license PDF…');
const { generate: generatePdf } = require('./generate-license-pdf');
generatePdf().catch(err => console.warn('  ⚠  PDF generation failed:', err.message));
