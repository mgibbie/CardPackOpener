// run_flow_1026_test.mjs — bug review 2026-10-26 (instinctgauntlet), the browser half:
//
//  A. Fight! on a run's NEXT screen used to land on "<RUN> IN PROGRESS / Continue the run"
//     (keys bug:1792674248313, bug:1792674580922): Fight! reloads the page, and the boot
//     treated every reload as a return to the mode. Now Fight! boots straight into the fight;
//     a MANUAL reload still asks.
//  B. The notification bell did nothing on Battlecards screens (keys bug:1792763423759,
//     bug:1792763494268): the top-bar cluster sat UNDER the run overlays and the board, and
//     its inbox opened beneath them. A real mouse click on the bell opens a visible inbox —
//     mid-fight and on the NEXT screen.
//  C. A tucked hand (a press on the field tucks it) sat below a 720px window's edge
//     (key bug:1792939359303): its cards' centers must stay on screen.
//  D. The replay viewer said "null wins!" and its log drawer was empty
//     (keys bug:1792958084144, bug:1792958248077).
//
// Flow: a real ?middleearth=1 run at 1280x720 against a stub /api/mp.
//   node battlecards/tests/integration/run_flow_1026_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const BC = path.resolve(HERE, '../..');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 9271;
const KEY = 'magepunk_middleearth_v1';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms, every = 150) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(every); } return false; }

const STATE = { username: 'mgibbie', friendCode: 'MGIBBIE', gold: 3000, dust: 0, packs: 0, collection: {}, decks: [], stats: null };
const storedRuns = {};

async function clickInOverlay(page, textIncludes, ms = 20000) {
	return waitFor(() => page.evaluate(t => {
		const box = document.querySelector('#dungeon-overlay'); if (!box || getComputedStyle(box).display === 'none') return false;
		const b = [...box.querySelectorAll('button')].find(x => x.textContent.trim().toLowerCase().includes(t.toLowerCase()));
		if (!b) return false; b.click(); return true;
	}, textIncludes), ms);
}
const overlayText = page => page.evaluate(() => { const b = document.querySelector('#dungeon-overlay'); return b && getComputedStyle(b).display !== 'none' ? b.textContent : ''; });
const liveFight = page => page.evaluate(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players) && !g.state.over); });
// click the bell like a person: a real mouse event at its center, then is a visible inbox on top?
async function bellOpensInbox(page) {
	const r = await page.evaluate(() => { const b = document.querySelector('#tb-bell'); if (!b) return null; const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
	if (!r) return { ok: false, why: 'no bell' };
	const topAtBell = await page.evaluate(p => { const e = document.elementFromPoint(p.x, p.y); return e ? (e.closest('#tb-bell') ? 'bell' : (e.id || e.tagName)) : null; }, r);
	await page.mouse.click(r.x, r.y);
	const opened = await waitFor(() => page.evaluate(() => {
		const p = document.querySelector('#mp-inbox'); if (!p || !p.classList.contains('open')) return false;
		const q = p.getBoundingClientRect(); const e = document.elementFromPoint(q.x + q.width / 2, q.y + 40);
		return !!(e && e.closest('#mp-inbox'));   // open AND on top (not under the board / an overlay)
	}), 4000);
	await page.keyboard.press('Escape');
	await sleep(300);
	return { ok: opened, topAtBell };
}

(async () => {
	// D's tape: recorded in node through the live pipeline (a fight seat 0 wins)
	globalThis.localStorage = (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
	const E = await import('../../engine/index.js');
	const Rec = await import('../../replayrec.js');
	const cardsById = {}; for (const c of JSON.parse(fs.readFileSync(path.join(BC, 'cards.json'))).cards) cardsById[c.id] = c;
	Rec.setCards(cardsById);
	const picks = [{ id: 'warrior', name: 'Éowyn', power: null }, { id: 'warlock', name: 'Gothmog', power: null }];
	const tst = E.createGame(cardsById, E.seededRng(4242), null, 2, picks);
	tst.classPicks = picks;
	Rec.startRecording({ mode: 'middleearth', players: 2, heroes: [{ classId: 'warrior', name: 'You' }, { classId: 'warlock', name: 'Gothmog' }] });
	Rec.capture(tst, 'Lorequest: Middle-earth - 0 wins / 0 losses. Facing Gothmog (Mook).');
	for (let i = 0; i < 4 && !tst.over; i++) { E.endTurn(tst); Rec.capture(tst, `— Turn ${i + 2}: ${i % 2 ? 'You' : 'Gothmog'} —`); }
	E.concede(tst, 1); Rec.capture(tst, 'Gothmog conceded');
	const tapeId = await Rec.finish({ winner: 0, result: 'win' });
	const tapeStore = globalThis.localStorage.getItem('magepunk_replays_v1');
	delete globalThis.localStorage;

	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let body = ''; for await (const c of req) body += c;
			let msg = {}; try { msg = JSON.parse(body); } catch { }
			const ok = o => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
			if (msg.action === 'run-save') { storedRuns[msg.key] = { run: msg.run, updated_at: Date.now() }; return ok({ ok: true }); }
			if (msg.action === 'run-load') return ok({ ok: true, runs: storedRuns });
			if (msg.action === 'run-clear') { delete storedRuns[msg.key]; return ok({ ok: true }); }
			if (msg.action === 'challenges') return ok({ challenges: [] });
			if (msg.action === 'friends') return ok({ friends: [], friendCode: 'MGIBBIE' });
			if (msg.action === 'chat-get') return ok({ messages: [] });
			return ok({ ok: true, state: STATE, runs: storedRuns, friends: [], challenges: [], match: null, presence: null });
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	await new Promise(r => server.listen(PORT, r));
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		const errs = [];
		page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'mgibbie');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_username', 'mgibbie');
		}, STATE);
		const URL = `http://localhost:${PORT}/battlecards/index.html?middleearth=1`;

		// ── a live Middle-earth fight ──
		await page.goto(URL, { waitUntil: 'domcontentloaded' });
		A(await clickInOverlay(page, 'Play this hero'), 'hero pick appears — chose a hero');
		if (await clickInOverlay(page, 'No anomaly', 6000)) console.log('note: skipped the weekly anomaly');
		await waitFor(() => page.evaluate(() => { const b = [...document.querySelectorAll('#scry-modal button')].find(x => /keep hand/i.test(x.textContent)); if (b && b.offsetParent) { b.click(); return true; } return false; }), 6000);
		A(await waitFor(() => liveFight(page), 30000), 'the fight is live', errs.slice(0, 2));
		await sleep(1500);

		// ── B: the bell mid-fight ──
		const bFight = await bellOpensInbox(page);
		A(bFight.ok, 'B: a real click on the bell opens a visible inbox mid-fight', bFight);
		// ...and while a decision veil is up (a Discover / scry owed mid-fight)
		await page.evaluate(() => { document.querySelector('#modal-veil').style.display = 'block'; });
		const bVeil = await bellOpensInbox(page);
		await page.evaluate(() => { document.querySelector('#modal-veil').style.display = 'none'; });
		A(bVeil.ok, 'B: the bell still opens the inbox over a decision veil', bVeil);

		// ── C: tuck the hand with a press on the empty field, at 1280x720 ──
		await waitFor(() => page.evaluate(() => window.__game.state.current === window.__game.HUMAN), 15000);
		await page.mouse.move(640, 300); await page.mouse.down(); await page.mouse.up();
		await sleep(1200);
		const tuck = await page.evaluate(() => {
			const g = window.__game, me = g.state.players[g.HUMAN];
			return { mini: g.handMini, ys: me.hand.map(c => g.screenPosOf(c.uid)).filter(Boolean).map(p => Math.round(p.y)), h: innerHeight };
		});
		A(tuck.mini === true, 'C: a press on the field tucks the hand', tuck);
		A(tuck.ys.length > 0 && Math.max(...tuck.ys) <= tuck.h - 20, 'C: every tucked hand card is centered ON screen at 720px tall', tuck);
		await page.mouse.move(640, 700); await sleep(600);   // reaching down raises it again
		A(await page.evaluate(() => window.__game.handMini === false), 'C: reaching for the hand raises it (unchanged)');

		// ── A: put the run on its post-fight checkpoint (a loss: straight to NEXT) ──
		const firstFoe = await page.evaluate(k => {
			const r = JSON.parse(localStorage.getItem(k)); r.losses = 1; r.postGame = { won: false, seed: 5, stage: 1 };
			delete r.snapshot; delete r.snapshotAt; r.rev = (r.rev || 0) + 1000; localStorage.setItem(k, JSON.stringify(r)); return r.enemy.id;
		}, KEY);
		await page.goto(URL, { waitUntil: 'domcontentloaded' });   // a MANUAL reload: still asks
		A(await waitFor(async () => /RUN IN PROGRESS/.test(await overlayText(page)), 20000), 'A: a manual reload still shows the in-progress prompt', await overlayText(page));
		A(await clickInOverlay(page, 'Continue the run'), 'A: Continue the run');
		A(await waitFor(async () => /NEXT:/.test(await overlayText(page)), 15000), 'A: the NEXT screen', await overlayText(page));
		const faced = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).faced, KEY);
		A(Array.isArray(faced) && faced.includes(firstFoe), 'the run remembers the foe it just faced (no repeats later)', { faced, firstFoe });

		// B on the NEXT screen (the overlay covers the board)
		const bNext = await bellOpensInbox(page);
		A(bNext.ok, 'B: a real click on the bell opens a visible inbox on the NEXT screen', bNext);

		// A: Fight! goes straight into the fight
		const nextFoe = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).enemy.id, KEY);
		const navP = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
		A(await clickInOverlay(page, 'Fight!'), 'A: clicked Fight!');
		await navP;
		let sawPrompt = false;
		const live = await waitFor(async () => { if (/RUN IN PROGRESS/.test(await overlayText(page))) sawPrompt = true; return liveFight(page); }, 30000, 100);
		A(!sawPrompt, 'A: Fight! does NOT pass through "RUN IN PROGRESS / Continue the run"', await overlayText(page));
		A(live, 'A: ...it starts the fight on the first click');
		A(live && await page.evaluate(() => window.__game.state.classPicks?.[1]?.name), 'A: against the announced foe', { nextFoe });
		const rec = await page.evaluate(k => { const r = JSON.parse(localStorage.getItem(k)); return { w: r.wins, l: r.losses, deck: r.deck.length }; }, KEY);
		A(rec.w === 0 && rec.l === 1, 'A: the record is unchanged by the skip (0W/1L)', rec);
		await page.goto(URL, { waitUntil: 'domcontentloaded' });
		A(await waitFor(async () => /RUN IN PROGRESS/.test(await overlayText(page)), 20000), 'A: the marker is one-shot — the next manual reload asks again');
		A(errs.length === 0, 'no page errors in the run flow', errs.slice(0, 3));
		await page.close();

		// ── D: the replay viewer names the winner and shows its log ──
		const rp = await browser.newPage();
		await rp.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		const rerrs = []; rp.on('pageerror', e => rerrs.push(e.message.slice(0, 160)));
		await rp.evaluateOnNewDocument(store => { localStorage.setItem('magepunk_replays_v1', store); localStorage.setItem('magepunk_mp_token_v1', 'mgibbie'); }, tapeStore);
		await rp.goto(`http://localhost:${PORT}/battlecards/index.html?replay=${encodeURIComponent(tapeId)}`, { waitUntil: 'domcontentloaded' });
		A(await waitFor(() => rp.evaluate(() => !!window.__replay && window.__replay.total > 0), 30000), 'D: the replay loads');
		await rp.evaluate(() => { document.querySelector('#replay-bar')?.classList.remove('rb-min'); document.querySelector('#rb-last').click(); });
		await sleep(400);
		const hint = await rp.evaluate(() => document.querySelector('#hint')?.textContent || '');
		A(!/null/.test(hint) && /wins!$/.test(hint), 'D: the last frame names the winner (not "null wins!")', hint);
		await rp.evaluate(() => document.querySelector('#log-btn').click());
		await sleep(400);
		const lg = await rp.evaluate(() => { const b = document.querySelector('#log-full .lf-body'); const lines = b ? [...b.children].map(x => x.textContent) : []; const q = b && b.getBoundingClientRect(); return { lines, visible: !!(b && q.height > 20 && getComputedStyle(document.querySelector('#log-full')).display !== 'none') }; });
		A(lg.visible && lg.lines.length >= 3, 'D: the replay log drawer shows the fight\'s lines', lg);
		A(/wins!$/.test(lg.lines[lg.lines.length - 1] || '') && !/null/.test(lg.lines.join('|')), 'D: ...ending with the named result', lg.lines.slice(-2));
		A(rerrs.length === 0, 'no page errors in the replay', rerrs.slice(0, 3));
		await rp.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
