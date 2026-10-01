// double_foe_label_test.mjs — in a battle, every line says WHOSE Pokémon acted.
//
// Playtest (Remy, 2026-10-01): "TAILLOW used Growl!" appeared in a WHISMUR fight
// and was filed as a stale foe name leaking from the previous battle. It was the
// SECOND foe of a wild double (10% of grass encounters), and the line gave no
// hint which side it was on — the same text your own TAILLOW would print.
// Gen 3 marks the foe side: "Wild TAILLOW used GROWL!" / "Foe TAILLOW ...".
//   1. a wild double opens "Wild WHISMUR and TAILLOW appeared!" with both foes on screen
//   2. each wild foe's lines read "Wild <NAME> ..."; yours stay plain
//   3. with a TAILLOW on BOTH sides, the two lines differ
//   4. a trainer's Pokémon read "Foe <NAME> ..."
//   5. a single wild battle reads "Wild <NAME> ..." too
//
//   node overworld/tests/double_foe_label_test.mjs
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
const PORT = 9184;
const STATE = { username: 'dblfoe', friendCode: 'DBLFOE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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

	// party: BULBASAUR + a TAILLOW of your own (the same species as the second foe)
	await page.evaluate(async () => {
		const B = await import('./battle.js'), S = (await import('./ow_state.js')).S, O = window.__ow;
		S.party = [B.buildMon('bulbasaur', 12, O.battle.data), B.buildMon('taillow', 12, O.battle.data)];
		window.__msgs = [];
		const orig = O.battle.pushMsg.bind(O.battle);
		O.battle.pushMsg = (text, fn) => { if (text) window.__msgs.push(text); return orig(text, fn); };
	});
	// the two actions of one turn, by the battle's own move code
	const act = () => page.evaluate(() => {
		const b = window.__ow.battle, a = b.active, mv = id => ({ id, name: b.data.moves[id]?.name || id, pp: 30, maxPp: 30 });
		window.__msgs = [];
		b.useMove(a.foeAlly || a.foe, a.foeAllyBoosts || a.foeBoosts, a.me, a.meBoosts, mv('growl'), true);
		b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, mv('growl'), false);
		if (a.meAlly) b.useMove(a.meAlly, a.meAllyBoosts, a.foe, a.foeBoosts, mv('growl'), false);
		return window.__msgs.slice();
	});
	const endBattle = () => page.evaluate(async () => { const b = window.__ow.battle; b.finish('escaped'); for (let i = 0; i < 200 && b.active; i++) { b.update(0.1); await new Promise(r => setTimeout(r, 10)); } return !b.active; });

	// ===== 1-3. a wild double: WHISMUR + TAILLOW =====
	await page.evaluate(async () => {
		const P = await import('./ow_places.js');
		window.__ow.encounters.pick = () => ({ id: 'taillow', level: 7 });
		P.startWildBattle({ id: 'whismur', level: 6 }, true);
	});
	for (let i = 0; i < 100 && !(await page.evaluate(() => !!window.__ow.battle.active)); i++) await sleep(100);
	await sleep(400);
	const st = await page.evaluate(() => { const a = window.__ow.battle.active; return { double: a.double, foe: a.foe.name, ally: a.foeAlly?.name, allyImg: !!a.foeAllyImg, foeImg: !!a.foeImg, msgs: window.__msgs.slice() }; });
	A(st.double && st.foe === 'WHISMUR' && st.ally === 'TAILLOW' && st.foeImg && st.allyImg, 'a wild double puts BOTH foes on screen (WHISMUR + TAILLOW, both sprites)', JSON.stringify(st));
	A(st.msgs.includes('Wild WHISMUR and TAILLOW appeared!'), '...and opens "Wild WHISMUR and TAILLOW appeared!"', JSON.stringify(st.msgs));
	const lines = await act();
	A(lines.includes('Wild TAILLOW used Growl!'), 'the second wild foe\'s move reads "Wild TAILLOW used Growl!"', JSON.stringify(lines));
	A(lines.includes('BULBASAUR used Growl!') && lines.includes('TAILLOW used Growl!'), 'your own BULBASAUR and TAILLOW stay plain ("TAILLOW used Growl!")', JSON.stringify(lines));
	A(lines.some(l => /^Wild WHISMUR's Attack fell/i.test(l)), 'stat lines on a wild foe carry the side too ("Wild WHISMUR\'s ATTACK fell!")', JSON.stringify(lines));
	A(!lines.some(l => /^(WHISMUR)\b/.test(l)), 'no line names a wild foe bare', JSON.stringify(lines));
	A(await endBattle(), 'setup: the double ends cleanly');

	// ===== 5. a single wild battle =====
	await page.evaluate(async () => { const P = await import('./ow_places.js'); window.__msgs = []; P.startWildBattle({ id: 'whismur', level: 6 }, false); });
	for (let i = 0; i < 100 && !(await page.evaluate(() => !!window.__ow.battle.active)); i++) await sleep(100);
	await sleep(300);
	const single = await act();
	A(single.includes('Wild WHISMUR used Growl!'), 'a single wild battle reads "Wild WHISMUR used Growl!"', JSON.stringify(single));
	await endBattle();

	// ===== 4. a trainer's Pokémon =====
	await page.evaluate(async () => {
		const B = await import('./battle.js'), S = (await import('./ow_state.js')).S, O = window.__ow;
		window.__msgs = [];
		O.battle.startTrainer(S.party, [B.buildMon('taillow', 9, O.battle.data)], { displayName: 'YOUNGSTER JOEY' }, () => {});
	});
	for (let i = 0; i < 100 && !(await page.evaluate(() => !!window.__ow.battle.active)); i++) await sleep(100);
	await sleep(300);
	const tr = await act();
	A(tr.includes('Foe TAILLOW used Growl!') && tr.includes('BULBASAUR used Growl!'), 'a trainer\'s TAILLOW reads "Foe TAILLOW used Growl!" (yours stays plain)', JSON.stringify(tr));
	await endBattle();

	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
