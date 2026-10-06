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
fs.mkdirSync('use', { recursive: true });

// AI tags (admin 🏷️ Tags → Publish) and sound-alike tracks; both optional
const tagDict  = fs.existsSync('data/tags.json') ? JSON.parse(fs.readFileSync('data/tags.json', 'utf8')) : { tags: [], facets: {} };
const similar  = fs.existsSync('data/similar.json') ? JSON.parse(fs.readFileSync('data/similar.json', 'utf8')) : {};
const TAG      = Object.fromEntries(tagDict.tags.map(function (t) { return [t.id, t]; }));
const songById = Object.fromEntries(songs.map(function (s) { return [s.id, s]; }));
const USE_PAGE_MIN = 6;   // a "Best for" page needs at least this many tracks
const useTracks = {};
songs.forEach(function (s) {
  (s.labels || []).forEach(function (id) {
    if (TAG[id] && TAG[id].facet === 'use') (useTracks[id] = useTracks[id] || []).push(s);
  });
});
const usePageIds = Object.keys(useTracks).filter(function (id) { return useTracks[id].length >= USE_PAGE_MIN; });

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

function trackHref(s) {
  return '/tracks/' + slug(s.title + '-' + (s.artist || s.subgenre || s.genre || 'Other')) + '-' + s.id + '.html';
}

function tagsOf(s, facet) {
  return (s.labels || []).map(function (id) { return TAG[id]; })
    .filter(function (t) { return t && (!facet || t.facet === facet); });
}

function listWords(words) {
  if (words.length <= 1) return words.join('');
  return words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
}

function plainLabel(t) {
  return t.label.toLowerCase().replace(/\s*\(.*\)/, '');
}

// A readable description from the AI tags, e.g. "A dark, tense cinematic track with piano
// and strings (instrumental). Great for horror, true crime and trailers."
function describeTrack(s) {
  if (!(s.labels || []).length) return null;
  var moods = tagsOf(s, 'mood').slice(0, 2).map(plainLabel);
  var style = tagsOf(s, 'style').slice(0, 1).map(plainLabel)[0] || (s.genre || 'music').toLowerCase();
  var inst = tagsOf(s, 'instrument').slice(0, 2).map(plainLabel);
  var vocal = tagsOf(s, 'vocals')[0];
  var uses = tagsOf(s, 'use').slice(0, 3).map(plainLabel);
  var words = (moods.length ? moods.join(', ') + ' ' : '') + style;
  var first = (/^[aeiou]/.test(words) ? 'An ' : 'A ') + words + ' track' +
    (inst.length ? ' with ' + listWords(inst) : '') +
    (vocal ? (vocal.id === 'instrumental' ? ' (instrumental)' : ' with vocals') : '') + '.';
  return first + (uses.length ? ' Great for ' + listWords(uses) + '.' : '');
}

function tagLink(t) {
  if (t.facet === 'use' && usePageIds.indexOf(t.id) !== -1) return '/use/' + t.id + '.html';
  return '/browse.html?q=' + encodeURIComponent(plainLabel(t));
}

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
        ${usePageIds.length ? '<a href="/use/">Music by use</a>\n        ' : ''}<a href="/license.html">License</a>
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
  <link rel="icon" href="/images/favicon-32.png" type="image/png" sizes="32x32">
  <link rel="icon" href="/images/favicon-16.png" type="image/png" sizes="16x16">
  <link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta name="theme-color" content="#080812">
  <meta property="og:title" content="Free ${esc(genre)} Music Downloads — Portal Music">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="https://portal-music.com/images/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
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
  var about      = describeTrack(s);
  var desc       = about
    ? ('Free download: "' + s.title + '". ' + about + ' Royalty-free, no copyright strikes.')
    : ('Download "' + s.title + '"' + (s.artist ? ' by ' + s.artist : '') + ' free. Royalty-free ' +
       genre.toLowerCase() + ' music for YouTube, videos, and creative projects. No copyright strikes ever.');

  // Similar tracks: sound-alikes from the AI analysis, otherwise the same genre
  var sim = (similar[s.id] || []).map(function (id) { return songById[id]; }).filter(Boolean).slice(0, 6);
  var related = sim.length ? sim : songs.filter(function (x) { return x.genre === genre && x.id !== s.id; }).slice(0, 4);

  // Tag chips, grouped (each opens a search or a "Best for" page)
  var tagGroups = ['use', 'mood', 'style', 'instrument', 'energy', 'vocals', 'tempo'].map(function (facet) {
    var ts = tagsOf(s, facet);
    if (!ts.length) return '';
    return '<div class="track-tag-group"><span class="track-tag-facet">' + esc((tagDict.facets[facet] || {}).label || facet) + '</span> ' +
      ts.map(function (t) { return '<a class="track-tag" href="' + tagLink(t) + '">' + esc(t.label) + '</a>'; }).join(' ') + '</div>';
  }).filter(Boolean).join('\n          ');

  var relatedRows = related.map(function (r) {
    var rArtist = esc(r.artist || r.subgenre || genre);
    return '<div class="track-row">' +
      '<a href="' + trackHref(r) + '" class="track-link">' +
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
    'byArtist': { '@type': 'MusicGroup', 'name': s.artist || 'Portal Music' },
    'genre': genre,
    ...((s.labels || []).length ? { 'keywords': tagsOf(s).map(function (t) { return t.label; }).join(', ') } : {}),
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
  var durationRow = s.duration ? '<li><strong>Length:</strong> ' + esc(s.duration) + '</li>\n          ' : '';
  var tempoRow = s.bpm ? '<li><strong>Tempo:</strong> ' + esc(s.bpm) + ' BPM' + (s.key ? ' &middot; key of ' + esc(s.key) : '') + '</li>\n          ' : '';
  var artistRow = s.artist ? '<li><strong>Artist:</strong> <a href="/browse.html?artist=' + encodeURIComponent(s.artist) + '">' + esc(s.artist) + '</a></li>\n          ' : '';

  var html = `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(s.title)} — Free Download | Portal Music</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${canonUrl}">
  <link rel="icon" href="/images/favicon-32.png" type="image/png" sizes="32x32">
  <link rel="icon" href="/images/favicon-16.png" type="image/png" sizes="16x16">
  <link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta name="theme-color" content="#080812">
  <meta property="og:title" content="${esc(s.title)} — Free Download | Portal Music">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${esc(s.cover)}">
  <meta name="twitter:card" content="summary">
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
          ${s.artist ? `<p class="track-page-artist">by <a href="/browse.html?artist=${encodeURIComponent(s.artist)}">${esc(s.artist)}</a></p>` : ''}
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
        <p>${esc(about || desc)}</p>
${tagGroups ? `        <div class="track-tags">
          ${tagGroups}
        </div>
` : ''}        <ul class="track-details-list">
          <li><strong>Genre:</strong> <a href="/genres/${gslug}.html">${esc(genre)}</a></li>
          ${subgenreRow}${artistRow}${durationRow}${tempoRow}<li><strong>License:</strong> <a href="/license.html">Free &mdash; No Copyright Strikes, Commercial Use OK</a></li>
          <li><strong>Platforms:</strong> YouTube, TikTok, Twitch, Instagram, Podcasts</li>
        </ul>
      </div>

${related.length ? `      <div class="related-tracks">
        <h2>${sim.length ? 'Similar Tracks' : 'More Free ' + esc(genre) + ' Music'}</h2>
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
      var song = ${JSON.stringify({ id: s.id, title: s.title, artist: s.artist || '', file: s.file, cover: s.cover, genre: genre })};
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

// ─── Stale track pages → redirects ──────────────────────────────────────────
// Pages from renamed, re-IDed or deleted tracks become small redirects (to the
// same track's current page when it still exists, otherwise to Browse), so old
// links and search results keep working instead of showing outdated content.

var currentPages = new Set(sitemapEntries.map(function (e) { return e.match(/tracks\/([^<]+)</)[1]; }));
var pageById = {}, pageByTitle = {};
songs.forEach(function (s) {
  var page = slug(s.title + '-' + (s.artist || s.subgenre || s.genre || 'Other')) + '-' + s.id + '.html';
  pageById[s.id] = page;
  pageByTitle[String(s.title).toLowerCase().replace(/[^a-z0-9]/g, '')] = page;
});

function decodeEntities(str) {
  return str.replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(n); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); })
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

var redirected = 0;
// Old track ID → current track ID, so favorites/playlists saved before a
// re-import still resolve (used by js/firebase-auth.js)
var idMap = fs.existsSync('data/id-map.json') ? JSON.parse(fs.readFileSync('data/id-map.json', 'utf8')) : {};
fs.readdirSync('tracks').forEach(function (file) {
  if (!file.endsWith('.html') || currentPages.has(file)) return;
  var old = fs.readFileSync('tracks/' + file, 'utf8');
  var idMatch = file.match(/-([a-z0-9]+)\.html$/);
  var titleMatch = old.match(/<h1[^>]*>([^<]+)/) || old.match(/<title>([^<]+?) — /);
  var title = titleMatch ? decodeEntities(titleMatch[1]).trim() : '';
  var titleKey = title.toLowerCase().replace(/[^a-z0-9]/g, '');
  var target = (idMatch && pageById[idMatch[1]]) || pageByTitle[titleKey];
  var url = target ? '/tracks/' + target : '/browse.html';
  var newId = target && target.match(/-([a-z0-9]+)\.html$/);
  if (idMatch && newId && idMatch[1] !== newId[1]) idMap[idMatch[1]] = newId[1];
  var name = target && title ? esc(title) : 'Browse Music';
  var html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '  <meta charset="UTF-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '  <meta name="robots" content="noindex">\n' +
    '  <meta http-equiv="refresh" content="0; url=' + url + '">\n' +
    '  <link rel="canonical" href="https://portal-music.com' + url + '">\n' +
    '  <title>' + name + ' — Portal Music</title>\n' +
    '</head>\n<body style="font-family:sans-serif;text-align:center;padding:50px;">\n' +
    '  <p>This page has moved to <a href="' + url + '">' + name + '</a>. Redirecting…</p>\n' +
    '</body>\n</html>\n';
  if (html !== old) { fs.writeFileSync('tracks/' + file, html, 'utf8'); redirected++; }
});
if (redirected) console.log('Updated ' + redirected + ' stale track page(s) to redirects');
// Resolve chains (a → b → c) and drop entries that point at the ID itself
Object.keys(idMap).forEach(function (k) {
  var v = idMap[k], hops = 0;
  while (idMap[v] && hops++ < 10) v = idMap[v];
  if (v === k) delete idMap[k]; else idMap[k] = v;
});
fs.writeFileSync('data/id-map.json', JSON.stringify(idMap), 'utf8');
console.log('Wrote data/id-map.json (' + Object.keys(idMap).length + ' old IDs)');

// ─── "Best for" pages: /use/<tag>.html ──────────────────────────────────────
// One page per "Best for" tag with enough tracks (e.g. "Free Horror Background
// Music"), built from the AI tags. Pages whose tag drops below the minimum become
// redirects to the matching search, so links and search results keep working.

var useEntries = [];
var keepUse = {};

function useScore(s, t) {   // tracks whose supporting moods/styles are also there come first
  return (t.imply || []).filter(function (id) { return (s.labels || []).indexOf(id) !== -1; }).length + (s.featured ? 0.5 : 0);
}

usePageIds.forEach(function (id) {
  var t = TAG[id];
  var list = useTracks[id].slice().sort(function (a, b) { return useScore(b, t) - useScore(a, t) || a.title.localeCompare(b.title); });
  var title = t.title || ('Free ' + t.label + ' Music');
  var url = 'https://portal-music.com/use/' + id + '.html';
  var desc = title + ': ' + list.length + ' royalty-free tracks. ' + (t.desc || '') + ' Free for YouTube, TikTok, Twitch and commercial use. No copyright strikes.';
  var rows = list.map(function (s) {
    var why = tagsOf(s, 'mood').slice(0, 2).concat(tagsOf(s, 'style').slice(0, 1)).map(plainLabel).join(', ');
    return '<div class="track-row">' +
      '<a href="' + trackHref(s) + '" class="track-link">' +
        '<img src="' + esc(s.cover) + '" alt="' + esc(s.title) + '" class="track-thumb" width="60" height="60" loading="lazy">' +
        '<div class="track-info">' +
          '<span class="track-title">' + esc(s.title) + '</span>' +
          '<span class="track-artist">' + esc([why, s.duration].filter(Boolean).join(' · ') || s.genre) + '</span>' +
        '</div>' +
      '</a>' +
      '<a class="dl-btn-small" href="/download.html?file=' + encodeURIComponent(s.file) + '&title=' + encodeURIComponent(s.title) + '">⬇ Download</a>' +
    '</div>';
  }).join('\n    ');
  var faq = [
    ['Can I use these tracks in monetized videos?', 'Yes. Every track is free for monetized YouTube videos, TikTok, Twitch, podcasts and commercial projects.'],
    ['Do I have to credit Portal Music?', 'No, credit is optional. If you want to, the download page gives you a ready-to-paste credit line.'],
    ['Will I get a copyright claim?', 'No. Portal Music never files Content ID claims or copyright strikes on any platform.'],
  ];
  var faqLd = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': faq.map(function (q) {
    return { '@type': 'Question', 'name': q[0], 'acceptedAnswer': { '@type': 'Answer', 'text': q[1] } };
  }) });
  var pageLd = JSON.stringify({ '@context': 'https://schema.org', '@type': 'CollectionPage', 'name': title, 'description': desc, 'url': url, 'numberOfItems': list.length });
  var others = usePageIds.filter(function (o) { return o !== id; }).map(function (o) {
    return '          <a href="/use/' + o + '.html" class="genre-pill">' + esc(TAG[o].label) + '</a>';
  }).join('\n');

  var html = `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — Portal Music</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${url}">
  <link rel="icon" href="/images/favicon-32.png" type="image/png" sizes="32x32">
  <link rel="icon" href="/images/favicon-16.png" type="image/png" sizes="16x16">
  <link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta name="theme-color" content="#080812">
  <meta property="og:title" content="${esc(title)} — Portal Music">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="https://portal-music.com/images/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta property="og:url" content="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Portal Music">
  <link rel="stylesheet" href="/css/styles.css">
  <script src="/js/app.js"></script>
  <script type="application/ld+json">${pageLd}</script>
  <script type="application/ld+json">${faqLd}</script>
</head>
<body>

${sharedHeader('browse')}

  <main>
    <div class="container">

      <nav class="seo-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a> &rsaquo; <a href="/use/">Music by use</a> &rsaquo; <span>${esc(t.label)}</span>
      </nav>

      <div class="browse-header">
        <h1>${esc(title)}</h1>
        <p class="browse-subtitle">${list.length} free tracks &mdash; no copyright strikes, commercial use OK.</p>
      </div>

      <p class="seo-intro">${esc(t.desc || '')} Every track below is free to download and use in monetized videos, streams and client work.</p>

      <div style="margin:1rem 0 1.5rem;">
        <a href="/browse.html?q=${encodeURIComponent(plainLabel(t))}" class="hero-cta">&#9654; Listen in the player</a>
      </div>

      <div class="track-list" id="track-list">
    ${rows}
      </div>

      <div class="seo-faq">
        <h2>Questions</h2>
${faq.map(function (q) { return '        <h3>' + esc(q[0]) + '</h3>\n        <p>' + esc(q[1]) + '</p>'; }).join('\n')}
      </div>

${others ? `      <div class="seo-link-section">
        <h2>Free Music For…</h2>
        <div class="genre-link-row">
${others}
        </div>
      </div>` : ''}

    </div>
  </main>

${sharedFooter()}

${sharedPlayer()}

</body>
</html>`;

  fs.writeFileSync('use/' + id + '.html', html, 'utf8');
  keepUse[id + '.html'] = true;
  useEntries.push('  <url>\n    <loc>' + url + '</loc>\n    <priority>0.8</priority>\n    <changefreq>weekly</changefreq>\n  </url>');
});

// Hub page listing every "Best for" page
if (usePageIds.length) {
  var hubLinks = usePageIds.map(function (id) {
    return '        <a href="/use/' + id + '.html" class="genre-pill">' + esc(TAG[id].label) + ' <small>(' + useTracks[id].length + ')</small></a>';
  }).join('\n');
  fs.writeFileSync('use/index.html', `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Free Music by Use — Horror, Vlogs, Gaming, Podcasts &amp; More — Portal Music</title>
  <meta name="description" content="Find free, royalty-free music by what you're making: horror, vlogs, gaming, podcasts, studying, trailers and more. No copyright strikes.">
  <link rel="canonical" href="https://portal-music.com/use/">
  <link rel="icon" href="/images/favicon-32.png" type="image/png" sizes="32x32">
  <link rel="stylesheet" href="/css/styles.css">
  <script src="/js/app.js"></script>
</head>
<body>

${sharedHeader('browse')}

  <main>
    <div class="container">
      <div class="browse-header">
        <h1>Free Music for What You're Making</h1>
        <p class="browse-subtitle">Pick your project. Every track is free, royalty-free and safe from copyright claims.</p>
      </div>
      <div class="genre-link-row">
${hubLinks}
      </div>
      <p class="seo-intro" style="margin-top:1.5rem;">Can't find it? <a href="/browse.html">Describe the sound you need</a> and we'll match it.</p>
    </div>
  </main>

${sharedFooter()}

${sharedPlayer()}

</body>
</html>`, 'utf8');
  keepUse['index.html'] = true;
  useEntries.unshift('  <url>\n    <loc>https://portal-music.com/use/</loc>\n    <priority>0.7</priority>\n    <changefreq>weekly</changefreq>\n  </url>');
}

// Pages for tags that no longer have enough tracks → redirect to the matching search
fs.readdirSync('use').forEach(function (file) {
  if (!file.endsWith('.html') || keepUse[file]) return;
  var id = file.replace(/\.html$/, '');
  var target = TAG[id] ? '/browse.html?q=' + encodeURIComponent(plainLabel(TAG[id])) : '/browse.html';
  fs.writeFileSync('use/' + file, '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n' +
    '  <meta name="robots" content="noindex">\n  <meta http-equiv="refresh" content="0; url=' + target + '">\n' +
    '  <title>Portal Music</title>\n</head>\n<body><p><a href="' + target + '">Continue to Portal Music</a></p></body>\n</html>\n', 'utf8');
});
console.log('Generated ' + usePageIds.length + ' "Best for" pages in use/');

// ─── Generate sitemap-tracks.xml ────────────────────────────────────────────

var genreEntries = Object.keys(byGenre).map(function (genre) {
  return '  <url>\n    <loc>https://portal-music.com/genres/' + slug(genre) + '.html</loc>\n    <priority>0.8</priority>\n    <changefreq>weekly</changefreq>\n  </url>';
});

var tracksSitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n\n' +
  genreEntries.concat(useEntries, sitemapEntries).join('\n\n') +
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
