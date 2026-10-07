// tester_1007b_test.mjs — three of Instinct's 2026-10-07 reports.
//
//   1. bug:1791403278793 — an owned POKe FLUTE wasn't recognised by FireRed's Route 16
//      SNORLAX: the port's native giver (blockers.js GIVERS, MR. FUJI) hands over the
//      ITEM only, and the decomp's script reads FLAG_GOT_POKE_FLUTE. Owning the item now
//      sets its flags (ow_fieldmoves.js syncBikeFlags / KEY_ITEM_FLAGS), on map load.
//   2. bug:1791404447787 — Route 17's road rolled wild encounters: FRLG decides land
//      encounters by the metatile's own encounter type (attribute bits 24-26), and
//      Route 17's grass has behavior 0xD1, so World.hasTallGrass() was false and the
//      no-grass (cave) rule fired on every tile. FRLG maps now read the attribute.
//   3. bug:1791399662275 — the high-tide Shoal Cave Inner Room had no shell digs: the
//      decomp keeps the four SHELL stones whatever the tide, but the dig spots were
//      keyed to the low-tide map id only.
// (bug:1791400703279, Sky Pillar 4F's drop, was fixed by #664: door_reach_kh_test.)
//
//   node overworld/tests/tester_1007b_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const DATA = path.join(ROOT, 'overworld', 'data');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9290;
const STATE = { username: 'bugs1007b', friendCode: 'BUGS7B', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
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
	const errors = [];
	const boot = async (page, map) => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const open = async (region, bag, query, map) => {
		const page = await browser.newPage();
		page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, party, region, bag) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', region);
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_bag_v1', JSON.stringify(bag));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}, STATE, PARTY, region, bag);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?${query}`, { waitUntil: 'domcontentloaded' });
		await boot(page, map);
		return page;
	};
	const text = page => page.evaluate(() => { const d = window.__ow.dialog; return d.pages ? d.pages.flat().join(' ') : ''; });

	// ----- 1. the POKe FLUTE wakes Route 16's SNORLAX -----
	{
		const page = await open('KANTO', { pokeflute: 1 }, 'map=Route16&x=32&y=13', 'Route16');
		const flag = await page.evaluate(async () => (await import('./events.js')).getFlag('FLAG_GOT_POKE_FLUTE'));
		A(flag === true, '1. owning the POKe FLUTE sets FLAG_GOT_POKE_FLUTE on map load', String(flag));
		await page.evaluate(() => { const P = window.__ow.player; P.facing = 'left'; window.__ow.interact(); });
		let t = '';
		for (let i = 0; i < 40 && !/FLUTE/i.test(t); i++) { await sleep(100); t = await text(page); }
		A(/FLUTE/i.test(t), '1. ...so the SNORLAX asks to use the POKe FLUTE (not "sprawled out in a deep and comfortable slumber")', t);
		await page.close();
	}
	// ----- 2. Route 17's road is not an encounter tile; its grass and Mt. Moon's floor are -----
	{
		const page = await open('KANTO', {}, 'map=Route17&x=12&y=157', 'Route17');
		const r = await page.evaluate(async () => {
			const O = window.__ow, rnd = Math.random; Math.random = () => 0;
			const roll = (id, x, y) => !!O.encounters.roll(id, O.world, x, y, false);
			const o = { road: roll('MAP_ROUTE17', 12, 158), road2: roll('MAP_ROUTE17', 12, 146), grass: roll('MAP_ROUTE17', 15, 11) };
			Math.random = rnd;
			await O.moveToMap('MtMoon_1F', 2, 2);
			Math.random = () => 0;
			o.cave = roll('MAP_MT_MOON_1F', 2, 2);
			Math.random = rnd;
			return o;
		});
		A(!r.road && !r.road2, "2. Route 17's road (12,158) / (12,146) rolls no wild encounter", JSON.stringify(r));
		A(r.grass, "2. ...its encounter grass (15,11) still does", JSON.stringify(r));
		A(r.cave, "2. ...and Mt. Moon's cave floor still does", JSON.stringify(r));
		await page.close();
	}
	// ----- 3. the high-tide Inner Room keeps the SHELL digs -----
	{
		const page = await open('HOENN', {}, 'map=ShoalCave_HighTideInnerRoom&x=40&y=10', 'ShoalCave_HighTideInnerRoom');
		const d = await page.evaluate(async () => {
			const O = window.__ow; O.player.setTile(40, 10); O.player.facing = 'right';
			const before = O.Bag.count('shoalshell');
			O.interact();
			await new Promise(r => setTimeout(r, 300));
			return { got: O.Bag.count('shoalshell') - before, taken: JSON.parse(localStorage.getItem('magepunk_shoal_v1') || '{}').taken || {} };
		});
		A(d.got === 1, '3. at high tide, digging (41,10) yields a SHOAL SHELL', JSON.stringify(d));
		A(d.taken['MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:41,10'] === 1, '3. ...recorded against the room itself, so low tide sees it dug too', JSON.stringify(d.taken));
		await page.close();
	}
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
