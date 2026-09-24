// pollcadence_test.mjs — an idle overworld tab stays cheap on the backend.
//
// Every /api/mp call is a Cloudflare function request, and the free plan allows
// 100,000 a day. Presence polled every ~1.4s and challenges every 2s regardless:
// ~4,000 requests an hour per open tab. On 2026-09-24 the account hit 129,952 by
// 19:30 UTC (and 140k / 125k the two days before), Cloudflare stopped running the
// function, and every login/save/multiplayer call answered 405 until midnight.
//
// A mock backend counts calls while one tab sits still, in each situation:
//   alone                -> presence ~30s, challenges ~10s
//   a friend online elsewhere -> presence ~10s
//   a friend ON THIS MAP -> presence stays fast (the ghost must walk smoothly)
//   tab hidden           -> nothing at all
//   backend failing      -> backs off instead of hammering
//
//   node overworld/tests/pollcadence_test.mjs
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
const PORT = 9123;
const STATE = { username: 'polls', friendCode: 'POLLS0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
// what the mock says about the one friend: null (none online), 'elsewhere', 'here'
let friendMode = null, failing = false;
const counts = {};
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw); } catch (e) {}
		counts[b.action] = (counts[b.action] || 0) + 1;
		if (failing && (b.action === 'friends' || b.action === 'challenges')) { res.writeHead(405); return res.end(); }
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'friends') {
			const friends = friendMode ? [{ username: 'pal', online: true, map: friendMode === 'here' ? 'Route101' : 'Route103', x: 10, y: 10, facing: 'down', status: 'roaming' }] : [];
			return res.end(JSON.stringify({ friends }));
		}
		if (b.action === 'challenges') return res.end(JSON.stringify({ challenges: [] }));
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [], rows: [] }));
	}
	fs.readFile(path.join(ROOT, u === '/' ? '/index.html' : u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(u)] || 'application/octet-stream' });
		res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reset = () => { for (const k of Object.keys(counts)) delete counts[k]; };
const read = () => ({ friends: counts.friends || 0, challenges: counts.challenges || 0, heartbeat: counts.heartbeat || 0,
	all: Object.values(counts).reduce((a, b) => a + b, 0) });
const window_ = async ms => { reset(); await sleep(ms); return read(); };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(st => {
		localStorage.setItem('magepunk_mp_token_v1', 'polls-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'mudkip', name: 'MUDKIP', level: 20, gender: 'M', friend: 70, types: ['Water'], ability: 'torrent', ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 60, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 60, curHP: 60, exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's258.png', num: 258 }]));
		// a controllable visibility, so the test can "hide" the tab
		window.__hidden = false;
		Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return window.__hidden; } });
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route101&x=10&y=12`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 200 && !(await page.evaluate(() => !!window.__ow?.world?.current?.layout).catch(() => false)); i++) await sleep(200);
	await sleep(3000);

	// the old cadence for reference, 60s alone: overworld presence ~43 + challenges ~30,
	// plus the site top bar's 4 calls every 12s (~20) = ~93 calls a minute
	const alone = await window_(60000);
	A(alone.friends <= 3 && alone.challenges <= 9, 'alone: presence ~30s, challenges ~10s (+ the top bar every 30s)', JSON.stringify(alone));
	A(alone.all <= 25, `a whole idle minute costs a couple of dozen calls at most, not ~90 (${alone.all})`, JSON.stringify(counts));

	friendMode = 'elsewhere';
	await window_(12000);   // let the cadence notice the friend
	const elsewhere = await window_(20000);
	A(elsewhere.friends >= 1 && elsewhere.friends <= 3, 'a friend online elsewhere: presence ~10s', JSON.stringify(elsewhere));

	friendMode = 'here';
	await window_(12000);
	const here = await window_(6000);
	A(here.friends >= 8, 'a friend on THIS map: presence stays fast so their ghost walks smoothly', JSON.stringify(here));

	friendMode = null;
	await page.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
	await sleep(3000);
	const hidden = await window_(40000);
	A(hidden.all === 0, 'a hidden tab makes no calls at all (overworld and top bar)', JSON.stringify(counts));
	reset();   // BEFORE showing: the catch-up calls go out at once
	await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
	await sleep(1500);
	const shown = read();
	A(shown.friends >= 1 && shown.challenges >= 1, 'coming back into view catches up at once', JSON.stringify(shown));

	failing = true;
	await window_(15000);
	const failingW = await window_(40000);
	A(failingW.challenges <= 6, 'a failing backend is backed off, not hammered (was ~20 challenge calls in 40s)', JSON.stringify(failingW));
	failing = false;

	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 2)));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
