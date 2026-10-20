// pokermon_391_reworks_a_test.mjs — Pokermon 3.9.1 upgrade, batch 6 (Plans/MICATRO_MODS_UPGRADES.md): the joker reworks
// of pokejokers_01-08 (the Gen 1 / Gen 2 range). Every existing joker of those files is on its 3.9.1 behaviour and takes
// ALL its 3.9.1 static data (data391.js `reworked`: config_all, compat flags, the Joker loc entry), except the holds
// (spec rework_hold: they keep 3.2.1 behaviour + data until their system lands).
//   - the overlay: reworked / held sets, a whole 3.9.1 config, 3.9.1 text, loc_extra; contentRev 3 (pin 3.9.1+r3)
//   - every reworked joker's loc_vars fills the #n# its 3.9.1 text reads (no "#4#" left on a card)
//   - one or more reworks per file FIRED through real plays (Spearow, Pikachu, Golbat, Victreebel, Onix, Koffing,
//     Flareon, Eevee, Crobat, Houndour, Smeargle), and the shared changes: the Poli suit cycles after every scored hand
//     in Pokermon's mod-level calculate (with no Poli joker: the new engine seam), Smeargle is no Smeared Joker any more,
//     Xatu no longer fills Celestial packs, Tauros (Herd) and Shell are never in a pool, cards_drawn survives evolution
//   - the holds and the house rules / kept fixes stay
//   node micatro/tests/mods/pokermon_391_reworks_a_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import DATA from '../../mods/pokermon/data.js';
import D391 from '../../mods/pokermon/data391.js';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const C = (n) => P_CENTERS['j_poke_' + n];
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const JOKER_LOC = DATA.loc.descriptions.Joker;
const RANGE = /pokejokers_0[1-8]\.lua$/;
const inRange = DATA.groups.jokers.filter((f) => RANGE.test(f.file)).flatMap((f) => f.ret.list.map((it) => it.name));
// (batch 7 reworked pokejokers_09-17 too: this test covers batch 6's range; pokermon_391_reworks_b_test.mjs the rest)
const RW_ALL = D391.reworked || [], RW = RW_ALL.filter((n) => inRange.includes(n));
const RH = (D391.rework_hold || []).filter(([n]) => inRange.includes(n));
const HOLDS = ['qwilfish', 'skarmory', 'unown', 'mega_steelix', 'bellossom', 'hoppip', 'skiploom', 'jumpluff'];

// ---------------------------------------------------------------- the overlay + version
// (contentRev 3 since batch 6; later batches bump it: batch 7 is 4, pokermon_391_reworks_b_test.mjs)
ok(MODS.pokermon.version === '3.9.1' && MODS.pokermon.contentRev >= 3 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon 3.9.1, contentRev 3+ (pin 3.9.1+r3 since batch 6)', PINS.modPin('pokermon'));
ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'the legacy pin is untouched');
ok(RW.length === inRange.length - HOLDS.length && inRange.length === 263,
  `reworked: every joker of pokejokers_01-08 but the ${HOLDS.length} holds (Pokermon 3.9.1)`, [RW && RW.length, inRange.length]);
ok(HOLDS.every((n) => !RW.includes(n)) && RH.map(([n]) => n).sort().join() === HOLDS.slice().sort().join(), 'the holds: Hazard layer (Qwilfish, Skarmory), Unown, Mega Steelix (quantum Hazard), the Seed jokers', RH);
{
  const LATER = /pokejokers_(09|1[0-7])\.lua$/; // batch 7
  const later = DATA.groups.jokers.filter((f) => LATER.test(f.file)).flatMap((f) => f.ret.list.map((it) => it.name));
  ok(RW_ALL.every((n) => inRange.includes(n) || later.includes(n)), 'nothing outside pokejokers_01-08 (batch 6) and 09-17 (batch 7) is reworked yet', RW_ALL.filter((n) => !inRange.includes(n) && !later.includes(n)));
}
ok(C('spearow').config.evo_rqmt === 3 && C('spearow').config.extra.card_threshold === 30 && C('spearow').config.extra.cards_scored === undefined && C('spearow').blueprint_compat === true,
  'a reworked joker takes its whole 3.9.1 config and flags (Spearow: 30 cards drawn, evolves after 3 triggers) (Pokermon 3.9.1)', C('spearow').config);
ok(C('golbat').config.evo_rqmt === 16 && C('flareon').config.extra.Xmult_multi === 2 && C('mankey').config.extra.mult_mod !== undefined && C('mankey').config.extra.mult === undefined,
  'renamed / dropped keys follow 3.9.1 (Golbat 16, Flareon X2, Mankey mult_mod) (Pokermon 3.9.1)');
ok(/Mult if you/.test(JOKER_LOC.j_poke_pikachu.text.join(' ')) && /drawing/.test(JOKER_LOC.j_poke_spearow.text.join(' ')), 'reworked jokers show their 3.9.1 text (Pikachu, Spearow) (Pokermon 3.9.1)', JOKER_LOC.j_poke_pikachu.text);
ok(DATA.loc.descriptions.Other.bat_leech && DATA.loc.misc.dictionary.poke_leech_life_ex, 'loc_extra: Crobat\'s Leech tooltip and "Leech!" (Pokermon 3.9.1)');

// ---------------------------------------------------------------- every reworked joker's text is filled
{
  start('RW391LOC');
  G.jokers.config.card_limit = 1000;
  const bad = [];
  const maxVar = (text) => { let m = 0; for (const l of [text].flat(3)) for (const x of String(l).matchAll(/#(\d+)#/g)) m = Math.max(m, +x[1]); return m; };
  for (const n of RW) {
    const c = add('j_poke_' + n);
    const center = c.config.center;
    let ret;
    try { ret = center.loc_vars ? center.loc_vars(center, [], c) : { vars: [] }; } catch (e) { bad.push(n + ': throws ' + e.message); continue; }
    const entry = JOKER_LOC[(ret && ret.key) || center.key];
    const need = entry ? maxVar(entry.text) : 0;
    const vars = (ret && ret.vars) || [];
    if (!entry) bad.push(n + ': no loc');
    else if (vars.length < need || vars.slice(0, need).some((v) => v === undefined || (typeof v === 'number' && Number.isNaN(v)))) bad.push(`${n}: needs #${need}#, got ${JSON.stringify(vars)}`);
  }
  ok(bad.length === 0, `every reworked joker's loc_vars fills its 3.9.1 text (${RW.length}) (Pokermon 3.9.1)`, bad);
}

// ---------------------------------------------------------------- 01: Spearow (cards drawn), Pikachu
{
  start('RW391SPEAR');
  const j = add('j_poke_spearow');
  j.ability.extra.cards_drawn = 25;
  play(hand(['S_A'])); // the hand refills: 8 cards drawn during the Blind
  ok(j.ability.extra.upgrade === true, 'spearow: armed by drawing 30 cards, not scoring them (Pokermon 3.9.1)', j.ability.extra);
  const lvl = G.GAME.hands['High Card'].level;
  clearHand();
  play(hand(['S_K']));
  ok(G.GAME.hands['High Card'].level === lvl + 1 && j.ability.extra.triggers === 1, 'spearow: levels up the next hand (Pokermon 3.9.1)', j.ability.extra);
  j.ability.extra.triggers = 2; j.ability.extra.upgrade = true; j.ability.extra.cards_drawn = 7;
  winRound();
  ok(key(j) === 'j_poke_fearow' && j.ability.extra.cards_drawn === 7, 'spearow -> fearow after 3 triggers, carrying its cards drawn (Pokermon 3.9.1)', [key(j), j.ability.extra]);
}
{
  start('RW391PIKA', {}, { noBlind: true });
  add('j_poke_pikachu');
  G.GAME.dollars = 10;
  act({ type: 'select_blind' }); clearHand();
  ok(G.GAME.dollars === 12, 'pikachu: $2 when a Blind is selected under $25 (Pokermon 3.9.1)', G.GAME.dollars);
  G.GAME.dollars = 30;
  const r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 10, 'pikachu: +10 Mult at $25 or more (Pokermon 3.9.1)', r.total);
}
// ---------------------------------------------------------------- 02: Golbat
{
  start('RW391GOLB');
  const j = add('j_poke_golbat');
  play(hand(['S_3', 'H_3'], { center: 'm_bonus' }));
  const r = play(hand(['S_A']));
  ok(j.ability.extra.mult === 4 && r.total.chips === 16 && r.total.mult === 1 + 4, 'golbat: +2 Mult per Enhancement eaten, no Chips half (Pokermon 3.9.1)', [j.ability.extra, r.total]);
}
// ---------------------------------------------------------------- 03: Victreebel (round retriggers)
{
  start('RW391VICT');
  const j = add('j_poke_victreebel');
  const r = play(hand(['S_2', 'H_2', 'D_2', 'C_2', 'S_4']));
  const rt = j.ability.extra.round_retriggers;
  ok(rt === 4, 'victreebel: retriggers the first 4 even cards of the round (Pokermon 3.9.1)', j.ability.extra);
  const r2 = play(hand(['S_6']));
  ok(r2.total.chips === 5 + 6 + 24, 'victreebel: none left this round, the chips stay (+24) (Pokermon 3.9.1)', r2.total);
  void r;
}
// ---------------------------------------------------------------- 04: Onix, Koffing
{
  start('RW391ONIX');
  add('j_poke_onix');
  const stones = () => G.playing_cards.filter((c) => key(c) === 'm_stone').length;
  const [a] = hand(['S_A']);
  const s0 = stones();
  const hm = add('c_hanged_man');
  act({ type: 'use', id: hm.sort_id, targets: [a.sort_id] });
  G.E_MANAGER.flush();
  ok(stones() === s0 + 1, 'onix: a destroyed playing card adds a Stone card to the deck (Pokermon 3.9.1)', stones() - s0);
}
{
  start('RW391KOFF');
  const k = add('j_poke_koffing');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 12 && k.debuff, 'koffing: Volatile Left +12 Mult, then faints (Pokermon 3.9.1)', r.total);
}
// ---------------------------------------------------------------- 05: Flareon, Eevee
{
  start('RW391FLAR');
  add('j_poke_flareon');
  const r = play(hand(['S_A', 'H_A', 'D_A'], { center: 'm_mult' }));
  ok(r.total.mult === ((3 + 4 + 4) * 2 + 4) * 2, 'flareon: the last 2 scoring Mult cards give X2 (Pokermon 3.9.1)', r.total);
}
{
  start('RW391EEVE');
  add('j_poke_eevee'); add('j_poke_bulbasaur');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4 * 2, 'eevee: +4 Mult per Joker that can still evolve (Pokermon 3.9.1)', r.total);
}
// ---------------------------------------------------------------- 06: Crobat, Xatu
{
  start('RW391CROB');
  const j = add('j_poke_crobat');
  const [c] = hand(['S_A'], { center: 'm_mult' });
  const r = play([c]);
  ok(key(c) === 'c_base' && j.ability.extra.mult === 2 && statusMsgs(r.events).includes('Leech!'), 'crobat: leeches the Enhancement, "Leech!" (Pokermon 3.9.1)', [key(c), j.ability.extra, statusMsgs(r.events)]);
}
{
  start('RW391XATU');
  add('j_poke_xatu');
  winRound(); act({ type: 'cash_out' });
  const pack = G.shop_booster.cards[0];
  pack.set_ability(P_CENTERS.p_celestial_normal_1);
  G.GAME.dollars = 100;
  act({ type: 'buy', id: pack.sort_id });
  G.E_MANAGER.flush();
  ok(G.pack_cards && G.pack_cards.cards.length === 3, 'xatu: a Celestial Pack holds its normal 3 cards, not every Planet (Pokermon 3.9.1)', G.pack_cards && G.pack_cards.cards.length);
}
// ---------------------------------------------------------------- 07 / 08: Houndour, Smeargle (no more Smeared Joker)
{
  start('RW391HOUN');
  const lim0 = G.GAME.starting_params.discard_limit ?? 5;
  add('j_poke_houndour');
  ok(G.GAME.starting_params.discard_limit === lim0 + 1, 'houndour: +1 discard selection limit (Pokermon 3.9.1)', G.GAME.starting_params.discard_limit);
}
{
  start('RW391SMEA');
  const s = add('j_poke_smeargle');
  const cat = add('j_poke_caterpie');
  nextRound();
  const r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 3 + 3, 'smeargle: sketches the joker to its right at Blind select and copies it (Pokermon 3.9.1)', r.total);
  const [h] = hand(['H_5']);
  ok(!h.is_suit('Diamonds'), 'smeargle: no longer a Smeared Joker (Hearts are not Diamonds) (Pokermon 3.9.1)');
  void s; void cat;
}
// ---------------------------------------------------------------- the Poli suit (mod-level calculate, `after` seam)
{
  start('RW391POLI');
  ok(!G.GAME.poke_poli_suit, 'poli suit: unset at the start');
  play(hand(['S_A']));
  ok(G.GAME.poke_poli_suit === 'Hearts', 'poli suit: cycles after a scored hand with no Poli joker held (Pokermon 3.9.1 mod calculate)', G.GAME.poke_poli_suit);
  add('j_poke_poliwag'); add('j_poke_poliwhirl'); add('j_poke_politoed');
  play(hand(['S_A']));
  ok(G.GAME.poke_poli_suit === 'Clubs', 'poli suit: one step per hand however many Poli jokers (Pokermon 3.9.1)', G.GAME.poke_poli_suit);
  const [d] = hand(['S_K']);
  act({ type: 'highlight', ids: [d.sort_id] }); act({ type: 'discard' });
  ok(G.GAME.poke_poli_suit === 'Clubs', 'poli suit: a discard does not cycle it (Pokermon 3.9.1)', G.GAME.poke_poli_suit);
}
// ---------------------------------------------------------------- pools
ok(C('taurosh').in_pool(C('taurosh')) === false && C('shell').in_pool(C('shell')) === false, 'Tauros (Herd) and Shell are never in a pool (Pokermon 3.9.1 in_pool)');

// ---------------------------------------------------------------- holds + house rules / kept fixes
ok(C('mega_steelix').config.extra.suit === 'Diamonds' && C('mega_steelix').config.extra.money === 1 && /full deck/.test(JOKER_LOC.j_poke_mega_steelix.text.join(' ')), 'held: Mega Steelix keeps its 3.2.1 data and text (quantum Hazard waits for batch 10)');
{
  start('RW391MSTL');
  add('j_poke_mega_steelix');
  const [st] = hand(['S_4'], { center: 'm_steel' });
  play(hand(['S_A']));
  ok(st.base.suit === 'Diamonds', 'held: Mega Steelix still turns held Steel cards into Diamonds (3.2.1)', st.base.suit);
}
ok(!/Seed/.test(JOKER_LOC.j_poke_hoppip.text.join(' ')) && C('qwilfish').config.extra.chip_mod === 25, 'held: the Hoppip line keeps its 3.2.1 text (no Seed cards yet); Qwilfish its 3.2.1 numbers');
ok(/contains/.test(JOKER_LOC.j_poke_deino.text[1]), 'house rule: Deino "contains a Three of a Kind"');
{
  start('RW391ARBO');
  add('j_poke_arbok');
  const r = play(hand(['S_A', 'H_K', 'D_Q', 'C_J', 'S_T']));
  ok(statusMsgs(r.events).some((m) => /Mult/.test(m)) && !statusMsgs(r.events).some((m) => /Chips/.test(m)), 'kept fix: Arbok shows its +Mult as Mult (the Lua printed a_chips)', statusMsgs(r.events));
}
ok(STATUS.PORTED.jokers.length >= 452, 'every 3.2.1 joker is still ported', STATUS.PORTED.jokers.length);

done();
