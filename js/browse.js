// ============================================
// Portal Music — Browse Page Logic
// ============================================

var params       = new URLSearchParams(window.location.search);
var genre        = params.get('genre');
var subgenreParam = params.get('subgenre');
var artist       = params.get('artist');
var filterMode   = params.get('filter');
var trackParam   = params.get('track');
var allSongsPage = [];
var activeFilters = [];
var activeUseCase = '';
var activeLengthFilter = '';

var USE_CASE_GENRES = {
  workout:   ['Rock', 'Electronic', 'Hip-Hop'],
  study:     ['Electronic', 'Ambient & Chill', 'Classical'],
  gaming:    ['Cinematic', 'Rock', 'Electronic', 'Dark & Suspense'],
  roadtrip:  ['Rock', 'Country & Folk', 'Pop'],
  content:   ['Cinematic', 'Pop', 'Electronic', 'Playful & Mood'],
  relax:     ['Ambient & Chill', 'Jazz', 'Acoustic', 'R&B / Soul'],
  party:     ['Hip-Hop', 'Pop', 'Electronic', 'R&B / Soul'],
  latenight: ['Jazz', 'R&B / Soul', 'Ambient & Chill', 'Dark & Suspense'],
  podcast:   ['Jazz', 'Cinematic', 'Classical', 'Ambient & Chill'],
  cinematic: ['Cinematic', 'Dark & Suspense', 'Classical'],
};

function parseDurationSecs(dur) {
  if (!dur) return null;
  var parts = String(dur).split(':');
  if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  return null;
}

function matchesLength(song, filter) {
  if (!filter) return true;
  var secs = parseDurationSecs(song.duration);
  if (secs === null) return true; // unknown duration passes all
  if (filter === 'short')  return secs < 120;
  if (filter === 'medium') return secs >= 120 && secs <= 240;
  if (filter === 'long')   return secs > 240;
  return true;
}

function matchesUseCase(song, useCase) {
  if (!useCase) return true;
  var genres = USE_CASE_GENRES[useCase] || [];
  return genres.indexOf(song.genre) !== -1;
}

// --- Build genre/subgenre chip grid (multi-select) ---
function renderBrowseFilters(songs) {
  var filtersEl = document.getElementById('browse-filters');
  if (genre || artist || filterMode) {
    filtersEl.style.display = 'none';
    return;
  }

  // Count per subgenre; also count artist-field songs under their artist chip
  var subCounts = {};
  songs.forEach(function (s) {
    if (s.subgenre) subCounts[s.subgenre] = (subCounts[s.subgenre] || 0) + 1;
    if (s.artist && s.artist !== s.subgenre) {
      subCounts[s.artist] = (subCounts[s.artist] || 0) + 1;
    }
  });

  // Find subgenres in data that aren't in GENRES config (new album folders)
  var coveredSubs = new Set();
  Object.values(GENRES).forEach(function (info) {
    info.subgenres.forEach(function (sub) { coveredSubs.add(sub); });
  });

  var dynamicSubsByGenre = {};
  songs.forEach(function (s) {
    if (s.subgenre && !coveredSubs.has(s.subgenre) && !s.artist) {
      var g = s.genre || 'Other';
      if (!dynamicSubsByGenre[g]) dynamicSubsByGenre[g] = {};
      dynamicSubsByGenre[g][s.subgenre] = (dynamicSubsByGenre[g][s.subgenre] || 0) + 1;
    }
  });

  var html = '';
  Object.entries(GENRES).forEach(function (entry) {
    var g = entry[0], info = entry[1];

    var allSubs = info.subgenres.slice();
    if (dynamicSubsByGenre[g]) {
      Object.keys(dynamicSubsByGenre[g]).forEach(function (sub) {
        if (allSubs.indexOf(sub) === -1) allSubs.push(sub);
      });
    }

    var totalCount = 0;
    allSubs.forEach(function (sub) { totalCount += (subCounts[sub] || 0); });
    if (totalCount === 0) return;

    html += '<div class="filter-genre-group">';
    html += '<div class="filter-genre-header">';
    html += '<span class="filter-genre-icon">' + info.icon + '</span>';
    html += '<span class="filter-genre-name">' + g + '</span>';
    html += '<span class="filter-genre-count">' + totalCount + '</span>';
    html += '</div>';
    html += '<div class="filter-genre-chips">';
    allSubs.forEach(function (sub) {
      var c = subCounts[sub] || 0;
      if (c === 0) return;
      html += '<button class="chip browse-chip" data-sub="' + sub.replace(/"/g, '') + '">' +
        sub + ' <span class="chip-count">' + c + '</span></button>';
    });
    html += '</div></div>';
  });

  filtersEl.innerHTML = html;

  if (subgenreParam) {
    activeFilters = [subgenreParam];
    var preBtn = filtersEl.querySelector('.browse-chip[data-sub="' + subgenreParam + '"]');
    if (preBtn) preBtn.classList.add('active');
  }

  filtersEl.querySelectorAll('.browse-chip').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var sub = btn.dataset.sub;
      var idx = activeFilters.indexOf(sub);
      if (idx >= 0) {
        activeFilters.splice(idx, 1);
        btn.classList.remove('active');
      } else {
        activeFilters.push(sub);
        btn.classList.add('active');
      }
      renderFilteredGrid();
    });
  });
}

// --- Clear filters ---
document.getElementById('browse-clear-btn').addEventListener('click', function () {
  activeFilters = [];
  activeUseCase = '';
  activeLengthFilter = '';
  document.querySelectorAll('.browse-chip.active').forEach(function (b) {
    b.classList.remove('active');
  });
  var ucEl = document.getElementById('use-case-filter');
  var lenEl = document.getElementById('length-filter');
  if (ucEl)  ucEl.value  = '';
  if (lenEl) lenEl.value = '';
  renderFilteredGrid();
});

// --- Render grid based on active filters ---
function renderFilteredGrid() {
  var bar = document.getElementById('browse-active-bar');
  var gridEl = document.getElementById('music-grid');
  var countEl = document.getElementById('browse-results-count');

  var hasChips  = activeFilters.length > 0;
  var hasUseCase = !!activeUseCase;
  var hasLength  = !!activeLengthFilter;

  if (!hasChips && !hasUseCase && !hasLength) {
    bar.style.display = 'none';
    window.currentSongsView = allSongsPage;
    gridEl.innerHTML = allSongsPage.length
      ? allSongsPage.map(createTrackCard).join('')
      : '<div class="empty-state"><div class="empty-icon">🎵</div><p>No tracks found.</p></div>';
    return;
  }

  var filtered = allSongsPage.filter(function (s) {
    // Chip filter (subgenre / artist)
    var passChip = !hasChips || (
      activeFilters.indexOf(s.subgenre) !== -1 ||
      (s.artist && activeFilters.indexOf(s.artist) !== -1)
    );
    return passChip && matchesUseCase(s, activeUseCase) && matchesLength(s, activeLengthFilter);
  });

  var activeCount = activeFilters.length + (hasUseCase ? 1 : 0) + (hasLength ? 1 : 0);
  bar.style.display = 'flex';
  countEl.textContent = filtered.length + ' track' + (filtered.length !== 1 ? 's' : '') +
    ' · ' + activeCount + ' filter' + (activeCount !== 1 ? 's' : '') + ' active';

  window.currentSongsView = filtered;
  gridEl.innerHTML = filtered.length
    ? filtered.map(createTrackCard).join('')
    : '<div class="empty-state"><div class="empty-icon">😔</div><p>No tracks match those filters.</p></div>';
}

// --- Render simple grid (for genre/artist/favorites views) ---
function renderSimpleGrid(songs) {
  window.currentSongsView = songs;
  var gridEl = document.getElementById('music-grid');
  gridEl.innerHTML = songs.length
    ? songs.map(createTrackCard).join('')
    : '<div class="empty-state"><div class="empty-icon">😔</div><p>No tracks found.</p></div>';
}

// --- Scroll to and highlight a shared track ---
function highlightTrack(id) {
  setTimeout(function () {
    var el = document.querySelector('.music-card[data-id="' + id + '"]');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('track-highlight');
      setTimeout(function () { el.classList.remove('track-highlight'); }, 3000);
    }
  }, 200);
}

// --- Featured Artists box ---
function renderBrowseArtists() {
  fetch('data/artists.json')
    .then(function (r) { return r.json(); })
    .then(function (artists) {
      var names = artists.map(function (a) { return a.name; }).join(', ');
      var portraits = artists.map(function (a) {
        return '<a class="featured-artist-portrait" href="browse.html?artist=' + encodeURIComponent(a.name) + '" title="Browse ' + a.name + '">' +
          '<div class="featured-artist-portrait-img">' +
          (a.hasImage
            ? '<img src="' + a.image + '" alt="' + a.name + '" onerror="this.parentElement.innerHTML=\'🎤\'">'
            : '<span>🎤</span>') +
          '</div>' +
          '<span class="featured-artist-portrait-name">' + a.name + '</span>' +
          '</a>';
      }).join('');
      document.getElementById('browse-artists-grid').innerHTML =
        '<div class="featured-artists-box">' +
          '<div class="featured-artists-byline">Featured Artists — ' + names + '</div>' +
          '<div class="featured-artists-portraits">' + portraits + '</div>' +
        '</div>';
    }).catch(function () {});
}

// --- Init ---
Promise.all([loadGenres(), loadSongs()]).then(function (results) {
  var songs = results[1];
  var titleEl   = document.getElementById('page-title');
  var subtitleEl = document.getElementById('page-subtitle');
  allSongsPage = songs;

  if (filterMode === 'favorites') {
    var favIds = getFavorites();
    titleEl.textContent = '❤️ Favorites';
    subtitleEl.textContent = 'Your session favorites — clears when you close this tab.';
    var favSongs = songs.filter(function (s) { return favIds.indexOf(String(s.id)) !== -1; });
    if (favSongs.length === 0) {
      document.getElementById('music-grid').innerHTML =
        '<div class="empty-state"><div class="empty-icon">🤍</div>' +
        '<p>No favorites yet — tap 🤍 on any track to save it.</p></div>';
    } else {
      renderSimpleGrid(favSongs);
    }

  } else if (genre) {
    titleEl.textContent = genre;
    var genreInfo = GENRES[genre];
    if (genreInfo) subtitleEl.textContent = genreInfo.subgenres.join(' · ');
    var genreSongs = songs.filter(function (s) {
      return genreInfo
        ? genreInfo.subgenres.indexOf(s.subgenre) !== -1 || s.genre === genre
        : s.genre === genre;
    });
    renderBrowseFilters(songs);
    if (genreInfo) {
      activeFilters = genreInfo.subgenres.slice();
      document.querySelectorAll('.browse-chip').forEach(function (btn) {
        if (activeFilters.indexOf(btn.dataset.sub) !== -1) btn.classList.add('active');
      });
    }
    renderSimpleGrid(genreSongs);

  } else if (artist) {
    titleEl.textContent = artist;
    subtitleEl.textContent = 'All tracks by ' + artist;
    var artistSongs = songs.filter(function (s) {
      return s.artist === artist || s.subgenre === artist;
    });
    renderSimpleGrid(artistSongs);

  } else {
    titleEl.textContent = subgenreParam ? subgenreParam : 'Browse Music';
    subtitleEl.textContent = subgenreParam
      ? 'Showing tracks for ' + subgenreParam + '. Select more genres to add.'
      : songs.length + ' tracks available. Filter by genre below.';
    renderBrowseFilters(songs);
    renderFilteredGrid();
  }

  if (trackParam) highlightTrack(trackParam);
});

// Featured Artists — only on main browse view
if (!genre && !artist && !filterMode) {
  renderBrowseArtists();
}

// --- Use-case + length dropdown listeners ---
var useCaseEl = document.getElementById('use-case-filter');
var lengthEl  = document.getElementById('length-filter');
if (useCaseEl) {
  useCaseEl.addEventListener('change', function () {
    activeUseCase = this.value;
    renderFilteredGrid();
  });
}
if (lengthEl) {
  lengthEl.addEventListener('change', function () {
    activeLengthFilter = this.value;
    renderFilteredGrid();
  });
}
