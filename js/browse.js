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
  var secs = song.durationSec || parseDurationSecs(song.duration);
  if (secs === null) return true; // unknown duration passes all
  if (filter === 'short')  return secs < 120;
  if (filter === 'medium') return secs >= 120 && secs <= 240;
  if (filter === 'long')   return secs > 240;
  return true;
}

// The same dropdown, answered by the AI tags for tracks that have them
var USE_CASE_TAGS = {
  workout: ['workout'], study: ['study'], gaming: ['gaming', 'game-dev'], roadtrip: ['travel'],
  content: ['vlog', 'edits', 'ads', 'tech'], relax: ['chill', 'peaceful', 'meditation'], party: ['groovy', 'energetic'],
  latenight: ['chill', 'romantic', 'dreamy'], podcast: ['podcast', 'true-crime'], cinematic: ['film', 'trailer', 'epic'],
};

function matchesUseCase(song, useCase) {
  if (!useCase) return true;
  if (song.labels && song.labels.length) {
    var want = USE_CASE_TAGS[useCase] || [];
    return want.some(function (id) { return song.labels.indexOf(id) !== -1; });
  }
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

var activeSort = 'default';

function applySorting(list) {
  var copy = list.slice();
  if (activeSort === 'az') {
    return copy.sort(function(a, b) {
      return (a.title || '').localeCompare(b.title || '');
    });
  } else if (activeSort === 'newest') {
    return copy.sort(function(a, b) {
      var aAdded = a.added || '', bAdded = b.added || '';
      if (aAdded !== bAdded) return bAdded.localeCompare(aAdded);
      return String(b.id).localeCompare(String(a.id));
    });
  } else if (activeSort === 'shortest') {
    return copy.sort(function(a, b) {
      var da = parseDurationSecs(a.duration) || 99999;
      var db = parseDurationSecs(b.duration) || 99999;
      return da - db;
    });
  } else if (activeSort === 'longest') {
    return copy.sort(function(a, b) {
      var da = parseDurationSecs(a.duration) || 0;
      var db = parseDurationSecs(b.duration) || 0;
      return db - da;
    });
  }
  return copy;
}

// --- Grid painting with "Show more" paging (keeps long lists fast and tidy) ---
var GRID_PAGE_SIZE = 48;
var gridList = [];
var gridShown = 0;

function paintGrid(list, emptyHtml) {
  var gridEl = document.getElementById('music-grid');
  gridList = list;
  window.currentSongsView = list;
  gridShown = Math.min(list.length, GRID_PAGE_SIZE);
  // Deep links (?track=) must render far enough down the list to find the track
  if (trackParam) {
    var idx = list.findIndex(function (s) { return String(s.id) === String(trackParam); });
    if (idx >= gridShown) gridShown = idx + 1;
  }
  gridEl.innerHTML = list.length ? list.slice(0, gridShown).map(createTrackCard).join('') : emptyHtml;
  updateShowMore();
}

function updateShowMore() {
  var gridEl = document.getElementById('music-grid');
  var wrap = document.getElementById('grid-show-more');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'grid-show-more';
    wrap.className = 'grid-show-more';
    wrap.innerHTML = '<button type="button" class="btn-show-more"></button>';
    gridEl.insertAdjacentElement('afterend', wrap);
    wrap.firstChild.addEventListener('click', function () {
      var next = gridList.slice(gridShown, gridShown + GRID_PAGE_SIZE);
      gridEl.insertAdjacentHTML('beforeend', next.map(createTrackCard).join(''));
      gridShown += next.length;
      updateShowMore();
    });
  }
  var remaining = gridList.length - gridShown;
  wrap.style.display = remaining > 0 ? '' : 'none';
  wrap.firstChild.textContent = 'Show more tracks (' + remaining + ' more)';
}

// --- Render grid based on active filters ---
function renderFilteredGrid() {
  var bar = document.getElementById('browse-active-bar');
  var countEl = document.getElementById('browse-results-count');

  var hasChips  = activeFilters.length > 0;
  var hasUseCase = !!activeUseCase;
  var hasLength  = !!activeLengthFilter;

  if (!hasChips && !hasUseCase && !hasLength) {
    bar.style.display = 'none';
    paintGrid(applySorting(allSongsPage),
      '<div class="empty-state"><div class="empty-icon">🎵</div><p>No tracks found.</p></div>');
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

  filtered = applySorting(filtered);

  var activeCount = activeFilters.length + (hasUseCase ? 1 : 0) + (hasLength ? 1 : 0);
  bar.style.display = 'flex';
  countEl.textContent = filtered.length + ' track' + (filtered.length !== 1 ? 's' : '') +
    ' · ' + activeCount + ' filter' + (activeCount !== 1 ? 's' : '') + ' active';

  paintGrid(filtered,
    '<div class="empty-state"><div class="empty-icon">😔</div><p>No tracks match those filters.</p></div>');
}

// --- Render simple grid (for genre/artist/favorites views) ---
function renderSimpleGrid(songs) {
  paintGrid(applySorting(songs),
    '<div class="empty-state"><div class="empty-icon">😔</div><p>No tracks found.</p></div>');
}

// --- Render subgenre pills for a single genre view ---
function renderGenreSubgenrePills(genreName, genreTracks) {
  var pillsEl = document.getElementById('genre-subgenre-pills');
  if (!pillsEl) return;
  pillsEl.style.display = 'flex';

  var counts = {};
  genreTracks.forEach(function (s) {
    var sub = s.subgenre || genreName;
    counts[sub] = (counts[sub] || 0) + 1;
  });

  var subKeys = Object.keys(counts).sort();
  if (subKeys.length <= 1) {
    pillsEl.style.display = 'none';
    return;
  }

  var html = '<button class="chip browse-chip active" data-sub="ALL">All ' + genreName + ' <span class="chip-count">' + genreTracks.length + '</span></button>';
  subKeys.forEach(function (sub) {
    html += '<button class="chip browse-chip" data-sub="' + sub + '">' + sub + ' <span class="chip-count">' + counts[sub] + '</span></button>';
  });
  pillsEl.innerHTML = html;

  pillsEl.querySelectorAll('.browse-chip').forEach(function (btn) {
    btn.addEventListener('click', function () {
      pillsEl.querySelectorAll('.browse-chip').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var chosen = btn.dataset.sub;
      if (chosen === 'ALL') {
        renderSimpleGrid(genreTracks);
      } else {
        var filteredSubs = genreTracks.filter(function (s) { return s.subgenre === chosen; });
        renderSimpleGrid(filteredSubs);
      }
    });
  });
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
        '<div class="featured-artists-box featured-artists-box--compact">' +
          '<div class="featured-artists-byline">Featured artists</div>' +
          '<div class="featured-artists-portraits">' + portraits + '</div>' +
        '</div>';
    }).catch(function () {});
}

// --- "Search a sound" (js/search.js) ---
var pmSearchEngine = null, pmSearchLoading = null, pmSearchLogged = {};

function pmSearchEnsure() {
  if (pmSearchEngine || !window.PMSearch) return Promise.resolve(pmSearchEngine);
  if (!pmSearchLoading) {
    pmSearchLoading = fetch('data/tags.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) { pmSearchEngine = window.PMSearch.create(d); return pmSearchEngine; })
      .catch(function () { return null; });
  }
  return pmSearchLoading;
}

function pmSearchShowUnderstood(chips) {
  var box = document.getElementById('search-understood');
  var ex = document.getElementById('search-examples');
  if (ex) ex.style.display = 'none';
  if (!box) return;
  var parts = chips.filter(function (c) { return !c.word; }).map(function (c) {
    return '<span class="su-chip' + (c.negated ? ' su-not' : '') + '" title="' + _esc(c.corrected ? 'You typed “' + c.text + '”' : (c.text || '')) + '">' + _esc(c.label) + '</span>';
  });
  box.innerHTML = parts.length ? 'Searching for: ' + parts.join(' ') : '';
  box.style.display = parts.length ? '' : 'none';
}

window.pmSearchClear = function () {
  window._pmSearchReasons = null;
  var box = document.getElementById('search-understood');
  if (box) box.style.display = 'none';
  var ex = document.getElementById('search-examples');
  if (ex) ex.style.display = '';
  // Show the normal list again
  var filtersEl = document.getElementById('browse-filters');
  if (filtersEl && !genre && !artist && !filterMode) filtersEl.style.display = '';
  if (!genre && !artist && !filterMode) renderFilteredGrid();
  else location.reload();
};

window.pmSearchRun = function (query, pool) {
  return pmSearchEnsure().then(function (engine) {
    if (!engine) { window._pmSearchReasons = null; renderSimpleGrid(fuzzySearch(pool, query)); return; }
    var res = engine.search(pool, query);
    window._pmSearchReasons = {};
    res.results.forEach(function (r) { window._pmSearchReasons[r.song.id] = r.reasons; });
    pmSearchShowUnderstood(res.chips);
    var found = res.results.map(function (r) { return r.song; });
    var bar = document.getElementById('browse-active-bar');
    if (bar) bar.style.display = 'none';
    var filtersEl = document.getElementById('browse-filters');   // results go right under the search box
    if (filtersEl) filtersEl.style.display = 'none';
    paintGrid(applySorting(found),
      '<div class="empty-state"><div class="empty-icon">🔎</div><p>No exact match for “' + _esc(query) +
      '”. Try fewer words, or a mood like <em>chill</em>, <em>dark</em> or <em>epic</em>.</p></div>');
    // What people search for tells us what music to make next (once per search per visit)
    var key = engine.normalize(query).slice(0, 40);
    if (key && !pmSearchLogged[key] && window.pmTrack) {
      clearTimeout(window._pmSearchLogTimer);
      window._pmSearchLogTimer = setTimeout(function () {
        if (pmSearchLogged[key]) return;
        pmSearchLogged[key] = 1;
        pmTrack('search', { v: key, track: String(found.length) });
      }, 1500);
    }
  });
};

// --- Search box dropdown: suggests tags while typing; 🏷️ Tags lists them all ---
(function () {
  var input = document.getElementById('search-input');
  var box = document.getElementById('tag-suggest');
  var toggle = document.getElementById('tags-toggle');
  if (!input || !box) return;
  var mode = null, items = [], active = -1;

  function counts() {
    var c = {};
    (allSongsPage || []).forEach(function (s) { (s.labels || []).forEach(function (l) { c[l] = (c[l] || 0) + 1; }); });
    return c;
  }
  function songsWord(n) { return n + (n === 1 ? ' song' : ' songs'); }
  function close() {
    box.hidden = true; mode = null; items = []; active = -1;
    input.setAttribute('aria-expanded', 'false');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }
  function open() { box.hidden = false; input.setAttribute('aria-expanded', 'true'); }

  // Put the tag into the box (replacing what was being typed) and search
  function pick(tag, replace) {
    var words = input.value.replace(/\s+$/, '').split(/\s+/).filter(Boolean);
    if (replace) words = words.slice(0, Math.max(0, words.length - replace));
    var label = tag.label.replace(/\s*\(.*?\)/g, '');
    if (words.join(' ').toLowerCase().indexOf(label.toLowerCase()) === -1) words.push(label);
    input.value = words.join(' ') + ' ';
    close();
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function showSuggestions() {
    var text = input.value;
    pmSearchEnsure().then(function (engine) {
      if (!engine || input.value !== text) return;
      items = engine.suggest(text, 8, counts());
      active = -1;
      if (!items.length) { close(); return; }
      mode = 'suggest';
      box.innerHTML = items.map(function (t, i) {
        return '<button type="button" class="ts-item" role="option" data-i="' + i + '">' +
          '<span>' + _esc(t.label) + '</span><small>' + songsWord(t.count) + '</small></button>';
      }).join('');
      open();
    });
  }

  function showAll() {
    pmSearchEnsure().then(function (engine) {
      if (!engine) return;
      var c = counts(), groups = {}, order = ['use', 'mood', 'style', 'instrument', 'vocals', 'energy', 'tempo', 'length'];
      var names = { use: 'Best for', mood: 'Mood', style: 'Style', instrument: 'Instruments', vocals: 'Vocals', energy: 'Energy', tempo: 'Tempo', length: 'Length' };
      items = [];
      engine.tags.forEach(function (t) { if (c[t.id]) (groups[t.facet] = groups[t.facet] || []).push(t); });
      var html = order.filter(function (f) { return groups[f]; }).map(function (f) {
        var chips = groups[f].sort(function (a, b) { return c[b.id] - c[a.id]; }).map(function (t) {
          items.push({ id: t.id, label: t.label, count: c[t.id], replace: 0 });
          return '<button type="button" class="ts-chip" data-i="' + (items.length - 1) + '">' +
            _esc(t.label.replace(/\s*\(.*?\)/g, '')) + '<small>' + c[t.id] + '</small></button>';
        }).join('');
        return '<div class="ts-group"><div class="ts-group-title">' + names[f] + '</div><div class="ts-chips">' + chips + '</div></div>';
      }).join('');
      if (!html) return;
      mode = 'all'; active = -1;
      box.innerHTML = html;
      open();
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
    });
  }

  input.addEventListener('input', function (e) {
    if (!e.isTrusted) return;                 // our own re-search after picking a tag
    if (input.value.trim()) showSuggestions(); else showAll();
  });
  input.addEventListener('focus', function () { if (!input.value.trim()) showAll(); });
  input.addEventListener('keydown', function (e) {
    if (box.hidden) { if (e.key === 'ArrowDown') { input.value.trim() ? showSuggestions() : showAll(); e.preventDefault(); } return; }
    var els = box.querySelectorAll('[data-i]');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length;
      els.forEach(function (el, i) { el.classList.toggle('active', i === active); });
      if (els[active]) els[active].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      if (active >= 0 && items[active]) { e.preventDefault(); pick(items[active], items[active].replace); }
      else close();
    } else if (e.key === 'Escape') close();
  });
  box.addEventListener('mousedown', function (e) { e.preventDefault(); });   // keep focus in the box
  box.addEventListener('click', function (e) {
    var b = e.target.closest('[data-i]');
    if (b && items[+b.getAttribute('data-i')]) { var t = items[+b.getAttribute('data-i')]; pick(t, t.replace); }
  });
  if (toggle) toggle.addEventListener('click', function () {
    if (mode === 'all') close(); else { input.focus(); showAll(); }
  });
  document.addEventListener('click', function (e) {
    if (!box.hidden && !e.target.closest('.search-bar-wrap')) close();
  });
})();

document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('#search-examples button[data-q]');
  if (!b) return;
  var input = document.getElementById('search-input');
  if (!input) return;
  input.value = b.getAttribute('data-q');
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

// --- Init ---
Promise.all([loadGenres(), loadSongs()]).then(function (results) {
  var songs = results[1];
  var titleEl   = document.getElementById('page-title');
  var subtitleEl = document.getElementById('page-subtitle');
  allSongsPage = songs;

  if (filterMode === 'favorites') {
    var favIds = getFavorites();
    titleEl.textContent = '❤️ Favorites';
    subtitleEl.textContent = localStorage.getItem('pm_user_name') !== null
      ? 'Your saved tracks, synced to your account.'
      : 'Saved for this visit. Sign in to keep them on every device.';
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
    renderGenreSubgenrePills(genre, genreSongs);
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

  // ?q= opens a search (links from track pages and "best for" pages)
  var qParam = params.get('q');
  if (qParam && !filterMode && !genre && !artist) {
    var input = document.getElementById('search-input');
    if (input) input.value = qParam;
    window.pmSearchRun(qParam, songs);
  }
});

// Featured Artists — only on main browse view
if (!genre && !artist && !filterMode) {
  renderBrowseArtists();
}

// --- Use-case + length + sort dropdown listeners ---
var useCaseEl = document.getElementById('use-case-filter');
var lengthEl  = document.getElementById('length-filter');
var sortEl    = document.getElementById('sort-filter');

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
if (sortEl) {
  sortEl.addEventListener('change', function () {
    activeSort = this.value;
    if (window.currentSongsView) {
      renderSimpleGrid(window.currentSongsView);
    } else {
      renderFilteredGrid();
    }
  });
}

