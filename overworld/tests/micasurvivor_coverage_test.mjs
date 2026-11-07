// micasurvivor_coverage_test.mjs — MicaSurvivor U3, the coverage sweep (Plans/MICASURVIVOR_UNIFIED_PLAN.md; owner 2026-11-02: "a
// sweep of all 3 game modes to make sure all 1025 are playable and show up as enemies as well as all Megas and regional formes").
//   0. data (Node, the game's own files in a sandbox): the 58 regional formes are G.DEX entries of their own (PokéAPI form ids,
//      after the 1,025), with their family, region's gen, own types, an ANIMATED SpriteCollab row (56) or a battle-front one (2);
//      the 93 Megas are in G.DEX_BY (never G.DEX), every one drawable (42 animated, 19 battle fronts, 32 their species' sheet);
//      the overworld's form ids map to the formes; every sheet is on disk
//   1. Survival (base, js/data/enemies.js): every forme is a base enemy (a tier's candidates, a boss slot, the legendary pools);
//      the Mega elites start at 15:00 and their union over runs is all 93; about half the runs' 15:00 boss is a Mega; Type mode:
//      Megas of the type only
//   2. Expedition (classic.js + survival.js): the plans' union covers every forme; every zone-3 plan has ONE Mega elite and their
//      union is all 93; Survival's segments from 15:00 have a Mega elite (none before), some milestone bosses from 15:00 are Megas
//   3. Dive (the browser, dive.js): every non-legendary forme is in the floors' pools; the legendary encounters' pool is every
//      legendary the guardians leave out (61 + the 3 Galarian birds) and their union covers it; ~35 % a floor; the Megas' union
//   4. FIRE (the browser): a base run AS Alolan Vulpix; a base run's Mega Evolution at Lv 40 (Charizard X / Y / Not yet), its
//      look and the net frame's field 16; a 15:00 Mega elite spawns; the gacha's Alola banner pulls formes; the Play flow's
//      picker offers an owned forme; the League: Alolan Vulpix starts its own line and evolves to Alolan Ninetales, Pikachu
//      branches to Alolan Raichu, Galarian Meowth -> Perrserker; an Expedition run AS a forme; zone 3's Mega elite fires;
//      a Dive down to floor 31 meets a legendary encounter (pity) below the first guardian
//   node overworld/tests/micasurvivor_coverage_test.mjs
// (MAGEPUNK_ASSET_ROOT=<main checkout> in a git worktree, for the gitignored sprites.)
import http from 'http';
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const MS = path.join(ROOT, 'micasurvivor');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 8957;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const T0 = Date.now();
const mulberry = s => { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ======================== 0. data
const ctx = { G: {}, console, Math: Object.create(Math), performance: { now: () => 0 } };
ctx.Math.random = Math.random;
ctx.window = ctx;
vm.createContext(ctx);
ctx.G.I18n = { add() {}, t: s => s, f: (s, ...v) => { let i = 0; return s.replace(/\{x\}/g, () => v[i++]); }, lang: 'en' };
ctx.G.Modes = { onlyType: () => null, is: () => false, run: {} };
let loadOk = true;
try {
	for (const f of ['js/core/util.js', 'js/data/pokedex.js', 'js/data/families.js', 'js/data/mega-data.js', 'js/data/forms.js', 'js/systems/forms.js', 'js/data/sprites-meta.js',
		'js/data/ow-species.js', 'js/data/enemies.js', 'js/expedition/terrain.js', 'js/expedition/classic.js', 'js/expedition/survival.js'])
		vm.runInContext(fs.readFileSync(path.join(MS, f), 'utf8'), ctx, { filename: f });
} catch (e) { loadOk = false; console.log(e); }
const G = ctx.G;
const FORMS = G.FORMS || [], FIDS = FORMS.map(p => p.dex), MEGAS = G.Megas ? G.Megas.LIST.map(p => p.dex) : [];
A(loadOk && FORMS.length === 58 && G.DEX.length === 1025 + 58 && G.DEX.slice(1025).every((p, i) => p === FORMS[i]) && FIDS.every(d => d >= 10091 && d <= 10253 && G.DEX_BY[d] === G.Forms.BY[d]),
	'the 58 regional formes are G.DEX entries of their own, after the 1,025 species, keyed by PokéAPI\'s form ids (10091-10253)', JSON.stringify({ n: FORMS.length, dex: G.DEX.length }));
const byRegion = r => FORMS.filter(p => p.form === r).length;
A(byRegion('alola') === 18 && byRegion('galar') === 20 && byRegion('hisui') === 16 && byRegion('paldea') === 4,
	'Alolan 18, Galarian 20 (Zen Galarian Darmanitan included), Hisuian 16, Paldean 4', JSON.stringify(['alola', 'galar', 'hisui', 'paldea'].map(byRegion)));
const P = d => G.DEX_BY[d];
A(P(10103).name === 'Vulpix de Alola' && P(10103).types.join() === 'ice' && P(10100).types.join() === 'electric,psychic' && P(10161).types.join() === 'steel' && P(10229).types.join() === 'fire,rock'
	&& P(10253).types.join() === 'poison,ground' && P(10169).leg && P(10169).rarity === 5 && P(10169).types.join() === 'psychic,flying',
	'each forme has its own types and stats (Alolan Vulpix Ice, Alolan Raichu Electric / Psychic, Galarian Meowth Steel, Hisuian Growlithe Fire / Rock, Paldean Wooper Poison / Ground; Galarian Articuno legendary)');
const GEN = { alola: 7, galar: 8, hisui: 8, paldea: 9 };
const fam = FORMS.filter(p => G.FAMILY[p.dex] !== (G.FAMILY[p.sp] || p.sp) || p.gen !== GEN[p.form] || p.starter || !(p.hp > 70 && p.spd > 78 && p.atk > 0.7) || p.base.length !== 6);
A(!fam.length && G.Families.rootOf(10100) === 172 && G.Families.membersOf(26).includes(10100), 'a forme\'s family is its species\' (Alolan Raichu: Pichu\'s; the per-family upgrades are shared), its gen its region\'s (the gacha banner)', JSON.stringify(fam.map(p => p.dex)));
// sprites: animated SpriteCollab rows, the battle fronts only where SpriteCollab has none
const M = d => G.SPRITE_META[d];
const fStatic = FIDS.filter(d => M(d) && M(d).src === 'front'), fAnim = FIDS.filter(d => M(d) && !M(d).src && !M(d).al && M(d).a.Walk && M(d).a.Walk.n > 1 && M(d).a.Attack);
A(fAnim.length === 56 && JSON.stringify(fStatic) === '[10178,10180]' && FIDS.every(d => M(d)),
	`the formes' art: ${fAnim.length} ANIMATED SpriteCollab sheets (Walk + Attack...), the overworld's static battle front only for Zen Galarian Darmanitan and Galarian Stunfisk`, JSON.stringify({ fAnim: fAnim.length, fStatic }));
A(FIDS.filter(d => M(d).sh).length >= 50, 'and most have their SpriteCollab shiny (' + FIDS.filter(d => M(d).sh).length + ')');
const mAnim = MEGAS.filter(d => M(d) && !M(d).src && !M(d).al), mBat = MEGAS.filter(d => M(d) && M(d).src === 'front'), mAl = MEGAS.filter(d => M(d) && M(d).al);
A(MEGAS.length === 95 && MEGAS.every(d => P(d) && P(d).mega && !G.DEX.includes(P(d)) && M(d)) && mAnim.length === 44 && mBat.length === 51 && mAl.length === 0
	&& G.Megas.foes().length === 95,
	`the 95 Megas and Primals: in G.DEX_BY (not G.DEX: not collection entries), each drawable: ${mAnim.length} animated SpriteCollab, ${mBat.length} battle fronts (19 Gen 6 + 32 Legends Z-A / Mega Dimension, 2026-11-03), ${mAl.length} their species' sheet ("al")`,
	JSON.stringify({ n: MEGAS.length, mAnim: mAnim.length, mBat: mBat.length, mAl: mAl.length }));
A(P(10034).name === 'Mega-Charizard X' && P(10034).types.join() === 'fire,dragon' && P(10034).bst === 634 && P(10034).rarity === 5 && P(10034).sp === 6,
	'a Mega\'s row: its name, its own types and base-stat total (Mega Charizard X: Fire / Dragon, 634), species 6', JSON.stringify(P(10034)));
const owBad = FORMS.filter(p => !Object.entries(G.OW_SPECIES).some(([k, v]) => v === p.dex));
A(!owBad.length && G.OW_SPECIES.raichu_alola === 10100 && G.OW_SPECIES.raichu === 26 && G.OW_SPECIES.darmanitan_galar_zen === 10178 && G.OW_SPECIES.tauros_paldea_aqua === 10252,
	'the overworld\'s form ids map to the formes (raichu_alola -> 10100; raichu stays 26): catching one there unlocks that forme', JSON.stringify(owBad.map(p => p.dex)));
{
	const missing = [];
	for (const d of FIDS.concat(MEGAS)) {
		const m = M(d), dir = path.join(AROOT, 'micasurvivor/assets/pokemon', String(m.al || d), m.src || '');
		for (const a of Object.keys(m.a)) if (!fs.existsSync(path.join(dir, a + '.png'))) missing.push(d + '/' + a);
		if (m.sh) for (const a of Object.keys(m.a)) if (!(m.sm || []).includes(a) && !fs.existsSync(path.join(dir, 's', a + '.png'))) missing.push(d + '/s/' + a);
	}
	A(!missing.length, 'every forme / Mega sheet is on disk (and in tools/cloud/micasurvivor_manifest.txt, deployed to the sprite host)', missing.slice(0, 8).join());
	const man = fs.readFileSync(path.join(ROOT, 'tools/cloud/micasurvivor_manifest.txt'), 'utf8');
	A(FIDS.concat(mAnim, mBat).every(d => man.includes('pokemon/' + d + '/')), 'the asset manifest lists them');
}

{
	// the server takes the new ids: a run's dex (leaderboards, replays) and a forme in the base collection (the League count)
	const src = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
	const fm = /const MSURV_FORM_FAMILY = new Map\('([\d:,]+)'/.exec(src), ok = /const msurvDexOk = (dex => [^;]+);/.exec(src);
	const okFn = ok ? eval(ok[1]) : () => false;
	A(fm && fm[1] === FORMS.map(p => p.dex + ':' + G.FAMILY[p.dex]).join(',') && [1, 1025, 10100, 10034, 10325].every(okFn) && ![0, 2001, 10000, 10401].some(okFn) && (src.match(/msurvDexOk\(dex\) \? dex : 0/g) || []).length === 4,
		"server/mp.mjs: MSURV_FORM_FAMILY is the formes' families; a run's dex may be a forme / Mega id (10001-10400) on every board",JSON.stringify({ fm: !!fm, ok: !!ok }));
}

// ======================== 1. Survival (base)
if (G.Enemies) {
	const EN = G.Enemies, cand = new Set();
	for (const tier of EN.TIERS) for (const p of EN.candidates(tier)) cand.add(p.dex);
	const boss = new Set(G.DEX.filter(p => !p.leg && G.SPRITE_META[p.dex] && (p.bst >= 580 || EN.BOSS_SLOTS.some(s => p.bst >= s.bst[0] && p.bst <= s.bst[1]))).map(p => p.dex));
	const legs = new Set(G.DEX.filter(p => p.leg && G.SPRITE_META[p.dex]).map(p => p.dex));
	const miss = FIDS.filter(d => !cand.has(d) && !boss.has(d) && !legs.has(d));
	A(!miss.length, 'Survival: every regional forme is a base enemy (a tier\'s candidates, a boss slot, the legendaries of the rift / judgment / tower)', JSON.stringify(miss));
	const seen = new Set(); let megaBoss = 0, early = 0, runs = 0, perRun = 0;
	const r0 = ctx.Math.random;
	for (let s = 1; s <= 300; s++) {
		ctx.Math.random = mulberry(s * 7919);
		EN.rollRun();
		runs++;
		const ms = EN.MEGAS;
		perRun += ms.length;
		for (const m of ms) { seen.add(m.dex); if (m.at < 900) early++; }
		const last = EN.BOSSES[EN.BOSSES.length - 1];
		if (last.mega) { megaBoss++; seen.add(last.dex); if (!G.Megas.BY[last.dex] || last.at !== 900) early++; }
	}
	ctx.Math.random = r0;
	A(seen.size === 95 && !early, `Survival: the Mega elites come from 15:00 (${(perRun / runs).toFixed(1)} a run); over ${runs} runs all 95 Megas and Primals come`, JSON.stringify({ seen: seen.size, early }));
	A(megaBoss > runs * 0.35 && megaBoss < runs * 0.65, `Survival: about half the runs' 15:00 boss is a Mega (${megaBoss} / ${runs})`);
	ctx.G.Modes.onlyType = () => 'ice';
	ctx.Math.random = mulberry(5);
	EN.rollRun();
	const ice = EN.MEGAS.every(m => P(m.dex).types.includes('ice')) && EN.MEGAS.length > 0;
	ctx.G.Modes.onlyType = () => null; ctx.Math.random = r0;
	A(ice, 'Survival by type (Ice): only Ice Megas (Mega Glalie, Abomasnow, Froslass...)', JSON.stringify(EN.MEGAS.map(m => m.dex)));
}

// ======================== 2. Expedition
const C = G.ExpClassic, SV = G.ExpSurv;
if (C && SV) {
	const seen = new Set(), megaSeen = new Set(), bad = [];
	let z3 = 0, z3mega = 0;
	for (let s = 1; s <= 1500; s++) for (const map of C.MAP_IDS) for (let z = 1; z <= 4; z++) {
		const p = C.plan(s * 7919, map, z, 'normal');
		for (const d of p.cards) seen.add(d);
		for (const d of p.wander || []) seen.add(d);
		seen.add(p.guardian);
		for (const e of p.events) {
			for (const d of e.dex) seen.add(d);
			if (e.mega) { megaSeen.add(e.dex[0]); if (z !== 3 || e.kind !== 'elite' || e.n !== 1 || !G.Megas.BY[e.dex[0]]) bad.push(map + z); }
		}
		if (z === 3) { z3++; if (p.events.filter(e => e.mega).length === 1) z3mega++; }
	}
	let segBefore = 0, segAfter = 0, segN = 0, mileMega = 0, mileEarly = 0;
	for (let s = 1; s <= 200; s++) for (const map of C.MAP_IDS) {
		for (let g = 0; g < 10; g++) for (const e of SV.segPlan(s * 7919, map, g, 'normal')) {
			for (const d of e.dex) seen.add(d);
			if (e.mega) { megaSeen.add(e.dex[0]); if (g < 3) segBefore++; else segAfter++; }
			if (g >= 3 && e.mega) segN++;
		}
		for (let n = 1; n <= 9; n++) { const m = SV.milestone(n, map, s * 7919); seen.add(m.dex); if (G.Megas.BY[m.dex]) { mileMega++; if (m.at < 900) mileEarly++; } }
	}
	const miss = FIDS.filter(d => !seen.has(d) && !P(d).leg);
	A(!miss.length, 'Expedition: the plans\' union (cards, wanderers, events, Survival\'s segments) covers every non-legendary regional forme', JSON.stringify(miss));
	A(FIDS.filter(d => P(d).leg).every(d => C.roamers('viridian').includes(d)), 'the legendary formes (the Galarian birds) roam like the other legendaries');
	A(!bad.length && z3mega === z3 && megaSeen.size === 95, `Expedition: every zone-3 plan has one Mega elite (${z3mega} / ${z3}); with Survival's, the union is all 95 Megas and Primals`, JSON.stringify({ bad: bad.slice(0, 5), megas: megaSeen.size }));
	A(!segBefore && segAfter === 200 * 3 * 7, `Expedition Survival: each segment from 15:00 has a Mega elite (${segAfter}), none before`);
	A(mileMega > 0 && !mileEarly, `Expedition Survival: some milestone bosses from 15:00 are Megas (${mileMega}), never before`);
	const p = C.plan(12345, 'viridian', 2, 'normal');
	A(JSON.stringify(C.plan(12345, 'viridian', 2, 'normal')) === JSON.stringify(p) && !p.events.some(e => e.mega), 'a plan is still pure; zones 1-2 have no Mega');
}

// ======================== 3-4. the browser
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data|overworld\/item_icons)\//.test(f) ? AROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
const SAVE = {
	v: 3, name: 'Trainer', created: 1, updated: 1, coins: 500,
	owned: { 1: { at: 1, from: 'starter' }, 6: { at: 1, from: 'gacha' }, 10103: { at: 1, from: 'overworld' }, 10161: { at: 1, from: 'gacha' }, 25: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 10103, partnerShiny: false, starter: 1, personality: { trait: 'brave', scores: {} }, upgrades: {}, ptm: {}, pz: {}, zmis: {},
	tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {}, evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, pupg: {}, stats: {}
};
const BEFORE = save => {
	const H = window.__t = { frozen: false, pending: null };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	try {
		localStorage.setItem('micasurvivor_dev', 'dall20');
		localStorage.setItem('micasurvivor_unlocks_off', '1');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		if (!localStorage.getItem('micasurvivor_save.guest')) localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
	} catch (e) { /* */ }
	H.sturdy = () => { const pl = G.Game.player; pl.hurt = function () {}; return pl; };
	H.unblock = () => {
		if (G.ExpEco && G.ExpEco.pick) { G.ExpEco.closePick(true); return; }
		if (G.Game.state === 'choice' || G.UI.isOpen('scr-item')) { const c = [...document.querySelectorAll('#item-cards .card')].pop(); if (c) c.click(); }
	};
	H.step = (n, dt = 1 / 30, fn) => { for (let i = 0; i < n; i++) { H.unblock(); if (G.Game.state === 'over') return i; G.Game.debugStep(1, dt); if (fn && fn(i) === false) return i; } return n; };
	H.spawned = [];
	H.log = () => { if (H.logging) return; H.logging = true; const add = G.EnemyMgr.add.bind(G.EnemyMgr); G.EnemyMgr.add = function (e) { if (e && !e.remote) { const r = add(e); H.spawned.push({ dex: e.dex, xk: e.xk || null, get xu3() { return e.xu3 || null; }, get xmega() { return e.xmega || 0; }, id: e.id, get scale() { return e.scale || 1; }, floor: G.ExpDive && G.ExpDive.run ? G.ExpDive.run.floor : 0 }); return r; } return add(e); }; };
	H.TS = () => G.World.TS;
	H.wpos = p => { const z = G.World.zone; return [(p[0] + z.x0) * H.TS() + H.TS() / 2, (p[1] + z.y0) * H.TS() + H.TS() / 2]; };
	H.put = (x, y) => { const pl = G.Game.player; pl.x = x; pl.y = y; pl.zMask = null; pl.air = null; G.Camera.x = x; G.Camera.y = y; };
	H.thin = () => { for (const e of G.EnemyMgr.all()) if (!e.boss && !e.xk && !e.dead) { e.dead = true; e.fade = 0; } };
	H.toStairs = () => { const L = G.World.zone.dive, [x, y] = H.wpos(L.stairs); H.put(x, y); };
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
await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	const bctx = await browser.createBrowserContext();
	const page = await bctx.newPage();
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	await page.evaluateOnNewDocument(BEFORE, SAVE);
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of (400|404|409|429)/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	const visible = id => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
	if (await visible('tap-start')) await page.click('#tap-start');
	await waitFor(() => visible('scr-menu'), 15000);
	const E = async (fn, ...args) => { try { return await page.evaluate(fn, ...args); } catch (e) { return { error: String(e && e.message || e).slice(0, 400) }; } };
	await E(() => { G.Audio.sfx = () => {}; G.Audio.music = () => {}; });

	// ---- every forme / Mega sheet loads in the page
	const ld = await E(async (ids) => {
		const hs = ids.map(d => G.Sprites.sheet(d, 'Idle', false));
		const t0 = performance.now();
		while (hs.some(h => !h.ready && !h.failed) && performance.now() - t0 < 30000) await new Promise(r => setTimeout(r, 100));
		return { n: hs.length, bad: ids.filter((d, i) => !hs[i].ready), alias: G.Sprites.sheet(10278, 'Idle').src };
	}, FIDS.concat(MEGAS));
	A(ld.n === 153 && !ld.bad.length && /assets\/pokemon\/10278\/front\/Idle\.png/.test(ld.alias), `the page loads all ${ld.n} forme / Mega Idle sheets (Mega Clefable loads its OWN, 10278/front/, not Clefable's 36/)`, JSON.stringify(ld));

	// ---- (review fix) every forme / Mega is drawn at its species' size: as an Enemy (body radius, the drawn picture's height)
	//      and in a sprite canvas (the picker, the Lexicon, the level-up card). The static fronts were a speck before
	const sz = await E(async (ids) => {
		const sp = d => G.Forms.speciesOf(d), all = [...new Set(ids.concat(ids.map(sp)))];
		await G.Sprites.preload(all, 30000);
		const aura = G.Megas.aura, emblem = G.Megas.emblem;
		G.Megas.aura = G.Megas.emblem = () => {};   // (the picture alone: the aura / sign are not the Pokémon)
		const drawnH = d => {
			const cv = document.createElement('canvas'); cv.width = 400; cv.height = 400;
			const c = cv.getContext('2d'), a = new G.Sprites.Animator(d, 1); a.loop('Idle'); a.draw(c, 200, 330);
			const px = c.getImageData(0, 0, 400, 400).data; let top = 400, bot = -1, n = 0;
			for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) if (px[(y * 400 + x) * 4 + 3] > 200) { n++; if (y < top) top = y; if (y > bot) bot = y; }
			return { h: bot >= top ? bot - top + 1 : 0, n };
		};
		const out = [];
		for (const d of ids) {
			const e = new G.Enemy({ dex: d, hp: 10, spd: 50, dmg: 1, xp: 1, behavior: 'chase' }, 0, 0, { hp: 1, spd: 1, dmg: 1 });
			const b = new G.Enemy({ dex: sp(d), hp: 10, spd: 50, dmg: 1, xp: 1, behavior: 'chase' }, 0, 0, { hp: 1, spd: 1, dmg: 1 });
			const de = drawnH(d), db = drawnH(sp(d));
			out.push({ d, r: e.r / b.r, h: de.h / Math.max(1, db.h), n: de.n });
		}
		G.Megas.aura = aura; G.Megas.emblem = emblem;
		// a sprite canvas (G.UI.spriteCanvas, the picker's / Lexicon's): its opaque pixels
		const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;display:flex;flex-wrap:wrap;width:1280px';
		document.body.appendChild(host);
		const cvs = ids.map(d => { const cv = G.UI.spriteCanvas(d, 56, 48, { scale: 1, shadow: false }); host.appendChild(cv); return [d, cv]; });
		await new Promise(r => setTimeout(r, 300));
		for (let i = 0; i < 3; i++) { G.UI.tick(1 / 60); await new Promise(r => setTimeout(r, 30)); }
		const canv = cvs.map(([d, cv]) => { const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 200) n++; return [d, n]; });
		host.remove();
		return { small: out.filter(o => o.r < 0.6 || o.h < 0.7 || o.n < 80).map(o => [o.d, +o.r.toFixed(2), +o.h.toFixed(2), o.n]), n: out.length,
			min: Math.min(...out.map(o => o.h)).toFixed(2), canvSmall: canv.filter(([, n]) => n < 60) };
	}, FIDS.concat(MEGAS));
	A(sz.n === 153 && !sz.small.length, `every forme / Mega as an Enemy is its species' size or more (drawn height >= 70 % of the species', body radius >= 60 %: some real sheets are narrower, Galarian Articuno 64 %; lowest height ${sz.min}): no speck`, JSON.stringify(sz.small.slice(0, 20)));
	A(sz.canvSmall && !sz.canvSmall.length, 'and each sprite canvas (picker, Lexicon, cards) draws a real picture (>= 60 opaque px at scale 1)', JSON.stringify(sz.canvSmall));

	// ---- a base run AS Alolan Vulpix; the gacha; the Play flow's picker
	const b1 = await E(async () => {
		const H = window.__t, ok = await G.Flow.play('normal');
		H.freeze(); H.sturdy(); H.log();
		const pl = G.Game.player;
		H.step(60);
		const out = { ok, mode: G.Modes.run.mode, dex: pl.dex, types: pl.mon.types.join(), sheet: !!G.Sprites.sheet(pl.dex, 'Walk').ready, ab: G.Abilities.of(pl.dex) === G.Abilities.of(37) };
		G.Game.quit(); G.Game.toUI(); G.UI.hideAll(); G.Flow.goMenu();
		return out;
	});
	A(b1.mode === 'normal' && b1.dex === 10103 && b1.types === 'ice' && b1.ab, 'Survival: a run AS Alolan Vulpix (an owned forme, the partner): its dex, its Ice type, its species\' ability', JSON.stringify(b1));
	const ga = await E(() => {
		const all = g => [1, 2, 3, 4, 5].flatMap(k => G.Gacha.pool(k, g).map(p => p.dex)), G7 = all(7), G8 = all(8), G9 = all(9);
		const r = { a: G7.includes(10103) && G7.includes(10091), g: G8.includes(10161) && G8.includes(10229), p: G9.includes(10253), noMega: ![1, 2, 3, 4, 5].some(k => [7, 6].some(g => G.Gacha.pool(k, g).some(p => p.mega))) };
		const s = G.DB.save, c0 = s.coins, own0 = Object.keys(s.owned).length, ownSnap = JSON.stringify(s.owned), shSnap = JSON.stringify(s.shiny);
		s.coins = 1e7; const tk = s.tickets.t1; s.tickets.t1 = 1e6;
		let formes = 0;
		for (let i = 0; i < 40; i++) { const res = G.Gacha.pull(s, 10, 7, 't1'); if (res) for (const x of res.list || res) if (x && x.dex > 10000) formes++; }
		s.coins = c0; s.tickets.t1 = tk;
		r.pulled = formes; r.own = Object.keys(s.owned).length - own0;
		s.owned = JSON.parse(ownSnap); s.shiny = JSON.parse(shSnap);   // (the pulls' unlocks undone: the League checks below read the collection)
		return r;
	});
	A(ga.a && ga.g && ga.p && ga.noMega && ga.pulled > 0, `the gacha: the formes are in their region's banner (Alola: Alolan Rattata / Vulpix; Galar / Hisui: gen 8; Paldea: Paldean Wooper), no Megas; 400 Alola pulls drew ${ga.pulled} formes`, JSON.stringify(ga));
	const pf = await E(async () => {
		document.querySelector('#scr-menu [data-go=play]').click();
		await new Promise(r => setTimeout(r, 200));
		// (Play keeps your partner and opens mode selection; the picker is one tap away)
		document.querySelector('#mx-change-character').click();
		await new Promise(r => setTimeout(r, 200));
		const tab = document.querySelector('#scr-play .mx-tab[data-gen="7"]') || [...document.querySelectorAll('#scr-play .mx-tab')].find(t => /Alola/.test(t.innerText));
		if (tab) tab.click();
		await new Promise(r => setTimeout(r, 150));
		const cells = [...document.querySelectorAll('#scr-play .mx-cell')].map(c => +c.dataset.dex);
		const out = { cells, has: cells.includes(10103) };
		G.UI.hideAll(); G.Flow.goMenu();
		return out;
	});
	A(pf.has, 'the Play flow\'s picker offers an owned forme (Alolan Vulpix, under Alola)', JSON.stringify(pf));

	// ---- a base run's Mega Evolution (Charizard, Lv 40)
	const mg = await E(async () => {
		const H = window.__t;
		G.DB.save.partner = 6;
		await G.Flow.play('normal');
		H.freeze(); H.sturdy();
		const pl = G.Game.player, out = {};
		pl.level = 39; out.c39 = (G.LevelUp.offer(pl) || []).some(c => /^mega/.test(c.key));
		pl.level = 40;
		const cards = G.LevelUp.offer(pl);
		out.keys = cards.map(c => c.key);
		const hp0 = pl.maxHp, atk0 = pl.baseAtk;
		cards[0].apply(pl);
		out.mega = pl.mega; out.dex = pl.dex; out.types = pl.mon.types.join(); out.anim = pl.anim.dex; out.hpUp = pl.maxHp >= hp0; out.atkUp = pl.baseAtk > atk0;
		out.look = G.Megas.lookOf(pl); out.after = (G.LevelUp.offer(pl) || []).some(c => /^mega/.test(c.key));
		H.step(30);
		out.frame16 = G.Coop && G.Coop.debugState ? G.Coop.debugState()[16] : null;
		G.Game.quit(); G.Game.toUI(); G.UI.hideAll(); G.Flow.goMenu();
		// "Not yet": offered again 5 levels later
		await G.Flow.play('normal'); H.freeze(); H.sturdy();
		const q = G.Game.player; q.level = 40;
		const c2 = G.LevelUp.offer(q); c2[c2.length - 1].apply(q);
		out.later = { at: q.megaAt, l41: (q.level = 41, (G.LevelUp.offer(q) || []).some(c => /^mega/.test(c.key))), l45: (q.level = 45, (G.LevelUp.offer(q) || []).some(c => /^mega/.test(c.key))) };
		G.Game.quit(); G.Game.toUI(); G.UI.hideAll(); G.Flow.goMenu();
		G.DB.save.partner = 10103;
		return out;
	});
	A(!mg.c39 && JSON.stringify(mg.keys) === '["mega:10034","mega:10035","mega:later"]', 'Survival: Charizard\'s Lv 40 level-up is the Mega choice (Mega Charizard X / Y / Not yet), not before', JSON.stringify(mg));
	A(mg.mega === 10034 && mg.dex === 6 && mg.types === 'fire,dragon' && mg.anim === 10034 && mg.hpUp && mg.atkUp && mg.look === 10034 && !mg.after,
		'Mega Charizard X: its types and base stats on the player (its dex stays Charizard: records, upgrades), its sheet, the id other players see; offered once', JSON.stringify(mg));
	A(mg.later && mg.later.at === 45 && !mg.later.l41 && mg.later.l45, '"Not yet": offered again 5 levels later', JSON.stringify(mg.later));

	// ---- a 15:00 Mega elite (base)
	const me = await E(async () => {
		const H = window.__t;
		await G.Flow.play('normal'); H.freeze(); H.sturdy(); H.log();
		const first = G.Enemies.MEGAS[0];
		G.Game.debugTime(first.at - 0.5);
		const n0 = H.spawned.length;
		H.step(40);
		const s = H.spawned.slice(n0).find(x => x.xmega);
		const e = s && G.EnemyMgr.get(s.id);
		const out = { first, s, name: e && e.name, banner: (G.Spawner.banner() || {}).text, mega: !!(e && G.Megas.BY[e.dex]) };
		G.Game.quit(); G.Game.toUI(); G.UI.hideAll(); G.Flow.goMenu();
		return out;
	});
	A(me.first && me.first.at >= 900 && me.s && me.s.dex === me.first.dex && me.mega && me.s.scale === 1.3 && /Mega/.test(me.banner || ''),
		`Survival: at ${me.first && me.first.at} s a Mega elite spawns (${me.name}), bigger, announced ("${me.banner}")`, JSON.stringify(me));

	// ---- the Expedition: the League's formes, a run AS a forme, zone 3's Mega elite
	await E(() => G.Expedition.load());
	const lg = await E(() => {
		const L = G.ExpLeague, D = G.EXP_LEAGUE_DATA, m37 = L.BY[37], m172 = L.BY[172], m52 = L.BY[52];
		const st = L.stagesOf(m37);
		return { fam: [L.FAM[10103], L.FAM[10104], L.FAM[10100], L.FAM[10161], L.FAM[10178], L.FAM[10169]], st, e37: m37.evo[10103], e25: m172.evo[25], e52: m52.evo[10161], base: D.base[10103],
			all: G.FORMS.every(p => L.FAM[p.dex] != null && L.stagesOf(L.BY[L.FAM[p.dex]]).includes(p.dex) && D.base[p.dex]), open: L.formOpen(10103), closed: L.formOpen(10104) };
	});
	A(lg.all && JSON.stringify(lg.fam) === '[37,37,172,52,554,144]' && lg.st.join() === '37,10103,38,10104',
		'the League: every forme is a stage of its base species\' family (Alolan Vulpix in Vulpix\'s, Alolan Raichu in Pichu\'s, Zen Galarian Darmanitan in Darumaka\'s...)', JSON.stringify(lg));
	A(JSON.stringify(lg.e37) === '[[10104,30]]' && JSON.stringify(lg.e25) === '[[26,36],[10100,36]]' && JSON.stringify(lg.e52) === '[[863,28]]' && lg.base.join() === '38,41,40,50,65,65',
		'a forme evolves in its own line (Alolan Vulpix -> Alolan Ninetales at 30), Pikachu branches (Raichu / Alolan Raichu at 36), Galarian Meowth -> Perrserker; its own base stats', JSON.stringify(lg));
	A(lg.open && !lg.closed, 'an owned forme is an open start (Alolan Vulpix); its evolution is not until reached (Alolan Ninetales)', JSON.stringify(lg));
	const ex = await E(async () => {
		const H = window.__t, L = G.ExpLeague;
		L.setPick(37); L.setForm(10103);
		const ok = await G.Flow.play('exp-classic');
		H.freeze(); H.sturdy(); H.log();
		const pl = G.Game.player, out = { ok, dex: pl.dex, types: pl.mon.types.join(), member: L.run && L.run.member };
		const C = G.ExpClassic, p3 = C.plan(G.World.seed | 0, 'viridian', 3, 'normal'), ev = p3.events.find(e => e.mega);
		const n0 = H.spawned.length;
		C.fireEvent(ev, [pl]);
		const s = H.spawned.slice(n0)[0], e = s && G.EnemyMgr.get(s.id);
		out.ev = ev && ev.dex; out.s = s; out.mega = !!(e && G.Megas.BY[e.dex]); out.banner = (G.Spawner.banner() || {}).text;
		G.Game.quit(); G.Game.toUI(); G.UI.hideAll(); G.Flow.goMenu();
		return out;
	});
	A(ex.ok && ex.dex === 10103 && ex.types === 'ice' && ex.member === 37, 'Expedition: a League run AS Alolan Vulpix (member Vulpix, the forme\'s body and types)', JSON.stringify(ex));
	A(ex.s && ex.mega && ex.s.xk === 'elite' && ex.s.scale === 1.3 && ex.s.dex === ex.ev[0] && /Mega/.test(ex.banner || ''), 'Expedition: zone 3\'s Mega elite fires (a Mega, an elite x1.3, announced)', JSON.stringify(ex));

	// ---- Dive: the pools, the legendary encounters, the Megas; a dive to floor 31
	const dv = await E(() => {
		const D = G.ExpDive, seen = new Set();
		for (const r of G.DiveGen.ROUTE_IDS) for (let f = 1; f <= 120; f++) for (const [dex] of D.pool(r, f).list) seen.add(dex);
		const nonLegForms = G.FORMS.filter(p => !p.leg).map(p => p.dex), miss = nonLegForms.filter(d => !seen.has(d));
		const pool = D.legendPool(), guard = new Set(Object.values(D.GUARDIANS).flat()), legs = G.DEX.filter(p => p.leg).map(p => p.dex);
		const lseen = new Set(), mseen = new Set();
		let hits = 0, n = 0, eliteN = 0;
		for (let s = 1; s <= 400; s++) for (const r of G.DiveGen.ROUTE_IDS) for (let f = 26; f <= 60; f++) {
			const lr = D.legendRoll(s * 7919, r, f); n++; if (lr.hit) { hits++; lseen.add(lr.dex); }
			const m = D.megaRoll(s * 7919, r, f); if (m.elite || m.arena) mseen.add(m.dex); if (m.elite) eliteN++;
		}
		return { miss, pool: pool.length, poolOk: legs.every(d => guard.has(d) || pool.includes(d)) && pool.every(d => !guard.has(d)), uniqLegs: legs.filter(d => !guard.has(d)).length,
			lseen: lseen.size, rate: hits / n, mseen: mseen.size, eliteRate: eliteN / n, birds: [10169, 10170, 10171].every(d => pool.includes(d)) };
	});
	A(!dv.miss.length, 'Dive: every non-legendary regional forme is in the floors\' pools', JSON.stringify(dv.miss));
	A(dv.poolOk && dv.pool === dv.uniqLegs && dv.pool >= 64 && dv.birds && dv.lseen === dv.pool && dv.rate > 0.3 && dv.rate < 0.4,
		`Dive: the legendary encounters' pool is every legendary no route guards (${dv.pool}: the 61 + the Galarian birds); all come over seeds; ${Math.round(dv.rate * 100)} % of floors (PokéDive's 35 %)`, JSON.stringify(dv));
	A(dv.mseen === 95 && dv.eliteRate > 0.15 && dv.eliteRate < 0.25, `Dive: below floor 30, a floor's Mega elite ${Math.round(dv.eliteRate * 100)} % of the time (or the arena alpha); all 95 Megas and Primals over seeds`, JSON.stringify(dv));
	const d31 = await E(async () => {
		const H = window.__t;
		G.ExpLeague.setPick(1); G.ExpLeague.setForm(1);
		const ok = await G.Flow.play('exp-dive');
		H.freeze(); H.sturdy(); H.log();
		const pl = G.Game.player; pl.gainXp = () => 0;
		const reached = H.downTo(31);
		const leg = H.spawned.filter(s => s.xu3 === 'legend'), mega = H.spawned.filter(s => s.xu3 === 'mega' || (s.floor > 30 && G.Megas.BY[s.dex]));
		const out = { ok, reached, leg: leg.map(s => [s.floor, s.dex]), mega: mega.map(s => [s.floor, s.dex]), pity: G.ExpDive.run && G.ExpDive.run.legPity };
		G.Game.quit(); G.Game.toUI(); G.UI.hideAll(); G.Flow.goMenu();
		return out;
	});
	const legFloors = (d31.leg || []).map(x => x[0]);
	A(d31.ok && d31.reached === 31 && legFloors.length >= 1 && legFloors.every(f => f >= 26) && legFloors[0] <= 29 && d31.leg.every(x => !(x[1] in { 251: 1, 492: 1, 787: 1, 151: 1 })),
		'Dive: a dive to floor 31 meets a legendary encounter below the first guardian, by floor 29 at the latest (the pity after 3)', JSON.stringify(d31));
} catch (e) {
	fail++; console.log('FAIL: the browser part threw: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
A(!errors.length, 'no page errors', errors.slice(0, 5).join('\n'));
console.log(`\n${pass} passed, ${fail} failed (${Math.round((Date.now() - T0) / 1000)} s)`);
process.exit(fail ? 1 : 0);
