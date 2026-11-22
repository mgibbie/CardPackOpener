// arenas.js — the maps PvP is played on (owner, 2026-11-22: "PvP up to 4 players"). Written like campaign.js's maps
// (rows / geo / symbols), with FOUR bases instead of one: seat 1 deploys from bases[0], seat 2 from bases[1], ... In a
// two-player match the first two face each other across the map, so bases[0] and bases[1] are opposite corners.
// overworld/tests/poketactica_pvp_test.mjs checks every arena: the bases are tiles, clear, apart, and each one can walk
// to every other.
import { buildMap } from './campaign.js';
import { RULES_REV } from './engine/battle.js';
import { asArena } from './editor.js';

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
].map((a) => Object.freeze(a)));

export const arenaById = (id) => ARENAS.find((a) => a.id === id) || null;

/** The engine's PvP setup: the arena's map and one seat per team ({ team: [fig], cpu? }), in seat order (2-4). */
export function arenaSetup(arena, seats) {
	const map = buildMap({ ...arena, base: arena.bases[0] });
	return { map, pvp: { seats: seats.slice(0, 4).map((s, i) => ({ team: s.team, cpu: !!s.cpu, base: { x: arena.bases[i][0], y: arena.bases[i][1] } })) } };
}

// ---------- online matches (server/ptpvp.mjs keeps the lobby; every device builds the battle from the same config)
/** Bump when a change to the engine or this file would make two devices play the same recipe differently. */
export const PTPVP_PROTOCOL = 3;   // 2: SP from walking (battle.js RULES_REV 2); 3: living terrain, made-map arenas
/** The computer seats' Pokémon (the server picks from these) and names. */
export const CPU_SPECIES = Object.freeze(['pikachu', 'charmander', 'squirtle', 'bulbasaur', 'machop', 'geodude', 'abra', 'gastly', 'eevee', 'growlithe',
	'poliwag', 'oddish', 'magnemite', 'onix', 'cubone', 'scyther', 'pinsir', 'lapras', 'dratini', 'larvitar', 'heracross', 'skarmory', 'houndour', 'phanpy']);
export const CPU_NAMES = Object.freeze(['CPU Blue', 'CPU Green', 'CPU Silver']);
/** Level everyone to this for a fair match ('Levels: 50'), or null to bring your own levels. */
export const PVP_LEVEL = 50;

/** The engine setup for an online match: config = { arena, lv, seats: [{ name, team?, cpu?, picks?, level? }] }. Pure and
 *  deterministic (the computer seats' figurines come from the seed), so every device builds the same battle. */
export function matchSetup(config, seed, data, makeFigurine, makeRng) {
	const arena = config.arena === 'custom' && config.map ? asArena(config.map) : arenaById(config.arena) || ARENAS[0];
	const seats = config.seats.slice(0, 4).map((s, i) => {
		if (s.cpu) return { cpu: true, team: (s.picks || []).slice(0, 6).map((sp, j) => makeFigurine(sp, s.level || PVP_LEVEL, makeRng(seed + ':cpu' + i + ':' + j), data, { id: ('cpu' + i + '-' + j + '-' + sp).slice(0, 60), shinyRate: 0 })) };
		return { team: (s.team || []).slice(0, 6).map((f) => (config.lv ? { ...f, level: config.lv } : f)) };
	});
	return { ...arenaSetup(arena, seats), rev: RULES_REV };
}
