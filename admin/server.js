const http = require('http');
const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');

let NodeID3;
try {
  NodeID3 = require('node-id3');
} catch {
  console.warn('node-id3 not available, audio ID3 parsing will use basic fallback');
}

const PORT = process.env.ADMIN_PORT || 3030;
const ROOT_DIR = path.join(__dirname, '..');
const MUSIC_JSON_PATH = path.join(ROOT_DIR, 'data', 'music.json');
const GENRES_JSON_PATH = path.join(ROOT_DIR, 'data', 'genres.json');
const ARTISTS_JSON_PATH = path.join(ROOT_DIR, 'data', 'artists.json');
const MUSIC_DIR = path.join(ROOT_DIR, 'music');
const COVERS_DIR = path.join(ROOT_DIR, 'covers');

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
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

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // --- Serve Admin UI ---
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const htmlPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(htmlPath));
    }
  }

  // --- API: Get Catalog & Metadata Config ---
  if (req.method === 'GET' && pathname === '/api/catalog') {
    try {
      const music = fs.existsSync(MUSIC_JSON_PATH) ? JSON.parse(fs.readFileSync(MUSIC_JSON_PATH, 'utf8')) : [];
      const genres = fs.existsSync(GENRES_JSON_PATH) ? JSON.parse(fs.readFileSync(GENRES_JSON_PATH, 'utf8')) : {};
      const artists = fs.existsSync(ARTISTS_JSON_PATH) ? JSON.parse(fs.readFileSync(ARTISTS_JSON_PATH, 'utf8')) : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, tracks: music, genres: genres.genres || {}, artists }));
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

      let targetFolder = genreFolder;
      if (isNewRelease) {
        targetFolder = path.join(genreFolder, 'Newest Release!');
        fs.mkdirSync(targetFolder, { recursive: true });
      }

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

      const relativeAudioPath = isNewRelease
        ? `music/${genre}/Newest Release!/${finalFileName}`
        : `music/${genre}/${finalFileName}`;
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
      const { id, title, artist, genre, subgenre, tags, featured } = data;
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

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, remaining: music.length }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
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

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🎵 Portal Music Admin Studio is running!`);
  console.log(`👉 Open: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
