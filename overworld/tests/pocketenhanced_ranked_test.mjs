// pocketenhanced_ranked_test.mjs — Pocket Enhanced's ranked ladder (server/pocket_rank.mjs). Owner's improvement list,
// 2026-11-18 ("ranked or ladder play online ... a simple rating and a season reward in stars"): "yes to all".
// The REAL server (server/mp.mjs over sqlite), real online matches ended by a concession:
//   1. Elo: an even match moves 16 each way; a draw between equals moves nothing; a favourite's win moves less
//   2. a finished match of two people and no computer players is rated once (asked again: nothing more), on both rows
//      and on the season's board; a match with a computer player, or three people, is not
//   3. a new month: the rating comes halfway back to 1000, and a player with enough matches last season is paid that
//      season's stars into the wallet, once; one with too few is paid nothing
//   4. pkrank-get needs an account
//   node overworld/tests/pocketenhanced_ranked_test.mjs (needs esbuild, so it lives in the overworld gate)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import * as E from '../../pocketenhanced/js/engine/engine.js';
import { starterDeck } from '../../pocketenhanced/js/decks.js';
import { elo, payFor, seasonOf, RANK } from '../../server/pocket_rank.mjs';
import { PKPVP_PROTOCOL } from '../../server/pocket_pvp.mjs';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 600) : '')); } };

// ===== 1. Elo =====
A(JSON.stringify(elo(1000, 1000, 1)) === '[1016,984]' && JSON.stringify(elo(1000, 1000, 0.5)) === '[1000,1000]', 'an even match moves 16 each way; a draw between equals moves nothing');
{ const [a, b] = elo(1400, 1000, 1); A(a - 1400 < 16 && a > 1400 && 1000 - b === a - 1400, `a favourite's win moves less (${a - 1400}), and what one gains the other loses`); }
A(payFor(1450) === 800 && payFor(1250) === 400 && payFor(1000) === 200 && payFor(900) === 100, 'the season pays 800 from 1400, 400 from 1200, 200 from 1000, 100 below');

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-rank-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let clock = Date.now(); globalThis.__msurvClock = () => clock;
let ipN = 0;
const PV = { pv: PKPVP_PROTOCOL, ev: E.ENGINE_VERSION };
const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.8.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...PV, ...body }) }), { MP_DB })).json();
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
const tok = {}; for (const n of ['ann', 'ben', 'cat']) tok[n] = (await call('register', { username: n, password: 'rank-pass-1' })).token;
const D = id => starterDeck(id);
const season = seasonOf(clock);
/** A match between `players` (names) with `bots` computer players, ended by the last player conceding. -> the lobby id */
async function playMatch(players, bots = 0) {
	const L = (await call('pkpvp-create', { size: players.length + bots, bots, ...D('charizard') }, tok[players[0]])).lobby;
	for (const p of players.slice(1)) { await call('pkpvp-join', { code: L.code, ...D('pikachu') }, tok[p]); await call('pkpvp-update', { id: L.id, ready: true }, tok[p]); }
	const st = await call('pkpvp-start', { id: L.id }, tok[players[0]]);
	if (!st.match) throw new Error('no match: ' + JSON.stringify(st).slice(0, 200));
	await call('pkpvp-act', { id: L.id, a: { t: 'concede' } }, tok[players[players.length - 1]]);
	for (const p of players) await call('pkpvp-sync', { id: L.id, n: -1 }, tok[p]);
	return L.id;
}

// ===== 2. rated matches =====
A((await call('pkrank-get', {})).error === 'not logged in', 'the ladder needs an account');
const g0 = await call('pkrank-get', {}, tok.ann);
A(g0.season === season && g0.rating === 1000 && g0.games === 0 && g0.board.length === 0, `a new player starts at 1000 with no matches, season ${season}`, g0);
const id1 = await playMatch(['ann', 'ben']);
const ra = row('pkrank:ann'), rb = row('pkrank:ben');
A(ra && rb && ra.rating === 1016 && rb.rating === 984 && ra.games === 1 && rb.games === 1 && ra.wins === 1 && rb.wins === 0, 'ben concedes a two-person match: ann 1016, ben 984, one match each, ann a win', [ra, rb]);
for (const p of ['ann', 'ben']) await call('pkpvp-sync', { id: id1, n: -1 }, tok[p]);
A(row('pkrank:ann').rating === 1016 && row('pkrank:ann').games === 1, 'asked again: it is rated once');
const g1 = await call('pkrank-get', {}, tok.ben);
A(g1.board.length === 2 && g1.board[0].name === 'ann' && g1.board[0].rating === 1016 && g1.place === 2, "the season's board: ann first, ben second (his place is #2)", g1.board);
await playMatch(['ann'], 1);
A(row('pkrank:ann').games === 1, 'a match against a computer player is not rated');
await playMatch(['ann', 'ben', 'cat']);
A(row('pkrank:ann').games === 1 && !row('pkrank:cat'), 'nor is a match of three people');

// ===== 3. a new season =====
const prev = (() => { const d = new Date(clock); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return seasonOf(d.getTime()); })();
setRow('pkrank:ann', { ...row('pkrank:ann'), season: prev, rating: 1250, games: RANK.SEASON_MIN, rev: 5 });
setRow('pkrank:ben', { ...row('pkrank:ben'), season: prev, rating: 1300, games: RANK.SEASON_MIN - 1, rev: 5 });
const wallet = u => { const r = row('stars:' + u); if (!r) return 0; const t = o => Object.values(o || {}).reduce((x, y) => x + y, 0); return t(r.e) - t(r.s); };
const w0 = wallet('ann'), n1 = await call('pkrank-get', {}, tok.ann);
A(n1.paid && n1.paid.season === prev && n1.paid.stars === 400 && wallet('ann') === w0 + 400 && n1.rating === 1125 && n1.games === 0, `a new month: ann (1250, ${RANK.SEASON_MIN} matches) is paid 400 stars for ${prev}, and her rating comes halfway back: 1125`, n1);
const n2 = await call('pkrank-get', {}, tok.ann);
A(!n2.paid && wallet('ann') === w0 + 400, 'looking again pays nothing more');
const b0 = wallet('ben'), n3 = await call('pkrank-get', {}, tok.ben);
A(!n3.paid && wallet('ben') === b0 && n3.rating === 1150, `ben played ${RANK.SEASON_MIN - 1} matches last season: no stars; his rating comes back to 1150`, n3);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
