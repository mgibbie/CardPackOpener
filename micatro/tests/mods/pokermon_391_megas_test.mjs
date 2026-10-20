// Pokermon 3.9.1 batch 16, the Megas (PORTING.md "The Megas (batch 16)"): the 11 Megas 3.9.1 adds (Mega Raichu X / Y, Clefable,
// Victreebel, Starmie, Dragonite, Meganium, Feraligatr, Skarmory, Lucario, Drampa), the Mega Stone's 3.9.1 rules, the Mega Berry
// Juice and the Mega Deck / Sleeve. Every Mega is reached through a real Mega Stone (act 'use') and fired through real plays.
//   - the overlay: data391.js new_jokers "16", the bases' megas lists (rework_deferred / new_deferred emptied of them); contentRev 14
//   - each Mega's main effect; the Mega Stone transform and revert; Raichu's X / Y choice (leftmost X, rightmost Y)
//   - the Mega Stone: used_on = the Mega's unique_val (two Megas of a species told apart), the stone only reverts its own Mega,
//     forgets a Mega that is gone at end of round, devolves it when sold; a 3.2.1-shaped used_on (a center key) still resolves
//     (read-time migration, nothing rewritten); poke_infinite_megastone (the Mega Sleeve on the Mega Deck)
//   - the Mega Berry Juice (Shuckle slicing a Mega Stone); the Mega Deck / Sleeve's Crystal Ball
//   - precedence: no add-on ships one of these Megas (the precedence.js detection), and Pokermon's base forms give Pokermon's Megas
//   - the art: every Mega's 3.9.1 cell, its soul layer and their Shiny twins, and the juice (needs the gitignored art: MICATRO_MAIN)
//   node micatro/tests/mods/pokermon_391_megas_test.mjs
import path from 'path';
import { T, start, hand, add, play, winRound, clearHand, statusMsgs, G, P_CENTERS, act } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS, localize, get_current_pool } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { Session } from '../../js/engine/session.js';
import { newRun } from '../../js/engine/run.js';
import { STATUS } from '../../mods/pokermon/index.js';
import D391 from '../../mods/pokermon/data391.js';
import * as P from '../../mods/pokermon/api.js';
import { replaced_by } from '../../mods/pokermon/systems/precedence.js';
import '../../mods/nacho/index.js';
import '../../mods/pokermonplus/index.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const C = (n) => P_CENTERS['j_poke_' + n];
const MEGAS = ['mega_raichu_x', 'mega_raichu_y', 'mega_clefable', 'mega_victreebel', 'mega_starmie', 'mega_dragonite', 'mega_meganium',
  'mega_feraligatr', 'mega_skarmory', 'mega_lucario', 'mega_drampa'];
const BASES = { raichu: ['mega_raichu_x', 'mega_raichu_y'], clefable: ['mega_clefable'], victreebel: ['mega_victreebel'], starmie: ['mega_starmie'],
  dragonite: ['mega_dragonite'], meganium: ['mega_meganium'], feraligatr: ['mega_feraligatr'], skarmory: ['mega_skarmory'], lucario: ['mega_lucario'],
  drampa: ['mega_drampa'] };
/** A section: an error (e.g. on a build without these jokers) is one failure, not the end of the suite. */
const sec = (fn) => { try { fn(); } catch (e) { ok(false, 'threw: ' + String(e && e.stack).slice(0, 300)); } };
const flush = () => G.E_MANAGER.flush();
const useOn = (item, joker) => { const u = act({ type: 'use', id: item.sort_id, joker_targets: joker ? [joker.sort_id] : undefined }); flush(); return u; };
const nextBlind = () => { act({ type: 'cash_out' }); flush(); act({ type: 'next_round' }); flush(); act({ type: 'select_blind' }); clearHand(); };
const onDeck = (k, center) => {
  const c = create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center || 'c_base'] }, G.deck);
  G.deck.cards.splice(G.deck.cards.indexOf(c), 1);
  G.deck.cards.push(c);
  return c;
};
const discard = (cards) => { act({ type: 'highlight', ids: cards.map((c) => c.sort_id) }); return act({ type: 'discard' }); };
/** Mega-evolve a base through a real Mega Stone: -> [the card, the stone]. */
const megaOf = (base) => {
  const j = add('j_poke_' + base);
  const st = add('c_poke_megastone');
  useOn(st, j);
  return [j, st];
};
const consumables = () => G.consumeables.cards.map(key);

// ------------------------------------------------------------------- the overlay
ok(MODS.pokermon.contentRev >= 14 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 14+ (pin 3.9.1+r14+)', PINS.modPin('pokermon'));
ok(PINS.LEGACY_MOD_VERSIONS && PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
sec(() => {
  const NJ = Object.fromEntries(Object.entries(D391.new_jokers || {}).filter(([, v]) => v.sub_batch === '16'));
  ok(JSON.stringify(Object.keys(NJ)) === JSON.stringify(MEGAS), 'data391.js new_jokers "16": the 11 Megas, in 3.9.1 file order', Object.keys(NJ));
  ok(MEGAS.every((n) => C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n)), 'every Mega is registered and ported');
  ok(MEGAS.every((n) => C(n).rarity === 'poke_mega' && C(n).stage === 'Mega'), 'rarity poke_mega, stage Mega');
  const cost = Object.fromEntries(MEGAS.map((n) => [n, C(n).cost]));
  ok(cost.mega_raichu_x === 10 && cost.mega_raichu_y === 10 && cost.mega_lucario === 11 && MEGAS.filter((n) => cost[n] === 12).length === 8, '3.9.1 costs (Raichu X / Y 10, Lucario 11, the rest 12)', cost);
  ok(Object.entries(BASES).every(([b, m]) => JSON.stringify(C(b).megas) === JSON.stringify(m)), 'each base form links its Mega(s) (Mega Stone target)', Object.keys(BASES).map((b) => C(b).megas));
  ok(Object.keys(BASES).every((b) => D391.jokers[b] ? JSON.stringify(D391.jokers[b].megas || D391.new_jokers[b]?.item.megas) === JSON.stringify(BASES[b]) : JSON.stringify(D391.new_jokers[b].item.megas) === JSON.stringify(BASES[b])),
    'the links come from 3.9.1 (data391.js jokers / new_jokers megas)');
  ok(D391.new_deferred.length === 0 && !D391.rework_deferred.some(([n]) => n === 'lucario' || n === 'skarmory'), 'nothing waits for batch 16 (new_deferred empty; Lucario / Skarmory off rework_deferred)', [D391.new_deferred, D391.rework_deferred.map(([n]) => n)]);
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const after = (a, b) => keys.indexOf('j_poke_' + b) === keys.indexOf('j_poke_' + a) + 1;
  ok(after('raichu', 'mega_raichu_x') && after('mega_raichu_x', 'mega_raichu_y') && after('clefable', 'mega_clefable') && after('victreebel', 'mega_victreebel')
    && after('starmie', 'mega_starmie') && after('dragonite', 'mega_dragonite') && after('meganium', 'mega_meganium') && after('feraligatr', 'mega_feraligatr')
    && after('skarmory', 'mega_skarmory') && after('lucario', 'mega_lucario') && after('drampa', 'mega_drampa'), 'each Mega follows its base (3.9.1 order)');
  ok(!P_CENTERS.j_poke_mega_mawile && !P_CENTERS.j_poke_mega_manectric && C('mawile').megas === undefined && C('manectric').megas === undefined,
    'no Mega Mawile / Manectric: upstream main @ af0b656 has their sprites only, no joker');
});
sec(() => {
  // text: every #n# the 3.9.1 text names is filled by loc_vars
  const L = MODS.pokermon.content.loc.descriptions;
  start('MLOC');
  for (const n of MEGAS) {
    const e = L.Joker['j_poke_' + n];
    const card = add('j_poke_' + n);
    const lv = C(n).loc_vars(C(n), [], card) || {};
    const used = [...new Set((e.text.join(' ').match(/#(\d+)#/g) || []).map((m) => +m.slice(1, -1)))];
    ok(e && e.name && used.every((i) => { const v = (lv.vars || [])[i - 1]; return v !== undefined && v !== null && !Number.isNaN(v); }), `${n}: "${e && e.name}" text + loc_vars fill #${used.join('#, #')}#`, lv.vars);
  }
  ok(L.Item.c_poke_berry_juice_mega && L.Item.c_poke_berry_juice_mega.name === 'Mega Berry Juice', 'the Mega Berry Juice text');
  ok(L.Sleeve.sleeve_poke_megasleeve_alt && L.Sleeve.sleeve_poke_megasleeve.text.some((l) => l.includes('v_crystal_ball')) && L.Back.b_poke_megadeck.text.some((l) => l.includes('v_crystal_ball')),
    'the Mega Deck / Sleeve texts (3.9.1: Crystal Ball; the sleeve alt)');
  // the bases show the Mega tooltip; Raichu its X / Y one while a Mega Stone is held
  const iq = []; add('c_poke_megastone'); C('raichu').loc_vars(C('raichu'), iq, add('j_poke_raichu'));
  ok(iq.some((q) => q.key === 'mega_poke') && iq.some((q) => q.key === 'split_mega' && q.vars.join() === 'Mega Raichu X,Mega Raichu Y'), 'Raichu: Mega + XY Mega tooltips', iq.map((q) => q.key));
});
sec(() => {
  // pools: Megas never roll (poke_mega has no rarity pool); the Mega Stone rolls while a base is held
  start('MPOOL');
  const all = [0.1, 0.8, 0.99].flatMap((r) => get_current_pool('Joker', r)[0]).concat(get_current_pool('Joker', null, true)[0]);
  ok(!MEGAS.some((n) => all.includes('j_poke_' + n)), 'no Mega in any shop rarity pool or the Legendary pool');
  ok(!P.megastone_in_pool(), 'no Mega Stone without a Mega-capable joker');
  add('j_poke_victreebel');
  ok(P.megastone_in_pool(), 'the Mega Stone can roll while Victreebel (3.9.1 megas) is held');
});

// ------------------------------------------------------------------- Raichu X / Y
sec(() => {
  start('MRAICHU');
  const a = add('j_poke_raichu'), b = add('j_poke_raichu');
  const s1 = add('c_poke_megastone'), s2 = add('c_poke_megastone');
  useOn(s1, a);
  ok(key(a) === 'j_poke_mega_raichu_x', 'Raichu: the leftmost Mega Evolves into Mega Raichu X', key(a));
  useOn(s2, b);
  ok(key(b) === 'j_poke_mega_raichu_y', 'Raichu: the rightmost into Mega Raichu Y', key(b));
  ok(s1.ability.extra.used_on === a.unique_val && s2.ability.extra.used_on === b.unique_val && typeof a.unique_val === 'number', 'each stone remembers its Mega\'s card (unique_val)', [s1.ability.extra.used_on, a.unique_val]);
  ok(G.GAME.interest_cap === 50, 'Mega Raichu X: +$25 interest cap', G.GAME.interest_cap);
  G.GAME.dollars = 40;
  clearHand();
  const r = play(hand(['S_2']));
  // X: $ = interest now (1 per $5, up to the cap / 5 = 10): $8; Y: +1 Mult per $1 (counted before X's payout lands)
  ok(G.GAME.dollars === 48, 'Mega Raichu X: each hand earns the interest you would get now ($8 at $40)', G.GAME.dollars);
  ok(r.total.mult === 41, 'Mega Raichu Y: +1 Mult per $1 ($40 -> +40)', r.total);
  // revert X next round: the interest cap goes back
  winRound(); nextBlind();
  useOn(s1, a);
  ok(key(a) === 'j_poke_raichu' && G.GAME.interest_cap === 25 && s1.ability.extra.used_on === undefined, 'Mega Raichu X reverts ("Reverted"): the cap goes back to $25', [key(a), G.GAME.interest_cap]);
});

// ------------------------------------------------------------------- Mega Clefable
sec(() => {
  start('MCLEF');
  const [j] = megaOf('clefable');
  ok(key(j) === 'j_poke_mega_clefable', 'Clefable -> Mega Clefable', key(j));
  clearHand();
  onDeck('C_2'); onDeck('C_3');
  discard(hand(['H_9']));
  const clubs = G.hand.cards.filter((c) => c.is_suit('Clubs')).length;
  ok(clubs >= 2 && Math.abs(j.ability.extra.Xmult_multi1 - 0.03 * clubs) < 1e-9, `mega clefable: +X0.03 per Club drawn (${clubs} drawn)`, j.ability.extra.Xmult_multi1);
  const x = 1 + j.ability.extra.Xmult_multi1;
  clearHand();
  const r = play(hand(['C_K', 'S_K']));
  ok(Math.abs(r.total.mult - 2 * x) < 1e-6, 'mega clefable: a scoring Club gives that X Mult (a Pair: 2 x ' + x.toFixed(2) + ')', r.total);
  const w = winRound();
  ok(j.ability.extra.Xmult_multi1 === 0 && statusMsgs(w.events).includes(localize('k_reset')), 'mega clefable: resets at end of round', j.ability.extra.Xmult_multi1);
});

// ------------------------------------------------------------------- Mega Victreebel
sec(() => {
  start('MVICT');
  const [j] = megaOf('victreebel');
  ok(key(j) === 'j_poke_mega_victreebel' && consumables().includes('c_medium'), 'Victreebel -> Mega Victreebel, holding a Medium', consumables());
  clearHand();
  const r1 = play(hand(['S_2', 'H_2']));
  ok(r1.total.chips === 18, 'mega victreebel: even cards retriggered (10 + 2x2 + 2x2)', r1.total);
  clearHand();
  const [a, b] = hand(['S_3', 'H_3']); a.set_seal('Purple', true);
  const r2 = play([a, b]);
  ok(r2.total.chips === 19, 'mega victreebel: a Purple Seal card retriggered (10 + 3x2 + 3)', r2.total);
  clearHand();
  const [c, d] = hand(['S_4', 'H_4']); c.set_seal('Purple', true);
  const r3 = play([c, d]);
  ok(r3.total.chips === 30, 'mega victreebel: an even Purple Seal card twice (10 + 4x3 + 4x2)', r3.total);
});

// ------------------------------------------------------------------- Mega Starmie
sec(() => {
  start('MSTAR');
  const [j] = megaOf('starmie');
  ok(key(j) === 'j_poke_mega_starmie', 'Starmie -> Mega Starmie', key(j));
  clearHand();
  const d0 = G.GAME.dollars;
  const r = play(hand(['D_5', 'S_5']));
  ok(Math.abs(r.total.mult - 5) < 1e-9 && G.GAME.dollars - d0 === 5, 'mega starmie: a 2-card hand, a scoring Diamond: X2.5 and $5', [r.total, G.GAME.dollars - d0]);
  clearHand();
  const d1 = G.GAME.dollars;
  const r2 = play(hand(['D_5', 'S_5', 'H_9']));
  ok(r2.total.mult === 2 && G.GAME.dollars === d1, 'mega starmie: not with 3 cards', [r2.total, G.GAME.dollars - d1]);
});

// ------------------------------------------------------------------- Mega Dragonite
sec(() => {
  start('MDRAGO');
  const [j] = megaOf('dragonite');
  ok(key(j) === 'j_poke_mega_dragonite', 'Dragonite -> Mega Dragonite', key(j));
  clearHand();
  const r = play(hand(['S_2']));
  ok(r.total.mult === 56 && r.total.chips === 7, 'mega dragonite: +55 Mult (no retrigger before the last hand)', r.total);
  clearHand();
  hand(['H_9', 'H_8', 'H_7']);
  const [p] = hand(['S_2']);
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15; G.GAME.current_round.hands_left = 1;
  act({ type: 'highlight', ids: [p.sort_id] });
  const res = act({ type: 'play' });
  const tot = res.events.find((e) => e.type === 'hand_total');
  ok(tot && tot.chips === 5 + 2 * 4, 'mega dragonite: the last hand, 1 card: retriggered once per card held (3)', tot);
});

// ------------------------------------------------------------------- Mega Meganium
sec(() => {
  start('MMEGAN');
  const h0 = G.hand.config.card_limit;
  const [j] = megaOf('meganium');
  ok(key(j) === 'j_poke_mega_meganium' && G.hand.config.card_limit === h0, 'Meganium -> Mega Meganium (Meganium\'s hand size goes)', [key(j), h0, G.hand.config.card_limit]);
  clearHand();
  hand(['S_2', 'S_3', 'H_4']);
  const d0 = G.GAME.dollars;
  play(hand(['C_K']));
  ok(G.GAME.dollars - d0 === 8, 'mega meganium: the first held Spade and Heart earn $2, each retriggered ($8)', G.GAME.dollars - d0);
  const fo = P.get_first_of_each_suit([...hand(['S_A']), ...hand(['H_A'], { center: 'm_wild' }), ...hand(['H_K'])]);
  ok(fo.Spades && fo.Spades.base.value === 'Ace' && fo.Hearts && fo.Hearts.base.value === 'King' && fo.Clubs && fo.Clubs.base.value === 'Ace' && fo.Clubs.base.suit === 'Hearts' && !fo.Diamonds,
    'get_first_of_each_suit: a Wild card gives way to a plain card of its suit (it moves on to Clubs)', Object.fromEntries(Object.entries(fo).map(([s, c]) => [s, c.base.value])));
});

// ------------------------------------------------------------------- Mega Feraligatr
sec(() => {
  start('MFERA');
  add('j_poke_dratini');
  const [j] = megaOf('feraligatr');
  ok(key(j) === 'j_poke_mega_feraligatr' && consumables().includes('c_poke_dragonscale'), 'Feraligatr -> Mega Feraligatr, holding a Dragon Scale', consumables());
  clearHand();
  const r = play(hand(['S_2', 'H_2']));
  ok(j.ability.extra.chips === 30 && r.total.chips === 14 + 30, 'mega feraligatr: +15 Chips per played card; the Dragon joker gives them (+30)', [j.ability.extra.chips, r.total]);
  const w = winRound();
  ok(j.ability.extra.chips === 0 && statusMsgs(w.events).includes(localize('k_reset')), 'mega feraligatr: resets at end of round', j.ability.extra.chips);
});

// ------------------------------------------------------------------- Mega Skarmory
sec(() => {
  start('MSKAR');
  const l0 = G.GAME.poke_hazard_level || 0;
  const [j, st] = megaOf('skarmory');
  const lim = P.poke_get_hazard_level_vars();
  ok(key(j) === 'j_poke_mega_skarmory' && (G.GAME.poke_hazard_level || 0) === l0 + 1 && G.GAME.poke_hazard_max === 4, 'Skarmory -> Mega Skarmory: still +1 Hazard layer and limit (1 / 4)', [G.GAME.poke_hazard_level, G.GAME.poke_hazard_max, lim]);
  clearHand();
  hand(['S_5', 'H_6'], { center: 'm_gold' });
  const r = play([...hand(['S_K']), ...hand(['S_3'], { center: 'm_poke_hazard' })]);
  ok(r.total.mult === 3, 'mega skarmory: a scoring Hazard card gives X(1 + 1 per held Steel / Gold card): X3', r.total);
  winRound(); nextBlind();
  useOn(st, j);
  ok(key(j) === 'j_poke_skarmory' && (G.GAME.poke_hazard_level || 0) === l0 + 1, 'Mega Skarmory reverts; Skarmory keeps the layer', [key(j), G.GAME.poke_hazard_level]);
});

// ------------------------------------------------------------------- Mega Lucario
sec(() => {
  start('MLUCA');
  const [j] = megaOf('lucario');
  ok(key(j) === 'j_poke_mega_lucario', 'Lucario -> Mega Lucario', key(j));
  clearHand();
  const held = hand(['S_5', 'H_6', 'D_7', 'C_8']);
  held[0].set_edition({ foil: true }, true); held[1].set_edition({ holo: true }, true);
  const r1 = play(hand(['S_K']));
  ok(r1.total.mult === 1, 'mega lucario: 2 editions held: nothing', r1.total);
  clearHand();
  const held2 = hand(['S_5', 'H_6', 'D_7', 'C_8']);
  held2[0].set_edition({ foil: true }, true); held2[1].set_edition({ holo: true }, true); held2[2].set_edition({ polychrome: true }, true);
  const r2 = play(hand(['S_K']));
  ok(Math.abs(r2.total.mult - Math.pow(1.6, 4)) < 1e-6, 'mega lucario: 3 editions held: every held card X1.6 (4 cards)', r2.total);
});

// ------------------------------------------------------------------- Mega Drampa
sec(() => {
  start('MDRAMPA');
  winRound(); act({ type: 'cash_out' }); flush();
  const d = add('j_poke_drampa');
  const n0 = G.shop_booster.cards.length, eb = G.GAME.modifiers.extra_boosters;
  const st = add('c_poke_megastone');
  useOn(st, d);
  ok(key(d) === 'j_poke_mega_drampa', 'Drampa -> Mega Drampa (in the shop)', key(d));
  ok(G.GAME.modifiers.extra_boosters === eb && G.shop_booster.cards.length === n0 && G.GAME.modifiers.booster_choice_mod === 1,
    'mega drampa: keeps the +1 shop pack (no extra stocked by the swap), +1 choice in every pack', [eb, G.GAME.modifiers.extra_boosters, n0, G.shop_booster.cards.length, G.GAME.modifiers.booster_choice_mod]);
  ok(G.shop_booster.cards.every((c) => key(c).includes('mega')), 'mega drampa: the shop\'s packs became Mega packs', G.shop_booster.cards.map(key));
  const pk = G.shop_booster.cards[0];
  G.GAME.dollars = 100;
  act({ type: 'buy', id: pk.sort_id }); flush();
  const choose = (pk.config.center.config.choose || 1) + 1;
  ok(G.GAME.pack_choices === Math.min(choose, (pk.config.center.config.extra || choose)), 'mega drampa: a Mega pack lets you choose one more', [G.GAME.pack_choices, pk.config.center.config]);
  act({ type: 'skip_booster' }); flush();
  act({ type: 'next_round' }); flush(); act({ type: 'select_blind' }); clearHand();
  winRound(); act({ type: 'cash_out' }); flush();
  ok(G.shop_booster.cards.every((c) => key(c).includes('mega')), 'mega drampa: the next shop rolls Mega packs only (get_pack hook)', G.shop_booster.cards.map(key));
  act({ type: 'sell', id: d.sort_id }); flush();
  ok(G.GAME.modifiers.extra_boosters === eb - 1 && G.GAME.modifiers.booster_choice_mod === 0, 'mega drampa sold: the pack slot and the choice go', [G.GAME.modifiers.extra_boosters, G.GAME.modifiers.booster_choice_mod]);
});

// ------------------------------------------------------------------- the Mega Stone (3.9.1 rules)
sec(() => {
  start('MSTONE');
  const a = add('j_poke_clefable'), b = add('j_poke_clefable'), cz = add('j_poke_victreebel');
  const st = add('c_poke_megastone');
  useOn(st, b);
  ok(key(b) === 'j_poke_mega_clefable' && st.ability.extra.used_on === b.unique_val && !st.ability.extra.usable, 'the stone makes Mega Clefable from the picked Clefable and remembers that card');
  winRound(); nextBlind();
  // a used stone targets nothing but its own Mega (3.9.1 get_mega_target): picking Victreebel or the other Clefable falls back to it
  ok(P.megastone_target(st) === b, 'a used stone only targets its own Mega (the highlighted Victreebel does not qualify)', key(P.megastone_target(st)));
  act({ type: 'use', id: st.sort_id, joker_targets: [cz.sort_id] }); flush();
  ok(key(cz) === 'j_poke_victreebel' && key(b) === 'j_poke_clefable' && st.ability.extra.used_on === undefined, 'so using it reverts its Mega, never a second Mega', [key(cz), key(b)]);
  // two Mega Clefables: each stone reverts its own (unique_val), never the twin
  winRound(); nextBlind();
  const st2 = add('c_poke_megastone');
  useOn(st, a); useOn(st2, b);
  ok(key(a) === 'j_poke_mega_clefable' && key(b) === 'j_poke_mega_clefable' && st.ability.extra.used_on === a.unique_val && st2.ability.extra.used_on === b.unique_val, 'two Mega Clefables, one per stone');
  act({ type: 'sell', id: st2.sort_id }); flush();
  ok(key(b) === 'j_poke_clefable' && key(a) === 'j_poke_mega_clefable', 'selling a stone devolves ITS Mega, not the twin', [key(a), key(b)]);
  // the Mega gone (sold): the stone forgets it at end of round and is free again
  act({ type: 'sell', id: a.sort_id }); flush();
  ok(st.ability.extra.used_on === a.unique_val, '(its Mega sold: remembered until the end of the round)');
  winRound();
  ok(st.ability.extra.used_on === undefined && st.ability.extra.usable, 'end of round: a stone whose Mega is gone forgets it and resets');
  nextBlind();
  ok(P.megastone_target(st) === b, 'the free stone targets a base again', key(P.megastone_target(st)));
  // read-time migration: a 3.2.1-shaped used_on (a center key) still names its Mega; nothing rewrites it
  useOn(st, b);
  st.ability.extra.used_on = 'j_poke_mega_clefable';
  ok(P.megastone_mega(st) === b && P.megastone_made(st, b) && st.ability.extra.used_on === 'j_poke_mega_clefable', 'a legacy used_on (center key) resolves to its Mega, unchanged');
  const iq = []; P_CENTERS.c_poke_megastone.loc_vars(P_CENTERS.c_poke_megastone, iq, st);
  ok(iq.some((q) => q.key === 'mega_used_on' && q.vars[0] === 'Mega Clefable') && iq.some((q) => q.key === 'mega_rule'), 'the tooltip names the Mega it was used on', iq.map((q) => q.key));
  winRound(); nextBlind();
  ok(st.ability.extra.used_on === 'j_poke_mega_clefable', 'end of round keeps a legacy used_on whose Mega is there (never rewritten)', st.ability.extra.used_on);
  useOn(st, b);
  ok(key(b) === 'j_poke_clefable' && st.ability.extra.used_on === undefined, 'and the stone reverts it', key(b));
});
sec(() => {
  // poke_infinite_megastone: the Mega Sleeve on the Mega Deck (its alt). Off the Mega Deck: the sleeve's own effect (+ Crystal Ball).
  const s = new Session(); s.start({ seed: 'MINF', back: 'b_poke_megadeck', sleeve: 'sleeve_poke_megasleeve', mods: ['pokermon'] }); flush();
  ok(G.GAME.modifiers.poke_infinite_megastone === true, 'Mega Sleeve on the Mega Deck: poke_infinite_megastone');
  ok(G.GAME.used_vouchers.v_crystal_ball && G.GAME.used_vouchers.v_reroll_glut, 'the Mega Deck: Reroll Surplus / Glut and the Crystal Ball (3.9.1)', Object.keys(G.GAME.used_vouchers));
  ok(G.consumeables.cards.filter((c) => key(c) === 'c_poke_megastone').length === 1, 'one Mega Stone (the sleeve alt adds none)', consumables());
  act({ type: 'select_blind' }); clearHand();
  const a = add('j_poke_dragonite'), b = add('j_poke_starmie');
  const st = G.consumeables.cards.find((c) => key(c) === 'c_poke_megastone');
  useOn(st, a);
  ok(key(a) === 'j_poke_mega_dragonite' && st.ability.extra.used_on === false, 'infinite: the stone remembers nothing', st.ability.extra.used_on);
  winRound(); nextBlind();
  useOn(st, b);
  ok(key(b) === 'j_poke_mega_starmie' && key(a) === 'j_poke_mega_dragonite', 'infinite: a second Mega from the same stone', [key(a), key(b)]);
  const iq = []; P_CENTERS.c_poke_megastone.loc_vars(P_CENTERS.c_poke_megastone, iq, st);
  ok(!iq.some((q) => q.key === 'mega_rule'), 'no "Restriction" tooltip');
  winRound(); nextBlind();
  useOn(st, a);
  ok(key(a) === 'j_poke_dragonite', 'infinite: and it reverts any Mega', key(a));
  newRun({ seed: 'MSLV', back: 'b_red', sleeve: 'sleeve_poke_megasleeve', mods: ['pokermon'] }); flush();
  ok(!G.GAME.modifiers.poke_infinite_megastone && G.GAME.used_vouchers.v_crystal_ball && consumables().includes('c_poke_megastone'), 'the Mega Sleeve on another deck: its own effect (+ Crystal Ball), no modifier');
});

// ------------------------------------------------------------------- the Mega Berry Juice
sec(() => {
  start('MJUICE');
  const sh = add('j_poke_shuckle');
  add('c_poke_megastone');
  winRound(); nextBlind(); flush();
  ok(consumables().includes('c_poke_berry_juice_mega') && !consumables().includes('c_poke_megastone'), 'Shuckle slices a Mega Stone into a Mega Berry Juice', consumables());
  const juice = G.consumeables.cards.find((c) => key(c) === 'c_poke_berry_juice_mega');
  ok(!juice.can_use_consumeable(), 'the juice needs a joker with a Mega');
  const r1 = add('j_poke_raichu'), r2 = add('j_poke_meganium');
  const u = useOn(juice, r2);
  ok(key(r2) === 'j_poke_mega_meganium' && key(r1) === 'j_poke_raichu' && !consumables().includes('c_poke_berry_juice_mega'), 'Mega Berry Juice: Mega Evolves the selected joker, and is used up', [key(r1), key(r2), u.error]);
  ok(P_CENTERS.c_poke_berry_juice_mega.in_pool() === false && sh, 'never in a pool');
});

// ------------------------------------------------------------------- precedence (Nacho / Pokermon+)
sec(() => {
  // the add-on dedupe detection (precedence.js replaced_by): no add-on joker shares a name with these Megas
  start('MPREC', {}, { mods: ['nacho', 'pokermonplus'] });
  // (the dedupe step's script check: every add-on joker by name and by display name against Pokermon's)
  const addon = Object.values(P_CENTERS).filter((c) => c.set === 'Joker' && (c.mod === 'nacho' || c.mod === 'pokermonplus'));
  const megaNames = new Set(MEGAS.map((n) => String(localize({ type: 'name_text', set: 'Joker', key: 'j_poke_' + n })).toLowerCase()));
  const clash = addon.filter((c) => MEGAS.includes(c.name) || megaNames.has(String(localize({ type: 'name_text', set: 'Joker', key: c.key })).toLowerCase()));
  ok(clash.length === 0 && addon.length > 50 && addon.some((c) => c.name === 'mega_gardevoir'), 'no Nacho / Pokermon+ joker is one of these Megas (by name or display name)', clash.map((c) => c.key));
  ok(MEGAS.every((n) => !replaced_by('j_poke_' + n)) && addon.filter((c) => /mega/.test(c.key)).every((c) => !replaced_by(c.key)), 'replaced_by: none of the 11, and no add-on Mega, is a duplicate');
  ok(addon.filter((c) => replaced_by(c.key)).map((c) => c.key).sort().join() === 'j_nacho_altaria,j_nacho_bagon,j_nacho_gallade,j_nacho_gardevoir,j_nacho_kirlia,j_nacho_ralts,j_nacho_salamence,j_nacho_shelgon,j_nacho_swablu,j_sonfive_nincada,j_sonfive_ninjask,j_sonfive_shedinja',
    'the duplicate set is unchanged (12)', addon.filter((c) => replaced_by(c.key)).map((c) => c.key));
  // with the add-ons on, a Pokermon base gives Pokermon's Mega
  const [j] = megaOf('lucario');
  ok(key(j) === 'j_poke_mega_lucario', 'with Nacho + Pokermon+ on: Lucario -> Pokermon\'s Mega Lucario', key(j));
});

// ------------------------------------------------------------------- the art
if (!ART) console.log('(Pokermon art not on disk: the sprite checks are skipped; set MICATRO_MAIN)');
else if (!MEGAS.every(C)) ok(false, 'art: the Megas are not registered');
else {
  const ATL = MODS.pokermon.content.atlases;
  const want = {};
  const cell = (atlas, pos, id) => {
    const file = decodeURIComponent(ATL[atlas].src).replace(/^.*\/assets\/2x\//, '');
    (want[file] || (want[file] = {}))[id] = [pos.x * 142, pos.y * 190, 142, 190];
  };
  const shiny = (a) => a.replace(/391$/, 'Shiny391');
  for (const n of MEGAS) {
    const c = C(n);
    cell(c.atlas, c.pos, n + '|base'); cell(shiny(c.atlas), c.pos, n + '|shiny');
    cell(c.atlas, c.soul_pos, n + '|soul'); cell(shiny(c.atlas), c.soul_pos, n + '|shinysoul');
  }
  const J = P_CENTERS.c_poke_berry_juice_mega;
  cell(J.atlas, J.pos, 'juice');
  const px = {};
  for (const [file, rects] of Object.entries(want)) Object.assign(px, await crops(path.join(ART, file), rects));
  const opaque = (r) => { let k = 0; for (let i = 3; i < r.px.length; i += 4) if (r.px[i] > 0) k++; return k / (r.px.length / 4); };
  const diff = (a, b) => { let d = 0; for (let i = 0; i < a.px.length; i++) d += Math.abs(a.px[i] - b.px[i]); return d; };
  const hash = (r) => { let h = 0; for (let i = 0; i < r.px.length; i += 97) h = (h * 31 + r.px[i]) >>> 0; return h; };
  for (const n of MEGAS) {
    const c = C(n), g = (k) => px[n + '|' + k];
    ok(/^poke_AtlasJokersBasicGen0\d391$/.test(c.atlas) && ['base', 'shiny', 'soul', 'shinysoul'].every((k) => g(k).inside)
      && opaque(g('base')) > 0.5 && opaque(g('shiny')) > 0.5 && opaque(g('soul')) > 0.1 && opaque(g('shinysoul')) > 0.1 && diff(g('soul'), g('shinysoul')) > 0,
    `${n}: its 3.9.1 card + soul and their Shiny twins (${c.atlas} ${c.pos.x},${c.pos.y} / ${c.soul_pos.x},${c.soul_pos.y})`, [opaque(g('base')), opaque(g('soul')), diff(g('soul'), g('shinysoul'))]);
  }
  ok(new Set(MEGAS.map((n) => hash(px[n + '|soul']))).size === MEGAS.length, 'every Mega is its own picture');
  ok(px.juice.inside && opaque(px.juice) > 0.5, 'the Mega Berry Juice: AtlasConsumablesBasic-391 {7,7}', opaque(px.juice));
}

done();
