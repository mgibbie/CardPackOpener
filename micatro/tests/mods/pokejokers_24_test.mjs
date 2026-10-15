// Pokermon pokejokers_24 (Sylveon, Pumpkaboo, Gourgeist): all 3 jokers fired through real plays
// (act), plus the evolution.   node micatro/tests/mods/pokejokers_24_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
ok(['sylveon', 'pumpkaboo', 'gourgeist'].every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 3 pokejokers_24 jokers ported');
ok((STATUS.PORTED_FILES['pokemon/pokejokers_24.lua'] || []).length === 3, 'defs: 3 from pokejokers_24.lua');
function discard(cards) { G.GAME.current_round.discards_left = 5; act({ type: 'highlight', ids: cards.map((c) => c.sort_id) }); return act({ type: 'discard' }); }

// ------------------------------------------------------------- Sylveon
{
  start('SYLVEON');
  add('j_poke_sylveon');
  const [c] = hand(['S_A']);
  const r = play([c]);
  ok(c.edition && (c.edition.foil || c.edition.holo || c.edition.polychrome) && !c.edition.negative, 'sylveon: a lone first-hand card gets Foil/Holo/Polychrome', c.edition);
  const bonus = c.edition.foil ? { chips: 50 } : c.edition.holo ? { mult: 10 } : { x: 1.5 };
  ok(r.total.chips === 16 + (bonus.chips || 0) && r.total.mult === (1 + (bonus.mult || 0)) * (bonus.x || 1), 'sylveon: the edition scores this hand', [c.edition, r.total]);
  const [d] = hand(['S_K']);
  play([d]);
  ok(!d.edition, 'sylveon: only the first hand');
  winRound(); nextRound();
  const two = hand(['H_A', 'D_A']);
  play(two);
  ok(!two[0].edition && !two[1].edition, 'sylveon: only a single-card hand');
}

// ------------------------------------------------------------- Pumpkaboo / Gourgeist
{
  start('PUMPKABOO');
  const j = add('j_poke_pumpkaboo');
  const f = j.ability.extra.form;
  ok([0, 1, 2, 3].includes(f) && j.ability.extra.jack_target === 4 + f, 'pumpkaboo: random size, Jack target 4 + size', j.ability.extra);
  // Discard Jacks one at a time until the target.
  let msgs = [];
  for (let i = 0; i < j.ability.extra.jack_target - 1; i++) {
    const r = discard(hand(['S_J']));
    msgs = msgs.concat(statusMsgs(r.events));
    clearHand();
  }
  ok(j.ability.extra.jacks_discarded === j.ability.extra.jack_target - 1 && G.consumeables.cards.length === 0, 'pumpkaboo: counts discarded Jacks', j.ability.extra);
  G.GAME.current_round.discards_left = 5;
  discard(hand(['H_J', 'H_4']));
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Spectral' && j.ability.extra.jacks_discarded === 0, 'pumpkaboo: the target-th Jack makes a Spectral card', G.consumeables.cards.map(key));
  clearHand();
  j.ability.extra.evolve = true;
  winRound();
  ok(key(j) === 'j_poke_gourgeist' && j.ability.extra.form === f && j.ability.extra.jack_target === 4 + f, 'pumpkaboo -> gourgeist keeps its size', j.ability.extra);
  ok(j.ability.extra.money === [2, 5, 8, 11][f], 'gourgeist: $ by size', j.ability.extra.money);
  act({ type: 'cash_out' });
  const sp = G.consumeables.cards[0];
  const other = add('j_joker');
  act({ type: 'reorder', area: 'jokers', ids: [other.sort_id, j.sort_id] });
  const d0 = G.GAME.dollars;
  // Use the Spectral (pick one usable without targets if needed).
  let used = act({ type: 'use', id: sp.sort_id });
  if (used.ok === false) {
    sp.remove();
    const sp2 = add('c_ectoplasm');
    used = act({ type: 'use', id: sp2.sort_id });
  }
  ok(G.GAME.dollars - d0 === [2, 5, 8, 11][f], 'gourgeist: $ per Spectral used', G.GAME.dollars - d0);
  ok(G.jokers.cards[0].ability.psychic_sticker === true, 'gourgeist: leftmost joker becomes Psychic (Tera)', G.jokers.cards[0].ability);
}
{
  // A fresh Gourgeist rolls its own size.
  start('GOURG');
  const g = add('j_poke_gourgeist');
  const f = g.ability.extra.form;
  ok([0, 1, 2, 3].includes(f) && g.ability.extra.jack_target === 4 + f && g.ability.extra.money === [2, 5, 8, 11][f], 'gourgeist: own size roll', g.ability.extra);
}

done();
