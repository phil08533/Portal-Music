# Portal Music — owner to-do list

Things only you can do (accounts, dashboards, decisions). Claude keeps this list updated.
Tick items off as you go.

## Do soon
- [ ] **Merge branch `claude/modest-bell-fy2i57`** (analytics, share image, layout fixes) — ask Claude to open the pull request, then merge it.
- [ ] **Test subscription:** in an incognito window sign in with a second Google account → Upgrade →
      Monthly → pay → check "Welcome to Pro" → cancel via Manage subscription → refund the $3 in
      Stripe → Payments. If Pro doesn't turn on, screenshot Stripe → Webhooks → memorable-victory-snapshot.
- [ ] **Turn on analytics:** Cloudflare dashboard → Analytics & Logs → **Web Analytics** → Add a site →
      `portal-music.com` → copy the `token` value from the snippet → send it to Claude
      (or paste it into `CF_ANALYTICS_TOKEN` in `js/app.js`).
- [ ] **Update your local copy** so the admin studio has the latest code:
      `git checkout main && git pull && npm install`

## Monetag (dashboard)
- [ ] Glad tag (popunder, 10786944) → set **frequency cap** to about 1 per 12–24 hours.
- [ ] Delete unused zones on portal-music.com: Epic (10786950), the four Sharp-witted zones
      (10803343–10803346), Cheerful (10803159) and the two untitled ones (11392081, 11392281).
- [ ] If the site ever shows "Unverified": copy the `ads.txt` line Monetag gives you into `ads.txt`.

## Cloudflare security warnings (dashboard)
- [ ] **DNS A records:** confirm the four A records for `portal-music.com` are exactly
      `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (GitHub Pages).
      If so, mark each "Dangling A Record" / "Unproxied A Record" warning as resolved. **Don't delete them.**
- [ ] SSL/TLS → Edge Certificates → **Always Use HTTPS: On**.
- [ ] GitHub repo → Settings → Pages → **Enforce HTTPS** is ticked.
- [ ] Skip: Bot Fight Mode, HSTS, AI Labyrinth. security.txt is now in the repo.
- [ ] **When `security.txt` expires (Sep 2027):** ask Claude to renew it.

## Stripe (dashboard)
- [ ] **Branding:** Settings → Branding → upload `images/icon-512.png` as the icon, brand color `#3da800`.
- [ ] **Emails:** Settings → Customer emails → turn on receipts for successful payments and refunds.
- [ ] Optional: webhook **memorable-victory-snapshot** → Roll secret → paste the new `whsec_…` into the
      Cloudflare Worker secret `STRIPE_WEBHOOK_SECRET` (the old one appeared in a screenshot).

## Firebase (optional, for peace of mind)
- [ ] A fragment of the service-account key appeared in a screenshot. To rotate: Firebase → Project
      settings → Service accounts → Generate new private key → replace `admin/serviceAccountKey.json`
      and the Worker secret `FIREBASE_SERVICE_ACCOUNT` → then delete the old key in Google Cloud
      Console → IAM → Service accounts → Keys.

## Decisions / needs your input
- [ ] **Contact form:** make a free account at formspree.io → create a form → send Claude the form ID.
- [ ] **Genre emoji → icons:** keep the emoji (🎸 🎷 🎤 …) or switch to a matching line-icon set?
- [ ] **Old `covers/` folder in git:** confirm every cover is on R2 (spot-check a few on the site),
      then ask Claude to remove the 467 files from git.
- [ ] **Popunder:** after ~2 weeks of analytics, check whether visitors stay less long; if so,
      limit the popunder to the download page again.

## Done
- [x] Firebase rules published
- [x] Stripe payment links, customer portal, webhook and Worker set up
- [x] Pull request #45 merged
