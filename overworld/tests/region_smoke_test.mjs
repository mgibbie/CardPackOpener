// region_smoke_test.mjs — every region's everyday loop, mid-game (overview plan step 4).
//
// boot_smoke boots one map; intro_regions walks each region's new-game opening.
// Neither plays the NORMAL loop in each region after the intro, and that loop runs
// through most of the modules the main.js split carved out (world, input, story,
// menus, battle, saves, render...). For KANTO, JOHTO, HOENN and JOHKANTO, on a
// mid-game save in a hub town, this checks:
//   1. the town boots: map layout, NPCs and trainers loaded, the region's music
//   2. a real step moves the player (the key path, not a teleport)
//   3. talking to a townsperson through interact() opens their dialog
//   4. walking into the POKeMON CENTER door enters it, and the exit mat leads back
//   5. a wild battle drawn from the next route's own encounter table starts and ends
//   6. the position is saved
//   7. no uncaught page error the whole way
// Each region gets a fresh browser context, so no save leaks between them.
//
//   node overworld/tests/region_smoke_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const REGIONS = [
	{ region: 'KANTO', map: 'ViridianCity', door: [26, 26], pc: /POKEMON_CENTER/, route: 'MAP_ROUTE1' },
	{ region: 'JOHTO', map: 'VioletCity', door: [31, 25], pc: /POKECENTER/, route: 'MAP_ROUTE_31' },
	{ region: 'HOENN', map: 'RustboroCity', door: [16, 38], pc: /POKEMON_CENTER/, route: 'MAP_ROUTE104' },
	{ region: 'JOHTO', label: 'JOHKANTO', map: 'JohKantoViridianCity', door: [23, 25], pc: /POKECENTER/, route: 'MAP_JOHKANTO_ROUTE_1' },
];

const puppeteer = (await import('puppeteer-core')).default;
const http = await import('http');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9125;
const STATE = { username: 'regions', friendCode: 'REGNS0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [], rows: [] }));
	}
	fs.readFile(path.join(ROOT, u === '/' ? '/index.html' : u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(u)] || 'application/octet-stream' });
		res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
// a sturdy mid-game lead: fixed ability (no HUSTLE misses) and plain Tackle
const LEAD = { speciesId: 'lapras', name: 'LAPRAS', level: 50, gender: 'M', friend: 70, types: ['Water', 'Ice'], ability: 'waterabsorb',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 190, atk: 105, def: 95, spa: 105, spd: 115, spe: 75 },
	maxHP: 190, curHP: 190, exp: 125000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's131.png', num: 131 };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	for (const R of REGIONS) {
		const tag = R.label || R.region;
		const ctx = await browser.createBrowserContext();   // fresh storage per region
		const page = await ctx.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, region, lead) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.setItem('magepunk_mp_token_v1', 'regions-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', region);
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([lead]));
			localStorage.setItem('magepunk_repel_v1', '99999');   // no random encounter mid-check
			localStorage.setItem('magepunk_rival', 'BLUE');       // the intro names the rival; a mid-game save has one
		}, STATE, R.region, LEAD);

		// 1. boot into the hub town
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${R.map}&x=${R.door[0]}&y=${R.door[1] + 2}`, { waitUntil: 'domcontentloaded' });
		let booted = false;
		for (let i = 0; i < 200 && !booted; i++) { booted = await page.evaluate(() => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data)).catch(() => false); if (!booted) await sleep(200); }
		await sleep(2000);
		const town = await page.evaluate(() => { const W = window.__ow; return { map: W.world.current.name, w: W.world.current.layout.width, npcs: (W.npcs.list || []).filter(n => !n.hidden).length, bgm: typeof W.bgmNow === 'function' ? W.bgmNow() : null }; }).catch(e => ({ err: e.message }));
		A(booted && town.map === R.map && town.w > 0 && town.npcs > 0, `${tag}: ${R.map} boots with its layout and townsfolk`, JSON.stringify(town));

		// Settle whatever the game starts on its own between checks, as a player would:
		// dialogs, cutscenes, and battles. Mid-game, the recurring cross-region RIVAL
		// ambushes you on arrival in a town once he's due (Rustboro, after the PC).
		const events = [];
		const settle = async (ms = 20000) => {
			const t = Date.now();
			while (Date.now() - t < ms) {
				const st = await page.evaluate(() => { const W = window.__ow, a = W.battle.active; return { d: W.dialog.blocking, c: W.cutscene.blocking, b: W.battle.blocking, name: a?.info?.displayName || (a ? 'wild ' + a.foe?.speciesId : null) }; });
				if (!st.d && !st.c && !st.b) return;
				if (st.b && st.name && !events.includes(st.name)) events.push(st.name);
				await page.evaluate(() => {
					try {
						const W = window.__ow, b = W.battle, a = b.active;
						if (b.blocking && a) { if (a.phase === 'menu') a.menuIdx = 0; if (a.phase === 'moves') a.moveIdx = 0; if (['bag', 'switch'].includes(a.phase)) b.key('x'); else b.key('z'); return; }
						W.dialog.revealed = 1e9; W.dialog.key('z');
					} catch (e) {}
				});
				await sleep(90);
			}
		};
		await settle();

		// 2. a real step
		const step = await page.evaluate(async () => {
			const W = window.__ow, p = W.player, w = W.world;
			const from = [p.tx, p.ty];
			const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
			const dir = Object.keys(dirs).find(d => { const [dx, dy] = dirs[d]; return w.isPassable(p.tx + dx, p.ty + dy) && !w.warpAt(p.tx + dx, p.ty + dy) && !(W.npcs.list || []).some(n => n.tx === p.tx + dx && n.ty === p.ty + dy); });
			if (!dir) return { from, dir: null };
			W.pumpPlayer(dir, 0.6);
			await new Promise(r => setTimeout(r, 700));
			return { from, dir, to: [p.tx, p.ty] };
		});
		A(step.dir && (step.to[0] !== step.from[0] || step.to[1] !== step.from[1]), `${tag}: a real step moves the player`, JSON.stringify(step));

		// 3. talk to a townsperson
		const talk = await page.evaluate(async () => {
			const W = window.__ow, p = W.player, w = W.world;
			const dirs = [['up', 0, 1], ['down', 0, -1], ['left', 1, 0], ['right', -1, 0]];   // stand on the opposite side, facing them
			for (const n of (W.npcs.list || [])) {
				if (n.hidden || !n.ev?.script || W.trainers.list.includes(n)) continue;
				for (const [face, dx, dy] of dirs) {
					const sx = n.tx + dx, sy = n.ty + dy;
					if (!w.isPassable(sx, sy) || w.warpAt(sx, sy)) continue;
					p.tx = sx; p.ty = sy; p.px = sx * 16; p.py = sy * 16; p.facing = face; p.moving = false;
					W.interact();
					await new Promise(r => setTimeout(r, 400));
					if (W.dialog.blocking || W.cutscene.blocking) return { npc: n.ev.local_id || n.ev.graphics_id, spoke: true };
				}
			}
			return { spoke: false };
		});
		A(talk.spoke, `${tag}: talking to a townsperson opens their dialog`, JSON.stringify(talk));
		await settle();

		// 4. walk into the POKeMON CENTER door, then back out over the exit mat
		const inside = await page.evaluate(async (door) => {
			const W = window.__ow, p = W.player;
			p.tx = door[0]; p.ty = door[1] + 1; p.px = p.tx * 16; p.py = p.ty * 16; p.facing = 'up'; p.moving = false;
			W.pumpPlayer('up', 0.6);
			for (let i = 0; i < 60 && W.world.current.name.indexOf('City') >= 0 && !/Pokecenter|PokemonCenter/i.test(W.world.current.name); i++) await new Promise(r => setTimeout(r, 100));
			await new Promise(r => setTimeout(r, 800));
			return { map: W.world.current.name, id: W.world.current.map.id };
		}, R.door);
		A(R.pc.test(inside.id || ''), `${tag}: walking into the POKeMON CENTER door enters it`, JSON.stringify(inside));
		await settle();
		const out = await page.evaluate(async (town) => {
			const W = window.__ow, p = W.player;
			const exit = (W.world.current.map.warp_events || []).find(w => w.dest_map && W.world.fileFor(w.dest_map) === town) || (W.world.current.map.warp_events || [])[0];
			if (!exit) return { exit: null };
			p.tx = +exit.x; p.ty = +exit.y - 1; p.px = p.tx * 16; p.py = p.ty * 16; p.facing = 'down'; p.moving = false;
			W.pumpPlayer('down', 0.6);
			for (let i = 0; i < 60 && W.world.current.name !== town; i++) await new Promise(r => setTimeout(r, 100));
			await new Promise(r => setTimeout(r, 800));
			return { map: W.world.current.name };
		}, R.map);
		A(out.map === R.map, `${tag}: the exit mat leads back to ${R.map}`, JSON.stringify(out));
		await settle();

		// 5. a wild battle from the next route's own table (on a quiet overworld)
		await settle();
		if (events.length) console.log(`   (${tag}: the game started on its own: ${events.join(', ')})`);
		const wild = await page.evaluate(async (route) => {
			const W = window.__ow, b = W.battle;
			if (b.blocking) return { busy: b.active?.info?.displayName || 'battle' };
			const slot = W.encounters.data?.[route]?.land?.slots?.[0];
			if (!slot) return { slot: null };
			W.startWildBattle({ id: slot.id, level: slot.min });
			for (let i = 0; i < 100 && !b.active; i++) await new Promise(r => setTimeout(r, 100));
			const started = !!b.active, foe = b.active?.foe?.speciesId;
			for (let i = 0; i < 500 && b.blocking; i++) {
				const a = b.active;
				if (a && a.phase === 'menu') a.menuIdx = 0;
				if (a && a.phase === 'moves') a.moveIdx = 0;
				if (a && ['bag', 'switch'].includes(a.phase)) b.key('x'); else b.key('z');
				await new Promise(r => setTimeout(r, 80));
			}
			return { species: slot.id, started, foe, ended: !b.blocking };
		}, R.route);
		A(wild.started && wild.foe === wild.species && wild.ended, `${tag}: a wild ${wild.species || '?'} from ${R.route} starts and the battle ends`, JSON.stringify(wild));
		await settle();

		// 6. the position is saved
		await page.evaluate(() => { try { window.__ow.savePos?.(); } catch (e) {} });
		await sleep(800);
		const pos = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('magepunk_pos_v1') || 'null'); } catch (e) { return null; } });
		A(pos && pos.map === R.map, `${tag}: the position is saved on ${R.map}`, JSON.stringify(pos));

		// 7. clean
		A(errors.length === 0, `${tag}: no uncaught page error`, JSON.stringify(errors.slice(0, 2)));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
