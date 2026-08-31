// mobile_test.mjs — the overworld on a phone.
//
// Three things made touch play materially worse than keyboard, and one of them
// was a hard block:
//
//   1. `body.touch #bar { display: none }` (index.html) hides #hud AND
//      #objective. Every thing the roaming overworld tells you goes through
//      hud.textContent — the map name on arrival, "party healed", "X was sent to
//      the BOX", the egg-ready notice, the rift warning, stuck-load recovery —
//      plus the persistent NEXT: quest objective. A phone player saw NONE of it,
//      and a caught POKeMON silently vanished into storage.
//   2. toggleBike had exactly ONE trigger in the codebase: the `c` key. Cracked
//      floors are gated on player.biking, so SKY PILLAR was impassable on touch.
//   3. The d-pad called setPointerCapture per button, so a thumb sliding from UP
//      onto LEFT kept firing UP — every direction change needed a lift and a
//      re-press.
//
// Runs the real page under a phone viewport with touch emulation.
//
//   node overworld/tests/mobile_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8902;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (speciesId, name, sprite, num) => ({
	speciesId, name, level: 20, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 60, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 60, curHP: 60,
	exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite, num,
});
const PARTY = [mon('rattata', 'LEAD', 's608.png', 19)];

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
}

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		await page.emulate({
			viewport: { width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
			userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
		});
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'KANTO');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data)), 30000);
		A(ready, 'the overworld boots on a phone viewport');
		if (!ready) throw new Error('boot failed');

		A(await page.evaluate(() => document.body.classList.contains('touch')),
			'and puts the page in touch mode');
		A(await page.evaluate(() => getComputedStyle(document.getElementById('bar')).display) === 'none',
			'the DOM status bar is hidden there — which is what made the HUD invisible');

		// ---- 1. the canvas HUD carries what the bar used to ----
		// compare the canvas before and after a hud write: if nothing is mirrored,
		// the pixels are identical
		const shot = () => page.screenshot({ encoding: 'base64', clip: { x: 0, y: 0, width: 412, height: 120 } });
		const before = await shot();
		await page.evaluate(() => { document.getElementById('hud').textContent = 'RATTATA was sent to the BOX!'; });
		await new Promise(r => setTimeout(r, 700));
		const after = await shot();
		A(before !== after, 'a HUD message now paints something on the canvas');

		const hudState = await page.evaluate(() => window.__ow.touchHud);
		A(hudState?.msg === 'RATTATA was sent to the BOX!',
			'and the message the code wrote is the one being shown', JSON.stringify(hudState));
		A(!!hudState?.objective && /NEXT:/.test(hudState.objective),
			'the quest objective rides along too — it was built and then hidden', JSON.stringify(hudState?.objective));

		// it must not paint over a battle or a menu
		await page.evaluate(() => { window.__ow.startMenu.open = true; });
		await new Promise(r => setTimeout(r, 400));
		const menuShot = await page.screenshot({ encoding: 'base64', clip: { x: 0, y: 0, width: 412, height: 120 } });
		await page.evaluate(() => { window.__ow.startMenu.open = false; });
		A(menuShot !== after, 'and it steps aside while a menu is up');

		// ---- 2. the bike is reachable without a keyboard ----
		const menu = await page.evaluate(() => {
			const ow = window.__ow;
			const before = ow.startItems().slice();
			ow.toggleBike();
			const after = ow.startItems().slice();
			const biking = ow.player.biking;
			ow.toggleBike();
			return { before, after, biking, offAgain: ow.player.biking };
		});
		A(menu.before.includes('BIKE'),
			'the START menu offers BIKE — the only trigger used to be the C key', menu.before.join(','));
		A(menu.after.includes('ON FOOT'),
			'and reads ON FOOT once you are riding', menu.after.join(','));
		A(menu.biking === true && menu.offAgain === false, 'toggling works both ways');

		// the thing this actually unblocks: cracked floors need player.biking
		A(await page.evaluate(() => {
			const ow = window.__ow;
			ow.toggleBike();
			const ok = ow.player.biking;   // isCrackedFloor is gated on exactly this
			ow.toggleBike();
			return ok;
		}), 'which is the flag cracked floors (SKY PILLAR) are gated on');

		// ---- 3. the d-pad lets a thumb slide between directions ----
		const slide = await page.evaluate(async () => {
			const ow = window.__ow;
			const rect = id => document.getElementById(id).getBoundingClientRect();
			const mid = r => [r.left + r.width / 2, r.top + r.height / 2];
			const up = rect('t-up'), left = rect('t-left');
			const [ux, uy] = mid(up), [lx, ly] = mid(left);
			const fire = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, {
				pointerId: 7, clientX: x, clientY: y, bubbles: true, cancelable: true,
			}));
			fire(document.getElementById('t-up'), 'pointerdown', ux, uy);
			const held1 = ow.heldKeys.slice();
			// slide the same finger onto LEFT without lifting
			fire(window, 'pointermove', lx, ly);
			const held2 = ow.heldKeys.slice();
			fire(window, 'pointerup', lx, ly);
			const held3 = ow.heldKeys.slice();
			return { held1, held2, held3 };
		});
		A(slide.held1.includes('up'), 'pressing UP holds up', JSON.stringify(slide.held1));
		A(slide.held2.includes('left') && !slide.held2.includes('up'),
			'sliding onto LEFT switches direction without lifting the thumb', JSON.stringify(slide.held2));
		A(slide.held3.length === 0, 'and lifting releases everything', JSON.stringify(slide.held3));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
