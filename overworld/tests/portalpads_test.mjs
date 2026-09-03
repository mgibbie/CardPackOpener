// portalpads_test.mjs — e2e for the flanking inter-region portal pads.
//
// Standalone (needs headless Chrome + puppeteer-core and local overworld/data
// assets); NOT in any run-all. Run: node overworld/tests/portalpads_test.mjs
//
// Asserts:
//  1. each tier-1 gym town (Pewter/Violet/Rustboro) places TWO pads, one on each
//     side of the Pokemon Center door
//  2. the pads carry the two other regions' same-tier towns as destinations
//  3. stepping up to a pad and pressing A twice travels: region flips, the
//     destination town's map loads
//  4. screenshot of Pewter with both pads for the eye
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';




const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const OUT = HERE;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8896;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif' };
const STATE = { username: 'pe2e', friendCode: 'PE2E00', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
// a minimal battle-ready party so the boot skips the new-game region picker
// (the picker opens on !party && !alreadyBegun — see main.js)
const PARTY = [{
	speciesId: 'charmeleon', name: 'CHARMELEON', level: 14, gender: 'M', ability: 'Blaze', types: ['Fire'],
	ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
	stats: { hp: 45, atk: 30, def: 28, spa: 32, spd: 30, spe: 34 },
	maxHP: 45, curHP: 45, exp: 2744, num: 5, sprite: 's160.png',
	moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }],
}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

function startServer() {
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	return new Promise(r => server.listen(PORT, () => r(server)));
}
async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { } await sleep(150); }
	return false;
}

(async () => {
	const server = await startServer();
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });

	const TOWNS = [
		{ map: 'PewterCity', region: 'KANTO' },
		{ map: 'VioletCity', region: 'JOHTO' },
		{ map: 'RustboroCity', region: 'HOENN' },
	];
	for (const town of TOWNS) {
		const page = await browser.newPage();
		await page.setViewport({ width: 720, height: 480, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument((st, party, region) => {
			localStorage.setItem('magepunk_mp_token_v1', 'pe2e-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', region);
		}, STATE, PARTY, town.region.toLowerCase());
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${town.map}`, { waitUntil: 'domcontentloaded' });
		const booted = await waitFor(() => page.evaluate(() => {
			const ow = window.__ow;
			return !!(ow && ow.world?.current?.layout?.width > 0 && ow.player && ow.portals);
		}), 30000);
		A(booted, `${town.map}: booted with portals hook`);
		if (!booted) { await page.close(); continue; }
		await sleep(1200); // portal sheet + tiles settle

		const info = await page.evaluate(() => {
			const ow = window.__ow;
			const map = ow.world.current.map;
			const pc = (map.warp_events || []).find(w => /POKE(?:MON_)?CENTER_1F$/.test(String(w.dest_map || '')));
			return {
				pads: ow.portals.list.map(p => ({ tx: p.tx, ty: p.ty, dests: p.dests.map(d => d.town + '/' + d.region) })),
				door: pc ? { x: +pc.x, y: +pc.y } : null,
			};
		});
		A(info.pads.length === 2, `${town.map}: TWO portal pads placed`, JSON.stringify(info.pads));
		if (info.pads.length === 2 && info.door) {
			const [a, b] = info.pads;
			const flank = (a.tx < info.door.x && b.tx > info.door.x) || (b.tx < info.door.x && a.tx > info.door.x);
			A(flank, `${town.map}: pads flank the Pokemon Center door (door x=${info.door.x})`, JSON.stringify(info.pads.map(p => p.tx)));
		}
		if (info.pads[0]) {
			const dests = info.pads[0].dests;
			A(dests.length === 2 && !dests.join().includes(town.region), `${town.map}: pad offers the two OTHER regions' tier towns`, dests.join(' | '));
		}

		if (town.map === 'PewterCity') {
			// the synthetic save triggers Oak's Pokedex handout dialog on boot —
			// advance it away first (it would swallow every key below)
			for (let i = 0; i < 40; i++) {
				const blocked = await page.evaluate(() => {
					if (window.__ow.dialog.blocking) { window.__ow.dialog.key('z'); return true; }
					return false;
				});
				if (!blocked) break;
				await sleep(250);
			}
			// visual: stand beside the left pad, screenshot both pads
			await page.evaluate(() => {
				const ow = window.__ow;
				const p = ow.portals.list[0];
				ow.player.setTile(p.tx, p.ty + 1);
			});
			await sleep(700);
			await page.screenshot({ path: path.join(HERE, 'portalpads_shot.png') });
			// travel: face the pad and press A, then A again on the first destination
			const before = await page.evaluate(() => window.__ow.world.current.map.id);
			await page.evaluate(() => { window.__ow.player.facing = 'up'; window.__ow.interact(); });
			await sleep(400);
			// select destination 1 via the game's own tap path (headless focus sits on
			// the MP chat input, so synthetic keydowns get swallowed by typingInChat)
			await page.evaluate(() => window.__ow.menuTap('portal:0'));
			const finalMap = await waitFor(async () => {
				const id = await page.evaluate(() => window.__ow.world.current.map.id);
				return id !== before ? id : false;
			}, 20000);
			A(finalMap === 'MAP_VIOLET_CITY', `PewterCity: portal travel landed in Violet City (same-tier Johto)`, 'now=' + finalMap);
			const region = await page.evaluate(() => localStorage.getItem('magepunk_region'));
			A(region === 'johto', `PewterCity: region flipped to johto after travel`, 'region=' + region);
			await sleep(900);
			await page.screenshot({ path: path.join(HERE, 'portalpads_arrived.png') });
		}
		if (town.map === 'PewterCity') {
			// objective wording: at tier 1 with zero badges, the goal must offer all
			// three regions' gym-1 BADGE SHARDS in any order, not railroad to Brock
			const obj = await page.evaluate(() => window.__ow.Quest.objective('KANTO'));
			A(/SHARD/i.test(obj) && /any order/i.test(obj) && /FALKNER/.test(obj) && /ROXANNE/.test(obj),
				'PewterCity: tier-1 objective offers all three regions\' shards in any order', obj);
		}

		if (town.map === 'VioletCity') {
			// cross-region intro safety: a JOHTO starter must find the OTHER regions'
			// new-game scripts pre-armed — Littleroot's truck intro rested, Pallet's
			// escort-Oak + grabbable lab starter balls hidden — or the first portal
			// trip ambushes them with another region's opening
			const armed = await page.evaluate(() => ({
				littleroot: window.__ow.Story.getVar('VAR_LITTLEROOT_INTRO_STATE'),
				pallet: window.__ow.Story.getVar('VAR_MAP_SCENE_PALLET_TOWN_OAK'),
				balls: window.__ow.Story.getFlag('FLAG_HIDE_BULBASAUR_BALL'),
				oakProp: window.__ow.Story.getFlag('FLAG_HIDE_OAK_IN_PALLET_TOWN'),
			}));
			A(armed.littleroot === 4 && armed.pallet === 1 && !!armed.balls && !!armed.oakProp,
				'VioletCity (johto save): foreign regions\' intro scripts are pre-armed', JSON.stringify(armed));
			// and the walk-in probe: a johto starter stepping around Littleroot must
			// not be grabbed by the moving-truck intro (no dialog, no forced warp)
			await page.evaluate(() => window.__ow.moveToMap('LittlerootTown'));
			await sleep(2500);
			for (let i = 0; i < 4; i++) { await page.evaluate(() => window.__ow.pumpPlayer('down', false, 400).catch(() => 0)); await sleep(150); }
			const after = await page.evaluate(() => ({ map: window.__ow.world.current.name, dlg: !!window.__ow.dialog.blocking }));
			A(after.map === 'LittlerootTown' && !after.dlg,
				'VioletCity (johto save): walking into Littleroot fires no intro ambush', JSON.stringify(after));
		}

		const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
		A(fatal.length === 0, `${town.map}: no uncaught errors`, fatal.slice(0, 3).join(' | '));
		await page.close();
	}

	console.log(`\n${pass} passed, ${fail} failed`);
	await browser.close();
	server.close();
	process.exit(fail ? 1 : 0);
})();
