#!/usr/bin/env node
/**
 * Portal Music — One-time migration to Cloudflare R2
 *
 * Updates all file/cover paths in data/music.json from relative
 * (e.g. "music/Rock/foo.mp3") to absolute CDN URLs
 * (e.g. "https://assets.portal-music.com/music/Rock/foo.mp3").
 *
 * Run AFTER:
 *   1. Cloudflare R2 bucket is set up and made public
 *   2. All music/ and covers/ files have been uploaded to R2 via aws s3 sync
 *
 * Usage:
 *   R2_BASE_URL=https://assets.portal-music.com node scripts/migrate-to-r2.js
 *
 * Or if using the default R2 public URL:
 *   R2_BASE_URL=https://pub-XXXXX.r2.dev node scripts/migrate-to-r2.js
 */

const fs   = require('fs');
const path = require('path');

const R2_BASE = (process.env.R2_BASE_URL || '').replace(/\/$/, '');
if (!R2_BASE) {
  console.error('ERROR: Set R2_BASE_URL env var before running.');
  console.error('  Example: R2_BASE_URL=https://assets.portal-music.com node scripts/migrate-to-r2.js');
  process.exit(1);
}

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'music.json');
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));

let fileUpdated  = 0;
let coverUpdated = 0;

catalog.forEach(entry => {
  if (entry.file && !entry.file.startsWith('http')) {
    entry.file = R2_BASE + '/' + entry.file;
    fileUpdated++;
  }
  if (entry.cover && !entry.cover.startsWith('http')) {
    entry.cover = R2_BASE + '/' + entry.cover;
    coverUpdated++;
  }
});

fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
console.log(`\u2713 Updated ${fileUpdated} file path(s) and ${coverUpdated} cover path(s) to use R2 CDN.`);
console.log(`  R2 base: ${R2_BASE}`);
console.log('\nNext steps:');
console.log('  1. Verify a few entries in data/music.json look correct');
console.log('  2. Add music/ and covers/ to .gitignore');
console.log('  3. Run: git rm -r --cached music/ covers/');
console.log('  4. Commit and push');
