/**
 * Portal Music Admin — import a song from a Suno link
 *
 * Paste a link like https://suno.com/song/<id> (or a short https://suno.com/s/<code>
 * share link). We read what Suno shows publicly (title, style tags, cover, length)
 * and download the MP3, plus the WAV when Suno has one for that song.
 *
 * Suno only makes a WAV after the song's owner clicks Download → WAV Audio once
 * in Suno; until then only the MP3 exists.
 */

'use strict';

const SUNO_WEB = process.env.SUNO_WEB || 'https://suno.com';
const SUNO_API = process.env.SUNO_API || 'https://studio-api.prod.suno.com';
const SUNO_CDN = process.env.SUNO_CDN || 'https://cdn1.suno.ai';
const SHORT_LINK_HOSTS = new Set(['suno.com', 'www.suno.com', 'app.suno.ai', 'suno.ai']);

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function isSunoId(id) {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
}

async function get(url, ms = 20000) {
  const res = await fetch(url, {
    // Suno's file server refuses requests that don't look like a normal browser
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://suno.com/',
      'Origin': 'https://suno.com',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(ms),
  });
  return res;
}

// Accepts a full song link, a short share link, or a bare song ID
async function resolveId(link) {
  const text = String(link || '').trim();
  const direct = text.match(UUID_RE);
  if (direct) return direct[0].toLowerCase();

  let url;
  try { url = new URL(text); } catch (e) { throw new Error('That doesn\'t look like a Suno link'); }
  if (!SHORT_LINK_HOSTS.has(url.hostname)) throw new Error('Only suno.com links are supported');

  const res = await get(url.href);
  const found = res.url.match(UUID_RE) || (await res.text()).match(UUID_RE);
  if (!found) throw new Error('Could not find the song in that link. Open it in Suno and copy the link from the song page.');
  return found[0].toLowerCase();
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function metaTag(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : '';
}

// Suno's public clip API (used by its own web player); falls back to the song page
async function fetchInfo(id) {
  try {
    const res = await get(`${SUNO_API}/api/clip/${id}`);
    if (res.ok) {
      const c = await res.json();
      const m = c.metadata || {};
      return {
        title: c.title || '',
        sunoArtist: c.display_name || c.handle || '',
        style: m.tags || '',
        duration: Number(m.duration) || 0,
        coverUrl: c.image_large_url || c.image_url || '',
        audioUrl: c.audio_url || '',
      };
    }
  } catch (e) { /* try the page instead */ }

  const res = await get(`${SUNO_WEB}/song/${id}`);
  if (!res.ok) throw new Error(`Suno returned ${res.status} for that song. Is it public?`);
  const html = await res.text();
  // Song data is embedded in the page as (sometimes escaped) JSON
  const field = name => {
    const m = html.match(new RegExp(`\\\\?"${name}\\\\?"\\s*:\\s*\\\\?"((?:[^"\\\\]|\\\\[^"])*)\\\\?"`));
    return m ? m[1].replace(/\\\\?u0026/g, '&').replace(/\\+n/g, ' ').replace(/\\+/g, '') : '';
  };
  const dur = html.match(/\\?"duration\\?"\s*:\s*([\d.]+)/);
  return {
    title: metaTag(html, 'og:title').replace(/\s*[|–-]\s*Suno\s*$/i, '') || field('title'),
    sunoArtist: field('display_name'),
    style: field('tags') || field('display_tags'),
    duration: dur ? Number(dur[1]) : 0,
    coverUrl: metaTag(html, 'og:image'),
    audioUrl: metaTag(html, 'og:audio') || metaTag(html, 'og:audio:url'),
  };
}

// Common Suno style words → one of the site's subgenres (used when no name matches directly)
const STYLE_WORDS = [
  [/synth ?wave|techno|edm|house|trance|electro|dubstep|drum and bass|dnb|cyberpunk/, 'Techno-Wave'],
  [/lo-?fi/, 'Lo-Fi'],
  [/chillhop|chill hop/, 'Chillhop'],
  [/dream ?pop|shoegaze/, 'Dream Pop'],
  [/trap|rap|boom ?bap|hip ?hop|drill/, 'Hip-Hop'],
  [/r&b|rnb|soul|neo-soul|motown/, 'R&B / Soul'],
  [/metal/, 'Hair Metal'],
  [/punk/, 'Punk Rock'],
  [/grunge|garage rock|alt(ernative)? rock|indie rock|rock/, 'Rock'],
  [/orchestral|epic|trailer|score|soundtrack/, 'Cinematic Epic'],
  [/horror|creepy|eerie/, 'Horror'],
  [/suspense|thriller|tense/, 'Suspenseful'],
  [/meditat|spa|yoga/, 'Meditative'],
  [/ambient|drone/, 'Ambient'],
  [/bluegrass|banjo/, 'Bluegrass'],
  [/western|cowboy/, 'Western'],
  [/country|folk|americana/, 'Country'],
  [/smooth jazz|lounge|bossa/, 'Calm Jazz'],
  [/bebop|swing|big band|jazz/, 'Fast Jazz'],
  [/piano|string quartet|baroque|classical/, 'Classical'],
  [/medieval|celtic|bard/, 'Medieval'],
  [/sad|heartbreak/, 'Sad'],
  [/melanchol/, 'Melancholy'],
  [/playful|quirky|whimsical|kids/, 'Playful'],
  [/indie pop|bedroom pop/, 'Indie Pop'],
  [/pop|dance/, 'Pop'],
  [/acoustic|singer-songwriter/, 'Acoustic'],
];

// Match Suno's style text ("lo-fi, chill piano, rainy") against the site's genres
function guessGenre(style, genres) {
  const words = String(style || '').toLowerCase();
  if (!words) return { genre: '', subgenre: '' };
  // 1. a subgenre named in the style ("hard rock"), longest wins
  let best = null;
  for (const [genre, info] of Object.entries(genres || {})) {
    for (const sub of info.subgenres || []) {
      const s = sub.toLowerCase();
      if (s && words.includes(s) && (!best || s.length > best.len)) best = { genre, subgenre: sub, len: s.length };
    }
  }
  if (best) return { genre: best.genre, subgenre: best.subgenre };
  // 2. common Suno style words
  for (const [re, sub] of STYLE_WORDS) {
    if (!re.test(words)) continue;
    const genre = Object.keys(genres || {}).find(g => (genres[g].subgenres || []).includes(sub));
    if (genre) return { genre, subgenre: sub };
  }
  // 3. a genre name ("jazz", "dark")
  for (const genre of Object.keys(genres || {})) {
    for (const part of genre.toLowerCase().split(/\s*[&/,]\s*|\s+and\s+/)) {
      if (part.length > 2 && words.includes(part)) return { genre, subgenre: '' };
    }
  }
  return { genre: '', subgenre: '' };
}

function formatDuration(sec) {
  if (!sec) return '';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function titleCase(s) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

async function wavExists(id) {
  try {
    const res = await fetch(`${SUNO_CDN}/${id}.wav`, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function lookup(link, genres) {
  const id = await resolveId(link);
  const info = await fetchInfo(id);
  const guess = guessGenre(info.style, genres);

  let coverData = null;
  if (info.coverUrl) {
    try {
      const img = await get(info.coverUrl);
      if (img.ok) {
        const type = (img.headers.get('content-type') || 'image/jpeg').split(';')[0];
        if (type.startsWith('image/')) {
          coverData = `data:${type};base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`;
        }
      }
    } catch (e) { /* cover is optional */ }
  }

  const tags = String(info.style || '').split(/[,;]/).map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 8);
  return {
    id,
    title: titleCase(info.title),
    sunoArtist: info.sunoArtist,
    style: info.style,
    tags,
    genre: guess.genre,
    subgenre: guess.subgenre,
    duration: formatDuration(info.duration),
    coverData,
    previewUrl: `${SUNO_CDN}/${id}.mp3`,
    audioUrl: isSunoUrl(info.audioUrl) ? info.audioUrl : '',
    hasWav: await wavExists(id),
  };
}

// A real MP3 starts with an ID3 tag or an MPEG frame header. Suno now serves locked
// (encrypted) audio to most requests; those bytes must never land in the catalog.
function isMp3(buf) {
  if (!buf || buf.length < 1000) return false;
  if (buf.slice(0, 3).toString() === 'ID3') return true;
  return buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
}

// Only ever download from Suno's own servers
function isSunoUrl(u) {
  try {
    const h = new URL(u).hostname;
    return /(^|\.)suno\.(ai|com)$/.test(h) || u.startsWith(SUNO_CDN + '/');
  } catch (e) {
    return false;
  }
}

// Download the song's MP3 or WAV from Suno; returns a Buffer.
// altUrl: the audio link Suno's API gave for this song, tried if the usual one is refused.
async function download(id, ext, altUrl) {
  if (!isSunoId(id)) throw new Error('Invalid Suno song ID');
  if (ext !== 'mp3' && ext !== 'wav') throw new Error('Unsupported format');
  const urls = [`${SUNO_CDN}/${id}.${ext}`];
  if (ext === 'mp3' && altUrl && isSunoUrl(altUrl) && !urls.includes(altUrl)) urls.push(altUrl);

  let status = 0;
  for (const u of urls) {
    try {
      const res = await get(u, 180000);
      status = res.status;
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (ext === 'wav' && buf.slice(0, 4).toString() !== 'RIFF') continue;
      if (ext === 'mp3' && !isMp3(buf)) continue;
      return buf;
    } catch (e) { /* try the next link */ }
  }
  const err = new Error(ext === 'wav'
    ? 'Suno has no WAV for this song yet. In Suno click ⋯ → Download → WAV Audio once, then try again (or attach the WAV in Edit).'
    : `Suno didn't allow the automatic download (${status || 'locked file'}).`);
  err.code = 'SUNO_DOWNLOAD';
  return Promise.reject(err);
}

module.exports = { lookup, download, isSunoId, isMp3, guessGenre };
