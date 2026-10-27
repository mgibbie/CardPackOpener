// micatro_progress_server_test.mjs — the Micatro Nuzlocke / Monotype record on the account backend
// (server/mp.mjs, the REAL handler bundled like the dev server, over an in-memory sqlite D1 stub):
//   1. micatro-progress-get / -put need an account; put validates the shape + caps the size; it MERGES
//      (counts: max, types + achievements: union, earliest time kept) so a record never goes backwards,
//      writes exactly `micatro_progress:<user>` (durable: not in the GC table), rate-limited
//   2. run-score (micatro / micatro_modded) accepts a small client-reported `badges` field
//      ({nuz:true, mono:'fire'}), validates its shape, keeps it on a WON run's board row, and the
//      leaderboard returns it; replay meta keeps it too (allow-listed)
//   3. the client's merge (micatro/js/ui/progress.js mergeProgress) agrees with the server's
//   4. the per-type record (monoStake / bothMono / bothStake): stored and max-merged like the rest, so an older client
//      (which never sends them) or a stale device can't lower them; shape-checked; a record from before them is
//      backfilled at READ time from the player's own won replays' badges (never written by the get); the client's
//      recordRunWin records them and typeRecord picks the Record screen's sticker (Arceus / Ambipom / none)
//   5. Golden Purist / Elite Nuzlocke / Elite Purist: an Elite win records level 9 (the win event's sticker_level, like the
//      win stickers), a qualifying record unlocks them retroactively (on load + on sync), the server keeps the new ids
//   node overworld/tests/micatro_progress_server_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';

// the server's random GC sweep (server/mp.mjs gcRate) stays off: its `gc:last` stamp would land in this suite's write checks
process.env.MP_GC_RATE = '0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const writes = [];
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { if (/^\s*INSERT/i.test(sql)) writes.push(String(bound[0])); return stmt.run(...bound); },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };

const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-micatro-progress-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);

let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.1.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const tokens = {};
const reg = async (name) => { const r = (await raw('register', { username: name, password: 'micatro-pass-1' })).body; tokens[name] = r.token; return r.token; };

try {
	for (const n of ['nuzzy', 'rival']) await reg(n);
	A(tokens.nuzzy && tokens.rival, 'test accounts register');

	// ===== 0. the GC sweep is the test's to switch (CI 2026-10-27: the random ~10% sweep stamped gc:last inside the
	// exact-writes check below). Off: 60 requests never sweep. Forced on: the next request does. (Before gcRate the
	// sweep ignored MP_GC_RATE: 60 requests at 10% stamp gc:last ~99.8% of the time.)
	for (let i = 0; i < 60; i++) await raw('state', {}, tokens.rival);
	A(row('gc:last') === null, 'MP_GC_RATE=0: 60 signed-in requests never run the GC sweep (no gc:last)', JSON.stringify(row('gc:last')));
	process.env.MP_GC_RATE = '1';
	await raw('state', {}, tokens.rival);
	A(typeof row('gc:last') === 'number', 'MP_GC_RATE=1: the next signed-in request sweeps (stamps gc:last)', JSON.stringify(row('gc:last')));
	process.env.MP_GC_RATE = '0';

	// ===== 1. progress get / put =====
	A((await raw('micatro-progress-get', {})).status === 401, 'progress-get needs an account');
	A((await raw('micatro-progress-put', { progress: { nuz: 1 } })).status === 401, 'progress-put needs an account');
	const g0 = await raw('micatro-progress-get', {}, tokens.nuzzy);
	A(g0.status === 200 && g0.body.progress && g0.body.progress.nuz === 0 && JSON.stringify(g0.body.progress.mono) === '{}' && JSON.stringify(g0.body.progress.ach) === '{}', 'a new account reads an empty record', JSON.stringify(g0.body));

	let w0 = writes.length;
	const p1 = await raw('micatro-progress-put', { progress: { v: 1, nuz: 2, nuzStake: 3, both: 1, mono: { fire: 1 }, ach: { first_nuzlocke: 1000, first_monotype: 2000 } } }, tokens.nuzzy);
	A(p1.status === 200 && p1.body.ok && p1.body.progress.nuz === 2 && p1.body.progress.mono.fire === 1, 'a put stores the record and returns it', JSON.stringify(p1.body));
	A(JSON.stringify(writes.slice(w0).filter((k) => !k.startsWith('rl:'))) === JSON.stringify(['micatro_progress:nuzzy']), 'the put writes exactly micatro_progress:<user>', JSON.stringify(writes.slice(w0)));
	const r1 = row('micatro_progress:nuzzy');
	A(r1 && r1.rev === 1 && r1.progress.ach.first_nuzlocke === 1000 && typeof r1.updated_at === 'number', 'the row is {rev, progress, updated_at}', JSON.stringify(r1));

	// merge: never backwards
	const p2 = await raw('micatro-progress-put', { progress: { nuz: 1, nuzStake: 1, both: 0, mono: { water: 2 }, ach: { first_nuzlocke: 5000, nuzlocke_monotype: 3000 } } }, tokens.nuzzy);
	const m2 = p2.body.progress;
	A(p2.status === 200 && m2.nuz === 2 && m2.nuzStake === 3 && m2.both === 1, 'lower counts never lower the record (max)', JSON.stringify(m2));
	A(m2.mono.fire === 1 && m2.mono.water === 2, 'Monotype types are a union (per-type max)', JSON.stringify(m2.mono));
	A(m2.ach.first_nuzlocke === 1000 && m2.ach.first_monotype === 2000 && m2.ach.nuzlocke_monotype === 3000, 'achievements are a union, keeping the earliest unlock time', JSON.stringify(m2.ach));
	const p3 = await raw('micatro-progress-put', { progress: {} }, tokens.nuzzy);
	A(p3.status === 200 && p3.body.progress.nuz === 2 && p3.body.progress.ach.first_monotype === 2000, 'an empty put changes nothing (nothing can be wiped)', JSON.stringify(p3.body));
	A(p3.body.wrote === false, '... and writes no row');
	const g1 = await raw('micatro-progress-get', {}, tokens.nuzzy);
	A(JSON.stringify(g1.body.progress) === JSON.stringify(m2), 'get returns the merged record', JSON.stringify(g1.body));
	A((await raw('micatro-progress-get', {}, tokens.rival)).body.progress.nuz === 0, "another player's record is separate");

	// validation
	const bad = [
		['not an object', 'x'], ['an array', [1]], ['a negative count', { nuz: -1 }], ['a fractional count', { nuz: 1.5 }],
		['a string count', { both: '3' }], ['an unknown type', { mono: { bird: 1 } }], ['a capitalised type', { mono: { Fire: 1 } }],
		['mono as a list', { mono: ['fire'] }], ['a bad achievement id', { ach: { 'Bad Id!': 1 } }], ['an achievement without a time', { ach: { first_nuzlocke: true } }],
		['too many achievements', { ach: Object.fromEntries(Array.from({ length: 65 }, (_, i) => ['a' + i, 1])) }], ['a huge stake', { nuzStake: 500 }],
	];
	for (const [what, progress] of bad) {
		const r = await raw('micatro-progress-put', { progress }, tokens.rival);
		A(r.status === 400, 'put refuses ' + what, r.status + ' ' + JSON.stringify(r.body));
	}
	const big = await raw('micatro-progress-put', { progress: { nuz: 1, pad: 'x'.repeat(5000) } }, tokens.rival);
	A(big.status === 413, 'put refuses a record over the size cap', big.status);
	A(row('micatro_progress:rival') === null, 'refused puts write nothing');
	const extra = await raw('micatro-progress-put', { progress: { nuz: 1, junk: { a: 1 } } }, tokens.rival);
	A(extra.status === 200 && !('junk' in row('micatro_progress:rival').progress), 'unknown fields are dropped, not stored');

	// ===== 2. run-score badges =====
	const score = (body, who = 'nuzzy') => raw('run-score', { mode: 'micatro_modded', score: 5000, ante: 8, seed: 'ABC', back: 'b_red', stake: 8, won: true, mods: ['pokermon'], ...body }, tokens[who]);
	const s1 = await score({ badges: { nuz: true, mono: 'fire' } });
	A(s1.status === 200 && s1.body.best && s1.body.best.badges && s1.body.best.badges.nuz === true && s1.body.best.badges.mono === 'fire', 'run-score keeps {nuz, mono} on a won run', JSON.stringify(s1.body));
	const lb = await raw('run-leaderboard', { mode: 'micatro_modded' }, tokens.rival);
	const mine = (lb.body.top || []).find((e) => e.name === 'nuzzy');
	A(mine && mine.badges && mine.badges.nuz === true && mine.badges.mono === 'fire', 'the leaderboard row carries the badges', JSON.stringify(lb.body.top));
	for (const [what, badges] of [['an unknown key', { nuz: true, cheat: 1 }], ['a non-boolean nuz', { nuz: 'yes' }], ['an unknown type', { mono: 'bird' }], ['a list', ['nuz']], ['a string', 'nuz']]) {
		const r = await score({ badges, score: 9e9 });
		A(r.status === 400 && r.body.error === 'bad badges', 'run-score refuses badges with ' + what, r.status + ' ' + JSON.stringify(r.body));
	}
	const lost = await score({ badges: { nuz: true }, won: false, score: 1 }, 'rival');
	A(lost.status === 200 && !lost.body.best.badges, 'a lost run stores no badges (they are earned by winning)', JSON.stringify(lost.body.best));
	const none = await score({ score: 2 }, 'rival');
	A(none.status === 200, 'a score without badges still posts (older clients)');
	const vanilla = await raw('run-score', { mode: 'micatro', score: 10, ante: 8, won: true, badges: { mono: 'water' } }, tokens.rival);
	A(vanilla.status === 200 && vanilla.body.best.badges && vanilla.body.best.badges.mono === 'water', 'the vanilla board accepts the field too (shape-checked)', JSON.stringify(vanilla.body));

	// replay meta (allow-listed)
	const RP = await import(pathToFileURL(path.join(ROOT, 'micatro/js/replays.js')).href).catch(() => null);
	if (RP && typeof CompressionStream !== 'undefined') {
		const code = await RP.packRecipe({ v: 1, seed: 'RBX', back: 'b_red', stake: 1, mods: ['pokermon'], actions: [{ type: 'select_blind' }] });
		const up = await raw('micatro-replay-put', { code, meta: { won: true, badges: { nuz: true, mono: 'grass' } } }, tokens.nuzzy);
		A(up.status === 200 && up.body.id, 'a replay with badges in its meta uploads', JSON.stringify(up.body));
		const m = row('mreplay:' + up.body.id).meta;
		A(m.badges && m.badges.nuz === true && m.badges.mono === 'grass', 'replay meta keeps the badges', JSON.stringify(m));
		const up2 = await raw('micatro-replay-put', { code, meta: { won: true, badges: { nuz: 'x' } } }, tokens.nuzzy);
		A(up2.status === 200 && !('badges' in row('mreplay:' + up2.body.id).meta), 'replay meta drops malformed badges');
	} else console.log('skip - replay meta (no CompressionStream)');

	// ===== registration + source checks =====
	const src = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
	A(/'micatro-progress-get': \[\d+, \d+_?\d*\], 'micatro-progress-put': \[\d+, \d+_?\d*\]/.test(src), 'both progress actions are rate-limited');
	const gc = src.slice(src.indexOf('const GC_TABLE'), src.indexOf('];', src.indexOf('const GC_TABLE')));
	A(gc.length > 20 && !/micatro_progress/.test(gc), 'micatro_progress: is durable (not in the GC table)');
	const firstGet = src.indexOf("action === 'micatro-progress-get'"), gate = src.indexOf('// everything below requires a valid token');
	A(firstGet > gate && src.indexOf("action === 'micatro-progress-get'", firstGet + 1) < 0, 'the progress actions sit below the auth gate, matched once (first-match-wins)');

	// ===== 3. the client's merge agrees =====
	globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
	const PG = await import(pathToFileURL(path.join(ROOT, 'micatro/js/ui/progress.js')).href);
	const a = { v: 1, nuz: 2, nuzStake: 3, both: 1, mono: { fire: 1 }, ach: { first_nuzlocke: 1000 } };
	const b = { v: 1, nuz: 1, nuzStake: 8, both: 0, mono: { fire: 3, water: 1 }, ach: { first_nuzlocke: 500, nuzlocke_gold: 900 } };
	const cm = PG.mergeProgress(a, b);
	A(cm.nuz === 2 && cm.nuzStake === 8 && cm.both === 1 && cm.mono.fire === 3 && cm.mono.water === 1 && cm.ach.first_nuzlocke === 500 && cm.ach.nuzlocke_gold === 900, 'progress.js mergeProgress: max counts, union types/achievements, earliest time', JSON.stringify(cm));
	const sm = await raw('micatro-progress-put', { progress: b }, tokens.nuzzy);
	const both = PG.mergeProgress(m2, b);
	A(JSON.stringify(PG.mergeProgress(sm.body.progress, {})) === JSON.stringify(PG.mergeProgress(both, {})), 'the client and server merges give the same record', JSON.stringify([sm.body.progress, both]));

	// ===== 4. the per-type record =====
	await reg('typer');
	const t1 = await raw('micatro-progress-put', { progress: { nuz: 1, both: 1, mono: { fire: 2, water: 1 }, monoStake: { fire: 3, water: 2 }, bothMono: { fire: 1 }, bothStake: { fire: 3 } } }, tokens.typer);
	const tp1 = t1.body.progress || {};
	A(t1.status === 200 && (tp1.monoStake || {}).fire === 3 && tp1.monoStake.water === 2 && tp1.bothMono.fire === 1 && tp1.bothStake.fire === 3, 'a put stores the per-type stakes + Nuzlocke+Monotype wins', JSON.stringify(t1.body));
	A(((row('micatro_progress:typer').progress.bothMono) || {}).fire === 1, '... in the row');
	const old = await raw('micatro-progress-put', { progress: { v: 1, nuz: 1, nuzStake: 1, both: 1, mono: { fire: 2, water: 1 }, ach: {} } }, tokens.typer);
	const op = old.body.progress || {};
	A(old.status === 200 && (op.bothMono || {}).fire === 1 && (op.bothStake || {}).fire === 3 && (op.monoStake || {}).water === 2, "an OLD client's put (no per-type fields) never lowers them", JSON.stringify(op));
	A(((row('micatro_progress:typer').progress.bothStake) || {}).fire === 3, '... the row keeps them');
	const low = await raw('micatro-progress-put', { progress: { monoStake: { fire: 1 }, bothMono: { fire: 0, water: 1 }, bothStake: { fire: 1, water: 5 } } }, tokens.typer);
	const lp = low.body.progress || {};
	A(low.status === 200 && (lp.monoStake || {}).fire === 3 && (lp.bothMono || {}).fire === 1 && lp.bothStake.fire === 3 && lp.bothMono.water === 1 && lp.bothStake.water === 5, 'lower per-type values never lower them; new types join (per-type max)', JSON.stringify(lp));
	for (const [what, progress] of [['an unknown type in bothMono', { bothMono: { bird: 1 } }], ['a stake over 99', { bothStake: { fire: 100 } }], ['a fractional stake', { monoStake: { fire: 1.5 } }], ['bothStake as a list', { bothStake: [1] }], ['a negative count', { bothMono: { fire: -1 } }]]) {
		const r = await raw('micatro-progress-put', { progress }, tokens.typer);
		A(r.status === 400, 'put refuses ' + what, r.status + ' ' + JSON.stringify(r.body));
	}
	// read-time backfill: a record from before the per-type fields (like kgib's: types won, Nuzlocke + Monotype only a total)
	await reg('oldrec');
	const oldRec = { v: 1, nuz: 3, nuzStake: 2, both: 3, mono: { fire: 1, water: 1, grass: 1, dark: 1 }, ach: { first_nuzlocke: 1000 } };
	sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1)').run('micatro_progress:oldrec', JSON.stringify({ rev: 7, progress: oldRec, updated_at: 1 }));
	const rp = (id, by, meta) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, unixepoch())').run('mreplay:' + id, JSON.stringify({ code: 'G1.x', meta, by, when: 1 }));
	rp('a0000001', 'oldrec', { won: true, stake: 2, mods: ['pokermon'], badges: { nuz: true, mono: 'water' } });
	rp('a0000002', 'oldrec', { won: true, stake: 1, mods: ['pokermon'], badges: { nuz: true, mono: 'grass' } });
	rp('a0000003', 'oldrec', { won: true, stake: 4, mods: ['pokermon'], badges: { nuz: true, mono: 'grass' } });
	rp('a0000004', 'oldrec', { won: true, stake: 2, mods: ['pokermon'], badges: { mono: 'dark' } });
	rp('a0000005', 'oldrec', { won: false, stake: 8, mods: ['pokermon'] });
	rp('a0000006', 'oldrec', { won: true, stake: 3, mods: ['pokermon'] });
	rp('a0000007', 'rival', { won: true, stake: 8, mods: ['pokermon'], badges: { nuz: true, mono: 'fire' } });
	rp('a0000008', 'oldrec', { won: true, stake: 'mod_stake', mods: ['pokermon'], badges: { nuz: true, mono: 'bird' } });
	const before = JSON.stringify(row('micatro_progress:oldrec'));
	w0 = writes.length;
	const bf = (await raw('micatro-progress-get', {}, tokens.oldrec)).body.progress || {};
	const bm = bf.bothMono || {}, bs = bf.bothStake || {}, ms = bf.monoStake || {};
	A(bm.water === 1 && bm.grass === 2 && !bm.fire && !bm.dark, "get backfills Nuzlocke+Monotype per type from the player's own won replays (not a rival's, not a bad type)", JSON.stringify(bf));
	A(bs.water === 2 && bs.grass === 4 && ms.dark === 2 && ms.grass === 4 && !ms.fire, '... with the best stake per type (a type with no replay keeps none)', JSON.stringify(bf));
	A(bf.nuz === 3 && bf.both === 3 && bf.mono.fire === 1 && bf.ach.first_nuzlocke === 1000, '... the stored record reads unchanged around it', JSON.stringify(bf));
	A(JSON.stringify(row('micatro_progress:oldrec')) === before && !writes.slice(w0).some((k) => !k.startsWith('rl:')), 'the backfill is READ-time: the get writes nothing', JSON.stringify(writes.slice(w0)));
	const keep = await raw('micatro-progress-put', { progress: bf }, tokens.oldrec);
	const kr = row('micatro_progress:oldrec');
	A(keep.status === 200 && kr.rev === 8 && (kr.progress.bothMono || {}).grass === 2 && kr.progress.nuz === 3 && kr.progress.ach.first_nuzlocke === 1000, "the client's normal put of it is additive (max-merge onto the stored row)", JSON.stringify(kr));
	const g2 = (await raw('micatro-progress-get', {}, tokens.typer)).body.progress || {};
	A((g2.bothMono || {}).fire === 1 && !(g2.bothMono || {}).grass, "a record with its per-type data isn't backfilled from anyone's replays", JSON.stringify(g2));

	// the client: recordRunWin + typeRecord
	localStorage._m = {};
	await PG.initProgress('guest', null);
	PG.recordRunWin({ nuz: true, mono: 'Fire' }, 3, 1000, 'run1');
	PG.recordRunWin({ nuz: false, mono: 'Water' }, 5, 1001, 'run2');
	PG.recordRunWin({ nuz: true, mono: 'Fire' }, 2, 1002, 'run3');
	PG.recordRunWin({ nuz: true, mono: 'Fire' }, 2, 1003, 'run3');   // (a run counts once)
	const cp = PG.getProgress();
	const cbm = cp.bothMono || {}, cbs = cp.bothStake || {}, cms = cp.monoStake || {};
	A(cp.both === 2 && cbm.fire === 2 && cbs.fire === 3 && !cbm.water, 'recordRunWin: a Nuzlocke + Monotype win counts for its type, with its best stake', JSON.stringify(cp));
	A(cms.fire === 3 && cms.water === 5 && cp.mono.water === 1, "... and every Monotype win records its type's best stake", JSON.stringify(cp));
	if (typeof PG.typeRecord === 'function') {
		const tr = (t) => PG.typeRecord(t, cp);
		A(tr('Fire').category === 'both' && tr('Fire').level === 3 && tr('Water').category === 'mono' && tr('Water').level === 5 && tr('Grass').category === null, 'typeRecord: Fire -> Arceus (stake 3), Water -> Ambipom (stake 5), Grass -> none', JSON.stringify([tr('Fire'), tr('Water'), tr('Grass')]));
		A(JSON.stringify(PG.typesMissingBoth(cp)) === '["Water"]', 'typesMissingBoth lists the Monotype-only types');
		A(PG.typeRecord('Dark', { mono: { dark: 1 } }).level === 1, 'a type known only by its count (an old record) wears a White ring');
		const tl = PG.totalLevels(cp);
		A(tl.nuz === 3 && tl.mono === 5 && tl.both === 3 && PG.totalLevels(PG.emptyProgress()).both === 0, 'totalLevels: the best stake per total (0 = none)', JSON.stringify(tl));
	} else A(false, 'progress.js exports typeRecord / typesMissingBoth / totalLevels');
	const sm2 = await raw('micatro-progress-put', { progress: cp }, tokens.typer);
	A(JSON.stringify(PG.mergeProgress(sm2.body.progress, {})) === JSON.stringify(PG.mergeProgress(PG.mergeProgress(lp, cp), {})) && (sm2.body.progress.bothMono || {}).fire === 2, 'the client and server merges agree on the per-type fields', JSON.stringify([sm2.body.progress, PG.mergeProgress(lp, cp)]));
	// ===== 5. Golden Purist / Elite Nuzlocke / Elite Purist (Kyle 2026-10-20) + the Elite level =====
	// An Elite stake PLAYS at Gold's 8 (view.stake / the win event's stake): its win is level 9 only through the win
	// event's sticker_level (run.js win_sticker_level), which main.js now hands recordRunWin — the win stickers' rule.
	const ids = (list) => (list || []).map((a) => a.id).sort().join();
	const fresh = async (rec) => { localStorage._m = {}; if (rec) localStorage._m['micatro_progress_v1:guest'] = JSON.stringify(rec); return PG.initProgress('guest', null); };
	A(PG.ACHIEVEMENTS.length === 8 && ['nuzlocke_monotype_gold', 'nuzlocke_elite', 'nuzlocke_monotype_elite'].every((id) => PG.ACHIEVEMENTS.some((a) => a.id === id && a.name && a.desc)), 'the 3 new achievements are listed (8 in all)', JSON.stringify(PG.ACHIEVEMENTS.map((a) => a.id)));
	A(JSON.stringify(PG.ACHIEVEMENTS.filter((a) => /^nuzlocke_(monotype_gold|elite|monotype_elite)$/.test(a.id)).map((a) => a.name)) === '["Golden Purist","Elite Nuzlocke","Elite Purist"]', '... named Golden Purist, Elite Nuzlocke, Elite Purist');
	A(typeof PG.winLevel === 'function' && PG.winLevel({ stake: 8, sticker_level: 9 }) === 9 && PG.winLevel({ stake: 8, sticker_level: 8 }) === 8 && PG.winLevel({ stake: 8 }) === 8 && PG.winLevel({ stake: 3, sticker_level: 3 }) === 3 && PG.winLevel(5) === 5 && PG.winLevel('stake_poke_elite') === 1, "winLevel: the win event's sticker_level (Elite 9; a mod stake that declares none, e.g. MoreFluff/Bunco, its Gold 8), else the stake");
	await fresh();
	const red = PG.recordRunWin({ nuz: true, mono: 'Fire' }, { stake: 2, sticker_level: 2 }, 2000, 'r-red');
	A(!ids(red).includes('nuzlocke_monotype_gold') && ids(red) === 'first_monotype,first_nuzlocke,nuzlocke_monotype', 'a Red Stake Nuzlocke + Monotype win: Purist, not Golden Purist', ids(red));
	const gold = PG.recordRunWin({ nuz: true, mono: 'Fire' }, { stake: 8, sticker_level: 8 }, 2001, 'r-gold');
	A(ids(gold) === 'nuzlocke_gold,nuzlocke_monotype_gold', 'a Gold Stake Nuzlocke + Monotype win unlocks Golden Purist (+ Golden Nuzlocke), no Elite', ids(gold));
	A(ids(PG.recordRunWin({ nuz: true, mono: 'Water' }, 8, 2002, 'r-gold2')) === '', '(a bare Gold stake level still works: nothing new)');
	await fresh();
	const eNuz = PG.recordRunWin({ nuz: true, mono: null }, { stake: 8, sticker_level: 9 }, 3000, 'r-elite');
	A(PG.getProgress().nuzStake === 9, 'an Elite Stake Nuzlocke win records nuzStake 9 (not Gold 8)', JSON.stringify(PG.getProgress()));
	A(ids(eNuz) === 'first_nuzlocke,nuzlocke_elite,nuzlocke_gold', '... and unlocks Elite Nuzlocke (+ Golden Nuzlocke), not Elite Purist', ids(eNuz));
	const ePur = PG.recordRunWin({ nuz: true, mono: 'Dark' }, { stake: 8, sticker_level: 9 }, 3001, 'r-elite2');
	const ep = PG.getProgress();
	A(ep.bothStake.dark === 9 && ep.monoStake.dark === 9 && ids(ePur) === 'first_monotype,nuzlocke_monotype,nuzlocke_monotype_elite,nuzlocke_monotype_gold', 'an Elite Nuzlocke + Monotype win records Dark at 9 and unlocks Elite Purist + Golden Purist', JSON.stringify([ids(ePur), ep.bothStake]));
	A(PG.totalLevels(ep).nuz === 9 && PG.totalLevels(ep).both === 9 && PG.typeRecord('Dark', ep).level === 9, "the Record screen's rings read level 9 (stickerName(9) = Elite)", JSON.stringify(PG.totalLevels(ep)));
	// retroactive: a record that already qualifies unlocks them on load (no new win needed), once, with the toast callback
	const retro = { v: 1, nuz: 4, nuzStake: 9, both: 2, mono: { fire: 2 }, monoStake: { fire: 8 }, bothMono: { fire: 2 }, bothStake: { fire: 8 }, ach: { first_nuzlocke: 10, first_monotype: 11, nuzlocke_monotype: 12, nuzlocke_gold: 13 } };
	localStorage._m = { 'micatro_progress_v1:guest': JSON.stringify(retro) };
	let toasted = null;
	await PG.initProgress('guest', null, { onUnlock: (l) => { toasted = l; } });
	const rp2 = PG.getProgress();
	A(rp2.ach.nuzlocke_monotype_gold > 1e12 && rp2.ach.nuzlocke_elite > 1e12 && !rp2.ach.nuzlocke_monotype_elite && rp2.ach.first_nuzlocke === 10, 'an existing record unlocks Golden Purist + Elite Nuzlocke retroactively on load (not Elite Purist: its best both is Gold)', JSON.stringify(rp2.ach));
	A(ids(toasted) === 'nuzlocke_elite,nuzlocke_monotype_gold', '... with the unlock toast', ids(toasted));
	A(JSON.parse(localStorage._m['micatro_progress_v1:guest']).ach.nuzlocke_elite > 1e12, '... saved');
	toasted = null;
	await PG.initProgress('guest', null, { onUnlock: (l) => { toasted = l; } });
	A(toasted === null, '... once (the next load unlocks nothing)');
	// retroactive on the account's record too (a sync from the server): pushed back
	let pushed = null;
	localStorage._m = {};
	await PG.initProgress('kyle', { isLoggedIn: () => true, fetchProgress: async () => ({ progress: { ...retro, nuzStake: 8, bothStake: { fire: 9 } } }), saveProgress: async (pr) => { pushed = pr; return { ok: true }; } }, { onUnlock: (l) => { toasted = l; } });
	A(pushed && pushed.ach.nuzlocke_monotype_elite > 1e12 && pushed.ach.nuzlocke_monotype_gold > 1e12 && !pushed.ach.nuzlocke_elite && ids(toasted) === 'nuzlocke_monotype_elite,nuzlocke_monotype_gold', "the account's record unlocks them on sync and is pushed back", JSON.stringify([pushed && pushed.ach, ids(toasted)]));
	const put = await raw('micatro-progress-put', { progress: pushed }, tokens.typer);
	A(put.status === 200 && put.body.progress.ach.nuzlocke_monotype_elite > 1e12 && put.body.progress.ach.nuzlocke_monotype_gold > 1e12, 'the server accepts + keeps the new ids (no allow-list: the id shape check only)', JSON.stringify(put.body).slice(0, 300));
	await PG.initProgress('guest', null);
	// main.js hands recordRunWin the win event's sticker_level (not view.stake alone)
	const mainSrc = fs.readFileSync(path.join(ROOT, 'micatro/js/ui/main.js'), 'utf8');
	A(/recordRunWin\(earned, \{ stake: view\.stake, sticker_level: winEv\.sticker_level \}/.test(mainSrc), 'main.js records the win at its sticker level (winEv.sticker_level)');
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
