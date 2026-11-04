// sail_test.mjs — Mr Briney's ferry has to actually deliver you.
//
// Reported: "After 'Anchors aweigh!' the cutscene walks me down the beach and
// just ends - no boat, no warp to Dewford, var stuck at 1. Reproduced twice; a
// reload replays the same stuck cutscene." Hoenn blocked at Dewford/Brawly.
//
// TRACED LIVE, op by op. Two independent faults:
//
//  1. The sail legs are the decomp's BOAT ANIMATION — boat and player hold
//     still while the camera scrolls the ocean past them. The transpile lowered
//     that to literal per-tile walk steps, 194 of them, so the port walks the
//     player physically off the map (observed at y=161) instead of panning.
//     That is the "walks me down the beach", and it is why nothing after it
//     ever ran.
//  2. Route104.json contains no warp op ANYWHERE, so the outbound chain can
//     never change maps. Its arrival script stages LOCALID_DEWFORD_BRINEY and
//     clears FLAG_HIDE_MR_BRINEY_DEWFORD_TOWN while still standing on Route 104.
//     The other three legs do carry a correct warp, so they were only slow.
//
// NOT the cause, though a real observation: LOCALID_ROUTE104_BOAT is in the map
// data with its hide flag clear and missing from the live NPC list, because
// npcs.js skips OBJ_EVENT_GFX_MR_BRINEYS_BOAT as a prop. It has no sprite in
// gfx_map.json, so unfiltering it would draw a generic man on the water — and a
// missing actor's move is SKIPPED by the interpreter, not stalled. The boat's
// absence costs the visual only, which is why the filter is left alone.
//
//   node overworld/tests/sail_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SAIL_LABELS } from '../sail_fix.js';
import { overworldSource } from './owsource.mjs';   // main.js + the modules split out of it

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const OW = path.join(ROOT, 'overworld');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- data: what the patch does to the scripts ----------
{
	const { applySailFix } = await import('../sail_fix.js');
	let legs = 0, oceanLeft = 0, boardingKept = 0, arrivals = 0;
	const longElsewhere = [];
	for (const f of fs.readdirSync(path.join(OW, 'data/scripts'))) {
		let s;
		try { s = JSON.parse(fs.readFileSync(path.join(OW, 'data/scripts', f), 'utf8')); } catch (e) { continue; }
		const patched = applySailFix(JSON.parse(JSON.stringify(s)));
		for (const [label, ops] of Object.entries(patched)) {
			if (!Array.isArray(ops)) continue;
			if (SAIL_LABELS.has(label)) {
				legs++;
				for (const o of ops) {
					if (o.op === 'move' && (o.steps || []).length >= 90) oceanLeft++;
					if (o.op === 'move' && (o.steps || []).length > 0 && o.steps.length < 90) boardingKept++;
					if (o.op === 'warpxy') arrivals++;
				}
			} else {
				// nothing outside the sail set may be touched
				for (const o of ops) if (o.op === 'move' && (o.steps || []).length >= 40) longElsewhere.push(`${label}:${o.steps.length}`);
			}
		}
	}
	A(legs >= 8, 'every sail leg is patched, in both Hoenn copies', String(legs) + ' legs');
	A(oceanLeft === 0, 'no ocean-crossing walk survives the patch', oceanLeft + ' left');
	A(boardingKept > 0, 'the short boarding walks are kept', boardingKept + ' kept');
	A(arrivals >= 2, 'the outbound leg gains the arrival it never had', arrivals + ' warpxy');
	A(longElsewhere.length > 0,
		"legitimate long walks elsewhere are untouched (Steven's escort, a Battle Dome entrance)",
		longElsewhere.slice(0, 3).join(' '));

	// the op and its bridge must both exist, or warpxy is a silent no-op
	const ev = fs.readFileSync(path.join(OW, 'events.js'), 'utf8');
	const mn = overworldSource();
	A(/case 'warpxy'/.test(ev), 'events.js understands a coordinate warp');
	A(/warpXy: \(mapId, x, y\) => flyTo\(mapId, x, y\)/.test(mn), 'and main.js bridges it to flyTo');
	A(/applySailFix\(\{ \.\.\.sharedScripts/.test(mn), 'the patch is applied where a map loads its scripts');
}

// ---------- live: sail it ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8993;
	const STATE = { username: 'sail', friendCode: 'SAIL00', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let raw = ''; for await (const c of req) raw += c;
			let b = {}; try { b = JSON.parse(raw); } catch (e) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
			if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
			return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [] }));
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));
	const sleep = ms => new Promise(r => setTimeout(r, ms));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'sail-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'HOENN');
			if (!localStorage.getItem('magepunk_story'))
				localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{
				speciesId: 'mudkip', name: 'MUDKIP', level: 20, gender: 'M', friend: 70, types: ['Water'],
				ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
				stats: { hp: 60, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 60, curHP: 60,
				exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's258.png', num: 258,
			}]));
		}, STATE);
		const boot = async map => {
			await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
			const t0 = Date.now();
			while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200);
			await sleep(1400);
		};

		await boot('Route104');
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		// board: arm the sail exactly as Briney's house does, then take a step so
		// the map's onFrame trigger evaluates
		await page.evaluate(() => {
			const W = window.__ow;
			W.Story.setVar('VAR_BOARD_BRINEY_BOAT_STATE', 1);
			W.player.tx = 13; W.player.ty = 50; W.player.px = 13 * 16; W.player.py = 50 * 16;
		});
		// onFrame is evaluated from the step loop, so keep stepping until it fires
		// rather than pumping once and hoping — a single pump is racy.
		let started = false;
		for (let i = 0; i < 25 && !started; i++) {
			await page.evaluate(() => { try { window.__ow.pumpPlayer(Math.random() < 0.5 ? 'up' : 'down', 0.4); } catch (e) {} });
			await sleep(200);
			started = await page.evaluate(() => !!window.__ow.cutscene.blocking);
		}
		A(started, 'the sail cutscene starts');

		// Sail. 24s is generous and still cannot pass by accident: the unfixed leg
		// walks 194 tiles (~42s) and never warps at all, however long you wait.
		let arrived = null;
		for (let i = 0; i < 300 && !arrived; i++) {
			await page.evaluate(() => { try { window.__ow.dialog.key('z'); } catch (e) {} });
			await sleep(80);
			const st = await page.evaluate(() => ({
				m: window.__ow.world.current.name,
				blocking: !!window.__ow.cutscene.blocking,
				v: window.__ow.Story.getVar('VAR_BOARD_BRINEY_BOAT_STATE'),
			}));
			if (st.m !== 'Route104') { arrived = { map: st.m, ticks: i }; break; }
			// onFrame is edge-triggered off the step loop, so a scene that never
			// started (or was released without arriving) needs another step to
			// re-arm. Re-pump rather than burning the budget waiting on nothing.
			if (!st.blocking && st.v === 1 && i % 8 === 7) {
				await page.evaluate(() => { try { window.__ow.pumpPlayer('down', 0.4); } catch (e) {} });
			}
		}
		A(!!arrived, 'the ferry arrives somewhere other than Route 104', JSON.stringify(arrived));
		A(arrived && arrived.map === 'DewfordTown', 'and that somewhere is Dewford Town', JSON.stringify(arrived));

		// The map NAME flips the moment world.load resolves, but player.setTile and
		// the NPC rebuild land after it. Sampling on the name alone read Route 104
		// coordinates on a half-built Dewford — a flake in this test, not the game.
		// Wait for the arrival to actually finish before looking at it.
		for (let i = 0; i < 60; i++) {
			const ready = await page.evaluate(() => (window.__ow.npcs?.list || []).length > 0);
			if (ready) break;
			await sleep(100);
		}
		await sleep(300);

		const end = await page.evaluate(() => ({
			map: window.__ow.world.current.name,
			pos: [window.__ow.player.tx, window.__ow.player.ty],
			v: window.__ow.Story.getVar('VAR_BOARD_BRINEY_BOAT_STATE'),
			blocking: !!window.__ow.cutscene.blocking,
			briney: (window.__ow.npcs?.list || []).some(n => (n.ev.local_id || '') === 'LOCALID_DEWFORD_BRINEY'),
			// this one starts UNSET, so asserting it is set proves the arrival ran —
			// unlike the Dewford hide flag, which is already false before we sail and
			// would therefore pass against the broken version too
			leftRoute104: !!window.__ow.Story.getFlag('FLAG_HIDE_ROUTE_104_MR_BRINEY_BOAT'),
		}));
		A(end.v === 0, 'the boat-state var is cleared, not stuck at 1', 'var=' + end.v);
		A(end.blocking === false, 'the player has control back', JSON.stringify(end));
		A(end.leftRoute104 === true, 'the arrival ran: the Route 104 boat is packed away', JSON.stringify(end));
		A(end.briney === true, 'and Briney is standing on the Dewford dock', JSON.stringify(end));
		A(end.pos[1] <= 20, 'the player landed on the map, not 100 tiles off it', JSON.stringify(end.pos));
		A(errors.length === 0, 'no uncaught page error during the crossing', JSON.stringify(errors.slice(0, 2)));
	} finally {
		if (browser) await browser.close();
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
