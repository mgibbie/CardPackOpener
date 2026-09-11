// attack_feedback_smoke.mjs — the 2026-09-11 "can't attack + red line from the
// wrong place" report (Middle-earth: Aragorn vs Gríma). The engine + gestures
// were PROVEN correct on the user's exact board (this file drives it); the
// live symptom matched the 2026-09-03 stale-cached-game.js incident. What
// shipped from the report, asserted here:
//   - the exact-board gestures still work (click-click AND hesitation drag)
//   - a Taunt wall blocking the hero now SAYS SO (banner) instead of silently
//     cancelling the armed attack — and the attack stays armed
//   - arming a creature with zero legal targets is refused with a banner
// (The stale-build watchdog itself is exercised implicitly: boot performs its
// first HEAD tag capture; a pageerror would fail this smoke.)
// Standalone (headless Chrome + puppeteer-core); NOT in run-all.
//   node battlecards/tests/integration/attack_feedback_smoke.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8881;
const STATE = { username: 'tgt', friendCode: 'TGT000', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = await new Promise(res => {
	const s = http.createServer((req, r2) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { r2.writeHead(200, { 'content-type': 'application/json' }); r2.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { r2.writeHead(404); r2.end('nf'); return; } r2.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', etag: '"smoke1"' }); r2.end(d); });
	});
	s.listen(PORT, () => res(s));
});
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { } await sleep(150); } return false; }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1900, height: 850 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 'tgt'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, STATE);
await page.goto(`http://localhost:${PORT}/battlecards/index.html?players=2`, { waitUntil: 'domcontentloaded' });
const booted = await waitFor(() => page.evaluate(() => !!(window.__game && window.__game.state && window.__game.state.players?.length)), 45000);
A(booted, 'game booted');
if (!booted) { console.log('errors:', errors.join(' | ')); await browser.close(); server.close(); process.exit(1); }
await sleep(2500);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /keep hand/i.test(x.textContent)); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } });
await sleep(900);

// ---- the user's board: buffed Rangers + Andúril vs a 4/5 Taunt Patrol ----
const ids = await page.evaluate(() => {
	const g = window.__game, s = g.state, E = g.E;
	const p = s.players[g.HUMAN], o = s.players[1 - g.HUMAN];
	p.board.length = 0; o.board.length = 0; p.hand.length = 0;
	E.summon(s, 1 - g.HUMAN, s.cardsById.me_gm_patrol); // 4/5 Taunt
	E.summon(s, g.HUMAN, s.cardsById.me_aragorn_ithilien);
	const mine = p.board[p.board.length - 1];
	mine.sick = false; mine.attacksUsed = 0; mine.attack += 3; // enough to survive + kill through 4/5
	mine.maxHealth += 3;
	for (const k of ['first_strike', 'taunt']) if (!mine.keywords.includes(k)) mine.keywords.push(k);
	const wp = s.cardsById.me_aragorn_anduril;
	p.weapon = { ...JSON.parse(JSON.stringify(wp)), keywords: [...(wp.keywords || [])], durability: 1, uid: 999999 };
	p.heroAttacksUsed = 1;
	s.anomaly = 'rejuvenating';
	s.current = g.HUMAN; s.priority = null; s.stack.length = 0;
	g.pump();
	return { mine: mine.uid, foe: o.board[0].uid };
});
await sleep(1200);

const diag = await page.evaluate(({ mine, foe }) => {
	const g = window.__game, s = g.state, E = g.E;
	const me = s.players[g.HUMAN].board.find(c => c.uid === mine);
	return { canAttack: E.canAttackWith(s, g.HUMAN, me), targets: E.attackTargets(s, g.HUMAN, me), minePos: g.screenPosOf(mine), foePos: g.screenPosOf(foe) };
}, ids);
A(diag.canAttack, 'engine: the creature can attack');
A(diag.targets.some(t => t.uid === ids.foe), 'engine: the Taunt patrol is a legal target');
A(!diag.targets.some(t => t.type === 'hero'), 'engine: the hero is NOT legal (taunt wall)');

// ---- armed click on the ENEMY HERO panel: banner explains the Taunt, attack stays armed ----
await page.mouse.click(diag.minePos.x, diag.minePos.y);
await sleep(350);
A(/attack target/i.test(await page.evaluate(() => document.getElementById('hint')?.textContent) || ''), 'clicking the creature arms the attack');
const panelBox = await page.evaluate(() => { const els = [...document.querySelectorAll('div')].filter(e => e.classList.contains('targetable') || /foe/i.test(e.className)); const el = els[0]; if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; });
if (panelBox) {
	await page.evaluate(() => { const b = document.getElementById('banner'); if (b) b.textContent = ''; });
	await page.mouse.click(panelBox.x, panelBox.y);
	await sleep(400);
	const heroMiss = await page.evaluate(({ mine }) => {
		const g = window.__game, s = g.state;
		const me = s.players[g.HUMAN].board.find(c => c.uid === mine);
		return { banner: document.getElementById('banner')?.textContent, attacksUsed: me.attacksUsed, hint: document.getElementById('hint')?.textContent };
	}, ids);
	A(/taunt/i.test(heroMiss.banner || ''), 'hero click behind a Taunt wall explains itself', JSON.stringify(heroMiss));
	A(heroMiss.attacksUsed === 0, 'the blocked hero click spends nothing');
	A(/attack target/i.test(heroMiss.hint || ''), 'the attack stays armed after the explained miss', heroMiss.hint);
} else { console.log('note: no foe panel element found — skipping hero-miss assertions'); }

// ---- click-click onto the Taunt patrol resolves the attack ----
await page.mouse.click(diag.foePos.x, diag.foePos.y);
await sleep(600);
const after1 = await page.evaluate(({ mine, foe }) => {
	const g = window.__game, s = g.state;
	const me = s.players[g.HUMAN].board.find(c => c.uid === mine);
	const f = s.players[1 - g.HUMAN].board.find(c => c.uid === foe);
	return { attacksUsed: me ? me.attacksUsed : 'died', foeDamage: f ? f.damage : 'died' };
}, ids);
A(after1.attacksUsed === 1 && (after1.foeDamage === 'died' || after1.foeDamage > 0), 'click-click: the attack resolved', JSON.stringify(after1));

// ---- hesitation drag still commits (the #244 class) ----
await page.evaluate(({ mine, foe }) => {
	const g = window.__game, s = g.state, E = g.E;
	s.players[1 - g.HUMAN].board.length = 0;
	E.summon(s, 1 - g.HUMAN, s.cardsById.me_gm_patrol);
	const me = s.players[g.HUMAN].board.find(c => c.uid === mine);
	me.attacksUsed = 0; me.damage = 0;
	g.pump();
}, ids);
await sleep(900);
const pos2 = await page.evaluate(({ mine }) => { const g = window.__game, s = g.state; const foe = s.players[1 - g.HUMAN].board[0]; return { mine: g.screenPosOf(mine), foe: g.screenPosOf(foe.uid) }; }, ids);
await page.mouse.move(pos2.mine.x, pos2.mine.y);
await page.mouse.down();
await sleep(300);
await page.mouse.move(pos2.foe.x, pos2.foe.y, { steps: 12 });
await sleep(120);
await page.mouse.up();
await sleep(600);
const after2 = await page.evaluate(({ mine }) => { const g = window.__game, s = g.state; const me = s.players[g.HUMAN].board.find(c => c.uid === mine); return me ? me.attacksUsed : 'died'; }, ids);
A(after2 === 1 || after2 === 'died', 'hesitation drag: the attack resolved', JSON.stringify(after2));

// ---- zero-target arming is refused with a banner (sick Rush creature, empty enemy board) ----
const zt = await page.evaluate(() => {
	const g = window.__game, s = g.state, E = g.E;
	s.players[1 - g.HUMAN].board.length = 0;
	const p = s.players[g.HUMAN];
	p.board.length = 0;
	E.summon(s, g.HUMAN, s.cardsById.me_aragorn_ithilien);
	const c = p.board[0];
	c.sick = true; c.attacksUsed = 0;
	if (!c.keywords.includes('rush')) c.keywords.push('rush'); // sick+Rush: creatures only, and there are none
	s.current = g.HUMAN;
	const b = document.getElementById('banner'); if (b) b.textContent = '';
	g.pump();
	return { uid: c.uid, canAttack: E.canAttackWith(s, g.HUMAN, c), targets: E.attackTargets(s, g.HUMAN, c).length };
});
A(zt.canAttack && zt.targets === 0, 'setup: attack-capable creature with zero legal targets', JSON.stringify(zt));
await sleep(900);
const ztPos = await page.evaluate(({ uid }) => window.__game.screenPosOf(uid), zt);
await page.mouse.click(ztPos.x, ztPos.y);
await sleep(400);
const ztAfter = await page.evaluate(() => ({ banner: document.getElementById('banner')?.textContent, hint: document.getElementById('hint')?.textContent }));
A(/no legal attack targets/i.test(ztAfter.banner || ''), 'zero-target arming is refused with an explanation', JSON.stringify(ztAfter));
A(!/attack target/i.test(ztAfter.hint || ''), 'and nothing is left armed');

// ---- the "not enough mana" lie: Arrest at exactly 3 mana vs a lone Elusive
// Crebain (2026-09-11 report) — the refusal is target legality, not mana ----
{
	const az = await page.evaluate(() => {
		const g = window.__game, s = g.state, E = g.E;
		const p = s.players[g.HUMAN], o = s.players[1 - g.HUMAN];
		p.board.length = 0; o.board.length = 0; p.hand.length = 0;
		E.summon(s, 1 - g.HUMAN, s.cardsById.me_mo_crebain); // 2/1 Elusive — untargetable by spells
		const arrest = E.instantiate(s.cardsById.arrest, g.HUMAN);
		arrest.zone = 'hand';
		p.hand.push(arrest);
		p.mana = { cur: 3, max: 9, bonus: 0 }; // exactly the printed cost
		s.current = g.HUMAN; s.priority = null; s.stack.length = 0;
		g.pump();
		return { arrest: arrest.uid, canPlay: E.canPlay(s, g.HUMAN, arrest), mana: p.mana.cur, cost: E.effectiveCost(s, g.HUMAN, arrest) };
	});
	console.log('arrest scenario:', JSON.stringify(az));
	A(!az.canPlay && az.mana >= az.cost, 'setup: Arrest is refused with mana to spare (target legality)', JSON.stringify(az));
	await sleep(1100);
	// earlier field clicks tucked the hand behind the hero panel — reach down to
	// pop it back up (like a player would) before grabbing the card
	await page.mouse.move(950, 840); await sleep(700);
	const hp2 = await page.evaluate(u => window.__game.screenPosOf(u), az.arrest);
	await page.mouse.move(hp2.x, hp2.y); await sleep(80);
	await page.mouse.down(); await sleep(100);
	for (let i = 1; i <= 8; i++) { await page.mouse.move(hp2.x, hp2.y - 32 * i); await sleep(40); } // deliberate drag up onto the field
	await sleep(400);
	const dragHint = await page.evaluate(() => document.getElementById('hint')?.textContent);
	console.log('mid-drag probe:', JSON.stringify(await page.evaluate(() => ({ cursor: document.querySelector('canvas')?.style.cursor, banner: document.getElementById('banner')?.textContent, armed: window.__game.targeting && window.__game.targeting.attacker, pending: window.__game.targeting && window.__game.targeting.pending }))));
	await page.mouse.move(hp2.x, hp2.y, { steps: 4 }); await page.mouse.up(); // back to hand: cancel
	await sleep(300);
	console.log('drag hint:', JSON.stringify(dragHint));
	A(/no legal target/i.test(dragHint || ''), 'the hint names the real reason (no legal target)', dragHint);
	A(!/not enough mana/i.test(dragHint || ''), 'and no longer lies about mana');
	A(/elusive|stealth/i.test(dragHint || ''), 'it points at the untargetable enemy board', dragHint);
}

// ---- enemy attacks TELEGRAPH: the red line shows attacker → target for a
// beat before the lunge, so the opponent's turn (and replays) can be followed ----
{
	const tg = await page.evaluate(() => {
		const g = window.__game, s = g.state, E = g.E;
		const p = s.players[g.HUMAN], o = s.players[1 - g.HUMAN];
		p.board.length = 0; o.board.length = 0; p.hand.length = 0; o.hand.length = 0;
		E.summon(s, g.HUMAN, s.cardsById.me_gm_patrol);           // a juicy 4/5 target on OUR side
		E.summon(s, 1 - g.HUMAN, s.cardsById.me_aragorn_dunedain); // their ready attacker
		const atk = o.board[0];
		atk.sick = false; atk.attacksUsed = 0;
		o.mana = { cur: 0, max: 3, bonus: 0 }; // no plays — attacking is the AI's only move
		s.current = 1 - g.HUMAN; s.priority = null; s.stack.length = 0;
		g.pump();
		return { mine: p.board[0].uid, theirs: atk.uid };
	});
	let sawTelegraph = null;
	for (let i = 0; i < 40 && !sawTelegraph; i++) {
		sawTelegraph = await page.evaluate(() => { const t = window.__game.telegraphs; return t.length ? t[0] : null; });
		if (!sawTelegraph) await sleep(150);
	}
	A(!!sawTelegraph, 'an enemy attack raises a telegraph arrow', JSON.stringify(sawTelegraph));
	if (sawTelegraph) A(sawTelegraph.from.uid === tg.theirs, 'the telegraph starts at the enemy attacker', JSON.stringify(sawTelegraph));
	const landed = await waitFor(() => page.evaluate(({ mine }) => {
		const g = window.__game, s = g.state;
		const c = s.players[g.HUMAN].board.find(x => x.uid === mine);
		return (!c || c.damage > 0) ? true : false;
	}, tg), 15000);
	A(landed, 'and the attack still resolves after the telegraph beat');
	await page.evaluate(() => { const g = window.__game, s = g.state; s.current = g.HUMAN; g.pump(); }); // hand the turn back for any later sections
	await sleep(400);
}

// ---- targeted enemy SPELLS telegraph too (all-targeting coverage) ----
{
	const sp = await page.evaluate(() => {
		const g = window.__game, s = g.state, E = g.E;
		const p = s.players[g.HUMAN], o = s.players[1 - g.HUMAN];
		p.board.length = 0; o.board.length = 0; p.hand.length = 0; o.hand.length = 0;
		E.summon(s, g.HUMAN, s.cardsById.me_gm_patrol); // our creature — their spell's victim
		const mine = p.board[0];
		const bolt = E.instantiate(s.cardsById.me_gm_bitter, 1 - g.HUMAN); // "Destroy an enemy creature"
		bolt.zone = 'hand'; bolt.cost = 0;
		o.hand.push(bolt);
		o.mana = { cur: 5, max: 5, bonus: 0 };
		s.current = 1 - g.HUMAN; s.priority = null; s.stack.length = 0;
		const ok2 = E.playCard(s, 1 - g.HUMAN, bolt.uid, { type: 'creature', uid: mine.uid, player: g.HUMAN }, null);
		g.pump();
		return { played: ok2 !== false, mine: mine.uid, bolt: bolt.uid };
	});
	let spellTele = null;
	for (let i = 0; i < 40 && !spellTele; i++) {
		spellTele = await page.evaluate(({ mine }) => (window.__game.telegraphs || []).find(t => t.to.uid === mine) || null, sp);
		if (!spellTele) await sleep(150);
	}
	A(!!spellTele, 'a targeted enemy spell raises a telegraph', JSON.stringify({ sp, spellTele }));
	if (spellTele) {
		A(spellTele.to.uid === sp.mine, "…aimed at the spell's victim", JSON.stringify(spellTele));
		A(spellTele.friendly === false, '…and hostile spells stay red');
	}
	await page.evaluate(() => { const g = window.__game, s = g.state; s.current = g.HUMAN; g.pump(); });
	await sleep(400);
}

console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
A(errors.length === 0, 'no page errors');
await page.close();

// ================= the arrow on a devicePixelRatio 1.5 display =================
// The 2026-09-11 root cause: the arrow overlay canvas is a REPLACED element, so
// `inset:0` never stretched it — it displayed at its intrinsic backing size
// (innerWidth × DPR), painting the whole arrow at DPR× its intended position on
// 125%/150% Windows display scaling. Every earlier harness sampled BACKING
// pixels (self-consistent), so only a DISPLAYED-geometry assertion catches it.
{
	const page2 = await browser.newPage();
	await page2.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 });
	const errs2 = [];
	page2.on('pageerror', e => errs2.push(e.message));
	await page2.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 'tgt'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, STATE);
	await page2.goto(`http://localhost:${PORT}/battlecards/index.html?players=2`, { waitUntil: 'domcontentloaded' });
	const b2 = await waitFor(() => page2.evaluate(() => !!(window.__game && window.__game.state && window.__game.state.players?.length)), 45000);
	A(b2, '[dpr1.5] booted');
	if (b2) {
		await sleep(2500);
		await page2.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /keep hand/i.test(x.textContent)); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } });
		await sleep(900);
		const ids2 = await page2.evaluate(() => {
			const g = window.__game, s = g.state, E = g.E;
			const p = s.players[g.HUMAN];
			p.board.length = 0;
			E.summon(s, g.HUMAN, s.cardsById.me_aragorn_ithilien);
			E.summon(s, 1 - g.HUMAN, s.cardsById.me_gm_patrol);
			const mine = p.board[0];
			mine.sick = false; mine.attacksUsed = 0;
			s.current = g.HUMAN; s.priority = null; s.stack.length = 0;
			g.pump();
			return { mine: mine.uid };
		});
		await sleep(1200);
		const pos = await page2.evaluate(u => window.__game.screenPosOf(u), ids2.mine);
		await page2.mouse.click(pos.x, pos.y);
		await sleep(300);
		await page2.mouse.move(pos.x + 260, pos.y - 200); // pull the arrow out
		await sleep(400);
		const geo = await page2.evaluate((uid) => {
			const expected = window.__game.screenPosOf(uid); // fresh — the token may drift a few px while settling
			const cv = [...document.body.children].find(el => el.tagName === 'CANVAS' && el.style.zIndex === '45');
			if (!cv) return { canvas: false };
			const r = cv.getBoundingClientRect();
			// backing-space tail: the solid red socket disc at the source
			const ctx = cv.getContext('2d');
			const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
			const dpr = cv.width / innerWidth;
			let best = null, bestD = 1e9;
			for (let y = 0; y < cv.height; y += 2) for (let x = 0; x < cv.width; x += 2) {
				const i = (y * cv.width + x) * 4;
				if (img[i] > 170 && img[i + 1] < 95 && img[i + 2] < 80 && img[i + 3] > 150) {
					const d = Math.hypot(x / dpr - expected.x, y / dpr - expected.y);
					if (d < bestD) { bestD = d; best = { x: x / dpr, y: y / dpr }; }
				}
			}
			return { canvas: true, rectW: r.width, rectH: r.height, vw: innerWidth, vh: innerHeight, backingW: cv.width, dpr, nearestRedToTail: bestD, tailPx: best, expected };
		}, ids2.mine);
		console.log('[dpr1.5] arrow geometry:', JSON.stringify(geo));
		A(geo.canvas, '[dpr1.5] arrow canvas found');
		A(Math.abs(geo.rectW - geo.vw) <= 1 && Math.abs(geo.rectH - geo.vh) <= 1,
			'[dpr1.5] the overlay DISPLAYS at viewport size (the replaced-element inset:0 trap)', JSON.stringify(geo));
		A(geo.nearestRedToTail <= 30, '[dpr1.5] the arrow tail sits ON the attacking creature', geo.nearestRedToTail);
		A(errs2.length === 0, '[dpr1.5] no page errors', errs2.join(' | '));
	}
	await page2.close();
}

console.log(`${pass} passed, ${fail} failed`);
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
