/* Bovitech Contacts — offline-first contacts app
   Data lives on the device (IndexedDB). OneDrive sync + Google Contacts push plug in via Sync/GContacts modules (to be connected). */
'use strict';

/* ---------------- constants ---------------- */
const RATINGS = ['aplus', 'a', 'b', 'c'];
const RATING_SET = new Set(RATINGS);
const RATING_SHORT = { aplus: 'A+', a: 'A', b: 'B', c: 'C' };
// which photo wins when we must pick one automatically (user is still asked via the job list)
const PHOTO_PRIORITY = ['dna', 'blockedc', 'blockedn', 'payup', 'inactive', 'newfac', 'newassess', 'newmaybe', 'aplus', 'a', 'b', 'c', 'bvs', 'bfriends', 'sheepreg', 'sheepocc', 'occ', 'industry', 'prac', 'phone', 'family'];
const MAX_STOPS = 9;
const ICONS = {
  contacts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><path d="M17 4a4 4 0 0 1 0 8M22 21c0-3-1.5-5.5-4-6.5"/></svg>',
  biz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-7h6v7"/></svg>',
  route: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/></svg>',
  jobs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
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
function touch(rec) { rec._u = Date.now(); rec._dev = DEVICE; rec._dirty = true; if (window.Sync) Sync.soon(); }
function pendingCount() { if (!D) return 0; return [...D.contacts, ...D.businesses, ...D.tags, D.settings].filter((r) => r && r._dirty).length + (D.deleted || []).filter((x) => !x.synced).length + (D._dismissDirty ? 1 : 0); }

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
const fullName = (c) => [c.first, c.middle && !/^\(/.test(c.middle) ? c.middle : '', c.last].filter(Boolean).join(' ') + (c.middle && /^\(/.test(c.middle) ? ' ' + c.middle : '');
const bizOf = (c) => c.links.map((l) => IDX.biz.get(l.bid)).filter(Boolean);
const tagName = (id) => IDX.tags.get(id)?.name || id;
function contactRatings(c) {
  const out = [];
  bizOf(c).forEach((b) => { if (b.rating) out.push({ rating: b.rating, biz: b }); });
  c.tags.filter((t) => RATING_SET.has(t)).forEach((t) => out.push({ rating: t, biz: null }));
  return out;
}
const distinctRatings = (c) => [...new Set(contactRatings(c).map((r) => r.rating))];
function contactTagSet(c) { const s = new Set(c.tags); contactRatings(c).forEach((r) => s.add(r.rating)); return s; }
function hasWarning(c) { return !!(c.warnings && c.warnings.trim()) || bizOf(c).some((b) => b.warnings && b.warnings.trim()); }
const tagPhotoSrc = (id) => { const t = IDX.tags.get(id); if (!t) return null; if (t.photoData) return t.photoData; if (!t.photo) return null; return (window.IMG && window.IMG[t.photo]) || 'img/' + t.photo + '.png'; };
function rbadge(r) { return `<span class="rb ${r}">${RATING_SHORT[r]}</span>`; }
const fmtKm = (f) => (f.kmReturn == null ? '—' : `${+f.kmReturn.toFixed(1)} km return`);
const fmtMin = (m) => (m == null ? '' : m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
const gmapsPin = (f) => `https://www.google.com/maps/search/?api=1&query=${f.lat},${f.lng}`;
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

/* ---------------- photos ---------------- */
function photoCandidates(c) {
  const dr = distinctRatings(c);
  const ptags = c.tags.filter((t) => !RATING_SET.has(t) && tagPhotoSrc(t));
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
    cands.sort((a, b) => PHOTO_PRIORITY.indexOf(a) - PHOTO_PRIORITY.indexOf(b));
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
  const bs = bizOf(c); const parts = [fullName(c), c.role, c.info, c.warnings, ...c.postal];
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
function computeJobs() {
  const jobs = []; const dis = D.dismissed || {};
  const add = (j) => { j.key = j.type + ':' + (j.fid || j.id); if (!dis[j.key]) jobs.push(j); };
  // farms
  const byGps = new Map();
  D.businesses.forEach((b) => {
    b.farms.forEach((f) => {
      const who = b.name + (f.name ? ' — ' + f.name : '');
      if (f.lat == null) add({ type: 'nogps', kind: 'business', id: b.id, fid: f.id, who, note: 'Address but no GPS pin' + (f.address ? ': ' + f.address : '') });
      if (f.kmReturn == null) add({ type: 'nokm', kind: 'business', id: b.id, fid: f.id, who, note: 'No distance recorded' });
      if (f.kmStatus === 'needs-verify') add({ type: 'kmverify', kind: 'business', id: b.id, fid: f.id, who, note: 'Distance requires verification' });
      (f.flags || []).forEach((fl) => { if (['signfix', 'kmcheck'].includes(fl.type)) add({ type: fl.type, kind: 'business', id: b.id, fid: f.id, who, note: fl.note, data: fl }); });
      if (f.lat != null && f.kmReturn != null) { const k = f.lat.toFixed(3) + ',' + f.lng.toFixed(3); if (!byGps.has(k)) byGps.set(k, []); byGps.get(k).push({ b, f }); }
    });
    (b.flags || []).forEach((fl) => add({ type: fl.type, kind: 'business', id: b.id, who: b.name, note: fl.note }));
  });
  byGps.forEach((arr) => {
    const kms = [...new Set(arr.map((x) => x.f.kmReturn))];
    if (kms.length > 1) arr.forEach(({ b, f }) => add({ type: 'kmconflict', kind: 'business', id: b.id, fid: f.id, who: b.name + (f.name ? ' — ' + f.name : ''), note: 'Same GPS location has different km recorded: ' + kms.map((k) => k + ' km').join(' / ') + (arr.length > 1 ? ' (' + [...new Set(arr.map((x) => x.b.name))].join(', ') + ')' : '') }));
  });
  // contacts
  D.contacts.forEach((c) => {
    const who = fullName(c);
    if (needsPhotoChoice(c)) { const { dr, ptags } = photoCandidates(c); add({ type: 'photo', kind: 'contact', id: c.id, who, note: 'Has more than one tag with a photo (' + [...dr, ...ptags].map(tagName).join(', ') + ') — choose one, or a split photo' }); }
    if (c.tags.includes('sheep')) add({ type: 'sheep', kind: 'contact', id: c.id, who, note: 'Choose Sheep only (regular) or Sheep only (occasional)' });
    (c.flags || []).forEach((fl) => { if (fl.type === 'multirating') add({ type: 'multirating', kind: 'contact', id: c.id, who, note: fl.note }); });
  });
  (D.conflicts || []).forEach((cf) => add({ type: 'conflict', kind: cf.kind === 'businesses' ? 'business' : 'contact', id: cf.key, who: cf.who, note: 'Changed on two devices while offline — choose which version to keep', data: cf }));
  return jobs;
}
const JOB_TYPES = {
  conflict: { t: 'Sync conflicts', manual: false },
  kmcheck: { t: 'Distance more than 1 km different to Google Maps', manual: true },
  kmverify: { t: 'Distance requires verification', manual: false },
  kmconflict: { t: 'Same farm, different km on different contacts', manual: true },
  nogps: { t: 'Farm address with no GPS pin', manual: true },
  signfix: { t: 'GPS pin corrected (missing minus sign) — confirm', manual: true, btn: 'Pin is correct' },
  nokm: { t: 'No distance recorded', manual: true },
  photo: { t: 'Choose which photo to show', manual: false },
  sheep: { t: 'Sheep only — regular or occasional?', manual: false },
  multirating: { t: 'Specify rating for each business', manual: true },
  ratingconflict: { t: 'Business has conflicting ratings', manual: true },
  noname: { t: 'Business created from a contact name — check', manual: true },
};
let JOBS_CACHE = null;
function jobs() { if (!JOBS_CACHE) JOBS_CACHE = computeJobs(); return JOBS_CACHE; }
function jobsFor(kind, id) { return jobs().filter((j) => j.id === id && (j.kind === kind || (kind === 'contact' && false))); }

/* ---------------- rendering: shell ---------------- */
const TABS = [['contacts', 'Contacts'], ['biz', 'Businesses'], ['route', 'Route'], ['jobs', 'Jobs'], ['settings', 'Settings']];
function renderTabs() {
  const n = jobs().length;
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button data-act="tab" data-v="${k}" class="${S.tab === k ? 'on' : ''}">${ICONS[k]}<span>${l}</span>${k === 'jobs' && n ? `<span class="badge">${n}</span>` : ''}</button>`).join('');
}
function changed() { JOBS_CACHE = null; reindex(); save(); renderAll(); }
function renderAll() {
  renderTabs();
  const main = $('#main');
  main.classList.toggle('single', ['route', 'jobs', 'settings'].includes(S.tab));
  if (S.tab === 'contacts') { renderContactList(); renderDetail(); }
  else if (S.tab === 'biz') { renderBizList(); renderDetail(); }
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
    if (S.sort === 'tag') { const t = c.tags.filter((x) => !RATING_SET.has(x)); return t.length ? tagName(t.slice().sort((a, b) => tagName(a).localeCompare(tagName(b)))[0]) : 'No tags'; }
    return null;
  };
  const rOrder = (g) => { const i = ['A+ client', 'A client', 'B client', 'C client'].findIndex((x) => g.startsWith(x)); return i < 0 ? 9 : i; };
  return arr.map((c) => ({ c, g: groupOf(c), n: nm(c) })).sort((x, y) => {
    if (x.c.starred !== y.c.starred) return x.c.starred ? -1 : 1;
    if (x.g !== y.g) { if (S.sort === 'rating') { const d = rOrder(x.g) - rOrder(y.g); if (d) return d; } return (x.g || '').localeCompare(y.g || ''); }
    return x.n.localeCompare(y.n);
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
  let html = `<div class="toolbar"><div class="search"><input id="q" type="search" placeholder="Search — use -word to exclude" value="${h(S.q)}" autocomplete="off"><button class="btn primary" data-act="new-contact">+ New</button></div>
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
  const parts = [b.name, b.info, b.warnings, b.rating ? tagName(b.rating) : ''];
  b.pics.forEach((p) => parts.push(p.value)); b.patientIds.forEach((p) => parts.push(p.label, p.value)); b.farms.forEach((f) => parts.push(f.name, f.address, f.info));
  (IDX.bizContacts.get(b.id) || []).forEach((c) => parts.push(fullName(c)));
  const s = parts.filter(Boolean).join(' \u0001 ').toLowerCase(); IDX.bhay.set(b.id, s); return s;
}
function renderBizList() {
  const keepFocus = document.activeElement && document.activeElement.id === 'bq';
  const pq = parseQuery(S.bq);
  let rows = D.businesses.filter((b) => matchQ(bizHay(b), pq));
  rows.sort((a, b) => (S.bsort === 'rating' ? (RATINGS.indexOf(a.rating) + 10) % 14 - (RATINGS.indexOf(b.rating) + 10) % 14 : 0) || a.name.localeCompare(b.name));
  let html = `<div class="toolbar"><div class="search"><input id="bq" type="search" placeholder="Search businesses, farms, PICs…" value="${h(S.bq)}" autocomplete="off"><button class="btn primary" data-act="new-biz">+ New</button></div>
  <div class="row2"><span>${rows.length} businesses</span><label>Sort <select data-act="bsort"><option value="name">Name</option><option value="rating" ${S.bsort === 'rating' ? 'selected' : ''}>Rating</option></select></label></div></div><ul class="list">`;
  rows.slice(0, 400).forEach((b) => {
    const cs = IDX.bizContacts.get(b.id) || [];
    const flagged = jobs().some((j) => j.kind === 'business' && j.id === b.id);
    html += `<li class="item ${S.sel?.id === b.id ? 'sel' : ''}" data-act="open" data-kind="business" data-id="${b.id}"><div class="t"><div class="n">${b.rating ? rbadge(b.rating) : ''}${h(b.name)}</div><div class="s">${cs.length} contact${cs.length === 1 ? '' : 's'} · ${b.farms.length} farm${b.farms.length === 1 ? '' : 's'}${cs.length ? ' · ' + h(cs.map((c) => c.first).join(', ')) : ''}</div></div>${flagged ? `<span style="color:var(--red)" title="Needs attention">${ICONS.flag}</span>` : ''}${b.warnings ? '<span class="wdot"></span>' : ''}</li>`;
  });
  if (!rows.length) html += `<li class="empty">No businesses match.</li>`;
  $('#list').innerHTML = html + '</ul>';
  if (keepFocus) { const q = $('#bq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}

/* ---------------- detail views ---------------- */
function renderDetail() {
  const el = $('#detail');
  if (!S.sel) { el.innerHTML = `<div class="empty" style="padding-top:80px">Select a ${S.tab === 'biz' ? 'business' : 'contact'} to see details.</div>`; document.body.classList.remove('show-detail'); return; }
  if (S.sel.kind === 'contact') { const c = D.contacts.find((x) => x.id === S.sel.id); if (!c) { S.sel = null; return renderDetail(); } el.innerHTML = contactDetail(c); }
  else { const b = IDX.biz.get(S.sel.id); if (!b) { S.sel = null; return renderDetail(); } el.innerHTML = bizDetail(b); }
  document.body.classList.add('show-detail');
}
function phoneLinks(list, sms) {
  return list.map((p) => `<div class="kv"><div class="k">${h(p.label || '')}</div><div class="v"><a href="tel:${h(p.value.replace(/[^\d+]/g, ''))}">${h(p.value)}</a>${sms ? ` · <a href="sms:${h(p.value.replace(/[^\d+]/g, ''))}">text</a>` : ''}</div></div>`).join('');
}
function flagLines(kind, id, fid) {
  return jobs().filter((j) => j.kind === kind && j.id === id && (fid === undefined || j.fid === fid)).map((j) => `<div class="flagline"><span style="color:var(--red)">${ICONS.flag}</span><div>${h(j.note)}</div></div>`).join('');
}
function contactDetail(c) {
  const bs = bizOf(c);
  const tags = c.tags.filter((t) => !RATING_SET.has(t));
  const cflags = jobs().filter((j) => j.kind === 'contact' && j.id === c.id);
  let html = `<div class="d-wrap"><button class="back" data-act="back">‹ Back</button>
  <div class="hero">${contactPhotoImg(c, '', 320)}<div><h2>${h(fullName(c))}</h2><div class="sub">${h(c.role || '')}${c.role && bs.length ? ' · ' : ''}${h(bs.map((b) => b.name).join(', '))}</div>
  <div style="margin-top:6px">${contactRatings(c).map((r) => rbadge(r.rating) + (r.biz && bs.length > 1 ? `<span style="font-size:13px;color:var(--ink3);margin-right:8px">${h(r.biz.name)}</span>` : '')).join('')}</div></div></div>
  <div class="actions"><button class="btn primary" data-act="edit-contact" data-id="${c.id}">Edit</button><button class="btn" data-act="star" data-id="${c.id}">${c.starred ? '★ Starred' : '☆ Star'}</button>${c.mobiles[0] ? `<a class="btn" href="tel:${h(c.mobiles[0].value.replace(/[^\d+]/g, ''))}">Call</a>` : ''}</div>`;
  html += cflags.map((j) => `<div class="flagline"><span style="color:var(--red)">${ICONS.flag}</span><div>${h(j.note)}</div></div>`).join('');
  if (hasWarning(c)) {
    html += `<div class="card warn"><h3>⚠ Warnings</h3>${c.warnings ? `<div class="body">${h(c.warnings)}</div>` : ''}${bs.filter((b) => b.warnings).map((b) => `<div class="body" style="margin-top:6px"><b>${h(b.name)}:</b> ${h(b.warnings)}</div>`).join('')}</div>`;
  }
  html += `<div class="card"><h3>Contact</h3>${phoneLinks(c.mobiles.map((p) => ({ ...p, label: p.label || 'Mobile' })), true)}${phoneLinks(c.landlines.map((p) => ({ ...p, label: p.label || 'Landline' })))}${c.emails.map((e) => `<div class="kv"><div class="k">${h(e.label || 'Email')}</div><div class="v"><a href="mailto:${h(e.value)}">${h(e.value)}</a></div></div>`).join('')}${c.postal.map((p) => `<div class="kv"><div class="k">Postal</div><div class="v">${h(p)}</div></div>`).join('')}${!c.mobiles.length && !c.landlines.length && !c.emails.length && !c.postal.length ? '<div class="hint">No contact details yet.</div>' : ''}</div>`;
  if (tags.length) html += `<div class="card"><h3>Tags</h3><div class="tagrow">${tags.map(tagPill).join('')}</div></div>`;
  html += `<div class="card"><h3>General info</h3><div class="body">${c.info ? h(c.info) : '<span class="hint">Nothing yet.</span>'}</div></div>`;
  bs.forEach((b) => {
    html += `<div class="card"><h3>${b.rating ? rbadge(b.rating) : ''}<span class="sp">${h(b.name)}</span><button class="btn small" data-act="open" data-kind="business" data-id="${b.id}">Open business</button></h3>`;
    if (b.pics.length) html += `<div class="kv"><div class="k">PIC${b.pics.length > 1 ? 's' : ''}</div><div class="v">${b.pics.map((p) => h(p.value) + (p.label ? ` <span class="hint">${h(p.label)}</span>` : '')).join('<br>')}</div></div>`;
    if (b.patientIds.length) html += `<div class="kv"><div class="k">Patient IDs</div><div class="v">${b.patientIds.map((p) => `${h(p.value)} <span class="hint">${h(p.label)}</span>`).join('<br>')}</div></div>`;
    html += b.farms.map((f) => farmCard(b, f, false)).join('');
    html += '</div>';
  });
  return html + '</div>';
}
function tagPill(t) { const src = tagPhotoSrc(t); return `<span class="tag ${src ? '' : 'noimg'}">${src ? `<img src="${src}" alt="">` : ''}${h(tagName(t))}</span>`; }
function farmCard(b, f, withFlags = true) {
  const verify = f.kmStatus === 'needs-verify';
  return `<div class="farm ${f.seeWarning ? 'red' : ''}"><div class="fn">${f.seeWarning ? '⚠ ' : ''}${h(f.name || 'Farm')}</div>
  ${f.address ? `<div>${h(f.address)}</div>` : ''}
  <div class="meta">${f.lat != null ? `<a href="${gmapsPin(f)}" target="_blank" rel="noopener">📍 ${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}</a>` : '<span>No GPS pin</span>'}
  <span>${verify ? '<span class="verify">Distance requires verification</span> ' : ''}${fmtKm(f)}</span>${f.driveMin != null ? `<span>🚗 ${fmtMin(f.driveMin)} each way</span>` : ''}</div>
  ${f.info ? `<div class="body" style="margin-top:4px;font-size:14.5px">${h(f.info)}</div>` : ''}
  ${withFlags ? flagLines('business', b.id, f.id) : ''}
  <div class="actions" style="margin:8px 0 0">${f.lat != null ? `<button class="btn small" data-act="route-add" data-fid="${f.id}">+ Route</button>` : ''}<button class="btn small" data-act="edit-farm" data-bid="${b.id}" data-fid="${f.id}">Edit farm</button></div></div>`;
}
function bizDetail(b) {
  const cs = IDX.bizContacts.get(b.id) || [];
  let html = `<div class="d-wrap"><button class="back" data-act="back">‹ Back</button>
  <div class="hero" style="display:block"><h2>${b.rating ? rbadge(b.rating) : ''}${h(b.name)}</h2><div class="sub">${cs.length} contact${cs.length === 1 ? '' : 's'} · ${b.farms.length} farm${b.farms.length === 1 ? '' : 's'}</div></div>
  <div class="actions"><button class="btn primary" data-act="edit-biz" data-id="${b.id}">Edit</button><button class="btn" data-act="add-farm" data-bid="${b.id}">+ Farm</button>${b.farms.some((f) => f.lat != null) ? `<button class="btn" data-act="route-add-biz" data-bid="${b.id}">+ All farms to route</button>` : ''}</div>`;
  html += flagLines('business', b.id).replace(/<div class="flagline">/g, '<div class="flagline">');
  if (b.warnings) html += `<div class="card warn"><h3>⚠ Warnings</h3><div class="body">${h(b.warnings)}</div></div>`;
  html += `<div class="card"><h3>Contacts</h3>${cs.map((c) => `<div class="biz-link" data-act="open" data-kind="contact" data-id="${c.id}">${contactPhotoImg(c, 'av', 120)}<div><div style="font-weight:600">${h(fullName(c))}</div><div class="hint">${h(c.role || '')} ${h((c.mobiles[0] || c.landlines[0] || {}).value || '')}</div></div></div>`).join('') || '<div class="hint">No contacts linked.</div>'}</div>`;
  html += `<div class="card"><h3>PICs</h3>${b.pics.map((p) => `<div class="kv"><div class="k">${h(p.label || 'PIC')}</div><div class="v">${h(p.value)}</div></div>`).join('') || '<div class="hint">None recorded.</div>'}</div>`;
  html += `<div class="card"><h3>Patient IDs</h3>${b.patientIds.map((p) => `<div class="kv"><div class="k">${h(p.label || 'ID')}</div><div class="v">${h(p.value)}</div></div>`).join('') || '<div class="hint">None recorded.</div>'}</div>`;
  html += `<div class="card"><h3>Farms</h3>${b.farms.map((f) => farmCard(b, f)).join('') || '<div class="hint">No farms yet.</div>'}</div>`;
  html += `<div class="card"><h3>General info</h3><div class="body">${b.info ? h(b.info) : '<span class="hint">Nothing yet.</span>'}</div></div>`;
  return html + '</div>';
}

/* ---------------- edit sheets ---------------- */
let SHEET = null; // {type, rec, ...}
function openSheet(title, body, onSave, extraBtns = '') {
  closeSheet();
  const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'sheet';
  bg.innerHTML = `<div class="sheet"><div class="sheet-h"><button class="btn" data-act="sheet-cancel">Cancel</button><h2>${h(title)}</h2>${extraBtns}<button class="btn primary" data-act="sheet-save" id="sheet-save">Save</button></div><div class="form">${body}</div></div>`;
  document.body.appendChild(bg); SHEET = { onSave };
  bg.addEventListener('click', (e) => { if (e.target === bg) closeSheet(); });
}
function closeSheet() { const s = $('#sheet'); if (s) s.remove(); SHEET = null; }
function repRows(name, rows, fields) {
  // fields: [{k, ph, w, opts}]
  const row = (r = {}) => `<div class="rep" data-rep="${name}">${fields.map((f) => f.opts ? `<select data-k="${f.k}" style="flex:${f.w || 1}">${f.opts.map((o) => `<option ${o === (r[f.k] || '') ? 'selected' : ''}>${h(o)}</option>`).join('')}${r[f.k] && !f.opts.includes(r[f.k]) ? `<option selected>${h(r[f.k])}</option>` : ''}</select>` : `<input data-k="${f.k}" placeholder="${h(f.ph || '')}" value="${h(r[f.k] || '')}" style="flex:${f.w || 1}" ${f.list ? `list="${f.list}"` : ''}>`).join('')}<button class="x" type="button" data-act="rep-del" title="Remove">×</button></div>`;
  return `<div data-repwrap="${name}">${rows.map(row).join('')}</div><button class="btn small" type="button" data-act="rep-add" data-rep="${name}">+ Add</button><template data-reptpl="${name}">${row()}</template>`;
}
function readRep(name) {
  return [...document.querySelectorAll(`#sheet [data-rep="${name}"].rep`)].map((r) => { const o = {}; r.querySelectorAll('[data-k]').forEach((i) => (o[i.dataset.k] = i.value.trim())); return o; }).filter((o) => Object.values(o).some((v) => v && v !== '(none)'));
}
const val = (id) => ($('#' + id) ? $('#' + id).value.trim() : '');

function editContact(c) {
  const isNew = !c;
  c = c || { id: uid('c'), first: '', middle: '', last: '', role: '', links: [], tags: [], emails: [], mobiles: [], landlines: [], postal: [], info: '', warnings: '', starred: false, photoChoice: 'auto', flags: [] };
  const groups = [['client', 'Client tags (set the photo)'], ['additional', 'Additional tags (no photo)']];
  const { dr, ptags } = photoCandidates(c);
  const photoOpts = [['auto', 'Automatic' + (needsPhotoChoice(c) ? ' (needs choosing)' : '')], ...[...new Set([...dr, ...c.tags.filter((t) => tagPhotoSrc(t))])].map((t) => [t, tagName(t)])];
  const cands = [...new Set([...dr, ...ptags])];
  if (cands.length >= 2) photoOpts.push(['split:' + cands.slice(0, 2).join(','), 'Split: ' + cands.slice(0, 2).map(tagName).join(' + ')]);
  if (c.photoChoice && c.photoChoice.startsWith('split:') && !photoOpts.some((o) => o[0] === c.photoChoice)) photoOpts.push([c.photoChoice, 'Split (current)']);
  photoOpts.push(['custom', 'Upload my own photo']);
  const body = `
  <div class="grid2"><div class="f"><label>First name</label><input id="e-first" value="${h(c.first)}"></div><div class="f"><label>Surname</label><input id="e-last" value="${h(c.last)}"></div></div>
  <div class="grid2"><div class="f"><label>Middle / nickname</label><input id="e-middle" value="${h(c.middle)}"></div><div class="f"><label>Role / position</label><input id="e-role" value="${h(c.role)}"></div></div>
  <div class="f"><label>Businesses</label><div id="e-links">${c.links.map((l) => linkRow(l.bid)).join('')}</div>
    <input id="e-bizsearch" placeholder="Search to link a business, or type a new business name"><div id="e-bizres"></div>
    <div class="hint">Ratings belong to the business — set them on the business. A contact linked to several businesses shows each rating.</div></div>
  ${c.tags.filter((t) => RATING_SET.has(t)).length ? `<div class="f"><label>Rating (contact has no business)</label><select id="e-rating"><option value="">None</option>${RATINGS.map((r) => `<option value="${r}" ${c.tags.includes(r) ? 'selected' : ''}>${tagName(r)}</option>`).join('')}</select></div>` : (c.links.length ? '' : `<div class="f"><label>Rating (contact has no business)</label><select id="e-rating"><option value="">None</option>${RATINGS.map((r) => `<option value="${r}">${tagName(r)}</option>`).join('')}</select></div>`)}
  ${groups.map(([g, l]) => `<div class="f"><span class="lbl">${l}</span><div class="checks">${D.tags.filter((t) => t.group === g && (t.id !== 'sheep' || c.tags.includes('sheep'))).map((t) => `<label><input type="checkbox" data-tag="${t.id}" ${c.tags.includes(t.id) ? 'checked' : ''}>${h(t.name)}</label>`).join('')}</div></div>`).join('')}
  <div class="f"><label>Mobile numbers</label>${repRows('mob', c.mobiles, [{ k: 'value', ph: '04xx xxx xxx', w: 3 }, { k: 'label', ph: 'Label', w: 2 }])}</div>
  <div class="f"><label>Landline numbers</label>${repRows('land', c.landlines, [{ k: 'value', ph: '08 xxxx xxxx', w: 3 }, { k: 'label', ph: 'Label', w: 2 }])}</div>
  <div class="f"><label>Email</label>${repRows('email', c.emails, [{ k: 'value', ph: 'name@example.com', w: 3 }, { k: 'label', ph: 'Label', w: 2 }])}</div>
  <div class="f"><label>Postal address</label>${repRows('postal', c.postal.map((p) => ({ value: p })), [{ k: 'value', ph: 'PO Box / street, town, postcode' }])}</div>
  <div class="f"><label>General info</label><textarea id="e-info">${h(c.info)}</textarea></div>
  <div class="f"><label style="color:var(--red-ink)">Warnings (show in red, add "CHECK WARNING" to photo)</label><textarea id="e-warn" class="warn">${h(c.warnings)}</textarea></div>
  <div class="f"><label>Photo</label><select id="e-photo">${photoOpts.map(([v, l]) => `<option value="${h(v)}" ${(c.photoChoice || 'auto') === v ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>
    <input type="file" id="e-photofile" accept="image/*" style="margin-top:6px;${c.photoChoice === 'custom' ? '' : 'display:none'}"><div class="hint">Photos come from the tags automatically. If a contact has two businesses with different ratings, the photo is split and labelled with each business.</div></div>
  <div class="f"><label><input type="checkbox" id="e-star" ${c.starred ? 'checked' : ''}> Starred (show at top of list)</label></div>
  ${isNew ? '' : `<div class="f"><button class="btn" data-act="del-contact" data-id="${c.id}" style="color:var(--red)">Delete contact</button></div>`}`;
  openSheet(isNew ? 'New contact' : 'Edit contact', body, async () => {
    const first = val('e-first'), last = val('e-last');
    if (!first && !last) { toast('Enter a name'); return false; }
    Object.assign(c, { first, last, middle: val('e-middle'), role: val('e-role'), info: $('#e-info').value.trim(), warnings: $('#e-warn').value.trim(), starred: $('#e-star').checked });
    c.links = [...document.querySelectorAll('#e-links [data-bid]')].map((el) => ({ bid: el.dataset.bid }));
    const newBiz = [...document.querySelectorAll('#e-links [data-newbiz]')];
    newBiz.forEach((el) => { const b = newBusiness(el.dataset.newbiz); c.links.push({ bid: b.id }); });
    let tags = [...document.querySelectorAll('#sheet [data-tag]')].filter((i) => i.checked).map((i) => i.dataset.tag);
    const rsel = $('#e-rating'); if (rsel && rsel.value) tags.unshift(rsel.value);
    c.tags = tags;
    c.mobiles = readRep('mob'); c.landlines = readRep('land'); c.emails = readRep('email'); c.postal = readRep('postal').map((p) => p.value);
    c.photoChoice = $('#e-photo').value;
    const file = $('#e-photofile').files[0];
    if (c.photoChoice === 'custom' && file) c.photoData = await fileToDataUrl(file, 480);
    if (c.photoChoice === 'custom' && !c.photoData) c.photoChoice = 'auto';
    c.flags = (c.flags || []).filter((f) => f.type !== 'multirating' || c.links.length > 1);
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
  <div class="f"><label>Rating</label><select id="e-brating"><option value="">None</option>${RATINGS.map((r) => `<option value="${r}" ${b.rating === r ? 'selected' : ''}>${tagName(r)}</option>`).join('')}</select></div>
  <div class="f"><label>PICs</label>${repRows('pic', b.pics, [{ k: 'value', ph: 'e.g. WFAY2784', w: 2 }, { k: 'label', ph: 'Label (optional, e.g. farm or entity)', w: 3 }])}</div>
  <div class="f"><label>Patient IDs</label>${repRows('pid', b.patientIds, [{ k: 'value', ph: 'e.g. 100154', w: 2 }, { k: 'label', ph: 'Cattle Herd ID / Sheep Flock ID / (entity) …', w: 3, list: 'pidlabels' }])}<datalist id="pidlabels">${[...new Set([...PID_LABELS, ...D.businesses.flatMap((x) => x.patientIds.map((p) => p.label))])].map((l) => `<option value="${h(l)}">`).join('')}</datalist></div>
  <div class="f"><label>General info</label><textarea id="e-binfo">${h(b.info)}</textarea></div>
  <div class="f"><label style="color:var(--red-ink)">Warnings (shown in red on every linked contact)</label><textarea id="e-bwarn" class="warn">${h(b.warnings)}</textarea></div>
  <div class="hint">Farms are added and edited from the business page.</div>
  ${isNew ? '' : `<div class="f" style="margin-top:12px"><button class="btn" data-act="del-biz" data-id="${b.id}" style="color:var(--red)">Delete business</button></div>`}`;
  openSheet(isNew ? 'New business' : 'Edit business', body, () => {
    const name = val('e-bname'); if (!name) { toast('Enter a business name'); return false; }
    const newRating = $('#e-brating').value || null;
    if (newRating !== b.rating) b.flags = (b.flags || []).filter((f) => f.type !== 'ratingconflict');
    Object.assign(b, { name, rating: newRating, pics: readRep('pic'), patientIds: readRep('pid'), info: $('#e-binfo').value.trim(), warnings: $('#e-bwarn').value.trim() });
    touch(b); if (isNew) D.businesses.push(b);
    S.sel = { kind: 'business', id: b.id }; if (isNew) S.tab = 'biz';
    return true;
  });
}
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
  const body = `<div class="f"><label>Farm label / name</label><input id="e-fname" value="${h(f.name)}" placeholder='e.g. "Jarrahvale" cattle yards'></div>
  <div class="f"><label>GPS location</label><input id="e-fgps" value="${h(startGps)}" placeholder="-34.94943, 118.02134  (or paste a Google Maps link)"><div class="hint" id="e-fgpshint">${f.lat != null ? `<a href="${gmapsPin(f)}" target="_blank" rel="noopener">Open pin in Google Maps</a>` : 'Drop a pin in Google Maps, copy the coordinates, paste here.'}</div></div>
  <div class="f"><label>Physical address (not linked to maps)</label><input id="e-faddr" value="${h(f.address)}"></div>
  <div class="grid2"><div class="f"><label>Distance from homebase — km return</label><input id="e-fkm" type="number" step="0.1" value="${f.kmReturn ?? ''}"></div>
  <div class="f"><label>Drive time each way (minutes)</label><input id="e-fmin" type="number" step="1" value="${f.driveMin != null ? Math.round(f.driveMin) : ''}"></div></div>
  <div><button class="btn small" type="button" data-act="calc-dist">Calculate with Google Maps</button> <span class="hint" id="e-calchint"></span></div>
  <div id="e-verify"></div>
  <div class="f" style="margin-top:10px"><label>Farm info</label><textarea id="e-finfo">${h(f.info)}</textarea></div>
  <div class="f"><label class="checks"><label><input type="checkbox" id="e-fwarn" ${f.seeWarning ? 'checked' : ''}> See warning (farm shows in red)</label></label></div>
  ${f.importedLabel ? `<div class="hint">Original Google Contacts label: ${h(f.importedLabel)}</div>` : ''}
  ${isNew ? '' : `<div class="f" style="margin-top:12px"><button class="btn" data-act="del-farm" data-bid="${b.id}" data-fid="${f.id}" style="color:var(--red)">Delete farm</button></div>`}`;
  openSheet(isNew ? 'New farm — ' + b.name : 'Edit farm', body, () => {
    const g = parseGps(val('e-fgps'));
    if (val('e-fgps') && !g) { toast('GPS not recognised — use "lat, lng"'); return false; }
    const gpsChanged = (g ? `${g.lat},${g.lng}` : '') !== (f.lat != null ? `${f.lat},${f.lng}` : '');
    const needVerify = SHEET.verifyNeeded;
    if (needVerify && !($('#e-verified') && $('#e-verified').checked)) { toast('Distance requires verification before saving'); $('#e-verify').scrollIntoView({ block: 'center' }); return false; }
    const km = val('e-fkm'), mn = val('e-fmin');
    Object.assign(f, { name: val('e-fname'), address: val('e-faddr'), info: $('#e-finfo').value.trim(), seeWarning: $('#e-fwarn').checked, kmReturn: km === '' ? null : +km, driveMin: mn === '' ? null : +mn });
    if (g) { f.lat = g.lat; f.lng = g.lng; } else { f.lat = f.lng = null; }
    if (gpsChanged) f.flags = (f.flags || []).filter((x) => x.type !== 'signfix' && x.type !== 'kmcheck');
    f.kmStatus = f.kmReturn == null ? 'missing' : needVerify || f.kmStatus === 'needs-verify' ? 'verified' : f.kmStatus;
    if ($('#e-verified') && $('#e-verified').checked) f.kmStatus = 'verified';
    touch(b); if (isNew) b.farms.push(f);
    return true;
  });
  SHEET.verifyNeeded = false;
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
    try { const r = await Maps.distances([g]); const x = r[0]; if (!x) throw new Error('No route found'); $('#e-fkm').value = (Math.round(x.km * 2 * 10) / 10); $('#e-fmin').value = Math.round(x.min); hint.textContent = `Google Maps: ${x.km.toFixed(1)} km each way, ${fmtMin(x.min)}. Please check.`; if (!SHEET.verifyNeeded) showVerify(); }
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
function renderJobs() {
  const js = jobs(); const groups = {};
  js.forEach((j) => (groups[j.type] = groups[j.type] || []).push(j));
  let html = `<div class="d-wrap"><h2 class="sec-h" style="font-size:26px">Jobs — things to check</h2>
  <div class="hint" style="margin-bottom:10px">Items clear automatically once fixed. Flags also show on the contact or business itself.</div>
  <div class="actions"><button class="btn" data-act="check-dist">Check all distances against Google Maps</button></div><div id="check-msg" class="hint"></div>`;
  if (!js.length) html += `<div class="empty">Nothing needs attention. 🎉</div>`;
  Object.keys(JOB_TYPES).forEach((t) => {
    const g = groups[t]; if (!g) return;
    html += `<details class="jobgroup" ${g.length <= 30 ? 'open' : ''}><summary><span style="color:var(--red)">${ICONS.flag}</span><span style="flex:1">${h(JOB_TYPES[t].t)}</span><span class="count">${g.length}</span></summary>`;
    g.forEach((j) => {
      html += `<div class="job"><div class="t"><div class="who">${h(j.who)}</div><div class="note">${h(j.note)}</div><div class="acts">
      ${t === 'conflict' ? '' : `<button class="btn small" data-act="job-open" data-kind="${j.kind}" data-id="${j.id}" ${j.fid ? `data-fid="${j.fid}"` : ''}>${j.fid ? 'Fix farm' : 'Open'}</button>`}
      ${t === 'conflict' ? `<button class="btn small red" data-act="conflict-open" data-key="${h(j.data.key)}">Resolve</button>` : ''}
      ${t === 'kmcheck' && j.data?.google != null ? `<button class="btn small" data-act="accept-google" data-fid="${j.fid}">Use Google: ${j.data.google} km</button>` : ''}
      ${JOB_TYPES[t].manual ? `<button class="btn small" data-act="job-dismiss" data-key="${h(j.key)}">${JOB_TYPES[t].btn || 'Mark resolved'}</button>` : ''}</div></div></div>`;
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
      const g = Math.round(r.km * 2 * 10) / 10;
      f.driveMin = f.driveMin ?? Math.round(r.min);
      f.flags = (f.flags || []).filter((x) => x.type !== 'kmcheck'); touch(IDX.farmBiz.get(f.id));
      if (f.kmReturn == null || Math.abs(f.kmReturn - g) > 1) { f.flags.push({ type: 'kmcheck', google: g, note: `Recorded ${f.kmReturn ?? '—'} km return, Google Maps says ${g} km return (${fmtMin(r.min)} each way)` }); n++; }
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
  ${['rating', 'client', 'additional'].map((g) => `<div class="lbl" style="margin-top:10px">${{ rating: 'Client rating', client: 'Client tags', additional: 'Additional tags (never change the photo)' }[g]}</div>${D.tags.filter((t) => t.group === g).map((t) => { const src = tagPhotoSrc(t.id); const n = D.contacts.filter((c) => contactTagSet(c).has(t.id)).length; return `<div class="kv" style="align-items:center">${src ? `<img src="${src}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">` : '<span style="width:36px;height:36px;border-radius:50%;background:#eee;display:inline-block"></span>'}<div class="v">${h(t.name)} <span class="hint">${n} contact${n === 1 ? '' : 's'}</span></div><button class="btn small" data-act="edit-tag" data-id="${t.id}">Edit</button></div>`; }).join('')}`).join('')}</div>
  <div class="card"><h3>Homebase</h3><div class="f"><label>Address</label><input id="s-homeaddr" value="${h(st.home.address)}"></div><div class="f"><label>GPS</label><input id="s-homegps" value="${st.home.lat}, ${st.home.lng}"></div><button class="btn small" data-act="save-home">Save homebase</button></div>
  <div class="card"><h3>Google Maps</h3><div class="f"><label>API key</label><input id="s-mapskey" value="${h(st.mapsKey || '')}" placeholder="Paste key starting with AIza…"></div><button class="btn small" data-act="save-key">Save key</button><div class="hint">Used to calculate km and drive time, check distances, and plan the most efficient route.</div></div>
  ${syncSettingsCard()}
  <div class="card"><h3>Backup</h3><div class="actions"><button class="btn" data-act="export">Download backup</button><label class="btn">Restore backup<input type="file" accept=".json" data-act="import" style="display:none"></label></div><div class="hint">Data imported from Google Contacts on ${h(D.importedAt || '14 Oct 2026')}.</div></div>
  </div>`;
}
function editTag(t) {
  const isNew = !t; t = t || { id: uid('t'), name: '', group: 'client', photo: null };
  const src = tagPhotoSrc(t.id);
  openSheet(isNew ? 'New tag' : 'Edit tag', `<div class="f"><label>Tag name</label><input id="t-name" value="${h(t.name)}"></div>
  <div class="f"><label>Type</label><select id="t-group" ${RATING_SET.has(t.id) ? 'disabled' : ''}><option value="client" ${t.group === 'client' ? 'selected' : ''}>Client tag (can set the photo)</option><option value="additional" ${t.group === 'additional' ? 'selected' : ''}>Additional tag (no photo)</option>${RATING_SET.has(t.id) ? '<option selected>Client rating</option>' : ''}</select></div>
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
    const out = { format: 1, savedAt: new Date().toISOString(), savedBy: DEVICE, settings: strip(D.settings), deleted: (D.deleted || []).map(({ id, kind, at }) => ({ id, kind, at })), dismissed: D.dismissed || {}, importedAt: D.importedAt };
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
    KINDS.forEach((k) => D[k].forEach((x) => delete x._dirty)); delete D.settings._dirty; delete D._dismissDirty;
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
    if (srv.importedAt) D.importedAt = srv.importedAt;
    D.firstRun = false;
    return changes;
  },
  async run(interactive) {
    if (!this.enabled() || this.busy) return;
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
        if (changes) { photoCache.clear(); JOBS_CACHE = null; reindex(); renderAll(); }
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
    case 'offline': t = n ? `Offline · ${n} to sync` : 'Offline'; cls = 'off'; break;
    case 'signin': t = n ? `Tap to sync (${n})` : 'Tap to sync'; cls = 'off'; break;
    case 'setup': t = 'Sign in to sync'; cls = 'off'; break;
    case 'error': t = 'Sync error — tap'; cls = 'warn'; break;
    case 'empty': t = 'No contacts yet'; cls = 'off'; break;
    default: t = n ? `${n} to sync` : 'Synced';
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
  <div class="kv" style="margin-top:8px"><div class="k">This device</div><div class="v hint">${h(DEVICE)}</div></div></div>`;
}
function conflictSheet(cf) {
  const cur = (D[cf.kind] || []).find((r) => r.id === cf.id);
  const fields = new Set([...Object.keys(cf.mine), ...Object.keys(cur || {})].filter((k) => !k.startsWith('_') && k !== 'flags'));
  const show = (v) => (v == null ? '—' : typeof v === 'object' ? (Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? x.value || x.name || x.bid && (IDX.biz.get(x.bid)?.name) || JSON.stringify(x) : tagName(x))).join(', ') : JSON.stringify(v)) : String(v));
  const showFarms = (fs) => (fs || []).map((f) => `${f.name || 'Farm'}: ${f.address || ''} ${f.lat != null ? `(${f.lat}, ${f.lng})` : ''} ${f.kmReturn ?? ''}km ${f.seeWarning ? '⚠' : ''} ${f.info || ''}`).join('\n');
  let rows = '';
  fields.forEach((k) => {
    const a = k === 'farms' ? showFarms(cf.mine[k]) : show(cf.mine[k]), b = cur ? (k === 'farms' ? showFarms(cur[k]) : show(cur[k])) : '(deleted)';
    if (a !== b) rows += `<div class="kv" style="display:block"><div class="k" style="width:auto;font-weight:700">${h(k)}</div><div class="grid2"><div class="body" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:6px">${h(a)}</div><div class="body" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:6px">${h(b)}</div></div></div>`;
  });
  openSheet('Sync conflict — ' + cf.who, `<p>This was changed on two devices before they synced. Choose which version to keep. Differences only:</p>
  <div class="grid2" style="font-weight:700"><div>This device ${cf.mineAt ? '(' + new Date(cf.mineAt).toLocaleString('en-AU') + ')' : ''}</div><div>${cf.deletedElsewhere ? 'Other device deleted it' : 'Other device ' + (cf.theirsAt ? '(' + new Date(cf.theirsAt).toLocaleString('en-AU') + ')' : '')}</div></div>
  ${rows || '<div class="hint">No visible differences.</div>'}
  <div class="actions" style="margin-top:12px"><button class="btn primary" data-act="conflict-keep" data-key="${h(cf.key)}" data-v="mine">Keep this device's version</button><button class="btn" data-act="conflict-keep" data-key="${h(cf.key)}" data-v="theirs">${cf.deletedElsewhere ? 'Keep it deleted' : "Keep the other version"}</button></div>`, () => true);
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
  } else if (a === 'g-signout') { if (confirm('Sign out of Google on this device? Contacts stay on the device.')) { GAuth.signOut(); D.sync.email = null; Sync.set('setup'); save(); renderAll(); } }
  else if (a === 'gpush-toggle') { GContacts.st.on = el.checked; GContacts.persist(); renderAll(); if (el.checked) { await Sync.run(true); GContacts.maybeRun(); } }
  else if (a === 'gpush-now') { try { await GAuth.get(true); GContacts.run(); toast('Updating Google Contacts in the background'); } catch (err) { toast(err.message); } }
  else if (a === 'conflict-open') { const cf = D.conflicts.find((x) => x.key === d.key); if (cf) conflictSheet(cf); }
  else if (a === 'conflict-keep') {
    const i = D.conflicts.findIndex((x) => x.key === d.key); if (i < 0) return; const cf = D.conflicts[i];
    if (d.v === 'mine') {
      const arr = D[cf.kind]; const j = arr.findIndex((r) => r.id === cf.id); const cur = j >= 0 ? arr[j] : null;
      const rec = { ...cf.mine, _rev: cur ? cur._rev : cf.mine._rev }; touch(rec);
      if (j >= 0) arr[j] = rec; else { arr.push(rec); D.deleted = D.deleted.filter((x) => x.id !== cf.id); }
    }
    D.conflicts.splice(i, 1); closeSheet(); changed(); toast('Conflict resolved'); Sync.soon();
  }
});

/* ---------------- events ---------------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, d = el.dataset;
  if (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'checkbox')) return;
  if (el.tagName === 'A' && a !== 'clear') return;
  switch (a) {
    case 'tab': S.tab = d.v; if (d.v === 'contacts' && S.sel?.kind !== 'contact') S.sel = null; if (d.v === 'biz' && S.sel?.kind !== 'business') S.sel = null; document.body.classList.remove('show-detail'); renderAll(); $('#list').scrollTop = 0; break;
    case 'open': {
      if (d.kind === 'business' && S.tab === 'contacts') S.tab = 'biz';
      if (d.kind === 'contact' && S.tab === 'biz') S.tab = 'contacts';
      S.sel = { kind: d.kind, id: d.id }; renderAll(); $('#detail').scrollTop = 0; break;
    }
    case 'back': S.sel = null; document.body.classList.remove('show-detail'); renderAll(); break;
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
    case 'sheet-save': { if (!SHEET) break; const ok = await SHEET.onSave(); if (ok !== false) { closeSheet(); changed(); toast('Saved'); } break; }
    case 'rep-add': { const tpl = document.querySelector(`#sheet template[data-reptpl="${d.rep}"]`); document.querySelector(`#sheet [data-repwrap="${d.rep}"]`).insertAdjacentHTML('beforeend', tpl.innerHTML); break; }
    case 'rep-del': el.closest('.rep').remove(); break;
    case 'link-biz': $('#e-links').insertAdjacentHTML('beforeend', linkRow(d.bid)); $('#e-bizsearch').value = ''; $('#e-bizres').innerHTML = ''; break;
    case 'link-newbiz': $('#e-links').insertAdjacentHTML('beforeend', linkRow(null, d.name)); $('#e-bizsearch').value = ''; $('#e-bizres').innerHTML = ''; break;
    case 'del-contact': if (confirm('Delete this contact?')) { D.contacts = D.contacts.filter((c) => c.id !== d.id); (D.deleted = D.deleted || []).push({ id: d.id, kind: 'contacts', at: Date.now() }); Sync.soon(); S.sel = null; closeSheet(); changed(); } break;
    case 'del-biz': if (confirm('Delete this business and its farms? Contacts stay.')) { D.businesses = D.businesses.filter((b) => b.id !== d.id); D.contacts.forEach((c) => { if (c.links.some((l) => l.bid === d.id)) { c.links = c.links.filter((l) => l.bid !== d.id); touch(c); } }); (D.deleted = D.deleted || []).push({ id: d.id, kind: 'businesses', at: Date.now() }); Sync.soon(); S.sel = null; closeSheet(); changed(); } break;
    case 'del-farm': if (confirm('Delete this farm?')) { const b = IDX.biz.get(d.bid); b.farms = b.farms.filter((f) => f.id !== d.fid); touch(b); closeSheet(); changed(); } break;
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
    case 'accept-google': { const f = IDX.farms.get(d.fid); const fl = f.flags.find((x) => x.type === 'kmcheck'); f.kmReturn = fl.google; f.kmStatus = 'verified'; f.flags = f.flags.filter((x) => x.type !== 'kmcheck'); touch(IDX.farmBiz.get(f.id)); changed(); break; }
    case 'check-dist': checkAllDistances(); break;
    case 'new-tag': editTag(null); break;
    case 'edit-tag': editTag(IDX.tags.get(d.id)); break;
    case 'del-tag': if (confirm('Delete this tag? It will be removed from all contacts.')) { D.tags = D.tags.filter((t) => t.id !== d.id); (D.deleted = D.deleted || []).push({ id: d.id, kind: 'tags', at: Date.now() }); D.contacts.forEach((c) => { if (c.tags.includes(d.id)) { c.tags = c.tags.filter((t) => t !== d.id); touch(c); } }); closeSheet(); changed(); } break;
    case 'save-home': { const g = parseGps(val('s-homegps')); if (!g) { toast('GPS not recognised'); break; } Object.assign(D.settings.home, { address: val('s-homeaddr'), lat: g.lat, lng: g.lng }); touch(D.settings); save(); toast('Homebase saved'); break; }
    case 'save-key': D.settings.mapsKey = val('s-mapskey'); touch(D.settings); save(); toast('Key saved'); renderAll(); break;
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
    try { const js = JSON.parse(await t.files[0].text()); if (!js.contacts || !js.businesses) throw new Error('Not a backup file'); if (!confirm('Replace all data on this device with this file?')) return;
      const keepSync = D.sync; D = js; D.sync = keepSync || {}; D.deleted = D.deleted || []; D.conflicts = []; D.dismissed = D.dismissed || {}; D.firstRun = false; D.importedAt = D.importedAt || new Date().toLocaleDateString('en-AU');
      [...D.contacts, ...D.businesses, ...D.tags, D.settings].forEach((r) => (r._dirty = true));
      changed(); toast('Data loaded'); Sync.soon(); } catch (err) { toast('Could not restore: ' + err.message); }
  }
});
function net() { const n = $('#net'); n.textContent = navigator.onLine ? 'Online' : 'Offline'; n.className = 'pill' + (navigator.onLine ? '' : ' off'); }
window.addEventListener('online', net); window.addEventListener('offline', net);
window.addEventListener('popstate', () => { if (document.body.classList.contains('show-detail')) { S.sel = null; renderAll(); } });

/* ---------------- start ---------------- */
(async function init() {
  D = await Store.get('data');
  if (!D) { D = await loadSeed(); D.dismissed = D.dismissed || {}; await Store.set('data', D); }
  D.sync = D.sync || {}; D.deleted = D.deleted || []; D.conflicts = D.conflicts || [];
  reindex(); net(); renderAll();
  Sync.start();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.SEED) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
    let reloaded = false; // a new version took over: reload once so it is used straight away
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded && !SHEET) { reloaded = true; location.reload(); } });
  }
})();
