// Pokermon 3.9.1 new jokers, sub-batch 15 (PORTING.md "New jokers, sub-batch 15"): the 18 jokers 3.9.1 added to
// pokejokers_18-32.lua (Munna / Musharna, Klink / Klang / Klinklang, Axew / Fraxure / Haxorus, Bunnelby / Diggersby, Drampa,
// Smoliv / Dolliv / Arboliva, Bramblin / Brambleghast, Rellor / Rabsca), every one fired through real plays (act), and each
// evolution; plus Hisuian Qwilfish / Overqwil (3.9.1 writes them, never registers them; the port has them since 3.2.1).
//   - the overlay: data391.js new_jokers / families / new_deferred (Drampa's Mega), the 3.9.1 static data, text, order and
//     pools; contentRev 12
//   - each joker's main effect; Munna -> Musharna (a real Moon Stone; X Mult kept), Klink -> Klang -> Klinklang, Axew ->
//     Fraxure -> Haxorus, Bunnelby -> Diggersby, Smoliv -> Dolliv -> Arboliva, Bramblin -> Brambleghast, Rellor -> Rabsca
//   - Drampa's Jumbo packs (the shop's packs upgrade, new ones roll Jumbo or better, +1 pack), Steamodded's usage count of
//     every consumable set (Rellor), Bramblin's rank of the round
//   - Hisuian Qwilfish's card is 3.9.1's (Gen 2 sheet), Overqwil is reached through it; Qwilfish has no evolution (3.9.1)
//   - the art: every new joker's 3.9.1 cell (and its Shiny twin) holds a real picture (needs the gitignored art: MICATRO_MAIN)
//   node micatro/tests/mods/pokermon_391_new_15_test.mjs
import path from 'path';
import { T, start, hand, add, play, winRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS, P_CENTER_POOLS, localize, get_current_pool } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { STATUS } from '../../mods/pokermon/index.js';
import D391 from '../../mods/pokermon/data391.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const C = (n) => P_CENTERS['j_poke_' + n];
const NEW = ['munna', 'musharna', 'klink', 'klang', 'klinklang', 'axew', 'fraxure', 'haxorus', 'bunnelby', 'diggersby', 'drampa', 'smoliv',
  'dolliv', 'arboliva', 'bramblin', 'brambleghast', 'rellor', 'rabsca'];
/** A card on top of the deck (the next one drawn). */
const onDeck = (k, center) => {
  const c = create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center || 'c_base'] }, G.deck);
  G.deck.cards.splice(G.deck.cards.indexOf(c), 1);
  G.deck.cards.push(c);
  return c;
};
/** A section: an error (e.g. on a build without these jokers) is one failure, not the end of the suite. */
const sec = (fn) => { try { fn(); } catch (e) { ok(false, 'threw: ' + String(e && e.stack).slice(0, 300)); } };
const flush = () => G.E_MANAGER.flush();
const close = (a, b) => Math.abs(Number(a) - b) < 1e-9;
/** Win the round and go to the shop. */
const toShop = () => { winRound(); act({ type: 'cash_out' }); flush(); };
/** Use an item on a joker (joker_targets), then let the queue run. */
const useOn = (item, joker) => { const u = act({ type: 'use', id: item.sort_id, joker_targets: joker ? [joker.sort_id] : undefined }); flush(); return u; };
const tarots = () => G.consumeables.cards.filter((c) => c.ability.set === 'Tarot').length;

// ------------------------------------------------------------------- the overlay
ok(MODS.pokermon.contentRev >= 12 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 12+ (pin 3.9.1+r12+)', PINS.modPin('pokermon'));
const NJ = Object.fromEntries(Object.entries(D391.new_jokers || {}).filter(([, v]) => v.sub_batch === '15'));
ok(JSON.stringify(Object.keys(NJ)) === JSON.stringify(NEW), 'data391.js new_jokers (sub-batch 15): the 18 of 3.9.1 pokejokers_18-32, in file order', Object.keys(NJ));
ok(NEW.every((n) => C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n)), 'every new joker is registered and ported');
{
  const F = STATUS.PORTED_FILES;
  const n = (f) => (F['pokemon/' + f + '.lua'] || []).length;
  const got = ['18', '20', '21', '22', '26', '31', '32'].map((f) => n('pokejokers_' + f));
  ok(got.join() === '13,13,13,5,2,10,11', 'defs: 13 / 13 / 13 / 5 / 2 / 10 / 11 from pokejokers_18 / 20 / 21 / 22 / 26 / 31 / 32.lua', got);
}
sec(() => {
  // Static data straight from 3.9.1 (never retyped): rarity / cost / stage / type.
  const want = {
    munna: [3, 7, 'Basic', 'Psychic'], musharna: ['poke_safari', 8, 'One', 'Psychic'], klink: [1, 4, 'Basic', 'Metal'],
    klang: ['poke_safari', 6, 'One', 'Metal'], klinklang: ['poke_safari', 8, 'Two', 'Metal'], axew: [2, 6, 'Basic', 'Dragon'],
    fraxure: ['poke_safari', 8, 'One', 'Dragon'], haxorus: ['poke_safari', 10, 'Two', 'Dragon'], bunnelby: [1, 6, 'Basic', 'Colorless'],
    diggersby: ['poke_safari', 7, 'One', 'Earth'], drampa: [3, 8, 'Basic', 'Dragon'], smoliv: [1, 4, 'Basic', 'Grass'],
    dolliv: ['poke_safari', 8, 'One', 'Grass'], arboliva: ['poke_safari', 10, 'Two', 'Grass'], bramblin: [1, 6, 'Basic', 'Grass'],
    brambleghast: ['poke_safari', 8, 'One', 'Grass'], rellor: [1, 6, 'Basic', 'Grass'], rabsca: ['poke_safari', 8, 'One', 'Grass'],
  };
  for (const [n, [rarity, cost, stage, ptype]] of Object.entries(want)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === ptype, `${n}: 3.9.1 rarity / cost / stage / type`, [c.rarity, c.cost, c.stage, c.ptype]);
  }
  ok(C('munna').config.extra.item_req === 'moonstone' && C('munna').copy_scaled === true && C('klink').config.evo_rqmt === 8
    && C('bramblin').config.evo_rqmt === 160 && C('bramblin').eternal_compat === false && C('diggersby').perishable_compat === false
    && C('klink').blueprint_compat === false && C('drampa').blueprint_compat === false, '3.9.1 configs / flags',
  [C('munna').config, C('klink').config, C('bramblin').config]);
  ok(C('munna').attributes.includes('foresight') && C('drampa').attributes.includes('passive'), 'attributes: 3.9.1 ones', C('munna').attributes);
});
sec(() => {
  // Their place in the joker list: 3.9.1's file order.
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const after = (a, b) => keys.indexOf('j_poke_' + b) === keys.indexOf('j_poke_' + a) + 1;
  ok(after('simipour', 'munna') && after('munna', 'musharna') && after('musharna', 'roggenrola') && after('ferrothorn', 'klink')
    && after('klink', 'klang') && after('klang', 'klinklang') && after('klinklang', 'elgyem') && after('chandelure', 'axew')
    && after('haxorus', 'golett') && after('hydreigon', 'bunnelby') && after('bunnelby', 'diggersby') && after('mimikyu', 'drampa')
    && after('dachsbun', 'smoliv') && after('dolliv', 'arboliva') && after('ceruledge', 'bramblin') && after('brambleghast', 'rellor')
    && after('rabsca', 'tinkatink'), 'inserted in 3.9.1 file order');
});
sec(() => {
  // The 3.9.1 text (each #n# the text names filled by loc_vars)
  const JL = MODS.pokermon.content.loc.descriptions.Joker;
  start('LOC15');
  for (const n of NEW) {
    const e = JL['j_poke_' + n];
    const card = add('j_poke_' + n);
    const lv = C(n).loc_vars(C(n), [], card) || {};
    const used = [...new Set((e.text.join(' ').match(/#(\d+)#/g) || []).map((m) => +m.slice(1, -1)))];
    ok(e && used.every((i) => { const v = (lv.vars || [])[i - 1]; return v !== undefined && v !== null && !Number.isNaN(v); }), `${n}: text + loc_vars fill #${used.join('#, #')}#`, lv.vars);
  }
  ok(JL.j_poke_munna.text.some((l) => l.includes('Moon Stone')) && JL.j_poke_drampa.text.some((l) => l.includes('Jumbo')), 'Munna\'s Moon Stone, Drampa\'s Jumbo lines');
});
sec(() => {
  // Families (3.9.1 functions/pokefamily.lua); Drampa's Mega waits for batch 16
  const fam = (n) => JSON.stringify(poke_get_family_list(n));
  ok(fam('musharna') === '["munna","musharna"]' && fam('klang') === '["klink","klang","klinklang"]' && fam('fraxure') === '["axew","fraxure","haxorus"]'
    && fam('diggersby') === '["bunnelby","diggersby"]' && fam('dolliv') === '["smoliv","dolliv","arboliva"]'
    && fam('bramblin') === '["bramblin","brambleghast"]' && fam('rabsca') === '["rellor","rabsca"]', 'families: the 7 lines');
  ok(fam('overqwil') === '["hisuian_qwilfish","overqwil"]' && fam('qwilfish') === '["qwilfish"]' || poke_get_family_list('qwilfish').length <= 1,
    'families: Hisuian Qwilfish / Overqwil; Qwilfish alone (3.9.1 gives it no evolution)', [poke_get_family_list('overqwil'), poke_get_family_list('qwilfish')]);
  ok(D391.new_deferred.length === 1 && D391.new_deferred[0][0] === 'drampa' && D391.new_deferred[0][2].join() === 'megas' && C('drampa').megas === undefined,
    'new_deferred: Drampa without its megas (Mega Drampa is batch 16)', D391.new_deferred);
  ok(!C('qwilfish').config.extra.item_req && !C('qwilfish').evo_list && !C('qwilfish').megas, 'Qwilfish: no evolution in 3.9.1 (no item_req / evo_list)');
});
sec(() => {
  // Pools: in_pool + pool_filter; the shop's rarity pools
  start('POOL15');
  const pool = P_CENTER_POOLS.Joker.map((c) => c.key);
  ok(pool.indexOf('j_poke_munna') === pool.indexOf('j_poke_simipour') + 1 && pool.includes('j_poke_rabsca'), 'the Joker pool holds them, in 3.9.1 order');
  const avail = (r, legendary) => get_current_pool('Joker', r, legendary)[0].filter((k) => k !== 'UNAVAILABLE');
  const ofNew = (r) => avail(r).filter((k) => NEW.includes(k.replace('j_poke_', '')));
  ok(JSON.stringify(ofNew(0.1)) === JSON.stringify(['j_poke_klink', 'j_poke_bunnelby', 'j_poke_smoliv', 'j_poke_bramblin', 'j_poke_rellor'])
    && JSON.stringify(ofNew(0.8)) === JSON.stringify(['j_poke_axew'])
    && JSON.stringify(ofNew(0.99)) === JSON.stringify(['j_poke_munna', 'j_poke_drampa']), 'shop rarity pools: Common / Uncommon / Rare (Safari never)', [ofNew(0.1), ofNew(0.8), ofNew(0.99)]);
  ok(avail(0.8).includes('j_poke_hisuian_qwilfish') && !avail(0.99).includes('j_poke_overqwil') && !avail(0.8).includes('j_poke_overqwil'),
    'Hisuian Qwilfish: in the Uncommon pool; Overqwil (Safari) only through it');
  add('j_poke_klink');
  ok(pool_filter(C('klink'), 'Joker') === false && pool_filter(C('klinklang'), 'Joker') === false, 'one per family: Klink held -> its line is out');
  start('POOL15B', { gen_five: false });
  ok(pool_filter(C('munna'), 'Joker') === false && pool_filter(C('drampa'), 'Joker') === undefined, 'Gen 5 off -> Munna out, Drampa (Gen 7) in');
});

// ------------------------------------------------------------------- Munna / Musharna
sec(() => {
  start('MUNNA', {}, { noBlind: true });
  const sc0 = G.GAME.scry_amount || 0;
  const j = add('j_poke_munna');
  ok(G.GAME.scry_amount === sc0 + 2, 'munna: +2 Foresight', G.GAME.scry_amount);
  act({ type: 'select_blind' }); clearHand();
  const a = onDeck('S_2', 'm_bonus'), b = onDeck('S_3', 'm_mult');
  const r = play(hand(['S_A']));
  ok(a.config.center === P_CENTERS.c_base && b.config.center === P_CENTERS.c_base && close(j.ability.extra.Xmult_multi, 1.1), 'munna: eats the 2 Enhanced Foreseen cards (+X0.05 each)', [key(a), key(b), j.ability.extra.Xmult_multi]);
  ok(close(r.total.mult, 1.1), 'munna: X Mult at joker_main (1.1 after this hand)', r.total);
  // Munna -> Musharna with a real Moon Stone; its X Mult carries over (copy_scaled)
  const stone = add('c_poke_moonstone');
  const u = useOn(stone, j);
  ok(u.ok, 'a Moon Stone targets Munna', u.error);
  winRound();
  ok(key(j) === 'j_poke_musharna' && close(j.ability.extra.Xmult_multi, 1.1), 'munna -> musharna (Moon Stone), keeping X1.1', [key(j), j.ability.extra.Xmult_multi]);
  ok(G.GAME.scry_amount === sc0, 'musharna: Munna\'s Foresight is gone', G.GAME.scry_amount);
});
sec(() => {
  start('MUSHARNA', {}, { noBlind: true });
  const sc0 = G.GAME.scry_amount || 0;
  const j = add('j_poke_musharna');
  add('j_poke_abra');
  j.ability.extra.Xmult_multi = 2;
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(G.GAME.scry_amount === sc0 + 4 && j.ability.extra.scry_added === 4, 'musharna: +2 Foresight this round per Psychic joker (2)', [G.GAME.scry_amount, j.ability.extra.scry_added]);
  onDeck('S_2', 'm_bonus');
  onDeck('S_3');
  const r = play(hand(['S_K']));
  ok(close(r.total.mult, 2) && r.total.chips === 5 + 10, 'musharna: the Enhanced Foreseen card gives X2 (the plain one nothing)', r.total);
  winRound();
  ok(G.GAME.scry_amount === sc0 && j.ability.extra.scry_added === 0, 'musharna: the round\'s Foresight ends with the round', G.GAME.scry_amount);
});

// ------------------------------------------------------------------- Klink / Klang / Klinklang
sec(() => {
  start('KLINK');
  const j = add('j_poke_klink');
  j.ability.extra.drawn = 11;
  const d0 = G.GAME.dollars;
  const r = play(hand(['S_A']));
  flush();
  ok(G.GAME.dollars === d0 + 1 && j.ability.extra.totalEarned === 1 && j.ability.extra.drawn === 19 - 12, 'klink: $1 for every 12 cards drawn during the Blind', [G.GAME.dollars - d0, j.ability.extra]);
  ok(statusMsgs(r.events).includes('$1'), 'klink: its "$1"', statusMsgs(r.events));
  j.ability.extra.totalEarned = 8;
  winRound();
  ok(key(j) === 'j_poke_klang', 'klink -> klang after earning $8', key(j));
  j.ability.extra.totalEarned = 10;
  act({ type: 'cash_out' }); flush(); act({ type: 'next_round' }); flush(); act({ type: 'select_blind' }); clearHand();
  winRound();
  ok(key(j) === 'j_poke_klinklang', 'klang -> klinklang after earning $10', key(j));
});
sec(() => {
  start('KLINKLANG');
  const j = add('j_poke_klinklang');
  j.ability.extra.drawn = 7;
  const d0 = G.GAME.dollars;
  play(hand(['S_A']));
  flush();
  ok(close(j.ability.extra.Xmult, 1.4) && G.GAME.dollars === d0 + 1, 'klinklang: +X0.4 Mult and $1 for every 8 cards drawn', [j.ability.extra, G.GAME.dollars - d0]);
  clearHand();
  const r = play(hand(['S_K']));
  // (the hand scores first; its refill draws 8 more after: 7 + 8 = 15 -> +X0.4)
  ok(close(r.total.mult, 1.4) && close(j.ability.extra.Xmult, 1.8), 'klinklang: its X Mult scores', [r.total, j.ability.extra.Xmult]);
  const r2 = winRound();
  ok(close(j.ability.extra.Xmult, 1) && statusMsgs(r2.events).includes(localize('k_reset')), 'klinklang: the X Mult resets at end of round ("Reset")', [j.ability.extra.Xmult, statusMsgs(r2.events)]);
});

// ------------------------------------------------------------------- Axew / Fraxure / Haxorus
sec(() => {
  start('AXEW');
  const j = add('j_poke_axew');
  const t = j.ability.extra.targets.map((x) => x[0]);
  ok(t.length === 2 && t[0] !== t[1] && t.every((h) => G.GAME.hands[h] && G.GAME.hands[h].visible), 'axew: its Nature is 2 visible poker hands (set on creation)', t);
  j.ability.extra.targets = [['High Card'], ['Pair']];
  const r = play(hand(['S_A']));
  ok(r.total.chips === 5 * 2 + 11 && r.total.mult === 2 && j.ability.extra.nature_played === 1 && j.ability.extra.active === false,
    'axew: the first Nature hand of the round has its base Chips and Mult doubled', [r.total, j.ability.extra]);
  clearHand();
  const r2 = play(hand(['S_K', 'H_K']));
  ok(r2.total.chips === 10 + 20 && r2.total.mult === 2 && j.ability.extra.nature_played === 2, 'axew: only the first one (a Pair: 10 x 2)', r2.total);
  clearHand();
  const r3 = play(hand(['S_2', 'H_3', 'S_4', 'D_5', 'C_6']));
  ok(j.ability.extra.nature_played === 2 && r3.total.mult === 4, 'axew: a Straight is not its Nature', r3.total);
  j.ability.extra.nature_played = 6;
  winRound(); // (a High Card: the 7th)
  ok(key(j) === 'j_poke_fraxure' && j.ability.extra.targets[0][0] === 'High Card' && j.ability.extra.targets[1][0] === 'Pair', 'axew -> fraxure after 7 Nature hands (the Nature carries over)', [key(j), j.ability.extra.targets]);
});
sec(() => {
  start('AXEW2');
  const j = add('j_poke_axew');
  j.ability.extra.targets = [['High Card'], ['Pair']];
  play(hand(['S_A']));
  winRound();
  act({ type: 'cash_out' }); flush();
  ok(j.ability.extra.active === true, 'axew: ready again at end of round');
});
sec(() => {
  start('FRAXURE');
  const j = add('j_poke_fraxure');
  j.ability.extra.targets = [['High Card'], ['Pair']];
  const r = play(hand(['S_A']));
  clearHand();
  const r2 = play(hand(['S_K']));
  ok(r.total.chips === 21 && r.total.mult === 2 && r2.total.chips === 20 && r2.total.mult === 2, 'fraxure: every Nature hand is doubled', [r.total, r2.total]);
  j.ability.extra.nature_played = 6;
  winRound();
  ok(key(j) === 'j_poke_haxorus', 'fraxure -> haxorus after 7 Nature hands', key(j));
});
sec(() => {
  start('HAXORUS');
  const j = add('j_poke_haxorus');
  j.ability.extra.targets = [['High Card'], ['Pair']];
  const r = play(hand(['S_A']));
  ok(r.total.chips === 15 + 11 && r.total.mult === 3, 'haxorus: Nature hands tripled', r.total);
});

// ------------------------------------------------------------------- Bunnelby / Diggersby
/** Keep only one King in the deck, on top (the next card drawn depletes the rank). */
const lastKing = () => {
  G.deck.cards = G.deck.cards.filter((c) => c.base.value !== 'King');
  return onDeck('H_K');
};
/** The drawn cards (in hand now) whose rank is gone from the deck. */
const depletedInHand = (except) => G.hand.cards.filter((c) => !except.includes(c) && !G.deck.cards.some((v) => v.get_id() === c.get_id())).length;
sec(() => {
  start('BUNNELBY');
  const j = add('j_poke_bunnelby');
  G.GAME.probabilities.normal = 3; // sure rolls
  lastKing();
  const played = hand(['S_A']);
  play(played);
  flush();
  const n = depletedInHand(played);
  ok(n >= 1 && j.ability.extra.triggers === Math.min(n, 2) && tarots() === Math.min(n, 2), 'bunnelby: a drawn card of a depleted rank gives a Tarot (1 in 3; must have room)', [n, j.ability.extra.triggers, tarots()]);
  j.ability.extra.triggers = 4;
  G.GAME.probabilities.normal = 1;
  winRound();
  ok(key(j) === 'j_poke_diggersby', 'bunnelby -> diggersby after 4 Tarots', key(j));
});
sec(() => {
  start('BUNNELBY2');
  add('j_poke_bunnelby');
  G.GAME.probabilities.normal = 0; // every roll fails
  lastKing();
  const r = play(hand(['S_A']));
  flush();
  ok(tarots() === 0 && r.events.some((e) => e.type === 'attention' && /Nope/.test(e.text)), 'bunnelby: a failed roll says "Nope!"', r.events.filter((e) => e.type === 'attention'));
});
sec(() => {
  start('DIGGERSBY');
  const j = add('j_poke_diggersby');
  G.GAME.probabilities.normal = 3;
  for (let i = 0; i < 2; i++) add('c_poke_moonstone'); // no room for a Tarot: the Mult still comes
  lastKing();
  const played = hand(['S_A']);
  play(played);
  flush();
  const n = depletedInHand(played);
  ok(n >= 1 && j.ability.extra.mult === 2 * n && tarots() === 0, 'diggersby: +2 Mult per depleted draw, a Tarot only with room', [n, j.ability.extra.mult, tarots()]);
  clearHand();
  const r = play(hand(['S_2']));
  ok(r.total.mult === 1 + 2 * n, 'diggersby: its Mult scores', [r.total, j.ability.extra.mult]);
});

// ------------------------------------------------------------------- Drampa
sec(() => {
  start('DRAMPA');
  toShop();
  const n0 = G.shop_booster.cards.length;
  const normals0 = G.shop_booster.cards.filter((c) => key(c).includes('normal')).length;
  const j = add('j_poke_drampa');
  flush();
  ok(G.shop_booster.cards.length === n0 + 1 && G.GAME.modifiers.extra_boosters === 1, 'drampa: +1 Booster Pack in the shop (now)', [n0, G.shop_booster.cards.map(key)]);
  ok(G.shop_booster.cards.every((c) => !key(c).includes('normal')), 'drampa: the shop\'s packs became Jumbo or better', [normals0, G.shop_booster.cards.map(key)]);
  act({ type: 'reroll' }); flush();
  act({ type: 'next_round' }); flush(); act({ type: 'select_blind' }); clearHand();
  toShop();
  ok(G.shop_booster.cards.length === n0 + 1 && G.shop_booster.cards.every((c) => !key(c).includes('normal') && P_CENTERS[key(c)]), 'drampa: the next shop rolls Jumbo / Mega packs only, one more of them', G.shop_booster.cards.map(key));
  act({ type: 'sell', id: j.sort_id }); flush();
  ok(G.GAME.modifiers.extra_boosters === 0, 'drampa sold: the extra slot goes', G.GAME.modifiers.extra_boosters);
});

// ------------------------------------------------------------------- Smoliv / Dolliv / Arboliva
sec(() => {
  start('SMOLIV');
  const j = add('j_poke_smoliv');
  const s0 = j.sell_cost;
  const r = winRound();
  ok(j.sell_cost === s0 + 2 && j.ability.extra_value === 2, 'smoliv: +$2 sell value at end of round', [s0, j.sell_cost]);
  ok(statusMsgs(r.events).includes(localize('k_val_up')), 'smoliv: "Value Up!"', statusMsgs(r.events));
  j.ability.extra_value = 8; j.set_cost();
  act({ type: 'cash_out' }); flush(); act({ type: 'next_round' }); flush(); act({ type: 'select_blind' }); clearHand();
  winRound();
  ok(key(j) === 'j_poke_dolliv', 'smoliv -> dolliv at $12 sell value', [key(j), j.sell_cost]);
});
sec(() => {
  start('DOLLIV');
  const a = add('j_joker');
  const j = add('j_poke_dolliv');
  const b = add('j_egg');
  const far = add('j_jolly');
  const [sa, sj, sb, sf] = [a, j, b, far].map((c) => c.sell_cost);
  winRound();
  ok(a.sell_cost === sa + 2 && j.sell_cost === sj + 2 && b.sell_cost >= sb + 2 && far.sell_cost === sf, 'dolliv: +$2 to itself and the adjacent Jokers', [[sa, sj, sb, sf], [a, j, b, far].map((c) => c.sell_cost)]);
  j.ability.extra_value = 20; j.set_cost();
  act({ type: 'cash_out' }); flush(); act({ type: 'next_round' }); flush(); act({ type: 'select_blind' }); clearHand();
  winRound();
  ok(key(j) === 'j_poke_arboliva', 'dolliv -> arboliva at $22 sell value', [key(j), j.sell_cost]);
});
sec(() => {
  start('ARBOLIVA');
  const j = add('j_poke_arboliva');
  const plain = add('j_joker');
  const grass = add('j_poke_bulbasaur');
  const energy = add('c_poke_grass_energy');
  const item = add('c_poke_moonstone');
  const before = [j, plain, grass, energy, item].map((c) => c.ability.extra_value);
  winRound();
  const after = [j, plain, grass, energy, item].map((c) => c.ability.extra_value);
  ok(after[0] - before[0] === 4 && after[1] - before[1] === 2 && after[2] - before[2] === 4 && after[3] - before[3] === 4 && after[4] - before[4] === 2,
    'arboliva: +$2 sell value to every Joker and consumable, double to Grass jokers and Grass Energy', [before, after]);
});

// ------------------------------------------------------------------- Bramblin / Brambleghast
sec(() => {
  start('BRAMBLIN');
  const j = add('j_poke_bramblin');
  const cr = G.GAME.current_round;
  ok(cr.bramblincard && typeof cr.bramblincard.rank === 'string', 'bramblincard: the round\'s rank (reset_game_globals)', cr.bramblincard);
  cr.bramblincard = { rank: 'King', id: 13 };
  const c0 = j.ability.extra.cards_drawn;
  const ks = hand(['S_K', 'H_K']);
  play(ks);
  ok(ks[0].config.center === P_CENTERS.c_base && ks[1].config.center === P_CENTERS.m_poke_seed && j.ability.extra.seed_added === 1,
    'bramblin: the second scoring King of the round becomes a Seed card', ks.map(key));
  ok(j.ability.extra.cards_drawn > c0, 'bramblin: counts the cards drawn during the Blind', [c0, j.ability.extra.cards_drawn]);
  clearHand();
  const k3 = hand(['D_K', 'C_K']);
  play(k3);
  ok(k3.every((c) => c.config.center === P_CENTERS.c_base), 'bramblin: once a round', k3.map(key));
  j.ability.extra.cards_drawn = 160; // (the winning hand draws nothing)
  winRound();
  ok(key(j) === 'j_poke_brambleghast' && j.ability.extra.seed_added === 0, 'bramblin -> brambleghast after drawing 160 cards', key(j));
});
sec(() => {
  start('BRAMBLEGHAST');
  const g0 = G.GAME.poke_growth_level || 0;
  const j = add('j_poke_brambleghast');
  ok(G.GAME.poke_growth_level === g0 + 1, 'brambleghast: +1 growth level', G.GAME.poke_growth_level);
  G.GAME.dollars = 10;
  G.GAME.current_round.bramblincard = { rank: 'Queen', id: 12 };
  const qs = hand(['S_Q', 'H_Q']);
  const r = play(qs);
  ok(r.total.chips === 10 + 20 + 2 * 10, 'brambleghast: +2 Chips per $1', r.total);
  ok(qs[1].config.center === P_CENTERS.m_poke_seed && qs[1].ability.extra.level >= 0, 'brambleghast: the second Queen becomes a Seed card', [key(qs[1]), qs[1].ability.extra]);
  j.ability.extra.growth = 1;
  act({ type: 'sell', id: j.sort_id }); flush();
  ok(G.GAME.poke_growth_level === g0, 'brambleghast sold: the growth level goes', G.GAME.poke_growth_level);
});

// ------------------------------------------------------------------- Rellor / Rabsca (Steamodded's usage count)
sec(() => {
  start('RELLOR');
  const j = add('j_poke_rellor');
  ok(!G.GAME.consumeable_usage_total.item, 'no Item used yet');
  for (let i = 0; i < 3; i++) { const it = add('c_poke_pokeball'); const u = act({ type: 'use', id: it.sort_id }); flush(); if (!u.ok) ok(false, 'use a Poke Ball', u.error); for (const c of G.jokers.cards.slice()) if (c !== j) { c.remove_from_deck && c.remove_from_deck(); c.remove(); } }
  ok(G.GAME.consumeable_usage_total.item === 3 && j.ability.extra.items_used === 3, 'Steamodded counts Item cards used (consumeable_usage_total.item); rellor counts them', [G.GAME.consumeable_usage_total, j.ability.extra]);
  const r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 3, 'rellor: +1 Mult per Item used this run', r.total);
  const t = add('c_hermit');
  const u = act({ type: 'use', id: t.sort_id }); flush();
  ok(u.ok && G.GAME.consumeable_usage_total.tarot === 1 && G.GAME.consumeable_usage_total.item === 3, 'a Tarot counts as tarot (the vanilla counter), not item', G.GAME.consumeable_usage_total);
  j.ability.extra.items_used = 5;
  winRound();
  ok(key(j) === 'j_poke_rabsca', 'rellor -> rabsca after 5 Items', key(j));
});
sec(() => {
  start('RABSCA');
  const j = add('j_poke_rabsca');
  G.GAME.probabilities.normal = 4;
  const it = add('c_poke_pokeball');
  act({ type: 'use', id: it.sort_id }); flush();
  ok(tarots() === 1, 'rabsca: using an Item gives a Tarot (1 in 4; must have room)', G.consumeables.cards.map(key));
  clearHand();
  const r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 1 && key(j) === 'j_poke_rabsca', 'rabsca: +1 Mult per Item used this run', r.total);
});

// ------------------------------------------------------------------- Hisuian Qwilfish / Overqwil
sec(() => {
  ok(C('hisuian_qwilfish').atlas === 'poke_AtlasJokersBasicGen02391' && C('hisuian_qwilfish').pos.x === 2 && C('hisuian_qwilfish').pos.y === 5,
    'Hisuian Qwilfish: 3.9.1\'s card (AtlasJokersBasicGen02 {2,5}; data391.js sprites)', [C('hisuian_qwilfish').atlas, C('hisuian_qwilfish').pos]);
  ok(JSON.stringify(D391.sprites.hisuian_qwilfish) === '{"atlas":"AtlasJokersBasicGen02","pos":{"x":2,"y":5}}' && D391.sprites.overqwil.pos.y === 60, 'their sprites come from 3.9.1 pokespriteload.lua (unregistered_sprites)');
  ok(!MODS.pokermon.content.atlases.poke_hisuian_qwilfish, 'the Micatro-made Hisuian Qwilfish card is retired');
  start('HQWIL');
  const j = add('j_poke_hisuian_qwilfish');
  j.ability.extra.chips = 80;
  winRound();
  ok(key(j) === 'j_poke_overqwil', 'Hisuian Qwilfish -> Overqwil at 80 Chips (Overqwil is reachable)', key(j));
});

// ------------------------------------------------------------------- Zangoose + The Hook (sub-batch 13's Zangoose; found by the all-mods fuzz)
sec(() => {
  start('ZHOOK', {}, { noBlind: true });
  // (straight to the Boss, as blinds_tags_backs_test's boss())
  const rr = G.GAME.round_resets;
  rr.blind_states.Small = 'Skipped'; rr.blind_states.Big = 'Skipped'; rr.blind_states.Boss = 'Select';
  G.GAME.blind_on_deck = 'Boss';
  rr.blind_choices.Boss = 'bl_hook';
  act({ type: 'select_blind' }); clearHand();
  ok(G.GAME.blind.name === 'The Hook', 'the boss is The Hook', G.GAME.blind.name);
  add('j_poke_zangoose');
  // 1 played, 3 held: Zangoose takes 2 of the 3 held cards, The Hook discards 2 of them: at least one is picked by both
  const cards = hand(['S_A', 'H_2', 'D_5', 'C_9']);
  play([cards[0]]);
  flush();
  const seen = new Map();
  let twice = [];
  for (const a of G.areas) for (const c of a.cards) { if (seen.has(c.sort_id)) twice.push([c.sort_id, seen.get(c.sort_id), a.name]); else seen.set(c.sort_id, a.name); }
  ok(twice.length === 0, 'zangoose + The Hook: no card ends up in two areas (a card The Hook discards is not added to the hand)', twice);
});

// ------------------------------------------------------------------- the art
if (!ART) console.log('(Pokermon art not on disk: the sprite checks are skipped; set MICATRO_MAIN)');
else if (!NEW.every(C)) ok(false, 'art: the new jokers are not registered');
else {
  const ATL = MODS.pokermon.content.atlases;
  const want = {};
  const cell = (atlas, pos, id, w = 142, h = 190) => {
    const A = ATL[atlas];
    const file = decodeURIComponent(A.src).replace(/^.*\/assets\/2x\//, '');
    (want[file] || (want[file] = {}))[id] = [pos.x * w, pos.y * h, w, h];
  };
  const ALL = [...NEW, 'hisuian_qwilfish', 'overqwil'];
  for (const n of ALL) {
    const c = C(n);
    cell(c.atlas, c.pos, n + '|' + c.atlas);
    cell(c.atlas.replace(/391$/, 'Shiny391'), c.pos, n + '|' + c.atlas.replace(/391$/, 'Shiny391'));
  }
  const px = {};
  for (const [file, rects] of Object.entries(want)) Object.assign(px, await crops(path.join(ART, file), rects));
  const opaque = (r) => { let k = 0; for (let i = 3; i < r.px.length; i += 4) if (r.px[i] > 0) k++; return k / (r.px.length / 4); };
  const hash = (r) => { let h = 0; for (let i = 0; i < r.px.length; i += 97) h = (h * 31 + r.px[i]) >>> 0; return h; };
  for (const n of ALL) {
    const c = C(n);
    const base = px[n + '|' + c.atlas], shiny = px[n + '|' + c.atlas.replace(/391$/, 'Shiny391')];
    let diff = 0; for (let i = 0; i < base.px.length; i++) diff += Math.abs(base.px[i] - shiny.px[i]);
    ok(base.inside && opaque(base) > 0.5 && shiny.inside && opaque(shiny) > 0.5 && diff > 0, `${n}: a real 3.9.1 sprite and Shiny (${c.atlas} ${c.pos.x},${c.pos.y})`, [opaque(base), opaque(shiny), diff]);
  }
  ok(new Set(ALL.map((n) => hash(px[n + '|' + C(n).atlas]))).size === ALL.length, 'every one is its own picture');
}

done();
