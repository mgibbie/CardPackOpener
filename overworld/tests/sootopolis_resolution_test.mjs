// sootopolis_resolution_test.mjs — the Hoenn awakening's end leaves Sootopolis
// where pokeemerald's real scenes leave it.
//
// 2026-10-08, Instinct's blocker (bug:1791498021805): the port's own awakening
// director resolved the crisis (VAR_HOENN_AWAKENING 6) but left the decomp's
// VAR_SOOTOPOLIS_CITY_STATE at 4, so Wallace kept saying "Haven't you scaled the
// SKY PILLAR?", Archie kept pleading with KYOGRE, and ON_LOAD kept the gym door
// (31,32) locked: no route to the eighth badge.
//   1. a save at Instinct's state heals on load: city state 5, Sky Pillar state 3
//   2. Wallace's line is the after-Rayquaza one, not "scale the SKY PILLAR"
//   3. Maxie + Archie talk, leave (FLAG_SOOTOPOLIS_ARCHIE_MAXIE_LEAVE) — and the
//      reloaded map's gym door is OPEN (the cached layout kept it shut)
//   4. Wallace then hands over HM WATERFALL
//   5. Sky Pillar Top: the decomp's RAYQUAZA_STILL, shown once the pillar state is
//      >= 2, does not sit on the native encounter tile while Rayquaza is uncaught
//
//   node overworld/tests/sootopolis_resolution_test.mjs
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
const PORT = 9340;
const STATE = { username: 'soot1008', friendCode: 'SOOT08', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (id, name) => ({
	speciesId: id, name, level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
});
const FIVE = ['A', 'B', 'C', 'D', 'E'].map(n => mon('rattata', n));
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
			magepunk_mp_token_v1: 't', magepunk_mp_state_v1: STATE, magepunk_region: 'HOENN', magepunk_name: 'MAY',
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

	// stand next to the NPC whose script is `script`, facing it
	const faceNpc = script => W(script => {
		const O = window.__ow, n = O.npcs.list.find(n => n.ev && n.ev.script === script && !n.hidden);
		if (!n) return null;
		for (const [dx, dy, f] of [[0, 1, 'up'], [0, -1, 'down'], [-1, 0, 'right'], [1, 0, 'left']]) {
			const x = n.tx + dx, y = n.ty + dy;
			if (!O.world.isPassable(x, y) || O.npcs.list.some(m => m !== n && !m.hidden && m.tx === x && m.ty === y)) continue;
			const P = O.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.px = x * 16; P.py = y * 16; P.facing = f;
			return { x: n.tx, y: n.ty, from: [x, y, f] };
		}
		return { x: n.tx, y: n.ty, from: null };
	}, script);
	const vars = async () => (await story()).vars || {};
	const flags = async () => (await story()).flags || {};
	const INSTINCT = {
		flags: { villain_hoenn_climax: true, FLAG_KYOGRE_ESCAPED_SEAFLOOR_CAVERN: true },
		vars: { VAR_HOENN_AWAKENING: 6, VAR_SOOTOPOLIS_CITY_STATE: 4 },
	};

	// ===== 1. the save heals on load =====
	await scene('SootopolisCity', 31, 34, 'up', INSTINCT);
	let v = await vars();
	A(v.VAR_SOOTOPOLIS_CITY_STATE === 5, '1. VAR_SOOTOPOLIS_CITY_STATE reaches 5 (where SkyPillar_Top leaves it)', JSON.stringify(v.VAR_SOOTOPOLIS_CITY_STATE));
	A(v.VAR_SKY_PILLAR_STATE === 3, '1. VAR_SKY_PILLAR_STATE reaches 3 (where the Sootopolis Rayquaza scene leaves it)', JSON.stringify(v.VAR_SKY_PILLAR_STATE));
	A(await W(() => !window.__ow.world.isPassable(31, 32)), '1. the gym door is still locked until Archie and Maxie leave (as in the decomp)');

	// ===== 2. Wallace =====
	let at = await faceNpc('SootopolisCity_EventScript_Wallace');
	A(at && at.from, '2. Wallace stands outside the gym', JSON.stringify(at));
	let t = await talk();
	A(!/scaled the SKY PILLAR|SKY PILLAR yet/i.test(t.seen.join(' ')) && /TEAM MAGMA and AQUA/i.test(t.seen.join(' ')),
		'2. Wallace speaks of TEAM MAGMA and AQUA, not "scale the SKY PILLAR"', JSON.stringify(t.seen).slice(0, 300));

	// ===== 3. Maxie + Archie leave; the gym opens =====
	at = await faceNpc('SootopolisCity_EventScript_Maxie');
	t = await talk();
	A(/super-ancient/i.test(t.seen.join(' ')), "3. Maxie's after-Rayquaza line", JSON.stringify(t.seen).slice(0, 200));
	at = await faceNpc('SootopolisCity_EventScript_Archie');
	t = await talk();
	A(/flew off to who knows where/i.test(t.seen.join(' ')), "3. Archie's after-Rayquaza line (not 'KYOGRE! What's wrong?!')", JSON.stringify(t.seen).slice(0, 200));
	await sleep(1500);
	const f3 = await flags();
	A(f3.FLAG_SOOTOPOLIS_ARCHIE_MAXIE_LEAVE === true, '3. FLAG_SOOTOPOLIS_ARCHIE_MAXIE_LEAVE is set', JSON.stringify(f3.FLAG_SOOTOPOLIS_ARCHIE_MAXIE_LEAVE));
	A(await W(() => window.__ow.world.current.name === 'SootopolisCity' && window.__ow.world.isPassable(31, 32)),
		'3. ...and on the reloaded map the gym door (31,32) is OPEN');

	// ===== 4. HM WATERFALL =====
	at = await faceNpc('SootopolisCity_EventScript_Wallace');
	t = await talk();
	const f4 = await flags();
	const bag = await W(() => JSON.parse(localStorage.getItem('magepunk_bag_v1') || '{}'));
	A(f4.FLAG_RECEIVED_HM_WATERFALL === true && Object.keys(bag).some(k => /waterfall|hm07/i.test(k)),
		'4. Wallace hands over HM WATERFALL', JSON.stringify([f4.FLAG_RECEIVED_HM_WATERFALL, Object.keys(bag)]));

	// ===== 5. Sky Pillar Top =====
	await scene('SkyPillar_Top', 14, 9, 'up', INSTINCT);
	const top = await W(() => {
		const O = window.__ow;
		return { npc: O.npcs.list.some(n => !n.hidden && n.tx === 14 && n.ty === 6), still: O.npcs.list.some(n => /RAYQUAZA_STILL/.test((n.ev && n.ev.graphics_id) || '')) };
	});
	A(!top.npc, "5. nothing stands on the native RAYQUAZA tile (14,6) while it's uncaught", JSON.stringify(top));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
