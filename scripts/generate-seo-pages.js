/**
 * Portal Music — SEO Page Generator
 *
 * Generates:
 *   genres/<slug>.html  — one page per genre (13 pages)
 *   tracks/<slug>-<id>.html — one page per track (442+ pages)
 *   sitemap-tracks.xml  — sitemap for all track pages
 *
 * Run from repo root:
 *   node scripts/generate-seo-pages.js
 */

const fs   = require('fs');
const path = require('path');

const songs      = JSON.parse(fs.readFileSync('data/music.json',  'utf8'));
const genresCfg  = JSON.parse(fs.readFileSync('data/genres.json', 'utf8')).genres;

fs.mkdirSync('genres', { recursive: true });
fs.mkdirSync('tracks', { recursive: true });

function slug(str) {
  return String(str).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const GENRE_DESC = {
  'Rock':            'Energetic rock music free to download for YouTube videos, gaming content, and creative projects. No copyright strikes, commercial use allowed.',
  'Electronic':      'Electronic music free to download — EDM, chillhop, lo-fi, and techno for YouTube, podcasts, and streams. Royalty-free, no attribution required.',
  'Cinematic':       'Epic cinematic and orchestral music free for films, YouTube trailers, gaming, and dramatic content. Royalty-free downloads.',
  'Country & Folk':  'Country and folk music free to download for YouTube vlogs, travel videos, and creative projects. Acoustic, bluegrass, and western styles.',
  'Ambient & Chill': 'Relaxing ambient and chill music free for studying, podcasts, lo-fi playlists, and meditation content. Royalty-free downloads.',
  'Jazz':            'Jazz music free to download for YouTube videos, vlogs, and coffee-shop content. Smooth jazz and fast jazz tracks, royalty-free.',
  'Classical':       'Classical music free to download for educational videos, creative projects, and dramatic content. Orchestral and piano compositions.',
  'Hip-Hop':         'Hip-hop music free to download for YouTube videos, social media, and creative projects. Beats and rap instrumentals, royalty-free.',
  'Pop':             'Pop music free to download for YouTube videos, social media content, and commercial projects. Upbeat and catchy royalty-free tracks.',
  'Acoustic':        'Acoustic guitar music free to download for vlogs, travel videos, and heartfelt creative projects. Royalty-free, no copyright strikes.',
  'R&B / Soul':      'R&B and soul music free to download for YouTube videos, social media, and creative projects. Smooth royalty-free tracks.',
  'Dark & Suspense': 'Dark and suspenseful music free for horror videos, thrillers, and dramatic content. Royalty-free downloads, no copyright strikes.',
  'Playful & Mood':  'Playful and mood-driven music free for comedy videos, kids content, and light-hearted projects. Royalty-free downloads.',
};

const GENRE_KEYWORDS = {
  'Rock':            'free rock music, royalty free rock, rock background music, rock music for videos',
  'Electronic':      'free electronic music, royalty free EDM, lo-fi music, chillhop, electronic background music',
  'Cinematic':       'free cinematic music, royalty free orchestral, trailer music, epic background music',
  'Country & Folk':  'free country music, royalty free folk, acoustic country, bluegrass music for videos',
  'Ambient & Chill': 'free ambient music, royalty free chill, lo-fi study music, relaxing background music',
  'Jazz':            'free jazz music, royalty free jazz, smooth jazz for videos, jazz background music',
  'Classical':       'free classical music, royalty free classical, orchestral music for videos',
  'Hip-Hop':         'free hip-hop music, royalty free rap beats, hip hop background music',
  'Pop':             'free pop music, royalty free pop, pop background music for videos',
  'Acoustic':        'free acoustic music, royalty free acoustic guitar, acoustic background music',
  'R&B / Soul':      'free R&B music, royalty free soul, R&B background music',
  'Dark & Suspense': 'free horror music, royalty free suspense, dark background music, creepy music',
  'Playful & Mood':  'free playful music, royalty free fun music, happy background music for videos',
};

// Group songs by genre
const byGenre = {};
songs.forEach(function (s) {
  var g = s.genre || 'Other';
  if (!byGenre[g]) byGenre[g] = [];
  byGenre[g].push(s);
});

// Shared header/footer/player HTML
function sharedHeader(active) {
  return `  <header>
    <a href="/index.html" class="logo"><img src="/images/portal.png" alt="Portal Music" class="logo-img"> Portal Music</a>
    <nav class="nav-links">
      <a href="/index.html">Home</a>
      <a href="/browse.html"${active === 'browse' ? ' aria-current="page"' : ''}>Browse</a>
      <a href="/radio.html">Radio</a>
    </nav>
  </header>`;
}

function sharedFooter() {
  return `  <footer class="site-footer">
    <div class="footer-inner">
      <p>&copy; 2025&ndash;2026 Portal Music. All tracks are free to use.</p>
      <div class="footer-links">
        <a href="/about.html">About</a>
        <a href="/license.html">License</a>
        <a href="/dispute-guide.html">Copyright Help</a>
        <a href="/privacy.html">Privacy Policy</a>
        <a href="/terms.html">Terms of Use</a>
      </div>
    </div>
  </footer>`;
}

function sharedPlayer() {
  return `  <div id="player-bar">
    <div class="player-art" id="player-art">🎵</div>
    <div class="player-info">
      <div class="player-title" id="player-title">Select a track</div>
      <div class="player-artist" id="player-artist"></div>
    </div>
    <div class="player-controls">
      <button class="skip-btn" id="play-prev-btn" title="Previous">⏮</button>
      <button class="player-btn" id="play-pause-btn" title="Play / Pause">▶</button>
      <button class="skip-btn" id="play-next-btn" title="Next">⏭</button>
    </div>
    <div class="player-progress">
      <div class="progress-track" id="progress-track">
        <div class="progress-fill" id="progress-fill"></div>
      </div>
      <div class="player-time" id="player-time">0:00 / 0:00</div>
    </div>
    <button class="player-fav" id="player-fav-btn" title="Toggle favorite">🤍</button>
  </div>`;
}

// ─── Generate Genre Pages ────────────────────────────────────────────────────

Object.entries(byGenre).forEach(function ([genre, genreSongs]) {
  var sl      = slug(genre);
  var icon    = (genresCfg[genre] && genresCfg[genre].icon) || '🎵';
  var desc    = GENRE_DESC[genre]    || ('Free ' + genre + ' music downloads. Royalty-free, no copyright strikes, commercial use allowed.');
  var keywords = GENRE_KEYWORDS[genre] || ('free ' + genre.toLowerCase() + ' music, royalty free');

  var trackRows = genreSongs.map(function (s) {
    var tslug = slug(s.title + '-' + (s.artist || s.subgenre || genre));
    var artistName = esc(s.artist || s.subgenre || genre);
    return '<div class="track-row">' +
      '<a href="/tracks/' + tslug + '-' + s.id + '.html" class="track-link">' +
        '<img src="' + esc(s.cover) + '" alt="' + esc(s.title) + '" class="track-thumb" width="60" height="60" loading="lazy">' +
        '<div class="track-info">' +
          '<span class="track-title">' + esc(s.title) + '</span>' +
          '<span class="track-artist">' + artistName + '</span>' +
        '</div>' +
      '</a>' +
      '<a class="dl-btn-small" href="/download.html?file=' + encodeURIComponent(s.file) + '&title=' + encodeURIComponent(s.title) + '">⬇ Download</a>' +
    '</div>';
  }).join('\n    ');

  var jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': 'Free ' + genre + ' Music Downloads',
    'description': desc,
    'url': 'https://portal-music.com/genres/' + sl + '.html',
    'about': { '@type': 'MusicGenre', 'name': genre },
    'numberOfItems': genreSongs.length,
  });

  var breadcrumbLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://portal-music.com/' },
      { '@type': 'ListItem', 'position': 2, 'name': 'Browse', 'item': 'https://portal-music.com/browse.html' },
      { '@type': 'ListItem', 'position': 3, 'name': icon + ' ' + genre + ' Music', 'item': 'https://portal-music.com/genres/' + sl + '.html' },
    ]
  });

  var html = `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Free ${esc(genre)} Music Downloads — Portal Music</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="keywords" content="${esc(keywords)}">
  <link rel="canonical" href="https://portal-music.com/genres/${sl}.html">
  <link rel="icon" href="/images/portal.png" type="image/png">
  <meta property="og:title" content="Free ${esc(genre)} Music Downloads — Portal Music">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="https://portal-music.com/images/portal.png">
  <meta property="og:url" content="https://portal-music.com/genres/${sl}.html">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Portal Music">
  <link rel="stylesheet" href="/css/styles.css">
  <script src="/js/app.js"></script>
  <script type="application/ld+json">${jsonLd}</script>
  <script type="application/ld+json">${breadcrumbLd}</script>
</head>
<body>

${sharedHeader('browse')}

  <main>
    <div class="container">

      <nav class="seo-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a> &rsaquo; <a href="/browse.html">Browse</a> &rsaquo; <span>${icon} ${esc(genre)}</span>
      </nav>

      <div class="browse-header">
        <h1>${icon} Free ${esc(genre)} Music</h1>
        <p class="browse-subtitle">${genreSongs.length} free tracks &mdash; download for YouTube, podcasts &amp; projects. No copyright strikes.</p>
      </div>

      <p class="seo-intro">${esc(desc)}</p>

      <div class="track-list" id="track-list">
    ${trackRows}
      </div>

      <div style="margin-top:2rem;text-align:center;">
        <a href="/browse.html?genre=${encodeURIComponent(genre)}" class="hero-cta">Open in Player &rarr;</a>
      </div>

      <div class="seo-link-section">
        <h2>More Free Music Genres</h2>
        <div class="genre-link-row">
${Object.entries(genresCfg).filter(function(e){ return e[0] !== genre; }).map(function(e){
  return '          <a href="/genres/' + slug(e[0]) + '.html" class="genre-pill">' + e[1].icon + ' ' + esc(e[0]) + '</a>';
}).join('\n')}
        </div>
      </div>

    </div>
  </main>

${sharedFooter()}

${sharedPlayer()}

</body>
</html>`;

  fs.writeFileSync('genres/' + sl + '.html', html, 'utf8');
});

console.log('Generated ' + Object.keys(byGenre).length + ' genre pages in genres/');

// ─── Generate Track Pages ────────────────────────────────────────────────────

var sitemapEntries = [];

songs.forEach(function (s) {
  var genre      = s.genre || 'Other';
  var artist     = s.artist || s.subgenre || genre;
  var tslug      = slug(s.title + '-' + artist);
  var filename   = tslug + '-' + s.id + '.html';
  var canonUrl   = 'https://portal-music.com/tracks/' + filename;
  var gslug      = slug(genre);
  var icon       = (genresCfg[genre] && genresCfg[genre].icon) || '🎵';
  var desc       = 'Download "' + s.title + '" by ' + artist + ' free. Royalty-free ' +
                   genre.toLowerCase() + ' music for YouTube, videos, and creative projects. No copyright strikes ever.';

  // Related tracks: same genre, exclude self, up to 4
  var related = songs.filter(function (x) { return x.genre === genre && x.id !== s.id; }).slice(0, 4);

  var relatedRows = related.map(function (r) {
    var rslug = slug(r.title + '-' + (r.artist || r.subgenre || r.genre || ''));
    var rArtist = esc(r.artist || r.subgenre || genre);
    return '<div class="track-row">' +
      '<a href="/tracks/' + rslug + '-' + r.id + '.html" class="track-link">' +
        '<img src="' + esc(r.cover) + '" alt="' + esc(r.title) + '" class="track-thumb" width="60" height="60" loading="lazy">' +
        '<div class="track-info">' +
          '<span class="track-title">' + esc(r.title) + '</span>' +
          '<span class="track-artist">' + rArtist + '</span>' +
        '</div>' +
      '</a>' +
    '</div>';
  }).join('\n      ');

  var jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'MusicRecording',
    'name': s.title,
    'byArtist': { '@type': 'MusicGroup', 'name': artist },
    'genre': genre,
    'url': canonUrl,
    'image': s.cover,
    'description': desc,
    'license': 'https://portal-music.com/license.html',
    'isAccessibleForFree': true,
    ...(s.duration ? { 'duration': 'PT' + s.duration.replace(':', 'M') + 'S' } : {}),
  });

  var breadcrumbLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Home',  'item': 'https://portal-music.com/' },
      { '@type': 'ListItem', 'position': 2, 'name': icon + ' ' + genre, 'item': 'https://portal-music.com/genres/' + gslug + '.html' },
      { '@type': 'ListItem', 'position': 3, 'name': s.title, 'item': canonUrl },
    ]
  });

  var subgenreRow = s.subgenre ? '<li><strong>Style:</strong> ' + esc(s.subgenre) + '</li>\n          ' : '';
  var durationRow = s.duration ? '<li><strong>Duration:</strong> ' + esc(s.duration) + '</li>\n          ' : '';

  var html = `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(s.title)} — Free Download | Portal Music</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${canonUrl}">
  <link rel="icon" href="/images/portal.png" type="image/png">
  <meta property="og:title" content="${esc(s.title)} — Free Download | Portal Music">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${esc(s.cover)}">
  <meta property="og:url" content="${canonUrl}">
  <meta property="og:type" content="music.song">
  <meta property="og:site_name" content="Portal Music">
  <link rel="stylesheet" href="/css/styles.css">
  <script src="/js/app.js"></script>
  <script type="application/ld+json">${jsonLd}</script>
  <script type="application/ld+json">${breadcrumbLd}</script>
</head>
<body>

${sharedHeader()}

  <main>
    <div class="container track-page-container">

      <nav class="seo-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a> &rsaquo; <a href="/genres/${gslug}.html">${icon} ${esc(genre)}</a> &rsaquo; <span>${esc(s.title)}</span>
      </nav>

      <div class="track-page-hero">
        <img src="${esc(s.cover)}" alt="${esc(s.title)} cover art" class="track-page-cover" width="220" height="220">
        <div class="track-page-meta">
          <h1>${esc(s.title)}</h1>
          <p class="track-page-artist">by <a href="/browse.html?artist=${encodeURIComponent(artist)}">${esc(artist)}</a></p>
          <p class="track-page-genre"><a href="/genres/${gslug}.html">${icon} ${esc(genre)}</a></p>
          <div class="track-page-actions">
            <button class="hero-cta" id="track-play-btn">&#9654; Play</button>
            <a class="dl-btn" href="/download.html?file=${encodeURIComponent(s.file)}&title=${encodeURIComponent(s.title)}">&#11015; Download Free</a>
          </div>
          <p class="track-trust-note">&#9989; Free forever &mdash; YouTube, TikTok, Twitch, commercial use. <a href="/license.html">View license</a></p>
        </div>
      </div>

      <div class="track-page-info">
        <h2>About this track</h2>
        <p>${esc(desc)}</p>
        <ul class="track-details-list">
          <li><strong>Genre:</strong> <a href="/genres/${gslug}.html">${esc(genre)}</a></li>
          ${subgenreRow}<li><strong>Artist:</strong> <a href="/browse.html?artist=${encodeURIComponent(artist)}">${esc(artist)}</a></li>
          ${durationRow}<li><strong>License:</strong> <a href="/license.html">Free &mdash; No Copyright Strikes, Commercial Use OK</a></li>
          <li><strong>Platforms:</strong> YouTube, TikTok, Twitch, Instagram, Podcasts</li>
        </ul>
      </div>

${related.length ? `      <div class="related-tracks">
        <h2>More Free ${esc(genre)} Music</h2>
        <div class="track-list">
      ${relatedRows}
        </div>
        <a href="/genres/${gslug}.html" class="browse-link">Browse all ${esc(genre)} tracks &rarr;</a>
      </div>` : ''}

    </div>
  </main>

${sharedFooter()}

${sharedPlayer()}

  <script>
    // Auto-load this track in the player when page loads
    (function () {
      var song = ${JSON.stringify({ id: s.id, title: s.title, artist: artist, file: s.file, cover: s.cover, genre: genre })};
      document.getElementById('track-play-btn').addEventListener('click', function () {
        if (window.playSong) { window.playSong(song); }
      });
    })();
  </script>

</body>
</html>`;

  fs.writeFileSync('tracks/' + filename, html, 'utf8');
  sitemapEntries.push('  <url>\n    <loc>' + canonUrl + '</loc>\n    <priority>0.6</priority>\n    <changefreq>monthly</changefreq>\n  </url>');
});

console.log('Generated ' + songs.length + ' track pages in tracks/');

// ─── Generate sitemap-tracks.xml ────────────────────────────────────────────

var tracksSitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n\n' +
  sitemapEntries.join('\n\n') +
  '\n\n</urlset>\n';

fs.writeFileSync('sitemap-tracks.xml', tracksSitemap, 'utf8');
console.log('Generated sitemap-tracks.xml (' + songs.length + ' URLs)');

// ─── Update sitemap index ────────────────────────────────────────────────────

var sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://portal-music.com/sitemap.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://portal-music.com/sitemap-tracks.xml</loc>
  </sitemap>
</sitemapindex>
`;

fs.writeFileSync('sitemap-index.xml', sitemapIndex, 'utf8');
console.log('Generated sitemap-index.xml');
console.log('\nDone! Run from repo root, then commit the genres/, tracks/, sitemap-tracks.xml files.');
