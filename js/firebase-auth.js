// ============================================
// Portal Music — Firebase Authentication
// ============================================
//
// SETUP REQUIRED (one-time, ~15 min):
//   1. Go to console.firebase.google.com
//   2. Create project named "portal-music"
//   3. Authentication → Sign-in method → Google → Enable (add support email)
//   4. Firestore Database → Create → Production mode → choose us-east1
//   5. Firestore Rules → paste the contents of firestore.rules (repo root) → Publish
//   6. Project Settings → Your apps → Web → Register app → copy firebaseConfig
//   7. Authentication → Settings → Authorized domains → add portal-music.com
//
// Then replace the placeholder values in firebaseConfig below and commit.
// ============================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs, deleteDoc, updateDoc, serverTimestamp, query, orderBy, writeBatch, Timestamp }
  from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ── Replace with your Firebase project config ──────────────────────────────
const firebaseConfig = {
  apiKey:            'AIzaSyATZysPXZM50CfB-AXdqhmTdei_4Y26DG8',
  authDomain:        'portal-music-3b1a1.firebaseapp.com',
  projectId:         'portal-music-3b1a1',
  storageBucket:     'portal-music-3b1a1.firebasestorage.app',
  messagingSenderId: '1080055930338',
  appId:             '1:1080055930338:web:04d2323a288147394d6dbb',
};
// ───────────────────────────────────────────────────────────────────────────

const FAV_KEY = 'pm_favorites';

// Tracks re-imported under new IDs keep working in saved favorites/playlists
let idMapPromise = null;
function loadIdMap() {
  idMapPromise ||= fetch('/data/id-map.json').then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  return idMapPromise;
}
function remapIds(ids, map) {
  return [...new Set((ids || []).map(id => map[String(id)] || String(id)))];
}

// Subscription details shown on the profile/upgrade pages
function toDate(ts) {
  return ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
}

// Code/admin Pro can have an end date; Stripe Pro is governed by Stripe alone
function hasActivePro(data) {
  if (data.isPro !== true) return false;
  const expires = data.proSource !== 'stripe' ? toDate(data.proExpiresAt) : null;
  return !expires || expires > new Date();
}

function proInfo(data) {
  const end = data.proCurrentPeriodEnd;
  return {
    expiresAt: data.proSource !== 'stripe' ? toDate(data.proExpiresAt) : null, // null = lifetime
    source:    data.proSource || null,          // 'stripe' | 'code' | 'admin'
    status:    data.proStatus || null,          // Stripe status, e.g. 'active', 'past_due', 'canceled'
    plan:      data.proPlan || null,            // 'month' | 'year'
    renews:    data.proRenews !== false,
    periodEnd: end && typeof end.toDate === 'function' ? end.toDate() : null,
  };
}

const configReady = Object.values(firebaseConfig).every(v => !String(v).startsWith('REPLACE_'));

if (!configReady) {
  console.info('[Portal Music] Firebase not yet configured — sign-in disabled. See CLAUDE.md.');
  window._fbUser          = null;
  window._fbIsPro         = false;
  window._fbAuthReady     = true;
  window.dispatchEvent(new CustomEvent('portalAuthReady', { detail: { user: null } }));
  window._fbSignIn        = () => { alert('Sign-in coming soon!'); };
  window._fbSignOut       = () => {};
  window._fbSaveFavorites = async () => {};
  window._fbGetPlaylists  = async () => [];
  window._fbCreatePlaylist  = async () => null;
  window._fbDeletePlaylist  = async () => {};
  window._fbRenamePlaylist  = async () => {};
  window._fbAddToPlaylist   = async () => {};
  window._fbRemoveFromPlaylist = async () => {};
  window._renderAuthBtn = function () {
    const btn = document.getElementById('auth-btn');
    if (!btn) return;
    btn.textContent = 'Sign in';
    btn.title       = 'Sign in with Google to save favorites';
    btn.onclick     = window._fbSignIn;
    btn.classList.remove('signed-in');
  };
  window._renderAuthBtn();
} else {
  const app  = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db   = getFirestore(app);

  window._fbUser      = null;
  window._fbAuthReady = false;

  // ── Early render from cache ────────────────────────────────────────────
  // Restore the signed-in button immediately (before Firebase resolves from IndexedDB)
  // so users don't see a "Sign in" flash on every page load.
  try {
    const _cachedName = localStorage.getItem('pm_user_name');
    if (_cachedName !== null) {
      const _btn = document.getElementById('auth-btn');
      if (_btn) {
        _btn.textContent = _cachedName || 'Account';
        _btn.title       = 'View your profile';
        _btn.onclick     = () => { window.location.href = 'profile.html'; };
        _btn.classList.add('signed-in');
        const _np = document.getElementById('nav-profile-link');
        if (_np) _np.style.display = '';
      }
    }
  } catch (_e) {}

  // ── Auth state ─────────────────────────────────────────────────────────
  onAuthStateChanged(auth, async user => {
    window._fbUser = user;
    window._fbIsPro = false;

    if (user) {
      try {
        const snap   = await getDoc(doc(db, 'users', user.uid));
        const data   = snap.exists() ? snap.data() : {};
        if (!snap.exists() && window.pmTrack) window.pmTrack('signup'); // first sign-in creates the account
        const idMap  = await loadIdMap();
        const cloud  = data.favorites || [];
        const local  = JSON.parse(sessionStorage.getItem(FAV_KEY) || '[]');
        const merged = remapIds([...cloud, ...local], idMap);
        window._fbIsPro      = hasActivePro(data);
        window._fbProInfo    = proInfo(data);
        sessionStorage.setItem(FAV_KEY, JSON.stringify(merged));
        await setDoc(doc(db, 'users', user.uid), {
          favorites:   merged,
          displayName: user.displayName || '',
          photoURL:    user.photoURL    || '',
          email:       user.email       || '',
        }, { merge: true });
      } catch (e) {
        console.warn('[Portal Music] Favorites sync failed:', e.message);
      }
    }

    // Mark auth as resolved and notify any waiting listeners
    window._fbAuthReady = true;
    window._renderAuthBtn();
    window.dispatchEvent(new CustomEvent('portalAuthReady', { detail: { user } }));
  });

  // ── Auth actions ────────────────────────────────────────────────────────
  window._fbSignIn  = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(console.warn);
  window._fbSignOut = () => signOut(auth).catch(console.warn);

  // ── Favorites ──────────────────────────────────────────────────────────
  window._fbSaveFavorites = async favs => {
    if (!window._fbUser) return;
    try {
      await setDoc(doc(db, 'users', window._fbUser.uid), { favorites: favs }, { merge: true });
    } catch { /* sessionStorage already updated */ }
  };

  // ── Playlists ──────────────────────────────────────────────────────────
  window._fbGetPlaylists = async () => {
    if (!window._fbUser) return [];
    try {
      const q    = query(collection(db, 'users', window._fbUser.uid, 'playlists'), orderBy('createdAt'));
      const [snap, idMap] = await Promise.all([getDocs(q), loadIdMap()]);
      return snap.docs.map(d => {
        const data = d.data();
        const songs = remapIds(data.songs, idMap);
        // Save the upgraded IDs so this only happens once
        if (JSON.stringify(songs) !== JSON.stringify(data.songs || [])) {
          updateDoc(d.ref, { songs }).catch(() => {});
        }
        return { id: d.id, ...data, songs };
      });
    } catch { return []; }
  };

  window._fbCreatePlaylist = async name => {
    if (!window._fbUser || !name.trim()) return null;
    try {
      const ref = await addDoc(collection(db, 'users', window._fbUser.uid, 'playlists'), {
        name:      name.trim(),
        songs:     [],
        createdAt: serverTimestamp(),
      });
      if (window.pmTrack) window.pmTrack('playlist_create');
      return ref.id;
    } catch (e) {
      console.error('[Portal Music] Playlist create failed:', e.message);
      if (e.message && e.message.includes('permission')) {
        alert('Firestore rules need updating — see instructions below.');
      }
      return null;
    }
  };

  window._fbDeletePlaylist = async playlistId => {
    if (!window._fbUser) return;
    try {
      await deleteDoc(doc(db, 'users', window._fbUser.uid, 'playlists', playlistId));
    } catch { /* ignore */ }
  };

  window._fbRenamePlaylist = async (playlistId, name) => {
    if (!window._fbUser || !name.trim()) return;
    try {
      await updateDoc(doc(db, 'users', window._fbUser.uid, 'playlists', playlistId), { name: name.trim() });
    } catch { /* ignore */ }
  };

  window._fbAddToPlaylist = async (playlistId, songId) => {
    if (!window._fbUser) return;
    try {
      const ref  = doc(db, 'users', window._fbUser.uid, 'playlists', playlistId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const songs = snap.data().songs || [];
      if (!songs.includes(String(songId))) {
        await updateDoc(ref, { songs: [...songs, String(songId)] });
      }
    } catch { /* ignore */ }
  };

  window._fbDeleteUserDoc = async () => {
    if (!window._fbUser) return;
    try {
      // Firestore doesn't cascade: delete the playlists subcollection first
      const uid = window._fbUser.uid;
      const playlists = await getDocs(collection(db, 'users', uid, 'playlists'));
      await Promise.all(playlists.docs.map(p => deleteDoc(p.ref)));
      await deleteDoc(doc(db, 'users', uid));
    } catch { /* ignore */ }
  };

  window._fbRemoveFromPlaylist = async (playlistId, songId) => {
    if (!window._fbUser) return;
    try {
      const ref  = doc(db, 'users', window._fbUser.uid, 'playlists', playlistId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const songs = (snap.data().songs || []).filter(id => id !== String(songId));
      await updateDoc(ref, { songs });
    } catch { /* ignore */ }
  };

  // Re-read Pro status from the server, e.g. while waiting for Stripe's webhook
  // to activate a new subscription. Returns true if the account is Pro.
  window._fbRefreshPro = async () => {
    if (!window._fbUser) return false;
    try {
      const snap = await getDoc(doc(db, 'users', window._fbUser.uid));
      const data = snap.exists() ? snap.data() : {};
      window._fbIsPro = hasActivePro(data);
      window._fbProInfo = proInfo(data);
      window._renderAuthBtn();
    } catch (e) {
      console.warn('[Portal Music] Pro refresh failed:', e.message);
    }
    return window._fbIsPro;
  };

  // Redeem a single-use Pro code. Firestore rules only allow the Pro update
  // when it's written together with marking an unused code as redeemed.
  // Returns { ok: true } or { ok: false, error: '...' }.
  window._fbRedeemCode = async (rawCode) => {
    if (!window._fbUser) return { ok: false, error: 'Please sign in first.' };
    const code = String(rawCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{4,40}$/.test(code)) return { ok: false, error: 'That code doesn\'t look right. Check for typos.' };
    const uid = window._fbUser.uid;
    const codeRef = doc(db, 'proCodes', code);
    try {
      const snap = await getDoc(codeRef);
      if (!snap.exists()) return { ok: false, error: 'That code isn\'t valid. Check for typos.' };
      if (snap.data().redeemedBy) {
        return snap.data().redeemedBy === uid
          ? { ok: false, error: 'You already used this code.' }
          : { ok: false, error: 'That code has already been used.' };
      }
      const months = Math.max(0, parseInt(snap.data().months, 10) || 0);
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', uid), {
        isPro: true, proSource: 'code', proCode: code, proUpdatedAt: serverTimestamp(),
        // months × 30 days from now, or no end date for lifetime codes (checked by firestore.rules)
        proExpiresAt: months > 0 ? Timestamp.fromMillis(Date.now() + months * 30 * 86400000) : null,
      }, { merge: true });
      batch.update(codeRef, { redeemedBy: uid, redeemedAt: serverTimestamp() });
      await batch.commit();
      window._fbIsPro = true;
      window._renderAuthBtn();
      return { ok: true, months };
    } catch (e) {
      console.error('Code redemption failed:', e);
      return { ok: false, error: 'Couldn\'t redeem that code right now. Please try again or contact us.' };
    }
  };

  // ── Auth button ─────────────────────────────────────────────────────────
  window._renderAuthBtn = function () {
    // Cache Pro status in localStorage so app.js can suppress ads before auth resolves
    try { localStorage.setItem('pm_is_pro', window._fbIsPro ? '1' : '0'); } catch {}

    // Pro body/html class for ad hiding (works even if no auth-btn on page)
    if (window._fbIsPro) {
      document.documentElement.classList.add('is-pro');
      document.body && document.body.classList.add('is-pro');
    } else {
      document.documentElement.classList.remove('is-pro');
      document.body && document.body.classList.remove('is-pro');
    }

    // Update logo text
    const logo = document.querySelector('a.logo');
    if (logo) {
      const textNode = [...logo.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
      if (textNode) textNode.textContent = window._fbIsPro ? ' Portal Music Pro' : ' Portal Music';
    }

    const btn = document.getElementById('auth-btn');
    if (!btn) return;
    const user = window._fbUser;

    // Remove any existing upgrade button so we can re-render cleanly
    const existingUpgrade = document.getElementById('upgrade-btn');
    if (existingUpgrade) existingUpgrade.remove();

    if (user) {
      const firstName = user.displayName ? user.displayName.split(' ')[0] : 'Account';
      try { localStorage.setItem('pm_user_name', firstName); } catch {}
      btn.textContent = firstName;
      btn.title       = 'View your profile';
      btn.onclick     = () => { window.location.href = 'profile.html'; };
      btn.classList.add('signed-in');
      const banner = document.getElementById('fav-banner');
      if (banner) banner.style.display = 'none';

      // Show My Profile nav link
      const navProfile = document.getElementById('nav-profile-link');
      if (navProfile) navProfile.style.display = '';

      // Show Pro theme buttons
      const proThemes = document.getElementById('pro-theme-btns');
      if (proThemes && window._fbIsPro) proThemes.style.display = '';

      // (The header's ✦ Pro button already links non-Pro users to Pro)
    } else {
      try { localStorage.removeItem('pm_user_name'); } catch {}
      btn.textContent = 'Sign in';
      btn.title       = 'Sign in with Google to save favorites';
      btn.onclick     = window._fbSignIn;
      btn.classList.remove('signed-in');
    }
  };
}
