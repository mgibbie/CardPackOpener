// micasurvivor_m3d_coopplay_test.mjs — MicaSurvivor 3D, P3n (Plans/MICASURVIVOR_3D_PLAN.md 4.1): two players in one
// fight, on the page. One window HOSTS (?gen=7&fight=1&host=<name>), another JOINS (?join=<name>&dex=4) and plays in
// it; they talk through micasurvivor/m3d/coop.js's messages over a BroadcastChannel (the test room's transport). The
// rules are tested in node (micasurvivor_m3d_coop_test.mjs); this is that they hold on the page, with real frames:
//   * the guest only knows the room's name: it learns the level from the host, loads it as its own Pokémon, and is let in
//   * each sees the other, where they are, and moving
//   * the guest's moves hurt and finish the HOST's enemy; what reaches the guest hurts the guest, not the host
//   * a level-up puts three cards up on BOTH screens and the fight waits until both have chosen
//   node overworld/tests/micasurvivor_m3d_coopplay_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9837;
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
		// each in a WINDOW of its own: a tab behind another is not animated, and a player that is not animated says nothing
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

	const H = await open('?gen=7&fight=1&host=room2&moves=ember:2&cast=19&cap=1&weather=0&ability=0', 'host');
	A(H.ok, 'the host\'s fight boots');
	await H.page.evaluate(() => { const w = window.__m3d.world; w.pl.invuln = 1e9; w.cast = null; });   // (no arrivals: the test puts the enemies in)
	const Gp = await open('?join=room2&dex=4&moves=water-gun:2&ability=0', 'guest');
	A(Gp.ok, 'a second player opens ?join=room2 as a Charmander (it does not know the level yet)');
	const joined = await waitFor(() => Gp.page.evaluate(() => /gen=7/.test(location.search) && !!(window.__m3d && window.__m3d.ready && window.__m3d.net.joined)), 25000);
	const g0 = await Gp.page.evaluate(() => { const m = window.__m3d; return { search: location.search, gen: m.gen, w: m.room.w, guest: m.world.guest, dex: m.world.pl.mon.dex, moves: m.world.pl.moves.map(q => q.id), mates: m.mates().map(q => [q.id, q.dex]), id: m.myId, hud: document.getElementById('hud').textContent }; });
	A(joined && g0.gen === 7 && g0.w === 37 && g0.guest && g0.dex === 4 && g0.moves.join() === 'water-gun', 'it learns the level from the host, loads it still as a Charmander with its own move, and the host lets it in', JSON.stringify(g0));
	const h0 = await H.page.evaluate(() => { const m = window.__m3d; return { mates: m.world.mates.map(q => [q.id, q.dex]), hud: document.getElementById('hud').textContent }; });
	A(h0.mates.length === 1 && h0.mates[0][0] === g0.id && h0.mates[0][1] === 4 && /co-op: 2 players/.test(h0.hud), 'the host has it as a second player (a Charmander), and its readout says two players', JSON.stringify(h0));
	const gHud = await waitFor(() => Gp.page.evaluate(() => /co-op: 2 players/.test(document.getElementById('hud').textContent)), 4000);   // (the readout is redrawn every 16 ticks)
	const gSees = await waitFor(() => Gp.page.evaluate(() => window.__m3d.mates().some(q => q.id === 0 && q.dex === 25)), 4000);   // (its list of the others is built from the frames that follow the one that let it in)
	A(gSees && gHud, 'the guest has the host as a Pikachu, and its readout says two players', JSON.stringify(g0));

	// ---- moving: each has the other where it is
	await Gp.page.evaluate(async () => { const m = window.__m3d, wait = (ms) => new Promise(r => setTimeout(r, ms)); m.world.pl.invuln = 1e9; m.setInput({ mx: 1, mz: 0 }); await wait(900); m.setInput(null); await wait(500); });
	const pos = await Promise.all([H.page.evaluate(() => { const m = window.__m3d, q = m.world.mates[0]; return { mate: [q.s.x, q.s.z], me: [m.state.x, m.state.z] }; }), Gp.page.evaluate(() => { const m = window.__m3d, h = m.mates().find(q => q.id === 0); return { me: [m.state.x, m.state.z], host: [h.s.x, h.s.z], spawn: m.room.spawn }; })]);
	A(pos[1].me[0] > pos[1].spawn[0] + 3 && Math.hypot(pos[0].mate[0] - pos[1].me[0], pos[0].mate[1] - pos[1].me[1]) < 0.5, `the guest runs east (${(pos[1].me[0] - pos[1].spawn[0]).toFixed(1)} m): the host has it there`, JSON.stringify(pos));
	A(Math.hypot(pos[1].host[0] - pos[0].me[0], pos[1].host[1] - pos[0].me[1]) < 0.5, 'and the guest has the host where the host is', JSON.stringify(pos));
	await shot(Gp.page, 'm3d_coop_guest.png');

	// ---- the guest's moves on the host's enemy
	const eid = await H.page.evaluate(async (gx, gz) => { const m = window.__m3d, e = m.addEnemy(1, gx + 5, gz, { dummy: true, hp: 3 }); window.__foe = e; return e.id; }, pos[1].me[0], pos[1].me[1]);
	const sawCopy = await waitFor(() => Gp.page.evaluate((id) => window.__m3d.world.enemies.some(c => c.id === id && c.copy), eid), 4000);
	A(sawCopy, 'an enemy the host puts in beside the guest appears on the guest as a copy');
	const hurt = await waitFor(() => H.page.evaluate(() => window.__foe.hp < window.__foe.maxHp), 6000);
	const mid = await Promise.all([H.page.evaluate(() => ({ hp: window.__foe.hp, max: window.__foe.maxHp, fired: window.__m3d.world.stats.fired, hits: window.__m3d.world.stats.hits })), Gp.page.evaluate(() => ({ fired: window.__m3d.world.stats.fired, hits: window.__m3d.world.stats.hits, nums: window.__m3d.numbers.length }))]);
	A(hurt && mid[1].fired > 0 && mid[1].hits > 0, `the guest's Water Gun hurts the host's enemy (${mid[0].max - mid[0].hp} of ${mid[0].max} HP so far; ${mid[1].hits} hits landed on the guest's side)`, JSON.stringify(mid));
	const down = await waitFor(() => H.page.evaluate(() => window.__foe.dead), 20000);
	const goneOnGuest = await waitFor(() => Gp.page.evaluate((id) => !window.__m3d.world.enemies.some(c => c.id === id), eid), 4000);   // (the guest hears a moment later)
	const after = [await H.page.evaluate(() => window.__m3d.world.stats.kills), !goneOnGuest];
	A(down && after[0] >= 1 && !after[1], 'it goes down on the host, and is gone from the guest', JSON.stringify(after));

	// ---- what reaches the guest hurts the guest
	await Gp.page.evaluate(() => { const w = window.__m3d.world; w.pl.invuln = 0; w.pl.moves.length = 0; });
	const hp0 = await Promise.all([H.page.evaluate(() => { const w = window.__m3d.world; w.pl.invuln = 0; return w.pl.hp; }), Gp.page.evaluate(() => window.__m3d.world.pl.hp)]);
	await H.page.evaluate((gx, gz) => { const e = window.__m3d.addEnemy(19, gx + 2.5, gz); window.__bite = e; }, pos[1].me[0], pos[1].me[1]);
	const bitten = await waitFor(() => Gp.page.evaluate((h) => window.__m3d.world.pl.hp < h, hp0[1]), 8000);
	const hp1 = await Promise.all([H.page.evaluate(() => ({ hp: window.__m3d.world.pl.hp, tg: window.__bite.tg, cd: window.__bite.touchCd })), Gp.page.evaluate(() => ({ hp: window.__m3d.world.pl.hp, touched: window.__m3d.world.stats.touched }))]);
	A(bitten && hp1[1].touched >= 1 && hp1[0].hp === hp0[0] && hp1[0].tg === g0.id, `a Rattata the host puts in goes for the guest and hurts it (${(hp0[1] - hp1[1].hp).toFixed(1)} HP); the host is unhurt`, JSON.stringify([hp0, hp1]));
	await H.page.evaluate(() => { window.__bite.dead = true; window.__m3d.world.pl.invuln = 1e9; });
	await Gp.page.evaluate(() => { window.__m3d.world.pl.invuln = 1e9; });

	// ---- a level-up: cards on both screens, and the fight waits for both
	await H.page.evaluate(() => { const m = window.__m3d; const o = m.drop('xp', m.state.x + 1.5, m.state.z, 70); o.vx = o.vz = 0; });
	const both = await waitFor(async () => { const [a, b] = await Promise.all([H.page.evaluate(() => getComputedStyle(document.getElementById('cards')).display !== 'none'), Gp.page.evaluate(() => getComputedStyle(document.getElementById('cards')).display !== 'none')]); return a && b; }, 8000);
	const lv = await Promise.all([H.page.evaluate(() => ({ level: window.__m3d.world.pl.level, t: window.__m3d.world.t, cards: [...document.querySelectorAll('#cards button')].map(b => b.textContent.slice(0, 18)) })), Gp.page.evaluate(() => ({ level: window.__m3d.world.pl.level, t: window.__m3d.world.t, cards: [...document.querySelectorAll('#cards button')].map(b => b.textContent.slice(0, 18)) }))]);
	A(both && lv[0].level === 2 && lv[1].level === 2 && lv[0].cards.length === 3 && lv[1].cards.length === 3, 'the host picks up a level\'s worth of XP: both are level 2, and three cards are up on BOTH screens', JSON.stringify(lv));
	await H.page.keyboard.press('Digit1'); await sleep(1200);
	const wait1 = await Promise.all([H.page.evaluate(() => ({ t: window.__m3d.world.t, waiting: window.__m3d.world.waiting, shown: getComputedStyle(document.getElementById('cards')).display !== 'none', hud: document.getElementById('hud').textContent })), Gp.page.evaluate(() => ({ t: window.__m3d.world.t, shown: getComputedStyle(document.getElementById('cards')).display !== 'none' }))]);
	A(!wait1[0].shown && wait1[0].waiting && Math.abs(wait1[0].t - lv[0].t) < 0.05 && wait1[1].shown && /waiting for the others/.test(wait1[0].hud), 'the host chooses; the guest has not: the host\'s cards go, its fight still stands still, and its readout says it is waiting', JSON.stringify(wait1));
	await Gp.page.keyboard.press('Digit2');
	const going = await waitFor(async () => { const [a, b] = await Promise.all([H.page.evaluate((t) => window.__m3d.world.t > t + 0.5 && !window.__m3d.world.waiting, lv[0].t), Gp.page.evaluate((t) => window.__m3d.world.t > t + 0.3 && getComputedStyle(document.getElementById('cards')).display === 'none', lv[1].t)]); return a && b; }, 8000);
	A(going, 'the guest chooses: the fight goes on for both');
	await shot(H.page, 'm3d_coop_host.png');
	const traffic = await Promise.all([H.page.evaluate(() => ({ sent: window.__m3d.net.sent, chars: window.__m3d.net.chars })), Gp.page.evaluate(() => ({ sent: window.__m3d.net.sent, chars: window.__m3d.net.chars }))]);
	console.log(`     (the host sent ${traffic[0].sent} messages averaging ${Math.round(traffic[0].chars / traffic[0].sent)} characters; the guest ${traffic[1].sent} averaging ${Math.round(traffic[1].chars / traffic[1].sent)})`);
	A(errors.length === 0, 'no page errors on either side', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
