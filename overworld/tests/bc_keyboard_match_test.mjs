// bc_keyboard_match_test.mjs — a whole Battlecards match on the KEYBOARD alone
// (controls sweep B3: battlecards/padnav.js + padboard.js on site/input.js).
//
// Real key presses only (page.keyboard), never a mouse event: the mulligan modal
// (pointerdown-only buttons) with arrows / Z / Enter and V reading a card's rules,
// then play a creature into a chosen slot, arm / cancel / commit an attack, read
// a card (V) and close it (X), the log (C), the match menu (Enter) with its new
// Leave -> the Games switcher, End Turn, and concede through the menu. Also: Tab +
// Space on a decision modal's button, and ` still opens the Games switcher.
//
//   node overworld/tests/bc_keyboard_match_test.mjs
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
const PORT = 9171;
const STATE = { username: 'bckeys', friendCode: 'BCKEY0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720 });
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	// count every mouse / pointer event the page sees from a REAL input: there must be none
	await page.evaluateOnNewDocument(st => {
		window.__owFakePads = [];   // no controller at all
		localStorage.setItem('magepunk_mp_token_v1', 'bckeys-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_class_v1', 'druid');
		window.__realMouse = 0;
		for (const t of ['pointerdown', 'pointermove', 'mousedown', 'click', 'touchstart']) addEventListener(t, e => { if (e.isTrusted && !(t === 'click' && e.detail === 0)) window.__realMouse++; }, true);
	}, STATE);
	await page.goto(`http://localhost:${PORT}/battlecards/index.html?players=2`, { waitUntil: 'domcontentloaded' });
	const t0 = Date.now();
	while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__game && window.__game.state && window.__game.targeting)).catch(() => false))) await sleep(200);
	await page.waitForFunction(() => [...document.querySelectorAll('#scry-modal button')].some(x => /keep hand/i.test(x.textContent) && x.getBoundingClientRect().width > 0), { timeout: 20000 }).catch(() => {});
	await sleep(400);
	const key = async (k, ms = 160) => { await page.keyboard.press(k); await sleep(ms); };
	const ring = () => page.evaluate(() => { const f = document.querySelector('.padnav-focus'); return f ? { text: f.textContent.trim().slice(0, 40), cls: String(f.className), inModal: !!f.closest('#scry-modal, #walker-menu, #dungeon-overlay, #pad-match-menu, #card-focus, #log-full, [aria-modal]') } : null; });
	const pb = () => page.evaluate(() => ({ mode: window.__padboard?.mode, focus: window.__padboard?.focus, slot: window.__padboard?.slot, active: window.__padboard?.active() }));

	// ---- the mulligan, on keys ----
	A(await page.evaluate(() => !!document.querySelector('#scry-modal') && getComputedStyle(document.querySelector('#scry-modal')).display !== 'none'), 'setup: the opening-hand modal is up');
	await key('ArrowRight');
	let f = await ring();
	A(f && f.inModal, 'an arrow key shows a focus ring inside the mulligan (keyboard reaches the modal)', JSON.stringify(f));
	for (let i = 0; i < 6 && !/scry-cell/.test((await ring())?.cls || ''); i++) await key('ArrowUp');
	A(/scry-cell/.test((await ring())?.cls || ''), 'the arrows reach a card cell', JSON.stringify(await ring()));
	// V reads the focused card (its rules tip; hover-only before)
	await key('KeyV', 250);
	A(await page.evaluate(() => { const t = document.getElementById('mini-tip'); return !!t && t.style.display !== 'none' && t.textContent.length > 3; }), 'V shows the focused card\'s rules text');
	await key('KeyV', 200);
	A(await page.evaluate(() => { const t = document.getElementById('mini-tip'); return !t || t.style.display === 'none'; }), '...and V again puts it away');
	await key('KeyZ', 300);
	A(await page.evaluate(() => document.querySelectorAll('#scry-modal .mull-swap').length) === 1, 'Z marks the focused card to replace (a pointerdown-only handler)');
	await key('KeyZ', 300);
	A(await page.evaluate(() => document.querySelectorAll('#scry-modal .mull-swap').length) === 0, '...the ring stayed on it through the re-render, so Z again unmarks it');
	for (let i = 0; i < 6 && !/keep hand/i.test((await ring())?.text || ''); i++) await key('ArrowDown');
	A(/keep hand/i.test((await ring())?.text || ''), 'the arrows reach "Keep hand"', JSON.stringify(await ring()));
	await key('Enter', 800);
	A(await page.evaluate(() => getComputedStyle(document.getElementById('scry-modal')).display === 'none'), 'Enter keeps the hand (Enter works on the pointerdown-only modal)');

	// ---- seed: my turn, mana, two ready attackers, one foe, a plain creature in hand ----
	const seed = await page.evaluate(() => {
		const g = window.__game, s = g.state, E = g.E, H = g.HUMAN, F = 1 - H;
		const all = Object.values(s.cardsById).filter(Boolean);
		const plain = c => c.type === 'creature' && c.attack > 0 && c.health >= 4 && !c.activated && !c.titan && !c.magnetic && !c.disguised
			&& !c.adventure && !c.choices && !c.altCost && !c.kicker && !c.battlecry && !c.tradeable && !c.prepare && !c.forge && !E.targetSpec(s, H, c);
		const creatures = all.filter(plain);
		const p = s.players[H], f = s.players[F];
		p.board.length = 0; f.board.length = 0;
		E.summon(s, H, creatures[3]); E.summon(s, H, creatures[7]);
		const kw = c => (c.keywords || []).map(k => String(k).toLowerCase());
		E.summon(s, F, creatures.find((c, i) => i > 10 && !kw(c).some(k => /taunt|stealth|elusive/.test(k))));
		for (const c of p.board) { c.sick = false; c.attacksUsed = 0; }
		p.mana.cur = 30; p.mana.bonus = 0;
		p.hand.length = 0;
		const hc = E.instantiate(creatures[15], H); hc.zone = 'hand'; p.hand.push(hc);
		s.current = H; s.priority = null; s.stack = [];
		g.pump();
		return { mine: p.board.map(c => c.uid), foe: f.board[0].uid, handCreature: hc.uid };
	});
	await sleep(900);
	A(seed.mine.length === 2 && seed.handCreature, 'setup: two ready attackers, a foe, a creature in hand', JSON.stringify(seed));

	// ---- the board on keys ----
	await key('ArrowRight');
	let s = await pb();
	A(s.active && s.focus, 'an arrow key shows board focus (the reticle)', JSON.stringify(s));
	A(await page.evaluate(() => /\[Z\]/.test(window.__padboard.hints) && /\[V\]/.test(window.__padboard.hints) && /\[Enter\]/.test(window.__padboard.hints)), 'the hint bar names KEYS for a keyboard player', await page.evaluate(() => window.__padboard.hints));
	const zoneOf = () => page.evaluate(() => { const f = window.__padboard.focus; return window.__padboard.stops().find(x => (x.kind === 'hero' ? 'h:' + x.player : x.kind === 'btn' ? 'b:' + x.el.id : 'u:' + x.uid) === f)?.zone; });
	// E walks the zones to the hand
	for (let i = 0; i < 5 && (await zoneOf()) !== 'hand'; i++) await key('KeyE');
	A((await zoneOf()) === 'hand' && (await pb()).focus === 'u:' + seed.handCreature, 'E (next zone) reaches the hand card', JSON.stringify(await pb()));
	await key('KeyZ', 250);
	s = await pb();
	A(s.mode === 'slot' && s.slot?.uid === seed.handCreature, 'Z on a hand creature picks a board slot', JSON.stringify(s));
	await key('KeyA'); await key('ArrowLeft'); await key('ArrowLeft');
	A((await pb()).slot?.i === 0, 'A / ← move the slot (to the left edge)', JSON.stringify(await pb()));
	await key('Enter', 900);
	const placed = await page.evaluate(u => { const g = window.__game, b = g.state.players[g.HUMAN].board; return { idx: b.findIndex(c => c.uid === u), n: b.length }; }, seed.handCreature);
	A(placed.idx === 0 && placed.n === 3, 'Enter (like Z while placing) puts it in that slot', JSON.stringify(placed));

	// ---- attack: arm (Z), cancel (X), re-arm, walk to their hero, commit ----
	const attacker = seed.mine[0];
	const foeHero = await page.evaluate(() => 'h:' + (1 - window.__game.HUMAN));
	for (let i = 0; i < 8 && (await pb()).focus !== 'u:' + attacker; i++) await key(['ArrowRight', 'ArrowLeft', 'KeyD', 'KeyA'][i % 4]);
	A((await pb()).focus === 'u:' + attacker, 'the arrows / WASD reach a ready attacker on your side', JSON.stringify(await pb()));
	await key('KeyZ', 250);
	A(await page.evaluate(() => window.__game.targeting.attacker != null), 'Z arms its attack');
	await key('KeyX', 200);
	A(await page.evaluate(() => window.__game.targeting.attacker == null) && (await pb()).mode === 'browse', 'X disarms it');
	await key('KeyZ', 250);
	A(await page.evaluate(() => window.__game.targeting.attacker != null), 'Z arms it again', JSON.stringify(await pb()));
	for (let i = 0; i < 8 && (await pb()).focus !== foeHero; i++) await key(['ArrowUp', 'KeyW', 'ArrowRight', 'ArrowLeft'][i % 4]);
	A((await pb()).focus === foeHero, 'the arrows reach the enemy hero among the attack targets', JSON.stringify(await pb()));
	const hp0 = await page.evaluate(() => { const g = window.__game; return g.state.players[1 - g.HUMAN].life; });
	await key('KeyZ', 1200);
	const after = await page.evaluate(u => { const g = window.__game, c = g.state.players[g.HUMAN].board.find(x => x.uid === u); return { used: c ? c.attacksUsed : null, hp: g.state.players[1 - g.HUMAN].life }; }, attacker);
	A(after.used === 1 && after.hp < hp0, 'Z commits the attack on their hero', JSON.stringify({ hp0, ...after }));

	// ---- V reads a card, X closes it; C opens the log, X closes it ----
	for (let i = 0; i < 6 && !/^u:/.test((await pb()).focus || ''); i++) await key('KeyS');
	await key('KeyV', 300);
	A(await page.evaluate(() => !!window.__game.cardFocus), 'V opens the focused card in the focus view');
	await key('KeyX', 300);
	A(await page.evaluate(() => !window.__game.cardFocus), 'X closes the card view');
	await key('KeyC', 300);
	A(await page.evaluate(() => document.getElementById('log-full').classList.contains('open')), 'C opens the game log');
	await key('KeyX', 300);
	A(await page.evaluate(() => !document.getElementById('log-full').classList.contains('open')), 'X closes the log');

	// ---- Enter: the match menu, and its new Leave ----
	await key('ArrowRight');
	await key('Enter', 300);
	A(await page.evaluate(() => window.__padboard.menuOpen), 'Enter opens the match menu');
	const items = await page.evaluate(() => [...document.querySelectorAll('#pad-match-menu button')].map(b => b.textContent));
	A(items.some(t => /leave/i.test(t)) && items.some(t => /concede/i.test(t)), 'the menu has Leave and Concede', JSON.stringify(items));
	for (let i = 0; i < 8 && !/leave/i.test((await ring())?.text || ''); i++) await key('ArrowDown');
	A(/leave/i.test((await ring())?.text || ''), 'the arrows reach Leave', JSON.stringify(await ring()));
	await key('KeyZ', 500);
	A(await page.evaluate(() => !!document.getElementById('mpsw')), 'Leave opens the Games switcher');
	await key('KeyX', 400);
	A(await page.evaluate(() => !document.getElementById('mpsw')) && !(await page.evaluate(() => window.__padboard.menuOpen)), 'X closes the switcher, back on the board');
	// ` opens it too (the site-wide trigger still works over the match)
	await key('Backquote', 500);
	A(await page.evaluate(() => !!document.getElementById('mpsw')), '` still opens the Games switcher from the match');
	await key('Escape', 400);
	A(await page.evaluate(() => !document.getElementById('mpsw')), '...and Esc closes it');

	// ---- End Turn: a place on the board ----
	let reached = false;
	for (let i = 0; i < 5 && !reached; i++) { await key('KeyE'); reached = (await pb()).focus === 'b:end-turn'; }
	A(reached, 'E (zones) reaches End Turn', JSON.stringify(await pb()));
	const turn0 = await page.evaluate(() => window.__game.state.turnNumber);
	await key('KeyZ', 1200);
	A(await page.evaluate(t => window.__game.state.current !== window.__game.HUMAN || window.__game.state.turnNumber > t, turn0), 'Z on End Turn ends the turn');
	// wait for the AI turn to come back
	for (let i = 0; i < 60 && !(await page.evaluate(() => window.__game.state.current === window.__game.HUMAN && window.__padboard.active())); i++) await sleep(500);

	// ---- a yes/no decision modal: Tab + Space (a native click) answers it ----
	{
		const asked = await page.evaluate(() => {
			const g = window.__game, s = g.state;
			if (!Array.isArray(s.askQueue)) return false;
			s.askQueue.push({ player: g.HUMAN, prompt: 'Keyboard test: pick one', yes: 'Yes please', no: 'No thanks', effects: [] });
			g.pump();
			return true;
		});
		await page.waitForFunction(() => [...document.querySelectorAll('#walker-menu button')].some(b => /yes please/i.test(b.textContent) && b.getBoundingClientRect().width > 0), { timeout: 5000 }).catch(() => {});
		const up = await page.evaluate(() => [...document.querySelectorAll('#walker-menu button')].some(b => /yes please/i.test(b.textContent) && b.getBoundingClientRect().width > 0));
		A(asked && up, 'setup: a "you may" prompt is up');
		if (up) {
			for (let i = 0; i < 60 && !(await page.evaluate(() => (document.activeElement?.tagName === 'BUTTON' && /no thanks/i.test(document.activeElement.textContent)))); i++) await key('Tab', 40);
			A(await page.evaluate(() => (document.activeElement?.tagName === 'BUTTON' && /no thanks/i.test(document.activeElement.textContent))), 'Tab reaches the prompt buttons');
			await key('Space', 500);
			A(await page.evaluate(() => !(window.__game.state.askQueue || []).length), 'Tab + Space answers it (the pointerdown-only button gets its pointerdown)');
		}
	}

	// ---- concede through the menu ----
	await key('ArrowRight');
	await key('Enter', 300);
	for (let i = 0; i < 8 && !/concede/i.test((await ring())?.text || ''); i++) await key('ArrowDown');
	await key('KeyZ', 500);
	A(await page.evaluate(() => !!document.querySelector('#dungeon-overlay') && getComputedStyle(document.querySelector('#dungeon-overlay')).display !== 'none'), 'Menu > Concede asks first (an overlay)');
	for (let i = 0; i < 6 && !/^concede/i.test((await ring())?.text || ''); i++) await key(i < 3 ? 'ArrowUp' : 'ArrowLeft');
	A(/^concede/i.test((await ring())?.text || ''), 'the arrows reach its Concede button', JSON.stringify(await ring()));
	await key('KeyZ', 900);
	A(await page.evaluate(() => window.__game.state.over), 'Z concedes: the match is over');

	A(await page.evaluate(() => window.__realMouse) === 0, 'no real mouse / pointer / touch event was used', String(await page.evaluate(() => window.__realMouse)));
	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
