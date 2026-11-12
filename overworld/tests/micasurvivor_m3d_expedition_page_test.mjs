// micasurvivor_m3d_expedition_page_test.mjs — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): a Classic Expedition
// run on the page (/micasurvivor/m3d/?exp=<seed>). The run's rules are tested in node
// (micasurvivor_m3d_expedition_test.mjs); this is that they hold on the page, with real frames:
//   * the page boots into zone 1 of the run with the 2D game's plan, and says where the altar is
//   * the zone's own species arrive and are drawn
//   * standing on the altar wakes the guardian; beaten, the portal opens; the portal is the next zone: the page shows
//     the new level (the old one's meshes are gone, the minimap is the new one's)
//   * a level-up: Expedition's own cards (a rarity, a move first), the three tools, and with two levels waiting the
//     second set of cards comes up when the first is taken
//   * the final swarm is announced at 10:00 of the zone's clock
//   * the whole run to the shrine and the legendary: the page says the expedition is complete, with its score
//   node overworld/tests/micasurvivor_m3d_expedition_page_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9843;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 800) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
const errors = [];
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 900, height: 560, deviceScaleFactor: 1 });
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
	const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); console.log('     screenshot: ' + path.join(SHOTS, name)); };
	const hud = () => page.evaluate(() => document.getElementById('hud').textContent);
	const hudHas = (re, ms = 5000) => waitFor(async () => re.test(await hud()), ms);

	await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/?exp=7&map=viridian&dex=6&moves=ember:3&weather=0&ability=0`, { waitUntil: 'domcontentloaded' });
	const ok = await waitFor(() => page.evaluate(() => !!(window.__m3d && window.__m3d.ready)), 30000);
	A(ok, 'the page boots into an Expedition run (?exp=7)');
	await page.evaluate(() => { const w = window.__m3d.world; w.pl.maxHp = w.pl.hp = 1e9; });   // (the run's course is what is tested)
	const s0 = await page.evaluate(() => { const m = window.__m3d, G = window.G, p = G.ExpClassic.plan(7, 'viridian', 1, 'normal'); return { zone: m.run.zone, ph: m.run.ph, w: m.room.w, same: JSON.stringify(m.run.plan) === JSON.stringify(p), guardian: G.DEX_BY[p.guardian].name, altar: m.room.altar, map: document.getElementById('map').style.display }; });
	A(s0.zone === 1 && s0.ph === 0 && s0.w === 51 && s0.same && s0.map === 'block', `zone 1 of the run: a 7 x 7-tile level, the 2D game's plan for it (guardian: ${s0.guardian}), the minimap up`, JSON.stringify(s0));
	A(await hudHas(/ZONE 1\/3 · FINAL SWARM IN 9:\d\d · ALTAR \d+ m · charge 0 %/), 'the readout says the zone, the final swarm\'s countdown and how far the altar is', await hud());

	// ---- arrivals: the zone's own species, drawn
	const arrived = await waitFor(() => page.evaluate(() => window.__m3d.world.stats.spawned >= 3 && window.__m3d.world.enemies.length >= 1), 30000);
	const a0 = await page.evaluate(() => { const m = window.__m3d, cards = m.run.plan.cards.slice(0, 4).concat(m.run.plan.wander); return { n: m.world.stats.spawned, own: m.world.enemies.every((e) => cards.includes(e.dex)) }; });
	A(arrived && a0.own, `the zone's first species arrive (${a0.n} so far)`, JSON.stringify(a0));
	const drawn = await waitFor(() => page.evaluate(() => { const m = window.__m3d; return m.world.enemies.some((e) => { const s = m.sheets.get(e.dex + '/Walk'); return !!(s && s.img); }); }), 15000);
	A(drawn, 'and they are drawn');
	await shot('m3d_exp_zone1.png');

	// ---- a level-up: Expedition's cards and tools
	await page.evaluate(() => { const m = window.__m3d, s = m.state; m.drop('xp', s.x, s.z, 90); });   // (enough for two levels)
	const cardsUp = await waitFor(() => page.evaluate(() => document.querySelectorAll('#cards button[data-i]').length === 3), 6000);
	const c0 = await page.evaluate(() => { const m = window.__m3d, cs = m.world.pl.choices; return { pending: m.world.pl.pending, first: cs[0].kind, keys: cs.map((q) => q.key), tools: [...document.querySelectorAll('#cards .tools button')].map((b) => b.textContent), xpNext: m.world.pl.xpNext, need: window.G.ExpLevel.need(m.world.pl.level) }; });
	A(cardsUp && c0.pending === 2 && c0.first === 'move' && c0.tools.length === 3 && /Refresh .2./.test(c0.tools[0]) && /Skip .2./.test(c0.tools[1]) && /Banish .1./.test(c0.tools[2]) && c0.xpNext === c0.need, 'XP for two levels: three Expedition cards (a move first) and the tools Refresh, Skip and Banish; the curve is Expedition\'s', JSON.stringify(c0));
	await shot('m3d_exp_cards.png');
	await page.click('#cards .tools button[data-tool="refresh"]');
	const c1 = await page.evaluate(() => ({ keys: window.__m3d.world.pl.choices.map((q) => q.key), left: window.__m3d.run.lv.refreshes, label: document.querySelector('#cards .tools button').textContent }));
	A(c1.keys.join() !== c0.keys.join() && c1.left === 1 && /Refresh .1./.test(c1.label), 'Refresh: other cards, one Refresh left', JSON.stringify(c1));
	await page.click('#cards button[data-i="0"]');
	const second = await waitFor(() => page.evaluate(() => { const m = window.__m3d; return m.world.pl.pending === 1 && !!m.world.pl.choices && document.querySelectorAll('#cards button[data-i]').length === 3 && document.getElementById('cards').style.display === 'grid'; }), 3000);
	A(second, 'one card taken: the second level\'s cards come up at once');
	await page.keyboard.press('KeyG');
	const c2 = await page.evaluate(() => { const m = window.__m3d; return { pending: m.world.pl.pending, coins: m.run.lv.coins, shown: document.getElementById('cards').style.display, moves: m.world.pl.moves.map((q) => q.id + (q.xlv || 1)) }; });
	A(c2.pending === 0 && c2.coins === 10 && c2.shown === 'none' && await hudHas(/vitamins: .* · ₽ 10 · luck 0/), 'Skip (G): no card, 10 of the run\'s money; the readout shows the vitamins, the money and the luck', JSON.stringify(c2) + (await hud()));
	await page.evaluate(() => { window.__m3d.world.autoPick = 0; });   // (from here the test takes the first card of any level)

	// ---- the altar, the guardian, the portal
	const hush = () => page.evaluate(() => { const m = window.__m3d; m.run.acc = -1e9; for (const e of m.world.enemies) if (e !== m.run.boss) e.dead = true; });
	const onAltar = () => page.evaluate(() => { const m = window.__m3d, a = m.room.altar; m.put(a[0], a[2]); });
	await hush(); await onAltar();
	const woke = await waitFor(() => page.evaluate(() => window.__m3d.run.ph === 1), 8000);
	const g = await page.evaluate(() => { const m = window.__m3d, e = m.run.boss; return e ? { dex: e.dex, plan: m.run.plan.guardian, hp: e.maxHp, boss: e.boss } : null; });
	A(woke && g && g.dex === g.plan && g.boss && await hudHas(/GUARDIAN/) && await hudHas(/BOSS /), `three seconds on the altar: the guardian wakes (${g && g.hp} HP), and the readout says so`, await hud());
	await shot('m3d_exp_guardian.png');
	await page.evaluate(() => { const m = window.__m3d, e = m.run.boss; m.world.hit(e, e.hp + 10, 0, 0, 0); });
	A(await waitFor(() => page.evaluate(() => window.__m3d.run.ph === 2), 4000) && await hudHas(/PORTAL \d+ m/), 'beaten: the portal opens', await hud());
	const before = await page.evaluate(() => ({ tris: window.__m3d.stats().triangles, w: window.__m3d.room.w, altar: window.__m3d.room.altar.join() }));
	await hush(); await onAltar();
	const z2 = await waitFor(() => page.evaluate(() => window.__m3d.run.zone === 2), 6000);
	await sleep(400);
	const after = await page.evaluate(() => { const m = window.__m3d, s = m.state, sp = m.room.spawn; return { zone: m.room.zone, altar: m.room.altar.join(), at: Math.hypot(s.x - sp[0], s.z - sp[2]), split: m.run.splits[0], enemies: m.world.enemies.length, same: m.world.room === m.room, mapW: document.getElementById('map').width }; });
	A(z2 && after.zone === 2 && after.same && after.altar !== before.altar && after.at < 3 && after.split > 0 && after.mapW === 51 * 4 && await hudHas(/ZONE 2\/3/), `the portal is zone 2: a new level on the page, you where it starts, the split kept (${after.split && after.split.toFixed(1)} s)`, JSON.stringify(after));
	await shot('m3d_exp_zone2.png');

	// ---- the final swarm
	await page.evaluate(() => window.__m3d.setZoneTime(599.5));
	A(await hudHas(/FINAL SWARM!/, 6000), 'at 10:00 of the zone\'s clock the readout says FINAL SWARM!', await hud());

	// ---- the rest of the run
	const clearZone = async (z) => {
		await page.evaluate(() => { window.__m3d.run.plan.events = []; });
		await hush(); await onAltar();
		if (!await waitFor(async () => { await hush(); return page.evaluate(() => !!window.__m3d.run.boss); }, 9000)) return false;
		await page.evaluate(() => { const m = window.__m3d, e = m.run.boss; m.world.hit(e, e.hp + 10, 0, 0, 0); });
		if (z === 4) return waitFor(() => page.evaluate(() => window.__m3d.run.won), 4000);
		if (!await waitFor(() => page.evaluate(() => window.__m3d.run.ph === 2), 4000)) return false;
		await hush(); await onAltar();
		return waitFor(async () => { await hush(); return page.evaluate((q) => window.__m3d.run.zone === q + 1, z); }, 6000);
	};
	const z2ok = await clearZone(2), z3ok = await clearZone(3);
	const sh = await page.evaluate(() => { const m = window.__m3d; return { zone: m.run.zone, shrine: !!m.room.shrine, w: m.room.w, enemies: m.world.enemies.length }; });
	A(z2ok && z3ok && sh.zone === 4 && sh.shrine && sh.w === 44 && await hudHas(/SHRINE · ALTAR/), 'zones 2 and 3 cleared: the third portal leads to the shrine', JSON.stringify(sh));
	await shot('m3d_exp_shrine.png');
	const won = await clearZone(4);
	A(won && await hudHas(/COMPLETE!/), 'the legendary falls at the pedestal: the expedition is complete', await hud());
	const over = await waitFor(() => page.evaluate(() => window.__m3d.run.ended), 6000);
	const end = await page.evaluate(() => { const m = window.__m3d, r = m.run; return { splits: r.splits.length, bosses: r.bosses.length, t: m.world.t }; });
	A(over && end.splits === 4 && end.bosses === 4 && await hudHas(/EXPEDITION COMPLETE! Map complete! · score \d+/), 'three seconds later the run is over: the page shows the result and the score', await hud());
	await sleep(500);
	const still = await page.evaluate(() => window.__m3d.world.t);
	A(still === end.t, 'and the run has stopped');
	await shot('m3d_exp_over.png');
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
