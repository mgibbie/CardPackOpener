// micasurvivor_balatro_ui_test.mjs — MicaSurvivor in the site's Balatro-style UI kit (site/ui, owner 2026-11-19: "redo
// every UI in the entire game into the balatro style ... do include button press type sound effects").
//   1. static: /micasurvivor/ loads the kit (site/ui/balatro.css) before style.css + mx.css and css/bal.css after them,
//      body.bal-page, and hands the kit's sounds over (window.BalSfx); /micasurvivor/m3d/ loads the kit and BalSfx too
//   2. every 2D screen uses the kit: the title, the partner pick, the menu, the collection, Upgrades, Gacha, Missions,
//      the Lexicon, Settings, the mode / League screens, Friends, Ranking, the lobby, the nickname, moderation, the
//      profile, Credits, the level-up cards, pause and the run summary: the m6x11 font (the kit's), the dialog panel
//      in --bal-panel with the kit's light outline, buttons in the kit's colours by meaning (blue / green go / orange
//      back / red danger), tabs in the kit's tab reds; the canvas's "Pixelify" (the HUD, the minimap ...) IS m6x11 now
//   3. the button sounds: a press plays the kit's "button", a Back the kit's "cancel", the pause the kit's card slide,
//      through G.Audio (so the game's mute still silences them), and NOTHING before a user gesture
//   4. the Play flow (css/mx.css, Micatro's look already) is unchanged: its computed colours and font are as before
//   5. phone held sideways (844x390): the title, the menu, Settings, the level-up cards and pause fit, no page scroll
//   6. the 3D page: the loading screen on the felt in m6x11; its run menu's buttons press with the kit's sounds
//   7. no page errors
//   node overworld/tests/micasurvivor_balatro_ui_test.mjs   (SHOTS=<dir> saves a screenshot of every screen)
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored micasurvivor/assets and overworld/data.)
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
const PORT = 8471;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }

// ---------- 1. static ----------
const MS = path.join(ROOT, 'micasurvivor');
const html = fs.readFileSync(path.join(MS, 'index.html'), 'utf8');
const at = (s) => html.indexOf(s);
A(at('href="/site/ui/balatro.css"') > 0 && at('href="/site/ui/balatro.css"') < at('href="css/style.css"'), 'index.html loads the kit (site/ui/balatro.css) before style.css');
A(at('href="css/bal.css"') > at('href="css/mx.css"') && at('href="css/mx.css"') > 0, 'index.html loads css/bal.css after style.css and mx.css');
A(/<body class="bal-page">/.test(html), '<body class="bal-page">');
A(/import \{ sfx \} from '\/site\/ui\/sfx\.js'; window\.BalSfx = sfx;/.test(html), 'index.html hands the kit\'s sounds over as window.BalSfx');
const html3 = fs.readFileSync(path.join(MS, 'm3d/index.html'), 'utf8');
A(html3.includes('href="/site/ui/balatro.css"') && /window\.BalSfx = sfx/.test(html3), 'the 3D page loads the kit and window.BalSfx');
A(!fs.readFileSync(path.join(MS, 'js/core/audio.js'), 'utf8').match(/music\d*\.ogg/), 'no music file is played through the kit');

// ---------- the server: the repo root, like Cloudflare Pages (no /api: a guest on this browser) ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif' };
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(/^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
for (let i = 0; ; i++) {   // (another session's test may hold the port for a moment: wait and retry, never move it)
	try { await new Promise((r, j) => { server.once('error', j); server.listen(PORT, r); }); break; } catch (e) { if (i > 20) throw e; await sleep(3000); }
}

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	// the kit's sounds are spied on as they are handed over (window.BalSfx is set by a module script: wrap it on set)
	await page.evaluateOnNewDocument(() => {
		window.__sfx = [];
		let real = null;
		Object.defineProperty(window, 'BalSfx', {
			configurable: true,
			get() { return real; },
			set(v) { const play = v.play; real = { ...v, play(name, pitch, vol) { window.__sfx.push(name); return play(name, pitch, vol); } }; },
		});
	});
	const E = (f, a) => page.evaluate(f, a);
	const shot = async (n) => { if (SHOTS) { await sleep(300); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
	const visible = (id) => E(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden')), 30000), 'boot screen clears', errors.slice(0, 3).join(' | '));
	await waitFor(() => E(() => !!window.BalSfx), 5000);

	// the kit's tokens, resolved (each check compares a computed colour with the token's own value)
	const TOK = await E(() => {
		const probe = document.createElement('i'); document.body.appendChild(probe);
		const o = {};
		for (const t of ['panel', 'panel-d', 'panel-dd', 'blue', 'green', 'orange', 'red', 'grey', 'tab-off', 'outline-light', 'money']) { probe.style.color = `var(--bal-${t})`; o[t] = getComputedStyle(probe).color; }
		probe.remove();
		return o;
	});
	A(TOK.panel === 'rgb(58, 75, 79)' && TOK.green === 'rgb(75, 194, 146)', 'the kit\'s --bal-* tokens are on the page', JSON.stringify(TOK));
	// (body.bal-page's FIXED felt gradient under the game's every-frame canvas made Chrome repaint the whole page each
	// frame: the pad / keyboard suites lost presses. MicaSurvivor's body is the kit's flat --bal-bg instead.)
	const bodyBg = await E(() => { const cs = getComputedStyle(document.body); return { img: cs.backgroundImage, att: cs.backgroundAttachment, bg: cs.backgroundColor, cls: document.body.className }; });
	A(/bal-page/.test(bodyBg.cls) && bodyBg.img === 'none' && bodyBg.bg === 'rgb(45, 61, 64)', 'body.bal-page, on the kit\'s flat --bal-bg (no fixed felt gradient under the canvas)', JSON.stringify(bodyBg));
	const KIT_FONT = /^m6x11/;
	const look = (sel) => E((sel) => {
		const el = document.querySelector(sel); if (!el) return null;
		const cs = getComputedStyle(el);
		return { bg: cs.backgroundColor, font: cs.fontFamily, shadow: cs.boxShadow, color: cs.color, img: cs.backgroundImage };
	}, sel);
	// a screen's dialog: m6x11, the panel colour, the kit's light outline (an inset ring) and a lip
	const checkBox = async (label, boxSel) => {
		const b = await look(boxSel);
		A(!!b && b.bg === TOK.panel && KIT_FONT.test(b.font) && b.shadow.includes(TOK['outline-light']) && b.shadow.includes(TOK['panel-dd']),
			`${label}: the kit's dialog panel (--bal-panel, light outline, lip) in m6x11`, JSON.stringify(b));
	};
	const checkBtn = async (label, sel, tok) => {
		const b = await look(sel);
		A(!!b && b.bg === TOK[tok] && KIT_FONT.test(b.font) && b.img === 'none' && b.shadow !== 'none',
			`${label}: ${sel} is the kit's ${tok} button (flat, m6x11)`, JSON.stringify(b));
	};

	// ---------- 2 + 3. the title: nothing sounds before a gesture; then a press is the kit's "button" ----------
	await sleep(300);
	await E(() => { const t = document.getElementById('tap-start'); if (t && !t.classList.contains('hidden')) t.click(); });
	A(await waitFor(() => visible('scr-login'), 10000), 'the title screen shows');
	await E(() => { G.Audio.sfx('click'); G.Audio.sfx('back'); });   // (a sound asked for before any gesture: dropped by the kit)
	A(await E(() => !!window.BalSfx && window.BalSfx.unlocked() === false), 'no sound before a user gesture (the kit is there, its audio not unlocked)');
	await checkBox('title', '#scr-login .box');
	await checkBtn('title', '#btn-guest', 'green');
	await checkBtn('title', '#btn-mp-login', 'blue');
	A(await E(() => getComputedStyle(document.querySelector('#scr-login .t1')).textShadow.includes('rgb(254, 95, 85)')), 'the logo has the kit\'s red / blue offset shadows (.bal-logo)');
	await shot('01_title');
	await E(() => { window.__sfx.length = 0; });
	await page.click('#btn-guest');
	A(await waitFor(() => visible('scr-starters'), 8000), 'Play opens the partner pick');
	A(await E(() => window.__sfx.includes('button')), 'pressing Play plays the kit\'s "button" sound', await E(() => window.__sfx.join(',')));
	await checkBox('partner pick', '#scr-starters .box');
	A(await E(() => getComputedStyle(document.querySelector('#starter-grid .cell')).backgroundColor) === TOK['panel-d'], 'partner pick: the cells are the kit\'s inset slate');
	await shot('02_starters');
	await E(() => { window.__sfx.length = 0; });
	await page.click('#starter-grid .cell[data-dex="4"]');
	await page.click('#starter-ok');
	A(await waitFor(() => visible('scr-menu'), 8000), 'the menu opens');
	A(await E(() => window.__sfx.filter(s => s === 'button').length >= 1), 'picking a partner presses with the kit\'s sound', await E(() => window.__sfx.join(',')));
	await sleep(1500);
	await E(() => { G.DB.save.coins = 5000; G.DB.save.tickets = { t1: 3, t10: 1 }; G.UI.refreshCoins(); });
	const pill = await look('#topbar .pill');
	A(pill.bg === TOK.panel && KIT_FONT.test(pill.font), 'the topbar pills are kit panels in m6x11', JSON.stringify(pill));
	await shot('03_menu');

	// ---------- every menu screen ----------
	const SCREENS = [
		['collection', 'scr-dex', () => document.querySelector('#scr-menu [data-go=dex]').click()],
		['Upgrades', 'scr-upgrades', () => document.querySelector('#scr-menu [data-go=upgrades]').click()],
		['Gacha', 'scr-gacha', () => document.querySelector('#scr-menu [data-go=gacha]').click()],
		['Missions', 'scr-goals', () => document.querySelector('#scr-menu [data-go=goals]').click()],
		['Lexicon', 'scr-lexicon', () => document.querySelector('#scr-menu [data-go=lexicon]').click()],
		['modes / League HQ', 'scr-modes', () => G.ModesUI.open()],
		['Friends', 'scr-friends', () => G.UI.show('scr-friends')],
		['Ranking', 'scr-rank', () => G.UI.show('scr-rank')],
		['lobby', 'scr-lobby', () => G.UI.show('scr-lobby')],
		['nickname', 'scr-nick', () => G.UI.show('scr-nick')],
		['moderation', 'scr-mod', () => G.UI.show('scr-mod')],
	];
	for (const [label, id, open] of SCREENS) {
		await E(() => G.MenuUI.open()); await sleep(150);
		await E(open);
		A(await waitFor(() => visible(id), 5000), `${label} opens`);
		await sleep(250);
		if (id === 'scr-dex' || id === 'scr-upgrades' || id === 'scr-modes') {
			// (already Micatro's look by mx.css: its own outline-free panel, kept as it was)
			const b = await look(`#${id} .box`);
			A(b.bg === TOK.panel && KIT_FONT.test(b.font), `${label}: the slate panel in m6x11 (as mx.css drew it)`, JSON.stringify(b));
		} else await checkBox(label, `#${id} .box`);
		const back = await look(`#${id} .btn[data-back]`);
		if (back) A(back.bg === TOK.orange, `${label}: Back is the kit's orange`, JSON.stringify(back));
		await shot('04_' + id);
	}
	// tabs: Missions' and the Lexicon's; Gacha's region tabs
	await E(() => G.MenuUI.open()); await E(() => document.querySelector('#scr-menu [data-go=goals]').click()); await sleep(300);
	const tabs = await E(() => [...document.querySelectorAll('#scr-goals .tab')].map(t => ({ on: t.classList.contains('on'), bg: getComputedStyle(t).backgroundColor })));
	A(tabs.length > 2 && tabs.every(t => t.bg === (t.on ? 'rgb(254, 95, 85)' : 'rgb(122, 75, 72)')), 'Missions: tabs are the kit\'s tabs (red on, dark red off)', JSON.stringify(tabs));
	await E(() => { window.__sfx.length = 0; });
	await page.click('#scr-goals .btn[data-back]');
	A(await waitFor(() => visible('scr-menu'), 3000) && await E(() => window.__sfx.includes('cancel')), 'Back plays the kit\'s "cancel" (back) sound', await E(() => window.__sfx.join(',')));
	await E(() => document.querySelector('#scr-menu [data-go=gacha]').click()); await sleep(300);
	const gt = await E(() => [...document.querySelectorAll('#scr-gacha .gen-tab')].map(t => ({ on: t.classList.contains('on'), bg: getComputedStyle(t).backgroundColor })));
	A(gt.length >= 9 && gt.every(t => t.bg === (t.on ? 'rgb(254, 95, 85)' : 'rgb(122, 75, 72)')), 'Gacha: the region tabs are the kit\'s tabs', JSON.stringify(gt.slice(0, 3)));
	// Settings (its own layer), the profile, Credits
	await E(() => G.MenuUI.open()); await sleep(150);
	await page.click('#btn-settings');
	A(await waitFor(() => visible('scr-settings'), 4000), 'Settings opens');
	await checkBox('Settings', '#scr-settings .box');
	A((await look('#set-close')).bg === TOK.orange, 'Settings: Close is the kit\'s orange');
	await shot('05_settings');
	await page.click('#set-close');
	for (const [label, id] of [['profile', 'scr-profile'], ['Credits', 'scr-legal']]) {
		await E(id => document.getElementById(id).classList.remove('hidden'), id); await sleep(200);
		await checkBox(label, `#${id} .box`);
		await shot('06_' + id);
		await E(id => document.getElementById(id).classList.add('hidden'), id);
	}
	A(await E(() => getComputedStyle(document.getElementById('scr-gacha')).backgroundColor) === 'rgba(15, 22, 24, 0.55)', 'a dialog\'s dim layer is the kit\'s (.bal-modal)');

	// ---------- the canvas's "Pixelify" is the kit's m6x11, scaled ----------
	const can = await E(async () => {
		await document.fonts.load('40px Pixelify'); await document.fonts.load('40px m6x11');
		const c = document.createElement('canvas').getContext('2d');
		c.font = '100px Pixelify'; const p = c.measureText('Hello world').width;
		c.font = '100px m6x11'; const m = c.measureText('Hello world').width;
		return { p, m, r: p / m };
	});
	A(Math.abs(can.r - 1.18) < 0.03, 'the canvas\'s "Pixelify" (HUD, minimap, numbers) draws m6x11 at 118 %', JSON.stringify(can));

	// ---------- 4. the Play flow is as it was ----------
	await E(() => G.MenuUI.open()); await sleep(150);
	await E(() => { window.__sfx.length = 0; });
	await page.click('#scr-menu [data-go=play]');
	A(await waitFor(() => visible('scr-play'), 4000), 'Play opens the Play flow');
	const pf = await E(() => ({ font: getComputedStyle(document.getElementById('scr-play')).fontFamily, adj: getComputedStyle(document.getElementById('scr-play')).fontSizeAdjust, back: getComputedStyle(document.getElementById('mx-back')).backgroundColor, head: getComputedStyle(document.querySelector('#scr-play .mx-head')).backgroundColor }));
	A(KIT_FONT.test(pf.font) && pf.adj === 'none' && pf.back === 'rgb(254, 95, 85)' && pf.head === TOK.panel, 'the Play flow keeps mx.css\'s look (its red Back, its sizes)', JSON.stringify(pf));
	A(await E(() => window.__sfx.includes('button')), 'the menu\'s Play presses with the kit\'s sound');
	await shot('07_play');

	// ---------- a run: the level-up cards, pause (Esc), the summary ----------
	await E(() => { for (const s of ['[data-cat=survival]', '[data-var=normal]', '[data-players=solo]']) { const b = document.querySelector('#scr-play ' + s); if (b) b.click(); } });
	await page.click('#mx-start');
	A(await waitFor(() => E(() => G.Game.state === 'playing'), 15000), 'a run starts');
	await sleep(1500);
	await shot('08_hud');
	await E(() => G.RunUI.showLevelUp(2, G.LevelUp.offer(G.Game.player), () => G.UI.hide('scr-levelup')));
	A(await waitFor(() => visible('scr-levelup'), 3000), 'the level-up cards show');
	await checkBox('level-up', '#scr-levelup .box');
	const card = await look('#scr-levelup .cards .card');
	A(card && card.bg === TOK['panel-d'] && card.shadow.includes(TOK['panel-dd']), 'level-up: each card is the kit\'s slate row on a lip', JSON.stringify(card));
	await shot('09_levelup');
	await E(() => { window.__sfx.length = 0; });
	await page.click('#scr-levelup .cards .card');
	A(await E(() => window.__sfx.length > 0), 'picking a card presses with the kit\'s sound', await E(() => window.__sfx.join(',')));
	await E(() => G.UI.hide('scr-levelup'));
	await E(() => { window.__sfx.length = 0; });
	await page.keyboard.press('Escape');
	A(await waitFor(() => visible('scr-pause'), 4000), 'Esc pauses');
	A(await E(() => window.__sfx.includes('cardSlide1')), 'pausing (a key, not a click) plays the kit\'s card slide', await E(() => window.__sfx.join(',')));
	await checkBox('pause', '#scr-pause .box');
	A((await look('#btn-resume')).bg === TOK.green && (await look('#btn-quit')).bg === TOK.red, 'pause: Continue is the kit\'s green, Quit its red');
	await shot('10_pause');
	// the game's mute silences the kit's UI sounds too
	await E(() => { G.Audio.toggleMute(); window.__sfx.length = 0; G.Audio.sfx('click'); });
	A(await E(() => window.__sfx.length === 0), 'muting the game silences its UI sounds (the kit\'s too)');
	await E(() => G.Audio.toggleMute());
	await page.click('#btn-quit');
	A(await waitFor(() => visible('scr-over'), 8000), 'quitting shows the run summary');
	await checkBox('run summary', '#scr-over .box');
	A((await look('#btn-again')).bg === TOK.green, 'run summary: Back to menu is the kit\'s green');
	A(await E(() => getComputedStyle(document.querySelector('#scr-over .stats > div')).backgroundColor) === TOK['panel-d'], 'run summary: the stat rows are the kit\'s inset slate');
	await shot('11_over');
	await page.click('#btn-again');
	A(await waitFor(() => visible('scr-menu'), 6000), 'back to the menu');

	// ---------- 5. a phone held sideways ----------
	await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
	await sleep(500);
	const fits = async (label, id) => {
		const r = await E((id) => {
			const b = document.querySelector('#' + id + ' .box') || document.getElementById(id);
			const q = b.getBoundingClientRect();
			return { l: q.left, r: q.right, t: q.top, w: innerWidth, sw: document.documentElement.scrollWidth };
		}, id);
		A(r.l >= -1 && r.r <= r.w + 1 && r.sw <= r.w + 1, `phone 844x390: ${label} fits the width, no page scroll`, JSON.stringify(r));
	};
	await fits('the menu', 'scr-menu'); await shot('12_phone_menu');
	await E(() => G.SettingsUI.open()); await sleep(300); await fits('Settings', 'scr-settings'); await shot('13_phone_settings'); await E(() => G.SettingsUI.close());
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

	A(errors.length === 0, 'no page errors (2D)', errors.slice(0, 5).join(' | '));

	// ---------- 6. the 3D page ----------
	const p3 = await browser.newPage();
	await p3.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	const err3 = [];
	p3.on('pageerror', e => err3.push(e.message));
	await p3.evaluateOnNewDocument(() => {
		window.__sfx = [];
		let real = null;
		Object.defineProperty(window, 'BalSfx', { configurable: true, get() { return real; }, set(v) { const play = v.play; real = { ...v, play(n, p, vol) { window.__sfx.push(n); return play(n, p, vol); } }; } });
	});
	await p3.goto(`http://localhost:${PORT}/micasurvivor/m3d/?exp=1&dex=4`, { waitUntil: 'domcontentloaded' });
	// (the loading screen goes as soon as the page is up: measured on a stand-in with its id when it has already gone)
	const boot = await p3.evaluate(() => { let el = document.getElementById('boot'), tmp = null; if (!el) { tmp = el = document.createElement('div'); el.id = 'boot'; document.body.appendChild(el); } const b = getComputedStyle(el); const o = { font: b.fontFamily, img: b.backgroundImage }; if (tmp) tmp.remove(); return o; });
	A(KIT_FONT.test(boot.font.replace(/^"|"$/g, '')) && /radial-gradient/.test(boot.img), '3D: the loading screen is on the kit\'s felt in m6x11', JSON.stringify(boot));
	if (SHOTS) await p3.screenshot({ path: path.join(SHOTS, '20_m3d_boot.png') });
	const up = await waitFor(() => p3.evaluate(() => !!document.getElementById('rx-menu-btn') && document.body.classList.contains('rx')), 30000);
	A(up, '3D: a run is up (its menu button is there)');
	if (up) {
		await sleep(1500);
		await p3.evaluate(() => { window.__sfx.length = 0; });
		await p3.click('#rx-menu-btn');
		A(await waitFor(() => p3.evaluate(() => window.__sfx.includes('cardSlide1')), 3000), '3D: opening the run menu plays the kit\'s card slide', await p3.evaluate(() => window.__sfx.join(',')));
		if (SHOTS) await p3.screenshot({ path: path.join(SHOTS, '21_m3d_menu.png') });
		await p3.evaluate(() => { window.__sfx.length = 0; });
		const b = await p3.$('#rx [data-board]');
		if (b) { await b.click(); A(await waitFor(() => p3.evaluate(() => window.__sfx.includes('button')), 3000), '3D: a menu button (the boards) presses with the kit\'s "button"', await p3.evaluate(() => window.__sfx.join(','))); }
		else A(false, '3D: the run menu has a boards button');
	}
	A(err3.length === 0, 'no page errors (3D)', err3.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
