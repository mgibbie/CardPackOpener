// cerulean_gym_pool_test.mjs — "invisible wall at row 15 in Cerulean Gym after a
// Misty loss + blackout" (bug:1792194630525-remytest, bug:1792195117250-remygl).
//
// What it really was: Cerulean Gym's walkway north from the entrance is ONE
// column wide (x=9, rows 14-15); every other row-15 tile is the gym's pool
// (MB 0x15). Both reports pushed north at x=8 and x=10 — water — and read
// world.isPassable(8,15)=true plus a clean gateReport() as an invisible wall,
// because isPassable is collision only (a surfer crosses water) and nothing the
// tester could inspect named the tile. Reproduced from remygl's live save: x=9
// walks straight to Misty, before and after the loss.
//
// So this pins:
//   1. losing to Misty and blacking out leaves the gym exactly as walkable as
//      before (no loss-induced lockout) — x=9 still reaches the north half;
//   2. gateReport().ahead names what a step would hit ('water (needs SURF)');
//   3. bumping the water as a walker says so on the HUD instead of a bare thud.
//
//   node overworld/tests/cerulean_gym_pool_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const puppeteer = (await import('puppeteer-core')).default;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9541;
const STATE = { username: 'ceruleanpool', friendCode: 'CPOOL1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
// a lone L5 SQUIRTLE: Misty wins, and nobody can SURF
const PARTY = [{
	speciesId: 'squirtle', name: 'SQUIRTLE', level: 5, gender: 'M', friend: 70, types: ['Water'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 20, atk: 11, def: 12, spa: 11, spd: 11, spe: 10 }, maxHP: 20, curHP: 20,
	exp: 135, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's7.png', num: 7,
}];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		for await (const _ of req) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
		return;
	}
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
		res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1100, height: 800 });
	const errors = [];
	page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument((st, party) => {
		localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('magepunk_money', '4000'); }
	}, STATE, PARTY);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=CeruleanCity_Gym`, { waitUntil: 'domcontentloaded' });
	const W = (f, ...a) => page.evaluate(f, ...a);
	const t0 = Date.now();
	while (Date.now() - t0 < 60000 && !(await W(() => !!(window.__ow?.battle?.data && window.__ow.world?.current?.name)).catch(() => false))) await sleep(200);
	await sleep(1500);
	A(await W(() => window.__ow.world.current.name) === 'CeruleanCity_Gym', 'boots in Cerulean Gym');

	// every row-16 floor tile: what a step north would hit, and whether the engine takes it
	const probeRow = () => W(async () => {
		const o = window.__ow, p = o.player, out = {};
		for (let x = 6; x <= 10; x++) {
			if (x === 7) continue;   // the GYM GUY stands at (7,16)
			p.setTile(x, 16); p.facing = 'up';
			const ahead = o.gateReport().ahead || null;
			p.tryMove('up');
			out[x] = { outcome: p.moveOutcome, refusal: ahead ? ahead.refusal : undefined, hud: document.getElementById('hud')?.textContent || '' };
			for (let i = 0; i < 40 && p.moving; i++) await new Promise(r => setTimeout(r, 25));
		}
		p.setTile(8, 16);
		return out;
	});
	// walk north up the walkway; returns the row reached
	const walkNorth = () => W(async () => {
		const o = window.__ow, p = o.player;
		o.trainers.list = [];   // keep it about movement: Luis's sight line would stop us
		p.setTile(9, 16);
		await o.pumpPlayer('up', false, 700);
		const y = o.world.current.name === 'CeruleanCity_Gym' ? p.ty : 99; p.setTile(8, 16);
		return y;
	});

	const before = await probeRow();
	A(before[9].outcome === 'moved', 'x=9 (the walkway) steps north from row 16', JSON.stringify(before[9]));
	for (const x of [6, 8, 10]) A(before[x].outcome === 'bump', `x=${x} north is the pool: a walker bumps`, JSON.stringify(before[x]));
	for (const x of [8, 10]) A(before[x].refusal === 'water (needs SURF)', `gateReport().ahead names the pool at (${x},15)`, JSON.stringify(before[x]));
	A(before[9].refusal === null, 'gateReport().ahead is clear on the walkway', JSON.stringify(before[9]));
	A(/SURF/.test(before[8].hud) && /water/i.test(before[8].hud), 'bumping the pool says it is water on the HUD', JSON.stringify(before[8].hud));
	A(await walkNorth() <= 13, 'the walkway reaches the gym\'s north half before any battle');

	// --- lose to Misty, black out (the reported trigger) ---
	await page.reload({ waitUntil: 'domcontentloaded' });   // fresh trainer list after walkNorth cleared it
	const t1 = Date.now();
	while (Date.now() - t1 < 60000 && !(await W(() => !!(window.__ow?.battle?.data && window.__ow.world?.current?.name)).catch(() => false))) await sleep(200);
	await sleep(1200);
	const started = await W(() => {
		const o = window.__ow, k = 'CeruleanCity_Gym_EventScript_Misty';
		o.player.setTile(8, 7); o.player.facing = 'up';
		const misty = (o.trainers.list || []).find(t => t.ev && t.ev.script === k) || { ev: { script: k } };
		return o.runScriptLabel(k, misty);
	});
	A(started === true, 'Misty\'s script starts');
	let inBattle = false;
	for (let i = 0; i < 200 && !inBattle; i++) {
		inBattle = await W(() => { const o = window.__ow; if (o.battle.blocking) return true; if (o.dialog.blocking) o.dialog.key('z'); return false; });
		await sleep(60);
	}
	A(inBattle, 'the Misty battle begins');
	for (let i = 0; i < 1500; i++) {
		if (!(await W(() => window.__ow.battle.blocking))) break;
		await W(() => { try { window.__ow.battle.key('z'); } catch (e) {} });
		await sleep(60);
	}
	await sleep(1200);
	const lost = await W(() => ({ money: window.__ow.Bag.getMoney(), text: (window.__ow.dialog.pages || []).flat().join(' ') }));
	A(lost.money === 2000 && /no POKeMON that can fight/i.test(lost.text), 'the loss blacked the player out (half the money gone)', JSON.stringify(lost).slice(0, 160));
	for (let i = 0; i < 20 && await W(() => window.__ow.dialog.blocking || window.__ow.cutscene.blocking); i++) {
		await W(() => { if (window.__ow.dialog.blocking) window.__ow.dialog.key('z'); });
		await sleep(200);
	}
	await sleep(2500);
	const woke = await W(() => window.__ow.world.current.name);
	A(woke !== 'CeruleanCity_Gym', 'woke up away from the gym', woke);

	// --- come back through the front door ---
	await W(() => window.__ow.warpTo('MAP_CERULEAN_CITY_GYM', 1));
	for (let i = 0; i < 100 && await W(() => window.__ow.world.current.name !== 'CeruleanCity_Gym'); i++) await sleep(100);
	await sleep(1500);
	A(await W(() => window.__ow.world.current.name) === 'CeruleanCity_Gym', 'back in Cerulean Gym after the blackout');
	const after = await probeRow();
	A(JSON.stringify(Object.fromEntries(Object.entries(after).map(([x, r]) => [x, [r.outcome, r.refusal]])))
		=== JSON.stringify(Object.fromEntries(Object.entries(before).map(([x, r]) => [x, [r.outcome, r.refusal]]))),
		'after the loss, row 15 refuses exactly what it refused before (no loss-induced wall)', JSON.stringify({ before, after }));
	A(await walkNorth() <= 13, 'the walkway still reaches Misty after the loss + blackout');
	A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, e.stack);
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
