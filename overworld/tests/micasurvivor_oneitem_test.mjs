// micasurvivor_oneitem_test.mjs — MicaSurvivor DLC D17 (owner 2026-10-26, as changed the same day: "maybe we can keep the
// backpack/more items in expedition and just have 1 slot for an equipped held item in both modes").
// Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md "2026-10-26 owner request" and "D17 built"; micasurvivor/README.md "DLC D17".
// Headless Chrome, a fixed guest profile, one browser at a time:
//   B1. base: Backpack is retired (kept in G.Upgrades.BY, marked; sanitize keeps its level; it does nothing; the shop doesn't
//       list it) and its price is refunded ONCE when the menu opens, after a backup of the save; a second visit pays nothing
//   B2. a run has exactly ONE held-item slot: the first item is worn, the second opens the replace screen with that one item;
//       the HUD draws one slot; the Tower never offers "Double baggage" any more (forced or rolled)
//   B3. two devices that refund while apart, merged both ways: the refund is paid once per account; a rollback takes this
//       device's back and it is never paid again
//   E1. Expedition: the stacking inventory is unchanged (60 items stacking to their caps, 3 vitamin slots); every boss also
//       drops ONE base held item (seeded, from the ones no stacking item duplicates), worn in the one held slot, and a second
//       one opens base's replace screen; dv 16
//   node overworld/tests/micasurvivor_oneitem_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites.)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 8896;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const T0 = Date.now();

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(/^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
// Backpack bought for two Pokémon (7,500 each): 15,000 to refund
const SAVE = {
	v: 3, name: 'Trainer', created: 1, updated: 1, coins: 500,
	owned: { 1: { at: 1, from: 'gacha' }, 4: { at: 1, from: 'starter' }, 7: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 4, partnerShiny: false, starter: 4, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, stats: {},
	pupg: { 4: { hp: 2, bag: 1 }, 7: { bag: 1 } },
};
const BEFORE = (o) => {
	const H = window.__t = { frozen: false, pending: null };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	try {
		localStorage.setItem('micasurvivor_dev', JSON.stringify(o.dev));   // (the base device id is read as JSON)
		localStorage.setItem('micasurvivorexp_dev.guest', o.xdev);
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		if (!localStorage.getItem('micasurvivor_save.guest')) localStorage.setItem('micasurvivor_save.guest', JSON.stringify(o.save));
	} catch (e) { /* the test reports a boot failure */ }
	H.step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) G.Game.debugStep(1, dt); };
	H.sturdy = () => { const pl = G.Game.player; pl.hurt = function () {}; pl.gainXp = () => 0; return pl; };
	H.wipe = () => { for (const e of G.EnemyMgr.all()) e.remote = true; G.EnemyMgr.clear(); };
	/** collect the item pickups near the player (as walking onto them would) -> their values */
	H.collectItems = () => { const got = []; for (const p of G.Pickups.all().filter(p => p.kind === 'item')) { got.push(p.value); G.Game.debugCollect(p); p.kind = 'gone'; } return got; };
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
		await page.evaluateOnNewDocument(BEFORE, Object.assign({ dev: 'donei001', xdev: 'onei01', save: SAVE }, o));
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

	// ======================== B1. Backpack retired and refunded
	const d0 = await bootPage();
	const { page } = d0;
	A(d0.menu, 'boots to the menu as a guest');
	const b1 = await E(page, () => {
		const s = G.DB.save, U = G.Upgrades;
		const bk = Object.keys(localStorage).filter(k => /^micasurvivor_backup\.guest\.refund\./.test(k));
		const pre = bk.length ? JSON.parse(localStorage.getItem(bk[0])) : null;
		const kept = { ...s.pupg[4] }, sane = JSON.parse(JSON.stringify(s)); G.DB.sanitize(sane);
		const again = G.DB.refundRetired();
		return { coins: s.coins, rf: s.rf, bk, preCoins: pre && pre.coins, prePupg: pre && pre.pupg, retired: U.BY.bag && U.BY.bag.retired, live: U.live().map(u => u.id), perks: U.perks({ bag: 1 }).bag,
			kept, saneBag: sane.pupg[4].bag, again, owed: G.DB.refundsOwed().length };
	});
	A(b1.retired === 'D17' && !b1.live.includes('bag') && b1.perks === false && b1.kept.bag === 1 && b1.saneBag === 1, 'Backpack is retired: kept in G.Upgrades.BY (marked D17) so sanitize keeps its level, but it gives nothing and is not on sale', JSON.stringify(b1));
	A(b1.coins - b1.preCoins >= 15000 && b1.coins - b1.preCoins < 16000 && b1.rf && b1.rf['up.4.bag.0:donei001'] === 7500 && b1.rf['up.7.bag.0:donei001'] === 7500 && b1.again === 0 && b1.owed === 0,
		'its price is refunded ONCE when the menu opens: 7,500 for each Pokémon that had it (rf["up.<dex>.bag.0:<device>"]); a second call pays nothing', JSON.stringify({ coins: b1.coins, rf: b1.rf, again: b1.again }));
	A(b1.bk.length === 1 && b1.preCoins === 500 && b1.prePupg && b1.prePupg[4].bag === 1, 'the save was backed up before the refund wrote (micasurvivor_backup.guest.refund.*, coins 500)', JSON.stringify(b1.bk));
	const shop = await E(page, () => { document.querySelector('#scr-menu [data-go=upgrades]').click(); const names = [...document.querySelectorAll('#upg-list .upg-item b')].map(b => b.textContent); return { names, n: names.length }; });
	A(shop.n > 0 && !shop.names.some(n => /Mochila|Backpack/.test(n)), 'the Upgrades shop no longer lists Backpack', JSON.stringify(shop));
	// a reload: still paid once
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden') && document.getElementById('scr-menu') && !document.getElementById('scr-menu').classList.contains('hidden')), 30000);
	const b1r = await E(page, () => ({ coins: G.DB.save.coins, rf: Object.keys(G.DB.save.rf || {}).length }));
	A(b1r.coins === b1.coins && b1r.rf === 2, 'after a reload the menu pays nothing more', JSON.stringify(b1r));
	// ======================== B2. one held slot in a run; the Tower never offers Double baggage
	const b2 = await E(page, () => {
		const H = window.__t;
		G.Audio.sfx = () => {}; G.Audio.music = () => {};
		G.Flow.play('normal');
		H.freeze(); H.sturdy(); H.wipe();
		const pl = G.Game.player;
		const slots = pl.itemSlots();
		G.Game.offerItem('leftovers');
		const first = { item: pl.item, item2: pl.item2, state: G.Game.state };
		G.Game.offerItem('shellbell');
		const shown = !document.getElementById('scr-item').classList.contains('hidden');
		const cards = [...document.querySelectorAll('#item-cards .card')].map(c => c.textContent.replace(/\s+/g, ' ').trim().slice(0, 40));
		const st = G.Game.state;
		const c = document.createElement('canvas').getContext('2d');
		G.HUD.draw(c, 1280, 720, pl, G.Game.st);
		return { slots, first, shown, cards, st, bag: pl.bag };
	});
	A(b2.slots === 1 && b2.bag === false && b2.first.item === 'leftovers' && !b2.first.item2 && b2.first.state === 'playing', 'a run has ONE held-item slot (Backpack gives no second): the first item is simply worn', JSON.stringify(b2));
	A(b2.shown && b2.st === 'choice' && b2.cards.length === 2, 'a second item opens the replace screen: the one you wear or the new one', JSON.stringify(b2));
	const tw = await E(page, () => {
		const T = G.Tower, seen = new Set();
		T.debugLegend('l_bag');
		for (const c of T.riskCards()) seen.add(c.id);
		const forced = [...seen];
		for (let i = 0; i < 400; i++) { T.debugLegend(T.LEGENDS[i % T.LEGENDS.length].id); for (const c of T.riskCards()) seen.add(c.id); }
		return { forced, any: seen.has('l_bag'), retired: T.BY.l_bag && T.BY.l_bag.retired, legends: T.LEGENDS.filter(l => seen.has(l.id)).map(l => l.id) };
	});
	A(tw.retired === 'D17' && !tw.any && !tw.forced.includes('l_bag') && tw.legends.length === 3, 'the Tower never offers "Double baggage" (retired, even when forced); its other 3 legendary pacts still come', JSON.stringify(tw));
	await d0.ctx.close();
	// ======================== B3. two devices
	const devA = await bootPage({ dev: 'daaaa001' }), devB = await bootPage({ dev: 'dbbbb002' });
	const snap = page => E(page, () => ({ coins: G.DB.save.coins, base: JSON.parse(JSON.stringify(G.DB.save)) }));
	const sa = await snap(devA.page), sb = await snap(devB.page);
	// (each device's boot may earn its own coins too, e.g. the daily login: both count, once each)
	const want = sa.coins;   // (one refund in the merged balance: what each device had alone)
	A(Object.keys(sa.base.rf || {}).length === 2 && Object.keys(sb.base.rf || {}).length === 2, 'two devices apart each refund it (15,000 each)', JSON.stringify([sa.coins, sb.coins]));
	const merge = (page, other) => E(page, (o) => {
		const s = G.DB.save, m = G.DB.merge(JSON.parse(JSON.stringify(s)), o.base);
		for (const k of Object.keys(s)) delete s[k];
		Object.assign(s, m);
		const took = G.DB.reconcileRefunds(), paid = G.DB.refundRetired();
		return { took, paid, coins: s.coins, base: JSON.parse(JSON.stringify(s)) };
	}, other);
	const mb = await merge(devB.page, sa);
	A(mb.took === 15000 && mb.paid === 0 && mb.coins === want, 'device B merges A\'s save: its copy of the refund is taken back once; the balance holds ONE refund', JSON.stringify({ took: mb.took, paid: mb.paid, coins: mb.coins }));
	const ma = await merge(devA.page, mb);
	A(ma.took === 0 && ma.paid === 0 && ma.coins === want, 'device A then merges B\'s: nothing moves, the same balance', JSON.stringify({ took: ma.took, coins: ma.coins }));
	const mb2 = await merge(devB.page, ma);
	A(mb2.took === 0 && mb2.paid === 0 && mb2.coins === want, 'and again: nothing (idempotent)', JSON.stringify({ took: mb2.took, coins: mb2.coins }));
	const rb = await E(devA.page, () => { const took = G.DB.rollbackRefunds(); const c = G.DB.save.coins; const again = G.DB.refundRetired(); return { took, c, again, twice: G.DB.rollbackRefunds() }; });
	A(rb.took === 15000 && rb.c === want - 15000 && rb.again === 0 && rb.twice === 0, 'a rollback takes this device\'s refund back and it is never paid again', JSON.stringify(rb));
	await devA.ctx.close(); await devB.ctx.close();

	// ======================== E1. Expedition
	const dx = await bootPage({ dev: 'dxone001', xdev: 'xone01' });
	const e1 = await E(dx.page, async () => {
		const H = window.__t;
		H.thaw();
		const ok = await G.Expedition.load().catch(e => String(e));
		if (ok !== true) return { error: String(ok) };
		await G.ExpSave.open();
		await G.Flow.play('exp-classic');
		H.freeze(); H.sturdy(); H.wipe();
		const pl = G.Game.player, I = G.ExpItems, X = G.ExpLevel;
		// the stacking inventory: as before
		const n0 = I.ITEMS.length, vit = I.slots(pl), cap = I.IT.leftovers.cap;
		for (let i = 0; i < cap + 1; i++) G.Game.offerItem(I.PREFIX + 'leftovers');
		const stack = pl.xi.leftovers, held0 = pl.item;
		// a boss falls: it drops one base held item too
		const boss = () => { const e = new G.Enemy({ dex: 74, hp: 10, spd: 0, dmg: 0, xp: 1, behavior: 'chase' }, pl.x + 60, pl.y, { hp: 1, spd: 0, dmg: 0 }, true); G.EnemyMgr.add(e); e.hurt(1e9); H.step(3); return e; };
		boss();
		const drops1 = G.Pickups.all().filter(p => p.kind === 'item').map(p => p.value);
		const got1 = H.collectItems();
		const worn = pl.item, state1 = G.Game.state;
		boss();
		const drops2 = G.Pickups.all().filter(p => p.kind === 'item').map(p => p.value);
		H.collectItems();
		const shown = !document.getElementById('scr-item').classList.contains('hidden'), st2 = G.Game.state;
		return { n0, vit, cap, stack, held0, drops1, got1, worn, state1, drops2, shown, st2, pool: X.K.HELD_POOL, dups: X.K.HELD_POOL.filter(id => I.IT[id]), slots: pl.itemSlots(), dv: G.Expedition.DV, xi: Object.keys(pl.xi) };
	});
	A(e1.dv === 19 && e1.n0 === 60 && e1.vit === 3 && e1.stack === e1.cap && e1.held0 === null, 'Expedition keeps its stacking inventory as it was: 60 items stacking to their caps (Leftovers to ' + e1.cap + '), 3 vitamin slots, and a stacking pickup never takes the held slot; dv 16', JSON.stringify(e1));
	const heldDrop = e1.drops1 ? e1.drops1.filter(v => e1.pool.includes(v)) : [];
	A(heldDrop.length === 1 && e1.drops1.some(v => /^x:/.test(v)) && e1.dups.length === 0, 'a boss drops its stacking item AND one base held item (from the 7 no stacking item duplicates)', JSON.stringify({ drops: e1.drops1, pool: e1.pool }));
	A(e1.slots === 1 && e1.worn === heldDrop[0] && e1.state1 === 'playing', 'the held item is worn in the ONE held slot (no screen while it is empty)', JSON.stringify(e1));
	A(e1.drops2 && e1.drops2.some(v => e1.pool.includes(v) && v !== e1.worn) && e1.shown && e1.st2 === 'choice', 'the next boss\'s held item opens base\'s replace screen', JSON.stringify(e1));
	await dx.ctx.close();

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
