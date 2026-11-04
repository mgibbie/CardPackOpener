// run_result_commit_more_test.mjs — the zombie-Continue fix (run_result_commit_test)
// for the four run modes WITHOUT a post-fight checkpoint: Dungeon, Heist, Tombs
// and Arena. A finished fight's result must commit even when you leave before
// the post-fight beat; before, leaving inside that window kept the pre-death
// snapshot and "Continue" reloaded the same fight (the seeded RNG replays it).
//
// Each mode: click through to a live fight, end it (E.concede), reload AT ONCE,
// then check the server copy carries the result (no snapshot) and Continue
// settles it through the mode's own path. Dungeon also checks the reward is
// frame-exact: the same offers after a reload, and a pick made mid-reward
// resumes at the next stage instead of offering (and granting) it again.
//   node battlecards/tests/integration/run_result_commit_more_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 9272;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms, every = 150) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(every); } return false; }

const STATE = { username: 'mgibbie', friendCode: 'MGIBBIE', gold: 3000, dust: 0, packs: 0, collection: {}, decks: [], stats: { runs: 0, wins: 0, chars: {} } };
const storedRuns = {};

const visible = sel => `(() => { const b = document.querySelector('${sel}'); return b && getComputedStyle(b).display !== 'none' ? b : null; })()`;
const overlayText = page => page.evaluate(`(${visible('#dungeon-overlay')} || { textContent: '' }).textContent`);
const live = page => page.evaluate(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players) && !g.state.over); });
async function click(page, textIncludes, ms = 15000) {
	return waitFor(() => page.evaluate((t) => {
		const box = document.querySelector('#dungeon-overlay'); if (!box || getComputedStyle(box).display === 'none') return false;
		const b = [...box.querySelectorAll('button')].find(x => x.textContent.trim().toLowerCase().includes(t.toLowerCase()));
		if (!b) return false; b.click(); return true;
	}, textIncludes), ms);
}
// a fresh run: answer every setup overlay (class / wing / hero / power / anomaly /
// the arena draft / the opening hand) until the fight is live
async function toLiveFight(page, ms = 90000) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) {
		if (await live(page)) return true;
		await page.evaluate(() => {
			for (const sel of ['#scry-modal', '#dungeon-overlay']) {
				const box = document.querySelector(sel); if (!box || getComputedStyle(box).display === 'none') continue;
				const btns = [...box.querySelectorAll('button')].filter(b => !b.disabled && b.offsetParent !== null);
				const b = btns.find(x => /no anomaly|keep hand/i.test(x.textContent)) || btns.find(x => !/abandon|leaderboard/i.test(x.textContent));
				if (b) { b.click(); return; }
			}
		});
		await sleep(250);
	}
	return false;
}
const local = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), key);

async function endFightAndLeave(page, url, key, humanWins) {
	await waitFor(async () => !!(await local(page, key))?.snapshot, 15000);
	await page.evaluate(w => { const g = window.__game; g.E.concede(g.state, w ? 1 : g.HUMAN); g.pump(); }, humanWins);
	const over = await page.evaluate(() => ({ over: !!window.__game.state.over, won: window.__game.state.winner === window.__game.HUMAN }));
	await page.goto(url, { waitUntil: 'domcontentloaded' });   // pagehide fires on the way out
	await sleep(300);
	return over;
}

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let body = ''; for await (const c of req) body += c;
			let msg = {}; try { msg = JSON.parse(body); } catch { }
			const ok = o => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
			if (msg.action === 'run-save') { storedRuns[msg.key] = { run: msg.run, updated_at: Date.now() }; return ok({ ok: true }); }
			if (msg.action === 'run-load') return ok({ ok: true, runs: storedRuns });
			if (msg.action === 'run-clear') { delete storedRuns[msg.key]; return ok({ ok: true }); }
			return ok({ ok: true, state: STATE, runs: storedRuns, friends: [], challenges: [], match: null, presence: null });
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	await new Promise(r => server.listen(PORT, r));
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	const errs = [];
	const newPage = async () => {
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
		page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'mgibbie');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_username', 'mgibbie');
		}, STATE);
		return page;
	};
	try {
		// ═════ DUNGEON: a won fight, its reward frame-exact across reloads ═════
		{
			const KEY = 'magepunk_dungeon_v1', URL = `http://localhost:${PORT}/battlecards/index.html?dungeon=1`;
			const page = await newPage();
			await page.goto(URL, { waitUntil: 'domcontentloaded' });
			A(await toLiveFight(page), 'dungeon: the level-1 fight is live', errs.slice(0, 2));
			const deck0 = (await local(page, KEY))?.deck?.length;
			const o = await endFightAndLeave(page, URL, KEY, true);
			A(o.over && o.won, 'dungeon: the fight is won');
			const srv = storedRuns[KEY]?.run;
			A(srv && srv.pendingResult?.won === true && !srv.snapshot, 'dungeon: the server copy carries the WIN and no fight snapshot', srv && { pr: srv.pendingResult, snap: !!srv.snapshot });
			await click(page, 'Continue');
			const cleared = await waitFor(async () => /LEVEL 1 CLEARED/.test(await overlayText(page)), 15000);
			A(cleared && !(await live(page)), 'dungeon: Continue opens the LEVEL 1 CLEARED reward, not the fight', (await overlayText(page)).slice(0, 80));
			const offers1 = await overlayText(page);
			await page.goto(URL, { waitUntil: 'domcontentloaded' });
			await click(page, 'Continue');
			await waitFor(async () => /LEVEL 1 CLEARED/.test(await overlayText(page)), 15000);
			A(offers1 && (await overlayText(page)) === offers1, 'dungeon: a reload shows the SAME bucket offers');
			await click(page, 'Take these');
			await waitFor(async () => /TREASURE!/.test(await overlayText(page)), 10000);
			const mid = await local(page, KEY);
			A(mid && mid.deck.length === deck0 + 3 && mid.pendingResult?.stage === 2, 'dungeon: the bucket pick is saved (+3 cards) with the next stage', mid && { deck: mid.deck.length, deck0, pr: mid.pendingResult });
			await page.goto(URL, { waitUntil: 'domcontentloaded' });
			await click(page, 'Continue');
			const atTreasure = await waitFor(async () => /TREASURE!/.test(await overlayText(page)), 15000);
			A(atTreasure && (await local(page, KEY)).deck.length === deck0 + 3, 'dungeon: a reload mid-reward resumes at the TREASURE (the bucket is not offered again)', (await overlayText(page)).slice(0, 60));
			await click(page, 'Take it');
			await waitFor(async () => /LEVEL 2/.test(await overlayText(page)), 10000);
			const after = await local(page, KEY);
			A(after && after.level === 2 && !after.pendingResult && after.passives.length === 1, 'dungeon: taking the treasure advances to LEVEL 2 and settles the result', after && { level: after.level, pr: after.pendingResult, passives: after.passives });
			await page.close();
		}
		// ═════ HEIST: a lost fight ends the run ═════
		{
			const KEY = 'magepunk_heist_v1', URL = `http://localhost:${PORT}/battlecards/index.html?heist=1`;
			const page = await newPage();
			await page.goto(URL, { waitUntil: 'domcontentloaded' });
			A(await toLiveFight(page), 'heist: the fight is live', errs.slice(0, 2));
			const o = await endFightAndLeave(page, URL, KEY, false);
			A(o.over && !o.won, 'heist: the fight is lost');
			const srv = storedRuns[KEY]?.run;
			A(!srv || (srv.pendingResult?.won === false && !srv.snapshot), 'heist: the server copy carries the LOSS and no fight snapshot', srv && { pr: srv.pendingResult, snap: !!srv.snapshot });
			await click(page, 'Continue');
			const foiled = await waitFor(async () => /HEIST FOILED/.test(await overlayText(page)), 15000);
			A(foiled && !(await live(page)), 'heist: Continue ends the run (HEIST FOILED), the fight does not come back', (await overlayText(page)).slice(0, 80));
			await sleep(400);
			A((await local(page, KEY)) == null && !storedRuns[KEY], 'heist: the run is cleared locally and on the server');
			await page.close();
		}
		// ═════ TOMBS: a won fight opens its reward ═════
		{
			const KEY = 'magepunk_tombs_v1', URL = `http://localhost:${PORT}/battlecards/index.html?tombs=1`;
			const page = await newPage();
			await page.goto(URL, { waitUntil: 'domcontentloaded' });
			A(await toLiveFight(page), 'tombs: the fight is live', errs.slice(0, 2));
			const o = await endFightAndLeave(page, URL, KEY, true);
			A(o.over && o.won, 'tombs: the fight is won');
			const srv = storedRuns[KEY]?.run;
			A(srv && srv.pendingResult?.won === true && !srv.snapshot, 'tombs: the server copy carries the WIN and no fight snapshot', srv && { pr: srv.pendingResult, snap: !!srv.snapshot });
			await click(page, 'Continue');
			const won = await waitFor(async () => /FIGHT 1 WON/.test(await overlayText(page)), 15000);
			A(won && !(await live(page)), 'tombs: Continue opens the FIGHT 1 WON reward, not the fight', (await overlayText(page)).slice(0, 80));
			await page.close();
		}
		// ═════ ARENA: a won fight is banked ═════
		{
			const KEY = 'magepunk_arena_v1', URL = `http://localhost:${PORT}/battlecards/index.html?arena=1`;
			const page = await newPage();
			await page.goto(URL, { waitUntil: 'domcontentloaded' });
			A(await toLiveFight(page, 150000), 'arena: the fight is live (after the draft)', errs.slice(0, 2));
			const o = await endFightAndLeave(page, URL, KEY, true);
			A(o.over && o.won, 'arena: the fight is won');
			const srv = storedRuns[KEY]?.run;
			A(srv && srv.pendingResult?.won === true && !srv.snapshot, 'arena: the server copy carries the WIN and no fight snapshot', srv && { pr: srv.pendingResult, snap: !!srv.snapshot });
			await click(page, 'Continue');
			const banked = await waitFor(async () => /WIN - 1 win/.test(await overlayText(page)), 15000);
			const run = await local(page, KEY);
			A(banked && !(await live(page)) && run && run.wins === 1 && !run.pendingResult, 'arena: Continue banks the win (1W) and offers the next fight', { text: (await overlayText(page)).slice(0, 60), wins: run && run.wins, pr: run && run.pendingResult });
			await page.close();
		}
		A(errs.length === 0, 'no page errors', errs.slice(0, 3));
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
