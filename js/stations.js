// ============================================
// Portal Radio — station definitions
// ============================================
// The one place stations are defined. Used by radio.html (the station grid) and
// overlay.html (the OBS/Streamlabs stream overlay), and by tests/stations.test.js.
//
// A song belongs to a station when its genre is in `pin` (the owner's own genre folder decides, whatever the
// AI tags say), or when:
//   it is in one of `genres`, OR one of `subgenres`, OR carries any of the `any` tags,
//   AND it carries every tag in `all`, AND none of the tags in `none`.
// Tags are the AI labels in data/music.json (`labels`, dictionary in data/tags.json).
(function (root) {
  'use strict';

  var FREE = [
    { id: 'all', name: 'Everything', icon: '🌌', desc: 'Shuffle the entire catalog' },
    { id: 'favorites', name: 'My Favorites', icon: '❤️', desc: 'Your saved tracks', personal: true },
    {
      id: 'focus', name: 'Deep Focus', icon: '🧠', desc: 'Lo-fi, ambient & calm instrumentals',
      subgenres: ['Lo-Fi', 'Chillhop', 'Ambient', 'Peaceful', 'Meditative', 'Calm Jazz', 'Classical', 'Romantic'],
      any: ['lofi', 'study', 'ambient', 'piano', 'piano-solo', 'new-age'],
      all: ['instrumental'],
      none: ['high-energy', 'energetic', 'aggressive', 'metal', 'punk', 'dubstep', 'edm', 'horror', 'tense', 'action',
             'drums', 'hiphop', 'reggae', 'country'],
    },
    {
      id: 'energy', name: 'High Energy', icon: '⚡', desc: 'Rock, Pop, Hip-Hop & EDM',
      genres: ['Rock', 'Pop', 'Hip-Hop'],
      subgenres: ['Techno-Wave'],
      any: ['edm', 'dubstep', 'workout', 'energetic', 'house', 'trap', 'phonk'],
      none: ['low-energy', 'sad', 'melancholy', 'meditation', 'peaceful', 'comedy', 'funny', 'kids'],
    },
    {
      id: 'chill', name: 'Late Night Chill', icon: '🍷', desc: 'Jazz, R&B, acoustic & chillhop',
      genres: ['Jazz', 'R&B / Soul', 'Acoustic'],
      subgenres: ['Chillhop', 'Dream Pop'],
      any: ['rnb', 'saxophone', 'groovy'],
      none: ['high-energy', 'aggressive', 'metal', 'punk', 'dubstep', 'horror', 'tense'],
    },
    {
      id: 'epic', name: 'Epic Adventures', icon: '🐉', desc: 'Cinematic, fantasy & trailer',
      subgenres: ['Cinematic', 'Dramatic', 'Fantasy', 'Cinematic Epic', 'Cinematic Rock', 'Medieval'],
      any: ['epic', 'trailer', 'triumphant', 'fantasy', 'adventurous', 'action'],
      none: ['low-energy', 'sad', 'melancholy', 'horror', 'meditation', 'peaceful', 'comedy', 'funny', 'punk', 'acoustic'],
    },
    {
      id: 'country', name: 'Backroads', icon: '🤠', desc: 'Country, bluegrass & western',
      pin: ['Country & Folk'],
      any: ['country', 'bluegrass', 'banjo'],
    },
  ];

  var PRO = [
    {
      id: 'vaporlounge', name: 'Vapor Lounge', icon: '🌊', desc: 'Synthwave, dream pop & chill electronic',
      subgenres: ['Dream Pop', 'Chillhop', 'Techno-Wave', 'Ambient', 'Uplifting'],
      any: ['synthwave', 'dreamy'],
      none: ['aggressive', 'metal', 'punk', 'dubstep', 'horror', 'tense', 'country', 'bluegrass', 'jazz', 'rnb',
             'hiphop', 'sad', 'sad-scene', 'orchestral'],
    },
    {
      id: 'studyhall', name: 'Study Hall', icon: '📚', desc: 'Classical, piano & lo-fi focus music',
      genres: ['Classical'],
      subgenres: ['Lo-Fi', 'Peaceful', 'Meditative', 'Ambient'],
      any: ['study', 'piano', 'piano-solo', 'classical'],
      all: ['instrumental'],
      none: ['high-energy', 'aggressive', 'metal', 'punk', 'edm', 'dubstep', 'horror', 'tense', 'country', 'drums'],
    },
    {
      id: 'darkhours', name: 'Dark Hours', icon: '🌑', desc: 'Dark suspense, horror & tension',
      pin: ['Dark & Suspense'],
      any: ['dark', 'tense', 'horror', 'true-crime'],
      // "mysterious" alone also tags peaceful ambient, so it doesn't pull songs in
      none: ['happy', 'playful', 'funny', 'comedy', 'wedding', 'kids', 'country', 'bluegrass', 'peaceful', 'meditation',
             'new-age', 'chill', 'lofi'],
    },
    {
      id: 'soultrain', name: 'Soul Train', icon: '🎷', desc: 'R&B, soul, funk & jazz grooves',
      pin: ['R&B / Soul'],
      genres: ['Jazz'],
      any: ['rnb', 'saxophone', 'funk', 'groovy'],
      none: ['metal', 'punk', 'aggressive', 'horror', 'playful', 'comedy', 'funny', 'kids', 'lofi'],
    },
    {
      id: 'gameon', name: 'Game On', icon: '🎮', desc: 'Gaming, action & hard-hitting rock',
      subgenres: ['Cinematic Rock', 'Hard Rock', 'Techno-Wave'],
      any: ['gaming', 'chiptune', 'action', 'dubstep'],
      none: ['low-energy', 'sad', 'melancholy', 'meditation', 'peaceful', 'romantic', 'wedding', 'jazz', 'lofi', 'funny'],
    },
  ];

  function has(list, value) {
    return !!list && list.indexOf(value) !== -1;
  }

  function matches(station, song) {
    if (!station || station.personal) return false;
    if (station.id === 'all' || has(station.pin, song.genre)) return true;
    var labels = song.labels || [];
    var inGroup = has(station.genres, song.genre) || has(station.subgenres, song.subgenre) ||
      (station.any || []).some(function (t) { return labels.indexOf(t) !== -1; });
    if (!inGroup) return false;
    if ((station.all || []).some(function (t) { return labels.indexOf(t) === -1; })) return false;
    if ((station.none || []).some(function (t) { return labels.indexOf(t) !== -1; })) return false;
    return true;
  }

  function byId(id) {
    return FREE.concat(PRO).filter(function (s) { return s.id === id; })[0] || null;
  }

  function isPro(id) {
    return PRO.some(function (s) { return s.id === id; });
  }

  // Songs for a station (not for the personal stations, favorites and playlists, which the pages fill in)
  function songsFor(id, songs) {
    var station = byId(id);
    return (songs || []).filter(function (s) { return s.file && matches(station, s); });
  }

  var api = { FREE: FREE, PRO: PRO, byId: byId, isPro: isPro, matches: matches, songsFor: songsFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PMStations = api;
})(this);
