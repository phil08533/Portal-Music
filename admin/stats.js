/**
 * Portal Music Admin — Stats from the anonymous usage events the site writes
 * (js/app.js pmTrack → Firestore "events"). Read with the service account, so
 * firestore.rules never has to let anyone else read them.
 *
 * Reads one Firestore document per event in the chosen range. That's free at
 * today's traffic (50k reads/day); if the site gets big, switch to daily totals.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const users = require('./users');

const MUSIC_JSON_PATH = path.join(__dirname, '..', 'data', 'music.json');
const MAX_EVENTS = 50000;
const DAY = 86400000;

// Visits from these sources mean a video or post sent someone to the site
const VIDEO_SOURCES = /^(credit|youtube\.com|m\.youtube\.com|youtu\.be|tiktok\.com|instagram\.com|l\.instagram\.com|twitch\.tv|reddit\.com|out\.reddit\.com|facebook\.com|l\.facebook\.com|x\.com|t\.co)$/;

function dayKey(d) {
  return d.toISOString().slice(0, 10);
}

function countBy(list, key) {
  const out = {};
  for (const e of list) {
    const k = key(e);
    if (k) out[k] = (out[k] || 0) + 1;
  }
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}

// Distinct browsers, and how many of them came back on 2+ different days
function people(list) {
  const days = {};
  for (const e of list) (days[e.aid] = days[e.aid] || new Set()).add(e.day);
  const ids = Object.keys(days);
  return { total: ids.length, returning: ids.filter(id => days[id].size >= 2).length };
}

async function getStats(rangeDays) {
  const range = [7, 28, 90].includes(Number(rangeDays)) ? Number(rangeDays) : 7;
  const { db } = users.init();
  const since = new Date(Date.now() - range * DAY);
  const snap = await db.collection('events').where('ts', '>=', since).orderBy('ts').limit(MAX_EVENTS).get();

  const events = snap.docs.map(d => {
    const e = d.data();
    const ts = e.ts && e.ts.toDate ? e.ts.toDate() : new Date();
    return { name: e.name, aid: e.aid, src: e.src || 'direct', page: e.page || '', track: e.track || '', v: e.v || '', pro: !!e.pro, day: dayKey(ts) };
  });
  const of = name => events.filter(e => e.name === name);

  let titles = {};
  try {
    for (const t of JSON.parse(fs.readFileSync(MUSIC_JSON_PATH, 'utf8'))) titles[t.id] = t.title;
  } catch (e) { /* titles are optional */ }
  const named = rows => rows.slice(0, 15).map(([id, n]) => ({ id, title: titles[id] || id, count: n }));

  const visits = of('visit');
  const downloads = of('download');
  const totals = {};
  for (const e of events) totals[e.name] = (totals[e.name] || 0) + 1;

  // One row per day, newest first
  const daily = [];
  for (let i = 0; i < range; i++) {
    const day = dayKey(new Date(Date.now() - i * DAY));
    const today = events.filter(e => e.day === day);
    const c = n => today.filter(e => e.name === n).length;
    daily.push({ day, visitors: people(today).total, visits: c('visit'), plays: c('play'), downloads: c('download'), signups: c('signup'), pro: c('pro_active') });
  }

  const loopVisits = visits.filter(e => VIDEO_SOURCES.test(e.src)).length;
  const visitors = people(events);
  const downloaders = people(downloads);

  return {
    range,
    truncated: events.length >= MAX_EVENTS,
    totals,
    visitors,
    downloaders,
    funnel: [
      { step: 'Visitors', count: visitors.total },
      { step: 'Played a track', count: people(of('play')).total },
      { step: 'Downloaded', count: downloaders.total },
      { step: 'Signed up', count: (totals.signup || 0) },
      { step: 'Viewed Upgrade page', count: people(of('pro_view')).total },
      { step: 'Started checkout', count: people(of('checkout_start')).total },
      { step: 'Became Pro', count: (totals.pro_active || 0) },
    ],
    loop: {
      downloads: downloads.length,
      creditCopies: totals.credit_copy || 0,
      creditVisits: visits.filter(e => e.src === 'credit').length,
      videoVisits: loopVisits,
      // New visits brought by videos/posts per 100 downloads: our proxy for the viral loop
      per100Downloads: downloads.length ? Math.round((loopVisits / downloads.length) * 1000) / 10 : 0,
    },
    sources: countBy(visits, e => e.src).slice(0, 15).map(([src, count]) => ({ src, count })),
    topDownloads: named(countBy(downloads, e => e.track)),
    topPlays: named(countBy(of('play'), e => e.track)),
    formats: countBy(downloads, e => e.v || 'mp3').map(([fmt, count]) => ({ fmt, count })),
    radio: countBy(of('radio_start'), e => e.v).map(([station, count]) => ({ station, count })),
    // What visitors typed into "Search a sound" (track = how many results they got)
    searches: countBy(of('search'), e => e.v).slice(0, 20).map(([q, count]) => ({ q, count })),
    noResults: countBy(of('search').filter(e => e.track === '0'), e => e.v).slice(0, 15).map(([q, count]) => ({ q, count })),
    overlay: { starts: of('overlay_start').length, streamers: people(of('overlay_start')).total,
      stations: countBy(of('overlay_start'), e => e.v).map(([station, count]) => ({ station, count })) },
    pages: countBy(visits, e => e.page).slice(0, 10).map(([page, count]) => ({ page, count })),
    daily,
  };
}

// Are the LIVE Firestore rules the ones in firestore.rules? If the events part was never
// published, the site can't save any visits and every number here stays at 0.
const RULES_PATH = path.join(__dirname, '..', 'firestore.rules');
async function rulesStatus() {
  const norm = s => String(s || '').replace(/\/\/.*$/gm, '').replace(/\s+/g, '');
  try {
    const { admin } = users.init();
    const rs = await admin.securityRules().getFirestoreRuleset();
    const live = (rs.source || []).map(f => f.content).join('\n');
    const local = fs.readFileSync(RULES_PATH, 'utf8');
    const names = (local.match(/name in \[([^\]]*)\]/) || [])[1] || '';
    const missing = (names.match(/'([a-z_]+)'/g) || []).map(x => x.slice(1, -1)).filter(n => !live.includes(`'${n}'`));
    return {
      checked: true,
      current: norm(live) === norm(local),
      hasEvents: /match\s*\/events\//.test(live),
      missingEvents: missing,
    };
  } catch (e) {
    return { checked: false, error: e.message };
  }
}

module.exports = { getStats, rulesStatus };
