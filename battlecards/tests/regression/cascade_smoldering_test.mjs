// cascade_smoldering_test.mjs (2026-09-08)
// Two new keywords:
//  - Cascade: on casting a spell, cast the first card off your deck that costs
//    LESS (random targeting); pricier cards go to the bottom; repeats until a
//    cheaper card is cast, else it fizzles. nak_stormspell_sneak grants it to
//    your Frost & Nature spells.
//  - Smoldering: like Static, but 50% to inflict Burned instead of Paralyzed.
//    Burned halves Attack (once) and burns for 1 at the end of your turn.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

// pick real creature ids by cost so the deck cards can actually be summoned
const collCreature = cost => raw.cards.find(c => c.type === 'creature' && c.cost === cost && c.collectible !== false && !c.token);
const CHEAP = collCreature(1).id, MID = collCreature(2).id, EXP = (raw.cards.find(c => c.type === 'creature' && c.cost >= 6 && c.collectible !== false && !c.token)).id;

const game = (seed = 35) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };
const nak = st => put(st, 0, E.instantiate(cardsById.nak_stormspell_sneak, 0));
// cast a cost-3 Frost sorcery from P0's hand (harmless effect)
const castFrost = st => { const sp = E.instantiate({ id: 'frostbolt_x', name: 'FrostX', type: 'sorcery', tribe: 'Frost', cost: 3, effects: [{ type: 'damage', value: 1, target: 'enemy-hero' }] }, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10; E.playCard(st, 0, sp.uid, { type: 'hero', player: 1 }, null, 0); };

// ---------- Cascade: hits the cheaper card on top ----------
{
	const st = game(); nak(st);
	st.players[0].deck = [EXP, CHEAP]; // top of deck = last element = CHEAP (cost 1 < 3)
	castFrost(st);
	ok('Cascade cast the cheap creature off the top', st.players[0].board.some(c => c.id === CHEAP), st.players[0].board.map(c => c.id));
	ok('the pricier card stayed in the deck', st.players[0].deck.includes(EXP), st.players[0].deck);
}
// ---------- Cascade: bottoms the pricier top card, then casts the cheaper one ----------
{
	const st = game(); nak(st);
	st.players[0].deck = [CHEAP, EXP]; // top = EXP (cost>=6 >= 3) -> bottom; then CHEAP -> cast
	castFrost(st);
	ok('Cascade skipped the pricey top card and cast the cheap one', st.players[0].board.some(c => c.id === CHEAP));
	ok('the pricey card was moved to the bottom', st.players[0].deck[0] === EXP && !st.players[0].deck.includes(CHEAP), st.players[0].deck);
}
// ---------- Cascade: fizzles when nothing is cheaper ----------
{
	const st = game(); nak(st);
	st.players[0].deck = [EXP, EXP]; // both cost >= 3
	const boardBefore = st.players[0].board.length;
	castFrost(st);
	ok('Cascade fizzled: no creature cast', st.players[0].board.length === boardBefore, [boardBefore, st.players[0].board.length]);
	ok('Cascade fizzle left the deck intact (2 cards)', st.players[0].deck.length === 2 && st.players[0].deck.every(id => id === EXP), st.players[0].deck);
}
// ---------- control: a non-Frost/Nature spell does NOT cascade ----------
{
	const st = game(); nak(st);
	st.players[0].deck = [EXP, CHEAP];
	const sp = E.instantiate({ id: 'fire_x', name: 'FireX', type: 'sorcery', tribe: 'Fire', cost: 3, effects: [{ type: 'damage', value: 1, target: 'enemy-hero' }] }, 0);
	sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, { type: 'hero', player: 1 }, null, 0);
	ok('a Fire spell (not Frost/Nature) does not cascade', !st.players[0].board.some(c => c.id === CHEAP) && st.players[0].deck.length === 2);
}

// ---------- Smoldering -> Burned (rng forced to 0 => always burns) ----------
{
	const st = game(); st.rng = () => 0;
	const ge = put(st, 0, E.instantiate(cardsById.green_eyes_ultimate_dragon, 0));
	const foe = put(st, 1, E.instantiate({ id: 'wall', name: 'Wall', type: 'creature', cost: 4, attack: 4, health: 30 }, 1));
	E.attack(st, 0, ge.uid, { type: 'creature', uid: foe.uid, player: 1 });
	ok('Smoldering Burned the surviving defender', foe.burned === true, foe.burned);
	ok('Burned halved its Attack (4 -> 2)', foe.attack === 2, ['attack', foe.attack]);
}
// ---------- Smoldering does NOT burn when the coin flip fails (rng 0.9) ----------
{
	const st = game(); st.rng = () => 0.9;
	const ge = put(st, 0, E.instantiate(cardsById.green_eyes_ultimate_dragon, 0));
	const foe = put(st, 1, E.instantiate({ id: 'wall', name: 'Wall', type: 'creature', cost: 4, attack: 4, health: 30 }, 1));
	E.attack(st, 0, ge.uid, { type: 'creature', uid: foe.uid, player: 1 });
	ok('no Burn on a failed coin flip', !foe.burned && foe.attack === 4, [foe.burned, foe.attack]);
}
// ---------- Burned deals 1 at the end of your turn ----------
{
	const st = game();
	const c = put(st, 0, E.instantiate({ id: 'v', name: 'V', type: 'creature', cost: 2, attack: 3, health: 5 }, 0));
	c.burned = true;
	E.endTurn(st);
	ok('Burned dealt 1 damage at end of turn', c.damage === 1, ['damage', c.damage]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
