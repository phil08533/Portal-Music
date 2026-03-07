async function loadMusic() {
  const response = await fetch('data/music.json');
  const songs = await response.json();
  renderSongs(songs);
}

function renderSongs(songs) {
  const container = document.getElementById('music-list');
  container.innerHTML = songs.map(song => `
    <div class="music-card">
      <h3>${song.title}</h3>
      <p>${song.category} | ${song.tags.join(', ')}</p>
      <button onclick="playSong('${song.file}', '${song.title}')">Preview</button>
      <a href="download.html?file=${song.file}">Download</a>
    </div>
  `).join('');
}

// Initial Load
loadMusic();