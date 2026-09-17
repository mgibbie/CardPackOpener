// Sixty-sixth batch from the wiki's owner inbox (owner_todo), 2026-09-11.
//   Juggernaut (wastes_juggernaut) -> add Taunt ("Impulsive, Rush & Taunt."), tribe "Construct Mech"
//   Duplicant (wastes_duplicant)   -> "Battlecry: Exile target creature you don't control & then transform into it."
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
// a distinctive enemy creature to clone: a 4/6 Beast with Taunt & a deathrattle
cardsById._prize = { id: '_prize', name: 'Prize Beast', type: 'creature', cost: 5, attack: 4, health: 6, tribe: 'Beast', rarity: 'common', keywords: ['taunt', 'deathrattle'], deathrattle: [{ type: 'draw', value: 1 }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(cardsById, seededRng(66), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = ['_prize']; p.board = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const cast = (st, pi, id, target) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, target ?? null, null); return c; };

// ---- 1) Juggernaut: Taunt + Construct Mech ----
{
	const j = cardsById.wastes_juggernaut;
	ok('reworded "Impulsive, Rush & Taunt."', j.description === 'Impulsive, Rush & Taunt.', j.description);
	ok('gained Taunt (keeps Impulsive & Rush)', ['impulsive', 'rush', 'taunt'].every(k => j.keywords.includes(k)), JSON.stringify(j.keywords));
	ok('tribe is "Construct Mech"', j.tribe === 'Construct Mech', j.tribe);
	const st = fresh();
	const c = put(st, 0, 'wastes_juggernaut');
	E.execEffects(st, 0, [{ type: 'buff', target: 'friendly-creatures', tribe: 'Mech', attack: 1, health: 1 }], null, null);
	ok('Mech-tribal buffs now hit it', c.attack === 6 && c.maxHealth === 4, [c.attack, c.maxHealth].join('/'));
}

// ---- 2) Duplicant: exile an enemy creature & transform into it ----
{
	const d = cardsById.wastes_duplicant;
	ok('reworded to the exile-and-become Battlecry', d.description === "Battlecry: Exile target creature you don't control & then transform into it.", d.description);
	ok('effects are transform-copy(enemy-creature) + exile(enemy-creature)', d.effects[0].type === 'transform-copy' && d.effects[0].target === 'enemy-creature' && d.effects[1].type === 'exile' && d.effects[1].target === 'enemy-creature', JSON.stringify(d.effects));
	const st = fresh();
	const prize = put(st, 1, '_prize'); // the enemy creature to steal
	const legal = E.legalTargets(st, 0, E.targetSpec(st, 0, E.instantiate(d, 0)));
	ok('only an enemy creature is a legal target', legal.length && legal.every(t => t.player === 1 && t.type === 'creature'), legal.map(t => t.player + ':' + t.type).join(','));
	cast(st, 0, 'wastes_duplicant', { type: 'creature', uid: prize.uid, player: 1 });
	// the original is exiled off the enemy board
	ok('the target creature is exiled from the enemy board', !st.players[1].board.includes(prize) && st.players[1].exile.some(x => x.uid === prize.uid), [st.players[1].board.length, st.players[1].exile.length].join('/'));
	// Duplicant on MY board is now a copy of the Prize Beast
	const mine = st.players[0].board[st.players[0].board.length - 1];
	ok('Duplicant became a copy (name, 4/6, Beast, Taunt)', mine.name === 'Prize Beast' && mine.attack === 4 && mine.maxHealth === 6 && (mine.tribe || '').includes('Beast') && mine.keywords.includes('taunt'),
		[mine.name, mine.attack, mine.maxHealth, mine.tribe, mine.keywords.join('+')].join('|'));
	ok('the copy carries the original Deathrattle', Array.isArray(mine.deathrattle) && mine.deathrattle.length > 0, JSON.stringify(mine.deathrattle));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
