#!/usr/bin/env node
/**
 * Portal Music — Feature 4 Random Tracks
 *
 * Randomly selects 4 tracks and sets featured: true
 * (or unfeatured ones if specified with --unfeatured)
 *
 * Usage:
 *   node scripts/feature-random.js           # feature 4 random
 *   node scripts/feature-random.js 8         # feature 8 random
 *   node scripts/feature-random.js --unfeature 4  # unfeature 4 random
 */

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'music.json');
const count = parseInt(process.argv[2]) || 4;
const unfeature = process.argv.includes('--unfeature');

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));

// Get tracks to modify
const targetTracks = unfeature
  ? catalog.filter(t => t.featured)
  : catalog.filter(t => !t.featured);

if (targetTracks.length === 0) {
  console.log('No ' + (unfeature ? 'featured' : 'unfeatured') + ' tracks to modify.');
  process.exit(0);
}

// Shuffle and pick count
for (let i = targetTracks.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [targetTracks[i], targetTracks[j]] = [targetTracks[j], targetTracks[i]];
}

const selected = targetTracks.slice(0, Math.min(count, targetTracks.length));

// Update them
selected.forEach(track => {
  track.featured = !unfeature;
});

fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');

console.log(`✓ ${unfeature ? 'Unfeatured' : 'Featured'} ${selected.length} track(s):`);
selected.forEach(t => console.log(`  • ${t.title} — ${t.artist || 'Portal Music'}`));
