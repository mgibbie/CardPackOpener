// micasurvivor_sharedupgrades_test.mjs — MicaSurvivor DLC D18 (owner 2026-10-26): "i want both modes to respond to the same
// upgrades i can buy for the pokemon to improve their stats". Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md "D18 built";
// micasurvivor/README.md "DLC D18". Headless Chrome, a fixed guest profile, one browser at a time:
//   1. the families (js/data/families.js): every species maps to its family's root; the League's families agree
//   2. per-family max at read time: G.DB.levelsOf(any stage) = the best level of each upgrade among the stages; the save is
//      not rewritten
//   3. the SAME perks object for a dex in a base run and an Expedition run (G.Upgrades.perks's input, recorded at both starts)
//   4. the shop: a stage shows its family's levels; a purchase writes this Pokémon's own entry one level above (and every
//      stage reads it); the list holds your Pokémon AND the League members you can play ("(League)")
//   5. the Expedition kit: the TM swaps kit move 1 for your TM pick; Repertoire unlocks kit move 2 at Lv 1; neither without
//   6. the Lab's 9 stat rows are retired: no effect in a run, not listed, not for sale; their levels refunded once (backup
//      first); the "Profesor" achievement now asks for 25 Lab levels; dv 17
//   node overworld/tests/micasurvivor_sharedupgrades_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites.)
import http from 'http';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 8897;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const T0 = Date.now();

// ======================== 1. the families (no browser)
{
	const ctx = { G: {} };
	vm.createContext(ctx);
	for (const f of ['js/data/pokedex.js', 'js/data/families.js', 'js/expedition/league-data.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'micasurvivor', f), 'utf8'), ctx, { filename: f });
	const F = ctx.G.Families, L = ctx.G.EXP_LEAGUE_DATA;
	const all = Array.from({ length: 1025 }, (_, i) => i + 1);
	const roots = new Set(all.map(F.rootOf));
	let bad = [];
	for (const m of L.members) { const st = new Set([m.dex]); for (const k in m.evo || {}) { st.add(+k); for (const [t] of m.evo[k]) st.add(t); } for (const d of st) if (F.rootOf(d) !== m.dex) bad.push(d); }
	A(all.every(d => roots.has(F.rootOf(d)) && F.rootOf(F.rootOf(d)) === F.rootOf(d)) && roots.size > 500 && roots.size < 600, `every one of the 1,025 species maps to its family's root (${roots.size} families)`, roots.size);
	A(JSON.stringify(F.membersOf(5)) === '[4,5,6]' && F.membersOf(700).includes(133) && F.membersOf(134).length === 9 && F.rootOf(26) === 172 && F.rootOf(983) === 624, 'Charmander\'s line, Eevee and its 8 (Sylveon too), Pichu -> Raichu, Bisharp -> Kingambit', JSON.stringify([F.membersOf(5), F.membersOf(134), F.rootOf(26), F.rootOf(983)]));
	A(bad.length === 0, 'the League\'s 245 families agree with it (every stage of a member has the member as its root)', bad.slice(0, 10).join());
}

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(/^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
// Charmander's family bought on three stages; Squirtle untouched
const SAVE = {
	v: 3, name: 'Trainer', created: 1, updated: 1, coins: 50000,
	owned: { 4: { at: 1, from: 'starter' }, 6: { at: 2, from: 'gacha' }, 7: { at: 3, from: 'gacha' } },
	shiny: {}, partner: 4, partnerShiny: false, starter: 4, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, stats: {},
	pupg: { 4: { atk: 3, hp: 2 }, 5: { hp: 4 }, 6: { atk: 5, cd: 1 }, 7: { spd: 2 } },
};
// the Lab: Training 2 and Shell 1 bought (and Skip 1, a row that stays)
const XS = { v: 1, counters: { 'lab.training': 2, 'lab.shell': 1, 'lab.skip': 1 }, sets: { 'cur.spend': ['lab.training.0:shu01', 'lab.training.1:shu01', 'lab.shell.0:shu01', 'lab.skip.0:shu01'] } };
const BEFORE = (o) => {
	const H = window.__t = { frozen: false, pending: null, perks: [] };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	try {
		localStorage.setItem('micasurvivor_dev', JSON.stringify('dshup001'));
		localStorage.setItem('micasurvivorexp_dev.guest', 'shu01');
		localStorage.setItem('micasurvivorexp_pick', '4');   // (the Expedition runs play the Charmander member)
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		if (!localStorage.getItem('micasurvivor_save.guest')) localStorage.setItem('micasurvivor_save.guest', JSON.stringify(o.save));
		if (o.xsave && !localStorage.getItem('micasurvivorexp_save.guest')) localStorage.setItem('micasurvivorexp_save.guest', JSON.stringify(o.xsave));
	} catch (e) { /* the test reports a boot failure */ }
	/** record every G.Upgrades.perks call (its levels and its result) */
	H.spy = () => { if (H.spied) return; H.spied = 1; const p = G.Upgrades.perks; Object.defineProperty(G.Upgrades, 'perks', { configurable: true, writable: true, value: lv => { const r = p(lv); H.perks.push({ lv: JSON.parse(JSON.stringify(lv)), r: JSON.parse(JSON.stringify(r)) }); return r; } }); };
	H.sturdy = () => { const pl = G.Game.player; pl.hurt = function () {}; pl.gainXp = () => 0; return pl; };
};

await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	async function bootPage(o = {}) {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument(BEFORE, Object.assign({ save: SAVE }, o));
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
	const E = async (page, fn, ...args) => { try { return await page.evaluate(fn, ...args); } catch (e) { return { error: String(e && e.message || e).slice(0, 400) }; } };
	const d0 = await bootPage({ xsave: XS });
	const { page } = d0;
	A(d0.menu, 'boots to the menu as a guest');
	// ======================== 2. per-family max at read time
	const r2 = await E(page, () => ({ c: G.DB.levelsOf(4), m: G.DB.levelsOf(5), z: G.DB.levelsOf(6), sq: G.DB.levelsOf(7), raw: JSON.parse(JSON.stringify(G.DB.save.pupg)) }));
	const fam = JSON.stringify({ atk: 5, hp: 4, cd: 1 });
	const sorted = o => JSON.stringify(Object.fromEntries(Object.entries(o || {}).sort()));
	A(sorted(r2.c) === sorted(JSON.parse(fam)) && sorted(r2.m) === sorted(r2.c) && sorted(r2.z) === sorted(r2.c) && sorted(r2.sq) === sorted({ spd: 2 }),
		'per family, the best level of each upgrade among its stages (Charmander, Charmeleon, Charizard: Strength 5, Vitality 4, Reflexes 1); Squirtle\'s own', JSON.stringify(r2));
	A(JSON.stringify(r2.raw) === JSON.stringify(SAVE.pupg), '...computed at read time: the save is not rewritten', JSON.stringify(r2.raw));
	// ======================== 3. the same perks in both modes
	const r3 = await E(page, async () => {
		const H = window.__t;
		H.spy();
		G.Flow.play('normal');
		H.freeze(); H.sturdy();
		const base = H.perks.slice(), pb = { atkMul: G.Game.player.atkMul, dex: G.Game.player.dex };
		G.Game.quit(); await new Promise(r => setTimeout(r, 200)); if (G.Game.state === 'over') { document.getElementById('btn-again').click(); await new Promise(r => setTimeout(r, 300)); }
		H.thaw();
		const ok = await G.Expedition.load().catch(e => String(e));
		if (ok !== true) return { error: String(ok) };
		await G.ExpSave.open();
		H.perks.length = 0;
		await G.Flow.play('exp-classic');
		H.freeze(); H.sturdy();
		const exp = H.perks.slice();
		const pl = G.Game.player;
		const out = { base, exp, pb, member: G.ExpLeague.run.member, dv: G.Expedition.DV, moves: pl.moves.map(m => m.id) };
		G.Game.quit(); await new Promise(r => setTimeout(r, 200)); if (G.Game.state === 'over') { document.getElementById('btn-again').click(); await new Promise(r => setTimeout(r, 300)); }
		return out;
	});
	const pkB = r3.base && r3.base[0], pkX = r3.exp && r3.exp.find(c => sorted(c.lv) === sorted(JSON.parse(fam)));
	A(pkB && pkX && sorted(pkB.lv) === sorted(JSON.parse(fam)) && JSON.stringify(pkB.r) === JSON.stringify(pkX.r) && r3.member === 4 && r3.exp.every(c => JSON.stringify(c.r) === JSON.stringify(pkB.r)),
		'a base run (Charmander) and an Expedition run (the Charmander member) read the SAME perks object: the family\'s levels', JSON.stringify(r3).slice(0, 900));
	A(r3.dv === 17, 'the Expedition content version is 17 (D18)', r3.dv);
	// ======================== 4. the shop
	const r4 = await E(page, async () => {
		document.querySelector('#scr-menu [data-go=upgrades]') ? document.querySelector('#scr-menu [data-go=upgrades]').click() : G.MenuUI.open();
		await new Promise(r => setTimeout(r, 300));
		const sel = document.getElementById('upg-mon');
		const opts = [...sel.options].map(o => [+o.value, o.textContent]);
		sel.value = '6'; sel.onchange();
		await new Promise(r => setTimeout(r, 100));
		const i = G.Upgrades.live().findIndex(u => u.id === 'atk');
		const el = document.querySelectorAll('#upg-list .upg-item')[i];
		const pips = el.querySelectorAll('.pips i.on').length, price = G.Upgrades.cost('atk', 5), c0 = G.DB.save.coins;
		el.querySelector('[data-buy]').click();
		return { opts, pips, paid: c0 - G.DB.save.coins, price, own6: G.DB.save.pupg[6].atk, fam4: G.DB.levelsOf(4).atk, fam5: G.DB.levelsOf(5).atk, raw4: G.DB.save.pupg[4].atk };
	});
	A(r4.pips === 5 && r4.paid === r4.price && r4.own6 === 6 && r4.fam4 === 6 && r4.fam5 === 6 && r4.raw4 === 3, 'the shop shows Charizard its family\'s Strength 5; buying writes its own entry at 6 (the price of level 6) and every stage reads 6', JSON.stringify(r4));
	const ids = (r4.opts || []).map(o => o[0]);
	A(ids.includes(4) && ids.includes(6) && ids.includes(7) && ids.includes(152) && ids.includes(387) && /\(Liga\)|\(League\)/.test((r4.opts.find(o => o[0] === 152) || [])[1] || ''), 'the shop lists your Pokémon and the League members you can play (the free starters too, marked "League")', JSON.stringify(r4.opts && r4.opts.slice(0, 20)));
	// ======================== 5. the kit: TM and Repertoire
	const r5 = await E(page, async () => {
		const H = window.__t, s = G.DB.save, out = {};
		const start = async () => { G.UI.hideAll && G.UI.hideAll(); H.thaw(); await G.Flow.play('exp-classic'); H.freeze(); H.sturdy(); const pl = G.Game.player; const r = { moves: pl.slots.map(g => g[0].id), kit: G.ExpLeague.BY[4].kit.slice(), tm: G.ExpLeague.run.tm || null }; G.Game.quit(); await new Promise(r => setTimeout(r, 200)); if (G.Game.state === 'over') { document.getElementById('btn-again').click(); await new Promise(r => setTimeout(r, 300)); } return r; };
		out.none = await start();
		s.pupg[5].tm = 1; s.ptm[5] = 'flamethrower';   // (bought on Charmeleon: the family's)
		out.tm = await start();
		s.pupg[6].moves = 1;
		out.both = await start();
		delete s.pupg[5].tm; delete s.ptm[5];
		out.rep = await start();
		return out;
	});
	const kit = r5.none && r5.none.kit;
	A(r5.none && JSON.stringify(r5.none.moves) === JSON.stringify(kit.slice(0, 1)), 'without them, the kit starts with its first move', JSON.stringify(r5.none));
	A(r5.tm && JSON.stringify(r5.tm.moves) === '["flamethrower"]' && r5.tm.tm === 'flamethrower', 'the TM (bought on Charmeleon: the family\'s) swaps kit move 1 for the TM pick, Flamethrower', JSON.stringify(r5.tm));
	A(r5.both && JSON.stringify(r5.both.moves) === JSON.stringify(['flamethrower', kit[1]]) && r5.rep && JSON.stringify(r5.rep.moves) === JSON.stringify(kit.slice(0, 2)), 'Repertoire unlocks kit move 2 at Lv 1 (with the TM: the pick and kit move 2)', JSON.stringify(r5));
	// ======================== 6. the Lab's 9 stat rows retired and refunded
	const r6 = await E(page, async () => {
		const M = G.ExpMeta, row = M.rowNow([]), eff = M.effects(row);
		const nine = ['training', 'stamina', 'agility', 'study', 'trading', 'fortune', 'magnetism', 'leftovers', 'shell'];
		// (the first Expedition run's end already paid the refunds: meta.js record; League HQ's open finds nothing more)
		const owed = G.ExpSave.list('cur.earn').filter(x => /^rf./.test(x)).map(x => x.slice(0, x.lastIndexOf(':'))).sort(), c0 = G.DB.save.coins, paid0 = G.ExpSave.get('rf.paid');
		M.open(() => {}, 'lab');
		const listed = nine.filter(id => document.querySelector('[data-lab="' + id + '"]'));
		const kept = ['refresh', 'skip', 'banish', 'vitamins', 'option', 'revive', 'research', 'support', 'archive'].filter(id => document.querySelector('[data-lab="' + id + '"]')).length;
		const note = (document.getElementById('xm-retired') || {}).textContent || '';
		M.close(true);
		const c1 = G.DB.save.coins;
		return { stats: eff.stats, skip: eff.lab.skip, buy: nine.map(id => M.buyLab(id).error), owed, paid: paid0, hq: c1 - c0, left: M.refundsOwed().length, again: M.refundRetired(), listed, kept, note, lab50: M.ACH_BY.lab50.n,
			bk: Object.keys(localStorage).filter(k => /^micasurvivor_backup\.guest\.exp-refund\./.test(k) || /^micasurvivorexp_backup\.guest\.refund\./.test(k)).length };
	});
	A(r6.stats && Object.keys(r6.stats).length === 0 && r6.skip === 1 && r6.buy.every(e => e === 'retired'), 'the Lab\'s 9 stat rows (Training ... Shell) do nothing in a run and can\'t be bought; Skip still works', JSON.stringify(r6));
	A(JSON.stringify(r6.owed) === '["rf.lab.shell.0","rf.lab.training.0","rf.lab.training.1"]' && r6.paid === 900 + 1215 + 1050 && r6.hq === 0 && r6.left === 0 && r6.again === 0 && r6.bk === 2,
		'their levels are refunded once (Training 1-2 and Shell 1: 3,165 Pokémonedas, at the first run end), after backing both saves up; League HQ pays nothing more', JSON.stringify(r6));
	A(r6.listed.length === 0 && r6.kept === 9 && /Training|Entrenamiento/.test(r6.note) && /Shell|Caparazón/.test(r6.note) && r6.lab50 === 25, 'League HQ lists the 9 rows that stay, says which were retired and refunded; "Profesor" now asks for 25 Lab levels', JSON.stringify(r6));
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
