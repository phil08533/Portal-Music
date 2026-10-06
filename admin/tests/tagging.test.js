// Tests for the tag decision engine (admin/tagging.js) with hand-built scores.
// Run: node --test admin/tests/
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tagging = require('../tagging');

const dict = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'tags.json'), 'utf8'));

// A neutral analysis: every CLAP tag at the same similarity, AudioSet near zero
function neutral(i, over = {}) {
  const clap = { _baseline: 0.2 };
  for (const t of dict.tags) if (t.clap) clap[t.id] = 0.25 + ((i * 37 + t.id.length * 11) % 10) / 1000;
  return {
    version: 1,
    dsp: { durationSec: 150, bpm: 100, beatRegularity: 0.9, loudnessDb: -20 + (i % 7), percussiveRatio: 0.2 + (i % 5) / 50,
      brightnessHz: 2000 + i * 13, onsetRate: 2 + (i % 4) / 3, key: 'C major', keyConfidence: 0.1 },
    ast: { 'Music': 0.9, 'Singing': 0.01 },
    clap,
    emb: [Math.cos(i), Math.sin(i), 0.1],
    ...over,
  };
}

function catalog(special) {
  const music = [], analyses = {};
  for (let i = 0; i < 40; i++) {
    music.push({ id: 'n' + i, title: 'Filler ' + i, genre: 'Pop' });
    analyses['n' + i] = neutral(i);
  }
  for (const [id, a, genre] of special) {
    music.push({ id, title: id, genre: genre || 'Pop' });
    analyses[id] = a;
  }
  return { music, analyses };
}

function boosted(i, clapBoost, ast, dsp) {
  const a = neutral(i);
  for (const [id, v] of Object.entries(clapBoost)) a.clap[id] = v;
  Object.assign(a.ast, ast || {});
  Object.assign(a.dsp, dsp || {});
  return a;
}

const horrorTrack = boosted(100,
  { scary: 0.45, dark: 0.44, tense: 0.43, horror: 0.46, instrumental: 0.4, 'low-energy': 0.4 },
  { 'Scary music': 0.7, 'Ambient music': 0.4 },
  { bpm: 72, percussiveRatio: 0.05, loudnessDb: -30, onsetRate: 1, brightnessHz: 900, durationSec: 55 });

const vocalPop = boosted(101,
  { happy: 0.45, vocals: 0.45, pop: 0.46 },
  { 'Happy music': 0.6, 'Singing': 0.7, 'Female singing': 0.6, 'Pop music': 0.7 },
  { bpm: 128, durationSec: 200 });

const oneModelOnly = boosted(102, {}, { 'Sad music': 0.8 });

test('agreement publishes tags; one model only is just a suggestion', () => {
  const { music, analyses } = catalog([['horror', horrorTrack], ['pop', vocalPop], ['single', oneModelOnly]]);
  const ctx = tagging.loadContext({ music, analyses, tags: dict });
  const h = tagging.decideTrack(ctx, music.find(t => t.id === 'horror'));
  for (const id of ['scary', 'dark', 'tense', 'horror', 'slow', 'short']) assert.ok(h.labels.includes(id), 'horror track should have ' + id + ' — got ' + h.labels);
  assert.strictEqual(h.decided.horror.conf, 'agree');
  assert.ok(!h.labels.includes('happy'));

  const p = tagging.decideTrack(ctx, music.find(t => t.id === 'pop'));
  for (const id of ['happy', 'vocals', 'pop', 'fast', 'long']) assert.ok(p.labels.includes(id), 'pop track should have ' + id + ' — got ' + p.labels);
  assert.ok(!p.labels.includes('instrumental'));

  const s = tagging.decideTrack(ctx, music.find(t => t.id === 'single'));
  assert.ok(!s.labels.includes('sad'), 'one model should not publish');
  assert.ok(s.hints.includes('sad'), 'but it becomes a hidden search hint');
  assert.strictEqual(s.status, 'auto', 'and it must NOT go to review');
});

test('no drums: tempo is "slow", without asking', () => {
  const ambient = boosted(103, {}, {}, { bpm: 140, percussiveRatio: 0.001, beatRegularity: 0.2 });
  const { music, analyses } = catalog([['amb', ambient]]);
  const d = tagging.decideTrack(tagging.loadContext({ music, analyses, tags: dict }), music.find(t => t.id === 'amb'));
  assert.ok(!d.labels.includes('fast'));
  assert.ok(d.labels.includes('slow'));
  assert.strictEqual(d.status, 'auto');
});

test('vocals disagreements settle themselves; only true conflicts reach review', () => {
  // Model A: clearly singing. Model B: leans instrumental, but only a little → A wins
  const aSure = boosted(110, { instrumental: 0.27, vocals: 0.25 }, { Singing: 0.9 });
  // Both models equally sure and contradicting → the one case that needs a human
  const clash = boosted(111, { instrumental: 0.30, vocals: 0.27 }, { Singing: 0.33 });
  // …unless the track has a named artist (tiebreak: vocals)
  const clashArtist = JSON.parse(JSON.stringify(clash));
  const { music, analyses } = catalog([['asure', aSure], ['clash', clash], ['clashA', clashArtist]]);
  music.find(t => t.id === 'clashA').artist = 'Avilyn Grace';
  const ctx = tagging.loadContext({ music, analyses, tags: dict });
  const d1 = tagging.decideTrack(ctx, music.find(t => t.id === 'asure'));
  assert.ok(d1.labels.includes('vocals') && d1.status === 'auto', JSON.stringify(d1.decided.vocals || d1.notes));
  const d2 = tagging.decideTrack(ctx, music.find(t => t.id === 'clash'));
  assert.strictEqual(d2.status, 'review');
  assert.ok(!d2.labels.includes('vocals') && !d2.labels.includes('instrumental'));
  const d3 = tagging.decideTrack(ctx, music.find(t => t.id === 'clashA'));
  assert.ok(d3.labels.includes('vocals') && d3.status === 'auto');
});

test('calibration: Model B is matched to Model A, so they agree', () => {
  // 12 "epic" songs: Model A clearly says epic; Model B ranks them highest, but only slightly
  // above the rest (its scale is squashed). A fixed z-score rule would miss them; calibration doesn't.
  const special = [];
  for (let i = 0; i < 12; i++) special.push(['e' + i, boosted(300 + i, { epic: 0.262 + i * 0.0005 }, { 'Soundtrack music': 0.5 })]);
  const { music, analyses } = catalog(special);
  const ctx = tagging.loadContext({ music, analyses, tags: dict });
  const agreed = special.filter(([id]) => tagging.decideTrack(ctx, music.find(t => t.id === id)).labels.includes('epic')).length;
  assert.strictEqual(agreed, 12, 'all 12 epic songs should be agreed');
  const rep = tagging.agreementReport(ctx);
  const epic = rep.tags.find(r => r.id === 'epic');
  assert.ok(epic && epic.kappa > 0.9, 'models agree on epic: ' + JSON.stringify(epic));
  const fillerEpic = music.filter(t => t.id.startsWith('n')).filter(t => tagging.decideTrack(ctx, t).labels.includes('epic')).length;
  assert.strictEqual(fillerEpic, 0, 'no false epics');
});

test('single-choice facets keep exactly one tag', () => {
  const { music, analyses } = catalog([['horror', horrorTrack], ['pop', vocalPop]]);
  const ctx = tagging.loadContext({ music, analyses, tags: dict });
  for (const d of Object.values(tagging.decideAll(ctx))) {
    for (const facet of ['energy', 'vocals', 'tempo', 'length']) {
      const n = d.labels.filter(id => ctx.tagById[id].facet === facet).length;
      assert.ok(n <= 1, `${d.id} has ${n} ${facet} tags`);
    }
    for (const [facet, f] of Object.entries(dict.facets)) {
      if (f.max) assert.ok(d.labels.filter(id => ctx.tagById[id].facet === facet).length <= f.max);
    }
  }
});

test("the owner's review wins: add, remove, approve, genre", () => {
  const h = JSON.parse(JSON.stringify(horrorTrack));
  h.review = { status: 'approved', add: ['true-crime'], remove: ['tense'], genre: 'Dark & Suspense' };
  const { music, analyses } = catalog([['horror', h, 'Cinematic'], ['single', JSON.parse(JSON.stringify(oneModelOnly))]]);
  const ctx = tagging.loadContext({ music, analyses, tags: dict });
  const d = tagging.decideTrack(ctx, music.find(t => t.id === 'horror'));
  assert.ok(d.labels.includes('true-crime') && !d.labels.includes('tense'));
  assert.strictEqual(d.status, 'approved');
  assert.deepStrictEqual(Object.keys(d.suggested), []);
  assert.strictEqual(d.decided.horror.conf, 'owner');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-tag-'));
  const res = tagging.publish({ music, analyses, tags: dict, musicPath: path.join(dir, 'm.json'), similarPath: path.join(dir, 's.json') });
  const out = JSON.parse(fs.readFileSync(path.join(dir, 'm.json'), 'utf8'));
  const t = out.find(x => x.id === 'horror');
  assert.strictEqual(t.genre, 'Dark & Suspense');
  assert.ok(t.labels.includes('true-crime'));
  assert.strictEqual(t.bpm, 72);
  assert.strictEqual(t.duration, '0:55');
  const sim = JSON.parse(fs.readFileSync(path.join(dir, 's.json'), 'utf8'));
  assert.strictEqual(sim.horror.length, 8);
  assert.ok(!sim.horror.includes('horror'));
  assert.ok(res.tracks >= 40);
});

test('mock analyses are never published by default', () => {
  const m = neutral(5); m.mock = true;
  const { music, analyses } = catalog([['mocky', m]]);
  const ctx = tagging.loadContext({ music, analyses, tags: dict });
  assert.strictEqual(tagging.decideTrack(ctx, music.find(t => t.id === 'mocky')), null);
});

test('tuning improves agreement with approved answers', () => {
  // Owner says: these 25 tracks are "sad"; Model A gives them 0.08 (below the default 0.12)
  const special = [];
  for (let i = 0; i < 25; i++) {
    const a = boosted(200 + i, { sad: 0.45 }, { 'Sad music': 0.08 });
    a.review = { status: 'approved', add: [], remove: [] };
    special.push(['s' + i, a]);
  }
  // …and the owner's truth includes sad (added during review)
  for (const s of special) s[1].review.add = ['sad'];
  const { music, analyses } = catalog(special);
  const res = tagging.tune({ music, analyses, tags: dict, dryRun: true });
  assert.ok(res.ok, res.message);
  assert.ok(res.after.facets.mood.f1 > res.before.facets.mood.f1, `mood F1 ${res.before.facets.mood.f1} → ${res.after.facets.mood.f1}`);
  assert.ok(res.config.mood.astMin <= 0.08);
});
