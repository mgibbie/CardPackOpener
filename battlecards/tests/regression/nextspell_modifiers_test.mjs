// Next-spell modifiers family: Conductivity (splash to neighbors), Urchin
// Spines (spells Poisonous this turn), Solid Alibi (hero damage cap),
// Judgment (Prepare; set all stats to the chosen minion's).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

byId.t_zap = { id: 't_zap', name: 'Zap', type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 2, target: 'creature' }] };
byId.t_wall = { id: 't_wall', name: 'Wall', type: 'creature', cost: 1, attack: 1, health: 8 };
byId.t_body = { id: 't_body', name: 'Body', type: 'creature', cost: 1, attack: 2, health: 3 };
byId.t_giant = { id: 't_giant', name: 'Giant', type: 'creature', cost: 8, attack: 9, health: 9 };

function game() {
	const st = E.createGame(byId, seededRng(61), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.board = []; p.deck = Array(20).fill('t_body'); }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
}
function put(st, pi, id) {
	const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false;
	st.players[pi].board.push(c); E.recomputeAuras(st); return c;
}
function cast(st, id, tgt = null) {
	const sp = E.instantiate(byId[id], 0); sp.zone = 'hand';
	st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, tgt, null, 0); return sp;
}
const tgtOf = c => ({ type: 'creature', uid: c.uid, player: c.controller });

// --- Conductivity: the next targeted spell splashes to board neighbors, once ---
{
	const st = game();
	const a = put(st, 1, 't_wall'), b = put(st, 1, 't_wall'), c = put(st, 1, 't_wall'), d = put(st, 1, 't_wall');
	cast(st, 'conductivity');
	cast(st, 't_zap', tgtOf(b)); // middle-left of the row a-b-c-d
	ok('conductivity: target took it', E.hp(b) === 6, E.hp(b));
	ok('conductivity: both neighbors splashed', E.hp(a) === 6 && E.hp(c) === 6, [E.hp(a), E.hp(c)]);
	ok('conductivity: non-adjacent untouched', E.hp(d) === 8, E.hp(d));
	cast(st, 't_zap', tgtOf(d));
	ok('conductivity: consumed — second spell has no splash', E.hp(c) === 6 && E.hp(d) === 6, [E.hp(c), E.hp(d)]);
}
// --- Urchin Spines: spells this turn inflict Poisoned ---
{
	const st = game();
	const w = put(st, 1, 't_wall');
	cast(st, 'urchin_spines');
	cast(st, 't_zap', tgtOf(w));
	ok('spines: damaged minion is Poisoned', w.poisoned === true && E.hp(w) === 6, [w.poisoned, E.hp(w)]);
	const w2 = put(st, 1, 't_wall');
	E.endTurn(st); E.endTurn(st); // back to my turn — the rider has lapsed
	cast(st, 't_zap', tgtOf(w2));
	ok('spines: lapses after the turn', w2.poisoned !== true, w2.poisoned);
}
// --- Solid Alibi: hero takes at most 1 damage at a time until your next turn ---
{
	const st = game();
	cast(st, 'solid_alibi');
	const life = st.players[0].life;
	E.damageHero(st, 0, 8, 1);
	ok('alibi: 8 damage capped to 1', st.players[0].life === life - 1, life - st.players[0].life);
	E.endTurn(st); // opponent's turn — still protected
	E.damageHero(st, 0, 5, 1);
	ok('alibi: still capped on the enemy turn', st.players[0].life === life - 2, life - st.players[0].life);
	E.endTurn(st); // my next turn — protection ends
	E.damageHero(st, 0, 5, 1);
	ok('alibi: expires on your next turn', st.players[0].life === life - 7, life - st.players[0].life);
}
// --- Judgment: all minions' stats become the chosen minion's ---
{
	const st = game();
	const mine = put(st, 0, 't_body');   // 2/3 — the chosen one
	const big = put(st, 0, 't_giant');   // 9/9 friendly
	const theirs = put(st, 1, 't_giant'); // 9/9 enemy
	ok('judgment: card is a Prepare card', byId.judgment.prepare === true);
	cast(st, 'judgment', tgtOf(mine));
	ok('judgment: friendly giant set to 2/3', big.attack === 2 && big.maxHealth === 3 && big.damage === 0, [big.attack, big.maxHealth]);
	ok('judgment: enemy giant set to 2/3', theirs.attack === 2 && theirs.maxHealth === 3, [theirs.attack, theirs.maxHealth]);
	ok('judgment: the chosen minion keeps its stats', mine.attack === 2 && E.hp(mine) === 3, [mine.attack, E.hp(mine)]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
