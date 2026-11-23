// sweep_items.mjs — THE HELD ITEMS SWEEP (owner, 2026-11-23: every move, ability and held item checked in every mode).
// Each held item (poketactica/js/goods.js HELD) is put on a unit and played next to the same unit holding NOTHING, with
// the same dice, in each of the three ways the game fights:
//   turn   a turn-based battle (Story, Dungeon, Versus, Training): the abilities sweep's scenes (sweep_abilities.mjs:
//          stats, enter, attack, defend, upkeep, aura, ko), with a holder that learns anything and one that can still evolve
//   maze   Mystery Maze: the leader holds it. attack (it strikes a wild Pokémon), defend (one strikes it, with damage and
//          with status moves), wait (40 of its turns go by: hurt, poisoned, burned), ko, pp (a move on its last PP)
//   td     Tower Defense: a tower holds it and fires at the first waves (a tower has no HP and keeps no status there)
// A cell lists the scenes where the item made a difference; an EMPTY cell is an item that does nothing in that mode.
//   node tools/poketactica/sweep_items.mjs            print the summary
//   node tools/poketactica/sweep_items.mjs --write    also write poketactica/data/item_sweep.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as B from '../../poketactica/js/engine/battle.js';
import * as MM from '../../poketactica/js/mm/turn.js';
import * as TD from '../../poketactica/js/td/sim.js';
import { tdMapById } from '../../poketactica/js/td/maps.js';
import { HELD } from '../../poketactica/js/goods.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../../overworld/rules/rng.js';
import { loadData, mazeRun } from './sweep_moves.mjs';
import { aimsOf } from '../../poketactica/js/mm/combat.js';
import { scenes } from './sweep_abilities.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOLDERS = ['mew', 'dragonair'];   // (the second can still evolve: Eviolite)
const FEW = ['tackle', 'flamethrower', 'watergun', 'thunderbolt', 'icebeam', 'earthquake', 'gigadrain', 'machpunch', 'sludgebomb', 'wingattack', 'psychic', 'bugbite', 'rockslide', 'shadowball', 'dragonclaw', 'crunch', 'ironhead', 'vinewhip'];
const STATUS = ['thunderwave', 'toxic', 'willowisp', 'spore', 'confuseray', 'growl'];
const DICE = ['a', 'b', 'c'], MANY = 'abcdefghijkl'.split('');
const SHAKY = ['thunder', 'hydropump', 'stoneedge', 'focusblast', 'megakick'];
// (weak moves of every type for a tower: so a stronger hit shows as enemies falling sooner)
const WEAK = ['tackle', 'ember', 'watergun', 'thundershock', 'powdersnow', 'mudslap', 'absorb', 'karatechop', 'poisonsting', 'peck', 'confusion', 'furycutter', 'rockthrow', 'lick', 'twister', 'bite', 'metalclaw', 'fairywind', 'zapcannon', 'megakick'];   // (and two that often miss: Wide Lens)

// ---------- turn-based
function turnScenes(id, data) {
	const out = [];
	for (const holder of HOLDERS) for (const [name, fp] of scenes(null, data, { held: id, holder })) out.push([name, fp]);
	return out;
}

// ---------- Mystery Maze
const mPrint = (S) => JSON.stringify([S.units.map((u) => [u.hp, u.status, u.boosts, u.confused, !!u.heldUsed, u.pp, u.x, u.y]), S.exp, S.B.exp]);
function mazeScenes(id, data) { return HOLDERS.flatMap((h) => mazeScenesOf(id, data, h)); }
function mazeScenesOf(id, data, holder) {
	const out = [];
	const run = (name, setup, go, dice = DICE) => {
		const res = [];
		for (const d of dice) {
			const S = mazeRun(data, id, holder), L = MM.leaderOf(S), foe = MM.wildOf(S).find((w) => Math.abs(w.x - L.x) + Math.abs(w.y - L.y) === 1);
			setup(S, L, foe); S.B.rng = makeRng('item-' + d).state();
			let err = null; try { go(S, L, foe); } catch (e) { err = String(e.message || e).slice(0, 80); }
			res.push(mPrint(S) + (err || ''));
		}
		out.push([name, res.join('|')]);
	};
	const L0 = MM.leaderOf(mazeRun(data, id, holder));
	out.push(['stats', JSON.stringify([L0.stats, L0.maxHP, L0.move, L0.stage])]);
	const tough = (S, L, foe) => { foe.maxHP = foe.hp = 9999; };   // (so a stronger hit shows instead of both being a knockout)
	for (const mv of FEW) {
		run('attack', tough, (S, L, foe) => B.useMoveAt(S.B, L, { move: mv, x: foe.x, y: foe.y }, data));
		if (mv === 'tackle' || mv === 'gigadrain') run('attack', (S, L, foe) => { tough(S, L, foe); L.hp = Math.floor(L.maxHP / 2); }, (S, L, foe) => B.useMoveAt(S.B, L, { move: mv, x: foe.x, y: foe.y }, data));
		run('defend', (S, L) => { L.hp = Math.floor(L.maxHP / 2) + 3; }, (S, L, foe) => B.useMoveAt(S.B, foe, { move: mv, x: L.x, y: L.y }, data));
	}
	for (const mv of ['tackle', 'flamethrower']) {
		run('defend', (S, L, foe) => { foe.stats = { ...foe.stats, atk: 99999, spa: 99999 }; }, (S, L, foe) => B.useMoveAt(S.B, foe, { move: mv, x: L.x, y: L.y }, data), MANY);
	}
	run('ko', (S, L, foe) => { foe.hp = 1; }, (S, L, foe) => { for (let i = 0; i < 4 && foe.hp > 0; i++) MM.act(S, { t: 'attack' }, data); });
	for (const mv of STATUS) run('defend', () => {}, (S, L, foe) => { B.useMoveAt(S.B, foe, { move: mv, x: L.x, y: L.y }, data); B.useMoveAt(S.B, foe, { move: 'tackle', x: L.x, y: L.y }, data); });
	for (const st of ['brn', 'psn', 'par', 'slp', 'frz']) run('defend', () => {}, (S, L, foe) => B.inflict(S.B, foe, L, st));
	for (const mv of SHAKY) {   // (moves that often miss: Wide Lens, BrightPowder)
		run('attack', (S, L, foe) => { tough(S, L, foe); L.stats = { ...L.stats, spe: 1 }; }, (S, L, foe) => B.useMoveAt(S.B, L, { move: mv, x: foe.x, y: foe.y }, data), MANY);   // (slow: its Speed does not make up the odds)
		run('defend', (S, L) => { L.maxHP = L.hp = 9999; }, (S, L, foe) => B.useMoveAt(S.B, foe, { move: mv, x: L.x, y: L.y }, data), MANY);
	}
	const alone = (S) => { for (let i = S.units.length - 1; i >= 0; i--) if (S.units[i].side !== 'p') S.units.splice(i, 1); };
	for (const st of [null, 'psn', 'brn']) run('wait', (S, L) => { alone(S); L.hp = Math.floor(L.maxHP / 2); L.status = st; }, (S) => { for (let i = 0; i < 40; i++) MM.act(S, { t: 'pass' }, data); });
	// (a move down to its last PP, used by the maze's own action: any equipped move that reaches a tile)
	run('pp', (S, L) => { for (const m of L.fig.equipped) L.pp[m] = 1; }, (S, L) => {
		for (const m of L.fig.equipped) for (const [x, y] of aimsOf(S.F, L, B.moveOf(L, m, data))) if (!MM.actBlock(S, { t: 'move', id: m, x, y }, data)) { MM.act(S, { t: 'move', id: m, x, y }, data); return; }
	});
	return out;
}

// ---------- Tower Defense
function tdScenes(id, data) {
	const out = [], map = tdMapById('td-loop');
	// (one move a run, and a low-level tower, so a stronger hit shows as enemies falling sooner)
	for (const mv of WEAK) {
		let f = makeFigurine('mew', 3, makeRng('mew-td'), data, { id: 'mew-td', shinyRate: 0 });
		f = equip({ ...f, pool: [...f.pool.filter((p) => p.id !== mv), { id: mv, lv: 1, xp: 0 }] }, [mv]);
		if (id) f = { ...f, held: id };
		const S = TD.newRun('item-' + mv, { map, squad: [f] }, data);
		const marks = [];
		for (let i = 0; i < 1500 && !S.over; i++) {
			TD.step(S, i === 0 ? [{ t: 'place', fig: 0, x: 5, y: 2 }, { t: 'call' }] : S.phase !== 'wave' && i % 40 === 0 ? [{ t: 'call' }] : [], data);
			if (i % 150 === 149) marks.push(TD.hashOf(S));
		}
		const t = S.B.units.find((u) => u.uid === 't0');
		out.push(['fire', JSON.stringify([marks, S.kills, S.lives, S.exp, S.B.exp, t && [t.stats, t.maxHP, t.choiceLock || null]])]);   // (not heldUsed: a berry eaten for a status the tower never keeps changed nothing)
	}
	return out;
}

const diff = (mine, control) => { const did = new Set(); mine.forEach(([name, fp], i) => { if (fp !== control[i][1]) did.add(name); }); return [...did].sort(); };
/** The whole sweep. -> { itemId: { turn: [...], maze: [...], td: [...] } } */
export function sweepItems(data, only) {
	const c = { turn: turnScenes(null, data), maze: mazeScenes(null, data), td: tdScenes(null, data) }, out = {};
	for (const id of Object.keys(HELD)) {
		if (only && !only.includes(id)) continue;
		out[id] = { turn: diff(turnScenes(id, data), c.turn), maze: diff(mazeScenes(id, data), c.maze), td: diff(tdScenes(id, data), c.td) };
	}
	return out;
}
export const deadIn = (R, mode) => Object.keys(R).filter((id) => !R[id][mode].length);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const data = loadData(), t0 = Date.now(), only = process.argv.find((a) => a.startsWith('--only=')), R = sweepItems(data, only ? only.slice(7).split(',') : null);
	console.log(`${Object.keys(R).length} held items, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
	for (const mode of ['turn', 'maze', 'td']) console.log(`${mode}: ${Object.keys(R).length - deadIn(R, mode).length} do something; nothing: ${deadIn(R, mode).join(' ') || '-'}`);
	if (only) console.log(JSON.stringify(R));
	if (process.argv.includes('--write')) { fs.writeFileSync(path.join(ROOT, 'poketactica/data/item_sweep.json'), '{\n' + Object.keys(R).map((id) => `\t${JSON.stringify(id)}: ${JSON.stringify(R[id])}`).join(',\n') + '\n}\n'); console.log('wrote poketactica/data/item_sweep.json'); }
}
