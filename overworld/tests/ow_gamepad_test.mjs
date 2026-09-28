// ow_gamepad_test.mjs — controller play in the overworld and Pokémon battles
// (Plans/CONTROLLER_SUPPORT_PLAN.md, Phase 1).
//
// Owner's calls: controller play is for SIGNED-IN players only, and the
// Nintendo layout is the standard (the RIGHT face button confirms, the bottom
// one cancels). Headless Chrome has no controllers, so fake pads ride in
// window.__owFakePads through the real site/gamepad.js poller; everything below
// that — pressKey, heldKeys, menus, battles — is the real game.
//
//   node overworld/tests/ow_gamepad_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const puppeteer = (await import('puppeteer-core')).default;
const http = await import('http');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9137;
const STATE = { username: 'padplayer', friendCode: 'PADPL0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		for await (const _ of req) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		// 'nouser-token': a token whose account never loads (the only signed-out
		// state the overworld can reach; with no token at all it sends you to /login)
		const noUser = /nouser/.test(req.headers.authorization || '');
		return res.end(JSON.stringify({ ok: true, state: noUser ? null : STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [], rows: [], ow: null }));
	}
	fs.readFile(path.join(ROOT, u === '/' ? '/index.html' : u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(u)] || 'application/octet-stream' });
		res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LEAD = { speciesId: 'lapras', name: 'LAPRAS', level: 50, gender: 'M', friend: 70, types: ['Water', 'Ice'], ability: 'waterabsorb',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 190, atk: 105, def: 95, spa: 105, spd: 115, spe: 75 },
	maxHP: 190, curHP: 190, exp: 125000, heldItem: 'leftovers', sprite: 's131.png', num: 131,
	moves: [{ id: 'surf', name: 'Surf', pp: 15, maxPp: 15 }, { id: 'icebeam', name: 'Ice Beam', pp: 10, maxPp: 10 }, { id: 'bodyslam', name: 'Body Slam', pp: 15, maxPp: 15 }] };

// Standard mapping by POSITION. With the Nintendo layout: RIGHT = confirm, BOTTOM = cancel.
const BTN = { bottom: 0, right: 1, left: 2, top: 3, lb: 4, rb: 5, select: 8, start: 9, up: 12, down: 13, left_d: 14, right_d: 15 };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const open = async (signedIn) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, lead, signedIn) => {
			// a fake standard-mapping pad, live in the page; the test flips its buttons
			const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard',
				buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [pad];
			window.__pad = pad;
			if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
			if (signedIn) {
				localStorage.setItem('magepunk_mp_token_v1', 'pad-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			} else localStorage.setItem('magepunk_mp_token_v1', 'nouser-token');   // no account behind it
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([lead]));
			localStorage.setItem('magepunk_repel_v1', '99999');
		}, STATE, LEAD, signedIn);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown&x=10&y=12`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 200 && !(await page.evaluate(() => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data)).catch(() => false)); i++) await sleep(200);
		await sleep(1500);
		const hold = (b, on) => page.evaluate((b, on) => { window.__pad.buttons[b] = { pressed: on, value: on ? 1 : 0 }; }, b, on);
		const tap = async b => { await hold(b, true); await sleep(80); await hold(b, false); await sleep(120); };
		const stick = (x, y) => page.evaluate((x, y) => { window.__pad.axes[0] = x; window.__pad.axes[1] = y; }, x, y);
		const st = () => page.evaluate(() => {
			const W = window.__ow, g = W.gateReport();
			return { x: W.player.tx, y: W.player.ty, start: W.startMenu.open, bag: W.bagMenu.open, party: W.partyMenu.open,
				summary: W.partyMenu.summary, held: g.heldKeys, run: g.runHeld, blocked: g.menuBlocking, hud: document.getElementById('hud')?.textContent || '' };
		});
		return { ctx, page, errors, hold, tap, stick, st };
	};

	// ===== not signed in (no account loaded): the controller does nothing, and says why =====
	{
		const t = await open(false);
		A(await t.page.evaluate(() => window.__ow.gamepad === null), 'signed out: no controller layer is started');
		await t.page.evaluate(() => dispatchEvent(new Event('gamepadconnected')));
		await sleep(100);
		A(/Sign in to play with a controller/.test((await t.st()).hud), '...and plugging one in says to sign in', (await t.st()).hud);
		await t.tap(BTN.start);
		const x0 = (await t.st()).x;
		await t.stick(1, 0); await sleep(600); await t.stick(0, 0); await sleep(300);
		const s = await t.st();
		A(!s.start && s.x === x0, '...Start and the stick do nothing', JSON.stringify(s));
		await t.ctx.close();
	}

	// ===== signed IN =====
	const t = await open(true);
	A(await t.page.evaluate(() => !!window.__ow.gamepad && window.__ow.gamepad.connected()), 'signed in: the controller layer runs and sees the pad');
	A(await t.page.evaluate(() => window.__ow.gamepad.kind()) === 'switch', '...identified as a Nintendo pad');

	// walking: the stick rides in heldKeys, like the touch d-pad
	{
		const s0 = await t.st();
		await t.stick(1, 0); await sleep(700);
		const s1 = await t.st();
		A(s1.x > s0.x && s1.held.includes('right'), 'the left stick walks the player', `${s0.x} -> ${s1.x} held=${s1.held}`);
		await t.stick(0, 0); await sleep(400);
		const s2 = await t.st(); await sleep(400);
		A((await t.st()).x === s2.x && !s2.held.includes('right'), '...and centring it stops them');
		await t.hold(BTN.down, true); await sleep(500);
		A((await t.st()).y > s2.y, 'the d-pad walks too');
		await t.hold(BTN.down, false); await sleep(300);
		await t.hold(BTN.bottom, true); await sleep(150);
		A((await t.st()).run === true, 'holding the BOTTOM button (cancel) runs');
		await t.hold(BTN.bottom, false); await sleep(150);
		A((await t.st()).run === false, '...letting go walks again');
	}

	// a keyboard keyup of the same arrow cannot cancel a held stick
	{
		await t.stick(-1, 0); await sleep(150);
		await t.page.keyboard.down('ArrowLeft'); await sleep(100); await t.page.keyboard.up('ArrowLeft'); await sleep(150);
		A((await t.st()).held.includes('left'), 'keyboard and controller together: releasing the key keeps the stick\'s direction');
		await t.stick(0, 0); await sleep(300);
	}

	// leaving the tab lets go; coming back with the stick still pushed walks nowhere
	{
		await t.stick(0, 1); await sleep(250);
		await t.page.evaluate(() => dispatchEvent(new Event('blur')));
		await sleep(100);
		const b0 = await t.st(); await sleep(600);
		const b1 = await t.st();
		A(!b0.held.includes('down') && b1.y === b0.y, 'a blur mid-walk releases the stick and the player stops', JSON.stringify({ b0: b0.held, y0: b0.y, y1: b1.y }));
		await t.stick(0, 0); await sleep(200);
		// the same fix for the keyboard: a key held across a blur is let go
		await t.page.keyboard.down('ArrowUp'); await sleep(120);
		await t.page.evaluate(() => dispatchEvent(new Event('blur')));
		await sleep(80);
		A(!(await t.st()).held.includes('up'), 'the keyboard no longer walks on after the tab loses focus');
		await t.page.keyboard.up('ArrowUp'); await sleep(200);
	}

	// menus: Start opens, the d-pad steps (and repeats), RIGHT confirms, BOTTOM cancels
	{
		await t.tap(BTN.start);
		A((await t.st()).start, 'Start opens the start menu');
		const i0 = await t.page.evaluate(() => window.__ow.startMenu.idx);
		await t.tap(BTN.down);
		A(await t.page.evaluate(() => window.__ow.startMenu.idx) !== i0, 'the d-pad moves the menu cursor one step');
		const i1 = await t.page.evaluate(() => window.__ow.startMenu.idx);
		await t.hold(BTN.down, true); await sleep(520); await t.hold(BTN.down, false); await sleep(100);
		const i2 = await t.page.evaluate(() => window.__ow.startMenu.idx);
		A(i2 !== i1, 'holding it scrolls (repeat)', `${i1} -> ${i2}`);
		A((await t.st()).x === (await t.st()).x && !(await t.st()).held.length, '...without walking the player behind the menu');
		await t.tap(BTN.bottom);
		A(!(await t.st()).start, 'the BOTTOM button cancels out (Nintendo layout)');
	}

	// top face = bag, Select = party; X (left face) takes the lead's held item
	{
		await t.tap(BTN.top);
		A((await t.st()).bag, 'the top face button opens the bag');
		await t.tap(BTN.bottom); await sleep(100);
		await t.tap(BTN.select);
		A((await t.st()).party, 'Select opens the party');
		const before = await t.page.evaluate(() => ({ held: window.__ow.party[0].heldItem, bag: window.__ow.Bag.count('leftovers') }));
		await t.tap(BTN.left);
		const after = await t.page.evaluate(() => ({ held: window.__ow.party[0].heldItem, bag: window.__ow.Bag.count('leftovers') }));
		A(before.held === 'leftovers' && after.held == null && after.bag === before.bag + 1, 'the left face button TAKES the held item (was tap-only)', JSON.stringify({ before, after }));
		// the summary: its moves reorder with the d-pad + confirm (was tap-only)
		await t.page.evaluate(() => { const P = window.__ow.partyMenu; P.summary = true; P.moveCur = null; P.moveSwap = null; });
		await t.tap(BTN.right_d); await t.tap(BTN.right);       // cursor on move 0, arm
		await t.tap(BTN.right_d); await t.tap(BTN.right);       // cursor on move 1, swap
		const moves = await t.page.evaluate(() => window.__ow.party[0].moves.map(m => m.id));
		A(moves[0] === 'icebeam' && moves[1] === 'surf', 'the summary reorders moves with the d-pad and confirm', moves.join(','));
		await t.tap(BTN.bottom); await t.tap(BTN.bottom); await t.tap(BTN.bottom);
		A(!(await t.st()).party, '...and cancel backs all the way out');
	}

	// a Pokémon battle, start to finish on the pad
	{
		await t.page.evaluate(() => window.__ow.startWildBattle({ id: 'magikarp', level: 3 }));
		for (let i = 0; i < 60 && !(await t.page.evaluate(() => window.__ow.battle.active?.phase === 'menu')); i++) { await t.tap(BTN.right); await sleep(100); }
		A(await t.page.evaluate(() => window.__ow.battle.active?.phase === 'menu'), 'a wild battle reaches its menu with confirm presses');
		await t.tap(BTN.right);                                   // FIGHT
		A(await t.page.evaluate(() => window.__ow.battle.active?.phase === 'moves'), 'confirm opens the move list');
		await t.tap(BTN.left);                                    // X on the move list = swap moves (was the 's' key)
		A(await t.page.evaluate(() => window.__ow.battle.active?.swapFrom != null), 'the left face button arms a move swap in battle (was keyboard-only)');
		await t.tap(BTN.left);
		await t.tap(BTN.right);                                   // use the move
		for (let i = 0; i < 120 && await t.page.evaluate(() => !!window.__ow.battle.active); i++) { await t.tap(BTN.right); await sleep(60); }
		A(await t.page.evaluate(() => !window.__ow.battle.active), 'the battle is won and closed with confirm presses alone');
	}

	// the touch HUD steps aside while a pad is in use, and returns without one
	{
		await t.page.evaluate(() => { window.__owFakePads.length = 0; document.body.classList.add('touch'); });
		await sleep(200);
		await t.page.evaluate(() => { window.__owFakePads.push(window.__pad); });
		await sleep(300);
		A(!(await t.page.evaluate(() => document.body.classList.contains('touch'))), 'connecting a pad hides the touch controls');
		await t.page.evaluate(() => { window.__owFakePads.length = 0; });
		await sleep(300);
		A(await t.page.evaluate(() => document.body.classList.contains('touch')), '...and unplugging it brings them back');
		await t.page.evaluate(() => { window.__owFakePads.push(window.__pad); });
		await sleep(200);
	}
	A(t.errors.length === 0, 'no uncaught page error', JSON.stringify(t.errors.slice(0, 2)));
	await t.ctx.close();

	// PokéChess: its own page, same core, same sign-in rule
	{
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.evaluateOnNewDocument((st) => {
			const pad = { id: 'Pro Controller 057e', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [pad]; window.__pad = pad;
			localStorage.setItem('magepunk_mp_token_v1', 'pad-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/pokechess.html`, { waitUntil: 'domcontentloaded' });
		await sleep(2500);
		await page.evaluate(() => { window.__pad.buttons[8] = { pressed: true, value: 1 }; });   // View = leave
		await sleep(1500);
		A(!/pokechess/.test(page.url()), 'PokéChess: View leaves back to the overworld on a signed-in pad', page.url());
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
