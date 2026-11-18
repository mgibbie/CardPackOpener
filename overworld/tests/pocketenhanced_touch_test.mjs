// Pocket Enhanced by touch, on a phone-sized screen: everything a turn can be played with by dragging a finger.
// (The page suite drags with a mouse. A finger differs: the browser may take a touch for a scroll and cancel the drag,
// which is what happened to a card dragged out of the hand at a slant: found 2026-11-17 by running this by hand.)
//   1. the Energy from the Energy Zone onto a Pokémon
//   2. a Basic Pokémon from the hand onto a Bench slot, at a slant (the drag the browser used to cancel)
//   3. an Item from the hand onto the Pokémon it is for
//   4. an Active Pokémon onto an opposing Pokémon: its attack is queued
//   5. a Benched Pokémon onto the Active one: a retreat
//   6. a sideways swipe along the hand scrolls it and plays nothing; a tap still opens a card
//   node overworld/tests/pocketenhanced_touch_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 8677;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 180000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
	for (const singles of [false, true]) {
		const tag = singles ? 'singles' : 'doubles';
		// (a new page for each: a finished touch gesture must not colour the next match's)
		const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
		await page.setViewport({ width: 412, height: 892, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		await page.goto(`http://localhost:${PORT}/pocketenhanced/?seed=touch`, { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => window.__pocket && window.__pocket.ready, { timeout: 30000 });
		// my turn, with an Energy ready; then a known hand
		await page.evaluate(s => { window.__pocket.fast(true); window.__pocket.start({ players: 2, seed: 'touch', easy: true, singles: s }); }, singles);
		const mine = await page.evaluate(async () => { const P = window.__pocket, E = P.engine, { nextAction } = await import('/pocketenhanced/js/ai.js');
			for (let n = 0; n < 400; n++) { const S = P.state(); if (S.over) return false; const seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup) || {}).seat : S.current; if (seat !== 0) { await new Promise(r => setTimeout(r, 15)); continue; }
				if (S.phase === 'main' && !S.pending && S.players[0].zone.cur && !S.players[0].flags.attached) return true;
				await P.act(S.phase === 'setup' || S.pending ? nextAction(E.view(S, 0), new Set()) : { t: 'execute', seat: 0, commands: [null, null] }); await new Promise(r => setTimeout(r, 15)); }
			return false; });
		await page.evaluate(async () => { const P = window.__pocket, S = P.state(), { CARDS } = await import('/pocketenhanced/js/data/cards.js'), id = n => CARDS.find(c => c.name === n).id, me = S.players[0];
			me.hand = [id('Vulpix'), id('Potion'), id('Charmander'), id('Poké Ball'), id('Vulpix'), id('Potion'), id('Charmander'), id('Poké Ball')]; for (let i = 0; i < me.bench.length; i++) me.bench[i] = null;
			for (const a of me.active) if (a) { a.energy = ['Fire', 'Fire', 'Fire']; a.dmg = 20; } me.turns = Math.max(1, me.turns); P.refresh(); });
		await sleep(250);
		A(mine, `[${tag}] (a match at my turn, with an Energy ready, on a phone-sized touch screen)`);
		const centre = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
		const state = () => page.evaluate(() => { const P = window.__pocket, me = P.view().players[0]; return { hand: me.hand.length, bench: me.bench.map(k => (k ? k.id : 0)), active: me.active.map(k => (k ? k.id : 0)), dmg: me.active[0].dmg, en: (me.active[0].energy || []).length, attached: !!me.flags.attached, retreated: !!me.flags.retreated, cmds: P.ui().cmds.map(x => !!x), pick: !!P.ui().pick, modals: document.querySelectorAll('.modal').length, scroll: Math.round(document.querySelector('.pe-hand').scrollLeft) }; });
		// a finger: down, a little pause, steps with a little time between, up
		const finger = async (from, to, probe) => { await page.touchscreen.touchStart(from[0], from[1]); await sleep(30); for (let i = 1; i <= 8; i++) { await page.touchscreen.touchMove(from[0] + (to[0] - from[0]) * i / 8, from[1] + (to[1] - from[1]) * i / 8); await sleep(22); } const mid = probe ? await page.evaluate(probe) : null; await page.touchscreen.touchEnd(); await sleep(320); return mid; };
		const drag = async (a, z, probe) => { const from = await centre(a), to = await centre(z); if (!from || !to) return { missing: from ? z : a }; return finger(from, to, probe); };
		const held = () => ({ ghost: !!document.querySelector('.pe-ghost'), cls: document.getElementById('stage').className, can: document.querySelectorAll('.can-drop').length, lit: document.querySelectorAll('.pe-poke.drop').length });

		// 1. the Energy
		const s0 = await state(), m1 = await drag('.pe-zone .slot', '[data-k="p:0:active:0"]', held), s1 = await state();
		A(m1.ghost && /dragging-energy/.test(m1.cls) && m1.lit === 1 && s1.en === s0.en + 1 && s1.attached, `[${tag}] the Energy dragged by a finger onto my Active Pokémon is attached`, { m1, en: [s0.en, s1.en] });
		// 2. a Basic Pokémon from the hand to a Bench slot that lies up and to the side (a slanted drag)
		const from2 = await centre('[data-k="h:0"]'), to2 = await centre('[data-k="p:0:bench:1"]');
		const slant = Math.abs(to2[0] - from2[0]) / Math.max(1, Math.abs(to2[1] - from2[1]));
		const m2 = await finger(from2, to2, held), s2 = await state();
		A(m2.ghost && /dragging-card/.test(m2.cls) && m2.can >= 2 && s2.hand === s1.hand - 1 && s2.bench[1] && !s2.pick && s2.modals === 0, `[${tag}] a Basic Pokémon dragged by a finger from the hand to a Bench slot, at a slant, is played there (the browser does not take it for a scroll)`, { m2, slant: +slant.toFixed(2), bench: s2.bench });
		// 3. an Item onto the Pokémon it is for
		await drag('[data-k="h:0"]', '[data-k="p:0:active:0"]'); const s3 = await state();
		A(s3.hand === s2.hand - 1 && s3.dmg === 0 && !s3.pick, `[${tag}] Potion dragged by a finger onto my hurt Active Pokémon heals it`, s3);
		// 4. my Active Pokémon onto an opposing one
		const atk0 = await page.evaluate(() => window.__pocket.view().log.filter(e => e.k === 'attack' && e.seat === 0).length), turn0 = await page.evaluate(() => window.__pocket.view().turn);
		await drag('[data-k="p:0:active:0"]', '[data-k="p:1:active:0"]', held); let s4 = await state();
		if (s4.modals) { await page.evaluate(() => { const b = document.querySelector('.modal [data-k^="datk"]'); if (b) b.click(); }); await sleep(250); s4 = await state(); }
		// (singles, owner 2026-11-18: the attack is carried out at once and the turn ends; doubles: it is queued for Execute)
		const fired = tag === 'singles' ? await page.evaluate((a0, t0) => { const v = window.__pocket.view(); return v.log.filter(e => e.k === 'attack' && e.seat === 0).length > a0 && (v.turn > t0 || !!v.over); }, atk0, turn0) : null;
		A(tag === 'singles' ? fired && !s4.pick && s4.modals === 0 : s4.cmds[0] === true && !s4.pick && s4.modals === 0, tag === 'singles' ? `[${tag}] my Active Pokémon dragged by a finger onto the opposing one attacks at once, and the turn ends` : `[${tag}] my Active Pokémon dragged by a finger onto an opposing Pokémon queues its attack`, s4);
		// 5. a Benched Pokémon onto the Active one
		await drag('[data-k="p:0:bench:1"]', '[data-k="p:0:active:0"]'); const s5 = await state();
		A(s5.active[0] === s2.bench[1] && s5.bench[1] === s2.active[0] && s5.retreated, `[${tag}] a Benched Pokémon dragged by a finger onto my Active Pokémon changes places with it`, s5);
		// 6. a sideways swipe along the hand scrolls it; a tap opens the card
		const h = await centre('[data-k="h:2"]'), wide = await page.evaluate(() => { const e = document.querySelector('.pe-hand'); return e.scrollWidth - e.clientWidth; });
		const m6 = await finger(h, [h[0] - 150, h[1] + 4], held), s6 = await state();
		A(wide < 8 || (!m6.ghost && s6.scroll > s5.scroll + 40 && s6.hand === s5.hand && !s6.pick && s6.modals === 0), `[${tag}] a sideways swipe along the hand scrolls it (${wide > 8 ? 'by ' + (s6.scroll - s5.scroll) : 'it fits: nothing to scroll'}), picks nothing up and plays nothing`, { m6, scroll: [s5.scroll, s6.scroll], wide });
		await sleep(400);
		const t = await centre('[data-k="h:1"]'); await page.touchscreen.tap(t[0], t[1]); await sleep(450);
		A((await state()).modals === 1 && (await state()).hand === s6.hand, `[${tag}] a tap on a card in the hand still opens it`);
		A(errors.length === 0, `[${tag}] no page errors`, errors.slice(0, 3));
		await page.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
