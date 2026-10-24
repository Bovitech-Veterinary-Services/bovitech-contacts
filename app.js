/* Bovitech Contacts — offline-first contacts app
   Data lives on the device (IndexedDB). OneDrive sync + Google Contacts push plug in via Sync/GContacts modules (to be connected). */
'use strict';

/* ---------------- constants ---------------- */
const RATINGS = ['aplus', 'a', 'b', 'c'];
const RATING_SET = new Set(RATINGS);
const RATING_SHORT = { aplus: 'A+', a: 'A', b: 'B', c: 'C' };
// which photo wins when we must pick one automatically (user is still asked via the job list)
const PHOTO_PRIORITY = ['dna', 'blockedc', 'blockedn', 'payup', 'newfac', 'newassess', 'newmaybe', 'aplus', 'a', 'b', 'c', 'bvs', 'bfriends', 'sheepreg', 'sheepocc', 'occ', 'industry', 'prac', 'phone', 'family', 'inactive']; // default order; Inactive is overridden by every other tag
const APP_VERSION = '17.18 (24 Oct 2026)';
// current photo priority: the order saved in Settings (synced), then any photo tags not yet placed
function photoOrder() {
  const withPhoto = D.tags.filter((t) => tagPhotoSrc(t.id)).map((t) => t.id);
  const saved = (D.settings.photoPriority || PHOTO_PRIORITY).filter((id) => withPhoto.includes(id));
  return [...saved, ...withPhoto.filter((id) => !saved.includes(id))];
}
function splitOrder() { /* Settings → Split photos: tags higher on this list go on the LEFT of a split photo (sheep first by default) */ const withPhoto = D.tags.filter((t) => tagPhotoSrc(t.id)).map((t) => t.id); const sheep = withPhoto.filter((id) => /sheep/i.test(id + ' ' + tagName(id)));
  const def = [...sheep, ...photoOrder().filter((id) => !sheep.includes(id))]; const saved = (D.settings.splitOrder || def).filter((id) => withPhoto.includes(id)); return [...saved, ...def.filter((id) => !saved.includes(id))]; }
const splitIdx = (id) => { const o = splitOrder(); const i = o.indexOf(id); return i < 0 ? 999 : i; };
const splitLook = () => ({ labels: true, line: true, pos: 'top', ...(D.settings.splitLook || {}) });
const prioIdx = (id) => { const o = photoOrder(); const i = o.indexOf(id); return i < 0 ? 999 : i; };
const MAX_STOPS = 9;
const ICONS = {
  contacts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><path d="M17 4a4 4 0 0 1 0 8M22 21c0-3-1.5-5.5-4-6.5"/></svg>',
  biz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-7h6v7"/></svg>',
  route: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/></svg>',
  loc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>',
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
function pendingCount() { if (!D) return 0; return [...D.contacts, ...D.businesses, ...D.tags, ...(D.farms || []), ...(D.routes || []), D.settings].filter((r) => r && r._dirty).length + (D.deleted || []).filter((x) => !x.synced).length + (D._dismissDirty ? 1 : 0) + (D._trashDirty ? 1 : 0) + (D._logDirty ? 1 : 0); }

async function loadSeed() {
  if (window.SEED) { const d = JSON.parse(JSON.stringify(window.SEED)); d.importedAt = '14 Oct 2026'; return d; }
  // hosted app: no client data ships with the app — start empty, then sign in (Google Drive) or import the initial data file
  const r = await fetch('defaults.json'); const d = await r.json(); return { ...d, contacts: [], businesses: [], dismissed: {}, firstRun: true };
}

/* ---------------- farms are shared records (D.farms); a business links to them as current or past ---------------- */
function farmProps(b, farms) {
  /* older data (or an older app version) kept farms inside the business: move them into the shared list */
  const own = Object.getOwnPropertyDescriptor(b, 'farms');
  if (own && 'value' in own) { const arr = Array.isArray(own.value) ? own.value : []; delete b.farms; b.farmLinks = Array.isArray(b.farmLinks) ? b.farmLinks : [];
    arr.forEach((f) => { if (!f || !f.id) return; if (!farms.has(f.id)) { if (!f.owner) f.owner = { bid: b.id }; if (!f.pinType) f.pinType = guessPinType(f.name); D.farms.push(f); farms.set(f.id, f); touch(f); } if (!b.farmLinks.some((l) => l.fid === f.id)) b.farmLinks.push({ fid: f.id }); });
    if (arr.length) touch(b); }
  if (!Array.isArray(b.farmLinks)) b.farmLinks = [];
  if (!own || 'value' in own) Object.defineProperty(b, 'farms', { configurable: true, enumerable: false, get() { return this.farmLinks.filter((l) => !l.past).map((l) => IDX.farms.get(l.fid)).filter(Boolean); }, set(v) { Object.defineProperty(this, 'farms', { value: v, writable: true, enumerable: true, configurable: true }); } });
  if (!Object.getOwnPropertyDescriptor(b, 'pastFarms')) Object.defineProperty(b, 'pastFarms', { configurable: true, enumerable: false, get() { return this.farmLinks.filter((l) => l.past).map((l) => IDX.farms.get(l.fid)).filter(Boolean); } });
}
const farmUsersOf = (fid) => (IDX.farmUsers && IDX.farmUsers.get(fid)) || [];
function guessPinType(name) { const n = (name || '').toLowerCase(); return /feedlot/.test(n) ? 'feedlot' : /depot/.test(n) ? 'depot' : /office|house|homestead/.test(n) && !/yard/.test(n) ? 'office' : /shear/.test(n) ? 'shed' : /sheep/.test(n) && !/cattle/.test(n) ? 'sheep' : 'cattle'; }
function newFarm(over) { return { id: uid('f'), name: '', address: '', lat: null, lng: null, kmReturn: null, driveMin: null, kmStatus: 'missing', info: '', seeWarning: false, flags: [], pinType: 'cattle', extra: [], photos: [], createdAt: Date.now(), ...(over || {}) }; }
function linkFarm(b, f, past) { const l = b.farmLinks.find((x) => x.fid === f.id); if (l) { if (past) l.past = true; else delete l.past; } else b.farmLinks.push(past ? { fid: f.id, past: true } : { fid: f.id }); touch(b); }
function unlinkFarm(b, fid) { b.farmLinks = b.farmLinks.filter((l) => l.fid !== fid); touch(b); }
function remapFarmId(from, to) { S.route.stops.forEach((st) => { if (st.fid === from) st.fid = to; }); (D.routes || []).forEach((r) => { let ch = false; (r.stops || []).forEach((st) => { if (st.fid === from) { st.fid = to; ch = true; } }); if (ch) touch(r); }); }
function dropFarmRecord(f) { D.farms = D.farms.filter((x) => x !== f); D.deleted.push({ id: f.id, kind: 'farms', at: Date.now() }); }
function farmMergeSheet(a, o, onDone) { /* compare two farms side by side, choose what to keep, then combine into one shared farm */
  const pinS = (p) => (p && p.lat != null ? `${(+p.lat).toFixed(5)}, ${(+p.lng).toFixed(5)}` : ''); const accS = (x) => (x ? [x.notes, x.gate ? 'Gate PIN ' + x.gate : '', x.key ? 'Key: ' + x.key : ''].filter(Boolean).join(' · ') : '');
  const ownS = (f) => { const fo = farmOwner(f); return fo.name || ''; }; const kmS = (f) => (f.kmReturn != null ? `${f.kmReturn} km return${f.driveMin != null ? ' · ' + Math.round(f.driveMin) + ' min' : ''}` : '');
  const F = [['name', 'Farm name', (f) => f.name], ['address', 'Physical address', (f) => f.address], ['info', 'General farm info', (f) => f.info, 'text'], ['yards', 'Main yards pin', (f) => (f.lat != null ? pinT(f.pinType).emoji + ' ' + (f.yLabel ? f.yLabel + ' · ' : '') + pinS(f) : ''), 'pin'], ['turn', turnName() + ' pin', (f) => (f.turn && f.turn.lat != null ? turnPin().emoji + ' ' + (f.turnLabel ? f.turnLabel + ' · ' : '') + pinS(f.turn) : ''), 'pin'], ['km', 'Distance', kmS], ['access', 'Access', (f) => accS(f.access)], ['owner', 'Owner', ownS]];
  const diff = F.filter(([k, l, g]) => { const x = (g(a) || '').toString().trim(), y = (g(o) || '').toString().trim(); return x && y && x !== y; });
  const same = F.filter(([k, l, g]) => { const x = (g(a) || '').toString().trim(), y = (g(o) || '').toString().trim(); return (x || y) && !(x && y && x !== y); });
  const opt = (k, v, label, on) => `<label style="display:flex;gap:6px;align-items:flex-start;margin:3px 0"><input type="radio" name="fmg-${k}" value="${v}" ${on ? 'checked' : ''}><span style="white-space:pre-wrap">${label}</span></label>`;
  const short = (t) => h(String(t).length > 300 ? String(t).slice(0, 300) + '…' : String(t));
  const body = `<p>Merging <b>2. ${farmLabelLnk(o)}</b> into <b>1. ${farmLabelLnk(a)}</b>. They become one shared farm used by ${usersLnk([...farmUsersOf(a.id), ...farmUsersOf(o.id)].filter((u, i, arr) => arr.findIndex((y) => y.b === u.b) === i))}.</p>
    ${diff.length ? `<div class="actions" style="margin:8px 0"><button type="button" class="btn small" data-act="mg-all" data-v="a">Keep everything from 1</button><button type="button" class="btn small" data-act="mg-all" data-v="b">Keep everything from 2</button><button type="button" class="btn small" data-act="mg-all" data-v="both">Keep both where possible</button></div>
    <div class="lbl" style="font-size:15px;margin-top:8px">Where they're different — choose what to keep:</div>${diff.map(([k, l, g, t]) => `<div class="card" style="padding:10px;margin:6px 0"><div style="font-weight:700;margin-bottom:4px">${h(l)}</div>${opt(k, 'a', `<b>1:</b> ${short(g(a))}`, t !== 'text' && t !== 'pin')}${opt(k, 'b', `<b>2:</b> ${short(g(o))}`, false)}${t === 'text' ? opt(k, 'both', 'Keep both (one after the other)', true) : t === 'pin' ? opt(k, 'both', `Keep both — 1 as the main pin, 2 as an extra pin`, true) : ''}</div>`).join('')}` : '<div class="hint">No clashes — everything can be combined.</div>'}
    ${same.length ? `<details class="fsec"><summary>The same, or only on one (${same.length})</summary>${same.map(([k, l, g]) => `<div class="kv"><div class="k">${h(l)}</div><div class="v">${short(g(a) || g(o))}</div></div>`).join('')}</details>` : ''}
    <div class="hint" style="margin-top:8px">Warnings, notes, photos and extra pins from both are always kept.</div>`;
  openSheet('Merge farms', body, () => {
    const pick = {}; diff.forEach(([k]) => { pick[k] = (document.querySelector(`#sheet input[name="fmg-${k}"]:checked`) || {}).value || 'a'; });
    const O = JSON.parse(JSON.stringify(o)), A0 = JSON.parse(JSON.stringify(a));
    combineFarms(a, o);
    if (pick.name === 'b') { a.name = O.name; } if (pick.address === 'b') a.address = O.address; if (pick.info === 'a') a.info = A0.info; else if (pick.info === 'b') a.info = O.info;
    if (pick.km === 'b') { a.kmReturn = O.kmReturn; a.driveMin = O.driveMin; a.kmStatus = O.kmStatus; } if (pick.access === 'b') a.access = O.access; if (pick.owner === 'b') a.owner = O.owner;
    const sameP = (x, y) => x && y && Math.abs(x.lat - y.lat) < 1e-7 && Math.abs(x.lng - y.lng) < 1e-7;
    if (pick.yards) { const ox = (a.extra || []).findIndex((x) => x.type !== 'turn' && sameP(x, O)); if (pick.yards === 'b') { a.lat = O.lat; a.lng = O.lng; a.pinType = O.pinType; if (O.yLabel) a.yLabel = O.yLabel; else delete a.yLabel; if (ox >= 0) a.extra.splice(ox, 1); } else if (pick.yards === 'a') { if (ox >= 0) a.extra.splice(ox, 1); } else if (ox < 0) a.extra = [...(a.extra || []), { id: uid('p'), type: O.pinType, name: O.yLabel || O.name || '', lat: O.lat, lng: O.lng, safety: O.safety || {} }]; }
    if (pick.turn) { if (pick.turn === 'b') { a.turn = O.turn; if (O.turnLabel) a.turnLabel = O.turnLabel; else delete a.turnLabel; a.access = pick.access === 'a' ? A0.access : O.access; delete a.svOk; } else if (pick.turn === 'both') a.extra = [...(a.extra || []), { id: uid('p'), type: 'turn', name: O.turnLabel || '', lat: O.turn.lat, lng: O.turn.lng, ...(O.access ? { access: O.access } : {}) }]; }
    if (a.extra && !a.extra.length) delete a.extra; touch(a); reindex(); NEXT_LOG_LABEL = `Merged farms: ${farmLabel(O)} into ${farmLabel(a)}`; S.skipConfirm = true; if (onDone) setTimeout(onDone, 0); return true; }, '');
  $('#sheet-save').textContent = 'Merge'; }
function combineFarms(keep, other) { /* one shared farm: every business using either now uses keep */
  const join = (a, b) => [...new Set([a, b].map((x) => (x || '').trim()).filter(Boolean))].join('\n');
  keep.info = join(keep.info, other.info); mergeNotes(keep, other, 'farm');
  ['address', 'name', 'turn', 'access', 'biosec', 'reception', 'fac', 'safety', 'owner'].forEach((k) => { if ((keep[k] == null || keep[k] === '') && other[k] != null && other[k] !== '') keep[k] = other[k]; });
  if (keep.lat == null && other.lat != null) { keep.lat = other.lat; keep.lng = other.lng; }
  if (keep.kmReturn == null) { keep.kmReturn = other.kmReturn; keep.kmStatus = other.kmStatus; } if (keep.driveMin == null) keep.driveMin = other.driveMin;
  const oy = other.lat != null && keep.lat != null && hav({ lat: keep.lat, lng: keep.lng }, { lat: other.lat, lng: other.lng }) > 0.05 ? [{ id: uid('p'), type: other.pinType, name: other.yLabel || other.name || '', lat: other.lat, lng: other.lng, safety: other.safety || {} }] : []; // the other farm's yards are kept as another set of yards
  keep.extra = [...(keep.extra || []), ...oy, ...(other.extra || [])]; keep.photos = [...(keep.photos || []), ...(other.photos || [])];
  if (other.name && keep.name && other.name !== keep.name) keep.aka = join(keep.aka, other.name);
  delete keep.sharedWith; touch(keep);
  D.businesses.forEach((b) => { const l = b.farmLinks.find((x) => x.fid === other.id); if (!l) return; const k = b.farmLinks.find((x) => x.fid === keep.id); if (k) { if (!l.past) delete k.past; b.farmLinks = b.farmLinks.filter((x) => x !== l); } else l.fid = keep.id; touch(b); });
  remapFarmId(other.id, keep.id); dropFarmRecord(other); reindex();
}
/* ---------------- indexes & helpers ---------------- */
function reindex() {
  D.routes = D.routes || [];
  const biz = new Map(D.businesses.map((b) => [b.id, b]));
  const tags = new Map(D.tags.map((t) => [t.id, t]));
  D.farms = D.farms || [];
  const farms = new Map(D.farms.map((f) => [f.id, f])); const farmBiz = new Map(); const farmUsers = new Map();
  D.businesses.forEach((b) => { farmProps(b, farms); b.farmLinks.forEach((l) => { if (!farms.has(l.fid)) return; if (!farmUsers.has(l.fid)) farmUsers.set(l.fid, []); farmUsers.get(l.fid).push({ b, past: !!l.past }); }); });
  farmUsers.forEach((us, fid) => farmBiz.set(fid, (us.find((u) => !u.past) || us[0]).b));
  const bizContacts = new Map(D.businesses.map((b) => [b.id, []]));
  const bizPast = new Map(D.businesses.map((b) => [b.id, []]));
  D.contacts.forEach((c) => c.links.forEach((l) => { const m = l.past ? bizPast : bizContacts; if (m.has(l.bid)) m.get(l.bid).push(c); }));
  IDX = { biz, tags, farms, farmBiz, farmUsers, bizContacts, bizPast, hay: new Map(), bhay: new Map(), personNames: new Set(D.contacts.map((c) => fullName(c).toLowerCase().trim())) };
}
// alphabetical, but names starting with a letter come before names starting with a number/symbol
const alphaKey = (str) => { const t = (str || '').trim().toLowerCase(); return (/^[a-z]/.test(t) ? '1' : '2') + t; };
const alphaCmp = (a, b) => alphaKey(a).localeCompare(alphaKey(b), 'en', { numeric: true });
const MAIDEN_RX = /\s*\((?:maiden(?:\s+name)?|n[ée]e|born)\s*:?\s*([^)]+)\)|\s+n[ée]e\s+([A-Z][\w'’-]+)/i;
function maidenInName(c) { for (const k of ['last', 'middle', 'first']) { const v = c[k] || ''; const m = v.match(MAIDEN_RX); if (m) return { field: k, maiden: (m[1] || m[2]).trim(), rest: v.replace(m[0], '').replace(/\s{2,}/g, ' ').trim() }; } return null; }
const prefName = (c) => (c.pref || '').trim();
const showName = (c) => (prefName(c) ? `${c.first || ''} “${prefName(c)}” ${c.last || ''}`.replace(/\s+/g, ' ').trim() : fullName(c)); // name as shown on screen
const bizShow = (b) => b.name + (b.abbr ? ' (' + b.abbr + ')' : '');
const ABBR_SKIP = new Set(['of', 'and', 'the', 'for', '&', 'in', 'at', 'on', 'a', 'pty', 'ltd', 'inc', 'limited', 'co']);
const ORG_RX = /^(?!.*\b(customer|office|services?)\b).*\b(department|university|association|society|council|institute|authority|agency|commission|federation|foundation|board|college)\b/i;
function abbrGuess(name) { const w = name.replace(/\(.*?\)/g, ' ').split(/[\s-]+/).filter((x) => /^[A-Za-z]/.test(x) && !ABBR_SKIP.has(x.toLowerCase())); return w.length >= 3 ? w.map((x) => x[0].toUpperCase()).join('') : ''; }
function prefInName(c) { /* "Scrub (Nigel)", "Kevin (Monty)", middle "(Monty)" or quotes → candidates */
  const q = /\s*[("“'‘]([^)"”'’]{2,20})[)"”'’]\s*/; const mF = (c.first || '').match(q), mM = (c.middle || '').match(q);
  if (mM) return { field: 'middle', rest: (c.middle || '').replace(mM[0], ' ').trim(), inner: mM[1].trim(), outer: '' };
  if (mF) { const outer = (c.first || '').replace(mF[0], ' ').trim(); return outer ? { field: 'first', rest: outer, inner: mF[1].trim(), outer } : null; } return null; }
function maidenApply(c) { const mi = maidenInName(c); if (!mi) return false; c[mi.field] = mi.rest; c.maiden = mi.maiden; touch(c); return true; }
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
/* ---------------- warnings, side notes, cautions and repairs: several per record, with initials + date; "issue resolved" hides (never deletes) ----------------
   rec.notes = [{id, k, t, by, at, edAt?, res?: {by, at, why}}]. The old text fields (warnings / sideNotes / farm warning) are kept up to date
   from the notes so search, the CHECK WARNING photo ring and older app versions keep working. */
const NOTE_KINDS = { warn: { l: 'General warnings', one: 'warning', emo: '⚠', cls: 'warn' }, side: { l: 'Side notes', one: 'side note', emo: '📝', cls: 'side' },
  caution: { l: 'Caution', one: 'caution', emo: '⚠️', cls: 'caution' }, repair: { l: 'Major repairs required', one: 'major repair', emo: '🛠🛑✋', cls: 'repair' }, minor: { l: 'Minor repairs required', one: 'minor repair', emo: '🛠', cls: 'minor' } };
const NOTE_KS = { contact: ['warn', 'caution', 'side'], business: ['warn', 'caution', 'side'], farm: ['assess', 'warn', 'caution', 'repair', 'minor'] };
const FARM_KINDS = { // farm wording; "check" = adds CHECK WARNING to the photo of everyone at the businesses using the farm
  warn: { l: 'Major warning (NO SERVICE until resolved)', short: 'Major warning', one: 'major warning', emo: '⚠️🛑✋', check: true, edit: 'Major farm warnings (adds CHECK WARNING to the contact\'s photo)' },
  assess: { l: 'New — need to assess', short: 'New, need to assess', one: '"new, need to assess" note', emo: '🆕🔍', edit: 'New, need to assess (red — doesn\'t add CHECK WARNING to the contact\'s photo)' },
  caution: { l: 'Minor warning (can still service)', short: 'Minor warning', one: 'minor warning', emo: '⚠️', edit: 'Minor warning (doesn\'t add CHECK WARNING to the contact\'s photo)' },
  repair: { l: 'Major repairs required (NO SERVICE until resolved)', short: 'Major repairs required', one: 'major repair', emo: '🛠🛑✋', check: true, edit: 'Major repairs required (adds CHECK WARNING to the contact\'s photo)' },
  minor: { l: 'Minor repairs required (can still service)', short: 'Minor repairs required', one: 'minor repair', emo: '🛠', edit: 'Minor repairs required (doesn\'t add CHECK WARNING to the contact\'s photo)' } };
const ONLY_GENERAL = (what) => `For general warnings about ${what} only — if the warning is about a farm or yards, add it to that farm instead.`;
const PERSON_KINDS = { // contact and business wording
  business: { warn: { l: 'Major business warning', short: 'Major business warning', one: 'major business warning', emo: '⚠', check: true, edit: 'Major business warning (red — adds CHECK WARNING to the client\'s photo). ' + ONLY_GENERAL('the business'), ph: '' },
    caution: { l: 'Minor warning', short: 'Minor warning', one: 'minor warning', emo: '⚠️', edit: 'Minor warning (yellow — doesn\'t add CHECK WARNING to the client\'s photo). ' + ONLY_GENERAL('the business'), ph: '' } },
  contact: { warn: { l: 'Major warning', short: 'Major warning', one: 'major warning', emo: '⚠', check: true, edit: 'Major warning (red — adds CHECK WARNING to the client\'s photo). ' + ONLY_GENERAL('this person'), ph: '' },
    caution: { l: 'Minor warning', short: 'Minor warning', one: 'minor warning', emo: '⚠️', edit: 'Minor warning (yellow — doesn\'t add CHECK WARNING to the client\'s photo). ' + ONLY_GENERAL('this person'), ph: '' } } };
const BOXKEY = { contact: { warn: 'warn', caution: 'caution', side: 'side' }, business: { warn: 'warn', caution: 'caution', side: 'side' }, farm: { warn: 'farmwarn', assess: 'fassess', caution: 'fcaution', repair: 'repair', minor: 'minor' } };
const bt = (k, d) => (((typeof D !== 'undefined' && D && D.settings && D.settings.boxTitles) || {})[k] || '').trim() || d; // box titles changed in Settings → Box colours and text
const SYM = (k, d) => (((typeof D !== 'undefined' && D && D.settings && D.settings.icons) || {})[k] || '').trim() || d; // symbols changed in Settings → Symbols
function kInfo(type, k) { const base = type === 'farm' ? { ...NOTE_KINDS[k], ...FARM_KINDS[k] } : { ...NOTE_KINDS[k], ...((PERSON_KINDS[type] || {})[k] || {}) }; const bk = (BOXKEY[type] || {})[k];
  if (bk) { const t = bt(bk, ''); if (t) { base.l = t; base.short = t; } base.emo = SYM('n_' + bk, base.emo); } return base; }
const farmChecks = (f) => notesOf(f, 'farm', 'warn').length + notesOf(f, 'farm', 'repair').length > 0; // major farm warning / major repair → CHECK WARNING
function recOf(type, id) { return type === 'contact' ? D.contacts.find((x) => x.id === id) : type === 'business' ? IDX.biz.get(id) : IDX.farms.get(id); }
function legacyText(rec, type, k) { if (type === 'farm') return k === 'warn' && rec.seeWarning ? ((rec.warning || '').trim() || 'Check farm info') : ''; const f = { warn: 'warnings', side: 'sideNotes' }[k]; return f ? (rec[f] || '').trim() : ''; }
function notesOf(rec, type, k, resolved = false) { if (!rec) return []; const list = (rec.notes || []).filter((n) => n.k === k && !!n.res === resolved);
  if (!rec.notesMig && !resolved) { const t = legacyText(rec, type, k); if (t) list.unshift({ id: 'legacy', k, t, by: '', at: null }); } return list; }
function notesMaterialize(rec, type) { if (rec.notesMig) return; const n = [...(rec.notes || [])]; NOTE_KS[type].slice().reverse().forEach((k) => { const t = legacyText(rec, type, k); if (t) n.unshift({ id: uid('n'), k, t, by: '', at: null, log: [{ a: 'Was already there before warnings were tracked' }] }); }); rec.notes = n; rec.notesMig = 1; }
function notesSync(rec, type) { const act = (k) => (rec.notes || []).filter((n) => n.k === k && !n.res).map((n) => n.t);
  if (type === 'farm') { const w = act('warn'); rec.seeWarning = w.length > 0; rec.warning = w.join('\n\n'); } else { rec.warnings = act('warn').join('\n\n'); rec.sideNotes = act('side').join('\n\n'); } }
function myInitials() { const v = (LSget('bvt-initials') || '').trim(); if (v) return v.toUpperCase(); const n = (devInfo().nick || '').trim(); return n ? n.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 3) : '?'; }
const noteLog = (n, a, extra = {}) => { n.log = [...(n.log || []), { a, by: myInitials(), at: Date.now(), ...extra }]; };
function addNote(rec, type, k, t, by) { notesMaterialize(rec, type); const n = { id: uid('n'), k, t, by: by == null ? myInitials() : by, at: Date.now() }; noteLog(n, 'Added'); rec.notes.push(n); notesSync(rec, type); touch(rec); }
function mergeNotes(keep, other, tk, to = tk) { notesMaterialize(keep, tk); notesMaterialize(other, to); const ok = new Set(NOTE_KS[tk]);
  (other.notes || []).forEach((n) => { if (ok.has(n.k) && !keep.notes.some((x) => x.t === n.t && x.k === n.k)) keep.notes.push({ ...n, id: uid('n') }); }); notesSync(keep, tk); }
const noteDate = (t) => (t ? new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
function noteMeta(n) { const d = noteDate(n.at); const lg = n.log || [];
  return (n.by || d ? ` <span class="notemeta">${h(n.by || '')}${n.by && d ? ' · ' : ''}${d}${n.edAt ? ' · edited ' + noteDate(n.edAt) : ''}</span>` : '') +
    (lg.length ? `<details class="notelog"><summary>🕘 History (${lg.length})</summary>${lg.map((x) => `<div><b>${h(x.a)}</b>${x.by ? ' · ' + h(x.by) : ''}${x.at ? ' · ' + noteDate(x.at) + ' ' + new Date(x.at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) : ''}${x.old ? `<div class="hint">Was: “${h(x.old)}”</div>` : ''}${x.why ? `<div class="hint">Reason: ${h(x.why)}</div>` : ''}</div>`).join('')}</details>` : ''); }
function photoStrip(type, id, nid, photos) { /* attached photos: folded, with a clear "📷 N photos" button; each can be viewed full size or deleted */ if (!photos || !photos.length) return '';
  return `<details class="nphotos"><summary>📷 ${photos.length} photo${photos.length === 1 ? '' : 's'} attached — tap to view</summary><div class="nphotogrid">${photos.map((p) => `<div class="nphoto"><img src="${p.data}" data-act="photo-view" data-type="${type}" data-id="${id}" data-nid="${h(nid)}" data-pid="${p.id}" alt="Attached photo"><button type="button" class="btn small" data-act="photo-del" data-type="${type}" data-id="${id}" data-nid="${h(nid)}" data-pid="${p.id}" title="Delete this photo">🗑</button><div class="notemeta">${h(p.by || '')}${p.at ? ' · ' + noteDate(p.at) : ''}</div></div>`).join('')}</div></details>`; }
const photoAddBtn = (type, id, nid) => `<label class="btn small" title="Attach a photo — choose from files, or drag and drop onto the note" style="cursor:pointer">📷<input type="file" accept="image/*" multiple data-photoadd="1" data-type="${type}" data-id="${id}" data-nid="${h(nid)}" style="display:none"></label>`;
function photoTarget(type, id, nid, make) { const rec = recOf(type, id); if (!rec) return {}; if (nid === 'info') { if (make && !rec.infoPhotos) rec.infoPhotos = []; return { rec, list: rec.infoPhotos }; }
  notesMaterialize(rec, type); const n = (rec.notes || []).find((x) => x.id === nid) || (nid === 'legacy' ? (rec.notes || []).find((x) => !x.res && x.at == null && !x.by) : null); if (!n) return { rec }; if (make && !n.photos) n.photos = []; return { rec, n, list: n.photos }; }
function photoJpeg(file, max = 1280) { return new Promise((res) => { const r = new FileReader(); r.onload = async () => { const im = await loadImg(r.result); if (!im) return res(r.result); const sc = Math.min(1, max / Math.max(im.width, im.height)); const cv = document.createElement('canvas'); cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', 0.72)); }; r.readAsDataURL(file); }); }
document.addEventListener('change', async (e) => { const t = e.target; if (!t.dataset || !t.dataset.photoadd) return; const files = [...(t.files || [])]; if (!files.length) return; const { rec, list } = photoTarget(t.dataset.type, t.dataset.id, t.dataset.nid, true); if (!rec || !list) { toast('Could not attach — try again'); return; }
  for (const f of files) list.push({ id: uid('ph'), data: await photoJpeg(f), at: Date.now(), by: myInitials() }); t.value = ''; touch(rec); NEXT_LOG_LABEL = `Photo attached (${t.dataset.nid === 'info' ? 'general info' : 'note'}): ${t.dataset.type === 'farm' ? farmLabel(rec) : rec.name || fullName(rec)}`; S.skipConfirm = true; if (await changed()) { refreshNoteBlocks(); toast('📷 Photo attached'); } });
const CRUSH = { need: 'Need to request photos of crush set up', req: 'Photos of crush set up requested — awaiting response' };
function assessLine(n) { if (!n || n.k !== 'assess') return ''; const c = n.crush; return c === 'need' ? `<div class="crushst">☐ ${h(CRUSH.need)}</div>` : c === 'req' ? `<div class="crushst">☑ ${h(CRUSH.req)}${n.reqAt ? ` <span class="notemeta">requested ${h(noteDate(n.reqAt))}</span>` : ''}</div>` : ''; }
function assessFields(n, show) { const c = n ? n.crush || '' : 'need'; const d = n && n.reqAt ? new Date(n.reqAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10); const rad = 'style="display:flex;gap:8px;align-items:center;margin:5px 0;font-size:15px"';
  return `<div id="na-assess" ${show ? '' : 'hidden'} style="margin-bottom:8px"><div class="lbl">Crush set up photos</div><label ${rad}><input type="radio" name="na-cr" data-ask="crush" value="need" ${c === 'need' ? 'checked' : ''} onchange="document.getElementById('na-reqd').hidden=true"> ${h(CRUSH.need)}</label><label ${rad}><input type="radio" name="na-cr" data-ask="crush" value="req" ${c === 'req' ? 'checked' : ''} onchange="document.getElementById('na-reqd').hidden=false"> ${h(CRUSH.req)}</label><div id="na-reqd" ${c === 'req' ? '' : 'hidden'} style="margin:2px 0 6px 28px"><span class="hint">Date requested </span><input type="date" data-ask="reqAt" value="${d}" style="padding:6px;border:1px solid var(--line);border-radius:8px"></div><label ${rad}><input type="radio" name="na-cr" data-ask="crush" value="" ${c === '' ? 'checked' : ''} onchange="document.getElementById('na-reqd').hidden=true"> Not needed</label><div class="lbl" style="margin-top:6px">General comment <span class="hint">(optional)</span></div></div>`; }
function readAssess(n) { n.crush = ASK_FORM.crush || ''; if (!n.crush) delete n.crush; if (n.crush === 'req' && ASK_FORM.reqAt) n.reqAt = new Date(ASK_FORM.reqAt + 'T12:00:00').getTime(); else delete n.reqAt; }
/* drag and drop: drop files onto any photo button, drop box or note — works like choosing them from files */
const dzInput = (el) => { if (!el || !el.closest) return null; const z = el.closest('.dropzone, label, .noterow, .farmphotosbox, .f'); if (!z) return null; const inp = z.matches('input[type=file]') ? z : z.querySelector('input[type=file]'); return inp && !inp.disabled ? { z, inp } : null; };
document.addEventListener('dragover', (e) => { if (!e.dataTransfer || ![...(e.dataTransfer.types || [])].includes('Files')) return; e.preventDefault(); const t = dzInput(e.target); document.querySelectorAll('.dzover').forEach((x) => { if (!t || x !== t.z) x.classList.remove('dzover'); }); if (t) { t.z.classList.add('dzover'); e.dataTransfer.dropEffect = 'copy'; } else e.dataTransfer.dropEffect = 'none'; });
document.addEventListener('dragleave', (e) => { if (e.target.classList && e.target.classList.contains('dzover') && !e.target.contains(e.relatedTarget)) e.target.classList.remove('dzover'); });
document.addEventListener('drop', (e) => { if (!e.dataTransfer || !(e.dataTransfer.files || []).length) return; e.preventDefault(); document.querySelectorAll('.dzover').forEach((x) => x.classList.remove('dzover')); const t = dzInput(e.target); if (!t) { toast('Drop the file onto a photo button or box'); return; }
  const acc = (t.inp.accept || '').split(',').map((x) => x.trim()).filter(Boolean); let files = [...e.dataTransfer.files].filter((f) => !acc.length || acc.some((a) => (a.endsWith('/*') ? f.type.startsWith(a.slice(0, -1)) : a.startsWith('.') ? f.name.toLowerCase().endsWith(a) : f.type === a))); if (!files.length) { toast("That type of file can't go here"); return; } if (!t.inp.multiple) files = files.slice(0, 1);
  const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f)); t.inp.files = dt.files; t.inp.dispatchEvent(new Event('change', { bubbles: true })); });
const naZone = () => `<div class="dropzone nazone" data-for="na-photo"><label class="btn small dzhint" style="cursor:pointer">📷 Add photos — choose from files<input type="file" accept="image/*" multiple id="na-photo" style="display:none"></label><div id="na-photo-n" class="naprev"></div></div>`;
async function naAttach(n) { if (!n || !(S.naFiles || []).length) { S.naFiles = []; return; } n.photos = n.photos || []; for (const fl of S.naFiles) n.photos.push({ id: uid('ph'), data: await photoJpeg(fl), at: Date.now(), by: myInitials() }); S.naFiles = []; }
function notesInner(type, id, k, opt = {}) { const rec = recOf(type, id); if (!rec) return ''; const act = notesOf(rec, type, k), res = notesOf(rec, type, k, true); const a = `data-type="${type}" data-id="${id}" data-k="${k}"`;
  return `${act.map((n) => `<div class="noterow">${opt.from ? `<div class="notefrom">${h(opt.from)}</div>` : ''}<div class="body">${assessLine(n)}${noteText(type, k, n.t)}${noteMeta(n)}${photoStrip(type, id, n.id, n.photos)}</div><div class="noteacts">${photoAddBtn(type, id, n.id)}<button class="btn small" data-act="note-edit" ${a} data-nid="${n.id}" title="Edit">✏️</button><button class="btn small" data-act="note-resolve" ${a} data-nid="${n.id}">✓ Issue resolved</button></div></div>`).join('')}
    ${res.length && !opt.noRes ? `<details class="resolvednotes"><summary>Resolved — ${h((kInfo(type, k).short || kInfo(type, k).l).toLowerCase())}${opt.from ? ' — ' + h(opt.from) : ''} (${res.length})</summary>${res.map((n) => `<div class="noterow done"><div class="body"><s>${h(n.t)}</s>${noteMeta(n)}${photoStrip(type, id, n.id, n.photos)}<div class="noteres">✓ Resolved: ${h(n.res.why)} <span class="notemeta">${h(n.res.by || '')} · ${noteDate(n.res.at)}</span></div></div><div class="noteacts"><button class="btn small" data-act="note-reopen" ${a} data-nid="${n.id}">Reopen</button></div></div>`).join('')}</details>` : ''}`; }
const noteAddBtn = (type, id, k, label) => `<button class="btn small" data-act="note-add" data-type="${type}" data-id="${id}" data-k="${k}" title="Add a ${kInfo(type, k).one}">${label || '➕'}</button>`;
function noteCount(type, rec, k, resolved) { return notesOf(rec, type, k, resolved).length; }
S.pendNotes = []; /* warnings / notes typed into a brand-new contact, business or farm — added when it's saved */
function pendRows(type, k) { return (S.pendNotes || []).map((n, i) => (n.type === type && n.k === k ? `<div class="noterow"><div class="body">${assessLine(n)}${h(n.t)}${(n.photos || []).length ? ` <span class="hint">📷 ${n.photos.length}</span>` : ''} <span class="notemeta">saved when you tap Save</span></div><div class="noteacts"><button type="button" class="btn small" data-act="pend-edit" data-i="${i}" title="Edit">✏️</button><button type="button" class="btn small" data-act="pend-del" data-i="${i}" title="Remove">✕</button></div></div>` : '')).join(''); }
function pendRefresh() { document.querySelectorAll('.pendnotes').forEach((el) => { el.innerHTML = pendRows(el.dataset.type, el.dataset.k); }); }
async function pendForm(type, k, cur) { const K = kInfo(type, k); const ta = 'style="width:100%;min-height:90px;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"'; S.naFiles = [];
  const r = await askBox((cur ? 'Edit ' : 'Add a ') + K.one, `${type === 'farm' ? assessFields(cur || (k === 'assess' ? { crush: 'need' } : null), k === 'assess') : ''}<textarea data-ask="t" ${ta}>${h(cur ? cur.t : '')}</textarea>${naZone()}`, 'Save', false, 'Cancel');
  const t = (ASK_FORM.t || '').trim(); if (!r || (!t && k !== 'assess')) { S.naFiles = []; return null; } const n = cur || { type, k, photos: [] }; n.t = t; if (k === 'assess') readAssess(n); for (const fl of S.naFiles || []) n.photos.push({ id: uid('ph'), data: await photoJpeg(fl), at: Date.now(), by: myInitials() }); S.naFiles = []; return n; }
function pendApply(rec, type) { (S.pendNotes || []).filter((n) => n.type === type).forEach((n) => { addNote(rec, type, n.k, n.t); const nn = rec.notes[rec.notes.length - 1]; if (n.crush) nn.crush = n.crush; if (n.reqAt) nn.reqAt = n.reqAt; if ((n.photos || []).length) nn.photos = n.photos; }); S.pendNotes = []; }
function noteEditorBlock(type, rec, k, label, isNew) { const K = kInfo(type, k); return `<div class="f"><label style="${k === 'warn' || k === 'repair' || k === 'assess' ? 'color:var(--red-ink)' : k === 'side' || k === 'caution' || k === 'minor' ? 'color:#7a5a00' : ''}">${type === 'farm' ? K.emo + ' ' : ''}${label}</label>${isNew ? `<div class="pendnotes" data-type="${type}" data-k="${k}">${pendRows(type, k)}</div><button type="button" class="btn small" data-act="pend-add" data-type="${type}" data-k="${k}">➕ Add a ${h(K.one)}</button>` : `<div class="notesblock nb-${k}" data-type="${type}" data-id="${rec.id}" data-k="${k}">${notesInner(type, rec.id, k)}</div>${noteAddBtn(type, rec.id, k, '➕ Add a ' + K.one)}`}</div>`; }
function refreshNoteBlocks() { document.querySelectorAll('.notesblock').forEach((el) => { el.innerHTML = notesInner(el.dataset.type, el.dataset.id, el.dataset.k); }); }
async function noteAction(a, d) { const rec = recOf(d.type, d.id); if (!rec) return; const K = kInfo(d.type, d.k || 'warn'); const ta = 'style="width:100%;min-height:90px;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"';
  const name = d.type === 'farm' ? farmLabel(rec) : d.type === 'business' ? rec.name : fullName(rec);
  if (a === 'note-add') { let k = d.k; const pick = !k; S.naFiles = []; const r = await askBox(pick ? 'Add to this farm' : 'Add a ' + K.one, `${pick ? `<div class="f nkpick">${NOTE_KS.farm.map((x, i) => `<label class="nk nk-${x}"><input type="radio" name="nk" data-ask="k" value="${x}" ${x === 'warn' ? 'checked' : ''} onchange="var a=document.getElementById('na-assess');if(a)a.hidden=this.value!=='assess'"><span><b>${kInfo('farm', x).emo} ${h(kInfo('farm', x).l)}</b><span class="hint">${FARM_KINDS[x].check ? 'Adds CHECK WARNING to the contact\'s photo' : 'Doesn\'t add CHECK WARNING to the contact\'s photo'}</span></span></label>`).join('')}</div>` : ''}<div class="hint" style="margin-bottom:6px">${h(name)} — saved with your initials (${h(myInitials())}) and today's date.</div>${d.type === 'farm' ? assessFields(null, k === 'assess') : ''}<textarea data-ask="t" ${ta}></textarea>${naZone()}`, 'Save', false, 'Cancel');
    const t = (ASK_FORM.t || '').trim(); if (pick) k = ASK_FORM.k || 'warn'; if (!r || (!t && k !== 'assess')) return; if (d.type === 'farm' && !(await sharedYardOk(rec))) return;
    addNote(rec, d.type, k, t); const nn = rec.notes[rec.notes.length - 1]; if (k === 'assess' && nn) { readAssess(nn); touch(rec); } await naAttach(nn); NEXT_LOG_LABEL = `${kInfo(d.type, k).short || kInfo(d.type, k).l} added: ${name}`; }
  else { S.naFiles = []; notesMaterialize(rec, d.type); let n = d.nid === 'legacy' ? rec.notes.find((x) => x.k === d.k && !x.res && x.at == null && !x.by) : rec.notes.find((x) => x.id === d.nid); if (!n) return;
    if (a === 'note-edit') { const kinds = NOTE_KS[d.type];
      const r = await askBox('Edit ' + K.one, `<div class="f nkpick">${kinds.map((x) => { const X = kInfo(d.type, x); return `<label class="nk nk-${x}"><input type="radio" name="nk" data-ask="k" value="${x}" ${x === n.k ? 'checked' : ''} onchange="var a=document.getElementById('na-assess');if(a)a.hidden=this.value!=='assess'"><span><b>${X.emo} ${h(X.l)}</b>${X.check != null || d.type === 'farm' || x !== 'side' ? `<span class="hint">${X.check ? 'Adds CHECK WARNING to the contact\'s photo' : 'Doesn\'t add CHECK WARNING to the contact\'s photo'}</span>` : ''}</span></label>`; }).join('')}</div>${d.type === 'farm' ? assessFields(n, n.k === 'assess') : ''}<textarea data-ask="t" ${ta}>${h(n.t)}</textarea>${(n.photos || []).length ? `<div class="hint">📷 ${n.photos.length} photo${n.photos.length === 1 ? '' : 's'} already attached</div>` : ''}${naZone()}<label style="display:flex;gap:8px;align-items:center;margin:10px 0 4px;font-weight:700;font-size:16px"><input type="checkbox" data-askchk="resolve" onchange="document.getElementById('ne-res').hidden=!this.checked"> ✓ Mark as resolved</label><div id="ne-res" hidden><div class="f"><span class="lbl">What was done to resolve it? <span class="hint">(required)</span></span><textarea data-ask="why" ${ta}></textarea></div></div>`, 'Save', false, 'Cancel');
      const t = (ASK_FORM.t || '').trim(), nk = ASK_FORM.k || n.k; if (!r || (!t && nk !== 'assess')) return; const resWhy = ASK_FORM.resolve ? (ASK_FORM.why || '').trim() : ''; if (ASK_FORM.resolve && !resWhy) { toast('Please say what was done to resolve it — nothing was changed'); S.naFiles = []; return; }
      if (resWhy) { n.res = { by: myInitials(), at: Date.now(), why: resWhy }; noteLog(n, 'Resolved', { why: resWhy }); } if (nk === 'assess') { const was = (n.crush || '') + (n.reqAt || ''); readAssess(n); const now = (n.crush || '') + (n.reqAt || ''); if (was !== now) noteLog(n, 'Crush photos: ' + (n.crush === 'req' ? 'requested' : n.crush === 'need' ? 'need to request' : 'not needed')); } else { delete n.crush; delete n.reqAt; } const addPh = (S.naFiles || []).length; if (addPh) { await naAttach(n); noteLog(n, `${addPh} photo${addPh === 1 ? '' : 's'} attached`); } if (t === n.t && nk === n.k && nk !== 'assess') { if (resWhy) { notesSync(rec, d.type); touch(rec); NEXT_LOG_LABEL = `${K.l} resolved (${resWhy}): ${name}`; } else if (addPh) { notesSync(rec, d.type); touch(rec); NEXT_LOG_LABEL = `Photo attached: ${name}`; } else return; }
      if (nk !== n.k) { noteLog(n, 'Changed type', { old: kInfo(d.type, n.k).short || kInfo(d.type, n.k).l, why: 'now ' + (kInfo(d.type, nk).short || kInfo(d.type, nk).l) }); n.k = nk; }
      if (t !== n.t) { noteLog(n, 'Edited', { old: n.t }); n.t = t; } n.edAt = Date.now(); NEXT_LOG_LABEL = `${kInfo(d.type, nk).short || kInfo(d.type, nk).l} edited: ${name}`; }
    if (a === 'note-resolve') { let why = ''; for (;;) { const r = await askBox('Issue resolved?', `<p>“${h(n.t)}”</p><div class="f"><span class="lbl">What was done? <span class="hint">(required)</span></span><textarea data-ask="why" ${ta}></textarea></div><div class="hint">It's hidden from the page but kept under "Resolved" — never deleted.</div>`, '✓ Mark as resolved', false, 'Cancel'); if (!r) return; why = (ASK_FORM.why || '').trim(); if (why) break; toast('Please say how it was resolved'); }
      n.res = { by: myInitials(), at: Date.now(), why }; noteLog(n, 'Resolved', { why }); NEXT_LOG_LABEL = `${K.l} resolved (${why}): ${name}`; }
    if (a === 'note-reopen') { noteLog(n, 'Reopened', { why: n.res && n.res.why ? 'was resolved: ' + n.res.why : '' }); delete n.res; NEXT_LOG_LABEL = `${K.l} reopened: ${name}`; }
    notesSync(rec, d.type); touch(rec); }
  S.skipConfirm = true; if (await changed()) { refreshNoteBlocks(); toast('Saved'); } }
function historyCard(ids) { /* this record's own changes (and its farms'), newest first — folded at the bottom of the page */ const set = new Set(ids); const L = (D.changelog || []).filter((e) => (e.items || []).some((it) => set.has(it.id)));
  if (!L.length) return ''; return `<div class="card histcard"><details><summary><h3 style="display:inline">${h(bt('history', '🕘 Change history'))} (${L.length})</h3></summary><div class="hint" style="margin:4px 0">Changes to this page from the change log. Tap one to see what changed; ↶ Undo is in Settings → Change log.</div>${L.slice(0, 60).map((e) => `<details style="border-top:1px solid var(--line);padding:6px 0"><summary style="cursor:pointer;list-style:none"><div style="font-weight:600;${e.undone ? 'text-decoration:line-through;color:var(--ink3)' : ''}">${h(entrySummary(e))}</div><div class="hint">${new Date(e.at).toLocaleString('en-AU')} · ${h(e.dev || '')}</div></summary><div style="padding:4px 0 0 4px">${renderLogDetails({ ...e, items: e.items.filter((it) => set.has(it.id)) })}</div></details>`).join('')}${L.length > 60 ? `<div class="hint">…and ${L.length - 60} older — see Settings → Change log</div>` : ''}</details></div>`; }
function resolvedCard(type, rec) { /* every resolved warning / note / repair for this page, in one folded section */
  const src = [[type, rec, type === 'contact' ? 'This person' : 'This business']]; const bs = type === 'contact' ? bizOf(rec) : [rec];
  if (type === 'contact') bs.forEach((b) => src.push(['business', b, b.name])); bs.forEach((b) => sortFarms(b, b.farms).forEach((f) => src.push(['farm', f, (bs.length > 1 ? b.name + ' — ' : '') + (f.name || pinT(f.pinType).name)])));
  const rows = []; src.forEach(([t, r, lbl]) => NOTE_KS[t].forEach((k) => notesOf(r, t, k, true).forEach((n) => rows.push({ t, r, lbl, k, n }))));
  if (!rows.length) return ''; rows.sort((a, b) => ((b.n.res || {}).at || 0) - ((a.n.res || {}).at || 0));
  return `<div class="card resolvedsec"><details><summary><h3 style="display:inline">${h(bt('resolved', '✓ Resolved warnings and notes'))} (${rows.length})</h3></summary>${rows.map(({ t, r, lbl, k, n }) => `<div class="noterow done"><div class="notefrom">${h(lbl)} · ${kInfo(t, k).emo} ${h(kInfo(t, k).short || kInfo(t, k).l)}</div><div class="body"><s>${h(n.t)}</s>${noteMeta(n)}${photoStrip(t, r.id, n.id, n.photos)}<div class="noteres">✓ Resolved: ${h(n.res.why)} <span class="notemeta">${h(n.res.by || '')} · ${noteDate(n.res.at)}</span></div></div><div class="noteacts"><button class="btn small" data-act="note-reopen" data-type="${t}" data-id="${r.id}" data-k="${k}" data-nid="${n.id}">Reopen</button></div></div>`).join('')}</details></div>`; }
function noteCard(type, rec, k, inherit = []) { /* the card for a contact's / business's warnings or side notes, plus any from their businesses */
  const K = kInfo(type, k); const own = noteCount(type, rec, k), ownRes = noteCount(type, rec, k, true); const inh = inherit.filter((b) => noteCount('business', b, k) || noteCount('business', b, k, true));
  const act = own + inh.reduce((s, b) => s + noteCount('business', b, k), 0); if (!act) return '';
  return `<div class="card ${K.cls}"><h3><span class="sp">${K.emo} ${K.l}</span>${noteAddBtn(type, rec.id, k)}</h3>${notesInner(type, rec.id, k, { noRes: true })}${inh.filter((b) => noteCount('business', b, k)).map((b) => notesInner('business', b.id, k, { from: b.name, noRes: true })).join('')}</div>`; }
function hasWarning(c) { return !!(c.warnings && c.warnings.trim()) || bizOf(c).some((b) => (b.warnings && b.warnings.trim()) || (b.farms || []).some((f) => farmChecks(f))); }
const tagPhotoSrc = (id) => { const t = IDX.tags.get(id); if (!t) return null; if (t.photoData) return t.photoData; if (!t.photo) return null; return (window.IMG && window.IMG[t.photo]) || 'img/' + t.photo + '.png'; };
function rbadge(r) { return `<span class="rb ${r}">${RATING_SHORT[r]}</span>`; }
const fmtKm = (f) => (f.kmReturn == null ? '—' : `${+f.kmReturn.toFixed(1)} km return`);
const fmtMin = (m) => (m == null ? '' : m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);
// Google Maps driving directions from homebase to a farm (the route the km suggestion is based on)
const gmapsRoute = (f) => `https://www.google.com/maps/dir/?api=1&origin=${D.settings.home.lat},${D.settings.home.lng}&destination=${f.lat},${f.lng}&travelmode=driving`;
const farmRoutePt = (f) => (f.turn && f.turn.lat != null ? { lat: f.turn.lat, lng: f.turn.lng } : { lat: f.lat, lng: f.lng }); /* drive to the turn-off when there is one */
const gmapsNav = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
const gmapsPin = (f) => { const p = f && f.lat != null ? f : (f && f.turn && f.turn.lat != null ? f.turn : f || {}); return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`; };
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
function effChoice(c) { /* a chosen photo only counts while the contact still has that category/tag (e.g. chose "A client", business is now B → back to automatic) */
  const pc = c.photoChoice || 'auto'; if (pc === 'auto' || pc === 'custom') return pc === 'custom' && !c.photoData ? 'auto' : pc;
  const { dr, ptags } = photoCandidates(c); const ok = new Set([...dr, ...ptags, catOf(c), ...bizOf(c).map(bizCat)].filter((t) => t && tagPhotoSrc(t)));
  if (pc.startsWith('split:')) { const t = pc.slice(6).split(','); if (c._biz) return t.length && t.every((x) => tagPhotoSrc(x) && bizSplitCats(c._biz).includes(x)) ? pc : 'auto'; return t.length && t.every((x) => ok.has(x)) ? pc : 'auto'; }
  return ok.has(pc) ? pc : 'auto';
}
function bizSplitCats(b) { /* the categories a business and its current people have — for a split business photo */ return [...new Set([bizCat(b), ...(IDX.bizContacts.get(b.id) || []).map(catOf)].filter((t) => t && tagPhotoSrc(t)))]; }
const chosenPhoto = (x) => { const pc = x.photoChoice || 'auto'; return pc !== 'auto' && pc !== 'custom'; };
const catSig = (c) => [...new Set([catOf(c), ...bizOf(c).map(bizCat)].filter(Boolean))].sort().join(',');
const bizSig = (b) => bizSplitCats(b).slice().sort().join(',');
function photoOpts(cats, cur) { /* choices for a person's / business's photo after its categories changed */ const t = cats.filter((x) => tagPhotoSrc(x)); const o = [['leave', 'Leave as it is'], ['auto', 'Automatic']]; t.forEach((x) => o.push([x, tagName(x) + ' photo'])); for (let i = 0; i < t.length; i++) for (let k = i + 1; k < t.length; k++) o.push(['split:' + t[i] + ',' + t[k], 'Split: ' + tagName(t[i]) + ' + ' + tagName(t[k])]); return o; }
const photoNow = (x) => { const sp = photoSpec(x); return (sp.parts || []).map((p) => tagName(p.tag)).join(' + ') || (sp.custom ? 'own photo' : 'none'); };
function personSplitPairs(c) { /* a person's own category and their businesses' categories — any two can be shown split */ const t = [...new Set([catOf(c), ...bizOf(c).map(bizCat)].filter((x) => x && tagPhotoSrc(x)))]; const out = []; for (let i = 0; i < t.length; i++) for (let k = i + 1; k < t.length; k++) out.push([t[i], t[k]]); return out.slice(0, 3); }
function bizSplitPairs(b) { const t = bizSplitCats(b); const out = []; for (let i = 0; i < t.length; i++) for (let k = i + 1; k < t.length; k++) out.push([t[i], t[k]]); return out.slice(0, 6); }
function keepPhoto(c) { /* "leave as is": lock in the photo shown now so the job stops asking */ const sp = photoSpec(c); const t = (sp.parts || []).map((x) => x.tag); if (!t.length) return false; c.photoChoice = t.length === 1 ? t[0] : 'split:' + t.join(','); touch(c); return true; }
function needsPhotoChoice(c) {
  if (effChoice(c) !== 'auto') return false;
  const { dr, ptags } = photoCandidates(c);
  if (dr.length > 1) return ptags.length > 0;
  return dr.length + ptags.length > 1;
}
function ratingLabel(c, r) { return contactRatings(c).filter((x) => x.rating === r).map((x) => (x.biz ? x.biz.name : RATING_SHORT[r] + ' client')).join(' / '); }
function photoSpec(c) {
  const warn = hasWarning(c);
  const pc = effChoice(c);
  if (pc === 'custom' && c.photoData) return { custom: c.photoData, warn };
  const { dr, ptags } = photoCandidates(c);
  let parts = [];
  if (pc.startsWith('split:')) {
    parts = pc.slice(6).split(',').filter((t) => tagPhotoSrc(t)).slice(0, 2).map((t) => ({ tag: t, label: RATING_SET.has(t) && !c._biz ? ratingLabel(c, t) || tagName(t) : tagName(t) }));
  } else if (pc !== 'auto' && tagPhotoSrc(pc)) {
    parts = [{ tag: pc }];
  } else if (dr.length > 1) {
    parts = dr.slice(0, 2).map((r) => ({ tag: r, label: ratingLabel(c, r) }));
  } else {
    const cands = [...dr, ...ptags].filter((t) => tagPhotoSrc(t));
    cands.sort((a, b) => prioIdx(a) - prioIdx(b));
    if (cands.length) parts = [{ tag: cands[0] }];
  }
  if (parts.length > 1) { parts = parts.slice(0, 2).sort((a, b) => splitIdx(a.tag) - splitIdx(b.tag)); const L = splitLook(); parts = parts.map((x) => ({ ...x, look: L.labels + L.line + L.pos })); }
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
      const L = splitLook(); if (L.line) { ctx.fillStyle = '#fff'; ctx.fillRect(w - 2, 0, 4, S0); }
      // labels: which business each half belongs to
      for (let i = 0; i < 2 && L.labels; i++) {
        const bh = S0 * 0.14, y = L.pos === 'bottom' ? S0 * 0.8 : L.pos === 'middle' ? (S0 - bh) / 2 : S0 * 0.17;
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
  const bs = bizOf(c); const parts = [fullName(c), c.maiden, c.pref, c.role, c.info, c.warnings, c.sideNotes, c.dnaReason, ...c.postal, ...Object.values(c.custom || {}), ...(c.related || []).map((r) => r.name)];
  c.tags.forEach((t) => parts.push(tagName(t)));
  contactRatings(c).forEach((r) => parts.push(tagName(r.rating)));
  [...c.mobiles, ...c.landlines].forEach((p) => parts.push(p.value, p.value.replace(/\D/g, ''), p.value.replace(/\D/g, '').replace(/^61/, '0')));
  c.emails.forEach((e) => parts.push(e.value));
  bs.forEach((b) => { parts.push(b.name, b.info, b.warnings); b.pics.forEach((p) => parts.push(p.value)); b.patientIds.forEach((p) => parts.push(p.label, p.value)); b.farms.forEach((f) => parts.push(f.name, f.address, f.info)); });
  const s = parts.filter(Boolean).join(' \u0001 ').toLowerCase(); IDX.hay.set(c.id, s); return s;
}
const nameOnly = () => S.nameOnly !== false; // "Search in name only" tick box — ticked every time the app opens
const nameHay = (c) => [fullName(c), c.first, c.middle, c.last, c.maiden, c.pref].filter(Boolean).join(' ').toLowerCase();
const bizNameHay = (b) => [b.name, b.abbr].filter(Boolean).join(' ').toLowerCase();
const locHay = (p) => (nameOnly() ? [p.name, ...p.us.map((u) => u.b.name)] : [p.name, p.type, p.f.address, p.f.info, ...p.us.map((u) => u.b.name)]).join(' ').toLowerCase();
const NAMEONLY_BOX = () => `<label style="font-weight:600" title="Untick to also search phone numbers, emails, notes, addresses and everything else"><input type="checkbox" data-act="nameonly" ${nameOnly() ? 'checked' : ''}> Search in name only</label>`;
function matchQ(hay, pq) { return pq.inc.every((t) => hay.includes(t)) && !pq.exc.some((t) => hay.includes(t)); }
function filteredContacts() {
  const pq = parseQuery(S.q);
  S.tagF = {}; S.quick = {}; // the tag/flag chips moved to Search & Bulk Edit
  const tf = Object.entries(S.tagF);
  return D.contacts.filter((c) => {
    if (!matchQ(nameOnly() ? nameHay(c) : contactHay(c), pq)) return false;
    if (tf.length) { const ts = contactTagSet(c); for (const [t, m] of tf) { if (m === 'inc' && !ts.has(t)) return false; if (m === 'exc' && ts.has(t)) return false; } }
    const q = S.quick;
    if (q.starred && !isFav(c)) return false;
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
function makeIndustry(b) { const cat = bizCat(b); if (!cat || catClass('b', cat) !== 'n') setBizCat(b, 'industry'); setBizType(b, 'nonclient'); }
const LINK_ROLES_DEFAULT = ['Business owner', 'Staff', 'Family member'];
const linkRoles = () => (D.settings.linkRoles && D.settings.linkRoles.length ? D.settings.linkRoles : LINK_ROLES_DEFAULT);
async function askLinkRole(c, b, past, many) { /* → role text ('' = none) or null when backed out; many = number of links in a bulk action */
  const inp = 'style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px;margin-top:8px"';
  const r = await askBox(many ? 'Role for these links' : 'Role at ' + b.name, `<p>${many ? `What role should the ${many} people have at the businesses they're being linked to${past ? ' (as past employees)' : ''}? You can change any of them later.` : `What is <b>${h(fullName(c))}</b>'s role at <b>${h(b.name)}</b>${past ? ' (past)' : ''}?`}</p>
    <div class="chips" id="lr-chips">${linkRoles().map((x) => `<button type="button" class="chip" style="padding-right:12px" onclick="document.querySelectorAll('#lr-chips .chip').forEach(function(e){e.classList.remove('on')});this.classList.add('on');document.getElementById('lr-val').value=this.dataset.r" data-r="${h(x)}">${x === 'Business owner' ? '👑 ' : x === 'Staff' ? '🧑‍🌾 ' : x === 'Family member' ? '👪 ' : ''}${h(x)}</button>`).join('')}<button type="button" class="chip" style="padding-right:12px" onclick="document.querySelectorAll('#lr-chips .chip').forEach(function(e){e.classList.remove('on')});this.classList.add('on');var v=document.getElementById('lr-val');v.value='';v.focus()">✏️ Custom role</button></div>
    <input id="lr-val" data-ask="role" ${inp}>`, 'Save role', false, 'Cancel', 'No role');
  if (!r) return null; return r === 'alt' ? '' : (ASK_FORM.role || '').trim();
}
function unPrimary(c, b) { /* c is no longer primary at b: drop the Primary tag unless they're still primary somewhere else */ if (!c) return; reindex(); if (D.businesses.some((x) => x !== b && primaryOf(x) === c)) return; if (c.tags.some((t) => t === 'pa' || t === 'pi')) { c.tags = c.tags.filter((t) => t !== 'pa' && t !== 'pi'); touch(c); } }
function setBizType(b, v) { b.type = v === 'nonclient' ? 'nonclient' : 'client'; const cat = bizCat(b); b.typeLocked = !!cat && (b.type === 'client') !== (catClass('b', cat) !== 'n'); if (b.type === 'nonclient') { b.primaryRequired = false; b.primaryContact = null; } touch(b); } // category decides (Settings → Categories); no category → the business type
const NONCLIENT_CATS = new Set(['industry', 'bvs', 'bfriends', 'phone', 'prac']); // default; changeable in Settings → Categories
const catClass = (who, cat) => { const m = ((D.settings || {}).catClass || {})[who]; return m && cat in m ? m[cat] : NONCLIENT_CATS.has(cat) ? 'n' : 'c'; }; // who: 'p' people, 'b' businesses
const isClientPerson = (c) => catClass('p', catOf(c)) !== 'n';
const PREF = (() => { try { return JSON.parse(localStorage.getItem('bvt-prefs') || '{}'); } catch (e) { return {}; } })(); // this device only
function savePref(k, v) { PREF[k] = v; try { localStorage.setItem('bvt-prefs', JSON.stringify(PREF)); } catch (e) { } }
function applyUi() { const th = PREF.theme || 'auto'; const dark = th === 'dark' || (th === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.dataset.theme = dark ? 'dark' : 'light'; if (PREF.scheme && PREF.scheme !== 'classic') document.documentElement.dataset.scheme = PREF.scheme; else delete document.documentElement.dataset.scheme; document.body.style.zoom = { normal: '', large: '1.12', xl: '1.25' }[PREF.size || 'normal'] || ''; }
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
const TAB_DEFAULTS = { contacts: 'People', loc: 'Pins', biz: 'Businesses', search: 'Search & Bulk Edit', route: 'Plan Route', map: 'Farm Map', jobs: 'Jobs', settings: 'Settings' };
const lab = (k) => { const v = (((D && D.settings) || {}).labels || {})[k]; return (v && !(k === 'contacts' && v === 'Contacts')) ? v : TAB_DEFAULTS[k]; }; /* old "Contacts" name now shows as People */
/* ---------- business-name helpers: matching names in text, splitting names that hold more than one business ---------- */
const coreBiz = (n) => (n || '').replace(/\([^)]*\)?/g, ' ').replace(/\b(pty\.?\s*ltd\.?|pty|ltd|limited|atf\b.*|as trustee.*|trading as.*|t\/a\b.*|ta\b .*|& co\b)/gi, ' ').toLowerCase().replace(/[^a-z0-9]/g, '');
const ROLE_RX = /^(own|own farm|own enterprise|workman|producer|& ?producer|farm manager|manager|partner'?s?|parents?.*|parent'?s farm|son in law'?s farm|her dad'?s farm|book ?keeper|coordinator'?s phone|tbc|veterinarian.*|truckie|feedlot manager|customer service|professor.*|farm worker|producer & farm worker|nutrien stockie.*|dpird biosecurity officer.*|former .*|sharefarm.*|works for|also works for|office)$/i;
function parseBizName(name) { // → [{text, role}] best guess; the person checks it
  const parts = []; let rest = name;
  rest = rest.replace(/\s*\(([^)]*)\)?/g, (m, g) => { g = g.trim(); if (g) parts.push({ text: g, paren: true }); return ' | '; });
  rest.split(/\s*\|\s*|\s*,\s*also works for\s+|\s+also works for\s+|\s+and works for\s+|\s*,\s*works for\s+|\s+and workman for\s+|\s*,\s*also\s+|\s*,\s*|\s+-\s+|\s*\/\s*|\s+&\s+(?=producer\b)/i).forEach((t) => { t = t.trim().replace(/^[-–]\s*/, '').replace(/\s*[-–]$/, ''); if (t) parts.push({ text: t }); });
  const out = []; parts.forEach((p) => { const m = p.text.match(/^(former|formerly|ex-?|previously|previous|past|retired)?\s*(?:a |an |the )?(.+?)\s+(?:at|for|with)\s+(.+)$/i);
    if (m && m[3] && (m[1] || /^[a-z]/.test(p.text) || ROLE_RX.test(m[2])) && !/\b(pty|ltd|farm(s|ing)?|grazing|pastoral)\b/i.test(m[2])) { const past = !!m[1]; const role = m[2].replace(/^./, (x) => x.toUpperCase()); out.push({ text: m[3].trim(), past, pairNext: false }); out.push({ text: role, role: true, past, roleForPrev: true }); }
    else out.push(p); });
  const seen = new Set(); return out.filter((p) => { const k = p.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).map((p) => ({ ...p, text: p.text.replace(/^(at|for|and)\s+/i, ''), role: p.role || ROLE_RX.test(p.text.trim()) || /^[a-z]/.test(p.text) }));
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
const noDet = (c) => !!c.noDetails && !c.emails.length && !c.mobiles.length && !c.landlines.length && !c.postal.length; // name only — we know who they are but not how to reach them
function missingInfo(c) {
  const bs = bizOf(c); const m = []; // which fields count is set in Settings → Required information
  if (noDet(c)) return []; // name-only people aren't chased for details
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
  SURNAMES = null;
  const jobs = []; const dis = D.dismissed || {};
  const add = (j) => { j.key = j.key || j.type + ':' + (j.fid || j.id); if (!dis[j.key]) jobs.push(j); };
  // farms that vanished without going to the trash (e.g. a sync clash) but are in the change log
  lostFarms().forEach((x) => add({ type: 'lostfarm', key: 'lostfarm:' + x.id, kind: 'business', id: x.bid || (D.businesses[0] || {}).id, who: (x.rec.name || 'Farm') + (x.bname ? ' — ' + x.bname : ''), note: `Added ${new Date(x.at).toLocaleDateString('en-AU')}${x.by ? ' on ' + x.by : ''}, then disappeared without going to the trash.${x.rec.address ? ' · ' + x.rec.address : ''}`, lost: x }));
  // farms
  { const linked = new Set(D.businesses.flatMap((b) => b.farmLinks.map((l) => l.fid))); D.farms.forEach((f) => { if (linked.has(f.id)) return; const ob = f.owner && f.owner.bid && IDX.biz.get(f.owner.bid);
    add({ type: 'orphanfarm', kind: 'business', id: ob ? ob.id : (D.businesses[0] || {}).id, fid: f.id, who: (f.name || f.address || 'Unnamed farm'), note: (ob ? `Probably belongs to ${ob.name} (the owner) — ` : '') + 'not showing on any business. Link it, or delete it if it isn\'t needed.' + (f.address ? ' · ' + f.address : ''), orphan: { fid: f.id, bid: ob ? ob.id : null } }); }); }
  const byGps = new Map(); const seenF = new Set();
  D.businesses.forEach((b0) => {
    b0.farms.forEach((f) => { if (seenF.has(f.id)) return; seenF.add(f.id); const b = IDX.farmBiz.get(f.id) || b0; /* a shared farm is checked once */
      const who = b.name + (f.name ? ' — ' + f.name : '');
      if (f.lat == null && !(f.turn && f.turn.lat != null)) add({ type: 'nogps', kind: 'business', id: b.id, fid: f.id, who, note: 'Address but no GPS pin' + (f.address ? ': ' + f.address : '') });
      if (isClientBiz(b) && isPlainFarmName(f.name)) { const rd = roadOf(f.address) || (S.roadSug || {})[f.id] || ''; add({ type: 'farmname', key: 'farmname:' + f.id, kind: 'business', id: b.id, fid: f.id, who, note: `${f.name ? 'Just called "Farm"' : 'No farm name'}${f.address ? ' · ' + f.address : ' · no address'}`, nameSug: rd ? rd + ' farm' : '' }); }
      if (/^\s*home\s*$/i.test(f.name || '')) add({ type: 'homename', kind: 'business', id: b.id, fid: f.id, who, note: 'Named just "Home" — add the farm or yards name (e.g. "Jarrahvale" farm) so it can be told apart' + (f.address ? ' · ' + f.address : '') });
      { const bits = oldFarmInfo(f); if (bits.length) add({ type: 'oldinfo', kind: 'business', id: b.id, fid: f.id, who, note: bits.join(' · '), oldinfo: f.id }); }
      if (f.kmReturn == null) add({ type: 'nokm', kind: 'business', id: b.id, fid: f.id, who, note: 'No distance recorded', suggest: f.gKm != null ? { km: f.gKm, fids: [f.id], why: 'Google Maps' } : null, needsLookup: f.gKm == null && f.lat != null ? [f.id] : null });
      (f.flags || []).forEach((fl) => { if (['signfix', 'kmcheck'].includes(fl.type)) add({ type: fl.type, kind: 'business', id: b.id, fid: f.id, who, note: fl.note, data: fl, suggest: fl.type === 'kmcheck' ? { km: fl.google, fids: [f.id], why: 'Google Maps, rounded up' } : null }); });
      if (f.lat != null && f.kmReturn != null) { const k = f.lat.toFixed(3) + ',' + f.lng.toFixed(3); if (!byGps.has(k)) byGps.set(k, []); byGps.get(k).push({ b, f }); }
    });
    const b = b0;
    (b.flags || []).forEach((fl) => { if (fl.type !== 'catpick') add({ type: fl.type, kind: 'business', id: b.id, who: b.name, note: fl.note }); });
    if (isClientBiz(b) && b.primaryRequired !== false && !primaryOf(b)) add({ type: 'noprimary', kind: 'business', id: b.id, who: b.name, primSuggest: (suggestPrimary(b) || {}).id, note: (IDX.bizContacts.get(b.id) || []).length ? 'Choose the primary contact (Edit business → Primary contact)' : 'No contacts linked — add a contact and make them primary' });
  });
  // two farms on the same GPS pin: same farm or different farm?
  const pinned = []; D.farms.forEach((f) => { const b = IDX.farmBiz.get(f.id); const p = farmRoutePt(f); if (b && p.lat != null) pinned.push({ b, f: { ...f, lat: p.lat, lng: p.lng, id: f.id, orig: f } }); });
  for (let i = 0; i < pinned.length; i++) for (let k = i + 1; k < pinned.length; k++) {
    const A = pinned[i], B = pinned[k];
    if (Math.abs(A.f.lat - B.f.lat) > 0.01 || Math.abs(A.f.lng - B.f.lng) > 0.012) continue;
    const dkm = hav(A.f, B.f); if (dkm >= routeSet().pinM / 1000) continue; // only pins on the same spot (Settings → Travel)
    const key = 'nearpin:' + [A.f.id, B.f.id].sort().join('|');
    const nm = (x) => x.b.name + (x.f.name ? ' — ' + x.f.name : '');
    add({ type: 'nearpin', key, kind: 'business', id: A.b.id, fid: A.f.id, who: nm(A) + '  ↔  ' + nm(B), note: `These two farms have the same GPS pin. If they're the same yards, combine them into one shared farm (used by both). (1 = ${nm(A)}, 2 = ${nm(B)})`, pair: { a: A.f.id, b: B.f.id, same: A.b.id === B.b.id } });
  }
  { /* possible duplicate farms: yards pins within 200 m of each other (turn-offs don't count); pairs already marked as different farms are left out */ const pts = (f) => [f.lat != null ? { lat: f.lat, lng: f.lng } : null, ...(f.extra || []).filter((x) => x.lat != null && x.type !== 'turn')].filter(Boolean);
    const norm = (a) => (a || '').toLowerCase().replace(/[^a-z0-9]/g, ''); const live = D.farms.filter((f) => farmUsersOf(f.id).length).map((f) => ({ f, p: pts(f), a: norm(f.address) })); const near = new Set(jobs.filter((j) => j.type === 'nearpin').map((j) => j.key.slice(8)));
    for (let i = 0; i < live.length; i++) for (let k = i + 1; k < live.length; k++) { const A = live[i], B = live[k]; const pair = [A.f.id, B.f.id].sort().join('|'); if (near.has(pair)) continue;
      if ((D.dismissed || {})['dupfarm:' + pair] || (D.dismissed || {})['nearpin:' + pair]) continue; let dmin = Infinity; A.p.forEach((x) => B.p.forEach((y) => { if (Math.abs(x.lat - y.lat) < 0.003 && Math.abs(x.lng - y.lng) < 0.004) dmin = Math.min(dmin, hav(x, y)); })); if (!(dmin < 0.2)) continue; const sameAddr = A.a.length > 8 && A.a === B.a;
      const ba = IDX.farmBiz.get(A.f.id), bb = IDX.farmBiz.get(B.f.id); if (!ba || !bb) continue; const nm = (f, b) => b.name + (f.name ? ' — ' + f.name : '');
      add({ type: 'dupfarm', key: 'dupfarm:' + pair, kind: 'business', id: ba.id, fid: A.f.id, who: nm(A.f, ba) + '  ↔  ' + nm(B.f, bb), note: `Yards ${dmin < 0.1 ? 'within 100 m' : Math.round(dmin * 1000) + ' m apart'}${sameAddr ? ', same address' : ''}. If they're the same place, merge them into one shared farm.`, dupfarm: { a: A.f.id, b: B.f.id } }); } }
  dupeJobs(add);
  D.contacts.forEach((c) => { if (c.infoMove) add({ type: 'infomove', key: 'infomove:' + c.id + ':' + (c.infoMove.at || 0), kind: 'contact', id: c.id, who: fullName(c), note: c.infoMove.pending ? 'General info to move to a business — which business does it belong to?' : 'General info moved to ' + ((IDX.biz.get(c.infoMove.bid) || {}).name || 'a business') + ' — is that the right business?', infoMove: c.infoMove });
    { const pi = prefInName(c); if (pi && !c.pref && !maidenInName(c) && c.last && /^[A-Za-z][A-Za-z'’-]{1,15}$/.test(pi.inner) && /^[A-Za-z][A-Za-z'’-]{1,15}$/.test((c.first || '').replace(/\s*[("“'‘].*$/, '').trim()) && !/^(personal|bovitech|work|home|office|mobile)$/i.test(pi.inner)) add({ type: 'prefname', key: 'prefname:' + c.id, kind: 'contact', id: c.id, who: fullName(c), note: pi.field === 'middle' ? `Middle name "${c.middle}" looks like a nickname` : `First name "${c.first}" has a nickname in it`, prefFix: pi }); }
    { const mi = maidenInName(c); if (mi && !c.maiden) add({ type: 'maiden', key: 'maiden:' + c.id, kind: 'contact', id: c.id, who: fullName(c), note: `"${c[mi.field]}" → ${({ last: 'surname', middle: 'middle name', first: 'first name' })[mi.field]} "${mi.rest}", maiden name "${mi.maiden}"`, maidenFix: mi }); }
    { const hl = helperLines(c).length && bizOf(c).length; if (relLines(c).length || hl) add({ type: 'relmove', key: 'relmove:' + c.id, kind: 'contact', id: c.id, who: fullName(c), note: relLines(c).length ? 'Relationships in general info — move them to Related people, or keep them in general info?' + (hl ? ' Happy helpers can go onto the business.' : '') : `Happy helpers written in general info — add them to ${bizOf(c).map((b) => b.name).join(' / ')}'s Happy helpers?`, relProps: relProposals(c), hhProps: hl ? helperProps(c) : [] }); } });
  { /* suggested related people — one job per family group, a row per possible pair with one-tap guesses */
    const pairs = []; D.contacts.forEach((c) => relSuggest(c).forEach((sg) => { const k = 'relsuggest:' + [c.id, sg.o.id].sort().join('|'); if (!dis[k]) pairs.push({ a: c, b: sg.o, why: sg.why, guess: sg.guess, k }); }));
    const par = new Map(); const fnd = (x) => { while (par.get(x) !== x) x = par.get(x); return x; };
    pairs.forEach((p) => { [p.a.id, p.b.id].forEach((id) => { if (!par.has(id)) par.set(id, id); }); par.set(fnd(p.a.id), fnd(p.b.id)); });
    const grp = new Map(); pairs.forEach((p) => { const r = fnd(p.a.id); if (!grp.has(r)) grp.set(r, []); grp.get(r).push(p); });
    grp.forEach((ps) => { const people = [...new Set(ps.flatMap((p) => [p.a, p.b]))].sort((x, y) => alphaCmp(fullName(x), fullName(y)));
      add({ type: 'relsuggest', key: 'relsuggestg:' + people.map((x) => x.id).sort().join('|'), kind: 'contact', id: people[0].id, who: people.map(fullName).join(' · '), note: ps.length === 1 ? 'Possibly related — ' + ps[0].why : `${ps.length} possible relationships — tap the one that fits for each pair`, relSugs: ps.map((p) => ({ a: p.a.id, b: p.b.id, why: p.why, guess: p.guess, k: p.k })) }); }); }
  D.businesses.forEach((b) => { if (b.abbr) return; const nm = b.name || ''; const m = nm.match(/\(([A-Z][A-Z0-9&]{1,7})\)/);
    if (m) return add({ type: 'bizabbr', key: 'bizabbr:' + b.id, kind: 'business', id: b.id, who: nm, note: `"${m[1]}" in brackets looks like an abbreviation`, abbr: { abbr: m[1], name: nm.replace(m[0], ' ').replace(/\s+/g, ' ').trim() } });
    if (/^[A-Z][A-Z0-9&]{1,5}$/.test(nm.trim())) return add({ type: 'bizabbr', key: 'bizabbr:' + b.id, kind: 'business', id: b.id, who: nm, note: `"${nm}" looks like an abbreviation — add the full name?`, abbr: { abbr: nm.trim(), name: '', full: true } });
    if (ORG_RX.test(nm)) { const g = abbrGuess(nm); if (g.length >= 3 && g.length <= 5) add({ type: 'bizabbr', key: 'bizabbr:' + b.id, kind: 'business', id: b.id, who: nm, note: `Suggested abbreviation: ${g}`, abbr: { abbr: g, name: nm } }); } });
  { const all = D.farms.filter((f) => f.turn && f.turn.lat != null && !f.pinChecked && farmUsersOf(f.id).some((u) => !u.past)).sort((a, b) => alphaCmp(farmLabel(a), farmLabel(b)));
    const inactive = (f) => farmUsersOf(f.id).filter((u) => !u.past).every((u) => ['inactive', 'dna'].includes(bizCat(u.b)));
    [['pincheck', all.filter((f) => !inactive(f))], ['pincheckin', all.filter(inactive)]].forEach(([type, todo]) => { PC_LEFT[type] = todo.filter((f) => !dis[type + ':' + f.id]).length; return todo.filter((f) => !dis[type + ':' + f.id]).slice(0, 20).forEach((f) => { const b = IDX.farmBiz.get(f.id); add({ type, key: type + ':' + f.id, kind: 'business', id: b.id, fid: f.id, who: farmLabel(f), note: `Turn-off pin — check it's in the right place, then add the yards (${todo.length} left to check)` }); }); }); }
    { const todo = D.farms.filter((f) => f.turn && f.turn.lat != null && !f.svOk && farmUsersOf(f.id).some((u) => !u.past && !INACT.includes(bizCat(u.b)))).sort((a, b) => alphaCmp(farmLabel(a), farmLabel(b))); const left = todo.filter((f) => !dis['svcheck:' + f.id]); PC_LEFT.svcheck = left.length;
      left.slice(0, 20).forEach((f) => { const b = IDX.farmBiz.get(f.id); if (b) add({ type: 'svcheck', key: 'svcheck:' + f.id, kind: 'business', id: b.id, fid: f.id, who: farmLabel(f), note: 'Check the turn-off on Street View — walk along the road or drag the pin until it\'s where you turn in, then save', svc: f.id }); }); }
    D.farms.filter((f) => f.needTurn && !(f.turn && f.turn.lat != null)).forEach((f) => { const b = IDX.farmBiz.get(f.id); if (b) add({ type: 'turnadd', key: 'turnadd:' + f.id, kind: 'business', id: b.id, fid: f.id, who: farmLabel(f), note: 'The yards pin is set — add the pin where you leave the road' }); });
  byGps.forEach((arr) => {
    const kms = [...new Set(arr.map((x) => x.f.kmReturn))];
    if (kms.length > 1) { const gk = arr.map((x) => x.f.gKm).find((v) => v != null); const best = gk != null ? kms.slice().sort((a, b) => Math.abs(a - gk) - Math.abs(b - gk))[0] : null;
      const sug = gk != null ? { km: gk, fids: arr.map((x) => x.f.id), why: `Google Maps says ${gk} km${best != null ? ` — closest recorded value is ${best} km` : ''}` } : null;
      arr.forEach(({ b, f }) => add({ suggest: sug, needsLookup: gk == null ? arr.map((x) => x.f.id) : null, type: 'kmconflict', kind: 'business', id: b.id, fid: f.id, who: b.name + (f.name ? ' — ' + f.name : ''), note: 'Same GPS location has different km recorded: ' + kms.map((k) => k + ' km').join(' / ') + (arr.length > 1 ? ' (' + [...new Set(arr.map((x) => x.b.name))].join(', ') + ')' : '') })); }
  });
  // contacts
  D.contacts.forEach((c) => {
    const who = fullName(c);
    if (needsPhotoChoice(c)) { const { dr, ptags } = photoCandidates(c); const cands = [...dr, ...ptags].sort((a, b) => prioIdx(a) - prioIdx(b)); add({ type: 'photo', kind: 'contact', id: c.id, who, note: 'Has more than one tag with a photo (' + [...dr, ...ptags].map(tagName).join(', ') + ') — choose one, or a split photo', photoSuggest: cands[0], photoCands: [...new Set(cands)] }); }
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
  D.contacts.forEach((c) => { if (chosenPhoto(c) && c.photoCats != null && c.photoCats !== catSig(c)) add({ type: 'photocheck', key: 'photocheck:' + c.id + ':' + catSig(c), kind: 'contact', id: c.id, who: fullName(c), note: `Photo: ${photoNow(c)} — categories now: ${catSig(c).split(',').filter(Boolean).map(tagName).join(', ') || 'none'}`, photocheck: { kind: 'contact', id: c.id } }); });
  D.businesses.forEach((b) => { if (chosenPhoto(b) && b.photoCats != null && b.photoCats !== bizSig(b)) add({ type: 'photocheck', key: 'photocheck:' + b.id + ':' + bizSig(b), kind: 'business', id: b.id, who: b.name, note: `Business photo: ${photoNow(bizPseudo(b))} — categories now: ${bizSplitCats(b).map(tagName).join(', ') || 'none'}`, photocheck: { kind: 'business', id: b.id } }); });
  { /* name-only related people / happy helpers / don't mention that could be a contact in the app */ const dis = D.dismissed || {}; const mk = (kind, ownerId, name, cands, where, extra) => { if (!cands.length) return; const key = 'namematch:' + kind + ':' + ownerId + ':' + name.toLowerCase() + ':' + cands.map((x) => x.id).sort().join('.'); if (dis[key]) return; add({ type: 'namematch', key, kind: kind === 'helper' ? 'business' : 'contact', id: ownerId, who: `“${name}” — ${kind === 'helper' ? (IDX.biz.get(ownerId) || {}).name : fullName(D.contacts.find((x) => x.id === ownerId) || { first: '' })}`, note: where, nm: { kind, owner: ownerId, name, cands: cands.map((x) => x.id) }, ...extra }); };
    D.contacts.forEach((c) => { const near = { last: c.last, bids: c.links.map((l) => l.bid), cids: [c.id] };
      (c.related || []).filter((r) => !r.cid && r.name).forEach((r) => mk('related', c.id, r.name, nameMatches(r.name, near).filter((x) => x.id !== c.id && !(c.related || []).some((y) => y.cid === x.id)), `Related to ${fullName(c)} (${r.rel || 'related'}) — saved as a name only`));
      (c.noMentionRel || []).filter((r) => !r.cid && r.name).forEach((r) => mk('nomention', c.id, r.name, nameMatches(r.name, near).filter((x) => x.id !== c.id && !(c.noMentionRel || []).some((y) => y.cid === x.id)), `In ${fullName(c)}'s Don't mention — saved as a name only`)); });
    D.businesses.forEach((b) => (b.helpers || []).filter((x) => !x.cid && x.name).forEach((x) => { const ppl = IDX.bizContacts.get(b.id) || []; mk('helper', b.id, x.name, nameMatches(x.name, { last: (ppl[0] || {}).last, bids: [b.id], cids: ppl.map((p) => p.id) }).filter((o) => !(b.helpers || []).some((y) => y.cid === o.id)), `Happy helper at ${b.name} — saved as a name only`); })); }
  // contacts at the same business with different categories (skip businesses already being asked about via a category change)
  const pendingBiz = new Set(); D.contacts.forEach((c) => (c.flags || []).forEach((f) => { if (f.type === 'catprop') (f.bids || []).forEach((b) => pendingBiz.add(b)); }));
  const isCat = (t) => IDX.tags.get(t)?.group === 'client';
  D.businesses.forEach((b) => {
    const cs = IDX.bizContacts.get(b.id) || []; if (cs.length < 2 || pendingBiz.has(b.id)) return;
    const splitOk = (c) => { if (!followsBiz(c)) return false; const bc = [...new Set(bizOf(c).map(bizCat).filter(Boolean))].sort(); if (bc.length < 2) return false; const pt = [...new Set((photoSpec(c).parts || []).map((x) => x.tag))].sort(); return pt.join(',') === bc.slice(0, 2).join(',') && bc.length === 2; };
    const ec = new Map(cs.map((c) => [c, splitOk(c) ? (bizCat(b) ? [bizCat(b)] : []) : catOf(c) ? [catOf(c)] : []])); const diff = [...new Set(cs.flatMap((c) => ec.get(c)))].filter((t) => !cs.every((c) => ec.get(c).includes(t))); if (!diff.length) return;
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
  cjSyncTypes(); cjList().forEach((cj) => { try { cjRecords(cj).forEach((x) => add({ type: 'cj_' + cj.id, ...x, note: cj.why || cjRuleText(cj) })); } catch (e) { } });
  (D.conflicts || []).forEach((cf) => add({ type: 'conflict', kind: cf.kind === 'businesses' ? 'business' : 'contact', id: cf.key, who: cf.who, note: 'Changed on two devices while offline — differences below. Choose which version to keep:', data: cf }));
  return jobs;
}
const JOB_TYPES = {
  conflict: { t: 'Sync conflicts', manual: false },
  kmcheck: { t: 'Distance more than 1 km different to Google Maps', manual: true },
  kmconflict: { t: 'Same farm, different km on different contacts', manual: true },
  dupe: { t: 'Possible duplicates', manual: false },
  pincheck: { t: 'Check pins — current clients (20 at a time)', manual: false },
  pincheckin: { t: 'Check pins — inactive clients (20 at a time)', manual: false },
  turnadd: { t: 'Add the turn-off pin', manual: true, btn: 'No turn-off needed' },
  infomove: { t: 'General info moved to a business — check it', manual: false },
  relmove: { t: 'Relationships (and happy helpers) in general info — move them?', manual: true, btn: 'Keep in general info' },
  maiden: { t: 'Maiden name written in the name — move it to the Maiden name box?', manual: true, btn: 'Leave as is' },
  prefname: { t: 'Nickname written in the name — move it to Preferred name?', manual: true, btn: 'Leave as is' },
  bizabbr: { t: 'Business abbreviation — add one?', manual: true, btn: 'No abbreviation' },
  relsuggest: { t: 'Suggested related people', manual: true, btn: 'None of these are related' },
  nearpin: { t: 'Same GPS pin on two farms — same yards or different?', manual: false },
  dupfarm: { t: 'Possible duplicate farms — merge them?', manual: true, btn: 'Different farms' },
  svcheck: { t: 'Check turn-off pins on Street View (20 at a time)', manual: true, btn: 'No Street View here — skip' },
  lostfarm: { t: 'Farm lost in a sync clash — restore it?', manual: true, btn: 'No — leave it deleted' },
  orphanfarm: { t: 'Farm not linked to any business (e.g. lost in a sync clash)', manual: true, btn: 'Delete it' },
  oldinfo: { t: 'Old farm info to sort (facilities, reception, biosecurity)', manual: false },
  nogps: { t: 'Farm address with no GPS pin', manual: true },
  homename: { t: 'Farm just called "Home" — give it a proper name', manual: true, btn: 'Leave as "Home"' },
  farmname: { t: 'Farm just called "Farm" or with no name — name it after its road', manual: true, btn: 'Leave the name as it is' },
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
  photocheck: { t: 'Photo needs checking — categories have changed', manual: true, btn: 'Leave as it is' },
  namematch: { t: 'Is this the same person? (related people and happy helpers saved as a name only)', manual: true, btn: 'Not the same person' },
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
/* ---------------- your own job lists (built from a rule — Jobs → ➕ New job list) ---------------- */
const CJ_KINDS = { contact: 'Contacts', business: 'Businesses', farm: 'Farms / yards' };
const cjTxt = (v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? x.value || '' : x)).join(' ') : v == null ? '' : String(v));
const cjFarmCur = (f) => farmUsersOf(f.id).filter((u) => !u.past);
const CJ_FIELDS = {
  contact: [['name', 'Full name', 'text', (c) => fullName(c)], ['first', 'First name', 'text', (c) => c.first], ['last', 'Surname', 'text', (c) => c.last], ['pref', 'Preferred name', 'text', (c) => c.pref], ['maiden', 'Maiden name', 'text', (c) => c.maiden], ['role', 'Role', 'text', (c) => c.role],
    ['category', 'Category', 'cat', (c) => catOf(c)], ['tags', 'Tags (incl. category)', 'tags', (c) => [...contactTagSet(c)]], ['mobile', 'Mobile', 'text', (c) => cjTxt(c.mobiles)], ['landline', 'Landline', 'text', (c) => cjTxt(c.landlines)], ['email', 'Email', 'text', (c) => cjTxt(c.emails)], ['postal', 'Postal address', 'text', (c) => cjTxt(c.postal)],
    ['info', 'General info', 'text', (c) => c.info], ['warnings', 'Warnings', 'text', (c) => c.warnings], ['nbiz', 'Number of current businesses', 'num', (c) => bizOf(c).length], ['bizname', 'Business name', 'text', (c) => bizOf(c).map((b) => b.name).join(' | ')], ['inactiveReason', 'Inactive reason', 'text', (c) => c.inactiveReason], ['nrel', 'Number of related people', 'num', (c) => (c.related || []).length]],
  business: [['name', 'Name', 'text', (b) => b.name], ['abbr', 'Abbreviation', 'text', (b) => b.abbr], ['type', 'Client or non-client', 'pick:client,nonclient', (b) => (isClientBiz(b) ? 'client' : 'nonclient')], ['category', 'Category', 'cat', (b) => bizCat(b)],
    ['phone', 'Phone', 'text', (b) => cjTxt(b.phones)], ['email', 'Email', 'text', (b) => cjTxt(b.emails)], ['postal', 'Postal address', 'text', (b) => cjTxt(b.postal)], ['pic', 'PIC', 'text', (b) => cjTxt(b.pics)], ['patientId', 'Patient / ezyVet ID', 'text', (b) => cjTxt(b.patientIds)],
    ['info', 'General info', 'text', (b) => b.info], ['warnings', 'Warnings', 'text', (b) => b.warnings], ['biosec', 'Biosecurity', 'text', (b) => b.biosec], ['nfarms', 'Number of farms', 'num', (b) => (b.farms || []).length], ['ncontacts', 'Number of current contacts', 'num', (b) => (IDX.bizContacts.get(b.id) || []).length], ['primary', 'Has a primary contact', 'bool', (b) => !!b.primaryContact]],
  farm: [['name', 'Farm / yards name', 'text', (f) => f.name], ['address', 'Address', 'text', (f) => f.address], ['pinType', 'Pin type', 'pin', (f) => f.pinType], ['yards', 'Has a yards pin', 'bool', (f) => f.lat != null], ['turn', 'Has a turn-off pin', 'bool', (f) => !!(f.turn && f.turn.lat != null)],
    ['km', 'Return km', 'num', (f) => f.kmReturn], ['min', 'Drive minutes each way', 'num', (f) => f.driveMin], ['checked', 'Pins checked', 'bool', (f) => !!f.pinChecked], ['current', 'Used by a current business', 'bool', (f) => cjFarmCur(f).length > 0],
    ['category', 'Category of the business using it', 'cat', (f) => (cjFarmCur(f)[0] ? bizCat(cjFarmCur(f)[0].b) : '')], ['bizname', 'Business using it', 'text', (f) => cjFarmCur(f).map((u) => u.b.name).join(' | ')], ['reception', 'Phone reception', 'pick:good,patchy,none', (f) => (f.reception || {}).status || '']],
};
const CJ_OPS = { empty: 'is empty', notempty: 'is not empty', is: 'is', isnot: 'is not', contains: 'contains', notcontains: "doesn't contain", starts: 'starts with', gt: 'is more than', lt: 'is less than', yes: 'is yes', no: 'is no' };
const cjField = (kind, k) => (CJ_FIELDS[kind] || []).find((x) => x[0] === k);
function cjOpsFor(type) { if (type === 'bool') return ['yes', 'no']; if (type === 'num') return ['gt', 'lt', 'is', 'isnot', 'empty', 'notempty']; if (type === 'tags') return ['contains', 'notcontains', 'empty', 'notempty']; if (type === 'cat' || type === 'pin' || type.startsWith('pick:')) return ['is', 'isnot', 'empty', 'notempty']; return ['empty', 'notempty', 'contains', 'notcontains', 'is', 'isnot', 'starts']; }
function cjTest(kind, rec, r) { const fd = cjField(kind, r.f); if (!fd) return false; let v; try { v = fd[3](rec); } catch (e) { v = ''; } const want = String(r.v ?? '').trim().toLowerCase();
  if (fd[2] === 'tags') { const has = (v || []).map(String); if (r.op === 'empty') return !has.length; if (r.op === 'notempty') return !!has.length; const hit = has.some((t) => t.toLowerCase() === want || tagName(t).toLowerCase() === want); return r.op === 'contains' ? hit : !hit; }
  if (fd[2] === 'bool') return r.op === 'no' ? !v : !!v;
  const s = v == null ? '' : String(v).trim(); const sl = s.toLowerCase(); const lbl = fd[2] === 'cat' && s ? tagName(s).toLowerCase() : fd[2] === 'pin' && s ? pinT(s).name.toLowerCase() : sl;
  switch (r.op) { case 'empty': return !s; case 'notempty': return !!s; case 'is': return sl === want || lbl === want; case 'isnot': return !(sl === want || lbl === want); case 'contains': return sl.includes(want); case 'notcontains': return !sl.includes(want); case 'starts': return sl.startsWith(want);
    case 'gt': return s !== '' && +s > +want; case 'lt': return s !== '' && +s < +want; } return false; }
function cjMatch(cj, rec) { const rs = (cj.rules || []).filter((r) => r.f && r.op); if (!rs.length) return false; return cj.match === 'any' ? rs.some((r) => cjTest(cj.kind, rec, r)) : rs.every((r) => cjTest(cj.kind, rec, r)); }
function cjRecords(cj) { /* → [{kind, id, fid, who}] */ const out = [];
  if (cj.kind === 'contact') D.contacts.forEach((c) => { if (cjMatch(cj, c)) { const bs = bizOf(c); out.push({ kind: 'contact', id: c.id, who: fullName(c) + (bs.length ? ' (' + bs.map((b) => b.name).join(', ') + ')' : '') }); } });
  else if (cj.kind === 'business') D.businesses.forEach((b) => { if (cjMatch(cj, b)) out.push({ kind: 'business', id: b.id, who: b.name }); });
  else D.farms.forEach((f) => { const us = farmUsersOf(f.id); if (!us.length || !cjMatch(cj, f)) return; const b = (us.find((u) => !u.past) || us[0]).b; out.push({ kind: 'business', id: b.id, fid: f.id, who: b.name + (f.name ? ' — ' + f.name : '') }); });
  return out; }
const cjList = () => D.settings.customJobs || [];
function cjSyncTypes() { Object.keys(JOB_TYPES).forEach((k) => { if (k.startsWith('cj_')) delete JOB_TYPES[k]; }); cjList().forEach((cj) => { JOB_TYPES['cj_' + cj.id] = { t: (cj.emoji ? cj.emoji + ' ' : '') + cj.name, manual: true, btn: 'Leave as is', custom: true }; }); }
function cjRuleText(cj) { return (cj.rules || []).map((r) => { const fd = cjField(cj.kind, r.f); const v = fd && fd[2] === 'cat' && r.v ? tagName(r.v) : fd && fd[2] === 'pin' && r.v ? pinT(r.v).name : r.v; return `${fd ? fd[1] : r.f} ${CJ_OPS[r.op] || r.op}${['empty', 'notempty', 'yes', 'no'].includes(r.op) ? '' : ' "' + (v ?? '') + '"'}`; }).join(cj.match === 'any' ? ' OR ' : ' AND '); }
const jobsGone = () => new Set(D.settings.jobsDeleted || []);
/* the editor */
function cjValInput(kind, r, i) { const fd = cjField(kind, r.f); if (!fd || ['empty', 'notempty', 'yes', 'no'].includes(r.op)) return '';
  const opt = (list) => `<select class="cj-v" data-i="${i}" style="flex:1;min-width:120px">${list.map(([v, l]) => `<option value="${h(v)}" ${String(r.v) === v ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>`;
  if (fd[2] === 'cat') return opt([...RATINGS, ...D.tags.filter((t) => t.group === 'client').map((t) => t.id)].map((id) => [id, tagName(id)]));
  if (fd[2] === 'tags') return opt(D.tags.map((t) => [t.id, t.name]));
  if (fd[2] === 'pin') return opt(pinTypes().map((t) => [t.id, t.emoji + ' ' + t.name]));
  if (fd[2].startsWith('pick:')) return opt(fd[2].slice(5).split(',').map((v) => [v, v === 'nonclient' ? 'non-client' : v]));
  return `<input class="cj-v" data-i="${i}" value="${h(r.v ?? '')}" ${fd[2] === 'num' ? 'inputmode="decimal"' : ''} style="flex:1;min-width:120px">`; }
function cjRulesHtml(dr) { return (dr.rules.length ? dr.rules : [{ f: '', op: '' }]).map((r, i) => { const fd = cjField(dr.kind, r.f); const ops = fd ? cjOpsFor(fd[2]) : [];
  return `<div class="cj-rule" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:4px 0;padding:6px;border:1px solid var(--line);border-radius:9px"><select class="cj-f" data-i="${i}" style="flex:1;min-width:150px"><option value="">— choose —</option>${CJ_FIELDS[dr.kind].map(([k, l]) => `<option value="${k}" ${r.f === k ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>${fd ? `<select class="cj-op" data-i="${i}" style="min-width:120px">${ops.map((o) => `<option value="${o}" ${r.op === o ? 'selected' : ''}>${CJ_OPS[o]}</option>`).join('')}</select>` : ''}${cjValInput(dr.kind, r, i)}<button type="button" class="btn small" data-act="cj-delrule" data-i="${i}" title="Remove">✕</button></div>`; }).join(''); }
function cjRead() { const dr = S.cjDraft; if (!dr || !$('#cj-name')) return dr; dr.name = val('cj-name'); dr.emoji = val('cj-emoji'); dr.why = val('cj-why'); dr.kind = $('#cj-kind').value; dr.match = $('#cj-match').value;
  document.querySelectorAll('#cj-rules .cj-rule').forEach((row, i) => { const r = dr.rules[i] || (dr.rules[i] = {}); const f = row.querySelector('.cj-f'), o = row.querySelector('.cj-op'), v = row.querySelector('.cj-v'); r.f = f.value; if (o) r.op = o.value; if (v) r.v = v.value; }); return dr; }
function cjRedraw() { const dr = S.cjDraft; dr.rules.forEach((r) => { const fd = cjField(dr.kind, r.f); if (!fd) { r.op = ''; return; } const ops = cjOpsFor(fd[2]); if (!ops.includes(r.op)) r.op = ops[0]; if (/^(cat|pin|tags|pick)/.test(fd[2]) && !['empty', 'notempty'].includes(r.op) && (r.v == null || r.v === '')) { const tmp = document.createElement('div'); tmp.innerHTML = cjValInput(dr.kind, { ...r, v: '' }, 0); const s = tmp.querySelector('select'); if (s) r.v = s.value; } });
  $('#cj-rules').innerHTML = cjRulesHtml(dr); cjCount(); }
function cjCount() { const dr = S.cjDraft; const el = $('#cj-count'); if (!el || !dr) return; const ok = dr.rules.filter((r) => r.f && r.op); if (!ok.length) { el.innerHTML = 'Add at least one rule.'; return; } const recs = cjRecords(dr); el.innerHTML = `<b>${recs.length}</b> ${recs.length === 1 ? 'match' : 'match'} right now${recs.length ? ': ' + recs.slice(0, 6).map((x) => h(x.who)).join(' · ') + (recs.length > 6 ? ' …' : '') : ''}`; }
function cjPrompt(desc) { const cats = [...RATINGS, ...D.tags.filter((t) => t.group === 'client').map((t) => t.id)].map((id) => `${id} = ${tagName(id)}`).join('; ');
  return `I'm adding a new automatic job list to the Bovitech Contacts app (a mobile large-animal vet practice's client list in Albany, WA). The app checks every record against a rule and lists the ones that match, so someone can fix them.

WHAT I WANT THE LIST TO FIND:
${desc}

Reply with a short explanation and ONE JSON block (in \`\`\`json fences) in exactly this format:
{"name":"short list title","emoji":"one emoji (optional)","kind":"contact|business|farm","match":"all|any","rules":[{"f":"field key","op":"operator","v":"value"}],"why":"one line telling the person what to do with each item"}

FIELDS (key = label (type)):
${Object.entries(CJ_FIELDS).map(([k, fs]) => `${k}: ${fs.map(([f, l, t]) => `${f} = ${l} (${t})`).join('; ')}`).join('\n')}

OPERATORS: ${Object.entries(CJ_OPS).map(([k, l]) => `${k} = ${l}`).join('; ')}
- text: empty, notempty, contains, notcontains, is, isnot, starts · num: gt, lt, is, isnot, empty, notempty · bool: yes, no (no value) · cat/pin/pick: is, isnot, empty, notempty · tags: contains, notcontains, empty, notempty
- Text matching ignores capitals. "empty"/"notempty"/"yes"/"no" take no value.
- Category ids (for cat fields and tags): ${cats}. Other tag ids: ${D.tags.filter((t) => t.group === 'additional').map((t) => `${t.id} = ${t.name}`).join('; ')}
- Pin type ids: ${pinTypes().map((t) => `${t.id} = ${t.name}`).join('; ')}
- If what I want can't be done with these fields, say so and suggest the closest list you can make.`; }
function cjParse(text) { const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i); let raw = m ? m[1] : null; if (!raw) { const i = text.indexOf('{'), j = text.lastIndexOf('}'); if (i >= 0 && j > i) raw = text.slice(i, j + 1); } if (!raw) throw new Error("No JSON found in Claude's reply");
  const js = JSON.parse(raw); if (!CJ_FIELDS[js.kind]) throw new Error('Unknown kind "' + js.kind + '"'); const bad = (js.rules || []).filter((r) => !cjField(js.kind, r.f) || !CJ_OPS[r.op]); if (bad.length) throw new Error('Unknown field or operator: ' + bad.map((r) => r.f + ' ' + r.op).join(', '));
  return { name: String(js.name || ''), emoji: String(js.emoji || ''), kind: js.kind, match: js.match === 'any' ? 'any' : 'all', rules: (js.rules || []).map((r) => ({ f: r.f, op: r.op, v: r.v == null ? '' : String(r.v) })), why: String(js.why || '') }; }
function cjSheet(cur) { S.cjDraft = cur ? JSON.parse(JSON.stringify(cur)) : { name: '', emoji: '', kind: 'contact', match: 'all', rules: [{ f: '', op: '' }], why: '' }; const dr = S.cjDraft; if (!dr.rules.length) dr.rules.push({ f: '', op: '' });
  openSheet(cur ? 'Edit job list' : 'New job list', `<div class="hint" style="margin-bottom:8px">The app checks every record against your rule and keeps the list up to date — items drop off once they no longer match (or someone taps "Leave as is"). Shows on every device.</div>
    <details class="card" style="background:var(--green-bg);border-color:var(--green);margin-bottom:10px" ${cur ? '' : 'open'}><summary style="cursor:pointer;font-weight:700">🤖 Get Claude to set it up</summary>
      <div class="f" style="margin-top:8px"><label>1. Describe what the list should find</label><textarea id="cj-desc" style="min-height:60px">${h(S.cjDesc || '')}</textarea></div>
      <div class="actions"><button type="button" class="btn small primary" data-act="cj-copy">2. Copy for Claude &amp; open Claude</button></div><div id="cj-copyinfo" class="hint"></div>
      <div class="f" style="margin-top:8px"><label>3. Paste Claude's reply</label><textarea id="cj-reply" style="min-height:60px"></textarea></div>
      <div class="actions"><button type="button" class="btn small primary" data-act="cj-fill">4. Fill in the rule below</button></div><div id="cj-fillinfo" class="hint"></div></details>
    <div class="grid2"><div class="f"><label>List name</label><input id="cj-name" value="${h(dr.name)}"></div><div class="f"><label>Emoji (optional)</label><input id="cj-emoji" value="${h(dr.emoji || '')}" maxlength="4" style="max-width:90px"></div></div>
    <div class="grid2"><div class="f"><label>Check</label><select id="cj-kind">${Object.entries(CJ_KINDS).map(([k, l]) => `<option value="${k}" ${dr.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="f"><label>Show when</label><select id="cj-match"><option value="all" ${dr.match !== 'any' ? 'selected' : ''}>ALL of the rules match</option><option value="any" ${dr.match === 'any' ? 'selected' : ''}>ANY rule matches</option></select></div></div>
    <div class="lbl">Rules</div><div id="cj-rules">${cjRulesHtml(dr)}</div><div class="actions"><button type="button" class="btn small" data-act="cj-addrule">➕ Add a rule</button></div>
    <div class="f" style="margin-top:8px"><label>What to do with each item (shown on the job)</label><input id="cj-why" value="${h(dr.why || '')}"></div>
    <div class="hint" id="cj-count" style="margin-top:6px"></div>`, () => {
    const d2 = cjRead(); if (!d2.name.trim()) { toast('Give the list a name'); return false; } d2.rules = d2.rules.filter((r) => r.f && r.op); if (!d2.rules.length) { toast('Add at least one rule'); return false; }
    const list = [...cjList()]; const item = { id: cur ? cur.id : uid('j'), name: d2.name.trim(), ...(d2.emoji.trim() ? { emoji: d2.emoji.trim() } : {}), kind: d2.kind, match: d2.match, rules: d2.rules, why: d2.why.trim(), by: cur ? cur.by : myInitials(), at: cur ? cur.at : Date.now(), ...(cur ? { edAt: Date.now() } : {}) };
    if (cur) list[list.findIndex((x) => x.id === cur.id)] = item; else list.push(item); D.settings.customJobs = list; touch(D.settings); JOBS_CACHE = null; S.jobOpen['cj_' + item.id] = true; NEXT_LOG_LABEL = `${cur ? 'Job list changed' : 'New job list'}: ${item.name}`; S.skipConfirm = true; return true; });
  setTimeout(cjCount, 0); }
document.addEventListener('change', (e) => { const t = e.target; if (!S.cjDraft || !t.closest || !t.closest('#sheet')) return; if (t.id === 'cj-kind') { cjRead(); S.cjDraft.rules = [{ f: '', op: '' }]; cjRedraw(); return; } if (t.classList.contains('cj-f') || t.classList.contains('cj-op')) { cjRead(); if (t.classList.contains('cj-f')) S.cjDraft.rules[+t.dataset.i].v = ''; cjRedraw(); return; } if (t.classList.contains('cj-v') || t.id === 'cj-match') { cjRead(); cjCount(); } });
document.addEventListener('input', (e) => { const t = e.target; if (t.id === 'cj-desc') S.cjDesc = t.value; if (S.cjDraft && t.classList && t.classList.contains('cj-v') && t.tagName === 'INPUT') { cjRead(); clearTimeout(S.cjT); S.cjT = setTimeout(cjCount, 300); } });
const JOB_INFO = {"conflict": ["sync", "A record was changed on two devices while offline — pick which version to keep."], "dupe": ["sync", "Two contacts or businesses look like the same one — merge them or mark as different."], "kmcheck": ["farm", "The km recorded for a farm is more than 1 km different to Google Maps."], "kmconflict": ["farm", "The same farm has different km recorded on different contacts."], "pincheck": ["farm", "Check the turn-off and yards pins for current clients' farms, 20 at a time."], "pincheckin": ["farm", "Same pin check for farms of inactive clients."], "turnadd": ["farm", "A pin was marked as the yards — add the turn-off pin from the road."], "nearpin": ["farm", "Two farms share the same GPS pin — same yards (combine) or different?"], "nogps": ["farm", "A farm has an address but no GPS pin."], "signfix": ["farm", "A GPS pin was missing its minus sign and was corrected — confirm it's right."], "nokm": ["farm", "A farm has no return distance recorded."], "infomove": ["contact", "General info was moved from a person to their business — check it landed in the right place."], "relmove": ["contact", "General info mentions relatives (wife, son…) or happy helpers — move them to Related people or the business's Happy helpers."], "maiden": ["contact", "A maiden name is written inside the name — move it to the Maiden name box."], "prefname": ["contact", "A nickname is written inside the name (e.g. Kevin \"Monty\") — move it to Preferred name."], "relsuggest": ["contact", "People who may be related (same surname and business) — confirm the relationship."], "photo": ["contact", "A contact has more than one possible photo — choose which shows."], "linkreview": ["contact", "A contact was recently linked to a business — current employee, past employee, or undo."], "warnsug": ["contact", "General info looks like it contains a warning — make it a proper warning?"], "linksuggest": ["contact", "A contact may belong to another business too — link them?"], "primnolink": ["contact", "A contact tagged Primary isn't linked to any business."], "blockcheck": ["contact", "A contact was set to Do not answer — has their number been blocked on the phones?"], "newinfo": ["contact", "A new contact is missing required details (see Required information)."], "ezyrestore": ["contact", "A client was made active again — restore them in ezyVet."], "ezyvet": ["contact", "A client was made inactive — inactivate them in ezyVet."], "bizabbr": ["biz", "A business name could have a short abbreviation (e.g. DPIRD) — add one?"], "bizonly": ["biz", "A non-client \"contact\" might just be the business itself — move the details onto the business."], "biznodetails": ["biz", "A non-client business has no phone, email or contact person."], "oddbiz": ["biz", "A business name looks like two businesses joined together — split or rename it."], "noprimary": ["biz", "A business has no primary contact."], "noname": ["biz", "A business was created from a person's name — check the business name."], "badpic": ["biz", "A PIC doesn't look right (should be 8 characters, e.g. 3ABCD123) — check it."], "nocat": ["cat", "A contact has no category (A+, A, B, C, inactive…)."], "multicat": ["cat", "A record has more than one category — pick one."], "catpick": ["cat", "A category was changed to the only one allowed — check the right one was kept."], "farmname": ["farm", "A farm called just \"Farm\" (or with no name) — rename it after the road it's on, e.g. Gull Rock Road farm."], "namematch": ["contact", "A related person, happy helper or Don't mention saved as a name only looks like a contact in the app — link them if it's the same person."], "catdiff": ["cat", "People at the same business have different categories."], "photocheck": ["cat", "A chosen or split photo no longer matches the person's (or business's) categories — usually after a change on another device."], "catprop": ["cat", "A contact's category changed — change the others at the same business too?"], "primin": ["cat", "An inactive client is tagged Primary (active) — change to Primary (inactive)."], "sheep": ["cat", "A sheep-only client — are they a regular or occasional client?"], "multirating": ["cat", "A contact works for several businesses — set the rating for each one."], "ratingconflict": ["cat", "A business has conflicting ratings — pick one."], "homename": ["farm", "A farm or yards is named just \"Home\" — give it a name that tells it apart."], "orphanfarm": ["farm", "A farm or yards that no business is linked to (usually after two devices changed the same business at once) — link it back or delete it."], "dupfarm": ["farm", "Two farms have yards pins within 200 m of each other — merge them if they are the same place."], "oldinfo": ["farm", "Farms with info in the old Facilities, Mobile reception or Biosecurity boxes (no longer in the edit window) — keep it, move it into General farm info, or delete it."], "lostfarm": ["farm", "A farm that was added but then disappeared without going to the trash (usually a sync clash) — restore it from the change log."], "svcheck": ["farm", "Check each turn-off pin on Street View: walk along the road or drag the pin until it is where you turn in, then save."]}; // job type → [group, what it is]
const JOB_GROUPS = [['contact', '👤 Contacts'], ['biz', '🏢 Businesses'], ['farm', '🐄 Farms, pins & distances'], ['cat', '🏷 Categories & ratings'], ['sync', '🔄 Sync & duplicates'], ['own', '⭐ Your own job lists']];
const KEEP_TYPES = [['on-farm', 'farm'], ['on-farm 50% shared', 'farm'], ['in-house', 'inhouse'], ['in-house FEC testing', 'fec'], ['phone appointment (15mins)', 'phone'], ['phone appointment (15mins - disc 33.3)', 'phone'], ['phone appointment (15 mins - disc 100%)', 'phone'], ['phone appointment (per minute)', 'phone']];
const KEEP_DEF = { farm: `{date} {initials} - {name}
Patient ID: {patientid}
Appointment type: {type}
Property name: {property}
Start time: {start}
Finish time: {finish}
Break (if applicable): {break}
Additional labour: {labour}
Travel type: {traveltype}
Travel distance: {travel}

Hx notes:
`, inhouse: `{date} {initials} - {name}
Patient ID: {patientid}
Appointment type: {type}
Start time: {start}
Finish time: {finish}
Break (if applicable): {break}
Additional labour: {labour}

Hx notes:
`, phone: `{date} {initials} - {name}
Patient ID: {patientid}
Appointment type: {type}
Time of phone call: {calltime}

Hx notes:
`, fec: `{date} {initials} - {name}
Patient ID: {patientid}
Appointment type: {type}

Hx notes:
Bulk samples: {bulk}
Individual animal samples: {indiv}
FEC trays returned: {trays}
FEC kits dispensed: {kits}
` };
const KEEP_NAMES = { farm: 'On-farm appointments', inhouse: 'In-house appointments', phone: 'Phone appointments', fec: 'In-house FEC testing' };
const keepTpl = (k) => { const t = (D.settings.keepTpl || {})[k] ?? KEEP_DEF[k]; return /\{patientid\}/.test(t) || !/\nAppointment type:/.test(t) ? t : t.replace(/\nAppointment type:/, '\nPatient ID: {patientid}\nAppointment type:'); }; /* older saved templates get the patient ID line too */
const KEEP_INITS_DEF = ['JS', 'MW', 'AW', 'RN']; const keepInits = () => (D.settings.keepInits && D.settings.keepInits.length ? D.settings.keepInits : KEEP_INITS_DEF);
let JOBS_CACHE = null; const PC_LEFT = {}; let KEEP_STOPSEL = null; const KN_EP = { s: null, e: null };
function timePick5(k) { /* hour : minute (5-minute steps) am/pm — hour left blank = blank */ const st = 'style="padding:7px 4px;border:1px solid var(--line);border-radius:8px;font-size:16px"'; 
  return `<span class="kntime" style="display:inline-flex;gap:4px;align-items:center"><select data-ask="${k}_h" ${st}><option value="">--</option>${Array.from({ length: 12 }, (_, i) => `<option>${i + 1}</option>`).join('')}</select>:<select data-ask="${k}_m" ${st}>${Array.from({ length: 12 }, (_, i) => `<option>${String(i * 5).padStart(2, '0')}</option>`).join('')}</select><span class="apsw"><label><input type="radio" name="ap-${k}" data-ask="${k}_ap" value="am"><span>AM</span></label><label><input type="radio" name="ap-${k}" data-ask="${k}_ap" value="pm"><span>PM</span></label></span></span>`; } const PCQ_JOBS = ['pincheck', 'pincheckin', 'homename', 'nogps', 'turnadd']; // jobs that open the farm's map with name, pins, users and save & next
const jobTitle = (t, n) => (PC_LEFT[t] != null && /^(pincheck|svcheck)/.test(t) ? JOB_TYPES[t].t.replace(/\s*\(20 at a time\)/, '') + ` (${n} of ${PC_LEFT[t]} left)` : JOB_TYPES[t].t);
function jobs() { if (!JOBS_CACHE) { const off = new Set([...(PREF.jobsOff || []), ...jobsGone()]); JOBS_CACHE = computeJobs().filter((j) => !off.has(j.type)); } return JOBS_CACHE; } // job types switched off in Settings are hidden on this device
const INACT = ['inactive', 'dna'];
function jobInactive(j) { /* is this job about an inactive / do-not-answer client? (they go in the Inactive list so active clients come first) */
  if (j.type === 'pincheckin') return true; if (j.type === 'pincheck') return false;
  if (j.relSugs) return [...new Set(j.relSugs.flatMap((x) => [x.a, x.b]))].every((id) => { const c = D.contacts.find((y) => y.id === id); return c && INACT.includes(catOf(c)); });
  if (j.kind === 'business') { const b = IDX.biz.get(j.id); return !!b && INACT.includes(bizCat(b)); }
  const c = D.contacts.find((x) => x.id === j.id); return !!c && INACT.includes(catOf(c)); }
function jobsShown() { const v = S.jobAct || 'active'; return v === 'all' ? jobs() : jobs().filter((j) => jobInactive(j) === (v === 'inactive')); }
function jobsFor(kind, id) { return jobs().filter((j) => j.id === id && (j.kind === kind || (kind === 'contact' && false))); }

/* ---------------- rendering: shell ---------------- */
const TABS = [['contacts', 'People'], ['biz', 'Businesses'], ['loc', 'Pins'], ['search', 'Search & Bulk Edit'], ['route', 'Plan Route'], ['jobs', 'Jobs'], ['settings', 'Settings']];
function renderTabs() {
  const n = jobs().filter((j) => !jobInactive(j)).length;
  $('#tabs').innerHTML = TABS.map(([k]) => { const l = lab(k); return `<button data-act="tab" data-v="${k}" class="${S.tab === k ? 'on' : ''}">${ICONS[k]}<span>${l}</span>${k === 'jobs' && n ? `<span class="badge">${n}</span>` : ''}</button>`; }).join('');
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
function setOwn(c, v) { /* this person's own category, even if it matches the business */ c.tags = c.tags.filter((t) => !isCatTag(t) && !RATING_SET.has(t)); c.ownCats = true; if (v) c.tags.push(v); touch(c); }
const catChoices = () => [...RATINGS, ...D.tags.filter((t) => t.group === 'client' && !INACT.includes(t.id)).map((t) => t.id)];
async function inactFlowFor(K) { const X = K.cat, R = K.field, BY = K.by, PV = K.prev, FL = K.fol; /* business inactive → reason on the business, then choose for each person; person inactive → maybe the business too; business back → bring people back */
  const rad = 'style="display:flex;gap:8px;align-items:center;margin:5px 0;font-size:15px"'; const sel = 'style="padding:6px;border:1px solid var(--line);border-radius:8px;font-size:14px;max-width:100%"';
  const catSel = (name, v) => `<select data-ask="${name}" ${sel}>${catChoices().map((x) => `<option value="${x}" ${x === v ? 'selected' : ''}>${h(tagName(x))}</option>`).join('')}</select>`;
  const curPeople = (b) => (IDX.bizContacts.get(b.id) || []);
  // 1. a person made inactive who is the business's only or primary contact → the business too?
  for (const c of D.contacts) { const was = CATSNAP.get(c.id); if (was === undefined || was === X || catOf(c) !== X || followsBiz(c)) continue;
    for (const b of bizOf(c)) { if (bizCat(b) === X || BIZSNAP.get(b.id) === X) continue; const ppl = curPeople(b); const only = ppl.length === 1 && ppl[0] === c, prim = b.primaryContact === c.id; if (!only && !prim) continue;
      const r = await askBox(`Make the business ${K.word} too?`, `<p><b>${h(fullName(c))}</b> is ${only ? 'the only current contact' : 'the primary contact'} for <b>${h(b.name)}</b>. Make ${h(b.name)} ${K.word} too?</p>`, `Yes — make the business ${K.word}`, false, 'No — just this person');
      if (r) { setBizCat(b, X); if (!b[R] && c[R]) b[R] = c[R]; c[BY] = b.id; touch(b); touch(c); reindex(); } } }
  // 2. businesses made inactive
  for (const b of D.businesses) { const was = BIZSNAP.get(b.id); if (was === undefined || was === X || bizCat(b) !== X) continue;
    if (!(b[R] || '').trim()) { const r = await askBox(`Reason — ${b.name} is ${K.word}`, `<p>Why is <b>${h(b.name)}</b> being made ${K.word}? It shows in a red box at the top of the business.</p>${K.chips ? reasonChips('#askbox textarea') : ''}<textarea class="warn" data-ask="why" style="width:100%;min-height:70px;font-size:16px;padding:9px;border-radius:9px"></textarea>`, 'Next', false, 'Cancel');
      const why = (ASK_FORM.why || '').trim(); if (!r || !why) { if (r) toast('A reason is required'); return false; } b[R] = why; touch(b); }
    const ppl = curPeople(b).filter((c) => CATSNAP.get(c.id) !== X && !(c[BY] === b.id && !followsBiz(c) && catOf(c) === X)); if (!ppl.length) continue;
    const others = (c) => bizOf(c).filter((x) => x !== b && !INACT.includes(bizCat(x)));
    const row = (c, i) => { const fol = followsBiz(c); const ob = others(c); const def = ob.length ? 'keep' : 'inactive';
      return `<div class="inrow" style="border:1px solid var(--line);border-radius:9px;padding:8px;margin:6px 0"><div style="font-weight:700">${h(fullName(c))} <span class="hint">${h(tagName(CATSNAP.get(c.id) || '') || 'no category')}${ob.length ? ' · also with ' + h(ob.map((x) => x.name).join(', ')) + ' (active)' : ''}</span></div>
        <select class="in-ch" data-ask="p${i}" ${sel} onchange="var k=this.closest('.inrow').querySelector('.in-cat');if(k)k.hidden=this.value!=='keep'"><option value="inactive" ${def === 'inactive' ? 'selected' : ''}>Make ${K.word} too</option><option value="keep" ${def === 'keep' ? 'selected' : ''}>Keep active</option><option value="left">They've left ${h(b.name)}</option></select>
        ${chosenPhoto(c) ? `<div style="margin-top:6px"><span class="hint">Photo (now ${h(photoNow(c))}): </span><select data-ask="iph${i}" ${sel}><option value="auto">Automatic</option><option value="leave">Leave as it is</option></select></div>` : ''}
        ${fol ? `<div class="in-cat" ${def === 'keep' ? '' : 'hidden'} style="margin-top:6px"><span class="hint">Keep them as: </span>${catSel('cat' + i, CATSNAP.get(c.id) && !INACT.includes(CATSNAP.get(c.id)) ? CATSNAP.get(c.id) : (was && !INACT.includes(was) ? was : catChoices()[0]))}</div>` : ''}</div>`; };
    const r = await askBox('People at ' + b.name, `<p>${h(b.name)} is now <b>${K.word}</b>. What about its people?</p>
      <div class="f" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="lbl" style="margin:0">Set everyone to</span><select ${sel} onchange="var v=this.value;if(!v)return;document.querySelectorAll('#askbox .in-ch').forEach(function(s){s.value=v;s.dispatchEvent(new Event('change'))});this.value=''"><option value="">— choose —</option><option value="inactive">Make ${K.word} too</option><option value="keep">Keep active</option><option value="left">They've left</option></select></div>
      ${ppl.map(row).join('')}
      <div class="f" style="margin-top:10px"><span class="lbl">Reason for the people made ${K.word}</span><label ${rad}><input type="radio" name="in-r" data-ask="rmode" value="same" checked onchange="document.getElementById('in-rdiff').hidden=true"> The same as the business: <i>${h(b[R])}</i></label><label ${rad}><input type="radio" name="in-r" data-ask="rmode" value="diff" onchange="document.getElementById('in-rdiff').hidden=false"> A different reason</label>
        <div id="in-rdiff" hidden>${K.chips ? reasonChips('#in-rtxt') : ''}<textarea id="in-rtxt" class="warn" data-ask="rtxt" style="width:100%;min-height:60px;font-size:16px;padding:9px;border-radius:9px"></textarea></div></div>`, 'Save', false, 'Cancel');
    if (!r) return false; const why = ASK_FORM.rmode === 'diff' ? (ASK_FORM.rtxt || '').trim() : b[R]; if (!why) { toast('Please add the reason for the people'); return false; }
    ppl.forEach((c, i) => { const ch = ASK_FORM['p' + i] || 'inactive'; const prev = CATSNAP.get(c.id) || '';
      if (ch === 'inactive') { c[PV] = prev; c[FL] = followsBiz(c); c[BY] = b.id; setOwn(c, X); c[R] = why; touch(c); }
      else if (ch === 'keep') { if (followsBiz(c)) setOwn(c, ASK_FORM['cat' + i] || prev); }
      else if (ch === 'left') { c.links = c.links.map((l) => (l.bid === b.id ? { ...l, past: true } : l)); touch(c); }
      if (chosenPhoto(c)) { if ((ASK_FORM['iph' + i] || 'auto') === 'auto') c.photoChoice = 'auto'; reindex(); c.photoCats = catSig(c); if (!chosenPhoto(c)) delete c.photoCats; touch(c); } });
    if (chosenPhoto(b)) { reindex(); b.photoCats = bizSig(b); touch(b); }
    reindex(); }
  // 3. businesses made active again → bring people back?
  for (const b of D.businesses) { const was = BIZSNAP.get(b.id); if (was !== X || INACT.includes(bizCat(b))) continue;
    const ppl = curPeople(b).filter((c) => catOf(c) === X); if (!ppl.length) continue;
    const row = (c, i) => { const on = c[BY] === b.id; const def = c[FL] ? '__follow' : (c[PV] && !INACT.includes(c[PV]) ? c[PV] : bizCat(b) || catChoices()[0]);
      return `<div class="inrow" style="border:1px solid var(--line);border-radius:9px;padding:8px;margin:6px 0"><label ${rad}><input type="checkbox" data-askchk="back${i}" ${on ? 'checked' : ''}> <b>${h(fullName(c))}</b> <span class="hint">${on ? `made ${K.word} with the business` : K.word + (c[R] ? ': ' + h(c[R]) : '')}</span></label>
        <span class="hint">Bring back as: </span><select data-ask="bcat${i}" ${sel}><option value="__follow" ${def === '__follow' ? 'selected' : ''}>Same as the business (${h(tagName(bizCat(b)) || 'none')})</option>${catChoices().map((x) => `<option value="${x}" ${x === def ? 'selected' : ''}>${h(tagName(x))}</option>`).join('')}</select></div>`; };
    const r = await askBox('Bring people back?', `<p><b>${h(b.name)}</b> is no longer ${K.word}. Tick the people to bring back too.</p>${ppl.map(row).join('')}`, 'Save', false, 'Skip — leave the people as they are');
    if (!r) continue; ppl.forEach((c, i) => { if (!ASK_FORM['back' + i]) return; const v = ASK_FORM['bcat' + i]; if (v === '__follow') { c.tags = c.tags.filter((t) => !isCatTag(t) && !RATING_SET.has(t)); c.ownCats = false; } else setOwn(c, v); delete c[R]; delete c[BY]; delete c[PV]; delete c[FL]; touch(c); }); reindex(); }
  return true; }
async function inactFlow() { for (const K of [{ cat: 'inactive', field: 'inactiveReason', by: 'inactBy', prev: 'inactPrev', fol: 'inactFollow', word: 'inactive', chips: true }, { cat: 'dna', field: 'dnaReason', by: 'dnaBy', prev: 'dnaPrev', fol: 'dnaFollow', word: '“Do not answer”' }]) { if (!(await inactFlowFor(K))) return false; } return true; }
async function photoFlow() { /* a chosen photo whose categories have changed → ask what to do (one pop-up for everyone) */
  const base = (k, r) => { const v = BASE.get(k + ':' + r.id); try { return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  TOUCHED.forEach((r) => { const k = recKind(r); if (k !== 'contacts' && k !== 'businesses') return; const o = base(k, r); if (chosenPhoto(r) && (!o || o.photoChoice !== r.photoChoice)) r.photoCats = k === 'contacts' ? catSig(r) : bizSig(r); });
  const touchedB = new Set([...TOUCHED].filter((r) => recKind(r) === 'businesses').map((r) => r.id));
  const ppl = D.contacts.filter((c) => chosenPhoto(c) && c.photoCats != null && c.photoCats !== catSig(c) && (TOUCHED.has(c) || c.links.some((l) => touchedB.has(l.bid))));
  const bzs = D.businesses.filter((b) => chosenPhoto(b) && b.photoCats != null && b.photoCats !== bizSig(b) && (TOUCHED.has(b) || (IDX.bizContacts.get(b.id) || []).some((c) => TOUCHED.has(c))));
  if (!ppl.length && !bzs.length) return true;
  const items = [...ppl.map((c) => ({ c, name: fullName(c), cats: catSig(c).split(',').filter(Boolean) })), ...bzs.map((b) => ({ b, name: b.name + ' (business photo)', cats: bizSplitCats(b) }))];
  const sel = 'style="padding:6px;border:1px solid var(--line);border-radius:8px;font-size:14px;max-width:100%"';
  const r = await askBox('Check these photos', `<p>Categories have changed for ${items.length === 1 ? 'someone who has' : 'people who have'} a chosen photo. What should ${items.length === 1 ? 'it' : 'each'} show now?</p>
    ${items.length > 1 ? `<div class="f" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="lbl" style="margin:0">Set all to</span><select ${sel} onchange="var v=this.value;if(!v)return;document.querySelectorAll('#askbox .ph-ch').forEach(function(s){if([].some.call(s.options,function(o){return o.value===v}))s.value=v});this.value=''"><option value="">— choose —</option><option value="auto">Automatic</option><option value="leave">Leave as it is</option></select></div>` : ''}
    ${items.map((it, i) => { const x = it.c || it.b; const op = photoOpts(it.cats); const two = it.cats.filter((t) => tagPhotoSrc(t)); const def = two.length === 2 ? 'split:' + two[0] + ',' + two[1] : 'auto';
      return `<div style="border:1px solid var(--line);border-radius:9px;padding:8px;margin:6px 0"><div style="font-weight:700">${h(it.name)}</div><div class="hint">Photo now: ${h(photoNow(x))} · categories now: ${h(it.cats.map(tagName).join(', ') || 'none')}</div><select class="ph-ch" data-ask="ph${i}" ${sel}>${op.map(([v, l]) => `<option value="${v}" ${v === def ? 'selected' : ''}>${h(l)}</option>`).join('')}</select></div>`; }).join('')}`, 'Save', false, 'Leave them all as they are');
  items.forEach((it, i) => { const x = it.c || it.b; const v = r ? ASK_FORM['ph' + i] : 'leave'; if (v && v !== 'leave') { if (v === 'auto') x.photoChoice = it.c ? 'auto' : undefined; else x.photoChoice = v; if (it.b && v === 'auto') delete x.photoChoice; } x.photoCats = it.c ? catSig(x) : bizSig(x); if (!chosenPhoto(x)) delete x.photoCats; touch(x); }); photoCache.clear(); return true; }
async function changed() {
  JOBS_CACHE = null; reindex();
  if (BASE.size && BIZSNAP.size && CATSNAP.size) { const ok = (await inactFlow()) && (await photoFlow()); if (!ok) { S.advSelPending = false; revertTouched(); NEXT_LOG_LABEL = null; S.skipConfirm = false; JOBS_CACHE = null; reindex(); photoCache.clear(); renderAll(); toast('Cancelled — nothing was changed'); return false; } }
  if (BASE.size && typeof diffTouched === 'function') {
    for (const [cat, field, title, ph] of [['dna', 'dnaReason', 'Reason for "Do not answer"', ""], ['inactive', 'inactiveReason', 'Reason for inactivating', '']]) {
      const need = newWithoutReason(cat, field); if (!need.length) continue;
      const names = need.map((r) => (recKind(r) === 'contacts' ? fullName(r) : r.name));
      const reason = await askBox(title, `<p style="font-size:16px">A reason is required when marking ${h(names.slice(0, 10).join(', '))}${names.length > 10 ? ` and ${names.length - 10} more` : ''} as <b>${cat === 'dna' ? 'Do not answer' : 'Inactive'}</b>. It shows in a red box at the top of their contact.</p>${cat === 'inactive' ? reasonChips('#askbox textarea') : ''}<textarea class="warn" style="width:100%;min-height:90px;padding:10px;border-radius:9px;border:1px solid #f3b3b6;font-size:16px"></textarea>`, 'Save reason');
      if (typeof reason !== 'string' || !reason) { S.advSelPending = false; revertTouched(); NEXT_LOG_LABEL = null; S.skipConfirm = false; JOBS_CACHE = null; reindex(); photoCache.clear(); renderAll(); toast(reason === true ? 'A reason is required — nothing was changed' : 'Cancelled — nothing was changed'); return false; }
      need.forEach((r) => { r[field] = reason; touch(r); });
    }
  }
  if (BASE.size && BIZSNAP.size) { const off = (v) => INACT.includes(v || ''); // a business made inactive / do not answer → its farms go "not current"; back to active → they come back
    for (const b of D.businesses) { const was = BIZSNAP.get(b.id), now = bizCat(b); if (was === undefined || off(was) === off(now)) continue;
      if (off(now)) { for (const l of b.farmLinks.filter((x) => !x.past)) { const f = IDX.farms.get(l.fid); l.past = true; l.autoPast = true; touch(b); if (!f) continue;
          const others = farmUsersOf(f.id).filter((u) => u.b !== b && !u.past && !off(bizCat(u.b))); const ownsIt = (f.owner && f.owner.bid === b.id) || (!f.owner && IDX.farmBiz.get(f.id) === b);
          if (ownsIt && others.length) { const rad = 'style="display:flex;gap:8px;align-items:center;margin:6px 0;font-size:16px"';
            const r = await askBox('Who owns it now?', `<p><b>${h(b.name)}</b> is now ${now === 'dna' ? 'do not answer' : 'inactive'}, so <b>${h(f.name || 'this farm')}</b> is no longer current for them. Other businesses still use it — who owns it now?</p>${others.map((u, i) => `<label ${rad}><input type="radio" name="own" data-ask="own" value="b:${u.b.id}" ${i ? '' : 'checked'}> ${h(u.b.name)}</label>`).join('')}<label ${rad}><input type="radio" name="own" data-ask="own" value="keep"> Leave ${h(b.name)} as the owner</label><label ${rad}><input type="radio" name="own" data-ask="own" value="other" id="own-other"> Someone else: <input id="own-q" autocomplete="off" placeholder="🔍 Search businesses" style="flex:1;padding:6px;border:1px solid var(--line);border-radius:8px"></label><input type="hidden" data-ask="ownPick" id="own-pick"><div id="own-res"></div>`, 'Save owner', false, 'Skip');
            if (r) { const v = ASK_FORM.own; if (v && v.startsWith('b:')) f.owner = { bid: v.slice(2) }; else if (v === 'other' && ASK_FORM.ownPick) f.owner = { bid: ASK_FORM.ownPick }; touch(f); } } } }
      else b.farmLinks.forEach((l) => { if (l.past && l.autoPast) { delete l.past; delete l.autoPast; touch(b); } }); }
    reindex(); }
  if (!S.skipConfirm && BASE.size && typeof diffTouched === 'function') {
    const items = [...diffTouched(false), ...PENDING_DEL];
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
      <div class="actions" style="margin-top:16px"><button class="btn ${danger ? 'red' : 'primary'}" data-act="ask-yes" style="font-size:17px;padding:11px 16px">${h(okLabel)}</button>${altLabel ? `<button class="btn primary" data-act="ask-alt" style="font-size:17px;padding:11px 16px">${h(altLabel)}</button>` : ''}<button class="btn" data-act="ask-no">${h(noLabel)}</button></div>${jobCtxBtn()}</div></div>`;
    document.body.appendChild(bg); CONFIRM = { res }; try { safePush({ ask: 1 }); } catch (e) { } updateBackBtn();
  });
}
let ASK_FORM = {};
function closeAsk(v, fromPop) { if (!CONFIRM) return; const r = CONFIRM.res; CONFIRM = null; const el = $('#askbox'); ASK_FORM = {}; if (el) { el.querySelectorAll('[data-ask]').forEach((x) => { if (x.type === 'radio' && !x.checked) return; ASK_FORM[x.dataset.ask] = x.value; }); el.querySelectorAll('[data-askchk]').forEach((x) => (ASK_FORM[x.dataset.askchk] = x.checked)); } const ta = el && el.querySelector('textarea'); if (v === true && ta) v = ta.value.trim() || true; if (el) el.remove(); if (!fromPop) { NAV.ignorePop++; history.back(); } updateBackBtn(); r(v); }
document.addEventListener('click', (e) => { const el = e.target.closest('[data-act=ask-yes],[data-act=ask-no],[data-act=ask-alt]'); if (!el) return; e.stopPropagation(); closeAsk(el.dataset.act === 'ask-yes' ? true : el.dataset.act === 'ask-alt' ? 'alt' : false); }, true);
const askText = (t) => `<p style="font-size:16px;line-height:1.45;white-space:pre-wrap">${h(t)}</p>`;
async function ask(msg, okLabel, danger) { const ok = await askBox('Please confirm', askText(msg), okLabel || 'Yes — go ahead', danger); if (ok) { S.skipConfirm = true; setTimeout(() => (S.skipConfirm = false), 0); } return ok; } // already confirmed → no second pop-up
function updateBackBtn() { const b = $('#hdr-back'); if (b) b.style.display = CONFIRM || SHEET || (NAV.stack && NAV.stack.length) ? '' : 'none'; }

/* ---------------- back navigation (in-app Back button + phone/browser back) ---------------- */
const NAV = { last: null, stack: [], restoring: false, ignorePop: 0 };
/* a pop-up closing goes "back" in the browser history; that happens a moment later, so a pop-up opened straight after
   must wait for it — otherwise the next Back can leave the app */
const PUSHQ = [];
function flushPush(force) { if (NAV.ignorePop > 0 && !force) return; if (force) NAV.ignorePop = 0; while (PUSHQ.length) { try { history.pushState(PUSHQ.shift(), ''); } catch (e) { } } }
function safePush(st) { if (NAV.ignorePop > 0) { PUSHQ.push(st); setTimeout(() => { if (PUSHQ.length) flushPush(true); }, 700); return; } try { history.pushState(st, ''); } catch (e) { } }
const navKey = () => S.tab + '|' + (S.sel ? S.sel.kind + ':' + S.sel.id : '');
function navRecord() {
  const k = navKey();
  if (NAV.last && k !== NAV.last.key && !NAV.restoring) {
    NAV.stack.push(NAV.last); if (NAV.stack.length > 60) NAV.stack.shift();
    try { safePush({ bvt: NAV.stack.length }); } catch (e) { }
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
function renderAll() { try { applyBoxStyles(); } catch (e) { }
  navRecord(); updateBackBtn();
  renderTabs();
  const main = $('#main');
  if (S.tab === 'map') S.tab = 'route'; /* the farm map now lives at the bottom of Plan Route */
  main.classList.toggle('single', ['search', 'route', 'jobs', 'settings'].includes(S.tab));
  if (S.tab === 'biz') { renderBizList(); renderDetail(); }
  else if (S.tab === 'contacts') { renderContactList(); renderDetail(); }
  else if (S.tab === 'loc') { renderLocList(); renderDetail(); }
  else if (S.tab === 'search') { $('#list').innerHTML = renderAdvanced(); applyPageEd('search'); document.body.classList.remove('show-detail'); }
  else if (S.tab === 'route') { if (FMAP) { FMAP.remove(); FMAP = null; FMAP_LAYER = null; } $('#list').innerHTML = renderRoute(); applyPageEd('route'); document.body.classList.remove('show-detail'); renderMapTab(); }
  else if (S.tab === 'jobs') { $('#list').innerHTML = renderJobs(); applyPageEd('jobs'); document.body.classList.remove('show-detail'); setTimeout(pcqAuto, 60); }
  else if (S.tab === 'settings') { $('#list').innerHTML = renderSettings(); collapseSettings(); document.body.classList.remove('show-detail'); }
  { const ch = document.querySelector('#list .chips'), on = ch && ch.querySelector('.chip.on'); if (on) ch.scrollLeft = Math.max(0, on.offsetLeft - ch.offsetLeft - 24); } /* keep the chosen toggle in view on phones */
  renderSyncPill(); conflictLock();
}



/* ---------------- Locations: every pin (yards, turn-offs, other locations) ---------------- */
function allPins() { /* one row per pin: the farm's main pin, its turn-off and any extra pins */
  const out = [];
  D.farms.forEach((f) => { const us = farmUsersOf(f.id); if (!us.length) return; const cur = us.filter((u) => !u.past); const b = (cur[0] || us[0]).b;     const base = { f, b, us, cur: cur.length > 0 };
    if (f.lat != null || !(f.turn && f.turn.lat != null)) out.push({ ...base, key: f.id, kind: isYardType(f.pinType) ? 'yard' : 'other', emoji: pinT(f.pinType).emoji, type: pinT(f.pinType).name, name: f.name || pinT(f.pinType).name, lat: f.lat, lng: f.lng });
    if (f.turn && f.turn.lat != null) out.push({ ...base, key: f.id + ':turn', kind: 'turn', emoji: turnPin().emoji, type: turnName(), name: (f.name || 'Farm') + ' — ' + turnName().toLowerCase(), lat: f.turn.lat, lng: f.turn.lng });
    (f.extra || []).forEach((x) => out.push({ ...base, key: f.id + ':' + x.id, kind: x.type === 'turn' ? 'turn' : isYardType(x.type) ? 'yard' : 'other', emoji: pinT(x.type).emoji, type: pinT(x.type).name, name: (x.name || pinT(x.type).name) + (f.name ? ' — ' + f.name : ''), lat: x.lat, lng: x.lng }));
  });
  return out;
}
/* Redraw a list without rebuilding its search box: the box being typed in stays the same element,
   so the phone keyboard's word prediction (IME composition) isn't confused into repeating letters. */
function patchList(list, html, inputId) {
  const old = list.querySelector('#' + inputId);
  if (!old) { list.innerHTML = html; return; }
  const tpl = document.createElement('div'); tpl.innerHTML = html;
  const nw = tpl.querySelector('#' + inputId);
  const chain = (n, root) => { const a = []; while (n && n !== root) { a.push(n); n = n.parentNode; } return n === root ? a : null; };
  const co = nw && chain(old, list), cn = nw && chain(nw, tpl);
  if (!co || !cn || co.length !== cn.length) { list.innerHTML = html; return; }
  ['placeholder', 'title'].forEach((a) => { const v = nw.getAttribute(a); if (v == null) old.removeAttribute(a); else if (old.getAttribute(a) !== v) old.setAttribute(a, v); });
  for (let i = co.length - 1; i >= 0; i--) {
    const pOld = i === co.length - 1 ? list : co[i + 1], pNew = i === cn.length - 1 ? tpl : cn[i + 1], kO = co[i], kN = cn[i];
    while (pOld.firstChild !== kO) pOld.removeChild(pOld.firstChild);
    while (kO.nextSibling) pOld.removeChild(kO.nextSibling);
    let seen = false; const before = [], after = [];
    [...pNew.childNodes].forEach((n) => { if (n === kN) seen = true; else (seen ? after : before).push(n); });
    before.forEach((n) => pOld.insertBefore(n, kO)); after.forEach((n) => pOld.appendChild(n));
    if (i > 0 && kO.className !== kN.className) kO.className = kN.className;
  }
}
function renderLocList() {
  const keepFocus = document.activeElement && document.activeElement.id === 'lq';
  const lt = S.ltype || 'all'; const showPast = !!S.lpast; const pq = parseQuery(S.lq || '');
  const pins = allPins(); const cnt = (k) => pins.filter((p) => (showPast || p.cur) && (k === 'all' || p.kind === k)).length;
  const rows = pins.filter((p) => (showPast || p.cur) && (lt === 'all' || p.kind === lt) && matchQ(locHay(p), pq))
    .sort((x, y) => alphaCmp(x.b.name, y.b.name) || alphaCmp(x.name, y.name));
  let html = `<div class="toolbar"><div class="search"><input id="lq" type="search" placeholder="${nameOnly() ? 'Search location or business names…' : 'Search locations, businesses or addresses…'}" value="${h(S.lq || '')}" autocomplete="off"></div>
    <div class="chips">${[['all', 'All pins', '📍'], ['yard', 'Yard pins', '🐄'], ['turn', turnName() + ' pins', turnPin().emoji], ['other', 'Non-farm locations', '🏬']].map(([v, l, ic]) => `<button class="chip ${lt === v ? 'on' : ''}" data-act="ltype" data-v="${v}"><span class="ci">${ic}</span>${l}<span class="cn">${cnt(v)}</span></button>`).join('')}</div>
    <div class="row2"><span>${rows.length} pin${rows.length === 1 ? '' : 's'}</span>${NAMEONLY_BOX()}<label style="font-weight:600"><input type="checkbox" data-act="lpast" ${showPast ? 'checked' : ''}> Include not current</label><button class="btn small" data-act="loc-map">🗺 Show these on the map</button></div></div><ul class="list">`;
  rows.slice(0, 500).forEach((p) => { const sf = p.f.safety || {};
    html += `<li class="item ${S.sel?.id === p.b.id && S.selFarm === p.f.id ? 'sel' : ''}" data-act="loc-open" data-bid="${p.b.id}" data-fid="${p.f.id}"><div class="av locav">${p.emoji}</div><div class="t"><div class="n">${h(p.name)}${p.cur ? '' : ' <span class="hint">(not current)</span>'}${sf.status && sf.status !== 'ok' ? (sf.status === 'stop' ? ' ⛔' : ' ⚠') : ''}${farmBiosecOf(p.f).length ? ' 🦠' : ''}</div><div class="s">${h(p.us.filter((u) => showPast || !u.past).map((u) => u.b.name).join(', '))} · ${h(p.type)}${p.lat == null ? ' · <b>no GPS pin</b>' : p.kind !== 'turn' && p.f.kmReturn != null ? ' · ' + p.f.kmReturn + ' km' : ''}</div></div>${p.lat != null ? `<a class="btn small" href="${gmapsNav(p)}" target="_blank" rel="noopener" title="Navigate">🧭</a>` : ''}</li>`; });
  if (rows.length > 500) html += '<li class="empty">Showing first 500 — search to narrow it down.</li>';
  if (!rows.length) html += '<li class="empty">No locations match.</li>';
  patchList($('#list'), html + '</ul>', 'lq');
  if (keepFocus && document.activeElement?.id !== 'lq') { const q = $('#lq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}
document.addEventListener('change', (e) => { if (e.target.classList && e.target.classList.contains('picin')) e.target.value = e.target.value.toUpperCase().replace(/\s+/g, ''); });
document.addEventListener('input', (e) => { if (e.target.id === 'lq') { S.lq = e.target.value; clearTimeout(e.target._tm); e.target._tm = setTimeout(renderLocList, 120); } });

/* ---------------- farm map (Leaflet + OpenStreetMap; needs internet for the map tiles) ---------------- */
let FMAP = null, FMAP_LAYER = null, LEAFLET_P = null;
function loadLeaflet() { if (window.L) return Promise.resolve(); if (LEAFLET_P) return LEAFLET_P;
  LEAFLET_P = new Promise((res, rej) => { const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css'; document.head.appendChild(css); const sc = document.createElement('script'); sc.src = 'vendor/leaflet/leaflet.js'; sc.onload = () => res(); sc.onerror = () => { LEAFLET_P = null; rej(new Error('Map could not load')); }; document.head.appendChild(sc); }); return LEAFLET_P; }
function mapFarms() { const fl = S.mapF || (S.mapF = { cat: '', type: '', past: false, q: '' }); const q = (fl.q || '').toLowerCase().trim();
  const only = S.mapSel && S.mapSel.size ? S.mapSel : null;
  return D.farms.filter((f) => { if (only && !only.has(f.id)) return false; const us = farmUsersOf(f.id); const cur = us.filter((u) => !u.past); if (!us.length) return false; if (!fl.past && !cur.length) return false;
    if (fl.type && f.pinType !== fl.type && !(f.extra || []).some((x) => x.type === fl.type)) return false;
    const bs = (fl.past ? us : cur).map((u) => u.b);
    if (fl.cat === 'client' && !bs.some(isClientBiz)) return false; if (fl.cat === 'nonclient' && !bs.some((b) => !isClientBiz(b))) return false;
    if (fl.cat && !['client', 'nonclient'].includes(fl.cat) && !bs.some((b) => bizCat(b) === fl.cat)) return false;
    if (q && ![f.name, f.address, ...bs.map((b) => b.name)].join(' ').toLowerCase().includes(q)) return false;
    return f.lat != null || (f.turn && f.turn.lat != null) || (f.extra || []).some((x) => x.lat != null); }); }
function mapPickSheet() {
  S.mapPickSel = new Set(S.mapSel || []);
  openSheet('Choose farms to show', `<div class="hint" style="margin-bottom:6px">Tick the farms you want on the map, then tap <b>Show on map</b>. Search by farm, business or address.</div>
    <input id="mp-q" placeholder="🔍 Search farms or businesses" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:9px;font-size:16px">
    <div class="actions" style="margin:6px 0"><span class="hint" id="mp-n">${S.mapPickSel.size} chosen</span><button type="button" class="btn small" data-act="mp-clear">Clear all</button></div>
    <div id="mp-list" class="checks" style="flex-direction:column;align-items:stretch">${mapPickList('')}</div>`, () => true, '<button class="btn primary" data-act="mp-done">Show on map</button>');
  $('#sheet-save').style.display = 'none'; setTimeout(() => $('#mp-q') && $('#mp-q').focus(), 50);
}
function mapPickList(q) { const pq = parseQuery(q || ''); const fs = D.farms.filter((f) => farmUsersOf(f.id).length && (f.lat != null || (f.turn && f.turn.lat != null)) && matchQ([f.name, f.address, ...farmUsersOf(f.id).map((u) => u.b.name)].join(' ').toLowerCase(), pq));
  fs.sort((a, b) => (S.mapPickSel.has(b.id) - S.mapPickSel.has(a.id)) || alphaCmp(farmLabel(a), farmLabel(b)));
  return fs.slice(0, 150).map((f) => `<label style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)"><input type="checkbox" class="mp-c" value="${f.id}" ${S.mapPickSel.has(f.id) ? 'checked' : ''}><span>${pinT(f.pinType).emoji} <b>${h(farmUsersOf(f.id).map((u) => u.b.name).join(', '))}</b>${f.name ? ' — ' + h(f.name) : ''}<br><span class="hint">${h(f.address || '')}</span></span></label>`).join('') + (fs.length > 150 ? '<div class="hint">Showing 150 — search to narrow it down.</div>' : '') || '<div class="hint">No farms match.</div>'; }
document.addEventListener('input', (e) => { if (e.target.id === 'mp-q') { const l = $('#mp-list'); if (l) l.innerHTML = mapPickList(e.target.value); } });
document.addEventListener('change', (e) => { if (!e.target.classList || !e.target.classList.contains('mp-c')) return; if (e.target.checked) S.mapPickSel.add(e.target.value); else S.mapPickSel.delete(e.target.value); const n = $('#mp-n'); if (n) n.textContent = S.mapPickSel.size + ' chosen'; });
function renderMapTab() {
  const fl = S.mapF || (S.mapF = { cat: '', type: '', past: false, q: '' }); const cats = [...RATINGS, ...D.tags.filter((t) => t.group === 'client').map((t) => t.id)];
  const n = mapFarms().length;
  const host = $('#routemap'); if (!host) return;
  if (!$('#fmap') || !FMAP) {
    host.innerHTML = `<div class="d-wrap" style="max-width:none;padding-bottom:8px"><h2 class="sec-h" style="font-size:22px;margin-bottom:6px">🗺 ${h(lab('map'))}</h2>
      <div class="mapbar"><input id="map-q" value="${h(fl.q || '')}" placeholder="Search farm or business"><select data-mapf="cat"><option value="">All businesses</option><option value="client">Client businesses</option><option value="nonclient">Non-client businesses</option>${cats.map((c) => `<option value="${h(c)}">${h(tagName(c))}</option>`).join('')}</select><select data-mapf="type"><option value="">All pin types</option>${pinTypes().map((t) => `<option value="${h(t.id)}">${t.emoji} ${h(t.name)}</option>`).join('')}</select><label class="hint" style="display:flex;align-items:center;gap:4px"><input type="checkbox" data-mapf="past"> Include not current</label><button class="btn small" data-act="map-me">◎ Near me</button><button class="btn small" data-act="map-pick">☑ Choose farms…</button><span id="map-only"></span><span class="hint" id="map-n"></span></div>
      <div id="fmap"></div><div class="hint" style="margin-top:4px">Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors. Needs internet for the map itself. Zoom in to see turn-offs and extra pins.</div></div>`;
    document.querySelectorAll('[data-mapf]').forEach((x) => { const k = x.dataset.mapf; if (x.type === 'checkbox') x.checked = !!fl[k]; else x.value = fl[k] || ''; });
    { const pc = peCfg('route'), hd2 = host.querySelector('h2'); if (hd2 && (pc.names || {}).farmmap) hd2.textContent = '🗺 ' + pc.names.farmmap; if (hd2 && (pc.size || {}).farmmap) hd2.style.fontSize = pc.size.farmmap + 'px'; if (hd2 && host.classList.contains('pefold')) { hd2.classList.add('pefoldh'); hd2.dataset.pek = 'routefarmmap'; } }
    FMAP = null; buildMap();
  } else { drawMapPins(); }
  const mn = $('#map-n'); if (mn) mn.textContent = `${n} farm${n === 1 ? '' : 's'}`; mapOnlyBadge();
}
function mapOnlyBadge() { const el = $('#map-only'); if (!el) return; el.innerHTML = S.mapSel && S.mapSel.size ? `<span class="pill" style="background:var(--ink);color:#fff">Only ${S.mapSel.size} chosen farm${S.mapSel.size === 1 ? '' : 's'}</span> <button class="btn small" data-act="map-all">Show all</button>` : ''; }
function mapFit() { if (!FMAP) return; const pts = mapFarms().map((f) => (f.lat != null ? [f.lat, f.lng] : f.turn && f.turn.lat != null ? [f.turn.lat, f.turn.lng] : null)).filter(Boolean); if (pts.length) FMAP.fitBounds(pts, { maxZoom: 14, padding: [30, 30] }); }
async function buildMap() {
  try { await loadLeaflet(); } catch (e) { const el = $('#fmap'); if (el) el.innerHTML = `<div class="empty">${h(e.message)} — check the internet connection.</div>`; return; }
  const el = $('#fmap'); if (!el || S.tab !== 'route') return;
  const home = D.settings.home || { lat: -34.97, lng: 117.99 }; const v = S.mapView || { c: [home.lat, home.lng], z: 9 };
  FMAP = L.map(el, { zoomControl: true }).setView(v.c, v.z);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(FMAP);
  const thisMap = FMAP; FMAP.on('moveend zoomend', () => { if (FMAP !== thisMap) return; S.mapView = { c: [FMAP.getCenter().lat, FMAP.getCenter().lng], z: FMAP.getZoom() }; if (FMAP._lastZ !== FMAP.getZoom()) { FMAP._lastZ = FMAP.getZoom(); drawMapPins(); } });
  if (home.lat != null) L.marker([home.lat, home.lng], { icon: L.divIcon({ className: '', html: '<div class="mpin home" title="Homebase">🏥</div>', iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(FMAP).bindPopup('<b>Bovitech homebase</b>');
  FMAP._lastZ = FMAP.getZoom(); drawMapPins(); if (S.mapFit) { S.mapFit = false; mapFit(); }
}
function drawMapPins() {
  if (!FMAP || !window.L) return; if (FMAP_LAYER) FMAP_LAYER.remove(); FMAP_LAYER = L.layerGroup().addTo(FMAP);
  const z = FMAP.getZoom(); const fl = S.mapF || {};
  const icon = (emo, cls, size = 30) => L.divIcon({ className: '', html: `<div class="mpin ${cls || ''}">${emo}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
  mapFarms().forEach((f) => {
    const sf = f.safety || {}; const cls = sf.status === 'stop' ? 'mstop' : sf.status === 'caution' ? 'mcaution' : farmBiosecOf(f).length ? 'bio' : ''; const pop = () => mapPopup(f);
    if (f.lat != null && (!fl.type || f.pinType === fl.type)) L.marker([f.lat, f.lng], { icon: icon(pinT(f.pinType).emoji, (cls + (f.yTbc ? ' tbc' : '')).trim()), title: farmLabel(f) }).addTo(FMAP_LAYER).bindPopup(pop, { maxWidth: 300 });
    if (z >= 12 || f.lat == null) { (f.extra || []).forEach((x) => { if (x.lat != null && (!fl.type || x.type === fl.type)) L.marker([x.lat, x.lng], { icon: icon(pinT(x.type).emoji, ((x.safety && x.safety.status && x.safety.status !== 'ok' ? 'm' + x.safety.status : '') + (x.tbc ? ' tbc' : '')).trim(), 26), title: x.name || pinT(x.type).name }).addTo(FMAP_LAYER).bindPopup(pop, { maxWidth: 300 }); });
      if (f.turn && f.turn.lat != null && !fl.type) L.marker([f.turn.lat, f.turn.lng], { icon: icon(turnPin().emoji, f.turnTbc ? 'turn tbc' : 'turn', 24), title: turnName() + ' — ' + farmLabel(f) }).addTo(FMAP_LAYER).bindPopup(pop, { maxWidth: 300 }); }
  });
}
function mapPopup(f) {
  const us = farmUsersOf(f.id); const sf = f.safety || {};
  return `<div class="mpop"><div style="font-weight:700;font-size:15px">${pinT(f.pinType).emoji} ${h(f.name || pinT(f.pinType).name)}</div>${f.address ? `<div class="hint">${h(f.address)}</div>` : ''}
    <div style="margin:4px 0">${us.map((u) => `<span class="lnk" data-act="map-open" data-id="${u.b.id}">${h(u.b.name)}</span>${u.past ? ' <span class="hint">(not current)</span>' : ''}`).join('<br>')}</div>
    ${sf.status && sf.status !== 'ok' ? `<div class="fsafety ${SAFETY[sf.status].c}" style="font-size:13px">${sf.status === 'stop' ? '⛔' : '⚠'} ${SAFETY[sf.status].l}${sf.note ? ' — ' + h(sf.note) : ''}</div>` : ''}
    ${farmBiosecOf(f).map((x) => `<div class="fbiosec" style="font-size:13px">🦠 ${h(x.txt)}</div>`).join('')}
    ${farmTurns(f).map((t) => `<div style="font-size:13px">${accessLine(t.acc, farmTurns(f).length > 1 ? t.name : '')}</div>`).join('')}
    <div class="hint">${fmtKm(f)}${f.driveMin != null ? ' · ' + fmtMin(f.driveMin) + ' each way' : ''}${f.reception && f.reception.status ? ' · 📶 ' + RECEPTION[f.reception.status] : ''}</div>
    <div class="actions" style="margin-top:6px"><a class="btn small" href="${gmapsNav(farmRoutePt(f))}" target="_blank" rel="noopener">🧭 Navigate</a>${f.lat != null ? `<button class="btn small" data-act="route-add" data-fid="${f.id}">➕ Route</button>` : ''}<button class="btn small" data-act="map-near" data-fid="${f.id}">Nearby</button></div></div>`;
}
document.addEventListener('change', (e) => { const t = e.target; if (!t.dataset || !('mapf' in t.dataset)) return; S.mapF = S.mapF || {}; S.mapF[t.dataset.mapf] = t.type === 'checkbox' ? t.checked : t.value; drawMapPins(); const n = mapFarms().length; const mn = $('#map-n'); if (mn) mn.textContent = `${n} farm${n === 1 ? '' : 's'}`; });
document.addEventListener('input', (e) => { if (e.target.id !== 'map-q') return; S.mapF = S.mapF || {}; S.mapF.q = e.target.value; clearTimeout(S.mapQT); S.mapQT = setTimeout(() => { drawMapPins(); const fs = mapFarms(); const mn = $('#map-n'); if (mn) mn.textContent = `${fs.length} farm${fs.length === 1 ? '' : 's'}`; if (FMAP && S.mapF.q && fs.length && fs.length <= 30) { const pts = fs.map((f) => (f.lat != null ? [f.lat, f.lng] : f.turn ? [f.turn.lat, f.turn.lng] : null)).filter(Boolean); if (pts.length) FMAP.fitBounds(pts, { maxZoom: 14, padding: [30, 30] }); } }, 350); });

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
    if (isFav(x.c) !== isFav(y.c)) return isFav(x.c) ? -1 : 1;
    if (x.g !== y.g) { if (S.sort === 'rating') { const d = rOrder(x.g) - rOrder(y.g); if (d) return d; } return alphaCmp(x.g || '', y.g || ''); }
    return alphaCmp(x.n, y.n);
  });
}
function tagChips() {
  const quick = [['starred', '★ Favourites'], ['warn', 'Has warnings'], ['multi', 'Multiple ratings'], ['split', 'Split photo'], ['flagged', 'Needs attention']];
  const tags = D.tags.filter((t) => t.id !== 'sheep' || D.contacts.some((c) => c.tags.includes('sheep')));
  return quick.map(([k, l]) => `<button class="chip quick ${S.quick[k] ? 'inc' : ''}" data-act="quick" data-v="${k}">${l}</button>`).join('') +
    tags.map((t) => `<button class="chip ${S.tagF[t.id] || ''}" data-act="tagf" data-v="${t.id}" title="Tap: include · tap again: exclude · again: off">${h(t.name)}</button>`).join('');
}
const CTYPES = [['all', 'All people', '✦'], ['client', 'Client people', '👤'], ['nonclient', 'Non-client people', '👥']]; const BTYPES = [['all', 'All businesses', '✦'], ['client', 'Client businesses', '🏡'], ['nonclient', 'Non-client businesses', '🏢']];
function ctypeSeg(biz) { const cur = biz ? (S.btype || 'all') : (S.ptype || 'all'); const n = biz ? { all: D.businesses.length, client: D.businesses.filter(isClientBiz).length, nonclient: D.businesses.filter((b) => !isClientBiz(b)).length } : { all: D.contacts.length, client: D.contacts.filter(isClientPerson).length, nonclient: D.contacts.filter((c) => !isClientPerson(c)).length };
  const cn = (peCfg(biz ? 'biz' : 'contacts').chips) || {}; return `<div class="chips">${(biz ? BTYPES : CTYPES).map(([v, l, ic]) => `<button class="chip ${cur === v ? 'on' : ''}" data-act="ctype" data-b="${biz ? 1 : ''}" data-v="${v}"><span class="ci">${ic}</span>${h(cn[v] || l)}<span class="cn">${n[v]}</span></button>`).join('')}</div>`; }
function bizRowHtml(b) { const cs = IDX.bizContacts.get(b.id) || []; const flagged = jobs().some((j) => j.kind === 'business' && j.id === b.id);
  return `<li class="item ${S.sel?.id === b.id ? 'sel' : ''}" data-act="open" data-kind="business" data-id="${b.id}">${contactPhotoImg(bizPseudo(b))}<div class="t"><div class="n">${b.rating ? rbadge(b.rating) : ''}${h(bizShow(b))}</div><div class="s">${isClientBiz(b) ? '' : '<b>Industry</b> · '}${cs.length} contact${cs.length === 1 ? '' : 's'} · ${b.farms.length} ${isClientBiz(b) ? 'farm' + (b.farms.length === 1 ? '' : 's') : 'location' + (b.farms.length === 1 ? '' : 's')}${cs.length ? ' · ' + h(cs.map((c) => c.first).join(', ')) : ''}</div></div>${flagged ? `<span style="color:var(--red)" title="Needs attention">${ICONS.flag}</span>` : ''}${b.warnings ? '<span class="wdot"></span>' : ''}</li>`; }
function renderContactList() {
  const list = $('#list');
  if (!D.contacts.length && (D.firstRun || !D.sync.fileId)) { list.innerHTML = firstRunHtml(); return; }
  const keepFocus = document.activeElement && document.activeElement.id === 'q';
  const pt = S.ptype || 'all'; const hideIn = S.hideIn.p !== false; const mix = false; const mixB = null; const all = filteredContacts().filter((c) => !hideIn || !['inactive', 'dna'].includes(catOf(c))); const rows = sortContacts(pt === 'all' ? all : all.filter((c) => (pt === 'client') === isClientPerson(c)));
  let html = `<div class="toolbar"><div class="search"><input id="q" type="search" placeholder="Search people…" title="Tip: use -word to exclude" value="${h(S.q)}" autocomplete="off"><button class="btn" data-act="go-adv" title="Advanced search">Advanced</button><button class="btn primary" data-act="new-contact">➕ New</button></div>
    ${ctypeSeg()}
    <div class="row2"><span>${rows.length} of ${D.contacts.length} people${mixB ? ` · ${mixB.length} business${mixB.length === 1 ? '' : 'es'}` : ''}${S.q ? ' · <a href="#" data-act="clear">clear</a>' : ''}</span>
    ${NAMEONLY_BOX()}<label style="font-weight:600"><input type="checkbox" data-act="hideinact" data-v="p" ${hideIn ? 'checked' : ''}> Hide inactive/blocked</label><label>Sort <select data-act="sort">${[['first', 'First name'], ['last', 'Surname'], ['business', 'Business'], ['rating', 'Rating'], ['tag', 'Tag']].map(([v, l]) => `<option value="${v}" ${S.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div></div>`;
  html += '<ul class="list">';
  if (!mix && S.q.trim()) { const pq = parseQuery(S.q); const bo = D.businesses.filter((b) => bizHasDetails(b) && matchQ(nameOnly() ? bizNameHay(b) : bizHay(b), pq)).slice(0, 15);
    if (bo.length) { html += `<li class="group-h">Businesses (phone / email on the business)</li>`; bo.forEach((b) => { html += `<li class="item" data-act="open" data-kind="business" data-id="${b.id}"><div class="av" style="display:grid;place-items:center;background:#ece8df;font-size:20px">🏢</div><div class="t"><div class="n">${h(b.name)}</div><div class="s"><b>${isClientBiz(b) ? 'Client business' : 'Industry'}</b> · ${h(((b.phones || [])[0] || (b.emails || [])[0] || {}).value || '')}</div></div></li>`; }); html += `<li class="group-h">People</li>`; } }
  let lastG = null, shown = 0; let starredHdr = false;
  let bq = mixB ? mixB.slice().sort((a, b) => alphaCmp(a.name, b.name)) : []; const alphaSort = ['first', 'last'].includes(S.sort || 'first');
  const flushB = (n) => { while (bq.length && (n == null || alphaCmp(bq[0].name, n) <= 0)) { if (shown <= 400) html += bizRowHtml(bq[0]); shown++; bq.shift(); } };
  for (const { c, g, n: nmKey } of rows) {
    if (mix && alphaSort && !isFav(c)) flushB(nmKey);
    if (shown > 400) { html += `<li class="empty">Showing first 400 — refine your search to see more.</li>`; break; }
    if (isFav(c) && !starredHdr) { html += `<li class="group-h">★ Favourites</li>`; starredHdr = true; }
    if (!isFav(c) && g !== null && g !== lastG) { html += `<li class="group-h">${h(g)}</li>`; lastG = g; }
    if (!isFav(c) && g === null && starredHdr && lastG !== '__all') { html += `<li class="group-h">All people</li>`; lastG = '__all'; }
    const bs = bizOf(c); const rs = distinctRatings(c);
    const sub = [rs.map(rbadge).join(''), h(bs.map((b) => b.name).join(', ') || c.role || (c.mobiles[0] || c.landlines[0] || {}).value || '')].join('');
    html += `<li class="item ${S.sel?.id === c.id ? 'sel' : ''}" data-act="open" data-kind="contact" data-id="${c.id}">${contactPhotoImg(c)}<div class="t"><div class="n">${isFav(c) ? '<span class="star">★</span> ' : ''}${h(showName(c))}</div><div class="s">${sub}</div></div>${hasWarning(c) ? '<span class="wdot" title="Has warnings"></span>' : ''}</li>`;
    shown++;
  }
  if (mix && bq.length) { if (!alphaSort) html += `<li class="group-h">Businesses</li>`; flushB(null); }
  if (!rows.length && !(mixB && mixB.length)) html += `<li class="empty">No matches.</li>`;
  html += '</ul>';
  patchList(list, html, 'q');
  if (keepFocus && document.activeElement?.id !== 'q') { const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}

/* ---------------- business list ---------------- */
function bizHay(b) {
  if (IDX.bhay.has(b.id)) return IDX.bhay.get(b.id);
  const parts = [b.name, b.abbr, b.info, b.warnings, b.sideNotes, b.rating ? tagName(b.rating) : '', ...Object.values(b.custom || {})];
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
  let rows = D.businesses.filter((b) => matchQ(nameOnly() ? bizNameHay(b) : bizHay(b), pq) && (bt === 'all' || (bt === 'client') === isClientBiz(b)) && (!hideIn || !['inactive', 'dna'].includes(bizCat(b))));
  rows.sort((a, b) => (S.bsort === 'rating' ? (RATINGS.indexOf(a.rating) + 10) % 14 - (RATINGS.indexOf(b.rating) + 10) % 14 : 0) || alphaCmp(a.name, b.name));
  let html = `<div class="toolbar"><div class="search"><input id="bq" type="search" placeholder="Search businesses…" title="Tip: use -word to exclude" value="${h(S.bq)}" autocomplete="off"><button class="btn" data-act="go-adv-biz" title="Advanced search">Advanced</button><button class="btn primary" data-act="new-biz">➕ New</button></div>
    ${ctypeSeg(true)}
    <div class="row2"><span>${rows.length} of ${D.businesses.length} businesses${S.bq ? ' · <a href="#" data-act="bclear">clear</a>' : ''}</span>${NAMEONLY_BOX()}<label style="font-weight:600"><input type="checkbox" data-act="hideinact" data-v="b" ${hideIn ? 'checked' : ''}> Hide inactive/blocked</label><label>Sort <select data-act="bsort"><option value="name">Name</option><option value="rating" ${S.bsort === 'rating' ? 'selected' : ''}>Rating</option></select></label></div></div><ul class="list">`;
  rows.slice(0, 400).forEach((b) => { html += bizRowHtml(b); });
  if (!rows.length) html += `<li class="empty">No businesses match.</li>`;
  patchList($('#list'), html + '</ul>', 'bq');
  if (keepFocus && document.activeElement?.id !== 'bq') { const q = $('#bq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}

/* ---------------- detail views ---------------- */
function bizMapPins(f) { const out = []; farmTurns(f).forEach((t) => { if (t.p) out.push({ p: t.p, emo: turnPin().emoji, name: t.name, turn: true, acc: t.acc, tbc: t.tbc }); }); farmYards(f).forEach((y) => { if (y.p) out.push({ p: y.p, emo: y.emo, name: y.name, tbc: y.tbc }); }); return out; }
function bizMapPop(b, f, pin) { const nav = gmapsNav(pin.p); return `<div class="mpop" style="min-width:200px"><div style="font-weight:700;font-size:15px">${h(f.name || 'Farm')}</div><div class="hint">${pin.emo} ${h(pin.name)}${pin.tbc ? ' <b style="color:var(--red-ink)">TBC — not confirmed yet</b>' : ''}${f.address ? ' · ' + h(f.address) : ''}</div>${f.kmReturn != null ? `<div class="hint">${f.kmReturn} km return${f.driveMin != null ? ' · ⏱ ' + fmtMin(f.driveMin) + ' each way' : ''}</div>` : ''}${pin.turn ? `<div style="font-size:13px">${accessLine(pin.acc)}</div>` : farmTurns(f).map((t) => `<div style="font-size:13px">${accessLine(t.acc, farmTurns(f).length > 1 ? t.name : '')}</div>`).join('')}${NOTE_KS.farm.some((k) => noteCount('farm', f, k)) ? `<div style="font-size:13px;color:var(--red-ink);margin-top:3px">⚠ Has warnings, cautions or repairs — check the farm card</div>` : ''}
  <div class="actions" style="margin-top:6px"><a class="btn small" href="${nav}" target="_blank" rel="noopener">🧭 Navigate here</a><button class="btn small" data-act="bizmap-show" data-fid="${f.id}">Show farm card</button><button class="btn small" data-act="edit-farm" data-bid="${b.id}" data-fid="${f.id}">✏️ Edit</button></div></div>`; }
async function initBizMaps() { for (const box of document.querySelectorAll('.bizmap:not([data-done])')) { box.dataset.done = '1'; const b = IDX.biz.get(box.dataset.bid); if (!b) continue;
  const fs = box.dataset.fid ? b.farms.filter((f) => f.id === box.dataset.fid) : b.farms.filter((f) => !(b.farmLinks.find((l) => l.fid === f.id) || {}).past); const MH = box.dataset.h || '340px'; const pins = fs.flatMap((f) => bizMapPins(f).map((pin) => ({ f, pin }))); if (!pins.length) continue;
  const leaflet = async () => { box.innerHTML = `<div style="width:100%;height:${MH};border-radius:9px;position:relative;z-index:0"></div>`; const m = await satMap(box.firstChild, pins[0].pin.p);
    const icon = (emo, red, tbc) => L.divIcon({ className: 'pcpin', html: `<div style="width:30px;height:30px;border-radius:50%;background:${tbc ? '#ff5a5a' : '#fff'};border:2px solid ${red ? '#d71f2b' : '#141414'};display:grid;place-items:center;font-size:17px;box-shadow:0 2px 6px rgba(0,0,0,.35)">${emo}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
    pins.forEach(({ f, pin }) => L.marker([pin.p.lat, pin.p.lng], { icon: icon(pin.emo, pin.turn, pin.tbc), zIndexOffset: pin.turn ? 0 : 1000 }).addTo(m).bindPopup(bizMapPop(b, f, pin))); if (pins.length > 1) m.fitBounds(L.latLngBounds(pins.map((x) => [x.pin.p.lat, x.pin.p.lng])), { padding: [36, 36], maxZoom: 18 }); };
  if (MAPS_JS_BAD || !Maps.key()) { await leaflet(); continue; } const src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(Maps.key())}&v=weekly`;
  try { await loadScript(src); if (!window.google || !google.maps || !google.maps.Map) throw new Error('no maps'); } catch (e) { delete SCRIPT_P[src]; MAPS_JS_BAD = true; await leaflet(); continue; }
  if (MAPS_JS_BAD) { await leaflet(); continue; } box.innerHTML = `<div style="width:100%;height:${MH};border-radius:9px"></div>`; box.classList.add('gmap-live'); box.addEventListener('gmfail', () => leaflet(), { once: true });
  const map = new google.maps.Map(box.firstChild, { center: { lat: pins[0].pin.p.lat, lng: pins[0].pin.p.lng }, zoom: 14, mapTypeId: 'hybrid', streetViewControl: false, fullscreenControl: true, gestureHandling: 'greedy', tilt: 0 }); const bounds = new google.maps.LatLngBounds(); const iw = new google.maps.InfoWindow();
  pins.forEach(({ f, pin }) => { const mk = new google.maps.Marker({ position: { lat: pin.p.lat, lng: pin.p.lng }, map, zIndex: pin.turn ? 1 : 1000, label: { text: pin.emo, fontSize: '18px' }, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 15, fillColor: pin.tbc ? '#ff5a5a' : '#fff', fillOpacity: 0.95, strokeColor: pin.turn ? '#d71f2b' : '#141414', strokeWeight: 2 } }); mk.addListener('click', () => { iw.setContent(bizMapPop(b, f, pin)); iw.open({ map, anchor: mk }); }); bounds.extend(mk.getPosition()); });
  if (pins.length > 1) { map.fitBounds(bounds, 50); google.maps.event.addListenerOnce(map, 'idle', () => { if (map.getZoom() > 18) map.setZoom(18); }); } } }
function renderDetail() {
  const el = $('#detail');
  el.classList.remove('dna');
  if (!S.sel) { el.innerHTML = `<div class="empty" style="padding-top:80px">Select a ${S.tab === 'loc' ? 'location' : 'contact or business'} to see details.</div>`; document.body.classList.remove('show-detail'); return; }
  if (S.sel.kind === 'contact') { const c = D.contacts.find((x) => x.id === S.sel.id); if (!c) { S.sel = null; return renderDetail(); } el.classList.toggle('dna', effTags(c).includes('dna')); el.innerHTML = contactDetail(c); }
  else { const b = IDX.biz.get(S.sel.id); if (!b) { S.sel = null; return renderDetail(); } el.classList.toggle('dna', (b.cats || []).includes('dna')); el.innerHTML = bizDetail(b); }
  document.body.classList.add('show-detail'); setTimeout(initBizMaps, 80);
}
function phoneLinks(list, sms, callLbl = 'call client') {
  return list.map((p) => { const n = h(p.value.replace(/[^\d+]/g, '')); return `<div class="kv" style="align-items:center"><div class="k">${h(p.label || '')}</div><div class="v"><a href="tel:${n}">${h(p.value)}</a></div><a class="cbtn" href="tel:${n}" title="Call ${h(p.value)}" aria-label="Call">📞</a>${sms ? `<a class="cbtn sms" href="sms:${n}" title="Send an SMS" aria-label="Send SMS">🅢🅜🅢</a>` : ''}</div>`; }).join('');
}
function flagLines(kind, id, fid) {
  return jobs().filter((j) => j.kind === kind && j.id === id && (fid === undefined || j.fid === fid)).map(flagJob).join('');
}
// a job shown on the contact / business itself: tap it to open the same buttons as on the Jobs list
const flagJob = (j) => `<details class="flagjob" ${S.flagOpen === j.key ? 'open' : ''} data-fk="${h(j.key)}"><summary class="flagline"><span style="color:var(--red)">${ICONS.flag}</span><div style="flex:1">${h(j.note)}</div><span class="hint" style="white-space:nowrap">Fix ▸</span></summary><div class="flagbody">${jobItemHtml(j, true)}</div></details>`;
document.addEventListener('toggle', (e) => { const d = e.target; if (d.classList && d.classList.contains('flagjob')) { if (d.open) S.flagOpen = d.dataset.fk; else if (S.flagOpen === d.dataset.fk) S.flagOpen = null; } }, true);
const inactiveBox = (r, kind, id, from) => `<div class="inactivebox"><div style="display:flex;align-items:center;gap:8px"><div style="font-family:var(--cond);font-size:20px;letter-spacing:.4px;flex:1">${h(bt('inactive', 'INACTIVE CLIENT'))}</div>${id ? secEdit(kind, id, 'Inactive') : ''}</div>${r ? `<div class="body" style="margin-top:2px">${h(r)}</div>` : '<div style="opacity:.9;font-size:14px">No reason recorded yet — tap ✏️ to add one.</div>'}${from ? `<div style="opacity:.75;font-size:12.5px;margin-top:4px">${r ? `Reason from ${h(from)} — ✏️ edits it on the business` : `Inactive because ${h(from)} is — ✏️ adds the reason on the business`}</div>` : ''}</div>`;
function contactInactiveBox(c) { /* the reason may live on the person or on their business — ✏️ opens whichever holds it */
  if ((c.inactiveReason || '').trim()) return inactiveBox(c.inactiveReason, 'contact', c.id);
  const ib = bizOf(c).filter((b) => bizCat(b) === 'inactive'); const withR = ib.filter((b) => (b.inactiveReason || '').trim());
  if (withR.length === 1) return inactiveBox(withR[0].inactiveReason, 'business', withR[0].id, withR[0].name);
  if (withR.length > 1) return inactiveBox(withR.map((b) => b.name + ': ' + b.inactiveReason).join('\n'), 'contact', c.id);
  if (followsBiz(c) && ib.length === 1) return inactiveBox('', 'business', ib[0].id, ib[0].name);
  return inactiveBox('', 'contact', c.id); }
const dnaReasonBox = (r) => `<div class="dnareason"><div class="lbl" style="color:var(--red-ink)">${h(bt('dnareason', 'Reason'))}</div>${r ? `<div class="body">${h(r)}</div>` : '<div class="hint">No reason recorded yet — tap Edit to add one (e.g. bad debtor, not the client for us, don\'t feel safe).</div>'}</div>`;
/* ---------------- ICE (in case of emergency) contacts for Bovitech staff ---------------- */
const isStaff = (c) => catOf(c) === 'bvs';
const iceLabel = (x) => fullName(x) + ((x.mobiles[0] || x.landlines[0]) ? ' — ' + (x.mobiles[0] || x.landlines[0]).value : '');
const iceFor = (c) => D.contacts.filter((s2) => (s2.ice || []).some((i) => i.cid === c.id)).map((s2) => ({ staff: s2, rel: s2.ice.find((i) => i.cid === c.id).rel }));
function iceCard(c) {
  let out = '';
  if (isStaff(c) || (c.ice || []).length) out += `<div class="card icecard"><h3><span class="sp">${h(bt('ice', '🚨 ICE contacts (in case of emergency)'))}</span>${secEdit('contact', c.id, 'ICE')}</h3>${(c.ice || []).map((i) => { const x = D.contacts.find((y) => y.id === i.cid); if (!x) return ''; return `<div style="margin:6px 0"><div class="biz-link" data-act="open" data-kind="contact" data-id="${x.id}" style="font-weight:700">${h(fullName(x))}${i.rel ? ` <span class="hint" style="font-weight:400">(${h(i.rel)})</span>` : ''}</div>${phoneLinks(x.mobiles.map((p) => ({ ...p, label: p.label || 'Mobile' })), true, 'call')}${phoneLinks(x.landlines.map((p) => ({ ...p, label: p.label || 'Landline' })), false, 'call')}</div>`; }).join('') || '<div class="hint">No ICE contact recorded — tap Edit to add one.</div>'}</div>`;
  const forList = iceFor(c);
  if (forList.length) out += `<div class="card icecard"><h3>🚨 ICE contact for</h3>${forList.map((f) => `<div class="biz-link" data-act="open" data-kind="contact" data-id="${f.staff.id}" style="margin:4px 0"><b>${h(fullName(f.staff))}</b>${f.rel ? ` <span class="hint">(${h(f.rel)})</span>` : ''}</div>`).join('')}</div>`;
  return out;
}
function iceRow(i) { const x = i && D.contacts.find((y) => y.id === i.cid); return `<div class="icerow" style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap"><input class="ice-who" list="ice-dl" value="${x ? h(iceLabel(x)) : ''}" style="flex:2;min-width:180px;padding:9px;border:1px solid var(--line);border-radius:9px"><input class="ice-rel" value="${h((i && i.rel) || '')}" style="flex:1;min-width:120px;padding:9px;border:1px solid var(--line);border-radius:9px"><button type="button" class="btn small" data-act="ice-del">✕</button></div>`; }
// linking a contact to a business whose category differs: match the business, or keep the contact's own?
async function askLinkCat(names, b, cur, contacts) { /* contacts: who is being linked — used to ask which photo they show when they keep their own category */
  const r0 = await askLinkCat0(names, b, cur); if (r0 === 'keep' && contacts && contacts.length && !(await askLinkPhoto(contacts, b))) return null; return r0;
}
async function askLinkPhoto(contacts, b) { /* own category kept: which photo? */
  const bc = bizCat(b); const bsrc = bc && tagPhotoSrc(bc); const owns = [...new Set(contacts.map(catOf).filter((t) => t && tagPhotoSrc(t)))];
  if (!bsrc || !owns.length) return true;
  const own1 = owns.length === 1 ? owns[0] : null; const img = (t) => `<img src="${tagPhotoSrc(t)}" style="width:26px;height:26px;border-radius:50%;object-fit:cover;vertical-align:middle">`;
  const opt = (v, html, on) => `<label class="bkop"><input type="radio" name="lp" value="${v}" ${on ? 'checked' : ''} onchange="document.getElementById('lp-val').value=this.value"><span>${html}</span></label>`;
  const r = await askBox('Which photo?', `<p>${contacts.length > 1 ? `These ${contacts.length} contacts` : `<b>${h(fullName(contacts[0]))}</b>`} will keep ${contacts.length > 1 ? 'their own categories' : 'their own category'}, which is different from <b>${h(b.name)}</b>. Which photo should ${contacts.length > 1 ? 'they' : 'they'} show?</p>
    <input type="hidden" id="lp-val" data-ask="lp" value="own">
    ${opt('own', `${own1 ? img(own1) + ' ' : ''}<b>Their own category${own1 ? ': ' + h(tagName(own1)) : ''}</b>`, true)}${opt('biz', `${img(bc)} <b>The business's category: ${h(tagName(bc))}</b>`)}${opt('split', `<span class="splitpv">${own1 ? `<img src="${tagPhotoSrc(own1)}">` : ''}<img src="${bsrc}"></span> <b>Split photo — both</b>`)}`, 'Use this photo', false, 'Cancel');
  if (!r) return false; const v = ASK_FORM.lp || 'own';
  contacts.forEach((c) => { const own = catOf(c); if (v === 'own' || !own || !tagPhotoSrc(own)) { if (c.photoChoice && c.photoChoice !== 'auto' && c.photoChoice !== 'custom') { c.photoChoice = 'auto'; touch(c); } return; } c.photoChoice = v === 'biz' ? bc : 'split:' + own + ',' + bc; touch(c); });
  return true;
}
async function askLinkCat0(names, b, cur) {
  return askBox('Different category', `<p style="font-size:16.5px">${names} ${/,| and /.test(names) ? 'have' : 'has'} a different category from <b>${h(b.name)}</b>.</p><div class="grid2" style="margin:8px 0"><div class="body" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px"><div class="lbl">Contact now</div>${h(cur)}</div><div class="body" style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px"><div class="lbl">Business</div>${h(tagName(bizCat(b)))}</div></div><p>Update the contact's category to match the business, or keep it different?</p>`, `Update to match business: ${tagName(bizCat(b))}`, false, "Cancel — don't link", `Keep it different: ${cur}`).then((r) => (r === true ? 'match' : r === 'alt' ? 'keep' : null)); // null = backed out: nothing is linked
}
function setIceTags(ids, removedIds = []) { // linked ICE contacts get the ICE tag; people no longer anyone's ICE lose it
  const still = new Set(D.contacts.flatMap((x) => (x.ice || []).map((i) => i.cid)));
  ids.forEach((id) => { const x = D.contacts.find((y) => y.id === id); if (x && !x.tags.includes('ice')) { x.tags.push('ice'); touch(x); } });
  removedIds.filter((id) => !still.has(id)).forEach((id) => { const x = D.contacts.find((y) => y.id === id); if (x && x.tags.includes('ice')) { x.tags = x.tags.filter((t) => t !== 'ice'); touch(x); } });
}
/* ---------------- page layout (Settings → Page layout): section order, hidden sections, custom sections ---------------- */
const LAYOUT_SECS = {
  contact: [['jobs', '🚩 Jobs / flags for this person'], ['ice', '🚨 ICE contacts'], ['warn', '⚠ Major and minor warnings'], ['biosec', '🦠 Biosecurity'], ['side', '📝 Side notes'], ['contact', '📞 Phone, email and postal'], ['related', '👪 Related people'], ['nomention', "🤫 Don't mention"], ['tags', '🏷 Categories and tags'], ['info', 'ℹ️ General info'], ['biz', '🔗 Linked businesses'], ['pastbiz', '🕘 Past businesses'], ['helps', '🙂 Happy helper at'], ['resolved', '✓ Resolved warnings and notes'], ['history', '🕘 Change history']],
  farm: [['address', '📍 Physical address'], ['info', 'ℹ️ General farm info'], ['meta', '🚗 Distance, drive time and reception'], ['users', '👥 Also used by / owned by'], ['safety', '⚠ Safety warnings'], ['biosec', '🦠 Biosecurity'], ['pins', '📍 Pin buttons (directions, map, Street View)'], ['access', '🚪 Access, gate PIN and key'], ['fac', '🛠 Facilities'], ['recep', '📶 Reception note'], ['notes', '📝 Warnings and notes'], ['photos', '📷 Photos'], ['flags', '🚩 Jobs for this farm'], ['actions', '🔘 Buttons (add to route, warning, delete…)']],
  business: [['warn', '⚠ Major and minor business warnings'], ['biosec', '🦠 Biosecurity'], ['side', '📝 Side notes'], ['nomention', "🤫 Don't mention"], ['cat', '🏷 Contact category'], ['phone', '📞 Phone and email'], ['info', 'ℹ️ General info'], ['current', '👥 Current contacts / employees'], ['helpers', '🙂 Happy helpers'], ['past', '🕘 Past contacts'], ['pic', '🔢 PIC'], ['pid', '🆔 Patient IDs'], ['keep', '📝 Keep note templates'], ['routes', '🗺 Saved routes'], ['farms', '🐄 Farms / locations'], ['farmsmap', '🗺 Map of all pins'], ['farmsused', '🐄 Farms used but not owned'], ['farmspast', '🕘 Not current farms'], ['resolved', '✓ Resolved warnings and notes'], ['history', '🕘 Change history']] };
const LAYOUT_LOCKED = new Set(); // every section's visibility can be chosen (nothing with info in it is ever hidden)
const SEC_COLORS = [['', 'White (plain)', '#ffffff'], ['yellow', 'Yellow', '#fff3c4'], ['red', 'Red', '#fdeaea'], ['orange', 'Orange', '#ffe8d1'], ['green', 'Green', '#e3f5e6'], ['blue', 'Blue', '#e3edfb'], ['purple', 'Purple', '#efe3f7'], ['grey', 'Grey', '#ececec']];
function customSecs(kind) { return (D.settings.customSecs || []).filter((x) => x.for === 'both' || x.for === kind); }
function layoutKeys(kind) { const all = [...LAYOUT_SECS[kind].map((x) => x[0]), ...(kind === 'farm' ? [] : customSecs(kind).map((x) => 'cs:' + x.id))]; const saved = ((D.settings.layout || {})[kind] || []).filter((k) => all.includes(k));
  const out = [...saved]; all.forEach((k, i) => { if (out.includes(k)) return; const prev = all.slice(0, i).reverse().find((x) => out.includes(x)); out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, k); }); if (!saved.includes('resolved') && out.includes('resolved')) { out.splice(out.indexOf('resolved'), 1); out.push('resolved'); } if (!saved.includes('history') && out.includes('history')) { out.splice(out.indexOf('history'), 1); out.push('history'); } return out; } // new sections slot in after their usual neighbour
const NO_RENAME = new Set(['jobs']); // no heading on the page — renaming changes the label in Settings and when folded
function secSplit(lbl) { const m = lbl.match(/^(\S+)\s+(.*)$/); return m && !/[A-Za-z0-9]/.test(m[1]) ? { emoji: m[1], name: m[2] } : { emoji: '', name: lbl }; }
function secOver(kind, k) { return ((D.settings.secNames || {})[kind] || {})[k] || null; }
function secInfo(kind, k) { /* {emoji, name, color, rich, custom} for a section, after any renaming in Settings */
  if (k.startsWith('cs:')) { const cs = (D.settings.customSecs || []).find((x) => 'cs:' + x.id === k); return cs ? { emoji: cs.emoji || '', name: cs.name, color: cs.color || '', rich: !!cs.rich, custom: cs } : { emoji: '', name: k }; }
  const def = secSplit((LAYOUT_SECS[kind].find((x) => x[0] === k) || [, k])[1]); const o = secOver(kind, k) || {}; return { emoji: o.emoji != null ? o.emoji : def.emoji, name: o.name || def.name, color: o.color || '', def }; }
function layoutLabel(kind, k) { const x = secInfo(kind, k); return (x.emoji ? x.emoji + ' ' : (x.custom ? '✨ ' : '')) + x.name; }
/* how each section shows: '' = always, 'empty' = hide only when it has nothing in it, 'fold' = folded up (tap the heading to open). Nothing with info in it is ever hidden. */
function layoutModes(kind) { const m = { ...(((D.settings.layoutMode || {})[kind]) || {}) }; ((D.settings.layoutHide || {})[kind] || []).forEach((k) => { if (!(k in m)) m[k] = 'empty'; }); LAYOUT_LOCKED.forEach((k) => delete m[k]); return m; } // old "hidden" sections became "hide when empty"
const LAY_ADDBOX = new Set(['current', 'past', 'farms', 'related', 'nomention']); // sections that hold a ➕ box
function secEmpty(kind, k, rec, part) {
  if (k.startsWith('cs:')) return !((rec.custom || {})[k.slice(3)] || '').trim();
  const tpl = (t) => !(t || '').trim() || tplOnly(t);
  if (kind === 'contact') { const c = rec; switch (k) {
    case 'nomention': return !(c.noMentionRel || []).length && !(c.noMention || '').trim(); case 'warn': return !hasWarning(c) && !noteCount('contact', c, 'caution');
    case 'ice': return !(c.ice || []).length; case 'side': return !(c.sideNotes || '').trim() && !bizOf(c).some((b) => (b.sideNotes || '').trim());
    case 'contact': return !c.mobiles.length && !c.landlines.length && !c.emails.length && !c.postal.length; case 'related': return !(c.related || []).length;
    case 'tags': return !effTags(c).filter((t) => !RATING_SET.has(t)).length; case 'info': return tpl(c.info); case 'biz': return !bizOf(c).length; case 'pastbiz': return !pastBizOf(c).length; case 'helps': return !helpsAt(c).length; } }
  else { const b = rec; switch (k) {
    case 'side': return !(b.sideNotes || '').trim(); case 'cat': return !bizCat(b); case 'phone': return !bizHasDetails(b) && !(b.postal || []).length; case 'info': return tpl(b.info);
    case 'nomention': return !bizNoMentionRows(b).length; case 'helpers': return !(b.helpers || []).length; case 'current': return !(IDX.bizContacts.get(b.id) || []).length; case 'past': return !(IDX.bizPast.get(b.id) || []).length; case 'pic': return !b.pics.length; case 'pid': return !b.patientIds.length; case 'farms': return !b.farms.length; } }
  return !(part || '').trim(); }
S.foldOpen = new Set();
document.addEventListener('toggle', (e) => { const d = e.target; if (d && d.classList && d.classList.contains('secfold')) { if (d.open) S.foldOpen.add(d.dataset.fk); else S.foldOpen.delete(d.dataset.fk); } }, true);
/* ---------------- admin (Jess): PIN unlocks the look settings and "Edit page" on this device until the app is closed ---------------- */
const ADMIN_HASH = '62d31504c282d9aeb5461d1f67761c51893e75c5aac591cbd78b3aaaf0657507'; // PIN 2015 (salted) — can be changed in Settings when unlocked
async function pinHash(pin) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bvt-admin:' + pin)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
function needAdmin() { if (S.admin) return true; if (CLICK_SEC && !setLocked(CLICK_SEC, false)) return true; toast('🔒 Only the admin can change this — unlock in Settings'); return false; }
function adminOnly(title, html) { return secOk(title) ? html : `<div class="card"><h3><span class="sp">${h(title)}</span></h3><div class="hint">🔒 Only the admin (Jess) can change this.</div><div class="actions"><button class="btn small" data-act="admin-unlock">🔓 Unlock with admin PIN</button></div></div>`; }
const EP_BOX = { warn: ['warn', 'caution'], side: ['side'], biosec: ['biosec'], nomention: ['nomention'] };
function epWrap(kind, k, inner) { const keys = layoutKeys(kind), i = keys.indexOf(k), m = layoutModes(kind)[k] || ''; const boxes = EP_BOX[k] || [];
  return `<div class="edsec dragrow" data-dk="${h(k)}"><div class="edbar"><span class="draghandle" title="Hold and drag to move this section">⠿</span><b>${h(layoutLabel(kind, k))}</b><span class="edbtns"><button class="btn small" data-act="ep-mv" data-kind="${kind}" data-k="${h(k)}" data-d="-1" ${i ? '' : 'disabled'}>↑</button><button class="btn small" data-act="ep-mv" data-kind="${kind}" data-k="${h(k)}" data-d="1" ${i < keys.length - 1 ? '' : 'disabled'}>↓</button><button class="btn small" data-act="ep-name" data-kind="${kind}" data-k="${h(k)}">Rename</button>${boxes.map((bk) => `<button class="btn small" data-act="box-edit" data-k="${bk}">🎨 ${bk === 'caution' ? 'Minor look' : bk === 'warn' ? 'Major look' : 'Look'}</button>`).join('')}<select class="laymode" data-laymode="${h(k)}" data-kind="${kind}"><option value="" ${!m ? 'selected' : ''}>Always show</option><option value="empty" ${m === 'empty' ? 'selected' : ''}>Hide when empty</option><option value="fold" ${m === 'fold' ? 'selected' : ''}>Fold up</option></select></span></div>${inner}</div>`; }
const pidEmo = (p) => { const l = (p.label || '') + ' '; return /sheep|flock|ovine/i.test(l) ? '<span title="Sheep">🐑</span> ' : /cattle|herd|cow|bull|bovine|beef|dairy/i.test(l) ? '<span title="Cattle">🐄</span> ' : ''; }; // patient ID → cattle or sheep from its label
const showAllOn = (id) => !!S.showAll && S.showAllFor === id; // "Expand all sections" — only for the record it was ticked on
const expandBox = (id, kind) => `<div class="expandbar"><label title="Shows folded, hidden and empty sections on this page"><input type="checkbox" data-act="show-all" data-id="${id}" ${showAllOn(id) ? 'checked' : ''}> Expand all sections</label></div>${S.admin ? `<div class="adminbar"><span>🔓 Admin</span><button class="btn ${S.editPage ? 'primary' : 'on'}" data-act="edit-page" data-kind="${kind}">🎨 ${S.editPage ? 'Finish editing this page' : 'Edit how this page looks'}</button></div>` : ''}${S.admin && S.editPage ? `<div class="edhead"><b>Editing the ${kind} page layout</b> — changes apply on every device. Top boxes: <button class="btn small" data-act="box-edit" data-k="inactive">🎨 Inactive box</button><button class="btn small" data-act="box-edit" data-k="dna">🎨 Do not answer banner</button><button class="btn small" data-act="box-edit" data-k="dnareason">🎨 Reason box</button></div>` : ''}`;
function layoutApply(kind, html, M, rec) { if (!M.length) return html; const parts = {}; M.forEach(([k, at], i) => { if (k === '_end') return; parts[k] = (parts[k] || '') + html.slice(at, M[i + 1] ? M[i + 1][1] : html.length); });
  const endAt = (M.find((x) => x[0] === '_end') || [, html.length])[1]; const modes = layoutModes(kind);
  Object.keys(parts).forEach((k) => { const o = secOver(kind, k); if (!o || k.startsWith('cs:')) return; let x = parts[k];
    if ((o.name || o.emoji != null) && !NO_RENAME.has(k)) { const si = secInfo(kind, k); x = x.replace(/(<h[23][^>]*>\s*(?:<span class="sp">)?)([^<]*?)(\s*\(\d+\))?(?=\s*<)/, (m0, a, txt, cnt) => a + h((si.emoji ? si.emoji + ' ' : '') + si.name) + (cnt || '')); }
    if (o.color) x = x.replace('<div class="card"', `<div class="card cs-${o.color}"`); parts[k] = x; });
  const show = (k) => { const x = parts[k] || ''; const m = modes[k];
    if (S.editPage && S.admin) return epWrap(kind, k, x.trim() ? x : `<div class="card emptysec"><h3><span class="sp">${h(layoutLabel(kind, k))}</span></h3><div class="hint">Nothing here yet.</div></div>`);
    if (showAllOn(rec.id)) return x.trim() ? x : `<div class="card emptysec"><h3><span class="sp">${h(layoutLabel(kind, k))}</span>${k === 'jobs' ? '' : secEdit(kind, rec.id, secInfo(kind, k).custom ? secInfo(kind, k).name : ({ warn: kind === 'business' ? 'Major business warning' : 'Major warning', side: 'Side notes', biosec: 'Biosecurity', ice: 'ICE', contact: 'Mobile numbers', phone: 'Business phone', tags: 'Category', info: 'General info', biz: 'Businesses', pastbiz: 'Businesses', pic: 'Property Identification', pid: 'Patient IDs', cat: 'Contact category' })[k] || secInfo(kind, k).name)}</h3><div class="hint">Nothing here yet.</div></div>`;
    if (!m || !x.trim()) return x; const empty = secEmpty(kind, k, rec, x); if (m === 'empty') return empty ? '' : x;
    const fk = kind + ':' + k; const cnt = (x.match(/<h[23][^>]*>[\s\S]*?\((\d+)\)/) || [])[1];
    return `<details class="secfold" data-fk="${h(fk)}" ${S.foldOpen.has(fk) ? 'open' : ''}><summary><span>${h(layoutLabel(kind, k))}</span>${cnt ? ` <span class="hint">(${cnt})</span>` : ''}${empty ? ' <span class="hint">· empty</span>' : ''}</summary>${x}</details>`; };
  const mid = layoutKeys(kind).map(show).join(''); return html.slice(0, M[0][1]) + (S.editPage && S.admin ? `<div data-dnd="eplayout:${kind}">${mid}</div>` : mid) + html.slice(endAt); }
function customCard(rec, cs, kind) { const v = ((rec.custom || {})[cs.id] || '').trim(); const vh = (rec.customHtml || {})[cs.id];
  return `<div class="card ${cs.color ? 'cs-' + cs.color : ''}"><h3><span class="sp">${cs.emoji ? cs.emoji + ' ' : ''}${h(cs.name)}</span>${secEdit(kind, rec.id, cs.name)}</h3>${cs.rich && vh ? `<div class="rich">${cleanHtml(vh)}</div>` : v ? `<div class="body">${h(v)}</div>` : '<div class="hint">Nothing recorded.</div>'}</div>`; }
function customFields(rec, kind) { return customSecs(kind).map((cs) => cs.rich
  ? `<div class="f"><label>${cs.emoji ? cs.emoji + ' ' : ''}${h(cs.name)}</label><div data-customrich="${cs.id}" class="${cs.color ? 'cs-' + cs.color : ''}" style="border-radius:9px">${richEditor('e-cs-' + cs.id, { info: (rec.custom || {})[cs.id] || '', infoHtml: (rec.customHtml || {})[cs.id] || '' })}</div></div>`
  : `<div class="f"><label>${cs.emoji ? cs.emoji + ' ' : ''}${h(cs.name)}</label><textarea data-custom="${cs.id}" class="${cs.color ? 'cs-' + cs.color : ''}" rows="3">${h((rec.custom || {})[cs.id] || '')}</textarea></div>`).join(''); }
function readCustom(rec) { const els = [...document.querySelectorAll('#sheet [data-custom]')], rich = [...document.querySelectorAll('#sheet [data-customrich]')]; if (!els.length && !rich.length) return;
  const o = { ...(rec.custom || {}) }, oh = { ...(rec.customHtml || {}) };
  els.forEach((el) => { const v = el.value.trim(); if (v) o[el.dataset.custom] = v; else delete o[el.dataset.custom]; delete oh[el.dataset.custom]; });
  rich.forEach((w) => { const id = w.dataset.customrich; const r = readRich('e-cs-' + id); if (r.info) { o[id] = r.info; oh[id] = r.infoHtml; } else { delete o[id]; delete oh[id]; } });
  if (Object.keys(o).length) rec.custom = o; else delete rec.custom; if (Object.keys(oh).length) rec.customHtml = oh; else delete rec.customHtml; }
function contactDetail(c) {
  const bs = bizOf(c);
  const tags = effTags(c).filter((t) => !RATING_SET.has(t));
  const cflags = jobs().filter((j) => j.kind === 'contact' && j.id === c.id);
  const dna = effTags(c).includes('dna');
  let html = `<div class="d-wrap"><div class="dtop"><button class="back" data-act="back">‹ Back</button><button class="btn small secedit" data-act="edit-contact" data-id="${c.id}" title="Edit ${h(fullName(c))}">✏️ Edit</button></div>
  ${catOf(c) === 'inactive' ? contactInactiveBox(c) : ''}
  ${dna ? `<div class="dnabanner">${h(bt('dna', '☠️ DO NOT ANSWER — NO FUTURE SERVICE ☠️'))}</div>${dnaReasonBox(c.dnaReason || bizOf(c).map((b) => b.dnaReason).filter(Boolean).join('\n'))}` : ''}
  <div class="hero">${contactPhotoImg(c, '', 320)}<div><h2>${h(showName(c))}${c.maiden ? ` <span class="nee">(maiden: ${h(c.maiden)})</span>` : ''}</h2><div class="sub">${h(c.role || '')}${c.role && bs.length ? ' · ' : ''}${h(bs.map((b) => b.name).join(', '))}</div>
  <div style="margin-top:6px">${contactRatings(c).map((r) => rbadge(r.rating) + (r.biz && bs.length > 1 ? `<span style="font-size:13px;color:var(--ink3);margin-right:8px">${h(r.biz.name)}</span>` : '')).join('')}</div></div></div>
  <div class="actions"><button class="btn" data-act="star" data-id="${c.id}">${isFav(c) ? '★ Favourite' : '☆ Favourite'}</button>${c.mobiles[0] ? `<a class="btn" href="tel:${h(c.mobiles[0].value.replace(/[^\d+]/g, ''))}">📞 Call</a>` : ''}</div>`;
  html += expandBox(c.id, 'contact');
  const M = []; const mark = (k) => M.push([k, html.length]);
  mark('jobs');
  html += cflags.map(flagJob).join('');
  mark('ice');
  html += iceCard(c);
  mark('warn');
  html += noteCard('contact', c, 'warn', bs) + noteCard('contact', c, 'caution', bs);
  mark('biosec');
  html += bs.map((b) => biosecBanner(b.biosec, bs.length > 1 ? b.name : '')).join('');
  mark('side');
  html += noteCard('contact', c, 'side', bs);
  mark('contact');
  html += `<div class="card"><h3><span class="sp">Contact</span>${secEdit('contact', c.id, 'Mobile numbers')}</h3>${phoneLinks(c.mobiles.map((p) => ({ ...p, label: p.label || 'Mobile' })), true)}${phoneLinks(c.landlines.map((p) => ({ ...p, label: p.label || 'Landline' })))}${c.emails.map((e) => `<div class="kv"><div class="k">${h(e.label || 'Email')}</div><div class="v"><a href="mailto:${h(e.value)}">${h(e.value)}</a></div><a class="cbtn" href="mailto:${h(e.value)}" title="Send an email" aria-label="Email">📧</a></div>`).join('')}${c.postal.map((p) => `<div class="kv"><div class="k">Postal</div><div class="v">${h(p)}</div></div>`).join('')}${!c.mobiles.length && !c.landlines.length && !c.emails.length && !c.postal.length ? (noDet(c) ? '<div class="hint">Name only — ' + NODET + ' (we know who they are, but not how to reach them).</div>' : '<div class="hint">No contact details yet.</div>') : ''}</div>`;
  mark('nomention');
  html += noMentionCard(c);
  mark('related');
  html += relatedCard(c);
  mark('tags');
  if (tags.length) html += `<div class="card"><h3><span class="sp">Categories and tags</span>${secEdit('contact', c.id, 'Category')}</h3><div class="tagrow">${tags.map(tagPill).join('')}</div>${followsBiz(c) && effCats(c).length ? '<div class="hint" style="margin-top:6px">Categories follow the business</div>' : c.ownCats && bs.length ? '<div class="hint" style="margin-top:6px">This contact has its own categories (different to the business)</div>' : ''}</div>`;
  mark('info');
  html += `<div class="card"><h3><span class="sp">General info</span>${photoAddBtn('contact', c.id, 'info')}${secEdit('contact', c.id, 'General info')}</h3>${infoView(c)}${photoStrip('contact', c.id, 'info', c.infoPhotos)}</div>`;
  mark('biz');
  html += `<h2 class="sec-h" style="font-size:20px;margin:18px 0 8px;display:flex;align-items:center;gap:8px">🔗 Linked ${bs.length === 1 ? 'business' : 'businesses'} <span class="count" style="font-size:14px;background:var(--ink);color:#fff;border-radius:99px;padding:1px 9px">${bs.length}</span>${bs.length > 1 ? loBar('contact', c, 'biz') : ''}</h2>${bs.length ? '' : `<div class="card"><div class="hint">Not linked to a business yet — tap Edit to link one.</div></div>`}`;
  const bsStart = html.length, bsParts = []; loSort(c, 'biz', bs, (b) => b.id, (b) => b.name).forEach((b) => { const st0 = html.length;
    html += `<div class="card" style="border-left:5px solid var(--ink3)"><h3>${b.rating ? rbadge(b.rating) : ''}<span class="sp">${h(b.name)}${isClientBiz(b) ? '' : ' <span class="hint">(industry)</span>'}</span>${secEdit('contact', c.id, 'Businesses')}<button class="btn small" data-act="open" data-kind="business" data-id="${b.id}">Open business</button></h3>`;
    { const lr = (c.links.find((l) => l.bid === b.id) || {}).role; if (lr) html += `<div class="kv"><div class="k">Role here</div><div class="v">${h(lr)}</div></div>`; }
    if (b.pics.length && isClientBiz(b)) html += `<div class="kv"><div class="k">PIC</div><div class="v">${b.pics.map((p) => h(p.value) + (p.label ? ` <span class="hint">${h(p.label)}</span>` : '')).join('<br>')}</div></div>`;
    if (b.patientIds.length && isClientBiz(b)) html += `<div class="kv"><div class="k">Patient IDs</div><div class="v">${b.patientIds.map((p) => `${pidEmo(p)}${h(p.value)} <span class="hint">${h(p.label)}</span>`).join('<br>')}</div></div>`;
    html += sortFarms(b, b.farms).map((f) => farmCard(b, f, false)).join('');
    html += bizRoutesHtml(b);
    html += '</div>'; bsParts.push([b.id, html.slice(st0)]);
  });
  html = html.slice(0, bsStart) + loWrap('contact', c, 'biz', bsParts);
  mark('helps');
  html += helpsCard(c);
  mark('pastbiz');
  { const pb = pastBizOf(c); if (pb.length) html += `<div class="card" style="opacity:.85"><h3><span class="sp">Past businesses (${pb.length})</span>${secEdit('contact', c.id, 'Businesses')}</h3>${pb.map((b) => `<div style="display:flex;align-items:center;gap:6px;margin:4px 0"><span class="biz-link sp" data-act="open" data-kind="business" data-id="${b.id}" style="flex:1">${h(b.name)}${(c.links.find((l) => l.bid === b.id) || {}).role ? `<span class="hint"> · ${h(c.links.find((l) => l.bid === b.id).role)}</span>` : ''}</span><button class="btn small" data-act="link-past" data-cid="${c.id}" data-bid="${b.id}" data-v="0">Make current</button></div>`).join('')}</div>`; }
  customSecs('contact').forEach((cs) => { mark('cs:' + cs.id); html += customCard(c, cs, 'contact'); });
  mark('resolved'); html += resolvedCard('contact', c);
  mark('history'); html += historyCard([c.id]);
  mark('_end');
  html += `<div class="actions" style="margin:16px 0 8px"><button class="btn" data-act="merge-start" data-kind="contact" data-id="${c.id}">⇄ Merge with…</button></div><div class="actions" style="margin:0 0 8px"><button class="btn" data-act="rec-ai" data-kind="contact" data-id="${c.id}">🤖 Ask Claude about ${h(c.first || fullName(c))}</button></div>`;
  return layoutApply('contact', html, M, c) + '</div>';
}



/* ---------------- shared yards: changes apply to every business ---------------- */
async function sharedYardOk(f) { const us = farmUsersOf(f.id); if (us.length < 2) return true;
  return !!(await askBox('Shared yard', `<p style="font-size:16px"><b>${h(f.name || 'These yards')}</b> are shared. Any changes will apply to every business that uses them:</p><ul>${us.map((u) => `<li>${bLnk(u.b)}${u.past ? ' <span class="hint">(not current)</span>' : ''}${f.owner && f.owner.bid === u.b.id ? ' <b>— owner</b>' : ''}</li>`).join('')}</ul>`, 'OK — I understand', false, 'Cancel')); }
/* ---------------- check a turn-off pin and add its yards on the satellite map ---------------- */
let PC = null;
function pcRow(k, type, name, p) { return `<div class="card pc-row" data-k="${k}" style="padding:8px;margin:6px 0"><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><select class="pc-type" style="flex:1;min-width:150px">${pinTypes().map((t) => `<option value="${h(t.id)}" ${t.id === type ? 'selected' : ''}>${t.emoji} ${h(t.name)}</option>`).join('')}</select><input class="pc-name" value="${h(name || '')}" style="flex:1;min-width:120px"><button type="button" class="btn small" data-act="pc-del">✕</button></div><input class="pc-gps" value="${p && p.lat != null ? (+p.lat).toFixed(6) + ', ' + (+p.lng).toFixed(6) : ''}" style="width:100%;margin-top:6px"></div>`; }
async function pinCheckSheet(f, opt = {}) {
  const t = f.turn || { lat: f.lat, lng: f.lng }; const needT = !!opt.needTurn && !f.turn; PC = { f, marks: new Map(), n: 0, adding: false, map: null };
  const rows = []; if (f.lat != null) rows.push(pcRow('m', f.pinType, f.name, f)); (f.extra || []).forEach((x) => rows.push(pcRow(x.id, x.type, x.name, x)));
  openSheet('Check pins — ' + farmLabel(f), `<div class="hint" style="margin-bottom:6px">${needT ? `<b>Drag the ${turnPin().emoji} (red ring) to where you leave the road</b> — it starts on top of the yards pin. Or paste its GPS below.` : `Drag the ${turnPin().emoji} ${h(turnName().toLowerCase())} if it's not where you leave the road. Then tap <b>➕ Add yards pin</b> and tap the map where the yards are — add as many as this turn-off leads to, and choose what each one is.`}</div>
    <div id="pc-map" style="height:340px;border-radius:10px;border:1px solid var(--line);background:#dcd8cf">${pinEmbed(t, 16).replace('height:220px', 'height:340px')}</div><div id="pc-hint" class="hint" style="margin-top:4px"></div>
    <div class="f" style="margin-top:8px"><label>${turnPin().emoji} ${h(turnName())} GPS</label><input id="pc-turn" value="${!needT && t.lat != null ? (+t.lat).toFixed(6) + ', ' + (+t.lng).toFixed(6) : ''}"></div>
    <div class="lbl" style="margin-top:8px">Yards and other pins at this turn-off</div><div id="pc-rows">${rows.join('')}</div>
    <button type="button" class="btn small" data-act="pc-add">➕ Add yards pin</button>`, async () => {
    const tg = parseGps(val('pc-turn')); if (!tg) { toast(needT && !val('pc-turn') ? 'Drag the ' + turnPin().emoji + ' to where you leave the road first' : 'The turn-off GPS isn\'t recognised'); return false; }
    if (needT && f.lat != null && Math.abs(tg.lat - f.lat) < 1e-6 && Math.abs(tg.lng - f.lng) < 1e-6) { toast('The ' + turnName().toLowerCase() + ' is still on the yards — drag it to the road'); return false; }
    const pins = []; for (const r of document.querySelectorAll('#pc-rows .pc-row')) { const g = parseGps(r.querySelector('.pc-gps').value); if (!g) { toast('Each yards pin needs a spot — tap the map or paste the GPS'); return false; } pins.push({ k: r.dataset.k, type: r.querySelector('.pc-type').value, name: r.querySelector('.pc-name').value.trim(), lat: +g.lat.toFixed(6), lng: +g.lng.toFixed(6) }); }
    const moved = !f.turn || Math.abs(f.turn.lat - tg.lat) > 1e-6 || Math.abs(f.turn.lng - tg.lng) > 1e-6;
    const was = JSON.parse(JSON.stringify({ turn: f.turn, lat: f.lat, lng: f.lng, pinType: f.pinType, extra: f.extra, kmReturn: f.kmReturn, driveMin: f.driveMin, kmStatus: f.kmStatus }));
    f.turn = { lat: +tg.lat.toFixed(6), lng: +tg.lng.toFixed(6) };
    if (pins.length) { const m0 = pins[0]; f.lat = m0.lat; f.lng = m0.lng; f.pinType = m0.type; if (m0.name && !f.name) f.name = m0.name; f.extra = pins.slice(1).map((x) => ({ id: x.k === 'm' || x.k.startsWith('n') ? uid('p') : x.k, type: x.type, name: x.name, lat: x.lat, lng: x.lng, safety: ((f.extra || []).find((y) => y.id === x.k) || {}).safety || {} })); } else { f.lat = f.lng = null; f.extra = []; }
    if (!f.extra.length) delete f.extra;
    if (moved && !(await verifyKmBox(f))) { Object.assign(f, was); if (!was.extra) delete f.extra; return false; }
    f.pinChecked = true; delete f.needTurn; touch(f); NEXT_LOG_LABEL = `Pins checked: ${farmLabel(f)} (${pins.length} yards pin${pins.length === 1 ? '' : 's'})`; return true; });
  pcMap(t);
}
async function pcMapL(t) { /* same tap-to-place map, without Google's JavaScript API */ const el = $('#pc-map'); if (!el || !PC) return; el.classList.remove('gmap-live');
  const map = await satMap(el, t); PC.map = map; PC.leaflet = true; PC.marks.clear();
  const icon = (emo, red) => { const z = red ? 38 : 30; return L.divIcon({ className: 'pcpin', html: `<div style="width:${z}px;height:${z}px;border-radius:50%;background:#fff;border:${red ? 3 : 2}px solid ${red ? '#d71f2b' : '#141414'};display:grid;place-items:center;font-size:${red ? 21 : 17}px;box-shadow:0 2px 6px rgba(0,0,0,.35)">${emo}</div>`, iconSize: [z, z], iconAnchor: [z / 2, z / 2] }); };
  const mk = (k, p, emo) => { const m = L.marker([+p.lat, +p.lng], { draggable: true, icon: icon(emo, k === 'turn'), zIndexOffset: k === 'turn' ? 1000 : 0 }).addTo(map);
    m.on('dragend', () => { const ll = m.getLatLng(); const v = ll.lat.toFixed(6) + ', ' + ll.lng.toFixed(6); if (k === 'turn') $('#pc-turn').value = v; else { const r = document.querySelector(`#pc-rows .pc-row[data-k="${k}"] .pc-gps`); if (r) r.value = v; } });
    m.setMap = (x) => { if (!x) map.removeLayer(m); }; m.setLabel = (o) => m.setIcon(icon(o.text, k === 'turn')); m.setPosition = (o) => m.setLatLng([o.lat, o.lng]); PC.marks.set(k, m); return m; };
  mk('turn', t, turnPin().emoji); document.querySelectorAll('#pc-rows .pc-row').forEach((r) => { const g = parseGps(r.querySelector('.pc-gps').value); if (g) mk(r.dataset.k, g, pinT(r.querySelector('.pc-type').value).emoji); });
  if (PC.marks.size > 1) { const bb = L.latLngBounds([...PC.marks.values()].map((m) => m.getLatLng())); if (bb.getNorthEast().distanceTo(bb.getSouthWest()) > 30) map.fitBounds(bb, { padding: [40, 40], maxZoom: 16 }); }
  map.on('click', (ev) => { if (!PC || !PC.adding) return; PC.adding = false; $('#pc-hint').textContent = ''; const k = 'n' + (++PC.n); const p = { lat: ev.latlng.lat, lng: ev.latlng.lng };
    $('#pc-rows').insertAdjacentHTML('beforeend', pcRow(k, 'cattle', '', p)); mk(k, p, pinT('cattle').emoji); }); PC.mk = mk; }
async function pcMap(t) {
  if (MAPS_JS_BAD || !Maps.key()) { try { await pcMapL(t); if ($('#pc-hint')) $('#pc-hint').textContent = ''; } catch (e) { } return; } /* Google satellite map you can tap — needs the Maps JavaScript API on your key; otherwise the plain satellite view + typing/pasting the GPS */
  const el = $('#pc-map'); if (!el || !Maps.key()) { $('#pc-hint').textContent = Maps.key() ? '' : 'No Google Maps key — paste the GPS for each pin (from Google Maps) into the boxes below.'; return; }
  try { await loadScript(`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(Maps.key())}&v=weekly`); if (!window.google || !google.maps || !google.maps.Map) throw new Error('not loaded'); }
  catch (e) { delete SCRIPT_P[`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(Maps.key())}&v=weekly`]; MAPS_JS_BAD = true; try { await pcMapL(t); } catch (e2) { } return; }
  if (!PC || !$('#pc-map')) return; if (MAPS_JS_BAD) { pcMapL(t); return; } el.innerHTML = ''; el.classList.add('gmap-live'); el.addEventListener('gmfail', () => pcMapL(t), { once: true });
  const map = new google.maps.Map(el, { center: { lat: t.lat, lng: t.lng }, zoom: 16, mapTypeId: 'hybrid', streetViewControl: false, fullscreenControl: false, gestureHandling: 'greedy', tilt: 0 }); PC.map = map;
  const mk = (k, p, emo) => { const m = new google.maps.Marker({ position: { lat: +p.lat, lng: +p.lng }, map, draggable: true, label: { text: emo, fontSize: '20px' }, zIndex: k === 'turn' ? 1000 : 1, icon: { path: google.maps.SymbolPath.CIRCLE, scale: k === 'turn' ? 19 : 16, fillColor: '#fff', fillOpacity: 0.95, strokeColor: k === 'turn' ? '#d71f2b' : '#141414', strokeWeight: k === 'turn' ? 3 : 2 } });
    m.addListener('dragend', () => { const ll = m.getPosition(); const v = ll.lat().toFixed(6) + ', ' + ll.lng().toFixed(6); if (k === 'turn') $('#pc-turn').value = v; else { const r = document.querySelector(`#pc-rows .pc-row[data-k="${k}"] .pc-gps`); if (r) r.value = v; } }); PC.marks.set(k, m); return m; };
  mk('turn', t, turnPin().emoji); document.querySelectorAll('#pc-rows .pc-row').forEach((r) => { const g = parseGps(r.querySelector('.pc-gps').value); if (g) mk(r.dataset.k, g, pinT(r.querySelector('.pc-type').value).emoji); });
  const bounds = new google.maps.LatLngBounds(); PC.marks.forEach((m) => bounds.extend(m.getPosition())); const ne = bounds.getNorthEast(), sw = bounds.getSouthWest(); if (PC.marks.size > 1 && hav({ lat: ne.lat(), lng: ne.lng() }, { lat: sw.lat(), lng: sw.lng() }) > 0.03) { map.fitBounds(bounds, 60); google.maps.event.addListenerOnce(map, 'idle', () => { if (map.getZoom() > 17) map.setZoom(17); }); }
  map.addListener('click', (ev) => { if (!PC || !PC.adding) return; PC.adding = false; $('#pc-hint').textContent = ''; const k = 'n' + (++PC.n); const p = { lat: ev.latLng.lat(), lng: ev.latLng.lng() };
    $('#pc-rows').insertAdjacentHTML('beforeend', pcRow(k, 'cattle', '', p)); mk(k, p, pinT('cattle').emoji); });
  PC.mk = mk;
}
function pcAddMode() { if (!PC) return; if (PC.map) { PC.adding = true; $('#pc-hint').innerHTML = '<b>Tap the map where the yards are…</b>'; } else { const k = 'n' + (++PC.n); $('#pc-rows').insertAdjacentHTML('beforeend', pcRow(k, 'cattle', '', null)); } }
document.addEventListener('change', (e) => { if (!e.target.classList || !PC) return; const row = e.target.closest('.pc-row'); if (!row) return; const m = PC.marks.get(row.dataset.k);
  if (e.target.classList.contains('pc-type') && m && m.setLabel) m.setLabel({ text: pinT(e.target.value).emoji, fontSize: '20px' });
  if (e.target.classList.contains('pc-gps')) { const g = parseGps(e.target.value); if (g && m && m.setPosition) m.setPosition({ lat: g.lat, lng: g.lng }); else if (g && !m && PC.mk) PC.mk(row.dataset.k, g, pinT(row.querySelector('.pc-type').value).emoji); } });

/* ---------------- general info → business, relationships, pin checks ---------------- */
const REL_HEAD = /^\s*\*?\s*(relationships?|family|relations)\s*\*?\s*:?\s*$/i;
function infoSections(txt) { /* split "*Heading*" sections; returns [{head, lines:[]}] (head '' = text before the first heading) */
  const out = [{ head: '', lines: [] }]; (txt || '').split('\n').forEach((l) => { const m = l.match(/^\s*\*([^*]{2,40})\*\s*:?\s*$/); if (m || REL_HEAD.test(l)) out.push({ head: (m ? m[1] : l.replace(/[*:]/g, '')).trim(), lines: [] }); else out[out.length - 1].lines.push(l); }); return out; }
const joinSections = (secs) => secs.filter((x) => x.head || x.lines.join('').trim()).map((x) => (x.head ? `*${x.head}*\n` : '') + x.lines.join('\n').trim()).join('\n\n').trim();
const isRelSec = (x) => x.head && REL_HEAD.test(x.head);
function tplOnly(txt) { const t = (txt || '').replace(/^\s*\*[^*]+\*\s*$/gm, '').replace(/^\s*-?[^:\n]{1,30}:\s*$/gm, '').replace(/\s+/g, ''); return !t; }
function relLines(c) { const secs = infoSections(c.info).filter(isRelSec); return secs.flatMap((x) => x.lines.map((l) => l.trim()).filter((l) => l && l !== '-' && !/^\s*[-•*]?\s*(?:nanny\/)?(?:happy\s+)?helpers?\s*:/i.test(l))); } /* happy helper lines go to their own job */
const REL_WORDS = [[/husband/i, 'Husband'], [/wife/i, 'Wife'], [/partner|spouse|de facto/i, 'Partner'], [/in.?law/i, 'In-law'], [/mother|mum|mom/i, 'Mother'], [/father|dad/i, 'Father'], [/parent/i, 'Parent'], [/son\b/i, 'Son'], [/daughter/i, 'Daughter'], [/kid|child/i, 'Child'], [/brother/i, 'Brother'], [/sister/i, 'Sister'], [/sibling/i, 'Sibling'], [/grand ?(mother|father|parent|ma|pa)/i, 'Grandparent'], [/grand ?(son|daughter|child|kid)/i, 'Grandchild'], [/aunt|uncle/i, 'Aunt/Uncle'], [/niece|nephew/i, 'Niece/Nephew'], [/cousin/i, 'Cousin'], [/friend/i, 'Friend'], [/neighbo/i, 'Neighbour']];
function relProposals(c) { /* "-Husband: Jeff Stoney" → [{line, label, rel, names:[{text, o}]}] */
  return relLines(c).map((line) => { const t = line.replace(/^[-•*\s]+/, ''); let m = t.match(/^([^:]{1,40}):\s*(.*)$/);
    if (!m) { const m2 = t.match(/^([A-Za-z][A-Za-z' /-]{1,30}?)\s+(?:is|are|=|-|–)\s+(.+)$/i); if (m2 && REL_WORDS.some(([rx]) => rx.test(m2[1]))) m = m2; } // "Father is Alby Van Dongen"
    if (!m) return { line, names: [] };
    const label = m[1].trim(); const rel = (REL_WORDS.find(([rx]) => rx.test(label)) || [, label.replace(/^./, (x) => x.toUpperCase())])[1];
    const note = (m[2].match(/\(([^)]*)\)/g) || []).map((x) => x.slice(1, -1).trim()).filter(Boolean).join('; ');
    const names = m[2].replace(/\([^)]*\)/g, ' ').split(/,|\band\b|&|\//).map((x) => x.trim().replace(/\(.*?\)/g, '').trim()).filter(Boolean).map((text) => { const low = text.toLowerCase();
      let o = D.contacts.find((x) => x !== c && fullName(x).toLowerCase() === low) || (!/\s/.test(text) ? D.contacts.find((x) => x !== c && (x.first || '').toLowerCase() === low && ((x.last && x.last === c.last) || bizOf(x).some((b) => bizOf(c).includes(b)))) : null);
      return { text, o: o || null }; });
    return { line, label, rel, names, note }; }); }
let SURNAMES = null;
function relSuggest(c) { /* same surname and something shared (business, phone, email, address) — and not already linked as related */
  const last = (c.last || '').trim().toLowerCase(); if (last.length < 3) return [];
  if (!SURNAMES || SURNAMES.d !== D.contacts) { const m = new Map(); D.contacts.forEach((x) => { const k = (x.last || '').trim().toLowerCase(); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); SURNAMES = { d: D.contacts, m }; }
  const mine = { b: new Set(c.links.map((l) => l.bid)), ph: new Set([...c.mobiles, ...c.landlines].map((p) => p.value.replace(/\D/g, '').slice(-9)).filter((x) => x.length >= 8)), em: new Set(c.emails.map((e) => e.value.trim().toLowerCase())), po: new Set(c.postal.map((x) => x.trim().toLowerCase())) };
  const out = []; (SURNAMES.m.get(last) || []).forEach((o) => { if (o === c || o.id < c.id) return; if ([...(c.related || []), ...(c.noMentionRel || [])].some((r) => r.cid === o.id) || [...(o.related || []), ...(o.noMentionRel || [])].some((r) => r.cid === c.id)) return;
    const why = []; if (o.links.some((l) => mine.b.has(l.bid))) why.push('same surname, linked to the same business'); else if ([...o.mobiles, ...o.landlines].some((p) => mine.ph.has(p.value.replace(/\D/g, '').slice(-9)))) why.push('same surname and phone number'); else if (o.emails.some((e) => mine.em.has(e.value.trim().toLowerCase()))) why.push('same surname and email'); else if (o.postal.some((x) => mine.po.has(x.trim().toLowerCase()))) why.push('same surname and address');
    if (why.length) out.push({ o, why: why[0], rel: 'Other family', guess: relGuess(c, o) }); }); return out; }
function relGuess(a, b) { /* look for "Husband: Jeff" style lines in either person's general info → {relB: what b is to a, relA: what a is to b} */
  const find = (x, y) => { if (!(y.first || '').trim() || !x.info) return null; const rx = new RegExp('\\b' + y.first.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    const line = x.info.split('\n').find((l) => rx.test(l) && REL_WORDS.some(([w]) => w.test(l))); if (!line) return null; const lab = (line.match(/^[-•*\s]*([^:]{1,40}):/) || [, line])[1]; const w = REL_WORDS.find(([r]) => r.test(lab)); return w ? w[1] : null; };
  const r1 = find(a, b); if (r1) return { relB: genderize(r1, nameGender(b)), relA: backRel(r1, a), src: a };
  const r2 = find(b, a); if (r2) return { relB: backRel(r2, b), relA: genderize(r2, nameGender(a)), src: b }; return null; }
function relRemove(c, line) { /* take relationship lines out of general info — one line, or the whole relationships section when line is null */
  const secs = infoSections(c.info).map((x) => (isRelSec(x) ? { ...x, lines: line == null ? [] : x.lines.filter((l) => l.trim() !== line) } : x)).filter((x) => !isRelSec(x) || x.lines.join('').trim());
  c.info = joinSections(secs); delete c.infoHtml; touch(c); }
function relApply(c) { /* add the people found as related, take their lines out of general info */
  const props = relProposals(c); let n = 0; const used = new Set();
  props.forEach((p) => { (p.names || []).forEach((nm) => { if (!nm.o) { if (p.rel && !(c.related || []).some((r) => !r.cid && r.name === nm.text)) { setRelatedName(c, nm.text, genderize(p.rel, nameGender({ first: nm.text }))); n++; } return; } const o = nm.o; const existing = (c.related || []).find((r) => r.cid === o.id); setRelated(c, o, existing ? existing.rel : genderize(p.rel, nameGender(o)), backRel(p.rel, c) || ((o.related || []).find((r) => r.cid === c.id) || {}).rel || 'Other'); n++; }); if (p.names && p.names.length && p.rel && !p.note) used.add(p.line); });
  const secs = infoSections(c.info).map((x) => (isRelSec(x) ? { ...x, lines: x.lines.filter((l) => !used.has(l.trim())) } : x)).filter((x) => !isRelSec(x) || x.lines.join('').trim());
  c.info = joinSections(secs); delete c.infoHtml; touch(c); return n; }
function infoBlockFor(c, text) { return `*From ${fullName(c)}*\n${text}`; }
function infoAppend(b, block) { b.info = [b.info, block].filter((x) => (x || '').trim()).join('\n\n'); if (b.infoHtml) b.infoHtml += `<p><b>From ${h(block.split('\n')[0].replace(/^\*From |\*$/g, ''))}</b></p><p>${h(block.split('\n').slice(1).join('\n')).replace(/\n/g, '<br>')}</p>`; touch(b); }
function infoRemove(b, block) { if ((b.info || '').includes(block)) { b.info = b.info.replace('\n\n' + block, '').replace(block, '').trim(); delete b.infoHtml; touch(b); return true; } return false; }
function runBigMoves() { /* general info of client people → their client business (job to check); every pin → a turn-off (job to check) */
  let nInfo = 0, nPend = 0, nPins = 0;
  D.contacts.forEach((c) => { if (!isClientPerson(c) || !(c.info || '').trim() || tplOnly(c.info) || c.infoMove) return;
    const secs = infoSections(c.info); const keep = secs.filter(isRelSec), move = secs.filter((x) => !isRelSec(x)); const text = joinSections(move); if (!text || tplOnly(text)) return;
    const bs = bizOf(c).filter(isClientBiz); if (!bs.length) return;
    if (bs.length === 1) { const block = infoBlockFor(c, text); infoAppend(bs[0], block); c.info = joinSections(keep); delete c.infoHtml; c.infoMove = { bid: bs[0].id, block, at: Date.now() }; nInfo++; }
    else { c.infoMove = { pending: true, text, at: Date.now() }; nPend++; }
    touch(c); });
  D.farms.forEach((f) => { if (f.lat != null && !(f.turn && f.turn.lat != null) && !f.pinChecked) { f.turn = { lat: f.lat, lng: f.lng }; f.yardsWas = { lat: f.lat, lng: f.lng }; f.lat = f.lng = null; touch(f); nPins++; } });
  return { nInfo, nPend, nPins };
}
async function bigMigrate() { /* runs once (on whichever device gets there first), only after a backup has been saved to Google Drive */
  if (window.SEED || D.settings.bigMove1 || S.bigBusy || !Sync.enabled() || !GAuth.valid() || !navigator.onLine || CONFIRM || SHEET || !D.contacts.length) return;
  if (D.farms.some((f) => f.yardsWas) || D.contacts.some((c) => c.infoMove)) { D.settings.bigMove1 = Date.now(); touch(D.settings); S.skipConfirm = true; await changed(); return; } // already done on another device
  S.bigBusy = true;
  try { await Backup.make(Backup.day() + '-before-info-and-pin-changes'); }
  catch (e) { console.warn('backup before changes failed', e); S.bigBusy = false; return; }
  try { const r = runBigMoves(); D.settings.bigMove1 = Date.now(); touch(D.settings);
    NEXT_LOG_LABEL = `Automatic update (backup saved first): general info moved to businesses for ${r.nInfo} people (${r.nPend} to choose), ${r.nPins} pins set as turn-offs`; S.skipConfirm = true; await changed(); Sync.soon();
    toast('Backup saved — general info and pins are on the Jobs list to check'); }
  finally { S.bigBusy = false; }
}
function pinEmbed(p, z = 17) { return `<iframe title="Satellite map" src="https://maps.google.com/maps?q=${p.lat},${p.lng}&z=${z}&t=k&output=embed" style="width:100%;height:220px;border:0;border-radius:9px" loading="lazy"></iframe>`; }


/* ---------------- don't mention: people/relationships to avoid bringing up (two-way, like related people) ---------------- */
const NM_TYPES = ['Divorced', 'Ex-husband', 'Ex-wife', 'Ex-partner', 'Separated', 'Estranged family', 'Falling out', 'Passed away', 'Other'];
const NM_BACK = { Divorced: 'Divorced', 'Ex-husband': 'Ex-wife', 'Ex-wife': 'Ex-husband', 'Ex-partner': 'Ex-partner', Separated: 'Separated', 'Estranged family': 'Estranged family', 'Falling out': 'Falling out', 'Passed away': '', Other: 'Other' };
/* ---------------- happy helpers: people who help a business on busy days (preg testing…) but don't work for it ---------------- */
const helperKey = (x) => x.cid || 'n:' + x.name;
const helpsAt = (c) => D.businesses.filter((b) => (b.helpers || []).some((x) => x.cid === c.id));
function helpersCard(b) { const hs = (b.helpers || []).map((x) => ({ ...x, o: x.cid ? D.contacts.find((y) => y.id === x.cid) : null })).filter((x) => x.o || x.name);
  const rows = loSort(b, 'helpers', hs, helperKey, (x) => (x.o ? fullName(x.o) : x.name)).map((x) => [helperKey(x), `<div class="bcrow">${x.o ? `<div class="biz-link" data-act="open" data-kind="contact" data-id="${x.o.id}">${contactPhotoImg(x.o, 'av', 120)}<div><div style="font-weight:600">${h(fullName(x.o))}</div><div class="hint">${h(x.note || '')}${x.o && bizOf(x.o).length ? (x.note ? ' · ' : '') + h(bizOf(x.o).map((y) => y.name).join(', ')) : ''}</div></div></div>` : `<div style="flex:1"><div style="font-weight:600">${h(x.name)} ${NODET}</div><div class="hint">${h(x.note || '')}</div></div>`}<div class="bcacts"><button class="btn small" data-act="hh-note" data-bid="${b.id}" data-k="${h(helperKey(x))}" title="Note">✏️</button><button class="btn small" data-act="hh-del" data-bid="${b.id}" data-k="${h(helperKey(x))}" title="Remove">✕</button></div></div>`]);
  return `<div class="card helperscard"><h3><span class="sp">${SYM('n_helpers', '🙂')} ${h(bt('helpers', 'Happy helpers'))} (${hs.length})</span>${hs.length > 1 ? loBar('business', b, 'helpers') : ''}</h3><div class="hint" style="margin-bottom:4px">Not employed here — they help out on busy days (preg testing…). Their category isn't changed by this business.</div>${loWrap('business', b, 'helpers', rows) || ''}<input class="hh-q" data-bid="${b.id}" placeholder="➕ Add a happy helper — search by name or phone" style="margin-top:8px;width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:9px"><div class="hh-res"></div></div>`; }
function helpsCard(c) { const bs = helpsAt(c); if (!bs.length) return ''; return `<div class="card helperscard"><h3><span class="sp">${SYM('n_helpers', '🙂')} ${h(bt('helpsat', 'Happy helper at'))}</span></h3>${bs.map((b) => { const x = b.helpers.find((y) => y.cid === c.id); return `<div style="display:flex;align-items:center;gap:6px;margin:4px 0"><span class="biz-link sp" data-act="open" data-kind="business" data-id="${b.id}" style="flex:1">${h(b.name)}${x.note ? `<span class="hint"> · ${h(x.note)}</span>` : ''}</span><button class="btn small" data-act="hh-del" data-bid="${b.id}" data-k="${h(c.id)}" title="Remove">✕</button></div>`; }).join('')}</div>`; }
function addHelper(b, o, name, note) { b.helpers = b.helpers || []; const k = o ? o.id : 'n:' + name; if (b.helpers.some((x) => helperKey(x) === k)) return false; b.helpers.push(o ? { cid: o.id, ...(note ? { note } : {}) } : { name, ...(note ? { note } : {}) }); touch(b); return true; }
document.addEventListener('input', (e) => { const t = e.target; if (!t.classList || !t.classList.contains('hh-q')) return; const box = t.nextElementSibling; const pq = parseQuery(t.value); if (!pq.inc.length) { box.innerHTML = ''; return; } const b = IDX.biz.get(t.dataset.bid); const have = new Set((b.helpers || []).map((x) => x.cid));
  const digits = t.value.replace(/\D/g, ''); const cs = D.contacts.filter((c) => !have.has(c.id) && (matchQ(nameHay(c), pq) || (digits.length >= 4 && [...c.mobiles, ...c.landlines].some((p) => p.value.replace(/\D/g, '').includes(digits))))).slice(0, 6);
  box.innerHTML = `<div class="results">${cs.map((c) => `<div data-act="hh-pick" data-bid="${b.id}" data-cid="${c.id}"><b>${h(fullName(c))}</b> <span class="hint">${h(bizOf(c).map((x) => x.name).join(', '))}</span></div>`).join('')}<div data-act="hh-pick" data-bid="${b.id}" data-name="${h(t.value.trim())}" style="color:var(--green)">➕ Add “<b>${h(t.value.trim())}</b>” — name only</div></div>`; });
function helperLines(c) { return String(c.info || '').split('\n').filter((l) => /^\s*[-•*]?\s*(?:nanny\/)?(?:happy\s+)?helpers?\s*:/i.test(l)); }
function helperProps(c) { return helperLines(c).map((line) => { const t = line.replace(/^\s*[-•*]?\s*(?:nanny\/)?(?:happy\s+)?helpers?\s*:\s*/i, ''); const names = t.split(/,|\band\b|&/).map((x) => x.trim()).filter(Boolean).map((raw) => { const note = (raw.match(/\(([^)]*)\)/) || [, ''])[1].trim(); const text = raw.replace(/\([^)]*\)/g, '').replace(/\s+(usually|often|also)\b.*$/i, '').trim(); const low = text.toLowerCase();
    let o = text && /\s/.test(text) ? D.contacts.find((x) => x !== c && fullName(x).toLowerCase() === low) || D.contacts.find((x) => x !== c && (x.first + ' ' + x.last).toLowerCase() === low) : null;
    if (!o && /\s/.test(text)) { const ws = low.split(/\s+/), fn = ws[0], ln = ws.slice(1).join(' '); const m = D.contacts.filter((x) => x !== c && (x.last || '').toLowerCase() === ln && [x.first, x.pref].some((y) => { y = (y || '').toLowerCase(); return y && (y.startsWith(fn) || fn.startsWith(y)); })); if (m.length === 1) o = m[0]; } /* "Mal Auld" → Malcolm Auld */
    return { text, note, o: o || null }; }).filter((x) => x.text && x.text.length < 40);
  return { line, names }; }); }
function nameMatches(name, near) { /* contacts that could be a name-only person: full name (or short first name) match, or a first name only with the same surname / business as "near" */
  const low = String(name || '').toLowerCase().replace(/\([^)]*\)/g, '').trim(); if (!low || low.length < 2) return []; const ws = low.split(/\s+/);
  if (ws.length > 1) { const fn = ws[0], ln = ws.slice(1).join(' '); return D.contacts.filter((x) => (x.last || '').toLowerCase() === ln && [x.first, x.pref].some((y) => { y = (y || '').toLowerCase(); return y && (y === fn || y.startsWith(fn) || fn.startsWith(y)); })).slice(0, 3); }
  const nb = new Set(near.bids || []); const nl = (near.last || '').toLowerCase();
  return D.contacts.filter((x) => [x.first, x.pref].some((y) => (y || '').toLowerCase() === low) && (((x.last || '').toLowerCase() === nl && nl) || x.links.some((l) => nb.has(l.bid)) || (near.cids || []).some((id) => { const o = D.contacts.find((z) => z.id === id); return o && o.links.some((l) => x.links.some((m) => m.bid === l.bid)); }))).filter((x) => !(near.cids || []).includes(x.id)).slice(0, 3); }
function bizNoMentionRows(b) { /* every "don't mention" of the business's current people, each pair once */ const seen = new Set(), out = [];
  (IDX.bizContacts.get(b.id) || []).forEach((c) => { (c.noMentionRel || []).forEach((r) => { const o = r.cid ? D.contacts.find((x) => x.id === r.cid) : null; if (!o && !r.name) return; const key = o ? [c.id, o.id].sort().join('|') : c.id + '|n:' + r.name; if (seen.has(key)) return; seen.add(key); const back = o ? (o.noMentionRel || []).find((x) => x.cid === c.id) : null; out.push({ c, o, name: r.name, rel: r.rel || '', note: r.note || (back && back.note) || '', backRel: back ? back.rel || '' : '' }); }); if ((c.noMention || '').trim()) out.push({ c, text: c.noMention.trim() }); });
  return out; }
function bizNoMentionCard(b) { const rs = bizNoMentionRows(b); if (!rs.length) return '';
  return `<div class="card nomention"><h3><span class="sp">${SYM('n_nomention', '🤫')} ${h(bt('nomention', "Don't mention"))}</span></h3>${rs.map((r) => `<div class="kv"><div class="v" style="flex:1">${cLnk(r.c)}${r.text ? ` — ${h(r.text)}` : ` ↔ ${r.o ? cLnk(r.o) : `<span class="lnk nolnk">${h(r.name)}</span>`}${r.rel ? ' — ' + h(r.rel) : ''}${r.note ? ` <span style="font-weight:500">(${h(r.note)})</span>` : ''}`}</div></div>`).join('')}<div class="hint" style="margin-top:4px">From the people at this business — change them on each person's page.</div></div>`; }
function noMentionCard(c) { const rs = (c.noMentionRel || []).map((r) => ({ ...r, o: r.cid ? D.contacts.find((x) => x.id === r.cid) : null })).filter((r) => r.o || r.name).sort((a, b) => alphaCmp(a.o ? fullName(a.o) : a.name, b.o ? fullName(b.o) : b.name));
  if (!rs.length && !(c.noMention || '').trim()) return `<div class="card nomention empty"><h3><span class="sp">${SYM('n_nomention', '🤫')} ${h(bt('nomention', "Don't mention"))}</span><button class="btn small" data-act="nm-add" data-id="${c.id}" title="Add a person or relationship not to mention">➕</button></h3><div class="hint">Nothing recorded.</div></div>`;
  return `<div class="card nomention"><h3><span class="sp">${SYM('n_nomention', '🤫')} ${h(bt('nomention', "Don't mention"))}</span><button class="btn small" data-act="nm-add" data-id="${c.id}" title="Add a person or relationship not to mention">➕</button></h3>${rs.map((r) => `<div class="kv" style="align-items:center"><div class="v" style="flex:1">${r.o ? `<span class="lnk" data-act="open" data-kind="contact" data-id="${r.o.id}">${h(fullName(r.o))}</span>` : `<span class="lnk nolnk">${h(r.name)}</span> ${NODET}`}${r.rel ? ' — ' + h(r.rel) : ''}${r.note ? ` <span style="font-weight:500">${r.rel ? '(' + h(r.note) + ')' : '— ' + h(r.note)}</span>` : ''}</div><button class="btn small" data-act="nm-edit" data-id="${c.id}" data-key="${h(r.cid || 'n:' + r.name)}" title="Edit">✏️</button><button class="btn small" data-act="nm-del" data-id="${c.id}" data-key="${h(r.cid || 'n:' + r.name)}" title="Remove">✕</button></div>`).join('')}${(c.noMention || '').trim() ? `<div class="body" style="margin-top:6px">${h(c.noMention)} ${secEdit('contact', c.id, "Don't mention")}</div>` : ''}</div>`; }
const nmKey = (r) => r.cid || 'n:' + r.name;
document.addEventListener('input', (e) => { const t = e.target; if (!t.classList || !t.classList.contains('rr-who')) return; const row = t.closest('.relrow'); row.querySelector('.rr-cid').value = ''; row.querySelector('.rr-st').textContent = t.value.trim() ? 'Name only — or tap a match' : ''; const pq = parseQuery(t.value); const box = row.querySelector('.rr-res'); if (!pq.inc.length) { box.innerHTML = ''; return; }
  const cs = D.contacts.filter((c) => matchQ(nameHay(c), pq)).slice(0, 6); box.innerHTML = cs.length ? `<div class="results">${cs.map((c) => `<div data-act="rr-pick" data-cid="${c.id}"><b>${h(fullName(c))}</b> <span class="hint">${h(bizOf(c).map((b) => b.name).join(', '))}</span></div>`).join('')}</div>` : ''; });
function nmRow(r) { const o = r && r.cid ? D.contacts.find((x) => x.id === r.cid) : null; const nm = o ? fullName(o) : r ? r.name || '' : '';
  return `<div class="nmrow" data-cid="${o ? o.id : ''}" data-old="${r ? h(nmKey(r)) : ''}"><div class="rep" style="margin:0"><input class="nm-who" value="${h(nm)}" autocomplete="off" style="flex:3"><input class="nm-note" value="${h((r && r.note) || '')}" style="flex:3"><button type="button" class="btn small" data-act="nm-row-del" title="Remove">✕</button></div><div class="nm-res"></div></div>`; }
function nmSaveRows(c) { const box = $('#e-nmrows'); if (!box) return; const keep = new Set();
  [...box.querySelectorAll('.nmrow')].forEach((row) => { const name = row.querySelector('.nm-who').value.trim(); const note = row.querySelector('.nm-note').value.trim(); const cid = row.dataset.cid; const o = cid ? D.contacts.find((x) => x.id === cid) : null; if (!o && !name) return;
    const old = (c.noMentionRel || []).find((x) => nmKey(x) === (o ? o.id : 'n:' + name)) || (c.noMentionRel || []).find((x) => nmKey(x) === row.dataset.old) || {}; const rel = old.rel || '';
    const back = o ? (((o.noMentionRel || []).find((x) => x.cid === c.id) || {}).rel || rel) : null; keep.add(o ? o.id : 'n:' + name);
    if (row.dataset.old && row.dataset.old !== (o ? o.id : 'n:' + name)) { const prev = row.dataset.old.startsWith('n:') ? null : D.contacts.find((x) => x.id === row.dataset.old); nmPut(c, prev, row.dataset.old.slice(2), null); }
    nmPut(c, o, name, { rel, note }, back); });
  (c.noMentionRel || []).filter((r) => !keep.has(nmKey(r))).forEach((r) => nmPut(c, r.cid ? D.contacts.find((x) => x.id === r.cid) : null, r.name, null)); }
function nmPut(c, o, name, v, back) { /* add / update (v = {rel, note}) or remove (v = null) — two-way when the other person is a contact */
  const k = o ? o.id : 'n:' + name; c.noMentionRel = (c.noMentionRel || []).filter((r) => nmKey(r) !== k); if (v) c.noMentionRel.push(o ? { cid: o.id, ...(v.rel ? { rel: v.rel } : {}), ...(v.note ? { note: v.note } : {}) } : { name, ...(v.rel ? { rel: v.rel } : {}), ...(v.note ? { note: v.note } : {}) }); if (!c.noMentionRel.length) delete c.noMentionRel; touch(c);
  if (o && o !== c) { const ob = (o.noMentionRel || []).find((r) => r.cid === c.id); o.noMentionRel = (o.noMentionRel || []).filter((r) => r.cid !== c.id); if (v) o.noMentionRel.push({ cid: c.id, ...((back || (ob && ob.rel)) ? { rel: back || ob.rel } : {}), ...(ob && ob.note ? { note: ob.note } : {}) }); if (!o.noMentionRel.length) delete o.noMentionRel; touch(o); } }
document.addEventListener('input', (e) => { const t = e.target; if (!t.classList || !t.classList.contains('nm-who')) return; const row = t.closest('.nmrow'); row.dataset.cid = ''; const box = row.querySelector('.nm-res'); const pq = parseQuery(t.value); if (!pq.inc.length) { box.innerHTML = ''; return; }
  const me = SHEET && $('#e-first') ? null : null; void me; const cs = D.contacts.filter((c) => matchQ(nameHay(c), pq)).slice(0, 6); box.innerHTML = `<div class="results">${cs.map((c) => `<div data-act="nm-row-pick" data-cid="${c.id}"><b>${h(fullName(c))}</b> <span class="hint">${h(bizOf(c).map((b) => b.name).join(', '))}</span></div>`).join('')}<div data-act="nm-row-typed" style="color:var(--green)">✓ Just use “<b>${h(t.value.trim())}</b>” (not in the app)</div></div>`; });
function setNoMention(c, o, name, rel, note, back) { /* o = contact (two-way) or null with a typed name (this person only) */
  const k = o ? o.id : 'n:' + name; c.noMentionRel = (c.noMentionRel || []).filter((r) => nmKey(r) !== k); if (rel) c.noMentionRel.push(o ? { cid: o.id, rel, ...(note ? { note } : {}) } : { name, rel, ...(note ? { note } : {}) }); if (!c.noMentionRel.length) delete c.noMentionRel; touch(c);
  if (o) { o.noMentionRel = (o.noMentionRel || []).filter((r) => r.cid !== c.id); if (rel && back) o.noMentionRel.push({ cid: c.id, rel: back, ...(note ? { note } : {}) }); if (!o.noMentionRel.length) delete o.noMentionRel; touch(o); } }
function nmSheet(c, cur) { S.nmFor = c.id; S.nmPick = cur && cur.cid ? cur.cid : null; const o0 = S.nmPick ? D.contacts.find((x) => x.id === S.nmPick) : null;
  const sel = (id, v, list) => { const custom = v && !list.includes(v); return `<select id="${id}" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:9px"><option value="__custom" ${custom ? 'selected' : ''}>✏️ Custom…</option>${list.map((t) => `<option ${t === v ? 'selected' : ''}>${t}</option>`).join('')}</select><input id="${id}-c" value="${custom ? h(v) : ''}" ${custom ? '' : 'hidden'} style="width:100%;margin-top:4px;padding:9px;border:1px solid var(--line);border-radius:9px">`; };
  const back0 = o0 ? ((o0.noMentionRel || []).find((r) => r.cid === c.id) || {}).rel : '';
  openSheet("Don't mention — " + fullName(c), `<div class="hint" style="margin-bottom:8px">A person or relationship to avoid bringing up with ${h(c.first || fullName(c))}. If the other person is a contact, it's added to both of them.</div>
    <input id="nm-q" placeholder="🔍 Search contacts — or just type the name" value="${h(o0 ? fullName(o0) : cur ? cur.name || '' : '')}" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:9px;font-size:16px"><div id="nm-res"></div>
    <div class="f" style="margin-top:8px"><label>Don't mention because…</label>${sel('nm-rel', cur ? cur.rel : 'Divorced', NM_TYPES)}</div>
    <div class="f" id="nm-backwrap" style="${o0 ? '' : 'display:none'}"><label>On <span id="nm-oname">${h(o0 ? fullName(o0) : '')}</span>'s page show…</label>${sel('nm-back', back0 || NM_BACK[cur ? cur.rel : 'Divorced'] || 'Other', NM_TYPES)}</div>
    <div class="f"><label>Note (optional)</label><input id="nm-note" value="${h(cur && cur.note ? cur.note : '')}"></div>`, () => {
    const rv = (id) => { const v = $('#' + id).value; return v === '__custom' ? val(id + '-c') : v; };
    const o = S.nmPick ? D.contacts.find((x) => x.id === S.nmPick) : null; const name = val('nm-q'); if (!o && !name) { toast('Search for the person or type their name'); return false; }
    const rel = rv('nm-rel'); if (!rel) { toast('Choose why not to mention them'); return false; }
    if (cur && !cur.fresh && nmKey(cur) !== (o ? o.id : 'n:' + name)) setNoMention(c, cur.cid ? D.contacts.find((x) => x.id === cur.cid) : null, cur.name, null);
    setNoMention(c, o, o ? null : name, rel, val('nm-note'), o ? rv('nm-back') : null); NEXT_LOG_LABEL = `Don't mention: ${o ? fullName(o) : name} (${fullName(c)})`; return true; });
}
document.addEventListener('input', (e) => { if (e.target.id !== 'nm-q') return; S.nmPick = null; const bw = $('#nm-backwrap'); if (bw) bw.style.display = 'none'; const c = D.contacts.find((x) => x.id === S.nmFor); const pq = parseQuery(e.target.value); const res = pq.inc.length ? D.contacts.filter((x) => x !== c && matchQ(fullName(x).toLowerCase(), pq)).slice(0, 8) : [];
  $('#nm-res').innerHTML = res.length ? `<div class="results">${res.map((x) => `<div data-act="nm-pick" data-cid="${x.id}"><b>${h(fullName(x))}</b> <span class="hint">${h(bizOf(x).map((b) => b.name).join(', '))}</span></div>`).join('')}</div><div class="hint">Not a contact? Just keep the typed name — it's saved as “no contact details”.</div>` : e.target.value.trim() ? '<div class="hint">Not a contact — it will be saved as “no contact details”.</div>' : ''; });
document.addEventListener('change', (e) => { const t = e.target; if (!t.id || !/^nm-(rel|back)$/.test(t.id)) return; const ci = $('#' + t.id + '-c'); if (t.value === '__custom') { ci.hidden = false; ci.focus(); } else { ci.hidden = true; if (t.id === 'nm-rel' && NM_BACK[t.value] != null) { const b = $('#nm-back'); if (b && NM_BACK[t.value]) b.value = NM_BACK[t.value]; } } });

/* ---------------- related people (family, friends…) — no effect on businesses or categories ---------------- */
/* first-name → likely gender, so relationship suggestions can say son/daughter, brother/sister, husband/wife */
const NAMES_F = new Set('jolene jolie mckenzie gorgie abbey abbie abby abigail adele adrianne aileen alana alexandra alexis alice alicia alison allie allison amanda amber amelia amy andrea angela angie anita ann anna annabel annabelle anne annette annie april ashlea ashleigh audrey ava barb barbara bec becky belinda bella benita bernadette beth bethany betty bev beverley bianca billi bonnie brenda bree brianna bridget bridie brittany bronwyn brooke caitlin camille cara carla carly carmel carol caroline carolyn carrie casey cassandra cassie catherine cathy charlotte charmaine chelsea cheryl chloe christel christina christine christy cindy claire clara clare colleen collette cora courtenay courtney crystal dani danielle dawn deanne deb debbie deborah debra delwyn delys denise diana diane dianne dominique donna doreen dorothy elaine eleanor elise eliza elizabeth ella ellie emily emma erica erika esther eunice eva evelyn evie faye felicity fenella fiona frances gabrielle gail gemma georgia georgie georgina gillian ginny glenda gloria grace gwen hannah harriet hayley hazel heather heidi helen holly imogen irene isabel isabella isla ivy izzy jackie jacqui jacqueline jade jan jane janelle janet janine jasmine jayne jean jemma jen jenelle jenna jennifer jenny jess jessica jessie jill jo joan joanne jocelyn jodi jodie josephine josie joy judith judy julia julie june kaitlyn kaity karen karla kate kath katherine kathleen kathryn kathy katie katrina kay kayla kelli kellie kelly kelsey kerri kerrie kerryn kiara kim kimberley kira kirsten kirsty krista kristabel kristen kristine krystal krystie krystle kylie kym lara laura lauren lea leah leanne leeanne lena lene leonie lexi libby lily linda lisa liz lizzie lois lorraine louise lucy lyn lynda lynette lynne madeleine madison mandy marcia marg margaret margie margy maria marie marion marli martha mary maryanne matilda maureen meg megan mel melanie melinda melissa merinda merrellyn mia michelle milly mira miranda molly monica nadia naomi narelle natalie natasha nell nicola nicole nikki olivia paige pam pamela patricia paula pauline peggy penny peta philippa phoebe pip polly rachael rachel rebecca renae renee rhonda robyn rochelle rose rosie ruby ruth sally samantha sandra sara sarah shahna shannon sharee sharmane sharon sheena sheila shelley sherrilynn shirley shona simone siobhan skye sonia sonja sophia sophie stacey stacy stella stephanie sue susan suzanne suzie tahlia tammi tammy tania tanya tara tash tasha taya tayla teena tegan teisha teresa terri tess tina toni tracey tracy trevlyn trish trudy val valerie vanessa venessa veronica vicki vicky victoria viv vivienne wendy wenke yvonne zoe zoey'.split(' '));
const NAMES_M = new Set('aaron adam adrian aidan alan alastair albert alby alec alexander alf alister allan allen andrew andy angus anthony archie arthur asher ashton austin barney barry beau ben benjamin bernard bevan bill billy blake bob brad bradley branden brayden brendan brenton brett brian brodie bruce bruno bryce bryn callum cameron campbell carl carlton charles charlie chad chester clark clint clive cody colin connor craig damian damien damon dan daniel danny darrell darren darryl dave david dean declan dennis derek derick des dominic don donald doug dougie douglas drew duncan dylan eddie edward eli elliot enoch eric ethan evan fergus finn flynn frank fred fynn garry gary gavin geoff geoffrey george gerald glen glenn gordon graeme graham grant greg gregory hamish harold harrison harry harvey hayden henry herb howard hugh hugo ian isaac jack jackson jacob jai jake james jared jarrod jarvis jason jeff jeffrey jeremy jerome jesse jim jimmy joe joel johan john johnno johno jon jonathan jonathon jono jordan josh joshua julian justin jye kane kayden keith kelvin ken kenneth kent kevin kieran knud kurt kyle lachie lachlan lachy lance laurie lenny leo les lewis liam lincoln lindsay logan lorne louis louwrens luke mal malcolm marc marcus mark martin mason matt matthew max michael mick mike miles mitch mitchell murray nathan ned neil neville nic nick nicholas nigel nino noah noel norm norman oliver ollie oscar owen patrick paul percy pete peter phil phill phillip pierre ray raymond reece reuben rex rhys richard rick ricky rob robbie robert rocky rod rodney rohan ron ronald rory ross roy russ russel russell ryan sam scott sean seb sebastian shane shaun sid simeon simon spencer stan stephen steve steven stewart stuart ted terry theo thomas tim timothy toby todd tom tommy tony travis trent trevor tristan troy tyler udo vaughn vernon victor vince walter warren wayne will william zac zach zachary zak zenon'.split(' '));
function nameGender(c) { const n = ((c && c.first) || '').trim().toLowerCase().split(/[\s-]+/)[0].replace(/[^a-z']/g, ''); if (!n) return null; if (c.gender === 'm' || c.gender === 'f') return c.gender;
  if (NAMES_F.has(n)) return 'f'; if (NAMES_M.has(n)) return 'm'; if (/(a|ine|elle|ette|ina|ia)$/.test(n) && !/^(luca|joshua|ezra|nikita|andrea|noa)$/.test(n)) return 'f'; return null; } // null = can't tell from the name
const REL_NEUTRAL = { Husband: 'Partner', Wife: 'Partner', Brother: 'Sibling', Sister: 'Sibling', Son: 'Child', Daughter: 'Child', Mother: 'Parent', Father: 'Parent' };
const REL_GENDERED = { Partner: ['Husband', 'Wife'], Sibling: ['Brother', 'Sister'], Child: ['Son', 'Daughter'], Parent: ['Father', 'Mother'] };
function genderize(rel, g) { const G = REL_GENDERED[REL_NEUTRAL[rel] || rel]; return G && g ? G[g === 'm' ? 0 : 1] : rel; }
function backRel(rel, other) { return genderize(REL_BACK[rel] || 'Other', nameGender(other)); } // what "other" is, given what the first person is to them
const REL_TYPES = ['Aunt/Uncle', 'Brother', 'Child', 'Cousin', 'Daughter', 'Father', 'Friend', 'Grandchild', 'Grandparent', 'Husband', 'In-law', 'Mother', 'Neighbour', 'Niece/Nephew', 'Other', 'Other family', 'Parent', 'Partner', 'Sibling', 'Sister', 'Son', 'Wife', 'Works with'];
const REL_BACK = { Husband: 'Wife', Wife: 'Husband', Partner: 'Partner', Mother: 'Child', Father: 'Child', Parent: 'Child', Son: 'Parent', Daughter: 'Parent', Child: 'Parent', Brother: 'Sibling', Sister: 'Sibling', Sibling: 'Sibling', Grandparent: 'Grandchild', Grandchild: 'Grandparent', 'Aunt/Uncle': 'Niece/Nephew', 'Niece/Nephew': 'Aunt/Uncle', Cousin: 'Cousin', 'In-law': 'In-law', Friend: 'Friend', Neighbour: 'Neighbour', 'Works with': 'Works with', Other: 'Other', 'Other family': 'Other family' };
const relKey = (r) => r.cid || 'n:' + r.name;
const NODET = '<span class="nodet">no contact details</span>';
function relatedCard(c) { const rs = loSort(c, 'related', (c.related || []).map((r) => ({ ...r, o: r.cid ? D.contacts.find((x) => x.id === r.cid) : null })).filter((r) => r.o || r.name), relKey, (r) => (r.o ? fullName(r.o) : r.name));
  return `<div class="card"><h3><span class="sp">👪 Related people</span>${rs.length > 1 ? loBar('contact', c, 'related') : ''}<button class="btn small" data-act="rel-add" data-id="${c.id}" title="Add a related person">➕</button></h3>${loWrap('contact', c, 'related', rs.map((r) => [relKey(r), `<div class="kv" style="align-items:center"><div class="v" style="flex:1">${r.o ? `<span class="lnk" data-act="open" data-kind="contact" data-id="${r.o.id}">${h(fullName(r.o))}</span>` : `<span class="lnk nolnk">${h(r.name)}</span>`} <span class="hint">— ${h(r.rel)}${r.o && bizOf(r.o).length ? ' · ' + h(bizOf(r.o).map((b) => b.name).join(', ')) : ''}</span>${r.o ? '' : ' ' + NODET}</div><button class="btn small" data-act="rel-edit" data-id="${c.id}" data-key="${h(relKey(r))}" title="Edit">✏️</button><button class="btn small" data-act="rel-del" data-id="${c.id}" data-key="${h(relKey(r))}" title="Remove">✕</button></div>`])) || '<div class="hint">None yet — family or friends who aren\'t employees.</div>'}</div>`; }
function setRelatedName(c, name, rel) { /* someone who isn't a contact — kept on this person only */
  c.related = (c.related || []).filter((r) => r.name !== name || r.cid); if (rel) c.related.push({ name, rel }); if (!c.related.length) delete c.related; touch(c); }
function setRelated(a, b, relB, relA) { /* relB = what b is to a; relA = what a is to b */
  a.related = (a.related || []).filter((r) => r.cid !== b.id); b.related = (b.related || []).filter((r) => r.cid !== a.id);
  if (relB) a.related.push({ cid: b.id, rel: relB }); if (relA) b.related.push({ cid: a.id, rel: relA }); if (!a.related.length) delete a.related; if (!b.related.length) delete b.related; touch(a); touch(b); }
function relSelect(id, v) { const custom = v && !REL_TYPES.includes(v); return `<select id="${id}" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:9px"><option value="__custom" ${custom ? 'selected' : ''}>✏️ Custom…</option>${REL_TYPES.map((t) => `<option ${t === v ? 'selected' : ''}>${t}</option>`).join('')}</select><input id="${id}-c" value="${custom ? h(v) : ''}" ${custom ? '' : 'hidden'} style="width:100%;margin-top:4px;padding:9px;border:1px solid var(--line);border-radius:9px">`; }
function relAddSheet(c, pre) { /* pre = {cid, rel} or {name, rel} (editing / suggested) */
  S.relFor = c.id; S.relPick = pre ? (pre.cid || 'n:' + pre.name) : null; S.relWas = pre && (c.related || []).some((r) => relKey(r) === relKey(pre)) ? relKey(pre) : null;
  const o0 = pre && pre.cid ? D.contacts.find((x) => x.id === pre.cid) : null;
  openSheet('Related person — ' + fullName(c), `<div class="hint" style="margin-bottom:8px">For family and friends who aren't employees — it doesn't change anyone's category or business. Not a contact? Just type their name.</div>
    <input id="rel-q" placeholder="🔍 Search contacts — or type the name" value="${h(o0 ? fullName(o0) : pre && pre.name ? pre.name : '')}" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:9px;font-size:16px" autocomplete="off"><div id="rel-res"></div><div id="rel-form">${pre ? relForm(c, o0 || { first: pre.name, name: pre.name, nodet: true }, pre.rel) : ''}</div>`, () => {
    const pk = S.relPick; if (!pk) { toast('Pick the person, or tap "Add … (no contact details)"'); return false; }
    const rv = (id) => { const el = $('#' + id); if (!el) return ''; const v = el.value; return v === '__custom' ? val(id + '-c') : v; };
    const relB = rv('rel-b'); if (!relB) { toast('Choose how they are related'); return false; }
    if (S.relWas && S.relWas !== pk) { if (S.relWas.startsWith('n:')) setRelatedName(c, S.relWas.slice(2), null); else { const ow = D.contacts.find((x) => x.id === S.relWas); if (ow) setRelated(c, ow, null, null); } }
    if (pk.startsWith('n:')) { const name = pk.slice(2); setRelatedName(c, name, relB); NEXT_LOG_LABEL = `${name} (no contact details) added as ${c.first}'s ${relB.toLowerCase()}`; return true; }
    const o = D.contacts.find((x) => x.id === pk); if (!o) return false;
    setRelated(c, o, relB, rv('rel-a')); NEXT_LOG_LABEL = `${fullName(o)} added as ${c.first}'s ${relB.toLowerCase()}`; return true; });
}
function relForm(c, o, rel) { rel = genderize(rel || 'Other', nameGender(o)); const back = backRel(rel, c);
  if (o.nodet) return `<div class="card" style="padding:10px;margin-top:8px"><div class="f"><label><b>${h(o.name)}</b> ${NODET} is ${h(c.first || fullName(c))}'s…</label>${relSelect('rel-b', rel)}</div></div>`;
  return `<div class="card" style="padding:10px;margin-top:8px"><div class="f"><label><b>${h(fullName(o))}</b> is ${h(c.first || fullName(c))}'s…</label>${relSelect('rel-b', rel)}</div><div class="f"><label><b>${h(fullName(c))}</b> is ${h(o.first || fullName(o))}'s…</label>${relSelect('rel-a', back)}</div></div>`; }
document.addEventListener('input', (e) => { if (e.target.id !== 'rel-q') return; const c = D.contacts.find((x) => x.id === S.relFor); const pq = parseQuery(e.target.value); const res = pq.inc.length ? D.contacts.filter((x) => x !== c && matchQ([fullName(x), ...bizOf(x).map((b) => b.name)].join(' ').toLowerCase(), pq)).slice(0, 10) : [];
  S.relPick = null; const f = $('#rel-form'); if (f) f.innerHTML = ''; const typed = e.target.value.trim();
  $('#rel-res').innerHTML = typed ? `<div class="results">${res.map((x) => `<div data-act="rel-pick" data-cid="${x.id}"><b>${h(fullName(x))}</b> <span class="hint">${h(bizOf(x).map((b) => b.name).join(', '))}</span></div>`).join('')}<div data-act="rel-pick-name" style="color:var(--green)">➕ Add “<b>${h(typed)}</b>” — not a contact (no contact details)</div></div>` : ''; });
document.addEventListener('change', (e) => { const t = e.target; if (!t.id || !/^rel-[ab]$/.test(t.id)) return; const ci = $('#' + t.id + '-c'); if (t.value === '__custom') { ci.hidden = false; ci.focus(); } else { ci.hidden = true; if (t.id === 'rel-b') { const back = REL_BACK[t.value] ? backRel(t.value, D.contacts.find((x) => x.id === S.relFor)) : ''; if (back && $('#rel-a')) $('#rel-a').value = back; } } });

const secEdit = (kind, id, jump, label = '✏️') => `<button class="btn small secedit" data-act="${kind === 'business' ? 'edit-biz' : 'edit-contact'}" data-id="${id}" data-jump="${h(jump)}" title="Edit this section">${label}</button>`;
const JUMP_IDS = { inactive: ['#e-inwrap', '#e-binwrap'], category: ['#e-catcard'] }; // sections found by their exact box rather than by label
function jumpTo(txt) { /* open the editor at the section that was tapped, and flash it so it's easy to spot */ setTimeout(() => { const t = txt.toLowerCase();
  let f = (JUMP_IDS[t] || []).map((x) => $('#sheet ' + x)).find((x) => x && x.offsetParent !== null);
  if (!f) { const all = [...document.querySelectorAll('#sheet .form label, #sheet .form .lbl, #sheet .form summary, #sheet .form h3')]; const ltx = (x) => x.textContent.trim().toLowerCase().replace(/^[^a-z0-9]+/, ''); const lb = all.find((x) => ltx(x).startsWith(t)) || all.find((x) => ltx(x).includes(t)); f = lb && (lb.closest('.f') || lb.closest('details') || lb.closest('.card') || lb); }
  if (!f) return; if (f.tagName === 'DETAILS') f.open = true; f.scrollIntoView({ block: 'center' }); f.classList.remove('jumpflash'); void f.offsetWidth; f.classList.add('jumpflash'); setTimeout(() => f.classList.remove('jumpflash'), 2600);
  const inp = f.querySelector('textarea,input:not([type=checkbox]):not([type=radio]):not([type=hidden]),select,[contenteditable]'); if (inp && !/Mobile|Business phone|category/i.test(txt)) { inp.focus({ preventScroll: true }); setTimeout(() => f.scrollIntoView({ block: 'center' }), 400); } }, 120); }
function tagPill(t) { const src = tagPhotoSrc(t); return `<span class="tag ${src ? '' : 'noimg'}">${src ? `<img src="${src}" alt="">` : ''}${h(tagName(t))}</span>`; }
/* ---------------- farms: pin types, facilities, safety, reception, photos ---------------- */
const DEFAULT_PIN_TYPES = [{ id: 'cattle', name: 'Cattle yards', emoji: '🐄', yard: true }, { id: 'sheep', name: 'Sheep yards', emoji: '🐑', yard: true }, { id: 'office', name: 'Main office', emoji: '🏢' }, { id: 'depot', name: 'Depot', emoji: '🚚' }, { id: 'feedlot', name: 'Feedlot', emoji: '🌾', yard: true }, { id: 'shed', name: 'Shearing shed', emoji: '✂️', yard: true }, { id: 'saleyard', name: 'Saleyards', emoji: '🔨' }, { id: 'other', name: 'Other', emoji: '📍' }];
const EMOJI_LIB = [['🐄', 'cow cattle beef dairy'], ['🐂', 'bull ox cattle'], ['🐃', 'buffalo water'], ['🐮', 'cow face cattle'], ['🐑', 'sheep ewe ram lamb wool'], ['🐏', 'ram sheep'], ['🐐', 'goat'], ['🐖', 'pig pork piggery'], ['🐷', 'pig face'], ['🐎', 'horse stud'], ['🐴', 'horse face'], ['🦙', 'alpaca llama'], ['🐔', 'chicken poultry hen'], ['🦆', 'duck'], ['🐕', 'dog working'], ['🐶', 'dog face'], ['🐈', 'cat'], ['🐝', 'bee hive honey'], ['🦘', 'kangaroo roo'], ['🥛', 'milk dairy'], ['🧀', 'cheese dairy'], ['🥩', 'meat beef abattoir'], ['🍖', 'meat bone'], ['🌾', 'grain wheat crop feedlot hay'], ['🌽', 'corn maize'], ['🌱', 'seedling crop'], ['🌳', 'tree shade'], ['🌲', 'pine tree plantation'], ['🍇', 'grapes vineyard winery'], ['🍎', 'apple orchard'], ['🥕', 'carrot vegetables'], ['🏡', 'house home homestead office'], ['🏠', 'house building'], ['🏚️', 'old house shed'], ['🏘️', 'houses town'], ['🏬', 'depot store shop'], ['🏭', 'factory abattoir processor'], ['🏢', 'office building'], ['🏫', 'school'], ['🏥', 'hospital clinic vet'], ['🏛️', 'government office'], ['⛪', 'church'], ['🛖', 'hut shed'], ['⛺', 'tent camp'], ['🚜', 'tractor farm machinery'], ['🚚', 'truck transport delivery'], ['🚛', 'semi truck livestock transport'], ['🚗', 'car'], ['🛻', 'ute pickup'], ['⛽', 'fuel petrol diesel'], ['🅿️', 'parking'], ['🚧', 'roadworks construction'], ['🚩', 'flag turn off marker'], ['🏁', 'finish flag'], ['📍', 'pin location marker'], ['📌', 'pushpin'], ['⭐', 'star important'], ['❗', 'important warning'], ['⚠️', 'warning caution hazard'], ['⛔', 'no entry stop'], ['🔒', 'locked gate'], ['🚪', 'gate door entry'], ['🗝️', 'key'], ['💧', 'water tank dam trough'], ['🚰', 'water tap'], ['🌊', 'water river creek'], ['🔥', 'fire'], ['⚡', 'power electricity'], ['🔌', 'power plug'], ['🔨', 'saleyards auction hammer'], ['⚖️', 'scales weigh'], ['✂️', 'shearing shed scissors'], ['💉', 'vaccine injection vet'], ['🧪', 'lab test'], ['🔬', 'laboratory microscope'], ['🩺', 'vet stethoscope'], ['📦', 'box storage'], ['🧰', 'tools toolbox'], ['🛠️', 'tools workshop'], ['🏗️', 'building construction'], ['🗑️', 'rubbish tip'], ['☎️', 'phone'], ['📶', 'reception signal'], ['🧭', 'compass navigate'], ['🗺️', 'map'], ['⛰️', 'mountain hill'], ['🏞️', 'park national'], ['🏖️', 'beach'], ['❄️', 'cold store freezer'], ['🧊', 'ice cold'], ['🪵', 'wood timber'], ['🧱', 'brick wall'], ['🟢', 'green circle'], ['🔴', 'red circle'], ['🟡', 'yellow circle'], ['🔵', 'blue circle'], ['🟣', 'purple circle'], ['🟠', 'orange circle'], ['⚫', 'black circle'], ['⚪', 'white circle']];
const PIN_EMOJIS = ['🐄', '🐂', '🐃', '🐑', '🐐', '🐖', '🐎', '🥛', '🏡', '🏠', '🏬', '🏭', '🌾', '🚜', '✂️', '🔨', '⚖️', '💉', '🧪', '🐕', '⛽', '🅿️', '🚚', '💧', '🌳', '⛺', '📦', '📍', '⭐'];
function emojiGrid(q) { q = (q || '').toLowerCase().trim(); const list = q ? EMOJI_LIB.filter(([e, k]) => k.includes(q) || q.split(/\s+/).every((w) => k.includes(w))) : EMOJI_LIB; return list.length ? list.map(([e, k]) => `<button type="button" data-act="emo-pick" data-e="${e}" title="${h(k)}">${e}</button>`).join('') : '<div class="hint">No symbols match — try another word, or use your keyboard\'s emoji search.</div>'; }
document.addEventListener('change', async (e) => { const t = e.target; if (!t.dataset || !t.dataset.pinloc) return; const list = pinTypes().map((x) => ({ ...x })); const pt = list.find((x) => x.id === t.dataset.pinloc); if (!pt) return; pt.yard = t.value === 'yard'; D.settings.pinTypes = list; touch(D.settings); NEXT_LOG_LABEL = `${pt.emoji} ${pt.name} is now a ${pt.yard ? 'yard' : 'non-farm'} location`; await changed(); renderAll(); });
document.addEventListener('input', (e) => { if (e.target.id === 'pt-search') { const g = $('#pt-grid'); if (g) g.innerHTML = emojiGrid(e.target.value); } });
const isYardType = (id) => !!pinT(id).yard;
const pinTypes = () => (D.settings.pinTypes && D.settings.pinTypes.length ? D.settings.pinTypes : DEFAULT_PIN_TYPES);
const pinT = (id) => (id === 'turn' ? { id: 'turn', name: turnName(), emoji: turnPin().emoji } : null) || pinTypes().find((t) => t.id === id) || { id: id || 'other', name: id ? id : 'Pin', emoji: '📍' };
const turnPin = () => ({ name: 'Turn-off', emoji: '🚩', ...((D && D.settings && D.settings.turnPin) || {}) }); // the built-in "turn-off from the road" pin — name and symbol can be changed in Settings → Pin types
const turnName = () => turnPin().name || 'Turn-off';
const FAC_FIELDS = [
  ['crush', 'Crush', [['', 'Not recorded'], ['left', 'Left-sided'], ['right', 'Right-sided'], ['both', 'Either side'], ['none', 'No crush']]],
  ['headbail', 'Headbail', [['', 'Not recorded'], ['auto', 'Auto / self-catching'], ['manual', 'Manual'], ['none', 'No headbail']]],
  ['race', 'Race', [['', 'Not recorded'], ['fixed', 'Fixed race'], ['portable', 'Portable panels'], ['none', 'No race']]],
  ['power', 'Power', [['', 'Not recorded'], ['onsite', 'Power at the yards'], ['generator', 'Their generator'], ['byo', 'BYO power']]],
];
const FAC_TICKS = [['cover', 'Cover / shade'], ['light', 'Lighting'], ['water', 'Water'], ['ramp', 'Loading ramp'], ['scales', 'Scales'], ['cradle', 'Calf cradle'], ['vetgate', 'Vet gate / kick gate']];
const SAFETY = { ok: { l: 'OK', c: '' }, caution: { l: 'Caution', c: 'caution' }, stop: { l: 'No routine work until fixed', c: 'sfstop' } };
const RECEPTION = { '': 'Not known', good: 'Good reception', patchy: 'Patchy reception', none: 'No reception' };
const WET = { '': 'Not recorded', any: 'OK in all weather', '4wd': '4WD needed when wet', dry: 'Dry weather only' };
function facSummary(fac) { if (!fac) return ''; const out = []; FAC_FIELDS.forEach(([k, , opts]) => { if (fac[k]) out.push((opts.find((o) => o[0] === fac[k]) || [, fac[k]])[1] + (k === 'crush' && fac[k] !== 'none' ? ' crush' : k === 'headbail' && fac[k] !== 'none' ? ' headbail' : k === 'race' && !['none', 'fixed'].includes(fac[k]) ? ' race' : '')); }); FAC_TICKS.forEach(([k, l]) => { if (fac[k]) out.push(l); }); return out.join(' · '); }
function svUrl(p, w = 640, hgt = 360) { const k = Maps.key(); if (!k || !p) return ''; return `https://maps.googleapis.com/maps/api/streetview?size=${w}x${hgt}&location=${p.lat},${p.lng}&radius=${p.radius || 1500}&fov=${p.fov || 80}${p.heading != null ? '&heading=' + p.heading : ''}&source=outdoor&return_error_code=true&key=${encodeURIComponent(k)}`; }
function photoSrc(ph, w, hgt) { return ph.kind === 'sv' ? svUrl(ph, w, hgt) : ph.data || ''; }
function farmPhotosHtml(f, small) { const ps = (f.photos || []).filter((ph) => ph.kind !== 'sv' && photoSrc(ph)); if (!ps.length) return ''; return `<div class="fphotos">${ps.map((ph) => `<a href="${ph.kind === 'sv' ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ph.lat},${ph.lng}` : photoSrc(ph)}" target="_blank" rel="noopener" title="${h(ph.caption || '')}"><img loading="lazy" src="${photoSrc(ph, small ? 320 : 640, small ? 180 : 360)}" alt="${h(ph.caption || 'Farm photo')}" onerror="this.parentNode.style.display='none'"></a>`).join('')}</div>`; }
function safetyBanner(sf, label) { if (!sf || !sf.status || sf.status === 'ok') return ''; return `<div class="fsafety ${SAFETY[sf.status].c}">${sf.status === 'stop' ? '⛔' : '⚠'} <b>${h(label ? label + ': ' : '')}${SAFETY[sf.status].l}</b>${sf.note ? ' — ' + h(sf.note) : ''}${sf.date ? `<span class="hint"> (${h(sf.date)}${sf.by ? ', ' + h(sf.by) : ''})</span>` : ''}</div>`; }
function biosecBanner(txt, from) { const o = secOver('contact', 'biosec') || {}; const t = bt('biosec', o.name || 'Biosecurity'), e = SYM('n_biosec', o.emoji != null ? o.emoji : '🦠'); return (txt || '').trim() ? `<div class="fbiosec">${e ? e + ' ' : ''}<b>${h(t)}${from ? ' — ' + h(from) : ''}:</b> ${h(txt)}</div>` : ''; }
function farmBiosecOf(f) { /* the farm's own note plus any from the businesses using it */ const out = []; if ((f.biosec || '').trim()) out.push({ txt: f.biosec, from: '' }); farmUsersOf(f.id).filter((u) => !u.past && (u.b.biosec || '').trim()).forEach((u) => out.push({ txt: u.b.biosec, from: u.b.name })); return out; }
function farmTurns(f) { /* every turn-off: the main one (distance is measured to it) then any others, each with a clear name */
  const ts = []; if (f.turn && f.turn.lat != null) ts.push({ p: f.turn, name: f.turnLabel || turnName(), acc: f.access, tbc: !!f.turnTbc, key: 'main' }); (f.extra || []).filter((x) => x.type === 'turn').forEach((x, i) => ts.push({ p: x.lat != null ? { lat: x.lat, lng: x.lng } : null, name: x.name || turnName() + ' ' + (i + 2), acc: x.access, tbc: !!x.tbc, key: x.id }));
  if (ts.length > 1 && !f.turnLabel) ts[0].name = turnName() + ' 1'; return ts; }
function lostFarms() { /* rebuild farms from the change log that are gone but were never put in the trash */
  const have = new Set(D.farms.map((f) => f.id)); const trashed = new Set((D.trash || []).filter((t) => t.kind === 'farm').map((t) => t.rec && t.rec.id).filter(Boolean)); const gone = new Set((D.deleted || []).filter((x) => x.kind === 'farms').map((x) => x.id));
  const L = (D.changelog || []).slice().sort((a, b) => a.at - b.at); const recs = new Map();
  L.forEach((e) => (e.items || []).forEach((it) => { if (it.kind !== 'farms' || !it.id || have.has(it.id) || trashed.has(it.id) || !gone.has(it.id)) return;
    if (it.deleted) { recs.set(it.id, null); return; } if (it.created) recs.set(it.id, { rec: JSON.parse(JSON.stringify(it.after || {})), at: e.at, by: e.dev });
    else if (recs.get(it.id)) { const r = recs.get(it.id).rec; Object.entries(it.after || {}).forEach(([k, v]) => { if (v === null) delete r[k]; else r[k] = JSON.parse(JSON.stringify(v)); }); } }));
  const out = []; recs.forEach((v, id) => { if (!v || !v.rec) return; const viaLog = L.flatMap((e) => (e.items || []).filter((it) => it.kind === 'businesses' && ((it.after || {}).farmLinks || []).some((l) => l.fid === id)).map((it) => it.id)); const bid = [...viaLog, (v.rec.owner || {}).bid].find((x) => x && IDX.biz.get(x));
    out.push({ id, rec: v.rec, at: v.at, by: v.by, bid, bname: bid ? IDX.biz.get(bid).name : '' }); }); return out; }
function oldFarmInfo(f) { const out = []; const fs = facSummary(f.fac); if (fs) out.push('🛠 Facilities: ' + fs); const rc = f.reception || {}; if (rc.status || rc.note) out.push('📶 Reception: ' + [RECEPTION[rc.status] || '', rc.note || ''].filter(Boolean).join(' — ')); if ((f.biosec || '').trim()) out.push('🦠 Biosecurity: ' + f.biosec.trim()); return out; }
function farmYards(f) { /* every yards / extra pin on a farm with a clear name — numbered when two would read the same */
  const ys = []; if (f.lat != null || !(f.turn && f.turn.lat != null) || (f.extra || []).some((x) => x.type !== 'turn') || f.yLabel) ys.push({ p: f.lat != null ? { lat: f.lat, lng: f.lng } : null, emo: pinT(f.pinType).emoji, name: f.yLabel || pinT(f.pinType).name, lab: !!f.yLabel, tbc: !!f.yTbc });
  else if (f.turn && f.turn.lat != null) ys.push({ p: null, emo: pinT(f.pinType).emoji, name: pinT(f.pinType).name, lab: false });
  (f.extra || []).filter((x) => x.type !== 'turn').forEach((x) => ys.push({ p: x.lat != null ? { lat: x.lat, lng: x.lng } : null, emo: pinT(x.type).emoji, name: x.name || pinT(x.type).name, lab: !!x.name, tbc: !!x.tbc }));
  const cnt = {}; ys.forEach((y) => { cnt[y.name] = (cnt[y.name] || 0) + 1; }); const seen = {}; ys.forEach((y) => { if (cnt[y.name] > 1) { seen[y.name] = (seen[y.name] || 0) + 1; y.name += ' ' + seen[y.name]; } }); return ys; }
function farmCard(b, f, withFlags = true, past = false) {
  const verify = f.kmStatus === 'needs-verify'; const pt = pinT(f.pinType); const sf = f.safety || {};
  const users = farmUsersOf(f.id).filter((u) => u.b !== b && !u.past); /* past users of a farm aren't listed on other contacts */ const fo = farmOwner(f); const owner = fo.b || null;
  const ownerTxt = ownedBy(f, b) && !fo.c ? '' : fo.name || (f.owner && f.owner.unknown ? 'unknown owner' : '');
  const ts = farmTurns(f).filter((t) => t.p), ys = farmYards(f), ysp = ys.filter((y) => y.p); const tl = (t) => (ts.length > 1 || f.turnLabel ? t.name : turnName());
  const chip = (emo, lbl, tbc) => `<span class="pemo">${emo}</span> ${h(lbl)}${tbc ? ' <b>TBC</b>' : ''}`;
  const pinsHtml = !ts.length && !ysp.length ? '<div class="fpins"><span class="fpin none">No GPS pin yet — tap ✏️ to add one</span></div>' : `<div class="fpingrp">
    <div class="fpg"><div class="fpgh">🧭 Directions <span class="hint">— start driving there</span></div><div class="fpins">${ts.map((t) => `<a class="fpin ${t.tbc ? 'tbc' : ''}" href="${gmapsNav(t.p)}" target="_blank" rel="noopener">${chip(turnPin().emoji, tl(t), t.tbc)}</a>`).join('')}${ysp.map((y) => `<a class="fpin ${y.tbc ? 'tbc' : ''}" href="${gmapsNav(y.p)}" target="_blank" rel="noopener">${chip(y.emo, y.name, y.tbc)}</a>`).join('')}</div></div>
    <div class="fpg"><div class="fpgh">🗺 Map <span class="hint">— see where the pin is</span></div><div class="fpins">${ts.map((t) => `<a class="fpin ${t.tbc ? 'tbc' : ''}" href="${gmapsPin(t.p)}" target="_blank" rel="noopener">${chip(turnPin().emoji, tl(t), t.tbc)}</a>`).join('')}${ys.map((y) => y.p ? `<a class="fpin ${y.tbc ? 'tbc' : ''}" href="${gmapsPin(y.p)}" target="_blank" rel="noopener">${chip(y.emo, y.name, y.tbc)}</a>` : `<span class="fpin none">${y.emo} ${h(y.name)} — no pin yet</span>`).join('')}${ts.length + ysp.length > 1 ? `<button type="button" class="fpin allpins" data-act="farm-allpins" data-bid="${b.id}" data-fid="${f.id}">🗺 All pins for this farm</button>` : ''}</div></div>
    ${ts.length ? `<div class="fpg"><div class="fpgh">📷 Street View <span class="hint">— see the ${h(turnName().toLowerCase())} from the road, and move it if it's wrong</span></div><div class="fpins">${ts.map((t) => `<button type="button" class="fpin" data-act="sv-edit" data-fid="${f.id}" data-k="${t.key}">${chip(turnPin().emoji, tl(t), t.tbc)}</button>`).join('')}</div></div>` : ''}</div>`;
  const HEAD = `<div class="farm ${f.seeWarning || sf.status === 'stop' ? 'red' : sf.status === 'caution' ? 'amber' : ''} ${past ? 'pastfarm' : ''}"><div class="fn" style="display:flex;gap:8px;align-items:flex-start"><span style="flex:1">${f.seeWarning ? '⚠ ' : ''}${h(f.name || pt.name)}${past ? ' <span class="pill" style="background:var(--line);color:var(--ink2)">Not current</span>' : ''}</span><button class="btn small secedit" data-act="edit-farm" data-bid="${b.id}" data-fid="${f.id}" title="Edit this farm">✏️</button></div>`; const P = {};
  P.address = `${f.address ? `<div>${h(f.address)}</div>` : ''}`;
  P.info = `${f.info ? `<div class="body farminfo" style="margin-top:4px;font-size:14.5px">${h(f.info)}</div>` : ''}`;
  P.meta = `<div class="meta"><span>${verify ? '<span class="verify">Distance requires verification</span> ' : ''}${fmtKm(f)}</span>${f.driveMin != null ? `<span>⏱ ${fmtMin(f.driveMin)} each way</span>` : ''}${f.reception && f.reception.status ? `<span class="recep ${f.reception.status}">📶 ${RECEPTION[f.reception.status]}</span>` : ''}</div>`;
  P.users = `${users.length || ownerTxt ? `<div class="hint" style="margin-top:3px">${users.length ? `Also used by: ${users.map((u) => `<span class="lnk" data-act="open" data-kind="business" data-id="${u.b.id}">${h(u.b.name)}</span>`).join(', ')}` : ''}${users.length && ownerTxt ? ' · ' : ''}${ownerTxt ? `Owned by: ${owner ? bLnk(owner) : fo.c ? cLnk(fo.c) : h(ownerTxt)}` : ''}</div>` : ''}`;
  P.safety = `${safetyBanner(sf)}${(f.extra || []).map((x) => safetyBanner(x.safety, pinT(x.type).emoji + ' ' + (x.name || pinT(x.type).name))).join('')}`;
  P.biosec = `${farmBiosecOf(f).filter((x) => x.from !== b.name).map((x) => biosecBanner(x.txt, x.from)).join('')}`;
  P.pins = `${pinsHtml}`;
  P.access = `${(() => { const tt = farmTurns(f); const ex = (f.extra || []).filter((x) => x.type === 'turn'); return accessLine(f.access, tt.length > 1 ? tt[0].name : '') + ex.map((x, i) => accessLine(x.access, (tt[i + 1] || {}).name || x.name)).join(''); })()}`;
  P.fac = `${facSummary(f.fac) ? `<div class="hint" style="margin-top:3px">🛠 ${h(facSummary(f.fac))}</div>` : ''}`;
  P.recep = `${(f.reception || {}).note ? `<div class="hint">📶 ${h(f.reception.note)}</div>` : ''}`;
  P.notes = `${NOTE_KS.farm.map((k) => { const n = noteCount('farm', f, k); return n ? `<div class="farmnote fn-${k}"><div class="fnh">${kInfo('farm', k).emo} ${h(kInfo('farm', k).l)}${FARM_KINDS[k].check && n ? ' <span class="fncheck">CHECK WARNING</span>' : ''}</div>${notesInner('farm', f.id, k, { noRes: true })}</div>` : ''; }).join('')}`;
  P.photos = `${farmPhotosHtml(f, true)}`;
  P.flags = `${withFlags ? flagLines('business', b.id, f.id) : ''}`;
  P.actions = `<div class="actions" style="margin:8px 0 0">${(f.lat != null || (f.turn && f.turn.lat != null)) && !past ? `<button class="btn small" data-act="route-add" data-fid="${f.id}">➕ Add to route</button>` : ''}<button class="btn small" data-act="note-add" data-type="farm" data-id="${f.id}" data-k="" title="Add a warning, caution or repair">➕ Warning / caution / repair</button><button class="btn small" data-act="farm-past" data-bid="${b.id}" data-fid="${f.id}">${past ? 'Make current' : 'Make not current'}</button><button class="btn small" data-act="farm-own" data-bid="${b.id}" data-fid="${f.id}">${ownedBy(f, b) ? 'Make not owned' : 'Make owned'}</button><button class="btn small" data-act="del-farm" data-bid="${b.id}" data-fid="${f.id}" style="color:var(--red)">🗑 Delete</button></div>`;
  const FM = layoutModes('farm'); return HEAD + layoutKeys('farm').map((k) => { const part = P[k] || ''; if (!part.trim()) return ''; return FM[k] === 'fold' ? `<details class="farmfold"><summary>${h(layoutLabel('farm', k))}</summary>${part}</details>` : part; }).join('') + '</div>';
}
function svAsk(f) { /* "is this Street View photo useful?" — only when there's a key, a pin and no photo yet */
  if (!Maps.key() || f.svNo || (f.photos || []).length || (f.lat == null && !(f.turn && f.turn.lat != null))) return '';
  const p = f.turn && f.turn.lat != null ? { lat: f.turn.lat, lng: f.turn.lng, radius: 300 } : { lat: f.lat, lng: f.lng, radius: 2000 };
  return `<div class="svask"><div class="hint">📷 Google Street View near this ${f.turn && f.turn.lat != null ? 'turn-off' : 'farm'} — is it a useful photo?</div><img loading="lazy" src="${svUrl(p, 480, 270)}" alt="Street View" onerror="this.closest('.svask').remove()"><div class="actions" style="margin-top:4px"><button class="btn small greenbtn" data-act="sv-yes" data-fid="${f.id}" data-lat="${p.lat}" data-lng="${p.lng}" data-r="${p.radius}">✓ Keep photo</button><button class="btn small" data-act="sv-no" data-fid="${f.id}">Not useful</button></div></div>`;
}
function bizDetail(b) {
  const cs = IDX.bizContacts.get(b.id) || [];
  let html = `<div class="d-wrap"><div class="dtop"><button class="back" data-act="back">‹ Back</button><button class="btn small secedit" data-act="edit-biz" data-id="${b.id}" title="Edit ${h(b.name)}">✏️ Edit</button></div>
  <div class="hero" style="display:block"><h2>${b.rating ? rbadge(b.rating) : ''}${h(b.name)}${b.abbr ? ` <span class="nee">(${h(b.abbr)})</span>` : ''}</h2><div class="sub">${isClientBiz(b) ? 'Client business' : 'Non-client business (industry)'} · ${cs.length} contact${cs.length === 1 ? '' : 's'} · ${b.farms.length} ${locWord(b, b.farms.length !== 1).toLowerCase()}</div></div>
  <div class="actions"><button class="btn" data-act="add-farm" data-bid="${b.id}">➕ ${locWord(b)}</button>${b.farms.some((f) => f.lat != null) ? `<button class="btn" data-act="route-add-biz" data-bid="${b.id}">➕ All farms to route</button>` : ''}</div>`;
  html += flagLines('business', b.id).replace(/<div class="flagline">/g, '<div class="flagline">');
  if (bizCat(b) === 'inactive') html += inactiveBox(b.inactiveReason, 'business', b.id);
  if ((b.cats || []).includes('dna')) html += `<div class="dnabanner">${h(bt('dna', '☠️ DO NOT ANSWER — NO FUTURE SERVICE ☠️'))}</div>${dnaReasonBox(b.dnaReason)}`;
  html += expandBox(b.id, 'business');
  const M = []; const mark = (k) => M.push([k, html.length]);
  mark('warn');
  html += noteCard('business', b, 'warn') + noteCard('business', b, 'caution');
  mark('biosec');
  html += biosecBanner(b.biosec);
  mark('side');
  html += noteCard('business', b, 'side');
  mark('nomention');
  html += bizNoMentionCard(b);
  mark('cat');
  html += `<div class="card"><h3><span class="sp">Contact category</span><button class="btn small" data-act="cat-edit" data-bid="${b.id}">Change…</button></h3>${b.rating || (b.cats || []).length ? `<div class="tagrow">${[...(b.rating ? [b.rating] : []), ...(b.cats || [])].map(tagPill).join('')}</div>` : '<div class="hint">None set.</div>'}${cs.filter((c) => c.ownCats || ownRating(c)).length ? `<div class="hint" style="margin-top:6px">Own categories: ${h(cs.filter((c) => c.ownCats || ownRating(c)).map((c) => c.first).join(', '))}</div>` : ''}</div>`;
  mark('phone');
  if (!isClientBiz(b) || bizHasDetails(b) || (b.postal || []).length) html += `<div class="card"><h3><span class="sp">Phone and email</span><button class="btn small" data-act="edit-biz" data-id="${b.id}" data-jump="Business phone numbers" title="Edit">✏️</button></h3>${phoneLinks((b.phones || []).map((p) => ({ ...p, label: p.label || 'Phone' })), false, 'call')}${(b.emails || []).map((e) => `<div class="kv"><div class="k">${h(e.label || 'Email')}</div><div class="v"><a href="mailto:${h(e.value)}">${h(e.value)}</a></div><a class="cbtn" href="mailto:${h(e.value)}" title="Send an email" aria-label="Email">📧</a></div>`).join('')}${(b.postal || []).map((p) => `<div class="kv"><div class="k">Address</div><div class="v">${h(p)}</div></div>`).join('')}${bizHasDetails(b) || (b.postal || []).length ? '' : '<div class="hint">No phone or email on the business yet — tap Edit to add them.</div>'}</div>`;
  mark('info');
  html += `<div class="card"><h3><span class="sp">General info</span>${photoAddBtn('business', b.id, 'info')}${secEdit('business', b.id, 'General info')}</h3>${infoView(b)}${photoStrip('business', b.id, 'info', b.infoPhotos)}</div>`;
  mark('current');
  const pastCs = IDX.bizPast.get(b.id) || [];
  html += `<div class="card"><h3><span class="sp">Current ${isClientBiz(b) ? 'contacts / employees' : 'contacts'} (${cs.length})</span>${cs.length > 1 ? loBar('business', b, 'current') : ''}</h3>${loWrap('business', b, 'current', loSort(b, 'current', cs, (c) => c.id, fullName).map((c) => [c.id, `<div class="bcrow"><div class="biz-link" data-act="open" data-kind="contact" data-id="${c.id}">${contactPhotoImg(c, 'av', 120)}<div><div style="font-weight:600">${h(fullName(c))}${noDet(c) ? ' ' + NODET : ''}${isClientBiz(b) && primaryOf(b)?.id === c.id ? ' <span class="rb" style="background:var(--ink)">PRIMARY</span>' : ''}</div><div class="hint">${h(roleAt(c, b.id))} ${h((c.mobiles[0] || c.landlines[0] || {}).value || '')}</div></div></div><div class="bcacts"><button class="btn small secedit" data-act="edit-contact" data-id="${c.id}" title="Edit ${h(fullName(c))}">✏️ Edit</button>${isClientBiz(b) ? (primaryOf(b)?.id === c.id ? `<button class="btn small primbtn on" data-act="prim-remove" data-cid="${c.id}" data-bid="${b.id}" title="Remove as primary contact">Remove primary</button>` : `<button class="btn small primbtn" data-act="prim-set" data-cid="${c.id}" data-bid="${b.id}" title="Make the primary contact">☆ Primary</button>`) : ''}<button class="btn small" data-act="link-past" data-cid="${c.id}" data-bid="${b.id}" data-v="1" title="They no longer work here">Make past</button><button class="btn small" data-act="biz-unlink" data-cid="${c.id}" data-bid="${b.id}" title="Unlink from this business">Unlink</button></div></div>`])) || '<div class="hint">No current contacts.</div>'}
  <input id="biz-linksearch" data-bid="${b.id}" placeholder="➕ Link a contact — search by name or phone" style="margin-top:8px;width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:9px"><div id="biz-linkres"></div>
  <div class="hint" style="margin-top:4px">${isClientBiz(b) && b.primaryRequired === false ? 'Primary contact not required.' : ''}</div></div>`;
  mark('helpers');
  html += helpersCard(b);
  mark('past');
  html += `<div class="card"><h3><span class="sp">Past ${isClientBiz(b) ? 'contacts / employees' : 'contacts'} (${pastCs.length})</span>${pastCs.length > 1 ? loBar('business', b, 'past') : ''}</h3><div class="hint" style="margin-bottom:4px">Their category isn't set by this business.</div>${loWrap('business', b, 'past', loSort(b, 'past', pastCs, (c) => c.id, fullName).map((c) => [c.id, `<div class="bcrow" style="opacity:.8"><div class="biz-link" data-act="open" data-kind="contact" data-id="${c.id}">${contactPhotoImg(c, 'av', 120)}<div><div style="font-weight:600">${h(fullName(c))}</div><div class="hint">${(c.links.find((l) => l.bid === b.id) || {}).role ? h(c.links.find((l) => l.bid === b.id).role) + ' · ' : ''}${h(catOf(c) ? tagName(catOf(c)) : '')}${bizOf(c).length ? ' · now at ' + h(bizOf(c).map((x) => x.name).join(', ')) : ''}</div></div></div><div class="bcacts"><button class="btn small secedit" data-act="edit-contact" data-id="${c.id}" title="Edit ${h(fullName(c))}">✏️ Edit</button><button class="btn small" data-act="link-past" data-cid="${c.id}" data-bid="${b.id}" data-v="0">Make current</button><button class="btn small" data-act="biz-unlink" data-cid="${c.id}" data-bid="${b.id}">Unlink</button></div></div>`]))}<input id="biz-linksearch-past" data-bid="${b.id}" placeholder="➕ Add a past contact — search by name or phone" style="margin-top:8px;width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:9px"><div id="biz-linkres-past"></div></div>`;
  mark('pic');
  if (isClientBiz(b)) html += `<div class="card"><h3><span class="sp">Property Identification Code (PIC)</span>${secEdit('business', b.id, 'Property Identification')}</h3>${b.pics.map((p) => `<div class="kv"><div class="k">${h(p.label || 'PIC')}</div><div class="v">${h(p.value)}</div></div>`).join('') || '<div class="hint">None recorded.</div>'}</div>`;
  mark('pid');
  if (isClientBiz(b)) html += `<div class="card"><h3><span class="sp">Patient IDs</span>${secEdit('business', b.id, 'Patient IDs')}</h3>${b.patientIds.map((p) => `<div class="kv"><div class="k">${pidEmo(p)}${h(p.label || 'ID')}</div><div class="v">${h(p.value)}</div></div>`).join('') || '<div class="hint">None recorded.</div>'}</div>`;
  mark('keep');
  if (isClientBiz(b)) html += `<div class="card keepcard"><h3><span class="sp">${h(bt('keep', '📝 Keep note templates'))}</span></h3><div class="hint" style="margin-bottom:6px">Answer a few questions and the appointment note is filled in, ready to go into Google Keep.</div><div class="actions"><button class="btn greenbtn" data-act="keep-note" data-bid="${b.id}">📝 Make an appointment note</button></div></div>`;
  mark('routes');
  { const rh = bizRoutesHtml(b, false); if (rh) html += `<div class="card"><h3>Saved routes</h3>${rh}</div>`; }
  mark('farms');
  html += `<div class="card"><h3><span class="sp">${locWord(b, true)}</span>${b.farms.filter((f) => ownedBy(f, b)).length > 1 ? loBar('business', b, 'farms') : ''}<button class="btn small" data-act="add-farm" data-bid="${b.id}">➕ New</button></h3>${b.farms.filter((f) => ownedBy(f, b)).length ? farmDrag(b, b.farms.filter((f) => ownedBy(f, b))) : `<div class="hint">No ${locWord(b, true).toLowerCase()} owned by this business.</div>`}
    <input id="farm-linksearch" data-bid="${b.id}" placeholder="➕ Link an existing farm or yards — search name, address or business" style="margin-top:8px;width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:9px"><div id="farm-linkres"></div></div>`;
  mark('farmsused');
  { const used = b.farms.filter((f) => !ownedBy(f, b)); if (used.length) html += `<div class="card"><h3>${locWord(b, true)} used but not owned by this business (${used.length})</h3><div class="hint" style="margin-bottom:4px">Shared yards — the owner's details show here, and any change applies to every business that uses them.</div>${farmDrag(b, used)}</div>`; }
  mark('farmsmap');
  { const fs = b.farms.filter((f) => !(b.farmLinks.find((l) => l.fid === f.id) || {}).past); const n = fs.reduce((a, f) => a + bizMapPins(f).length, 0);
    if (n) html += `<div class="card mapcard"><h3><span class="sp">${h(bt('bizmap', '🗺 Map of all pins'))} (${n})</span></h3><div class="hint" style="margin-bottom:6px">Tap a pin to see that farm's details.</div><div class="bizmap" data-bid="${b.id}"></div></div>`; }
  mark('farmspast');
  if (b.pastFarms.length) html += `<details class="card"><summary><h3 style="display:inline">Not current ${locWord(b, true).toLowerCase()} (${b.pastFarms.length})</h3></summary><div class="hint" style="margin:6px 0">Farms this business used to use (e.g. a block they sold or no longer lease).</div>${farmDrag(b, b.pastFarms, true)}</details>`;
  customSecs('business').forEach((cs) => { mark('cs:' + cs.id); html += customCard(b, cs, 'business'); });
  mark('resolved'); html += resolvedCard('business', b);
  mark('history'); html += historyCard([b.id, ...[...b.farms, ...b.pastFarms].map((f) => f.id)]);
  mark('_end');
  html += `<div class="actions" style="margin:16px 0 8px"><button class="btn" data-act="merge-start" data-kind="business" data-id="${b.id}">⇄ Merge with…</button></div><div class="actions" style="margin:0 0 8px"><button class="btn" data-act="rec-ai" data-kind="business" data-id="${b.id}">🤖 Ask Claude about ${h(b.name)}</button></div>`;
  return layoutApply('business', html, M, b) + '</div>';
}

/* ---------------- edit sheets ---------------- */
let SHEET = null; // {type, rec, ...}
/* pop-ups opened from a job get an "Ask Claude about this job" button */
let JOB_CTX = null;
document.addEventListener('click', (e) => { const jb = e.target.closest('.job'); if (!jb) return; const k = jb.querySelector('[data-act=job-ai]'); if (k && !e.target.closest('[data-act=job-ai]')) JOB_CTX = { key: k.dataset.key, at: Date.now() }; }, true);
function jobCtxBtn() { if (!JOB_CTX || Date.now() - JOB_CTX.at > 4000 || !jobs().some((x) => x.key === JOB_CTX.key)) return ''; JOB_CTX.at = Date.now(); return `<div class="actions" style="margin-top:14px;border-top:1px solid var(--line);padding-top:10px"><button type="button" class="btn" data-act="pop-job-ai" data-key="${h(JOB_CTX.key)}">🤖 Ask Claude about this job</button></div>`; }
function openSheet(title, body, onSave, extraBtns = '') {
  closeSheet(); body += jobCtxBtn();
  const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'sheet';
  bg.innerHTML = `<div class="sheet"><div class="sheet-h"><button class="btn" data-act="sheet-cancel">‹ Back</button><h2>${h(title)}</h2>${extraBtns}<button class="btn primary" data-act="sheet-save" id="sheet-save">Save</button></div><div class="form">${body}</div></div>`;
  document.body.appendChild(bg); SHEET = { onSave }; try { safePush({ sheet: 1 }); } catch (e) { } updateBackBtn();
  // clicking outside the edit screen no longer closes it (too easy to lose typing); snapshot the form so leaving can warn
  setTimeout(() => { if (SHEET && $('#sheet') === bg) SHEET.snap = sheetState(); }, 0);
}
function sheetState() { const f = $('#sheet .form'); if (!f) return ''; return [...f.querySelectorAll('input,textarea,select')].map((el) => (el.type === 'checkbox' || el.type === 'radio') ? (el.checked ? '1' : '0') : el.type === 'file' ? (el.files && el.files.length ? 'f' : '') : el.value).join('\u0001'); }
function sheetDirty() { return !!(SHEET && SHEET.snap != null && sheetState() !== SHEET.snap); }
async function leaveSheet(fromPop) {
  if (!SHEET) return;
  if (!sheetDirty()) { if (fromPop) SHEET.popped = true; closeSheet(); return; }
  if (fromPop) { try { safePush({ sheet: 1 }); } catch (e) { } } // put the edit screen back while we ask
  const sh = SHEET;
  if (await ask('You have unsaved changes on this screen.\n\nLeave without saving?', 'Yes — discard my changes', true)) { if (SHEET === sh) closeSheet(); }
}
function closeSheet() { const s = $('#sheet'); if (s) s.remove(); if (SHEET && !SHEET.popped) { NAV.ignorePop++; history.back(); } SHEET = null; updateBackBtn(); }
function repRows(name, rows, fields) {
  // fields: [{k, ph, w, opts}]
  const row = (r = {}) => `<div class="rep" data-rep="${name}">${fields.map((f) => f.opts ? `<select data-k="${f.k}" style="flex:${f.w || 1}">${f.opts.map((o) => `<option ${o === (r[f.k] || '') ? 'selected' : ''}>${h(o)}</option>`).join('')}${r[f.k] && !f.opts.includes(r[f.k]) ? `<option selected>${h(r[f.k])}</option>` : ''}</select>` : `<input data-k="${f.k}" value="${h(r[f.k] || '')}" style="flex:${f.w || 1}" ${f.list ? `list="${f.list}"` : ''} ${f.attrs || ''}>`).join('')}<button class="x" type="button" data-act="rep-del" title="Remove">×</button></div>`;
  const head = fields.some((f) => f.ph) ? `<div class="rephead">${fields.map((f) => `<span style="flex:${f.w || 1}">${h(f.ph || '')}</span>`).join('')}<span class="repx"></span></div>` : '';
  return `${head}<div data-repwrap="${name}">${(rows.length ? rows : [{}]).map(row).join('')}</div><button class="btn small repadd" type="button" data-act="rep-add" data-rep="${name}">➕ Add another</button><template data-reptpl="${name}">${row()}</template>`;
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
  const isNew = !c; S.pendNotes = [];
  const wasInactive = !!(c && effTags(c).includes('inactive'));
  const oldCats = c ? effCats(c) : [];
  c = c || { id: uid('c'), first: '', middle: '', last: '', role: '', links: [], tags: [], emails: [], mobiles: [], landlines: [], postal: [], info: D.settings.tplContact != null ? D.settings.tplContact : TPL_CONTACT, warnings: '', starred: false, photoChoice: 'auto', flags: [] };

  const { dr, ptags } = photoCandidates(c);
  const photoOpts = [['auto', 'Use default photo automatically assigned to the category' + (needsPhotoChoice(c) ? ' (needs choosing)' : '')], ...[...new Set([...dr, ...effTags(c).filter((t) => tagPhotoSrc(t))])].map((t) => [t, tagName(t)])];
  const cands = [...new Set([...dr, ...ptags])];
  if (cands.length >= 2) photoOpts.push(['split:' + cands.slice(0, 2).join(','), 'Split: ' + cands.slice(0, 2).map(tagName).join(' + ')]);
  const curPc = effChoice(c); if (curPc.startsWith('split:') && !photoOpts.some((o) => o[0] === curPc)) photoOpts.push([curPc, 'Split (current)']);
  photoOpts.push(['custom', 'Upload my own photo']);
  const body = `${isNew ? '' : `<div class="f"><span class="lbl">This entry is a…</span><div class="seg"><button type="button" class="on" data-act="kind-pick" data-v="person">Person</button><button type="button" data-act="kind-pick" data-v="client">Client business</button><button type="button" data-act="kind-pick" data-v="industry">Industry business</button></div><input type="hidden" id="e-kind" value="person"><div id="e-kindhint" class="hint" style="display:none;margin-top:6px;color:var(--red-ink)"></div></div>`}
  <div class="esec"><div class="esech">👤 Name</div>
  <div class="grid2"><div class="f"><label>First name</label><input id="e-first" value="${h(c.first)}"></div><div class="f"><label>Surname</label><input id="e-last" value="${h(c.last)}"></div></div>
  <label style="display:flex;gap:8px;align-items:center;margin:-2px 0 8px;font-size:14px"><input type="checkbox" id="e-nodet" ${c.noDetails ? 'checked' : ''}> Name only — we don't have their contact details (don't ask for them in Jobs)</label>
  <div class="grid2"><div class="f"><label>Middle name</label><input id="e-middle" value="${h(c.middle)}"></div><div class="f"><label>Preferred name / nickname <span class="hint">(optional)</span></label><input id="e-pref" value="${h(c.pref || '')}"></div></div>
  <div class="f"><label>Maiden name <span class="hint">(optional)</span></label><input id="e-maiden" value="${h(c.maiden || '')}"></div>
  </div><div class="esec"><div class="esech">🏢 Businesses and role</div><div class="esechint">Search for their business and tap it — or type a new business name. Tick Past for one they no longer work for.</div>
  <div class="f"><label>Role / position</label><input id="e-role" value="${h(c.role)}"></div>
  <div class="f"><label>Businesses</label>${roleDatalist()}<div id="e-links">${[...c.links.filter((l) => !l.past), ...c.links.filter((l) => l.past)].map((l) => linkRow(l.bid, null, l.past, l.role)).join('')}</div><div class="hint">Tick <b>Past</b> for a business they no longer work for — it stays on record but doesn't set their category.</div>
    <input id="e-bizsearch" placeholder="Search to link a business, or type a new business name"><div id="e-bizres"></div>
</div>
  </div><div class="esec"><div class="esech">🏷 Category and tags</div>
  <div class="card" id="e-catcard" style="background:#fbfaf7"><h3>Contact category</h3>
    ${c.links.length ? `<div class="seg" style="margin-bottom:8px"><button type="button" class="${followsBiz(c) ? 'on' : ''}" data-act="cat-mode" data-v="biz">Same as business</button><button type="button" class="${followsBiz(c) ? '' : 'on'}" data-act="cat-mode" data-v="own">This contact's own</button></div>` : ''}
    <input type="hidden" id="e-catmode" value="${followsBiz(c) ? 'biz' : 'own'}">
    <div id="e-catbiz" style="${followsBiz(c) ? '' : 'display:none'}"><div class="hint">Follows ${h(bizOf(c).map((b) => b.name).join(', '))}: ${h([...bizOf(c).map((b) => b.rating).filter(Boolean).map(tagName), ...bizCatsOf(c).map(tagName)].join(', ') || 'no categories yet')}. Change them on the business.</div></div>
    <div id="e-catown" style="${followsBiz(c) ? 'display:none' : ''}">
      ${catPicker('ccat', followsBiz(c) ? '' : catOf(c), null)}
    </div></div>
  <div class="f"><span class="lbl">Additional tags</span><div class="checks">${D.tags.filter((t) => t.group === 'additional').map((t) => `<label><input type="checkbox" data-tag="${t.id}" ${c.tags.includes(t.id) ? 'checked' : ''}>${h(t.name)}</label>`).join('')}</div></div>
  <div class="card" id="e-icewrap" style="background:#fff5f5;${isStaff(c) || (c.ice || []).length ? '' : 'display:none'}"><h3>🚨 ICE contacts (Bovitech staff)</h3><div class="hint" style="margin-bottom:6px">Who to call in case of emergency. Pick existing contacts — add the person as a contact first if they're not in the app. They get the ICE tag automatically.</div>
    <div id="e-icerows">${((c.ice || []).length ? c.ice : [null]).map(iceRow).join('')}</div><button type="button" class="btn small" data-act="ice-add">➕ Add another ICE contact</button>
    <datalist id="ice-dl">${D.contacts.filter((x) => x.id !== c.id).map((x) => `<option value="${h(iceLabel(x))}">`).join('')}</datalist></div>
  </div><div class="esec"><div class="esech">📞 Phone, email and postal</div><div class="esechint">Type straight into the boxes. Tap ➕ Add another for a second number, email or address. Empty boxes are ignored.</div>
  <div class="f"><label>Mobile numbers</label>${repRows('mob', c.mobiles, [{ k: 'value', ph: 'Mobile number', w: 3 }, { k: 'label', ph: 'Label', w: 2 }])}</div>
  <div class="f"><label>Landline numbers</label>${repRows('land', c.landlines, [{ k: 'value', ph: 'Landline number', w: 3 }, { k: 'label', ph: 'Label', w: 2 }])}</div>
  <div class="f"><label>Email</label>${repRows('email', c.emails, [{ k: 'value', ph: 'Email address', w: 3 }, { k: 'label', ph: 'Label', w: 2 }])}</div>
  <div class="f"><label>Postal address</label>${repRows('postal', c.postal.map((p) => ({ value: p })), [{ k: 'value', ph: 'Postal address', attrs: 'class="addrac" autocomplete="off"' }])}</div>
  </div><div class="esec"><div class="esech">ℹ️ General info</div>
  <div class="f"><label>General info</label>${richEditor('e-info', c)}</div>
  </div><div class="esec"><div class="esech">⚠ Warnings and notes</div><div class="esechint">Tap the ➕ button under each one to add a warning or note.</div>
  ${noteEditorBlock('contact', c, 'warn', PERSON_KINDS.contact.warn.edit, !D.contacts.includes(c))}
  ${noteEditorBlock('contact', c, 'caution', PERSON_KINDS.contact.caution.edit, !D.contacts.includes(c))}
  <div class="f" id="e-inwrap" style="${catOf(c) === 'inactive' ? '' : 'display:none'}"><label style="color:var(--red-ink)">Inactive — reason (required, shown in a red box at the top)</label>${reasonChips('#e-inreason')}<textarea id="e-inreason" class="warn" style="min-height:60px">${h(c.inactiveReason || '')}</textarea>${!(c.inactiveReason || '').trim() ? bizOf(c).filter((b) => bizCat(b) === 'inactive' && (b.inactiveReason || '').trim()).map((b) => `<div class="hint" style="margin-top:4px">Currently showing the reason from <b>${h(b.name)}</b>: “${h(b.inactiveReason)}” — <a href="#" data-act="edit-biz" data-id="${b.id}" data-jump="Inactive">edit it on the business</a>. Anything typed here is for ${h(c.first || fullName(c))} only.</div>`).join('') : ''}</div>
  <div class="f" id="e-dnawrap" style="${effTags(c).includes('dna') ? '' : 'display:none'}"><label style="color:var(--red-ink)">☠️ Do not answer — reason (required, shown under the red banner)</label><textarea id="e-dnareason" class="warn" style="min-height:60px">${h(c.dnaReason || '')}</textarea></div>
  ${noteEditorBlock('contact', c, 'side', 'Side notes (a general caution but not an urgent warning)', !D.contacts.includes(c))}
  ${customFields(c, 'contact')}
  </div><div class="esec"><div class="esech">🤫 Don't mention</div>
  <div class="esechint">Search for the person and tap them — or just type their name if they're not in the app. Add a note next to them if you like.</div>
  <div class="rephead"><span style="flex:3">Person</span><span style="flex:3">Note</span><span class="repx"></span></div><div id="e-nmrows">${[...(c.noMentionRel || []), null].map((r) => nmRow(r)).join('')}</div><button type="button" class="btn small" data-act="nm-row-add">➕ Add another person</button>
  ${(c.noMention || '').trim() ? `<div class="f" style="margin-top:8px"><label style="color:#7a5a00">Other notes (from before)</label><textarea id="e-nomention" class="nomention">${h(c.noMention || '')}</textarea></div>` : ''}
  </div><div class="esec"><div class="esech">📷 Photo and favourite</div>
  <div class="f"><label>Photo</label><select id="e-photo">${photoOpts.map(([v, l]) => `<option value="${h(v)}" ${curPc === v ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>
    <input type="file" id="e-photofile" accept="image/*" style="margin-top:6px;${c.photoChoice === 'custom' ? '' : 'display:none'}"><div class="hint">Photos come from the tags automatically. If a contact has two businesses with different ratings, the photo is split and labelled with each business.</div></div>
  <div class="f"><label><input type="checkbox" id="e-star" ${isFav(c) ? 'checked' : ''}> ★ Favourite on this device (shows at the top of your list)</label></div>
  </div>
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
    setFav(c, $('#e-star').checked);
    readCustom(c);
    if ($('#e-nodet')) { if ($('#e-nodet').checked) c.noDetails = true; else delete c.noDetails; }
    if ($('#e-maiden')) { const mv = val('e-maiden'); if (mv) c.maiden = mv; else delete c.maiden; }
    if ($('#e-pref')) { const pv = val('e-pref'); if (pv) c.pref = pv; else delete c.pref; }
    Object.assign(c, { first, last, middle: val('e-middle'), role: val('e-role'), ...readRich('e-info'), noMention: $('#e-nomention') ? $('#e-nomention').value.trim() : (c.noMention || ''), dnaReason: $('#e-dnareason').value.trim(), inactiveReason: $('#e-inreason').value.trim(), });
    nmSaveRows(c);
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
      if (nb && mine && bizCat(nb) !== mine && (mode === 'own' || !oldBids.size)) { reindex(); const r = await askLinkCat(`<b>${h(fullName(c))}</b>`, nb, tagName(mine), [c]); if (!r) { adopt(c, JSON.parse(origRec)); reindex(); toast('Not saved — your edits are still on screen'); return false; } if (r === 'match') setOne(c, bizCat(nb)); else setOne(c, mine); } }
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
    if (isNew) { D.contacts.push(c); pendApply(c, 'contact'); }
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
    out.innerHTML = `<div class="results">${m.map((b) => `<div data-act="link-biz" data-bid="${b.id}">${b.rating ? rbadge(b.rating) : ''}${h(b.name)}</div>`).join('')}<div data-act="link-newbiz" data-name="${h(bs.value.trim())}">➕ Create new business “${h(bs.value.trim())}”</div></div>`;
  });
}
const INACTIVE_REASONS_DEFAULT = ['No longer using routine services', 'Retired and sold farm', 'Sold farm', 'Passed away', 'No longer working in the industry', 'Moved away', 'Poor facilities (need to upgrade before servicing again)'];
const inactiveReasons = () => (D.settings.inactiveReasons && D.settings.inactiveReasons.length ? D.settings.inactiveReasons : INACTIVE_REASONS_DEFAULT);
function reasonChips(target) { return `<div class="chips" style="margin:4px 0 8px">${inactiveReasons().map((r) => `<button type="button" class="chip" style="padding-right:11px;font-size:13px" onclick="var t=document.querySelector('${target}');if(t){t.value='${r.replace(/'/g, "\\'")}';t.dispatchEvent(new Event('input',{bubbles:true}));}this.parentNode.querySelectorAll('.chip').forEach(function(x){x.classList.remove('on')});this.classList.add('on')">${h(r)}</button>`).join('')}<button type="button" class="chip" style="padding-right:11px;font-size:13px" onclick="var t=document.querySelector('${target}');if(t){t.value='';t.focus();}this.parentNode.querySelectorAll('.chip').forEach(function(x){x.classList.remove('on')});this.classList.add('on')">✏️ Custom reason</button></div>`; }
function listCard(k, title, list, hint) { return `<div class="card"><h3><span class="sp">${h(title)}</span><button class="btn small" data-act="lst-add" data-k="${k}">➕ Add</button></h3><div class="hint" style="margin-bottom:6px">${hint} Hold ⠿ and drag to reorder.</div>
  <div data-dnd="list:${k}">${list.map((x, i) => `<div class="kv dragrow" data-dk="${i}" style="align-items:center"><span class="draghandle" title="Hold and drag">⠿</span><div class="v">${h(x)}</div><button class="btn small" data-act="lst-mv" data-k="${k}" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class="btn small" data-act="lst-mv" data-k="${k}" data-i="${i}" data-d="1" ${i < list.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button><button class="btn small secedit" data-act="lst-edit" data-k="${k}" data-i="${i}" title="Rename">✏️</button><button class="btn small" data-act="lst-del" data-k="${k}" data-i="${i}" title="Delete">✕</button></div>`).join('')}</div></div>`; }
const SCHEMES = [['classic', 'Classic black', '#141414'], ['green', 'Paddock green', '#2e6b34'], ['blue', 'Ocean blue', '#1d4f91'], ['teal', 'Teal', '#0f6e6e'], ['earth', 'Earth brown', '#6b4423'], ['plum', 'Plum', '#6a2c70'], ['rose', 'Rose', '#a8325e']];
function layoutCard() { const K = S.layK || 'contact'; const keys = layoutKeys(K); const modes = layoutModes(K); const css = D.settings.customSecs || [];
  const sw = (c) => `<span style="display:inline-block;width:14px;height:14px;border-radius:4px;border:1px solid var(--line);background:${(SEC_COLORS.find((x) => x[0] === c) || SEC_COLORS[0])[2]};vertical-align:middle"></span>`;
  return `<div class="card"><h3><span class="sp">Page layout and custom sections</span></h3>
  <div class="hint" style="margin-bottom:8px">Hold <b>⠿</b> and drag to change the order of the sections on contact and business pages (or use the arrows). <b>Edit</b> changes a section's name, symbol and colour. For each section choose <b>Always show</b>, <b>Hide when empty</b> (it appears as soon as something is in it) or <b>Fold up</b> (shows as one line — tap to open). Applies on every device.</div>
  <div class="chips" style="margin-bottom:8px">${[['contact', 'Contact page', '👤'], ['business', 'Business page', '🏢'], ['farm', 'Farm card', '🐄']].map(([v, l, ic]) => `<button class="chip ${K === v ? 'on' : ''}" data-act="lay-k" data-v="${v}"><span class="ci">${ic}</span>${l}</button>`).join('')}</div>
  <div class="hint" style="margin-bottom:4px">${K === 'farm' ? 'The farm name and ✏️ always stay at the top of each farm card. Fold up = shows as one line on the card (tap to open).' : 'The name, photo, Inactive / Do not answer boxes always stay at the top.'}</div>
  <div data-dnd="layout">${keys.map((k, i) => { const si = secInfo(K, k); return `<div class="kv dragrow" data-dk="${h(k)}" style="align-items:center;flex-wrap:wrap"><span class="draghandle" title="Hold and drag">⠿</span><div class="v laylbl">${h(layoutLabel(K, k))}${si.color ? ' ' + sw(si.color) : ''}</div><div class="laybtns"><button class="btn small" data-act="lay-mv" data-k="${h(k)}" data-d="-1" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class="btn small" data-act="lay-mv" data-k="${h(k)}" data-d="1" ${i < keys.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button><button class="btn small" data-act="${k.startsWith('cs:') ? 'cs-edit' : 'sec-edit'}" data-k="${h(k)}" data-id="${h(k.slice(3))}">Edit</button>${LAYOUT_LOCKED.has(k) ? '<span class="laymode" title="Safety sections always show">🔒 Always shown</span>' : `<select class="laymode" data-laymode="${h(k)}" aria-label="How this section shows"><option value="" ${!modes[k] ? 'selected' : ''}>Always show</option><option value="empty" ${modes[k] === 'empty' ? 'selected' : ''}>Hide when empty${LAY_ADDBOX.has(k) ? ' (➕ box too)' : ''}</option><option value="fold" ${modes[k] === 'fold' ? 'selected' : ''}>Fold up</option></select>`}</div></div>`; }).join('')}</div>
  <div class="actions" style="margin-top:6px"><button class="btn small" data-act="lay-reset">↺ Back to the standard layout</button></div>
  <div class="lbl" style="margin-top:14px;display:flex;align-items:center"><span style="flex:1">Your own sections</span><button class="btn small" data-act="cs-add">➕ Add a section</button></div>
  ${css.length ? css.map((x) => `<div class="kv" style="align-items:center"><div class="v" style="flex:1">${sw(x.color)} ${x.emoji ? x.emoji + ' ' : ''}<b>${h(x.name)}</b> <span class="hint">— ${x.for === 'both' ? 'contacts and businesses' : x.for === 'business' ? 'businesses' : 'contacts'}${x.rich ? ' · formatting on' : ''}</span></div><button class="btn small" data-act="cs-edit" data-id="${x.id}">Edit</button><button class="btn small" data-act="cs-del" data-id="${x.id}" title="Delete">✕</button></div>`).join('') : '<div class="hint">None yet — e.g. "Dog names", "Gate codes", "Preferred days".</div>'}</div>`; }
const emojiField = (v) => `<div class="f" data-noicons><span class="lbl">Symbol <span class="hint">(optional)</span></span><div style="display:flex;gap:8px;align-items:center"><input data-ask="emoji" id="pt-emoji" value="${h(v || '')}" style="width:70px;font-size:26px;padding:4px;text-align:center;border:1px solid var(--line);border-radius:9px"><input id="pt-search" placeholder="🔍 Search symbols" style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"></div><div id="pt-grid" class="emogrid" data-noicons style="max-height:150px">${emojiGrid('')}</div></div>`;
async function secNameForm(K, k) { const si = secInfo(K, k); const inp = 'style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"'; const textBox = k === 'info';
  const r = await askBox('Edit section', `<div class="hint" style="margin-bottom:6px">Standard name: ${h((si.def.emoji ? si.def.emoji + ' ' : '') + si.def.name)}. The new name shows as the heading on every ${K} page.</div>
    <div class="f"><span class="lbl">Name</span><input data-ask="name" value="${h(si.name)}" ${inp}></div>${emojiField(si.emoji)}
    ${textBox ? `<div class="f"><span class="lbl">Background colour</span><select data-ask="color" ${inp}>${SEC_COLORS.map(([v, l]) => `<option value="${v}" ${si.color === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="hint">Formatting (bold, lists, highlight) is always on for General info.</div>` : ''}`, 'Save', false, 'Cancel', 'Back to the standard name');
  if (!r) return; const all = { ...(D.settings.secNames || {}) }; const mine = { ...(all[K] || {}) };
  if (r === 'alt') delete mine[k]; else { const name = (ASK_FORM.name || '').trim(); const o = {}; if (name && name !== si.def.name) o.name = name; const em = (ASK_FORM.emoji || '').trim(); if (em !== si.def.emoji) o.emoji = em; if (textBox && ASK_FORM.color) o.color = ASK_FORM.color; if (Object.keys(o).length) mine[k] = o; else delete mine[k]; }
  all[K] = mine; D.settings.secNames = all; touch(D.settings); NEXT_LOG_LABEL = `Section renamed: ${layoutLabel(K, k)} (${K} page)`; S.skipConfirm = true; await changed(); }
async function customSecForm(cur) { const inp = 'style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"';
  const r = await askBox(cur ? 'Edit section' : 'Add a section', `<div class="f"><label>Section name</label><input data-ask="name" value="${h(cur ? cur.name : '')}" ${inp}></div>
    <div class="f"><label>Show it on</label><select data-ask="for" ${inp}>${[['contact', 'Contact pages'], ['business', 'Business pages'], ['both', 'Both']].map(([v, l]) => `<option value="${v}" ${(cur ? cur.for : 'contact') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${emojiField(cur ? cur.emoji : '')}
    <label style="display:flex;gap:8px;align-items:center;margin:4px 0 8px"><input type="checkbox" data-askchk="rich" ${cur && cur.rich ? 'checked' : ''}> Allow formatting (bold, headings, lists, highlight)</label>
    <div class="f"><label>Background colour</label><select data-ask="color" ${inp}>${SEC_COLORS.map(([v, l]) => `<option value="${v}" ${(cur ? cur.color || '' : '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`, 'Save', false, 'Cancel');
  const name = (ASK_FORM.name || '').trim(); if (!r || !name) return null; return { id: cur ? cur.id : (D.settings.customSecsGone || {})[name.toLowerCase()] || uid('s'), name, for: ASK_FORM.for || 'contact', color: ASK_FORM.color || '', ...((ASK_FORM.emoji || '').trim() ? { emoji: ASK_FORM.emoji.trim() } : {}), ...(ASK_FORM.rich ? { rich: true } : {}) }; }
/* hold ⠿ and drag to reorder (touch, pen or mouse); on a computer the whole row can be dragged */
let DND = null;
document.addEventListener('pointerdown', (e) => { const row = e.target.closest('.dragrow'); if (!row) return; const hd = e.target.closest('.draghandle');
  if (!hd && (e.pointerType !== 'mouse' || e.target.closest('button,input,select,a,label'))) return; const box = row.parentElement; if (!box || !box.dataset.dnd) return; if ((box.dataset.dnd === 'settings' || box.dataset.dnd.startsWith('eplayout:')) && (!hd || !S.admin)) return;
  if (!hd && e.target.closest('[data-act], .lnk')) return; DND = { row, box, y0: e.clientY, moved: false, pid: e.pointerId }; if (hd) { try { row.setPointerCapture(e.pointerId); } catch (e2) { } e.preventDefault(); } });
document.addEventListener('pointermove', (e) => { if (!DND) return; if (!DND.moved && Math.abs(e.clientY - DND.y0) < 5) return;
  if (!DND.moved) { DND.moved = true; try { DND.row.setPointerCapture(DND.pid); } catch (e2) { } DND.row.classList.add('dragging'); document.body.classList.add('dragging-on'); } e.preventDefault();
  const rows = [...DND.box.querySelectorAll(':scope > .dragrow')].filter((r) => r !== DND.row); const y = e.clientY;
  const after = rows.find((r) => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2; });
  if (after) { if (DND.row.nextElementSibling !== after) DND.box.insertBefore(DND.row, after); } else if (DND.box.lastElementChild !== DND.row) DND.box.appendChild(DND.row);
  const sc = $('#list') && $('#list').contains(DND.box) ? $('#list') : document.scrollingElement; const H = innerHeight; if (y < 80) sc.scrollTop -= 12; else if (y > H - 60) sc.scrollTop += 12; }, { passive: false });
const dndEnd = async () => { if (!DND) return; const d = DND; DND = null; d.row.classList.remove('dragging'); document.body.classList.remove('dragging-on'); if (!d.moved) return;
  const order = [...d.box.querySelectorAll(':scope > .dragrow')].map((r) => r.dataset.dk); const kind = d.box.dataset.dnd;
  if (kind === 'layout') { if (!secOk('Page layout and custom sections')) return; const K = S.layK || 'contact'; D.settings.layout = { ...(D.settings.layout || {}), [K]: order }; NEXT_LOG_LABEL = 'Page layout changed (' + K + ' page)'; }
  else if (kind.startsWith('lo:')) { const [, k2, id2, key2] = kind.split(':'); const rec = loRec(k2, id2); if (!rec) return; rec.listOrder = { ...(rec.listOrder || {}), [key2]: order }; touch(rec); NEXT_LOG_LABEL = 'List order changed'; }
  else if (kind.startsWith('farms:')) { const b = IDX.biz.get(kind.slice(6)); if (!b) return; const rest = (b.farmOrder || []).filter((id) => !order.includes(id)); const all = sortFarms(b, [...b.farms, ...b.pastFarms]).map((f) => f.id);
    b.farmOrder = [...order, ...rest.filter((id) => all.includes(id)), ...all.filter((id) => !order.includes(id) && !rest.includes(id))]; touch(b); NEXT_LOG_LABEL = `Farm order changed: ${b.name}`; S.skipConfirm = true; await changed(); return; }
  else if (kind.startsWith('eplayout:')) { if (!S.admin) return; const K = kind.slice(9); D.settings.layout = { ...(D.settings.layout || {}), [K]: order }; NEXT_LOG_LABEL = 'Page layout changed (' + K + ' page)'; }
  else if (kind === 'settings') { if (!S.admin) return; D.settings.setOrder = order; NEXT_LOG_LABEL = 'Settings sections reordered'; }
  else if (kind.startsWith('list:')) { const k = kind.slice(5); const list = [...LIST_GET[k]()]; D.settings[k] = order.map((i) => list[+i]); NEXT_LOG_LABEL = (k === 'linkRoles' ? 'Roles' : 'Reasons for inactivating') + ' list reordered'; }
  else return; touch(D.settings); S.skipConfirm = true; await changed(); };
document.addEventListener('pointerup', dndEnd); document.addEventListener('pointercancel', dndEnd);
document.addEventListener('change', async (e) => { const k = e.target.dataset && e.target.dataset.laymode; if (k == null) return; if (!needAdmin()) return; const K = e.target.dataset.kind || S.layK || 'contact';
  const all = { ...(D.settings.layoutMode || {}) }; const mine = { ...layoutModes(K) }; if (e.target.value) mine[k] = e.target.value; else delete mine[k]; all[K] = mine; D.settings.layoutMode = all;
  const hide = { ...(D.settings.layoutHide || {}) }; delete hide[K]; D.settings.layoutHide = hide; // the old on/off hide list is folded into the new setting
  touch(D.settings); NEXT_LOG_LABEL = `${layoutLabel(K, k)}: ${({ '': 'always show', empty: 'hide when empty', fold: 'fold up' })[e.target.value]} (${K} page)`; S.skipConfirm = true; await changed(); });
/* ---------------- box colours and text (Settings → Box colours and text), all devices ---------------- */
const BOXES = [
  { k: 'inactive', l: 'Inactive client box', sel: '.inactivebox', txt: '.inactivebox,.inactivebox .body', sample: '<div class="inactivebox"><div style="font-family:var(--cond);font-size:20px;letter-spacing:.4px">INACTIVE CLIENT</div><div class="body">Retired and sold the farm</div></div>', d: { bg: '#111111', fg: '#ff3b3b', bd: '#111111', bold: true } },
  { k: 'dna', l: 'Do not answer banner', sel: '.dnabanner', txt: '.dnabanner', sample: '<div class="dnabanner">☠️ DO NOT ANSWER — NO FUTURE SERVICE ☠️</div>', d: { bg: '#d71f2b', fg: '#ffffff', bd: '#d71f2b', bold: false } },
  { k: 'dnareason', l: 'Do not answer — reason box', sel: '.dnareason', txt: '.dnareason .body', sample: '<div class="dnareason"><div class="lbl" style="color:var(--red-ink)">Reason</div><div class="body">Bad debtor</div></div>', d: { bg: '#ffffff', fg: '#a3121c', bd: '#d71f2b', bold: false } },
  { k: 'caution', l: 'Minor warnings', sel: '.card.caution', txt: '.card.caution h3,.card.caution .body', sample: '<div class="card caution"><h3><span class="sp">⚠️ Minor warning</span></h3><div class="body">Don\'t pat the dog called "Grim Reaper" — he bites</div></div>', d: { bg: '#fff6c7', fg: '#6b4f00', bd: '#efd46a', bold: false } },
  { k: 'warn', l: 'Major warnings (contact / business)', sel: '.card.warn', txt: '.card.warn h3,.card.warn .body', sample: '<div class="card warn"><h3><span class="sp">⚠ General warnings</span></h3><div class="body">Dog bites — stay in the ute</div></div>', d: { bg: '#fdeaea', fg: '#a3121c', bd: '#f3b3b6', bold: false } },
  { k: 'side', l: 'Side notes', sel: '.card.side', txt: '.card.side h3,.card.side .body', sample: '<div class="card side"><h3><span class="sp">📝 Side notes</span></h3><div class="body">Prefers a call after 4 pm</div></div>', d: { bg: '#fff6c7', fg: '#6b4f00', bd: '#efd46a', bold: false } },
  { k: 'biosec', l: 'Biosecurity', sel: '.fbiosec', txt: '.fbiosec', sample: '<div class="fbiosec">🦠 <b>Biosecurity:</b> Ovine footrot</div>', d: { bg: '#fff1e6', fg: '#7a3300', bd: '#f5c7a1', bold: false } },
  { k: 'fcaution', l: 'Farm minor warnings', sel: '.farmnote.fn-caution', txt: '.farmnote.fn-caution,.farmnote.fn-caution .body', sample: '<div class="farmnote fn-caution"><div class="fnh">⚠️ Minor warning (can still service)</div><div class="body">Use the sliding gate, not the suicide gate</div></div>', d: { bg: '#fff6c7', fg: '#6b4f00', bd: '#efd46a', bold: false } },
  { k: 'fassess', l: 'Farm — New, need to assess', sel: '.farmnote.fn-assess', txt: '.farmnote.fn-assess,.farmnote.fn-assess .body', sample: '<div class="farmnote fn-assess"><div class="fnh">🆕🔍 New — need to assess</div><div class="body">☐ Need to request photos of crush set up</div></div>', d: { bg: '#fdeaea', fg: '#a3121c', bd: '#f3b3b6', bold: false } },
  { k: 'repair', l: 'Farm major repairs', sel: '.farmnote.fn-repair', txt: '.farmnote.fn-repair,.farmnote.fn-repair .body', sample: '<div class="farmnote fn-repair"><div class="fnh">🛠🛑✋ Major repairs required (NO SERVICE until resolved)</div><div class="body">Head bail won\'t lock</div></div>', d: { bg: '#fdeaea', fg: '#a3121c', bd: '#f3b3b6', bold: false } },
  { k: 'minor', l: 'Farm minor repairs', sel: '.farmnote.fn-minor', txt: '.farmnote.fn-minor,.farmnote.fn-minor .body', sample: '<div class="farmnote fn-minor"><div class="fnh">🛠 Minor repairs required (can still service)</div><div class="body">Side gate latch loose</div></div>', d: { bg: '#fff6c7', fg: '#6b4f00', bd: '#efd46a', bold: false } },
  { k: 'farmwarn', l: 'Farm major warnings', sel: '.farmnote.fn-warn', txt: '.farmnote.fn-warn,.farmnote.fn-warn .body', sample: '<div class="farmnote fn-warn"><div class="fnh">⚠️🛑✋ Major warning (NO SERVICE until resolved)</div><div class="body">Crush has no proper vet gate</div></div>', d: { bg: '#fdeaea', fg: '#a3121c', bd: '#f3b3b6', bold: false } },
  { k: 'nomention', l: "Don't mention", sel: '.card.nomention', txt: '.card.nomention h3,.card.nomention .body,.card.nomention .v', sample: '<div class="card nomention"><h3><span class="sp">🤫 Don\'t mention</span></h3><div class="body">Recently lost their working dog — best not to bring it up</div></div>', d: { bg: '#fff3a6', fg: '#4a3a00', bd: '#e7c200', bold: true } },
  { k: 'keep', l: 'Keep note templates', sel: '.card.keepcard', txt: '.card.keepcard h3,.card.keepcard .hint', sample: '<div class="card keepcard"><h3><span class="sp">📝 Keep note templates</span></h3><div class="hint">Answer a few questions and the appointment note is filled in.</div></div>', d: { bg: '#e9f6ec', fg: '#1d4d2a', bd: '#9fd3ab', bold: false } },
  { k: 'ice', l: 'ICE contacts', sel: '.card.icecard', txt: '.card.icecard h3', sample: '<div class="card icecard"><h3><span class="sp">🚨 ICE contacts (in case of emergency)</span></h3></div>', d: { bg: '#ffffff', fg: '#858079', bd: '#d71f2b', bold: false } },
  { k: 'resolved', l: 'Resolved warnings and notes', sel: '.card.resolvedsec', txt: '.card.resolvedsec h3', sample: '<div class="card resolvedsec"><h3>✓ Resolved warnings and notes (2)</h3></div>', d: { bg: '#ffffff', fg: '#858079', bd: '#e4e0d9', bold: false } },
  { k: 'photos', l: 'Photos attached button', sel: '.nphotos>summary', txt: '.nphotos>summary', sample: '<details class="nphotos"><summary>📷 1 photo attached — tap to view</summary></details>', d: { bg: '#e3edfb', fg: '#14315f', bd: '#9db8e6', bold: true } },
  { k: 'farmcard', l: 'Farm / yards card', sel: '.farm', txt: '.farm .fn', sample: '<div class="farm"><div class="fn">"Jarrahvale" farm</div><div>1244 Dempster Road, Kalgan</div></div>', d: { bg: '#ffffff', fg: '#141414', bd: '#e4e0d9', bold: true } },
  { k: 'fpin', l: 'Farm pin buttons (View on map)', sel: '.fpin', txt: '.fpin', sample: '<div class="fpins"><span class="fpin">🚗 Turn-off</span><span class="fpin">🐄 Home yards</span></div>', d: { bg: '#f6f4f0', fg: '#141414', bd: '#e4e0d9', bold: true } },
  { k: 'helpers', l: 'Happy helpers', sel: '.card.helperscard', txt: '.card.helperscard h3,.card.helperscard .hint', sample: '<div class="card helperscard"><h3><span class="sp">🙂 Happy helpers (2)</span></h3><div class="hint">Not employed here — they help out on busy days.</div></div>', d: { bg: '#f3fbf4', fg: '#1f5c2a', bd: '#cfe8d3', bold: false } },
  { k: 'bizmap', l: 'Map of all pins (business page)', sel: '.card.mapcard', txt: '.card.mapcard h3,.card.mapcard .hint', sample: '<div class="card mapcard"><h3><span class="sp">🗺 Map of all pins (3)</span></h3><div class="hint">Tap a pin to see that farm\'s details.</div></div>', d: { bg: '#ffffff', fg: '#858079', bd: '#e4e0d9', bold: false } },
  { k: 'tbcpin', l: 'TBC pins (not confirmed yet)', sel: '.fpin.tbc,.mpin.tbc', txt: '.fpin.tbc', sample: '<div class="fpins"><span class="fpin tbc"><span class="pemo">🚗</span> Turn-off <b>TBC</b></span></div>', d: { bg: '#ffe3e3', fg: '#8a1018', bd: '#ff5a5a', bold: true } },
  { k: 'history', l: 'Change history (bottom of each page)', sel: '.card.histcard', txt: '.card.histcard h3', sample: '<div class="card histcard"><h3>🕘 Change history (12)</h3></div>', d: { bg: '#ffffff', fg: '#858079', bd: '#e4e0d9', bold: false } }];
const BOX_TITLES = { helpers: '🙂 Happy helpers', history: '🕘 Change history', bizmap: '🗺 Map of all pins', keep: '📝 Keep note templates', ice: '🚨 ICE contacts (in case of emergency)', resolved: '✓ Resolved warnings and notes', inactive: 'INACTIVE CLIENT', dna: '☠️ DO NOT ANSWER — NO FUTURE SERVICE ☠️', dnareason: 'Reason', warn: '', caution: 'Minor warning', side: 'Side notes', biosec: 'Biosecurity', nomention: "Don't mention",
  farmwarn: 'Major warning (NO SERVICE until resolved)', fcaution: 'Minor warning (can still service)', repair: 'Major repairs required (NO SERVICE until resolved)', minor: 'Minor repairs required (can still service)' };
const BOX_LISTS = ['warn', 'caution', 'side', 'farmwarn', 'fcaution', 'repair', 'minor']; const noteBoxKey = (type, k) => (type === 'farm' ? { warn: 'farmwarn', caution: 'fcaution', repair: 'repair', minor: 'minor' }[k] : { warn: 'warn', caution: 'caution', side: 'side' }[k]);
function noteText(type, k, t) { /* a note's text — as dot points or a numbered list when that's set in Box colours and text */ const L = ((D.settings.boxStyles || {})[noteBoxKey(type, k)] || {}).list; const lines = String(t || '').split(/\n+/).map((x) => x.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean); if (!L || lines.length < 1) return h(t); return `<${L} class="notelist">${lines.map((x) => `<li>${h(x)}</li>`).join('')}</${L}>`; }
const BOX_SIZES = [['', 'Normal'], ['13px', 'Small'], ['18px', 'Large'], ['22px', 'Extra large']];
function boxCss() { const st = D.settings.boxStyles || {}; return BOXES.map((b) => { const o = st[b.k]; if (!o) return ''; const box = [], txt = [];
  if (o.bg) box.push(`background:${o.bg}!important`); if (o.bd) box.push(`border-color:${o.bd}!important`, 'border-style:solid', 'border-width:2px');
  if (o.fg) txt.push(`color:${o.fg}!important`); if (o.bold != null) txt.push(`font-weight:${o.bold ? 800 : 400}!important`); if (o.italic) txt.push('font-style:italic!important'); if (o.size) txt.push(`font-size:${o.size}!important`); if (o.under) txt.push('text-decoration:underline!important'); if (o.align) txt.push(`text-align:${o.align}!important`); if (o.font) txt.push(`font-family:${o.font}!important`);
  return (box.length ? `${b.sel}{${box.join(';')}}` : '') + (txt.length ? `${b.txt.split(',').map((x) => x.trim()).join(',')}{${txt.join(';')}}` : ''); }).join('\n'); }
function applyBoxStyles() { let el = document.getElementById('boxcss'); if (!el) { el = document.createElement('style'); el.id = 'boxcss'; document.head.appendChild(el); } const css = boxCss(); if (el.textContent !== css) el.textContent = css; }
function boxCard() { return `<div class="card"><h3><span class="sp">Box colours and text</span></h3><div class="hint" style="margin-bottom:8px">Change the background, border and text of the coloured boxes on contact and business pages — colours, text size, bold, italic, underline, position, font, and (for warnings, cautions, side notes and repairs) dot points or numbered lists. Applies on every device.</div>
  ${BOXES.map((b) => `<div class="kv" style="align-items:center;flex-wrap:wrap"><div class="v" style="flex:1 1 160px;min-width:140px"><b>${h(b.l)}</b>${(D.settings.boxStyles || {})[b.k] || (D.settings.boxTitles || {})[b.k] ? ' <span class="hint">· changed</span>' : ''}<div class="boxprev" style="margin-top:4px">${b.sample}</div></div><button class="btn small" data-act="box-edit" data-k="${b.k}">Edit</button></div>`).join('')}</div>`; }
async function boxForm(k) { const b = BOXES.find((x) => x.k === k); if (!b) return; const o = { ...b.d, ...((D.settings.boxStyles || {})[k] || {}) }; const inp = 'style="width:100%;height:42px;padding:2px;border:1px solid var(--line);border-radius:9px"';
  const tdef = BOX_TITLES[k]; const tcur = ((D.settings.boxTitles || {})[k] || '');
  const r = await askBox(b.l, `<div id="box-prev" class="boxprev" style="margin-bottom:10px">${b.sample}</div>
    ${tdef != null ? `<div class="f"><span class="lbl">Title</span><input data-ask="title" value="${h(tcur)}" style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"><div class="hint">Leave empty for the standard title${tdef ? ': ' + h(tdef) : ''}.</div></div>` : ''}
    <div class="grid2"><div class="f"><span class="lbl">Background</span><input type="color" data-ask="bg" data-boxk="${k}" value="${o.bg}" ${inp}></div><div class="f"><span class="lbl">Text colour</span><input type="color" data-ask="fg" data-boxk="${k}" value="${o.fg}" ${inp}></div>
    <div class="f"><span class="lbl">Border</span><input type="color" data-ask="bd" data-boxk="${k}" value="${o.bd}" ${inp}></div><div class="f"><span class="lbl">Text size</span><select data-ask="size" data-boxk="${k}" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:9px">${BOX_SIZES.map(([v, l]) => `<option value="${v}" ${(o.size || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <label style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-askchk="bold" data-boxk="${k}" ${o.bold ? 'checked' : ''}> Bold text</label>
    <label style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-askchk="italic" data-boxk="${k}" ${o.italic ? 'checked' : ''}> Italic text</label>
    <label style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" data-askchk="under" data-boxk="${k}" ${o.under ? 'checked' : ''}> Underlined text</label>
    <div class="grid2"><div class="f"><span class="lbl">Text position</span><select data-ask="align" data-boxk="${k}" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:9px">${[['', 'Left (normal)'], ['center', 'Centre'], ['right', 'Right']].map(([v, l]) => `<option value="${v}" ${(o.align || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="f"><span class="lbl">Font</span><select data-ask="font" data-boxk="${k}" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:9px">${[['', 'Normal'], ['var(--cond)', 'Narrow headings font'], ['Georgia,serif', 'Serif'], ['ui-monospace,monospace', 'Typewriter']].map(([v, l]) => `<option value="${h(v)}" ${(o.font || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    ${BOX_LISTS.includes(k) ? `<div class="f"><span class="lbl">Each line of a note shows as</span><select data-ask="list" data-boxk="${k}" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:9px">${[['', 'Normal text'], ['ul', '• Dot points'], ['ol', '1. Numbered list']].map(([v, l]) => `<option value="${v}" ${(o.list || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}`, 'Save', false, 'Cancel');
  const all = { ...(D.settings.boxStyles || {}) };
  const titles = { ...(D.settings.boxTitles || {}) }; if (r && tdef != null) { const t = (ASK_FORM.title || '').trim(); if (r === 'alt' || !t || t === tdef) delete titles[k]; else titles[k] = t; D.settings.boxTitles = titles; }
  if (!r) { applyBoxStyles(); return; } if (r === 'alt') delete all[k]; else { const n = {}; ['bg', 'fg', 'bd'].forEach((x) => { if ((ASK_FORM[x] || '').toLowerCase() !== b.d[x].toLowerCase()) n[x] = ASK_FORM[x]; }); if (ASK_FORM.size) n.size = ASK_FORM.size; if (!!ASK_FORM.bold !== !!b.d.bold) n.bold = !!ASK_FORM.bold; if (ASK_FORM.italic) n.italic = true; if (ASK_FORM.under) n.under = true; if (ASK_FORM.align) n.align = ASK_FORM.align; if (ASK_FORM.font) n.font = ASK_FORM.font; if (ASK_FORM.list) n.list = ASK_FORM.list; if (Object.keys(n).length) all[k] = n; else delete all[k]; }
  D.settings.boxStyles = all; touch(D.settings); NEXT_LOG_LABEL = b.l + ' look changed'; S.skipConfirm = true; await changed(); applyBoxStyles(); }
// live preview while choosing colours
['input', 'change'].forEach((ev) => document.addEventListener(ev, (e) => { const k = e.target.dataset && e.target.dataset.boxk; if (!k) return; const b = BOXES.find((x) => x.k === k); const box = $('#askbox'); if (!b || !box) return;
  const g = (n) => box.querySelector(`[data-ask="${n}"]`), c = (n) => box.querySelector(`[data-askchk="${n}"]`); const pv = $('#box-prev'); if (!pv) return; const el = pv.querySelector(b.sel.replace(/^\.card\./, '.card.')) || pv.firstElementChild;
  el.style.setProperty('background', g('bg').value, 'important'); el.style.setProperty('border', '2px solid ' + g('bd').value, 'important');
  [el, ...el.querySelectorAll('.body,h3,.v')].forEach((t) => { t.style.setProperty('color', g('fg').value, 'important'); t.style.setProperty('font-weight', c('bold').checked ? '800' : '400', 'important'); t.style.setProperty('font-style', c('italic').checked ? 'italic' : 'normal', 'important'); t.style.setProperty('text-decoration', c('under') && c('under').checked ? 'underline' : 'none', 'important'); if (g('align')) t.style.setProperty('text-align', g('align').value || 'left', 'important'); if (g('font') && g('font').value) t.style.setProperty('font-family', g('font').value, 'important'); else t.style.removeProperty('font-family'); if (g('size').value) t.style.setProperty('font-size', g('size').value, 'important'); else t.style.removeProperty('font-size'); }); }));
/* owner search box: businesses and contacts; a typed name that isn't picked is kept as text */
function fuRender() { const box = $('#e-fusers'); if (!box || !SHEET_FARM) return; const U = SHEET_FARM.users; const ob = ($('#e-fowner-bid') || {}).value;
  const ids = Object.keys(U); box.innerHTML = ids.length ? ids.map((bid) => { const b = IDX.biz.get(bid); if (!b) return ''; const st = U[bid]; const isNewU = !(bid in SHEET_FARM.users0);
    return `<div class="furow ${st === 'del' ? 'fudel' : ''}"><div class="fun">${bLnk(b)}${ob === bid ? ' <span class="pill" style="background:#fff4cc;color:#6b5200">👑 Owner</span>' : ''}${isNewU ? ' <span class="hint">(adding)</span>' : st !== SHEET_FARM.users0[bid] ? ' <span class="hint">(changed — saved when you tap Save)</span>' : ''}</div>
      <div class="fua"><select class="fu-st" data-bid="${bid}"><option value="cur" ${st === 'cur' ? 'selected' : ''}>✓ Current</option><option value="past" ${st === 'past' ? 'selected' : ''}>🕘 Not current</option><option value="del" ${st === 'del' ? 'selected' : ''}>🗑 Remove from this business</option></select>${ob === bid ? '' : `<button type="button" class="btn small" data-act="fu-owner" data-bid="${bid}">👑 Make owner</button>`}</div></div>`; }).join('') : '<div class="hint">Not linked to a business yet.</div>'; }
document.addEventListener('change', (e) => { const t = e.target; if (!t.classList || !t.classList.contains('fu-st') || !SHEET_FARM) return; SHEET_FARM.users[t.dataset.bid] = t.value; fuRender(); });
function ownerPicker(id, cur) { const o = cur || {}; const nm = o.bid ? (IDX.biz.get(o.bid) || {}).name : o.cid ? fullName(D.contacts.find((x) => x.id === o.cid) || { first: '' }) : o.text || '';
  return `<input id="${id}" class="ownerq" data-ask="owner" value="${h(nm || '')}" placeholder="🔍 Search businesses or contacts — or type a name" autocomplete="off"><input type="hidden" id="${id}-bid" data-ask="ownerBid" value="${h(o.bid || '')}"><input type="hidden" id="${id}-cid" data-ask="ownerCid" value="${h(o.cid || '')}"><div id="${id}-res"></div>`; }
function ownerFrom(v, bid, cid) { v = (v || '').trim(); if (bid && IDX.biz.get(bid)) return { bid }; if (cid && D.contacts.some((x) => x.id === cid)) return { cid };
  const ob = D.businesses.find((x) => x.name.trim().toLowerCase() === v.toLowerCase()); if (ob) return { bid: ob.id }; return v ? { text: v } : { unknown: true }; }
function readOwner(id) { const el = $('#' + id); if (!el) return null; return ownerFrom(el.value, ($('#' + id + '-bid') || {}).value, ($('#' + id + '-cid') || {}).value); }
document.addEventListener('input', (e) => { const t = e.target; if (!t.classList || !t.classList.contains('ownerq')) return; ['bid', 'cid'].forEach((k) => { const x = $('#' + t.id + '-' + k); if (x) x.value = ''; }); const box = $('#' + t.id + '-res'); const pq = parseQuery(t.value); if (!box) return;
  if (!pq.inc.length) { box.innerHTML = ''; return; } const bs = D.businesses.filter((b) => matchQ(b.name.toLowerCase(), pq)).slice(0, 6), cs = D.contacts.filter((c) => matchQ(nameHay(c), pq)).slice(0, 6);
  box.innerHTML = `<div class="results">${bs.map((b) => `<div data-act="owner-pick" data-for="${t.id}" data-bid="${b.id}">🏢 <b>${h(b.name)}</b></div>`).join('')}${cs.map((c) => `<div data-act="owner-pick" data-for="${t.id}" data-cid="${c.id}">👤 <b>${h(fullName(c))}</b> <span class="hint">${h(bizOf(c).map((x) => x.name).join(', '))}</span></div>`).join('')}<div class="hint" style="padding:6px 8px">Not listed? Keep the typed name.</div></div>`; });
/* ---------------- symbols used on buttons (Settings → Symbols), all devices ---------------- */
const ICON_DEFS = [['edit', '✏️', 'Edit'], ['add', '➕', 'Add'], ['remove', '✕', 'Remove from a list'], ['delete', '🗑', 'Delete / remove info'], ['call', '📞', 'Phone call'], ['sms', '🅢🅜🅢', 'Text message'], ['email', '📧', 'Email'],
  ['nav', '🧭', 'Navigate'], ['map', '🗺', 'Map'], ['fav', '★', 'Favourite'], ['ai', '🤖', 'Ask Claude'], ['dna', '☠️', 'Do not answer'], ['search', '🔍', 'Search']];
const SYM_DEFS = [['n_warn', '⚠', 'Major warning (contact / business)'], ['n_caution', '⚠️', 'Minor warning (contact / business)'], ['n_side', '📝', 'Side notes'], ['n_farmwarn', '⚠️🛑✋', 'Farm major warning'], ['n_fcaution', '⚠️', 'Farm minor warning'],
  ['n_helpers', '🙂', 'Happy helpers'], ['n_fassess', '🆕🔍', 'Farm — New, need to assess'], ['n_repair', '🛠🛑✋', 'Farm major repairs'], ['n_minor', '🛠', 'Farm minor repairs'], ['n_biosec', '🦠', 'Biosecurity'], ['n_nomention', '🤫', "Don't mention"]];
function iconChanges() { const st = (typeof D !== 'undefined' && D && D.settings && D.settings.icons) || {}; return ICON_DEFS.filter(([k, d]) => st[k] && st[k] !== d).map(([k, d]) => [d, st[k]]); }
const ICON_SEL = 'button, a.btn, .dnabanner, .star, .group-h, .results > div, .hint, label, summary';
function fixIcons(root) { const ch = iconChanges(); if (!ch.length || !root || root.nodeType !== 1) return;
  const els = [...(root.matches && root.matches(ICON_SEL) ? [root] : []), ...root.querySelectorAll(ICON_SEL)];
  els.forEach((el) => { if (el.closest('[data-noicons]')) return; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { let t = n.data, t0 = t; ch.forEach(([a, b]) => { if (t.includes(a)) t = t.split(a).join(b); }); if (t !== t0) n.data = t; } });
  root.querySelectorAll && root.querySelectorAll('input[placeholder]').forEach((i) => { if (i.closest('[data-noicons]')) return; let t = i.placeholder, t0 = t; ch.forEach(([a, b]) => { if (t.includes(a)) t = t.split(a).join(b); }); if (t !== t0) i.placeholder = t; }); }
new MutationObserver((ms) => { if (!iconChanges().length) return; ms.forEach((m) => m.addedNodes.forEach((n) => fixIcons(n))); }).observe(document.documentElement, { childList: true, subtree: true });
function iconCard() { const st = D.settings.icons || {}; return `<div class="card"><h3><span class="sp">Symbols</span></h3><div data-noicons><div class="hint" style="margin-bottom:8px">The symbols used on buttons throughout the app. Change one and it changes everywhere, on every device.</div>
  <div class="lbl" style="margin-top:4px">On buttons</div>
  ${ICON_DEFS.map(([k, d, l]) => `<div class="kv" style="align-items:center"><span style="font-size:22px;width:60px;text-align:center">${h(st[k] || d)}</span><div class="v" style="flex:1">${h(l)}${st[k] && st[k] !== d ? ` <span class="hint">· standard ${h(d)}</span>` : ''}</div><button class="btn small" data-act="icon-edit" data-k="${k}">Change</button></div>`).join('')}
  <div class="lbl" style="margin-top:10px">Warnings, notes and boxes</div>
  ${SYM_DEFS.map(([k, d, l]) => `<div class="kv" style="align-items:center"><span style="font-size:20px;width:60px;text-align:center">${h(st[k] || d)}</span><div class="v" style="flex:1">${h(l)}${st[k] && st[k] !== d ? ` <span class="hint">· standard ${h(d)}</span>` : ''}</div><button class="btn small" data-act="icon-edit" data-k="${k}">Change</button></div>`).join('')}
  <div class="hint" style="margin-top:8px">Section symbols (ICE, Related people, Linked businesses…) are changed with <b>Edit</b> in Page layout.</div></div></div>`; }
const LIST_GET = { inactiveReasons: () => inactiveReasons(), linkRoles: () => linkRoles() };
function roleOptions() { const L = linkRoles(); const used = [...new Set(D.contacts.flatMap((c) => c.links.map((l) => l.role).filter(Boolean)))].filter((r) => !L.includes(r)).sort((a, b) => a.localeCompare(b)); return [...L, ...used].slice(0, 80); } /* your list first (Settings → Roles), then others already in use */
function roleSelect(role) { const opts = roleOptions(); const custom = role && !opts.includes(role); return `<select class="lk-rolesel" style="flex-basis:100%;margin-top:4px;padding:7px 9px;border:1px solid var(--line);border-radius:8px;font-size:14.5px"><option value="">Role here — none</option>${opts.map((o) => `<option value="${h(o)}" ${o === role ? 'selected' : ''}>${h(o)}</option>`).join('')}<option value="__custom" ${custom ? 'selected' : ''}>✏️ Custom role…</option></select>`; }
document.addEventListener('change', (e) => { if (!e.target.classList || !e.target.classList.contains('lk-rolesel')) return; const inp = e.target.parentNode.querySelector('.lk-role'); if (e.target.value === '__custom') { inp.hidden = false; inp.value = ''; inp.focus(); } else { inp.hidden = true; inp.value = e.target.value; } });
function roleDatalist() { return `<datalist id="lk-rolelist">${roleOptions().slice(0, 60).map((r) => `<option value="${h(r)}">`).join('')}</datalist>`; }
function linkRow(bid, newName, past, role) {
  const b = bid ? IDX.biz.get(bid) : null;
  return `<div class="rep" style="flex-wrap:wrap" ${bid ? `data-bid="${bid}"` : `data-newbiz="${h(newName)}"`}><label style="display:flex;align-items:center;gap:4px;font-size:13.5px;white-space:nowrap"><input type="checkbox" class="lk-past" ${past ? 'checked' : ''}>Past</label><div style="flex:1;padding:9px 10px;background:#fff;border:1px solid var(--line);border-radius:9px">${b ? (b.rating ? rbadge(b.rating) : '') + h(b.name) : h(newName) + ' <span class="hint">(new)</span>'}</div><button class="x" type="button" data-act="rep-del">×</button>${roleSelect(role)}<input class="lk-role" value="${h(role || '')}" ${!role || roleOptions().includes(role) ? 'hidden' : ''} style="flex-basis:100%;margin-top:4px;padding:7px 9px;border:1px solid var(--line);border-radius:8px;font-size:14.5px"></div>`;
}
function newBusiness(name) {
  const b = { id: uid('b'), name, farmLinks: [], pics: [], patientIds: [], info: '', warnings: '', flags: [], rating: null };
  touch(b); D.businesses.push(b); IDX.biz.set(b.id, b); return b;
}
document.addEventListener('change', (e) => { const t = e.target; if (t.id !== 'na-photo') return; S.naFiles = [...(S.naFiles || []), ...(t.files || [])]; const n = $('#na-photo-n'); if (n) { n.innerHTML = S.naFiles.map((f) => `<img src="${URL.createObjectURL(f)}" alt="">`).join('') + `<span class="hint">${S.naFiles.length} photo${S.naFiles.length === 1 ? '' : 's'} ready — saved with the note</span>`; } t.value = ''; });
function fileToDataUrl(file, max) {
  return new Promise((res) => { const r = new FileReader(); r.onload = async () => { const im = await loadImg(r.result); if (!im) return res(r.result); const s = Math.min(1, max / Math.max(im.width, im.height)); const cv = document.createElement('canvas'); cv.width = im.width * s; cv.height = im.height * s; cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/png')); }; r.readAsDataURL(file); });
}
const PID_LABELS = ['Cattle Herd ID', 'Sheep Flock ID'];
function editBiz(b) {
  const isNew = !b; S.pendNotes = [];
  b = b || { id: uid('b'), name: '', farmLinks: [], pics: [], patientIds: [], info: D.settings.tplBiz != null ? D.settings.tplBiz : TPL_BIZ, warnings: '', flags: [], rating: null };
  const body = `<div class="grid2"><div class="f"><label>Business name (full)</label><input id="e-bname" value="${h(b.name)}"></div><div class="f"><label>Abbreviation <span class="hint">(optional)</span></label><input id="e-babbr" value="${h(b.abbr || '')}"></div></div>
  <div class="f"><label>Business type</label><select id="e-btype"><option value="client">Client business</option><option value="nonclient" ${isClientBiz(b) ? '' : 'selected'}>Non-client business (industry)</option></select><div class="hint">Normally set by the business's category (Settings → Categories). If you pick a different type here, the business keeps your choice.</div><div class="hint">Non-client businesses don't need a PIC, patient IDs, A+ to C category or farms — they have business locations instead.</div></div>
  <div class="f"><label>Business phone numbers</label>${repRows('bphone', b.phones || [], [{ k: 'value', ph: 'Phone number', w: 2 }, { k: 'label', ph: 'Label', w: 2 }])}</div>
  <div class="f"><label>Business emails</label>${repRows('bemail', b.emails || [], [{ k: 'value', ph: 'Email address', w: 3 }, { k: 'label', ph: 'Label (optional)', w: 2 }])}</div>
  <div class="f"><label>Business postal / street address</label><textarea id="e-bpostal" class="addrac" autocomplete="off" style="min-height:50px">${h((b.postal || []).join('\n'))}</textarea></div>
  <div class="f client-only"><label>Primary contact required?</label><select id="e-bpreq"><option value="yes">Yes</option><option value="no" ${b.primaryRequired === false ? 'selected' : ''}>Not required</option></select></div>
  ${(IDX.bizContacts.get(b.id) || []).length ? `<div class="f client-only"><label>Contacts — tap ★ to make someone the primary contact</label><input type="hidden" id="e-bprimary" value="${primaryOf(b)?.id || ''}"><div id="e-bprimlist">${(IDX.bizContacts.get(b.id) || []).map((c) => `<div class="kv" style="align-items:center"><div class="v" style="flex:1">${h(fullName(c))}${roleAt(c, b.id) ? ` <span class="hint">· ${h(roleAt(c, b.id))}</span>` : ''}</div><button type="button" class="btn small primbtn ${primaryOf(b)?.id === c.id ? 'on' : ''}" data-act="e-primtoggle" data-cid="${c.id}">${primaryOf(b)?.id === c.id ? 'Primary — tap to remove' : '☆ Make primary'}</button></div>`).join('')}</div></div>` : ''}
  <div class="f"><span class="lbl">Contact category</span>${catPicker('bcat', bizCat(b), null)}<div class="hint">Contacts set to "Same as business" follow these. Contacts with their own categories keep theirs.</div></div>
  ${bizSplitPairs(b).length ? `<div class="f client-only"><label>Business photo</label><select id="e-bphoto"><option value="auto">Automatic — from the business's category</option>${bizSplitPairs(b).map(([x, y]) => `<option value="split:${x},${y}" ${b.photoChoice === 'split:' + x + ',' + y ? 'selected' : ''}>Split: ${h(tagName(x))} + ${h(tagName(y))}</option>`).join('')}</select><div class="hint">Split shows two category photos side by side — handy when people at this business have different categories.</div></div>` : ''}
  <div class="f client-only"><label>Property Identification Code (PIC)</label>${repRows('pic', b.pics, [{ k: 'value', ph: 'PIC', w: 2, attrs: 'class="picin" autocapitalize="characters" autocomplete="off" spellcheck="false"' }, { k: 'label', ph: 'Label (optional)', w: 3 }])}</div>
  <div class="f client-only"><label>Patient IDs</label>${repRows('pid', b.patientIds, [{ k: 'value', ph: 'Patient ID', w: 2 }, { k: 'label', ph: 'Cattle Herd ID / Sheep Flock ID / (entity) …', w: 3, list: 'pidlabels' }])}<datalist id="pidlabels">${[...new Set([...PID_LABELS, ...D.businesses.flatMap((x) => x.patientIds.map((p) => p.label))])].map((l) => `<option value="${h(l)}">`).join('')}</datalist></div>
  <div class="f"><label>General info</label>${richEditor('e-binfo', b)}</div>
  ${noteEditorBlock('business', b, 'warn', PERSON_KINDS.business.warn.edit, !D.businesses.includes(b))}
  ${noteEditorBlock('business', b, 'caution', PERSON_KINDS.business.caution.edit, !D.businesses.includes(b))}
  <div class="f" id="e-binwrap" style="${bizCat(b) === 'inactive' ? '' : 'display:none'}"><label style="color:var(--red-ink)">Inactive — reason (required, shown in a red box at the top)</label>${reasonChips('#e-binreason')}<textarea id="e-binreason" class="warn" style="min-height:60px">${h(b.inactiveReason || '')}</textarea></div>
  <div class="f" id="e-bdnawrap" style="${(b.cats || []).includes('dna') ? '' : 'display:none'}"><label style="color:var(--red-ink)">☠️ Do not answer — reason (required, shown under the red banner)</label><textarea id="e-bdnareason" class="warn" style="min-height:60px">${h(b.dnaReason || '')}</textarea></div>
  ${noteEditorBlock('business', b, 'side', 'Side notes (yellow — shown on every linked contact)', !D.businesses.includes(b))}
  <div class="f"><label style="color:#8a3b00">🦠 Biosecurity (shown on this business, its contacts and its farms)</label><textarea id="e-bbio" class="biosec">${h(b.biosec || '')}</textarea></div>
  ${customFields(b, 'business')}
  <div class="hint">Farms are added and edited from the business page.</div>
  ${isNew ? '' : `<div class="f" style="margin-top:12px"><button class="btn" data-act="del-biz" data-id="${b.id}" style="color:var(--red)">Delete business</button></div>`}`;
  openSheet(isNew ? 'New business' : 'Edit business', body, async () => {
    const name = val('e-bname'); if (!name) { toast('Enter a business name'); return false; }
    if ($('#e-babbr')) { const av = val('e-babbr'); if (av) b.abbr = av; else delete b.abbr; }
    { const bad = readRep('pic').map((p) => p.value.toUpperCase().replace(/\s+/g, '')).filter((v) => v && !PIC_RX.test(v));
      if (bad.length && $('#e-btype').value !== 'nonclient' && !(await askBox('Check the PIC', `<p><b>The PIC entered doesn't look correct, please check.</b></p><p>${bad.map((v) => `<b>${h(v)}</b>`).join(', ')}</p><p class="hint">A WA PIC is 4 letters starting with W, then 4 numbers — e.g. WFAY2784.</p>`, 'Save anyway', false, 'Go back and check'))) { const i = [...document.querySelectorAll('#sheet .picin')].find((x) => bad.includes(x.value.toUpperCase().replace(/\s+/g, ''))); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); } return false; } }
    { const badPic = readRep('pic').map((p) => p.value.toUpperCase().replace(/\s+/g, '')).filter((v) => !PIC_RX.test(v)); if (badPic.length && !(await ask(`${badPic.join(', ')} doesn't look like a PIC.\n\nPICs are W + 3 more letters + 4 numbers (e.g. WFAY2899). Save anyway?`, 'Yes — save anyway'))) return false; }
    const pick = rtVal($('#sheet'), 'bcat'); const newRating = RATING_SET.has(pick) ? pick : null;
    if (!pick) { toast('Choose a category for the business'); return false; }
    if (newRating !== b.rating) b.flags = (b.flags || []).filter((f) => f.type !== 'ratingconflict');
    const pickedType = $('#e-btype').value; b.type = pickedType; b.primaryRequired = $('#e-bpreq').value !== 'no';
    b.phones = readRep('bphone'); b.emails = readRep('bemail'); b.postal = $('#e-bpostal').value.split('\n').map((x) => x.trim()).filter(Boolean);
    if (b.type === 'nonclient') { b.primaryRequired = false; b.primaryContact = null; }
    const pSel = b.type === 'nonclient' ? null : $('#e-bprimary'); if (pSel) { const was = primaryOf(b); b.primaryContact = pSel.value || null; if (was && was.id !== b.primaryContact) unPrimary(was, b); const pc = D.contacts.find((x) => x.id === b.primaryContact); if (pc && !pc.tags.includes('pa') && !pc.tags.includes('pi')) { pc.tags.push('pa'); touch(pc); } }
    if (pick === 'inactive' && !$('#e-binreason').value.trim()) { toast('Please add the reason for inactivating'); $('#e-binwrap').style.display = ''; $('#e-binreason').focus(); return false; }
    if (pick === 'dna' && !$('#e-bdnareason').value.trim()) { toast('Please add the reason for "Do not answer"'); $('#e-bdnawrap').style.display = ''; $('#e-bdnareason').focus(); return false; }
    const oldBc = b.cats || []; b.cats = pick && !RATING_SET.has(pick) ? [pick] : []; if (pick !== bizCat({ rating: b.rating, cats: oldBc }) || newRating !== (b.rating || null)) b.flags = (b.flags || []).filter((f) => f.type !== 'catpick');
    (IDX.bizContacts.get(b.id) || []).filter(followsBiz).forEach((c) => {
      if (!oldBc.includes('inactive') && b.cats.includes('inactive')) { c.flags = c.flags || []; c.flags.push({ type: 'ezyvet', at: Date.now() }); touch(c); }
      if (!oldBc.includes('dna') && b.cats.includes('dna') && !c.tags.includes('blockedc')) { c.flags = c.flags || []; c.flags.push({ type: 'blockcheck', at: Date.now() }); touch(c); }
    });
    readCustom(b);
    if ($('#e-bphoto')) { const v = $('#e-bphoto').value; if (v === 'auto') delete b.photoChoice; else b.photoChoice = v; photoCache.clear(); }
    Object.assign(b, { name, rating: newRating, pics: readRep('pic').map((p) => ({ ...p, value: p.value.toUpperCase().replace(/\s+/g, '') })), patientIds: readRep('pid'), ...readRich('e-binfo'), biosec: $('#e-bbio').value.trim(), dnaReason: $('#e-bdnareason').value.trim(), inactiveReason: $('#e-binreason').value.trim() });
    setBizType(b, pickedType); // keeps the type you chose even if the category says otherwise
    touch(b); if (isNew) { D.businesses.push(b); pendApply(b, 'business'); }
    S.sel = { kind: 'business', id: b.id }; if (isNew) S.tab = 'biz';
    return true;
  });
  document.querySelectorAll(isClientBiz(b) ? '#sheet .nonclient-only' : '#sheet .client-only').forEach((el) => (el.style.display = 'none'));
}
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.pref) { savePref(t.dataset.pref, t.value); if (['theme', 'size', 'scheme'].includes(t.dataset.pref)) applyUi(); toast('Saved for this device'); return; }
  if (t.dataset && t.dataset.jobtype) { const off = new Set(PREF.jobsOff || []); t.checked ? off.delete(t.dataset.jobtype) : off.add(t.dataset.jobtype); savePref('jobsOff', [...off]); JOBS_CACHE = null; renderTabs(); toast('Saved for this device'); return; }
  const setShared = async (fn, label) => { fn(D.settings); touch(D.settings); NEXT_LOG_LABEL = label; S.skipConfirm = true; JOBS_CACHE = null; await changed(); toast('Saved'); };
  if (t.dataset && t.dataset.req) { await setShared((st) => { const r = new Set(st.required || REQ_DEF); t.checked ? r.add(t.dataset.req) : r.delete(t.dataset.req); st.required = [...r]; }, `Required information: ${t.dataset.req} ${t.checked ? 'on' : 'off'}`); return; }
  if (t.dataset && t.dataset.route) { await setShared((st) => { st.route = { ...routeSet(), [t.dataset.route]: t.checked }; }, `Travel: ${t.dataset.route} ${t.checked ? 'on' : 'off'}`); return; }
  if (t.dataset && t.dataset.routenum) { const v = parseFloat(t.value); if (!(v > 0)) { toast('Enter a number above 0'); return; } await setShared((st) => { st.route = { ...routeSet(), [t.dataset.routenum]: v }; }, `Travel: ${t.dataset.routenum} = ${v}`); return; }
  if (t.dataset && t.dataset.gpush) { await setShared((st) => { st.gpush = { ...(st.gpush || {}), [t.dataset.gpush]: t.checked }; }, `Google Contacts: ${t.dataset.gpush} ${t.checked ? 'on' : 'off'}`); return; }
  if (t.dataset && t.dataset.gskip) { await setShared((st) => { const g = { ...(st.gpush || {}) }; const sk = new Set(g.skip || []); t.checked ? sk.delete(t.dataset.gskip) : sk.add(t.dataset.gskip); g.skip = [...sk]; st.gpush = g; }, `Google Contacts: ${tagName(t.dataset.gskip)} ${t.checked ? 'sent' : 'not sent'}`); return; }
  if (t.dataset && t.dataset.catclass) { const st = D.settings; st.catClass = st.catClass || { p: {}, b: {} }; st.catClass[t.dataset.catclass] = st.catClass[t.dataset.catclass] || {}; st.catClass[t.dataset.catclass][t.dataset.cat] = t.value; touch(st); NEXT_LOG_LABEL = `${tagName(t.dataset.cat)} ${t.dataset.catclass === 'p' ? lab('contacts') : lab('biz')} set to ${t.value === 'n' ? 'non-client' : 'client'}`; S.skipConfirm = true; JOBS_CACHE = null; reindex(); await changed(); toast('Saved'); return; }
  if (t.dataset && t.dataset.splitlook) { const L = { ...(D.settings.splitLook || {}) }; const k = t.dataset.splitlook; L[k] = k === 'pos' ? t.value : t.value === '1'; D.settings.splitLook = L; touch(D.settings); photoCache.clear(); NEXT_LOG_LABEL = 'Split photo look changed'; S.skipConfirm = true; changed(); return; }
  if (t.dataset && t.dataset.label && secOk('Menu names')) { const st = D.settings; st.labels = st.labels || {}; const v = t.value.trim(); if (v) st.labels[t.dataset.label] = v; else delete st.labels[t.dataset.label]; touch(st); NEXT_LOG_LABEL = `Menu name: ${TAB_DEFAULTS[t.dataset.label]} → ${v || TAB_DEFAULTS[t.dataset.label]}`; S.skipConfirm = true; await changed(); toast('Saved'); return; }
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
const svPano = (p) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lng}`;
function svBlock(p, cls) { /* Street View for a turn-off — opens Google's live Street View at the nearest spot */ if (!p || p.lat == null) return `<div class="svbox ${cls || ''}"><div class="hint">📷 Street View can be shown once the pin is set.</div></div>`;
  return `<div class="svbox ${cls || ''}"><button type="button" class="btn small" data-act="sv-show" data-lat="${p.lat}" data-lng="${p.lng}">📷 View this ${h(turnName().toLowerCase())} on Street View</button><div class="hint">To move the pin with Street View, save first, then tap 📷 Street View on the farm card.</div></div>`; }
async function svShow(p, title) { /* finds the nearest Street View (within 300 m) with the Maps JavaScript API and shows it, facing the pin */
  const go = askBox(title || 'Street View', '<div id="svpano" style="width:100%;height:55vh;min-height:260px;border-radius:9px;background:#222;display:grid;place-items:center;color:#fff">Finding the nearest Street View…</div><div id="svnote" class="hint" style="margin-top:6px"></div>', 'Close', false, 'Back');
  setTimeout(async () => { const box = $('#svpano'), note = $('#svnote'); if (!box) return; const fail = (m) => { box.innerHTML = `<div style="padding:16px;text-align:center">${m}</div>`; };
    if (!Maps.key()) return fail('Add the Google Maps key in Settings first.'); const src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(Maps.key())}&v=weekly`;
    try { await loadScript(src); if (!window.google || !google.maps || !google.maps.StreetViewService) throw new Error('no maps'); } catch (e) { delete SCRIPT_P[src]; return fail("Google Maps didn't load — check the internet."); }
    new google.maps.StreetViewService().getPanorama({ location: { lat: +p.lat, lng: +p.lng }, radius: 300, preference: 'nearest', source: 'outdoor' }, (data, status) => {
      if (status !== 'OK' || !data || !data.location) return fail('No Street View within 300 m of this pin.'); const at = data.location.latLng; const toPin = (() => { const t = Math.PI / 180, y = Math.sin((p.lng - at.lng()) * t) * Math.cos(p.lat * t), x = Math.cos(at.lat() * t) * Math.sin(p.lat * t) - Math.sin(at.lat() * t) * Math.cos(p.lat * t) * Math.cos((p.lng - at.lng()) * t); return (Math.atan2(y, x) / t + 360) % 360; })();
      box.innerHTML = ''; new google.maps.StreetViewPanorama(box, { pano: data.location.pano, pov: { heading: toPin, pitch: 0 }, zoom: 0, addressControl: false, fullscreenControl: true, motionTracking: false });
      const dist = Math.round(hav({ lat: at.lat(), lng: at.lng() }, { lat: +p.lat, lng: +p.lng }) * 1000); if (note) note.innerHTML = `Facing the pin from ${dist} m away${data.imageDate ? ' · photo taken ' + h(data.imageDate) : ''}. Drag to look around. <a href="https://www.google.com/maps/@?api=1&map_action=pano&pano=${encodeURIComponent(data.location.pano)}&heading=${Math.round(toPin)}" target="_blank" rel="noopener">Open in Google Maps</a>`; }); }, 80);
  await go; }
function accessFields(a, main) { a = a || {}; const I = (id, cls) => (main ? `id="${id}"` : `class="${cls}"`);
  return `<div class="accbox"><div class="lbl" style="margin:6px 0 4px">🚪 Access</div><textarea ${I('e-facc', 'xa-notes')} rows="2" style="width:100%">${h(a.notes || '')}</textarea>
    <div class="grid2" style="margin-top:6px"><div class="f"><label>🔢 Gate PIN / code</label><input ${I('e-fgate', 'xa-gate')} value="${h(a.gate || '')}"></div><div class="f"><label>🔑 Key location</label><input ${I('e-fkey', 'xa-key')} value="${h(a.key || '')}"></div></div>
    </div>`; }
const readAccess = (root, main) => { const q = (id, cls) => (main ? $('#' + id) : root.querySelector('.' + cls)); const o = { notes: (q('e-facc', 'xa-notes') || {}).value || '', gate: (q('e-fgate', 'xa-gate') || {}).value || '', key: (q('e-fkey', 'xa-key') || {}).value || '' }; Object.keys(o).forEach((k) => { o[k] = o[k].trim(); if (!o[k]) delete o[k]; }); return Object.keys(o).length ? o : null; };
function accessLine(a, label) { if (!a) return ''; const bits = [a.notes ? h(a.notes) : '', a.gate ? `🔢 Gate PIN: <b>${h(a.gate)}</b>` : '', a.key ? `🔑 Key: <b>${h(a.key)}</b>` : ''].filter(Boolean); return bits.length ? `<div class="body" style="margin-top:4px;font-size:14.5px">🚪 <b>${label ? h(label) + ' — access' : 'Access'}:</b> ${bits.join(' · ')}</div>` : ''; }
function yardCard(x, main) { /* one set of yards (or shed, office…) in the edit-farm window — the first is the farm's main pin, the rest are extra pins; both look the same */
  const sf = x.safety || {}; const sfx = main ? '' : '-x' + x.id; const I = (id, cls) => (main ? `id="${id}"` : `class="${cls}"`);
  return `<div class="card xpin ${main ? 'ymain' : ''}" ${main ? '' : `data-id="${h(x.id)}"`} style="padding:8px;margin:6px 0"><div class="yardlbl" ${main ? 'id="e-ylbl"' : ''}>${h(x.name || '')}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap"><select ${main ? 'id="e-ftype"' : 'class="xp-type"'} style="flex:1;min-width:150px">${main ? '' : `<option value="turn" ${x.type === 'turn' ? 'selected' : ''}>${turnPin().emoji} ${h(turnName())}</option>`}${pinTypes().map((t) => `<option value="${h(t.id)}" ${x.type === t.id ? 'selected' : ''}>${t.emoji} ${h(t.name)}</option>`).join('')}</select><input ${main ? 'id="e-fylabel"' : 'class="xp-name"'} value="${h(x.name || '')}" style="flex:1;min-width:140px">${main ? '' : '<button type="button" class="btn small" data-act="xpin-del" title="Remove this pin">✕</button>'}</div>
    <div style="display:flex;gap:6px;align-items:center;margin-top:6px"><span class="yemo" ${main ? 'id="e-ftypeemo"' : ''} style="font-size:20px">${pinT(x.type).emoji}</span><input ${I('e-fgps', 'xp-gps')} value="${x.lat != null ? h(x.lat + ', ' + x.lng) : ''}" style="flex:1"></div><label class="tbcchk"><input type="checkbox" ${main ? 'id="e-fytbc"' : 'class="xp-tbc"'} ${x.tbc ? 'checked' : ''}> <span class="tbcdot">${pinT(x.type).emoji}</span> TBC — not sure it's right until we visit</label>
    <div class="hint" ${main ? 'id="e-fgpshint"' : ''}>${x.lat != null ? `<a href="${gmapsPin(x)}" target="_blank" rel="noopener">Open pin in Google Maps</a>` : 'Drop a pin in Google Maps, copy the coordinates and paste here — or use Suggest a pin.'}</div>
    <div class="actions" style="margin-top:6px"><button type="button" class="btn small" data-act="pin-pick" ${main ? '' : `data-target="x${h(x.id)}"`}>🗺 Choose on the map</button><button type="button" class="btn small" data-act="farm-pinsuggest" ${main ? '' : `data-target="x${h(x.id)}"`}>📍 Suggest a pin from the address</button></div><div id="pin-res${sfx}" class="hint"></div><div id="pin-prev${sfx}"></div>
    ${main ? '' : `<div class="yc-turn" ${x.type === 'turn' ? '' : 'hidden'}>${accessFields(x.access, false)}${svBlock(x.lat != null ? x : null)}</div>`}
    <div class="yc-yard" style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap" ${!main && x.type === 'turn' ? 'hidden' : ''}><select ${I('e-fsafe', 'xp-safe')} style="flex:1;min-width:150px">${Object.entries(SAFETY).map(([k, v]) => `<option value="${k}" ${(sf.status || 'ok') === k ? 'selected' : ''}>Safety: ${v.l}</option>`).join('')}</select><input ${I('e-fsafenote', 'xp-safenote')} value="${h(sf.note || '')}" style="flex:2;min-width:150px"></div></div>`; }
function extraPinRow(x) { return yardCard(x || { id: uid('p'), type: (pinTypes().find((t) => t.yard) || { id: 'sheep' }).id, name: '', lat: null, lng: null, safety: {} }, false); }
function editFarm(b, f) {
  const isNew = !f; S.pendNotes = isNew && isClientBiz(b) ? [{ type: 'farm', k: 'assess', t: '', crush: 'need', photos: [] }] : [];
  const cli = isClientBiz(b); f = f || newFarm({ owner: { bid: b.id }, ...(cli ? {} : { pinType: 'office' }) });
  const startGps = f.lat != null ? `${f.lat}, ${f.lng}` : ''; const startTurn = f.turn && f.turn.lat != null ? `${f.turn.lat}, ${f.turn.lng}` : '';
  const fac = f.fac || {}, sf = f.safety || {}, acc = f.access || {}, rc = f.reception || {};
  const users = farmUsersOf(f.id); const fo0 = farmOwner(f); const owner = fo0.b || null;
  const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, l]) => `<option value="${h(k)}" ${(v || '') === k ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>`;
  const body = `<div class="grid2"><div class="f"><label>${locWord(b)} name</label><input id="e-fname" value="${h(f.name)}"></div>
    <div class="f"><label>Physical address</label><input id="e-faddr" class="addrac" autocomplete="off" value="${h(f.address)}"></div></div>
  <div class="f"><label>${cli ? 'General farm info' : 'Business location general info'}</label><textarea id="e-finfo" rows="3">${h(f.info)}</textarea></div>
  ${users.length > 1 ? `<div class="hint" style="margin:-4px 0 8px">Shared farm — changes show for ${usersLnk(users)}.</div>` : ''}
  <div class="pinstep turnstep"><div class="pinstep-h"><span class="pinnum">1</span>${turnPin().emoji} ${h(turnName())} pin <span class="hint">— where you leave the road</span></div>
    <div class="hint" style="margin-bottom:6px">Navigation and the distance are measured to this pin. Leave it empty if the yards are right on the road. If there's more than one way in, add the others below — the distance stays measured to this first one.</div>
    <input id="e-fturnlabel" value="${h(f.turnLabel || '')}" style="width:100%;margin-bottom:6px">
    <input id="e-fturn" value="${h(startTurn)}" style="width:100%"><label class="tbcchk"><input type="checkbox" id="e-fturntbc" ${f.turnTbc ? 'checked' : ''}> <span class="tbcdot">${turnPin().emoji}</span> TBC — not sure it's right until we visit</label><div class="hint" id="e-fturnhint">${startTurn ? `<a href="${gmapsPin(f.turn)}" target="_blank" rel="noopener">Open in Google Maps</a>` : ''}</div>
    <div class="actions" style="margin-top:6px"><button type="button" class="btn small" data-act="pin-pick" data-target="turn">🗺 Choose on the map</button><button type="button" class="btn small" data-act="farm-pinsuggest" data-target="turn">📍 Suggest a pin from the address</button></div><div id="pin-res-turn" class="hint"></div><div id="pin-prev-turn"></div>
    ${accessFields(f.access, true)}${svBlock(f.turn && f.turn.lat != null ? f.turn : null, 'svmain')}
    <div id="e-xturns">${(f.extra || []).filter((x) => x.type === 'turn').map((x) => yardCard(x, false)).join('')}</div><button type="button" class="btn small" data-act="xturn-add" style="margin-top:4px">➕ Add another ${h(turnName().toLowerCase())}</button>
    <div class="grid2" style="margin-top:8px"><div class="f"><label>Distance from homebase — km return</label><input id="e-fkm" type="number" step="0.1" value="${f.kmReturn ?? ''}"></div>
    <div class="f"><label>Drive time each way (minutes)</label><input id="e-fmin" type="number" step="1" value="${f.driveMin != null ? Math.round(f.driveMin) : ''}"></div></div>
    <div><button class="btn small" type="button" data-act="calc-dist">Calculate with Google Maps</button> <span class="hint" id="e-calchint">Measured to the ${h(turnName().toLowerCase())} pin (or the main yards if there's no ${h(turnName().toLowerCase())}).</span></div>
    <div id="e-verify"></div></div>
  <div class="pinstep"><div class="pinstep-h"><span class="pinnum">2</span>${cli ? '🐄 Yards pins <span class="hint">— where the work is done</span>' : '🏢 Business pins <span class="hint">— office, depot, shed…</span>'}</div>
    ${yardCard({ type: f.pinType, name: f.yLabel || '', lat: f.lat, lng: f.lng, safety: sf, tbc: f.yTbc }, true)}
    <div id="e-xpins">${(f.extra || []).filter((x) => x.type !== 'turn').map(extraPinRow).join('')}</div>
    <button type="button" class="btn small" data-act="xpin-add" ${cli ? '' : 'data-def="office"'}>${cli ? '➕ Add another yards (or shed, office…)' : '➕ Add another business pin'}</button></div>
  <details class="fsec" open><summary>🏷 Owner & who uses it</summary>
    <div class="lbl" style="margin:2px 0 4px">Who uses it</div><div id="e-fusers"></div>
    <div class="f" style="margin-top:6px"><label>➕ Add a business that uses it</label><input id="e-fuseradd" autocomplete="off" placeholder="🔍 Search businesses or people"><div id="e-fuserres"></div></div>
    <div class="f"><label>👑 Who owns it</label>${ownerPicker('e-fowner', f.owner)}<div class="hint">Tap 👑 Make owner on a business above — or search businesses and contacts, or just type a name (e.g. sold to someone who isn't a client).</div></div></details>
  <details class="fsec" ${(f.photos || []).length ? 'open' : ''}><summary>📷 Photos</summary><div id="e-fphotos">${farmPhotoEdit({ photos: (f.photos || []).filter((ph) => ph.kind !== 'sv') })}</div>
    <div class="hint">Street View is shown with each ${h(turnName().toLowerCase())} pin above.</div><div class="actions"><label class="btn small dzhint" style="cursor:pointer">＋ Add photos — choose from files<input type="file" id="e-fphotofile" accept="image/*" multiple style="display:none"></label></div><div id="e-svprev"></div></details>
  ${NOTE_KS.farm.map((k) => noteEditorBlock('farm', f, k, FARM_KINDS[k].edit, !D.farms.includes(f))).join('')}
  ${f.importedLabel ? `<div class="hint">Original Google Contacts label: ${h(f.importedLabel)}</div>` : ''}
  ${isNew ? '' : `<div class="f" style="margin-top:12px"><button class="btn" data-act="farm-merge" data-bid="${b.id}" data-fid="${f.id}">⇄ Merge with other yards…</button></div>`}
  ${isNew ? '' : `<div class="f" style="margin-top:12px"><button class="btn" data-act="del-farm" data-bid="${b.id}" data-fid="${f.id}" style="color:var(--red)">${users.length > 1 ? 'Remove from ' + h(b.name) : 'Delete farm'}</button></div>`}`;
  SHEET_FARM = { f, b, photos: JSON.parse(JSON.stringify((f.photos || []).filter((ph) => ph.kind !== 'sv'))), addUsers: [], users: {}, users0: {} }; (isNew ? [{ b, past: false }] : users).forEach((u) => { SHEET_FARM.users[u.b.id] = SHEET_FARM.users0[u.b.id] = u.past ? 'past' : 'cur'; }); if (isNew) SHEET_FARM.users0 = {}; setTimeout(fuRender, 0); const orig = { warning: f.warning };
  openSheet(isNew ? 'New ' + locWord(b).toLowerCase() + ' — ' + b.name : 'Edit ' + locWord(b).toLowerCase(), body, () => {
    const g = parseGps(val('e-fgps')), tg = parseGps(val('e-fturn'));
    if (val('e-fgps') && !g) { toast('Yards GPS not recognised — use "lat, lng"'); return false; }
    if (val('e-fturn') && !tg) { toast('Turn-off GPS not recognised — use "lat, lng"'); return false; }
    const xs = []; for (const row of document.querySelectorAll('#e-xturns .xpin, #e-xpins .xpin')) { const gv = row.querySelector('.xp-gps').value.trim(); const xg = parseGps(gv); if (gv && !xg) { toast('A pin in "More pins" has GPS that isn\'t recognised'); return false; } const old = (f.extra || []).find((x) => x.id === row.dataset.id) || {}; const xty = row.querySelector('.xp-type').value; const xacc = xty === 'turn' ? readAccess(row, false) : null; const st = row.querySelector('.xp-safe').value, sn = row.querySelector('.xp-safenote').value.trim(); const osf = old.safety || {};
      xs.push({ id: row.dataset.id, type: xty, name: row.querySelector('.xp-name').value.trim(), lat: xg ? xg.lat : null, lng: xg ? xg.lng : null, ...(xacc ? { access: xacc } : {}), ...(row.querySelector('.xp-tbc') && row.querySelector('.xp-tbc').checked ? { tbc: true } : {}), safety: st === 'ok' && !sn ? {} : { status: st, note: sn, date: st === osf.status && sn === osf.note ? osf.date : new Date().toLocaleDateString('en-AU'), by: st === osf.status && sn === osf.note ? osf.by : devInfo().nick } }); }
    const gpsChanged = (g ? `${g.lat},${g.lng}` : '') !== (f.lat != null ? `${f.lat},${f.lng}` : '') || (tg ? `${tg.lat},${tg.lng}` : '') !== (f.turn && f.turn.lat != null ? `${f.turn.lat},${f.turn.lng}` : '');
    const needVerify = SHEET.verifyNeeded;
    if (needVerify && !($('#e-verified') && $('#e-verified').checked)) { toast('Distance requires verification before saving'); $('#e-verify').scrollIntoView({ block: 'center' }); return false; }
    const km = val('e-fkm'), mn = val('e-fmin');

    const st = $('#e-fsafe').value, sn = val('e-fsafenote'); const nsf = st === 'ok' && !sn ? null : { status: st, note: sn, date: st === sf.status && sn === (sf.note || '') ? sf.date : new Date().toLocaleDateString('en-AU'), by: st === sf.status && sn === (sf.note || '') ? sf.by : devInfo().nick };

    if (!Object.values(SHEET_FARM.users).some((v) => v !== 'del')) { toast('At least one business has to use it — or delete the farm instead'); $('#e-fusers').scrollIntoView({ block: 'center' }); return false; }
    const ownerV = readOwner('e-fowner');
    Object.assign(f, { name: val('e-fname'), yLabel: val('e-fylabel'), turnLabel: val('e-fturnlabel'), pinType: $('#e-ftype').value, address: val('e-faddr'), info: $('#e-finfo').value.trim(), kmReturn: km === '' ? null : +km, driveMin: mn === '' ? null : +mn,
      access: readAccess(null, true), safety: nsf, extra: xs, owner: ownerV, photos: [...SHEET_FARM.photos, ...(f.photos || []).filter((ph) => ph.kind === 'sv')] });
    if ($('#e-fturntbc') && $('#e-fturntbc').checked) f.turnTbc = true; else delete f.turnTbc; if ($('#e-fytbc') && $('#e-fytbc').checked) f.yTbc = true; else delete f.yTbc;
    if (!f.yLabel) delete f.yLabel; if (!f.turnLabel) delete f.turnLabel; Object.keys(f).forEach((k) => { if (f[k] === null && ['access', 'fac', 'safety', 'reception', 'owner'].includes(k)) delete f[k]; if (['biosec', 'extra', 'photos'].includes(k) && (f[k] === '' || (Array.isArray(f[k]) && !f[k].length))) delete f[k]; });
    if (g) { f.lat = g.lat; f.lng = g.lng; } else { f.lat = f.lng = null; }
    const turnWas = f.turn && f.turn.lat != null ? `${f.turn.lat},${f.turn.lng}` : ''; if (tg) f.turn = { lat: tg.lat, lng: tg.lng }; else delete f.turn; if (tg && `${tg.lat},${tg.lng}` !== turnWas) { delete f.svOk; SHEET_FARM.svAsk = f.id; }
    if (gpsChanged) f.flags = (f.flags || []).filter((x) => x.type !== 'signfix' && x.type !== 'kmcheck');
    f.kmStatus = f.kmReturn == null ? 'missing' : needVerify || f.kmStatus === 'needs-verify' ? 'verified' : f.kmStatus;
    if ($('#e-verified') && $('#e-verified').checked) f.kmStatus = 'verified';
    if (isNew) { D.farms.push(f); linkFarm(b, f); pendApply(f, 'farm'); }
    Object.entries(SHEET_FARM.users).forEach(([bid, st]) => { const ub = IDX.biz.get(bid); if (!ub || (SHEET_FARM.users0[bid] === st && !(isNew && ub === b))) return; if (st === 'del') unlinkFarm(ub, f.id); else linkFarm(ub, f, st === 'past'); });
    touch(f); reindex();
    return true;
  });
  SHEET.verifyNeeded = false;

  const showVerify = () => {
    SHEET.verifyNeeded = true;
    $('#e-verify').innerHTML = `<div class="verifybox"><b>Distance requires verification before saving.</b><div class="hint" style="color:var(--yellow-ink)">A GPS pin or the distance has changed. Check the km and drive time above (use “Calculate with Google Maps” or check manually), then tick:</div><label style="display:flex;gap:8px;margin-top:6px;font-weight:600"><input type="checkbox" id="e-verified"> I have checked the distance and drive time</label></div>`;
    $('#e-fkm').style.background = $('#e-fmin').style.background = 'var(--yellow-bg)';
  };
  $('#e-fgps').addEventListener('input', () => {
    const g = parseGps(val('e-fgps')); const hint = $('#e-fgpshint');
    hint.innerHTML = g ? `<a href="${gmapsPin(g)}" target="_blank" rel="noopener">Check pin in Google Maps</a> (${g.lat.toFixed(5)}, ${g.lng.toFixed(5)})` : val('e-fgps') ? '<span style="color:var(--red)">Not recognised yet</span>' : '';
    if (g && `${g.lat}, ${g.lng}` !== startGps && !SHEET.verifyNeeded) showVerify();
  });
  $('#e-fturn').addEventListener('input', () => {
    const g = parseGps(val('e-fturn')); const hint = $('#e-fturnhint');
    hint.innerHTML = g ? `<a href="${gmapsPin(g)}" target="_blank" rel="noopener">Check turn-off in Google Maps</a> (${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}) — the km is measured to here` : val('e-fturn') ? '<span style="color:var(--red)">Not recognised yet</span>' : 'Navigation and the km go to the turn-off when there is one.';
    if (g && `${g.lat}, ${g.lng}` !== startTurn && !SHEET.verifyNeeded) showVerify();
  });
  $('#e-fphotofile').addEventListener('change', async (e) => { const files = [...(e.target.files || [])]; if (!files.length) return; for (const file of files) { const data = await fileToDataUrl(file, 900); SHEET_FARM.photos.push({ id: uid('ph'), kind: 'upload', data, at: Date.now(), by: devInfo().nick }); } $('#e-fphotos').innerHTML = farmPhotoEdit({ photos: SHEET_FARM.photos }); e.target.value = ''; });
  ['e-fkm', 'e-fmin'].forEach((id) => $('#' + id).addEventListener('input', () => { if (!SHEET.verifyNeeded) showVerify(); }));
  if (f.kmStatus === 'needs-verify') showVerify();
  SHEET.calc = async () => {
    const g = parseGps(val('e-fturn')) || parseGps(val('e-fgps')); const hint = $('#e-calchint');
    if (!g) { hint.textContent = 'Add a GPS pin first.'; return; }
    hint.textContent = 'Calculating…';
    try { const r = await Maps.distances([g]); const x = r[0]; if (!x) throw new Error('No route found'); $('#e-fkm').value = Math.ceil(x.km * 2 - 1e-9); $('#e-fmin').value = Math.round(x.min); hint.innerHTML = `Google Maps${parseGps(val('e-fturn')) ? ' (to the turn-off)' : ''}: ${(x.km * 2).toFixed(1)} km return (rounded up to ${Math.ceil(x.km * 2 - 1e-9)} km), ${fmtMin(x.min)} each way. Please check. <a href="${gmapsRoute(g)}" target="_blank" rel="noopener">🗺 View route</a>`; if (!SHEET.verifyNeeded) showVerify(); }
    catch (e) { hint.textContent = e.message; }
  };
}
let SHEET_FARM = null;
async function verifyKmBox(f) { /* a new or moved pin: confirm the distance there and then */
  let g = null, err = ''; if (Maps.key() && navigator.onLine) { try { g = (await Maps.distances([farmRoutePt(f)]))[0] || null; } catch (e) { err = e.message; } }
  const gk = g ? Math.ceil(g.km * 2 - 1e-9) : null, gm = g ? Math.round(g.min) : null; const inp = 'style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"';
  const r = await askBox('Check the distance', `<p><b>${h(farmLabel(f))}</b></p>${g ? `<p>Google Maps: <b>${(g.km * 2).toFixed(1)} km return</b> (rounded up to ${gk} km), ${fmtMin(g.min)} each way. <a href="${gmapsRoute(farmRoutePt(f))}" target="_blank" rel="noopener">🗺 View route</a></p>` : `<p class="hint">${err ? h(err) : Maps.key() ? 'Offline — enter the distance yourself.' : 'No Google Maps key — enter the distance yourself.'}</p>`}
    <div class="grid2"><div class="f"><span class="lbl">km return</span><input data-ask="km" type="number" step="0.1" value="${f.kmReturn ?? gk ?? ''}" ${inp}></div><div class="f"><span class="lbl">Drive time each way (min)</span><input data-ask="min" type="number" value="${f.driveMin != null ? Math.round(f.driveMin) : gm ?? ''}" ${inp}></div></div>
    ${f.kmReturn != null && gk != null && Math.abs(f.kmReturn - gk) > 1 ? `<div class="hint" style="color:var(--yellow-ink)">The recorded distance (${f.kmReturn} km) differs from Google's — change it above if needed.</div>` : ''}`, 'Distance checked — save', false, 'Cancel');
  if (!r) return false; const km = (ASK_FORM.km || '').trim(), mn = (ASK_FORM.min || '').trim();
  f.kmReturn = km === '' ? null : +km; f.driveMin = mn === '' ? null : +mn; f.kmStatus = f.kmReturn == null ? 'missing' : 'verified'; if (g) { f.gKm = gk; f.gMin = gm; f.gAt = Date.now(); } f.flags = (f.flags || []).filter((x) => x.type !== 'kmcheck'); return true;
}
async function recHere() { /* uses the phone's location + a quick download to judge reception at the yards */
  const hint = $('#e-rechint'); if (!hint) return; hint.textContent = 'Checking…';
  const g = parseGps(val('e-fgps')) || parseGps(val('e-fturn'));
  let far = '';
  try { const pos = await new Promise((res, rej) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 }) : rej(new Error('no gps'))); if (g) { const km = hav({ lat: pos.coords.latitude, lng: pos.coords.longitude }, g); if (km > 2) far = ` ⚠ You seem to be ${km.toFixed(1)} km from the yards pin — only save this if you're really at the yards.`; } } catch (e) { far = ' (Couldn\'t get your location — make sure you\'re at the yards.)'; }
  let st = 'none', ms = null;
  if (navigator.onLine) { const t0 = performance.now(); try { const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 8000); await fetch('version.json?r=' + Date.now(), { cache: 'no-store', signal: ctl.signal }); clearTimeout(tm); ms = performance.now() - t0; const et = (navigator.connection || {}).effectiveType || ''; st = ms < 1500 && !/2g/.test(et) ? 'good' : 'patchy'; } catch (e) { st = 'none'; } }
  $('#e-frec').value = st; if (!val('e-frecnote')) $('#e-frecnote').value = '';
  hint.innerHTML = `Result: <b>${RECEPTION[st]}</b>${ms != null ? ` (${Math.round(ms)} ms)` : ''}. Change it if it doesn't match what your phone shows, then Save.${far}`;
}
function farmPhotoEdit(f) { const ps = f.photos || []; if (!ps.length) return '<div class="hint">No photos yet.</div>'; return `<div class="fphotos">${ps.map((ph) => `<div class="fph"><img src="${photoSrc(ph, 320, 180) || ''}" alt="" onerror="this.style.opacity=.3"><button type="button" class="btn small" data-act="fphoto-del" data-id="${h(ph.id)}">✕</button><div class="hint">${ph.kind === 'sv' ? 'Street View' : 'Photo'}${ph.by ? ' · ' + h(ph.by) : ''}</div></div>`).join('')}</div>`; }
/* ---------------- Google Maps (needs API key in Settings) ---------------- */
/* Google address suggestions while typing (Places API (New) autocomplete) — only helps fill in the text, never sets a pin */
const ADDR_PREFIX = /^((?:P\.?\s?O\.?|GPO|Locked|Private)\s*(?:Box|Bag)\s*\d+|RMB\s*\d+|(?:Suite|Unit|Shop|Level|Lvl|Apt|Apartment)\s*[\w\/-]+)\s*,?\s*/i;
const AC = { tm: null, sess: null, el: null };
const acAnchor = (el) => el.closest('.rep') || el; const acBoxOf = (el) => { const n = acAnchor(el).nextElementSibling; return n && n.classList.contains('acbox') ? n : null; };
async function addrSuggest(q, townOnly) { const home = D.settings.home || {}; AC.sess = AC.sess || uid('s');
  const body = { input: q, includedRegionCodes: ['au'], sessionToken: AC.sess, ...(townOnly ? { includedPrimaryTypes: ['locality', 'postal_code'] } : {}), ...(home.lat != null ? { locationBias: { circle: { center: { latitude: home.lat, longitude: home.lng }, radius: 50000 } } } : {}) };
  const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': Maps.key() }, body: JSON.stringify(body) }); const js = await r.json();
  if (!r.ok) throw new Error((js.error || {}).message || 'Address suggestions need Places API (New) on your Google key');
  return (js.suggestions || []).map((x) => x.placePrediction).filter(Boolean).map((x) => ({ id: x.placeId, main: ((x.structuredFormat || {}).mainText || {}).text || x.text.text, sub: ((x.structuredFormat || {}).secondaryText || {}).text || '' })); }
async function addrDetail(id) { const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?sessionToken=${AC.sess || ''}`, { headers: { 'X-Goog-Api-Key': Maps.key(), 'X-Goog-FieldMask': 'formattedAddress' } }); const js = await r.json(); AC.sess = null; return (js.formattedAddress || '').replace(/,?\s*Australia$/, ''); }
function acLine(el) { if (el.tagName !== 'TEXTAREA') return { text: el.value, start: 0, end: el.value.length }; const v = el.value, c = el.selectionStart; const start = v.lastIndexOf('\n', c - 1) + 1, e = v.indexOf('\n', c); const end = e < 0 ? v.length : e; return { text: v.slice(start, end), start, end }; }
document.addEventListener('input', (e) => { const el = e.target; if (!el.classList || !el.classList.contains('addrac')) return; clearTimeout(AC.tm); const old = acBoxOf(el); if (old) old.remove();
  const line = acLine(el).text.trim(); if (line.length < 4 || !Maps.key() || !navigator.onLine) return;
  AC.tm = setTimeout(async () => { const m = line.match(ADDR_PREFIX); const pre = m ? m[1] : ''; const rest = m ? line.slice(m[0].length) : line; const townOnly = !!pre && !/^(suite|unit|shop|level|lvl|apt|apartment)/i.test(pre); if (rest.length < 2) return;
    let res; try { res = await addrSuggest(rest, townOnly); } catch (err) { res = null; const b = document.createElement('div'); b.className = 'acbox'; b.innerHTML = `<div class="hint" style="padding:6px 8px">${h(err.message)}</div>`; acAnchor(el).insertAdjacentElement('afterend', b); return; }
    if (!res.length || acLine(el).text.trim() !== line) return; const b = document.createElement('div'); b.className = 'acbox results'; AC.el = el; AC.pre = pre;
    b.innerHTML = res.slice(0, 5).map((x) => `<div data-act="ac-pick" data-id="${h(x.id)}" data-main="${h(x.main)}" data-sub="${h(x.sub)}">${pre ? `<span class="hint">${h(pre)},</span> ` : ''}<b>${h(x.main)}</b> <span class="hint">${h(x.sub.replace(/,?\s*Australia$/, ''))}</span></div>`).join('') + '<div class="hint" style="padding:4px 8px;font-size:11.5px">Suggestions from Google — tap one, or keep typing</div>';
    const prev = acBoxOf(el); if (prev) prev.remove(); acAnchor(el).insertAdjacentElement('afterend', b); }, 350); });
document.addEventListener('focusout', (e) => { if (e.target.classList && e.target.classList.contains('addrac')) setTimeout(() => { const b = acBoxOf(e.target); if (b && !b.contains(document.activeElement)) b.remove(); }, 250); });
const Maps = {
  key() { return D.settings.mapsKey || ''; },
  mods() { const r = routeSet(); return { avoidTolls: !!r.avoidTolls, avoidHighways: !!r.avoidHighways, avoidFerries: !!r.avoidFerries }; },
  async distances(dests, origin = D.settings.home) {
    if (!this.key()) throw new Error('Add your Google Maps key in Settings to calculate distances.');
    if (!navigator.onLine) throw new Error('You are offline — distances need internet.');
    const out = [];
    for (let i = 0; i < dests.length; i += 25) {
      const chunk = dests.slice(i, i + 25);
      const mods = this.mods(); const o = { waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } } }; if (Object.values(mods).some(Boolean)) o.routeModifiers = mods; /* only send avoid settings when one is on */
      const body = { origins: [o], destinations: chunk.map((d) => ({ waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lng } } } })), travelMode: 'DRIVE' }; /* route matrix takes avoid-tolls etc. on each origin, not at the top */
      const send = () => fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key(), 'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,condition' }, body: JSON.stringify(body) });
      let r = await send(); if (r.status === 400 && o.routeModifiers) { const t = await r.clone().text(); if (/routeModifiers/.test(t)) { delete o.routeModifiers; r = await send(); } } /* Google refused the avoid settings: try again without them */
      if (!r.ok) throw new Error('Google Maps error ' + r.status + ': ' + (await r.text()).slice(0, 160));
      const js = await r.json();
      js.forEach((e) => { if (e.condition === 'ROUTE_EXISTS' || e.distanceMeters) out[i + e.destinationIndex] = { km: e.distanceMeters / 1000, min: parseInt(e.duration) / 60 }; });
    }
    return out;
  },
  async loop(home, stops, end) { /* km for start → stops in this order → finish (homebase both ends unless given) */ end = end || home; if (!this.key() || !navigator.onLine) return null; const wp = (p) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
    const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key(), 'X-Goog-FieldMask': 'routes.distanceMeters' }, body: JSON.stringify({ origin: wp(home), destination: wp(end), intermediates: stops.map(wp), travelMode: 'DRIVE' }) });
    if (!r.ok) return null; const js = await r.json(); const rt = js.routes && js.routes[0]; return rt ? rt.distanceMeters / 1000 : null; },
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
/* ---------------- list order: A–Z or custom (drag ⠿ or ↑ ↓), saved on the record per list ---------------- */
const loMode = (rec, key) => ((rec.listSort || {})[key]) || (key === 'farms' && (rec.farmOrder || []).length ? 'custom' : 'az');
function loSort(rec, key, items, idOf, nameOf) { const az = items.slice().sort((a, b) => alphaCmp(nameOf(a) || '', nameOf(b) || '')); if (loMode(rec, key) !== 'custom') return az; const ord = (rec.listOrder || {})[key] || [];
  return az.sort((a, b) => { const i = ord.indexOf(idOf(a)), j = ord.indexOf(idOf(b)); if (i >= 0 && j >= 0) return i - j; if (i >= 0) return -1; if (j >= 0) return 1; return 0; }); }
const loBar = (kind, rec, key) => `<span class="lobar" title="How this list is ordered"><button type="button" class="${loMode(rec, key) === 'az' ? 'on' : ''}" data-act="lo-mode" data-kind="${kind}" data-id="${rec.id}" data-key="${key}" data-v="az">A–Z</button><button type="button" class="${loMode(rec, key) === 'custom' ? 'on' : ''}" data-act="lo-mode" data-kind="${kind}" data-id="${rec.id}" data-key="${key}" data-v="custom">Custom</button></span>`;
function loWrap(kind, rec, key, rows) { /* rows = [[id, html]] */ if (loMode(rec, key) !== 'custom' || rows.length < 2) return rows.map((r) => r[1]).join('');
  return `<div data-dnd="lo:${kind}:${rec.id}:${key}">${rows.map(([id, html], i) => `<div class="dragrow lorow" data-dk="${h(id)}"><span class="dragcol"><span class="draghandle" title="Hold and drag to reorder">⠿</span><button type="button" class="btn small" data-act="lo-mv" data-kind="${kind}" data-id="${rec.id}" data-key="${key}" data-k="${h(id)}" data-d="-1" ${i ? '' : 'disabled'} title="Move up">↑</button><button type="button" class="btn small" data-act="lo-mv" data-kind="${kind}" data-id="${rec.id}" data-key="${key}" data-k="${h(id)}" data-d="1" ${i < rows.length - 1 ? '' : 'disabled'} title="Move down">↓</button></span><div class="farmrowc">${html}</div></div>`).join('')}</div>`; }
const loRec = (kind, id) => (kind === 'business' ? IDX.biz.get(id) : D.contacts.find((x) => x.id === id));
function sortFarms(b, list) { /* alphabetical, unless the business's farm list is set to Custom */ const ord = loMode(b, 'farms') === 'custom' ? b.farmOrder || [] : [];
  return list.slice().sort((x, y) => { const i = ord.indexOf(x.id), j = ord.indexOf(y.id); if (i >= 0 && j >= 0) return i - j; if (i >= 0) return -1; if (j >= 0) return 1; return alphaCmp(x.name || pinT(x.pinType).name, y.name || pinT(y.pinType).name); }); }
const farmDrag = (b, list, past) => loMode(b, 'farms') !== 'custom' ? sortFarms(b, list).map((f) => `<div class="farmrow">${farmCard(b, f, false, past)}</div>`).join('') : `<div data-dnd="farms:${b.id}">${sortFarms(b, list).map((f, i, arr) => `<div class="dragrow farmrow" data-dk="${f.id}"><span class="dragcol"><span class="draghandle" title="Hold and drag to reorder">⠿</span><button type="button" class="btn small" data-act="farm-mv" data-bid="${b.id}" data-fid="${f.id}" data-dir="-1" ${i ? '' : 'disabled'} title="Move up">↑</button><button type="button" class="btn small" data-act="farm-mv" data-bid="${b.id}" data-fid="${f.id}" data-dir="1" ${i < arr.length - 1 ? '' : 'disabled'} title="Move down">↓</button></span><div class="farmrowc">${farmCard(b, f, false, past)}</div></div>`).join('')}</div>`;
const bLnk = (b, extra = '') => (b ? `<span class="lnk" data-act="open" data-kind="business" data-id="${b.id}">${h(b.name)}</span>${extra}` : '');
const cLnk = (c) => (c ? `<span class="lnk" data-act="open" data-kind="contact" data-id="${c.id}">${h(fullName(c))}</span>` : '');
const usersLnk = (us) => us.map((u) => bLnk(u.b, u.past ? ' <span class="hint">(not current)</span>' : '')).join(', ');
const farmLabelLnk = (f) => { const b = IDX.farmBiz && IDX.farmBiz.get(f.id); return b ? bLnk(b) + (f.name ? ' — ' + h(f.name) : '') : h(farmLabel(f)); };
function farmOwner(f) { /* {name, b, c} — the owner can be a business, a contact, or just a typed name */ const o = f.owner || {};
  if (o.bid) { const b = IDX.biz.get(o.bid); if (b) return { name: b.name, b }; } if (o.cid) { const c = D.contacts.find((x) => x.id === o.cid); if (c) return { name: fullName(c), c }; } return { name: o.text || '' }; }
function ownedBy(f, b) { const o = f.owner; if (!o || (!o.bid && !o.cid && !o.text && !o.unknown)) return true; if (o.bid) return o.bid === b.id || !IDX.biz.get(o.bid); if (o.cid) { const c = D.contacts.find((x) => x.id === o.cid); return !!c && curLinks(c).some((l) => l.bid === b.id); } return false; }
function farmLabel(f) { const b = IDX.farmBiz && IDX.farmBiz.get(f.id); return (b ? b.name : (f.owner && f.owner.text) || '') + (f.name ? (b || (f.owner && f.owner.text) ? ' — ' : '') + f.name : b ? '' : f.address || 'Farm'); }
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
  ${e.type === 'place' ? `<input class="ep-place" data-w="${which}" value="${h(e.text || '')}" style="margin-top:6px;width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:9px"><div class="hint">Google Maps will search for this place.</div>` : ''}
  ${e.type === 'home' ? `<div class="hint">317 Gull Rock Road, Kalgan, WA 6330</div>` : ''}</div>`;
}
function renderRoute() {
  const R = S.route;
  let html = `<div class="d-wrap"><h2 class="sec-h" style="font-size:26px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="flex:1">${h(lab('route'))}</span><button class="btn small" data-act="area-ai" data-v="route">🤖 Ask Claude about this route</button></h2>
  <div class="card"><h3>Stops (${R.stops.length}/${MAX_STOPS})</h3>
  ${R.stops.map((s, i) => { const f = IDX.farms.get(s.fid); return `<div class="stop"><span class="num">${i + 1}</span><div class="t"><div style="font-weight:600">${farmLabelLnk(f)}</div><div class="hint">${h(f.address || '')} ${f.kmReturn != null ? '· ' + fmtKm(f) : ''}</div></div><button class="btn small" data-act="rs-up" data-i="${i}" ${i ? '' : 'disabled'}>↑</button><button class="btn small" data-act="rs-down" data-i="${i}" ${i < R.stops.length - 1 ? '' : 'disabled'}>↓</button><button class="btn small" data-act="rs-del" data-i="${i}">×</button></div>`; }).join('') || '<div class="hint">Add farms below, or use “+ Route” on any farm.</div>'}
  ${R.stops.length < MAX_STOPS ? `<input id="rs-search" placeholder="Search clients, businesses, farms or PICs to add a stop" style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;margin-top:6px"><div id="rs-res"></div>` : '<div class="hint">Google Maps allows up to 9 stops.</div>'}
  </div>
  <div class="card"><h3>Start and finish</h3>${endpointPicker('start')}
  <div class="f"><label><input type="checkbox" data-act="endsame" ${R.endSame ? 'checked' : ''}> Finish where I started</label></div>
  ${R.endSame ? '' : endpointPicker('end')}</div>
  <div class="card"><h3>Order</h3><div class="seg"><button class="${R.mode === 'efficient' ? 'on' : ''}" data-act="rmode" data-v="efficient">Most efficient</button><button class="${R.mode === 'order' ? 'on' : ''}" data-act="rmode" data-v="order">The order I picked</button></div>
  <div class="hint" style="margin-top:6px">${D.settings.mapsKey ? 'Most efficient uses Google Maps road routing when online.' : 'Most efficient uses straight-line distances until the Google Maps key is added in Settings.'}</div></div>
  <div class="actions"><button class="btn red" data-act="route-go" ${R.stops.length ? '' : 'disabled'} style="font-size:17px;padding:12px 18px">Open route in Google Maps</button>${R.stops.length ? `${R.savedId && D.routes.some((x) => x.id === R.savedId) ? `<button class="btn primary" data-act="route-save">💾 Save changes to "${h(D.routes.find((x) => x.id === R.savedId).name)}"</button><button class="btn" data-act="route-saveas">Save as new route</button>` : '<button class="btn primary" data-act="route-save">💾 Save route</button>'}<button class="btn" data-act="route-clear">Clear</button>` : ''}</div><div id="route-msg" class="hint"></div>
  ${savedRoutesCard()}<div id="routemap" data-pk="farmmap"></div></div>`;
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
  let stops = R.stops.map((s) => { const f = IDX.farms.get(s.fid); return { ...farmRoutePt(f), fid: f.id }; }); /* Google Maps takes you to each farm's turn-off when it has one */
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
  if (FMAP) { FMAP.remove(); FMAP = null; FMAP_LAYER = null; } $('#list').innerHTML = renderRoute(); applyPageEd('route'); renderMapTab(); $('#route-msg').textContent = msg.textContent || (R.mode === 'efficient' ? 'Stops re-ordered for the shortest drive.' : '');
}

/* ---------------- jobs view ---------------- */
S.jobSel = new Set(); S.jobOpen = {};
// which "do it to all selected" actions make sense for each kind of job
function bulkOps(t, sel) {
  const ops = [];
  if (sel.some((j) => j.suggest)) ops.push({ op: 'usekm', label: '✓ Use suggested km for all', green: true });
  if (sel.some((j) => j.photoSuggest)) ops.push({ op: 'usephoto', label: '✓ Use suggested photo for all', green: true });
  if (sel.some((j) => j.type === 'photo')) ops.push({ op: 'keepphoto', label: 'Leave photo as is for all' }, { op: 'splitphoto', label: 'Use a split photo for all (top two)' });
  if (t === 'catprop') ops.push({ op: 'catapply', label: '✓ Yes — change them too', green: true });
  if (t === 'blockcheck') ops.push({ op: 'blockyes', label: '✓ Yes — numbers blocked', green: true }, { op: 'blockno', label: 'Not yet' });
  if (t === 'maiden') ops.push({ op: 'maidenfix', label: '✓ Move all to Maiden name', green: true });
  if (t === 'farmname' && sel.some((j) => j.nameSug)) ops.push({ op: 'fnameuse', label: '✓ Rename all to their road name', green: true });
  if (t === 'nocat') ops.push({ op: 'setcat', label: 'Set this category for all selected', green: true });
  if (t === 'sheep') ops.push({ op: 'sheepreg', label: 'Change all to Sheep only (regular)' });
  if (t === 'primin') ops.push({ op: 'priminall', label: '✓ Change all selected to Primary (inactive)', green: true });
  if (t === 'linkreview') ops.push({ op: 'lrpast', label: 'Make all selected past employees' }, { op: 'lrundo', label: 'Undo — remove all selected links' });
  if (t === 'linksuggest') ops.push({ op: 'linkall', label: '✓ Link all selected as current employees', green: true }, { op: 'linkallpast', label: '✓ Link all selected as past employees', green: true });
  if (t === 'noprimary') ops.push({ op: 'primall', label: '✓ Use the suggested primary contact for all selected', green: true });
  if (t === 'bizonly') ops.push({ op: 'bizonlyall', label: "✓ Yes — just the business, for all selected", green: true });
  if (t === 'noprimary') ops.push({ op: 'noprimreq', label: 'Primary contact not required' }, { op: 'nonclient', label: 'Make non-client (industry) businesses' });
  if (t === 'conflict') ops.push({ op: 'keepmine', label: "Keep this device's version for all" }, { op: 'keeptheirs', label: 'Keep the other version for all' });
  if (t === 'oldinfo') ops.push({ op: 'oldmove', label: '→ Move all selected into General farm info', green: true });
  if (t === 'dupfarm') ops.push({ op: 'dismiss', label: 'Different farms — all selected' });
  if (t === 'nearpin') ops.push({ op: 'samefarm1', label: "Same yards — combine into one shared farm (keep 1's details)" }, { op: 'dismiss', label: 'Different farms' });
  if (t === 'dupe') ops.push({ op: 'dismiss', label: 'Not duplicates' });
  if (JOB_TYPES[t].manual) ops.push({ op: 'dismiss', label: JOB_TYPES[t].btn || 'Mark resolved - changes not required' });
  const seen = new Set(); return ops.filter((o) => (seen.has(o.op) ? false : seen.add(o.op)));
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
  let linkRole = '';
  if (op === 'linkall' || op === 'linkallpast') { const j0 = sel.find((j) => j.linkSug); const c0 = j0 && D.contacts.find((x) => x.id === j0.linkSug.cid), b0 = j0 && IDX.biz.get(j0.linkSug.bid); const r = sel.length === 1 && c0 && b0 ? await askLinkRole(c0, b0, op === 'linkallpast') : await askLinkRole(null, null, op === 'linkallpast', sel.length); if (r === null) { toast('Nothing was changed'); return; } linkRole = r; }
  sel.forEach((j) => {
    if (op === 'dismiss') {
      D.dismissed[j.key] = Date.now(); D._dismissDirty = true;
      if (t === 'signfix') { const f = IDX.farms.get(j.fid); if (f) { f.flags = (f.flags || []).filter((x) => x.type !== 'signfix'); touch(f); } }
    } else if (op === 'usekm' && j.suggest) {
      j.suggest.fids.forEach((fid) => { const f = IDX.farms.get(fid); if (!f) return; f.kmReturn = j.suggest.km; f.kmStatus = 'verified'; if (f.gMin != null && f.driveMin == null) f.driveMin = f.gMin; f.flags = (f.flags || []).filter((x) => x.type !== 'kmcheck'); touch(IDX.farms.get(fid)); });
    } else if (op === 'samefarm1' && j.pair) {
      const keep = IDX.farms.get(j.pair.a), other = IDX.farms.get(j.pair.b);
      if (keep && other && D.farms.includes(keep) && D.farms.includes(other)) combineFarms(keep, other);
      D.dismissed[j.key] = Date.now(); D._dismissDirty = true;
    } else if (op === 'oldmove' && j.oldinfo) { const f = IDX.farms.get(j.oldinfo); if (f) { const bits = oldFarmInfo(f); f.info = [f.info, bits.join('\n')].filter((x) => (x || '').trim()).join('\n\n'); delete f.fac; delete f.reception; delete f.biosec; touch(f); }
    } else if ((op === 'keepmine' || op === 'keeptheirs') && j.data) { resolveConflict(j.data.key, op === 'keepmine' ? 'mine' : 'theirs');
    } else if (op === 'catapply' && j.cat) applyCat(j.cat.cid, j.cat.at);
    else if (op === 'fnameuse' && j.nameSug) { const f = IDX.farms.get(j.fid); if (f && isPlainFarmName(f.name)) { f.name = j.nameSug; touch(f); } }
    else if (op === 'maidenfix' && j.maidenFix) { const c = D.contacts.find((x) => x.id === j.id); if (c) maidenApply(c); }
    else if (op === 'blockyes' && j.block) setBlocked(j.block, true);
    else if (op === 'blockno' && j.block) setBlocked(j.block, false);
    else if (op === 'splitphoto' && j.type === 'photo' && (j.photoCands || []).length > 1) { const c = D.contacts.find((x) => x.id === j.id); if (c) { c.photoChoice = 'split:' + j.photoCands.slice(0, 2).join(','); touch(c); } }
    else if (op === 'keepphoto' && j.type === 'photo') { const c = D.contacts.find((x) => x.id === j.id); if (c) keepPhoto(c); }
    else if (op === 'usephoto' && j.photoSuggest) { const c = D.contacts.find((x) => x.id === j.id); if (c) { c.photoChoice = j.photoSuggest; touch(c); } }
    else if (op === 'setcat' && jbCat) { const c = D.contacts.find((x) => x.id === j.id); if (c) setOne(c, jbCat); }
    else if (op === 'sheepreg') { const c = D.contacts.find((x) => x.id === j.id); if (c) { setCats(c, [...effCats(c).filter((x) => x !== 'sheepocc' && x !== 'sheep'), 'sheepreg']); c.flags = (c.flags || []).filter((x) => x.type !== 'sheepconfirm'); } }
    else if (op === 'priminall' && j.primin) { const c = D.contacts.find((x) => x.id === j.primin); if (c) { c.tags = c.tags.filter((t2) => t2 !== 'pa'); if (!c.tags.includes('pi')) c.tags.push('pi'); touch(c); } }
    else if ((op === 'lrpast' || op === 'lrundo') && j.linkRev) { const c = D.contacts.find((x) => x.id === j.linkRev.cid); if (c) { const prev = catOf(c); c.links = op === 'lrundo' ? c.links.filter((l) => l.bid !== j.linkRev.bid) : c.links.map((l) => (l.bid === j.linkRev.bid ? { bid: l.bid, past: true } : l)); reindex(); if (prev) setOne(c, prev); touch(c); } }
    else if (op === 'linkallpast' && j.linkSug) { const c = D.contacts.find((x) => x.id === j.linkSug.cid); if (c && !c.links.some((l) => l.bid === j.linkSug.bid)) { const prev = catOf(c); c.links.push(linkRole ? { bid: j.linkSug.bid, past: true, role: linkRole } : { bid: j.linkSug.bid, past: true }); reindex(); if (prev) setOne(c, prev); touch(c); } }
    else if (op === 'linkall' && j.linkSug) { const c = D.contacts.find((x) => x.id === j.linkSug.cid); if (c && !c.links.some((l) => l.bid === j.linkSug.bid)) { const prev = catOf(c); c.links.push(linkRole ? { bid: j.linkSug.bid, role: linkRole } : { bid: j.linkSug.bid }); reindex(); if (prev) setOne(c, prev); touch(c); } }
    else if (op === 'primall' && j.primSuggest) { const b = IDX.biz.get(j.id), c = D.contacts.find((x) => x.id === j.primSuggest); if (b && c) { b.primaryContact = c.id; touch(b); if (!c.tags.includes('pa') && !c.tags.includes('pi')) { c.tags.push('pa'); touch(c); } } }
    else if (op === 'bizonlyall' && j.bizonly) { const c = D.contacts.find((x) => x.id === j.bizonly.cid), b = IDX.biz.get(j.bizonly.bid); if (c && b) convertBizOnly(c, b); }
    else if (op === 'noprimreq' || op === 'nonclient') { const b = IDX.biz.get(j.id); if (b) { b.primaryRequired = false; if (op === 'nonclient') makeIndustry(b); touch(b); } }
  });
  S.jobSel.clear(); NEXT_LOG_LABEL = `Jobs: ${label.replace(/^✓ /, '')} (${sel.length})`; photoCache.clear(); if (await changed()) { Sync.soon(); toast('✓ Done — ' + sel.length + ' job' + (sel.length === 1 ? '' : 's')); }
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return; const a = el.dataset.act;
  if (a === 'job-sel') { el.checked ? S.jobSel.add(el.dataset.key) : S.jobSel.delete(el.dataset.key); rerenderJobs(); }
  else if (a === 'job-selall') { e.stopPropagation(); const g = jobsShown().filter((j) => j.type === el.dataset.type); g.forEach((j) => (el.checked ? S.jobSel.add(j.key) : S.jobSel.delete(j.key))); S.jobOpen[el.dataset.type] = true; rerenderJobs(); }
  else if (a === 'job-selnone') { jobsShown().filter((j) => j.type === el.dataset.type).forEach((j) => S.jobSel.delete(j.key)); rerenderJobs(); }
  else if (a === 'job-bulk') runBulk(el.dataset.type, el.dataset.op);
});
document.addEventListener('toggle', (e) => { const d = e.target; if (d.classList && d.classList.contains('jobgroup')) S.jobOpen[d.dataset.type] = d.open; }, true);
function rerenderJobs() { if (S.tab !== 'jobs') return; const sc = $('#list').scrollTop; $('#list').innerHTML = renderJobs(); applyPageEd('jobs'); $('#list').scrollTop = sc; }
function relSugRow(sg) { const A = D.contacts.find((x) => x.id === sg.a), B = D.contacts.find((x) => x.id === sg.b); if (!A || !B) return '';
  const fa = h(A.first || fullName(A)), fb = h(B.first || fullName(B)); const gA = nameGender(A), gB = nameGender(B);
  const gs = (g) => (g ? [g] : ['m', 'f']); // can't tell from the name → offer both
  const btn = (relB, relA, lbl, green) => `<button class="btn small ${green ? 'greenbtn' : ''}" data-act="rel-sug-set" data-a="${A.id}" data-b="${B.id}" data-relb="${h(relB)}" data-rela="${h(relA)}">${lbl}</button>`;
  const opts = []; const seen = new Set(); const g = sg.guess;
  const add = (relB, relA, lbl, green) => { const k = relB + '|' + relA; if (seen.has(k)) return; seen.add(k); opts.push(btn(relB, relA, lbl, green)); };
  if (g) add(g.relB, g.relA, `✓ ${fb} is ${fa}'s ${h(g.relB.toLowerCase())}`, true);
  const pairsOf = (fn) => gs(gA).flatMap((x) => gs(gB).map((y) => fn(x, y)));
  pairsOf((x, y) => [genderize('Partner', y), genderize('Partner', x)]).filter(([rb, ra]) => rb !== ra).forEach(([rb, ra]) => add(rb, ra, `💑 ${fb} is ${fa}'s ${rb.toLowerCase()}`));
  pairsOf((x, y) => [genderize('Sibling', y), genderize('Sibling', x)]).forEach(([rb, ra]) => add(rb, ra, `👫 ${fb} is ${fa}'s ${rb.toLowerCase()}`));
  pairsOf((x, y) => [genderize('Child', y), genderize('Parent', x)]).forEach(([rb, ra]) => add(rb, ra, `${fa} is ${fb}'s ${ra.toLowerCase()}`));
  pairsOf((x, y) => [genderize('Parent', y), genderize('Child', x)]).forEach(([rb, ra]) => add(rb, ra, `${fb} is ${fa}'s ${rb.toLowerCase()}`));
  add('Other family', 'Other family', 'Other family');
  return `<div class="relsug"><div><b class="lnk" data-act="open" data-kind="contact" data-id="${A.id}">${h(fullName(A))}</b> ↔ <b class="lnk" data-act="open" data-kind="contact" data-id="${B.id}">${h(fullName(B))}</b> <span class="hint">— ${h(sg.why)}${g ? ` · general info of ${h(g.src.first || fullName(g.src))} mentions it` : ''}${!gA || !gB ? ` · can't tell ${!gA && !gB ? 'either name' : 'if ' + (!gA ? fa : fb) + ' is male or female'} — both options shown` : ''}</span></div>
    <div class="acts">${opts.join('')}<button class="btn small" data-act="rel-sug" data-a="${A.id}" data-b="${B.id}">Choose…</button><button class="btn small" data-act="rel-sug-nm" data-a="${A.id}" data-b="${B.id}">🤫 Don't mention…</button><button class="btn small" data-act="dupe-not" data-key="${h(sg.k)}">✕ Not related</button></div></div>`; }
function jobAddr(j) { /* which farm a job means: its physical address (not repeated if the note already says it) */ const ids = [j.fid, j.pair && j.pair.a, j.pair && j.pair.b, j.dupfarm && j.dupfarm.a, j.dupfarm && j.dupfarm.b].filter(Boolean); const seen = new Set();
  const lines = ids.map((id) => IDX.farms.get(id)).filter((f) => f && f.address && !seen.has(f.address) && seen.add(f.address) && !(j.note || '').includes(f.address)).map((f) => `📍 ${h(f.address)}`); return lines.length ? `<div class="note jobaddr">${lines.join('<br>')}</div>` : ''; }
function jobItemHtml(j, inline) { // one job with all its buttons — used on the Jobs list and on the contact / business itself
  const t = j.type;
  return `<div class="job ${S.jobSel.has(j.key) ? 'jobsel' : ''}">${inline ? '' : `<input type="checkbox" class="jobcheck" data-act="job-sel" data-key="${h(j.key)}" ${S.jobSel.has(j.key) ? 'checked' : ''} aria-label="Select this job">`}<div class="t">${inline ? '' : `<div class="who"><span class="wholink" data-act="open" data-kind="${j.kind === 'business' ? 'business' : 'contact'}" data-id="${j.id}" title="Open ${j.kind === 'business' ? 'business' : 'contact'}">${h(j.who)}</span></div><div class="note">${h(j.note)}</div>${jobAddr(j)}`}${j.suggest ? `<div class="note" style="color:#0d5c20;font-weight:600">Suggested: ${j.suggest.km} km return (${h(j.suggest.why)})</div>` : ''}${j.photoSuggest ? `<div class="note" style="color:#0d5c20;font-weight:600">Suggested: ${h(tagName(j.photoSuggest))} photo</div>` : ''}${j.warnTxt ? `<div class="body" style="background:#fff5f5;border:1px solid #f3c2c2;border-radius:8px;padding:6px 8px;margin:4px 0;font-size:14.5px;white-space:pre-wrap">${h(j.warnTxt)}</div>` : ''}<div class="acts">
      ${['conflict', 'bizonly', 'biznodetails', 'linksuggest', 'oddbiz', 'primnolink', 'linkreview', 'orphanfarm'].includes(t) ? '' : `<button class="btn small" data-act="job-open" data-kind="${j.kind}" data-id="${j.id}" ${j.fid ? `data-fid="${j.fid}"` : ''}>Make a change</button>`}
      ${t === 'conflict' ? `</div><div style="width:100%">${conflictDiff(j.data)}` : ''}
      ${j.suggest ? `<button class="btn small" style="background:var(--green-bg);border-color:var(--green)" data-act="use-km" data-km="${j.suggest.km}" data-fids="${j.suggest.fids.join(',')}">✓ Use suggested: ${j.suggest.km} km</button>` : ''}
      ${j.suggest && IDX.farms.get(j.suggest.fids[0])?.lat != null ? `<a class="btn small" href="${gmapsRoute(IDX.farms.get(j.suggest.fids[0]))}" target="_blank" rel="noopener">🗺 View suggested route</a>` : ''}
      ${!j.suggest && j.needsLookup && D.settings.mapsKey ? `<button class="btn small" data-act="lookup-km" data-fids="${j.needsLookup.join(',')}">Get Google Maps suggestion</button>` : ''}
      ${j.pair ? (() => { const fa = IDX.farms.get(j.pair.a), fb = IDX.farms.get(j.pair.b); const pa = farmRoutePt(fa), pb = farmRoutePt(fb); const same = hav(pa, pb) < 0.005; return `<a class="btn small greenbtn" href="${same ? `https://www.google.com/maps/search/?api=1&query=${pa.lat},${pa.lng}` : `https://www.google.com/maps/dir/?api=1&origin=${pa.lat},${pa.lng}&destination=${pb.lat},${pb.lng}&travelmode=walking`}" target="_blank" rel="noopener">🗺 View both pins on Google Maps</a><a class="btn small" href="${gmapsPin(fa)}" target="_blank" rel="noopener">View pin 1</a><a class="btn small" href="${gmapsPin(fb)}" target="_blank" rel="noopener">View pin 2</a>
        <button class="btn small" data-act="pin-diff" data-key="${h(j.key)}">Different farms</button>
        <button class="btn small" data-act="pin-same" data-key="${h(j.key)}" data-keep="${fa.id}" data-other="${fb.id}">Same yards — compare and merge…</button>`; })() : ''}
      ${j.dupe ? (() => { const x = j.dupe, isC = x.kind === 'contact'; const A = isC ? D.contacts.find((c) => c.id === x.a) : IDX.biz.get(x.a), B = isC ? D.contacts.find((c) => c.id === x.b) : IDX.biz.get(x.b); const nm = (r) => h(isC ? fullName(r) : r.name);
        return `<button class="btn small" data-act="open" data-kind="${x.kind}" data-id="${x.a}">Open 1</button><button class="btn small" data-act="open" data-kind="${x.kind}" data-id="${x.b}">Open 2</button><button class="btn small" data-act="dupe-not" data-key="${h(j.key)}">Not duplicates</button><button class="btn small greenbtn" data-act="dupe-merge" data-kind="${x.kind}" data-keep="${x.a}" data-other="${x.b}">⇄ Merge into 1 (${nm(A)})…</button><button class="btn small greenbtn" data-act="dupe-merge" data-kind="${x.kind}" data-keep="${x.b}" data-other="${x.a}">⇄ Merge into 2 (${nm(B)})…</button>`; })() : ''}
      ${j.bizonly ? `<button class="btn small greenbtn" data-act="bizonly-convert" data-cid="${j.bizonly.cid}" data-bid="${j.bizonly.bid}">✓ Yes — it's just the business (move details onto it)</button><button class="btn small" data-act="edit-contact" data-id="${j.bizonly.cid}">Edit contact</button><button class="btn small" data-act="edit-biz" data-id="${j.bizonly.bid}">Edit business</button>` : ''}
      ${j.type === 'biznodetails' ? `<button class="btn small primary" data-act="edit-biz" data-id="${j.id}">Add phone / email</button>` : ''}
      ${j.warnTxt ? (() => { const w = j.warnSrc; const farms = w.fid ? [IDX.farms.get(w.fid)].filter(Boolean) : (w.kind === 'contact' ? bizOf(D.contacts.find((x) => x.id === w.id) || { links: [] }) : [IDX.biz.get(w.bid)].filter(Boolean)).flatMap((b) => b.farms); const A = (to, extra, lbl) => `<button class="btn small" data-act="warn-apply" data-to="${to}" data-k="${h(j.key)}" ${extra}>${lbl}</button>`;
        return `${A('general', '', w.kind === 'contact' ? '⚠ Apply as major warning' : '⚠ Apply as major business warning')}${A('minorw', '', '⚠️ Apply as minor warning')}${farms.slice(0, 5).map((f) => A('farm', `data-fid="${f.id}"`, `🐄 Apply to yards: ${h(f.name || 'farm')} — warning, caution or repair…`) + A('farm', `data-fid="${f.id}" data-assess="1"`, `🆕🔍 New — need to assess: ${h(f.name || 'farm')}…`)).join('')}${A('side', '', '📝 Apply as side note')}<button class="btn small greenbtn" data-act="warn-split" data-k="${h(j.key)}">✂️ Split it up — different parts to different farms…</button>${w.sec ? `<button class="btn small" data-act="warn-remove" data-k="${h(j.key)}" style="color:var(--red)">Remove *WARNING* section from general info</button>` : ''}`; })() : ''}
      ${j.orphan ? `${j.orphan.bid ? `<button class="btn small greenbtn" data-act="orphan-link" data-fid="${j.orphan.fid}" data-bid="${j.orphan.bid}">✓ Link to ${h((IDX.biz.get(j.orphan.bid) || {}).name || '')}</button>` : ''}<button class="btn small" data-act="orphan-pick" data-fid="${j.orphan.fid}">🔗 Link to a business…</button>` : ''}
      ${j.dupfarm ? (() => { const fa = IDX.farms.get(j.dupfarm.a), fb = IDX.farms.get(j.dupfarm.b); if (!fa || !fb) return ''; const pa = farmRoutePt(fa), pb = farmRoutePt(fb); const line = (f, n) => `<div class="hint" style="width:100%"><b>${n}.</b> ${h(f.name || 'Farm')} — ${usersLnk(farmUsersOf(f.id))}${f.address ? ' · ' + h(f.address) : ''}${f.kmReturn != null ? ' · ' + f.kmReturn + ' km' : ''}</div>`;
        return `${line(fa, 1)}${line(fb, 2)}${pa.lat != null && pb.lat != null ? `<a class="btn small" href="https://www.google.com/maps/dir/?api=1&origin=${pa.lat},${pa.lng}&destination=${pb.lat},${pb.lng}&travelmode=walking" target="_blank" rel="noopener">🗺 View both on Google Maps</a>` : ''}<button class="btn small greenbtn" data-act="pin-same" data-key="${h(j.key)}" data-keep="${fa.id}" data-other="${fb.id}">⇄ Compare and merge…</button>`; })() : ''}
      ${j.lost ? `${j.lost.bid ? `<button class="btn small greenbtn" data-act="lost-restore" data-id="${j.lost.id}">↩ Restore it to ${h(j.lost.bname)}</button>` : ''}<button class="btn small" data-act="lost-restore" data-id="${j.lost.id}" data-pick="1">↩ Restore it to a business…</button>` : ''}
      ${j.svc ? `</div><div style="width:100%;margin:4px 0"><div class="svcwrap" id="svc-${j.svc}"><div class="hint">Opening Street View…</div></div></div><div class="acts"><button class="btn small greenbtn" data-act="svc-start" data-fid="${j.svc}">📷 Open Street View and map</button>` : ''}
      ${j.oldinfo ? `<button class="btn small greenbtn" data-act="oldinfo" data-fid="${j.oldinfo}" data-v="move">→ Move into General farm info</button><button class="btn small" data-act="oldinfo" data-fid="${j.oldinfo}" data-v="keep">Keep as it is</button><button class="btn small" data-act="oldinfo" data-fid="${j.oldinfo}" data-v="del" style="color:var(--red)">🗑 Delete it</button>` : ''}
      ${j.primin ? `<button class="btn small greenbtn" data-act="primin-fix" data-cid="${j.primin}">✓ Change to Primary (inactive)</button>` : ''}
      ${j.linkRev ? `<button class="btn small" data-act="link-past" data-cid="${j.linkRev.cid}" data-bid="${j.linkRev.bid}" data-v="1">Past employee</button><button class="btn small" data-act="linkrev-undo" data-cid="${j.linkRev.cid}" data-bid="${j.linkRev.bid}" style="color:var(--red)">Undo — remove the link</button><button class="btn small" data-act="open" data-kind="contact" data-id="${j.linkRev.cid}">View contact</button>` : ''}
      ${j.linkSug ? `<button class="btn small greenbtn" data-act="biz-link-pick" data-cid="${j.linkSug.cid}" data-bid="${j.linkSug.bid}">✓ Link as current employee</button><button class="btn small greenbtn" data-act="link-pick-past" data-cid="${j.linkSug.cid}" data-bid="${j.linkSug.bid}">✓ Link as past employee</button><button class="btn small" data-act="open" data-kind="contact" data-id="${j.linkSug.cid}">View contact</button><button class="btn small" data-act="open" data-kind="business" data-id="${j.linkSug.bid}">View business</button>` : ''}
      ${j.oddbiz ? `<button class="btn small primary" data-act="oddbiz-fix" data-bid="${j.oddbiz}">Sort out this name…</button><button class="btn small" data-act="edit-biz" data-id="${j.oddbiz}">Rename by hand</button>` : ''}
      ${j.primSuggest ? `<button class="btn small greenbtn" data-act="prim-set" data-bid="${j.id}" data-cid="${j.primSuggest}">✓ Make ${h(fullName(D.contacts.find((x) => x.id === j.primSuggest) || { first: '' }))} the primary contact</button>` : ''}${t === 'infomove' ? (() => { const c = D.contacts.find((x) => x.id === j.id); const im = j.infoMove; const bs = c ? bizOf(c) : []; return `</div><div class="body" style="background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 8px;margin:4px 0;font-size:14px;max-height:160px;overflow:auto;white-space:pre-wrap;width:100%">${h(im.pending ? im.text : im.block)}</div><div class="acts">${im.pending ? bs.map((b) => `<button class="btn small greenbtn" data-act="im-to" data-cid="${j.id}" data-bid="${b.id}">Put on ${h(b.name)}</button>`).join('') + `<button class="btn small" data-act="im-keep" data-cid="${j.id}">Keep on ${h(c ? c.first || fullName(c) : 'person')}</button>` : `<button class="btn small greenbtn" data-act="im-ok" data-cid="${j.id}">✓ Correct business</button><button class="btn small greenbtn" data-act="im-okclean" data-cid="${j.id}">✓ Correct — remove the “From ${h(c ? fullName(c) : '')}” line</button>${bs.filter((b) => b.id !== im.bid).map((b) => `<button class="btn small" data-act="im-to" data-cid="${j.id}" data-bid="${b.id}">Move to ${h(b.name)}</button>`).join('')}<button class="btn small" data-act="im-back" data-cid="${j.id}">Put back on ${h(c ? c.first || fullName(c) : 'person')}</button>`}<button class="btn small" data-act="im-role" data-cid="${j.id}">👔 It's ${h(c ? c.first || fullName(c) : 'their')}'s role at the business</button><button class="btn small" data-act="im-del" data-cid="${j.id}" style="color:var(--red)">🗑 Remove this info</button>`; })() : ''}${j.relSugs ? `</div><div style="width:100%;margin:4px 0">${j.relSugs.map(relSugRow).join('')}</div><div class="acts">` : ''}${t === 'relmove' ? `</div><div style="width:100%;margin:4px 0">${j.relProps.map((p) => `<div class="hint" style="margin:2px 0"><button class="btn small" data-act="relsug-edit" data-cid="${j.id}" data-line="${h(p.line)}" title="Edit this suggestion" style="padding:1px 7px;margin-right:4px">✏️ Edit</button><button class="btn small" data-act="rel-rmline" data-cid="${j.id}" data-line="${h(p.line)}" title="Remove this line from general info" style="padding:1px 7px;margin-right:4px">🗑</button>${(p.names || []).length && bizOf(D.contacts.find((x) => x.id === j.id) || { links: [] }).length ? `<button class="btn small" data-act="rel-tobiz" data-cid="${j.id}" data-line="${h(p.line)}" title="Add to the business as a contact / employee instead" style="padding:1px 7px;margin-right:4px">🏢 Add to business</button>` : ''}${h(p.line)}${p.names && p.names.length ? ' → ' + p.names.map((nm) => nm.o ? `<b style="color:var(--green)">✓ ${h(fullName(nm.o))} (${h(genderize(p.rel, nameGender(nm.o)))})</b>` : `<b>${h(nm.text)} (${h(genderize(p.rel, nameGender({ first: nm.text })))})</b> ${NODET}`).join(', ') + (p.note ? ` <span style="color:var(--yellow-ink)">· note “${h(p.note)}” stays in general info${/not talk|don.?t (talk|mention)|estranged|divorc|separat|falling out|feud/i.test(p.note) ? ' — maybe 🤫 Don\'t mention instead?' : ''}</span>` : '') : ''}</div>`).join('')}</div><div class="acts">${j.relProps.some((p) => (p.names || []).length) ? `<button class="btn small greenbtn" data-act="rel-apply" data-cid="${j.id}">✓ Move to Related people</button>` : ''}<button class="btn small" data-act="rel-add" data-id="${j.id}">➕ Add related person…</button><button class="btn small" data-act="nm-add" data-id="${j.id}">🤫 Don't mention…</button><button class="btn small" data-act="rel-rmall" data-cid="${j.id}" style="color:var(--red)">🗑 Remove from general info</button>` : ''}${PCQ_JOBS.includes(t) ? (() => { const f = IDX.farms.get(j.fid); if (!f) return ''; const p0 = (f.turn && f.turn.lat != null) ? f.turn : f.lat != null ? f : null; return `</div><div style="width:100%;margin:4px 0"><div id="pm-${f.id}">${p0 ? pinEmbed(p0) : '<div class="hint">No pins yet — open the map to add them.</div>'}</div><div class="hint" id="pmh-${f.id}"></div></div><div class="acts"><button class="btn small greenbtn" data-act="pcq-start" data-fid="${f.id}">🗺 Open the map${t === 'homename' ? ' and rename' : ''}</button>${f.turn ? `<button class="btn small" data-act="pc-isyards" data-fid="${f.id}">It's the yards, not a turn-off…</button>` : ''}`; })() : ''}${j.prefFix ? (() => { const p = j.prefFix; const c0 = D.contacts.find((x) => x.id === j.id) || {}; return p.field === 'middle' ? `<button class="btn small greenbtn" data-act="pref-fix" data-cid="${j.id}" data-pref="${h(p.inner)}" data-rest="${h(p.rest)}" data-field="middle">✓ ${h(c0.first || '')} goes by “${h(p.inner)}”</button><button class="btn small greenbtn" data-act="pref-fix" data-cid="${j.id}" data-pref="${h(c0.first || '')}" data-rest="${h(p.rest)}" data-field="middle" data-first="${h(p.inner)}">✓ First name ${h(p.inner)}, goes by “${h(c0.first || '')}”</button>` : `<button class="btn small greenbtn" data-act="pref-fix" data-cid="${j.id}" data-pref="${h(p.outer)}" data-rest="${h(p.inner)}" data-field="first">✓ First name ${h(p.inner)}, goes by “${h(p.outer)}”</button><button class="btn small greenbtn" data-act="pref-fix" data-cid="${j.id}" data-pref="${h(p.inner)}" data-rest="${h(p.outer)}" data-field="first">✓ First name ${h(p.outer)}, goes by “${h(p.inner)}”</button>`; })() : ''}${j.abbr ? `<button class="btn small greenbtn" data-act="abbr-fix" data-bid="${j.id}" data-abbr="${h(j.abbr.abbr)}" data-name="${h(j.abbr.name)}" data-full="${j.abbr.full ? 1 : ''}">${j.abbr.full ? `✓ Add the full name for ${h(j.abbr.abbr)}…` : `✓ Use “${h(j.abbr.abbr)}”${j.abbr.name !== j.who ? ' (name becomes ' + h(j.abbr.name) + ')' : ''}`}</button>${j.abbr.full ? '' : `<button class="btn small" data-act="abbr-fix" data-bid="${j.id}" data-abbr="" data-name="${h(j.abbr.name)}">Different abbreviation…</button>`}` : ''}${j.maidenFix ? `<button class="btn small greenbtn" data-act="maiden-fix" data-cid="${j.id}">✓ Move “${h(j.maidenFix.maiden)}” to Maiden name</button>` : ''}${t === 'turnadd' ? `<button class="btn small greenbtn" data-act="pc-turnadd" data-fid="${j.fid}">${turnPin().emoji} Add the ${h(turnName().toLowerCase())} pin…</button>` : ''}${t === 'nogps' ? `<button class="btn small greenbtn" data-act="pin-find" data-fid="${j.fid}">🔍 Find the address on the map</button>` : ''}${t === 'noprimary' ? `<button class="btn small" data-act="prim-find" data-bid="${j.id}">🔍 Find a contact…</button><button class="btn small" data-act="np-industry" data-bid="${j.id}">Not a client — industry business</button><button class="btn small" data-act="np-role" data-bid="${j.id}">Not a business — it's a role</button><button class="btn small" data-act="np-multi" data-bid="${j.id}">It's several businesses</button>` : ''}
      ${j.type === 'primnolink' ? `<button class="btn small primary" data-act="edit-contact" data-id="${j.id}">Edit contact</button>` : ''}
      ${j.nocat ? `<button class="btn small primary" data-act="cat-edit" data-bid="${j.nocat}">Choose categories for the business…</button>` : ''}
      ${t === 'farmname' ? (() => { const f = IDX.farms.get(j.fid); if (!f) return ''; const p = f.turn && f.turn.lat != null ? f.turn : f.lat != null ? f : null; return `${j.nameSug ? `<button class="btn small greenbtn" data-act="fname-set" data-fid="${f.id}" data-v="${h(j.nameSug)}">✓ Rename to: ${h(j.nameSug)}</button>` : ''}${!j.nameSug && p && Maps.key() ? `<button class="btn small" data-act="fname-road" data-fid="${f.id}">📍 Find the road from the pin</button>` : ''}<button class="btn small" data-act="fname-other" data-fid="${f.id}" data-v="${h(j.nameSug || '')}">✏️ Another name…</button>${p ? `<a class="btn small" href="${gmapsPin(p)}" target="_blank" rel="noopener">🗺 See the pin</a>` : ''}`; })() : ''}
      ${t === 'relmove' && (j.hhProps || []).length ? `</div><div style="width:100%"><div class="lbl" style="margin:6px 0 2px">🙂 Happy helpers</div>${j.hhProps.map((p) => `<div class="hint" style="margin:2px 0"><button class="btn small" data-act="hhjob-edit" data-cid="${j.id}" data-line="${h(p.line)}" style="padding:1px 7px;margin-right:4px">✏️ Edit</button>${h(p.line.trim())}${p.names.length ? ' → ' + p.names.map((nm) => nm.o ? `<b style="color:var(--green)">✓ ${h(fullName(nm.o))}</b>` : `<b>${h(nm.text)}</b> ${NODET}`).join(', ') : ''}</div>`).join('')}</div><div class="acts"><button class="btn small greenbtn" data-act="hhjob-apply" data-cid="${j.id}">🙂 Add them as happy helpers</button></div><div class="acts">` : ''}
      ${j.nm ? j.nm.cands.map((id) => D.contacts.find((x) => x.id === id)).filter(Boolean).map((o) => `<div style="width:100%;margin:3px 0"><span class="lnk" data-act="open" data-kind="contact" data-id="${o.id}">${h(fullName(o))}</span> <span class="hint">${h([bizOf(o).map((b) => b.name).join(', '), (o.mobiles[0] || o.landlines[0] || {}).value].filter(Boolean).join(' · '))}</span> <button class="btn small greenbtn" data-act="nm-link" data-key="${h(j.key)}" data-cid="${o.id}">✓ Same person — link</button></div>`).join('') : ''}
      ${j.photocheck ? (() => { const P = j.photocheck; const x = P.kind === 'contact' ? D.contacts.find((y) => y.id === P.id) : IDX.biz.get(P.id); if (!x) return ''; const cats = P.kind === 'contact' ? catSig(x).split(',').filter(Boolean) : bizSplitCats(x); return photoOpts(cats).filter(([v]) => v !== 'leave').map(([v, l]) => `<button class="btn small ${v.startsWith('split:') ? 'greenbtn' : ''}" data-act="photo-fix" data-k="${P.kind}" data-id="${P.id}" data-v="${v}">${v === 'auto' ? '↺ ' : '🖼 '}${h(l)}</button>`).join('') + `<button class="btn small" data-act="photo-fix" data-k="${P.kind}" data-id="${P.id}" data-v="leave">Leave as it is</button>`; })() : ''}
      ${j.catdiff ? `<button class="btn small primary" data-act="cat-edit" data-bid="${j.catdiff.bid}">Choose categories…</button>` : ''}
      ${j.catdiff && IDX.biz.get(j.catdiff.bid) ? (() => { const b = IDX.biz.get(j.catdiff.bid); const ppl = (IDX.bizContacts.get(b.id) || []); return `<div style="width:100%;margin:6px 0"><div class="lbl" style="margin-bottom:4px">Each person's photo</div>${ppl.map((c) => { const pr = personSplitPairs(c); const sp = photoSpec(c); const now = (sp.parts || []).map((x) => tagName(x.tag)).join(' + ') || (sp.custom ? 'own photo' : 'none');
        return `<div class="kv" style="align-items:center;flex-wrap:wrap;gap:6px"><div class="v" style="flex:1 1 160px"><span class="lnk" data-act="open" data-kind="contact" data-id="${c.id}">${h(fullName(c))}</span> <span class="hint">${h(tagName(catOf(c)) || 'no category')}${bizOf(c).length > 1 ? ' · ' + h(bizOf(c).map((x) => x.name + ': ' + (tagName(bizCat(x)) || '—')).join(', ')) : ''} · photo: ${h(now)}</span></div>${pr.map(([x, y]) => { const v = 'split:' + x + ',' + y, on = effChoice(c) === v || effChoice(c) === 'split:' + y + ',' + x; return on ? `<span class="pill" style="background:var(--green-bg);color:#0d5c20">✓ Split ${h(tagName(x))} + ${h(tagName(y))}</span>` : `<button class="btn small" data-act="person-split" data-cid="${c.id}" data-v="${v}">🖼 Split: ${h(tagName(x))} + ${h(tagName(y))}</button>`; }).join('')}${(c.photoChoice || 'auto') !== 'auto' && (c.photoChoice || '') !== 'custom' ? `<button class="btn small" data-act="person-split" data-cid="${c.id}" data-v="auto">↺ Automatic</button>` : ''}</div>`; }).join('')}</div>`; })() : ''}
      ${j.catdiff && IDX.biz.get(j.catdiff.bid) ? bizSplitPairs(IDX.biz.get(j.catdiff.bid)).map(([x, y]) => `<button class="btn small greenbtn" data-act="biz-split" data-bid="${j.catdiff.bid}" data-v="split:${x},${y}" data-key="${h(j.key)}">🖼 Split the business photo: ${h(tagName(x))} + ${h(tagName(y))}</button>`).join('') : ''}
      ${j.catdiff ? [...new Set((IDX.bizContacts.get(j.catdiff.bid) || []).map(catOf))].filter(Boolean).map((v) => `<button class="btn small" data-act="cat-all" data-bid="${j.catdiff.bid}" data-tag="${v}" data-on="1">Everyone: ${h(v ? tagName(v) : 'no category')}</button>`).join('') : ''}
      ${j.pick ? j.pick.alts.map((v) => `<button class="btn small" data-act="catpick-use" data-kind="${j.pick.kind}" data-id="${j.pick.id}" data-tag="${v}">↩ Keep previous category: ${h(tagName(v))}</button>`).join('') : ''}
      ${j.cat ? `<button class="btn small greenbtn" data-act="cat-apply" data-cid="${j.cat.cid}" data-at="${j.cat.at}">✓ Yes — change them too</button>` : ''}
      ${j.block ? `<button class="btn small greenbtn" data-act="block-yes" data-cid="${j.block}">✓ Yes — number blocked</button>${(D.contacts.find((x) => x.id === j.block) || { tags: [] }).tags.includes('blockedn') ? '' : `<button class="btn small" data-act="block-no" data-cid="${j.block}">Not yet</button>`}` : ''}
      ${j.photoSuggest ? `<button class="btn small" style="background:var(--green-bg);border-color:var(--green)" data-act="use-photo" data-id="${j.id}" data-tag="${j.photoSuggest}">✓ Use suggested: ${h(tagName(j.photoSuggest))}</button>` : ''}${t === 'photo' ? `<button class="btn small" data-act="keep-photo" data-id="${j.id}" title="Keep the photo it shows now">Leave as is</button>` : ''}${j.photoCands && j.photoCands.length > 1 ? `</div><div class="acts" style="margin-top:4px">${j.photoCands.filter((t2) => t2 !== j.photoSuggest).map((t2) => `<button class="btn small photopick" data-act="use-photo" data-id="${j.id}" data-tag="${t2}"><img src="${tagPhotoSrc(t2)}" alt="">Use ${h(tagName(t2))}</button>`).join('')}${j.photoCands.flatMap((a, i) => j.photoCands.slice(i + 1).map((b) => [a, b])).slice(0, 3).map(([a, b]) => `<button class="btn small photopick" data-act="use-photo" data-id="${j.id}" data-tag="split:${a},${b}"><span class="splitpv"><img src="${tagPhotoSrc(a)}" alt=""><img src="${tagPhotoSrc(b)}" alt=""></span>Split: ${h(tagName(a))} + ${h(tagName(b))}</button>`).join('')}` : ''}
      <button class="btn small" data-act="job-ai" data-key="${h(j.key)}" title="Ask Claude how to sort this out">🤖 Ask Claude</button>${JOB_TYPES[t].manual ? `<button class="btn small" data-act="job-dismiss" data-key="${h(j.key)}">${j.okLabel ? '✓ ' + h(j.okLabel) : JOB_TYPES[t].btn || 'Mark resolved - changes not required'}</button>` : ''}</div></div></div>`;
}
function renderJobs() {
  cjSyncTypes(); const all = jobs(); const nIn = all.filter(jobInactive).length; const pqj = parseQuery(S.jobQ || ''); const qOn = !!(pqj.inc.length || pqj.exc.length);
  const js = jobsShown().filter((j) => !qOn || matchQ([j.who, j.note, (JOB_TYPES[j.type] || {}).t, j.data && j.data.who].filter(Boolean).join(' ').toLowerCase(), pqj)); const groups = {}; const ja = S.jobAct || 'active';
  js.forEach((j) => (groups[j.type] = groups[j.type] || []).push(j));
  let html = `<div class="d-wrap"><h2 class="sec-h" style="font-size:26px">${h(lab('jobs'))} — things to check</h2>
  <div class="hint" style="margin-bottom:10px">Items clear automatically once fixed. Flags also show on the contact or business itself.</div>
  <div class="actions"><button class="btn primary" data-act="jobs-refresh">⟳ Refresh jobs</button><button class="btn" data-act="check-dist">Check all distances against Google Maps</button><button class="btn greenbtn" data-act="cj-new">➕ New job list</button></div><div id="check-msg" class="hint"></div>
  <div class="chips" style="margin:10px 0">${[['active', 'Active clients', '🟢', all.length - nIn], ['inactive', 'Inactive / do not answer', '⚫', nIn], ['all', 'All', '📋', all.length]].map(([v, l, ic, n]) => `<button class="chip ${ja === v ? 'on' : ''}" data-act="jobact" data-v="${v}"><span class="ci">${ic}</span>${l}<span class="cn">${n}</span></button>`).join('')}</div>`;
  html += `<div class="search" style="margin:0 0 10px"><input id="job-q" value="${h(S.jobQ || '')}" placeholder="🔍 Search jobs — a name, business, farm or kind of job" autocomplete="off" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:9px;font-size:16px">${qOn ? `<button class="btn small" data-act="job-q-clear">✕</button>` : ''}</div>${qOn ? `<div class="hint" style="margin:-4px 0 8px">${js.length} job${js.length === 1 ? '' : 's'} match — every matching list is opened.</div>` : ''}`;
  if (!js.length) html += `<div class="empty">${qOn ? 'No jobs match that search.' : all.length ? 'Nothing in this list. 🎉' : 'Nothing needs attention. 🎉'}</div>`;
  Object.keys(JOB_TYPES).forEach((t) => {
    const g = groups[t]; if (!g) return;
    const isOpen = qOn || !!S.jobOpen[t]; // folded unless you open it (or you're searching)
    const nSel = g.filter((j) => S.jobSel.has(j.key)).length; const ops = bulkOps(t, g.filter((j) => S.jobSel.has(j.key)));
    html += `<details class="jobgroup" data-type="${t}" ${isOpen ? 'open' : ''}><summary><input type="checkbox" class="jobcheck" data-act="job-selall" data-type="${t}" title="Select all" ${nSel && nSel === g.length ? 'checked' : ''}><span style="color:var(--red)">${ICONS.flag}</span><span style="flex:1">${h(jobTitle(t, g.length))}</span><span class="count">${/^(pincheck|svcheck)/.test(t) && PC_LEFT[t] != null ? PC_LEFT[t] : g.length}</span>${S.admin ? `${JOB_TYPES[t].custom ? `<button type="button" class="btn small nofold" data-act="cj-edit" data-type="${t}" title="Edit this job list">✏️</button>` : ''}<button type="button" class="btn small nofold" data-act="joblist-del" data-type="${t}" title="Delete this whole job list">🗑</button>` : ''}</summary>${JOB_TYPES[t].custom ? `<div class="hint" style="margin:4px 0 6px">Rule: ${h(cjRuleText(cjList().find((x) => 'cj_' + x.id === t) || {}))}</div>` : ''}`;
    if (nSel) html += `<div class="bulkbar"><b>${nSel} selected</b>${t === 'nocat' ? `<select id="jb-cat" style="padding:6px;border:1px solid var(--line);border-radius:8px">${[...RATINGS, ...D.tags.filter((x) => x.group === 'client').map((x) => x.id)].map((v) => `<option value="${v}">${h(tagName(v))}</option>`).join('')}</select>` : ''}${ops.map((o) => `<button class="btn small ${o.green ? 'greenbtn' : ''}" data-act="job-bulk" data-type="${t}" data-op="${o.op}">${h(o.label)}</button>`).join('') || '<span class="hint">Nothing can be done to all of these at once — use each job\'s own buttons.</span>'}<button class="btn small" data-act="job-selnone" data-type="${t}">Clear selection</button></div>`;
    g.forEach((j) => { html += jobItemHtml(j); });
    html += '</details>';
  });
  const gone = [...jobsGone()].filter((t) => JOB_TYPES[t]);
  html += `<div class="card" style="margin-top:16px"><h3><span class="sp">Your own job lists</span><button class="btn small" data-act="cj-new">➕ New</button></h3>${cjList().length ? cjList().map((cj) => { const n = jobs().filter((j) => j.type === 'cj_' + cj.id).length; return `<div class="kv" style="align-items:center"><div class="v" style="flex:1"><b>${h((cj.emoji ? cj.emoji + ' ' : '') + cj.name)}</b> <span class="hint">(${n} now · ${h(CJ_KINDS[cj.kind])}${cj.by ? ' · added by ' + h(cj.by) : ''})</span><div class="hint">${h(cjRuleText(cj))}</div></div>${S.admin ? `<button class="btn small" data-act="cj-edit" data-type="cj_${cj.id}" title="Edit">✏️</button><button class="btn small" data-act="joblist-del" data-type="cj_${cj.id}" title="Delete">🗑</button>` : ''}</div>`; }).join('') : '<div class="hint">None yet — tap ➕ New to make a list from a rule (Claude can set it up for you).</div>'}
    ${gone.length ? `<div class="lbl" style="margin-top:10px">Deleted built-in job lists</div>${gone.map((t) => `<div class="kv" style="align-items:center"><div class="v" style="flex:1">${h(JOB_TYPES[t].t)}</div>${S.admin ? `<button class="btn small" data-act="joblist-restore" data-type="${t}">↩ Restore</button>` : ''}</div>`).join('')}` : ''}
    ${S.admin ? '' : '<div class="hint" style="margin-top:6px">🔒 Only the admin can edit or delete job lists.</div>'}</div>`;
  return html + '</div>';
}
async function checkAllDistances() {
  const msg = $('#check-msg');
  const farms = D.farms.filter((f) => f.lat != null && farmUsersOf(f.id).some((u) => !u.past));
  msg.textContent = `Checking ${farms.length} farms…`;
  try {
    const res = await Maps.distances(farms.map(farmRoutePt));
    let n = 0;
    farms.forEach((f, i) => {
      const r = res[i]; if (!r) return;
      const exact = r.km * 2, g = Math.ceil(exact - 1e-9); f.gKm = g; f.gMin = Math.round(r.min); f.gAt = Date.now();
      f.driveMin = f.driveMin ?? Math.round(r.min);
      f.flags = (f.flags || []).filter((x) => x.type !== 'kmcheck'); touch(f);
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
  const cOut = (c) => ({ id: c.id, name: fullName(c), first: c.first, middle: c.middle, last: c.last, role: c.role, category: catOf(c) || null, categorySetOnContact: !followsBiz(c), tags: c.tags.filter((t) => !isCatTag(t) && !RATING_SET.has(t)), businesses: curLinks(c).map((l) => l.bid), pastBusinesses: c.links.filter((l) => l.past).map((l) => l.bid), mobiles: c.mobiles, landlines: c.landlines, emails: c.emails, postal: c.postal, info: c.info, warnings: c.warnings, sideNotes: c.sideNotes, ...(c.ice ? { ice: c.ice } : {}), ...(() => { const { dr, ptags } = photoCandidates(c); const opts = [...new Set([...dr, ...ptags])]; if (opts.length < 2) return {}; const pc = effChoice(c); return { photo: pc === 'auto' || pc === 'custom' ? pc : pc.startsWith('split:') ? pc.slice(6).split(',') : [pc], photoOptions: opts, ...(needsPhotoChoice(c) ? { photoNeedsChoosing: true } : {}) }; })() });
  const bOut = (b) => ({ id: b.id, name: b.name, type: isClientBiz(b) ? 'client' : 'nonclient', category: bizCat(b) || null, primaryContact: b.primaryContact || null, contacts: (IDX.bizContacts.get(b.id) || []).map((c) => c.id), pastContacts: (IDX.bizPast.get(b.id) || []).map((c) => c.id), phones: b.phones || [], emails: b.emails || [], pics: b.pics, patientIds: b.patientIds, farms: b.farms.map((f) => ({ id: f.id, name: f.name, pinType: pinT(f.pinType).name, address: f.address, kmReturn: f.kmReturn, warning: f.warning || '', ...(f.safety && f.safety.status ? { safety: f.safety } : {}), ...(f.access ? { access: f.access } : {}), ...(f.reception ? { reception: f.reception.status } : {}), ...(f.biosec ? { biosecurity: f.biosec } : {}), ...(farmUsersOf(f.id).length > 1 ? { alsoUsedBy: farmUsersOf(f.id).filter((u) => u.b !== b).map((u) => u.b.name) } : {}) })), notCurrentFarms: b.pastFarms.map((f) => f.name || f.address), biosecurity: b.biosec || '', info: b.info, warnings: b.warnings, sideNotes: b.sideNotes });
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
- Photos: a contact with "photoOptions" can show one of those photos, or two side by side (a split photo). Use set_photo with ONE id from their photoOptions for a single photo, TWO ids for a split photo, or ["auto"] to go back to automatic. Businesses have no photo choice (their photo comes from their category).
- Farms are listed under each business (farms: id, name…). To rename one use rename_farm with the farm's id. Don't create doubled words (e.g. "farm farm").
- If something is unclear, ask me instead of guessing.

JSON FORMAT
{"summary":"one line describing the changes","changes":[
 {"op":"update_contact","id":"c…","fields":{"first":"","middle":"","last":"","role":"","info":"","warnings":"","sideNotes":"","mobiles":[],"landlines":[],"emails":[],"postal":[],"inactiveReason":"","dnaReason":""}},
 {"op":"update_business","id":"b…","fields":{"name":"","type":"client","info":"","warnings":"","sideNotes":"","biosec":"","phones":[],"emails":[],"postal":[],"inactiveReason":"","dnaReason":""}},
 {"op":"set_category","kind":"contact","id":"c…","category":"a"},
 {"op":"set_category","kind":"business","id":"b…","category":"industry"},
 {"op":"add_tag","id":"c…","tag":"pa"}, {"op":"remove_tag","id":"c…","tag":"pi"},
 {"op":"link","contact":"c…","business":"b…"}, {"op":"link","contact":"c…","business":"b…","past":true}, {"op":"unlink","contact":"c…","business":"b…"},
 {"op":"set_primary","business":"b…","contact":"c…"},
 {"op":"set_photo","id":"c…","photo":["b"]}, {"op":"set_photo","id":"c…","photo":["b","aplus"]},
 {"op":"new_business","ref":"n1","fields":{"name":"","type":"client"},"category":"c"},
 {"op":"new_contact","ref":"n2","fields":{"first":"","last":"","mobiles":[]},"businesses":["b…"],"category":"same_as_business"},
 {"op":"trash_contact","id":"c…"},
 {"op":"rename_farm","id":"f…","name":"new farm name"}
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
  const BF = ['name', 'info', 'warnings', 'sideNotes', 'biosec', 'phones', 'emails', 'postal', 'inactiveReason', 'dnaReason'];
  for (const ch of js.changes || []) { try {
    const op = ch.op;
    if (op === 'new_business') { const nb = { id: uid('b'), name: String((ch.fields || {}).name || 'New business'), type: (ch.fields || {}).type === 'nonclient' ? 'nonclient' : 'client', farmLinks: [], pics: [], patientIds: [], info: '', warnings: '', flags: [], rating: null, cats: [], createdAt: Date.now() }; BF.forEach((k) => { if (ch.fields && k in ch.fields) nb[k] = clean(k, ch.fields[k]); }); D.businesses.push(nb); reindex(); if (ch.category && okCat(ch.category) && ch.category !== 'same_as_business') setBizCat(nb, ch.category); touch(nb); if (ch.ref) refs[ch.ref] = nb.id; done.push('New business: ' + nb.name); continue; }
    if (op === 'new_contact') { const f = ch.fields || {}; const c = { id: uid('c'), first: '', middle: '', last: '', role: '', links: [], tags: [], emails: [], mobiles: [], landlines: [], postal: [], info: '', warnings: '', starred: false, photoChoice: 'auto', flags: [], createdAt: Date.now() }; CF.forEach((k) => { if (k in f) c[k] = clean(k, f[k]); }); (ch.businesses || []).forEach((bid) => { const b = B(bid); if (b) c.links.push({ bid: b.id }); }); D.contacts.push(c); reindex(); if (ch.category && okCat(ch.category)) { if (ch.category === 'same_as_business') c.ownCats = false; else setOne(c, ch.category); } touch(c); if (ch.ref) refs[ch.ref] = c.id; done.push('New contact: ' + fullName(c)); continue; }
    if (op === 'update_contact') { const c = C(ch.id); if (!c) throw new Error('contact ' + ch.id + ' not found'); Object.entries(ch.fields || {}).forEach(([k, v]) => { if (CF.includes(k)) { c[k] = clean(k, v); if (k === 'info') delete c.infoHtml; } }); touch(c); done.push('Updated ' + fullName(c) + ': ' + Object.keys(ch.fields || {}).join(', ')); continue; }
    if (op === 'update_business') { const b = B(ch.id); if (!b) throw new Error('business ' + ch.id + ' not found'); Object.entries(ch.fields || {}).forEach(([k, v]) => { if (BF.includes(k)) { b[k] = clean(k, v); if (k === 'info') delete b.infoHtml; } if (k === 'type' && (v === 'client' || v === 'nonclient')) setBizType(b, v); }); touch(b); done.push('Updated ' + b.name + ': ' + Object.keys(ch.fields || {}).join(', ')); continue; }
    if (op === 'set_category') { if (!okCat(ch.category)) throw new Error('unknown category ' + ch.category); if (ch.kind === 'business') { const b = B(ch.id); if (!b) throw new Error('business ' + ch.id + ' not found'); setBizCat(b, ch.category); done.push(b.name + ' → ' + tagName(ch.category)); } else { const c = C(ch.id); if (!c) throw new Error('contact ' + ch.id + ' not found'); if (ch.category === 'same_as_business') { c.tags = c.tags.filter((t) => !isCatTag(t) && !RATING_SET.has(t)); c.ownCats = false; touch(c); done.push(fullName(c) + ' → same as business'); } else { setOne(c, ch.category); done.push(fullName(c) + ' → ' + tagName(ch.category)); } } continue; }
    if (op === 'add_tag' || op === 'remove_tag') { const c = C(ch.id); const tg = IDX.tags.get(ch.tag); if (!c) throw new Error('contact ' + ch.id + ' not found'); if (!tg || tg.group !== 'additional') throw new Error('unknown tag ' + ch.tag); if (op === 'add_tag') { if (!c.tags.includes(ch.tag)) c.tags.push(ch.tag); if (ch.tag === 'pa') c.tags = c.tags.filter((t) => t !== 'pi'); if (ch.tag === 'pi') c.tags = c.tags.filter((t) => t !== 'pa'); } else c.tags = c.tags.filter((t) => t !== ch.tag); touch(c); done.push(`${op === 'add_tag' ? 'Added' : 'Removed'} ${tg.name} ${op === 'add_tag' ? 'to' : 'from'} ${fullName(c)}`); continue; }
    if (op === 'link' || op === 'unlink') { const c = C(ch.contact), b = B(ch.business); if (!c || !b) throw new Error('contact or business not found'); if (op === 'link') { const prev = catOf(c); c.links = c.links.filter((l) => l.bid !== b.id); c.links.push(ch.past ? { bid: b.id, past: true } : { bid: b.id }); reindex(); if (prev) setOne(c, prev); } else c.links = c.links.filter((l) => l.bid !== b.id); touch(c); done.push(`${op === 'link' ? 'Linked' : 'Unlinked'} ${fullName(c)} ${op === 'link' ? 'to' : 'from'} ${b.name}`); continue; }
    if (op === 'set_primary') { const c = C(ch.contact), b = B(ch.business); if (!c || !b) throw new Error('contact or business not found'); b.primaryContact = c.id; if (!c.tags.includes('pa') && !c.tags.includes('pi')) { c.tags.push('pa'); touch(c); } touch(b); done.push(fullName(c) + ' made primary for ' + b.name); continue; }
    if (op === 'set_photo') { const c = C(ch.id); if (!c) { if (B(ch.id)) throw new Error(B(ch.id).name + ': businesses have no photo choice — their photo comes from their category'); throw new Error('contact ' + ch.id + ' not found'); }
      let ph = ch.photo; if (typeof ph === 'string') ph = ph.startsWith('split:') ? ph.slice(6).split(',') : [ph]; if (!Array.isArray(ph)) throw new Error('set_photo for ' + fullName(c) + ': "photo" must be a list of ids');
      ph = [...new Set(ph.map((x) => String(x).trim()).filter(Boolean))];
      if (ph.length === 1 && ph[0] === 'auto') { c.photoChoice = 'auto'; touch(c); done.push(fullName(c) + ': photo back to automatic'); continue; }
      if (!ph.length || ph.length > 2) throw new Error('set_photo for ' + fullName(c) + ': give one id (single photo) or two (split photo)');
      const { dr, ptags } = photoCandidates(c); const opts = [...new Set([...dr, ...ptags])]; const bad = ph.filter((x) => !opts.includes(x));
      if (bad.length) throw new Error(`set_photo for ${fullName(c)}: ${bad.map((x) => `"${IDX.tags.get(x) ? tagName(x) : x}"`).join(', ')} is not a category or tag with a photo that this contact has${opts.length ? ' (choose from: ' + opts.map((x) => x + ' = ' + tagName(x)).join(', ') + ')' : ''}`);
      c.photoChoice = ph.length === 1 ? ph[0] : 'split:' + ph.join(','); touch(c); done.push(fullName(c) + ': photo → ' + ph.map(tagName).join(' + ') + (ph.length > 1 ? ' (split)' : '')); continue; }
    if (op === 'rename_farm') { const f = IDX.farms.get(ch.id); if (!f) throw new Error('farm ' + ch.id + ' not found'); const nn = dedupeWords(String(ch.name || '').trim()); if (!nn) throw new Error('rename_farm needs a name'); const old = f.name; f.name = nn; touch(f); done.push(`Farm renamed: ${old || '(no name)'} → ${nn}`); continue; }
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
    const devOnly = /\(this device\)/.test(h3.textContent); const title = (h3.querySelector('.sp') || h3).textContent.trim().replace(/\s*\(this device\)\s*$/, '');
    const lk = setLocked(title, devOnly); const locked = !S.admin && lk;
    const det = document.createElement('details'); det.className = 'card setsec'; det.dataset.sec = title; if (S.setOpen.has(title)) det.open = true;
    const shown = setTitle(title); const inner = h3.innerHTML.replace(/<button[\s\S]*?<\/button>/g, '').replace(/<span class="sp">|<\/span>/g, ''); const sum = document.createElement('summary'); det.dataset.lk = lk ? '1' : '0'; det.dataset.sort = shown.replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase(); sum.innerHTML = `${locked ? '<span title="Admin only">🔒</span>' : ''}<span>${shown !== title ? h(shown) + (devOnly ? ' <span class="hint">(this device)</span>' : '') : inner}</span>${S.admin ? `<button type="button" class="setlock nofold" style="background:var(--card);border-color:var(--line);color:var(--ink2)" data-act="set-title" data-sec="${h(title)}" title="Rename this section">✏️</button>` : ''}`; if (S.admin) sum.insertAdjacentHTML('beforeend', SET_ALWAYS_ADMIN.includes(title) ? '<span class="setlock fixed" title="Always admin only — the controls inside only work for the admin, so it cannot be opened to everyone">🔒 Always admin</span>' : `<button type="button" class="setlock ${lk ? '' : 'open'}" data-act="set-lock" data-sec="${h(title)}" title="Tap to change who can use this section">${lk ? '🔒 Admin only' : '🔓 Everyone'}</button>`); det.appendChild(sum);
    const body = document.createElement('div'); body.className = 'setbody';
    const btns = [...h3.querySelectorAll('button')]; if (btns.length) { const bar = document.createElement('div'); bar.className = 'actions'; btns.forEach((b) => bar.appendChild(b)); body.appendChild(bar); }
    h3.remove(); if (locked) { body.innerHTML = '<div class="hint">🔒 Only the admin (Jess) can change this.</div><div class="actions"><button class="btn small" data-act="admin-unlock">🔓 Unlock with admin PIN</button></div>'; } else while (card.firstChild) body.appendChild(card.firstChild); det.appendChild(body);
    det.addEventListener('toggle', () => { det.open ? S.setOpen.add(title) : S.setOpen.delete(title); });
    card.replaceWith(det);
  });
  const dets = [...document.querySelectorAll('#list .d-wrap > details.setsec')]; if (!dets.length) return;
  const box = document.createElement('div'); dets[0].before(box); /* sorted automatically: open to everyone first, then admin only — each A–Z by the title shown */
  dets.sort((a, b) => a.dataset.lk.localeCompare(b.dataset.lk) || a.dataset.sort.localeCompare(b.dataset.sort)).forEach((x) => box.appendChild(x));
}
const SET_TITLE_DEF = { 'This device': 'User settings' }; const setTitle = (t) => ((D.settings.setTitles || {})[t] || SET_TITLE_DEF[t] || t);
const SET_OPEN_ALL = ['📖 User manual', 'This device', '🤖 Ask Claude', 'App version', 'Sync & Google']; // usable without the admin PIN by default (plus every "(this device)" section)
const SET_ALWAYS_ADMIN = []; /* every section can be set to Admin only or Everyone */ const secOk = (title) => S.admin || !setLocked(title, false); let CLICK_SEC = null;
['click', 'change', 'input', 'pointerdown'].forEach((ev) => document.addEventListener(ev, (e) => { const d = e.target && e.target.closest && e.target.closest('details.setsec'); CLICK_SEC = d ? d.dataset.sec : null; }, true));
function setLocked(title, devOnly) { if (SET_ALWAYS_ADMIN.includes(title)) return true; const v = (D.settings.setLocks || {})[title]; return v != null ? !!v : !(devOnly || SET_OPEN_ALL.includes(title)); }
document.addEventListener('click', (e) => { if (e.target.closest('summary .draghandle, summary .setlock, summary .nofold')) e.preventDefault(); }, true);

const GUIDE_STEPS = [
  ['Find someone', 'Tap <b>${lab("contacts")}</b> and type in the search box — a name, business, phone number or farm. Tick "search in name only" off to search everything (info, notes, addresses). Tap a person to open their page.'],
  ['Read their page before you call or go out', 'Red boxes are <b>major warnings</b> (no service until resolved), yellow are <b>minor warnings / cautions</b>. ☠️ means Do not answer. 🤫 lists things not to mention. Check the farm card for access notes, safety and repairs.'],
  ['Call, text or navigate', 'Tap a phone number to call. On a farm card, <b>🗺 View on map</b> shows where a pin is; <b>🧭 Navigate to…</b> starts directions — to the turn-off (where you leave the road) or straight to the yards.'],
  ['Change something', 'Tap <b>✏️ Edit</b> (top right of the page, or on any section). Make the change and tap <b>Save</b>. Every change is saved with your name and device, and syncs to everyone.'],
  ['Add a warning, note or photo', 'Tap <b>➕</b> on Warnings or Side notes (or <b>➕ Warning / caution / repair</b> on a farm). Your initials and the date are added. Use <b>📷 Add a photo</b> in the same pop-up, or tap <b>📷</b> on a note later to attach more. When it’s fixed, tap <b>✓ Issue resolved</b> and say what was done.'],
  ['Work through Jobs', 'The <b>${lab("jobs")}</b> tab lists things to check or tidy up. Use the search box to find one. Each job has buttons to fix it, or <b>🤖 Ask Claude</b> for help.'],
  ['Make an appointment note', 'On a client business, tap <b>📝 Make an appointment note</b>, answer the questions, then <b>Send to Keep</b> and pick Keep.'],
  ['If something looks wrong', 'Settings → <b>Change log</b> shows every change. Search it, then tap <b>↶ Undo</b> (or ↷ Redo). Deleted things are in Settings → <b>Trash</b>.'],
];
const GUIDE_MANUAL = [
  ['Getting started', `<p>The app works offline on phones and computers and keeps everyone's copy the same through the practice Google account (<b>Settings → Sync &amp; Google</b>). The first time it opens on a device it asks who you are, your initials, and either your phone number (phones) or whose computer it is.</p><p>Install it: open the app's web address in Chrome and choose <b>Add to Home screen</b> (phone) or <b>Install app</b> (computer). Tap <b>⟳</b> at the top to get the newest version.</p>`],
  ['Contacts and businesses', `<p><b>🙂 Happy helpers</b> (business page, under the staff list) are people who aren't employed by the business but help on busy days such as preg testing — search a contact or just type a name, add a note. Their own page shows <b>Happy helper at</b>. The job <b>Relationships (and happy helpers) in general info</b> also moves "Happy helpers: …" lines onto the business (✏️ Edit to fix names first). A happy helper's category never changes when the business's category changes — they aren't employees.</p><p><b>List order</b>: lists with more than one item (staff, past contacts, happy helpers, farms, linked businesses, related people) have <b>A–Z | Custom</b> at the top. Custom shows ⠿ to drag and ↑ ↓ buttons; the order is saved for everyone.</p><p>When people at the same business have different categories, the job <b>Contacts at the same business have different categories</b> offers <b>🖼 Split the business photo</b> (e.g. A client + C client side by side), and lists each person with their category, their businesses and their current photo — tap <b>🖼 Split</b> next to any one person to split just their photo (or ↺ Automatic to undo). Someone whose photo is already split to their two businesses' categories isn't counted as different. If a person with a chosen photo is added to or removed from a business, or a category changes, the app asks what their photo should show now (one pop-up for everyone affected; automatic photos just update themselves). Changes from another device show as a <b>Photo needs checking</b> job. Settings → <b>Split photos</b> sets which tag always goes on the left (sheep first by default), and whether labels and the middle line show. Change it back any time in Edit business → Business photo.</p><p><b>Inactivating a business</b>: the reason goes on the business, then the app lists its people — for each (or "Set everyone to") choose Make inactive too, Keep active (people who followed the business pick which category to keep), or They've left. People who also work for another active business are suggested as Keep active. People made inactive get the business's reason or a different one you type — it's their own copy, so editing a person's reason later never changes the business. When the business is made active again, it asks which people to bring back (those inactivated with it are ticked) and as which category. Inactivating a person who is the business's only or primary contact asks whether to inactivate the business too. <b>Do not answer</b> works exactly the same way (its own reason, people choices and bringing people back).</p><p>The <b>edit contact</b> window is split into clear sections — Name, Businesses and role, Category and tags, Phone/email/postal, General info, Warnings and notes, Don't mention, Photo. In <b>Don't mention</b>, search for each person and tap them (or just type a name if they're not in the app) and add a note beside them; if they're a contact it shows on both people. On the contact's page, Don't mention sits directly under Related people. A business page also shows a Don't mention box listing every one of its people's (e.g. Sammy Cullen ↔ Jeremy Cullen) — change them on each person's page. Every phone, email and address has a box ready to type in (boxes are left empty — what goes in each is written above it); ➕ Add another gives a second one, and empty boxes are ignored.</p><p>Any business or person's name shown in blue ("Also used by", "Owned by", route stops, jobs, the edit-farm window…) can be tapped to open them. In an edit window it asks first if you have unsaved changes.</p><p><b>Merging</b> two contacts or businesses shows everything that's different side by side — names, categories, info, phone numbers, emails, addresses, PICs and patient IDs. Pick which to keep for each, or tap <b>Keep everything from …</b> / <b>Combine everything</b>. Linked businesses, farms and contacts are always combined, so nothing is lost.</p><p><b>People</b> are linked to <b>businesses</b>. A person's category (A+, A, B, C, inactive…) normally comes from their business. A business can have current and past contacts; one is the <b>primary contact</b>.</p><p>On a page: phone and email, related people, don't mention, general info, linked businesses, PIC and patient IDs (🐄 cattle / 🐑 sheep), farms and saved routes. Tap <b>✏️ Edit</b> to change anything, ⇄ <b>Merge with…</b> to join duplicates.</p><p><b>Inactive</b> clients show a grey box with the reason; <b>☠️ Do not answer</b> shows a black banner.</p>`],
  ['Warnings, cautions, side notes and repairs', `<p><b>🆕🔍 New, need to assess</b> (farms) shows red like a major warning but doesn't add CHECK WARNING to the photo. Tick <b>Need to request photos of crush set up</b> or <b>Photos of crush set up requested — awaiting response</b> (with the date it was requested), and add a comment if you like. Every new farm added to a client starts with one, set to "Need to request photos" — you can see, change or remove it (and add any other warnings, with photos) while creating the farm, contact or business; they're saved when you tap Save. It's listed first on farms and in the edit window. Mark it ✓ resolved once the farm is assessed.</p><p>When editing a warning or note, tick <b>✓ Mark as resolved</b> and say what was done — it moves to Resolved (never deleted).</p><p><b>Photos</b> (several at once if you like) can be added while writing any warning or note (and when editing one) — tap 📷 Add photos, or on a computer drag and drop them onto the box. Drag and drop works on every photo button in the app, and onto a note to attach a photo to it.</p><p>In the job <b>Should this be a warning?</b>, <b>✂️ Split it up</b> lets you send different parts of the text to different farms (or the business), each as its own kind of note.</p><p><b>Major warning</b> (red) — no service until resolved; adds CHECK WARNING to the photo. <b>Minor warning / caution</b> (yellow) — can still service with care. <b>Side notes</b> — handy extra info. Farms also have <b>major repairs</b> 🛑 and <b>minor repairs</b> 🛠.</p><p>Each note keeps who added it and when, a history of edits, and optional <b>📷 photos</b> — add them in the pop-up when you create the note or with 📷 on the note later (tap "photos attached" to view, 🗑 to delete). <b>✓ Issue resolved</b> asks what was done and moves it to the <b>Resolved</b> section at the bottom — nothing is ever deleted.</p>`],
  ['Farms, yards and pins', `<p>Each farm has <b>① turn-off pin(s)</b> — where you leave the road (distance is measured to the first one) — and <b>② yards pins</b> — where the work is done. Add as many of each as needed; give each a label (e.g. Main gate, Back sheep yards). Each turn-off has its own <b>🚪 Access</b> notes, <b>🔢 Gate PIN</b> and <b>🔑 Key location</b>, and a <b>📷 View on Street View</b> button (also on the farm card) that shows Google's live Street View from the nearest road, facing the pin. <b>General farm info</b> sits right under the farm name. Tick <b>TBC</b> on any pin you're not sure about until you visit — it shows with a red background everywhere (farm card, maps, Check pins) until you untick it. For non-client businesses the pins are <b>Business pins</b> (🏢 Main office, 🚚 Depot…).</p><p>To set a pin: <b>🗺 Choose on the map</b> (tap or drag), <b>📍 Suggest a pin from the address</b>, or paste coordinates from Google Maps. After a pin changes, check the km and tick the distance check before saving.</p><p>On a business page, <b>🗺 Map of all pins</b> (under the farm lists) shows every turn-off and yards pin for that business — tap one for the farm's details, Navigate, Show farm card or Edit.</p><p>Shared yards are used by more than one business — changes show for all of them. Reorder a business's farms by holding ⠿ and dragging, with the ↑ ↓ buttons, or tap <b>A–Z</b>. In the edit window, <b>Owner &amp; who uses it</b> lists every business that uses the farm: set each to Current, Not current or Remove from this business, tap 👑 Make owner, or add another business — the same when creating a new farm. Changes are saved when you tap Save. <b>Merging farms</b> (⇄ Merge with other yards, or the duplicate-farm jobs) shows where the two differ — name, address, info, pins, distance, access, owner — so you can keep 1's, 2's or both (the second pin becomes an extra pin); warnings, notes, photos and extra pins are always kept. On a farm card, <b>🗺 All pins for this farm</b> opens a full-screen map of every pin on that farm. Maps showing several pins zoom so they all fit; on the business's map of all pins the cattle and sheep pins sit on top of the turn-offs. Each farm card shows the general farm info, distance, drive time and who else uses it at the top, then three clearly labelled rows of pin buttons: <b>🧭 Directions</b> (start driving there), <b>🗺 Map</b> (see where the pin is) and <b>📷 Street View</b> (see the turn-off from the road). On a farm card: <b>Make not current</b> (keeps it as a past farm), <b>🗑 Delete</b> (asks which businesses for shared yards), <b>➕ Farm</b> on a business asks whether it's new or an existing farm to link, and <b>⇄ Merge with other yards</b> (in the edit window) joins two that are the same place.</p>`],
  ['Jobs', `<p><b>Is this the same person?</b> lists related people, happy helpers and Don't mention people saved as just a name when a contact in the app looks like them (same name, or a short first name with the same surname or business) — tap ✓ Same person — link, or Not the same person. New contacts are checked automatically.</p><p><b>Relationships in general info</b>: tap ✏️ Edit next to any line to change who the person is (search a contact or type a name), their relationship, add or drop people, and whether the line comes out of general info.</p><p><b>Farm just called "Farm" or with no name</b> suggests a name from the road in its address (e.g. Gull Rock Road farm) — tap ✓ Rename, or 📍 Find the road from the pin when there's no address, or ✏️ Another name. Tick several and use ✓ Rename all to their road name.</p><p>Jobs are things the app has found to check — missing details, possible duplicates, pins to check, sync clashes. Use the <b>search box</b> to find one, the <b>Active / Inactive / All</b> chips to filter, and the tick boxes to fix many at once. <b>Mark resolved</b> (or the job's own button) clears a job if nothing needs changing.</p><p>Whenever a turn-off pin is added or moved, the app asks you to check it on Street View straight away (you can move it there and save, or skip). Any time later, tap the turn-off under <b>📷 Street View</b> on the farm card: a full screen opens with Street View and the map together (side by side on a computer, top and bottom on a phone). Drag the pin or walk along the road — they follow each other — then tap ✓ Save, or Close to leave it.</p><p><b>Check turn-off pins on Street View</b>: the first farm opens with Street View above a small map. Walk along the road in Street View (the pin follows you) or drag the 🚗 on the map (Street View jumps to it), then <b>✓ Save &amp; next</b>. Every farm job also shows the farm's 📍 physical address.</p><p><b>Possible duplicate farms</b> lists farms whose yards pins are within 200 m of each other (turn-off pins and matching addresses on their own don't count). Pairs you've marked as different farms don't come back — merge them (keeping either one's details) or mark them as different.</p><p><b>Farm jobs with a map</b> — Check pins, Farm just called "Home", Farm address with no GPS pin and Add the turn-off pin: the first one's map opens by itself. Rename the farm (tap a suggested name or type one), drag the pins into place, change a pin's type or label, add or remove pins, set who still uses shared yards and who owns them, then <b>✓ Save &amp; next</b> to go straight to the next one. <b>⛶ Full screen</b> makes the map bigger.</p><p><b>Your own job lists</b>: <b>➕ New job list</b> (Jobs page or Settings → Jobs to show) — describe it in words and let Claude set up the rule, or build it yourself.</p>`],
  ['Search & Bulk Edit, Plan Route and the farm map', `<p><b>People</b> and <b>Businesses</b> each have their own menu, with All / Client / Non-client buttons at the top. The farm map is at the bottom of <b>Plan Route</b>.</p><p><b>${lab('search')}</b> finds contacts, businesses or pins by any detail and lets you change many at once — including <b>🔤 Rename…</b> (find and replace in names, with a preview; doubled words are fixed automatically). <b>${lab('map')}</b> shows every pin. <b>${lab('route')}</b> builds a day's route from homebase, puts the stops in the best order and opens it in Google Maps.</p>`],
  ['Appointment notes (Google Keep)', `<p>On a client business: <b>📝 Make an appointment note</b> → choose initials, the patient ID (cattle 🐄 / sheep 🐑), appointment type (on-farm, shared, in-house, in-house FEC testing or phone) and farm(s). Tick "Set the route" to choose the order of stops, and to start or finish somewhere other than Bovitech (Bovitech is the default — search for any farm or business to change it) — you can go back to the same farm (e.g. Bovitech → Farm A → Farm B → Farm A → Bovitech). In-house, FEC and phone appointments don't ask for a farm. Phone appointments ask what time the call started (the per-minute phone consult asks for the start and end, and works out the minutes). Times are picked in 5-minute steps (tap AM or PM — if neither is tapped, 6–11 counts as am and 12–5 as pm), and anything marked (optional - can leave blank) can be skipped. In-house FEC testing asks how many bulk samples, individual animal samples, FEC trays returned and kits dispensed. The date, business name, property and travel (km and route from Bovitech and back) fill in by themselves. Then a second pop-up asks for the start and finish time (or time of the phone call), break (no / yes and how long / leave as no/yes), additional labour (no / yes and how many hours / leave as no/yes) and travel type (pick one, or leave all the options) — anything left blank stays blank. Check the note, then <b>Send to Keep</b> and pick Keep — the first line becomes the title. The admin can change the templates and initials in Settings → <b>Keep note templates</b>.</p>`],
  ['Ask Claude', `<p>Settings → <b>🤖 Ask Claude</b>, or the 🤖 button on any job. Type what you want (e.g. change details, link people, rename farms), tap <b>Copy for Claude</b>, paste it into Claude, then paste Claude's reply back and tap <b>Check changes</b>. Nothing is saved until you confirm.</p>`],
  ['Change log, undo and trash', `<p>Settings → <b>Change log</b> lists every change on every device. Search by name, word, person or date; tap a change to see exactly what changed; <b>↶ Undo</b> puts it back, <b>↷ Redo</b> re-applies an undone change. When a client is made <b>inactive</b> or <b>do not answer</b>, their farms become <b>not current</b> automatically (if someone else uses shared yards, you're asked who owns them now); make them active again and those farms come back. If a farm ever disappears without going to the trash (e.g. a sync clash), a <b>Farm lost in a sync clash</b> job lets you restore it with one tap. Deleted contacts, businesses and farms go to <b>Trash</b> and can be restored. Each contact and business page also has a folded <b>🕘 Change history</b> at the very bottom showing just that page's changes.</p>`],
  ['Sync, backups and conflicts', `<p><b>Syncing is automatic</b> — a few seconds after every change, every minute while the app is open, and whenever it's reopened or comes back online. Google's sign-in lasts an hour and can only be renewed after a tap, so after a break the first tap anywhere renews it and syncing carries on. <b>Sync clashes</b> (the same record changed on two devices before they synced) now cover the whole screen and block the app until each one is sorted: it shows what's different on this device and the other, with Keep this device's / Keep the other version (or the same for all).</p><p><b>Google Contacts</b> (caller photos and details on the phones) is updated from one device — tick "This device keeps Google Contacts up to date" on that device only (admin). It sends names, phones, emails, businesses, farm names with their addresses, and postal addresses.</p><p>Changes sync through Google Drive whenever you're online. A backup is saved to Google Drive every night (30 days kept) — Settings → <b>Backups</b> to download or restore one. If two devices change the same thing while offline, a <b>Sync conflicts</b> job on that device lets you pick which version to keep. Backups are admin only: the list shows the last week, with the app version and how many records each holds; <b>Download backup</b> says which version it saves. A device that hasn't synced for more than a day must sync before it can be used (the admin can skip this with the PIN) — this stops old copies undoing other people's work.</p>`],
  ['Admin', `<p><b>🎨 Edit how this page looks</b> (admin) is at the top of Plan Route, Search &amp; Bulk Edit and Jobs: move sections up or down, change a heading, its background and text colour and size, or fold it up / hide it. The People, Businesses and Pins lists have it too — move or hide the search bar, type buttons and count row, rename the type buttons, change colours and the list's text size. Contact and business pages use their own 🎨 editor; the <b>farm card</b> layout (order of address, info, distance, pins, access, notes, photos, buttons…, or fold any part up) is in Settings → Page layout → 🐄 Farm card. Settings sections sort themselves. Google maps scroll with one finger.</p><p>Settings marked 🔒 need the admin PIN. Every settings section can be set to 🔒 Admin only or 🔓 Everyone — tap the label next to its title. The admin can also rename each section (✏️ next to the title). Sections sort themselves: the ones open to everyone first, then admin only, each in A–Z order — renaming or locking a section moves it to its new place. edit page layouts (🎨 Edit how this page looks — hold ⠿ to drag sections), <b>Box colours and text</b> (every coloured box: warnings, notes, Keep note templates, ICE, resolved, photo buttons, farm cards and pin buttons), symbols, menu names, pin types, job lists, Keep note templates and initials.</p>`],
];
function guideCard() { return `<div class="card"><h3>📖 User manual</h3><div class="hint" style="margin-bottom:8px">How everything in the app works. Tap a chapter to open it.</div>${GUIDE_MANUAL.map(([t, b]) => `<details class="guidestep"><summary>📘 ${t}</summary><div class="body guidebody">${b}</div></details>`).join('')}</div>`; }
function renderSettings() {
  const st = D.settings;
  return `<div class="d-wrap"><h2 class="sec-h" style="font-size:26px">${h(lab('settings'))}</h2>
  <div class="actions setall"><button class="btn small" data-act="set-all" data-v="1">⊞ Expand all</button><button class="btn small" data-act="set-all" data-v="0">⊟ Collapse all</button>${S.admin ? '<button class="btn small on" data-act="admin-lock">🔓 Admin unlocked — lock</button><button class="btn small" data-act="admin-pin">Change admin PIN</button>' : '<button class="btn small" data-act="admin-unlock">🔒 Admin</button>'}</div>${S.admin ? '<div class="adminbar" style="margin-top:-4px"><span>🎨</span><span style="flex:1">To change how pages look, open any contact or business and tap <b>🎨 Edit how this page looks</b> (just under the name). The locked cards below are now open too.</span></div>' : ''}
  ${guideCard()}
  <div class="card"><h3>🤖 Ask Claude</h3>
    <div class="hint" style="margin-bottom:8px">Free — uses your own Claude account. 1) Type what you want. 2) Tap <b>Copy for Claude</b> and paste it into Claude. 3) Copy Claude's whole reply, paste it in box 3 and tap <b>Check changes</b>. Nothing is saved until you confirm.</div>
    <div class="f"><label>1. What do you want Claude to do or find?</label><textarea id="ai-req" style="min-height:70px">${h(S.aiReq || '')}</textarea></div>
    <div class="f"><label>Send Claude</label><select id="ai-scope"><option value="mentioned">Only the people and businesses named in my request (plus who they're linked to)</option><option value="all" ${S.aiScope === 'all' ? 'selected' : ''}>Everyone, in short form (for questions across all clients)</option></select></div>
    <div class="actions"><button class="btn primary" data-act="ai-copy">2. Copy for Claude &amp; open Claude</button></div><div id="ai-copyinfo" class="hint"></div>
    ${S.admin ? `<details style="margin-top:8px"><summary class="hint" style="cursor:pointer">Open a particular Claude chat or project instead of a new chat${D.settings.aiChatUrl ? ' <b>(set)</b>' : ''}</summary>
      <div class="hint" style="margin:6px 0">Open the chat (or Claude project) in Claude, copy its address from the address bar or Share menu, and paste it here. Leave empty to start a new chat each time. Applies on every device.</div>
      <div class="search"><input id="ai-chaturl" value="${h(D.settings.aiChatUrl || '')}"><button class="btn small" data-act="ai-chat-save">Save</button></div></details>` : `<div class="hint" style="margin-top:8px">Opens ${D.settings.aiChatUrl ? 'a particular Claude chat or project (set by the admin)' : 'a new Claude chat'}. <button type="button" class="setlock" style="font-size:11px;padding:1px 7px" data-act="admin-unlock">🔒 Admin only — unlock to change</button></div>`}
    <div class="f" style="margin-top:10px"><label>3. Paste Claude's reply here</label><textarea id="ai-reply" style="min-height:90px">${h(S.aiReply || '')}</textarea></div>
    <div class="actions"><button class="btn primary" data-act="ai-apply">Check changes</button></div><div id="ai-result" class="hint">${S.aiResult || ''}</div></div>
  <div class="card"><h3><span class="sp">Tags &amp; photos</span><button class="btn small" data-act="new-tag">➕ New tag</button></h3>
  ${['client', 'additional'].map((g) => `<div class="lbl" style="margin-top:10px">${{ client: 'Contact category', additional: 'Additional tags' }[g]}${g === 'client' ? ' <span class="hint">(A+ to C are set on the business)</span>' : ''}</div>${D.tags.filter((t) => (g === 'client' ? t.group === 'rating' || t.group === 'client' : t.group === g)).map((t) => { const src = tagPhotoSrc(t.id); const n = D.contacts.filter((c) => contactTagSet(c).has(t.id)).length; return `<div class="kv" style="align-items:center">${src ? `<img src="${src}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">` : '<span style="width:36px;height:36px;border-radius:50%;background:#eee;display:inline-block"></span>'}<div class="v">${h(t.name)} <span class="hint">${n} contact${n === 1 ? '' : 's'}</span></div><button class="btn small" data-act="edit-tag" data-id="${t.id}">Edit</button></div>`; }).join('')}`).join('')}</div>
  <div class="card"><h3>Split photos</h3><div class="hint" style="margin-bottom:6px">How a photo split in two looks. Tags higher on this list always go on the <b>left</b> half. Changes apply on every device.</div>
  ${splitOrder().map((id, i, arr) => `<div class="kv" style="align-items:center"><span style="width:22px;color:var(--ink3);font-weight:600">${i + 1}</span><img src="${tagPhotoSrc(id)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover"><div class="v">${h(tagName(id))}</div><button class="btn small" data-act="sorder" data-id="${id}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class="btn small" data-act="sorder" data-id="${id}" data-dir="1" ${i < arr.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button></div>`).join('')}
  <div class="grid2" style="margin-top:8px"><div class="f"><label>Labels on each half</label><select data-splitlook="labels"><option value="1" ${splitLook().labels ? 'selected' : ''}>Show</option><option value="0" ${splitLook().labels ? '' : 'selected'}>Hide</option></select></div><div class="f"><label>Label position</label><select data-splitlook="pos">${[['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']].map(([v, l]) => `<option value="${v}" ${splitLook().pos === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
  <div class="f"><label>White line down the middle</label><select data-splitlook="line"><option value="1" ${splitLook().line ? 'selected' : ''}>Show</option><option value="0" ${splitLook().line ? '' : 'selected'}>Hide</option></select></div>
  ${D.settings.splitOrder || D.settings.splitLook ? '<div class="actions" style="margin-top:8px"><button class="btn small" data-act="sorder-reset">Reset to default</button></div>' : ''}</div>
  <div class="card"><h3>Photo priority</h3><div class="hint" style="margin-bottom:6px">When a contact has more than one tag with a photo and nobody has chosen one, the tag highest on this list is shown. Use the arrows to reorder. Changes apply on every device.</div>
  ${photoOrder().map((id, i, arr) => `<div class="kv" style="align-items:center"><span style="width:22px;color:var(--ink3);font-weight:600">${i + 1}</span><img src="${tagPhotoSrc(id)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover"><div class="v">${h(tagName(id))}</div><button class="btn small" data-act="prio" data-id="${id}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class="btn small" data-act="prio" data-id="${id}" data-dir="1" ${i < arr.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button></div>`).join('')}
  ${D.settings.photoPriority ? '<div class="actions" style="margin-top:8px"><button class="btn small" data-act="prio-reset">Reset to default order</button></div>' : ''}</div>
  <div class="card"><h3>This device</h3>${(() => { const di = devInfo(); return `<div class="grid2 stack"><div class="f"><label>Your nickname</label><input id="s-nick" value="${h(di.nick)}"><div class="hint">Shown as "Hi ${h(di.nick || '…')}" when the app opens.</div></div>
    <div class="f"><label>Device name</label><div class="search"><input id="s-devmodel" value="${h(di.dev)}"><button class="btn small" data-act="dev-detect" title="Pick up the device model again">Detect</button></div><div class="hint">Picked up from the device where it allows (Android shares the model, e.g. "Samsung SM-S918B", not the name you gave the phone) — change it to anything you like.</div></div>
    <div class="f"><label>This device is a…</label><div style="display:flex;gap:14px;flex-wrap:wrap"><label><input type="radio" name="dtype" id="s-dt-phone" value="phone" ${devIsPhone() ? 'checked' : ''}> 📱 Phone</label><label><input type="radio" name="dtype" value="computer" ${devIsPhone() ? '' : 'checked'}> 💻 Computer or tablet</label></div></div>
    <div class="f dt-phone" ${devIsPhone() ? '' : 'hidden'}><label>Your phone number</label><input id="s-devphone" value="${h(di.phone)}" inputmode="tel"><div class="hint">Required on a phone. Phones don't let apps read their own number, so type it in (on a computer, use your mobile).</div></div></div>
    <div class="f"><label>Your initials</label><input id="s-initials" value="${h(LSget('bvt-initials') || '')}" maxlength="4" style="max-width:120px;text-transform:uppercase"><div class="hint">Required. Shown next to warnings, side notes, cautions and repairs you add or resolve.</div></div>
    <div class="actions"><button class="btn primary small" data-act="devname-save">Save</button><span class="hint">Shown in the change log as "${h(deviceName())}"</span></div>`; })()}
    <div class="lbl" style="margin-top:8px">Devices using the app</div>${Object.entries(D.devices || {}).sort((a, b) => (b[1].last || 0) - (a[1].last || 0)).map(([k, v]) => `<div class="kv"><div class="k">${h(v.name || 'Device')}${k === DEVICE ? ' <span class="hint">(this one)</span>' : ''}</div><div class="v">${v.phone ? h(v.phone) + ' · ' : ''}last synced ${v.last ? new Date(v.last).toLocaleString('en-AU') : '—'} · v${h(v.ver || '?')}</div></div>`).join('') || '<div class="hint">Devices appear here after they sync.</div>'}</div>
  <div class="card"><h3>Display <span class="hint">(this device)</span></h3><div class="grid2">
    <div class="f"><label>Appearance</label><select data-pref="theme">${[['auto', 'Match the phone / computer'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${(PREF.theme || 'auto') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="f"><label>Colour scheme</label><select data-pref="scheme">${SCHEMES.map(([v, l]) => `<option value="${v}" ${(PREF.scheme || 'classic') === v ? 'selected' : ''}>${l}</option>`).join('')}</select><div style="display:flex;gap:6px;margin-top:6px">${SCHEMES.map(([v, l, c]) => `<button class="schsw ${(PREF.scheme || 'classic') === v ? 'on' : ''}" data-act="scheme" data-v="${v}" title="${l}" style="background:${c}"></button>`).join('')}</div></div>
    <div class="f"><label>Text size</label><select data-pref="size">${[['normal', 'Normal'], ['large', 'Large'], ['xl', 'Extra large']].map(([v, l]) => `<option value="${v}" ${(PREF.size || 'normal') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div></div>
  <div class="card"><h3>Start-up defaults <span class="hint">(this device)</span></h3><div class="grid2">
    <div class="f"><label>Open on</label><select data-pref="tab">${TABS.map(([k]) => `<option value="${k}" ${(PREF.tab || 'contacts') === k ? 'selected' : ''}>${h(lab(k))}</option>`).join('')}</select></div>
    <div class="f"><label>${h(lab('contacts'))} sorted by</label><select data-pref="sort">${[['first', 'First name'], ['last', 'Surname'], ['business', 'Business'], ['rating', 'Rating'], ['tag', 'Tag']].map(([v, l]) => `<option value="${v}" ${(PREF.sort || 'first') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="f"><label>${h(lab('contacts'))} show</label><select data-pref="ptype">${[['all', 'All'], ['client', 'Client people'], ['nonclient', 'Non-client people']].map(([v, l]) => `<option value="${v}" ${(PREF.ptype || 'all') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="f"><label>${h(lab('biz'))} sorted by</label><select data-pref="bsort">${[['name', 'Name'], ['rating', 'Rating']].map(([v, l]) => `<option value="${v}" ${(PREF.bsort || 'name') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="f"><label>${h(lab('biz'))} show</label><select data-pref="btype">${[['all', 'All'], ['client', 'Client businesses'], ['nonclient', 'Non-client businesses']].map(([v, l]) => `<option value="${v}" ${(PREF.btype || 'all') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div></div>
  <div class="card"><h3>Jobs to show <span class="hint">(this device)</span></h3><div class="actions" style="margin:0 0 8px"><button class="btn greenbtn" data-act="cj-new">➕ New job list (Claude can help)</button></div><div class="hint" style="margin-bottom:6px">Untick the kinds of jobs you don't want on this device's Jobs list and badge. The number is how many there are right now. Your own job lists are under ⭐ at the bottom — tap ✏️ to change one.</div>${(() => { cjSyncTypes(); const off = new Set(PREF.jobsOff || []); const gone = jobsGone(); const cnt = {}; try { computeJobs().forEach((j) => { cnt[j.type] = (cnt[j.type] || 0) + 1; }); } catch (e) { }
    const grp = (k) => (JOB_TYPES[k].custom ? 'own' : (JOB_INFO[k] || ['contact'])[0]); const ks = Object.keys(JOB_TYPES).filter((k) => !gone.has(k));
    return JOB_GROUPS.map(([g, gl]) => { const list = ks.filter((k) => grp(k) === g); if (!list.length) return ''; return `<div class="lbl" style="margin-top:10px">${gl}</div>${list.map((k) => { const cj = JOB_TYPES[k].custom ? cjList().find((x) => 'cj_' + x.id === k) : null; return `<label class="jobpick"><input type="checkbox" data-jobtype="${k}" ${off.has(k) ? '' : 'checked'}>${cj && S.admin ? `<button type="button" class="btn small" data-act="cj-edit" data-type="${k}" title="Edit this job list" style="order:9;margin-left:auto">✏️</button>` : ''}<span><b>${h(JOB_TYPES[k].t.replace(/\s*\(20 at a time\)/, ''))}</b> <span class="cn">${cnt[k] || 0}</span><br><span class="hint">${h(cj ? (cj.why || cjRuleText(cj)) : (JOB_INFO[k] || [, ''])[1])}</span></span></label>`; }).join('')}`; }).join(''); })()}</div>
  <div class="card"><h3>Keep note templates</h3><div class="hint" style="margin-bottom:6px">Used by "📝 Make an appointment note" on client businesses. The first line becomes the Keep note's title. These fill in by themselves: <b>{date}</b> today (YYYYMMDD) · <b>{initials}</b> · <b>{name}</b> the business name · <b>{type}</b> appointment type · <b>{property}</b> farm name(s) · <b>{travel}</b> km and route · <b>{start}</b> <b>{finish}</b> <b>{break}</b> <b>{labour}</b> <b>{traveltype}</b> <b>{calltime}</b> <b>{patientid}</b> <b>{bulk}</b> <b>{indiv}</b> <b>{trays}</b> <b>{kits}</b> — the answers to the extra questions (blank or "no/yes" if you skip them). Farm questions are only asked when the template has {property} or {travel}.</div>
    ${Object.keys(KEEP_DEF).map((k) => `<div class="f"><label>${h(KEEP_NAMES[k])}</label><textarea id="keep-${k}" rows="9" style="font-family:inherit">${h(keepTpl(k))}</textarea>${(D.settings.keepTpl || {})[k] != null ? `<button class="btn small" data-act="keep-tpl-reset" data-k="${k}">Reset to the original</button>` : ''}</div>`).join('')}<div class="f"><label>Initials to choose from</label><input id="keep-inits" value="${h(keepInits().join(', '))}"><div class="hint">Separate with commas. The phone's own initials are always ticked first.</div></div><div class="actions"><button class="btn primary" data-act="keep-tpl-save">Save templates</button></div></div>
  <div class="card"><h3>Required information</h3><div class="hint" style="margin-bottom:6px">New contacts can always be saved — anything ticked here that's missing goes on the Jobs list ("New contact — information missing"). Farm details are only asked for client people.</div><div class="checks">${REQ_FIELDS.map(([k, l]) => `<label><input type="checkbox" data-req="${k}" ${reqOn(k) ? 'checked' : ''}>${h(l)}</label>`).join('')}</div></div>
  <div class="card"><h3>Travel and routes</h3><div class="hint" style="margin-bottom:6px">Google Maps calculates the fastest route. These options apply to the app's km, drive-time and route calculations (the Google Maps app uses its own route options).</div>
    <div class="checks"><label><input type="checkbox" data-route="avoidTolls" ${routeSet().avoidTolls ? 'checked' : ''}>Avoid tolls</label><label><input type="checkbox" data-route="avoidHighways" ${routeSet().avoidHighways ? 'checked' : ''}>Avoid highways</label><label><input type="checkbox" data-route="avoidFerries" ${routeSet().avoidFerries ? 'checked' : ''}>Avoid ferries</label></div>
    <div class="grid2" style="margin-top:8px"><div class="f"><label>Two farm pins count as the same spot within (metres)</label><input type="number" data-routenum="pinM" value="${routeSet().pinM}"></div><div class="f"><label>Flag a distance when it differs from Google by more than (km)</label><input type="number" step="0.5" data-routenum="kmTol" value="${routeSet().kmTol}"></div></div></div>
  <div class="card"><h3>Backups</h3><div class="hint" style="margin-bottom:6px">A copy of everything is saved to Google Drive once a day (by the first device that opens the app and syncs after 12 am), and the last 30 are kept. The list shows the last week. ${PREF.lastBackup ? 'Last checked on this device: ' + h(PREF.lastBackup) + '.' : ''}</div>
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
  ${secOk('Menu names') ? `<div class="card"><h3>Menu names</h3><div class="hint" style="margin-bottom:6px">Rename the menu headings. Leave a box empty to use the standard name. Applies to every device.</div>
    ${Object.keys(TAB_DEFAULTS).map((k) => `<div class="f"><label>${h(TAB_DEFAULTS[k])}</label><input data-label="${k}" value="${h((st.labels || {})[k] || '')}"></div>`).join('')}</div>` : adminOnly('Menu names', '')}
  <div class="card"><h3>Homebase</h3><div class="f"><label>Address</label><input id="s-homeaddr" value="${h(st.home.address)}"></div><div class="f"><label>GPS</label><input id="s-homegps" value="${st.home.lat}, ${st.home.lng}"></div><button class="btn small" data-act="save-home">Save homebase</button></div>
  <div class="card"><h3>Google Maps</h3><div class="f"><label>API key</label><input id="s-mapskey" value="${h(st.mapsKey || '')}"></div><button class="btn small" data-act="save-key">Save key</button><div class="hint">Used to calculate km and drive time, check distances, plan the most efficient route, find pins from addresses and show Street View photos. In Google Cloud, turn on <b>Routes API</b>, <b>Geocoding API</b> and <b>Street View Static API</b> for this key.</div></div>
  <div class="card"><h3><span class="sp">Pin types</span><button class="btn small" data-act="pintype-add">➕ New pin type</button></h3><div class="hint" style="margin-bottom:6px">The symbols used for farm pins (yards, dairy, office…). Applies on every device.</div>
    ${pinTypes().map((t) => { const n = D.farms.filter((f) => f.pinType === t.id || (f.extra || []).some((x) => x.type === t.id)).length; return `<div class="kv" style="align-items:center"><span style="font-size:22px;width:34px">${t.emoji}</span><div class="v">${h(t.name)} <span class="hint">· ${t.yard ? 'yards · ' : ''}${n} pin${n === 1 ? '' : 's'}</span></div><button class="btn small" data-act="pintype-edit" data-id="${h(t.id)}">Edit</button>${n ? '' : `<button class="btn small" data-act="pintype-del" data-id="${h(t.id)}">Delete</button>`}</div>`; }).join('')}
    <div class="kv" style="align-items:center"><span style="font-size:22px;width:34px">${turnPin().emoji}</span><div class="v">${h(turnName())} <span class="hint">· from the road · built in · ${D.farms.filter((f) => f.turn && f.turn.lat != null).length} pins</span></div><button class="btn small" data-act="turnpin-edit" title="Change the name or symbol">Edit</button></div></div>
  ${adminOnly('Page layout and custom sections', layoutCard())}
  ${adminOnly('Box colours and text', boxCard())}
  ${adminOnly('Symbols', iconCard())}
  ${listCard('inactiveReasons', 'Reasons for inactivating', inactiveReasons(), 'Tap-to-fill choices when someone is made Inactive. Use the arrows to change the order.')}
  ${listCard('linkRoles', 'Roles', linkRoles(), 'Quick choices for someone\'s role at a business (when linking, and in Edit contact). Roles already in use that aren\'t here still appear after these.')}
  <div class="card"><h3>Location types</h3><div class="hint" style="margin-bottom:6px">Choose whether each pin type counts as a yard location or a non-farm location. This decides which toggle it shows under in ${h(lab('loc'))} and Search. Applies on every device.</div>
    ${pinTypes().map((t) => `<div class="kv" style="align-items:center"><span style="font-size:22px;width:34px">${t.emoji}</span><div class="v">${h(t.name)}</div><select data-pinloc="${h(t.id)}" style="padding:7px 9px;border:1px solid var(--line);border-radius:9px"><option value="yard" ${t.yard ? 'selected' : ''}>Yard location</option><option value="other" ${t.yard ? '' : 'selected'}>Non-farm location</option></select></div>`).join('')}
    <div class="kv"><span style="font-size:22px;width:34px">${turnPin().emoji}</span><div class="v">${h(turnName())} pins</div><span class="hint">Always "${h(turnName())} pins"</span></div></div>
  ${syncSettingsCard()}
  <div class="card"><h3>App version</h3><div class="kv"><div class="k">Version</div><div class="v">${APP_VERSION}</div></div>${S.latest ? `<div class="kv"><div class="k">Latest</div><div class="v">${h(S.latest)}${S.latest !== APP_VERSION.split(' ')[0] ? ' — <b style="color:var(--red)">tap ⟳ to update</b>' : ' ✓ up to date'}</div></div>` : ''}<div class="actions"><button class="btn small" data-act="app-refresh">⟳ Close and reopen on the latest version</button></div></div>
  ${renderChangeLog()}
  ${renderTrash()}
  <div class="card"><h3>Backup</h3><div class="hint" style="margin-bottom:6px">Download backup saves this device's copy right now — <b>app v${h(APP_VERSION.split(' ')[0])}</b>, ${D.contacts.length} contacts, ${D.businesses.length} businesses, ${(D.farms || []).length} farms${D.sync.last ? `, last synced ${new Date(D.sync.last).toLocaleString('en-AU')}` : ''}.</div><div class="actions"><button class="btn" data-act="export">Download backup</button><label class="btn">Restore backup<input type="file" accept=".json" data-act="import" style="display:none"></label></div><div class="hint">Data imported from Google Contacts on ${h(D.importedAt || '14 Oct 2026')}.</div></div>
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
const SCRIPT_P = {};
function loadScript(src) { /* waits until the script has really loaded; a failed load can be tried again (weak reception) */
  if (SCRIPT_P[src]) return SCRIPT_P[src];
  SCRIPT_P[src] = new Promise((res, rej) => { document.querySelectorAll(`script[src="${src}"]`).forEach((x) => x.remove()); const s = document.createElement('script'); s.src = src; s.async = true;
    const tm = setTimeout(() => fail('took too long — check the internet connection and try again'), 20000);
    const fail = (why) => { clearTimeout(tm); s.remove(); delete SCRIPT_P[src]; rej(new Error("Couldn't reach Google sign-in (" + why + ')')); };
    s.onload = () => { clearTimeout(tm); res(); }; s.onerror = () => fail('no connection'); document.head.appendChild(s); });
  return SCRIPT_P[src];
}
document.addEventListener('pointerdown', (e) => { /* Google sign-in lasts an hour; renew on the next tap so syncing carries on by itself */
  if (e.target.closest && e.target.closest('#sync, #askbox, .sheet-bg')) return; if (!window.Sync || !Sync.enabled() || !D || !D.sync || !D.sync.email || !navigator.onLine || GAuth.renewing) return; if (GAuth.valid() && GAuth.tok.exp - Date.now() > 10 * 60000) return; if (GAuth.lastTry && Date.now() - GAuth.lastTry < 60000) return;
  GAuth.renewing = true; GAuth.lastTry = Date.now(); GAuth.tok = null; GAuth.get(true).then(() => Sync.run(false)).catch(() => {}).finally(() => { GAuth.renewing = false; renderSyncPill(); }); }, true);
const practiceAccount = () => D.settings.gAccount || D.sync.email || 'bovitechvetservices@gmail.com'; // one Google account for every device (Settings → Sync & Google)
const GAuth = {
  tok: null,
  valid() { if (!this.tok) { try { this.tok = JSON.parse(localStorage.getItem('bvt-tok') || 'null'); } catch (e) { } } return this.tok && Date.now() < this.tok.exp - 60000; },
  // interactive=true must be called from a tap (Google opens a small sign-in window)
  async get(interactive) {
    if (this.valid()) return this.tok.t;
    if (!interactive) throw Object.assign(new Error('signin'), { signin: true });
    if (!CONFIG.googleClientId) throw new Error('Google sign-in is not set up yet.');
    await loadScript('https://accounts.google.com/gsi/client');
    if (!window.google || !google.accounts || !google.accounts.oauth2) { delete SCRIPT_P['https://accounts.google.com/gsi/client']; throw new Error("Google sign-in didn't load properly — check the internet connection and tap Sign in again."); }
    const r = await new Promise((res, rej) => {
      const c = google.accounts.oauth2.initTokenClient({ client_id: CONFIG.googleClientId, scope: SCOPES, hint: practiceAccount(), callback: (x) => (x.error ? rej(new Error(x.error)) : res(x)), error_callback: (e) => rej(new Error(e.type === 'popup_closed' ? 'Sign-in window was closed' : e.type || 'Sign-in failed')) });
      c.requestAccessToken({ prompt: D.sync.email ? '' : 'consent' });
    });
    if (!google.accounts.oauth2.hasGrantedAllScopes(r, ...SCOPES.split(' '))) throw new Error('Please tick all the boxes on the Google screen so the app can sync and update Google Contacts.');
    this.tok = { t: r.access_token, exp: Date.now() + r.expires_in * 1000 };
    try { localStorage.setItem('bvt-tok', JSON.stringify(this.tok)); } catch (e) { }
    { let u = null; try { u = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + r.access_token } })).json(); } catch (e) { }
      const want = (D.settings.gAccount || '').toLowerCase(), got = ((u && u.email) || '').toLowerCase();
      if (want && got && got !== want) { this.signOut(); throw new Error(`This device signed in as ${got}. Every device uses the practice Google account ${want} — please sign in again and choose that account.`); }
      if (got && !want) { D.settings.gAccount = got; touch(D.settings); } if (got) D.sync.email = got; }
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
const KINDS = ['contacts', 'businesses', 'tags', 'routes', 'farms']; const DATA_FORMAT = 2;
const strip = (r) => { const o = { ...r }; delete o._dirty; return o; };
const adopt = (l, s) => { Object.keys(l).forEach((k) => delete l[k]); Object.assign(l, s); return l; }; // overwrite a record in place (keeps references held by open screens)
const Sync = {
  state: 'idle', msg: '', timer: null, busy: false,
  enabled() { return !!CONFIG.googleClientId && !window.SEED; },
  start() {
    if (!this.enabled()) return;
    window.addEventListener('online', () => this.run(false));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.run(false); });
    setInterval(() => { if (!document.hidden) this.run(false); }, 60 * 1000); window.addEventListener('focus', () => this.run(false));
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
    const out = { format: DATA_FORMAT, savedAt: new Date().toISOString(), savedBy: DEVICE, settings: strip(D.settings), deleted: (D.deleted || []).map(({ id, kind, at }) => ({ id, kind, at })), dismissed: D.dismissed || {}, devices: D.devices || {}, importedAt: D.importedAt, trash: (D.trash || []).filter((t) => Date.now() - t.at < 90 * 864e5), changelog: (D.changelog || []).slice(0, 400) };
    KINDS.forEach((k) => (out[k] = (D[k] || []).map(strip)));
    out.businesses = out.businesses.map((b) => ({ ...b, farms: [] })); /* empty list keeps older app versions from crashing until they update */
    return JSON.stringify(out);
  },
  async upload(id) {
    // bump revisions of everything we are sending that changed here
    KINDS.forEach((k) => D[k].forEach((r) => { if (r._dirty) r._rev = (r._rev || 0) + 1; }));
    if (D.settings._dirty) D.settings._rev = (D.settings._rev || 0) + 1;
    D.devices = D.devices || {}; D.devices[DEVICE] = { name: deviceName(), nick: devInfo().nick || null, model: devInfo().dev || null, phone: devInfo().phone || null, last: Date.now(), ver: APP_VERSION.split(' ')[0] }; delete D._devDirty;
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
    if ((srv.format || 1) > DATA_FORMAT) throw new Error('A newer version of the app saved the data — tap ⟳ to update this device');
    (srv.businesses || []).forEach((s) => { if (Array.isArray(s.farms) && !s.farms.length && Array.isArray(s.farmLinks)) delete s.farms; });
    D.farms = D.farms || [];
    const delSrv = new Map((srv.deleted || []).map((x) => [x.id, x]));
    const delLocal = new Set((D.deleted || []).map((x) => x.id));
    const conflicts = D.conflicts || (D.conflicts = []);
    let changes = 0;
    KINDS.forEach((k) => {
      const local = new Map((D[k] || []).map((r) => [r.id, r]));
      const out = [];
      (srv[k] || []).forEach((s) => {
        if (delLocal.has(s.id)) return; // deleted here; our tombstone goes up with the upload
        const l = local.get(s.id); local.delete(s.id);
        if (!l) { out.push(s); changes++; return; }
        if (!l._dirty) { if ((s._rev || 0) !== (l._rev || 0) || s._u !== l._u) { changes++; adopt(l, s); } out.push(l); return; } // update in place so open screens keep the same record
        if ((s._rev || 0) === (l._rev || 0)) { out.push(l); return; } // only changed here
        if (JSON.stringify({ ...strip(l), _rev: 0, _u: 0, _dev: 0 }) === JSON.stringify({ ...s, _rev: 0, _u: 0, _dev: 0 })) { out.push(adopt(l, s)); return; } // same edit both sides
        // changed on both devices → keep theirs, but never lose a link added on this device (a new farm / business link); park the rest for the user to choose
        const mine0 = JSON.parse(JSON.stringify(strip(l))), mineAt0 = l._u;
        { const lk = k === 'businesses' ? 'farmLinks' : k === 'contacts' ? 'links' : null; const idk = k === 'businesses' ? 'fid' : 'bid';
          if (lk) { const theirs = (s[lk] || []), have = new Set(theirs.map((x) => x[idk])); const add = (l[lk] || []).filter((x) => !have.has(x[idk])); const merged = { ...s, [lk]: [...theirs, ...add] };
            const rest = (o) => JSON.stringify({ ...strip(o), [lk]: 0, _rev: 0, _u: 0, _dev: 0, _dirty: 0 }); const same = rest(l) === rest(merged);
            if (add.length) { adopt(l, merged); l._dirty = true; } else adopt(l, s); out.push(l); changes++; if (same) return; } }
        for (let q = conflicts.length - 1; q >= 0; q--) if (conflicts[q].key === k + ':' + s.id) conflicts.splice(q, 1);
        conflicts.push({ key: k + ':' + s.id, kind: k, id: s.id, who: k === 'contacts' ? fullName(s) : k === 'farms' ? farmLabel(s) : s.name, mine: mine0, mineAt: mineAt0, theirsAt: s._u, theirsDev: s._dev });
        if (!(k === 'businesses' || k === 'contacts')) out.push(adopt(l, s)); changes++;
      });
      local.forEach((l) => {
        if (delSrv.has(l.id)) { if (l._dirty) conflicts.push({ key: k + ':' + l.id, kind: k, id: l.id, who: k === 'contacts' ? fullName(l) : k === 'farms' ? farmLabel(l) : l.name, mine: strip(l), mineAt: l._u, deletedElsewhere: true }); changes++; return; }
        if (!l._dirty && l._rev) l._dirty = true; // missing from server without a tombstone: put it back
        out.push(l);
      });
      D[k] = out;
    });
    if (srv.settings) { const ss = srv.settings, ls = D.settings;
      if (!ls._dirty || !D.sync.version || (ss._u || 0) > (ls._u || 0)) D.settings = ss; // first sync on a device always takes the shared settings
      else { const m = { ...ss, ...ls }; Object.keys(ss).forEach((k) => { if (!(k in ls) || ls[k] == null) m[k] = ss[k]; }); D.settings = m; } } // keep settings only the other devices have (e.g. the Maps key, one-time update flags)
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
        if (changes || !S.migDone) { S.migDone = true; photoCache.clear(); JOBS_CACHE = null; reindex(); logChanges(); migrate(); logChanges('Automatic update'); baseline(); renderAll(); if (pendingCount()) this.soon(); }
        break;
      }
      save(); this.set(D.conflicts.length ? 'conflict' : 'ok'); if (!D.settings.bigMove1) setTimeout(bigMigrate, 800);
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
  <div class="kv" style="align-items:center"><div class="k">Google account</div><div class="v">${h(practiceAccount())} <span class="hint">· every device signs in with this account${D.sync.email && D.sync.email.toLowerCase() !== practiceAccount().toLowerCase() ? ' — <b style="color:var(--red)">this device is signed in as ' + h(D.sync.email) + '</b>' : !GAuth.valid() ? ' — this device needs to sign in' : ''}</span></div><button class="btn small" data-act="gacct-edit">Change</button></div>
  <div class="kv"><div class="k">Google Drive</div><div class="v">${D.sync.fileId ? 'Connected' : 'Not connected'}${D.sync.last ? ` · last synced ${new Date(D.sync.last).toLocaleString('en-AU')}` : ''}</div></div>
  <div class="kv"><div class="k">Changes waiting</div><div class="v">${pendingCount()}</div></div>
  ${Sync.msg ? `<div class="kv"><div class="k">Last error</div><div class="v" style="color:var(--red)">${h(Sync.msg)}</div></div>` : ''}
  <div class="actions" style="margin-top:8px"><button class="btn primary" data-act="sync-now">Sync now</button>${D.sync.email ? '<button class="btn" data-act="g-signout">Sign out</button>' : ''}</div>
  <div class="lbl" style="margin-top:14px">Google Contacts (caller photos on the phones)</div>
  <label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0"><input type="checkbox" data-act="gpush-toggle" ${gp.on ? 'checked' : ''} ${S.admin ? '' : 'disabled title="Only the admin can change this"'}> <span>This device keeps Google Contacts up to date ${S.admin ? '<span class="setlock fixed" style="font-size:11px;padding:1px 7px">🔒 Admin only</span>' : '<button type="button" class="setlock" style="font-size:11px;padding:1px 7px" data-act="admin-unlock" title="Unlock admin">🔒 Admin only — unlock</button>'}<br><span class="hint">Turn this on for one device only — the office computer is best. It copies names, numbers, emails, business and the tag photo (with CHECK WARNING) to bovitechvetservices@gmail.com, so the phones show the right photo when a client rings.</span></span></label>
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
function conflictLock() { /* a sync clash blocks the app until it's sorted — full screen, showing exactly what's different */
  const cfs = (D && D.conflicts) || []; let ov = $('#confov'); if (!cfs.length) { if (ov) { ov.remove(); toast('✓ All sync clashes sorted'); } return; }
  const sig = cfs.map((c) => c.key).join('|'); if (ov && ov.dataset.sig === sig) return; const sc = ov ? ov.querySelector('.confbox').scrollTop : 0; if (!ov) { ov = document.createElement('div'); ov.id = 'confov'; document.body.appendChild(ov); } ov.dataset.sig = sig;
  const show = cfs.slice(0, 15); const kindN = (k) => (k === 'businesses' ? '🏢 Business' : k === 'farms' ? '🐄 Farm' : k === 'contacts' ? '👤 Contact' : k === 'settings' ? '⚙️ Settings' : k);
  ov.innerHTML = `<div class="confbox"><h2 style="margin:0 0 4px">⚠ Sync clash — please sort this out first</h2><div class="hint" style="margin-bottom:8px">${cfs.length === 1 ? 'A record was' : cfs.length + ' records were'} changed on two devices before they synced. For each one, choose which version to keep. The app can be used again once they're all sorted.</div>
    ${cfs.length > 1 ? `<div class="actions" style="margin-bottom:8px"><button class="btn small primary" data-act="conflict-all" data-v="mine">Keep this device's version for all ${cfs.length}</button><button class="btn small" data-act="conflict-all" data-v="theirs">Keep the other device's version for all ${cfs.length}</button></div>` : ''}
    ${show.map((cf) => `<div class="card" style="margin:8px 0"><div style="font-weight:700;font-size:16px">${kindN(cf.kind)}: ${h(cf.who || cf.id)}</div>${conflictDiff(cf)}</div>`).join('')}
    ${cfs.length > show.length ? `<div class="hint">…and ${cfs.length - show.length} more. They show here as you sort these ones, or use the "for all" buttons above.</div>` : ''}</div>`;
  ov.querySelector('.confbox').scrollTop = sc; }
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
  if (!b) { b = { id: uid('b'), name: fullName(c), farmLinks: [], pics: [], patientIds: [], info: '', warnings: '', flags: [], rating: null, cats: [], createdAt: Date.now() }; D.businesses.push(b); touch(b); reindex(); if (cat) setBizCat(b, cat); }
  else if (!bizCat(b) && cat) setBizCat(b, cat);
  setBizType(b, kind === 'client' ? 'client' : 'nonclient');
  if (c.dnaReason && !b.dnaReason) b.dnaReason = c.dnaReason; if (c.inactiveReason && !b.inactiveReason) b.inactiveReason = c.inactiveReason;
  convertBizOnly(c, b); return b;
}
function obRow(p, b, allowRename) { // one part of a business name in the "Sort out business name" screen
  const ex = p.role || !p.text ? null : findBizByText(p.text, b.id); const def = p.role ? 'role' : ex ? (p.past ? 'existing-past' : 'existing') : !p.text || p.past ? (p.past ? 'find-past' : 'find') : allowRename ? 'rename' : (isClientBiz(b) ? 'newclient' : 'newind');
  const o = (v, l) => `<option value="${v}" ${def === v ? 'selected' : ''}>${l}</option>`;
  return `<div class="card ob-row" data-rid="${uid('r')}" ${p.roleForPrev ? 'data-forprev="1"' : ''} style="padding:10px;margin-bottom:8px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input class="ob-text" value="${h(p.text || '')}" style="flex:2;min-width:180px;padding:9px;border:1px solid var(--line);border-radius:9px"><select class="ob-what" style="flex:2;min-width:240px;padding:9px;border:1px solid var(--line);border-radius:9px">
    ${o('rename', `Rename "${h(b.name.slice(0, 30))}…" to this (keeps its farms, PICs, IDs)`)}
    ${ex ? o('existing', `Existing: ${h(ex.name)} — current employee`) + o('existing-past', `Existing: ${h(ex.name)} — past employee`) : ''}
    ${o('find', 'Find an existing business — current employee…')}${o('find-past', 'Find an existing business — past employee…')}
    ${o('newclient', 'New client business')}${o('newind', 'New non-client (industry) business')}
    ${o('role', 'Not a business — a role')}<option value="skip">Ignore</option></select></div>
    <input type="hidden" class="ob-ex" value="${ex ? ex.id : ''}"><div class="ob-findwrap" style="margin-top:6px;${def.startsWith('find') ? '' : 'display:none'}"><div class="hint ob-chosen">${ex && def.startsWith('find') ? 'Chosen: ' + h(ex.name) : 'No business chosen yet — search below.'}</div><input class="ob-find" value="${def.startsWith('find') && p.text ? h(p.text) : ''}" placeholder="Search businesses…" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:9px;margin-top:4px"><div class="ob-findres"></div></div>
    <div class="ob-rolewrap" style="margin-top:6px;${def === 'role' ? '' : 'display:none'}"><label class="hint" style="display:block;margin-bottom:2px">This role is at…</label><select class="ob-rolefor" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:9px"></select></div></div>`;
}
function obRefreshRoles() { /* the "role is at…" choices follow the business parts on screen */
  const rows = [...document.querySelectorAll('#ob-rows .ob-row')]; const label = (r) => { const w = r.querySelector('.ob-what').value; const ex = IDX.biz.get(r.querySelector('.ob-ex').value); return (w.startsWith('find') || w.startsWith('existing')) && ex ? ex.name : r.querySelector('.ob-text').value.trim() || '(unnamed part)'; };
  const bizRows = rows.filter((r) => !['role', 'skip'].includes(r.querySelector('.ob-what').value));
  rows.forEach((r) => { const isRole = r.querySelector('.ob-what').value === 'role'; r.querySelector('.ob-rolewrap').style.display = isRole ? '' : 'none'; if (!isRole) return;
    const sel = r.querySelector('.ob-rolefor'); let cur = sel.value || (bizRows.length === 1 ? bizRows[0].dataset.rid : ''); if (!sel.value && r.dataset.forprev && r.previousElementSibling && r.previousElementSibling.dataset.rid) cur = r.previousElementSibling.dataset.rid;
    sel.innerHTML = `${bizRows.length > 1 ? '<option value="">Every business kept</option>' : ''}${bizRows.map((br) => `<option value="${br.dataset.rid}">${h(label(br))}${br.querySelector('.ob-what').value.endsWith('past') ? ' (past)' : ''}</option>`).join('')}<option value="general">No particular business (their general Role)</option>`;
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : sel.options[0].value; });
}
document.addEventListener('change', (e) => { if (e.target.closest && e.target.closest('#ob-rows') && !e.target.classList.contains('ob-rolefor')) obRefreshRoles(); });
document.addEventListener('input', (e) => { if (e.target.classList && e.target.classList.contains('ob-text')) obRefreshRoles(); });
document.addEventListener('change', (e) => { if (!e.target.classList.contains('ob-what')) return; const row = e.target.closest('.ob-row'); const f = e.target.value.startsWith('find'); row.querySelector('.ob-findwrap').style.display = f ? '' : 'none'; if (f) { row.querySelector('.ob-ex').value = ''; row.querySelector('.ob-chosen').textContent = 'No business chosen yet — search below.'; row.querySelector('.ob-find').focus(); } });
document.addEventListener('input', (e) => { if (!e.target.classList.contains('ob-find')) return; const row = e.target.closest('.ob-row'); const pq = parseQuery(e.target.value); let res = pq.inc.length ? D.businesses.filter((x) => x.id !== S.obBid && matchQ(bizHay(x), pq)).slice(0, 8) : []; if (!res.length && pq.inc.length) { const pre = pq.inc.map((w) => w.replace(/s$/, '').slice(0, Math.max(2, Math.min(w.length, 4)))); res = D.businesses.filter((x) => x.id !== S.obBid && pre.every((w) => x.name.toLowerCase().split(/[^a-z0-9]+/).some((nw) => nw.startsWith(w)))).slice(0, 8); } /* 'Mt Barker Vets' still finds 'Mt Barker Veterinary Hospital' */
  row.querySelector('.ob-findres').innerHTML = e.target.value.trim() ? `<div class="results">${res.map((x) => `<div data-act="ob-findpick" data-id="${x.id}"><b>${h(x.name)}</b> <span class="hint">${isClientBiz(x) ? 'client' : 'non-client'} · ${(IDX.bizContacts.get(x.id) || []).length} contacts</span></div>`).join('') || '<div class="hint">No matches.</div>'}</div>` : ''; });
function oddBizSheet(b, mode) { /* mode: 'role' = the whole name is a role; 'multi' = several businesses */
  if (!b) return; const cs = IDX.bizContacts.get(b.id) || []; let parts = mode === 'role' ? [{ text: b.name, role: true }, { text: '' }] : parseBizName(b.name);
  if (mode === 'multi' && parts.length < 2) parts = [...parts, { text: '' }];
  const hasStuff = b.farms.length || b.pics.length || b.patientIds.length; let renamed = false;
  S.obBid = b.id; let renamed2 = false; const row = (p) => { const r = obRow(p, b, !renamed2); if (r.includes('value="rename" selected')) renamed2 = true; return r; };
  const body = `<p>Current name: <b>${h(b.name)}</b></p>${mode === 'role' ? '<div class="hint" style="margin-bottom:8px"><b>Not a business — a role.</b> The name becomes the ticked contacts\' role. If they work for a business, search for it in the second part (or tap Ignore on it). Any phone, email or notes on this entry move to that business, or to the first ticked contact.</div>' : ''}<div class="hint" style="margin-bottom:8px">I've split the name into its parts — check each one. Every contact ticked below is linked to each business you keep. For a role, choose which business it's at.</div>
    <div id="ob-rows">${parts.map(row).join('')}</div><button type="button" class="btn small" data-act="ob-add">➕ Add a part</button>
    <div class="f" style="margin-top:12px"><span class="lbl">Contacts at this business</span><div class="checks">${cs.map((c) => `<label><input type="checkbox" class="ob-c" value="${c.id}" checked>${h(fullName(c))}</label>`).join('') || '<span class="hint">No contacts linked.</span>'}</div></div>
    ${hasStuff ? '<div class="hint">This business has farms, PICs or patient IDs, so one part must be "Rename … to this".</div>' : '<div class="hint">If no part is "Rename … to this", the old business goes to the trash once its contacts are linked to the other businesses.</div>'}`;
  setTimeout(() => { obRefreshRoles(); document.querySelectorAll('#ob-rows .ob-find').forEach((x) => { if (x.value) x.dispatchEvent(new Event('input', { bubbles: true })); }); }, 0);
  openSheet('Sort out business name', body, () => {
    const rows = [...document.querySelectorAll('#ob-rows .ob-row')].map((r) => ({ rid: r.dataset.rid, text: r.querySelector('.ob-text').value.trim() || (IDX.biz.get(r.querySelector('.ob-ex').value) || {}).name || '', what: r.querySelector('.ob-what').value, ex: (r.querySelector('.ob-ex') || {}).value, rolefor: (r.querySelector('.ob-rolefor') || {}).value || '' })).filter((r) => r.text && r.what !== 'skip');
    if (rows.some((r) => r.what.startsWith('find') && !IDX.biz.get(r.ex))) { toast('Search and pick the existing business for each "Find…" part'); return false; }
    const ren = rows.filter((r) => r.what === 'rename'); if (ren.length > 1) { toast('Only one part can be the rename'); return false; } if (!ren.length && hasStuff) { toast('Choose which part this business is renamed to (it has farms, PICs or IDs)'); return false; }
    if (!rows.some((r) => r.what !== 'role') && (hasStuff || mode !== 'role')) { toast(hasStuff ? 'This business has farms, PICs or IDs — one part must be a business' : 'At least one part must be a business'); return false; }
    const ticked = [...document.querySelectorAll('#sheet .ob-c')].filter((x) => x.checked).map((x) => D.contacts.find((c) => c.id === x.value)).filter(Boolean);
    const targets = [], pastTargets = [], ridOf = new Map();
    rows.forEach((r) => { if (r.what === 'rename') { b.name = r.text; touch(b); targets.push(b); ridOf.set(b, r.rid); }
      else if (r.what === 'existing' || r.what === 'find') { const x = IDX.biz.get(r.ex); if (x) { targets.push(x); ridOf.set(x, r.rid); } }
      else if (r.what === 'existing-past' || r.what === 'find-past') { const x = IDX.biz.get(r.ex); if (x) { pastTargets.push(x); ridOf.set(x, r.rid); } }
      else if (r.what === 'newclient' || r.what === 'newind') { const nb = { id: uid('b'), name: r.text, type: r.what === 'newclient' ? 'client' : 'nonclient', farmLinks: [], pics: [], patientIds: [], info: '', warnings: '', flags: [], rating: null, cats: [], createdAt: Date.now() }; if (nb.type === 'nonclient') { nb.primaryRequired = false; nb.cats = ['industry']; } else if (bizCat(b)) setBizCat(nb, bizCat(b)); touch(nb); D.businesses.push(nb); touch(nb); targets.push(nb); ridOf.set(nb, r.rid); } });
    const roleRows = rows.filter((r) => r.what === 'role'); const anyBiz = targets.length || pastTargets.length;
    const roleAtBiz = (t) => roleRows.filter((r) => r.rolefor === ridOf.get(t) || (r.rolefor === '' && anyBiz)).map((r) => r.text).join(', ');
    const general = roleRows.filter((r) => r.rolefor === 'general' || !anyBiz).map((r) => r.text).join(', ');
    reindex();
    ticked.forEach((c) => { const prev = catOf(c);
      const put = (t, past) => { const rl = roleAtBiz(t); let l = c.links.find((x) => x.bid === t.id); if (!l) { l = past ? { bid: t.id, past: true } : { bid: t.id }; c.links.push(l); } else if (!past && l.past) delete l.past; if (rl) l.role = rl; };
      targets.forEach((t) => put(t, false)); pastTargets.forEach((t) => put(t, true));
      if (!ren.length) c.links = c.links.filter((l) => l.bid !== b.id);
      if (general && !(c.role || '').toLowerCase().includes(general.toLowerCase())) c.role = c.role ? c.role + ', ' + general : general;
      reindex(); if (prev) setOne(c, prev); touch(c); });
    if (!ren.length && !(IDX.bizContacts.get(b.id) || []).filter((c) => !ticked.includes(c)).length) { carryBizDetails(b, targets[0] || ticked[0]); reindex(); trashBiz(b); }
    S.sel = { kind: 'business', id: (targets[0] || pastTargets[0] || b).id }; NEXT_LOG_LABEL = `Sorted out business name "${parts.map((p) => p.text).join(' / ')}"`; return true;
  });
}
function carryBizDetails(b, dest) { /* a business entry that is going away: keep its phone, email and notes */
  if (!dest) return; const isB = !!dest.farms; const same = (a, v) => a.some((x) => x.value.replace(/\s/g, '') === v.replace(/\s/g, ''));
  (b.phones || []).forEach((p) => { if (isB) { dest.phones = dest.phones || []; if (!same(dest.phones, p.value)) dest.phones.push({ ...p }); } else { const mob = /^(\+?61\s?4|04)/.test(p.value.replace(/\s/g, '')); const arr = mob ? dest.mobiles : dest.landlines; if (!same([...dest.mobiles, ...dest.landlines], p.value)) arr.push({ label: p.label || (mob ? 'Mobile' : 'Work'), value: p.value }); } });
  (b.emails || []).forEach((p) => { dest.emails = dest.emails || []; if (!same(dest.emails, p.value)) dest.emails.push({ ...p }); });
  const join = (x, y) => [x, y].filter((t) => (t || '').trim()).join('\n\n');
  if ((b.info || '').trim() && !(dest.info || '').includes(b.info.trim())) { dest.info = join(dest.info, b.info); delete dest.infoHtml; }
  mergeNotes(dest, b, dest.links ? 'contact' : 'business', 'business');
  touch(dest);
}
function convertBizOnly(c, b) { // contact that was really just the business → its details move onto the business
  const ph = [...c.mobiles.map((p) => ({ label: p.label || 'Mobile', value: p.value })), ...c.landlines.map((p) => ({ label: p.label || 'Phone', value: p.value }))], em = c.emails.map((p) => ({ label: p.label || '', value: p.value }));
      const has = (arr, v) => arr.some((x) => x.value.replace(/\s/g, '') === v.replace(/\s/g, ''));
      b.phones = b.phones || []; ph.forEach((p) => { if (!has(b.phones, p.value)) b.phones.push(p); }); b.emails = b.emails || []; em.forEach((p) => { if (!has(b.emails, p.value)) b.emails.push(p); });
      b.postal = [...new Set([...(b.postal || []), ...c.postal])];
      const join = (x, y) => [x, y].filter((t) => (t || '').trim()).join('\n\n');
      if ((c.info || '').trim()) { b.info = join(b.info, c.info); delete b.infoHtml; } mergeNotes(b, c, 'business', 'contact');
      if (c.gid && !b.gid) b.gid = c.gid; // keep the same Google Contacts entry for caller ID
      if (b.primaryContact === c.id) b.primaryContact = null; touch(b);
  trashContact(c);
}
function bizPseudo(b) { return { id: 'b:' + b.id, _biz: b, gid: b.gid, first: b.name, middle: '', last: '', role: '', links: [{ bid: b.id }], tags: [], ownCats: false, mobiles: (b.phones || []).filter((p) => /^(\+?61\s?4|04)/.test(p.value.replace(/\s/g, ''))).map((p) => ({ ...p })), landlines: (b.phones || []).filter((p) => !/^(\+?61\s?4|04)/.test(p.value.replace(/\s/g, ''))).map((p) => ({ ...p })), emails: (b.emails || []).map((p) => ({ ...p })), postal: [], warnings: '', photoChoice: b.photoChoice || 'auto', flags: [] }; }
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
      addresses: [...(c._biz ? [c._biz] : bs).flatMap((b) => b.farms.filter((f) => !(b.farmLinks.find((l) => l.fid === f.id) || {}).past && f.address).map((f) => ({ streetAddress: f.address, type: (f.name || 'Farm').slice(0, 60) }))), ...(c.postal || []).filter(Boolean).map((x) => ({ streetAddress: typeof x === 'string' ? x : x.value || '', type: 'Postal' }))].filter((a, i, arr) => a.streetAddress && arr.findIndex((y) => y.streetAddress === a.streetAddress && y.type === a.type) === i),
    };
    return p;
  },
  spec(c) { const g = D.settings.gpush || {}; const sp = photoSpec(c); if (g.warnRing === false) sp.warn = false; if (g.split === false && sp.parts && sp.parts.length > 1) sp.parts = sp.parts.slice(0, 1).map((x) => ({ tag: x.tag })); return sp; },
  hash(c) { const s = JSON.stringify([this.person(c), this.spec(c)]); let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return x.toString(36); },
  maybeRun() { if (this.st.on && !this.running && GAuth.valid()) this.run(); },
  async run() {
    if (this.running) return; this.running = true;
    const skip = new Set((D.settings.gpush || {}).skip || []);
    const todo = [...D.contacts.filter((c) => !noDet(c)), ...D.businesses.filter((b) => bizHasDetails(b) && (!isClientBiz(b) || !(IDX.bizContacts.get(b.id) || []).length)).map(bizPseudo)].filter((c) => !skip.has(catOf(c)) && this.st.done[c.id] !== this.hash(c));
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
      const r = await this.api(`https://people.googleapis.com/v1/${gid}:updateContact?updatePersonFields=names,phoneNumbers,emailAddresses,organizations,addresses`, { method: 'PATCH', body: JSON.stringify({ ...body, etag }) });
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
  else if (a === 'gpush-toggle') { if (!S.admin) { el.checked = !el.checked; needAdmin(); return; } GContacts.st.on = el.checked; GContacts.persist(); renderAll(); if (el.checked) { await Sync.run(true); GContacts.maybeRun(); } }
  else if (a === 'gpush-now') { try { await GAuth.get(true); GContacts.run(); toast('Updating Google Contacts in the background'); } catch (err) { toast(err.message); } }
  else if (a === 'conflict-open') { const cf = D.conflicts.find((x) => x.key === d.key); if (cf) conflictSheet(cf); }
  else if (a === 'conflict-all') { if (!(await ask(`Keep ${d.v === 'mine' ? "this device's" : "the other device's"} version for all ${(D.conflicts || []).length} clashes?`, 'Yes — keep them'))) return; [...(D.conflicts || [])].forEach((cf) => resolveConflict(cf.key, d.v)); S.skipConfirm = true; changed(); toast('Clashes resolved'); Sync.soon(); }
  else if (a === 'conflict-keep') { resolveConflict(d.key, d.v); if (SHEET) closeSheet(); S.skipConfirm = true; changed(); toast('Conflict resolved'); Sync.soon(); }
});

/* ---------------- advanced search ---------------- */
const ADV_FIELDS = [['name', 'Name'], ['business', 'Business name'], ['role', 'Role / position'], ['phone', 'Phone numbers'], ['email', 'Email'], ['postal', 'Postal address'], ['farm', 'Farm name / address / info'], ['pic', 'Property Identification Code (PIC)'], ['pid', 'Patient ID'], ['info', 'General info'], ['warnings', 'Warnings (general + farm)'], ['side', 'Side notes'], ['tags', 'Tag names']];
const ADV_MISSING = [['email', 'No email'], ['phone', 'No phone number'], ['mobile', 'No mobile'], ['business', 'No business'], ['pin', 'No farm GPS pin'], ['km', 'A farm with no km'], ['pic', 'No PIC'], ['pid', 'No patient ID'], ['rating', 'No A+ to C category'], ['primary', 'Business has no primary contact']];
function advSel() { const v = (S.adv.sel || []).filter((x) => ['people', 'biz', 'loc'].includes(x)); return v.length === 3 ? [] : v; } // [] = search all
function advSync() { const A = S.adv, sel = advSel(); const one = (arr) => (arr && arr.length === 1 ? arr[0] : '');
  A.kind = sel.length !== 1 ? 'all' : sel[0] === 'people' ? 'people' : sel[0] === 'loc' ? 'loc' : one(A.bsubs) || 'bizall'; A.psub = one(A.psubs); }
const advShows = (k) => { const sel = advSel(); return !sel.length || sel.includes(k); };
function advDefault() { return { all: '', any: '', none: '', phrase: '', fields: [], tAll: [], tAny: [], tNone: [], warn: '', farmWarn: '', starred: '', multi: '', split: '', flagged: '', isPrimary: '', btype: '', missing: [], kmOp: '', kmVal: '', kmOp2: '', kmVal2: '', minOp: '', minVal: '', minOp2: '', minVal2: '', nearKm: '', near: { type: 'home' }, sort: 'first', lkind: '', lpin: '', lsafe: '', lrec: '', lcur: 'yes' }; }
S.adv = advDefault(); S.adv.sel = S.adv.kind && S.adv.kind !== 'all' ? [S.adv.kind === 'loc' ? 'loc' : S.adv.kind === 'people' ? 'people' : 'biz'] : []; advSync();
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
  if (!yn(A.starred, isFav(c))) return false;
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

/* ---------------- Search & Bulk Edit: locations, and search everything ---------------- */
function locKind(f) { return isYardType(f.pinType) ? 'yard' : 'other'; }
function advLocMatch(f, A) {
  const us = farmUsersOf(f.id); if (!us.length) return false; const cur = us.filter((u) => !u.past);
  if ((A.lcur || 'yes') === 'yes' && !cur.length) return false; if (A.lcur === 'no' && cur.length) return false;
  const hay = [f.name, f.aka, f.address, f.info, f.warning, f.biosec, (f.access || {}).notes, (f.reception || {}).note, (f.safety || {}).note, pinT(f.pinType).name, ...(f.extra || []).map((x) => (x.name || '') + ' ' + pinT(x.type).name), ...us.map((u) => u.b.name + ' ' + (u.b.biosec || ''))].join(' ').toLowerCase();
  const wAll = words(A.all), wAny = words(A.any), wNone = words(A.none), ph = (A.phrase || '').trim().toLowerCase();
  if (wAll.length && !wAll.every((w) => hay.includes(w))) return false; if (wAny.length && !wAny.some((w) => hay.includes(w))) return false;
  if (wNone.length && wNone.some((w) => hay.includes(w))) return false; if (ph && !hay.includes(ph)) return false;
  if (A.lkind === 'turn' && !(f.turn && f.turn.lat != null)) return false; if (A.lkind === 'noturn' && f.turn && f.turn.lat != null) return false;
  if (A.lkind && !['turn', 'noturn'].includes(A.lkind) && locKind(f) !== A.lkind) return false;
  if ((A.lsubs || []).length && (A.sel || []).includes('loc') && !A.lsubs.some((x) => (x === 'turn' ? f.turn && f.turn.lat != null : locKind(f) === x))) return false;
  if (A.lpin && f.pinType !== A.lpin && !(f.extra || []).some((x) => x.type === A.lpin)) return false;
  if (A.lsafe && ((f.safety || {}).status || 'ok') !== A.lsafe) return false;
  if (A.lrec && ((f.reception || {}).status || 'unknown') !== A.lrec) return false;
  if (A.btype && !us.some((u) => (A.btype === 'client') === isClientBiz(u.b))) return false;
  const yn = (v, cond) => (v === '' ? true : v === 'yes' ? cond : !cond);
  if (!yn(A.farmWarn, !!f.seeWarning)) return false;
  for (const m of A.missing || []) { if (m === 'pin' && f.lat != null) return false; if (m === 'km' && f.kmReturn != null) return false; }
  const cmp = (op, a, c) => (op === '<' ? a < c : op === '≤' ? a <= c : op === '>' ? a > c : op === '≥' ? a >= c : op === '=' ? Math.abs(a - c) < 0.5 : true);
  for (const [o, v, field] of [['kmOp', 'kmVal', 'kmReturn'], ['kmOp2', 'kmVal2', 'kmReturn'], ['minOp', 'minVal', 'driveMin'], ['minOp2', 'minVal2', 'driveMin']]) if (A[o] && A[v] !== '' && !(f[field] != null && cmp(A[o], f[field], +A[v]))) return false;
  if (A.nearKm !== '') { const ctr = advCentre(A); if (ctr && !(f.lat != null && hav(ctr, f) <= +A.nearKm)) return false; }
  return true;
}
function advLocResults() { return D.farms.filter((f) => advLocMatch(f, S.adv)).sort((a, b) => alphaCmp(farmLabel(a), farmLabel(b))); }
function locRowLi(f, sel) { const us = farmUsersOf(f.id); const sf = f.safety || {};
  return `<li class="item ${sel && S.advLSel.has(f.id) ? 'jobsel' : ''}" data-act="loc-open" data-bid="${(IDX.farmBiz.get(f.id) || us[0].b).id}" data-fid="${f.id}">${sel ? `<input type="checkbox" class="jobcheck" data-act="advl-sel" data-id="${f.id}" ${S.advLSel.has(f.id) ? 'checked' : ''} aria-label="Select">` : ''}<div class="av locav">${pinT(f.pinType).emoji}</div><div class="t"><div class="n">${h(f.name || pinT(f.pinType).name)}${sf.status && sf.status !== 'ok' ? (sf.status === 'stop' ? ' ⛔' : ' ⚠') : ''}${farmBiosecOf(f).length ? ' 🦠' : ''}</div><div class="s">${h(us.map((u) => u.b.name + (u.past ? ' (not current)' : '')).join(', '))} · ${h(pinT(f.pinType).name)}${f.kmReturn != null ? ' · ' + f.kmReturn + ' km' : ''}${f.lat == null ? ' · <b>no pin</b>' : ''}${f.reception && f.reception.status ? ' · 📶 ' + RECEPTION[f.reception.status] : ''}</div></div></li>`; }
function renderAdvLocResults() {
  const r = advLocResults(); S.advLSel = S.advLSel || new Set(); const ids = new Set(r.map((f) => f.id)); [...S.advLSel].forEach((id) => { if (!ids.has(id)) S.advLSel.delete(id); });
  const nSel = S.advLSel.size;
  let html = `<div class="card"><h3><input type="checkbox" class="jobcheck" data-act="advl-selall" title="Select all results" ${nSel && nSel === r.length ? 'checked' : ''}><span class="sp">${r.length} location${r.length === 1 ? '' : 's'} found${nSel ? ` · ${nSel} selected` : ''}</span></h3>
  ${nSel ? `<div class="bulkbar" style="border-radius:9px;margin:0 0 8px;justify-content:space-between"><b>${nSel} selected</b><span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn primary" data-act="advl-edit" style="font-size:16px">✏️ Edit selected…</button><button class="btn" data-act="bulk-rename" data-k="farm">🔤 Rename…</button><button class="btn" data-act="advl-map">🗺 Show on map</button><button class="btn" data-act="advl-route">➕ Add to route</button><button class="btn" data-act="advl-selnone">Clear selection</button></span></div>` : `<div class="actions" style="margin:0 0 8px"><button class="btn small" data-act="advl-map">🗺 Show all of these on the map</button></div>`}<ul class="list">`;
  r.slice(0, 300).forEach((f) => { html += locRowLi(f, true); });
  if (r.length > 300) html += `<li class="empty">Showing the first 300 — narrow the search.</li>`; if (!r.length) html += '<li class="empty">No locations match.</li>';
  return html + '</ul></div>';
}
function renderAdvAllResults() {
  const bsub = (S.adv.bsubs || []).length === 1 && advSel().includes('biz') ? S.adv.bsubs[0] : '';
  const ps = advShows('people') ? advResults() : [], bs = advShows('biz') ? D.businesses.filter((b) => (!bsub || (bsub === 'client') === isClientBiz(b)) && advBizMatch(b, S.adv)).sort((a, b) => alphaCmp(a.name, b.name)) : [], ls = advShows('loc') ? advLocResults() : [];
  const sec = (title, n, kind, rows) => `<div class="card"><h3><span class="sp">${title} (${n})</span>${n ? `<button class="btn small" data-act="adv-kind" data-v="${kind}">Bulk edit these →</button>` : ''}</h3><ul class="list">${rows || '<li class="empty">None.</li>'}${n > 40 ? `<li class="empty">…and ${n - 40} more — tap "Bulk edit these" to see them all.</li>` : ''}</ul></div>`;
  return `<div class="hint" style="margin-bottom:8px">Everything that matches. To bulk edit, tap "Bulk edit these" on a section.</div>
  ${!advShows('people') ? '' : sec('👤 People', ps.length, 'people', ps.slice(0, 40).map((c) => `<li class="item" data-act="open" data-kind="contact" data-id="${c.id}">${contactPhotoImg(c, '', 120)}<div class="t"><div class="n">${h(fullName(c))}</div><div class="s">${h(bizOf(c).map((b) => b.name).join(', '))}</div></div></li>`).join(''))}
  ${!advShows('biz') ? '' : sec('🏢 Businesses', bs.length, bsub || 'bizall', bs.slice(0, 40).map(bizRowHtml).join(''))}
  ${!advShows('loc') ? '' : sec('📍 Pins', ls.length, 'loc', ls.slice(0, 40).map((f) => locRowLi(f, false)).join(''))}`;
}
function advLocEditSheet() {
  const list = D.farms.filter((f) => S.advLSel.has(f.id)); if (!list.length) return;
  const opt = (o, v) => o.map(([k, l]) => `<option value="${h(k)}">${h(l)}</option>`).join('');
  const body = `<div class="hint" style="margin-bottom:8px">Editing: ${h(list.slice(0, 8).map(farmLabel).join(', '))}${list.length > 8 ? ` and ${list.length - 8} more` : ''}</div>
  <div class="lbl" style="font-size:15px">1. What do you want to change?</div>
  <label class="bkop"><input type="radio" name="blop" value="pin"><span><b>Set pin type</b> <select id="bl-pin">${pinTypes().map((t) => `<option value="${h(t.id)}">${t.emoji} ${h(t.name)}</option>`).join('')}</select></span></label>
  <label class="bkop"><input type="radio" name="blop" value="rec"><span><b>Set mobile reception</b> <select id="bl-rec">${opt(Object.entries(RECEPTION))}</select></span></label>
  <label class="bkop"><input type="radio" name="blop" value="safe"><span><b>Set safety status</b> <select id="bl-safe">${opt(Object.entries(SAFETY).map(([k, v]) => [k, v.l]))}</select><br><input id="bl-safenote" style="margin-top:4px;width:100%"></span></label>
  <label class="bkop"><input type="radio" name="blop" value="wet"><span><b>Set wet weather access</b> <select id="bl-wet">${opt(Object.entries(WET))}</select></span></label>
  <label class="bkop"><input type="radio" name="blop" value="bio"><span><b>Add a biosecurity note</b><br><input id="bl-bio" style="margin-top:4px;width:100%"></span></label>`;
  openSheet(`Edit ${list.length} location${list.length === 1 ? '' : 's'}`, body, () => {
    const op = ($('#sheet input[name=blop]:checked') || {}).value; if (!op) { toast('Choose what to change'); return false; }
    const today = new Date().toLocaleDateString('en-AU'), me = devInfo().nick;
    list.forEach((f) => {
      if (op === 'pin') f.pinType = $('#bl-pin').value;
      if (op === 'rec') { const v = $('#bl-rec').value; if (v) f.reception = { ...(f.reception || {}), status: v, at: Date.now(), by: me }; else delete f.reception; }
      if (op === 'safe') { const v = $('#bl-safe').value, n = val('bl-safenote'); if (v === 'ok' && !n) delete f.safety; else f.safety = { status: v, note: n, date: today, by: me }; }
      if (op === 'wet') { const v = $('#bl-wet').value; f.access = { ...(f.access || {}), wet: v }; if (!f.access.wet && !f.access.notes) delete f.access; }
      if (op === 'bio') { const v = val('bl-bio'); if (v && !(f.biosec || '').includes(v)) f.biosec = [f.biosec, v].filter((x) => (x || '').trim()).join('\n'); }
      touch(f);
    });
    NEXT_LOG_LABEL = `Search: ${({ pin: 'set pin type', rec: 'set reception', safe: 'set safety status', wet: 'set wet weather access', bio: 'added biosecurity note' })[op]} (${list.length} locations)`;
    if (!diffTouched(false).length) { toast('Nothing to change — they already have that'); return false; }
    S.advLSel.clear(); return true;
  });
}

function advBizResults() { const k = S.adv.kind; return D.businesses.filter((b) => (k === 'bizall' || (k === 'client') === isClientBiz(b)) && advBizMatch(b, S.adv)).sort((a, b) => alphaCmp(a.name, b.name)); }
function renderAdvBizResults() {
  const r = advBizResults(); S.advBSel = S.advBSel || new Set(); const ids = new Set(r.map((b) => b.id)); [...S.advBSel].forEach((id) => { if (!ids.has(id)) S.advBSel.delete(id); });
  const nSel = S.advBSel.size; const word = S.adv.kind === 'client' ? 'client business' : S.adv.kind === 'bizall' ? 'business' : 'non-client business';
  let html = `<div class="card"><h3><input type="checkbox" class="jobcheck" data-act="advb-selall" title="Select all results" ${nSel && nSel === r.length ? 'checked' : ''}><span class="sp">${r.length} ${word}${r.length === 1 ? '' : 'es'} found${nSel ? ` · ${nSel} selected` : ''}</span></h3>
  ${nSel ? `<div class="bulkbar" style="border-radius:9px;margin:0 0 8px;justify-content:space-between"><b>${nSel} selected</b><span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn primary" data-act="advb-edit" style="font-size:16px">✏️ Edit selected…</button><button class="btn" data-act="bulk-rename" data-k="biz">🔤 Rename…</button><button class="btn" data-act="advb-selnone">Clear selection</button></span></div>` : ''}<ul class="list">`;
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
function advResults() { const ps = (S.adv.psubs || []).length === 1 && advShows('people') && advSel().includes('people') ? S.adv.psubs[0] : ''; return sortContactsBy(D.contacts.filter((c) => advMatch(c, S.adv) && (!ps || (ps === 'client') === isClientPerson(c))), S.adv.sort); }
function sortContactsBy(arr, mode) { const keep = S.sort; S.sort = mode; const r = sortContacts(arr).map((x) => x.c); S.sort = keep; return r; }
function advTagPicker(key, label) {
  const sel = S.adv[key];
  return `<div class="f"><span class="lbl">${label}</span><div class="checks">${D.tags.map((t) => `<label><input type="checkbox" data-advtag="${key}" value="${t.id}" ${sel.includes(t.id) ? 'checked' : ''}>${h(t.name)}</label>`).join('')}</div></div>`;
}
const ynSel = (key, label) => `<div class="f"><label>${label}</label><select data-adv="${key}"><option value="">Either</option><option value="yes" ${S.adv[key] === 'yes' ? 'selected' : ''}>Yes</option><option value="no" ${S.adv[key] === 'no' ? 'selected' : ''}>No</option></select></div>`;
const OPS = [['', '—'], ['<', '< less than'], ['≤', '≤ up to'], ['=', '= exactly'], ['≥', '≥ at least'], ['>', '> more than']];
const numFilter = (label, k, ph) => { const A = S.adv; const opSel = (key) => `<select data-adv="${key}" style="padding:8px;border:1px solid var(--line);border-radius:9px;font-size:16px">${OPS.map(([v, l]) => `<option value="${v}" ${A[key] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `<div class="f"><label>${label}</label><div class="search">${opSel(k + 'Op')}<input type="number" data-adv="${k}Val" value="${h(A[k + 'Val'])}" style="flex:1;min-width:0"></div>
  <div class="search" style="margin-top:6px"><span class="hint" style="align-self:center">and</span>${opSel(k + 'Op2')}<input type="number" data-adv="${k}Val2" value="${h(A[k + 'Val2'])}" style="flex:1;min-width:0"></div></div>`; };
function renderAdvanced() {
  const A = S.adv; const nf = A.near.type === 'farm' ? IDX.farms.get(A.near.fid) : null;
  const kind = A.kind || 'people';
  return `<div class="d-wrap"><h2 class="sec-h" style="font-size:26px">${h(lab('search'))}</h2>
  <div class="card"><h3>Search for <span class="hint" style="text-transform:none;letter-spacing:0;font-weight:500">— tap as many as you like</span></h3>${(() => { const sel = advSel();
    const chip = (act, v, l, on, extra = '') => `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-v="${v}" ${extra} style="padding-right:12px">${on && v !== 'all' ? '✓ ' : ''}${l}</button>`;
    const subRow = (k, title, opts, cur) => `<div class="chips subchips wrapchips"><span class="hint" style="align-self:center;margin-right:2px">${title}:</span>${opts.map(([v, l]) => chip('adv-sub', v, l, cur.includes(v), `data-k="${k}"`)).join('')}</div>`;
    return `<div class="chips wrapchips" style="margin-top:0">${chip('adv-top', 'all', '✦ Search all', !sel.length)}${[['people', '👤 People'], ['biz', '🏢 Businesses'], ['loc', '📍 Pins']].map(([v, l]) => chip('adv-top', v, l, sel.includes(v))).join('')}</div>
      ${sel.includes('people') ? subRow('people', 'People', [['client', '👤 Client'], ['nonclient', '👥 Non-client']], A.psubs || []) : ''}
      ${sel.includes('biz') ? subRow('biz', 'Businesses', [['client', '🏡 Client'], ['nonclient', '🏢 Non-client']], A.bsubs || []) : ''}
      ${sel.includes('loc') ? subRow('loc', 'Pins', [['yard', '🐄 Yards'], ['turn', turnPin().emoji + ' ' + h(turnName())], ['other', '🏬 Non-farm']], A.lsubs || []) : ''}
      <div class="hint" style="margin-top:6px">${!sel.length ? 'Searching people, businesses and pins.' : 'Nothing ticked underneath = all of them.'}</div>`; })()}</div>

  <div class="actions" style="margin:-4px 0 10px"><button class="btn" data-act="area-ai" data-v="search">🤖 Ask Claude about these results</button></div>
  <div class="hint" style="margin:-4px 0 10px">Fill in as many or as few boxes as you like — results must match everything you fill in. Tick results to bulk edit them. Tip: put a phrase in "quotes" to keep words together.</div>
  <div class="card"><h3>Words</h3>
    <div class="f"><label>All of these words</label><input data-adv="all" value="${h(A.all)}"></div>
    <div class="f"><label>Any of these words</label><input data-adv="any" value="${h(A.any)}"></div>
    <div class="f"><label>None of these words (exclude)</label><input data-adv="none" value="${h(A.none)}"></div>
    <div class="f"><label>This exact phrase</label><input data-adv="phrase" value="${h(A.phrase)}"></div>
    <div class="f"><span class="lbl">Look for the words in <span class="hint">(none ticked = everywhere)</span></span><div class="checks">${ADV_FIELDS.map(([k, l]) => `<label><input type="checkbox" data-advfield value="${k}" ${A.fields.includes(k) ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
  </div>
  ${kind === 'loc' || kind === 'all' ? `<details class="card" ${kind === 'loc' || A.lkind || A.lpin || A.lsafe || A.lrec ? 'open' : ''}><summary style="font-weight:700;cursor:pointer">Pins</summary><div class="grid2" style="margin-top:8px">
    <div class="f"><label>Kind of location</label><select data-adv="lkind">${[['', 'Any'], ['yard', 'Yard locations'], ['other', 'Non-farm locations'], ['turn', 'Has a turn-off pin'], ['noturn', 'No turn-off pin']].map(([v, l]) => `<option value="${v}" ${A.lkind === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="f"><label>Pin type</label><select data-adv="lpin"><option value="">Any</option>${pinTypes().map((t) => `<option value="${h(t.id)}" ${A.lpin === t.id ? 'selected' : ''}>${t.emoji} ${h(t.name)}</option>`).join('')}</select></div>
    <div class="f"><label>Safety status</label><select data-adv="lsafe"><option value="">Any</option>${Object.entries(SAFETY).map(([k, v]) => `<option value="${k}" ${A.lsafe === k ? 'selected' : ''}>${v.l}</option>`).join('')}</select></div>
    <div class="f"><label>Mobile reception</label><select data-adv="lrec"><option value="">Any</option>${[['good', 'Good'], ['patchy', 'Patchy'], ['none', 'None'], ['unknown', 'Not known']].map(([k, l]) => `<option value="${k}" ${A.lrec === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="f"><label>Current for a business</label><select data-adv="lcur">${[['yes', 'Current only'], ['no', 'Not current only'], ['any', 'Either']].map(([k, l]) => `<option value="${k}" ${(A.lcur || 'yes') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div></details>` : ''}
  <details class="card" ${A.tAll.length || A.tAny.length || A.tNone.length ? 'open' : ''}><summary style="font-weight:700;cursor:pointer">Tags and contact categories</summary>
    ${advTagPicker('tAll', 'Has ALL of these')}${advTagPicker('tAny', 'Has ANY of these')}${advTagPicker('tNone', 'Has NONE of these (exclude)')}
  </details>
  <details class="card" ${['warn', 'farmWarn', 'starred', 'multi', 'split', 'flagged', 'isPrimary', 'btype'].some((k) => A[k]) ? 'open' : ''}><summary style="font-weight:700;cursor:pointer">Flags</summary><div class="grid2" style="margin-top:8px">
    ${ynSel('warn', 'Has warnings')}${ynSel('farmWarn', 'Has a farm warning')}${ynSel('starred', 'Favourite (this device)')}${ynSel('multi', 'More than one A+ to C category')}${ynSel('split', 'Split photo')}${ynSel('flagged', 'On the Jobs list')}${ynSel('isPrimary', 'Is a primary contact')}<div class="f"><label>Business type</label><select data-adv="btype"><option value="">Either</option><option value="client" ${S.adv.btype === 'client' ? 'selected' : ''}>Client business</option><option value="nonclient" ${S.adv.btype === 'nonclient' ? 'selected' : ''}>Non-client (industry)</option></select></div></div>
  </details>
  <details class="card" ${A.missing.length ? 'open' : ''}><summary style="font-weight:700;cursor:pointer">Missing information</summary><div class="checks" style="margin-top:8px">${ADV_MISSING.map(([k, l]) => `<label><input type="checkbox" data-advmiss value="${k}" ${A.missing.includes(k) ? 'checked' : ''}>${l}</label>`).join('')}</div></details>
  <details class="card" ${A.kmVal || A.kmVal2 || A.minVal || A.minVal2 || A.nearKm ? 'open' : ''}><summary style="font-weight:700;cursor:pointer">Distance and location</summary>
    ${numFilter('Travel (km return)', 'km', 'e.g. 80')}
    ${numFilter('Drive time (minutes each way)', 'min', 'e.g. 45')}
    <div class="f"><label>Has a farm within (km, straight line)</label><input type="number" data-adv="nearKm" value="${h(A.nearKm)}"></div>
    <div class="f"><span class="lbl">…of</span><div class="seg"><button class="${A.near.type === 'home' ? 'on' : ''}" data-act="adv-near" data-v="home">Homebase</button><button class="${A.near.type === 'farm' ? 'on' : ''}" data-act="adv-near" data-v="farm">A client's farm</button></div>
    ${A.near.type === 'farm' ? `<input id="adv-nearsearch" placeholder="Search clients, businesses or farms" value="${nf ? h(farmLabel(nf)) : ''}" style="margin-top:6px;width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:9px"><div id="adv-nearres"></div>` : ''}</div>
  </details>
  <div class="actions"><button class="btn" data-act="adv-clear">Clear all</button><label class="row2" style="padding:0">Sort <select data-adv="sort">${[['first', 'First name'], ['last', 'Surname'], ['business', 'Business'], ['rating', 'Category A+ to C'], ['tag', 'Tag']].map(([v, l]) => `<option value="${v}" ${A.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
  <div id="adv-results">${advResultsHtml()}</div></div>`;
}
function renderAdvResults() {
  const r = advResults();
  S.advSel = S.advSel || new Set(); const ids = new Set(r.map((c) => c.id)); [...S.advSel].forEach((id) => { if (!ids.has(id)) S.advSel.delete(id); });
  const nSel = S.advSel.size; const cats = D.tags.filter((t) => t.group === 'client'), addl = D.tags.filter((t) => t.group === 'additional');
  let html = `<div class="card"><h3><input type="checkbox" class="jobcheck" data-act="adv-selall" title="Select all results" ${nSel && nSel === r.length ? 'checked' : ''}><span class="sp">${r.length} contact${r.length === 1 ? '' : 's'} found${nSel ? ` · ${nSel} selected` : ''}</span>${r.length ? `<button class="btn small" data-act="adv-route">➕ Farms to route</button><button class="btn small" data-act="adv-csv">Download list</button>` : ''}</h3>
  ${nSel ? `<div class="bulkbar" style="border-radius:9px;margin:0 0 8px;justify-content:space-between"><b>${nSel} contact${nSel === 1 ? '' : 's'} selected</b><span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn primary" data-act="adv-edit" style="font-size:16px">✏️ Edit selected…</button><button class="btn" data-act="bulk-rename" data-k="contact">🔤 Rename…</button><button class="btn small" data-act="adv-selnone">Clear selection</button></span></div>` : `<div class="hint" style="margin:-2px 0 8px">Tick contacts (or the box above to tick them all) to edit several at once.</div>`}
  <ul class="list">`;
  r.slice(0, 300).forEach((c) => { const bs = bizOf(c); html += `<li class="item ${S.advSel.has(c.id) ? 'jobsel' : ''}" data-act="open" data-kind="contact" data-id="${c.id}"><input type="checkbox" class="jobcheck" data-act="adv-sel" data-id="${c.id}" ${S.advSel.has(c.id) ? 'checked' : ''} aria-label="Select">${contactPhotoImg(c)}<div class="t"><div class="n">${isFav(c) ? '<span class="star">★</span> ' : ''}${h(showName(c))}</div><div class="s">${distinctRatings(c).map(rbadge).join('')}${h(bs.map((b) => b.name).join(', ') || c.role || '')}</div></div>${hasWarning(c) ? '<span class="wdot"></span>' : ''}</li>`; });
  if (r.length > 300) html += `<li class="empty">Showing the first 300 — narrow the search, or download the full list.</li>`;
  return html + '</ul></div>';
}
const advPick = () => { const r = advResults(); return S.advSel && S.advSel.size ? r.filter((c) => S.advSel.has(c.id)) : r; }; // selected, or all results
const BULK_OPS = [
  ['setcat', 'Set category', 'give them all one category (A+ to C, Pay up front, Inactive…) or "same as business"', 'setcat'],
  ['tag-add', 'Add an additional tag', 'ICE, Check who to bill, Primary…', 'tag'],
  ['tag-remove', 'Remove an additional tag', '', 'tag'],
  ['link', 'Link them to a business', 'pick an existing business or type a new name', 'biz'],
  ['star', 'Add to favourites', 'show at the top of the contacts list', ''],
  ['unstar', 'Remove from favourites', '', ''],
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
    <div data-need="biz"><input id="bk-biz" list="bk-bizlist" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:9px;font-size:16px"><datalist id="bk-bizlist">${D.businesses.map((b) => `<option value="${h(b.name)}">`).join('')}</datalist></div>
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
  if (op === 'star' || op === 'unstar') { list.forEach((c) => setFav(c, op === 'star')); S.advSel.clear(); closeSheet(); toast(op === 'star' ? `★ ${list.length} added to your favourites` : `Removed ${list.length} from your favourites`); renderAll(); return false; }
  if ((pickC === 'inactive' || pickC === 'dna') && !$('#bk-reason').value.trim()) { toast('Please add the reason'); return false; }
  if ((op === 'tag-add' || op === 'tag-remove') && !tagsT.length) { toast('Tick at least one tag'); return false; }
  let biz = null, linkMatch = null;
  if (op === 'link') { const nm = $('#bk-biz').value.trim(); if (!nm) { toast('Type or pick a business name'); return false; } biz = D.businesses.find((b) => b.name.toLowerCase() === nm.toLowerCase()); if (!biz) { if (!(await askBox('New business?', askText(`"${nm}" doesn't exist yet. Create it and link the contacts to it?`), 'Yes — create it'))) return false; biz = newBusiness(nm); } }
  if (op === 'link' && bizCat(biz)) { const diff = list.filter((c) => !c.links.some((l) => l.bid === biz.id) && catOf(c) && catOf(c) !== bizCat(biz));
    if (diff.length) { const r = await askLinkCat(diff.length > 4 ? `<b>${diff.length} of these contacts</b> (${h(diff.slice(0, 4).map(fullName).join(', '))}…)` : diff.map((c) => `<b>${h(fullName(c))}</b>`).join(diff.length === 2 ? ' and ' : ', '), biz, [...new Set(diff.map((c) => tagName(catOf(c))))].join(' / '), diff); if (!r) return false; linkMatch = new Set(r === 'match' ? diff.map((c) => c.id) : []); } }
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
    else if (op === 'star' || op === 'unstar') { setFav(c, op === 'star'); }
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
function advResultsHtml() { const k = S.adv.kind || 'people'; return k === 'people' ? renderAdvResults() : k === 'loc' ? renderAdvLocResults() : k === 'all' ? renderAdvAllResults() : renderAdvBizResults(); }
function refreshAdv() { const el = $('#adv-results'); if (el) el.innerHTML = advResultsHtml(); }
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
  if (a === 'adv-clear') { const keep = { sel: S.adv.sel, psubs: S.adv.psubs, bsubs: S.adv.bsubs, lsubs: S.adv.lsubs }; S.adv = { ...advDefault(), ...keep }; advSync(); renderAll(); }
  else if (a === 'adv-near') { S.adv.near = { type: el.dataset.v }; renderAll(); }
  else if (a === 'adv-near-pick') { S.adv.near = { type: 'farm', fid: el.dataset.fid }; renderAll(); }
  else if (a === 'adv-sel') { e.stopPropagation(); el.checked ? S.advSel.add(el.dataset.id) : S.advSel.delete(el.dataset.id); refreshAdv(); }
  else if (a === 'adv-selall') { advResults().forEach((c) => (el.checked ? S.advSel.add(c.id) : S.advSel.delete(c.id))); refreshAdv(); }
  else if (a === 'adv-selnone') { S.advSel.clear(); refreshAdv(); }
  else if (a === 'adv-edit') advEditSheet();
  else if (a === 'adv-kind') { const v = el.dataset.v; S.adv.sel = [v === 'people' ? 'people' : v === 'loc' ? 'loc' : 'biz']; if (['client', 'nonclient'].includes(v)) S.adv.bsubs = [v]; advSync(); renderAll(); }
  else if (a === 'adv-top') { const v = el.dataset.v; if (v === 'all') S.adv.sel = []; else { const cur = new Set(advSel()); cur.has(v) ? cur.delete(v) : cur.add(v); S.adv.sel = [...cur]; } advSync(); renderAll(); }
  else if (a === 'adv-sub') { const key = { people: 'psubs', biz: 'bsubs', loc: 'lsubs' }[el.dataset.k]; const cur = new Set(S.adv[key] || []); cur.has(el.dataset.v) ? cur.delete(el.dataset.v) : cur.add(el.dataset.v); S.adv[key] = [...cur]; advSync(); renderAll(); }
  else if (a === 'advl-sel') { e.stopPropagation(); el.checked ? S.advLSel.add(el.dataset.id) : S.advLSel.delete(el.dataset.id); refreshAdv(); }
  else if (a === 'advl-selall') { advLocResults().forEach((f) => (el.checked ? S.advLSel.add(f.id) : S.advLSel.delete(f.id))); refreshAdv(); }
  else if (a === 'advl-selnone') { S.advLSel.clear(); refreshAdv(); }
  else if (a === 'advl-edit') advLocEditSheet();
  else if (a === 'advl-map') { const ids = S.advLSel && S.advLSel.size ? [...S.advLSel] : advLocResults().map((f) => f.id); S.mapSel = new Set(ids); S.mapF = { ...(S.mapF || {}), past: S.adv.lcur !== 'yes', q: '', type: '' }; S.mapFit = true; goTab('route'); setTimeout(() => { const m = $('#routemap'); if (m) m.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300); }
  else if (a === 'advl-route') { routeAddedBox([...S.advLSel].filter((id) => IDX.farms.get(id) && IDX.farms.get(id).lat != null)); }
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
  } else if (a === 'go-adv') { S.adv.sel = ['people']; advSync(); S.tab = 'search'; S.sel = null; renderAll(); }
  else if (a === 'go-adv-biz') { S.adv.sel = ['biz']; S.adv.bsubs = [S.btype === 'nonclient' ? 'nonclient' : 'client']; advSync(); S.tab = 'search'; S.sel = null; renderAll(); }
});


/* ---------------- trash can (synced; restore within 90 days) ---------------- */
function toTrash(kind, rec, extra = {}) { (D.trash = D.trash || []).push({ tid: uid('t'), at: Date.now(), by: DEVICE, kind, rec: strip(rec), ...extra }); D._trashDirty = true; }
/* favourites are kept on each device (not synced) — everyone can have their own */
let FAVS = null; const favSet = () => FAVS || (FAVS = new Set(Array.isArray(PREF.favs) ? PREF.favs : (D ? D.contacts.filter((c) => c.starred).map((c) => c.id) : [])));
const isFav = (c) => favSet().has(c.id);
function setFav(c, on) { const f = favSet(); if (on) f.add(c.id); else f.delete(c.id); savePref('favs', [...f]); }
function trashContact(c) { D.businesses.forEach((b) => { if ((b.helpers || []).some((x) => x.cid === c.id)) { b.helpers = b.helpers.filter((x) => x.cid !== c.id); touch(b); } }); D.contacts.forEach((x) => { if ((x.related || []).some((r) => r.cid === c.id)) { x.related = x.related.filter((r) => r.cid !== c.id); touch(x); } if ((x.noMentionRel || []).some((r) => r.cid === c.id)) { x.noMentionRel = x.noMentionRel.filter((r) => r.cid !== c.id); touch(x); } }); toTrash('contact', c); logDeleted('contacts', c, D.trash[D.trash.length - 1].tid); D.contacts = D.contacts.filter((x) => x.id !== c.id); D.deleted.push({ id: c.id, kind: 'contacts', at: Date.now() }); D.businesses.forEach((b) => { if (b.primaryContact === c.id) { b.primaryContact = null; touch(b); } }); Sync.soon(); }
function trashBiz(b) {
  const linked = D.contacts.filter((c) => c.links.some((l) => l.bid === b.id)).map((c) => c.id);
  toTrash('business', b, { linked }); logDeleted('businesses', b, D.trash[D.trash.length - 1].tid);
  D.businesses = D.businesses.filter((x) => x.id !== b.id);
  D.contacts.forEach((c) => { if (c.links.some((l) => l.bid === b.id)) { c.links = c.links.filter((l) => l.bid !== b.id); touch(c); } });
  D.deleted.push({ id: b.id, kind: 'businesses', at: Date.now() }); Sync.soon();
}
function trashFarm(b, f) { /* removes the farm from this business; the farm itself only goes to the trash when no other business uses it */
  unlinkFarm(b, f.id); reindex(); if (farmUsersOf(f.id).length) return false;
  toTrash('farm', f, { bid: b.id, bname: b.name }); logDeleted('farms', f, D.trash[D.trash.length - 1].tid); dropFarmRecord(f); S.route.stops = S.route.stops.filter((st) => st.fid !== f.id); return true; }
function restoreTrash(tid) {
  const t = (D.trash || []).find((x) => x.tid === tid); if (!t || t.removed) return;
  // restored records get a new id so the old deletion can't remove them again on another device
  if (t.kind === 'contact') { const c = { ...t.rec, id: uid('c') }; c.links = c.links.filter((l) => IDX.biz.has(l.bid)); touch(c); D.contacts.push(c); S.sel = { kind: 'contact', id: c.id }; S.tab = 'contacts'; }
  if (t.kind === 'business') { const b = { ...t.rec, id: uid('b') }; touch(b); D.businesses.push(b); (t.linked || []).forEach((cid) => { const c = D.contacts.find((x) => x.id === cid); if (c && !c.links.some((l) => l.bid === b.id)) { c.links.push({ bid: b.id }); touch(c); } }); S.sel = { kind: 'business', id: b.id }; S.tab = 'biz'; }
  if (t.kind === 'farm') { const b = IDX.biz.get(t.bid); if (!b) { toast('Its business has been deleted — restore the business first'); return; } const f = { ...t.rec, id: uid('f') }; delete f.sharedWith; D.farms.push(f); touch(f); linkFarm(b, f); S.sel = { kind: 'business', id: b.id }; S.tab = 'biz'; }
  Object.assign(t, { removed: true, rec: null }); D._trashDirty = true; NEXT_LOG_LABEL = 'Restored from the trash'; changed().then((ok) => { if (ok !== false) toast('Restored'); });
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
    const nm = kind === 'contact' ? (x) => fullName(x) + (bizOf(x).length ? ' (' + bizOf(x).map((y) => y.name).join(', ') + ')' : '') : (x) => x.name;
    add({ type: 'dupe', key, kind, id: A.id, who: nm(A) + '  ↔  ' + nm(B), note: 'Possible duplicate — ' + why, dupe: { kind, a: A.id, b: B.id } });
  };
  const group = (arr, keyFn, cb) => { const m = new Map(); arr.forEach((x) => { const k = keyFn(x); if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); m.forEach((g) => { for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) cb(g[i], g[j]); }); };
  group(D.businesses, (b) => (normBiz(b.name).length >= 3 ? normBiz(b.name) : null), (a, b) => pair('business', a, b, 'very similar business names'));
  group(D.contacts, (c) => (c.first && c.last ? normName(c) : null), (a, b) => pair('contact', a, b, 'same name'));
  const mob = []; D.contacts.forEach((c) => c.mobiles.forEach((p) => mob.push({ c, k: lastDigits(p.value) })));
  group(mob, (x) => (x.k.length === 9 ? x.k : null), (a, b) => { if (a.c !== b.c) pair('contact', a.c, b.c, 'same mobile number'); });
  const pics = []; D.businesses.forEach((b) => b.pics.forEach((p) => pics.push({ b, k: (p.value || '').toUpperCase().replace(/\s/g, '') })));
  group(pics, (x) => (PIC_RX.test(x.k) ? x.k : null), (a, b) => { if (a.b !== b.b) pair('business', a.b, b.b, 'same PIC (' + a.k + ')'); });
  D.businesses.forEach((sb) => { const x = (sb.name || '').trim(); if (!/^[A-Z][A-Z0-9&]{1,7}$/.test(x)) return; // "UWA" ↔ "University of Western Australia"
    D.businesses.forEach((lb) => { if (lb === sb || (lb.name || '').trim() === x) return; const m = (lb.name || '').match(/\(([A-Z][A-Z0-9&]{1,7})\)/); if (lb.abbr === x || (m && m[1] === x) || abbrGuess(lb.name || '') === x) pair('business', lb, sb, `"${x}" looks like the abbreviation of ${lb.name}`); }); });
  const em = []; D.contacts.forEach((c) => c.emails.forEach((e) => em.push({ c, k: e.value.trim().toLowerCase() })));
  group(em, (x) => x.k || null, (a, b) => { if (a.c !== b.c) pair('contact', a.c, b.c, 'same email address'); });
}
/* ---------------- Merge with… (pick the other record, settle any conflicts, then merge) ---------------- */
/* ---------------- farm with an address but no pin: look the address up and confirm a pin ---------------- */
function pinFindSheet(f) {
  const b = IDX.farmBiz.get(f.id); if (!f || !b) return; S.pinFid = f.id; S.pinMode = 'job';
  const q = (f.address || f.name || '').trim();
  openSheet('Find pin — ' + (f.name || b.name), `<div class="hint" style="margin-bottom:8px">${h(b.name)}${f.name ? ' · ' + h(f.name) : ''}</div>
    <div class="f"><label>Address to search</label><div class="search"><input id="pf-addr" value="${h(q)}"><button class="btn small primary" data-act="pin-search">Search</button></div></div>
    <div id="pin-res" class="hint">${Maps.key() ? 'Tap Search to look this address up with Google.' : 'No Google Maps key in Settings, so the app can\'t search for you — use the button below.'}</div>
    <div class="actions" style="margin-top:6px"><a class="btn small" id="pin-gmaps" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q + (/\bWA\b|Western Australia/i.test(q) ? '' : ', WA'))}" target="_blank" rel="noopener">🗺 Search in Google Maps</a></div>
    <div class="f" style="margin-top:8px"><label>…or paste a pin or Google Maps link</label><input id="pin-paste"><div class="hint">In Google Maps, press and hold the yards to drop a pin, then copy the numbers (or Share → Copy link) and paste them here.</div></div>
    <div id="pin-prev"></div>`, () => true);
  $('#sheet-save').style.display = 'none'; if (Maps.key() && q) setTimeout(pinSearch, 50);
}
async function geocode(q) { /* → [{name, address, lat, lng, prec}] using whichever Google API the key allows */
  const errs = []; const home = D.settings.home || {};
  try { const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=au&components=country:AU&key=${encodeURIComponent(Maps.key())}`); const js = await r.json();
    if (js.status === 'OK') return js.results.slice(0, 5).map((x) => ({ name: x.formatted_address, address: x.formatted_address, lat: x.geometry.location.lat, lng: x.geometry.location.lng, prec: { ROOFTOP: 'exact address', RANGE_INTERPOLATED: 'estimated along the road', GEOMETRIC_CENTER: 'middle of a road or area', APPROXIMATE: 'approximate — town or area only' }[x.geometry.location_type] + (x.partial_match ? ', partial match' : '') }));
    if (js.status === 'ZERO_RESULTS') errs.push('nothing found'); else errs.push('Geocoding API: ' + (js.error_message || js.status)); } catch (e) { errs.push('Geocoding API: ' + e.message); }
  try { const body = { textQuery: q, regionCode: 'AU' }; if (home.lat != null) body.locationBias = { circle: { center: { latitude: home.lat, longitude: home.lng }, radius: 50000 } };
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': Maps.key(), 'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location' }, body: JSON.stringify(body) }); const js = await r.json();
    if (r.ok) { if ((js.places || []).length) return js.places.slice(0, 5).map((x) => ({ name: (x.displayName || {}).text || x.formattedAddress, address: x.formattedAddress, lat: x.location.latitude, lng: x.location.longitude, prec: 'Google place' })); errs.push('nothing found'); } else errs.push('Places API: ' + ((js.error || {}).message || r.status)); } catch (e) { errs.push('Places API: ' + e.message); }
  const e = new Error(errs.every((x) => x === 'nothing found') ? 'Google couldn\'t find that address.' : errs.filter((x) => x !== 'nothing found').join(' · ')); e.notFound = errs.includes('nothing found'); throw e;
}
async function pinSearch() {
  const sfx = S.pinMode === 'farm' ? S.pinSfx || '' : ''; const q = ($(S.pinMode === 'farm' ? '#e-faddr' : '#pf-addr') || {}).value || ''; const box = $('#pin-res' + sfx); if (!box) return; if (!q.trim()) { box.textContent = S.pinMode === 'farm' ? 'Type the physical address first.' : 'Type an address first.'; return; }
  const gm = $('#pin-gmaps'); if (gm) gm.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q + (/\bWA\b|Western Australia/i.test(q) ? '' : ', WA'))}`;
  if (!Maps.key()) { box.innerHTML = S.pinMode === 'farm' ? `No Google Maps key in Settings, so the app can't search for you. <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q + (/\bWA\b|Western Australia/i.test(q) ? '' : ', WA'))}" target="_blank" rel="noopener">Search in Google Maps</a>, press and hold the yards, then copy the pin into GPS location above.` : 'No Google Maps key in Settings — use <b>Search in Google Maps</b> and paste the pin below.'; return; }
  if (!navigator.onLine) { box.textContent = 'You are offline — searching needs internet.'; return; }
  box.textContent = 'Searching…';
  try { const res = await geocode(q + (/\bWA\b|Western Australia/i.test(q) ? '' : ', WA')); S.pinRes = res;
    box.innerHTML = `<div class="lbl">Google found — tap one to check it on the map</div><div class="results">${res.map((r, i) => `<div data-act="pin-pick" data-i="${i}"><b>${h(r.name)}</b>${r.address !== r.name ? ` <span class="hint">${h(r.address)}</span>` : ''}<div class="hint">${h(r.prec || '')}</div></div>`).join('')}</div>`;
    if (res.length === 1) pinPreview(res[0]);
  } catch (e) { box.innerHTML = `${h(e.message)}${e.notFound ? '' : '<br>To let the app search, turn on <b>Geocoding API</b> (or Places API (New)) for your key in Google Cloud. Until then, use Search in Google Maps below.'}`; }
}
let MAPS_JS_BAD = false; // set when Google rejects the Maps JavaScript API for this key (not switched on, or not allowed for this website)
let MAPS_JS_ERR = ''; // Google's own reason, e.g. RefererNotAllowedMapError
const MAPS_ERR_HELP = { ApiNotActivatedMapError: 'the Maps JavaScript API isn\'t switched on for this key\'s project yet (APIs & Services → Library → Maps JavaScript API → Enable)', RefererNotAllowedMapError: 'the key\'s website restriction doesn\'t allow this site — add https://bovitech-veterinary-services.github.io/* under Application restrictions → Websites', ApiTargetBlockedMapError: 'the key\'s API restrictions don\'t include Maps JavaScript API — tick it under API restrictions', BillingNotEnabledMapError: 'billing isn\'t linked to the Google Cloud project', InvalidKeyMapError: 'the key in Settings isn\'t valid — check it was copied fully', MissingKeyMapError: 'no key was sent', ExpiredKeyMapError: 'the key has expired or been deleted', DeletedApiProjectMapError: 'the key\'s Google Cloud project was deleted' };
{ const ce = console.error.bind(console); console.error = (...a) => { try { const m = String(a[0] || '').match(/Google Maps JavaScript API (?:error|warning): (\w+)/); if (m && /Error$/.test(m[1])) { MAPS_JS_ERR = m[1]; setTimeout(() => document.querySelectorAll('.mapserr').forEach((e) => { e.outerHTML = mapsErrNote(); }), 0); } } catch (e) { } ce(...a); }; }
function mapsErrNote() { if (!Maps.key()) return ''; const msg = MAPS_JS_ERR ? `Plain satellite map shown because Google said <b>${h(MAPS_JS_ERR)}</b>: ${h(MAPS_ERR_HELP[MAPS_JS_ERR] || 'see Google Cloud → APIs & Services')}.` : 'Plain satellite map shown because Google\'s map didn\'t load (no internet, or the key was refused without a reason).'; return `<div class="hint mapserr" style="margin-top:4px;font-size:12px">${msg} After fixing it, wait 5 minutes then <span class="lnk" data-act="maps-retry">tap here to reload</span>.</div>`; }
window.gm_authFailure = () => { MAPS_JS_BAD = true; document.querySelectorAll('.gmap-live').forEach((el) => el.dispatchEvent(new Event('gmfail'))); };
async function satMap(el, center, zoom = 15) { await loadLeaflet(); el.innerHTML = ''; { const par = el.parentNode; if (par && MAPS_JS_BAD && !(par.nextElementSibling && par.nextElementSibling.classList.contains('mapserr'))) setTimeout(() => { if (!par.nextElementSibling || !par.nextElementSibling.classList.contains('mapserr')) par.insertAdjacentHTML('afterend', mapsErrNote()); }, 400); } const m = L.map(el, { zoomControl: true }).setView([center.lat, center.lng], zoom);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 16, attribution: 'Imagery © Esri' }).addTo(m);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 16 }).addTo(m); setTimeout(() => m.invalidateSize(), 50); return m; }
const SVC = {}; // the Street View check in progress: { fid, p (pin), map, mk, pano, quiet }
async function svcStart(f, boxIn, pin0) { const box = boxIn || $('#svc-' + f.id); const tp = pin0 || f.turn; if (!box || !tp) return; const inJob = !boxIn; if (!Maps.key()) { box.innerHTML = '<div class="hint">Add the Google Maps key in Settings first.</div>'; return; }
  const src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(Maps.key())}&v=weekly`; try { await loadScript(src); if (!window.google || !google.maps || !google.maps.StreetViewService) throw new Error('x'); } catch (e) { delete SCRIPT_P[src]; box.innerHTML = '<div class="hint">Google Maps didn\'t load — check the internet.</div>'; return; }
  Object.assign(SVC, { fid: f.id, p: { lat: +tp.lat, lng: +tp.lng }, start: { lat: +tp.lat, lng: +tp.lng }, quiet: false });
  box.innerHTML = `<div class="hint" style="margin-bottom:4px"><b>Walk along the road in Street View</b> (tap the arrows) <b>or drag the ${turnPin().emoji} on the map</b> — the pin and Street View follow each other. Stop where you turn in, then save.</div><div class="svcpano"></div><div class="svcmap"></div><div class="hint svcinfo"></div>
    <div class="acts" style="margin-top:6px">${inJob ? `<button class="btn small greenbtn" data-act="svc-save" data-fid="${f.id}" data-next="1">✓ Save &amp; next</button><button class="btn small" data-act="svc-save" data-fid="${f.id}">✓ Save</button>` : ''}<button class="btn small" data-act="svc-reset" data-fid="${f.id}">↺ Put the pin back</button></div>`;
  const map = new google.maps.Map(box.querySelector('.svcmap'), { center: SVC.p, zoom: 17, mapTypeId: 'hybrid', streetViewControl: false, fullscreenControl: false, gestureHandling: 'greedy', tilt: 0 });
  farmYards(f).filter((y) => y.p).forEach((y) => new google.maps.Marker({ position: y.p, map, clickable: false, label: { text: y.emo, fontSize: '16px' }, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 13, fillColor: '#fff', fillOpacity: 0.9, strokeColor: '#141414', strokeWeight: 2 } }));
  const mk = new google.maps.Marker({ position: SVC.p, map, draggable: true, zIndex: 1000, label: { text: turnPin().emoji, fontSize: '20px' }, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 19, fillColor: f.turnTbc ? '#ff5a5a' : '#fff', fillOpacity: 0.95, strokeColor: '#d71f2b', strokeWeight: 3 } });
  const pano = new google.maps.StreetViewPanorama(box.querySelector('.svcpano'), { addressControl: false, fullscreenControl: true, motionTracking: false, linksControl: true, clickToGo: true });
  const info = box.querySelector('.svcinfo'); const svs = new google.maps.StreetViewService(); Object.assign(SVC, { map, mk, pano });
  const bearing = (a, b) => { const t = Math.PI / 180, y = Math.sin((b.lng - a.lng) * t) * Math.cos(b.lat * t), x = Math.cos(a.lat * t) * Math.sin(b.lat * t) - Math.sin(a.lat * t) * Math.cos(b.lat * t) * Math.cos((b.lng - a.lng) * t); return (Math.atan2(y, x) / t + 360) % 360; };
  const look = (p) => svs.getPanorama({ location: p, radius: 300, preference: 'nearest', source: 'outdoor' }, (d, st) => { if (st !== 'OK' || !d) { info.textContent = 'No Street View within 300 m of the pin.'; return; } const at = { lat: d.location.latLng.lat(), lng: d.location.latLng.lng() }; SVC.quiet = true; pano.setPano(d.location.pano); const yd = farmYards(f).find((y) => y.p); pano.setPov({ heading: hav(at, p) > 0.015 ? bearing(at, p) : yd ? bearing(at, yd.p) : 0, pitch: 0 }); setTimeout(() => { SVC.quiet = false; }, 900); info.textContent = `Street View ${Math.round(hav(at, p) * 1000)} m from the pin${d.imageDate ? ' · photo ' + d.imageDate : ''}.`; });
  mk.addListener('dragend', () => { const x = mk.getPosition(); SVC.p = { lat: x.lat(), lng: x.lng() }; look(SVC.p); });
  pano.addListener('position_changed', () => { if (SVC.quiet) return; const x = pano.getPosition(); if (!x) return; SVC.p = { lat: x.lat(), lng: x.lng() }; mk.setPosition(SVC.p); map.panTo(SVC.p); info.textContent = 'Pin moved to where you are standing in Street View.'; });
  look(SVC.p); if (inJob) box.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
function svFull(f, tp, title, q, okL, noL) { /* full-screen Street View + map, both visible at once */
  return new Promise((res) => { document.querySelectorAll('.svfull').forEach((x) => x.remove()); const ov = document.createElement('div'); ov.className = 'svfull';
    ov.innerHTML = `<div class="svfh"><div class="svft"><b>${h(title)}</b>${q ? `<div class="svfq">${h(q)}</div>` : ''}<div class="hint">Drag the ${turnPin().emoji} on the map <b>or</b> walk along the road in Street View (tap the arrows) — they follow each other.</div></div><div class="svfa"><button type="button" class="btn small" data-svf="0">${h(noL)}</button><button type="button" class="btn small greenbtn" data-svf="1">${h(okL)}</button></div></div><div class="svfb"></div>`;
    document.body.appendChild(ov); const done = (v) => { ov.remove(); document.body.classList.remove('svfopen'); res(v); }; document.body.classList.add('svfopen');
    ov.querySelectorAll('[data-svf]').forEach((b) => b.addEventListener('click', () => done(b.dataset.svf === '1'))); svcStart(f, ov.querySelector('.svfb'), tp); }); }
async function svConfirm(f, key, opt = {}) { /* Street View + map for one turn-off (key: 'main' or an extra pin's id) — check it, or move it and save */
  const ex = key && key !== 'main' ? (f.extra || []).find((x) => x.id === key) : null; const tp = ex ? (ex.lat != null ? { lat: ex.lat, lng: ex.lng } : null) : f && f.turn; if (!f || !tp || tp.lat == null || !Maps.key() || !navigator.onLine) { if (opt.edit) toast(!navigator.onLine ? 'Street View needs internet' : 'Add the turn-off pin first'); return; }
  const tName = ex ? (ex.name || turnName() + ' 2') : (f.turnLabel || turnName()); const r = await svFull(f, tp, `${f.name || 'Farm'} — ${tName}`, opt.edit ? '' : 'Is the turn-off in the right place?', opt.edit ? '✓ Save' : '✓ Yes — save it here', opt.edit ? 'Close' : 'Skip for now'); if (!r || SVC.fid !== f.id) return;
  const moved = hav(SVC.p, tp) > 0.002; const np = { lat: +SVC.p.lat.toFixed(6), lng: +SVC.p.lng.toFixed(6) };
  if (ex) { if (moved) { ex.lat = np.lat; ex.lng = np.lng; } } else { const was = JSON.parse(JSON.stringify({ turn: f.turn, kmReturn: f.kmReturn, driveMin: f.driveMin, kmStatus: f.kmStatus })); if (moved) { f.turn = np; if (!(await verifyKmBox(f))) { Object.assign(f, was); return; } } f.svOk = Date.now(); }
  touch(f); NEXT_LOG_LABEL = `Turn-off checked on Street View${moved ? ' (moved)' : ''}: ${farmLabel(f)}`; S.skipConfirm = true; if (await changed()) toast(moved ? '✓ Turn-off moved and saved' : '✓ Turn-off confirmed'); }
function pcqAuto() { /* open pin-check job: the first farm's map opens by itself */ if (S.tab !== 'jobs') return; if (S.pcq && $('#pm-' + S.pcq.fid + ' .pcqmap')) return;
  const btn = document.querySelector('details.jobgroup[open] [data-act=pcq-start]'); if (btn) btn.click(); if (!(SVC.fid && $('#svc-' + SVC.fid + ' .svcmap'))) { const sb = document.querySelector('details.jobgroup[open] [data-act=svc-start]'); if (sb) sb.click(); } }
document.addEventListener('toggle', (e) => { const t = e.target; if (t.matches && t.matches('details.jobgroup') && t.open && (PCQ_JOBS.includes(t.dataset.type) || t.dataset.type === 'svcheck')) setTimeout(pcqAuto, 30); }, true);
function pcqDupes(f) { /* other farms that look like the same yards: a pin within 150 m, or the same name and address */
  const mine = [f.lat != null ? { lat: f.lat, lng: f.lng } : null, f.turn && f.turn.lat != null ? f.turn : null, ...(f.extra || []).filter((x) => x.lat != null)].filter(Boolean); const nm = ((f.name || '') + '|' + (f.address || '')).toLowerCase();
  return D.farms.filter((o) => o !== f && farmUsersOf(o.id).length && (([o.lat != null ? { lat: o.lat, lng: o.lng } : null, o.turn && o.turn.lat != null ? o.turn : null].filter(Boolean).some((p) => mine.some((m) => hav(m, p) < 0.15))) || (f.address && nm === ((o.name || '') + '|' + (o.address || '')).toLowerCase()))).slice(0, 4); }
function pcqUsersHtml(f) { const q = S.pcq; const us = farmUsersOf(f.id); const fo = farmOwner(f); const dup = pcqDupes(f); let out = '';
  if (us.length > 1) { const ownOpts = [['keep', fo.name ? `${fo.name} (as now)` : 'Not set (as now)'], ...us.filter((u) => !(f.owner && f.owner.bid === u.b.id)).map((u) => ['b:' + u.b.id, u.b.name]), ['unknown', 'Unknown owner']];
    out += `<div class="pcqusers"><div class="lbl" style="margin:8px 0 4px">These yards are shared — check each business</div>${us.map((u) => `<div class="pcqpin"><span style="flex:1;font-weight:600">${bLnk(u.b)}</span><select class="pcq-user" data-bid="${u.b.id}"><option value="cur" ${q.users[u.b.id] ? '' : 'selected'}>✓ Still uses them</option><option value="past" ${q.users[u.b.id] ? 'selected' : ''}>Not current</option></select></div>`).join('')}
      <div class="pcqpin"><span style="flex:1;font-weight:600">Owned by</span><select class="pcq-owner">${ownOpts.map(([v, l]) => `<option value="${h(v)}" ${q.owner === v ? 'selected' : ''}>${h(l)}</option>`).join('')}</select></div></div>`; }
  if (dup.length) out += `<div class="pcqusers"><div class="lbl" style="margin:8px 0 4px">⚠ Possible duplicate yards</div>${dup.map((o) => `<div class="pcqpin"><span style="flex:1">${h(farmLabel(o))}</span><button type="button" class="btn small" data-act="farm-merge-pick" data-fid="${f.id}" data-oid="${o.id}">⇄ Merge</button></div>`).join('')}</div>`;
  return out; }
document.addEventListener('change', (e) => { const t = e.target; if (!S.pcq || !t.classList) return; if (t.classList.contains('pcq-user')) S.pcq.users[t.dataset.bid] = t.value === 'past'; if (t.classList.contains('pcq-owner')) S.pcq.owner = t.value; });
document.addEventListener('input', (e) => { if (e.target.id !== 'job-q') return; S.jobQ = e.target.value; clearTimeout(S.jobQT); S.jobQT = setTimeout(() => { if (S.tab !== 'jobs') return; const pos = e.target.selectionStart; renderAll(); const i = $('#job-q'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (er) { } } }, 250); });
const ROAD_RX = /\b(road|rd|street|st|highway|hwy|drive|dr|lane|ln|avenue|ave|way|track|trk|place|pl|court|ct|crescent|cres|close|cl|parade|pde|boulevard|bvd|terrace|tce|loop|grove|gr)\b\.?$/i;
const ROAD_FULL = { rd: 'Road', st: 'Street', hwy: 'Highway', dr: 'Drive', ln: 'Lane', ave: 'Avenue', trk: 'Track', pl: 'Place', ct: 'Court', cres: 'Crescent', cl: 'Close', pde: 'Parade', bvd: 'Boulevard', tce: 'Terrace', gr: 'Grove' };
function roadOf(addr) { /* "317 Gull Rock Rd, Kalgan WA 6330" → "Gull Rock Road" */ const parts = String(addr || '').split(/,|\n/).map((x) => x.trim()).filter(Boolean); let p = parts.find((x) => ROAD_RX.test(x.replace(/\s+(north|south|east|west)$/i, ''))) || '';
  if (!p) { const m = String(addr || '').match(/\b\d+[a-z]?\s+((?:[A-Z][\w']*\s+){0,3}(?:Road|Rd|Street|St|Highway|Hwy|Drive|Dr|Lane|Ln|Avenue|Ave|Way|Track|Place|Pl|Court|Ct|Crescent|Close|Parade|Terrace|Tce))(?=[^a-z]|$)/); if (m) p = m[1]; } /* addresses with the commas missing */
  p = p.replace(/^\s*(lot|loc(ation)?|rmb|po box)\s*[\w/-]*\s*/i, '').replace(/^[\d/-]+[a-z]?\s+/i, '').trim(); if (!p) return '';
  return p.split(/\s+/).map((w, i, a) => { const k = w.toLowerCase().replace(/\.$/, ''); if (i === a.length - 1 && ROAD_FULL[k]) return ROAD_FULL[k]; return w.length > 2 && w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w[0].toUpperCase() + w.slice(1); }).join(' '); }
const isPlainFarmName = (n) => !String(n || '').trim() || /^\s*(the\s+)?farm\s*$/i.test(n);
async function roadFromPin(p) { if (!p || !Maps.key() || !navigator.onLine) return ''; try { const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${p.lat},${p.lng}&result_type=route&key=${encodeURIComponent(Maps.key())}`); const js = await r.json(); const res = (js.results || [])[0]; const c = res && (res.address_components || []).find((x) => (x.types || []).includes('route')); return c ? roadOf(c.long_name) || c.long_name : ''; } catch (e) { return ''; } }
function pcqNameIdeas(f) { const b = IDX.farmBiz.get(f.id); const ty = pinT((S.pcq && (S.pcq.pins.find((x) => x.type !== 'turn') || {}).type) || f.pinType).name; const road = roadOf(f.address);
  return [...new Set(['Home farm', road ? `${road} farm` : '', b ? `${b.name} home farm` : '', `Home ${ty.toLowerCase()}`].filter(Boolean))].slice(0, 4); }
document.addEventListener('input', (e) => { const t = e.target; if (t.classList && t.classList.contains('pcq-fname') && S.pcq) S.pcq.fname = t.value; });
async function pcqDraw(f) { /* the check-pins map in a job: every pin with its type, label and ✕, plus the map */
  const q = S.pcq, box = $('#pm-' + f.id), hint = $('#pmh-' + f.id); if (!q || !box || !hint) return; const emo = (t) => (t === 'turn' ? turnPin().emoji : pinT(t).emoji);
  const opts = (v) => `<option value="turn" ${v === 'turn' ? 'selected' : ''}>${turnPin().emoji} ${h(turnName())}</option>${pinTypes().map((t) => `<option value="${h(t.id)}" ${v === t.id ? 'selected' : ''}>${t.emoji} ${h(t.name)}</option>`).join('')}`;
  hint.innerHTML = `<b>Drag each pin into place.</b> The ${turnPin().emoji} (red ring) is where you leave the road — add more than one if there are several ways in (the distance is measured to the first). Change a pin's type below if it's wrong.${q.newYards ? ' The yards pin starts beside the turn-off.' : ''}
    <div class="pcqname"><div class="lbl" style="margin:6px 0 4px">Farm / yards name</div><input class="pcq-fname" data-fid="${f.id}" value="${h(q.fname || '')}" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;font-size:16px">${q.job === 'homename' || /^\s*home\s*$/i.test(q.fname || '') ? `<div class="chips" style="margin:6px 0">${pcqNameIdeas(f).map((x) => `<button type="button" class="chip" data-act="pcq-nameidea" data-fid="${f.id}" data-v="${h(x)}">${h(x)}</button>`).join('')}</div>` : ''}</div>
    <div class="pcqpins">${q.pins.map((p) => `<div class="pcqpin" data-k="${h(p.k)}"><span class="yemo">${emo(p.type)}</span><select class="pcq-type" data-fid="${f.id}" data-k="${h(p.k)}">${opts(p.type)}</select><input class="pcq-name" data-k="${h(p.k)}" value="${h(p.name || '')}"><label class="tbcmini" title="Not sure it's right until we visit"><input type="checkbox" class="pcq-tbc" data-fid="${f.id}" data-k="${h(p.k)}" ${p.tbc ? 'checked' : ''}> TBC</label>${q.pins.length > 1 ? `<button type="button" class="btn small" data-act="pcq-del" data-fid="${f.id}" data-k="${h(p.k)}" title="Remove this pin">✕</button>` : ''}</div>`).join('')}</div>
    ${pcqUsersHtml(f)}
    <div class="acts" style="margin-top:6px"><button class="btn small" data-act="pcq-add" data-fid="${f.id}">➕ Add another pin</button><button class="btn small greenbtn" data-act="pcq-save" data-fid="${f.id}" data-next="1">✓ Save & next</button><button class="btn small" data-act="pcq-save" data-fid="${f.id}">✓ Save</button><button class="btn small pcqfs" data-act="pcq-full" data-fid="${f.id}">${S.pcqFull ? '✕ Exit full screen' : '⛶ Full screen'}</button></div>`;
  const c = q.pins.find((x) => x.type === 'turn') || q.pins[0];
  await liveMultiMap(box, c, q.pins.map((p) => ({ k: p.k, lat: p.lat, lng: p.lng, emo: emo(p.type), red: p.type === 'turn', tbc: !!p.tbc })), (k, lat, lng) => { const p = S.pcq && S.pcq.fid === f.id && S.pcq.pins.find((x) => x.k === k); if (p) { p.lat = lat; p.lng = lng; } }); }
document.addEventListener('change', (e) => { const t = e.target; if (t.classList && t.classList.contains('pcq-tbc') && S.pcq) { const p = S.pcq.pins.find((x) => x.k === t.dataset.k); const f = IDX.farms.get(t.dataset.fid); if (p && f) { p.tbc = t.checked; pcqDraw(f); } return; } if (!t.classList || !t.classList.contains('pcq-type') || !S.pcq) return; const p = S.pcq.pins.find((x) => x.k === t.dataset.k); const f = IDX.farms.get(t.dataset.fid); if (p && f) { p.type = t.value; pcqDraw(f); } });
document.addEventListener('input', (e) => { const t = e.target; if (!t.classList || !t.classList.contains('pcq-name') || !S.pcq) return; const p = S.pcq.pins.find((x) => x.k === t.dataset.k); if (p) p.name = t.value; });
async function liveMultiMap(box, center, pins, onMove) { /* several draggable pins on one map: pins = [{k, lat, lng, emo, red}] */
  const leaflet = async () => { box.classList.remove('gmap-live'); box.innerHTML = '<div class="pcqmap" style="width:100%;border-radius:9px;position:relative;z-index:0"></div>'; const m = await satMap(box.firstChild, center); box._lm = m;
    const icon = (emo, red, tbc) => { const z = red ? 38 : 32; return L.divIcon({ className: 'pcpin', html: `<div style="width:${z}px;height:${z}px;border-radius:50%;background:${tbc ? '#ff5a5a' : '#fff'};border:${red ? 3 : 2}px solid ${red ? '#d71f2b' : '#141414'};display:grid;place-items:center;font-size:${red ? 21 : 18}px;box-shadow:0 2px 6px rgba(0,0,0,.35)">${emo}</div>`, iconSize: [z, z], iconAnchor: [z / 2, z / 2] }); };
    const ll = []; pins.forEach((p) => { const mk = L.marker([p.lat, p.lng], { draggable: true, icon: icon(p.emo, p.red, p.tbc), zIndexOffset: p.red ? 1000 : 0 }).addTo(m); mk.on('dragend', () => { const x = mk.getLatLng(); onMove(p.k, x.lat, x.lng); }); ll.push([p.lat, p.lng]); });
    const bb = L.latLngBounds(ll); if (ll.length > 1) m.fitBounds(bb, { padding: [40, 40], maxZoom: 18 }); };
  if (MAPS_JS_BAD || !Maps.key()) return leaflet(); const src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(Maps.key())}&v=weekly`;
  try { await loadScript(src); if (!window.google || !google.maps || !google.maps.Map) throw new Error('no maps'); } catch (e) { delete SCRIPT_P[src]; MAPS_JS_BAD = true; return leaflet(); }
  if (MAPS_JS_BAD) return leaflet(); box.innerHTML = '<div class="pcqmap" style="width:100%;border-radius:9px"></div>'; box.classList.add('gmap-live'); box.addEventListener('gmfail', () => leaflet(), { once: true });
  const map = new google.maps.Map(box.firstChild, { center: { lat: center.lat, lng: center.lng }, zoom: 16, mapTypeId: 'hybrid', streetViewControl: false, fullscreenControl: true, gestureHandling: 'greedy', tilt: 0 }); const bounds = new google.maps.LatLngBounds();
  pins.forEach((p) => { const mk = new google.maps.Marker({ position: { lat: p.lat, lng: p.lng }, map, draggable: true, zIndex: p.red ? 1000 : 1, label: { text: p.emo, fontSize: '20px' }, icon: { path: google.maps.SymbolPath.CIRCLE, scale: p.red ? 19 : 16, fillColor: p.tbc ? '#ff5a5a' : '#fff', fillOpacity: 0.95, strokeColor: p.red ? '#d71f2b' : '#141414', strokeWeight: p.red ? 3 : 2 } });
    mk.addListener('dragend', () => { const x = mk.getPosition(); onMove(p.k, x.lat(), x.lng()); }); bounds.extend(mk.getPosition()); });
  const ne = bounds.getNorthEast(), sw = bounds.getSouthWest(); if (pins.length > 1 && hav({ lat: ne.lat(), lng: ne.lng() }, { lat: sw.lat(), lng: sw.lng() }) > 0.005) { map.fitBounds(bounds, 60); google.maps.event.addListenerOnce(map, 'idle', () => { if (map.getZoom() > 18) map.setZoom(18); }); } }
async function liveMoveMap(box, p, onMove) { /* draggable pin; tap the map to move it there */
  const leaflet = async () => { box.classList.remove('gmap-live'); box.innerHTML = '<div style="width:100%;height:300px;border-radius:9px;position:relative;z-index:0"></div>'; const m = await satMap(box.firstChild, p); const mk = L.marker([p.lat, p.lng], { draggable: true }).addTo(m);
    const set = (ll) => onMove(ll.lat, ll.lng); mk.on('dragend', () => set(mk.getLatLng())); m.on('click', (ev) => { mk.setLatLng(ev.latlng); set(ev.latlng); }); };
  if (MAPS_JS_BAD || !Maps.key()) return leaflet(); const src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(Maps.key())}&v=weekly`;
  try { await loadScript(src); if (!window.google || !google.maps || !google.maps.Map) throw new Error('no maps'); } catch (e) { delete SCRIPT_P[src]; MAPS_JS_BAD = true; return leaflet(); }
  if (MAPS_JS_BAD) return leaflet(); box.innerHTML = '<div style="width:100%;height:300px;border-radius:9px"></div>'; box.classList.add('gmap-live'); box.addEventListener('gmfail', () => leaflet(), { once: true });
  const map = new google.maps.Map(box.firstChild, { center: { lat: p.lat, lng: p.lng }, zoom: 16, mapTypeId: 'hybrid', streetViewControl: false, fullscreenControl: true, gestureHandling: 'greedy', tilt: 0 });
  const mk = new google.maps.Marker({ position: { lat: p.lat, lng: p.lng }, map, draggable: true }); const set = (ll) => onMove(ll.lat(), ll.lng());
  mk.addListener('dragend', () => set(mk.getPosition())); map.addListener('click', (ev) => { mk.setPosition(ev.latLng); set(ev.latLng); }); }
async function pinMoveMapL(box, p) { box.classList.remove('gmap-live'); box.innerHTML = '<div style="width:100%;height:300px;border-radius:9px;position:relative;z-index:0"></div>';
  const m = await satMap(box.firstChild, p); const mk = L.marker([p.lat, p.lng], { draggable: true }).addTo(m);
  const set = (ll) => { S.pinCand = { ...S.pinCand, lat: ll.lat, lng: ll.lng, prec: 'moved by hand' }; const t = $('#pin-ll'); if (t) t.textContent = ll.lat.toFixed(5) + ', ' + ll.lng.toFixed(5) + ' (moved)'; };
  mk.on('dragend', () => set(mk.getLatLng())); m.on('click', (ev) => { mk.setLatLng(ev.latlng); set(ev.latlng); }); }
async function pinMoveMap(p) {
  { const bx = $('#pin-mapbox'); if (bx && (MAPS_JS_BAD || !Maps.key())) { try { await pinMoveMapL(bx, p); } catch (e) { } return; } } /* swap the still picture for a Google satellite map with a pin you can drag (needs the Maps JavaScript API on the key) */
  const box = $('#pin-mapbox'); if (!box || !Maps.key()) return; const src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(Maps.key())}&v=weekly`;
  try { await loadScript(src); if (!window.google || !google.maps || !google.maps.Map) throw new Error('no maps'); } catch (e) { delete SCRIPT_P[src]; MAPS_JS_BAD = true; try { await pinMoveMapL(box, p); } catch (e2) { } return; }
  if (!$('#pin-mapbox') || MAPS_JS_BAD) { if ($('#pin-mapbox')) pinMoveMapL(box, p); return; } box.innerHTML = '<div style="width:100%;height:300px;border-radius:9px"></div>'; box.classList.add('gmap-live'); box.addEventListener('gmfail', () => pinMoveMapL(box, S.pinCand || p), { once: true }); const map = new google.maps.Map(box.firstChild, { center: { lat: p.lat, lng: p.lng }, zoom: 16, mapTypeId: 'hybrid', streetViewControl: false, fullscreenControl: true, gestureHandling: 'greedy', tilt: 0 });
  const mk = new google.maps.Marker({ position: { lat: p.lat, lng: p.lng }, map, draggable: true });
  const set = (ll) => { S.pinCand = { ...S.pinCand, lat: ll.lat(), lng: ll.lng(), prec: 'moved by hand' }; const t = $('#pin-ll'); if (t) t.textContent = ll.lat().toFixed(5) + ', ' + ll.lng().toFixed(5) + ' (moved)'; };
  mk.addListener('dragend', () => set(mk.getPosition())); map.addListener('click', (ev) => { mk.setPosition(ev.latLng); set(ev.latLng); }); }
function pinPreview(p) {
  const sfx = S.pinMode === 'farm' ? S.pinSfx || '' : ''; const el = $('#pin-prev' + sfx) || $('#pin-prev'); if (!el) return; S.pinCand = { ...p }; const home = D.settings.home || {};
  const km = home.lat != null ? hav(home, p) : null;
  el.innerHTML = `<div class="card" style="padding:10px;margin-top:10px"><div class="lbl">Is this the right spot?</div><div class="hint" style="margin:4px 0 6px">${p.name ? h(p.name) + ' · ' : ''}${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}${p.prec ? ' · ' + h(p.prec) : ''}${km != null ? ` · ${km.toFixed(0)} km from homebase in a straight line` : ''}</div>
    ${/approximate|middle of/.test(p.prec || '') ? '<div class="hint" style="color:var(--yellow-ink);margin-bottom:6px">⚠ Rural addresses often only find the road or town — check the pin is on the farm or yards before confirming. You can move it in Google Maps and paste the new pin ' + (S.pinMode === 'farm' ? 'into GPS location' : 'above') + '.</div>' : ''}
    <div id="pin-mapbox" style="position:relative"><iframe title="Map preview" src="https://maps.google.com/maps?q=${p.lat},${p.lng}&z=16&t=h&output=embed" style="width:100%;height:300px;border:0;border-radius:9px" loading="lazy"></iframe></div>
    <div class="hint" id="pin-movehint" style="margin-top:4px">Close but not quite right? <b>Drag the pin, or tap the map where it should be.</b> <span id="pin-ll">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span></div>
    <div class="actions" style="margin-top:8px">${S.pinMode === 'farm' ? '<button type="button" class="btn primary" data-act="pin-use">✓ Use this pin</button>' : '<button class="btn primary" data-act="pin-confirm">✓ Create pin here</button>'}<a class="btn small" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">Open in Google Maps</a></div></div>`;
  pinMoveMap(p);
}
document.addEventListener('input', (e) => { if (e.target.id !== 'pin-paste') return; const g = parseGps(e.target.value); if (g && Math.abs(g.lat) <= 90 && Math.abs(g.lng) <= 180) pinPreview({ name: 'Pasted pin', lat: g.lat, lng: g.lng, prec: '' }); else if (e.target.value.trim()) $('#pin-prev').innerHTML = '<div class="hint" style="color:var(--red)">Not recognised yet — paste numbers like -34.95, 117.88 or a Google Maps link.</div>'; });
document.addEventListener('keydown', (e) => { if (e.target.id === 'pf-addr' && e.key === 'Enter') { e.preventDefault(); pinSearch(); } });
function primFindSheet(b) { /* search any contact to make primary; links them to the business if needed */
  openSheet('Primary contact for ' + b.name, `<div class="hint" style="margin-bottom:8px">Search for the person to make the primary contact. If they aren't linked to ${h(b.name)} yet, they'll be linked as a current contact.</div>
    <input id="pf-search" data-bid="${b.id}" placeholder="Search by name, phone or business" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:9px;font-size:16px"><div id="pf-res">${primFindRes(b, '')}</div>`, () => true);
  $('#sheet-save').style.display = 'none'; setTimeout(() => $('#pf-search') && $('#pf-search').focus(), 50);
}
function primFindRes(b, q) {
  const pq = parseQuery(q); const cur = IDX.bizContacts.get(b.id) || [], past = IDX.bizPast.get(b.id) || [];
  const res = pq.inc.length ? D.contacts.filter((c) => matchQ([fullName(c), ...c.mobiles.map((p) => p.value.replace(/\D/g, '')), ...c.landlines.map((p) => p.value.replace(/\D/g, '')), ...bizOf(c).map((x) => x.name)].join(' ').toLowerCase(), pq)).sort((x, y) => (cur.includes(y) - cur.includes(x)) || fullName(x).localeCompare(fullName(y))).slice(0, 15) : cur;
  const note = (c) => (cur.includes(c) ? 'linked here' : past.includes(c) ? 'past employee here — will be made current' : 'will be linked') + (bizOf(c).filter((x) => x.id !== b.id).length ? ' · ' + bizOf(c).filter((x) => x.id !== b.id).map((x) => x.name).join(', ') : '');
  if (!pq.inc.length && !res.length) return '<div class="hint">No contacts are linked yet — type a name to search everyone.</div>';
  return `${pq.inc.length ? '' : '<div class="lbl" style="margin-top:10px">Linked contacts</div>'}<div class="results">${res.map((c) => `<div data-act="pf-pick" data-bid="${b.id}" data-cid="${c.id}"><b>${h(fullName(c))}</b> <span class="hint">${h(note(c))}</span></div>`).join('') || '<div class="hint">No matching contacts.</div>'}</div>`;
}
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
  const fmtL = (arr) => (arr || []).map((x) => (typeof x === 'string' ? x : (x.value || '') + (x.label ? ' (' + x.label + ')' : ''))).filter((x) => x.trim());
  const addL = (key, label) => { const x = fmtL(a[key]), y = fmtL(b[key]); if (!x.length || !y.length) return; const nx = new Set(x.map((v) => v.toLowerCase().replace(/\s+/g, ''))), ny = new Set(y.map((v) => v.toLowerCase().replace(/\s+/g, ''))); if (nx.size === ny.size && [...nx].every((v) => ny.has(v))) return; out.push({ key, label, a: x.join('\n'), b: y.join('\n'), list: true }); };
  (kind === 'contact' ? [['mobiles', 'Mobiles'], ['landlines', 'Landlines'], ['emails', 'Emails'], ['postal', 'Postal addresses']] : [['phones', 'Phone numbers'], ['emails', 'Emails'], ['postal', 'Postal addresses'], ['pics', 'PICs'], ['patientIds', 'Patient IDs']]).forEach(([k, l]) => addL(k, l));
  return out;
}
function mergeSheet(kind, aId, bId) {
  const isC = kind === 'contact'; const get = (id) => (isC ? D.contacts.find((x) => x.id === id) : IDX.biz.get(id)); const a = get(aId), b = get(bId); if (!a || !b) return;
  const nm = (r) => (isC ? fullName(r) : r.name); const cf = mergeConflicts(kind, a, b);
  const opt = (c, v, label, checked) => `<label style="display:flex;gap:6px;align-items:flex-start;margin:3px 0"><input type="radio" name="mg-${c.key}" value="${v}" ${checked ? 'checked' : ''}><span style="white-space:pre-wrap">${label}</span></label>`;
  const short = (t) => h(String(t).length > 300 ? String(t).slice(0, 300) + '…' : String(t));
  const body = `<p>Merging <b>${h(nm(b))}</b> into <b>${h(nm(a))}</b>. Phone numbers, emails, addresses, ${isC ? 'linked businesses and tags' : 'farms, PICs, patient IDs and contacts'} are combined automatically.</p>
    ${cf.length ? `<div class="actions mgall" style="margin:8px 0"><button type="button" class="btn small" data-act="mg-all" data-v="a">Keep everything from ${h(nm(a))}</button><button type="button" class="btn small" data-act="mg-all" data-v="b">Keep everything from ${h(nm(b))}</button><button type="button" class="btn small" data-act="mg-all" data-v="both">Combine everything</button></div><div class="hint">${isC ? 'Linked businesses and tags' : 'Farms and contacts'} are always combined, so nothing is lost.</div><div class="lbl" style="font-size:15px;margin-top:8px">Where they're different — choose what to keep:</div>${cf.map((c) => `<div class="card" style="padding:10px;margin:6px 0"><div style="font-weight:700;margin-bottom:4px">${h(c.label)}</div>${opt(c, 'a', `<b>${h(nm(a))}:</b> ${short(c.a)}`, !c.text && !c.list)}${opt(c, 'b', `<b>${h(nm(b))}:</b> ${short(c.b)}`, false)}${c.text ? opt(c, 'both', 'Keep both (one after the other)', true) : ''}${c.list ? opt(c, 'both', 'Keep all of them (combined)', true) : ''}</div>`).join('')}` : '<div class="hint">No clashes — everything can be combined.</div>'}
    <div class="hint" style="margin-top:8px">${h(nm(b))} will be moved to the trash (restore it from Settings → Trash if needed).</div>`;
  openSheet(`Merge ${isC ? 'contacts' : 'businesses'}`, body, () => {
    const pick = {}; cf.forEach((c) => { pick[c.key] = (document.querySelector(`#sheet input[name="mg-${c.key}"]:checked`) || {}).value || 'a'; });
    const lists = {}; cf.filter((c) => c.list && pick[c.key] !== 'both').forEach((c) => { lists[c.key] = JSON.parse(JSON.stringify((pick[c.key] === 'b' ? b : a)[c.key] || [])); });
    const chosenCat = (pick.category === 'b') ? (isC ? catOf(b) : bizCat(b)) : (isC ? catOf(a) : bizCat(a)) || (isC ? catOf(b) : bizCat(b));
    const keepText = {}; cf.filter((c) => c.text && !c.list).forEach((c) => { keepText[c.key] = pick[c.key] === 'a' ? a[c.key] : pick[c.key] === 'b' ? b[c.key] : [a[c.key], b[c.key]].filter(Boolean).join('\n\n'); });
    const scal = {}; cf.filter((c) => !c.text && !c.list && !['category', 'primary', 'type', 'primaryContact'].includes(c.key)).forEach((c) => { scal[c.key] = pick[c.key] === 'b' ? b[c.key] : a[c.key]; });
    if (isC) {
      const prim = pick.primary === 'b' ? (b.tags.includes('pa') ? 'pa' : 'pi') : pick.primary === 'a' ? (a.tags.includes('pa') ? 'pa' : 'pi') : null;
      mergeContacts(a, b); // a past link only on the other record stays past
      Object.assign(a, scal); Object.entries(keepText).forEach(([k, v]) => { a[k] = v; if (k === 'info') delete a.infoHtml; });
      if (prim) { a.tags = a.tags.filter((t) => t !== 'pa' && t !== 'pi'); a.tags.push(prim); } else if (a.tags.includes('pa') && a.tags.includes('pi')) a.tags = a.tags.filter((t) => t !== 'pi');
      reindex(); if (chosenCat) setOne(a, chosenCat); touch(a);
    } else {
      const typeB = isClientBiz(b), typeA = isClientBiz(a); const primB = b.primaryContact;
      a.phones = [...(a.phones || []), ...(b.phones || []).filter((p) => !(a.phones || []).some((q) => lastDigits(q.value) === lastDigits(p.value)))]; a.emails = [...(a.emails || []), ...(b.emails || []).filter((p) => !(a.emails || []).some((q) => q.value.toLowerCase() === p.value.toLowerCase()))]; a.postal = [...new Set([...(a.postal || []), ...(b.postal || [])])];
      mergeNotes(a, b, 'business'); a.inactiveReason = a.inactiveReason || b.inactiveReason; a.dnaReason = a.dnaReason || b.dnaReason;
      const pastB = new Set(D.contacts.filter((c) => c.links.some((l) => l.bid === b.id && l.past)).map((c) => c.id)); const hadA = new Set(D.contacts.filter((c) => c.links.some((l) => l.bid === a.id)).map((c) => c.id));
      mergeBiz(a, b); D.contacts.forEach((c) => { if (pastB.has(c.id) && !hadA.has(c.id)) { c.links = c.links.map((l) => (l.bid === a.id ? { bid: a.id, past: true } : l)); touch(c); } }); // past employees of the other business stay past
      Object.assign(a, scal); Object.entries(keepText).forEach(([k, v]) => { a[k] = v; if (k === 'info') delete a.infoHtml; });
      if (pick.primaryContact === 'b') a.primaryContact = primB; reindex(); if (chosenCat) setBizCat(a, chosenCat);
      if (pick.type) setBizType(a, (pick.type === 'b' ? typeB : typeA) ? 'client' : 'nonclient'); touch(a);
    }
    Object.entries(lists).forEach(([k, v]) => { a[k] = v; }); touch(a);
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
  mergeNotes(keep, other, 'contact'); keep.role = keep.role || other.role; if (isFav(other)) setFav(keep, true); keep.gid = keep.gid || other.gid;
  keep.inactiveReason = keep.inactiveReason || other.inactiveReason; keep.dnaReason = keep.dnaReason || other.dnaReason;
  if ((!keep.photoChoice || keep.photoChoice === 'auto') && other.photoChoice && other.photoChoice !== 'auto') { keep.photoChoice = other.photoChoice; if (other.photoData) keep.photoData = other.photoData; }
  if (other.ice && other.ice.length) { keep.ice = keep.ice || []; other.ice.forEach((i) => { if (i.cid !== keep.id && !keep.ice.some((x) => x.cid === i.cid)) keep.ice.push(i); }); }
  D.contacts.forEach((c) => { if (c !== other && (c.ice || []).some((i) => i.cid === other.id)) { c.ice = c.ice.map((i) => (i.cid === other.id ? { ...i, cid: keep.id } : i)).filter((i, k, arr) => i.cid !== c.id && arr.findIndex((y) => y.cid === i.cid) === k); touch(c); } });
  D.businesses.forEach((b) => { if (b.primaryContact === other.id) { b.primaryContact = keep.id; touch(b); } if ((b.helpers || []).some((x) => x.cid === other.id)) { b.helpers = b.helpers.map((x) => (x.cid === other.id ? { ...x, cid: keep.id } : x)).filter((x, i, arr) => arr.findIndex((y) => helperKey(y) === helperKey(x)) === i); touch(b); } });
  touch(keep); trashContact(other);
}
function mergeBiz(keep, other) {
  if (!keep.abbr) { const on = (other.name || '').trim(); if (other.abbr) keep.abbr = other.abbr; else if (/^[A-Z][A-Z0-9&]{1,7}$/.test(on) && on !== (keep.name || '').trim()) keep.abbr = on; }
  const join = (a, b) => [...new Set([a, b].map((x) => (x || '').trim()).filter(Boolean))].join('\n');
  other.farmLinks.forEach((l) => { const k = keep.farmLinks.find((x) => x.fid === l.fid); if (k) { if (!l.past) delete k.past; } else keep.farmLinks.push({ ...l }); }); keep.pics = [...keep.pics, ...other.pics.filter((p) => !keep.pics.some((q) => q.value === p.value))];
  keep.patientIds = [...keep.patientIds, ...other.patientIds.filter((p) => !keep.patientIds.some((q) => q.value === p.value && q.label === p.label))];
  if ((other.helpers || []).length) { keep.helpers = [...(keep.helpers || []), ...other.helpers.filter((x) => !(keep.helpers || []).some((y) => helperKey(y) === helperKey(x)))]; }
  keep.info = join(keep.info, other.info); mergeNotes(keep, other, 'business'); keep.rating = keep.rating || other.rating; keep.primaryContact = keep.primaryContact || other.primaryContact;
  if (keep.infoHtml || other.infoHtml) keep.infoHtml = [keep.infoHtml || h(keep.info || ''), other.infoHtml || ''].filter(Boolean).join('<br>');
  D.contacts.forEach((c) => { if (c.links.some((l) => l.bid === other.id)) { c.links = c.links.filter((l) => l.bid !== other.id); if (!c.links.some((l) => l.bid === keep.id)) c.links.push({ bid: keep.id }); touch(c); } });
  touch(keep); other.farmLinks = []; trashBiz(other);
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
const LSget = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const LSset = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { } };
let AUTO_DEV = (() => { const u = navigator.userAgent || ''; const m = u.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build|\))/); if (/Android/.test(u)) return m && m[1] && m[1] !== 'K' ? (/^SM-/.test(m[1].trim()) ? 'Samsung ' : '') + m[1].trim() + ' (Android)' : 'Android phone'; if (/iPhone/.test(u)) return 'iPhone'; if (/iPad/.test(u)) return 'iPad'; if (/Windows/.test(u)) return 'Windows PC'; if (/Mac/.test(u)) return 'Mac'; return ''; })();
async function detectDevice() { /* Android shares the model (e.g. SM-S918B / Pixel 8), never the name you gave the phone or its number */
  try { const ua = navigator.userAgentData; if (!ua || !ua.getHighEntropyValues) return AUTO_DEV; const v = await ua.getHighEntropyValues(['model', 'platformVersion']);
    const plat = ua.platform || ''; if (v.model) AUTO_DEV = `${/^SM-/.test(v.model) ? 'Samsung ' : ''}${v.model} (${plat || 'Android'})`; else if (!AUTO_DEV || AUTO_DEV === 'Android phone') AUTO_DEV = plat === 'Windows' ? 'Windows PC' : plat === 'macOS' ? 'Mac' : plat === 'Android' ? 'Android phone' : plat || AUTO_DEV; } catch (e) { }
  return AUTO_DEV;
}
function devInfo() { let nick = LSget('bvt-nick'), dev = LSget('bvt-devmodel'); const old = LSget('bvt-devname');
  if (!nick && old) { const m = old.split(/\s+[–-]\s+/); nick = m[0].replace(/'s (phone|pc|laptop|computer|tablet)$/i, ''); if (!dev && m.length > 1) dev = m.slice(1).join(' – '); }
  return { nick, dev: dev || AUTO_DEV, phone: LSget('bvt-devphone') }; }
const devIsPhone = () => { const t = LSget('bvt-devtype'); if (t) return t === 'phone'; const u = navigator.userAgent || ''; return /iPhone|Android.*Mobile|Mobi/i.test(u); }; // phone → asks for the phone number; computer / tablet → asks whose computer it is
const deviceName = () => { const i = devInfo(); return [i.nick, i.dev].filter(Boolean).join(' – ') || 'Device ' + DEVICE.slice(-4); };
function updHi() { const n = devInfo().nick; const el = document.getElementById('hi'); if (el) el.textContent = n ? 'Hi ' + n : ''; }
// key-order-independent JSON so {value,label} and {label,value} count as the same
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => ((o[kk] = x[kk]), o), {}) : x));
const plain = (r) => { const o = {}; Object.keys(r).forEach((k) => { if (!k.startsWith('_')) o[k] = r[k]; }); return o; };
const recKind = (r) => (r === D.settings ? 'settings' : D.contacts.includes(r) ? 'contacts' : D.businesses.includes(r) ? 'businesses' : D.tags.includes(r) ? 'tags' : (D.routes || []).includes(r) ? 'routes' : (D.farms || []).includes(r) ? 'farms' : null);
const recKeyOf = (kind, r) => (kind === 'settings' ? 'settings' : kind + ':' + r.id);
const recName = (kind, r) => (kind === 'contacts' ? fullName(r) : kind === 'settings' ? 'Settings' : kind === 'farms' ? farmLabel(r) : r.name || '');
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
  const n = items.length; const what = { contacts: 'contact', businesses: 'business', tags: 'tag', settings: 'setting', farms: 'farm', routes: 'route' };
  return `<p style="font-size:16px">${n} ${n === 1 ? 'item' : 'items'} will change. Please check, then confirm:</p><div style="max-height:55dvh;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:6px 10px;background:#fff">${items.slice(0, 60).map((it) => `<div style="padding:6px 0;border-top:1px solid #f0ede8"><div style="font-weight:700">${h(it.name || '')} <span class="hint">${what[it.kind] || ''}</span></div>${it.deleted ? '<div class="hint" style="color:var(--red)">Will go to the trash (you can restore it)</div>' : it.created ? '<div class="hint">New — will be added</div>' : changeRows(it)}</div>`).join('')}${n > 60 ? `<div class="hint" style="padding:6px 0">…and ${n - 60} more</div>` : ''}</div>`;
}
let CATSNAP = new Map(), BIZSNAP = new Map(); const snapCats = () => { CATSNAP = new Map(D.contacts.map((c) => [c.id, catOf(c)])); BIZSNAP = new Map(D.businesses.map((b) => [b.id, bizCat(b)])); };
function baseline() { snapCats(); DISMISS_SNAP = JSON.stringify(D.dismissed || {}); BASE.clear(); KINDS.forEach((k) => D[k].forEach((r) => BASE.set(k + ':' + r.id, stable(plain(r))))); BASE.set('settings', stable(plain(D.settings))); TOUCHED.clear(); PENDING_DEL = []; }
const FIELD_NAMES = { farmLinks: 'farms', turn: 'turn-off pin', fac: 'yard facilities', safety: 'safety status', access: 'access', reception: 'mobile reception', owner: 'owner', photos: 'photos', extra: 'more pins', pinType: 'pin type', biosec: 'biosecurity', svNo: 'Street View not useful', aka: 'also known as', ice: 'ICE contacts', phones: 'phone', gid: 'Google link', first: 'first name', last: 'surname', middle: 'middle name', role: 'role', links: 'businesses', tags: 'tags', mobiles: 'mobile', landlines: 'landline', emails: 'email', postal: 'postal address', info: 'general info', warnings: 'general warnings', starred: 'starred', photoChoice: 'photo', photoData: 'photo', sideNotes: 'side notes', dnaReason: 'Do not answer reason', inactiveReason: 'inactive reason', flags: 'job flags', name: 'name', rating: 'A+ to C category', pics: 'PIC', patientIds: 'patient IDs', farms: 'farms / locations', primaryContact: 'primary contact', primaryRequired: 'primary contact required', type: 'business type', group: 'tag type', photo: 'photo', home: 'homebase', mapsKey: 'Google Maps key', photoPriority: 'photo priority', createdAt: 'created' };
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
function logSlim(v) { /* photos are kept out of the change log (they're big) — undo puts them back from the record by id */
  if (Array.isArray(v)) return v.map(logSlim); if (v && typeof v === 'object') { const o = {}; Object.entries(v).forEach(([k, x]) => { o[k] = k === 'data' && typeof x === 'string' && x.startsWith('data:image') && x.length > 300 ? '[photo]' : logSlim(x); }); return o; } return v; }
function logFat(v, cur) { /* put photo data back from the current record (by photo id) when undoing */ const pool = new Map(); (function walk(x) { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if (x.id && typeof x.data === 'string' && x.data.startsWith('data:image')) pool.set(x.id, x.data); Object.values(x).forEach(walk); } })(cur);
  return (function fix(x) { if (Array.isArray(x)) return x.map(fix).filter((y) => !(y && y.data === '[photo]')); if (x && typeof x === 'object') { const o = {}; Object.entries(x).forEach(([k, y]) => { o[k] = fix(y); }); if (o.data === '[photo]' && pool.has(o.id)) o.data = pool.get(o.id); return o; } return x; })(v); }
function logChanges(label) {
  if (!D || !BASE.size) return;
  const items = diffTouched(true);
  TOUCHED.clear();
  items.push(...PENDING_DEL); PENDING_DEL = [];
  if (!items.length) return; items.forEach((it) => { ['before', 'after'].forEach((w) => { if (it[w]) it[w] = logSlim(it[w]); }); });
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
  if (f === 'farmLinks') return v.map((l) => { const fm = IDX.farms.get(l.fid); return (fm ? fm.name || fm.address || 'farm' : '(deleted farm)') + (l.past ? ' (not current)' : ''); }).join('; ') || '—';
  if (f === 'turn' || (f === 'location' && v && v.lat != null)) return v && v.lat != null ? `${(+v.lat).toFixed(5)}, ${(+v.lng).toFixed(5)}` : '—';
  if (f === 'fac') return facSummary(v) || '—';
  if (f === 'safety') return v && v.status ? SAFETY[v.status].l + (v.note ? ' — ' + v.note : '') : 'OK';
  if (f === 'access') return v ? [v.notes, v.wet ? WET[v.wet] : ''].filter(Boolean).join(' · ') : '—';
  if (f === 'reception') return v && v.status ? RECEPTION[v.status] + (v.note ? ' — ' + v.note : '') : '—';
  if (f === 'owner') return v ? (v.bid ? IDX.biz.get(v.bid)?.name || '—' : v.text || '—') : '—';
  if (f === 'photos') return v.length + ' photo' + (v.length === 1 ? '' : 's');
  if (f === 'extra') return v.map((x) => pinT(x.type).emoji + ' ' + (x.name || pinT(x.type).name)).join(', ') || '—';
  if (f === 'pinType') return pinT(v).emoji + ' ' + pinT(v).name;
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
function logHay(e) { /* everything searchable in one change: summary, device, names and the before/after values */
  if (e._hay) return e._hay; const parts = [entrySummary(e), e.dev || '', new Date(e.at).toLocaleDateString('en-AU')];
  (e.items || []).forEach((it) => { parts.push(it.name || ''); ['before', 'after'].forEach((w) => { const o = it[w]; if (o) Object.entries(o).forEach(([f, v]) => { parts.push(FIELD_NAMES[f] || f); if (v != null) parts.push(typeof v === 'object' ? JSON.stringify(v) : String(v)); }); }); });
  Object.defineProperty(e, '_hay', { value: parts.join(' \u0001 ').toLowerCase(), enumerable: false }); return e._hay; }
function logFiltered() { const L = D.changelog || [], F = S.logF || {}; const pq = parseQuery(F.q || ''); const from = F.from ? new Date(F.from + 'T00:00').getTime() : 0, to = F.to ? new Date(F.to + 'T23:59:59').getTime() : Infinity;
  return L.filter((e) => (!F.dev || (e.dev || '') === F.dev) && e.at >= from && e.at <= to && (!F.auto || !/^Automatic update/.test(e.label || '')) && (!pq.inc.length && !pq.exc.length ? true : matchQ(logHay(e), pq))); }
function logEntryHtml(e) { return `<details style="border-top:1px solid #f0ede8;padding:8px 0"><summary style="cursor:pointer;list-style:none;display:flex;gap:8px;align-items:flex-start"><div style="flex:1"><div style="font-weight:600;${e.undone ? 'text-decoration:line-through;color:var(--ink3)' : ''}">${h(entrySummary(e))}</div><div class="hint">${new Date(e.at).toLocaleString('en-AU')} · ${h(e.dev || '')}${e.undone ? ' · undone' : ''}${e.undoOf ? ' · undo' : ''}</div></div>${e.undone ? `<button class="btn small" data-act="log-redo" data-id="${e.id}">↷ Redo</button>` : `<button class="btn small" data-act="log-undo" data-id="${e.id}">↶ Undo</button>`}</summary><div style="padding:4px 0 0 4px">${renderLogDetails(e)}</div></details>`; }
function logListHtml() { const R = logFiltered(), F = S.logF || {}; const any = F.q || F.dev || F.from || F.to || F.auto;
  return `${any ? `<div class="hint" style="margin:4px 0">${R.length} matching change${R.length === 1 ? '' : 's'}</div>` : ''}${R.slice(0, S.logShow).map(logEntryHtml).join('') || `<div class="hint">${any ? 'Nothing matches — try fewer words or clear the filters.' : 'No changes yet.'}</div>`}${R.length > S.logShow ? '<div class="actions" style="margin-top:8px"><button class="btn small" data-act="log-more">Show more</button></div>' : ''}`; }
function renderChangeLog() {
  const L = D.changelog || [], F = S.logF || {}; const devs = [...new Set(L.map((e) => e.dev || '').filter(Boolean))].sort();
  return `<div class="card"><h3><span class="sp">Change log</span></h3><div class="hint" style="margin-bottom:6px">Every change on every device, newest first. Undo puts back what was there before that change.</div>
  <div class="logfilters"><input id="log-q" value="${h(F.q || '')}" placeholder="🔍 Search changes — a name, a word that was changed, a phone number…" autocomplete="off">
    <div class="logrow"><select id="log-dev"><option value="">Anyone / any device</option>${devs.map((d) => `<option ${F.dev === d ? 'selected' : ''}>${h(d)}</option>`).join('')}</select>
    <label>From <input type="date" id="log-from" value="${h(F.from || '')}"></label><label>To <input type="date" id="log-to" value="${h(F.to || '')}"></label>
    <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="log-auto" ${F.auto ? 'checked' : ''}> Hide automatic updates</label>${F.q || F.dev || F.from || F.to || F.auto ? '<button class="btn small" data-act="log-clear">Clear</button>' : ''}</div>
    <div class="hint">Searches what changed, who and which device, names, and the old and new text. Use "quotes" for an exact phrase, -word to leave out.</div></div>
  <div id="log-list">${logListHtml()}</div></div>`;
}
document.addEventListener('input', (e) => { const t = e.target; if (!['log-q', 'log-dev', 'log-from', 'log-to', 'log-auto'].includes(t.id)) return; S.logF = { q: $('#log-q').value, dev: $('#log-dev').value, from: $('#log-from').value, to: $('#log-to').value, auto: $('#log-auto').checked }; S.logShow = 30; clearTimeout(S.logT); S.logT = setTimeout(() => { const el = $('#log-list'); if (el) el.innerHTML = logListHtml(); }, t.id === 'log-q' ? 200 : 0); });
document.addEventListener('change', (e) => { if (['log-dev', 'log-from', 'log-to', 'log-auto'].includes(e.target.id)) e.target.dispatchEvent(new Event('input', { bubbles: true })); });
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
    if (it.created) { if (!r) return; if (it.kind === 'contacts') trashContact(r); else if (it.kind === 'businesses') trashBiz(r); else if (it.kind === 'tags') { D.tags = D.tags.filter((t) => t !== r); D.deleted.push({ id: r.id, kind: 'tags', at: Date.now() }); } else if (it.kind === 'farms') { const ub = D.businesses.find((b) => b.farmLinks.some((l) => l.fid === r.id)); D.businesses.forEach((b) => { if (b.farmLinks.some((l) => l.fid === r.id)) unlinkFarm(b, r.id); }); toTrash('farm', r, { bid: ub ? ub.id : (r.owner || {}).bid, bname: ub ? ub.name : '' }); dropFarmRecord(r); } return; }
    if (!r) return;
    Object.keys(it.before).forEach((f) => { if (it.before[f] === null) delete r[f]; else r[f] = logFat(JSON.parse(JSON.stringify(it.before[f])), r); });
    touch(r);
  });
  e.undone = true; D._logDirty = true; photoCache.clear();
  NEXT_LOG_LABEL = lbl; S.skipConfirm = true; changed(); toast('Undone');
}
async function redoEntry(id) { /* puts an undone change back */
  const e = (D.changelog || []).find((x) => x.id === id); if (!e || !e.undone) return;
  const find = (it) => (it.kind === 'settings' ? D.settings : (D[it.kind] || []).find((r) => r.id === it.id)); const dels = e.items.filter((it) => it.deleted).length;
  if (!(await ask(`Redo "${entrySummary(e)}"?\n\nThis puts the change back the way it was before it was undone.${dels ? `\n\n${dels} deletion${dels === 1 ? '' : 's'} in it can't be redone automatically — delete ${dels === 1 ? 'it' : 'them'} again by hand if needed.` : ''}`, 'Yes — redo it'))) return;
  e.items.forEach((it) => { if (it.deleted) return; let r = find(it);
    if (it.created) { if (!r) { const t = (D.trash || []).filter((x) => !x.removed && x.rec && x.rec.id === it.id).pop(); if (t) restoreTrash(t.tid); } return; }
    if (!r) return; Object.keys(it.after).forEach((f) => { if (it.after[f] === null) delete r[f]; else r[f] = logFat(JSON.parse(JSON.stringify(it.after[f])), r); }); touch(r); });
  e.undone = false; D._logDirty = true; photoCache.clear(); reindex();
  NEXT_LOG_LABEL = 'Redo: ' + entrySummary(e); S.skipConfirm = true; changed(); toast('Redone'); }
let NEXT_LOG_LABEL = null;
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  if (el.dataset.act === 'log-undo') { ev.preventDefault(); undoEntry(el.dataset.id); }
  if (el.dataset.act === 'log-redo') { ev.preventDefault(); redoEntry(el.dataset.id); }
  if (el.dataset.act === 'log-more') { S.logShow += 50; const ll = $('#log-list'); if (ll) ll.innerHTML = logListHtml(); else renderAll(); }
  if (el.dataset.act === 'log-clear') { S.logF = {}; S.logShow = 30; renderAll(); }
  if (el.dataset.act === 'devname-save') { const v = $('#s-nick').value.trim(); if (!v) { toast('Enter a nickname'); return; } const isPh = !!($('#s-dt-phone') && $('#s-dt-phone').checked); if (isPh && $('#s-devphone').value.replace(/\D/g, '').length < 8) { toast('Enter your phone number'); return; } if (!isPh && (!$('#s-devmodel').value.trim() || $('#s-devmodel').value.trim() === AUTO_DEV)) { toast("Enter whose computer this is in Device name (e.g. " + v + "'s computer)"); return; } LSset('bvt-devtype', isPh ? 'phone' : 'computer'); LSset('bvt-nick', v); LSset('bvt-devmodel', $('#s-devmodel').value.trim() === AUTO_DEV ? '' : $('#s-devmodel').value.trim()); if ($('#s-initials') && !/^[A-Za-z]{1,4}$/.test($('#s-initials').value.trim())) { toast('Enter your initials (letters only)'); return; } LSset('bvt-devphone', isPh ? $('#s-devphone').value.trim() : ''); LSset('bvt-initials', $('#s-initials').value.trim().toUpperCase()); LSset('bvt-devname', deviceName()); D._devDirty = true; Sync.soon(); toast('Saved — hi ' + v); updHi(); renderAll(); }
  if (el.dataset.act === 'dev-detect') { detectDevice().then((d) => { $('#s-devmodel').value = d || ''; if (!d) toast("This device doesn't share its model — type a name"); }); }
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
const FIX1019_IDS = new Set(["c2ed35a9069", "c62df5bbf7b", "c4b133ff107", "cac903f7699", "c7bf938bbee", "c70fa59cd5c", "c5c5938bb70", "c432722db10", "cd1fd10cd00", "c3c7cb956d4", "cc996bfe7fe", "c67b8bd496d", "c50bf1bc2e3", "c2605522160", "cf8292a8b79", "c0eab7286ef", "cf1930873c0", "c381e0c415e", "c5bbbe9dba9", "c0685a8b877", "c34d024101a", "c4f93561932", "c5801341e25", "c92f18c769d", "c5e41ee6bb8", "cf7a0d65f04", "c9f2f798aef", "cf67d61ae8c", "c3f5669e516", "c19ec3135f2", "cf6839c543c", "cdceb3e129a", "cdd9f368306", "c02c20cb59c", "c5e772a733a", "ce36eb40c53", "cfe953a6588", "cb377242ede", "c0b241b2dc2", "c7427945f6b", "c472e5a56d5", "cd057d0b2f8", "cf8ec7ded41", "cb0424bd6d0", "ca9105bad10", "ca621ea727b", "c726f50df60", "c0883aec15e", "cf35130a329", "cae0b24161b", "cc9353c5953", "cd5aaba181a", "c76dd8788fc", "c176fe0dc46", "cacb57b473d", "ce13047d080", "cb911f138a8", "cf2402a292b", "cdb32cab13c", "cd0a54a8f48", "c9ac631e49d", "c75c13f7eb7", "ccc7bca179e", "cc552e461b6", "c77c6e9fdae", "c2b5160d08a", "c6a3911ef5d", "c1e1c5715ad", "c8ac1392980", "c2efee8f78a", "cb8d70db393", "c70a3148c35", "c35c190a4e9", "cc1998ffea8", "c1984f2a7e1", "cb6661b2fb3", "c67ab885b3b", "cfd7c18e175", "c2bf073148d", "c8a10bec12c", "c7a4a5cf7f1", "c88cebefcfb", "c44f5d10342", "cd5686a8500", "c08c83002d5", "cb902d1cee1", "cd497b402f4", "c18bc7c1274", "c26232e011c", "c850f1c9e5c", "cce6d6cb148", "c16e2060459", "c26035c747d", "c8d9684bfe0", "c568e9efcd9", "cb775cb62b8", "c76c8963c70", "cb2f7e101a7", "c35e996c51d", "c7a818aa2e1", "c0002892002", "cc0bf745c58", "c7625774383", "c6523105f41", "c682684c345", "ce1ad4cf4cd", "c52c9fba1b0", "cfe445fff75", "c88eeb25ec2", "cccc05543a1", "c6956a321df", "c15c3e9a6a8", "c9209517e41", "c004f8b83b3", "c58a7961333", "ca5aae01695", "cb81ccee1b5", "c438d2cf970", "c738e88c3ee", "cc3cd06c8d6", "cb397793713", "c896a960264", "c4affb9b582", "ce30496646a", "c9b0d756e43", "c3b72c23fd0", "c371f3f3492", "cc08d28c4fe", "c9c083bad71", "c82b7e194fb", "c5066adf7cf", "c1e3478d1c0", "cb98ecc68ae", "c29b889388b", "c59cfac164f", "cb9becd8972", "c91b3664f96", "c59b6c4b34e", "c01949a3b09", "cc92719dd5c", "c4b696d1c8c", "c9243b0c6db", "c6d053db9f8", "c296ed7a742", "c3531ace1f9", "c36d43c4b61", "cb4ab3b6bdf", "c359e7ae04d", "cc00f1f468a", "cd54326e840", "cb9eb24673c", "ca3b2f70220", "c18e26c1576", "c2ae8d9ab0f", "caa690b9b46", "c72d5b3001c", "c0d5dd41a6f", "c2cbaab2329", "c1f4d3da3d9", "c2160d952ba", "c2ea958df55", "cae2231794f", "c566d89627f", "c102f86b1d3", "ca8500ecc79", "ce958751ad3", "cb7db1be8f2", "c7937d0843e", "c1d79dbcac8", "cb513b8a238", "cea8fcf6618", "c7ecc59283d", "c6402df40f7", "cb47d03fe14", "c80be35460e", "ced20156ee3", "cedd97aaaec", "c60f3817b38", "cce566ad89e", "cfc128dd9c8", "ca1d65a6c1c", "ccb58f9de3b", "cba898e45a4", "c7f242dd7ed", "c06e30baf5c", "c48591ba101", "c3b090af395", "c6bd59addb1", "ccca9f25f90", "c10da2bca5e", "c7a09610b74", "c279117b954", "c95f516fc51", "c14604a61ef", "ca8941a634e", "c4b48581724", "ce9c5b4de0f", "c66421cb941", "c96aa4cbe52", "c4969912587", "cea8ed4b0f2", "c0f167c8257", "cdf4c556543", "c54a4336ee6", "c14868e9ab1", "cefda292302", "c4ef8fe3980", "c7b58b49a85", "c4e227f1237", "cb7229e9a33", "cd7ec9eef0e", "c1aeb801e51", "cd4870af241", "cb8adee3c34", "c874b86dfbd", "c97a0957159", "c1dcf21d20c", "ca2315a98d0", "cff81eba403", "cd10982d955", "c96f4f079f0", "c1f7a820edf", "c2bfee92c32", "cb26e10d4bd", "ceda4c11355", "c6818ad460d", "c2a90e3a7a6", "c4c1280b682", "ceb5ae57711", "c8a0d34c474", "cfa1dbedb76", "c3ce0bc304b", "cf8d2332ffb", "cf3252cb118", "c217eb78987", "c47652597b9", "c18a2bce8ab", "c2e4e6b6415", "c1311115f34", "cab6c8196bc", "c717631bb62", "c5a728f4702", "c5a3fdb3f6f", "c8c3e8b9ed4", "c691873de7b", "c3621dbd378", "c2001ae1098", "c98a4aa50ca", "cc4b61e11b6", "c05c3c22ec0", "c71d3cb1b3a", "c37d88555cc", "c04597dc464", "c79fd139652", "c833721937a", "c45135228cc", "ced5767e088", "ce79f974fd8", "ccdbf935729", "c2b513a0c66", "cf6d4a92d5f", "cec69730489", "cc4d8bb690d", "cec89f03554", "ce83b9de052", "c3054f4b923", "c5005e04de2", "cc80064be3f", "c45d50c39ea", "ce1124f1ff6", "cf6a05fb8b4", "c8be34299ad", "ceebd7c7ac7", "c3e46ca3d51", "cf6d28f5368", "ce3632790d8", "cbcedf6fa41", "ce81fa07ea9", "c70539eced4", "ce842a3f9f8", "cf4c0944fbf", "c85cc9de3b9", "c2cec8f5ee6", "c04cc314158", "c6d4d405ccc", "c99df6cd7b5", "cc98a1539b3", "c144e059535", "c87d97cbcfe", "c4868cd7f51", "c81ac2c96f8", "c36353e396f", "ce8d6ad960b", "cc7531c6b5a", "c3653e0d84c", "c93db1ce04b", "c1d4bcb428d", "c73ce469f22", "cf71bd30e15", "cd6b341e4e0", "c37260fc8e8", "cb2c18e517d", "cbd1e2efba9", "c60b19df7ef", "c72a1f4db59", "c2d65191450", "c8e69b333f1", "c6e01deddd6", "c6eda98f68b", "cf6b0ba5262", "cbd1613536e", "c4dd3ad3546", "cb07374ac0b", "ccd97bfa7d2", "c23ed54ac0b", "ce35d682a95", "c2197e12a4c", "ced1fea2520", "c5091d6422b", "cf74aa17c3c", "c956180bb77", "cfed427380f", "c9d45a0c73c", "cd0e05437ce", "c3bf2581a3d", "c5d10f4433f", "ca7f5e7d091", "ce110a31f0b", "c5516ab272f", "c20ca2838fd", "ce2ba49db1c", "cfd7df493bd", "cd6dc549c4d", "c6e8eb1084a", "c89e3847b6a", "cfee7147a79", "c1fc1a248b0", "ca1bd02bf78", "c839544a190", "c148ba74b78", "cd344ab762f", "c2a37ca06e9", "c6a25072ab6", "c65ad4d8154", "cf950f3deb0", "c1018f7744d", "cff5fe45779", "c8c316d4be7", "cf95be0a0b8", "c73a87d0678", "cc8342a15c0", "c76b8ad271b", "cd50b2f6c1e", "c3fd70c9d8a", "c9f68ba96ac", "cce2db8ad74", "cc8906dd597", "c474e8f6533", "c5cdb942c2f", "c8b42bec877", "ccf84d7d0e2", "c272bcecd2b", "ce0268c15a5", "cca1ac2da7a", "cedbd368141", "c89dd4db628", "c113a790fe8", "c56d3060c43", "c83a8ab789a", "c25f2dc03e8", "cf2cfd62c3b", "c28c0ac2629", "c81f607c182", "c41b37f23dc", "cb7bdd7feb1", "c4cdeb1db5d", "c4a3a05be2e", "c26c7bc0703", "cebba94feb7", "ce52205eb15", "c88737a12b9", "c06eb5584c9", "c2ab4f76c7c", "cbed9e5ea45", "c92f9adf818", "c21072b3e9e", "c492fc7ec9b", "c962a165f5f", "c870b2afde4", "c51f2414b16", "cf28621ab95", "cb0fe79fd44", "c322a404d97", "ceaef72b290", "c85bc15f22f", "c819548bd39", "c5a1b5e301e", "cc25b397b06", "cfec4005bcf", "c84bdfd8379", "c48e04e0656", "cbd3af60bfa", "c3b2e66a618", "c8251f020e7", "c342465e9cb", "ca3c0f37bae", "c603fd5d30e", "c5041f419d3", "ca4f1b98a46", "c8f16f5f618", "cbf94a2a8f1", "c9e343b0d37", "c120c932341", "c51e8117313", "c4b6e905422", "c76de7f8902", "cf40334eb20", "cb7f1ceb604", "c44c25af411", "cfcc7aecbd5", "cbba794d247", "cda4fdb2d98", "c6a07b060e7", "c61909702a8", "c2f4144897d", "c2209478d7c", "c9c48b9a633", "c19ab925b31", "cd138c93f56", "c6a31120ed3", "c1125b9acee", "c61d939f019", "c7bc277b39f", "c507fcee28f", "c81b9c32535", "c92af66a722", "cd139c9058a", "c1ef583f5b1", "c69ff188bff", "cb56130283c", "caad25eb2ec", "cbb914ca9b5", "cc0ca3c3832", "c9a6a22731d", "cd505963f63", "cef051f3ebc", "c924b8bc5a8", "ceab004144e", "c359cac340b", "c68acfff10c", "cc24fe42a68", "c2006d90384", "ce937293eb5", "c1b48660405", "c3ff15be88e", "c1f17973ea8", "cfdfc29d59c", "ce7648ef2a8", "c8e1f2fc7b6", "c90ac35da2f", "c74ad940c85", "cead0ef88bb", "c5b58450a07", "c014aaa3c2a", "ca9c505dc93", "ccb07f363d6", "c4313c7d413", "c88fd53c35a", "cbf76341d0d", "c79c259ff40", "c1c91ae071d", "c5dea84f6a5", "cf827e3d36c", "ca00484be72", "cc4279b3fc1", "c166ad36a94", "cced0afd610", "c5047bb7e96", "c5f6c97bb45", "cafb4cf6487", "c753c1627f7", "cc701383295", "c2bd39d5f57", "c86a0036685", "c3de09b20fb", "cc106811382", "c37998514f5", "cbec1500834", "cb41440629a", "c1ec7575eb4", "c1584dba0fc", "c30e8c09c3a", "c2a9d3b46f8", "c2f0d6a7a10", "ca898539c2c", "c249f8673f0", "c4361af70bb", "c37ae9fe4aa", "c00ca42ae4b", "c187dac5a19", "c5d9ae0aa77", "c4810c50c2e", "c05c72c015d", "c4772d54008", "cd4e8965982", "c758dec9291", "c13a95f9911", "c4ffd7f4ff0", "c581182a66c", "cbe45ef77c9", "c1976faf891", "cb7a45becbd", "c1fb40e8848", "c3f59f14456"]); // contacts whose "follow the business" category was switched off by a one-time update re-running on Ally's phone (19 Oct 13:10)
const dedupeWords = (t) => String(t || '').replace(/\b([\w'’]+)((?:\s+\1\b)+)/gi, '$1').replace(/\s{2,}/g, ' ').trim(); // "Home farm farm" → "Home farm"
function migrate() {
  if (!D || !D.contacts.length) return false;
  let ch = false;
  { const linked = new Set(D.businesses.flatMap((b) => b.farmLinks.map((l) => l.fid))); D.farms.forEach((f) => { if (linked.has(f.id)) return; const ob = f.owner && f.owner.bid && D.businesses.find((b) => b.id === f.owner.bid); if (ob) { linkFarm(ob, f); ch = true; } }); } // yards lost from their business in a sync clash go back to the business that owns them
  if (!D.settings.farmWord1) { let n = 0; const rx = /\b(cattle\s*(?:&|and)\s*sheep|sheep\s*(?:&|and)\s*cattle|cattle|sheep)\s+yards\b/gi; // "cattle yards", "sheep yards", "cattle & sheep yards" → "farm"
    D.farms.forEach((f) => { if (!f.name || !rx.test(f.name)) return; rx.lastIndex = 0; f.name = f.name.replace(rx, (m) => (/^[A-Z]/.test(m) ? 'Farm' : 'farm')).replace(/\s{2,}/g, ' ').trim(); touch(f); n++; });
    D.settings.farmWord1 = n || 1; touch(D.settings); ch = true; }
  if (!D.settings.photoSig1) { D.contacts.forEach((c) => { if (chosenPhoto(c) && c.photoCats == null) { c.photoCats = catSig(c); touch(c); } }); D.businesses.forEach((b) => { if (chosenPhoto(b) && b.photoCats == null) { b.photoCats = bizSig(b); touch(b); } }); D.settings.photoSig1 = true; touch(D.settings); }
  if (!D.settings.dna2) { D.contacts.forEach((c) => { if (!followsBiz(c) || catOf(c) !== 'dna') return; const b = bizOf(c).find((x) => bizCat(x) === 'dna'); if (!b) return; const r = c.dnaReason || b.dnaReason || ''; c.dnaFollow = true; c.dnaBy = b.id; setOwn(c, 'dna'); if (r) c.dnaReason = r; touch(c); }); D.settings.dna2 = true; touch(D.settings); }
  if (!D.settings.inact2) { D.contacts.forEach((c) => { if (!followsBiz(c) || catOf(c) !== 'inactive') return; const b = bizOf(c).find((x) => bizCat(x) === 'inactive'); if (!b) return; const r = c.inactiveReason || b.inactiveReason || ''; c.inactFollow = true; c.inactBy = b.id; setOwn(c, 'inactive'); if (r) c.inactiveReason = r; touch(c); }); D.settings.inact2 = true; touch(D.settings); }
  if (!D.settings.nmUnderRel) { const L = (D.settings.layout || {}).contact; if (L && L.includes('related') && L.includes('nomention')) { const o = L.filter((k) => k !== 'nomention'); o.splice(o.indexOf('related') + 1, 0, 'nomention'); D.settings.layout = { ...D.settings.layout, contact: o }; } D.settings.nmUnderRel = true; touch(D.settings); }
  if (!D.settings.pinNames2) { if (D.settings.pinTypes && D.settings.pinTypes.length) { D.settings.pinTypes = D.settings.pinTypes.map((t) => (t.id === 'office' ? { ...t, name: /house/i.test(t.name) || t.name === 'Main office / house' ? 'Main office' : t.name, emoji: t.emoji === '🏡' ? '🏢' : t.emoji } : t.id === 'depot' ? { ...t, emoji: t.emoji === '🏬' ? '🚚' : t.emoji } : t)); } D.settings.pinNames2 = 1; touch(D.settings); ch = true; }
  if (!D.settings.farmWord2) { D.farms.forEach((f) => { const nn = dedupeWords(f.name); if (f.name && nn !== f.name) { f.name = nn; touch(f); } }); D.settings.farmWord2 = 1; touch(D.settings); ch = true; }
  if (!D.settings.fix1019) { let n = 0;
    D.contacts.forEach((c) => { if (FIX1019_IDS.has(c.id) && c.ownCats && c._dev === 'dev0s5z8mazhf3e') { c.ownCats = false; touch(c); n++; } });
    const js = D.contacts.find((c) => c.infoMove && String(c.infoMove.at) === '1792386625160'); // Jess's own info (birthday, bank details) was moved onto Avago Grazing by mistake — put it back
    if (js) { const b = IDX.biz.get(js.infoMove.bid); const blk = js.infoMove.block || ''; if (b && blk && (b.info || '').includes(blk)) { b.info = b.info.replace('\n\n' + blk, '').replace(blk, '').trim(); delete b.infoHtml; touch(b); } js.info = blk.replace(/^\*From [^*]*\*\n/, ''); delete js.infoHtml; delete js.infoMove; touch(js); }
    if (!D.settings.photoPriority) D.settings.photoPriority = ["dna", "payup", "newassess", "newmaybe", "inactive", "aplus", "a", "b", "c", "bvs", "bfriends", "sheepreg", "sheepocc", "occ", "industry", "prac", "phone"];
    if (!D.settings.turnPin) D.settings.turnPin = { name: 'Turn-off', emoji: '🚗' };
    D.settings.fix1019 = n || 1; touch(D.settings); ch = true; }
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
  if (!D.settings.catsV2 && D.businesses.some((b) => Array.isArray(b.cats))) { D.settings.catsV2 = true; touch(D.settings); ch = true; } // already done on another device
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
      b.farms.forEach((f) => { if (f.seeWarning) { f.warningWas = f.warning || '(flagged, no text)'; addToWarnSection(f, (f.warning || '').trim() || 'This farm was flagged "see warning" — check the farm info'); f.warning = ''; f.seeWarning = false; t = true; touch(f); } }); if (t) touch(b); });
    D.settings.warnBack1 = true; touch(D.settings); ch = true;
  }
  if (!D.settings.picFix1) { // drop "(found in notes)"; split "WFAY2899 (previously WBMC0061)" into PIC + note
    D.businesses.forEach((b) => { let t = false; b.pics.forEach((p) => { if (/found in notes/i.test(p.label || '')) { p.label = ''; t = true; } const v = (p.value || '').trim(); const m = v.match(/^(W[A-Z]{3}\d{4})\b\s*[(,-]?\s*(.*?)\)?\s*$/i); if (m && v !== m[1].toUpperCase()) { p.value = m[1].toUpperCase(); if (m[2] && !p.label) p.label = m[2]; t = true; } }); if (t) touch(b); });
    D.settings.picFix1 = true; touch(D.settings); ch = true;
  }
  D.contacts.forEach((c) => { if (c.photoChoice && c.photoChoice !== 'auto' && effChoice(c) === 'auto') { c.photoChoice = 'auto'; touch(c); ch = true; } }); /* drop photo choices for categories the contact no longer has */
  if (!D.settings.farmShare1) { [...D.farms].forEach((f) => { if (!f.sharedWith || !D.farms.includes(f)) return; const o = IDX.farms.get(f.sharedWith); delete f.sharedWith; touch(f); if (o && o !== f && D.farms.includes(o)) combineFarms(f, o); }); D.settings.farmShare1 = true; touch(D.settings); ch = true; reindex(); }
  if (!D.settings.biosec1 && D.businesses.length) { const add = (b, txt) => { if (!b) return; if ((b.biosec || '').toLowerCase().includes(txt.toLowerCase().slice(0, 12))) return; b.biosec = [b.biosec, txt].filter((x) => (x || '').trim()).join('\n'); touch(b); };
    D.businesses.filter((b) => /^pyle bros\b/i.test(b.name.trim())).forEach((b) => add(b, 'Ovine footrot.'));
    const pigs = 'Has pigs — don\'t visit if you\'ve been near pigs in the last week.';
    D.contacts.filter((c) => /^sean hunter$/i.test(fullName(c).trim()) || /^flavel$/i.test((c.last || '').trim()) || /\bflavel\b/i.test(fullName(c))).forEach((c) => bizOf(c).forEach((b) => add(b, pigs)));
    D.businesses.filter((b) => /\bflavel/i.test(b.name)).forEach((b) => add(b, pigs));
    D.settings.biosec1 = true; touch(D.settings); ch = true; }
  if (!D.settings.nodairy) { /* Dairy pins become Cattle yards pins */ D.farms.forEach((f) => { let t = false; if (f.pinType === 'dairy') { f.pinType = 'cattle'; t = true; } (f.extra || []).forEach((x) => { if (x.type === 'dairy') { x.type = 'cattle'; t = true; } }); if (t) touch(f); });
    if ((D.settings.pinTypes || []).some((x) => x.id === 'dairy')) D.settings.pinTypes = D.settings.pinTypes.filter((x) => x.id !== 'dairy'); D.settings.nodairy = 1; touch(D.settings); }
  if (!D.settings.pinfix1) { D.farms.forEach((f) => { const us = farmUsersOf(f.id); if (us.length && us.every((u) => !isClientBiz(u.b)) && f.pinType === 'cattle' && !/yard|cattle|sheep|feedlot|dairy|shed|stock/i.test(f.name || '')) { f.pinType = /office|home|house|head/i.test(f.name || '') ? 'office' : /depot|store|warehouse/i.test(f.name || '') ? 'depot' : /sale/i.test(f.name || '') ? 'saleyard' : 'other'; touch(f); } }); D.settings.pinfix1 = true; touch(D.settings); ch = true; } /* non-client locations aren't cattle yards unless they say so */
  if (!D.settings.kmv1) { D.farms.forEach((f) => { if (f.kmStatus === 'needs-verify') { f.kmStatus = 'verified'; touch(f); } }); D.settings.kmv1 = true; touch(D.settings); ch = true; } /* all checked by hand — the distance is now confirmed when it's entered */
  if (!D.settings.labels2) { const L = D.settings.labels || {}; if (L.contacts === 'People') { delete L.contacts; D.settings.labels = L; } D.settings.labels2 = true; touch(D.settings); ch = true; }
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
    case 'tab': if (FMAP) { FMAP.remove(); FMAP = null; FMAP_LAYER = null; } S.backTo = null; S.tab = d.v; S.sel = null; if (d.v === 'contacts') S.q = ''; if (d.v === 'biz') S.bq = ''; if (d.v === 'loc') S.lq = ''; /* every menu starts afresh */ document.body.classList.remove('show-detail'); renderAll(); $('#list').scrollTop = 0; break;
    case 'open': {
      if (el.closest('#sheet')) { if (sheetDirty() && !(await ask('Open this and close the edit window without saving your changes?', 'Yes — open it'))) break; closeSheet(); }
      if (el.closest('#askbox')) closeAsk(false); if (el.closest('.svfull')) { document.querySelectorAll('.svfull').forEach((x) => x.remove()); document.body.classList.remove('svfopen'); }
      if (!['contacts', 'biz', 'loc'].includes(S.tab)) { S.backTo = S.tab; S.tab = d.kind === 'business' ? 'biz' : 'contacts'; }
      S.sel = { kind: d.kind, id: d.id }; renderAll(); $('#detail').scrollTop = 0; break;
    }
    case 'back': case 'nav-back': navBack(); break;
    case 'quick': S.quick[d.v] = !S.quick[d.v]; renderContactList(); break;
    case 'tagf': { const cur = S.tagF[d.v]; if (!cur) S.tagF[d.v] = 'inc'; else if (cur === 'inc') S.tagF[d.v] = 'exc'; else delete S.tagF[d.v]; renderContactList(); break; }
    case 'clear': e.preventDefault(); S.q = ''; S.tagF = {}; S.quick = {}; renderContactList(); break;
    case 'star': { const c = D.contacts.find((x) => x.id === d.id); if (!c) break; setFav(c, !isFav(c)); toast(isFav(c) ? '★ Added to your favourites' : 'Removed from your favourites'); renderAll(); break; }
    case 'new-contact': editContact(null); break;
    case 'edit-contact': editContact(D.contacts.find((x) => x.id === d.id)); if (d.jump) jumpTo(d.jump); break;
    case 'new-biz': editBiz(null); break;
    case 'edit-biz': editBiz(IDX.biz.get(d.id)); if (d.jump) jumpTo(d.jump); break;
    case 'add-farm': { const b = IDX.biz.get(d.bid); if (!b) break; const lw = locWord(b).toLowerCase();
      const r = await askBox('Add a ' + lw + ' to ' + b.name, `<p>Is this a <b>new</b> ${h(lw)} that isn't in the app yet, or one that's <b>already in the app</b> (e.g. yards shared with another business, or a lease block) that just needs linking?</p>`, '➕ New — add it', false, 'Cancel', '🔗 Existing — find and link it');
      if (r === true) editFarm(b, null); else if (r === 'alt') openSheet('Link an existing ' + lw + ' — ' + b.name, `<div class="hint" style="margin-bottom:8px">Search by farm or yards name, address, or the business that uses or owns it, then tap it to link.</div><input id="farm-linksearch2" data-bid="${b.id}" placeholder="🔍 Search farms and yards" autocomplete="off" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:9px;font-size:16px"><div id="farm-linkres2"></div><div class="actions" style="margin-top:10px"><button type="button" class="btn small" data-act="farm-link-new" data-bid="${b.id}">Not found? ➕ Add it as a new ${h(lw)}</button></div>`, () => { toast('Tap a farm in the list to link it'); return false; }), setTimeout(() => { const i = $('#farm-linksearch2'); if (i) i.focus(); }, 50);
      break; }
    case 'farm-merge': { const f = IDX.farms.get(d.fid), b = IDX.biz.get(d.bid); if (!f || !b) break; if (sheetDirty() && !(await ask('Merging closes this window without saving your changes here. Carry on?', 'Yes — carry on'))) break; closeSheet();
      openSheet('Merge yards — ' + farmLabel(f), `<div class="hint" style="margin-bottom:8px">Find the other farm or yards that are really the same place as <b>${h(farmLabel(f))}</b>. They become one shared farm used by every business that used either.</div><input id="farm-mergesearch" data-fid="${f.id}" placeholder="🔍 Search farms and yards — name, address or business" autocomplete="off" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:9px;font-size:16px"><div id="farm-mergeres"></div>`, () => { toast('Tap the yards to merge with'); return false; }); setTimeout(() => { const i = $('#farm-mergesearch'); if (i) i.focus(); }, 50); break; }
    case 'farm-merge-pick': { const a = IDX.farms.get(d.fid), o = IDX.farms.get(d.oid); if (!a || !o) break; const pin = (x) => (x.lat != null ? `${pinT(x.pinType).emoji} yards pin` : 'no yards pin') + (x.turn && x.turn.lat != null ? ` · ${turnPin().emoji} turn-off` : '') + (x.kmReturn != null ? ` · ${x.kmReturn} km` : '');
      void pin; closeSheet(); farmMergeSheet(a, o, () => toast('Merged — now one shared farm')); break; }
    case 'job-q-clear': S.jobQ = ''; renderAll(); break;
    case 'orphan-link': { const f = IDX.farms.get(d.fid), b = IDX.biz.get(d.bid); if (!f || !b) break; closeSheet(); linkFarm(b, f); NEXT_LOG_LABEL = `Linked ${farmLabel(f)} to ${b.name}`; S.skipConfirm = true; if (await changed()) toast('Linked to ' + b.name); break; }
    case 'orphan-pick': { const f = IDX.farms.get(d.fid); if (!f) break; openSheet('Link ' + (f.name || 'farm') + ' to a business', `<input id="orphan-search" data-fid="${f.id}" placeholder="🔍 Search businesses" autocomplete="off" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:9px;font-size:16px"><div id="orphan-res"></div>`, () => { toast('Tap a business'); return false; }); setTimeout(() => { const i = $('#orphan-search'); if (i) i.focus(); }, 50); break; }
    case 'fuser-pick': { if (!SHEET_FARM) break; const b = IDX.biz.get(d.bid); if (!b) break; SHEET_FARM.users[b.id] = 'cur'; $('#e-fuseradd').value = ''; $('#e-fuserres').innerHTML = ''; fuRender(); toast(b.name + ' added — tap Save'); break; }
    case 'fu-owner': { const b = IDX.biz.get(d.bid); if (!b) break; $('#e-fowner').value = b.name; $('#e-fowner-bid').value = b.id; $('#e-fowner-cid').value = ''; const r0 = $('#e-fowner-res'); if (r0) r0.innerHTML = ''; fuRender(); break; }
    case 'bulk-rename': { const K = d.k; const recs = K === 'farm' ? [...S.advLSel].map((id) => IDX.farms.get(id)).filter(Boolean) : K === 'biz' ? [...S.advBSel].map((id) => IDX.biz.get(id)).filter(Boolean) : [...S.advSel].map((id) => D.contacts.find((c) => c.id === id)).filter(Boolean); if (!recs.length) break;
      const fields = K === 'farm' ? [['name', 'Farm name']] : K === 'biz' ? [['name', 'Business name']] : [['first', 'First name'], ['last', 'Surname'], ['pref', 'Preferred name']];
      const r = await askBox(`Rename ${recs.length} ${K === 'farm' ? 'farm' : K === 'biz' ? 'business' : 'contact'}${recs.length === 1 ? '' : K === 'biz' ? 'es' : 's'}`, `${fields.length > 1 ? `<div class="f"><span class="lbl">Change the</span><select data-ask="field" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px">${fields.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>` : ''}
        <div class="f"><span class="lbl">Find</span><input data-ask="find" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:9px;font-size:16px"></div><div class="f"><span class="lbl">Replace with</span><input data-ask="rep" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:9px;font-size:16px"></div>
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-askchk="whole" checked> Whole words only</label><div class="hint" style="margin-top:6px">Capitals don't matter. Doubled words (e.g. "farm farm") are fixed automatically. You'll see every change before it's saved.</div>`, 'Next — check changes', false, 'Cancel');
      if (!r) break; const field = ASK_FORM.field || fields[0][0], find = (ASK_FORM.find || '').trim(), repl = (ASK_FORM.rep || '').trim(); if (!find) { toast('Type what to find'); break; }
      const esc = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const rx = new RegExp(ASK_FORM.whole ? `\\b${esc}\\b` : esc, 'gi');
      const ch = recs.map((x) => { const old = x[field] || ''; const nn = dedupeWords(old.replace(rx, (m) => (repl && /^[A-Z]/.test(m) && /^[a-z]/.test(repl) ? repl[0].toUpperCase() + repl.slice(1) : repl))); return { x, old, nn }; }).filter((c) => c.nn !== c.old);
      if (!ch.length) { toast('Nothing to change — no names contain that'); break; }
      if (!(await askBox('Check the changes', `<p>${ch.length} of ${recs.length} will change:</p><div style="max-height:50vh;overflow:auto">${ch.map((c) => `<div class="kv"><div class="v"><s class="hint">${h(c.old)}</s><br><b>${h(c.nn || '(empty)')}</b></div></div>`).join('')}</div>`, `✓ Rename ${ch.length}`, false, 'Cancel'))) break;
      ch.forEach((c) => { c.x[field] = c.nn; touch(c.x); }); reindex(); NEXT_LOG_LABEL = `Bulk rename: "${find}" → "${repl}" (${ch.length})`; S.skipConfirm = true; if (await changed()) toast(`✓ ${ch.length} renamed`); break; }
    case 'farm-mv': { const b = IDX.biz.get(d.bid); if (!b) break; const all = sortFarms(b, [...b.farms, ...b.pastFarms]).map((f) => f.id); const shown = sortFarms(b, b.farms.filter((f) => ownedBy(f, b))).map((f) => f.id); const i = shown.indexOf(d.fid), j = i + +d.dir; if (i < 0 || j < 0 || j >= shown.length) break;
      [shown[i], shown[j]] = [shown[j], shown[i]]; b.farmOrder = [...shown, ...all.filter((id) => !shown.includes(id))]; touch(b); NEXT_LOG_LABEL = `Farm order changed: ${b.name}`; S.skipConfirm = true; await changed(); break; }
    case 'lo-mode': { const rec = loRec(d.kind, d.id); if (!rec) break; if (d.key === 'farms') { if (d.v === 'custom' && !(rec.farmOrder || []).length) rec.farmOrder = [...rec.farms, ...rec.pastFarms].slice().sort((x, y) => alphaCmp(x.name || x.address || '', y.name || y.address || '')).map((f) => f.id); }
      else if (d.v === 'custom' && !((rec.listOrder || {})[d.key] || []).length) { const box = el.closest('.card, .d-wrap'); }
      rec.listSort = { ...(rec.listSort || {}), [d.key]: d.v }; touch(rec); NEXT_LOG_LABEL = `List order: ${d.v === 'az' ? 'A–Z' : 'custom'}`; S.skipConfirm = true; await changed(); break; }
    case 'lo-mv': { const rec = loRec(d.kind, d.id); const box = el.closest('[data-dnd]'); if (!rec || !box) break; const ids = [...box.querySelectorAll(':scope > .dragrow')].map((r) => r.dataset.dk); const i = ids.indexOf(d.k), j = i + +d.d; if (i < 0 || j < 0 || j >= ids.length) break; [ids[i], ids[j]] = [ids[j], ids[i]]; rec.listOrder = { ...(rec.listOrder || {}), [d.key]: ids }; touch(rec); NEXT_LOG_LABEL = 'List order changed'; S.skipConfirm = true; await changed(); break; }
    case 'hh-pick': { const b = IDX.biz.get(d.bid); if (!b) break; const o = d.cid ? D.contacts.find((x) => x.id === d.cid) : null; if (!o && !d.name) break; if (!addHelper(b, o, d.name, '')) { toast('Already a happy helper here'); break; } NEXT_LOG_LABEL = `Happy helper added to ${b.name}: ${o ? fullName(o) : d.name}`; S.skipConfirm = true; if (await changed()) toast('🙂 Happy helper added'); break; }
    case 'hh-note': { const b = IDX.biz.get(d.bid); const x = b && (b.helpers || []).find((y) => helperKey(y) === d.k); if (!x) break; const r = await askBox('Note', `<div class="f"><input data-ask="n" value="${h(x.note || '')}" style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"></div>`, 'Save', false, 'Cancel'); if (!r) break; const v = (ASK_FORM.n || '').trim(); if (v) x.note = v; else delete x.note; touch(b); NEXT_LOG_LABEL = `Happy helper note: ${b.name}`; S.skipConfirm = true; await changed(); break; }
    case 'hh-del': { const b = IDX.biz.get(d.bid); if (!b) break; const x = (b.helpers || []).find((y) => helperKey(y) === d.k); if (!x || !(await ask(`Remove ${x.cid ? fullName(D.contacts.find((y) => y.id === x.cid) || { first: '' }) : x.name} as a happy helper at ${b.name}?`, 'Yes — remove'))) break; b.helpers = b.helpers.filter((y) => y !== x); if (!b.helpers.length) delete b.helpers; touch(b); NEXT_LOG_LABEL = `Happy helper removed from ${b.name}`; S.skipConfirm = true; await changed(); break; }
    case 'hhjob-apply': case 'hhjob-edit': { const c = D.contacts.find((x) => x.id === d.cid); if (!c) break; const props = helperProps(c); const p = d.line != null ? props.find((x) => x.line === d.line) : null; const lines = p ? [p] : props; const bs = bizOf(c);
      if (!bs.length) { toast(`${fullName(c)} isn't linked to a business — link one first`); break; }
      let picked = lines.flatMap((x) => x.names); let target = bs[0], rm = true;
      if (a === 'hhjob-edit' || bs.length > 1) { const inp = 'style="padding:8px;border:1px solid var(--line);border-radius:8px;font-size:15px"'; S.rrN = 0; const row = (nm) => { const i = S.rrN++; return `<div class="relrow" style="border:1px solid var(--line);border-radius:9px;padding:8px;margin:6px 0"><div style="display:flex;gap:6px;flex-wrap:wrap"><input class="rr-who" data-ask="rw${i}" value="${h(nm ? (nm.o ? fullName(nm.o) : nm.text) : '')}" autocomplete="off" ${inp} style="flex:2 1 160px"><input data-ask="rn${i}" value="${h(nm ? nm.note : '')}" ${inp} style="flex:1 1 120px"><input type="hidden" data-ask="rc${i}" class="rr-cid" value="${nm && nm.o ? nm.o.id : ''}"><button type="button" class="btn small" onclick="this.closest('.relrow').remove()" title="Don't add">✕</button></div><div class="rr-res"></div><div class="hint rr-st">${nm && nm.o ? '✓ In the app' : nm ? 'Name only — or tap a match' : ''}</div></div>`; };
        const r = await askBox('Happy helpers — ' + fullName(c), `<p class="hint">${lines.map((x) => '“' + h(x.line.trim()) + '”').join('<br>')}</p>${bs.length > 1 ? `<div class="f"><span class="lbl">Helpers at</span><select data-ask="bz" ${inp}>${bs.map((b) => `<option value="${b.id}">${h(b.name)}</option>`).join('')}</select></div>` : `<div class="hint">Added to <b>${h(bs[0].name)}</b>.</div>`}<div class="rephead"><span style="flex:2">Person</span><span style="flex:1">Note</span><span class="repx"></span></div><div id="rr-rows">${(picked.length ? picked : [null]).map(row).join('')}</div><button type="button" class="btn small" data-act="hh-rowadd">➕ Add another person</button><label style="display:flex;gap:8px;align-items:center;margin:10px 0 0"><input type="checkbox" data-askchk="rm" checked> Take the line out of general info</label>`, 'Add as happy helpers', false, 'Cancel');
        if (!r) break; target = IDX.biz.get(ASK_FORM.bz) || bs[0]; rm = !!ASK_FORM.rm; picked = []; for (let i = 0; i < S.rrN; i++) { const name = (ASK_FORM['rw' + i] || '').trim(), note = (ASK_FORM['rn' + i] || '').trim(), cid = ASK_FORM['rc' + i]; if (!name && !cid) continue; picked.push({ text: name, note, o: cid ? D.contacts.find((x) => x.id === cid) : null }); } }
      let n = 0; picked.forEach((x) => { if (addHelper(target, x.o, x.text, x.note)) n++; }); if (rm) { const drop = new Set(lines.map((x) => x.line)); c.info = String(c.info || '').split('\n').filter((l) => !drop.has(l)).join('\n').replace(/\n{3,}/g, '\n\n'); delete c.infoHtml; touch(c); }
      D.dismissed = D.dismissed || {};  NEXT_LOG_LABEL = `${n} happy helper${n === 1 ? '' : 's'} added to ${target.name}`; S.skipConfirm = true; if (await changed()) toast(`🙂 ${n} added to ${target.name}`); break; }
    case 'hh-rowadd': { const box = $('#rr-rows'); if (!box) break; const i = S.rrN++; box.insertAdjacentHTML('beforeend', `<div class="relrow" style="border:1px solid var(--line);border-radius:9px;padding:8px;margin:6px 0"><div style="display:flex;gap:6px;flex-wrap:wrap"><input class="rr-who" data-ask="rw${i}" autocomplete="off" style="flex:2 1 160px;padding:8px;border:1px solid var(--line);border-radius:8px;font-size:15px"><input data-ask="rn${i}" style="flex:1 1 120px;padding:8px;border:1px solid var(--line);border-radius:8px;font-size:15px"><input type="hidden" data-ask="rc${i}" class="rr-cid" value=""><button type="button" class="btn small" onclick="this.closest('.relrow').remove()" title="Don't add">✕</button></div><div class="rr-res"></div><div class="hint rr-st"></div></div>`); break; }
    case 'farm-az': { const b = IDX.biz.get(d.bid); if (!b) break; b.farmOrder = [...b.farms, ...b.pastFarms].slice().sort((x, y) => alphaCmp(x.name || x.address || '', y.name || y.address || '')).map((f) => f.id); touch(b); NEXT_LOG_LABEL = `Farms put in A–Z order: ${b.name}`; S.skipConfirm = true; if (await changed()) toast('Sorted A–Z'); break; }
    case 'own-pick': { const pk = $('#own-pick'), q = $('#own-q'); if (pk) pk.value = d.bid; if (q) q.value = d.name; $('#own-res').innerHTML = `<div class="hint">✓ ${h(d.name)}</div>`; const o = $('#own-other'); if (o) o.checked = true; break; }
    case 'lost-restore': { const x = lostFarms().find((y) => y.id === d.id); if (!x) break; let bid = x.bid;
      if (d.pick || !bid) { const r = await askBox('Restore to which business?', '<input id="own-q" autocomplete="off" placeholder="🔍 Search businesses" style="width:100%;padding:9px;border:1px solid var(--line);border-radius:9px;font-size:16px"><input type="hidden" data-ask="ownPick" id="own-pick"><div id="own-res"></div>', 'Restore', false, 'Cancel'); if (!r || !ASK_FORM.ownPick) break; bid = ASK_FORM.ownPick; }
      const b = IDX.biz.get(bid); if (!b) break; const f = { ...newFarm(), ...x.rec, id: uid('f') }; delete f.sharedWith; if (f.name) f.name = dedupeWords(f.name.replace(/\b(cattle\s*(?:&|and)\s*sheep|sheep\s*(?:&|and)\s*cattle|cattle|sheep)\s+yards\b/gi, (m) => (/^[A-Z]/.test(m) ? 'Farm' : 'farm'))); D.farms.push(f); touch(f); linkFarm(b, f); if (!f.owner) f.owner = { bid: b.id }; D.dismissed = D.dismissed || {}; D.dismissed['lostfarm:' + x.id] = Date.now(); D._dismissDirty = true;
      NEXT_LOG_LABEL = `Restored lost farm: ${f.name || 'Farm'} → ${b.name}`; S.skipConfirm = true; if (await changed()) toast('↩ Restored to ' + b.name); break; }
    case 'svc-start': { const f = IDX.farms.get(d.fid); if (f) svcStart(f); break; }
    case 'svc-reset': { if (SVC.fid !== d.fid || !SVC.mk) break; SVC.p = { ...SVC.start }; SVC.mk.setPosition(SVC.p); SVC.map.panTo(SVC.p); google.maps.event.trigger(SVC.mk, 'dragend'); break; }
    case 'svc-save': { const f = IDX.farms.get(d.fid); if (!f || SVC.fid !== f.id) break; const was = JSON.parse(JSON.stringify({ turn: f.turn, kmReturn: f.kmReturn, driveMin: f.driveMin, kmStatus: f.kmStatus })); const moved = hav(SVC.p, f.turn) > 0.002;
      if (moved) { f.turn = { lat: +SVC.p.lat.toFixed(6), lng: +SVC.p.lng.toFixed(6) }; if (!(await verifyKmBox(f))) { Object.assign(f, was); toast('Not saved — nothing was changed'); break; } }
      f.svOk = Date.now(); touch(f); NEXT_LOG_LABEL = `Turn-off checked on Street View${moved ? ' (moved)' : ''}: ${farmLabel(f)}`; S.skipConfirm = true; if (!(await changed())) break; toast(moved ? '✓ Turn-off moved and saved' : '✓ Checked');
      if (d.next) setTimeout(() => { const nb = document.querySelector('details.jobgroup[data-type="svcheck"] [data-act=svc-start]'); if (nb) nb.click(); }, 350); break; }
    case 'oldinfo': { const f = IDX.farms.get(d.fid); if (!f) break; const bits = oldFarmInfo(f);
      if (d.v === 'keep') { D.dismissed = D.dismissed || {}; D.dismissed['oldinfo:' + f.id] = Date.now(); D._dismissDirty = true; S.skipConfirm = true; await changed(); toast('Kept'); break; }
      if (d.v === 'move') f.info = [f.info, bits.join('\n')].filter((x) => (x || '').trim()).join('\n\n'); else if (!(await ask('Delete this old farm info?\n\n' + bits.join('\n'), 'Yes — delete it', true))) break;
      delete f.fac; delete f.reception; delete f.biosec; touch(f); NEXT_LOG_LABEL = `Old farm info ${d.v === 'move' ? 'moved into general info' : 'deleted'}: ${farmLabel(f)}`; S.skipConfirm = true; if (await changed()) toast(d.v === 'move' ? 'Moved into General farm info' : 'Deleted'); break; }
    case 'farm-allpins': { const f = IDX.farms.get(d.fid), b = IDX.biz.get(d.bid); if (!f || !b) break; document.querySelectorAll('.svfull').forEach((x) => x.remove()); const ov = document.createElement('div'); ov.className = 'svfull';
      ov.innerHTML = `<div class="svfh"><div class="svft"><b>${h(f.name || 'Farm')} — all pins</b><div class="hint">${h(b.name)} · tap a pin for directions</div></div><div class="svfa"><button type="button" class="btn small" data-act="allpins-close">Close</button></div></div><div class="bizmap" data-bid="${b.id}" data-fid="${f.id}" data-h="calc(100dvh - 110px)" style="flex:1"></div>`;
      document.body.appendChild(ov); document.body.classList.add('svfopen'); initBizMaps(); break; }
    case 'allpins-close': document.querySelectorAll('.svfull').forEach((x) => x.remove()); document.body.classList.remove('svfopen'); break;
    case 'sv-edit': { const f = IDX.farms.get(d.fid); if (f && (await sharedYardOk(f))) svConfirm(f, d.k, { edit: true }); break; }
    case 'sv-show': svShow({ lat: +d.lat, lng: +d.lng }, d.title || 'Street View'); break;
    case 'farm-link-new': { const b = IDX.biz.get(d.bid); closeSheet(); if (b) editFarm(b, null); break; }
    case 'im-ok': { const c = D.contacts.find((x) => x.id === d.cid); if (!c) break; delete c.infoMove; touch(c); NEXT_LOG_LABEL = `General info of ${fullName(c)} confirmed on the business`; await changed(); break; }
    case 'im-to': { const c = D.contacts.find((x) => x.id === d.cid), b = IDX.biz.get(d.bid); if (!c || !b || !c.infoMove) break; const im = c.infoMove; let block = im.block;
      if (im.pending) block = infoBlockFor(c, im.text); else { const ob = IDX.biz.get(im.bid); if (ob) infoRemove(ob, im.block); }
      infoAppend(b, block); if (im.pending) { const keep = infoSections(c.info).filter(isRelSec); c.info = joinSections(keep); delete c.infoHtml; }
      delete c.infoMove; touch(c); NEXT_LOG_LABEL = `General info of ${fullName(c)} put on ${b.name}`; await changed(); break; }
    case 'im-okclean': { const c = D.contacts.find((x) => x.id === d.cid); if (!c || !c.infoMove || c.infoMove.pending) break; const im = c.infoMove; const b = IDX.biz.get(im.bid); if (!b) break;
      const body = im.block.split('\n').slice(1).join('\n'); if ((b.info || '').includes(im.block)) b.info = b.info.replace(im.block, body);
      if (b.infoHtml) b.infoHtml = b.infoHtml.replace(`<p><b>From ${h(fullName(c))}</b></p>`, ''); touch(b);
      delete c.infoMove; touch(c); NEXT_LOG_LABEL = `General info of ${fullName(c)} confirmed on ${b.name} ("From" line removed)`; await changed(); break; }
    case 'im-role': { const c = D.contacts.find((x) => x.id === d.cid); if (!c || !c.infoMove) break; const im = c.infoMove; const text = (im.pending ? im.text : im.block.split('\n').slice(1).join('\n')).trim();
      let b = im.pending ? null : IDX.biz.get(im.bid); const bs = bizOf(c); if (!b && bs.length === 1) b = bs[0];
      const inp = 'style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"';
      const r = await askBox('Role at the business', `${b ? '' : `<div class="f"><span class="lbl">Business</span>${bs.map((x, i) => `<label style="display:flex;gap:8px;align-items:center;padding:4px 0"><input type="radio" name="imrole" data-ask="bid" value="${x.id}" ${i ? '' : 'checked'}> ${h(x.name)}</label>`).join('')}</div>`}
        <div class="f"><span class="lbl">${h(fullName(c))}'s role${b ? ' at ' + h(b.name) : ''}</span><input data-ask="role" value="${h(text.replace(/\s+/g, ' ').slice(0, 80))}" list="dl-roles" ${inp}><datalist id="dl-roles">${linkRoles().map((x) => `<option value="${h(x)}">`).join('')}</datalist></div>
        <div class="hint">The role goes on ${h(c.first || fullName(c))}'s link to the business (shown as "Role here"), and this text comes out of general info.</div>`, 'Save role', false, 'Cancel');
      const role = (ASK_FORM.role || '').trim(); if (!r || !role) break; if (!b) b = IDX.biz.get(ASK_FORM.bid); if (!b) break;
      const l = c.links.find((x) => x.bid === b.id && !x.past); if (l) l.role = role; else c.links.push({ bid: b.id, role });
      if (im.pending) { const keep = infoSections(c.info).filter(isRelSec); c.info = joinSections(keep); delete c.infoHtml; } else { const ob = IDX.biz.get(im.bid); if (ob) infoRemove(ob, im.block); }
      delete c.infoMove; touch(c); NEXT_LOG_LABEL = `${fullName(c)}'s role at ${b.name}: ${role} (from general info)`; if (await changed()) toast('👔 Role saved'); break; }
    case 'im-del': { const c = D.contacts.find((x) => x.id === d.cid); if (!c || !c.infoMove) break; const im = c.infoMove; const ob = im.pending ? null : IDX.biz.get(im.bid);
      if (!(await ask(`Remove this general info completely?\n\nIt will be taken off ${ob ? ob.name : fullName(c)} and not put anywhere else.`, 'Yes — remove it', true))) break;
      if (ob) infoRemove(ob, im.block); else { const keep = infoSections(c.info).filter(isRelSec); c.info = joinSections(keep); delete c.infoHtml; }
      delete c.infoMove; touch(c); NEXT_LOG_LABEL = `General info of ${fullName(c)} removed${ob ? ' from ' + ob.name : ''}`; if (await changed()) toast('General info removed'); break; }
    case 'im-keep': case 'im-back': { const c = D.contacts.find((x) => x.id === d.cid); if (!c || !c.infoMove) break; const im = c.infoMove;
      if (a === 'im-back') { const ob = IDX.biz.get(im.bid); if (ob) infoRemove(ob, im.block); const text = im.block.split('\n').slice(1).join('\n'); c.info = [text, c.info].filter((x) => (x || '').trim()).join('\n\n'); delete c.infoHtml; }
      delete c.infoMove; touch(c); NEXT_LOG_LABEL = `General info kept on ${fullName(c)}`; await changed(); break; }
    case 'rel-tobiz': { const c = D.contacts.find((x) => x.id === d.cid); if (!c) break; const p = relProposals(c).find((x) => x.line === d.line); const bs = bizOf(c); if (!p || !(p.names || []).length || !bs.length) break;
      let b = bs[0];
      if (bs.length > 1) { const r = await askBox('Which business?', `<div class="hint" style="margin-bottom:6px">Add ${p.names.map((nm) => `<b>${h(nm.o ? fullName(nm.o) : nm.text)}</b>`).join(', ')} as a contact / employee of:</div>${bs.map((x, i) => `<label style="display:flex;gap:8px;align-items:center;padding:6px 0"><input type="radio" name="tobiz" data-ask="bid" value="${x.id}" ${i ? '' : 'checked'}> ${h(x.name)}</label>`).join('')}`, 'Next', false, 'Cancel'); if (!r) break; b = IDX.biz.get(ASK_FORM.bid) || b; }
      let n = 0; const made = [];
      for (const nm of p.names) {
        if (nm.o) { if (nm.o.links.some((l) => l.bid === b.id && !l.past)) continue; const role = await askLinkRole(nm.o, b, false); if (role === null) continue; nm.o.links = nm.o.links.filter((l) => l.bid !== b.id); nm.o.links.push(role ? { bid: b.id, role } : { bid: b.id }); if (!catOf(nm.o) && bizCat(b)) setOne(nm.o, bizCat(b)); touch(nm.o); n++; continue; }
        const parts = nm.text.replace(/\s+/g, ' ').split(' '); const last = parts.length > 1 ? parts.pop() : (c.last || ''); const first = parts.join(' ');
        const nc = { id: uid('c'), first, middle: '', last, role: '', links: [], tags: [], emails: [], mobiles: [], landlines: [], postal: [], info: '', warnings: '', starred: false, photoChoice: 'auto', flags: [], noDetails: true, createdAt: Date.now() };
        const role = await askLinkRole(nc, b, false); if (role === null) continue; nc.links.push(role ? { bid: b.id, role } : { bid: b.id }); D.contacts.push(nc); made.push(nc); reindex(); if (bizCat(b)) setOne(nc, bizCat(b)); touch(nc); n++; }
      if (!n) { toast('Nothing added'); break; }
      if (!p.note) relRemove(c, p.line);
      NEXT_LOG_LABEL = `${p.names.map((nm) => nm.o ? fullName(nm.o) : nm.text).join(', ')} added to ${b.name} (from ${fullName(c)}'s general info)`;
      if (await changed()) toast(`🏢 Added to ${b.name}`); else { D.contacts = D.contacts.filter((x) => !made.includes(x)); reindex(); } break; }
    case 'rel-rmall': case 'rel-rmline': { const c = D.contacts.find((x) => x.id === d.cid); if (!c) break; const one = a === 'rel-rmline';
      relRemove(c, one ? d.line : null); NEXT_LOG_LABEL = one ? `${fullName(c)}: removed "${d.line}" from general info` : `${fullName(c)}: relationships removed from general info`;
      if (await changed()) toast(one ? 'Line removed from general info' : 'Relationships removed from general info'); break; }
    case 'relsug-edit': { const c = D.contacts.find((x) => x.id === d.cid); if (!c) break; const p = relProposals(c).find((x) => x.line === d.line) || { line: d.line, names: [], rel: '' }; const RELS = [...new Set(REL_WORDS.map((x) => x[1]).concat(Object.keys(REL_GENDERED || {})))];
      const inp = 'style="padding:8px;border:1px solid var(--line);border-radius:8px;font-size:15px"'; S.rrN = 0;
      const row = (nm) => { const i = S.rrN++; const o = nm && nm.o; const rel = nm ? (o ? genderize(p.rel, nameGender(o)) : genderize(p.rel, nameGender({ first: nm.text }))) : ''; return `<div class="relrow" style="border:1px solid var(--line);border-radius:9px;padding:8px;margin:6px 0"><div style="display:flex;gap:6px;flex-wrap:wrap"><input class="rr-who" data-ask="rw${i}" data-i="${i}" value="${h(o ? fullName(o) : nm ? nm.text : '')}" autocomplete="off" ${inp} style="flex:2 1 160px"><input data-ask="rr${i}" list="rr-rels" value="${h(rel || '')}" ${inp} style="flex:1 1 120px"><input type="hidden" data-ask="rc${i}" class="rr-cid" value="${o ? o.id : ''}"><button type="button" class="btn small" onclick="this.closest('.relrow').remove()" title="Don't add">✕</button></div><div class="rr-res"></div><div class="hint rr-st">${o ? '✓ In the app' : nm ? 'Not in the app — tap a match below if there is one, or it\'s added as a name only' : ''}</div></div>`; };
      const r = await askBox('Edit suggestion — ' + fullName(c), `<p class="hint">“${h(p.line)}”</p><div class="rephead"><span style="flex:2">Person</span><span style="flex:1">Their relationship to ${h(c.first || fullName(c))}</span><span class="repx"></span></div><div id="rr-rows">${((p.names || []).length ? p.names : [null]).map(row).join('')}</div><button type="button" class="btn small" data-act="rr-add">➕ Add another person</button><datalist id="rr-rels">${RELS.map((x) => `<option value="${h(x)}">`).join('')}</datalist>
        <label style="display:flex;gap:8px;align-items:center;margin:10px 0 0"><input type="checkbox" data-askchk="rm" ${p.note ? '' : 'checked'}> Take this line out of general info${p.note ? ` <span class="hint">(it has a note: “${h(p.note)}”)</span>` : ''}</label>`, 'Add to Related people', false, 'Cancel');
      if (!r) break; let n = 0; for (let i = 0; i < S.rrN; i++) { const name = (ASK_FORM['rw' + i] || '').trim(), rel = (ASK_FORM['rr' + i] || '').trim() || 'Other', cid = ASK_FORM['rc' + i]; if (!name && !cid) continue; const o = cid ? D.contacts.find((x) => x.id === cid) : null;
        if (o) setRelated(c, o, rel, backRel(rel, c) || ((o.related || []).find((x) => x.cid === c.id) || {}).rel || 'Other'); else setRelatedName(c, name, rel); n++; }
      if (ASK_FORM.rm) relRemove(c, d.line); touch(c); NEXT_LOG_LABEL = `${fullName(c)}: ${n} related ${n === 1 ? 'person' : 'people'} added`; S.skipConfirm = true; if (await changed()) toast(`✓ ${n} added to Related people`); break; }
    case 'rr-add': { const box = $('#rr-rows'); if (!box) break; const i = S.rrN++; box.insertAdjacentHTML('beforeend', `<div class="relrow" style="border:1px solid var(--line);border-radius:9px;padding:8px;margin:6px 0"><div style="display:flex;gap:6px;flex-wrap:wrap"><input class="rr-who" data-ask="rw${i}" data-i="${i}" autocomplete="off" style="flex:2 1 160px;padding:8px;border:1px solid var(--line);border-radius:8px;font-size:15px"><input data-ask="rr${i}" list="rr-rels" style="flex:1 1 120px;padding:8px;border:1px solid var(--line);border-radius:8px;font-size:15px"><input type="hidden" data-ask="rc${i}" class="rr-cid" value=""><button type="button" class="btn small" onclick="this.closest('.relrow').remove()" title="Don't add">✕</button></div><div class="rr-res"></div><div class="hint rr-st"></div></div>`); break; }
    case 'rr-pick': { const row = el.closest('.relrow'); const o = D.contacts.find((x) => x.id === d.cid); if (!row || !o) break; row.querySelector('.rr-cid').value = o.id; row.querySelector('.rr-who').value = fullName(o); row.querySelector('.rr-res').innerHTML = ''; row.querySelector('.rr-st').textContent = '✓ In the app'; break; }
    case 'rel-apply': { const c = D.contacts.find((x) => x.id === d.cid); if (!c) break; const n = relApply(c); if (!(helperLines(c).length && bizOf(c).length)) { D.dismissed = D.dismissed || {}; D.dismissed['relmove:' + c.id] = Date.now(); D._dismissDirty = true; } NEXT_LOG_LABEL = `${fullName(c)}: ${n} related ${n === 1 ? 'person' : 'people'} added from general info`; if (await changed()) toast('👪 Added to Related people'); break; }
    case 'pc-open': { const f = IDX.farms.get(d.fid); if (f && (await sharedYardOk(f))) pinCheckSheet(f); break; }
    case 'pc-isyards': { const f = IDX.farms.get(d.fid); if (!f || !f.turn || !(await sharedYardOk(f))) break; if (!(await ask(`Make this pin the yards for ${farmLabel(f)} instead of the turn-off?`, 'Yes — it\'s the yards'))) break; f.lat = f.turn.lat; f.lng = f.turn.lng; delete f.turn; f.pinChecked = true; f.needTurn = true; touch(f); NEXT_LOG_LABEL = `${farmLabel(f)}: pin is the yards (not a turn-off)`; S.skipConfirm = true; if (!(await changed())) break;
      const nx = await askBox(`Add the ${turnName().toLowerCase()} pin?`, `<p>The yards pin for <b>${h(farmLabel(f))}</b> is set.</p><p>Now add the ${turnPin().emoji} ${h(turnName().toLowerCase())} pin — where you leave the road (farm gate or track).</p>`, `${turnPin().emoji} Add it now`, false, 'Later (keep it in Jobs)', 'No turn-off needed — yards are at the road');
      if (nx === true) pinCheckSheet(f, { needTurn: true });
      else if (nx === 'alt') { delete f.needTurn; touch(f); NEXT_LOG_LABEL = `${farmLabel(f)}: no turn-off needed`; S.skipConfirm = true; await changed(); }
      break; }
    case 'pc-turnadd': { const f = IDX.farms.get(d.fid); if (f) pinCheckSheet(f, { needTurn: true }); break; }
    case 'pc-add': pcAddMode(); break;
    case 'pc-del': { const row = el.closest('.pc-row'); if (row && PC) { const m = PC.marks.get(row.dataset.k); if (m && m.setMap) m.setMap(null); PC.marks.delete(row.dataset.k); row.remove(); } break; }
    case 'nm-add': { const c = D.contacts.find((x) => x.id === d.id); if (c) nmSheet(c, null); break; }
    case 'nm-row-add': { const box = $('#e-nmrows'); if (box) box.insertAdjacentHTML('beforeend', nmRow(null)); break; }
    case 'nm-row-del': { const row = el.closest('.nmrow'); if (row) { if ($('#e-nmrows').querySelectorAll('.nmrow').length > 1) row.remove(); else { row.querySelector('.nm-who').value = ''; row.querySelector('.nm-note').value = ''; row.dataset.cid = ''; } } break; }
    case 'nm-row-pick': { const row = el.closest('.nmrow'); const c = D.contacts.find((x) => x.id === d.cid); if (row && c) { row.dataset.cid = c.id; row.querySelector('.nm-who').value = fullName(c); row.querySelector('.nm-res').innerHTML = ''; } break; }
    case 'nm-row-typed': { const row = el.closest('.nmrow'); if (row) { row.dataset.cid = ''; row.querySelector('.nm-res').innerHTML = ''; } break; }
    case 'nm-edit': { const c = D.contacts.find((x) => x.id === d.id); const r = c && (c.noMentionRel || []).find((x) => nmKey(x) === d.key); if (r) nmSheet(c, r); break; }
    case 'nm-pick': { const o = D.contacts.find((x) => x.id === d.cid); if (!o) break; S.nmPick = o.id; $('#nm-q').value = fullName(o); $('#nm-res').innerHTML = ''; $('#nm-oname').textContent = fullName(o); $('#nm-backwrap').style.display = ''; break; }
    case 'nm-del': { const c = D.contacts.find((x) => x.id === d.id); const r = c && (c.noMentionRel || []).find((x) => nmKey(x) === d.key); if (!r) break; setNoMention(c, r.cid ? D.contacts.find((x) => x.id === r.cid) : null, r.name, null); NEXT_LOG_LABEL = `Removed from don't mention: ${r.cid ? fullName(D.contacts.find((x) => x.id === r.cid) || { first: '' }) : r.name} (${fullName(c)})`; if (await changed()) toast('Removed'); break; }
    case 'rel-sug': { const c = D.contacts.find((x) => x.id === d.a); if (c) relAddSheet(c, { cid: d.b, rel: 'Other family', fresh: true }); break; }
    case 'rel-sug-set': { const a = D.contacts.find((x) => x.id === d.a), b = D.contacts.find((x) => x.id === d.b); if (!a || !b) break; setRelated(a, b, d.relb, d.rela); NEXT_LOG_LABEL = `${fullName(b)} is ${fullName(a)}'s ${d.relb.toLowerCase()}`; if (await changed()) toast('Added to Related people'); break; }
    case 'rel-sug-nm': { const a = D.contacts.find((x) => x.id === d.a); if (a) nmSheet(a, { cid: d.b, rel: 'Divorced', fresh: true }); break; }
    case 'rel-add': { const c = D.contacts.find((x) => x.id === d.id); if (c) relAddSheet(c); break; }
    case 'rel-pick': { const c = D.contacts.find((x) => x.id === S.relFor), o = D.contacts.find((x) => x.id === d.cid); if (!c || !o) break; S.relPick = o.id; $('#rel-res').innerHTML = ''; $('#rel-q').value = fullName(o); $('#rel-form').innerHTML = relForm(c, o, (c.related || []).find((r) => r.cid === o.id)?.rel || S.relSugRel); break; }
    case 'rel-pick-name': { const c = D.contacts.find((x) => x.id === S.relFor); const name = val('rel-q').replace(/\s+/g, ' '); if (!c || !name) break; S.relPick = 'n:' + name; $('#rel-res').innerHTML = ''; $('#rel-q').value = name; $('#rel-form').innerHTML = relForm(c, { first: name, name, nodet: true }, (c.related || []).find((r) => !r.cid && r.name === name)?.rel); break; }
    case 'rel-edit': { const c = D.contacts.find((x) => x.id === d.id); const r = c && (c.related || []).find((x) => relKey(x) === d.key); if (r) relAddSheet(c, r); break; }
    case 'rel-del': { const c = D.contacts.find((x) => x.id === d.id); const r = c && (c.related || []).find((x) => relKey(x) === (d.key || d.cid)); if (!r) break; const o = r.cid ? D.contacts.find((x) => x.id === r.cid) : null; if (o) setRelated(c, o, null, null); else setRelatedName(c, r.name, null); NEXT_LOG_LABEL = `Removed related person: ${o ? fullName(o) : r.name} (${fullName(c)})`; if (await changed()) toast('Removed'); break; }
    case 'map-open': S.backTo = null; S.tab = 'biz'; S.sel = { kind: 'business', id: d.id }; renderAll(); document.body.classList.add('show-detail'); break;
    case 'map-near': { const f = IDX.farms.get(d.fid); if (!f || !FMAP) break; const p0 = f.lat != null ? f : f.turn; FMAP.setView([p0.lat, p0.lng], 12); break; }
    case 'map-all': S.mapSel = null; drawMapPins(); renderMapTab(); break;
    case 'map-pick': mapPickSheet(); break;
    case 'mp-done': { const ids = [...S.mapPickSel]; closeSheet(); S.mapSel = ids.length ? new Set(ids) : null; if (S.tab === 'route' && FMAP) { drawMapPins(); renderMapTab(); mapFit(); } break; }
    case 'mp-clear': S.mapPickSel = new Set(); document.querySelectorAll('#mp-list .mp-c').forEach((x) => (x.checked = false)); $('#mp-n').textContent = '0 chosen'; break;
    case 'map-me': { if (!navigator.geolocation) { toast("This device can't share its location"); break; } toast('Finding you…'); navigator.geolocation.getCurrentPosition((pos) => { if (!FMAP) return; const ll = [pos.coords.latitude, pos.coords.longitude]; FMAP.setView(ll, 12); if (FMAP._me) FMAP._me.remove(); FMAP._me = L.circleMarker(ll, { radius: 8, color: '#1a73e8', fillColor: '#1a73e8', fillOpacity: 0.8 }).addTo(FMAP).bindPopup('You are here'); }, () => toast("Couldn't get your location"), { enableHighAccuracy: true, timeout: 10000 }); break; }
    case 'xturn-add': $('#e-xturns').insertAdjacentHTML('beforeend', yardCard({ id: uid('p'), type: 'turn', name: '', lat: null, lng: null, safety: {} }, false)); break;
    case 'xpin-add': $('#e-xpins').insertAdjacentHTML('beforeend', d.def ? yardCard({ id: uid('p'), type: d.def, name: '', lat: null, lng: null, safety: {} }, false) : extraPinRow()); break;
    case 'xpin-del': el.closest('.xpin').remove(); break;
    case 'fphoto-del': if (SHEET_FARM) { SHEET_FARM.photos = SHEET_FARM.photos.filter((x) => x.id !== d.id); $('#e-fphotos').innerHTML = farmPhotoEdit({ photos: SHEET_FARM.photos }); } break;
    case 'sv-find': { if (!Maps.key()) { $('#e-svprev').innerHTML = '<div class="hint">Street View photos need the Google Maps key in Settings (with "Street View Static API" turned on).</div>'; break; }
      const tg = parseGps(val('e-fturn')), g = parseGps(val('e-fgps')); const p0 = tg ? { lat: tg.lat, lng: tg.lng, radius: 300 } : g ? { lat: g.lat, lng: g.lng, radius: 2000 } : null;
      if (!p0) { $('#e-svprev').innerHTML = '<div class="hint">Add the turn-off or yards pin first.</div>'; break; }
      S.svCand = p0; $('#e-svprev').innerHTML = `<div class="card" style="padding:8px;margin-top:8px"><div class="hint">Nearest Street View to the ${tg ? 'turn-off' : 'yards'} — is it useful?</div><img src="${svUrl(p0, 640, 360)}" style="width:100%;border-radius:8px" alt="Street View" onerror="this.parentNode.innerHTML='<div class=hint>No Street View found near here (or the key doesn\'t have Street View Static API turned on).</div>'"><div class="actions" style="margin-top:6px"><button type="button" class="btn small greenbtn" data-act="sv-keep">✓ Keep this photo</button><button type="button" class="btn small" data-act="sv-turn">↻ Look the other way</button></div></div>`; break; }
    case 'sv-turn': { const c = S.svCand; if (!c) break; c.heading = ((c.heading == null ? 0 : c.heading) + 120) % 360; const img = $('#e-svprev img'); if (img) img.src = svUrl(c, 640, 360); break; }
    case 'sv-keep': { const c = S.svCand; if (!c || !SHEET_FARM) break; SHEET_FARM.photos.push({ id: uid('ph'), kind: 'sv', lat: c.lat, lng: c.lng, radius: c.radius, ...(c.heading != null ? { heading: c.heading } : {}), at: Date.now(), by: devInfo().nick }); $('#e-fphotos').innerHTML = farmPhotoEdit({ photos: SHEET_FARM.photos }); $('#e-svprev').innerHTML = '<div class="hint">✓ Added — tap Save to keep it.</div>'; break; }
    case 'sv-yes': { const f = IDX.farms.get(d.fid); if (!f) break; f.photos = [...(f.photos || []), { id: uid('ph'), kind: 'sv', lat: +d.lat, lng: +d.lng, radius: +d.r, at: Date.now(), by: devInfo().nick }]; touch(f); NEXT_LOG_LABEL = 'Street View photo added for ' + farmLabel(f); if (await changed()) toast('📷 Photo kept'); break; }
    case 'sv-no': { const f = IDX.farms.get(d.fid); if (!f) break; f.svNo = true; touch(f); NEXT_LOG_LABEL = 'Street View photo not useful for ' + farmLabel(f); await changed(); break; }
    case 'rec-here': recHere(); break;
    case 'owner-pick': { const el = $('#' + d.for); if (!el) break; setTimeout(fuRender, 0); $('#' + d.for + '-bid').value = d.bid || ''; $('#' + d.for + '-cid').value = d.cid || ''; el.value = d.bid ? IDX.biz.get(d.bid).name : fullName(D.contacts.find((x) => x.id === d.cid)); const r = $('#' + d.for + '-res'); if (r) r.innerHTML = ''; break; }
    case 'farm-own': { const b = IDX.biz.get(d.bid), f = IDX.farms.get(d.fid); if (!b || !f) break;
      if (ownedBy(f, b)) { const r = await askBox('Not owned by ' + b.name, `<p><b>${h(farmLabel(f))}</b> stays linked to ${h(b.name)}, but moves to "used but not owned".</p><div class="f"><span class="lbl">Who owns it? <span class="hint">(optional)</span></span>${ownerPicker('ask-owner', null)}</div>`, 'Save', false, 'Cancel'); if (!r) break;
        const o = ownerFrom(ASK_FORM.owner, ASK_FORM.ownerBid, ASK_FORM.ownerCid); if (o.bid === b.id) { toast('That\'s this business — choose the owner or leave it blank'); break; } if (!(await sharedYardOk(f))) break; f.owner = o; }
      else { if (!(await sharedYardOk(f))) break; f.owner = { bid: b.id }; }
      touch(f); NEXT_LOG_LABEL = `${farmLabel(f)}: ${ownedBy(f, b) ? 'owned by ' + b.name : 'owner ' + (farmOwner(f).name || 'unknown')}`; if (await changed()) toast('Saved'); break; }
    case 'farm-past': { const b = IDX.biz.get(d.bid), f = IDX.farms.get(d.fid); if (!b || !f) break; const l = b.farmLinks.find((x) => x.fid === f.id); if (!l) break; const toPast = !l.past; linkFarm(b, f, toPast); NEXT_LOG_LABEL = `${farmLabel(f)} ${toPast ? 'no longer current' : 'current again'} for ${b.name}`; if (await changed()) toast(toPast ? 'Moved to "Not current"' : 'Current again'); break; }
    case 'farm-link-pick': { const b = IDX.biz.get(d.bid), f = IDX.farms.get(d.fid); if (!b || !f) break; if (d.close) closeSheet(); const r = await askBox('Link farm', `<p>Link <b>${h(farmLabel(f))}</b> to <b>${h(b.name)}</b>?</p><p class="hint">It becomes a shared farm — any change to it shows for every business that uses it.</p>`, 'Link as current', false, 'Cancel', 'Link as not current'); if (!r) break; linkFarm(b, f, r === 'alt'); NEXT_LOG_LABEL = `Linked ${farmLabel(f)} to ${b.name}${r === 'alt' ? ' (not current)' : ''}`; S.skipConfirm = true; if (await changed()) toast('Farm linked'); break; }
    case 'edit-farm': { const f = IDX.farms.get(d.fid); if (f && !(await sharedYardOk(f))) break; editFarm(IDX.biz.get(d.bid), f); break; }
    case 'calc-dist': SHEET && SHEET.calc && SHEET.calc(); break;
    case 'sheet-cancel': leaveSheet(); break;
    case 'catpick-use': { if (d.kind === 'business') { const b = IDX.biz.get(d.id); if (b) setBizCat(b, d.tag); } else { const c = D.contacts.find((x) => x.id === d.id); if (c) setOne(c, d.tag); } NEXT_LOG_LABEL = 'Kept previous category'; if (await changed()) toast('Category set to ' + tagName(d.tag)); break; }
    case 'bizonly-convert': { const c = D.contacts.find((x) => x.id === d.cid), b = IDX.biz.get(d.bid); if (!c || !b) break;
      const ph = [...c.mobiles.map((p) => ({ label: p.label || 'Mobile', value: p.value })), ...c.landlines.map((p) => ({ label: p.label || 'Phone', value: p.value }))], em = c.emails.map((p) => ({ label: p.label || '', value: p.value }));
      if (!(await ask(`Make "${fullName(c)}" part of the business ${b.name}?\n\n• Phone: ${ph.map((p) => p.value).join(', ') || 'none'}\n• Email: ${em.map((p) => p.value).join(', ') || 'none'}${c.postal.length ? '\n• Postal: ' + c.postal.join('; ') : ''}\n\nThese move onto the business, any notes are added to the business's info, and the contact "${fullName(c)}" goes to the trash (you can restore it from Settings → Trash).`, 'Yes — move to the business'))) break;
      convertBizOnly(c, b);
      S.skipConfirm = true; NEXT_LOG_LABEL = `Made ${b.name} a business-only entry (moved phone/email from contact)`; reindex(); await changed(); toast(b.name + ' updated'); break; }
    case 'warn-split': { const j = jobs().find((x) => x.key === d.k); if (!j) break; const w = j.warnSrc; const rec = w.kind === 'contact' ? D.contacts.find((x) => x.id === w.id) : IDX.biz.get(w.bid); if (!rec) break;
      const farms = w.fid ? [IDX.farms.get(w.fid)].filter(Boolean) : (w.kind === 'contact' ? bizOf(rec) : [rec]).flatMap((b) => b.farms); const tType = w.kind === 'contact' ? 'contact' : 'business';
      let parts = j.warnTxt.split(/\n+/).map((x) => x.trim()).filter(Boolean); if (parts.length < 2) parts = j.warnTxt.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
      const whereOpts = `<option value="gen">${w.kind === 'contact' ? 'This person' : 'The business'} (general)</option>${farms.map((f) => `<option value="f:${f.id}">🐄 ${h(f.name || 'Farm')}</option>`).join('')}<option value="skip">— Leave out —</option>`;
      const row = (t) => `<div class="wsrow" style="border:1px solid var(--line);border-radius:9px;padding:8px;margin:6px 0"><textarea class="ws-t" style="width:100%;min-height:54px;font-size:15px;padding:8px;border:1px solid var(--line);border-radius:8px">${h(t)}</textarea><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px"><select class="ws-w" style="flex:1 1 150px;padding:7px;border:1px solid var(--line);border-radius:8px" onchange="var g=this.value==='gen',k=this.parentNode.querySelector('.ws-k');[].forEach.call(k.options,function(o){o.hidden=g?o.dataset.f==='1':o.dataset.g==='1'});if(k.selectedOptions[0].hidden)k.value=g?'warn':'warn'">${whereOpts}</select><select class="ws-k" style="flex:1 1 150px;padding:7px;border:1px solid var(--line);border-radius:8px" onchange="this.closest('.wsrow').querySelector('.ws-cr').hidden=this.value!=='assess'"><option value="warn">⚠ Major warning</option><option value="caution">⚠️ Minor warning</option><option value="side" data-g="1">📝 Side note</option>${['assess', 'repair', 'minor'].map((x) => `<option value="${x}" data-f="1" hidden>${kInfo('farm', x).emo} ${h(kInfo('farm', x).short)}</option>`).join('')}</select></div><div class="ws-cr" hidden style="margin-top:4px"><select class="ws-c" style="padding:7px;border:1px solid var(--line);border-radius:8px;max-width:100%" onchange="this.nextElementSibling.hidden=this.value!=='req'"><option value="need">${h(CRUSH.need)}</option><option value="req">${h(CRUSH.req)}</option><option value="">Crush photos not needed</option></select><input type="date" class="ws-d" hidden value="${new Date().toISOString().slice(0, 10)}" style="padding:6px;border:1px solid var(--line);border-radius:8px;margin-left:6px"></div></div>`;
      S.wsKey = d.k; openSheet('Split up the warning — ' + j.who, `<div class="hint" style="margin-bottom:6px">Each part can go somewhere different — the business (or person), or one of the farms — and be a different kind of note. Edit the wording if you like.</div><div id="ws-rows">${parts.map(row).join('')}</div><button type="button" class="btn small" data-act="ws-add">➕ Add another part</button>${w.sec ? `<label style="display:flex;gap:8px;align-items:center;margin:10px 0 0"><input type="checkbox" id="ws-remove" checked> Remove the *WARNING* section from general info afterwards</label>` : ''}<template id="ws-tpl">${row('')}</template>`, async () => {
        const rows = [...document.querySelectorAll('#ws-rows .wsrow')].map((r) => ({ t: r.querySelector('.ws-t').value.trim(), w: r.querySelector('.ws-w').value, k: r.querySelector('.ws-k').value, c: r.querySelector('.ws-c').value, d: r.querySelector('.ws-d').value })).filter((x) => x.t && x.w !== 'skip'); if (!rows.length) { toast('Nothing to apply'); return false; }
        for (const x of rows) { if (x.w === 'gen') addNote(rec, tType, ['warn', 'caution', 'side'].includes(x.k) ? x.k : 'warn', x.t); else { const ff = IDX.farms.get(x.w.slice(2)); if (ff) { addNote(ff, 'farm', x.k === 'side' ? 'caution' : x.k, x.t); if (x.k === 'assess') { const an = ff.notes[ff.notes.length - 1]; if (x.c) an.crush = x.c; if (x.c === 'req' && x.d) an.reqAt = new Date(x.d + 'T12:00:00').getTime(); } touch(ff); } } }
        if ($('#ws-remove') && $('#ws-remove').checked) { const f0 = w.fid ? IDX.farms.get(w.fid) : null; removeWarnSection(f0 || rec); } touch(rec); NEXT_LOG_LABEL = `Warning split into ${rows.length} part${rows.length === 1 ? '' : 's'}: ${j.who}`; S.skipConfirm = true; return true; }); $('#sheet-save').textContent = 'Apply'; break; }
    case 'ws-add': { const tp = $('#ws-tpl'); if (tp) $('#ws-rows').insertAdjacentHTML('beforeend', tp.innerHTML); break; }
    case 'warn-apply': case 'warn-remove': { const j = jobs().find((x) => x.key === d.k); if (!j) break; const w = j.warnSrc;
      const rec = w.kind === 'contact' ? D.contacts.find((x) => x.id === w.id) : IDX.biz.get(w.bid); const f = w.fid ? IDX.farms.get(w.fid) : null; if (!rec) break;
      const join = (x, y) => [x, y].filter((t) => (t || '').trim()).join('\n'); const tgt = rec;
      if (a === 'warn-remove') { if (!(await ask(`Remove the *WARNING* section (and the text under it) from ${f ? 'the farm info of ' + (f.name || 'this farm') : 'the general info of ' + j.who}?\n\n${j.warnTxt}`, 'Yes — remove it', true))) break; if (f) { removeWarnSection(f); touch(rec); } else { removeWarnSection(rec); touch(rec); } NEXT_LOG_LABEL = `Removed *WARNING* section from ${j.who}`; S.skipConfirm = true; if (await changed()) toast('Removed from general info'); break; }
      const tType = w.kind === 'contact' ? 'contact' : 'business';
      if (d.to === 'general') { if ((tgt.warnings || '').includes(j.warnTxt)) { toast('Already in the general warning'); break; } addNote(tgt, tType, 'warn', j.warnTxt); }
      if (d.to === 'side') { if ((tgt.sideNotes || '').includes(j.warnTxt)) { toast('Already in the side note'); break; } addNote(tgt, tType, 'side', j.warnTxt); }
      if (d.to === 'minorw') { if ((tgt.notes || []).some((n) => n.k === 'caution' && n.t === j.warnTxt && !n.res)) { toast('Already a minor warning'); break; } addNote(tgt, tType, 'caution', j.warnTxt); }
      if (d.to === 'farm') { const ff = IDX.farms.get(d.fid); if (!ff) break; if ((ff.notes || []).some((n) => n.t === j.warnTxt && !n.res)) { toast('Already on those yards'); break; }
        S.naFiles = []; const r = await askBox('Apply to ' + (ff.name || 'these yards'), `<p class="hint">“${h(j.warnTxt)}”</p><div class="f nkpick">${NOTE_KS.farm.map((x, i) => `<label class="nk nk-${x}"><input type="radio" name="nk" data-ask="k" value="${x}" ${(d.assess ? x === 'assess' : x === 'warn') ? 'checked' : ''} onchange="var a=document.getElementById('na-assess');if(a)a.hidden=this.value!=='assess'"><span><b>${kInfo('farm', x).emo} ${h(kInfo('farm', x).l)}</b><span class="hint">${FARM_KINDS[x].check ? 'Adds CHECK WARNING to the contact\'s photo' : 'Doesn\'t add CHECK WARNING to the contact\'s photo'}</span></span></label>`).join('')}</div>${assessFields(null, !!d.assess)}${naZone()}`, 'Apply', false, 'Cancel');
        if (!r) break; d.kind = ASK_FORM.k || 'warn'; addNote(ff, 'farm', d.kind, j.warnTxt); const nn = ff.notes[ff.notes.length - 1]; if (d.kind === 'assess') readAssess(nn); await naAttach(nn); touch(ff); }
      NEXT_LOG_LABEL = `Applied warning for ${j.who} as ${d.to === 'general' ? 'major warning' : d.to === 'minorw' ? 'minor warning' : d.to === 'side' ? 'side note' : FARM_KINDS[d.kind || 'warn'].short.toLowerCase()}`;
      if (await changed()) toast('✓ Applied — you can now remove it from general info if you like'); break; }
    case 'e-primtoggle': { const inp = $('#e-bprimary'); if (!inp) break; inp.value = inp.value === d.cid ? '' : d.cid; document.querySelectorAll('#e-bprimlist .primbtn').forEach((x) => { const on = x.dataset.cid === inp.value; x.classList.toggle('on', on); x.textContent = on ? 'Primary — tap to remove' : '☆ Make primary'; }); break; }
    case 'prim-remove': { const b = IDX.biz.get(d.bid), c = D.contacts.find((x) => x.id === d.cid); if (!b || !c) break; b.primaryContact = null; touch(b); unPrimary(c, b); NEXT_LOG_LABEL = `${fullName(c)} is no longer the primary contact for ${b.name}`; if (await changed()) toast('Primary contact removed'); break; }
    case 'prim-set': { const b = IDX.biz.get(d.bid), c = D.contacts.find((x) => x.id === d.cid); if (!b || !c) break; const was = primaryOf(b); b.primaryContact = c.id; if (was && was !== c) unPrimary(was, b); touch(b); if (!c.tags.includes('pa') && !c.tags.includes('pi')) { c.tags.push('pa'); touch(c); } NEXT_LOG_LABEL = `${fullName(c)} made primary contact for ${b.name}`; if (await changed()) toast(`✓ ${fullName(c)} is now the primary contact`); break; }
    case 'ob-add': $('#ob-rows').insertAdjacentHTML('beforeend', obRow({ text: '' }, IDX.biz.get(S.obBid) || { id: '', name: '' }, false)); obRefreshRoles(); break;
    case 'ob-findpick': { const row = el.closest('.ob-row'); const x = IDX.biz.get(d.id); if (!row || !x) break; row.querySelector('.ob-ex').value = x.id; row.querySelector('.ob-chosen').innerHTML = 'Chosen: <b>' + h(x.name) + '</b>'; row.querySelector('.ob-findres').innerHTML = ''; row.querySelector('.ob-find').value = ''; if (!row.querySelector('.ob-text').value.trim()) row.querySelector('.ob-text').value = x.name; obRefreshRoles(); break; }
    case 'np-industry': { const b = IDX.biz.get(d.bid); if (!b) break; makeIndustry(b); NEXT_LOG_LABEL = `${b.name} made a non-client (industry) business`; if (await changed()) toast(`✓ ${b.name} is now an industry business`); break; }
    case 'np-role': oddBizSheet(IDX.biz.get(d.bid), 'role'); break;
    case 'np-multi': oddBizSheet(IDX.biz.get(d.bid), 'multi'); break;
    case 'oddbiz-fix': oddBizSheet(IDX.biz.get(d.bid)); break;
    case 'kind-pick': { el.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === el)); $('#e-kind').value = d.v; const hn = $('#e-kindhint');
      hn.style.display = d.v === 'person' ? 'none' : ''; hn.textContent = d.v === 'person' ? '' : `When you tap Save, this contact becomes ${d.v === 'client' ? 'a client business' : 'an industry (non-client) business'} — its phone, email, address and notes move onto the business and the contact goes to the trash.`; break; }
    case 'ice-add': $('#e-icerows').insertAdjacentHTML('beforeend', iceRow(null)); $('#e-icerows .icerow:last-child .ice-who').focus(); break;
    case 'ice-del': el.closest('.icerow').remove(); break;
    case 'jobact': S.jobAct = d.v; S.jobSel.clear(); rerenderJobs(); break;
    case 'jobs-refresh': el.disabled = true; setTimeout(() => { JOBS_CACHE = null; reindex(); renderAll(); toast('✓ Jobs list refreshed — ' + jobs().length + ' to check'); }, 650); break;
    case 'sheet-save': { if (!SHEET) break; const ok = await SHEET.onSave(); if (ok !== false) { const done = await changed(); if (done) { closeSheet(); toast('Saved'); const sv = SHEET_FARM && SHEET_FARM.svAsk; if (sv) { SHEET_FARM.svAsk = null; setTimeout(() => svConfirm(IDX.farms.get(sv)), 400); } } } break; }
    case 'rep-add': { const tpl = document.querySelector(`#sheet template[data-reptpl="${d.rep}"]`); document.querySelector(`#sheet [data-repwrap="${d.rep}"]`).insertAdjacentHTML('beforeend', tpl.innerHTML); break; }
    case 'rep-del': el.closest('.rep').remove(); break;
    case 'link-biz': $('#e-links').insertAdjacentHTML('beforeend', linkRow(d.bid)); $('#e-bizsearch').value = ''; $('#e-bizres').innerHTML = ''; break;
    case 'link-newbiz': $('#e-links').insertAdjacentHTML('beforeend', linkRow(null, d.name)); $('#e-bizsearch').value = ''; $('#e-bizres').innerHTML = ''; break;
    case 'del-contact': if (await ask(`Move ${fullName(D.contacts.find((c) => c.id === d.id))} to the trash?\n\nYou can restore it from Settings → Trash.`, 'Yes — move to trash', true)) { trashContact(D.contacts.find((c) => c.id === d.id)); S.sel = null; closeSheet(); changed(); toast('Moved to trash'); } break;
    case 'del-biz': if (await ask(`Move ${IDX.biz.get(d.id).name} and its farms to the trash?\n\nIts contacts stay. You can restore it from Settings → Trash.`, 'Yes — move to trash', true)) { trashBiz(IDX.biz.get(d.id)); S.sel = null; closeSheet(); changed(); toast('Moved to trash'); } break;
    case 'del-farm': { const b = IDX.biz.get(d.bid), f = IDX.farms.get(d.fid); if (!b || !f) break; const us = farmUsersOf(f.id); const nm = farmLabel(f);
      if (us.length < 2) { if (!(await ask(`Delete ${f.name || 'this farm'} from ${b.name}?\n\nIt goes to the trash — you can restore it from Settings → Trash. (To keep it as a past farm instead, use "Make not current".)`, 'Yes — delete', true))) break; trashFarm(b, f); closeSheet(); NEXT_LOG_LABEL = `Deleted ${nm}`; S.skipConfirm = true; if (await changed()) toast('Moved to trash'); break; }
      const r = await askBox('Delete shared yards', `<p><b>${h(f.name || 'These yards')}</b> are used by more than one business. Delete them from:</p>${us.map((u) => `<label style="display:flex;gap:8px;align-items:center;margin:6px 0;font-size:16px"><input type="checkbox" data-askchk="u_${u.b.id}" ${u.b === b ? 'checked' : ''}> ${h(u.b.name)}${u.past ? ' <span class="hint">(not current)</span>' : ''}${f.owner && f.owner.bid === u.b.id ? ' <b>— owner</b>' : ''}</label>`).join('')}<p class="hint">Deleting from everyone moves the yards to the trash (restore from Settings → Trash). To keep them as a past farm instead, use "Make not current".</p>`, 'Delete from the ticked businesses', true, 'Cancel', 'Delete from all');
      if (!r) break; const pick = r === 'alt' ? us.map((u) => u.b) : us.filter((u) => ASK_FORM['u_' + u.b.id]).map((u) => u.b); if (!pick.length) { toast('Nothing ticked — nothing deleted'); break; }
      let gone = false; pick.forEach((bb) => { gone = trashFarm(bb, f) || gone; }); closeSheet(); NEXT_LOG_LABEL = gone ? `Deleted ${nm} (from everyone)` : `Removed ${nm} from ${pick.map((x) => x.name).join(', ')}`; S.skipConfirm = true; if (await changed()) toast(gone ? 'Moved to trash' : 'Removed from ' + pick.length + ' business' + (pick.length === 1 ? '' : 'es')); break; }
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
    case 'job-dismiss': { if (d.key.startsWith('orphanfarm:')) { const f = IDX.farms.get(d.key.slice(11)); if (f && await ask(`Delete ${f.name || 'this farm'}? It goes to the trash — restore from Settings → Trash.`, 'Yes — delete', true)) { toTrash('farm', f, {}); logDeleted('farms', f, D.trash[D.trash.length - 1].tid); dropFarmRecord(f); NEXT_LOG_LABEL = 'Deleted unlinked farm'; S.skipConfirm = true; await changed(); } break; } D.dismissed = D.dismissed || {}; D.dismissed[d.key] = Date.now(); if (d.key.startsWith('turnadd:')) { const tf = IDX.farms.get(d.key.slice(8)); if (tf) { delete tf.needTurn; touch(tf); } } if (d.key.startsWith('relsuggestg:')) { const jj = jobs().find((x) => x.key === d.key); (jj && jj.relSugs || []).forEach((sg) => { D.dismissed[sg.k] = Date.now(); }); } D._dismissDirty = true; Sync.soon(); const [type, fid] = d.key.split(':'); if (type === 'signfix') { const f = IDX.farms.get(fid); if (f) { f.flags = f.flags.filter((x) => x.type !== 'signfix'); touch(IDX.farms.get(fid)); } } changed(); break; }
    case 'use-km': { d.fids.split(',').forEach((fid) => { const f = IDX.farms.get(fid); if (!f) return; f.kmReturn = +d.km; f.kmStatus = 'verified'; if (f.gMin != null && f.driveMin == null) f.driveMin = f.gMin; f.flags = (f.flags || []).filter((x) => x.type !== 'kmcheck'); touch(IDX.farms.get(fid)); }); if (await changed()) toast('Distance updated'); break; }
    case 'lookup-km': { const fs = d.fids.split(',').map((x) => IDX.farms.get(x)).filter((f) => f && f.lat != null); el.disabled = true; el.textContent = 'Looking up…'; try { const r = await Maps.distances(fs.map(farmRoutePt)); fs.forEach((f, i) => { if (r[i]) { f.gKm = Math.ceil(r[i].km * 2 - 1e-9); f.gMin = Math.round(r[i].min); f.gAt = Date.now(); touch(f); } }); changed(); } catch (err) { toast(err.message); el.disabled = false; el.textContent = 'Get Google Maps suggestion'; } break; }
    case 'pin-diff': D.dismissed = D.dismissed || {}; D.dismissed[d.key] = Date.now(); D._dismissDirty = true; Sync.soon(); changed(); break;
    case 'pin-same': {
      const keep = IDX.farms.get(d.keep), other = IDX.farms.get(d.other); if (!keep || !other) break;
      farmMergeSheet(keep, other, () => toast('Combined — now one shared farm')); break; }
    case 'prio': { const o = photoOrder(); const i = o.indexOf(d.id), j = i + +d.dir; if (i < 0 || j < 0 || j >= o.length) break; [o[i], o[j]] = [o[j], o[i]]; D.settings.photoPriority = o; touch(D.settings); photoCache.clear(); S.skipConfirm = true; changed(); break; }
    case 'ai-chat-save': { const v = $('#ai-chaturl').value.trim(); if (v && !/^https:\/\/claude\.ai\//.test(v)) { toast('That needs to be a claude.ai link (starting https://claude.ai/)'); break; } if (v) D.settings.aiChatUrl = v; else delete D.settings.aiChatUrl; touch(D.settings); changed(); toast(v ? 'Ask Claude will open that chat' : 'Ask Claude will open a new chat'); break; }
    case 'sorder': { const o = splitOrder(); const i = o.indexOf(d.id), j = i + +d.dir; if (i < 0 || j < 0 || j >= o.length) break; [o[i], o[j]] = [o[j], o[i]]; D.settings.splitOrder = o; touch(D.settings); photoCache.clear(); NEXT_LOG_LABEL = 'Split photo order changed'; S.skipConfirm = true; changed(); break; }
    case 'sorder-reset': delete D.settings.splitOrder; delete D.settings.splitLook; touch(D.settings); photoCache.clear(); S.skipConfirm = true; changed(); break;
    case 'prio-reset': delete D.settings.photoPriority; touch(D.settings); photoCache.clear(); changed(); break;
    case 'app-refresh': refreshApp(); break;
    case 'trash-restore': { const t = (D.trash || []).find((x) => x.tid === d.tid); if (t && await ask(`Restore ${trashLabel(t)} from the trash?`, 'Yes — restore')) restoreTrash(d.tid); break; }
    case 'trash-empty': if (await ask('Permanently delete everything in the trash?\n\nThis cannot be undone.', 'Yes — delete permanently', true)) { D.trash.forEach((t) => { if (!t.removed) Object.assign(t, { removed: true, rec: null }); }); D._trashDirty = true; changed(); } break;
    case 'mg-all': { const root = el.closest('#sheet') || document; const v = d.v; root.querySelectorAll('input[type=radio][name^="mg-"], input[type=radio][name^="fmg-"]').forEach((x) => { if (x.value === v) x.checked = true; else if (v === 'both' && !root.querySelector(`input[name="${x.name}"][value="both"]`) && x.value === 'a') x.checked = true; }); break; }
    case 'dupe-not': D.dismissed = D.dismissed || {}; D.dismissed[d.key] = Date.now(); D._dismissDirty = true; Sync.soon(); changed(); break;
    case 'dupe-merge': { /* opens the merge screen, where any differences (names, info…) are settled before merging */
      const isC = d.kind === 'contact'; const keep = isC ? D.contacts.find((x) => x.id === d.keep) : IDX.biz.get(d.keep); const other = isC ? D.contacts.find((x) => x.id === d.other) : IDX.biz.get(d.other);
      if (!keep || !other) break; mergeSheet(d.kind, keep.id, other.id); break; }
    case 'ac-pick': { const el = AC.el; if (!el) break; let txt = d.main + (d.sub ? ', ' + d.sub.replace(/,?\s*Australia$/, '') : ''); try { const f = await addrDetail(d.id); if (f) txt = f; } catch (e2) { }
      if (AC.pre) txt = AC.pre + ', ' + txt; const ln = acLine(el); el.value = el.value.slice(0, ln.start) + txt + el.value.slice(ln.end); const b = acBoxOf(el); if (b) b.remove(); el.focus(); break; }
    case 'maps-retry': { location.reload(); break; }
    case 'pcq-start': { const f = IDX.farms.get(d.fid); const box = $('#pm-' + d.fid); if (!f || !box) break; let t0 = f.turn && f.turn.lat != null ? f.turn : f.lat != null ? { lat: f.lat - 0.0004, lng: f.lng - 0.0006 } : null;
      if (!t0 && f.address) { try { const r0 = await geocode(f.address + (/\bWA\b|Western Australia/i.test(f.address) ? '' : ', WA')); if (r0 && r0[0]) t0 = { lat: r0[0].lat, lng: r0[0].lng }; } catch (e0) { } }
      if (!t0) { const hm = D.settings.home || {}; t0 = { lat: hm.lat || -34.97653, lng: hm.lng || 117.99626 }; } const t = { lat: +t0.lat, lng: +t0.lng };
      const yT = f.lat != null || isYardType(f.pinType) ? f.pinType : ((pinTypes().find((x) => x.yard) || {}).id || f.pinType);
      const pins = [{ k: 'turn', type: 'turn', name: f.turnLabel || '', tbc: !!f.turnTbc, ...t }, { k: 'main', type: yT, name: f.yLabel || '', tbc: !!f.yTbc, ...(f.lat != null ? { lat: +f.lat, lng: +f.lng } : { lat: t.lat + 0.0004, lng: t.lng + 0.0006 }) }]; // no yards pin yet → start it just beside the turn-off
      (f.extra || []).forEach((x) => { if (x.lat != null) pins.push({ k: 'x:' + x.id, type: x.type, name: x.name || '', tbc: !!x.tbc, lat: +x.lat, lng: +x.lng }); });
      const us0 = farmUsersOf(f.id); S.pcq = { fid: f.id, pins, fname: f.name || '', job: (el.closest('details.jobgroup') || { dataset: {} }).dataset.type || '', newYards: f.lat == null, users: Object.fromEntries(us0.map((u) => [u.b.id, !!u.past])), owner: 'keep' }; box.parentElement.classList.add('pcqwrap'); box.parentElement.classList.toggle('pcqfull', !!S.pcqFull);
      await pcqDraw(f); if (!S.pcqFull) box.scrollIntoView({ block: 'start', behavior: 'smooth' }); break; }
    case 'bizmap-show': { if (document.querySelector('.svfull')) { document.querySelectorAll('.svfull').forEach((x) => x.remove()); document.body.classList.remove('svfopen'); } const btn = document.querySelector(`.farm [data-act=edit-farm][data-fid="${d.fid}"]`); const card = btn && btn.closest('.farm'); if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 1600); } break; }
    case 'pcq-nameidea': { const i = el.closest('.pcqname') && el.closest('.pcqname').querySelector('.pcq-fname'); if (i && S.pcq) { i.value = d.v; S.pcq.fname = d.v; } break; }
    case 'pcq-add': { const f = IDX.farms.get(d.fid), q = S.pcq; if (!f || !q || q.fid !== f.id) break; const last = q.pins[q.pins.length - 1]; q.pins.push({ k: 'n' + Date.now(), type: (pinTypes().find((x) => x.yard) || { id: 'cattle' }).id, name: '', lat: last.lat + 0.0004, lng: last.lng - 0.0006 }); await pcqDraw(f); toast('New pin added beside the last one — drag it into place'); break; }
    case 'pcq-del': { const f = IDX.farms.get(d.fid), q = S.pcq; if (!f || !q || q.pins.length < 2) break; q.pins = q.pins.filter((x) => x.k !== d.k); await pcqDraw(f); break; }
    case 'pcq-full': { const box = $('#pm-' + d.fid); if (!box) break; S.pcqFull = !S.pcqFull; box.parentElement.classList.toggle('pcqfull', S.pcqFull); document.body.classList.toggle('pcq-on', S.pcqFull); el.textContent = S.pcqFull ? '✕ Exit full screen' : '⛶ Full screen'; setTimeout(() => { try { if (box._lm) box._lm.invalidateSize(); } catch (e) { } if (!S.pcqFull) box.scrollIntoView({ block: 'start' }); }, 80); break; }
    case 'pcq-save': { const f = IDX.farms.get(d.fid), q = S.pcq; if (!f || !q || q.fid !== f.id) break; const turns = q.pins.filter((x) => x.type === 'turn'); 
      const was = JSON.parse(JSON.stringify({ turn: f.turn, lat: f.lat, lng: f.lng, kmReturn: f.kmReturn, driveMin: f.driveMin, kmStatus: f.kmStatus, pinType: f.pinType, yLabel: f.yLabel, extra: f.extra })); const r6 = (v) => +(+v).toFixed(6);
      const before = farmRoutePt(f); const yards = q.pins.filter((x) => x.type !== 'turn'); const tp = turns[0];
      const tWas = f.turn && f.turn.lat != null ? `${(+f.turn.lat).toFixed(5)},${(+f.turn.lng).toFixed(5)}` : ''; if (tp && tp.tbc) f.turnTbc = true; else delete f.turnTbc; if (yards[0] && yards[0].tbc) f.yTbc = true; else delete f.yTbc;
      if (tp) { f.turn = { lat: r6(tp.lat), lng: r6(tp.lng) }; if ((tp.name || '').trim()) f.turnLabel = tp.name.trim(); else delete f.turnLabel; } else { delete f.turn; delete f.turnLabel; }
      if (yards[0]) { const m = yards[0]; f.lat = r6(m.lat); f.lng = r6(m.lng); f.pinType = m.type; if ((m.name || '').trim()) f.yLabel = m.name.trim(); else delete f.yLabel; } else { f.lat = f.lng = null; }
      const old = new Map((f.extra || []).map((x) => [x.id, x])); const kept = (f.extra || []).filter((x) => x.lat == null); // extra pins without GPS weren't on the map — keep them
      const ex = [...turns.slice(1), ...yards.slice(1)].map((p2) => { const o = p2.k.startsWith('x:') ? old.get(p2.k.slice(2)) : null; return { ...(o || {}), id: o ? o.id : uid('p'), type: p2.type, name: (p2.name || '').trim(), lat: r6(p2.lat), lng: r6(p2.lng), safety: (o && o.safety) || {}, ...(p2.tbc ? { tbc: true } : { tbc: undefined }) }; }).concat(kept); if (ex.length) f.extra = ex; else delete f.extra;
      const after = farmRoutePt(f); const moved = !before || !after || before.lat == null || after.lat == null || Math.abs(before.lat - after.lat) > 1e-6 || Math.abs(before.lng - after.lng) > 1e-6;
      if (moved && !(await verifyKmBox(f))) { Object.assign(f, was); if (!was.turn) delete f.turn; if (!was.extra) delete f.extra; if (was.yLabel == null) delete f.yLabel; toast('Not saved — nothing was changed'); break; }
      Object.entries(q.users || {}).forEach(([bid, past]) => { const b = IDX.biz.get(bid), l = b && b.farmLinks.find((x) => x.fid === f.id); if (l && !!l.past !== past) linkFarm(b, f, past); });
      if (q.owner === 'unknown') f.owner = { unknown: true }; else if (q.owner && q.owner.startsWith('b:')) f.owner = { bid: q.owner.slice(2) };
      if (q.fname != null && q.fname.trim() && q.fname.trim() !== (f.name || '')) f.name = q.fname.trim();
      if (q.job === 'homename' && /^\s*home\s*$/i.test(f.name || '')) { D.dismissed = D.dismissed || {}; D.dismissed['homename:' + f.id] = Date.now(); D._dismissDirty = true; } // kept as "Home" on purpose
      const tNew = f.turn && f.turn.lat != null && `${(+f.turn.lat).toFixed(5)},${(+f.turn.lng).toFixed(5)}` !== tWas; if (tNew) delete f.svOk;
      f.pinChecked = true; touch(f); NEXT_LOG_LABEL = `Pins checked: ${farmLabel(f)}`; S.skipConfirm = true; const type = jobs().find((j) => (j.type === 'pincheck' || j.type === 'pincheckin') && j.fid === f.id)?.type;
      if (!(await changed())) break; S.pcq = null; toast('✓ Pins saved');
      if (tNew) await svConfirm(f);
      if (d.next) setTimeout(() => { const nb = [...document.querySelectorAll(`details.jobgroup[data-type="${q.job || type || 'pincheck'}"] [data-act=pcq-start]`)][0]; if (nb) nb.click(); }, 350); break; }
    case 'pm-start': { const f = IDX.farms.get(d.fid); const box = $('#pm-' + d.fid); if (!f || !box) break; const p0 = d.which === 'turn' ? f.turn : f; if (!p0 || p0.lat == null) break; S.pmNew = S.pmNew || {};
      const hint = $('#pmh-' + d.fid); if (hint) hint.innerHTML = 'Drag the pin, or tap the map where it should be. <span class="pmll"></span>';
      await liveMoveMap(box, { lat: +p0.lat, lng: +p0.lng }, (lat, lng) => { S.pmNew[d.fid] = { lat, lng, which: d.which }; const hh = $('#pmh-' + d.fid); if (hh) hh.innerHTML = `New spot ${lat.toFixed(5)}, ${lng.toFixed(5)} <button class="btn small greenbtn" data-act="pm-save" data-fid="${d.fid}">✓ Save new spot</button>`; }); break; }
    case 'pm-save': { const f = IDX.farms.get(d.fid), n = (S.pmNew || {})[d.fid]; if (!f || !n) break; if (!(await sharedYardOk(f))) break; const was = n.which === 'turn' ? { turn: f.turn ? { ...f.turn } : null } : { lat: f.lat, lng: f.lng };
      if (n.which === 'turn') f.turn = { lat: +n.lat.toFixed(6), lng: +n.lng.toFixed(6) }; else { f.lat = +n.lat.toFixed(6); f.lng = +n.lng.toFixed(6); }
      if (!(await verifyKmBox(f))) { Object.assign(f, was); toast('Not moved — nothing was changed'); break; } touch(f); delete S.pmNew[d.fid]; NEXT_LOG_LABEL = `${farmLabel(f)}: ${n.which === 'turn' ? 'turn-off' : 'yards'} pin moved on the map`; if (await changed()) toast('📍 Pin moved'); break; }
    case 'pin-find': { const f = IDX.farms.get(d.fid); if (f) pinFindSheet(f); break; }
    case 'pin-search': pinSearch(); break;
    case 'pin-pick': { if (d.i != null) { if (S.pinRes && S.pinRes[+d.i]) pinPreview(S.pinRes[+d.i]); break; } const tg = d.target || ''; const inp = tg === 'turn' ? $('#e-fturn') : tg.startsWith('x') ? document.querySelector(`.xpin[data-id="${CSS.escape(tg.slice(1))}"] .xp-gps`) : $('#e-fgps'); if (!inp) break;
      const emo = tg === 'turn' ? turnPin().emoji : (inp.closest('.xpin') && inp.closest('.xpin').querySelector('.yemo') || {}).textContent || '📍';
      let c = parseGps(inp.value) || parseGps(val('e-fturn')) || parseGps(val('e-fgps')) || [...document.querySelectorAll('#sheet .xp-gps')].map((x) => parseGps(x.value)).find(Boolean); let note = '';
      if (!c && val('e-faddr')) { try { const r = await geocode(val('e-faddr') + (/\bWA\b|Western Australia/i.test(val('e-faddr')) ? '' : ', WA')); if (r && r[0]) { c = { lat: r[0].lat, lng: r[0].lng }; note = 'Starting at the address — '; } } catch (e) { } }
      if (!c) { const hm = D.settings.home || {}; c = { lat: hm.lat || -34.97653, lng: hm.lng || 117.99626 }; note = 'Starting at homebase — '; }
      S.pickPt = { ...c }; const gm = `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
      const go = askBox(tg === 'turn' ? `Choose the ${turnName().toLowerCase()} pin` : 'Choose the pin', `<div class="hint" style="margin-bottom:6px">${note}tap the map where the pin should go, or drag the ${h(emo)} pin. Zoom and move the map with your fingers.</div><div id="pickmap"></div><div class="hint" style="margin-top:6px">Prefer the Google Maps app? <a href="${gm}" target="_blank" rel="noopener">Open Google Maps</a>, drop a pin, copy its numbers and paste them in the GPS box instead.</div>`, 'Use this pin', false, 'Cancel');
      setTimeout(() => { const bx = $('#pickmap'); if (bx) liveMoveMap(bx, { ...c }, (lat, lng) => { S.pickPt = { lat, lng }; }); }, 60);
      if (await go) { const p2 = S.pickPt; inp.value = `${(+p2.lat).toFixed(6)}, ${(+p2.lng).toFixed(6)}`; inp.dispatchEvent(new Event('input', { bubbles: true })); toast('Pin added — check it, then Save'); } break; }
    case 'farm-pinsuggest': S.pinMode = 'farm'; S.pinSfx = d.target === 'turn' ? '-turn' : d.target ? '-' + d.target : ''; document.querySelectorAll('#sheet [id^="pin-res"], #sheet [id^="pin-prev"]').forEach((x) => { if (x.id !== 'pin-res' + S.pinSfx && x.id !== 'pin-prev' + S.pinSfx) x.innerHTML = ''; }); pinSearch(); break;
    case 'pin-use': { const p = S.pinCand, sfx = S.pinSfx || '', el = sfx === '-turn' ? $('#e-fturn') : sfx.startsWith('-x') ? document.querySelector(`.xpin[data-id="${CSS.escape(sfx.slice(2))}"] .xp-gps`) : $('#e-fgps'); if (!p || !el) break; el.value = `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`; el.dispatchEvent(new Event('input', { bubbles: true })); $('#pin-prev' + sfx).innerHTML = ''; $('#pin-res' + sfx).innerHTML = sfx === '-turn' ? '✓ Turn-off pin added — check the km below, then Save.' : '✓ Pin added — check it, then Save.'; break; }
    case 'pin-confirm': { const f = IDX.farms.get(S.pinFid), p = S.pinCand, b = f && IDX.farmBiz.get(f.id); if (!f || !p || !b) break; closeSheet();
      const was = { lat: f.lat, lng: f.lng, kmReturn: f.kmReturn, driveMin: f.driveMin, kmStatus: f.kmStatus }; f.lat = +p.lat.toFixed(6); f.lng = +p.lng.toFixed(6);
      if (!(await verifyKmBox(f))) { Object.assign(f, was); toast('Pin not added — nothing was changed'); break; } touch(f);
      NEXT_LOG_LABEL = `GPS pin added for ${b.name}${f.name ? ' (' + f.name + ')' : ''} from address search`; if (await changed()) toast('✓ Pin created'); break; }
    case 'prim-find': { const b = IDX.biz.get(d.bid); if (b) primFindSheet(b); break; }
    case 'pf-pick': { const c = D.contacts.find((x) => x.id === d.cid); const b = IDX.biz.get(d.bid); if (!c || !b) break; closeSheet();
      const l = c.links.find((x) => x.bid === b.id); let extra = '';
      if (!l || l.past) { const prev = catOf(c); let match = !prev; if (prev && bizCat(b) && bizCat(b) !== prev) { const r = await askLinkCat(`<b>${h(fullName(c))}</b>`, b, tagName(prev), [c]); if (!r) { toast('Nothing was changed'); break; } match = r === 'match'; }
        if (l) delete l.past; else { const role = await askLinkRole(c, b, false); if (role === null) { toast('Nothing was changed'); break; } c.links.push(role ? { bid: b.id, role } : { bid: b.id }); } reindex(); if (match && bizCat(b)) setOne(c, bizCat(b)); else if (prev) setOne(c, prev); extra = l ? ' (was a past employee — now current)' : ' (linked to the business)'; }
      b.primaryContact = c.id; touch(b); if (!c.tags.includes('pa') && !c.tags.includes('pi')) c.tags.push('pa'); touch(c);
      NEXT_LOG_LABEL = `${fullName(c)} made primary contact for ${b.name}${extra}`; if (await changed()) toast(`✓ ${fullName(c)} is now the primary contact`); break; }
    case 'biz-add-nameonly': { const b = IDX.biz.get(d.bid); const inp = $(d.past ? '#biz-linksearch-past' : '#biz-linksearch'); const nm = (inp ? inp.value : '').trim().replace(/\s+/g, ' '); if (!b || !nm) break;
      const parts = nm.split(' '); const last = parts.length > 1 ? parts.pop() : ''; const first = parts.join(' ').replace(/^./, (x) => x.toUpperCase());
      const c = { id: uid('c'), first, middle: '', last: last.replace(/^./, (x) => x.toUpperCase()), role: '', links: [], tags: [], emails: [], mobiles: [], landlines: [], postal: [], info: '', warnings: '', starred: false, photoChoice: 'auto', flags: [], noDetails: true, createdAt: Date.now() };
      const role = await askLinkRole(c, b, !!d.past); if (role === null) { toast('Not added — nothing was changed'); break; }
      c.links.push({ bid: b.id, ...(d.past ? { past: true } : {}), ...(role ? { role } : {}) }); D.contacts.push(c); reindex(); if (!d.past && bizCat(b)) setOne(c, bizCat(b)); touch(c);
      NEXT_LOG_LABEL = `Added ${fullName(c)} (no contact details) to ${b.name}${role ? ' as ' + role : ''}`; if (await changed()) toast(fullName(c) + ' added'); else { D.contacts = D.contacts.filter((x) => x !== c); reindex(); } break; }
    case 'biz-link-pick': { const c = D.contacts.find((x) => x.id === d.cid); const b = IDX.biz.get(d.bid); if (c && b && !c.links.some((l) => l.bid === d.bid)) { const prev = catOf(c);
      let match = !prev; if (prev && bizCat(b) && bizCat(b) !== prev) { const r = await askLinkCat(`<b>${h(fullName(c))}</b>`, b, tagName(prev), [c]); if (!r) { toast('Not linked — nothing was changed'); break; } match = r === 'match'; }
      const role = await askLinkRole(c, b, false); if (role === null) { toast('Not linked — nothing was changed'); break; }
      c.links.push(role ? { bid: d.bid, role } : { bid: d.bid }); reindex(); if (match && bizCat(b)) setOne(c, bizCat(b)); else if (prev) setOne(c, prev); touch(c); NEXT_LOG_LABEL = `Linked ${fullName(c)} to ${b.name}${role ? ' as ' + role : ''}` + (prev && bizCat(b) && bizCat(b) !== prev ? (match ? ' — category changed to match' : ' — kept own category') : ''); await changed(); toast(fullName(c) + ' linked'); } break; }
    case 'area-ai': { let cids = [], bids = [], req = '';
      if (d.v === 'search') { if (['loc', 'all'].includes(S.adv.kind)) { const r = advLocResults(); bids = [...new Set(r.slice(0, 60).map((f) => (IDX.farmBiz.get(f.id) || {}).id).filter(Boolean))]; req = `About my location search results (${r.length} locations): `; } else if ((S.adv.kind || 'people') === 'people') { const r = advResults(); const sel = S.advSel && S.advSel.size ? r.filter((c) => S.advSel.has(c.id)) : r; cids = sel.slice(0, 80).map((c) => c.id); req = `About ${S.advSel && S.advSel.size ? 'the ' + sel.length + ' people I selected' : 'my search results (' + r.length + ' people' + (r.length > 80 ? ', first 80 included' : '') + ')'}: `; }
        else { const r = advBizResults(); const sel = S.advBSel && S.advBSel.size ? r.filter((b) => S.advBSel.has(b.id)) : r; bids = sel.slice(0, 60).map((b) => b.id); req = `About ${S.advBSel && S.advBSel.size ? 'the ' + sel.length + ' businesses I selected' : 'my search results (' + r.length + ' businesses' + (r.length > 60 ? ', first 60 included' : '') + ')'}: `; } }
      else { const stops = S.route.stops.map((x) => IDX.farms.get(x.fid)).filter(Boolean); bids = [...new Set(stops.map((f) => IDX.farmBiz.get(f.id)?.id).filter(Boolean))]; req = stops.length ? `About my planned route (${routeSummary({ ...routeSnapshot() })}): ` : 'About planning a route: '; }
      S.aiExtra = { cids, bids }; S.aiScope = 'mentioned'; S.aiReq = req; S.aiReply = ''; S.aiResult = '';
      S.setOpen = S.setOpen || new Set(); S.setOpen.add('🤖 Ask Claude'); S.tab = 'settings'; S.sel = null; renderAll(); setTimeout(() => { const t = $('#ai-req'); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 60); toast('Type what you want, then tap "Copy for Claude"'); break; }
    case 'merge-start': mergeStart(d.kind, d.id); break;
    case 'mg-pick': closeSheet(); setTimeout(() => mergeSheet(d.kind, d.a, d.b), 30); break;
    case 'rec-ai': { const isC = d.kind === 'contact'; const r = isC ? D.contacts.find((x) => x.id === d.id) : IDX.biz.get(d.id); if (!r) break;
      S.aiExtra = isC ? { cids: [r.id], bids: [] } : { cids: [], bids: [r.id] }; S.aiScope = 'mentioned'; S.aiReq = `About ${isC ? fullName(r) : r.name}: `; S.aiReply = ''; S.aiResult = '';
      S.setOpen = S.setOpen || new Set(); S.setOpen.add('🤖 Ask Claude'); S.tab = 'settings'; S.sel = null; renderAll(); setTimeout(() => { const t = $('#ai-req'); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 60); toast('Type what you want, then tap "Copy for Claude"'); break; }
    case 'pop-job-ai': { if (CONFIRM) closeAsk(false); await new Promise((r) => setTimeout(r, 30)); if (SHEET) closeSheet(); }
    // falls through
    case 'job-ai': { const j = jobs().find((x) => x.key === d.k || x.key === d.key); if (!j) break; const cids = new Set(), bids = new Set();
      if (j.kind === 'contact') cids.add(j.id); else bids.add(j.id); [j.linkSug, j.linkRev, j.bizonly].forEach((x) => { if (x) { if (x.cid) cids.add(x.cid); if (x.bid) bids.add(x.bid); } }); if (j.oddbiz) bids.add(j.oddbiz); if (j.catdiff) bids.add(j.catdiff.bid); if (j.primSuggest) cids.add(j.primSuggest);
      S.aiExtra = { cids: [...cids], bids: [...bids] }; S.aiScope = 'mentioned'; S.aiReq = `Help me sort out this item from the app's Jobs list.\nJob: ${JOB_TYPES[j.type]?.t || j.type}\n${j.who}: ${j.note}${j.warnTxt ? '\n' + j.warnTxt : ''}\nTell me what you'd suggest and why, and include the changes if you're fairly sure.`; S.aiReply = ''; S.aiResult = '';
      S.setOpen = S.setOpen || new Set(); S.setOpen.add('🤖 Ask Claude'); S.tab = 'settings'; S.sel = null; renderAll(); setTimeout(() => { const el = document.querySelector('details.setsec'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 50); toast('Check the request, then tap "Copy for Claude"'); break; }
    case 'linkrev-undo': { const c = D.contacts.find((x) => x.id === d.cid), b = IDX.biz.get(d.bid); if (!c || !b) break; const prev = catOf(c); c.links = c.links.filter((l) => l.bid !== b.id); if (b.primaryContact === c.id) { b.primaryContact = null; touch(b); } reindex(); if (prev) setOne(c, prev); touch(c); NEXT_LOG_LABEL = `Undid link: ${fullName(c)} → ${b.name}`; if (await changed()) toast('Link removed'); break; }
    case 'primin-fix': { const c = D.contacts.find((x) => x.id === d.cid); if (!c) break; c.tags = c.tags.filter((t2) => t2 !== 'pa'); if (!c.tags.includes('pi')) c.tags.push('pi'); touch(c); NEXT_LOG_LABEL = `${fullName(c)}: Primary (active) → Primary (inactive)`; if (await changed()) toast('✓ Changed to Primary (inactive)'); break; }
    case 'link-pick-past': { const c = D.contacts.find((x) => x.id === d.cid), b = IDX.biz.get(d.bid); if (!c || !b || c.links.some((l) => l.bid === b.id)) break; const prev = catOf(c);
      const role = await askLinkRole(c, b, true); if (role === null) { toast('Not linked — nothing was changed'); break; }
      c.links.push(role ? { bid: b.id, past: true, role } : { bid: b.id, past: true }); reindex(); if (prev) setOne(c, prev); touch(c); NEXT_LOG_LABEL = `Linked ${fullName(c)} to ${b.name} as a past ${role ? role.toLowerCase() : 'employee'}`; if (await changed()) toast(`✓ ${fullName(c)} linked to ${b.name} (past)`); break; }
    case 'link-past': { const c = D.contacts.find((x) => x.id === d.cid), b = IDX.biz.get(d.bid); if (!c || !b) break; const prev = catOf(c);
      c.links = c.links.map((l) => (l.bid === b.id ? (d.v === '1' ? { bid: b.id, past: true } : { bid: b.id }) : l)); if (d.v === '1' && b.primaryContact === c.id) { b.primaryContact = null; touch(b); }
      reindex(); if (prev) setOne(c, prev); touch(c); // their category stays as it was
      NEXT_LOG_LABEL = `${fullName(c)} ${d.v === '1' ? 'marked as a past employee of' : 'made a current contact of'} ${b.name}`; if (await changed()) toast(d.v === '1' ? `${fullName(c)} moved to past employees` : `${fullName(c)} is current again`); break; }
    case 'biz-unlink': { const c = D.contacts.find((x) => x.id === d.cid); const b = IDX.biz.get(d.bid); if (c && await ask(`Unlink ${fullName(c)} from ${b.name}? The contact is not deleted.`)) { c.links = c.links.filter((l) => l.bid !== d.bid); if (b.primaryContact === c.id) { b.primaryContact = null; touch(b); } touch(c); changed(); } break; }
    case 'btype': S.btype = d.v; renderBizList(); break;
    case 'ltype': S.ltype = d.v; renderAll(); break;
    case 'nameonly': S.nameOnly = el.checked; S.tab === 'loc' ? renderLocList() : S.tab === 'biz' ? renderBizList() : renderContactList(); break;
    case 'lpast': S.lpast = el.checked; renderLocList(); break;
    case 'loc-open': if (!['loc', 'contacts'].includes(S.tab)) { S.backTo = S.tab; S.tab = 'contacts'; } S.sel = { kind: 'business', id: d.bid }; S.selFarm = d.fid; renderAll(); setTimeout(() => { const card = document.querySelector(`#detail [data-act=edit-farm][data-fid="${d.fid}"]`); const fc = card && card.closest('.farm'); if (fc) { fc.scrollIntoView({ block: 'center' }); fc.classList.add('flash'); } }, 60); break;
    case 'loc-map': { const lt = S.ltype || 'all'; const pq = parseQuery(S.lq || ''); const ids = [...new Set(allPins().filter((p) => (S.lpast || p.cur) && (lt === 'all' || p.kind === lt) && matchQ(locHay(p), pq)).map((p) => p.f.id))]; S.mapSel = new Set(ids); S.mapF = { ...(S.mapF || {}), past: !!S.lpast, q: '', type: '' }; S.mapFit = true; goTab('route'); setTimeout(() => { const m = $('#routemap'); if (m) m.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300); break; }
    case 'ctype': { if (d.b) S.btype = d.v; else S.ptype = d.v; renderAll(); $('#list').scrollTop = 0; break; }
    case 'ptype': S.ptype = d.v; renderContactList(); break;
    case 'bclear': e.preventDefault(); S.bq = ''; renderBizList(); break;
    case 'pend-add': { const n = await pendForm(d.type, d.k); if (n) { S.pendNotes.push(n); pendRefresh(); } break; }
    case 'pend-edit': { const cur = S.pendNotes[+d.i]; if (!cur) break; await pendForm(cur.type, cur.k, cur); pendRefresh(); break; }
    case 'pend-del': S.pendNotes.splice(+d.i, 1); pendRefresh(); break;
    case 'fname-set': case 'fname-other': { const f = IDX.farms.get(d.fid); if (!f) break; let v = d.v; if (a === 'fname-other') { const r = await askBox('Name this farm', `<div class="hint" style="margin-bottom:6px">${h(farmLabel(f))}${f.address ? ' · ' + h(f.address) : ''}</div><input data-ask="n" value="${h(v)}" style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px">`, 'Save', false, 'Cancel'); if (!r) break; v = (ASK_FORM.n || '').trim(); } if (!v) break;
      if (!(await sharedYardOk(f))) break; f.name = v; touch(f); NEXT_LOG_LABEL = `Farm named: ${v}`; S.skipConfirm = true; if (await changed()) toast('✓ Renamed to ' + v); break; }
    case 'fname-road': { const f = IDX.farms.get(d.fid); if (!f) break; el.disabled = true; el.textContent = 'Looking up…'; const p = f.turn && f.turn.lat != null ? f.turn : f; const rd = await roadFromPin(p); if (!rd) { toast("Couldn't find the road from the pin — use Another name"); el.disabled = false; el.textContent = '📍 Find the road from the pin'; break; } S.roadSug = { ...(S.roadSug || {}), [f.id]: rd }; JOBS_CACHE = null; rerenderJobs(); toast('Found: ' + rd); break; }
    case 'photo-fix': { const x = d.k === 'contact' ? D.contacts.find((y) => y.id === d.id) : IDX.biz.get(d.id); if (!x) break; if (d.v === 'auto') { if (d.k === 'contact') x.photoChoice = 'auto'; else delete x.photoChoice; } else if (d.v !== 'leave') x.photoChoice = d.v; if (chosenPhoto(x)) x.photoCats = d.k === 'contact' ? catSig(x) : bizSig(x); else delete x.photoCats; touch(x); photoCache.clear(); NEXT_LOG_LABEL = `Photo checked: ${d.k === 'contact' ? fullName(x) : x.name}`; S.skipConfirm = true; if (await changed()) toast('✓ Photo updated'); break; }
    case 'nm-link': { const j = jobs().find((x) => x.key === d.key); const o = D.contacts.find((x) => x.id === d.cid); if (!j || !o) break; const N = j.nm; const same = (x) => !x.cid && (x.name || '').toLowerCase() === N.name.toLowerCase();
      if (N.kind === 'helper') { const b = IDX.biz.get(N.owner); if (!b) break; b.helpers = (b.helpers || []).map((x) => (same(x) ? { cid: o.id, ...(x.note ? { note: x.note } : {}) } : x)).filter((x, i, arr) => arr.findIndex((y) => helperKey(y) === helperKey(x)) === i); touch(b); }
      else { const c = D.contacts.find((x) => x.id === N.owner); if (!c) break; if (N.kind === 'related') { const r = (c.related || []).find(same); c.related = (c.related || []).filter((x) => !same(x)); setRelated(c, o, (r && r.rel) || 'Other', backRel((r && r.rel) || 'Other', c)); }
        else { const r = (c.noMentionRel || []).find(same); nmPut(c, null, N.name, null); nmPut(c, o, '', { rel: (r && r.rel) || '', note: (r && r.note) || '' }, (r && r.rel) ? backRel(r.rel, c) : ''); } touch(c); }
      NEXT_LOG_LABEL = `Linked "${N.name}" to ${fullName(o)}`; S.skipConfirm = true; if (await changed()) toast('✓ Linked to ' + fullName(o)); break; }
    case 'person-split': { const c = D.contacts.find((x) => x.id === d.cid); if (!c) break; c.photoChoice = d.v; touch(c); photoCache.clear(); NEXT_LOG_LABEL = `Photo ${d.v === 'auto' ? 'back to automatic' : 'split'}: ${fullName(c)}`; S.skipConfirm = true; if (await changed()) toast(d.v === 'auto' ? 'Photo back to automatic' : '✓ Photo split'); break; }
    case 'biz-split': { const b = IDX.biz.get(d.bid); if (!b) break; b.photoChoice = d.v; touch(b); if (d.key) { D.dismissed = D.dismissed || {}; D.dismissed[d.key] = Date.now(); D._dismissDirty = true; } photoCache.clear(); NEXT_LOG_LABEL = `Business photo split: ${b.name}`; S.skipConfirm = true; if (await changed()) toast('✓ Photo split — change it any time in Edit business'); break; }
    case 'cat-all': { const bz = IDX.biz.get(d.bid); const cs = IDX.bizContacts.get(d.bid) || []; let n = 0;
      if (bz && bizCat(bz) !== d.tag) setBizCat(bz, d.tag); // the business takes the category too, and everyone follows it
      cs.forEach((c) => { if (catOf(c) !== d.tag || c.ownCats) { setOne(c, d.tag); n++; } });
      NEXT_LOG_LABEL = `Set everyone at ${bz?.name || ''} (business and ${cs.length} contact${cs.length === 1 ? '' : 's'}) to ${tagName(d.tag)}`; photoCache.clear();
      if (await changed()) { Sync.soon(); toast(`✓ ${bz?.name || 'Business'} and its contacts are now ${tagName(d.tag)}`); } break; }
    case 'cat-apply': { const n = applyCat(d.cid, d.at); NEXT_LOG_LABEL = `Category change copied to ${n} other contact${n === 1 ? '' : 's'}`; Sync.soon(); if (await changed()) toast('Updated ' + n + ' contact' + (n === 1 ? '' : 's')); break; }
    case 'block-yes': setBlocked(d.cid, true); Sync.soon(); if (await changed()) toast('Marked: Number blocked (confirmed)'); break;
    case 'block-no': setBlocked(d.cid, false); Sync.soon(); if (await changed()) toast('Marked: Number blocked (needs confirming)'); break;
    case 'keep-photo': { const c = D.contacts.find((x) => x.id === d.id); if (c && keepPhoto(c)) { NEXT_LOG_LABEL = 'Photo left as is'; photoCache.clear(); if (await changed()) toast('Photo left as is'); } break; }
    case 'use-photo': { const c = D.contacts.find((x) => x.id === d.id); if (c) { c.photoChoice = d.tag; touch(c); if (await changed()) toast('Photo set'); } break; }
    case 'accept-google': { const f = IDX.farms.get(d.fid); const fl = f.flags.find((x) => x.type === 'kmcheck'); f.kmReturn = fl.google; f.kmStatus = 'verified'; f.flags = f.flags.filter((x) => x.type !== 'kmcheck'); touch(f); changed(); break; }
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
    case 'backup-list': { const box = $('#backup-res'); if (!GAuth.valid()) { toast('Sign in to Google (Settings → Sync) first'); break; } box.innerHTML = '<div class="hint">Loading…</div>';
      try { const all = await Backup.list(); const wk = Date.now() - 8 * 86400000; S.backups = all; const recent = all.map((f, i) => ({ f, i })).filter(({ f }) => !f.createdTime || new Date(f.createdTime).getTime() >= wk);
        const ver = (f) => { const m = (f.description || '').match(/app v([\d.]+)/); return m ? 'app v' + m[1] : 'version not recorded'; }; const cnt = (f) => ((f.description || '').match(/· (\d+ contacts.*)$/) || [])[1] || '';
        box.innerHTML = `<div class="hint" style="margin:6px 0">${recent.length} backup${recent.length === 1 ? '' : 's'} in the last week (${all.length} kept in all).${recent.length < 7 ? ' A backup is only made on days when a device opens the app and syncs — days nobody used it have none.' : ''}</div>` + (recent.map(({ f, i }) => `<div class="kv" style="align-items:center"><div class="v"><b>${h(f.name.replace(Backup.PREFIX, '').replace('.json', ''))}</b>${f.createdTime ? ` <span class="hint">saved ${new Date(f.createdTime).toLocaleString('en-AU')}</span>` : ''}<br><span class="hint">${h(ver(f))}${cnt(f) ? ' · ' + h(cnt(f)) : ''}${f.size ? ' · ' + Math.round(f.size / 1024) + ' KB' : ''}</span></div><button class="btn small" data-act="backup-dl" data-i="${i}" title="Save a copy of this backup to this device">⬇ Download</button><button class="btn small" data-act="backup-restore" data-i="${i}">Restore</button></div>`).join('') || '<div class="hint">No backups in the last week — tap "Back up now".</div>'); } catch (err) { box.innerHTML = `<div class="hint" style="color:var(--red)">${h(err.message)}</div>`; } break; }
    case 'backup-restore': { const f = (S.backups || [])[+d.i]; if (!f) break; if (!(await ask(`Restore everything to the backup from ${f.name.replace(Backup.PREFIX, '').replace('.json', '')}?\n\nAll contacts, businesses and settings go back to how they were then, on every device. Changes made since then are lost (the change log keeps a record).`, 'Yes — restore this backup', true))) break; try { toast('Restoring…'); await Backup.restore(f); toast('✓ Backup restored'); } catch (err) { toast('Restore failed: ' + err.message); } break; }
    case 'exp-people': downloadFile(`bovitech-${lab('contacts').toLowerCase().replace(/\W+/g, '-')}-${Backup.day()}.csv`, peopleCsv(sortContactsBy(D.contacts.slice(), 'first')), 'text/csv'); break;
    case 'exp-biz': downloadFile(`bovitech-${lab('biz').toLowerCase().replace(/\W+/g, '-')}-${Backup.day()}.csv`, bizCsv(D.businesses.slice().sort((a, b) => alphaCmp(a.name, b.name))), 'text/csv'); break;
    case 'exp-vcf': downloadFile(`bovitech-contacts-${Backup.day()}.vcf`, vcards(D.contacts), 'text/vcard'); break;
    case 'catclass-reset': D.settings.catClass = { p: {}, b: {} }; touch(D.settings); NEXT_LOG_LABEL = 'Categories reset to default client / non-client'; S.skipConfirm = true; JOBS_CACHE = null; await changed(); toast('Reset to default'); break;
    case 'hideinact': S.hideIn[d.v] = el.checked; try { localStorage.setItem('bvt-hideinact2', JSON.stringify(S.hideIn)); } catch (e2) { } d.v === 'b' ? renderBizList() : renderContactList(); break;
    case 'save-home': { const g = parseGps(val('s-homegps')); if (!g) { toast('GPS not recognised'); break; } Object.assign(D.settings.home, { address: val('s-homeaddr'), lat: g.lat, lng: g.lng }); touch(D.settings); if (await changed()) toast('Homebase saved'); break; }
    case 'scheme': savePref('scheme', d.v); applyUi(); renderAll(); toast('Colour scheme saved for this device'); break;
    case 'lay-k': S.layK = d.v; renderAll(); break;
    case 'lay-mv': case 'lay-reset': { if (!needAdmin()) break; const K = S.layK || 'contact'; const lay = { ...(D.settings.layout || {}) }; const hide = { ...(D.settings.layoutHide || {}) };
      if (a === 'lay-mv') { const keys = layoutKeys(K); const i = keys.indexOf(d.k), j = i + +d.d; if (i < 0 || j < 0 || j >= keys.length) break; [keys[i], keys[j]] = [keys[j], keys[i]]; lay[K] = keys; }
      if (a === 'lay-reset') { if (!(await ask(`Put the ${K} page back to the standard order, with every section always shown?`, 'Yes — reset'))) break; delete lay[K]; delete hide[K]; const lm = { ...(D.settings.layoutMode || {}) }; delete lm[K]; D.settings.layoutMode = lm; }
      D.settings.layout = lay; D.settings.layoutHide = hide; touch(D.settings); NEXT_LOG_LABEL = 'Page layout changed (' + K + ' page)'; S.skipConfirm = true; await changed(); break; }
    case 'gacct-edit': { const r = await askBox('Practice Google account', `<div class="hint" style="margin-bottom:6px">Every device signs in with this one Google account — it holds the shared data file in Google Drive and the Google Contacts. If a device signs in with a different account, the app refuses it and asks again.</div><input data-ask="v" type="email" value="${h(practiceAccount())}" style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"><div class="hint" style="margin-top:6px">⚠ Only change this if the practice is moving to a different Google account — the shared data file has to be in the new account's Google Drive.</div>`, 'Save', true, 'Cancel');
      const v = (ASK_FORM.v || '').trim().toLowerCase(); if (!r || !v || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) break; D.settings.gAccount = v; touch(D.settings); NEXT_LOG_LABEL = 'Practice Google account set to ' + v; S.skipConfirm = true; await changed(); break; }
    case 'icon-edit': { if (!needAdmin()) break; const def = [...ICON_DEFS, ...SYM_DEFS].find((x) => x[0] === d.k); if (!def) break; const cur = (D.settings.icons || {})[d.k] || def[1];
      const r = await askBox('Symbol for ' + def[2], `<div class="hint" style="margin-bottom:6px">Standard: <span style="font-size:20px">${h(def[1])}</span></div>${emojiField(cur)}`, 'Save', false, 'Cancel', 'Back to standard');
      if (!r) break; const all = { ...(D.settings.icons || {}) }; const v = (ASK_FORM.emoji || '').trim(); if (r === 'alt' || !v || v === def[1]) delete all[d.k]; else all[d.k] = v;
      D.settings.icons = all; touch(D.settings); NEXT_LOG_LABEL = `Symbol for ${def[2]}: ${all[d.k] || def[1]}`; S.skipConfirm = true; await changed(); break; }
    case 'pref-fix': { const c = D.contacts.find((x) => x.id === d.cid); if (!c) break; c[d.field] = d.rest; c.pref = d.pref; if (d.first) c.first = d.first; touch(c); NEXT_LOG_LABEL = `${fullName(c)}: preferred name ${c.pref}`; if (await changed()) toast('Preferred name saved'); break; }
    case 'abbr-fix': { const b = IDX.biz.get(d.bid); if (!b) break; let ab = d.abbr, nm = d.name || b.name;
      if (d.full || !ab) { const r = await askBox(d.full ? 'Full name for ' + d.abbr : 'Abbreviation', `${d.full ? `<div class="f"><span class="lbl">Full business name</span><input data-ask="nm" style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"></div>` : ''}<div class="f"><span class="lbl">Abbreviation</span><input data-ask="ab" value="${h(d.abbr || abbrGuess(nm))}" style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"></div>`, 'Save', false, 'Cancel');
        if (!r) break; ab = (ASK_FORM.ab || '').trim(); if (d.full) { nm = (ASK_FORM.nm || '').trim(); if (!nm || nm.toUpperCase() === ab.toUpperCase()) { toast('Type the full name first'); break; } } if (!ab) break; }
      b.name = nm; b.abbr = ab; touch(b); reindex(); NEXT_LOG_LABEL = `${b.name}: abbreviation ${ab}`; if (await changed()) toast('Abbreviation saved'); break; }
    case 'maiden-fix': { const c = D.contacts.find((x) => x.id === d.cid); if (!c || !maidenApply(c)) break; NEXT_LOG_LABEL = `${fullName(c)}: maiden name ${c.maiden} moved to its own box`; if (await changed()) toast('Maiden name moved'); break; }
    case 'note-add': case 'note-edit': case 'note-resolve': case 'note-reopen': await noteAction(a, d); break;
    case 'admin-unlock': { const r = await askBox('Admin', `<div class="f"><span class="lbl">Admin PIN</span><input data-ask="pin" type="password" inputmode="numeric" autocomplete="off" style="width:160px;font-size:20px;padding:9px;border:1px solid var(--line);border-radius:9px;letter-spacing:4px"></div>`, 'Unlock', false, 'Cancel');
      if (!r) break; const hsh = await pinHash((ASK_FORM.pin || '').trim()); if (hsh !== (D.settings.adminHash || ADMIN_HASH)) { toast('Wrong PIN'); break; } S.admin = true; toast('🔓 Admin unlocked — open any contact or business and tap 🎨 Edit how this page looks'); renderAll(); break; }
    case 'admin-lock': S.admin = false; S.editPage = false; toast('🔒 Locked'); renderAll(); break;
    case 'admin-pin': { if (!needAdmin()) break; const r = await askBox('Change admin PIN', `<div class="f"><span class="lbl">New PIN (4–8 numbers)</span><input data-ask="p1" type="password" inputmode="numeric" style="width:160px;font-size:20px;padding:9px;border:1px solid var(--line);border-radius:9px"></div><div class="f"><span class="lbl">Type it again</span><input data-ask="p2" type="password" inputmode="numeric" style="width:160px;font-size:20px;padding:9px;border:1px solid var(--line);border-radius:9px"></div>`, 'Save', false, 'Cancel');
      if (!r) break; const p1 = (ASK_FORM.p1 || '').trim(); if (!/^\d{4,8}$/.test(p1)) { toast('Use 4–8 numbers'); break; } if (p1 !== (ASK_FORM.p2 || '').trim()) { toast("The two PINs don't match"); break; }
      D.settings.adminHash = await pinHash(p1); touch(D.settings); NEXT_LOG_LABEL = 'Admin PIN changed'; S.skipConfirm = true; await changed(); toast('Admin PIN changed on every device'); break; }
    case 'edit-page': if (!needAdmin()) break; S.editPage = !S.editPage; renderAll(); break;
    case 'ep-mv': { if (!needAdmin()) break; const K = d.kind; const keys = layoutKeys(K); const i = keys.indexOf(d.k), j = i + +d.d; if (i < 0 || j < 0 || j >= keys.length) break; [keys[i], keys[j]] = [keys[j], keys[i]];
      D.settings.layout = { ...(D.settings.layout || {}), [K]: keys }; touch(D.settings); NEXT_LOG_LABEL = 'Page layout changed (' + K + ' page)'; S.skipConfirm = true; await changed(); break; }
    case 'ep-name': if (!needAdmin()) break; S.layK = d.kind; if (d.k.startsWith('cs:')) { const list = [...(D.settings.customSecs || [])]; const ci = list.findIndex((x) => 'cs:' + x.id === d.k); const v = ci >= 0 && await customSecForm(list[ci]); if (v) { list[ci] = v; D.settings.customSecs = list; touch(D.settings); NEXT_LOG_LABEL = 'Custom section changed: ' + v.name; S.skipConfirm = true; await changed(); } } else await secNameForm(d.kind, d.k); break;
    case 'cj-new': cjSheet(null); break;
    case 'cj-edit': { if (!needAdmin()) break; const cj = cjList().find((x) => 'cj_' + x.id === d.type); if (cj) cjSheet(cj); break; }
    case 'cj-addrule': { cjRead(); S.cjDraft.rules.push({ f: '', op: '' }); cjRedraw(); break; }
    case 'cj-delrule': { cjRead(); S.cjDraft.rules.splice(+d.i, 1); if (!S.cjDraft.rules.length) S.cjDraft.rules.push({ f: '', op: '' }); cjRedraw(); break; }
    case 'cj-copy': { const desc = val('cj-desc'); if (!desc) { toast('Describe what the list should find first'); break; } S.cjDesc = desc; const txt = cjPrompt(desc); let ok = false; try { await navigator.clipboard.writeText(txt); ok = true; } catch (err) { }
      const info = $('#cj-copyinfo'); if (ok) { info.innerHTML = "✓ Copied. Paste it into Claude, then copy Claude's whole reply into box 3."; window.open(D.settings.aiChatUrl || 'https://claude.ai/new', '_blank'); } else info.innerHTML = `Couldn't copy automatically — select all of this, copy it and paste it into Claude:<textarea readonly style="min-height:100px;margin-top:6px">${h(txt)}</textarea>`; break; }
    case 'cj-fill': { const out = $('#cj-fillinfo'); try { const r = cjParse($('#cj-reply').value || ''); const dr = S.cjDraft; Object.assign(dr, r); $('#cj-name').value = dr.name; $('#cj-emoji').value = dr.emoji; $('#cj-why').value = dr.why; $('#cj-kind').value = dr.kind; $('#cj-match').value = dr.match; if (!dr.rules.length) dr.rules.push({ f: '', op: '' }); cjRedraw(); out.innerHTML = '✓ Filled in — check the rule and the matches below, then tap Save.'; } catch (err) { out.innerHTML = `<span style="color:var(--red)">${h(err.message)}</span>`; } break; }
    case 'joblist-del': { if (!needAdmin()) break; const t = d.type; const cj = cjList().find((x) => 'cj_' + x.id === t); const name = JOB_TYPES[t] ? JOB_TYPES[t].t : t;
      if (!(await askBox('Delete job list?', `<p><b>${h(name)}</b></p><p>${cj ? 'This removes your job list from every device.' : 'This hides this built-in job list on every device. You can restore it at the bottom of the Jobs page.'}</p>`, 'Delete job list', true))) break;
      if (cj) D.settings.customJobs = cjList().filter((x) => x !== cj); else D.settings.jobsDeleted = [...new Set([...(D.settings.jobsDeleted || []), t])]; touch(D.settings); JOBS_CACHE = null; NEXT_LOG_LABEL = `Job list deleted: ${name}`; S.skipConfirm = true; if (await changed()) toast('Job list deleted'); break; }
    case 'joblist-restore': { if (!needAdmin()) break; D.settings.jobsDeleted = (D.settings.jobsDeleted || []).filter((x) => x !== d.type); touch(D.settings); JOBS_CACHE = null; NEXT_LOG_LABEL = `Job list restored: ${JOB_TYPES[d.type] ? JOB_TYPES[d.type].t : d.type}`; S.skipConfirm = true; if (await changed()) toast('Restored'); break; }
    case 'photo-view': { const { list } = photoTarget(d.type, d.id, d.nid); const p = (list || []).find((x) => x.id === d.pid); if (!p) break; const ov = document.createElement('div'); ov.className = 'photoview'; ov.innerHTML = `<img src="${p.data}" alt="Photo"><div class="actions"><a class="btn" href="${p.data}" download="photo-${p.id}.jpg">⬇ Save</a><button class="btn" data-act="photo-close">✕ Close</button></div>`; ov.addEventListener('click', (ev) => { if (ev.target === ov) ov.remove(); }); document.body.appendChild(ov); break; }
    case 'photo-close': { const ov = el.closest('.photoview'); if (ov) ov.remove(); break; }
    case 'photo-del': { const { rec, list } = photoTarget(d.type, d.id, d.nid); if (!rec || !list) break; if (!(await ask('Delete this photo?', 'Yes — delete it', true))) break; const i = list.findIndex((x) => x.id === d.pid); if (i < 0) break; list.splice(i, 1); touch(rec); NEXT_LOG_LABEL = 'Photo deleted'; S.skipConfirm = true; if (await changed()) { refreshNoteBlocks(); toast('Photo deleted'); } break; }
    case 'keep-note': { const b = IDX.biz.get(d.bid); if (!b) break; const me = myInitials(); const inits = [...new Set([me, ...keepInits()].filter((x) => x && x !== '?'))];
      const farms = b.farms.filter((f) => !(b.farmLinks.find((l) => l.fid === f.id) || {}).past); const rad = 'style="display:flex;gap:8px;align-items:center;margin:5px 0;font-size:16px"';
      const r = await askBox('Appointment note — ' + b.name, `<div class="f"><span class="lbl">Initials</span>${inits.map((x, i) => `<label ${rad}><input type="radio" name="kn-i" data-ask="ini" value="${h(x)}" ${i ? '' : 'checked'}> ${h(x)}${x === me ? ' <span class="hint">(this phone)</span>' : ''}</label>`).join('')}<label ${rad}><input type="radio" name="kn-i" data-ask="ini" value="__other"> Other: <input data-ask="iniOther" maxlength="6" style="width:90px;padding:6px;border:1px solid var(--line);border-radius:8px;text-transform:uppercase"></label></div>
        ${(() => { const P = b.patientIds || []; if (!P.length) return '<div class="hint" style="margin-bottom:6px">No patient IDs on this business — the Patient ID line will be left blank.</div>'; return `<div class="f"><span class="lbl">Patient ID</span>${P.map((p, i) => `<label ${rad}><input type="radio" name="kn-p" data-ask="pid" value="${i}" ${i ? '' : 'checked'}> ${pidEmo(p)}${h(p.value)}${p.label ? ` <span class="hint">${h(p.label)}</span>` : ''}</label>`).join('')}<label ${rad}><input type="radio" name="kn-p" data-ask="pid" value=""> Leave blank</label></div>`; })()}
        <div class="f"><span class="lbl">Appointment type</span>${KEEP_TYPES.map(([t, k], i) => `<label ${rad}><input type="radio" name="kn-t" data-ask="type" value="${h(t)}" ${i ? '' : 'checked'} onchange="var x=document.getElementById('kn-farms');if(x)x.hidden=this.dataset.nf==='1'" data-nf="${/\{(property|travel)\}/.test(keepTpl(k)) ? '0' : '1'}"> ${h(t)}</label>`).join('')}</div>
        ${farms.length ? `<div class="f" id="kn-farms" ${/\{(property|travel)\}/.test(keepTpl(KEEP_TYPES[0][1])) ? '' : 'hidden'}><span class="lbl">Farm(s) — for on-farm appointments</span>${farms.map((f, i) => `<label ${rad}><input type="checkbox" data-askchk="f_${f.id}" ${farms.length === 1 || i === 0 ? 'checked' : ''}> ${h(f.name || f.address || 'Farm')}</label>`).join('')}<label ${rad} style="font-size:14px"><input type="checkbox" data-askchk="route"> Set the route — order, going back to a farm, or starting / finishing somewhere other than Bovitech</label></div>` : '<div class="hint" id="kn-farms">No farms on this business — property name and travel will be left blank.</div>'}`, 'Next', false, 'Cancel');
      if (!r) break; let ini = ASK_FORM.ini === '__other' ? (ASK_FORM.iniOther || '').trim().toUpperCase() : ASK_FORM.ini; if (!ini) ini = me; const type = ASK_FORM.type || KEEP_TYPES[0][0]; const pidP = ASK_FORM.pid !== '' && ASK_FORM.pid != null ? (b.patientIds || [])[+ASK_FORM.pid] : null; const patientid = pidP ? pidP.value + (pidP.label ? ' (' + pidP.label + ')' : '') : ''; const kind = (KEEP_TYPES.find((x) => x[0] === type) || [, 'farm'])[1];
      KN_EP.s = KN_EP.e = null; const wantRoute = !!ASK_FORM.route; let picked = farms.filter((f) => ASK_FORM['f_' + f.id]); const tpl = keepTpl(kind); const needFarm = /\{(property|travel)\}/.test(tpl);
      if (needFarm && picked.length && (picked.length > 1 || wantRoute)) { const allF = farms; const sel = (i, v) => `<div class="f knstop"><span class="lbl">Stop ${i + 1}</span><select data-ask="o${i}" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px">${allF.map((g) => `<option value="${g.id}" ${v === g.id ? 'selected' : ''}>${h(g.name || g.address || 'Farm')}</option>`).join('')}</select></div>`;
        KEEP_STOPSEL = sel; const knEp = (w) => `<div class="f knep"><span class="lbl">${w === 's' ? '🏁 Leaving from' : '🏁 Coming back to'}</span><input type="hidden" data-ask="kn_${w}" id="kn-ep-${w}" value=""><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><b id="kn-ep-l-${w}">🏠 Bovitech</b><button type="button" class="btn small" data-act="kn-ep-home" data-w="${w}">Bovitech</button></div><input class="kn-ep-q" data-w="${w}" placeholder="🔍 Somewhere else? Search farms or businesses" autocomplete="off" style="width:100%;margin-top:4px;padding:8px;border:1px solid var(--line);border-radius:8px;font-size:15px"><div id="kn-ep-res-${w}"></div></div>`;
        const ord = await askBox('Route — in the order you\'ll visit', `<div class="hint" style="margin-bottom:6px">Bovitech is the usual start and finish — search to change either. You can go back to the same farm — e.g. Farm A → Farm B → Farm A.</div>${knEp('s')}<div id="kn-stops">${picked.map((f, i) => sel(i, f.id)).join('')}</div><div class="actions"><button type="button" class="btn small" data-act="kn-addstop">➕ Add another stop</button><button type="button" class="btn small" data-act="kn-delstop">✕ Remove the last stop</button></div>${knEp('e')}`, 'Use this route', false, 'Cancel');
        if (!ord) break; KN_EP.s = IDX.farms.get(ASK_FORM.kn_s) || null; KN_EP.e = IDX.farms.get(ASK_FORM.kn_e) || null; const o = []; for (let i = 0; ASK_FORM['o' + i] != null; i++) { const g = IDX.farms.get(ASK_FORM['o' + i]); if (g) o.push(g); } if (!o.length) { toast('Add at least one stop'); break; } picked = o; }
      let travel = '', prop = needFarm ? [...new Set(picked.map((f) => f.name || f.address || 'Farm'))].join(', ') : ''; const home = 'Bovitech';
      if (needFarm && picked.length === 1 && !wantRoute && !KN_EP.s && !KN_EP.e) { const f = picked[0]; travel = f.kmReturn != null ? `${f.kmReturn} km (${home} > ${f.name || 'farm'} > ${home})` : ''; }
      else if (needFarm && picked.length >= 1) { toast('Working out the distance…'); const sN = KN_EP.s ? farmLabel(KN_EP.s) : home, eN = KN_EP.e ? farmLabel(KN_EP.e) : home; const path = [sN, ...picked.map((f) => f.name || 'farm'), eN].join(' > ');
        try { const km = await Maps.loop(KN_EP.s ? farmRoutePt(KN_EP.s) : D.settings.home, picked.map(farmRoutePt), KN_EP.e ? farmRoutePt(KN_EP.e) : D.settings.home); travel = km != null ? `${Math.ceil(km - 1e-9)} km (${path})` : ''; } catch (e2) { travel = ''; } if (!travel) travel = `?? km (${path}) — couldn't calculate, please check`; }
      let start = '', finish = '', brk = 'no/yes', labour = 'no/yes', ttype = 'standard/shared 25%/shared 50%/no travel', calltime = '', fec = { bulk: '', indiv: '', trays: '', kits: '' }; const inp2 = 'style="padding:7px;border:1px solid var(--line);border-radius:8px;font-size:16px"';
      if (/\{(bulk|indiv|trays|kits)\}/.test(tpl)) { const nf = (k2, l) => `<div class="f"><span class="lbl">${l}</span><input data-ask="${k2}" inputmode="numeric" style="width:100%;padding:7px;border:1px solid var(--line);border-radius:8px;font-size:16px"></div>`;
        const r3 = await askBox('FEC testing', nf('bulk', 'How many bulk samples? <span class="hint">(optional - can leave blank)</span>') + nf('indiv', 'How many individual animal samples? <span class="hint">(optional - can leave blank)</span>') + nf('trays', 'How many FEC trays returned? <span class="hint">(optional - can leave blank)</span>') + nf('kits', 'How many FEC kits dispensed? <span class="hint">(optional - can leave blank)</span>'), 'Next', false, 'Cancel'); if (!r3) break; ['bulk', 'indiv', 'trays', 'kits'].forEach((k2) => { fec[k2] = (ASK_FORM[k2] || '').trim(); }); }
      const OPT = '<span class="hint">(optional - can leave blank)</span>'; const perMin = kind === 'phone' && /per min/i.test(type);
      if (/\{(start|finish|break|labour|traveltype|calltime)\}/.test(tpl)) { const q2 = kind === 'phone' ? (perMin ? `<div class="f"><span class="lbl">What time did the call start? ${OPT}</span>${timePick5('call')}</div><div class="f"><span class="lbl">What time did the call end? ${OPT}</span>${timePick5('callEnd')}</div>` : `<div class="f"><span class="lbl">What time did the call start? ${OPT}</span>${timePick5('call')}</div>`)
          : `<div class="f"><span class="lbl">Start time ${OPT}</span>${timePick5('start')}</div><div class="f"><span class="lbl">Finish time ${OPT}</span>${timePick5('finish')}</div>
          <div class="f"><span class="lbl">Break</span><label ${rad}><input type="radio" name="kn-b" data-ask="brk" value="leave" checked> Leave all the options to choose later</label><label ${rad}><input type="radio" name="kn-b" data-ask="brk" value="no"> No</label><label ${rad}><input type="radio" name="kn-b" data-ask="brk" value="yes" id="kn-byes"> Yes — how long? <input data-ask="brkLen" ${inp2} style="width:110px" onfocus="document.getElementById('kn-byes').checked=true"></label></div>
          <div class="f"><span class="lbl">Additional labour</span><label ${rad}><input type="radio" name="kn-l" data-ask="lab" value="leave" checked> Leave all the options to choose later</label><label ${rad}><input type="radio" name="kn-l" data-ask="lab" value="no"> No</label><label ${rad}><input type="radio" name="kn-l" data-ask="lab" value="yes" id="kn-lyes"> Yes — how many hours? <input data-ask="labHrs" inputmode="decimal" ${inp2} style="width:80px" onfocus="document.getElementById('kn-lyes').checked=true"></label></div>
          ${/\{traveltype\}/.test(tpl) ? `<div class="f"><span class="lbl">Travel type</span>${[['leave', 'Leave all the options to choose later'], ['standard', 'Standard'], ['shared 25%', 'Shared 25%'], ['shared 50%', 'Shared 50%'], ['no travel', 'No travel']].map(([v, l], i) => `<label ${rad}><input type="radio" name="kn-tt" data-ask="tt" value="${v}" ${i ? '' : 'checked'}> ${l}</label>`).join('')}</div>` : ''}`;
        const r2 = await askBox('Times and extras', q2 + '<div class="hint">Anything left blank stays blank for you to fill in later.</div>', 'Next', false, 'Cancel'); if (!r2) break;
        const tm = (k2) => { const H = ASK_FORM[k2 + '_h']; if (!H) return ''; return `${H}:${ASK_FORM[k2 + '_m'] || '00'} ${apOf(k2)}`; }; const apOf = (k2) => ASK_FORM[k2 + '_ap'] || (+ASK_FORM[k2 + '_h'] >= 6 && +ASK_FORM[k2 + '_h'] <= 11 ? 'am' : 'pm'); /* am/pm left blank: 6–11 = am, 12–5 = pm */
        const mins = (k2) => { const H = ASK_FORM[k2 + '_h']; if (!H) return null; return ((+H % 12) + (apOf(k2) === 'pm' ? 12 : 0)) * 60 + +(ASK_FORM[k2 + '_m'] || 0); };
        start = tm('start'); finish = tm('finish'); calltime = tm('call');
        if (perMin) { const ce = tm('callEnd'); if (calltime || ce) { const a = mins('call'), z = mins('callEnd'); calltime = `${calltime || '?'} to ${ce || '?'}${a != null && z != null && z >= a ? ` (${z - a} min)` : ''}`; } }
        brk = ASK_FORM.brk === 'no' ? 'no' : ASK_FORM.brk === 'yes' ? `yes${(ASK_FORM.brkLen || '').trim() ? ' (' + ASK_FORM.brkLen.trim() + ')' : ''}` : 'no/yes';
        labour = ASK_FORM.lab === 'no' ? 'no' : ASK_FORM.lab === 'yes' ? `yes - number of hours = ${(ASK_FORM.labHrs || '').trim() || 'X'}` : 'no/yes';
        if (ASK_FORM.tt && ASK_FORM.tt !== 'leave') ttype = ASK_FORM.tt; }
      const now = new Date(); const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const text = tpl.replace(/\{patientid\}/g, patientid).replace(/\{date\}/g, date).replace(/\{initials\}/g, ini).replace(/\{name\}/g, b.name).replace(/\{type\}/g, type).replace(/\{property\}/g, prop).replace(/\{travel\}/g, travel).replace(/\{start\}/g, start).replace(/\{finish\}/g, finish).replace(/\{break\}/g, brk).replace(/\{labour\}/g, labour).replace(/\{traveltype\}/g, ttype).replace(/\{calltime\}/g, calltime).replace(/\{bulk\}/g, fec.bulk).replace(/\{indiv\}/g, fec.indiv).replace(/\{trays\}/g, fec.trays).replace(/\{kits\}/g, fec.kits);
      const lines = text.split('\n'); const title = lines[0].trim(), body = lines.slice(1).join('\n').replace(/^\n+/, '');
      const go = await askBox('Your note', `<div class="hint" style="margin-bottom:6px">Title: <b>${h(title)}</b></div><textarea data-ask="body" style="width:100%;min-height:220px;font-size:15px;padding:9px;border:1px solid var(--line);border-radius:9px;font-family:inherit">${h(body)}</textarea><div class="hint">You can change anything here first. Tap <b>Send to Keep</b>, then pick <b>Keep</b> from the list.</div>`, '📝 Send to Keep', false, 'Cancel', '📋 Just copy it');
      if (!go) break; const finalBody = ASK_FORM.body != null ? ASK_FORM.body : body; const full = title + '\n' + finalBody; try { await navigator.clipboard.writeText(full); } catch (e3) { }
      if (go === 'alt') { toast('📋 Copied'); break; }
      if (navigator.share) { try { await navigator.share({ title, text: finalBody }); break; } catch (e4) { if (e4 && e4.name === 'AbortError') { toast('Not sent — it\'s copied if you want to paste it'); break; } } }
      toast('📋 Copied — paste it into a new Keep note'); window.open(/Android/i.test(navigator.userAgent) ? 'intent://keep.google.com/#Intent;scheme=https;package=com.google.android.keep;end' : 'https://keep.google.com/', '_blank'); break; }
    case 'keep-tpl-save': { if (!needAdmin()) break; const all = { ...(D.settings.keepTpl || {}) }; Object.keys(KEEP_DEF).forEach((k) => { const v = ($('#keep-' + k) || {}).value; if (v == null) return; if (v.trim() === KEEP_DEF[k].trim()) delete all[k]; else all[k] = v; }); D.settings.keepTpl = all; { const iv = ($('#keep-inits') || {}).value; if (iv != null) { const li = [...new Set(iv.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean))]; if (!li.length || li.join() === KEEP_INITS_DEF.join()) delete D.settings.keepInits; else D.settings.keepInits = li; } } touch(D.settings); NEXT_LOG_LABEL = 'Keep note templates changed'; S.skipConfirm = true; if (await changed()) toast('Templates saved'); break; }
    case 'keep-tpl-reset': { if (!needAdmin()) break; const all = { ...(D.settings.keepTpl || {}) }; delete all[d.k]; D.settings.keepTpl = all; touch(D.settings); NEXT_LOG_LABEL = `Keep note template reset: ${KEEP_NAMES[d.k]}`; S.skipConfirm = true; await changed(); break; }
    case 'pe-toggle': if (!needAdmin()) break; S.pageEd = S.pageEd === d.pg ? null : d.pg; renderAll(); break;
    case 'pe-reset': { if (!needAdmin()) break; if (!(await ask(`Put the ${PE_PAGES[d.pg]} page back to the standard layout, headings and colours?`, 'Yes — standard layout'))) break; const all = { ...(D.settings.pageEd || {}) }; delete all[d.pg]; D.settings.pageEd = all; touch(D.settings); NEXT_LOG_LABEL = `${PE_PAGES[d.pg]} page: back to the standard layout`; S.skipConfirm = true; await changed(); break; }
    case 'pe-mv': { if (!needAdmin()) break; const keys = peSecs(d.pg).map(peKey); const i = keys.indexOf(d.k), j = i + +d.d; if (i < 0 || j < 0 || j >= keys.length) break; [keys[i], keys[j]] = [keys[j], keys[i]]; peSave(d.pg, (c) => { c.order = keys; }); NEXT_LOG_LABEL = `${PE_PAGES[d.pg]} page: sections reordered`; S.skipConfirm = true; await changed(); break; }
    case 'pe-edit': if (!needAdmin()) break; await peEditForm(d.pg, d.k); break;
    case 'pe-rows': { if (!needAdmin()) break; const cur = peCfg(d.pg).rowSize || ''; const r = await askBox('List text size — ' + PE_PAGES[d.pg], `<div class="f"><select data-ask="sz" style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px">${[['', 'Standard'], ['13', 'Small'], ['17', 'Large'], ['19', 'Extra large']].map(([v, l]) => `<option value="${v}" ${String(cur) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`, 'Save', false, 'Cancel'); if (!r) break; peSave(d.pg, (c) => { if (ASK_FORM.sz) c.rowSize = +ASK_FORM.sz; else delete c.rowSize; }); NEXT_LOG_LABEL = `${PE_PAGES[d.pg]}: text size changed`; S.skipConfirm = true; await changed(); break; }
    case 'kn-ep-home': { const w = d.w; const hid = $('#kn-ep-' + w); if (hid) hid.value = ''; const l = $('#kn-ep-l-' + w); if (l) l.textContent = '🏠 Bovitech'; break; }
    case 'kn-ep-pick': { const w = d.w, f = IDX.farms.get(d.fid); if (!f) break; $('#kn-ep-' + w).value = f.id; $('#kn-ep-l-' + w).textContent = '📍 ' + farmLabel(f); const q = document.querySelector(`.kn-ep-q[data-w="${w}"]`); if (q) q.value = ''; $('#kn-ep-res-' + w).innerHTML = ''; break; }
    case 'kn-addstop': { const box = $('#kn-stops'); if (!box || !KEEP_STOPSEL) break; box.insertAdjacentHTML('beforeend', KEEP_STOPSEL(box.querySelectorAll('.knstop').length, '')); break; }
    case 'kn-delstop': { const st = document.querySelectorAll('#kn-stops .knstop'); if (st.length > 1) st[st.length - 1].remove(); break; }
    case 'set-title': { if (!needAdmin()) break; const sec = d.sec; const r = await askBox('Rename settings section', `<div class="f"><span class="lbl">Title</span><input data-ask="t" value="${h(setTitle(sec))}" style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"><div class="hint">Original name: ${h(sec)}. Leave empty to go back to the original.</div></div>`, 'Save', false, 'Cancel');
      if (!r) break; const v = (ASK_FORM.t || '').trim(); const all = { ...(D.settings.setTitles || {}) }; if (!v || v === sec) { delete all[sec]; if (SET_TITLE_DEF[sec] && !v) all[sec] = sec; } else all[sec] = v; D.settings.setTitles = all; touch(D.settings); NEXT_LOG_LABEL = `Settings section renamed: ${sec} → ${setTitle(sec)}`; S.skipConfirm = true; await changed(); break; }
    case 'set-lock': { if (!needAdmin()) break; const sec = d.sec; const det = el.closest('details.setsec'); const dev = det && /\(this device\)/.test(det.querySelector('summary').textContent); const now = setLocked(sec, dev);
      D.settings.setLocks = { ...(D.settings.setLocks || {}), [sec]: !now }; touch(D.settings); NEXT_LOG_LABEL = `Settings — ${sec}: ${now ? 'open to everyone' : 'admin only'}`; S.skipConfirm = true; await changed(); break; }
    case 'set-all': document.querySelectorAll('details.setsec').forEach((x) => { x.open = d.v === '1'; }); break;
    case 'show-all': S.showAll = el.checked; S.showAllFor = d.id; renderAll(); break;
    case 'box-edit': if (!needAdmin()) break; await boxForm(d.k); break;
    case 'sec-edit': if (!needAdmin()) break; await secNameForm(S.layK || 'contact', d.k); break;
    case 'cs-add': case 'cs-edit': { if (!needAdmin()) break; const list = [...(D.settings.customSecs || [])]; const i = list.findIndex((x) => x.id === d.id); const v = await customSecForm(i >= 0 ? list[i] : null); if (!v) break;
      if (i >= 0) list[i] = v; else list.push(v); D.settings.customSecs = list; touch(D.settings); NEXT_LOG_LABEL = `Custom section ${i >= 0 ? 'changed' : 'added'}: ${v.name}`; S.skipConfirm = true; await changed(); break; }
    case 'cs-del': { const list = [...(D.settings.customSecs || [])]; const x = list.find((y) => y.id === d.id); if (!x) break; const n = [...D.contacts, ...D.businesses].filter((r) => (r.custom || {})[x.id]).length;
      if (!(await ask(`Delete the "${x.name}" section?${n ? `\n\n${n} record${n === 1 ? ' has' : 's have'} something written in it — that text will be hidden (it's kept, and comes back if you add the section again with the same name).` : ''}`, 'Yes — delete', true))) break;
      D.settings.customSecs = list.filter((y) => y !== x); D.settings.customSecsGone = { ...(D.settings.customSecsGone || {}), [x.name.toLowerCase()]: x.id }; touch(D.settings); NEXT_LOG_LABEL = 'Custom section deleted: ' + x.name; S.skipConfirm = true; await changed(); break; }
    case 'lst-mv': case 'lst-del': case 'lst-edit': case 'lst-add': { const k = d.k; const list = [...LIST_GET[k]()]; const i = +d.i; const nm = k === 'linkRoles' ? 'role' : 'reason';
      if (a === 'lst-mv') { const j = i + +d.d; if (j < 0 || j >= list.length) break; [list[i], list[j]] = [list[j], list[i]]; }
      if (a === 'lst-del') { if (!(await ask(`Remove "${list[i]}" from the list?\n\nRecords that already use it keep it.`, 'Yes — remove', true))) break; list.splice(i, 1); }
      if (a === 'lst-edit' || a === 'lst-add') { const r = await askBox(a === 'lst-add' ? 'Add a ' + nm : 'Rename ' + nm, `<input data-ask="v" value="${a === 'lst-edit' ? h(list[i]) : ''}" style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px">`, 'Save', false, 'Cancel'); const v = (ASK_FORM.v || '').trim(); if (!r || !v) break; if (a === 'lst-add') list.push(v); else list[i] = v; }
      D.settings[k] = list; touch(D.settings); NEXT_LOG_LABEL = (k === 'linkRoles' ? 'Roles' : 'Reasons for inactivating') + ' list changed'; S.skipConfirm = true; await changed(); break; }
    case 'turnpin-edit': { const cur = turnPin(); const inp = 'style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"';
      const r = await askBox('Edit the turn-off pin', `<div class="hint" style="margin-bottom:6px">The pin where you leave the road (farm gate or track). Change what it's called and its symbol — it updates everywhere, on every device.</div>
        <div class="f"><span class="lbl">Name</span><input data-ask="name" value="${h(cur.name)}" ${inp}></div>
        <div class="f"><span class="lbl">Symbol</span><div style="display:flex;gap:8px;align-items:center"><input data-ask="emoji" id="pt-emoji" value="${h(cur.emoji)}" style="width:70px;font-size:26px;padding:4px;text-align:center;border:1px solid var(--line);border-radius:9px"><input id="pt-search" placeholder="🔍 Search symbols" ${inp}></div>
        <div id="pt-grid" class="emogrid" data-noicons>${emojiGrid('')}</div></div>`, 'Save', false, 'Cancel', 'Back to standard (🚩 Turn-off)');
      if (!r) break; if (r === 'alt') delete D.settings.turnPin; else { const name = (ASK_FORM.name || '').trim() || 'Turn-off', emoji = (ASK_FORM.emoji || '').trim() || '🚩'; D.settings.turnPin = { name, emoji }; }
      touch(D.settings); NEXT_LOG_LABEL = 'Turn-off pin changed to ' + turnPin().emoji + ' ' + turnName(); S.skipConfirm = true; if (await changed()) { if (FMAP) drawMapPins(); toast('Saved'); } break; }
    case 'pintype-add': case 'pintype-edit': { const cur = a === 'pintype-edit' ? pinT(d.id) : { id: '', name: '', emoji: '📍', yard: false };
      const inp = 'style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"';
      const r = await askBox(a === 'pintype-add' ? 'New pin type' : 'Edit pin type', `<div class="f"><span class="lbl">Name</span><input data-ask="name" value="${h(cur.name)}" ${inp}></div>
        <div class="f"><span class="lbl">Symbol</span><div style="display:flex;gap:8px;align-items:center"><input data-ask="emoji" id="pt-emoji" value="${h(cur.emoji)}" style="width:70px;font-size:26px;padding:4px;text-align:center;border:1px solid var(--line);border-radius:9px"><input id="pt-search" placeholder="🔍 Search symbols" ${inp}></div>
        <div id="pt-grid" class="emogrid" data-noicons>${emojiGrid('')}</div>
        <div class="hint">Tap a symbol to use it. Can't find one? Tap the symbol box and use your keyboard's emoji button (on Android the 😊 key, which has its own search; on Windows press the Windows key + full stop).</div></div>
        <label class="checks"><label><input type="checkbox" data-askchk="yard" ${cur.yard ? 'checked' : ''}> This is a type of yards (shows under "Yard pins" in ${h(lab('loc'))})</label></label>`, 'Save', false, 'Cancel');
      if (!r) break; const nm = (ASK_FORM.name || '').trim(), em = (ASK_FORM.emoji || '').trim() || '📍', yd = !!ASK_FORM.yard; if (!nm) { toast('Give the pin type a name'); break; }
      const list = pinTypes().map((t) => ({ ...t })); if (a === 'pintype-add') list.push({ id: nm.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36).slice(-3), name: nm, emoji: em, yard: yd }); else { const t = list.find((x) => x.id === d.id); if (t) { t.name = nm; t.emoji = em; t.yard = yd; } }
      D.settings.pinTypes = list; touch(D.settings); NEXT_LOG_LABEL = (a === 'pintype-add' ? 'New pin type: ' : 'Pin type changed: ') + em + ' ' + nm; S.skipConfirm = true; await changed(); break; }
    case 'emo-pick': { const x = $('#pt-emoji'); if (x) x.value = d.e; document.querySelectorAll('#pt-grid button').forEach((bb) => bb.classList.toggle('on', bb.dataset.e === d.e)); break; }
    case 'pintype-del': { const t = pinT(d.id); if (!(await ask(`Delete the pin type "${t.name}"?`, 'Yes — delete', true))) break; D.settings.pinTypes = pinTypes().filter((x) => x.id !== d.id); touch(D.settings); await changed(); break; }
    case 'save-key': D.settings.mapsKey = val('s-mapskey'); touch(D.settings); if (await changed()) toast('Key saved'); break;
    case 'export': { const blob = new Blob([JSON.stringify(D)], { type: 'application/json' }); const u = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = u; l.download = `bovitech-contacts-backup-${new Date().toISOString().slice(0, 10)}-v${APP_VERSION.split(' ')[0]}.json`; document.body.appendChild(l); l.click(); l.remove(); break; }
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
document.addEventListener('change', (e) => { const t = e.target; if (!t.matches || !t.matches('[name=dtype]')) return; const box = t.closest('#askbox, .card') || document; const ph = t.value === 'phone'; box.querySelectorAll('.dt-phone').forEach((x) => { x.hidden = !ph; }); box.querySelectorAll('.dt-comp').forEach((x) => { x.hidden = ph; }); });
document.addEventListener('input', (e) => { const t = e.target; if (t.id === 'e-fylabel') { const l = $('#e-ylbl'); if (l) l.textContent = t.value.trim(); } else if (t.classList && t.classList.contains('xp-name')) { const l = t.closest('.xpin').querySelector('.yardlbl'); if (l) l.textContent = t.value.trim(); } });
document.addEventListener('change', (e) => { const t = e.target; if (t.id === 'e-ftype' || (t.classList && t.classList.contains('xp-type'))) { const c = t.closest('.xpin'); const em = c && c.querySelector('.yemo'); if (em) em.textContent = pinT(t.value).emoji; const tu = c && c.querySelector('.yc-turn'), yd = c && c.querySelector('.yc-yard'); if (tu) tu.hidden = t.value !== 'turn'; if (yd) yd.hidden = t.value === 'turn'; } });
async function askDeviceName() { // compulsory on a new device; asked once more on each device when it first opens v8.2
  if (window.SEED) return; const recheck = !LSget('bvt-devask82'); const okPh = (v) => (v || '').replace(/\D/g, '').length >= 8; if (devInfo().nick && (devIsPhone() ? okPh(devInfo().phone) : !!LSget('bvt-devmodel')) && !recheck && LSget('bvt-devtype') && LSget('bvt-initials')) { updHi(); return; }
  await detectDevice(); const di = devInfo(); di.type = devIsPhone() ? 'phone' : 'computer'; if (di.type === 'computer' && di.dev === AUTO_DEV) di.dev = ''; const inp = 'style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"';
  for (;;) { await askBox(di.nick ? 'Check this device\'s details' : 'Who is using this device?', `<p>${di.nick ? 'The app now greets you by name and keeps a name and number for each device. Check these are right for this one.' : 'Before you start, what should the app call you? It says hi when it opens, and your name shows in the change log so everyone can see who made each change.'}</p>
      <div class="f"><span class="lbl">Your nickname</span><input data-ask="nick" value="${h(di.nick)}" ${inp}></div>
      <div class="f"><span class="lbl">This device is a…</span><div class="dtpick" style="display:flex;gap:14px;flex-wrap:wrap;font-size:16px"><label><input type="radio" name="dtype" data-ask="dtype" value="phone" ${di.type === 'phone' ? 'checked' : ''}> 📱 Phone</label><label><input type="radio" name="dtype" data-ask="dtype" value="computer" ${di.type === 'computer' ? 'checked' : ''}> 💻 Computer or tablet</label></div></div>
      <div class="f dt-phone" ${di.type === 'phone' ? '' : 'hidden'}><span class="lbl">Your phone number</span><input data-ask="phone" value="${h(di.phone)}" inputmode="tel" ${inp}><div class="hint">Phones don't let apps read their own number, so please type it in.</div></div>
      <div class="f dt-comp" ${di.type === 'computer' ? '' : 'hidden'}><span class="lbl">Whose computer is this?</span><input data-ask="comp" value="${h(di.type === 'computer' ? di.dev : '')}" ${inp}><div class="hint">Shown in the change log so everyone knows which computer made each change.</div></div>
      <div class="f"><span class="lbl">Your initials</span><input data-ask="ini" value="${h(di.ini || LSget('bvt-initials') || '')}" maxlength="4" style="width:120px;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px;text-transform:uppercase"><div class="hint">Shown next to every warning, side note, caution and repair you add or resolve.</div></div>`, 'Save', false, 'Save');
    const nick = (ASK_FORM.nick || '').trim(), ph = (ASK_FORM.phone || '').trim(); di.type = ASK_FORM.dtype === 'computer' ? 'computer' : 'phone'; const comp = (ASK_FORM.comp || '').trim(); if (di.type === 'computer') di.dev = comp; di.nick = nick; di.phone = ph; di.ini = (ASK_FORM.ini || '').trim(); // keep what was typed if we ask again
    if (!nick) { toast('Please enter a nickname'); di.phone = ph; await new Promise((r) => setTimeout(r, 300)); continue; }
    if (di.type === 'phone' && !okPh(ph)) { toast('Please enter your phone number'); di.nick = nick; di.phone = ph; await new Promise((r) => setTimeout(r, 300)); continue; }
    if (di.type === 'computer' && !comp) { toast("Please enter whose computer this is (e.g. " + nick + "'s computer)"); di.nick = nick; di.phone = ph; await new Promise((r) => setTimeout(r, 300)); continue; }
    const ini = (ASK_FORM.ini || '').trim().toUpperCase(); if (!/^[A-Z]{1,4}$/.test(ini)) { toast('Please enter your initials (letters only)'); di.nick = nick; di.phone = ph; await new Promise((r) => setTimeout(r, 300)); continue; } LSset('bvt-initials', ini);
    { LSset('bvt-nick', nick); LSset('bvt-devtype', di.type); if (di.type === 'computer') LSset('bvt-devmodel', comp); LSset('bvt-devphone', di.type === 'phone' ? ph : ''); LSset('bvt-devname', deviceName()); LSset('bvt-devask82', '1'); D._devDirty = true; Sync.soon(); toast('Hi ' + nick + '!'); updHi(); renderAll(); return; }
  }
}
/* ---------------- nightly backups to Google Drive (kept 30 days) ---------------- */
const Backup = {
  PREFIX: 'bovitech-contacts-backup-',
  day(d = new Date()) { return d.toLocaleDateString('en-CA'); }, // YYYY-MM-DD, local time
  async list() { const q = encodeURIComponent(`name contains '${this.PREFIX}' and trashed=false`); const r = await gfetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,size,createdTime,description)&orderBy=name desc&pageSize=100`); if (!r.ok) throw new Error('Drive error ' + r.status); return (await r.json()).files || []; },
  async make(day) { const fd = new FormData(); fd.append('metadata', new Blob([JSON.stringify({ name: this.PREFIX + day + '.json', mimeType: 'application/json', description: 'Bovitech Contacts backup · app v' + APP_VERSION.split(' ')[0] + ' · ' + D.contacts.length + ' contacts, ' + D.businesses.length + ' businesses, ' + (D.farms || []).length + ' farms' })], { type: 'application/json' })); fd.append('file', new Blob([Sync.serial()], { type: 'application/json' }));
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
/* ---------------- admin page editor: Plan Route, Search & Bulk Edit and Jobs — order, headings, colours, fold / hide ---------------- */
const PE_PAGES = { route: 'Plan Route', search: 'Search & Bulk Edit', jobs: 'Jobs', contacts: 'People list', biz: 'Businesses list', loc: 'Pins list' }; const PE_LIST = new Set(['contacts', 'biz', 'loc']);
const PE_LBL = { search: '🔍 Search bar', chips: '🔘 Type buttons (all / client / non-client)', row2: '🔢 Count, sort and filters' };
function peSecs(pg) { if (PE_LIST.has(pg)) { const tb = $('#list .toolbar'); if (!tb) return []; return [...tb.children].filter((el) => { const k = ['search', 'chips', 'row2'].find((c) => el.classList.contains(c)); if (k) el.dataset.pk = k; return !!k; }); }
  const root = $('#list .d-wrap'); return root ? [...root.children].filter((el) => el.matches('.card, details, #routemap') && peKey(el)) : []; }
const peHead = (el) => el.querySelector(':scope > h3, :scope > summary, :scope > h2') || el.querySelector('h2, h3, summary');
const peKey = (el) => el.dataset.pk || (el.dataset.type ? 't:' + el.dataset.type : '') || ((peHead(el) || {}).textContent || '').replace(/\(.*?\)/g, '').replace(/\d+/g, '').replace(/[^\p{L} &/'-]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 40);
const peCfg = (pg) => ((D.settings.pageEd || {})[pg]) || {};
function peSave(pg, fn) { const all = { ...(D.settings.pageEd || {}) }; const c = JSON.parse(JSON.stringify(all[pg] || {})); fn(c); all[pg] = c; D.settings.pageEd = all; touch(D.settings); }
function peRename(hd, name) { const tw = document.createTreeWalker(hd, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { if (!/\p{L}/u.test(n.nodeValue) || n.parentElement.closest('button,.count,.pebar')) continue; const m = n.nodeValue.match(/^(\s*)(.*?)(\s*[(\d].*)?$/s); n.nodeValue = m[1] + name + (m[3] || ''); return; } }
function applyPageEd(pg) { if (!PE_PAGES[pg]) return; const isL = PE_LIST.has(pg); const root = isL ? $('#list .toolbar') : $('#list .d-wrap'); if (!root) return; const cfg = peCfg(pg); const ed = S.admin && S.pageEd === pg;
  const secs = peSecs(pg); if (!secs.length) return; if (isL) { const ul = $('#list ul.list'); if (ul && cfg.rowSize) ul.style.setProperty('--rowfs', cfg.rowSize + 'px'); if (ul && cfg.rowSize) ul.classList.add('rowfs'); }
  const ord = cfg.order || []; const pos = (el) => { const i = ord.indexOf(peKey(el)); return i < 0 ? 1e6 + secs.indexOf(el) : i; };
  const sorted = secs.slice().sort((a, b) => pos(a) - pos(b)); const ae = document.activeElement, ss = ae && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
  if (sorted.some((el, i) => el !== secs[i])) { const slots = secs.map((el) => { const m = document.createComment('pe'); el.before(m); return m; }); sorted.forEach((el, i) => slots[i].replaceWith(el)); } /* only move things when the order really changed */
  const refocus = () => { if (ae && ae !== document.body && document.contains(ae) && document.activeElement !== ae) { ae.focus(); if (ss) try { ae.setSelectionRange(ss[0], ss[1]); } catch (e) { } } }; setTimeout(refocus, 0); refocus();
  sorted.forEach((el, i) => { const k = peKey(el), hd = peHead(el); const nm = (cfg.names || {})[k], bg = (cfg.bg || {})[k], fg = (cfg.fg || {})[k], sz = (cfg.size || {})[k], mode = (cfg.mode || {})[k] || '';
    if (nm && hd && !isL) peRename(hd, nm); if (bg) el.style.background = bg; if (fg) el.style.color = fg; if (sz && hd) hd.style.fontSize = sz + 'px';
    if (mode === 'hide') { if (ed) el.classList.add('pehidden'); else el.hidden = true; }
    if (mode === 'fold' && !ed) { if (el.tagName === 'DETAILS') { if (!S.peOpen.has(pg + k)) el.open = false; } else { el.classList.add('pefold'); if (S.peOpen.has(pg + k)) el.classList.add('peopen'); if (hd) { hd.classList.add('pefoldh'); hd.dataset.pek = pg + k; } } }
    if (ed) el.insertAdjacentHTML(el.tagName === 'DETAILS' || el.id === 'routemap' || isL ? 'beforebegin' : 'afterbegin', `<div class="pebar"><b>${h(isL ? PE_LBL[k] : nm || (hd ? hd.textContent : k).trim().slice(0, 40))}</b><span class="hint">${mode === 'hide' ? 'Hidden' : mode === 'fold' ? 'Folded' : 'Shown'}</span><span class="edbtns"><button type="button" class="btn small" data-act="pe-mv" data-pg="${pg}" data-k="${h(k)}" data-d="-1" ${i ? '' : 'disabled'}>↑</button><button type="button" class="btn small" data-act="pe-mv" data-pg="${pg}" data-k="${h(k)}" data-d="1" ${i < sorted.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="btn small" data-act="pe-edit" data-pg="${pg}" data-k="${h(k)}">✏️ Edit</button></span></div>`); });
  if (S.admin) { const top = root.querySelector(':scope > h2.sec-h'); const bar = `<div class="pe-top">${ed ? `<button type="button" class="btn small greenbtn" data-act="pe-toggle" data-pg="${pg}">✓ Done editing</button><button type="button" class="btn small" data-act="pe-reset" data-pg="${pg}">↺ Standard layout</button><span class="hint">Use ↑ ↓ to move a section, ✏️ to change its heading, colours, size or whether it shows.</span>` : `<button type="button" class="btn small" data-act="pe-toggle" data-pg="${pg}">🎨 Edit how this page looks</button>`}</div>`; if (top) top.insertAdjacentHTML('afterend', bar); else root.insertAdjacentHTML('afterbegin', bar); if (ed && isL) { const tb = root.querySelector('.pe-top'); tb.insertAdjacentHTML('beforeend', `<button type="button" class="btn small" data-act="pe-rows" data-pg="${pg}">🔠 List text size</button>`); } } }
S.peOpen = new Set();
{ const wrap = (fn, pg) => function () { const r = fn.apply(this, arguments); try { applyPageEd(pg); } catch (e) { console.warn(e); } return r; }; renderContactList = wrap(renderContactList, 'contacts'); renderBizList = wrap(renderBizList, 'biz'); renderLocList = wrap(renderLocList, 'loc'); } /* list pages keep the admin's layout every time they redraw */
document.addEventListener('click', (e) => { const hd = e.target.closest('.pefoldh'); if (!hd || e.target.closest('button,a,input,select,label')) return; const el = hd.closest('.pefold'); if (!el) return; el.classList.toggle('peopen'); el.classList.contains('peopen') ? S.peOpen.add(hd.dataset.pek) : S.peOpen.delete(hd.dataset.pek); });
async function peEditForm(pg, k) { const cfg = peCfg(pg); const isL = PE_LIST.has(pg); const el = peSecs(pg).find((x) => peKey(x) === k); const hd = el && !isL && peHead(el);
  const cur = ((cfg.names || {})[k]) || (hd ? [...hd.childNodes].filter((n) => n.nodeType === 3 || !n.closest || !n.matches('.pebar,button,.count')).map((n) => n.textContent).join('').replace(/\(.*?\)|\d+/g, '').trim() : '');
  const inp = 'style="width:100%;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px"'; const COL = [['', 'Standard'], ...SEC_COLORS.filter((x) => x[0]).map((x) => [x[2], x[1]]), ['#141414', 'Black']];
  const CT = pg === 'biz' ? BTYPES : pg === 'contacts' ? CTYPES : null; const chipBox = isL && k === 'chips' && CT ? `<div class="lbl" style="margin-top:6px">Button names</div>${CT.map(([v, l]) => `<div class="f"><input data-ask="chip_${v}" value="${h(((cfg.chips || {})[v]) || l)}" ${inp}></div>`).join('')}` : '';
  const r = await askBox('Edit section — ' + PE_PAGES[pg], `${isL ? `<div class="hint" style="margin-bottom:6px"><b>${h(PE_LBL[k] || k)}</b></div>${chipBox}` : `<div class="f"><span class="lbl">Heading</span><input data-ask="name" value="${h(cur)}" ${inp}></div>`}
    <div class="grid2"><div class="f"><span class="lbl">Background</span><select data-ask="bg" ${inp}>${COL.map(([v, l]) => `<option value="${v}" ${((cfg.bg || {})[k] || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="f"><span class="lbl">Text colour</span><select data-ask="fg" ${inp}>${[['', 'Standard'], ['#141414', 'Black'], ['#ffffff', 'White'], ['#b3261e', 'Red'], ['#0d5c20', 'Green'], ['#1d4f91', 'Blue'], ['#6b5200', 'Brown']].map(([v, l]) => `<option value="${v}" ${((cfg.fg || {})[k] || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="grid2"><div class="f"><span class="lbl">Heading size</span><select data-ask="size" ${inp}>${[['', 'Standard'], ['14', 'Small'], ['18', 'Medium'], ['22', 'Large'], ['26', 'Extra large']].map(([v, l]) => `<option value="${v}" ${String((cfg.size || {})[k] || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="f"><span class="lbl">Show it</span><select data-ask="mode" ${inp}>${(isL ? [['', 'Always show'], ['hide', 'Hide it']] : [['', 'Always show'], ['fold', 'Folded up (tap the heading to open)'], ['hide', 'Hide it']]).map(([v, l]) => `<option value="${v}" ${((cfg.mode || {})[k] || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="hint">Applies on every device.</div>`, 'Save', false, 'Cancel', 'Back to standard');
  if (!r) return; peSave(pg, (c) => { ['names', 'bg', 'fg', 'size', 'mode'].forEach((x) => { c[x] = c[x] || {}; delete c[x][k]; }); if (CT && k === 'chips') { c.chips = {}; if (r !== 'alt') CT.forEach(([v, l]) => { const t = (ASK_FORM['chip_' + v] || '').trim(); if (t && t !== l) c.chips[v] = t; }); } if (r !== 'alt') { const nm = (ASK_FORM.name || '').trim(); if (nm && nm !== cur) c.names[k] = nm; else if (nm && (cfg.names || {})[k]) c.names[k] = nm; ['bg', 'fg', 'mode'].forEach((x) => { if (ASK_FORM[x]) c[x][k] = ASK_FORM[x]; }); if (ASK_FORM.size) c.size[k] = +ASK_FORM.size; } });
  NEXT_LOG_LABEL = `${PE_PAGES[pg]} page: section changed`; S.skipConfirm = true; await changed(); }
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
  const name = await askBox(cur ? 'Save changes to route' : 'Save route', `<p style="font-weight:600">${h(routeSummary(routeSnapshot()))}</p>${bizSel}<div class="f"><span class="lbl">Route name (required)</span><textarea rows="1" style="width:100%;height:46px;min-height:46px;resize:none;font-size:16px;padding:9px;border:1px solid var(--line);border-radius:9px">${h(cur ? cur.name : '')}</textarea></div>`, cur ? 'Save changes' : 'Save route', false, 'Cancel');
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
  else if (t.id === 'pf-search') { const b = IDX.biz.get(t.dataset.bid); if (b) $('#pf-res').innerHTML = primFindRes(b, t.value); }
  else if (t.id === 'orphan-search') { const pq = parseQuery(t.value); const res = pq.inc.length ? D.businesses.filter((b) => matchQ(b.name.toLowerCase(), pq)).slice(0, 12) : []; $('#orphan-res').innerHTML = t.value.trim() ? `<div class="results">${res.map((b) => `<div data-act="orphan-link" data-fid="${t.dataset.fid}" data-bid="${b.id}"><b>${h(b.name)}</b></div>`).join('') || '<div class="hint">No matching businesses.</div>'}</div>` : ''; }
  else if (t.id === 'e-fuseradd') { const pq = parseQuery(t.value); const box = $('#e-fuserres'); const f0 = SHEET_FARM && SHEET_FARM.f; if (!f0 || !box) return; const have = new Set(Object.keys(SHEET_FARM.users || {}).filter((k) => SHEET_FARM.users[k] !== 'del'));
    const bs = pq.inc.length ? D.businesses.filter((b) => !have.has(b.id) && matchQ(b.name.toLowerCase(), pq)).slice(0, 8) : []; const cs = pq.inc.length ? D.contacts.filter((c) => matchQ(fullName(c).toLowerCase(), pq) && bizOf(c).some((b) => !have.has(b.id))).slice(0, 6) : [];
    box.innerHTML = t.value.trim() ? `<div class="results">${bs.map((b) => `<div data-act="fuser-pick" data-bid="${b.id}"><b>${h(b.name)}</b></div>`).join('')}${cs.flatMap((c) => bizOf(c).filter((b) => !have.has(b.id)).map((b) => `<div data-act="fuser-pick" data-bid="${b.id}">👤 ${h(fullName(c))} <span class="hint">→ ${h(b.name)}</span></div>`)).join('') || '<div class="hint">No match.</div>'}</div>` : ''; }
  else if (t.id === 'own-q') { const pq = parseQuery(t.value); const res = pq.inc.length ? D.businesses.filter((b) => matchQ(b.name.toLowerCase(), pq)).slice(0, 8) : []; const o = $('#own-other'); if (o) o.checked = true; $('#own-res').innerHTML = t.value.trim() ? `<div class="results">${res.map((b) => `<div data-act="own-pick" data-bid="${b.id}" data-name="${h(b.name)}"><b>${h(b.name)}</b></div>`).join('') || '<div class="hint">No match.</div>'}</div>` : ''; }
  else if (t.id === 'farm-mergesearch') { const pq = parseQuery(t.value); const f0 = IDX.farms.get(t.dataset.fid); const box = $('#farm-mergeres'); if (!f0) return;
    const hay = (f) => [f.name, f.address, f.aka, f.yLabel, ...farmUsersOf(f.id).map((u) => u.b.name), farmOwner(f).name].join(' ').toLowerCase();
    const res = pq.inc.length ? D.farms.filter((f) => f !== f0 && farmUsersOf(f.id).length && matchQ(hay(f), pq)).slice(0, 15) : [];
    box.innerHTML = t.value.trim() ? `<div class="results">${res.map((f) => `<div data-act="farm-merge-pick" data-fid="${f0.id}" data-oid="${f.id}">${pinT(f.pinType).emoji} <b>${h(f.name || f.address || 'Farm')}</b> <span class="hint">${h(farmUsersOf(f.id).map((u) => u.b.name).join(', '))}${f.address ? ' · ' + h(f.address) : ''}</span></div>`).join('') || '<div class="hint">No matching farms.</div>'}</div>` : ''; }
  else if (t.id === 'farm-linksearch' || t.id === 'farm-linksearch2') { const pq = parseQuery(t.value); const b = IDX.biz.get(t.dataset.bid); const two = t.id === 'farm-linksearch2'; const box = $(two ? '#farm-linkres2' : '#farm-linkres'); if (!b) return;
    const hay = (f) => [f.name, f.address, f.aka, ...farmUsersOf(f.id).map((u) => u.b.name), farmOwner(f).name].join(' ').toLowerCase();
    const res = pq.inc.length ? D.farms.filter((f) => !b.farmLinks.some((l) => l.fid === f.id) && matchQ(hay(f), pq)).slice(0, 12) : [];
    box.innerHTML = t.value.trim() ? `<div class="results">${res.map((f) => `<div data-act="farm-link-pick" data-bid="${b.id}" data-fid="${f.id}" ${two ? 'data-close="1"' : ''}>${pinT(f.pinType).emoji} <b>${h(f.name || f.address || 'Farm')}</b> <span class="hint">${h(farmUsersOf(f.id).map((u) => u.b.name).join(', ') || 'not linked')}${f.address ? ' · ' + h(f.address) : ''}</span></div>`).join('') || '<div class="hint">No matching farms.</div>'}</div>` : ''; }
  else if (t.id === 'mg-search') { const isC = t.dataset.kind === 'contact'; const pq = parseQuery(t.value); const box = $('#mg-res');
    const res = !pq.inc.length ? [] : isC ? D.contacts.filter((c) => c.id !== t.dataset.id && matchQ([fullName(c), ...c.mobiles.map((p) => p.value.replace(/\D/g, '')), ...c.landlines.map((p) => p.value.replace(/\D/g, '')), ...bizOf(c).map((b) => b.name)].join(' ').toLowerCase(), pq)).slice(0, 12) : D.businesses.filter((b) => b.id !== t.dataset.id && matchQ(bizHay(b), pq)).slice(0, 12);
    box.innerHTML = t.value.trim() ? `<div class="results">${res.map((r) => `<div data-act="mg-pick" data-kind="${t.dataset.kind}" data-a="${t.dataset.id}" data-b="${r.id}"><b>${h(isC ? fullName(r) : r.name)}</b> <span class="hint">${h(isC ? (bizOf(r).map((b) => b.name).join(', ') || (r.mobiles[0] || r.landlines[0] || {}).value || '') : ((IDX.bizContacts.get(r.id) || []).map((c) => c.first).join(', ') + ' · ' + r.farms.length + ' farms'))}</span></div>`).join('') || '<div class="hint">No matches.</div>'}</div>` : ''; }
  else if (t.id === 'biz-linksearch' || t.id === 'biz-linksearch-past') {
    const past = t.id === 'biz-linksearch-past'; const pq = parseQuery(t.value); const bid = t.dataset.bid; const box = $(past ? '#biz-linkres-past' : '#biz-linkres');
    const res = pq.inc.length ? D.contacts.filter((c) => !c.links.some((l) => l.bid === bid) && matchQ([fullName(c), ...c.mobiles.map((p) => p.value.replace(/\D/g, '')), ...bizOf(c).map((b) => b.name)].join(' ').toLowerCase(), pq)).slice(0, 10) : [];
    box.innerHTML = t.value.trim() ? `<div class="results">${res.map((c) => `<div data-act="${past ? 'link-pick-past' : 'biz-link-pick'}" data-cid="${c.id}" data-bid="${bid}"><b>${h(fullName(c))}</b> <span class="hint">${h(bizOf(c).map((b) => b.name).join(', ') || (c.mobiles[0] || {}).value || '')}</span></div>`).join('')}${/\d{4}|@/.test(t.value) ? '' : `<div data-act="biz-add-nameonly" data-bid="${bid}" data-past="${past ? 1 : ''}" style="color:var(--green)">➕ Add “<b>${h(t.value.trim())}</b>” — name only (no contact details)</div>`}</div>` : '';
  }
  else if (t.id === 'bq') { S.bq = t.value; clearTimeout(t._tm); t._tm = setTimeout(renderBizList, 120); }
  else if (t.classList.contains('kn-ep-q')) { const w = t.dataset.w; const box = $('#kn-ep-res-' + w); if (!box) return; const res = farmSearch(t.value, 8);
    box.innerHTML = t.value.trim() ? `<div class="results">${res.map((f) => `<div data-act="kn-ep-pick" data-w="${w}" data-fid="${f.id}"><b>${h(farmLabel(f))}</b><div class="hint">${h(f.address || '')}</div></div>`).join('') || '<div class="hint">No farms with GPS match.</div>'}</div>` : ''; }
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
      const keepSync = D.sync; D = js; D.sync = keepSync || {}; D.deleted = D.deleted || []; D.conflicts = []; D.dismissed = D.dismissed || {}; D.firstRun = false; D.importedAt = D.importedAt || new Date().toLocaleDateString('en-AU'); D.routes = D.routes || []; D.farms = D.farms || [];
      [...D.contacts, ...D.businesses, ...D.tags, ...D.routes, D.settings].forEach((r) => (r._dirty = true));
      reindex(); migrate(); baseline(); changed(); toast('Data loaded'); Sync.soon(); } catch (err) { toast('Could not restore: ' + err.message); }
  }
});
function net() { const n = $('#net'); n.textContent = navigator.onLine ? 'Online' : 'Offline'; n.className = 'pill' + (navigator.onLine ? '' : ' off'); }
window.addEventListener('online', net); window.addEventListener('offline', net);
window.addEventListener('popstate', () => {
  if (NAV.ignorePop) { NAV.ignorePop--; if (!NAV.ignorePop) flushPush(); return; }
  if (CONFIRM) { closeAsk(false, true); return; } // phone Back closes a confirm pop-up first
  if (SHEET) { leaveSheet(true); return; } // back closes an open edit screen first (asks if there are unsaved changes)
  navRestore();
});
document.addEventListener('scroll', (e) => { if (!NAV.last) return; if (e.target.id === 'list') NAV.last.scroll = e.target.scrollTop; if (e.target.id === 'detail') NAV.last.dscroll = e.target.scrollTop; }, true);
try { history.replaceState({ bvt: 0 }, ''); } catch (e) { }
window.addEventListener('beforeunload', (e) => { if (sheetDirty()) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (CONFIRM) closeAsk(false); else if (SHEET) leaveSheet(); } });

/* ---------------- start ---------------- */
let STALE_OPEN = false;
async function staleCheck() { /* a device that hasn't synced for over a day must sync before anyone keeps working on it (old copies cause clashes) */
  if (window.SEED || STALE_OPEN || !navigator.onLine || !Sync.enabled()) return; const last = D.sync.last || 0; if (Date.now() - last < 24 * 3600 * 1000) return; STALE_OPEN = true;
  const ov = document.createElement('div'); ov.className = 'staleov'; document.body.appendChild(ov);
  const draw = (msg, busy) => { ov.innerHTML = `<div class="stalebox"><h2>⚠ This device needs to sync</h2><p>It last synced ${last ? '<b>' + new Date(last).toLocaleString('en-AU') + '</b>' : '<b>never</b>'}. Its copy may be out of date, which can undo other people's changes — so it has to get the latest copy before you carry on.</p>${msg ? `<p style="color:var(--red-ink)">${h(msg)}</p>` : ''}<div class="actions"><button class="btn primary" data-act="stale-sync" ${busy ? 'disabled' : ''}>${busy ? 'Syncing…' : '⟳ Sync now'}</button><button class="btn" data-act="stale-admin">Admin: skip</button></div><div class="hint">No internet? It'll ask again when you're back online.</div></div>`; };
  const go = async (ia) => { draw('', true); try { await Sync.run(!!ia); } catch (e) { } if ((D.sync.last || 0) > last && Date.now() - (D.sync.last || 0) < 120000) { ov.remove(); STALE_OPEN = false; toast('✓ Up to date'); renderAll(); } else draw(Sync.msg || (Sync.state === 'signin' ? 'Please sign in to Google (the practice account) to sync.' : "Couldn't sync — check the internet and try again."), false); };
  ov.addEventListener('click', async (e) => { const b = e.target.closest('[data-act]'); if (!b) return; if (b.dataset.act === 'stale-sync') go(true); if (b.dataset.act === 'stale-admin') { const r = await askBox('Admin', '<div class="f"><span class="lbl">Admin PIN</span><input data-ask="pin" type="password" inputmode="numeric" style="width:100%;font-size:18px;padding:9px;border:1px solid var(--line);border-radius:9px"></div>', 'Skip for now', false, 'Cancel'); if (r && (await pinHash((ASK_FORM.pin || '').trim())) === (D.settings.adminHash || ADMIN_HASH)) { ov.remove(); STALE_OPEN = false; } else if (r) toast('Wrong PIN'); } });
  window.addEventListener('online', () => { if (STALE_OPEN) go(); }); draw('', false); go(); }
(async function init() {
  D = await Store.get('data');
  if (!D) { D = await loadSeed(); D.dismissed = D.dismissed || {}; await Store.set('data', D); }
  D.sync = D.sync || {}; D.deleted = D.deleted || []; D.conflicts = D.conflicts || []; D.trash = D.trash || []; D.routes = D.routes || []; D.farms = D.farms || [];
  reindex(); baseline(); if (!(Sync.enabled() && navigator.onLine)) { try { migrate(); } catch (err) { console.error('migrate', err); } logChanges('Automatic update'); save(); } // when online, one-time updates wait until this device has the latest data
  if (PREF.tab) S.tab = PREF.tab === 'map' ? 'route' : PREF.tab; if (PREF.sort) S.sort = PREF.sort; if (PREF.bsort) S.bsort = PREF.bsort; if (PREF.ptype) S.ptype = PREF.ptype; if (PREF.btype) S.btype = PREF.btype;
  applyUi(); reindex(); net(); renderAll();
  updHi(); detectDevice(); window.APP_READY = true; if (window.hideSplash) window.hideSplash();
  Sync.start(); Backup.schedule(); setTimeout(askDeviceName, 600); setTimeout(staleCheck, 2500); setInterval(staleCheck, 30 * 60 * 1000);
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
