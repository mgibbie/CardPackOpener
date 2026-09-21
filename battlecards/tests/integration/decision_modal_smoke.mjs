// decision_modal_smoke.mjs — a forced choice must be impossible to miss, and
// impossible to click past.
//
// Reported: "Hidden Scry / Discover / discard modals swallow all input. End Turn,
// attacks, and spells appear broken until an easy-to-miss modal is completed. The
// UI gives no strong indication that the modal owns input."
//
// TWO CAUSES, both real:
//  1. #scry-modal sat at z-index 11. The game UI runs 8-70 and the chat sits at
//     9000, so a BLOCKING decision could render underneath the board furniture.
//  2. Its "dimming" is a 100vmax box-shadow, which paints but cannot catch a
//     click. Every tap went through to a board that (correctly) refuses to act
//     while a decision is owed — so the game looked broken rather than busy.
//
// Fixed by raising it above the game UI and giving it a real veil, plus naming
// the refusal when End Turn is pressed with a choice outstanding.
//
// Standalone (headless Chrome + puppeteer-core); NOT in run-all.
//   node battlecards/tests/integration/decision_modal_smoke.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8875;
const STATE = { username: 'modal', friendCode: 'MODAL0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = await new Promise(r => {
	const s = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	s.listen(PORT, () => r(s));
});

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720 });   // the reported resolution
	const errors = [];
	page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 'modal'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, STATE);
	await page.goto(`http://localhost:${PORT}/battlecards/index.html?players=2`, { waitUntil: 'domcontentloaded' });
	const t0 = Date.now();
	while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__game && window.__game.state && window.__game.targeting)).catch(() => false))) await sleep(200);
	A(await page.evaluate(() => !!window.__game?.state), 'booted');
	await sleep(2200);
	await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /keep hand/i.test(x.textContent)); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } });
	await sleep(900);

	// force a discard decision on the human, exactly as an over-full hand does
	const setup = await page.evaluate(() => {
		const g = window.__game, s = g.state, E = g.E;
		const p = s.players[g.HUMAN];
		s.current = g.HUMAN; s.priority = null; s.stack = [];
		const pick = Object.values(s.cardsById).find(c => c && c.type === 'creature' && c.cost <= 3);
		p.hand.length = 0;
		for (let i = 0; i < 4; i++) { const c = E.instantiate(pick, g.HUMAN); c.zone = 'hand'; p.hand.push(c); }
		s.discardQueue.push({ player: g.HUMAN, count: 1 });
		g.pump();
		return { hand: p.hand.length, pending: E.hasPendingDecision(s, g.HUMAN) };
	});
	A(setup.pending === true, 'setup: the human owes a forced discard', JSON.stringify(setup));
	await sleep(1200);

	// the modal must actually be up, and ON TOP
	const vis = await page.evaluate(() => {
		const m = document.getElementById('scry-modal');
		const cs = getComputedStyle(m);
		const r = m.getBoundingClientRect();
		// what does the browser say is at the modal's own centre?
		const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
		return { display: cs.display, z: +cs.zIndex, w: Math.round(r.width), h: Math.round(r.height), hitInside: !!(hit && m.contains(hit)) };
	});
	A(vis.display !== 'none' && vis.w > 0, 'the decision modal is on screen', JSON.stringify(vis));
	A(vis.z >= 9000, 'it outranks the board furniture and the chat', 'z-index ' + vis.z);
	A(vis.hitInside, 'and nothing is painted over it', JSON.stringify(vis));

	// a click on the BOARD must not reach the board while a choice is owed
	const veil = await page.evaluate(() => {
		const m = document.getElementById('scry-modal');
		const r = m.getBoundingClientRect();
		// a point well away from the modal, out over the board
		const x = 40, y = Math.round(window.innerHeight * 0.30);
		const hit = document.elementFromPoint(x, y);
		const veilEl = document.getElementById('modal-veil');
		const caught = !!(hit && (hit === m || m.contains(hit) || hit === veilEl));
		return { tag: hit ? hit.tagName + (hit.id ? '#' + hit.id : '') : null, isVeil: caught, modalRect: [Math.round(r.left), Math.round(r.top)] };
	});
	A(veil.isVeil, 'a tap out on the board is caught by the modal veil, not the board', JSON.stringify(veil));

	// End Turn must SAY why it refuses, and re-surface the choice
	const refused = await page.evaluate(async () => {
		const g = window.__game;
		document.getElementById('scry-modal').style.display = 'none';   // simulate a missed/dismissed modal
		const before = g.state.turnNumber + ':' + g.state.current;
		g.actEndTurn();
		await new Promise(r => setTimeout(r, 400));
		const b = document.getElementById('banner');
		return {
			turnHeld: before === g.state.turnNumber + ':' + g.state.current,
			banner: (b && b.textContent) || '',
			reopened: getComputedStyle(document.getElementById('scry-modal')).display !== 'none',
		};
	});
	A(refused.turnHeld, 'End Turn still refuses while a choice is owed (correct)');
	A(/finish your choice/i.test(refused.banner), 'and it says so instead of doing nothing silently', JSON.stringify(refused.banner));
	A(refused.reopened, 'and it puts the missed modal back in front of you', JSON.stringify(refused));

	// once the choice is gone the veil must come down with the modal. The close
	// path itself is pre-existing and not what this change touches, so drive the
	// modal's visibility the way the app does and assert the veil MIRRORS it —
	// which is the actual contract the MutationObserver provides.
	const after = await page.evaluate(async () => {
		const g = window.__game;
		g.E.resolveDiscard(g.state, [g.state.players[g.HUMAN].hand[0].uid]);
		g.pump();
		document.getElementById('scry-modal').style.display = 'none';
		await new Promise(r => setTimeout(r, 300));
		const veilEl = document.getElementById('modal-veil');
		const hit = document.elementFromPoint(40, Math.round(window.innerHeight * 0.30));
		return {
			pending: g.E.hasPendingDecision(g.state, g.HUMAN),
			veil: getComputedStyle(veilEl).display,
			boardReachable: hit !== veilEl,
			hit: hit ? hit.tagName + (hit.id ? '#' + hit.id : '') : null,
		};
	});
	A(!after.pending, 'the forced choice is resolved', JSON.stringify(after));
	A(after.veil === 'none', 'the veil comes down when the modal does', JSON.stringify(after));
	A(after.boardReachable, 'and the board takes clicks again', JSON.stringify(after));

	A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 2).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, e.stack);
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
