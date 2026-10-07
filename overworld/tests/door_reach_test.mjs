// door_reach_test.mjs — every Johto door you can see is a door you can reach.
//
// tools/audit_tile_reach.mjs (the walls fix, 2026-10-07) listed 21 doors on
// reached maps that no path walked to. Most were gates the audit didn't model —
// it now counts CUT trees (cut_blocks.json), Crystal ledge HOPS (the JUMP tile you
// stand on carries you over the wall row below: Tin Tower, Victory Road, Route 5's
// yard) and cells a script's changeblock opens as passable-with-a-requirement.
// Three were real:
//   1. the CELADON MANSION (TILESET_MANSION): the converter baked its cells'
//      collision from the wrong place — the roof was one solid wall and its house
//      door unreachable. crystal_collision_fix.json sets the decomp's collision.
//   2. the RADIO TOWER CARD KEY slot and
//   3. the GOLDENROD UNDERGROUND BASEMENT KEY door: both scripts sit behind a
//      GLOBAL label (`CardKeySlotScript::`), which the transpile never took — the
//      sign read and then nothing ran, so the Radio Tower takeover could not be
//      finished. gen_crystal_scriptvar.mjs rebuilds them from the trace.
//
//   node overworld/tests/door_reach_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9270;
const STATE = { username: 'doorreach', friendCode: 'DOOR01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (id, name) => ({
	speciesId: id, name, level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
});
const PARTY = [mon('rattata', 'A')];
const BASE_FLAGS = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 0. the audit: no unexplained unreachable Johto door =====
// doors the decomp itself leaves sealed, with why
const SEALED = {
	'OlivineCity (0,0)': 'OLIVINE_HOUSE_BETA: pokecrystal marks this warp "; inaccessible" (a beta house)',
};
{
	const audit = await import(pathToFileURL(path.join(ROOT, 'tools', 'audit_tile_reach.mjs')).href);
	const seen = audit.flood('MAP_NEW_BARK_TOWN', 13, 6);
	const miss = [];
	for (const [id, s] of seen) { const m = audit.loadMap(id); for (const w of m.warps) if (!s.has(w.x + ',' + w.y)) miss.push(`${m.name} (${w.x},${w.y})`); }
	const unexplained = miss.filter(d => !SEALED[d]);
	A(unexplained.length === 0, `0. every reached Johto door is reachable (${seen.size} maps; sealed by the decomp: ${miss.length - unexplained.length})`, unexplained.join(', '));
	const reached = (id, x, y) => !!seen.get(id)?.has(x + ',' + y);
	A(reached('MAP_JOHKANTO_CELADON_MANSION_ROOF', 2, 5), '0. the Celadon Mansion roof house door');
	A(reached('MAP_RADIO_TOWER_5F', 12, 0) && reached('MAP_RADIO_TOWER_4F', 17, 0), '0. the Radio Tower beyond the CARD KEY shutter');
	A(reached('MAP_JOHKANTO_ROUTE_5', 10, 11), "0. Route 5's yard, by the ledge hop (the CLEANSE TAG house)");
	A(reached('MAP_TIN_TOWER_3F', 16, 2) && reached('MAP_VICTORY_ROAD', 17, 19), '0. Tin Tower 3F -> 4F and Victory Road, by ledge hops');
	const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld', 'crystal_scriptvar_data.json'), 'utf8')).patches;
	A((P.RadioTower3F?.['CardKeySlotScript.HaveCardKey'] || []).some(o => o.op === 'changeblock' && o.x === 14 && o.y === 2), '0. CardKeySlotScript is restored, with its shutter changeblock');
	A((P.GoldenrodUnderground?.['BasementDoorScript.Unlock'] || []).some(o => o.op === 'changeblock' && o.x === 18 && o.y === 6), '0. BasementDoorScript is restored, with its door changeblock');
}

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
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(() => {
		const s = sessionStorage.getItem('stage');
		if (!s) return;
		sessionStorage.removeItem('stage');
		localStorage.clear();
		for (const [k, v] of Object.entries(JSON.parse(s))) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
	});
	const W = (f, ...a) => page.evaluate(f, ...a);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await W(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const scene = async (map, x, y, f, { flags = {}, bag = { pokeball: 5 }, region = 'JOHTO' } = {}) => {
		const stage = {
			magepunk_mp_token_v1: 't', magepunk_mp_state_v1: STATE, magepunk_region: region, magepunk_name: 'KRIS',
			magepunk_party_v1: PARTY, magepunk_bag_v1: bag,
			magepunk_story: { flags: { ...BASE_FLAGS, ...flags }, vars: {} },
			magepunk_settings: { textSpeed: 'instant', battleAnim: 'off' },
		};
		await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
		await W(s => sessionStorage.setItem('stage', s), JSON.stringify(stage));
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		await boot(map);
		await W((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.px = x * 16; P.py = y * 16; P.facing = f; }, x, y, f);
	};
	const talk = () => W(async () => {
		const O = window.__ow, C = await import('./choice.js');
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const seen = [];
		O.interact();
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < 15000) {
			const d = O.dialog.blocking, c = O.cutscene.blocking;
			if (d && O.dialog.pages) { const p = O.dialog.pages.flat().join(' '); if (seen[seen.length - 1] !== p) seen.push(p); }
			if (C.choiceMenu.open || d) press('z');
			if (!d && !c && !C.choiceMenu.open) { if (++calm >= 15) break; } else calm = 0;
			await new Promise(r => setTimeout(r, 40));
		}
		return seen;
	});
	const pass_ = (x, y) => W((x, y) => window.__ow.world.isPassable(x, y), x, y);
	const flag = f => W(f => window.__ow.Story.getFlag(f), f);

	// ===== 1. the CELADON MANSION roof =====
	await scene('JohKantoCeladonMansionRoof', 1, 1, 'down');
	const roof = await W(() => { const w = window.__ow.world; return [[1, 2], [2, 6], [3, 6], [4, 2], [7, 8]].map(([x, y]) => w.isPassable(x, y)); });
	A(roof.every(Boolean), '1. the mansion roof is floor again (it was one wall from end to end)', JSON.stringify(roof));
	A(!(await pass_(2, 4)), '1. ...and the roof house itself is still a wall around its door');

	// ===== 2. the RADIO TOWER CARD KEY slot =====
	// Crystal's new game SETS the card-key event (the shutter starts open); the Rocket
	// takeover clears it (std_scripts.asm RadioTowerRocketsScript) — so: mid-takeover
	const TAKEOVER = { crystal_events_seeded: true, EVENT_USED_THE_CARD_KEY_IN_THE_RADIO_TOWER: false };
	await scene('RadioTower3F', 14, 3, 'up', { flags: TAKEOVER, bag: { pokeball: 5, cardkey: 1 } });
	const shutBefore = await pass_(15, 3);
	const ck = await talk();
	A(ck.some(p => /CARD KEY/i.test(p)), '2. the slot speaks: inserted the CARD KEY', JSON.stringify(ck));
	A((await flag('EVENT_USED_THE_CARD_KEY_IN_THE_RADIO_TOWER')) === true, '2. EVENT_USED_THE_CARD_KEY_IN_THE_RADIO_TOWER is set');
	A(!shutBefore && (await pass_(15, 3)) && (await pass_(15, 4)), '2. ...and the shutter opens on the spot', JSON.stringify([shutBefore]));
	// without the key: just the slot's text, nothing opens
	await scene('RadioTower3F', 14, 3, 'up', { flags: TAKEOVER });
	await talk();
	A((await flag('EVENT_USED_THE_CARD_KEY_IN_THE_RADIO_TOWER')) !== true && !(await pass_(15, 3)), '2. without a CARD KEY the shutter stays shut');

	// ===== 3. the BASEMENT KEY door =====
	await scene('GoldenrodUnderground', 18, 7, 'up', { bag: { pokeball: 5, basementkey: 1 } });
	const doorBefore = await W(() => window.__ow.world.gridAt(18, 6));
	const bk = await talk();
	const doorAfter = await W(() => window.__ow.world.gridAt(18, 6));
	A(bk.some(p => /BASEMENT KEY|opened/i.test(p)), '3. the door speaks: the BASEMENT KEY opened it', JSON.stringify(bk));
	A((await flag('EVENT_USED_BASEMENT_KEY')) === true, '3. EVENT_USED_BASEMENT_KEY is set');
	A(doorBefore !== doorAfter && (doorAfter & 0x0C00) === 0, '3. ...and the door is unlocked on the spot', JSON.stringify([doorBefore, doorAfter]));

	A(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
