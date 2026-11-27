// arenas.js — the maps PvP is played on (owner, 2026-11-22: "PvP up to 4 players"). Written like campaign.js's maps
// (rows / geo / symbols), with FOUR bases instead of one: seat 1 deploys from bases[0], seat 2 from bases[1], ... In a
// two-player match the first two face each other across the map, so bases[0] and bases[1] are opposite corners.
// overworld/tests/poketactica_pvp_test.mjs checks every arena: the bases are tiles, clear, apart, and each one can walk
// to every other.
import { buildMap, foeFigure } from './campaign.js';
import { RULES_REV } from './engine/battle.js';
import { asArena } from './editor.js';

/**
 * MAPS MADE FOR TWO (Plans/POKETACTICA_MODES_PLAN.md item V4). The first three arenas seat up to four, so two players
 * start a long walk apart with half the board idle. A DUEL arena (`two: true`) is a small board, 8 by 8, for two only:
 * the same from either seat. Each is drawn as one quarter (a 4 by 4 corner, itself the same across its diagonal) and
 * mirrored into the other three, so no seat has a better side.
 */
const whole = (q) => { const top = q.map((r) => r + [...r].reverse().join('')); return [...top, ...top.slice().reverse()]; };
const duel = (a) => ({ ...a, two: true, rows: whole(a.rows), ground: whole(a.ground), ...(a.geo ? { geo: whole(a.geo) } : {}), bases: [[0, 7], [7, 0], [0, 0], [7, 7]] });
export const ARENAS = Object.freeze([
	{ id: 'plateau', name: 'Indigo Plateau', tip: 'Flat ground, a raised centre. Hold the middle.',
		rows: [
			'..........',
			'..........',
			'..........',
			'....11....',
			'...1221...',
			'...1221...',
			'....11....',
			'..........',
			'..........',
			'..........',
		],
		theme: 'meadow',
		ground: [
			'dd..ww..dd',
			'd.t....t.d',
			'.tt....tt.',
			'..........',
			'w...ss...w',
			'w...ss...w',
			'..........',
			'.tt....tt.',
			'd.t....t.d',
			'dd..ww..dd',
		],
		bases: [[0, 9], [9, 0], [0, 0], [9, 9]] },
	{ id: 'crossroads', name: 'Crossroads', tip: 'Four ledges round a sunken square: the high ground has the reach.',
		rows: [
			'.....##.....',
			'.22.....22..',
			'.22.....22..',
			'............',
			'.....11.....',
			'#...1..1...#',
			'#...1..1...#',
			'.....11.....',
			'............',
			'..22.....22.',
			'..22.....22.',
			'.....##.....',
		],
		theme: 'ruins',
		ground: [
			'gg..t....tgg',
			'ggg...t.gg..',
			'.gg..tt.gg.t',
			'..dddddddd..',
			'..d......d..',
			'..d..ww..d..',
			'..d..ww..d..',
			'..d......d..',
			'..dddddddd..',
			't.gg.tt..gg.',
			'..gg.t...ggg',
			'ggt....t..gg',
		],
		bases: [[0, 11], [11, 0], [0, 0], [11, 11]] },
	{ id: 'garden', name: 'Geo Garden', tip: 'Coloured panels: a Geo Symbol\'s colour powers every panel of it, for every side. Break them to blast the others.',
		rows: [
			'...........',
			'...........',
			'..1.....1..',
			'...........',
			'.....2.....',
			'....222....',
			'.....2.....',
			'...........',
			'..1.....1..',
			'...........',
			'...........',
		],
		geo: [
			'...........',
			'.rrr...bbb.',
			'.rrr...bbb.',
			'.rrr...bbb.',
			'...........',
			'...........',
			'...........',
			'.bbb...rrr.',
			'.bbb...rrr.',
			'.bbb...rrr.',
			'...........',
		],
		symbols: [{ x: 2, y: 2, color: 'clear', effect: { k: 'stat', stat: 'atk', mult: 1.5 } }, { x: 8, y: 8, color: 'clear', effect: { k: 'stat', stat: 'atk', mult: 1.5 } }, { x: 8, y: 2, color: 'clear', effect: { k: 'stat', stat: 'def', mult: 1.5 } }, { x: 2, y: 8, color: 'clear', effect: { k: 'stat', stat: 'def', mult: 1.5 } }],
		theme: 'meadow',
		ground: [
			'dd..t.t..dd',
			'd....w....d',
			'.....w.....',
			'...........',
			't....s....t',
			'.ww.sss.ww.',
			't....s....t',
			'...........',
			'.....w.....',
			'd....w....d',
			'dd..t.t..dd',
		],
		bases: [[0, 10], [10, 0], [0, 0], [10, 10]] },
	duel({ id: 'duel-hill', name: 'King of the Hill', tip: 'Made for two. One hill in the middle, two levels high: whoever holds it reaches further.', theme: 'meadow',
		rows: ['....', '.1..', '..1.', '...2'], ground: ['d...', '.t..', '..s.', '...s'] }),
	duel({ id: 'duel-moat', name: 'The Moat', tip: 'Made for two. Water cuts the short way through the middle: wade it slowly, or go round by the corners.', theme: 'islands',
		rows: ['....', '....', '....', '...1'], ground: ['a...', '..w.', '.w..', '...s'] }),
	duel({ id: 'duel-prism', name: 'Prism Court', tip: 'Made for two. Blue corners and a red middle: a symbol stands on each blue court. Break the one on your foe\'s side first.', theme: 'ruins',
		rows: ['....', '....', '....', '...1'], ground: ['s...', '....', '....', '....'], geo: ['....', '.bb.', '.brr', '..rr'],
		symbols: [{ x: 1, y: 1, color: 'clear', effect: { k: 'stat', stat: 'atk', mult: 1.5 } }, { x: 6, y: 6, color: 'clear', effect: { k: 'stat', stat: 'atk', mult: 1.5 } }, { x: 6, y: 1, color: 'clear', effect: { k: 'stat', stat: 'def', mult: 1.5 } }, { x: 1, y: 6, color: 'clear', effect: { k: 'stat', stat: 'def', mult: 1.5 } }] }),
].map((a) => Object.freeze(a)));
/** How many players an arena seats: 2 for a duel arena, else 4. */
export const arenaSeats = (a) => (a && a.two ? 2 : 4);

export const arenaById = (id) => ARENAS.find((a) => a.id === id) || null;

/** The engine's PvP setup: the arena's map and one seat per team ({ team: [fig], cpu? }), in seat order (2-4); wild foes
 *  ([{ fig, x, y, ai }], a made map's) fight every side. */
export function arenaSetup(arena, seats, foes = []) {
	const map = buildMap({ ...arena, base: arena.bases[0] });
	return { map, pvp: { seats: seats.slice(0, 4).map((s, i) => ({ team: s.team, cpu: !!s.cpu, base: { x: arena.bases[i][0], y: arena.bases[i][1] } })), ...(foes.length ? { foes } : {}) } };
}

// ---------- online matches (server/ptpvp.mjs keeps the lobby; every device builds the battle from the same config)
/** Bump when a change to the engine or this file would make two devices play the same recipe differently. */
export const PTPVP_PROTOCOL = 13;   // 13: three duel arenas (an older build does not know them: plan item V4); 12: hazards, knockback (RULES_REV 11); 11: 40 more moves (RULES_REV 10); 10: Protect lasts until its user's next turn (RULES_REV 9); 9: the second batch of abilities (RULES_REV 8); 8: 45 more abilities (RULES_REV 7); 7: marks that last (RULES_REV 6); 6: more status moves, Counter's kin (RULES_REV 5); 5: worked-out powers (battle.js RULES_REV 4); 2: SP from walking (battle.js RULES_REV 2); 3: living terrain, made-map arenas; 4: wild foes on made maps
/** The computer seats' Pokémon (the server picks from these) and names. */
export const CPU_SPECIES = Object.freeze(['pikachu', 'charmander', 'squirtle', 'bulbasaur', 'machop', 'geodude', 'abra', 'gastly', 'eevee', 'growlithe',
	'poliwag', 'oddish', 'magnemite', 'onix', 'cubone', 'scyther', 'pinsir', 'lapras', 'dratini', 'larvitar', 'heracross', 'skarmory', 'houndour', 'phanpy']);
export const CPU_NAMES = Object.freeze(['CPU Blue', 'CPU Green', 'CPU Silver']);
/** Level everyone to this for a fair match ('Levels: 50'), or null to bring your own levels. */
export const PVP_LEVEL = 50;

/**
 * A CAPPED MATCH (owner, 2026-11-24: "optional and off by default"; the Item World plan item 14): a held item's level
 * and its plush gemstones do not count. Every held item plays as a plain level 1 one. A level 100 item with eight level
 * 100 gemstones decides a match before it starts; the host may switch that off for a match.
 */
export const plainFig = (f) => { if (!f || !f.gear) return f; const g = { ...f }; delete g.gear; return g; };
/** The engine setup for an online match: config = { arena, lv, plain?, seats: [{ name, team?, cpu?, picks?, level? }] }. Pure and
 *  deterministic (the computer seats' figurines come from the seed), so every device builds the same battle. */
export function matchSetup(config, seed, data, makeFigurine, makeRng) {
	const arena = config.arena === 'custom' && config.map ? asArena(config.map) : arenaById(config.arena) || ARENAS[0];
	const seats = config.seats.slice(0, 4).map((s, i) => {
		if (s.cpu) return { cpu: true, team: (s.picks || []).slice(0, 6).map((sp, j) => makeFigurine(sp, s.level || PVP_LEVEL, makeRng(seed + ':cpu' + i + ':' + j), data, { id: ('cpu' + i + '-' + j + '-' + sp).slice(0, 60), shinyRate: 0 })) };
		return { team: (s.team || []).slice(0, 6).map((f) => (config.lv ? { ...f, level: config.lv } : f)).map((f) => (config.plain ? plainFig(f) : f)) };
	});
	// a made map's wild foes, from the seed (a species this page does not know is left out: every page has the same data)
	const foes = (arena.foes || []).filter((f) => data.species[f.sp]).map((f, i) => ({ fig: foeFigure(f, data, seed + ':wild' + i), x: f.x, y: f.y, ai: f.ai || 'aggro' }));
	return { ...arenaSetup(arena, seats, foes), rev: RULES_REV };
}
