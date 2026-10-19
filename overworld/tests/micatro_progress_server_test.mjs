// micatro_progress_server_test.mjs — the Micatro Nuzlocke / Monotype record on the account backend
// (server/mp.mjs, the REAL handler bundled like the dev server, over an in-memory sqlite D1 stub):
//   1. micatro-progress-get / -put need an account; put validates the shape + caps the size; it MERGES
//      (counts: max, types + achievements: union, earliest time kept) so a record never goes backwards,
//      writes exactly `micatro_progress:<user>` (durable: not in the GC table), rate-limited
//   2. run-score (micatro / micatro_modded) accepts a small client-reported `badges` field
//      ({nuz:true, mono:'fire'}), validates its shape, keeps it on a WON run's board row, and the
//      leaderboard returns it; replay meta keeps it too (allow-listed)
//   3. the client's merge (micatro/js/ui/progress.js mergeProgress) agrees with the server's
//   node overworld/tests/micatro_progress_server_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';

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
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
