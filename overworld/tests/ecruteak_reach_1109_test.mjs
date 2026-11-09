// ecruteak_reach_1109_test.mjs — the 2026-11-09 Ecruteak / Tin Tower / Lavaridge "sealed"
// reports, each walked with REAL key presses (keydown/keyup through the frame loop).
//
// One real bug:
//   ECRUTEAK GYM GRAMPS (bug:1794121111696). pokecrystal shows him only in the gym's
//   FORCED_TO_LEAVE scene (EcruteakGymClosed walks you back out until the Burned Tower
//   beasts are released, which sets EVENT_ECRUTEAK_GYM_GRAMPS). The port keeps the gym
//   open and never plays that scene, so he stood mute (script ObjectEvent) on (4,14) —
//   the square every invisible-floor pit drops you on. STORY_SEED.JOHTO now sets his flag.
// The rest are the decomps' own routes, which these walks pin:
//   - ECRUTEAK GYM: the safe path north crosses (6,7), a G/S leftover warp_event that is
//     plain floor (crystal_dead_warps_data.js) — door -> MORTY without touching (4,14).
//   - LAVARIDGE GYM (bug:1794077547128): the north half is entered from B1F's (0,6)
//     geyser (reached from the 1F (0,10) vent), not across 1F's solid rows 7-8.
//   - BURNED TOWER 1F HP UP (bug:1794141521020): ROCK SMASH the rock at (15,4).
//   - WISE TRIO (bug:1794163779233): WiseTriosRoomWiseTrioCallback shows GAKU / MASA /
//     KOJI only once you hold the CLEAR BELL (or KOJI let you pass); before that their
//     squares are empty.
//   - BURNED TOWER MORTY (bug:1794141505425) answers; TIN TOWER 6F MAX POTION
//     (bug:1794217772615) is picked up on a save that hasn't already taken it.
//
//   node overworld/tests/ecruteak_reach_1109_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'/opt/chrome/chrome',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9476;
const STATE = { username: 'ecrureach', friendCode: 'ECRU01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (id, name, moves) => ({
	speciesId: id, name, level: 100, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 300, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 }, maxHP: 300, curHP: 300,
	exp: 1000000, moves: moves.map(m => ({ id: m, name: m.toUpperCase(), pp: 20, maxPp: 20 })), sprite: 's1.png', num: 19,
});
const PARTY = [mon('rattata', 'A', ['tackle', 'cut', 'rocksmash'])];
const ALL = { KANTO: ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth'],
	JOHTO: ['zephyr', 'hive', 'plain', 'fog', 'storm', 'mineral', 'glacier', 'rising'],
	HOENN: ['stone', 'knuckle', 'dynamo', 'heat', 'balance', 'feather', 'mind', 'rain'] };
const BADGES = { badges: Object.fromEntries(Object.entries(ALL).map(([r, l]) => [r, Object.fromEntries(l.map(b => [b, true]))])), champion: {} };
const BASE_FLAGS = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// Lavaridge Gym, door -> FLANNERY, one-way (vents drop to B1F, geysers lift to 1F,
// landings never fire, ledges hop south only, people block): [key, map, x, y] per step
const LAVA = 'LavaridgeTown_Gym_';
const LAVARIDGE_ROUTE = [
	...[12, 11, 10, 9, 8].map(x => ['ArrowLeft', '1F', x, 17]), ...[16, 15, 14, 13, 12, 11, 10].map(y => ['ArrowUp', '1F', 8, y]),
	['ArrowUp', 'B1F', 8, 9],                                                   // the (8,9) vent drops you
	...[10, 11, 12, 13, 14, 15, 16].map(y => ['ArrowDown', 'B1F', 8, y]), ...[7, 6, 5].map(x => ['ArrowLeft', 'B1F', x, 16]),
	['ArrowDown', 'B1F', 5, 17], ...[4, 3, 2, 1].map(x => ['ArrowLeft', 'B1F', x, 17]),
	['ArrowLeft', '1F', 0, 17],                                                 // the (0,17) geyser lifts you
	...[16, 15, 14, 13, 12, 11].map(y => ['ArrowUp', '1F', 0, y]),
	['ArrowUp', 'B1F', 0, 10], ...[9, 8, 7].map(y => ['ArrowUp', 'B1F', 0, y]),
	['ArrowUp', '1F', 0, 6],                                                    // ...into 1F's north half
	['ArrowRight', '1F', 1, 6], ['ArrowRight', '1F', 2, 6], ['ArrowUp', '1F', 2, 5], ['ArrowUp', '1F', 2, 4],
	['ArrowUp', 'B1F', 2, 3], ...[3, 4, 5, 6, 7].map(x => ['ArrowRight', 'B1F', x, 3]),
	['ArrowUp', '1F', 7, 2], ...[8, 9, 10].map(x => ['ArrowRight', '1F', x, 2]), ...[3, 4, 5].map(y => ['ArrowDown', '1F', 10, y]),
	['ArrowDown', 'B1F', 10, 6], ['ArrowRight', 'B1F', 11, 6], ['ArrowRight', 'B1F', 12, 6], ...[7, 8, 9].map(y => ['ArrowDown', 'B1F', 12, y]),
	['ArrowDown', 'B1F', 12, 11],                                               // hop the y10 ledge
	['ArrowDown', '1F', 12, 12],                                                // the (12,12) geyser: FLANNERY's platform
	...[11, 10, 9].map(y => ['ArrowUp', '1F', 12, y]),
].map(([k, f, x, y]) => [k, LAVA + f, x, y]);
// Ecruteak Gym, door -> MORTY over the invisible floor
const ECRUTEAK_ROUTE = [['ArrowRight', 5, 16], ['ArrowUp', 5, 15], ['ArrowUp', 5, 14], ['ArrowUp', 5, 13], ['ArrowRight', 6, 13],
	...[12, 11, 10, 9].map(y => ['ArrowUp', 6, y]), ...[5, 4, 3].map(x => ['ArrowLeft', x, 9]), ['ArrowUp', 3, 8], ['ArrowUp', 3, 7],
	...[4, 5, 6].map(x => ['ArrowRight', x, 7]), ...[6, 5, 4, 3, 2].map(y => ['ArrowUp', 6, y]), ['ArrowLeft', 5, 2]];

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
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(() => {
		const s = sessionStorage.getItem('stage');
		if (!s) return;
		sessionStorage.removeItem('stage');
		localStorage.clear();
		for (const [k, v] of Object.entries(JSON.parse(s))) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
	});
	const W = (f, ...a) => page.evaluate(f, ...a);
	const scene = async (map, x, y, facing, { flags = {}, vars = {}, extra = {}, region = 'JOHTO', bag = { pokeball: 5 } } = {}) => {
		const stage = {
			magepunk_mp_token_v1: 't', magepunk_mp_state_v1: STATE, magepunk_region: region, magepunk_name: 'MAY',
			magepunk_party_v1: PARTY, magepunk_bag_v1: bag, magepunk_badges_v1: BADGES,
			magepunk_repel_v1: '99999',
			magepunk_story: { flags: { ...BASE_FLAGS, ...flags }, vars },
			magepunk_settings: { textSpeed: 'instant', battleAnim: 'off' },
			...extra,
		};
		await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
		await W(s => sessionStorage.setItem('stage', s), JSON.stringify(stage));
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await W(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(1200);
		await W((x, y, f) => { const P = window.__ow.player; P.setTile(x, y); P.facing = f; }, x, y, facing);
	};
	const where = () => W(() => { const O = window.__ow; return { map: O.world.current.name, x: O.player.tx, y: O.player.ty, out: O.player.moveOutcome, battle: !!O.battle.active,
		text: O.dialog.blocking && O.dialog.pages ? O.dialog.pages.flat().join(' ') : '' }; });
	// settle: no step, scene, fade or warp in flight
	const settle = async (ms = 6000) => {
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < ms) {
			const busy = await W(() => { const O = window.__ow; return !!(O.player.moving || O.cutscene.blocking || O.fade?.active || O.loading); }).catch(() => true);
			if (!busy) { if (++calm >= 4) return; } else calm = 0;
			await sleep(60);
		}
	};
	// one real key tap per tile
	const key = async (k, n = 1) => {
		for (let i = 0; i < n; i++) {
			await W(k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), k);
			await sleep(50);
			await W(k => dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })), k);
			await settle();
		}
	};
	const closeDialogs = async () => { for (let i = 0; i < 30 && (await W(() => window.__ow.dialog.blocking)); i++) { await key('z'); await sleep(80); } };
	// tap until the player stands on (x,y) — a loaded machine can drop a tap, so a
	// lost key repeats rather than failing the walk (the step itself is still real)
	const to = async (k, x, y) => { for (let i = 0; i < 8; i++) { const p = await where(); if (p.x === x && p.y === y) return; if (p.text) await closeDialogs(); await key(k); } };
	// tap until the map changes (a warp, a connection)
	const leave = async k => { const m = (await where()).map; for (let i = 0; i < 6 && (await where()).map === m; i++) { await key(k); await settle(8000); } };
	// face and press Z until something answers
	const talk = async f => { for (let i = 0; i < 4; i++) { await W(f => { window.__ow.player.facing = f; }, f); await key('z'); const p = await where(); if (p.text || p.battle) return p; await sleep(200); } return where(); };
	const fieldMove = mv => W(async mv => { const FM = await import('./ow_fieldmoves.js'); FM.HM_FIELD[mv].use(); }, mv);
	const beatAll = () => W(() => { const T = window.__ow.trainers; T.list.forEach(t => T.markDefeated(t)); });
	// follow [key, map, x, y] steps; returns the first square it couldn't reach (or null)
	const walk = async steps => {
		let map = (await where()).map;
		for (const [k, m, x, y] of steps) {
			for (let i = 0; i < 6; i++) {
				const p = await where();
				if (p.map === m && p.x === x && p.y === y) break;
				if (p.text) await closeDialogs();
				await key(k);
				const q = await where();
				if (q.map !== map) { map = q.map; await beatAll(); }   // this map's trainers don't stop the walk
			}
			const p = await where();
			if (p.map !== m || p.x !== x || p.y !== y) return { ...p, wanted: [m, x, y] };
		}
		return null;
	};
	const bag = id => W(id => window.__ow.Bag.count(id), id);
	// the next map in the same session (one page load for the whole suite)
	const go = async (map, x, y, facing, beat = true) => {
		await W((m, x, y) => window.__ow.moveToMap(m, x, y), map, x, y);
		await settle(8000); await closeDialogs();
		await W((x, y, f) => { const P = window.__ow.player; P.setTile(x, y); P.facing = f; }, x, y, facing);
		if (beat) await beatAll();
	};

	// ===== 1. ECRUTEAK GYM: no mute GRAMPS on the pit landing; door -> MORTY =====
	// MORTY already beaten: he answers with his after-battle line, so no battle holds the session
	await scene('EcruteakGym', 4, 16, 'up', { flags: { EVENT_BEAT_MORTY: true, EVENT_GOT_TM30_SHADOW_BALL: true } });
	const gramps = await W(() => window.__ow.npcs.list.filter(n => n.ev?.flag === 'EVENT_ECRUTEAK_GYM_GRAMPS').map(n => [n.tx, n.ty]));
	A(gramps.length === 0, "1. the closed-gym GRAMPS isn't standing on (4,14), where every pit drops you", JSON.stringify(gramps));
	await beatAll();
	const eg = await walk(ECRUTEAK_ROUTE.map(([k, x, y]) => [k, 'EcruteakGym', x, y]));
	A(!eg, "1. the invisible floor's safe path (over (6,7)) leads from the door to MORTY", JSON.stringify(eg));
	const morty = await talk('up');
	A(morty.text.length > 0 && !morty.battle, '1. ...and MORTY answers from (5,2)', JSON.stringify(morty));
	await closeDialogs();

	// ===== 2. LAVARIDGE GYM: door -> FLANNERY with real keys =====
	await go('LavaridgeTown_Gym_1F', 13, 17, 'left');
	const lv = await walk(LAVARIDGE_ROUTE);
	A(!lv, "2. Lavaridge Gym: the (0,6) geyser lifts you into 1F's north half; on through (10,6) and the (12,12) geyser to FLANNERY", JSON.stringify(lv));
	const fl = await talk('right');
	A(fl.map === 'LavaridgeTown_Gym_1F' && fl.x === 12 && fl.y === 9 && (fl.battle || /FLANNERY|NORMAN|GYM/i.test(fl.text)), '2. ...and FLANNERY answers', JSON.stringify(fl));
	await closeDialogs();

	// ===== 3. BURNED TOWER 1F: MORTY talks; ROCK SMASH (15,4) to reach the HP UP =====
	await go('BurnedTower1F', 14, 15, 'up');
	const m = await W(() => { const n = window.__ow.npcs.list.find(n => n.ev?.script === 'BurnedTower1FMortyScript'); return n && [n.tx, n.ty]; });
	if (m) await W((x, y) => { const P = window.__ow.player; P.setTile(x, y); P.facing = 'up'; }, m[0], m[1] + 1);
	const bm = await talk('up');
	A(/EUSINE|SUICUNE/.test(bm.text), '3. MORTY in the Burned Tower answers (he wanders a tile or two from (14,14))', JSON.stringify(bm));
	await closeDialogs();
	await W(() => { const P = window.__ow.player; P.setTile(15, 5); P.facing = 'up'; });
	await fieldMove('rocksmash'); await closeDialogs(); await settle(); await closeDialogs();
	const bt = await walk([['ArrowUp', 'BurnedTower1F', 15, 4], ['ArrowUp', 'BurnedTower1F', 15, 3], ['ArrowUp', 'BurnedTower1F', 15, 2]]);
	A(!bt, '3. ROCK SMASH clears (15,4); the pocket beside the HP UP opens', JSON.stringify(bt));
	const hp0 = await bag('hpup');
	await talk('left'); await closeDialogs();
	A(await bag('hpup') === hp0 + 1, '3. ...and the HP UP ball at (14,2) is picked up');

	// ===== 4. TIN TOWER 6F: the MAX POTION ball =====
	await go('TinTower6F', 8, 9, 'up');
	const mp0 = await bag('maxpotion');
	await talk('up'); await closeDialogs();
	A(await bag('maxpotion') === mp0 + 1, '4. the Tin Tower 6F MAX POTION at (8,8) is picked up');

	// ===== 4b. OLD ROD from the bag (bug:1794044125182): Z on the rod casts it =====
	// The bag lists items alphabetically, so the rod's ROW moves as the bag fills; Z on it
	// casts (castRod), only a medicine/TM/etc row opens the "Use on:" picker.
	await go('Route115', 19, 60, 'up');
	await W(() => { window.__ow.Bag.addItem('oldrod'); Math.random = () => 0.99; });   // no bite: no battle holds the session
	await key('b');
	const rodRow = await W(async () => (await import('./ow_menukeys.js')).bagEntries().findIndex(([id]) => id === 'oldrod'));
	await key('ArrowDown', rodRow);
	await key('z');
	const rod = await where();
	A(/You cast the OLD ROD/.test(rod.text), `4b. Z on the OLD ROD's row (${rodRow}) casts it at the water`, JSON.stringify(rod));
	await closeDialogs();

	// ===== 5. WISE TRIOS ROOM: the trio appear with the CLEAR BELL (last: GAKU's battle follows) =====
	const trio = () => W(() => window.__ow.trainers.list.filter(t => !t.hidden).map(t => t.ev.script).sort().join(','));
	await go('WiseTriosRoom', 4, 3, 'up');
	A(await trio() === '', '5. without the CLEAR BELL, GAKU / MASA / KOJI are not in the room (their squares are open floor)', await trio());
	await W(() => window.__ow.Bag.addItem('clearbell'));
	await go('WiseTriosRoom', 4, 3, 'up', false);   // the room's OBJECTS callback reads the bag on entry
	A(await trio() === 'TrainerSageGaku,TrainerSageKoji,TrainerSageMasa', '5. with the CLEAR BELL all three stand in the room', await trio());
	const gk = await talk('up');
	A(/WISE TRIO/.test(gk.text) || gk.battle, '5. ...and GAKU challenges you', JSON.stringify(gk));
	await closeDialogs();

	A(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
