/* Bovitech Contacts — offline-first contacts app
   Data lives on the device (IndexedDB). OneDrive sync + Google Contacts push plug in via Sync/GContacts modules (to be connected). */
'use strict';

/* ---------------- constants ---------------- */
const RATINGS = ['aplus', 'a', 'b', 'c'];
const RATING_SET = new Set(RATINGS);
const RATING_SHORT = { aplus: 'A+', a: 'A', b: 'B', c: 'C' };
// which photo wins when we must pick one automatically (user is still asked via the job list)
const PHOTO_PRIORITY = ['dna', 'blockedc', 'blockedn', 'payup', 'newfac', 'newassess', 'newmaybe', 'aplus', 'a', 'b', 'c', 'bvs', 'bfriends', 'sheepreg', 'sheepocc', 'occ', 'industry', 'prac', 'phone', 'family', 'inactive']; // default order; Inactive is overridden by every other tag
const APP_VERSION = '4.1 (15 Oct 2026)';
// current photo priority: the order saved in Settings (synced), then any photo tags not yet placed
function photoOrder() {
  const withPhoto = D.tags.filter((t) => tagPhotoSrc(t.id)).map((t) => t.id);
  const saved = (D.settings.photoPriority || PHOTO_PRIORITY).filter((id) => withPhoto.includes(id));
  return [...saved, ...withPhoto.filter((id) => !saved.includes(id))];
}
const prioIdx = (id) => { const o = photoOrder(); const i = o.indexOf(id); return i < 0 ? 999 : i; };
const MAX_STOPS = 9;
const ICONS = {
  contacts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><path d="M17 4a4 4 0 0 1 0 8M22 21c0-3-1.5-5.5-4-6.5"/></svg>',
  biz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-7h6v7"/></svg>',
  route: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/></svg>',
  jobs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/><path d="M8 10.5h5M10.5 8v5"/></svg>',
  flag: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5 22V3h12l-2 4.5L17 12H7v10z"/></svg>',
};

/* ---------------- state ---------------- */
let D = null;                 // the data
const S = {                   // UI state
  tab: 'contacts', sel: null, // sel: {kind:'contact'|'business', id}
  q: '', tagF: {}, quick: {}, sort: 'first', bq: '', bsort: 'name',
  route: { stops: [], start: { type: 'home' }, end: { type: 'home' }, mode: 'efficient', endSame: true },
};
let IDX = {};                 // indexes rebuilt after every change

const $ = (s, r = document) => r.querySelector(s);
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p) => p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const DEVICE = (() => { try { let d = localStorage.getItem('bvt-device'); if (!d) { d = uid('dev'); localStorage.setItem('bvt-device', d); } return d; } catch (e) { return 'dev-unknown'; } })();

/* ---------------- storage (IndexedDB, falls back to memory) ---------------- */
const Store = {
  db: null,
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((res, rej) => {
      const r = indexedDB.open('bovitech-contacts', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return this.db;
  },
  async get(k) {
    try { const db = await this.open(); return await new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); }
    catch (e) { return undefined; }
  },
  async set(k, v) {
    try { const db = await this.open(); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); return true; }
    catch (e) { return false; }
  },
};
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => Store.set('data', D), 150); }
function touch(rec) { rec._u = Date.now(); rec._dev = DEVICE; rec._dirty = true; if (typeof TOUCHED !== 'undefined') TOUCHED.add(rec); if (window.Sync) Sync.soon(); }
function pendingCount() { if (!D) return 0; return [...D.contacts, ...D.businesses, ...D.tags, D.settings].filter((r) => r && r._dirty).length + (D.deleted || []).filter((x) => !x.synced).length + (D._dismissDirty ? 1 : 0) + (D._trashDirty ? 1 : 0) + (D._logDirty ? 1 : 0); }

async function loadSeed() {
  if (window.SEED) { const d = JSON.parse(JSON.stringify(window.SEED)); d.importedAt = '14 Oct 2026'; return d; }
  // hosted app: no client data ships with the app — start empty, then sign in (Google Drive) or import the initial data file
  const r = await fetch('defaults.json'); const d = await r.json(); return { ...d, contacts: [], businesses: [], dismissed: {}, firstRun: true };
}

/* ---------------- indexes & helpers ---------------- */
function reindex() {
  const biz = new Map(D.businesses.map((b) => [b.id, b]));
  const tags = new Map(D.tags.map((t) => [t.id, t]));
  const farms = new Map(); const farmBiz = new Map();
  D.businesses.forEach((b) => b.farms.forEach((f) => { farms.set(f.id, f); farmBiz.set(f.id, b); }));
  const bizContacts = new Map(D.businesses.map((b) => [b.id, []]));
  D.contacts.forEach((c) => c.links.forEach((l) => { if (bizContacts.has(l.bid)) bizContacts.get(l.bid).push(c); }));
  IDX = { biz, tags, farms, farmBiz, bizContacts, hay: new Map(), bhay: new Map() };
}
// alphabetical, but names starting with a letter come before names starting with a number/symbol
const alphaKey = (str) => { const t = (str || '').trim().toLowerCase(); return (/^[a-z]/.test(t) ? '1' : '2') + t; };
const alphaCmp = (a, b) => alphaKey(a).localeCompare(alphaKey(b), 'en', { numeric: true });
const fullName = (c) => [c.first, c.middle && !/^\(/.test(c.middle) ? c.middle : '', c.last].filter(Boolean).join(' ') + (c.middle && /^\(/.test(c.middle) ? ' ' + c.middle : '');
const bizOf = (c) => c.links.map((l) => IDX.biz.get(l.bid)).filter(Boolean);
const tagName = (id) => IDX.tags.get(id)?.name || id;
// Categories: a business has categories (A+ to C + Pay up front, Inactive …). Each contact follows its business's
// categories unless it has its own (c.ownCats for the others, a rating tag on the contact for A+ to C).
const isCatTag = (t) => IDX.tags.get(t)?.group === 'client';
const followsBiz = (c) => !c.ownCats && bizOf(c).length > 0;
const bizCatsOf = (c) => [...new Set(bizOf(c).flatMap((b) => b.cats || []))];
const effCats = (c) => (followsBiz(c) ? bizCatsOf(c) : c.tags.filter(isCatTag));
const effTags = (c) => [...c.tags.filter((t) => !isCatTag(t)), ...effCats(c)];
const ownRating = (c) => c.tags.find((t) => RATING_SET.has(t)) || null;
// one category only (A+ to C counts as a category). catOf = the single category a contact/business has.
const bizCat = (b) => b.rating || (b.cats || [])[0] || '';
const catOf = (c) => (followsBiz(c) ? bizOf(c).map(bizCat).find(Boolean) || '' : ownRating(c) || c.tags.filter(isCatTag)[0] || '');
function setBizCat(b, v) { b.rating = RATING_SET.has(v) ? v : null; b.cats = v && !RATING_SET.has(v) ? [v] : []; touch(b); }
function setOne(c, v) { // give a contact exactly one category ('' = none); matching the business → follow the business
  c.tags = c.tags.filter((t) => !isCatTag(t) && !RATING_SET.has(t));
  if (bizOf(c).length && v === (bizOf(c).map(bizCat).find(Boolean) || '')) c.ownCats = false; else { c.ownCats = true; if (v) c.tags.push(v); }
  touch(c);
}
function setCats(c, list) { // older callers: keep only the last category given
  list = [...new Set(list.filter(isCatTag))]; if (list.length > 1) list = [list[list.length - 1]];
  const same = bizOf(c).length && list.slice().sort().join() === bizCatsOf(c).sort().join();
  c.tags = c.tags.filter((t) => !isCatTag(t)); if (same) c.ownCats = false; else { c.ownCats = true; c.tags.push(...list); }
  touch(c);
}
function contactRatings(c) {
  const own = ownRating(c); if (own) return [{ rating: own, biz: null, own: true }];
  if (!followsBiz(c)) return []; // their own category (one only) replaces the business's
  return bizOf(c).filter((b) => b.rating).map((b) => ({ rating: b.rating, biz: b }));
}
const distinctRatings = (c) => [...new Set(contactRatings(c).map((r) => r.rating))];
function contactTagSet(c) { const s = new Set(effTags(c)); contactRatings(c).forEach((r) => s.add(r.rating)); return s; }
function hasWarning(c) { return !!(c.warnings && c.warnings.trim()) || bizOf(c).some((b) => b.warnings && b.warnings.trim()); }
const tagPhotoSrc = (id) => { const t = IDX.tags.get(id); if (!t) return null; if (t.photoData) return t.photoData; if (!t.photo) return null; return (window.IMG && window.IMG[t.photo]) || 'img/' + t.photo + '.png'; };
function rbadge(r) { return `<span class="rb ${r}">${RATING_SHORT[r]}</span>`; }
const fmtKm = (f) => (f.kmReturn == null ? '—' : `${+f.kmReturn.toFixed(1)} km return`);
const fmtMin = (m) => (m == null ? '' : m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
// Google Maps driving directions from homebase to a farm (the route the km suggestion is based on)
const gmapsRoute = (f) => `https://www.google.com/maps/dir/?api=1&origin=${D.settings.home.lat},${D.settings.home.lng}&destination=${f.lat},${f.lng}&travelmode=driving`;
const gmapsPin = (f) => `https://www.google.com/maps/search/?api=1&query=${f.lat},${f.lng}`;
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

/* ---------------- photos ---------------- */
function photoCandidates(c) {
  const dr = distinctRatings(c);
  const ptags = effTags(c).filter((t) => !RATING_SET.has(t) && tagPhotoSrc(t));
  return { dr, ptags };
}
function needsPhotoChoice(c) {
  if (c.photoChoice && c.photoChoice !== 'auto') return false;
  const { dr, ptags } = photoCandidates(c);
  if (dr.length > 1) return ptags.length > 0;
  return dr.length + ptags.length > 1;
}
function ratingLabel(c, r) { return contactRatings(c).filter((x) => x.rating === r).map((x) => (x.biz ? x.biz.name : RATING_SHORT[r] + ' client')).join(' / '); }
function photoSpec(c) {
  const warn = hasWarning(c);
  const pc = c.photoChoice || 'auto';
  if (pc === 'custom' && c.photoData) return { custom: c.photoData, warn };
  const { dr, ptags } = photoCandidates(c);
  let parts = [];
  if (pc.startsWith('split:')) {
    parts = pc.slice(6).split(',').filter((t) => tagPhotoSrc(t)).slice(0, 2).map((t) => ({ tag: t, label: RATING_SET.has(t) ? ratingLabel(c, t) || tagName(t) : tagName(t) }));
  } else if (pc !== 'auto' && tagPhotoSrc(pc)) {
    parts = [{ tag: pc }];
  } else if (dr.length > 1) {
    parts = dr.slice(0, 2).map((r) => ({ tag: r, label: ratingLabel(c, r) }));
  } else {
    const cands = [...dr, ...ptags].filter((t) => tagPhotoSrc(t));
    cands.sort((a, b) => prioIdx(a) - prioIdx(b));
    if (cands.length) parts = [{ tag: cands[0] }];
  }
  const initials = ((c.first || '')[0] || '') + ((c.last || '')[0] || '');
  return { parts, warn, initials: initials.toUpperCase() };
}
const imgCache = new Map();
function loadImg(src) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }));
  return imgCache.get(src);
}
function drawCover(ctx, img, x, y, w, hgt) {
  const r = Math.max(w / img.width, hgt / img.height); const sw = w / r, sh = hgt / r;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, hgt);
}
function fitText(ctx, text, maxW, size, weight = 700) {
  let s = size; do { ctx.font = `${weight} ${s}px Barlow, Arial, sans-serif`; s -= 1; } while (ctx.measureText(text).width > maxW && s > 8);
  let t = text; while (ctx.measureText(t).width > maxW && t.length > 3) t = t.slice(0, -2) + '…';
  return t;
}
const photoCache = new Map();
async function renderPhoto(spec, S0 = 320) {
  const key = JSON.stringify(spec) + S0;
  if (photoCache.has(key)) return photoCache.get(key);
  const p = (async () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = S0; const ctx = cv.getContext('2d');
    ctx.fillStyle = '#8d8a85'; ctx.fillRect(0, 0, S0, S0);
    if (spec.custom) { const im = await loadImg(spec.custom); if (im) drawCover(ctx, im, 0, 0, S0, S0); }
    else if (!spec.parts.length) {
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 ${S0 * 0.36}px Barlow, Arial`; ctx.fillText(spec.initials || '?', S0 / 2, S0 / 2 + 4);
    } else if (spec.parts.length === 1) {
      const im = await loadImg(tagPhotoSrc(spec.parts[0].tag)); if (im) drawCover(ctx, im, 0, 0, S0, S0);
    } else {
      const w = S0 / 2;
      for (let i = 0; i < 2; i++) { const im = await loadImg(tagPhotoSrc(spec.parts[i].tag)); if (im) drawCover(ctx, im, i * w, 0, w, S0); }
      ctx.fillStyle = '#fff'; ctx.fillRect(w - 2, 0, 4, S0);
      // labels: which business each half belongs to
      for (let i = 0; i < 2; i++) {
        const y = S0 * 0.17, bh = S0 * 0.14;
        ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(i * w + 4, y, w - 8, bh);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const t = fitText(ctx, spec.parts[i].label || '', w - 16, Math.round(S0 * 0.075));
        ctx.fillText(t, i * w + w / 2, y + bh / 2 + 1);
      }
    }
    if (spec.warn) {
      const y = S0 * 0.6, bh = S0 * 0.2;
      ctx.fillStyle = '#d71f2b'; ctx.fillRect(0, y, S0, bh);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, y, S0, S0 * 0.012); ctx.fillRect(0, y + bh - S0 * 0.012, S0, S0 * 0.012);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const t = fitText(ctx, 'CHECK WARNING', S0 * 0.86, Math.round(S0 * 0.1), 800);
      ctx.fillText(t, S0 / 2, y + bh / 2 + 2);
    }
    return cv.toDataURL('image/jpeg', 0.88);
  })();
  photoCache.set(key, p); return p;
}
function contactPhotoImg(c, cls = 'av', size = 160) {
  const idk = 'p' + Math.random().toString(36).slice(2, 9);
  renderPhoto(photoSpec(c), size).then((src) => { const el = document.getElementById(idk); if (el) el.src = src; });
  return `<img id="${idk}" class="${cls}" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">`;
}

/* ---------------- search ---------------- */
function parseQuery(q) {
  const inc = [], exc = []; const re = /(-?)"([^"]+)"|(-?)(\S+)/g; let m;
  while ((m = re.exec(q))) { const neg = m[1] || m[3]; const term = (m[2] || m[4] || '').toLowerCase(); if (!term || term === '-') continue; (neg ? exc : inc).push(term); }
  return { inc, exc };
}
function contactHay(c) {
  if (IDX.hay.has(c.id)) return IDX.hay.get(c.id);
  const bs = bizOf(c); const parts = [fullName(c), c.role, c.info, c.warnings, c.sideNotes, c.dnaReason, ...c.postal];
  c.tags.forEach((t) => parts.push(tagName(t)));
  contactRatings(c).forEach((r) => parts.push(tagName(r.rating)));
  [...c.mobiles, ...c.landlines].forEach((p) => parts.push(p.value, p.value.replace(/\D/g, ''), p.value.replace(/\D/g, '').replace(/^61/, '0')));
  c.emails.forEach((e) => parts.push(e.value));
  bs.forEach((b) => { parts.push(b.name, b.info, b.warnings); b.pics.forEach((p) => parts.push(p.value)); b.patientIds.forEach((p) => parts.push(p.label, p.value)); b.farms.forEach((f) => parts.push(f.name, f.address, f.info)); });
  const s = parts.filter(Boolean).join(' \u0001 ').toLowerCase(); IDX.hay.set(c.id, s); return s;
}
function matchQ(hay, pq) { return pq.inc.every((t) => hay.includes(t)) && !pq.exc.some((t) => hay.includes(t)); }
function filteredContacts() {
  const pq = parseQuery(S.q);
  const tf = Object.entries(S.tagF);
  return D.contacts.filter((c) => {
    if (!matchQ(contactHay(c), pq)) return false;
    if (tf.length) { const ts = contactTagSet(c); for (const [t, m] of tf) { if (m === 'inc' && !ts.has(t)) return false; if (m === 'exc' && ts.has(t)) return false; } }
    const q = S.quick;
    if (q.starred && !c.starred) return false;
    if (q.warn && !hasWarning(c)) return false;
    if (q.multi && distinctRatings(c).length < 2) return false;
    if (q.split && (photoSpec(c).parts || []).length < 2) return false;
    if (q.flagged && !jobsFor('contact', c.id).length) return false;
    return true;
  });
}

/* ---------------- job list (things needing attention) ---------------- */
function primaryOf(b) {
  const cs = IDX.bizContacts.get(b.id) || [];
  if (b.primaryContact && cs.some((c) => c.id === b.primaryContact)) return cs.find((c) => c.id === b.primaryContact);
  return cs.find((c) => c.tags.includes('pa')) || cs.find((c) => c.tags.includes('pi')) || null;
}
const isClientBiz = (b) => b.type !== 'nonclient';
const locWord = (b, plural) => (isClientBiz(b) ? (plural ? 'Farms' : 'Farm') : plural ? 'Business locations' : 'Business location');
// other contacts at the same business(es) that don't yet have this category change
function catOthers(c, fl) {
  const want = catOf(c); const out = new Set(); fl.bids.forEach((bid) => (IDX.bizContacts.get(bid) || []).forEach((o) => { if (o !== c && catOf(o) !== want) out.add(o); }));
  return [...out];
}
function applyCat(cid, at) {
  const c = D.contacts.find((x) => x.id === cid); const fl = c && (c.flags || []).find((f) => f.type === 'catprop' && f.at === +at); if (!fl) return 0;
  const others = catOthers(c, fl);
  others.forEach((o) => { setOne(o, catOf(c)); o.flags = o.flags || []; if (fl.added.includes('inactive')) o.flags.push({ type: 'ezyvet', at: Date.now() }); if (fl.added.includes('dna') && !o.tags.includes('blockedc')) o.flags.push({ type: 'blockcheck', at: Date.now() }); touch(o); });
  c.flags = c.flags.filter((f) => f !== fl); touch(c); return others.length;
}
function setBlocked(cid, yes) {
  const c = D.contacts.find((x) => x.id === cid); if (!c) return;
  c.tags = c.tags.filter((t) => t !== 'blockedn' && (yes || t !== 'blockedc')); c.tags.push(yes ? 'blockedc' : 'blockedn');
  if (yes) c.flags = (c.flags || []).filter((f) => f.type !== 'blockcheck'); touch(c);
}
function missingInfo(c) {
  const bs = bizOf(c); const m = [];
  if (!c.emails.length) m.push('email');
  if (!c.mobiles.length && !c.landlines.length) m.push('phone number');
  if (!bs.length) m.push('business');
  if (bs.length && !bs.some((b) => b.farms.some((f) => f.lat != null))) m.push(bs.some(isClientBiz) ? 'farm GPS pin' : 'business location GPS pin');
  const cb = bs.filter(isClientBiz); // non-client (industry) businesses don't need these
  if (!bs.length || cb.length) {
    if (!cb.some((b) => b.pics.length)) m.push('PIC');
    if (!cb.some((b) => b.patientIds.length)) m.push('patient ID');
    if (!contactRatings(c).length) m.push('contact category (A+ to C)');
  }
  return m;
}
function computeJobs() {
  const jobs = []; const dis = D.dismissed || {};
  const add = (j) => { j.key = j.key || j.type + ':' + (j.fid || j.id); if (!dis[j.key]) jobs.push(j); };
  // farms
  const byGps = new Map();
  D.businesses.forEach((b) => {
    b.farms.forEach((f) => {
      const who = b.name + (f.name ? ' — ' + f.name : '');
      if (f.lat == null) add({ type: 'nogps', kind: 'business', id: b.id, fid: f.id, who, note: 'Address but no GPS pin' + (f.address ? ': ' + f.address : '') });
      if (f.kmReturn == null) add({ type: 'nokm', kind: 'business', id: b.id, fid: f.id, who, note: 'No distance recorded', suggest: f.gKm != null ? { km: f.gKm, fids: [f.id], why: 'Google Maps' } : null, needsLookup: f.gKm == null && f.lat != null ? [f.id] : null });
      if (f.kmStatus === 'needs-verify') add({ type: 'kmverify', kind: 'business', id: b.id, fid: f.id, who, note: 'Distance requires verification' });
      (f.flags || []).forEach((fl) => { if (['signfix', 'kmcheck'].includes(fl.type)) add({ type: fl.type, kind: 'business', id: b.id, fid: f.id, who, note: fl.note, data: fl, suggest: fl.type === 'kmcheck' ? { km: fl.google, fids: [f.id], why: 'Google Maps, rounded up' } : null }); });
      if (f.lat != null && f.kmReturn != null) { const k = f.lat.toFixed(3) + ',' + f.lng.toFixed(3); if (!byGps.has(k)) byGps.set(k, []); byGps.get(k).push({ b, f }); }
    });
    (b.flags || []).forEach((fl) => { if (fl.type !== 'catpick') add({ type: fl.type, kind: 'business', id: b.id, who: b.name, note: fl.note }); });
    if (b.primaryRequired !== false && !primaryOf(b)) add({ type: 'noprimary', kind: 'business', id: b.id, who: b.name, note: (IDX.bizContacts.get(b.id) || []).length ? 'Choose the primary contact (Edit business → Primary contact)' : 'No contacts linked — add a contact and make them primary' });
  });
  // two farms on the same GPS pin: same farm or different farm?
  const pinned = []; D.businesses.forEach((b) => b.farms.forEach((f) => { if (f.lat != null) pinned.push({ b, f }); }));
  for (let i = 0; i < pinned.length; i++) for (let k = i + 1; k < pinned.length; k++) {
    const A = pinned[i], B = pinned[k];
    if (Math.abs(A.f.lat - B.f.lat) > 0.01 || Math.abs(A.f.lng - B.f.lng) > 0.012) continue;
    const dkm = hav(A.f, B.f); if (dkm >= 0.02) continue; // only pins on the same spot (within 20 m)
    const key = 'nearpin:' + [A.f.id, B.f.id].sort().join('|');
    const nm = (x) => x.b.name + (x.f.name ? ' — ' + x.f.name : '');
    add({ type: 'nearpin', key, kind: 'business', id: A.b.id, fid: A.f.id, who: nm(A) + '  ↔  ' + nm(B), note: `These two farms have the same GPS pin. Are they the same farm or different farms? (1 = ${nm(A)}, 2 = ${nm(B)})`, pair: { a: A.f.id, b: B.f.id, same: A.b.id === B.b.id } });
  }
  dupeJobs(add);
  byGps.forEach((arr) => {
    const kms = [...new Set(arr.map((x) => x.f.kmReturn))];
    if (kms.length > 1) { const gk = arr.map((x) => x.f.gKm).find((v) => v != null); const best = gk != null ? kms.slice().sort((a, b) => Math.abs(a - gk) - Math.abs(b - gk))[0] : null;
      const sug = gk != null ? { km: gk, fids: arr.map((x) => x.f.id), why: `Google Maps says ${gk} km${best != null ? ` — closest recorded value is ${best} km` : ''}` } : null;
      arr.forEach(({ b, f }) => add({ suggest: sug, needsLookup: gk == null ? arr.map((x) => x.f.id) : null, type: 'kmconflict', kind: 'business', id: b.id, fid: f.id, who: b.name + (f.name ? ' — ' + f.name : ''), note: 'Same GPS location has different km recorded: ' + kms.map((k) => k + ' km').join(' / ') + (arr.length > 1 ? ' (' + [...new Set(arr.map((x) => x.b.name))].join(', ') + ')' : '') })); }
  });
  // contacts
  D.contacts.forEach((c) => {
    const who = fullName(c);
    if (needsPhotoChoice(c)) { const { dr, ptags } = photoCandidates(c); const cands = [...dr, ...ptags].sort((a, b) => prioIdx(a) - prioIdx(b)); add({ type: 'photo', kind: 'contact', id: c.id, who, note: 'Has more than one tag with a photo (' + [...dr, ...ptags].map(tagName).join(', ') + ') — choose one, or a split photo', photoSuggest: cands[0] }); }
    if (c.tags.includes('sheep')) add({ type: 'sheep', kind: 'contact', id: c.id, who, note: 'Choose Sheep only (regular) or Sheep only (occasional)' });
    (c.flags || []).forEach((fl) => {
      if (fl.type === 'sheepconfirm' && effTags(c).includes('sheepocc')) add({ type: 'sheep', kind: 'contact', id: c.id, who, note: 'Set to Sheep only (occasional) for now — change to regular if needed' });
      if (fl.type === 'catprop') { const others = catOthers(c, fl); if (others.length) add({ type: 'catprop', key: 'catprop:' + c.id + ':' + fl.at, kind: 'contact', id: c.id, who, note: `Category changed (${[...fl.added.map((t) => '+ ' + tagName(t)), ...fl.removed.map((t) => '− ' + tagName(t))].join(', ')}). Make the same change for ${others.map(fullName).join(', ')} (same business)?`, cat: { cid: c.id, at: fl.at } }); }
      if (fl.type === 'blockcheck' && effTags(c).includes('dna') && !c.tags.includes('blockedc')) add({ type: 'blockcheck', key: 'blockcheck:' + c.id + ':' + fl.at, kind: 'contact', id: c.id, who, note: c.tags.includes('blockedn') ? 'Marked "Do not answer" — number not blocked yet. Has it been blocked now?' : 'Marked "Do not answer" — has the number been blocked on the phones yet?', block: c.id });
      if (fl.type === 'catpick') return;
      if (fl.type === 'ezyvet') add({ type: 'ezyvet', key: 'ezyvet:' + c.id + ':' + fl.at, kind: 'contact', id: c.id, who, note: 'Marked inactive ' + new Date(fl.at).toLocaleDateString('en-AU') + ' — check the client has been inactivated in ezyVet' });
    });
    if (c.createdAt) { const miss = missingInfo(c); if (miss.length) add({ type: 'newinfo', kind: 'contact', id: c.id, who, note: 'Missing: ' + miss.join(', ') }); }
    (c.flags || []).forEach((fl) => { if (fl.type === 'multirating') add({ type: 'multirating', kind: 'contact', id: c.id, who, note: fl.note }); });
  });
  D.businesses.forEach((b) => (b.flags || []).forEach((fl) => { if (fl.type === 'catpick') add({ type: 'catpick', key: 'catpick:' + b.id, kind: 'business', id: b.id, who: b.name, note: `Had ${fl.had.map(tagName).join(' + ')} — now ${fl.kept ? tagName(fl.kept) : 'no category'}. Change it if that's not right.` }); }));
  D.contacts.forEach((c) => (c.flags || []).forEach((fl) => { if (fl.type === 'catpick') add({ type: 'catpick', key: 'catpick:' + c.id, kind: 'contact', id: c.id, who: fullName(c), note: `Had ${fl.had.map(tagName).join(' + ')} — now ${fl.kept ? tagName(fl.kept) : 'no category'}. Change it if that's not right.` }); }));
  // contacts at the same business with different categories (skip businesses already being asked about via a category change)
  const pendingBiz = new Set(); D.contacts.forEach((c) => (c.flags || []).forEach((f) => { if (f.type === 'catprop') (f.bids || []).forEach((b) => pendingBiz.add(b)); }));
  const isCat = (t) => IDX.tags.get(t)?.group === 'client';
  D.businesses.forEach((b) => {
    const cs = IDX.bizContacts.get(b.id) || []; if (cs.length < 2 || pendingBiz.has(b.id)) return;
    const ec = new Map(cs.map((c) => [c, catOf(c) ? [catOf(c)] : []])); const diff = [...new Set(cs.flatMap((c) => ec.get(c)))].filter((t) => !cs.every((c) => ec.get(c).includes(t))); if (!diff.length) return;
    const sig = diff.map((t) => t + ':' + cs.filter((c) => ec.get(c).includes(t)).map((c) => c.id).join('.')).join('|'); let hs = 0; for (let i = 0; i < sig.length; i++) hs = (hs * 31 + sig.charCodeAt(i)) | 0;
    add({ type: 'catdiff', key: 'catdiff:' + b.id + ':' + hs.toString(36), kind: 'business', id: b.id, who: b.name,
      note: diff.map((t) => { const has = cs.filter((c) => ec.get(c).includes(t)), not = cs.filter((c) => !ec.get(c).includes(t)); return `${tagName(t)}: ${has.map((c) => c.first).join(', ')} — but not ${not.map((c) => c.first).join(', ')}`; }).join(' • ') + '. Update them so they match?',
      catdiff: { bid: b.id, tags: diff.map((t) => ({ t, has: cs.filter((c) => ec.get(c).includes(t)).length, of: cs.length })) } });
  });
  (D.conflicts || []).forEach((cf) => add({ type: 'conflict', kind: cf.kind === 'businesses' ? 'business' : 'contact', id: cf.key, who: cf.who, note: 'Changed on two devices while offline — differences below. Choose which version to keep:', data: cf }));
  return jobs;
}
const JOB_TYPES = {
  conflict: { t: 'Sync conflicts', manual: false },
  kmcheck: { t: 'Distance more than 1 km different to Google Maps', manual: true },
  kmverify: { t: 'Distance requires verification', manual: false },
  kmconflict: { t: 'Same farm, different km on different contacts', manual: true },
  dupe: { t: 'Possible duplicates', manual: false },
  nearpin: { t: 'Same GPS pin on two farms — same yards or different?', manual: false },
  nogps: { t: 'Farm address with no GPS pin', manual: true },
  signfix: { t: 'GPS pin corrected (missing minus sign) — confirm', manual: true, btn: 'Pin is correct' },
  nokm: { t: 'No distance recorded', manual: true },
  photo: { t: 'Choose which photo to show', manual: false },
  catpick: { t: 'Category changed to one only — check it', manual: true, btn: 'Looks right' },
  catdiff: { t: 'Contacts at the same business have different categories', manual: true, btn: 'Leave as is' },
  catprop: { t: 'Category changed — change the other contacts at the same business too?', manual: true, btn: 'No — only this contact' },
  blockcheck: { t: 'Do not answer — has the number been blocked?', manual: true },
  ezyvet: { t: 'Check client has been inactivated in ezyVet', manual: true, btn: 'Done in ezyVet' },
  newinfo: { t: 'New contact — information missing', manual: true, btn: 'Not needed' },
  noprimary: { t: 'Business has no primary contact', manual: true },
  sheep: { t: 'Sheep only — regular or occasional?', manual: true, btn: 'Confirmed' },
  multirating: { t: 'Specify rating for each business', manual: true },
  ratingconflict: { t: 'Business has conflicting ratings', manual: true },
  noname: { t: 'Business created from a contact name — check', manual: true },
};
let JOBS_CACHE = null;
function jobs() { if (!JOBS_CACHE) JOBS_CACHE = computeJobs(); return JOBS_CACHE; }
function jobsFor(kind, id) { return jobs().filter((j) => j.id === id && (j.kind === kind || (kind === 'contact' && false))); }

/* ---------------- rendering: shell ---------------- */
const TABS = [['contacts', 'Contacts'], ['biz', 'Businesses'], ['search', 'Search'], ['route', 'Plan Route'], ['jobs', 'Jobs'], ['settings', 'Settings']];
function renderTabs() {
  const n = jobs().length;
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button data-act="tab" data-v="${k}" class="${S.tab === k ? 'on' : ''}">${ICONS[k]}<span>${l}${k === 'contacts' ? ` (${D.contacts.length})` : k === 'biz' ? ` (${D.businesses.length})` : ''}</span>${k === 'jobs' && n ? `<span class="badge">${n}</span>` : ''}</button>`).join('');
}
// contacts / businesses that have just become "Do not answer" and have no reason yet
// contacts / businesses that have just become Do not answer / Inactive and have no reason yet
function newWithoutReason(cat, field) {
  const out = [];
  TOUCHED.forEach((r) => {
    const kind = recKind(r); const was = BASE.get(recKeyOf(kind, r)); const old = was ? JSON.parse(was) : null;
    if (kind === 'contacts') {
      if (catOf(r) !== cat || r[field] || bizOf(r).some((b) => b[field] && bizCat(b) === cat)) return;
      const oldCat = old ? ((old.ownCats || !(old.links || []).length) ? (old.tags || []).find((t) => isCatTag(t) || RATING_SET.has(t)) : (old.links || []).map((l) => { const ob = BASE.get('businesses:' + l.bid); return ob ? bizCat(JSON.parse(ob)) : ''; }).find(Boolean)) : '';
      if (oldCat !== cat) out.push(r);
    } else if (kind === 'businesses') {
      if (bizCat(r) === cat && !r[field] && !(old && bizCat(old) === cat)) out.push(r);
    }
  });
  return out;
}
async function changed() {
  JOBS_CACHE = null; reindex();
  if (BASE.size && typeof diffTouched === 'function') {
    for (const [cat, field, title, ph] of [['dna', 'dnaReason', 'Reason for "Do not answer"', "e.g. bad debtor, not the client for us, don't feel safe"], ['inactive', 'inactiveReason', 'Reason for inactivating', 'e.g. inactivated as no longer using our routine services, or client retired and sold farm']]) {
      const need = newWithoutReason(cat, field); if (!need.length) continue;
      const names = need.map((r) => (recKind(r) === 'contacts' ? fullName(r) : r.name));
      const reason = await askBox(title, `<p style="font-size:16px">A reason is required when marking ${h(names.slice(0, 10).join(', '))}${names.length > 10 ? ` and ${names.length - 10} more` : ''} as <b>${cat === 'dna' ? 'Do not answer' : 'Inactive'}</b>. It shows in a red box at the top of their contact.</p><textarea class="warn" style="width:100%;min-height:90px;padding:10px;border-radius:9px;border:1px solid #f3b3b6;font-size:16px" placeholder="${h(ph)}"></textarea>`, 'Save reason');
      if (typeof reason !== 'string' || !reason) { S.advSelPending = false; revertTouched(); NEXT_LOG_LABEL = null; S.skipConfirm = false; JOBS_CACHE = null; reindex(); photoCache.clear(); renderAll(); toast(reason === true ? 'A reason is required — nothing was changed' : 'Cancelled — nothing was changed'); return false; }
      need.forEach((r) => { r[field] = reason; touch(r); });
    }
  }
  if (!S.skipConfirm && BASE.size && !PENDING_DEL.length && typeof diffTouched === 'function') {
    const items = diffTouched(false);
    if (items.length) {
      const ok = await askBox(NEXT_LOG_LABEL ? 'Confirm: ' + NEXT_LOG_LABEL.replace(/^Jobs: |^Search: /, '') : 'Confirm changes', previewHtml(items), 'Yes — save these changes');
      if (!ok) { S.advSelPending = false; revertTouched(); NEXT_LOG_LABEL = null; JOBS_CACHE = null; reindex(); photoCache.clear(); renderAll(); toast('Cancelled — nothing was changed'); return false; }
    }
  }
  S.skipConfirm = false; if (S.advSelPending) { S.advSel.clear(); S.advSelPending = false; } logChanges(NEXT_LOG_LABEL); NEXT_LOG_LABEL = null; DISMISS_SNAP = JSON.stringify(D.dismissed || {}); save(); renderAll(); return true;
}
/* ---------------- confirm pop-up (replaces the browser's confirm box; phone Back = cancel) ---------------- */
let CONFIRM = null;
function askBox(title, html, okLabel = 'Yes — go ahead', danger = false) {
  return new Promise((res) => {
    const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'askbox'; bg.style.zIndex = 80;
    bg.innerHTML = `<div class="sheet" style="max-width:620px"><div class="sheet-h"><button class="btn" data-act="ask-no">‹ Back</button><h2>${h(title)}</h2></div><div class="form">${html}
      <div class="actions" style="margin-top:16px"><button class="btn ${danger ? 'red' : 'primary'}" data-act="ask-yes" style="font-size:17px;padding:11px 16px">${h(okLabel)}</button><button class="btn" data-act="ask-no">Cancel — don't change anything</button></div></div></div>`;
    document.body.appendChild(bg); CONFIRM = { res }; try { history.pushState({ ask: 1 }, ''); } catch (e) { } updateBackBtn();
  });
}
function closeAsk(v, fromPop) { if (!CONFIRM) return; const r = CONFIRM.res; CONFIRM = null; const el = $('#askbox'); const ta = el && el.querySelector('textarea'); if (v && ta) v = ta.value.trim() || true; if (el) el.remove(); if (!fromPop) { NAV.ignorePop++; history.back(); } updateBackBtn(); r(v); }
document.addEventListener('click', (e) => { const el = e.target.closest('[data-act=ask-yes],[data-act=ask-no]'); if (!el) return; e.stopPropagation(); closeAsk(el.dataset.act === 'ask-yes'); }, true);
const askText = (t) => `<p style="font-size:16px;line-height:1.45;white-space:pre-wrap">${h(t)}</p>`;
async function ask(msg, okLabel, danger) { const ok = await askBox('Please confirm', askText(msg), okLabel || 'Yes — go ahead', danger); if (ok) { S.skipConfirm = true; setTimeout(() => (S.skipConfirm = false), 0); } return ok; } // already confirmed → no second pop-up
function updateBackBtn() { const b = $('#hdr-back'); if (b) b.style.display = CONFIRM || SHEET || (NAV.stack && NAV.stack.length) ? '' : 'none'; }

/* ---------------- back navigation (in-app Back button + phone/browser back) ---------------- */
const NAV = { last: null, stack: [], restoring: false, ignorePop: 0 };
const navKey = () => S.tab + '|' + (S.sel ? S.sel.kind + ':' + S.sel.id : '');
function navRecord() {
  const k = navKey();
  if (NAV.last && k !== NAV.last.key && !NAV.restoring) {
    NAV.stack.push(NAV.last); if (NAV.stack.length > 60) NAV.stack.shift();
    try { history.pushState({ bvt: NAV.stack.length }, ''); } catch (e) { }
  }
  if (!NAV.last || k !== NAV.last.key) NAV.last = { key: k, tab: S.tab, sel: S.sel ? { ...S.sel } : null, scroll: 0, dscroll: 0 };
}
function navBack() {
  if (CONFIRM) { closeAsk(false); return; }
  if (SHEET) { closeSheet(); return; }
  if (NAV.stack.length) { history.back(); return; } // popstate does the work
  S.sel = null; document.body.classList.remove('show-detail'); renderAll();
}
function navRestore() {
  const prev = NAV.stack.pop(); if (!prev) { if (S.sel) { S.sel = null; renderAll(); } return; }
  NAV.restoring = true; S.tab = prev.tab; S.sel = prev.sel; S.backTo = null; renderAll(); NAV.restoring = false;
  NAV.last = prev; requestAnimationFrame(() => { $('#list').scrollTop = prev.scroll || 0; $('#detail').scrollTop = prev.dscroll || 0; });
}
function renderAll() {
  navRecord(); updateBackBtn();
  renderTabs();
  const main = $('#main');
  main.classList.toggle('single', ['search', 'route', 'jobs', 'settings'].includes(S.tab));
  if (S.tab === 'contacts') { renderContactList(); renderDetail(); }
  else if (S.tab === 'biz') { renderBizList(); renderDetail(); }
  else if (S.tab === 'search') { $('#list').innerHTML = renderAdvanced(); document.body.classList.remove('show-detail'); }
  else if (S.tab === 'route') { $('#list').innerHTML = renderRoute(); document.body.classList.remove('show-detail'); }
  else if (S.tab === 'jobs') { $('#list').innerHTML = renderJobs(); document.body.classList.remove('show-detail'); }
  else if (S.tab === 'settings') { $('#list').innerHTML = renderSettings(); document.body.classList.remove('show-detail'); }
  renderSyncPill();
}

/* ---------------- contacts list ---------------- */
function sortContacts(arr) {
  const nm = (c) => (S.sort === 'last' ? (c.last || c.first) + ' ' + c.first : c.first + ' ' + c.last).toLowerCase();
  const groupOf = (c) => {
    if (S.sort === 'business') return bizOf(c)[0]?.name || '(no business)';
    if (S.sort === 'rating') { const r = distinctRatings(c); return r.length ? r.map((x) => tagName(x)).sort().join(' + ') : 'No rating'; }
    if (S.sort === 'tag') { const t = effTags(c).filter((x) => !RATING_SET.has(x)); return t.length ? tagName(t.slice().sort((a, b) => tagName(a).localeCompare(tagName(b)))[0]) : 'No tags'; }
    return null;
  };
  const rOrder = (g) => { const i = ['A+ client', 'A client', 'B client', 'C client'].findIndex((x) => g.startsWith(x)); return i < 0 ? 9 : i; };
  return arr.map((c) => ({ c, g: groupOf(c), n: nm(c) })).sort((x, y) => {
    if (x.c.starred !== y.c.starred) return x.c.starred ? -1 : 1;
    if (x.g !== y.g) { if (S.sort === 'rating') { const d = rOrder(x.g) - rOrder(y.g); if (d) return d; } return alphaCmp(x.g || '', y.g || ''); }
    return alphaCmp(x.n, y.n);
  });
}
function tagChips() {
  const quick = [['starred', '★ Starred'], ['warn', 'Has warnings'], ['multi', 'Multiple ratings'], ['split', 'Split photo'], ['flagged', 'Needs attention']];
  const tags = D.tags.filter((t) => t.id !== 'sheep' || D.contacts.some((c) => c.tags.includes('sheep')));
  return quick.map(([k, l]) => `<button class="chip quick ${S.quick[k] ? 'inc' : ''}" data-act="quick" data-v="${k}">${l}</button>`).join('') +
    tags.map((t) => `<button class="chip ${S.tagF[t.id] || ''}" data-act="tagf" data-v="${t.id}" title="Tap: include · tap again: exclude · again: off">${h(t.name)}</button>`).join('');
}
function renderContactList() {
  const list = $('#list');
  if (!D.contacts.length && (D.firstRun || !D.sync.fileId)) { list.innerHTML = firstRunHtml(); return; }
  const keepFocus = document.activeElement && document.activeElement.id === 'q';
  const rows = sortContacts(filteredContacts());
  let html = `<div class="toolbar"><div class="search"><input id="q" type="search" placeholder="Search — use -word to exclude" value="${h(S.q)}" autocomplete="off"><button class="btn" data-act="go-adv" title="Advanced search">Advanced</button><button class="btn primary" data-act="new-contact">+ New</button></div>
    <div class="chips">${tagChips()}</div>
    <div class="row2"><span>${rows.length} of ${D.contacts.length} contacts${Object.keys(S.tagF).length || Object.values(S.quick).some(Boolean) || S.q ? ' · <a href="#" data-act="clear">clear</a>' : ''}</span>
    <label>Sort <select data-act="sort">${[['first', 'First name'], ['last', 'Surname'], ['business', 'Business'], ['rating', 'Rating'], ['tag', 'Tag']].map(([v, l]) => `<option value="${v}" ${S.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div></div>`;
  html += '<ul class="list">';
  let lastG = null, shown = 0; let starredHdr = false;
  for (const { c, g } of rows) {
    if (shown > 400) { html += `<li class="empty">Showing first 400 — refine your search to see more.</li>`; break; }
    if (c.starred && !starredHdr) { html += `<li class="group-h">★ Starred</li>`; starredHdr = true; }
    if (!c.starred && g !== null && g !== lastG) { html += `<li class="group-h">${h(g)}</li>`; lastG = g; }
    if (!c.starred && g === null && starredHdr && lastG !== '__all') { html += `<li class="group-h">All contacts</li>`; lastG = '__all'; }
    const bs = bizOf(c); const rs = distinctRatings(c);
    const sub = [rs.map(rbadge).join(''), h(bs.map((b) => b.name).join(', ') || c.role || (c.mobiles[0] || c.landlines[0] || {}).value || '')].join('');
    html += `<li class="item ${S.sel?.id === c.id ? 'sel' : ''}" data-act="open" data-kind="contact" data-id="${c.id}">${contactPhotoImg(c)}<div class="t"><div class="n">${c.starred ? '<span class="star">★</span> ' : ''}${h(fullName(c))}</div><div class="s">${sub}</div></div>${hasWarning(c) ? '<span class="wdot" title="Has warnings"></span>' : ''}</li>`;
    shown++;
  }
  if (!rows.length) html += `<li class="empty">No contacts match.</li>`;
  html += '</ul>';
  list.innerHTML = html;
  if (keepFocus) { const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}

/* ---------------- business list ---------------- */
function bizHay(b) {
  if (IDX.bhay.has(b.id)) return IDX.bhay.get(b.id);
  const parts = [b.name, b.info, b.warnings, b.sideNotes, b.rating ? tagName(b.rating) : ''];
  b.pics.forEach((p) => parts.push(p.value)); b.patientIds.forEach((p) => parts.push(p.label, p.value)); b.farms.forEach((f) => parts.push(f.name, f.address, f.info));
  (IDX.bizContacts.get(b.id) || []).forEach((c) => parts.push(fullName(c)));
  const s = parts.filter(Boolean).join(' \u0001 ').toLowerCase(); IDX.bhay.set(b.id, s); return s;
}
function renderBizList() {
  const keepFocus = document.activeElement && document.activeElement.id === 'bq';
  const pq = parseQuery(S.bq);
  const bt = S.btype || 'all';
  let rows = D.businesses.filter((b) => matchQ(bizHay(b), pq) && (bt === 'all' || (bt === 'client') === isClientBiz(b)));
  rows.sort((a, b) => (S.bsort === 'rating' ? (RATINGS.indexOf(a.rating) + 10) % 14 - (RATINGS.indexOf(b.rating) + 10) % 14 : 0) || alphaCmp(a.name, b.name));
  let html = `<div class="toolbar"><div class="search"><input id="bq" type="search" placeholder="Search businesses, farms, PICs…" value="${h(S.bq)}" autocomplete="off"><button class="btn primary" data-act="new-biz">+ New</button></div>
  <div class="seg" style="margin-top:8px">${[['all', 'All'], ['client', 'Client businesses'], ['nonclient', 'Non-client (industry)']].map(([v, l]) => `<button class="${(S.btype || 'all') === v ? 'on' : ''}" data-act="btype" data-v="${v}">${l} (${D.businesses.filter((b) => v === 'all' || (v === 'client') === isClientBiz(b)).length})</button>`).join('')}</div>
  <div class="row2"><span>${rows.length} businesses</span><label>Sort <select data-act="bsort"><option value="name">Name</option><option value="rating" ${S.bsort === 'rating' ? 'selected' : ''}>Rating</option></select></label></div></div><ul class="list">`;
  rows.slice(0, 400).forEach((b) => {
    const cs = IDX.bizContacts.get(b.id) || [];
    const flagged = jobs().some((j) => j.kind === 'business' && j.id === b.id);
    html += `<li class="item ${S.sel?.id === b.id ? 'sel' : ''}" data-act="open" data-kind="business" data-id="${b.id}"><div class="t"><div class="n">${b.rating ? rbadge(b.rating) : ''}${h(b.name)}</div><div class="s">${isClientBiz(b) ? '' : '<b>Industry</b> · '}${cs.length} contact${cs.length === 1 ? '' : 's'} · ${b.farms.length} ${isClientBiz(b) ? 'farm' + (b.farms.length === 1 ? '' : 's') : 'location' + (b.farms.length === 1 ? '' : 's')}${cs.length ? ' · ' + h(cs.map((c) => c.first).join(', ')) : ''}</div></div>${flagged ? `<span style="color:var(--red)" title="Needs attention">${ICONS.flag}</span>` : ''}${b.warnings ? '<span class="wdot"></span>' : ''}</li>`;
  });
  if (!rows.length) html += `<li class="empty">No businesses match.</li>`;
  $('#list').innerHTML = html + '</ul>';
  if (keepFocus) { const q = $('#bq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}

/* ---------------- detail views ---------------- */
function renderDetail() {
  const el = $('#detail');
  el.classList.remove('dna');
  if (!S.sel) { el.innerHTML = `<div class="empty" style="padding-top:80px">Select a ${S.tab === 'biz' ? 'business' : 'contact'} to see details.</div>`; document.body.classList.remove('show-detail'); return; }
  if (S.sel.kind === 'contact') { const c = D.contacts.find((x) => x.id === S.sel.id); if (!c) { S.sel = null; return renderDetail(); } el.classList.toggle('dna', effTags(c).includes('dna')); el.innerHTML = contactDetail(c); }
  else { const b = IDX.biz.get(S.sel.id); if (!b) { S.sel = null; return renderDetail(); } el.classList.toggle('dna', (b.cats || []).includes('dna')); el.innerHTML = bizDetail(b); }
  document.body.classList.add('show-detail');
}
function phoneLinks(list, sms) {
  return list.map((p) => `<div class="kv"><div class="k">${h(p.label || '')}</div><div class="v"><a href="tel:${h(p.value.replace(/[^\d+]/g, ''))}">${h(p.value)}</a> · <a href="tel:${h(p.value.replace(/[^\d+]/g, ''))}">call client</a>${sms ? ` · <a href="sms:${h(p.value.replace(/[^\d+]/g, ''))}">send SMS</a>` : ''}</div></div>`).join('');
}
function flagLines(kind, id, fid) {
  return jobs().filter((j) => j.kind === kind && j.id === id && (fid === undefined || j.fid === fid)).map((j) => `<div class="flagline"><span style="color:var(--red)">${ICONS.flag}</span><div>${h(j.note)}</div></div>`).join('');
}
const inactiveBox = (r) => `<div class="inactivebox"><div style="font-family:var(--cond);font-size:20px;letter-spacing:.4px">INACTIVE CLIENT</div>${r ? `<div class="body" style="margin-top:2px">${h(r)}</div>` : '<div style="opacity:.9;font-size:14px">No reason recorded yet — tap Edit to add one.</div>'}</div>`;
const dnaReasonBox = (r) => `<div class="dnareason"><div class="lbl" style="color:var(--red-ink)">Reason</div>${r ? `<div class="body">${h(r)}</div>` : '<div class="hint">No reason recorded yet — tap Edit to add one (e.g. bad debtor, not the client for us, don\'t feel safe).</div>'}</div>`;
function contactDetail(c) {
  const bs = bizOf(c);
  const tags = effTags(c).filter((t) => !RATING_SET.has(t));
  const cflags = jobs().filter((j) => j.kind === 'contact' && j.id === c.id);
  const dna = effTags(c).includes('dna');
  let html = `<div class="d-wrap"><button class="back" data-act="back">‹ Back</button>
  ${catOf(c) === 'inactive' ? inactiveBox(c.inactiveReason || bizOf(c).filter((b) => bizCat(b) === 'inactive').map((b) => b.inactiveReason).filter(Boolean).join('\n')) : ''}
  ${dna ? `<div class="dnabanner">⛔ DO NOT ANSWER — NO FUTURE SERVICE</div>${dnaReasonBox(c.dnaReason || bizOf(c).map((b) => b.dnaReason).filter(Boolean).join('\n'))}` : ''}
  <div class="hero">${contactPhotoImg(c, '', 320)}<div><h2>${h(fullName(c))}</h2><div class="sub">${h(c.role || '')}${c.role && bs.length ? ' · ' : ''}${h(bs.map((b) => b.name).join(', '))}</div>
  <div style="margin-top:6px">${contactRatings(c).map((r) => rbadge(r.rating) + (r.biz && bs.length > 1 ? `<span style="font-size:13px;color:var(--ink3);margin-right:8px">${h(r.biz.name)}</span>` : '')).join('')}</div></div></div>
  <div class="actions"><button class="btn primary" data-act="edit-contact" data-id="${c.id}">Edit</button><button class="btn" data-act="star" data-id="${c.id}">${c.starred ? '★ Starred' : '☆ Star'}</button>${c.mobiles[0] ? `<a class="btn" href="tel:${h(c.mobiles[0].value.replace(/[^\d+]/g, ''))}">Call</a>` : ''}</div>`;
  html += cflags.map((j) => `<div class="flagline"><span style="color:var(--red)">${ICONS.flag}</span><div>${h(j.note)}</div></div>`).join('');
  if (hasWarning(c)) {
    html += `<div class="card warn"><h3>⚠ General warnings</h3>${c.warnings ? `<div class="body">${h(c.warnings)}</div>` : ''}${bs.filter((b) => b.warnings).map((b) => `<div class="body" style="margin-top:6px"><b>${h(b.name)}:</b> ${h(b.warnings)}</div>`).join('')}</div>`;
  }
  if ((c.sideNotes || '').trim() || bs.some((b) => (b.sideNotes || '').trim())) {
    html += `<div class="card side"><h3>📝 Side notes</h3>${c.sideNotes ? `<div class="body">${h(c.sideNotes)}</div>` : ''}${bs.filter((b) => b.sideNotes).map((b) => `<div class="body" style="margin-top:6px"><b>${h(b.name)}:</b> ${h(b.sideNotes)}</div>`).join('')}</div>`;
  }
  html += `<div class="card"><h3>Contact</h3>${phoneLinks(c.mobiles.map((p) => ({ ...p, label: p.label || 'Mobile' })), true)}${phoneLinks(c.landlines.map((p) => ({ ...p, label: p.label || 'Landline' })))}${c.emails.map((e) => `<div class="kv"><div class="k">${h(e.label || 'Email')}</div><div class="v"><a href="mailto:${h(e.value)}">${h(e.value)}</a></div></div>`).join('')}${c.postal.map((p) => `<div class="kv"><div class="k">Postal</div><div class="v">${h(p)}</div></div>`).join('')}${!c.mobiles.length && !c.landlines.length && !c.emails.length && !c.postal.length ? '<div class="hint">No contact details yet.</div>' : ''}</div>`;
  if (tags.length) html += `<div class="card"><h3>Categories and tags</h3><div class="tagrow">${tags.map(tagPill).join('')}</div>${followsBiz(c) && effCats(c).length ? '<div class="hint" style="margin-top:6px">Categories follow the business</div>' : c.ownCats && bs.length ? '<div class="hint" style="margin-top:6px">This contact has its own categories (different to the business)</div>' : ''}</div>`;
  html += `<div class="card"><h3>General info</h3>${infoView(c)}</div>`;
  bs.forEach((b) => {
    html += `<div class="card"><h3>${b.rating ? rbadge(b.rating) : ''}<span class="sp">${h(b.name)}${isClientBiz(b) ? '' : ' <span class="hint">(industry)</span>'}</span><button class="btn small" data-act="open" data-kind="business" data-id="${b.id}">Open business</button></h3>`;
    if (b.pics.length && isClientBiz(b)) html += `<div class="kv"><div class="k">PIC</div><div class="v">${b.pics.map((p) => h(p.value) + (p.label ? ` <span class="hint">${h(p.label)}</span>` : '')).join('<br>')}</div></div>`;
    if (b.patientIds.length && isClientBiz(b)) html += `<div class="kv"><div class="k">Patient IDs</div><div class="v">${b.patientIds.map((p) => `${h(p.value)} <span class="hint">${h(p.label)}</span>`).join('<br>')}</div></div>`;
    html += b.farms.map((f) => farmCard(b, f, false)).join('');
    html += '</div>';
  });
  return html + '</div>';
}
function tagPill(t) { const src = tagPhotoSrc(t); return `<span class="tag ${src ? '' : 'noimg'}">${src ? `<img src="${src}" alt="">` : ''}${h(tagName(t))}</span>`; }
function farmCard(b, f, withFlags = true) {
  const verify = f.kmStatus === 'needs-verify';
  return `<div class="farm ${f.seeWarning ? 'red' : ''}"><div class="fn">${f.seeWarning ? '⚠ ' : ''}${h(f.name || locWord(b))}</div>
  ${f.address ? `<div>${h(f.address)}</div>` : ''}
  ${f.sharedWith && IDX.farmBiz.get(f.sharedWith) ? `<div class="hint">Same yards also used by ${h(IDX.farmBiz.get(f.sharedWith).name)}</div>` : ''}
  <div class="meta">${f.lat != null ? `<a href="${gmapsPin(f)}" target="_blank" rel="noopener">📍 ${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}</a>` : '<span>No GPS pin</span>'}
  <span>${verify ? '<span class="verify">Distance requires verification</span> ' : ''}${fmtKm(f)}</span>${f.driveMin != null ? `<span>🚗 ${fmtMin(f.driveMin)} each way</span>` : ''}</div>
  ${f.seeWarning ? `<div class="body" style="margin-top:4px;font-weight:700">⚠ Farm warnings: ${h(f.warning || 'check farm info')}</div>` : ''}
  ${f.info ? `<div class="body" style="margin-top:4px;font-size:14.5px">${h(f.info)}</div>` : ''}
  ${withFlags ? flagLines('business', b.id, f.id) : ''}
  <div class="actions" style="margin:8px 0 0">${f.lat != null ? `<button class="btn small" data-act="route-add" data-fid="${f.id}">+ Route</button>` : ''}<button class="btn small" data-act="edit-farm" data-bid="${b.id}" data-fid="${f.id}">Edit ${locWord(b).toLowerCase()}</button></div></div>`;
}
function bizDetail(b) {
  const cs = IDX.bizContacts.get(b.id) || [];
  let html = `<div class="d-wrap"><button class="back" data-act="back">‹ Back</button>
  <div class="hero" style="display:block"><h2>${b.rating ? rbadge(b.rating) : ''}${h(b.name)}</h2><div class="sub">${isClientBiz(b) ? 'Client business' : 'Non-client business (industry)'} · ${cs.length} contact${cs.length === 1 ? '' : 's'} · ${b.farms.length} ${locWord(b, b.farms.length !== 1).toLowerCase()}</div></div>
  <div class="actions"><button class="btn primary" data-act="edit-biz" data-id="${b.id}">Edit</button><button class="btn" data-act="add-farm" data-bid="${b.id}">+ ${locWord(b)}</button>${b.farms.some((f) => f.lat != null) ? `<button class="btn" data-act="route-add-biz" data-bid="${b.id}">+ All farms to route</button>` : ''}</div>`;
  html += flagLines('business', b.id).replace(/<div class="flagline">/g, '<div class="flagline">');
  if (bizCat(b) === 'inactive') html += inactiveBox(b.inactiveReason);
  if ((b.cats || []).includes('dna')) html += `<div class="dnabanner">⛔ DO NOT ANSWER — NO FUTURE SERVICE</div>${dnaReasonBox(b.dnaReason)}`;
  if (b.warnings) html += `<div class="card warn"><h3>⚠ General warnings</h3><div class="body">${h(b.warnings)}</div></div>`;
  if (b.sideNotes) html += `<div class="card side"><h3>📝 Side notes</h3><div class="body">${h(b.sideNotes)}</div></div>`;
  html += `<div class="card"><h3><span class="sp">Contact category</span><button class="btn small" data-act="cat-edit" data-bid="${b.id}">Change…</button></h3>${b.rating || (b.cats || []).length ? `<div class="tagrow">${[...(b.rating ? [b.rating] : []), ...(b.cats || [])].map(tagPill).join('')}</div>` : '<div class="hint">None set.</div>'}${cs.filter((c) => c.ownCats || ownRating(c)).length ? `<div class="hint" style="margin-top:6px">Own categories: ${h(cs.filter((c) => c.ownCats || ownRating(c)).map((c) => c.first).join(', '))}</div>` : ''}</div>`;
  html += `<div class="card"><h3>Contacts</h3>${cs.map((c) => `<div style="display:flex;align-items:center"><div style="flex:1" class="biz-link" data-act="open" data-kind="contact" data-id="${c.id}">${contactPhotoImg(c, 'av', 120)}<div><div style="font-weight:600">${h(fullName(c))}${primaryOf(b)?.id === c.id ? ' <span class="rb" style="background:var(--ink)">PRIMARY</span>' : ''}</div><div class="hint">${h(c.role || '')} ${h((c.mobiles[0] || c.landlines[0] || {}).value || '')}</div></div></div><button class="btn small" data-act="biz-unlink" data-cid="${c.id}" data-bid="${b.id}" title="Unlink from this business">Unlink</button></div>`).join('') || '<div class="hint">No contacts linked.</div>'}
  <input id="biz-linksearch" data-bid="${b.id}" placeholder="+ Link a contact — search by name or phone" style="margin-top:8px;width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:9px"><div id="biz-linkres"></div>
  <div class="hint" style="margin-top:4px">${b.primaryRequired === false ? 'Primary contact not required (non-client business).' : ''}</div></div>`;
  if (isClientBiz(b)) html += `<div class="card"><h3>Property Identification Code (PIC)</h3>${b.pics.map((p) => `<div class="kv"><div class="k">${h(p.label || 'PIC')}</div><div class="v">${h(p.value)}</div></div>`).join('') || '<div class="hint">None recorded.</div>'}</div>`;
  if (isClientBiz(b)) html += `<div class="card"><h3>Patient IDs</h3>${b.patientIds.map((p) => `<div class="kv"><div class="k">${h(p.label || 'ID')}</div><div class="v">${h(p.value)}</div></div>`).join('') || '<div class="hint">None recorded.</div>'}</div>`;
  html += `<div class="card"><h3>${locWord(b, true)}</h3>${b.farms.map((f) => farmCard(b, f)).join('') || `<div class="hint">No ${locWord(b, true).toLowerCase()} yet.</div>`}</div>`;
  html += `<div class="card"><h3>General info</h3>${infoView(b)}</div>`;
  return html + '</div>';
}

/* ---------------- edit sheets ---------------- */
let SHEET = null; // {type, rec, ...}
function openSheet(title, body, onSave, extraBtns = '') {
  closeSheet();
  const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'sheet';
  bg.innerHTML = `<div class="sheet"><div class="sheet-h"><button class="btn" data-act="sheet-cancel">‹ Back</button><h2>${h(title)}</h2>${extraBtns}<button class="btn primary" data-act="sheet-save" id="sheet-save">Save</button></div><div class="form">${body}</div></div>`;
  document.body.appendChild(bg); SHEET = { onSave }; try { history.pushState({ sheet: 1 }, ''); } catch (e) { } updateBackBtn();
  bg.addEventListener('click', (e) => { if (e.target === bg) closeSheet(); });
}
function closeSheet() { const s = $('#sheet'); if (s) s.remove(); if (SHEET && !SHEET.popped) { NAV.ignorePop++; history.back(); } SHEET = null; updateBackBtn(); }
function repRows(name, rows, fields) {
  // fields: [{k, ph, w, opts}]
  const row = (r = {}) => `<div class="rep" data-rep="${name}">${fields.map((f) => f.opts ? `<select data-k="${f.k}" style="flex:${f.w || 1}">${f.opts.map((o) => `<option ${o === (r[f.k] || '') ? 'selected' : ''}>${h(o)}</option>`).join('')}${r[f.k] && !f.opts.includes(r[f.k]) ? `<option selected>${h(r[f.k])}</option>` : ''}</select>` : `<input data-k="${f.k}" placeholder="${h(f.ph || '')}" value="${h(r[f.k] || '')}" style="flex:${f.w || 1}" ${f.list ? `list="${f.list}"` : ''}>`).join('')}<button class="x" type="button" data-act="rep-del" title="Remove">×</button></div>`;
  return `<div data-repwrap="${name}">${rows.map(row).join('')}</div><button class="btn small" type="button" data-act="rep-add" data-rep="${name}">+ Add</button><template data-reptpl="${name}">${row()}</template>`;
}
function readRep(name) {
  return [...document.querySelectorAll(`#sheet [data-rep="${name}"].rep`)].map((r) => { const o = {}; r.querySelectorAll('[data-k]').forEach((i) => (o[i.dataset.k] = i.value.trim())); return o; }).filter((o) => Object.values(o).some((v) => v && v !== '(none)'));
}
const val = (id) => ($('#' + id) ? $('#' + id).value.trim() : '');

// one combined "Contact category" picker: A+ / A / B / C (tick one) and every other category, all as tick boxes
function catPicker(group, current, firstLabel) {
  const opts = [['', firstLabel], ...RATINGS.map((r) => [r, tagName(r)]), ...D.tags.filter((t) => t.group === 'client').map((t) => [t.id, t.name])];
  return `<div class="checks big" data-rtgroup="${group}">${opts.map(([v, l]) => `<label class="${v === '' || RATING_SET.has(v) ? 'rt' : ''}"><input type="checkbox" data-rt="${v}" ${(current || '') === v ? 'checked' : ''}>${h(l)}</label>`).join('')}</div><div class="hint">Tick one — a contact or business can only have one category.</div>`;
}
const rtVal = (scope, group) => { const el = (scope || document).querySelector(`[data-rtgroup="${group}"] [data-rt]:checked`); return el ? el.dataset.rt : ''; };
document.addEventListener('change', (e) => {
  const t = e.target; if (!t.dataset) return;
  if ('rt' in t.dataset) setTimeout(() => { reasonBoxes(); const w = $('#bk-reasonwrap'); if (w) { const v = rtVal($('#sheet'), 'bkc'); w.style.display = v === 'inactive' || v === 'dna' ? '' : 'none'; $('#bk-reasonlbl').textContent = v === 'dna' ? 'Reason for "Do not answer" (required)' : 'Reason for inactivating (required)'; } }, 0);
  if (t.dataset.tag === 'pa' && t.checked) { const o = document.querySelector('#sheet [data-tag="pi"]'); if (o) o.checked = false; }
  if (t.dataset.tag === 'pi' && t.checked) { const o = document.querySelector('#sheet [data-tag="pa"]'); if (o) o.checked = false; }
  if (t.dataset.bktag === 'pa' && t.checked) { const o = document.querySelector('#sheet [data-bktag="pi"]'); if (o) o.checked = false; }
  if (t.dataset.bktag === 'pi' && t.checked) { const o = document.querySelector('#sheet [data-bktag="pa"]'); if (o) o.checked = false; }
});
document.addEventListener('click', (e) => { if (e.target.closest('[data-act=cat-mode]')) setTimeout(reasonBoxes, 0); });
document.addEventListener('change', (e) => { const t = e.target; if (!t.dataset || !('rt' in t.dataset)) return; const g = t.closest('[data-rtgroup]'); g.querySelectorAll('[data-rt]').forEach((i) => (i.checked = i === t)); if (!g.querySelector('[data-rt]:checked')) g.querySelector('[data-rt=""]').checked = true; });
// which category the open contact / business editor will save
function editorCat() {
  if ($('#e-catmode')) { const c = D.contacts.find((x) => S.sel && x.id === S.sel.id) || { links: [] };
    if ($('#e-catmode').value === 'biz' && document.querySelector('#e-links [data-bid]')) { const bids = [...document.querySelectorAll('#e-links [data-bid]')].map((el) => el.dataset.bid); return bids.map((id) => IDX.biz.get(id)).filter(Boolean).map(bizCat).find(Boolean) || ''; }
    return rtVal($('#sheet'), 'ccat'); }
  if ($('[data-rtgroup="bcat"]')) return rtVal($('#sheet'), 'bcat');
  return '';
}
function reasonBoxes() { const v = editorCat(); [['e-dnawrap', 'dna'], ['e-bdnawrap', 'dna'], ['e-inwrap', 'inactive'], ['e-binwrap', 'inactive']].forEach(([id, cat]) => { const el = $('#' + id); if (el) el.style.display = v === cat ? '' : 'none'; }); }
function contactWillBeDna() { return editorCat() === 'dna'; }
function editContact(c) {
  const isNew = !c;
  const wasInactive = !!(c && effTags(c).includes('inactive'));
  const oldCats = c ? effCats(c) : [];
  c = c || { id: uid('c'), first: '', middle: '', last: '', role: '', links: [], tags: [], emails: [], mobiles: [], landlines: [], postal: [], info: '', warnings: '', starred: false, photoChoice: 'auto', flags: [] };

  const { dr, ptags } = photoCandidates(c);
  const photoOpts = [['auto', 'Use default photo automatically assigned to the category' + (needsPhotoChoice(c) ? ' (needs choosing)' : '')], ...[...new Set([...dr, ...effTags(c).filter((t) => tagPhotoSrc(t))])].map((t) => [t, tagName(t)])];
  const cands = [...new Set([...dr, ...ptags])];
  if (cands.length >= 2) photoOpts.push(['split:' + cands.slice(0, 2).join(','), 'Split: ' + cands.slice(0, 2).map(tagName).join(' + ')]);
  if (c.photoChoice && c.photoChoice.startsWith('split:') && !photoOpts.some((o) => o[0] === c.photoChoice)) photoOpts.push([c.photoChoice, 'Split (current)']);
  photoOpts.push(['custom', 'Upload my own photo']);
  const body = `
  <div class="grid2"><div class="f"><label>First name</label><input id="e-first" value="${h(c.first)}"></div><div class="f"><label>Surname</label><input id="e-last" value="${h(c.last)}"></div></div>
  <div class="grid2"><div class="f"><label>Middle / nickname</label><input id="e-middle" value="${h(c.middle)}"></div><div class="f"><label>Role / position</label><input id="e-role" value="${h(c.role)}"></div></div>
  <div class="f"><label>Businesses</label><div id="e-links">${c.links.map((l) => linkRow(l.bid)).join('')}</div>
    <input id="e-bizsearch" placeholder="Search to link a business, or type a new business name"><div id="e-bizres"></div>
</div>
  <div class="card" style="background:#fbfaf7"><h3>Contact category</h3>
    ${c.links.length ? `<div class="seg" style="margin-bottom:8px"><button type="button" class="${followsBiz(c) ? 'on' : ''}" data-act="cat-mode" data-v="biz">Same as business</button><button type="button" class="${followsBiz(c) ? '' : 'on'}" data-act="cat-mode" data-v="own">This contact's own</button></div>` : ''}
    <input type="hidden" id="e-catmode" value="${followsBiz(c) ? 'biz' : 'own'}">
    <div id="e-catbiz" style="${followsBiz(c) ? '' : 'display:none'}"><div class="hint">Follows ${h(bizOf(c).map((b) => b.name).join(', '))}: ${h([...bizOf(c).map((b) => b.rating).filter(Boolean).map(tagName), ...bizCatsOf(c).map(tagName)].join(', ') || 'no categories yet')}. Change them on the business.</div></div>
    <div id="e-catown" style="${followsBiz(c) ? 'display:none' : ''}">
      ${catPicker('ccat', followsBiz(c) ? '' : catOf(c), 'No category')}
    </div></div>
  <div class="f"><span class="lbl">Additional tags</span><div class="checks">${D.tags.filter((t) => t.group === 'additional').map((t) => `<label><input type="checkbox" data-tag="${t.id}" ${c.tags.includes(t.id) ? 'checked' : ''}>${h(t.name)}</label>`).join('')}</div></div>
  <div class="f"><label>Mobile numbers</label>${repRows('mob', c.mobiles, [{ k: 'value', ph: '04xx xxx xxx', w: 3 }, { k: 'label', ph: 'Label', w: 2 }])}</div>
  <div class="f"><label>Landline numbers</label>${repRows('land', c.landlines, [{ k: 'value', ph: '08 xxxx xxxx', w: 3 }, { k: 'label', ph: 'Label', w: 2 }])}</div>
  <div class="f"><label>Email</label>${repRows('email', c.emails, [{ k: 'value', ph: 'name@example.com', w: 3 }, { k: 'label', ph: 'Label', w: 2 }])}</div>
  <div class="f"><label>Postal address</label>${repRows('postal', c.postal.map((p) => ({ value: p })), [{ k: 'value', ph: 'PO Box / street, town, postcode' }])}</div>
  <div class="f"><label>General info</label>${richEditor('e-info', c)}</div>
  <div class="f"><label style="color:var(--red-ink)">General warnings (adds "CHECK WARNING" to the client's photo). If the warning relates to farm or yards, please add to the farm warning section under the relevant business.</label><textarea id="e-warn" class="warn">${h(c.warnings)}</textarea></div>
  <div class="f" id="e-inwrap" style="${catOf(c) === 'inactive' ? '' : 'display:none'}"><label style="color:var(--red-ink)">Inactive — reason (required, shown in a red box at the top)</label><textarea id="e-inreason" class="warn" style="min-height:60px" placeholder="e.g. inactivated as no longer using our routine services, or client retired and sold farm">${h(c.inactiveReason || '')}</textarea></div>
  <div class="f" id="e-dnawrap" style="${effTags(c).includes('dna') ? '' : 'display:none'}"><label style="color:var(--red-ink)">⛔ Do not answer — reason (required, shown under the red banner)</label><textarea id="e-dnareason" class="warn" placeholder="e.g. bad debtor, not the client for us, don't feel safe" style="min-height:60px">${h(c.dnaReason || '')}</textarea></div>
  <div class="f"><label style="color:#7a5a00">Side notes (a general caution but not an urgent warning, e.g. don't mention X as they don't talk)</label><textarea id="e-side" class="sidenote">${h(c.sideNotes || '')}</textarea></div>
  <div class="f"><label>Photo</label><select id="e-photo">${photoOpts.map(([v, l]) => `<option value="${h(v)}" ${(c.photoChoice || 'auto') === v ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>
    <input type="file" id="e-photofile" accept="image/*" style="margin-top:6px;${c.photoChoice === 'custom' ? '' : 'display:none'}"><div class="hint">Photos come from the tags automatically. If a contact has two businesses with different ratings, the photo is split and labelled with each business.</div></div>
  <div class="f"><label><input type="checkbox" id="e-star" ${c.starred ? 'checked' : ''}> Starred (show at top of list)</label></div>
  ${isNew ? '' : `<div class="f"><button class="btn" data-act="del-contact" data-id="${c.id}" style="color:var(--red)">Delete contact</button></div>`}`;
  openSheet(isNew ? 'New contact' : 'Edit contact', body, async () => {
    const first = val('e-first'), last = val('e-last');
    if (!first && !last) { toast('Enter a name'); return false; }
    if (editorCat() === 'inactive' && !$('#e-inreason').value.trim() && !bizOf(c).some((b) => b.inactiveReason && bizCat(b) === 'inactive')) { toast('Please add the reason for inactivating'); $('#e-inwrap').style.display = ''; $('#e-inreason').focus(); return false; }
    if (contactWillBeDna(c) && !$('#e-dnareason').value.trim() && !bizOf(c).some((b) => b.dnaReason && (b.cats || []).includes('dna'))) { toast('Please add the reason for "Do not answer"'); $('#e-dnawrap').style.display = ''; $('#e-dnareason').focus(); return false; }
    Object.assign(c, { first, last, middle: val('e-middle'), role: val('e-role'), ...readRich('e-info'), warnings: $('#e-warn').value.trim(), sideNotes: $('#e-side').value.trim(), dnaReason: $('#e-dnareason').value.trim(), inactiveReason: $('#e-inreason').value.trim(), starred: $('#e-star').checked });
    c.links = [...document.querySelectorAll('#e-links [data-bid]')].map((el) => ({ bid: el.dataset.bid }));
    const newBiz = [...document.querySelectorAll('#e-links [data-newbiz]')];
    newBiz.forEach((el) => { const b = newBusiness(el.dataset.newbiz); c.links.push({ bid: b.id }); });
    const addl = [...document.querySelectorAll('#sheet [data-tag]')].filter((i) => i.checked).map((i) => i.dataset.tag);
    const mode = c.links.length ? $('#e-catmode').value : 'own';
    if (addl.includes('pa') && addl.includes('pi')) { toast('Choose Primary (active) or Primary (inactive) — not both'); return false; }
    const rv = mode === 'own' ? rtVal($('#sheet'), 'ccat') : '';
    c.tags = [...addl];
    if (mode === 'biz') c.ownCats = false; else { c.ownCats = true; if (rv) c.tags.push(rv); if (c.links.length && rv && rv === c.links.map((l) => IDX.biz.get(l.bid)).filter(Boolean).map(bizCat).find(Boolean)) { c.ownCats = false; c.tags = c.tags.filter((t) => t !== rv); } }
    c.mobiles = readRep('mob'); c.landlines = readRep('land'); c.emails = readRep('email'); c.postal = readRep('postal').map((p) => p.value);
    c.photoChoice = $('#e-photo').value;
    const file = $('#e-photofile').files[0];
    if (c.photoChoice === 'custom' && file) c.photoData = await fileToDataUrl(file, 480);
    if (c.photoChoice === 'custom' && !c.photoData) c.photoChoice = 'auto';
    c.flags = (c.flags || []).filter((f) => f.type !== 'multirating' || c.links.length > 1);
    reindex();
    if (!wasInactive && effTags(c).includes('inactive')) c.flags.push({ type: 'ezyvet', at: Date.now() });
    const newCats = effCats(c);
    const added = newCats.filter((t) => !oldCats.includes(t)), removed = oldCats.filter((t) => !newCats.includes(t));
    if (!isNew && c.ownCats && (added.length || removed.length) && c.links.length) c.flags.push({ type: 'catprop', at: Date.now(), added, removed, bids: c.links.map((l) => l.bid) });
    if (added.includes('dna') && !c.tags.includes('blockedc')) c.flags.push({ type: 'blockcheck', at: Date.now() });
    if (isNew) c.createdAt = Date.now();
    touch(c);
    if (isNew) D.contacts.push(c);
    S.sel = { kind: 'contact', id: c.id };
    return true;
  });
  $('#e-photo').addEventListener('change', (e) => { $('#e-photofile').style.display = e.target.value === 'custom' ? '' : 'none'; });
  const bs = $('#e-bizsearch');
  bs.addEventListener('input', () => {
    const q = bs.value.trim().toLowerCase(); const out = $('#e-bizres');
    if (!q) { out.innerHTML = ''; return; }
    const m = D.businesses.filter((b) => b.name.toLowerCase().includes(q)).slice(0, 8);
    out.innerHTML = `<div class="results">${m.map((b) => `<div data-act="link-biz" data-bid="${b.id}">${b.rating ? rbadge(b.rating) : ''}${h(b.name)}</div>`).join('')}<div data-act="link-newbiz" data-name="${h(bs.value.trim())}">+ Create new business “${h(bs.value.trim())}”</div></div>`;
  });
}
function linkRow(bid, newName) {
  const b = bid ? IDX.biz.get(bid) : null;
  return `<div class="rep" ${bid ? `data-bid="${bid}"` : `data-newbiz="${h(newName)}"`}><div style="flex:1;padding:9px 10px;background:#fff;border:1px solid var(--line);border-radius:9px">${b ? (b.rating ? rbadge(b.rating) : '') + h(b.name) : h(newName) + ' <span class="hint">(new)</span>'}</div><button class="x" type="button" data-act="rep-del">×</button></div>`;
}
function newBusiness(name) {
  const b = { id: uid('b'), name, farms: [], pics: [], patientIds: [], info: '', warnings: '', flags: [], rating: null };
  touch(b); D.businesses.push(b); IDX.biz.set(b.id, b); return b;
}
function fileToDataUrl(file, max) {
  return new Promise((res) => { const r = new FileReader(); r.onload = async () => { const im = await loadImg(r.result); if (!im) return res(r.result); const s = Math.min(1, max / Math.max(im.width, im.height)); const cv = document.createElement('canvas'); cv.width = im.width * s; cv.height = im.height * s; cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/png')); }; r.readAsDataURL(file); });
}
const PID_LABELS = ['Cattle Herd ID', 'Sheep Flock ID'];
function editBiz(b) {
  const isNew = !b;
  b = b || { id: uid('b'), name: '', farms: [], pics: [], patientIds: [], info: '', warnings: '', flags: [], rating: null };
  const body = `<div class="f"><label>Business name</label><input id="e-bname" value="${h(b.name)}"></div>
  <div class="f"><label>Business type</label><select id="e-btype"><option value="client">Client business</option><option value="nonclient" ${isClientBiz(b) ? '' : 'selected'}>Non-client business (industry)</option></select><div class="hint">Non-client businesses don't need a PIC, patient IDs, A+ to C category or farms — they have business locations instead.</div></div>
  <div class="f"><label>Primary contact required?</label><select id="e-bpreq"><option value="yes">Yes</option><option value="no" ${b.primaryRequired === false ? 'selected' : ''}>Not required</option></select></div>
  ${(IDX.bizContacts.get(b.id) || []).length ? `<div class="f"><label>Primary contact</label><select id="e-bprimary"><option value="">— choose —</option>${(IDX.bizContacts.get(b.id) || []).map((c) => `<option value="${c.id}" ${primaryOf(b)?.id === c.id ? 'selected' : ''}>${h(fullName(c))}</option>`).join('')}</select></div>` : ''}
  <div class="f"><span class="lbl">Contact category</span>${catPicker('bcat', bizCat(b), 'No category')}<div class="hint">Contacts set to "Same as business" follow these. Contacts with their own categories keep theirs.</div></div>
  <div class="f client-only"><label>Property Identification Code (PIC)</label>${repRows('pic', b.pics, [{ k: 'value', ph: 'e.g. WFAY2784', w: 2 }, { k: 'label', ph: 'Label (optional, e.g. farm or entity)', w: 3 }])}</div>
  <div class="f client-only"><label>Patient IDs</label>${repRows('pid', b.patientIds, [{ k: 'value', ph: 'e.g. 100154', w: 2 }, { k: 'label', ph: 'Cattle Herd ID / Sheep Flock ID / (entity) …', w: 3, list: 'pidlabels' }])}<datalist id="pidlabels">${[...new Set([...PID_LABELS, ...D.businesses.flatMap((x) => x.patientIds.map((p) => p.label))])].map((l) => `<option value="${h(l)}">`).join('')}</datalist></div>
  <div class="f"><label>General info</label>${richEditor('e-binfo', b)}</div>
  <div class="f"><label style="color:var(--red-ink)">General warnings (red — shown on every linked contact). Farm warnings go on the farm.</label><textarea id="e-bwarn" class="warn">${h(b.warnings)}</textarea></div>
  <div class="f" id="e-binwrap" style="${bizCat(b) === 'inactive' ? '' : 'display:none'}"><label style="color:var(--red-ink)">Inactive — reason (required, shown in a red box at the top)</label><textarea id="e-binreason" class="warn" style="min-height:60px" placeholder="e.g. client retired and sold farm">${h(b.inactiveReason || '')}</textarea></div>
  <div class="f" id="e-bdnawrap" style="${(b.cats || []).includes('dna') ? '' : 'display:none'}"><label style="color:var(--red-ink)">⛔ Do not answer — reason (required, shown under the red banner)</label><textarea id="e-bdnareason" class="warn" style="min-height:60px">${h(b.dnaReason || '')}</textarea></div>
  <div class="f"><label style="color:#7a5a00">Side notes (yellow — shown on every linked contact)</label><textarea id="e-bside" class="sidenote">${h(b.sideNotes || '')}</textarea></div>
  <div class="hint">Farms are added and edited from the business page.</div>
  ${isNew ? '' : `<div class="f" style="margin-top:12px"><button class="btn" data-act="del-biz" data-id="${b.id}" style="color:var(--red)">Delete business</button></div>`}`;
  openSheet(isNew ? 'New business' : 'Edit business', body, () => {
    const name = val('e-bname'); if (!name) { toast('Enter a business name'); return false; }
    const pick = rtVal($('#sheet'), 'bcat'); const newRating = RATING_SET.has(pick) ? pick : null;
    if (newRating !== b.rating) b.flags = (b.flags || []).filter((f) => f.type !== 'ratingconflict');
    b.type = $('#e-btype').value; b.primaryRequired = $('#e-bpreq').value !== 'no';
    const pSel = $('#e-bprimary'); if (pSel) { b.primaryContact = pSel.value || null; const pc = D.contacts.find((x) => x.id === b.primaryContact); if (pc && !pc.tags.includes('pa') && !pc.tags.includes('pi')) { pc.tags.push('pa'); touch(pc); } }
    if (pick === 'inactive' && !$('#e-binreason').value.trim()) { toast('Please add the reason for inactivating'); $('#e-binwrap').style.display = ''; $('#e-binreason').focus(); return false; }
    if (pick === 'dna' && !$('#e-bdnareason').value.trim()) { toast('Please add the reason for "Do not answer"'); $('#e-bdnawrap').style.display = ''; $('#e-bdnareason').focus(); return false; }
    const oldBc = b.cats || []; b.cats = pick && !RATING_SET.has(pick) ? [pick] : [];
    (IDX.bizContacts.get(b.id) || []).filter(followsBiz).forEach((c) => {
      if (!oldBc.includes('inactive') && b.cats.includes('inactive')) { c.flags = c.flags || []; c.flags.push({ type: 'ezyvet', at: Date.now() }); touch(c); }
      if (!oldBc.includes('dna') && b.cats.includes('dna') && !c.tags.includes('blockedc')) { c.flags = c.flags || []; c.flags.push({ type: 'blockcheck', at: Date.now() }); touch(c); }
    });
    Object.assign(b, { name, rating: newRating, pics: readRep('pic'), patientIds: readRep('pid'), ...readRich('e-binfo'), warnings: $('#e-bwarn').value.trim(), sideNotes: $('#e-bside').value.trim(), dnaReason: $('#e-bdnareason').value.trim(), inactiveReason: $('#e-binreason').value.trim() });
    touch(b); if (isNew) D.businesses.push(b);
    S.sel = { kind: 'business', id: b.id }; if (isNew) S.tab = 'biz';
    return true;
  });
  if (!isClientBiz(b)) document.querySelectorAll('#sheet .client-only').forEach((el) => (el.style.display = 'none'));
}
document.addEventListener('change', (e) => {
  if (e.target.id !== 'e-btype') return; const nc = e.target.value === 'nonclient';
  document.querySelectorAll('#sheet .client-only').forEach((el) => (el.style.display = nc ? 'none' : ''));
  if (nc) $('#e-bpreq').value = 'no';
});
function parseGps(s) {
  s = (s || '').trim(); if (!s) return null;
  let m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/) || s.match(/(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{2,3}\.\d+)/);
  if (!m) return null; let lat = +m[1], lng = +m[2];
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) [lat, lng] = [lng, lat];
  return { lat, lng };
}
function editFarm(b, f) {
  const isNew = !f;
  f = f || { id: uid('f'), name: '', address: '', lat: null, lng: null, kmReturn: null, driveMin: null, kmStatus: 'missing', info: '', seeWarning: false, flags: [] };
  const startGps = f.lat != null ? `${f.lat}, ${f.lng}` : '';
  const body = `<div class="f"><label>${locWord(b)} label / name</label><input id="e-fname" value="${h(f.name)}" placeholder='e.g. "Jarrahvale" cattle yards'></div>
  <div class="f"><label>GPS location</label><input id="e-fgps" value="${h(startGps)}" placeholder="-34.94943, 118.02134  (or paste a Google Maps link)"><div class="hint" id="e-fgpshint">${f.lat != null ? `<a href="${gmapsPin(f)}" target="_blank" rel="noopener">Open pin in Google Maps</a>` : 'Drop a pin in Google Maps, copy the coordinates, paste here.'}</div></div>
  <div class="f"><label>Physical address (not linked to maps)</label><input id="e-faddr" value="${h(f.address)}"></div>
  <div class="grid2"><div class="f"><label>Distance from homebase — km return</label><input id="e-fkm" type="number" step="0.1" value="${f.kmReturn ?? ''}"></div>
  <div class="f"><label>Drive time each way (minutes)</label><input id="e-fmin" type="number" step="1" value="${f.driveMin != null ? Math.round(f.driveMin) : ''}"></div></div>
  <div><button class="btn small" type="button" data-act="calc-dist">Calculate with Google Maps</button> <span class="hint" id="e-calchint"></span></div>
  <div id="e-verify"></div>
  <div class="f" style="margin-top:10px"><label>${locWord(b)} info</label><textarea id="e-finfo">${h(f.info)}</textarea></div>
  <div class="f"><label class="checks"><label><input type="checkbox" id="e-fwarn" ${f.seeWarning ? 'checked' : ''}> Add ${isClientBiz(b) ? 'farm' : 'location'} warnings</label></label>
  <div id="e-fwarnbox" style="margin-top:8px;${f.seeWarning ? '' : 'display:none'}"><label style="color:var(--red-ink)">${isClientBiz(b) ? 'Farm' : 'Location'} warnings (shown in red with this ${isClientBiz(b) ? 'farm' : 'location'})</label><textarea id="e-fwarntext" class="warn" placeholder="e.g. Crush has no proper vet gate — take care">${h(f.warning || '')}</textarea></div></div>
  ${f.importedLabel ? `<div class="hint">Original Google Contacts label: ${h(f.importedLabel)}</div>` : ''}
  ${isNew ? '' : `<div class="f" style="margin-top:12px"><button class="btn" data-act="del-farm" data-bid="${b.id}" data-fid="${f.id}" style="color:var(--red)">Delete farm</button></div>`}`;
  openSheet(isNew ? 'New ' + locWord(b).toLowerCase() + ' — ' + b.name : 'Edit ' + locWord(b).toLowerCase(), body, () => {
    const g = parseGps(val('e-fgps'));
    if (val('e-fgps') && !g) { toast('GPS not recognised — use "lat, lng"'); return false; }
    const gpsChanged = (g ? `${g.lat},${g.lng}` : '') !== (f.lat != null ? `${f.lat},${f.lng}` : '');
    const needVerify = SHEET.verifyNeeded;
    if (needVerify && !($('#e-verified') && $('#e-verified').checked)) { toast('Distance requires verification before saving'); $('#e-verify').scrollIntoView({ block: 'center' }); return false; }
    const km = val('e-fkm'), mn = val('e-fmin');
    Object.assign(f, { name: val('e-fname'), address: val('e-faddr'), info: $('#e-finfo').value.trim(), seeWarning: $('#e-fwarn').checked, warning: $('#e-fwarn').checked ? $('#e-fwarntext').value.trim() : '', kmReturn: km === '' ? null : +km, driveMin: mn === '' ? null : +mn });
    if (g) { f.lat = g.lat; f.lng = g.lng; } else { f.lat = f.lng = null; }
    if (gpsChanged) f.flags = (f.flags || []).filter((x) => x.type !== 'signfix' && x.type !== 'kmcheck');
    f.kmStatus = f.kmReturn == null ? 'missing' : needVerify || f.kmStatus === 'needs-verify' ? 'verified' : f.kmStatus;
    if ($('#e-verified') && $('#e-verified').checked) f.kmStatus = 'verified';
    touch(b); if (isNew) b.farms.push(f);
    return true;
  });
  SHEET.verifyNeeded = false;
  $('#e-fwarn').addEventListener('change', (e) => { $('#e-fwarnbox').style.display = e.target.checked ? '' : 'none'; if (e.target.checked) $('#e-fwarntext').focus(); });
  const showVerify = () => {
    SHEET.verifyNeeded = true;
    $('#e-verify').innerHTML = `<div class="verifybox"><b>Distance requires verification before saving.</b><div class="hint" style="color:var(--yellow-ink)">The GPS pin is new or has changed. Check the km and drive time above (use “Calculate with Google Maps” or check manually), then tick:</div><label style="display:flex;gap:8px;margin-top:6px;font-weight:600"><input type="checkbox" id="e-verified"> I have checked the distance and drive time</label></div>`;
    $('#e-fkm').style.background = $('#e-fmin').style.background = 'var(--yellow-bg)';
  };
  $('#e-fgps').addEventListener('input', () => {
    const g = parseGps(val('e-fgps')); const hint = $('#e-fgpshint');
    hint.innerHTML = g ? `<a href="${gmapsPin(g)}" target="_blank" rel="noopener">Check pin in Google Maps</a> (${g.lat.toFixed(5)}, ${g.lng.toFixed(5)})` : val('e-fgps') ? '<span style="color:var(--red)">Not recognised yet</span>' : '';
    if (g && `${g.lat}, ${g.lng}` !== startGps && !SHEET.verifyNeeded) showVerify();
  });
  if (f.kmStatus === 'needs-verify') showVerify();
  SHEET.calc = async () => {
    const g = parseGps(val('e-fgps')); const hint = $('#e-calchint');
    if (!g) { hint.textContent = 'Add a GPS pin first.'; return; }
    hint.textContent = 'Calculating…';
    try { const r = await Maps.distances([g]); const x = r[0]; if (!x) throw new Error('No route found'); $('#e-fkm').value = Math.ceil(x.km * 2 - 1e-9); $('#e-fmin').value = Math.round(x.min); hint.innerHTML = `Google Maps: ${(x.km * 2).toFixed(1)} km return (rounded up to ${Math.ceil(x.km * 2 - 1e-9)} km), ${fmtMin(x.min)} each way. Please check. <a href="${gmapsRoute(g)}" target="_blank" rel="noopener">🗺 View route</a>`; if (!SHEET.verifyNeeded) showVerify(); }
    catch (e) { hint.textContent = e.message; }
  };
}

/* ---------------- Google Maps (needs API key in Settings) ---------------- */
const Maps = {
  key() { return D.settings.mapsKey || ''; },
  async distances(dests, origin = D.settings.home) {
    if (!this.key()) throw new Error('Add your Google Maps key in Settings to calculate distances.');
    if (!navigator.onLine) throw new Error('You are offline — distances need internet.');
    const out = [];
    for (let i = 0; i < dests.length; i += 25) {
      const chunk = dests.slice(i, i + 25);
      const body = { origins: [{ waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } } }], destinations: chunk.map((d) => ({ waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lng } } } })), travelMode: 'DRIVE' };
      const r = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key(), 'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,condition' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error('Google Maps error ' + r.status + ': ' + (await r.text()).slice(0, 160));
      const js = await r.json();
      js.forEach((e) => { if (e.condition === 'ROUTE_EXISTS' || e.distanceMeters) out[i + e.destinationIndex] = { km: e.distanceMeters / 1000, min: parseInt(e.duration) / 60 }; });
    }
    return out;
  },
  async optimise(origin, dest, stops) {
    if (!this.key() || !navigator.onLine) return null;
    const wp = (p) => (p.lat != null ? { location: { latLng: { latitude: p.lat, longitude: p.lng } } } : { address: p.text });
    const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key(), 'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration' }, body: JSON.stringify({ origin: wp(origin), destination: wp(dest), intermediates: stops.map(wp), travelMode: 'DRIVE', optimizeWaypointOrder: true }) });
    if (!r.ok) return null; const js = await r.json(); const rt = js.routes && js.routes[0]; if (!rt) return null;
    return { order: rt.optimizedIntermediateWaypointIndex, km: rt.distanceMeters / 1000, min: parseInt(rt.duration) / 60 };
  },
};

/* ---------------- route planner ---------------- */
function hav(a, b) { const R = 6371, t = Math.PI / 180; const dLa = (b.lat - a.lat) * t, dLo = (b.lng - a.lng) * t; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
function localOptimise(start, end, stops) {
  // nearest neighbour + 2-opt on straight-line distance (used offline / without a Maps key)
  if (stops.length < 3 && !start) return stops.map((_, i) => i);
  const pts = stops.map((s, i) => ({ ...s, i }));
  const s0 = start && start.lat != null ? start : pts[0];
  let cur = s0, rem = pts.slice(), order = [];
  if (!(start && start.lat != null)) { order.push(rem.shift()); cur = order[0]; }
  while (rem.length) { let bi = 0, bd = Infinity; rem.forEach((p, k) => { const d = hav(cur, p); if (d < bd) { bd = d; bi = k; } }); cur = rem.splice(bi, 1)[0]; order.push(cur); }
  const e0 = end && end.lat != null ? end : null;
  const len = (o) => { let d = 0, p = s0.lat != null && start && start.lat != null ? s0 : null; o.forEach((q) => { if (p) d += hav(p, q); p = q; }); if (e0 && p) d += hav(p, e0); return d; };
  let improved = true;
  while (improved) { improved = false; for (let a = 0; a < order.length - 1; a++) for (let b = a + 1; b < order.length; b++) { const n = order.slice(0, a).concat(order.slice(a, b + 1).reverse(), order.slice(b + 1)); if (len(n) + 1e-9 < len(order)) { order = n; improved = true; } } }
  return order.map((p) => p.i);
}
function endpoint(e) {
  if (e.type === 'home') return { ...D.settings.home, label: D.settings.home.label + ' (' + D.settings.home.address + ')' };
  if (e.type === 'farm') { const f = IDX.farms.get(e.fid); if (f) return { lat: f.lat, lng: f.lng, label: farmLabel(f) }; }
  if (e.type === 'place') return { text: e.text, label: e.text };
  if (e.type === 'none') return null;
  return { ...D.settings.home, label: D.settings.home.label };
}
function farmLabel(f) { const b = IDX.farmBiz.get(f.id); return (b ? b.name : '') + (f.name ? ' — ' + f.name : ''); }
const locStr = (p) => (p.lat != null ? `${p.lat},${p.lng}` : p.text);
function routeUrl(start, end, stops) {
  const st = stops.slice();
  let origin = start ? locStr(start) : null, dest = end ? locStr(end) : null;
  if (!dest) dest = locStr(st.pop());
  const u = new URL('https://www.google.com/maps/dir/'); u.searchParams.set('api', '1');
  if (origin) u.searchParams.set('origin', origin);
  u.searchParams.set('destination', dest);
  if (st.length) u.searchParams.set('waypoints', st.map(locStr).join('|'));
  u.searchParams.set('travelmode', 'driving');
  return u.toString();
}
function endpointPicker(which) {
  const e = S.route[which];
  const lbl = e.type === 'home' ? 'Bovitech homebase' : e.type === 'farm' ? farmLabel(IDX.farms.get(e.fid) || {}) : e.type === 'place' ? e.text : e.type === 'none' ? 'Last stop' : '';
  return `<div class="f"><span class="lbl">${which === 'start' ? 'Start from' : 'Finish at'}</span>
  <div class="seg"><button class="${e.type === 'home' ? 'on' : ''}" data-act="ep" data-w="${which}" data-v="home">Homebase</button><button class="${e.type === 'farm' ? 'on' : ''}" data-act="ep" data-w="${which}" data-v="farm">A client's farm</button><button class="${e.type === 'place' ? 'on' : ''}" data-act="ep" data-w="${which}" data-v="place">Google Maps place</button>${which === 'end' ? `<button class="${e.type === 'none' ? 'on' : ''}" data-act="ep" data-w="end" data-v="none">Last stop</button>` : ''}</div>
  ${e.type === 'farm' ? `<input class="ep-search" data-w="${which}" placeholder="Search clients, businesses or farms" value="${e.fid ? h(lbl) : ''}" style="margin-top:6px;width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:9px"><div id="ep-res-${which}"></div>` : ''}
  ${e.type === 'place' ? `<input class="ep-place" data-w="${which}" placeholder="e.g. Albany Regional Hospital, or an address" value="${h(e.text || '')}" style="margin-top:6px;width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:9px"><div class="hint">Google Maps will search for this place.</div>` : ''}
  ${e.type === 'home' ? `<div class="hint">317 Gull Rock Road, Kalgan, WA 6330</div>` : ''}</div>`;
}
function renderRoute() {
  const R = S.route;
  let html = `<div class="d-wrap"><h2 class="sec-h" style="font-size:26px">Route planner</h2>
  <div class="card"><h3>Stops (${R.stops.length}/${MAX_STOPS})</h3>
  ${R.stops.map((s, i) => { const f = IDX.farms.get(s.fid); return `<div class="stop"><span class="num">${i + 1}</span><div class="t"><div style="font-weight:600">${h(farmLabel(f))}</div><div class="hint">${h(f.address || '')} ${f.kmReturn != null ? '· ' + fmtKm(f) : ''}</div></div><button class="btn small" data-act="rs-up" data-i="${i}" ${i ? '' : 'disabled'}>↑</button><button class="btn small" data-act="rs-down" data-i="${i}" ${i < R.stops.length - 1 ? '' : 'disabled'}>↓</button><button class="btn small" data-act="rs-del" data-i="${i}">×</button></div>`; }).join('') || '<div class="hint">Add farms below, or use “+ Route” on any farm.</div>'}
  ${R.stops.length < MAX_STOPS ? `<input id="rs-search" placeholder="Search clients, businesses, farms or PICs to add a stop" style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;margin-top:6px"><div id="rs-res"></div>` : '<div class="hint">Google Maps allows up to 9 stops.</div>'}
  </div>
  <div class="card"><h3>Start and finish</h3>${endpointPicker('start')}
  <div class="f"><label><input type="checkbox" data-act="endsame" ${R.endSame ? 'checked' : ''}> Finish where I started</label></div>
  ${R.endSame ? '' : endpointPicker('end')}</div>
  <div class="card"><h3>Order</h3><div class="seg"><button class="${R.mode === 'efficient' ? 'on' : ''}" data-act="rmode" data-v="efficient">Most efficient</button><button class="${R.mode === 'order' ? 'on' : ''}" data-act="rmode" data-v="order">The order I picked</button></div>
  <div class="hint" style="margin-top:6px">${D.settings.mapsKey ? 'Most efficient uses Google Maps road routing when online.' : 'Most efficient uses straight-line distances until the Google Maps key is added in Settings.'}</div></div>
  <div class="actions"><button class="btn red" data-act="route-go" ${R.stops.length ? '' : 'disabled'} style="font-size:17px;padding:12px 18px">Open route in Google Maps</button>${R.stops.length ? '<button class="btn" data-act="route-clear">Clear</button>' : ''}</div><div id="route-msg" class="hint"></div></div>`;
  return html;
}
function farmSearch(q, limit = 12) {
  const pq = parseQuery(q); if (!pq.inc.length) return [];
  const out = [];
  for (const b of D.businesses) {
    const cs = (IDX.bizContacts.get(b.id) || []).map(fullName).join(' ');
    for (const f of b.farms) {
      if (f.lat == null) continue;
      const hay = [b.name, cs, f.name, f.address, f.info, ...b.pics.map((p) => p.value)].join(' ').toLowerCase();
      if (matchQ(hay, pq)) out.push(f);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
async function goRoute() {
  const R = S.route; const msg = $('#route-msg');
  let stops = R.stops.map((s) => { const f = IDX.farms.get(s.fid); return { lat: f.lat, lng: f.lng, fid: f.id }; });
  const start = endpoint(R.start); let end = R.endSame ? (R.start.type === 'none' ? null : endpoint(R.start)) : endpoint(R.end);
  if ((start && start.lat == null && !start.text) || (end && end.lat == null && !end.text)) { msg.textContent = 'Choose the start/finish location first.'; return; }
  const w = window.open('', '_blank');
  if (R.mode === 'efficient' && stops.length > 1) {
    let order = null;
    try { const g = await Maps.optimise(start || stops[0], end || stops[stops.length - 1], end ? stops : stops.slice(0, -1)); if (g && g.order) order = end ? g.order : [...g.order, stops.length - 1]; if (g) msg.textContent = `Google Maps: about ${Math.round(g.km)} km, ${fmtMin(g.min)} total driving.`; } catch (e) { /* fall back */ }
    if (!order) order = localOptimise(start, end, stops);
    stops = order.map((i) => stops[i]);
    R.stops = stops.map((s) => ({ fid: s.fid }));
  }
  const url = routeUrl(start, end, stops);
  if (w) w.location = url; else location.href = url;
  $('#list').innerHTML = renderRoute(); $('#route-msg').textContent = msg.textContent || (R.mode === 'efficient' ? 'Stops re-ordered for the shortest drive.' : '');
}

/* ---------------- jobs view ---------------- */
S.jobSel = new Set(); S.jobOpen = {};
// which "do it to all selected" actions make sense for each kind of job
function bulkOps(t, sel) {
  const ops = [];
  if (sel.some((j) => j.suggest)) ops.push({ op: 'usekm', label: '✓ Use suggested km for all', green: true });
  if (sel.some((j) => j.photoSuggest)) ops.push({ op: 'usephoto', label: '✓ Use suggested photo for all', green: true });
  if (t === 'catprop') ops.push({ op: 'catapply', label: '✓ Yes — change them too', green: true });
  if (t === 'blockcheck') ops.push({ op: 'blockyes', label: '✓ Yes — numbers blocked', green: true }, { op: 'blockno', label: 'Not yet' });
  if (t === 'sheep') ops.push({ op: 'sheepreg', label: 'Change all to Sheep only (regular)' });
  if (t === 'noprimary') ops.push({ op: 'noprimreq', label: 'Primary contact not required' }, { op: 'nonclient', label: 'Make non-client (industry) businesses' });
  if (t === 'conflict') ops.push({ op: 'keepmine', label: "Keep this device's version for all" }, { op: 'keeptheirs', label: 'Keep the other version for all' });
  if (t === 'nearpin') ops.push({ op: 'samefarm1', label: "Same yards used by both businesses (keep 1's details)" }, { op: 'dismiss', label: 'Different farms' });
  if (t === 'dupe') ops.push({ op: 'dismiss', label: 'Not duplicates' });
  if (JOB_TYPES[t].manual) ops.push({ op: 'dismiss', label: JOB_TYPES[t].btn || 'Mark resolved - changes not required' });
  const seen = new Set(); return ops.filter((o) => (seen.has(o.op) ? false : seen.add(o.op)));
}
function shareFarm(keep, other) {
  other.lat = keep.lat; other.lng = keep.lng;
  if (keep.kmReturn != null) { other.kmReturn = keep.kmReturn; other.kmStatus = keep.kmStatus === 'needs-verify' ? 'needs-verify' : 'verified'; }
  if (keep.driveMin != null) other.driveMin = keep.driveMin;
  if (keep.gKm != null) { other.gKm = keep.gKm; other.gMin = keep.gMin; }
  if (!other.address && keep.address) other.address = keep.address;
  other.flags = (other.flags || []).filter((x) => x.type !== 'kmcheck');
  other.sharedWith = keep.id; touch(IDX.farmBiz.get(other.id));
  if (!keep.sharedWith) { keep.sharedWith = other.id; touch(IDX.farmBiz.get(keep.id)); }
}
// edit the categories of a business and everyone at it on one screen
function editBizCats(bid) {
  const b = IDX.biz.get(bid); const cs = IDX.bizContacts.get(bid) || []; const cats = D.tags.filter((t) => t.group === 'client');
  const ratingSel = (id, cur, first) => `<select id="${id}" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:9px;font-size:16px"><option value="">${first}</option>${RATINGS.map((r) => `<option value="${r}" ${cur === r ? 'selected' : ''}>${tagName(r)}</option>`).join('')}</select>`;
  const body = `<div class="card" style="background:#f3f8f3"><h3>${h(b.name)} — business categories</h3>
    ${catPicker('bizr', bizCat(b), 'No category')}
    <div class="hint" style="margin-top:6px">Everyone set to "Same as business" gets this.</div></div>
  <div class="card" style="background:#fffbea"><h3>Quick change for ticked people</h3>
    <div class="search" style="flex-wrap:wrap"><select id="bc-tag" style="flex:1;min-width:180px;padding:8px;border:1px solid var(--line);border-radius:9px">${[...RATINGS, ...cats.map((t) => t.id)].map((t) => `<option value="${t}">${h(tagName(t))}</option>`).join('')}</select>
    <button class="btn small" type="button" data-act="bc-quick" data-on="1">Set this category</button><button class="btn small" type="button" data-act="bc-quick" data-on="biz">Set to "Same as business"</button></div>
    <label style="display:block;margin-top:8px"><input type="checkbox" id="bc-all"> Tick everyone</label></div>
  ${cs.map((c) => { const own = !followsBiz(c) || !!ownRating(c); return `<div class="card" data-bccontact="${c.id}"><h3 style="text-transform:none;letter-spacing:0;font-size:17px;color:var(--ink)"><input type="checkbox" class="bc-pick" data-cid="${c.id}" style="width:20px;height:20px"> <span class="sp">${h(fullName(c))}</span></h3>
    <div class="seg" style="margin-bottom:8px"><button type="button" class="${own ? '' : 'on'}" data-act="bc-mode" data-v="biz">Same as business</button><button type="button" class="${own ? 'on' : ''}" data-act="bc-mode" data-v="own">Own category</button></div>
    <input type="hidden" class="bc-modeval" value="${own ? 'own' : 'biz'}">
    <div class="bc-own" style="${own ? '' : 'display:none'}">${catPicker('r-' + c.id, followsBiz(c) ? '' : catOf(c), 'No category')}</div></div>`; }).join('')}`;
  openSheet('Categories — ' + b.name, body, () => {
    let n = 0;
    const bpick = rtVal($('#sheet'), 'bizr'); const nr = RATING_SET.has(bpick) ? bpick : null; const nbc = bpick && !RATING_SET.has(bpick) ? [bpick] : [];
    const oldBc = b.cats || []; let bch = false;
    if (nr !== (b.rating || null) || nbc.slice().sort().join() !== oldBc.slice().sort().join()) { b.rating = nr; b.cats = nbc; b.flags = (b.flags || []).filter((f) => f.type !== 'ratingconflict'); touch(b); bch = true; reindex(); }
    document.querySelectorAll('#sheet [data-bccontact]').forEach((row) => {
      const c = D.contacts.find((x) => x.id === row.dataset.bccontact); if (!c) return;
      const before = effCats(c), beforeR = ownRating(c), wasFollow = followsBiz(c);
      if (row.querySelector('.bc-modeval').value === 'biz') { c.tags = c.tags.filter((t) => !isCatTag(t) && !RATING_SET.has(t)); c.ownCats = false; }
      else {
        setOne(c, rtVal(row, 'r-' + c.id));
      }
      const after = effCats(c);
      if (!before.includes('dna') && after.includes('dna') && !c.tags.includes('blockedc')) { c.flags = c.flags || []; c.flags.push({ type: 'blockcheck', at: Date.now() }); }
      if (!before.includes('inactive') && after.includes('inactive')) { c.flags = c.flags || []; c.flags.push({ type: 'ezyvet', at: Date.now() }); }
      if (before.slice().sort().join() !== after.slice().sort().join() || beforeR !== ownRating(c) || wasFollow !== followsBiz(c)) { touch(c); n++; }
    });
    NEXT_LOG_LABEL = `Categories updated at ${b.name}` + (bch ? ' (business)' : '') + (n ? ` — ${n} contact${n === 1 ? '' : 's'}` : '');
    photoCache.clear(); Sync.soon(); if (!n && !bch) toast('No changes'); return true;
  });
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act=bc-mode],[data-act=cat-mode]'); if (!el) return;
  if (el.dataset.act === 'bc-mode') { const row = el.closest('[data-bccontact]'); row.querySelectorAll('[data-act=bc-mode]').forEach((x) => x.classList.toggle('on', x === el)); row.querySelector('.bc-modeval').value = el.dataset.v; row.querySelector('.bc-own').style.display = el.dataset.v === 'own' ? '' : 'none'; }
  else { el.parentElement.querySelectorAll('[data-act=cat-mode]').forEach((x) => x.classList.toggle('on', x === el)); $('#e-catmode').value = el.dataset.v; $('#e-catbiz').style.display = el.dataset.v === 'biz' ? '' : 'none'; $('#e-catown').style.display = el.dataset.v === 'own' ? '' : 'none'; }
});
document.addEventListener('change', (e) => { if (e.target.id === 'bc-all') document.querySelectorAll('#sheet .bc-pick').forEach((i) => (i.checked = e.target.checked)); });
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (el.dataset.act === 'cat-edit') editBizCats(el.dataset.bid);
  if (el.dataset.act === 'bc-quick') {
    const tag = $('#bc-tag').value; const picked = [...document.querySelectorAll('#sheet .bc-pick')].filter((i) => i.checked);
    if (!picked.length) { toast('Tick the people first'); return; }
    picked.forEach((p) => {
      const row = document.querySelector(`#sheet [data-bccontact="${p.dataset.cid}"]`); const setMode = (v) => { row.querySelector('.bc-modeval').value = v; row.querySelectorAll('[data-act=bc-mode]').forEach((x) => x.classList.toggle('on', x.dataset.v === v)); row.querySelector('.bc-own').style.display = v === 'own' ? '' : 'none'; };
      if (el.dataset.on === 'biz') { setMode('biz'); return; }
      setMode('own'); const box = row.querySelector(`[data-rt="${tag}"]`); if (box) { row.querySelectorAll('[data-rt]').forEach((i) => (i.checked = i === box)); }
    });
    toast('Set — press Save to keep');
  }
});
function runBulk(t, op) {
  const sel = jobs().filter((j) => j.type === t && S.jobSel.has(j.key)); if (!sel.length) return;
  const label = bulkOps(t, sel).find((o) => o.op === op)?.label || op;
  
  D.dismissed = D.dismissed || {};
  sel.forEach((j) => {
    if (op === 'dismiss') {
      D.dismissed[j.key] = Date.now(); D._dismissDirty = true;
      if (t === 'signfix') { const f = IDX.farms.get(j.fid); if (f) { f.flags = (f.flags || []).filter((x) => x.type !== 'signfix'); touch(IDX.farmBiz.get(f.id)); } }
    } else if (op === 'usekm' && j.suggest) {
      j.suggest.fids.forEach((fid) => { const f = IDX.farms.get(fid); if (!f) return; f.kmReturn = j.suggest.km; f.kmStatus = 'verified'; if (f.gMin != null && f.driveMin == null) f.driveMin = f.gMin; f.flags = (f.flags || []).filter((x) => x.type !== 'kmcheck'); touch(IDX.farmBiz.get(fid)); });
    } else if (op === 'samefarm1' && j.pair) {
      const keep = IDX.farms.get(j.pair.a), other = IDX.farms.get(j.pair.b);
      if (keep && other && IDX.farmBiz.get(keep.id) !== IDX.farmBiz.get(other.id)) shareFarm(keep, other);
      D.dismissed[j.key] = Date.now(); D._dismissDirty = true;
    } else if ((op === 'keepmine' || op === 'keeptheirs') && j.data) { resolveConflict(j.data.key, op === 'keepmine' ? 'mine' : 'theirs');
    } else if (op === 'catapply' && j.cat) applyCat(j.cat.cid, j.cat.at);
    else if (op === 'blockyes' && j.block) setBlocked(j.block, true);
    else if (op === 'blockno' && j.block) setBlocked(j.block, false);
    else if (op === 'usephoto' && j.photoSuggest) { const c = D.contacts.find((x) => x.id === j.id); if (c) { c.photoChoice = j.photoSuggest; touch(c); } }
    else if (op === 'sheepreg') { const c = D.contacts.find((x) => x.id === j.id); if (c) { setCats(c, [...effCats(c).filter((x) => x !== 'sheepocc' && x !== 'sheep'), 'sheepreg']); c.flags = (c.flags || []).filter((x) => x.type !== 'sheepconfirm'); } }
    else if (op === 'noprimreq' || op === 'nonclient') { const b = IDX.biz.get(j.id); if (b) { b.primaryRequired = false; if (op === 'nonclient') b.type = 'nonclient'; touch(b); } }
  });
  S.jobSel.clear(); NEXT_LOG_LABEL = `Jobs: ${label.replace(/^✓ /, '')} (${sel.length})`; photoCache.clear(); Sync.soon(); changed(); toast('Done — ' + sel.length + ' job' + (sel.length === 1 ? '' : 's'));
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return; const a = el.dataset.act;
  if (a === 'job-sel') { el.checked ? S.jobSel.add(el.dataset.key) : S.jobSel.delete(el.dataset.key); rerenderJobs(); }
  else if (a === 'job-selall') { e.stopPropagation(); const g = jobs().filter((j) => j.type === el.dataset.type); g.forEach((j) => (el.checked ? S.jobSel.add(j.key) : S.jobSel.delete(j.key))); S.jobOpen[el.dataset.type] = true; rerenderJobs(); }
  else if (a === 'job-selnone') { jobs().filter((j) => j.type === el.dataset.type).forEach((j) => S.jobSel.delete(j.key)); rerenderJobs(); }
  else if (a === 'job-bulk') runBulk(el.dataset.type, el.dataset.op);
});
document.addEventListener('toggle', (e) => { const d = e.target; if (d.classList && d.classList.contains('jobgroup')) S.jobOpen[d.dataset.type] = d.open; }, true);
function rerenderJobs() { if (S.tab !== 'jobs') return; const sc = $('#list').scrollTop; $('#list').innerHTML = renderJobs(); $('#list').scrollTop = sc; }
function renderJobs() {
  const js = jobs(); const groups = {};
  js.forEach((j) => (groups[j.type] = groups[j.type] || []).push(j));
  let html = `<div class="d-wrap"><h2 class="sec-h" style="font-size:26px">Jobs — things to check</h2>
  <div class="hint" style="margin-bottom:10px">Items clear automatically once fixed. Flags also show on the contact or business itself.</div>
  <div class="actions"><button class="btn" data-act="check-dist">Check all distances against Google Maps</button></div><div id="check-msg" class="hint"></div>`;
  if (!js.length) html += `<div class="empty">Nothing needs attention. 🎉</div>`;
  Object.keys(JOB_TYPES).forEach((t) => {
    const g = groups[t]; if (!g) return;
    const isOpen = !!S.jobOpen[t]; // folded unless you open it
    const nSel = g.filter((j) => S.jobSel.has(j.key)).length; const ops = bulkOps(t, g.filter((j) => S.jobSel.has(j.key)));
    html += `<details class="jobgroup" data-type="${t}" ${isOpen ? 'open' : ''}><summary><input type="checkbox" class="jobcheck" data-act="job-selall" data-type="${t}" title="Select all" ${nSel && nSel === g.length ? 'checked' : ''}><span style="color:var(--red)">${ICONS.flag}</span><span style="flex:1">${h(JOB_TYPES[t].t)}</span><span class="count">${g.length}</span></summary>`;
    if (nSel) html += `<div class="bulkbar"><b>${nSel} selected</b>${ops.map((o) => `<button class="btn small ${o.green ? 'greenbtn' : ''}" data-act="job-bulk" data-type="${t}" data-op="${o.op}">${h(o.label)}</button>`).join('') || '<span class="hint">Nothing can be done to all of these at once — use each job\'s own buttons.</span>'}<button class="btn small" data-act="job-selnone" data-type="${t}">Clear selection</button></div>`;
    g.forEach((j) => {
      html += `<div class="job ${S.jobSel.has(j.key) ? 'jobsel' : ''}"><input type="checkbox" class="jobcheck" data-act="job-sel" data-key="${h(j.key)}" ${S.jobSel.has(j.key) ? 'checked' : ''} aria-label="Select this job"><div class="t"><div class="who">${h(j.who)}</div><div class="note">${h(j.note)}</div>${j.suggest ? `<div class="note" style="color:#0d5c20;font-weight:600">Suggested: ${j.suggest.km} km return (${h(j.suggest.why)})</div>` : ''}${j.photoSuggest ? `<div class="note" style="color:#0d5c20;font-weight:600">Suggested: ${h(tagName(j.photoSuggest))} photo</div>` : ''}<div class="acts">
      ${t === 'conflict' ? '' : `<button class="btn small" data-act="job-open" data-kind="${j.kind}" data-id="${j.id}" ${j.fid ? `data-fid="${j.fid}"` : ''}>Make a change</button>`}
      ${t === 'conflict' ? `</div><div style="width:100%">${conflictDiff(j.data)}` : ''}
      ${j.suggest ? `<button class="btn small" style="background:var(--green-bg);border-color:var(--green)" data-act="use-km" data-km="${j.suggest.km}" data-fids="${j.suggest.fids.join(',')}">✓ Use suggested: ${j.suggest.km} km</button>` : ''}
      ${j.suggest && IDX.farms.get(j.suggest.fids[0])?.lat != null ? `<a class="btn small" href="${gmapsRoute(IDX.farms.get(j.suggest.fids[0]))}" target="_blank" rel="noopener">🗺 View suggested route</a>` : ''}
      ${!j.suggest && j.needsLookup && D.settings.mapsKey ? `<button class="btn small" data-act="lookup-km" data-fids="${j.needsLookup.join(',')}">Get Google Maps suggestion</button>` : ''}
      ${j.pair ? (() => { const fa = IDX.farms.get(j.pair.a), fb = IDX.farms.get(j.pair.b); return `<a class="btn small greenbtn" href="https://www.google.com/maps/dir/?api=1&origin=${fa.lat},${fa.lng}&destination=${fb.lat},${fb.lng}&travelmode=walking" target="_blank" rel="noopener">🗺 View both pins on Google Maps</a><a class="btn small" href="${gmapsPin(fa)}" target="_blank" rel="noopener">View pin 1</a><a class="btn small" href="${gmapsPin(fb)}" target="_blank" rel="noopener">View pin 2</a>
        <button class="btn small" data-act="pin-diff" data-key="${h(j.key)}">Different farms</button>
        <button class="btn small" data-act="pin-same" data-key="${h(j.key)}" data-keep="${fa.id}" data-other="${fb.id}">${j.pair.same ? "Same farm — merge, keep 1's details" : "Same yards used by both businesses — keep 1's details"}</button>
        <button class="btn small" data-act="pin-same" data-key="${h(j.key)}" data-keep="${fb.id}" data-other="${fa.id}">${j.pair.same ? "Same farm — merge, keep 2's details" : "Same yards used by both businesses — keep 2's details"}</button>`; })() : ''}
      ${j.dupe ? (() => { const x = j.dupe, isC = x.kind === 'contact'; const A = isC ? D.contacts.find((c) => c.id === x.a) : IDX.biz.get(x.a), B = isC ? D.contacts.find((c) => c.id === x.b) : IDX.biz.get(x.b); const nm = (r) => h(isC ? fullName(r) : r.name);
        return `<button class="btn small" data-act="open" data-kind="${x.kind}" data-id="${x.a}">Open 1</button><button class="btn small" data-act="open" data-kind="${x.kind}" data-id="${x.b}">Open 2</button><button class="btn small" data-act="dupe-not" data-key="${h(j.key)}">Not duplicates</button><button class="btn small" data-act="dupe-merge" data-kind="${x.kind}" data-keep="${x.a}" data-other="${x.b}">Merge into 1 (${nm(A)})</button><button class="btn small" data-act="dupe-merge" data-kind="${x.kind}" data-keep="${x.b}" data-other="${x.a}">Merge into 2 (${nm(B)})</button>`; })() : ''}
      ${j.catdiff ? `<button class="btn small primary" data-act="cat-edit" data-bid="${j.catdiff.bid}">Choose categories…</button>` : ''}
      ${j.catdiff ? [...new Set((IDX.bizContacts.get(j.catdiff.bid) || []).map(catOf))].map((v) => `<button class="btn small" data-act="cat-all" data-bid="${j.catdiff.bid}" data-tag="${v}" data-on="1">Everyone: ${h(v ? tagName(v) : 'no category')}</button>`).join('') : ''}
      ${j.cat ? `<button class="btn small greenbtn" data-act="cat-apply" data-cid="${j.cat.cid}" data-at="${j.cat.at}">✓ Yes — change them too</button>` : ''}
      ${j.block ? `<button class="btn small greenbtn" data-act="block-yes" data-cid="${j.block}">✓ Yes — number blocked</button>${(D.contacts.find((x) => x.id === j.block) || { tags: [] }).tags.includes('blockedn') ? '' : `<button class="btn small" data-act="block-no" data-cid="${j.block}">Not yet</button>`}` : ''}
      ${j.photoSuggest ? `<button class="btn small" style="background:var(--green-bg);border-color:var(--green)" data-act="use-photo" data-id="${j.id}" data-tag="${j.photoSuggest}">✓ Use suggested: ${h(tagName(j.photoSuggest))}</button>` : ''}
      ${JOB_TYPES[t].manual ? `<button class="btn small" data-act="job-dismiss" data-key="${h(j.key)}">${JOB_TYPES[t].btn || 'Mark resolved - changes not required'}</button>` : ''}</div></div></div>`;
    });
    html += '</details>';
  });
  return html + '</div>';
}
async function checkAllDistances() {
  const msg = $('#check-msg');
  const farms = []; D.businesses.forEach((b) => b.farms.forEach((f) => { if (f.lat != null) farms.push(f); }));
  msg.textContent = `Checking ${farms.length} farms…`;
  try {
    const res = await Maps.distances(farms.map((f) => ({ lat: f.lat, lng: f.lng })));
    let n = 0;
    farms.forEach((f, i) => {
      const r = res[i]; if (!r) return;
      const exact = r.km * 2, g = Math.ceil(exact - 1e-9); f.gKm = g; f.gMin = Math.round(r.min); f.gAt = Date.now();
      f.driveMin = f.driveMin ?? Math.round(r.min);
      f.flags = (f.flags || []).filter((x) => x.type !== 'kmcheck'); touch(IDX.farmBiz.get(f.id));
      if (f.kmReturn != null && Math.abs(f.kmReturn - exact) > 1) { f.flags.push({ type: 'kmcheck', google: g, note: `Recorded ${f.kmReturn} km return — Google Maps says ${exact.toFixed(1)} km return (${fmtMin(r.min)} each way)` }); n++; }
    });
    Object.keys(D.dismissed || {}).forEach((k) => { if (k.startsWith('kmcheck:')) { D.dismissed[k] = 0; D._dismissDirty = true; } });
    changed(); toast(`${n} farm${n === 1 ? '' : 's'} more than 1 km out`);
  } catch (e) { msg.textContent = e.message; }
}

/* ---------------- settings ---------------- */
function renderSettings() {
  const st = D.settings;
  return `<div class="d-wrap"><h2 class="sec-h" style="font-size:26px">Settings</h2>
  <div class="card"><h3><span class="sp">Tags &amp; photos</span><button class="btn small" data-act="new-tag">+ New tag</button></h3>
  ${['client', 'additional'].map((g) => `<div class="lbl" style="margin-top:10px">${{ client: 'Contact category', additional: 'Additional tags' }[g]}${g === 'client' ? ' <span class="hint">(A+ to C are set on the business)</span>' : ''}</div>${D.tags.filter((t) => (g === 'client' ? t.group === 'rating' || t.group === 'client' : t.group === g)).map((t) => { const src = tagPhotoSrc(t.id); const n = D.contacts.filter((c) => contactTagSet(c).has(t.id)).length; return `<div class="kv" style="align-items:center">${src ? `<img src="${src}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">` : '<span style="width:36px;height:36px;border-radius:50%;background:#eee;display:inline-block"></span>'}<div class="v">${h(t.name)} <span class="hint">${n} contact${n === 1 ? '' : 's'}</span></div><button class="btn small" data-act="edit-tag" data-id="${t.id}">Edit</button></div>`; }).join('')}`).join('')}</div>
  <div class="card"><h3>Photo priority</h3><div class="hint" style="margin-bottom:6px">When a contact has more than one tag with a photo and nobody has chosen one, the tag highest on this list is shown. Use the arrows to reorder. Changes apply on every device.</div>
  ${photoOrder().map((id, i, arr) => `<div class="kv" style="align-items:center"><span style="width:22px;color:var(--ink3);font-weight:600">${i + 1}</span><img src="${tagPhotoSrc(id)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover"><div class="v">${h(tagName(id))}</div><button class="btn small" data-act="prio" data-id="${id}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class="btn small" data-act="prio" data-id="${id}" data-dir="1" ${i < arr.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button></div>`).join('')}
  ${D.settings.photoPriority ? '<div class="actions" style="margin-top:8px"><button class="btn small" data-act="prio-reset">Reset to default order</button></div>' : ''}</div>
  <div class="card"><h3>Homebase</h3><div class="f"><label>Address</label><input id="s-homeaddr" value="${h(st.home.address)}"></div><div class="f"><label>GPS</label><input id="s-homegps" value="${st.home.lat}, ${st.home.lng}"></div><button class="btn small" data-act="save-home">Save homebase</button></div>
  <div class="card"><h3>Google Maps</h3><div class="f"><label>API key</label><input id="s-mapskey" value="${h(st.mapsKey || '')}" placeholder="Paste key starting with AIza…"></div><button class="btn small" data-act="save-key">Save key</button><div class="hint">Used to calculate km and drive time, check distances, and plan the most efficient route.</div></div>
  ${syncSettingsCard()}
  <div class="card"><h3>App version</h3><div class="kv"><div class="k">Version</div><div class="v">${APP_VERSION}</div></div>${S.latest ? `<div class="kv"><div class="k">Latest</div><div class="v">${h(S.latest)}${S.latest !== APP_VERSION.split(' ')[0] ? ' — <b style="color:var(--red)">tap ⟳ to update</b>' : ' ✓ up to date'}</div></div>` : ''}<div class="actions"><button class="btn small" data-act="app-refresh">⟳ Close and reopen on the latest version</button></div></div>
  ${renderChangeLog()}
  ${renderTrash()}
  <div class="card"><h3>Backup</h3><div class="actions"><button class="btn" data-act="export">Download backup</button><label class="btn">Restore backup<input type="file" accept=".json" data-act="import" style="display:none"></label></div><div class="hint">Data imported from Google Contacts on ${h(D.importedAt || '14 Oct 2026')}.</div></div>
  </div>`;
}
function editTag(t) {
  const isNew = !t; t = t || { id: uid('t'), name: '', group: 'client', photo: null };
  const src = tagPhotoSrc(t.id);
  openSheet(isNew ? 'New tag' : 'Edit tag', `<div class="f"><label>Tag name</label><input id="t-name" value="${h(t.name)}"></div>
  <div class="f"><label>Type</label><select id="t-group" ${RATING_SET.has(t.id) ? 'disabled' : ''}><option value="client" ${t.group === 'client' ? 'selected' : ''}>Contact category (sets the photo)</option><option value="additional" ${t.group === 'additional' ? 'selected' : ''}>Additional tag (no photo)</option>${RATING_SET.has(t.id) ? '<option selected>Contact category — set on the business</option>' : ''}</select></div>
  <div class="f"><label>Photo</label>${src ? `<img src="${src}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;display:block;margin-bottom:6px">` : ''}<input type="file" id="t-photo" accept="image/*">${src ? '<label style="display:block;margin-top:6px"><input type="checkbox" id="t-nophoto"> Remove photo</label>' : ''}</div>
  ${!isNew && !t.photo?.match?.(/^(a|aplus|b|c)$/) && !RATING_SET.has(t.id) ? `<button class="btn" data-act="del-tag" data-id="${t.id}" style="color:var(--red)">Delete tag</button>` : ''}`, async () => {
    const name = val('t-name'); if (!name) { toast('Enter a name'); return false; }
    t.name = name; if (!RATING_SET.has(t.id)) t.group = $('#t-group').value;
    const file = $('#t-photo').files[0]; if (file) t.photoData = await fileToDataUrl(file, 320);
    if ($('#t-nophoto') && $('#t-nophoto').checked) { t.photoData = null; t.photo = null; }
    touch(t); if (isNew) D.tags.push(t); photoCache.clear();
    return true;
  });
}

/* ---------------- Google sign-in (Drive sync + Google Contacts) ---------------- */
const CONFIG = window.BVT_CONFIG || {};
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/contacts https://www.googleapis.com/auth/userinfo.email';
const DATA_FILE = 'bovitech-contacts-data.json';
function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
const GAuth = {
  tok: null,
  valid() { if (!this.tok) { try { this.tok = JSON.parse(localStorage.getItem('bvt-tok') || 'null'); } catch (e) { } } return this.tok && Date.now() < this.tok.exp - 60000; },
  // interactive=true must be called from a tap (Google opens a small sign-in window)
  async get(interactive) {
    if (this.valid()) return this.tok.t;
    if (!interactive) throw Object.assign(new Error('signin'), { signin: true });
    if (!CONFIG.googleClientId) throw new Error('Google sign-in is not set up yet.');
    await loadScript('https://accounts.google.com/gsi/client');
    const r = await new Promise((res, rej) => {
      const c = google.accounts.oauth2.initTokenClient({ client_id: CONFIG.googleClientId, scope: SCOPES, hint: D.sync.email || 'bovitechvetservices@gmail.com', callback: (x) => (x.error ? rej(new Error(x.error)) : res(x)), error_callback: (e) => rej(new Error(e.type === 'popup_closed' ? 'Sign-in window was closed' : e.type || 'Sign-in failed')) });
      c.requestAccessToken({ prompt: D.sync.email ? '' : 'consent' });
    });
    if (!google.accounts.oauth2.hasGrantedAllScopes(r, ...SCOPES.split(' '))) throw new Error('Please tick all the boxes on the Google screen so the app can sync and update Google Contacts.');
    this.tok = { t: r.access_token, exp: Date.now() + r.expires_in * 1000 };
    try { localStorage.setItem('bvt-tok', JSON.stringify(this.tok)); } catch (e) { }
    if (!D.sync.email) { try { const u = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + r.access_token } })).json(); D.sync.email = u.email; } catch (e) { } }
    return this.tok.t;
  },
  signOut() { try { if (this.tok && window.google) google.accounts.oauth2.revoke(this.tok.t); localStorage.removeItem('bvt-tok'); } catch (e) { } this.tok = null; },
};
async function gfetch(url, opt = {}, interactive = false) {
  const t = await GAuth.get(interactive);
  const r = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), Authorization: 'Bearer ' + t } });
  if (r.status === 401) { GAuth.tok = null; try { localStorage.removeItem('bvt-tok'); } catch (e) { } throw Object.assign(new Error('signin'), { signin: true }); }
  return r;
}

/* ---------------- Google Drive sync ----------------
   One JSON file in the practice Google Drive holds everything. Each device keeps a full copy (works offline).
   Each record has _rev (bumped on every upload). On sync: download if the file changed, merge record by record,
   then upload. If the same record was changed on two devices since the last sync, it is a CONFLICT: the other
   device's version is kept for now and this device's version goes to the Jobs list to be resolved. */
const KINDS = ['contacts', 'businesses', 'tags'];
const strip = (r) => { const o = { ...r }; delete o._dirty; return o; };
const Sync = {
  state: 'idle', msg: '', timer: null, busy: false,
  enabled() { return !!CONFIG.googleClientId && !window.SEED; },
  start() {
    if (!this.enabled()) return;
    window.addEventListener('online', () => this.run(false));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.run(false); });
    setInterval(() => this.run(false), 3 * 60 * 1000);
    this.run(false);
  },
  soon() { if (!this.enabled()) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.run(false), 4000); renderSyncPill(); },
  set(state, msg = '') { this.state = state; this.msg = msg; renderSyncPill(); },
  async findFile() {
    const q = encodeURIComponent(`name='${DATA_FILE}' and trashed=false`);
    const r = await gfetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,version,modifiedTime)&orderBy=modifiedTime desc`);
    if (!r.ok) throw new Error('Drive error ' + r.status);
    return (await r.json()).files[0] || null;
  },
  async meta(id) { const r = await gfetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,version,modifiedTime,trashed`); if (r.status === 404) return null; if (!r.ok) throw new Error('Drive error ' + r.status); return r.json(); },
  async download(id) { const r = await gfetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`); if (!r.ok) throw new Error('Drive download error ' + r.status); return r.json(); },
  serial() {
    const out = { format: 1, savedAt: new Date().toISOString(), savedBy: DEVICE, settings: strip(D.settings), deleted: (D.deleted || []).map(({ id, kind, at }) => ({ id, kind, at })), dismissed: D.dismissed || {}, importedAt: D.importedAt, trash: (D.trash || []).filter((t) => Date.now() - t.at < 90 * 864e5), changelog: (D.changelog || []).slice(0, 400) };
    KINDS.forEach((k) => (out[k] = D[k].map(strip)));
    return JSON.stringify(out);
  },
  async upload(id) {
    // bump revisions of everything we are sending that changed here
    KINDS.forEach((k) => D[k].forEach((r) => { if (r._dirty) r._rev = (r._rev || 0) + 1; }));
    if (D.settings._dirty) D.settings._rev = (D.settings._rev || 0) + 1;
    const body = this.serial();
    let r;
    if (id) r = await gfetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&fields=id,version`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    else {
      const fd = new FormData();
      fd.append('metadata', new Blob([JSON.stringify({ name: DATA_FILE, mimeType: 'application/json', description: 'Bovitech Contacts app data — do not edit by hand' })], { type: 'application/json' }));
      fd.append('file', new Blob([body], { type: 'application/json' }));
      r = await gfetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,version', { method: 'POST', body: fd });
    }
    if (!r.ok) throw new Error('Drive upload error ' + r.status);
    const js = await r.json();
    KINDS.forEach((k) => D[k].forEach((x) => delete x._dirty)); delete D.settings._dirty; delete D._dismissDirty; delete D._trashDirty; delete D._logDirty;
    (D.deleted || []).forEach((x) => (x.synced = true));
    D.sync.fileId = js.id; D.sync.version = js.version; D.sync.last = Date.now();
  },
  merge(srv) {
    const delSrv = new Map((srv.deleted || []).map((x) => [x.id, x]));
    const delLocal = new Set((D.deleted || []).map((x) => x.id));
    const conflicts = D.conflicts || (D.conflicts = []);
    let changes = 0;
    KINDS.forEach((k) => {
      const local = new Map(D[k].map((r) => [r.id, r]));
      const out = [];
      (srv[k] || []).forEach((s) => {
        if (delLocal.has(s.id)) return; // deleted here; our tombstone goes up with the upload
        const l = local.get(s.id); local.delete(s.id);
        if (!l) { out.push(s); changes++; return; }
        if (!l._dirty) { if ((s._rev || 0) !== (l._rev || 0) || s._u !== l._u) changes++; out.push(s); return; }
        if ((s._rev || 0) === (l._rev || 0)) { out.push(l); return; } // only changed here
        if (JSON.stringify({ ...strip(l), _rev: 0, _u: 0, _dev: 0 }) === JSON.stringify({ ...s, _rev: 0, _u: 0, _dev: 0 })) { out.push(s); return; } // same edit both sides
        // changed on both devices → keep theirs, park ours for the user to choose
        for (let q = conflicts.length - 1; q >= 0; q--) if (conflicts[q].key === k + ':' + s.id) conflicts.splice(q, 1);
        conflicts.push({ key: k + ':' + s.id, kind: k, id: s.id, who: k === 'contacts' ? fullName(s) : s.name, mine: strip(l), mineAt: l._u, theirsAt: s._u, theirsDev: s._dev });
        out.push(s); changes++;
      });
      local.forEach((l) => {
        if (delSrv.has(l.id)) { if (l._dirty) conflicts.push({ key: k + ':' + l.id, kind: k, id: l.id, who: k === 'contacts' ? fullName(l) : l.name, mine: strip(l), mineAt: l._u, deletedElsewhere: true }); changes++; return; }
        if (!l._dirty && l._rev) l._dirty = true; // missing from server without a tombstone: put it back
        out.push(l);
      });
      D[k] = out;
    });
    if (srv.settings) { if (!D.settings._dirty || (srv.settings._u || 0) > (D.settings._u || 0)) { D.settings = srv.settings; } }
    const seen = new Set(D.deleted.map((x) => x.id)); (srv.deleted || []).forEach((x) => { if (!seen.has(x.id)) D.deleted.push({ ...x, synced: true }); });
    D.dismissed = { ...(srv.dismissed || {}), ...(D.dismissed || {}) };
    const tm = new Map(); [...(srv.trash || []), ...(D.trash || [])].forEach((t) => { const e = tm.get(t.tid); if (!e || t.removed) tm.set(t.tid, t); }); D.trash = [...tm.values()];
    const lm = new Map(); [...(srv.changelog || []), ...(D.changelog || [])].forEach((e) => { const x = lm.get(e.id); lm.set(e.id, x ? { ...e, undone: x.undone || e.undone } : e); }); D.changelog = [...lm.values()].sort((a, b) => b.at - a.at).slice(0, 400);
    if (srv.importedAt) D.importedAt = srv.importedAt;
    D.firstRun = false;
    return changes;
  },
  async run(interactive) {
    if (!this.enabled() || this.busy) return;
    if (CONFIRM) { this.soon(); return; } // don't upload changes that haven't been confirmed yet
    if (!navigator.onLine) { this.set('offline'); return; }
    if (!GAuth.valid() && !interactive) { this.set(D.sync.email ? 'signin' : 'setup'); return; }
    this.busy = true; this.set('syncing');
    try {
      await GAuth.get(interactive);
      for (let attempt = 0; attempt < 3; attempt++) {
        let meta = D.sync.fileId ? await this.meta(D.sync.fileId) : null;
        if (!meta || meta.trashed) { meta = await this.findFile(); D.sync.fileId = meta ? meta.id : null; D.sync.version = meta && D.sync.version === meta.version ? D.sync.version : null; }
        if (!meta) { // nothing in Drive yet
          if (!D.contacts.length) { this.set('empty'); break; }
          KINDS.forEach((k) => D[k].forEach((r) => (r._dirty = true))); D.settings._dirty = true;
          await this.upload(null); toast('Contacts saved to Google Drive'); break;
        }
        let changes = 0;
        if (meta.version !== D.sync.version) { const srv = await this.download(meta.id); changes = this.merge(srv); D.sync.version = meta.version; }
        if (pendingCount()) {
          const m2 = await this.meta(meta.id); // someone else saved while we merged? go round again
          if (m2.version !== meta.version) { D.sync.version = null; continue; }
          await this.upload(meta.id);
        } else D.sync.last = Date.now();
        if (changes) { photoCache.clear(); JOBS_CACHE = null; reindex(); logChanges(); migrate(); logChanges('Automatic update'); baseline(); renderAll(); }
        break;
      }
      save(); this.set(D.conflicts.length ? 'conflict' : 'ok');
      GContacts.maybeRun();
    } catch (e) {
      if (e.signin) this.set('signin'); else { this.set('error', e.message); console.error(e); }
    } finally { this.busy = false; save(); }
  },
};
function renderSyncPill() {
  const sp = $('#sync'); if (!sp || !D) return;
  const n = pendingCount(); const cf = (D.conflicts || []).length;
  let t, cls = '';
  if (window.SEED) { t = 'Preview only'; cls = 'off'; }
  else if (!Sync.enabled()) { t = 'Sync not set up'; cls = 'off'; }
  else if (cf) { t = `${cf} sync conflict${cf > 1 ? 's' : ''}`; cls = 'warn'; }
  else switch (Sync.state) {
    case 'syncing': t = 'Syncing…'; break;
    case 'offline': t = n ? `Offline · ${n} to sync` : 'Offline'; cls = n ? 'warn' : 'off'; break;
    case 'signin': t = n ? `${n} to sync — click to sync` : 'Click to sync'; cls = n ? 'warn' : 'off'; break;
    case 'setup': t = 'Sign in to sync'; cls = 'off'; break;
    case 'error': t = 'Sync error — tap'; cls = 'warn'; break;
    case 'empty': t = 'No contacts yet'; cls = 'off'; break;
    default: t = n ? `${n} to sync — click to sync` : 'Synced'; if (n) cls = 'warn';
  }
  sp.textContent = t; sp.className = 'pill ' + cls; sp.dataset.act = 'sync-now'; sp.style.cursor = 'pointer'; sp.title = Sync.msg || (D.sync.last ? 'Last synced ' + new Date(D.sync.last).toLocaleString('en-AU') : '');
}
function firstRunHtml() {
  return `<div class="d-wrap" style="max-width:560px"><h2 class="sec-h" style="font-size:26px">Welcome to Bovitech Contacts</h2>
  <div class="card"><h3>Sign in to load your contacts</h3><p>Sign in with the practice Google account (bovitechvetservices@gmail.com). Your contacts download to this device so they work offline.</p>
  <button class="btn red" data-act="g-signin" style="font-size:17px;padding:12px 18px">Sign in with Google</button><div class="hint" id="fr-msg" style="margin-top:8px">${Sync.state === 'empty' ? 'Signed in — no contacts in Google Drive yet. Load the initial data file below (only needed once, on one device).' : h(Sync.msg)}</div></div>
  <div class="card"><h3>First device only</h3><p>Load the initial data file (bovitech-initial-data.json) to put your contacts into Google Drive for everyone.</p><label class="btn">Load data file<input type="file" accept=".json" data-act="import" style="display:none"></label></div></div>`;
}
function syncSettingsCard() {
  const gp = GContacts.st;
  return `<div class="card"><h3>Sync &amp; Google</h3>
  ${window.SEED ? '<div class="hint">This is the preview file — syncing works in the installed app.</div>' : ''}
  <div class="kv"><div class="k">Google account</div><div class="v">${D.sync.email ? h(D.sync.email) : 'Not signed in'}</div></div>
  <div class="kv"><div class="k">Google Drive</div><div class="v">${D.sync.fileId ? 'Connected' : 'Not connected'}${D.sync.last ? ` · last synced ${new Date(D.sync.last).toLocaleString('en-AU')}` : ''}</div></div>
  <div class="kv"><div class="k">Changes waiting</div><div class="v">${pendingCount()}</div></div>
  ${Sync.msg ? `<div class="kv"><div class="k">Last error</div><div class="v" style="color:var(--red)">${h(Sync.msg)}</div></div>` : ''}
  <div class="actions" style="margin-top:8px"><button class="btn primary" data-act="sync-now">Sync now</button>${D.sync.email ? '<button class="btn" data-act="g-signout">Sign out</button>' : ''}</div>
  <div class="lbl" style="margin-top:14px">Google Contacts (caller photos on the phones)</div>
  <label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0"><input type="checkbox" data-act="gpush-toggle" ${gp.on ? 'checked' : ''}> <span>This device keeps Google Contacts up to date<br><span class="hint">Turn this on for one device only — the office computer is best. It copies names, numbers, emails, business and the tag photo (with CHECK WARNING) to bovitechvetservices@gmail.com, so the phones show the right photo when a client rings.</span></span></label>
  ${gp.on ? `<div class="kv"><div class="k">Status</div><div class="v">${h(gp.msg || 'Waiting')}</div></div><div class="actions"><button class="btn small" data-act="gpush-now">Update Google Contacts now</button></div>` : ''}
  <div class="f" style="margin-top:10px"><label>This device's name (shown in the change log)</label><div class="search"><input id="s-devname" value="${h(deviceName())}" placeholder="e.g. Amelia's phone"><button class="btn small" data-act="devname-save">Save</button></div></div></div>`;
}
const FRIENDLY = { first: 'First name', last: 'Surname', middle: 'Middle name', role: 'Role', links: 'Businesses', tags: 'Categories / tags', mobiles: 'Mobile', landlines: 'Landline', emails: 'Email', postal: 'Postal address', info: 'General info', warnings: 'General warnings', sideNotes: 'Side notes', dnaReason: 'Do not answer reason', starred: 'Starred', photoChoice: 'Photo', name: 'Name', rating: 'A+ to C', cats: 'Categories', pics: 'PIC', patientIds: 'Patient IDs', farms: 'Farms', primaryContact: 'Primary contact', type: 'Business type' };
function conflictDiff(cf) {
  const cur = (D[cf.kind] || []).find((r) => r.id === cf.id);
  const skip = new Set(['flags', 'infoHtml', 'ownCats', 'gid', 'gKm', 'gMin', 'gAt', 'sharedWith', 'createdAt']);
  const fields = new Set([...Object.keys(cf.mine), ...Object.keys(cur || {})].filter((k) => !k.startsWith('_') && !skip.has(k)));
  const show = (k, v) => (v == null || v === '' ? '—' : k === 'farms' ? v.map((f) => `${f.name || 'Farm'}${f.address ? ': ' + f.address : ''}${f.kmReturn != null ? ' — ' + f.kmReturn + ' km' : ''}${f.seeWarning ? ' ⚠' : ''}`).join('\n') : typeof v === 'object' ? (Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? x.value || x.name || (x.bid && IDX.biz.get(x.bid)?.name) || JSON.stringify(x) : tagName(x))).join(', ') : JSON.stringify(v)) : k === 'rating' ? tagName(v) : String(v));
  let rows = '';
  fields.forEach((k) => {
    const a = show(k, cf.mine[k]), b = cur ? show(k, cur[k]) : '(deleted)';
    if (a !== b) rows += `<div style="margin-top:8px"><div class="lbl">${h(FRIENDLY[k] || k)}</div><div class="grid2"><div class="body" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:6px;font-size:14.5px">${h(a)}</div><div class="body" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:6px;font-size:14.5px">${h(b)}</div></div></div>`;
  });
  return `<div class="grid2" style="font-weight:700;font-size:14px;margin-top:6px"><div>This device${cf.mineAt ? '<br><span class="hint">' + new Date(cf.mineAt).toLocaleString('en-AU') + '</span>' : ''}</div><div>${cf.deletedElsewhere ? 'Other device deleted it' : 'Other device' + (cf.theirsAt ? '<br><span class="hint">' + new Date(cf.theirsAt).toLocaleString('en-AU') + '</span>' : '')}</div></div>
  ${rows || '<div class="hint" style="margin-top:6px">No visible differences.</div>'}
  <div class="actions" style="margin-top:10px"><button class="btn small primary" data-act="conflict-keep" data-key="${h(cf.key)}" data-v="mine">Keep this device's version</button><button class="btn small" data-act="conflict-keep" data-key="${h(cf.key)}" data-v="theirs">${cf.deletedElsewhere ? 'Keep it deleted' : 'Keep the other version'}</button></div>`;
}
function resolveConflict(key, which) {
  const i = D.conflicts.findIndex((x) => x.key === key); if (i < 0) return; const cf = D.conflicts[i];
  if (which === 'mine') {
    const arr = D[cf.kind]; const j = arr.findIndex((r) => r.id === cf.id); const cur = j >= 0 ? arr[j] : null;
    const rec = { ...cf.mine, _rev: cur ? cur._rev : cf.mine._rev }; touch(rec);
    if (j >= 0) arr[j] = rec; else { arr.push(rec); D.deleted = D.deleted.filter((x) => x.id !== cf.id); }
  }
  D.conflicts.splice(i, 1);
}
function conflictSheet(cf) {
  openSheet('Sync conflict — ' + cf.who, `<p>This was changed on two devices before they synced. Choose which version to keep. Differences only:</p>${conflictDiff(cf)}`, () => true);
  $('#sheet-save').style.display = 'none';
}

/* ---------------- Google Contacts push (one designated device) ---------------- */
const GContacts = {
  st: (() => { try { return JSON.parse(localStorage.getItem('bvt-gpush') || '{"on":false,"done":{}}'); } catch (e) { return { on: false, done: {} }; } })(),
  running: false,
  persist() { try { localStorage.setItem('bvt-gpush', JSON.stringify(this.st)); } catch (e) { } },
  person(c) {
    const bs = bizOf(c);
    const p = {
      names: [{ givenName: c.first || '', familyName: c.last || '', middleName: c.middle && !/^\(/.test(c.middle) ? c.middle : '' }],
      phoneNumbers: [...c.mobiles.map((x) => ({ value: x.value, type: 'mobile' })), ...c.landlines.map((x) => ({ value: x.value, type: /home/i.test(x.label) ? 'home' : 'work' }))],
      emailAddresses: c.emails.map((x) => ({ value: x.value, type: /home/i.test(x.label) ? 'home' : 'work' })),
      organizations: bs.length ? bs.map((b, i) => ({ name: b.name, title: i === 0 ? c.role || '' : '' })) : c.role ? [{ title: c.role }] : [],
    };
    return p;
  },
  hash(c) { const s = JSON.stringify([this.person(c), photoSpec(c)]); let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return x.toString(36); },
  maybeRun() { if (this.st.on && !this.running && GAuth.valid()) this.run(); },
  async run() {
    if (this.running) return; this.running = true;
    const todo = D.contacts.filter((c) => this.st.done[c.id] !== this.hash(c));
    let n = 0, fails = 0;
    const msg = (m) => { this.st.msg = m; this.persist(); };
    try {
      for (const c of todo) {
        if (!this.st.on || !navigator.onLine || !GAuth.valid()) break;
        try { await this.push(c); this.st.done[c.id] = this.hash(c); n++; }
        catch (e) { if (e.signin) break; if (e.rate) { await new Promise((r) => setTimeout(r, 30000)); continue; } fails++; console.warn('Google Contacts', fullName(c), e); }
        if (n % 10 === 0) { this.persist(); msg(`Updating… ${n} of ${todo.length}`); }
        await new Promise((r) => setTimeout(r, 900)); // stay under Google's per-minute limit
      }
      msg(`${todo.length - n - fails > 0 ? `Paused — ${todo.length - n - fails} still to update. ` : 'Up to date. '}${fails ? fails + ' could not be updated.' : ''} (${new Date().toLocaleTimeString('en-AU')})`);
    } finally { this.running = false; this.persist(); if (S.tab === 'settings') renderAll(); }
  },
  async api(url, opt) {
    const r = await gfetch(url, { ...opt, headers: { 'Content-Type': 'application/json' } });
    if (r.status === 429) throw Object.assign(new Error('rate'), { rate: true });
    return r;
  },
  async push(c) {
    const body = this.person(c);
    let gid = c.gid && c.gid.startsWith('people/') ? c.gid : null, etag = null;
    if (gid) { const r = await this.api(`https://people.googleapis.com/v1/${gid}?personFields=metadata`); if (r.ok) etag = (await r.json()).etag; else if (r.status === 404) gid = null; else throw new Error('get ' + r.status); }
    if (gid) {
      const r = await this.api(`https://people.googleapis.com/v1/${gid}:updateContact?updatePersonFields=names,phoneNumbers,emailAddresses,organizations`, { method: 'PATCH', body: JSON.stringify({ ...body, etag }) });
      if (!r.ok) throw new Error('update ' + r.status);
    } else {
      const r = await this.api('https://people.googleapis.com/v1/people:createContact?personFields=metadata', { method: 'POST', body: JSON.stringify(body) });
      if (!r.ok) throw new Error('create ' + r.status);
      gid = (await r.json()).resourceName; c.gid = gid; touch(c); save();
    }
    const src = await renderPhoto(photoSpec(c), 480);
    const r = await this.api(`https://people.googleapis.com/v1/${gid}:updateContactPhoto`, { method: 'PATCH', body: JSON.stringify({ photoBytes: src.split(',')[1] }) });
    if (!r.ok) throw new Error('photo ' + r.status);
  },
};

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, d = el.dataset;
  if (a === 'sync-now' || a === 'g-signin') {
    if (window.SEED) { toast('Syncing works in the installed app, not the preview'); return; }
    if (!Sync.enabled()) { toast('Google sign-in is not set up yet'); return; }
    await Sync.run(true); if (Sync.state === 'error') toast(Sync.msg); renderAll();
  } else if (a === 'g-signout') { if (await ask('Sign out of Google on this device? Contacts stay on the device.', 'Yes — sign out')) { GAuth.signOut(); D.sync.email = null; Sync.set('setup'); save(); renderAll(); } }
  else if (a === 'gpush-toggle') { GContacts.st.on = el.checked; GContacts.persist(); renderAll(); if (el.checked) { await Sync.run(true); GContacts.maybeRun(); } }
  else if (a === 'gpush-now') { try { await GAuth.get(true); GContacts.run(); toast('Updating Google Contacts in the background'); } catch (err) { toast(err.message); } }
  else if (a === 'conflict-open') { const cf = D.conflicts.find((x) => x.key === d.key); if (cf) conflictSheet(cf); }
  else if (a === 'conflict-keep') { resolveConflict(d.key, d.v); if (SHEET) closeSheet(); S.skipConfirm = true; changed(); toast('Conflict resolved'); Sync.soon(); }
});

/* ---------------- advanced search ---------------- */
const ADV_FIELDS = [['name', 'Name'], ['business', 'Business name'], ['role', 'Role / position'], ['phone', 'Phone numbers'], ['email', 'Email'], ['postal', 'Postal address'], ['farm', 'Farm name / address / info'], ['pic', 'Property Identification Code (PIC)'], ['pid', 'Patient ID'], ['info', 'General info'], ['warnings', 'Warnings (general + farm)'], ['side', 'Side notes'], ['tags', 'Tag names']];
const ADV_MISSING = [['email', 'No email'], ['phone', 'No phone number'], ['mobile', 'No mobile'], ['business', 'No business'], ['pin', 'No farm GPS pin'], ['km', 'A farm with no km'], ['pic', 'No PIC'], ['pid', 'No patient ID'], ['rating', 'No A+ to C category'], ['primary', 'Business has no primary contact']];
function advDefault() { return { all: '', any: '', none: '', phrase: '', fields: [], tAll: [], tAny: [], tNone: [], warn: '', farmWarn: '', starred: '', multi: '', split: '', flagged: '', isPrimary: '', btype: '', missing: [], kmOp: '', kmVal: '', kmOp2: '', kmVal2: '', minOp: '', minVal: '', minOp2: '', minVal2: '', nearKm: '', near: { type: 'home' }, sort: 'first' }; }
S.adv = advDefault();
function advFieldText(c, f) {
  const bs = bizOf(c); const farms = bs.flatMap((b) => b.farms);
  switch (f) {
    case 'name': return fullName(c);
    case 'business': return bs.map((b) => b.name).join(' ');
    case 'role': return c.role || '';
    case 'phone': return [...c.mobiles, ...c.landlines].map((p) => p.value + ' ' + p.value.replace(/\D/g, '') + ' ' + p.value.replace(/\D/g, '').replace(/^61/, '0')).join(' ');
    case 'email': return c.emails.map((e) => e.value).join(' ');
    case 'postal': return c.postal.join(' ');
    case 'farm': return farms.map((x) => [x.name, x.address, x.info].join(' ')).join(' ');
    case 'pic': return bs.flatMap((b) => b.pics.map((p) => p.value + ' ' + p.label)).join(' ');
    case 'pid': return bs.flatMap((b) => b.patientIds.map((p) => p.value + ' ' + p.label)).join(' ');
    case 'info': return [c.info, ...bs.map((b) => b.info)].join(' ');
    case 'side': return [c.sideNotes, ...bs.map((b) => b.sideNotes)].join(' ');
    case 'warnings': return [c.warnings, ...bs.map((b) => b.warnings), ...farms.filter((x) => x.seeWarning).map((x) => x.warning || '')].join(' ');
    case 'tags': return [...contactTagSet(c)].map(tagName).join(' ');
  }
  return '';
}
const words = (s) => parseQuery(s).inc;
function advMatch(c, A) {
  const hay = (A.fields.length ? A.fields.map((f) => advFieldText(c, f)).join(' \u0001 ') : ADV_FIELDS.map(([f]) => advFieldText(c, f)).join(' \u0001 ')).toLowerCase();
  const wAll = words(A.all), wAny = words(A.any), wNone = words(A.none), ph = A.phrase.trim().toLowerCase();
  if (wAll.length && !wAll.every((w) => hay.includes(w))) return false;
  if (wAny.length && !wAny.some((w) => hay.includes(w))) return false;
  if (wNone.length && wNone.some((w) => hay.includes(w))) return false;
  if (ph && !hay.includes(ph)) return false;
  const ts = contactTagSet(c);
  if (A.tAll.length && !A.tAll.every((t) => ts.has(t))) return false;
  if (A.tAny.length && !A.tAny.some((t) => ts.has(t))) return false;
  if (A.tNone.length && A.tNone.some((t) => ts.has(t))) return false;
  const yn = (v, cond) => (v === '' ? true : v === 'yes' ? cond : !cond);
  const bs = bizOf(c); const farms = bs.flatMap((b) => b.farms);
  if (!yn(A.warn, hasWarning(c))) return false;
  if (!yn(A.farmWarn, farms.some((f) => f.seeWarning))) return false;
  if (!yn(A.starred, !!c.starred)) return false;
  if (!yn(A.multi, distinctRatings(c).length > 1)) return false;
  if (!yn(A.split, (photoSpec(c).parts || []).length > 1)) return false;
  if (!yn(A.flagged, jobs().some((j) => (j.kind === 'contact' && j.id === c.id) || (j.kind === 'business' && bs.some((b) => b.id === j.id))))) return false;
  if (A.btype && !bs.some((b) => (A.btype === 'client') === isClientBiz(b))) return false;
  if (!yn(A.isPrimary, bs.some((b) => primaryOf(b)?.id === c.id))) return false;
  for (const m of A.missing) {
    if (m === 'email' && c.emails.length) return false;
    if (m === 'phone' && (c.mobiles.length || c.landlines.length)) return false;
    if (m === 'mobile' && c.mobiles.length) return false;
    if (m === 'business' && bs.length) return false;
    if (m === 'pin' && farms.some((f) => f.lat != null)) return false;
    if (m === 'km' && !farms.some((f) => f.kmReturn == null)) return false;
    if (m === 'pic' && bs.some((b) => b.pics.length)) return false;
    if (m === 'pid' && bs.some((b) => b.patientIds.length)) return false;
    if (m === 'rating' && contactRatings(c).length) return false;
    if (m === 'primary' && (!bs.length || bs.every((b) => primaryOf(b)))) return false;
  }
  const farmTests = [];
  const cmp = (op, a, b) => (op === '<' ? a < b : op === '≤' ? a <= b : op === '>' ? a > b : op === '≥' ? a >= b : op === '=' ? Math.abs(a - b) < 0.5 : true);
  [['kmOp', 'kmVal', 'kmReturn'], ['kmOp2', 'kmVal2', 'kmReturn'], ['minOp', 'minVal', 'driveMin'], ['minOp2', 'minVal2', 'driveMin']].forEach(([o, v, field]) => { if (A[o] && A[v] !== '') farmTests.push((f) => f[field] != null && cmp(A[o], f[field], +A[v])); });
  if (A.nearKm !== '') { const ctr = advCentre(A); if (ctr) farmTests.push((f) => f.lat != null && hav(ctr, f) <= +A.nearKm); }
  if (farmTests.length && !farms.some((f) => farmTests.every((t) => t(f)))) return false;
  return true;
}
function advCentre(A) { if (A.near.type === 'home') return D.settings.home; const f = IDX.farms.get(A.near.fid); return f && f.lat != null ? f : null; }
function advResults() { return sortContactsBy(D.contacts.filter((c) => advMatch(c, S.adv)), S.adv.sort); }
function sortContactsBy(arr, mode) { const keep = S.sort; S.sort = mode; const r = sortContacts(arr).map((x) => x.c); S.sort = keep; return r; }
function advTagPicker(key, label) {
  const sel = S.adv[key];
  return `<div class="f"><span class="lbl">${label}</span><div class="checks">${D.tags.map((t) => `<label><input type="checkbox" data-advtag="${key}" value="${t.id}" ${sel.includes(t.id) ? 'checked' : ''}>${h(t.name)}</label>`).join('')}</div></div>`;
}
const ynSel = (key, label) => `<div class="f"><label>${label}</label><select data-adv="${key}"><option value="">Either</option><option value="yes" ${S.adv[key] === 'yes' ? 'selected' : ''}>Yes</option><option value="no" ${S.adv[key] === 'no' ? 'selected' : ''}>No</option></select></div>`;
const OPS = [['', '—'], ['<', '< less than'], ['≤', '≤ up to'], ['=', '= exactly'], ['≥', '≥ at least'], ['>', '> more than']];
const numFilter = (label, k, ph) => { const A = S.adv; const opSel = (key) => `<select data-adv="${key}" style="padding:8px;border:1px solid var(--line);border-radius:9px;font-size:16px">${OPS.map(([v, l]) => `<option value="${v}" ${A[key] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `<div class="f"><label>${label}</label><div class="search">${opSel(k + 'Op')}<input type="number" data-adv="${k}Val" value="${h(A[k + 'Val'])}" placeholder="${ph}" style="flex:1;min-width:0"></div>
  <div class="search" style="margin-top:6px"><span class="hint" style="align-self:center">and</span>${opSel(k + 'Op2')}<input type="number" data-adv="${k}Val2" value="${h(A[k + 'Val2'])}" placeholder="optional" style="flex:1;min-width:0"></div></div>`; };
function renderAdvanced() {
  const A = S.adv; const nf = A.near.type === 'farm' ? IDX.farms.get(A.near.fid) : null;
  return `<div class="d-wrap"><h2 class="sec-h" style="font-size:26px">Advanced search</h2>
  <div class="hint" style="margin:-4px 0 10px">Fill in as many or as few boxes as you like — contacts must match everything you fill in. Tip: put a phrase in "quotes" to keep words together.</div>
  <div class="card"><h3>Words</h3>
    <div class="f"><label>All of these words</label><input data-adv="all" value="${h(A.all)}" placeholder="e.g. kalgan cattle"></div>
    <div class="f"><label>Any of these words</label><input data-adv="any" value="${h(A.any)}" placeholder="e.g. narrikup porongurup"></div>
    <div class="f"><label>None of these words (exclude)</label><input data-adv="none" value="${h(A.none)}" placeholder="e.g. sold retired"></div>
    <div class="f"><label>This exact phrase</label><input data-adv="phrase" value="${h(A.phrase)}" placeholder="e.g. no kick gate"></div>
    <div class="f"><span class="lbl">Look for the words in <span class="hint">(none ticked = everywhere)</span></span><div class="checks">${ADV_FIELDS.map(([k, l]) => `<label><input type="checkbox" data-advfield value="${k}" ${A.fields.includes(k) ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
  </div>
  <details class="card" ${A.tAll.length || A.tAny.length || A.tNone.length ? 'open' : ''}><summary style="font-weight:700;cursor:pointer">Tags and contact categories</summary>
    ${advTagPicker('tAll', 'Has ALL of these')}${advTagPicker('tAny', 'Has ANY of these')}${advTagPicker('tNone', 'Has NONE of these (exclude)')}
  </details>
  <details class="card" ${['warn', 'farmWarn', 'starred', 'multi', 'split', 'flagged', 'isPrimary', 'btype'].some((k) => A[k]) ? 'open' : ''}><summary style="font-weight:700;cursor:pointer">Flags</summary><div class="grid2" style="margin-top:8px">
    ${ynSel('warn', 'Has warnings')}${ynSel('farmWarn', 'Has a farm warning')}${ynSel('starred', 'Starred')}${ynSel('multi', 'More than one A+ to C category')}${ynSel('split', 'Split photo')}${ynSel('flagged', 'On the Jobs list')}${ynSel('isPrimary', 'Is a primary contact')}<div class="f"><label>Business type</label><select data-adv="btype"><option value="">Either</option><option value="client" ${S.adv.btype === 'client' ? 'selected' : ''}>Client business</option><option value="nonclient" ${S.adv.btype === 'nonclient' ? 'selected' : ''}>Non-client (industry)</option></select></div></div>
  </details>
  <details class="card" ${A.missing.length ? 'open' : ''}><summary style="font-weight:700;cursor:pointer">Missing information</summary><div class="checks" style="margin-top:8px">${ADV_MISSING.map(([k, l]) => `<label><input type="checkbox" data-advmiss value="${k}" ${A.missing.includes(k) ? 'checked' : ''}>${l}</label>`).join('')}</div></details>
  <details class="card" ${A.kmVal || A.kmVal2 || A.minVal || A.minVal2 || A.nearKm ? 'open' : ''}><summary style="font-weight:700;cursor:pointer">Distance and location</summary>
    ${numFilter('Travel (km return)', 'km', 'e.g. 80')}
    ${numFilter('Drive time (minutes each way)', 'min', 'e.g. 45')}
    <div class="f"><label>Has a farm within (km, straight line)</label><input type="number" data-adv="nearKm" value="${h(A.nearKm)}" placeholder="e.g. 10"></div>
    <div class="f"><span class="lbl">…of</span><div class="seg"><button class="${A.near.type === 'home' ? 'on' : ''}" data-act="adv-near" data-v="home">Homebase</button><button class="${A.near.type === 'farm' ? 'on' : ''}" data-act="adv-near" data-v="farm">A client's farm</button></div>
    ${A.near.type === 'farm' ? `<input id="adv-nearsearch" placeholder="Search clients, businesses or farms" value="${nf ? h(farmLabel(nf)) : ''}" style="margin-top:6px;width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:9px"><div id="adv-nearres"></div>` : ''}</div>
  </details>
  <div class="actions"><button class="btn" data-act="adv-clear">Clear all</button><label class="row2" style="padding:0">Sort <select data-adv="sort">${[['first', 'First name'], ['last', 'Surname'], ['business', 'Business'], ['rating', 'Category A+ to C'], ['tag', 'Tag']].map(([v, l]) => `<option value="${v}" ${A.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
  <div id="adv-results">${renderAdvResults()}</div></div>`;
}
function renderAdvResults() {
  const r = advResults();
  S.advSel = S.advSel || new Set(); const ids = new Set(r.map((c) => c.id)); [...S.advSel].forEach((id) => { if (!ids.has(id)) S.advSel.delete(id); });
  const nSel = S.advSel.size; const cats = D.tags.filter((t) => t.group === 'client'), addl = D.tags.filter((t) => t.group === 'additional');
  let html = `<div class="card"><h3><input type="checkbox" class="jobcheck" data-act="adv-selall" title="Select all results" ${nSel && nSel === r.length ? 'checked' : ''}><span class="sp">${r.length} contact${r.length === 1 ? '' : 's'} found${nSel ? ` · ${nSel} selected` : ''}</span>${r.length ? `<button class="btn small" data-act="adv-route">+ Farms to route</button><button class="btn small" data-act="adv-csv">Download list</button>` : ''}</h3>
  ${nSel ? `<div class="bulkbar" style="border-radius:9px;margin:0 0 8px;justify-content:space-between"><b>${nSel} contact${nSel === 1 ? '' : 's'} selected</b><span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn primary" data-act="adv-edit" style="font-size:16px">✏️ Edit selected…</button><button class="btn small" data-act="adv-selnone">Clear selection</button></span></div>` : `<div class="hint" style="margin:-2px 0 8px">Tick contacts (or the box above to tick them all) to edit several at once.</div>`}
  <ul class="list">`;
  r.slice(0, 300).forEach((c) => { const bs = bizOf(c); html += `<li class="item ${S.advSel.has(c.id) ? 'jobsel' : ''}" data-act="open" data-kind="contact" data-id="${c.id}"><input type="checkbox" class="jobcheck" data-act="adv-sel" data-id="${c.id}" ${S.advSel.has(c.id) ? 'checked' : ''} aria-label="Select">${contactPhotoImg(c)}<div class="t"><div class="n">${c.starred ? '<span class="star">★</span> ' : ''}${h(fullName(c))}</div><div class="s">${distinctRatings(c).map(rbadge).join('')}${h(bs.map((b) => b.name).join(', ') || c.role || '')}</div></div>${hasWarning(c) ? '<span class="wdot"></span>' : ''}</li>`; });
  if (r.length > 300) html += `<li class="empty">Showing the first 300 — narrow the search, or download the full list.</li>`;
  return html + '</ul></div>';
}
const advPick = () => { const r = advResults(); return S.advSel && S.advSel.size ? r.filter((c) => S.advSel.has(c.id)) : r; }; // selected, or all results
const BULK_OPS = [
  ['setcat', 'Set category', 'give them all one category (A+ to C, Pay up front, Inactive…) or "same as business"', 'setcat'],
  ['tag-add', 'Add an additional tag', 'ICE, Check who to bill, Primary…', 'tag'],
  ['tag-remove', 'Remove an additional tag', '', 'tag'],
  ['link', 'Link them to a business', 'pick an existing business or type a new name', 'biz'],
  ['star', 'Star them', 'show at the top of the contacts list', ''],
  ['unstar', 'Unstar them', '', ''],
  ['trash', 'Move them to the trash', 'can be restored from Settings → Trash', ''],
];
function advEditSheet() {
  const list = D.contacts.filter((c) => S.advSel.has(c.id)); if (!list.length) return;
  const cats = D.tags.filter((t) => t.group === 'client'), addl = D.tags.filter((t) => t.group === 'additional');
  const sel = (id, opts) => `<select id="${id}" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:9px;font-size:16px">${opts}</select>`;
  const body = `<div class="hint" style="margin-bottom:8px">Editing: ${h(list.slice(0, 8).map(fullName).join(', '))}${list.length > 8 ? ` and ${list.length - 8} more` : ''}</div>
  <div class="lbl" style="font-size:15px">1. What do you want to change?</div>
  ${BULK_OPS.map(([op, label, hint]) => `<label class="bkop"><input type="radio" name="bkop" value="${op}"><span><b>${h(label)}</b>${hint ? `<br><span class="hint">${h(hint)}</span>` : ''}</span></label>`).join('')}
  <div id="bk-step2" style="display:none;margin-top:12px"><div class="lbl" style="font-size:15px">2. Choose</div>
    <div data-need="cat"><div class="hint" style="margin-bottom:6px">Tick one or more</div><div class="checks big">${cats.map((t) => `<label><input type="checkbox" data-bkcat="${t.id}">${h(t.name)}</label>`).join('')}</div></div>
    <div data-need="setcat"><div class="checks big" data-rtgroup="bkc">${[['=biz', 'Same as business'], ['', 'No category'], ...RATINGS.map((x) => [x, tagName(x)]), ...cats.map((t) => [t.id, t.name])].map(([v, l]) => `<label class="${v === '' || v === '=biz' || RATING_SET.has(v) ? 'rt' : ''}"><input type="checkbox" data-rt="${v}" ${v === '=biz' ? 'checked' : ''}>${h(l)}</label>`).join('')}</div>
      <div class="hint" style="margin-top:6px">Tick one — this replaces their current category.</div>
      <div id="bk-reasonwrap" style="display:none;margin-top:8px"><label class="lbl" style="color:var(--red-ink)" id="bk-reasonlbl">Reason (required)</label><textarea id="bk-reason" class="warn" style="width:100%;min-height:60px;padding:8px;border-radius:9px;border:1px solid #f3b3b6;font-size:16px"></textarea></div></div>
    <div data-need="tag"><div class="hint" style="margin-bottom:6px">Tick one or more</div><div class="checks big">${addl.map((t) => `<label><input type="checkbox" data-bktag="${t.id}">${h(t.name)}</label>`).join('')}</div></div>
    <div data-need="biz"><input id="bk-biz" list="bk-bizlist" placeholder="Start typing a business name" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:9px;font-size:16px"><datalist id="bk-bizlist">${D.businesses.map((b) => `<option value="${h(b.name)}">`).join('')}</datalist></div>
  </div>
  <div class="hint" style="margin-top:12px">Next you'll see exactly what will change for each contact before anything is saved.</div>`;
  openSheet(`Edit ${list.length} contact${list.length === 1 ? '' : 's'}`, body, async () => {
    const op = (document.querySelector('#sheet [name=bkop]:checked') || {}).value; if (!op) { toast('Choose what to change first'); return false; }
    return advBulkApply(op, list);
  });
  $('#sheet-save').textContent = 'Next — check changes';
}
document.addEventListener('change', (e) => {
  if (e.target.dataset && 'bkrating' in e.target.dataset) { document.querySelectorAll('#sheet [data-bkrating]').forEach((i) => (i.checked = i === e.target)); return; }
  if (e.target.name !== 'bkop') return; const need = BULK_OPS.find((o) => o[0] === e.target.value)[3];
  document.querySelectorAll('#sheet .bkop').forEach((l) => l.classList.toggle('on', l.contains(e.target)));
  $('#bk-step2').style.display = need ? '' : 'none'; document.querySelectorAll('#bk-step2 [data-need]').forEach((d) => (d.style.display = d.dataset.need === need ? '' : 'none'));
});
async function advBulkApply(op, list) {
  const ticked = (attr) => [...document.querySelectorAll(`#sheet [${attr}]`)].filter((i) => i.checked).map((i) => i.getAttribute(attr));
  const tagsT = ticked('data-bktag'), pickC = rtVal($('#sheet'), 'bkc');
  if (tagsT.includes('pa') && tagsT.includes('pi')) { toast('Choose Primary (active) or Primary (inactive) — not both'); return false; }
  if ((pickC === 'inactive' || pickC === 'dna') && !$('#bk-reason').value.trim()) { toast('Please add the reason'); return false; }
  if ((op === 'tag-add' || op === 'tag-remove') && !tagsT.length) { toast('Tick at least one tag'); return false; }
  let biz = null;
  if (op === 'link') { const nm = $('#bk-biz').value.trim(); if (!nm) { toast('Type or pick a business name'); return false; } biz = D.businesses.find((b) => b.name.toLowerCase() === nm.toLowerCase()); if (!biz) { if (!(await askBox('New business?', askText(`"${nm}" doesn't exist yet. Create it and link the contacts to it?`), 'Yes — create it'))) return false; biz = newBusiness(nm); } }
  if (op === 'trash') {
    if (!(await ask(`Move these ${list.length} contacts to the trash?\n\n${list.slice(0, 15).map(fullName).join(', ')}${list.length > 15 ? ` and ${list.length - 15} more` : ''}\n\nThey can be restored from Settings → Trash.`, 'Yes — move to trash', true))) return false;
    list.forEach((c) => trashContact(c)); S.advSel.clear(); NEXT_LOG_LABEL = `Search: moved ${list.length} contacts to the trash`; return true;
  }
  list.forEach((c) => {
    const before = effCats(c);
    if (op === 'setcat') {
      if (pickC === '=biz') { if (c.ownCats || c.tags.some((t) => isCatTag(t) || RATING_SET.has(t))) { c.tags = c.tags.filter((t) => !isCatTag(t) && !RATING_SET.has(t)); c.ownCats = false; touch(c); } }
      else { setOne(c, pickC); if (pickC === 'inactive' && !c.inactiveReason) c.inactiveReason = $('#bk-reason').value.trim(); if (pickC === 'dna' && !c.dnaReason) c.dnaReason = $('#bk-reason').value.trim(); }
    }
    else if (op === 'tag-add') { const add = tagsT.filter((t) => !c.tags.includes(t)); if (add.length) { if (add.includes('pa')) c.tags = c.tags.filter((t) => t !== 'pi'); if (add.includes('pi')) c.tags = c.tags.filter((t) => t !== 'pa'); c.tags.push(...add); touch(c); } }
    else if (op === 'tag-remove') { if (c.tags.some((t) => tagsT.includes(t))) { c.tags = c.tags.filter((t) => !tagsT.includes(t)); touch(c); } }
    else if (op === 'star' || op === 'unstar') { if (!!c.starred !== (op === 'star')) { c.starred = op === 'star'; touch(c); } }
    else if (op === 'link') { if (!c.links.some((l) => l.bid === biz.id)) { c.links.push({ bid: biz.id }); touch(c); } }
    const after = effCats(c);
    if (!before.includes('inactive') && after.includes('inactive')) { c.flags = c.flags || []; c.flags.push({ type: 'ezyvet', at: Date.now() }); }
    if (!before.includes('dna') && after.includes('dna') && !c.tags.includes('blockedc')) { c.flags = c.flags || []; c.flags.push({ type: 'blockcheck', at: Date.now() }); }
  });
  const label = BULK_OPS.find((o) => o[0] === op)[1] + (op === 'setcat' ? ` to ${pickC === '=biz' ? 'same as business' : pickC ? tagName(pickC) : 'no category'}` : op.startsWith('tag') ? ` ${tagsT.map((t) => `"${tagName(t)}"`).join(', ')}` : op === 'link' ? ` ${biz.name}` : '');
  NEXT_LOG_LABEL = `Search: ${label} (${list.length})`; photoCache.clear(); Sync.soon();
  const items = diffTouched(false); if (!items.length) { toast('Nothing to change — they already have that'); return false; }
  S.advSelPending = true; return true;
}
function refreshAdv() { const el = $('#adv-results'); if (el) el.innerHTML = renderAdvResults(); }
document.addEventListener('input', (e) => {
  const t = e.target; if (S.tab !== 'search') return;
  if (t.dataset.adv) { S.adv[t.dataset.adv] = t.value; clearTimeout(t._tm); t._tm = setTimeout(refreshAdv, 150); }
  else if (t.id === 'adv-nearsearch') { const res = farmSearch(t.value); $('#adv-nearres').innerHTML = t.value.trim() ? `<div class="results">${res.map((f) => `<div data-act="adv-near-pick" data-fid="${f.id}"><b>${h(farmLabel(f))}</b><div class="hint">${h(f.address || '')}</div></div>`).join('') || '<div class="hint">No farms with GPS match.</div>'}</div>` : ''; }
});
document.addEventListener('change', (e) => {
  const t = e.target; if (S.tab !== 'search') return;
  const toggle = (arr, v, on) => { const i = arr.indexOf(v); if (on && i < 0) arr.push(v); if (!on && i >= 0) arr.splice(i, 1); };
  if (t.dataset.advtag) { toggle(S.adv[t.dataset.advtag], t.value, t.checked); refreshAdv(); }
  else if ('advfield' in t.dataset) { toggle(S.adv.fields, t.value, t.checked); refreshAdv(); }
  else if ('advmiss' in t.dataset) { toggle(S.adv.missing, t.value, t.checked); refreshAdv(); }
  else if (t.tagName === 'SELECT' && t.dataset.adv) { S.adv[t.dataset.adv] = t.value; refreshAdv(); }
});
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return; const a = el.dataset.act;
  if (a === 'adv-clear') { S.adv = advDefault(); renderAll(); }
  else if (a === 'adv-near') { S.adv.near = { type: el.dataset.v }; renderAll(); }
  else if (a === 'adv-near-pick') { S.adv.near = { type: 'farm', fid: el.dataset.fid }; renderAll(); }
  else if (a === 'adv-sel') { e.stopPropagation(); el.checked ? S.advSel.add(el.dataset.id) : S.advSel.delete(el.dataset.id); refreshAdv(); }
  else if (a === 'adv-selall') { advResults().forEach((c) => (el.checked ? S.advSel.add(c.id) : S.advSel.delete(c.id))); refreshAdv(); }
  else if (a === 'adv-selnone') { S.advSel.clear(); refreshAdv(); }
  else if (a === 'adv-edit') advEditSheet();
  else if (a === 'adv-route') {
    const fids = []; advPick().forEach((c) => bizOf(c).forEach((b) => b.farms.forEach((f) => { if (f.lat != null && !fids.includes(f.id)) fids.push(f.id); })));
    const before = S.route.stops.length; fids.forEach((fid) => addStop(fid, true));
    const added = S.route.stops.length - before; toast(added ? `Added ${added} farm${added === 1 ? '' : 's'} to the route${fids.length > added ? ' (Google Maps allows 9 stops)' : ''}` : 'No farms added (route full or no GPS pins)');
  } else if (a === 'adv-csv') {
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['First name', 'Surname', 'Business', 'Category A+ to C', 'Tags', 'Mobile', 'Landline', 'Email', 'Postal', 'PIC', 'Patient IDs', 'Warnings']];
    advPick().forEach((c) => { const bs = bizOf(c); rows.push([c.first, c.last, bs.map((b) => b.name).join('; '), distinctRatings(c).map((r) => RATING_SHORT[r]).join('; '), effTags(c).filter((t) => !RATING_SET.has(t)).map(tagName).join('; '), c.mobiles.map((p) => p.value).join('; '), c.landlines.map((p) => p.value).join('; '), c.emails.map((p) => p.value).join('; '), c.postal.join('; '), bs.flatMap((b) => b.pics.map((p) => p.value)).join('; '), bs.flatMap((b) => b.patientIds.map((p) => p.value)).join('; '), c.warnings]); });
    const blob = new Blob(['﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' });
    const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = `bovitech-contacts-search-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(l); l.click(); l.remove();
  } else if (a === 'go-adv') { S.tab = 'search'; S.sel = null; renderAll(); }
});


/* ---------------- trash can (synced; restore within 90 days) ---------------- */
function toTrash(kind, rec, extra = {}) { (D.trash = D.trash || []).push({ tid: uid('t'), at: Date.now(), by: DEVICE, kind, rec: strip(rec), ...extra }); D._trashDirty = true; }
function trashContact(c) { toTrash('contact', c); logDeleted('contacts', c, D.trash[D.trash.length - 1].tid); D.contacts = D.contacts.filter((x) => x.id !== c.id); D.deleted.push({ id: c.id, kind: 'contacts', at: Date.now() }); D.businesses.forEach((b) => { if (b.primaryContact === c.id) { b.primaryContact = null; touch(b); } }); Sync.soon(); }
function trashBiz(b) {
  const linked = D.contacts.filter((c) => c.links.some((l) => l.bid === b.id)).map((c) => c.id);
  toTrash('business', b, { linked }); logDeleted('businesses', b, D.trash[D.trash.length - 1].tid);
  D.businesses = D.businesses.filter((x) => x.id !== b.id);
  D.contacts.forEach((c) => { if (c.links.some((l) => l.bid === b.id)) { c.links = c.links.filter((l) => l.bid !== b.id); touch(c); } });
  D.deleted.push({ id: b.id, kind: 'businesses', at: Date.now() }); Sync.soon();
}
function trashFarm(b, f) { toTrash('farm', f, { bid: b.id, bname: b.name }); b.farms = b.farms.filter((x) => x.id !== f.id); S.route.stops = S.route.stops.filter((s) => s.fid !== f.id); touch(b); }
function restoreTrash(tid) {
  const t = (D.trash || []).find((x) => x.tid === tid); if (!t || t.removed) return;
  // restored records get a new id so the old deletion can't remove them again on another device
  if (t.kind === 'contact') { const c = { ...t.rec, id: uid('c') }; c.links = c.links.filter((l) => IDX.biz.has(l.bid)); touch(c); D.contacts.push(c); S.sel = { kind: 'contact', id: c.id }; S.tab = 'contacts'; }
  if (t.kind === 'business') { const b = { ...t.rec, id: uid('b') }; touch(b); D.businesses.push(b); (t.linked || []).forEach((cid) => { const c = D.contacts.find((x) => x.id === cid); if (c && !c.links.some((l) => l.bid === b.id)) { c.links.push({ bid: b.id }); touch(c); } }); S.sel = { kind: 'business', id: b.id }; S.tab = 'biz'; }
  if (t.kind === 'farm') { const b = IDX.biz.get(t.bid); if (!b) { toast('Its business has been deleted — restore the business first'); return; } b.farms.push({ ...t.rec }); touch(b); S.sel = { kind: 'business', id: b.id }; S.tab = 'biz'; }
  Object.assign(t, { removed: true, rec: null }); D._trashDirty = true; S.skipConfirm = true; changed(); toast('Restored');
}
function trashLabel(t) { const r = t.rec || {}; return t.kind === 'contact' ? fullName(r) : t.kind === 'business' ? r.name : (t.bname || '') + ' — ' + (r.name || r.address || 'farm'); }
function renderTrash() {
  const items = (D.trash || []).filter((t) => !t.removed).sort((a, b) => b.at - a.at);
  return `<div class="card"><h3><span class="sp">🗑 Trash (${items.length})</span>${items.length ? '<button class="btn small" data-act="trash-empty">Empty trash</button>' : ''}</h3>
  <div class="hint" style="margin-bottom:6px">Deleted contacts, businesses and farms stay here for 90 days.</div>
  ${items.map((t) => `<div class="kv" style="align-items:center"><div class="v"><b>${h(trashLabel(t))}</b> <span class="hint">${t.kind} · deleted ${new Date(t.at).toLocaleString('en-AU')}</span></div><button class="btn small" data-act="trash-restore" data-tid="${t.tid}">Restore</button></div>`).join('') || '<div class="hint">Trash is empty.</div>'}</div>`;
}

/* ---------------- possible duplicates ---------------- */
const normBiz = (s) => (s || '').toLowerCase().replace(/\b(pty|ltd|limited|the|and|trust|trading as|t\/as|co|company|family)\b/g, '').replace(/&/g, '').replace(/[^a-z0-9]/g, '');
const normName = (c) => ((c.first || '') + (c.last || '')).toLowerCase().replace(/[^a-z]/g, '');
const lastDigits = (v) => v.replace(/\D/g, '').slice(-9);
function dupeJobs(add) {
  const seen = new Set();
  const pair = (kind, A, B, why) => {
    const key = 'dupe:' + [A.id, B.id].sort().join('|'); if (seen.has(key)) return; seen.add(key);
    const nm = kind === 'contact' ? fullName : (x) => x.name;
    add({ type: 'dupe', key, kind, id: A.id, who: nm(A) + '  ↔  ' + nm(B), note: 'Possible duplicate — ' + why, dupe: { kind, a: A.id, b: B.id } });
  };
  const group = (arr, keyFn, cb) => { const m = new Map(); arr.forEach((x) => { const k = keyFn(x); if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); m.forEach((g) => { for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) cb(g[i], g[j]); }); };
  group(D.businesses, (b) => (normBiz(b.name).length >= 3 ? normBiz(b.name) : null), (a, b) => pair('business', a, b, 'very similar business names'));
  group(D.contacts, (c) => (c.first && c.last ? normName(c) : null), (a, b) => pair('contact', a, b, 'same name'));
  const mob = []; D.contacts.forEach((c) => c.mobiles.forEach((p) => mob.push({ c, k: lastDigits(p.value) })));
  group(mob, (x) => (x.k.length === 9 ? x.k : null), (a, b) => { if (a.c !== b.c) pair('contact', a.c, b.c, 'same mobile number'); });
  const em = []; D.contacts.forEach((c) => c.emails.forEach((e) => em.push({ c, k: e.value.trim().toLowerCase() })));
  group(em, (x) => x.k || null, (a, b) => { if (a.c !== b.c) pair('contact', a.c, b.c, 'same email address'); });
}
function mergeContacts(keep, other) {
  const uni = (a, b, key) => { const out = [...a]; b.forEach((x) => { if (!out.some((y) => key(y) === key(x))) out.push(x); }); return out; };
  const join = (a, b) => [...new Set([a, b].map((x) => (x || '').trim()).filter(Boolean))].join('\n');
  keep.mobiles = uni(keep.mobiles, other.mobiles, (p) => lastDigits(p.value)); keep.landlines = uni(keep.landlines, other.landlines, (p) => lastDigits(p.value));
  keep.emails = uni(keep.emails, other.emails, (e) => e.value.toLowerCase()); keep.postal = [...new Set([...keep.postal, ...other.postal])];
  keep.tags = [...new Set([...keep.tags, ...other.tags])]; keep.links = uni(keep.links, other.links, (l) => l.bid);
  keep.info = join(keep.info, other.info); if (keep.infoHtml || other.infoHtml) keep.infoHtml = [keep.infoHtml || h(keep.info || ''), other.infoHtml || ''].filter(Boolean).join('<br>');
  keep.warnings = join(keep.warnings, other.warnings); keep.role = keep.role || other.role; keep.starred = keep.starred || other.starred; keep.gid = keep.gid || other.gid;
  D.businesses.forEach((b) => { if (b.primaryContact === other.id) { b.primaryContact = keep.id; touch(b); } });
  touch(keep); trashContact(other);
}
function mergeBiz(keep, other) {
  const join = (a, b) => [...new Set([a, b].map((x) => (x || '').trim()).filter(Boolean))].join('\n');
  keep.farms = [...keep.farms, ...other.farms]; keep.pics = [...keep.pics, ...other.pics.filter((p) => !keep.pics.some((q) => q.value === p.value))];
  keep.patientIds = [...keep.patientIds, ...other.patientIds.filter((p) => !keep.patientIds.some((q) => q.value === p.value && q.label === p.label))];
  keep.info = join(keep.info, other.info); keep.warnings = join(keep.warnings, other.warnings); keep.rating = keep.rating || other.rating; keep.primaryContact = keep.primaryContact || other.primaryContact;
  if (keep.infoHtml || other.infoHtml) keep.infoHtml = [keep.infoHtml || h(keep.info || ''), other.infoHtml || ''].filter(Boolean).join('<br>');
  D.contacts.forEach((c) => { if (c.links.some((l) => l.bid === other.id)) { c.links = c.links.filter((l) => l.bid !== other.id); if (!c.links.some((l) => l.bid === keep.id)) c.links.push({ bid: keep.id }); touch(c); } });
  touch(keep); other.farms = []; trashBiz(other);
}

/* ---------------- formatted general info ---------------- */
function cleanHtml(html) {
  const tpl = document.createElement('template'); tpl.innerHTML = html || '';
  const OK = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI', 'H3', 'MARK']);
  const walk = (node) => [...node.childNodes].forEach((n) => {
    if (n.nodeType === 1) {
      walk(n);
      if (!OK.has(n.tagName)) { const st = n.getAttribute('style') || ''; if (n.tagName === 'SPAN' && /font-weight:\s*(bold|[6-9]00)/.test(st)) { const b = document.createElement('b'); b.append(...n.childNodes); n.replaceWith(b); } else n.replaceWith(...n.childNodes); }
      else [...n.attributes].forEach((a) => n.removeAttribute(a.name));
    } else if (n.nodeType !== 3) n.remove();
  });
  walk(tpl.content); return tpl.innerHTML.trim();
}
const htmlToText = (html) => { const d = document.createElement('div'); d.innerHTML = html.replace(/<(br|\/div|\/p|\/li|\/h3)>/gi, '\n$&'); return d.textContent.replace(/\n{3,}/g, '\n\n').trim(); };
const infoView = (rec) => (rec.infoHtml ? `<div class="rich">${cleanHtml(rec.infoHtml)}</div>` : rec.info ? `<div class="body">${h(rec.info)}</div>` : '<span class="hint">Nothing yet.</span>');
function richEditor(id, rec) {
  const start = rec.infoHtml ? cleanHtml(rec.infoHtml) : h(rec.info || '').replace(/\n/g, '<br>');
  const b = (cmd, label, title, arg = '') => `<button type="button" class="btn small" data-rich="${cmd}" data-arg="${arg}" title="${title}">${label}</button>`;
  return `<div class="richbar">${b('bold', '<b>B</b>', 'Bold')}${b('italic', '<i>I</i>', 'Italic')}${b('underline', '<u>U</u>', 'Underline')}${b('formatBlock', 'Heading', 'Heading', 'h3')}${b('insertUnorderedList', '• List', 'Bullet list')}${b('insertOrderedList', '1. List', 'Numbered list')}${b('hiliteColor', '<mark>Highlight</mark>', 'Highlight')}${b('removeFormat', 'Clear', 'Remove formatting')}</div>
  <div class="rich richedit" id="${id}" contenteditable="true">${start}</div>`;
}
function readRich(id) { const el = $('#' + id); const html = cleanHtml(el.innerHTML); return { infoHtml: html, info: htmlToText(html) }; }
document.addEventListener('mousedown', (e) => { if (e.target.closest('[data-rich]')) e.preventDefault(); }); // keep the text selected
document.addEventListener('click', (e) => {
  const bt = e.target.closest('[data-rich]'); if (!bt) return;
  const cmd = bt.dataset.rich; let arg = bt.dataset.arg || null;
  if (cmd === 'hiliteColor') { const on = document.queryCommandValue('hiliteColor'); arg = on && on !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(on) ? 'transparent' : '#fff3a0'; }
  if (cmd === 'formatBlock') arg = document.queryCommandValue('formatBlock') === 'h3' ? 'div' : 'h3';
  document.execCommand(cmd, false, arg);
});

/* ---------------- change log with undo (synced) ---------------- */
const LOG_SKIP = new Set(['gid', 'gKm', 'gMin', 'gAt', 'infoHtml', 'ownCats', 'sharedWith']); // computed/duplicate fields not shown in the log
const BASE = new Map(); const TOUCHED = new Set(); let PENDING_DEL = [];
const deviceName = () => { try { return localStorage.getItem('bvt-devname') || 'Device ' + DEVICE.slice(-4); } catch (e) { return 'Device'; } };
// key-order-independent JSON so {value,label} and {label,value} count as the same
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => ((o[kk] = x[kk]), o), {}) : x));
const plain = (r) => { const o = {}; Object.keys(r).forEach((k) => { if (!k.startsWith('_')) o[k] = r[k]; }); return o; };
const recKind = (r) => (r === D.settings ? 'settings' : D.contacts.includes(r) ? 'contacts' : D.businesses.includes(r) ? 'businesses' : D.tags.includes(r) ? 'tags' : null);
const recKeyOf = (kind, r) => (kind === 'settings' ? 'settings' : kind + ':' + r.id);
const recName = (kind, r) => (kind === 'contacts' ? fullName(r) : kind === 'settings' ? 'Settings' : r.name || '');
let DISMISS_SNAP = '{}';
function revertTouched() { // put back everything changed since the last save (used when a change is cancelled)
  TOUCHED.forEach((r) => {
    const kind = recKind(r); if (!kind) return; const was = BASE.get(recKeyOf(kind, r));
    if (was === undefined) { if (kind !== 'settings') D[kind] = D[kind].filter((x) => x !== r); return; }
    const old = JSON.parse(was); Object.keys(r).forEach((k) => { if (!k.startsWith('_')) delete r[k]; }); Object.assign(r, old);
  });
  TOUCHED.clear(); try { D.dismissed = JSON.parse(DISMISS_SNAP); } catch (e) { }
}
// the "field: old → new" lines shown in the confirm pop-up and the change log
function changeRows(it) {
  const row = (label, a, b) => `<div style="font-size:14.5px"><span class="hint">${h(label)}:</span> <s style="color:var(--red-ink)">${h(String(a).slice(0, 200))}</s> → <b style="color:#0d5c20">${h(String(b).slice(0, 200))}</b></div>`;
  const names = (l) => l.map(tagName).join(', ') || 'none';
  let out = '';
  if (it.show) {
    const [cb, ca] = it.show.categories, [tb, ta] = it.show.tags, [fb, fa] = it.show.follows;
    if (cb.slice().sort().join() !== ca.slice().sort().join()) out += row('contact category', names(cb), names(ca));
    if (fb !== fa) out += row('categories', fb ? 'same as business' : 'own', fa ? 'same as business' : 'own');
    if (tb.slice().sort().join() !== ta.slice().sort().join()) out += row('additional tags', names(tb), names(ta));
  }
  Object.keys(it.after).filter((f) => !LOG_SKIP.has(f) && !(it.show && f === 'tags')).forEach((f) => { out += row(FIELD_NAMES[f] || f, fmtField(f, it.before[f]), fmtField(f, it.after[f])); });
  return out || '<div class="hint">No visible change</div>';
}
function previewHtml(items) {
  const n = items.length; const what = { contacts: 'contact', businesses: 'business', tags: 'tag', settings: 'setting' };
  return `<p style="font-size:16px">${n} ${n === 1 ? 'item' : 'items'} will change. Please check, then confirm:</p><div style="max-height:55dvh;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:6px 10px;background:#fff">${items.slice(0, 60).map((it) => `<div style="padding:6px 0;border-top:1px solid #f0ede8"><div style="font-weight:700">${h(it.name || '')} <span class="hint">${what[it.kind] || ''}</span></div>${it.created ? '<div class="hint">New — will be added</div>' : changeRows(it)}</div>`).join('')}${n > 60 ? `<div class="hint" style="padding:6px 0">…and ${n - 60} more</div>` : ''}</div>`;
}
function baseline() { DISMISS_SNAP = JSON.stringify(D.dismissed || {}); BASE.clear(); KINDS.forEach((k) => D[k].forEach((r) => BASE.set(k + ':' + r.id, stable(plain(r))))); BASE.set('settings', stable(plain(D.settings))); TOUCHED.clear(); PENDING_DEL = []; }
const FIELD_NAMES = { first: 'first name', last: 'surname', middle: 'middle name', role: 'role', links: 'businesses', tags: 'tags', mobiles: 'mobile', landlines: 'landline', emails: 'email', postal: 'postal address', info: 'general info', warnings: 'general warnings', starred: 'starred', photoChoice: 'photo', photoData: 'photo', sideNotes: 'side notes', dnaReason: 'Do not answer reason', inactiveReason: 'inactive reason', flags: 'job flags', name: 'name', rating: 'A+ to C category', pics: 'PIC', patientIds: 'patient IDs', farms: 'farms / locations', primaryContact: 'primary contact', primaryRequired: 'primary contact required', type: 'business type', group: 'tag type', photo: 'photo', home: 'homebase', mapsKey: 'Google Maps key', photoPriority: 'photo priority', createdAt: 'created' };
function diffTouched(commit) {
  const items = [];
  TOUCHED.forEach((r) => {
    const kind = recKind(r); if (!kind) return;
    const key = recKeyOf(kind, r); const now = plain(r); const nowS = stable(now); const was = BASE.get(key);
    if (was === nowS) return;
    if (commit) BASE.set(key, nowS);
    if (was === undefined) { items.push({ kind, id: r.id, name: recName(kind, r), created: true, after: now }); return; }
    const old = JSON.parse(was); const before = {}, after = {};
    new Set([...Object.keys(old), ...Object.keys(now)]).forEach((f) => { if (stable(old[f]) !== stable(now[f])) { before[f] = old[f] === undefined ? null : old[f]; after[f] = now[f] === undefined ? null : now[f]; } });
    if (!Object.keys(after).some((f) => !LOG_SKIP.has(f))) return; // only hidden fields changed
    const item = { kind, id: r.id, name: recName(kind, r), before, after };
    if (kind === 'contacts' && ('tags' in after || 'ownCats' in after)) { // show categories in plain words
      const effOf = (rec) => { const own = rec.ownCats || !(rec.links || []).length; const cats = own ? (rec.tags || []).filter(isCatTag) : [...new Set((rec.links || []).flatMap((l) => IDX.biz.get(l.bid)?.cats || []))]; const rt = (rec.tags || []).find((t) => RATING_SET.has(t)); const brt = rt ? [rt] : [...new Set((rec.links || []).map((l) => IDX.biz.get(l.bid)?.rating).filter(Boolean))]; return [...brt, ...cats]; };
      const other = (rec) => (rec.tags || []).filter((t) => !isCatTag(t) && !RATING_SET.has(t));
      item.show = { categories: [effOf(old), effOf(now)], tags: [other(old), other(now)], follows: [!old.ownCats && (old.links || []).length > 0, !now.ownCats && (now.links || []).length > 0] };
    }
    items.push(item);
  });
  return items;
}
function logChanges(label) {
  if (!D || !BASE.size) return;
  const items = diffTouched(true);
  TOUCHED.clear();
  items.push(...PENDING_DEL); PENDING_DEL = [];
  if (!items.length) return;
  (D.changelog = D.changelog || []).unshift({ id: uid('l'), at: Date.now(), dev: deviceName(), label: label || null, items });
  if (D.changelog.length > 400) D.changelog.length = 400;
  D._logDirty = true;
}
function logDeleted(kind, rec, tid) { PENDING_DEL.push({ kind, id: rec.id, name: recName(kind, rec), deleted: true, tid }); BASE.delete(kind + ':' + rec.id); }
function fmtField(f, v) {
  if (v == null || v === '') return '—';
  if (f === 'tags') return v.map(tagName).join(', ') || '—';
  if (f === 'links') return v.map((l) => IDX.biz.get(l.bid)?.name || '(deleted business)').join(', ') || '—';
  if (['mobiles', 'landlines', 'emails', 'pics', 'patientIds'].includes(f)) return v.map((x) => x.value + (x.label ? ' (' + x.label + ')' : '')).join(', ') || '—';
  if (f === 'farms') return v.length + ' — ' + v.map((x) => (x.name || x.address || 'farm') + (x.kmReturn != null ? ' ' + x.kmReturn + 'km' : '') + (x.seeWarning ? ' ⚠' : '')).join('; ');
  if (f === 'rating') return tagName(v);
  if (f === 'primaryContact') { const c = D.contacts.find((x) => x.id === v); return c ? fullName(c) : '—'; }
  if (f === 'photoData') return 'custom photo';
  if (f === 'flags') return v.map((x) => x.type).join(', ') || '—';
  if (typeof v === 'object') return Array.isArray(v) ? v.map(String).join(', ') : JSON.stringify(v);
  return String(v);
}
function entrySummary(e) {
  if (e.label) return e.label;
  if (e.items.length === 1) { const it = e.items[0]; const what = { contacts: 'contact', businesses: 'business', tags: 'tag', settings: '' }[it.kind];
    if (it.created) return `Added ${what} ${it.name}`; if (it.deleted) return `Deleted ${what} ${it.name}`;
    return `Changed ${what} ${it.name}`.replace('  ', ' ') + ' — ' + ([...new Set(Object.keys(it.after).filter((f) => !LOG_SKIP.has(f)).map((f) => (f === 'tags' && it.show ? 'categories / tags' : FIELD_NAMES[f] || f)))].join(', ') || 'categories'); }
  const n = (k) => e.items.filter((i) => i.kind === k).length;
  return 'Changed ' + [['contacts', 'contact'], ['businesses', 'business'], ['tags', 'tag'], ['settings', 'settings']].filter(([k]) => n(k)).map(([k, w]) => (k === 'settings' ? 'settings' : n(k) + ' ' + w + (n(k) > 1 ? (w === 'business' ? 'es' : 's') : ''))).join(', ');
}
function renderLogDetails(e) {
  return e.items.slice(0, 40).map((it) => `<div style="margin:6px 0 2px;font-weight:600">${h(it.name || '')}</div>` + (it.created ? '<div class="hint">Added</div>' : it.deleted ? '<div class="hint">Deleted (moved to trash)</div>' : changeRows(it))).join('') + (e.items.length > 40 ? `<div class="hint">…and ${e.items.length - 40} more</div>` : '');
}
S.logShow = 30;
function renderChangeLog() {
  const L = D.changelog || [];
  return `<div class="card"><h3><span class="sp">Change log</span></h3><div class="hint" style="margin-bottom:6px">Every change on every device, newest first. Undo puts back what was there before that change.</div>
  ${L.slice(0, S.logShow).map((e) => `<details style="border-top:1px solid #f0ede8;padding:8px 0"><summary style="cursor:pointer;list-style:none;display:flex;gap:8px;align-items:flex-start"><div style="flex:1"><div style="font-weight:600;${e.undone ? 'text-decoration:line-through;color:var(--ink3)' : ''}">${h(entrySummary(e))}</div><div class="hint">${new Date(e.at).toLocaleString('en-AU')} · ${h(e.dev || '')}${e.undone ? ' · undone' : ''}${e.undoOf ? ' · undo' : ''}</div></div>${e.undone ? '' : `<button class="btn small" data-act="log-undo" data-id="${e.id}">↶ Undo</button>`}</summary><div style="padding:4px 0 0 4px">${renderLogDetails(e)}</div></details>`).join('') || '<div class="hint">No changes yet.</div>'}
  ${L.length > S.logShow ? '<div class="actions" style="margin-top:8px"><button class="btn small" data-act="log-more">Show more</button></div>' : ''}</div>`;
}
async function undoEntry(id) {
  const e = (D.changelog || []).find((x) => x.id === id); if (!e || e.undone) return;
  const find = (it) => (it.kind === 'settings' ? D.settings : (D[it.kind] || []).find((r) => r.id === it.id));
  // has anything in this change been edited again since?
  const later = e.items.filter((it) => { const r = find(it); if (it.deleted) return false; if (it.created) return !r || stable(plain(r)) !== JSON.stringify(it.after); if (!r) return true; return Object.keys(it.after).some((f) => stable(r[f] === undefined ? null : r[f]) !== stable(it.after[f])); });
  if (!(await ask(`Undo "${entrySummary(e)}"?${later.length ? `\n\n${later.map((i) => i.name).slice(0, 5).join(', ')} ${later.length === 1 ? 'has' : 'have'} been changed again since — undo will also overwrite those later changes to the same fields.` : ''}`, 'Yes — undo it'))) return;
  const lbl = 'Undo: ' + entrySummary(e); NEXT_LOG_LABEL = lbl;
  e.items.forEach((it) => {
    const r = find(it);
    if (it.deleted) { const t = (D.trash || []).find((x) => x.tid === it.tid && !x.removed); if (t) restoreTrash(t.tid); return; }
    if (it.created) { if (!r) return; if (it.kind === 'contacts') trashContact(r); else if (it.kind === 'businesses') trashBiz(r); else if (it.kind === 'tags') { D.tags = D.tags.filter((t) => t !== r); D.deleted.push({ id: r.id, kind: 'tags', at: Date.now() }); } return; }
    if (!r) return;
    Object.keys(it.before).forEach((f) => { if (it.before[f] === null) delete r[f]; else r[f] = JSON.parse(JSON.stringify(it.before[f])); });
    touch(r);
  });
  e.undone = true; D._logDirty = true; photoCache.clear();
  NEXT_LOG_LABEL = lbl; S.skipConfirm = true; changed(); toast('Undone');
}
let NEXT_LOG_LABEL = null;
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  if (el.dataset.act === 'log-undo') { ev.preventDefault(); undoEntry(el.dataset.id); }
  if (el.dataset.act === 'log-more') { S.logShow += 50; renderAll(); }
  if (el.dataset.act === 'devname-save') { try { localStorage.setItem('bvt-devname', $('#s-devname').value.trim()); } catch (e) { } toast('Device name saved'); renderAll(); }
});

/* ---------------- refresh: close and reopen the app on the newest version ---------------- */
async function refreshApp() {
  if (!navigator.onLine) { toast("You're offline — can't check for a newer version right now"); return; }
  toast('Getting the latest version…');
  clearTimeout(saveTimer); await Store.set('data', D); // contacts and unsynced changes stay on the device
  try {
    // throw away every saved copy of the app files (not your data) and fetch fresh ones straight from GitHub
    if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
    await Promise.all(['./', 'index.html', 'app.js', 'config.js', 'sw.js', 'manifest.webmanifest', 'version.json'].map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
    if (navigator.serviceWorker) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister().catch(() => {}))); }
  } catch (e) { }
  location.replace(location.pathname + '?v=' + Date.now()); // a fresh address so nothing old can be reused
}
/* ---------------- "new version available" check ---------------- */
async function checkLatest() {
  if (window.SEED || !navigator.onLine) return;
  try {
    const v = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json();
    S.latest = v.version; const newer = v.version && v.version !== APP_VERSION.split(' ')[0];
    const b = document.querySelector('header [data-act=app-refresh]');
    if (b) { b.classList.toggle('update', newer); b.title = newer ? `Version ${v.version} is available — tap to update` : 'Close and reopen the app on the latest version'; b.innerHTML = newer ? `⟳ <b>v${APP_VERSION.split(' ')[0]}</b><span> → v${h(v.version)} available</span>` : `⟳ v${APP_VERSION.split(' ')[0]}`; }
    if (newer && !S.toldLatest) { S.toldLatest = true; toast(`A newer version (${v.version}) is ready — tap ⟳ Update`); }
  } catch (e) { }
}
setInterval(checkLatest, 10 * 60 * 1000); window.addEventListener('online', checkLatest); document.addEventListener('visibilitychange', () => { if (!document.hidden) checkLatest(); });

/* ---------------- data migrations (run on load and after sync; safe to repeat) ---------------- */
function migrate() {
  if (!D || !D.contacts.length) return false;
  let ch = false;
  const bvs = D.tags.find((t) => t.id === 'bvs'); if (bvs && bvs.name === 'Bovitech Veterinary Services') { bvs.name = 'Bovitech Veterinary Services staff'; touch(bvs); ch = true; }
  const fam = D.tags.find((t) => t.id === 'family');
  if (fam && !D.contacts.some((c) => c.tags.includes('family'))) { D.tags = D.tags.filter((t) => t.id !== 'family'); D.deleted.push({ id: 'family', kind: 'tags', at: Date.now() }); ch = true; }
  D.tags.forEach((t) => { if ((t.id === 'blockedc' || t.id === 'blockedn') && t.group !== 'additional') { t.group = 'additional'; touch(t); ch = true; } });
  D.businesses.forEach((b) => { let bt = false; b.farms.forEach((f) => {
    if (!f.seeWarning || f.warning != null) return;
    const mk = /\*{0,3}\s*(take care|warning|new)\s*\*{0,3}/i; const parts = [];
    if (mk.test(f.name || '')) { parts.push((f.name.match(mk)[1] || '').toUpperCase()); f.name = f.name.replace(mk, ' ').replace(/\s+/g, ' ').trim(); }
    if (f.info && /take care|warning|\*\*|^new$/i.test(f.info)) { parts.push(f.info.replace(/\*+/g, '').trim()); f.info = ''; }
    f.warning = [...new Set(parts.filter(Boolean))].join(' — '); bt = true; });
    if (bt) { touch(b); ch = true; } });
  if (!D.settings.bizTypesSet) {
    D.businesses.forEach((b) => {
      if (b.type) return; const cs = D.contacts.filter((c) => c.links.some((l) => l.bid === b.id));
      const industry = b.primaryRequired === false || (!b.rating && !b.pics.length && !b.patientIds.length && cs.length && cs.every((c) => c.tags.includes('industry')));
      b.type = industry ? 'nonclient' : 'client'; if (industry) b.primaryRequired = false; touch(b);
    });
    D.settings.bizTypesSet = true; touch(D.settings); ch = true;
  }
  if (D.tags.some((t) => t.id === 'sheep')) {
    D.contacts.forEach((c) => { if (c.tags.includes('sheep')) { c.tags = c.tags.filter((t) => t !== 'sheep'); if (!c.tags.includes('sheepocc') && !c.tags.includes('sheepreg')) c.tags.push('sheepocc'); c.flags = (c.flags || []).filter((f) => f.type !== 'sheep'); c.flags.push({ type: 'sheepconfirm' }); touch(c); } });
    D.tags = D.tags.filter((t) => t.id !== 'sheep'); D.deleted.push({ id: 'sheep', kind: 'tags', at: Date.now() }); ch = true;
  }
  reindex();
  if (!D.settings.nfsMoved) { // the Do-not-answer banner replaces this line in the warnings
    D.contacts.forEach((c) => { if (!c.warnings || !/\*+\s*no future service\s*\*+/i.test(c.warnings)) return; c.warnings = c.warnings.replace(/\*+\s*no future service\s*\*+/gi, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n'); touch(c); });
    D.settings.nfsMoved = true; touch(D.settings); ch = true;
  }
  if (!D.settings.catsV2) { // businesses get categories; contacts that match their business follow it
    D.businesses.forEach((b) => {
      if (b.cats) return; const cs = D.contacts.filter((c) => c.links.some((l) => l.bid === b.id)); const isC = (t) => IDX.tags.get(t)?.group === 'client';
      b.cats = [...new Set(cs.flatMap((c) => c.tags.filter(isC)))].filter((t) => cs.filter((c) => c.tags.includes(t)).length * 2 > cs.length); touch(b); // categories most of its contacts have
    });
    reindex();
    D.contacts.forEach((c) => {
      if (!c.links.length) return; const mine = c.tags.filter(isCatTag).sort().join();
      if (mine === bizCatsOf(c).sort().join()) { if (c.tags.some(isCatTag) || c.ownCats) { c.tags = c.tags.filter((t) => !isCatTag(t)); c.ownCats = false; touch(c); } }
      else if (!c.ownCats) { c.ownCats = true; touch(c); }
    });
    D.settings.catsV2 = true; touch(D.settings); ch = true;
  }
  reindex();
  if (!D.settings.oneCat && D.settings.catsV2) {
    const NF = 'Needs new facilities';
    const pickOne = (list, rec) => {
      if (!list.length) return { v: '' };
      if (list.includes('dna')) return { v: 'dna', why: list.includes('inactive') ? 'Also inactive' : '' };
      if (list.includes('inactive') || list.includes('newfac')) return { v: 'inactive', why: list.includes('newfac') ? NF : '' };
      if (list.length === 1) return { v: list[0] };
      const sorted = list.slice().sort((a, b) => prioIdx(a) - prioIdx(b)); return { v: sorted[0], review: true };
    };
    D.businesses.forEach((b) => {
      const had = [...(b.rating ? [b.rating] : []), ...(b.cats || [])]; if (had.length < 2 && !had.includes('newfac')) return;
      const p = pickOne(had); setBizCat(b, p.v);
      if (p.v === 'inactive' && p.why && !b.inactiveReason) b.inactiveReason = p.why;
      if (p.review) { b.flags = (b.flags || []).filter((f) => f.type !== 'catpick'); b.flags.push({ type: 'catpick', had, kept: p.v }); }
    });
    reindex();
    D.contacts.forEach((c) => {
      if (followsBiz(c)) { const bc = bizOf(c).filter((b) => bizCat(b) === 'inactive' && b.inactiveReason); return; }
      const had = [...(ownRating(c) ? [ownRating(c)] : []), ...c.tags.filter(isCatTag)]; if (had.length < 2 && !had.includes('newfac')) return;
      const p = pickOne(had); setOne(c, p.v);
      if (p.v === 'inactive' && p.why && !c.inactiveReason) c.inactiveReason = p.why;
      if (p.v === 'dna' && p.why && c.dnaReason && !/inactive/i.test(c.dnaReason)) { /* keep their Do-not-answer reason */ }
      if (p.review) { c.flags = (c.flags || []).filter((f) => f.type !== 'catpick'); c.flags.push({ type: 'catpick', had, kept: p.v }); touch(c); }
    });
    // "Needs new facilities" is no longer a category
    if (D.tags.some((t) => t.id === 'newfac')) { D.tags = D.tags.filter((t) => t.id !== 'newfac'); D.deleted.push({ id: 'newfac', kind: 'tags', at: Date.now() }); if (D.settings.photoPriority) D.settings.photoPriority = D.settings.photoPriority.filter((x) => x !== 'newfac'); }
    D.settings.oneCat = true; touch(D.settings); ch = true;
  }
  if (!D.settings.craigDna) {
    const cl = D.contacts.find((c) => fullName(c) === 'Craig Lock');
    if (cl) {
      const m = (cl.warnings || '').match(/^(.*?)\s*NO FUTURE SERVICE\.?\s*$/i);
      if (m) { cl.dnaReason = m[1].trim(); cl.warnings = ''; }
      setCats(cl, [...effCats(cl), 'dna']);
      if (!cl.tags.includes('blockedc')) { cl.flags = cl.flags || []; cl.flags.push({ type: 'blockcheck', at: Date.now() }); }
      touch(cl);
    }
    D.settings.craigDna = true; touch(D.settings); ch = true;
  }
  if (ch) { JOBS_CACHE = null; reindex(); photoCache.clear(); save(); }
  return ch;
}

/* ---------------- events ---------------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, d = el.dataset;
  if (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'checkbox')) return;
  if (el.tagName === 'A' && a !== 'clear') return;
  switch (a) {
    case 'tab': S.backTo = null; S.tab = d.v; if (d.v === 'contacts' && S.sel?.kind !== 'contact') S.sel = null; if (d.v === 'biz' && S.sel?.kind !== 'business') S.sel = null; document.body.classList.remove('show-detail'); renderAll(); $('#list').scrollTop = 0; break;
    case 'open': {
      if (d.kind === 'business' && S.tab === 'contacts') S.tab = 'biz';
      if (d.kind === 'contact' && S.tab === 'biz') S.tab = 'contacts';
      if (!['contacts', 'biz'].includes(S.tab)) { S.backTo = S.tab; S.tab = d.kind === 'business' ? 'biz' : 'contacts'; }
      S.sel = { kind: d.kind, id: d.id }; renderAll(); $('#detail').scrollTop = 0; break;
    }
    case 'back': case 'nav-back': navBack(); break;
    case 'quick': S.quick[d.v] = !S.quick[d.v]; renderContactList(); break;
    case 'tagf': { const cur = S.tagF[d.v]; if (!cur) S.tagF[d.v] = 'inc'; else if (cur === 'inc') S.tagF[d.v] = 'exc'; else delete S.tagF[d.v]; renderContactList(); break; }
    case 'clear': e.preventDefault(); S.q = ''; S.tagF = {}; S.quick = {}; renderContactList(); break;
    case 'star': { const c = D.contacts.find((x) => x.id === d.id); c.starred = !c.starred; touch(c); changed(); break; }
    case 'new-contact': editContact(null); break;
    case 'edit-contact': editContact(D.contacts.find((x) => x.id === d.id)); break;
    case 'new-biz': editBiz(null); break;
    case 'edit-biz': editBiz(IDX.biz.get(d.id)); break;
    case 'add-farm': editFarm(IDX.biz.get(d.bid), null); break;
    case 'edit-farm': editFarm(IDX.biz.get(d.bid), IDX.farms.get(d.fid)); break;
    case 'calc-dist': SHEET && SHEET.calc && SHEET.calc(); break;
    case 'sheet-cancel': closeSheet(); break;
    case 'sheet-save': { if (!SHEET) break; const ok = await SHEET.onSave(); if (ok !== false) { const done = await changed(); if (done) { closeSheet(); toast('Saved'); } } break; }
    case 'rep-add': { const tpl = document.querySelector(`#sheet template[data-reptpl="${d.rep}"]`); document.querySelector(`#sheet [data-repwrap="${d.rep}"]`).insertAdjacentHTML('beforeend', tpl.innerHTML); break; }
    case 'rep-del': el.closest('.rep').remove(); break;
    case 'link-biz': $('#e-links').insertAdjacentHTML('beforeend', linkRow(d.bid)); $('#e-bizsearch').value = ''; $('#e-bizres').innerHTML = ''; break;
    case 'link-newbiz': $('#e-links').insertAdjacentHTML('beforeend', linkRow(null, d.name)); $('#e-bizsearch').value = ''; $('#e-bizres').innerHTML = ''; break;
    case 'del-contact': if (await ask(`Move ${fullName(D.contacts.find((c) => c.id === d.id))} to the trash?\n\nYou can restore it from Settings → Trash.`, 'Yes — move to trash', true)) { trashContact(D.contacts.find((c) => c.id === d.id)); S.sel = null; closeSheet(); changed(); toast('Moved to trash'); } break;
    case 'del-biz': if (await ask(`Move ${IDX.biz.get(d.id).name} and its farms to the trash?\n\nIts contacts stay. You can restore it from Settings → Trash.`, 'Yes — move to trash', true)) { trashBiz(IDX.biz.get(d.id)); S.sel = null; closeSheet(); changed(); toast('Moved to trash'); } break;
    case 'del-farm': if (await ask(`Move ${IDX.farms.get(d.fid)?.name || 'this farm'} (${IDX.biz.get(d.bid).name}) to the trash?\n\nYou can restore it from Settings → Trash.`, 'Yes — move to trash', true)) { const b = IDX.biz.get(d.bid); trashFarm(b, IDX.farms.get(d.fid)); closeSheet(); changed(); toast('Moved to trash'); } break;
    case 'route-add': addStop(d.fid); break;
    case 'route-add-biz': IDX.biz.get(d.bid).farms.filter((f) => f.lat != null).forEach((f) => addStop(f.id, true)); toast('Added to route'); renderTabs(); break;
    case 'rs-up': case 'rs-down': { const i = +d.i, j = a === 'rs-up' ? i - 1 : i + 1; const s = S.route.stops; [s[i], s[j]] = [s[j], s[i]]; S.route.mode = 'order'; renderAll(); break; }
    case 'rs-del': S.route.stops.splice(+d.i, 1); renderAll(); break;
    case 'rs-pick': addStop(d.fid, true); renderAll(); setTimeout(() => $('#rs-search') && $('#rs-search').focus(), 0); break;
    case 'ep': S.route[d.w] = { type: d.v }; renderAll(); break;
    case 'ep-pick': S.route[d.w] = { type: 'farm', fid: d.fid }; renderAll(); break;
    case 'endsame': S.route.endSame = el.checked; if (!el.checked) S.route.end = { type: 'home' }; renderAll(); break;
    case 'rmode': S.route.mode = d.v; renderAll(); break;
    case 'route-go': goRoute(); break;
    case 'route-clear': S.route.stops = []; renderAll(); break;
    case 'job-open': {
      S.tab = d.kind === 'business' ? 'biz' : 'contacts'; S.sel = { kind: d.kind, id: d.id }; renderAll();
      if (d.fid) editFarm(IDX.biz.get(d.id), IDX.farms.get(d.fid)); else if (d.kind === 'contact') editContact(D.contacts.find((x) => x.id === d.id));
      break;
    }
    case 'job-dismiss': { D.dismissed = D.dismissed || {}; D.dismissed[d.key] = Date.now(); D._dismissDirty = true; Sync.soon(); const [type, fid] = d.key.split(':'); if (type === 'signfix') { const f = IDX.farms.get(fid); if (f) { f.flags = f.flags.filter((x) => x.type !== 'signfix'); touch(IDX.farmBiz.get(fid)); } } changed(); break; }
    case 'use-km': { d.fids.split(',').forEach((fid) => { const f = IDX.farms.get(fid); if (!f) return; f.kmReturn = +d.km; f.kmStatus = 'verified'; if (f.gMin != null && f.driveMin == null) f.driveMin = f.gMin; f.flags = (f.flags || []).filter((x) => x.type !== 'kmcheck'); touch(IDX.farmBiz.get(fid)); }); changed(); toast('Distance updated'); break; }
    case 'lookup-km': { const fs = d.fids.split(',').map((x) => IDX.farms.get(x)).filter((f) => f && f.lat != null); el.disabled = true; el.textContent = 'Looking up…'; try { const r = await Maps.distances(fs.map((f) => ({ lat: f.lat, lng: f.lng }))); fs.forEach((f, i) => { if (r[i]) { f.gKm = Math.ceil(r[i].km * 2 - 1e-9); f.gMin = Math.round(r[i].min); f.gAt = Date.now(); touch(IDX.farmBiz.get(f.id)); } }); changed(); } catch (err) { toast(err.message); el.disabled = false; el.textContent = 'Get Google Maps suggestion'; } break; }
    case 'pin-diff': D.dismissed = D.dismissed || {}; D.dismissed[d.key] = Date.now(); D._dismissDirty = true; Sync.soon(); changed(); break;
    case 'pin-same': {
      const keep = IDX.farms.get(d.keep), other = IDX.farms.get(d.other); const bk = IDX.farmBiz.get(keep.id), bo = IDX.farmBiz.get(other.id);
      if (bk === bo) { // same business: merge the two entries into one
        if (!(await ask(`Merge "${other.name || 'farm'}" into "${keep.name || 'farm'}" (${bk.name})?\n\nNames, info and warnings are combined and the extra entry goes to the trash.`, 'Yes — merge'))) break;
        const join = (a, b) => [...new Set([a, b].map((x) => (x || '').trim()).filter(Boolean))].join('\n');
        keep.info = join(keep.info, other.info); keep.warning = join(keep.warning, other.warning); keep.seeWarning = keep.seeWarning || other.seeWarning;
        if (!keep.address) keep.address = other.address; if (!keep.name) keep.name = other.name;
        if (keep.kmReturn == null) keep.kmReturn = other.kmReturn; if (keep.driveMin == null) keep.driveMin = other.driveMin;
        toTrash('farm', other, { bid: bk.id, bname: bk.name }); bk.farms = bk.farms.filter((f) => f.id !== other.id); S.route.stops = S.route.stops.filter((s) => s.fid !== other.id); touch(bk); toast('Farms merged');
      } else { // different businesses (e.g. a leased or share-farmed block): both keep their entry, with the same pin, km and drive time
        shareFarm(keep, other);
        D.dismissed = D.dismissed || {}; D.dismissed[d.key] = Date.now(); D._dismissDirty = true;
        toast(`Same yards used by ${bk.name} and ${bo.name} — pin, km and drive time copied.`);
      }
      changed(); break; }
    case 'prio': { const o = photoOrder(); const i = o.indexOf(d.id), j = i + +d.dir; if (i < 0 || j < 0 || j >= o.length) break; [o[i], o[j]] = [o[j], o[i]]; D.settings.photoPriority = o; touch(D.settings); photoCache.clear(); S.skipConfirm = true; changed(); break; }
    case 'prio-reset': delete D.settings.photoPriority; touch(D.settings); photoCache.clear(); changed(); break;
    case 'app-refresh': refreshApp(); break;
    case 'trash-restore': { const t = (D.trash || []).find((x) => x.tid === d.tid); if (t && await ask(`Restore ${trashLabel(t)} from the trash?`, 'Yes — restore')) restoreTrash(d.tid); break; }
    case 'trash-empty': if (await ask('Permanently delete everything in the trash?\n\nThis cannot be undone.', 'Yes — delete permanently', true)) { D.trash.forEach((t) => { if (!t.removed) Object.assign(t, { removed: true, rec: null }); }); D._trashDirty = true; changed(); } break;
    case 'dupe-not': D.dismissed = D.dismissed || {}; D.dismissed[d.key] = Date.now(); D._dismissDirty = true; Sync.soon(); changed(); break;
    case 'dupe-merge': {
      const isC = d.kind === 'contact'; const keep = isC ? D.contacts.find((x) => x.id === d.keep) : IDX.biz.get(d.keep); const other = isC ? D.contacts.find((x) => x.id === d.other) : IDX.biz.get(d.other);
      if (!keep || !other) break;
      if (!(await ask(`Merge "${isC ? fullName(other) : other.name}" into "${isC ? fullName(keep) : keep.name}"?\n\nEverything is combined into one; the extra one goes to the trash.`, 'Yes — merge'))) break;
      isC ? mergeContacts(keep, other) : mergeBiz(keep, other); changed(); toast('Merged'); break; }
    case 'biz-link-pick': { const c = D.contacts.find((x) => x.id === d.cid); if (c && !c.links.some((l) => l.bid === d.bid)) { c.links.push({ bid: d.bid }); touch(c); changed(); toast(fullName(c) + ' linked'); } break; }
    case 'biz-unlink': { const c = D.contacts.find((x) => x.id === d.cid); const b = IDX.biz.get(d.bid); if (c && await ask(`Unlink ${fullName(c)} from ${b.name}? The contact is not deleted.`)) { c.links = c.links.filter((l) => l.bid !== d.bid); if (b.primaryContact === c.id) { b.primaryContact = null; touch(b); } touch(c); changed(); } break; }
    case 'btype': S.btype = d.v; renderBizList(); break;
    case 'cat-all': { const cs = IDX.bizContacts.get(d.bid) || []; let n = 0; cs.forEach((c) => { if (catOf(c) !== d.tag) { setOne(c, d.tag); n++; } });
      NEXT_LOG_LABEL = `${d.on === '1' ? 'Gave' : 'Removed'} ${tagName(d.tag)} ${d.on === '1' ? 'to' : 'from'} everyone at ${IDX.biz.get(d.bid)?.name || ''}`; photoCache.clear(); Sync.soon(); changed(); toast('Updated ' + n + ' contact' + (n === 1 ? '' : 's')); break; }
    case 'cat-apply': { const n = applyCat(d.cid, d.at); NEXT_LOG_LABEL = `Category change copied to ${n} other contact${n === 1 ? '' : 's'}`; Sync.soon(); changed(); toast('Updated ' + n + ' contact' + (n === 1 ? '' : 's')); break; }
    case 'block-yes': setBlocked(d.cid, true); Sync.soon(); changed(); toast('Marked: Number blocked (confirmed)'); break;
    case 'block-no': setBlocked(d.cid, false); Sync.soon(); changed(); toast('Marked: Number blocked (needs confirming)'); break;
    case 'use-photo': { const c = D.contacts.find((x) => x.id === d.id); if (c) { c.photoChoice = d.tag; touch(c); changed(); toast('Photo set'); } break; }
    case 'accept-google': { const f = IDX.farms.get(d.fid); const fl = f.flags.find((x) => x.type === 'kmcheck'); f.kmReturn = fl.google; f.kmStatus = 'verified'; f.flags = f.flags.filter((x) => x.type !== 'kmcheck'); touch(IDX.farmBiz.get(f.id)); changed(); break; }
    case 'check-dist': checkAllDistances(); break;
    case 'new-tag': editTag(null); break;
    case 'edit-tag': editTag(IDX.tags.get(d.id)); break;
    case 'del-tag': if (await ask(`Delete the tag "${tagName(d.id)}"?\n\nIt will be removed from ${D.contacts.filter((c) => contactTagSet(c).has(d.id)).length} contacts.`, 'Yes — delete tag', true)) { D.tags = D.tags.filter((t) => t.id !== d.id); (D.deleted = D.deleted || []).push({ id: d.id, kind: 'tags', at: Date.now() }); D.contacts.forEach((c) => { if (c.tags.includes(d.id)) { c.tags = c.tags.filter((t) => t !== d.id); touch(c); } }); closeSheet(); changed(); } break;
    case 'save-home': { const g = parseGps(val('s-homegps')); if (!g) { toast('GPS not recognised'); break; } Object.assign(D.settings.home, { address: val('s-homeaddr'), lat: g.lat, lng: g.lng }); touch(D.settings); if (await changed()) toast('Homebase saved'); break; }
    case 'save-key': D.settings.mapsKey = val('s-mapskey'); touch(D.settings); if (await changed()) toast('Key saved'); break;
    case 'export': { const blob = new Blob([JSON.stringify(D)], { type: 'application/json' }); const u = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = u; l.download = `bovitech-contacts-backup-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(l); l.click(); l.remove(); break; }
  }
});
function addStop(fid, quiet) {
  if (S.route.stops.some((s) => s.fid === fid)) { if (!quiet) toast('Already on the route'); return; }
  if (S.route.stops.length >= MAX_STOPS) { toast('Google Maps allows up to 9 stops'); return; }
  S.route.stops.push({ fid }); if (!quiet) toast(`Added to route (${S.route.stops.length}/${MAX_STOPS})`);
}
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'q') { S.q = t.value; clearTimeout(t._tm); t._tm = setTimeout(renderContactList, 120); }
  else if (t.id === 'biz-linksearch') {
    const pq = parseQuery(t.value); const bid = t.dataset.bid; const box = $('#biz-linkres');
    const res = pq.inc.length ? D.contacts.filter((c) => !c.links.some((l) => l.bid === bid) && matchQ([fullName(c), ...c.mobiles.map((p) => p.value.replace(/\D/g, '')), ...bizOf(c).map((b) => b.name)].join(' ').toLowerCase(), pq)).slice(0, 10) : [];
    box.innerHTML = t.value.trim() ? `<div class="results">${res.map((c) => `<div data-act="biz-link-pick" data-cid="${c.id}" data-bid="${bid}"><b>${h(fullName(c))}</b> <span class="hint">${h(bizOf(c).map((b) => b.name).join(', ') || (c.mobiles[0] || {}).value || '')}</span></div>`).join('') || '<div class="hint">No matching contacts.</div>'}</div>` : '';
  }
  else if (t.id === 'bq') { S.bq = t.value; clearTimeout(t._tm); t._tm = setTimeout(renderBizList, 120); }
  else if (t.id === 'rs-search' || t.classList.contains('ep-search')) {
    const res = farmSearch(t.value); const isEp = t.classList.contains('ep-search');
    const box = isEp ? $('#ep-res-' + t.dataset.w) : $('#rs-res');
    box.innerHTML = t.value.trim() ? `<div class="results">${res.map((f) => `<div data-act="${isEp ? 'ep-pick' : 'rs-pick'}" data-fid="${f.id}" ${isEp ? `data-w="${t.dataset.w}"` : ''}><b>${h(farmLabel(f))}</b><div class="hint">${h(f.address || '')} ${f.kmReturn != null ? '· ' + fmtKm(f) : ''}</div></div>`).join('') || '<div class="hint">No farms with GPS match.</div>'}</div>` : '';
  } else if (t.classList.contains('ep-place')) { S.route[t.dataset.w] = { type: 'place', text: t.value }; }
});
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.act === 'sort') { S.sort = t.value; renderContactList(); }
  if (t.dataset.act === 'bsort') { S.bsort = t.value; renderBizList(); }
  if (t.dataset.act === 'import' && t.files[0]) {
    try { const js = JSON.parse(await t.files[0].text()); if (!js.contacts || !js.businesses) throw new Error('Not a backup file'); if (!(await ask('Replace all data on this device with this file?', 'Yes — replace'))) return;
      const keepSync = D.sync; D = js; D.sync = keepSync || {}; D.deleted = D.deleted || []; D.conflicts = []; D.dismissed = D.dismissed || {}; D.firstRun = false; D.importedAt = D.importedAt || new Date().toLocaleDateString('en-AU');
      [...D.contacts, ...D.businesses, ...D.tags, D.settings].forEach((r) => (r._dirty = true));
      reindex(); migrate(); baseline(); changed(); toast('Data loaded'); Sync.soon(); } catch (err) { toast('Could not restore: ' + err.message); }
  }
});
function net() { const n = $('#net'); n.textContent = navigator.onLine ? 'Online' : 'Offline'; n.className = 'pill' + (navigator.onLine ? '' : ' off'); }
window.addEventListener('online', net); window.addEventListener('offline', net);
window.addEventListener('popstate', () => {
  if (NAV.ignorePop) { NAV.ignorePop--; return; }
  if (CONFIRM) { closeAsk(false, true); return; } // phone Back closes a confirm pop-up first
  if (SHEET) { SHEET.popped = true; closeSheet(); return; } // back closes an open edit screen first
  navRestore();
});
document.addEventListener('scroll', (e) => { if (!NAV.last) return; if (e.target.id === 'list') NAV.last.scroll = e.target.scrollTop; if (e.target.id === 'detail') NAV.last.dscroll = e.target.scrollTop; }, true);
try { history.replaceState({ bvt: 0 }, ''); } catch (e) { }

/* ---------------- start ---------------- */
(async function init() {
  D = await Store.get('data');
  if (!D) { D = await loadSeed(); D.dismissed = D.dismissed || {}; await Store.set('data', D); }
  D.sync = D.sync || {}; D.deleted = D.deleted || []; D.conflicts = D.conflicts || []; D.trash = D.trash || [];
  reindex(); baseline(); migrate(); logChanges('Automatic update'); save();
  reindex(); net(); renderAll();
  Sync.start();
  checkLatest();
  { const b = document.querySelector('header [data-act=app-refresh]'); if (b) b.innerHTML = `⟳ v${APP_VERSION.split(' ')[0]}`; }
  if (location.search.includes('v=')) history.replaceState(history.state, '', location.pathname);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.SEED) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
    let reloaded = false; // a new version took over: reload once so it is used straight away
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded && !SHEET) { reloaded = true; location.reload(); } });
  }
})();
