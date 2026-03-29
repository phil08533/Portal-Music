// ============================================
// Portal Music — Application JavaScript
// ============================================

// --- Genre Config — loaded from data/genres.json ---
// Populated by loadGenres(); pages should await that before using GENRES.
let GENRES = {};

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
let currentQueue = [];
let currentIndex = -1;
let isPlaying = false;

function playSong(song, forceQueue = null) {
  currentSong = song;
  
  // Set the current queue. If not provided, we just play this song.
  if (forceQueue) {
    currentQueue = forceQueue;
    currentIndex = currentQueue.findIndex(s => s.id === song.id);
  } else if (currentQueue.length === 0) {
     currentQueue = [song];
     currentIndex = 0;
  }

  audio.src = song.file;
  audio.play().catch(() => { }); // gracefully handle autoplay policy
  isPlaying = true;
  _updatePlayerUI(song);
  addToRecent(song);
  _updateAllPlayBtns(song.id);
  _setupMediaSession(song);
}

function togglePlay() {
  if (!currentSong) return;
  if (isPlaying) {
    audio.pause();
  } else {
    audio.play().catch(() => { });
  }
}

// Called by track card play buttons — toggles if already active, otherwise starts
function handlePlayBtn(songOrId, queue) {
  // Support being called with just a song ID string (from event delegation)
  var songId = typeof songOrId === 'string' ? songOrId : songOrId.id;
  if (currentSong && String(currentSong.id) === String(songId)) {
    togglePlay();
    return;
  }
  // Find the song object from the queue or global view
  var song = typeof songOrId === 'object' ? songOrId : null;
  if (!song) {
    var pool = queue || window.currentSongsView || allSongs || [];
    song = pool.find(function(s) { return String(s.id) === String(songId); });
  }
  if (song) playSong(song, queue);
}

function playNext() {
  if (currentQueue.length === 0 || currentIndex === -1) return;
  currentIndex = (currentIndex + 1) % currentQueue.length;
  playSong(currentQueue[currentIndex], currentQueue);
}

function playPrev() {
  if (currentQueue.length === 0 || currentIndex === -1) return;
  currentIndex = (currentIndex - 1 + currentQueue.length) % currentQueue.length;
  playSong(currentQueue[currentIndex], currentQueue);
}

audio.addEventListener('play', () => { isPlaying = true; _updatePlayPauseBtn(); _updateAllPlayBtns(currentSong?.id); });
audio.addEventListener('pause', () => { isPlaying = false; _updatePlayPauseBtn(); _updateAllPlayBtns(currentSong?.id); });
audio.addEventListener('ended', () => { 
  isPlaying = false; 
  _updatePlayPauseBtn(); 
  _updateAllPlayBtns(null); 
  
  // Auto-play the next song if there is a queue
  if (currentQueue.length > 1) {
    playNext();
  }
});

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
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  audio.currentTime = pct * audio.duration;
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

function _setupMediaSession(song) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist || song.genre || 'Portal Music',
      artwork: [
        { src: song.cover || 'images/portal.png', sizes: '512x512', type: 'image/png' }
      ]
    });

    navigator.mediaSession.setActionHandler('play', () => { audio.play().catch(()=>{}); });
    navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); });
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
  }
}

function _updatePlayPauseBtn() {
  const btn = document.getElementById('play-pause-btn');
  if (btn) btn.textContent = isPlaying ? '⏸' : '▶';
}

function _updateAllPlayBtns(activeSongId) {
  document.querySelectorAll('.btn-play').forEach(btn => {
    const sid = btn.dataset.songId;
    const isActive = sid === String(activeSongId) && isPlaying;
    btn.innerHTML = isActive
      ? (btn.dataset.iconOnly ? '⏸' : '⏸ Pause')
      : (btn.dataset.iconOnly ? '▶' : '▶ Play');
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
  if (typeof window._fbSaveFavorites === 'function') window._fbSaveFavorites(favs);
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
  // Album art: use cover image if available, else gradient with icon
  const artContent = song.cover
    ? '<img src="' + _esc(song.cover) + '" alt="' + _esc(song.title) + '" loading="lazy">'
    : '<span class="art-icon">' + icon + '</span>';

  return (
    '<div class="music-card" data-id="' + song.id + '">' +
    '<div class="music-card-cover">' +
    artContent +
    '<button class="share-btn-cover" title="Share" onclick="event.stopPropagation();shareTrack(\'' + song.id + '\',\'' + song.title.replace(/'/g, "\\'") + '\')">&#x1F517;</button>' +
    '<button class="fav-btn ' + (faved ? 'active' : '') + '" ' +
    'data-song-id="' + song.id + '" ' +
    'onclick="event.stopPropagation();toggleFavorite(\'' + song.id + '\')" ' +
    'title="' + (faved ? 'Remove from favorites' : 'Add to favorites') + '">' +
    (faved ? '❤️' : '🤍') +
    '</button>' +
    '<button class="playlist-add-btn" title="Add to playlist" ' +
    'onclick="event.stopPropagation();showPlaylistMenu(\'' + song.id + '\',\'' + song.title.replace(/'/g, "\\'") + '\')">＋</button>' +
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
    '<button class="btn-play" data-song-id="' + song.id + '" onclick="handlePlayBtn(\'' + song.id + '\', window.currentSongsView)">' +
    (isPlaying && currentSong?.id === song.id ? '⏸ Pause' : '▶ Play') +
    '</button>' +
    '<a href="download.html?file=' + encodeURIComponent(song.file) + '&title=' + encodeURIComponent(song.title) + '&cover=' + encodeURIComponent(song.cover || '') + '" class="btn-dl" title="Download Free MP3" onclick="event.stopPropagation()">Download</a>' +
    '</div>' +
    '</div>'
  );
}

function shareTrack(id, title) {
  const url = 'https://portal-music.com/browse.html?track=' + encodeURIComponent(id);
  const text = '"' + title + '" \u2013 free music from Portal Music';
  if (navigator.share) {
    navigator.share({ title: title, text: text, url: url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => {
      _showToast('Link copied!');
    }).catch(() => {
      _showToast('portal-music.com');
    });
  }
}

// ============================================
// PLAYLIST MENU
// ============================================
async function showPlaylistMenu(songId, songTitle) {
  if (!window._fbUser) {
    _showToast('Sign in to add to playlists');
    return;
  }

  // Remove existing modal
  const existing = document.getElementById('pm-playlist-modal');
  if (existing) existing.remove();

  const playlists = await (window._fbGetPlaylists ? window._fbGetPlaylists() : []);

  const modal = document.createElement('div');
  modal.id = 'pm-playlist-modal';
  modal.className = 'pm-playlist-modal';
  modal.innerHTML =
    '<div class="pm-playlist-modal-box">' +
    '<div class="pm-playlist-modal-header">' +
    '<span>Add to playlist</span>' +
    '<button class="pm-playlist-close" onclick="document.getElementById(\'pm-playlist-modal\').remove()">✕</button>' +
    '</div>' +
    '<div class="pm-playlist-modal-title">' + _esc(songTitle) + '</div>' +
    '<div class="pm-playlist-list">' +
    (playlists.length === 0 ? '<div class="pm-playlist-empty">No playlists yet</div>' : '') +
    playlists.map(pl =>
      '<button class="pm-playlist-item" onclick="addSongToPlaylist(\'' + pl.id + '\',\'' + songId + '\',this)">' +
      (pl.songs && pl.songs.includes(String(songId)) ? '<span class="pm-pl-check">✓</span>' : '<span class="pm-pl-check"> </span>') +
      _esc(pl.name) + ' <span class="pm-pl-count">(' + (pl.songs ? pl.songs.length : 0) + ')</span></button>'
    ).join('') +
    '</div>' +
    '<div class="pm-new-row">' +
    '<input type="text" id="pm-new-playlist-input" class="pm-new-input" placeholder="New playlist name…" ' +
    'onkeydown="if(event.key===\'Enter\')createPlaylistAndAdd(\'' + songId + '\')">' +
    '<button class="pm-playlist-new" onclick="createPlaylistAndAdd(\'' + songId + '\')">Create</button>' +
    '</div>' +
    '</div>';

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

async function addSongToPlaylist(playlistId, songId, btn) {
  const checkEl = btn.querySelector('.pm-pl-check');
  const alreadyIn = checkEl && checkEl.textContent.trim() === '✓';
  if (alreadyIn) {
    await window._fbRemoveFromPlaylist(playlistId, songId);
    if (checkEl) checkEl.textContent = ' ';
    _showToast('Removed from playlist');
  } else {
    await window._fbAddToPlaylist(playlistId, songId);
    if (checkEl) checkEl.textContent = '✓';
    _showToast('Added to playlist');
  }
}

async function createPlaylistAndAdd(songId) {
  const inputEl = document.getElementById('pm-new-playlist-input');
  const name = inputEl ? inputEl.value.trim() : '';
  if (!name) {
    if (inputEl) { inputEl.focus(); inputEl.classList.add('pm-new-input-shake'); setTimeout(() => inputEl.classList.remove('pm-new-input-shake'), 400); }
    return;
  }

  // Free tier: max 2 playlists
  if (!window._fbIsPro) {
    const existing = await (window._fbGetPlaylists ? window._fbGetPlaylists() : []);
    if (existing.length >= 2) {
      document.getElementById('pm-playlist-modal')?.remove();
      if (confirm('Free accounts are limited to 2 playlists.\n\nUpgrade to Pro for unlimited playlists. Go to upgrade page?')) {
        window.location.href = 'upgrade.html';
      }
      return;
    }
  }

  const id = await window._fbCreatePlaylist(name);
  if (id) {
    await window._fbAddToPlaylist(id, songId);
    _showToast('Playlist "' + name + '" created!');
    document.getElementById('pm-playlist-modal')?.remove();
  }
}

function _showToast(msg) {
  let toast = document.getElementById('pm-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'pm-toast';
    toast.className = 'pm-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('pm-toast--show');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => { toast.classList.remove('pm-toast--show'); }, 2300);
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
let _genresLoaded = false;

async function loadGenres() {
  if (_genresLoaded) return GENRES;
  try {
    const res = await fetch('data/genres.json');
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();
    GENRES = data.genres || {};
    _genresLoaded = true;
  } catch {
    // fallback — GENRES stays as empty object
  }
  return GENRES;
}

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
// PAGE SETUP & INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  // Setup seek bar (mouse + touch)
  const track = document.getElementById('progress-track');
  if (track) {
    let _isDragging = false;
    track.addEventListener('mousedown', e => { _isDragging = true; seekTo(e); });
    document.addEventListener('mousemove', e => { if (_isDragging) seekTo(e); });
    document.addEventListener('mouseup', () => { _isDragging = false; });
    // Touch support
    track.addEventListener('touchstart', e => { e.preventDefault(); _isDragging = true; seekTo(e); }, { passive: false });
    document.addEventListener('touchmove', e => { if (_isDragging) { e.preventDefault(); seekTo(e); } }, { passive: false });
    document.addEventListener('touchend', () => { _isDragging = false; });
  }

  // Bind play/pause and skip buttons
  const ppBtn = document.getElementById('play-pause-btn');
  if (ppBtn) ppBtn.addEventListener('click', togglePlay);
  
  const prevBtn = document.getElementById('play-prev-btn');
  if (prevBtn) prevBtn.addEventListener('click', playPrev);
  
  const nextBtn = document.getElementById('play-next-btn');
  if (nextBtn) nextBtn.addEventListener('click', playNext);
  
  // Keyboard shortcuts (Spacebar, Arrows)
  document.addEventListener('keydown', e => {
    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      if (audio.currentTime > 5) audio.currentTime -= 5;
      else audio.currentTime = 0;
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      if (audio.duration && audio.currentTime < audio.duration - 5) audio.currentTime += 5;
    }
  });

  // Player favorite button
  const playerFav = document.getElementById('player-fav-btn');
  if (playerFav) {
    playerFav.addEventListener('click', () => {
      if (currentSong) toggleFavorite(currentSong.id);
    });
  }
  
  // Define header init function so SPA router can call it
  window.initHeaderElements = function() {
    // Theme toggle buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => setTheme(btn.dataset.theme));
    });

    // Setup search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        // Small debounce
        clearTimeout(searchInput._searchTimer);
        searchInput._searchTimer = setTimeout(() => {
          const query = e.target.value;
          const pool = window.allSongsRaw || window.allSongsPage || [];
          if (query) {
            const results = fuzzySearch(pool, query);
            if (typeof renderSimpleGrid === 'function') renderSimpleGrid(results);
          } else {
            // Empty query -> show all that match current filters (or everything)
            if (typeof renderBrowseFilters === 'function') renderBrowseFilters(pool);
          }
        }, 300);
      });
    }

    // More dropdown toggle
    const navMore = document.querySelector('.nav-more');
    if (navMore) {
      const moreBtn = navMore.querySelector('.nav-more-btn');
      moreBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        navMore.classList.toggle('open');
      });
      navMore.querySelector('.nav-more-dropdown').addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }

    // Re-bind auth button state after header replacement
    if (typeof window._renderAuthBtn === 'function') window._renderAuthBtn();

    // Highlight active nav link
    const navPath = window.location.pathname.split('/').pop() || 'index.html';
    const fullHref = navPath + window.location.search;
    document.querySelectorAll('.nav-links a').forEach(a => {
      a.classList.remove('active');
      const href = a.getAttribute('href') || '';
      if ((navPath === 'index.html' || navPath === '') && href === 'index.html') {
        a.classList.add('active');
      } else if (href === fullHref) {
        a.classList.add('active');
      } else if (href === navPath && !window.location.search) {
        a.classList.add('active');
      }
    });
  };
  
  // Run once immediately
  window.initHeaderElements();

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

  // Close More dropdown when clicking anywhere outside it
  document.addEventListener('click', function () {
    const navMore = document.querySelector('.nav-more');
    if (navMore) navMore.classList.remove('open');
  });

  // Cookie consent banner
  var cookieBanner = document.getElementById('cookie-banner');
  if (cookieBanner) {
    if (!localStorage.getItem('pm_cookie_ok')) {
      cookieBanner.style.display = 'flex';
    }
    var acceptBtn = document.getElementById('cookie-accept');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', function () {
        localStorage.setItem('pm_cookie_ok', '1');
        cookieBanner.style.display = 'none';
      });
    }
  }
});

// ============================================
// SPA ROUTER
// ============================================

document.addEventListener('click', e => {
  const link = e.target.closest('a');
  if (!link || !link.href) return;

  // Let browser handle external links, new tabs, special protocols, or downloads
  if (link.target === '_blank' || link.hasAttribute('download') || link.host !== window.location.host) return;
  if (!link.href.startsWith('http')) return;

  // Full page load for these pages — they have their own scripts that won't run in SPA context
  if (link.pathname.includes('download.html') || link.pathname.includes('profile.html') || link.pathname.includes('upgrade.html')) return;

  e.preventDefault();
  const url = link.href;

  // Don't fetch if we click the current active page exactly
  if (url === window.location.href) return;

  navigateTo(url);
});

window.addEventListener('popstate', () => {
  navigateTo(window.location.href, false);
});

async function navigateTo(url, pushState = true) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load page');
    const html = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const newMain = doc.querySelector('#main-content');
    if (!newMain) throw new Error('No #main-content found');

    const currentMain = document.getElementById('main-content');
    if (currentMain) {
      currentMain.innerHTML = newMain.innerHTML;
      
      // Update Title
      document.title = doc.title;

      // Update Header (Nav active states, search bar value, etc)
      const headerNav = doc.querySelector('header');
      if (headerNav) {
          const currentHeader = document.querySelector('header');
          if (currentHeader) currentHeader.innerHTML = headerNav.innerHTML;
      }
      
      // Update URL BEFORE executing scripts so they read correct params
      if (pushState) {
        window.history.pushState(null, '', url);
      }

      // Execute Scripts manually inside main-content
      const scripts = currentMain.querySelectorAll('script');
      scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
        newScript.appendChild(document.createTextNode(oldScript.innerHTML));
        oldScript.parentNode.replaceChild(newScript, oldScript);
      });
      
      // Re-init header elements (Theme bind, search bind) since header was replaced
      if (typeof window.initHeaderElements === 'function') {
        window.initHeaderElements();
      }

      window.scrollTo(0, 0);
    } else {
        window.location.href = url; // fallback
    }

  } catch (err) {
    console.error('SPA Error:', err);
    window.location.href = url; // Fallback to normal navigation
  }
}
