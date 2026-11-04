// jasmine_tm_test.mjs — beating a Johto gym leader also hands over the TM.
//
// 2026-10-02, Instinct's bug report: Jasmine awarded the MINERAL BADGE but never
// TM23 IRON TAIL, and talking to her again only gave the roster's defeat quote.
// Two losses, both from the transpile:
//   - the decomp's badge path FALLS THROUGH from `scall OlivineGymActivateRockets`
//     into `.FightDone:` (the TM); split into separate labels, the edge was lost.
//     tools/gen_fallthrough.mjs restores the 374 such edges, verified against the
//     decomp source (overworld/fallthrough_data.json -> fallthrough.js)
//   - a beaten leader's later talk skipped her script (only Crystal trainer
//     HEADERS re-ran theirs), so the `EVENT_BEAT_JASMINE -> .FightDone` branch
//     that gives a late TM never ran
//   1. the first victory goes on to give TM23 (badge, then TM, then the speech)
//   2. a leader beaten before the fix: talking again gives the TM once, then
//      "Good luck"
//   3. a `jumptext` block (the decomp ENDS there) does not fall through
//
//   node overworld/tests/jasmine_tm_test.mjs
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
const PORT = 9204;
const STATE = { username: 'jasminetm', friendCode: 'JASM01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
}];
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
async function openGym(flags) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, fl) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'JOHTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...fl }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY, flags);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=OlivineGym&x=5&y=4`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === 'OlivineGym')).catch(() => false)); i++) await sleep(100);
	await sleep(1200);
	// the region's story seed hides her (she starts at the lighthouse); curing
	// AMPHY clears it in play — do that, and re-enter so she spawns
	await page.evaluate(async () => {
		(await import('./events.js')).clearFlag('EVENT_OLIVINE_GYM_JASMINE');
		await window.__ow.moveToMap('OlivineGym', 5, 4);
	});
	for (let i = 0; i < 100 && !(await page.evaluate(() => !!window.__ow.trainers.trainerAt(5, 3)).catch(() => false)); i++) await sleep(100);
	await sleep(600);
	return { page, ctx, errors };
}
// press Z through dialog until everything is still; collect what was said
const drive = page => page.evaluate(async () => {
	const O = window.__ow;
	const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < 20000) {
		const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
		if (!d && !c && f.alpha < 0.001 && f.target < 0.001) { if (++calm >= 12) return 'idle'; } else calm = 0;
		if (d) { (window.__said = window.__said || []).push(JSON.stringify(O.dialog.pages || '')); press('z'); }
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
});
const status = page => page.evaluate(async () => {
	const E = await import('./events.js');
	const bag = JSON.parse(localStorage.getItem('magepunk_bag_v1') || '{}');
	const tm = Object.entries(bag).filter(([k]) => /tm23|irontail/i.test(k));
	return { got: !!E.getFlag('EVENT_GOT_TM23_IRON_TAIL'), beat: !!E.getFlag('EVENT_BEAT_JASMINE'), badge: !!E.getFlag('ENGINE_MINERALBADGE'), tm, said: (window.__said || []).join(' | ') };
});

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// ===== 1. the first victory =====
	{
		const { page, ctx, errors } = await openGym({ EVENT_JASMINE_RETURNED_TO_GYM: true, EVENT_OLIVINE_LIGHTHOUSE_JASMINE: true });
		// run her real script on the game's cutscene; the battle is won on the spot
		await page.evaluate(async () => {
			const { S } = await import('./ow_state.js');
			const O = window.__ow;
			const t = O.trainers.trainerAt(5, 3);
			window.__said = [];
			O.cutscene.run(S.mapScripts, 'OlivineGymJasmineScript', { ...O.cutsceneCtxForTest(), talker: t, startBattle: () => null });
		});
		A((await drive(page)) === 'idle', '1. her script runs to the end');
		const s = await status(page);
		A(s.beat && s.badge, '1. the win sets EVENT_BEAT_JASMINE and the MINERAL BADGE', JSON.stringify(s));
		A(s.got && s.tm.length === 1 && s.tm[0][1] === 1, '1. ...and goes on to give TM23 IRON TAIL (the decomp\'s fall-through into .FightDone)', JSON.stringify({ got: s.got, tm: s.tm }));
		A(errors.length === 0, '1. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}

	// ===== 2. beaten before the fix: talk again =====
	{
		const { page, ctx, errors } = await openGym({ EVENT_JASMINE_RETURNED_TO_GYM: true, EVENT_OLIVINE_LIGHTHOUSE_JASMINE: true, EVENT_BEAT_JASMINE: true, ENGINE_MINERALBADGE: true });
		const talk = async () => {
			await page.evaluate(() => {
				const O = window.__ow, P = O.player;
				P.tx = 5; P.ty = 4; P.x = 80; P.y = 64; P.facing = 'up';
				window.__said = [];
				O.trainers.markDefeated(O.trainers.trainerAt(5, 3));
				O.interact();
			});
			await drive(page);
			return status(page);
		};
		const s1 = await talk();
		A(s1.got && s1.tm.length === 1 && s1.tm[0][1] === 1, '2. a beaten Jasmine, talked to again, hands over TM23 (Instinct\'s save)', JSON.stringify({ got: s1.got, tm: s1.tm, said: s1.said.slice(0, 200) }));
		const s2 = await talk();
		A(s2.tm.length === 1 && s2.tm[0][1] === 1 && !/far stronger than I imagined/.test(s2.said), '2. ...once: the next talk is her farewell, no second TM, not the roster quote', JSON.stringify({ tm: s2.tm, said: s2.said.slice(0, 200) }));
		// 3. the refused edges: a jumptext block in the same engine does not run on
		const edges = await page.evaluate(async () => (await (await fetch('/overworld/fallthrough_data.json')).json()).edges);
		A(edges.OlivineGym && edges.OlivineGym.OlivineGymJasmineScript === 'OlivineGymJasmineScript.FightDone', '3. the badge -> .FightDone edge is in the fall-through data');
		A(edges.TinTower1F && !edges.TinTower1F.TinTower1FSage4Script && !(edges.GoldenrodFlowerShop || {})['FlowerShopTeacherScript.GotSquirtbottle'], '3. jumptext blocks (the decomp ends them) are NOT given a fall-through');
		A(errors.length === 0, '2. no page errors', JSON.stringify(errors.slice(0, 3)));
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
