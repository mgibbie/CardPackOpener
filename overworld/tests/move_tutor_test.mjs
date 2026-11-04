// move_tutor_test.mjs — FireRed's move tutors teach.
//
// 2026-10-05, Instinct: the Cinnabar Metronome tutor did nothing. Its script
// jumps into pokefirered's shared move_tutors.inc (six goto-only tutors were
// never brought over), and every tutor teaches through special
// ChooseMonForMoveTutor, which the engine never implemented.
//   1. Metronome tutor: YES -> a party pick (ABLE / NOT ABLE); a NOT ABLE mon is
//      refused and the menu comes back; the ABLE mon learns Metronome; the
//      one-use FLAG_TUTOR_METRONOME is set; talking again doesn't teach again
//   2. CANCEL at the party pick: nothing learned, the flag stays clear
//   3. a mon with four moves: the forget menu; the chosen move is replaced
//   4. another tutor (Route 4 Mega Punch) teaches too
//
//   node overworld/tests/move_tutor_test.mjs
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
const PORT = 9227;
const STATE = { username: 'tutor', friendCode: 'TUTR01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (speciesId, name, moves) => ({ speciesId, name, level: 30, types: ['Normal'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 80, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 80, curHP: 80, exp: 27000,
	moves: moves.map(id => ({ id, name: id.toUpperCase(), pp: 20, maxPp: 20 })), sprite: 's35.png', num: 35 });
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
async function session(map, x, y, seedParty, region = 'kanto') {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, region) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', region); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, seedParty, region);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 200 && !(await page.evaluate(m => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === m), map).catch(() => false)); i++) await sleep(100);
	await sleep(800);
	// Z through dialog (YES at the yes/no prompts) until a menu opens or the scene ends
	const drive = () => page.evaluate(async () => {
		const C = await import('./choice.js'), O = window.__ow;
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < 15000) {
			if (C.choiceMenu.open) return 'menu:' + C.choiceMenu.list;
			const d = O.dialog.blocking, c = O.cutscene.blocking;
			if (!d && !c) { if (++calm >= 10) return 'idle'; } else calm = 0;
			if (d) { (window.__said = window.__said || []).push(JSON.stringify(O.dialog.pages || '')); press('z'); }
			await new Promise(r => setTimeout(r, 40));
		}
		return 'timeout';
	});
	const menu = () => page.evaluate(async () => { const c = (await import('./choice.js')).choiceMenu; return { open: c.open, options: c.options.slice(), list: c.list }; });
	const pickIdx = async i => { await page.evaluate(async i => { const c = (await import('./choice.js')).choiceMenu; c.idx = i; }, i); await page.keyboard.press('z'); await sleep(120); };
	const talk = async (fx, fy, facing) => { await page.evaluate((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = f; window.__said = []; }, fx, fy, facing); await page.keyboard.press('z'); await sleep(150); return drive(); };
	const party = () => page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_party_v1')).map(m => ({ s: m.speciesId, moves: m.moves.map(x => x.id) })));
	const flag = f => page.evaluate(async f => (await import('./events.js')).getFlag(f), f);
	const said = () => page.evaluate(() => (window.__said || []).join(' | '));
	return { page, ctx, errors, drive, menu, pickIdx, talk, party, flag, said };
}

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const ROOM = 'CinnabarIsland_PokemonLab_ResearchRoom';

	// ===== 1. Metronome: NOT ABLE refused, ABLE learns, one-use =====
	{
		const s = await session(ROOM, 5, 5, [mon('rattata', 'RATTATA', ['tackle']), mon('clefairy', 'CLEFAIRY', ['pound', 'growl'])]);
		let r = await s.talk(5, 5, 'up');
		let m = await s.menu();
		A(r === 'menu:MOVE_TUTOR' && m.options.length === 3 && /NOT ABLE/.test(m.options[0]) && !/NOT ABLE/.test(m.options[1]) && m.options[2] === 'CANCEL',
			'1. the Metronome tutor opens a party pick: RATTATA (NOT ABLE), CLEFAIRY, CANCEL', JSON.stringify({ r, m, said: (await s.said()).slice(0, 200) }));
		await s.pickIdx(0);
		r = await s.drive();
		A(r === 'menu:MOVE_TUTOR', '1. a NOT ABLE mon is refused and the pick comes back', r);
		await s.pickIdx(1);
		r = await s.drive();
		const p = await s.party();
		A(p[1].moves.includes('metronome') && !p[0].moves.includes('metronome'), '1. CLEFAIRY learns METRONOME', JSON.stringify(p));
		A(await s.flag('FLAG_TUTOR_METRONOME') === true, '1. the one-use FLAG_TUTOR_METRONOME is set');
		r = await s.talk(5, 5, 'up');
		A(r === 'idle' && !(await s.menu()).open, '1. talking again teaches nothing (no party pick)', r);
		A(s.errors.length === 0, '1. no page errors', JSON.stringify(s.errors.slice(0, 3)));
		await s.ctx.close();
	}

	// ===== 2. CANCEL: nothing changes =====
	{
		const s = await session(ROOM, 5, 5, [mon('clefairy', 'CLEFAIRY', ['pound'])]);
		await s.talk(5, 5, 'up');
		await s.pickIdx(1);   // CANCEL
		await s.drive();
		const p = await s.party();
		A(!p[0].moves.includes('metronome') && await s.flag('FLAG_TUTOR_METRONOME') !== true, '2. CANCEL: nothing learned, the flag stays clear', JSON.stringify(p));
		await s.ctx.close();
	}

	// ===== 3. four moves: the forget menu =====
	{
		const s = await session(ROOM, 5, 5, [mon('clefairy', 'CLEFAIRY', ['pound', 'growl', 'sing', 'doubleslap'])]);
		await s.talk(5, 5, 'up');
		await s.pickIdx(0);
		const r = await s.drive();
		const m = await s.menu();
		A(r === 'menu:MOVE_TUTOR_FORGET' && m.options.length === 5 && m.options[4] === 'STOP LEARNING', '3. at four moves, a forget menu (4 moves + STOP LEARNING)', JSON.stringify({ r, m }));
		await s.pickIdx(1);   // forget GROWL
		await s.drive();
		const p = await s.party();
		A(JSON.stringify(p[0].moves) === JSON.stringify(['pound', 'metronome', 'sing', 'doubleslap']), '3. the chosen move (GROWL) is replaced by METRONOME', JSON.stringify(p[0].moves));
		await s.ctx.close();
	}

	// ===== 4. Route 4 Mega Punch tutor =====
	{
		const s = await session('Route4', 47, 4, [mon('clefairy', 'CLEFAIRY', ['pound'])]);
		const r = await s.talk(47, 4, 'up');
		A(r === 'menu:MOVE_TUTOR', '4. the Route 4 Mega Punch tutor opens the party pick', JSON.stringify({ r, said: (await s.said()).slice(0, 200) }));
		await s.pickIdx(0);
		await s.drive();
		const p = await s.party();
		A(p[0].moves.includes('megapunch') && await s.flag('FLAG_TUTOR_MEGA_PUNCH') === true, '4. CLEFAIRY learns MEGA PUNCH; FLAG_TUTOR_MEGA_PUNCH set', JSON.stringify(p));
		await s.ctx.close();
	}

	// ===== 5. Emerald uses the same special (VAR_0x8005 = TUTOR_MOVE_METRONOME) =====
	{
		const s = await session('FallarborTown_Mart', 7, 3, [mon('clefairy', 'CLEFAIRY', ['pound'])], 'hoenn');
		const r = await s.talk(7, 3, 'up');
		A(r === 'menu:MOVE_TUTOR', '5. Emerald: the Fallarbor Mart Metronome tutor opens the party pick', JSON.stringify({ r, said: (await s.said()).slice(0, 200) }));
		await s.pickIdx(0);
		await s.drive();
		const p = await s.party();
		A(p[0].moves.includes('metronome') && await s.flag('FLAG_MOVE_TUTOR_TAUGHT_METRONOME') === true, '5. Emerald: CLEFAIRY learns METRONOME; its flag is set', JSON.stringify(p));
		await s.ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
