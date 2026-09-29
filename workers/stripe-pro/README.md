# Stripe subscriptions → automatic Pro

When someone subscribes, Stripe notifies a small Cloudflare Worker (`worker.js`), which
turns Pro on for their account. When they cancel or stop paying, it turns Pro off.
Plans: **$3 / month** and **$20 / year**.

```
Visitor ──► Stripe checkout ──► Stripe ──webhook──► Cloudflare Worker ──► Firebase (isPro)
```

Takes about 20 minutes. **Do it all in Stripe _test mode_ first** (toggle at the top of the
Stripe dashboard), try it with test card `4242 4242 4242 4242`, then repeat steps 1–3, 5 and 7
in live mode. Test and live mode have separate products, links and webhook secrets.

---

## 1. Create the product and prices (Stripe)
1. Stripe → **Product catalog** → **+ Add product**
2. Name: `Portal Music Pro`
3. Price 1: **Recurring**, `$3.00`, billing period **Monthly** → Save
4. Open the product → **+ Add another price** → **Recurring**, `$20.00`, **Yearly** → Save

## 2. Create two Payment Links (Stripe)
For **each** price (monthly and yearly):
1. Open the price → **Create payment link**
2. **After payment** → choose **Don't show confirmation page** → **Redirect customers to your website**:
   `https://portal-music.com/upgrade.html?checkout=success`
3. Create the link and copy it (looks like `https://buy.stripe.com/...`)

## 3. Turn on the customer portal (Stripe)
This is where subscribers cancel or update their card.
1. Stripe → **Settings** → **Billing** → **Customer portal**
2. Turn on **Cancel subscriptions** (choose "At end of billing period") and **Update payment methods**
3. Activate, then copy the **Login link** (looks like `https://billing.stripe.com/p/login/...`)

## 4. Create the Worker (Cloudflare)
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Create Worker**
2. Name it `portal-music-stripe` → **Deploy**
3. **Edit code** → delete everything → paste the whole contents of `workers/stripe-pro/worker.js` → **Deploy**
4. Copy the Worker's URL (looks like `https://portal-music-stripe.<you>.workers.dev`).
   Opening it in a browser should say "Portal Music Stripe webhook is running."

## 5. Point Stripe at the Worker (Stripe)
1. Stripe → **Developers** → **Webhooks** → **+ Add endpoint**
2. Endpoint URL: your Worker URL from step 4
3. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. **Add endpoint**, then under **Signing secret** click **Reveal** and copy it (`whsec_...`)

## 6. Give the Worker its secrets (Cloudflare)
Worker → **Settings** → **Variables and Secrets** → **+ Add** (type **Secret**) for each:

| Name | Value |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | the `whsec_...` from step 5 |
| `FIREBASE_SERVICE_ACCOUNT` | the **entire contents** of your `admin/serviceAccountKey.json` (open it in a text editor, copy everything) |

Click **Deploy** after adding them.

## 7. Connect the site
Open `upgrade.html`, find `STRIPE_LINKS` near the bottom, and paste in your links:

```js
const STRIPE_LINKS = {
  month: 'https://buy.stripe.com/...',   // from step 2, monthly
  year:  'https://buy.stripe.com/...',   // from step 2, yearly
};
const STRIPE_PORTAL_URL = 'https://billing.stripe.com/p/login/...';  // from step 3
```

Commit and push. Make sure the latest `firestore.rules` is published in Firebase
(Firestore Database → Rules → paste → **Publish**).

## 8. Test it
1. On the site, sign in, go to **Upgrade**, pick a plan, pay with `4242 4242 4242 4242`
   (any future date, any CVC) while Stripe is in test mode.
2. You land back on the Upgrade page, which says "Activating Pro…" and then "Welcome to Pro!"
3. In the admin studio → **Users & Pro**, that account shows Pro with source `stripe`.
4. Cancel through the customer portal link → Pro stays until the period ends.
   To test removal right away: Stripe → Subscriptions → the subscription → **Cancel immediately**.

If Pro doesn't turn on: Stripe → Developers → Webhooks → your endpoint shows each delivery and
the Worker's response. Cloudflare → Worker → **Logs** shows errors. Stripe retries failed
deliveries automatically for 3 days.

---

### How it decides Pro
| Stripe status | Pro? |
|---|---|
| `active`, `trialing` | ✅ |
| `past_due` (card failed, Stripe retrying) | ✅ grace period |
| `unpaid`, `canceled`, `incomplete_expired`, `paused` | ❌ |

The buyer's account is matched by their Firebase user ID, which the Upgrade page passes to
Stripe. If that's missing, the Worker matches by the email used at checkout.

People who got Pro another way (the old $5 payments, admin grants, Pro codes) are not affected:
the Worker only changes accounts that bought a subscription.
