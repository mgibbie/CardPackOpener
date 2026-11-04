// Omerta Deck (micatro/mods/omertadeck): +3 Joker slots, a Negative Tag after each Boss Blind
// (and the tag doing its job on the next shop joker), off = gone, the art fix.
//   node micatro/tests/mods/omertadeck_test.mjs
import { T, start, nextRound, winRound, G, P_CENTERS, act, STATES } from './oio_helpers.mjs';
import { newRun } from '../../js/engine/run.js';
import { ATLASES, centerActive } from '../../js/mods/registry.js';
import { describeCenter } from '../../js/engine/describe.js';
import { modBacks } from '../../js/mods/index.js';
import '../../mods/omertadeck/index.js';

const { ok, done } = T();
const KEY = 'b_omertadeck_pact_slug';

// ---------------------------------------------------------------- off
{
  newRun({ seed: 'OMOFF', back: KEY });
  ok(G.GAME.selected_back_key === 'b_red' && G.jokers.config.card_limit === 5, 'off: the deck falls back to Red (5 slots)', G.GAME.selected_back_key);
  ok(!centerActive(P_CENTERS[KEY]), 'off: deck inactive');
  ok(!modBacks([]).some((c) => c.key === KEY) && modBacks(['omertadeck']).some((c) => c.key === KEY), 'New Run picker lists it only with the mod on');
}

// ---------------------------------------------------------------- on
{
  start('OMON', ['omertadeck'], { back: KEY, noBlind: true });
  ok(G.GAME.selected_back_key === KEY && G.GAME.selected_back.name === 'Omerta Deck', 'on: Omerta Deck selected');
  ok(G.jokers.config.card_limit === 8, '+3 Joker slots (5 -> 8)', G.jokers.config.card_limit);
  ok(P_CENTERS[KEY].config.darkpact === true && P_CENTERS[KEY].config.joker_slot === 3, 'config {darkpact, joker_slot 3}');
  const d = describeCenter(KEY);
  ok(d && d.name === 'Omerta Deck' && d.lines.length === 4 && !d.lines.some((l) => /#\d+#/.test(l)), 'describe: 4 lines, filled', d);
  // FIX 1 (art): its own atlas, not a replacement of the game's "centers" sheet.
  ok(P_CENTERS[KEY].atlas === 'omertadeck_enhancers' && ATLASES.omertadeck_enhancers && ATLASES.omertadeck_enhancers.px === 71
    && P_CENTERS[KEY].pos.x === 5 && P_CENTERS[KEY].pos.y === 5 && !ATLASES.centers, 'fix 1: own atlas cell {5,5}; vanilla centers atlas untouched');

  act({ type: 'select_blind' });
  winRound();
  ok(G.STATE === STATES.ROUND_EVAL, 'small blind beaten');
  G.E_MANAGER.flush();
  ok(G.GAME.tags.length === 0, 'no tag after the Small Blind');
  act({ type: 'cash_out' });
  act({ type: 'next_round' });
  act({ type: 'select_blind' }); // Big
  winRound();
  act({ type: 'cash_out' });
  ok(G.GAME.tags.length === 0, 'no tag after the Big Blind');
  act({ type: 'next_round' });
  act({ type: 'select_blind' }); // Boss
  ok(G.GAME.blind.boss, 'facing the boss');
  winRound();
  G.E_MANAGER.flush();
  ok(G.GAME.tags.length === 1 && G.GAME.tags[0].key === 'tag_negative', 'Negative Tag after defeating the Boss Blind', G.GAME.tags.map((t) => t.key));
  act({ type: 'cash_out' });
  ok(G.STATE === STATES.SHOP, 'shop');
  const neg = G.shop_jokers.cards.filter((c) => c.ability.set === 'Joker' && c.edition && c.edition.negative);
  ok(G.GAME.tags.length === 0 && neg.length === 1, 'the Negative Tag made a shop joker Negative', { tags: G.GAME.tags.length, neg: neg.length });
  // A second ante's boss gives another.
  act({ type: 'next_round' });
  for (let i = 0; i < 3; i++) nextRound();
  ok(G.GAME.blind.boss, 'ante 2 boss');
  winRound();
  G.E_MANAGER.flush();
  ok(G.GAME.tags.filter((t) => t.key === 'tag_negative').length === 1, 'another Negative Tag after the next boss');
}

// ---------------------------------------------------------------- vanilla deck with the mod on
{
  start('OMRED', ['omertadeck'], { noBlind: true });
  ok(G.jokers.config.card_limit === 5, 'mod on, Red Deck: 5 slots');
  for (let i = 0; i < 3; i++) nextRound();
  winRound();
  G.E_MANAGER.flush();
  ok(G.GAME.tags.length === 0, 'mod on, Red Deck: no Negative Tag after a boss');
}

done();
