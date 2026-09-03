// inputs_test.mjs — Batch G of the second upscale plan: controls & input.
//
// The single-key shortcuts (S swap, F find, C bike, R re-throw...) were
// undiscoverable and unmovable. The CONTROLS screen (Options) lists every
// one and rebinds them; a custom key TRANSLATES to the action's default at
// the keydown door, so defaults keep working alongside. Reserved keys
// (movement, defaults, system) refuse; conflicts steal cleanly; RESET ALL
// returns to stock. Bindings are a device preference the owner reset spares.
//
//   node overworld/tests/inputs_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- source ----------
{
	const mn = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/const KEY_ACTIONS = \[/.test(mn) && /SWAP MOVE SLOTS/.test(mn) && /RE-THROW BALL/.test(mn) && /FIND \(PC BOX SEARCH\)/.test(mn),
		'the CONTROLS list names every hidden shortcut');
	A(/pressKey\(k\)/.test(mn) && /translateKey\(e\.key\)/.test(mn), 'custom keys translate at the keydown door');
	const rs = fs.readFileSync(path.join(ROOT, 'site/owreset.js'), 'utf8');
	A(/magepunk_keys_v1/.test(rs), 'key bindings are spared by the owner reset (device preference)');
}

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8989;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 12, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 40, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 }, maxHP: 40, curHP: 40,
		exp: 1728, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
	}];
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
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
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'JOHTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		const bind = await page.evaluate(() => {
			const ow = window.__ow;
			const o = {};
			o.bound = ow.assignKeyBind('bag', 'g');
			o.translated = ow.translateKey('g');
			o.saved = JSON.parse(localStorage.getItem('magepunk_keys_v1') || '{}').bag;
			o.reservedDefault = ow.assignKeyBind('bag', 'z');
			o.reservedMove = ow.assignKeyBind('bag', 'ArrowUp');
			o.cancelled = ow.assignKeyBind('bag', 'Escape');
			// a conflict steals the key from the old action
			o.steal = ow.assignKeyBind('party', 'g');
			o.bagFreed = ow.keyBinds.bag === undefined;
			o.partyHasIt = ow.keyBinds.party === 'g';
			o.defStill = ow.translateKey('b'); // the default keeps working untranslated
			return o;
		});
		A(bind.bound === 'bound' && bind.translated === 'b' && bind.saved === 'g', 'G binds to BAG and translates to its default', JSON.stringify(bind));
		A(bind.reservedDefault === 'reserved' && bind.reservedMove === 'reserved', 'defaults and movement keys refuse to be stolen');
		A(bind.cancelled === 'cancelled', 'Escape cancels a capture');
		A(bind.steal === 'bound' && bind.bagFreed && bind.partyHasIt, 'rebinding a taken key steals it cleanly');
		A(bind.defStill === 'b', 'the stock keys always keep working');

		// the REAL keydown path: G now opens the PARTY menu
		await page.keyboard.press('g');
		await new Promise(r => setTimeout(r, 300));
		const opened = await page.evaluate(() => window.__ow.partyMenu.open);
		A(opened === true, 'pressing the custom key drives the real input path');
		await page.keyboard.press('x');
		await new Promise(r => setTimeout(r, 200));

		// the capture flow through the CONTROLS screen itself
		await page.evaluate(() => {
			const ow = window.__ow;
			ow.optionsMenu.open = true; ow.optionsMenu.mode = 'controls'; ow.optionsMenu.idx = 5; // BIKE
			ow.optionsKey('z'); // arm the capture
		});
		await page.keyboard.press('q');
		await new Promise(r => setTimeout(r, 250));
		const captured = await page.evaluate(() => ({
			bike: window.__ow.keyBinds.bike,
			flash: window.__ow.optionsMenu.flash,
			capture: window.__ow.optionsMenu.capture,
		}));
		A(captured.bike === 'q' && captured.capture === null, 'the CONTROLS screen captures a pressed key', JSON.stringify(captured));
		A(/Bound to Q/.test(captured.flash || ''), 'and says so', captured.flash);

		const reset = await page.evaluate(() => {
			const ow = window.__ow;
			ow.optionsMenu.idx = ow.KEY_ACTIONS.length; // RESET ALL
			ow.optionsKey('z');
			ow.drawOptions(480, 320); // the controls list renders
			ow.optionsMenu.mode = 'main'; ow.optionsMenu.open = false;
			return { binds: Object.keys(ow.keyBinds).length, saved: localStorage.getItem('magepunk_keys_v1') };
		});
		A(reset.binds === 0 && reset.saved === '{}', 'RESET ALL returns to stock', JSON.stringify(reset));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
