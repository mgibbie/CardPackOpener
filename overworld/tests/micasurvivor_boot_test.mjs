// micasurvivor_boot_test.mjs — MicaSurvivor (the vendored PokéSurvivor port, M1) end to end
// in headless Chrome, served from /micasurvivor/ with the local (gitignored) sprite assets:
//   - boots with no console errors and NO request to any non-localhost origin (no Firebase,
//     no fonts CDN, no STUN outside a co-op lobby, no analytics); English by default; "MicaSurvivor" title and the
//     "based on PokéSurvivor by JPTER78" credit visible; the Credits screen shows the Required
//     Notice, the SpriteCollab artists and the JayElDragon controller credit
//   - guest start (one "Play" button) -> personality test -> partner -> main menu
//   - Friends asks a guest to sign in (M5 batch 12b: online co-op needs a Magepunk account); Ranking (M3: the
//     Magepunk leaderboard) asks a guest to log in
//   - start a run; a bot walking in circles survives ~30 s; level-up cards are picked
//   - quit the run -> summary; coins + run stats are saved under micasurvivor_* keys and
//     round-trip through a reload (the session is restored straight into the menu)
//   - the _redirects rule for /micasurvivor/assets/* and the deploy script exist
// Screenshots (title, menu, mid-run, level-up) go to MICASURVIVOR_SHOTS=<dir> when set.
// Covers micasurvivor/index.html, micasurvivor/css/style.css, micasurvivor/js/** (core/db.js
// offline guest profile, core/i18n.js English default, ui/login.js, ui/social-ui.js, ui/ui.js,
// ui/settings-ui.js, mica/credits.js, game.js, main.js), _redirects and package.json.
//   node overworld/tests/micasurvivor_boot_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
// (B1c) MAGEPUNK_ASSET_ROOT=<checkout>: serve the gitignored micasurvivor/assets/ and overworld/data/ from that checkout
// (read only; a git worktree has neither), as micasurvivor_pokedex_test does
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8790;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

// ---- static config checks (no browser)
const redirects = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8').split(/\r?\n/).map(l => l.trim());
A(redirects.includes('/micasurvivor/assets/* https://magepunk-micasurvivor.pages.dev/:splat 301'), '_redirects sends /micasurvivor/assets/* to magepunk-micasurvivor.pages.dev (301)');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
A(/magepunk-micasurvivor/.test(pkg.scripts['deploy-micasurvivor'] || '') && /cd \.micasurvivor/.test(pkg.scripts['deploy-micasurvivor']), 'npm run deploy-micasurvivor deploys from the staging dir to magepunk-micasurvivor');
const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
A(/^micasurvivor\/assets\/$/m.test(gi), 'micasurvivor/assets/ is gitignored');
const MS = path.join(ROOT, 'micasurvivor');
A(fs.readFileSync(path.join(MS, 'LICENSE-NONCOMMERCIAL.md'), 'utf8').includes('PolyForm Noncommercial'), 'LICENSE-NONCOMMERCIAL.md shipped');
A(fs.existsSync(path.join(MS, 'LICENSE')) && fs.readFileSync(path.join(MS, 'CREDITS.md'), 'utf8').includes('SpriteCollab'), 'LICENSE + CREDITS.md shipped');
A(fs.readFileSync(path.join(MS, 'README.md'), 'utf8').includes('Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)'), 'README carries the exact Required Notice line');
const html = fs.readFileSync(path.join(MS, 'index.html'), 'utf8');
for (const gone of ['firebase', 'ko-fi', 'updater.js', 'support-ui.js', 'funding.js', 'gstatic', 'googletagmanager', 'sw.js'])
	A(!html.toLowerCase().includes(gone), `index.html has no ${gone}`);
const ASSETS = fs.existsSync(path.join(AROOT, 'micasurvivor/assets/pokemon/1'));
if (!ASSETS) console.log('note: micasurvivor/assets/pokemon is missing locally — sprites will 404 (run with the assets present)');

// ---- server: the repo root, like Cloudflare Pages
const external = [], notFound = [];
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(/^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT, f), (e, d) => {
		if (e) { notFound.push(u); res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--lang=es-ES'] });
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
	await page.setRequestInterception(true);
	page.on('request', r => {
		const url = r.url();
		if (/^(data|blob):/.test(url) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) { r.continue(); return; }
		external.push(url); r.abort();
	});
	const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
	const visible = (id) => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	const passTap = async () => { if (await visible('tap-start')) await page.click('#tap-start'); };

	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => document.getElementById('boot').classList.contains('hidden')), 30000), 'boot screen clears (every module loaded)', errors.slice(0, 5).join(' | '));
	A(await page.evaluate(() => document.title) === 'MicaSurvivor', 'tab title is MicaSurvivor');
	A(await page.evaluate(() => G.I18n.lang) === 'en', 'English by default (even with a Spanish browser)');
	await sleep(300); await passTap();
	A(await waitFor(() => visible('scr-login'), 10000), 'login screen shows');
	const login = await page.evaluate(() => ({
		logo: document.querySelector('#scr-login .t1').textContent,
		text: document.getElementById('scr-login').innerText,
		formHidden: document.getElementById('login-form').classList.contains('hidden'),
		guest: document.getElementById('btn-guest').textContent.trim(),
		google: document.getElementById('btn-google').classList.contains('hidden'),
		mode: G.DB.mode,
	}));
	A(login.logo === 'MicaSurvivor', 'logo reads MicaSurvivor', login.logo);
	A(/Based on\s+PokéSurvivor\s+by JPTER78/.test(login.text), 'credit "Based on PokéSurvivor by JPTER78" on the title screen', login.text.slice(0, 200));
	A(login.formHidden && login.google && login.guest === 'Play', 'no password/Google login, a single Play button', JSON.stringify(login));
	A(login.mode === 'local', 'database is local (no cloud)');
	await shot('desktop_title.png');

	// credits screen
	await page.click('#scr-login [data-legal]');
	A(await waitFor(() => page.evaluate(() => document.querySelectorAll('#credits-artists li').length > 50), 8000), 'Credits lists the SpriteCollab artists (from CREDITS.md)');
	const cred = await page.evaluate(() => document.getElementById('scr-legal').innerText);
	A(cred.includes('Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)'), 'Credits shows the Required Notice');
	A(/CC BY-NC 4\.0/.test(cred) && /Controller design from the Android port by JayElDragon \(MIT\)/.test(cred), 'Credits shows the sprite licence and the JayElDragon controller credit');
	A(/PolyForm Noncommercial/.test(cred), 'Credits names the PolyForm Noncommercial licence');
	await shot('desktop_credits.png');
	await page.click('#legal-close');

	// guest start -> personality test -> partner
	await page.click('#btn-guest');
	A(await waitFor(() => visible('scr-test'), 8000), 'guest start opens the personality test');
	for (let i = 0; i < 40 && await visible('scr-test'); i++) {
		await page.evaluate(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); });
		await sleep(120);
	}
	A(await waitFor(() => visible('scr-result'), 8000), 'test result shows a partner');
	await page.click('#res-ok');
	A(await waitFor(() => visible('scr-menu'), 10000), 'main menu opens');
	await sleep(800);
	const menu = await page.evaluate(() => ({ partner: G.DB.save.partner, coins: G.DB.save.coins, keys: Object.keys(localStorage), text: document.getElementById('scr-menu').innerText }));
	A(menu.partner > 0, 'a partner is saved', menu.partner);
	A(menu.keys.includes('micasurvivor_save.guest') && menu.keys.every(k => k.startsWith('micasurvivor_')), 'saves under micasurvivor_* keys only', menu.keys.join(','));
	A(/MicaSurvivor/.test(menu.text) && /Based on PokéSurvivor by JPTER78/.test(menu.text), 'menu logo + credit');
	await shot('desktop_menu.png');

	// friends (M5 batch 12b): a guest is asked to sign in, no error; the leaderboard (M3) asks a guest to log in to Magepunk
	for (const go of ['friends', 'rank']) {
		await page.click(`#scr-menu [data-go=${go}]`);
		await sleep(300);
		const t = await page.evaluate(() => document.querySelector('.toast') ? document.querySelector('.toast').textContent : '');
		const want = go === 'friends' ? /Sign in to play with friends/ : /Log in to Magepunk to join the leaderboard/;
		A(want.test(t) && await visible('scr-menu'), `${go}: says ${want}, stays on the menu`, t);
	}
	A(await page.evaluate(() => document.getElementById('menu-rank-sub').textContent) === 'Log in to Magepunk', 'the Ranking item says "Log in to Magepunk" for a guest');
	A(await page.evaluate(() => document.getElementById('menu-friends-sub').textContent) === 'Sign in to play with friends', 'the Friends item says "Sign in to play with friends" for a guest (no "Coming soon")');
	A(await page.evaluate(() => [...document.querySelectorAll('.mica-back')].every(a => a.getAttribute('href') === '/' && a.textContent === 'Back to Magepunk')), 'without ?direct=1 the way back goes to the Magepunk home page');
	// settings -> about has the credits button
	await page.click('#btn-settings');
	await page.click('#set-tabs [data-t=about]');
	const about = await page.evaluate(() => document.getElementById('set-body').innerText);
	A(/MicaSurvivor/.test(about) && /Based on PokéSurvivor by JPTER78/.test(about) && /Credits & licences/.test(about), 'Settings > About: MicaSurvivor + credit + Credits button', about.slice(0, 200));
	A(!/Contacto|Contact\b/.test(about), 'no upstream contact page link');
	// owner 2026-10-17: no Log out / Delete account (browser-only save) and no upstream "What's new" until M3
	await page.click('#set-tabs [data-t=acc]');
	const acc = await page.evaluate(() => ({ out: !!document.getElementById('set-logout'), del: !!document.getElementById('set-delete') }));
	A(!acc.out && !acc.del, 'Settings > Account has no Log out / Delete account buttons', JSON.stringify(acc));
	await page.click('#set-close');
	const hid = await page.evaluate(() => ['btn-news', 'btn-logout'].map((id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display === 'none'; }));
	A(hid[0] && hid[1], 'the "What\'s new" and menu log-out buttons are hidden', JSON.stringify(hid));

	// start a run
	await page.click('#scr-menu [data-go=play]');
	A(await waitFor(() => page.evaluate(() => G.Game.state === 'playing'), 15000), 'run starts', await page.evaluate(() => G.Game.state));
	// the bot takes the first card at every level-up / item / bond screen
	let picks = 0, levelShot = false, midShot = false;
	const pickCards = async () => {
		for (const scr of ['scr-levelup', 'scr-item', 'scr-bond']) {
			if (!await visible(scr)) continue;
			if (scr === 'scr-levelup' && !levelShot) { await sleep(400); await shot('desktop_levelup.png'); levelShot = true; }
			const lvl = await page.evaluate(() => G.Game.player && G.Game.player.level);
			const ok = await page.evaluate(scr => { const c = document.querySelector('#' + scr + ' .cards > *:not(.hidden)'); if (c) { c.click(); return true; } return false; }, scr);
			if (ok && scr === 'scr-levelup') { picks++; console.log('      picked a level-up card at level', lvl); }
			await sleep(250);
		}
	};
	let held = [];
	const hold = async (keys) => {
		for (const k of held) if (!keys.includes(k)) await page.keyboard.up(k);
		for (const k of keys) if (!held.includes(k)) await page.keyboard.down(k);
		held = keys;
	};
	// phase 1: walk in circles (W, D, S, A) for ~30 s
	const CIRCLE = [['KeyW'], ['KeyW', 'KeyD'], ['KeyD'], ['KeyD', 'KeyS'], ['KeyS'], ['KeyS', 'KeyA'], ['KeyA'], ['KeyA', 'KeyW']];
	let t0 = Date.now(), k = 0;
	while (Date.now() - t0 < 30000) {
		if (await page.evaluate(() => G.Game.state) === 'over') break;
		await pickCards();
		await hold(CIRCLE[k++ % CIRCLE.length]);
		if (!midShot && Date.now() - t0 > 15000) { await shot('desktop_midrun.png'); midShot = true; }
		await sleep(350);
	}
	await hold([]);
	const alive = await page.evaluate(() => ({ state: G.Game.state, dead: !!(G.Game.player && G.Game.player.dead), level: G.Game.player && G.Game.player.level }));
	A(alive.state !== 'over' && !alive.dead, 'bot survived ~30 s walking in circles', JSON.stringify(alive));
	// phase 2 (if no level-up yet): walk to the nearest XP orb, else toward the nearest enemy
	t0 = Date.now();
	while (picks < 1 && Date.now() - t0 < 60000) {
		if (await page.evaluate(() => G.Game.state) === 'over') break;
		await pickCards();
		const dir = await page.evaluate(() => {
			const p = G.Game.player; if (!p) return null;
			const d2 = o => (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
			const near = l => l.reduce((b, o) => (!b || d2(o) < d2(b) ? o : b), null);
			const t = near(G.Pickups.all().filter(o => /^xp/.test(o.kind))) || near(G.Pickups.all()) || near(G.EnemyMgr.all().filter(e => !e.dead));
			return t ? [t.x - p.x, t.y - p.y] : null;
		});
		const keys = [];
		if (dir) {
			const [dx, dy] = dir, m = Math.hypot(dx, dy) || 1;
			if (dx / m > 0.38) keys.push('KeyD'); else if (dx / m < -0.38) keys.push('KeyA');
			if (dy / m > 0.38) keys.push('KeyS'); else if (dy / m < -0.38) keys.push('KeyW');
		}
		await hold(keys);
		await sleep(250);
	}
	await hold([]);
	await pickCards();
	const lv = await page.evaluate(() => G.Game.player && G.Game.player.level);
	A(picks >= 1 && lv >= 2, `level-up card pick works (${picks} picks, level ${lv})`);
	A(await page.evaluate(() => G.Game.state) === 'playing', 'the run resumes after the pick', await page.evaluate(() => G.Game.state));

	// quit -> summary -> saved
	const before = await page.evaluate(() => ({ coins: G.DB.save.coins, runs: G.DB.save.stats.runs }));
	await page.evaluate(() => { for (const id of ['scr-levelup', 'scr-item', 'scr-bond']) { const c = document.querySelector('#' + id + ':not(.hidden) .cards > *'); if (c) c.click(); } });
	await sleep(300);
	await page.keyboard.press('Escape');
	A(await waitFor(() => visible('scr-pause'), 5000), 'Esc pauses');
	await page.click('#btn-quit');
	A(await waitFor(() => visible('scr-over'), 8000), 'quitting shows the run summary');
	const after = await page.evaluate(() => ({ coins: G.DB.save.coins, runs: G.DB.save.stats.runs, best: G.DB.save.stats.bestTime, stored: JSON.parse(localStorage.getItem('micasurvivor_save.guest')) }));
	A(after.runs === before.runs + 1 && after.coins > before.coins, `run is counted and pays coins (${before.coins} -> ${after.coins})`);
	A(after.stored && after.stored.coins === after.coins && after.stored.stats.runs === after.runs && after.stored.stats.bestTime >= 25, 'summary written to localStorage (micasurvivor_save.guest)', JSON.stringify(after.stored && { c: after.stored.coins, r: after.stored.stats.runs, b: after.stored.stats.bestTime }));
	await page.click('#btn-again');
	A(await waitFor(() => visible('scr-menu'), 8000), 'back to the menu');

	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => document.getElementById('boot').classList.contains('hidden')), 30000);
	await sleep(300); await passTap();
	A(await waitFor(() => visible('scr-menu'), 10000), 'reload restores the session straight into the menu');
	const re = await page.evaluate(() => ({ coins: G.DB.save.coins, runs: G.DB.save.stats.runs, best: G.DB.save.stats.bestTime, partner: G.DB.save.partner }));
	A(re.coins === after.coins && re.runs === after.runs && re.best === after.best && re.partner === menu.partner, 'coins, runs, best time and partner round-trip through the reload', JSON.stringify(re));

	A(errors.length === 0, 'no console errors', errors.slice(0, 5).join(' | '));
	A(external.length === 0, 'no request to any non-localhost origin', external.slice(0, 5).join(' | '));
	const missing = notFound.filter(u => !(u.startsWith('/micasurvivor/assets/') && !ASSETS));
	A(missing.length === 0, 'no 404s', missing.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
