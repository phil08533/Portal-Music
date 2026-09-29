// ============================================
// Portal Music — Stripe → Pro subscription sync (Cloudflare Worker)
// ============================================
//
// Stripe calls this Worker (a "webhook") whenever a checkout finishes or a
// subscription changes. The Worker verifies the call really came from Stripe,
// then turns Pro on or off on the buyer's Firebase account.
//
// Secrets (Cloudflare → Worker → Settings → Variables and Secrets):
//   STRIPE_WEBHOOK_SECRET     whsec_... from Stripe → Developers → Webhooks
//   FIREBASE_SERVICE_ACCOUNT  the full contents of serviceAccountKey.json
//
// Setup steps: see workers/stripe-pro/README.md
// ============================================

const PRO_STATUSES = new Set(['active', 'trialing', 'past_due']); // past_due: Stripe is still retrying the card
const SIGNATURE_TOLERANCE_SECS = 300;

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Portal Music Stripe webhook is running.', { status: 200 });
    }

    const payload = await request.text();
    const valid = await verifyStripeSignature(payload, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
    if (!valid) return new Response('Invalid signature', { status: 400 });

    const event = JSON.parse(payload);
    try {
      await handleEvent(event, env);
    } catch (err) {
      console.error(`Failed handling ${event.type} ${event.id}:`, err.stack || err);
      // 500 makes Stripe retry later (it retries for up to 3 days)
      return new Response('Handler error', { status: 500 });
    }
    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
  },
};

// ── Event handling ───────────────────────────────────────────────────────────

async function handleEvent(event, env) {
  const fb = firestore(env);
  const obj = event.data.object;

  if (event.type === 'checkout.session.completed') {
    if (obj.mode !== 'subscription') return;
    let uid = obj.client_reference_id;
    const email = obj.customer_details?.email || obj.customer_email;
    if (!uid && email) uid = await fb.uidForEmail(email);
    if (!uid) throw new Error(`No Firebase account for checkout ${obj.id} (${email || 'no email'})`);

    await fb.patch(`stripeCustomers/${obj.customer}`, { uid, email: email || null });
    await fb.patch(`users/${uid}`, {
      isPro: obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required',
      proSource: 'stripe',
      proStatus: 'active',
      stripeCustomerId: obj.customer,
      stripeSubscriptionId: obj.subscription,
      proUpdatedAt: new Date(event.created * 1000),
    });
    return;
  }

  if (event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted') {
    const link = await fb.get(`stripeCustomers/${obj.customer}`);
    // Arrived before checkout.session.completed; that event sets Pro, and Stripe
    // resends nothing we need, so it's safe to skip.
    if (!link?.uid) return;

    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : obj.status;
    const periodEnd = obj.items?.data?.[0]?.current_period_end || obj.current_period_end;
    await fb.patch(`users/${link.uid}`, {
      isPro: PRO_STATUSES.has(status),
      proSource: 'stripe',
      proStatus: status,
      proPlan: obj.items?.data?.[0]?.price?.recurring?.interval || null, // 'month' | 'year'
      proRenews: !obj.cancel_at_period_end && status !== 'canceled',
      proCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      stripeSubscriptionId: obj.id,
      proUpdatedAt: new Date(event.created * 1000),
    });
  }
}

// ── Stripe signature check ───────────────────────────────────────────────────

async function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;
  let timestamp = null;
  const signatures = [];
  for (const item of header.split(',')) {
    const [k, v] = item.split('=');
    if (k === 't') timestamp = v;
    if (k === 'v1') signatures.push(v);
  }
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > SIGNATURE_TOLERANCE_SECS) return false;

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  return signatures.some(sig => timingSafeEqual(sig, expected));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Firebase (REST, authenticated with the service account) ─────────────────

function firestore(env) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const project = sa.project_id;
  // FIRESTORE_EMULATOR_HOST is only used for local testing
  const emulator = env.FIRESTORE_EMULATOR_HOST;
  const base = emulator
    ? `http://${emulator}/v1/projects/${project}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  let tokenPromise = null;
  const authHeader = async () => {
    if (emulator) return 'Bearer owner';
    tokenPromise ||= googleAccessToken(sa);
    return `Bearer ${await tokenPromise}`;
  };

  return {
    async get(path) {
      const res = await fetch(`${base}/${path}`, { headers: { Authorization: await authHeader() } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Firestore get ${path}: ${res.status} ${await res.text()}`);
      return fromFields((await res.json()).fields || {});
    },
    async patch(path, data) {
      const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
      const res = await fetch(`${base}/${path}?${mask}`, {
        method: 'PATCH',
        headers: { Authorization: await authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFields(data) }),
      });
      if (!res.ok) throw new Error(`Firestore patch ${path}: ${res.status} ${await res.text()}`);
    },
    async uidForEmail(email) {
      if (emulator) return null;
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:lookup`, {
        method: 'POST',
        headers: { Authorization: await authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: [email] }),
      });
      if (!res.ok) throw new Error(`Account lookup: ${res.status} ${await res.text()}`);
      return (await res.json()).users?.[0]?.localId || null;
    },
  };
}

function toFields(data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) fields[k] = { nullValue: null };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (typeof v === 'number') fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else if (v instanceof Date) fields[k] = { timestampValue: v.toISOString() };
    else fields[k] = { stringValue: String(v) };
  }
  return fields;
}

function fromFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = 'stringValue' in v ? v.stringValue
      : 'booleanValue' in v ? v.booleanValue
      : 'integerValue' in v ? Number(v.integerValue)
      : 'timestampValue' in v ? v.timestampValue
      : null;
  }
  return out;
}

async function googleAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const b64url = obj => btoa(typeof obj === 'string' ? obj : JSON.stringify(obj))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;

  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(String.fromCharCode(...new Uint8Array(sig)))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`Google token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}
