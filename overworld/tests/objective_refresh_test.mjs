// objective_refresh_test.mjs — the NEXT: objective line went stale after a
// legendary catch (playtest 2026-10-15, bug:1792100013778-instinctloretest0918).
//
// Caught RAGING BOLT; the footer kept reading "100 legendary POKeMON still hide
// ... (3/103). Rumor places RAGING BOLT in AQUA HIDEOUT 1F" until a reload.
// refreshObjective() ran only on a map change and a few named story beats, but
// the line is derived from the save (badges, flags, the dex) — which changes in
// many more places. The loop now re-derives it about once a second (writing the
// DOM only when the text differs).
//
//   1. the postgame hunt line shows a count and a rumor
//   2. catching the rumored legendary through the real encounter (no map change)
//      moves the count on by one and the rumor off the caught one
//   3. any other change to its inputs (a flag) shows up too, without a map change
//
// Covers: overworld/main.js, overworld/ow_loop.js, overworld/ow_postgame.js, overworld/ow_follower.js
//   node overworld/tests/objective_refresh_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9276;
const STATE = { username: 'objrefresh', friendCode: 'OBJR01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'lapras', name: 'A', level: 90, gender: 'M', friend: 70, types: ['Water', 'Ice'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 300, atk: 150, def: 150, spa: 150, spd: 150, spe: 150 }, maxHP: 300, curHP: 300,
	exp: 700000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's131.png', num: 131,
}];
const all = ids => Object.fromEntries(ids.map(i => [i, true]));
const BADGES = {
	badges: {
		JOHTO: all(['zephyr', 'hive', 'plain', 'fog', 'storm', 'mineral', 'glacier', 'rising']),
		KANTO: all(['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth']),
		HOENN: all(['stone', 'knuckle', 'dynamo', 'heat', 'balance', 'feather', 'mind', 'rain']),
		JOHKANTO: all(['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth']),
	},
	champion: { JOHTO: true, KANTO: true, HOENN: true },
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const parse = t => { const m = /(\d+) legendary POKeMON still hide.*\((\d+)\/(\d+)\)\.\s*Rumor places (.+?) in (.+?)\.?$/.exec(t || ''); return m ? { left: +m[1], caught: +m[2], total: +m[3], who: m[4], where: m[5] } : null; };

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, badges) => {
		if (localStorage.getItem('magepunk_mp_token_v1')) return;
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_region', 'JOHTO');
		localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, beat_red: true }, vars: {} }));
	}, STATE, PARTY, BADGES);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.world.current)).catch(() => false)); i++) await sleep(100);
	await sleep(1200);
	const objective = () => page.evaluate(() => document.getElementById('objective')?.textContent || '');

	// ===== 1. the hunt line =====
	const before = parse(await objective());
	A(before && before.left === before.total - before.caught, '1. the postgame line counts the hunt and names a rumor', await objective());

	// ===== 2. catch the rumored legendary for real, on the spot =====
	const caught = await page.evaluate(async () => {
		const O = window.__ow, b = O.battle;
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const Dex = await import('./pokedex.js');
		// the rumor names the first uncaught entry of the registry
		const [mapId, e0] = Object.entries(O.LEGENDARY_ENCOUNTERS).find(([, e]) => !Dex.isCaught((Array.isArray(e) ? e[0] : e).species));
		const e = Array.isArray(e0) ? e0[0] : e0;
		const map0 = O.world.current.name;
		O.startLegendaryBattle(e);
		for (let i = 0; i < 200 && !(b.active && ['menu', 'choose'].includes(b.active.phase)); i++) { if (O.dialog.blocking) press('z'); await new Promise(r => setTimeout(r, 60)); }
		const a = b.active;
		if (!a) return { started: false, species: e.species };
		a.caughtMon = a.foe;
		b.finish('caught');
		for (let i = 0; i < 200 && b.blocking; i++) await new Promise(r => setTimeout(r, 60));
		for (let i = 0; i < 20; i++) { if (O.dialog.blocking) press('x'); press('Escape'); await new Promise(r => setTimeout(r, 60)); }
		return { started: true, species: e.species, mapId, dexCaught: Dex.isCaught(e.species), sameMap: O.world.current.name === map0 };
	});
	A(caught.started && caught.dexCaught && caught.sameMap, '2. the rumored legendary is caught through its encounter, without leaving the map', JSON.stringify(caught));
	await sleep(1600);
	const after = parse(await objective());
	A(after && after.caught === before.caught + 1 && after.left === before.left - 1,
		'2. the count moves on at once — no reload, no map change', JSON.stringify({ before, after }));
	A(after && after.who.toLowerCase() !== caught.species && after.who !== before.who,
		'2. ...and the rumor moves off the legendary just caught', JSON.stringify({ before: before?.who, after: after?.who, caught: caught.species }));

	// ===== 3. any input change: un-beat RED (a flag) and the line follows =====
	await page.evaluate(() => window.__ow.Story.clearFlag('beat_red'));
	await sleep(1600);
	const red = await objective();
	A(/RED waits at the summit/i.test(red), '3. a changed flag re-derives the line too', red);

	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
