// Group C (cost modification) wave 7 — self-scaling cost driven by "cards you've
// played this game" counters tracked at the central card-play hook.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 16) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'paladin', name: 'P', power: null }, { id: 'mage', name: 'M', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const eff = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return E.effectiveCost(st, pi, c); };
const playDef = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null, null, 0); return c; };

for (const id of ['techysaurus', 'mana_giant', 'lightray', 'vengeful_walloper', 'kabal_crystal_runner'])
	ok(`${id} carries selfCost`, cardsById[id].selfCost && cardsById[id].selfCost.per, id);

// field-set
{ const st = game(); st.players[0].foreignPlayedGame = 3; ok('Techysaurus: 7 - 3 foreign = 4', eff(st, 0, 'techysaurus') === 4); ok('Mana Giant: 8 - 3 = 5', eff(st, 0, 'mana_giant') === 5); }
{ const st = game(); st.players[0].classPlayedGame = { paladin: 4 }; ok('Lightray: 9 - 4 Paladin cards = 5', eff(st, 0, 'lightray') === 5); }
{ const st = game(); st.players[0].outcastPlayedGame = 2; ok('Vengeful Walloper: 7 - 2 Outcast = 5', eff(st, 0, 'vengeful_walloper') === 5); }
{ const st = game(); st.players[0].secretsPlayedGame = 2; ok('Kabal Crystal Runner: 6 - 2*2 secrets = 2', eff(st, 0, 'kabal_crystal_runner') === 2); }

// end-to-end: the central play hook actually counts
// foreign (a hand card not drawn from deck => fromDeck falsy)
{
	const st = game();
	playDef(st, 0, { id: 'foreignc', name: 'Foreignc', type: 'creature', cost: 1, rarity: 'common', attack: 1, health: 1 });
	playDef(st, 0, { id: 'foreignc', name: 'Foreignc', type: 'creature', cost: 1, rarity: 'common', attack: 1, health: 1 });
	ok('playing conjured (non-deck) cards increments foreignPlayedGame', st.players[0].foreignPlayedGame === 2, st.players[0].foreignPlayedGame);
	// a card drawn from deck should NOT count
	const dc = E.instantiate({ id: 'deckc', name: 'Deckc', type: 'creature', cost: 1, rarity: 'common', attack: 1, health: 1 }, 0); dc.zone = 'hand'; dc.fromDeck = true; st.players[0].hand.push(dc); E.playCard(st, 0, dc.uid, null, null, 0);
	ok('a fromDeck card does NOT count as foreign', st.players[0].foreignPlayedGame === 2, st.players[0].foreignPlayedGame);
}
// class-played: playing a Paladin card
{
	const st = game();
	playDef(st, 0, { id: 'palc', name: 'Palc', type: 'creature', cost: 1, cardClass: 'paladin', rarity: 'common', attack: 1, health: 1 });
	ok('playing a Paladin card increments classPlayedGame.paladin', (st.players[0].classPlayedGame || {}).paladin === 1, JSON.stringify(st.players[0].classPlayedGame));
	ok('Lightray gets 1 cheaper', eff(st, 0, 'lightray') === 8, eff(st, 0, 'lightray'));
}
// outcast + secret
{
	const st = game();
	playDef(st, 0, { id: 'outc', name: 'Outc', type: 'creature', cost: 1, rarity: 'common', attack: 1, health: 1, keywords: ['outcast'] });
	ok('playing an Outcast card increments outcastPlayedGame', st.players[0].outcastPlayedGame === 1);
	const st2 = game();
	playDef(st2, 0, { id: 'secc', name: 'Secc', type: 'secret', cost: 1, rarity: 'common', secret: { on: 'enemy-attack', effects: [] } });
	ok('playing a Secret increments secretsPlayedGame', st2.players[0].secretsPlayedGame === 1, st2.players[0].secretsPlayedGame);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
