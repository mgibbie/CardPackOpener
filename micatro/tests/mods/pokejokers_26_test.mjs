// Pokermon pokejokers_26 (Mimikyu): chips + the Disguise save, through real plays (act).
//   node micatro/tests/mods/pokejokers_26_test.mjs
import { T, start, hand, add, play, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
ok(STATUS.PORTED.jokers.includes('j_poke_mimikyu') && !P_CENTERS.j_poke_mimikyu.unported, 'mimikyu ported');
ok((STATUS.PORTED_FILES['pokemon/pokejokers_26.lua'] || []).length === 3, 'defs: 3 from pokejokers_26.lua (+ Drampa, new-jokers sub-batch 15, + Mega Drampa, batch 16)');

/** Play the round's last hand without winning: total chips land at `frac` of the blind. */
function lastHand(cards, blind_chips) {
  G.GAME.chips = 0;
  G.GAME.blind.chips = blind_chips;
  G.GAME.current_round.hands_left = 1;
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  return act({ type: 'play' });
}

{
  start('MIMIKYU');
  const j = add('j_poke_mimikyu');
  let r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 80, 'mimikyu: +80 chips with no scoring Hearts', r.total);
  r = play(hand(['H_A']));
  ok(r.total.chips === 16, 'mimikyu: nothing with a scoring Heart', r.total);
  r = play(hand(['H_2', 'S_A']));
  ok(r.total.chips === 16 + 80, 'mimikyu: unscored Hearts don\'t count', r.total);
  // Last hand: 16 + 80 = 96 chips x1 -> 96 of a 150 blind = 64% -> saved.
  clearHand();
  lastHand(hand(['S_A']), 150);
  ok(G.STATE !== STATES.GAME_OVER && G.GAME.saved_by === 'j_poke_mimikyu' && j.ability.extra.disguise_broken === true, 'mimikyu: saved at >= 50% of the blind; disguise_broken set (Pokermon 3.9.1 key)', [G.STATE, G.GAME.saved_by, j.ability.extra]);
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  lastHand(hand(['S_A']), 150);
  ok(G.STATE === STATES.GAME_OVER, 'mimikyu: the disguise only works once', G.STATE);
}
{
  start('MIMIKYU2');
  add('j_poke_mimikyu');
  lastHand(hand(['S_A']), 1000);
  ok(G.STATE === STATES.GAME_OVER, 'mimikyu: no save below 50%', G.STATE);
}
{
  start('MIMIKYU3');
  const j = add('j_poke_mimikyu');
  j.ability.extra.disguise_broken = true;
  j.remove_from_deck(); j.added_to_deck = false; j.add_to_deck();
  ok(!j.ability.extra.disguise_broken, 'mimikyu: disguise restored when added to the deck (Pokermon 3.9.1 key)');
  j.ability.extra.disguise_broken = true;
  j.remove_from_deck(true); j.added_to_deck = false; j.add_to_deck(true);
  ok(j.ability.extra.disguise_broken === true, 'mimikyu: not on un-debuff');
  // A 3.2.1 card from a resumed run (disguise: false) still reads as broken.
  j.ability.extra.disguise_broken = undefined; j.ability.extra.disguise = false;
  ok(/broken/i.test(String(j.config.center.loc_vars(j.config.center, [], j).vars[2])), 'mimikyu: a 3.2.1 card\'s disguise === false still reads as broken', j.config.center.loc_vars(j.config.center, [], j).vars);
}

done();
