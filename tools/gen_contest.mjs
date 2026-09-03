// gen_contest.mjs — harvest the Pokémon Contest data from pokeemerald into
// overworld/data/contest.json (deployed with owdata):
//
//   * per-move contest data (gContestMoves × gContestEffects, flattened): the
//     category, appeal/jam numbers, effect name, and combo graph
//   * the 96 real contest opponents (gContestOpponents): species, nickname,
//     trainer, rank, category pools, movesets, and their condition stats
//   * berry flavors (gBerries): spicy/dry/sweet/bitter/sour/smoothness — the
//     inputs to the simplified Pokéblock (berry feeding raises condition)
//
// Move/species ids translate mechanically: MOVE_DOUBLE_SLAP -> 'doubleslap',
// SPECIES_POOCHYENA -> 'poochyena' — the same convention the transpile used.
// Opponents whose species this build doesn't know are dropped (none expected).
//
//   node tools/gen_contest.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const EM = 'C:/Users/guide/Desktop/Magepunk66/Reference/pokeemerald';
const OUT = path.join(ROOT, 'overworld/data/contest.json');

const lc = s => s.toLowerCase().replace(/_/g, '');
const CAT = { CONTEST_CATEGORY_COOL: 'cool', CONTEST_CATEGORY_BEAUTY: 'beauty', CONTEST_CATEGORY_CUTE: 'cute', CONTEST_CATEGORY_SMART: 'smart', CONTEST_CATEGORY_TOUGH: 'tough' };
const RANK = { CONTEST_RANK_NORMAL: 0, CONTEST_RANK_SUPER: 1, CONTEST_RANK_HYPER: 2, CONTEST_RANK_MASTER: 3, CONTEST_RANK_LINK: -1 };

// ---------- effects ----------
const movesSrc = fs.readFileSync(path.join(EM, 'src/data/contest_moves.h'), 'utf8');
const fxSrc = movesSrc.slice(movesSrc.indexOf('gContestEffects[]'));
const effects = {};
for (const m of fxSrc.matchAll(/\[CONTEST_EFFECT_(\w+)\] =\s*\{\s*\.effectType = (\w+),\s*\.appeal = (\d+),\s*\.jam = (\d+),/g)) {
	effects[m[1]] = { type: m[2].replace('CONTEST_EFFECT_TYPE_', ''), appeal: +m[3], jam: +m[4] };
}
if (!Object.keys(effects).length) throw new Error('no effects parsed');

// ---------- moves ----------
const moves = {};
const movesBody = movesSrc.slice(0, movesSrc.indexOf('gContestEffects[]'));
for (const m of movesBody.matchAll(/\[MOVE_(\w+)\] =\s*\{([^}]*?\})\s*,?\s*\}/gs)) {
	const id = lc(m[1]), body = m[2];
	if (id === 'none') continue;
	const fx = body.match(/\.effect = CONTEST_EFFECT_(\w+)/)?.[1];
	const cat = CAT[body.match(/\.contestCategory = (\w+)/)?.[1]];
	if (!fx || !cat || !effects[fx]) continue;
	const starter = body.match(/\.comboStarterId = COMBO_STARTER_(\w+)/)?.[1] || null;
	const combos = [...body.matchAll(/COMBO_STARTER_(\w+)/g)].map(x => x[1]).filter(x => x !== starter || body.indexOf('comboMoves') < body.indexOf('COMBO_STARTER_' + x));
	// comboMoves only: re-parse from the comboMoves block to avoid picking up the starter
	const cm = body.match(/\.comboMoves = \{([^}]*)\}/)?.[1] || '';
	const comboMoves = [...cm.matchAll(/COMBO_STARTER_(\w+)/g)].map(x => lc(x[1]));
	moves[id] = { cat, fx, appeal: effects[fx].appeal, jam: effects[fx].jam, type: effects[fx].type,
		...(starter ? { starter: lc(starter) } : {}), ...(comboMoves.length ? { combos: comboMoves } : {}) };
}
if (Object.keys(moves).length < 300) throw new Error('too few contest moves: ' + Object.keys(moves).length);

// ---------- opponents ----------
const knownSpecies = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_index.json'), 'utf8'))));
const oppSrc = fs.readFileSync(path.join(EM, 'src/data/contest_opponents.h'), 'utf8');
const opponents = [];
let dropped = 0;
for (const m of oppSrc.matchAll(/\[CONTEST_OPPONENT_\w+\] = \{(.*?)\.otId =/gs)) {
	const b = m[1];
	const species = lc(b.match(/\.species = SPECIES_(\w+)/)?.[1] || '');
	const rank = RANK[b.match(/\.whichRank = (\w+)/)?.[1]];
	if (rank == null || rank < 0) continue; // link-contest-only opponents stay out (link play is excluded)
	if (!knownSpecies.has(species)) { dropped++; continue; }
	const pools = {};
	for (const c of ['Cool', 'Beauty', 'Cute', 'Smart', 'Tough'])
		if (new RegExp(`\\.aiPool_${c} = TRUE`).test(b)) pools[c.toLowerCase()] = 1;
	const mv = [...(b.match(/\.moves =\s*\{([^}]*)\}/s)?.[1] || '').matchAll(/MOVE_(\w+)/g)].map(x => lc(x[1])).filter(x => x !== 'none');
	opponents.push({
		species,
		nick: b.match(/\.nickname = _\("([^"]*)"\)/)?.[1] || species.toUpperCase(),
		trainer: b.match(/\.trainerName = _\("([^"]*)"\)/)?.[1] || '???',
		rank, pools, moves: mv,
		cond: Object.fromEntries(['cool', 'beauty', 'cute', 'smart', 'tough'].map(k => [k, +(b.match(new RegExp(`\\.${k} = (\\d+)`))?.[1] || 0)])),
		sheen: +(b.match(/\.sheen = (\d+)/)?.[1] || 0),
	});
}
if (opponents.length < 80) throw new Error('too few opponents: ' + opponents.length + ' (dropped ' + dropped + ')');

// ---------- berries ----------
const berrySrc = fs.readFileSync(path.join(EM, 'src/berry.c'), 'utf8');
const berries = {};
for (const m of berrySrc.matchAll(/\{\s*\.name = _\("([A-Z]+)"\)(.*?)\.smoothness = (\d+),/gs)) {
	const id = m[1].toLowerCase() + 'berry', b = m[2];
	const f = k => +(b.match(new RegExp(`\\.${k} = (\\d+)`))?.[1] || 0);
	berries[id] = { spicy: f('spicy'), dry: f('dry'), sweet: f('sweet'), bitter: f('bitter'), sour: f('sour'), smooth: +m[3] };
}
if (!berries.cheriberry || !berries.enigmaberry) throw new Error('berry parse failed');
// the gen-2-era berries this build also stocks alias to their closest flavor
for (const [ours, theirs] of [
	['psncureberry', 'pechaberry'], ['przcureberry', 'cheriberry'], ['bitterberry', 'persimberry'],
	['mysteryberry', 'leppaberry'], ['berry', 'oranberry'], ['goldberry', 'sitrusberry'],
]) if (berries[theirs]) berries[ours] = { ...berries[theirs] };

const out = { moves, opponents, berries };
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`contest.json: ${Object.keys(moves).length} moves, ${opponents.length} opponents (${dropped} dropped), ${Object.keys(berries).length} berries -> ${OUT}`);
