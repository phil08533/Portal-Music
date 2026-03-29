// ============================================
// Portal Music — Firebase Authentication
// ============================================
//
// SETUP REQUIRED (one-time, ~15 min):
//   1. Go to console.firebase.google.com
//   2. Create project named "portal-music"
//   3. Authentication → Sign-in method → Google → Enable (add support email)
//   4. Firestore Database → Create → Production mode → choose us-east1
//   5. Firestore Rules → replace with:
//        rules_version = '2';
//        service cloud.firestore {
//          match /databases/{database}/documents {
//            match /users/{uid} {
//              allow read, write: if request.auth != null && request.auth.uid == uid;
//              match /playlists/{playlistId} {
//                allow read, write: if request.auth != null && request.auth.uid == uid;
//              }
//            }
//          }
//        }
//   6. Project Settings → Your apps → Web → Register app → copy firebaseConfig
//   7. Authentication → Settings → Authorized domains → add portal-music.com
//
// Then replace the placeholder values in firebaseConfig below and commit.
// ============================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs, deleteDoc, updateDoc, serverTimestamp, query, orderBy }
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

const configReady = Object.values(firebaseConfig).every(v => !String(v).startsWith('REPLACE_'));

if (!configReady) {
  console.info('[Portal Music] Firebase not yet configured — sign-in disabled. See CLAUDE.md.');
  window._fbUser          = null;
  window._fbAuthReady     = true;
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

  // ── Auth state ─────────────────────────────────────────────────────────
  onAuthStateChanged(auth, async user => {
    window._fbUser = user;

    if (user) {
      try {
        const snap   = await getDoc(doc(db, 'users', user.uid));
        const cloud  = snap.exists() ? (snap.data().favorites || []) : [];
        const local  = JSON.parse(sessionStorage.getItem(FAV_KEY) || '[]');
        const merged = [...new Set([...cloud, ...local])];
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

    // Mark auth as resolved — profile.js waits for this before rendering
    window._fbAuthReady = true;

    window._renderAuthBtn();

    // If profile page is loaded and waiting, kick it off now
    if (typeof window._profileInit === 'function') {
      window._profileInit();
      window._profileInit = null; // only run once per auth state change
    }
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
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

  // ── Auth button ─────────────────────────────────────────────────────────
  window._renderAuthBtn = function () {
    const btn = document.getElementById('auth-btn');
    if (!btn) return;
    const user = window._fbUser;
    if (user) {
      btn.textContent = user.displayName ? user.displayName.split(' ')[0] : 'Account';
      btn.title       = 'View your profile';
      btn.onclick     = () => { window.location.href = 'profile.html'; };
      btn.classList.add('signed-in');
      const banner = document.getElementById('fav-banner');
      if (banner) banner.style.display = 'none';
    } else {
      btn.textContent = 'Sign in';
      btn.title       = 'Sign in with Google to save favorites';
      btn.onclick     = window._fbSignIn;
      btn.classList.remove('signed-in');
    }
  };
}
