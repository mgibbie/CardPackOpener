// pocketenhanced_singles_test.mjs — two things the owner met playing a singles 1v1 (2026-11-18):
//   "it kept doing the KO animation on my active slot mon and my opponents active slot mon whenever i added an energy"
//   "in a 1v1 singles we need to have the execute button just say pass turn and dont ask me to pick a target for my attack
//    because there is only one possibility. the attack should hit the 1 target right away and end the turn and the pass
//    turn button will be for ending the turn without attacking."
//   1. the KO mark: after a Knock Out has been shown, attaching Energy (and any later redraw) shows no KO mark again.
//      (The cause: the page read "what is new in the log" by each line's `n`, and the engine lets a draw's or a damage
//      line's own count overwrite it, so `n` went backwards and old Knock Outs read as new. Now by position.)
//   2. singles: the button says Pass turn; choosing an attack asks for no target, the attack is carried out at once and
//      the turn ends; Pass turn, when an attack was possible, asks once and passes
//   3. doubles is as it was: Execute, and an attack asks for its target
//   node overworld/tests/pocketenhanced_singles_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9599;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox'] });
	const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(() => localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })));
	await page.goto(`http://localhost:${PORT}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300; i++) { if (await page.evaluate(() => !!(window.__pocket && window.__pocket.ready)).catch(() => false)) break; await sleep(100); }
	// play on with the game's own computer player for me (effects ON: not fast) until the condition holds at my turn
	const playUntil = cond => page.evaluate(async c => { const P = window.__pocket, { nextAction } = await import('/pocketenhanced/js/ai.js'), ok = new Function('P', 'S', 'return ' + c);
		for (let n = 0; n < 3000; n++) { const S = P.state(); if (S.over) return 'over';
			if (S.phase === 'main' && S.current === 0 && !S.pending && ok(P, S)) return 'ready';
			const seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup) || {}).seat : S.current; if (seat !== 0) { await new Promise(r => setTimeout(r, 30)); continue; }
			const banned = new Set(); for (let k = 0; k < 20; k++) { const a = nextAction(P.engine.view(S, 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; if (await P.act(a) !== false) break; banned.add(JSON.stringify(a)); } await new Promise(r => setTimeout(r, 30)); }
		return 'gave up'; }, cond);
	const koMarks = () => page.evaluate(() => [...document.querySelectorAll('.pe-kofx')].map(e => e.parentElement.dataset.k));

	// ===== 1. the KO mark =====
	await page.evaluate(() => window.__pocket.start({ players: 2, seed: 'ko3', singles: true }));
	const r1 = await playUntil("P.view().log.some(e => e.k === 'ko') && !S.players[0].flags.attached && S.players[0].zone.cur");
	A(r1 === 'ready', '(a singles match played until a Knock Out has happened, at my turn with an Energy to attach)', r1);
	await sleep(2200);
	const backwards = await page.evaluate(() => { const L = window.__pocket.view().log; return L.some((e, i) => i && e.n < L[i - 1].n); });
	A(backwards, "(the match's log has lines whose number goes backwards: a draw of 1 card reads n: 1)");
	const k0 = await koMarks();
	await page.evaluate(async () => { await window.__pocket.act({ t: 'attach', seat: 0, to: { seat: 0, zone: 'active', idx: 0 } }); });
	await sleep(200);
	const k1 = await koMarks();
	await page.evaluate(() => window.__pocket.refresh()); await sleep(200);
	const k2 = await koMarks();
	A(!k0.length && !k1.length && !k2.length, 'attaching Energy, and redrawing after it, show no KO mark (before: the old Knock Outs played again on my Active and the opponent\'s)', [k0, k1, k2]);

	// ===== 2. singles: Pass turn, and an attack with one target =====
	await page.evaluate(() => window.__pocket.start({ players: 2, seed: 'sg1', singles: true }));
	const r2 = await playUntil("S.turn >= 3 && S.players[0].active[0] && P.engine.view(S, 0).players[0].active[0] && true");
	A(r2 === 'ready', '(a new singles match at my turn)', r2);
	// give my Active Pokémon enough Energy for its first attack, so it can attack now
	await page.evaluate(() => { const P = window.__pocket, S = P.engineState(), k = S.players[0].active[0]; k.energy = Array(6).fill('Colorless').map((x, i) => (k.energy[i] || 'Fire')); P.refresh(); });
	await sleep(300);
	const label = await page.evaluate(() => (document.querySelector('[data-k="exec"]') || {}).textContent);
	A(label === 'Pass turn', 'the button says Pass turn', label);
	const turn0 = await page.evaluate(() => ({ turn: window.__pocket.view().turn, attacks: window.__pocket.view().log.filter(e => e.k === 'attack' && e.seat === 0).length }));
	await page.evaluate(() => document.querySelector('[data-k="p:0:active:0"]').click()); await sleep(300);
	const atk = await page.evaluate(() => { const b = [...document.querySelectorAll('.modal [data-k^="atk"]')].find(x => !x.disabled); if (b) b.click(); return !!b; });
	await sleep(400);
	const pickNow = await page.evaluate(() => !!window.__pocket.ui().pick);
	A(atk && !pickNow, 'choosing the attack asks for no target (the opponent has one Active Pokémon)', { atk, pickNow });
	let after = null; for (let i = 0; i < 40; i++) { after = await page.evaluate(() => ({ turn: window.__pocket.view().turn, current: window.__pocket.view().current, attacks: window.__pocket.view().log.filter(e => e.k === 'attack' && e.seat === 0).length, over: !!window.__pocket.view().over })); if (after.attacks > turn0.attacks && (after.turn > turn0.turn || after.over)) break; await sleep(150); }
	A(after.attacks === turn0.attacks + 1 && (after.turn > turn0.turn || after.over), 'the attack is carried out at once, and my turn ends', [turn0, after]);
	// Pass turn when an attack was possible: asked once, then passed
	const r3 = await playUntil('true');
	if (r3 === 'ready') {
		await page.evaluate(() => { const P = window.__pocket, S = P.engineState(), k = S.players[0].active[0]; k.energy = Array(6).fill('Fire'); P.refresh(); });
		await sleep(250);
		const t3 = await page.evaluate(() => window.__pocket.view().turn);
		await page.evaluate(() => document.querySelector('[data-k="exec"]').click()); await sleep(300);
		const ask = await page.evaluate(() => ({ title: ([...document.querySelectorAll('.modal .modal-title')].pop() || {}).textContent || '', b: (document.querySelector('.modal [data-k="exec2"]') || {}).textContent }));
		await page.evaluate(() => document.querySelector('.modal [data-k="exec2"]').click()); await sleep(500);
		const t4 = await page.evaluate(() => ({ turn: window.__pocket.view().turn, attacks: window.__pocket.view().log.filter(e => e.k === 'attack' && e.seat === 0 && e.turn === window.__pocket.view().turn - 1).length }));
		A(ask.title === 'Pass turn?' && ask.b === 'Pass turn' && t4.turn > t3, 'Pass turn with an attack possible asks once ("Pass turn?"), then ends the turn without attacking', [ask, t3, t4]);
	} else A(r3 === 'over', '(the match ended on that attack)', r3);

	// ===== 3. doubles is as it was =====
	await page.evaluate(() => window.__pocket.start({ players: 2, seed: 'db1' }));
	const r4 = await playUntil("S.turn >= 3 && S.players[0].active[0] && P.engine.view(S, 0).players.slice(1).some(p => p.active.filter(Boolean).length + p.bench.filter(Boolean).length > 0)");
	await page.evaluate(() => { const P = window.__pocket, S = P.engineState(), k = S.players[0].active[0]; k.energy = Array(6).fill('Fire'); P.refresh(); });
	await sleep(250);
	const dl = await page.evaluate(() => (document.querySelector('[data-k="exec"]') || {}).textContent);
	await page.evaluate(() => document.querySelector('[data-k="p:0:active:0"]').click()); await sleep(300);
	await page.evaluate(() => { const b = [...document.querySelectorAll('.modal [data-k^="atk"]')].find(x => !x.disabled); if (b) b.click(); });
	await sleep(300);
	const dp = await page.evaluate(() => { const P = window.__pocket, k = P.state().players[0].active[0], a = P.engine.card ? null : null; return { pick: !!P.ui().pick, cmd: !!P.ui().cmds[0] }; });
	A(r4 === 'ready' && dl === 'Execute' && (dp.pick || dp.cmd) && (await page.evaluate(() => window.__pocket.view().current)) === 0, 'doubles: the button says Execute, and an attack waits for its target and for Execute (the turn does not end by itself)', [r4, dl, dp]);
	A(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
