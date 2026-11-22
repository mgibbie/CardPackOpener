// poketactica_editor_test.mjs — the MAP MAKER (owner, 2026-11-22: "Map editor"): its model (poketactica/js/editor.js:
// the tools, resizing, the checks that a map can be played and be a Versus arena, reading a map defensively), a made map
// played by the engine (no Bonus Gauge: nothing to farm), and on the REAL server: sharing by code (server/ptmap.mjs) and a
// made map as a Versus arena (server/ptpvp.mjs), which every page builds the same.
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
	A(m.rows.length === 8 && m.rows[0].length === 8 && m.foes.length === 1 && Ed.problems(m).length === 0, 'a new map: 8 x 8, a foe, ready to play');
	let r = Ed.apply(m, 'raise', 3, 3); m = r.map;
	A(Ed.heightAtM(m, 3, 3) === 1, 'Raise lifts a tile');
	for (let i = 0; i < 12; i++) m = Ed.apply(m, 'raise', 3, 3).map;
	A(Ed.heightAtM(m, 3, 3) === Ed.MAX_LEVEL && Ed.apply(m, 'raise', 3, 3).why, `heights stop at ${Ed.MAX_LEVEL}`);
	m = Ed.apply(Ed.apply(m, 'lower', 4, 4).map, 'lower', 4, 4).map;
	A(Ed.heightAtM(m, 4, 4) === null && Ed.apply(m, 'lower', 4, 4).why, 'Lower below 0 makes a gap; a gap goes no lower');
	A(Ed.apply(m, 'lower', 0, 7).why && Ed.apply(m, 'lower', 7, 0).why, "the base and a foe keep their ground");
	m = Ed.apply(m, 'ground', 2, 2, { ground: 'w' }).map;
	A(m.ground[2][2] === 'w' && Ed.apply(m, 'ground', 0, 7, { ground: 'l' }).why && Ed.apply(m, 'ground', 4, 4, { ground: 't' }).why, 'Ground paints a tile (not lava under the base, not on a gap)');
	m = Ed.apply(m, 'geo', 5, 5, { geo: 'r' }).map;
	A(m.geo[5][5] === 'r', 'Geo paints a panel');
	m = Ed.apply(m, 'foe', 6, 6, { foe: { sp: 'pikachu', lv: 300, ai: 'hold' } }).map;
	A(m.foes.length === 2 && m.foes[1].lv === Ed.FOE_LV_MAX && m.foes[1].ai === 'hold', 'Foe places one (its level capped)');
	m = Ed.apply(m, 'foe', 6, 6).map;
	A(m.foes.length === 1, '...and Z on it again takes it off');
	A(Ed.apply(m, 'foe', 0, 7).why && Ed.apply(m, 'foe', 4, 4).why, 'no foe on the base or a gap');
	m = Ed.apply(m, 'base', 1, 7).map;
	A(m.base[0] === 1 && m.base[1] === 7 && Ed.apply(m, 'base', 7, 0).why, 'Base moves your base (not onto a foe)');
	// unreachable foes are named
	{
		let w = Ed.newMap('Wall', 6, 6); w.foes = [{ sp: 'rattata', lv: 5, x: 5, y: 0, ai: 'aggro' }];
		for (let x = 0; x < 6; x++) for (let k = 0; k < 3; k++) w = Ed.apply(w, 'raise', x, 2).map;
		A(Ed.problems(w).some((p) => /no way to reach/.test(p)), 'a foe behind a 3-level wall: "no way to reach"', Ed.problems(w));
		A(Ed.problems({ ...w, foes: [] }).some((p) => /no foes/.test(p)), 'no foes: not ready');
	}
	// resize keeps what fits
	{
		const big = Ed.resize(m, 2, 1).map;
		A(big.rows[0].length === 10 && big.rows.length === 9 && big.ground[2][2] === 'w', 'Wider / Taller keep the map');
		let small = m; for (let i = 0; i < 6; i++) small = Ed.resize(small, -1, -1).map;
		A(small.rows[0].length === Ed.MIN_W && small.rows.length === Ed.MIN_H && small.base[0] < Ed.MIN_W && small.base[1] < Ed.MIN_H, `shrinking stops at ${Ed.MIN_W} x ${Ed.MIN_H}; the base comes along`);
	}
	// cleanMap: junk in, a map (or null) out
	{
		A(Ed.cleanMap(null) === null && Ed.cleanMap({ rows: ['..'] }) === null, 'junk is no map');
		const c = Ed.cleanMap({ ...m, name: '<b>x</b>'.repeat(9), rows: m.rows.map((row, y) => (y === 0 ? 'Z' + row.slice(1) : row)), foes: [...m.foes, { sp: '../../x', x: 1, y: 1 }, { sp: 'pikachu', x: 99, y: 1 }], theme: 'nope' }, (sp) => !!data.species[sp]);
		A(c && !/[<>]/.test(c.name) && c.name.length <= Ed.NAME_MAX && c.rows[0][0] === '.' && c.foes.length === 1 && c.theme === 'meadow', 'cleanMap drops bad tiles, foes and names', c);
	}
	// ---------- a made map, played
	{
		const play = Ed.asPlayable(m);
		const setup = { ...campaignSetup(play, [fig('machamp', 30)], data, 'made'), rev: B.RULES_REV, noBonus: true };
		const S = B.newBattle('made-1', setup, data);
		A(S.bonus === null && S.terrain && S.map.ground[2 * 8 + 2] === 'water', 'a made map plays with its living terrain and no Bonus Gauge (nothing to farm)');
		const rec = recipeOf('made-1', setup, [{ t: 'deploy', uid: 'p0' }, { t: 'end' }]);
		A(rec.setup.noBonus && JSON.stringify(B.view(replayTo(rec, 2, data))) === JSON.stringify(B.view(B.replay('made-1', setup, rec.actions, data))), 'its replay keeps "no gauge" and plays the same');
		A(buildMap(play).theme === m.theme, 'its theme is drawn');
	}
	// ---------- PvP seats: a made arena
	let arena = Ed.newMap('Duel', 7, 7);
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
		const bad = await api('ptpvp-create', { pv: PTPVP_PROTOCOL, size: 2, arena: 'custom', map: Ed.newMap('NoSeats'), team: [id0] }, tok);
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
