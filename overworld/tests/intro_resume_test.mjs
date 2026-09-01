// intro_resume_test.mjs — the opening is asked ONCE, and survives a reload.
//
// Fork B hands over no POKeMON until you reach the professor's lab, so the whole
// stretch between choosing a region and picking a starter is PARTYLESS. The boot
// hook opened the region picker on `!party` alone, which is not the same question:
// it re-asked on every load in that window. Answering it a second time rewrote
// `magepunk_region` and warped the player to another region's home town while the
// first region's story seed stayed put — so the lab then offered THAT region's
// starters. Hence "starters offered multiple times".
//
// intro_test covers the happy path up to the rival challenge. This covers the part
// it does not: what a RELOAD does at each stage, and that the starter is offered
// exactly once across a whole playthrough.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/intro_resume_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const puppeteer = (await import('puppeteer-core')).default;
const http = await import('http');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8937;
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req) {} res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
		res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push(e.message));
	// token ONLY, and only if absent — evaluateOnNewDocument re-runs on every
	// navigation, so clearing the save here would make each reload look like a
	// fresh game and quietly fake the very bug under test
	await page.evaluateOnNewDocument((st) => {
		if (!localStorage.getItem('magepunk_mp_token_v1')) {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		}
	}, STATE);

	const waitBoot = async () => {
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		// count every closed->open transition of the STARTER phase, across reloads
		await page.evaluate(() => {
			const ow = window.__ow;
			window.__pickOffers = +(sessionStorage.getItem('pickOffers') || 0);
			let was = false;
			setInterval(() => {
				const now = !!ow.starterMenu.open && ow.starterMenu.phase === 'pick';
				if (now && !was) { window.__pickOffers++; sessionStorage.setItem('pickOffers', String(window.__pickOffers)); }
				was = now;
			}, 25);
		});
	};
	const snap = () => page.evaluate(() => ({
		open: !!window.__ow.starterMenu.open, phase: window.__ow.starterMenu.phase,
		party: (window.__ow.party || []).length, map: window.__ow.world.current?.name,
		region: localStorage.getItem('magepunk_region'),
		offers: +(sessionStorage.getItem('pickOffers') || 0),
	}));
	const press = async (k) => { await page.keyboard.press(k === 'z' ? 'KeyZ' : k); await new Promise(r => setTimeout(r, 280)); };
	const settle = (ms = 1400) => new Promise(r => setTimeout(r, ms));

	// ---------- a genuinely fresh save ----------
	await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' });
	await waitBoot();
	await page.evaluate(() => {
		for (const k of ['magepunk_party_v1', 'magepunk_region', 'magepunk_story', 'magepunk_pos_v1',
			'magepunk_starter', 'magepunk_rival', 'magepunk_plot_fired']) localStorage.removeItem(k);
		sessionStorage.removeItem('pickOffers');
	});
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitBoot();

	let s = await snap();
	A(s.open && s.phase === 'region', 'a fresh save asks which REGION to begin in', JSON.stringify(s));
	A(s.party === 0, '...and hands over no POKeMON yet (Fork B)', JSON.stringify(s));

	await press('ArrowDown');   // KANTO -> JOHTO
	await press('z');
	await settle();
	s = await snap();
	A(!s.open && s.region === 'JOHTO' && s.map === 'NewBarkTown',
		'choosing JOHTO closes the prompt and drops you in New Bark Town', JSON.stringify(s));
	A(s.party === 0, '...still with no POKeMON — the starter comes at the lab', JSON.stringify(s));

	// ---------- THE BUG: reload while partyless ----------
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitBoot();
	await settle(900);
	s = await snap();
	A(!(s.open && s.phase === 'region'),
		'reloading before the lab does NOT ask for a region again', JSON.stringify(s));
	A(s.region === 'JOHTO', '...and the region you chose is still the one you get', JSON.stringify(s));

	// ---------- on to the lab ----------
	await page.evaluate(() => window.__ow.moveToMap(window.__ow.NEW_GAME_INTRO[localStorage.getItem('magepunk_region')].lab));
	await settle();
	// clear the professor's greeting
	// Each page needs TWO presses (the first completes the typewriter, the second
	// advances), and the narration + greeting paginate to well over six pages, so a
	// small budget silently leaves the cutscene mid-dialog and looks like the
	// trigger never fired.
	for (let i = 0; i < 40; i++) { await press('z'); if ((await snap()).phase === 'pick') break; }
	s = await snap();
	A(s.open && s.phase === 'pick', 'walking into the lab offers the starter', JSON.stringify(s));
	A(s.offers === 1, '...for the FIRST time', JSON.stringify(s));

	await press('ArrowRight');
	await press('z');
	await settle();
	s = await snap();
	A(s.party === 1, 'choosing one creates the party', JSON.stringify(s));
	const species = await page.evaluate(() => window.__ow.party[0].speciesId);
	A(['chikorita', 'cyndaquil', 'totodile'].includes(species), `...from JOHTO's own trio (${species})`, species);

	// ---------- reload again, now WITH a party ----------
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitBoot();
	await settle(900);
	s = await snap();
	A(!s.open, 'reloading after the pick asks nothing at all', JSON.stringify(s));
	A(s.party === 1, '...and the starter is still yours', JSON.stringify(s));

	// ---------- re-enter the lab ----------
	await page.evaluate(() => window.__ow.moveToMap(window.__ow.NEW_GAME_INTRO[localStorage.getItem('magepunk_region')].lab));
	await settle();
	s = await snap();
	A(s.offers === 1, 'across the whole run the starter was offered EXACTLY ONCE', JSON.stringify(s));

	A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message);
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
