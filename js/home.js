// ============================================
// Portal Music — Homepage Logic
// ============================================

// --- Genre grid (shows main genres with track counts) ---
function renderGenreGrid(songs) {
  var counts = {};
  songs.forEach(function (s) {
    var parent = s.genre;
    Object.entries(GENRES).forEach(function (entry) {
      if (entry[1].subgenres.indexOf(s.subgenre) !== -1) parent = entry[0];
    });
    counts[parent] = (counts[parent] || 0) + 1;
  });

  document.getElementById('genre-grid').innerHTML = Object.entries(GENRES).map(function (entry) {
    var g = entry[0], info = entry[1];
    return '<a href="browse.html?genre=' + encodeURIComponent(g) + '" class="genre-card">' +
      '<span class="genre-icon">' + info.icon + '</span>' +
      '<span class="genre-name">' + g + '</span>' +
      '<span class="genre-count">' + (counts[g] || 0) + ' tracks</span>' +
      '</a>';
  }).join('');
}

// --- Featured Artists ---
function renderArtists() {
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
      document.getElementById('artists-grid').innerHTML =
        '<div class="featured-artists-box">' +
          '<div class="featured-artists-byline">' + names + '</div>' +
          '<div class="featured-artists-portraits">' + portraits + '</div>' +
        '</div>';
    }).catch(function () {
      document.getElementById('artists-grid').innerHTML = '';
    });
}

// --- New Releases: tracks uploaded in the last NEW_RELEASE_DAYS days (admin sets "added") ---
var NEW_RELEASE_DAYS = 45;
function renderNewReleases(songs) {
  var cutoff = Date.now() - NEW_RELEASE_DAYS * 86400000;
  var newSongs = songs.filter(function (s) {
    return s.added && Date.parse(s.added) >= cutoff;
  }).sort(function (a, b) { return String(b.added).localeCompare(String(a.added)); }).slice(0, 8);
  if (newSongs.length === 0) return;
  window.newReleaseSongs = newSongs;
  document.getElementById('new-releases-grid').innerHTML = newSongs.map(function (s) { return createTrackCard(s, 'newReleaseSongs'); }).join('');
  document.getElementById('new-releases-section').style.display = 'block';
}

// --- Spotlight: a custom collection ("Fall Hits"…) set in the admin studio ---
function renderSpotlight(songs) {
  fetch('data/spotlight.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (sp) {
      if (!sp || !sp.active || !Array.isArray(sp.trackIds)) return;
      var byId = {};
      songs.forEach(function (s) { byId[s.id] = s; });
      var list = sp.trackIds.map(function (id) { return byId[id]; }).filter(Boolean);
      if (!list.length) return;
      window.spotlightSongs = list;
      document.getElementById('spotlight-title').textContent = sp.title || 'Spotlight';
      var sub = document.getElementById('spotlight-subtitle');
      sub.textContent = sp.subtitle || '';
      sub.style.display = sp.subtitle ? '' : 'none';
      document.getElementById('spotlight-grid').innerHTML = list.map(function (s) { return createTrackCard(s, 'spotlightSongs'); }).join('');
      document.getElementById('spotlight-section').style.display = 'block';
    })
    .catch(function () {});
}

// --- Featured: hand-picked tracks first, topped up with picks that change every day ---
var FEATURED_COUNT = 8;
function pickFeatured(songs) {
  var pinned = songs.filter(function (s) { return s.featured; });
  var rest = songs.filter(function (s) { return !s.featured; });
  var d = new Date();
  var seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  function rand() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  for (var i = rest.length - 1; i > 0; i--) {
    var j = Math.floor(rand() * (i + 1));
    var t = rest[i]; rest[i] = rest[j]; rest[j] = t;
  }
  return pinned.concat(rest).slice(0, Math.max(FEATURED_COUNT, pinned.length));
}

// --- Recently Played ---
function renderRecent() {
  var recent = getRecent();
  if (recent.length > 0) {
    document.getElementById('recent-section').style.display = 'block';
    window.recentSongs = recent;
    document.getElementById('recent-grid').innerHTML = recent.map(function (s) { return createTrackCard(s, 'recentSongs'); }).join('');
  }
}

document.getElementById('clear-recent-btn').addEventListener('click', function () {
  localStorage.removeItem('pm_recent');
  document.getElementById('recent-section').style.display = 'none';
});

// --- Init ---
Promise.all([loadGenres(), loadSongs()]).then(function (results) {
  var songs = results[1];

  renderGenreGrid(songs);

  var featured = pickFeatured(songs);
  window.currentSongsView = featured;
  document.getElementById('featured-grid').innerHTML = featured.length
    ? featured.map(createTrackCard).join('')
    : '<div class="empty-state"><div class="empty-icon">🎵</div><p>No featured tracks yet.</p></div>';

  renderSpotlight(songs);
  renderNewReleases(songs);
  renderRecent();
});

renderArtists();
