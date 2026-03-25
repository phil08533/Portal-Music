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

// --- New Releases ---
function renderNewReleases(songs, artists) {
  var newSongs = songs.filter(function (s) {
    return s.file && s.file.indexOf('Newest Release') !== -1;
  });
  if (newSongs.length === 0) return;

  var byArtist = {};
  newSongs.forEach(function (s) {
    var name = s.artist || 'Portal Music';
    if (!byArtist[name]) byArtist[name] = [];
    byArtist[name].push(s);
  });

  var artistMap = {};
  artists.forEach(function (a) { artistMap[a.name] = a; });

  window.newReleaseSongs = newSongs;

  var html = '';
  Object.keys(byArtist).forEach(function (artistName) {
    var tracks = byArtist[artistName].slice(0, 4);
    var a = artistMap[artistName];
    html += '<div class="new-release-card">';
    html += '<div class="new-release-artist-header">';
    html += '<div class="new-release-artist-img">';
    if (a && a.hasImage) {
      html += '<img src="' + a.image + '" alt="' + artistName + '" onerror="this.parentElement.innerHTML=\'🎤\'">';
    } else {
      html += '<span>🎤</span>';
    }
    html += '</div>';
    html += '<div class="new-release-artist-info">';
    html += '<div class="new-release-badge">New Release</div>';
    html += '<div class="new-release-artist-name">' + artistName + '</div>';
    if (a) html += '<div class="new-release-artist-genre">' + a.genre + '</div>';
    html += '</div></div>';
    html += '<div class="new-release-tracks">';
    tracks.forEach(function (s) {
      var isActive = isPlaying && currentSong && currentSong.id === s.id;
      html += '<div class="new-release-track">' +
        '<button class="new-release-play-btn btn-play" data-song-id="' + s.id + '" onclick="handlePlayBtn(\'' + s.id + '\', window.newReleaseSongs)">' +
        (isActive ? '⏸' : '▶') + '</button>' +
        '<span class="new-release-track-title">' + _esc(s.title) + '</span>' +
        '</div>';
    });
    html += '</div>';
    html += '<a href="browse.html?artist=' + encodeURIComponent(artistName) + '" class="new-release-view-all">View all by ' + artistName + ' \u2192</a>';
    html += '</div>';
  });

  document.getElementById('new-releases-grid').innerHTML = html;
  document.getElementById('new-releases-section').style.display = 'block';
}

// --- Recently Played ---
function renderRecent() {
  var recent = getRecent();
  if (recent.length > 0) {
    document.getElementById('recent-section').style.display = 'block';
    document.getElementById('recent-grid').innerHTML = recent.map(createTrackCard).join('');
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

  var featured = songs.filter(function (s) { return s.featured; });
  window.currentSongsView = featured;
  document.getElementById('featured-grid').innerHTML = featured.length
    ? featured.map(createTrackCard).join('')
    : '<div class="empty-state"><div class="empty-icon">🎵</div><p>No featured tracks yet.</p></div>';

  renderRecent();

  fetch('data/artists.json')
    .then(function (r) { return r.json(); })
    .then(function (artists) { renderNewReleases(songs, artists); })
    .catch(function () { renderNewReleases(songs, []); });
});

renderArtists();
