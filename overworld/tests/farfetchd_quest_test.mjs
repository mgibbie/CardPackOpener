// farfetchd_quest_test.mjs — the Ilex Forest FARFETCH'D herding quest runs to the end.
//
// 2026-10-14, bug:1791938269646 (remytest): at wFarfetchdPosition 5 the bird ran
// part of its path and the position never advanced, so EVENT_HERDED_FARFETCHD
// never set and the Ilex barrier (Route 34, Goldenrod) stayed shut.
//
//   node overworld/tests/farfetchd_quest_test.mjs
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
const PORT = 9481;
const STATE = { username: 'farfetchd', friendCode: 'FARF01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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

let failOverlay = 0;   // section 3: the story overlay answers 503 this many times
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/overworld/crystal_scriptvar_data.json' && failOverlay > 0) { failOverlay--; res.writeHead(503); res.end('busy'); return; }
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

	const bird = () => W(() => { const n = window.__ow.npcs.list.find(n => n.ev && n.ev.script === 'IlexForestFarfetchdScript'); return n ? { x: n.tx, y: n.ty, hidden: !!n.hidden } : null; });

	// ===== 1. position 5, approached from above (facing DOWN): on to spot 6 =====
	await scene('IlexForest', 28, 30, 'down', { flags: ILEX, vars: { wFarfetchdPosition: 5 } });
	await page.keyboard.press('z');   // a real key press, not a tool call
	for (let i = 0; i < 60 && (await W(() => window.__ow.cutscene.blocking || window.__ow.dialog.blocking)); i++) { if (await W(() => window.__ow.dialog.blocking)) await page.keyboard.press('z'); await sleep(100); }
	const s1 = await story(), b1 = await bird();
	A(s1.vars.wFarfetchdPosition === 6 && b1 && b1.x === 24 && b1.y === 35, "1. position 5 -> 6: the bird runs to (24,35) and the quest advances", JSON.stringify([s1.vars.wFarfetchdPosition, b1]));

	// ===== 2. position 9, approached from the right (facing LEFT): the herd ends =====
	await scene('IlexForest', 11, 35, 'left', { flags: ILEX, vars: { wFarfetchdPosition: 9 } });
	await talk();
	const s2 = await story();
	A(s2.vars.wFarfetchdPosition === 10 && s2.flags.EVENT_HERDED_FARFETCHD === true, "2. position 9 -> 10: EVENT_HERDED_FARFETCHD (the apprentice's bird is home)", JSON.stringify([s2.vars.wFarfetchdPosition, s2.flags.EVENT_HERDED_FARFETCHD]));

	// ===== 3. the story overlay fails to load at boot (more times than getJSON retries) =====
	// The old loaders swallowed the failure and ran the raw transpile all session: the
	// bird still walked, but nothing wrote wFarfetchdPosition, so it stayed at 5 forever.
	failOverlay = 6;
	await scene('IlexForest', 28, 30, 'down', { flags: ILEX, vars: { wFarfetchdPosition: 5 } });
	let pending = null;
	for (let i = 0; i < 160; i++) {   // the background heal retries after 2 s, 5 s, ...
		pending = await W(async () => { try { return (await import('./overlay_heal.js')).pendingOverlays(); } catch (e) { return ['no overlay_heal.js']; } });
		if (!pending.length) break;
		await sleep(100);
	}
	A(pending && !pending.length, '3. the failed story overlay is fetched again in the background', JSON.stringify(pending));
	await talk();
	const s3 = await story(), b3 = await bird();
	A(s3.vars.wFarfetchdPosition === 6 && b3 && b3.x === 24 && b3.y === 35, '3. ...and the healed scripts advance the quest (position 5 -> 6)', JSON.stringify([s3.vars.wFarfetchdPosition, b3]));

	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
