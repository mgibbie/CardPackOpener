// poketactica_gauge_test.mjs — the Bonus Gauge's ITEMS and CARD PACKS are paid (poketactica/js/gauge.js, server/ptgauge.mjs).
// Before, progress.js listed them as `owed` and the results screen said they would "arrive with the next update": a won
// battle paid nothing for them. Now each goes into the game that owns it:
//   1. items wait on the device and the overworld's own boot puts them in its Bag, exactly once (a second boot pays nothing);
//      an id the Bag does not know is skipped
//   2. Pocket packs go into Pocket Enhanced's device collection (its sync adds them to the account)
//   3. Battlecards packs: the REAL server (server/mp.mjs over an in-memory D1) pays them into the pack inbox, once per battle
//      seed, at most PACKS_PER_DAY a day, never past the inbox cap; the device note is crossed off only on a final answer
//      (a guest's, or an unanswered one, waits and is asked again)
//   4. the page: applyBattle pays them, the results screen says where they went, the overworld drains the queue at boot
//   node overworld/tests/poketactica_gauge_test.mjs (needs esbuild, so it lives in the overworld gate)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import * as G from '../../poketactica/js/gauge.js';
import { PACKS_PER_DAY } from '../../server/ptgauge.mjs';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); } };
const mkLS = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const realNow = Date.now;

try {
	// ---------- 1. items: the device queue, drained by the overworld into its Bag once
	{
		const BAG = { ITEMS: { potion: {}, rarecandy: {}, nugget: {} }, b: { potion: 2 }, addItem(id, n) { this.b[id] = (this.b[id] || 0) + n; } };
		const LS = mkLS();
		const s = G.sortOwed([{ kind: 'item', tier: 'common' }, { kind: 'item', tier: 'rare' }, { kind: 'pack', game: 'pocket' }, { kind: 'pack', game: 'battlecards' }, { kind: 'pack', game: 'battlecards' }, { kind: 'stars', n: 5 }], seq(0, 0.99));
		A(s.items.length === 2 && G.ITEM_TIERS.common.includes(s.items[0]) && G.ITEM_TIERS.rare.includes(s.items[1]) && s.pocket === 1 && s.battlecards === 2, 'the owed list sorts into items (from their tier), Pocket packs and Battlecards packs', s);
		for (const t of Object.keys(G.ITEM_TIERS)) for (const id of G.ITEM_TIERS[t]) A(!!G.ITEM_NAMES[id], `${t} item ${id} has a name for the results screen`);
		G.queueItems(['potion', 'potion', 'rarecandy'], LS); G.queueItems(['nugget', 'notanitem'], LS);
		const got = G.drainItems(BAG, LS);
		A(BAG.b.potion === 4 && BAG.b.rarecandy === 1 && BAG.b.nugget === 1 && !BAG.b.notanitem, 'the overworld puts the queued items in its Bag (an unknown id skipped)', BAG.b);
		A(got.length === 3 && LS.getItem(G.ITEMS_KEY) == null, 'the queue is gone once drained', got);
		A(G.drainItems(BAG, LS).length === 0 && BAG.b.potion === 4, 'a second boot pays nothing twice');
	}
	// every tier's item is one the real Bag knows
	{
		const bagSrc = fs.readFileSync(path.join(ROOT, 'overworld/bag.js'), 'utf8');
		for (const id of new Set(Object.values(G.ITEM_TIERS).flat())) A(new RegExp('^\\t' + id + ':\\s*\\{', 'm').test(bagSrc), `the overworld Bag knows ${id}`);
	}
	// ---------- 2. Pocket packs into Pocket's device collection
	{
		let col = { v: 1, prints: {}, packs: 3, points: 0, opened: 0 };
		const SV = { collection: () => col, setCollection: c => { col = c; } };
		A(await G.givePocketPacks(2, SV) === 2 && col.packs === 5, 'two Pocket packs join the device collection', col);
		col.packs = 998; A(await G.givePocketPacks(3, SV) === 1 && col.packs === 999, "never past Pocket's pack cap");
	}

	// ---------- 3. Battlecards packs: the real server
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
	const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
	const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-ptgauge-')), 'mp.bundle.mjs');
	buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
	const { default: handler } = await import(pathToFileURL(bundle).href);
	let ipN = 0;
	const api = async (action, body = {}, token) => {
		const res = await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB });
		return { status: res.status, ...(await res.json()) };
	};
	const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
	const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v), Date.now());
	const T = (await api('register', { username: 'gaugeann', password: 'gauge-pass-1' })).token;
	const inbox = () => row('gaugeann').packInbox || 0;
	const call = (a, b) => api(a, b, T);

	const i0 = inbox();
	const r1 = await call('ptgauge-claim', { seed: 'training-aaa1', n: 2 });
	A(r1.done && r1.packs === 2 && inbox() === i0 + 2, "a won battle's two Battlecards packs land in the pack inbox", r1);
	const r2 = await call('ptgauge-claim', { seed: 'training-aaa1', n: 2 });
	A(r2.done && r2.already && r2.packs === 0 && inbox() === i0 + 2, 'the same battle asked again pays nothing (a retry, or a replayed request)', r2);
	const r3 = await call('ptgauge-claim', { seed: 'training-aaa2', n: 3 });
	A(r3.done && r3.packs === PACKS_PER_DAY - 2 && r3.capped === 'day' && inbox() === i0 + PACKS_PER_DAY, `at most ${PACKS_PER_DAY} a day: the rest is refused, and says so`, r3);
	const r4 = await call('ptgauge-claim', { seed: 'training-aaa3', n: 1 });
	A(r4.done && r4.packs === 0 && r4.capped === 'day', 'a new battle the same day pays nothing more', r4);
	const bad1 = await call('ptgauge-claim', { seed: 'x', n: 1 }), bad2 = await call('ptgauge-claim', { seed: 'training-zz', n: 0 });
	A(bad1.error && !bad1.done && bad2.error && !bad2.done, 'a bad seed or count is refused, not done', [bad1, bad2]);
	const guest = await api('ptgauge-claim', { seed: 'training-guest', n: 1 });
	A(!guest.done && !(guest.packs > 0), 'a guest is not paid (and not done: their note waits)', guest);
	// the next UTC day: the limit is back; the inbox cap still holds
	try {
		Date.now = () => realNow() + 86_400_000;
		{ const u = row('gaugeann'); u.packInbox = 119; u.packTimerBase = Date.now(); setRow('gaugeann', u); }   // (the timer's own packs held off)
		const r5 = await call('ptgauge-claim', { seed: 'training-bbb1', n: 3 });
		A(r5.done && r5.packs === 1 && r5.capped === 'inbox' && inbox() === 120, 'the next day pays again, but never past the pack inbox cap', r5);
		{ const u = row('gaugeann'); u.packInbox = 0; setRow('gaugeann', u); }
	} finally { Date.now = realNow; }
	A((row('gaugeann').ptg.seeds || []).includes('training-aaa1'), 'the paid seeds are kept on the account');

	// the device's note: written before asking, crossed off only on a final answer
	{
		const LS = mkLS();
		G.noteBattlecards('training-ccc1', 1, LS);
		const off = await G.claimBattlecards(async () => { throw new Error('offline'); }, LS);
		A(off.packs === 0 && JSON.parse(LS.getItem(G.BC_KEY))['training-ccc1'] === 1, 'no answer: the claim stays noted');
		await G.claimBattlecards(async () => ({ error: 'not logged in' }), LS);
		A(JSON.parse(LS.getItem(G.BC_KEY))['training-ccc1'] === 1, 'not signed in: the claim stays noted');
		Date.now = () => realNow() + 2 * 86_400_000;
		try { const ok = await G.claimBattlecards(call, LS); A(ok.packs === 1 && !JSON.parse(LS.getItem(G.BC_KEY))['training-ccc1'], 'signed in: it is paid by the real server and crossed off', ok); } finally { Date.now = realNow; }
	}
	// the whole payout, as applyBattle runs it
	{
		const LS = mkLS(); let col = { v: 1, prints: {}, packs: 0, points: 0, opened: 0 };
		let p;
		Date.now = () => realNow() + 3 * 86_400_000;
		try { p = await G.payOwed({ owed: [{ kind: 'item', tier: 'uncommon' }, { kind: 'pack', game: 'pocket' }, { kind: 'pack', game: 'battlecards' }], seed: 'training-ddd1', rng: seq(0.5), call, signedIn: true, LS, sv: { collection: () => col, setCollection: c => { col = c; } } }); } finally { Date.now = realNow; }
		A(p.items.length === 1 && JSON.parse(LS.getItem(G.ITEMS_KEY))[0].id === p.items[0], 'payOwed: the item waits for the overworld', p);
		A(p.pocket === 1 && col.packs === 1, "payOwed: the Pocket pack is in Pocket's collection");
		A(p.battlecards.paid === 1 && !p.battlecards.pending, 'payOwed: the Battlecards pack is paid', p.battlecards);
		const g = await G.payOwed({ owed: [{ kind: 'pack', game: 'battlecards' }], seed: 'training-eee1', rng: seq(0), call, signedIn: false, LS: mkLS() });
		A(g.battlecards.pending && g.battlecards.paid === 0, 'payOwed for a guest: the Battlecards pack waits for sign-in', g.battlecards);
	}

	// ---------- 4. the pages
	const main = fs.readFileSync(path.join(ROOT, 'poketactica/js/main.js'), 'utf8');
	A(!/arrive with the next update/.test(main), 'the results screen no longer says they arrive with the next update');
	{ const i = main.indexOf('function applyBattle()'), body = main.slice(i, main.indexOf('\n}', i)); A(i > 0 && /payOwed\(/.test(body), 'applyBattle pays the owed rewards'); }
	A(/claimBattlecards\(/.test(main.slice(main.indexOf('async function boot('))), 'boot asks again for an unanswered Battlecards claim');
	const ow = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	const iH = ow.indexOf('await hydrateOw()'), iD = ow.indexOf('G.drainItems(Bag)');
	A(iH > 0 && iD > iH, "the overworld drains the queue into its Bag after its save is pulled from the server", { iH, iD });
} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); } finally { Date.now = realNow; }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
