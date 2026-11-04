// sudowoodo_pail_test.mjs — the Battle Frontier SUDOWOODO could never be cleared,
// sealing the surf channel to ARTISAN CAVE and its AZELF (playtest 2026-10-15,
// bug:1792099732624-instinctloretest0918).
//
// On cartridge the tree is watered from the BAG, in native code (pokeemerald
// item_use.c ItemUseOutOfBattle_WailmerPail -> TryToWaterSudowoodo ->
// BattleFrontier_OutsideEast_EventScript_WaterSudowoodo). The transpiler only
// sees scripts, so the watering label shipped with nothing able to call it and
// the WAILMER PAIL did nothing. Two more gaps behind it: the shared
// Common_EventScript_RemoveStaticPokemon was a bare `return` (a beaten static
// never left), and a CAUGHT static leaves through its map's ON_RESUME, which
// this port never runs after a battle.
//
//   1. talking to it WITHOUT the pail still just shakes it (no battle)
//   2. talking to it WITH the pail offers the pail; YES starts the L40 battle
//   3. winning removes it for good (FLAG_DEFEATED_SUDOWOODO + its hide flag), it
//      stays gone on the next visit, and its tile is the surf embark into the
//      channel, which reaches the map's west edge -> OutsideWest's pond -> the
//      ARTISAN CAVE B1F door (AZELF's lair)
//   4. the WAILMER PAIL used from the BAG while facing it starts the battle too;
//      CATCHING it removes it (the ON_RESUME rule)
//   5. running counts as clearing it (retail: B_OUTCOME_RAN -> Defeated)
//   6. the pail facing nothing says so; the Route 36 SQUIRTBOTTLE from the bag
//      waters Crystal's weird tree the same way
//
// Covers: overworld/ow_input.js, overworld/events.js, overworld/ow_scaling.js,
// overworld/ow_battleresume.js, overworld/ow_menukeys.js
//   node overworld/tests/sudowoodo_pail_test.mjs
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
const PORT = 9274;
const STATE = { username: 'sudopail', friendCode: 'SUDO01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (id, name) => ({
	speciesId: id, name, level: 60, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 200, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 200, curHP: 200,
	exp: 300000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }, { id: 'surf', name: 'Surf', pp: 15, maxPp: 15 }], sprite: 's1.png', num: 19,
});
const PARTY = [mon('lapras', 'A'), mon('rattata', 'B')];
const BASE_FLAGS = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true };
const SUDO = [54, 62];
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
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(() => {
		const s = sessionStorage.getItem('stage');
		if (!s) return;
		sessionStorage.removeItem('stage');
		localStorage.clear();
		for (const [k, v] of Object.entries(JSON.parse(s))) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
	});
	const W = (f, ...a) => page.evaluate(f, ...a);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await W(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const scene = async (map, x, y, f, { flags = {}, vars = {}, bag = { pokeball: 5 }, region = 'HOENN' } = {}) => {
		const stage = {
			magepunk_mp_token_v1: 't', magepunk_mp_state_v1: STATE, magepunk_region: region, magepunk_name: 'MAY',
			magepunk_party_v1: PARTY, magepunk_bag_v1: bag,
			magepunk_story: { flags: { ...BASE_FLAGS, ...flags }, vars },
			magepunk_settings: { textSpeed: 'instant', battleAnim: 'off' },
		};
		await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
		await W(s => sessionStorage.setItem('stage', s), JSON.stringify(stage));
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		await boot(map);
		await W((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.px = x * 16; P.py = y * 16; P.facing = f; }, x, y, f);
	};
	// answer every message / yes-no with `answer` until the scene is over or a battle starts
	const drive = (start, answer = 'z') => W(async (start, answer) => {
		const O = window.__ow, C = await import('./choice.js');
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const seen = [];
		if (start === 'talk') O.interact();
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < 15000) {
			const d = O.dialog.blocking, c = O.cutscene.blocking, b = O.battle.blocking;
			if (b) return { seen, battle: true };
			if (d && O.dialog.pages) { const p = O.dialog.pages.flat().join(' '); if (seen[seen.length - 1] !== p) seen.push(p); }
			if (C.choiceMenu.open || d) press(/Z = Yes/.test(seen[seen.length - 1] || '') ? answer : 'z');
			if (!d && !c && !C.choiceMenu.open) { if (++calm >= 15) break; } else calm = 0;
			await new Promise(r => setTimeout(r, 40));
		}
		return { seen, battle: false };
	}, start, answer);
	// the live battle: who it is, then end it with `result` and let the script finish
	const resolve = result => W(async result => {
		const O = window.__ow, b = O.battle;
		for (let i = 0; i < 200 && !(b.active && ['menu', 'choose'].includes(b.active.phase)); i++) await new Promise(r => setTimeout(r, 60));
		const a = b.active;
		const foe = a ? { species: a.foe.speciesId, level: a.foe.level } : null;
		if (a && result === 'caught') a.caughtMon = a.foe;
		if (a) b.finish(result);
		for (let i = 0; i < 200 && (b.blocking || O.cutscene.blocking || O.dialog.blocking); i++) {
			if (O.dialog.blocking) dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true }));
			await new Promise(r => setTimeout(r, 60));
		}
		return foe;
	}, result);
	const sudo = () => W(([x, y]) => {
		const O = window.__ow, n = O.npcs.list.find(n => n.ev && n.ev.graphics_id === 'OBJ_EVENT_GFX_SUDOWOODO');
		const st = JSON.parse(localStorage.getItem('magepunk_story') || '{}').flags || {};
		return { present: !!n && !n.hidden, at: n ? [n.tx, n.ty] : null, defeated: !!st.FLAG_DEFEATED_SUDOWOODO, hideFlag: !!st.FLAG_HIDE_BATTLE_FRONTIER_SUDOWOODO, blocks: !!n && !n.hidden && n.tx === x && n.ty === y };
	}, SUDO);
	const useFromBag = id => W(async id => {
		const O = window.__ow, M = await import('./ow_menukeys.js'), Bag = await import('./bag.js');
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		press('b'); await new Promise(r => setTimeout(r, 200));
		const bm = M.bagMenu;
		if (!bm.open) return { opened: false };
		// find the pocket + row holding the item, as a player would
		for (let p = 0; p < 8; p++) {
			const rows = M.bagEntries ? M.bagEntries() : null;
			const i = rows ? rows.findIndex(r => r[0] === id) : -1;
			if (i >= 0) { bm.idx = i; break; }
			press('ArrowRight'); await new Promise(r => setTimeout(r, 60));
		}
		const sel = M.bagEntries ? (M.bagEntries()[bm.idx] || [])[0] : null;
		press('z'); await new Promise(r => setTimeout(r, 300));
		return { opened: true, sel, stillOpen: bm.open, flash: bm.flash || null, battle: O.battle.blocking, cutscene: O.cutscene.blocking, dialog: O.dialog.blocking, has: Bag.count(id) };
	}, id);

	// ===== 1. no pail: it only shakes =====
	await scene('BattleFrontier_OutsideEast', 55, 62, 'left');
	const s0 = await sudo();
	A(s0.present && s0.blocks, '1. the SUDOWOODO stands in the channel mouth at (54,62)', JSON.stringify(s0));
	const t1 = await drive('talk');
	A(!t1.battle && (await sudo()).present, '1. without the WAILMER PAIL talking to it only shakes it — no battle', JSON.stringify(t1));

	// ===== 2+3. with the pail: talk -> YES -> battle -> win -> gone =====
	await scene('BattleFrontier_OutsideEast', 55, 62, 'left', { bag: { pokeball: 5, wailmerpail: 1 } });
	const no = await drive('talk', 'x');
	A(!no.battle && no.seen.some(p => /WAILMER PAIL/.test(p)) && (await sudo()).present, '2. with the pail it is offered; NO leaves it be', JSON.stringify(no.seen));
	const yes = await drive('talk', 'z');
	A(yes.battle, '2. YES waters it and the battle starts', JSON.stringify(yes.seen));
	const foe = await resolve('victory');
	A(foe && foe.species === 'sudowoodo', '2. ...against SUDOWOODO', JSON.stringify(foe));
	const s3 = await sudo();
	A(s3.defeated && s3.hideFlag && !s3.present, '3. beaten: FLAG_DEFEATED_SUDOWOODO, its hide flag set, and it is gone', JSON.stringify(s3));
	const reach = await W(async ([sx, sy]) => {
		const O = window.__ow, w = O.world;
		const out = { stand: w.isPassable(sx, sy), surfNext: false, westEdge: false, npcOnTile: O.npcs.list.some(n => !n.hidden && n.tx === sx && n.ty === sy) };
		// surf flood from the tree's tile: does the channel reach the map's west edge?
		const W_ = w.current.layout?.width, H_ = w.current.layout?.height;
		const seen = new Set(), q = [];
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.isSurfable(sx + dx, sy + dy)) { out.surfNext = true; q.push([sx + dx, sy + dy]); }
		while (q.length) {
			const [x, y] = q.shift(); const k = x + ',' + y;
			if (seen.has(k)) continue; seen.add(k);
			if (x === 0) out.westEdge = true;
			for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const nx = x + dx, ny = y + dy;
				if (nx < 0 || ny < 0 || (W_ && nx >= W_) || (H_ && ny >= H_)) continue;
				if (w.isSurfable(nx, ny) && !seen.has(nx + ',' + ny)) q.push([nx, ny]);
			}
		}
		out.flood = seen.size;
		return out;
	}, SUDO);
	A(reach.stand && !reach.npcOnTile && reach.surfNext, "3. its tile is free to stand on, and SURF launches into the channel from it", JSON.stringify(reach));
	A(reach.westEdge, '3. the channel runs west to the edge, into BATTLE FRONTIER OUTSIDE WEST', JSON.stringify(reach));
	// OutsideWest: the pond the channel feeds reaches the ARTISAN CAVE B1F door (39,55)
	const west = await W(async () => {
		const O = window.__ow;
		await O.moveToMap('BattleFrontier_OutsideWest', 2, 2);
		for (let i = 0; i < 100 && O.world.current?.name !== 'BattleFrontier_OutsideWest'; i++) await new Promise(r => setTimeout(r, 100));
		const w = O.world, W_ = w.current.layout?.width, H_ = w.current.layout?.height;
		const door = (w.current.map.warp_events || []).find(d => d.dest_map === 'MAP_ARTISAN_CAVE_B1F');
		const q = []; for (let y = 0; y < H_; y++) if (w.isSurfable(W_ - 1, y)) q.push([W_ - 1, y]);
		// surf the pond from the channel's mouth, then walk from wherever it lands you
		const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
		const flood = (starts, ok) => {
			const seen = new Set(), q = [...starts];
			while (q.length) {
				const [x, y] = q.shift(); const k = x + ',' + y;
				if (seen.has(k)) continue; seen.add(k);
				for (const [dx, dy] of N4) {
					const nx = x + dx, ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= W_ || ny >= H_) continue;
					if (ok(nx, ny) && !seen.has(nx + ',' + ny)) q.push([nx, ny]);
				}
			}
			return seen;
		};
		const water = flood(q, (x, y) => w.isSurfable(x, y));
		const shore = [];
		for (const k of water) { const [x, y] = k.split(',').map(Number); for (const [dx, dy] of N4) if (w.isPassable(x + dx, y + dy) && !w.isSurfable(x + dx, y + dy)) shore.push([x + dx, y + dy]); }
		const land = flood(shore, (x, y) => w.isPassable(x, y) && !w.isSurfable(x, y));
		const touches = !!door && [...shore.map(([x, y]) => x + ',' + y), ...land].includes(door.x + ',' + door.y);
		const L = await import('./legendaries_postgame.js');
		return { door: door ? [door.x, door.y] : null, eastWater: water.size, landing: land.size, touches, azelf: L.POSTGAME_LEGENDS?.MAP_ARTISAN_CAVE_B1F?.species || null };
	});
	A(west.door && west.touches, '3. ...and from the east edge the pond reaches the ARTISAN CAVE B1F door', JSON.stringify(west));
	A(west.azelf === 'azelf', '3. AZELF waits in ARTISAN CAVE B1F', JSON.stringify(west));
	// back again: it stays gone
	await W(async () => { const O = window.__ow; await O.moveToMap('BattleFrontier_OutsideEast', 55, 62); for (let i = 0; i < 100 && O.world.current?.name !== 'BattleFrontier_OutsideEast'; i++) await new Promise(r => setTimeout(r, 100)); await new Promise(r => setTimeout(r, 600)); });
	A(!(await sudo()).present, '3. on the next visit it is still gone', JSON.stringify(await sudo()));

	// ===== 4. the pail from the BAG, then CATCH it =====
	await scene('BattleFrontier_OutsideEast', 55, 62, 'left', { bag: { pokeball: 5, wailmerpail: 1 } });
	const u4 = await useFromBag('wailmerpail');
	A(u4.opened && u4.sel === 'wailmerpail' && !u4.stillOpen, '4. the WAILMER PAIL is used from the BAG (the bag closes)', JSON.stringify(u4));
	const d4 = await drive('none');
	A(d4.battle, '4. ...facing the SUDOWOODO it starts the battle', JSON.stringify([u4, d4.seen]));
	await resolve('caught');
	const s4 = await sudo();
	A(s4.defeated && !s4.present && s4.hideFlag, '4. catching it removes it too (the ON_RESUME rule)', JSON.stringify(s4));
	A(await W(() => [...window.__ow.party, ...JSON.parse(localStorage.getItem('magepunk_box_v1') || '[]')].some(m => m.speciesId === 'sudowoodo')), '4. ...and the SUDOWOODO is yours');

	// ===== 5. running clears it as well =====
	await scene('BattleFrontier_OutsideEast', 55, 62, 'left', { bag: { pokeball: 5, wailmerpail: 1 } });
	await drive('talk', 'z');
	await resolve('escaped');
	const s5 = await sudo();
	A(s5.defeated && !s5.present, '5. running from it clears the way, as on cartridge (B_OUTCOME_RAN -> Defeated)', JSON.stringify(s5));

	// ===== 6. the pail at nothing; the Route 36 SQUIRTBOTTLE from the bag =====
	await scene('BattleFrontier_OutsideEast', 55, 63, 'down', { bag: { pokeball: 5, wailmerpail: 1 } });
	const u6 = await useFromBag('wailmerpail');
	A(u6.opened && !u6.battle && !u6.cutscene && /time to use that/i.test(u6.flash || ''), '6. the pail facing nothing: "This isn\'t the time to use that!"', JSON.stringify(u6));
	await scene('Route36', 36, 9, 'left', { region: 'JOHTO', bag: { pokeball: 5, squirtbottle: 1 } });
	const u7 = await useFromBag('squirtbottle');
	const d7 = await drive('none');
	A(u7.sel === 'squirtbottle' && d7.battle, '6. the SQUIRTBOTTLE from the BAG waters the Route 36 weird tree into its battle', JSON.stringify([u7, d7.seen.slice(-2)]));
	const f7 = await resolve('victory');
	A(f7 && f7.species === 'sudowoodo', '6. ...SUDOWOODO', JSON.stringify(f7));

	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
