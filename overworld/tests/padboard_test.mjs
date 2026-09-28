// padboard_test.mjs — playing a Battlecards match on a controller
// (battlecards/padboard.js, Plans/CONTROLLER_SUPPORT_PLAN.md, Phase 4).
//
// Fake pads ride in window.__owFakePads through the real site/gamepad.js poller
// (headless Chrome has no controllers). A seeded board, then: play a creature
// into a chosen slot, cast a targeted spell, arm/cancel/commit an attack on the
// hero, inspect, the Start hold that ends the turn (a tap doesn't), and the
// hand-off to padnav while a modal is up.
//
//   node overworld/tests/padboard_test.mjs
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
const PORT = 9144;
const STATE = { username: 'padboard', friendCode: 'PADBD0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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

// Standard mapping by position; Nintendo layout = RIGHT face confirms, BOTTOM cancels.
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
		localStorage.setItem('magepunk_mp_token_v1', 'padboard-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
	}, STATE);
	await page.goto(`http://localhost:${PORT}/battlecards/index.html?players=2`, { waitUntil: 'domcontentloaded' });
	const t0 = Date.now();
	while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__game && window.__game.state && window.__game.targeting)).catch(() => false))) await sleep(200);
	await sleep(2500);
	const tap = async (b, ms = 70) => { await page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, b); await sleep(ms); await page.evaluate(b => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, b); await sleep(140); };
	const pb = () => page.evaluate(() => ({ mode: window.__padboard?.mode, focus: window.__padboard?.focus, slot: window.__padboard?.slot, active: window.__padboard?.active() }));

	A(await page.evaluate(() => !!window.__padboard), 'signed in: the board controller runs on the match page');
	// the mulligan is a DOM modal: the board stands aside for padnav
	A(await page.evaluate(() => window.__padboard.active() === false), 'while the mulligan is up the board stands aside (padnav owns modals)');
	await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /keep hand/i.test(x.textContent)); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } });
	await sleep(900);

	// ---- seed: my turn, plenty of mana, two ready attackers, one foe, and a hand of a
	// plain creature + a damage spell that needs a target ----
	const seed = await page.evaluate(() => {
		const g = window.__game, s = g.state, E = g.E, H = g.HUMAN, F = 1 - H;
		const all = Object.values(s.cardsById).filter(Boolean);
		const plain = c => c.type === 'creature' && c.attack > 0 && c.health >= 4 && !c.activated && !c.titan && !c.magnetic && !c.disguised
			&& !c.adventure && !c.choices && !c.altCost && !c.kicker && !c.battlecry && !c.tradeable && !c.prepare && !c.forge && !E.targetSpec(s, H, c);
		const creatures = all.filter(plain);
		const p = s.players[H], f = s.players[F];
		p.board.length = 0; f.board.length = 0;
		E.summon(s, H, creatures[3]); E.summon(s, H, creatures[7]);
		// the foe: no Taunt/Stealth, so their HERO stays a legal attack target
		const kw = c => (c.keywords || []).map(k => String(k).toLowerCase());
		E.summon(s, F, creatures.find((c, i) => i > 10 && !kw(c).some(k => /taunt|stealth|elusive/.test(k))));
		for (const c of p.board) { c.sick = false; c.attacksUsed = 0; }
		p.mana.cur = 30; p.mana.bonus = 0;
		p.hand.length = 0;
		const hc = E.instantiate(creatures[15], H); hc.zone = 'hand'; p.hand.push(hc);
		// a spell that needs a target the foe's creature satisfies
		s.current = H; s.priority = null; s.stack = [];
		const spell = all.find(c => c.name === 'Fireball') || all.find(c => (c.type === 'instant' || c.type === 'sorcery') && !c.choices && !c.altCost && !c.kicker && !c.fight && (() => {
			const sp = E.targetSpec(s, H, c); if (!sp) return false;
			return E.legalTargets(s, H, sp).some(t => t.uid === f.board[0].uid);
		})());
		let sc = null;
		if (spell) { sc = E.instantiate(spell, H); sc.zone = 'hand'; p.hand.push(sc); }
		g.pump();
		return { mine: p.board.map(c => c.uid), foe: f.board[0].uid, handCreature: hc.uid, spell: sc && sc.uid, spellName: spell && spell.name };
	});
	await sleep(900);
	A(seed.mine.length === 2 && seed.handCreature, 'setup: two ready attackers, a foe, a creature in hand', JSON.stringify(seed));

	// ---- first press only shows focus; LB/RB jump zones ----
	await tap(BTN.rightD);
	let s = await pb();
	A(s.active && s.focus, 'the first press shows board focus (a reticle, no action)', JSON.stringify(s));
	A(await page.evaluate(() => getComputedStyle(document.getElementById('padboard-reticle')).display === 'block'), '...drawn as a reticle over the focused card');
	const zoneOf = () => page.evaluate(() => { const f = window.__padboard.focus; return window.__padboard.stops().find(x => (x.kind === 'hero' ? 'h:' + x.player : 'u:' + x.uid) === f)?.zone; });
	const zones = [];
	for (let i = 0; i < 3; i++) { await tap(BTN.rb); zones.push(await zoneOf()); }
	A(new Set(zones).size === 3, 'RB walks the zones: hand, your side, the enemy side', zones.join(' -> '));

	// ---- play a creature into a chosen board slot ----
	await page.evaluate(u => window.__padboard.focusUid(u), seed.handCreature);
	await tap(BTN.right);
	s = await pb();
	A(s.mode === 'slot' && s.slot?.uid === seed.handCreature, 'confirm on a hand creature enters slot pick', JSON.stringify(s));
	await tap(BTN.leftD); await tap(BTN.leftD); await tap(BTN.leftD);        // all the way left: slot 0
	A((await pb()).slot?.i === 0, 'left/right choose the slot (clamped at the edge)', JSON.stringify(await pb()));
	await tap(BTN.right);
	await sleep(900);
	const placed = await page.evaluate(u => { const g = window.__game, b = g.state.players[g.HUMAN].board; return { idx: b.findIndex(c => c.uid === u), n: b.length }; }, seed.handCreature);
	A(placed.idx === 0 && placed.n === 3, 'confirm places it in that slot (leftmost)', JSON.stringify(placed));

	// ---- cast a targeted spell ----
	if (seed.spell) {
		await page.evaluate(u => window.__padboard.focusUid(u), seed.spell);
		await tap(BTN.right);
		await sleep(250);
		s = await pb();
		A(s.mode === 'target', `confirm on ${seed.spellName} starts targeting`, JSON.stringify(s));
		const ts = await page.evaluate(() => window.__padboard.targetStops().map(t => t.kind === 'hero' ? 'h:' + t.player : 'u:' + t.uid));
		A(ts.includes(s.focus), 'focus sits on a LEGAL target (the arrow follows it)', JSON.stringify({ focus: s.focus, ts }));
		// walk focus to the foe's creature
		for (let i = 0; i < 8 && (await pb()).focus !== 'u:' + seed.foe; i++) await tap([BTN.rightD, BTN.leftD, BTN.up, BTN.down][i % 4]);
		A((await pb()).focus === 'u:' + seed.foe, 'the d-pad moves between legal targets only', JSON.stringify(await pb()));
		const inHand = () => page.evaluate(u => { const g = window.__game; return g.state.players[g.HUMAN].hand.some(c => c.uid === u); }, seed.spell);
		await tap(BTN.right);
		await sleep(900);
		A(!(await inHand()) && (await pb()).mode === 'browse', 'confirm casts it on the target and targeting ends');
	} else A(true, '(no suitable targeted spell in this card pool; skipped)');

	// ---- attack: arm, cancel, re-arm, commit on the enemy hero ----
	const attacker = seed.mine[0];
	const foeHero = await page.evaluate(() => 'h:' + (1 - window.__game.HUMAN));
	await page.evaluate(u => window.__padboard.focusUid(u), attacker);
	await tap(BTN.right);
	await sleep(200);
	A(await page.evaluate(() => window.__game.targeting.attacker != null), 'confirm on a ready creature arms its attack');
	await tap(BTN.bottom);
	A(await page.evaluate(() => window.__game.targeting.attacker == null) && (await pb()).mode === 'browse', 'cancel (bottom) disarms it');
	await page.evaluate(u => window.__padboard.focusUid(u), attacker);
	await tap(BTN.right);
	await sleep(200);
	for (let i = 0; i < 8 && (await pb()).focus !== foeHero; i++) await tap([BTN.up, BTN.rightD, BTN.leftD, BTN.down][i % 4]);
	A((await pb()).focus === foeHero, 'focus reaches the enemy hero among the attack targets', JSON.stringify(await pb()));
	const hp0 = await page.evaluate(() => { const g = window.__game; return g.state.players[1 - g.HUMAN].life; });
	await tap(BTN.right);
	await sleep(1200);
	const after = await page.evaluate(u => { const g = window.__game, c = g.state.players[g.HUMAN].board.find(x => x.uid === u); return { used: c ? c.attacksUsed : null, hp: g.state.players[1 - g.HUMAN].life }; }, attacker);
	A(after.used === 1 && after.hp < hp0, 'confirm commits the attack on their hero', JSON.stringify({ hp0, ...after }));

	// ---- inspect ----
	await page.evaluate(u => window.__padboard.focusUid(u), seed.mine[1]);
	await tap(BTN.left);
	await sleep(200);
	A(await page.evaluate(() => { const i = document.getElementById('inspect'); return !!i && getComputedStyle(i).display !== 'none'; }), 'the left face button inspects the focused card');
	await tap(BTN.bottom);

	// ---- end turn: a tap does nothing, a 0.6s hold ends it ----
	const turn0 = await page.evaluate(() => window.__game.state.current === window.__game.HUMAN);
	await tap(BTN.start, 120);
	await sleep(300);
	A(turn0 && await page.evaluate(() => window.__game.state.current === window.__game.HUMAN), 'a quick tap of Start does NOT end the turn');
	await page.evaluate(() => { window.__pad.buttons[9] = { pressed: true, value: 1 }; });
	await sleep(350);
	A(await page.evaluate(() => getComputedStyle(document.getElementById('padboard-endturn')).display === 'block'), 'holding Start fills the end-turn bar');
	await sleep(500);
	await page.evaluate(() => { window.__pad.buttons[9] = { pressed: false, value: 0 }; });
	await sleep(700);
	A(await page.evaluate(() => window.__game.state.current !== window.__game.HUMAN || window.__game.state.turnNumber > 1), 'holding Start for 0.6s ends the turn');

	// ---- unplug / reconnect: the reticle and hints hide, then come back on a press ----
	{
		const shown = () => page.evaluate(() => ({ ret: getComputedStyle(document.getElementById('padboard-reticle')).display, hints: getComputedStyle(document.getElementById('padboard-hints')).display }));
		await tap(BTN.rightD);
		await sleep(150);
		const up = await shown();
		A(up.ret === 'block', 'setup: the reticle is showing', JSON.stringify(up));
		await page.evaluate(() => { window.__owFakePads.length = 0; });
		await sleep(250);
		const gone = await shown();
		A(gone.ret === 'none' && gone.hints === 'none', 'unplugging the controller hides the reticle and the hint bar', JSON.stringify(gone));
		await page.evaluate(() => { window.__owFakePads.push(window.__pad); });
		await sleep(150);
		await tap(BTN.rightD);
		await sleep(150);
		A((await shown()).ret === 'block', 'plugging it back in and pressing shows them again', JSON.stringify(await shown()));
	}

	// ---- the mouse takes over ----
	await page.mouse.move(300, 300); await page.mouse.move(340, 320);
	A(await page.evaluate(() => getComputedStyle(document.getElementById('padboard-reticle')).display === 'none'), 'moving the mouse hides the reticle');
	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
