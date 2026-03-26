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
//            }
//          }
//        }
//   6. Project Settings → Your apps → Web → Register app → copy firebaseConfig
//   7. Authentication → Settings → Authorized domains → add portal-music.com
//
// Then replace the placeholder values in firebaseConfig below and commit.
// ============================================

import { initializeApp }       from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc }
  from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ── Replace with your Firebase project config ──────────────────────────────
const firebaseConfig = {
  apiKey:            'REPLACE_WITH_YOUR_API_KEY',
  authDomain:        'REPLACE_WITH_YOUR_AUTH_DOMAIN',
  projectId:         'REPLACE_WITH_YOUR_PROJECT_ID',
  storageBucket:     'REPLACE_WITH_YOUR_STORAGE_BUCKET',
  messagingSenderId: 'REPLACE_WITH_YOUR_MESSAGING_SENDER_ID',
  appId:             'REPLACE_WITH_YOUR_APP_ID',
};
// ───────────────────────────────────────────────────────────────────────────

const FAV_KEY = 'pm_favorites';

// Guard: if config hasn't been filled in yet, expose safe no-op stubs
const configReady = Object.values(firebaseConfig).every(v => !String(v).startsWith('REPLACE_'));
if (!configReady) {
  console.info('[Portal Music] Firebase not yet configured — sign-in disabled. See CLAUDE.md.');
  window._fbUser          = null;
  window._fbSignIn        = () => { alert('Sign-in coming soon!'); };
  window._fbSignOut       = () => {};
  window._fbSaveFavorites = async () => {};
  window._renderAuthBtn   = function () {
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

  window._fbUser = null;

  // ── Auth state listener ─────────────────────────────────────────────────
  onAuthStateChanged(auth, async user => {
    window._fbUser = user;

    if (user) {
      // Merge cloud favorites with any local session favorites
      try {
        const snap   = await getDoc(doc(db, 'users', user.uid));
        const cloud  = snap.exists() ? (snap.data().favorites || []) : [];
        const local  = JSON.parse(sessionStorage.getItem(FAV_KEY) || '[]');
        const merged = [...new Set([...cloud, ...local])];
        sessionStorage.setItem(FAV_KEY, JSON.stringify(merged));
        await setDoc(doc(db, 'users', user.uid), { favorites: merged }, { merge: true });
      } catch (e) {
        console.warn('[Portal Music] Favorites sync failed:', e.message);
      }
    }

    window._renderAuthBtn();
  });

  // ── Public API ─────────────────────────────────────────────────────────

  window._fbSignIn  = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(console.warn);
  window._fbSignOut = () => signOut(auth).catch(console.warn);

  /** Called after every favorites toggle to persist to Firestore. */
  window._fbSaveFavorites = async favs => {
    if (!window._fbUser) return;
    try {
      await setDoc(doc(db, 'users', window._fbUser.uid), { favorites: favs }, { merge: true });
    } catch {
      // Local sessionStorage already updated — Firestore sync is best-effort
    }
  };

  /**
   * Render the Sign In / display-name button.
   * Called by app.js initHeaderElements() on every SPA navigation so the
   * header button always reflects current auth state.
   */
  window._renderAuthBtn = function () {
    const btn = document.getElementById('auth-btn');
    if (!btn) return;
    const user = window._fbUser;
    if (user) {
      btn.textContent = user.displayName ? user.displayName.split(' ')[0] : 'Account';
      btn.title       = 'Click to sign out';
      btn.onclick     = window._fbSignOut;
      btn.classList.add('signed-in');
      // Hide "session only" banner — favorites now persist across sessions
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
