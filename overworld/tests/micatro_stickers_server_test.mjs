// micatro_stickers_server_test.mjs — Micatro's per-joker win (stake) stickers on the account
// (server/mp.mjs micatro-stickers-get / micatro-stickers-put; client: micatro/js/ui/stickers.js + net.js).
// The REAL handler (bundled like the dev server) over an in-memory sqlite D1 stand-in:
//   * both actions need a login (401 without a token)
//   * the record is per joker AND per category: {jokerKey: {win, poke, nuz, mono, both}} (win = any win, poke = a Pokermon win, nuz = a
//     Nuzlocke run, mono = Monotype, both = the two together), each the highest stake level 1..8; the old
//     flat form {jokerKey: level} means {win: level} (in a put, and in a row already stored)
//   * put validates: `wins` must be an object; keys /^[A-Za-z0-9_]{1,64}$/; known categories only; levels
//     integer 1..8; at most 5000 keys and ~700 KB — bad entries / oversize payloads are refused, write nothing
//   * put MERGES server-side: max(stored, incoming) per key and category — a stale put never lowers or
//     drops a sticker; a put that raises nothing writes no row; concurrent puts both land
//   * the row is exactly `micatro_stickers:<user>` = {v:2, wins, rev, updatedAt}, durable (not in the GC table)
//   * get round-trips it; one player never reads or writes another's (a `username` in the body is ignored)
//   * both actions are rate-limited (429 past the table's ceiling)
//   * REVOKED (an admin edit of the row): `revoked` {key: true | [cats] | {cats, at}} is kept verbatim by every put,
//     returned by get and put, and strips those keys / categories from incoming (and stored) wins; re-earn rule: a
//     category the put proves was earned after `at` (`earned` {key: {cat: ms}}) is accepted and its time kept in the
//     row's `earned`; with no `at` the key stays blocked until the admin removes the revocation
//   node overworld/tests/micatro_stickers_server_test.mjs
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
			async run() { const r = stmt.run(...bound); if (/^\s*INSERT/i.test(sql) && r.changes > 0) writes.push(String(bound[0])); return r; },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };

const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-micatro-stk-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);

let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.3.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const call = async (action, body, token) => (await raw(action, body, token)).body;
const tokens = {};
const reg = async (name) => { const r = await call('register', { username: name, password: 'stickers-pass-1' }); tokens[name] = r.token; return r.token; };
const ownWrites = (from) => writes.slice(from).filter((k) => !k.startsWith('rl:') && !k.startsWith('gc:'));

try {
	for (const n of ['stkalice', 'stkbob', 'stkflood', 'stkfull', 'stkold', 'stkrev', 'stkrev2']) await reg(n);
	A(tokens.stkalice && tokens.stkbob && tokens.stkflood && tokens.stkfull && tokens.stkold, 'test accounts register');

	// ----- auth -----
	const g0 = await raw('micatro-stickers-get', {});
	const p0 = await raw('micatro-stickers-put', { wins: { j_joker: { win: 2 } } });
	A(g0.status === 401 && p0.status === 401, 'both actions need a login (401 without a token)', JSON.stringify([g0, p0]));
	A(!row('micatro_stickers:undefined') && !row('micatro_stickers:'), 'a logged-out put writes nothing');

	// ----- empty get -----
	const e0 = await raw('micatro-stickers-get', {}, tokens.stkalice);
	A(e0.status === 200 && e0.body.rev === 0 && e0.body.wins && Object.keys(e0.body.wins).length === 0 && e0.body.v === 2, 'get: an empty record (v 2, rev 0, no wins)', JSON.stringify(e0.body));

	// ----- validation -----
	const bad = [
		[{}, 'no wins'],
		[{ wins: [] }, 'wins as a list'],
		[{ wins: 'j_joker' }, 'wins as a string'],
		[{ wins: { 'bad key!': { win: 2 } } }, 'a key with bad characters'],
		[{ wins: { ['k' + 'x'.repeat(64)]: { win: 2 } } }, 'a 65-char key'],
		[{ wins: { '': { win: 2 } } }, 'an empty key'],
		[{ wins: { j_joker: { win: 0 } } }, 'level 0'],
		[{ wins: { j_joker: { nuz: 9 } } }, 'level 9'],
		[{ wins: { j_joker: { mono: 2.5 } } }, 'a fractional level'],
		[{ wins: { j_joker: { win: '3' } } }, 'a string level'],
		[{ wins: { j_joker: { both: -1 } } }, 'a negative level'],
		[{ wins: { j_joker: { win: null } } }, 'a null level'],
		[{ wins: { j_joker: { win: 2, shiny: 3 } } }, 'an unknown category'],
		[{ wins: { j_joker: {} } }, 'an empty record'],
		[{ wins: { j_joker: [2] } }, 'a record as a list'],
		[{ wins: { j_joker: 9 } }, 'a flat (old-format) level 9'],
		[{ wins: { j_joker: { win: 2 }, j_bad: { win: 12 } } }, 'one bad entry among good ones'],
	];
	let w0 = writes.length;
	for (const [b, label] of bad) {
		const r = await raw('micatro-stickers-put', b, tokens.stkalice);
		A(r.status === 400 && r.body.error, 'refused (400): ' + label, JSON.stringify(r));
	}
	const many = {}; for (let i = 0; i < 5001; i++) many['j_k' + i] = { win: 1 };
	const rMany = await raw('micatro-stickers-put', { wins: many }, tokens.stkalice);
	A(rMany.status === 413 && rMany.body.max === 5000, 'refused (413): more than 5000 jokers', JSON.stringify(rMany.body));
	const big = {}; for (let i = 0; i < 7000; i++) big[('j' + i).padEnd(64, 'x')] = { win: 8, nuz: 8, mono: 8, both: 8 };
	const rBig = await raw('micatro-stickers-put', { wins: big }, tokens.stkalice);
	A(rBig.status === 413 && /too much/.test(rBig.body.error), 'refused (413): an oversize payload (~735 KB)', JSON.stringify(rBig.body));
	const fit = {}; for (let i = 0; i < 5000; i++) fit[('j' + i).padEnd(64, 'x')] = { win: 8, nuz: 8, mono: 8, both: 8 };
	A(ownWrites(w0).length === 0 && !row('micatro_stickers:stkalice'), 'no refused put wrote a row', JSON.stringify(ownWrites(w0)));

	// ----- put + round trip -----
	w0 = writes.length;
	const p1 = await raw('micatro-stickers-put', { wins: { j_joker: { win: 2 }, j_poke_bulbasaur: { win: 2, nuz: 1 }, j_greedy_joker: 1 } }, tokens.stkalice);
	A(p1.status === 200 && p1.body.ok && p1.body.rev === 1 && p1.body.changed === true && p1.body.wins.j_joker.win === 2 && p1.body.wins.j_poke_bulbasaur.nuz === 1, 'put stores the stickers (rev 1) and returns the merged map', JSON.stringify(p1.body));
	A(JSON.stringify(p1.body.wins.j_greedy_joker) === '{"win":1}', 'an old-format flat level is taken as {win: level}', JSON.stringify(p1.body.wins.j_greedy_joker));
	A(JSON.stringify(ownWrites(w0)) === JSON.stringify(['micatro_stickers:stkalice']), 'it writes exactly micatro_stickers:<user> (plus its rate-limit counter)', JSON.stringify(writes.slice(w0)));
	const r1 = row('micatro_stickers:stkalice');
	A(r1 && r1.v === 2 && r1.rev === 1 && typeof r1.updatedAt === 'number' && r1.wins.j_joker.win === 2 && Object.keys(r1).sort().join() === 'rev,updatedAt,v,wins', 'the row is {v:2, wins: {key: {cat: level}}, rev, updatedAt}', JSON.stringify(r1));
	const g1 = await call('micatro-stickers-get', {}, tokens.stkalice);
	A(g1.rev === 1 && g1.wins.j_joker.win === 2 && g1.wins.j_poke_bulbasaur.win === 2 && g1.wins.j_poke_bulbasaur.nuz === 1 && g1.wins.j_greedy_joker.win === 1 && Object.keys(g1.wins).length === 3, 'get round-trips them', JSON.stringify(g1));

	// ----- merge: max per key AND per category; never lowers, never drops -----
	const p2 = await call('micatro-stickers-put', { wins: { j_joker: { win: 8 }, j_lusty_joker: { win: 3 } } }, tokens.stkalice);
	A(p2.ok && p2.rev === 2 && p2.wins.j_joker.win === 8 && p2.wins.j_lusty_joker.win === 3 && p2.wins.j_greedy_joker.win === 1 && p2.wins.j_poke_bulbasaur.win === 2, 'a higher level raises; keys the put omits are kept', JSON.stringify(p2));
	const p2b = await call('micatro-stickers-put', { wins: { j_joker: { nuz: 1, both: 3 }, j_poke_bulbasaur: { win: 1, nuz: 6, mono: 2 } } }, tokens.stkalice);
	A(p2b.ok && JSON.stringify(p2b.wins.j_joker) === '{"win":8,"nuz":1,"both":3}' && JSON.stringify(p2b.wins.j_poke_bulbasaur) === '{"win":2,"nuz":6,"mono":2}',
		'categories merge independently (max per category; a new category joins, a lower one is ignored)', JSON.stringify([p2b.wins.j_joker, p2b.wins.j_poke_bulbasaur]));
	w0 = writes.length;
	const p3 = await call('micatro-stickers-put', { wins: { j_joker: { win: 2, nuz: 1, both: 1 }, j_lusty_joker: 1 } }, tokens.stkalice);
	A(p3.ok && p3.changed === false && p3.rev === 3 && p3.wins.j_joker.win === 8 && p3.wins.j_joker.both === 3 && p3.wins.j_lusty_joker.win === 3, 'a stale (lower) put never lowers a sticker in any category', JSON.stringify(p3));
	A(ownWrites(w0).length === 0, 'and a put that raises nothing writes no row', JSON.stringify(ownWrites(w0)));
	const p4 = await call('micatro-stickers-put', { wins: {} }, tokens.stkalice);
	A(p4.ok && Object.keys(p4.wins).length === 4 && row('micatro_stickers:stkalice').wins.j_joker.win === 8, 'an empty put drops nothing (returns the stored map)', JSON.stringify(p4));

	// ----- an older flat row already stored reads as {win} and is upgraded on the next put -----
	sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 0)').run('micatro_stickers:stkold', JSON.stringify({ v: 1, wins: { j_joker: 5, j_mime: 2, j_bad: 'x' }, rev: 4, updatedAt: 1 }));
	const go = await call('micatro-stickers-get', {}, tokens.stkold);
	A(go.rev === 4 && JSON.stringify(go.wins) === '{"j_joker":{"win":5},"j_mime":{"win":2}}', 'a stored old-format row reads as {key: {win: level}} (junk dropped)', JSON.stringify(go));
	const po = await call('micatro-stickers-put', { wins: { j_mime: { nuz: 3 } } }, tokens.stkold);
	const ro = row('micatro_stickers:stkold');
	A(po.ok && ro.v === 2 && ro.rev === 5 && JSON.stringify(ro.wins) === '{"j_joker":{"win":5},"j_mime":{"win":2,"nuz":3}}', '...and the next put rewrites it in the new form, keeping every level', JSON.stringify(ro));

	// ----- concurrent devices -----
	const [ca, cb] = await Promise.all([
		call('micatro-stickers-put', { wins: { j_joker: { win: 8 }, j_a_only: { mono: 5 } } }, tokens.stkalice),
		call('micatro-stickers-put', { wins: { j_joker: { win: 2, nuz: 7 }, j_b_only: { win: 4 } } }, tokens.stkalice),
	]);
	const after = row('micatro_stickers:stkalice');
	A(ca.ok && cb.ok && after.wins.j_a_only.mono === 5 && after.wins.j_b_only.win === 4 && after.wins.j_joker.win === 8 && after.wins.j_joker.nuz === 7, 'two concurrent puts both land (compare-and-set + re-merge); neither lowers the other', JSON.stringify([ca.rev, cb.rev, after.wins.j_joker]));
	A((await raw('micatro-stickers-put', { wins: fit }, tokens.stkfull)).status === 200, 'a full record (5000 64-char keys x 4 categories) fits the caps');

	// ----- poke (Pikachu: any Pokermon win) is a category like the others, max-merged -----
	const pk1 = await call('micatro-stickers-put', { wins: { j_pika: { win: 2, poke: 5 }, b_red: { poke: 3 } } }, tokens.stkalice);
	A(pk1.ok && JSON.stringify(pk1.wins.j_pika) === '{"win":2,"poke":5}' && pk1.wins.b_red.poke === 3, 'a put with the poke category is accepted (jokers and a deck back key)', JSON.stringify(pk1));
	const pk2 = await call('micatro-stickers-put', { wins: { j_pika: { poke: 2 } } }, tokens.stkalice);
	A(pk2.ok && pk2.changed === false && row('micatro_stickers:stkalice').wins.j_pika.poke === 5, 'a lower poke never lowers it (max-merge)', JSON.stringify(pk2.wins && pk2.wins.j_pika));
	const pk3 = await call('micatro-stickers-put', { wins: { j_pika: { poke: 8 } } }, tokens.stkalice);
	A(pk3.ok && pk3.changed === true && row('micatro_stickers:stkalice').wins.j_pika.poke === 8 && row('micatro_stickers:stkalice').wins.j_pika.win === 2, 'a higher poke raises it (and leaves win alone)', JSON.stringify(row('micatro_stickers:stkalice').wins.j_pika));
	A((await raw('micatro-stickers-put', { wins: { j_pika: { poke: 9 } } }, tokens.stkalice)).status === 400, 'a poke level outside 1..8 is refused');

	// ----- no cross-user access -----
	const gb = await call('micatro-stickers-get', { username: 'stkalice' }, tokens.stkbob);
	A(!gb.wins.j_joker && !gb.wins.j_a_only, "a player never reads another's stickers (a username in the body is ignored)", JSON.stringify(Object.keys(gb.wins).slice(0, 3)));
	const before = JSON.stringify(row('micatro_stickers:stkalice'));
	await call('micatro-stickers-put', { username: 'stkalice', wins: { j_cross: { win: 8 } } }, tokens.stkbob);
	A(JSON.stringify(row('micatro_stickers:stkalice')) === before && row('micatro_stickers:stkbob').wins.j_cross.win === 8, "...nor writes them (bob's put lands on bob's row only)");

	// ----- rate limits -----
	let got429 = false, n = 0;
	for (; n < 40 && !got429; n++) got429 = (await raw('micatro-stickers-put', { wins: { j_joker: { win: 1 + (n % 8) } } }, tokens.stkflood)).status === 429;
	A(got429 && n > 20, 'micatro-stickers-put is rate-limited (429 after a burst)', 'hits=' + n);
	let got429g = false; n = 0;
	for (; n < 40 && !got429g; n++) got429g = (await raw('micatro-stickers-get', {}, tokens.stkflood)).status === 429;
	A(got429g && n > 20, 'micatro-stickers-get is rate-limited (429 after a burst)', 'hits=' + n);

	// ----- revoked stickers (the admin's `revoked` field on the row) -----
	const at = Date.now() - 60_000;
	const REV = { b_plasma: { cats: true, at }, j_half: ['nuz'], j_block: true };
	sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 0)').run('micatro_stickers:stkrev', JSON.stringify({
		v: 2, wins: { j_joker: { win: 3 }, j_half: { win: 2, nuz: 4 } }, rev: 7, updatedAt: at, revoked: REV,
	}));
	const rg = await call('micatro-stickers-get', {}, tokens.stkrev);
	A(rg.revoked && JSON.stringify(rg.revoked.b_plasma) === JSON.stringify({ cats: ['win', 'poke', 'nuz', 'mono', 'both'], at }) && JSON.stringify(rg.revoked.j_half) === '{"cats":["nuz"],"at":null}' && rg.revoked.j_block.at === null,
		'get returns `revoked` (normalized: {cats, at}; at null = no re-earn)', JSON.stringify(rg.revoked));
	A(JSON.stringify(rg.wins.j_half) === '{"win":2}' && rg.wins.j_joker.win === 3, 'get hides a revoked category still in the stored wins (j_half nuz)', JSON.stringify(rg.wins));
	w0 = writes.length;
	const rp1 = await call('micatro-stickers-put', { wins: { b_plasma: { win: 4, poke: 2 }, j_half: { win: 2, nuz: 5 }, j_block: { win: 8 }, j_mime: { win: 6 } } }, tokens.stkrev);
	const rr1 = row('micatro_stickers:stkrev');
	A(rp1.ok && !rp1.wins.b_plasma && !rr1.wins.b_plasma && !rr1.wins.j_block, 'a revoked key in a put is ignored (not stored, not returned)', JSON.stringify(rp1));
	A(JSON.stringify(rr1.wins.j_half) === '{"win":2}', 'a partial (category) revocation: j_half keeps win, loses nuz (incoming and stored)', JSON.stringify(rr1.wins.j_half));
	A(rr1.wins.j_mime.win === 6 && rr1.wins.j_joker.win === 3, 'everything else max-merges as before', JSON.stringify(rr1.wins));
	A(JSON.stringify(rr1.revoked) === JSON.stringify(REV) && rr1.rev === 8, '`revoked` survives the put verbatim', JSON.stringify(rr1.revoked));
	A(rp1.revoked && rp1.revoked.b_plasma && rp1.revoked.j_half && rp1.revoked.j_block, 'the put response returns `revoked`', JSON.stringify(rp1.revoked));
	const rp2 = await call('micatro-stickers-put', { wins: { b_plasma: { win: 4 } } }, tokens.stkrev);
	A(rp2.ok && rp2.changed === false && !row('micatro_stickers:stkrev').wins.b_plasma && JSON.stringify(row('micatro_stickers:stkrev').revoked) === JSON.stringify(REV), 'a put of only the revoked key changes nothing (no write)', JSON.stringify(rp2));
	// the re-earn rule: earned after `at` -> accepted; earned before (or none) -> stripped; no `at` -> blocked
	const rp3 = await call('micatro-stickers-put', { wins: { b_plasma: { win: 8, poke: 2 } }, earned: { b_plasma: { win: at - 1000 } } }, tokens.stkrev);
	A(rp3.ok && !row('micatro_stickers:stkrev').wins.b_plasma, 'an earned time BEFORE the revocation does not lift it', JSON.stringify(row('micatro_stickers:stkrev').wins.b_plasma));
	const t2 = Date.now() - 1000;
	const rp4 = await call('micatro-stickers-put', { wins: { b_plasma: { win: 2, poke: 2 } }, earned: { b_plasma: { win: t2 } } }, tokens.stkrev);
	const rr4 = row('micatro_stickers:stkrev');
	A(rp4.ok && rp4.changed && JSON.stringify(rr4.wins.b_plasma) === '{"win":2}' && rr4.earned.b_plasma.win === t2, 'a win earned AFTER the revocation sticks (only that category: poke had no newer time)', JSON.stringify([rr4.wins.b_plasma, rr4.earned]));
	A(JSON.stringify(rr4.revoked) === JSON.stringify(REV) && rp4.earned && rp4.earned.b_plasma.win === t2, '...the revocation is still kept, and the response carries the earn time', JSON.stringify(rp4));
	const rg2 = await call('micatro-stickers-get', {}, tokens.stkrev);
	A(rg2.wins.b_plasma && rg2.wins.b_plasma.win === 2 && rg2.earned.b_plasma.win === t2, 'get returns the re-earned sticker and its time (so devices keep it)', JSON.stringify([rg2.wins.b_plasma, rg2.earned]));
	const rp5 = await call('micatro-stickers-put', { wins: { b_plasma: { win: 8 } } }, tokens.stkrev);
	A(rp5.ok && row('micatro_stickers:stkrev').wins.b_plasma.win === 2, 'a stale device pushing the old (higher) level with no earn time cannot raise it', JSON.stringify(row('micatro_stickers:stkrev').wins.b_plasma));
	const rp6 = await call('micatro-stickers-put', { wins: { b_plasma: { win: 5 } }, earned: { b_plasma: { win: Date.now() } } }, tokens.stkrev);
	A(rp6.ok && row('micatro_stickers:stkrev').wins.b_plasma.win === 5, 'a later re-earned higher win raises it as usual', JSON.stringify(row('micatro_stickers:stkrev').wins.b_plasma));
	const fut = Date.now() + 86_400_000;
	await call('micatro-stickers-put', { wins: { b_plasma: { win: 6 } }, earned: { b_plasma: { win: fut } } }, tokens.stkrev);
	A(row('micatro_stickers:stkrev').earned.b_plasma.win <= Date.now(), 'an earn time in the future is capped at the server\'s now', row('micatro_stickers:stkrev').earned.b_plasma.win);
	await call('micatro-stickers-put', { wins: { j_block: { win: 8 } }, earned: { j_block: { win: Date.now() } } }, tokens.stkrev);
	A(!row('micatro_stickers:stkrev').wins.j_block, 'a revocation with no `at` blocks the key whatever the earn time (until the admin removes it)', JSON.stringify(row('micatro_stickers:stkrev').wins.j_block));
	// the plain `true` form + a row with no stored wins for it; and a revocation the admin removed lets it back
	sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 0)').run('micatro_stickers:stkrev2', JSON.stringify({ v: 2, wins: { b_plasma: { win: 7 } }, rev: 1, updatedAt: 1, revoked: { b_plasma: true } }));
	const rq1 = await call('micatro-stickers-put', { wins: { j_joker: { win: 1 } } }, tokens.stkrev2);
	A(rq1.ok && !row('micatro_stickers:stkrev2').wins.b_plasma && JSON.stringify(row('micatro_stickers:stkrev2').revoked) === '{"b_plasma":true}', 'a stored sticker the admin revoked (but left in wins) is dropped on the next write; `revoked` kept', JSON.stringify(row('micatro_stickers:stkrev2')));
	const r2 = row('micatro_stickers:stkrev2'); delete r2.revoked;
	sqlite.prepare('UPDATE mp_store SET value = ? WHERE key = ?').run(JSON.stringify(r2), 'micatro_stickers:stkrev2');
	const rq2 = await call('micatro-stickers-put', { wins: { b_plasma: { win: 3 } } }, tokens.stkrev2);
	A(rq2.ok && row('micatro_stickers:stkrev2').wins.b_plasma.win === 3 && JSON.stringify(rq2.revoked) === '{}', 'once the admin removes the revocation the key max-merges normally again', JSON.stringify(rq2));
	A(Object.keys(row('micatro_stickers:stkalice')).sort().join() === 'rev,updatedAt,v,wins', 'a row without revocations gains no `revoked` / `earned` fields');

	// ----- source registration -----
	const src = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
	const rl = src.slice(src.indexOf('const RATE_LIMITS'), src.indexOf('const HIT_LIMIT'));
	A(/'micatro-stickers-get': \[\d+, [\d_]+\]/.test(rl) && /'micatro-stickers-put': \[\d+, [\d_]+\]/.test(rl), 'both actions are in the rate-limit table');
	const gc = src.slice(src.indexOf('const GC_TABLE'), src.indexOf('];', src.indexOf('const GC_TABLE')));
	A(!/micatro_stickers/.test(gc), 'micatro_stickers: rows are durable (not in the GC table)');
	const gate = src.indexOf('// everything below requires a valid token');
	A(gate > 0 && src.indexOf("action === 'micatro-stickers-get'") > gate && src.indexOf("action === 'micatro-stickers-put'") > gate, 'both actions sit below the auth gate');
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
