// poketactica_td_live_test.mjs — TOWER DEFENSE: replays, resume, live spectating, rewards and records (owner, 2026-11-23:
// "Both of these single player sub games need to have spectation/replays").
//   node:  a run played the way the page plays it (orders applied at once, written down with their tick) is re-run
//          EXACTLY from its recipe, from full or slimmed figurines, at any tick, through a snapshot, as a growing
//          broadcast; recipes are checked and packed; what a run pays; records and checkpoints.
//   page + the REAL server: alice plays signed in (the camp's Tower Defense screens), her run is saved and RESUMES after a
//          reload at its tick; bob (a friend) follows it live from her orders, hash for hash; it ends, its replay is
//          stored, bob is offered it; the replay viewer plays it, jumps between waves, and ends on the same state.
//   node overworld/tests/poketactica_td_live_test.mjs
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';
import * as TD from '../../poketactica/js/td/sim.js';
import { tdRecipe, validTdRecipe, tdDriver, tdRunTo } from '../../poketactica/js/td/replay.js';
import { tdRewards, applyTdRewards, startWaves, TD_STAR_RATE } from '../../poketactica/js/td/rewards.js';
import { tdMapById } from '../../poketactica/js/td/maps.js';
import { packRecipe, unpackRecipe, validRecipe, slimFig } from '../../poketactica/js/replay.js';
import * as FC from '../../poketactica/js/figcol.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8968;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv, moves, id) => { let f = makeFigurine(sp, lv, makeRng(sp + lv), data, { id: id || sp + '-tdl', shinyRate: 0 }); const pool = [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((x) => ({ id: x, lv: 1, xp: 0 }))]; return equip({ ...f, pool }, moves); };

// ---------------------------------------------------------------- node: the recipe is the run
try {
	const full = [fig('pikachu', 30, ['thunderbolt', 'quickattack']), fig('charizard', 30, ['flamethrower']), fig('blastoise', 30, ['surf', 'watergun']), fig('butterfree', 30, ['sleeppowder'])];
	const LOOP = tdMapById('td-loop');
	// the page's way: an order is applied at once and written down with the tick the run stood on; then time moves
	const plan = { 0: [{ t: 'place', fig: 0, x: 5, y: 2 }, { t: 'place', fig: 1, x: 9, y: 2 }, { t: 'call' }], 130: [{ t: 'place', fig: 2, x: 5, y: 6 }, { t: 'rule', uid: 't0', rule: 'strong' }], 400: [{ t: 'toggle', uid: 't0', move: 'quickattack' }], 900: [{ t: 'recall', uid: 't1' }], 1210: [{ t: 'place', fig: 3, x: 9, y: 2 }, { t: 'place', fig: 3, x: 5, y: 1 }] };
	const live = (squad, ticks, seed = 'rec1') => {
		const S = TD.newRun(seed, { map: LOOP, squad }, data), inputs = [], hashes = {};
		for (;;) {
			for (const a of plan[S.tick] || []) if (TD.applyInput(S, a, data) === null) inputs.push([S.tick, a]);
			if (S.phase === 'wait' && S.tick > 5 && S.tick % 7 === 0 && TD.applyInput(S, { t: 'call' }, data) === null) inputs.push([S.tick, { t: 'call' }]);
			hashes[S.tick] = TD.hashOf(S);
			if (S.tick >= ticks || S.over) break;
			TD.step(S, [], data);
		}
		return { S, inputs, hashes };
	};
	const run = live(full.map(slimFig), 2400);
	const rec = tdRecipe({ seed: 'rec1', mapId: 'td-loop', squad: full, startWave: 1, inputs: run.inputs, end: run.S.tick, wave: run.S.cleared });
	A(validTdRecipe(rec) && validRecipe(rec) && rec.kind === 'td' && /Tower Defense · Meadow Loop · wave \d+/.test(rec.label) && rec.squad.every((f) => f.pool.length === f.equipped.length), 'a run\'s recipe: seed, map, the squad slimmed, the orders with their ticks, its end', rec.label);
	A(run.inputs.length >= 8 && run.inputs.some(([, a]) => a.t === 'recall') && !run.inputs.some(([t, a]) => t === 1210 && a.x === 5 && a.y === 1), 'only the orders that were taken are written down (a refused one is not)', run.inputs.length);
	A(TD.hashOf(tdRunTo(rec, null, data)) === TD.hashOf(run.S), 'the recipe re-run ends on the very same state');
	A([1, 130, 131, 400, 899, 900, 901, 1210, 1777].every((t) => TD.hashOf(tdRunTo(rec, t, data)) === run.hashes[t]), 'and stands on the same state at every tick in between (orders given on that tick included)');
	A(TD.hashOf(live(full, 2400).S) === TD.hashOf(run.S), 'the whole figurines and their slimmed copies play the very same run');
	// packed and unpacked (the tape store's form)
	const code = await packRecipe(rec), back = await unpackRecipe(code);
	A(typeof code === 'string' && code.length < 6000 && back && TD.hashOf(tdRunTo(back, null, data)) === TD.hashOf(run.S), `it packs small (${code.length} characters for two minutes of play) and unpacks to the same run`);
	A(!validTdRecipe({ ...rec, map: 'nope' }) && !validTdRecipe({ ...rec, squad: [] }) && !validTdRecipe({ ...rec, inputs: [[5, { t: 'call' }], [3, { t: 'call' }]] }) && !validTdRecipe({ ...rec, inputs: [[1, { t: 'hack' }]] }) && !validTdRecipe({ ...rec, end: -1 }), 'a recipe with an unknown map, no squad, orders out of order, an unknown order or a bad end is refused');
	// a retire is an order on the last tick, with no tick after it
	{
		const r2 = live(full.map(slimFig), 600, 'rec2');
		TD.applyInput(r2.S, { t: 'retire' }, data); r2.inputs.push([r2.S.tick, { t: 'retire' }]);
		const rr = tdRunTo(tdRecipe({ seed: 'rec2', mapId: 'td-loop', squad: full, inputs: r2.inputs, end: r2.S.tick, wave: r2.S.cleared, over: 'retired' }), null, data);
		A(rr.over === 'retired' && rr.tick === r2.S.tick && TD.hashOf(rr) === TD.hashOf(r2.S), 'a retired run re-runs to its retire');
	}
	// the viewer's jumps: a mark taken on the way, restored, plays on to the same end
	{
		const d = tdDriver(rec, data);
		d.to(700); const m = d.mark(); d.to(rec.end); const end1 = TD.hashOf(d.S);
		d.restore(JSON.parse(JSON.stringify(m))); const at700 = TD.hashOf(d.S); d.to(rec.end);
		A(at700 === run.hashes[700] && TD.hashOf(d.S) === end1 && end1 === TD.hashOf(run.S), 'a mark taken mid-run and restored (through JSON) plays on to the same end');
	}
	// a broadcast grows: a follower given the orders so far, a tick at a time, is on the same state at each tick it reaches
	{
		const d = tdDriver({ ...rec, inputs: [] }, data);
		let ok = true;
		for (const t of [0, 60, 130, 500, 900, 1210, 2000, 2400]) { d.setInputs(run.inputs.filter(([k]) => k <= t)); d.to(t); if (TD.hashOf(d.S) !== run.hashes[t]) ok = false; }
		A(ok, 'a follower fed the orders as they come is on the player\'s state at every tick it reaches (hash for hash)');
	}
	// what it pays, the record, the checkpoints
	{
		const S = run.S;
		TD.applyInput(S, { t: 'retire' }, data);
		const r = tdRewards(S);
		A(r.wave === S.cleared && r.stars === Math.floor(S.stars * TD_STAR_RATE) && r.stars > 0 && Object.keys(r.exp).length > 0, 'a run pays stars for its waves (at the Tower Defense rate) and EXP to the towers that earned it', r);
		const col = { v: 1, figs: Object.fromEntries(full.map((f) => [f.id, f])) };
		const { col: c2, report } = applyTdRewards(col, full.map((f) => f.id), r, 'td-loop', data);
		const i = +Object.keys(r.exp)[0];
		A(c2.figs[full[i].id].exp === full[i].exp + r.exp[i] && report.units.some((u) => u.id === full[i].id && u.gained === r.exp[i]) && c2.td['td-loop'] === r.wave && report.record, 'the EXP lands on the figurine, the map\'s best wave is recorded');
		A(!applyTdRewards(c2, full.map((f) => f.id), { ...r, wave: 1, exp: {}, moveXp: {} }, 'td-loop', data).report.record && applyTdRewards(c2, [], { ...r, wave: 1 }, 'td-loop', data).col.td['td-loop'] === r.wave, 'a worse run does not lower the record');
		A(FC.cleanFigs(c2).td['td-loop'] === r.wave && FC.merge3Figs(null, { v: 1, figs: {}, td: { 'td-loop': 4, 'td-twin': 9 } }, { v: 1, figs: {}, td: { 'td-loop': 12 } }).td['td-loop'] === 12 && !FC.cleanFigs({ v: 1, figs: {}, td: { 'bad id!': 3, 'td-loop': -2 } }).td, 'the records are kept by the collection: read defensively, the better one wins a merge');
		A(startWaves(0).join() === '1' && startWaves(9).join() === '1' && startWaves(10).join() === '1,11' && startWaves(34).join() === '1,11,21,31', 'checkpoints: a new run may start after each boss wave cleared');
		const cp = TD.newRun('cp', { map: tdMapById('td-loop'), squad: full, startWave: 21 }, data);
		A(cp.cleared === 20 && TD.slotsOf(cp) === TD.slotsAfter(20) && cp.energy === 0, 'a run from a checkpoint starts with the slots that wave had opened, and no energy');
	}
} catch (e) { A(false, 'the node part threw', e && e.stack); }

// ---------------------------------------------------------------- the real handler over sqlite
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { return st.run(...b); }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-pttd-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const res = await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB });
	return res.json();
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.8.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const tokens = {};
for (const n of ['alice', 'bob']) tokens[n] = (await call('register', { username: n, password: 'poketactica-td-pass' })).token;
await call('add-friend', { username: 'alice' }, tokens.bob);
await call('add-friend', { username: 'bob' }, tokens.alice);
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };
const mk = (sp, lv, moves) => ({ v: 1, id: sp + '-e2e', species: sp, level: lv, exp: 0, ability: null, shiny: false, pool: moves.map((id) => ({ id, lv: 1, xp: 0 })), equipped: moves });
const FIGS = JSON.stringify({ v: 1, starters: true, figs: Object.fromEntries([mk('pikachu', 40, ['thunderbolt']), mk('charizard', 40, ['flamethrower']), mk('blastoise', 40, ['surf'])].map((f) => [f.id, f])) });

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
	const open = async (who, url, figs = null) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 800 });
		const errors = []; page.on('pageerror', (e) => errors.push(e.message));
		const st = who ? await stateOf(who) : null;
		await page.evaluateOnNewDocument((tok, st, figs) => {
			try {
				localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('magepunk_poketactica_perma_v1', '1'); localStorage.setItem('magepunk_poketactica_tdcoach_v1', 'done');
				if (tok) { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
				if (figs && !sessionStorage.getItem('seeded')) { localStorage.setItem('magepunk_poketactica_figs_v1', figs); sessionStorage.setItem('seeded', '1'); }
			} catch { /* ignore */ }
		}, who ? tokens[who] : null, st, figs);
		const load = async (u = url) => { await page.goto(`http://localhost:${PORT}${u}`, { waitUntil: 'domcontentloaded' }); await waitFor(() => page.evaluate(() => !!(window.__poketactica && window.__poketactica.ready)), 60000); await sleep(400); };
		await load();
		const E = (fn, ...a) => page.evaluate(fn, ...a);
		const key = async (k, ms = 250) => { await page.keyboard.press(k); await sleep(ms); };
		const focus = () => E(() => window.__poketactica.hub.focusLabel());
		const keyTo = async (re) => { for (let i = 0; i < 30; i++) { const f = await focus(); if (f && re.test(f)) { await key('KeyZ', 500); return true; } await key(i < 15 ? 'ArrowDown' : 'ArrowUp', 70); } return false; };
		const td = () => E(() => { const T = window.__poketactica; if (!T.td.T.S) return null; const v = T.td.view(); return { tick: v.tick, wave: v.wave, cleared: v.cleared, towers: v.towers.length, over: v.over, hash: T.td.hash(), mode: T.td.T.mode, paused: T.td.T.paused, speed: T.td.T.speed, ended: !!T.td.T.ended, resyncs: T.td.T.resyncs || 0, target: T.td.T.target }; });
		return { page, errors, E, key, keyTo, focus, td, load };
	};

	// ---- alice: the camp's Tower Defense screens, by keyboard
	const alice = await open('alice', '/poketactica/', FIGS);
	A(await alice.keyTo(/Tower Defense/), 'alice: the camp has Tower Defense');
	// (owner, 2026-11-24: Tower Defense asks first: Road, or Maze Builder)
	A(await alice.keyTo(/Road/), 'Tower Defense asks Road or Maze Builder: Road');
	const maps = await alice.E(() => ({ screen: window.__poketactica.hub.H.screen, l: window.__poketactica.hub.labels(), sub: document.querySelector('#hub .ph-sub').textContent }));
	A(maps.screen === 'td' && maps.l.some((x) => /Meadow Loop/.test(x) && /New/.test(x)) && maps.l.some((x) => /Twin Gates/.test(x) && /2 gates/.test(x)) && /safe: nothing is lost here/.test(maps.sub), 'its maps (new ones marked, the two-gate one named), and that nothing is lost there', maps);
	A(await alice.keyTo(/Meadow Loop/), 'Z on Meadow Loop');
	const sq = await alice.E(() => ({ screen: window.__poketactica.hub.H.screen, l: window.__poketactica.hub.labels(), f: window.__poketactica.hub.focusLabel() }));
	A(sq.screen === 'td-squad' && /Start! 3\/12/.test(sq.f), 'the squad screen: every figurine in (3 of up to 12), Start! focused', sq);
	await alice.key('KeyZ', 900);
	let a = await alice.td();
	A(a && a.mode === 'play' && a.tick >= 0 && await alice.E(() => window.__poketactica.P.screen === 'td'), 'Start!: the run begins', a);
	// place two towers and call the wave, by the page's own orders
	await alice.E(() => { const T = window.__poketactica; T.td.order({ t: 'place', fig: 0, x: 5, y: 2 }); T.td.order({ t: 'place', fig: 1, x: 9, y: 2 }); T.td.order({ t: 'call' }); });
	const listed = await waitFor(async () => ((await call('live-friends', {}, tokens.bob)).live || []).some((f) => f.username === 'alice' && f.kind === 'poketactica' && /Tower Defense · Meadow Loop/.test(f.label)), 15000);
	A(listed, "bob's live-friends lists alice's Tower Defense run", JSON.stringify(await call('live-friends', {}, tokens.bob)).slice(0, 300));

	// ---- bob follows it live
	const bob = await open('bob', '/poketactica/?spectate=alice');
	const following = await waitFor(async () => { const b = await bob.td(); return b && b.mode === 'follow' && b.towers === 2; }, 20000);
	A(following, 'bob: the same board, her two towers on it (run from her orders)', await bob.td());
	A(await bob.E(() => getComputedStyle(document.getElementById('b-exec')).display === 'none' && !document.querySelector('#pt-td [data-act="wave"]') && /Watching alice/.test(document.getElementById('pt-td').textContent)), "bob's page has no play controls; the bar says he is watching alice");
	await alice.E(() => { window.__poketactica.td.T.speed = 3; });
	await sleep(6000);
	// alice pauses (a menu): bob catches up to her very tick, on her very state
	await alice.key('Enter', 300);
	a = await alice.td();
	const caught = await waitFor(async () => { const b = await bob.td(); return b.tick === a.tick; }, 20000);
	let b = await bob.td();
	A(caught && b.hash === a.hash && a.tick > 100, 'paused, bob stands on her very tick with her very state (the same hash)', { a: [a.tick, a.hash], b: [b.tick, b.hash, b.resyncs] });
	A(b.resyncs === 0, 'without ever having to run it again from the start');
	// an order given while paused reaches bob on the same tick
	await alice.key('KeyX', 300);
	await alice.E(() => { const T = window.__poketactica; T.td.T.paused = true; T.td.order({ t: 'place', fig: 2, x: 5, y: 6 }); });
	a = await alice.td();
	const three = await waitFor(async () => { const x = await bob.td(); return x.towers === 3 && x.tick === a.tick && x.hash === a.hash; }, 20000);
	A(three, 'a tower she places while paused appears on his board at the same tick', [a, await bob.td()]);

	// ---- a reload: the run resumes at its tick, paused
	const before = await alice.td();
	await alice.load();
	const home = await alice.E(() => window.__poketactica.hub.labels());
	A(/Resume Tower Defense/.test(home[0]) && /Meadow Loop/.test(home[0]), 'after a reload the camp offers Resume Tower Defense', home.slice(0, 2));
	await alice.key('KeyZ', 1200);
	a = await alice.td();
	A(a && a.mode === 'play' && a.tick === before.tick && a.hash === before.hash && a.towers === 3 && a.paused, 'resumed on the very tick and state it was left on, paused', { before: [before.tick, before.hash], after: a });
	// play on a little, then retire: rewards, the record, the replay
	await alice.E(() => { const T = window.__poketactica; T.td.T.paused = false; T.td.T.speed = 3; });
	await waitFor(async () => (await alice.td()).cleared >= 2, 90000);
	const stars0 = await alice.E(() => window.__poketactica.wallet());
	await alice.E(() => { window.__poketactica.td.order({ t: 'retire' }); });
	await sleep(600);
	const res = await alice.E(() => ({ shown: !document.getElementById('result').hidden, title: document.getElementById('r-title').textContent, body: document.getElementById('r-body').textContent.replace(/\s+/g, ' '), stars: window.__poketactica.wallet(), col: JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')), saved: localStorage.getItem('magepunk_poketactica_td_v1') }));
	A(res.shown && /Retired/.test(res.title) && /Wave \d+ cleared on Meadow Loop/.test(res.body) && /New record/.test(res.body), 'the results: the wave reached, a new record', res.body.slice(0, 200));
	A(res.stars > stars0 && res.col.td['td-loop'] >= 2 && Object.values(res.col.figs).some((f) => f.exp > 0) && res.saved === null, 'stars banked, the record kept, EXP on the towers, the saved run cleared', { stars: [stars0, res.stars], td: res.col.td });
	const rid = await waitFor(() => alice.E(() => !!window.__poketactica.P.replayId), 15000) ? await alice.E(() => window.__poketactica.P.replayId) : null;
	A(rid && await alice.E(() => [...document.querySelectorAll('#result .pt-rp')].some((x) => /Watch replay/.test(x.textContent))), 'its replay is stored: the results offer Watch replay', rid);
	const lib = await call('replay-library', {}, tokens.alice);
	A(JSON.stringify(lib).includes(rid) && /Tower Defense/.test(JSON.stringify(lib)), 'the replay library lists it, named', JSON.stringify(lib).slice(0, 300));
	// bob: the run is over, its replay offered
	const bobOver = await waitFor(() => bob.E(() => !document.getElementById('result').hidden && /run is over/i.test(document.getElementById('r-title').textContent) && /Watch the whole run/.test(document.getElementById('r-again').textContent)), 25000);
	A(bobOver, "bob: 'The run is over', and its replay is offered", await bob.E(() => document.getElementById('result').textContent.replace(/\s+/g, ' ').slice(0, 200)));
	A(!alice.errors.length && !bob.errors.length, 'no page errors (alice, bob)', [...alice.errors, ...bob.errors].slice(0, 3));

	// ---- the replay viewer (anyone, signed out)
	const end = await alice.td();
	const v = await open(null, '/poketactica/?replay=' + rid);
	let w = await v.td();
	A(w && w.mode === 'watch' && w.towers === 0 && await v.E(() => /Play|Pause/.test(document.getElementById('pt-td').textContent) && !document.querySelector('#pt-td [data-act="wave"]')), 'the replay opens in the viewer (signed out): from the start, with the viewer\'s buttons', w);
	await v.key('KeyC', 150); await v.key('KeyC', 150); await v.key('KeyC', 150);
	A((await v.td()).speed === 8, 'C: 1× → 2× → 4× → 8×');
	const done = await waitFor(async () => (await v.td()).ended, 120000);
	w = await v.td();
	A(done && w.tick === end.tick && w.hash === end.hash && w.over === 'retired', 'played through, it ends on the very state alice\'s run ended on', { w: [w.tick, w.hash, w.over], end: [end.tick, end.hash] });
	await v.key('ArrowLeft', 500);
	const back = await v.td();
	A(!back.ended && back.wave === Math.max(1, w.wave - 1) && back.tick < w.tick, '←: the start of the wave before', back);
	await v.key('KeyX', 500);
	A((await v.td()).tick === 0 && (await v.td()).towers === 0, 'X: the very start');
	await v.key('ArrowRight', 800);
	const w2 = await v.td();
	A(w2.wave === 1 && w2.towers === 2, '→: on to wave 1 (her first two towers are up)', w2);
	A((await v.td()).paused, 'back at the start it waits, paused');
	await v.key('KeyZ', 200);
	const p0 = (await v.td()).tick; await sleep(700);
	A(!(await v.td()).paused && (await v.td()).tick > p0, 'Z plays');
	await v.key('KeyZ', 200);
	const p1 = (await v.td()).tick; await sleep(500);
	A((await v.td()).paused && (await v.td()).tick === p1, 'Z pauses');
	// a clip link: ?t=<wave> starts there
	const clip = await open(null, '/poketactica/?replay=' + rid + '&t=2');
	const c = await clip.td();
	A(c && c.mode === 'watch' && c.wave === 2, 'a link with t=2 opens the replay at wave 2', c);
	A(!v.errors.length && !clip.errors.length, 'no page errors (the viewer)', [...v.errors, ...clip.errors].slice(0, 3));

	// ---- MAZE BUILDER (owner, 2026-11-24): the same recipe machinery with blocks, cards and gold in it. Alice plays one
	// through the camp; carol follows it live; a reload resumes it; its replay ends on the very state the run ended on.
	const mzOf = (p) => p.E(() => { const T = window.__poketactica; if (!T.td.T.S) return null; const v = T.td.view(); return { mode: v.mode, tick: v.tick, hash: T.td.hash(), blocks: (v.blocks || []).length, gold: v.gold, hand: (v.hand || []).length, towers: v.towers.length, wave: v.wave, cleared: v.cleared, pick: !!v.pick, way: (v.ways || []).map((w) => w.length - 1), view: T.td.T.mode, paused: T.td.T.paused, ended: !!T.td.T.ended, over: v.over }; });
	await alice.load();
	A(await alice.keyTo(/Tower Defense/) && await alice.keyTo(/Maze Builder/) && await alice.keyTo(/Open Field/) && await alice.keyTo(/Brock/), 'alice: Tower Defense, Maze Builder, Open Field, and Brock as her hero');
	await alice.key('KeyZ', 900);
	let ma = await mzOf(alice);
	A(ma && ma.mode === 'maze' && ma.gold === 60 && ma.hand === 5 && ma.way[0] === 11, 'Start!: a Maze Builder run (60 gold, 5 cards, the way 11 steps)', ma);
	// a wall across the way from a card of her own hand (wherever it may go), a figurine on it, the wave: by the page's own orders
	await alice.E(() => { const T = window.__poketactica, S = T.td.T.S; S.hand.push({ id: 'live-I', shape: 'I' }); });
	A(await alice.E(() => { const T = window.__poketactica; return T.td.order({ t: 'block', card: T.td.T.S.hand[0].id, turns: 0, x: 5, y: 6 }) === null; }), 'a block from the first card of her hand');
	// (a card put in her hand by the test is not in the recipe: the run is replayed from her orders, so only real cards may be played)
	await alice.E(() => { const T = window.__poketactica, S = T.td.T.S; S.hand = S.hand.filter((c) => c.id !== 'live-I'); const c = S.blocks[0].cells[0]; T.td.order({ t: 'place', fig: 0, x: c[0], y: c[1] }); T.td.order({ t: 'draw' }); T.td.order({ t: 'call' }); });
	ma = await mzOf(alice);
	A(ma.blocks === 1 && ma.towers === 1 && ma.gold === 60 - 20 - 5 && ma.hand === 5, 'a figurine on it (20 gold), a card drawn (5), the wave called', ma);
	const mzListed = await waitFor(async () => ((await call('live-friends', {}, tokens.bob)).live || []).some((f) => f.username === 'alice' && /Maze Builder · Open Field/.test(f.label)), 15000);
	A(mzListed, "bob's live-friends lists it as Maze Builder");
	const carol = await open('bob', '/poketactica/?spectate=alice');
	const mzFollowing = await waitFor(async () => { const b = await mzOf(carol); return b && b.view === 'follow' && b.mode === 'maze' && b.blocks === 1 && b.towers === 1; }, 20000);
	A(mzFollowing, 'a friend following live sees her block and her figurine on it', await mzOf(carol));
	await alice.E(() => { window.__poketactica.td.T.speed = 3; });
	await waitFor(async () => (await mzOf(alice)).cleared >= 1, 90000);
	await sleep(500);
	// the wave is cleared: the pick is up (a menu: paused). The follower stands on her very tick and state.
	ma = await mzOf(alice);
	const mzCaught = await waitFor(async () => { const b = await mzOf(carol); return b.tick === ma.tick && b.hash === ma.hash; }, 25000);
	A(ma.pick && mzCaught, 'wave 1 cleared, the reward pick is up; the follower is on her very tick with her very state (the same hash)', { a: [ma.tick, ma.hash], b: await mzOf(carol) });
	// a reload mid-build (the pick still waiting): resumed exactly
	await alice.load();
	const mzHome = await alice.E(() => window.__poketactica.hub.labels());
	A(/Resume Tower Defense/.test(mzHome[0]) && /Maze Builder · Open Field/.test(mzHome[0]), 'after a reload the camp offers to resume it, named Maze Builder', mzHome.slice(0, 1));
	await alice.key('KeyZ', 1200);
	const mr = await mzOf(alice);
	A(mr && mr.tick === ma.tick && mr.hash === ma.hash && mr.pick && mr.blocks === 1 && mr.gold === ma.gold && mr.hand === ma.hand && await alice.E(() => /Reward/.test(document.getElementById('pt-td').textContent)), 'resumed on the very tick and state: the block, the gold, the hand, and the pick still waiting (a Reward button)', mr);
	await alice.E(() => { const T = window.__poketactica, S = T.td.T.S; T.td.order({ t: 'pick', i: S.pick.opts.findIndex((o) => o && o.k !== 'cards') }); T.td.order({ t: 'retire' }); });
	await sleep(600);
	const mres = await alice.E(() => ({ shown: !document.getElementById('result').hidden, body: document.getElementById('r-body').textContent.replace(/\s+/g, ' '), col: JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1') || '{}') }));
	A(mres.shown && /Wave 1 cleared on Open Field/.test(mres.body) && mres.col.td['mz-field'] === 1, 'the results, and the map\'s own best wave kept', mres.body.slice(0, 160));
	const mEnd = await mzOf(alice);
	const mrid = await waitFor(() => alice.E(() => !!window.__poketactica.P.replayId), 15000) ? await alice.E(() => window.__poketactica.P.replayId) : null;
	A(!!mrid, 'its replay is stored');
	const mv = await open(null, '/poketactica/?replay=' + mrid);
	let mw = await mzOf(mv);
	A(mw && mw.view === 'watch' && mw.mode === 'maze' && mw.tick < 200, 'the replay opens in the viewer (signed out), near its start (it plays at once: the bare board is checked at X, below)', mw);
	await mv.key('KeyC', 150); await mv.key('KeyC', 150); await mv.key('KeyC', 150);
	const mdone = await waitFor(async () => (await mzOf(mv)).ended, 120000);
	mw = await mzOf(mv);
	A(mdone && mw.tick === mEnd.tick && mw.hash === mEnd.hash && mw.blocks === 1 && mw.over === 'retired', 'played through, it ends on the very state her run ended on (blocks, gold, hand and all)', { w: [mw.tick, mw.hash], end: [mEnd.tick, mEnd.hash] });
	{ const who = (p) => p.E(() => { const T = window.__poketactica, el = document.getElementById('td-hero'); return [T.td.T.S ? T.td.view().hero : 'no run', T.td.T.hero, el ? el.textContent.replace(/s+/g, ' ').trim() : 'no chip']; }); const w = [await who(mv), await who(carol)];
	A(w[0][0] === 'brock' && /Brock/.test(w[0][2]) && w[1][1] === 'brock', 'the replay and the follower play it as Brock, her hero', w); }
	await mv.key('KeyX', 500);
	A((await mzOf(mv)).blocks === 0 && (await mzOf(mv)).tick === 0, 'X: back to the very start, the board bare again');
	A(!alice.errors.length && !carol.errors.length && !mv.errors.length, 'no page errors (Maze Builder: alice, the follower, the viewer)', [...alice.errors, ...carol.errors, ...mv.errors].slice(0, 3));
} catch (e) { A(false, 'the run threw', e && e.stack); } finally { if (browser) await browser.close(); server.close(); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
