// Tests for "Search a sound" (js/search.js). Run: node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const PMSearch = require('../js/search.js');
const dict = require('../data/tags.json');
const S = PMSearch.create(dict);

const ids = q => S.parse(q).tags.filter(t => !t.negated).map(t => t.id);
const nots = q => S.parse(q).tags.filter(t => t.negated).map(t => t.id);

test('understands everyday descriptions', () => {
  const cases = [
    ['spooky music for my horror channel', ['scary', 'horror']],
    ['creepy haunted house ambience', ['scary', 'horror', 'ambient']],
    ['chill lofi beats to study to', ['chill', 'lofi', 'study']],
    ['epic orchestral trailer music', ['epic', 'orchestral', 'trailer']],
    ['upbeat vlog music', ['energetic', 'vlog']],
    ['sad piano for an emotional scene', ['sad', 'piano', 'sad-scene']],
    ['cowboy western showdown', ['western-scene']],
    ['80s synthwave for a car edit', ['synthwave', 'edits']],
    ['podcast intro', ['podcast']],
    ['music for my twitch stream', ['streaming']],
    ['relaxing spa meditation', ['meditation', 'chill']],
    ['funny cartoon music for a meme', ['funny', 'comedy']],
    ['gym workout hype', ['workout', 'high-energy']],
    ['wedding slideshow', ['wedding']],
    ['medieval tavern fantasy', ['fantasy', 'medieval']],
  ];
  for (const [q, want] of cases) {
    const got = ids(q);
    for (const id of want) assert.ok(got.includes(id), `"${q}" should include ${id} — got [${got}]`);
  }
});

test('typos still work', () => {
  assert.ok(ids('spoooky musc').includes('scary'));
  assert.ok(ids('orchestrall trailor').includes('orchestral'));
  assert.ok(ids('meditaton').includes('meditation'));
  assert.ok(ids('synthwav').includes('synthwave'));
});

test('negations and vocals', () => {
  assert.ok(ids('no vocals').includes('instrumental'));
  assert.ok(ids('instrumental hip hop').includes('instrumental'));
  assert.ok(ids('song with lyrics').includes('vocals'));
  assert.deepStrictEqual(nots('happy but not too sad'), ['sad']);
  assert.ok(ids('happy but not too sad').includes('happy'));
  assert.deepStrictEqual(nots('rock without drums'), ['drums']);
  assert.ok(!ids('no copyright music for youtube').length || !ids('no copyright music for youtube').includes('instrumental'));
  assert.deepStrictEqual(nots('no copyright horror music'), []);
});

test('length and tempo limits', () => {
  assert.strictEqual(S.parse('intro under a minute').limits.maxSec, 60);
  assert.strictEqual(S.parse('under 30 seconds').limits.maxSec, 30);
  assert.strictEqual(S.parse('less than 2 min').limits.maxSec, 120);
  assert.strictEqual(S.parse('over 3 minutes').limits.minSec, 180);
  assert.strictEqual(S.parse('about 2 minutes long').limits.nearSec, 120);
  assert.deepStrictEqual([S.parse('120 bpm').limits.minBpm, S.parse('120 bpm').limits.maxBpm], [112, 128]);
  assert.strictEqual(S.parse('80s synth').limits.nearSec, undefined, '"80s" is a decade');
  assert.strictEqual(S.parse('90s hip hop').limits.nearSec, undefined);
});

test('ranking prefers matching tags and explains why', () => {
  const songs = [
    { id: 'a', title: 'Hollow House', genre: 'Dark & Suspense', labels: ['scary', 'dark', 'horror', 'instrumental', 'piano', 'short'], durationSec: 55 },
    { id: 'b', title: 'Sunny Day', genre: 'Pop', labels: ['happy', 'vlog', 'vocals', 'pop'], durationSec: 150 },
    { id: 'c', title: 'Night Walk', genre: 'Dark & Suspense', labels: ['dark', 'tense', 'instrumental'], durationSec: 200 },
    { id: 'd', title: 'Old Untagged Spooky One', genre: 'Dark & Suspense', duration: '1:10' },
    { id: 'e', title: 'Scream Queen', genre: 'Rock', labels: ['scary', 'horror', 'vocals'], durationSec: 50 },
  ];
  const r = S.search(songs, 'spooky horror piano, no vocals').results;
  assert.strictEqual(r[0].song.id, 'a');
  assert.ok(r[0].reasons.includes('Horror') && r[0].reasons.includes('Piano'));
  assert.ok(!r.find(x => x.song.id === 'e'), 'vocal track must be excluded by "no vocals"');
  assert.ok(!r.find(x => x.song.id === 'b'));
  // "close" match via supporting moods
  const r2 = S.search(songs, 'horror').results.map(x => x.song.id);
  assert.ok(r2.includes('c'), 'dark + tense counts as close to horror');
  // length limit
  const r3 = S.search(songs, 'dark music under 1 minute').results.map(x => x.song.id);
  assert.ok(r3.includes('a') && !r3.includes('c'));
  // untagged tracks still found through title/genre words
  assert.ok(S.search(songs, 'spooky').results.map(x => x.song.id).includes('d'));
  // plain title search still works
  assert.strictEqual(S.search(songs, 'sunny day').results[0].song.id, 'b');
  assert.strictEqual(S.search(songs, 'nigth walk').results[0].song.id, 'c');
});

test('one-model hints count a little, below agreed tags', () => {
  const songs = [
    { id: 'agreed', title: 'A', genre: 'Pop', labels: ['romantic'] },
    { id: 'hint', title: 'B', genre: 'Pop', labels: ['happy'], hints: ['romantic'] },
    { id: 'none', title: 'C', genre: 'Pop', labels: ['happy'] },
  ];
  const r = S.search(songs, 'romantic').results.map(x => x.song.id);
  assert.deepStrictEqual(r, ['agreed', 'hint']);
});

test('chips describe what was understood', () => {
  const c = S.search([], 'creepy piano under 45 seconds not sad').chips.map(x => x.label);
  for (const want of ['Scary', 'Piano', 'not Sad', 'under 45 s']) assert.ok(c.includes(want), want + ' in ' + c);
});

test('half-typed words finish themselves as you type', () => {
  assert.deepStrictEqual(ids('true crim'), ['true-crime']);
  assert.deepStrictEqual(ids('tru'), ['true-crime'], 'a tag name beats a synonym (trumpet)');
  assert.deepStrictEqual(ids('hip h'), ['hiphop']);
  assert.ok(ids('spooky pian').includes('piano'));
  assert.deepStrictEqual(ids('tr '), [], 'after a space the word is finished, not completed');
});

test('the dropdown suggests tags for what is being typed, skipping tags with no songs', () => {
  const sug = S.suggest('true cr', 5);
  assert.strictEqual(sug[0].id, 'true-crime');
  assert.strictEqual(sug[0].replace, 2, 'replaces both typed words');
  assert.deepStrictEqual(S.suggest('pia', 5, { piano: 3 }).map(x => x.id), ['piano']);
  assert.deepStrictEqual(S.suggest('rock ', 5), [], 'nothing after a finished word');
});
