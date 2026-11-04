// johto_scripts_test.mjs — six Johto scripts the transpile broke (2026-10-07 bug reports).
//
//   1. KIYO (Mt. Mortar B1F): the reward set EVENT_GOT_TYROGUE_FROM_KIYO and gave
//      nothing — `givepoke TYROGUE, 10` was dropped (Bill's EEVEE the same).
//   2. The TIN TOWER sage: ENGINE_FOGBADGE is set only by Morty's own script, so a
//      FOG BADGE won any other way read as missing.
//   3. Route 36 SUDOWOODO: the WEIRD_TREE object was dropped as a prop — no
//      encounter, and so no ROCK SMASH TM.
//   4. MOOMOO: a BERRY was taken but wMooMooBerries never counted it
//      (readmem / addval / writemem dropped).
//   5. The Goldenrod Underground switch room: the switches never moved
//      wUndergroundSwitchPositions, and the 22 door labels (an rgbasm `for` loop)
//      didn't exist — no door ever opened.
//   6. Ilex Forest FARFETCH'D: loadmem / moveobject / the facing check were
//      dropped, so the bird never moved on.
//
//   node overworld/tests/johto_scripts_test.mjs
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
const PORT = 9260;
const STATE = { username: 'johtoscripts', friendCode: 'JSCR01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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

// ===== 0. data: the restored ops are in the overlay =====
{
	const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld', 'crystal_scriptvar_data.json'), 'utf8')).patches;
	const has = (stem, label, pred) => (P[stem]?.[label] || []).some(pred);
	A(has('BillsFamilysHouse', 'BillScript', o => o.op === 'givemon' && o.species === 'SPECIES_EEVEE'), "0. Bill's EEVEE: the dropped givepoke is back");
	const doors = Object.keys(P.GoldenrodUndergroundSwitchRoomEntrances || {}).filter(l => /\.(Open|Close)Door\d+$/.test(l));
	A(doors.length === 22, '0. the switch room has all 22 door labels', String(doors.length));
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

	// ===== 1. KIYO's TYROGUE =====
	await scene('MountMortarB1F', 16, 5, 'up', { flags: { EVENT_BEAT_BLACKBELT_KIYO: true } });
	const k = await talk();
	const party1 = await W(() => window.__ow.party.map(m => m.speciesId));
	A(party1.length === 6 && party1.includes('tyrogue'), '1. KIYO: TYROGUE joins the free party slot', JSON.stringify([party1, k.seen.slice(-3)]));
	A((await story()).flags.EVENT_GOT_TYROGUE_FROM_KIYO === true, '1. ...and only then is the reward marked received');

	// ===== 2. the TIN TOWER sage =====
	await scene('EcruteakTinTowerEntrance', 5, 7, 'up', { badges: { badges: { JOHTO: { zephyr: true, hive: true, plain: true, fog: true } }, champion: {} } });
	const fogFlag = await W(() => window.__ow.Story.getFlag('ENGINE_FOGBADGE'));
	A(fogFlag === true, '2. a held FOG BADGE answers ENGINE_FOGBADGE', String(fogFlag));
	const sage = await talk();
	A(sage.seen.some(p => /Please, go[\s\S]*right through/.test(p)), '2. the sage: "ECRUTEAK\'s GYM BADGE! Please, go right through."', JSON.stringify(sage.seen));

	// ===== 3. Route 36 SUDOWOODO =====
	await scene('Route36', 36, 9, 'left', { bag: { pokeball: 5, squirtbottle: 1 } });
	const tree = await W(() => { const n = window.__ow.npcs.list.find(n => n.ev && n.ev.script === 'SudowoodoScript'); return n ? { x: n.tx, y: n.ty, hidden: !!n.hidden } : null; });
	A(tree && tree.x === 35 && tree.y === 9 && !tree.hidden, '3. the weird tree stands at (35,9)', JSON.stringify(tree));
	const sudo = await talk();
	const foe = await W(() => { const b = window.__ow.battle; return b && (b.foe?.speciesId || b.enemy?.speciesId || b.state?.foe?.speciesId || b.wild?.speciesId || null); });
	A(sudo.battle, '3. watering it with the SQUIRTBOTTLE starts the SUDOWOODO battle', JSON.stringify([sudo.seen.slice(-2), foe]));

	// ===== 4. MOOMOO =====
	await scene('Route39Barn', 3, 4, 'up', { flags: { EVENT_TALKED_TO_FARMER_ABOUT_MOOMOO: true }, bag: { pokeball: 5, berry: 3 } });
	await talk();
	const s4 = await story(), bag4 = await W(() => JSON.parse(localStorage.getItem('magepunk_bag_v1') || '{}'));
	A(bag4.berry === 2 && s4.vars.wMooMooBerries === 1, '4. MOOMOO: the BERRY is eaten and counted (wMooMooBerries 1)', JSON.stringify([bag4.berry, s4.vars.wMooMooBerries]));
	await scene('Route39Barn', 3, 4, 'up', { flags: { EVENT_TALKED_TO_FARMER_ABOUT_MOOMOO: true }, vars: { wMooMooBerries: 6 }, bag: { pokeball: 5, berry: 1 } });
	const m7 = await talk();
	const s7 = await story();
	A(s7.flags.EVENT_HEALED_MOOMOO === true, '4. the seventh BERRY heals MOOMOO', JSON.stringify([m7.seen.slice(-2), s7.vars.wMooMooBerries]));

	// ===== 5. the switch room =====
	await scene('GoldenrodUndergroundSwitchRoomEntrances', 16, 2, 'up');
	const cell = () => W(() => { const w = window.__ow.world; return { pass: w.isPassable(16, 6) && w.isPassable(17, 6) }; });
	const before = await cell();
	await talk();
	const s5 = await story(), after = await cell();
	A(s5.flags.EVENT_SWITCH_1 === true && s5.vars.wUndergroundSwitchPositions === 1, '5. SWITCH 1 ON: wUndergroundSwitchPositions 1', JSON.stringify([s5.flags.EVENT_SWITCH_1, s5.vars.wUndergroundSwitchPositions]));
	A(s5.flags.EVENT_DOOR_1_OPEN === true && !before.pass && after.pass, '5. ...and door 1 (16,6) opens', JSON.stringify([s5.flags.EVENT_DOOR_1_OPEN, before, after]));
	// the TILES callback redraws an open door on the next visit
	await scene('GoldenrodUndergroundSwitchRoomEntrances', 16, 2, 'up', { flags: { EVENT_SWITCH_1: true, EVENT_DOOR_1_OPEN: true }, vars: { wUndergroundSwitchPositions: 1 } });
	A((await cell()).pass, '5. an open door stays open when the room loads again');

	// ===== 6. FARFETCH'D =====
	await scene('IlexForest', 14, 32, 'up', { flags: ILEX });
	await talk();
	const bird = () => W(() => { const n = window.__ow.npcs.list.find(n => n.ev && n.ev.script === 'IlexForestFarfetchdScript'); return n ? { x: n.tx, y: n.ty, hidden: !!n.hidden } : null; });
	const s6 = await story(), b6 = await bird();
	A(s6.vars.wFarfetchdPosition === 2 && b6 && b6.x === 15 && b6.y === 25, "6. FARFETCH'D runs off to its second spot (15,25)", JSON.stringify([s6.vars.wFarfetchdPosition, b6]));
	await scene('IlexForest', 15, 26, 'up', { flags: ILEX, vars: { wFarfetchdPosition: 2 } });
	const b6b = await bird();
	A(b6b && b6b.x === 15 && b6b.y === 25, '6. ...and is still there after leaving and coming back', JSON.stringify(b6b));
	await talk();   // approached from below (facing UP): on to spot 3, (20,24)
	const s6c = await story(), b6c = await bird();
	A(s6c.vars.wFarfetchdPosition === 3 && b6c && b6c.x === 20 && b6c.y === 24, '6. herded again from below: spot 3 (20,24)', JSON.stringify([s6c.vars.wFarfetchdPosition, b6c]));

	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
