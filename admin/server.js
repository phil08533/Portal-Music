const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const users = require('./users');
const reels = require('./reels');

let NodeID3;
try {
  NodeID3 = require('node-id3');
} catch {
  console.warn('node-id3 not available, audio ID3 parsing will use basic fallback');
}

const PORT = process.env.ADMIN_PORT || 3030;
const HOST = '127.0.0.1'; // never expose the studio to your network
const MAX_BODY_BYTES = 300 * 1024 * 1024;

// Fresh secret every launch. It is embedded in the page this server serves and
// required on every API call, so other websites open in your browser can't
// drive the studio (they can't read the page, so they never learn the token).
const SESSION_TOKEN = crypto.randomBytes(24).toString('hex');
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const ROOT_DIR = path.join(__dirname, '..');
const MUSIC_JSON_PATH = path.join(ROOT_DIR, 'data', 'music.json');
const GENRES_JSON_PATH = path.join(ROOT_DIR, 'data', 'genres.json');
const ARTISTS_JSON_PATH = path.join(ROOT_DIR, 'data', 'artists.json');
const SPOTLIGHT_JSON_PATH = path.join(ROOT_DIR, 'data', 'spotlight.json');
const MUSIC_DIR = path.join(ROOT_DIR, 'music');
const COVERS_DIR = path.join(ROOT_DIR, 'covers');

// "YYYY-MM-DD"; tracks with a recent "added" date appear under New Releases on the homepage
function today() {
  return new Date().toISOString().slice(0, 10);
}

function readSpotlight() {
  try {
    return JSON.parse(fs.readFileSync(SPOTLIGHT_JSON_PATH, 'utf8'));
  } catch (e) {
    return { active: false, title: '', subtitle: '', trackIds: [] };
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Upload too large'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Reject DNS-rebinding style requests that arrive under a foreign hostname
  if (!ALLOWED_HOSTS.has(req.headers.host)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  // --- Serve Admin UI ---
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const htmlPath = path.join(__dirname, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8')
      .replace('</head>', `  <meta name="admin-token" content="${SESSION_TOKEN}">\n</head>`);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
    return res.end(html);
  }

  if (pathname.startsWith('/api/')) {
    const given = String(req.headers['x-admin-token'] || '');
    const ok = given.length === SESSION_TOKEN.length &&
      crypto.timingSafeEqual(Buffer.from(given), Buffer.from(SESSION_TOKEN));
    if (!ok) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Session expired — reload the Admin Studio page.' }));
    }
  }

  const sendJson = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  };

  // --- API: Social video maker ---
  if (req.method === 'POST' && pathname === '/api/social/reel') {
    try {
      const { id, format, start, duration } = await parseBody(req);
      const music = JSON.parse(fs.readFileSync(MUSIC_JSON_PATH, 'utf8'));
      const track = music.find(t => t.id === id);
      if (!track) throw new Error('Track not found');
      const out = await reels.makeReel(track, { format, start, duration });
      return sendJson(200, { success: true, file: out.file, caption: out.caption });
    } catch (err) {
      return sendJson(500, { success: false, error: err.message });
    }
  }
  if (req.method === 'GET' && pathname === '/api/social/reel-file') {
    try {
      const file = reels.reelPath(url.searchParams.get('name'));
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': fs.statSync(file).size,
        'Cache-Control': 'no-store',
      });
      return fs.createReadStream(file).pipe(res);
    } catch (err) {
      return sendJson(404, { success: false, error: err.message });
    }
  }

  // --- API: User Accounts (Firebase Admin SDK) ---
  if (pathname.startsWith('/api/users')) {
    try {
      if (req.method === 'GET' && pathname === '/api/users/status') {
        return sendJson(200, { success: true, ...users.status() });
      }
      if (req.method === 'GET' && pathname === '/api/users') {
        return sendJson(200, { success: true, ...(await users.listUsers()) });
      }
      if (req.method === 'GET' && pathname === '/api/users/codes') {
        return sendJson(200, { success: true, codes: await users.listCodes() });
      }
      if (req.method === 'GET' && pathname === '/api/users/detail') {
        const uid = url.searchParams.get('uid');
        if (!uid) throw new Error('uid required');
        return sendJson(200, { success: true, ...(await users.getUserDetail(uid)) });
      }
      if (req.method === 'POST') {
        const body = await parseBody(req);
        if (pathname === '/api/users/set-pro') {
          if (!body.uid) throw new Error('uid required');
          await users.setPro(body.uid, body.isPro);
          return sendJson(200, { success: true });
        }
        if (pathname === '/api/users/grant-by-email') {
          if (!body.email) throw new Error('email required');
          const user = await users.setProByEmail(body.email, body.isPro !== false, body.months);
          return sendJson(200, { success: true, user });
        }
        if (pathname === '/api/users/expiry') {
          if (!body.uid) throw new Error('uid required');
          return sendJson(200, { success: true, ...(await users.adjustProExpiry(body.uid, body)) });
        }
        if (pathname === '/api/users/note') {
          if (!body.uid) throw new Error('uid required');
          await users.setNote(body.uid, body.note);
          return sendJson(200, { success: true });
        }
        if (pathname === '/api/users/disable') {
          if (!body.uid) throw new Error('uid required');
          await users.setDisabled(body.uid, body.disabled);
          return sendJson(200, { success: true });
        }
        if (pathname === '/api/users/codes/create') {
          return sendJson(200, { success: true, codes: await users.createCodes(body.count, body.note, body.months) });
        }
        if (pathname === '/api/users/codes/delete') {
          if (!body.code) throw new Error('code required');
          await users.deleteCode(body.code);
          return sendJson(200, { success: true });
        }
        if (pathname === '/api/users/delete') {
          if (!body.uid) throw new Error('uid required');
          await users.deleteUser(body.uid);
          return sendJson(200, { success: true });
        }
      }
      return sendJson(404, { success: false, error: 'Unknown users endpoint' });
    } catch (err) {
      return sendJson(500, { success: false, error: err.message });
    }
  }

  // --- API: Get Catalog & Metadata Config ---
  if (req.method === 'GET' && pathname === '/api/catalog') {
    try {
      const music = fs.existsSync(MUSIC_JSON_PATH) ? JSON.parse(fs.readFileSync(MUSIC_JSON_PATH, 'utf8')) : [];
      const genres = fs.existsSync(GENRES_JSON_PATH) ? JSON.parse(fs.readFileSync(GENRES_JSON_PATH, 'utf8')) : {};
      const artists = fs.existsSync(ARTISTS_JSON_PATH) ? JSON.parse(fs.readFileSync(ARTISTS_JSON_PATH, 'utf8')) : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, tracks: music, genres: genres.genres || {}, artists, spotlight: readSpotlight() }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // --- API: Parse Audio File Metadata (Base64) ---
  if (req.method === 'POST' && pathname === '/api/parse-audio') {
    try {
      const data = await parseBody(req);
      const { fileName, base64Data } = data;
      if (!base64Data) throw new Error('No audio data provided');

      const buffer = Buffer.from(base64Data.replace(/^data:audio\/\w+;base64,/, ''), 'base64');
      const baseName = path.parse(fileName || 'Track.mp3').name.replace(/[-_]+/g, ' ').trim();
      const titleCaseName = baseName.replace(/\b\w/g, c => c.toUpperCase());

      let title = titleCaseName;
      let artist = '';
      let genre = '';
      let coverBase64 = null;

      if (NodeID3) {
        try {
          const tags = NodeID3.read(buffer);
          if (tags) {
            if (tags.title) title = tags.title.trim();
            if (tags.artist) artist = tags.artist.trim();
            if (tags.genre) genre = tags.genre.trim();
            if (tags.image && tags.image.imageBuffer) {
              const mime = tags.image.mime || 'image/jpeg';
              coverBase64 = `data:${mime};base64,${tags.image.imageBuffer.toString('base64')}`;
            }
          }
        } catch (e) {
          console.warn('ID3 read error:', e.message);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        metadata: {
          title,
          artist,
          genre,
          hasCover: !!coverBase64,
          coverData: coverBase64
        }
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // --- API: Save New Track to Catalog ---
  if (req.method === 'POST' && pathname === '/api/track/add') {
    try {
      const data = await parseBody(req);
      const { title, artist, genre, subgenre, tags, featured, isNewRelease, audioBase64, audioFileName, coverBase64 } = data;

      if (!title || !genre) throw new Error('Title and Genre are required');

      const id = uid();
      fs.mkdirSync(MUSIC_DIR, { recursive: true });
      fs.mkdirSync(COVERS_DIR, { recursive: true });

      // Save Cover Art
      let coverUrl = '';
      if (coverBase64) {
        const coverBuffer = Buffer.from(coverBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        const coverExt = coverBase64.includes('image/png') ? '.png' : '.jpg';
        const coverFilename = `${id}${coverExt}`;
        fs.writeFileSync(path.join(COVERS_DIR, coverFilename), coverBuffer);
        coverUrl = `https://assets.portal-music.com/covers/${coverFilename}`;
      }

      // Save Audio File
      const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '').trim();
      const genreFolder = path.join(MUSIC_DIR, genre);
      fs.mkdirSync(genreFolder, { recursive: true });

      const targetFolder = genreFolder;

      const audioBuffer = audioBase64 ? Buffer.from(audioBase64.replace(/^data:audio\/\w+;base64,/, ''), 'base64') : null;
      const finalFileName = `${safeTitle}.mp3`;
      const targetAudioPath = path.join(targetFolder, finalFileName);

      if (audioBuffer) {
        fs.writeFileSync(targetAudioPath, audioBuffer);
        // Write/clean ID3 metadata tags on the MP3 file (clearing Suno markers, setting copyright & site info)
        if (NodeID3) {
          try {
            const id3Tags = {
              title: title.trim(),
              artist: artist ? artist.trim() : 'Portal Music',
              album: genre.trim() || 'Portal Music',
              copyright: `\u00a9 ${new Date().getFullYear()} Portal Music. Free for public use.`,
              comment: { language: 'eng', text: 'Free for YouTube, TikTok, and more. No attribution required. https://portal-music.com' },
              userDefinedText: [
                { description: 'WEBSITE', value: 'https://portal-music.com' },
                { description: 'CONTACT', value: 'creatitproductions@gmail.com' },
              ],
              encodedBy: '',
              encoderSettings: '',
            };
            if (coverBase64) {
              const mime = coverBase64.includes('image/png') ? 'image/png' : 'image/jpeg';
              const rawImg = Buffer.from(coverBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
              id3Tags.image = { mime, type: { id: 3, name: 'front cover' }, description: 'Cover', imageBuffer: rawImg };
            }
            NodeID3.write(id3Tags, targetAudioPath);
          } catch (e) {
            console.warn('Could not write ID3 tags to MP3:', e.message);
          }
        }
      }

      const relativeAudioPath = `music/${genre}/${finalFileName}`;
      const fileUrl = `https://assets.portal-music.com/${encodeURI(relativeAudioPath)}`;

      // Update Catalog
      const music = fs.existsSync(MUSIC_JSON_PATH) ? JSON.parse(fs.readFileSync(MUSIC_JSON_PATH, 'utf8')) : [];
      const newEntry = {
        id,
        title: title.trim(),
        artist: artist ? artist.trim() : null,
        genre: genre.trim(),
        subgenre: subgenre ? subgenre.trim() : genre.trim(),
        tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []),
        file: fileUrl,
        duration: '',
        featured: !!featured,
        cover: coverUrl || `https://assets.portal-music.com/covers/${id}.jpg`
      };
      if (isNewRelease) newEntry.added = today();

      // Add to front of catalog so it appears immediately
      music.unshift(newEntry);
      fs.writeFileSync(MUSIC_JSON_PATH, JSON.stringify(music, null, 2), 'utf8');

      // Regenerate SEO pages automatically
      exec(`node "${path.join(ROOT_DIR, 'scripts', 'generate-seo-pages.js')}"`, { cwd: ROOT_DIR }, (err, stdout, stderr) => {
        if (err) console.error('SEO generation notice:', stderr);
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, track: newEntry }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // --- API: Update Existing Track Metadata ---
  if (req.method === 'POST' && pathname === '/api/track/update') {
    try {
      const data = await parseBody(req);
      const { id, title, artist, genre, subgenre, tags, featured, isNew } = data;
      if (!id) throw new Error('Track ID required');

      const music = JSON.parse(fs.readFileSync(MUSIC_JSON_PATH, 'utf8'));
      const idx = music.findIndex(t => t.id === id);
      if (idx === -1) throw new Error('Track not found');

      if (title !== undefined) music[idx].title = title.trim();
      if (artist !== undefined) music[idx].artist = artist ? artist.trim() : null;
      if (genre !== undefined) music[idx].genre = genre.trim();
      if (subgenre !== undefined) music[idx].subgenre = subgenre.trim();
      if (tags !== undefined) {
        music[idx].tags = Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim()).filter(Boolean);
      }
      if (featured !== undefined) music[idx].featured = !!featured;
      if (isNew === true) music[idx].added = today();
      if (isNew === false) delete music[idx].added;

      fs.writeFileSync(MUSIC_JSON_PATH, JSON.stringify(music, null, 2), 'utf8');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, track: music[idx] }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // --- API: Delete Track from Catalog ---
  if (req.method === 'POST' && pathname === '/api/track/delete') {
    try {
      const { id } = await parseBody(req);
      if (!id) throw new Error('Track ID required');

      let music = JSON.parse(fs.readFileSync(MUSIC_JSON_PATH, 'utf8'));
      const initialLen = music.length;
      music = music.filter(t => t.id !== id);
      if (music.length === initialLen) throw new Error('Track ID not found in catalog');

      fs.writeFileSync(MUSIC_JSON_PATH, JSON.stringify(music, null, 2), 'utf8');

      const spotlight = readSpotlight();
      if (spotlight.trackIds.includes(id)) {
        spotlight.trackIds = spotlight.trackIds.filter(t => t !== id);
        fs.writeFileSync(SPOTLIGHT_JSON_PATH, JSON.stringify(spotlight, null, 2) + '\n', 'utf8');
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, remaining: music.length }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // --- API: Homepage Spotlight (custom collection, e.g. "Fall Hits") ---
  if (req.method === 'POST' && pathname === '/api/spotlight') {
    try {
      const data = await parseBody(req);
      const music = JSON.parse(fs.readFileSync(MUSIC_JSON_PATH, 'utf8'));
      const known = new Set(music.map(t => t.id));
      const ids = Array.isArray(data.trackIds) ? data.trackIds : [];
      const spotlight = {
        active: !!data.active,
        title: String(data.title || '').trim().slice(0, 60),
        subtitle: String(data.subtitle || '').trim().slice(0, 160),
        trackIds: [...new Set(ids.map(String))].filter(id => known.has(id)).slice(0, 24),
      };
      fs.writeFileSync(SPOTLIGHT_JSON_PATH, JSON.stringify(spotlight, null, 2) + '\n', 'utf8');
      return sendJson(200, { success: true, spotlight });
    } catch (err) {
      return sendJson(500, { success: false, error: err.message });
    }
  }

  // --- API: Action: Regenerate SEO Pages ---
  if (req.method === 'POST' && pathname === '/api/action/regenerate-seo') {
    exec(`node "${path.join(ROOT_DIR, 'scripts', 'generate-seo-pages.js')}"`, { cwd: ROOT_DIR }, (err, stdout, stderr) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: stderr || err.message }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, output: stdout }));
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, HOST, () => {
  console.log(`\n======================================================`);
  console.log(`🎵 Portal Music Admin Studio is running!`);
  console.log(`👉 Open: http://localhost:${PORT}`);
  const fb = users.status();
  console.log(fb.configured
    ? `👥 User accounts: connected to Firebase project "${fb.projectId}"`
    : `👥 User accounts: not connected (${fb.error})`);
  console.log(`======================================================\n`);
});
