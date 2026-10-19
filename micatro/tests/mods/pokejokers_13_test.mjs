// Pokermon pokejokers_13 (Snorunt -> Jirachi): every joker fired through real plays (act),
// plus each evolution, and the two Jirachi forms the 3.2.1 Lua never registered (copy, negging).
//   node micatro/tests/mods/pokejokers_13_test.mjs
import { T, start, hand, add, play, winRound, nextRound, statusMsgs, G, P_CENTERS, act, clearHand, STATES } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { energy_values } from '../../mods/pokermon/api.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;

const FILE_JOKERS = ['snorunt', 'glalie', 'luvdisc', 'beldum', 'metang', 'metagross', 'jirachi', 'jirachi_banker', 'jirachi_booster',
  'jirachi_power', 'jirachi_invis', 'jirachi_fixer', 'jirachi_copy', 'jirachi_negging'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 14 pokejokers_13 jokers ported (incl. jirachi_copy / jirachi_negging)');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_13.lua'].length === 14, 'defs: 14 from pokejokers_13.lua');
ok(['jirachi_banker', 'jirachi_booster', 'jirachi_power', 'jirachi_invis', 'jirachi_fixer', 'jirachi_copy', 'jirachi_negging'].every((n) => P_CENTERS['j_poke_' + n].in_pool(P_CENTERS['j_poke_' + n]) === false),
  'the Jirachi wish forms never appear in a pool');
ok(P_CENTERS.j_poke_jirachi_copy.config.extra.ptype === 'Metal' && P_CENTERS.j_poke_jirachi_copy.stage === 'Legendary' && P_CENTERS.j_poke_jirachi_copy.atlas === 'poke_AtlasJokersBasicGen03391', // (the 3.9.1 Gen03 sheet: index.js to391)
  'jirachi_copy: full static definition (type, stage, art)');

// ---------------------------------------------------------------- Snorunt / Glalie / Froslass
{
  start('SNORUNT');
  const b0 = G.GAME.bankrupt_at;
  const j = add('j_poke_snorunt');
  ok(G.GAME.bankrupt_at === b0 - 15, 'snorunt: go up to $15 in debt', G.GAME.bankrupt_at);
  G.GAME.dollars = 10;
  winRound();
  ok(j.ability.extra.rounds === 4, 'snorunt: no countdown out of debt', j.ability.extra.rounds);
  for (let i = 0; i < 4; i++) { nextRound(); G.GAME.dollars = -5; winRound(); }
  ok(key(j) === 'j_poke_glalie' && G.GAME.bankrupt_at === b0 - 20, 'snorunt -> glalie after 4 rounds in debt (debt 20)', [key(j), G.GAME.bankrupt_at]);
  nextRound();
  G.GAME.dollars = -12;
  winRound();
  ok(G.GAME.dollars === 0, 'glalie: money set to $0 at end of round (from debt)', G.GAME.dollars);
  nextRound();
  G.GAME.dollars = 37;
  winRound();
  ok(G.GAME.dollars === 0, 'glalie: ... and from savings', G.GAME.dollars);
  j.remove();
  ok(G.GAME.bankrupt_at === b0, 'glalie removed: debt limit restored', G.GAME.bankrupt_at);
}
{
  start('FROSLASS');
  const j = add('j_poke_snorunt');
  j.ability.extra.evolve = true; // (Dawn Stone)
  winRound();
  ok(key(j) === 'j_poke_froslass', 'snorunt -> froslass with a Dawn Stone', key(j));
  nextRound();
  play(hand(['S_A']));
  ok(G.consumeables.cards.length === 0, 'froslass: nothing out of debt');
  G.GAME.dollars = -3;
  play(hand(['S_K']));
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Item', 'froslass: an Item when a hand is played in debt', G.consumeables.cards.map(key));
}

// ---------------------------------------------------------------- Luvdisc
{
  start('LUVDISC');
  add('j_poke_luvdisc');
  ok(G.consumeables.cards.length === 1 && key(G.consumeables.cards[0]) === 'c_poke_heartscale', 'luvdisc: comes holding a Heart Scale', G.consumeables.cards.map(key));
  const r = play(hand(['S_A', 'H_3']));
  ok(r.total.chips === 5 + 11 + 3, 'luvdisc: Splash (every played card scores)', r.total);
}

// ---------------------------------------------------------------- Beldum line
{
  start('BELDUM');
  const j = add('j_poke_beldum');
  let r = play(hand(['S_A']));
  ok(j.ability.extra.chips === 4 && r.total.chips === 16 + 4, 'beldum: +4 chips with an Ace', r.total);
  r = play(hand(['S_3', 'H_3', 'D_3', 'C_3']));
  ok(j.ability.extra.chips === 8 && r.total.chips === 60 + 12 + 8, 'beldum: +4 on a Four of a Kind', r.total);
  play(hand(['S_A', 'H_A', 'D_A', 'C_A']));
  ok(j.ability.extra.chips === 16, 'beldum: +8 on Four Aces', j.ability.extra.chips);
  play(hand(['S_K']));
  ok(j.ability.extra.chips === 16, 'beldum: nothing otherwise');
  j.ability.extra.chips = 50;
  winRound();
  ok(key(j) === 'j_poke_metang' && j.ability.extra.chips === 50 && j.ability.extra.chip_mod === 8, 'beldum -> metang at 50 chips (kept)', j.ability.extra);
  nextRound();
  play(hand(['S_A']));
  ok(j.ability.extra.chips === 50, 'metang: one Ace is not enough');
  r = play(hand(['S_A', 'H_A']));
  ok(j.ability.extra.chips === 58 && r.total.chips === 32 + 58, 'metang: +8 with 2+ Aces', r.total);
  play(hand(['S_A', 'H_A', 'D_A', 'C_A']));
  ok(j.ability.extra.chips === 74, 'metang: +16 on Four Aces', j.ability.extra.chips);
  j.ability.extra.chips = 200;
  winRound();
  ok(key(j) === 'j_poke_metagross' && j.ability.extra.chips === 200, 'metang -> metagross at 200', j.ability.extra);
  nextRound();
  r = play(hand(['S_K']));
  ok(r.total.chips === 15 + 200, 'metagross: +200 chips', r.total);
  const four = hand(['S_9', 'H_9', 'D_9', 'C_9'], { center: 'm_bonus' });
  r = play(four.concat(hand(['S_2'])));
  // Four of a Kind 60 + 4 * (9 + 30) + 200; each 9 gives X (39 ^ 1/4) -> 7 * 39
  ok(r.total.chips === 60 + 156 + 200 && near(r.total.mult, 7 * 39), 'metagross: X fourth root of each card\'s chips on a Four of a Kind', r.total);
}

// ---------------------------------------------------------------- Jirachi
{
  start('JIRACHI');
  const j = add('j_poke_jirachi');
  winRound();
  act({ type: 'cash_out' });
  ok(G.STATE === STATES.SHOP, 'in the shop');
  const res = act({ type: 'next_round' });
  ok(res.events.some((e) => e.type === 'tag_added' && e.tag === 'tag_poke_jirachi_tag') || G.GAME.tags.some((t) => t.key === 'tag_poke_jirachi_tag'),
    'jirachi: makes a wish (Jirachi tag) at the end of the shop', res.events.filter((e) => /tag/.test(e.type)));
  ok(key(j) === 'j_poke_jirachi', 'jirachi stays');
  // The tag opens the Wish Pack right away (tags1 / packs1 / martz): pick a wish.
  const wishes = (G.pack_cards ? G.pack_cards.cards : []).map(key);
  ok(wishes.includes('c_poke_fake_banker'), 'the Jirachi tag opens the Wish Pack', wishes);
  const banker = G.pack_cards && G.pack_cards.cards.find((c) => key(c) === 'c_poke_fake_banker');
  if (banker) act({ type: 'use', id: banker.sort_id });
  ok(key(j) === 'j_poke_jirachi_banker', 'jirachi -> jirachi_banker from its wish', key(j));
}
{
  // Banker: doubles the end-of-round payout.
  start('BANKER');
  add('j_poke_jirachi_banker');
  winRound();
  const rows = G.GAME.round_eval.rows;
  const jr = rows.find((x) => x.name === 'joker_jirachi1');
  const before = rows.filter((x) => x !== jr).reduce((n, x) => n + (x.dollars || 0), 0);
  ok(jr && jr.dollars === before && before > 0, 'jirachi_banker: a cash-out row doubling the payout', rows);
}
{
  start('BOOSTER');
  const p0 = G.GAME.extra_pocket_picks || 0, b0 = G.GAME.modifiers.extra_boosters || 0;
  const j = add('j_poke_jirachi_booster');
  ok(G.GAME.extra_pocket_picks === p0 + 1 && (G.GAME.modifiers.extra_boosters || 0) === b0 + 1, 'jirachi_booster: +1 booster slot, +1 card per pack', [G.GAME.extra_pocket_picks, G.GAME.modifiers.extra_boosters]);
  j.remove();
  ok(G.GAME.extra_pocket_picks === p0 && (G.GAME.modifiers.extra_boosters || 0) === b0, 'jirachi_booster removed: back to normal');
}
{
  start('INVIS', {}, { noBlind: true });
  const inv = add('j_poke_jirachi_invis');
  add('j_poke_beldum', 'negative');
  act({ type: 'select_blind' }); clearHand();
  const keys = G.jokers.cards.map(key);
  ok(keys.length === 2 && keys.every((k) => k === 'j_poke_beldum') && !G.jokers.cards.includes(inv), 'jirachi_invis: copies the joker to its right, then leaves', keys);
  ok(G.jokers.cards.filter((c) => c.edition && c.edition.negative).length === 1, 'jirachi_invis: the copy is not Negative');
}
{
  start('COPY');
  const cp = add('j_poke_jirachi_copy');
  const cat = add('j_poke_caterpie');
  const r = play(hand(['S_A']));
  // Caterpie +3; the copy is Caterpie energized once more: 3 + 3 * energy_values.mult
  const boosted = 3 + 3 * energy_values.mult;
  ok(near(r.total.mult, 1 + boosted + 3), 'jirachi_copy: copies the joker to its right, energized once', { t: r.total, boosted });
  ok(cat.ability.extra.mult === 3 && !cat.gone, 'jirachi_copy: the original keeps its own values', cat.ability.extra);
  ok(cp.ability.blueprint_compat === 'compatible', 'jirachi_copy: compatible marker');
  winRound(); nextRound(); winRound();
  ok(key(cat) === 'j_poke_metapod', 'jirachi_copy: the original still evolves on its own', key(cat));
}
{
  start('NEGGING');
  const l0 = G.jokers.config.card_limit;
  const j = add('j_poke_jirachi_negging');
  ok(G.jokers.config.card_limit === l0 + 2 && G.GAME.negative_edition_rate === 2, 'jirachi_negging: +2 joker slots, Negative twice as often', [G.jokers.config.card_limit, G.GAME.negative_edition_rate]);
  j.remove();
  ok(G.jokers.config.card_limit === l0 && G.GAME.negative_edition_rate === 1, 'jirachi_negging removed: back to normal');
}
{
  start('POWER');
  const j = add('j_poke_jirachi_power');
  let r = play(hand(['S_A', 'H_A']));
  ok(r.total.mult === 2 && j.ability.extra.loyalty_remaining === 1, 'jirachi_power: hand 1, nothing', [r.total, j.ability.extra]);
  r = play(hand(['S_K', 'H_K']));
  ok(r.total.mult === 2 && j.ability.extra.loyalty_remaining === 0, 'jirachi_power: hand 2, armed', [r.total, j.ability.extra]);
  r = play(hand(['S_Q', 'H_Q']));
  ok(r.total.mult === 2 * 2 * 2 && j.ability.extra.loyalty_remaining === 2, 'jirachi_power: every 3rd hand each scored card X2', [r.total, j.ability.extra]);
}
{
  start('FIXER');
  const j = add('j_poke_jirachi_fixer');
  const one = hand(['S_A']);
  play(one);
  ok(one[0].edition && (one[0].edition.foil || one[0].edition.holo || one[0].edition.polychrome), 'jirachi_fixer: first hand of 1 card gets an edition', one[0].edition);
  const two = hand(['S_K']);
  play(two);
  ok(!two[0].edition, 'jirachi_fixer: only the first hand');
  const d = hand(['H_5']);
  hand(['H_6', 'H_7']);
  act({ type: 'highlight', ids: [d[0].sort_id] });
  act({ type: 'discard' });
  ok(!G.playing_cards.includes(d[0]) && j.ability.extra.triggered === true, 'jirachi_fixer: first discard of 1 card is destroyed');
  const d2 = G.hand.cards[0];
  act({ type: 'highlight', ids: [d2.sort_id] });
  act({ type: 'discard' });
  ok(G.playing_cards.includes(d2), 'jirachi_fixer: only the first discard');
  winRound();
  ok(j.ability.extra.triggered === undefined, 'jirachi_fixer: resets at end of round');
}

done();
