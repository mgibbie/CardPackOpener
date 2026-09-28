// runreward_test.mjs — a reload on a run's reward screen resumes THAT screen.
//
// Bryan, 2026-09-28: "I was on the card select screen and had to walk away and my
// laptop went to sleep and when I came back and reconnected it had me face the
// same person again but with I THINK 5 more HP." A won fight banked the win and
// then showed the reward, but the next enemy was only chosen after the pick; a
// reload there found the beaten enemy still set and rebuilt the SAME fight with
// the life scaling of one more game, and the reward was lost. Now the run records
// a post-fight checkpoint with a seed: a reload reopens the same reward screen
// with the same offer (frame-exact resume, the owner's rule), each pick is saved
// as it is made, and advancing moves on to a NEW enemy.
//
//   node overworld/tests/runreward_test.mjs
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
].find(p => fs.existsSync(p));
const PORT = 9156;
const STATE = { username: 'runreward', friendCode: 'RRWRD0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = await new Promise(r => {
	const s = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { for await (const _ of req) {} res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE })); return; }
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	s.listen(PORT, () => r(s));
});

const MODES = [
	{ mode: 'lorequest', key: 'magepunk_lorequest_v1' },
	{ mode: 'middleearth', key: 'magepunk_middleearth_v1' },
	{ mode: 'duels', key: 'magepunk_duels_v1' },
];

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	for (const { mode, key } of MODES) {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720 });
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 'runreward'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, STATE);
		const run = () => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), key);
		const overlay = () => page.evaluate(() => {
			const o = document.getElementById('dungeon-overlay');
			if (!o || getComputedStyle(o).display === 'none') return null;
			return { title: (o.querySelector('h1')?.textContent || '').trim(), cards: [...o.querySelectorAll('canvas[data-card-id]')].map(c => c.dataset.cardId),
				buttons: [...o.querySelectorAll('button')].map(b => b.textContent.trim()) };
		});
		// a reload first asks "Continue the run?" — answer it the way a player does
		const reloadAndContinue = async () => {
			await page.reload({ waitUntil: 'domcontentloaded' });
			for (let i = 0; i < 25; i++) {
				await sleep(400);
				const clicked = await page.evaluate(() => { const o = document.getElementById('dungeon-overlay'); if (!o || getComputedStyle(o).display === 'none') return false; const b = [...o.querySelectorAll('button')].find(x => /^Continue/i.test(x.textContent.trim())); if (b) { b.click(); return true; } return false; }).catch(() => false);
				if (clicked) return true;
			}
			return false;
		};
		const inFight = () => page.evaluate(() => { const s = window.__game?.state; return !!(s && s.players && s.players.length === 2 && !s.over); }).catch(() => false);
		// 1. start the run and reach the first fight (clicking through its pick screens)
		await page.goto(`http://localhost:${PORT}/battlecards/index.html?${mode}=1`, { waitUntil: 'domcontentloaded' });
		let live = false;
		for (let i = 0; i < 40 && !live; i++) {
			await sleep(800);
			live = await inFight();
			if (!live) await page.evaluate(() => { const o = document.getElementById('dungeon-overlay'); if (o && getComputedStyle(o).display !== 'none') { const b = [...o.querySelectorAll('button')].find(x => !/replay|copy|watch|abandon|quit|leaderboard/i.test(x.textContent)); if (b) b.click(); } }).catch(() => {});
		}
		A(live, `[${mode}] a run fight starts`);
		const before = await run();
		const beaten = before && before.enemy && before.enemy.name;
		// 2. win it (the enemy concedes), and let the reward screen come up
		await page.evaluate(() => { const g = window.__game; g.E.concede(g.state, 1 - g.HUMAN); g.pump(); });
		let o1 = null;
		for (let i = 0; i < 20 && !(o1 && o1.cards.length); i++) { await sleep(400); o1 = await overlay(); }
		const r1 = await run();
		A(o1 && o1.cards.length > 0, `[${mode}] winning shows a reward screen with cards`, JSON.stringify(o1 && { title: o1.title, n: o1.cards.length }));
		A(r1 && r1.postGame && r1.postGame.stage === 1 && r1.wins === (before.wins || 0) + 1, `[${mode}] the run records the win and a reward checkpoint`, JSON.stringify(r1 && { wins: r1.wins, pg: r1.postGame }));
		// 3. RELOAD on the reward screen (Bryan's sleeping laptop)
		A(await reloadAndContinue(), `[${mode}] the reload asks to continue the run`);
		let o2 = null;
		for (let i = 0; i < 25 && !(o2 && o2.cards.length); i++) { await sleep(400); o2 = await overlay(); }
		const r2 = await run();
		A(o2 && JSON.stringify(o2.cards) === JSON.stringify(o1.cards), `[${mode}] after a reload the SAME reward screen is back, with the same cards`, JSON.stringify({ before: o1 && o1.cards, after: o2 && o2.cards }));
		A(!(await inFight()), `[${mode}] ...not a rebuilt fight against ${beaten}`);
		A(r2 && r2.wins === r1.wins, `[${mode}] ...and the win is counted once`, JSON.stringify({ wins: r2 && r2.wins }));
		// 4. take the first reward; if there's a second step, reload on it too
		await page.evaluate(() => { const o = document.getElementById('dungeon-overlay'); const b = [...o.querySelectorAll('button')].find(x => /^Take/.test(x.textContent.trim()) && !/none/i.test(x.textContent)); b.click(); });
		await sleep(700);
		const r3 = await run();
		const o3 = await overlay();
		if (r3 && r3.postGame && r3.postGame.stage === 2) {
			A(r3.deck.length > r1.deck.length, `[${mode}] the first pick is saved into the deck as it is taken`, `${r1.deck.length} -> ${r3.deck.length}`);
			await reloadAndContinue();
			let o4 = null;
			for (let i = 0; i < 25 && !(o4 && o4.cards.length); i++) { await sleep(400); o4 = await overlay(); }
			A(o4 && JSON.stringify(o4.cards) === JSON.stringify(o3.cards), `[${mode}] a reload on the second reward step brings back the same offer`, JSON.stringify({ before: o3 && o3.cards, after: o4 && o4.cards }));
			await page.evaluate(() => { const o = document.getElementById('dungeon-overlay'); const b = [...o.querySelectorAll('button')].find(x => /^Take/.test(x.textContent.trim())); b.click(); });
			await sleep(700);
		} else A(true, `[${mode}] (single reward step this win)`);
		// 5. the reward is done: a NEW enemy is next, and the checkpoint is gone
		const r5 = await run();
		const o5 = await overlay();
		A(r5 && !r5.postGame && r5.enemy && r5.enemy.name, `[${mode}] after the rewards, the checkpoint clears and the next enemy is set`, JSON.stringify(r5 && { enemy: r5.enemy && r5.enemy.name, pg: r5.postGame }));
		A(o5 && /^NEXT/i.test(o5.title), `[${mode}] ...and the NEXT screen shows who it is`, JSON.stringify(o5 && o5.title));
		A(errors.length === 0, `[${mode}] no uncaught page error`, JSON.stringify(errors.slice(0, 2)));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
