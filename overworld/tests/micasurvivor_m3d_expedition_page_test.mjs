// micasurvivor_m3d_expedition_page_test.mjs — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): a Classic Expedition
// run on the page (/micasurvivor/m3d/?exp=<seed>). The run's rules are tested in node
// (micasurvivor_m3d_expedition_test.mjs); this is that they hold on the page, with real frames:
//   * the page boots into zone 1 of the run with the 2D game's plan, and says where the altar is
//   * the zone's own species arrive and are drawn
//   * standing on the altar wakes the guardian; beaten, the portal opens; the portal is the next zone: the page shows
//     the new level (the old one's meshes are gone, the minimap is the new one's)
//   * a level-up: Expedition's own cards (a rarity, a move first), the three tools, and with two levels waiting the
//     second set of cards comes up when the first is taken
//   * the economy: the zone's things are drawn and on the minimap; a gold rock pays; a Poké Ball opens a choice of
//     three items that holds the fight, and the one clicked is yours
//   * capture: an alpha faints, you stand by it, the ball shakes while the world holds, and it follows you as a
//     Support Alpha
//   * the final swarm is announced at 10:00 of the zone's clock
//   * the whole run to the shrine and the legendary: the page says the expedition is complete, with its score
//   * a League run (the page's default): you start as the member's first stage with its kit's first move, and are
//     drawn as the stage you become when you evolve
//   * Survival (&mode=survival): the countdown to the first milestone, its boss, and a pact chosen from its cards
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
	A(await hudHas(/ZONE 1\/3 · FINAL SWARM IN 9:\d\d · ALTAR \d+ m · ₽ 0 · charge 0 %/), 'the readout says the zone, the final swarm\'s countdown and how far the altar is', await hud());

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
	const c2 = await page.evaluate(() => { const m = window.__m3d; return { pending: m.world.pl.pending, coins: m.run.coins, shown: document.getElementById('cards').style.display, moves: m.world.pl.moves.map((q) => q.id + (q.xlv || 1)) }; });
	A(c2.pending === 0 && c2.coins === 10 && c2.shown === 'none' && await hudHas(/vitamins: .* · ₽ 10 · luck 0/), 'Skip (G): no card, 10 of the run\'s money; the readout shows the vitamins, the money and the luck', JSON.stringify(c2) + (await hud()));
	await page.evaluate(() => { window.__m3d.world.autoPick = 0; });   // (from here the test takes the first card of any level)

	// ---- the economy: a rock, a ball
	const things = await page.evaluate(() => window.__m3d.ecoView().map((o) => o.kind));
	A(things.includes('ball') && things.includes('rock') && things.length >= 12, `the zone holds ${things.length} things to find (balls, rocks, altars…)`, things.join());
	const goTo = (kind) => page.evaluate((k) => { const m = window.__m3d, o = m.ecoView().find((q) => q.kind === k); m.run.acc = -1e9; for (const e of m.world.enemies) e.dead = true; m.put(o.x, o.z); return o.i; }, kind);
	await goTo('rock');
	const paid = await waitFor(() => page.evaluate(() => window.__m3d.run.coins > 10), 3000);
	A(paid && await hudHas(/ZONE 1\/3 .* · ₽ \d\d/), 'a gold rock, touched: its ₽ are in the readout', await hud());
	await page.evaluate(() => { window.__m3d.run.coins = 60; window.__m3d.world.autoPick = undefined; });   // (this choice is made by hand)
	await goTo('ball');
	const open = await waitFor(() => page.evaluate(() => !!window.__m3d.run.pick && document.querySelectorAll('#cards button[data-p]').length === 3), 4000);
	const p0 = await page.evaluate(() => { const m = window.__m3d; return { ids: m.run.pick.ids, coins: m.run.coins, t: m.world.t, title: document.querySelector('#cards h2').textContent, first: document.querySelector('#cards button[data-p] b').textContent }; });
	A(open && p0.coins === 42 && /Poké Ball · Choose 1 of 3/.test(p0.title), `a Poké Ball: 18 ₽, and three items to choose from ("${p0.first}" …)`, JSON.stringify(p0));
	await shot('m3d_exp_ball.png');
	await sleep(400);
	const held = await page.evaluate(() => window.__m3d.world.t);
	A(held === p0.t, 'the fight holds while you choose');
	await page.click('#cards button[data-p="1"]');
	const p1 = await page.evaluate(() => { const m = window.__m3d; return { pick: !!m.run.pick, items: Object.keys(m.world.pl.xi), shown: document.getElementById('cards').style.display }; });
	A(!p1.pick && p1.items.length === 1 && p1.items[0] === p0.ids[1] && p1.shown === 'none' && await hudHas(new RegExp('items: ' + p0.ids[1])), 'click the second: it is yours (the readout lists it), and the fight goes on', JSON.stringify(p1));
	await page.evaluate(() => { window.__m3d.world.autoPick = 0; });

	// ---- capture: an alpha faints and joins you
	await page.evaluate(() => { const m = window.__m3d; m.run.acc = -1e9; for (const e of m.world.enemies) e.dead = true; m.respawn(); });
	await sleep(200);
	const al = await page.evaluate(() => { const m = window.__m3d; for (let k = 1; k < 40; k++) { m.fire({ at: 0, kind: 'alpha', n: 1, dex: [74], seed: k }); const e = m.world.enemies.find((q) => q.xk === 'alpha' && !q.dead); if (e) { e.dummy = true; m.world.hit(e, 1e12, 0, 0, 0); return { hp: e.hp, floor: e.hpFloor }; } } return null; });
	const down = await waitFor(() => page.evaluate(() => window.__m3d.capView().faint.length === 1), 3000);
	A(al && al.hp === 1 && down, 'an alpha Geodude is beaten down to 1 HP: it faints, and waits');
	await shot('m3d_exp_faint.png');
	await page.evaluate(() => { const m = window.__m3d, f = m.capView().faint[0]; m.run.acc = -1e9; m.put(f.x + 1, f.z); });
	const thrown = await waitFor(() => page.evaluate(() => !!window.__m3d.capView().cine), 3000);
	const t0 = await page.evaluate(() => window.__m3d.world.t);
	await sleep(1200);
	const mid = await page.evaluate(() => ({ t: window.__m3d.world.t, phase: (window.__m3d.capView().cine || { phase: {} }).phase.n }));
	A(thrown && mid.t === t0 && /shake|drop|absorb|click/.test(mid.phase), `stand by it: the Friend Ball goes out and the world holds while it shakes (${mid.phase})`, JSON.stringify(mid));
	await shot('m3d_exp_ball_shake.png');
	const joined = await waitFor(() => page.evaluate(() => window.__m3d.run.cap.sa.length === 1), 6000);
	A(joined && await hudHas(/team: Geodude .rock./), 'then Geodude joins your team (the readout names it)', await hud());
	await page.evaluate(() => { window.__m3d.setInput({ mx: 1, mz: 0 }); });
	await sleep(1500);
	const fol = await page.evaluate(() => { const m = window.__m3d, a = m.capView().sa[0]; m.setInput(null); return { d: Math.hypot(a.x - m.state.x, a.z - m.state.z), sheet: !!m.sheets.get('74/Walk') }; });
	A(fol.d < 9 && fol.sheet, `and follows you as you run (${fol.d.toFixed(1)} m behind), drawn as itself`, JSON.stringify(fol));
	await shot('m3d_exp_support.png');

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
	A(over && end.splits === 4 && end.bosses === 4 && await hudHas(/EXPEDITION COMPLETE! Map complete! · score \d+ · pay \d+ · champion medal/), 'three seconds later the run is over: the page shows the result, the score, the pay and the medal', await hud());
	await sleep(500);
	const still = await page.evaluate(() => window.__m3d.world.t);
	A(still === end.t, 'and the run has stopped');
	await shot('m3d_exp_over.png');
	// ---- a League run: the page's default
	await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/?exp=9&dex=6&weather=0&auto=0`, { waitUntil: 'domcontentloaded' });
	const ok2 = await waitFor(() => page.evaluate(() => !!(window.__m3d && window.__m3d.ready && window.__m3d.run && window.__m3d.run.lg)), 30000);
	const l0 = await page.evaluate(() => { const m = window.__m3d; return { member: m.run.lg.member, dex: m.world.pl.mon.dex, moves: m.world.pl.moves.map((q) => q.id), hp: m.world.pl.maxHp }; });
	A(ok2 && l0.member === 4 && l0.dex === 4 && l0.moves.join() === 'ember' && l0.hp === 88 && await hudHas(/Charmander .fire. · League member Charmander · assault · kit 1\/4/), 'asked for as Charizard with no moves named, the page starts a League run: Charmander, its kit\'s first move', JSON.stringify(l0) + (await hud()));
	const drawn4 = await waitFor(() => page.evaluate(() => !!window.__m3d.sheets.get('4/Idle')), 10000);
	A(drawn4, 'and it is drawn as a Charmander');
	await page.evaluate(() => { const m = window.__m3d, s = m.state; m.world.pl.maxHp = m.world.pl.hp = 1e9; m.run.acc = -1e9; m.drop('xp', s.x, s.z, 6000); });
	const evolved = await waitFor(() => page.evaluate(() => window.__m3d.run.lg.form === 5 && window.__m3d.world.pl.pending === 0), 20000);
	const l1 = await page.evaluate(() => { const m = window.__m3d; return { lv: m.world.pl.level, form: m.run.lg.form, kit: m.run.lg.kit, moves: m.world.pl.moves.length }; });
	A(evolved && l1.lv >= 16 && l1.kit === 4 && l1.moves === 4 && await hudHas(/Charmeleon .fire. · League member Charmander · assault · kit 4\/4/), `a lot of XP later (Lv ${l1.lv}): the whole kit, and a Charmeleon`, JSON.stringify(l1) + (await hud()));
	const drawn5 = await waitFor(() => page.evaluate(() => !!window.__m3d.sheets.get('5/Idle') && !!window.__m3d.sheets.get('5/Walk')), 10000);
	A(drawn5, 'drawn as a Charmeleon now');
	await shot('m3d_exp_league.png');
	// ---- Survival
	await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/?exp=5&mode=survival&dex=6&weather=0`, { waitUntil: 'domcontentloaded' });
	const ok3 = await waitFor(() => page.evaluate(() => !!(window.__m3d && window.__m3d.ready && window.__m3d.run && window.__m3d.run.sv)), 30000);
	A(ok3 && await hudHas(/SURVIVAL · PHASE 1 · BOSS IN 4:5\d · ₽ 0/), 'a Survival run on the page: the readout counts down to the first milestone', await hud());
	await page.evaluate(() => { const m = window.__m3d, w = m.world; w.pl.maxHp = w.pl.hp = 1e9; w.pl.xpMul = 0; m.run.acc = -1e9; m.run.sv.seg = 0; m.run.sv.segEv = []; w.t = 299.5; });
	const mile = await waitFor(() => page.evaluate(() => !!window.__m3d.run.boss && window.__m3d.run.sv.miles === 1), 6000);
	A(mile && await hudHas(/BOSS /) && await waitFor(() => page.evaluate(() => window.__m3d.noteLog.some((q) => /Milestone boss: /.test(q))), 3000), 'at 5:00 the milestone boss arrives, announced', await hud());
	await page.evaluate(() => { const m = window.__m3d, e = m.run.boss; m.world.hit(e, e.hp + 10, 0, 0, 0); });
	const pact = await waitFor(() => page.evaluate(() => !!window.__m3d.run.pick && window.__m3d.run.pick.kind === 'pact' && document.querySelectorAll('#cards button[data-p]').length === 4), 6000);
	const pk = await page.evaluate(() => ({ title: document.querySelector('#cards h2').textContent, cards: [...document.querySelectorAll('#cards button[data-p] b')].map((b) => b.textContent), ids: window.__m3d.run.pick.cards.map((c) => c.id), none: document.querySelector('#cards .tools button').textContent }));
	A(pact && /A pact: a boon for a price · Milestone 1 · choose 1 of 3/.test(pk.title) && pk.cards.length === 3 && /No pact/.test(pk.none), `beaten: three pacts on the screen, or none (${pk.cards.slice(0, 3).join(', ')})`, JSON.stringify(pk));
	await shot('m3d_exp_pact.png');
	await page.click('#cards button[data-p="0"]');
	const sealed = await page.evaluate(() => ({ pacts: window.__m3d.run.sv.pacts, pick: !!window.__m3d.run.pick }));
	A(!sealed.pick && sealed.pacts.join() === pk.ids[0] && await hudHas(new RegExp('pacts: ' + pk.ids[0])), 'click one: sealed, and in the readout', JSON.stringify(sealed));
	// hostile ground: walk into the mud
	const mud = await page.evaluate(() => { const m = window.__m3d, o = m.hazards().find((q) => q.kind === 'mud'); m.run.acc = -1e9; for (const e of m.world.enemies) e.dead = true; m.put(o.x, o.z); return { n: m.hazards().length, kinds: [...new Set(m.hazards().map((q) => q.kind))] }; });
	A(mud.n >= 2 && mud.kinds.join() === 'mud' && await hudHas(/ · MUD/), `the land's hostile ground (${mud.n} patches awake in phase 1, all mud): standing in one, the readout says MUD`, JSON.stringify(mud) + (await hud()));
	await shot('m3d_exp_mud.png');
	await page.evaluate(() => { const m = window.__m3d; m.world.t = 2760; m.run.sv.miles = 99; m.run.sv.seg = 9; m.run.sv.segEv = []; m.run.sv.nextMig = 1e9; });
	const dark = await waitFor(() => page.evaluate(() => /brightness\(0\.7/.test(document.getElementById('c').style.filter)), 4000);
	A(dark && await hudHas(/NIGHT ×1\.1/), 'at 46:00 the Endless Night: the screen darkens, and the readout counts it', await page.evaluate(() => document.getElementById('c').style.filter));
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
