// designwiki_joker_design_server_test.mjs — the owner's joker-design inbox (server/mp.mjs joker-design-add / -list / -done),
// which the design wiki's "Pokermon jokers not in the game yet" cards file into (designwiki/app.js pjDesignBox).
// The REAL handler (bundled like the dev server) over an in-memory sqlite D1 stand-in:
//   * signed out: 401 for every action; a signed-in non-owner: 403 ('owner only'); neither writes a row
//   * the owner's design lands in ONE exact key, 'owner_todo:jokers' (a JSON list, oldest first) as
//     {ts, dex, name, ability, rarity, cost, notes}; no other row is written (besides the rate-limit / GC bookkeeping)
//   * validation: dex an integer 1..1025, ability required, ability / notes <= 2000 chars, name <= 60, rarity <= 40,
//     cost a whole number 0..99 or blank (null); a refusal writes nothing
//   * list returns all designs, or one species' (dex)
//   * appends never clobber: 12 concurrent submissions all land (every write is guarded on the row's length and retried),
//     each with its own increasing ts; a clear racing an append keeps the append
//   * done removes exactly the named timestamps (no clear-everything: an empty tsList is refused); clearing the last one
//     deletes the row
//   * the inbox is bounded (500 designs): the 501st is refused and the row is untouched
//   * the key can't be a username ('owner_todo:jokers' fails the /^[a-z0-9_]{3,20}$/ rule), and joker-design-add is rate-limited
//   node overworld/tests/designwiki_joker_design_server_test.mjs
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
const KEY = 'owner_todo:jokers';

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
			async run() {
				const r = stmt.run(...bound);
				if (r.changes > 0) {
					if (/^\s*INSERT/i.test(sql)) writes.push(String(bound[0]));
					else if (/^\s*UPDATE/i.test(sql)) writes.push(String(bound[1])); // (UPDATE ... SET value = ? WHERE key = ?)
					else if (/^\s*DELETE/i.test(sql)) writes.push(String(bound[0]));
				}
				return r;
			},
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = () => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(KEY); return r ? JSON.parse(r.value) : null; };

const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-jokerdesign-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);

let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const call = async (action, body, token) => (await raw(action, body, token)).body;
const ownWrites = (from) => writes.slice(from).filter((k) => !k.startsWith('rl:') && !k.startsWith('gc:'));
const design = (over = {}) => ({ dex: 293, name: 'Whismur', ability: '+4 Mult for each 2 played', rarity: 'Uncommon', cost: 6, notes: 'evolves after 4 rounds', ...over });

try {
	const owner = (await call('register', { username: 'mgibbie', password: 'jokers-pass-1' })).token;
	const peon = (await call('register', { username: 'jdpeon', password: 'jokers-pass-1' })).token;
	A(owner && peon, 'the owner and a second account register');

	// ---------- signed out / non-owner ----------
	let w = writes.length;
	for (const a of ['joker-design-add', 'joker-design-list', 'joker-design-done']) {
		const r = await raw(a, a === 'joker-design-done' ? { tsList: [1] } : design());
		A(r.status === 401, `${a}: signed out -> 401`, JSON.stringify(r));
		const p = await raw(a, a === 'joker-design-done' ? { tsList: [1] } : design(), peon);
		A(p.status === 403 && p.body.error === 'owner only', `${a}: a non-owner -> 403 owner only`, JSON.stringify(p));
	}
	A(row() === null && !ownWrites(w).includes(KEY), 'refused callers wrote nothing');

	// ---------- the owner files a design ----------
	w = writes.length;
	const t0 = Date.now();
	const r1 = await raw('joker-design-add', design(), owner);
	A(r1.status === 200 && r1.body.ok === true && r1.body.count === 1, 'the owner files a design', JSON.stringify(r1));
	const stored = row();
	A(Array.isArray(stored) && stored.length === 1, 'the row is a one-entry list');
	const d = stored && stored[0];
	A(d && d.dex === 293 && d.name === 'Whismur' && d.ability === '+4 Mult for each 2 played' && d.rarity === 'Uncommon' && d.cost === 6 && d.notes === 'evolves after 4 rounds' && d.ts >= t0,
		'the entry is {ts, dex, name, ability, rarity, cost, notes}', JSON.stringify(d));
	A(JSON.stringify(Object.keys(d || {}).sort()) === JSON.stringify(['ability', 'cost', 'dex', 'name', 'notes', 'rarity', 'ts']), 'no other fields are stored', JSON.stringify(Object.keys(d || {})));
	A(JSON.stringify(r1.body.design) === JSON.stringify(d), 'the reply echoes the stored design');
	A(JSON.stringify([...new Set(ownWrites(w))]) === JSON.stringify([KEY]), 'only the exact key owner_todo:jokers was written', JSON.stringify(ownWrites(w)));
	const blankCost = await call('joker-design-add', design({ dex: 294, name: 'Loudred', cost: '', notes: '', rarity: '' }), owner);
	A(blankCost.ok && blankCost.design.cost === null && blankCost.design.notes === '' && blankCost.design.rarity === '', 'rarity / cost / notes are optional (blank cost -> null)', JSON.stringify(blankCost));

	// ---------- validation: refusals write nothing ----------
	const before = JSON.stringify(row());
	w = writes.length;
	const bad = [
		[{ dex: 0 }, 'bad dex number'], [{ dex: 1026 }, 'bad dex number'], [{ dex: 'abc' }, 'bad dex number'], [{ dex: 25.5 }, 'bad dex number'],
		[{ ability: '   ' }, 'write the ability first'], [{ ability: 'x'.repeat(2001) }, 'too long'], [{ notes: 'n'.repeat(2001) }, 'too long'],
		[{ name: 'N'.repeat(61) }, 'too long'], [{ rarity: 'R'.repeat(41) }, 'too long'],
		[{ cost: -1 }, null], [{ cost: 100 }, null], [{ cost: 2.5 }, null], [{ cost: 'six' }, null],
	];
	for (const [over, err] of bad) {
		const r = await raw('joker-design-add', design(over), owner);
		A(r.status === 400 && (err ? r.body.error === err : /cost/.test(r.body.error || '')), `refused: ${JSON.stringify(over).slice(0, 40)}`, JSON.stringify(r));
	}
	A(JSON.stringify(row()) === before && !ownWrites(w).includes(KEY), 'no refusal touched the row');
	const max = await call('joker-design-add', design({ dex: 1025, ability: 'a'.repeat(2000), notes: 'n'.repeat(2000), name: 'N'.repeat(60), rarity: 'R'.repeat(40), cost: 99 }), owner);
	A(max.ok && max.count === 3, 'a design at every limit (2000 / 2000 / 60 / 40, cost 99, dex 1025) is accepted', JSON.stringify(max).slice(0, 120));

	// ---------- list ----------
	const all = await call('joker-design-list', {}, owner);
	A(Array.isArray(all.designs) && all.designs.length === 3, 'list returns every design', JSON.stringify(all).slice(0, 120));
	const one = await call('joker-design-list', { dex: 294 }, owner);
	A(one.designs.length === 1 && one.designs[0].name === 'Loudred', "list {dex} returns that species' designs", JSON.stringify(one));
	A((await call('joker-design-list', { dex: 1 }, owner)).designs.length === 0, 'a species with none: []');

	// ---------- appends never clobber ----------
	const N = 12;
	const results = await Promise.all(Array.from({ length: N }, (_, i) => call('joker-design-add', design({ dex: 400 + i, ability: 'race ' + i }), owner)));
	A(results.every((r) => r.ok), `${N} concurrent submissions all succeed`, JSON.stringify(results.filter((r) => !r.ok)));
	const after = row();
	const raced = after.filter((e) => /^race /.test(e.ability));
	A(after.length === 3 + N && raced.length === N && new Set(raced.map((e) => e.ability)).size === N, `all ${N} landed (none clobbered another)`, after.length);
	const ts = after.map((e) => e.ts);
	A(ts.every((t, i) => !i || t > ts[i - 1]), 'every design has its own, increasing ts');

	// ---------- done ----------
	const victim = after[0].ts, keepCount = after.length - 1;
	const done = await call('joker-design-done', { tsList: [victim, 12345] }, owner);
	A(done.ok && done.count === keepCount && !row().some((e) => e.ts === victim), 'done removes exactly the named ts (an unknown ts is a no-op)', JSON.stringify(done));
	A((await raw('joker-design-done', { tsList: [] }, owner)).status === 400 && (await raw('joker-design-done', {}, owner)).status === 400, 'done without timestamps is refused (no clear-everything)');
	// a clear racing an append: both effects survive
	const cur = row();
	const [addR, doneR] = await Promise.all([
		call('joker-design-add', design({ dex: 500, ability: 'filed during a clear' }), owner),
		call('joker-design-done', { tsList: [cur[0].ts] }, owner),
	]);
	const mixed = row();
	A(addR.ok && doneR.ok && mixed.some((e) => e.ability === 'filed during a clear') && !mixed.some((e) => e.ts === cur[0].ts) && mixed.length === cur.length,
		'an append racing a clear: the append survives and the cleared design is gone', JSON.stringify({ addR, doneR, n: mixed.length }).slice(0, 200));
	const last = await call('joker-design-done', { tsList: row().map((e) => e.ts) }, owner);
	A(last.ok && last.count === 0 && row() === null, 'clearing every named design deletes the row');

	// ---------- bounded ----------
	const full = Array.from({ length: 500 }, (_, i) => ({ ts: 1000 + i, dex: 1 + (i % 1025), name: 'x', ability: 'seed', rarity: '', cost: null, notes: '' }));
	sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 0)').run(KEY, JSON.stringify(full));
	const over = await raw('joker-design-add', design(), owner);
	A(over.status === 400 && /full/.test(over.body.error || '') && row().length === 500, 'the 501st design is refused and the row is untouched', JSON.stringify(over));
	sqlite.prepare('DELETE FROM mp_store WHERE key = ?').run(KEY);

	// ---------- the key can't be an account; the add is rate-limited ----------
	const squat = await raw('register', { username: KEY, password: 'jokers-pass-1' });
	A(squat.status === 400 && !squat.body.token, "'owner_todo:jokers' can't be registered as a username", JSON.stringify(squat));
	let limited = false;
	for (let i = 0; i < 40 && !limited; i++) limited = (await raw('joker-design-add', design({ ability: 'flood ' + i }), owner)).status === 429;
	A(limited, 'joker-design-add is rate-limited');
} catch (e) {
	fail++;
	console.log('FAIL: threw ' + (e && e.stack || e));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
