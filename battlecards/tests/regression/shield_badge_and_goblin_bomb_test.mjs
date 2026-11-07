// Two small card-state fixes from the 2026-11-06 Middle-earth reports.
//
// A) bug:1793981762330 — Divine Shield badge stayed after the shield popped. damageCreature's
//    pop cleared the functional `shield` flag but left 'divine_shield' in `keywords`, which the
//    board badge/ring reads. Worse, every "gain Divine Shield" grant is written
//    `if (!keywords.includes(k)) { push; shield = true }`, so the stale keyword also BLOCKED a
//    second shield. FIX: the pop drops the keyword too (as Blood Knight's pop already did).
// B) bug:1793999843582 — Goblin Bomb "Deathrattle: Deal 2 damage to each opponent." used target
//    'enemies' (every enemy creature + face) and killed a 5/2. Site convention (and the
//    Hearthstone original, "to the enemy hero") is face only: target 'enemy-heroes'.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { damageCreature } from '../../engine/damage.js';
import { sweepDeaths } from '../../engine/death.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._glow = { id: '_glow', name: 'Glowscale', type: 'creature', cost: 3, attack: 6, health: 7, rarity: 'common' };
byId._pursuer = { id: '_pursuer', name: 'Pursuer', type: 'creature', cost: 3, attack: 5, health: 2, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };

function fresh() {
	const st = E.createGame(byId, seededRng(9), null, 2,
		[{ id: 'priest', name: 'Elrond', power: null }, { id: 'warrior', name: 'Azog', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	return st;
}
function put(st, pi, id) { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; }
const giveShield = (st, c) => E.execEffects(st, 0, [{ type: 'buff', attack: 0, health: 0, grant: 'divine_shield', target: 'creature' }], { type: 'creature', uid: c.uid, player: 0 }, null);

// A1) gain a shield, absorb a hit: flag AND keyword gone, no damage taken
{
	const st = fresh();
	const g = put(st, 0, '_glow');
	giveShield(st, g);
	ok('granted: shield flag + keyword', g.shield === true && g.keywords.includes('divine_shield'), JSON.stringify(g.keywords));
	damageCreature(st, g, 3, null);
	ok('the hit was absorbed', g.damage === 0, g.damage);
	ok('the shield flag cleared', !g.shield);
	ok('the divine_shield keyword (badge) cleared with it', !g.keywords.includes('divine_shield'), JSON.stringify(g.keywords));
	// A2) and the next lethal hit kills it (combat unchanged)
	damageCreature(st, g, 7, null); sweepDeaths(st);
	ok('a later lethal hit kills it', g.zone !== 'board' || E.isDead(g), g.zone);
}
// A3) a shield that is never consumed keeps its keyword
{
	const st = fresh();
	const g = put(st, 0, '_glow');
	giveShield(st, g);
	ok('an unconsumed shield keeps the keyword', g.shield && g.keywords.includes('divine_shield'));
}
// A4) a second shield after the first popped: granted for real, and clears again
{
	const st = fresh();
	const g = put(st, 0, '_glow');
	giveShield(st, g); damageCreature(st, g, 1, null);
	giveShield(st, g);
	ok('a second Divine Shield is actually granted', g.shield === true && g.keywords.filter(k => k === 'divine_shield').length === 1, JSON.stringify([g.shield, g.keywords]));
	damageCreature(st, g, 2, null);
	ok('the second shield absorbs and clears again', g.damage === 0 && !g.shield && !g.keywords.includes('divine_shield'), JSON.stringify([g.damage, g.shield, g.keywords]));
}

// B) Goblin Bomb hits each opponent's face only
{
	const def = byId.goblin_bomb;
	ok('goblin_bomb deathrattle targets enemy-heroes', def.deathrattle.some(e => e.type === 'damage' && e.target === 'enemy-heroes' && e.value === 2), JSON.stringify(def.deathrattle));
	const st = fresh();
	const bomb = put(st, 0, 'goblin_bomb');
	const pur = put(st, 1, '_pursuer');
	const life0 = st.players[1].life;
	damageCreature(st, bomb, 5, null); sweepDeaths(st);
	ok('the enemy hero takes 2', st.players[1].life === life0 - 2, st.players[1].life);
	ok('the enemy 5/2 survives', !E.isDead(pur) && pur.damage === 0, pur.damage);
	const st2 = fresh();
	const b2 = put(st2, 0, 'goblin_bomb');
	const l2 = st2.players[1].life;
	damageCreature(st2, b2, 5, null); sweepDeaths(st2);
	ok('empty enemy board: the hero still takes 2', st2.players[1].life === l2 - 2, st2.players[1].life);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
