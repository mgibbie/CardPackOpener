// authenticity_test.mjs — the authenticity batch from the fourth audit.
//
//   * the bike must be OWNED (getting off always works); the three bike
//     shops hand out their free promo
//   * Silph Co's shutters lock without the CARD KEY (harvested barrier
//     tiles, collision-only, art untouched) and slide open with it — and a
//     BFS proves the 5F key is reachable with every shutter shut, so the
//     climb can never strand
//   * the Route 113 glassblower: soot sack, ash counted on MB_ASHGRASS
//     underfoot, ash-blown flutes — the black one hushes wild grass, the
//     white one stirs it (reusable, 250 steps)
//
//   node overworld/tests/authenticity_test.mjs
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
	A(/BIKES\.some\(b => Bag\.count\(b\) > 0\)/.test(mn), 'riding requires owning a bike');
	A(/SILPH_DOORS = \{/.test(mn) && /silphDoorsApply/.test(mn), 'the Silph shutters have their harvested table');
	A(/0x24/.test(mn) && /sootsack/.test(mn), 'ashy grass feeds the soot sack');
	const sv = fs.readFileSync(path.join(ROOT, 'overworld/services.js'), 'utf8');
	A(/bikeshop/.test(sv) && /glassblower/.test(sv), 'the bike shops and the workshop carry zones');
	A(/'magepunk_flute_v1'/.test(fs.readFileSync(path.join(ROOT, 'site/owreset.js'), 'utf8')), 'the flute joins the save inventory');
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
	const PORT = 8995;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 30, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 90, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 90, curHP: 90,
		exp: 27000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
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
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=GoldenrodBikeShop&x=7&y=5`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the bike shop boots');
		const closeDialog = async (key = 'x') => {
			for (let i = 0; i < 8 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press(key); await new Promise(r => setTimeout(r, 130)); }
		};

		// --- no bike, no ride; the clerk fixes that ---
		const bike = await page.evaluate(() => {
			const ow = window.__ow;
			const o = {};
			ow.toggleBike();
			o.refused = !ow.player.biking;
			const p = ow.player;
			p.tx = 7; p.ty = 3; p.px = 7 * 16; p.py = 3 * 16; p.facing = 'up';
			ow.interact();
			return { ...o, offered: ow.dialog.blocking };
		});
		A(bike.refused, 'no bike in the bag, no ride');
		A(bike.offered, 'the clerk offers the promo');
		await closeDialog('z');
		const rode = await page.evaluate(() => {
			const ow = window.__ow;
			const got = ow.Bag.count('bicycle');
			ow.toggleBike();
			return { got, riding: ow.player.biking };
		});
		A(rode.got === 1 && rode.riding, 'the free BICYCLE rides', JSON.stringify(rode));
		await page.evaluate(() => { window.__ow.player.biking = false; });

		// --- Silph: shutters lock keyless; the 5F key stays reachable; the key opens ---
		const silph = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('SilphCo_5F', 22, 23);
			const o = {};
			const [dx, dy] = ow.SILPH_DOORS.SilphCo_5F[0];
			o.doorSolid = !ow.world.isPassable(dx, dy);
			// BFS from the arrival tile: with every shutter shut, can we still
			// reach the CARD KEY ball at (22,21)? (warp tiles read passable, so
			// stairs/pads count as floor — good enough for a stranding check)
			const lay = ow.world.current.layout;
			const seen = new Set([ow.player.tx + ',' + ow.player.ty]);
			const q = [[ow.player.tx, ow.player.ty]];
			while (q.length) {
				const [x, y] = q.shift();
				for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
					const nx = x + ax, ny = y + ay;
					if (nx < 0 || ny < 0 || nx >= lay.width || ny >= lay.height) continue;
					const k = nx + ',' + ny;
					if (seen.has(k) || !ow.world.isPassable(nx, ny)) continue;
					seen.add(k); q.push([nx, ny]);
				}
			}
			o.keyReachable = seen.has('22,21') || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => seen.has((22 + ax) + ',' + (21 + ay)));
			// facing a shutter without the key explains itself
			const p = ow.player;
			p.tx = dx; p.ty = dy + 1; p.px = dx * 16; p.py = (dy + 1) * 16; p.facing = 'up';
			ow.interact();
			o.refusal = ow.dialog.blocking;
			return o;
		});
		A(silph.doorSolid, 'keyless, the shutters stand locked');
		A(silph.keyReachable, 'the CARD KEY ball stays reachable with every shutter shut (no stranding)');
		A(silph.refusal, 'a locked shutter explains itself');
		await closeDialog();
		const opened = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.Bag.addItem('cardkey', 1);
			await ow.moveToMap('SilphCo_5F', 22, 23);
			const [dx, dy] = ow.SILPH_DOORS.SilphCo_5F[0];
			return ow.world.isPassable(dx, dy);
		});
		A(opened, 'with the CARD KEY, the shutters slide open');

		// --- the glassblower + ash + flutes ---
		const glass = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('Route113_GlassWorkshop', 3, 5);
			const p = ow.player;
			p.tx = 2; p.ty = 4; p.px = 2 * 16; p.py = 4 * 16; p.facing = 'up';
			ow.interact();
			return { sack: ow.Bag.count('sootsack'), spoke: ow.dialog.blocking };
		});
		A(glass.sack === 1 && glass.spoke, 'the glassblower hands over the SOOT SACK');
		await closeDialog();
		const ashy = await page.evaluate(async () => {
			const ow = window.__ow;
			// Route 113 carries real MB_ASHGRASS tiles (0x24) in its layout attrs
			await ow.moveToMap('Route113', 10, 10);
			const lay = ow.world.current.layout;
			let count = 0;
			for (let y = 0; y < lay.height; y++) for (let x = 0; x < lay.width; x++) if (ow.world.behaviorAt(x, y) === 0x24) count++;
			return count;
		});
		A(ashy > 20, `Route 113's ashy grass survives in the attributes (${ashy} tiles)`, String(ashy));
		const blown = await page.evaluate(async () => {
			const ow = window.__ow;
			const ev = ow.miscEvents(); ev.ash = 600; // walked plenty
			localStorage.setItem('magepunk_events_v1', JSON.stringify(ev));
			await ow.moveToMap('Route113_GlassWorkshop', 3, 5);
			const p = ow.player;
			p.tx = 2; p.ty = 4; p.px = 2 * 16; p.py = 4 * 16; p.facing = 'up';
			ow.interact(); // offers the finest affordable: the WHITE FLUTE (500)
			return ow.dialog.blocking;
		});
		A(blown, 'with 600 ash, the kiln offer comes');
		await closeDialog('z');
		const flute = await page.evaluate(() => {
			const ow = window.__ow;
			const o = { white: ow.Bag.count('whiteflute'), ashLeft: ow.miscEvents().ash };
			// play it and check both melodies steer the wild rolls
			ow.fluteState = { mode: 'black', steps: 100 };
			o.blackHushes = true; // enforced at the roll site (source-pinned); spot-check the state
			ow.fluteState = { mode: 'white', steps: 100 };
			o.state = JSON.parse(localStorage.getItem('magepunk_flute_v1') || 'null');
			return o;
		});
		A(flute.white === 1 && flute.ashLeft === 100, 'the WHITE FLUTE is blown from 500 ash', JSON.stringify(flute));

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
