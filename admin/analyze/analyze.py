#!/usr/bin/env python3
"""
Portal Music — audio analyzer (runs on the owner's computer, never deployed)

Listens to each track and saves RAW scores to admin/analysis/<track id>.json.
The admin studio's decision step (admin/tagging.js) turns those scores into
tags by agreement voting, so changing tags or thresholds never needs a re-run.

Three independent sources per track:
  dsp   measured: length, BPM, key, loudness/brightness/percussiveness (librosa)
  ast   Model A: Audio Spectrogram Transformer trained on Google AudioSet
        (527 labels: genres, moods, instruments, singing…)
  clap  Model B: LAION CLAP, scores the audio against each tag's text
        descriptions in data/tags.json; also stores the audio embedding used
        for "similar tracks" and for --rescore

Usage (from the Portal-Music folder, after `npm run analyze:setup`):
  npm run analyze                 analyze tracks that have no current analysis
  admin/analyze/.venv/bin/python admin/analyze/analyze.py --all --force
  … --ids id1,id2                 only these tracks (used after each upload)
  … --rescore                     re-score saved CLAP embeddings against the
                                  current tags.json (seconds, no audio needed)
  … --check                       download the models and validate tags.json
  … --mock                        fake scores for testing the pipeline only
"""

import argparse
import hashlib
import json
import math
import os
import random
import sys
import tempfile
import time
import traceback
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MUSIC_JSON = os.path.join(ROOT, 'data', 'music.json')
TAGS_JSON = os.path.join(ROOT, 'data', 'tags.json')
OUT_DIR = os.path.join(ROOT, 'admin', 'analysis')
PROGRESS = os.path.join(OUT_DIR, '_progress.json')
ASSET_PREFIX = 'https://assets.portal-music.com/'

VERSION = 1                       # bump when the analysis itself changes
AST_MODEL = 'MIT/ast-finetuned-audioset-10-10-0.4593'
# Model B candidates, tried in order until one passes the self-test (see ClapScorer.self_test)
CLAP_MODELS = ['laion/larger_clap_music', 'laion/larger_clap_music_and_speech', 'laion/clap-htsat-unfused']
CLAP_MIN_SPREAD = 0.03            # a working CLAP scores different texts clearly differently
WINDOWS = 6                       # 10-second slices spread across the song
WINDOW_SEC = 10.0


# ── small helpers ──────────────────────────────────────────────────────────

def load_json(path, default=None):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def save_json(path, data):
    """Write atomically, so stopping the run never leaves a half-written file."""
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, path)


def progress(**kw):
    state = load_json(PROGRESS, {}) or {}
    state.update(kw, updatedAt=time.time())
    save_json(PROGRESS, state)


def r4(x):
    return round(float(x), 4)


def window_starts(duration, n=WINDOWS, win=WINDOW_SEC):
    """Evenly spread window starts, skipping the first/last 5% (fades, silence)."""
    if duration <= win:
        return [0.0]
    lo, hi = duration * 0.05, max(duration * 0.95 - win, duration * 0.05)
    if n == 1 or hi <= lo:
        return [lo]
    return [lo + i * (hi - lo) / (n - 1) for i in range(n)]


# ── audio ──────────────────────────────────────────────────────────────────

def local_path_for(track):
    url = track.get('file') or ''
    if url.startswith(ASSET_PREFIX):
        rel = urllib.parse.unquote(url[len(ASSET_PREFIX):])
        path = os.path.join(ROOT, rel)
        if os.path.isfile(path):
            return path
    return None


def fetch_audio(track):
    """Local copy if it exists (music/…), otherwise download from Cloudflare R2 (free)."""
    path = local_path_for(track)
    if path:
        return path, False
    url = track.get('file') or ''
    if not url.startswith('http'):
        raise RuntimeError('no audio file for this track')
    url = urllib.parse.quote(url, safe=':/%?=&')
    last = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'PortalMusicAnalyzer/1'})
            with urllib.request.urlopen(req, timeout=60) as res:
                data = res.read()
            fd, tmp = tempfile.mkstemp(suffix=os.path.splitext(urllib.parse.urlparse(url).path)[1] or '.mp3')
            with os.fdopen(fd, 'wb') as f:
                f.write(data)
            return tmp, True
        except Exception as e:  # network hiccup: retry
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f'download failed: {last}')


def load_audio(path, sr):
    import librosa
    y, _ = librosa.load(path, sr=sr, mono=True)
    if y.size == 0:
        raise RuntimeError('empty audio')
    return y


# ── measured features (no AI) ──────────────────────────────────────────────

MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def estimate_key(chroma_mean):
    import numpy as np
    best = (-2, None, None)
    second = -2
    for mode, profile in (('major', MAJOR), ('minor', MINOR)):
        p = np.array(profile)
        for i in range(12):
            c = float(np.corrcoef(np.roll(p, i), chroma_mean)[0, 1])
            if c > best[0]:
                second = best[0]
                best = (c, NOTES[i], mode)
            elif c > second:
                second = c
    corr, note, mode = best
    return {'key': f'{note} {mode}', 'keyConfidence': r4(max(0.0, corr - second))}


def dsp_features(y, sr):
    import numpy as np
    import librosa
    duration = len(y) / sr
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, start_bpm=110)
    tempo = float(np.atleast_1d(tempo)[0])
    beat_times = librosa.frames_to_time(beats, sr=sr)
    if len(beat_times) > 4:
        ibi = np.diff(beat_times)
        beat_regularity = float(max(0.0, 1.0 - np.std(ibi) / max(np.mean(ibi), 1e-6)))
    else:
        beat_regularity = 0.0
    rms = librosa.feature.rms(y=y)[0]
    rms_db = librosa.amplitude_to_db(rms + 1e-9)
    harm, perc = librosa.effects.hpss(y)
    perc_ratio = float(np.sum(perc ** 2) / max(np.sum(y ** 2), 1e-9))
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
    chroma = librosa.feature.chroma_cqt(y=harm, sr=sr)
    out = {
        'durationSec': r4(duration),
        'bpm': round(tempo, 1),
        'beatRegularity': r4(beat_regularity),
        'loudnessDb': r4(np.mean(rms_db)),
        'dynamicsDb': r4(np.percentile(rms_db, 95) - np.percentile(rms_db, 10)),
        'percussiveRatio': r4(perc_ratio),
        'brightnessHz': round(centroid, 1),
        'onsetRate': r4(len(onsets) / max(duration, 1e-6)),
    }
    out.update(estimate_key(np.mean(chroma, axis=1)))
    return out


# ── Model A: AudioSet classifier ───────────────────────────────────────────

class AstModel:
    def __init__(self):
        import torch
        from transformers import ASTForAudioClassification, AutoFeatureExtractor
        self.torch = torch
        self.fe = AutoFeatureExtractor.from_pretrained(AST_MODEL)
        self.model = ASTForAudioClassification.from_pretrained(AST_MODEL).eval()
        self.labels = self.model.config.id2label
        self.sr = self.fe.sampling_rate  # 16 kHz

    def scores(self, y16):
        import numpy as np
        dur = len(y16) / self.sr
        probs = []
        for start in window_starts(dur):
            seg = y16[int(start * self.sr): int((start + WINDOW_SEC) * self.sr)]
            inputs = self.fe(seg, sampling_rate=self.sr, return_tensors='pt')
            with self.torch.no_grad():
                logits = self.model(**inputs).logits[0]
            probs.append(self.torch.sigmoid(logits).numpy())
        mean = np.mean(probs, axis=0)
        # keep everything that isn't ~0, so new tag mappings work without re-running audio
        return {self.labels[i]: r4(p) for i, p in enumerate(mean) if p >= 0.002}


# ── Model B: CLAP text ↔ audio ────────────────────────────────────────────

def clap_prompts(tags):
    """Every tag's text descriptions plus a generic "<label> music" one (prompt ensembling:
    several phrasings averaged are steadier than any single one), and a neutral baseline."""
    prompts = {'_baseline': ['music', 'a piece of music']}
    for t in tags:
        if t.get('clap'):
            label = t['label'].split('(')[0].strip().lower()
            extra = f'{label} music'
            prompts[t['id']] = list(t['clap']) + ([extra] if extra not in t['clap'] else [])
    return prompts


class ClapBroken(Exception):
    pass


class ClapScorer:
    def __init__(self, name):
        import torch
        from transformers import ClapModel, ClapProcessor
        self.torch = torch
        self.name = name
        self.model, info = ClapModel.from_pretrained(name, output_loading_info=True)
        self.model.eval()
        missing = [k for k in info.get('missing_keys', []) if not k.endswith('position_ids')]
        if missing:
            raise ClapBroken(f'{len(missing)} weights did not load (e.g. {missing[0]})')
        self.proc = ClapProcessor.from_pretrained(name)
        self.sr = self.proc.feature_extractor.sampling_rate  # 48 kHz
        self._text_cache = {}

    def self_test(self):
        """Does the model really listen? Made-up sounds must score clearly differently against
        different descriptions, and different descriptions must not all mean the same thing."""
        import numpy as np
        rng = np.random.default_rng(0)
        n = int(self.sr * WINDOW_SEC)
        tt = np.arange(n) / self.sr
        clicks = np.zeros(n, dtype=np.float32)
        for k in range(0, n, self.sr // 2):
            clicks[k:k + 400] = rng.uniform(-0.8, 0.8, min(400, n - k))
        clips = {
            'tone': (0.3 * np.sin(2 * np.pi * 440 * tt)).astype(np.float32),
            'noise': rng.uniform(-0.3, 0.3, n).astype(np.float32),
            'clicks': clicks,
        }
        texts = ['a pure sine wave tone', 'white noise static hiss', 'a metronome clicking',
                 'heavy metal with distorted guitars', 'soft solo piano', 'hip hop beat with rap vocals']
        temb = np.asarray(self.text_embeddings({'t': texts})['t'])
        sims = temb @ temb.T
        text_same = float((sims.sum() - len(texts)) / (len(texts) * (len(texts) - 1)))
        spreads, hits = [], 0
        for i, (k, y) in enumerate(clips.items()):
            sc = temb @ self.audio_embedding(y)
            spreads.append(float(sc.max() - sc.min()))
            hits += int(np.argmax(sc[:3]) == i)
        spread = float(np.median(spreads))
        report = f'spread {spread:.3f}, text similarity {text_same:.2f}, made-up sounds recognised {hits}/3'
        if spread < CLAP_MIN_SPREAD or text_same > 0.97:
            raise ClapBroken('not listening: ' + report)
        return report

    def audio_embedding(self, y48):
        import numpy as np
        dur = len(y48) / self.sr
        segs = [y48[int(s * self.sr): int((s + WINDOW_SEC) * self.sr)] for s in window_starts(dur)]
        inputs = self.proc(audios=segs, sampling_rate=self.sr, return_tensors='pt')
        with self.torch.no_grad():
            emb = self.model.get_audio_features(**inputs).numpy()
        emb = emb / np.linalg.norm(emb, axis=1, keepdims=True)
        mean = emb.mean(axis=0)
        return mean / np.linalg.norm(mean)

    def text_embeddings(self, prompts):
        import numpy as np
        flat = [p for ps in prompts.values() for p in ps]
        missing = [p for p in flat if p not in self._text_cache]
        if missing:
            inputs = self.proc(text=missing, return_tensors='pt', padding=True)
            with self.torch.no_grad():
                emb = self.model.get_text_features(**inputs).numpy()
            emb = emb / np.linalg.norm(emb, axis=1, keepdims=True)
            self._text_cache.update(zip(missing, emb))
        return {k: [self._text_cache[p] for p in ps] for k, ps in prompts.items()}


def clap_scores(audio_emb, text_embs):
    """Cosine similarity per tag against the AVERAGE of its prompt embeddings."""
    import numpy as np
    out = {}
    for k, embs in text_embs.items():
        mean = np.mean(np.asarray(embs), axis=0)
        mean = mean / np.linalg.norm(mean)
        out[k] = r4(float(np.dot(audio_emb, mean)))
    return out


# ── mock engines (pipeline tests only; never published) ───────────────────

def mock_analysis(track, tags):
    seed = int(hashlib.md5(track['id'].encode()).hexdigest()[:8], 16)
    rnd = random.Random(seed)
    words = ' '.join(str(track.get(k) or '') for k in ('title', 'genre', 'subgenre')).lower()
    def hinted(t):
        return any(s in words for s in [t['label'].lower()] + t.get('syn', [])[:6])
    ast, clap = {}, {'_baseline': 0.2}
    for t in tags:
        boost = 0.45 if hinted(t) else 0.0
        for label in t.get('ast', []):
            ast[label] = r4(max(ast.get(label, 0), min(0.99, rnd.random() * 0.35 + boost)))
        if t.get('clap'):
            clap[t['id']] = r4(0.15 + rnd.random() * 0.12 + boost * 0.4)
    emb = [rnd.gauss(0, 1) for _ in range(32)]
    n = math.sqrt(sum(v * v for v in emb))
    dur = 60 + rnd.random() * 180
    return {
        'dsp': {'durationSec': r4(dur), 'bpm': round(70 + rnd.random() * 90, 1), 'beatRegularity': r4(rnd.random()),
                'loudnessDb': r4(-30 + rnd.random() * 20), 'dynamicsDb': r4(5 + rnd.random() * 20),
                'percussiveRatio': r4(rnd.random() * 0.6), 'brightnessHz': round(800 + rnd.random() * 3000, 1),
                'onsetRate': r4(rnd.random() * 5), 'key': rnd.choice(NOTES) + rnd.choice([' major', ' minor']),
                'keyConfidence': r4(rnd.random() * 0.3)},
        'ast': ast, 'clap': clap, 'emb': [r4(v / n) for v in emb], 'mock': True,
    }


# ── main ───────────────────────────────────────────────────────────────────

def load_clap():
    """The first Model B candidate that passes its self-test, or None (Model B stays off;
    Model A and the measurements still work)."""
    for name in CLAP_MODELS:
        try:
            m = ClapScorer(name)
            print(f'Model B {name}: OK ({m.self_test()})', flush=True)
            return m
        except Exception as e:
            print(f'Model B {name}: FAILED, {e}', flush=True)
    print('Model B: no working model. Tagging continues with Model A and your genre folders only.', flush=True)
    return None


def needs_clap(a, clap_model):
    return bool(clap_model) and a.get('clapModel') != clap_model.name


def analyze_track(track, tags, ast_model, clap_model, prompts, old=None):
    import numpy as np
    path, temp = fetch_audio(track)
    try:
        # Model A + measurements already good? Then only (re)do Model B
        if old and old.get('dsp') and old.get('ast') and old.get('version') == VERSION and not old.get('mock') and not old.get('error'):
            result = {'dsp': old['dsp'], 'ast': old['ast']}
        else:
            y22 = load_audio(path, 22050)
            result = {'dsp': dsp_features(y22, 22050)}
            result['ast'] = ast_model.scores(load_audio(path, ast_model.sr))
        if clap_model:
            emb = clap_model.audio_embedding(load_audio(path, clap_model.sr))
            result['clap'] = clap_scores(emb, clap_model.text_embeddings(prompts))
            result['emb'] = [r4(v) for v in np.asarray(emb)]
            result['clapModel'] = clap_model.name
        else:
            result['clap'] = {}
            result['clapModel'] = None
        return result
    finally:
        if temp:
            os.remove(path)


def main():
    ap = argparse.ArgumentParser(description='Portal Music audio analyzer')
    which = ap.add_mutually_exclusive_group()
    which.add_argument('--all', action='store_true', help='every track')
    which.add_argument('--missing', action='store_true', help='tracks without a current analysis (default)')
    which.add_argument('--ids', help='comma-separated track ids')
    ap.add_argument('--force', action='store_true', help='re-analyze even if up to date')
    ap.add_argument('--limit', type=int, default=0, help='stop after N tracks (for a test run)')
    ap.add_argument('--mock', action='store_true', help='fake scores, for testing the pipeline')
    ap.add_argument('--rescore', action='store_true', help='re-score saved embeddings against tags.json')
    ap.add_argument('--check', action='store_true', help='download models and validate tags.json')
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    music = load_json(MUSIC_JSON, [])
    tags = load_json(TAGS_JSON, {}).get('tags', [])
    prompts = clap_prompts(tags)

    if args.check or args.rescore:
        clap_model = load_clap()
        if args.check:
            ast_model = AstModel()
            known = set(ast_model.labels.values())
            unknown = sorted({l for t in tags for l in t.get('ast', []) if l not in known})
            print('AudioSet labels in tags.json not known to Model A:', unknown or 'none ✓')
            if clap_model:
                clap_model.text_embeddings(prompts)
                print('Models downloaded and working ✓')
            else:
                print('Model A works; Model B is off (see above). Tagging still works.')
            return 1 if unknown else 0
        if not clap_model:
            return 2
        import numpy as np
        texts = clap_model.text_embeddings(prompts)
        n = 0
        for t in music:
            path = os.path.join(OUT_DIR, t['id'] + '.json')
            a = load_json(path)
            if a and a.get('emb') and not a.get('mock') and a.get('clapModel') == clap_model.name:
                a['clap'] = clap_scores(np.asarray(a['emb']), texts)
                save_json(path, a)
                n += 1
        print(f'Re-scored {n} tracks against the current tags ✓')
        return 0

    progress(running=True, done=0, total=0, errors=0, current='Loading AI models…',
             startedAt=time.time(), mock=bool(args.mock), pid=os.getpid(), fatal=None, modelB=None)
    ast_model = clap_model = None
    if not args.mock:
        try:
            ast_model = AstModel()
        except Exception as e:
            progress(running=False, current='', fatal=f'Could not load the AI models: {e}')
            print('Could not load the AI models. Did you run `npm run analyze:setup`?\n', e, file=sys.stderr)
            return 2
        clap_model = load_clap()
        progress(modelB=clap_model.name if clap_model else 'off')

    if args.ids:
        wanted = set(args.ids.split(','))
        todo = [t for t in music if t['id'] in wanted]
    else:
        todo = []
        for t in music:
            a = load_json(os.path.join(OUT_DIR, t['id'] + '.json'))
            fresh = a and a.get('version') == VERSION and not a.get('mock') and not a.get('error')
            if args.all or args.force or not fresh or (args.mock and not a) or (fresh and needs_clap(a, clap_model)):
                todo.append(t)
    if args.limit:
        todo = todo[:args.limit]
    progress(total=len(todo))

    errors = 0
    began = time.time()
    for i, t in enumerate(todo):
        progress(current=t.get('title', t['id']), done=i)
        out = os.path.join(OUT_DIR, t['id'] + '.json')
        old = load_json(out, {}) or {}
        try:
            keep = None if (args.force or args.all or args.mock) else old
            res = mock_analysis(t, tags) if args.mock else analyze_track(t, tags, ast_model, clap_model, prompts, keep)
            res.update(version=VERSION, analyzedAt=int(time.time()), file=t.get('file'))
            if 'review' in old and (args.mock or not old.get('mock')):   # never lose the owner's review decisions
                res['review'] = old['review']
            elif old.get('review', {}).get('autoGenre'):   # reviews made on TEST data don't count
                res['review'] = {'status': 'pending', 'add': [], 'remove': [], 'autoGenre': True}
            save_json(out, res)
        except KeyboardInterrupt:
            progress(running=False, current='Stopped')
            print('\nStopped. Run again to continue where it left off.')
            return 130
        except Exception as e:
            errors += 1
            old.update(error=str(e)[:300], version=VERSION, analyzedAt=int(time.time()))
            save_json(out, old)
            print(f'  ✗ {t.get("title")}: {e}', file=sys.stderr)
            if os.environ.get('PM_DEBUG'):
                traceback.print_exc()
        elapsed = time.time() - began
        left = (len(todo) - i - 1) * elapsed / (i + 1)
        print(f'[{i + 1}/{len(todo)}] {t.get("title")}  (about {int(left // 60)} min left)', flush=True)
        progress(errors=errors, etaSec=int(left))

    progress(running=False, done=len(todo), current='', finishedAt=time.time(), errors=errors)
    print(f'Done: {len(todo) - errors} analyzed, {errors} failed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
