/**
 * Portal Music Admin — starts/stops the Python analyzer and reports progress
 * for the 🏷️ Tags tab. One analyzer process at a time (each loads ~2 GB of AI
 * models); new uploads are analyzed right away unless a big run is going.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const tagging = require('./tagging');

const ANALYZE_DIR = path.join(__dirname, 'analyze');
const SCRIPT = path.join(ANALYZE_DIR, 'analyze.py');
const PROGRESS = path.join(tagging.ANALYSIS_DIR, '_progress.json');
const LOG = path.join(tagging.ANALYSIS_DIR, '_run.log');
const ROOT = path.join(__dirname, '..');

let child = null;
let onDone = [];

function pythonPath() {
  if (process.env.PM_PYTHON) return process.env.PM_PYTHON;
  const candidates = [
    path.join(ANALYZE_DIR, '.venv', 'bin', 'python'),
    path.join(ANALYZE_DIR, '.venv', 'Scripts', 'python.exe'),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

function readProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch (e) { return {}; }
}

function running() {
  return !!(child && child.exitCode === null);
}

function status() {
  return { installed: !!pythonPath(), running: running(), progress: readProgress() };
}

// mode: 'missing' | 'all' | 'ids';  mock: test data only
function start({ mode = 'missing', ids = [], limit = 0, mock = false } = {}, done) {
  if (running()) throw new Error('The analyzer is already running');
  const py = mock ? (pythonPath() || 'python3') : pythonPath();
  if (!py) throw new Error('The analyzer isn\'t installed yet. In the Portal-Music folder run: npm run analyze:setup');
  fs.mkdirSync(tagging.ANALYSIS_DIR, { recursive: true });
  const args = [SCRIPT];
  if (mode === 'all') args.push('--all', '--force');
  else if (mode === 'ids') args.push('--ids', ids.join(','));
  else args.push('--missing');
  if (limit) args.push('--limit', String(Math.max(1, Math.min(10000, Number(limit) || 1))));
  if (mock) args.push('--mock');
  const log = fs.openSync(LOG, 'w');
  child = spawn(py, args, { cwd: ROOT, stdio: ['ignore', log, log] });
  if (done) onDone.push(done);
  child.on('exit', code => {
    fs.closeSync(log);
    const callbacks = onDone; onDone = [];
    for (const cb of callbacks) { try { cb(code); } catch (e) { console.error(e); } }
  });
  return status();
}

function stop() {
  if (running()) child.kill('SIGINT');   // the analyzer saves its place and exits
  return status();
}

// After uploads: analyze those songs (one run for a whole batch), then publish and rebuild pages
function analyzeNewTrack(id) {
  return analyzeIds([id]);
}

function analyzeIds(ids) {
  ids = (ids || []).map(String).filter(id => /^[a-z0-9]{6,40}$/i.test(id));
  if (!ids.length) return 'nothing';
  if (!pythonPath()) return 'not-installed';
  if (running()) return 'busy';          // the next "Analyze new songs" run will pick them up
  start({ mode: 'ids', ids }, code => {
    if (code !== 0) return;
    try {
      tagging.publish();
      exec(`node "${path.join(ROOT, 'scripts', 'generate-seo-pages.js')}"`, { cwd: ROOT }, () => {});
    } catch (e) { console.error('Auto-tagging publish failed:', e.message); }
  });
  return 'started';
}

function logTail(lines = 30) {
  try { return fs.readFileSync(LOG, 'utf8').split('\n').slice(-lines).join('\n'); } catch (e) { return ''; }
}

module.exports = { status, start, stop, analyzeNewTrack, analyzeIds, logTail, pythonPath };
