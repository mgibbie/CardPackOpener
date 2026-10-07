// decorations_test.mjs — the player's-room DECORATIONS of pokecrystal, end to end.
//
// #659 shipped a slice (the default TOWN MAP poster + FEATHERY BED); nothing
// could change them, the PC in PlayersHouse2F did nothing (`special
// PlayersHousePC` had no handler) and the console / doll / big-doll objects
// never showed. overworld/decorations.js now ports the PC's DECORATION menu
// (engine/overworld/decorations.asm) and the room it builds:
//   1. the PC turns on and offers DECORATION / TURN OFF
//   2. DECORATION lists only categories you own something in (no PLANT here),
//      and a category lists only the owned ones (RED CARPET, not BLUE)
//   3. PUT IT UP: a carpet, a console, a doll (LEFT SIDE), a big doll — then
//      EXIT ends the session TRUE and `iftrue .Warp` / `warp NONE` reloads the
//      room: the carpet's blocks are stamped, the objects show with their sprites
//   4. describedecoration: "It's an adorable SUPER NES." / "...PIKACHU DOLL." /
//      "A giant doll!"
//   5. it survives a page reload (magepunk_crystal_deco_v1)
//   6. PUT IT AWAY reverts the room; "That's already set up." for a repeat
//
//   node overworld/tests/decorations_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'/opt/chrome/chrome',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9239;
const STATE = { username: 'hdeco', friendCode: 'HDEC01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgeot', name: 'PIDGEOT', level: 40, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 120, atk: 80, def: 75, spa: 70, spd: 70, spe: 101 }, maxHP: 120, curHP: 120, exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18 }];
// owned: the new-game pair + a carpet, a console, a doll and a big doll
const OWNED = ['EVENT_DECO_BED_1', 'EVENT_DECO_POSTER_1', 'EVENT_DECO_CARPET_1', 'EVENT_DECO_SNES', 'EVENT_DECO_PIKACHU_DOLL', 'EVENT_DECO_BIG_SNORLAX_DOLL'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

let deco = { decos: {}, coords: {} };
try { deco = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld', 'crystal_decorations.json'), 'utf8')); } catch (e) { console.log('(no overworld/crystal_decorations.json)'); }

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') return res.end('{"ok":true}');
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
	await page.evaluateOnNewDocument((st, party, owned) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'johto'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_name', 'KRIS');
		const flags = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true };
		for (const f of owned) flags[f] = true;
		localStorage.setItem('magepunk_story', JSON.stringify({ flags, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY, OWNED);
	const W = f => page.evaluate(f);
	const MAP = 'PlayersHouse2F';
	const ready = async () => {
		for (let i = 0; i < 300 && !(await W(() => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === 'PlayersHouse2F')).catch(() => false)); i++) await sleep(100);
		await sleep(1500);
	};
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${MAP}&x=2&y=2`, { waitUntil: 'domcontentloaded' });
	await ready();

	// the room's grid / objects as the test sees them
	const room = () => page.evaluate(async () => {
		const g = window.__ow.world.current.layout.map;
		const cell = (x, y) => g[y][x];
		const objs = window.__ow.npcs.list.filter(n => n.deco).map(n => ({ gfx: n.ev.graphics_id, x: n.tx, y: n.ty, w: n.deco.w, sx: n.deco.sx }));
		return { carpetTop: [cell(0, 0), cell(1, 0), cell(0, 1), cell(1, 1)], carpetBottom: [0, 2, 4].map(x => [cell(x, 2), cell(x + 1, 2), cell(x, 3), cell(x + 1, 3)]), objs };
	});
	const choice = () => page.evaluate(async () => { const { choiceMenu } = await import('./choice.js'); return choiceMenu.open ? { options: choiceMenu.options.slice(), prompt: choiceMenu.prompt } : null; });
	// the dialog's pages are line arrays: flatten them to one string
	const dlg = () => W(() => window.__ow.dialog.blocking ? (window.__ow.dialog.pages || []).map(p => [].concat(p).join(' ')).join(' ') : null);
	// advance text until a menu opens (or nothing is up); returns everything said
	const talk = async () => {
		let said = '';
		for (let i = 0; i < 20; i++) {
			if (await choice()) break;
			const d = await dlg();
			if (!d) break;
			said += d;
			await page.keyboard.press('z'); await sleep(150);
		}
		return said;
	};
	const pick = async label => {
		const c = await choice();
		const i = c ? c.options.indexOf(label) : -1;
		if (i < 0) return false;
		await page.evaluate(async j => { (await import('./choice.js')).choiceMenu.idx = j; }, i);
		await page.keyboard.press('z'); await sleep(200);
		return true;
	};
	const stand = (x, y, facing) => page.evaluate((x, y, facing) => { const P = window.__ow.player; P.setTile(x, y); P.facing = facing; }, x, y, facing);
	const settle = async () => {
		for (let i = 0; i < 60; i++) {
			const busy = await page.evaluate(async () => (await import('./ow_state.js')).S.loading || window.__ow.cutscene.blocking || window.__ow.dialog.blocking);
			if (!busy) break;
			await sleep(100);
		}
		await sleep(600);
	};

	const before = await room();
	const red = deco.decos.DECO_RED_CARPET || {};

	// ===== 1. the PC =====
	await stand(2, 2, 'up');
	await page.keyboard.press('z'); await sleep(400);
	const on = await talk();
	A(/KRIS turned on\s+the PC\./.test(on), '1. the PC turns on ("KRIS turned on the PC.")', on);
	const pcMenu = await choice();
	A(pcMenu && pcMenu.options.join() === 'DECORATION,TURN OFF' && /What do you want/.test(pcMenu.prompt), '1. ...and asks what to do: DECORATION / TURN OFF', JSON.stringify(pcMenu));

	// ===== 2. only what you own =====
	await pick('DECORATION');
	const cats = await choice();
	A(cats && cats.options.join() === 'BED,CARPET,POSTER,GAME CONSOLE,ORNAMENT,BIG DOLL,EXIT', '2. DECORATION lists the owned categories + EXIT (no PLANT: none owned)', JSON.stringify(cats && cats.options));
	await pick('CARPET');
	const carpets = await choice();
	A(carpets && carpets.options.join() === 'RED CARPET,PUT IT AWAY,CANCEL', '2. CARPET lists RED CARPET only (BLUE/YELLOW/GREEN unowned) + PUT IT AWAY + CANCEL', JSON.stringify(carpets && carpets.options));

	// ===== 3. put it all up =====
	await pick('RED CARPET');
	const setRed = await talk();
	A(/Set up the\s+RED CARPET\./.test(setRed), '3. "Set up the RED CARPET."', setRed);
	await pick('GAME CONSOLE'); await pick('SUPER NES');
	const setSnes = await talk();
	A(/Set up the\s+SUPER NES\./.test(setSnes), '3. "Set up the SUPER NES."', setSnes);
	await pick('ORNAMENT');
	const dolls = await choice();
	A(dolls && dolls.options[0] === 'PIKACHU DOLL' && dolls.options.length === 3, '3. ORNAMENT lists PIKACHU DOLL', JSON.stringify(dolls && dolls.options));
	await pick('PIKACHU DOLL');
	const side = await choice();
	A(side && side.options.join() === 'RIGHT SIDE,LEFT SIDE,CANCEL' && /Which side do you\s+want to put it on\?/.test(side.prompt), '3. a doll asks "Which side do you want to put it on?"', JSON.stringify(side));
	await pick('LEFT SIDE');
	await talk();
	await pick('BIG DOLL'); await pick('BIG SNORLAX');
	await talk();
	await pick('BED'); await pick('FEATHERY BED');
	const already = await talk();
	A(/That's already set\s+up\./.test(already), '6. picking the bed that is up: "That\'s already set up."', already);
	await pick('EXIT');
	await settle();
	const up = await room();
	A(up.carpetTop.join() === (red.carpet || [[]])[0].join(), '3. EXIT reloads the room: the RED CARPET block at (0,0)', JSON.stringify(up.carpetTop));
	A(JSON.stringify(up.carpetBottom) === JSON.stringify([1, 2, 1].map(k => (red.carpet || [])[k])), '3. ...and block+1, +2, +1 along the bottom row (0,2)-(4,2)', JSON.stringify(up.carpetBottom));
	const obj = g => up.objs.find(o => o.gfx === g);
	A(obj('OBJ_EVENT_GFX_CONSOLE')?.w === 16 && obj('OBJ_EVENT_GFX_DOLL_1') && !obj('OBJ_EVENT_GFX_DOLL_2'), '3. the console and the LEFT doll show; the right doll slot stays empty', JSON.stringify(up.objs));
	A(obj('OBJ_EVENT_GFX_BIG_DOLL')?.w === 32, '3. the BIG SNORLAX shows as a 32x32 big doll', JSON.stringify(up.objs));
	let sprites = {};
	try { sprites = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld', 'deco_gfx', 'sprites.json'), 'utf8')); } catch (e) { console.log('(no overworld/deco_gfx/sprites.json)'); }
	const sx = s => sprites[s] ? sprites[s].x : -1;
	A(obj('OBJ_EVENT_GFX_CONSOLE')?.sx === sx('SPRITE_SNES') && obj('OBJ_EVENT_GFX_DOLL_1')?.sx === sx('SPRITE_PIKACHU') && obj('OBJ_EVENT_GFX_BIG_DOLL')?.sx === sx('SPRITE_BIG_SNORLAX'),
		'3. each wears its decoration sprite (SPRITE_SNES / SPRITE_PIKACHU / SPRITE_BIG_SNORLAX)', JSON.stringify(up.objs));
	if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });

	// ===== 4. describedecoration =====
	const read = async (x, y, facing) => { await stand(x, y, facing); await page.keyboard.press('z'); await sleep(400); const s = await dlg(); await talk(); await settle(); return s || ''; };
	A(/It's an adorable\s+SUPER NES\./.test(await read(4, 3, 'up')), '4. the console: "It\'s an adorable SUPER NES."');
	A(/It's an adorable\s+PIKACHU DOLL\./.test(await read(4, 5, 'up')), '4. the left doll: "It\'s an adorable PIKACHU DOLL."');
	A(/A giant doll! It's\s+fluffy and cuddly\./.test(await read(2, 2, 'left')), '4. the big doll (2x2 from (0,1)): "A giant doll! It\'s fluffy and cuddly."');

	// ===== 5. a reload keeps it =====
	await page.reload({ waitUntil: 'domcontentloaded' });
	await ready();
	const again = await room();
	A(again.carpetTop.join() === up.carpetTop.join() && again.objs.length === 3, '5. after a page reload the carpet and the three objects are still up', JSON.stringify(again));
	const saved = await W(() => JSON.parse(localStorage.getItem('magepunk_crystal_deco_v1') || 'null'));
	A(saved && saved.carpet === 'DECO_RED_CARPET' && saved.console === 'DECO_SNES' && saved.leftOrnament === 'DECO_PIKACHU_DOLL' && saved.bigDoll === 'DECO_BIG_SNORLAX_DOLL' && saved.bed === 'DECO_FEATHERY_BED',
		'5. ...saved in magepunk_crystal_deco_v1', JSON.stringify(saved));

	// ===== 6. put it away =====
	await stand(2, 2, 'up');
	await page.keyboard.press('z'); await sleep(400);
	await talk();
	await pick('DECORATION'); await pick('CARPET'); await pick('PUT IT AWAY');
	const away = await talk();
	A(/Put away the\s+RED CARPET\./.test(away), '6. "Put away the RED CARPET."', away);
	await pick('ORNAMENT'); await pick('PUT IT AWAY');
	A(/want to put away\?/.test((await choice())?.prompt || ''), '6. ORNAMENT > PUT IT AWAY asks "Which side do you want to put away?"');
	await pick('RIGHT SIDE');
	A(/There's nothing to\s+put away\./.test(await talk()), '6. the empty RIGHT SIDE: "There\'s nothing to put away."');
	await pick('EXIT');
	await settle();
	const down = await room();
	A(down.carpetTop.join() === before.carpetTop.join() && JSON.stringify(down.carpetBottom) === JSON.stringify(before.carpetBottom), '6. the room reloads with the floor as it was before the carpet', JSON.stringify(down));
	A(!errors.length, 'no page errors', errors.join(' | '));
} catch (e) {
	fail++; console.log('FAIL: test threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
