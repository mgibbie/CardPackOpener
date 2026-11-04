// johkanto_gate_test.mjs — JohKanto opens only to the GRAND CHAMPION.
//
// OWNER RULE (2026-10-12): "the johkanto should only be unlocked after beating elite 4
// in every region". JohKanto (Crystal's Kanto: its 8 gyms, then MT SILVER and RED)
// used to open on the JOHTO crown (the Magnet Train ran again) and its doors never
// asked at all (johkanto_gate.js).
//   0. data: the JohKanto-only interiors list matches the map graph; the Victory Road
//      Gate stays a corridor (the JOHTO League's own path runs through it)
//   1. JOHTO champion only: the gate's door onto JohKanto Route 22 is solid and says
//      why; the MAGNET TRAIN warp and Fly into JohKanto are refused; the gate still
//      leads on to Victory Road; the objective points at the other two Leagues
//   2. GRAND CHAMPION: the door opens and a warp into JohKanto is allowed; the way in is
//      Crystal's (ELM's S.S. TICKET -> the S.S. AQUA; the POWER PLANT, not the crown,
//      restores the MAGNET TRAIN — ss_aqua_route_test), so the objective names ELM
//   3. a save already holding a JohKanto badge keeps its way in
//
//   node overworld/tests/johkanto_gate_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const DATA = path.join(ROOT, 'overworld', 'data');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9410;
const STATE = { username: 'jkgate', friendCode: 'JKGATE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 60, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 160, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 160, curHP: 160,
	exp: 216000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const GATE = /GRAND CHAMPION of KANTO,\s*JOHTO and HOENN/;

// ===== 0. data =====
{
	const reg = new Map();
	for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/map_regions.json'), 'utf8')))) for (const e of v) reg.set(e.name, k);
	const dir = path.join(DATA, 'maps'), stemOf = {}, maps = {};
	for (const f of fs.readdirSync(dir).filter(f => f.endsWith('_map.json'))) {
		const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
		const s = f.replace('_map.json', '');
		if (m.id) stemOf[m.id] = s;
		maps[s] = m;
	}
	let gate = null;
	try { gate = await import('../johkanto_gate.js'); } catch (e) { /* the module is new */ }
	const CORRIDORS = gate?.CORRIDORS || new Set(), JOHKANTO_ONLY = gate?.JOHKANTO_ONLY || new Set();
	const jk = s => reg.get(s) === 'JOHKANTO' && !CORRIDORS.has(s);
	const adj = new Map();
	const add = (a, b) => { if (!a || !b || a === b) return; (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); (adj.get(b) || adj.set(b, new Set()).get(b)).add(a); };
	for (const [s, m] of Object.entries(maps)) { for (const w of m.warp_events || []) add(s, stemOf[w.dest_map]); for (const c of m.connections || []) add(s, stemOf[c.map]); }
	// a small component of non-JohKanto maps whose only way out is INTO JohKanto
	const seen = new Set(), only = new Set();
	for (const s of Object.keys(maps)) {
		if (jk(s) || seen.has(s)) continue;
		const comp = [], q = [s]; seen.add(s);
		while (q.length) { const x = q.pop(); comp.push(x); for (const y of adj.get(x) || []) if (!jk(y) && !seen.has(y)) { seen.add(y); q.push(y); } }
		if (comp.length < 20 && comp.some(x => [...(adj.get(x) || [])].some(jk))) comp.forEach(x => only.add(x));
	}
	A(!!gate && [...only].sort().join() === [...JOHKANTO_ONLY].sort().join(), '0. JOHKANTO_ONLY = the interiors reachable only from JohKanto', [...only].sort().join());
	A(reg.get('JohKantoVictoryRoadGate') === 'JOHKANTO' && CORRIDORS.has('JohKantoVictoryRoadGate')
		&& (maps.JohKantoVictoryRoadGate?.warp_events || []).some(w => w.dest_map === 'MAP_VICTORY_ROAD'),
		'0. the Victory Road Gate (filed JOHKANTO) is a corridor on the JOHTO League path');
}

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
	// one fresh page per scenario, seeded with its own badge state
	const boot = async (badges, map) => {
		const page = await browser.newPage();
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, party, badges) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'johto');
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, crystal_events_seeded: true }, vars: {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}, STATE, PARTY, badges);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
		return { page, errors };
	};
	const W = (page, f, ...a) => page.evaluate(f, ...a);
	const here = page => W(page, () => window.__ow.world.current.name);
	const waitMap = async (page, m) => { for (let i = 0; i < 60 && (await here(page)) !== m; i++) await sleep(100); await sleep(300); return here(page); };
	const dialogText = page => W(page, () => { const d = window.__ow.dialog; return d.pages ? d.pages.flat().join(' ') : ''; });
	const closeDialog = page => W(page, async () => { const d = window.__ow.dialog; for (let i = 0; i < 20 && d.blocking; i++) { d.revealed = 1e9; d.key('x'); await new Promise(r => setTimeout(r, 40)); } });
	const JOHTO_CROWN = { badges: { JOHTO: { zephyr: true, hive: true, plain: true, fog: true, storm: true, mineral: true, glacier: true, rising: true } }, champion: { JOHTO: true } };

	// ===== 1. JOHTO champion only =====
	{
		const { page, errors } = await boot(JOHTO_CROWN, 'JohKantoVictoryRoadGate');
		A(await here(page) === 'JohKantoVictoryRoadGate', '1. boot in the Victory Road Gate (a corridor)');
		// the door onto JohKanto Route 22 at (17,7): stand west of it and walk east
		await W(page, () => { const P = window.__ow.player; P.setTile(16, 7); P.facing = 'right'; });
		await page.keyboard.down('ArrowRight'); await sleep(450); await page.keyboard.up('ArrowRight'); await sleep(600);
		const r1 = { map: await here(page), x: await W(page, () => window.__ow.player.tx), text: await dialogText(page) };
		A(r1.map === 'JohKantoVictoryRoadGate' && r1.x === 16, '1. the door onto JohKanto ROUTE 22 is solid before the GRAND CHAMPION crown', JSON.stringify(r1));
		A(GATE.test(r1.text), '1. ...and bumping it says why', r1.text);
		await closeDialog(page);
		// the JOHTO League's own path through the gate still works: on to Victory Road
		await W(page, () => window.__ow.warpTo('MAP_VICTORY_ROAD', 0));
		A(await waitMap(page, 'VictoryRoad') === 'VictoryRoad', '1. the gate still leads on to VICTORY ROAD (the JOHTO League path)');
		// the MAGNET TRAIN: its scripted warp from Goldenrod is refused
		await W(page, () => window.__ow.moveToMap('GoldenrodMagnetTrainStation', 8, 10));
		await waitMap(page, 'GoldenrodMagnetTrainStation');
		await W(page, () => window.__ow.warpTo('MAP_JOHKANTO_SAFFRON_MAGNET_TRAIN_STATION', 0));
		await sleep(700);
		const r2 = { map: await here(page), text: await dialogText(page) };
		A(r2.map === 'GoldenrodMagnetTrainStation' && GATE.test(r2.text), '1. the MAGNET TRAIN to SAFFRON is refused, with the reason', JSON.stringify(r2));
		await closeDialog(page);
		// Fly into JohKanto: refused
		await W(page, () => window.__ow.flyTo('MAP_JOHKANTO_VIRIDIAN_CITY', 23, 26));
		await sleep(700);
		const r3 = { map: await here(page), text: await dialogText(page) };
		A(r3.map === 'GoldenrodMagnetTrainStation' && GATE.test(r3.text), '1. FLY into JohKanto is refused', JSON.stringify(r3));
		await closeDialog(page);
		const obj = await W(page, () => window.__ow.postgameObjective());
		A(/KANTO and HOENN POKeMON LEAGUES/.test(obj || '') && !/MAGNET TRAIN runs again/.test(obj || ''), '1. the objective points at the other two LEAGUES, not the Magnet Train', obj);
		A(!(await W(page, () => window.__ow.Story.getFlag('EVENT_RESTORED_POWER_TO_KANTO'))), '1. the Magnet Train has no power yet');
		A(errors.length === 0, '1. no page errors', JSON.stringify(errors.slice(0, 3)));

		// ===== 2. GRAND CHAMPION =====
		await W(page, () => { window.__ow.Badges.crown('KANTO'); window.__ow.Badges.crown('HOENN'); window.__ow.grantGrandChampionReward(); });
		A(!(await W(page, () => window.__ow.Story.getFlag('EVENT_RESTORED_POWER_TO_KANTO'))) && await W(page, () => window.__ow.Story.getFlag('EVENT_BEAT_ELITE_FOUR')),
			'2. the GRAND CHAMPION crown is Crystal\'s HALL OF FAME (EVENT_BEAT_ELITE_FOUR); the MAGNET TRAIN\'s power waits for the POWER PLANT');
		await W(page, () => window.__ow.warpTo('MAP_JOHKANTO_SAFFRON_MAGNET_TRAIN_STATION', 0));
		A(await waitMap(page, 'JohKantoSaffronMagnetTrainStation') === 'JohKantoSaffronMagnetTrainStation', '2. ...and a warp into JohKanto is no longer refused');
		await W(page, () => window.__ow.moveToMap('JohKantoVictoryRoadGate', 16, 7));
		await waitMap(page, 'JohKantoVictoryRoadGate');
		A(await W(page, () => !window.__ow.player.blocked(17, 7)), '2. the door onto JohKanto ROUTE 22 opens');
		const obj2 = await W(page, () => window.__ow.postgameObjective());
		A(/PROF\. ELM/.test(obj2 || '') && /S\.S\. AQUA/.test(obj2 || ''), '2. the objective now sends you to PROF. ELM and the S.S. AQUA', obj2);
		await page.close();
	}

	// ===== 3. grandfathered: a JohKanto badge already earned =====
	{
		const st = JSON.parse(JSON.stringify(JOHTO_CROWN)); st.badges.JOHKANTO = { boulder: true };
		const { page, errors } = await boot(st, 'GoldenrodMagnetTrainStation');
		await W(page, () => window.__ow.warpTo('MAP_JOHKANTO_SAFFRON_MAGNET_TRAIN_STATION', 0));
		A(await waitMap(page, 'JohKantoSaffronMagnetTrainStation') === 'JohKantoSaffronMagnetTrainStation', '3. a save already holding a JohKanto badge keeps its way in');
		A(errors.length === 0, '3. no page errors', JSON.stringify(errors.slice(0, 3)));
		await page.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
