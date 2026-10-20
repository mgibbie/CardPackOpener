// Pokermon 3.9.1 new jokers, sub-batch 11 (PORTING.md "New jokers, sub-batch 11"): the 26 jokers 3.9.1 added to
// pokejokers_09.lua (the Wurmple line) and pokejokers_10.lua (Seedot, Taillow, Wingull, Ralts, Surskit, Slakoth, Nincada,
// Makuhita lines, Skitty), every one fired through real plays (act), and each evolution.
//   - the overlay: data391.js new_jokers / new_deferred / families, the 3.9.1 static data, text, order and pools; contentRev 8
//   - each joker's main effect, each evolution (Nincada's Multi Evolution: Ninjask + a Shedinja), the per-round Wingull rank and
//     Skitty type, Surskit's duplicate-rank Straights, the deferred Gallade / Delcatty evolutions
//   - the art: every new joker's 3.9.1 cell (and its Shiny twin) holds a real picture (needs the gitignored art: MICATRO_MAIN)
//   node micatro/tests/mods/pokermon_391_new_11_test.mjs
import fs from 'fs';
import path from 'path';
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS, P_CENTER_POOLS, localize, get_current_pool } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { STATUS } from '../../mods/pokermon/index.js';
import D391 from '../../mods/pokermon/data391.js';
import { get_family_keys, poke_get_family_list, family } from '../../mods/pokermon/systems/evolution.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const C = (n) => P_CENTERS['j_poke_' + n];
const NEW = ['wurmple', 'silcoon', 'beautifly', 'cascoon', 'dustox', 'seedot', 'nuzleaf', 'shiftry', 'taillow', 'swellow', 'wingull',
  'pelipper', 'ralts', 'kirlia', 'gardevoir', 'surskit', 'masquerain', 'slakoth', 'vigoroth', 'slaking', 'nincada', 'ninjask', 'shedinja',
  'makuhita', 'hariyama', 'skitty'];
/** A card on top of the deck (the next one drawn). */
const onDeck = (k, center) => {
  const c = create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center || 'c_base'] }, G.deck);
  G.deck.cards.splice(G.deck.cards.indexOf(c), 1);
  G.deck.cards.push(c);
  return c;
};
/** A section: an error (e.g. on a build without these jokers) is one failure, not the end of the suite. */
const sec = (fn) => { try { fn(); } catch (e) { ok(false, 'threw: ' + String(e && e.message).slice(0, 160)); } };
/** Discard these hand cards (the hand refills from the top of the deck). */
const discard = (cards) => { act({ type: 'highlight', ids: cards.map((c) => c.sort_id) }); return act({ type: 'discard' }); };

// ------------------------------------------------------------------- the overlay
ok(MODS.pokermon.contentRev === 8 && PINS.modPin('pokermon') === '3.9.1+r8', 'Pokermon contentRev 8 (pin 3.9.1+r8)', PINS.modPin('pokermon'));
const NJ = D391.new_jokers || {};
ok(JSON.stringify(Object.keys(NJ)) === JSON.stringify(NEW), 'data391.js new_jokers: the 26 of 3.9.1 pokejokers_09 / 10, in file order', Object.keys(NJ));
ok(NEW.every((n) => NJ[n] && NJ[n].sub_batch === '11'), 'all from sub-batch 11');
ok(NEW.every((n) => C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n)), 'every new joker is registered and ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_09.lua'].length === 30 && STATUS.PORTED_FILES['pokemon/pokejokers_10.lua'].length === 25, 'defs: 30 from pokejokers_09.lua, 25 from pokejokers_10.lua');
sec(() => {
  // Static data straight from 3.9.1 (never retyped): a few spot checks of rarity / cost / stage / type / config.
  const want = {
    wurmple: [1, 2, 'Basic', 'Grass'], beautifly: ['poke_safari', 7, 'Two', 'Grass'], nuzleaf: ['poke_safari', 6, 'One', 'Dark'],
    gardevoir: ['poke_safari', 10, 'Two', 'Psychic'], nincada: [2, 7, 'Basic', 'Grass'], shedinja: ['poke_safari', 8, '???', 'Psychic'],
    hariyama: [2, 7, 'One', 'Fighting'], skitty: [3, 7, 'Basic', 'Colorless'],
  };
  for (const [n, [rarity, cost, stage, ptype]] of Object.entries(want)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === ptype, `${n}: 3.9.1 rarity / cost / stage / type`, [c.rarity, c.cost, c.stage, c.ptype]);
  }
  ok(C('seedot').enhancement_gate === 'm_poke_seed' && C('seedot').perishable_compat === false, 'seedot: Seed enhancement gate, no Perishable');
  ok(C('nincada').eternal_compat === false && C('ninjask').eternal_compat === false, 'nincada / ninjask: no Eternal');
  ok(C('surskit').blueprint_compat === false && C('masquerain').blueprint_compat === false, 'surskit / masquerain: not Blueprint-compatible');
  ok(C('nincada').config.extra.chips === 65 && C('gardevoir').config.extra.Xmult_mod === 0.3 && C('kirlia').config.evo_rqmt === 15, '3.9.1 configs', [C('nincada').config, C('gardevoir').config, C('kirlia').config]);
  ok(C('nuzleaf').config.extra.item_req === 'leafstone', 'nuzleaf: Leaf Stone');
  ok(C('ralts').knockoff_pseudol === true && C('slakoth').knockoff_pseudol === true, 'ralts / slakoth: knockoff_pseudol');
  ok(C('wurmple').attributes.includes('condition_evo') && C('wurmple').attributes.includes('grass_type'), 'attributes: 3.9.1 + load_pokemon ones', C('wurmple').attributes);
});
sec(() => {
  // Their place in the joker list: 3.9.1's file order (Wurmple after Linoone, Slakoth after Breloom, Skitty after Nosepass).
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const after = (a, b) => keys.indexOf('j_poke_' + b) === keys.indexOf('j_poke_' + a) + 1;
  ok(after('linoone', 'wurmple') && after('dustox', 'seedot') && after('masquerain', 'shroomish') && after('breloom', 'slakoth')
    && after('hariyama', 'azurill') && after('nosepass', 'skitty') && after('skitty', 'lotad') === false, 'inserted in 3.9.1 file order');
});
sec(() => {
  // The 3.9.1 text (with each #n# filled by loc_vars)
  const JL = MODS.pokermon.content.loc.descriptions.Joker;
  start('LOC11');
  for (const n of NEW) {
    const e = JL['j_poke_' + n];
    const card = add('j_poke_' + n);
    const iq = [];
    const lv = C(n).loc_vars(C(n), iq, card) || {};
    const need = Math.max(0, ...e.text.join(' ').match(/#(\d+)#/g)?.map((m) => +m.slice(1, -1)) || [0]);
    ok(e && (lv.vars || []).length >= need && (lv.vars || []).slice(0, need).every((v) => v !== undefined && v !== null && !Number.isNaN(v)), `${n}: text + loc_vars fill #1#..#${need}#`, lv.vars);
  }
  ok(JL.j_poke_dustox.text.some((l) => l.includes('held in hand')) && JL.j_poke_shedinja.name === 'Shedinja', 'the 3.9.1 entries');
});
sec(() => {
  // Deferred: Kirlia -> Gallade (sub-batch 14), Skitty -> Delcatty (sub-batch 12)
  const JL = MODS.pokermon.content.loc.descriptions.Joker;
  const def = Object.fromEntries(D391.new_deferred.map(([n, why, drop]) => [n, drop]));
  ok(JSON.stringify(def) === JSON.stringify({ kirlia: ['item_req'], skitty: ['item_req'] }), 'new_deferred: kirlia, skitty (item_req)', def);
  ok(C('kirlia').item_req === undefined && C('kirlia').config.extra.item_req === undefined && C('skitty').config.extra.item_req === undefined, 'no item_req until the target exists');
  ok(!JL.j_poke_kirlia.text.some((l) => l.includes('Dawn Stone')) && !JL.j_poke_skitty.text.some((l) => l.includes('Moon Stone')), 'nor the stone line in their text');
  ok(!P_CENTERS.j_poke_gallade && !P_CENTERS.j_poke_delcatty, 'Gallade / Delcatty not registered yet');
});
sec(() => {
  // Families (3.9.1 functions/pokefamily.lua), minus jokers not ported yet
  ok(JSON.stringify(poke_get_family_list('nincada')) === JSON.stringify(['nincada', 'ninjask', 'shedinja']), 'family: nincada / ninjask / shedinja');
  ok(JSON.stringify(poke_get_family_list('wurmple')) === JSON.stringify(['wurmple', 'silcoon', 'beautifly', 'cascoon', 'dustox']), 'family: the Wurmple line (branching)');
  const rk = get_family_keys('kirlia');
  ok(rk.includes('j_poke_gardevoir') && rk.includes('j_poke_ralts') && !rk.includes('j_poke_gallade'), 'family: Ralts line without Gallade (yet)', rk);
  ok(JSON.stringify(poke_get_family_list('skitty')) === JSON.stringify(['skitty']), 'family: Skitty alone until Delcatty');
});
sec(() => {
  // Pools: in_pool (pokemon_in_pool) + the pool_filter hook (one per family, the Gen 3 option); in P_CENTER_POOLS in 3.9.1 order
  start('POOL11');
  const pool = P_CENTER_POOLS.Joker.map((c) => c.key);
  ok(pool.indexOf('j_poke_wurmple') === pool.indexOf('j_poke_linoone') + 1 && pool.includes('j_poke_skitty'), 'the Joker pool holds them, in 3.9.1 order', pool.indexOf('j_poke_wurmple'));
  ok(C('wurmple').in_pool(C('wurmple')) && C('skitty').in_pool(C('skitty')) && pool_filter(C('wurmple'), 'Joker') === undefined, 'Wurmple / Skitty can be rolled');
  ok(C('seedot').in_pool(C('seedot')) === false, 'Seedot waits for a Seed card in the deck (enhancement_gate)');
  // the shop's rarity pools (get_current_pool): Commons / Uncommons / Rare by their 3.9.1 rarity; Safari ones never (weight 0)
  const avail = (r) => get_current_pool('Joker', r)[0].filter((k) => k !== 'UNAVAILABLE');
  const ofNew = (r) => avail(r).filter((k) => NEW.includes(k.replace('j_poke_', '')));
  ok(JSON.stringify(ofNew(0.1)) === JSON.stringify(['j_poke_wurmple', 'j_poke_taillow', 'j_poke_wingull', 'j_poke_makuhita'])
    && JSON.stringify(ofNew(0.8)) === JSON.stringify(['j_poke_silcoon', 'j_poke_cascoon', 'j_poke_ralts', 'j_poke_surskit', 'j_poke_slakoth', 'j_poke_nincada', 'j_poke_hariyama'])
    && JSON.stringify(ofNew(0.99)) === JSON.stringify(['j_poke_skitty']), 'shop rarity pools: Common / Uncommon / Rare', [ofNew(0.1), ofNew(0.8), ofNew(0.99)]);
  add('j_poke_wurmple');
  ok(pool_filter(C('dustox'), 'Joker') === false && pool_filter(C('silcoon'), 'Joker') === false && pool_filter(C('seedot'), 'Joker') === undefined, 'one per family: Wurmple held -> its line is out');
  start('POOL11B', { gen_three: false });
  ok(pool_filter(C('wurmple'), 'Joker') === false && pool_filter(C('ralts'), 'Joker') === false, 'Gen 3 off -> out');
});

// ------------------------------------------------------------------- the Wurmple line
sec(() => {
  start('WURMPLE');
  const j = add('j_poke_wurmple');
  ok(['Spades', 'Hearts', 'Diamonds', 'Clubs'].includes(j.ability.extra.targets[0].suit), 'wurmple: a Nature suit on creation', j.ability.extra.targets);
  j.ability.extra.targets = [{ suit: 'Hearts' }];
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    clearHand();
    const r = play(hand(['H_A']));
    // High Card: 5 + 11 = 16 chips x1; +3 Mult or +20 Chips
    if (r.total.chips === 16 && r.total.mult === 4) seen.add('mult'); else if (r.total.chips === 36 && r.total.mult === 1) seen.add('chips'); else seen.add('bad');
  }
  ok(seen.has('mult') && seen.has('chips') && !seen.has('bad'), 'wurmple: +3 Mult or +20 Chips', [...seen]);
  ok(j.ability.extra.nature_scored === 8, 'wurmple: counts scored Nature cards', j.ability.extra.nature_scored);
  j.ability.extra.nature_scored = 4;
  winRound();
  ok(key(j) === 'j_poke_wurmple', 'wurmple: 4 of 5 -> not yet');
  nextRound();
  clearHand();
  play(hand(['H_K']));
  winRound();
  ok(key(j) === 'j_poke_silcoon' && j.ability.extra.targets[0].suit === 'Hearts', 'wurmple (Hearts) -> silcoon after 5, Nature kept', [key(j), j.ability.extra.targets]);
  // Spades -> Cascoon
  start('WURMPLE2');
  const k = add('j_poke_wurmple');
  k.ability.extra.targets = [{ suit: 'Clubs' }];
  k.ability.extra.nature_scored = 5;
  winRound();
  ok(key(k) === 'j_poke_cascoon' && k.ability.extra.targets[0].suit === 'Clubs', 'wurmple (Clubs) -> cascoon', key(k));
});
sec(() => {
  start('SILCOON');
  const j = add('j_poke_silcoon');
  ok(['Hearts', 'Diamonds'].includes(j.ability.extra.targets[0].suit), 'silcoon: Hearts or Diamonds', j.ability.extra.targets);
  j.ability.extra.targets = [{ suit: 'Diamonds' }];
  const r = play(hand(['D_A']));
  ok(r.total.chips === 16 && r.total.mult === 9 && j.ability.extra.nature_scored === 1, 'silcoon: +8 Mult, counts the Diamond', [r.total, j.ability.extra.nature_scored]);
  j.ability.extra.nature_scored = 15;
  winRound();
  ok(key(j) === 'j_poke_beautifly', 'silcoon -> beautifly after 15', key(j));
});
sec(() => {
  start('BEAUTIFLY');
  const j = add('j_poke_beautifly');
  j.ability.extra.targets = [{ suit: 'Hearts' }];
  j.ability.extra.num = 3; // (1 in 3 -> always)
  const r = play(hand(['H_A']));
  ok(G.GAME.hands.Flush.level === 2 && statusMsgs(r.events).includes(localize('k_upgrade_ex')), 'beautifly: a scoring Nature card levels up Flush ("Upgrade!")', [G.GAME.hands.Flush.level, statusMsgs(r.events)]);
  ok(r.total.chips === 16 && r.total.mult === 9, 'beautifly: +8 Mult', r.total);
  clearHand();
  const r2 = play(hand(['S_2', 'S_4', 'S_6', 'S_8', 'S_T']));
  ok(G.GAME.hands.Flush.level === 2, 'beautifly: no Nature card -> no level', G.GAME.hands.Flush.level);
  clearHand();
  const r3 = play(hand(['H_2', 'H_4', 'H_6', 'H_8', 'H_T']));
  // Flush levelled before scoring (level 3: 35 + 2 x 15 = 65 chips, 4 + 2 x 2 = 8 Mult): 65 + 30 = 95 chips, 8 + 8 Mult
  ok(G.GAME.hands.Flush.level === 3 && r3.total.chips === 95 && r3.total.mult === 16, 'beautifly: a Flush levels itself before it scores', [G.GAME.hands.Flush.level, r3.total]);
  void r2;
});
sec(() => {
  start('CASCOON');
  const j = add('j_poke_cascoon');
  j.ability.extra.targets = [{ suit: 'Spades' }];
  const r = play(hand(['S_A']));
  ok(r.total.chips === 76 && r.total.mult === 1 && j.ability.extra.nature_scored === 1, 'cascoon: +60 Chips', [r.total, j.ability.extra.nature_scored]);
  j.ability.extra.nature_scored = 15;
  winRound();
  ok(key(j) === 'j_poke_dustox', 'cascoon -> dustox after 15', key(j));
});
sec(() => {
  start('DUSTOX');
  const j = add('j_poke_dustox');
  j.ability.extra.targets = [{ suit: 'Spades' }];
  hand(['S_3', 'S_5']);
  const r = play(hand(['H_A']));
  ok(r.total.chips === 76 && r.total.mult === 3 && statusMsgs(r.events).includes(localize('poke_bug_buzz_ex')), 'dustox: every held card a Spade -> +60 Chips, X3 ("Bug Buzz!")', [r.total, statusMsgs(r.events)]);
  clearHand();
  hand(['S_3', 'H_5']);
  const r2 = play(hand(['H_A']));
  ok(r2.total.chips === 76 && r2.total.mult === 1, 'dustox: a non-Spade held -> +60 Chips only', r2.total);
});

// ------------------------------------------------------------------- Seedot line
sec(() => {
  start('SEEDOT');
  const j = add('j_poke_seedot');
  const r = play(hand(['S_A'], { center: 'm_poke_seed' }));
  ok(r.total.chips === 56, 'seedot: a scored Seed card +40 Chips (5 + 11 + 40)', r.total);
  clearHand();
  const r2 = play(hand(['S_A']));
  ok(r2.total.chips === 16, 'seedot: not a plain card', r2.total);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_nuzleaf', 'seedot -> nuzleaf after its rounds', key(j));
});
sec(() => {
  start('NUZLEAF');
  const j = add('j_poke_nuzleaf');
  clearHand();
  const fl = onDeck('S_K', 'm_poke_flower');
  discard(hand(['S_2']));
  ok(G.hand.cards.includes(fl) && key(fl) === 'm_poke_seed' && fl.ability.extra.level === 0, 'nuzleaf: a drawn Flower card becomes a Seed card (level 0)', [key(fl), fl.ability.extra]);
  clearHand();
  const r = play(hand(['S_A'], { center: 'm_poke_seed' }));
  ok(r.total.chips === 66, 'nuzleaf: Seed cards +50 Chips', r.total);
  j.ability.extra.evolve = true; // (a Leaf Stone used on it)
  winRound();
  ok(key(j) === 'j_poke_shiftry', 'nuzleaf -> shiftry with a Leaf Stone', key(j));
});
sec(() => {
  start('SHIFTRY');
  const g0 = G.GAME.poke_growth_level || 0;
  const j = add('j_poke_shiftry');
  ok((G.GAME.poke_growth_level || 0) === g0 + 1, 'shiftry: +1 growth level', G.GAME.poke_growth_level);
  const r = play(hand(['S_A'], { center: 'm_poke_seed' }));
  ok(r.total.chips === 76, 'shiftry: Seed cards +60 Chips', r.total);
  act({ type: 'sell', id: j.sort_id });
  ok((G.GAME.poke_growth_level || 0) === g0, 'shiftry sold: growth level back', G.GAME.poke_growth_level);
});

// ------------------------------------------------------------------- Taillow / Swellow
sec(() => {
  start('TAILLOW');
  const j = add('j_poke_taillow');
  clearHand();
  onDeck('D_A'); onDeck('C_A');
  discard(hand(['S_2']));
  ok(j.ability.extra.mult === 8, 'taillow: +4 Mult per Ace drawn during the Blind', j.ability.extra.mult);
  clearHand();
  const r = play(hand(['S_3']));
  ok(r.total.mult === 9, 'taillow: scores its Mult', r.total);
  j.ability.extra.rounds = 1;
  const w = winRound();
  ok(statusMsgs(w.events).includes(localize('k_reset')) && key(j) === 'j_poke_swellow' && j.ability.extra.mult === 0, 'taillow: resets at end of round, -> swellow', [key(j), j.ability.extra.mult]);
});
sec(() => {
  // Swellow: when the Boss Blind is selected, the top 2 deck cards become Aces (drawn with the first hand: +6 Mult each)
  const bossHand = (withSwellow) => {
    start('SWELLOW', {}, { noBlind: true });
    const j = withSwellow ? add('j_poke_swellow') : null;
    act({ type: 'skip_blind' });
    act({ type: 'skip_blind' });
    act({ type: 'select_blind' });
    return { j, ids: G.hand.cards.map((c) => c.get_id()), boss: G.GAME.blind.boss };
  };
  const plain = bossHand(false), sw = bossHand(true);
  const aces = (h) => h.ids.filter((id) => id === 14).length;
  // (the same seed: the same first hand, but the 2 cards drawn last were the deck's top 2, now Aces)
  const left = plain.ids.slice(); for (const id of sw.ids) { const i = left.indexOf(id); if (i >= 0) left.splice(i, 1); }
  const changed = left.length;
  ok(sw.boss && changed === 2 && aces(sw) >= 2 && aces(sw) > aces(plain), 'swellow: the top 2 deck cards became Aces as the first Boss hand was drawn', [plain.ids, sw.ids]);
  ok(sw.j.ability.extra.mult === 6 * aces(sw), 'swellow: +6 Mult per Ace drawn', [sw.j.ability.extra.mult, aces(sw)]);
  ok(sw.j.ability.extra.active === undefined, 'swellow: once per Boss');
  const r = play(hand(['S_3']));
  ok(r.total.mult === 1 + 6 * aces(sw), 'swellow: scores its Mult', r.total);
});

// ------------------------------------------------------------------- Wingull / Pelipper
sec(() => {
  start('WINGULL');
  const wc = G.GAME.current_round.wingullcard;
  ok(wc && wc.rank && typeof wc.id === 'number', 'wingullcard: a rank of the round (reset_game_globals)', wc);
  const j = add('j_poke_wingull');
  G.GAME.current_round.wingullcard = { rank: 'King', id: 13 };
  const d0 = G.GAME.dollars;
  clearHand();
  discard(hand(['S_K', 'H_K', 'S_4']));
  G.E_MANAGER.flush();
  ok(G.GAME.dollars - d0 === 8, 'wingull: $4 per discarded King', G.GAME.dollars - d0);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_pelipper', 'wingull -> pelipper', key(j));
  nextRound();
  ok(G.GAME.current_round.wingullcard.id !== undefined, 'a new rank each round');
});
sec(() => {
  start('PELIPPER');
  add('j_poke_pelipper');
  add('j_poke_squirtle');
  G.GAME.current_round.wingullcard = { rank: '7', id: 7 };
  const d0 = G.GAME.dollars;
  clearHand();
  discard(hand(['S_7']));
  G.E_MANAGER.flush();
  ok(G.GAME.dollars - d0 === 6, 'pelipper: $4 + $1 per Water joker (itself and Squirtle)', G.GAME.dollars - d0);
});

// ------------------------------------------------------------------- Ralts line
sec(() => {
  start('RALTS');
  const j = add('j_poke_ralts');
  const e = add('j_poke_bulbasaur');
  e.ability.extra.energy_count = 1;
  add('c_pluto');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 11, 'ralts: +5 Mult per Energized joker and held Planet (2)', r.total);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_kirlia', 'ralts -> kirlia', key(j));
});
sec(() => {
  start('KIRLIA');
  const j = add('j_poke_kirlia');
  const p = add('c_pluto');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 9, 'kirlia: +8 Mult per held Planet', r.total);
  j.ability.extra.planets_used = 14;
  act({ type: 'use', id: p.sort_id });
  ok(j.ability.extra.planets_used === 15, 'kirlia: counts Planets used', j.ability.extra.planets_used);
  j.ability.extra.evolve = true; // (Gallade, its Dawn Stone evolution, isn't ported yet: inert)
  winRound();
  ok(key(j) === 'j_poke_gardevoir', 'kirlia -> gardevoir after 15 Planets (not Gallade)', key(j));
  ok(G.consumeables.cards.some((c) => key(c) === 'c_black_hole'), 'gardevoir (evolved): holding a Black Hole');
});
sec(() => {
  start('GARDEVOIR');
  add('j_poke_gardevoir');
  ok(G.consumeables.cards.some((c) => key(c) === 'c_black_hole'), 'gardevoir: comes holding a Black Hole');
  G.GAME.hands.Pair.level = 5;
  const r = play(hand(['S_A']));
  ok(Math.abs(r.total.mult - 1.3) < 1e-9, 'gardevoir: X1.3 for one level-5+ hand', r.total);
});

// ------------------------------------------------------------------- Surskit / Masquerain
sec(() => {
  start('SURSKIT');
  const r0 = play(hand(['S_T', 'H_9', 'D_9', 'C_8', 'S_7']));
  ok(r0.res.events.find((e) => e.type === 'hand_eval' || e.type === 'hand_total') && r0.total.mult === 2, 'no Surskit: 10 9 9 8 7 is a Pair', r0.total);
  const j = add('j_poke_surskit');
  clearHand();
  const r = play(hand(['S_T', 'H_9', 'D_9', 'C_8', 'S_7']));
  // Straight 30 x 4 + 10 + 9 + 9 + 8 + 7 (every card scores)
  ok(r.total.chips === 73 && r.total.mult === 4 && j.ability.extra.straights_played === 1, 'surskit: 10 9 9 8 7 is a Straight', [r.total, j.ability.extra]);
  clearHand();
  const r2 = play(hand(['S_9', 'H_9', 'D_8', 'C_8', 'S_7']));
  ok(r2.total.mult === 4, 'surskit: 9 9 8 8 7 (two pairs: 3 in a row) is a Straight', r2.total);
  j.ability.extra.straights_played = 8;
  winRound();
  ok(key(j) === 'j_poke_masquerain', 'surskit -> masquerain after 8 Straights', key(j));
  ok(G.GAME.scry_amount === 4, 'masquerain: +4 Foresight', G.GAME.scry_amount);
});
sec(() => {
  start('MASQ');
  const s0 = G.GAME.scry_amount || 0;
  const j = add('j_poke_masquerain');
  ok(G.GAME.scry_amount === s0 + 4, 'masquerain: +4 Foresight', G.GAME.scry_amount);
  const r = play(hand(['S_6', 'H_5', 'D_5', 'C_4', 'S_3']));
  ok(r.total.mult === 4, 'masquerain: duplicate-rank Straights', r.total);
  act({ type: 'sell', id: j.sort_id });
  ok((G.GAME.scry_amount || 0) === s0, 'masquerain sold: Foresight back');
});

// ------------------------------------------------------------------- Slakoth line
sec(() => {
  start('SLAKOTH');
  const j = add('j_poke_slakoth');
  G.GAME.current_round.hands_left = 4;
  const r = play(hand(['S_A']));
  ok(r.total.mult === 16 && G.GAME.current_round.hands_left === 2, 'slakoth: +15 Mult, and a hand lost', [r.total, G.GAME.current_round.hands_left]);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_vigoroth', 'slakoth -> vigoroth', key(j));
});
sec(() => {
  start('VIGOROTH');
  const j = add('j_poke_vigoroth');
  G.GAME.current_round.hands_left = 4;
  const r = play(hand(['S_A']));
  ok(r.total.mult === 2.5, 'vigoroth: X(1 + 0.5 x 3 hands left)', r.total);
  j.ability.extra.rounds = 1;
  clearHand();
  discard(hand(['S_2']));
  winRound();
  ok(key(j) === 'j_poke_vigoroth' && j.ability.extra.rounds === 1, 'vigoroth: a round with a discard does not count', j.ability.extra.rounds);
  nextRound();
  winRound();
  ok(key(j) === 'j_poke_slaking', 'vigoroth -> slaking after a round without discards', key(j));
});
sec(() => {
  start('SLAKING');
  add('j_poke_slaking');
  G.GAME.current_round.hands_left = 4;
  const r = play(hand(['S_A']));
  ok(r.total.mult === 4 && G.GAME.current_round.hands_left === 2, 'slaking: X4, and a hand lost', [r.total, G.GAME.current_round.hands_left]);
});

// ------------------------------------------------------------------- Nincada / Ninjask / Shedinja
sec(() => {
  start('NINCADA');
  const j = add('j_poke_nincada');
  j.ability.extra.num = 2; // (1 in 2 -> always)
  const n0 = G.consumeables.cards.length;
  const r = play(hand(['S_9']));
  ok(j.ability.extra.chips === 60 && r.total.chips === 5 + 9 + 60, 'nincada: a 9 -> -5 Chips (then +60)', [j.ability.extra.chips, r.total]);
  ok(G.consumeables.cards.length === n0 + 1, 'nincada: ... and a random consumable', G.consumeables.cards.map(key));
  clearHand();
  play(hand(['S_A']));
  ok(j.ability.extra.chips === 60, 'nincada: no 9 / Jack -> no change');
  j.ability.extra.chips = 5;
  clearHand();
  play(hand(['H_J']));
  ok(j.ability.extra.chips === 0, 'nincada: down to 0', j.ability.extra.chips);
  const n = G.jokers.cards.length;
  winRound();
  const sh = G.jokers.cards.find((c) => key(c) === 'j_poke_shedinja');
  ok(key(j) === 'j_poke_ninjask' && sh && G.jokers.cards.length === n + 1, 'nincada at 0 Chips -> Ninjask AND a Shedinja (Multi Evolution)', G.jokers.cards.map(key));
  ok(sh && sh.ability.extra.Xmult === 1 && sh.added_to_deck, 'the Shedinja is a fresh, owned joker', sh && sh.ability.extra);
});
sec(() => {
  // No room: only Ninjask
  start('NINCADA2');
  const j = add('j_poke_nincada');
  for (let i = 1; i < G.jokers.config.card_limit; i++) add('j_joker');
  j.ability.extra.chips = 0;
  winRound();
  ok(key(j) === 'j_poke_ninjask' && !G.jokers.cards.some((c) => key(c) === 'j_poke_shedinja'), 'nincada: a full joker row -> Ninjask only', G.jokers.cards.map(key));
});
sec(() => {
  start('NINJASK', {}, { noBlind: true });
  const j = add('j_poke_ninjask');
  j.ability.extra.num = 2;
  act({ type: 'select_blind' });
  G.E_MANAGER.flush();
  ok(G.GAME.tags.some((t) => t.key === 'tag_skip'), 'ninjask: a Speed Tag at Blind select', G.GAME.tags.map((t) => t.key));
  clearHand();
  const d0 = G.GAME.dollars;
  const r = play(hand(['S_9', 'H_9']));
  // Pair 10 + 18 chips, 2 + 13 + 13 Mult; no $ (3.9.1 passes a money_mod Ninjask doesn't have)
  ok(r.total.chips === 28 && r.total.mult === 28 && G.GAME.dollars === d0, 'ninjask: each 9 / Jack of the first hand +13 Mult', [r.total, G.GAME.dollars - d0]);
  clearHand();
  const r2 = play(hand(['S_9', 'H_9']));
  ok(r2.total.mult === 2, 'ninjask: not on the second hand', r2.total);
});
sec(() => {
  start('SHEDINJA');
  const j = add('j_poke_shedinja');
  // lose a Small Blind: saved
  clearHand();
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15; G.GAME.current_round.hands_left = 1;
  const cards = hand(['S_2']);
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  ok(G.STATE !== STATES.GAME_OVER && j.ability.extra.Xmult === 1.5 && statusMsgs(r.events).includes(localize('k_saved_ex')), 'shedinja: prevents death on a non-Boss Blind, +X0.5', [G.STATE, j.ability.extra.Xmult]);
  ok(G.GAME.saved_by === 'j_poke_shedinja', 'saved by Shedinja', G.GAME.saved_by);
  act({ type: 'cash_out' });
  act({ type: 'next_round' });
  act({ type: 'select_blind' });
  clearHand();
  const r2 = play(hand(['S_A']));
  ok(r2.total.mult === 1.5, 'shedinja: X1.5', r2.total);
  // a Fire joker at the end of the shop: it self-destructs
  winRound();
  act({ type: 'cash_out' });
  add('j_poke_charmander');
  const e = act({ type: 'next_round' });
  G.E_MANAGER.flush();
  ok(!G.jokers.cards.includes(j) && statusMsgs(e.events).includes(localize('poke_screech_ex')), 'shedinja: self-destructs beside a Fire joker at end of shop ("Skree!")', G.jokers.cards.map(key));
});
sec(() => {
  start('SHEDINJA2');
  const a = add('j_poke_shedinja');
  add('j_poke_shedinja'); // (another Shedinja is Psychic too, but excluded)
  winRound();
  act({ type: 'cash_out' });
  act({ type: 'next_round' });
  G.E_MANAGER.flush();
  ok(G.jokers.cards.includes(a) && G.jokers.cards.length === 2, 'shedinja: other Shedinjas do not count', G.jokers.cards.map(key));
});

// ------------------------------------------------------------------- Makuhita / Hariyama
sec(() => {
  start('MAKUHITA', {}, { noBlind: true });
  const j = add('j_poke_makuhita');
  const h0 = G.GAME.round_resets.hands;
  act({ type: 'select_blind' });
  ok(G.GAME.current_round.hands_left === h0 + 1, 'makuhita: +1 hand at Blind select', G.GAME.current_round.hands_left);
  j.ability.extra.rounds = 1;
  clearHand();
  winRound();
  ok(key(j) === 'j_poke_hariyama', 'makuhita -> hariyama', key(j));
});
sec(() => {
  start('HARIYAMA', {}, { noBlind: true });
  add('j_poke_hariyama');
  add('j_poke_machop');
  const h0 = G.GAME.round_resets.hands;
  act({ type: 'select_blind' });
  ok(G.GAME.current_round.hands_left === h0 + 2, 'hariyama: +1 hand per Fighting joker (2)', G.GAME.current_round.hands_left);
});

// ------------------------------------------------------------------- Skitty
sec(() => {
  start('SKITTY');
  const j = add('j_poke_skitty');
  const fire = add('j_joker');
  fire.ability.fire_sticker = true;
  G.GAME.current_round.cattype = 'Fire';
  const r = play(hand(['S_A']));
  ok(r.total.mult === 9, 'skitty: copies the joker to its right of the round\'s type (Joker +4, twice)', r.total);
  C('skitty').update(C('skitty'), j);
  ok(j.ability.blueprint_compat === 'compatible', 'skitty: the compatible badge', j.ability.blueprint_compat);
  G.GAME.current_round.cattype = 'Water';
  clearHand();
  const r2 = play(hand(['S_A']));
  ok(r2.total.mult === 5, 'skitty: not another type', r2.total);
  C('skitty').update(C('skitty'), j);
  ok(j.ability.blueprint_compat === 'incompatible', 'skitty: the incompatible badge');
  j.ability.extra.evolve = true; // (Delcatty, its Moon Stone evolution, isn't ported yet: inert)
  winRound();
  ok(key(j) === 'j_poke_skitty', 'skitty: no Delcatty yet');
  ok(G.GAME.current_round.cattype === 'Fire', 'cattype: reset to a held joker\'s type (Skitty excluded)', G.GAME.current_round.cattype);
});

// ------------------------------------------------------------------- add-ons
// Nacho (its own Ralts line) and Pokermon+ (its Nincada line) add families under the same names: like 3.9.1's add_family
// (= add_to_family), they join the 3.9.1 family instead of making a second one.
await import('../../mods/nacho/index.js');
await import('../../mods/pokermonplus/index.js');
sec(() => {
  ok(JSON.stringify(poke_get_family_list('ralts')) === JSON.stringify(['ralts', 'kirlia', 'gardevoir', 'mega_gardevoir', 'gallade', 'mega_gallade']), 'the Nacho Ralts line joins the 3.9.1 family', poke_get_family_list('ralts'));
  ok(JSON.stringify(poke_get_family_list('nincada')) === JSON.stringify(['nincada', 'ninjask', 'shedinja']), 'the Pokermon+ Nincada line is the same family', poke_get_family_list('nincada'));
  ok(family.filter((f) => f.some((y) => ['ralts', 'nincada'].includes(y.key || y))).length === 2, 'one family each');
  ok(get_family_keys('kirlia', 'nacho').includes('j_nacho_gallade'), 'the Nacho Kirlia still finds its Gallade');
});

// ------------------------------------------------------------------- the art
if (!ART) console.log('(Pokermon art not on disk: the sprite checks are skipped; set MICATRO_MAIN)');
else if (!NEW.every(C)) ok(false, 'art: the new jokers are not registered');
else {
  const ATL = MODS.pokermon.content.atlases;
  const want = {};
  for (const n of NEW) {
    const c = C(n);
    for (const a of [c.atlas, c.atlas.replace(/391$/, '').replace(/$/, 'Shiny391')]) {
      const A = ATL[a];
      const file = decodeURIComponent(A.src).replace(/^.*\/assets\/2x\//, '');
      (want[file] || (want[file] = {}))[n + '|' + a] = [c.pos.x * 142, c.pos.y * 190, 142, 190];
    }
  }
  const px = {};
  for (const [file, rects] of Object.entries(want)) Object.assign(px, await crops(path.join(ART, file), rects));
  for (const n of NEW) {
    const c = C(n);
    const base = px[n + '|' + c.atlas], shiny = px[n + '|' + c.atlas.replace(/391$/, 'Shiny391')];
    const opaque = (r) => { let k = 0; for (let i = 3; i < r.px.length; i += 4) if (r.px[i] > 0) k++; return k / (r.px.length / 4); };
    let diff = 0; for (let i = 0; i < base.px.length; i++) diff += Math.abs(base.px[i] - shiny.px[i]);
    ok(base.inside && opaque(base) > 0.5 && shiny.inside && opaque(shiny) > 0.5 && diff > 0, `${n}: a real 3.9.1 sprite and Shiny (${c.atlas} ${c.pos.x},${c.pos.y})`, [opaque(base), opaque(shiny), diff]);
  }
  void fs;
}

done();
