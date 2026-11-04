// cablecar_test.mjs — the Mt. Chimney CABLE CAR rides, both ways, with real keys.
//
// Playtest (instinctloretest0918, 2026-09-30 and 2026-10-01): at the Route 112
// station, "Yes" walked you aboard and then nothing — the ride script calls
// `special CableCarWarp` + `special CableCar`, and neither had a handler, so the
// script ended with you standing in the lower station at (6,4).
//   1. "No": you stay put and can walk away
//   2. lower station "Yes": ride UP, step off the car, walk out onto Mt. Chimney
//   3. upper station "Yes": ride DOWN, step off, walk out onto Route 112
//   4. arrival resets VAR_CABLE_CAR_STATION_STATE; no stuck dialog / scene / fade / repeat warp
//   5. a second full round trip
//   6. direction: VAR_0x8004 FALSE / 0 -> up, TRUE / 1 -> down (never JS truthiness)
//   7. the push lands on the server, and a FRESH device reads back the right
//      station, the six-POKeMON party and the story state
//
//   node overworld/tests/cablecar_test.mjs
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
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9183;
const LOWER = 'Route112_CableCarStation', UPPER = 'MtChimney_CableCarStation';
const STATE = { username: 'cablecar', friendCode: 'CABLE1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (s, n) => ({
	speciesId: s, name: s.toUpperCase(), level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: n,
});
const PARTY = [mon('bulbasaur', 1), mon('charmander', 4), mon('squirtle', 7), mon('pikachu', 25), mon('eevee', 133), mon('snorlax', 143)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---- mock server: real ow-save / ow-load semantics (store, then read back) ----
const DB = new Map();
let pushes = 0;
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		const key = 'ow:' + STATE.username;
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: DB.get(key) || null }));
		if (b.action === 'ow-save') { DB.set(key, { ow: b.ow, updated_at: Date.now() }); pushes++; return res.end(JSON.stringify({ ok: true })); }
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const W = f => page.evaluate(f);
	const where = () => W(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
	const boot = async m => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && (!m || window.__ow.world.current.name === m)), m).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const stateVar = () => W(async () => (await import('./events.js')).getVar('VAR_CABLE_CAR_STATION_STATE'));
	// talk / answer / drive in the page: Z through dialog, the yes/no box answered
	// with `answer` (z = yes, x = no), until nothing is running for ~half a second
	const drive = answer => page.evaluate(async answer => {
		const O = window.__ow;
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const t0 = Date.now(); let calm = 0, asked = false;
		while (Date.now() - t0 < 25000) {
			const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
			if (!d && !c && f.alpha < 0.001 && f.target < 0.001) { if (++calm >= 12) return { ok: true, asked }; } else calm = 0;
			if (d) {
				const txt = JSON.stringify(O.dialog.pages || '');
				if (/Z = Yes/.test(txt)) { asked = true; press(answer); } else press('z');
			}
			await new Promise(r => setTimeout(r, 50));
		}
		return { ok: false, asked };
	}, answer);
	const key = async k => { await page.keyboard.press(k); await sleep(80); };
	const walkUntil = async (k, cond, ms = 4000) => {
		const t0 = Date.now();
		await page.keyboard.down(k);
		while (Date.now() - t0 < ms && !(await cond())) await sleep(40);
		await page.keyboard.up(k);
		await sleep(250);
		return cond();
	};
	// stand below the attendant, face them, talk
	const talkToAttendant = async answer => {
		const p = await where();
		if (p.x !== 6) await walkUntil(p.x > 6 ? 'ArrowLeft' : 'ArrowRight', async () => (await where()).x === 6);
		await walkUntil('ArrowUp', async () => (await where()).y <= 7);
		await key('ArrowUp');   // face the attendant
		await key('z');
		return drive(answer);
	};
	const idle = () => W(() => ({ dialog: !!window.__ow.dialog.blocking, cutscene: !!window.__ow.cutscene.blocking, fade: (window.__ow.fade || {}).alpha || 0 }));
	// one ride from the station we're in; then walk out of the arrival station
	const ride = async (from, to, outside, label) => {
		const r = await talkToAttendant('z');
		A(r.ok && r.asked, `${label}: the attendant asks, "Yes" is accepted`, JSON.stringify(r));
		const arrived = await where();
		A(arrived.map === to, `${label}: the cable car TRAVELS — you arrive at ${to}`, JSON.stringify(arrived));
		A(arrived.x === 6 && arrived.y === 7, `${label}: ...and the arrival scene walks you off the car (6,4) -> (6,7)`, JSON.stringify(arrived));
		A(await stateVar() === 0, `${label}: VAR_CABLE_CAR_STATION_STATE is reset to 0 on arrival`, String(await stateVar()));
		const id = await idle();
		A(!id.dialog && !id.cutscene && id.fade === 0, `${label}: no dialog, scene or fade left over`, JSON.stringify(id));
		await sleep(600);
		A((await where()).map === to, `${label}: no repeat warp after arriving`, JSON.stringify(await where()));
		// walk out the door, normally
		const out = await walkUntil('ArrowDown', async () => (await where()).map === outside, 5000);
		A(out, `${label}: walking down and out of the station reaches ${outside}`, JSON.stringify(await where()));
		return arrived;
	};
	// from outside, step off the door tile and back on to re-enter
	const reenter = async station => {
		await boot();
		const p0 = await where();
		await walkUntil('ArrowDown', async () => (await where()).y !== p0.y, 1500);   // one step off the door
		const ok = await walkUntil('ArrowUp', async () => (await where()).map === station, 3000);
		await sleep(500);
		return ok;
	};

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${LOWER}&x=6&y=8`, { waitUntil: 'domcontentloaded' });
	await boot(LOWER);

	// ===== 1. "No" =====
	{
		const r = await talkToAttendant('x');
		const p = await where();
		A(r.ok && r.asked && p.map === LOWER && p.y === 7, '"No": you stay in the lower station, below the attendant', JSON.stringify({ r, p }));
		const moved = await walkUntil('ArrowDown', async () => (await where()).y === 8, 1500);
		A(moved, '"No": ...and can walk away normally');
	}

	// ===== 2-5. two full round trips =====
	for (const lap of [1, 2]) {
		await ride(LOWER, UPPER, 'MtChimney', `[lap ${lap}] UP`);
		A(await reenter(UPPER), `[lap ${lap}] back into the upper station through its door`, JSON.stringify(await where()));
		await ride(UPPER, LOWER, 'Route112', `[lap ${lap}] DOWN`);
		A(await reenter(LOWER), `[lap ${lap}] back into the lower station through its door`, JSON.stringify(await where()));
	}

	// ===== 6. direction semantics =====
	{
		const dirs = await W(async () => {
			const Sty = await import('./ow_story.js'), Ev = await import('./events.js');
			const out = {};
			for (const v of ['FALSE', 'TRUE', 0, 1, '0', '1']) { Ev.setVar('VAR_0x8004', v); out[String(v) + ':' + typeof v] = Sty.cableCarDestination().map; }
			return out;
		});
		A(dirs['FALSE:string'] === 'MAP_MT_CHIMNEY_CABLE_CAR_STATION' && dirs['0:number'] === 'MAP_MT_CHIMNEY_CABLE_CAR_STATION' && dirs['0:string'] === 'MAP_MT_CHIMNEY_CABLE_CAR_STATION',
			'VAR_0x8004 FALSE / 0 / "0" ride UP (the string "FALSE" is not truthy)', JSON.stringify(dirs));
		A(dirs['TRUE:string'] === 'MAP_ROUTE112_CABLE_CAR_STATION' && dirs['1:number'] === 'MAP_ROUTE112_CABLE_CAR_STATION' && dirs['1:string'] === 'MAP_ROUTE112_CABLE_CAR_STATION',
			'VAR_0x8004 TRUE / 1 / "1" ride DOWN', JSON.stringify(dirs));
		// the script's own setvar path (symbolic, resolved by the engine)
		const viaScript = await W(async () => {
			const Sty = await import('./ow_story.js'), Ev = await import('./events.js');
			const r = {};
			for (const v of ['FALSE', 'TRUE']) {
				const cs = new Ev.Cutscene();
				cs.start([{ op: 'setvar', var: 'VAR_0x8004', value: v }, { op: 'end' }], {});
				for (let i = 0; i < 10 && cs.blocking; i++) cs.update(1 / 60);
				r[v] = Sty.cableCarDestination().map;
			}
			return r;
		}).catch(e => ({ error: String(e) }));
		A(viaScript.FALSE === 'MAP_MT_CHIMNEY_CABLE_CAR_STATION' && viaScript.TRUE === 'MAP_ROUTE112_CABLE_CAR_STATION', 'a script\'s `setvar VAR_0x8004, FALSE/TRUE` picks up / down', JSON.stringify(viaScript));
	}

	// ===== 7. push + fresh-device readback =====
	{
		// ride up once more and stop in the upper station
		await talkToAttendant('z');
		const here = await where();
		A(here.map === UPPER, 'setup: in the upper station after a ride', JSON.stringify(here));
		const pushed = await W(() => window.__ow.pushOwForTest());
		const rec = DB.get('ow:' + STATE.username);
		const pos = rec && JSON.parse(rec.ow['magepunk_pos_v1'] || 'null');
		A(pushed === true && pos && pos.map === UPPER, 'the push succeeds and the server copy is at the upper station', JSON.stringify({ pushed, pos }));
		const ctx = await browser.createBrowserContext();
		const p2 = await ctx.newPage();
		const err2 = []; p2.on('pageerror', e => err2.push(String(e.message)));
		await p2.evaluateOnNewDocument(st => {
			if (sessionStorage.getItem('seeded2')) return;
			sessionStorage.setItem('seeded2', '1');
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}, STATE);
		await p2.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' });
		let back = null;
		for (let i = 0; i < 400; i++) {
			back = await p2.evaluate(async () => {
				const O = window.__ow; if (!(O && O.world.current && O.battle && O.battle.data)) return null;
				const Ev = await import('./events.js');
				return { map: O.world.current.name, x: O.player.tx, y: O.player.ty, party: (O.party || []).length, state: Ev.getVar('VAR_CABLE_CAR_STATION_STATE'), intro: Ev.getFlag ? Ev.getFlag('intro_done') : null };
			}).catch(() => null);
			if (back && back.map === UPPER) break;
			await sleep(150);
		}
		A(back && back.map === UPPER && back.x === 6 && back.y === 7, 'a fresh device reads back the upper station, standing off the car', JSON.stringify(back));
		A(back && back.party === 6, '...with the six-POKeMON party', JSON.stringify(back));
		A(back && back.state === 0, '...and the cable-car state reset (no replayed arrival)', JSON.stringify(back));
		A(err2.length === 0, 'no page errors on the fresh device', JSON.stringify(err2.slice(0, 3)));
		await ctx.close();
	}

	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
