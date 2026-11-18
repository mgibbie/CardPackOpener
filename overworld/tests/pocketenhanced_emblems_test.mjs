// pocketenhanced_emblems_test.mjs — emblems (owner's second improvement list, 2026-11-18, "yes to all": "Emblems and
// achievements … 'Win with every type', 'Complete Genetic Apex', 'Beat all 24 Gym Leaders', 'Reach 1400 ranked'. They'd
// show on your profile"). pocketenhanced/js/emblems.js, solo.js (progress.emblems), save.js (record.types), main.js.
//   1. the emblems: unique ids; each met only by its own numbers (First Win at 1 win, Every Type with all 8 types, Card
//      Champion at all 24 leaders, Ranked 1400 at 1400, Set Complete when a set's 100% is paid); one already earned is
//      not earned again
//   2. kept on the account: the progress keeps them (bad ids dropped), a merge of two devices is their union, two copies
//      that differ only by an emblem are not the same, and the SERVER keeps them through pksolo-put / get
//   3. the page: winning a first match says "Emblem earned: First Win" on the result; the record counts the win under
//      the deck's Energy type; the main menu says Emblems (1 / 18); an earned emblem can be chosen and is then shown
//      beside my name on the table; one not earned cannot be chosen
//   node overworld/tests/pocketenhanced_emblems_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import { makeAsserter, startServer, launch, sleep, waitFor } from './ow_controls_lib.mjs';
import { EMBLEMS, newEmblems } from '../../pocketenhanced/js/emblems.js';
import * as SO from '../../pocketenhanced/js/solo.js';

const R = makeAsserter(), A = R.A;
const zero = { won: 0, onlineWon: 0, typeWins: {}, soloCleared: 0, soloTotal: 509, gymsBeaten: 0, gymsTotal: 24, setsDone: 0, unique: 0, opened: 0, rating: 0 };
// ===== 1 =====
A(new Set(EMBLEMS.map(e => e.id)).size === EMBLEMS.length && EMBLEMS.length === 18, '18 emblems (Weekly Champion the 18th), each its own id');
A(newEmblems(SO.newProgress(), zero).length === 0, 'nothing done: no emblem');
A(newEmblems(SO.newProgress(), { ...zero, won: 1 }).join() === 'win1', 'one win: First Win only');
A(!newEmblems(SO.newProgress(), { ...zero, typeWins: { Grass: 1, Fire: 1, Water: 1, Lightning: 1, Psychic: 1, Fighting: 1, Darkness: 1 } }).includes('types') && newEmblems(SO.newProgress(), { ...zero, typeWins: { Grass: 1, Fire: 1, Water: 1, Lightning: 1, Psychic: 1, Fighting: 1, Darkness: 1, Metal: 1 } }).includes('types'), 'Every Type: 7 types no, all 8 yes');
A(newEmblems(SO.newProgress(), { ...zero, gymsBeaten: 23 }).join() === 'gym8' && newEmblems(SO.newProgress(), { ...zero, gymsBeaten: 24 }).join() === 'gym8,gymall', 'leaders: 23 is Badge Case; all 24 adds Card Champion');
A(newEmblems(SO.newProgress(), { ...zero, rating: 1399 }).join() === 'rank1200' && newEmblems(SO.newProgress(), { ...zero, rating: 1400 }).join() === 'rank1200,rank1400', 'ranked: 1399 is 1200 only; 1400 both');
A(newEmblems(SO.newProgress(), { ...zero, setsDone: 1 }).join() === 'set1', 'a set completed: Set Complete');
A(newEmblems({ ...SO.newProgress(), emblems: { win1: 1 } }, { ...zero, won: 3 }).length === 0, 'one already earned is not earned again');
// ===== 2 =====
{
	const p = SO.cleanProgress({ ...SO.newProgress(), emblems: { win1: 1, 'BAD ID!': 1, gym8: 0 } });
	A((p.emblems || {}).win1 === 1 && Object.keys(p.emblems || {}).join() === 'win1', 'the progress keeps an emblem; a bad id or a 0 is dropped', p.emblems);
	const m = SO.mergeProgress({ ...SO.newProgress(), emblems: { win1: 1 } }, { ...SO.newProgress(), emblems: { gym8: 1 } });
	A(Object.keys(m.emblems || {}).sort().join() === 'gym8,win1', 'two devices merged: both emblems', m.emblems);
	A(!SO.sameProgress({ ...SO.newProgress(), emblems: { win1: 1 } }, SO.newProgress()), 'a copy with an emblem more is not the same copy (so it is sent)');
	A(!!SO.readProgress({ ...SO.newProgress(), emblems: { win1: 1 } }), 'the account reads a progress with emblems');
	// the server, over sqlite
	const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
	const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
	const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
	const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-emb-')), 'mp.bundle.mjs');
	buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
	const { default: handler } = await import(pathToFileURL(bundle).href);
	let ipN = 0;
	const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.5.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB })).json();
	const tok = (await call('register', { username: 'emb', password: 'pocket-emb-pass' })).token;
	const put = await call('pksolo-put', { rev: 0, solo: { ...SO.newProgress(), emblems: { win1: 1, gym8: 1 } } }, tok);
	const got = await call('pksolo-get', {}, tok);
	A(put.ok && got.solo && Object.keys(got.solo.emblems || {}).sort().join() === 'gym8,win1', 'the server keeps the emblems (pksolo-put, then -get)', { put, got: got.solo && got.solo.emblems });
}
// ===== 3. the page =====
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
	await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); });
	await page.goto(`http://localhost:${port}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500);
	const win = seed => page.evaluate(async seed => {
		const P = window.__pocket; P.fast && P.fast(true); P.start({ players: 2, seed });
		const { nextAction } = await import('/pocketenhanced/js/ai.js');
		for (let n = 0; n < 3000 && !P.state().over; n++) { const S = P.state();
			if (S.phase === 'main' && S.turn >= 3) { await P.act({ t: 'concede', seat: 1 }); continue; }
			const seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup) || {}).seat : S.current; if (seat !== 0) { await new Promise(r => setTimeout(r, 10)); continue; }
			const banned = new Set(); for (let k = 0; k < 20; k++) { const a = nextAction(P.engine.view(S, 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; if (await P.act(a) !== false) break; banned.add(JSON.stringify(a)); } await new Promise(r => setTimeout(r, 10)); }
		return { w: P.state().over && P.state().over.winner, energy: P.recipe().config.players[0].energy };
	}, seed);
	const r1 = await win('emb1');
	await waitFor(() => page.evaluate(() => !!document.querySelector('.modal .pe-end')), 8000);
	const end = await page.evaluate(() => (document.querySelector('.pe-emblem-new') || {}).textContent || '');
	A(r1.w === 0 && /Emblem earned: First Win/.test(end), 'a first win: "Emblem earned: First Win" on the result', [r1, end]);
	const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_pocket_record_v1') || '{}'));
	A(r1.energy.every(t => (rec.types || {})[t] === 1), "the record counts the win under the deck's Energy type", { energy: r1.energy, types: rec.types });
	await page.evaluate(() => document.querySelector('.modal [data-k="leave"]').click()); await sleep(400);
	const menu = await page.evaluate(() => (document.querySelector('[data-k="emblems"]') || {}).textContent || '');
	A(/Emblems \(1 \/ 18\)/.test(menu), 'the main menu: "Emblems (1 / 18)"', menu);
	await page.evaluate(() => document.querySelector('[data-k="emblems"]').click()); await sleep(300);
	const st = await page.evaluate(() => ({ win1: !document.querySelector('[data-k="emwin1"]').disabled, gymall: !document.querySelector('[data-k="emgymall"]').disabled }));
	A(st.win1 && !st.gymall, 'First Win can be chosen; Card Champion (not earned) cannot', st);
	await page.evaluate(() => document.querySelector('[data-k="emwin1"]').click()); await sleep(200);
	A(await page.evaluate(() => /\(shown\)/.test(document.querySelector('[data-k="emwin1"]').textContent) && JSON.parse(localStorage.getItem('magepunk_pocket_prefs_v1')).emblem === 'win1'), 'chosen: "(shown)"');
	await page.evaluate(() => { while (document.querySelector('.modal')) { const b = [...document.querySelectorAll('[data-k="back"]')].pop(); if (!b) break; b.click(); } });
	await page.evaluate(() => window.__pocket.start({ players: 2, seed: 'emb2' })); await sleep(800);
	const head = await page.evaluate(() => [...document.querySelectorAll('.pe-head .nm')].map(e => ({ t: e.textContent, emb: !!e.querySelector('.pe-emb') })));
	A(head.filter(x => x.emb).length === 1 && head.find(x => x.emb).t.includes('(you)'), 'on the table: the emblem beside my name only', head);
	A(!errors.length, 'no page errors', errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
