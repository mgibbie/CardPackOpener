// boardhand_test.mjs — Bryan's Battlecards report (2026-09-28), at the laptop size
// he played on (1366x768):
//   1. "Not able to click on this planeswalker bc my hand comes up to meet me
//      when I get close": planeswalkers sat dead-centre BEHIND your hero panel,
//      and pointing at anything low on the screen popped the tucked hand up over
//      them. They now flank the panel, and the hand rises only for the hand.
//   2. "There was a button that said planeswalker... it just rolled the planar
//      die and the button went away": the Planechase roll was a floating DOM
//      button. It is now an orb on the hero panel (owner: "treat it like another
//      hero power that attaches to the hero", but NOT a hero power slot): it
//      stays put, shows the next roll's cost, explains itself, and says what
//      each roll did.
//   3. "Can't see my creatures' health/attack... even when I'm hovering": the
//      hovered hand card's stat corners were below the screen, and the tooltip
//      had no stats. It now lifts fully on screen, and the tooltip names them.
//
//   node overworld/tests/boardhand_test.mjs
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
const PORT = 9154;
const STATE = { username: 'bryan', friendCode: 'BRYAN0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
	await page.setViewport({ width: 1366, height: 768 });   // Bryan's laptop
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 'bryan'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, STATE);
	await page.goto(`http://localhost:${PORT}/battlecards/index.html?players=2`, { waitUntil: 'domcontentloaded' });
	const t0 = Date.now();
	while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__game && window.__game.state && window.__game.targeting)).catch(() => false))) await sleep(200);
	await sleep(2500);
	await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /keep hand/i.test(x.textContent)); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } });
	await sleep(1200);

	// ===== 3. a hovered hand creature: fully on screen, and the tooltip names its stats =====
	const creature = await page.evaluate(() => {
		const g = window.__game, s = g.state, E = g.E, H = g.HUMAN, p = s.players[H];
		s.current = H; s.priority = null; s.stack = [];
		const def = Object.values(s.cardsById).find(c => c && c.type === 'creature' && c.attack > 0 && c.health > 0 && c.collectible !== false);
		const c = E.instantiate(def, H); c.zone = 'hand'; p.hand.push(c);
		g.pump();
		return { uid: c.uid, attack: c.attack, health: c.health ?? c.maxHealth };
	});
	await sleep(900);
	const at = await page.evaluate(u => window.__game.screenPosOf(u), creature.uid);
	await page.mouse.move(at.x, at.y); await sleep(250); await page.mouse.move(at.x + 1, at.y - 1);
	await sleep(1000);
	const hov = await page.evaluate(u => ({ hover: window.__game.hoverUid, bottom: window.__game.cardBottomY(u), tip: document.getElementById('tooltip').textContent, h: innerHeight }), creature.uid);
	A(hov.hover === creature.uid, 'setup: the hand creature is hovered', JSON.stringify({ hover: hov.hover }));
	A(hov.bottom != null && hov.bottom <= hov.h - 10, 'the hovered card lifts until its bottom edge (attack / health) is on screen', `bottom ${Math.round(hov.bottom)} of ${hov.h}`);
	A(new RegExp(`${creature.attack} Attack`).test(hov.tip) && new RegExp(`${creature.health}.*Health`).test(hov.tip), 'the tooltip names its attack and health', hov.tip.slice(0, 140));
	// the lift moved it off the cursor: it must stay hovered (no flicker), not drop back
	await page.mouse.move(at.x + 2, at.y + 1); await sleep(400);
	A(await page.evaluate(() => window.__game.hoverUid) === creature.uid, 'it stays hovered while the pointer stays in its column below it');
	// and pressing right there (the card has lifted above the cursor) still grabs it:
	// drag it up onto the field and it plays
	await page.evaluate(() => { const g = window.__game, p = g.state.players[g.HUMAN]; p.mana.cur = 20; g.pump(); });
	await sleep(300);
	const cur = { x: at.x + 2, y: at.y + 1 };
	await page.mouse.move(cur.x, cur.y); await sleep(80);
	await page.mouse.down();
	for (let i = 1; i <= 8; i++) { await page.mouse.move(cur.x, cur.y - i * 40, { steps: 2 }); await sleep(30); }
	await page.mouse.up();
	await sleep(1200);
	const played = await page.evaluate(u => { const g = window.__game, p = g.state.players[g.HUMAN]; return { inHand: p.hand.some(c => c.uid === u), onBoard: p.board.some(c => c.uid === u) }; }, creature.uid);
	A(!played.inHand && played.onBoard, 'pressing under the lifted card and dragging up plays it (the press grabs the hovered card)', JSON.stringify(played));

	// ===== 1. a planeswalker low on the screen: the tucked hand stays down for it =====
	const pw = await page.evaluate(() => {
		const g = window.__game, s = g.state, E = g.E, H = g.HUMAN, p = s.players[H];
		const def = Object.values(s.cardsById).find(c => c && c.type === 'planeswalker');
		if (!def) return null;
		const c = E.instantiate(def, H); c.zone = 'planeswalker'; p.planeswalkers.push(c);
		g.pump();
		return { uid: c.uid, name: c.name };
	});
	await sleep(900);
	// tuck the hand the way a player does: press on the empty field
	await page.mouse.move(683, 330); await sleep(150);
	await page.mouse.down(); await page.mouse.up(); await sleep(500);
	A(await page.evaluate(() => window.__game.handMini === true), 'setup: pressing the field tucks the hand down');
	const pwAt = await page.evaluate(u => window.__game.screenPosOf(u), pw && pw.uid);
	if (pwAt) {
		await page.mouse.move(pwAt.x, pwAt.y - 30, { steps: 4 }); await page.mouse.move(pwAt.x, pwAt.y, { steps: 4 });
		await sleep(600);
		const s1 = await page.evaluate(() => ({ mini: window.__game.handMini, hover: window.__game.hoverUid }));
		A(s1.hover === pw.uid, `the planeswalker is out from behind the hero panel: pointing at ${pw.name} reaches it`, JSON.stringify(s1));
		A(s1.mini === true, 'reaching for the planeswalker does NOT pop the hand up over it', JSON.stringify(s1));
	} else A(false, 'setup: the planeswalker has a screen position');
	// ...but reaching into the empty bottom strip still raises the hand
	await page.mouse.move(30, 760, { steps: 4 }); await sleep(500);
	A(await page.evaluate(() => window.__game.handMini === false), 'reaching for the hand itself still raises it');

	// ===== 2. the planar die: an orb on the hero panel, not a floating button =====
	const btnShown = () => page.evaluate(() => getComputedStyle(document.getElementById('planeswalk-btn')).display !== 'none');
	const die0 = await page.evaluate(() => window.__game.dieScreenPos());
	A(die0 && !(await btnShown()), 'with a planeswalker out, the die is an orb on the hero panel — the old button stays hidden', JSON.stringify(die0));
	const rolls = () => page.evaluate(() => window.__game.state.players[window.__game.HUMAN].planarRollsThisTurn || 0);
	const setMana = n => page.evaluate(n => { const g = window.__game, p = g.state.players[g.HUMAN]; p.mana.cur = n; p.mana.bonus = 0; g.pump(); }, n);
	await setMana(0); await sleep(400);
	// hovering it explains it
	const dp = await page.evaluate(() => window.__game.dieScreenPos());
	await page.mouse.move(683, 330, { steps: 3 }); await sleep(400);   // from open ground, not from a lifted hand card
	await page.mouse.move(dp.x, dp.y, { steps: 3 }); await sleep(80);
	await page.mouse.move(dp.x + 1, dp.y);   // a settling move: hover picks are throttled to one per 25ms
	await sleep(500);
	const dtip = await page.evaluate(() => document.getElementById('tooltip').textContent);
	A(/Planar Die/.test(dtip) && /6/.test(dtip) && /hero power slot/.test(dtip), 'hovering the die explains it (5 = Chaos, 6 = new plane, not a hero power slot)', dtip.slice(0, 120));
	// click: the free roll rolls, and says what happened
	const r0 = await rolls();
	await page.mouse.down(); await page.mouse.up(); await sleep(700);
	const b1 = await page.evaluate(() => document.getElementById('banner')?.textContent || '');
	A(await rolls() === r0 + 1 && /Planar die: \d/.test(b1) && /next roll 1 mana/.test(b1), 'clicking the orb rolls, and the banner says what the roll did and what the next costs', b1);
	// the next roll costs 1, and there is no mana: the orb STAYS (dimmed) and explains
	await sleep(2400);
	A((await page.evaluate(() => window.__game.dieScreenPos())) != null, "the orb stays on the panel when you can't afford the next roll (the button used to vanish)");
	await page.mouse.move(dp.x + 1, dp.y, { steps: 2 }); await page.mouse.down(); await page.mouse.up(); await sleep(500);
	const b2 = await page.evaluate(() => document.getElementById('banner')?.textContent || '');
	A(await rolls() === r0 + 1 && /costs 1 mana/.test(b2), '...and clicking it then says the next roll costs 1 mana, instead of nothing', b2);
	// it is not one of the hero power slots
	A(await page.evaluate(() => { const g = window.__game, p = g.state.players[g.HUMAN]; return !p.heroPowers.some(h => /planar|die|planeswalk/i.test(h.power?.name || h.name || '')); }), 'the die takes no hero power slot');
	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
