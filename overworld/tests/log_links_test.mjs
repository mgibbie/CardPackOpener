// log_links_test.mjs — a usable Battlecards game log with clickable card names
// (Plans/CONTROLLER_V2_PLAN.md D).
//
// Owner (2026-10-01): "i also want the log to be usable and i should be able to
// click the names of cards in the log to see the card. this should work both with
// or without the controller."
//   1. a played card's name is a link, in the fading feed AND the 📜 drawer
//   2. clicking it opens the card focus view on THAT card (the live one)
//   3. a card that has since died opens its definition
//   4. two copies of one name each link to their own card
//   5. hidden information: a name linked while its only copy is in the enemy's
//      hand opens the definition, never that hidden card
//   6. the drawer: turn headings, Esc closes the reader first, then the drawer
//   7. controller: Start > Game log, move to a name, confirm opens it, cancel
//      backs out to the drawer, cancel again closes it; the right stick scrolls
//
//   node overworld/tests/log_links_test.mjs
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
const PORT = 9182;
const STATE = { username: 'loglinks', friendCode: 'LOGLNK', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = await new Promise(r => {
	const s = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { for await (const _ of req) {} res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	s.listen(PORT, () => r(s));
});
const BTN = { bottom: 0, right: 1, left: 2, top: 3, lb: 4, rb: 5, start: 9, up: 12, down: 13, leftD: 14, rightD: 15 };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720 });
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(st => {
		const pad = { id: 'Pro Controller 057e', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
		window.__owFakePads = [pad]; window.__pad = pad;
		localStorage.setItem('magepunk_mp_token_v1', 'loglinks-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
	}, STATE);
	await page.goto(`http://localhost:${PORT}/battlecards/index.html?players=2`, { waitUntil: 'domcontentloaded' });
	const t0 = Date.now();
	while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__game && window.__game.state && window.__game.targeting)).catch(() => false))) await sleep(200);
	await sleep(2500);
	await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /keep hand/i.test(x.textContent)); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } });
	await sleep(900);
	const tap = async (b, ms = 70) => { await page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, b); await sleep(ms); await page.evaluate(b => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, b); await sleep(170); };
	const focus = () => page.evaluate(() => window.__game.cardFocus);
	const press = sel => page.evaluate(sel => { const el = typeof sel === 'string' ? document.querySelector(sel) : null; if (el) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); return !!el; }, sel);

	// seed: my turn; three plain creatures in hand, two of them the SAME card; a
	// different card only in the enemy's hand
	const seed = await page.evaluate(() => {
		const g = window.__game, s = g.state, E = g.E, H = g.HUMAN, F = 1 - H;
		const all = Object.values(s.cardsById).filter(Boolean);
		const plain = c => c.type === 'creature' && c.attack > 0 && c.health >= 2 && !c.activated && !c.titan && !c.magnetic && !c.disguised && c.collectible !== false
			&& !c.adventure && !c.choices && !c.altCost && !c.kicker && !c.battlecry && !c.tradeable && !c.prepare && !c.forge && !c.deathrattle && !c.ongoing && !E.targetSpec(s, H, c)
			&& (c.cost || 0) <= 4 && /^[A-Z][A-Za-z ]{5,}$/.test(c.name);
		// names that appear nowhere else in this match (so the auto-linker can't confuse them)
		const inPlay = new Set(s.players.flatMap(p => [...p.deck, ...p.hand]).map(c => c.name));
		const cr = all.filter(c => plain(c) && !inPlay.has(c.name));
		const p = s.players[H], f = s.players[F];
		p.board.length = 0; f.board.length = 0;
		p.mana.cur = 30; p.mana.bonus = 0;
		p.hand.length = 0;
		const mk = (def, pi) => { const c = E.instantiate(def, pi); c.zone = 'hand'; s.players[pi].hand.push(c); return c; };
		const a = mk(cr[0], H), b1 = mk(cr[1], H), b2 = mk(cr[1], H);
		const secret = mk(cr[2], F);
		s.current = H; s.priority = null; s.stack = [];
		g.pump();
		return { a: { uid: a.uid, name: a.name, id: a.id }, b1: b1.uid, b2: b2.uid, bName: b1.name, bId: b1.id, secret: { uid: secret.uid, name: secret.name, id: secret.id } };
	});
	A(seed.a && seed.bName && seed.secret, 'setup: two different creatures (one twice) in my hand, another only in the enemy\'s hand', JSON.stringify(seed));
	const play = uid => page.evaluate(u => { const g = window.__game; g.E.playCard(g.state, g.HUMAN, u, null, null, g.state.players[g.HUMAN].board.length); g.pump(); }, uid);
	await play(seed.a.uid); await sleep(1100);

	// ===== 1-2: the played card's name is a link; it opens THAT card =====
	const lastLinks = () => page.evaluate(() => { const L = window.__game.logLines, K = window.__game.logLinks; return L.map((t, i) => ({ t, links: K[i] })).filter(x => x.links.length).slice(-6); });
	let ll = await lastLinks();
	const playedLine = ll.find(x => x.t.includes('played') && x.t.includes(seed.a.name));
	A(playedLine && playedLine.links.some(l => l.uid === seed.a.uid && playedLine.t.slice(l.s, l.e) === seed.a.name), '"You played X": X is a link to that very card', JSON.stringify(playedLine));
	const feedBtn = await page.evaluate(n => [...document.querySelectorAll('#log .log-card')].some(b => b.textContent === n), seed.a.name);
	A(feedBtn, 'the fading feed shows it as a clickable name');
	A(await page.evaluate(() => getComputedStyle(document.querySelector('#log .log-card')).pointerEvents === 'auto'), '...that takes clicks (the feed itself stays click-through)');
	// a real mouse click on the feed link
	const fb = await page.evaluate(n => { const b = [...document.querySelectorAll('#log .log-card')].find(x => x.textContent === n); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, seed.a.name);
	await page.mouse.move(fb.x, fb.y); await sleep(80);
	await page.mouse.down(); await page.mouse.up(); await sleep(250);
	A((await focus())?.uid === seed.a.uid, '[mouse] clicking the name in the feed opens that card in the focus view', JSON.stringify(await focus()));
	await page.keyboard.press('Escape'); await sleep(150);

	// ===== 4: two copies, each its own link =====
	await play(seed.b1); await sleep(900);
	await play(seed.b2); await sleep(900);
	ll = await lastLinks();
	const bLines = ll.filter(x => x.t.includes('played') && x.t.includes(seed.bName));
	A(bLines.length === 2 && bLines[0].links[0]?.uid === seed.b1 && bLines[1].links[0]?.uid === seed.b2, 'two copies of one card: each "played" line links to its own copy', JSON.stringify(bLines));

	// ===== 3: a card that died opens its definition =====
	await page.evaluate(u => { const g = window.__game, c = g.state.players[g.HUMAN].board.find(x => x.uid === u); c.damage = c.maxHealth; g.E.sweepDeaths(g.state); g.pump(); }, seed.a.uid);
	await sleep(1200);
	ll = await lastLinks();
	const died = ll.find(x => x.t.includes('died') && x.t.includes(seed.a.name));
	A(!!died && died.links.length > 0, '"X died": X is a link', JSON.stringify(died));
	// ===== 6: the drawer =====
	await page.click('#log-btn'); await sleep(250);
	A(await page.evaluate(() => document.getElementById('log-full').classList.contains('open')), 'the 📜 Log button opens the drawer');
	A(await page.evaluate(() => document.querySelectorAll('#log-full .lf-turn').length >= 1), '...with turn headings', await page.evaluate(() => document.querySelector('#log-full .lf-body').innerHTML.slice(0, 200)));
	const drawerA = await page.evaluate(n => [...document.querySelectorAll('#log-full .log-card')].filter(b => b.textContent === n).length, seed.a.name);
	A(drawerA >= 2, '...and its card names are links too (played + died)', String(drawerA));
	// the died line's link: the card is gone from play, so its definition opens
	await page.evaluate(n => { const bs = [...document.querySelectorAll('#log-full .log-card')].filter(b => b.textContent === n); bs[bs.length - 1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); }, seed.a.name);
	await sleep(250);
	let f = await focus();
	A(f && f.id === seed.a.id, '[mouse] a dead card\'s name opens its card (the definition)', JSON.stringify(f));
	await page.keyboard.press('Escape'); await sleep(150);
	A(!(await focus()) && await page.evaluate(() => document.getElementById('log-full').classList.contains('open')), 'Esc closes the card first, the drawer stays');
	await page.keyboard.press('Escape'); await sleep(150);
	A(!(await page.evaluate(() => document.getElementById('log-full').classList.contains('open'))), '...and Esc again closes the drawer');

	// ===== 5: hidden information =====
	await page.evaluate(n => window.__game.logForTest(`(test) the name ${n} printed while its only copy is in the enemy's hand`), seed.secret.name);
	ll = await lastLinks();
	const hid = ll.find(x => x.t.startsWith('(test)'));
	A(hid && hid.links.length === 1 && hid.links[0].uid == null, 'a name whose only copy is in the ENEMY\'S HAND links with no card behind it (no uid)', JSON.stringify(hid));
	await page.evaluate(() => { const bs = [...document.querySelectorAll('#log .log-card')]; bs[bs.length - 1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); });
	await sleep(250);
	f = await focus();
	A(f && f.zone === 'preview' && f.uid !== seed.secret.uid, '...clicking it shows the card\'s definition, never the hidden card in their hand', JSON.stringify(f));
	await page.keyboard.press('Escape'); await sleep(150);

	// ===== 7: controller =====
	await page.evaluate(() => { for (let i = 0; i < 60; i++) window.__game.logForTest(`(filler line ${i})`); });
	await page.mouse.move(5, 5);
	await tap(BTN.rightD);                       // the first press shows board focus
	await tap(BTN.start); await sleep(200);
	A(await page.evaluate(() => window.__padboard.menuOpen), '[pad] Start opens the menu');
	// move to "Game log" and confirm (padnav)
	for (let i = 0; i < 6 && !(await page.evaluate(() => /log/i.test(window.__padnav.focused?.textContent || ''))); i++) await tap(BTN.down);
	await tap(BTN.right); await sleep(300);
	A(await page.evaluate(() => document.getElementById('log-full').classList.contains('open')), '[pad] Menu > Game log opens the drawer');
	A(await page.evaluate(() => window.__padboard.active() === false), '[pad] ...and padnav drives it (the board stands aside)');
	// the right stick scrolls it
	const top0 = await page.evaluate(() => document.querySelector('#log-full .lf-body').scrollTop);
	await page.evaluate(() => { window.__pad.axes[3] = -1; }); await sleep(400); await page.evaluate(() => { window.__pad.axes[3] = 0; }); await sleep(100);
	const top1 = await page.evaluate(() => document.querySelector('#log-full .lf-body').scrollTop);
	A(top1 < top0, '[pad] the right stick scrolls the log', JSON.stringify({ top0, top1 }));
	A(await page.evaluate(() => { const f = window.__padnav.focused, all = [...document.querySelectorAll('#log-full .log-card')]; return !!f && f === all[all.length - 1]; }), '[pad] the selector starts on the newest card name in the log');
	// move focus onto a card name
	let onName = await page.evaluate(() => !!window.__padnav.focused?.classList.contains('log-card'));
	for (let i = 0; i < 30 && !onName; i++) { await tap(i < 15 ? BTN.down : BTN.up); onName = await page.evaluate(() => !!window.__padnav.focused?.classList.contains('log-card')); }
	A(onName, '[pad] the d-pad moves between the card names in the log');
	const nm = await page.evaluate(() => window.__padnav.focused.textContent);
	await tap(BTN.right); await sleep(250);
	f = await focus();
	A(f && (f.uid === seed.b1 || f.uid === seed.b2 || f.id === seed.a.id || f.zone === 'preview'), `[pad] confirm on "${nm}" opens that card`, JSON.stringify(f));
	await tap(BTN.bottom); await sleep(250);
	A(!(await focus()) && await page.evaluate(() => document.getElementById('log-full').classList.contains('open')), '[pad] cancel closes the card, back in the drawer');
	await tap(BTN.bottom); await sleep(250);
	A(!(await page.evaluate(() => document.getElementById('log-full').classList.contains('open'))) && await page.evaluate(() => window.__padboard.active()), '[pad] cancel again closes the drawer; the board has the pad back');

	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
