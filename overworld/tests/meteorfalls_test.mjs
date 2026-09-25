// meteorfalls_test.mjs — the rested Meteor Falls scene still clears the Route 112 guards.
//
// Playtest 2026-09-25: STORY_SEED keeps the Meteor Falls meteorite-theft scene
// rested (VAR_METEOR_FALLS_STATE = 1), but that scene was the only thing that set
// FLAG_HIDE_ROUTE_112_TEAM_MAGMA, so the two grunts guarding the Route 112 cable car
// never left and the road to Mt. Chimney / Lavaridge was cut. The fix applies the
// scene's lasting OUTCOMES (not its choreography) on entering Meteor Falls while it
// is rested, plus a one-time save repair for saves that already went through.
//
// Scenarios, each in a fresh browser context:
//   A. an OLD save (met Cozmo, scene rested, guards still up): repaired at boot;
//      the guards are gone and the cable-car door is reachable and walkable
//   B. a NEW save: guards up until Meteor Falls; entering applies the outcomes (the
//      thieves leave the cave too), survives a reload, repeat entry is a no-op, and
//      Route 112 is open afterwards
//   C. the scene NOT rested (var 0): entering applies nothing (the real scene runs)
//   in all of them Mt. Chimney's own Magma/Aqua flags are untouched
//
//   node overworld/tests/meteorfalls_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const puppeteer = (await import('puppeteer-core')).default;
const http = await import('http');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9127;
const STATE = { username: 'meteor', friendCode: 'METEO0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		for await (const _ of req) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [], rows: [], ow: null }));
	}
	fs.readFile(path.join(ROOT, u === '/' ? '/index.html' : u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(u)] || 'application/octet-stream' });
		res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LEAD = { speciesId: 'lapras', name: 'LAPRAS', level: 50, gender: 'M', friend: 70, types: ['Water', 'Ice'], ability: 'waterabsorb',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 190, atk: 105, def: 95, spa: 105, spd: 115, spe: 75 },
	maxHP: 190, curHP: 190, exp: 125000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's131.png', num: 131 };
const GUARDS = ['LOCALID_ROUTE112_GRUNT_1', 'LOCALID_ROUTE112_GRUNT_2'];
const CHIMNEY = ['FLAG_HIDE_MT_CHIMNEY_TEAM_MAGMA', 'FLAG_HIDE_MT_CHIMNEY_TEAM_AQUA'];

async function scenario(browser, story) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, story, lead) => {
		if (sessionStorage.getItem('seeded')) return;   // seed once; reloads keep the game's own writes
		sessionStorage.setItem('seeded', '1');
		localStorage.setItem('magepunk_mp_token_v1', 'meteor-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_rival', 'MAY');
		localStorage.setItem('magepunk_story', JSON.stringify(story));
		localStorage.setItem('magepunk_party_v1', JSON.stringify([lead]));
		localStorage.setItem('magepunk_repel_v1', '99999');
	}, STATE, story, LEAD);
	const boot = async (map, x, y) => {
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 200 && !(await page.evaluate(() => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data)).catch(() => false)); i++) await sleep(200);
		await sleep(2000);
	};
	const go = async (map, x, y) => { await page.evaluate(async (m, x, y) => { await window.__ow.moveToMap(m, x, y); }, map, x, y); await sleep(1500); };
	const flags = names => page.evaluate(ns => Object.fromEntries(ns.map(n => [n, !!window.__ow.Story.getFlag(n)])), names);
	const present = ids => page.evaluate(ids => (window.__ow.npcs.list || []).filter(n => !n.hidden && ids.includes(n.ev.local_id)).map(n => n.ev.local_id), ids);
	return { ctx, page, errors, boot, go, flags, present };
}
const base = (vars, flags) => ({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...flags }, vars });

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// ===== A. an old save: went through Meteor Falls before the fix =====
	{
		const S = await scenario(browser, base({ VAR_METEOR_FALLS_STATE: 1 }, { FLAG_MET_PROF_COZMO: true }));
		await S.boot('Route112', 28, 31);
		const f = await S.flags(['FLAG_HIDE_ROUTE_112_TEAM_MAGMA', 'FLAG_MET_ARCHIE_METEOR_FALLS', 'FLAG_HIDE_METEOR_FALLS_TEAM_MAGMA', ...CHIMNEY]);
		A(f.FLAG_HIDE_ROUTE_112_TEAM_MAGMA && f.FLAG_MET_ARCHIE_METEOR_FALLS && f.FLAG_HIDE_METEOR_FALLS_TEAM_MAGMA,
			"A: an old save (met Cozmo, scene rested) is repaired at boot", JSON.stringify(f));
		A(!f.FLAG_HIDE_MT_CHIMNEY_TEAM_MAGMA && !f.FLAG_HIDE_MT_CHIMNEY_TEAM_AQUA, "A: Mt. Chimney's own Magma/Aqua flags are untouched", JSON.stringify(f));
		A((await S.present(GUARDS)).length === 0, 'A: the two Route 112 cable-car guards are gone');
		// walk to the station door along the real path (the guards stood on its
		// approach tiles, (26,30)/(27,30); (28,30) is wall), a step at a time
		const walked = await S.page.evaluate(async () => {
			const W = window.__ow, p = W.player, w = W.world;
			const door = (w.current.map.warp_events || []).find(e => /CABLE_CAR/.test(e.dest_map));
			const goal = [+door.x, +door.y];
			const occ = (x, y) => (W.npcs.list || []).some(n => !n.hidden && n.tx === x && n.ty === y);
			const start = [28, 31], key = (x, y) => x + ',' + y, prev = new Map([[key(...start), null]]), q = [start];
			while (q.length) {
				const [x, y] = q.shift();
				if (x === goal[0] && y === goal[1]) break;
				for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
					const nx = x + dx, ny = y + dy, k = key(nx, ny);
					if (prev.has(k)) continue;
					if (!(nx === goal[0] && ny === goal[1]) && (!w.isPassable(nx, ny) || occ(nx, ny))) continue;
					prev.set(k, [x, y]); q.push([nx, ny]);
				}
			}
			if (!prev.has(key(...goal))) return { path: null, map: w.current.name };
			const path = []; for (let c = goal; c; c = prev.get(key(...c))) path.unshift(c);
			p.tx = 28; p.ty = 31; p.px = 28 * 16; p.py = 31 * 16; p.moving = false;
			for (let i = 1; i < path.length && !/CableCar/.test(w.current.name); i++) {
				const [x, y] = path[i], dir = x > p.tx ? 'right' : x < p.tx ? 'left' : y > p.ty ? 'down' : 'up';
				p.facing = dir; W.pumpPlayer(dir, 0.6);
				await new Promise(r => setTimeout(r, 450));
			}
			for (let i = 0; i < 20 && !/CableCar/.test(w.current.name); i++) await new Promise(r => setTimeout(r, 100));
			return { steps: path.length - 1, map: w.current.name };
		});
		A(walked.map === 'Route112_CableCarStation', 'A: from (28,31) the player walks the real path into the cable-car station', JSON.stringify(walked));
		A(S.errors.length === 0, 'A: no uncaught page error', JSON.stringify(S.errors.slice(0, 2)));
		await S.ctx.close();
	}

	// ===== B. a new save: the guards leave when you reach Meteor Falls =====
	{
		const S = await scenario(browser, base({ VAR_METEOR_FALLS_STATE: 1 }, {}));
		await S.boot('Route112', 28, 31);
		A((await S.present(GUARDS)).length === 2, 'B: before Meteor Falls the guards stand (vanilla)');
		await S.go('MeteorFalls_1F_1R', 26, 18);
		const f = await S.flags(['FLAG_HIDE_ROUTE_112_TEAM_MAGMA', 'FLAG_MET_ARCHIE_METEOR_FALLS', 'FLAG_HIDE_FALLARBOR_TOWN_BATTLE_TENT_SCOTT', ...CHIMNEY]);
		A(f.FLAG_HIDE_ROUTE_112_TEAM_MAGMA && f.FLAG_MET_ARCHIE_METEOR_FALLS && f.FLAG_HIDE_FALLARBOR_TOWN_BATTLE_TENT_SCOTT,
			"B: entering Meteor Falls applies the rested scene's outcomes", JSON.stringify(f));
		A(!f.FLAG_HIDE_MT_CHIMNEY_TEAM_MAGMA && !f.FLAG_HIDE_MT_CHIMNEY_TEAM_AQUA, "B: Mt. Chimney's own Magma/Aqua flags are untouched");
		A((await S.present(['LOCALID_METEOR_FALLS_MAGMA_GRUNT_1', 'LOCALID_METEOR_FALLS_MAGMA_GRUNT_2'])).length === 0,
			'B: the thieves have left Meteor Falls too (the reporter found them still standing)');
		const var1 = await S.page.evaluate(() => window.__ow.Story.getVar('VAR_METEOR_FALLS_STATE'));
		A(var1 === 1, 'B: the scene var is untouched (the cutscene stays rested)', String(var1));
		// survives a reload, and a repeat entry is a no-op
		await S.boot('MeteorFalls_1F_1R', 26, 18);
		const g = await S.flags(['FLAG_HIDE_ROUTE_112_TEAM_MAGMA', 'FLAG_MET_ARCHIE_METEOR_FALLS']);
		A(g.FLAG_HIDE_ROUTE_112_TEAM_MAGMA && g.FLAG_MET_ARCHIE_METEOR_FALLS, 'B: the outcomes survive a reload', JSON.stringify(g));
		await S.go('Route112', 28, 31);
		A((await S.present(GUARDS)).length === 0, 'B: back on Route 112 the cable-car guards are gone');
		A(S.errors.length === 0, 'B: no uncaught page error', JSON.stringify(S.errors.slice(0, 2)));
		await S.ctx.close();
	}

	// ===== C. the scene not rested: the hook stays out of the way =====
	{
		const S = await scenario(browser, base({ VAR_METEOR_FALLS_STATE: 0 }, {}));
		await S.boot('Route112', 28, 31);
		await S.go('MeteorFalls_1F_1R', 26, 18);
		const f = await S.flags(['FLAG_HIDE_ROUTE_112_TEAM_MAGMA', 'FLAG_MET_ARCHIE_METEOR_FALLS']);
		A(!f.FLAG_HIDE_ROUTE_112_TEAM_MAGMA && !f.FLAG_MET_ARCHIE_METEOR_FALLS, 'C: with the scene live (var 0), entering applies nothing (the real scene runs)', JSON.stringify(f));
		await S.ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
