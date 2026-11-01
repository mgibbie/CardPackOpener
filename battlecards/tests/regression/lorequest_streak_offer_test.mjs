// lorequest_streak_offer_test.mjs — bug:1793299952326-instinctgauntlet (BLOCKER, 2026-10-29):
// three Middle-earth heroes on a live win streak filled all three offer slots forever, so an
// unlocked Gandalf could never be picked, and conceding a run never ended its hero's streak.
// The rule now (all five Lorequest-family modes share Lorequest.offerFrom / streakPins):
//   1. streak pins take at most count-1 slots while an un-pinned hero exists; the last slot
//      always rotates through the heroes WITHOUT a live streak; equal streaks rotate (rng).
//   2. conceding or abandoning a run ends that hero's streak (server action run-walkaway),
//      without counting a run (no core-unlock farming), paying a pack or stamping the cooldown.
//   node battlecards/tests/regression/lorequest_streak_offer_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import * as Lorequest from '../../lorequest.js';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
let pass = 0, fail = 0;
const ok = (m, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---- 1. the offer: the tester's exact account shape ----
const pool = ['Aragorn', 'Legolas', 'Eowyn', 'Gandalf', 'Frodo', 'Samwise', 'Gimli', 'Boromir', 'Faramir', 'Wulfgar'];
const stats = { chars: { 'middleearth|Aragorn': { streak: 1 }, 'middleearth|Legolas': { streak: 1 }, 'middleearth|Eowyn': { streak: 1 } } };
let seenGandalf = false, seed = 1;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pinCounts = {};
let shapeOk = true;
for (let i = 0; i < 400; i++) {
	const offer = Lorequest.offerFrom(pool, rng, 3, Lorequest.streakPins(pool, stats, 'middleearth', rng));
	const pinned = offer.filter(c => stats.chars['middleearth|' + c]);
	if (offer.length !== 3 || new Set(offer).size !== 3 || pinned.length !== 2) { shapeOk = false; ok('three live streaks take exactly 2 of 3 distinct slots', false, offer.join(',')); break; }
	for (const c of pinned) pinCounts[c] = (pinCounts[c] || 0) + 1;
	if (offer.includes('Gandalf')) seenGandalf = true;
}
ok('three live streaks take exactly 2 of 3 distinct slots', shapeOk);
ok('Gandalf (unlocked, no streak) is reachable in the offer', seenGandalf);
ok('equal streaks rotate: each of the three streak heroes gets offered', Object.keys(pinCounts).length === 3, JSON.stringify(pinCounts));
const hot = { chars: { 'm|a': { streak: 4 }, 'm|b': { streak: 1 }, 'm|c': { streak: 1 } } };
ok('the hottest streak always keeps its pin, and the fresh slot is the un-streaked hero',
	Array.from({ length: 50 }, () => Lorequest.offerFrom(['a', 'b', 'c', 'd'], Math.random, 3, Lorequest.streakPins(['a', 'b', 'c', 'd'], hot, 'm', Math.random))).every(o => o[0] === 'a' && o.includes('d')));
ok('one live streak is still always offered', Array.from({ length: 50 }, () => Lorequest.offerFrom(pool, Math.random, 3, ['Gimli'])).every(o => o.includes('Gimli')));
ok('a pool of only streak heroes still fills the offer', Lorequest.offerFrom(['a', 'b', 'c'], () => 0, 3, ['a', 'b', 'c']).length === 3);

// ---- 2. the server: run-walkaway ends the streak, nothing else ----
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-lq-streak-')), 'mp.bundle.mjs');
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
const tok = (await api('register', { username: 'streaker', password: 'streak-pass-1' })).body.token;
ok('test account registers', !!tok);
const won = await api('run-reward', { result: 'win', mode: 'middleearth', character: 'Aragorn' }, tok);
const cs0 = won.body.state?.stats?.chars?.['middleearth|Aragorn'];
ok('a won run starts a streak', cs0?.streak === 1, JSON.stringify(cs0));
const runs0 = won.body.state?.stats?.modes?.middleearth?.runs, packs0 = won.body.state?.packs;
const wa = await api('run-walkaway', { mode: 'middleearth', character: 'Aragorn' }, tok);
ok('run-walkaway answers ok', wa.status === 200 && wa.body.ok, JSON.stringify(wa.body).slice(0, 200));
const cs1 = wa.body.state?.stats?.chars?.['middleearth|Aragorn'];
ok("conceding/abandoning ends the hero's streak", cs1?.streak === 0, JSON.stringify(cs1));
ok('... keeps best/wins/runs (feats already earned stay earned)', cs1?.best === 1 && cs1?.wins === 1 && cs1?.runs === 1, JSON.stringify(cs1));
ok('... counts no run (no core-unlock farming) and pays no pack',
	wa.body.state?.stats?.modes?.middleearth?.runs === runs0 && wa.body.state?.packs === packs0);
ok('run-walkaway needs an account', (await api('run-walkaway', { mode: 'middleearth', character: 'Aragorn' })).status === 401);
ok('run-walkaway rejects a non-Lorequest mode', (await api('run-walkaway', { mode: 'dungeon', character: 'x' }, tok)).status === 400);
const again = await api('run-walkaway', { mode: 'swordcoast', character: 'Nobody' }, tok);
ok('an unknown hero is a harmless no-op', again.status === 200 && !again.body.state?.stats?.chars?.['swordcoast|Nobody']);

// ---- 3. the client wires concede + abandon to it in every Lorequest-family mode ----
const game = fs.readFileSync(path.join(ROOT, 'battlecards/game.js'), 'utf8');
const ci = game.indexOf("overlayButton('Concede the run'");
ok('the run Concede button reports the walkaway', ci > 0 && /mpRunWalkaway\(runModeName\(\), run\)/.test(game.slice(ci, ci + 200)));
for (const [fn, m] of [['resumeLorequestOverlay', 'lorequest'], ['resumeMiddleEarthOverlay', 'middleearth'], ['resumeSwordCoastOverlay', 'swordcoast'], ['resumeFinalFantasyOverlay', 'finalfantasy'], ['resumeMultiverseOverlay', 'multiverse']])
	ok(`${m}: "Abandon - start a new run" reports the walkaway`, game.includes(`!(await ${fn}(run))) { mpRunWalkaway('${m}', run);`));
for (const m of ['lorequest', 'middleearth', 'swordcoast', 'finalfantasy', 'multiverse'])
	ok(`${m}: the hero picker rotates equal streaks (passes an rng)`, new RegExp(`streakPins\\((pool|unlocked), stats, '${m}', Math\\.random\\)`).test(game));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
