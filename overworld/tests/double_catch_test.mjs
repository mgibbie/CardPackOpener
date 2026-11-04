// double_catch_test.mjs — a ball in a wild DOUBLE goes where the rules say.
//
// Playtest (Instinct, 2026-10-10 and -11): balls always flew at the `foe` slot.
// With both wild mons up you could never aim at the second (a shiny MACHOP);
// and with the lead already FAINTED (a wild double keeps a fainted lead in that
// slot) the ball "caught" it — the fainted HORSEA went to the box at 1 HP while
// the live TANGELA stood there, uncaught.
// pokeemerald has no wild doubles; Gen 4 (the first with them) refuses the throw
// while two wild mons are up — "It's impossible to aim when there are two
// POKéMON!" — and the ball isn't spent. With one left, the ball goes to it.
//   1. both foes up: the throw is refused with that line, the ball is kept, nothing caught
//   2. lead fainted, second alive: the ball goes to the SECOND foe and catches it
//   3. the fainted lead is never caught
//
//   node overworld/tests/double_catch_test.mjs
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
const PORT = 9390;
// MAGEPUNK_ASSET_ROOT=<checkout>: serve the gitignored overworld/data/ from that
// checkout (read only; a git worktree has none), as the micasurvivor tests do
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const STATE = { username: 'dblcatch', friendCode: 'DBLCAT', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(u.startsWith('/overworld/data/') ? AROOT : ROOT, u), (e, d) => {
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
	await page.evaluateOnNewDocument(st => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route116`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.world?.current?.name === 'Route116')).catch(() => false)); i++) await sleep(100);
	await sleep(1200);

	await page.evaluate(async () => {
		const B = await import('./battle.js'), S = (await import('./ow_state.js')).S, O = window.__ow;
		S.party = [B.buildMon('bulbasaur', 30, O.battle.data), B.buildMon('taillow', 30, O.battle.data)];
		O.Bag.addItem('pokeball', 5); O.Bag.addItem('masterball', 1);
		window.__msgs = [];
		const orig = O.battle.pushMsg.bind(O.battle);
		O.battle.pushMsg = (text, fn) => { if (text) window.__msgs.push(text); return orig(text, fn); };
	});
	// run the battle's queue forward to the next decision (messages auto-advance
	// at instant text). Stop at the command menu, and only press Z on a MESSAGE:
	// the menu always carries its "What will X do?" prompt in a.msg, so the old
	// `!a.msg` stop never fired and a Z on every frame picked FIGHT + a move —
	// the pump auto-played the double for its whole 4 s, and about one run in
	// three the battle had ended (a party wiped out, or both foes down) before
	// the setup check read battle.active.double off null.
	const pump = (ms = 4000) => page.evaluate(async ms => {
		const b = window.__ow.battle, t0 = Date.now();
		while (Date.now() - t0 < ms && b.active) {
			const a = b.active;
			if (a.phase === 'menu' && !a.queue.length) break;
			b.update(0.1);
			if (a.phase === 'msg' && a.msg) b.key && b.key('z');
			await new Promise(r => setTimeout(r, 5));
		}
		return b.active ? b.active.phase : 'ended';
	}, ms);

	await page.evaluate(async () => {
		const P = await import('./ow_places.js');
		window.__ow.encounters.pick = () => ({ id: 'tangela', level: 18 });
		window.__caught = null;
		{ const rr = Math.random; Math.random = () => 0.5; try { P.startWildBattle({ id: 'horsea', level: 25 }, true); } finally { Math.random = rr; } }
	});
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!window.__ow.battle.active?.foe)); i++) await sleep(100);
	const pumped = await pump();
	const setup = await page.evaluate(() => { const a = window.__ow.battle.active; if (!a) return null; return { double: !!a.double, foe: a.foe?.speciesId, ally: a.foeAlly?.speciesId, phase: a.phase }; });
	if (!setup) throw new Error('precondition: the wild double never reached its first command menu (battle.active is null; pump ended at ' + pumped + ')');
	A(setup.phase === 'menu', 'setup: the battle waits at the command menu, untouched', JSON.stringify(setup));
	A(setup.double && setup.foe === 'horsea' && setup.ally === 'tangela', 'a wild double: HORSEA (lead) + TANGELA', JSON.stringify(setup));

	// ===== 1. both up: refused, the ball kept =====
	const r1 = await page.evaluate(async () => {
		const b = window.__ow.battle, O = window.__ow; window.__msgs = [];
		const before = O.Bag.count('pokeball');
		b.useItem('pokeball');
		for (let i = 0; i < 40; i++) { b.update(0.1); if (b.active?.phase === 'msg' && b.active.msg) b.key && b.key('z'); await new Promise(r => setTimeout(r, 5)); }
		return { kept: O.Bag.count('pokeball') === before, msgs: window.__msgs.slice(), caught: b.active?.caughtMon?.speciesId || null, active: !!b.active };
	});
	A(r1.msgs.some(m => /impossible to aim when there are two/i.test(m)), "1. both foes up: It's impossible to aim when there are two POKéMON!", JSON.stringify(r1.msgs));
	A(r1.kept, '1. ...and the ball is NOT spent', JSON.stringify(r1));
	A(r1.active && !r1.caught && !r1.msgs.some(m => /threw/i.test(m)), '1. ...no throw, nothing caught, the battle goes on', JSON.stringify(r1));
	await pump();

	// ===== 2-3. the lead faints; the ball goes to TANGELA =====
	const r2 = await page.evaluate(async () => {
		const b = window.__ow.battle, a = b.active, O = window.__ow; window.__msgs = [];
		a.foe.curHP = 0; b.checkFaintsD();          // a wild double keeps the fainted lead in its slot
		for (let i = 0; i < 40; i++) { b.update(0.1); if (b.active?.phase === 'msg' && b.active.msg) b.key && b.key('z'); await new Promise(r => setTimeout(r, 5)); }
		const leadStill = a.foe && a.foe.speciesId === 'horsea' && a.foe.curHP === 0;
		const tangela = a.foeAlly && a.foeAlly.speciesId === 'tangela' ? a.foeAlly : (a.foe.curHP > 0 ? a.foe : null);
		window.__msgs = [];
		b.useItem('masterball');
		let caught = null;
		for (let i = 0; i < 300 && b.active; i++) {
			if (b.active.caughtMon) caught = b.active.caughtMon;
			b.update(0.1); if (b.active?.phase === 'msg' && b.active.msg) b.key && b.key('z'); await new Promise(r => setTimeout(r, 5));
		}
		return { leadStill, liveIsTangela: !!tangela, caught: caught?.speciesId || null, caughtHP: caught?.curHP, msgs: window.__msgs.slice(), ended: !b.active };
	});
	A(r2.leadStill && r2.liveIsTangela, "2. setup: the fainted HORSEA still holds the lead slot, TANGELA is alive (the report's state)", JSON.stringify(r2));
	A(r2.caught === 'tangela' && r2.msgs.some(m => /TANGELA was caught/i.test(m)), '2. the ball goes to the LIVE TANGELA and catches it', JSON.stringify({ caught: r2.caught, msgs: r2.msgs }));
	A(r2.caught !== 'horsea' && !r2.msgs.some(m => /HORSEA was caught/i.test(m)), '3. the fainted HORSEA is never caught', JSON.stringify(r2.msgs));
	A(r2.ended, '2. ...and the battle ends (no wild mon left standing)', JSON.stringify(r2));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
