// micatro_runsync_server_test.mjs — Micatro's in-progress run and completed challenges on the account
// (server/mp.mjs micatro-run-get / -put / -clear and micatro-challenges-get / -put; client: micatro/js/ui/runsync.js,
// micatro/js/ui/challengesync.js, micatro/js/net.js). The REAL handler (bundled like the dev server) over an in-memory
// sqlite D1 stand-in:
//   * every action needs a login (401 without a token)
//   * challenges: `done` must be {id: ts}; ids by shape; at most 1000; a put MERGES (union, the EARLIEST time per id),
//     so a stale device never un-completes or re-dates one; an unchanged put writes no row
//   * the run: the recipe is shape-checked and size-capped (700 KB, 20000 actions); the put is compare-and-set on `rev`;
//     a put from a device BEHIND the stored copy of the same run, or of a DIFFERENT run (without naming it in
//     `replace`), or of a run that already FINISHED is refused (409) and writes nothing; equal progress writes nothing
//   * clear ends ONLY that run (a different stored run, or a further-along copy, is left alone) and leaves a
//     tombstone, so a late put can't resurrect it — except a won run going on into Endless, and a replaced run the
//     player explicitly restores
//   * rows are exactly `micatro_challenges:<user>` / `micatro_run:<user>`, durable (not in the GC table); one player
//     never reads or writes another's (a `username` in the body is ignored)
//   node overworld/tests/micatro_runsync_server_test.mjs
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

// ---------- a D1 stand-in that records which rows are written ----------
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
			async run() { const r = stmt.run(...bound); if (/^\s*(INSERT|DELETE)/i.test(sql) && r.changes > 0) writes.push(String(bound[0])); return r; },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };

const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-micatro-runsync-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
const src = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');

let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.21.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const tokens = {};
const reg = async (name) => { const r = (await raw('register', { username: name, password: 'runsync-pass-1' })).body; tokens[name] = r.token; return r.token; };
const own = (from) => writes.slice(from).filter((k) => !k.startsWith('rl:') && !k.startsWith('gc:'));
// a run recipe: `n` actions on seed / started
const recipe = (seed, started, n, extra = {}) => ({ v: 1, seed, back: 'b_red', stake: 1, mods: [], modOptions: {}, started, actions: Array.from({ length: n }, (_, i) => (i % 3 ? { type: 'highlight', ids: [i] } : { type: 'select_blind' })), ...extra });

try {
	for (const n of ['rsalice', 'rsbob']) await reg(n);
	A(tokens.rsalice && tokens.rsbob, 'test accounts register');
	const T = tokens.rsalice, TB = tokens.rsbob;

	// ----- auth -----
	const unauth = await Promise.all(['micatro-challenges-get', 'micatro-challenges-put', 'micatro-run-get', 'micatro-run-put', 'micatro-run-clear'].map((a) => raw(a, { done: { c_x: 1 }, recipe: recipe('AAAA', 1, 1), id: 'AAAA:1' })));
	A(unauth.every((r) => r.status === 401), 'every action needs a login (401 without a token)', JSON.stringify(unauth.map((r) => r.status)));

	// ===================================================== completed challenges
	{
		const e0 = await raw('micatro-challenges-get', {}, T);
		A(e0.status === 200 && JSON.stringify(e0.body.done) === '{}' && e0.body.rev === 0, 'an empty account has no completed challenges', JSON.stringify(e0.body));
		const bad = await Promise.all([
			raw('micatro-challenges-put', { done: [] }, T),
			raw('micatro-challenges-put', { done: 'x' }, T),
			raw('micatro-challenges-put', { done: { 'bad id!': 5 } }, T),
			raw('micatro-challenges-put', { done: { c_ok: -1 } }, T),
			raw('micatro-challenges-put', { done: { c_ok: 1.5 } }, T),
			raw('micatro-challenges-put', { done: { c_ok: Date.now() + 10 * 86_400_000 } }, T),
		]);
		A(bad.every((r) => r.status === 400) && !row('micatro_challenges:rsalice'), 'bad shapes (not an object, bad id, bad time) are refused and write nothing', JSON.stringify(bad.map((r) => r.status)));
		const big = {}; for (let i = 0; i < 1001; i++) big['c_' + i] = 1000 + i;
		const b1 = await raw('micatro-challenges-put', { done: big }, T);
		A(b1.status === 413 && !row('micatro_challenges:rsalice'), 'more than 1000 ids is refused (413)', b1.status);

		const w0 = writes.length;
		const p1 = await raw('micatro-challenges-put', { done: { c_omelette_1: 5000, c_poke_nuzlocke: 7000 } }, T);
		A(p1.status === 200 && p1.body.changed && p1.body.done.c_omelette_1 === 5000 && p1.body.rev === 1, 'a put stores the ticks', JSON.stringify(p1.body));
		A(JSON.stringify(own(w0)) === JSON.stringify(['micatro_challenges:rsalice']), 'it writes exactly micatro_challenges:<user>', JSON.stringify(own(w0)));
		// a stale device: only c_omelette_1, with a LATER time; plus a new one
		const p2 = await raw('micatro-challenges-put', { done: { c_omelette_1: 9000, c_city_1: 8000 } }, T);
		A(p2.body.done.c_omelette_1 === 5000 && p2.body.done.c_poke_nuzlocke === 7000 && p2.body.done.c_city_1 === 8000, 'a put MERGES: union, the earliest time kept (a stale device never drops or re-dates one)', JSON.stringify(p2.body.done));
		const p3 = await raw('micatro-challenges-put', { done: { c_omelette_1: 3000 } }, T);
		A(p3.body.done.c_omelette_1 === 3000, 'an earlier completion time wins', JSON.stringify(p3.body.done));
		const w1 = writes.length;
		const p4 = await raw('micatro-challenges-put', { done: { c_city_1: 8000, c_omelette_1: 4000 } }, T);
		A(p4.status === 200 && p4.body.changed === false && own(w1).length === 0, 'a put that changes nothing writes no row', JSON.stringify([p4.body, own(w1)]));
		const g = await raw('micatro-challenges-get', { username: 'rsbob' }, T);
		A(Object.keys(g.body.done).length === 3 && g.body.rev === 3, 'get round-trips the merged ticks (a username in the body is ignored)', JSON.stringify(g.body));
		const gb = await raw('micatro-challenges-get', { username: 'rsalice' }, TB);
		A(JSON.stringify(gb.body.done) === '{}', 'another player never reads them');
		const pb = await raw('micatro-challenges-put', { username: 'rsalice', done: { c_bob: 1234 } }, TB);
		A(pb.status === 200 && row('micatro_challenges:rsbob').done.c_bob === 1234 && !row('micatro_challenges:rsalice').done.c_bob, 'and never writes them (bob\'s put lands on bob\'s row)');
	}

	// ===================================================== the run in progress
	{
		const key = 'micatro_run:rsalice';
		const e0 = await raw('micatro-run-get', {}, T);
		A(e0.status === 200 && e0.body.rev === 0 && e0.body.run === null && Array.isArray(e0.body.ended) && !e0.body.ended.length, 'an empty account has no run in progress', JSON.stringify(e0.body));
		// validation
		const bad = await Promise.all([
			raw('micatro-run-put', { recipe: null, rev: 0 }, T),
			raw('micatro-run-put', { recipe: [], rev: 0 }, T),
			raw('micatro-run-put', { recipe: { ...recipe('AAAA', 1, 2), v: 'x' }, rev: 0 }, T),
			raw('micatro-run-put', { recipe: { ...recipe('AAAA', 1, 2), seed: '<script>' }, rev: 0 }, T),
			raw('micatro-run-put', { recipe: { ...recipe('AAAA', 1, 2), actions: [{ nope: 1 }] }, rev: 0 }, T),
			raw('micatro-run-put', { recipe: { ...recipe('AAAA', 1, 2), started: -5 }, rev: 0 }, T),
			raw('micatro-run-put', { recipe: { ...recipe('AAAA', 1, 2), modVersions: { 'bad id!': 'x' } }, rev: 0 }, T),
		]);
		A(bad.every((r) => r.status === 400) && !row(key), 'a malformed recipe is refused and writes nothing', JSON.stringify(bad.map((r) => r.status)));
		const tooMany = await raw('micatro-run-put', { recipe: recipe('AAAA', 1, 20001), rev: 0 }, T);
		A(tooMany.status === 413 && !row(key), 'more than 20000 actions is refused (413)', tooMany.status);
		const huge = await raw('micatro-run-put', { recipe: recipe('AAAA', 1, 10, { customDeck: { name: 'x'.repeat(720_000) } }), rev: 0 }, T);
		A(huge.status === 413 && !row(key), 'a recipe over 700 KB is refused (413)', huge.status);
		// a real long run fits: the tester fixture (a won 8-ante run) and an Endless marathon at the action cap
		const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'micatro/tests/fixtures/pokermon_grass_monotype_win.json'), 'utf8'));
		const marathon = { ...fx, actions: Array.from({ length: 20000 }, (_, i) => fx.actions[i % fx.actions.length]) };
		A(JSON.stringify(fx).length < 40_000 && JSON.stringify(marathon).length < 700_000, 'the cap fits a won run (~25 KB) and a 20000-action marathon', JSON.stringify([JSON.stringify(fx).length, JSON.stringify(marathon).length]));

		// first put
		const R1 = 'SEEDA:1000';
		let w = writes.length;
		const p1 = await raw('micatro-run-put', { recipe: recipe('SEEDA', 1000, 10), rev: 0, device: { id: 'devaaaa1', label: 'PC' }, progress: { ante: 1, round: 2, actions: 999 } }, T);
		A(p1.status === 200 && p1.body.ok && p1.body.rev === 1 && p1.body.wrote, 'the first put stores the run (rev 1)', JSON.stringify(p1.body));
		A(JSON.stringify(own(w)) === JSON.stringify([key]), 'it writes exactly micatro_run:<user>', JSON.stringify(own(w)));
		const r1 = row(key);
		A(r1.run.id === R1 && r1.run.progress.actions === 10 && r1.run.progress.ante === 1 && r1.run.progress.round === 2 && r1.run.device.id === 'devaaaa1', 'the row holds {id: seed:started, recipe, progress (actions counted by the server, not the client), device}', JSON.stringify(r1.run.progress));
		// stale rev
		w = writes.length;
		const s1 = await raw('micatro-run-put', { recipe: recipe('SEEDA', 1000, 20), rev: 0 }, T);
		A(s1.status === 409 && s1.body.error === 'stale' && s1.body.rev === 1 && s1.body.run.id === R1 && s1.body.run.progress.actions === 10 && !s1.body.run.recipe && own(w).length === 0, 'a put on a stale rev is refused (409 stale, with the stored run\'s summary) and writes nothing', JSON.stringify(s1.body));
		// further along: ok
		const p2 = await raw('micatro-run-put', { recipe: recipe('SEEDA', 1000, 30), rev: 1, device: { id: 'devbbbb2', label: 'phone' }, progress: { ante: 2, round: 5 } }, T);
		A(p2.status === 200 && p2.body.rev === 2 && row(key).run.progress.actions === 30, 'a further-along put of the same run lands (rev 2)', JSON.stringify(p2.body));
		// behind
		w = writes.length;
		const b1 = await raw('micatro-run-put', { recipe: recipe('SEEDA', 1000, 25), rev: 2 }, T);
		A(b1.status === 409 && b1.body.error === 'behind' && row(key).run.progress.actions === 30 && own(w).length === 0, 'a put from a device BEHIND the stored copy (fewer actions, same run) is refused and writes nothing', JSON.stringify(b1.body));
		// equal
		w = writes.length;
		const q1 = await raw('micatro-run-put', { recipe: recipe('SEEDA', 1000, 30), rev: 2 }, T);
		A(q1.status === 200 && q1.body.wrote === false && q1.body.rev === 2 && own(w).length === 0, 'equal progress writes nothing', JSON.stringify(q1.body));
		// another run
		w = writes.length;
		const o1 = await raw('micatro-run-put', { recipe: recipe('SEEDB', 2000, 50), rev: 2 }, T);
		A(o1.status === 409 && o1.body.error === 'other' && o1.body.run.id === R1 && row(key).run.id === R1 && own(w).length === 0, 'a DIFFERENT run (even further along) never silently replaces the stored one (409 other)', JSON.stringify(o1.body));
		const o2 = await raw('micatro-run-put', { recipe: recipe('SEEDB', 2000, 5), rev: 2, replace: 'SEEDZ:1' }, T);
		A(o2.status === 409 && o2.body.error === 'other', '...nor when `replace` names some other run');
		const o3 = await raw('micatro-run-put', { recipe: recipe('SEEDB', 2000, 5), rev: 2, replace: R1 }, T);
		const r3 = row(key);
		A(o3.status === 200 && r3.run.id === 'SEEDB:2000' && r3.ended.some((e) => e.id === R1 && e.outcome === 'replaced' && e.actions === 30), 'naming it in `replace` (the player chose) replaces it, remembering the old run as replaced', JSON.stringify(r3.ended));
		// the replaced run's device comes back late
		const late = await raw('micatro-run-put', { recipe: recipe('SEEDA', 1000, 40), rev: 3, replace: 'SEEDB:2000' }, T);
		A(late.status === 409 && late.body.error === 'ended' && row(key).run.id === 'SEEDB:2000', 'a late put of the replaced run is refused (ended) even naming the current one', JSON.stringify(late.body));
		const rest = await raw('micatro-run-put', { recipe: recipe('SEEDA', 1000, 40), rev: 3, replace: 'SEEDB:2000', restore: true }, T);
		const r4 = row(key);
		A(rest.status === 200 && r4.run.id === R1 && r4.run.progress.actions === 40 && !r4.ended.some((e) => e.id === R1) && r4.ended.some((e) => e.id === 'SEEDB:2000' && e.outcome === 'replaced'), 'the player explicitly RESTORING it (restore + replace) brings it back', JSON.stringify([rest.body, r4.ended]));
		// clear
		w = writes.length;
		const c0 = await raw('micatro-run-clear', { id: 'bad id', outcome: 'won' }, T);
		A(c0.status === 400 && own(w).length === 0, 'clear refuses a malformed id');
		const c1 = await raw('micatro-run-clear', { id: 'SEEDB:2000', outcome: 'won', actions: 99 }, T);
		A(c1.status === 409 && c1.body.error === 'other' && row(key).run.id === R1 && own(w).length === 0, 'clear of ANOTHER run leaves the stored one alone (409 other)', JSON.stringify(c1.body));
		const c2 = await raw('micatro-run-clear', { id: R1, outcome: 'lost', actions: 35 }, T);
		A(c2.status === 409 && c2.body.error === 'behind' && row(key).run.id === R1 && own(w).length === 0, 'clear from a device BEHIND the stored copy leaves the further-along copy alone (409 behind)', JSON.stringify(c2.body));
		const c3 = await raw('micatro-run-clear', { id: R1, outcome: 'won', actions: 41 }, T);
		const r5 = row(key);
		A(c3.status === 200 && r5.run === null && r5.ended.some((e) => e.id === R1 && e.outcome === 'won' && e.actions === 41) && JSON.stringify(own(w)) === JSON.stringify([key]), 'clear of the same run ends it and leaves a tombstone (one write, exact key)', JSON.stringify([c3.body, r5]));
		const g5 = await raw('micatro-run-get', {}, T);
		A(g5.body.run === null && g5.body.ended.some((e) => e.id === R1 && e.outcome === 'won'), 'get shows no run, and the finished one among `ended`', JSON.stringify(g5.body));
		const late2 = await raw('micatro-run-put', { recipe: recipe('SEEDA', 1000, 41), rev: g5.body.rev }, T);
		A(late2.status === 409 && late2.body.error === 'ended' && row(key).run === null, 'a late put of the finished run (a stale device) can\'t resurrect it', JSON.stringify(late2.body));
		const late3 = await raw('micatro-run-put', { recipe: recipe('SEEDA', 1000, 41), rev: g5.body.rev, endless: true }, T);
		A(late3.status === 409 && late3.body.error === 'ended', '...nor can an "endless" put that is not past the win');
		const endless = await raw('micatro-run-put', { recipe: recipe('SEEDA', 1000, 45), rev: g5.body.rev, endless: true }, T);
		const r6 = row(key);
		A(endless.status === 200 && r6.run.id === R1 && r6.run.progress.actions === 45 && !r6.ended.some((e) => e.id === R1), 'the WON run going on into Endless (past the win) reopens', JSON.stringify(endless.body));
		const c4 = await raw('micatro-run-clear', { id: R1, outcome: 'lost', actions: 60 }, T);
		A(c4.status === 200 && row(key).run === null && row(key).ended.find((e) => e.id === R1).outcome === 'lost', 'its Endless game over clears it again (lost)');
		const c5 = await raw('micatro-run-clear', { id: 'NOPE:5', outcome: 'abandoned', actions: 1 }, T);
		A(c5.status === 200 && row(key).ended.some((e) => e.id === 'NOPE:5'), 'clearing a run the account never held still remembers it ended (a late first put can\'t create it)');
		const lateNew = await raw('micatro-run-put', { recipe: recipe('NOPE', 5, 3), rev: row(key).rev }, T);
		A(lateNew.status === 409 && lateNew.body.error === 'ended', '...as its late put shows');
		// tombstones are bounded
		for (let i = 0; i < 12; i++) await raw('micatro-run-clear', { id: 'T' + i + ':1', outcome: 'abandoned' }, T);
		A(row(key).ended.length === 10, 'at most 10 tombstones are kept', row(key).ended.length);
		// cross-user
		const gb = await raw('micatro-run-get', { username: 'rsalice' }, TB);
		A(gb.body.run === null && !gb.body.ended.length, 'another player never reads the run');
		await raw('micatro-run-put', { recipe: recipe('ALIC', 7, 4), rev: row(key).rev }, T);
		const cb = await raw('micatro-run-clear', { username: 'rsalice', id: 'ALIC:7', outcome: 'won', actions: 4 }, TB);
		A(cb.status === 200 && row(key).run && row(key).run.id === 'ALIC:7', 'and never clears it (bob\'s clear touches bob\'s row only)');
		const pb = await raw('micatro-run-put', { username: 'rsalice', recipe: recipe('BOBB', 9, 2), rev: (row('micatro_run:rsbob') || {}).rev || 0 }, TB);
		A(pb.status === 200 && row('micatro_run:rsbob').run.id === 'BOBB:9' && row(key).run.id === 'ALIC:7', 'bob\'s put lands on bob\'s row');
	}

	// ----- durable + rate-limited -----
	const gcTable = (src.match(/const GC_TABLE = \[([\s\S]*?)\];/) || [])[1] || '';
	A(gcTable && !/micatro_run|micatro_challenges/.test(gcTable), 'both rows are durable (not in the GC table)');
	A(/'micatro-run-put': \[\d+, \d+/.test(src) && /'micatro-challenges-put': \[\d+, \d+/.test(src), 'the writes are rate-limited');
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
