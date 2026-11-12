// micasurvivor_dive_difficulty_test.mjs — Dive bites (D1, Plans/MICASURVIVOR_3D_PLAN.md).
// The owner: "it is too easy and the enemies aren't strong enough". The old numbers were tuned so a bot that RUNS PAST
// every fight got deep; a player who fights found nothing that could hurt them. A real Dive run in headless Chrome:
//   1. the numbers that ship (K.HP_K 3.3, K.DMG_K 2.4, the wake radius, elites, reinforcements, healing, the deep floors)
//   2. a floor-1 foe really carries them: every plain foe has its base HP x (3.3 + depth) and its base damage x 2.4
//   3. waking: a group sleeps at 12 tiles, wakes at 10, and wakes the group 6 tiles from it (not one 30 tiles away)
//   4. pressure: nothing for 45 s; then packs of 2 arrive 11-20 tiles away, awake, every 14 s and faster; worth little XP,
//      paying no loot (a plain foe still pays) — lingering costs, it does not pay
//   5. healing: a berry bush gives a quarter of your HP, a shrine half
//   6. elites: none on floors 1-5; on floors 6-16 some foes carry exactly one affix's numbers, sleep with their group
//      and are drawn bigger
//   node overworld/tests/micasurvivor_dive_difficulty_test.mjs
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
const PORT = 8967;
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
	// G.Net's message handlers, captured as js/net/coop.js registers its own (so a test can deliver a host frame)
	H.net = [];
	const G0 = window.G = window.G || {};
	let net = null;
	Object.defineProperty(G0, 'Net', { configurable: true, enumerable: true, get() { return net; }, set(v) {
		net = v;
		if (v && typeof v.on === 'function') { const on = v.on; v.on = function (fn) { H.net.push(fn); return on.call(this, fn); }; }
	} });
	H.deliver = (from, msg) => { for (const fn of H.net) fn(from, msg); };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	try {
		localStorage.setItem('micasurvivor_dev', 'ddive2');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
	} catch (e) { /* the test reports a boot failure */ }
	H.sturdy = () => { const pl = G.Game.player; pl.gainXp = () => 0; return pl; };
	H.healBoss = () => { const b = G.ExpDive.run && G.ExpDive.run.boss; if (b && !b.dead) b.hp = b.maxHp; };   // (...and the alpha must outlive the wait)
	H.heal = () => { const pl = G.Game.player; if (pl && !pl.dead) pl.hp = pl.maxHp; };   // (this suite waits beside an alpha)
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
			{ const pl = G.Game.player; if (pl && !pl.dead) pl.hp = pl.maxHp; }   // (the way down is plumbing here, not a fight: D1 made the foes hit hard)
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

	// ======================== a Dive run
	const d0 = await bootPage();
	const { page } = d0;
	A(d0.menu, 'boots to the menu as a guest');
	await page.evaluate(() => G.ModesUI.open());
	await waitFor(() => d0.visible('scr-modes'), 3000);
	await sleep(250);
	await page.click('#modes-exp [data-exp=exp-dive]');
	A(await waitFor(() => E(page, () => G.Game.state === 'playing' && G.ExpDive && !!G.ExpDive.run), 15000), 'a click starts a Dive run');
	await E(page, () => { window.__t.freeze(); window.__t.sturdy(); });

	// ---- 1. the numbers that ship
	const K = await E(page, () => { const k = G.ExpDive.K; return { hp: k.HP_K, dmg: k.DMG_K, wake: k.WAKE_R, chain: k.WAKE_CHAIN, elite: k.ELITE, rein: k.REIN, berry: k.BERRY, deep: k.DEEP, shrine: G.ExpDive.LM.SHRINE_HP, classicBerry: G.ExpEco.K.BERRY }; });
	A(K.hp === 3.3 && K.dmg === 2.4, 'foes are back at Classic\'s strength: HP x3.3, damage x2.4 (was 2.8 / 1.68)', JSON.stringify([K.hp, K.dmg]));
	A(K.wake === 11 && K.chain === 9, 'a group wakes from 11 tiles (was 7) and wakes the groups within 9 of it', JSON.stringify([K.wake, K.chain]));
	A(JSON.stringify(K.elite) === '{"from":6,"p0":0.08,"per":0.008,"max":0.3,"scale":1.22,"xp":2.5,"swift":1.4,"tough":2.4,"rage":1.55}', 'elites: from floor 6, 8 % + 0.8 % a floor up to 30 %; swift x1.4 speed, tough x2.4 HP, rage x1.55 damage; x2.5 XP', JSON.stringify(K.elite));
	A(JSON.stringify(K.rein) === '{"grace":45,"every":14,"faster":1.5,"min":6,"n":2,"perFloors":12,"max":4,"cap":40,"xp":0.3,"near":11,"far":20}', 'reinforcements: 45 s grace, then every 14 s (1.5 s faster each time, 6 s at least), 2-4 a pack 11-20 tiles away, 40 foes at most, x0.3 XP', JSON.stringify(K.rein));
	A(K.berry === 0.25 && K.classicBerry === 0.5 && K.shrine === 0.5, 'healing: a berry bush heals a quarter here (Classic keeps its half); a shrine heals half', JSON.stringify([K.berry, K.classicBerry, K.shrine]));
	A(JSON.stringify(K.deep) === '{"from":25,"hp":0.03,"dmg":0.015,"tierAt":40}', 'past floor 25: +3 % HP and +1.5 % damage a floor; a stats tier more from floor 40', JSON.stringify(K.deep));

	// ---- 2. a floor-1 foe really carries those numbers
	const foe = await E(page, () => {
		const k = G.ExpDive.K, teff = k.T_PER_FLOOR, sc = G.Enemies.scale(teff);
		const plain = G.EnemyMgr.all().filter(e => !e.dead && !e.xk && !e.xaff && !e.xrein);
		// every plain foe's HP is its own species' base x the floor's factor (HP is a whole number: a small foe rounds a few %)
		const C = G.ExpClassic, facs = plain.map(e => { const base = new G.Enemy(C.defOf(e.dex, 0), 0, 0, { hp: sc.hp, dmg: sc.dmg, spd: sc.spd }, false); return [e.maxHp / base.maxHp, e.dmg / base.dmg]; });
		const want = k.HP_K + Math.min(1.7, teff / 210);
		return { n: plain.length, want, hp: facs.map(f => +f[0].toFixed(3)), dmg: facs.map(f => +f[1].toFixed(3)), elites: G.EnemyMgr.all().filter(e => e.xaff).length };
	});
	A(foe.n >= 6 && foe.hp.every(v => Math.abs(v - foe.want) < 0.12) && foe.dmg.every(v => Math.abs(v - 2.4) < 0.01), `every plain foe on floor 1 has x${foe.want && foe.want.toFixed(3)} its base HP (3.3 + depth) and x2.4 its base damage`, JSON.stringify({ n: foe.n, want: foe.want, hp: [...new Set(foe.hp)], dmg: [...new Set(foe.dmg)] }));
	A(foe.elites === 0, 'no elites before floor 6', String(foe.elites));

	// ---- 3. waking: from 11 tiles, and the neighbours within 9 tiles of the woken group (one hop)
	const wk = await E(page, () => {
		const H = window.__t, S = G.ExpDive.run, TS = H.TS(), pl = G.Game.player, out = {};
		const gs = S.groups;
		if (gs.length < 3) return { skip: gs.length };
		// lay three groups out on a line, far from everything: A at 0, B 6 tiles on (within the chain), C 30 tiles on (not)
		const [A, B, C] = gs, far = 1e6;
		for (const g of gs) g.at = [far + 9999 * gs.indexOf(g), far];
		A.at = [far, far]; B.at = [far + 6 * TS, far]; C.at = [far + 30 * TS, far];
		const step = () => G.Game.debugStep(1, 1 / 30);
		const freeze = () => { for (const e of G.EnemyMgr.all()) e.frozenT = 9; };
		H.put(far - 12 * TS, far); freeze(); step();
		out.at12 = [A.awake, B.awake, C.awake];
		H.put(far - 10 * TS, far); freeze(); step();
		out.at10 = [A.awake, B.awake, C.awake];
		out.sleepersFreed = A.list.filter(e => e && !e.dead).every(e => e.xmove == null) && B.list.filter(e => e && !e.dead).every(e => e.xmove == null);
		out.cStill = C.list.filter(e => e && !e.dead).every(e => typeof e.xmove === 'function');
		return out;
	});
	if (wk.skip !== undefined) A(false, 'the floor has at least 3 groups to test waking with', JSON.stringify(wk));
	else {
		A(JSON.stringify(wk.at12) === '[false,false,false]', '12 tiles from a sleeping group: nobody stirs', JSON.stringify(wk.at12));
		A(JSON.stringify(wk.at10) === '[true,true,false]' && wk.sleepersFreed && wk.cStill, '10 tiles: it wakes, and so does the group 6 tiles from it; the one 30 tiles away sleeps on', JSON.stringify(wk));
	}

	// ---- 4. pressure: nothing for 45 s, then packs at the entrance, awake, worth little and paying nothing
	const rein = await E(page, () => {
		const H = window.__t, S = G.ExpDive.run, pl = G.Game.player, out = { say: [] };
		const say0 = G.Spawner.say; G.Spawner.say = (t, s) => { out.say.push(String(t)); return say0.call(G.Spawner, t, s); };
		const rein = () => G.EnemyMgr.all().filter(e => !e.dead && e.xrein);
		const keep = () => { pl.hp = pl.maxHp; for (const e of G.EnemyMgr.all()) if (!e.dead) e.frozenT = 9; };   // (nobody fights: this counts arrivals)
		const [sx, sy] = H.wpos(S.L.stairs); H.put(sx - 4 * H.TS(), sy);   // far from the entrance
		const run = secs => { for (let i = 0; i < secs * 30; i++) { keep(); H.unblock(); G.Game.debugStep(1, 1 / 30); } };
		const t0 = S.now - S.ft;
		run(Math.max(0, 43 - t0)); out.before = rein().length; out.tBefore = +(S.now - S.ft).toFixed(1);
		run(3.5); out.first = rein().length; out.tFirst = +(S.now - S.ft).toFixed(1);
		const r1 = rein();
		out.where = r1.map(e => +(Math.hypot(e.x - pl.x, e.y - pl.y) / H.TS()).toFixed(1));   // (tiles from you, a few steps after it arrived)
		out.near = r1.length > 0 && out.where.every(d => d > 6 && d < 23);
		out.awake = r1.every(e => e.xmove == null);
		const plainXp = G.EnemyMgr.all().filter(e => !e.dead && !e.xrein && !e.xk && !e.xaff).map(e => e.xp), reXp = r1.map(e => e.xp);
		out.xp = [Math.max(...reXp), Math.min(...plainXp)];
		run(13); out.t2 = rein().length;      // 14 s after the first
		run(13); out.t3 = rein().length;      // 12.5 s after the second
		// what a KO pays: a reinforcement nothing, a plain foe the floor's KO loot
		const stake = () => S.stake;
		const s0 = stake(); const re = rein()[0]; if (!re) { out.noRein = true; G.Spawner.say = say0; return out; } re.frozenT = 0; re.hurt(re.maxHp * 3); G.Game.debugStep(2, 1 / 30); out.reinPay = +(stake() - s0).toFixed(4);
		const s1 = stake(); // (a floor can be left with no plain foe alive by now: then there is no one to knock out, and that half is not judged)
		const pf = G.EnemyMgr.all().find(e => !e.dead && !e.xrein && !e.xk); if (pf) { pf.frozenT = 0; pf.hurt(pf.maxHp * 3); G.Game.debugStep(2, 1 / 30); out.plainPay = +(stake() - s1).toFixed(4); } else out.plainPay = null;
		out.kills = S.kills;
		G.Spawner.say = say0;
		return out;
	});
	A(rein.before === 0 && rein.tBefore < 45, `for the first 45 s of a floor no reinforcements come (${rein.tBefore} s: none)`, JSON.stringify(rein));
	A(rein.first === 2 && rein.near && rein.awake, 'then a pack of 2 arrives 11-20 tiles away (not at a far entrance, where the game would recycle it), awake', JSON.stringify(rein));
	A(rein.say.some(t => /reinforcements are coming/.test(t)) && rein.say.filter(t => /reinforcements/.test(t)).length === 1, 'the first pack is announced, once', JSON.stringify(rein.say));
	A(rein.t2 === 4 && rein.t3 === 6, 'another comes 14 s later, the next 12.5 s after that (faster each time)', JSON.stringify([rein.first, rein.t2, rein.t3]));
	A(rein.xp[0] < rein.xp[1] * 0.6, 'a reinforcement is worth well under a plain foe\'s XP (x0.3)', JSON.stringify(rein.xp));
	A(rein.reinPay === 0 && (rein.plainPay === null || rein.plainPay > 0), 'knocking one out pays no loot; a plain foe still does — lingering costs, it does not pay', JSON.stringify([rein.reinPay, rein.plainPay]));

	// ---- 5. healing: a berry bush gives a quarter, a shrine half
	const heal = await E(page, () => {
		const H = window.__t, S = G.ExpDive.run, pl = G.Game.player, out = {};
		for (const e of G.EnemyMgr.all()) if (!e.dead) { e.dead = true; e.fade = 0; }
		pl.regen = 0; if (pl.stats) pl.stats.regen = 0;
		const c = G.ExpEco.cur(), berry = c && c.lay.objs.find(o => o.kind === 'berry' && c.st[o.i] === G.ExpEco.FRESH);
		if (berry) { pl.hp = 1; H.put(berry.x, berry.y); for (let i = 0; i < 20; i++) { H.unblock(); G.Game.debugStep(1, 1 / 30); } out.berry = +((pl.hp - 1) / pl.maxHp).toFixed(3); out.used = c.st[berry.i] === G.ExpEco.USED; }
		S.L.landmark = { kind: 'shrine', at: S.L.spawn.slice() }; S.lmUsed = false; S.lmT = 0;
		const [x, y] = H.wpos(S.L.spawn); pl.hp = 1; H.put(x, y); for (let i = 0; i < 45; i++) { H.unblock(); G.Game.debugStep(1, 1 / 30); }
		out.shrine = +((pl.hp - 1) / pl.maxHp).toFixed(3); out.lmUsed = S.lmUsed;
		S.L.landmark = null;
		return out;
	});
	A(heal.used && Math.abs(heal.berry - 0.25) < 0.03, 'a berry bush on a Dive floor heals a quarter of your HP', JSON.stringify(heal));
	A(heal.lmUsed && Math.abs(heal.shrine - 0.5) < 0.03, 'a shrine heals half your HP', JSON.stringify(heal));

	// ---- 6. elites: none through floor 5; from floor 6 some foes carry one affix, bigger, with the affix's numbers
	const el = await E(page, () => {
		const H = window.__t, k = G.ExpDive.K, out = { early: 0, seen: [], bad: [], floors: 0, plain: 0 };
		const C = G.ExpClassic;
		const look = () => {
			const f = G.ExpDive.run.floor, teff = f * k.T_PER_FLOOR, sc = G.Enemies.scale(teff);
			const ti = Math.max(0, Math.min(5, Math.floor((G.ExpDive.target(f) - 260) / k.TIER_BST) + (f >= k.DEEP.tierAt ? 1 : 0)));
			const fac = k.HP_K + Math.min(1.7, teff / 210);
			for (const e of G.EnemyMgr.all()) {
				if (e.dead || e.xk || e.xrein || e.xu3) continue;
				if (!e.xaff) { out.plain++; continue; }
				if (f < k.ELITE.from) { out.early++; continue; }
				const base = new G.Enemy(C.defOf(e.dex, ti), 0, 0, { hp: sc.hp, dmg: sc.dmg, spd: sc.spd }, false);
				const hpK = e.maxHp / (base.maxHp * fac), dmgK = e.dmg / (base.dmg * k.DMG_K), spdK = e.spd / base.spd;
				const want = { swift: [1, 1, k.ELITE.swift], tough: [k.ELITE.tough, 1, 1], rage: [1, k.ELITE.rage, 1] }[e.xaff];
				// (HP is a whole number: a 9 HP foe made tough is 22, not 21.6, which is x2.44. So HP is compared as HP, to within the
				// rounding, not as a ratio: the ratio check failed about one run in six, whenever a floor rolled a low-HP elite.)
				const hpWant = base.maxHp * fac * (want ? want[0] : 1), hpOk = Math.abs(e.maxHp - hpWant) <= Math.max(1, hpWant * 0.03);
				const ok = want && hpOk && Math.abs(dmgK - want[1]) < 0.03 && Math.abs(spdK - want[2]) < 0.03 && e.scale === k.ELITE.scale && typeof e.xmove === 'function';
				out.seen.push(e.xaff);
				if (!ok) out.bad.push({ f, aff: e.xaff, hpK: +hpK.toFixed(2), dmgK: +dmgK.toFixed(2), spdK: +spdK.toFixed(2), scale: e.scale });
			}
		};
		look();
		for (let f = G.ExpDive.run.floor + 1; f <= 16 && G.ExpDive.run; f++) { H.downTo(f); out.floors++; look(); }
		out.floor = G.ExpDive.run && G.ExpDive.run.floor;
		out.ring = Object.keys(G.ExpDive.AFF_COL).sort().join();
		return out;
	});
	A(el.early === 0, 'floors 1-5: no elites', JSON.stringify(el.early));
	A(el.floor === 16 && el.seen.length >= 3 && el.seen.length < el.plain * 0.5, `floors 6-16: some foes are elites (${el.seen.length} of ${el.seen.length + el.plain}), most are not`, JSON.stringify({ floor: el.floor, seen: el.seen.length, plain: el.plain }));
	A(el.bad.length === 0, 'every elite sleeps with its group, is drawn bigger (x1.22), and carries exactly its affix\'s numbers: swift x1.4 speed, tough x2.4 HP, rage x1.55 damage', JSON.stringify(el.bad.slice(0, 4)));
	A(el.ring === 'rage,swift,tough', 'each affix has its ring colour', el.ring);
	await d0.ctx.close();

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
