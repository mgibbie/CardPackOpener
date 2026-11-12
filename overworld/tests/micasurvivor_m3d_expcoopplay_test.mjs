// micasurvivor_m3d_expcoopplay_test.mjs — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): two players in one
// Expedition run, on the page. One window HOSTS a run (?exp=7&host=<name>); another JOINS it (?join=<name>&dex=9),
// knowing only the name. The rules are tested in node (micasurvivor_m3d_expcoop_test.mjs); this is that they hold on
// the page, with real frames:
//   * the guest is sent to the run's page, builds the zone itself and is let in as its own League member
//   * the guest standing on the altar wakes the guardian for both; it falls for both
//   * the team levels; the guest learns its own kit's move
//   * the guest takes the team through the portal: both are on zone 2's level
//   * the guest opens a Poké Ball: the team's money pays, the choice of three comes up on the GUEST's screen, and the
//     item it clicks is its own
//   node overworld/tests/micasurvivor_m3d_expcoopplay_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9857;
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
	const open = async (query, who) => {
		// each in a WINDOW of its own: a tab behind another is not animated
		const cdp = await browser.target().createCDPSession();
		const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true, width: 900, height: 560 });
		const target = await browser.waitForTarget((q) => q._targetId === targetId);
		const page = await target.page();
		await page.setViewport({ width: 900, height: 560, deviceScaleFactor: 1 });
		page.on('pageerror', e => errors.push(who + ' pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(who + ' console: ' + m.text().slice(0, 200)); });
		await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/${query}`, { waitUntil: 'domcontentloaded' });
		const ok = await waitFor(() => page.evaluate(() => !!(window.__m3d && window.__m3d.ready)), 30000);
		return { page, ok };
	};
	const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); console.log('     screenshot: ' + path.join(SHOTS, name)); };
	const hud = (p) => p.evaluate(() => document.getElementById('hud').textContent);
	const hudHas = (p, re, ms = 6000) => waitFor(async () => re.test(await hud(p)), ms);

		const H = await open('?exp=7&dex=6&weather=0&auto=0&host=xc', 'host');
	A(H.ok, 'a run is played and hosted (?exp=7&host=xc)');
	await H.page.evaluate(() => { const m = window.__m3d; m.world.pl.maxHp = m.world.pl.hp = 1e9; });
	const quiet = () => H.page.evaluate(() => { const m = window.__m3d; m.run.acc = -1e9; for (const e of m.world.enemies) if (e !== m.run.boss) e.dead = true; });
	const Gp = await open('?join=xc&dex=9&auto=0', 'guest');
	A(Gp.ok, 'a second player opens ?join=xc as a Blastoise (it does not know what is being played)');
	const both = async () => [await H.page.evaluate(() => { const m = window.__m3d; return { w: m.room.w, altar: m.room.altar.join(), zone: m.run.zone, ph: m.run.ph, mates: m.world.mates.map((q) => q.dex), lv: m.world.pl.level, at: [m.state.x, m.state.z] }; }),
		await Gp.page.evaluate(() => { const m = window.__m3d; return !m || !m.grun || !m.rv || !m.net.joined ? null : { search: location.search, w: m.room.w, altar: m.room.altar.join(), zone: m.grun.zone, ph: m.grun.ph, dex: m.world.pl.mon.dex, moves: m.world.pl.moves.map((q) => q.id), guest: m.world.guest, lv: m.world.pl.level, mates: m.mates().map((q) => q.dex), at: [m.state.x, m.state.z] }; })];
	const agree = (a, b) => !!b && b.zone === a.zone && b.w === a.w && b.altar === a.altar && b.ph === a.ph;
	const joined = await waitFor(async () => { const [a, b] = await both(); return agree(a, b) && a.mates.length === 1 && b.mates.length === 1; }, 45000);   // (and the guest has had the host's first frame: it knows its mate)
	let [h, g] = await both();
	A(joined && /xj=7/.test(g.search) && /map=viridian/.test(g.search) && g.guest && g.dex === 7 && g.moves.join() === 'water-gun' && h.mates.join() === '7' && g.mates[0] === 4, 'it is sent to the run\'s page, builds zone 1 itself and is let in: a Squirtle with its kit\'s first move, beside the host\'s Charmander', JSON.stringify([h, g]));
	A(await hudHas(Gp.page, /Squirtle .water. · League member Squirtle · \w+ · kit 1\/4/) && await hudHas(Gp.page, /ZONE 1\/3 · FINAL SWARM IN \d:\d\d · ALTAR \d+ m/) && await hudHas(Gp.page, /co-op: 2 players/), 'its readout: its own member, the run\'s line, two players', await hud(Gp.page));
	await shot(Gp.page, 'm3d_expcoop_guest.png');

	// ---- the guest wakes the guardian
	await quiet();
	await Gp.page.evaluate(() => { const m = window.__m3d, a = m.room.altar; m.world.pl.maxHp = m.world.pl.hp = 1e9; m.put(a[0], a[2]); });
	const woke = await waitFor(async () => { await quiet(); const [a, b] = await both(); return a.ph === 1 && !!b && b.ph === 1; }, 12000);
	A(woke && await hudHas(Gp.page, /GUARDIAN/) && await waitFor(() => Gp.page.evaluate(() => window.__m3d.noteLog.some((q) => /the guardian, awakens!/.test(q))), 4000), 'the GUEST stands on the altar: the guardian wakes, on both screens', JSON.stringify(await both()));
	await Gp.page.evaluate(() => window.__m3d.respawn());
	await H.page.evaluate(() => { const m = window.__m3d, e = m.run.boss; m.world.hit(e, e.hp + 10, 0, 0, 0); });
	const portal = await waitFor(async () => { const [a, b] = await both(); return a.ph === 2 && !!b && b.ph === 2; }, 8000);
	A(portal, 'it falls: the portal, on both screens');

	// ---- the level the guardian's XP gives: each chooses their own card
	const cards = await waitFor(async () => (await H.page.evaluate(() => window.__m3d.world.pl.level)) >= 2 && (await Gp.page.evaluate(() => window.__m3d.world.pl.level >= 2 && window.__m3d.world.pl.pending === 0)), 12000);
	[h, g] = await both();
	A(cards && g.moves.length >= 2 && g.moves[1] === 'bubble' || (cards && g.moves.length >= 2), `the team levels (Lv ${h.lv}): the guest has its own kit's next move (${g && g.moves.join(', ')})`, JSON.stringify([h, g]));

	// ---- the guest takes the team through the portal
	await quiet();
	await Gp.page.evaluate(() => { const m = window.__m3d, a = m.room.altar; m.put(a[0], a[2]); });
	const z2 = await waitFor(async () => { await quiet(); const [a, b] = await both(); return a.zone === 2 && agree(a, b); }, 15000);
	await sleep(700);
	[h, g] = await both();
	const mate = await H.page.evaluate(() => { const q = window.__m3d.world.mates[0]; return [q.s.x, q.s.z]; });
	A(z2 && Math.hypot(g.at[0] - h.at[0], g.at[1] - h.at[1]) < 5 && Math.hypot(mate[0] - g.at[0], mate[1] - g.at[1]) < 1, 'the GUEST steps into the portal: both are on zone 2\'s level, side by side, and the host has the guest there', JSON.stringify([h, g, mate]));
	await shot(Gp.page, 'm3d_expcoop_zone2.png');
	await shot(H.page, 'm3d_expcoop_host.png');

	// ---- the guest opens a Poké Ball on the team's money
	await quiet();
	await H.page.evaluate(() => { window.__m3d.run.coins = 60; });
	await Gp.page.evaluate(() => { const m = window.__m3d, o = m.rv.eco.find((q) => q.kind === 'ball'); m.world.autoPick = undefined; m.put(o.x, o.z); });
	const up = await waitFor(async () => { await quiet(); return Gp.page.evaluate(() => !!window.__m3d.grun.pick && document.querySelectorAll('#cards button[data-p]').length === 3); }, 10000);
	const b0 = await Promise.all([H.page.evaluate(() => ({ coins: window.__m3d.run.coins, pick: !!window.__m3d.run.pick, items: Object.keys(window.__m3d.world.pl.xi).length, t: window.__m3d.world.t })),
		Gp.page.evaluate(() => ({ title: document.querySelector('#cards h2').textContent, ids: window.__m3d.grun.pick.ids, items: Object.keys(window.__m3d.world.pl.xi).length }))]);
	A(up && b0[0].coins === 42 && !b0[0].pick && /Poké Ball · Choose 1 of 3/.test(b0[1].title), `the GUEST stands on a Poké Ball: the team pays its 18 ₽, and the three items come up on the guest's screen (not the host's)`, JSON.stringify(b0));
	await shot(Gp.page, 'm3d_expcoop_ball.png');
	await Gp.page.click('#cards button[data-p="2"]');
	const b1 = await Promise.all([H.page.evaluate(() => ({ items: Object.keys(window.__m3d.world.pl.xi).length, t: window.__m3d.world.t })), Gp.page.evaluate(() => ({ items: Object.keys(window.__m3d.world.pl.xi), pick: !!window.__m3d.grun.pick, shown: document.getElementById('cards').style.display }))]);
	A(!b1[1].pick && b1[1].items.join() === b0[1].ids[2] && b1[1].shown === 'none' && b1[0].items === b0[0].items && b1[0].t > b0[0].t, 'it clicks the third: the item is the guest\'s, the host has nothing new, and the fight never stopped', JSON.stringify(b1));
	A(errors.length === 0, 'no page errors on either side', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
