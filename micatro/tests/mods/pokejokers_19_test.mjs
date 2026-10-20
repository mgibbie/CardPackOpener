// Pokermon pokejokers_19 (Trubbish, Garbodor, Zorua): all 3 jokers fired through real plays
// (act), plus every evolution.   node micatro/tests/mods/pokejokers_19_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { create_card } from '../../js/engine/core.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const NAMES = ['trubbish', 'garbodor', 'zorua'];
ok(NAMES.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 3 pokejokers_19 jokers ported');
ok((STATUS.PORTED_FILES['pokemon/pokejokers_19.lua'] || []).length === 3, 'defs: 3 from pokejokers_19.lua');

// ------------------------------------------------------------- Trubbish / Garbodor
{
  start('TRUBBISH');
  const j = add('j_poke_trubbish');
  let r = play(hand(['S_A']));
  ok(r.total.chips === 16, 'trubbish: no chips yet', r.total);
  const dl = G.GAME.current_round.discards_left;
  winRound();
  const row = G.GAME.round_eval.rows.find((x) => x.center === 'j_poke_trubbish');
  ok(row && row.dollars === 2 * dl, 'trubbish: $2 per unused discard at cash-out (no discards used)', { row, dl });
  ok(j.ability.extra.chips === 3 * dl && j.ability.extra.triggers === 1, 'trubbish: +3 chips per unused discard', j.ability.extra);
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 3 * dl, 'trubbish: scores its chips', r.total);
  // A round with a discard used: nothing.
  const [d] = hand(['H_2']);
  act({ type: 'highlight', ids: [d.sort_id] }); act({ type: 'discard' });
  clearHand();
  winRound();
  ok(!G.GAME.round_eval.rows.find((x) => x.center === 'j_poke_trubbish') && j.ability.extra.triggers === 1, 'trubbish: nothing after a discard');
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  j.ability.extra.triggers = 3;
  const c0 = j.ability.extra.chips;
  winRound();
  ok(key(j) === 'j_poke_garbodor', 'trubbish -> garbodor on its 4th clean round', key(j));
  ok(j.ability.extra.chips === c0 + 3 * dl, 'garbodor keeps the scaled chips', j.ability.extra.chips);
}
{
  start('GARBODOR');
  const j = add('j_poke_garbodor');
  const dl = G.GAME.current_round.discards_left;
  winRound();
  ok(j.ability.extra.chips === 5 * dl, 'garbodor: +5 chips per unused discard at end of round', j.ability.extra.chips);
  nextRound();
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 5 * dl, 'garbodor: scores its chips', r.total);
  winRound();
  const tags0 = G.GAME.tags.length;
  nextRound(); // boss blind
  ok(G.GAME.blind.boss, 'boss blind selected');
  winRound();
  ok(G.GAME.tags.length === tags0 + 1 && G.GAME.tags.some((t) => t.key === 'tag_garbage'), 'garbodor: no discards all ante -> Garbage Tag after the boss', G.GAME.tags.map((t) => t.key));
  // Next ante with a discard: no tag.
  nextRound(); winRound(); nextRound();
  const [d] = hand(['H_2']);
  act({ type: 'highlight', ids: [d.sort_id] }); act({ type: 'discard' });
  clearHand();
  winRound(); nextRound();
  ok(G.GAME.blind.boss, 'second boss');
  const t1 = G.GAME.tags.length;
  winRound();
  ok(G.GAME.tags.length === t1, 'garbodor: a discard this ante -> no tag', G.GAME.tags.map((t) => t.key));
}

// ------------------------------------------------------------- Zorua / Zoroark
{
  start('ZORUA');
  // Outside the joker row (a shop card) it shows an Illusion: a Common, non-Dark Pokémon; it drops once owned.
  const s = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_poke_zorua');
  const ill = P_CENTERS[s.ability.extra.hidden_key];
  ok(ill && ill.stage && ill.rarity === 1 && ill.ptype !== 'Dark' && s.ability.dark_sticker === true,
    'zorua: a shop Zorua shows an Illusion — a Common, non-Dark Pokémon — and has a Dark Tera sticker (Pokermon 3.9.1)', s.ability.extra.hidden_key);
  const z = add('j_poke_zorua');
  ok(z.ability.extra.hidden_key === undefined, 'zorua: the Illusion drops once it joins the joker row (Pokermon 3.9.1)', z.ability.extra.hidden_key);
  ok(z.ability.dark_sticker === true, 'zorua: Dark Tera sticker');
  add('j_joker');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4 + 4, 'zorua: copies the rightmost joker (Joker +4)', r.total);
  ok(z.ability.extra.active === false && statusMsgs(r.events).length > 0, 'zorua: illusion revealed after the hand', z.ability.extra);
  r = play(hand(['S_K']));
  ok(r.total.mult === 1 + 4, 'zorua: no copy until end of round', r.total);
  winRound();
  ok(z.ability.extra.active === true && z.ability.extra.rounds === 4, 'zorua: reset at end of round, 4 rounds left', z.ability.extra);
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.mult === 9, 'zorua: copies again next round', r.total);
  for (let i = 0; i < 4; i++) { winRound(); if (i < 3) nextRound(); }
  ok(key(z) === 'j_poke_zoroark', 'zorua -> zoroark after 5 rounds', key(z));
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.mult === 9, 'zoroark: copies the rightmost joker', r.total);
  r = play(hand(['S_K']));
  ok(r.total.mult === 9, 'zoroark: every hand', r.total);
  // Rightmost itself: nothing to copy.
  act({ type: 'reorder', area: 'jokers', ids: [G.jokers.cards[1].sort_id, z.sort_id] });
  r = play(hand(['S_A']));
  ok(r.total.mult === 5, 'zoroark: rightmost copies nothing', r.total);
}

done();
