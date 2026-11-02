// micasurvivor_dive_test.mjs — MicaSurvivor Dive V2: Expedition · Dive, playable (micasurvivor/js/expedition/dive.js;
// Plans/MICASURVIVOR_DIVE_MODE_PLAN.md 2.1 / 2.5 / 2.7). A static server, headless Chrome, a fixed guest profile.
//   1. the menu: Expedition · Dive is playable; a click starts a run on its route (dive:forest), floor 1 of G.DiveGen
//   2. floor 1: the player stands on the spawn; the foe groups sleep where they were put and wake when you come near
//   3. the lost Pokémon: reaching it rescues it (on your stake)
//   4. the stairs: standing on them takes you to floor 2 (a new zone, the old foes gone)
//   5. floor 5: the alpha seals the stairs; its fall secures the loot (the stake banked) and opens them
//   6. floor 10: the Escape Rope circle; standing still in it 3 s ends the run, ESCAPED: the pay is bank + stake, through
//      the shared wallet (the base save's Pokémonedas), the Expedition save has dive.forest.best = 10; a hit cancels it
//   7. a faint: the pay is the bank + a quarter of the stake
//   8. a viewer rebuilds the same floor from the zone block (core.js applyX); another route paints and plans its own
//   9. the species curve: every non-legendary species can come as a foe somewhere; the guardians are legendaries
//   node overworld/tests/micasurvivor_dive_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites.)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8949;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});

const SAVE = {
	v: 3, name: 'Trainer', created: 1, updated: 1, coins: 500,
	owned: { 4: { at: 1, from: 'starter' }, 25: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 4, partnerShiny: false, starter: 4, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true,
	pupg: { 4: { hp: 10, atk: 10, def: 8, regen: 5, cd: 8, spd: 8, magnet: 6, xp: 8, coins: 8, crit: 10, size: 6, moves: 1, revive: 2, reroll: 5, bag: 1 } },
};

const BEFORE = (save) => {
	const H = window.__t = { frozen: false, pending: null };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	try {
		localStorage.setItem('micasurvivor_dev', 'ddive2');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
	} catch (e) { /* the test reports a boot failure */ }
	H.sturdy = () => { const pl = G.Game.player; pl.gainXp = () => 0; return pl; };
	H.unblock = () => {
		if (G.ExpEco && G.ExpEco.pick) { try { G.ExpEco.closePick(); } catch (e) { /* */ } }
		if (G.Game.state === 'choice' || G.UI.isOpen('scr-item')) { const c = [...document.querySelectorAll('#item-cards .card')].pop(); if (c) c.click(); }
	};
	H.step = (n, dt = 1 / 30, fn) => { for (let i = 0; i < n; i++) { H.unblock(); if (G.Game.state === 'over' || G.Game.state === 'ui') return i; G.Game.debugStep(1, dt); if (fn && fn(i) === false) return i + 1; } return n; };
	H.TS = () => G.World.TS;
	H.wpos = p => { const z = G.World.zone; return [(p[0] + z.x0) * H.TS() + H.TS() / 2, (p[1] + z.y0) * H.TS() + H.TS() / 2]; };
	H.put = (x, y) => { const pl = G.Game.player; pl.x = x; pl.y = y; pl.zMask = null; pl.air = null; G.Camera.x = x; G.Camera.y = y; };
	H.thin = () => { for (const e of G.EnemyMgr.all()) if (!e.boss && !e.xk && !e.dead) { e.dead = true; e.fade = 0; } };
	H.toStairs = () => { const L = G.World.zone.dive, [x, y] = H.wpos(L.stairs); H.put(x, y); };
	/** down to floor f: thin, beat any alpha / guardian, the stairs */
	H.downTo = f => {
		let n = 0;
		while (G.ExpDive.run && G.ExpDive.run.floor < f && n++ < 400) {
			H.thin();
			const S = G.ExpDive.run;
			if (S.boss && !S.boss.dead) { S.boss.hurt(S.boss.maxHp * 2); H.step(2); }
			const f0 = S.floor;
			H.toStairs(); H.step(24, 1 / 30, () => { if (G.ExpDive.run.floor !== f0) return false; H.toStairs(); });
		}
		return G.ExpDive.run && G.ExpDive.run.floor;
	};
};

const T0 = Date.now();
await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	async function bootPage() {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument(BEFORE, SAVE);
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		const visible = id => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
		if (await visible('tap-start')) await page.click('#tap-start');
		const menu = await waitFor(() => visible('scr-menu'), 15000);
		await page.evaluate(() => { G.Audio.sfx = () => {}; G.Audio.music = () => {}; });
		return { ctx, page, menu, visible };
	}
	const shoot = async (page, name, ms = 500) => {
		if (!SHOTS) return;
		await page.evaluate(() => window.__t.thaw());
		await sleep(ms);
		fs.mkdirSync(SHOTS, { recursive: true });
		await page.screenshot({ path: path.join(SHOTS, name) });
		await page.evaluate(() => window.__t.freeze());
		console.log('     screenshot: ' + path.join(SHOTS, name));
	};
	const E = async (page, fn, ...args) => { try { return await page.evaluate(fn, ...args); } catch (e) { return { error: String(e && e.message || e).slice(0, 400) }; } };

	// ======================== 1. the menu
	const d0 = await bootPage();
	const { page } = d0;
	A(d0.menu, 'boots to the menu as a guest');
	await page.click('#scr-menu [data-go=modes]');
	A(await waitFor(() => d0.visible('scr-modes'), 3000), 'the menu opens "Choose a mode"');
	await sleep(250);
	const card = await E(page, () => { const b = document.querySelector('#modes-exp [data-exp=exp-dive]'); return b && { soon: b.classList.contains('soon'), aria: b.getAttribute('aria-disabled'), txt: b.innerText.replace(/\s+/g, ' ').trim() }; });
	A(card && !card.soon && card.aria !== 'true' && /^Expedition · Dive .*floor by floor/.test(card.txt), 'Expedition · Dive is playable: no "Coming soon", in English', JSON.stringify(card));
	await page.click('#modes-exp [data-exp=exp-dive]');
	A(await waitFor(() => E(page, () => G.Game.state === 'playing' && G.ExpDive && !!G.ExpDive.run), 15000), 'a click starts a Dive run');
	const st = await E(page, () => {
		window.__t.freeze();
		const z = G.World.zone, S = G.ExpDive.run, pl = window.__t.sturdy();
		return { mode: G.Modes.run.mode, map: G.Modes.run.map, dv: G.Modes.run.dv, zmap: z && z.map, floor: z && z.zone, dive: !!(z && z.dive), runFloor: S.floor,
			route: S.route, px: pl.x, py: pl.y, onFloor: G.World.maskAt(Math.floor(pl.x / G.World.TS), Math.floor(pl.y / G.World.TS)) > 0, foes: G.EnemyMgr.all().filter(e => !e.dead).length,
			groups: S.groups.length, lost: !!S.lost, line: G.ExpClassic.hudLine(pl) };
	});
	A(st.mode === 'exp-dive' && st.map === 'dive:forest' && st.zmap === 'dive:forest' && st.floor === 1 && st.dive && st.runFloor === 1 && st.route === 'forest', 'the run: exp-dive on dive:forest, floor 1 of G.DiveGen', JSON.stringify(st));
	A(st.onFloor && st.px === 0 && st.py === 0, 'the player starts on the spawn (the world origin, a floor tile)', JSON.stringify(st));
	A(st.foes >= 4 && st.groups >= 2 && st.lost, `the floor's foe groups (${st.groups}, ${st.foes} foes) and its lost Pokémon`, JSON.stringify(st));
	const onf = await E(page, () => {
		const H = window.__t, S = G.ExpDive.run, L = G.World.zone.dive, TS = H.TS();
		const floorAt = ([x, y]) => { const tx = Math.floor(x / TS), ty = Math.floor(y / TS); return G.World.maskAt(tx, ty) > 0 && G.World.zone.terr(tx, ty) === 0; };
		const pts = { stairs: H.wpos(L.stairs), lost: [S.lost.x, S.lost.y] };
		S.groups.forEach((g, i) => { pts['g' + i] = g.at; });
		const bad = Object.entries(pts).filter(([, p]) => !floorAt(p)).map(([k]) => k);
		return { bad, n: Object.keys(pts).length };
	});
	A(onf.bad && onf.bad.length === 0, `the stairs, the lost Pokémon and every group stand on floor tiles in the world (${onf.n})`, JSON.stringify(onf));
	A(/^FLOOR 1 · MOSSY WOODS · 0 secured · 0 at stake$/.test(st.line), 'the HUD line: FLOOR 1 · MOSSY WOODS · 0 secured · 0 at stake', st.line);

	await shoot(page, 'dive_floor1.png');
	// ======================== 2. sleeping groups
	const sl = await E(page, () => {
		const H = window.__t, S = G.ExpDive.run, g = S.groups.slice().sort((a, b) => Math.hypot(b.at[0], b.at[1]) - Math.hypot(a.at[0], a.at[1]))[0], e0 = g.list[0], x0 = e0.x, y0 = e0.y;   // (the farthest group)
		H.step(60);
		const still = Math.hypot(e0.x - x0, e0.y - y0) < 1 && !g.awake;
		// a floor tile 4-6 tiles from the group
		const TS = H.TS(), gx = Math.floor(g.at[0] / TS), gy = Math.floor(g.at[1] / TS);
		let spot = null;
		for (let r = 4; r <= 6 && !spot; r++) for (let a = 0; a < 16 && !spot; a++) { const tx = gx + Math.round(Math.cos(a / 16 * 6.2832) * r), ty = gy + Math.round(Math.sin(a / 16 * 6.2832) * r); if (G.World.maskAt(tx, ty) > 0 && G.World.zone.terr(tx, ty) === 0) spot = [tx * TS + TS / 2, ty * TS + TS / 2]; }
		H.put(spot[0], spot[1]); H.step(2);
		const woke = g.awake, d0 = Math.min(...g.list.map(e => Math.hypot(e.x - G.Game.player.x, e.y - G.Game.player.y)));
		H.step(30, 1 / 30, () => { H.put(spot[0], spot[1]); });
		const d1 = Math.min(...g.list.filter(e => !e.dead).map(e => Math.hypot(e.x - G.Game.player.x, e.y - G.Game.player.y)));
		return { still, woke, d0: Math.round(d0), d1: Math.round(d1), xm: g.list.map(e => !!e.xmove) };
	});
	A(sl.still, 'a far group sleeps where it was put (no move in 2 s)', JSON.stringify(sl));
	A(sl.woke && sl.d1 < sl.d0 - 8 && sl.xm.every(x => !x), 'coming close wakes the group and it comes at you', JSON.stringify(sl));

	// ======================== 3. the lost Pokémon
	const rs = await E(page, () => {
		const H = window.__t, S = G.ExpDive.run, s0 = S.stake;
		H.thin(); H.put(S.lost.x, S.lost.y); H.step(2);
		return { done: S.lost.done, rescued: S.rescued.slice(), stake: S.stake - s0 };
	});
	A(rs.done && rs.rescued.length === 1 && rs.stake >= 12, 'reaching the lost Pokémon rescues it and puts loot at stake', JSON.stringify(rs));

	// ======================== 4. the stairs
	const s2 = await E(page, () => {
		const H = window.__t, h1 = G.World.zone.hash;
		H.thin(); H.toStairs(); H.step(24, 1 / 30, () => { if (G.ExpDive.run.floor !== 1) return false; H.toStairs(); });
		const S = G.ExpDive.run, pl = G.Game.player;
		return { floor: S.floor, zone: G.World.zone.zone, newZone: G.World.zone.hash !== h1, px: pl.x, py: pl.y, foes: G.EnemyMgr.all().filter(e => !e.dead && e.xdive != null).length, oldFoes: G.EnemyMgr.all().filter(e => !e.dead && e.xdive == null && !e.xk).length };
	});
	A(s2.floor === 2 && s2.zone === 2 && s2.newZone && s2.px === 0 && s2.py === 0 && s2.foes > 0, 'the stairs take you down to floor 2 (a new zone, at its spawn, its own foes)', JSON.stringify(s2));

	// ======================== 5. the alpha (floor 5)
	const al = await E(page, () => {
		const H = window.__t;
		H.downTo(5);
		const S = G.ExpDive.run, b = S.boss;
		const out = { floor: S.floor, alpha: !!b && b.xk === 'alpha', sealed: S.sealed, scale: b && b.scale };
		H.thin(); H.toStairs(); H.step(30, 1 / 30, () => { H.toStairs(); });
		out.stillOn5 = S.floor === 5;
		const stake = S.stake, bank = S.bank;
		b.hurt(b.maxHp * 2); H.step(3);
		out.stakeAfter = S.stake; out.secured = S.bank >= bank + stake + 25 && S.stake < 10;   // (the stake + the alpha's own loot banked; a KO or two may land after)
		out.bank = S.bank; out.unsealed = !S.sealed;
		H.toStairs(); H.step(24, 1 / 30, () => { if (S.floor !== 5) return false; H.toStairs(); });
		out.after = S.floor;
		return out;
	});
	if (SHOTS) {
		await E(page, () => { const H = window.__t; H.thin(); H.toStairs(); G.Game.player.y += 60; });
		await shoot(page, 'dive_floor6_stairs.png');
	}
	A(al.floor === 5 && al.alpha && al.sealed && al.scale > 1.4, 'floor 5: an alpha (x1.45) seals the stairs', JSON.stringify(al));
	A(al.stillOn5, 'the sealed stairs don\'t take you down', JSON.stringify(al));
	A(al.secured && al.unsealed && al.after === 6, 'its fall banks the whole stake and opens the stairs (floor 6)', JSON.stringify(al));

	// ======================== 6. the Escape Rope (floor 10)
	const rp = await E(page, () => {
		const H = window.__t;
		H.downTo(10);
		const S = G.ExpDive.run, L = G.World.zone.dive, [rx, ry] = H.wpos(L.spawn);
		const out = { floor: S.floor, rope: L.cadence.rope };
		H.thin();
		const b = S.boss; if (b) { b.hurt(b.maxHp * 2); H.step(2); }
		S.stake += 40;   // something at stake to carry out
		out.bank = S.bank; out.stake = S.stake;
		// a hit cancels it
		H.put(rx, ry); H.step(45);
		const t1 = S.ropeT;
		G.Hooks.call('player.hurt', 5, G.Game.player, 'normal'); H.step(1);
		out.cancel = t1 > 1 && S.ropeT < 0.1;
		out.coins0 = G.DB.save.coins;
		H.put(rx, ry);
		H.step(120);
		out.state = G.Game.state; out.over = G.Game.state !== 'playing'; out.escaped = S.escaped;
		out.pay = G.ExpDive.pay();
		return out;
	});
	A(rp.floor === 10 && rp.rope, 'floor 10 has the rope circle', JSON.stringify(rp));
	A(rp.cancel, 'a hit cancels the rope', JSON.stringify(rp));
	A(rp.escaped && rp.over && rp.pay === rp.bank + rp.stake, 'standing still in it ends the run ESCAPED; the pay is bank + stake', JSON.stringify(rp));
	await sleep(400);
	const end = await E(page, () => ({ coins: G.DB.save.coins, best: G.ExpSave.get('dive.forest.best'), runs: G.ExpSave.get('dive.runs'), esc: G.ExpSave.get('dive.escapes'), txt: (document.getElementById('scr-over') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 600) }));
	A(end.coins > rp.coins0 && end.best === 10 && end.runs === 1 && end.esc === 1, 'the Pokémonedas land in the shared wallet; the Expedition save keeps dive.forest.best = 10, a run, an escape', JSON.stringify(end));
	A(/Dive · Mossy Woods: floor 10/.test(end.txt) && /You escaped/.test(end.txt) && !/Piso|asegurado|Escapaste/.test(end.txt), 'the run-over screen says it in English', end.txt);

	// ======================== 7. a faint
	const ft = await E(page, async () => {
		const H = window.__t;
		G.Game.toUI && G.Game.toUI();
		await G.Flow.play('exp-dive'); H.freeze(); H.sturdy();
		H.downTo(3);
		const S = G.ExpDive.run;
		S.bank = 100; S.stake = 81;
		const coins0 = G.DB.save.coins;
		G.Game.endRun(true);
		return { pay: G.ExpDive.pay(), escaped: S.escaped, coins0 };
	});
	A(ft.pay === 100 + 20 && !ft.escaped, 'a faint pays the bank + a quarter of the stake (100 + 81 -> 120)', JSON.stringify(ft));

	// ======================== 8. viewers and routes
	const vw = await E(page, async () => {
		const seed = 12345, z0 = G.ExpClassic.build(seed, 'dive:reef', 7), z1 = G.ExpClassic.build(seed, 'dive:reef', 7), z2 = G.ExpClassic.build(seed, 'dive:reef', 8);
		G.Expedition.diveRoute('reef');
		const plan = G.Modes.plan('exp-dive');
		G.Expedition.diveRoute('forest');
		return { same: z0.hash === z1.hash, other: z0.hash !== z2.hash, w: z0.w, h: z0.h, plan: plan.map, biome: G.ExpTerrain.biomeOf('dive:reef') === G.ExpTerrain.biomeOf('cerulean'), floorDive: !!z0.dive };
	});
	A(vw.same && vw.other && vw.w === 56 && vw.h === 40 && vw.floorDive, 'a viewer rebuilds the same floor from {seed, dive:<route>, floor} (classic.build -> G.DiveGen)', JSON.stringify(vw));
	A(vw.plan === 'dive:reef' && vw.biome, 'the route pick plans its map (dive:reef) and paints in its look (the sea)', JSON.stringify(vw));

	// ======================== 9. the species
	const sp = await E(page, () => {
		const D = G.ExpDive, seen = new Set();
		for (const r of G.DiveGen.ROUTE_IDS) for (let f = 1; f <= 120; f += 1) for (const [dex] of D.pool(r, f).list) seen.add(dex);
		const nonLeg = G.DEX.filter(p => !p.leg).map(p => p.dex), missing = nonLeg.filter(d => !seen.has(d));
		const legs = Object.values(D.GUARDIANS).flat(), legOk = legs.every(d => G.DEX_BY[d] && G.DEX_BY[d].leg);
		const anyLeg = [...seen].some(d => G.DEX_BY[d].leg);
		return { seen: seen.size, nonLeg: nonLeg.length, missing: missing.slice(0, 10), legOk, guardians: legs.length, anyLeg, t1: D.target(1), t25: D.target(25), t100: Math.round(D.target(100)) };
	});
	A(sp.missing.length === 0 && !sp.anyLeg, `every non-legendary species can come as a foe (${sp.seen} / ${sp.nonLeg}); no legendary ever does`, JSON.stringify(sp));
	A(sp.legOk && sp.guardians === 32, 'the 32 route guardians are legendaries', JSON.stringify(sp));
	A(sp.t1 === 272 && sp.t25 === 560 && sp.t100 > 580 && sp.t100 < 620, 'PokéDive\'s depth curve: 272 on floor 1, 560 on 25, toward 620 below', JSON.stringify(sp));

	const pageErrs = errors.filter(e => !/AudioContext|play\(\) failed|NotAllowedError/.test(e));
	A(pageErrs.length === 0, 'no page errors', pageErrs.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
