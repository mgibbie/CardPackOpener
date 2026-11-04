// braille_doors_test.mjs — the sealed doors the decomps open from C.
//
// Each of these doors has a map script that READS its flag (ON_LOAD paints the
// cover back while it is unset) but no script that SETS it: on the cartridge the
// setter is C code in a field move or the step counter, and none of it was
// ported, so the doors stayed shut for good (2026-10-21, Instinct):
//
//   bug:1792491766696  Regirock / Registeel: the Sealed Chamber back wall's
//     `specialvar VAR_RESULT, CheckRelicanthWailord` read 0 (no handler), so
//     FLAG_REGI_DOORS_OPENED never set and Route 111 (29,87) / Route 120 (7,55)
//     stayed sealed. The chain behind it: DIG under the outer room's braille
//     (FLAG_SYS_BRAILLE_DIG), the back wall (WAILORD first, RELICANTH last),
//     then ROCK SMASH at the Desert Ruins (5..7,23) and FLASH at the Ancient
//     Tomb (8,25) open the Regi chambers (pokeemerald braille_puzzles.c).
//   bug:1792491795239  Regice: ShouldDoBrailleRegicePuzzle had no handler. Read
//     the braille, run a lap on the 36 wall squares, come back to (8,21). The lap
//     crosses the cave's exit (8,29), a SOUTH ARROW warp: stepping on it from the
//     side must not warp (TryArrowWarp wants the arrow's direction held).
//   bug:1792578554394  Six Island's DOTTED HOLE: FireRed's CUT checks
//     CutMoveRuinValleyCheck first: on (24,25) facing north it opens the door
//     (FLAG_USED_CUT_ON_RUIN_VALLEY_BRAILLE). The port said "nothing here to CUT".
//
//   node overworld/tests/braille_doors_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'/opt/chrome/chrome',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9771;
const STATE = { username: 'braille', friendCode: 'BRL001', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (speciesId, name, num, moves) => ({
	speciesId, name, level: 50, gender: 'M', friend: 70, types: ['Water'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 180, atk: 90, def: 85, spa: 80, spd: 80, spe: 90 }, maxHP: 180, curHP: 180,
	exp: 125000, moves: moves.map(id => ({ id, name: id.toUpperCase(), pp: 15, maxPp: 15 })), sprite: `s${num}.png`, num,
});
const FIELD = ['cut', 'rocksmash', 'flash', 'dig'];
const WAILORD = mon('wailord', 'WAILORD', 321, FIELD);
const RELICANTH = mon('relicanth', 'RELICANTH', 369, ['rocksmash']);
const MIDDLE = mon('pelipper', 'PELIPPER', 279, ['surf']);
const ALL = ids => Object.fromEntries(ids.map(id => [id, true]));
const BADGES = {
	badges: {
		HOENN: ALL(['stone', 'knuckle', 'dynamo', 'heat', 'balance', 'feather', 'mind', 'rain']),
		KANTO: ALL(['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth']),
	},
	champion: { HOENN: true, KANTO: true },
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

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
async function boot({ map, x, y, region = 'hoenn', party = [WAILORD, MIDDLE, RELICANTH], flags = {}, vars = {} }) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, region, flags, vars, badges) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', region);
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...flags }, vars }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, party, region, flags, vars, BADGES);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
	await sleep(900);
	return { page, ctx, errors };
}
// close every dialog / let every cutscene finish
const settle = page => page.evaluate(async () => {
	const O = window.__ow;
	const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < 12000) {
		const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
		if (!d && !c && f.alpha < 0.001 && f.target < 0.001 && !O.player.moving) { if (++calm >= 10) return 'idle'; } else calm = 0;
		if (d) press('z');
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
});
const pos = page => page.evaluate(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty, facing: window.__ow.player.facing }));
// one real step (or a bump/turn): hold the key until the tile changes or the
// player turned to face that way, then let go and wait for the step to land
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
async function step(page, dir) {
	const before = await pos(page);
	await page.keyboard.down(KEY[dir]);
	for (let i = 0; i < 40; i++) {
		const p = await pos(page);
		if (p.x !== before.x || p.y !== before.y || p.map !== before.map) break;
		if (i > 4 && p.facing === dir) break;   // a bump: turned, didn't move
		await sleep(15);
	}
	await page.keyboard.up(KEY[dir]);
	for (let i = 0; i < 60 && await page.evaluate(() => window.__ow.player.moving || !!window.__ow.loading); i++) await sleep(20);
	await sleep(60);
	await settle(page);
}
const flag = (page, f) => page.evaluate(f => window.__ow.Story.getFlag(f), f);
const passable = (page, x, y) => page.evaluate((x, y) => window.__ow.world.isPassable(x, y), x, y);
const useMove = (page, id) => page.evaluate(id => { const O = window.__ow; O.useFieldMove(id, O.party ? O.party[0] : null); return O.dialog.blocking ? (O.dialog.text || O.dialog.lines?.join?.('\n') || 'dialog') : ''; }, id);
async function waitMap(page, name) {
	for (let i = 0; i < 80 && (await pos(page)).map !== name; i++) await sleep(100);
	await sleep(400); await settle(page);
	return (await pos(page)).map === name;
}

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// ---- bug:1792491766696: the Sealed Chamber -> Regirock / Registeel ----
	{
		const { page, ctx, errors } = await boot({ map: 'SealedChamber_OuterRoom', x: 10, y: 3 });
		A(!(await passable(page, 10, 2)), '1a. the Sealed Chamber\'s inner door starts covered');
		await step(page, 'up');   // face the braille
		await useMove(page, 'dig'); await settle(page);
		A(await flag(page, 'FLAG_SYS_BRAILLE_DIG'), '1a. DIG under the braille sets FLAG_SYS_BRAILLE_DIG');
		A((await pos(page)).map === 'SealedChamber_OuterRoom', '1a. ...and does NOT tunnel you out of the cave', JSON.stringify(await pos(page)));
		A(await passable(page, 10, 2), '1a. ...and opens the inner room (10,2)');
		await step(page, 'up');
		A(await waitMap(page, 'SealedChamber_InnerRoom'), '1a. walking in reaches the inner room', JSON.stringify(await pos(page)));
		A(errors.length === 0, '1a. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}
	for (const [label, party, want] of [
		['WAILORD first, RELICANTH last', [WAILORD, MIDDLE, RELICANTH], true],
		['RELICANTH first, WAILORD last (Emerald flipped it)', [RELICANTH, MIDDLE, WAILORD], false],
		['no RELICANTH', [WAILORD, MIDDLE], false],
	]) {
		const { page, ctx, errors } = await boot({ map: 'SealedChamber_InnerRoom', x: 10, y: 5, party });
		await step(page, 'up');   // face the back wall's braille (10,4)
		await page.keyboard.press('z'); await sleep(200); await settle(page);
		const label0 = await page.evaluate(() => window.__ow.lastScriptLabel || null);
		A(await flag(page, 'FLAG_REGI_DOORS_OPENED') === want, `1b. back wall, ${label}: FLAG_REGI_DOORS_OPENED ${want ? 'set' : 'stays unset'}`, label0);
		A(errors.length === 0, '1b. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}
	for (const [map, x, y, dest] of [['Route111', 29, 88, 'DesertRuins'], ['Route120', 7, 56, 'AncientTomb']]) {
		{
			const { page, ctx } = await boot({ map, x, y });
			A(!(await passable(page, x, y - 1)), `1c. ${map}: the tomb (${x},${y - 1}) is sealed before the back wall`);
			await ctx.close();
		}
		const { page, ctx, errors } = await boot({ map, x, y, flags: { FLAG_REGI_DOORS_OPENED: true } });
		A(await passable(page, x, y - 1), `1c. ${map}: with FLAG_REGI_DOORS_OPENED the tomb (${x},${y - 1}) is open`);
		await step(page, 'up');
		A(await waitMap(page, dest), `1c. ${map}: walking up enters ${dest}`, JSON.stringify(await pos(page)));
		A(errors.length === 0, `1c. ${map}: no page errors`, JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}
	for (const [map, x, y, move, f] of [
		['DesertRuins', 6, 23, 'rocksmash', 'FLAG_SYS_REGIROCK_PUZZLE_COMPLETED'],
		['AncientTomb', 8, 25, 'flash', 'FLAG_SYS_REGISTEEL_PUZZLE_COMPLETED'],
	]) {
		const { page, ctx, errors } = await boot({ map, x, y, flags: { FLAG_REGI_DOORS_OPENED: true } });
		A(!(await passable(page, 8, 20)), `1d. ${map}: the inner chamber (8,20) starts sealed`);
		await useMove(page, move); await settle(page);
		A(await flag(page, f), `1d. ${map}: ${move.toUpperCase()} at (${x},${y}) sets ${f}`);
		A(await passable(page, 8, 20), `1d. ${map}: ...and opens the chamber (8,20)`);
		// from the reload on, ON_LOAD leaves it open
		await page.evaluate(() => window.__ow.editLoadMap(window.__ow.world.current.name)); await sleep(800); await settle(page);
		A(await passable(page, 8, 20), `1d. ${map}: still open after re-entering the map`);
		A(errors.length === 0, `1d. ${map}: no page errors`, JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}

	// ---- bug:1792491795239: Regice's lap ----
	{
		const { page, ctx, errors } = await boot({ map: 'IslandCave', x: 8, y: 21 });
		A(!(await passable(page, 8, 20)), '2a. Island Cave\'s inner wall (8,20) starts sealed');
		await step(page, 'up');   // face the braille
		await page.keyboard.press('z'); await sleep(200); await settle(page);
		A(await flag(page, 'FLAG_TEMP_REGICE_PUZZLE_STARTED'), '2a. reading the braille starts the puzzle');
		// a stray step (off the wall squares) fails the attempt; reading again restarts it
		await step(page, 'down');   // (8,22)
		A(await flag(page, 'FLAG_TEMP_REGICE_PUZZLE_FAILED') && !(await flag(page, 'FLAG_TEMP_REGICE_PUZZLE_STARTED')), '2b. a step off the lap fails the attempt');
		await step(page, 'up'); await step(page, 'up');
		await page.keyboard.press('z'); await sleep(200); await settle(page);
		A(!(await flag(page, 'FLAG_TEMP_REGICE_PUZZLE_FAILED')) && await flag(page, 'FLAG_TEMP_REGICE_PUZZLE_STARTED'), '2b. reading the braille again clears it and restarts');
		// the lap: west along row 21, down the west wall, east along row 29 (across
		// the exit at (8,29)), up the east wall, and back west to (8,21)
		const LAP = [
			...Array(4).fill('left'), 'down', 'down', 'left', 'down', 'down', 'down', 'down', 'right', 'down', 'down',
			...Array(8).fill('right'), 'up', 'up', 'right', 'up', 'up', 'up', 'up', 'left', 'up', 'up', 'left', 'left', 'left', 'left',
		];
		let crossed = null;
		for (let i = 0; i < LAP.length; i++) {
			await step(page, LAP[i]);
			const p = await pos(page);
			if (p.x === 8 && p.y === 29 && p.map === 'IslandCave') crossed = p;
			if (p.map !== 'IslandCave') break;
			if (i === LAP.length - 2) A(!(await passable(page, 8, 20)), '2c. not open yet one step short of (8,21)', JSON.stringify(p));
		}
		A(!!crossed, '2c. stepping onto the exit (8,29) from the side does NOT warp out (SOUTH ARROW warp)', JSON.stringify(await pos(page)));
		const end = await pos(page);
		A(end.map === 'IslandCave' && end.x === 8 && end.y === 21, '2c. the lap ends back under the braille at (8,21)', JSON.stringify(end));
		A(await flag(page, 'FLAG_SYS_BRAILLE_REGICE_COMPLETED'), '2c. a full lap sets FLAG_SYS_BRAILLE_REGICE_COMPLETED');
		A(await passable(page, 8, 20), '2c. ...and opens the wall (8,20)');
		await step(page, 'up');
		const inside = await pos(page);
		A(inside.map === 'IslandCave' && inside.y < 20, '2c. walking in reaches Regice\'s chamber', JSON.stringify(inside));
		A(errors.length === 0, '2c. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}
	{
		// the arrow warp itself still lets you out: head its way, or push it while on it
		const { page, ctx, errors } = await boot({ map: 'IslandCave', x: 7, y: 29 });
		await step(page, 'right');
		A((await pos(page)).map === 'IslandCave', '2d. sideways onto (8,29): still in the cave', JSON.stringify(await pos(page)));
		await step(page, 'down');
		A(await waitMap(page, 'Route105'), '2d. pushing DOWN on the arrow takes the exit to Route 105', JSON.stringify(await pos(page)));
		A(errors.length === 0, '2d. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}
	{
		const { page, ctx } = await boot({ map: 'IslandCave', x: 8, y: 28 });
		await step(page, 'down');
		A(await waitMap(page, 'Route105'), '2d. walking DOWN onto the arrow exits at once, as before', JSON.stringify(await pos(page)));
		await ctx.close();
	}

	// ---- bug:1792578554394: the Dotted Hole ----
	{
		const flags = { FLAG_HIDE_RUIN_VALLEY_SCIENTIST: true };   // Lorelei's Icefall Cave scene moved him off the door
		const { page, ctx, errors } = await boot({ map: 'SixIsland_RuinValley', x: 24, y: 26, region: 'kanto', flags });
		await useMove(page, 'cut'); await settle(page);
		A(!(await flag(page, 'FLAG_USED_CUT_ON_RUIN_VALLEY_BRAILLE')), '4a. CUT anywhere else on Ruin Valley does nothing');
		await step(page, 'up');   // (24,25)
		await step(page, 'up');   // bump: face the door (24,24)
		const at = await pos(page);
		A(at.x === 24 && at.y === 25 && at.facing === 'up' && at.map === 'SixIsland_RuinValley', '4a. standing at (24,25) facing the door', JSON.stringify(at));
		A(!(await passable(page, 24, 24)), '4a. the DOTTED HOLE door starts shut');
		await useMove(page, 'cut'); await settle(page);
		A(await flag(page, 'FLAG_USED_CUT_ON_RUIN_VALLEY_BRAILLE'), '4b. CUT in front of the door sets FLAG_USED_CUT_ON_RUIN_VALLEY_BRAILLE');
		A(await passable(page, 24, 24), '4b. ...and opens it');
		await step(page, 'up');
		A(await waitMap(page, 'SixIsland_DottedHole_1F'), '4b. walking in reaches the DOTTED HOLE (the SAPPHIRE chain)', JSON.stringify(await pos(page)));
		A(errors.length === 0, '4b. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}
	{
		const flags = { FLAG_HIDE_RUIN_VALLEY_SCIENTIST: true, FLAG_USED_CUT_ON_RUIN_VALLEY_BRAILLE: true };
		const { page, ctx } = await boot({ map: 'SixIsland_RuinValley', x: 24, y: 25, region: 'kanto', flags });
		A(await passable(page, 24, 24), '4c. a save that opened it finds it open (ON_LOAD)');
		await ctx.close();
	}
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
