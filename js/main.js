// Theme System
const setTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
};

// Apply saved theme on load
setTheme(localStorage.getItem('theme') || 'light');

// Recently Played Logic
const updateRecentlyPlayed = (song) => {
  let played = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
  played = [song, ...played.filter(s => s.id !== song.id)].slice(0, 10);
  localStorage.setItem('recentlyPlayed', JSON.stringify(played));
};

// Simple Player Controls
const audio = new Audio();
const playSong = (file, title) => {
  audio.src = file;
  audio.play();
  document.getElementById('current-title').innerText = title;
};