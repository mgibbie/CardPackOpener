// goldenrod_tutor_test.mjs — Crystal's Goldenrod City move tutor teaches.
//
// The Wednesday/Saturday tutor (after the Elite Four, needs the COIN CASE)
// teaches FLAMETHROWER / THUNDERBOLT / ICE BEAM for 4000 coins. The Crystal
// transpile dropped his `checkcoins`, the `loadmenu`+`verticalmenu` move menu and
// its three `ifequal`s, every `setval`, the `ifequal FALSE` after `special
// MoveTutor`, and `takecoins` — and `special MoveTutor` itself was unimplemented,
// so he asked his questions and then always said "B-but..." with nothing taught.
// tools/gen_crystal_scriptvar.mjs now restores them (crystal_scriptvar_data.json);
// move_tutor.js implements the special.
//   1. on a Wednesday, with the gate met: the tutor is there, the menu offers the
//      three moves; THUNDERBOLT + PIKACHU teaches it and takes 4000 coins
//   2. too few coins: the refusal, no menu, nothing taken
//   3. B at the move menu: nothing taught, nothing taken
//   4. on a Monday he isn't there
//
//   node overworld/tests/goldenrod_tutor_test.mjs
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
const PORT = 9228;
const STATE = { username: 'goldtutor', friendCode: 'GOLDT1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PIKA = { speciesId: 'pikachu', name: 'PIKACHU', level: 40, gender: 'M', friend: 70, types: ['Electric'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 90, atk: 60, def: 50, spa: 60, spd: 55, spe: 90 }, maxHP: 90, curHP: 90, exp: 64000,
	moves: [{ id: 'quickattack', name: 'Quick Attack', pp: 30, maxPp: 30 }, { id: 'thundershock', name: 'Thunder Shock', pp: 30, maxPp: 30 }], sprite: 's25.png', num: 25 };
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
async function open({ coins, weekday }) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, pika, coins, weekday) => {
		Date.prototype.getDay = function () { return weekday; };   // 3 = WEDNESDAY, 1 = MONDAY
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'johto');
		localStorage.setItem('magepunk_party_v1', JSON.stringify([pika]));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, EVENT_BEAT_ELITE_FOUR: true, EVENT_GOLDENROD_CITY_MOVE_TUTOR: true }, vars: {} }));
		localStorage.setItem('magepunk_bag_v1', JSON.stringify({ coincase: 1 }));
		localStorage.setItem('magepunk_coins_v1', String(coins));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PIKA, coins, weekday);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=GoldenrodCity&x=12&y=23`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === 'GoldenrodCity')).catch(() => false)); i++) await sleep(100);
	await sleep(1200);
	return { page, ctx, errors };
}
const W = (p, f, ...a) => p.evaluate(f, ...a);
const choice = p => W(p, async () => { const c = (await import('./choice.js')).choiceMenu; return { open: c.open, list: c.list, options: c.options.slice(), idx: c.idx }; });
// press Z through dialog until a menu opens or everything is still
const drive = p => W(p, async () => {
	const C = await import('./choice.js'), O = window.__ow;
	const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < 20000) {
		if (C.choiceMenu.open) return 'menu';
		const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
		if (!d && !c && f.alpha < 0.001 && f.target < 0.001) { if (++calm >= 12) return 'idle'; } else calm = 0;
		if (d) { (window.__said = window.__said || []).push(JSON.stringify(O.dialog.pages || '')); press('z'); }
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
});
const key = async (p, k) => { await p.keyboard.press(k); await sleep(80); };
const talk = async p => {
	await W(p, () => { const P = window.__ow.player; P.tx = 12; P.ty = 23; P.x = 12 * 16; P.y = 23 * 16; P.facing = 'up'; window.__said = []; });
	await key(p, 'z');
};
const tutorShown = p => W(p, () => { const n = window.__ow.npcs.list.find(x => (x.ev && x.ev.script) === 'MoveTutorScript'); return !!n && !n.hidden; });
const state = p => W(p, async () => ({ coins: +localStorage.getItem('magepunk_coins_v1'), moves: JSON.parse(localStorage.getItem('magepunk_party_v1'))[0].moves.map(m => m.id),
	daily: (await import('./events.js')).getFlag('ENGINE_DAILY_MOVE_TUTOR'), said: (window.__said || []).join(' | ') }));

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// ===== 1. Wednesday, 5000 coins: teach THUNDERBOLT =====
	{
		const { page, ctx, errors } = await open({ coins: 5000, weekday: 3 });
		A(await tutorShown(page), '1. on a Wednesday, after the Elite Four, with the COIN CASE: the tutor is there');
		await talk(page);
		let r = await drive(page);   // ask (Z = yes) ... 4000 coins okay? (Z = yes) ... the move menu
		const menu = await choice(page);
		A(r === 'menu' && JSON.stringify(menu.options) === JSON.stringify(['FLAMETHROWER', 'THUNDERBOLT', 'ICE BEAM', 'CANCEL']), '1. the menu offers FLAMETHROWER / THUNDERBOLT / ICE BEAM / CANCEL', JSON.stringify({ r, menu }));
		await key(page, 'ArrowDown'); await key(page, 'z');   // THUNDERBOLT
		r = await drive(page);   // "which POKeMON?" -> the party pick
		const pick = await choice(page);
		A(r === 'menu' && /PIKACHU/.test(pick.options[0] || '') && !/NOT ABLE/.test(pick.options[0]), '1. then a party pick, PIKACHU able to learn it', JSON.stringify(pick));
		await key(page, 'z');
		r = await drive(page);
		await sleep(600);
		const s = await state(page);
		A(s.moves.includes('thunderbolt'), '1. PIKACHU learned THUNDERBOLT', JSON.stringify(s.moves));
		A(s.coins === 1000, '1. ...for 4000 coins (5000 -> 1000)', s.coins);
		A(s.daily === true, '1. ...and he\'s done for the day (ENGINE_DAILY_MOVE_TUTOR)', s.daily);
		A(errors.length === 0, '1. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}

	// ===== 2. too few coins =====
	{
		const { page, ctx } = await open({ coins: 3000, weekday: 3 });
		await talk(page);
		const r = await drive(page);
		const s = await state(page);
		A(r === 'idle' && s.coins === 3000 && !s.moves.includes('thunderbolt') && /enough coins|don.t have enough/i.test(s.said), '2. with 3000 coins: "you don\'t have enough coins", no menu, nothing taken', JSON.stringify({ r, coins: s.coins, said: s.said.slice(-160) }));
		await ctx.close();
	}

	// ===== 3. B at the move menu =====
	{
		const { page, ctx } = await open({ coins: 5000, weekday: 3 });
		await talk(page);
		let r = await drive(page);
		A(r === 'menu', '3. setup: the move menu');
		await key(page, 'x');
		r = await drive(page);
		const s = await state(page);
		A(r === 'idle' && s.coins === 5000 && !s.moves.includes('thunderbolt') && s.daily !== true, '3. B at the menu: nothing taught, no coins taken, still here today', JSON.stringify({ r, s: { ...s, said: undefined } }));
		await ctx.close();
	}

	// ===== 4. not on a Monday =====
	{
		const { page, ctx } = await open({ coins: 5000, weekday: 1 });
		A(!(await tutorShown(page)), '4. on a Monday the tutor isn\'t in Goldenrod');
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
