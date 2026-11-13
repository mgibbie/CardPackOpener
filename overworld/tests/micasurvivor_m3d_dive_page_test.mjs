// micasurvivor_m3d_dive_page_test.mjs — MicaSurvivor 3D, Dive part 3 (Plans/MICASURVIVOR_3D_PLAN.md §5.55): a Dive run on
// the page, in a real browser. /micasurvivor/m3d/?dive=<seed>&route=forest&floor=1 (a preview: not linked, nothing saved).
//   * the page boots a Dive: floor 1, its chips (FLOOR, loot, STAIRS n m), the floor's foes asleep and still
//   * the stairs take you to floor 2: a new room is drawn, nothing of floor 1 comes along
//   * the lost Pokémon follows you once reached
//   * floor 5: the alpha's bar, the stairs sealed until it falls
//   * a faint: the end screen (floor, loot kept, rescued), 'nothing is saved yet', Play again = the next seed
//   * (part 4) the kit: 1 / 2 fire the specials, their chips count the cool-down; X dodges; KOs chain a combo
//   * an Expedition on the same page is untouched (no Dive there)
//   node overworld/tests/micasurvivor_m3d_dive_page_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9903;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }

const calls = [];   // (what the page asks of the server: a guest asks nothing)
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { calls.push(req.method + ' ' + u); res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"no"}'); return; }
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
	const boot = async (q) => { await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/?${q}`, { waitUntil: 'domcontentloaded' }); return waitFor(() => page.evaluate(() => !!(window.__m3d && window.__m3d.ready)), 30000); };
	const M = (f, ...a) => page.evaluate(f, ...a);
	const chips = () => M(() => [...document.querySelectorAll('#rx-parts > *')].map((e) => e.textContent));
	const strong = () => M(() => { const p = window.__m3d.world.pl; p.maxHp = p.hp = 1e9; });

	// ---- 1. the page boots a Dive
	let ok = await boot('dive=7&route=forest&dex=4&auto=1');
	A(ok, '1. ?dive=7 boots', errors.slice(0, 3).join(' | '));
	let d = await M(() => { const m = window.__m3d, S = m.dive; return S ? { floor: S.floor, route: S.route, room: m.room === S.w.room, foes: S.w.enemies.length, asleep: S.w.enemies.filter((e) => e.asleep).length, groups: S.groups.length, run: !!m.run, practice: m.practice } : null; });
	A(d && d.floor === 1 && d.route === 'forest' && d.room && !d.run, '1. a Dive run is on the page: floor 1 of the forest, its room drawn (no Expedition run)', d);
	A(d && d.foes >= 4 && d.asleep === d.foes && d.groups >= 2, `1. the floor holds its groups, asleep (${d && d.foes} foes in ${d && d.groups} groups)`, d);
	await strong();
	const before = await M(() => window.__m3d.world.enemies.map((e) => [e.a.x, e.a.z]));
	await sleep(1200);
	const after = await M(() => window.__m3d.world.enemies.filter((e) => e.asleep).map((e) => [e.a.x, e.a.z]));
	A(after.length >= 1 && after.every((p) => before.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01)), '1. a sleeper holds still', [before.length, after.length]);
	let c = await chips();
	A(c.some((x) => x === 'FLOOR 1') && c.some((x) => /^STAIRS \d+ m$/.test(x)) && c.some((x) => /secured/.test(x)), '1. the chips: FLOOR 1, the loot, how far the stairs are', c);
	await sleep(1500);   // (sheets of the floor's species arrive)
	const drawn = await M(() => { const m = window.__m3d; return m.world.enemies.filter((e) => m.sheets.has(e.dex + '/Walk')).length / m.world.enemies.length; });
	A(drawn > 0.9, '1. the floor\'s species are drawn (their sheets loaded as they came)', drawn);
	await shot('dive-floor1.png');

	// ---- 2. the lost Pokémon
	const lost = await M(() => { const m = window.__m3d, lo = m.dive.stray; if (!lo) return null; m.put(lo.x + 1, lo.z); return { dex: lo.dex }; });
	if (lost) { const fol = await waitFor(() => M(() => window.__m3d.dive.stray.follow), 4000); A(fol, '2. reach the lost Pokémon and it follows you', lost); await sleep(600); A(await M((dx) => window.__m3d.sheets.has(dx + '/Walk'), lost.dex), '2. …and it is drawn', lost); }
	else A(true, '2. (this floor has no lost Pokémon)');

	// ---- 3. the stairs
	await strong();
	await M(() => { const m = window.__m3d, st = m.room.stairs; window.__room1 = m.room; m.put(st[0], st[2]); });
	const down = await waitFor(() => M(() => window.__m3d.dive.floor === 2), 6000);
	d = await M(() => { const m = window.__m3d, S = m.dive; return { floor: S.floor, newRoom: m.room !== window.__room1 && m.room === S.w.room, stake: S.stake, asleep: S.w.enemies.filter((e) => e.asleep).length, foes: S.w.enemies.length, at: [m.state.x, m.state.z], spawn: [m.room.spawn[0], m.room.spawn[2]] }; });
	A(down && d.newRoom && d.stake > 0, '3. stand on the stairs: floor 2, a new room drawn, loot at stake for the floor', d);
	A(Math.hypot(d.at[0] - d.spawn[0], d.at[1] - d.spawn[1]) < 3 && d.asleep === d.foes, '3. you arrive where floor 2 begins; its foes are its own, asleep', d);
	await sleep(500); c = await chips(); A(c.some((x) => x === 'FLOOR 2'), '3. the chips say FLOOR 2', c);

	// ---- 4. the alpha's floor
	ok = await boot('dive=7&route=forest&dex=4&floor=5&auto=1');   // (auto: a level-up picks its own card, so the run never waits)
	await strong();
	d = await M(() => { const S = window.__m3d.dive; return { floor: S.floor, sealed: S.sealed, boss: S.boss ? { xk: S.boss.xk, dex: S.boss.dex } : null }; });
	A(ok && d.floor === 5 && d.sealed && d.boss && d.boss.xk === 'alpha', '4. ?floor=5 begins on the alpha\'s floor: the stairs are sealed', d);
	await sleep(500);
	c = await chips();
	const bar = await M(() => { const el = document.getElementById('rx-boss'); return { shown: !!el && getComputedStyle(el).display !== 'none', name: document.getElementById('rx-bname').textContent }; });
	A(c.includes('ALPHA') && bar.shown && bar.name.length > 2, '4. the screen says ALPHA and shows its bar', [c, bar]);
	await M(() => { const m = window.__m3d, st = m.room.stairs; m.put(st[0], st[2]); });
	await sleep(1500);
	A(await M(() => window.__m3d.dive.floor === 5), '4. standing on sealed stairs goes nowhere');
	await shot('dive-alpha.png');
	await M(() => { const b = window.__m3d.dive.boss; b.hp = 1e-6; b.poison = 1; b.poisonT = 1; b.poisonTick = 0; });
	const fell = await waitFor(() => M(() => !window.__m3d.dive.sealed && window.__m3d.dive.bank > 0), 5000);
	A(fell, '4. the alpha falls: the stairs open and the loot is secured', await M(() => ({ sealed: window.__m3d.dive.sealed, bank: window.__m3d.dive.bank })));
	const down6 = await waitFor(() => M(() => window.__m3d.dive.floor === 6), 6000);
	A(down6, '4. …and they take you to floor 6');

	// ---- 5. a faint: the end
	await M(() => { const m = window.__m3d; m.dive.stake = 400; m.world.pl.hp = 0; m.world.pl.dead = true; });
	const over = await waitFor(() => M(() => document.getElementById('rx-end').classList.contains('show')), 5000);
	const end = await M(() => ({ text: document.getElementById('rx-end').textContent, again: (document.getElementById('rx-again') || {}).href || '', kept: (document.getElementById('rx-kept') || {}).textContent || '', board: !!document.getElementById('rx-end').querySelector('#rx-boards'), pay: window.__m3d.runView().over.rows }));
	A(over && /RUN OVER/.test(end.text) && /Floor/.test(end.text) && /Loot kept/.test(end.text) && /Rescued/.test(end.text), '5. a faint ends the run: the end screen, with the floor, the loot kept and who was rescued', end.text.slice(0, 300));
	const kept = +end.pay.find((r) => r[0] === 'Loot kept')[1], bank = await M(() => window.__m3d.dive.bank);
	A(kept === Math.floor(bank + 100), '5. the loot kept is the bank and a quarter of what was at stake', [kept, bank]);
	A(end.kept.includes('Practice run') && end.kept.includes('nothing is saved') && end.board, '5. a Dive with a test parameter (auto) is a practice run: its end says nothing is saved; it offers the 3D boards', end);
	await M(() => document.getElementById('rx-boards').click());
	const bd = await waitFor(() => M(() => { const b = window.__m3d.runView().board; return b && b.title.startsWith('3D Dive · ') && b.title.endsWith('deepest floor') && b.tabs.length === 0 && b.note.includes('Log in') ? b : null; }), 3000);
	A(!!bd, "5. the board is the route's 3D Dive board (a guest is asked to log in)", await M(() => window.__m3d.runView().board));
	await M(() => window.__m3d.openBoard(null));
	A(/[?&]dive=8\b/.test(end.again) && /floor=5/.test(end.again), '5. Play again is the next seed, same route and floor', end.again);
	A(calls.length === 0, '5. a Dive asked nothing of the server', calls.slice(0, 5));

	// ---- 6. (part 4) the kit, the dodge, the combo
	ok = await boot('dive=7&route=forest&dex=4&auto=1');
	await strong();
	await M(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; });
	let kit = await M(() => { const m = window.__m3d; return { ids: m.world.pl.moves.map((q) => q.id), man: m.world.pl.moves.map((q) => !!q.xman), view: m.runView().moves.map((q) => [q.name, q.sub || '', !!q.dim]), btn: document.getElementById('b-slide').textContent }; });
	A(ok && kit.ids.length === 3 && kit.man.join() === 'false,true,true', `6. a Dive starts with a kit of three: the basic and two specials (${kit.ids.join(', ')})`, kit);
	const lg = await M(() => { const m = window.__m3d, g = m.dive.lg; return g ? { member: g.member, form: g.form, dex: m.world.pl.mon.dex, hp: m.world.pl.maxHp } : null; });
	A(!!lg && lg.member === 4 && lg.form === 4 && lg.dex === 4, '6. (part 10) the page dives as a League member (Charmander, at its first stage)', lg);
	const evo = await M(async () => { const m = window.__m3d, L = await import('./expleague.js'); const ok = L.evolve(m.dive, 5, 16); return { ok, dex: m.world.pl.mon.dex, form: m.dive.lg.form }; });
	await sleep(600);
	A(evo.ok && evo.dex === 5 && evo.form === 5 && errors.length === 0, '6. …and an evolution shows on the page without an error (Charmeleon)', [evo, errors.slice(0, 3)]);
	A(kit.view[1][1] === 'KEY 1' && kit.view[2][1] === 'KEY 2' && !kit.view[0][1] && kit.btn === 'DODGE', '6. the chips name the keys of the specials; the touch button says DODGE', kit);
	await M(() => { const m = window.__m3d, s = m.state, e = m.addEnemy(19, s.x + Math.sin(s.facing) * 2.5, s.z + Math.cos(s.facing) * 2.5, { t: 0, ti: 0, hp: 1e6 }); e.dummy = true; });
	await sleep(700);
	A(await M(() => window.__m3d.world.pl.moves[1].t === 0 && window.__m3d.world.pl.moves[2].t === 0), '6. beside a foe the specials wait to be pressed');
	await page.keyboard.press('Digit1');
	const sp1 = await waitFor(() => M(() => { const m = window.__m3d; if (!(m.world.pl.moves[1].t > 0.06)) return false; window.__kit = { t: m.world.pl.moves.map((q) => q.t), view: m.runView().moves.map((q) => [q.name, q.sub || String(), !!q.dim]) }; return true; }), 3000);   // (read the chip the moment it fired: a short cool-down is over before the next look)
	await sleep(350);
	kit = await M(() => window.__kit);
	A(sp1 && kit.t[2] === 0 && kit.view[1][1].endsWith(String.fromCharCode(32, 115)) && parseFloat(kit.view[1][1]) > 0 && kit.view[1][2], '6. key 1 fires special 1: its chip dims and counts its cool-down; special 2 still waits', kit);
	await page.keyboard.press('KeyV');
	A(await waitFor(() => M(() => window.__m3d.world.pl.moves[2].t > 0), 3000), '6. V (the fourth button of the site) fires special 2');
	// the dodge
	await M(() => { window.__m3d.world.enemies.length = 0; });
	const p0 = await M(() => [window.__m3d.state.x, window.__m3d.state.z]);
	await page.keyboard.down('KeyX'); await sleep(80); await page.keyboard.up('KeyX');
	await sleep(500);
	const dg = await M(() => { const m = window.__m3d; return { n: m.dive.dodge.n, cd: m.dive.dodge.cd, at: [m.state.x, m.state.z], sliding: m.state.sliding }; });
	A(dg.n === 1 && dg.cd > 0 && !dg.sliding && Math.hypot(dg.at[0] - p0[0], dg.at[1] - p0[1]) > 2, '6. X dodges: a dash the way you face, then it cools', [dg, p0]);
	// the combo
	await M(() => { const m = window.__m3d, s = m.state; for (let i = 0; i < 3; i++) { const e = m.addEnemy(19, s.x + 4 + i * 0.2, s.z, { t: 0, ti: 0 }); e.dummy = true; e.hp = 1e-6; e.poison = 1; e.poisonT = 1; e.poisonTick = 0; } });
	const cb = await waitFor(async () => (await chips()).includes('COMBO x3'), 3000);
	A(cb, '6. three KOs in a moment: the chips say COMBO x3', await chips());

	// ---- 6b. (part 5) chests, a secret pocket, a landmark (seed 3, floor 1: a thicket, a shrine, 4 chests; Charmander burns thickets)
	ok = await boot('dive=3&route=forest&dex=4&auto=1');
	await strong();
	await M(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; });
	await sleep(400);
	let th = await M(() => { const m = window.__m3d, r = m.dive.w.room; return { keys: m.propKeys(), chests: m.dive.chests.length, plugs: r.plugs.map((p) => [p.kind, p.open, p.faces.length]), lm: m.dive.lm && m.dive.lm.kind, builds: m.roomBuilds() }; });
	A(ok && th.chests === 4 && th.keys.includes('eco:freeball') && th.keys.includes('eco:thicket') && th.keys.includes('eco:lm_shrine'), '6b. the floor shows its chests (Poké Balls), its thicket and its shrine', th);
	const goTo = (x, z) => M((x, z) => { const s = window.__m3d.state; s.x = x; s.z = z; s.vx = s.vz = 0; }, x, z);
	const c0 = await M(() => { const c = window.__m3d.dive.chests.find((q) => !q.pocket); return [c.x, c.z]; });
	await goTo(c0[0] + 1, c0[1]);
	A(await waitFor(() => M(() => window.__m3d.dive.opened === 1), 3000), '6b. standing by a Poké Ball opens it');
	A(await waitFor(async () => (await M(() => document.body.innerText)).includes('Item: '), 3000), '6b. …and the screen names the item');
	const fc = await M(() => { const p = window.__m3d.dive.w.room.plugs.find((q) => q.kind === 'thicket'); return p.faces[0]; });
	await goTo(fc[0], fc[2]);
	const opened = await waitFor(() => M(() => window.__m3d.dive.w.room.plugs.find((q) => q.kind === 'thicket').open), 4000);
	await sleep(300);
	const th2 = await M(() => { const m = window.__m3d; return { builds: m.roomBuilds(), secrets: m.dive.secrets, text: document.body.innerText }; });
	A(opened && th2.secrets === 1 && th2.builds === th.builds + 1 && th2.text.includes('thicket burns'), '6b. Charmander against the thicket: it burns, and the floor is built again without it', { builds: [th.builds, th2.builds], secrets: th2.secrets });
	await M(() => { const m = window.__m3d; m.world.pl.maxHp = 1000; m.world.pl.hp = 100; });
	const lmAt = await M(() => [window.__m3d.dive.lm.x, window.__m3d.dive.lm.z]);
	await goTo(lmAt[0], lmAt[1]);
	A(await waitFor(() => M(() => window.__m3d.dive.lm.used && window.__m3d.world.pl.hp >= 600), 4000), '6b. standing on the shrine: half your HP back', await M(() => window.__m3d.world.pl.hp));

	// ---- 6c. (part 6) a Dive that is kept: the same save as the 2D game's
	const store = () => M(() => { const o = {}; for (let k = 0; k < localStorage.length; k++) { const key = localStorage.key(k); o[key] = localStorage.getItem(key); } return o; });
	const expSave = (st) => { try { return JSON.parse(st['micasurvivorexp_save.guest'] || 'null'); } catch (e) { return null; } };
	const faint = async () => { await M(() => { const m = window.__m3d; m.world.pl.hp = 0; m.world.pl.dead = true; }); return waitFor(() => M(() => document.getElementById('rx-end').classList.contains('show')), 5000); };
	const sv0 = expSave(await store());
	A(!sv0 || !(sv0.counters || {})['dive.runs'], '6c. the practice Dives above wrote nothing into the save');
	ok = await boot('dive=7&route=forest&dex=4');
	let ds = await M(() => window.__m3d.diveSave);
	A(ok && ds.practice === null && ds.ok === true && ds.start === 1 && ds.member === 4, '6c. a Dive by its seed, route and Pokémon alone can be kept: the save is open', ds);
	await M(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; m.dive.bank = 40; m.dive.stake = 100; });
	const over6 = await faint();
	await sleep(300);
	const k6 = await M(() => ({ kept: window.__m3d.kept, line: (document.getElementById('rx-kept') || {}).textContent || '' }));
	const st6 = await store(), x6 = expSave(st6), c6 = (x6 && x6.counters) || {}, dev = st6['micasurvivorexp_dev.guest'];
	A(over6 && k6.kept && k6.kept.ok === true && k6.kept.pay === 195 && k6.line.includes('Saved.') && k6.line.includes('195'), '6c. its end says it is saved, and what will be in your wallet (40 secured + a quarter of 100 = 65 loot = 195)', k6);
	A(c6['dive.runs'] === 1 && c6['dive.forest.best'] === 1 && c6['pay3d.' + dev] === 195 && c6['m3d.n.' + dev] === 1 && !c6['dive.escapes'], "6c. the save has it under the 2D Dive's keys, and the pay owed to this browser", c6);
	A(calls.length === 0, '6c. a guest\'s Dive asked nothing of the server', calls.slice(0, 5));
	// a guardian falls: its stage and its Seal are kept at once
	ok = await boot('dive=8&route=forest&dex=4');
	await M(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; m.dive.floor = 25; m.dive.boss = { dead: true, xk: 'guardian' }; });
	const gd = await waitFor(async () => { const x = expSave(await store()); return !!(x && x.counters['dive.forest.stage'] === 26 && (x.sets['dive.seal'] || []).includes('forest')); }, 5000);
	A(gd && await M(() => window.__m3d.noteLog.includes('Stage and Seal saved')), '6c. a guardian falls: stage 26 and the Seal of the route are in the save at once (the run is not over), and the screen says so');
	// the next Dive on that route has the Seal, and may start on floor 26
	ok = await boot('dive=9&route=forest&dex=4&floor=26');
	ds = await M(() => ({ ...window.__m3d.diveSave, seal: window.__m3d.dive.seal, floor: window.__m3d.dive.floor }));
	A(ok && ds.start === 26 && ds.floor === 26 && ds.seal === true, '6c. the next Dive there starts on floor 26 with the Seal', ds);
	ok = await boot('dive=9&route=reef&dex=4&floor=26');
	ds = await M(() => ({ ...window.__m3d.diveSave, seal: window.__m3d.dive.seal, floor: window.__m3d.dive.floor, route: window.__m3d.dive.route }));
	A(ok && ds.route === 'reef' && ds.floor === 1 && ds.seal === false, '6c. another route has neither: floor 26 asked, floor 1 given', ds);
	// a member the save does not have
	ok = await boot('dive=7&route=forest&dex=149');
	await M(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; m.dive.bank = 40; });
	await faint(); await sleep(300);
	const k7 = await M(() => window.__m3d.kept), c7 = (expSave(await store()) || {}).counters || {};
	A(k7 && k7.ok === false && k7.why === 'member' && c7['dive.runs'] === 1, "6c. Dragonite's family, which a new save does not have: its end says so, and nothing is written", [k7, c7['dive.runs']]);

	// ---- 6d. (part 9) the red ground: a brawler beside you winds up a slam, and it lands
	ok = await boot('dive=7&route=forest&dex=4&auto=1');
	await M(() => { const m = window.__m3d, s = m.state; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; m.world.pl.maxHp = m.world.pl.hp = 1e6; m.world.pl.moves.length = 0;
		let e = null; for (let d = 1; d <= 151 && !e; d++) { const q = m.addEnemy(d, s.x + 2, s.z, { t: 0, ti: 0, hp: 1e6 }); if (q && !q.def.shotCd && q.behavior !== 'thief' && !q.fly) e = q; else if (q) m.world.enemies.length = 0; }
		e.a.speed = 0; e.touchCd = 1e9; window.__brawler = e; });
	const wound = await waitFor(() => M(() => window.__m3d.dive.tg.length === 1 && window.__brawler.dummy === true), 6000);
	A(ok && wound, '6d. a brawler beside you winds up a slam and holds still');
	const landed = await waitFor(() => M(() => window.__m3d.dive.tg.length === 0 && window.__m3d.world.pl.hp < 1e6 && window.__brawler.dummy === false), 4000);
	A(landed, '6d. the slam lands: you are hit, and the foe moves again', await M(() => [window.__m3d.dive.tg.length, window.__m3d.world.pl.hp]));

	// ---- 7. an Expedition is untouched
	ok = await boot('exp=7&map=viridian&dex=4&weather=0');
	d = await M(() => { const m = window.__m3d; return { run: !!m.run, dive: m.dive, zone: m.run && m.run.zone, slide: document.getElementById('b-slide').textContent, man: m.world.pl.moves.some((q) => q.xman) }; });
	A(ok && d.run && d.dive === null && d.slide !== 'DODGE' && !d.man, '7. an Expedition on the same page boots as before (no Dive there)', d);
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
