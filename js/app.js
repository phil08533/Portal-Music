// ============================================
// Portal Music — Application JavaScript
// ============================================

// --- Genre Config (main genres + sub-genres mapped from music folders) ---
const GENRES = {
  'Rock': { icon: '🎸', subgenres: ['Rock', 'Hard Rock', 'Hair Metal', 'Cinematic Rock', 'Punk Rock'] },
  'Jazz': { icon: '🎷', subgenres: ['Calm Jazz', 'Fast Jazz'] },
  'Hip-Hop': { icon: '🎤', subgenres: ['Hiphop'] },
  'Electronic': { icon: '🎛️', subgenres: ['Techno-Wave', 'Chillhop', 'dream-pop'] },
  'Cinematic': { icon: '🎬', subgenres: ['Cinematic', 'Dramatic', 'Fantasy', 'Space'] },
  'Classical': { icon: '🎻', subgenres: ['Classical', 'Romantic', 'medieval'] },
  'Country & Folk': { icon: '🤠', subgenres: ['Country', 'Bluegrass', 'Western'] },
  'Ambient & Chill': { icon: '🌊', subgenres: ['Peaceful', 'Meditative', 'Uplifting'] },
  'Dark & Suspense': { icon: '👻', subgenres: ['Horror', 'Suspenseful', 'Unsettling'] },
  'Playful & Mood': { icon: '🎭', subgenres: ['Playful', 'Sad', 'melancholy'] }
};

// Map each music folder name to its parent genre
const FOLDER_TO_PARENT = {};
Object.entries(GENRES).forEach(function (entry) {
  entry[1].subgenres.forEach(function (sub) { FOLDER_TO_PARENT[sub] = entry[0]; });
});

// --- Storage Keys ---
const THEME_KEY = 'pm_theme';
const RECENT_KEY = 'pm_recent';
const FAV_KEY = 'pm_favorites'; // sessionStorage — clears on tab close

// ============================================
// THEME SYSTEM
// ============================================
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

function initTheme() {
  setTheme(localStorage.getItem(THEME_KEY) || 'light');
}

// ============================================
// AUDIO PLAYER
// ============================================
const audio = new Audio();
let currentSong = null;
let isPlaying = false;

function playSong(song) {
  currentSong = song;
  audio.src = song.file;
  audio.play().catch(() => { }); // gracefully handle autoplay policy
  isPlaying = true;
  _updatePlayerUI(song);
  addToRecent(song);
  _updateAllPlayBtns(song.id);
}

function togglePlay() {
  if (!currentSong) return;
  if (isPlaying) {
    audio.pause();
  } else {
    audio.play().catch(() => { });
  }
}

audio.addEventListener('play', () => { isPlaying = true; _updatePlayPauseBtn(); _updateAllPlayBtns(currentSong?.id); });
audio.addEventListener('pause', () => { isPlaying = false; _updatePlayPauseBtn(); _updateAllPlayBtns(currentSong?.id); });
audio.addEventListener('ended', () => { isPlaying = false; _updatePlayPauseBtn(); _updateAllPlayBtns(null); });

audio.addEventListener('timeupdate', () => {
  const fill = document.getElementById('progress-fill');
  const timeEl = document.getElementById('player-time');
  if (!fill) return;
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  fill.style.width = pct + '%';
  if (timeEl) timeEl.textContent = _fmt(audio.currentTime) + ' / ' + _fmt(audio.duration || 0);
});

function seekTo(e) {
  const track = document.getElementById('progress-track');
  if (!track || !audio.duration) return;
  const rect = track.getBoundingClientRect();
  audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
}

function _updatePlayerUI(song) {
  const bar = document.getElementById('player-bar');
  if (!bar) return;
  bar.classList.add('visible');
  const titleEl = document.getElementById('player-title');
  const artistEl = document.getElementById('player-artist');
  const artEl = document.getElementById('player-art');
  if (titleEl) titleEl.textContent = song.title;
  if (artistEl) artistEl.textContent = song.artist || song.subgenre || song.genre || '';
  if (artEl) {
    if (song.cover) {
      artEl.innerHTML = '<img src="' + song.cover + '" alt="">';
    } else {
      artEl.textContent = '🎵';
    }
  }
  _updatePlayPauseBtn();
  _updatePlayerFavBtn(song.id);
}

function _updatePlayPauseBtn() {
  const btn = document.getElementById('play-pause-btn');
  if (btn) btn.textContent = isPlaying ? '⏸' : '▶';
}

function _updateAllPlayBtns(activeSongId) {
  document.querySelectorAll('.btn-play').forEach(btn => {
    const sid = btn.dataset.songId;
    const isActive = sid === String(activeSongId) && isPlaying;
    btn.innerHTML = isActive ? '⏸ Pause' : '▶ Play';
    btn.classList.toggle('playing', isActive);
  });
}

function _fmt(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return m + ':' + s;
}

// ============================================
// FAVORITES  (sessionStorage — clears on tab close)
// ============================================
function getFavorites() {
  return JSON.parse(sessionStorage.getItem(FAV_KEY) || '[]');
}

function toggleFavorite(songId) {
  let favs = getFavorites();
  const idx = favs.indexOf(String(songId));
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(String(songId));
  sessionStorage.setItem(FAV_KEY, JSON.stringify(favs));
  _updateFavBtnsFor(String(songId));
  _updatePlayerFavBtn(String(songId));
}

function isFavorited(songId) {
  return getFavorites().includes(String(songId));
}

function _updateFavBtnsFor(songId) {
  const faved = isFavorited(songId);
  document.querySelectorAll('.fav-btn[data-song-id="' + songId + '"]').forEach(btn => {
    btn.textContent = faved ? '❤️' : '🤍';
    btn.classList.toggle('active', faved);
    btn.title = faved ? 'Remove from favorites' : 'Add to favorites';
  });
}

function _updatePlayerFavBtn(songId) {
  const btn = document.getElementById('player-fav-btn');
  if (!btn) return;
  const faved = isFavorited(songId);
  btn.textContent = faved ? '❤️' : '🤍';
  btn.classList.toggle('active', faved);
  btn.dataset.songId = songId;
}

// ============================================
// RECENTLY PLAYED  (localStorage — persists)
// ============================================
function addToRecent(song) {
  let recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  recent = [song, ...recent.filter(s => String(s.id) !== String(song.id))].slice(0, 10);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

function getRecent() {
  return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
}

// ============================================
// FUZZY SEARCH
// ============================================
function _levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function _scoreSong(song, query) {
  const q = query.toLowerCase().trim();
  const title = song.title.toLowerCase();
  const genre = (song.genre || '').toLowerCase();
  const sub = (song.subgenre || '').toLowerCase();
  const artist = (song.artist || '').toLowerCase();
  const tags = (song.tags || []).map(t => t.toLowerCase());

  let score = 0;

  // — Exact / near-exact matches (highest priority) —
  if (title === q) score += 100;
  else if (title.startsWith(q)) score += 85;
  else if (title.includes(q)) score += 70;

  // — Artist match —
  if (artist === q) score += 95;
  else if (artist.includes(q)) score += 60;

  // — Genre / sub-genre match —
  if (genre === q || genre.includes(q)) score += 70;
  if (sub === q || sub.includes(q)) score += 65;

  // — Tag match —
  if (tags.some(t => t === q)) score += 60;
  if (tags.some(t => t.includes(q))) score += 40;

  // — Multi-word: score each query word separately —
  const qWords = q.split(/\s+/).filter(w => w.length >= 2);
  const targets = [title, genre, sub, artist, ...tags].filter(Boolean);

  for (const qw of qWords) {
    for (const tgt of targets) {
      const tWords = tgt.split(/\s+/);
      for (const tw of tWords) {
        if (tw === qw) { score += 30; break; }
        if (tw.startsWith(qw)) { score += 20; break; }
        if (tw.includes(qw)) { score += 12; break; }
        // Fuzzy: Levenshtein for longer words
        if (qw.length >= 4 && tw.length >= 4) {
          const dist = _levenshtein(qw, tw);
          if (dist === 1) score += 18;
          else if (dist === 2 && qw.length >= 6) score += 8;
        }
      }
    }
  }

  return score;
}

function fuzzySearch(songs, query) {
  const q = query.trim();
  if (!q) return songs;
  return songs
    .map(song => ({ song, score: _scoreSong(song, q) }))
    .filter(({ score }) => score > 8)
    .sort((a, b) => b.score - a.score)
    .map(({ song }) => song);
}

// ============================================
// TRACK CARD RENDERER
// ============================================
function createTrackCard(song) {
  const faved = isFavorited(song.id);
  const icon = GENRES[song.genre]?.icon || '🎵';
  const tagsStr = (song.tags || []).slice(0, 3).join(', ');
  const artistEl = song.artist
    ? '<div class="artist-name">' + _esc(song.artist) + '</div>'
    : '';
  const subEl = song.subgenre
    ? '<span class="badge subgenre">' + _esc(song.subgenre) + '</span>'
    : '';
  // Safely encode song data for inline onclick
  const songJson = _esc(JSON.stringify(song));

  // Album art: use cover image if available, else gradient with icon
  const artContent = song.cover
    ? '<img src="' + _esc(song.cover) + '" alt="' + _esc(song.title) + '" loading="lazy">'
    : '<span class="art-icon">' + icon + '</span>';

  return (
    '<div class="music-card" data-id="' + song.id + '">' +
    '<div class="music-card-cover">' +
    artContent +
    '<button class="fav-btn ' + (faved ? 'active' : '') + '" ' +
    'data-song-id="' + song.id + '" ' +
    'onclick="event.stopPropagation();toggleFavorite(\'' + song.id + '\')" ' +
    'title="' + (faved ? 'Remove from favorites' : 'Add to favorites') + '">' +
    (faved ? '❤️' : '🤍') +
    '</button>' +
    '</div>' +
    '<div class="music-card-body">' +
    '<h3>' + _esc(song.title) + '</h3>' +
    artistEl +
    '<div class="meta">' +
    '<span class="badge">' + _esc(song.genre || '') + '</span>' +
    subEl +
    '</div>' +
    (tagsStr ? '<div class="tags">' + _esc(tagsStr) + '</div>' : '') +
    '</div>' +
    '<div class="card-actions">' +
    '<button class="btn-play" data-song-id="' + song.id + '" ' +
    'onclick=\'playSong(' + songJson + ')\'>▶ Play</button>' +
    '<a class="btn-dl" ' +
    'href="download.html?file=' + encodeURIComponent(song.file) +
    '&title=' + encodeURIComponent(song.title) + '">Download</a>' +
    '</div>' +
    '</div>'
  );
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================
// DATA LOADING
// ============================================
let allSongs = [];

async function loadSongs() {
  try {
    const res = await fetch('data/music.json');
    if (!res.ok) throw new Error('Not found');
    allSongs = await res.json();
    return allSongs;
  } catch {
    return [];
  }
}

// ============================================
// INIT — runs on every page
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  // Theme toggle buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });

  // Player seek bar
  const track = document.getElementById('progress-track');
  if (track) track.addEventListener('click', seekTo);

  // Player play/pause
  const ppBtn = document.getElementById('play-pause-btn');
  if (ppBtn) ppBtn.addEventListener('click', togglePlay);

  // Player favorite button
  const playerFav = document.getElementById('player-fav-btn');
  if (playerFav) {
    playerFav.addEventListener('click', () => {
      if (currentSong) toggleFavorite(currentSong.id);
    });
  }

  // Favorites banner dismiss
  const dismissBtn = document.getElementById('fav-banner-dismiss');
  if (dismissBtn) {
    // Auto-hide if dismissed this session
    if (sessionStorage.getItem('pm_banner_ok')) {
      const banner = document.getElementById('fav-banner');
      if (banner) banner.style.display = 'none';
    }
    dismissBtn.addEventListener('click', () => {
      const banner = document.getElementById('fav-banner');
      if (banner) banner.style.display = 'none';
      sessionStorage.setItem('pm_banner_ok', '1');
    });
  }

  // Highlight active nav link
  const path = window.location.pathname.split('/').pop() || 'index.html';
  const fullHref = path + window.location.search;

  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href') || '';
    // Special case for Index
    if ((path === 'index.html' || path === '') && href === 'index.html') {
      a.classList.add('active');
    } else if (href === fullHref) {
      a.classList.add('active');
    } else if (href === path && !window.location.search) {
      a.classList.add('active');
    }
  });
});
