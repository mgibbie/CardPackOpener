// battlecards_account_gold_test.mjs — bug:1794534122917 / bug:1794540414184 (instinctgauntlet, 2026-11-12): "Heist rewards
// ... only partly persist after fresh session". Gold was a counter in the browser only (localStorage), never on the
// account, so a fresh sign-in showed whatever that browser had last counted (18,350 back to 17,500).
// Owner, 2026-11-13: "Move gold onto the account — makes it real". So:
//   * the account holds gold; a fresh sign-in sees the same number
//   * the SERVER decides every amount: a fight by its result (100 / 50 / 25), a cleared run by its mode (with
//     run-reward), an Arena run that ended on its third loss by its wins (once a minute)
//   * the gold a browser had already counted comes along once per account, ever
//   * the game asks the server for a fight's gold, an Arena run's, and carries the browser's over at boot
//   node overworld/tests/battlecards_account_gold_test.mjs (needs esbuild, so it lives in the overworld gate)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import { gameSource } from '../../battlecards/tests/helpers/gamesource.mjs';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const ok = (m, c, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = {
	prepare(sql) {
		const st = sqlite.prepare(sql); const b = [];
		const api = {
			bind(...a) { b.length = 0; b.push(...a); return api; },
			async first() { return st.get(...b) ?? null; },
			async run() { return st.run(...b); },
			async all() { return { results: st.all(...b) }; },
		};
		return api;
	},
};
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-gold-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const api = async (action, body = {}, token) => {
	const res = await handler(new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	}), { MP_DB });
	return { status: res.status, body: await res.json() };
};
const reg = async (name) => (await api('register', { username: name, password: 'gold-pass-1' })).body;

const A = await reg('goldie');
const tok = A.token;
ok('a new account has no gold, and nothing carried over yet', !!tok && A.state.gold === 0 && A.state.goldImported === false, JSON.stringify([A.state && A.state.gold, A.state && A.state.goldImported]));
// ---- a fight
let r = await api('gold-earn', { kind: 'fight', result: 'win', amount: 999999, gold: 999999 }, tok);
ok('a won fight pays 100 (whatever amount the client names)', r.status === 200 && r.body.gold === 100 && r.body.state.gold === 100, JSON.stringify(r.body).slice(0, 160));
r = await api('gold-earn', { kind: 'fight', result: 'loss' }, tok);
const r2 = await api('gold-earn', { kind: 'fight', result: 'draw' }, tok);
ok('a lost fight pays 25, a draw 50', r.body.gold === 25 && r2.body.gold === 50 && r2.body.state.gold === 175, JSON.stringify([r.body.gold, r2.body.gold]));
ok('an unknown result or kind pays nothing', (await api('gold-earn', { kind: 'fight', result: 'jackpot' }, tok)).status === 400 && (await api('gold-earn', { kind: 'bank', amount: 5000 }, tok)).status === 400);
ok('gold needs an account', (await api('gold-earn', { kind: 'fight', result: 'win' })).status === 401);
// ---- a cleared run (the tester's: a Heist)
r = await api('run-reward', { result: 'win', mode: 'heist' }, tok);
ok('a cleared Heist pays 750 with its pack', r.status === 200 && r.body.won && r.body.gold === 750 && r.body.state.gold === 925, JSON.stringify([r.status, r.body.gold, r.body.state && r.body.state.gold]));
r = await api('run-reward', { result: 'win', mode: 'heist' }, tok);
ok("asked again at once: refused, no gold (the reward's own minute)", r.status === 429 && r.body.state.gold === 925);
const B = await reg('goldie2');
r = await api('run-reward', { result: 'loss', mode: 'heist' }, B.token);
ok('a lost run pays no gold', r.status === 200 && !r.body.gold && r.body.state.gold === 0);
const modes = { dungeon: 500, tombs: 750, duels: 1000, lorequest: 1000, middleearth: 1000, swordcoast: 1000, finalfantasy: 1000, multiverse: 1000, arena: 1600, pvp: 0 };
let allModes = true; const got = {};
for (const [mode, want] of Object.entries(modes)) { const u = await reg('gm' + mode); const q = await api('run-reward', { result: 'win', mode }, u.token); got[mode] = q.body.gold; if (q.body.gold !== want || q.body.state.gold !== want) allModes = false; }
ok("each mode's clear pays what the game says it banks (a won duel: none)", allModes, JSON.stringify(got));
// ---- an Arena run that ended on its third loss
r = await api('gold-earn', { kind: 'arena', wins: 5 }, tok);
ok('an Arena run that ended 5-3 pays 100 + 5 x 120', r.body.gold === 700 && r.body.state.gold === 1625, JSON.stringify(r.body).slice(0, 120));
r = await api('gold-earn', { kind: 'arena', wins: 5 }, tok);
ok('asked again at once: refused', r.status === 429 && r.body.state.gold === 1625);
r = await api('gold-earn', { kind: 'arena', wins: 400 }, B.token);
ok('its wins count to 11 at most', r.body.gold === 100 + 11 * 120, String(r.body.gold));
// ---- the browser's old counter comes along, once
r = await api('gold-earn', { kind: 'import', amount: 17500 }, tok);
ok('the gold this browser had counted comes along (17,500)', r.body.gold === 17500 && r.body.state.gold === 19125 && r.body.state.goldImported === true, JSON.stringify([r.body.gold, r.body.state && r.body.state.gold]));
r = await api('gold-earn', { kind: 'import', amount: 17500 }, tok);
ok('…once: asked again, nothing', r.status === 200 && r.body.gold === 0 && r.body.state.gold === 19125);
const C = await reg('goldie3');
r = await api('gold-earn', { kind: 'import', amount: 5e9 }, C.token);
ok('a carried-over amount has a ceiling (1,000,000)', r.body.gold === 1000000, String(r.body.gold));
ok('…and a negative one is nothing', (await api('gold-earn', { kind: 'import', amount: -50 }, (await reg('goldie4')).token)).body.gold === 0);
// ---- a fresh session
const again = await api('login', { username: 'goldie', password: 'gold-pass-1' });
ok('a fresh sign-in sees the same gold (the reported case)', again.status === 200 && again.body.state.gold === 19125, JSON.stringify(again.body.state && again.body.state.gold));

// ---- the game asks the server
const game = gameSource().split('\r\n').join('\n');
ok('a finished fight asks the server for its gold, by its result', game.includes("accountGold({ kind: 'fight', result: ev.winner == null ? 'draw' : won ? 'win' : 'loss' })"));
ok('an Arena run that ended asks for its gold, by its wins', game.includes("accountGold({ kind: 'arena', wins: run.wins || 0 })"));
ok("the browser's old counter is carried over at boot, before the run is read", game.includes('\timportLocalGold();\n\tawait hydrateRunsFromServer();') && game.includes("{ kind: 'import', amount: had }"));
ok("a cleared run's screen says the gold with the pack", game.includes("(data.gold > 0 ? ' ' + goldLine(data.gold, data.state.gold) : '')"));
ok("the game never names a fight's amount to the server", !/gold-earn'[^)]*reward/.test(game));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
