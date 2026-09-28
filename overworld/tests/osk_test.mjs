// osk_test.mjs — the on-screen keyboard replaces prompt() (Plans/CONTROLLER_SUPPORT_PLAN.md, Phase 2).
//
// prompt() can't be reached with a controller, blocks the page, and looks like the
// browser. askText() (site/osk.js) keeps its contract (the text, or null on cancel)
// and is driven three ways: typing into its field, tapping its keys, or — for a
// signed-in player — a controller (Nintendo layout: right = press key, bottom =
// delete, Start = OK). While it is up, the game ignores every key and button.
//
//   node overworld/tests/osk_test.mjs
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
const PORT = 9142;
const STATE = { username: 'oskplayer', friendCode: 'OSKPL0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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

const BTN = { bottom: 0, right: 1, left: 2, top: 3, start: 9, up: 12, down: 13, left_d: 14, right_d: 15 };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	let dialogs = 0; page.on('dialog', d => { dialogs++; d.dismiss(); });   // a native prompt() must never appear
	await page.evaluateOnNewDocument((st, lead) => {
		const pad = { id: 'Pro Controller 057e', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
		window.__owFakePads = [pad]; window.__pad = pad;
		if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
		localStorage.setItem('magepunk_mp_token_v1', 'osk-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_party_v1', JSON.stringify([lead]));
		localStorage.setItem('magepunk_repel_v1', '99999');
	}, STATE, LEAD);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown&x=10&y=12`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 200 && !(await page.evaluate(() => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data)).catch(() => false)); i++) await sleep(200);
	await sleep(1500);
	const tap = async b => { await page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, b); await sleep(70); await page.evaluate(b => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, b); await sleep(90); };
	const oskUp = () => page.evaluate(() => !!document.querySelector('#osk'));
	const leadName = () => page.evaluate(() => window.__ow.party[0].name);
	const fieldVal = () => page.evaluate(() => document.querySelector('#osk input')?.value ?? null);
	// the nickname offer after a catch: Z = yes -> the keyboard opens on the current name
	const openRename = async () => {
		await page.evaluate(() => window.__ow.offerNickname(window.__ow.party[0]));
		await sleep(200);
		await page.evaluate(() => { window.__ow.dialog.revealed = 1e9; });
		for (let i = 0; i < 20 && !(await oskUp()); i++) {
			// one Z per dialog page ("Give a nickname…?" then "Z = Yes"), then the keyboard opens
			if (await page.evaluate(() => window.__ow.dialog.blocking)) await page.keyboard.press('z');
			await sleep(150);
		}
	};

	// ===== typing: the field is a real input =====
	await openRename();
	A(await oskUp(), 'accepting a nickname opens the on-screen keyboard, not a browser prompt');
	A(await fieldVal() === 'LAPRAS', '...pre-filled with the current name');
	A(await page.evaluate(() => document.activeElement === document.querySelector('#osk input')), '...with the field focused for typing');
	await page.evaluate(() => document.querySelector('#osk input').select());
	await page.keyboard.type('Nessie');
	await page.keyboard.press('Enter');
	await sleep(200);
	A(!(await oskUp()) && await leadName() === 'Nessie', 'typing a name and pressing Enter renames the POKéMON', await leadName());

	// ===== Escape cancels, exactly like a cancelled prompt =====
	await openRename();
	await page.keyboard.type('XYZ');
	await page.keyboard.press('Escape');
	await sleep(200);
	A(!(await oskUp()) && await leadName() === 'Nessie', 'Escape cancels and leaves the name unchanged');

	// ===== tapping the on-screen keys =====
	await openRename();
	await page.evaluate(() => { const f = document.querySelector('#osk input'); f.value = ''; f.dispatchEvent(new Event('input')); });
	for (const k of ['B', 'O', 'B']) await page.click(`#osk button[data-k="${k}"]`);
	A(await page.evaluate(() => document.activeElement === document.querySelector('#osk input')), 'tapping keys keeps focus in the field (the game never gets the keys)');
	await page.click('#osk button[data-k="OK"]');
	await sleep(200);
	A(await leadName() === 'BOB', 'tapping keys and OK spells a name', await leadName());

	// ===== the controller, while the game stands aside =====
	await openRename();
	const startBefore = await page.evaluate(() => window.__ow.startMenu.open);
	for (let i = 0; i < 3; i++) await tap(BTN.bottom);            // cancel = delete; 'BOB' -> ''
	A(await fieldVal() === '', 'the bottom button deletes, one character a press', JSON.stringify(await fieldVal()));
	await tap(BTN.right);                                          // focus starts on Q: press it
	await tap(BTN.right_d); await tap(BTN.right);                  // W
	await tap(BTN.down); await tap(BTN.right);                     // down a row, same column: S
	await tap(BTN.top);                                            // top face = space
	A(await fieldVal() === 'QWS ', 'the d-pad moves over the keys and the RIGHT button presses them', JSON.stringify(await fieldVal()));
	await tap(BTN.start);                                          // Start = OK
	await sleep(200);
	A(!(await oskUp()) && await leadName() === 'QWS', 'Start submits (the rename trims the trailing space)', await leadName());
	A(await page.evaluate(() => window.__ow.startMenu.open) === startBefore, '...and Start did NOT also open the start menu behind it');
	// with the keyboard up, game keys do nothing
	await openRename();
	await page.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
	A(await page.evaluate(() => !window.__ow.startMenu.open), 'with the keyboard up, the game ignores its keys');
	for (let i = 0; i < 4; i++) await tap(BTN.bottom);            // delete 'QWS', then an empty field closes it
	await sleep(150);
	A(!(await oskUp()) && await leadName() === 'QWS', 'cancel on an empty field closes it without renaming');

	// ===== askText's other shapes: a 6-letter friend code =====
	const code = await page.evaluate(async () => {
		const { askText } = await import('/site/osk.js');
		const p = askText({ title: 'code', maxLength: 6, charset: 'code' });
		await new Promise(r => setTimeout(r, 50));
		const f = document.querySelector('#osk input');
		f.value = 'ABCDEFGHI'.slice(0, f.maxLength);
		f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		return { v: await p, max: f.maxLength };
	});
	A(code.v === 'ABCDEF' && code.max === 6, 'a friend-code keyboard caps at 6 characters', JSON.stringify(code));

	// ===== no native prompt() is left in the game's text entry =====
	const src = ['overworld/ow_screens.js', 'overworld/ow_menukeys.js', 'battlecards/deck.js', 'battlecards/replays.js']
		.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
	const asks = [...src.matchAll(/(?<![\w.])prompt\(\s*'([^']*)'/g)].map(m => m[1]).filter(t => !/^Copy/.test(t));
	A(asks.length === 0, 'every text-entry prompt() is now askText (only clipboard "Copy" fallbacks remain)', asks.join(' | '));
	A(dialogs === 0, 'no native dialog appeared during any of it', String(dialogs));
	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 2)));
	await ctx.close();
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
