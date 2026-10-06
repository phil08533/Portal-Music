/**
 * Portal Music Admin — tag decisions (agreement voting)
 *
 * Turns the raw scores written by admin/analyze/analyze.py into tags:
 *
 *   A  Model A (AudioSet classifier): a tag's best mapped label probability
 *   B  Model B (CLAP): text↔audio similarity, judged against how the same tag
 *      scores across the whole catalog (z-score), so tags that score high on
 *      everything don't win by default
 *   R  rules: "Best for" tags are supported by their `imply` tags
 *      (dark + tense → horror); tempo/length/energy come from measurements
 *
 *   Calibration: the two models score on different scales, so for every tag
 *   Model B is set to flag as many songs as Model A expects to have the tag
 *   ("prevalence matching"). After that, "both say yes" means the same thing
 *   for every tag, and the agreement report (Cohen's kappa) shows per tag how
 *   much the two models agree.
 *
 *   two sources agree        → published automatically ("agree")
 *   one source only          → a hidden hint: never shown on pages, only helps
 *                              search a little; never sent to review
 *   vocals / energy / tempo  → disagreements are settled automatically (the more
 *                              confident model, a majority vote, or the measurement)
 *   review queue             → only when both models are confident AND contradict
 *   owner's review           → always wins (add / remove / approve)
 *
 * Changing tags.json or the thresholds only needs this step, not the audio run.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MUSIC_JSON = path.join(ROOT, 'data', 'music.json');
const TAGS_JSON = path.join(ROOT, 'data', 'tags.json');
const SIMILAR_JSON = path.join(ROOT, 'data', 'similar.json');
const GENRES_JSON = path.join(ROOT, 'data', 'genres.json');
const ANALYSIS_DIR = path.join(__dirname, 'analysis');
const CONFIG_JSON = path.join(ANALYSIS_DIR, 'config.json');

const DEFAULTS = {
  // per facet: A votes yes at ≥ astMin; B votes yes at z ≥ clapZ;
  // a single source counts as "strong" at ≥ astStrong / clapStrongZ
  facets: {
    mood:       { astMin: 0.12, clapZ: 0.9, clapMinZ: 0.3, astStrong: 0.45, clapStrongZ: 2.0 },
    use:        { astMin: 0.12, clapZ: 0.9, clapMinZ: 0.3, astStrong: 0.45, clapStrongZ: 2.0, implyMin: 2 },
    style:      { astMin: 0.15, clapZ: 0.9, clapMinZ: 0.3, astStrong: 0.5, clapStrongZ: 2.0 },
    instrument: { astMin: 0.15, clapZ: 0.9, clapMinZ: 0.3, astStrong: 0.5, clapStrongZ: 2.0 },
  },
  calibrateMinTracks: 30,
  minKappa: 0.2,             // tags the models agree on less than this need BOTH to be strongly sure
  hintMinStrength: 0.8,      // a one-model hint must be at least this confident…
  maxHints: 6,               // …and a song keeps at most this many    // below this, use the fixed z-score rule instead of calibration
  minPrevalence: 0.02,       // a tag fits at least 2%…
  maxPrevalence: 0.5,        // …and at most half of the catalog
  vocalsAst: 0.2,            // Model A says "vocals" at this singing probability
  vocalsStrongGap: 0.05,     // Model B's vocals-vs-instrumental similarity gap that counts as "sure"
  vocalsWinRatio: 1.5,       // the more confident model wins by this margin; otherwise review
  tempoMinPercussive: 0.02,  // below this the BPM guess is unreliable (no drums)
  tempoMinRegularity: 0.5,
  similarCount: 8,
  clapMinSpread: 0.02,       // Model B is "not listening" if a typical song scores all tags within this range
  sureMinPrecision: 0.9,     // Model A may tag on its own only where it matches your genre folders this often…
  sureMinChecked: 10,        // …measured on at least this many songs
  sureTagMinPrecision: 0.75, // a style tag whose own folder match is worse than this never goes alone
};

// ── loading ────────────────────────────────────────────────────────────────

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}

function writeJson(file, data, pretty) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, pretty ? 2 : 0) + (pretty ? '\n' : ''), 'utf8');
  fs.renameSync(tmp, file);
}

function loadConfig() {
  const saved = readJson(CONFIG_JSON, {});
  const cfg = JSON.parse(JSON.stringify(DEFAULTS));
  for (const [k, v] of Object.entries(saved)) {
    if (k === 'facets') for (const [f, o] of Object.entries(v || {})) cfg.facets[f] = { ...cfg.facets[f], ...o };
    else cfg[k] = v;
  }
  return cfg;
}

function loadAnalyses(music) {
  const out = {};
  for (const t of music) {
    const a = readJson(path.join(ANALYSIS_DIR, t.id + '.json'), null);
    if (a) out[t.id] = a;
  }
  return out;
}

function loadContext(opts = {}) {
  const music = opts.music || readJson(MUSIC_JSON, []);
  const dict = opts.tags || readJson(TAGS_JSON, { tags: [], facets: {} });
  const analyses = opts.analyses || loadAnalyses(music);
  const config = opts.config || loadConfig();
  const tagById = Object.fromEntries(dict.tags.map(t => [t.id, t]));
  const stats = catalogStats(dict, analyses, opts.allowMock, config);
  const genres = opts.genres || readJson(GENRES_JSON, { genres: {} }).genres;
  const ctx = { music, dict, analyses, config, tagById, allowMock: !!opts.allowMock, stats, genres };
  ctx.calib = calibrate(ctx);
  ctx.folder = folderCheck(ctx);
  return ctx;
}

// ── Model A checked against the owner's genre folders ─────────────────────
// Style tags know their site genre (tags.json "genre"). How often is a song Model A
// tags "metal" really in the Rock folder? Per confidence level; the lowest level that
// is right ≥ sureMinPrecision of the time is where Model A may tag on its own.
const SURE_GRID = [0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6];

function folderCheck(ctx) {
  const { dict, analyses, config, music } = ctx;
  const styles = dict.tags.filter(t => t.facet === 'style' && t.genre && t.ast);
  const levels = SURE_GRID.map(thr => ({ thr, checked: 0, right: 0 }));
  const perTag = {};
  for (const tr of music) {
    const a = analyses[tr.id];
    if (!usable(a, ctx.allowMock) || !tr.genre || (a.review && a.review.autoGenre)) continue;
    for (const t of styles) {
      const A = astScore(a, t) || 0;
      const ok = tr.genre === t.genre;
      levels.forEach((l, i) => {
        if (A < l.thr) return;
        l.checked++; if (ok) l.right++;
        const p = ((perTag[t.id] = perTag[t.id] || SURE_GRID.map(() => ({ checked: 0, right: 0 })))[i]);
        p.checked++; if (ok) p.right++;
      });
    }
  }
  for (const l of levels) l.precision = l.checked ? l.right / l.checked : null;
  const sure = levels.find(l => l.checked >= config.sureMinChecked && l.precision >= config.sureMinPrecision);
  return { levels, perTag, sureThreshold: sure ? sure.thr : null, sure: sure || null };
}

// Model A on its own is trusted only at a confidence level checked against your folders
function aloneThreshold(ctx, t, fc) {
  const f = ctx.folder;
  if (!f || f.sureThreshold == null) return Infinity;
  if (t.facet === 'style') {
    const i = SURE_GRID.indexOf(f.sureThreshold);
    const own = (f.perTag[t.id] || [])[i];
    if (own && own.checked >= 5 && own.right / own.checked < ctx.config.sureTagMinPrecision) return Infinity;
    return Math.max(f.sureThreshold, fc.astMin);
  }
  // moods/instruments/uses can't be checked against folders: stay stricter
  return Math.max(f.sureThreshold, fc.astStrong);
}

// ── calibration: make Model B flag as many songs per tag as Model A does ──

function clapRel(a, tag) {
  if (!tag.clap || !a.clap || a.clap[tag.id] == null) return null;
  return a.clap[tag.id] - (a.clap._baseline || 0);
}

function calibrate(ctx) {
  const { dict, analyses, config } = ctx;
  const list = Object.values(analyses).filter(a => usable(a, ctx.allowMock));
  const N = list.length;
  const out = {};
  if (N < config.calibrateMinTracks || ctx.stats.clapOff) return out;
  for (const t of dict.tags) {
    const fc = config.facets[t.facet];
    if (!fc || !t.ast || !t.clap) continue;
    const A = list.map(a => astScore(a, t) || 0);
    const B = list.map(a => clapRel(a, t));
    if (B.some(v => v == null)) continue;
    const countA = A.filter(v => v >= fc.astMin).length;
    const prevalence = Math.min(config.maxPrevalence, Math.max(config.minPrevalence, countA / N));
    const k = Math.max(1, Math.round(prevalence * N));
    const bThr = B.slice().sort((x, y) => y - x)[k - 1];
    // How much the two models agree on this tag (Cohen's kappa)
    let both = 0, onlyA = 0, onlyB = 0;
    for (let i = 0; i < N; i++) {
      const ya = A[i] >= fc.astMin, yb = B[i] >= bThr;
      if (ya && yb) both++; else if (ya) onlyA++; else if (yb) onlyB++;
    }
    const nA = both + onlyA, nB = both + onlyB, neither = N - both - onlyA - onlyB;
    const po = (both + neither) / N;
    const pe = (nA / N) * (nB / N) + ((N - nA) / N) * ((N - nB) / N);
    const kappa = pe < 1 ? (po - pe) / (1 - pe) : 1;
    out[t.id] = { prevalence, bThr, nA, nB, both, kappa };
  }
  return out;
}

// Per-tag agreement between the two models, for the 🏷️ Tags tab
function agreementReport(ctx) {
  const rows = Object.entries(ctx.calib).map(([id, c]) => ({
    id, label: (ctx.tagById[id] || {}).label || id, facet: (ctx.tagById[id] || {}).facet,
    songsA: c.nA, songsB: c.nB, both: c.both, kappa: Math.round(c.kappa * 100) / 100,
  }));
  const flagged = rows.reduce((s, r) => s + Math.max(r.songsA, r.songsB), 0);
  const agreed = rows.reduce((s, r) => s + r.both, 0);
  const kappas = rows.map(r => r.kappa);
  return {
    calibrated: rows.length > 0,
    modelB: { working: !ctx.stats.clapOff, spread: ctx.stats.clapSpread },
    folder: ctx.folder ? { sureThreshold: ctx.folder.sureThreshold, levels: ctx.folder.levels } : null,
    tracks: Object.values(ctx.analyses).filter(a => usable(a, ctx.allowMock)).length,
    overallAgreement: flagged ? agreed / flagged : null,
    medianKappa: kappas.length ? kappas.sort((x, y) => x - y)[Math.floor(kappas.length / 2)] : null,
    tags: rows.sort((x, y) => x.kappa - y.kappa),
  };
}

// ── catalog statistics (for z-scores and energy percentiles) ──────────────

function usable(a, allowMock) {
  return a && !a.error && a.dsp && (allowMock || !a.mock);
}

function meanStd(values) {
  if (!values.length) return { mean: 0, std: 1 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const v = values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(v) || 1e-6 };
}

function catalogStats(dict, analyses, allowMock, config = DEFAULTS) {
  const list = Object.values(analyses).filter(a => usable(a, allowMock));
  // Is Model B actually listening? A working CLAP scores a song very differently per tag;
  // a broken one (e.g. weights that didn't load) gives every tag the same number.
  const tagIds = dict.tags.filter(t => t.clap).map(t => t.id);
  const spreads = list.filter(a => a.clap).map(a => {
    const v = tagIds.map(id => a.clap[id]).filter(x => typeof x === 'number');
    return v.length > 1 ? Math.max(...v) - Math.min(...v) : 0;
  }).sort((x, y) => x - y);
  const clapSpread = spreads.length ? spreads[Math.floor(spreads.length / 2)] : 0;
  const clapOff = !spreads.length || clapSpread < config.clapMinSpread;
  const clap = {};
  for (const t of dict.tags) {
    if (!t.clap) continue;
    // relative to the neutral "music" prompt, so loud/odd tracks don't score high on every tag
    clap[t.id] = meanStd(list.filter(a => a.clap && a.clap[t.id] != null)
      .map(a => a.clap[t.id] - (a.clap._baseline || 0)));
  }
  const dspKeys = ['loudnessDb', 'percussiveRatio', 'onsetRate', 'brightnessHz', 'bpm'];
  const sorted = {};
  for (const k of dspKeys) sorted[k] = list.map(a => a.dsp[k]).filter(v => typeof v === 'number').sort((x, y) => x - y);
  // Model B's raw "vocals minus instrumental" gap is biased (one prompt may always score higher),
  // so decisions use the gap relative to the catalog's typical gap
  const gaps = list.filter(a => a.clap && a.clap.vocals != null && a.clap.instrumental != null)
    .map(a => a.clap.vocals - a.clap.instrumental).sort((x, y) => x - y);
  const vocalGapMedian = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  return { clap, sorted, count: list.length, vocalGapMedian, clapOff, clapSpread };
}

function percentile(sortedValues, v) {
  if (!sortedValues.length) return 0.5;
  let lo = 0, hi = sortedValues.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedValues[mid] < v) lo = mid + 1; else hi = mid; }
  return lo / sortedValues.length;
}

// ── evidence ───────────────────────────────────────────────────────────────

function astScore(a, tag) {
  if (!tag.ast || !a.ast) return null;
  return Math.max(0, ...tag.ast.map(l => a.ast[l] || 0));
}

function clapZ(a, tag, stats) {
  if (!tag.clap || !a.clap || a.clap[tag.id] == null) return null;
  const s = stats.clap[tag.id];
  if (!s || stats.clapOff) return null;
  return ((a.clap[tag.id] - (a.clap._baseline || 0)) - s.mean) / s.std;
}

function fmtDuration(sec) {
  const s = Math.round(sec);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// ── the decision for one track ─────────────────────────────────────────────

function decideTrack(ctx, track, opts = {}) {
  const a = ctx.analyses[track.id];
  if (!usable(a, opts.allowMock || ctx.allowMock)) return null;
  const { dict, config, stats, tagById } = ctx;
  const byFacet = {};
  for (const t of dict.tags) (byFacet[t.facet] = byFacet[t.facet] || []).push(t);

  const decided = {};   // tagId → { conf: 'agree'|'measured'|'single'|'owner', score, why }
  const suggested = {}; // tagId → { score, why }
  const notes = [];

  // Measured: length and tempo
  const dur = a.dsp.durationSec;
  const bpm = a.dsp.bpm;
  const tempoReliable = a.dsp.percussiveRatio >= config.tempoMinPercussive && a.dsp.beatRegularity >= config.tempoMinRegularity;
  for (const t of byFacet.length || []) {
    const r = t.rule || {};
    if ((r.secMin == null || dur >= r.secMin) && (r.secMax == null || dur < r.secMax)) {
      decided[t.id] = { conf: 'measured', score: 1, why: `length ${fmtDuration(dur)}` };
    }
  }
  for (const t of byFacet.tempo || []) {
    const r = t.rule || {};
    if ((r.bpmMin == null || bpm >= r.bpmMin) && (r.bpmMax == null || bpm < r.bpmMax)) {
      const why = `${Math.round(bpm)} BPM`;
      if (tempoReliable) decided[t.id] = { conf: 'measured', score: 1, why };
      else if (a.dsp.percussiveRatio >= config.tempoMinPercussive) decided[t.id] = { conf: 'measured', score: 0.6, why: why + ' (rough)' };
    }
  }
  // No drums at all: the BPM guess is meaningless, but it *feels* slow
  if (!tempoReliable && a.dsp.percussiveRatio < config.tempoMinPercussive && tagById.slow) {
    decided.slow = { conf: 'measured', score: 0.6, why: 'no steady beat' };
  }

  // Multi-label facets: A + B (+ rules for "Best for")
  const order = ['mood', 'style', 'instrument', 'use'];   // "use" last: its rule reads mood/style results
  for (const facet of order) {
    const fc = config.facets[facet] || DEFAULTS.facets.mood;
    const scored = [];
    for (const t of byFacet[facet] || []) {
      const A = astScore(a, t), B = clapZ(a, t, stats);
      const votes = [];
      const cal = ctx.calib[t.id];
      // A tag the two models rarely agree on is unreliable: then only strong certainty from both counts
      const shaky = cal && cal.kappa < config.minKappa;
      if (A != null && A >= (shaky ? fc.astStrong : fc.astMin)) votes.push('A');
      const bYes = B != null && (shaky ? B >= fc.clapStrongZ
        : cal ? clapRel(a, t) >= cal.bThr && B >= fc.clapMinZ : B >= fc.clapZ);
      if (bYes) votes.push('B');
      // Style + your own genre folder: a second, independent witness
      if (facet === 'style' && A != null && A >= fc.astMin && t.genre && track.genre === t.genre && !(a.review && a.review.autoGenre)) {
        if (!votes.includes('A')) votes.push('A');
        votes.push('F');
      }
      if (facet === 'use' && t.imply && t.imply.length) {
        const hits = t.imply.filter(id => decided[id]).length;
        if (hits >= Math.min(fc.implyMin || 2, t.imply.length)) votes.push('R');
      }
      const strength = Math.max(A != null ? A / Math.max(fc.astStrong, 1e-6) : 0, B != null ? B / fc.clapStrongZ : 0);
      const sure = A != null && A >= aloneThreshold(ctx, t, fc);
      const why = [A != null ? `A ${A.toFixed(2)}${sure ? ' (sure)' : ''}` : null, B != null ? `B z${B.toFixed(1)}` : null,
        votes.includes('F') ? 'your folder' : null, votes.includes('R') ? 'rule' : null].filter(Boolean).join(', ');
      scored.push({ t, votes, sure, strength, why });
    }
    const ok = s => s.votes.length >= 2 || s.sure;
    scored.sort((x, y) => ok(y) - ok(x) || y.votes.length - x.votes.length || y.strength - x.strength);
    let kept = 0;
    for (const s of scored) {
      if (ok(s) && kept < (dict.facets[facet] || {}).max) {
        decided[s.t.id] = { conf: s.votes.length >= 2 ? 'agree' : 'sure', score: Math.min(1, s.strength), why: s.why };
        kept++;
      } else if (s.votes.length === 1 && s.strength >= config.hintMinStrength) {
        // one confident model only: a hidden hint (helps search a little, never shown, never reviewed)
        suggested[s.t.id] = { score: Math.min(1, s.strength / 2), why: s.why + ' (one model only)' };
      }
    }
  }

  // Single-choice: vocals (A singing vs B), energy (measurements + A + B)
  const vocalLabels = ['Singing', 'Male singing', 'Female singing', 'Rapping', 'Vocal music', 'Choir', 'Child singing', 'Synthetic singing'];
  const aVocal = Math.max(0, ...vocalLabels.map(l => (a.ast || {})[l] || 0));
  const vA = a.ast ? (aVocal >= config.vocalsAst ? 'vocals' : 'instrumental') : null;
  const gap = !stats.clapOff && a.clap && a.clap.vocals != null && a.clap.instrumental != null
    ? (a.clap.vocals - a.clap.instrumental) - stats.vocalGapMedian : null;
  const vB = gap != null ? (gap > 0 ? 'vocals' : 'instrumental') : null;
  const vocalWhy = `A singing ${aVocal.toFixed(2)}${vB ? `, B prefers ${vB}` : ''}`;
  if (vA && vB && vA === vB) decided[vA] = { conf: 'agree', score: 1, why: vocalWhy };
  else if (vA && vB) {
    // How sure is each model? (distance from its own decision line)
    const thr = config.vocalsAst;
    const aConf = vA === 'vocals' ? (aVocal - thr) / thr : (thr - aVocal) / thr;
    const bConf = Math.abs(gap) / config.vocalsStrongGap;
    const ratio = config.vocalsWinRatio;
    if (aConf >= bConf * ratio) decided[vA] = { conf: 'resolved', score: 0.8, why: vocalWhy + ' → Model A was surer' };
    else if (bConf >= aConf * ratio) decided[vB] = { conf: 'resolved', score: 0.8, why: vocalWhy + ' → Model B was surer' };
    else if (track.artist && tagById.vocals) decided.vocals = { conf: 'resolved', score: 0.6, why: vocalWhy + ' → named artist, so vocals' };
    else { suggested[vA] = { score: 0.5, why: vocalWhy }; suggested[vB] = { score: 0.5, why: vocalWhy }; notes.push('vocals: the two models disagree'); }
  } else if (vA || vB) decided[vA || vB] = { conf: 'resolved', score: 0.6, why: vocalWhy + ' (one model available)' };

  const sorted = stats.sorted;
  const energyIndex = ['loudnessDb', 'percussiveRatio', 'onsetRate', 'brightnessHz', 'bpm']
    .map(k => percentile(sorted[k], a.dsp[k])).reduce((s, v) => s + v, 0) / 5;
  const eM = energyIndex < 0.36 ? 'low-energy' : energyIndex > 0.64 ? 'high-energy' : 'medium-energy';
  const eVotes = { [eM]: ['measured'] };
  const eTags = ['low-energy', 'medium-energy', 'high-energy'].filter(id => tagById[id]);
  const bestB = eTags.map(id => [id, clapZ(a, tagById[id], stats)]).filter(([, z]) => z != null).sort((x, y) => y[1] - x[1])[0];
  if (bestB) (eVotes[bestB[0]] = eVotes[bestB[0]] || []).push('B');
  const excite = (a.ast || {})['Exciting music'] || 0, tender = Math.max((a.ast || {})['Tender music'] || 0, (a.ast || {})['Ambient music'] || 0);
  if (a.ast && Math.abs(excite - tender) > 0.05) {
    const aE = excite > tender ? (energyIndex > 0.5 ? 'high-energy' : 'medium-energy') : (energyIndex < 0.5 ? 'low-energy' : 'medium-energy');
    (eVotes[aE] = eVotes[aE] || []).push('A');
  }
  const eBest = Object.entries(eVotes).sort((x, y) => y[1].length - x[1].length)[0];
  const eWhy = `energy ${Math.round(energyIndex * 100)}/100 (${eBest[1].join('+')})`;
  if (eBest[1].length >= 2) decided[eBest[0]] = { conf: 'agree', score: 1, why: eWhy };
  else decided[eM] = { conf: 'measured', score: 0.6, why: eWhy + ' (models split, measurement wins)' };

  // A suggested genre move: the strongest agreed style's site genre
  const topStyle = Object.entries(decided).filter(([id]) => (tagById[id] || {}).facet === 'style')
    .sort((x, y) => y[1].score - x[1].score)[0];
  const styleGenre = topStyle && tagById[topStyle[0]].genre;
  const genreSuggestion = styleGenre && styleGenre !== track.genre ? styleGenre : null;
  // Batch uploads marked "let the AI pick": the genre (and a matching subgenre) is set automatically
  const reviewInfo = a.review || {};
  const genreAuto = reviewInfo.autoGenre && !reviewInfo.genre && styleGenre
    ? { genre: styleGenre, subgenre: pickSubgenre(styleGenre, Object.keys(decided).filter(id => (tagById[id] || {}).facet === 'style').map(id => tagById[id]), ctx) }
    : null;

  // The owner's review always wins
  const review = a.review || {};
  for (const id of review.remove || []) { delete decided[id]; delete suggested[id]; }
  for (const id of review.add || []) if (tagById[id]) { decided[id] = { conf: 'owner', score: 1, why: 'added by you' }; delete suggested[id]; }
  if (review.status === 'approved') {
    for (const k of Object.keys(decided)) decided[k].conf = decided[k].conf === 'measured' ? 'measured' : 'owner';
    for (const k of Object.keys(suggested)) delete suggested[k];   // approving = rejecting what you didn't add
  }
  // Single-choice facets keep one tag (owner's pick or the strongest)
  for (const facet of ['energy', 'vocals', 'tempo', 'length']) {
    const ids = Object.keys(decided).filter(id => (tagById[id] || {}).facet === facet);
    if (ids.length > 1) {
      ids.sort((x, y) => (decided[y].conf === 'owner') - (decided[x].conf === 'owner') || decided[y].score - decided[x].score);
      for (const id of ids.slice(1)) delete decided[id];
    }
  }

  // Review only real conflicts (both models confident and contradicting). One-model hints and
  // genre suggestions never put a song in the queue.
  const needsReview = review.status !== 'approved' && notes.length > 0;
  const multi = id => ['mood', 'style', 'instrument', 'use'].includes((tagById[id] || {}).facet);
  return {
    id: track.id,
    labels: Object.keys(decided),
    hints: Object.keys(suggested).filter(id => multi(id) && !decided[id])
      .sort((x, y) => suggested[y].score - suggested[x].score).slice(0, config.maxHints),
    decided, suggested, notes,
    measured: { bpm: Math.round(bpm), tempoReliable, key: a.dsp.key, durationSec: Math.round(dur), duration: fmtDuration(dur) },
    genreSuggestion: review.genre || genreAuto ? null : genreSuggestion,
    genreAuto,
    status: review.status === 'approved' ? 'approved' : needsReview ? 'review' : 'auto',
    mock: !!a.mock,
  };
}

// The site subgenre that best matches the agreed styles (e.g. lofi → "Lo-Fi"), else the genre itself
function pickSubgenre(genre, styleTags, ctx) {
  const subs = ((ctx.genres || {})[genre] || {}).subgenres || [];
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const t of styleTags) {
    for (const sub of subs) {
      if ([norm(t.label), norm(t.id)].some(n => n && (norm(sub).includes(n) || n.includes(norm(sub))))) return sub;
    }
  }
  return subs.includes(genre) ? genre : (subs[0] || genre);
}

function decideAll(ctx, opts = {}) {
  const out = {};
  for (const t of ctx.music) {
    const d = decideTrack(ctx, t, opts);
    if (d) out[t.id] = d;
  }
  return out;
}

// ── similar tracks (CLAP embeddings + shared tags) ─────────────────────────

function similarTracks(ctx, decisions, opts = {}) {
  const items = ctx.music.map(t => ({ t, a: ctx.analyses[t.id] }))
    .filter(x => usable(x.a, opts.allowMock || ctx.allowMock) && Array.isArray(x.a.emb) && x.a.emb.length);
  const n = ctx.config.similarCount;
  const out = {};
  for (const x of items) {
    const mine = new Set((decisions[x.t.id] || {}).labels || []);
    const scored = [];
    for (const y of items) {
      if (y === x || y.a.emb.length !== x.a.emb.length) continue;
      let dot = 0;
      for (let i = 0; i < x.a.emb.length; i++) dot += x.a.emb[i] * y.a.emb[i];
      const theirs = (decisions[y.t.id] || {}).labels || [];
      const shared = theirs.filter(id => mine.has(id)).length;
      const jaccard = shared / Math.max(1, mine.size + theirs.length - shared);
      scored.push([y.t.id, 0.8 * dot + 0.2 * jaccard]);
    }
    scored.sort((p, q) => q[1] - p[1]);
    out[x.t.id] = scored.slice(0, n).map(s => s[0]);
  }
  return out;
}

// ── publish into the site's data files ────────────────────────────────────

function publish(opts = {}) {
  const ctx = loadContext(opts);
  const decisions = decideAll(ctx, opts);
  let changed = 0;
  for (const t of ctx.music) {
    const d = decisions[t.id];
    if (!d || d.mock) continue;     // test data never reaches the site
    const before = JSON.stringify([t.labels, t.bpm, t.key, t.duration, t.durationSec, t.genre]);
    t.labels = d.labels;
    if (d.hints.length) t.hints = d.hints; else delete t.hints;
    t.bpm = d.measured.bpm;
    t.key = d.measured.key;
    t.durationSec = d.measured.durationSec;
    if (!t.duration) t.duration = d.measured.duration;
    const g = (ctx.analyses[t.id].review || {}).genre;
    if (g && g !== t.genre) {      // owner accepted a genre move
      t.genre = g;
      if (!t.subgenre || t.subgenre === t.genre) t.subgenre = g;
    }
    if (d.genreAuto) {             // batch upload: the AI picked the genre; lock it in as if approved
      t.genre = d.genreAuto.genre;
      t.subgenre = d.genreAuto.subgenre;
      if (!opts.dryRun && !opts.analyses) {
        const file = path.join(ANALYSIS_DIR, t.id + '.json');
        const a = readJson(file, null);
        if (a) { a.review = { ...(a.review || {}), genre: t.genre, autoGenre: false }; writeJson(file, a, false); }
      }
    }
    if (JSON.stringify([t.labels, t.bpm, t.key, t.duration, t.durationSec, t.genre]) !== before) changed++;
  }
  if (!opts.dryRun) {
    writeJson(opts.musicPath || MUSIC_JSON, ctx.music, true);
    writeJson(opts.similarPath || SIMILAR_JSON, similarTracks(ctx, decisions, opts), false);
  }
  const counts = { auto: 0, review: 0, approved: 0 };
  for (const d of Object.values(decisions)) counts[d.status]++;
  return { tracks: Object.keys(decisions).length, changed, ...counts };
}

// ── review ────────────────────────────────────────────────────────────────

function setReview(trackId, review) {
  const file = path.join(ANALYSIS_DIR, trackId + '.json');
  const a = readJson(file, null);
  if (!a) throw new Error('This track has not been analyzed yet');
  const dict = readJson(TAGS_JSON, { tags: [] });
  const known = new Set(dict.tags.map(t => t.id));
  const clean = ids => [...new Set((ids || []).map(String))].filter(id => known.has(id));
  a.review = {
    status: review.status === 'approved' ? 'approved' : 'pending',
    add: clean(review.add),
    remove: clean(review.remove),
    at: Date.now(),
  };
  if (review.genre) a.review.genre = String(review.genre).slice(0, 60);
  if (a.review.autoGenre === undefined && (readJson(file, {}).review || {}).autoGenre) a.review.autoGenre = true;
  writeJson(file, a, false);
  return a.review;
}

// Batch uploads: "let the AI pick the genre" (applied when its tags are published)
function markAutoGenre(trackId) {
  fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
  const file = path.join(ANALYSIS_DIR, trackId + '.json');
  const a = readJson(file, {}) || {};
  a.review = { status: 'pending', add: [], remove: [], ...(a.review || {}), autoGenre: true };
  writeJson(file, a, false);
}

// ── accuracy: auto decisions vs the owner's approved tracks ───────────────

function accuracy(ctx, config) {
  const cfgCtx = config ? { ...ctx, config } : ctx;
  if (config) cfgCtx.calib = calibrate(cfgCtx);      // thresholds changed → recalibrate Model B
  const perFacet = {};
  const perTag = {};
  let tracks = 0;
  for (const t of ctx.music) {
    const a = ctx.analyses[t.id];
    if (!usable(a, ctx.allowMock) || !a.review || a.review.status !== 'approved') continue;
    tracks++;
    const truth = new Set((decideTrack(cfgCtx, t) || {}).labels || []);
    const stripped = { ...a, review: undefined };
    const auto = new Set((decideTrack({ ...cfgCtx, analyses: { ...ctx.analyses, [t.id]: stripped } }, t) || {}).labels || []);
    for (const tag of ctx.dict.tags) {
      if (tag.facet === 'length') continue; // measured exactly, nothing to learn
      const f = (perFacet[tag.facet] = perFacet[tag.facet] || { tp: 0, fp: 0, fn: 0 });
      const p = (perTag[tag.id] = perTag[tag.id] || { tp: 0, fp: 0, fn: 0 });
      const inA = auto.has(tag.id), inT = truth.has(tag.id);
      if (inA && inT) { f.tp++; p.tp++; } else if (inA) { f.fp++; p.fp++; } else if (inT) { f.fn++; p.fn++; }
    }
  }
  const score = c => {
    const precision = c.tp + c.fp ? c.tp / (c.tp + c.fp) : null;
    const recall = c.tp + c.fn ? c.tp / (c.tp + c.fn) : null;
    const f1 = precision != null && recall != null && precision + recall ? 2 * precision * recall / (precision + recall) : null;
    return { ...c, precision, recall, f1 };
  };
  const facets = Object.fromEntries(Object.entries(perFacet).map(([k, v]) => [k, score(v)]));
  const f1s = Object.values(facets).map(f => f.f1).filter(v => v != null);
  return {
    tracks,
    facets,
    tags: Object.fromEntries(Object.entries(perTag).filter(([, v]) => v.tp + v.fp + v.fn).map(([k, v]) => [k, score(v)])),
    macroF1: f1s.length ? f1s.reduce((s, v) => s + v, 0) / f1s.length : null,
  };
}

// Search each facet's thresholds for the best agreement with the owner's answers
function tune(opts = {}) {
  const ctx = loadContext(opts);
  const base = accuracy(ctx);
  if (base.tracks < (opts.minTracks || 20)) {
    return { ok: false, message: `Approve at least ${opts.minTracks || 20} tracks first (you have ${base.tracks}).`, before: base };
  }
  const config = JSON.parse(JSON.stringify(ctx.config));
  const grid = { astMin: [0.06, 0.1, 0.15, 0.2, 0.3], clapZ: [0.3, 0.6, 0.9, 1.2, 1.6] };
  for (const facet of Object.keys(config.facets)) {
    let best = { f1: -1 };
    for (const astMin of grid.astMin) {
      for (const cz of grid.clapZ) {
        const trial = JSON.parse(JSON.stringify(config));
        trial.facets[facet] = { ...trial.facets[facet], astMin, clapZ: cz };
        const f = (accuracy(ctx, trial).facets[facet] || {}).f1;
        if (f != null && f > best.f1) best = { f1: f, astMin, clapZ: cz };
      }
    }
    if (best.f1 >= 0) config.facets[facet] = { ...config.facets[facet], astMin: best.astMin, clapZ: best.clapZ };
  }
  const after = accuracy(ctx, config);
  if (!opts.dryRun && (after.macroF1 || 0) >= (base.macroF1 || 0)) {
    writeJson(opts.configPath || CONFIG_JSON, { facets: config.facets }, true);
  }
  return { ok: true, before: base, after, config: config.facets };
}

module.exports = {
  DEFAULTS, loadContext, decideTrack, decideAll, publish, setReview, markAutoGenre, accuracy, tune, similarTracks, agreementReport,
  ANALYSIS_DIR,
};
