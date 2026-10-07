// retired_games_test.mjs — the port's stand-in games retire where Crystal's own
// now run (#659 ported SlotMachine / CardFlip / UnownPuzzle).
//
//   1. source: the Ruins of Alph chambers lose the 3x3 slide-puzzle zone, and
//      each chamber's WallOpenScript gets its (4,0) changeblock back
//   2. Game Corners: Crystal's Goldenrod and JohKanto Celadon hubs no longer
//      offer the generic slots (their floors have Crystal's machines — a slot
//      sign opens special SlotMachine); FireRed's Celadon and Emerald's
//      Mauville keep them (those decomps' slot machines aren't ported)
//   3. Ruins of Alph: the replica wall reads Crystal's sign instead of dealing
//      the slide puzzle, and the item room behind each chamber's (4,0) wall is
//      reached the decomp way (engine/events/unown_walls.asm): sealed until
//      Ho-Oh leads the party / a WATER STONE is carried / FLASH is used in the
//      Aerodactyl chamber / an ESCAPE ROPE is used in the Kabuto chamber
//
//   node overworld/tests/retired_games_test.mjs
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
const PORT = 9238;
const STATE = { username: 'retired', friendCode: 'RETIR1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (speciesId, name, num) => ({
	speciesId, name, level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num,
});
const PARTY = [mon('rattata', 'LEAD', 19)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const CHAMBERS = ['Kabuto', 'Omanyte', 'Aerodactyl', 'HoOh'];

// ===== 1. source =====
{
	const sv = fs.readFileSync(path.join(ROOT, 'overworld/services.js'), 'utf8');
	A(!/ruinspuzzle/.test(sv) && !fs.existsSync(path.join(ROOT, 'overworld/slidepuzzle.js')), '1. the 3x3 slide puzzle and its replica-wall zone are gone');
	const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/crystal_scriptvar_data.json'), 'utf8')).patches;
	const opens = CHAMBERS.map(c => (p[`RuinsOfAlph${c}Chamber`] || {})[`RuinsOfAlph${c}ChamberWallOpenScript`] || []);
	A(opens.every(o => o.some(op => op.op === 'changeblock' && op.x === 4 && op.y === 0)), '1. every chamber\'s WallOpenScript opens the (4,0) wall', JSON.stringify(opens));
}

// ===== 2 + 3. live =====
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
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'JOHTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		localStorage.setItem('magepunk_bag_v1', JSON.stringify({ pokeball: 5, coincase: 1 }));
		localStorage.setItem('magepunk_coins_v1', '100');
	}, STATE, PARTY);
	const W = (f, ...a) => page.evaluate(f, ...a);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const place = (x, y, facing) => W((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.px = x * 16; P.py = y * 16; P.facing = f; }, x, y, facing);
	const mapName = () => W(() => window.__ow.world.current && window.__ow.world.current.name);
	const settle = async () => {
		for (let i = 0; i < 80; i++) {
			const s = await W(() => ({ d: window.__ow.dialog.blocking, c: window.__ow.cutscene.blocking, s: window.__ow.crystalSlots && window.__ow.crystalSlots.open }));
			if (!s.d && !s.c && !s.s) return true;
			if (s.d) { await page.keyboard.press('z'); await sleep(60); }
			if (s.s) { await page.keyboard.press('x'); await sleep(60); }
			await sleep(60);
		}
		return false;
	};
	const flag = f => W(async f => (await import('./events.js')).getFlag(f), f);

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=GoldenrodGameCorner&x=5&y=8`, { waitUntil: 'domcontentloaded' });
	await boot('GoldenrodGameCorner');

	// ---------- 2. the Game Corner hubs ----------
	// the hub's second row: the generic slots where they're kept, BUY COINS where retired
	const hubSecondRow = map => W(async m => {
		const ow = window.__ow;
		await ow.moveToMap(m);
		ow.slotsMenu.open = false;
		ow.gcMenu.open = true; ow.gcMenu.mode = 'hub'; ow.gcMenu.idx = 0; ow.gcMenu.flash = null;
		ow.gcKey('ArrowDown'); ow.gcKey('z');
		const out = { slots: ow.slotsMenu.open, mode: ow.gcMenu.mode, hub: ow.gcMenu.open };
		ow.slotsMenu.open = false; ow.gcMenu.open = false; ow.gcMenu.mode = 'hub';
		return out;
	}, map);
	for (const m of ['GoldenrodGameCorner', 'JohKantoCeladonGameCorner']) {
		const r = await hubSecondRow(m);
		A(!r.slots && r.mode === 'coins', `2. ${m}: the hub no longer offers the generic slots`, JSON.stringify(r));
	}
	for (const m of ['CeladonCity_GameCorner', 'MauvilleCity_GameCorner']) {
		const r = await hubSecondRow(m);
		A(r.slots, `2. ${m}: the generic slots are kept (that decomp's machines aren't ported)`, JSON.stringify(r));
	}
	// Goldenrod's lucky machine (7,7), read from its right, opens Crystal's slots
	await W(() => window.__ow.moveToMap('GoldenrodGameCorner'));
	await sleep(400);
	await place(8, 7, 'left');
	await page.keyboard.press('z');
	let slotsOpen = false;
	for (let i = 0; i < 60 && !slotsOpen; i++) { slotsOpen = await W(() => !!window.__ow.crystalSlots.open); await sleep(50); }
	A(slotsOpen && !(await W(() => window.__ow.slotsMenu.open)), '2. a Goldenrod slot machine opens Crystal\'s SlotMachine, not the generic slots');
	await settle();

	// ---------- 3. the Ruins of Alph ----------
	await W(() => window.__ow.moveToMap('RuinsOfAlphKabutoChamber', 3, 6));
	await sleep(600);
	await place(2, 4, 'up');
	await page.keyboard.press('z');
	await sleep(400);
	const replica = await W(async () => ({
		text: (window.__ow.dialog.pages || []).map(p => Array.isArray(p) ? p.join(' ') : String(p)).join(' '),
		puzzle: (await import('./unown_puzzle.js')).unownPuzzle.open,
		slide: !!(window.__ow.slideMenu && window.__ow.slideMenu.open),
	}));
	A(/replica of\s+an ancient/i.test(replica.text) && !replica.slide && !replica.puzzle, '3. the replica wall reads Crystal\'s sign, no slide puzzle', JSON.stringify(replica));
	await settle();

	// the walls: (4,0)'s top-left cell is the closed wall (3109) or the open one (38)
	const wallCell = () => W(() => window.__ow.world.gridAt(4, 0));
	const tryItemRoom = async chamber => {
		await place(4, 1, 'up');
		await page.keyboard.down('ArrowUp'); await sleep(260); await page.keyboard.up('ArrowUp');
		for (let i = 0; i < 25 && (await mapName()) === chamber; i++) await sleep(100);
		await sleep(500);
		return mapName();
	};
	const enter = async chamber => { await W(c => window.__ow.moveToMap(c, 3, 6), chamber); await sleep(700); await settle(); };

	// Kabuto: sealed, then an ESCAPE ROPE inside opens it for the next visit
	const kabutoClosed = await wallCell();
	const blocked = await tryItemRoom('RuinsOfAlphKabutoChamber');
	A(blocked === 'RuinsOfAlphKabutoChamber', '3. Kabuto: the sealed wall keeps you out of the item room', `${blocked} cell=${kabutoClosed}`);
	await W(async () => {
		const ow = window.__ow;
		await ow.moveToMap('RuinsOfAlphOutside');
		await ow.moveToMap('RuinsOfAlphKabutoChamber', 3, 6);
		ow.Bag.addItem('escaperope');
		(await import('./ow_input.js')).useGadget('escaperope');
	});
	await settle();
	await sleep(600);
	A(await flag('EVENT_WALL_OPENED_IN_KABUTO_CHAMBER'), '3. Kabuto: an ESCAPE ROPE used in the chamber sets EVENT_WALL_OPENED_IN_KABUTO_CHAMBER', await mapName());
	await enter('RuinsOfAlphKabutoChamber');
	const kabutoOpen = await wallCell();
	const kabutoRoom = await tryItemRoom('RuinsOfAlphKabutoChamber');
	A(kabutoClosed !== kabutoOpen && kabutoRoom === 'RuinsOfAlphKabutoItemRoom', '3. Kabuto: ...and next visit the wall is open onto the item room', `${kabutoClosed}->${kabutoOpen} ${kabutoRoom}`);

	// Omanyte: a WATER STONE in the bag opens it as you walk in
	await enter('RuinsOfAlphOmanyteChamber');
	const omClosed = await wallCell();
	A(!(await flag('EVENT_WALL_OPENED_IN_OMANYTE_CHAMBER')), '3. Omanyte: sealed without a WATER STONE', String(omClosed));
	await W(() => window.__ow.Bag.addItem('waterstone'));
	await W(() => window.__ow.moveToMap('RuinsOfAlphOutside'));
	await enter('RuinsOfAlphOmanyteChamber');
	const omRoom = await tryItemRoom('RuinsOfAlphOmanyteChamber');
	A(await flag('EVENT_WALL_OPENED_IN_OMANYTE_CHAMBER') && omRoom === 'RuinsOfAlphOmanyteItemRoom', '3. Omanyte: carrying a WATER STONE opens the wall (special OmanyteChamber)', omRoom);

	// Aerodactyl: FLASH in the chamber opens it on the spot
	await enter('RuinsOfAlphAerodactylChamber');
	const aeroClosed = await wallCell();
	await W(async () => (await import('./ow_fieldmoves.js')).HM_FIELD.flash.use());
	await settle();
	const aeroOpen = await wallCell();
	const aeroRoom = await tryItemRoom('RuinsOfAlphAerodactylChamber');
	A(await flag('EVENT_WALL_OPENED_IN_AERODACTYL_CHAMBER') && aeroClosed !== aeroOpen && aeroRoom === 'RuinsOfAlphAerodactylItemRoom',
		'3. Aerodactyl: FLASH opens the wall then and there', `${aeroClosed}->${aeroOpen} ${aeroRoom}`);

	// Ho-Oh: Ho-Oh leading the party
	await enter('RuinsOfAlphHoOhChamber');
	const hoClosed = await tryItemRoom('RuinsOfAlphHoOhChamber');
	A(hoClosed === 'RuinsOfAlphHoOhChamber' && !(await flag('EVENT_WALL_OPENED_IN_HO_OH_CHAMBER')), '3. Ho-Oh: sealed while Ho-Oh isn\'t leading', hoClosed);
	await W(() => { window.__ow.party.unshift({ ...window.__ow.party[0], speciesId: 'hooh', name: 'HO-OH', num: 250 }); });
	await W(() => window.__ow.moveToMap('RuinsOfAlphOutside'));
	await enter('RuinsOfAlphHoOhChamber');
	const hoRoom = await tryItemRoom('RuinsOfAlphHoOhChamber');
	A(await flag('EVENT_WALL_OPENED_IN_HO_OH_CHAMBER') && hoRoom === 'RuinsOfAlphHoOhItemRoom', '3. Ho-Oh: with Ho-Oh leading the wall opens (special HoOhChamber)', hoRoom);

	A(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message);
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
