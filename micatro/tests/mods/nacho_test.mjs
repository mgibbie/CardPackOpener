// Nacho's Pokermon Dip 1.6.4 (micatro/mods/nacho): mod off = none of its content; every enabled
// joker fired through real plays (act) with exact values, every evolution / mega; the Stellar type;
// the Elite stake; each lovely-patch behaviour; the intended-design fixes; the option toggles.
//   node micatro/tests/mods/nacho_test.mjs
import { T, hand, add, play, winRound, clearHand, statusMsgs, G, P_CENTERS, P_CARDS, act, STATES } from './poke_helpers.mjs';
import { newRun } from '../../js/engine/run.js';
import { P_CENTER_POOLS, P_STAKES, get_new_boss, P_BLINDS, create_playing_card } from '../../js/engine/core.js';
import { centerActive } from '../../js/mods/registry.js';
import { describe, describeCenter } from '../../js/engine/describe.js';
import { cardView } from '../../js/engine/view.js';
import { STATUS, LINES, CHALLENGES } from '../../mods/nacho/index.js';
import * as N from '../../mods/nacho/api.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;

/** A run with Pokermon + Nacho (or Pokermon alone), the blind selected and the hand emptied. */
function start(seed, { nacho = true, options = {}, poke = {}, boss = 'bl_wall', noBlind = false, stake } = {}) {
  newRun({ seed, back: 'b_red', stake, mods: nacho ? ['pokermon', 'nacho'] : ['pokermon'], modOptions: { pokermon: poke, nacho: options } });
  G.FORCE_BOSS = boss;
  G.GAME.round_resets.blind_choices.Boss = boss;
  if (noBlind) return;
  act({ type: 'select_blind' });
  clearHand();
}
/** End the round (win), then cash out / shop / next blind. */
function next() {
  if (G.STATE === STATES.SELECTING_HAND) winRound();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  act({ type: 'select_blind' });
  clearHand();
}
const evolveNow = (j) => { winRound(); return key(j); };
const level = (h, n) => { G.GAME.hands[h].level += n; };
const use = (c, joker_targets) => act({ type: 'use', id: c.sort_id, targets: [], joker_targets });

// =================================================================== inventory / off / options
{
  const all = Object.values(P_CENTERS).filter((c) => c.mod === 'nacho' && c.set === 'Joker');
  ok(all.length === 47, '47 jokers written', all.length);
  ok(STATUS.ported.length === 45 && STATUS.unavailable.length === 2, '45 ported + Hisuian Sneasel / Sneasler unavailable', STATUS);
  ok(CHALLENGES.length === 4 && CHALLENGES.map((c) => c.key).join() === 'c_nacho_sinnoh_adv,c_nacho_hibernation,c_nacho_gems,c_nacho_goomygoomy', '4 challenges registered as data', CHALLENGES.map((c) => c.key));

  // OFF: Pokermon alone -> nothing of Nacho's.
  start('NACHO_OFF', { nacho: false });
  ok(!P_CENTER_POOLS.Joker.some((c) => c.mod === 'nacho'), 'off: no Nacho joker in the pools');
  ok(!P_CENTER_POOLS.Stake.some((s) => s.mod === 'nacho'), 'off: no Elite stake');
  let leaked = 0;
  for (let i = 0; i < 300; i++) if (N.get_random_poke_key('off' + i).startsWith('j_nacho_')) leaked++;
  ok(leaked === 0, "off: Pokermon's random Pokémon never picks a Nacho joker", leaked);
  const j = add('j_poke_bulbasaur');
  j.ability.stellar_sticker = true;
  ok(N.type_sticker_applied(j) === false && !N.is_type(j, 'Fire') && N.energy_matches(j, 'Fire') === false, 'off: a stellar_sticker means nothing');
  ok(G.GAME.win_ante === 8 && !G.GAME.modifiers.elite4, 'off: vanilla win ante');

  // ON with the shipped defaults: 43 jokers, the Clauncher line and Hisuian Sneasel line out.
  start('NACHO_ON');
  const act_ = Object.values(P_CENTERS).filter((c) => c.mod === 'nacho' && c.set === 'Joker' && centerActive(c));
  ok(act_.length === 43, 'on: 43 jokers load by default', act_.length);
  for (const k of ['j_nacho_clauncher', 'j_nacho_clawitzer', 'j_nacho_hisuian_sneasel', 'j_nacho_sneasler']) ok(!P_CENTER_POOLS.Joker.includes(P_CENTERS[k]), 'default: not in the pool: ' + k);
  ok(P_CENTER_POOLS.Joker.includes(P_CENTERS.j_nacho_ralts) && P_CENTER_POOLS.Stake.includes(P_STAKES.stake_nacho_elite_stake), 'on: Ralts + the Elite stake available');
  ok(LINES.length === 19 && LINES.find((l) => l.option === 'Clauncher'), '19 lines (one option each)');
  let saw = new Set();
  for (let i = 0; i < 400; i++) saw.add(N.get_random_poke_key('on' + i));
  ok([...saw].some((k) => k.startsWith('j_nacho_')) && !saw.has('j_nacho_clauncher') && !saw.has('j_nacho_hisuian_sneasel'), 'on: random Pokémon can be Nacho\'s, never a disabled line');
  // Toggles: Clauncher on, Ralts off.
  start('NACHO_OPT', { options: { Clauncher: true, Ralts: false } });
  ok(P_CENTER_POOLS.Joker.includes(P_CENTERS.j_nacho_clauncher) && P_CENTER_POOLS.Joker.includes(P_CENTERS.j_nacho_clawitzer), 'Clauncher option on -> its line is in');
  ok(!P_CENTER_POOLS.Joker.includes(P_CENTERS.j_nacho_ralts) && !P_CENTER_POOLS.Joker.includes(P_CENTERS.j_nacho_gallade), 'Ralts option off -> the whole Ralts line is out');
  saw = new Set();
  for (let i = 0; i < 400; i++) saw.add(N.get_random_poke_key('opt' + i));
  ok(!saw.has('j_nacho_ralts') && !saw.has('j_nacho_kirlia'), 'Ralts off: never a random pick');
  start('NACHO_OPT2', { options: { customStakes: false } });
  ok(!P_CENTER_POOLS.Stake.includes(P_STAKES.stake_nacho_elite_stake), 'customStakes off -> no Elite stake');
}

// =================================================================== deck_rank_evo (intended fix)
{
  start('RANKEVO');
  const j = add('j_nacho_bagon');
  // flat path: 30 cards of nominal >= 9 in a 52-card deck (58% < 57%? no: use a flat threshold only)
  let threw = null, r;
  try { r = N.deck_rank_evo(j.config.center, j, { end_of_round: true }, 'j_nacho_shelgon', 9, undefined, 20); } catch (e) { threw = e; }
  ok(!threw, 'deck_rank_evo flat path runs (the Lua compared an undefined `_count` and errored)', threw && threw.message);
  ok(r && 'message' in r, 'deck_rank_evo flat: 24 cards >= 9 >= 20 -> evolves', r);
  G.E_MANAGER.flush();
  ok(key(j) === 'j_nacho_shelgon', 'deck_rank_evo flat -> Shelgon', key(j));
  const r2 = N.deck_rank_evo(P_CENTERS.j_nacho_shelgon, j, { end_of_round: true }, 'j_nacho_salamence', 9, undefined, 25);
  ok(r2 === undefined, 'deck_rank_evo flat below the threshold: no evolution');
}

// =================================================================== Stellar type
{
  start('STELLAR');
  const a = add('j_poke_charmander');
  const b = add('j_poke_squirtle');
  N.apply_type_sticker(a, 'Stellar');
  ok(a.ability.stellar_sticker === true && a.ability.fire_sticker === false && a.ability.extra.ptype === 'Stellar', 'apply Stellar: sticker on, others off, ptype Stellar');
  ok(N.type_sticker_applied(a) === 'Stellar' && N.get_type(a) === 'Stellar', 'type_sticker_applied -> Stellar');
  ok(['Grass', 'Fire', 'Water', 'Dark', 'Metal', 'Dragon', 'Earth', 'Colorless'].every((t) => N.is_type(a, t)), 'is_type: Stellar counts as every type');
  ok(N.find_pokemon_type('Grass').includes(a) && !N.find_pokemon_type('Grass').includes(b), 'find_pokemon_type sees Stellar jokers');
  ok(N.energy_matches(a, 'Grass') && N.energy_matches(a, 'Psychic'), 'energy_matches: any Energy');
  ok(N.matching_energy(a) === undefined && N.matching_energy(b) === 'c_poke_water_energy', 'matching_energy: no "Stellar Energy"');
  const badge = N.type_badge(a);
  ok(badge.label === 'Stellar Tera' && Array.isArray(badge.gradient) && badge.gradient.length === 8, 'badge: "Stellar Tera" with the rainbow gradient', badge);
  const r = N.type_evo(a.config.center, a, { end_of_round: true }, 'j_poke_charmeleon', 'water');
  ok(r && 'message' in r, 'type_evo: Stellar satisfies any type_req', r);
  G.E_MANAGER.flush();
  const e0 = b.ability.extra.energy_count || 0;
  const g = add('c_poke_grass_energy');
  use(g, [a.sort_id]);
  ok((a.ability.extra.energy_count || 0) === 1, 'a Grass Energy energizes a Stellar joker', a.ability.extra);
  void e0;
}

// =================================================================== Elite stake
{
  start('ELITE', { stake: 'stake_nacho_elite_stake', noBlind: true });
  ok(G.GAME.win_ante === 10 && G.GAME.modifiers.elite4 === true, 'Elite: +2 win ante (10) and the elite4 rule', { w: G.GAME.win_ante });
  ok(G.GAME.stake === 8 && G.GAME.modifiers.enable_rentals_in_shop && G.GAME.modifiers.scaling === 3, 'Elite applies Gold (and every stake below)');
  ok(P_STAKES.stake_nacho_elite_stake.applied_stakes[0] === 'gold', 'without Pokermon+ the Elite stake sits above Gold');
  G.FORCE_BOSS = null;
  const showdown = (ante) => { G.GAME.round_resets.ante = ante; const out = new Set(); for (let i = 0; i < 12; i++) out.add(!!P_BLINDS[get_new_boss()].boss.showdown); return [...out]; };
  for (const a of [7, 8, 9, 10]) ok(showdown(a).join() === 'true', `Elite: ante ${a} draws only showdown bosses`, showdown(a));
  for (const a of [1, 2, 5, 6, 11]) ok(showdown(a).join() === 'false', `Elite: ante ${a} draws normal bosses`, showdown(a));
  for (const a of [17, 18, 19, 20]) ok(showdown(a).join() === 'true', `Elite: endless ante ${a} (last 4 of each 10) showdown`);
  start('GOLD', { stake: 8, noBlind: true });
  G.FORCE_BOSS = null;
  ok(showdown(7).join() === 'false' && showdown(8).join() === 'true', 'no Elite: vanilla showdown antes');
  start('ELITE_OFF', { stake: 'stake_nacho_elite_stake', noBlind: true, options: { customStakes: false } });
  ok(G.GAME.win_ante === 8 && !G.GAME.modifiers.elite4, 'customStakes off: the Elite rules never apply');
}

// =================================================================== Gallade / Mega Gallade / Altaria patches
{
  start('GALLADE');
  add('j_nacho_gallade');
  G.GAME.hands.Flush.played = 5; // most played hand
  const pair0 = G.GAME.hands.Pair.level, fl0 = G.GAME.hands.Flush.level;
  use(add('c_mercury'));
  ok(G.GAME.hands.Pair.level === pair0, 'Gallade: the Planet itself levels nothing');
  ok(G.GAME.hands.Flush.level === fl0 + 1, 'Gallade: your most played hand (Flush) +1 level instead', G.GAME.hands.Flush.level);
  G.GAME.hands['High Card'].played = 3;
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 && near(r.total.mult, 1 + 0.15 * 4), 'Gallade: X1.6 on the 4th High Card', r.total);
  const bh0 = G.GAME.hands.Pair.level;
  use(add('c_black_hole'));
  ok(G.GAME.hands.Pair.level === bh0 + 1, 'Gallade: Black Hole (a Spectral) still levels');
}
{
  start('MEGAGALLADE', { boss: 'bl_psychic' });
  next(); next();
  ok(G.GAME.blind.name === 'The Psychic', 'boss is The Psychic', G.GAME.blind.name);
  ok(G.GAME.blind.debuff_hand(hand(['S_K']), {}, 'High Card') === true, 'The Psychic debuffs a 1-card hand normally');
  clearHand();
  const mg = add('j_nacho_mega_gallade');
  ok(G.GAME.blind.debuff_hand(hand(['S_Q']), {}, 'High Card') === undefined, 'Mega Gallade: the blind no longer debuffs hands');
  clearHand();
  G.GAME.hands['High Card'].played = 9;
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 && near(r.total.mult, 1 + 0.3 * 10), 'Mega Gallade: a 1-card hand scores X(1 + 0.3 x played) under The Psychic', r.total);
  mg.set_debuff(true);
  ok(!mg.debuff, "Mega Gallade can't be debuffed");
}
{
  start('MG_CLUB', { boss: 'bl_club' });
  next(); next();
  ok(G.GAME.blind.name === 'The Club', 'boss is The Club', G.GAME.blind.name);
  add('j_nacho_mega_gallade');
  G.GAME.hands.Pair.played = 50; // most played: Pair
  const cards = hand(['C_K', 'C_K']);
  for (const c of cards) G.GAME.blind.debuff_card(c);
  ok(cards.every((c) => c.debuff), 'clubs debuffed by The Club');
  const r = play(cards);
  ok(r.total.chips === 10 + 10 + 10 && near(r.total.mult, 2 * (1 + 0.3 * 51)), 'Mega Gallade: the most-played Pair of clubs scores', r.total);
  clearHand();
  const hc = hand(['C_A']);
  G.GAME.blind.debuff_card(hc[0]);
  act({ type: 'highlight', ids: [hc[0].sort_id] });
  ok(hc[0].debuff, 'not the most played hand -> stays debuffed');
  act({ type: 'highlight', ids: [] });
}
{
  start('ALTARIA', { boss: 'bl_club' });
  next(); next();
  const [nine, ten] = hand(['C_9', 'C_T']);
  G.GAME.blind.debuff_card(nine); G.GAME.blind.debuff_card(ten);
  ok(nine.debuff && ten.debuff, 'without Altaria The Club debuffs club 9s');
  add('j_nacho_altaria');
  G.GAME.blind.debuff_card(nine); G.GAME.blind.debuff_card(ten);
  ok(!nine.debuff && ten.debuff, 'Altaria: the 9 of clubs is protected, the 10 is not');
}

// =================================================================== Ralts line
{
  start('RALTS');
  const j = add('j_nacho_ralts');
  level('Flush', 2); level('Pair', 1);
  let r = play(hand(['S_A']));
  ok(r.total.chips === 16 && r.total.mult === 1 + 3, 'Ralts: +1 Mult per level above 1 (3)', r.total);
  ok(j.ability.extra.rounds === 4, 'Ralts: 4 rounds', j.ability.extra.rounds);
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_nacho_kirlia', 'Ralts -> Kirlia after its rounds', key(j));
  next();
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 2 * 3, 'Kirlia: +2 Mult per level above 1', r.total);
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_nacho_gardevoir', 'Kirlia -> Gardevoir after its rounds', key(j));
  next();
  r = play(hand(['S_A']));
  ok(near(r.total.mult, 1 * (1 + 0.1 * 3)), 'Gardevoir: X(1 + 0.1 per level above 1)', r.total);
  const stone = add('c_poke_megastone');
  use(stone, [j.sort_id]);
  G.E_MANAGER.flush();
  ok(key(j) === 'j_nacho_mega_gardevoir', 'Gardevoir -> Mega Gardevoir (Megastone)', key(j));
  const bh = G.consumeables.cards.find((c) => key(c) === 'c_black_hole');
  ok(bh && bh.edition && bh.edition.negative, 'Mega Gardevoir: a Negative Black Hole on entry');
  const tags0 = G.GAME.tags.length;
  const pl = add('c_pluto');
  use(pl);
  const t = G.GAME.tags[G.GAME.tags.length - 1];
  ok(G.GAME.tags.length === tags0 + 1 && t.key === 'tag_orbital' && G.GAME.hands[t.ability.orbital_hand].visible, 'Mega Gardevoir: a Planet makes an Orbital Tag for a visible hand', t && t.ability);
  const held = add('c_venus');
  winRound();
  ok(held.edition && held.edition.polychrome, 'Mega Gardevoir: held Planets turn Polychrome at end of round', held.edition);
}
{
  start('KIRLIA_ITEM');
  const j = add('j_nacho_kirlia');
  const ds = add('c_poke_dawnstone');
  use(ds, [j.sort_id]);
  ok(j.ability.extra.evolve, 'Dawn Stone marks Kirlia');
  ok(evolveNow(j) === 'j_nacho_gallade', 'Kirlia + Dawn Stone -> Gallade', key(j));
  next();
  const stone = add('c_poke_megastone');
  use(stone, [j.sort_id]);
  G.E_MANAGER.flush();
  ok(key(j) === 'j_nacho_mega_gallade', 'Gallade -> Mega Gallade', key(j));
  next();
  use(stone, [j.sort_id]);
  G.E_MANAGER.flush();
  ok(key(j) === 'j_nacho_gallade', 'Mega Gallade -> back to Gallade', key(j));
}

// =================================================================== Swablu line
{
  start('SWABLU');
  const j = add('j_nacho_swablu');
  winRound();
  const row = G.GAME.round_eval.rows.find((x) => x.center === 'j_nacho_swablu');
  ok(row && row.dollars === 4, 'Swablu: $1 per 9 in the deck (4)', row);
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_nacho_altaria', 'Swablu -> Altaria', key(j));
  G.playing_cards.find((c) => c.get_id() === 9).set_ability(P_CENTERS.m_bonus);
  next();
  winRound();
  const row2 = G.GAME.round_eval.rows.find((x) => x.center === 'j_nacho_altaria');
  ok(row2 && row2.dollars === 5, 'Altaria: $1 per 9, $2 per enhanced 9 (3 + 2)', row2);
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  const stone = add('c_poke_megastone');
  use(stone, [j.sort_id]);
  G.E_MANAGER.flush();
  ok(key(j) === 'j_nacho_mega_altaria', 'Altaria -> Mega Altaria', key(j));
  const [n1, n2, k] = hand(['S_9', 'H_9', 'S_K']);
  play([n1, n2, k]);
  ok(n1.edition && n2.edition && !k.edition, 'Mega Altaria: played 9s gain an edition (the King doesn\'t)', [n1.edition, n2.edition]);
}

// =================================================================== Bagon line
{
  start('BAGON');
  const j = add('j_nacho_bagon');
  const held = hand(['D_5', 'D_7']);
  const r = play(hand(['S_K', 'H_K', 'S_4', 'H_4']));
  // Two Pair level 1: 20 chips x 2; K K 4 4 scored: mult += 10/3 + 10/3 + 4/3 + 4/3
  ok(r.total.chips === 20 + 10 + 10 + 4 + 4 && near(r.total.mult, 2 + (10 + 10 + 4 + 4) / 3), 'Bagon: Two Pair cards give rank/3 Mult', r.total);
  ok(held[1].base.value === '8' && held[0].base.value === '5', 'Bagon: the rightmost held card rises a rank (7 -> 8)', held.map((c) => c.base.value));
  const r2 = play(hand(['S_K', 'S_Q']));
  ok(r2.total.mult === 1, 'Bagon: nothing outside Two Pair', r2.total);
  // Evolve: 57% of the deck >= 9.
  for (const c of G.playing_cards.slice(0, 20)) N.change_base(c, null, 'King');
  ok(evolveNow(j) === 'j_nacho_shelgon', 'Bagon -> Shelgon at 57% high ranks', key(j));
  next();
  const held2 = hand(['D_2', 'D_5', 'D_7']);
  const r3 = play(hand(['S_K', 'H_K', 'S_4', 'H_4']));
  ok(near(r3.total.mult, 2 + (10 + 10 + 4 + 4) / 2), 'Shelgon: rank/2 Mult', r3.total);
  ok(held2.map((c) => c.base.value).join() === '2,6,8', 'Shelgon: the two rightmost held cards rise', held2.map((c) => c.base.value));
  for (const c of G.playing_cards) N.change_base(c, null, 'King');
  ok(evolveNow(j) === 'j_nacho_salamence', 'Shelgon -> Salamence at 75%', key(j));
  next();
  for (const c of G.playing_cards) N.change_base(c, null, '4');
  N.change_base(G.playing_cards[0], null, 'Ace');
  const tp = hand(['S_K', 'H_K', 'S_4', 'H_4']);
  const avg = G.playing_cards.reduce((n, c) => n + c.base.nominal, 0) / G.playing_cards.length;
  const r4 = play(tp);
  ok(near(r4.total.mult, 2 * Math.pow(1 + avg * 0.1, 4)), 'Salamence: each Two Pair card X(1 + avg deck rank x 0.1)', { m: r4.total.mult, want: 2 * Math.pow(1 + avg * 0.1, 4) });
  const stone = add('c_poke_megastone');
  use(stone, [j.sort_id]);
  G.E_MANAGER.flush();
  ok(key(j) === 'j_nacho_mega_salamence', 'Salamence -> Mega Salamence', key(j));
  const r5 = play(hand(['S_A', 'H_A', 'S_4', 'H_4']));
  // Aces retrigger twice (nominal 11 - 9), 4s none: 3 x (11 + X1.5) per Ace, 1 x per 4.
  ok(r5.total.chips === 20 + 11 * 3 * 2 + 4 + 4 && near(r5.total.mult, 2 * Math.pow(1.5, 3 + 3 + 1 + 1)), 'Mega Salamence: X1.5 per scoring card, retrigger per rank above 9', r5.total);
}

// =================================================================== Sinnoh starters
{
  start('TURTWIG');
  const hs = G.hand.config.card_limit, cap = G.GAME.interest_cap;
  const j = add('j_nacho_turtwig');
  ok(G.hand.config.card_limit === hs + 1, 'Turtwig: +1 hand size');
  winRound();
  ok(G.GAME.interest_cap === cap + 5 && j.ability.extra.counter === 1, 'Turtwig: Leech Seed raises the interest cap by $5', G.GAME.interest_cap);
  next();
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_nacho_grotle', 'Turtwig -> Grotle', key(j));
  G.E_MANAGER.flush();
  ok(G.GAME.interest_cap === cap + 5 && j.ability.extra.counter === 1, 'Grotle keeps the seeded interest (counter carried through money)', { cap: G.GAME.interest_cap, c: j.ability.extra.counter });
  next(); // setting_blind: hand size by money
  const want = Math.min(2, Math.floor(G.GAME.dollars / 15));
  ok(j.ability.extra.h_size === want && G.hand.config.card_limit === hs + want, 'Grotle: +1 hand size per $15 (max 2)', { h: j.ability.extra.h_size, d: G.GAME.dollars });
  winRound();
  ok(G.GAME.interest_cap === cap + 15 && j.ability.extra.counter === 3, 'Grotle: +$2 interest cap per round', G.GAME.interest_cap);
  next();
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_nacho_torterra', 'Grotle -> Torterra', key(j));
  G.E_MANAGER.flush();
  ok(G.GAME.interest_cap === cap + 15, 'Torterra keeps it', G.GAME.interest_cap);
  next();
  G.GAME.dollars = 100;
  winRound();
  ok(G.GAME.interest_cap === cap + 30 && j.ability.extra.counter === 6, 'Torterra: +$3 interest cap per round', G.GAME.interest_cap);
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  ok(j.ability.extra.h_size === 4, 'Torterra: hand size max 4 ($100)', j.ability.extra.h_size);
  const lim = G.hand.config.card_limit;
  act({ type: 'sell', id: j.sort_id });
  ok(G.GAME.interest_cap === cap && G.hand.config.card_limit === lim - 4, 'selling gives the interest cap and hand size back', G.GAME.interest_cap);
}
{
  start('CHIMCHAR');
  const d0 = G.GAME.current_round.discards_left;
  const j = add('j_nacho_chimchar');
  ok(G.GAME.current_round.discards_left === d0 + 1, 'Chimchar: +1 discard');
  const ds = hand(['S_5', 'H_A', 'D_3']);
  act({ type: 'highlight', ids: ds.map((c) => c.sort_id) }); act({ type: 'discard' });
  clearHand();
  ok(j.ability.extra.mult === 11, 'Chimchar: Mult = highest rank discarded (Ace 11)', j.ability.extra.mult);
  const r = play(hand(['S_2']));
  ok(r.total.mult === 1 + 11, 'Chimchar: +11 Mult', r.total);
  winRound();
  ok(j.ability.extra.mult === 0 && j.ability.extra.max_scored === 1, 'Chimchar: resets, counts a round at >= 11', j.ability.extra);
  j.ability.extra.max_scored = 3;
  next();
  const d2 = hand(['S_A']);
  act({ type: 'highlight', ids: [d2[0].sort_id] }); act({ type: 'discard' }); clearHand();
  ok(evolveNow(j) === 'j_nacho_monferno', 'Chimchar -> Monferno after 4 rounds at +11', key(j));
  next();
  for (const set of [['S_5', 'H_K'], ['D_9']]) { const c = hand(set); act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'discard' }); clearHand(); }
  ok(j.ability.extra.mult === 10 + 9, 'Monferno: + the highest rank of each discard (10 + 9)', j.ability.extra.mult);
  j.ability.extra.mult = 30; j.ability.extra.max_scored = 3;
  ok(evolveNow(j) === 'j_nacho_infernape', 'Monferno -> Infernape after 4 rounds at +30', key(j));
  next();
  const c = hand(['S_K', 'H_A', 'D_5']);
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'discard' }); clearHand();
  ok(near(j.ability.extra.Ymult, 1.6), 'Infernape: X0.3 per discarded face card / Ace', j.ability.extra.Ymult);
  const r2 = play(hand(['S_2']));
  ok(r2.total.mult === (1 + 30) * 1.6 || near(r2.total.mult, (1 + 30) * 1.6), 'Infernape: +30 Mult X1.6', r2.total);
  winRound();
  ok(j.ability.extra.Ymult === 1, 'Infernape: X resets at end of round');
  const dl = G.GAME.round_resets.discards;
  act({ type: 'cash_out' });
  act({ type: 'sell', id: j.sort_id });
  ok(G.GAME.round_resets.discards === dl - 1, 'selling Infernape takes the discard back');
}
{
  start('PIPLUP');
  const h0 = G.GAME.current_round.hands_left;
  const j = add('j_nacho_piplup');
  ok(G.GAME.current_round.hands_left === h0 + 1 && G.GAME.round_resets.hands === 5, 'Piplup: +1 hand');
  let r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 60, 'Piplup: +80 - 20 x 1 scoring card', r.total);
  r = play(hand(['S_A', 'H_A', 'D_A', 'C_A', 'S_K']));
  ok(r.total.chips === 60 + 44 + 0, 'Piplup: 4 scoring cards -> +0 (Four of a Kind)', r.total);
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_nacho_prinplup', 'Piplup -> Prinplup', key(j));
  next();
  hand(['D_7', 'D_K']);
  r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 30 + 7 + 10, 'Prinplup: +30, held cards give their rank in chips', r.total);
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_nacho_empoleon', 'Prinplup -> Empoleon', key(j));
  next();
  hand(['D_7', 'D_K']);
  r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 50 + 14 + 20, 'Empoleon: +50, held cards give double their rank', r.total);
}

// =================================================================== Audino (+ the level_evo patch, poke_evolved)
{
  start('AUDINO');
  const ralts = add('j_nacho_ralts');
  const au = add('j_nacho_audino');
  const r0 = play(hand(['S_A']));
  ok(r0.total.mult === 1, 'Audino: X1 to start', r0.total);
  const ev = winRound();
  ok(ralts.ability.extra.rounds === 2, 'Audino: level_evo takes an extra step per Audino (4 -> 2)', ralts.ability.extra.rounds);
  ok(statusMsgs(ev.events).filter((m) => m === N.localize('poke_evolve_level')).length >= 2, 'Audino: an extra "level" status', statusMsgs(ev.events));
  next();
  winRound(); // 2 -> 0: evolves
  G.E_MANAGER.flush();
  ok(key(ralts) === 'j_nacho_kirlia', 'with Audino, Ralts evolves after 2 rounds', key(ralts));
  ok(near(au.ability.extra.Xmult, 1.25), 'Audino: +X0.25 when a Pokémon evolves (poke_evolved)', au.ability.extra.Xmult);
  next();
  const r1 = play(hand(['S_A']));
  ok(near(r1.total.mult, 1.25), 'Audino: X1.25', r1.total);
  au.debuff = true;
  ralts.ability.extra.rounds = 4;
  winRound();
  ok(ralts.ability.extra.rounds === 3, 'a debuffed Audino gives no extra step', ralts.ability.extra.rounds);
  au.debuff = false;
  next();
  const stone = add('c_poke_megastone');
  use(stone, [au.sort_id]);
  G.E_MANAGER.flush();
  ok(key(au) === 'j_nacho_mega_audino' && au.ability.extra.ptype === 'Fairy', 'Audino -> Mega Audino (Fairy)', key(au));
  ok(near(au.ability.extra.Xmult, 1.25), 'Mega Audino keeps the scaled X', au.ability.extra.Xmult);
}
{
  start('MEGAAUDINO');
  add('j_nacho_mega_audino');
  const n0 = G.jokers.cards.length;
  winRound();
  const egg = G.jokers.cards.find((c) => key(c) === 'j_poke_mystery_egg');
  ok(egg && G.jokers.cards.length === n0 + 1 && egg.edition && egg.ability.extra.rounds === 1, 'Mega Audino: a Mystery Egg with an edition, hatching next round', egg && egg.edition);
  ok(G.GAME.joker_buffer === 0, 'joker_buffer back to 0');
  // Full row WITH a Basic (the egg itself counts as a hatchling): no egg, and no leaked buffer.
  next();
  G.jokers.config.card_limit = G.jokers.cards.length;
  const n1 = G.jokers.cards.length;
  winRound();
  ok(G.jokers.cards.filter((c) => key(c) === 'j_poke_mystery_egg').length <= 1 && G.jokers.cards.length <= n1 + 0 + 1 && G.GAME.joker_buffer === 0,
    'Mega Audino (fix): full row with hatchlings -> no new egg, no leaked joker_buffer', { n: G.jokers.cards.length, n1, buf: G.GAME.joker_buffer });
}
{
  start('MEGAAUDINO2');
  const ma = add('j_nacho_mega_audino');
  add('j_nacho_caterpie_placeholder' in P_CENTERS ? 'x' : 'j_poke_caterpie');
  G.jokers.config.card_limit = 2;
  winRound();
  ok(G.jokers.cards.length === 2 && G.GAME.joker_buffer === 0, 'Mega Audino (fix): full row + a Basic -> no egg (the Lua overflowed and leaked a buffer slot)', G.jokers.cards.map(key));
  next();
  G.jokers.remove_card(G.jokers.cards[1]);
  G.jokers.config.card_limit = 1;
  winRound();
  ok(G.jokers.cards.length === 2 && key(G.jokers.cards[1]) === 'j_poke_mystery_egg', 'Mega Audino: no Basic/Baby -> the egg may exceed the slots (Day Care)', G.jokers.cards.map(key));
  G.GAME.probabilities.normal = 10;
  next(); G.jokers.config.card_limit = 1;
  for (const c of G.jokers.cards.slice(1)) G.jokers.remove_card(c);
  winRound();
  const egg = G.jokers.cards[1];
  ok(egg && egg.edition && egg.edition.poke_shiny, 'Mega Audino: 1 in 10 shiny (forced)', egg && egg.edition);
  void ma;
}

// =================================================================== Hisuian Zorua line
{
  start('HZORUA');
  add('j_joker'); // +4 Mult, leftmost
  const z = add('j_nacho_hisuian_zorua');
  ok(N.type_sticker_applied(z) === 'Colorless' && P_CENTERS[z.ability.extra.hidden_key], 'Hisuian Zorua: Colorless Tera + a disguise picked outside the row', z.ability.extra.hidden_key);
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4 + 4, 'Hisuian Zorua: copies the leftmost joker (Joker +4)', r.total);
  ok(z.ability.extra.active === false, 'Hisuian Zorua: revealed after scoring while copying');
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4, 'Hisuian Zorua: no copy until end of round', r.total);
  winRound();
  ok(z.ability.extra.active === true, 'Hisuian Zorua: active again after the round');
  next();
  z.ability.extra.rounds = 1;
  ok(evolveNow(z) === 'j_nacho_hisuian_zoroark', 'Hisuian Zorua -> Hisuian Zoroark', key(z));
  next();
  r = play(hand(['S_A'])); r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4 + 4, 'Hisuian Zoroark: always copies the leftmost joker', r.total);
}

// =================================================================== Clauncher line (off by default; on here)
{
  start('CLAUNCHER', { options: { Clauncher: true } });
  const j = add('j_nacho_clauncher');
  const [a, b] = hand(['S_5', 'H_5']);
  a.set_edition({ foil: true }, true); b.set_edition({ holo: true }, true);
  let r = play([a, b]);
  ok(r.total.chips === 10 + (5 + 50) * 2 + 5 * 2 && r.total.mult === 2 + 10 * 2, 'Clauncher: each unique edition retriggers once', r.total);
  const [c, d] = hand(['S_5', 'H_5']);
  c.set_edition({ foil: true }, true); d.set_edition({ foil: true }, true);
  r = play([c, d]);
  ok(r.total.chips === 10 + 55 * 2 + 55, 'Clauncher: a repeated edition only retriggers the first card', r.total);
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_nacho_clawitzer', 'Clauncher -> Clawitzer', key(j));
  next();
  const [e, f] = hand(['S_5', 'H_5']);
  e.set_edition({ foil: true }, true); f.set_edition({ foil: true }, true);
  r = play([e, f]);
  ok(r.total.chips === 10 + 55 * 4, 'Clawitzer: every editioned card retriggers', r.total);
  // in_pool: only with Foil/Holo/Polychrome deck cards (fix: Holographic counts).
  for (const pc of G.playing_cards) pc.set_edition(null, true, true);
  ok(P_CENTERS.j_nacho_clauncher.in_pool() === false, 'Clauncher not in pool without editions');
  G.playing_cards[0].set_edition({ holo: true }, true, true);
  ok(P_CENTERS.j_nacho_clauncher.in_pool() === true, 'Clauncher in pool with a Holographic card (fix: the Lua checked `holographic`)');
}

// =================================================================== Dedenne / Carbink
{
  start('DEDENNE');
  add('j_nacho_dedenne');
  G.GAME.probabilities.normal = 4; // 1 in 4 -> certain
  hand(['S_K'], { center: 'm_gold' });
  const c0 = G.consumeables.cards.length;
  winRound(hand(['S_2']));
  ok(G.consumeables.cards.length === c0 + 1 && G.consumeables.cards[c0].ability.set === 'Item', 'Dedenne: a held Gold card makes an Item when it pays', G.consumeables.cards.map(key));
}
{
  start('CARBINK');
  const stone = hand(['S_K'], { center: 'm_stone' })[0];
  let d0 = G.GAME.dollars;
  winRound(hand(['S_2']));
  ok(G.GAME.dollars === d0, 'no Carbink: a held Stone card pays nothing');
  next();
  add('j_nacho_carbink');
  ok(N.has_enhancement(stone, 'm_gold') && !N.has_enhancement(hand(['S_3'])[0], 'm_gold'), 'Carbink: rankless cards count as Gold (quantum)');
  clearHand();
  G.hand.emplace(stone.area ? (stone.area.remove_card(stone), stone) : stone);
  d0 = G.GAME.dollars;
  winRound(hand(['S_2']));
  ok(G.GAME.dollars === d0 + 3, 'Carbink: a held Stone card pays $3 like a Gold card', G.GAME.dollars - d0);
  ok(P_CENTERS.j_nacho_carbink.in_pool() === true, 'Carbink in pool once a deck card has no rank');
}

// =================================================================== Goomy line
{
  start('GOOMY');
  const j = add('j_nacho_goomy');
  const held = hand(['H_2', 'S_3']);
  const fl = hand(['H_4', 'H_6', 'H_8', 'H_T', 'H_K']);
  play(fl);
  ok(fl.every((c) => c.ability.perma_mult === 1) && held[0].ability.perma_mult === 1 && !held[1].ability.perma_mult, 'Goomy: Flush -> played + held hearts +1 perma Mult (not the spade)', [fl[0].ability.perma_mult, held[0].ability.perma_mult, held[1].ability.perma_mult]);
  ok(j.ability.extra.flushes === 1, 'Goomy: counts the Flush');
  j.ability.extra.flushes = 6;
  ok(evolveNow(j) === 'j_nacho_sliggoo', 'Goomy -> Sliggoo after 6 Flushes', key(j));
  next();
  const fl2 = hand(['H_4', 'H_6', 'H_8', 'H_T', 'H_K']);
  play(fl2);
  ok(fl2.every((c) => c.ability.perma_mult === 5), 'Sliggoo: +1 perma Mult per unique scoring rank (5)', fl2[0].ability.perma_mult);
  j.ability.extra.flushes = 8;
  ok(evolveNow(j) === 'j_nacho_goodra', 'Sliggoo -> Goodra after 8 Flushes', key(j));
  next();
  const fl3 = hand(['H_4', 'H_6', 'H_8', 'H_T', 'H_K']);
  play(fl3);
  ok(fl3.every((c) => near(c.ability.perma_x_mult, 0.1)), 'Goodra: +X0.02 perma Mult per unique rank (0.1)', fl3[0].ability.perma_x_mult);
}
{
  start('HGOOMY');
  const j = add('j_nacho_goomy');
  play(hand(['H_K', 'H_K', 'H_K', 'H_4', 'H_4']));
  ok(j.ability.extra.flush_houses === 1, 'Goomy: counts the Flush House');
  ok(evolveNow(j) === 'j_nacho_hisuian_sliggoo', 'Goomy -> Hisuian Sliggoo after a Flush House', key(j));
  next();
  let c0 = G.consumeables.cards.length;
  play(hand(['H_K', 'H_K', 'H_K', 'H_4', 'H_4']));
  ok(G.consumeables.cards.length === c0 + 1 && key(G.consumeables.cards[c0]) === 'c_poke_metalcoat', 'Hisuian Sliggoo: a Metal Coat per Flush House (gap 6)');
  for (const c of G.consumeables.cards.slice()) { G.consumeables.remove_card(c); }
  play(hand(['H_A', 'H_A', 'H_A', 'H_2', 'H_2']));
  ok(G.consumeables.cards.length === 2, 'Hisuian Sliggoo: two Metal Coats when the ranks are > 6 apart', G.consumeables.cards.map(key));
  j.ability.extra.flush_houses = 6;
  for (const c of G.consumeables.cards.slice()) G.consumeables.remove_card(c);
  ok(evolveNow(j) === 'j_nacho_hisuian_goodra', 'Hisuian Sliggoo -> Hisuian Goodra after 6', key(j));
  next();
  hand(['S_5', 'D_6'], { center: 'm_steel' });
  const r = play(hand(['H_A', 'H_A', 'H_A', 'H_2', 'H_2']));
  ok(G.consumeables.cards.some((c) => key(c) === 'c_poke_metalcoat'), 'Hisuian Goodra: Flush House makes a Metal Coat');
  // Flush House lvl 1 = 140 x 14; held Steel: X1.5 (steel) x X3 (9/3) each.
  ok(near(r.total.mult, 14 * Math.pow(1.5 * 3, 2)), 'Hisuian Goodra: held Steel cards X(rank gap / 3)', r.total);
}

// =================================================================== Oranguru
{
  start('ORANGURU');
  const o = add('j_nacho_oranguru');
  for (const c of G.playing_cards.slice(0, 12)) N.change_base(c, null, 'Queen');
  winRound(); act({ type: 'cash_out' });
  G.GAME.dollars = 100;
  const b = G.shop_booster.cards[0];
  G.shop_booster.remove_card(b);
  const sb = new (b.constructor)(P_CARDS.empty, P_CENTERS.p_standard_normal_1);
  G.shop_booster.emplace(sb);
  act({ type: 'buy', id: sb.sort_id });
  ok(G.STATE === STATES.STANDARD_PACK, 'Standard pack open');
  ok(G.GAME.pack_choices === 2 && o.ability.extra.raised, 'Oranguru: +1 choice in Standard packs', G.GAME.pack_choices);
  ok(G.pack_cards.cards.length === 3 && G.pack_cards.cards.every((c) => c.base.value === 'Queen'), 'Oranguru: Standard pack cards are your most common rank (Queen)', G.pack_cards.cards.map((c) => c.base.value));
  act({ type: 'skip_booster' });
  const ab = new (b.constructor)(P_CARDS.empty, P_CENTERS.p_arcana_normal_1);
  G.shop_booster.emplace(ab);
  act({ type: 'buy', id: ab.sort_id });
  ok(!o.ability.extra.raised && G.GAME.modifiers.booster_choice_mod === 0 && G.GAME.pack_choices === 1, 'Oranguru: a non-Standard pack lowers it back', G.GAME.pack_choices);
  act({ type: 'skip_booster' });
  // Without Oranguru the pack is the base roll.
  act({ type: 'sell', id: o.sort_id });
  const sb2 = new (b.constructor)(P_CARDS.empty, P_CENTERS.p_standard_normal_1);
  G.shop_booster.emplace(sb2);
  act({ type: 'buy', id: sb2.sort_id });
  ok(G.GAME.pack_choices === 1 && !G.pack_cards.cards.every((c) => c.base.value === 'Queen'), 'no Oranguru: 1 choice, ordinary ranks', G.pack_cards.cards.map((c) => c.base.value));
}

// =================================================================== Passimian
{
  start('PASSIMIAN');
  const p = add('j_nacho_passimian');
  const ralts = add('j_nacho_ralts');
  ralts.set_edition({ foil: true }, true);
  level('Flush', 2);
  const lim = G.jokers.config.card_limit;
  act({ type: 'sell', id: ralts.sort_id });
  ok(p.ability.received_key === 'j_nacho_ralts' && p.ability.name === 'ralts' && key(p) === 'j_nacho_passimian', 'Passimian receives a sold joker\'s ability', p.ability);
  ok(G.jokers.config.card_limit === lim + 1 && p.ability.received_edition, 'Passimian: +1 slot for a received (non-Negative) edition');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 2, 'Passimian (Ralts): +1 Mult per level above 1', r.total);
  ok(N.find_card('j_nacho_ralts').includes(p), 'find_card finds Passimian under the received key');
  // "Evolution" of the received ability: received, not evolved.
  p.ability.extra.rounds = 1;
  winRound();
  G.E_MANAGER.flush();
  ok(key(p) === 'j_nacho_passimian' && p.ability.received_key === 'j_nacho_kirlia', 'Passimian receives the evolved ability (stays Passimian)', p.ability.received_key);
  next();
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 2 * 2, 'Passimian (Kirlia): +2 Mult per level', r.total);
  // Energy scales the received card's base values (Fighting Energy: Passimian is Fighting).
  const mm = p.ability.extra.mult_mod;
  use(add('c_poke_fighting_energy'), [p.sort_id]);
  ok(near(p.ability.extra.mult_mod, mm + P_CENTERS.j_nacho_kirlia.config.extra.mult_mod * 0.2), 'Energy on Passimian scales the received Kirlia base', p.ability.extra.mult_mod);
  act({ type: 'sell', id: p.sort_id });
  ok(G.jokers.config.card_limit === lim, 'selling Passimian gives the edition slot back');
}
{
  start('PASSIMIAN_DAGGER', { noBlind: true });
  const p = add('j_nacho_passimian');
  const dagger = add('j_ceremonial');
  add('j_nacho_skwovet');
  act({ type: 'select_blind' });
  G.E_MANAGER.flush();
  ok(p.ability.received_key === 'j_nacho_skwovet', 'Passimian receives a joker Ceremonial Dagger destroys (joker_type_destroyed)', p.ability.received_key);
  clearHand();
  const egg = add('j_poke_caterpie');
  N.remove(egg.config.center, egg, {});
  G.E_MANAGER.flush();
  ok(p.ability.received_key === 'j_nacho_skwovet', 'Passimian only receives once');
  const p2 = add('j_nacho_passimian');
  const v = add('j_jolly');
  N.remove(v.config.center, v, {});
  G.E_MANAGER.flush();
  ok(p2.ability.received_key === 'j_jolly' && p2.ability.name === 'Jolly Joker', "Pokermon's remove() fires joker_type_destroyed: a second Passimian receives Jolly Joker", p2.ability.received_key);
  const r = play(hand(['S_A', 'H_A']));
  ok(r.total.mult === 2 + dagger.ability.mult + 8, 'Passimian (Jolly Joker): +8 Mult on a Pair (base-game logic by name)', r.total);
  // Negative edition: no extra slot (intended fix — the text says non-Negative).
  const p3 = add('j_nacho_passimian');
  const neg = add('j_joker');
  neg.set_edition({ negative: true }, true);
  const lim = G.jokers.config.card_limit;
  act({ type: 'sell', id: neg.sort_id });
  G.E_MANAGER.flush();
  ok(p3.ability.received_key === 'j_joker' && !p3.ability.received_edition && G.jokers.config.card_limit === lim - 1, 'Passimian: a Negative edition gives no slot (fix)', G.jokers.config.card_limit - lim);
}
{
  start('PASSIMIAN_MEGA');
  const p = add('j_nacho_passimian');
  const g = add('j_nacho_gallade');
  const stone = add('c_poke_megastone');
  use(stone, [g.sort_id]);
  G.E_MANAGER.flush();
  ok(key(g) === 'j_nacho_mega_gallade' && stone.ability.extra.used_on === 'j_nacho_mega_gallade', 'mega made');
  act({ type: 'sell', id: g.sort_id });
  G.E_MANAGER.flush();
  ok(p.ability.received_key === 'j_nacho_mega_gallade' && p.ability.name === 'mega_gallade', 'Passimian holds Mega Gallade');
  p.set_debuff(true);
  ok(!p.debuff, "Passimian holding Mega Gallade can't be debuffed (its ability name)");
  winRound();
  ok(stone.ability.extra.usable && stone.ability.extra.used_on === undefined, 'Megastone: freed when a Passimian holds its mega (reset patch)', stone.ability.extra);
}

// =================================================================== Turtonator
{
  start('TURTONATOR', { boss: 'bl_wall' });
  const t = add('j_nacho_turtonator');
  next(); next();
  ok(G.GAME.blind.name === 'The Wall' && t.ability.extra.trapped, 'Turtonator: The Wall triggers at setting_blind -> Shell Trap', t.ability.extra);
  let r = play(hand(['S_A', 'H_A']));
  ok(near(r.total.mult, 2 * 1.5 * 1.5), 'Turtonator: X1.5 per scoring card on the next hand', r.total);
  r = play(hand(['S_A', 'H_A']));
  ok(r.total.mult === 2 && !t.ability.extra.trapped, 'Turtonator: one hand only', r.total);
}
{
  start('TURTONATOR_HOOK', { boss: 'bl_hook' });
  const t = add('j_nacho_turtonator');
  next(); next();
  ok(G.GAME.blind.name === 'The Hook' && !t.ability.extra.trapped, 'The Hook: not trapped before a hand');
  hand(['D_2', 'D_3', 'D_4']);
  const r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.5), 'Turtonator: The Hook fires on press_play -> X1.5 this hand', r.total);
}
{
  start('TURTONATOR_BELL', { boss: 'bl_final_bell' });
  const t = add('j_nacho_turtonator');
  next(); winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); // (hand kept)
  ok(G.GAME.blind.name === 'Cerulean Bell', 'boss is Cerulean Bell');
  const forced = G.hand.cards.find((c) => c.ability.forced_selection);
  ok(forced, 'Cerulean Bell forced a card');
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  const res = act({ type: 'play' });
  const tot = res.events.find((e) => e.type === 'hand_total');
  ok(tot && tot.hand === 'High Card' && near(tot.mult, 1.5) && !t.ability.extra.trapped, 'Turtonator: Cerulean Bell\'s forced selection fires the trap (X1.5 that hand)', tot);
}

// =================================================================== Skwovet line
{
  start('SKWOVET', { noBlind: true });
  const j = add('j_nacho_skwovet');
  const pl = add('c_mercury');
  use(pl);
  ok(j.ability.extra.mult === 0, 'Skwovet: nothing outside a blind');
  act({ type: 'select_blind' }); clearHand();
  use(add('c_venus'));
  ok(j.ability.extra.mult === 1, 'Skwovet: +1 Mult per consumable used during a blind');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 2, 'Skwovet: scores its Mult', r.total);
  j.ability.extra.mult = 12;
  ok(evolveNow(j) === 'j_nacho_greedent', 'Skwovet -> Greedent at +12', key(j));
  next();
  G.GAME.probabilities.normal = 8;
  const c0 = G.consumeables.cards.length;
  use(add('c_venus'));
  const lo = G.consumeables.cards.find((c) => key(c) === 'c_poke_leftovers');
  ok(j.ability.extra.mult === 13 && lo && lo.edition && lo.edition.negative, 'Greedent: +1 Mult and a Negative Leftovers (1 in 8, forced)', [j.ability.extra.mult, G.consumeables.cards.map(key)]);
  void c0;
}

// =================================================================== Galarian Meowth / Perrserker
{
  start('GMEOWTH');
  const m = add('j_nacho_galarian_meowth');
  hand(['S_5', 'D_6', 'C_7'], { center: 'm_steel' });
  let r = play(hand(['S_A']));
  ok(near(r.total.mult, Math.pow(1.5, 5)), 'Galarian Meowth: retriggers the first two held Steel cards (X1.5^5)', r.total);
  // Evolution: Metal jokers on both sides.
  const left = add('j_joker'); const right = add('j_joker');
  N.apply_type_sticker(left, 'Metal'); N.apply_type_sticker(right, 'Metal');
  G.jokers.cards.splice(0, G.jokers.cards.length, left, m, right);
  ok(evolveNow(m) === 'j_nacho_perrserker', 'Galarian Meowth -> Perrserker with Metal on both sides', key(m));
  next();
  hand(['S_5', 'D_6', 'C_7', 'H_8', 'S_9'], { center: 'm_steel' });
  r = play(hand(['S_A']));
  // All jokers Metal -> Perrserker retriggers ITSELF (SMODS joker retrigger): each of the first 3 held
  // Steel cards triggers 3 times (11 Steel X1.5 in all), and each Metal joker's X1.5 applies twice.
  // Jokers: Metal Joker (+4), Perrserker, Metal Joker (+4).
  const want = (((Math.pow(1.5, 11) + 4) * 2.25) * 2.25 + 4) * 2.25;
  ok(near(r.total.mult, want), 'Perrserker: Steel retriggers, X1.5 per Metal joker, all doubled when every joker is Metal', { m: r.total.mult, want });
  G.jokers.cards[2].ability.metal_sticker = false;
  N.apply_type_sticker(G.jokers.cards[2], 'Fire');
  clearHand();
  r = play(hand(['S_A']));
  ok(near(r.total.mult, (1 + 4) * 1.5 * 1.5 + 4), 'Perrserker: not all Metal -> no retrigger (X1.5 for each of the 2 Metal jokers)', r.total);
}

// =================================================================== Terapagos line
{
  start('TERAPAGOS');
  const t = add('j_nacho_terapagos');
  const orb = G.consumeables.cards.find((c) => key(c) === 'c_poke_teraorb');
  ok(orb && orb.edition && orb.edition.negative, 'Terapagos: a Negative Tera Orb on entry');
  const other = add('j_poke_bulbasaur');
  orb.ability.extra.change_to_type = 'Water';
  use(orb, []);
  G.E_MANAGER.flush();
  ok(key(t) === 'j_nacho_terapagos_terastal' && N.type_sticker_applied(t) === 'Water', 'Tera Orb on Terapagos -> Terastal (Water)', key(t));
  ok(G.GAME.energy_plus === 3 && N.type_sticker_applied(other) === 'Water', 'Terastal: +3 Energy limit, every joker takes its type', [G.GAME.energy_plus, N.type_sticker_applied(other)]);
  const r = play(hand(['S_A']));
  ok(near(r.total.mult, 1 + 0.4 * 1), 'Terastal: X(1 + 0.4 per other joker of its type)', r.total);
  const orb2 = add('c_poke_teraorb');
  orb2.ability.extra.change_to_type = 'Fire';
  t.ability.extra.energy_count = 5;
  use(orb2, [t.sort_id]);
  G.E_MANAGER.flush();
  ok(key(t) === 'j_nacho_terapagos_stellar', 'Terastal with 6 Energy -> Stellar', [key(t), t.ability.extra.energy_count]);
  ok(N.type_sticker_applied(t) === 'Stellar' && N.type_sticker_applied(other) === 'Stellar' && G.GAME.energy_plus === 5, 'Stellar: every joker becomes Stellar, +5 Energy limit', [N.type_sticker_applied(other), G.GAME.energy_plus]);
  N.apply_type_sticker(other, 'Grass');
  ok(N.type_sticker_applied(other) === 'Stellar', 'Stellar owned: any Tera sticker becomes Stellar (TERA_OVERRIDES)');
  other.ability.extra.energy_count = 2;
  const r2 = play(hand(['S_A']));
  const te = N.get_total_energy(t);
  const xm = t.ability.extra.Xmult_mod; // 0.1, energized x6 on the way (0.1 + 0.1 x 0.2 x 6)
  ok(near(xm, 0.22) && near(r2.total.mult, (1 + xm * 2) * (1 + xm * te)), 'Stellar: each Stellar joker X(1 + Xmult_mod x its Energy)', { m: r2.total.mult, te, xm });
  const orb3 = add('c_poke_teraorb');
  const e0 = other.ability.extra.energy_count;
  use(orb3, [t.sort_id]);
  ok(other.ability.extra.energy_count === e0 + 1, 'Tera Orb on Stellar Terapagos energizes every joker', other.ability.extra.energy_count);
  const ex = P_CENTERS.j_nacho_terapagos_stellar;
  ok(ex.atlas === 'nacho_j_nacho_terapagos_stellar' && ex.in_pool() === false && P_CENTERS.j_nacho_terapagos_terastal.in_pool() === false, 'Stellar: own animated atlas, transformed forms never in a pool');
  act({ type: 'sell', id: t.sort_id });
  ok(G.GAME.energy_plus === 0, 'selling Terapagos-Stellar returns the Energy limit', G.GAME.energy_plus);
}

// =================================================================== more intended-design fixes
{
  // Goodra: `cardarea == G.hand or G.play` was always true -> Pokermon's scry cards gained X Mult too.
  start('GOODRA_SCRY');
  add('j_nacho_goodra');
  G.GAME.scry_amount = 1;
  const top = G.deck.cards[G.deck.cards.length - 1];
  N.change_base(top, 'Hearts', '9');
  const fl = hand(['H_4', 'H_6', 'H_8', 'H_T', 'H_K']);
  play(fl);
  ok(fl.every((c) => near(c.ability.perma_x_mult, 0.1)), 'Goodra: played Flush cards gain X Mult');
  ok(!top.ability.perma_x_mult, 'Goodra (fix): the scried top card of the deck gains nothing', top.ability.perma_x_mult);
}
{
  // Oranguru: selling it while a Standard pack is open (the Lua errored on an undefined `context`).
  start('ORANGURU_SELL');
  const o = add('j_nacho_oranguru');
  winRound(); act({ type: 'cash_out' });
  G.GAME.dollars = 100;
  const b = G.shop_booster.cards[0];
  const sb = new (b.constructor)(P_CARDS.empty, P_CENTERS.p_standard_normal_1);
  G.shop_booster.emplace(sb);
  act({ type: 'buy', id: sb.sort_id });
  ok(G.GAME.pack_choices === 2, 'Standard pack: 2 choices with Oranguru');
  let err = null;
  try { act({ type: 'sell', id: o.sort_id }); } catch (e) { err = e; }
  ok(!err && G.GAME.pack_choices === 1 && G.GAME.modifiers.booster_choice_mod === 0, 'Oranguru (fix): sold mid-pack -> back to 1 choice, no error', err && err.message);
  const o2 = add('j_nacho_oranguru');
  ok(G.GAME.pack_choices === 2 && o2.ability.extra.raised, 'Oranguru (fix): arriving mid-pack raises the open pack', G.GAME.pack_choices);
}
{
  // Passimian: a received base joker with a NUMBER extra (Banner) — the Lua errored on extra.ptype.
  start('PASSIMIAN_BANNER');
  const p = add('j_nacho_passimian');
  const ban = add('j_banner');
  let err = null;
  try { act({ type: 'sell', id: ban.sort_id }); } catch (e) { err = e; }
  ok(!err && p.ability.received_key === 'j_banner' && p.ability.extra === 30, 'Passimian (fix): receives Banner without an error', err && err.message);
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 30 * G.GAME.current_round.discards_left, 'Passimian (Banner): +30 chips per discard left', r.total);
}
{
  // Terapagos-Stellar's Tera Orb with a base-game joker in the row (the Lua indexed extra.ptype).
  start('STELLAR_VANILLA');
  const t = add('j_nacho_terapagos_stellar');
  const v = add('j_joker');
  G.E_MANAGER.flush();
  let err = null;
  try { use(add('c_poke_teraorb'), [t.sort_id]); } catch (e) { err = e; }
  ok(!err && N.type_sticker_applied(v) === 'Stellar', 'Terapagos-Stellar (fix): a Tera Orb with a base joker in the row works', err && err.message);
}

// =================================================================== descriptions / view data
{
  start('DESCRIBE', { options: { Clauncher: true } });
  const bad = [];
  for (const c of Object.values(P_CENTERS).filter((x) => x.mod === 'nacho' && x.set === 'Joker')) {
    try {
      const d = describeCenter(c.key);
      if (!d || !d.name || !d.lines || (!c.nacho_unavailable && !d.lines.length)) bad.push(c.key + ':center');
      if (c.nacho_unavailable) continue;
      const j = add(c.key);
      const live = describe(j);
      if (!live || !live.lines.length || !live.badges.some((b) => b.key === 'poke_type')) bad.push(c.key + ':live');
      if (live.lines.some((l) => /#\d#/.test(l))) bad.push(c.key + ':unfilled ' + live.lines.join('|'));
      cardView(j, true);
      G.jokers.remove_card(j); j.remove();
    } catch (e) { bad.push(c.key + ': ' + e.message); }
  }
  ok(bad.length === 0, 'every Nacho joker describes (collection + live, type badge, vars filled)', bad);
  const st = add('j_nacho_terapagos_stellar');
  G.E_MANAGER.flush();
  const v = cardView(st, true);
  ok(v.poke && v.poke.anim && v.poke.anim.frames === 13 && v.poke.tera === 'Stellar', 'Terapagos-Stellar view: animation (13 frames) + Stellar Tera', v.poke);
  const b = describe(st).badges.find((x) => x.key === 'poke_type');
  ok(b && b.gradient && b.label === 'Stellar Tera', 'Stellar badge: gradient', b);
  const o = add('j_nacho_oranguru');
  ok(describe(o).info.some((i) => i.key.startsWith('rank_lists_')), 'Oranguru: Common Ranks tooltip');
}

// =================================================================== Sinnoh Adventure shop
{
  start('SINNOH');
  G.GAME.modifiers.sinnoh_adv = true;
  winRound(); act({ type: 'cash_out' });
  ok(G.shop_jokers.cards.map(key).join() === 'j_nacho_turtwig,j_nacho_chimchar,j_nacho_piplup', 'Sinnoh Adventure: the shop stocks the three Sinnoh starters', G.shop_jokers.cards.map(key));
  start('NOSINNOH');
  winRound(); act({ type: 'cash_out' });
  ok(G.shop_jokers.cards.length === G.GAME.shop.joker_max, 'without the rule the shop rolls as usual');
}

done();
