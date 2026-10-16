/* Bovitech Contacts — offline-first contacts app
   Data lives on the device (IndexedDB). OneDrive sync + Google Contacts push plug in via Sync/GContacts modules (to be connected). */
'use strict';

/* ---------------- constants ---------------- */
const RATINGS = ['aplus', 'a', 'b', 'c'];
const RATING_SET = new Set(RATINGS);
const RATING_SHORT = { aplus: 'A+', a: 'A', b: 'B', c: 'C' };
// which photo wins when we must pick one automatically (user is still asked via the job list)
const PHOTO_PRIORITY = ['dna', 'blockedc', 'blockedn', 'payup', 'newfac', 'newassess', 'newmaybe', 'aplus', 'a', 'b', 'c', 'bvs', 'bfriends', 'sheepreg', 'sheepocc', 'occ', 'industry', 'prac', 'phone', 'family', 'inactive']; // default order; Inactive is overridden by every other tag
const APP_VERSION = '7.5 (16 Oct 2026)';
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
const S = {
  hideIn: (() => { try { return JSON.parse(localStorage.getItem('bvt-hideinact2') || '{}'); } catch (e) { return {}; } })(), // per list: hidden unless turned off                   // UI state
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
  D.routes = D.routes || [];
  const biz = new Map(D.businesses.map((b) => [b.id, b]));
  const tags = new Map(D.tags.map((t) => [t.id, t]));
  const farms = new Map(); const farmBiz = new Map();
  D.businesses.forEach((b) => b.farms.forEach((f) => { farms.set(f.id, f); farmBiz.set(f.id, b); }));
  const bizContacts = new Map(D.businesses.map((b) => [b.id, []]));
  const bizPast = new Map(D.businesses.map((b) => [b.id, []]));
  D.contacts.forEach((c) => c.links.forEach((l) => { const m = l.past ? bizPast : bizContacts; if (m.has(l.bid)) m.get(l.bid).push(c); }));
  IDX = { biz, tags, farms, farmBiz, bizContacts, bizPast, hay: new Map(), bhay: new Map(), personNames: new Set(D.contacts.map((c) => fullName(c).toLowerCase().trim())) };
}
// alphabetical, but names starting with a letter come before names starting with a number/symbol
const alphaKey = (str) => { const t = (str || '').trim().toLowerCase(); return (/^[a-z]/.test(t) ? '1' : '2') + t; };
const alphaCmp = (a, b) => alphaKey(a).localeCompare(alphaKey(b), 'en', { numeric: true });
const fullName = (c) => [c.first, c.middle && !/^\(/.test(c.middle) ? c.middle : '', c.last].filter(Boolean).join(' ') + (c.middle && /^\(/.test(c.middle) ? ' ' + c.middle : '');
const bizOf = (c) => c.links.filter((l) => !l.past).map((l) => IDX.biz.get(l.bid)).filter(Boolean); // current businesses only
const pastBizOf = (c) => c.links.filter((l) => l.past).map((l) => IDX.biz.get(l.bid)).filter(Boolean);
const curLinks = (c) => c.links.filter((l) => !l.past);
const roleAt = (c, bid) => ((c.links.find((l) => l.bid === bid) || {}).role || '') || c.role || ''; // role at that business, else their general role
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
function setBizCat(b, v) { if (bizCat(b) !== v && (b.flags || []).some((f) => f.type === 'catpick')) b.flags = b.flags.filter((f) => f.type !== 'catpick'); b.rating = RATING_SET.has(v) ? v : null; b.cats = v && !RATING_SET.has(v) ? [v] : []; touch(b); }
function setOne(c, v) { if (catOf(c) !== v && (c.flags || []).some((f) => f.type === 'catpick')) c.flags = c.flags.filter((f) => f.type !== 'catpick'); // give a contact exactly one category ('' = none); matching the business → follow the business
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
function toast(msg) { document.querySelectorAll('.toast').forEach((x) => x.remove()); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
/* ---------------- tap feedback: every button flashes when pressed; ⟳ buttons spin ---------------- */
function pressFx(btn) {
  if (!btn || btn.disabled) return;
  btn.classList.remove('pressed'); void btn.offsetWidth; btn.classList.add('pressed'); setTimeout(() => btn.classList.remove('pressed'), 450);
  if (btn.textContent.includes('⟳') && !btn.querySelector('.spinr')) btn.innerHTML = btn.innerHTML.replace('⟳', '<span class="spinr">⟳</span>');
  const sp = btn.querySelector('.spinr'); if (sp) { sp.classList.remove('go'); void sp.offsetWidth; sp.classList.add('go'); }
}
document.addEventListener('pointerdown', (e) => { const b = e.target.closest('button, .btn, .hbtn, .pill[data-act]'); if (b) pressFx(b); }, true);
/* ---------------- callout: a small bubble with an arrow pointing at the sync pill or the update button ---------------- */
let CALLOUT = null;
function hideCallout() { if (CALLOUT) { CALLOUT.el.remove(); clearTimeout(CALLOUT.tm); CALLOUT = null; } }
function showCallout(target, html, key) {
  if (!target || !target.getClientRects().length) return; hideCallout();
  const el = document.createElement('div'); el.className = 'callout'; el.innerHTML = `<div class="callout-arrow">⬆</div><div class="callout-body">${html}</div>`;
  document.body.appendChild(el);
  const r = target.getBoundingClientRect(); const w = el.offsetWidth; const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  el.style.left = x + 'px'; el.style.top = (r.bottom + 6) + 'px'; el.querySelector('.callout-arrow').style.left = Math.max(10, Math.min(w - 30, r.left + r.width / 2 - x - 10)) + 'px';
  CALLOUT = { el, key, tm: setTimeout(hideCallout, 12000) };
}
document.addEventListener('pointerdown', () => hideCallout(), true); // tapping anywhere (including the pill itself) closes it
window.addEventListener('resize', hideCallout);
const CALLOUT_SEEN = {}; // key → time last shown (so it is a brief nudge, not a nag)
function nudge(target, html, key, every = 10 * 60 * 1000) { if (CONFIRM || SHEET) return; if (CALLOUT_SEEN[key] && Date.now() - CALLOUT_SEEN[key] < every) return; CALLOUT_SEEN[key] = Date.now(); showCallout(target, html, key); }

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
  S.tagF = {}; S.quick = {}; // the tag/flag chips moved to Search & Bulk Edit
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
const isClientBiz = (b) => { if (b.typeLocked) return b.type !== 'nonclient'; const cat = bizCat(b); return cat ? catClass('b', cat) !== 'n' : b.type !== 'nonclient'; }; // a type chosen on the business wins; otherwise its category decides (Settings → Categories)
function setBizType(b, v) { b.type = v === 'nonclient' ? 'nonclient' : 'client'; const cat = bizCat(b); b.typeLocked = !!cat && (b.type === 'client') !== (catClass('b', cat) !== 'n'); if (b.type === 'nonclient') { b.primaryRequired = false; b.primaryContact = null; } touch(b); } // category decides (Settings → Categories); no category → the business type
const NONCLIENT_CATS = new Set(['industry', 'bvs', 'bfriends', 'phone', 'prac']); // default; changeable in Settings → Categories
const catClass = (who, cat) => { const m = ((D.settings || {}).catClass || {})[who]; return m && cat in m ? m[cat] : NONCLIENT_CATS.has(cat) ? 'n' : 'c'; }; // who: 'p' people, 'b' businesses
const isClientPerson = (c) => catClass('p', catOf(c)) !== 'n';
const PREF = (() => { try { return JSON.parse(localStorage.getItem('bvt-prefs') || '{}'); } catch (e) { return {}; } })(); // this device only
function savePref(k, v) { PREF[k] = v; try { localStorage.setItem('bvt-prefs', JSON.stringify(PREF)); } catch (e) { } }
function applyUi() { const th = PREF.theme || 'auto'; const dark = th === 'dark' || (th === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.dataset.theme = dark ? 'dark' : 'light'; document.body.style.zoom = { normal: '', large: '1.12', xl: '1.25' }[PREF.size || 'normal'] || ''; }
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyUi); } catch (e) { }
const REVIEW_LINKS_FROM = new Date('2026-10-16T00:00:00+08:00').getTime(), REVIEW_LINKS_TO = new Date('2026-10-16T21:05:00+08:00').getTime(); // links made from v6.0 onwards get reviewed
const PIC_RX = /^W[A-Z]{3}\d{4}$/;
const ROUTE_DEF = { avoidTolls: false, avoidHighways: false, avoidFerries: false, pinM: 20, kmTol: 1 };
const routeSet = () => ({ ...ROUTE_DEF, ...((D && D.settings && D.settings.route) || {}) });
const REQ_FIELDS = [['email', 'Email'], ['phone', 'Phone number (mobile or landline)'], ['mobile', 'Mobile number'], ['business', 'Linked to a business'], ['gps', 'Farm with a GPS pin'], ['pic', 'PIC'], ['pid', 'Patient ID'], ['category', 'Contact category'], ['postal', 'Postal address']];
const REQ_DEF = ['email', 'phone', 'business', 'gps', 'pic', 'pid', 'category'];
const reqOn = (k) => (D.settings.required || REQ_DEF).includes(k);
const TPL_CONTACT = '*General info*\n-\n\n*Relationships*\n-\n\n*Preg test info*\n-Frequency:\n-Type:\n-Speed:\n-Comment:\n\n*Bull test info*\n-Frequency:\n-Speed:\n-Power:\n-Comment:\n\n*Book under*\n-\n\n*WARNING*\n-';
const TPL_BIZ = '*General info*\n-\n\n*Billing*\n-\n\n*WARNING*\n-';
const TAB_DEFAULTS = { contacts: 'People', biz: 'Businesses', search: 'Search & Bulk Edit', route: 'Plan Route', jobs: 'Jobs', settings: 'Settings' };
const lab = (k) => (((D && D.settings) || {}).labels || {})[k] || TAB_DEFAULTS[k];
/* ---------- business-name helpers: matching names in text, splitting names that hold more than one business ---------- */
const coreBiz = (n) => (n || '').replace(/\([^)]*\)?/g, ' ').replace(/\b(pty\.?\s*ltd\.?|pty|ltd|limited|atf\b.*|as trustee.*|trading as.*|t\/a\b.*|ta\b .*|& co\b)/gi, ' ').toLowerCase().replace(/[^a-z0-9]/g, '');
const ROLE_RX = /^(own|own farm|own enterprise|workman|producer|& ?producer|farm manager|manager|partner'?s?|parents?.*|parent'?s farm|son in law'?s farm|her dad'?s farm|book ?keeper|coordinator'?s phone|tbc|veterinarian.*|truckie|feedlot manager|customer service|professor.*|farm worker|producer & farm worker|nutrien stockie.*|dpird biosecurity officer.*|former .*|sharefarm.*|works for|also works for|office)$/i;
function parseBizName(name) { // → [{text, role}] best guess; the person checks it
  const parts = []; let rest = name;
  rest = rest.replace(/\s*\(([^)]*)\)?/g, (m, g) => { g = g.trim(); if (g) parts.push({ text: g, paren: true }); return ' | '; });
  rest.split(/\s*\|\s*|\s*,\s*also works for\s+|\s+also works for\s+|\s+and works for\s+|\s*,\s*works for\s+|\s+and workman for\s+|\s*,\s*also\s+|\s*,\s*|\s+-\s+|\s*\/\s*|\s+&\s+(?=producer\b)/i).forEach((t) => { t = t.trim(); if (t) parts.push({ text: t }); });
  const seen = new Set(); return parts.filter((p) => { const k = p.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).map((p) => ({ text: p.text.replace(/^(at|for|and)\s+/i, ''), role: ROLE_RX.test(p.text.trim()) || /^[a-z]/.test(p.text) }));
}
const oddBizName = (n) => /[(),/]| also | works for |\bproducer\b|\bworkman\b|^truckie\b|^veterinarian\b/i.test(n || '');
function findBizByText(t, exceptId) { const k = coreBiz(t); if (k.length < 4) return null; return D.businesses.find((b) => b.id !== exceptId && coreBiz(b.name) === k) || (k.length >= 8 ? D.businesses.find((b) => b.id !== exceptId && !oddBizName(b.name) && coreBiz(b.name).length >= 8 && (coreBiz(b.name).includes(k) || k.includes(coreBiz(b.name)))) : null) || null; }
function linkEvidence(c) { // businesses this contact seems to belong to but isn't linked to
  const linked = new Set(c.links.map((l) => l.bid)); const out = new Map();
  const note = (b, why) => { if (!b || linked.has(b.id) || !(b.id)) return; if (!out.has(b.id)) out.set(b.id, { b, why: [] }); if (!out.get(b.id).why.includes(why)) out.get(b.id).why.push(why); };
  const txt = ' ' + [c.info, c.role, c.middle].join(' ').toLowerCase().replace(/\s+/g, ' ') + ' ';
  if (txt.trim()) D.businesses.forEach((b) => { if (linked.has(b.id) || oddBizName(b.name) || IDX.personNames.has(b.name.toLowerCase().trim())) return; const nm = b.name.toLowerCase().replace(/\s+/g, ' ').trim(); if (nm.length < 8 || !/[a-z]{3}/.test(nm)) return; const i = txt.indexOf(nm); if (i >= 0 && !/[a-z0-9]/.test(txt[i - 1]) && !/[a-z0-9]/.test(txt[i + nm.length] || ' ')) note(b, 'their notes mention it'); });
  c.emails.forEach((e) => { const dom = ((e.value || '').split('@')[1] || '').split('.')[0].toLowerCase(); if (dom.length < 6 || /^(gmail|bigpond|outlook|hotmail|yahoo|icloud|live|westnet|iinet|optusnet|telstra|bovitech)/.test(dom)) return;
    const cand = D.businesses.filter((b) => { const k = coreBiz(b.name); return k.length >= 6 && (k === dom || k.startsWith(dom) || dom.startsWith(k)); }); const exact = cand.filter((b) => coreBiz(b.name) === dom);
    const pick = exact.length === 1 ? exact : cand.length === 1 ? cand : []; if (!pick.length || cand.some((b) => linked.has(b.id))) return; note(pick[0], `email address @${dom}`); });
  return [...out.values()];
}
function suggestPrimary(b) { const cs = IDX.bizContacts.get(b.id) || []; if (!cs.length) return null; const nm = b.name.toLowerCase();
  const score = (c) => (c.tags.includes('pa') ? 10 : 0) + (c.tags.includes('pi') ? 3 : 0) + (c.last && nm.includes(c.last.toLowerCase()) ? 4 : 0) + (c.mobiles.length ? 1 : 0) + ((c.info || '').length > 40 ? 1 : 0) + (cs.length === 1 ? 5 : 0);
  return cs.slice().sort((x, y) => score(y) - score(x))[0]; }
const bizHasDetails = (b) => !!((b.phones || []).length || (b.emails || []).length);
const normBizName = (t) => (t || '').toLowerCase().replace(/\b(pty|ltd|the|and)\b/g, '').replace(/[^a-z0-9]/g, '');
const sameAsBizName = (c, b) => { const a = normBizName(fullName(c)), z = normBizName(b.name); return a.length >= 4 && z.length >= 4 && (a === z || (Math.min(a.length, z.length) >= 8 && (a.includes(z) || z.includes(a)))); };
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
  const bs = bizOf(c); const m = []; // which fields count is set in Settings → Required information
  if (reqOn('email') && !c.emails.length) m.push('email');
  if (reqOn('phone') && !c.mobiles.length && !c.landlines.length) m.push('phone number');
  if (reqOn('mobile') && !c.mobiles.length) m.push('mobile number');
  if (reqOn('postal') && !c.postal.length) m.push('postal address');
  if (reqOn('business') && !bs.length) m.push('business');
  if (reqOn('category') && !catOf(c)) m.push('contact category');
  if (!isClientPerson(c)) return m; // non-client people don't need farm details
  if (reqOn('gps') && bs.length && !bs.some((b) => b.farms.some((f) => f.lat != null))) m.push('farm GPS pin');
  const cb = bs.filter(isClientBiz);
  if (!bs.length || cb.length) { if (reqOn('pic') && !cb.some((b) => b.pics.length)) m.push('PIC'); if (reqOn('pid') && !cb.some((b) => b.patientIds.length)) m.push('patient ID'); }
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
    if (isClientBiz(b) && b.primaryRequired !== false && !primaryOf(b)) add({ type: 'noprimary', kind: 'business', id: b.id, who: b.name, primSuggest: (suggestPrimary(b) || {}).id, note: (IDX.bizContacts.get(b.id) || []).length ? 'Choose the primary contact (Edit business → Primary contact)' : 'No contacts linked — add a contact and make them primary' });
  });
  // two farms on the same GPS pin: same farm or different farm?
  const pinned = []; D.businesses.forEach((b) => b.farms.forEach((f) => { if (f.lat != null) pinned.push({ b, f }); }));
  for (let i = 0; i < pinned.length; i++) for (let k = i + 1; k < pinned.length; k++) {
    const A = pinned[i], B = pinned[k];
    if (Math.abs(A.f.lat - B.f.lat) > 0.01 || Math.abs(A.f.lng - B.f.lng) > 0.012) continue;
    const dkm = hav(A.f, B.f); if (dkm >= routeSet().pinM / 1000) continue; // only pins on the same spot (Settings → Travel)
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
      if (fl.type === 'ezyrestore') add({ type: 'ezyrestore', key: 'ezyrestore:' + c.id + ':' + fl.at, kind: 'contact', id: c.id, who, note: `Changed from Inactive to ${tagName(fl.to)} on ${new Date(fl.at).toLocaleDateString('en-AU')} — check the client has been restored (made active) in ezyVet` });
      if (fl.type === 'ezyvet') add({ type: 'ezyvet', key: 'ezyvet:' + c.id + ':' + fl.at, kind: 'contact', id: c.id, who, note: 'Marked inactive ' + new Date(fl.at).toLocaleDateString('en-AU') + ' — check the client has been inactivated in ezyVet' });
    });
    if (c.createdAt) { const miss = missingInfo(c); if (miss.length) add({ type: 'newinfo', kind: 'contact', id: c.id, who, note: 'Missing: ' + miss.join(', ') }); }
    (c.flags || []).forEach((fl) => { if (fl.type === 'multirating') add({ type: 'multirating', kind: 'contact', id: c.id, who, note: fl.note }); });
  });
  D.businesses.forEach((b) => (b.flags || []).forEach((fl) => { if (fl.type === 'catpick' && bizCat(b) === (fl.kept || '')) add({ type: 'catpick', key: 'catpick:' + b.id, kind: 'business', id: b.id, who: b.name, pick: { kind: 'business', id: b.id, alts: fl.had.filter((t) => t !== fl.kept) }, okLabel: 'Change to new category: ' + (fl.kept ? tagName(fl.kept) : 'no category'), note: `Had ${fl.had.map(tagName).join(' + ')} — now ${fl.kept ? tagName(fl.kept) : 'no category'}. Change it if that's not right.` }); }));
  D.contacts.forEach((c) => (c.flags || []).forEach((fl) => { if (fl.type === 'catpick' && catOf(c) === (fl.kept || '')) add({ type: 'catpick', key: 'catpick:' + c.id, kind: 'contact', id: c.id, who: fullName(c), pick: { kind: 'contact', id: c.id, alts: fl.had.filter((t) => t !== fl.kept) }, okLabel: 'Change to new category: ' + (fl.kept ? tagName(fl.kept) : 'no category'), note: `Had ${fl.had.map(tagName).join(' + ')} — now ${fl.kept ? tagName(fl.kept) : 'no category'}. Change it if that's not right.` }); }));
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
  // non-client businesses: a "contact" that is really just the business, or no way to contact them at all
  D.businesses.forEach((b) => { if (isClientBiz(b)) return; const cs = IDX.bizContacts.get(b.id) || [];
    cs.filter((c) => sameAsBizName(c, b)).forEach((c) => add({ type: 'bizonly', key: 'bizonly:' + c.id + ':' + b.id, kind: 'business', id: b.id, who: b.name, note: `The contact "${fullName(c)}" has the same name as the business. Is it actually just the business (no individual person)? If so, its phone and email can move onto the business.`, bizonly: { cid: c.id, bid: b.id } }));
    if (!cs.length && !bizHasDetails(b)) add({ type: 'biznodetails', kind: 'business', id: b.id, who: b.name, note: 'No phone, email or contact person — add a phone/email to the business, or link a contact.' }); });
  // links added recently from the Jobs list / quick link — keep, make past, or undo (person decides)
  (D.changelog || []).filter((e) => e.at >= REVIEW_LINKS_FROM && e.at < REVIEW_LINKS_TO && /link all selected|^linked /i.test(e.label || '')).forEach((e) => (e.items || []).forEach((it) => {
    if (it.kind !== 'contacts' || !it.after || !it.after.links) return; const before = new Set(((it.before || {}).links || []).map((l) => l.bid)); const c = D.contacts.find((x) => x.id === it.id); if (!c) return;
    it.after.links.filter((l) => !before.has(l.bid)).forEach((l) => { const cur = c.links.find((x) => x.bid === l.bid); const b = IDX.biz.get(l.bid); if (!cur || cur.past || !b) return;
      add({ type: 'linkreview', key: 'linkreview:' + c.id + ':' + b.id, kind: 'contact', id: c.id, who: fullName(c) + '  →  ' + b.name, note: `Linked on ${new Date(e.at).toLocaleString('en-AU')}${e.dev ? ' by ' + e.dev : ''}${before.size ? '' : ' (they had no business before)'}. Is ${c.first || fullName(c)} a current or past employee/contact of ${b.name} — or should the link be undone?`, linkRev: { cid: c.id, bid: b.id } }); });
  }));
  // contacts who look like they belong to a business they're not linked to
  D.contacts.forEach((c) => linkEvidence(c).forEach((ev) => add({ type: 'linksuggest', key: 'linksuggest:' + c.id + ':' + ev.b.id, kind: 'contact', id: c.id, who: fullName(c) + '  →  ' + ev.b.name, note: `${fullName(c)} may also belong to ${ev.b.name} (${isClientBiz(ev.b) ? 'client' : 'non-client'} business) — ${ev.why.join('; ')}. Currently linked to: ${bizOf(c).map((b) => b.name).join(', ') || 'no business'}.`, linkSug: { cid: c.id, bid: ev.b.id } })));
  // primary contacts (active or inactive) with no business
  D.contacts.forEach((c) => { if ((c.tags.includes('pa') || c.tags.includes('pi')) && !curLinks(c).length) add({ type: 'primnolink', kind: 'contact', id: c.id, who: fullName(c), note: `Tagged ${c.tags.includes('pa') ? 'Primary (active)' : 'Primary (inactive)'} but not linked to a business. Link them to their business (edit the contact), or untick the primary tag.` }); });
  // business names that hold more than one business or a role
  D.businesses.forEach((b) => { if (oddBizName(b.name)) add({ type: 'oddbiz', key: 'oddbiz:' + b.id + ':' + b.name, kind: 'business', id: b.id, who: b.name, note: `This name looks like more than one business, or a business plus a role: ${parseBizName(b.name).map((p) => (p.role ? `"${p.text}" (role/note)` : `"${p.text}"` + ((findBizByText(p.text, b.id) || {}).name ? ` → existing business ${findBizByText(p.text, b.id).name}` : ''))).join(' · ')}. Contacts: ${(IDX.bizContacts.get(b.id) || []).map(fullName).join(', ') || 'none'}.`, oddbiz: b.id }); });
  // suggested warnings: a *WARNING* section (or warning-sounding lines) in general info
  const wjob = (kind, rec, b, f, label) => { const src = f ? f.info : rec.info; const sec = warnSection(src); const extra = warnyLines(src); const txt = [sec ? sec.text : '', ...extra].filter(Boolean).join('\n'); if (!txt) return;
    const done = []; const tgt = f ? b : rec; if ((tgt.warnings || '').includes(txt.split('\n')[0])) done.push('general warning'); if ((tgt.sideNotes || '').includes(txt.split('\n')[0])) done.push('side note'); if ((f ? [f] : (kind === 'contact' ? bizOf(rec) : [rec]).flatMap((x) => x.farms)).some((x) => (x.warning || '').includes(txt.split('\n')[0]))) done.push('farm warning');
    add({ type: 'warnsug', key: 'warnsug:' + (f ? f.id : rec.id) + ':' + txt.length, kind: kind === 'contact' ? 'contact' : 'business', id: kind === 'contact' ? rec.id : b.id, fid: f ? f.id : undefined, who: label, note: (sec && sec.text ? 'Has a *WARNING* section in its general info' : 'General info sounds like a warning') + (done.length ? ` — already applied as ${done.join(' and ')}` : '') + ':', warnTxt: txt, warnSrc: { kind, id: rec.id, bid: b ? b.id : null, fid: f ? f.id : null, sec: !!sec } }); };
  D.contacts.forEach((c) => wjob('contact', c, null, null, fullName(c)));
  D.businesses.forEach((b) => { wjob('business', b, b, null, b.name); b.farms.forEach((f) => wjob('farm', b, b, f, b.name + ' — ' + (f.name || 'farm'))); });
  // PICs that don't look right (W + 3 letters + 4 numbers)
  D.businesses.forEach((b) => b.pics.forEach((p) => { const v = (p.value || '').trim(); if (v && !PIC_RX.test(v.toUpperCase())) add({ type: 'badpic', key: 'badpic:' + b.id + ':' + v, kind: 'business', id: b.id, who: b.name, note: `PIC "${v}" doesn't look right — PICs are W + 3 more letters + 4 numbers (e.g. WFAY2899).` }); }));
  // primary (active) tag on an inactive client → should be primary (inactive)
  D.contacts.forEach((c) => { if (c.tags.includes('pa') && catOf(c) === 'inactive') add({ type: 'primin', kind: 'contact', id: c.id, who: fullName(c), note: 'Tagged Primary (active) but the client is Inactive — change the tag to Primary (inactive).', primin: c.id }); });
  // every contact needs a category
  D.contacts.forEach((c) => { if (!catOf(c)) { const bs = bizOf(c); add({ type: 'nocat', kind: 'contact', id: c.id, who: fullName(c) + (bs.length ? ' (' + bs.map((b) => b.name).join(', ') + ')' : ''), note: bs.length ? 'No category — and the business has none either. Choose one.' : 'No category — choose one.', nocat: bs[0] ? bs[0].id : null }); } });
  // more than one category on a record (only one is allowed) — e.g. edited on a device still on an older version
  D.businesses.forEach((b) => { const cs = [...(b.rating ? [b.rating] : []), ...(b.cats || [])]; if (cs.length > 1) add({ type: 'multicat', key: 'multicat:' + b.id + ':' + cs.join('.'), kind: 'business', id: b.id, who: b.name, note: 'Has ' + cs.length + ' categories (' + cs.map(tagName).join(' + ') + ') — only one is allowed. Edit the business and pick one.' }); });
  D.contacts.forEach((c) => { const cs = [...new Set(c.tags.filter((t) => isCatTag(t) || RATING_SET.has(t)))]; const both = c.tags.includes('pa') && c.tags.includes('pi');
    if (cs.length > 1 || both) add({ type: 'multicat', key: 'multicat:' + c.id + ':' + cs.join('.') + (both ? ':papi' : ''), kind: 'contact', id: c.id, who: fullName(c), note: [cs.length > 1 ? 'Has ' + cs.length + ' categories (' + cs.map(tagName).join(' + ') + ') — only one is allowed' : '', both ? 'Tagged both Primary (active) and Primary (inactive)' : ''].filter(Boolean).join('. ') + '. Edit the contact and fix it.' }); });
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
  bizonly: { t: 'Non-client business — is this contact actually just the business?', manual: true, btn: 'No — it is a real person' },
  biznodetails: { t: 'Non-client business with no phone, email or contact', manual: true },
  linkreview: { t: 'Recently linked — current employee, past employee, or undo?', manual: true, btn: 'Current employee — keep' },
  warnsug: { t: 'Should this be a warning? (from general info)', manual: true, btn: 'Not a warning — leave it' },
  linksuggest: { t: 'Contact may belong to another business — link them?', manual: true, btn: 'No — not linked' },
  primnolink: { t: 'Primary contact not linked to a business', manual: true, btn: 'Leave as is' },
  oddbiz: { t: 'Business name looks like more than one business — sort it out', manual: true, btn: 'Name is fine' },
  nocat: { t: 'Contact has no category', manual: false },
  multicat: { t: 'More than one category — pick one', manual: false },
  catpick: { t: 'Category changed to one only — check it', manual: true, btn: 'Change to new category' },
  catdiff: { t: 'Contacts at the same business have different categories', manual: true, btn: 'Leave as is' },
  catprop: { t: 'Category changed — change the other contacts at the same business too?', manual: true, btn: 'No — only this contact' },
  blockcheck: { t: 'Do not answer — has the number been blocked?', manual: true },
  primin: { t: 'Inactive client tagged Primary (active) — change to Primary (inactive)', manual: false },
  badpic: { t: "PIC doesn't look right", manual: true, btn: 'Leave as is' },
  ezyrestore: { t: 'Check client has been restored in ezyVet', manual: true, btn: 'Done in ezyVet' },
  ezyvet: { t: 'Check client has been inactivated in ezyVet', manual: true, btn: 'Done in ezyVet' },
  newinfo: { t: 'New contact — information missing', manual: true, btn: 'Not needed' },
  noprimary: { t: 'Business has no primary contact', manual: true },
  sheep: { t: 'Sheep only — regular or occasional?', manual: true, btn: 'Confirmed' },
  multirating: { t: 'Specify rating for each business', manual: true },
  ratingconflict: { t: 'Business has conflicting ratings', manual: true },
  noname: { t: 'Business created from a contact name — check', manual: true },
};
let JOBS_CACHE = null;
function jobs() { if (!JOBS_CACHE) { const off = new Set(PREF.jobsOff || []); JOBS_CACHE = computeJobs().filter((j) => !off.has(j.type)); } return JOBS_CACHE; } // job types switched off in Settings are hidden on this device
function jobsFor(kind, id) { return jobs().filter((j) => j.id === id && (j.kind === kind || (kind === 'contact' && false))); }

/* ---------------- rendering: shell ---------------- */
const TABS = [['contacts', 'People'], ['biz', 'Businesses'], ['search', 'Search & Bulk Edit'], ['route', 'Plan Route'], ['jobs', 'Jobs'], ['settings', 'Settings']];
function renderTabs() {
  const n = jobs().length;
  $('#tabs').innerHTML = TABS.map(([k]) => { const l = lab(k); return `<button data-act="tab" data-v="${k}" class="${S.tab === k ? 'on' : ''}">${ICONS[k]}<span>${l}${k === 'contacts' ? ` (${D.contacts.length})` : k === 'biz' ? ` (${D.businesses.length})` : ''}</span>${k === 'jobs' && n ? `<span class="badge">${n}</span>` : ''}</button>`; }).join('');
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
  S.skipConfirm = false; if (S.advSelPending) { S.advSel.clear(); S.advSelPending = false; }
  D.contacts.forEach((c) => { const was = CATSNAP.get(c.id), now = catOf(c); if (was === 'inactive' && now && now !== 'inactive') { c.flags = (c.flags || []).filter((f) => f.type !== 'ezyrestore'); c.flags.push({ type: 'ezyrestore', at: Date.now(), to: now }); touch(c); } }); snapCats(); /* back from Inactive → check ezyVet */ logChanges(NEXT_LOG_LABEL); NEXT_LOG_LABEL = null; DISMISS_SNAP = JSON.stringify(D.dismissed || {}); save(); renderAll(); return true;
}
/* ---------------- confirm pop-up (replaces the browser's confirm box; phone Back = cancel) ---------------- */
let CONFIRM = null;
function askBox(title, html, okLabel = 'Yes — go ahead', danger = false, noLabel = "Cancel — don't change anything", altLabel = '') { // resolves true (ok), 'alt' (second choice) or false (back / cancel)
  return new Promise((res) => {
    const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'askbox'; bg.style.zIndex = 80;
    bg.innerHTML = `<div class="sheet" style="max-width:620px"><div class="sheet-h"><button class="btn" data-act="ask-no">‹ Back</button><h2>${h(title)}</h2></div><div class="form">${html}
      <div class="actions" style="margin-top:16px"><button class="btn ${danger ? 'red' : 'primary'}" data-act="ask-yes" style="font-size:17px;padding:11px 16px">${h(okLabel)}</button>${altLabel ? `<button class="btn primary" data-act="ask-alt" style="font-size:17px;padding:11px 16px">${h(altLabel)}</button>` : ''}<button class="btn" data-act="ask-no">${h(noLabel)}</button></div></div></div>`;
    document.body.appendChild(bg); CONFIRM = { res }; try { history.pushState({ ask: 1 }, ''); } catch (e) { } updateBackBtn();
  });
}
let ASK_FORM = {};
function closeAsk(v, fromPop) { if (!CONFIRM) return; const r = CONFIRM.res; CONFIRM = null; const el = $('#askbox'); ASK_FORM = {}; if (el) el.querySelectorAll('[data-ask]').forEach((x) => (ASK_FORM[x.dataset.ask] = x.value)); const ta = el && el.querySelector('textarea'); if (v === true && ta) v = ta.value.trim() || true; if (el) el.remove(); if (!fromPop) { NAV.ignorePop++; history.back(); } updateBackBtn(); r(v); }
document.addEventListener('click', (e) => { const el = e.target.closest('[data-act=ask-yes],[data-act=ask-no],[data-act=ask-alt]'); if (!el) return; e.stopPropagation(); closeAsk(el.dataset.act === 'ask-yes' ? true : el.dataset.act === 'ask-alt' ? 'alt' : false); }, true);
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
  if (SHEET) { leaveSheet(); return; }
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
  else if (S.tab === 'settings') { $('#list').innerHTML = renderSettings(); collapseSettings(); document.body.classList.remove('show-detail'); }
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
  const pt = S.ptype || 'all'; const hideIn = S.hideIn.p !== false; const all = filteredContacts().filter((c) => !hideIn || !['inactive', 'dna'].includes(catOf(c))); const rows = sortContacts(pt === 'all' ? all : all.filter((c) => (pt === 'client') === isClientPerson(c)));
  let html = `<div class="toolbar"><div class="search"><input id="q" type="search" placeholder="Search people…" title="Tip: use -word to exclude" value="${h(S.q)}" autocomplete="off"><button class="btn" data-act="go-adv" title="Advanced search">Advanced</button><button class="btn primary" data-act="new-contact">+ New</button></div>
    <div class="seg" style="margin-top:8px">${[['all', 'All'], ['client', 'Client people'], ['nonclient', 'Non-client people']].map(([v, l]) => `<button class="${pt === v ? 'on' : ''}" data-act="ptype" data-v="${v}">${l} (${v === 'all' ? D.contacts.length : D.contacts.filter((c) => (v === 'client') === isClientPerson(c)).length})</button>`).join('')}</div>
    <div class="row2"><span>${rows.length} of ${D.contacts.length} people${S.q ? ' · <a href="#" data-act="clear">clear</a>' : ''}</span>
    <label style="font-weight:600"><input type="checkbox" data-act="hideinact" data-v="p" ${hideIn ? 'checked' : ''}> Hide inactive/blocked</label><label>Sort <select data-act="sort">${[['first', 'First name'], ['last', 'Surname'], ['business', 'Business'], ['rating', 'Rating'], ['tag', 'Tag']].map(([v, l]) => `<option value="${v}" ${S.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div></div>`;
  html += '<ul class="list">';
  if (S.q.trim()) { const pq = parseQuery(S.q); const bo = D.businesses.filter((b) => bizHasDetails(b) && matchQ(bizHay(b), pq)).slice(0, 15);
    if (bo.length) { html += `<li class="group-h">Businesses (phone / email on the business)</li>`; bo.forEach((b) => { html += `<li class="item" data-act="open" data-kind="business" data-id="${b.id}"><div class="av" style="display:grid;place-items:center;background:#ece8df;font-size:20px">🏢</div><div class="t"><div class="n">${h(b.name)}</div><div class="s"><b>${isClientBiz(b) ? 'Client business' : 'Industry'}</b> · ${h(((b.phones || [])[0] || (b.emails || [])[0] || {}).value || '')}</div></div></li>`; }); html += `<li class="group-h">People</li>`; } }
  let lastG = null, shown = 0; let starredHdr = false;
  for (const { c, g } of rows) {
    if (shown > 400) { html += `<li class="empty">Showing first 400 — refine your search to see more.</li>`; break; }
    if (c.starred && !starredHdr) { html += `<li class="group-h">★ Starred</li>`; starredHdr = true; }
    if (!c.starred && g !== null && g !== lastG) { html += `<li class="group-h">${h(g)}</li>`; lastG = g; }
    if (!c.starred && g === null && starredHdr && lastG !== '__all') { html += `<li class="group-h">All people</li>`; lastG = '__all'; }
    const bs = bizOf(c); const rs = distinctRatings(c);
    const sub = [rs.map(rbadge).join(''), h(bs.map((b) => b.name).join(', ') || c.role || (c.mobiles[0] || c.landlines[0] || {}).value || '')].join('');
    html += `<li class="item ${S.sel?.id === c.id ? 'sel' : ''}" data-act="open" data-kind="contact" data-id="${c.id}">${contactPhotoImg(c)}<div class="t"><div class="n">${c.starred ? '<span class="star">★</span> ' : ''}${h(fullName(c))}</div><div class="s">${sub}</div></div>${hasWarning(c) ? '<span class="wdot" title="Has warnings"></span>' : ''}</li>`;
    shown++;
  }
  if (!rows.length) html += `<li class="empty">No people match.</li>`;
  html += '</ul>';
  list.innerHTML = html;
  if (keepFocus) { const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}

/* ---------------- business list ---------------- */
function bizHay(b) {
  if (IDX.bhay.has(b.id)) return IDX.bhay.get(b.id);
  const parts = [b.name, b.info, b.warnings, b.sideNotes, b.rating ? tagName(b.rating) : ''];
  (b.phones || []).forEach((p) => parts.push(p.value, p.value.replace(/\D/g, ''))); (b.emails || []).forEach((p) => parts.push(p.value));
  b.pics.forEach((p) => parts.push(p.value)); b.patientIds.forEach((p) => parts.push(p.label, p.value)); b.farms.forEach((f) => parts.push(f.name, f.address, f.info));
  (IDX.bizContacts.get(b.id) || []).forEach((c) => parts.push(fullName(c)));
  const s = parts.filter(Boolean).join(' \u0001 ').toLowerCase(); IDX.bhay.set(b.id, s); return s;
}
function renderBizList() {
  const keepFocus = document.activeElement && document.activeElement.id === 'bq';
  const pq = parseQuery(S.bq);
  const bt = S.btype || 'all';
  const hideIn = S.hideIn.b !== false;
  let rows = D.businesses.filter((b) => matchQ(bizHay(b), pq) && (bt === 'all' || (bt === 'client') === isClientBiz(b)) && (!hideIn || !['inactive', 'dna'].includes(bizCat(b))));
  rows.sort((a, b) => (S.bsort === 'rating' ? (RATINGS.indexOf(a.rating) + 10) % 14 - (RATINGS.indexOf(b.rating) + 10) % 14 : 0) || alphaCmp(a.name, b.name));
  let html = `<div class="toolbar"><div class="search"><input id="bq" type="search" placeholder="Search businesses…" title="Tip: use -word to exclude" value="${h(S.bq)}" autocomplete="off"><button class="btn" data-act="go-adv-biz" title="Advanced search">Advanced</button><button class="btn primary" data-act="new-biz">+ New</button></div>
    <div class="seg" style="margin-top:8px">${[['all', 'All'], ['client', 'Client businesses'], ['nonclient', 'Non-client businesses']].map(([v, l]) => `<button class="${bt === v ? 'on' : ''}" data-act="btype" data-v="${v}">${l} (${D.businesses.filter((b) => v === 'all' || (v === 'client') === isClientBiz(b)).length})</button>`).join('')}</div>
    <div class="row2"><span>${rows.length} of ${D.businesses.length} businesses${S.bq ? ' · <a href="#" data-act="bclear">clear</a>' : ''}</span><label style="font-weight:600"><input type="checkbox" data-act="hideinact" data-v="b" ${hideIn ? 'checked' : ''}> Hide inactive/blocked</label><label>Sort <select data-act="bsort"><option value="name">Name</option><option value="rating" ${S.bsort === 'rating' ? 'selected' : ''}>Rating</option></select></label></div></div><ul class="list">`;
  rows.slice(0, 400).forEach((b) => {
    const cs = IDX.bizContacts.get(b.id) || [];
    const flagged = jobs().some((j) => j.kind === 'business' && j.id === b.id);
    html += `<li class="item ${S.sel?.id === b.id ? 'sel' : ''}" data-act="open" data-kind="business" data-id="${b.id}">${contactPhotoImg(bizPseudo(b))}<div class="t"><div class="n">${b.rating ? rbadge(b.rating) : ''}${h(b.name)}</div><div class="s">${isClientBiz(b) ? '' : '<b>Industry</b> · '}${cs.length} contact${cs.length === 1 ? '' : 's'} · ${b.farms.length} ${isClientBiz(b) ? 'farm' + (b.farms.length === 1 ? '' : 's') : 'location' + (b.farms.length === 1 ? '' : 's')}${cs.length ? ' · ' + h(cs.map((c) => c.first).join(', ')) : ''}</div></div>${flagged ? `<span style="color:var(--red)" title="Needs attention">${ICONS.flag}</span>` : ''}${b.warnings ? '<span class="wdot"></span>' : ''}</li>`;
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
function phoneLinks(list, sms, callLbl = 'call client') {
  return list.map((p) => `<div class="kv"><div class="k">${h(p.label || '')}</div><div class="v"><a href="tel:${h(p.value.replace(/[^\d+]/g, ''))}">${h(p.value)}</a> · <a href="tel:${h(p.value.replace(/[^\d+]/g, ''))}">${callLbl}</a>${sms ? ` · <a href="sms:${h(p.value.replace(/[^\d+]/g, ''))}">send SMS</a>` : ''}</div></div>`).join('');
}
function flagLines(kind, id, fid) {
  return jobs().filter((j) => j.kind === kind && j.id === id && (fid === undefined || j.fid === fid)).map(flagJob).join('');
}
// a job shown on the contact / business itself: tap it to open the same buttons as on the Jobs list
const flagJob = (j) => `<details class="flagjob" ${S.flagOpen === j.key ? 'open' : ''} data-fk="${h(j.key)}"><summary class="flagline"><span style="color:var(--red)">${ICONS.flag}</span><div style="flex:1">${h(j.note)}</div><span class="hint" style="white-space:nowrap">Fix ▸</span></summary><div class="flagbody">${jobItemHtml(j, true)}</div></details>`;
document.addEventListener('toggle', (e) => { const d = e.target; if (d.classList && d.classList.contains('flagjob')) { if (d.open) S.flagOpen = d.dataset.fk; else if (S.flagOpen === d.dataset.fk) S.flagOpen = null; } }, true);
const inactiveBox = (r) => `<div class="inactivebox"><div style="font-family:var(--cond);font-size:20px;letter-spacing:.4px">INACTIVE CLIENT</div>${r ? `<div class="body" style="margin-top:2px">${h(r)}</div>` : '<div style="opacity:.9;font-size:14px">No reason recorded yet — tap Edit to add one.</div>'}</div>`;
const dnaReasonBox = (r) => `<div class="dnareason"><div class="lbl" style="color:var(--red-ink)">Reason</div>${r ? `<div class="body">${h(r)}</div>` : '<div class="hint">No reason recorded yet — tap Edit to add one (e.g. bad debtor, not the client for us, don\'t feel safe).</div>'}</div>`;
/* ---------------- ICE (in case of emergency) contacts for Bovitech staff ---------------- */
const isStaff = (c) => catOf(c) === 'bvs';
const iceLabel = (x) => fullName(x) + ((x.mobiles[0] || x.landlines[0]) ? ' — ' + (x.mobiles[0] || x.landlines[0]).value : '');
const iceFor = (c) => D.contacts.filter((s2) => (s2.ice || []).some((i) => i.cid === c.id)).map((s2) => ({ staff: s2, rel: s2.ice.find((i) => i.cid === c.id).rel }));
function iceCard(c) {
  let out = '';
  if (isStaff(c) || (c.ice || []).length) out += `<div class="card" style="border-left:5px solid var(--red)"><h3>🚨 ICE contacts (in case of emergency)</h3>${(c.ice || []).map((i) => { const x = D.contacts.find((y) => y.id === i.cid); if (!x) return ''; return `<div style="margin:6px 0"><div class="biz-link" data-act="open" data-kind="contact" data-id="${x.id}" style="font-weight:700">${h(fullName(x))}${i.rel ? ` <span class="hint" style="font-weight:400">(${h(i.rel)})</span>` : ''}</div>${phoneLinks(x.mobiles.map((p) => ({ ...p, label: p.label || 'Mobile' })), true, 'call')}${phoneLinks(x.landlines.map((p) => ({ ...p, label: p.label || 'Landline' })), false, 'call')}</div>`; }).join('') || '<div class="hint">No ICE contact recorded — tap Edit to add one.</div>'}</div>`;
  const forList = iceFor(c);
  if (forList.length) out += `<div class="card" style="border-left:5px solid var(--red)"><h3>🚨 ICE contact for</h3>${forList.map((f) => `<div class="biz-link" data-act="open" data-kind="contact" data-id="${f.staff.id}" style="margin:4px 0"><b>${h(fullName(f.staff))}</b>${f.rel ? ` <span class="hint">(${h(f.rel)})</span>` : ''}</div>`).join('')}</div>`;
  return out;
}
function iceRow(i) { const x = i && D.contacts.find((y) => y.id === i.cid); return `<div class="icerow" style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap"><input class="ice-who" list="ice-dl" placeholder="Start typing a contact's name" value="${x ? h(iceLabel(x)) : ''}" style="flex:2;min-width:180px;padding:9px;border:1px solid var(--line);border-radius:9px"><input class="ice-rel" placeholder="Relationship, e.g. Mum" value="${h((i && i.rel) || '')}" style="flex:1;min-width:120px;padding:9px;border:1px solid var(--line);border-radius:9px"><button type="button" class="btn small" data-act="ice-del">✕</button></div>`; }
// linking a contact to a business whose category differs: match the business, or keep the contact's own?
async function askLinkCat(names, b, cur) {
  return askBox('Different category', `<p style="font-size:16.5px">${names} ${/,| and /.test(names) ? 'have' : 'has'} a different category from <b>${h(b.name)}</b>.</p><div class="grid2" style="margin:8px 0"><div class="body" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px"><div class="lbl">Contact now</div>${h(cur)}</div><div class="body" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px"><div class="lbl">Business</div>${h(tagName(bizCat(b)))}</div></div><p>Update the contact's category to match the business, or keep it different?</p>`, `Update to match business: ${tagName(bizCat(b))}`, false, "Cancel — don't link", `Keep it different: ${cur}`).then((r) => (r === true ? 'match' : r === 'alt' ? 'keep' : null)); // null = backed out: nothing is linked
}
function setIceTags(ids, removedIds = []) { // linked ICE contacts get the ICE tag; people no longer anyone's ICE lose it
  const still = new Set(D.contacts.flatMap((x) => (x.ice || []).map((i) => i.cid)));
  ids.forEach((id) => { const x = D.contacts.find((y) => y.id === id); if (x && !x.tags.includes('ice')) { x.tags.push('ice'); touch(x); } });
  removedIds.filter((id) => !still.has(id)).forEach((id) => { const x = D.contacts.find((y) => y.id === id); if (x && x.tags.includes('ice')) { x.tags = x.tags.filter((t) => t !== 'ice'); touch(x); } });
}
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
  html += cflags.map(flagJob).join('');
  html += iceCard(c);
  if (hasWarning(c)) {
    html += `<div class="card warn"><h3>⚠ General warnings</h3>${c.warnings ? `<div class="body">${h(c.warnings)}</div>` : ''}${bs.filter((b) => b.warnings).map((b) => `<div class="body" style="margin-top:6px"><b>${h(b.name)}:</b> ${h(b.warnings)}</div>`).join('')}</div>`;
  }
  if ((c.sideNotes || '').trim() || bs.some((b) => (b.sideNotes || '').trim())) {
    html += `<div class="card side"><h3>📝 Side notes</h3>${c.sideNotes ? `<div class="body">${h(c.sideNotes)}</div>` : ''}${bs.filter((b) => b.sideNotes).map((b) => `<div class="body" style="margin-top:6px"><b>${h(b.name)}:</b> ${h(b.sideNotes)}</div>`).join('')}</div>`;
  }
  html += `<div class="card"><h3>Contact</h3>${phoneLinks(c.mobiles.map((p) => ({ ...p, label: p.label || 'Mobile' })), true)}${phoneLinks(c.landlines.map((p) => ({ ...p, label: p.label || 'Landline' })))}${c.emails.map((e) => `<div class="kv"><div class="k">${h(e.label || 'Email')}</div><div class="v"><a href="mailto:${h(e.value)}">${h(e.value)}</a></div></div>`).join('')}${c.postal.map((p) => `<div class="kv"><div class="k">Postal</div><div class="v">${h(p)}</div></div>`).join('')}${!c.mobiles.length && !c.landlines.length && !c.emails.length && !c.postal.length ? '<div class="hint">No contact details yet.</div>' : ''}</div>`;
  if (tags.length) html += `<div class="card"><h3>Categories and tags</h3><div class="tagrow">${tags.map(tagPill).join('')}</div>${followsBiz(c) && effCats(c).length ? '<div class="hint" style="margin-top:6px">Categories follow the business</div>' : c.ownCats && bs.length ? '<div class="hint" style="margin-top:6px">This contact has its own categories (different to the business)</div>' : ''}</div>`;
  html += `<div class="card"><h3>General info</h3>${infoView(c)}</div>`;
  html += `<h2 class="sec-h" style="font-size:20px;margin:18px 0 8px;display:flex;align-items:center;gap:8px">🔗 Linked ${bs.length === 1 ? 'business' : 'businesses'} <span class="count" style="font-size:14px;background:var(--ink);color:#fff;border-radius:99px;padding:1px 9px">${bs.length}</span></h2>${bs.length ? '' : `<div class="card"><div class="hint">Not linked to a business yet — tap Edit to link one.</div></div>`}`;
  { const pb = pastBizOf(c); if (pb.length) html += `<div class="card" style="opacity:.85"><h3>Past businesses (${pb.length})</h3>${pb.map((b) => `<div style="display:flex;align-items:center;gap:6px;margin:4px 0"><span class="biz-link sp" data-act="open" data-kind="business" data-id="${b.id}" style="flex:1">${h(b.name)}</span><button class="btn small" data-act="link-past" data-cid="${c.id}" data-bid="${b.id}" data-v="0">Make current</button></div>`).join('')}</div>`; }
  bs.forEach((b) => {
    html += `<div class="card" style="border-left:5px solid var(--ink3)"><h3>${b.rating ? rbadge(b.rating) : ''}<span class="sp">${h(b.name)}${isClientBiz(b) ? '' : ' <span class="hint">(industry)</span>'}</span><button class="btn small" data-act="open" data-kind="business" data-id="${b.id}">Open business</button></h3>`;
    { const lr = (c.links.find((l) => l.bid === b.id) || {}).role; if (lr) html += `<div class="kv"><div class="k">Role here</div><div class="v">${h(lr)}</div></div>`; }
    if (b.pics.length && isClientBiz(b)) html += `<div class="kv"><div class="k">PIC</div><div class="v">${b.pics.map((p) => h(p.value) + (p.label ? ` <span class="hint">${h(p.label)}</span>` : '')).join('<br>')}</div></div>`;
    if (b.patientIds.length && isClientBiz(b)) html += `<div class="kv"><div class="k">Patient IDs</div><div class="v">${b.patientIds.map((p) => `${h(p.value)} <span class="hint">${h(p.label)}</span>`).join('<br>')}</div></div>`;
    html += b.farms.map((f) => farmCard(b, f, false)).join('');
    html += bizRoutesHtml(b);
    html += '</div>';
  });
  html += `<div class="actions" style="margin:16px 0 8px"><button class="btn" data-act="merge-start" data-kind="contact" data-id="${c.id}">⇄ Merge with…</button></div><div class="actions" style="margin:0 0 8px"><button class="btn" data-act="rec-ai" data-kind="contact" data-id="${c.id}">🤖 Ask Claude about ${h(c.first || fullName(c))}</button></div>`;
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
  <div class="actions" style="margin:8px 0 0">${f.lat != null ? `<button class="btn small" data-act="route-add" data-fid="${f.id}">+ Add to route</button>` : ''}<button class="btn small" data-act="edit-farm" data-bid="${b.id}" data-fid="${f.id}">Edit ${locWord(b).toLowerCase()}</button></div></div>`;
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
  if (!isClientBiz(b) || bizHasDetails(b) || (b.postal || []).length) html += `<div class="card"><h3><span class="sp">Phone and email</span><button class="btn small" data-act="edit-biz" data-id="${b.id}">Edit</button></h3>${phoneLinks((b.phones || []).map((p) => ({ ...p, label: p.label || 'Phone' })), false, 'call')}${(b.emails || []).map((e) => `<div class="kv"><div class="k">${h(e.label || 'Email')}</div><div class="v"><a href="mailto:${h(e.value)}">${h(e.value)}</a></div></div>`).join('')}${(b.postal || []).map((p) => `<div class="kv"><div class="k">Address</div><div class="v">${h(p)}</div></div>`).join('')}${bizHasDetails(b) || (b.postal || []).length ? '' : '<div class="hint">No phone or email on the business yet — tap Edit to add them.</div>'}</div>`;
  const pastCs = IDX.bizPast.get(b.id) || [];
  html += `<div class="card"><h3>Current ${isClientBiz(b) ? 'contacts / employees' : 'contacts'} (${cs.length})</h3>${cs.map((c) => `<div style="display:flex;align-items:center"><div style="flex:1" class="biz-link" data-act="open" data-kind="contact" data-id="${c.id}">${contactPhotoImg(c, 'av', 120)}<div><div style="font-weight:600">${h(fullName(c))}${isClientBiz(b) && primaryOf(b)?.id === c.id ? ' <span class="rb" style="background:var(--ink)">PRIMARY</span>' : ''}</div><div class="hint">${h(roleAt(c, b.id))} ${h((c.mobiles[0] || c.landlines[0] || {}).value || '')}</div></div></div><button class="btn small" data-act="link-past" data-cid="${c.id}" data-bid="${b.id}" data-v="1" title="They no longer work here">Make past</button><button class="btn small" data-act="biz-unlink" data-cid="${c.id}" data-bid="${b.id}" title="Unlink from this business">Unlink</button></div>`).join('') || '<div class="hint">No current contacts.</div>'}
  <input id="biz-linksearch" data-bid="${b.id}" placeholder="+ Link a contact — search by name or phone" style="margin-top:8px;width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:9px"><div id="biz-linkres"></div>
  <div class="hint" style="margin-top:4px">${isClientBiz(b) && b.primaryRequired === false ? 'Primary contact not required.' : ''}</div></div>`;
  html += `<div class="card"><h3>Past ${isClientBiz(b) ? 'contacts / employees' : 'contacts'} (${pastCs.length})</h3><div class="hint" style="margin-bottom:4px">Their category isn't set by this business.</div>${pastCs.map((c) => `<div style="display:flex;align-items:center;opacity:.8"><div style="flex:1" class="biz-link" data-act="open" data-kind="contact" data-id="${c.id}">${contactPhotoImg(c, 'av', 120)}<div><div style="font-weight:600">${h(fullName(c))}</div><div class="hint">${h(catOf(c) ? tagName(catOf(c)) : '')}${bizOf(c).length ? ' · now at ' + h(bizOf(c).map((x) => x.name).join(', ')) : ''}</div></div></div><button class="btn small" data-act="link-past" data-cid="${c.id}" data-bid="${b.id}" data-v="0">Make current</button><button class="btn small" data-act="biz-unlink" data-cid="${c.id}" data-bid="${b.id}">Unlink</button></div>`).join('')}<input id="biz-linksearch-past" data-bid="${b.id}" placeholder="+ Add a past contact — search by name or phone" style="margin-top:8px;width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:9px"><div id="biz-linkres-past"></div></div>`;
  if (isClientBiz(b)) html += `<div class="card"><h3>Property Identification Code (PIC)</h3>${b.pics.map((p) => `<div class="kv"><div class="k">${h(p.label || 'PIC')}</div><div class="v">${h(p.value)}</div></div>`).join('') || '<div class="hint">None recorded.</div>'}</div>`;
  if (isClientBiz(b)) html += `<div class="card"><h3>Patient IDs</h3>${b.patientIds.map((p) => `<div class="kv"><div class="k">${h(p.label || 'ID')}</div><div class="v">${h(p.value)}</div></div>`).join('') || '<div class="hint">None recorded.</div>'}</div>`;
  { const rh = bizRoutesHtml(b, false); if (rh) html += `<div class="card"><h3>Saved routes</h3>${rh}</div>`; }
  html += `<div class="card"><h3>${locWord(b, true)}</h3>${b.farms.map((f) => farmCard(b, f)).join('') || `<div class="hint">No ${locWord(b, true).toLowerCase()} yet.</div>`}</div>`;
  html += `<div class="card"><h3>General info</h3>${infoView(b)}</div>`;
  html += `<div class="actions" style="margin:16px 0 8px"><button class="btn" data-act="merge-start" data-kind="business" data-id="${b.id}">⇄ Merge with…</button></div><div class="actions" style="margin:0 0 8px"><button class="btn" data-act="rec-ai" data-kind="business" data-id="${b.id}">🤖 Ask Claude about ${h(b.name)}</button></div>`;
  return html + '</div>';
}

/* ---------------- edit sheets ---------------- */
let SHEET = null; // {type, rec, ...}
function openSheet(title, body, onSave, extraBtns = '') {
  closeSheet();
  const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'sheet';
  bg.innerHTML = `<div class="sheet"><div class="sheet-h"><button class="btn" data-act="sheet-cancel">‹ Back</button><h2>${h(title)}</h2>${extraBtns}<button class="btn primary" data-act="sheet-save" id="sheet-save">Save</button></div><div class="form">${body}</div></div>`;
  document.body.appendChild(bg); SHEET = { onSave }; try { history.pushState({ sheet: 1 }, ''); } catch (e) { } updateBackBtn();
  // clicking outside the edit screen no longer closes it (too easy to lose typing); snapshot the form so leaving can warn
  setTimeout(() => { if (SHEET && $('#sheet') === bg) SHEET.snap = sheetState(); }, 0);
}
function sheetState() { const f = $('#sheet .form'); if (!f) return ''; return [...f.querySelectorAll('input,textarea,select')].map((el) => (el.type === 'checkbox' || el.type === 'radio') ? (el.checked ? '1' : '0') : el.type === 'file' ? (el.files && el.files.length ? 'f' : '') : el.value).join('\u0001'); }
function sheetDirty() { return !!(SHEET && SHEET.snap != null && sheetState() !== SHEET.snap); }
async function leaveSheet(fromPop) {
  if (!SHEET) return;
  if (!sheetDirty()) { if (fromPop) SHEET.popped = true; closeSheet(); return; }
  if (fromPop) { try { history.pushState({ sheet: 1 }, ''); } catch (e) { } } // put the edit screen back while we ask
  const sh = SHEET;
  if (await ask('You have unsaved changes on this screen.\n\nLeave without saving?', 'Yes — discard my changes', true)) { if (SHEET === sh) closeSheet(); }
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
  const opts = [...(firstLabel ? [['', firstLabel]] : []), ...RATINGS.map((r) => [r, tagName(r)]), ...D.tags.filter((t) => t.group === 'client').map((t) => [t.id, t.name])];
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
function reasonBoxes() { const v = editorCat(); { const w = $('#e-icewrap'); if (w && v === 'bvs') w.style.display = ''; } [['e-dnawrap', 'dna'], ['e-bdnawrap', 'dna'], ['e-inwrap', 'inactive'], ['e-binwrap', 'inactive']].forEach(([id, cat]) => { const el = $('#' + id); if (el) el.style.display = v === cat ? '' : 'none'; }); }
function contactWillBeDna() { return editorCat() === 'dna'; }
function editContact(c) {
  const isNew = !c;
  const wasInactive = !!(c && effTags(c).includes('inactive'));
  const oldCats = c ? effCats(c) : [];
  c = c || { id: uid('c'), first: '', middle: '', last: '', role: '', links: [], tags: [], emails: [], mobiles: [], landlines: [], postal: [], info: D.settings.tplContact != null ? D.settings.tplContact : TPL_CONTACT, warnings: '', starred: false, photoChoice: 'auto', flags: [] };

  const { dr, ptags } = photoCandidates(c);
  const photoOpts = [['auto', 'Use default photo automatically assigned to the category' + (needsPhotoChoice(c) ? ' (needs choosing)' : '')], ...[...new Set([...dr, ...effTags(c).filter((t) => tagPhotoSrc(t))])].map((t) => [t, tagName(t)])];
  const cands = [...new Set([...dr, ...ptags])];
  if (cands.length >= 2) photoOpts.push(['split:' + cands.slice(0, 2).join(','), 'Split: ' + cands.slice(0, 2).map(tagName).join(' + ')]);
  if (c.photoChoice && c.photoChoice.startsWith('split:') && !photoOpts.some((o) => o[0] === c.photoChoice)) photoOpts.push([c.photoChoice, 'Split (current)']);
  photoOpts.push(['custom', 'Upload my own photo']);
  const body = `${isNew ? '' : `<div class="f"><span class="lbl">This entry is a…</span><div class="seg"><button type="button" class="on" data-act="kind-pick" data-v="person">Person</button><button type="button" data-act="kind-pick" data-v="client">Client business</button><button type="button" data-act="kind-pick" data-v="industry">Industry business</button></div><input type="hidden" id="e-kind" value="person"><div id="e-kindhint" class="hint" style="display:none;margin-top:6px;color:var(--red-ink)"></div></div>`}
  <div class="grid2"><div class="f"><label>First name</label><input id="e-first" value="${h(c.first)}"></div><div class="f"><label>Surname</label><input id="e-last" value="${h(c.last)}"></div></div>
  <div class="grid2"><div class="f"><label>Middle / nickname</label><input id="e-middle" value="${h(c.middle)}"></div><div class="f"><label>Role / position</label><input id="e-role" value="${h(c.role)}"></div></div>
  <div class="f"><label>Businesses</label><div id="e-links">${c.links.map((l) => linkRow(l.bid, null, l.past, l.role)).join('')}</div><div class="hint">Tick <b>Past</b> for a business they no longer work for — it stays on record but doesn't set their category.</div>
    <input id="e-bizsearch" placeholder="Search to link a business, or type a new business name"><div id="e-bizres"></div>
</div>
  <div class="card" style="background:#fbfaf7"><h3>Contact category</h3>
    ${c.links.length ? `<div class="seg" style="margin-bottom:8px"><button type="button" class="${followsBiz(c) ? 'on' : ''}" data-act="cat-mode" data-v="biz">Same as business</button><button type="button" class="${followsBiz(c) ? '' : 'on'}" data-act="cat-mode" data-v="own">This contact's own</button></div>` : ''}
    <input type="hidden" id="e-catmode" value="${followsBiz(c) ? 'biz' : 'own'}">
    <div id="e-catbiz" style="${followsBiz(c) ? '' : 'display:none'}"><div class="hint">Follows ${h(bizOf(c).map((b) => b.name).join(', '))}: ${h([...bizOf(c).map((b) => b.rating).filter(Boolean).map(tagName), ...bizCatsOf(c).map(tagName)].join(', ') || 'no categories yet')}. Change them on the business.</div></div>
    <div id="e-catown" style="${followsBiz(c) ? 'display:none' : ''}">
      ${catPicker('ccat', followsBiz(c) ? '' : catOf(c), null)}
    </div></div>
  <div class="f"><span class="lbl">Additional tags</span><div class="checks">${D.tags.filter((t) => t.group === 'additional').map((t) => `<label><input type="checkbox" data-tag="${t.id}" ${c.tags.includes(t.id) ? 'checked' : ''}>${h(t.name)}</label>`).join('')}</div></div>
  <div class="card" id="e-icewrap" style="background:#fff5f5;${isStaff(c) || (c.ice || []).length ? '' : 'display:none'}"><h3>🚨 ICE contacts (Bovitech staff)</h3><div class="hint" style="margin-bottom:6px">Who to call in case of emergency. Pick existing contacts — add the person as a contact first if they're not in the app. They get the ICE tag automatically.</div>
    <div id="e-icerows">${((c.ice || []).length ? c.ice : [null]).map(iceRow).join('')}</div><button type="button" class="btn small" data-act="ice-add">+ Add another ICE contact</button>
    <datalist id="ice-dl">${D.contacts.filter((x) => x.id !== c.id).map((x) => `<option value="${h(iceLabel(x))}">`).join('')}</datalist></div>
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
    const origRec = JSON.stringify(c); // put the record back if the save is abandoned part-way
    const first = val('e-first'), last = val('e-last');
    if (!first && !last) { toast('Enter a name'); return false; }
    if (editorCat() === 'inactive' && !$('#e-inreason').value.trim() && !bizOf(c).some((b) => b.inactiveReason && bizCat(b) === 'inactive')) { toast('Please add the reason for inactivating'); $('#e-inwrap').style.display = ''; $('#e-inreason').focus(); return false; }
    if (contactWillBeDna(c) && !$('#e-dnareason').value.trim() && !bizOf(c).some((b) => b.dnaReason && (b.cats || []).includes('dna'))) { toast('Please add the reason for "Do not answer"'); $('#e-dnawrap').style.display = ''; $('#e-dnareason').focus(); return false; }
    const kind = ($('#e-kind') || {}).value || 'person';
    if (kind !== 'person') { const nm = [first, val('e-middle'), last].filter(Boolean).join(' '); const tgt = bizOf(c).find((b) => sameAsBizName({ ...c, first, last, middle: val('e-middle') }, b));
      if (!(await ask(`Change "${nm}" into ${kind === 'client' ? 'a client business' : 'an industry (non-client) business'}?\n\n${tgt ? `Its phone, email, address and notes move onto the existing business "${tgt.name}".` : `A new business called "${nm}" is created with its phone, email, address and notes.`}${bizOf(c).filter((b) => b !== tgt).length ? `\n\nIt will no longer be linked to: ${bizOf(c).filter((b) => b !== tgt).map((b) => b.name).join(', ')}.` : ''}\n\nThe contact itself goes to the trash (restore it from Settings → Trash if needed).`, 'Yes — change it to a business'))) return false; }
    Object.assign(c, { first, last, middle: val('e-middle'), role: val('e-role'), ...readRich('e-info'), warnings: $('#e-warn').value.trim(), sideNotes: $('#e-side').value.trim(), dnaReason: $('#e-dnareason').value.trim(), inactiveReason: $('#e-inreason').value.trim(), starred: $('#e-star').checked });
    const oldBids = new Set((c.links || []).map((l) => l.bid)); const prevCat = isNew ? '' : catOf(c);
    c.links = [...document.querySelectorAll('#e-links [data-bid]')].map((el) => { const l = { bid: el.dataset.bid }; if (el.querySelector('.lk-past')?.checked) l.past = true; const r = (el.querySelector('.lk-role')?.value || '').trim(); if (r) l.role = r; return l; });
    const newBiz = [...document.querySelectorAll('#e-links [data-newbiz]')];
    newBiz.forEach((el) => { const b = newBusiness(el.dataset.newbiz); const l = { bid: b.id }; if (el.querySelector('.lk-past')?.checked) l.past = true; const r = (el.querySelector('.lk-role')?.value || '').trim(); if (r) l.role = r; c.links.push(l); });
    const addl = [...document.querySelectorAll('#sheet [data-tag]')].filter((i) => i.checked).map((i) => i.dataset.tag);
    const mode = curLinks(c).length ? $('#e-catmode').value : 'own';
    if (addl.includes('pa') && addl.includes('pi')) { toast('Choose Primary (active) or Primary (inactive) — not both'); return false; }
    const rv = mode === 'own' ? rtVal($('#sheet'), 'ccat') : '';
    if (mode === 'own' && !rv) { toast('Choose a category — every contact needs one'); return false; }
    if (mode === 'biz' && !curLinks(c).map((l) => IDX.biz.get(l.bid)).filter(Boolean).map(bizCat).find(Boolean)) { toast("The business has no category yet — choose this contact's own category, or set the business's category first"); return false; }
    c.tags = [...addl];
    if (mode === 'biz') c.ownCats = false; else { c.ownCats = true; if (rv) c.tags.push(rv); if (curLinks(c).length && rv && rv === curLinks(c).map((l) => IDX.biz.get(l.bid)).filter(Boolean).map(bizCat).find(Boolean)) { c.ownCats = false; c.tags = c.tags.filter((t) => t !== rv); } }
    { const nb = curLinks(c).map((l) => IDX.biz.get(l.bid)).find((b) => b && !oldBids.has(b.id) && bizCat(b)); const mine = mode === 'own' ? rv : prevCat;
      if (nb && mine && bizCat(nb) !== mine && (mode === 'own' || !oldBids.size)) { reindex(); const r = await askLinkCat(`<b>${h(fullName(c))}</b>`, nb, tagName(mine)); if (!r) { adopt(c, JSON.parse(origRec)); reindex(); toast('Not saved — your edits are still on screen'); return false; } if (r === 'match') setOne(c, bizCat(nb)); else setOne(c, mine); } }
    c.mobiles = readRep('mob'); c.landlines = readRep('land'); c.emails = readRep('email'); c.postal = readRep('postal').map((p) => p.value);
    if ($('#e-icewrap') && $('#e-icewrap').style.display !== 'none') {
      const byLabel = new Map(D.contacts.filter((x) => x.id !== c.id).map((x) => [iceLabel(x), x])); const byName = new Map(); D.contacts.forEach((x) => { const k = fullName(x).toLowerCase(); byName.set(k, byName.has(k) ? null : x); });
      const rows = [...document.querySelectorAll('#e-icerows .icerow')].map((r) => ({ who: r.querySelector('.ice-who').value.trim(), rel: r.querySelector('.ice-rel').value.trim() })).filter((r) => r.who);
      const bad = rows.filter((r) => !(byLabel.get(r.who) || byName.get(r.who.toLowerCase())));
      if (bad.length) { toast(`ICE contact not found: ${bad.map((r) => r.who).join(', ')} — pick from the list, or add them as a contact first`); return false; }
      const oldIce = (c.ice || []).map((i) => i.cid);
      c.ice = rows.map((r) => ({ cid: (byLabel.get(r.who) || byName.get(r.who.toLowerCase())).id, rel: r.rel })).filter((x, k, arr) => arr.findIndex((y) => y.cid === x.cid) === k);
      if (!c.ice.length) delete c.ice;
      S.iceSync = { add: (c.ice || []).map((i) => i.cid), removed: oldIce.filter((id) => !(c.ice || []).some((i) => i.cid === id)) };
    }
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
    if (S.iceSync) { setIceTags(S.iceSync.add, S.iceSync.removed); S.iceSync = null; }
    S.sel = { kind: 'contact', id: c.id };
    if (kind !== 'person') { reindex(); const b = contactToBiz(c, kind); S.sel = { kind: 'business', id: b.id }; S.tab = 'biz'; NEXT_LOG_LABEL = `Changed ${fullName(c)} into ${kind === 'client' ? 'a client' : 'an industry'} business`; }
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
function linkRow(bid, newName, past, role) {
  const b = bid ? IDX.biz.get(bid) : null;
  return `<div class="rep" style="flex-wrap:wrap" ${bid ? `data-bid="${bid}"` : `data-newbiz="${h(newName)}"`}><label style="display:flex;align-items:center;gap:4px;font-size:13.5px;white-space:nowrap"><input type="checkbox" class="lk-past" ${past ? 'checked' : ''}>Past</label><div style="flex:1;padding:9px 10px;background:#fff;border:1px solid var(--line);border-radius:9px">${b ? (b.rating ? rbadge(b.rating) : '') + h(b.name) : h(newName) + ' <span class="hint">(new)</span>'}</div><button class="x" type="button" data-act="rep-del">×</button><input class="lk-role" value="${h(role || '')}" placeholder="Role at this business (optional)" style="flex-basis:100%;margin-top:4px;padding:7px 9px;border:1px solid var(--line);border-radius:8px;font-size:14.5px"></div>`;
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
  b = b || { id: uid('b'), name: '', farms: [], pics: [], patientIds: [], info: D.settings.tplBiz != null ? D.settings.tplBiz : TPL_BIZ, warnings: '', flags: [], rating: null };
  const body = `<div class="f"><label>Business name</label><input id="e-bname" value="${h(b.name)}"></div>
  <div class="f"><label>Business type</label><select id="e-btype"><option value="client">Client business</option><option value="nonclient" ${isClientBiz(b) ? '' : 'selected'}>Non-client business (industry)</option></select><div class="hint">Normally set by the business's category (Settings → Categories). If you pick a different type here, the business keeps your choice.</div><div class="hint">Non-client businesses don't need a PIC, patient IDs, A+ to C category or farms — they have business locations instead.</div></div>
  <div class="f"><label>Business phone numbers</label>${repRows('bphone', b.phones || [], [{ k: 'value', ph: 'e.g. 08 9841 7857', w: 2 }, { k: 'label', ph: 'Label (e.g. Office, Mobile)', w: 2 }])}</div>
  <div class="f"><label>Business emails</label>${repRows('bemail', b.emails || [], [{ k: 'value', ph: 'e.g. sales@business.com.au', w: 3 }, { k: 'label', ph: 'Label (optional)', w: 2 }])}</div>
  <div class="f"><label>Business postal / street address</label><textarea id="e-bpostal" style="min-height:50px">${h((b.postal || []).join('\n'))}</textarea></div>
  <div class="f client-only"><label>Primary contact required?</label><select id="e-bpreq"><option value="yes">Yes</option><option value="no" ${b.primaryRequired === false ? 'selected' : ''}>Not required</option></select></div>
  ${(IDX.bizContacts.get(b.id) || []).length ? `<div class="f client-only"><label>Primary contact</label><select id="e-bprimary"><option value="">— choose —</option>${(IDX.bizContacts.get(b.id) || []).map((c) => `<option value="${c.id}" ${primaryOf(b)?.id === c.id ? 'selected' : ''}>${h(fullName(c))}</option>`).join('')}</select></div>` : ''}
  <div class="f"><span class="lbl">Contact category</span>${catPicker('bcat', bizCat(b), null)}<div class="hint">Contacts set to "Same as business" follow these. Contacts with their own categories keep theirs.</div></div>
  <div class="f client-only"><label>Property Identification Code (PIC)</label>${repRows('pic', b.pics, [{ k: 'value', ph: 'e.g. WFAY2784', w: 2 }, { k: 'label', ph: 'Label (optional, e.g. farm or entity)', w: 3 }])}</div>
  <div class="f client-only"><label>Patient IDs</label>${repRows('pid', b.patientIds, [{ k: 'value', ph: 'e.g. 100154', w: 2 }, { k: 'label', ph: 'Cattle Herd ID / Sheep Flock ID / (entity) …', w: 3, list: 'pidlabels' }])}<datalist id="pidlabels">${[...new Set([...PID_LABELS, ...D.businesses.flatMap((x) => x.patientIds.map((p) => p.label))])].map((l) => `<option value="${h(l)}">`).join('')}</datalist></div>
  <div class="f"><label>General info</label>${richEditor('e-binfo', b)}</div>
  <div class="f"><label style="color:var(--red-ink)">General warnings (red — shown on every linked contact). Farm warnings go on the farm.</label><textarea id="e-bwarn" class="warn">${h(b.warnings)}</textarea></div>
  <div class="f" id="e-binwrap" style="${bizCat(b) === 'inactive' ? '' : 'display:none'}"><label style="color:var(--red-ink)">Inactive — reason (required, shown in a red box at the top)</label><textarea id="e-binreason" class="warn" style="min-height:60px" placeholder="e.g. client retired and sold farm">${h(b.inactiveReason || '')}</textarea></div>
  <div class="f" id="e-bdnawrap" style="${(b.cats || []).includes('dna') ? '' : 'display:none'}"><label style="color:var(--red-ink)">⛔ Do not answer — reason (required, shown under the red banner)</label><textarea id="e-bdnareason" class="warn" style="min-height:60px">${h(b.dnaReason || '')}</textarea></div>
  <div class="f"><label style="color:#7a5a00">Side notes (yellow — shown on every linked contact)</label><textarea id="e-bside" class="sidenote">${h(b.sideNotes || '')}</textarea></div>
  <div class="hint">Farms are added and edited from the business page.</div>
  ${isNew ? '' : `<div class="f" style="margin-top:12px"><button class="btn" data-act="del-biz" data-id="${b.id}" style="color:var(--red)">Delete business</button></div>`}`;
  openSheet(isNew ? 'New business' : 'Edit business', body, async () => {
    const name = val('e-bname'); if (!name) { toast('Enter a business name'); return false; }
    { const badPic = readRep('pic').map((p) => p.value.toUpperCase().replace(/\s+/g, '')).filter((v) => !PIC_RX.test(v)); if (badPic.length && !(await ask(`${badPic.join(', ')} doesn't look like a PIC.\n\nPICs are W + 3 more letters + 4 numbers (e.g. WFAY2899). Save anyway?`, 'Yes — save anyway'))) return false; }
    const pick = rtVal($('#sheet'), 'bcat'); const newRating = RATING_SET.has(pick) ? pick : null;
    if (!pick) { toast('Choose a category for the business'); return false; }
    if (newRating !== b.rating) b.flags = (b.flags || []).filter((f) => f.type !== 'ratingconflict');
    const pickedType = $('#e-btype').value; b.type = pickedType; b.primaryRequired = $('#e-bpreq').value !== 'no';
    b.phones = readRep('bphone'); b.emails = readRep('bemail'); b.postal = $('#e-bpostal').value.split('\n').map((x) => x.trim()).filter(Boolean);
    if (b.type === 'nonclient') { b.primaryRequired = false; b.primaryContact = null; }
    const pSel = b.type === 'nonclient' ? null : $('#e-bprimary'); if (pSel) { b.primaryContact = pSel.value || null; const pc = D.contacts.find((x) => x.id === b.primaryContact); if (pc && !pc.tags.includes('pa') && !pc.tags.includes('pi')) { pc.tags.push('pa'); touch(pc); } }
    if (pick === 'inactive' && !$('#e-binreason').value.trim()) { toast('Please add the reason for inactivating'); $('#e-binwrap').style.display = ''; $('#e-binreason').focus(); return false; }
    if (pick === 'dna' && !$('#e-bdnareason').value.trim()) { toast('Please add the reason for "Do not answer"'); $('#e-bdnawrap').style.display = ''; $('#e-bdnareason').focus(); return false; }
    const oldBc = b.cats || []; b.cats = pick && !RATING_SET.has(pick) ? [pick] : []; if (pick !== bizCat({ rating: b.rating, cats: oldBc }) || newRating !== (b.rating || null)) b.flags = (b.flags || []).filter((f) => f.type !== 'catpick');
    (IDX.bizContacts.get(b.id) || []).filter(followsBiz).forEach((c) => {
      if (!oldBc.includes('inactive') && b.cats.includes('inactive')) { c.flags = c.flags || []; c.flags.push({ type: 'ezyvet', at: Date.now() }); touch(c); }
      if (!oldBc.includes('dna') && b.cats.includes('dna') && !c.tags.includes('blockedc')) { c.flags = c.flags || []; c.flags.push({ type: 'blockcheck', at: Date.now() }); touch(c); }
    });
    Object.assign(b, { name, rating: newRating, pics: readRep('pic').map((p) => ({ ...p, value: p.value.toUpperCase().replace(/\s+/g, '') })), patientIds: readRep('pid'), ...readRich('e-binfo'), warnings: $('#e-bwarn').value.trim(), sideNotes: $('#e-bside').value.trim(), dnaReason: $('#e-bdnareason').value.trim(), inactiveReason: $('#e-binreason').value.trim() });
    setBizType(b, pickedType); // keeps the type you chose even if the category says otherwise
    touch(b); if (isNew) D.businesses.push(b);
    S.sel = { kind: 'business', id: b.id }; if (isNew) S.tab = 'biz';
    return true;
  });
  document.querySelectorAll(isClientBiz(b) ? '#sheet .nonclient-only' : '#sheet .client-only').forEach((el) => (el.style.display = 'none'));
}
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.pref) { savePref(t.dataset.pref, t.value); if (t.dataset.pref === 'theme' || t.dataset.pref === 'size') applyUi(); toast('Saved for this device'); return; }
  if (t.dataset && t.dataset.jobtype) { const off = new Set(PREF.jobsOff || []); t.checked ? off.delete(t.dataset.jobtype) : off.add(t.dataset.jobtype); savePref('jobsOff', [...off]); JOBS_CACHE = null; renderTabs(); toast('Saved for this device'); return; }
  const setShared = async (fn, label) => { fn(D.settings); touch(D.settings); NEXT_LOG_LABEL = label; S.skipConfirm = true; JOBS_CACHE = null; await changed(); toast('Saved'); };
  if (t.dataset && t.dataset.req) { await setShared((st) => { const r = new Set(st.required || REQ_DEF); t.checked ? r.add(t.dataset.req) : r.delete(t.dataset.req); st.required = [...r]; }, `Required information: ${t.dataset.req} ${t.checked ? 'on' : 'off'}`); return; }
  if (t.dataset && t.dataset.route) { await setShared((st) => { st.route = { ...routeSet(), [t.dataset.route]: t.checked }; }, `Travel: ${t.dataset.route} ${t.checked ? 'on' : 'off'}`); return; }
  if (t.dataset && t.dataset.routenum) { const v = parseFloat(t.value); if (!(v > 0)) { toast('Enter a number above 0'); return; } await setShared((st) => { st.route = { ...routeSet(), [t.dataset.routenum]: v }; }, `Travel: ${t.dataset.routenum} = ${v}`); return; }
  if (t.dataset && t.dataset.gpush) { await setShared((st) => { st.gpush = { ...(st.gpush || {}), [t.dataset.gpush]: t.checked }; }, `Google Contacts: ${t.dataset.gpush} ${t.checked ? 'on' : 'off'}`); return; }
  if (t.dataset && t.dataset.gskip) { await setShared((st) => { const g = { ...(st.gpush || {}) }; const sk = new Set(g.skip || []); t.checked ? sk.delete(t.dataset.gskip) : sk.add(t.dataset.gskip); g.skip = [...sk]; st.gpush = g; }, `Google Contacts: ${tagName(t.dataset.gskip)} ${t.checked ? 'sent' : 'not sent'}`); return; }
  if (t.dataset && t.dataset.catclass) { const st = D.settings; st.catClass = st.catClass || { p: {}, b: {} }; st.catClass[t.dataset.catclass] = st.catClass[t.dataset.catclass] || {}; st.catClass[t.dataset.catclass][t.dataset.cat] = t.value; touch(st); NEXT_LOG_LABEL = `${tagName(t.dataset.cat)} ${t.dataset.catclass === 'p' ? lab('contacts') : lab('biz')} set to ${t.value === 'n' ? 'non-client' : 'client'}`; S.skipConfirm = true; JOBS_CACHE = null; reindex(); await changed(); toast('Saved'); return; }
  if (t.dataset && t.dataset.label) { const st = D.settings; st.labels = st.labels || {}; const v = t.value.trim(); if (v) st.labels[t.dataset.label] = v; else delete st.labels[t.dataset.label]; touch(st); NEXT_LOG_LABEL = `Menu name: ${TAB_DEFAULTS[t.dataset.label]} → ${v || TAB_DEFAULTS[t.dataset.label]}`; S.skipConfirm = true; await changed(); toast('Saved'); return; }
});
document.addEventListener('change', (e) => {
  if (e.target.id !== 'e-btype') return; const nc = e.target.value === 'nonclient';
  document.querySelectorAll('#sheet .client-only').forEach((el) => (el.style.display = nc ? 'none' : ''));
  document.querySelectorAll('#sheet .nonclient-only').forEach((el) => (el.style.display = nc ? '' : 'none'));
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
  mods() { const r = routeSet(); return { avoidTolls: !!r.avoidTolls, avoidHighways: !!r.avoidHighways, avoidFerries: !!r.avoidFerries }; },
  async distances(dests, origin = D.settings.home) {
    if (!this.key()) throw new Error('Add your Google Maps key in Settings to calculate distances.');
    if (!navigator.onLine) throw new Error('You are offline — distances need internet.');
    const out = [];
    for (let i = 0; i < dests.length; i += 25) {
      const chunk = dests.slice(i, i + 25);
      const body = { origins: [{ waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } } }], destinations: chunk.map((d) => ({ waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lng } } } })), travelMode: 'DRIVE', routeModifiers: this.mods() };
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
    const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key(), 'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration' }, body: JSON.stringify({ origin: wp(origin), destination: wp(dest), intermediates: stops.map(wp), travelMode: 'DRIVE', optimizeWaypointOrder: true, routeModifiers: this.mods() }) });
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
  let html = `<div class="d-wrap"><h2 class="sec-h" style="font-size:26px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="flex:1">${h(lab('route'))}</span><button class="btn small" data-act="area-ai" data-v="route">🤖 Ask Claude about this route</button></h2>
  <div class="card"><h3>Stops (${R.stops.length}/${MAX_STOPS})</h3>
  ${R.stops.map((s, i) => { const f = IDX.farms.get(s.fid); return `<div class="stop"><span class="num">${i + 1}</span><div class="t"><div style="font-weight:600">${h(farmLabel(f))}</div><div class="hint">${h(f.address || '')} ${f.kmReturn != null ? '· ' + fmtKm(f) : ''}</div></div><button class="btn small" data-act="rs-up" data-i="${i}" ${i ? '' : 'disabled'}>↑</button><button class="btn small" data-act="rs-down" data-i="${i}" ${i < R.stops.length - 1 ? '' : 'disabled'}>↓</button><button class="btn small" data-act="rs-del" data-i="${i}">×</button></div>`; }).join('') || '<div class="hint">Add farms below, or use “+ Route” on any farm.</div>'}
  ${R.stops.length < MAX_STOPS ? `<input id="rs-search" placeholder="Search clients, businesses, farms or PICs to add a stop" style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;margin-top:6px"><div id="rs-res"></div>` : '<div class="hint">Google Maps allows up to 9 stops.</div>'}
  </div>
  <div class="card"><h3>Start and finish</h3>${endpointPicker('start')}
  <div class="f"><label><input type="checkbox" data-act="endsame" ${R.endSame ? 'checked' : ''}> Finish where I started</label></div>
  ${R.endSame ? '' : endpointPicker('end')}</div>
  <div class="card"><h3>Order</h3><div class="seg"><button class="${R.mode === 'efficient' ? 'on' : ''}" data-act="rmode" data-v="efficient">Most efficient</button><button class="${R.mode === 'order' ? 'on' : ''}" data-act="rmode" data-v="order">The order I picked</button></div>
  <div class="hint" style="margin-top:6px">${D.settings.mapsKey ? 'Most efficient uses Google Maps road routing when online.' : 'Most efficient uses straight-line distances until the Google Maps key is added in Settings.'}</div></div>
  <div class="actions"><button class="btn red" data-act="route-go" ${R.stops.length ? '' : 'disabled'} style="font-size:17px;padding:12px 18px">Open route in Google Maps</button>${R.stops.length ? `${R.savedId && D.routes.some((x) => x.id === R.savedId) ? `<button class="btn primary" data-act="route-save">💾 Save changes to "${h(D.routes.find((x) => x.id === R.savedId).name)}"</button><button class="btn" data-act="route-saveas">Save as new route</button>` : '<button class="btn primary" data-act="route-save">💾 Save route</button>'}<button class="btn" data-act="route-clear">Clear</button>` : ''}</div><div id="route-msg" class="hint"></div>
  ${savedRoutesCard()}</div>`;
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
  if (t === 'nocat') ops.push({ op: 'setcat', label: 'Set this category for all selected', green: true });
  if (t === 'sheep') ops.push({ op: 'sheepreg', label: 'Change all to Sheep only (regular)' });
  if (t === 'primin') ops.push({ op: 'priminall', label: '✓ Change all selected to Primary (inactive)', green: true });
  if (t === 'linkreview') ops.push({ op: 'lrpast', label: 'Make all selected past employees' }, { op: 'lrundo', label: 'Undo — remove all selected links' });
  if (t === 'linksuggest') ops.push({ op: 'linkall', label: '✓ Link all selected as current employees', green: true }, { op: 'linkallpast', label: '✓ Link all selected as past employees', green: true });
  if (t === 'noprimary') ops.push({ op: 'primall', label: '✓ Use the suggested primary contact for all selected', green: true });
  if (t === 'bizonly') ops.push({ op: 'bizonlyall', label: "✓ Yes — just the business, for all selected", green: true });
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
    ${catPicker('bizr', bizCat(b), null)}
    <div class="hint" style="margin-top:6px">Everyone set to "Same as business" gets this.</div></div>
  <div class="card" style="background:#fffbea"><h3>Quick change for ticked people</h3>
    <div class="search" style="flex-wrap:wrap"><select id="bc-tag" style="flex:1;min-width:180px;padding:8px;border:1px solid var(--line);border-radius:9px">${[...RATINGS, ...cats.map((t) => t.id)].map((t) => `<option value="${t}">${h(tagName(t))}</option>`).join('')}</select>
    <button class="btn small" type="button" data-act="bc-quick" data-on="1">Set this category</button><button class="btn small" type="button" data-act="bc-quick" data-on="biz">Set to "Same as business"</button></div>
    <label style="display:block;margin-top:8px"><input type="checkbox" id="bc-all"> Tick everyone</label></div>
  ${cs.map((c) => { const own = !followsBiz(c) || !!ownRating(c); return `<div class="card" data-bccontact="${c.id}"><h3 style="text-transform:none;letter-spacing:0;font-size:17px;color:var(--ink)"><input type="checkbox" class="bc-pick" data-cid="${c.id}" style="width:20px;height:20px"> <span class="sp">${h(fullName(c))}</span></h3>
    <div class="seg" style="margin-bottom:8px"><button type="button" class="${own ? '' : 'on'}" data-act="bc-mode" data-v="biz">Same as business</button><button type="button" class="${own ? 'on' : ''}" data-act="bc-mode" data-v="own">Own category</button></div>
    <input type="hidden" class="bc-modeval" value="${own ? 'own' : 'biz'}">
    <div class="bc-own" style="${own ? '' : 'display:none'}">${catPicker('r-' + c.id, followsBiz(c) ? '' : catOf(c), null)}</div></div>`; }).join('')}`;
  openSheet('Categories — ' + b.name, body, () => {
    let n = 0;
    const bpick = rtVal($('#sheet'), 'bizr');
    if (!bpick) { toast('Choose a category for the business'); return false; }
    const noCat = [...document.querySelectorAll('#sheet [data-bccontact]')].filter((row) => row.querySelector('.bc-modeval').value === 'own' && !rtVal(row, 'r-' + row.dataset.bccontact));
    if (noCat.length) { toast('Choose a category for ' + noCat.map((row) => fullName(D.contacts.find((x) => x.id === row.dataset.bccontact))).join(', ')); return false; } const nr = RATING_SET.has(bpick) ? bpick : null; const nbc = bpick && !RATING_SET.has(bpick) ? [bpick] : [];
    const oldBc = b.cats || []; let bch = false;
    if (nr !== (b.rating || null) || nbc.slice().sort().join() !== oldBc.slice().sort().join()) { b.rating = nr; b.cats = nbc; b.flags = (b.flags || []).filter((f) => f.type !== 'ratingconflict' && f.type !== 'catpick'); touch(b); bch = true; reindex(); }
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
async function runBulk(t, op) {
  const sel = jobs().filter((j) => j.type === t && S.jobSel.has(j.key)); if (!sel.length) return;
  const jbCat = op === 'setcat' ? ($('#jb-cat') || {}).value : null;
  const label = op === 'setcat' ? 'Set category to ' + tagName(jbCat) : bulkOps(t, sel).find((o) => o.op === op)?.label || op;
  
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
    else if (op === 'setcat' && jbCat) { const c = D.contacts.find((x) => x.id === j.id); if (c) setOne(c, jbCat); }
    else if (op === 'sheepreg') { const c = D.contacts.find((x) => x.id === j.id); if (c) { setCats(c, [...effCats(c).filter((x) => x !== 'sheepocc' && x !== 'sheep'), 'sheepreg']); c.flags = (c.flags || []).filter((x) => x.type !== 'sheepconfirm'); } }
    else if (op === 'priminall' && j.primin) { const c = D.contacts.find((x) => x.id === j.primin); if (c) { c.tags = c.tags.filter((t2) => t2 !== 'pa'); if (!c.tags.includes('pi')) c.tags.push('pi'); touch(c); } }
    else if ((op === 'lrpast' || op === 'lrundo') && j.linkRev) { const c = D.contacts.find((x) => x.id === j.linkRev.cid); if (c) { const prev = catOf(c); c.links = op === 'lrundo' ? c.links.filter((l) => l.bid !== j.linkRev.bid) : c.links.map((l) => (l.bid === j.linkRev.bid ? { bid: l.bid, past: true } : l)); reindex(); if (prev) setOne(c, prev); touch(c); } }
    else if (op === 'linkallpast' && j.linkSug) { const c = D.contacts.find((x) => x.id === j.linkSug.cid); if (c && !c.links.some((l) => l.bid === j.linkSug.bid)) { const prev = catOf(c); c.links.push({ bid: j.linkSug.bid, past: true }); reindex(); if (prev) setOne(c, prev); touch(c); } }
    else if (op === 'linkall' && j.linkSug) { const c = D.contacts.find((x) => x.id === j.linkSug.cid); if (c && !c.links.some((l) => l.bid === j.linkSug.bid)) { const prev = catOf(c); c.links.push({ bid: j.linkSug.bid }); reindex(); if (prev) setOne(c, prev); touch(c); } }
    else if (op === 'primall' && j.primSuggest) { const b = IDX.biz.get(j.id), c = D.contacts.find((x) => x.id === j.primSuggest); if (b && c) { b.primaryContact = c.id; touch(b); if (!c.tags.includes('pa') && !c.tags.includes('pi')) { c.tags.push('pa'); touch(c); } } }
    else if (op === 'bizonlyall' && j.bizonly) { const c = D.contacts.find((x) => x.id === j.bizonly.cid), b = IDX.biz.get(j.bizonly.bid); if (c && b) convertBizOnly(c, b); }
    else if (op === 'noprimreq' || op === 'nonclient') { const b = IDX.biz.get(j.id); if (b) { b.primaryRequired = false; if (op === 'nonclient') setBizType(b, 'nonclient'); touch(b); } }
  });
  S.jobSel.clear(); NEXT_LOG_LABEL = `Jobs: ${label.replace(/^✓ /, '')} (${sel.length})`; photoCache.clear(); if (await changed()) { Sync.soon(); toast('✓ Done — ' + sel.length + ' job' + (sel.length === 1 ? '' : 's')); }
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
function jobItemHtml(j, inline) { // one job with all its buttons — used on the Jobs list and on the contact / business itself
  const t = j.type;
  return `<div class="job ${S.jobSel.has(j.key) ? 'jobsel' : ''}">${inline ? '' : `<input type="checkbox" class="jobcheck" data-act="job-sel" data-key="${h(j.key)}" ${S.jobSel.has(j.key) ? 'checked' : ''} aria-label="Select this job">`}<div class="t">${inline ? '' : `<div class="who">${h(j.who)}</div><div class="note">${h(j.note)}</div>`}${j.suggest ? `<div class="note" style="color:#0d5c20;font-weight:600">Suggested: ${j.suggest.km} km return (${h(j.suggest.why)})</div>` : ''}${j.photoSuggest ? `<div class="note" style="color:#0d5c20;font-weight:600">Suggested: ${h(tagName(j.photoSuggest))} photo</div>` : ''}${j.warnTxt ? `<div class="body" style="background:#fff5f5;border:1px solid #f3c2c2;border-radius:8px;padding:6px 8px;margin:4px 0;font-size:14.5px;white-space:pre-wrap">${h(j.warnTxt)}</div>` : ''}<div class="acts">
      ${['conflict', 'bizonly', 'biznodetails', 'linksuggest', 'oddbiz', 'primnolink', 'linkreview'].includes(t) ? '' : `<button class="btn small" data-act="job-open" data-kind="${j.kind}" data-id="${j.id}" ${j.fid ? `data-fid="${j.fid}"` : ''}>Make a change</button>`}
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
      ${j.bizonly ? `<button class="btn small greenbtn" data-act="bizonly-convert" data-cid="${j.bizonly.cid}" data-bid="${j.bizonly.bid}">✓ Yes — it's just the business (move details onto it)</button><button class="btn small" data-act="edit-contact" data-id="${j.bizonly.cid}">Edit contact</button><button class="btn small" data-act="edit-biz" data-id="${j.bizonly.bid}">Edit business</button>` : ''}
      ${j.type === 'biznodetails' ? `<button class="btn small primary" data-act="edit-biz" data-id="${j.id}">Add phone / email</button>` : ''}
      ${j.warnTxt ? (() => { const w = j.warnSrc; const farms = w.fid ? [IDX.farms.get(w.fid)].filter(Boolean) : (w.kind === 'contact' ? bizOf(D.contacts.find((x) => x.id === w.id) || { links: [] }) : [IDX.biz.get(w.bid)].filter(Boolean)).flatMap((b) => b.farms); const A = (to, extra, lbl) => `<button class="btn small" data-act="warn-apply" data-to="${to}" data-k="${h(j.key)}" ${extra}>${lbl}</button>`;
        return `${A('general', '', '⚠ Apply as general warning')}${farms.slice(0, 5).map((f) => A('farm', `data-fid="${f.id}"`, `⚠ Apply as farm warning: ${h(f.name || 'farm')}`)).join('')}${A('side', '', '📝 Apply as side note')}${w.sec ? `<button class="btn small" data-act="warn-remove" data-k="${h(j.key)}" style="color:var(--red)">Remove *WARNING* section from general info</button>` : ''}`; })() : ''}
      ${j.primin ? `<button class="btn small greenbtn" data-act="primin-fix" data-cid="${j.primin}">✓ Change to Primary (inactive)</button>` : ''}
      ${j.linkRev ? `<button class="btn small" data-act="link-past" data-cid="${j.linkRev.cid}" data-bid="${j.linkRev.bid}" data-v="1">Past employee</button><button class="btn small" data-act="linkrev-undo" data-cid="${j.linkRev.cid}" data-bid="${j.linkRev.bid}" style="color:var(--red)">Undo — remove the link</button><button class="btn small" data-act="open" data-kind="contact" data-id="${j.linkRev.cid}">View contact</button>` : ''}
      ${j.linkSug ? `<button class="btn small greenbtn" data-act="biz-link-pick" data-cid="${j.linkSug.cid}" data-bid="${j.linkSug.bid}">✓ Link as current employee</button><button class="btn small greenbtn" data-act="link-pick-past" data-cid="${j.linkSug.cid}" data-bid="${j.linkSug.bid}">✓ Link as past employee</button><button class="btn small" data-act="open" data-kind="contact" data-id="${j.linkSug.cid}">View contact</button><button class="btn small" data-act="open" data-kind="business" data-id="${j.linkSug.bid}">View business</button>` : ''}
      ${j.oddbiz ? `<button class="btn small primary" data-act="oddbiz-fix" data-bid="${j.oddbiz}">Sort out this name…</button><button class="btn small" data-act="edit-biz" data-id="${j.oddbiz}">Rename by hand</button>` : ''}
      ${j.primSuggest ? `<button class="btn small greenbtn" data-act="prim-set" data-bid="${j.id}" data-cid="${j.primSuggest}">✓ Make ${h(fullName(D.contacts.find((x) => x.id === j.primSuggest) || { first: '' }))} the primary contact</button>` : ''}
      ${j.type === 'primnolink' ? `<button class="btn small primary" data-act="edit-contact" data-id="${j.id}">Edit contact</button>` : ''}
      ${j.nocat ? `<button class="btn small primary" data-act="cat-edit" data-bid="${j.nocat}">Choose categories for the business…</button>` : ''}
      ${j.catdiff ? `<button class="btn small primary" data-act="cat-edit" data-bid="${j.catdiff.bid}">Choose categories…</button>` : ''}
      ${j.catdiff ? [...new Set((IDX.bizContacts.get(j.catdiff.bid) || []).map(catOf))].filter(Boolean).map((v) => `<button class="btn small" data-act="cat-all" data-bid="${j.catdiff.bid}" data-tag="${v}" data-on="1">Everyone: ${h(v ? tagName(v) : 'no category')}</button>`).join('') : ''}
      ${j.pick ? j.pick.alts.map((v) => `<button class="btn small" data-act="catpick-use" data-kind="${j.pick.kind}" data-id="${j.pick.id}" data-tag="${v}">↩ Keep previous category: ${h(tagName(v))}</button>`).join('') : ''}
      ${j.cat ? `<button class="btn small greenbtn" data-act="cat-apply" data-cid="${j.cat.cid}" data-at="${j.cat.at}">✓ Yes — change them too</button>` : ''}
      ${j.block ? `<button class="btn small greenbtn" data-act="block-yes" data-cid="${j.block}">✓ Yes — number blocked</button>${(D.contacts.find((x) => x.id === j.block) || { tags: [] }).tags.includes('blockedn') ? '' : `<button class="btn small" data-act="block-no" data-cid="${j.block}">Not yet</button>`}` : ''}
      ${j.photoSuggest ? `<button class="btn small" style="background:var(--green-bg);border-color:var(--green)" data-act="use-photo" data-id="${j.id}" data-tag="${j.photoSuggest}">✓ Use suggested: ${h(tagName(j.photoSuggest))}</button>` : ''}
      <button class="btn small" data-act="job-ai" data-key="${h(j.key)}" title="Ask Claude how to sort this out">🤖 Ask Claude</button>${JOB_TYPES[t].manual ? `<button class="btn small" data-act="job-dismiss" data-key="${h(j.key)}">${j.okLabel ? '✓ ' + h(j.okLabel) : JOB_TYPES[t].btn || 'Mark resolved - changes not required'}</button>` : ''}</div></div></div>`;
}
function renderJobs() {
  const js = jobs(); const groups = {};
  js.forEach((j) => (groups[j.type] = groups[j.type] || []).push(j));
  let html = `<div class="d-wrap"><h2 class="sec-h" style="font-size:26px">${h(lab('jobs'))} — things to check</h2>
  <div class="hint" style="margin-bottom:10px">Items clear automatically once fixed. Flags also show on the contact or business itself.</div>
  <div class="actions"><button class="btn primary" data-act="jobs-refresh">⟳ Refresh jobs</button><button class="btn" data-act="check-dist">Check all distances against Google Maps</button></div><div id="check-msg" class="hint"></div>`;
  if (!js.length) html += `<div class="empty">Nothing needs attention. 🎉</div>`;
  Object.keys(JOB_TYPES).forEach((t) => {
    const g = groups[t]; if (!g) return;
    const isOpen = !!S.jobOpen[t]; // folded unless you open it
    const nSel = g.filter((j) => S.jobSel.has(j.key)).length; const ops = bulkOps(t, g.filter((j) => S.jobSel.has(j.key)));
    html += `<details class="jobgroup" data-type="${t}" ${isOpen ? 'open' : ''}><summary><input type="checkbox" class="jobcheck" data-act="job-selall" data-type="${t}" title="Select all" ${nSel && nSel === g.length ? 'checked' : ''}><span style="color:var(--red)">${ICONS.flag}</span><span style="flex:1">${h(JOB_TYPES[t].t)}</span><span class="count">${g.length}</span></summary>`;
    if (nSel) html += `<div class="bulkbar"><b>${nSel} selected</b>${t === 'nocat' ? `<select id="jb-cat" style="padding:6px;border:1px solid var(--line);border-radius:8px">${[...RATINGS, ...D.tags.filter((x) => x.group === 'client').map((x) => x.id)].map((v) => `<option value="${v}">${h(tagName(v))}</option>`).join('')}</select>` : ''}${ops.map((o) => `<button class="btn small ${o.green ? 'greenbtn' : ''}" data-act="job-bulk" data-type="${t}" data-op="${o.op}">${h(o.label)}</button>`).join('') || '<span class="hint">Nothing can be done to all of these at once — use each job\'s own buttons.</span>'}<button class="btn small" data-act="job-selnone" data-type="${t}">Clear selection</button></div>`;
    g.forEach((j) => { html += jobItemHtml(j); });
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
      if (f.kmReturn != null && Math.abs(f.kmReturn - exact) > routeSet().kmTol) { f.flags.push({ type: 'kmcheck', google: g, note: `Recorded ${f.kmReturn} km return — Google Maps says ${exact.toFixed(1)} km return (${fmtMin(r.min)} each way)` }); n++; }
    });
    Object.keys(D.dismissed || {}).forEach((k) => { if (k.startsWith('kmcheck:')) { D.dismissed[k] = 0; D._dismissDirty = true; } });
    changed(); toast(`${n} farm${n === 1 ? '' : 's'} more than 1 km out`);
  } catch (e) { msg.textContent = e.message; }
}

/* ---------------- settings ---------------- */
// every Settings card folds up to its heading; tap a heading to open it (stays open until closed)
/* ---------------- Ask Claude (copy & paste through the person's own Claude account) ---------------- */
function aiRecords(req, scope) {
  const cOut = (c) => ({ id: c.id, name: fullName(c), first: c.first, middle: c.middle, last: c.last, role: c.role, category: catOf(c) || null, categorySetOnContact: !followsBiz(c), tags: c.tags.filter((t) => !isCatTag(t) && !RATING_SET.has(t)), businesses: curLinks(c).map((l) => l.bid), pastBusinesses: c.links.filter((l) => l.past).map((l) => l.bid), mobiles: c.mobiles, landlines: c.landlines, emails: c.emails, postal: c.postal, info: c.info, warnings: c.warnings, sideNotes: c.sideNotes, ...(c.ice ? { ice: c.ice } : {}) });
  const bOut = (b) => ({ id: b.id, name: b.name, type: isClientBiz(b) ? 'client' : 'nonclient', category: bizCat(b) || null, primaryContact: b.primaryContact || null, contacts: (IDX.bizContacts.get(b.id) || []).map((c) => c.id), pastContacts: (IDX.bizPast.get(b.id) || []).map((c) => c.id), phones: b.phones || [], emails: b.emails || [], pics: b.pics, patientIds: b.patientIds, farms: b.farms.map((f) => ({ id: f.id, name: f.name, address: f.address, kmReturn: f.kmReturn, warning: f.warning || '' })), info: b.info, warnings: b.warnings, sideNotes: b.sideNotes });
  if (scope === 'all') return { contacts: D.contacts.map((c) => [c.id, fullName(c), catOf(c) || '', c.links.map((l) => l.bid).join(' '), (c.mobiles[0] || c.landlines[0] || {}).value || '', c.tags.filter((t) => !isCatTag(t) && !RATING_SET.has(t)).join(' ')]), contactColumns: ['id', 'name', 'category', 'businessIds', 'phone', 'tags'], businesses: D.businesses.map((b) => [b.id, b.name, isClientBiz(b) ? 'client' : 'nonclient', bizCat(b) || '', b.pics.map((p) => p.value).join(' '), b.farms.map((f) => (f.name || '') + (f.kmReturn != null ? ' ' + f.kmReturn + 'km' : '')).join('; ')]), businessColumns: ['id', 'name', 'type', 'category', 'PICs', 'farms'], note: 'Short form. Ask me to send full details of specific records if you need their notes.' };
  const t = ' ' + req.toLowerCase().replace(/[^a-z0-9&' -]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const hit = (name) => { const n = (name || '').toLowerCase().trim(); return n.length >= 3 && t.includes(' ' + n + ' '); };
  const cs = new Set(), bs = new Set();
  D.contacts.forEach((c) => { if (hit(fullName(c)) || (c.last && c.last.length >= 4 && t.includes(' ' + c.last.toLowerCase() + ' ')) || (c.first && c.last && hit(c.first + ' ' + c.last))) cs.add(c); });
  D.businesses.forEach((b) => { if (hit(b.name) || (coreBiz(b.name).length >= 6 && t.replace(/[^a-z0-9]/g, '').includes(coreBiz(b.name)))) bs.add(b); });
  ((S.aiExtra || {}).cids || []).forEach((id) => { const c = D.contacts.find((x) => x.id === id); if (c) cs.add(c); }); ((S.aiExtra || {}).bids || []).forEach((id) => { const b = IDX.biz.get(id); if (b) bs.add(b); });
  [...cs].forEach((c) => [...bizOf(c), ...pastBizOf(c)].forEach((b) => bs.add(b))); [...bs].forEach((b) => (IDX.bizContacts.get(b.id) || []).forEach((c) => cs.add(c)));
  return { contacts: [...cs].slice(0, 80).map(cOut), businesses: [...bs].slice(0, 60).map(bOut) };
}
function aiPrompt(req, scope) {
  const data = aiRecords(req, scope);
  const cats = [...RATINGS, ...D.tags.filter((t) => t.group === 'client').map((t) => t.id)].map((id) => `${id} = ${tagName(id)}`).join('; ');
  const addl = D.tags.filter((t) => t.group === 'additional').map((t) => `${t.id} = ${t.name}`).join('; ');
  return `You are helping update the Bovitech Contacts app (a mobile large-animal vet practice's client list in Albany, WA). Below is my request and the relevant records.

MY REQUEST:
${req}

RULES
- If my request is a question, answer it in plain words. If it needs changes, ALSO give one JSON block (in \`\`\`json fences) exactly in the format below — I will paste your reply back into the app, which shows me the changes to confirm.
- Only use ids that appear in the data. For something new, use "new_contact"/"new_business" with a "ref" (like "n1") and use that ref as the id in later changes.
- Each contact and business has exactly ONE category. Category ids: ${cats}. Use "same_as_business" for a contact who should follow their business.
- Additional tags (a contact can have several, but never both pa and pi): ${addl}.
- A link can be a past employee/contact ("past":true) — past links don't set the person's category.
- Business "type" is "client" or "nonclient". Phone/email lists look like [{"label":"Mobile","value":"0400 000 000"}].
- When changing a list (mobiles, emails, postal…) give the WHOLE new list. When changing info, give the WHOLE new text.
- If something is unclear, ask me instead of guessing.

JSON FORMAT
{"summary":"one line describing the changes","changes":[
 {"op":"update_contact","id":"c…","fields":{"first":"","middle":"","last":"","role":"","info":"","warnings":"","sideNotes":"","mobiles":[],"landlines":[],"emails":[],"postal":[],"inactiveReason":"","dnaReason":""}},
 {"op":"update_business","id":"b…","fields":{"name":"","type":"client","info":"","warnings":"","sideNotes":"","phones":[],"emails":[],"postal":[],"inactiveReason":"","dnaReason":""}},
 {"op":"set_category","kind":"contact","id":"c…","category":"a"},
 {"op":"set_category","kind":"business","id":"b…","category":"industry"},
 {"op":"add_tag","id":"c…","tag":"pa"}, {"op":"remove_tag","id":"c…","tag":"pi"},
 {"op":"link","contact":"c…","business":"b…"}, {"op":"link","contact":"c…","business":"b…","past":true}, {"op":"unlink","contact":"c…","business":"b…"},
 {"op":"set_primary","business":"b…","contact":"c…"},
 {"op":"new_business","ref":"n1","fields":{"name":"","type":"client"},"category":"c"},
 {"op":"new_contact","ref":"n2","fields":{"first":"","last":"","mobiles":[]},"businesses":["b…"],"category":"same_as_business"},
 {"op":"trash_contact","id":"c…"}
]}
(Only include the fields you are changing.)

DATA (${scope === 'all' ? 'everyone, short form' : 'records named in my request and who they are linked to'}):
${JSON.stringify(data)}`;
}
function aiApply(text) { // → {done:[lines], errors:[lines]}; changes are made but not saved until confirmed
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i); let raw = m ? m[1] : null;
  if (!raw) { const i = text.indexOf('{"'), j = text.lastIndexOf('}'); if (i >= 0 && j > i) raw = text.slice(i, j + 1); }
  if (!raw) return { none: true };
  let js; try { js = JSON.parse(raw); } catch (e) { return { bad: 'The changes block could not be read (' + e.message + '). Ask Claude to resend the JSON.' }; }
  const done = [], errors = [], refs = {};
  const C = (id) => D.contacts.find((x) => x.id === (refs[id] || id)), B = (id) => IDX.biz.get(refs[id] || id) || D.businesses.find((x) => x.id === (refs[id] || id));
  const okCat = (v) => v === 'same_as_business' || RATING_SET.has(v) || IDX.tags.get(v)?.group === 'client';
  const listF = ['mobiles', 'landlines', 'emails', 'phones'];
  const clean = (k, v) => (listF.includes(k) ? (Array.isArray(v) ? v.filter((x) => x && x.value).map((x) => ({ label: String(x.label || ''), value: String(x.value) })) : []) : k === 'postal' ? (Array.isArray(v) ? v.map(String) : [String(v)]) : String(v ?? ''));
  const CF = ['first', 'middle', 'last', 'role', 'info', 'warnings', 'sideNotes', 'mobiles', 'landlines', 'emails', 'postal', 'inactiveReason', 'dnaReason'];
  const BF = ['name', 'info', 'warnings', 'sideNotes', 'phones', 'emails', 'postal', 'inactiveReason', 'dnaReason'];
  for (const ch of js.changes || []) { try {
    const op = ch.op;
    if (op === 'new_business') { const nb = { id: uid('b'), name: String((ch.fields || {}).name || 'New business'), type: (ch.fields || {}).type === 'nonclient' ? 'nonclient' : 'client', farms: [], pics: [], patientIds: [], info: '', warnings: '', flags: [], rating: null, cats: [], createdAt: Date.now() }; BF.forEach((k) => { if (ch.fields && k in ch.fields) nb[k] = clean(k, ch.fields[k]); }); D.businesses.push(nb); reindex(); if (ch.category && okCat(ch.category) && ch.category !== 'same_as_business') setBizCat(nb, ch.category); touch(nb); if (ch.ref) refs[ch.ref] = nb.id; done.push('New business: ' + nb.name); continue; }
    if (op === 'new_contact') { const f = ch.fields || {}; const c = { id: uid('c'), first: '', middle: '', last: '', role: '', links: [], tags: [], emails: [], mobiles: [], landlines: [], postal: [], info: '', warnings: '', starred: false, photoChoice: 'auto', flags: [], createdAt: Date.now() }; CF.forEach((k) => { if (k in f) c[k] = clean(k, f[k]); }); (ch.businesses || []).forEach((bid) => { const b = B(bid); if (b) c.links.push({ bid: b.id }); }); D.contacts.push(c); reindex(); if (ch.category && okCat(ch.category)) { if (ch.category === 'same_as_business') c.ownCats = false; else setOne(c, ch.category); } touch(c); if (ch.ref) refs[ch.ref] = c.id; done.push('New contact: ' + fullName(c)); continue; }
    if (op === 'update_contact') { const c = C(ch.id); if (!c) throw new Error('contact ' + ch.id + ' not found'); Object.entries(ch.fields || {}).forEach(([k, v]) => { if (CF.includes(k)) { c[k] = clean(k, v); if (k === 'info') delete c.infoHtml; } }); touch(c); done.push('Updated ' + fullName(c) + ': ' + Object.keys(ch.fields || {}).join(', ')); continue; }
    if (op === 'update_business') { const b = B(ch.id); if (!b) throw new Error('business ' + ch.id + ' not found'); Object.entries(ch.fields || {}).forEach(([k, v]) => { if (BF.includes(k)) { b[k] = clean(k, v); if (k === 'info') delete b.infoHtml; } if (k === 'type' && (v === 'client' || v === 'nonclient')) setBizType(b, v); }); touch(b); done.push('Updated ' + b.name + ': ' + Object.keys(ch.fields || {}).join(', ')); continue; }
    if (op === 'set_category') { if (!okCat(ch.category)) throw new Error('unknown category ' + ch.category); if (ch.kind === 'business') { const b = B(ch.id); if (!b) throw new Error('business ' + ch.id + ' not found'); setBizCat(b, ch.category); done.push(b.name + ' → ' + tagName(ch.category)); } else { const c = C(ch.id); if (!c) throw new Error('contact ' + ch.id + ' not found'); if (ch.category === 'same_as_business') { c.tags = c.tags.filter((t) => !isCatTag(t) && !RATING_SET.has(t)); c.ownCats = false; touch(c); done.push(fullName(c) + ' → same as business'); } else { setOne(c, ch.category); done.push(fullName(c) + ' → ' + tagName(ch.category)); } } continue; }
    if (op === 'add_tag' || op === 'remove_tag') { const c = C(ch.id); const tg = IDX.tags.get(ch.tag); if (!c) throw new Error('contact ' + ch.id + ' not found'); if (!tg || tg.group !== 'additional') throw new Error('unknown tag ' + ch.tag); if (op === 'add_tag') { if (!c.tags.includes(ch.tag)) c.tags.push(ch.tag); if (ch.tag === 'pa') c.tags = c.tags.filter((t) => t !== 'pi'); if (ch.tag === 'pi') c.tags = c.tags.filter((t) => t !== 'pa'); } else c.tags = c.tags.filter((t) => t !== ch.tag); touch(c); done.push(`${op === 'add_tag' ? 'Added' : 'Removed'} ${tg.name} ${op === 'add_tag' ? 'to' : 'from'} ${fullName(c)}`); continue; }
    if (op === 'link' || op === 'unlink') { const c = C(ch.contact), b = B(ch.business); if (!c || !b) throw new Error('contact or business not found'); if (op === 'link') { const prev = catOf(c); c.links = c.links.filter((l) => l.bid !== b.id); c.links.push(ch.past ? { bid: b.id, past: true } : { bid: b.id }); reindex(); if (prev) setOne(c, prev); } else c.links = c.links.filter((l) => l.bid !== b.id); touch(c); done.push(`${op === 'link' ? 'Linked' : 'Unlinked'} ${fullName(c)} ${op === 'link' ? 'to' : 'from'} ${b.name}`); continue; }
    if (op === 'set_primary') { const c = C(ch.contact), b = B(ch.business); if (!c || !b) throw new Error('contact or business not found'); b.primaryContact = c.id; if (!c.tags.includes('pa') && !c.tags.includes('pi')) { c.tags.push('pa'); touch(c); } touch(b); done.push(fullName(c) + ' made primary for ' + b.name); continue; }
    if (op === 'trash_contact') { const c = C(ch.id); if (!c) throw new Error('contact ' + ch.id + ' not found'); done.push('Moved ' + fullName(c) + ' to the trash'); trashContact(c); continue; }
    throw new Error('unknown change "' + op + '"');
  } catch (e) { errors.push(e.message); } }
  reindex(); return { done, errors, summary: js.summary || '' };
}
document.addEventListener('input', (e) => { if (e.target.id === 'ai-req') S.aiReq = e.target.value; if (e.target.id === 'ai-reply') S.aiReply = e.target.value; });
function collapseSettings() {
  S.setOpen = S.setOpen || new Set();
  document.querySelectorAll('#list .d-wrap > .card').forEach((card) => {
    const h3 = card.querySelector(':scope > h3'); if (!h3) return;
    const title = (h3.querySelector('.sp') || h3).textContent.trim().replace(/\s*\(this device\)\s*$/, '');
    const det = document.createElement('details'); det.className = 'card setsec'; det.dataset.sec = title; if (S.setOpen.has(title)) det.open = true;
    const sum = document.createElement('summary'); sum.innerHTML = `<span>${h3.innerHTML.replace(/<button[\s\S]*?<\/button>/g, '').replace(/<span class="sp">|<\/span>/g, '')}</span>`; det.appendChild(sum);
    const body = document.createElement('div'); body.className = 'setbody';
    const btns = [...h3.querySelectorAll('button')]; if (btns.length) { const bar = document.createElement('div'); bar.className = 'actions'; btns.forEach((b) => bar.appendChild(b)); body.appendChild(bar); }
    h3.remove(); while (card.firstChild) body.appendChild(card.firstChild); det.appendChild(body);
    det.addEventListener('toggle', () => { det.open ? S.setOpen.add(title) : S.setOpen.delete(title); });
    card.replaceWith(det);
  });
}
function renderSettings() {
  const st = D.settings;
  return `<div class="d-wrap"><h2 class="sec-h" style="font-size:26px">${h(lab('settings'))}</h2>
  <div class="card"><h3>🤖 Ask Claude</h3>
    <div class="hint" style="margin-bottom:8px">Free — uses your own Claude account. 1) Type what you want. 2) Tap <b>Copy for Claude</b> and paste it into Claude. 3) Copy Claude's whole reply, paste it in box 3 and tap <b>Check changes</b>. Nothing is saved until you confirm.</div>
    <div class="f"><label>1. What do you want Claude to do or find?</label><textarea id="ai-req" style="min-height:70px" placeholder="e.g. Link Kiara Trowbridge to Zambonetti Transport and make her C client · Which A clients have no PIC? · Make all the Ravenhill contacts A+">${h(S.aiReq || '')}</textarea></div>
    <div class="f"><label>Send Claude</label><select id="ai-scope"><option value="mentioned">Only the people and businesses named in my request (plus who they're linked to)</option><option value="all" ${S.aiScope === 'all' ? 'selected' : ''}>Everyone, in short form (for questions across all clients)</option></select></div>
    <div class="actions"><button class="btn primary" data-act="ai-copy">2. Copy for Claude &amp; open Claude</button></div><div id="ai-copyinfo" class="hint"></div>
    <details style="margin-top:8px"><summary class="hint" style="cursor:pointer">Open a particular Claude chat or project instead of a new chat${D.settings.aiChatUrl ? ' <b>(set)</b>' : ''}</summary>
      <div class="hint" style="margin:6px 0">Open the chat (or Claude project) in Claude, copy its address from the address bar or Share menu, and paste it here. Leave empty to start a new chat each time. Applies on every device.</div>
      <div class="search"><input id="ai-chaturl" value="${h(D.settings.aiChatUrl || '')}" placeholder="https://claude.ai/chat/…"><button class="btn small" data-act="ai-chat-save">Save</button></div></details>
    <div class="f" style="margin-top:10px"><label>3. Paste Claude's reply here</label><textarea id="ai-reply" style="min-height:90px" placeholder="Paste Claude's whole reply">${h(S.aiReply || '')}</textarea></div>
    <div class="actions"><button class="btn primary" data-act="ai-apply">Check changes</button></div><div id="ai-result" class="hint">${S.aiResult || ''}</div></div>
  <div class="card"><h3><span class="sp">Tags &amp; photos</span><button class="btn small" data-act="new-tag">+ New tag</button></h3>
  ${['client', 'additional'].map((g) => `<div class="lbl" style="margin-top:10px">${{ client: 'Contact category', additional: 'Additional tags' }[g]}${g === 'client' ? ' <span class="hint">(A+ to C are set on the business)</span>' : ''}</div>${D.tags.filter((t) => (g === 'client' ? t.group === 'rating' || t.group === 'client' : t.group === g)).map((t) => { const src = tagPhotoSrc(t.id); const n = D.contacts.filter((c) => contactTagSet(c).has(t.id)).length; return `<div class="kv" style="align-items:center">${src ? `<img src="${src}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">` : '<span style="width:36px;height:36px;border-radius:50%;background:#eee;display:inline-block"></span>'}<div class="v">${h(t.name)} <span class="hint">${n} contact${n === 1 ? '' : 's'}</span></div><button class="btn small" data-act="edit-tag" data-id="${t.id}">Edit</button></div>`; }).join('')}`).join('')}</div>
  <div class="card"><h3>Photo priority</h3><div class="hint" style="margin-bottom:6px">When a contact has more than one tag with a photo and nobody has chosen one, the tag highest on this list is shown. Use the arrows to reorder. Changes apply on every device.</div>
  ${photoOrder().map((id, i, arr) => `<div class="kv" style="align-items:center"><span style="width:22px;color:var(--ink3);font-weight:600">${i + 1}</span><img src="${tagPhotoSrc(id)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover"><div class="v">${h(tagName(id))}</div><button class="btn small" data-act="prio" data-id="${id}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class="btn small" data-act="prio" data-id="${id}" data-dir="1" ${i < arr.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button></div>`).join('')}
  ${D.settings.photoPriority ? '<div class="actions" style="margin-top:8px"><button class="btn small" data-act="prio-reset">Reset to default order</button></div>' : ''}</div>
  <div class="card"><h3>This device</h3><div class="f"><label>Your name and device (shown in the change log)</label><div class="search"><input id="s-devname" value="${h((() => { try { return localStorage.getItem('bvt-devname') || ''; } catch (e) { return ''; } })())}" placeholder="e.g. Amelia – office PC"><button class="btn small" data-act="devname-save">Save</button></div></div>
    <div class="lbl" style="margin-top:8px">Devices using the app</div>${Object.entries(D.devices || {}).sort((a, b) => (b[1].last || 0) - (a[1].last || 0)).map(([k, v]) => `<div class="kv"><div class="k">${h(v.name || 'Device')}${k === DEVICE ? ' <span class="hint">(this one)</span>' : ''}</div><div class="v">last synced ${v.last ? new Date(v.last).toLocaleString('en-AU') : '—'} · v${h(v.ver || '?')}</div></div>`).join('') || '<div class="hint">Devices appear here after they sync.</div>'}</div>
  <div class="card"><h3>Display <span class="hint">(this device)</span></h3><div class="grid2">
    <div class="f"><label>Appearance</label><select data-pref="theme">${[['auto', 'Match the phone / computer'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${(PREF.theme || 'auto') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="f"><label>Text size</label><select data-pref="size">${[['normal', 'Normal'], ['large', 'Large'], ['xl', 'Extra large']].map(([v, l]) => `<option value="${v}" ${(PREF.size || 'normal') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div></div>
  <div class="card"><h3>Start-up defaults <span class="hint">(this device)</span></h3><div class="grid2">
    <div class="f"><label>Open on</label><select data-pref="tab">${TABS.map(([k]) => `<option value="${k}" ${(PREF.tab || 'contacts') === k ? 'selected' : ''}>${h(lab(k))}</option>`).join('')}</select></div>
    <div class="f"><label>${h(lab('contacts'))} sorted by</label><select data-pref="sort">${[['first', 'First name'], ['last', 'Surname'], ['business', 'Business'], ['rating', 'Rating'], ['tag', 'Tag']].map(([v, l]) => `<option value="${v}" ${(PREF.sort || 'first') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="f"><label>${h(lab('contacts'))} show</label><select data-pref="ptype">${[['all', 'All'], ['client', 'Client people'], ['nonclient', 'Non-client people']].map(([v, l]) => `<option value="${v}" ${(PREF.ptype || 'all') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="f"><label>${h(lab('biz'))} sorted by</label><select data-pref="bsort">${[['name', 'Name'], ['rating', 'Rating']].map(([v, l]) => `<option value="${v}" ${(PREF.bsort || 'name') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="f"><label>${h(lab('biz'))} show</label><select data-pref="btype">${[['all', 'All'], ['client', 'Client businesses'], ['nonclient', 'Non-client businesses']].map(([v, l]) => `<option value="${v}" ${(PREF.btype || 'all') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div></div>
  <div class="card"><h3>Jobs to show <span class="hint">(this device)</span></h3><div class="hint" style="margin-bottom:6px">Untick job types you don't want on this device's Jobs list and badge.</div><div class="checks">${Object.entries(JOB_TYPES).map(([k, v]) => `<label><input type="checkbox" data-jobtype="${k}" ${(PREF.jobsOff || []).includes(k) ? '' : 'checked'}>${h(v.t)}</label>`).join('')}</div></div>
  <div class="card"><h3>Required information</h3><div class="hint" style="margin-bottom:6px">New contacts can always be saved — anything ticked here that's missing goes on the Jobs list ("New contact — information missing"). Farm details are only asked for client people.</div><div class="checks">${REQ_FIELDS.map(([k, l]) => `<label><input type="checkbox" data-req="${k}" ${reqOn(k) ? 'checked' : ''}>${h(l)}</label>`).join('')}</div></div>
  <div class="card"><h3>Travel and routes</h3><div class="hint" style="margin-bottom:6px">Google Maps calculates the fastest route. These options apply to the app's km, drive-time and route calculations (the Google Maps app uses its own route options).</div>
    <div class="checks"><label><input type="checkbox" data-route="avoidTolls" ${routeSet().avoidTolls ? 'checked' : ''}>Avoid tolls</label><label><input type="checkbox" data-route="avoidHighways" ${routeSet().avoidHighways ? 'checked' : ''}>Avoid highways</label><label><input type="checkbox" data-route="avoidFerries" ${routeSet().avoidFerries ? 'checked' : ''}>Avoid ferries</label></div>
    <div class="grid2" style="margin-top:8px"><div class="f"><label>Two farm pins count as the same spot within (metres)</label><input type="number" data-routenum="pinM" value="${routeSet().pinM}"></div><div class="f"><label>Flag a distance when it differs from Google by more than (km)</label><input type="number" step="0.5" data-routenum="kmTol" value="${routeSet().kmTol}"></div></div></div>
  <div class="card"><h3>Backups</h3><div class="hint" style="margin-bottom:6px">A copy of everything is saved to Google Drive every night after 12 am (by the first device that's open and online), and the last 30 are kept. ${PREF.lastBackup ? 'Last checked on this device: ' + h(PREF.lastBackup) + '.' : ''}</div>
    <div class="actions"><button class="btn small" data-act="backup-now">Back up now</button><button class="btn small" data-act="backup-list">Show backups / restore…</button></div><div id="backup-res"></div></div>
  <div class="card"><h3>Export</h3><div class="hint" style="margin-bottom:6px">Download everything — for ezyVet imports, mail-outs or your own records. (For a filtered list, use ${h(lab('search'))} → Download list.)</div>
    <div class="actions"><button class="btn small" data-act="exp-people">${h(lab('contacts'))} (CSV / Excel)</button><button class="btn small" data-act="exp-biz">${h(lab('biz'))} (CSV / Excel)</button><button class="btn small" data-act="exp-vcf">${h(lab('contacts'))} (vCard for phones)</button><button class="btn small" data-act="export">Full backup file (JSON)</button></div></div>
  <div class="card"><h3>Google Contacts (caller ID) options</h3><div class="hint" style="margin-bottom:6px">Choose the device that does it under Sync below. These options apply to whichever device it is.</div>
    <div class="checks"><label><input type="checkbox" data-gpush="warnRing" ${(D.settings.gpush || {}).warnRing === false ? '' : 'checked'}>Show the red CHECK WARNING ring on caller photos</label><label><input type="checkbox" data-gpush="split" ${(D.settings.gpush || {}).split === false ? '' : 'checked'}>Allow split photos (two categories)</label></div>
    <div class="lbl" style="margin-top:8px">Categories to send to Google Contacts</div><div class="checks">${[...RATINGS, ...D.tags.filter((t) => t.group === 'client').map((t) => t.id)].map((id) => `<label><input type="checkbox" data-gskip="${id}" ${((D.settings.gpush || {}).skip || []).includes(id) ? '' : 'checked'}>${h(tagName(id))}</label>`).join('')}</div></div>
  <div class="card"><h3>General info templates</h3><div class="hint" style="margin-bottom:6px">New contacts and businesses start with these headings in their general info.</div>
    <div class="f"><label>New contact</label><textarea id="s-tplc" style="min-height:160px">${h(D.settings.tplContact != null ? D.settings.tplContact : TPL_CONTACT)}</textarea></div>
    <div class="f"><label>New business</label><textarea id="s-tplb" style="min-height:90px">${h(D.settings.tplBiz != null ? D.settings.tplBiz : TPL_BIZ)}</textarea></div>
    <div class="actions"><button class="btn small primary" data-act="tpl-save">Save templates</button><button class="btn small" data-act="tpl-reset">Reset to standard</button></div></div>
  <div class="card"><h3>Categories — client or non-client?</h3><div class="hint" style="margin-bottom:8px">Decides who shows under "Client" and "Non-client" on the ${h(lab('contacts'))} and ${h(lab('biz'))} lists and in Search. A business with a category follows this; a business with no category uses its own Business type.</div>
    <div class="kv" style="font-weight:700"><div class="k">Category</div><div class="v" style="display:flex;gap:8px"><span style="flex:1">${h(lab('contacts'))}</span><span style="flex:1">${h(lab('biz'))}</span></div></div>
    ${[...RATINGS, ...D.tags.filter((t) => t.group === 'client').map((t) => t.id)].map((id) => `<div class="kv" style="align-items:center"><div class="k">${h(tagName(id))}</div><div class="v" style="display:flex;gap:8px">${['p', 'b'].map((w) => `<select data-catclass="${w}" data-cat="${id}" style="flex:1;padding:6px;border:1px solid var(--line);border-radius:8px"><option value="c">Client</option><option value="n" ${catClass(w, id) === 'n' ? 'selected' : ''}>Non-client</option></select>`).join('')}</div></div>`).join('')}
    ${(st.catClass && (Object.keys(st.catClass.p || {}).length || Object.keys(st.catClass.b || {}).length)) ? '<div class="actions" style="margin-top:8px"><button class="btn small" data-act="catclass-reset">Reset to default</button></div>' : ''}</div>
  <div class="card"><h3>Menu names</h3><div class="hint" style="margin-bottom:6px">Rename the menu headings. Leave a box empty to use the standard name. Applies to every device.</div>
    ${Object.keys(TAB_DEFAULTS).map((k) => `<div class="f"><label>${h(TAB_DEFAULTS[k])}</label><input data-label="${k}" value="${h((st.labels || {})[k] || '')}" placeholder="${h(TAB_DEFAULTS[k])}"></div>`).join('')}</div>
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
const KINDS = ['contacts', 'businesses', 'tags', 'routes'];
const strip = (r) => { const o = { ...r }; delete o._dirty; return o; };
const adopt = (l, s) => { Object.keys(l).forEach((k) => delete l[k]); Object.assign(l, s); return l; }; // overwrite a record in place (keeps references held by open screens)
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
    const out = { format: 1, savedAt: new Date().toISOString(), savedBy: DEVICE, settings: strip(D.settings), deleted: (D.deleted || []).map(({ id, kind, at }) => ({ id, kind, at })), dismissed: D.dismissed || {}, devices: D.devices || {}, importedAt: D.importedAt, trash: (D.trash || []).filter((t) => Date.now() - t.at < 90 * 864e5), changelog: (D.changelog || []).slice(0, 400) };
    KINDS.forEach((k) => (out[k] = D[k].map(strip)));
    return JSON.stringify(out);
  },
  async upload(id) {
    // bump revisions of everything we are sending that changed here
    KINDS.forEach((k) => D[k].forEach((r) => { if (r._dirty) r._rev = (r._rev || 0) + 1; }));
    if (D.settings._dirty) D.settings._rev = (D.settings._rev || 0) + 1;
    D.devices = D.devices || {}; D.devices[DEVICE] = { name: deviceName(), last: Date.now(), ver: APP_VERSION.split(' ')[0] }; delete D._devDirty;
    const delSent = (D.deleted || []).filter((x) => !x.synced);
    const body = this.serial();
    // mark as sent now: anything changed while the upload is in progress gets marked again and goes up next time
    const sent = []; KINDS.forEach((k) => D[k].forEach((x) => { if (x._dirty) { sent.push(x); delete x._dirty; } }));
    const flags = { s: !!D.settings._dirty, d: !!D._dismissDirty, t: !!D._trashDirty, l: !!D._logDirty }; delete D.settings._dirty; delete D._dismissDirty; delete D._trashDirty; delete D._logDirty;
    const undo = () => { sent.forEach((x) => (x._dirty = true)); if (flags.s) D.settings._dirty = true; if (flags.d) D._dismissDirty = true; if (flags.t) D._trashDirty = true; if (flags.l) D._logDirty = true; };
    try {
    let r;
    if (id) r = await gfetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&fields=id,version`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    else {
      const fd = new FormData();
      fd.append('metadata', new Blob([JSON.stringify({ name: DATA_FILE, mimeType: 'application/json', description: 'Bovitech Contacts app data — do not edit by hand' })], { type: 'application/json' }));
      fd.append('file', new Blob([body], { type: 'application/json' }));
      r = await gfetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,version', { method: 'POST', body: fd });
    }
    if (!r.ok) throw new Error('Drive upload error ' + r.status);
    var js = await r.json();
    } catch (e) { undo(); throw e; }
    delSent.forEach((x) => (x.synced = true));
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
        if (!l._dirty) { if ((s._rev || 0) !== (l._rev || 0) || s._u !== l._u) { changes++; adopt(l, s); } out.push(l); return; } // update in place so open screens keep the same record
        if ((s._rev || 0) === (l._rev || 0)) { out.push(l); return; } // only changed here
        if (JSON.stringify({ ...strip(l), _rev: 0, _u: 0, _dev: 0 }) === JSON.stringify({ ...s, _rev: 0, _u: 0, _dev: 0 })) { out.push(adopt(l, s)); return; } // same edit both sides
        // changed on both devices → keep theirs, park ours for the user to choose
        for (let q = conflicts.length - 1; q >= 0; q--) if (conflicts[q].key === k + ':' + s.id) conflicts.splice(q, 1);
        conflicts.push({ key: k + ':' + s.id, kind: k, id: s.id, who: k === 'contacts' ? fullName(s) : s.name, mine: strip(l), mineAt: l._u, theirsAt: s._u, theirsDev: s._dev });
        out.push(adopt(l, s)); changes++;
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
    { const dv = { ...(srv.devices || {}) }; Object.entries(D.devices || {}).forEach(([k, v]) => { if (!dv[k] || (v.last || 0) > (dv[k].last || 0)) dv[k] = v; }); D.devices = dv; }
    const tm = new Map(); [...(srv.trash || []), ...(D.trash || [])].forEach((t) => { const e = tm.get(t.tid); if (!e || t.removed) tm.set(t.tid, t); }); D.trash = [...tm.values()];
    const lm = new Map(); [...(srv.changelog || []), ...(D.changelog || [])].forEach((e) => { const x = lm.get(e.id); lm.set(e.id, x ? { ...e, undone: x.undone || e.undone } : e); }); D.changelog = [...lm.values()].sort((a, b) => b.at - a.at).slice(0, 400);
    if (srv.importedAt) D.importedAt = srv.importedAt;
    D.firstRun = false;
    return changes;
  },
  async run(interactive) {
    if (!this.enabled() || this.busy) return;
    if (CONFIRM || SHEET) { this.soon(); return; } // don't sync while a change is being made or confirmed
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
        if (pendingCount() || D._devDirty) {
          const m2 = await this.meta(meta.id); // someone else saved while we merged? go round again
          if (m2.version !== meta.version) { D.sync.version = null; continue; }
          await this.upload(meta.id);
        } else D.sync.last = Date.now();
        if (changes) { photoCache.clear(); JOBS_CACHE = null; reindex(); logChanges(); migrate(); logChanges('Automatic update'); baseline(); renderAll(); }
        break;
      }
      save(); this.set(D.conflicts.length ? 'conflict' : 'ok');
      GContacts.maybeRun(); Backup.maybe();
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
    case 'setup': t = n ? `${n} to sync — sign in` : 'Sign in to sync'; cls = n ? 'warn' : 'off'; break;
    case 'error': t = 'Sync error — tap'; cls = 'warn'; break;
    case 'empty': t = 'No contacts yet'; cls = 'off'; break;
    default: t = n ? `${n} to sync — click to sync` : 'Synced'; if (n) cls = 'warn';
  }
  const need = cls === 'warn' ? (cf ? 'cf' : Sync.state) : null;
  if (need !== S.syncNeed) { S.syncNeed = need; clearTimeout(S.syncNudgeTm); if (need) S.syncNudgeTm = setTimeout(() => { if (S.syncNeed !== need) return; const n2 = pendingCount();
    const msg = need === 'cf' ? `<b>Sync conflict</b> — the same contact was changed on two devices. Check Jobs → Sync conflicts.` : need === 'error' ? '<b>Sync problem</b> — tap here to try again.' : need === 'offline' ? `<b>${n2} change${n2 === 1 ? '' : 's'} waiting to sync</b> — will sync when back online.` : need === 'setup' ? `<b>${n2} change${n2 === 1 ? '' : 's'} need${n2 === 1 ? 's' : ''} syncing</b> — tap here to sign in to Google and sync.` : `<b>${n2} change${n2 === 1 ? '' : 's'} need${n2 === 1 ? 's' : ''} syncing</b> — tap here to sync.`;
    nudge($('#sync'), msg, 'sync:' + need); }, 8000); }
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
  </div>`;
}
const FRIENDLY = { phones: 'Phone', first: 'First name', last: 'Surname', middle: 'Middle name', role: 'Role', links: 'Businesses', tags: 'Categories / tags', mobiles: 'Mobile', landlines: 'Landline', emails: 'Email', postal: 'Postal address', info: 'General info', warnings: 'General warnings', sideNotes: 'Side notes', dnaReason: 'Do not answer reason', starred: 'Starred', photoChoice: 'Photo', name: 'Name', rating: 'A+ to C', cats: 'Categories', pics: 'PIC', patientIds: 'Patient IDs', farms: 'Farms', primaryContact: 'Primary contact', type: 'Business type' };
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
    const rec = { ...cf.mine, _rev: cur ? cur._rev : cf.mine._rev }; if (cur) Object.keys(cur).forEach((k) => { if (!k.startsWith('_') && !(k in cf.mine)) rec[k] = cur[k]; }); touch(rec); // fields only the other version has (e.g. added by a newer app version) are kept
    if (j >= 0) arr[j] = rec; else { arr.push(rec); D.deleted = D.deleted.filter((x) => x.id !== cf.id); }
  }
  D.conflicts.splice(i, 1);
}
function conflictSheet(cf) {
  openSheet('Sync conflict — ' + cf.who, `<p>This was changed on two devices before they synced. Choose which version to keep. Differences only:</p>${conflictDiff(cf)}`, () => true);
  $('#sheet-save').style.display = 'none';
}

/* ---------------- Google Contacts push (one designated device) ---------------- */
// a non-client business with its own phone/email is pushed to Google Contacts like a contact (for caller ID)
function contactToBiz(c, kind) { // "This entry is a business": use the same-named linked business, or create one
  let b = bizOf(c).find((x) => sameAsBizName(c, x));
  const cat = catOf(c) || (kind === 'industry' ? 'industry' : '');
  if (!b) { b = { id: uid('b'), name: fullName(c), farms: [], pics: [], patientIds: [], info: '', warnings: '', flags: [], rating: null, cats: [], createdAt: Date.now() }; D.businesses.push(b); reindex(); if (cat) setBizCat(b, cat); }
  else if (!bizCat(b) && cat) setBizCat(b, cat);
  setBizType(b, kind === 'client' ? 'client' : 'nonclient');
  if (c.dnaReason && !b.dnaReason) b.dnaReason = c.dnaReason; if (c.inactiveReason && !b.inactiveReason) b.inactiveReason = c.inactiveReason;
  convertBizOnly(c, b); return b;
}
function obRow(p, b, allowRename) { // one part of a business name in the "Sort out business name" screen
  const ex = p.role || !p.text ? null : findBizByText(p.text, b.id); const def = p.role ? 'role' : ex ? 'existing' : !p.text ? 'find' : allowRename ? 'rename' : (isClientBiz(b) ? 'newclient' : 'newind');
  const o = (v, l) => `<option value="${v}" ${def === v ? 'selected' : ''}>${l}</option>`;
  return `<div class="card ob-row" style="padding:10px;margin-bottom:8px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input class="ob-text" value="${h(p.text || '')}" placeholder="Name of this part" style="flex:2;min-width:180px;padding:9px;border:1px solid var(--line);border-radius:9px"><select class="ob-what" style="flex:2;min-width:240px;padding:9px;border:1px solid var(--line);border-radius:9px">
    ${o('rename', `Rename "${h(b.name.slice(0, 30))}…" to this (keeps its farms, PICs, IDs)`)}
    ${ex ? o('existing', `Existing: ${h(ex.name)} — current employee`) + o('existing-past', `Existing: ${h(ex.name)} — past employee`) : ''}
    ${o('find', 'Find an existing business — current employee…')}${o('find-past', 'Find an existing business — past employee…')}
    ${o('newclient', 'New client business')}${o('newind', 'New non-client (industry) business')}
    ${o('role', 'Not a business — a role/note (put in Role)')}<option value="skip">Ignore</option></select></div>
    <input type="hidden" class="ob-ex" value="${ex ? ex.id : ''}"><div class="ob-findwrap" style="margin-top:6px;${def.startsWith('find') ? '' : 'display:none'}"><div class="hint ob-chosen">${ex && def.startsWith('find') ? 'Chosen: ' + h(ex.name) : 'No business chosen yet — search below.'}</div><input class="ob-find" placeholder="Search businesses…" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:9px;margin-top:4px"><div class="ob-findres"></div></div></div>`;
}
document.addEventListener('change', (e) => { if (!e.target.classList.contains('ob-what')) return; const row = e.target.closest('.ob-row'); const f = e.target.value.startsWith('find'); row.querySelector('.ob-findwrap').style.display = f ? '' : 'none'; if (f) { row.querySelector('.ob-ex').value = ''; row.querySelector('.ob-chosen').textContent = 'No business chosen yet — search below.'; row.querySelector('.ob-find').focus(); } });
document.addEventListener('input', (e) => { if (!e.target.classList.contains('ob-find')) return; const row = e.target.closest('.ob-row'); const pq = parseQuery(e.target.value); const res = pq.inc.length ? D.businesses.filter((x) => x.id !== S.obBid && matchQ(bizHay(x), pq)).slice(0, 8) : [];
  row.querySelector('.ob-findres').innerHTML = e.target.value.trim() ? `<div class="results">${res.map((x) => `<div data-act="ob-findpick" data-id="${x.id}"><b>${h(x.name)}</b> <span class="hint">${isClientBiz(x) ? 'client' : 'non-client'} · ${(IDX.bizContacts.get(x.id) || []).length} contacts</span></div>`).join('') || '<div class="hint">No matches.</div>'}</div>` : ''; });
function oddBizSheet(b) {
  if (!b) return; const cs = IDX.bizContacts.get(b.id) || []; const parts = parseBizName(b.name);
  const hasStuff = b.farms.length || b.pics.length || b.patientIds.length; let renamed = false;
  S.obBid = b.id; let renamed2 = false; const row = (p) => { const r = obRow(p, b, !renamed2); if (r.includes('value="rename" selected')) renamed2 = true; return r; };
  const body = `<p>Current name: <b>${h(b.name)}</b></p><div class="hint" style="margin-bottom:8px">I've split the name into its parts — check each one. Every contact ticked below is linked to each business you keep, and roles go into their Role field (if it's empty).</div>
    <div id="ob-rows">${parts.map(row).join('')}</div><button type="button" class="btn small" data-act="ob-add">+ Add a part</button>
    <div class="f" style="margin-top:12px"><span class="lbl">Contacts at this business</span><div class="checks">${cs.map((c) => `<label><input type="checkbox" class="ob-c" value="${c.id}" checked>${h(fullName(c))}</label>`).join('') || '<span class="hint">No contacts linked.</span>'}</div></div>
    ${hasStuff ? '<div class="hint">This business has farms, PICs or patient IDs, so one part must be "Rename … to this".</div>' : '<div class="hint">If no part is "Rename … to this", the old business goes to the trash once its contacts are linked to the other businesses.</div>'}`;
  openSheet('Sort out business name', body, () => {
    const rows = [...document.querySelectorAll('#ob-rows .ob-row')].map((r) => ({ text: r.querySelector('.ob-text').value.trim() || (IDX.biz.get(r.querySelector('.ob-ex').value) || {}).name || '', what: r.querySelector('.ob-what').value, ex: (r.querySelector('.ob-ex') || {}).value })).filter((r) => r.text && r.what !== 'skip');
    if (rows.some((r) => r.what.startsWith('find') && !IDX.biz.get(r.ex))) { toast('Search and pick the existing business for each "Find…" part'); return false; }
    const ren = rows.filter((r) => r.what === 'rename'); if (ren.length > 1) { toast('Only one part can be the rename'); return false; } if (!ren.length && hasStuff) { toast('Choose which part this business is renamed to (it has farms, PICs or IDs)'); return false; }
    if (!rows.some((r) => r.what !== 'role')) { toast('At least one part must be a business'); return false; }
    const ticked = [...document.querySelectorAll('#sheet .ob-c')].filter((x) => x.checked).map((x) => D.contacts.find((c) => c.id === x.value)).filter(Boolean);
    const targets = [], pastTargets = [];
    rows.forEach((r) => { if (r.what === 'rename') { b.name = r.text; touch(b); targets.push(b); }
      else if (r.what === 'existing' || r.what === 'find') { const x = IDX.biz.get(r.ex); if (x) targets.push(x); }
      else if (r.what === 'existing-past' || r.what === 'find-past') { const x = IDX.biz.get(r.ex); if (x) pastTargets.push(x); }
      else if (r.what === 'newclient' || r.what === 'newind') { const nb = { id: uid('b'), name: r.text, type: r.what === 'newclient' ? 'client' : 'nonclient', farms: [], pics: [], patientIds: [], info: '', warnings: '', flags: [], rating: null, cats: [], createdAt: Date.now() }; if (nb.type === 'nonclient') { nb.primaryRequired = false; nb.cats = ['industry']; } else if (bizCat(b)) setBizCat(nb, bizCat(b)); touch(nb); D.businesses.push(nb); targets.push(nb); } });
    const roles = rows.filter((r) => r.what === 'role').map((r) => r.text).join(', ');
    reindex();
    ticked.forEach((c) => { const prev = catOf(c); const before = c.links.length; targets.forEach((t) => { const l = c.links.find((x) => x.bid === t.id); if (!l) c.links.push(roles && t !== b ? { bid: t.id, role: roles } : { bid: t.id }); else if (l.past) delete l.past; }); pastTargets.forEach((t) => { if (!c.links.some((x) => x.bid === t.id)) c.links.push({ bid: t.id, past: true }); }); if (!ren.length) c.links = c.links.filter((l) => l.bid !== b.id); if (roles && !c.role) c.role = roles; reindex(); if (prev) setOne(c, prev); touch(c); });
    if (!ren.length && !(IDX.bizContacts.get(b.id) || []).filter((c) => !ticked.includes(c)).length) { reindex(); trashBiz(b); }
    S.sel = { kind: 'business', id: (targets[0] || pastTargets[0] || b).id }; NEXT_LOG_LABEL = `Sorted out business name "${parts.map((p) => p.text).join(' / ')}"`; return true;
  });
}
function convertBizOnly(c, b) { // contact that was really just the business → its details move onto the business
  const ph = [...c.mobiles.map((p) => ({ label: p.label || 'Mobile', value: p.value })), ...c.landlines.map((p) => ({ label: p.label || 'Phone', value: p.value }))], em = c.emails.map((p) => ({ label: p.label || '', value: p.value }));
      const has = (arr, v) => arr.some((x) => x.value.replace(/\s/g, '') === v.replace(/\s/g, ''));
      b.phones = b.phones || []; ph.forEach((p) => { if (!has(b.phones, p.value)) b.phones.push(p); }); b.emails = b.emails || []; em.forEach((p) => { if (!has(b.emails, p.value)) b.emails.push(p); });
      b.postal = [...new Set([...(b.postal || []), ...c.postal])];
      const join = (x, y) => [x, y].filter((t) => (t || '').trim()).join('\n\n');
      if ((c.info || '').trim()) { b.info = join(b.info, c.info); delete b.infoHtml; } if ((c.warnings || '').trim()) b.warnings = join(b.warnings, c.warnings); if ((c.sideNotes || '').trim()) b.sideNotes = join(b.sideNotes, c.sideNotes);
      if (c.gid && !b.gid) b.gid = c.gid; // keep the same Google Contacts entry for caller ID
      if (b.primaryContact === c.id) b.primaryContact = null; touch(b);
  trashContact(c);
}
function bizPseudo(b) { return { id: 'b:' + b.id, _biz: b, gid: b.gid, first: b.name, middle: '', last: '', role: '', links: [{ bid: b.id }], tags: [], ownCats: false, mobiles: (b.phones || []).filter((p) => /^(\+?61\s?4|04)/.test(p.value.replace(/\s/g, ''))).map((p) => ({ ...p })), landlines: (b.phones || []).filter((p) => !/^(\+?61\s?4|04)/.test(p.value.replace(/\s/g, ''))).map((p) => ({ ...p })), emails: (b.emails || []).map((p) => ({ ...p })), postal: [], warnings: '', photoChoice: 'auto', flags: [] }; }
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
      organizations: bs.length ? bs.map((b, i) => ({ name: b.name, title: (c.links.find((l) => l.bid === b.id) || {}).role || (i === 0 ? c.role || '' : '') })) : c.role ? [{ title: c.role }] : [],
    };
    return p;
  },
  spec(c) { const g = D.settings.gpush || {}; const sp = photoSpec(c); if (g.warnRing === false) sp.warn = false; if (g.split === false && sp.parts && sp.parts.length > 1) sp.parts = sp.parts.slice(0, 1).map((x) => ({ tag: x.tag })); return sp; },
  hash(c) { const s = JSON.stringify([this.person(c), this.spec(c)]); let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return x.toString(36); },
  maybeRun() { if (this.st.on && !this.running && GAuth.valid()) this.run(); },
  async run() {
    if (this.running) return; this.running = true;
    const skip = new Set((D.settings.gpush || {}).skip || []);
    const todo = [...D.contacts, ...D.businesses.filter((b) => bizHasDetails(b) && (!isClientBiz(b) || !(IDX.bizContacts.get(b.id) || []).length)).map(bizPseudo)].filter((c) => !skip.has(catOf(c)) && this.st.done[c.id] !== this.hash(c));
    let n = 0, fails = 0;
    const msg = (m) => { this.st.msg = m; this.persist(); };
    try {
      for (const c of todo) {
        if (!this.st.on || !navigator.onLine || !GAuth.valid()) break;
        try { await this.push(c); this.st.done[c.id] = this.hash(c); if (c._biz && c.gid && c._biz.gid !== c.gid) { c._biz.gid = c.gid; touch(c._biz); save(); } n++; }
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
      gid = (await r.json()).resourceName; c.gid = gid; if (!c._biz) { touch(c); save(); }
    }
    const src = await renderPhoto(this.spec(c), 480);
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
    toast('Syncing…'); await Sync.run(true); if (Sync.state === 'error') toast(Sync.msg); else if (Sync.state === 'signin' || Sync.state === 'setup') toast('Sign in to Google to sync'); else toast(pendingCount() ? 'Sync finished — some changes still waiting' : '✓ Synced — everything is up to date'); renderAll();
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
    case 'role': return [c.role, ...c.links.map((l) => l.role)].filter(Boolean).join(' ');
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
function advBizMatch(b, A) {
  const hay = (bizHay(b) + ' ' + (b.farms || []).map((f) => [f.name, f.address, f.info, f.warning].join(' ')).join(' ')).toLowerCase();
  const wAll = words(A.all), wAny = words(A.any), wNone = words(A.none), ph = A.phrase.trim().toLowerCase();
  if (wAll.length && !wAll.every((w) => hay.includes(w))) return false; if (wAny.length && !wAny.some((w) => hay.includes(w))) return false;
  if (wNone.length && wNone.some((w) => hay.includes(w))) return false; if (ph && !hay.includes(ph)) return false;
  const ts = new Set([bizCat(b)].filter(Boolean));
  if (A.tAll.length && !A.tAll.every((t) => ts.has(t))) return false; if (A.tAny.length && !A.tAny.some((t) => ts.has(t))) return false; if (A.tNone.length && A.tNone.some((t) => ts.has(t))) return false;
  const yn = (v, cond) => (v === '' ? true : v === 'yes' ? cond : !cond);
  if (!yn(A.warn, !!(b.warnings || '').trim())) return false; if (!yn(A.farmWarn, b.farms.some((f) => f.seeWarning))) return false;
  if (!yn(A.flagged, jobs().some((j) => j.kind === 'business' && j.id === b.id))) return false;
  const cs = IDX.bizContacts.get(b.id) || [];
  for (const m of A.missing) {
    if (m === 'email' && ((b.emails || []).length || cs.some((c) => c.emails.length))) return false;
    if ((m === 'phone' || m === 'mobile') && ((b.phones || []).length || cs.some((c) => c.mobiles.length || (m === 'phone' && c.landlines.length)))) return false;
    if (m === 'business' && cs.length) return false; // "no contacts"
    if (m === 'pin' && b.farms.some((f) => f.lat != null)) return false;
    if (m === 'km' && !b.farms.some((f) => f.kmReturn == null)) return false;
    if (m === 'pic' && b.pics.length) return false; if (m === 'pid' && b.patientIds.length) return false;
    if (m === 'rating' && bizCat(b)) return false; if (m === 'primary' && (!isClientBiz(b) || primaryOf(b))) return false;
  }
  const farmTests = []; const cmp = (op, a, c) => (op === '<' ? a < c : op === '≤' ? a <= c : op === '>' ? a > c : op === '≥' ? a >= c : op === '=' ? Math.abs(a - c) < 0.5 : true);
  [['kmOp', 'kmVal', 'kmReturn'], ['kmOp2', 'kmVal2', 'kmReturn'], ['minOp', 'minVal', 'driveMin'], ['minOp2', 'minVal2', 'driveMin']].forEach(([o, v, field]) => { if (A[o] && A[v] !== '') farmTests.push((f) => f[field] != null && cmp(A[o], f[field], +A[v])); });
  if (A.nearKm !== '') { const ctr = advCentre(A); if (ctr) farmTests.push((f) => f.lat != null && hav(ctr, f) <= +A.nearKm); }
  if (farmTests.length && !b.farms.some((f) => farmTests.every((t) => t(f)))) return false;
  return true;
}
function advBizResults() { const k = S.adv.kind; return D.businesses.filter((b) => (k === 'client') === isClientBiz(b) && advBizMatch(b, S.adv)).sort((a, b) => alphaCmp(a.name, b.name)); }
function renderAdvBizResults() {
  const r = advBizResults(); S.advBSel = S.advBSel || new Set(); const ids = new Set(r.map((b) => b.id)); [...S.advBSel].forEach((id) => { if (!ids.has(id)) S.advBSel.delete(id); });
  const nSel = S.advBSel.size; const word = S.adv.kind === 'client' ? 'client business' : 'non-client business';
  let html = `<div class="card"><h3><input type="checkbox" class="jobcheck" data-act="advb-selall" title="Select all results" ${nSel && nSel === r.length ? 'checked' : ''}><span class="sp">${r.length} ${word}${r.length === 1 ? '' : 'es'} found${nSel ? ` · ${nSel} selected` : ''}</span></h3>
  ${nSel ? `<div class="bulkbar" style="border-radius:9px;margin:0 0 8px;justify-content:space-between"><b>${nSel} selected</b><span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn primary" data-act="advb-edit" style="font-size:16px">✏️ Edit selected…</button><button class="btn" data-act="advb-selnone">Clear selection</button></span></div>` : ''}<ul class="list">`;
  r.slice(0, 300).forEach((b) => { const cs = IDX.bizContacts.get(b.id) || []; html += `<li class="item ${S.advBSel.has(b.id) ? 'jobsel' : ''}" data-act="open" data-kind="business" data-id="${b.id}"><input type="checkbox" class="jobcheck" data-act="advb-sel" data-id="${b.id}" ${S.advBSel.has(b.id) ? 'checked' : ''} aria-label="Select"><div class="t"><div class="n">${bizCat(b) && RATING_SET.has(bizCat(b)) ? rbadge(bizCat(b)) : ''}${h(b.name)}</div><div class="s">${h(bizCat(b) ? tagName(bizCat(b)) : 'no category')} · ${cs.length} contact${cs.length === 1 ? '' : 's'} · ${b.farms.length} farm${b.farms.length === 1 ? '' : 's'}${cs.length ? ' · ' + h(cs.map((c) => c.first).join(', ')) : ''}</div></div></li>`; });
  if (r.length > 300) html += `<li class="empty">Showing the first 300 — narrow the search.</li>`;
  return html + '</ul></div>';
}
function advBizEditSheet() {
  const list = D.businesses.filter((b) => S.advBSel.has(b.id)); if (!list.length) return;
  const body = `<div class="hint" style="margin-bottom:8px">Editing: ${h(list.slice(0, 8).map((b) => b.name).join(', '))}${list.length > 8 ? ` and ${list.length - 8} more` : ''}</div>
  <div class="lbl" style="font-size:15px">1. What do you want to change?</div>
  <label class="bkop"><input type="radio" name="bbop" value="cat"><span><b>Set category</b><br><span class="hint">contacts set to "Same as business" follow it</span></span></label>
  <label class="bkop"><input type="radio" name="bbop" value="client"><span><b>Make them client businesses</b></span></label>
  <label class="bkop"><input type="radio" name="bbop" value="nonclient"><span><b>Make them non-client (industry) businesses</b><br><span class="hint">no primary contact needed</span></span></label>
  <label class="bkop"><input type="radio" name="bbop" value="trash"><span><b>Move them to the trash</b><br><span class="hint">their contacts stay; restore from Settings → Trash</span></span></label>
  <div class="f" style="margin-top:10px"><span class="lbl">2. Category (only for "Set category")</span>${catPicker('bbc', '', null)}</div>`;
  openSheet(`Edit ${list.length} business${list.length === 1 ? '' : 'es'}`, body, async () => {
    const op = ($('#sheet input[name=bbop]:checked') || {}).value; if (!op) { toast('Choose what to change'); return false; }
    if (op === 'cat') { const v = rtVal($('#sheet'), 'bbc'); if (!v) { toast('Tick a category'); return false; } list.forEach((b) => { if (bizCat(b) !== v) setBizCat(b, v); }); NEXT_LOG_LABEL = `Search: set ${list.length} businesses to ${tagName(v)}`; }
    if (op === 'client' || op === 'nonclient') { list.forEach((b) => { setBizType(b, op); }); NEXT_LOG_LABEL = `Search: made ${list.length} businesses ${op === 'client' ? 'client' : 'non-client'}`; }
    if (op === 'trash') { if (!(await ask(`Move these ${list.length} businesses to the trash?\n\n${list.slice(0, 15).map((b) => b.name).join(', ')}${list.length > 15 ? '…' : ''}`, 'Yes — move to trash', true))) return false; list.forEach((b) => trashBiz(b)); NEXT_LOG_LABEL = `Search: moved ${list.length} businesses to the trash`; }
    S.advBSel.clear(); return true;
  });
}
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
  const kind = A.kind || 'people';
  return `<div class="d-wrap"><h2 class="sec-h" style="font-size:26px">${h(lab('search'))}</h2>
  <div class="card"><h3>Search for</h3><div class="seg">${[['people', '👤 People'], ['client', '🐄 Client businesses'], ['nonclient', '🏢 Non-client businesses']].map(([v, l]) => `<button class="${kind === v ? 'on' : ''}" data-act="adv-kind" data-v="${v}">${l}</button>`).join('')}</div></div>
  <div class="actions" style="margin:-4px 0 10px"><button class="btn" data-act="area-ai" data-v="search">🤖 Ask Claude about these results</button></div>
  <div class="hint" style="margin:-4px 0 10px">Fill in as many or as few boxes as you like — results must match everything you fill in. Tick results to bulk edit them. Tip: put a phrase in "quotes" to keep words together.</div>
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
  <div id="adv-results">${kind === 'people' ? renderAdvResults() : renderAdvBizResults()}</div></div>`;
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
    <div data-need="setcat"><div class="checks big" data-rtgroup="bkc">${[['=biz', 'Same as business'], ...RATINGS.map((x) => [x, tagName(x)]), ...cats.map((t) => [t.id, t.name])].map(([v, l]) => `<label class="${v === '' || v === '=biz' || RATING_SET.has(v) ? 'rt' : ''}"><input type="checkbox" data-rt="${v}" ${v === '=biz' ? 'checked' : ''}>${h(l)}</label>`).join('')}</div>
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
  if (op === 'setcat' && !pickC) { toast('Tick a category'); return false; }
  if ((pickC === 'inactive' || pickC === 'dna') && !$('#bk-reason').value.trim()) { toast('Please add the reason'); return false; }
  if ((op === 'tag-add' || op === 'tag-remove') && !tagsT.length) { toast('Tick at least one tag'); return false; }
  let biz = null, linkMatch = null;
  if (op === 'link') { const nm = $('#bk-biz').value.trim(); if (!nm) { toast('Type or pick a business name'); return false; } biz = D.businesses.find((b) => b.name.toLowerCase() === nm.toLowerCase()); if (!biz) { if (!(await askBox('New business?', askText(`"${nm}" doesn't exist yet. Create it and link the contacts to it?`), 'Yes — create it'))) return false; biz = newBusiness(nm); } }
  if (op === 'link' && bizCat(biz)) { const diff = list.filter((c) => !c.links.some((l) => l.bid === biz.id) && catOf(c) && catOf(c) !== bizCat(biz));
    if (diff.length) { const r = await askLinkCat(diff.length > 4 ? `<b>${diff.length} of these contacts</b> (${h(diff.slice(0, 4).map(fullName).join(', '))}…)` : diff.map((c) => `<b>${h(fullName(c))}</b>`).join(diff.length === 2 ? ' and ' : ', '), biz, [...new Set(diff.map((c) => tagName(catOf(c))))].join(' / ')); if (!r) return false; linkMatch = new Set(r === 'match' ? diff.map((c) => c.id) : []); } }
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
    else if (op === 'link') { if (!c.links.some((l) => l.bid === biz.id)) { const prev = catOf(c); c.links.push({ bid: biz.id }); reindex(); if ((!prev || (linkMatch && linkMatch.has(c.id))) && bizCat(biz)) setOne(c, bizCat(biz)); else if (prev) setOne(c, prev); touch(c); } }
    const after = effCats(c);
    if (!before.includes('inactive') && after.includes('inactive')) { c.flags = c.flags || []; c.flags.push({ type: 'ezyvet', at: Date.now() }); }
    if (!before.includes('dna') && after.includes('dna') && !c.tags.includes('blockedc')) { c.flags = c.flags || []; c.flags.push({ type: 'blockcheck', at: Date.now() }); }
  });
  const label = BULK_OPS.find((o) => o[0] === op)[1] + (op === 'setcat' ? ` to ${pickC === '=biz' ? 'same as business' : pickC ? tagName(pickC) : 'no category'}` : op.startsWith('tag') ? ` ${tagsT.map((t) => `"${tagName(t)}"`).join(', ')}` : op === 'link' ? ` ${biz.name}` : '');
  NEXT_LOG_LABEL = `Search: ${label} (${list.length})`; photoCache.clear(); Sync.soon();
  const items = diffTouched(false); if (!items.length) { toast('Nothing to change — they already have that'); return false; }
  S.advSelPending = true; return true;
}
function refreshAdv() { const el = $('#adv-results'); if (el) el.innerHTML = (S.adv.kind || 'people') === 'people' ? renderAdvResults() : renderAdvBizResults(); }
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
  else if (a === 'adv-kind') { S.adv.kind = el.dataset.v; renderAll(); }
  else if (a === 'advb-sel') { e.stopPropagation(); el.checked ? S.advBSel.add(el.dataset.id) : S.advBSel.delete(el.dataset.id); refreshAdv(); }
  else if (a === 'advb-selall') { advBizResults().forEach((b) => (el.checked ? S.advBSel.add(b.id) : S.advBSel.delete(b.id))); refreshAdv(); }
  else if (a === 'advb-selnone') { S.advBSel.clear(); refreshAdv(); }
  else if (a === 'advb-edit') advBizEditSheet();
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
  } else if (a === 'go-adv') { S.adv.kind = 'people'; S.tab = 'search'; S.sel = null; renderAll(); }
  else if (a === 'go-adv-biz') { S.adv.kind = S.btype === 'nonclient' ? 'nonclient' : 'client'; S.tab = 'search'; S.sel = null; renderAll(); }
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
/* ---------------- Merge with… (pick the other record, settle any conflicts, then merge) ---------------- */
function mergeStart(kind, id) {
  const isC = kind === 'contact'; const a = isC ? D.contacts.find((x) => x.id === id) : IDX.biz.get(id); if (!a) return;
  openSheet(`Merge ${isC ? fullName(a) : a.name} with…`, `<div class="hint" style="margin-bottom:6px">Search for the ${isC ? 'person' : 'business'} to merge into <b>${h(isC ? fullName(a) : a.name)}</b>. Their numbers, emails, ${isC ? 'businesses' : 'farms, PICs, contacts'} and notes are combined; if anything clashes you'll be asked which to keep. The other record goes to the trash (it can be restored).</div>
    <input id="mg-search" data-kind="${kind}" data-id="${id}" placeholder="Search by name${isC ? ' or phone' : ''}" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:9px;font-size:16px"><div id="mg-res"></div>`, () => true);
  $('#sheet-save').style.display = 'none'; setTimeout(() => $('#mg-search') && $('#mg-search').focus(), 50);
}
function mergeConflicts(kind, a, b) { // → [{key, label, a, b, text}] fields where both have different values
  const out = []; const add = (key, label, va, vb, text) => { const x = (va ?? '').toString().trim(), y = (vb ?? '').toString().trim(); if (x && y && x !== y) out.push({ key, label, a: va, b: vb, text }); };
  if (kind === 'contact') {
    add('first', 'First name', a.first, b.first); add('middle', 'Middle / nickname', a.middle, b.middle); add('last', 'Surname', a.last, b.last); add('role', 'Role', a.role, b.role);
    add('category', 'Category', catOf(a) ? tagName(catOf(a)) : '', catOf(b) ? tagName(catOf(b)) : ''); const pr = (c) => (c.tags.includes('pa') ? 'Primary (active)' : c.tags.includes('pi') ? 'Primary (inactive)' : ''); add('primary', 'Primary tag', pr(a), pr(b));
    add('inactiveReason', 'Inactive reason', a.inactiveReason, b.inactiveReason, true); add('dnaReason', 'Do not answer reason', a.dnaReason, b.dnaReason, true);
    add('warnings', 'General warnings', a.warnings, b.warnings, true); add('sideNotes', 'Side notes', a.sideNotes, b.sideNotes, true); add('info', 'General info', a.info, b.info, true);
  } else {
    add('name', 'Business name', a.name, b.name); add('type', 'Client / non-client', isClientBiz(a) ? 'Client' : 'Non-client', isClientBiz(b) ? 'Client' : 'Non-client'); add('category', 'Category', bizCat(a) ? tagName(bizCat(a)) : '', bizCat(b) ? tagName(bizCat(b)) : '');
    const pc = (x) => (x.primaryContact && D.contacts.find((c) => c.id === x.primaryContact) ? fullName(D.contacts.find((c) => c.id === x.primaryContact)) : ''); add('primaryContact', 'Primary contact', pc(a), pc(b));
    add('inactiveReason', 'Inactive reason', a.inactiveReason, b.inactiveReason, true); add('dnaReason', 'Do not answer reason', a.dnaReason, b.dnaReason, true);
    add('warnings', 'General warnings', a.warnings, b.warnings, true); add('sideNotes', 'Side notes', a.sideNotes, b.sideNotes, true); add('info', 'General info', a.info, b.info, true);
  }
  return out;
}
function mergeSheet(kind, aId, bId) {
  const isC = kind === 'contact'; const get = (id) => (isC ? D.contacts.find((x) => x.id === id) : IDX.biz.get(id)); const a = get(aId), b = get(bId); if (!a || !b) return;
  const nm = (r) => (isC ? fullName(r) : r.name); const cf = mergeConflicts(kind, a, b);
  const opt = (c, v, label, checked) => `<label style="display:flex;gap:6px;align-items:flex-start;margin:3px 0"><input type="radio" name="mg-${c.key}" value="${v}" ${checked ? 'checked' : ''}><span style="white-space:pre-wrap">${label}</span></label>`;
  const short = (t) => h(String(t).length > 300 ? String(t).slice(0, 300) + '…' : String(t));
  const body = `<p>Merging <b>${h(nm(b))}</b> into <b>${h(nm(a))}</b>. Phone numbers, emails, addresses, ${isC ? 'linked businesses and tags' : 'farms, PICs, patient IDs and contacts'} are combined automatically.</p>
    ${cf.length ? `<div class="lbl" style="font-size:15px;margin-top:8px">These are different — choose what to keep:</div>${cf.map((c) => `<div class="card" style="padding:10px;margin:6px 0"><div style="font-weight:700;margin-bottom:4px">${h(c.label)}</div>${opt(c, 'a', `<b>${h(nm(a))}:</b> ${short(c.a)}`, !c.text)}${opt(c, 'b', `<b>${h(nm(b))}:</b> ${short(c.b)}`, false)}${c.text ? opt(c, 'both', 'Keep both (one after the other)', true) : ''}</div>`).join('')}` : '<div class="hint">No clashes — everything can be combined.</div>'}
    <div class="hint" style="margin-top:8px">${h(nm(b))} will be moved to the trash (restore it from Settings → Trash if needed).</div>`;
  openSheet(`Merge ${isC ? 'contacts' : 'businesses'}`, body, () => {
    const pick = {}; cf.forEach((c) => { pick[c.key] = (document.querySelector(`#sheet input[name="mg-${c.key}"]:checked`) || {}).value || 'a'; });
    const chosenCat = (pick.category === 'b') ? (isC ? catOf(b) : bizCat(b)) : (isC ? catOf(a) : bizCat(a)) || (isC ? catOf(b) : bizCat(b));
    const keepText = {}; cf.filter((c) => c.text).forEach((c) => { keepText[c.key] = pick[c.key] === 'a' ? a[c.key] : pick[c.key] === 'b' ? b[c.key] : [a[c.key], b[c.key]].filter(Boolean).join('\n\n'); });
    const scal = {}; cf.filter((c) => !c.text && !['category', 'primary', 'type', 'primaryContact'].includes(c.key)).forEach((c) => { scal[c.key] = pick[c.key] === 'b' ? b[c.key] : a[c.key]; });
    if (isC) {
      const prim = pick.primary === 'b' ? (b.tags.includes('pa') ? 'pa' : 'pi') : pick.primary === 'a' ? (a.tags.includes('pa') ? 'pa' : 'pi') : null;
      mergeContacts(a, b); // a past link only on the other record stays past
      Object.assign(a, scal); Object.entries(keepText).forEach(([k, v]) => { a[k] = v; if (k === 'info') delete a.infoHtml; });
      if (prim) { a.tags = a.tags.filter((t) => t !== 'pa' && t !== 'pi'); a.tags.push(prim); } else if (a.tags.includes('pa') && a.tags.includes('pi')) a.tags = a.tags.filter((t) => t !== 'pi');
      reindex(); if (chosenCat) setOne(a, chosenCat); touch(a);
    } else {
      const typeB = isClientBiz(b), typeA = isClientBiz(a); const primB = b.primaryContact;
      a.phones = [...(a.phones || []), ...(b.phones || []).filter((p) => !(a.phones || []).some((q) => lastDigits(q.value) === lastDigits(p.value)))]; a.emails = [...(a.emails || []), ...(b.emails || []).filter((p) => !(a.emails || []).some((q) => q.value.toLowerCase() === p.value.toLowerCase()))]; a.postal = [...new Set([...(a.postal || []), ...(b.postal || [])])];
      a.sideNotes = a.sideNotes || b.sideNotes; a.inactiveReason = a.inactiveReason || b.inactiveReason; a.dnaReason = a.dnaReason || b.dnaReason;
      const pastB = new Set(D.contacts.filter((c) => c.links.some((l) => l.bid === b.id && l.past)).map((c) => c.id)); const hadA = new Set(D.contacts.filter((c) => c.links.some((l) => l.bid === a.id)).map((c) => c.id));
      mergeBiz(a, b); D.contacts.forEach((c) => { if (pastB.has(c.id) && !hadA.has(c.id)) { c.links = c.links.map((l) => (l.bid === a.id ? { bid: a.id, past: true } : l)); touch(c); } }); // past employees of the other business stay past
      Object.assign(a, scal); Object.entries(keepText).forEach(([k, v]) => { a[k] = v; if (k === 'info') delete a.infoHtml; });
      if (pick.primaryContact === 'b') a.primaryContact = primB; reindex(); if (chosenCat) setBizCat(a, chosenCat);
      if (pick.type) setBizType(a, (pick.type === 'b' ? typeB : typeA) ? 'client' : 'nonclient'); touch(a);
    }
    NEXT_LOG_LABEL = `Merged ${nm(b)} into ${nm(a)}`; S.sel = { kind, id: a.id }; return true;
  }, '');
  $('#sheet-save').textContent = 'Merge';
}
function mergeContacts(keep, other) {
  const uni = (a, b, key) => { const out = [...a]; b.forEach((x) => { if (!out.some((y) => key(y) === key(x))) out.push(x); }); return out; };
  const join = (a, b) => [...new Set([a, b].map((x) => (x || '').trim()).filter(Boolean))].join('\n');
  keep.mobiles = uni(keep.mobiles, other.mobiles, (p) => lastDigits(p.value)); keep.landlines = uni(keep.landlines, other.landlines, (p) => lastDigits(p.value));
  keep.emails = uni(keep.emails, other.emails, (e) => e.value.toLowerCase()); keep.postal = [...new Set([...keep.postal, ...other.postal])];
  keep.tags = [...new Set([...keep.tags, ...other.tags])]; keep.links = uni(keep.links, other.links, (l) => l.bid);
  keep.info = join(keep.info, other.info); if (keep.infoHtml || other.infoHtml) keep.infoHtml = [keep.infoHtml || h(keep.info || ''), other.infoHtml || ''].filter(Boolean).join('<br>');
  keep.warnings = join(keep.warnings, other.warnings); keep.role = keep.role || other.role; keep.starred = keep.starred || other.starred; keep.gid = keep.gid || other.gid;
  keep.sideNotes = keep.sideNotes || other.sideNotes; keep.inactiveReason = keep.inactiveReason || other.inactiveReason; keep.dnaReason = keep.dnaReason || other.dnaReason;
  if ((!keep.photoChoice || keep.photoChoice === 'auto') && other.photoChoice && other.photoChoice !== 'auto') { keep.photoChoice = other.photoChoice; if (other.photoData) keep.photoData = other.photoData; }
  if (other.ice && other.ice.length) { keep.ice = keep.ice || []; other.ice.forEach((i) => { if (i.cid !== keep.id && !keep.ice.some((x) => x.cid === i.cid)) keep.ice.push(i); }); }
  D.contacts.forEach((c) => { if (c !== other && (c.ice || []).some((i) => i.cid === other.id)) { c.ice = c.ice.map((i) => (i.cid === other.id ? { ...i, cid: keep.id } : i)).filter((i, k, arr) => i.cid !== c.id && arr.findIndex((y) => y.cid === i.cid) === k); touch(c); } });
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
/* ---------------- *WARNING* sections inside general info ---------------- */
const WSEC_RX = /^\s*\*+\s*warnings?\s*\*+\s*:?\s*$/i, HEAD_RX = /^\s*\*[^*\n]{2,40}\*\s*:?\s*$/;
const WARNY_RX = /\btake care\b|\bcaution\b|\bbeware\b|\bdanger|\baggressive\b|\bdo not (?:book|service|go|attend|call|enter|use)\b|\bdon'?t (?:use|go|enter|lock|put)\b|\bkick(?:s|ing)?\b|\bbad payer\b|\bslow payer\b|\bunpaid\b|\bbad debt|\bpay(?:s)? up ?front\b|\bdoes not hold\b|\bdon'?t hold\b|\bunsafe\b|\bnot safe\b|\bbroken\b|\bcareful\b/i;
function warnSection(info) { // → {start, end, text} of the *WARNING* section (lines), or null
  const L = (info || '').split('\n'); const i = L.findIndex((l) => WSEC_RX.test(l)); if (i < 0) return null;
  let j = i + 1; while (j < L.length && !HEAD_RX.test(L[j])) j++;
  const text = L.slice(i + 1, j).map((l) => l.trim()).filter((l) => l && l !== '-' && l !== '–').join('\n'); return { L, start: i, end: j, text };
}
function warnyLines(info) { const sec = warnSection(info); return (info || '').split('\n').filter((l, k) => (!sec || k < sec.start || k >= sec.end) && WARNY_RX.test(l) && !HEAD_RX.test(l)).map((l) => l.trim()); }
function addToWarnSection(rec, text) { // put warning text (back) under *WARNING* in general info
  text = (text || '').trim(); if (!text) return; const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const sec = warnSection(rec.info);
  if (sec) { const keep = sec.L.slice(sec.start + 1, sec.end).filter((l) => l.trim() && !/^\s*[-–]\s*$/.test(l)); rec.info = [...sec.L.slice(0, sec.start + 1), ...keep, ...lines.filter((l) => !keep.some((k) => k.trim() === l)), ...sec.L.slice(sec.end)].join('\n'); }
  else rec.info = ((rec.info || '').trim() + '\n\n*WARNING*\n' + lines.join('\n')).trim();
  if (rec.infoHtml) { const add = lines.map((l) => `<div>${h(l)}</div>`).join(''); const m = rec.infoHtml.match(/\*\s*WARNINGS?\s*\*\s*:?/i);
    if (m) { const at = rec.infoHtml.indexOf('>', rec.infoHtml.indexOf('</', m.index + m[0].length)); rec.infoHtml = at > 0 ? rec.infoHtml.slice(0, at + 1) + add + rec.infoHtml.slice(at + 1) : rec.infoHtml + add; }
    else rec.infoHtml += `<div><b>*WARNING*</b></div>${add}`; }
}
function removeWarnSection(rec) {
  const sec = warnSection(rec.info); if (!sec) return false;
  rec.info = [...sec.L.slice(0, sec.start), ...sec.L.slice(sec.end)].join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (rec.infoHtml) rec.infoHtml = rec.infoHtml.replace(/\*\s*WARNINGS?\s*\*\s*:?[\s\S]*?(?=\*[A-Za-z][^*<]{1,40}\*|$)/i, '').replace(/(<(div|p)>\s*(<br>)?\s*<\/\2>)+$/i, '');
  return true;
}
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
const recKind = (r) => (r === D.settings ? 'settings' : D.contacts.includes(r) ? 'contacts' : D.businesses.includes(r) ? 'businesses' : D.tags.includes(r) ? 'tags' : (D.routes || []).includes(r) ? 'routes' : null);
const recKeyOf = (kind, r) => (kind === 'settings' ? 'settings' : kind + ':' + r.id);
const recName = (kind, r) => (kind === 'contacts' ? fullName(r) : kind === 'settings' ? 'Settings' : r.name || '');
let DISMISS_SNAP = '{}';
function revertTouched() { // put back everything changed since the last save (used when a change is cancelled)
  // deletions made as part of the cancelled change come back out of the trash too
  PENDING_DEL.forEach((it) => { const t = (D.trash || []).find((x) => x.tid === it.tid); if (!t || t.removed || !t.rec) return;
    const ts = (D.deleted || []).find((x) => x.id === it.id); D.deleted = (D.deleted || []).filter((x) => x.id !== it.id);
    const rec = JSON.parse(JSON.stringify(t.rec)); if (ts && ts.synced) { rec.id = uid(it.kind === 'contacts' ? 'c' : 'b'); touch(rec); }
    if (!D[it.kind].some((x) => x.id === rec.id)) D[it.kind].push(rec);
    if (it.kind === 'businesses') (t.linked || []).forEach((cid) => { const c = D.contacts.find((x) => x.id === cid); if (c && !c.links.some((l) => l.bid === rec.id)) c.links.push({ bid: rec.id }); });
    BASE.set(it.kind + ':' + rec.id, stable(plain(rec))); D.trash = D.trash.filter((x) => x !== t); });
  PENDING_DEL = [];
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
let CATSNAP = new Map(); const snapCats = () => { CATSNAP = new Map(D.contacts.map((c) => [c.id, catOf(c)])); };
function baseline() { snapCats(); DISMISS_SNAP = JSON.stringify(D.dismissed || {}); BASE.clear(); KINDS.forEach((k) => D[k].forEach((r) => BASE.set(k + ':' + r.id, stable(plain(r))))); BASE.set('settings', stable(plain(D.settings))); TOUCHED.clear(); PENDING_DEL = []; }
const FIELD_NAMES = { ice: 'ICE contacts', phones: 'phone', gid: 'Google link', first: 'first name', last: 'surname', middle: 'middle name', role: 'role', links: 'businesses', tags: 'tags', mobiles: 'mobile', landlines: 'landline', emails: 'email', postal: 'postal address', info: 'general info', warnings: 'general warnings', starred: 'starred', photoChoice: 'photo', photoData: 'photo', sideNotes: 'side notes', dnaReason: 'Do not answer reason', inactiveReason: 'inactive reason', flags: 'job flags', name: 'name', rating: 'A+ to C category', pics: 'PIC', patientIds: 'patient IDs', farms: 'farms / locations', primaryContact: 'primary contact', primaryRequired: 'primary contact required', type: 'business type', group: 'tag type', photo: 'photo', home: 'homebase', mapsKey: 'Google Maps key', photoPriority: 'photo priority', createdAt: 'created' };
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
      const effOf = (rec) => { const own = rec.ownCats || !(rec.links || []).filter((l) => !l.past).length; if (own) { const t = (rec.tags || []).find((x) => RATING_SET.has(x)) || (rec.tags || []).find(isCatTag); return t ? [t] : []; } const b = (rec.links || []).map((l) => IDX.biz.get(l.bid)).filter(Boolean).map(bizCat).find(Boolean); return b ? [b] : []; };
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
  if (['mobiles', 'landlines', 'emails', 'pics', 'patientIds', 'phones'].includes(f)) return v.map((x) => x.value + (x.label ? ' (' + x.label + ')' : '')).join(', ') || '—';
  if (f === 'farms') return v.length + ' — ' + v.map((x) => (x.name || x.address || 'farm') + (x.kmReturn != null ? ' ' + x.kmReturn + 'km' : '') + (x.seeWarning ? ' ⚠' : '')).join('; ');
  if (f === 'rating') return tagName(v);
  if (f === 'primaryContact') { const c = D.contacts.find((x) => x.id === v); return c ? fullName(c) : '—'; }
  if (f === 'photoData') return 'custom photo';
  if (f === 'ice') return v.map((i) => { const x = D.contacts.find((y) => y.id === i.cid); return (x ? fullName(x) : '(deleted)') + (i.rel ? ' (' + i.rel + ')' : ''); }).join(', ') || '—';
  if (f === 'bid') return IDX.biz.get(v)?.name || '—';
  if (f === 'stops') return v.map((x) => { const fm = IDX.farms.get(x.fid); return fm ? farmLabel(fm) : '(deleted farm)'; }).join('; ') || '—';
  if ((f === 'start' || f === 'end') && typeof v === 'object') return epLabel(v);
  if (f === 'flags') return v.map((x) => x.type).join(', ') || '—';
  if (typeof v === 'object') return Array.isArray(v) ? v.map(String).join(', ') : JSON.stringify(v);
  return String(v);
}
function entrySummary(e) {
  if (e.label) return e.label;
  if (e.items.length === 1) { const it = e.items[0]; const what = { contacts: 'contact', businesses: 'business', tags: 'tag', routes: 'route', settings: '' }[it.kind];
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
  if (el.dataset.act === 'devname-save') { const v = $('#s-devname').value.trim(); if (!v) { toast('Enter a name'); return; } try { localStorage.setItem('bvt-devname', v); } catch (e) { } D._devDirty = true; Sync.soon(); toast('Name saved'); renderAll(); }
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
    if (newer) nudge(b, `<b>New version available (v${h(v.version)})</b> — tap ⟳ here to update.`, 'update:' + v.version, 30 * 60 * 1000);
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
  if (!D.settings.ncPrimary) { D.businesses.forEach((b) => { if (!isClientBiz(b) && (b.primaryContact || b.primaryRequired !== false)) { b.primaryContact = null; b.primaryRequired = false; touch(b); } }); D.settings.ncPrimary = true; touch(D.settings); ch = true; }
  { // (runs every start, only fills gaps) businesses whose phone/email went missing when a "move onto the business" change was cancelled: take them back from the trashed contact
    D.businesses.forEach((b) => { if (bizHasDetails(b) || (IDX.bizContacts.get(b.id) || []).length) return;
      const tr = (D.trash || []).filter((t) => !t.removed && t.kind === 'contact' && t.rec && (t.rec.links || []).some((l) => l.bid === b.id));
      const pick = tr.filter((t) => sameAsBizName(t.rec, b)); (pick.length ? pick : tr).forEach((t) => { const c = t.rec;
        const has = (arr, v) => arr.some((x) => x.value.replace(/\s/g, '') === v.replace(/\s/g, ''));
        b.phones = b.phones || []; [...(c.mobiles || []).map((p) => ({ label: p.label || 'Mobile', value: p.value })), ...(c.landlines || []).map((p) => ({ label: p.label || 'Phone', value: p.value }))].forEach((p) => { if (p.value && !has(b.phones, p.value)) b.phones.push(p); });
        b.emails = b.emails || []; (c.emails || []).forEach((p) => { if (p.value && !has(b.emails, p.value)) b.emails.push({ label: p.label || '', value: p.value }); });
        b.postal = [...new Set([...(b.postal || []), ...(c.postal || [])])]; if (c.gid && !b.gid) b.gid = c.gid; });
      if (tr.length && bizHasDetails(b)) { touch(b); ch = true; } });
  }
  if (!D.settings.warnBack1) { // put warnings back into general info (*WARNING* section) to be re-applied from the Jobs list
    D.contacts.forEach((c) => { if ((c.warnings || '').trim()) { c.warningsWas = c.warnings; addToWarnSection(c, c.warnings); c.warnings = ''; touch(c); } });
    D.businesses.forEach((b) => { let t = false; if ((b.warnings || '').trim()) { b.warningsWas = b.warnings; addToWarnSection(b, b.warnings); b.warnings = ''; t = true; }
      b.farms.forEach((f) => { if (f.seeWarning) { f.warningWas = f.warning || '(flagged, no text)'; addToWarnSection(f, (f.warning || '').trim() || 'This farm was flagged "see warning" — check the farm info'); f.warning = ''; f.seeWarning = false; t = true; } }); if (t) touch(b); });
    D.settings.warnBack1 = true; touch(D.settings); ch = true;
  }
  if (!D.settings.picFix1) { // drop "(found in notes)"; split "WFAY2899 (previously WBMC0061)" into PIC + note
    D.businesses.forEach((b) => { let t = false; b.pics.forEach((p) => { if (/found in notes/i.test(p.label || '')) { p.label = ''; t = true; } const v = (p.value || '').trim(); const m = v.match(/^(W[A-Z]{3}\d{4})\b\s*[(,-]?\s*(.*?)\)?\s*$/i); if (m && v !== m[1].toUpperCase()) { p.value = m[1].toUpperCase(); if (m[2] && !p.label) p.label = m[2]; t = true; } }); if (t) touch(b); });
    D.settings.picFix1 = true; touch(D.settings); ch = true;
  }
  if (!D.settings.typeLock1) { D.businesses.forEach((b) => { const cat = bizCat(b); if (b.type === 'nonclient' && cat && catClass('b', cat) !== 'n' && !b.typeLocked) { b.typeLocked = true; touch(b); } }); D.settings.typeLock1 = true; touch(D.settings); ch = true; }
  if (!D.settings.iceV1) { // link the existing "X's ICE (relationship: Y)" contacts to the staff member
    const tg = D.tags.find((t) => t.id === 'ice'); if (tg) { if (tg.name !== 'ICE contact') { tg.name = 'ICE contact'; touch(tg); } } else { D.tags.push({ id: 'ice', name: 'ICE contact', group: 'additional', photo: null }); touch(D.tags[D.tags.length - 1]); }
    const staff = D.contacts.filter((x) => effCats(x).includes('bvs'));
    D.contacts.forEach((x) => { const m = (x.role || '').match(/^(.+?)['’]s?\s*ICE\b\s*(?:\(\s*relationship:\s*(.+?)\s*\))?/i); if (!m) return;
      const who = m[1].toLowerCase().replace(/['’]s?$/, '').trim(); const first = who.split(/\s+/)[0];
      const st = staff.find((y) => fullName(y).toLowerCase().startsWith(who)) || staff.find((y) => (y.first || '').toLowerCase() === first); if (!st) return;
      st.ice = st.ice || []; if (!st.ice.some((i) => i.cid === x.id)) { st.ice.push({ cid: x.id, rel: m[2] || '' }); touch(st); }
      if (!x.tags.includes('ice')) { x.tags.push('ice'); touch(x); } });
    staff.forEach((y) => { if (y.tags.includes('ice') && !iceFor(y).length) { y.tags = y.tags.filter((t) => t !== 'ice'); touch(y); } }); // staff aren't ICE contacts themselves
    D.settings.iceV1 = true; touch(D.settings); ch = true;
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
    case 'tab': S.backTo = null; S.tab = d.v; S.sel = null; if (d.v === 'contacts') S.q = ''; if (d.v === 'biz') S.bq = ''; /* every menu starts afresh */ document.body.classList.remove('show-detail'); renderAll(); $('#list').scrollTop = 0; break;
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
    case 'sheet-cancel': leaveSheet(); break;
    case 'catpick-use': { if (d.kind === 'business') { const b = IDX.biz.get(d.id); if (b) setBizCat(b, d.tag); } else { const c = D.contacts.find((x) => x.id === d.id); if (c) setOne(c, d.tag); } NEXT_LOG_LABEL = 'Kept previous category'; if (await changed()) toast('Category set to ' + tagName(d.tag)); break; }
    case 'bizonly-convert': { const c = D.contacts.find((x) => x.id === d.cid), b = IDX.biz.get(d.bid); if (!c || !b) break;
      const ph = [...c.mobiles.map((p) => ({ label: p.label || 'Mobile', value: p.value })), ...c.landlines.map((p) => ({ label: p.label || 'Phone', value: p.value }))], em = c.emails.map((p) => ({ label: p.label || '', value: p.value }));
      if (!(await ask(`Make "${fullName(c)}" part of the business ${b.name}?\n\n• Phone: ${ph.map((p) => p.value).join(', ') || 'none'}\n• Email: ${em.map((p) => p.value).join(', ') || 'none'}${c.postal.length ? '\n• Postal: ' + c.postal.join('; ') : ''}\n\nThese move onto the business, any notes are added to the business's info, and the contact "${fullName(c)}" goes to the trash (you can restore it from Settings → Trash).`, 'Yes — move to the business'))) break;
      convertBizOnly(c, b);
      S.skipConfirm = true; NEXT_LOG_LABEL = `Made ${b.name} a business-only entry (moved phone/email from contact)`; reindex(); await changed(); toast(b.name + ' updated'); break; }
    case 'warn-apply': case 'warn-remove': { const j = jobs().find((x) => x.key === d.k); if (!j) break; const w = j.warnSrc;
      const rec = w.kind === 'contact' ? D.contacts.find((x) => x.id === w.id) : IDX.biz.get(w.bid); const f = w.fid ? IDX.farms.get(w.fid) : null; if (!rec) break;
      const join = (x, y) => [x, y].filter((t) => (t || '').trim()).join('\n'); const tgt = rec;
      if (a === 'warn-remove') { if (!(await ask(`Remove the *WARNING* section (and the text under it) from ${f ? 'the farm info of ' + (f.name || 'this farm') : 'the general info of ' + j.who}?\n\n${j.warnTxt}`, 'Yes — remove it', true))) break; if (f) { removeWarnSection(f); touch(rec); } else { removeWarnSection(rec); touch(rec); } NEXT_LOG_LABEL = `Removed *WARNING* section from ${j.who}`; S.skipConfirm = true; if (await changed()) toast('Removed from general info'); break; }
      if (d.to === 'general') { if ((tgt.warnings || '').includes(j.warnTxt)) { toast('Already in the general warning'); break; } tgt.warnings = join(tgt.warnings, j.warnTxt); touch(tgt); }
      if (d.to === 'side') { if ((tgt.sideNotes || '').includes(j.warnTxt)) { toast('Already in the side note'); break; } tgt.sideNotes = join(tgt.sideNotes, j.warnTxt); touch(tgt); }
      if (d.to === 'farm') { const ff = IDX.farms.get(d.fid); const fb = ff && IDX.farmBiz.get(ff.id); if (!ff) break; if ((ff.warning || '').includes(j.warnTxt)) { toast('Already in that farm warning'); break; } ff.seeWarning = true; ff.warning = join(ff.warning, j.warnTxt); touch(fb); }
      NEXT_LOG_LABEL = `Applied warning for ${j.who} as ${d.to === 'general' ? 'general warning' : d.to === 'side' ? 'side note' : 'farm warning'}`;
      if (await changed()) toast('✓ Applied — you can now remove it from general info if you like'); break; }
    case 'prim-set': { const b = IDX.biz.get(d.bid), c = D.contacts.find((x) => x.id === d.cid); if (!b || !c) break; b.primaryContact = c.id; touch(b); if (!c.tags.includes('pa') && !c.tags.includes('pi')) { c.tags.push('pa'); touch(c); } NEXT_LOG_LABEL = `${fullName(c)} made primary contact for ${b.name}`; if (await changed()) toast(`✓ ${fullName(c)} is now the primary contact`); break; }
    case 'ob-add': $('#ob-rows').insertAdjacentHTML('beforeend', obRow({ text: '' }, IDX.biz.get(S.obBid) || { id: '', name: '' }, false)); break;
    case 'ob-findpick': { const row = el.closest('.ob-row'); const x = IDX.biz.get(d.id); if (!row || !x) break; row.querySelector('.ob-ex').value = x.id; row.querySelector('.ob-chosen').innerHTML = 'Chosen: <b>' + h(x.name) + '</b>'; row.querySelector('.ob-findres').innerHTML = ''; row.querySelector('.ob-find').value = ''; if (!row.querySelector('.ob-text').value.trim()) row.querySelector('.ob-text').value = x.name; break; }
    case 'oddbiz-fix': oddBizSheet(IDX.biz.get(d.bid)); break;
    case 'kind-pick': { el.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === el)); $('#e-kind').value = d.v; const hn = $('#e-kindhint');
      hn.style.display = d.v === 'person' ? 'none' : ''; hn.textContent = d.v === 'person' ? '' : `When you tap Save, this contact becomes ${d.v === 'client' ? 'a client business' : 'an industry (non-client) business'} — its phone, email, address and notes move onto the business and the contact goes to the trash.`; break; }
    case 'ice-add': $('#e-icerows').insertAdjacentHTML('beforeend', iceRow(null)); $('#e-icerows .icerow:last-child .ice-who').focus(); break;
    case 'ice-del': el.closest('.icerow').remove(); break;
    case 'jobs-refresh': el.disabled = true; setTimeout(() => { JOBS_CACHE = null; reindex(); renderAll(); toast('✓ Jobs list refreshed — ' + jobs().length + ' to check'); }, 650); break;
    case 'sheet-save': { if (!SHEET) break; const ok = await SHEET.onSave(); if (ok !== false) { const done = await changed(); if (done) { closeSheet(); toast('Saved'); } } break; }
    case 'rep-add': { const tpl = document.querySelector(`#sheet template[data-reptpl="${d.rep}"]`); document.querySelector(`#sheet [data-repwrap="${d.rep}"]`).insertAdjacentHTML('beforeend', tpl.innerHTML); break; }
    case 'rep-del': el.closest('.rep').remove(); break;
    case 'link-biz': $('#e-links').insertAdjacentHTML('beforeend', linkRow(d.bid)); $('#e-bizsearch').value = ''; $('#e-bizres').innerHTML = ''; break;
    case 'link-newbiz': $('#e-links').insertAdjacentHTML('beforeend', linkRow(null, d.name)); $('#e-bizsearch').value = ''; $('#e-bizres').innerHTML = ''; break;
    case 'del-contact': if (await ask(`Move ${fullName(D.contacts.find((c) => c.id === d.id))} to the trash?\n\nYou can restore it from Settings → Trash.`, 'Yes — move to trash', true)) { trashContact(D.contacts.find((c) => c.id === d.id)); S.sel = null; closeSheet(); changed(); toast('Moved to trash'); } break;
    case 'del-biz': if (await ask(`Move ${IDX.biz.get(d.id).name} and its farms to the trash?\n\nIts contacts stay. You can restore it from Settings → Trash.`, 'Yes — move to trash', true)) { trashBiz(IDX.biz.get(d.id)); S.sel = null; closeSheet(); changed(); toast('Moved to trash'); } break;
    case 'del-farm': if (await ask(`Move ${IDX.farms.get(d.fid)?.name || 'this farm'} (${IDX.biz.get(d.bid).name}) to the trash?\n\nYou can restore it from Settings → Trash.`, 'Yes — move to trash', true)) { const b = IDX.biz.get(d.bid); trashFarm(b, IDX.farms.get(d.fid)); closeSheet(); changed(); toast('Moved to trash'); } break;
    case 'route-add': routeAddedBox([d.fid]); break;
    case 'route-save': saveRoute(false); break;
    case 'route-saveas': saveRoute(true); break;
    case 'route-load': loadRoute(d.id); if (d.go) goTab('route'); break;
    case 'route-del': deleteRoute(d.id); break;
    case 'route-add-biz': routeAddedBox(IDX.biz.get(d.bid).farms.filter((f) => f.lat != null).map((f) => f.id)); break;
    case 'rs-up': case 'rs-down': { const i = +d.i, j = a === 'rs-up' ? i - 1 : i + 1; const s = S.route.stops; [s[i], s[j]] = [s[j], s[i]]; S.route.mode = 'order'; renderAll(); break; }
    case 'rs-del': S.route.stops.splice(+d.i, 1); renderAll(); break;
    case 'rs-pick': addStop(d.fid, true); renderAll(); setTimeout(() => $('#rs-search') && $('#rs-search').focus(), 0); break;
    case 'ep': S.route[d.w] = { type: d.v }; renderAll(); break;
    case 'ep-pick': S.route[d.w] = { type: 'farm', fid: d.fid }; renderAll(); break;
    case 'endsame': S.route.endSame = el.checked; if (!el.checked) S.route.end = { type: 'home' }; renderAll(); break;
    case 'rmode': S.route.mode = d.v; renderAll(); break;
    case 'route-go': goRoute(); break;
    case 'route-clear': S.route.stops = []; S.route.savedId = null; renderAll(); break;
    case 'job-open': {
      S.tab = d.kind === 'business' ? 'biz' : 'contacts'; S.sel = { kind: d.kind, id: d.id }; renderAll();
      if (d.fid) editFarm(IDX.biz.get(d.id), IDX.farms.get(d.fid)); else if (d.kind === 'contact') editContact(D.contacts.find((x) => x.id === d.id));
      break;
    }
    case 'job-dismiss': { D.dismissed = D.dismissed || {}; D.dismissed[d.key] = Date.now(); D._dismissDirty = true; Sync.soon(); const [type, fid] = d.key.split(':'); if (type === 'signfix') { const f = IDX.farms.get(fid); if (f) { f.flags = f.flags.filter((x) => x.type !== 'signfix'); touch(IDX.farmBiz.get(fid)); } } changed(); break; }
    case 'use-km': { d.fids.split(',').forEach((fid) => { const f = IDX.farms.get(fid); if (!f) return; f.kmReturn = +d.km; f.kmStatus = 'verified'; if (f.gMin != null && f.driveMin == null) f.driveMin = f.gMin; f.flags = (f.flags || []).filter((x) => x.type !== 'kmcheck'); touch(IDX.farmBiz.get(fid)); }); if (await changed()) toast('Distance updated'); break; }
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
    case 'ai-chat-save': { const v = $('#ai-chaturl').value.trim(); if (v && !/^https:\/\/claude\.ai\//.test(v)) { toast('That needs to be a claude.ai link (starting https://claude.ai/)'); break; } if (v) D.settings.aiChatUrl = v; else delete D.settings.aiChatUrl; touch(D.settings); changed(); toast(v ? 'Ask Claude will open that chat' : 'Ask Claude will open a new chat'); break; }
    case 'prio-reset': delete D.settings.photoPriority; touch(D.settings); photoCache.clear(); changed(); break;
    case 'app-refresh': refreshApp(); break;
    case 'trash-restore': { const t = (D.trash || []).find((x) => x.tid === d.tid); if (t && await ask(`Restore ${trashLabel(t)} from the trash?`, 'Yes — restore')) restoreTrash(d.tid); break; }
    case 'trash-empty': if (await ask('Permanently delete everything in the trash?\n\nThis cannot be undone.', 'Yes — delete permanently', true)) { D.trash.forEach((t) => { if (!t.removed) Object.assign(t, { removed: true, rec: null }); }); D._trashDirty = true; changed(); } break;
    case 'dupe-not': D.dismissed = D.dismissed || {}; D.dismissed[d.key] = Date.now(); D._dismissDirty = true; Sync.soon(); changed(); break;
    case 'dupe-merge': {
      const isC = d.kind === 'contact'; const keep = isC ? D.contacts.find((x) => x.id === d.keep) : IDX.biz.get(d.keep); const other = isC ? D.contacts.find((x) => x.id === d.other) : IDX.biz.get(d.other);
      if (!keep || !other) break;
      if (!(await ask(`Merge "${isC ? fullName(other) : other.name}" into "${isC ? fullName(keep) : keep.name}"?\n\nEverything is combined into one; the extra one goes to the trash.`, 'Yes — merge'))) break;
      isC ? mergeContacts(keep, other) : mergeBiz(keep, other); if (await changed()) toast('Merged'); break; }
    case 'biz-link-pick': { const c = D.contacts.find((x) => x.id === d.cid); const b = IDX.biz.get(d.bid); if (c && b && !c.links.some((l) => l.bid === d.bid)) { const prev = catOf(c);
      let match = !prev; if (prev && bizCat(b) && bizCat(b) !== prev) { const r = await askLinkCat(`<b>${h(fullName(c))}</b>`, b, tagName(prev)); if (!r) { toast('Not linked — nothing was changed'); break; } match = r === 'match'; }
      c.links.push({ bid: d.bid }); reindex(); if (match && bizCat(b)) setOne(c, bizCat(b)); else if (prev) setOne(c, prev); touch(c); S.skipConfirm = true; NEXT_LOG_LABEL = `Linked ${fullName(c)} to ${b.name}` + (prev && bizCat(b) && bizCat(b) !== prev ? (match ? ' — category changed to match' : ' — kept own category') : ''); await changed(); toast(fullName(c) + ' linked'); } break; }
    case 'area-ai': { let cids = [], bids = [], req = '';
      if (d.v === 'search') { if ((S.adv.kind || 'people') === 'people') { const r = advResults(); const sel = S.advSel && S.advSel.size ? r.filter((c) => S.advSel.has(c.id)) : r; cids = sel.slice(0, 80).map((c) => c.id); req = `About ${S.advSel && S.advSel.size ? 'the ' + sel.length + ' people I selected' : 'my search results (' + r.length + ' people' + (r.length > 80 ? ', first 80 included' : '') + ')'}: `; }
        else { const r = advBizResults(); const sel = S.advBSel && S.advBSel.size ? r.filter((b) => S.advBSel.has(b.id)) : r; bids = sel.slice(0, 60).map((b) => b.id); req = `About ${S.advBSel && S.advBSel.size ? 'the ' + sel.length + ' businesses I selected' : 'my search results (' + r.length + ' businesses' + (r.length > 60 ? ', first 60 included' : '') + ')'}: `; } }
      else { const stops = S.route.stops.map((x) => IDX.farms.get(x.fid)).filter(Boolean); bids = [...new Set(stops.map((f) => IDX.farmBiz.get(f.id)?.id).filter(Boolean))]; req = stops.length ? `About my planned route (${routeSummary({ ...routeSnapshot() })}): ` : 'About planning a route: '; }
      S.aiExtra = { cids, bids }; S.aiScope = 'mentioned'; S.aiReq = req; S.aiReply = ''; S.aiResult = '';
      S.setOpen = S.setOpen || new Set(); S.setOpen.add('🤖 Ask Claude'); S.tab = 'settings'; S.sel = null; renderAll(); setTimeout(() => { const t = $('#ai-req'); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 60); toast('Type what you want, then tap "Copy for Claude"'); break; }
    case 'merge-start': mergeStart(d.kind, d.id); break;
    case 'mg-pick': closeSheet(); setTimeout(() => mergeSheet(d.kind, d.a, d.b), 30); break;
    case 'rec-ai': { const isC = d.kind === 'contact'; const r = isC ? D.contacts.find((x) => x.id === d.id) : IDX.biz.get(d.id); if (!r) break;
      S.aiExtra = isC ? { cids: [r.id], bids: [] } : { cids: [], bids: [r.id] }; S.aiScope = 'mentioned'; S.aiReq = `About ${isC ? fullName(r) : r.name}: `; S.aiReply = ''; S.aiResult = '';
      S.setOpen = S.setOpen || new Set(); S.setOpen.add('🤖 Ask Claude'); S.tab = 'settings'; S.sel = null; renderAll(); setTimeout(() => { const t = $('#ai-req'); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 60); toast('Type what you want, then tap "Copy for Claude"'); break; }
    case 'job-ai': { const j = jobs().find((x) => x.key === d.k || x.key === d.key); if (!j) break; const cids = new Set(), bids = new Set();
      if (j.kind === 'contact') cids.add(j.id); else bids.add(j.id); [j.linkSug, j.linkRev, j.bizonly].forEach((x) => { if (x) { if (x.cid) cids.add(x.cid); if (x.bid) bids.add(x.bid); } }); if (j.oddbiz) bids.add(j.oddbiz); if (j.catdiff) bids.add(j.catdiff.bid); if (j.primSuggest) cids.add(j.primSuggest);
      S.aiExtra = { cids: [...cids], bids: [...bids] }; S.aiScope = 'mentioned'; S.aiReq = `Help me sort out this item from the app's Jobs list.\nJob: ${JOB_TYPES[j.type]?.t || j.type}\n${j.who}: ${j.note}${j.warnTxt ? '\n' + j.warnTxt : ''}\nTell me what you'd suggest and why, and include the changes if you're fairly sure.`; S.aiReply = ''; S.aiResult = '';
      S.setOpen = S.setOpen || new Set(); S.setOpen.add('🤖 Ask Claude'); S.tab = 'settings'; S.sel = null; renderAll(); setTimeout(() => { const el = document.querySelector('details.setsec'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 50); toast('Check the request, then tap "Copy for Claude"'); break; }
    case 'linkrev-undo': { const c = D.contacts.find((x) => x.id === d.cid), b = IDX.biz.get(d.bid); if (!c || !b) break; const prev = catOf(c); c.links = c.links.filter((l) => l.bid !== b.id); if (b.primaryContact === c.id) { b.primaryContact = null; touch(b); } reindex(); if (prev) setOne(c, prev); touch(c); NEXT_LOG_LABEL = `Undid link: ${fullName(c)} → ${b.name}`; S.skipConfirm = true; if (await changed()) toast('Link removed'); break; }
    case 'primin-fix': { const c = D.contacts.find((x) => x.id === d.cid); if (!c) break; c.tags = c.tags.filter((t2) => t2 !== 'pa'); if (!c.tags.includes('pi')) c.tags.push('pi'); touch(c); NEXT_LOG_LABEL = `${fullName(c)}: Primary (active) → Primary (inactive)`; S.skipConfirm = true; if (await changed()) toast('✓ Changed to Primary (inactive)'); break; }
    case 'link-pick-past': { const c = D.contacts.find((x) => x.id === d.cid), b = IDX.biz.get(d.bid); if (!c || !b || c.links.some((l) => l.bid === b.id)) break; const prev = catOf(c);
      c.links.push({ bid: b.id, past: true }); reindex(); if (prev) setOne(c, prev); touch(c); NEXT_LOG_LABEL = `Linked ${fullName(c)} to ${b.name} as a past employee`; S.skipConfirm = true; if (await changed()) toast(`✓ ${fullName(c)} linked to ${b.name} (past)`); break; }
    case 'link-past': { const c = D.contacts.find((x) => x.id === d.cid), b = IDX.biz.get(d.bid); if (!c || !b) break; const prev = catOf(c);
      c.links = c.links.map((l) => (l.bid === b.id ? (d.v === '1' ? { bid: b.id, past: true } : { bid: b.id }) : l)); if (d.v === '1' && b.primaryContact === c.id) { b.primaryContact = null; touch(b); }
      reindex(); if (prev) setOne(c, prev); touch(c); // their category stays as it was
      NEXT_LOG_LABEL = `${fullName(c)} ${d.v === '1' ? 'marked as a past employee of' : 'made a current contact of'} ${b.name}`; S.skipConfirm = true; if (await changed()) toast(d.v === '1' ? `${fullName(c)} moved to past employees` : `${fullName(c)} is current again`); break; }
    case 'biz-unlink': { const c = D.contacts.find((x) => x.id === d.cid); const b = IDX.biz.get(d.bid); if (c && await ask(`Unlink ${fullName(c)} from ${b.name}? The contact is not deleted.`)) { c.links = c.links.filter((l) => l.bid !== d.bid); if (b.primaryContact === c.id) { b.primaryContact = null; touch(b); } touch(c); changed(); } break; }
    case 'btype': S.btype = d.v; renderBizList(); break;
    case 'ptype': S.ptype = d.v; renderContactList(); break;
    case 'bclear': e.preventDefault(); S.bq = ''; renderBizList(); break;
    case 'cat-all': { const bz = IDX.biz.get(d.bid); const cs = IDX.bizContacts.get(d.bid) || []; let n = 0;
      if (bz && bizCat(bz) !== d.tag) setBizCat(bz, d.tag); // the business takes the category too, and everyone follows it
      cs.forEach((c) => { if (catOf(c) !== d.tag || c.ownCats) { setOne(c, d.tag); n++; } });
      NEXT_LOG_LABEL = `Set everyone at ${bz?.name || ''} (business and ${cs.length} contact${cs.length === 1 ? '' : 's'}) to ${tagName(d.tag)}`; photoCache.clear();
      if (await changed()) { Sync.soon(); toast(`✓ ${bz?.name || 'Business'} and its contacts are now ${tagName(d.tag)}`); } break; }
    case 'cat-apply': { const n = applyCat(d.cid, d.at); NEXT_LOG_LABEL = `Category change copied to ${n} other contact${n === 1 ? '' : 's'}`; Sync.soon(); if (await changed()) toast('Updated ' + n + ' contact' + (n === 1 ? '' : 's')); break; }
    case 'block-yes': setBlocked(d.cid, true); Sync.soon(); if (await changed()) toast('Marked: Number blocked (confirmed)'); break;
    case 'block-no': setBlocked(d.cid, false); Sync.soon(); if (await changed()) toast('Marked: Number blocked (needs confirming)'); break;
    case 'use-photo': { const c = D.contacts.find((x) => x.id === d.id); if (c) { c.photoChoice = d.tag; touch(c); if (await changed()) toast('Photo set'); } break; }
    case 'accept-google': { const f = IDX.farms.get(d.fid); const fl = f.flags.find((x) => x.type === 'kmcheck'); f.kmReturn = fl.google; f.kmStatus = 'verified'; f.flags = f.flags.filter((x) => x.type !== 'kmcheck'); touch(IDX.farmBiz.get(f.id)); changed(); break; }
    case 'check-dist': checkAllDistances(); break;
    case 'new-tag': editTag(null); break;
    case 'edit-tag': editTag(IDX.tags.get(d.id)); break;
    case 'del-tag': if (await ask(`Delete the tag "${tagName(d.id)}"?\n\nIt will be removed from ${D.contacts.filter((c) => contactTagSet(c).has(d.id)).length} contacts.`, 'Yes — delete tag', true)) { D.tags = D.tags.filter((t) => t.id !== d.id); (D.deleted = D.deleted || []).push({ id: d.id, kind: 'tags', at: Date.now() }); D.contacts.forEach((c) => { if (c.tags.includes(d.id)) { c.tags = c.tags.filter((t) => t !== d.id); touch(c); } }); closeSheet(); changed(); } break;
    case 'ai-copy': { const req = $('#ai-req').value.trim(); S.aiReq = req; S.aiScope = $('#ai-scope').value; if (!req) { toast('Type what you want Claude to do first'); break; }
      const txt = aiPrompt(req, S.aiScope); let ok = false; try { await navigator.clipboard.writeText(txt); ok = true; } catch (err) { }
      const info = $('#ai-copyinfo'); const n = S.aiScope === 'all' ? 'everyone (short form)' : (() => { const r = aiRecords(req, 'mentioned'); return `${r.contacts.length} contact${r.contacts.length === 1 ? '' : 's'} and ${r.businesses.length} business${r.businesses.length === 1 ? '' : 'es'}`; })();
      if (ok) { info.innerHTML = `✓ Copied (${h(n)}). Paste it into Claude, then copy Claude's whole reply into box 3.`; window.open(D.settings.aiChatUrl || 'https://claude.ai/new', '_blank'); toast('Copied — now paste it into Claude'); }
      else { info.innerHTML = `Couldn't copy automatically — select all of this, copy it, and paste it into Claude:<textarea readonly style="min-height:120px;margin-top:6px">${h(txt)}</textarea>`; }
      if (S.aiScope !== 'all' && n.startsWith('0 contact') && n.includes(' 0 business')) info.innerHTML += '<br><b>Note:</b> no names in your request matched anyone — check spelling, or choose "Everyone".'; break; }
    case 'ai-apply': { const txt = $('#ai-reply').value; if (!txt.trim()) { toast("Paste Claude's reply first"); break; } const res = aiApply(txt); const out = $('#ai-result');
      if (res.none) { out.innerHTML = 'No changes in that reply — Claude may have just answered your question (see the chat).'; break; } if (res.bad) { out.innerHTML = `<span style="color:var(--red)">${h(res.bad)}</span>`; break; }
      if (!res.done.length) { revertTouched(); out.innerHTML = `<span style="color:var(--red)">Nothing could be applied:</span><br>${res.errors.map(h).join('<br>')}`; break; }
      NEXT_LOG_LABEL = 'Claude: ' + (res.summary || res.done.length + ' changes'); const ok = await changed();
      S.aiResult = ok ? `✓ Saved ${res.done.length} change${res.done.length === 1 ? '' : 's'}.${res.errors.length ? `<br><span style="color:var(--red)">Skipped: ${res.errors.map(h).join('; ')}</span>` : ''}` : 'Cancelled — nothing was changed.'; if ($('#ai-result')) $('#ai-result').innerHTML = S.aiResult;
      if (ok) { if ($('#ai-reply')) $('#ai-reply').value = ''; S.aiReply = ''; S.aiExtra = null; toast('✓ Claude\'s changes saved'); } break; }
    case 'tpl-save': D.settings.tplContact = $('#s-tplc').value; D.settings.tplBiz = $('#s-tplb').value; touch(D.settings); NEXT_LOG_LABEL = 'General info templates updated'; S.skipConfirm = true; await changed(); toast('Templates saved'); break;
    case 'tpl-reset': delete D.settings.tplContact; delete D.settings.tplBiz; touch(D.settings); NEXT_LOG_LABEL = 'General info templates reset'; S.skipConfirm = true; await changed(); toast('Templates reset'); break;
    case 'backup-now': if (!Sync.enabled() || !GAuth.valid()) { toast('Sign in to Google (Settings → Sync) to back up'); break; } toast('Backing up…'); await Backup.maybe(true); break;
    case 'backup-list': { const box = $('#backup-res'); if (!GAuth.valid()) { toast('Sign in to Google (Settings → Sync) first'); break; } box.innerHTML = '<div class="hint">Loading…</div>'; try { S.backups = await Backup.list(); box.innerHTML = S.backups.map((f, i) => `<div class="kv" style="align-items:center"><div class="v">${h(f.name.replace(Backup.PREFIX, '').replace('.json', ''))} <span class="hint">${f.size ? Math.round(f.size / 1024) + ' KB' : ''}</span></div><button class="btn small" data-act="backup-restore" data-i="${i}">Restore</button></div>`).join('') || '<div class="hint">No backups yet.</div>'; } catch (err) { box.innerHTML = `<div class="hint" style="color:var(--red)">${h(err.message)}</div>`; } break; }
    case 'backup-restore': { const f = (S.backups || [])[+d.i]; if (!f) break; if (!(await ask(`Restore everything to the backup from ${f.name.replace(Backup.PREFIX, '').replace('.json', '')}?\n\nAll contacts, businesses and settings go back to how they were then, on every device. Changes made since then are lost (the change log keeps a record).`, 'Yes — restore this backup', true))) break; try { toast('Restoring…'); await Backup.restore(f); toast('✓ Backup restored'); } catch (err) { toast('Restore failed: ' + err.message); } break; }
    case 'exp-people': downloadFile(`bovitech-${lab('contacts').toLowerCase().replace(/\W+/g, '-')}-${Backup.day()}.csv`, peopleCsv(sortContactsBy(D.contacts.slice(), 'first')), 'text/csv'); break;
    case 'exp-biz': downloadFile(`bovitech-${lab('biz').toLowerCase().replace(/\W+/g, '-')}-${Backup.day()}.csv`, bizCsv(D.businesses.slice().sort((a, b) => alphaCmp(a.name, b.name))), 'text/csv'); break;
    case 'exp-vcf': downloadFile(`bovitech-contacts-${Backup.day()}.vcf`, vcards(D.contacts), 'text/vcard'); break;
    case 'catclass-reset': D.settings.catClass = { p: {}, b: {} }; touch(D.settings); NEXT_LOG_LABEL = 'Categories reset to default client / non-client'; S.skipConfirm = true; JOBS_CACHE = null; await changed(); toast('Reset to default'); break;
    case 'hideinact': S.hideIn[d.v] = el.checked; try { localStorage.setItem('bvt-hideinact2', JSON.stringify(S.hideIn)); } catch (e2) { } d.v === 'b' ? renderBizList() : renderContactList(); break;
    case 'save-home': { const g = parseGps(val('s-homegps')); if (!g) { toast('GPS not recognised'); break; } Object.assign(D.settings.home, { address: val('s-homeaddr'), lat: g.lat, lng: g.lng }); touch(D.settings); if (await changed()) toast('Homebase saved'); break; }
    case 'save-key': D.settings.mapsKey = val('s-mapskey'); touch(D.settings); if (await changed()) toast('Key saved'); break;
    case 'export': { const blob = new Blob([JSON.stringify(D)], { type: 'application/json' }); const u = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = u; l.download = `bovitech-contacts-backup-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(l); l.click(); l.remove(); break; }
  }
});
function addStop(fid, quiet) {
  if (S.route.stops.some((s) => s.fid === fid)) { if (!quiet) toast('Already on the route'); return 'dup'; }
  if (S.route.stops.length >= MAX_STOPS) { if (!quiet) toast('Google Maps allows up to 9 stops'); return 'full'; }
  S.route.stops.push({ fid }); if (!quiet) toast(`Added to route (${S.route.stops.length}/${MAX_STOPS})`); return 'ok';
}
// pop-up after "+ Add to route": says what happened, offers to open the route planner
async function routeAddedBox(fids) {
  const res = fids.map((fid) => ({ fid, r: addStop(fid, true) }));
  const nm = (fid) => h(farmLabel(IDX.farms.get(fid) || { id: fid }));
  const ok = res.filter((x) => x.r === 'ok'), dup = res.filter((x) => x.r === 'dup'), full = res.filter((x) => x.r === 'full');
  let html = '';
  if (ok.length) html += `<p style="font-size:17px">✓ Added to the route:</p><ul>${ok.map((x) => `<li><b>${nm(x.fid)}</b></li>`).join('')}</ul>`;
  if (dup.length) html += `<p>Already on the route: ${dup.map((x) => nm(x.fid)).join(', ')}</p>`;
  if (full.length) html += `<p style="color:var(--red)">Not added — Google Maps allows up to ${MAX_STOPS} stops: ${full.map((x) => nm(x.fid)).join(', ')}</p>`;
  html += `<p class="hint">The route now has ${S.route.stops.length} of ${MAX_STOPS} stops.</p>`;
  renderTabs();
  if (await askBox(ok.length ? 'Added to route' : 'Route not changed', html, `View route (${S.route.stops.length} stop${S.route.stops.length === 1 ? '' : 's'})`, false, 'OK — keep going')) goTab('route');
}
async function askDeviceName() { // compulsory: who is using this device
  let hasName = false; try { hasName = !!localStorage.getItem('bvt-devname'); } catch (e) { hasName = true; } if (hasName || window.SEED) return;
  for (;;) { const v = await askBox('Who is using this device?', `<p>Before you start, give this device a name so everyone can see who made each change (shown in the change log and in Settings → Devices).</p><div class="f"><span class="lbl">Your name and device</span><textarea rows="1" style="width:100%;height:46px;min-height:46px;resize:none;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px" placeholder="e.g. Amelia – office PC, or Jess's phone"></textarea></div>`, 'Save', false, 'Save');
    if (typeof v === 'string' && v.trim()) { try { localStorage.setItem('bvt-devname', v.trim()); } catch (e) { } D._devDirty = true; Sync.soon(); toast('Thanks, ' + v.trim()); renderAll(); return; }
    toast('Please enter a name for this device'); await new Promise((r) => setTimeout(r, 300)); }
}
/* ---------------- nightly backups to Google Drive (kept 30 days) ---------------- */
const Backup = {
  PREFIX: 'bovitech-contacts-backup-',
  day(d = new Date()) { return d.toLocaleDateString('en-CA'); }, // YYYY-MM-DD, local time
  async list() { const q = encodeURIComponent(`name contains '${this.PREFIX}' and trashed=false`); const r = await gfetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,size,createdTime)&orderBy=name desc&pageSize=100`); if (!r.ok) throw new Error('Drive error ' + r.status); return (await r.json()).files || []; },
  async make(day) { const fd = new FormData(); fd.append('metadata', new Blob([JSON.stringify({ name: this.PREFIX + day + '.json', mimeType: 'application/json', description: 'Bovitech Contacts nightly backup' })], { type: 'application/json' })); fd.append('file', new Blob([Sync.serial()], { type: 'application/json' }));
    const r = await gfetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', { method: 'POST', body: fd }); if (!r.ok) throw new Error('Backup upload error ' + r.status); return r.json(); },
  async maybe(force) { // runs the first time any device is online after midnight; one backup per day for everyone
    if (window.SEED || !Sync.enabled() || !navigator.onLine || !GAuth.valid() || this.busy) return; const today = this.day();
    if (!force && PREF.lastBackup === today) return; this.busy = true;
    try { const files = await this.list(); if (force || !files.some((f) => f.name === this.PREFIX + today + '.json')) { await this.make(today); files.unshift({ name: this.PREFIX + today + '.json' }); if (force) toast('✓ Backup saved to Google Drive'); }
      savePref('lastBackup', today); const old = (await this.list()).slice(30); for (const f of old) await gfetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, { method: 'DELETE' });
    } catch (e) { console.warn('backup', e); if (force) toast('Backup failed: ' + e.message); } finally { this.busy = false; }
  },
  schedule() { const now = new Date(), next = new Date(now); next.setHours(24, 1, 0, 0); setTimeout(() => { this.maybe(); this.schedule(); }, next - now); setTimeout(() => this.maybe(), 15000); },
  async restore(f) {
    const srv = await Sync.download(f.id); if (!srv.contacts || !srv.businesses) throw new Error('Not a backup file');
    // keep the current revision numbers so syncing treats this as a normal change, and delete records the backup didn't have
    KINDS.forEach((k) => { const cur = new Map(D[k].map((r) => [r.id, r])); const keep = new Set();
      D[k] = (srv[k] || []).map((r) => { const c = cur.get(r.id); keep.add(r.id); return { ...r, _rev: c ? c._rev : r._rev, _dirty: true, _u: Date.now(), _dev: DEVICE }; });
      cur.forEach((r, id) => { if (!keep.has(id)) D.deleted.push({ id, kind: k, at: Date.now() }); }); });
    D.settings = { ...srv.settings, _rev: D.settings._rev, _dirty: true }; D.conflicts = [];
    reindex(); baseline(); JOBS_CACHE = null; photoCache.clear(); NEXT_LOG_LABEL = 'Restored backup from ' + f.name.replace(this.PREFIX, '').replace('.json', ''); logChanges(NEXT_LOG_LABEL); NEXT_LOG_LABEL = null; save(); renderAll(); Sync.soon();
  },
};
function downloadFile(name, text, type) { const blob = new Blob([text], { type }); const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = name; document.body.appendChild(l); l.click(); l.remove(); }
const csvQ = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
function peopleCsv(list) { const rows = [['First name', 'Surname', 'Role', 'Business', 'Category', 'Client / non-client', 'Additional tags', 'Mobile', 'Landline', 'Email', 'Postal', 'PIC', 'Patient IDs', 'Warnings', 'General info']];
  list.forEach((c) => { const bs = bizOf(c); rows.push([c.first, c.last, c.role, bs.map((b) => b.name).join('; '), catOf(c) ? tagName(catOf(c)) : '', isClientPerson(c) ? 'Client' : 'Non-client', c.tags.filter((t) => !isCatTag(t) && !RATING_SET.has(t)).map(tagName).join('; '), c.mobiles.map((p) => p.value).join('; '), c.landlines.map((p) => p.value).join('; '), c.emails.map((p) => p.value).join('; '), c.postal.join('; '), bs.flatMap((b) => b.pics.map((p) => p.value)).join('; '), bs.flatMap((b) => b.patientIds.map((p) => p.value)).join('; '), [c.warnings, ...bs.map((b) => b.warnings)].filter(Boolean).join(' | '), c.info]); });
  return '\ufeff' + rows.map((r) => r.map(csvQ).join(',')).join('\r\n'); }
function bizCsv(list) { const rows = [['Business', 'Client / non-client', 'Category', 'Primary contact', 'Contacts', 'Phone', 'Email', 'PIC', 'Patient IDs', 'Farms', 'Farm addresses', 'Km return', 'Warnings', 'General info']];
  list.forEach((b) => { const cs = IDX.bizContacts.get(b.id) || []; rows.push([b.name, isClientBiz(b) ? 'Client' : 'Non-client', bizCat(b) ? tagName(bizCat(b)) : '', isClientBiz(b) && primaryOf(b) ? fullName(primaryOf(b)) : '', cs.map(fullName).join('; '), (b.phones || []).map((p) => p.value).join('; '), (b.emails || []).map((p) => p.value).join('; '), b.pics.map((p) => p.value).join('; '), b.patientIds.map((p) => p.value).join('; '), b.farms.map((f) => f.name || '').join('; '), b.farms.map((f) => f.address || '').join('; '), b.farms.map((f) => f.kmReturn ?? '').join('; '), b.warnings, b.info]); });
  return '\ufeff' + rows.map((r) => r.map(csvQ).join(',')).join('\r\n'); }
function vcards(list) { const esc = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
  return list.map((c) => ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(c.last)};${esc(c.first)};${esc(c.middle)};;`, `FN:${esc(fullName(c))}`, ...(bizOf(c).length ? [`ORG:${esc(bizOf(c)[0].name)}`] : []), ...(c.role ? [`TITLE:${esc(c.role)}`] : []), ...c.mobiles.map((p) => `TEL;TYPE=CELL:${p.value}`), ...c.landlines.map((p) => `TEL;TYPE=WORK:${p.value}`), ...c.emails.map((p) => `EMAIL:${p.value}`), ...(catOf(c) ? [`CATEGORIES:${esc(tagName(catOf(c)))}`] : []), 'END:VCARD'].join('\r\n')).join('\r\n'); }
function goTab(t) { const b = document.querySelector(`[data-act=tab][data-v="${t}"]`); if (b) b.click(); else { S.tab = t; renderAll(); } }
/* ---------------- saved routes (synced to every device) ---------------- */
const epLabel = (e) => (!e ? '' : e.type === 'home' ? 'Homebase' : e.type === 'farm' ? (IDX.farms.get(e.fid) ? farmLabel(IDX.farms.get(e.fid)) : 'a farm') : e.type === 'place' ? e.text || 'a place' : e.type === 'none' ? 'Last stop' : '');
const shortTxt = (t, n) => { t = (t || '').replace(/\s*\([^)]*\)?/g, '').replace(/\s+(Pty\.? Ltd\.?|Pty|Ltd)\.?$/i, '').trim(); if (t.length <= n) return t; const cut = t.slice(0, n); return cut.slice(0, cut.lastIndexOf(' ') > n * 0.6 ? cut.lastIndexOf(' ') : n).replace(/[\s,;:-]+$/, '') + '…'; };
const stopShort = (fid) => { const f = IDX.farms.get(fid); if (!f) return '(deleted farm)'; const b = IDX.farmBiz.get(fid); return b ? shortTxt(b.name, 32) + (b.farms.length > 1 && f.name ? ' (' + shortTxt(f.name, 28) + ')' : '') : shortTxt(f.name, 32) || 'Farm'; };
const epShort = (e) => (e && e.type === 'farm' ? stopShort(e.fid) : epLabel(e));
function routeSummary(r) { return [epShort(r.start), ...r.stops.map((x) => stopShort(x.fid)), r.endSame ? epShort(r.start) : epShort(r.end)].filter(Boolean).join(' > '); }
function savedRouteRow(r, opts = {}) { const b = r.bid ? IDX.biz.get(r.bid) : null;
  return `<div class="stop" style="${S.route.savedId === r.id ? 'background:var(--green-bg);border-radius:10px' : ''}"><div class="t"><div style="font-weight:600">${h(r.name)}${S.route.savedId === r.id ? ' <span class="hint">(loaded)</span>' : ''}</div><div style="font-size:14.5px;margin-top:2px">${h(routeSummary(r))}</div><div class="hint">${r.stops.length} stop${r.stops.length === 1 ? '' : 's'}${b && !opts.inBiz ? ' · Saved to ' + h(b.name) : ''}</div></div><button class="btn small primary" data-act="route-load" data-id="${r.id}" ${opts.go ? 'data-go="1"' : ''}>${opts.go ? 'Open in route planner' : 'Load'}</button>${opts.inBiz ? '' : `<button class="btn small" data-act="route-del" data-id="${r.id}" style="color:var(--red)">Delete</button>`}</div>`; }
function bizRoutesHtml(b, heading = true) { const rs = (D.routes || []).filter((r) => r.bid === b.id).sort((x, y) => x.name.localeCompare(y.name)); if (!rs.length) return ''; return (heading ? `<div class="lbl" style="margin-top:10px">Saved routes</div>` : '') + rs.map((r) => savedRouteRow(r, { go: true, inBiz: true })).join(''); }
function routeSnapshot() { const R = S.route; return { stops: R.stops.map((x) => ({ fid: x.fid })), start: { ...R.start }, end: { ...R.end }, endSame: !!R.endSame, mode: R.mode }; }
async function saveRoute(asNew) {
  const R = S.route; if (!R.stops.length) { toast('Add some stops first'); return; }
  const cur = !asNew && R.savedId ? D.routes.find((x) => x.id === R.savedId) : null;
  const stopBiz = [...new Set(R.stops.map((x) => IDX.farmBiz.get(x.fid)).filter(Boolean))]; const curBid = cur ? cur.bid || '' : stopBiz.length === 1 ? stopBiz[0].id : '';
  const others = D.businesses.filter((b) => !stopBiz.includes(b) && isClientBiz(b)).sort((a, b) => a.name.localeCompare(b.name));
  const bizSel = `<div class="f"><span class="lbl">Save to a business (optional)</span><select data-ask="bid" style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"><option value="">Not saved to a business</option><optgroup label="Businesses on this route">${stopBiz.map((b) => `<option value="${b.id}" ${b.id === curBid ? 'selected' : ''}>${h(b.name)}</option>`).join('')}</optgroup><optgroup label="Other client businesses">${others.map((b) => `<option value="${b.id}" ${b.id === curBid ? 'selected' : ''}>${h(b.name)}</option>`).join('')}</optgroup></select><div class="hint">The route will show under "Saved routes" on that business and its contacts.</div></div>`;
  const name = await askBox(cur ? 'Save changes to route' : 'Save route', `<p style="font-weight:600">${h(routeSummary(routeSnapshot()))}</p>${bizSel}<div class="f"><span class="lbl">Route name (required)</span><textarea rows="1" style="width:100%;height:46px;min-height:46px;resize:none;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px" placeholder="e.g. Tuesday Kendenup run">${h(cur ? cur.name : '')}</textarea></div>`, cur ? 'Save changes' : 'Save route', false, 'Cancel');
  if (!name) return; if (name === true) { toast('A route name is required — nothing was saved'); return; }
  const bid = ASK_FORM.bid || null;
  let r = cur; if (!r) { r = { id: uid('r'), createdAt: Date.now(), by: deviceName() }; D.routes.push(r); }
  Object.assign(r, { name, bid }, routeSnapshot()); touch(r); R.savedId = r.id;
  S.skipConfirm = true; NEXT_LOG_LABEL = (cur ? 'Updated route ' : 'Saved route ') + name; await changed(); toast('Route saved: ' + name);
}
function loadRoute(id) { const r = D.routes.find((x) => x.id === id); if (!r) return; const stops = r.stops.filter((x) => IDX.farms.get(x.fid)); Object.assign(S.route, { stops: stops.map((x) => ({ fid: x.fid })), start: { ...r.start }, end: { ...r.end }, endSame: r.endSame, mode: r.mode, savedId: r.id }); renderAll(); toast('Loaded: ' + r.name + (stops.length < r.stops.length ? ` (${r.stops.length - stops.length} farm${r.stops.length - stops.length === 1 ? '' : 's'} no longer exist)` : '')); }
async function deleteRoute(id) { const r = D.routes.find((x) => x.id === id); if (!r) return; if (!(await ask(`Delete the saved route "${r.name}"?`, 'Yes — delete route', true))) return; D.routes = D.routes.filter((x) => x !== r); D.deleted.push({ id: r.id, kind: 'routes', at: Date.now() }); if (S.route.savedId === r.id) S.route.savedId = null; NEXT_LOG_LABEL = 'Deleted route ' + r.name; S.skipConfirm = true; await changed(); Sync.soon(); toast('Route deleted'); }
function savedRoutesCard() {
  const rs = (D.routes || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="card"><h3>Saved routes (${rs.length})</h3>${rs.map((r) => savedRouteRow(r)).join('') || '<div class="hint">No saved routes yet. Plan a route above, then tap "Save route".</div>'}</div>`;
}
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'q') { S.q = t.value; clearTimeout(t._tm); t._tm = setTimeout(renderContactList, 120); }
  else if (t.id === 'mg-search') { const isC = t.dataset.kind === 'contact'; const pq = parseQuery(t.value); const box = $('#mg-res');
    const res = !pq.inc.length ? [] : isC ? D.contacts.filter((c) => c.id !== t.dataset.id && matchQ([fullName(c), ...c.mobiles.map((p) => p.value.replace(/\D/g, '')), ...c.landlines.map((p) => p.value.replace(/\D/g, '')), ...bizOf(c).map((b) => b.name)].join(' ').toLowerCase(), pq)).slice(0, 12) : D.businesses.filter((b) => b.id !== t.dataset.id && matchQ(bizHay(b), pq)).slice(0, 12);
    box.innerHTML = t.value.trim() ? `<div class="results">${res.map((r) => `<div data-act="mg-pick" data-kind="${t.dataset.kind}" data-a="${t.dataset.id}" data-b="${r.id}"><b>${h(isC ? fullName(r) : r.name)}</b> <span class="hint">${h(isC ? (bizOf(r).map((b) => b.name).join(', ') || (r.mobiles[0] || r.landlines[0] || {}).value || '') : ((IDX.bizContacts.get(r.id) || []).map((c) => c.first).join(', ') + ' · ' + r.farms.length + ' farms'))}</span></div>`).join('') || '<div class="hint">No matches.</div>'}</div>` : ''; }
  else if (t.id === 'biz-linksearch' || t.id === 'biz-linksearch-past') {
    const past = t.id === 'biz-linksearch-past'; const pq = parseQuery(t.value); const bid = t.dataset.bid; const box = $(past ? '#biz-linkres-past' : '#biz-linkres');
    const res = pq.inc.length ? D.contacts.filter((c) => !c.links.some((l) => l.bid === bid) && matchQ([fullName(c), ...c.mobiles.map((p) => p.value.replace(/\D/g, '')), ...bizOf(c).map((b) => b.name)].join(' ').toLowerCase(), pq)).slice(0, 10) : [];
    box.innerHTML = t.value.trim() ? `<div class="results">${res.map((c) => `<div data-act="${past ? 'link-pick-past' : 'biz-link-pick'}" data-cid="${c.id}" data-bid="${bid}"><b>${h(fullName(c))}</b> <span class="hint">${h(bizOf(c).map((b) => b.name).join(', ') || (c.mobiles[0] || {}).value || '')}</span></div>`).join('') || '<div class="hint">No matching contacts.</div>'}</div>` : '';
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
      const keepSync = D.sync; D = js; D.sync = keepSync || {}; D.deleted = D.deleted || []; D.conflicts = []; D.dismissed = D.dismissed || {}; D.firstRun = false; D.importedAt = D.importedAt || new Date().toLocaleDateString('en-AU'); D.routes = D.routes || [];
      [...D.contacts, ...D.businesses, ...D.tags, ...D.routes, D.settings].forEach((r) => (r._dirty = true));
      reindex(); migrate(); baseline(); changed(); toast('Data loaded'); Sync.soon(); } catch (err) { toast('Could not restore: ' + err.message); }
  }
});
function net() { const n = $('#net'); n.textContent = navigator.onLine ? 'Online' : 'Offline'; n.className = 'pill' + (navigator.onLine ? '' : ' off'); }
window.addEventListener('online', net); window.addEventListener('offline', net);
window.addEventListener('popstate', () => {
  if (NAV.ignorePop) { NAV.ignorePop--; return; }
  if (CONFIRM) { closeAsk(false, true); return; } // phone Back closes a confirm pop-up first
  if (SHEET) { leaveSheet(true); return; } // back closes an open edit screen first (asks if there are unsaved changes)
  navRestore();
});
document.addEventListener('scroll', (e) => { if (!NAV.last) return; if (e.target.id === 'list') NAV.last.scroll = e.target.scrollTop; if (e.target.id === 'detail') NAV.last.dscroll = e.target.scrollTop; }, true);
try { history.replaceState({ bvt: 0 }, ''); } catch (e) { }
window.addEventListener('beforeunload', (e) => { if (sheetDirty()) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (CONFIRM) closeAsk(false); else if (SHEET) leaveSheet(); } });

/* ---------------- start ---------------- */
(async function init() {
  D = await Store.get('data');
  if (!D) { D = await loadSeed(); D.dismissed = D.dismissed || {}; await Store.set('data', D); }
  D.sync = D.sync || {}; D.deleted = D.deleted || []; D.conflicts = D.conflicts || []; D.trash = D.trash || []; D.routes = D.routes || [];
  reindex(); baseline(); migrate(); logChanges('Automatic update'); save();
  if (PREF.tab) S.tab = PREF.tab; if (PREF.sort) S.sort = PREF.sort; if (PREF.bsort) S.bsort = PREF.bsort; if (PREF.ptype) S.ptype = PREF.ptype; if (PREF.btype) S.btype = PREF.btype;
  applyUi(); reindex(); net(); renderAll();
  Sync.start(); Backup.schedule(); setTimeout(askDeviceName, 600);
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
