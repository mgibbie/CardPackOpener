// glass_workshop_test.mjs — the Glass Workshop sells flutes for volcanic ash.
//
// 2026-10-05: three things kept the Route 113 Glass Workshop from ever working:
//   - its prices are `.set` constants in the map's scripts.inc, never generated,
//   - `special ShowScrollableMultichoice` (its menu) was never implemented, and
//   - the transpile wrote `subvar VAR_ASH_GATHER_COUNT, BLUE_FLUTE_PRICE` as an
//     `addvar` — resolve the price and every purchase GIVES 250 ash.
// The glassblower himself is NATIVE (ow_fieldmoves.js glassBlowerTalk, its own
// ash record) and intercepts the talk, so the decomp script below never runs from
// him today — the add-instead-of-subtract bug was latent. These run the decomp
// labels directly, as the map would, to prove the restored script is right:
//   1. the converted labels now hold `subvar`, not `addvar` (subvar_fix.js)
//   2. 600 ash, BLUE FLUTE: costs exactly 250 (ash 350) and lands in the bag
//   3. 300 ash, YELLOW FLUTE (500): refused, nothing taken; VAR_0x800A says 200
//      more are needed (the second subvar), and the scroll menu opens to choose again
//   4. the native glassblower still works as before (talk -> his own catalog)
//
//   node overworld/tests/glass_workshop_test.mjs
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
const PORT = 9229;
const STATE = { username: 'glassws', friendCode: 'GLSW01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'mudkip', name: 'MUDKIP', level: 20, types: ['Water'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 60, atk: 30, def: 30, spa: 30, spd: 30, spe: 30 }, maxHP: 60, curHP: 60, exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's258.png', num: 258 }];
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
async function session(ash) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, ash) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'hoenn'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_bag_v1', JSON.stringify({ sootsack: 1 }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true },
			vars: { VAR_GLASS_WORKSHOP_STATE: 2, VAR_ASH_GATHER_COUNT: ash } }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY, ash);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route113_GlassWorkshop&x=2&y=4`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === 'Route113_GlassWorkshop')).catch(() => false)); i++) await sleep(100);
	await sleep(900);
	await page.evaluate(() => { const P = window.__ow.player; P.tx = 2; P.ty = 4; P.x = 32; P.y = 64; P.facing = 'up'; window.__said = []; });
	return { page, ctx, errors };
}
// press Z through dialog until a menu opens or everything is still
const drive = page => page.evaluate(async () => {
	const C = await import('./choice.js'), O = window.__ow;
	const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < 15000) {
		if (C.choiceMenu.open) return 'menu';
		const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
		if (!d && !c && f.alpha < 0.001 && f.target < 0.001) { if (++calm >= 12) return 'idle'; } else calm = 0;
		if (d) { window.__said.push(JSON.stringify(O.dialog.pages || '')); press('z'); }
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
});
const st = page => page.evaluate(async () => {
	const E = await import('./events.js'), C = await import('./choice.js');
	return { ash: E.getVar('VAR_ASH_GATHER_COUNT'), need: E.getVar('VAR_0x800A'), bag: JSON.parse(localStorage.getItem('magepunk_bag_v1') || '{}'),
		menu: C.choiceMenu.open ? C.choiceMenu.options.slice() : null, said: (window.__said || []).join(' | ') };
});
const key = async (page, k) => { await page.keyboard.press(k); await sleep(80); };

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	// run a decomp label against the map's assembled scripts (S.mapScripts), Z through dialog
	const runLabel = (page, label) => page.evaluate(async label => {
		const { S } = await import('./ow_state.js');
		const O = window.__ow; O.cutscene.run(S.mapScripts, label, O.cutsceneCtxForTest());
	}, label);

	// ===== 1 + 2. the converted labels subtract; Blue Flute for 250 =====
	{
		const { page, ctx, errors } = await session(600);
		const ops = await page.evaluate(async () => { const { S } = await import('./ow_state.js');
			const L = S.mapScripts.Route113_GlassWorkshop_EventScript_BlueFlute || [];
			return L.filter(o => o.var === 'VAR_ASH_GATHER_COUNT' && /addvar|subvar/.test(o.op)).map(o => o.op); });
		A(JSON.stringify(ops) === '["subvar"]', '1. the Blue Flute label now SUBTRACTS the price (subvar, not addvar)', JSON.stringify(ops));
		await page.evaluate(async () => { const E = await import('./events.js'); E.setVar('VAR_0x8009', 0); });
		await runLabel(page, 'Route113_GlassWorkshop_EventScript_BlueFlute');
		await drive(page);   // "Is that the item for you?" -> Z = yes, then the kiln + the gift
		const s = await st(page);
		const flute = Object.entries(s.bag).find(([k]) => /blue.?flute/i.test(k));
		A(s.ash === 350, '2. the Blue Flute costs exactly 250 ash (600 -> 350), not +250', JSON.stringify({ ash: s.ash }));
		A(!!flute && flute[1] === 1, '2. ...and the Blue Flute is in the bag', JSON.stringify(s.bag));
		A(errors.length === 0, '2. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}

	// ===== 3. 300 ash can't buy a Yellow Flute (500) =====
	{
		const { page, ctx } = await session(300);
		await runLabel(page, 'Route113_GlassWorkshop_EventScript_YellowFlute');
		const r = await drive(page);
		const s = await st(page);
		A(s.ash === 300 && !Object.keys(s.bag).some(k => /yellow/i.test(k)), '3. too little ash: refused, nothing taken, no flute', JSON.stringify({ ash: s.ash, bag: s.bag }));
		A(s.need === 200, '3. ...VAR_0x800A says 200 more are needed (500 - 300; the second subvar)', JSON.stringify({ need: s.need }));
		A(r === 'menu' && s.menu && s.menu[0] === 'BLUE FLUTE' && s.menu[s.menu.length - 1] === 'EXIT', '3. ...and the scroll menu (ShowScrollableMultichoice) opens to choose again', JSON.stringify({ r, menu: s.menu }));
		await ctx.close();
	}

	// ===== 4. the native glassblower is unchanged =====
	{
		const { page, ctx } = await session(0);
		await key(page, 'z');
		await drive(page);
		const s = await st(page);
		A(/GLASSBLOWER/.test(s.said) && s.bag.sootsack >= 1, '4. talking to the glassblower still runs the native shop', s.said.slice(0, 120));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
