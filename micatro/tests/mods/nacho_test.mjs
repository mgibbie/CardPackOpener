// Nacho's Pokermon Dip 1.7.9-5 (micatro/mods/nacho): mod off = none of its content; every enabled joker fired through real plays
// (act) with exact values, every evolution / Mega; the Stellar type; the lovely-patch / init-hook behaviours; the legacy
// definitions (the 1.6.4 lines 1.7.9 retired: still playable from old saves); the option toggles; the descriptions.
// The upgrade itself (pin, aliases, re-keys, old recipes, art): nacho_179_test.mjs.
//   node micatro/tests/mods/nacho_test.mjs
import { T, hand, add, play, winRound, clearHand, statusMsgs, G, P_CENTERS, P_CARDS, act, STATES } from './poke_helpers.mjs';
import { newRun } from '../../js/engine/run.js';
import { P_CENTER_POOLS, P_STAKES, Card, create_playing_card } from '../../js/engine/core.js';
import { centerActive } from '../../js/mods/registry.js';
import { describe, describeCenter } from '../../js/engine/describe.js';
import { cardView } from '../../js/engine/view.js';
import { STATUS, LINES, CHALLENGES } from '../../mods/nacho/index.js';
import * as N from '../../mods/nacho/api.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 400)); } };

/** A run with Pokermon + Nacho (or Pokermon alone), the blind selected and the hand emptied. */
function start(seed, { nacho = true, options = {}, poke = {}, boss = 'bl_wall', noBlind = false, stake } = {}) {
  newRun({ seed, back: 'b_red', stake, mods: nacho ? ['pokermon', 'nacho'] : ['pokermon'], modOptions: { pokermon: poke, nacho: options } });
  G.FORCE_BOSS = boss;
  G.GAME.round_resets.blind_choices.Boss = boss;
  flush();
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
const evolveNow = (j) => { winRound(); flush(); return key(j); };
/**
 * Add-on dedupe (Pokermon precedence): the legacy Ralts / Swablu / Bagon lines evolve into Pokermon's jokers. Their legacy
 * definitions still work (saves / replays): the line tests swap the evolved card for the next legacy Nacho stage to keep firing each.
 */
const legacy = (j, k) => { j.remove(); return add(k); };
const level = (h, n) => { G.GAME.hands[h].level += n; };
const use = (c, joker_targets, targets = []) => { const r = act({ type: 'use', id: c.sort_id, targets, joker_targets }); flush(); return r; };
const discard = (cards) => { act({ type: 'highlight', ids: cards.map((c) => c.sort_id) }); act({ type: 'discard' }); clearHand(); };
const buyPack = (k) => { const p = new Card(P_CARDS.empty, P_CENTERS[k]); G.shop_booster.emplace(p); G.GAME.dollars = 100; act({ type: 'buy', id: p.sort_id }); flush(); return p; };

// =================================================================== inventory / off / options
sec('inventory', () => {
  const all = Object.values(P_CENTERS).filter((c) => c.mod === 'nacho' && c.set === 'Joker');
  ok(all.length === 82, '82 jokers registered (66 1.7.9 + 6 Toxic-Stall + 10 legacy)', all.length);
  ok(STATUS.ported.length === 76 && STATUS.unavailable.length === 6 && STATUS.legacy.length === 10, '76 ported (10 of them legacy) + 6 unavailable', [STATUS.ported.length, STATUS.unavailable.length, STATUS.legacy.length]);
  ok(CHALLENGES.length === 4 && CHALLENGES.map((c) => c.key).join() === 'c_nacho_sinnoh_adv,c_nacho_hibernation,c_nacho_gems,c_nacho_goomygoomy', '4 challenges', CHALLENGES.map((c) => c.key));
  ok(Array.isArray(CHALLENGES[1].restrictions.banned_tags), 'a Lua {} list survives as []');

  // OFF: Pokermon alone -> nothing of Nacho's.
  start('NACHO_OFF', { nacho: false });
  ok(!P_CENTER_POOLS.Joker.some((c) => c.mod === 'nacho') && !P_CENTER_POOLS.Item.some((c) => c.mod === 'nacho'), 'off: no Nacho joker or apple in the pools');
  let leaked = 0;
  for (let i = 0; i < 300; i++) if (N.get_random_poke_key('off' + i).startsWith('j_nacho_')) leaked++;
  ok(leaked === 0, "off: Pokermon's random Pokémon never picks a Nacho joker", leaked);
  const j = add('j_poke_bulbasaur');
  j.ability.stellar_sticker = true;
  ok(N.type_sticker_applied(j) === false && !N.is_type(j, 'Fire') && N.energy_matches(j, 'Fire') === false, 'off: a stellar_sticker means nothing');
  const g = add('j_poke_gardevoir');
  ok(N.addon_megas(g.config.center).length === 0, 'off: Pokermon\'s Gardevoir has no (Nacho) Mega');

  // ON with the shipped defaults: every line (Clauncher too), Toxic-Stall never.
  start('NACHO_ON');
  const act_ = Object.values(P_CENTERS).filter((c) => c.mod === 'nacho' && c.set === 'Joker' && centerActive(c));
  ok(act_.length === 76, 'on: 76 jokers active by default (+ legacy, - Toxic-Stall)', act_.length);
  for (const k of ['j_nacho_hisuian_sneasel', 'j_nacho_sneasler', 'j_nacho_okidogi', 'j_nacho_pecharunt']) ok(!P_CENTER_POOLS.Joker.includes(P_CENTERS[k]), 'never in the pool: ' + k);
  ok(LINES.length === 34 && LINES.filter((l) => l.option).length === 31, '34 loaded files, 31 with an option', [LINES.length, LINES.filter((l) => l.option).length]);
  const saw = new Set();
  for (let i = 0; i < 400; i++) saw.add(N.get_random_poke_key('on' + i));
  ok([...saw].some((k) => k.startsWith('j_nacho_')) && !saw.has('j_nacho_hisuian_sneasel') && !saw.has('j_nacho_ralts'), 'on: random Pokémon can be Nacho\'s, never a Toxic-Stall or legacy one');
  // Toggles: Clauncher off, Goomy off.
  start('NACHO_OPT', { options: { Clauncher: false, Goomy: false } });
  ok(!P_CENTER_POOLS.Joker.includes(P_CENTERS.j_nacho_clauncher) && !centerActive(P_CENTERS.j_nacho_clawitzer), 'Clauncher option off -> its line is out');
  ok(!centerActive(P_CENTERS.j_nacho_hisuian_goodra), 'Goomy option off -> the whole Goomy line (Hisuian forms too) is out');
  const saw2 = new Set();
  for (let i = 0; i < 400; i++) saw2.add(N.get_random_poke_key('opt' + i));
  ok(!saw2.has('j_nacho_goomy') && !saw2.has('j_nacho_clauncher'), 'a line toggled off: never a random pick');
});

// =================================================================== Stellar type
sec('stellar', () => {
  start('STELLAR');
  const a = add('j_poke_charmander');
  const b = add('j_poke_squirtle');
  N.apply_type_sticker(a, 'Stellar');
  ok(a.ability.stellar_sticker === true && a.ability.fire_sticker === false && a.ability.extra.ptype === 'Stellar', 'apply Stellar: sticker on, others off, ptype Stellar');
  ok(N.type_sticker_applied(a) === 'Stellar' && N.get_type(a) === 'Stellar', 'type_sticker_applied -> Stellar');
  ok(['Grass', 'Fire', 'Water', 'Dark', 'Metal', 'Dragon', 'Earth', 'Colorless'].every((t) => N.is_type(a, t)), 'is_type: Stellar counts as every type');
  ok(N.find_pokemon_type('Grass').includes(a) && !N.find_pokemon_type('Grass').includes(b), 'find_pokemon_type sees Stellar jokers');
  ok(N.energy_matches(a, 'Grass') && N.energy_matches(a, 'Psychic'), 'energy_matches: any Energy');
  const badge = N.type_badge(a);
  ok(badge.label === 'Stellar Tera' && Array.isArray(badge.gradient) && badge.gradient.length === 8, 'badge: "Stellar Tera" with the rainbow gradient', badge);
  const r = N.type_evo(a.config.center, a, { end_of_round: true }, 'j_poke_charmeleon', 'water');
  ok(r && 'message' in r, 'type_evo: Stellar satisfies any type_req', r);
  flush();
  const g = add('c_poke_grass_energy');
  use(g, [a.sort_id]);
  ok((a.ability.extra.energy_count || 0) === 1, 'a Grass Energy energizes a Stellar joker', a.ability.extra);
});

// =================================================================== legacy definitions (1.6.4 behaviour, old saves)
sec('legacy deck_rank_evo', () => {
  start('RANKEVO');
  const j = add('j_nacho_bagon');
  let threw = null, r;
  try { r = N.deck_rank_evo(j.config.center, j, { end_of_round: true }, 'j_nacho_shelgon', 9, undefined, 20); } catch (e) { threw = e; }
  ok(!threw && r && 'message' in r, 'deck_rank_evo flat path runs (intended fix) and evolves', threw && threw.message);
  flush();
  ok(key(j) === 'j_poke_shelgon', 'deck_rank_evo -> Shelgon (Pokermon’s: precedence)', key(j));
});
sec('legacy gallade / altaria', () => {
  start('GALLADE');
  add('j_nacho_gallade');
  G.GAME.hands.Flush.played = 5;
  const pair0 = G.GAME.hands.Pair.level, fl0 = G.GAME.hands.Flush.level;
  use(add('c_mercury'));
  ok(G.GAME.hands.Pair.level === pair0 && G.GAME.hands.Flush.level === fl0 + 1, 'legacy Gallade: a Planet levels your most played hand instead');
  G.GAME.hands['High Card'].played = 3;
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 && near(r.total.mult, 1 + 0.15 * 4), 'legacy Gallade: X1.6 on the 4th High Card', r.total);
  start('ALTARIA', { boss: 'bl_club' });
  next(); next();
  const [nine, ten] = hand(['C_9', 'C_T']);
  add('j_nacho_altaria');
  G.GAME.blind.debuff_card(nine); G.GAME.blind.debuff_card(ten);
  ok(!nine.debuff && ten.debuff, 'legacy Altaria: the 9 of clubs is protected, the 10 is not');
});
sec('legacy ralts line', () => {
  start('RALTS');
  let j = add('j_nacho_ralts');
  level('Flush', 2); level('Pair', 1);
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 3 && j.ability.extra.rounds === 4, 'Ralts: +1 Mult per level above 1 (3)', r.total);
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_poke_kirlia', 'Ralts -> (Pokermon’s) Kirlia', key(j));
  next();
  j = legacy(j, 'j_nacho_kirlia');
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 2 * 3, 'Kirlia: +2 Mult per level above 1', r.total);
  next();
  j = legacy(j, 'j_nacho_gardevoir');
  r = play(hand(['S_A']));
  ok(near(r.total.mult, 1 * (1 + 0.1 * 3)), 'Gardevoir: X(1 + 0.1 per level above 1)', r.total);
  use(add('c_poke_megastone'), [j.sort_id]);
  ok(key(j) === 'j_poke_mega_gardevoir', 'legacy Gardevoir + Mega Stone -> the re-keyed Mega Gardevoir', key(j));
  start('KIRLIA_ITEM');
  j = add('j_nacho_kirlia');
  use(add('c_poke_dawnstone'), [j.sort_id]);
  ok(j.ability.extra.evolve && evolveNow(j) === 'j_poke_gallade', 'Kirlia + Dawn Stone -> (Pokermon’s) Gallade', key(j));
});
sec('legacy swablu / bagon', () => {
  start('SWABLU');
  const j = add('j_nacho_swablu');
  winRound();
  const row = G.GAME.round_eval.rows.find((x) => x.center === 'j_nacho_swablu');
  ok(row && row.dollars === 4, 'Swablu: $1 per 9 in the deck (4)', row);
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_poke_altaria', 'Swablu -> (Pokermon’s) Altaria', key(j));
  start('BAGON');
  const b = add('j_nacho_bagon');
  const held = hand(['D_5', 'D_7']);
  const r = play(hand(['S_K', 'H_K', 'S_4', 'H_4']));
  ok(r.total.chips === 20 + 10 + 10 + 4 + 4 && near(r.total.mult, 2 + (10 + 10 + 4 + 4) / 3), 'Bagon: Two Pair cards give rank/3 Mult', r.total);
  ok(held[1].base.value === '8', 'Bagon: the rightmost held card rises a rank (7 -> 8)');
  void b;
  const ms = add('j_nacho_mega_salamence');
  const r5 = play(hand(['S_A', 'H_A', 'S_4', 'H_4']));
  ok(r5.total.chips >= 20 + 11 * 3 * 2 + 8 && r5.total.mult > 2, 'legacy Mega Salamence still plays (X1.5 per scoring card, Ace retriggers)', r5.total);
  void ms;
});

// =================================================================== the Sinnoh starters
sec('turtwig', () => {
  start('TURTWIG');
  const hs = G.hand.config.card_limit;
  const j = add('j_nacho_turtwig');
  ok(G.hand.config.card_limit === hs + 1 && P_CENTERS.j_nacho_turtwig.perishable_compat === false, 'Turtwig: +1 hand size, no Perishable');
  next(); // (a round of Leech Seed)
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_nacho_grotle', 'Turtwig -> Grotle', key(j));
  next();
  G.GAME.dollars = 31;
  play(hand(['S_A'])); // (hand drawn -> hand size by money)
  ok(j.ability.extra.h_size === 2, 'Grotle: +1 hand size per $15 (31 -> 2)', j.ability.extra.h_size);
});
sec('chimchar line', () => {
  start('CHIMCHAR');
  const d0 = G.GAME.current_round.discards_left;
  const j = add('j_nacho_chimchar');
  ok(G.GAME.current_round.discards_left === d0 + 1, 'Chimchar: +1 discard');
  discard(hand(['S_5', 'H_A', 'D_3']));
  ok(j.ability.extra.mult === 11, 'Chimchar: Mult = highest card discarded (Ace 11)', j.ability.extra.mult);
  winRound();
  ok(j.ability.extra.mult === 0, 'Chimchar: resets at end of round');
  const dl = G.GAME.round_resets.discards;
  act({ type: 'cash_out' });
  act({ type: 'sell', id: j.sort_id });
  ok(G.GAME.round_resets.discards === dl - 1, 'selling it takes the discard back');
});
sec('piplup', () => {
  start('PIPLUP');
  const h0 = G.GAME.current_round.hands_left;
  const j = add('j_nacho_piplup');
  ok(G.GAME.current_round.hands_left === h0 + 1, 'Piplup: +1 hand');
  let r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 60, 'Piplup: +80 - 20 per scoring card', r.total);
  r = play(hand(['S_A', 'H_A', 'D_A', 'C_A', 'S_K']));
  ok(r.total.chips === 60 + 44, 'Piplup: 4 scoring cards -> +0', r.total);
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_nacho_prinplup', 'Piplup -> Prinplup', key(j));
});

// =================================================================== Audino
sec('audino', () => {
  start('AUDINO');
  const f = add('j_nacho_finizen');
  const au = add('j_nacho_audino');
  const ev = winRound();
  ok(f.ability.extra.rounds === 4, 'Audino: level_evo takes an extra step per Audino (6 -> 4)', f.ability.extra.rounds);
  ok(statusMsgs(ev.events).filter((m) => m === N.localize('poke_evolve_level')).length >= 1, 'a "level" status');
  next();
  f.ability.extra.rounds = 2;
  winRound(); flush();
  ok(key(f) === 'j_nacho_palafin' && near(au.ability.extra.Xmult, 1.25), 'Audino: +X0.25 when a Pokémon evolves (poke_evolved)', [key(f), au.ability.extra.Xmult]);
  next();
  const r1 = play(hand(['S_A']));
  ok(near(r1.total.mult, 1.25), 'Audino: X1.25', r1.total);
  use(add('c_poke_megastone'), [au.sort_id]);
  ok(key(au) === 'j_nacho_mega_audino' && au.ability.extra.ptype === 'Fairy' && near(au.ability.extra.Xmult, 1.25), 'Audino -> Mega Audino (Fairy) keeps the X', [key(au), au.ability.extra.Xmult]);
  ok(near(N.get_probability_vars(au, 1, 5, 'mega_audino')[1], 5), 'Mega Audino: 1 in 5 Shiny eggs');
});

// =================================================================== Hisuian Zorua line
sec('hisuian zorua', () => {
  start('HZORUA');
  add('j_joker'); // +4 Mult, leftmost
  const z = add('j_nacho_hisuian_zorua');
  ok(N.type_sticker_applied(z) === 'Colorless', 'Hisuian Zorua: Colorless Tera');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4 + 4, 'Hisuian Zorua: copies the leftmost joker (Joker +4)', r.total);
  ok(z.ability.extra.active === false, 'revealed after the hand');
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4, 'no copy until the end of the round', r.total);
  winRound();
  ok(z.ability.extra.active === true, 'active again after a won round');
  next();
  z.ability.extra.rounds = 1;
  ok(evolveNow(z) === 'j_nacho_hisuian_zoroark', 'Hisuian Zorua -> Hisuian Zoroark', key(z));
  next();
  r = play(hand(['S_A'])); r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4 + 4, 'Hisuian Zoroark: always copies the leftmost joker', r.total);
  start('HZORUA_NOBP');
  add('j_nacho_carbink'); // not Blueprint-compatible
  add('j_nacho_hisuian_zorua');
  r = play(hand(['S_A']));
  ok(r.total.mult === 1, '1.7.9: a non-Blueprint-compatible leftmost joker is not copied', r.total);
});

// =================================================================== Clauncher line
sec('clauncher', () => {
  start('CLAUNCHER');
  const j = add('j_nacho_clauncher');
  const [a, b] = hand(['S_5', 'H_5']);
  a.set_edition({ foil: true }, true); b.set_edition({ holo: true }, true);
  const r = play([a, b]);
  ok(r.total.chips === 10 + (5 + 50) * 2 + 5 * 2 && r.total.mult === 2 + 10 * 2, 'Clauncher: each unique edition retriggers once', r.total);
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_nacho_clawitzer', 'Clauncher -> Clawitzer', key(j));
  next();
  const [e, f] = hand(['S_5', 'H_5']);
  e.set_edition({ foil: true }, true); f.set_edition({ foil: true }, true);
  const r2 = play([e, f]);
  ok(r2.total.chips === 10 + 55 * 4, 'Clawitzer: every editioned card retriggers', r2.total);
  for (const pc of G.playing_cards) pc.set_edition(null, true, true);
  ok(P_CENTERS.j_nacho_clauncher.in_pool() === false, 'Clauncher not in the pool without editioned cards');
});

// =================================================================== Goomy line
sec('goomy line', () => {
  start('GOOMY');
  const j = add('j_nacho_sliggoo');
  const fl = hand(['H_4', 'H_6', 'H_8', 'H_T', 'H_K']);
  play(fl);
  ok(fl.every((c) => c.ability.perma_mult === 5), 'Sliggoo: +1 perma Mult per unique scoring rank (5)', fl[0].ability.perma_mult);
  j.ability.extra.flushes = 8;
  ok(evolveNow(j) === 'j_nacho_goodra', 'Sliggoo -> Goodra after 8 Flushes', key(j));
  next();
  const held = hand(['H_2']);
  const fl3 = hand(['H_4', 'H_6', 'H_8', 'H_T', 'H_K']);
  play(fl3);
  ok(fl3.every((c) => near(c.ability.perma_x_mult, 0.1)) && near(held[0].ability.perma_x_mult, 0.1), 'Goodra: played + held hearts +X0.02 per unique rank (0.1)', fl3[0].ability.perma_x_mult);
  start('HGOOMY');
  const g = add('j_nacho_goomy');
  play(hand(['H_K', 'H_K', 'H_K', 'H_4', 'H_4']));
  ok(g.ability.extra.flush_houses === 1 && evolveNow(g) === 'j_nacho_hisuian_sliggoo', 'Goomy -> Hisuian Sliggoo after a Flush House', key(g));
  next();
  const c0 = G.consumeables.cards.length;
  play(hand(['H_K', 'H_K', 'H_K', 'H_4', 'H_4']));
  flush();
  ok(G.consumeables.cards.length === c0 + 1 && key(G.consumeables.cards[c0]) === 'c_poke_metalcoat', 'Hisuian Sliggoo: a Metal Coat per Flush House (gap 6)');
  for (const c of G.consumeables.cards.slice()) G.consumeables.remove_card(c);
  play(hand(['H_A', 'H_A', 'H_A', 'H_2', 'H_2'])); flush();
  ok(G.consumeables.cards.length === 2, 'Hisuian Sliggoo: two Metal Coats when the ranks are > 6 apart', G.consumeables.cards.map(key));
  g.ability.extra.flush_houses = 6;
  for (const c of G.consumeables.cards.slice()) G.consumeables.remove_card(c);
  ok(evolveNow(g) === 'j_nacho_hisuian_goodra', 'Hisuian Sliggoo -> Hisuian Goodra after 6 (POKE_EVO_OVERRIDES)', key(g));
  next();
  hand(['S_5', 'D_6'], { center: 'm_steel' });
  const r = play(hand(['H_A', 'H_A', 'H_A', 'H_2', 'H_2']));
  flush();
  ok(G.consumeables.cards.some((c) => key(c) === 'c_poke_metalcoat') && near(r.total.mult, 14 * Math.pow(1.5 * 3, 2)), 'Hisuian Goodra: a Metal Coat; held Steel X(rank gap / 3)', r.total);
  // POKE_EVO_OVERRIDES: Sliggoo's highest evo is Goodra, Hisuian Sliggoo's Hisuian Goodra (never the other branch)
  const s = add('j_nacho_sliggoo'), hs = add('j_nacho_hisuian_sliggoo');
  let ok1 = true;
  for (let i = 0; i < 12; i++) { if (N.get_highest_evo(s) !== 'goodra' || N.get_highest_evo(hs) !== 'hisuian_goodra') ok1 = false; }
  ok(ok1, 'POKE_EVO_OVERRIDES: each branch\'s highest evo is its own');
  ok(N.get_previous_evo(add('j_nacho_hisuian_goodra')) === 'hisuian_sliggoo', 'and the previous evo of Hisuian Goodra is Hisuian Sliggoo');
});

// =================================================================== Oranguru
sec('oranguru', () => {
  start('ORANGURU');
  const o = add('j_nacho_oranguru');
  for (const c of G.playing_cards.slice(0, 12)) N.change_base(c, null, 'Queen');
  winRound(); act({ type: 'cash_out' });
  buyPack('p_standard_normal_1');
  ok(G.STATE === STATES.STANDARD_PACK && G.GAME.pack_choices === 2, 'Oranguru: +1 choice in a Standard pack', G.GAME.pack_choices);
  ok(G.pack_cards.cards.every((c) => c.base.value === 'Queen'), 'Oranguru: Standard pack cards are your most common rank (Queen)', G.pack_cards.cards.map((c) => c.base.value));
  act({ type: 'sell', id: o.sort_id }); flush();
  ok(G.GAME.pack_choices === 1, 'sold mid-pack: back to 1 choice', G.GAME.pack_choices);
  const o2 = add('j_nacho_oranguru');
  ok(G.GAME.pack_choices === 2, 'arriving mid-pack: +1', G.GAME.pack_choices);
  act({ type: 'skip_booster' }); flush();
  buyPack('p_arcana_normal_1');
  ok(G.GAME.pack_choices === 1, 'a non-Standard pack: no extra choice', G.GAME.pack_choices);
  void o2;
});

// =================================================================== Passimian
sec('passimian', () => {
  start('PASSIMIAN');
  const p = add('j_nacho_passimian');
  const sk = add('j_nacho_skwovet');
  sk.ability.extra.mult = 5;
  act({ type: 'sell', id: sk.sort_id }); flush();
  ok(p.ability.received_key === 'j_nacho_skwovet' && key(p) === 'j_nacho_passimian' && p.ability.extra.mult === 5, 'Passimian receives a sold Pokémon\'s ability and its scaled values', p.ability);
  ok(N.find_card('j_nacho_skwovet').includes(p), 'find_card finds Passimian under the received key');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 5, 'Passimian (Skwovet): +5 Mult', r.total);
  // "Evolution" of the received ability: received, not evolved.
  p.ability.extra.mult = 12;
  winRound(); flush();
  ok(key(p) === 'j_nacho_passimian' && p.ability.received_key === 'j_nacho_greedent' && p.ability.extra.mult >= 12, 'Passimian receives the evolved ability (stays Passimian)', p.ability);
  start('PASSIMIAN_DAGGER', { noBlind: true });
  const p2 = add('j_nacho_passimian');
  add('j_ceremonial');
  add('j_nacho_bounsweet');
  act({ type: 'select_blind' }); flush();
  ok(p2.ability.received_key === 'j_nacho_bounsweet', 'Passimian receives a joker Ceremonial Dagger destroys (joker_type_destroyed)', p2.ability.received_key);
  clearHand();
  const p3 = add('j_nacho_passimian');
  const v = add('j_jolly');
  N.remove(v.config.center, v, {}); flush();
  ok(!p3.ability.received_key, '1.7.9: a base joker (no stage) is not received', p3.ability.received_key);
  const cat = add('j_poke_caterpie');
  N.remove(cat.config.center, cat, {}); flush();
  ok(p3.ability.received_key === 'j_poke_caterpie', 'Pokermon\'s remove() fires joker_type_destroyed: received', p3.ability.received_key);
});

// =================================================================== Turtonator
sec('turtonator', () => {
  start('TURTONATOR', { boss: 'bl_club' });
  const t = add('j_nacho_turtonator');
  next(); next();
  ok(G.GAME.blind.name === 'The Club' && t.ability.extra.trapped === true, 'Turtonator: The Club debuffing clubs arms Shell Trap', t.ability.extra);
  let r = play(hand(['S_A', 'H_A']));
  ok(near(r.total.mult, 2 * 1.5 * 1.5), 'Turtonator: X1.5 per scoring card on the next hand', r.total);
  r = play(hand(['S_A', 'H_A']));
  ok(r.total.mult === 2 && !t.ability.extra.trapped, 'one hand only', r.total);
  const club = hand(['C_A', 'H_A']);
  G.GAME.blind.debuff_card(club[0]);
  t.ability.extra.trapped = undefined;
  ok(club[0].debuff, 'The Club debuffs the Ace of clubs');
  // (the debuff itself re-arms it at once, debuff_set; the after-hand check re-arms it too)
  r = play(club);
  ok(t.ability.extra.trapped === true, 'a debuffed card in the scoring hand re-arms it after the hand', t.ability.extra);
});

// =================================================================== Skwovet line
sec('skwovet', () => {
  start('SKWOVET', { noBlind: true });
  const j = add('j_nacho_skwovet');
  use(add('c_mercury'));
  ok(j.ability.extra.mult === 0, 'Skwovet: nothing outside a blind');
  act({ type: 'select_blind' }); clearHand();
  use(add('c_venus'));
  ok(j.ability.extra.mult === 1, 'Skwovet: +1 Mult per consumable used in a blind');
  j.ability.extra.mult = 12;
  ok(evolveNow(j) === 'j_nacho_greedent', 'Skwovet -> Greedent at +12', key(j));
  next();
  G.GAME.probabilities.normal = 8;
  use(add('c_venus')); flush();
  const lo = G.consumeables.cards.find((c) => key(c) === 'c_poke_leftovers');
  ok(j.ability.extra.mult === 13 && lo && lo.edition && lo.edition.negative, 'Greedent: +1 Mult and a Negative Leftovers (1 in 8, forced)', [j.ability.extra.mult, G.consumeables.cards.map(key)]);
});

// =================================================================== Perrserker
sec('perrserker', () => {
  start('PERRSERKER');
  add('j_nacho_perrserker');
  const ar = add('j_poke_aron');
  play(hand(['S_K'], { center: 'm_steel' }));
  ok((ar.ability.extra.energy_count || 0) === 0, 'Perrserker: the +2 Energy is taken back right after the hand', ar.ability.extra);
  void ar;
});

// =================================================================== Terapagos line
sec('terapagos', () => {
  start('TERAPAGOS');
  const t = add('j_nacho_terapagos');
  const orb = G.consumeables.cards.find((c) => key(c) === 'c_poke_teraorb');
  const other = add('j_poke_bulbasaur');
  orb.ability.extra.change_to_type = 'Water';
  use(orb, [t.sort_id]);
  ok(key(t) === 'j_nacho_terapagos_terastal' && N.type_sticker_applied(t) === 'Water', 'Tera Orb on Terapagos -> Terastal (Water)', key(t));
  ok(G.GAME.energy_plus === 3, 'Terastal: +3 Energy limit', G.GAME.energy_plus);
  const orb2 = add('c_poke_teraorb');
  orb2.ability.extra.change_to_type = 'Water';
  use(orb2, [t.sort_id]);
  ok(N.type_sticker_applied(other) === 'Water' && (t.ability.extra.energy_count || 0) >= 1, 'Terastal: the Orb energizes it and gives every joker its type', [N.type_sticker_applied(other), t.ability.extra]);
  const xm0 = t.ability.extra.Xmult_mod; // (0.4, Energized twice by now: Pokermon's Tera Orb energizes a joker already of its type)
  const r = play(hand(['S_A']));
  ok(xm0 > 0.4 && near(r.total.mult, 1 + xm0 * 1), 'Terastal: X(1 + 0.4 [+Energy] per other joker of its type)', [r.total, xm0]);
  t.ability.extra.energy_count = 5;
  const orb3 = add('c_poke_teraorb');
  use(orb3, [t.sort_id]);
  ok(key(t) === 'j_nacho_terapagos_stellar', 'Terastal with 6 Energy -> Stellar', [key(t), t.ability.extra]);
  flush();
  ok(N.type_sticker_applied(t) === 'Stellar' && N.type_sticker_applied(other) === 'Stellar' && G.GAME.energy_plus === 5, 'Stellar: every joker Stellar, +5 Energy limit', [N.type_sticker_applied(other), G.GAME.energy_plus]);
  N.apply_type_sticker(other, 'Grass');
  ok(N.type_sticker_applied(other) === 'Stellar', 'Stellar owned: any Tera sticker becomes Stellar (TERA_OVERRIDES)');
  other.ability.extra.energy_count = 2;
  const te = N.get_total_energy(t), xm = t.ability.extra.Xmult_mod;
  const r2 = play(hand(['S_A']));
  ok(near(r2.total.mult, (1 + xm * 2) * (1 + xm * te)), 'Stellar: each Stellar joker X(1 + Xmult_mod x its Energy)', { m: r2.total.mult, te, xm });
  const e0 = other.ability.extra.energy_count;
  use(add('c_poke_teraorb'), [t.sort_id]);
  ok(other.ability.extra.energy_count === e0 + 1, 'Tera Orb on Stellar Terapagos energizes every joker', other.ability.extra.energy_count);
  act({ type: 'sell', id: t.sort_id });
  ok(G.GAME.energy_plus === 0, 'selling Terapagos-Stellar returns the Energy limit', G.GAME.energy_plus);
  const st = add('j_nacho_terapagos_stellar');
  const v = add('j_joker');
  flush();
  let err = null;
  try { use(add('c_poke_teraorb'), [st.sort_id]); } catch (e) { err = e; }
  ok(!err && N.type_sticker_applied(v) === 'Stellar', 'Stellar\'s Tera Orb with a base joker in the row', err && err.message);
});

// =================================================================== the new lines (the rest of each line: nacho_179_test samples them)
sec('bastiodon', () => {
  start('BASTIODON');
  add('j_nacho_bastiodon');
  const held = hand(['D_2', 'D_K']);
  play(hand(['S_6', 'H_6', 'D_6', 'C_6']));
  ok(N.has_enhancement(held[0], 'm_steel') && !N.has_enhancement(held[1], 'm_steel'), 'Bastiodon 4+: held cards below 6 become Steel');
});
sec('abomasnow', () => {
  start('ABOMASNOW');
  add('j_nacho_abomasnow');
  G.GAME.probabilities.normal = 1000;
  play(hand(['S_A', 'H_A'], { center: 'm_glass' })); flush();
  const g = G.playing_cards.filter((c) => N.has_enhancement(c, 'm_glass') && c.edition && c.edition.foil);
  ok(g.length === 2, 'Abomasnow: every broken Glass card turns an unenhanced deck card into Foil Glass', g.length);
});
sec('duosion / reuniclus', () => {
  start('DUOSION');
  const j = add('j_nacho_duosion');
  const r = play(hand(['S_A']));
  ok(r.total.chips === 30 + 11 * 3 && r.total.mult === 3, 'Duosion: 2 copies of the first card (Three of a Kind)', r.total);
  j.ability.extra.copies_made = 8;
  ok(evolveNow(j) === 'j_nacho_reuniclus', 'Duosion -> Reuniclus after 8 copies', key(j));
  next();
  play(hand(['S_A']));
  const r2 = play(hand(['S_K']));
  ok(r2.total.chips === 30 + 10 * 3, 'Reuniclus: every hand', r2.total);
  const r3 = play(hand(['S_K', 'H_K', 'D_K', 'C_K', 'S_A']));
  ok(r3.total.hand === 'Four of a Kind' && r3.total.chips === 60 + 40, 'Reuniclus: a full hand leaves no room for copies', r3.total);
});
sec('golisopod', () => {
  start('GOLISOPOD');
  const hs = G.hand.config.card_limit;
  const j = add('j_nacho_golisopod');
  G.GAME.blind.boss = true;
  const r = winRound(hand(['S_A'])); flush();
  ok(near(r.total.mult, 3), 'Golisopod: X3 Mult', r.total);
  ok(j.ability.extra.raised === true && G.hand.config.card_limit === hs + 1, 'Golisopod: a Boss beaten without fainting -> +1 hand size', [j.ability.extra, G.hand.config.card_limit - hs]);
});
sec('appletun / hydrapple / apples', () => {
  start('APPLETUN');
  add('j_nacho_appletun');
  const d0 = G.GAME.dollars;
  const [x] = hand(['D_4']);
  N.poke_remove_card(x, G.jokers.cards[0]); flush();
  ok(G.GAME.dollars === d0 + 3, 'Appletun: $3 per destroyed playing card', G.GAME.dollars - d0);
  const hy = add('j_nacho_hydrapple');
  const [w] = hand(['D_5'], { center: 'm_wild' });
  N.poke_remove_card(w, hy); flush();
  ok(near(hy.ability.extra.Xmult, 1.4), 'Hydrapple: +X0.4 for a destroyed Wild card (a Wild copy back)', hy.ability.extra.Xmult);
  clearHand();
  const [l, rr] = hand(['S_9', 'S_8']);
  const sw = add('c_nacho_sweetapple');
  const d1 = G.GAME.dollars;
  use(sw, [], [l.sort_id, rr.sort_id]);
  ok(G.GAME.dollars - d1 >= 2 + 3 && rr.destroyed, 'Sweet Apple: the left card earns $2, the right is destroyed (Appletun +$3)', G.GAME.dollars - d1);
  clearHand();
  const cards = hand(['S_2', 'S_3', 'S_4', 'S_5']);
  const sy = add('c_nacho_syrupyapple');
  use(sy, [], [cards[0].sort_id]);
  const wild = cards.filter((c) => N.has_enhancement(c, 'm_wild')).length, gone = cards.filter((c) => c.destroyed).length;
  ok(wild === 3 && gone === 1, 'Syrupy Apple: the selected + 2 random held cards turn Wild, a non-Wild one is destroyed', [wild, gone]);
});
sec('arctibax / baxcalibur', () => {
  start('BAXCALIBUR');
  add('j_nacho_arctibax');
  const cards = hand(['S_A', 'H_A', 'D_A'], { center: 'm_mult' });
  play(cards);
  ok(cards.filter((c) => c.edition && c.edition.foil).length === 2, 'Arctibax: the first two scoring cards with Mult become Foil');
  start('BAX2');
  add('j_nacho_baxcalibur');
  for (const c of G.playing_cards.slice(0, 10)) c.set_edition({ foil: true }, true, true);
  const five = hand(['S_A', 'H_A', 'D_A', 'C_A', 'S_A']);
  const r = play(five);
  ok(r.total.hand === 'Five of a Kind' && r.total.mult > 12 * 2, 'Baxcalibur: in a Five of a Kind scoring cards give X(1 + 0.03 x Foils)', r.total);
  start('MEGABAX');
  const m = add('j_nacho_mega_baxcalibur');
  play(hand(['S_A']));
  ok(m.debuff, 'Mega Baxcalibur: faints when no scoring card gives Mult', m.debuff);
});
sec('ancient pack', () => {
  start('ANCIENT', { noBlind: true });
  const pool = N.get_attribute_pool('ancient');
  ok(pool.includes('j_nacho_cranidos') && pool.includes('j_nacho_shieldon') && pool.includes('j_poke_omanyte'), 'the "ancient" pool: Nacho\'s fossils and Pokermon\'s', pool.length);
  ok(P_CENTERS.p_nacho_ancient_pack.in_pool() === false && P_CENTERS.p_nacho_ancient_pack.weight === 0, 'the Ancient Pack is never in a shop');
});

// =================================================================== descriptions / view data
sec('describe', () => {
  start('DESCRIBE');
  const bad = [];
  for (const c of Object.values(P_CENTERS).filter((x) => x.mod === 'nacho' && (x.set === 'Joker' || x.set === 'Item' || x.set === 'Booster'))) {
    try {
      const d = describeCenter(c.key);
      if (!d || !d.name || !d.lines || (!c.nacho_unavailable && !d.lines.length)) bad.push(c.key + ':center');
      if (c.nacho_unavailable || c.set !== 'Joker') continue;
      const j = add(c.key);
      const live = describe(j);
      if (!live || !live.lines.length || (c.stage !== 'Other' && !live.badges.some((b) => b.key === 'poke_type'))) bad.push(c.key + ':live');
      if (live.lines.some((l) => /#\d#/.test(l))) bad.push(c.key + ':unfilled ' + live.lines.join('|'));
      cardView(j, true);
      G.jokers.remove_card(j); j.remove();
    } catch (e) { bad.push(c.key + ': ' + e.message); }
  }
  ok(bad.length === 0, 'every Nacho joker / item / pack describes (collection + live, type badge, vars filled)', bad);
  const st = add('j_nacho_terapagos_stellar');
  flush();
  const v = cardView(st, true);
  ok(v.poke && v.poke.anim && v.poke.anim.frames === 13 && v.poke.anim.soul_only && v.soul_atlas === 'nacho_terapagos_stellar_soul179' && v.poke.tera === 'Stellar', 'Terapagos-Stellar view: its 13-frame soul over the Gen 9 card + Stellar Tera', [v.poke, v.soul_atlas]);
  const o = add('j_nacho_oranguru');
  ok(describe(o).info.some((i) => i.key.startsWith('rank_lists_')), 'Oranguru: Common Ranks tooltip');
});

// =================================================================== Sinnoh Adventure shop
sec('sinnoh', () => {
  start('SINNOH');
  G.GAME.modifiers.sinnoh_adv = true;
  winRound(); act({ type: 'cash_out' });
  ok(G.shop_jokers.cards.map(key).join() === 'j_nacho_turtwig,j_nacho_chimchar,j_nacho_piplup', 'Sinnoh Adventure: the first shop stocks the three Sinnoh starters', G.shop_jokers.cards.map(key));
  ok(!G.GAME.modifiers.sinnoh_adv, '1.7.9: the rule is spent after the first shop');
  start('NOSINNOH');
  winRound(); act({ type: 'cash_out' });
  ok(G.shop_jokers.cards.length === G.GAME.shop.joker_max, 'without the rule the shop rolls as usual');
});

void P_STAKES; void create_playing_card;
done();
