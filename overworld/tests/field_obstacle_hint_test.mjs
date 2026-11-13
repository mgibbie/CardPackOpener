// field_obstacle_hint_test.mjs — Z on a cut tree, a smash rock or a boulder says the player's NEXT STEP
// (Plans/IMPROVEMENT_PLAN_2026_11.md 4b). Two tester reports on 2026-11-13 called gyms blocked: the player held the HM
// and its badge, but no POKeMON knew the move, and the tree said only "CUT could clear a path through it."
//   * a POKeMON knows the move: it is named, with where to pick the move (and Z on the real tree says so)
//   * the disc is in the bag and nobody knows the move: says so, and to teach it from the BAG
//   * neither: the old text alone
//   * the badge is missing: says which badge
//   node overworld/tests/field_obstacle_hint_test.mjs
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
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9655;
const STATE = { username: 'hinter', friendCode: 'ILEX01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'diglett', name: 'DIGLETT', level: 25, gender: 'M', friend: 70, types: ['Ground'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 60, atk: 50, def: 30, spa: 30, spd: 40, spe: 80 }, maxHP: 60, curHP: 60,
	exp: 15625, moves: [{ id: 'cut', name: 'Cut', pp: 30, maxPp: 30 }, { id: 'scratch', name: 'Scratch', pp: 35, maxPp: 35 }], sprite: 's50.png', num: 50,
}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 2-3. in game =====
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'JOHTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { JOHTO: { zephyr: true, hive: true } }, champion: {} }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const W = f => page.evaluate(f);
	const mapName = () => W(() => window.__ow.world.current && window.__ow.world.current.name);
	const pos = () => W(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty, last: window.__ow.player.moveOutcome }));
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const closeDialogs = () => page.evaluate(async () => {
		const O = window.__ow; const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		for (let i = 0; i < 60 && O.dialog.blocking; i++) { press('z'); await new Promise(r => setTimeout(r, 60)); }
		return !O.dialog.blocking;
	});
	const place = (x, y, facing) => page.evaluate((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = f; }, x, y, facing);
	// one step, by condition not by clock: a fixed 260 ms press + 400 ms pause raced a slow CI runner
	// (main gate 2026-11-09, f685b518: the first step through the cut tree was still under way when the
	// second press came and went, so the player stopped at (8,25)). Settle first, hold the key until
	// the step starts (or a bump is certain), then wait for the step to finish.
	// still = no step under way AND nothing gating input (gateReport().blockedBy: a fade, a cutscene, a
	// battle...): a keydown that lands while menuBlocking() is dropped by ow_input.js for good. Main gate
	// 2026-11-10 (PR #1040, shard 5, twice in a row): the second press got no moveOutcome at all — never
	// delivered — so a press that draws no answer is now released and made again (3 tries), and the
	// gate report at that moment rides in the failure message.
	const still = () => W(() => !window.__ow.player.moving && !window.__ow.gateReport().blockedBy);
	const settle = async () => { for (let i = 0; i < 160 && !(await still()); i++) await sleep(25); };
	let unanswered = null;
	const walk = async k => {
		for (let tries = 0; tries < 3; tries++) {
			await settle();
			await W(() => { window.__ow.player.moveOutcome = null; });
			await page.keyboard.down(k);
			let got = false;
			for (let i = 0; i < 80 && !(got = await W(() => window.__ow.player.moving || !!window.__ow.player.moveOutcome)); i++) await sleep(25);
			await page.keyboard.up(k);
			if (got) break;
			unanswered = await W(() => { const g = window.__ow.gateReport(); return { blockedBy: g.blockedBy, held: g.heldKeys, fade: g.fade, tick: g.tick, rejected: g.rejectedMoves }; });
		}
		await settle();
		await sleep(100);
	};
	const hint = (kind) => page.evaluate(async (kind) => (await import('./ow_fieldmoves.js')).obstacleHint(kind), kind);
	const setMoves = (ids) => page.evaluate((ids) => { window.__ow.party[0].moves = ids.map((id) => ({ id, name: id, pp: 10, maxPp: 10 })); }, ids);
	const bag = (id, n) => page.evaluate(async (id, n) => { const B = await import('./bag.js'); const have = B.count(id); if (n > have) B.addItem(id, n - have); else for (let i = have; i > n; i--) B.consume(id); return B.count(id); }, id, n);

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=IlexForest&x=8&y=26`, { waitUntil: 'domcontentloaded' });
	await boot('IlexForest');
	await place(8, 26, 'up');
	const OLD = 'A leafy tree grows here.\n\nCUT could clear a path through it.';

	// ---- a POKeMON knows CUT, and the badge is held (2 Johto badges)
	let h = await hint('tree');
	A(h.startsWith(OLD) && h.includes('DIGLETT knows CUT.') && h.includes('Open the party menu, choose DIGLETT') && h.includes('pick CUT'), 'a POKeMON knows CUT: the tree names it and says where to pick the move', JSON.stringify(h));
	// …and that is what Z on the real tree says
	await settle();
	await page.keyboard.press('z');
	let said = '';
	for (let i = 0; i < 40 && !said.includes('leafy tree'); i++) { await sleep(50); said = await W(() => JSON.stringify(window.__ow.dialog.pages || '') + ' ' + String(window.__ow.dialog.text || '')); }
	A(said.includes('leafy tree') && said.includes('DIGLETT knows CUT'), 'Z, facing the tree at (8,25): the dialog says it', said.slice(0, 300));
	await closeDialogs();

	// ---- the disc in the bag, nobody knows the move (the testers' case)
	await setMoves(['scratch']);
	A(await bag('hm1', 1) === 1, 'setup: HM01 in the bag, and DIGLETT forgets CUT');
	h = await hint('tree');
	A(h.startsWith(OLD) && /You have HM01 CUT, but no POKeMON\s+in your party knows CUT\./.test(h) && h.includes('Teach it from the BAG'), 'the HM is in the bag and no POKeMON knows CUT: the tree says so, and to teach it from the BAG', JSON.stringify(h));

	// ---- neither the move nor the disc: the old text alone
	await bag('hm1', 0);
	h = await hint('tree');
	A(h === OLD, 'neither the move nor its disc: the old two lines, nothing more', JSON.stringify(h));

	// ---- the badge is missing
	await setMoves(['cut', 'strength', 'rocksmash']);
	const gates = await page.evaluate(async () => { const B = await import('./badges.js'); return { n: B.count('JOHTO'), cut: B.hmReq('JOHTO', 'cut'), strength: B.hmReq('JOHTO', 'strength'), rocksmash: B.hmReq('JOHTO', 'rocksmash'), names: B.list('JOHTO').map((b) => b.name) }; });
	const gated = ['strength', 'rocksmash'].find((m) => gates[m] > gates.n), kind = gated === 'strength' ? 'boulder' : 'rock';
	h = gated ? await hint(kind) : '';
	A(!!gated && h.includes("can't be used outside of battle") && h.includes('until you have the ' + gates.names[gates[gated] - 1]) && !h.includes('Open the party menu'), `a move whose badge is missing (${gated}): the hint names the badge (${gated && gates.names[gates[gated] - 1]})`, JSON.stringify([gates, h]));
	const open = ['boulder', 'rock'].filter((k) => k !== kind)[0];
	const texts = { boulder: [await hint('boulder'), "It's a hefty boulder.\n\nSTRENGTH could push it aside."], rock: [await hint('rock'), 'A rugged rock blocks the way.\n\nROCK SMASH could break it apart.'] };
	A(texts.boulder[0].startsWith(texts.boulder[1]) && texts.rock[0].startsWith(texts.rock[1]), 'a boulder and a rock keep their own first lines', JSON.stringify([texts.boulder[0], texts.rock[0], open]));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
