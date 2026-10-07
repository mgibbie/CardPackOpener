// door_reach_kh_test.mjs — every Kanto (FireRed) and Hoenn (Emerald) door you can
// see is a door you can reach.
//
// tools/audit_tile_reach.mjs listed 51 Kanto and 37 Hoenn doors on reached maps
// that no path walked to (2026-10-07). Most were gates the audit didn't model; it
// now counts FireRed/Emerald `setmetatile` cells a script opens (the Mansion's
// switch walls, ...), a map's other layouts (setmaplayoutindex: Shoal Cave's tides,
// Sky Pillar), the exits upstream puts one row past the edge (rest houses,
// Slateport harbor), the elevators' setdynamicwarp floors, the Cable Car, a forced
// walk-in on arrival, and falling through a cracked floor. The UNION ROOM / TRADE
// CENTER doors upstairs in every POKeMON CENTER are link-only (the attendant warps
// you; there is no link play). Two were real:
//   1. FireRed's ELITE FOUR rooms: the walk-in (PokemonLeague_EventScript_EnterRoom,
//      Common_Movement_WalkUp5 through the room's solid entry row) was a missing
//      shared label, and the shared Common_Movement_* walks moved nothing anyway —
//      you arrived in LORELEI's room at (6,12) facing a wall and could only leave.
//   2. Emerald's CRACKED FLOORS (holes.js, holewarp_data.js): the port never let
//      you fall. Sky Pillar 3F's middle pocket — the stairs back up to 4F's upper
//      hall and on to 5F and Rayquaza — is reached ONLY by dropping through 4F.
//
//   node overworld/tests/door_reach_kh_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9285;
const STATE = { username: 'doorreachkh', friendCode: 'DOORKH', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'A', level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
}];
const BASE_FLAGS = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 0. the audit: no unexplained unreachable door =====
// a POKeMON CENTER's UNION ROOM / TRADE CENTER (and the League's): link play only
const LINK_ONLY = /^MAP_(UNION_ROOM|TRADE_CENTER|RECORD_CORNER|BATTLE_COLOSSEUM)/;
// doors the decomp itself leaves sealed — the warp tile and every neighbour are
// solid in its own layout (checked against the .bin), with why
const SEALED = {
	'SSAnne_1F_Corridor (3,20)': "a duplicate KITCHEN landing pad in the wall below the corridor's real kitchen door (2,18)",
	'MossdeepCity_GameCorner_1F (2,0)': "the unused Game Corner's B1F stairs, walled in upstream (Emerald never opened it)",
};
{
	const audit = await import(pathToFileURL(path.join(ROOT, 'tools', 'audit_tile_reach.mjs')).href);
	const runs = { KANTO: audit.flood('MAP_PALLET_TOWN', 6, 8), HOENN: audit.flood('MAP_LITTLEROOT_TOWN', 10, 10) };
	for (const [region, seen] of Object.entries(runs)) {
		const miss = [];
		let link = 0;
		for (const [id, s] of seen) {
			const m = audit.loadMap(id);
			for (const w of m.warps) if (!s.has(w.x + ',' + w.y)) { if (LINK_ONLY.test(String(w.dest_map))) link++; else miss.push(`${m.name} (${w.x},${w.y})`); }
		}
		const unexplained = miss.filter(d => !SEALED[d]);
		A(unexplained.length === 0, `0. every reached ${region} door is reachable (${seen.size} maps; link-only: ${link}; sealed by the decomp: ${miss.length - unexplained.length})`, unexplained.join(', '));
	}
	const K = runs.KANTO, H = runs.HOENN;
	const reached = (seen, id, x, y) => !!seen.get(id)?.has(x + ',' + y);
	A(reached(K, 'MAP_POKEMON_LEAGUE_LORELEIS_ROOM', 6, 2) && K.has('MAP_POKEMON_LEAGUE_CHAMPIONS_ROOM') && K.has('MAP_POKEMON_LEAGUE_HALL_OF_FAME'), "0. the FireRed League: LORELEI's room to the HALL OF FAME");
	A(reached(H, 'MAP_SKY_PILLAR_4F', 3, 1) && H.has('MAP_SKY_PILLAR_TOP'), "0. Sky Pillar: 4F's upper hall and the TOP (through the 3F pocket)");
	A(reached(H, 'MAP_ROUTE112', 6, 46) && H.has('MAP_LAVARIDGE_TOWN'), '0. the Jagged Pass doors and Lavaridge (down from the Cable Car)');
	A(reached(K, 'MAP_ROCKET_HIDEOUT_B4F', 20, 23), "0. Rocket Hideout B4F's lift door (the LIFT KEY elevator's floors)");
	A(reached(K, 'MAP_POKEMON_MANSION_1F', 25, 27), '0. the Pokémon Mansion behind its switch walls');
}

// ===== 1-3. in the engine =====
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
	const errors = [];
	// a fresh page per scene, each seeding its own save
	const open = async (region, vars, url, map) => {
		const page = await browser.newPage();
		page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, party, region, flags, vars) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', region);
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags, vars }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}, STATE, PARTY, region, BASE_FLAGS, vars);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?${url}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
		const pos = () => page.evaluate(() => ({ map: window.__ow.world.current?.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
		const until = async (pred, ms = 6000) => { const t0 = Date.now(); let p; while (Date.now() - t0 < ms) { p = await pos(); if (pred(p)) return p; await sleep(80); } return p; };
		const step = async k => { await page.keyboard.down(k); await sleep(180); await page.keyboard.up(k); await sleep(420); };
		return { page, pos, until, step };
	};

	// ----- 1. FireRed: LORELEI's room walks you in -----
	{
		const { page, until } = await open('KANTO', { VAR_MAP_SCENE_POKEMON_LEAGUE: 0 }, 'map=PokemonLeague_LoreleisRoom&x=6&y=12', 'PokemonLeague_LoreleisRoom');
		const lp = await until(p => p.y === 7);
		A(lp.map === 'PokemonLeague_LoreleisRoom' && lp.x === 6 && lp.y === 7, "1. arriving in LORELEI's room walks you 5 tiles in, past the solid entry row", JSON.stringify(lp));
		const shut = await page.evaluate(() => !!(window.__ow.world.current.layout.map[11][6] & 0xC00));
		A(shut, '1. ...and the entry closes behind you (CloseEntry)');
		await page.close();
	}
	// ----- 2. Emerald: Sky Pillar 4F's cracked floor drops you to 3F -----
	{
		const { page, until, step } = await open('HOENN', {}, 'map=SkyPillar_4F&x=5&y=4', 'SkyPillar_4F');
		const crack = await page.evaluate(() => window.__ow.world.behaviorAt(6, 4));
		A(crack === 0xD2, '2. Sky Pillar 4F (6,4) is a cracked floor', crack);
		await step('ArrowRight');
		const fell = await until(p => p.map === 'SkyPillar_3F');
		A(fell.map === 'SkyPillar_3F' && fell.x === 6 && fell.y === 4, '2. walking onto it, you fall through to 3F at the same spot (6,4)', JSON.stringify(fell));
		const pocket = await page.evaluate(() => { const w = window.__ow.world; return { stairs: !!w.warpAt(7, 1), open: [[6, 3], [7, 2]].every(([x, y]) => w.isPassable(x, y)) }; });
		A(pocket.stairs && pocket.open, "2. ...into 3F's middle pocket, whose stairs (7,1) climb to 4F's upper hall", JSON.stringify(pocket));
		await page.close();
	}
	// ----- 3. on the bike the floor holds, then gives way behind you -----
	{
		const { page, pos, until } = await open('HOENN', {}, 'map=SkyPillar_4F&x=5&y=4', 'SkyPillar_4F');
		await page.evaluate(() => { window.__ow.player.biking = true; });
		// exactly one tile per step (the bike is fast: a held key covers two)
		const tap = async dir => { const b = await pos(); await page.evaluate(d => window.__ow.player.tryMove(d), dir); await until(p => p.x !== b.x || p.map !== b.map, 2000); await page.waitForFunction(() => !window.__ow.player.moving, { timeout: 3000 }).catch(() => {}); await sleep(200); };
		await tap('right');
		await tap('right');
		const rode = await pos();
		const hole = await page.evaluate(() => window.__ow.world.behaviorAt(6, 4));
		A(rode.map === 'SkyPillar_4F' && rode.x === 7, '3. riding the bike, you cross the cracked floor', JSON.stringify(rode));
		A(hole === 0x66, '3. ...and the crack you left breaks into a hole', hole);
		await tap('left');
		const fell = await until(p => p.map === 'SkyPillar_3F');
		A(fell.map === 'SkyPillar_3F' && fell.x === 6 && fell.y === 4, '3. riding back onto the hole drops you to 3F', JSON.stringify(fell));
		await page.close();
	}
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
