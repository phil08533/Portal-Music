// Tests for the Portal Radio stations (js/stations.js). Run: node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const PMStations = require('../js/stations.js');
const songs = require('../data/music.json');

const has = (s, tag) => (s.labels || []).includes(tag);
const stations = PMStations.FREE.concat(PMStations.PRO).filter(st => !st.personal);

test('station ids are unique and Pro stations are marked Pro', () => {
  const ids = stations.map(s => s.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  PMStations.PRO.forEach(s => assert.ok(PMStations.isPro(s.id), s.id));
  PMStations.FREE.forEach(s => assert.ok(!PMStations.isPro(s.id), s.id));
});

test('every station has enough music to play', () => {
  stations.forEach(st => {
    const n = PMStations.songsFor(st.id, songs).length;
    assert.ok(n >= 15, `${st.id} has only ${n} songs`);
  });
});

test('personal and unknown stations match nothing', () => {
  assert.strictEqual(PMStations.songsFor('favorites', songs).length, 0);
  assert.strictEqual(PMStations.songsFor('nope', songs).length, 0);
});

test("pinned genre folders always belong to their station", () => {
  stations.filter(st => st.pin).forEach(st => {
    const got = new Set(PMStations.songsFor(st.id, songs).map(s => s.id));
    songs.filter(s => s.file && st.pin.includes(s.genre)).forEach(s => assert.ok(got.has(s.id), `${st.id} misses ${s.title}`));
  });
});

test('focus stations stay calm and instrumental', () => {
  ['focus', 'studyhall'].forEach(id => {
    PMStations.songsFor(id, songs).forEach(s => {
      assert.ok(has(s, 'instrumental'), `${id}: ${s.title} has vocals`);
      ['high-energy', 'aggressive', 'metal', 'dubstep', 'horror'].forEach(t => assert.ok(!has(s, t), `${id}: ${s.title} is ${t}`));
    });
  });
});

test('stations keep out music that clearly does not fit', () => {
  const never = {
    darkhours: ['happy', 'playful', 'funny', 'peaceful', 'country'],
    epic: ['sad', 'comedy', 'punk'],
    energy: ['low-energy', 'meditation', 'kids'],
    vaporlounge: ['metal', 'jazz', 'country', 'horror'],
    soultrain: ['metal', 'horror', 'comedy'],
    gameon: ['jazz', 'lofi', 'wedding'],
  };
  Object.keys(never).forEach(id => {
    PMStations.songsFor(id, songs).forEach(s => {
      if (PMStations.byId(id).pin && PMStations.byId(id).pin.includes(s.genre)) return; // owner's own folder wins
      never[id].forEach(t => assert.ok(!has(s, t), `${id}: ${s.title} is ${t}`));
    });
  });
});
