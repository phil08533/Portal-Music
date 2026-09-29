// ============================================
// Portal Music — Admin Studio: User Accounts
// ============================================
//
// Uses the Firebase Admin SDK with a service account key, which bypasses
// Firestore security rules. The key is a master password for your Firebase
// project: it must NEVER be committed or uploaded anywhere.
//
// Setup: Firebase Console → Project Settings → Service accounts →
//        Generate new private key → save the file as
//        admin/serviceAccountKey.json   (already gitignored)
// or point FIREBASE_SERVICE_ACCOUNT at the file's path.
// ============================================

const fs   = require('fs');
const path = require('path');

const KEY_CANDIDATES = [
  process.env.FIREBASE_SERVICE_ACCOUNT,
  path.join(__dirname, 'serviceAccountKey.json'),
  path.join(__dirname, '..', 'serviceAccountKey.json'),
].filter(Boolean);

let state = null; // { auth, db, projectId } once initialized

function status() {
  if (state) return { configured: true, projectId: state.projectId };
  try {
    init();
    return { configured: true, projectId: state.projectId };
  } catch (err) {
    return { configured: false, error: err.message };
  }
}

function init() {
  if (state) return state;

  const keyPath = KEY_CANDIDATES.find(p => fs.existsSync(p));
  if (!keyPath) {
    throw new Error('No service account key found. Save it as admin/serviceAccountKey.json');
  }

  let admin;
  try {
    admin = require('firebase-admin');
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      throw new Error('firebase-admin is not installed. In the Portal-Music folder run: git pull, then npm install');
    }
    throw new Error(`firebase-admin failed to load on Node ${process.version}: ${err.message}`);
  }

  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  if (key.type !== 'service_account' || !key.private_key) {
    throw new Error(`${path.basename(keyPath)} is not a service account key file`);
  }

  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({ credential: admin.credential.cert(key) });

  state = { auth: admin.auth(app), db: admin.firestore(app), projectId: key.project_id, admin };
  return state;
}

function toIso(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  const d = new Date(ts);
  return isNaN(d) ? null : d.toISOString();
}

// Merge Firebase Auth accounts with their Firestore profile documents.
async function listUsers() {
  const { auth, db } = init();

  const authUsers = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    authUsers.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);

  const docs = new Map();
  const snap = await db.collection('users').get();
  snap.forEach(d => docs.set(d.id, d.data()));

  const users = authUsers.map(u => {
    const data = docs.get(u.uid) || {};
    docs.delete(u.uid);
    return {
      uid:          u.uid,
      email:        u.email || data.email || '',
      displayName:  u.displayName || data.displayName || '',
      photoURL:     u.photoURL || data.photoURL || '',
      createdAt:    toIso(u.metadata.creationTime),
      lastSignIn:   toIso(u.metadata.lastSignInTime),
      disabled:     !!u.disabled,
      isPro:        data.isPro === true,
      proSource:    data.proSource || null,
      proUpdatedAt: toIso(data.proUpdatedAt),
      favorites:    Array.isArray(data.favorites) ? data.favorites.length : 0,
      adminNote:    data.adminNote || '',
    };
  });

  // Firestore docs whose Auth account no longer exists (e.g. deleted in console)
  const orphans = [...docs.entries()].map(([uid, data]) => ({ uid, email: data.email || '' }));

  users.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return { users, orphans };
}

async function getUserDetail(uid) {
  const { db } = init();
  const playlists = await db.collection('users').doc(uid).collection('playlists').get();
  return {
    playlists: playlists.docs.map(p => ({
      id: p.id,
      name: p.get('name') || 'Untitled',
      songs: (p.get('songs') || []).length,
    })),
  };
}

async function setPro(uid, isPro) {
  const { auth, db, admin } = init();
  await auth.getUser(uid); // throws if the account doesn't exist
  await db.collection('users').doc(uid).set({
    isPro: !!isPro,
    proSource: isPro ? 'admin' : null,
    proUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function setProByEmail(email, isPro) {
  const { auth } = init();
  let user;
  try {
    user = await auth.getUserByEmail(String(email).trim().toLowerCase());
  } catch {
    throw new Error(`No account found for ${email}. They need to sign in on the site once first.`);
  }
  await setPro(user.uid, isPro);
  return { uid: user.uid, email: user.email, displayName: user.displayName || '' };
}

async function setNote(uid, note) {
  const { db } = init();
  await db.collection('users').doc(uid).set({ adminNote: String(note || '').slice(0, 500) }, { merge: true });
}

async function setDisabled(uid, disabled) {
  const { auth } = init();
  await auth.updateUser(uid, { disabled: !!disabled });
  // Sign them out everywhere so a suspension takes effect immediately
  if (disabled) await auth.revokeRefreshTokens(uid);
}

// Permanently removes the sign-in account, profile, favorites and playlists.
async function deleteUser(uid) {
  const { auth, db } = init();
  const ref = db.collection('users').doc(uid);
  await db.recursiveDelete(ref);
  try {
    await auth.deleteUser(uid);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
  }
}

module.exports = { status, listUsers, getUserDetail, setPro, setProByEmail, setNote, setDisabled, deleteUser };
