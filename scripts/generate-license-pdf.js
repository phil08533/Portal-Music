/**
 * Portal Music — License Sheet PDF Generator
 *
 * Generates downloads/portal-music-license.pdf
 * This file is committed to the repo so users can download it directly.
 *
 * USAGE (standalone):
 *   node scripts/generate-license-pdf.js
 *
 * Also called automatically by update-catalog.js.
 */

'use strict';

const PDFDocument = require('pdfkit');
const fs          = require('fs');
const path        = require('path');

const OUT_DIR  = path.join(__dirname, '..', 'downloads');
const OUT_FILE = path.join(OUT_DIR, 'portal-music-license.pdf');

function generate() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const doc = new PDFDocument({ margin: 60, size: 'LETTER' });
  const stream = fs.createWriteStream(OUT_FILE);
  doc.pipe(stream);

  const BRAND   = '#7c5cbf';   // purple accent matching site theme
  const BLACK   = '#111111';
  const GRAY    = '#555555';
  const LGRAY   = '#dddddd';
  const YEAR    = new Date().getFullYear();

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 80).fill(BRAND);

  doc.fillColor('white')
     .fontSize(26).font('Helvetica-Bold')
     .text('Portal Music', 60, 22);

  doc.fontSize(11).font('Helvetica')
     .text('Free Music License Sheet', 60, 54);

  doc.fillColor(BLACK);

  // ── Subheader ───────────────────────────────────────────────────────────────
  let y = 100;

  doc.fontSize(9).fillColor(GRAY).font('Helvetica')
     .text(`© ${YEAR} Portal Music  •  portal-music.com  •  creatitproductions@gmail.com`, 60, y, { align: 'center' });

  doc.moveTo(60, y + 16).lineTo(doc.page.width - 60, y + 16).strokeColor(LGRAY).stroke();
  y += 30;

  // ── Core promise ────────────────────────────────────────────────────────────
  doc.fontSize(14).font('Helvetica-Bold').fillColor(BRAND)
     .text('We Will NEVER Copyright Strike Your Content', 60, y);
  y += 20;

  doc.fontSize(10).font('Helvetica').fillColor(BLACK)
     .text(
       'This is our core promise. All music on Portal Music is permanently free for content creators. ' +
       'We will never file a Content ID claim, issue a copyright strike, or submit a takedown request ' +
       'on any platform — not now, not ever.',
       60, y, { width: doc.page.width - 120, align: 'left' }
     );
  y += 50;

  // ── Section helper ──────────────────────────────────────────────────────────
  function section(title, items) {
    doc.fontSize(12).font('Helvetica-Bold').fillColor(BRAND).text(title, 60, y);
    y += 18;
    for (const item of items) {
      doc.fontSize(10).font('Helvetica').fillColor(BLACK)
         .text(`• ${item}`, 72, y, { width: doc.page.width - 132 });
      y += doc.heightOfString(`• ${item}`, { width: doc.page.width - 132 }) + 4;
    }
    y += 8;
  }

  section('What You CAN Do', [
    'Use in YouTube, Twitch, TikTok, Instagram, and all other social media platforms',
    'Use in podcasts, radio shows, and audio productions',
    'Use in commercial projects — client work, business presentations, corporate videos',
    'Use in advertising — TV ads, online ads, radio ads, promotional content',
    'Use in films, short films, documentaries, and video productions',
    'Use in games, apps, and interactive media',
    'Use in live streams, events, and public performances',
    'Modify, edit, remix, or adapt tracks to fit your content',
    'Monetize your content freely — all ad revenue from your videos is yours',
  ]);

  section('What You CANNOT Do', [
    'Resell or redistribute the raw audio files as standalone music',
    'Claim authorship or copyright ownership over the music itself',
    'Upload to music distribution platforms (Spotify, Apple Music, etc.) as your own original work',
    'Use in projects promoting illegal, hateful, or harmful content',
    'Create a competing music library using our tracks',
  ]);

  section('Attribution', [
    'Attribution is NOT required, but always appreciated.',
    'If you wish to credit us: "Music from Portal Music — portal-music.com"',
  ]);

  // ── AI transparency ─────────────────────────────────────────────────────────
  doc.fontSize(12).font('Helvetica-Bold').fillColor(BRAND).text('AI Transparency', 60, y);
  y += 18;
  doc.fontSize(10).font('Helvetica').fillColor(BLACK)
     .text(
       'Tracks in this library are created with the assistance of AI composition tools ' +
       'and professional production techniques. All music is owned and distributed by Portal Music.',
       60, y, { width: doc.page.width - 120 }
     );
  y += 36;

  // ── Divider + footer ────────────────────────────────────────────────────────
  doc.moveTo(60, y).lineTo(doc.page.width - 60, y).strokeColor(LGRAY).stroke();
  y += 12;

  doc.fontSize(9).fillColor(GRAY).font('Helvetica')
     .text(
       `This license is effective upon download. For licensing questions contact creatitproductions@gmail.com\n` +
       `Portal Music  |  portal-music.com  |  © ${YEAR} Portal Music. All rights reserved.`,
       60, y, { width: doc.page.width - 120, align: 'center' }
     );

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => {
      console.log(`  ✓  License PDF written → downloads/portal-music-license.pdf`);
      resolve();
    });
    stream.on('error', reject);
  });
}

// Allow running standalone
if (require.main === module) {
  generate().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { generate };
