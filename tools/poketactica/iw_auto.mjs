// iw_auto.mjs — a headless auto-player for ITEM WORLD dives played as battles (Plans/POKETACTICA_ITEM_WORLD_IMPROVEMENT_PLAN.md
// item 1): the game's own AI on BOTH sides (engine/ai.js; the player's side deploys and plays as a computer seat does),
// a dive at a time, and it prints how the dives end so the foes' levels can be tuned from numbers and not by eye.
//
// A dive is played as the page plays it: floor after floor from the item's level to its exit floor, the same team all the
// way, a knocked-out figurine GONE for the rest of it (the Item World is deadly), EXP kept between floors, full HP at the
// start of each floor. A floor that runs past --turns counts as lost (a stall).
//   node tools/poketactica/iw_auto.mjs [--items=cheap,mid,dear | charcoal,leftovers] [--from=1,31,61,91] [--ratio=0.8,1,1.2] [--runs=12] [--team=6] [--turns=40]
// --ratio: the team's level against the level of the foes on the dive's EXIT floor (its boss is 5 over).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as B from '../../poketactica/js/engine/battle.js';
import { enemyTurn } from '../../poketactica/js/engine/ai.js';
import { campaignSetup } from '../../poketactica/js/campaign.js';
import { itemFloor, itemFoeLevel, diveFloors, exitFloor, findsOf } from '../../poketactica/js/itemworld.js';
import { applyResults } from '../../poketactica/js/progress.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { HELD } from '../../poketactica/js/goods.js';
import { parseGem } from '../../poketactica/js/gear.js';
import { makeRng } from '../../overworld/rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
export const loadData = () => ({ species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') });

/** The team a player would bring: the three starters' lines, a bird, a mouse and a rock, evolved as far as the level allows. */
const LINES = [['charmander', 16, 'charmeleon', 36, 'charizard'], ['squirtle', 16, 'wartortle', 36, 'blastoise'], ['bulbasaur', 16, 'ivysaur', 32, 'venusaur'],
	['pidgey', 18, 'pidgeotto', 36, 'pidgeot'], ['pikachu', 26, 'raichu'], ['geodude', 25, 'graveler', 38, 'golem']];
export const speciesAt = (line, lv) => { let sp = line[0]; for (let i = 1; i < line.length; i += 2) if (lv >= line[i]) sp = line[i + 1]; return sp; };
export function teamAt(lv, n, data, seed) {
	return LINES.slice(0, n).map((line, i) => makeFigurine(speciesAt(line, lv), Math.max(1, Math.min(999, lv)), makeRng(seed + ':team' + i), data, { id: 'auto-' + i, shinyRate: 0 }));
}

/** The player's phase, played by the enemy AI: every figurine on the map takes its turn, then the reserve deploys one at a
 *  time (each stepping off the base before the next), then the turn ends. */
function playerPhase(S, data) {
	const turn = (u) => { if (S.over || u.hp <= 0 || u.x == null || u.acted) return; enemyTurn(S, u, data, B.AI_API); B.execute(S, data); };
	for (const u of S.units.filter((x) => x.side === 'p' && x.hp > 0 && x.x != null)) turn(u);
	for (const u of S.units.filter((x) => x.side === 'p' && x.hp > 0 && x.x == null)) {
		if (S.over) break;
		const r = B.act(S, { t: 'deploy', uid: u.uid }, data);
		if (!r.ok) break;
		turn(u);
	}
	if (!S.over) B.act(S, { t: 'end' }, data);
}

/** One floor as a battle. -> { won, turns, lost: [figurine ids], res, teamMap } */
export function playFloor(seed, floor, id, team, data, maxTurns = 40) {
	const m = itemFloor(seed, floor, id, data);
	const bseed = 'iw-' + seed + '-f' + floor;
	const setup = { ...campaignSetup(m, team, data, bseed), rev: B.RULES_REV, perma: true };
	const S = B.newBattle(bseed, setup, data), teamMap = {};
	S.units.filter((u) => u.side === 'p').forEach((u, i) => { teamMap[u.uid] = team[i].id; });
	while (!S.over && S.turn <= maxTurns) playerPhase(S, data);
	const lost = S.units.filter((u) => u.side === 'p' && u.hp <= 0).map((u) => teamMap[u.uid]);
	return { won: S.over === 'won', stalled: !S.over, turns: S.turn, lost, res: B.results(S), teamMap };
}

/** A whole dive. -> { cleared, floors (cleared), of, lost (figurines), turns, stalled, gems: [levels found] } */
export function playDive(seed, id, from, team0, data, maxTurns = 40) {
	const floors = diveFloors(from);
	let col = { v: 1, figs: Object.fromEntries(team0.map((f) => [f.id, f])) }, done = 0, lost = 0, turns = 0, stalled = false;
	const gems = [];
	for (const floor of floors) {
		const team = team0.map((f) => col.figs[f.id]).filter(Boolean);
		if (!team.length) break;
		const r = playFloor(seed, floor, id, team, data, maxTurns);
		turns += r.turns; lost += r.lost.length;
		const figs = { ...col.figs }; for (const fid of r.lost) delete figs[fid];
		col = { ...col, figs };
		if (!r.won) { stalled = r.stalled; break; }
		col = { ...applyResults(col, r.teamMap, { ...r.res, bonus: [], captured: [] }, { data, rng: makeRng(seed + ':res' + floor), seed: 'auto' }).col, v: 1 };
		for (const f of findsOf(seed, floor)) if (f.k === 'gem') gems.push(parseGem(f.gem).lv);
		done++;
	}
	return { cleared: done === floors.length, floors: done, of: floors.length, lost, turns, stalled, gems, endLevel: Math.round(Object.values(col.figs).reduce((a, f) => a + f.level, 0) / Math.max(1, Object.keys(col.figs).length)) };
}

const TIERS = { cheap: 'oranberry', mid: 'charcoal', dear: 'leftovers' };
function main() {
	const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
	const data = loadData();
	const items = arg('items', 'cheap,mid,dear').split(',').map((x) => TIERS[x] || x).filter((x) => HELD[x]);
	const froms = arg('from', '1,31,61,91').split(',').map(Number), ratios = arg('ratio', '1,1.25,1.5').split(',').map(Number);
	const runs = +arg('runs', 12), n = +arg('team', 6), maxTurns = +arg('turns', 40);
	console.log('item (stars)          from→exit  foes Lv      team Lv  ratio | clears   floors  lost/dive  turns/floor  stalls | gems (avg lv)');
	for (const id of items) for (const from of froms) for (const ratio of ratios) {
		const first = itemFoeLevel(from + 1, id), last = itemFoeLevel(exitFloor(from), id, true), lv = Math.max(1, Math.round(itemFoeLevel(exitFloor(from), id) * ratio));
		let cl = 0, fl = 0, lost = 0, turns = 0, st = 0, gl = 0, gn = 0, of = 0;
		for (let i = 0; i < runs; i++) {
			const seed = 'auto' + id.slice(0, 6) + from + 'r' + i;
			const r = playDive(seed, id, from, teamAt(lv, n, data, seed), data, maxTurns);
			cl += r.cleared ? 1 : 0; fl += r.floors; of = r.of; lost += r.lost; turns += r.turns / Math.max(1, r.floors + (r.cleared ? 0 : 1)); st += r.stalled ? 1 : 0; gl += r.gems.reduce((a, b) => a + b, 0); gn += r.gems.length;
		}
		console.log(`${(HELD[id].name + ' (' + HELD[id].stars + ')').padEnd(22)}${(from + '→' + exitFloor(from)).padEnd(11)}${(first + '–' + last).padEnd(13)}${String(lv).padEnd(9)}${ratio.toFixed(2).padEnd(6)}| ${(Math.round(100 * cl / runs) + '%').padEnd(9)}${((fl / runs).toFixed(1) + '/' + of).padEnd(8)}${(lost / runs).toFixed(1).padEnd(11)}${(turns / runs).toFixed(1).padEnd(13)}${String(st).padEnd(7)}| ${gn ? (gl / gn).toFixed(1) : '-'}`);
	}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
