// foe_name_leak_test.mjs — a battle never speaks for the PREVIOUS battle's foe.
//
// Playtest (Remy, filed 2026-10-02 from an Oct-1 log): in a wild WHISMUR battle
// the feed read "TAILLOW used Growl!", and TAILLOW had been the previous
// battle's foe — filed as a stale foe name (or a leaked queued action).
// Diagnosis: the line predates 0e4df698 (2026-10-01, "Wild X" / "Foe X"
// labels) and was the SECOND foe of a wild double; double_foe_label_test
// covers that. This guards the reported reading itself: two consecutive wild
// battles, the first left mid-turn, the second never names the first's foe and
// never runs its queued actions.
//   1. TAILLOW battle, a full turn played out -> ends; WHISMUR battle: no TAILLOW line
//   2. TAILLOW battle left MID-TURN (its foe's move still queued) -> WHISMUR
//      battle: the leftover action never fires, no TAILLOW line, your HP untouched by it
//
//   node overworld/tests/foe_name_leak_test.mjs
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
const PORT = 9212;
const STATE = { username: 'foeleak', friendCode: 'FOELK1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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

	// a sturdy lead so nobody faints; record every battle line as it is queued
	await page.evaluate(async () => {
		const B = await import('./battle.js'), S = (await import('./ow_state.js')).S, O = window.__ow;
		S.party = [B.buildMon('bulbasaur', 30, O.battle.data)];
		window.__msgs = [];
		const orig = O.battle.pushMsg.bind(O.battle);
		window.__all = [];
		O.battle.pushMsg = (text, fn) => { if (text) { window.__msgs.push(text); window.__all.push(text); } return orig(text, fn); };
	});
	// a wild SINGLE battle against `id`, every foe move forced to Growl (the reported line)
	const start = id => page.evaluate(async id => {
		const P = await import('./ow_places.js');
		P.startWildBattle({ id, level: 6 }, false);
		for (let i = 0; i < 100 && !window.__ow.battle.active; i++) await new Promise(r => setTimeout(r, 50));
		const b = window.__ow.battle, a = b.active;
		const growl = { id: 'growl', name: b.data.moves.growl?.name || 'Growl', pp: 40, maxPp: 40 };
		a.foe.moves = [growl];
		return { foe: a.foe.name, double: !!a.double };
	}, id);
	// play one turn by the battle's own turn code; `drain` false leaves it mid-turn
	const turn = drain => page.evaluate(async drain => {
		const b = window.__ow.battle, a = b.active;
		window.__msgs = [];
		const growl = { id: 'growl', name: b.data.moves.growl?.name || 'Growl', pp: 40, maxPp: 40 };
		b.resolveTurn(growl);
		if (drain) for (let i = 0; i < 400 && b.active && b.active.queue.length; i++) { b.update(0.1); b.key?.('z'); await new Promise(r => setTimeout(r, 5)); }
		return { lines: window.__msgs.slice(), queued: b.active ? b.active.queue.length : 0, meHP: b.active?.me.curHP };
	}, drain);
	const end = () => page.evaluate(async () => { const b = window.__ow.battle; b.finish('escaped'); for (let i = 0; i < 200 && b.active; i++) { b.update(0.1); await new Promise(r => setTimeout(r, 10)); } return !b.active; });
	// the 2nd battle's lines, collected from its start through one played-out turn
	const secondBattle = async () => {
		await page.evaluate(() => { window.__all = []; });
		const s = await start('whismur');
		const t = await turn(true);
		const all = await page.evaluate(() => window.__all.slice());
		return { s, t, all };
	};

	// ===== 1. a full TAILLOW turn, then a WHISMUR battle =====
	{
		const s1 = await start('taillow');
		A(s1.foe === 'TAILLOW' && !s1.double, 'setup: a single wild TAILLOW', JSON.stringify(s1));
		const t1 = await turn(true);
		A(t1.lines.some(l => /TAILLOW used Growl/.test(l)), 'setup: TAILLOW\'s turn plays out (it uses Growl)', JSON.stringify(t1.lines));
		A(await end(), 'setup: the TAILLOW battle ends');
		const r = await secondBattle();
		A(r.s.foe === 'WHISMUR', 'the next battle is a WHISMUR', JSON.stringify(r.s));
		A(r.all.includes('Wild WHISMUR used Growl!'), '...whose own move reads "Wild WHISMUR used Growl!" (the foe side is named)', JSON.stringify(r.all));
		A(!r.all.some(l => /TAILLOW/.test(l)), '...and NO line names the previous foe, TAILLOW', JSON.stringify(r.all));
		await end();
	}

	// ===== 2. TAILLOW left MID-TURN (its Growl still queued), then WHISMUR =====
	{
		await start('taillow');
		const t1 = await turn(false);
		A(t1.queued > 0, 'setup: the TAILLOW battle is left with its turn still queued', JSON.stringify(t1));
		A(await end(), 'setup: ...and ends (fled) before that queue plays');
		const r = await secondBattle();
		A(!r.all.some(l => /TAILLOW/.test(l)), 'the leftover TAILLOW action never fires in the WHISMUR battle', JSON.stringify(r.all));
		A(r.all.filter(l => /used Growl/.test(l)).length === 2, '...the WHISMUR turn has exactly its two moves (yours and WHISMUR\'s)', JSON.stringify(r.all.filter(l => /used/.test(l))));
		await end();
	}
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
