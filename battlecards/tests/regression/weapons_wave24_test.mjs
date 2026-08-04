// Wave 24: Parallax Cannon — +2 Attack if you've Discovered this turn;
// Spellburst: your hero is Immune this turn.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 4) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'hunter', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = 'hunter'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };

ok('parallax_cannon exists', cardsById.parallax_cannon);

// condAttack: base 2, +2 while you've Discovered this turn
{
	const st = game();
	equip(st, 'parallax_cannon');
	ok('base hero attack is 2 (no Discover yet)', E.heroAttackValue(st, st.players[0]) === 2, E.heroAttackValue(st, st.players[0]));
	st.players[0].discoveredThisTurn = 1;
	ok('after a Discover this turn: hero attack is 4', E.heroAttackValue(st, st.players[0]) === 4, E.heroAttackValue(st, st.players[0]));
	st.players[0].discoveredThisTurn = 0;
	ok('bonus is dynamic (drops back to 2)', E.heroAttackValue(st, st.players[0]) === 2, E.heroAttackValue(st, st.players[0]));
}

// a real Discover increments the counter (via resolvePick) and clears at turn start
{
	const st = game();
	equip(st, 'parallax_cannon');
	// play a card that Discovers a spell
	cardsById.t_disc = { id: 't_disc', name: 'Disc', type: 'sorcery', cost: 0, effects: [{ type: 'discover', cardType: 'spell' }] };
	const d = E.instantiate(cardsById.t_disc, 0); d.zone = 'hand'; st.players[0].hand.push(d); st.players[0].mana.cur = 10;
	E.playCard(st, 0, d.uid, null, null, 0);
	ok('a Discover was queued', st.pickQueue.length === 1, st.pickQueue.length);
	const offered = st.pickQueue[0].ids[0];
	E.resolvePick(st, offered);
	ok('discoveredThisTurn incremented to 1', st.players[0].discoveredThisTurn === 1, st.players[0].discoveredThisTurn);
	ok('hero attack is now 4 after the real Discover', E.heroAttackValue(st, st.players[0]) === 4, E.heroAttackValue(st, st.players[0]));
	// pass turns back to player -> counter resets
	E.endTurn(st); E.endTurn(st);
	ok('counter reset at the start of your next turn', st.players[0].discoveredThisTurn === 0, st.players[0].discoveredThisTurn);
}

// Spellburst: casting a spell after equipping makes the hero Immune this turn (once)
{
	const st = game();
	equip(st, 'parallax_cannon');
	cardsById.t_bolt = { id: 't_bolt', name: 'Bolt', type: 'sorcery', cost: 0, effects: [{ type: 'armor', value: 0 }] };
	const s = E.instantiate(cardsById.t_bolt, 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10;
	E.playCard(st, 0, s.uid, null, null, 0);
	const lifeBefore = st.players[0].life;
	const dealt = E.damageHero(st, 0, 5, 1);
	ok('Spellburst made the hero Immune (no damage taken)', st.players[0].life === lifeBefore && dealt === 0, [lifeBefore, st.players[0].life, dealt]);
	// Spellburst is one-shot: the weapon's ongoing is spent
	ok('Spellburst ongoing consumed (once)', !st.players[0].weapon.ongoing, st.players[0].weapon.ongoing);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
