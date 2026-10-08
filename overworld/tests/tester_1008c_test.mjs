// tester_1008c_test.mjs — two 2026-10-08 tester reports (Instinct).
//
//   1. bug:1791491961485 — AERIAL ACE missed twice after the foe's Minimize.
//      moves_battle.json writes the never-miss moves' accuracy as a plain 100, so
//      they took the ordinary accuracy/evasion roll. battle.js's NEVER_MISS set now
//      skips the roll for them (and TOXIC from a Poison type); a target hidden by
//      Dig/Fly/Dive still can't be reached.
//   2. bug:1791492820466 — DIVE at Route 128's north edge (26,0) kept the tile on
//      Underwater_Route128, where it is boxed in; the stranded watchdog then moved
//      the player to (29,-3), OUTSIDE the layout (off the edge, gridAt reads the
//      connected map). Now the dive is refused there (Emerald dives only from deep
//      water over open seabed), and findLanding never leaves the current map.
//
//   node overworld/tests/tester_1008c_test.mjs
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
const PORT = 9330;
const STATE = { username: 'neverm', friendCode: 'NEVRM1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
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
	await page.evaluateOnNewDocument(st => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route128&x=26&y=0`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.world?.current?.name === 'Route128')).catch(() => false)); i++) await sleep(100);
	await sleep(1200);

	// ===== 1. never-miss moves =====
	await page.evaluate(async () => {
		const B = await import('./battle.js'), S = (await import('./ow_state.js')).S, P = await import('./ow_places.js'), O = window.__ow;
		S.party = [B.buildMon('pidgeot', 54, O.battle.data), B.buildMon('swampert', 54, O.battle.data)];
		const rr = Math.random; Math.random = () => 0.5;
		try { P.startWildBattle({ id: 'staryu', level: 33 }, false); } finally { Math.random = rr; }
		for (let i = 0; i < 100 && !O.battle.active; i++) await new Promise(r => setTimeout(r, 50));
		window.__msgs = [];
		const orig = O.battle.pushMsg.bind(O.battle);
		O.battle.pushMsg = (text, fn, ifAlive) => { if (text) window.__msgs.push(text); return orig(text, fn, ifAlive); };
	});
	// one move at +6 evasion (Minimize x3), with the roll pinned to a near-certain miss
	const use = (id, opts = {}) => page.evaluate((id, opts) => {
		const b = window.__ow.battle, a = b.active, mv = { id, name: b.data.moves[id]?.name || id, pp: 30, maxPp: 30 };
		a.foe.curHP = a.foe.maxHP = 999; a.foe.vanished = opts.vanished || null;
		a.foeBoosts.eva = 6;
		const types = a.me.types; if (opts.types) a.me.types = opts.types;
		window.__msgs = [];
		const rr = Math.random; Math.random = () => 0.99;
		try { b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, mv, false); } finally { Math.random = rr; a.me.types = types; a.foe.vanished = null; }
		return window.__msgs.slice();
	}, id, opts);
	const missed = l => l.some(x => /missed/.test(x));
	const ace = await use('aerialace');
	A(ace.some(x => /used Aerial Ace/.test(x)) && !missed(ace), '1. AERIAL ACE never misses, even against +6 evasion', JSON.stringify(ace));
	const tackle = await use('tackle');
	A(missed(tackle), '1. control: TACKLE at +6 evasion on the same roll misses', JSON.stringify(tackle));
	for (const id of ['swift', 'shockwave', 'magicalleaf', 'shadowpunch', 'aurasphere']) {
		const l = await use(id);
		A(!missed(l), `1. ${id} never misses either`, JSON.stringify(l));
	}
	const dug = await use('aerialace', { vanished: 'dig' });
	A(missed(dug), '1. ...but it still can\'t reach a foe hidden underground by DIG', JSON.stringify(dug));
	const tox = await use('toxic', { types: ['Poison'] });
	A(!missed(tox), '1. TOXIC from a Poison type never misses', JSON.stringify(tox));
	await page.evaluate(async () => { const b = window.__ow.battle; b.finish('escaped'); for (let i = 0; i < 200 && b.active; i++) { b.update(0.1); await new Promise(r => setTimeout(r, 10)); } });

	// ===== 2. DIVE at Route 128's north edge =====
	const dive = async (x, y) => page.evaluate(async (x, y) => {
		const F = await import('./ow_fieldmoves.js'), O = window.__ow;
		if (O.world.current.name !== 'Route128') { await O.moveToMap('Route128', x, y); }
		O.player.setTile(x, y); O.player.surfing = true;
		O.dialog.close?.();
		const ok = await F.diveTo('dive');
		await new Promise(r => setTimeout(r, 300));
		const d = O.dialog.pages ? O.dialog.pages.flat().join(' ') : '';
		const lay = O.world.current.layout;
		return { ok, map: O.world.current.name, x: O.player.tx, y: O.player.ty, w: lay.width, h: lay.height, dialog: d };
	}, x, y);
	const edge = await dive(26, 0);
	A(edge.ok === false && edge.map === 'Route128' && edge.x === 26 && edge.y === 0, '2. DIVE at Route 128 (26,0) is refused: the seabed below is walled', JSON.stringify(edge));
	A(/can't DIVE here/.test(edge.dialog), '2. ...and says so', JSON.stringify(edge.dialog));
	await page.evaluate(() => { for (let i = 0; i < 5 && window.__ow.dialog.blocking; i++) window.__ow.dialog.key?.('z'); window.__ow.dialog.close?.(); });
	// a real dive spot still works
	let good = null;
	for (const [x, y] of [[26, 10], [30, 15], [20, 20], [40, 20], [50, 25], [35, 30]]) {
		const r = await dive(x, y);
		await page.evaluate(() => { window.__ow.dialog.close?.(); });
		if (r.ok) { good = r; break; }
	}
	A(good && good.map === 'Underwater_Route128', '2. control: diving over open seabed still lands on Underwater_Route128', JSON.stringify(good));
	// the watchdog's landing search never leaves the current map
	const land = await page.evaluate(async () => {
		const T = await import('./ow_transitions.js'), O = window.__ow;
		if (O.world.current.name !== 'Underwater_Route128') await O.moveToMap('Underwater_Route128', 26, 0);
		const [x, y] = T.findLanding(26, 0), lay = O.world.current.layout;
		return { x, y, w: lay.width, h: lay.height, map: O.world.current.name };
	});
	A(land.x >= 0 && land.y >= 0 && land.x < land.w && land.y < land.h, '2. findLanding from Underwater_Route128 (26,0) stays inside the 120x40 layout (was (29,-3))', JSON.stringify(land));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
