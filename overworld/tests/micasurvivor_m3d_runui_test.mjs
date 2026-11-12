// micasurvivor_m3d_runui_test.mjs — MicaSurvivor 3D, the shipping path (Plans/MICASURVIVOR_3D_PLAN.md §5.31): a run's
// own screen, in Micatro's look (micasurvivor/m3d/runui.js + runui.css), in a real browser.
//   * a run's page shows the run's screen, not the test room's readout (which is still filled, and shown by ?debug=1)
//   * who you are, HP and XP as bars, the run's line as chips, the four move slots
//   * it follows the run: a hit, money, a level (its cards in the same look; the kit move it brings), a boss's bar,
//     what the run says as a banner
//   * a card's art (a move's type, a vitamin's picture) and a move's name written for a player
//   * the menu (Esc, P or its button): alone, the fight waits; Resume, Restart the run, Leave
//   * the 3D boards (the menu's button): the server's top ten of this map and tier, asked for with d3; its tabs;
//     logged out, a line saying so
//   * sound: a run's events are the 2D game's own effects, its theme the map's (the boss's while one is on the field,
//     none at the end); the menu's "Sound" turns it off and on
//   * the run's end: a panel with the result, "Play again" (the next seed) and "Leave"
//   * a narrow phone screen: nothing runs off it, nothing sits under the minimap
//   * a slow device (every frame a tenth of a second of ticks): the screen is drawn by the clock, not by the tick count
//   * the test room without a run is as it was
//   node overworld/tests/micasurvivor_m3d_runui_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { pretty, short, mmss, chipKind } from '../../micasurvivor/m3d/runui.js';
import { soundsOf, moveSounds, musicOf } from '../../micasurvivor/m3d/runsound.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9863;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }

// ---- the small helpers, in node
A(pretty('flame-wheel') === 'Flame Wheel' && short(1234) === '1,234' && short(1120000019) === '1.12B' && mmss(125) === '2:05', 'names, numbers and times are written for a player (Flame Wheel, 1,234, 1.12B, 2:05)');
A(chipKind('ZONE 1/3', 0) === 'on' && chipKind('₽ 12', 3) === 'money' && chipKind('FINAL SWARM!', 1) === 'warn' && chipKind('ALTAR 28 m', 2) === '', 'the run\'s line in chips: the zone lit, money gold, a danger orange');

// (the boards' server, stood in for: what the page asks is kept, and three marks are answered)
const asked = [];
const TOP = [{ name: 'ash', score: 9100, time: 1500, level: 44, dex: 6 }, { name: 'tester', score: 4321, time: 800, level: 30, dex: 5 }, { name: 'misty', score: 1200, time: 300, level: 12, dex: 7 }];
// ---- a run's sound, named (pure)
{
	const mv = (id) => ({ ember: { kind: 'bolt', type: 'fire' }, tackle: { kind: 'melee', type: 'normal' } }[id] || null);
	const names = soundsOf([{ k: 'shot', id: 'ember' }, { k: 'melee', id: 'tackle' }, { k: 'hit' }, { k: 'kill', boss: false }, { k: 'kill', boss: true }, { k: 'hurt' }, { k: 'levelup' }, { k: 'pickup', kind: 'xp' }, { k: 'pickup', kind: 'coin' }, { k: 'pickup', kind: 'heal' }, { k: 'pickup', kind: 'item' }, { k: 'cine' }, { k: 'caught', kind: 'league' }, { k: 'caught', kind: 'shiny' }, { k: 'wild' }, { k: 'mega' }, { k: 'zone' }, { k: 'runover', won: true }, { k: 'runover', won: false }, { k: 'say' }, { k: 'mark' }], mv);
	A(names.map((q) => q[0]).join() === 'shot,shot,hit,faint,bossDown,hurt,levelup,xp,coin,heal,chest,ball,legend,shinyGet,boss,surge,descend,legend,gameover' && names[0][1].kind === 'bolt' && names[0][1].type === 'fire' && names[1][1].kind === 'melee', 'a run\'s events are the 2D game\'s own effects (a shot has its move\'s voice; what has no sound has none)', names.map((q) => q[0]).join());
	A(moveSounds({ landed: 12 }).join() === 'land' && moveSounds({ landed: 20, hard: 20 }).join() === 'quake' && moveSounds({ landed: 3 }).length === 0 && moveSounds({ railed: 1 }).join() === 'shake' && moveSounds({ jumped: 3 }).join() === 'select' && moveSounds({ jumped: 1 }).length === 0 && moveSounds({ bounced: 1 }).join() === 'surge', 'how you move has its sounds: a landing, a hard one, a rail caught, a jump off a wall, a bounce pad');
	const T3 = ['forest', 'cave', 'volcano'];
	A(musicOf({ mapIndex: 0, tracks: T3 }) === 'forest' && musicOf({ mapIndex: 1, tracks: T3 }) === 'cave' && musicOf({ mapIndex: 2, tracks: T3 }) === 'volcano' && musicOf({ mapIndex: 1, boss: true, tracks: T3 }) === 'boss' && musicOf({ mapIndex: 1, over: true, boss: true, tracks: T3 }) === null && musicOf({ mapIndex: -1, tracks: T3 }) === 'volcano' && musicOf({}) === null, 'each map has its theme; a boss on the field has the boss\'s; a run that is over has none');
}
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp' && req.method === 'POST') { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { let q = {}; try { q = JSON.parse(b); } catch { } asked.push({ ...q, auth: req.headers.authorization || '' }); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(q.action === 'run-leaderboard' ? { top: q.board === 'time' ? TOP.slice(0, 1) : TOP, you: q.board === 'time' ? null : { ...TOP[1], rank: 2 } } : { ok: true })); }); return; }
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
	const txt = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);
	const has = (sel, re, ms = 5000) => waitFor(async () => re.test((await txt(sel)) || ''), ms);
	const boot = async (q) => { await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/?${q}`, { waitUntil: 'domcontentloaded' }); return waitFor(() => page.evaluate(() => !!(window.__m3d && window.__m3d.ready)), 30000); };
	const shown = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }, sel);
	/** Nothing comes at you (what is tested is the screen). */
	const hush = () => page.evaluate(() => { const m = window.__m3d; m.run.plan.events = []; m.run.acc = -1e9; m.world.enemies.length = 0; });

	// ---- a League run: the screen
	const ok = await boot('exp=7&map=viridian&dex=6&weather=0');
	await hush();
	const first = await has('#rx-name', /^Charmander$/);
	// (what the page asks the 2D game's sound to play, kept: a headless browser makes no sound to listen to)
	await page.evaluate(() => { const A = window.G.Audio, s = A.sfx, m = A.music; window.__snd = []; window.__mus = []; A.sfx = (n, o) => { window.__snd.push(n); return s(n, o); }; A.music = (n) => { if (window.__mus[window.__mus.length - 1] !== n) window.__mus.push(n); return m(n); }; });
	const s0 = await page.evaluate(() => ({ rx: document.body.classList.contains('rx'), font: getComputedStyle(document.getElementById('rx')).fontFamily, loaded: document.fonts.check('16px m6x11'), filled: document.getElementById('hud').textContent.length > 40, lv: document.getElementById('rx-lv').textContent, hp: document.getElementById('rx-hpt').textContent, w: document.getElementById('rx-hp').style.width }));
	A(ok && first && s0.rx && /m6x11/.test(s0.font) && s0.lv === 'Lv 1' && s0.hp === '88 / 88' && parseFloat(s0.w) === 100, 'a run\'s page shows the run\'s screen in Micatro\'s font: Charmander, Lv 1, 88 / 88 HP', s0);
	A(!(await shown('#hud')) && !(await shown('#help')) && s0.filled, 'the test room\'s readout and help are not on it (the readout is still filled, for tests)');
	const chips = await page.evaluate(() => [...document.querySelectorAll('#rx-parts .rx-chip')].map((e) => [e.textContent, e.className.replace('rx-chip', '').trim()]));
	A(chips[0] && chips[0][0] === 'ZONE 1/3' && chips[0][1] === 'on' && chips.some((c) => /^FINAL SWARM IN \d+:\d\d$/.test(c[0])) && chips.some((c) => /^ALTAR \d+ m$/.test(c[0])) && chips.some((c) => /^₽ 0$/.test(c[0]) && c[1] === 'money'), `the run's line, as chips (${chips.map((c) => c[0]).join(' | ')})`);
	const mv0 = await page.evaluate(() => [...document.querySelectorAll('#rx-moves .rx-move')].map((e) => [e.querySelector('b').textContent, e.querySelector('i').textContent.trim(), e.classList.contains('empty'), e.style.borderTopColor]));
	A(mv0.length === 4 && mv0[0][0] === 'Ember' && mv0[0][1] === 'Lv 1' && !mv0[0][2] && mv0[0][3] && mv0.slice(1).every((m) => m[2]), 'four move slots: Ember (in its type\'s colour) and three empty', mv0);
	await shot('m3d_runui.png');

	// ---- it follows the run
	await page.evaluate(() => { const m = window.__m3d; m.world.pl.hp = 44; m.run.coins = 37; });
	const hurt = await waitFor(() => page.evaluate(() => document.getElementById('rx-hpt').textContent === '44 / 88' && parseFloat(document.getElementById('rx-hp').style.width) === 50 && [...document.querySelectorAll('#rx-parts .rx-chip.money')].some((e) => e.textContent === '₽ 37')), 4000);
	A(hurt, 'hurt to half and paid 37: the bar is at half, the money chip says ₽ 37', await txt('#rx'));
	await page.evaluate(() => { const m = window.__m3d, s = m.state, pl = m.world.pl; m.drop('xp', s.x, s.z, Math.ceil((pl.xpNext - pl.xp + 1) / (pl.xpMul || 1))); });
	const cardsUp = await waitFor(() => page.evaluate(() => document.querySelectorAll('#cards button[data-i]').length === 3 && document.getElementById('cards').style.display === 'grid'), 8000);
	const cs = await page.evaluate(() => { const b = document.querySelector('#cards button[data-i]'), cs = getComputedStyle(b), t = document.querySelector('#cards .tools button[data-tool="refresh"]'); return { font: cs.fontFamily, bg: cs.backgroundColor, lip: cs.boxShadow !== 'none', tool: getComputedStyle(t).backgroundColor, h: document.querySelector('#cards h2').textContent }; });
	A(cardsUp && /m6x11/.test(cs.font) && cs.bg === 'rgb(58, 75, 79)' && cs.lip && cs.tool === 'rgb(0, 157, 255)' && cs.h === 'Level 2', 'a level: its three cards in the same look (slate panels with a lip, a blue Refresh)', cs);
	const art = await page.evaluate(() => { const m = window.__m3d, cs = m.world.pl.choices; return [...document.querySelectorAll('#cards button[data-i]')].map((b, i) => ({ kind: cs[i].kind, id: cs[i].id, title: b.querySelector('b').textContent, type: (b.querySelector('em .rx-type') || {}).textContent || '', img: (b.querySelector('em img') || { getAttribute: () => '' }).getAttribute('src'), ok: !b.querySelector('em img') || b.querySelector('em img').naturalWidth > 0 })); });
	const mvc = art.find((c) => c.kind === 'move'), vtc = art.find((c) => c.kind === 'vit');
	A(mvc && mvc.type && /^\d · [A-Z][a-z]+( [A-Z][a-z]+)*$/.test(mvc.title) && !/-/.test(mvc.title) && (!vtc || (/^\/overworld\/item_icons\/.+\.png$/.test(vtc.img) && vtc.ok)), `a card's art: a move's type and its name written for a player (${mvc && mvc.title}, ${mvc && mvc.type}); a vitamin's picture (${vtc ? vtc.img : 'none offered'})`, art);
	await shot('m3d_runui_cards.png');
	await page.click('#cards button[data-i="0"]');
	const lv2 = await waitFor(() => page.evaluate(() => document.getElementById('rx-lv').textContent === 'Lv 2' && document.querySelectorAll('#rx-moves .rx-move:not(.empty)').length === 2 && document.getElementById('cards').style.display === 'none'), 5000);
	const mv1 = await page.evaluate(() => [...document.querySelectorAll('#rx-moves .rx-move b')].map((e) => e.textContent));
	A(lv2 && mv1[1] === 'Flame Wheel', `picked: Lv 2, and the kit's second move is in its slot (${mv1.join(' | ')})`);
	const banner = await page.evaluate(() => { const m = window.__m3d; return m.noteLog.some((q) => /Kit move: Flame Wheel \(2\/4\)/.test(q)); });
	A(banner, 'and the run said so');
	await page.evaluate(() => { const m = window.__m3d, s = m.state; m.addBoss(150, s.x + 14, s.z, { slot: 0 }); });
	const boss = await waitFor(() => page.evaluate(() => document.getElementById('rx-boss').classList.contains('show') && /^Mewtwo/.test(document.getElementById('rx-bname').textContent) && /\d \/ \d/.test(document.getElementById('rx-bhpt').textContent)), 5000);
	A(boss, 'a boss on the field: its name and HP as a bar', await txt('#rx-boss'));
	await shot('m3d_runui_boss.png');

	// ---- the menu
	await hush();
	await page.keyboard.press('Escape');
	const mu = await waitFor(() => page.evaluate(() => document.getElementById('rx-menu').classList.contains('show') && window.__m3d.paused), 3000);
	const m0 = await page.evaluate(() => ({ h: document.querySelector('#rx-menu h1').textContent, restart: document.getElementById('rx-restart').getAttribute('href'), quit: document.getElementById('rx-quit').getAttribute('href'), t: window.__m3d.world.t }));
	await sleep(500);
	const t1 = await page.evaluate(() => window.__m3d.world.t);
	A(mu && m0.h === 'PAUSED' && t1 === m0.t && /exp=7/.test(m0.restart) && m0.quit === '../', 'Esc: the menu (Resume, Restart the run, Leave), and alone the fight waits', { ...m0, t1 });
	await shot('m3d_runui_menu.png');
	await page.click('#rx-resume');
	const res = await waitFor(() => page.evaluate((t) => !document.getElementById('rx-menu').classList.contains('show') && !window.__m3d.paused && window.__m3d.world.t > t, m0.t), 3000);
	A(res, 'Resume: the fight goes on');
	await page.click('#rx-menu-btn');
	const byBtn = await waitFor(() => page.evaluate(() => document.getElementById('rx-menu').classList.contains('show') && window.__m3d.paused), 3000);
	await page.keyboard.press('KeyP');
	const byKey = await waitFor(() => page.evaluate(() => !document.getElementById('rx-menu').classList.contains('show') && !window.__m3d.paused), 3000);
	A(byBtn && byKey, 'its button under the minimap opens it too, and P closes it');
	await page.evaluate(() => window.__m3d.toggleMap(true)); await page.keyboard.press('Escape'); await sleep(200);
	const mapEsc = await page.evaluate(() => ({ big: window.__m3d.mapBig, menu: document.getElementById('rx-menu').classList.contains('show') }));
	A(!mapEsc.big && !mapEsc.menu, 'with the zone map open, Esc closes the map and not more', mapEsc);

	// ---- sound
	const snd = await page.evaluate(() => ({ snd: [...new Set(window.__snd)], mus: window.__mus.slice(), has: !!window.G.Audio && typeof window.G.MUSIC === 'object' }));
	A(snd.has && ['xp', 'levelup', 'confirm'].every((n) => snd.snd.includes(n)) && snd.mus[0] === 'forest' && snd.mus.includes('boss'), `the page plays the 2D game's sound: so far ${snd.snd.join(', ')}; Viridian's theme, then the boss's while Mewtwo is on the field`, snd);
	await page.keyboard.press('Escape');
	const mu0 = await page.evaluate(() => ({ label: document.getElementById('rx-mute').textContent, muted: window.G.Audio.settings.muted }));
	await page.click('#rx-mute');
	await sleep(450);   // (the theme follows four times a second)
	const mu1 = await page.evaluate(() => ({ label: document.getElementById('rx-mute').textContent, muted: window.G.Audio.settings.muted, mus: window.__mus[window.__mus.length - 1] }));
	await page.click('#rx-mute'); await page.keyboard.press('Escape');
	const mu2 = await page.evaluate(() => window.G.Audio.settings.muted);
	A(mu0.label === 'Sound: on' && !mu0.muted && mu1.label === 'Sound: off' && mu1.muted && mu1.mus === null && !mu2, 'the menu\'s "Sound" turns it off and on (and the theme rests while the fight waits)', { mu0, mu1, mu2 });

	// ---- the 3D boards
	await page.keyboard.press('Escape'); await page.click('#rx-boards');
	const out = await waitFor(() => page.evaluate(() => document.getElementById('rx-board').classList.contains('show') && /Log in to Magepunk/.test(document.getElementById('rx-board-note').textContent)), 3000);
	A(out && asked.length === 0, 'the menu\'s "3D boards", logged out: a line saying to log in, and nothing is asked of the server');
	await page.click('#rx-board-close');
	await page.evaluate(() => { localStorage.setItem('magepunk_mp_token_v1', 'tok'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'Tester' })); });
	await page.click('#rx-boards');
	const listed = await waitFor(() => page.evaluate(() => document.querySelectorAll('#rx-board .rx-brow').length === 3), 4000);
	const b0 = await page.evaluate(() => ({ h: document.querySelector('#rx-board h1').textContent, rows: [...document.querySelectorAll('#rx-board .rx-brow')].map((r) => [...r.children].map((c) => c.textContent).join('|') + (r.classList.contains('me') ? ' <me' : '')), tabs: [...document.querySelectorAll('#rx-board [data-board].small')].map((t) => t.textContent + (t.classList.contains('red') ? '*' : '')), note: document.getElementById('rx-board-note').textContent, paused: window.__m3d.paused }));
	const q0 = asked[asked.length - 1];
	A(listed && q0.action === 'run-leaderboard' && q0.mode === 'micasurvivor_expedition' && q0.d3 === true && q0.map === 'viridian' && q0.diff === 'normal' && q0.rules === 2 && !('board' in q0) && q0.auth === 'Bearer tok', 'logged in: the page asks for this map\'s and tier\'s 3D score board (d3)', q0);
	A(b0.h === '3D · Viridian Forest · Normal' && b0.rows[0] === '#1|ash|Charizard Lv 44|25:00|9,100' && b0.rows[1] === '#2|tester|Charmeleon Lv 30|13:20|4,321 <me' && b0.tabs.join() === 'Score*,Time attack,Survival' && b0.note === 'Your best: #2' && b0.paused, 'its marks, yours lit, the tabs, your rank; the fight still waits under it', b0);
	await shot('m3d_runui_board.png');
	await page.click('#rx-board [data-board="time"]');
	const timed = await waitFor(() => page.evaluate(() => document.querySelectorAll('#rx-board .rx-brow').length === 1 && /no mark on this board yet/.test(document.getElementById('rx-board-note').textContent)), 4000);
	A(timed && asked[asked.length - 1].board === 'time' && asked[asked.length - 1].d3 === true, 'the "Time attack" tab asks for that board');
	await page.keyboard.press('Escape');
	const closed = await page.evaluate(() => ({ board: document.getElementById('rx-board').classList.contains('show'), menu: document.getElementById('rx-menu').classList.contains('show') }));
	A(!closed.board && closed.menu, 'Esc closes the board, back to the menu', closed);
	await page.keyboard.press('Escape');
	await page.evaluate(() => { localStorage.removeItem('magepunk_mp_token_v1'); localStorage.removeItem('magepunk_mp_state_v1'); });

	// ---- the run's end
	await page.evaluate(() => { const m = window.__m3d; m.world.pl.xproc.shield = 0; m.world.pl.invuln = 0; m.world.pl.hp = 1; m.addBoss(150, m.state.x + 1.5, m.state.z, { slot: 0 }); for (const e of m.world.enemies) e.atk = 1e6; });
	const over = await waitFor(() => page.evaluate(() => window.__m3d.run.ended && document.getElementById('rx-end').classList.contains('show')), 20000);
	const e0 = await page.evaluate(() => ({ h: document.querySelector('#rx-end h1').textContent, cls: document.querySelector('#rx-end h1').className, p: document.querySelector('#rx-end p').textContent, rows: [...document.querySelectorAll('#rx-end .rx-rows span')].map((e) => e.textContent), again: document.getElementById('rx-again').getAttribute('href'), leave: document.getElementById('rx-leave').getAttribute('href'), note: document.getElementById('rx-note').classList.contains('show') }));
	A(over && e0.h === 'RUN OVER' && e0.cls === 'lost' && /Reached zone 1/.test(e0.p) && e0.rows.join('|').startsWith('Time|0:') && e0.rows.includes('KOs') && e0.rows.includes('Score') && e0.rows[e0.rows.indexOf('Pay') + 1].startsWith('₽ ') && !e0.note && !(await shown('#rx-menu-btn')), 'down: the run\'s end is a panel with its result (time, KOs, level, score, pay)', e0);
	const endSnd = await page.evaluate(() => ({ over: window.__snd.includes('gameover'), mus: window.__mus[window.__mus.length - 1] }));
	A(endSnd.over && endSnd.mus === null, 'the run\'s end has its sound, and the theme stops', endSnd);
	A(/[?&]exp=8(&|$)/.test(e0.again) && /map=viridian/.test(e0.again) && e0.leave === '../', '"Play again" is the next seed on the same map; "Leave" goes back to MicaSurvivor', e0.again);
	await shot('m3d_runui_end.png');
	await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#rx-again')]);
	const again = await waitFor(() => page.evaluate(() => !!(window.__m3d && window.__m3d.ready && window.__m3d.run && window.__m3d.run.seed === 8 && !window.__m3d.run.ended)), 30000);
	A(again && !(await page.evaluate(() => document.getElementById('rx-end').classList.contains('show'))), 'pressed: a new run, seed 8');

	// ---- a phone, upright
	await page.setViewport({ width: 390, height: 780, deviceScaleFactor: 1 });
	await sleep(600);
	const ph = await page.evaluate(() => { const r = (id) => document.getElementById(id) || document.querySelector(id), box = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; }; return { left: box(document.querySelector('.rx-left')), map: box(document.getElementById('map')), bottom: box(document.querySelector('.rx-bottom')), w: innerWidth, h: innerHeight }; });
	A(ph.left[0] >= 0 && ph.left[2] <= ph.map[0] && ph.bottom[2] <= ph.w && ph.bottom[3] <= ph.h && ph.left[3] < ph.bottom[1], 'on a phone held upright nothing runs off the screen and nothing sits under the minimap', ph);
	await shot('m3d_runui_phone.png');
	await page.setViewport({ width: 900, height: 560, deviceScaleFactor: 1 });

	// ---- Survival, the readout on request, and the room without a run
	const sv = await boot('exp=7&map=viridian&dex=6&weather=0&mode=survival&debug=1');
	const svc = await has('#rx-parts', /SURVIVAL.*PHASE 1.*BOSS IN \d+:\d\d/);
	A(sv && svc && await shown('#hud'), 'a Survival run: its own line in the chips; ?debug=1 shows the test room\'s readout as well', await txt('#rx-parts'));
	const room = await boot('dex=6');
	const r0 = await page.evaluate(() => ({ rx: document.body.classList.contains('rx'), el: !!document.getElementById('rx'), view: window.__m3d.runView() }));
	A(room && !r0.rx && !r0.el && r0.view === null && await shown('#hud') && await shown('#help'), 'the test room without a run is as it was: its readout and help, no run screen', r0);
	// ---- a slow device: every frame a second apart by the frame clock (so about 6 ticks each), as fast as this machine draws.
	// (The page has two frame loops, the game's and the controller's: half of the frames counted are the game's. By the tick
	// count the screen was drawn once in 16 of them: 3 times in 48.)
	{
		const slow = await browser.newPage();
		await slow.setViewport({ width: 900, height: 560, deviceScaleFactor: 1 });
		slow.on('pageerror', e => errors.push('slow pageerr: ' + e.message));
		await slow.evaluateOnNewDocument(() => { const raf = window.requestAnimationFrame.bind(window); let t = 0; window.__frames = 0; window.requestAnimationFrame = (cb) => raf(() => { t += 1000; window.__frames++; cb(t); }); });
		await slow.goto(`http://localhost:${PORT}/micasurvivor/m3d/?exp=7&map=viridian&dex=6&weather=0`, { waitUntil: 'domcontentloaded' });
		const up = await waitFor(() => slow.evaluate(() => !!(window.__m3d && window.__m3d.ready && document.getElementById('rx-hpt').textContent)), 30000);
		await slow.evaluate(() => { const m = window.__m3d; m.run.plan.events = []; m.world.enemies.length = 0; m.world.pl.maxHp = 1e4; m.world.pl.hp = 4400; window.__drawn = 0; window.__from = window.__frames; new MutationObserver(() => { window.__drawn++; }).observe(document.getElementById('hud'), { childList: true, characterData: true, subtree: true }); });
		await waitFor(() => slow.evaluate(() => window.__frames - window.__from >= 40), 20000);
		const sl = await slow.evaluate(() => ({ frames: window.__frames - window.__from, drawn: window.__drawn, hp: document.getElementById('rx-hpt').textContent }));
		A(up && sl.frames >= 40 && sl.drawn >= sl.frames * 0.4 && sl.hp === '4,400 / 10,000', `on a slow device the screen is drawn by the clock, not by the tick count: ${sl.drawn} times in ${sl.frames} slow frames, and it has the hit`, sl);
		await slow.close();
	}
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
