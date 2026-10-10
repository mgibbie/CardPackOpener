// radio_tower_5f_test.mjs — the Radio Tower takeover can be finished.
//
// 2026-10-09, Instinct (bug:1791582508724, BLOCKER): after #667 began the
// takeover at seven Johto badges, STORY_SEED's free-roam resting value for
// VAR_SCENE_RadioTower5F (2 = SCENE_RADIOTOWER5F_NOOP) also silenced the Rocket
// boss's coord event at (16,5) (scene 1): the takeover could never end,
// EVENT_CLEARED_RADIO_TOWER never set, Clair's gym stayed blocked.
//   1. Instinct's save (scene 2, takeover on, through the Basement door with
//      another region's BASEMENT KEY, Card Key used, both executives beaten)
//      boots with the scene re-armed to ROCKET_BOSS (1)
//   2. stepping onto (16,5) starts the boss battle; winning runs the decomp's
//      ending: EVENT_CLEARED_RADIO_TOWER, CLEAR BELL, takeover over, scene 2
//   3. a fresh takeover (fake Director not yet met) re-arms to FAKE_DIRECTOR (0)
//   4. a cleared tower keeps scene 2 (no var moves backwards)
//
//   node overworld/tests/radio_tower_5f_test.mjs
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
const PORT = 9360;
const STATE = { username: 'rt5f', friendCode: 'RT5F01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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

	const TAKEOVER = {
		crystal_events_seeded: true, ENGINE_ROCKETS_IN_RADIO_TOWER: true, EVENT_GOLDENROD_CITY_CIVILIANS: true,
		EVENT_RADIO_TOWER_BLACKBELT_BLOCKS_STAIRS: true, EVENT_RADIO_TOWER_CIVILIANS_AFTER: true,
	};
	const INSTINCT = { ...TAKEOVER, EVENT_USED_BASEMENT_KEY: true, EVENT_USED_THE_CARD_KEY_IN_THE_RADIO_TOWER: true,
		EVENT_RECEIVED_CARD_KEY: true, EVENT_BEAT_ROCKET_EXECUTIVEM_2: true, EVENT_BEAT_ROCKET_EXECUTIVEF_1: true, EVENT_BEAT_ROCKET_EXECUTIVEF_2: true };
	const sceneVar = async () => (await story()).vars?.VAR_SCENE_RadioTower5F;

	// ===== 1. Instinct's save boots re-armed =====
	await scene('RadioTower5F', 17, 5, 'left', { flags: INSTINCT, vars: { VAR_SCENE_RadioTower5F: 2 }, badges: JOHTO7, bag: { pokeball: 5, basementkey: 1, cardkey: 2 } });
	A(await sceneVar() === 1, "1. Instinct's save: VAR_SCENE_RadioTower5F re-armed 2 -> ROCKET_BOSS (1) on load", JSON.stringify(await sceneVar()));

	// ===== 2. the boss's coord event fires; winning ends the takeover =====
	await page.keyboard.down('ArrowLeft'); await sleep(260); await page.keyboard.up('ArrowLeft');
	let fought = false;
	for (let i = 0; i < 100 && !fought; i++) {
		fought = await W(() => !!window.__ow.battle.blocking);
		if (!fought) await W(() => { if (window.__ow.dialog.blocking) dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true })); });
		await sleep(100);
	}
	A(fought, '2. stepping onto (16,5) starts the Rocket boss battle (RadioTower5FRocketBossScript)', JSON.stringify(await W(() => ({ x: window.__ow.player.tx, y: window.__ow.player.ty }))));
	// ...with the decomp's EXECUTIVEM_1 party, not the generic pool (2026-10-09,
	// Instinct: "Trainer" with a lone Lv12 Mankey). In JohKanto/post-game the
	// levels may scale, so the species and the name are the check.
	if (fought) {
		const foe = await W(() => { const a = window.__ow.battle.active; return { species: (a?.foes || []).map(m => m.speciesId), name: a?.info?.displayName }; });
		A(JSON.stringify(foe.species) === JSON.stringify(['houndour', 'koffing', 'houndoom']), "2. the Executive fights EXECUTIVEM_1's party: Houndour, Koffing, Houndoom", JSON.stringify(foe));
		A(/EXECUTIVE/.test(foe.name || ''), '2. ...under the name ROCKET EXECUTIVE, not a bare "Trainer"', JSON.stringify(foe.name));
	}
	if (fought) {
		await W(async () => {
			const b = window.__ow.battle; b.finish('victory');
			for (let i = 0; i < 300 && b.active; i++) { b.update(0.1); await new Promise(r => setTimeout(r, 10)); }
		});
		// read through the boss's lines and the Director's thanks
		await W(async () => {
			const O = window.__ow; const t0 = Date.now(); let calm = 0;
			while (Date.now() - t0 < 20000) {
				const busy = O.dialog.blocking || O.cutscene.blocking || O.battle.blocking;
				if (O.dialog.blocking) dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true }));
				if (!busy) { if (++calm >= 20) break; } else calm = 0;
				await new Promise(r => setTimeout(r, 40));
			}
		});
	}
	const after = await story();
	const f = after.flags || {};
	A(f.EVENT_BEAT_ROCKET_EXECUTIVEM_1 && f.EVENT_CLEARED_RADIO_TOWER, "2. winning sets EVENT_BEAT_ROCKET_EXECUTIVEM_1 + EVENT_CLEARED_RADIO_TOWER (Clair's gym path)", JSON.stringify({ b: f.EVENT_BEAT_ROCKET_EXECUTIVEM_1, c: f.EVENT_CLEARED_RADIO_TOWER }));
	A(!f.ENGINE_ROCKETS_IN_RADIO_TOWER && f.EVENT_RADIO_TOWER_ROCKET_TAKEOVER && f.EVENT_GOT_CLEAR_BELL && f.EVENT_TEAM_ROCKET_DISBANDED,
		"2. ...and the decomp's ending runs: takeover over, CLEAR BELL, Rocket disbanded", JSON.stringify({ r: f.ENGINE_ROCKETS_IN_RADIO_TOWER, t: f.EVENT_RADIO_TOWER_ROCKET_TAKEOVER, bell: f.EVENT_GOT_CLEAR_BELL, d: f.EVENT_TEAM_ROCKET_DISBANDED }));
	A(after.vars?.VAR_SCENE_RadioTower5F === 2, '2. ...and 5F rests at NOOP (2) again', JSON.stringify(after.vars?.VAR_SCENE_RadioTower5F));
	A(!!JSON.parse((await W(() => localStorage.getItem('magepunk_bag_v1'))) || '{}').clearbell, '2. the CLEAR BELL is in the bag');

	// ===== 3. a fresh takeover re-arms the fake Director first =====
	await scene('RadioTower5F', 4, 5, 'left', { flags: TAKEOVER, vars: { VAR_SCENE_RadioTower5F: 2 }, badges: JOHTO7 });
	A(await sceneVar() === 0, '3. a fresh takeover: re-armed to FAKE_DIRECTOR (0) — he hands over the BASEMENT KEY first', JSON.stringify(await sceneVar()));

	// ===== 4. a cleared tower is left alone =====
	await scene('RadioTower5F', 4, 5, 'left', { flags: { ...TAKEOVER, ENGINE_ROCKETS_IN_RADIO_TOWER: false, EVENT_CLEARED_RADIO_TOWER: true, EVENT_BEAT_ROCKET_EXECUTIVEM_1: true }, vars: { VAR_SCENE_RadioTower5F: 2 }, badges: JOHTO7 });
	A(await sceneVar() === 2, '4. a cleared tower keeps NOOP (2)', JSON.stringify(await sceneVar()));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
