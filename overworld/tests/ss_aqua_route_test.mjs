// ss_aqua_route_test.mjs — the way into the KANTO of old is Crystal's own route.
//
// Owner rule (2026-10-12): JohKanto opens only to the GRAND CHAMPION (#677). Its one
// working door was the MAGNET TRAIN, whose officer wants a PASS that only the COPYCAT
// in JohKanto's SAFFRON hands out — so nobody could get in at all. The owner chose
// Crystal's route: the HALL OF FAME's flags (EVENT_BEAT_ELITE_FOUR) come on with the
// GRAND CHAMPION crown, PROF. ELM gives the S.S. TICKET, the S.S. AQUA sails OLIVINE ->
// VERMILION, the POWER PLANT's MACHINE PART restores EVENT_RESTORED_POWER_TO_KANTO, the
// COPYCAT gives the PASS, and only then does the MAGNET TRAIN run. Every step below runs
// the decomp's own transpiled script.
//   1. JOHTO champion only: ELM has no ticket; OLIVINE PORT's ship sailor isn't there
//   2. GRAND CHAMPION: the HALL OF FAME flags are on, the Magnet Train still has no
//      power, and ELM gives the S.S. TICKET
//   3. the S.S. AQUA: board at OLIVINE with the ticket, rest in the cabin until the
//      ship docks, and the sailor lets you off at VERMILION PORT; the port passage's
//      door into VERMILION CITY is open
//   4. the POWER PLANT manager takes the MACHINE PART -> the power is back; the
//      COPYCAT takes the LOST ITEM -> the PASS
//   5. the MAGNET TRAIN: with power and the PASS it rides to SAFFRON; without the PASS
//      the officer refuses
//
//   node overworld/tests/ss_aqua_route_test.mjs
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
const PORT = 9420;
const STATE = { username: 'ssaqua', friendCode: 'SSAQUA', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 60, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 160, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 160, curHP: 160,
	exp: 216000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const JOHTO_BADGES = { zephyr: true, hive: true, plain: true, fog: true, storm: true, mineral: true, glacier: true, rising: true };
const KANTO_BADGES = { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true, marsh: true, volcano: true, earth: true };
const HOENN_BADGES = { stone: true, knuckle: true, dynamo: true, heat: true, balance: true, feather: true, mind: true, rain: true };
const JOHTO_CROWN = { badges: { JOHTO: JOHTO_BADGES }, champion: { JOHTO: true } };
const GRAND = { badges: { JOHTO: JOHTO_BADGES, KANTO: KANTO_BADGES, HOENN: HOENN_BADGES }, champion: { JOHTO: true, KANTO: true, HOENN: true } };

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
	// one fresh page per scenario. The S.S. AQUA sails on Monday (and Friday), so the
	// clock is pinned to a Monday for every scenario.
	const boot = async (badges, map, { flags = {}, bag = { pokeball: 5 }, weekday = 1 } = {}) => {
		const page = await browser.newPage();
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, party, badges, flags, bag, weekday) => {
			Date.prototype.getDay = function () { return weekday; };   // 1 = MONDAY
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'johto');
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
			localStorage.setItem('magepunk_bag_v1', JSON.stringify(bag));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, crystal_events_seeded: true, ...flags }, vars: {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}, STATE, PARTY, badges, flags, bag, weekday);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
		return { page, errors };
	};
	const W = (page, f, ...a) => page.evaluate(f, ...a);
	const here = page => W(page, () => window.__ow.world.current.name);
	const flag = (page, f) => W(page, f => !!window.__ow.Story.getFlag(f), f);
	const has = (page, id) => W(page, id => window.__ow.Bag.count(id), id);
	// run a decomp script label and answer YES / A through it, collecting its text,
	// until it is done (or a warp takes the player to another map)
	const run = (page, label) => W(page, async label => {
		const O = window.__ow, C = await import('./choice.js'), St = await import('./ow_story.js');
		const talker = O.npcs.list.find(n => n.ev && n.ev.script === label) || null;
		const start = O.world.current.name, seen = [];
		St.runScriptLabel(label, talker);
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < 20000) {
			const d = O.dialog;
			if (d.blocking && d.pages) { const t = d.pages.flat().join(' '); if (seen[seen.length - 1] !== t) seen.push(t); d.revealed = 1e9; d.key('z'); }
			else if (C.choiceMenu.open) { C.choiceMenu.idx = 0; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true })); }
			const busy = d.blocking || O.cutscene.blocking || C.choiceMenu.open || (O.fade && O.fade.alpha > 0.01);
			if (!busy && ++calm >= 15) break; else if (busy) calm = 0;
			await new Promise(r => setTimeout(r, 40));
		}
		return { text: seen.join(' | '), from: start, map: O.world.current.name };
	}, label);
	const waitMap = async (page, m) => { for (let i = 0; i < 80 && (await here(page)) !== m; i++) await sleep(100); await sleep(400); return here(page); };
	const visible = (page, label) => W(page, label => window.__ow.npcs.list.some(n => n.ev && n.ev.script === label && !n.hidden), label);

	// ===== 1. JOHTO champion only =====
	{
		// crystal_init_events (a new game's InitializeEventsScript) hides the after-HoF sailor
		const { page, errors } = await boot(JOHTO_CROWN, 'ElmsLab', { flags: { EVENT_OLIVINE_PORT_SPRITES_AFTER_HALL_OF_FAME: true } });
		A(!(await flag(page, 'EVENT_BEAT_ELITE_FOUR')), '1. the JOHTO crown alone is not the HALL OF FAME (EVENT_BEAT_ELITE_FOUR off)');
		const r = await run(page, 'ProfElmScript');
		A(!(await has(page, 'ssticket')) && !/S\.S\.\s*TICKET/i.test(r.text), '1. PROF. ELM has no S.S. TICKET for you yet', r.text.slice(0, 160));
		await W(page, () => window.__ow.moveToMap('OlivinePort', 11, 6));
		await waitMap(page, 'OlivinePort');
		A(!(await visible(page, 'OlivinePortSailorAfterHOFScript')), '1. OLIVINE PORT\'s ship sailor is not there before the HALL OF FAME');
		A(errors.length === 0, '1. no page errors', JSON.stringify(errors.slice(0, 3)));
		await page.close();
	}

	// ===== 2. GRAND CHAMPION: ELM's S.S. TICKET =====
	{
		const { page, errors } = await boot(GRAND, 'ElmsLab', { flags: { EVENT_OLIVINE_PORT_SPRITES_AFTER_HALL_OF_FAME: true } });
		A(await flag(page, 'grand_champion'), '2. three crowns -> GRAND CHAMPION (granted on load)');
		A(await flag(page, 'EVENT_BEAT_ELITE_FOUR'), '2. ...and the HALL OF FAME\'s flags are on (EVENT_BEAT_ELITE_FOUR)');
		A(!(await flag(page, 'EVENT_RESTORED_POWER_TO_KANTO')), '2. the MAGNET TRAIN still has no power (that is the POWER PLANT\'s job)');
		const r = await run(page, 'ProfElmScript');
		A(await has(page, 'ssticket') === 1 && await flag(page, 'EVENT_GOT_SS_TICKET_FROM_ELM'), '2. PROF. ELM gives the S.S. TICKET', r.text.slice(0, 200));
		const obj = await W(page, async () => (await import('./ow_postgame.js')).postgameObjective());
		A(/S\.S\. AQUA/.test(obj || ''), '2. the objective sends you to the S.S. AQUA', obj);
		A(errors.length === 0, '2. no page errors', JSON.stringify(errors.slice(0, 3)));
		await page.close();
	}

	// ===== 3. the S.S. AQUA: OLIVINE -> VERMILION =====
	{
		const flags = { grand_champion: true, EVENT_BEAT_ELITE_FOUR: true, EVENT_GOT_SS_TICKET_FROM_ELM: true };
		const { page, errors } = await boot(GRAND, 'OlivinePort', { flags, bag: { pokeball: 5, ssticket: 1 } });
		A(await visible(page, 'OlivinePortSailorAfterHOFScript'), '3. after the HALL OF FAME the ship sailor stands at OLIVINE PORT');
		const board = await run(page, 'OlivinePortSailorAfterHOFScript');
		A(await waitMap(page, 'FastShip1F') === 'FastShip1F', '3. showing the S.S. TICKET boards the S.S. AQUA', JSON.stringify({ map: board.map, text: board.text.slice(0, 240) }));
		// the first trip docks once you find the captain's granddaughter (SSAquaGranddaughterBefore
		// -> SSAquaMetalCoatAndDocking): the GRANDPA's METAL COAT, then "arrived in VERMILION"
		await W(page, () => window.__ow.moveToMap('FastShipCabins_SE_SSE_CaptainsCabin', 4, 5));
		await waitMap(page, 'FastShipCabins_SE_SSE_CaptainsCabin');
		const girl = await run(page, 'SSAquaGranddaughterBefore');
		A(await flag(page, 'EVENT_FAST_SHIP_HAS_ARRIVED') && await has(page, 'metalcoat') === 1, "3. finding the captain's granddaughter: the METAL COAT, and the ship docks in VERMILION", girl.text.slice(0, 220));
		await W(page, () => window.__ow.moveToMap('FastShip1F', 25, 3));
		await waitMap(page, 'FastShip1F');
		const off = await run(page, 'FastShip1FSailor1Script');
		A(await waitMap(page, 'VermilionPort') === 'VermilionPort', '3. the sailor lets you off at VERMILION PORT', JSON.stringify({ map: off.map, text: off.text.slice(0, 200) }));
		// the port passage's door into JohKanto's VERMILION CITY is open to a GRAND CHAMPION
		await W(page, () => window.__ow.moveToMap('VermilionPortPassage', 15, 2));
		await waitMap(page, 'VermilionPortPassage');
		const door = await W(page, async () => {
			const G = await import('./johkanto_gate.js'), O = window.__ow;
			const ws = (O.world.current.map.warp_events || []).filter(w => /JOHKANTO_VERMILION_CITY/.test(w.dest_map));
			return { n: ws.length, blocked: ws.some(w => G.doorBlocked(O.world, w.x, w.y)) };
		});
		A(door.n > 0 && !door.blocked, '3. ...and the passage\'s door into VERMILION CITY is open', JSON.stringify(door));
		A(errors.length === 0, '3. no page errors', JSON.stringify(errors.slice(0, 3)));
		await page.close();
	}

	// ===== 3b. the REAL sailor, by key press (2026-10-13) =====
	// Section 3 drove the sailor's script directly. A player faces him and presses Z,
	// and the port's generic FERRY service (it answers on every OLIVINE PORT tile, and
	// counted any "Sailor" script as one of its hands) opened the FERRY menu instead.
	{
		const flags = { grand_champion: true, EVENT_BEAT_ELITE_FOUR: true, EVENT_GOT_SS_TICKET_FROM_ELM: true };
		const { page, errors } = await boot(GRAND, 'OlivinePort', { flags, bag: { pokeball: 5, ssticket: 1 } });
		const sailor = await W(page, () => { const n = window.__ow.npcs.list.find(n => n.ev && n.ev.script === 'OlivinePortSailorAfterHOFScript'); return n && { x: n.tx, y: n.ty }; });
		await W(page, s => { const P = window.__ow.player; P.tx = s.x; P.ty = s.y - 1; P.x = s.x * 16; P.y = (s.y - 1) * 16; P.facing = 'down'; }, sailor);
		await page.keyboard.press('z');
		let ferry = false, map = 'OlivinePort';
		for (let i = 0; i < 150 && map === 'OlivinePort'; i++) {
			const s = await W(page, async () => {
				const O = window.__ow, C = await import('./choice.js'), MK = await import('./ow_menukeys.js');
				return { ferry: !!MK.ferryMenu.open, d: !!O.dialog.blocking, c: !!C.choiceMenu.open, map: O.world.current.name };
			});
			map = s.map;
			if (s.ferry) { ferry = true; break; }
			if (s.c) { await W(page, async () => { (await import('./choice.js')).choiceMenu.idx = 0; }); await page.keyboard.press('z'); }
			else if (s.d) await page.keyboard.press('z');
			await sleep(120);
		}
		A(!ferry, '3b. Z at the S.S. AQUA sailor does NOT open the generic FERRY menu', JSON.stringify({ sailor }));
		A((await waitMap(page, 'FastShip1F')) === 'FastShip1F', '3b. ...his own script runs: the S.S. TICKET boards the S.S. AQUA', map);
		A(errors.length === 0, '3b. no page errors', JSON.stringify(errors.slice(0, 3)));
		await page.close();
	}

	// ===== 3c. a stale "temporary" flag (2026-10-13, Instinct) =====
	// Crystal clears EVENT_TEMPORARY_UNTIL_MAP_RELOAD_1..8 on every new map
	// (HandleNewMap -> ResetMapBufferEventFlags). The port kept them forever, so one
	// walk-off scene left _1 set and every sailor answered "Sorry. You can't board
	// now." Instinct's state: TEMP_1 set, port sprites after the HALL OF FAME, no first
	// voyage yet, a Wednesday (a first voyage ignores the sailing days).
	{
		const flags = { grand_champion: true, EVENT_BEAT_ELITE_FOUR: true, EVENT_GOT_SS_TICKET_FROM_ELM: true,
			EVENT_TEMPORARY_UNTIL_MAP_RELOAD_1: true, EVENT_OLIVINE_PORT_SPRITES_BEFORE_HALL_OF_FAME: true };
		const { page, errors } = await boot(GRAND, 'OlivineCity', { flags, bag: { pokeball: 5, ssticket: 2 }, weekday: 3 });
		A(!(await flag(page, 'EVENT_TEMPORARY_UNTIL_MAP_RELOAD_1')), '3c. loading a map clears EVENT_TEMPORARY_UNTIL_MAP_RELOAD_1 (boot)');
		// set it again (a scene set it on the last map) and walk in: the entry path clears it too
		await W(page, () => window.__ow.Story.setFlag('EVENT_TEMPORARY_UNTIL_MAP_RELOAD_1'));
		await W(page, () => window.__ow.moveToMap('OlivinePort', 7, 17));
		await waitMap(page, 'OlivinePort');
		await sleep(600);
		A(!(await flag(page, 'EVENT_TEMPORARY_UNTIL_MAP_RELOAD_1')), '3c. ...and entering OLIVINE PORT clears it (map change)');
		const sailor = await W(page, () => { const n = window.__ow.npcs.list.find(n => n.ev && n.ev.script === 'OlivinePortSailorAfterHOFScript' && !n.hidden); return n && { x: n.tx, y: n.ty }; });
		A(!!sailor, '3c. the after-HALL OF FAME sailor stands at the port', JSON.stringify(sailor));
		await W(page, s => { const P = window.__ow.player; P.tx = s.x; P.ty = s.y - 1; P.x = s.x * 16; P.y = (s.y - 1) * 16; P.facing = 'down'; }, sailor);
		await page.keyboard.press('z');
		let map = 'OlivinePort', said = '';
		for (let i = 0; i < 150 && map === 'OlivinePort'; i++) {
			const s = await W(page, async () => {
				const O = window.__ow, C = await import('./choice.js');
				return { d: !!O.dialog.blocking, c: !!C.choiceMenu.open, map: O.world.current.name, t: O.dialog.pages ? O.dialog.pages.flat().join(' ') : '' };
			});
			map = s.map; if (s.t) said += s.t + ' | ';
			if (s.c) { await W(page, async () => { (await import('./choice.js')).choiceMenu.idx = 0; }); await page.keyboard.press('z'); }
			else if (s.d) await page.keyboard.press('z');
			await sleep(120);
		}
		A(!/can't board/i.test(said), '3c. the sailor no longer says "Sorry. You can\'t board now."', said.slice(0, 240));
		A((await waitMap(page, 'FastShip1F')) === 'FastShip1F', '3c. ...and the first voyage boards the S.S. AQUA (any weekday)', map);
		A(errors.length === 0, '3c. no page errors', JSON.stringify(errors.slice(0, 3)));
		await page.close();
	}

	// ===== 4. the POWER PLANT and the COPYCAT's PASS =====
	{
		const flags = { grand_champion: true, EVENT_BEAT_ELITE_FOUR: true, EVENT_GOT_SS_TICKET_FROM_ELM: true, EVENT_MET_MANAGER_AT_POWER_PLANT: true };
		const { page, errors } = await boot(GRAND, 'JohKantoPowerPlant', { flags, bag: { pokeball: 5, ssticket: 1, machinepart: 1, lostitem: 1 } });
		const pp = await run(page, 'PowerPlantManager');
		A(await flag(page, 'EVENT_RETURNED_MACHINE_PART') && await flag(page, 'EVENT_RESTORED_POWER_TO_KANTO'), '4. returning the MACHINE PART restores the power to KANTO', pp.text.slice(0, 160));
		await W(page, () => window.__ow.moveToMap('JohKantoCopycatsHouse2F', 4, 4));
		await waitMap(page, 'JohKantoCopycatsHouse2F');
		const cc = await run(page, 'Copycat');
		A(await has(page, 'pass') === 1 && await flag(page, 'EVENT_GOT_PASS_FROM_COPYCAT'), '4. the COPYCAT takes the LOST ITEM and gives the PASS', cc.text.slice(0, 160));
		A(errors.length === 0, '4. no page errors', JSON.stringify(errors.slice(0, 3)));
		await page.close();
	}

	// ===== 5. the MAGNET TRAIN =====
	{
		const flags = { grand_champion: true, EVENT_BEAT_ELITE_FOUR: true, EVENT_RESTORED_POWER_TO_KANTO: true };
		{
			const { page } = await boot(GRAND, 'GoldenrodMagnetTrainStation', { flags, bag: { pokeball: 5 } });
			const r = await run(page, 'GoldenrodMagnetTrainStationOfficerScript');
			A(await here(page) === 'GoldenrodMagnetTrainStation' && /PASS/.test(r.text), '5. without the PASS the officer refuses', r.text.slice(0, 160));
			await page.close();
		}
		{
			const { page, errors } = await boot(GRAND, 'GoldenrodMagnetTrainStation', { flags, bag: { pokeball: 5, pass: 1 } });
			const r = await run(page, 'GoldenrodMagnetTrainStationOfficerScript');
			A(await waitMap(page, 'JohKantoSaffronMagnetTrainStation') === 'JohKantoSaffronMagnetTrainStation', '5. with power and the PASS the MAGNET TRAIN rides to SAFFRON', JSON.stringify({ map: r.map, text: r.text.slice(0, 160) }));
			A(errors.length === 0, '5. no page errors', JSON.stringify(errors.slice(0, 3)));
			await page.close();
		}
	}

	// ===== 6. the return trip: VERMILION -> OLIVINE (Wednesdays and Sundays) =====
	{
		const flags = { grand_champion: true, EVENT_BEAT_ELITE_FOUR: true, EVENT_GOT_SS_TICKET_FROM_ELM: true, EVENT_FAST_SHIP_FIRST_TIME: true };
		const { page, errors } = await boot(GRAND, 'VermilionPort', { flags, bag: { pokeball: 5, ssticket: 1 }, weekday: 3 });
		const board = await run(page, 'VermilionPortSailorScript');
		A(await waitMap(page, 'FastShip1F') === 'FastShip1F' && await flag(page, 'EVENT_FAST_SHIP_DESTINATION_OLIVINE'), '6. on a Wednesday the S.S. AQUA sails from VERMILION for OLIVINE', JSON.stringify({ map: board.map, text: board.text.slice(0, 200) }));
		await W(page, () => window.__ow.moveToMap('FastShipCabins_SW_SSW_NW', 2, 4));
		await waitMap(page, 'FastShipCabins_SW_SSW_NW');
		const bed = await run(page, 'FastShipBed');
		A(await flag(page, 'EVENT_FAST_SHIP_HAS_ARRIVED'), '6. on a later trip, resting in the cabin docks the ship', bed.text.slice(0, 160));
		await W(page, () => window.__ow.moveToMap('FastShip1F', 25, 3));
		await waitMap(page, 'FastShip1F');
		await run(page, 'FastShip1FSailor1Script');
		A(await waitMap(page, 'OlivinePort') === 'OlivinePort', '6. ...and the sailor lets you off at OLIVINE PORT');
		A(errors.length === 0, '6. no page errors', JSON.stringify(errors.slice(0, 3)));
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
