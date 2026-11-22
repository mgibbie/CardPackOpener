// poketactica_editor_test.mjs — the MAP MAKER (owner, 2026-11-22: "Map editor"): its model (poketactica/js/editor.js:
// the tools, resizing, the checks that a map is a Versus arena, reading a map defensively). Made maps are VERSUS ONLY (owner,
// 2026-11-22): no foe or solo-base tools, foes in an old map are left behind; a solo made-map battle saved before that can
// still be finished (no Bonus Gauge: nothing to farm). On the REAL server: sharing by code (server/ptmap.mjs) and a made
// map as a Versus arena (server/ptpvp.mjs), which every page builds the same.
//   node overworld/tests/poketactica_editor_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import * as Ed from '../../poketactica/js/editor.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { campaignSetup, buildMap } from '../../poketactica/js/campaign.js';
import { matchSetup, PTPVP_PROTOCOL } from '../../poketactica/js/arenas.js';
import { recipeOf, replayTo } from '../../poketactica/js/replay.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { newFigs, addFig } from '../../poketactica/js/figcol.js';
import { makeRng } from '../rules/rng.js';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv, seed) => makeFigurine(sp, lv, makeRng(seed || sp), data, { id: sp + '-' + (seed || 'x'), shinyRate: 0 });

try {
	// ---------- the model
	let m = Ed.newMap('Test', 8, 8);
	A(m.rows.length === 8 && m.rows[0].length === 8 && m.seats.length === 2 && !('foes' in m) && Ed.problems(m).length === 0, 'a new map: 8 x 8, two PvP seats, no foes: a Versus arena at once');
	A(Ed.TOOLS.map((t) => t.id).join() === 'raise,lower,ground,geo,seat', 'the tools: no Foe and no (solo) Base: made maps are for Versus only', Ed.TOOLS.map((t) => t.id));
	A(Ed.apply(m, 'foe', 3, 3).why === 'no such tool' && Ed.apply(m, 'base', 3, 3).why === 'no such tool', 'placing a foe or a solo base is refused');
	let r = Ed.apply(m, 'raise', 3, 3); m = r.map;
	A(Ed.heightAtM(m, 3, 3) === 1, 'Raise lifts a tile');
	for (let i = 0; i < 12; i++) m = Ed.apply(m, 'raise', 3, 3).map;
	A(Ed.heightAtM(m, 3, 3) === Ed.MAX_LEVEL && Ed.apply(m, 'raise', 3, 3).why, `heights stop at ${Ed.MAX_LEVEL}`);
	m = Ed.apply(Ed.apply(m, 'lower', 4, 4).map, 'lower', 4, 4).map;
	A(Ed.heightAtM(m, 4, 4) === null && Ed.apply(m, 'lower', 4, 4).why, 'Lower below 0 makes a gap; a gap goes no lower');
	A(Ed.apply(m, 'lower', 0, 7).why && Ed.apply(m, 'lower', 7, 0).why, 'the seats keep their ground');
	m = Ed.apply(m, 'ground', 2, 2, { ground: 'w' }).map;
	A(m.ground[2][2] === 'w' && Ed.apply(m, 'ground', 0, 7, { ground: 'l' }).why && Ed.apply(m, 'ground', 4, 4, { ground: 't' }).why, 'Ground paints a tile (not lava under the base, not on a gap)');
	m = Ed.apply(m, 'geo', 5, 5, { geo: 'r' }).map;
	A(m.geo[5][5] === 'r', 'Geo paints a panel');
	// bigger maps (owner, 2026-11-22: "bigger than 8x8"): up to 20 x 20, new ones at 8, 12, 16 or 20
	{
		A(Ed.MAX_W === 20 && Ed.MAX_H === 20 && Ed.NEW_SIZES.map(([w, h]) => w + 'x' + h).join() === '8x8,12x12,16x16,20x20', 'maps go up to 20 x 20; new ones start at 8, 12, 16 or 20 square');
		const big = Ed.newMap('Big', 20, 20);
		A(big.rows.length === 20 && big.rows[0].length === 20 && big.seats[1][0] === 19 && Ed.problems(big).length === 0, 'a new 20 x 20 map: its seats in the far corners, ready');
		A(Ed.resize(big, 1, 1).why && Ed.newMap('X', 99, 3).rows[0].length === 20 && Ed.newMap('X', 99, 3).rows.length === Ed.MIN_H, 'no bigger than 20 x 20 (or smaller than the least)');
		A(Ed.cleanMap(Ed.apply(big, 'raise', 19, 19).map).rows[19][19] === '1' && JSON.stringify(big).length < 6000, 'a 20 x 20 map reads back whole and fits a share code (under the server cap)', JSON.stringify(big).length);
		const ms = matchSetup({ arena: 'custom', map: big, lv: 50, seats: [{ name: 'a', team: [fig('pikachu', 10)] }, { name: 'b', team: [fig('eevee', 10)] }] }, 'sd20', data, makeFigurine, makeRng);
		A(ms.map.w === 20 && ms.map.h === 20 && ms.pvp.seats[1].base.x === 19, 'a 20 x 20 made arena plays');
	}
	// seats walled apart are named
	{
		let w = Ed.newMap('Wall', 6, 6);
		for (let x = 0; x < 6; x++) for (let k = 0; k < 3; k++) w = Ed.apply(w, 'raise', x, 2).map;
		A(Ed.problems(w).some((p) => /can't walk/.test(p)), 'seats behind a 3-level wall: not ready', Ed.problems(w));
		A(Ed.problems({ ...w, seats: [[0, 5]] }).some((p) => /need 2 PvP seats/.test(p)), 'one seat: not ready');
	}
	// resize keeps what fits
	{
		const big = Ed.resize(m, 2, 1).map;
		A(big.rows[0].length === 10 && big.rows.length === 9 && big.ground[2][2] === 'w', 'Wider / Taller keep the map');
		let small = m; for (let i = 0; i < 6; i++) small = Ed.resize(small, -1, -1).map;
		A(small.rows[0].length === Ed.MIN_W && small.rows.length === Ed.MIN_H && small.seats.every(([x, y]) => x < Ed.MIN_W && y < Ed.MIN_H), `shrinking stops at ${Ed.MIN_W} x ${Ed.MIN_H}; a seat that no longer fits is dropped`, small.seats);
	}
	// cleanMap: junk in, a map (or null) out
	{
		A(Ed.cleanMap(null) === null && Ed.cleanMap({ rows: ['..'] }) === null, 'junk is no map');
		const c = Ed.cleanMap({ ...m, name: '<b>x</b>'.repeat(9), rows: m.rows.map((row, y) => (y === 0 ? 'Z' + row.slice(1) : row)), seats: [...m.seats, [0, 7], [99, 1]], theme: 'nope' });
		A(c && !/[<>]/.test(c.name) && c.name.length <= Ed.NAME_MAX && c.rows[0][0] === '.' && c.seats.length === 2 && c.theme === 'meadow', 'cleanMap drops bad tiles, seats and names', c);
		const old = Ed.cleanMap({ ...m, base: [1, 7], foes: [{ sp: 'pikachu', lv: 5, x: 6, y: 6, ai: 'aggro' }] });
		A(old && !('foes' in old) && !('base' in old) && JSON.stringify(old.rows) === JSON.stringify(m.rows), 'a map made before made maps were Versus-only: its foes and solo base are left behind, the board kept', old);
	}
	// ---------- a solo made-map battle saved BEFORE made maps were Versus-only still finishes (never wipe a save)
	{
		const play = Ed.asPlayable({ ...m, base: [0, 7], foes: [{ sp: 'rattata', lv: 5, x: 7, y: 0, ai: 'aggro' }] });
		const setup = { ...campaignSetup(play, [fig('machamp', 30)], data, 'made'), rev: B.RULES_REV, noBonus: true };
		const S = B.newBattle('made-1', setup, data);
		A(S.bonus === null && S.terrain && S.map.ground[2 * 8 + 2] === 'water', 'a made map plays with its living terrain and no Bonus Gauge (nothing to farm)');
		const rec = recipeOf('made-1', setup, [{ t: 'deploy', uid: 'p0' }, { t: 'end' }]);
		A(rec.setup.noBonus && JSON.stringify(B.view(replayTo(rec, 2, data))) === JSON.stringify(B.view(B.replay('made-1', setup, rec.actions, data))), 'its replay keeps "no gauge" and plays the same');
		A(buildMap(play).theme === m.theme, 'its theme is drawn');
	}
	// ---------- PvP seats: a made arena
	let arena = { ...Ed.newMap('Duel', 7, 7), seats: [] };
	A(Ed.arenaProblems(arena, 2).length, 'no seats: no arena');
	arena = Ed.apply(Ed.apply(arena, 'seat', 0, 0).map, 'seat', 6, 6).map;
	A(Ed.arenaProblems(arena, 2).length === 0 && Ed.arenaProblems(arena, 3).length, 'two seats: an arena for 2 (not 3)');
	A(Ed.apply(arena, 'seat', 0, 0).map.seats.length === 1, 'Z on a seat removes it');
	{
		let walled = arena; for (let y = 0; y < 7; y++) for (let k = 0; k < 4; k++) walled = Ed.apply(walled, 'raise', 3, y).map;
		A(Ed.arenaProblems(walled, 2).some((p) => /can't walk/.test(p)), 'seats walled apart: not an arena');
	}
	{
		const ms = matchSetup({ arena: 'custom', map: arena, lv: 50, seats: [{ name: 'a', team: [fig('pikachu', 10)] }, { name: 'b', team: [fig('eevee', 10)] }] }, 'sd', data, makeFigurine, makeRng);
		A(ms.pvp.seats[0].base.x === 0 && ms.pvp.seats[1].base.x === 6 && ms.map.w === 7, 'a made arena: its seats are the bases');
	}

	// ---------- the real server: share codes, a made arena in a lobby
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
	const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
	const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-pted-')), 'mp.bundle.mjs');
	buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
	const { default: handler } = await import(pathToFileURL(bundle).href);
	let ipN = 0;
	const api = async (action, body = {}, token) => { const res = await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.6.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB }); return { status: res.status, ...(await res.json()) }; };
	const tok = (await api('register', { username: 'mapmaker', password: 'map-pass-1' })).token;
	A((await api('ptmap-put', { map: m })).status === 401, 'sharing a map needs an account');
	const put = await api('ptmap-put', { map: m }, tok);
	A(/^[A-Z2-9]{6}$/.test(put.code || ''), 'a shared map gets a 6-letter code', put);
	const again = await api('ptmap-put', { map: m }, tok);
	A(again.code === put.code, 'sharing the same map again gives the same code');
	const got = await api('ptmap-get', { code: put.code });
	A(got.map && got.by === 'mapmaker' && JSON.stringify(got.map.rows) === JSON.stringify(m.rows) && got.map.ground[2][2] === 'w', 'anyone loads it by its code (signed in or not)');
	A((await api('ptmap-get', { code: 'ZZZZZZ' })).status === 404 && (await api('ptmap-get', { code: 'x' })).status === 400, 'a wrong code: no map');
	A((await api('ptmap-put', { map: { rows: ['..'] } }, tok)).status === 400, 'a map that cannot be read is refused');
	// a made arena in Versus
	{
		let col = newFigs(); col = addFig(col, fig('pikachu', 20, 'mm')); sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, ?)').run('ptfig:mapmaker', JSON.stringify({ rev: 1, figs: col }), Date.now());
		const id0 = Object.keys(col.figs)[0];
		const bad = await api('ptpvp-create', { pv: PTPVP_PROTOCOL, size: 2, arena: 'custom', map: { ...Ed.newMap('NoSeats'), seats: [] }, team: [id0] }, tok);
		A(bad.status === 400 && /arena/.test(bad.error), 'a made map without seats cannot be an arena', bad);
		const ok = await api('ptpvp-create', { pv: PTPVP_PROTOCOL, size: 2, cpus: 1, arena: 'custom', map: arena, team: [id0] }, tok);
		A(ok.lobby && ok.lobby.arena === 'custom' && ok.lobby.arenaName === 'Duel', 'a made map with two seats is the lobby\'s arena', ok);
		const st = await api('ptpvp-start', { pv: PTPVP_PROTOCOL, id: ok.lobby.id }, tok);
		A(st.match && st.match.config.arena === 'custom' && st.match.config.map.seats.length === 2, 'the match carries the made map', st.match && st.match.config);
		const S = B.newBattle(st.match.seed, matchSetup(st.match.config, st.match.seed, data, makeFigurine, makeRng), data);
		A(S.pvp.sides.length === 2 && S.map.w === 7 && S.pvp.bases.a.x !== S.pvp.bases.b.x, 'every page builds the match on the made map');
	}
} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
