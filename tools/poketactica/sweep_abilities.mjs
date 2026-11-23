// sweep_abilities.mjs — THE ABILITIES SWEEP (owner, 2026-11-23: every ability checked). Each of the abilities a species
// can have is put on a unit and played through a fixed set of scenes, next to the same unit with NO ability and the same
// dice. Where the two differ, the ability did something; the cell lists the scenes it showed in:
//   stats    its numbers as a unit (how far it moves, jumps ...)
//   enter    landing on the board next to foes (Intimidate, the weather setters, the Surges)
//   attack   it attacks: 34 moves of every type and kind (contact, sound, punch, bite, priority, multi-hit, status ...),
//            at full HP, at a quarter HP, burned, poisoned, and in each weather
//   defend   it is attacked with the same moves (and what the attacker suffers for touching it)
//   upkeep   the end of its side's phase: healthy, with each status, at low HP, in each weather
//   aura     what it does to units near it without acting (Pressure, Friend Guard, Damp, Victory Star, the trappers)
//   ko       it knocks a foe out / it is knocked out
// An EMPTY cell is an ability that changes nothing in a turn-based battle. (Mystery Maze and Tower Defense fight by the
// same engine: mm/combat.js and td/sim.js call the battle's own hit, so this column stands for the hit itself there; the
// entry, upkeep and aura scenes are the turn-based battle's.)
//   node tools/poketactica/sweep_abilities.mjs            print the summary
//   node tools/poketactica/sweep_abilities.mjs --write    also write poketactica/data/ability_sweep.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as B from '../../poketactica/js/engine/battle.js';
import * as Ab from '../../poketactica/js/engine/abilities.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../../overworld/rules/rng.js';
import { loadData } from './sweep_moves.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOLDER = 'mew', FOE = 'squirtle', ALLY = 'eevee';
const MOVES = ['tackle', 'quickattack', 'bodyslam', 'doubleedge', 'furyattack', 'hypervoice', 'swift', 'machpunch', 'aurasphere', 'firepunch', 'flamethrower', 'waterfall', 'watergun', 'vinewhip', 'gigadrain',
	'thunderpunch', 'thunderbolt', 'icepunch', 'icebeam', 'poisonjab', 'sludgebomb', 'earthquake', 'wingattack', 'psychic', 'bugbite', 'rockslide', 'shadowball', 'dragonclaw', 'crunch', 'ironhead', 'moonblast',
	'slash', 'nightslash', 'xscissor', 'hydropump', 'thunder', 'stoneedge', 'focusblast', 'fissure', 'pinmissile', 'bulletseed', 'megapunch', 'bite', 'explosion', 'surf', 'razorleaf',
	'thunderwave', 'toxic', 'growl', 'confuseray', 'swagger', 'spore', 'willowisp', 'leer', 'stunspore', 'attract'];
const FEW = ['tackle', 'flamethrower', 'watergun', 'thunderbolt', 'icebeam', 'earthquake', 'gigadrain'];
const WEATHERS = ['sun', 'rain', 'sand', 'hail'], STATUSES = ['brn', 'psn', 'par', 'slp', 'frz'];
const DICE = ['a', 'b', 'c', 'd', 'e'];
const W = 9, H = 9;

const fig = (sp, lv, data, tag, ability) => ({ ...makeFigurine(sp, lv, makeRng(sp + tag), data, { id: sp + '-' + tag, shinyRate: 0 }), ability, ...(sp === ALLY ? { equipped: [] } : {}) });
/** A board: the holder (the player's) to deploy at the base (4, 5); foes at (4, 4), (4, 3), (5, 5); an ally at (3, 5). */
function board(ability, data, deploy = true) {
	const map = { w: W, h: H, height: Array(W * H).fill(0), base: { x: 4, y: 5 }, ground: Array(W * H).fill(null) };
	const S = B.newBattle('ab', { map, rev: B.RULES_REV, noBonus: true, player: [fig(HOLDER, 50, data, 'h', ability), fig(ALLY, 50, data, 'a', null)],
		enemy: [[4, 4], [4, 3], [5, 5]].map(([x, y], i) => ({ fig: fig(FOE, 50, data, 'f' + i, null), x, y, ai: 'hold' })) }, data);
	const ally = S.units[1]; ally.x = 3; ally.y = 5;
	if (deploy) B.act(S, { t: 'deploy', uid: S.units[0].uid }, data);
	if (S.units[0].x == null) { S.units[0].x = 4; S.units[0].y = 5; }
	return S;
}
const SKIP = new Set(['fig', 'uid', 'side', 'species', 'ai', 'ability']);
const print = (S, extra) => JSON.stringify({ u: S.units.map((u) => Object.fromEntries(Object.entries(u).filter(([k]) => !SKIP.has(k)))), f: S.field, g: S.map.ground, geo: S.geo, over: S.over, extra });
const dice = (S, d) => { S.rng = makeRng('ab-' + d).state(); };

/** Every scene, as [name, fingerprint] for one ability (null: the control). */
function scenes(ability, data) {
	const out = [];
	const base = board(ability, data), h0 = base.units[0];
	out.push(['stats', JSON.stringify({ move: h0.move, jump: h0.jump === Infinity ? 'inf' : h0.jump, stats: h0.stats, maxHP: h0.maxHP, maxSP: h0.maxSP, lift: h0.lift, throw: h0.throw, moveNow: B.moveNow(base, h0) })]);
	out.push(['enter', print(base, base.log.map((e) => e.t))]);
	const tweak = { full: () => {}, low: (u) => { u.hp = Math.max(1, Math.floor(u.maxHP / 4)); }, brn: (u) => { u.status = 'brn'; }, psn: (u) => { u.status = 'psn'; } };
	const run = (name, setup, go) => {
		const res = [];
		for (const d of DICE) { const S = structuredClone(base); S.log = []; setup(S); dice(S, d); let err = null; try { go(S); } catch (e) { err = String(e.message || e).slice(0, 80); } res.push(print(S, err || S.log.map((e) => e.t + (e.ab ? ':' + e.ab : '')))); }
		out.push([name, res.join('|')]);
	};
	// attack / defend
	for (const [tw, f] of Object.entries(tweak)) for (const mv of (tw === 'full' || tw === 'low' ? MOVES : FEW)) {
		run('attack', (S) => f(S.units[0]), (S) => B.useMoveAt(S, S.units[0], { move: mv, x: 4, y: 4 }, data));
		run('defend', (S) => f(S.units[0]), (S) => B.useMoveAt(S, S.units[2], { move: mv, x: 4, y: 5 }, data));
	}
	for (const w of WEATHERS) for (const mv of FEW) {
		run('attack', (S) => { S.field.weather = { kind: w, turns: 5 }; }, (S) => B.useMoveAt(S, S.units[0], { move: mv, x: 4, y: 4 }, data));
		run('defend', (S) => { S.field.weather = { kind: w, turns: 5 }; }, (S) => B.useMoveAt(S, S.units[2], { move: mv, x: 4, y: 5 }, data));
	}
	// its target is poisoned / asleep / has raised its stats; a blow that would fell it from full HP; a foe behind it
	for (const mv of FEW) {
		run('attack', (S) => { S.units[2].status = 'psn'; }, (S) => B.useMoveAt(S, S.units[0], { move: mv, x: 4, y: 4 }, data));
		run('attack', (S) => { S.units[2].status = 'slp'; S.units[2].sleepTurns = 3; }, (S) => B.useMoveAt(S, S.units[0], { move: mv, x: 4, y: 4 }, data));
		run('attack', (S) => { S.units[2].boosts.def = 2; S.units[2].boosts.eva = 2; S.units[0].boosts.atk = -2; }, (S) => B.useMoveAt(S, S.units[0], { move: mv, x: 4, y: 4 }, data));
		run('defend', (S) => { S.units[2].stats = { ...S.units[2].stats, atk: 9999, spa: 9999 }; }, (S) => B.useMoveAt(S, S.units[2], { move: mv, x: 4, y: 5 }, data));
		run('defend', (S) => { S.units[2].boosts.atk = 2; S.units[2].boosts.spa = 2; S.units[0].boosts.def = -2; }, (S) => B.useMoveAt(S, S.units[2], { move: mv, x: 4, y: 5 }, data));
	}
	// the holder's stat stages moved by a foe, and its own
	run('defend', () => {}, (S) => { B.shift(S, S.units[0], { atk: -1 }); B.shift(S, S.units[0], { def: 1 }); });
	for (const st of STATUSES) run('defend', () => {}, (S) => B.inflict(S, S.units[2], S.units[0], st));
	// upkeep: the end of its side's phase
	const end = (S) => B.act(S, { t: 'end' }, data);
	run('upkeep', () => {}, end);
	run('upkeep', (S) => tweak.low(S.units[0]), end);
	for (const st of STATUSES) run('upkeep', (S) => { S.units[0].status = st; if (st === 'slp') S.units[0].sleepTurns = 3; S.units[0].hp = Math.floor(S.units[0].maxHP / 2); }, end);
	for (const w of WEATHERS) run('upkeep', (S) => { S.field.weather = { kind: w, turns: 5 }; S.units[0].hp = Math.floor(S.units[0].maxHP / 2); }, end);
	// aura: what it does to the units near it without acting
	{
		const S = base, foe = S.units[2], ally = S.units[1];
		out.push(['aura', JSON.stringify({ pressure: Ab.pressureExtra(S, foe, data), guard: Ab.allyGuard(S, ally, data), damp: Ab.dampNear(S, foe, data), acc: Ab.accuracyAura(S, ally, data), trap: Ab.trappedMove(S, foe, data) ?? null, foeMove: B.moveNow(S, foe),
			pullE: !!Ab.pullTarget(S, foe, B.moveOf(foe, 'thunderbolt', data), ally.x, ally.y, data), pullW: !!Ab.pullTarget(S, foe, B.moveOf(foe, 'watergun', data), ally.x, ally.y, data) })]);
	}
	// ko: it knocks a foe out; it is knocked out (by a contact move)
	run('ko', (S) => { S.units[2].hp = 1; }, (S) => B.useMoveAt(S, S.units[0], { move: 'tackle', x: 4, y: 4 }, data));
	run('ko', (S) => { S.units[0].hp = 1; }, (S) => B.useMoveAt(S, S.units[2], { move: 'tackle', x: 4, y: 5 }, data));
	return out;
}

/** The whole sweep. -> { abilityId: [scene, ...] } (the scenes where it differs from having no ability) */
export function sweepAbilities(data, only) {
	const ids = [...new Set(Object.values(data.abilities).flatMap((v) => (Array.isArray(v) ? v : [])))].sort();
	const control = scenes(null, data), out = {};
	for (const id of ids) {
		if (only && !only.includes(id)) continue;
		const mine = scenes(id, data), did = new Set();
		mine.forEach(([name, fp], i) => { if (fp !== control[i][1]) did.add(name); });
		out[id] = [...did].sort();
	}
	return out;
}
export const deadAbilities = (R) => Object.keys(R).filter((id) => !R[id].length);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const data = loadData(), t0 = Date.now(), R = sweepAbilities(data), dead = deadAbilities(R);
	const by = {}; for (const id of Object.keys(R)) for (const s of R[id]) by[s] = (by[s] || 0) + 1;
	console.log(`${Object.keys(R).length} abilities, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
	console.log(`do something: ${Object.keys(R).length - dead.length}; change nothing: ${dead.length}`);
	console.log('by scene: ' + Object.entries(by).map(([k, n]) => k + ' ' + n).join(', '));
	console.log('nothing: ' + dead.join(' '));
	if (process.argv.includes('--write')) { fs.writeFileSync(path.join(ROOT, 'poketactica/data/ability_sweep.json'), '{\n' + Object.keys(R).map((id) => `\t${JSON.stringify(id)}: ${JSON.stringify(R[id])}`).join(',\n') + '\n}\n'); console.log('wrote poketactica/data/ability_sweep.json'); }
}
