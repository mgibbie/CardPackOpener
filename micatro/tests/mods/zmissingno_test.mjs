// Pokermon zmissingno (MissingNo.): fired through real plays (act).
//   node micatro/tests/mods/zmissingno_test.mjs
import { T, start, add, winRound, G, P_CENTERS, act } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;

ok(STATUS.PORTED.jokers.includes('j_poke_missingno') && !P_CENTERS.j_poke_missingno.unported, 'missingno ported');
ok(STATUS.PORTED_FILES['pokemon/zmissingno.lua'].length === 1, 'defs: 1 from zmissingno.lua');
ok(P_CENTERS.j_poke_missingno.config.extra.ptype === 'Bird' && P_CENTERS.j_poke_missingno.rarity === 4, 'missingno: Bird type, Legendary');

{
  // Empty consumables: an Item is made, then every empty consumable AND joker slot gets a copy.
  start('MISSINGNO');
  const j = add('j_poke_missingno');
  const cons = G.consumeables.cards;
  ok(cons.length === 2 && cons.every((c) => c.ability.set === 'Item') && key(cons[0]) === key(cons[1]), 'missingno: fills the consumable slots with one Item', cons.map(key));
  const copies = G.jokers.cards.filter((c) => c !== j);
  ok(G.jokers.cards.length === 5 && copies.length === 4 && copies.every((c) => key(c) === key(cons[0])), 'missingno: ...and the empty joker slots too', G.jokers.cards.map(key));
  // Copies in the joker row can be sold.
  const d0 = G.GAME.dollars;
  ok(act({ type: 'sell', id: copies[0].sort_id }).ok && G.GAME.dollars > d0, 'a consumable copy in the joker row sells');
  // End of round: 2 (sometimes 3) random tags, never the Boss Tag.
  const t0 = G.GAME.tags.length;
  const w = winRound();
  const made = G.GAME.tags.length - t0;
  ok(w.res.ok && (made === 2 || made === 3) && G.GAME.tags.every((t) => t.key !== 'tag_boss'), 'missingno: 2-3 tags at end of round', G.GAME.tags.map((t) => t.key));
  const orbital = G.GAME.tags.find((t) => t.key === 'tag_orbital');
  if (orbital) ok(G.GAME.hands[orbital.ability.orbital_hand], 'orbital tag got a hand');
}
{
  // With a consumable already held: copies of the first one.
  start('MISSINGNO2');
  add('c_poke_pokeball');
  G.jokers.config.card_limit = 3;
  add('j_poke_missingno');
  ok(G.consumeables.cards.length === 2 && G.consumeables.cards.every((c) => key(c) === 'c_poke_pokeball'), 'missingno: copies the first consumable');
  ok(G.jokers.cards.length === 3 && G.jokers.cards.filter((c) => key(c) === 'c_poke_pokeball').length === 2, 'missingno: joker slots filled with copies');
  // Several rounds of tags never break.
  let made = 0;
  for (let i = 0; i < 4; i++) {
    const t0 = G.GAME.tags.length;
    winRound();
    made += G.GAME.tags.length - t0;
    if (G.STATE === 8) { act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); }
  }
  ok(made >= 6, 'missingno: tags every round', made);
}

done();
