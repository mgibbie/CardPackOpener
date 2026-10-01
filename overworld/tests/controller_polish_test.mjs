// controller_polish_test.mjs — controller support, Phase 5 (Plans/CONTROLLER_SUPPORT_PLAN.md):
// button names for the pad in your hands, OPTIONS > CONTROLS (layout, remap,
// rumble), the Battlecards board hint bar, the wiki's Controls page, and a
// Steam-Deck-sized screen. Fake pads ride in window.__owFakePads (headless Chrome
// has no controllers); the fake carries a vibration actuator that records.
//
//   node overworld/tests/controller_polish_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9148;
const STATE = { username: 'polish', friendCode: 'POLSH0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = await new Promise(r => {
	const s = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { for await (const _ of req) {} res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [], rows: [], ow: null })); return; }
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	s.listen(PORT, () => r(s));
});
const LEAD = { speciesId: 'lapras', name: 'LAPRAS', level: 50, gender: 'M', friend: 70, types: ['Water', 'Ice'], ability: 'waterabsorb',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 190, atk: 105, def: 95, spa: 105, spd: 115, spe: 75 },
	maxHP: 190, curHP: 190, exp: 125000, moves: [{ id: 'surf', name: 'Surf', pp: 15, maxPp: 15 }], sprite: 's131.png', num: 131 };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const open = async (url, vp = { width: 1280, height: 800 }) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, lead) => {
			const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard',
				buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0],
				vibrationActuator: { playEffect: (type, fx) => { (window.__buzz ||= []).push({ type, ms: fx.duration, m: fx.strongMagnitude }); return Promise.resolve('complete'); } } };
			window.__owFakePads = [pad]; window.__pad = pad;
			if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
			localStorage.setItem('magepunk_mp_token_v1', 'polish-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([lead]));
			localStorage.setItem('magepunk_repel_v1', '99999');
		}, STATE, LEAD);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		const tap = async b => { await page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, b); await sleep(70); await page.evaluate(b => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, b); await sleep(140); };
		return { ctx, page, errors, tap };
	};

	// ===================== the overworld =====================
	{
		const t = await open('/overworld/index.html?map=PalletTown&x=10&y=12');
		for (let i = 0; i < 200 && !(await t.page.evaluate(() => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data)).catch(() => false)); i++) await sleep(200);
		await sleep(1500);
		const hints = () => t.page.evaluate(() => document.getElementById('keyhints')?.textContent || '');
		// ---- button names for the pad in your hands ----
		A(/\[A\] talk/.test(await hints()) && /hold \[B\] run/.test(await hints()) && /\[\+\] menu/.test(await hints()),
			'the hint bar names a Switch pad\'s buttons (A talks, hold B runs, + opens the menu)', await hints());
		await t.page.evaluate(() => { window.__ow.startMenu.open = true; });
		await sleep(150);
		A(/\[A\] OK · \[B\] back/.test(await hints()), '...and changes with the screen (a menu)', await hints());
		await t.page.evaluate(() => { window.__ow.startMenu.open = false; });

		// ---- OPTIONS > CONTROLS ----
		const rowOf = off => t.page.evaluate(off => window.__ow.KEY_ACTIONS.length + 1 + off, off);
		const pick = async off => {
			await t.page.evaluate(i => { const o = window.__ow.optionsMenu; o.open = true; o.mode = 'controls'; o.idx = i; o.capture = null; }, await rowOf(off));
			await t.page.keyboard.press('z'); await sleep(120);
			return t.page.evaluate(() => window.__ow.optionsMenu.flash || '');
		};
		const rows = await t.page.evaluate(() => { window.__ow.optionsMenu.open = true; window.__ow.optionsMenu.mode = 'controls'; window.__ow.drawOptions(640, 480); return window.__ow.menuUi.filter(b => /^ctl:/.test(b.id)).length; });
		A(rows >= 8, 'OPTIONS > CONTROLS lists the controller rows alongside the keys', String(rows));
		// layout: Nintendo -> Xbox flips which button confirms
		const f1 = await pick(0);
		const saved1 = await t.page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_pad_v1') || '{}'));
		A(saved1.layout === 'xbox' && /B confirms, A cancels/.test(f1), 'switching to the XBOX layout: on this Switch pad the bottom (B) now confirms', f1);
		await t.page.evaluate(() => { window.__ow.optionsMenu.open = false; });
		await sleep(200);
		A(/\[B\] talk/.test(await hints()), '...and the hint bar follows', await hints());
		await pick(0);   // back to NINTENDO
		A(await t.page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_pad_v1')).layout) === 'nintendo', 'switching back restores the Nintendo layout');

		// remap: BAG onto the LEFT face button (index 2); its old action (context) moves to the top button
		await pick(2 + 4);   // PAD: BAG
		A(await t.page.evaluate(() => window.__ow.optionsMenu.padCapture === 'secondary'), 'choosing a controller row waits for a button');
		const bagBefore = await t.page.evaluate(() => window.__ow.bagMenu.open);
		await t.tap(2);
		const cap = await t.page.evaluate(() => ({ capture: window.__ow.optionsMenu.padCapture, flash: window.__ow.optionsMenu.flash, remap: JSON.parse(localStorage.getItem('magepunk_pad_v1')).remap, bag: window.__ow.bagMenu.open }));
		A(cap.capture == null && cap.remap && cap.remap[2] === 'secondary' && cap.remap[3] === 'context', 'pressing the left button assigns BAG there (and swaps CONTEXT to the top button)', JSON.stringify(cap));
		A(/BAG is now Y/.test(cap.flash) && cap.bag === bagBefore, '...says so, and the assigning press did not also open the bag', cap.flash);
		await t.page.evaluate(() => { window.__ow.optionsMenu.open = false; });
		await sleep(150);
		await t.tap(2);
		A(await t.page.evaluate(() => window.__ow.bagMenu.open), 'roaming, the left button now opens the bag');
		await t.tap(0); await sleep(100);   // close (bottom = cancel)
		await pick(2 + 8);   // RESET CONTROLLER BUTTONS
		A(await t.page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_pad_v1')).remap == null), 'RESET CONTROLLER BUTTONS clears the remap');

		// rumble: off by default; turning it on buzzes once; a battle crit would too
		const buzz0 = await t.page.evaluate(() => (window.__buzz || []).length);
		const fr = await pick(1);
		const buzz1 = await t.page.evaluate(() => (window.__buzz || []).length);
		A(buzz0 === 0 && buzz1 === 1 && /Rumble on/.test(fr), 'rumble is off until turned on; turning it on gives a test buzz', `${buzz0} -> ${buzz1}`);
		const crit = await t.page.evaluate(async () => { const { rumble } = await import('/site/gamepad.js'); return rumble(0.85, 180); });
		A(crit === true, 'with rumble on, a crit-strength rumble reaches the pad');
		await pick(1);
		A(await t.page.evaluate(async () => { const { rumble } = await import('/site/gamepad.js'); return rumble(0.85, 180); }) === false, 'turned off, nothing buzzes');
		await t.page.evaluate(() => { window.__ow.optionsMenu.open = false; });

		// unplugging brings the keyboard hints back
		await t.page.evaluate(() => { window.__owFakePads.length = 0; });
		await sleep(250);
		A(/Z interact/.test(await hints()), 'with the pad unplugged, the keyboard hints come back', await hints());
		// Steam Deck-sized screen: nothing spills sideways
		A(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'at 1280×800 the overworld has no horizontal overflow');
		A(t.errors.length === 0, 'no uncaught page error in the overworld', JSON.stringify(t.errors.slice(0, 2)));
		await t.ctx.close();
	}

	// ===================== the Battlecards board =====================
	{
		const t = await open('/battlecards/index.html?players=2');
		const t0 = Date.now();
		while (Date.now() - t0 < 45000 && !(await t.page.evaluate(() => !!(window.__game && window.__game.state && window.__game.targeting)).catch(() => false))) await sleep(200);
		await sleep(2500);
		await t.page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /keep hand/i.test(x.textContent)); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } });
		await sleep(900);
		await t.tap(15);   // first press shows focus (and the hints)
		await sleep(200);
		const hb = await t.page.evaluate(() => { const e = document.getElementById('padboard-hints'); return e ? { show: getComputedStyle(e).display, text: e.textContent } : null; });
		A(hb && hb.show === 'block' && /\[A\] play \/ attack/.test(hb.text) && /\[\+\] menu/.test(hb.text), 'the board hint bar names this pad\'s buttons', JSON.stringify(hb));
		A(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'at 1280×800 the match has no horizontal overflow');
		A(t.errors.length === 0, 'no uncaught page error in the match', JSON.stringify(t.errors.slice(0, 2)));
		await t.ctx.close();
	}

	// ===================== the on-screen keyboard names its buttons =====================
	{
		const t = await open('/battlecards/deck.html');
		await sleep(2500);
		const hint = await t.page.evaluate(async () => {
			const { askText } = await import('/site/osk.js');
			const p = askText({ title: 'x' });
			await new Promise(r => setTimeout(r, 200));
			const h = document.querySelector('#osk .osk-hint')?.textContent || '';
			document.querySelector('#osk input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			await p;
			return h;
		});
		A(/\[A\] type the key/.test(hint) && /\[B\] delete/.test(hint), 'the on-screen keyboard names the pad\'s buttons too', hint);
		await t.ctx.close();
	}

	// ===================== the wiki's Controls page =====================
	{
		const t = await open('/designwiki/index.html#/controls');
		await sleep(1500);
		const w = await t.page.evaluate(() => ({ h1: document.querySelector('#content h1, main h1, h1')?.textContent, tables: document.querySelectorAll('table').length, signed: /signed-in/i.test(document.body.textContent), link: !!document.querySelector('a[href="#/controls"]') }));
		A(w.h1 === 'Controls' && w.tables >= 4 && w.signed && w.link, 'the design wiki has a Controls page (all four surfaces, the sign-in rule)', JSON.stringify(w));
		await t.ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
