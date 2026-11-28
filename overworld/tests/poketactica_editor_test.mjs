// poketactica_editor_test.mjs — the MAP MAKER (owner, 2026-11-22: "Map editor"): its model (poketactica/js/editor.js:
// the tools, resizing, the checks that a map is a Versus arena, reading a map defensively). Made maps are VERSUS ONLY (owner,
// 2026-11-22): no solo base, no solo play (a solo made-map battle saved before that can still be finished, no Bonus Gauge);
// its foes are WILD in Versus, fighting every side, with up to 4 players (owner: "4 players AND foes"); maps up to 32 x 32. On the REAL server: sharing by code (server/ptmap.mjs) and a made
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
	A(m.rows.length === 8 && m.rows[0].length === 8 && m.seats.length === 2 && m.foes.length === 0 && Ed.problems(m).length === 0, 'a new map: 8 x 8, two PvP seats, no foes yet: a Versus arena at once');
	A(Ed.TOOLS.map((t) => t.id).join() === 'raise,lower,ground,geo,foe,seat,tdgate,tdbase' && !Ed.TOOLS.some((t) => t.id === 'base'), 'the tools: Foe (wild, for Versus), no solo battle Base; and a Tower Defense gate and base (plan item K1)', Ed.TOOLS.map((t) => t.id));
	A(Ed.apply(m, 'base', 3, 3).why === 'no such tool', 'placing a solo base is refused');
	{
		let f = Ed.apply(m, 'foe', 6, 6, { foe: { sp: 'pikachu', lv: 300, ai: 'hold' } }).map;
		A(f.foes.length === 1 && f.foes[0].lv === Ed.FOE_LV_MAX && f.foes[0].ai === 'hold', 'Foe places a wild foe (its level capped)');
		A(Ed.apply(f, 'foe', 6, 6).map.foes.length === 0, '...and Z on it again takes it off');
		A(Ed.apply(m, 'foe', 0, 7).why && Ed.apply(f, 'seat', 6, 6).why && Ed.apply(f, 'lower', 6, 6).why, 'a foe never shares a tile with a seat, and keeps its ground');
	}
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
		A(Ed.MAX_W === 32 && Ed.MAX_H === 32 && Ed.NEW_SIZES.map(([w, h]) => w + 'x' + h).join() === '8x8,12x12,16x16,24x24,32x32', 'maps go up to 32 x 32; new ones start at 8, 12, 16, 24 or 32 square');
		let big = Ed.newMap('Big', 32, 32);
		A(big.rows.length === 32 && big.rows[0].length === 32 && big.seats[1][0] === 31 && Ed.problems(big).length === 0, 'a new 32 x 32 map: its seats in the far corners, ready');
		A(Ed.resize(big, 1, 1).why && Ed.newMap('X', 99, 3).rows[0].length === 32 && Ed.newMap('X', 99, 3).rows.length === Ed.MIN_H, 'no bigger than 32 x 32 (or smaller than the least)');
		big = Ed.apply(Ed.apply(big, 'seat', 0, 0).map, 'seat', 31, 31).map;
		for (let i = 0; i < Ed.MAX_FOES; i++) big = Ed.apply(big, 'foe', 4 + (i % 12) * 2, 6 + Math.floor(i / 12) * 18, { foe: { sp: 'charizard', lv: 100, ai: 'passive' } }).map;
		const full = JSON.stringify(big).length;
		A(big.foes.length === Ed.MAX_FOES && Ed.cleanMap(Ed.apply(big, 'raise', 31, 30).map).rows[30][31] === '1' && full < 12000, `a full 32 x 32 map (4 seats, ${Ed.MAX_FOES} foes) reads back whole and fits a share code (${full} chars, under the server's 12000)`, full);
		const ms = matchSetup({ arena: 'custom', map: big, lv: 50, seats: [{ name: 'a', team: [fig('pikachu', 10)] }, { name: 'b', team: [fig('eevee', 10)] }] }, 'sd32', data, makeFigurine, makeRng);
		A(ms.map.w === 32 && ms.map.h === 32 && ms.pvp.seats[1].base.x === 31 && ms.pvp.foes.length === Ed.MAX_FOES, 'a 32 x 32 made arena plays, its wild foes on it');
	}
	// every saved map has 2+ PvP bases; players up to its bases (owner, 2026-11-22)
	{
		const one = Ed.apply(Ed.newMap(), 'seat', 0, 7).map;
		A(one.seats.length === 1 && /at least 2 PvP bases/.test(Ed.saveBlock(one)) && Ed.saveBlock(Ed.newMap()) === null, 'under 2 PvP bases: no saving (a new map, with 2, saves)', Ed.saveBlock(one));
		let three = Ed.apply(Ed.newMap(), 'seat', 0, 0).map, four = Ed.apply(three, 'seat', 7, 7).map;
		A(Ed.maxPlayers(one) === 0 && Ed.maxPlayers(Ed.newMap()) === 2 && Ed.maxPlayers(three) === 3 && Ed.maxPlayers(four) === 4 && Ed.apply(four, 'seat', 3, 3).why, 'players: one per base panel (2, 3, 4), and no fifth base');
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
		A(old && old.foes.length === 1 && old.foes[0].sp === 'pikachu' && !('base' in old) && JSON.stringify(old.rows) === JSON.stringify(m.rows), 'a map made before made maps were Versus-only: its foes come along (wild now), its solo base is left behind', old);
		A(Ed.cleanMap({ ...Ed.newMap(), foes: [{ sp: 'pikachu', lv: 5, x: 0, y: 7 }, { sp: 'nosuchmon', lv: 5, x: 3, y: 3 }] }, (sp) => !!data.species[sp]).foes.length === 0, 'cleanMap: no foe on a seat, none of an unknown species');
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

	// ---------- FOUR players AND wild foes (owner, 2026-11-22): a 12 x 12 made map, 4 seats, 3 wild foes
	{
		let w4 = Ed.newMap('Melee', 12, 12);
		w4 = Ed.apply(Ed.apply(w4, 'seat', 0, 0).map, 'seat', 11, 11).map;
		for (const [x, y] of [[5, 5], [6, 6], [5, 6]]) w4 = Ed.apply(w4, 'foe', x, y, { foe: { sp: 'machamp', lv: 40, ai: 'aggro' } }).map;
		A(Ed.arenaProblems(w4, 4).length === 0 && w4.foes.length === 3, 'a made map with 4 seats and 3 wild foes is a 4-player arena');
		const config = { arena: 'custom', map: w4, lv: 50, seats: [{ name: 'ann', team: [fig('pikachu', 30, 'q1'), fig('eevee', 30, 'q2')] }, { name: 'CPU Blue', cpu: true, picks: ['geodude', 'machop'], level: 50 }, { name: 'CPU Green', cpu: true, picks: ['abra', 'gastly'], level: 50 }, { name: 'bob', team: [fig('squirtle', 30, 'q3')] }] };
		const setup = matchSetup(config, 'melee', data, makeFigurine, makeRng);
		A(setup.pvp.seats.length === 4 && setup.pvp.foes.length === 3 && setup.pvp.foes.every((f) => f.fig.species === 'machamp' && f.fig.level === 40), 'the match: four seats, three wild Machamp at their own level (not levelled to 50)');
		const S = B.newBattle('melee', setup, data);
		A(S.pvp.sides.join() === 'a,b,c,d' && S.units.filter((u) => u.side === 'e' && u.x != null).length === 3, 'four sides, and the wild foes on the map from the start (no seat\'s)');
		const acts = [];
		const step = (a) => { const r = B.act(S, a, data); if (r.ok) acts.push(a); return r; };
		// ann and bob deploy and pass; the computers play; the wild foes take their phase after the last seat, each round
		step({ t: 'deploy', uid: S.units.find((u) => u.side === 'a').uid, by: 'a' }); step({ t: 'end', by: 'a' });
		step({ t: 'deploy', uid: S.units.find((u) => u.side === 'd').uid, by: 'd' }); step({ t: 'end', by: 'd' });
		const wildPhases = () => S.log.filter((e) => e.t === 'phase' && e.phase === 'wild').length;
		A(wildPhases() === 1 && S.turn === 2 && B.curSide(S) === 'a', 'after seat 4: the wild foes\' phase, then round 2 from seat 1', [wildPhases(), S.turn, B.curSide(S)]);
		for (let r = 0; r < 60 && !S.over; r++) step({ t: 'end', by: B.curSide(S) });
		const wildUids = new Set(S.units.filter((u) => u.side === 'e').map((u) => u.uid));
		const wildHits = S.log.filter((e) => (e.t === 'hit' || e.t === 'damage' || e.t === 'attack' || e.t === 'use') && wildUids.has(e.uid || e.by));
		const wildMoved = S.log.some((e) => e.t === 'move' && wildUids.has(e.uid));
		A(wildPhases() > 3 && wildMoved, 'every round the wild foes act (they walk to the fight)', [wildPhases(), wildMoved]);
		const hurtBy = new Set(S.units.filter((u) => u.side !== 'e' && u.hp < u.maxHP).map((u) => u.side));
		A(S.units.some((u) => u.side === 'e' && u.hp < u.maxHP) || S.units.some((u) => u.side === 'e' && u.hp <= 0), 'the seats\' figurines fight the wild foes too');
		A(hurtBy.size >= 1, 'the wild foes (and the sides) hurt the players', [...hurtBy]);
		A(S.over === 'done' && S.pvp.winner !== 'e' && 'abcd'.includes(S.pvp.winner), 'the match ends with one of the four seats the winner (a wild foe never wins)', S.pvp.winner);
		A(S.exp && !Object.keys(S.exp).length && S.bonus === null, 'no EXP and no Bonus Gauge from it (a friendly match)');
		const rec = recipeOf('melee', setup, acts);
		A(rec.setup.pvp.foes.length === 3 && JSON.stringify(B.view(replayTo(rec, acts.length, data))) === JSON.stringify(B.view(S)), 'its replay keeps the wild foes and plays out the same');
		A(JSON.stringify(B.view(B.newBattle('melee', matchSetup(JSON.parse(JSON.stringify(config)), 'melee', data, makeFigurine, makeRng), data))) === JSON.stringify(B.view(B.newBattle('melee', setup, data))), 'every page builds the same match from the same config');
		const two = matchSetup({ ...config, seats: config.seats.slice(0, 2), map: { ...w4, foes: [] } }, 'm2', data, makeFigurine, makeRng);
		A(!('foes' in two.pvp) && !B.replay('m2', two, [], data).log.some((e) => e.phase === 'wild'), 'no foes on the map: no wild phase (old matches play as before)');
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
	// A CHECK BEFORE SHARING, IN WORDS (plan item K2): a map with two bases was shared whatever else was wrong with it
	{
		const cut = (mm, x) => ({ ...mm, rows: mm.rows.map((r) => r.slice(0, x) + '#' + r.slice(x + 1)) });
		const ok = Ed.newMap('Fine', 8, 8), split = cut(Ed.newMap('Split', 8, 8), 4);
		const c0 = Ed.shareCheck(ok), c1 = Ed.shareCheck(split);
		A(c0.stops.length === 0 && c0.warns.length === 0, 'a fresh 8 by 8 map with its two bases: nothing to mend, nothing to know', c0);
		A(c1.stops.length === 1 && c1.stops[0] === 'Base 1 and base 2 cannot reach each other on foot: a gap, or a cliff more than 2 levels high, is in the way.', 'a gap right across the map: said in words, by base number', c1.stops);
		const onGap = { ...ok, rows: ok.rows.map((r, y) => (y === 7 ? '#' + r.slice(1) : r)) };
		A(Ed.shareCheck(onGap).stops.includes('Base 1 stands on a gap. Move it onto ground.'), 'a base on a gap', Ed.shareCheck(onGap).stops);
		A(/It has 1 base: an arena needs at least 2\./.test(Ed.shareCheck({ ...ok, seats: [[0, 7]] }).stops.join(' ')), 'one base only');
		const names = (id) => ({ rattata: 'Rattata', onix: 'Onix' }[id] || id);
		const wild = { ...split, rows: ok.rows, foes: [{ sp: 'rattata', lv: 5, x: 1, y: 6, ai: 'aggro' }, { sp: 'onix', lv: 9, x: 4, y: 4, ai: 'hold' }] };
		const cw = Ed.shareCheck(wild, names);
		A(cw.stops.length === 0 && cw.warns.length === 1 && cw.warns[0] === 'The wild Rattata stands right next to base 1: that side is attacked at once.', 'a wild Pokémon next to a base is a warning, not a stop (the Onix in the middle is fine)', cw);
		const walled = { ...ok, rows: ok.rows.map((r, y) => (y >= 2 && y <= 4 ? r.slice(0, 2) + (y === 3 ? '#.#' : '###') + r.slice(5) : r)), foes: [{ sp: 'onix', lv: 9, x: 3, y: 3, ai: 'hold' }] };
		A(Ed.shareCheck(walled, names).warns.some((t) => /^No base can walk to the wild Onix at 4, 4: it may never fight\.$/.test(t)), 'a wild Pokémon walled in by gaps: a warning that says where', Ed.shareCheck(walled, names).warns);
		// the server refuses a map that cannot be played, in the same words; a warning does not stop it
		const no = await api('ptmap-put', { map: split }, tok);
		A(no.status === 400 && /^Not ready to share: Base 1 and base 2 cannot reach each other/.test(no.error || ''), 'the server does not share a map whose bases cannot reach each other', no);
		const yes = await api('ptmap-put', { map: wild }, tok);
		A(/^[A-Z2-9]{6}$/.test(yes.code || ''), 'a map with only a warning is shared', yes);
	}
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
		await api('ptpvp-leave', { pv: PTPVP_PROTOCOL, id: ok.lobby.id }, tok);
		// four seats (three computers) and wild foes, on a big made map
		let w4 = Ed.newMap('Big melee', 24, 24);
		w4 = Ed.apply(Ed.apply(w4, 'seat', 0, 0).map, 'seat', 23, 23).map;
		for (const [x, y] of [[11, 11], [12, 12]]) w4 = Ed.apply(w4, 'foe', x, y, { foe: { sp: 'tyranitar', lv: 60, ai: 'passive' } }).map;
		const ok4 = await api('ptpvp-create', { pv: PTPVP_PROTOCOL, size: 4, cpus: 3, arena: 'custom', map: w4, team: [id0] }, tok);
		A(ok4.lobby && ok4.lobby.arena === 'custom', 'a 24 x 24 made map with 4 seats and wild foes: a 4-player lobby', ok4);
		const st4 = ok4.lobby && await api('ptpvp-start', { pv: PTPVP_PROTOCOL, id: ok4.lobby.id }, tok);
		A(st4 && st4.match && st4.match.config.seats.length === 4 && st4.match.config.map.foes.length === 2 && st4.match.config.map.rows.length === 24, 'it starts: four seats, the map and its foes in the match', st4 && (st4.error || st4.match && st4.match.config.seats.length));
		if (st4 && st4.match) {
			const S4 = B.newBattle(st4.match.seed, matchSetup(st4.match.config, st4.match.seed, data, makeFigurine, makeRng), data);
			A(S4.pvp.sides.length === 4 && S4.units.filter((u) => u.side === 'e').length === 2 && S4.map.w === 24, 'every page builds it: 4 sides and 2 wild Tyranitar on a 24 x 24 board');
		}
		const put32 = await api('ptmap-put', { map: (() => { let b = Ed.newMap('Huge', 32, 32); for (let i = 0; i < Ed.MAX_FOES; i++) b = Ed.apply(b, 'foe', 2 + i, 15, { foe: { sp: 'charizard', lv: 100, ai: 'passive' } }).map; return b; })() }, tok);
		A(/^[A-Z2-9]{6}$/.test(put32.code || ''), 'a full 32 x 32 map shares by code', put32);
		A(((await api('ptmap-get', { code: put32.code })).map || { foes: [] }).foes.length === Ed.MAX_FOES, '...and loads back with every foe');
		// players up to the map's PvP bases; a shared map has 2+
		const oneSeat = await api('ptmap-put', { map: Ed.apply(Ed.newMap('Lonely'), 'seat', 0, 7).map }, tok);
		A(oneSeat.status === 400 && /2 PvP bases/.test(oneSeat.error), 'a map with one PvP base cannot be shared', oneSeat);
		if (ok4.lobby) await api('ptpvp-leave', { pv: PTPVP_PROTOCOL, id: ok4.lobby.id }, tok);
		const over = await api('ptpvp-create', { pv: PTPVP_PROTOCOL, size: 3, arena: 'custom', map: arena, team: [id0] }, tok);
		A(over.status === 400 && /arena for 3/.test(over.error), 'a 2-base map: no 3-player lobby on it', over);
		const two = await api('ptpvp-create', { pv: PTPVP_PROTOCOL, size: 2, arena: 'custom', map: arena, team: [id0] }, tok);
		A(two.lobby && two.lobby.size === 2, '...a 2-player one, yes', two);
		if (two.lobby) {
			const up = await api('ptpvp-update', { pv: PTPVP_PROTOCOL, id: two.lobby.id, size: 4 }, tok);
			A((up.lobby || {}).size === 2, 'and its lobby cannot grow past the map\'s 2 bases', up.lobby || up);
			const toBig = await api('ptpvp-update', { pv: PTPVP_PROTOCOL, id: two.lobby.id, arena: 'plateau' }, tok);
			const grow = await api('ptpvp-update', { pv: PTPVP_PROTOCOL, id: two.lobby.id, size: 4 }, tok);
			A((toBig.lobby || {}).arena === 'plateau' && (grow.lobby || {}).size === 4, 'on a built-in arena (4 bases) it can', [toBig.lobby && toBig.lobby.arena, grow.lobby && grow.lobby.size]);
			const back = await api('ptpvp-update', { pv: PTPVP_PROTOCOL, id: two.lobby.id, arena: 'custom', map: arena }, tok);
			A((back.lobby || {}).arena === 'plateau', 'a 4-player lobby cannot switch to a 2-base made map', back.lobby && back.lobby.arena);
		}
	}
} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
