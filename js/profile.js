// ============================================
// Portal Music — Profile Page
// ============================================

(function () {
  var _songs = [];
  var _playlists = [];

  // firebase-auth.js dispatches 'portalAuthReady' once onAuthStateChanged resolves.
  // Module scripts (firebase-auth.js) run AFTER regular scripts, so we always
  // need to wait for the event — never assume auth is already known at this point.
  window.addEventListener('portalAuthReady', function () {
    initProfile();
  }, { once: true });

  // Stable reference so the sign-in button can re-register after sign-in popup
  window._initProfileFn = initProfile;

  async function initProfile() {
    if (!window._fbUser) {
      document.getElementById('profile-signed-out').style.display = 'block';
      return;
    }

    document.getElementById('profile-signed-in').style.display = 'block';

    var user = window._fbUser;

    // Avatar
    if (user.photoURL) {
      var img = document.getElementById('profile-avatar');
      img.src = user.photoURL;
      img.style.display = 'block';
      document.getElementById('profile-avatar-fallback').style.display = 'none';
    }

    // Name + email
    document.getElementById('profile-name').textContent  = user.displayName || 'Anonymous';
    document.getElementById('profile-email').textContent = user.email || '';

    // Load songs catalog
    _songs = await loadSongs();
    window.currentSongsView = _songs;

    // Render all sections
    await renderFavorites();
    await renderPlaylists();
    renderRecent();

    // Update stats
    updateStats();
  }

  // ── Favorites ──────────────────────────────────────────────────────────
  async function renderFavorites() {
    var favIds  = getFavorites();
    var favSongs = favIds.map(function (id) {
      return _songs.find(function (s) { return String(s.id) === String(id); });
    }).filter(Boolean);

    var grid  = document.getElementById('profile-favorites-grid');
    var empty = document.getElementById('profile-favorites-empty');

    if (favSongs.length === 0) {
      grid.style.display  = 'none';
      empty.style.display = 'block';
      return;
    }

    grid.style.display  = '';
    empty.style.display = 'none';
    window.currentSongsView = favSongs;
    grid.innerHTML = favSongs.map(function (s) { return createTrackCard(s); }).join('');
  }

  // ── Playlists ───────────────────────────────────────────────────────────
  async function renderPlaylists() {
    _playlists = await (window._fbGetPlaylists ? window._fbGetPlaylists() : []);

    var container = document.getElementById('profile-playlists');
    var empty     = document.getElementById('profile-playlists-empty');

    if (_playlists.length === 0) {
      container.style.display = 'none';
      empty.style.display     = 'block';
      return;
    }

    container.style.display = '';
    empty.style.display     = 'none';
    container.innerHTML = _playlists.map(function (pl) {
      return renderPlaylistCard(pl);
    }).join('');
  }

  function renderPlaylistCard(pl) {
    var count = pl.songs ? pl.songs.length : 0;
    // Get cover of first song in playlist
    var cover = '';
    if (pl.songs && pl.songs.length > 0) {
      var firstSong = _songs.find(function (s) { return s.id === pl.songs[0]; });
      if (firstSong && firstSong.cover) cover = firstSong.cover;
    }

    return (
      '<div class="playlist-card" data-playlist-id="' + pl.id + '">' +
      '<div class="playlist-card-art" onclick="togglePlaylistTracks(\'' + pl.id + '\')">' +
      (cover ? '<img src="' + _esc(cover) + '" alt="">' : '<div class="playlist-art-placeholder">♫</div>') +
      '<div class="playlist-play-overlay">▶</div>' +
      '</div>' +
      '<div class="playlist-card-info">' +
      '<div class="playlist-card-name">' + _esc(pl.name) + '</div>' +
      '<div class="playlist-card-count">' + count + ' track' + (count !== 1 ? 's' : '') + '</div>' +
      '</div>' +
      '<div class="playlist-card-actions">' +
      '<button class="playlist-action-btn" title="Play all" onclick="playPlaylist(\'' + pl.id + '\')">▶ Play</button>' +
      '<button class="playlist-action-btn" title="Rename" onclick="renamePlaylist(\'' + pl.id + '\',\'' + _esc(pl.name) + '\')">✏</button>' +
      '<button class="playlist-action-btn danger" title="Delete" onclick="deletePlaylist(\'' + pl.id + '\')">🗑</button>' +
      '</div>' +
      '<div class="playlist-tracks" id="pl-tracks-' + pl.id + '" style="display:none;"></div>' +
      '</div>'
    );
  }

  // ── Playlist actions ────────────────────────────────────────────────────
  window.togglePlaylistTracks = function (playlistId) {
    var el = document.getElementById('pl-tracks-' + playlistId);
    if (!el) return;
    if (el.style.display === 'none') {
      var pl = _playlists.find(function (p) { return p.id === playlistId; });
      if (!pl) return;
      var songs = (pl.songs || []).map(function (id) {
        return _songs.find(function (s) { return String(s.id) === String(id); });
      }).filter(Boolean);

      if (songs.length === 0) {
        el.innerHTML = '<p class="profile-empty">No tracks in this playlist yet.</p>';
      } else {
        window.currentSongsView = songs;
        el.innerHTML = '<div class="playlist-track-list">' +
          songs.map(function (s) {
            return (
              '<div class="playlist-track-item">' +
              '<button class="btn-play playlist-track-play" data-song-id="' + s.id + '" data-icon-only="1" ' +
              'onclick="handlePlayBtn(\'' + s.id + '\', window.currentSongsView)">▶</button>' +
              '<span class="playlist-track-name">' + _esc(s.title) + '</span>' +
              '<span class="playlist-track-artist">' + _esc(s.artist || s.genre || '') + '</span>' +
              '<button class="playlist-track-remove" title="Remove" ' +
              'onclick="removeFromPlaylistUI(\'' + playlistId + '\',\'' + s.id + '\',this)">✕</button>' +
              '</div>'
            );
          }).join('') +
          '</div>';
      }
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  };

  window.playPlaylist = function (playlistId) {
    var pl = _playlists.find(function (p) { return p.id === playlistId; });
    if (!pl || !pl.songs || pl.songs.length === 0) { _showToast('Playlist is empty'); return; }
    var songs = pl.songs.map(function (id) {
      return _songs.find(function (s) { return String(s.id) === String(id); });
    }).filter(Boolean);
    if (songs.length === 0) return;
    window.currentSongsView = songs;
    playSong(songs[0], songs);
  };

  window.renamePlaylist = async function (playlistId, currentName) {
    var name = prompt('Rename playlist:', currentName);
    if (!name || !name.trim() || name.trim() === currentName) return;
    await window._fbRenamePlaylist(playlistId, name);
    await renderPlaylists();
    updateStats();
  };

  window.deletePlaylist = async function (playlistId) {
    if (!confirm('Delete this playlist?')) return;
    await window._fbDeletePlaylist(playlistId);
    await renderPlaylists();
    updateStats();
  };

  window.removeFromPlaylistUI = async function (playlistId, songId, btn) {
    await window._fbRemoveFromPlaylist(playlistId, songId);
    // Remove the track row from DOM
    var row = btn.closest('.playlist-track-item');
    if (row) row.remove();
    // Update count in playlist object
    var pl = _playlists.find(function (p) { return p.id === playlistId; });
    if (pl) pl.songs = (pl.songs || []).filter(function (id) { return id !== String(songId); });
    _showToast('Removed from playlist');
    updateStats();
  };

  window.promptCreatePlaylist = function () {
    // Toggle the inline create row
    var existing = document.getElementById('profile-new-playlist-row');
    if (existing) { existing.remove(); return; }

    var section = document.getElementById('profile-playlists').parentElement;
    var row = document.createElement('div');
    row.id = 'profile-new-playlist-row';
    row.className = 'profile-new-playlist-row';
    row.innerHTML =
      '<input type="text" id="profile-new-playlist-input" class="pm-new-input" placeholder="Playlist name…" autofocus>' +
      '<button class="btn-primary" onclick="confirmCreatePlaylist()">Create</button>' +
      '<button class="btn-cancel" onclick="document.getElementById(\'profile-new-playlist-row\').remove()">Cancel</button>';
    section.insertBefore(row, document.getElementById('profile-playlists'));
    row.querySelector('input').focus();
    row.querySelector('input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') window.confirmCreatePlaylist();
    });
  };

  window.confirmCreatePlaylist = async function () {
    var inputEl = document.getElementById('profile-new-playlist-input');
    var name = inputEl ? inputEl.value.trim() : '';
    if (!name) { if (inputEl) inputEl.focus(); return; }
    await window._fbCreatePlaylist(name);
    var row = document.getElementById('profile-new-playlist-row');
    if (row) row.remove();
    await renderPlaylists();
    updateStats();
    _showToast('Playlist created!');
  };

  // ── Recently Played ─────────────────────────────────────────────────────
  function renderRecent() {
    var recent = getRecent().slice(0, 12);
    var grid   = document.getElementById('profile-recent-grid');
    var empty  = document.getElementById('profile-recent-empty');

    if (recent.length === 0) {
      grid.style.display  = 'none';
      empty.style.display = 'block';
      return;
    }

    grid.style.display  = '';
    empty.style.display = 'none';
    window.currentSongsView = recent;
    grid.innerHTML = recent.map(function (s) { return createTrackCard(s); }).join('');
  }

  // ── Stats ───────────────────────────────────────────────────────────────
  function updateStats() {
    var favCount      = getFavorites().length;
    var playlistCount = _playlists.length;
    var recentCount   = getRecent().length;
    document.getElementById('profile-stats').innerHTML =
      '<span>' + favCount + ' favorite' + (favCount !== 1 ? 's' : '') + '</span>' +
      ' · ' +
      '<span>' + playlistCount + ' playlist' + (playlistCount !== 1 ? 's' : '') + '</span>' +
      ' · ' +
      '<span>' + recentCount + ' recently played</span>';
  }

  // helper to escape for attributes
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
