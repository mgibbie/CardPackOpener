// hoenn_bugs_1008_test.mjs — Instinct's 2026-10-08 Hoenn reports.
//
//   1. bug:1791420638753 Sky Pillar sealed after Wallace: ON_LOAD (which opens the
//      door) never ran, and #664's LOCKED_WARPS made the shut door real. ON_LOAD now
//      runs on every map with a script-lockable door; Mt. Ember / Ruin Valley too.
//
//   node overworld/tests/hoenn_bugs_1008_test.mjs
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
const PORT = 9300;
const STATE = { username: 'hoenn1008', friendCode: 'HOE108', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'venomoth', name: 'VENOMOTH', level: 72, gender: 'F', friend: 70, types: ['Bug', 'Poison'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	evs: { hp: 37, atk: 89, def: 108, spa: 56, spd: 48, spe: 172 },
	stats: { hp: 200, atk: 120, def: 120, spa: 150, spd: 130, spe: 160 }, maxHP: 200, curHP: 200,
	exp: 400000, moves: [{ id: 'surf', name: 'Surf', pp: 15, maxPp: 15 }], sprite: 's49.png', num: 49,
}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

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
const errors = [];
// a fresh page booted on `map` with this story; every scenario gets its own
async function open(map, x, y, { flags = {}, vars = {}, region = 'HOENN', extra = {} } = {}) {
	const page = await browser.newPage();
	page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, flags, vars, region, extra) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', region);
		localStorage.setItem('magepunk_name', 'MAY');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...flags }, vars }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
	}, STATE, PARTY, flags, vars, region, extra);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
	await sleep(1200);
	return page;
}
const passable = (page, x, y) => page.evaluate((x, y) => window.__ow.world.isPassable(x, y), x, y);

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// ===== 1. Sky Pillar / other ON_LOAD-opened locked doors =====
	{
		let p = await open('SkyPillar_Outside', 14, 6, { flags: { FLAG_WALLACE_GOES_TO_SKY_PILLAR: true }, vars: { VAR_SOOTOPOLIS_CITY_STATE: 4 } });
		A(await passable(p, 14, 5), '1. Sky Pillar: with FLAG_WALLACE_GOES_TO_SKY_PILLAR the door (14,5) is open');
		await p.close();
		p = await open('SkyPillar_Outside', 14, 6, {});
		A(!(await passable(p, 14, 5)), '1. Sky Pillar: before Wallace the door stays sealed');
		await p.close();
		p = await open('MtEmber_Exterior', 42, 41, { vars: { VAR_MAP_SCENE_ONE_ISLAND_POKEMON_CENTER_1F: 4 } });
		A(await passable(p, 42, 39), "1. Mt. Ember: the cave (42,39) opens once Celio's scene has advanced", JSON.stringify(await p.evaluate(() => window.__ow.world.current.name)));
		await p.close();
	}
	// ===== 2. Trainer Hill: the reception is talked to across its counter =====
	{
		const p = await open('TrainerHill_Entrance', 9, 6);
		const r = await p.evaluate(async () => {
			const O = window.__ow, P = O.player;
			P.facing = 'right';
			const counter = O.world.behaviorAt(10, 6);
			O.interact();
			await new Promise(r => setTimeout(r, 200));
			const text = O.dialog.pages ? O.dialog.pages.flat().join(' ') : '';
			return { counter, text };
		});
		A(r.counter === 0x80, '2. (10,6) in front of the attendant is a counter', JSON.stringify(r.counter));
		A(/Welcome to TRAINER HILL/.test(r.text), '2. facing the counter from the corridor opens the Trainer Hill sign-up', r.text.slice(0, 80));
		for (let i = 0; i < 8 && await p.evaluate(() => window.__ow.dialog.blocking); i++) { await p.keyboard.press('z'); await sleep(150); }
		A(await p.evaluate(() => !!window.__ow.hillRun), '2. ...and Z starts the challenge');
		await p.close();
	}
	// ===== 3. Slateport Harbor: Captain Stern isn't swallowed by the ferry =====
	{
		const p = await open('SlateportCity_Harbor', 6, 14, { flags: { FLAG_BADGE07_GET: true }, extra: { magepunk_bag_v1: { scanner: 1 } } });
		const r = await p.evaluate(async () => {
			const O = window.__ow; O.player.facing = 'up';
			O.interact();
			await new Promise(r => setTimeout(r, 300));
			return { ferry: O.openCanvasMenus ? JSON.stringify(O.openCanvasMenus()) : '', cut: !!O.cutscene.blocking, text: O.dialog.pages ? O.dialog.pages.flat().join(' ') : '' };
		});
		A(!/ferry/i.test(r.ferry) && (r.cut || r.text), '3. facing Captain Stern runs his own script, not the FERRY menu', JSON.stringify(r).slice(0, 160));
		// the attendant still runs the ferry
		const f = await p.evaluate(async () => {
			const O = window.__ow; O.player.tx = 8; O.player.ty = 11; O.player.x = 128; O.player.y = 176; O.player.facing = 'up';
			for (let i = 0; i < 20 && (O.dialog.blocking || O.cutscene.blocking); i++) { O.cutscene.stop?.(); O.dialog.close?.(); await new Promise(r => setTimeout(r, 50)); }
			O.interact();
			await new Promise(r => setTimeout(r, 200));
			return JSON.stringify(O.openCanvasMenus ? O.openCanvasMenus() : '');
		});
		A(/ferry/i.test(f), '3. ...while the ferry attendant still opens the FERRY menu', f);
		await p.close();
	}
	// ===== 4. the ferry menu's highlighted row is where you sail =====
	{
		const p = await open('SlateportCity_Harbor', 8, 11);
		const r = await p.evaluate(async () => {
			const O = window.__ow, MK = await import('./ow_menukeys.js');
			O.player.facing = 'up'; O.interact();
			await new Promise(r => setTimeout(r, 200));
			MK.pressKey('ArrowDown'); MK.pressKey('ArrowDown');
			await new Promise(r => setTimeout(r, 300));   // a frame draws the rows
			const sel = (O.menuUi || []).find(b => /^sail:/.test(b.id) && b.kbSel);
			const rows = (O.menuUi || []).filter(b => /^sail:/.test(b.id)).map(b => b.label);
			MK.pressKey('z');
			for (let i = 0; i < 60 && O.world.current.name === 'SlateportCity_Harbor'; i++) await new Promise(r => setTimeout(r, 100));
			const dest = MK.FERRY_DESTS.find(d => d.label === sel?.label);
			return { label: sel?.label, rows, want: dest?.file, got: O.world.current.name };
		});
		A(r.label && r.want === r.got, '4. the highlighted ferry row is the port you arrive at', JSON.stringify(r));
		A(!r.rows.some(l => /Battle Frontier|Faraway|Birth Island|Southern Island/.test(l)), '4. locked destinations are not drawn before they unlock', JSON.stringify(r.rows));
		await p.close();
	}
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split(String.fromCharCode(10)).slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
