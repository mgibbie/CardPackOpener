// johkanto_1008_test.mjs — the 2026-10-08 Johto/Kanto tester reports.
//
//   1. bug:1791421947695 — the RADIO TOWER takeover never began: every Johto gym's
//      <Gym>ActivateRockets (readvar VAR_BADGES; ifequal 7 -> RadioTowerRocketsScript)
//      transpiled to a bare `end`, so the 2F stair guard never stepped aside
//   2. bug:1791408988392 — HIKER ANTHONY (Route 33): beaten, then called for a
//      rematch, talking to him did nothing
//   3. bug:1791459156957 — KURT's radio (and every std house radio: Bill's, the
//      Charcoal Kiln, ...) said "..." — a bg_event with neither a script body nor
//      sign text never reached runScriptLabel, which owns the /Radio$/ hook
//   4. bug:1791467287353 — Fly out of the NATIONAL PARK left the Bug-Catching
//      Contest running (judged later, on arriving at a gate from OUTSIDE): leaving
//      by Fly/Dig/Rope/Teleport now aborts it as Crystal does; only a gate judges
//   5. bug:1791452053586 — holding UP while surfing climbed Meteor Falls' waterfall
//      without the Rain Badge: MB_WATERFALL pushes a surfer south on the GBA
//   6. bug:1791409904360 — a ZAPDOS caught through the native encounter left the
//      decomp's object standing; its script (special StartLegendaryBattle isn't
//      implemented) then "won" with no battle. Same for 11 other static legendaries
//   7. bug:1791440257652 — FireRed's Mt. Moon B2F fossils were skipped as props:
//      invisible, and facing them did nothing
//
//   node overworld/tests/johkanto_1008_test.mjs
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
const PORT = 9310;
const STATE = { username: 'jk1008', friendCode: 'JK1008', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (id, name) => ({
	speciesId: id, name, level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
});
const FIVE = ['A', 'B', 'C', 'D', 'E'].map(n => mon('rattata', n));
// Crystal's new-game events, then the Slowpoke Well cleared: KURT's victory scene
// (SlowpokeWellB1F) is what clears EVENT_ILEX_FOREST_FARFETCHD and lets the bird appear
const ILEX = { crystal_events_seeded: true, EVENT_CLEARED_SLOWPOKE_WELL: true };
const BASE_FLAGS = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true };
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
		// each scene's save is staged in sessionStorage by `scene` below, applied once
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
	// a fresh save on `map`, then the player at (x,y) facing `f`
	const scene = async (map, x, y, f, { flags = {}, vars = {}, bag = { pokeball: 5 }, party = FIVE, badges = null } = {}) => {
		const stage = {
			magepunk_mp_token_v1: 't', magepunk_mp_state_v1: STATE, magepunk_region: 'JOHTO', magepunk_name: 'KRIS',
			magepunk_party_v1: party, magepunk_bag_v1: bag,
			magepunk_story: { flags: { ...BASE_FLAGS, ...flags }, vars },
			magepunk_settings: { textSpeed: 'instant', battleAnim: 'off' },
		};
		if (badges) stage.magepunk_badges_v1 = badges;
		await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
		await W(s => sessionStorage.setItem('stage', s), JSON.stringify(stage));
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		await boot(map);
		await W((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.px = x * 16; P.py = y * 16; P.facing = f; }, x, y, f);
	};
	// talk, then answer every message / yes-no with Z until the scene is over;
	// returns every page of text shown
	const talk = () => W(async () => {
		const O = window.__ow, C = await import('./choice.js');
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const seen = [];
		O.interact();
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < 15000) {
			const d = O.dialog.blocking, c = O.cutscene.blocking, b = O.battle.blocking;
			if (b) return { seen, battle: true };
			if (d && O.dialog.pages) { const p = O.dialog.pages.flat().join(' '); if (seen[seen.length - 1] !== p) seen.push(p); }
			if (C.choiceMenu.open || d) press('z');
			if (!d && !c && !C.choiceMenu.open) { if (++calm >= 15) break; } else calm = 0;
			await new Promise(r => setTimeout(r, 40));
		}
		return { seen, battle: false };
	});
	const story = () => W(() => JSON.parse(localStorage.getItem('magepunk_story') || '{}'));

	const npcAt = (x, y) => W((x, y) => { const n = window.__ow.npcs.list.find(n => n.tx === x && n.ty === y); return n ? { hidden: !!n.hidden, script: n.ev && n.ev.script } : null; }, x, y);
	const JOHTO7 = { badges: { JOHTO: { zephyr: true, hive: true, plain: true, fog: true, storm: true, mineral: true, glacier: true } }, champion: {} };

	// ===== 1. the Radio Tower takeover =====
	// Instinct's save: seven Johto badges, Pryce beaten, the tower still peaceful
	await scene('RadioTower2F', 1, 2, 'up', { flags: { crystal_events_seeded: true, EVENT_RADIO_TOWER_ROCKET_TAKEOVER: true, EVENT_BEAT_PRYCE: true, ENGINE_GLACIERBADGE: true }, badges: JOHTO7 });
	const s1 = (await story()).flags || {};
	A(s1.ENGINE_ROCKETS_IN_RADIO_TOWER === true && s1.EVENT_RADIO_TOWER_BLACKBELT_BLOCKS_STAIRS === true && !s1.EVENT_RADIO_TOWER_ROCKET_TAKEOVER,
		'1. seven Johto badges start the takeover (RadioTowerRocketsScript)', JSON.stringify({ r: s1.ENGINE_ROCKETS_IN_RADIO_TOWER, g: s1.EVENT_RADIO_TOWER_BLACKBELT_BLOCKS_STAIRS, t: s1.EVENT_RADIO_TOWER_ROCKET_TAKEOVER }));
	const guard = await npcAt(0, 1);
	A(!guard || guard.hidden, '1. ...so the 2F stair guard is gone from (0,1)', JSON.stringify(guard));
	A(!s1.EVENT_GOLDENROD_CITY_ROCKET_TAKEOVER, '1. ...and the Rockets are in Goldenrod (6th badge: GoldenrodRocketsScript)');
	// six badges: Goldenrod's Rockets, not yet the tower
	await scene('RadioTower2F', 1, 2, 'up', { flags: { crystal_events_seeded: true, EVENT_RADIO_TOWER_ROCKET_TAKEOVER: true, EVENT_GOLDENROD_CITY_ROCKET_TAKEOVER: true }, badges: { badges: { JOHTO: { zephyr: true, hive: true, plain: true, fog: true, storm: true, mineral: true } }, champion: {} } });
	const s1b = (await story()).flags || {};
	A(!s1b.EVENT_GOLDENROD_CITY_ROCKET_TAKEOVER && !s1b.ENGINE_ROCKETS_IN_RADIO_TOWER && s1b.EVENT_RADIO_TOWER_ROCKET_TAKEOVER === true, '1. six badges: Rockets in Goldenrod, the tower not yet taken', JSON.stringify(s1b));
	// a cleared tower stays cleared
	await scene('RadioTower2F', 1, 2, 'up', { flags: { crystal_events_seeded: true, EVENT_CLEARED_RADIO_TOWER: true, EVENT_RADIO_TOWER_ROCKET_TAKEOVER: true }, badges: JOHTO7 });
	const s1c = (await story()).flags || {};
	A(!s1c.ENGINE_ROCKETS_IN_RADIO_TOWER && s1c.EVENT_RADIO_TOWER_ROCKET_TAKEOVER === true, '1. once the tower is cleared nothing restarts it');

	// ===== 2. HIKER ANTHONY: beaten, called for a rematch, talked to =====
	await scene('Route33', 6, 14, 'up', { flags: { crystal_events_seeded: true, EVENT_BEAT_HIKER_ANTHONY: true, EVENT_ANTHONY_ASKED_FOR_PHONE_NUMBER: true, ENGINE_ANTHONY_READY_FOR_REMATCH: true } });
	await W(() => localStorage.setItem('magepunk_defeated_v1', JSON.stringify(['MAP_ROUTE_33:Route33_SPRITE_POKEFAN_M'])));
	await W(() => window.__ow.trainers.reloadDefeated && window.__ow.trainers.reloadDefeated());
	const an = await talk();
	A(an.battle || an.seen.length > 0, '2. talking to the beaten ANTHONY does something', JSON.stringify(an));
	A(an.battle, '2. ...his rematch starts (ENGINE_ANTHONY_READY_FOR_REMATCH)', JSON.stringify(an));

	// ...and an unbeaten ANTHONY battles when talked to (Muse's other observation)
	await scene('Route33', 6, 14, 'up', { flags: { crystal_events_seeded: true } });
	const an0 = await talk();
	A(an0.battle, '2. talking to an unbeaten ANTHONY starts his battle', JSON.stringify(an0));

	// ===== 3. the std RADIOs: a bg_event with no script body and no sign text =====
	await scene('KurtsHouse', 6, 2, 'up', { flags: { crystal_events_seeded: true } });
	await W(() => window.__ow.interact());
	await sleep(300);
	const radio = await W(async () => { const F = await import('./ow_features.js'); return { open: F.radioMenu.open, dialog: window.__ow.dialog.pages ? window.__ow.dialog.pages.flat().join(' ') : null }; });
	A(radio.open, "3. KURT's radio opens the RADIO menu (not '...')", JSON.stringify(radio));

	// ===== 4. the BUG-CATCHING CONTEST: Fly out of the park ends it, unjudged =====
	const contestSave = async (x, y, f) => {
		await scene('NationalPark', x, y, f, { flags: { crystal_events_seeded: true }, bag: { pokeball: 5, sportball: 4 } });
		await W((m) => {
			const B = window.__ow.bugContest;
			B.active = true; B.caught = m; B.date = new Date().toDateString();
			localStorage.setItem('magepunk_bugcontest_v1', JSON.stringify(B));
		}, mon('spinarak', 'SPINARAK'));
	};
	const contestState = () => W(() => ({ active: window.__ow.bugContest.active, caught: !!window.__ow.bugContest.caught, balls: window.__ow.Bag.count('sportball'), party: window.__ow.party.length }));
	await contestSave(20, 20, 'down');
	await W(async () => { const T = await import('./ow_transitions.js'); await T.flyTo('MAP_GOLDENROD_CITY', 15, 28); });
	await sleep(600);
	const fl = await contestState();
	A(!fl.active && !fl.caught && fl.balls === 0, '4. Fly to Goldenrod ends the contest (Script_AbortBugContest): over, entry forfeited, SPORT BALLS gone', JSON.stringify(fl));
	// walking out through a gate is still how you're judged
	await contestSave(10, 46, 'down');
	await page.keyboard.down('ArrowDown'); await sleep(240); await page.keyboard.up('ArrowDown');
	for (let i = 0; i < 40 && !(await W(() => window.__ow.dialog.blocking)); i++) await sleep(100);
	const gate = await W(() => ({ map: window.__ow.world.current.name, d: window.__ow.dialog.pages ? window.__ow.dialog.pages.flat().join(' ') : '', active: window.__ow.bugContest.active }));
	A(/Gate/.test(gate.map) && /results are in/i.test(gate.d) && !gate.active, '4. ...while walking out through the gate is judged', JSON.stringify(gate).slice(0, 200));

	// ===== 5. SURF can't climb a WATERFALL (Meteor Falls, no Rain Badge) =====
	await scene('MeteorFalls_1F_1R', 12, 17, 'up', { flags: { crystal_events_seeded: true } });
	const wf = await W(() => { const w = window.__ow.world; for (let y = 17; y > 0; y--) if (w.behaviorAt(12, y) === 0x13) return y; return null; });
	A(wf != null, '5. Meteor Falls 1F has its waterfall in column 12', String(wf));
	await W((y) => { const P = window.__ow.player; P.tx = 12; P.ty = y + 1; P.x = P.px = 12 * 16; P.y = P.py = (y + 1) * 16; P.surfing = true; P.facing = 'up'; }, wf);
	for (let i = 0; i < 4; i++) { await page.keyboard.down('ArrowUp'); await sleep(260); await page.keyboard.up('ArrowUp'); await sleep(150); }
	const at = await W(() => ({ x: window.__ow.player.tx, y: window.__ow.player.ty, surf: window.__ow.player.surfing }));
	A(at.y === wf + 1 && at.surf, '5. surfing UP into the waterfall is a wall (it pushes you back south)', JSON.stringify({ wf, at }));
	// riding it DOWN is still allowed
	await W((y) => { const P = window.__ow.player; P.tx = 12; P.ty = y - 1; P.x = P.px = 12 * 16; P.y = P.py = (y - 1) * 16; P.surfing = true; P.facing = 'down'; }, wf);
	const above = await W((y) => window.__ow.world.isSurfable(12, y - 1) || window.__ow.world.behaviorAt(12, y - 1) === 0x13, wf);
	if (above) {
		await page.keyboard.down('ArrowDown'); await sleep(260); await page.keyboard.up('ArrowDown'); await sleep(200);
		const dn = await W(() => window.__ow.player.ty);
		A(dn >= wf, '5. ...and down it is still open', JSON.stringify({ wf, dn }));
	}

	// ===== 6. a caught ZAPDOS leaves no decomp object behind =====
	await scene('PowerPlant', 5, 12, 'up', { flags: { legend_caught_zapdos: true } });
	const z = await W(() => ({ hide: !!JSON.parse(localStorage.getItem('magepunk_story')).flags.FLAG_HIDE_ZAPDOS, npc: window.__ow.npcs.list.some(n => n.tx === 5 && n.ty === 11) }));
	A(z.hide && !z.npc, '6. with ZAPDOS caught, its Power Plant object is hidden (FLAG_HIDE_ZAPDOS)', JSON.stringify(z));
	const zt = await talk();
	const zf = (await story()).flags || {};
	A(!zt.battle && !zt.seen.some(p => /Gyaoo/i.test(p)), '6. ...so facing its tile no longer runs the script that "wins" with no battle', JSON.stringify(zt));
	A(zf.FLAG_FOUGHT_ZAPDOS === true, "6. ...and FLAG_FOUGHT_ZAPDOS is set, so the map's ON_TRANSITION won't show it again");
	// not caught yet: the native encounter is still there
	await scene('PowerPlant', 5, 12, 'up', {});
	const zn = await W(() => !!JSON.parse(localStorage.getItem('magepunk_story')).flags.FLAG_HIDE_ZAPDOS);
	A(!zn, '6. an uncaught ZAPDOS is left alone');

	// ===== 7. Mt. Moon B2F: the DOME / HELIX fossils are there and can be chosen =====
	await scene('MtMoon_B2F', 13, 8, 'up', { flags: {} });
	const fos = await W(() => window.__ow.npcs.list.filter(n => n.ty === 7 && (n.tx === 13 || n.tx === 14)).map(n => [n.tx, n.ev.script, !!n.deco]));
	A(fos.length === 2, '7. both fossils are drawn on B2F (13,7) and (14,7)', JSON.stringify(fos));
	const ft = await talk();
	const fb = await W(() => ({ dome: window.__ow.Bag.count('domefossil'), helix: window.__ow.Bag.count('helixfossil') }));
	const ff = (await story()).flags || {};
	A(fb.dome === 1 && ff.FLAG_GOT_FOSSIL_FROM_MT_MOON === true, '7. facing the DOME FOSSIL and saying YES takes it (FLAG_GOT_FOSSIL_FROM_MT_MOON)', JSON.stringify({ fb, ft: ft.seen.slice(0, 3) }));
	A(fb.helix === 0, '7. ...and only that one', JSON.stringify(fb));

	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
