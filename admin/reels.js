// ============================================
// Portal Music — Admin Studio: Reel / video maker
// ============================================
//
// Turns a catalog track into a ready-to-post video:
//   vertical  1080×1920  → Instagram/Facebook Reels, TikTok, YouTube Shorts
//   landscape 1920×1080  → regular YouTube upload
//
// Layout (blurred cover background, cover art, title, branding) is drawn with
// sharp; ffmpeg (bundled via ffmpeg-static, nothing to install) adds the
// animated waveform and the audio. Output goes to social/reels/.
// ============================================

const fs    = require('fs');
const os    = require('os');
const path  = require('path');
const https = require('https');
const { execFile } = require('child_process');

const ROOT_DIR  = path.join(__dirname, '..');
const OUT_DIR   = path.join(ROOT_DIR, 'social', 'reels');
const ACCENT    = '#a6ff00';
const BG        = '#080812';

const FORMATS = {
  vertical:  { w: 1080, h: 1920 },
  landscape: { w: 1920, h: 1080 },
};

function loadDeps() {
  let sharp, ffmpegPath;
  try { sharp = require('sharp'); } catch { throw new Error('sharp is not installed. Run: npm install'); }
  try { ffmpegPath = require('ffmpeg-static'); } catch { throw new Error('ffmpeg-static is not installed. Run: npm install'); }
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) throw new Error('ffmpeg binary missing. Run: npm install');
  return { sharp, ffmpegPath };
}

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

function slug(str) {
  return String(str || 'track').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'track';
}

// Split a title into at most `maxLines` lines of roughly `perLine` characters
function wrap(text, perLine, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > perLine && line) { lines.push(line); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '') + '…';
  }
  return lines;
}

function download(url, dest, redirects = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(download(new URL(res.headers.location, url).toString(), dest, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Download failed (${res.statusCode}): ${url}`)); }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(dest)));
      out.on('error', reject);
    }).on('error', reject);
  });
}

// Prefer the local copy (music/, covers/); otherwise fetch from the CDN.
async function localOrDownload(ref, tmpDir, name) {
  if (!ref) return null;
  if (path.isAbsolute(ref) && fs.existsSync(ref)) return ref;
  const rel = ref.replace(/^https:\/\/assets\.portal-music\.com\//, '');
  const local = path.join(ROOT_DIR, decodeURI(rel));
  if (!/^https?:/.test(rel) && fs.existsSync(local)) return local;
  if (/^https?:/.test(ref)) {
    const dest = path.join(tmpDir, name + path.extname(new URL(ref).pathname || '.bin'));
    return download(ref, dest);
  }
  return null;
}

function runFfmpeg(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error('ffmpeg failed: ' + String(stderr).split('\n').slice(-6).join(' ')));
      resolve();
    });
  });
}

async function coverBuffer(sharp, coverPath, size, radius) {
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`);
  let img;
  if (coverPath) {
    img = sharp(coverPath).resize(size, size, { fit: 'cover' });
  } else {
    // No cover: brand gradient tile
    img = sharp(Buffer.from(`<svg width="${size}" height="${size}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${ACCENT}"/><stop offset="1" stop-color="#49b300"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`));
  }
  return img.composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

// Static layer: everything except the waveform. Returns the waveform box too.
async function buildBackground(sharp, track, coverPath, fmt) {
  const { w, h } = FORMATS[fmt];
  const vertical = fmt === 'vertical';

  // Background: blurred, darkened cover (or plain brand colour)
  let base = coverPath
    ? sharp(coverPath).resize(w, h, { fit: 'cover' }).blur(45).modulate({ brightness: 0.35, saturation: 1.1 })
    : sharp({ create: { width: w, height: h, channels: 3, background: BG } });
  base = await base.png().toBuffer();

  const artist = track.artist || track.subgenre || track.genre || '';
  const genre  = track.genre || '';
  const layers = [];
  let svg, wave;

  if (vertical) {
    const coverSize = 820;
    const coverX = (w - coverSize) / 2, coverY = 330;
    layers.push({ input: await coverBuffer(sharp, coverPath, coverSize, 36), left: coverX, top: coverY });
    const titleLines = wrap(track.title, 20, 2);
    const titleY = coverY + coverSize + 130;
    wave = { x: 90, y: titleY + titleLines.length * 76 + 70, w: w - 180, h: 190 };
    svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${BG}" fill-opacity="0.45"/>
      <text x="${w / 2}" y="170" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="800" fill="${ACCENT}" letter-spacing="2">PORTAL MUSIC</text>
      <text x="${w / 2}" y="240" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#e6e9f2">Free music for your videos</text>
      <rect x="${coverX - 3}" y="${coverY - 3}" width="${coverSize + 6}" height="${coverSize + 6}" rx="39" fill="none" stroke="${ACCENT}" stroke-opacity="0.55" stroke-width="3"/>
      ${titleLines.map((l, i) => `<text x="${w / 2}" y="${titleY + i * 76}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="68" font-weight="800" fill="#ffffff">${esc(l)}</text>`).join('')}
      <text x="${w / 2}" y="${titleY + titleLines.length * 76 - 10}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#b7bfd0">${esc(artist)}${genre && genre !== artist ? ' · ' + esc(genre) : ''}</text>
      <rect x="${(w - 560) / 2}" y="${h - 250}" width="560" height="92" rx="46" fill="${ACCENT}"/>
      <text x="${w / 2}" y="${h - 191}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="800" fill="${BG}">portal-music.com</text>
      <text x="${w / 2}" y="${h - 100}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#d7dcea">No copyright strikes · Free download</text>
    </svg>`;
  } else {
    const coverSize = 640;
    const coverX = 150, coverY = (h - coverSize) / 2 - 20;
    layers.push({ input: await coverBuffer(sharp, coverPath, coverSize, 32), left: coverX, top: coverY });
    const tx = coverX + coverSize + 110;
    const titleLines = wrap(track.title, 22, 2);
    wave = { x: tx, y: 640, w: w - tx - 150, h: 160 };
    svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${BG}" fill-opacity="0.45"/>
      <rect x="${coverX - 3}" y="${coverY - 3}" width="${coverSize + 6}" height="${coverSize + 6}" rx="35" fill="none" stroke="${ACCENT}" stroke-opacity="0.55" stroke-width="3"/>
      <text x="${tx}" y="250" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="800" fill="${ACCENT}" letter-spacing="2">PORTAL MUSIC</text>
      ${titleLines.map((l, i) => `<text x="${tx}" y="${350 + i * 84}" font-family="Arial, Helvetica, sans-serif" font-size="76" font-weight="800" fill="#ffffff">${esc(l)}</text>`).join('')}
      <text x="${tx}" y="${350 + titleLines.length * 84 + 10}" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#b7bfd0">${esc(artist)}${genre && genre !== artist ? ' · ' + esc(genre) : ''}</text>
      <rect x="${tx}" y="${h - 200}" width="470" height="80" rx="40" fill="${ACCENT}"/>
      <text x="${tx + 235}" y="${h - 147}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="800" fill="${BG}">portal-music.com</text>
      <text x="${tx + 500}" y="${h - 147}" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="#d7dcea">Free · No copyright strikes</text>
    </svg>`;
  }

  // Text/branding first so the cover sits on top of its own border glow
  const png = await sharp(base)
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }, ...layers])
    .png()
    .toBuffer();
  return { png, wave };
}

function captionFor(track) {
  const genre = (track.genre || '').toLowerCase();
  const tags = ['#nocopyrightmusic', '#royaltyfreemusic', '#freemusic', '#contentcreator', '#backgroundmusic'];
  const byGenre = {
    'hip-hop': '#hiphopbeats', 'electronic': '#electronicmusic', 'cinematic': '#cinematicmusic',
    'rock': '#rockmusic', 'jazz': '#jazzmusic', 'classical': '#classicalmusic', 'pop': '#popmusic',
    'acoustic': '#acousticmusic', 'country & folk': '#countrymusic', 'ambient & chill': '#chillmusic',
    'dark & suspense': '#horrormusic', 'r&b / soul': '#rnbmusic', 'playful & mood': '#vlogmusic',
  };
  if (byGenre[genre]) tags.unshift(byGenre[genre]);
  const who = track.artist ? ` by ${track.artist}` : '';
  return `🎵 "${track.title}"${who} — free for your videos.\n` +
    `Use it on YouTube, TikTok, Twitch & more. No copyright strikes, no sign-up.\n` +
    `🔗 Download free at portal-music.com\n\n${tags.join(' ')}`;
}

/**
 * Render a video for a track.
 * opts: { format: 'vertical'|'landscape', start: seconds, duration: seconds (0 = rest of track) }
 */
async function makeReel(track, opts = {}) {
  const { sharp, ffmpegPath } = loadDeps();
  const fmt = FORMATS[opts.format] ? opts.format : 'vertical';
  const start = Math.max(0, Number(opts.start) || 0);
  const duration = Math.max(0, Math.min(600, Number(opts.duration) || 0));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-reel-'));
  try {
    const audio = await localOrDownload(track.file, tmp, 'audio');
    if (!audio) throw new Error('Track has no audio file');
    const cover = await localOrDownload(track.cover, tmp, 'cover').catch(() => null);

    const { png, wave } = await buildBackground(sharp, track, cover, fmt);
    const bgPath = path.join(tmp, 'bg.png');
    fs.writeFileSync(bgPath, png);

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const outName = `${slug(track.title)}-${fmt}${duration ? '-' + duration + 's' : ''}.mp4`;
    const outPath = path.join(OUT_DIR, outName);

    const fade = duration ? Math.min(1.5, duration / 6) : 0;
    const audioFilters = ['aformat=channel_layouts=stereo'];
    if (duration) audioFilters.push(`afade=t=in:st=0:d=0.4`, `afade=t=out:st=${(duration - fade).toFixed(2)}:d=${fade.toFixed(2)}`);

    const args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-loop', '1', '-framerate', '30', '-i', bgPath,
      '-ss', String(start), ...(duration ? ['-t', String(duration)] : []), '-i', audio,
      '-filter_complex',
      `[1:a]${audioFilters.join(',')},asplit=2[aout][aw];` +
      `[aw]showwaves=s=${wave.w}x${wave.h}:mode=cline:rate=30:colors=${ACCENT.replace('#', '0x')}:scale=sqrt:draw=full,format=rgba[wv];` +
      `[0:v][wv]overlay=${wave.x}:${wave.y}:format=auto,format=yuv420p[v]`,
      '-map', '[v]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', '30',
      '-c:a', 'aac', '-b:a', '192k',
      '-shortest', '-movflags', '+faststart',
      outPath,
    ];
    await runFfmpeg(ffmpegPath, args);
    return { file: outName, path: outPath, caption: captionFor(track) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function reelPath(name) {
  const safe = path.basename(String(name || ''));
  const full = path.join(OUT_DIR, safe);
  if (!safe.endsWith('.mp4') || !fs.existsSync(full)) throw new Error('Video not found');
  return full;
}

module.exports = { makeReel, reelPath, captionFor, FORMATS };
