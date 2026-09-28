// hpcost_test.mjs — a hero-power discount shows on the orb.
//
// Bryan (2026-09-28): "Sneaky scout honorable kill did not work", then "I used it
// and it still took mana away". Two bugs:
//   1. Honorable Kill only fired for an attacker that SURVIVED. Sneaky Scout is a
//      3/2: its natural trade (into a 3-health minion that hits back) killed it,
//      so the discount never landed. It now fires either way, as in Hearthstone.
//   2. Every power orb drew the PRINTED cost, so even a landed discount still
//      read (2). The orbs (hero panel, side panel, tooltip) show the live cost:
//      green when cheaper, red when taxed.
//
//   node overworld/tests/hpcost_test.mjs
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
const PORT = 9157;
const STATE = { username: 'hpcost', friendCode: 'HPCST0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
	await page.setViewport({ width: 1366, height: 768 });
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 'hpcost'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, STATE);
	await page.goto(`http://localhost:${PORT}/battlecards/index.html?players=2`, { waitUntil: 'domcontentloaded' });
	const t0 = Date.now();
	while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__game && window.__game.state && window.__game.targeting)).catch(() => false))) await sleep(200);
	await sleep(2500);
	await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /keep hand/i.test(x.textContent)); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } });
	await sleep(1200);

	// your turn, no mana, a ready Sneaky Scout (3 attack) facing a 3-health minion
	const setup = await page.evaluate(() => {
		const g = window.__game, s = g.state, E = g.E, H = g.HUMAN, p = s.players[H], foe = s.players[1 - H];
		s.current = H; s.priority = null; s.stack = [];
		// a class power costing (2), as a class deck brings
		let power = p.heroPowers.find(c => c.id === (p.heroClass || '') + '_power');
		if (!power || !(power.power.cost > 0)) {
			p.heroClass = p.heroClass || 'mage';
			power = E.instantiate({ id: p.heroClass + '_power', name: 'Test Power', type: 'heropower', cost: 0, rarity: 'basic', power: { cost: 2, effects: [{ type: 'armor', value: 1 }] }, description: 'Hero Power (2): Gain 1 Armor.', cardClass: p.heroClass }, H);
			power.zone = 'heropower';
			p.heroPowers = [power, ...p.heroPowers.filter(c => !c.id.endsWith('_power'))];
		}
		power.usedThisTurn = false;
		p.mana.cur = 0; p.mana.bonus = 0;
		const put = (pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; s.players[pi].board.push(c); return c; };
		const scout = put(H, s.cardsById.sneaky_scout); scout.sick = false; scout.attacksUsed = 0;
		const victim = put(1 - H, { id: 't_hk', name: 'Ogre', type: 'creature', cost: 3, attack: 3, health: 3, rarity: 'common', description: '' });
		g.pump();
		return { scout: scout.uid, victim: victim.uid, printed: power.power.cost, powerUid: power.uid };
	});
	A(!!setup, 'setup: your hero power costs mana, and Sneaky Scout (3/2) faces a 3/3');
	await sleep(600);
	const before = await page.evaluate(() => ({ orb: window.__game.heroOrbCost, usable: window.__game.E.canUseHeroPower(window.__game.state, window.__game.HUMAN, window.__game.state.players[window.__game.HUMAN].heroPowers.find(c => c.id.endsWith('_power'))) }));
	A(before.orb === setup.printed && !before.usable, `before the kill the orb shows its printed cost (${setup.printed}) and, with no mana, it can't be used`, JSON.stringify(before));
	// the Scout trades: 3 damage into 3 health is an Honorable Kill, and the 3/3
	// kills the Scout back. It used to fire only for a SURVIVING attacker, so the
	// card's natural trade never gave the discount (the tester: "it still took mana")
	await page.evaluate(su => { const g = window.__game; g.E.attack(g.state, g.HUMAN, su.scout, { type: 'creature', uid: su.victim, player: 1 - g.HUMAN }); g.pump(); }, setup);
	await sleep(1200);
	const after = await page.evaluate((pu, su0) => {
		const g = window.__game, p = g.state.players[g.HUMAN];
		const power = p.heroPowers.find(c => c.uid === pu);
		const dom = document.querySelector('#my-panel .power-orb');
		return { scoutDead: !p.board.some(c => c.uid === su0.scout), orb: g.heroOrbCost, engine: g.E.heroPowerCost(g.state, g.HUMAN, power), usable: g.E.canUseHeroPower(g.state, g.HUMAN, power), dom: dom ? dom.dataset.cost : null,
			log: document.getElementById('log')?.textContent || '' };
	}, setup.powerUid, setup);
	A(after.scoutDead, 'setup: the Scout died in the trade');
	A(after.engine === 0, 'the Honorable Kill makes the next Hero Power cost (0)', JSON.stringify(after.engine));
	A(after.orb === 0, 'the hero-panel orb now SHOWS (0), not the printed cost (the report: "did not work")', JSON.stringify({ orb: after.orb }));
	A(after.dom == null || after.dom === '0', 'the side-panel orb shows (0) too', JSON.stringify({ dom: after.dom }));
	A(after.usable, '...and with no mana the power is usable');
	// use it: free, and the orb goes back to the printed cost
	await page.evaluate(pu => { const g = window.__game, p = g.state.players[g.HUMAN]; const power = p.heroPowers.find(c => c.uid === pu); g.E.useHeroPower(g.state, g.HUMAN, power.uid, null); g.pump(); }, setup.powerUid);
	await sleep(900);
	const used = await page.evaluate(pu => { const g = window.__game, p = g.state.players[g.HUMAN]; const power = p.heroPowers.find(c => c.uid === pu); return { used: power.usedThisTurn, mana: p.mana.cur, orb: g.heroOrbCost }; }, setup.powerUid);
	A(used.used && used.mana === 0, 'the discounted power is used for free', JSON.stringify(used));
	A(used.orb === setup.printed, 'the discount is one-shot: the orb goes back to the printed cost', JSON.stringify(used));
	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
