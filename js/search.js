// ============================================
// Portal Music — "Search a sound"
// ============================================
// Turns what a visitor types ("spooky piano for a horror intro under a minute,
// no vocals") into tags from data/tags.json, then ranks tracks by the tags the
// AI tagging published (track.labels) and explains why each one matched.
// Runs entirely in the browser; also loadable in Node for tests.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PMSearch = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // How much a match in each group counts
  var FACET_WEIGHT = { use: 3, vocals: 3, mood: 2.5, style: 2.5, instrument: 2, energy: 1.5, tempo: 1.5, length: 1.5 };
  var INNER_FACETS = { use: 1, mood: 1, instrument: 1 };
  var NEGATORS = { no: 1, not: 1, without: 1, non: 1, avoid: 1, never: 1, minus: 1, except: 1 };
  var FILLER = { too: 1, very: 1, really: 1, so: 1, any: 1, overly: 1, much: 1, a: 1, the: 1 };
  // Phrases that say nothing about the sound (everything here is free & copyright-safe)
  var NOISE_PHRASES = ['no copyright', 'non copyright', 'copyright free', 'royalty free', 'no copyright music',
    'free to use', 'free music', 'for free', 'without copyright', 'no claims', 'dmca free'];
  var STOPWORDS = {};
  ('a an the and or but for to of in on at by with from my me i we you it its is are be need want looking look ' +
   'find some something any music song songs track tracks tune tunes sound sounds sounding like type kind vibe-y ' +
   'free that this these those good best nice great cool please can could would should get give just also ' +
   'background bgm audio clip video videos content channel youtube one ones more less')
    .split(' ').forEach(function (w) { STOPWORDS[w] = 1; });

  var UNIT_SEC = { s: 1, sec: 1, secs: 1, second: 1, seconds: 1, m: 60, min: 60, mins: 60, minute: 60, minutes: 60, hour: 3600, hours: 3600 };
  var NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, fifteen: 15, twenty: 20, thirty: 30, sixty: 60, half: 0.5 };

  function normalize(s) {
    return String(s || '').toLowerCase()
      .replace(/&/g, ' and ').replace(/['’]/g, '')
      .replace(/[^a-z0-9.\s-]/g, ' ').replace(/(\D)\.|\.(\D)/g, '$1 $2')
      .replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function stem(w) {
    if (w.length <= 4) return w;
    if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (/(ing)$/.test(w) && w.length > 6) return w.slice(0, -3);
    if (/(ed)$/.test(w) && w.length > 5) return w.slice(0, -2);
    if (/(es)$/.test(w) && /(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }

  // Damerau-Levenshtein distance, stopping early once it's over `max`
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev2 = null, prev = [], cur;
    for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      cur = [i];
      var best = i;
      for (j = 1; j <= b.length; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }

  function create(dict) {
    var tags = (dict && dict.tags) || [];
    var byId = {};
    var phrases = {};       // "spooky" / "no vocals" → [tag ids]
    var stems = {};         // single-word stems → [tag ids]
    var words = [];         // single words for typo matching
    var maxWords = 1;

    function add(map, key, id) {
      if (!key) return;
      (map[key] = map[key] || []);
      if (map[key].indexOf(id) === -1) map[key].push(id);
    }

    tags.forEach(function (t) {
      byId[t.id] = t;
      var all = [t.label, t.id.replace(/-/g, ' ')].concat(t.syn || []);
      all.forEach(function (raw) {
        var p = normalize(raw.replace(/\(.*?\)/g, ''));
        if (!p) return;
        add(phrases, p, t.id);
        var n = p.split(' ').length;
        if (n > maxWords) maxWords = n;
        if (n === 1) { add(stems, stem(p), t.id); if (p.length >= 4) words.push(p); }
      });
    });
    maxWords = Math.min(maxWords, 5);
    words = words.filter(function (w, i) { return words.indexOf(w) === i; });

    // ── query → tags + limits ──────────────────────────────────────────
    function parse(query) {
      var q = ' ' + normalize(query) + ' ';
      NOISE_PHRASES.forEach(function (p) { q = q.split(' ' + p + ' ').join(' '); });
      var limits = {};

      // Length limits: "under 1 minute", "less than 30 seconds", "over 3 min", "around 2 minutes"
      q = q.replace(/\b(under|less than|below|shorter than|max(?:imum)?|up to|at most|no longer than|within)\s+(?:a\s+|an\s+)?(\d+(?:\.\d+)?|a|an|one|two|three|four|five|ten|fifteen|twenty|thirty|sixty|half)?\s*(?:a\s+)?(s|secs?|seconds?|m|mins?|minutes?|hours?)\b/g,
        function (_, op, num, unit) { limits.maxSec = toSeconds(num, unit); return ' '; });
      q = q.replace(/\b(over|more than|longer than|at least|minimum|min of|above)\s+(?:a\s+|an\s+)?(\d+(?:\.\d+)?|a|an|one|two|three|four|five|ten|fifteen|twenty|thirty|sixty|half)?\s*(?:a\s+)?(s|secs?|seconds?|m|mins?|minutes?|hours?)\b/g,
        function (_, op, num, unit) { limits.minSec = toSeconds(num, unit); return ' '; });
      // (bare "s"/"m" are left alone here: "80s synth" is a decade, not 80 seconds)
      q = q.replace(/\b(about|around|roughly|approximately|exactly)?\s*(\d+(?:\.\d+)?)\s*(secs?|seconds?|mins?|minutes?)( long)?\b/g,
        function (m, about, num, unit) {
          var sec = toSeconds(num, unit);
          limits.nearSec = sec;
          return ' ';
        });
      // Tempo: "120 bpm", "over 140 bpm", "under 90bpm"
      q = q.replace(/\b(under|below|less than|over|above|more than|faster than|slower than)?\s*(\d{2,3})\s*bpm\b/g,
        function (_, op, num) {
          var n = Number(num);
          if (op && /under|below|less|slower/.test(op)) limits.maxBpm = n;
          else if (op) limits.minBpm = n;
          else { limits.minBpm = n - 8; limits.maxBpm = n + 8; }
          return ' ';
        });

      var tokens = q.split(' ').filter(Boolean);
      var found = [];        // { id, negated, text }
      var leftovers = [];
      var i = 0;
      while (i < tokens.length) {
        var hit = null;
        for (var n = Math.min(maxWords, tokens.length - i); n >= 1 && !hit; n--) {
          var phrase = tokens.slice(i, i + n).join(' ');
          if (phrases[phrase]) hit = { ids: phrases[phrase], len: n, text: phrase };
        }
        if (!hit) {
          var w = tokens[i];
          var s = stem(w);
          if (!STOPWORDS[w] && !NEGATORS[w] && stems[s]) hit = { ids: stems[s], len: 1, text: w };
          else if (!STOPWORDS[w] && !NEGATORS[w] && w.length >= 5 && !/^\d+$/.test(w)) {
            var max = w.length >= 8 ? 2 : 1, best = null, bestD = max + 1;
            for (var k = 0; k < words.length; k++) {
              var d = editDistance(w, words[k], max);
              if (d < bestD) { bestD = d; best = words[k]; }
            }
            if (best) hit = { ids: phrases[best], len: 1, text: w, corrected: best };
          }
        }
        if (hit) {
          // Negation: "no drums", "not too sad", "without piano" (skip a filler word or two)
          var negated = false;
          for (var back = i - 1; back >= 0 && back >= i - 3; back--) {
            if (NEGATORS[tokens[back]]) { negated = true; break; }
            if (!FILLER[tokens[back]]) break;
          }
          hit.ids.forEach(function (id) {
            found.push({ id: id, negated: negated, text: hit.text, corrected: hit.corrected || null });
          });
          // Words inside a longer phrase can be tags too ("trailer music" → cinematic AND trailer).
          // Only "Best for", mood and instrument words, and never inside a negating phrase ("no vocals").
          if (hit.len > 1 && !hit.text.split(' ').some(function (w) { return NEGATORS[w]; })) {
            hit.text.split(' ').forEach(function (w) {
              (phrases[w] || []).forEach(function (id) {
                var f = (byId[id] || {}).facet;
                if (INNER_FACETS[f] && hit.ids.indexOf(id) === -1) found.push({ id: id, negated: negated, text: w, corrected: null });
              });
            });
          }
          i += hit.len;
        } else {
          if (!STOPWORDS[tokens[i]] && !NEGATORS[tokens[i]] && !FILLER[tokens[i]]) leftovers.push(tokens[i]);
          i++;
        }
      }

      // One entry per tag (a negation anywhere wins); single-choice groups keep the last mention
      var seen = {};
      var tagsOut = [];
      found.forEach(function (f) {
        if (seen[f.id]) { if (f.negated) seen[f.id].negated = true; return; }
        seen[f.id] = f; tagsOut.push(f);
      });
      // "instrumental" and "no vocals" mean the same; "no instrumental" means vocals
      tagsOut.forEach(function (f) {
        if (f.negated && (f.id === 'vocals' || f.id === 'instrumental')) {
          f.id = f.id === 'vocals' ? 'instrumental' : 'vocals'; f.negated = false;
        }
      });
      var dedup = {};
      tagsOut = tagsOut.filter(function (f) { var k = f.id + (f.negated ? '!' : ''); if (dedup[k]) return false; dedup[k] = 1; return true; });

      // A length limit replaces the generic length tags
      if (limits.maxSec || limits.minSec) tagsOut = tagsOut.filter(function (f) { return (byId[f.id] || {}).facet !== 'length'; });

      return { tags: tagsOut, limits: limits, words: leftovers, query: query };
    }

    function toSeconds(num, unit) {
      var n = num == null ? 1 : (NUMBER_WORDS[num] != null ? NUMBER_WORDS[num] : Number(num));
      var u = UNIT_SEC[unit] || UNIT_SEC[unit.replace(/s$/, '')] || 60;
      return Math.round(n * u);
    }

    // ── ranking ────────────────────────────────────────────────────────
    function durationOf(song) {
      if (song.durationSec) return song.durationSec;
      var p = String(song.duration || '').split(':');
      return p.length === 2 ? Number(p[0]) * 60 + Number(p[1]) : null;
    }

    function textOf(song) {
      return normalize([song.title, song.artist, song.genre, song.subgenre].concat(song.tags || []).join(' '));
    }

    function rank(songs, parsed) {
      var wanted = parsed.tags.filter(function (f) { return !f.negated; });
      var unwanted = parsed.tags.filter(function (f) { return f.negated; });
      var L = parsed.limits;
      var results = [];

      songs.forEach(function (song) {
        var labels = song.labels || [];
        var has = {};
        labels.forEach(function (id) { has[id] = true; });
        var analyzed = labels.length > 0;
        var text = textOf(song);
        var score = 0, possible = 0, reasons = [];

        // Hard limits: length and BPM (unknown values pass, slightly lower)
        var dur = durationOf(song);
        if (dur != null) {
          if (L.maxSec && dur > L.maxSec * 1.15) return;
          if (L.minSec && dur < L.minSec * 0.85) return;
          if (L.nearSec) { var diff = Math.abs(dur - L.nearSec) / Math.max(L.nearSec, 30); score += Math.max(0, 1.5 - diff * 2); }
        } else if (L.maxSec || L.minSec) score -= 0.5;
        if (song.bpm) {
          if (L.minBpm && song.bpm < L.minBpm) return;
          if (L.maxBpm && song.bpm > L.maxBpm) return;
        }
        if (L.maxSec) reasons.push('under ' + fmt(L.maxSec));
        if (L.minSec) reasons.push('over ' + fmt(L.minSec));
        if (L.minBpm || L.maxBpm) reasons.push((L.minBpm && L.maxBpm ? '~' + Math.round((L.minBpm + L.maxBpm) / 2) : (L.minBpm ? '>' + L.minBpm : '<' + L.maxBpm)) + ' BPM');

        // Things they don't want
        for (var u = 0; u < unwanted.length; u++) {
          if (has[unwanted[u].id]) return;
          var ut = byId[unwanted[u].id];
          if (ut && ut.facet === 'style' && ut.genre && song.genre === ut.genre && !analyzed) score -= 2;
        }

        // Vocals is a hard choice: "no vocals" never shows a song with singing (and vice versa)
        for (var v = 0; v < wanted.length; v++) {
          var vt = byId[wanted[v].id];
          if (vt && vt.facet === 'vocals' && analyzed && !has[vt.id] && labels.some(function (id) { return (byId[id] || {}).facet === 'vocals'; })) return;
        }

        // Things they do want
        wanted.forEach(function (f) {
          var t = byId[f.id];
          if (!t) return;
          var w = FACET_WEIGHT[t.facet] || 1;
          possible += w;
          if (has[f.id]) { score += w; reasons.push(t.label); return; }
          // Partial credit: a "Best for" tag whose supporting moods/styles are there (dark + tense → horror)
          if (t.imply && t.imply.length) {
            var support = t.imply.filter(function (id) { return has[id]; }).length;
            if (support) { score += w * 0.35 * Math.min(support, 2); reasons.push(t.label + ' (close)'); return; }
          }
          // Measured tags we can compute without the AI
          if (t.rule && t.facet === 'length' && dur != null) {
            if ((t.rule.secMin == null || dur >= t.rule.secMin) && (t.rule.secMax == null || dur < t.rule.secMax)) { score += w; reasons.push(t.label); }
            return;
          }
          if (t.rule && t.facet === 'tempo' && song.bpm) {
            if ((t.rule.bpmMin == null || song.bpm >= t.rule.bpmMin) && (t.rule.bpmMax == null || song.bpm < t.rule.bpmMax)) { score += w; reasons.push(t.label); }
            return;
          }
          // Not analyzed yet: fall back to the genre and the words in the title/genre
          if (t.facet === 'style' && t.genre && song.genre === t.genre) { score += w * (analyzed ? 0.3 : 0.6); return; }
          var names = [normalize(t.label)].concat((t.syn || []).slice(0, 8).map(normalize));
          for (var k = 0; k < names.length; k++) {
            if (names[k].length > 2 && (' ' + text + ' ').indexOf(' ' + names[k] + ' ') !== -1) { score += w * 0.5; return; }
          }
        });

        // Leftover words: title / artist / genre text, typo-tolerant
        parsed.words.forEach(function (word) {
          possible += 1.5;
          if ((' ' + text + ' ').indexOf(' ' + word + ' ') !== -1) { score += 2; reasons.push('“' + word + '”'); return; }
          if (word.length >= 3 && text.indexOf(word) !== -1) { score += 1.2; return; }
          if (word.length >= 5) {
            var tw = text.split(' ');
            for (var k = 0; k < tw.length; k++) if (tw[k].length >= 4 && editDistance(word, tw[k], 1) <= 1) { score += 1; return; }
          }
        });

        var nothingAsked = !wanted.length && !parsed.words.length;
        if (score <= 0 && !nothingAsked) return;
        // Reward covering more of the request, not just one strong match
        var coverage = possible ? Math.min(1, score / possible) : 1;
        results.push({ song: song, score: score * (0.6 + 0.4 * coverage), reasons: reasons });
      });

      results.sort(function (a, b) { return b.score - a.score || String(a.song.title).localeCompare(String(b.song.title)); });
      return results;
    }

    function fmt(sec) {
      return sec >= 60 ? (Math.round(sec / 6) / 10).toString().replace(/\.0$/, '') + ' min' : sec + ' s';
    }

    // What we understood, as removable chips: [{key, label, negated}]
    function chips(parsed) {
      var out = parsed.tags.map(function (f) {
        var t = byId[f.id] || { label: f.id };
        return { key: 'tag:' + f.id + (f.negated ? ':not' : ''), label: (f.negated ? 'not ' : '') + t.label, negated: f.negated, text: f.text, corrected: f.corrected };
      });
      var L = parsed.limits;
      if (L.maxSec) out.push({ key: 'maxSec', label: 'under ' + fmt(L.maxSec) });
      if (L.minSec) out.push({ key: 'minSec', label: 'over ' + fmt(L.minSec) });
      if (L.nearSec) out.push({ key: 'nearSec', label: 'about ' + fmt(L.nearSec) });
      if (L.minBpm || L.maxBpm) out.push({ key: 'bpm', label: (L.minBpm && L.maxBpm ? Math.round((L.minBpm + L.maxBpm) / 2) + ' BPM' : L.minBpm ? 'over ' + L.minBpm + ' BPM' : 'under ' + L.maxBpm + ' BPM') });
      parsed.words.forEach(function (w) { out.push({ key: 'word:' + w, label: '“' + w + '”', word: true }); });
      return out;
    }

    function search(songs, query) {
      var parsed = parse(query);
      return { parsed: parsed, chips: chips(parsed), results: rank(songs, parsed) };
    }

    return { parse: parse, rank: rank, search: search, chips: chips, tag: function (id) { return byId[id]; }, normalize: normalize };
  }

  return { create: create, editDistance: editDistance, normalize: normalize, stem: stem };
}));
