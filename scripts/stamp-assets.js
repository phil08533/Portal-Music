#!/usr/bin/env node
/**
 * Portal Music — cache-busting for CSS/JS
 *
 * Rewrites every <script src="…/js/x.js"> and <link href="…/css/x.css"> in the
 * site's HTML to "…?v=<content hash>", so browsers fetch a file again as soon
 * as it changes instead of running a stale cached copy.
 *
 * Run by .github/workflows/pages.yml on every deploy (it only changes the
 * files being published, not the repo). Safe to run repeatedly.
 *
 *   node scripts/stamp-assets.js [siteDir]
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SKIP = new Set(['node_modules', 'admin', '.git', '.github', 'scripts', 'workers', 'music', 'covers']);

const hashCache = {};
function versionOf(asset) {
  if (!(asset in hashCache)) {
    const file = path.join(ROOT, asset);
    hashCache[asset] = fs.existsSync(file)
      ? crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 8)
      : null;
  }
  return hashCache[asset];
}

function htmlFiles(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(htmlFiles(full));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

// src="js/app.js", src="/js/app.js", href="../css/styles.css", with or without an old ?v=
const REF = /\b(src|href)="((?:\.\.\/|\/)?)((?:js|css)\/[\w.-]+\.(?:js|css))(?:\?v=[\w]+)?"/g;

let changed = 0;
for (const file of htmlFiles(ROOT)) {
  const html = fs.readFileSync(file, 'utf8');
  const out = html.replace(REF, (m, attr, prefix, asset) => {
    const v = versionOf(asset);
    return v ? `${attr}="${prefix}${asset}?v=${v}"` : m;
  });
  if (out !== html) { fs.writeFileSync(file, out, 'utf8'); changed++; }
}

console.log(`Stamped asset versions in ${changed} HTML file(s):`,
  Object.entries(hashCache).filter(([, v]) => v).map(([a, v]) => `${a}?v=${v}`).join(', '));
