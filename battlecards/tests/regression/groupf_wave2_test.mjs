// Group F wave 2 — conditional / filtered auras. Three new aura filters in
// engine/auras.js: divineShield (only creatures that currently HAVE a shield),
// notName (exclude same-named), whileOverloaded (source's owner is Overloaded).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 39) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = []; st.players[0].life = 30; st.players[1].life = 30;
	return st;
};
const put = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; };
const dummy = (a, h, name, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 2, rarity: 'basic', attack: a, health: h, ...extra });
const kw = (c, k) => (c.keywords || []).concat(c.auraKeywords || []).includes(k);

// data sanity
ok('Funkfin: divineShield aura + own Divine Shield', cardsById.funkfin.aura?.divineShield === true && (cardsById.funkfin.keywords || []).includes('divine_shield'));
ok('Red Herring: notName aura + own Taunt', cardsById.red_herring.aura?.notName === 'Red Herring' && (cardsById.red_herring.keywords || []).includes('taunt'));
ok('Vessina: whileOverloaded others aura', cardsById.vessina.aura?.whileOverloaded === true && cardsById.vessina.aura.others === true);

// Funkfin: only creatures that currently HAVE Divine Shield get +2 Attack
{
	const st = game();
	const funk = put(st, 0, 'funkfin'); // 2/2, has Divine Shield → buffs itself
	const shielded = put(st, 0, null, dummy(3, 3, 'Shld', { keywords: ['divine_shield'] }));
	const bare = put(st, 0, null, dummy(3, 3, 'Bare'));
	E.recomputeAuras(st);
	ok('a shielded friendly gets +2 Attack', shielded.attack === 5, shielded.attack);
	ok('Funkfin buffs itself (it has a shield)', funk.attack === 4, funk.attack);
	ok('a non-shielded creature is unbuffed', bare.attack === 3, bare.attack);
	// pop the shield → the +2 drops
	shielded.shield = false;
	E.recomputeAuras(st);
	ok('once the shield pops, the +2 falls off', shielded.attack === 3, shielded.attack);
}

// Red Herring: your NON-Red Herring creatures have Stealth (all Red Herrings excluded)
{
	const st = game();
	const rh1 = put(st, 0, 'red_herring');
	const rh2 = put(st, 0, 'red_herring'); // a second copy — also excluded
	const ally = put(st, 0, null, dummy(2, 2, 'Ally'));
	const foe = put(st, 1, null, dummy(2, 2, 'Foe'));
	E.recomputeAuras(st);
	ok('a non-Red-Herring friendly gets Stealth', kw(ally, 'stealth'));
	ok('neither Red Herring gets Stealth (notName)', !kw(rh1, 'stealth') && !kw(rh2, 'stealth'), [kw(rh1, 'stealth'), kw(rh2, 'stealth')]);
	ok('Red Herring keeps its Taunt', kw(rh1, 'taunt'));
	ok('the enemy creature is unaffected', !kw(foe, 'stealth'));
}

// Vessina: only WHILE you're Overloaded do your other creatures get +2 Attack
{
	const st = game();
	const ves = put(st, 0, 'vessina');
	const ally = put(st, 0, null, dummy(2, 2, 'Ally'));
	st.players[0].overloadLockedThisTurn = 0;
	E.recomputeAuras(st);
	ok('no Overload: ally is unbuffed', ally.attack === 2, ally.attack);
	// now the player is Overloaded this turn
	st.players[0].overloadLockedThisTurn = 2;
	E.recomputeAuras(st);
	ok('while Overloaded: ally gets +2 Attack', ally.attack === 4, ally.attack);
	ok('Vessina does not buff itself (others)', ves.attack === 2, ves.attack);
	// overload clears next turn → buff falls off
	st.players[0].overloadLockedThisTurn = 0;
	E.recomputeAuras(st);
	ok('Overload gone: the +2 falls off', ally.attack === 2, ally.attack);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
