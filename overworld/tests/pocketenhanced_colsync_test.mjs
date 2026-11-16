// Pocket Enhanced: the collection on the account. The page's sync (pocketenhanced/js/colsync.js) against the real
// server handler (server/pocket_collection.mjs) over an in-memory row store, with several pretend devices.
//   1. the server: needs an account; keeps what it is sent, read defensively; an older copy never overwrites a newer one
//   2. a guest syncs nothing; a signed-in device's collection goes to the account; a second device gets the same cards
//   3. two devices that both opened packs: both count (neither overwrites the other)
//   4. a device that played as a guest and then signs in adds what it pulled, without a second new-player grant
//   5. a lost answer, a write that never arrived, a write beaten by another device: nothing counted twice or dropped
//   node overworld/tests/pocketenhanced_colsync_test.mjs
import * as C from '../../pocketenhanced/js/collection.js';
import { createSync, SYNC_KEY } from '../../pocketenhanced/js/colsync.js';
import { handlePkcol } from '../../server/pocket_collection.mjs';

let pass = 0, fail = 0;
const A = (ok, msg, extra) => { if (ok) { pass++; console.log('ok  - ' + msg); } else { fail++; console.log('FAIL: ' + msg, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600)); } };
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const total = c => Object.values(c.prints).reduce((a, b) => a + b, 0);

// ---- the server's rows (the store's two calls the handler uses, as server/mp.mjs implements them)
const rows = new Map();
const store = {
	get: async k => (rows.has(k) ? JSON.parse(rows.get(k)) : null),
	setIfRev: async (k, v, expect) => { const cur = rows.has(k) ? JSON.parse(rows.get(k)) : null; if (((cur && cur.rev) || 0) !== expect) return false; rows.set(k, JSON.stringify(v)); return true; },
};
const server = (username, action, body = {}) => handlePkcol({ action, body, store, username, json: (o, status) => ({ ...o, status: status || 200 }), now: 1 });
const account = u => { const r = rows.get('pkcol:' + u); return r ? JSON.parse(r).col : null; };

/** A pretend device: its own storage, its own copy of the collection, signed in as `user` (null = a guest). */
function device(user, start) {
	const mem = new Map(), d = { col: start || C.newCollection(), user, hook: null, calls: 0, statuses: [] };
	d.storage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); } };
	d.sync = createSync({ storage: d.storage, delay: 0, user: () => d.user, getLocal: () => d.col, setLocal: c => { d.col = c; }, onStatus: s => d.statuses.push(s),
		call: async (action, body) => { d.calls++; if (d.hook) { const h = await d.hook(action, body); if (h !== undefined) return h; } return server(d.user, action, JSON.parse(JSON.stringify(body))); } });
	d.open = (n, seed) => { const r = rng(seed); for (let i = 0; i < n; i++) d.col = C.openPack(d.col, 'CMP'[i % 3], r).col; };
	return d;
}

// ===== 1. the server =====
A((await server(null, 'pkcol-get')).status === 401 && (await server(null, 'pkcol-put', { col: C.newCollection(), rev: 0 })).status === 401, 'the collection on the account needs an account');
A((await server('zed', 'pkcol-get')).col === null && (await server('zed', 'pkcol-get')).rev === 0, 'an account with no collection yet says so');
A((await server('zed', 'pkcol-put', { col: { nope: 1 }, rev: 0 })).status === 400 && account('zed') === null, 'something that is not a collection is refused, and nothing is written');
const z1 = await server('zed', 'pkcol-put', { col: { ...C.newCollection(), prints: { 'A1-001': 2, bogus: 9, 'A1-002': -3 } }, rev: 0, id: 'abcdef01' });
A(z1.ok && z1.rev === 1 && JSON.stringify(account('zed').prints) === '{"A1-001":2}', 'a collection is kept, read defensively (an unknown card and a bad count are dropped)', account('zed'));
const z2 = await server('zed', 'pkcol-put', { col: C.newCollection(), rev: 0 });
A(z2.stale && z2.rev === 1 && z2.col.prints['A1-001'] === 2 && account('zed').prints['A1-001'] === 2, 'a device working from an older copy does not overwrite: it is handed the current one');
A((await server('zed', 'pkcol-get')).ids.join() === 'abcdef01' && account('other') === null, 'a write is remembered by its id, and one account never touches another');

// ===== 2. a guest; the first device; a second device =====
const guest = device(null); guest.open(2, 1);
await guest.sync.now();
A(guest.calls === 0 && guest.sync.status() === 'guest' && guest.col.opened === 2, 'a guest syncs nothing: the collection stays on the device');
const a = device('ann'); a.open(4, 2);
await a.sync.now();
A(a.sync.status() === 'saved' && C.sameCollection(account('ann'), a.col) && a.col.opened === 4 && a.col.packs === 6, "ann's collection goes to her account", account('ann'));
const b = device('ann');
await b.sync.now();
A(C.sameCollection(b.col, a.col) && b.col.packs === 6 && C.owned(b.col, 'P-A-005') === 2 && C.sameCollection(account('ann'), a.col), 'a second device she signs in on gets the same cards: no second helping of packs or starter Trainers', b.col);
const quiet = b.calls; await b.sync.now();
A(b.calls === quiet + 1 && C.sameCollection(account('ann'), a.col), 'a sync with nothing new only reads');

// ===== 3. both devices open packs =====
const before = total(a.col);
a.open(2, 3); b.open(3, 4);
await a.sync.now(); await b.sync.now(); await a.sync.now();
A(C.sameCollection(a.col, b.col) && C.sameCollection(a.col, account('ann')), 'after both sync, the two devices and the account agree');
A(a.col.opened === 9 && a.col.packs === 1 && a.col.points === 45 && total(a.col) === before + 25, 'packs opened on two devices all count: 9 opened, 25 more cards, 1 pack left', { opened: a.col.opened, packs: a.col.packs, points: a.col.points, n: total(a.col) });
b.col = C.addPacks(b.col, 2); a.col = C.exchange({ ...a.col }, 'A1-001');
await b.sync.now(); await a.sync.now(); await b.sync.now();
A(a.col.packs === 3 && a.col.points === 10 && C.sameCollection(a.col, b.col) && C.sameCollection(a.col, account('ann')), 'packs earned on one device and pack points spent on the other both hold', { packs: a.col.packs, points: a.col.points });

// ===== 4. played as a guest, then signs in =====
const late = device(null); late.open(10, 5); late.col = C.addPacks(late.col, 4); late.open(1, 6);   // used its 10, earned 4, opened 1 of them
const lateCards = total(late.col) - 14, annBefore = account('ann');
late.user = 'ann';
await late.sync.now();
A(total(account('ann')) === total(annBefore) + lateCards && account('ann').opened === annBefore.opened + 11, 'a device that played as a guest adds what it pulled to the account', { was: total(annBefore), now: total(account('ann')), lateCards });
A(account('ann').packs === annBefore.packs && C.owned(account('ann'), 'P-A-005') === 2, 'its new-player packs and starter Trainers are not given a second time (it had 3 packs left of 14: none beyond its starting 10)', account('ann').packs);
const rich = device(null); rich.col = C.addPacks(rich.col, 5); rich.user = 'ann'; const p0 = account('ann').packs;
await rich.sync.now();
A(account('ann').packs === p0 + 5, 'packs a guest earned beyond the starting 10 do come along');
await late.sync.now(); const again = account('ann'); await late.sync.now();
A(C.sameCollection(again, account('ann')) && C.sameCollection(late.col, again), 'linking happens once: syncing again adds nothing');

// ===== 5. things going wrong =====
// (a) the write lands, the answer is lost (the page closed)
const c = device('cat'); c.open(1, 7); await c.sync.now();
c.open(2, 8); const want = c.col;
c.hook = async (action, body) => { if (action !== 'pkcol-put') return undefined; await server('cat', action, JSON.parse(JSON.stringify(body))); throw new Error('connection lost'); };
await c.sync.now();
A(c.sync.status() === 'offline' && C.sameCollection(account('cat'), want), 'the write landed on the account but the device never heard');
c.hook = null; await c.sync.now();
A(c.sync.status() === 'saved' && C.sameCollection(account('cat'), want) && C.sameCollection(c.col, want), 'next time the device asks whether it landed: nothing is counted twice', { acct: total(account('cat')), want: total(want) });
// (b) the write never arrives
c.open(1, 9); const want2 = c.col;
c.hook = async action => { if (action === 'pkcol-put') throw new Error('offline'); return undefined; };
await c.sync.now();
A(c.sync.status() === 'offline' && !C.sameCollection(account('cat'), want2) && C.sameCollection(c.col, want2), 'offline: the device keeps its cards and the account is unchanged');
c.hook = null; await c.sync.now();
A(C.sameCollection(account('cat'), want2), 'back online, the difference is sent once');
// (c) no connection at all
c.hook = async () => null; c.col = C.addPacks(c.col, 1); await c.sync.now();
A(c.sync.status() === 'offline', 'no connection is reported as offline, not as saved');
c.hook = null; await c.sync.now();
// (d) another device writes between this one's read and its write
const c2 = device('cat'); await c2.sync.now();
c.open(1, 10); c2.open(1, 11);
let raced = false;
c.hook = async action => { if (action === 'pkcol-put' && !raced) { raced = true; c.hook = null; await c2.sync.now(); } return undefined; };
const openedBefore = account('cat').opened;
await c.sync.now(); await c2.sync.now();
A(raced && account('cat').opened === openedBefore + 2 && C.sameCollection(c.col, account('cat')) && C.sameCollection(c2.col, account('cat')), 'a write beaten by another device is merged and sent again: both packs count');
// (e) something done on the device while its write was out stays
const e = device('eve'); await e.sync.now();
e.open(1, 12);
e.hook = async action => { if (action === 'pkcol-put') { e.hook = null; e.col = C.addPacks(e.col, 3); } return undefined; };
await e.sync.now();
A(e.col.packs === 12 && account('eve').packs === 12 && C.sameCollection(e.col, account('eve')), 'packs earned while a save was in flight are kept and saved next');
// (f) the device's own note of the last agreed copy is unreadable
e.storage.setItem(SYNC_KEY, '{broken');
const eb = account('eve'); await e.sync.now();
A(C.sameCollection(account('eve'), eb), 'a device that lost its note of the agreed copy, but holds the same cards as the account, adds nothing', { was: total(eb), now: total(account('eve')) });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
