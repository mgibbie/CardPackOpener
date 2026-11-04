// Bunco content: consumables, enhancements, editions, packs, vouchers, decks, tags, blinds, stickers, stakes,
// the vanilla reworks (on / option off / Bunco off), and describe() of every center. Real act() plays,
// the mod's exact numbers.   node micatro/tests/mods/bunco_content_test.mjs
import {
  ok, near, flush, done, start, clearHand, hand, add, clearJokers, clearConsumables, play, discard, winRound, nextRound, toShop,
  msgs, tot, filled, handName, G, P_CENTERS, P_CARDS, P_BLINDS, P_TAGS, act, STATES,
} from './bunco_helpers.mjs';
import { newRun, get_poker_hand_info } from '../../js/engine/run.js';
import { describe, describeCenter, describeBlind, describeTag, describeBack } from '../../js/engine/describe.js';
import { add_joker, create_card, poll_edition, Card, get_new_boss, get_pack } from '../../js/engine/core.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { toView } from '../../js/engine/view.js';
import { STATUS } from '../../mods/bunco/index.js';

const sel = (cards) => act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
const useC = (c, targets) => act({ type: 'use', id: c.sort_id, targets: targets && targets.map((x) => x.sort_id) });
const cons = (key) => { const c = add_joker(key); flush(); return c; };
const tagKeys = () => G.GAME.tags.map((t) => t.key);

// =========================================================== consumables
{
  start('CONS');
  // Adjustment / The Art: up to 2 cards -> Cracker / Copper
  let cs = hand(['S_2', 'H_3', 'D_4']);
  let r = useC(cons('c_bunc_adjustment'), cs.slice(0, 2));
  ok(r.ok && cs[0].config.center.key === 'm_bunc_cracker' && cs[1].config.center.key === 'm_bunc_cracker' && cs[2].config.center.key === 'c_base', 'Adjustment: 2 Cracker Cards', r.error);
  ok(!cons('c_bunc_adjustment').can_use_consumeable() || G.hand.highlighted.length <= 2, 'Adjustment: up to 2');
  clearConsumables();
  r = useC(cons('c_bunc_art'), cs.slice(1, 3));
  ok(r.ok && cs[1].config.center.key === 'm_bunc_copper' && cs[2].config.center.key === 'm_bunc_copper', 'The Art: 2 Copper Cards', r.error);
  const art3 = cons('c_bunc_art'); sel(cs);
  ok(!art3.can_use_consumeable(), 'The Art: not 3 cards');
  clearConsumables(); clearHand();
  // The Universe: randomizes suit / rank (and enhancement / edition / seal only if the card had one)
  cs = hand(['S_2', 'H_3']);
  cs[1].set_ability(P_CENTERS.m_bonus); cs[1].set_seal('Red', true); cs[1].set_edition({ foil: true }, true, true);
  const before = cs.map((c) => c.config.card.key);
  r = useC(cons('c_bunc_universe'), cs);
  ok(r.ok, 'The Universe used', r.error);
  ok(cs[0].config.center.key === 'c_base' && !cs[0].seal && !cs[0].edition, 'The Universe: a plain card stays plain (only suit / rank)');
  ok(cs[1].config.center.set === 'Enhanced' && !!cs[1].seal && !!cs[1].edition, 'The Universe: enhancement / seal / edition re-rolled where present');
  ok(cs.every((c) => !!P_CARDS[c.config.card.key]), 'The Universe: valid fronts', cs.map((c) => c.config.card.key), before);
  const u4 = cons('c_bunc_universe'); sel(hand(['S_4', 'S_5', 'S_6', 'S_7']));
  ok(!u4.can_use_consumeable(), 'The Universe: up to 3 cards');
  clearConsumables(); clearHand();
  // Lust: $1 per card held, max $52
  hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']);
  let d0 = G.GAME.dollars;
  const lu = cons('c_bunc_lust');
  ok(filled(describe(lu)) && describe(lu).lines.join(' ').includes('$5'), 'Lust: "(Currently $5)"', describe(lu).lines);
  r = useC(lu);
  ok(r.ok && G.GAME.dollars === d0 + 5, 'Lust: +$5 for 5 cards', G.GAME.dollars - d0);
  clearHand(); for (let i = 0; i < 60; i++) hand(['S_2']);
  d0 = G.GAME.dollars; useC(cons('c_bunc_lust'));
  ok(G.GAME.dollars === d0 + 52, 'Lust: capped at $52', G.GAME.dollars - d0);
  clearHand(); clearConsumables();
  // The Sky / The Abyss: up to 3 cards to Fleurons / Halberds, and the Exotic System switches on
  ok(!P_CENTERS.c_bunc_sky.in_pool() && !P_CENTERS.c_bunc_abyss.in_pool(), 'The Sky / The Abyss: not in the pool before the Exotic System');
  cs = hand(['S_2', 'H_3', 'D_4', 'C_5']);
  r = useC(cons('c_bunc_sky'), cs.slice(0, 3));
  ok(r.ok && cs.slice(0, 3).every((c) => c.base.suit === 'bunc_Fleurons') && cs[3].base.suit === 'Clubs', 'The Sky: 3 Fleurons', r.error);
  ok(G.GAME.Exotic === true && P_CENTERS.c_bunc_sky.in_pool(), 'The Sky enables the Exotic System');
  r = useC(cons('c_bunc_abyss'), [cs[3]]);
  ok(r.ok && cs[3].base.suit === 'bunc_Halberds' && cs[3].config.card.key === 'bunc_HALBERD_5', 'The Abyss: Halberds', r.error);
  const sky4 = cons('c_bunc_sky'); sel(hand(['S_4', 'S_5', 'S_6', 'S_7']));
  ok(!sky4.can_use_consumeable(), 'The Sky: up to 3');
  clearHand(); clearConsumables();
  // planets: level up their Spectrum hand by +chips / +mult
  const pl = { c_bunc_quaoar: ['bunc_Spectrum', 20, 2], c_bunc_haumea: ['bunc_Straight Spectrum', 45, 4], c_bunc_sedna: ['bunc_Spectrum House', 40, 4], c_bunc_makemake: ['bunc_Spectrum Five', 55, 3] };
  for (const [k, [h, lc, lm]] of Object.entries(pl)) {
    const p = cons(k);
    ok(P_CENTERS[k].config.hand_type === h && P_CENTERS[k].config.softlock === true, k + ' -> ' + h + ' (softlocked)');
    const d = describe(p);
    ok(filled(d) && d.lines.join(' ').includes(h.replace('bunc_', '')), k + ': Mercury-style text', d.lines);
    const c0 = G.GAME.hands[h].chips, m0 = G.GAME.hands[h].mult;
    r = useC(p);
    ok(r.ok && G.GAME.hands[h].level === 2 && G.GAME.hands[h].chips === c0 + lc && G.GAME.hands[h].mult === m0 + lm, k + ' levels ' + h, r.error);
  }
  // planets are softlocked out of the pool until their hand is played
  const { get_current_pool } = await import('../../js/engine/core.js');
  const planet_pool = () => get_current_pool('Planet')[0];
  start('PLPOOL');
  ok(!planet_pool().includes('c_bunc_quaoar'), 'Quaoar not in the pool before a Spectrum is played');
  play(hand(['S_2', 'D_7', 'C_3', 'bunc_FLEURON_5', 'H_K']));
  ok(planet_pool().includes('c_bunc_quaoar'), 'Quaoar in the pool after a Spectrum');
  // Cleanse: up to 3 editionless cards -> Fluorescent
  clearHand();
  cs = hand(['S_2', 'H_3', 'D_4', 'C_5']);
  r = useC(cons('c_bunc_cleanse'), cs.slice(0, 3));
  ok(r.ok && cs.slice(0, 3).every((c) => c.edition && c.edition.bunc_fluorescent) && !cs[3].edition, 'Cleanse: 3 Fluorescent cards', r.error);
  const cl2 = cons('c_bunc_cleanse'); sel([cs[0], cs[3]]);
  ok(!cl2.can_use_consumeable(), 'Cleanse: not on a card with an edition');
  sel([cs[3]]);
  ok(cl2.can_use_consumeable(), 'Cleanse: 1 editionless card is fine');
  clearConsumables();
}

// ========================================================= enhancements
{
  // Copper: a streak of adjacent Coppers scores again once (2 Coppers + a plain 2: 2,2 then 2,2 again)
  start('COPPER');
  const [a, b, c] = hand(['S_2', 'S_3', 'S_4']);
  a.set_ability(P_CENTERS.m_bunc_copper); b.set_ability(P_CENTERS.m_bunc_copper);
  let r = play([a, b, c]);
  // High Card 4: scoring hand = the 4 only... use a straight-free hand: play a pair of Coppers
  clearHand();
  const [p1, p2, p3] = hand(['S_5', 'H_5', 'D_9']);
  p1.set_ability(P_CENTERS.m_bunc_copper); p2.set_ability(P_CENTERS.m_bunc_copper);
  r = play([p1, p2, p3]);
  // Pair of 5s: 10 + 5 + 5 = 20, then the streak again: +5 +5 = 30; mult 2
  ok(tot(r) && tot(r)[0] === 30 && tot(r)[1] === 2, 'Copper: a 2-Copper streak scores twice (30 x 2)', tot(r));
  // non-adjacent Coppers don't (Copper, plain, Copper in a Three of a Kind)
  clearHand();
  const [q1, q2, q3] = hand(['S_5', 'H_5', 'D_5']);
  q1.set_ability(P_CENTERS.m_bunc_copper); q3.set_ability(P_CENTERS.m_bunc_copper);
  r = play([q1, q2, q3]);
  ok(tot(r) && tot(r)[0] === 45 && tot(r)[1] === 3, 'Copper: separated Coppers do not re-score (30+15 x 3)', tot(r));
  // a single Copper doesn't
  clearHand();
  const [s1, s2] = hand(['S_5', 'H_5']); s1.set_ability(P_CENTERS.m_bunc_copper);
  r = play([s1, s2]);
  ok(tot(r)[0] === 20, 'Copper: one Copper alone does not re-score', tot(r));
  // re-score counters reset after the hand
  ok(!s1.config.copper_rescored_times && !p1.config.copper_rescored_times, 'Copper: counters reset after the hand');

  // Cracker: discarding a Cracker plays it instead (a free hand), then it is eaten
  start('CRACKER');
  const hands0 = G.GAME.current_round.hands_left;
  const [k1, n1, n2] = hand(['S_9', 'H_3', 'D_4']);
  k1.set_ability(P_CENTERS.m_bunc_cracker);
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  const disc0 = G.GAME.current_round.discards_left;
  r = discard([k1, n1, n2]);
  ok(r.ok, 'Cracker discard ok', r.error);
  const total = r.events.find((e) => e.type === 'hand_total');
  ok(total && total.chips === 14 && total.mult === 1, 'Cracker: the Cracker is played (High Card 9: 5+9 x 1)', total);
  ok(G.GAME.current_round.hands_left === hands0 && G.GAME.current_round.discards_left === disc0 - 1, 'Cracker: uses the discard, not a hand');
  ok(k1.removed && n1.area === G.discard && n2.area === G.discard, 'Cracker: eaten after its hand; the rest discarded');
  ok(msgs(r.events).includes(G.localize_eaten || 'Eaten!'), 'Cracker: "Eaten!"', msgs(r.events));
  // only Crackers discarded: still played, a discard used
  start('CRACKER2');
  const [k2] = hand(['S_K']); k2.set_ability(P_CENTERS.m_bunc_cracker);
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  const d1 = G.GAME.current_round.discards_left, h1 = G.GAME.current_round.hands_left;
  r = discard([k2]);
  ok(r.ok && r.events.some((e) => e.type === 'hand_total' && e.chips === 15) && k2.removed, 'Cracker alone: played (5+10) and eaten', r.error);
  ok(G.GAME.current_round.discards_left === d1 - 1 && G.GAME.current_round.hands_left === h1, 'Cracker alone: a discard, not a hand');
  // a debuffed Cracker is just discarded
  start('CRACKER3');
  const [k3] = hand(['S_K']); k3.set_ability(P_CENTERS.m_bunc_cracker); k3.set_debuff(true); k3.debuff = true;
  r = discard([k3]);
  ok(r.ok && !r.events.some((e) => e.type === 'hand_total') && k3.area === G.discard, 'a debuffed Cracker is discarded normally');
}

// ============================================================== editions
{
  start('GLITTER');
  // Glitter on a played card: X1.3 Chips after its own effects
  const [g1] = hand(['S_K']);
  g1.set_edition({ bunc_glitter: true }, true, true);
  let r = play([g1]);
  ok(tot(r) && near(tot(r)[0], (5 + 10) * 1.3) && tot(r)[1] === 1, 'Glitter card: (5+10) X1.3 chips', tot(r));
  // Glitter joker: X1.3 Chips after its own effect (Joker +4 Mult)
  const j = add('j_joker'); j.set_edition({ bunc_glitter: true }, true, true);
  r = play(hand(['S_K']));
  ok(tot(r) && near(tot(r)[0], 15 * 1.3) && tot(r)[1] === 5, 'Glitter joker: X1.3 chips', tot(r));
  ok(P_CENTERS.e_bunc_glitter.weight === 9 && P_CENTERS.e_bunc_fluorescent.weight === 18 && P_CENTERS.e_bunc_glitter.in_shop && P_CENTERS.e_bunc_fluorescent.in_shop, 'edition weights 9 / 18, in shops');
  ok(P_CENTERS.e_bunc_glitter.get_weight(P_CENTERS.e_bunc_glitter) === 9 * G.GAME.edition_rate, 'Glitter weight scales with the edition rate');
  // Fluorescent: never debuffed, never flipped face down
  clearJokers();
  const [f1, f2] = hand(['S_K', 'H_K']);
  f1.set_edition({ bunc_fluorescent: true }, true, true);
  f1.set_debuff(true); f2.set_debuff(true);
  ok(!f1.debuff && f2.debuff, 'Fluorescent: cannot be debuffed');
  f1.flip(); f2.flip();
  ok(f1.facing === 'front' && f2.facing === 'back', 'Fluorescent: cannot be flipped face down');
  // Fluorescent: a forced selection can be undone
  f1.ability.forced_selection = true; G.hand.add_to_highlighted(f1);
  act({ type: 'highlight', id: f1.sort_id });
  ok(!f1.highlighted, 'Fluorescent: forced selection can be removed');
  // a consumable's edition doesn't score; using it makes a tag
  start('CONSED');
  const pl = add_joker('c_mercury'); pl.set_edition({ foil: true }, true, true); flush();
  let rr = play(hand(['S_K']));
  ok(tot(rr)[0] === 15, 'a Foil consumable does not add +50 chips', tot(rr));
  for (const [ed, tag] of [['foil', 'tag_bunc_chips'], ['holo', 'tag_bunc_mult'], ['polychrome', 'tag_bunc_xmult'], ['bunc_glitter', 'tag_bunc_xchips']]) {
    const c = add_joker('c_mercury'); c.set_edition({ [ed]: true }, true, true); flush();
    useC(c);
    ok(tagKeys().includes(tag), 'using a ' + ed + ' consumable makes ' + tag, tagKeys());
  }
  // jokerlike_consumable_editions: consumable editions score like jokers'
  start('CONSED2', { modOptions: { bunco: { jokerlike_consumable_editions: true } } });
  const pl2 = add_joker('c_mercury'); pl2.set_edition({ foil: true }, true, true); flush();
  rr = play(hand(['S_K']));
  ok(tot(rr)[0] === 65, 'option on: a Foil consumable adds +50 chips', tot(rr));
}

// ================================================================= packs
function openPack(key) {
  toShop();
  const card = new Card(P_CARDS.empty, P_CENTERS[key]);
  G.shop_booster.emplace(card);
  G.GAME.dollars = 100;
  return act({ type: 'buy', id: card.sort_id });
}
{
  // Blind Pack: 3 Blind cards (bosses of this ante's pool); Select one -> this ante's Boss; 1 choice; $8
  start('BLINDPACK');
  ok(P_CENTERS.p_bunc_blind_1.cost === 8 && P_CENTERS.p_bunc_blind_1.config.extra === 3 && P_CENTERS.p_bunc_blind_1.config.choose === 1, 'Blind Pack: $8, 3 cards, choose 1');
  ok(!P_CENTERS.p_bunc_blind_1.in_pool(), 'Blind Packs only with Disguise');
  G.GAME.used_vouchers.v_bunc_disguise = true;
  ok(P_CENTERS.p_bunc_blind_2.in_pool(), 'Disguise: Blind Packs in the shop');
  let r = openPack('p_bunc_blind_1');
  ok(r.ok && G.STATE === STATES.MOD_PACK && G.pack_cards.cards.length === 3 && G.GAME.pack_choices === 1, 'Blind Pack opened', r.error);
  const bc = G.pack_cards.cards.find((c) => c.ability.blind_card);
  ok(!!bc && P_BLINDS[bc.ability.blind_card.blind].boss, 'a Blind card holds a boss blind');
  const v = toView();
  ok(v.pack_kind === 'Blind' && v.areas.pack_cards.some((x) => x.blind_card && x.blind_card.key === bc.ability.blind_card.blind), 'view: Blind cards + pack kind');
  ok(filled(describe(bc)) && describe(bc).name === describeBlind(bc.ability.blind_card.blind).name, 'a Blind card describes its blind');
  r = act({ type: 'use', id: bc.sort_id });
  ok(r.ok && G.GAME.round_resets.blind_choices.Boss === bc.ability.blind_card.blind && G.STATE === STATES.SHOP, 'Select: it becomes this ante\'s Boss and the pack closes', r.error);
  ok(!G.consumeables.cards.length && !G.playing_cards.includes(bc), 'the Blind card goes nowhere else');
  // The Joker can show up instead of a Blind card (1 in 25 per card)
  let saw = 0;
  for (let i = 0; i < 40 && !saw; i++) { start('BJ' + i); G.GAME.used_vouchers.v_bunc_disguise = true; openPack('p_bunc_blind_1'); saw += G.pack_cards.cards.filter((c) => c.config.center.key === 'j_bunc_the_joker').length; }
  ok(saw > 0, 'The Joker appears in Blind Packs');
  // Virtual Pack: the whole deck drawn; Polyminoes used on it; hand back to the deck after
  start('VIRTUAL');
  r = openPack('p_bunc_virtual_1');
  const n = G.playing_cards.length;
  ok(r.ok && G.STATE === STATES.MOD_PACK_HAND && G.hand.cards.length === n && G.deck.cards.length === 0, 'Virtual Pack: whole deck in hand', [G.hand.cards.length, n, r.error]);
  ok(G.pack_cards.cards.length === 2 && G.pack_cards.cards.every((c) => c.ability.set === 'Polymino' || c.config.center.key === 'c_bunc_the_8'), 'Virtual Pack: 2 Polyminoes');
  const vv = toView();
  ok(vv.pack_kind === 'Virtual' && vv.music === 'bunc_music_virtual' && vv.bunc_virtual, 'view: virtual pack music / layout flag');
  G.pack_cards.cards[0].set_ability(P_CENTERS.c_bunc_the_i);
  const spades = G.hand.cards.filter((c) => c.base.suit === 'Spades').slice(0, 4);
  r = useC(G.pack_cards.cards[0], spades);
  ok(r.ok && spades.every((c) => c.ability.group), 'Virtual Pack: a Polymino links hand cards', r.error);
  ok(G.STATE === STATES.SHOP && G.hand.cards.length === 0 && G.deck.cards.length === n, 'Virtual Pack: closes, the deck goes back');
  const sizes = { p_bunc_virtual_1: [2, 1, 0.07], p_bunc_virtual_2: [2, 1, 0.07], p_bunc_virtual_jumbo: [4, 1, 0.05], p_bunc_virtual_mega: [4, 2, 0.03] };
  for (const [k, [e, c, w]] of Object.entries(sizes)) ok(P_CENTERS[k].config.extra === e && P_CENTERS[k].config.choose === c && P_CENTERS[k].weight === w, k + ': ' + e + ' cards, choose ' + c + ', weight ' + w);
  ok(P_CENTERS.p_bunc_virtual_mega.get_weight(P_CENTERS.p_bunc_virtual_mega) === 0.03, 'Virtual weight x1 without Arcade Machine');
  G.GAME.used_vouchers.v_bunc_arcade_machine = true;
  ok(near(P_CENTERS.p_bunc_virtual_mega.get_weight(P_CENTERS.p_bunc_virtual_mega), 0.12), 'Arcade Machine: x4');
}

// ============================================================== vouchers
{
  start('VOUCHERS');
  const redeem = (k) => { const c = new Card(P_CARDS.empty, P_CENTERS[k]); G.shop_vouchers.emplace(c); G.GAME.dollars += 20; return act({ type: 'buy', id: c.sort_id }); };
  toShop();
  const sc = G.GAME.starting_params.ante_scaling;
  ok(redeem('v_bunc_chainsaw').ok && near(G.GAME.starting_params.ante_scaling, sc * 0.8), 'Chainsaw: -20% required scores');
  const nb = G.shop_booster.cards.length;
  ok(redeem('v_bunc_cups_n_balls').ok && G.shop_booster.cards.length === nb + 1 && G.GAME.modifiers.extra_boosters === 1, "Cups 'n' Balls: +1 booster slot");
  const bp = new Card(P_CARDS.empty, P_CENTERS.p_bunc_blind_3); G.shop_booster.emplace(bp); bp.set_cost();
  ok(bp.cost === 8, 'a Blind Pack costs $8');
  ok(redeem('v_bunc_masquerade').ok && bp.cost === 0, 'Masquerade: Blind Packs in the shop become free');
  const bp2 = new Card(P_CARDS.empty, P_CENTERS.p_bunc_blind_4); G.shop_booster.emplace(bp2); bp2.set_cost();
  ok(bp2.cost === 0, 'Masquerade: new Blind Packs are free');
  // Hedge Trimmer: -5% of the blind's score every hand (any blind)
  start('HEDGE');
  G.GAME.used_vouchers.v_bunc_hedge_trimmer = true;
  G.GAME.blind.chips = 1000;
  G.GAME.current_round.hands_left = 3;
  act({ type: 'highlight', ids: hand(['S_2']).map((c) => c.sort_id) }); act({ type: 'play' });
  ok(near(G.GAME.blind.chips, 950), 'Hedge Trimmer: 1000 -> 950', G.GAME.blind.chips);
  // Lamination / Supercoating
  let edd = 0, tot2 = 0;
  for (let i = 0; i < 6; i++) {
    start('SUPER' + i); G.GAME.used_vouchers.v_bunc_lamination = true; G.GAME.used_vouchers.v_bunc_supercoating = true;
    openPack('p_arcana_normal_1');
    for (const c of G.pack_cards.cards) { tot2++; if (c.edition) edd++; }
    ok(G.pack_cards.cards.every((c) => !c.edition || ['foil', 'holo', 'polychrome', 'bunc_glitter'].includes(c.edition.type)), 'Supercoating editions are Foil/Holo/Poly/Glitter');
  }
  ok(edd === tot2 && tot2 > 0, 'Supercoating: every pack consumable has an edition', [edd, tot2]);
  let lam = 0, lt = 0;
  for (let i = 0; i < 30; i++) { start('LAMO' + i); G.GAME.used_vouchers.v_bunc_lamination = true; openPack('p_arcana_normal_1'); lt += 3; lam += G.pack_cards.cards.filter((c) => c.edition).length; }
  ok(lam > 0 && lam < lt, 'Lamination: some pack consumables have an edition', [lam, lt]);
  edd = 0;
  for (let i = 0; i < 6; i++) { start('LAMI' + i); openPack('p_arcana_normal_1'); edd += G.pack_cards.cards.filter((c) => c.edition).length; }
  ok(edd === 0, 'no Lamination: no pack editions');
  // Fanny Pack
  let got = 0, runs = 0;
  for (let i = 0; i < 24; i++) {
    start('FANNY' + i, { noBlind: true }); G.GAME.used_vouchers.v_bunc_fanny_pack = true;
    act({ type: 'skip_blind' }); flush(); runs++;
    if (G.GAME.tags.length >= 2) got++;
  }
  ok(got > 0 && got < runs, 'Fanny Pack: sometimes a Double Tag (copying the skip tag)', [got, runs]);
  // Pin Collector
  start('PIN', { noBlind: true });
  G.GAME.used_vouchers.v_bunc_pin_collector = true;
  add_tag(new Tag('tag_double'));
  ok(tagKeys().join() === 'tag_bunc_triple', 'Pin Collector: a Double Tag arrives as a Triple Tag', tagKeys());
  add_tag(new Tag('tag_economy')); flush();
  ok(tagKeys().filter((k) => k === 'tag_economy').length === 3 && !tagKeys().includes('tag_bunc_triple'), 'Triple Tag: two more copies', tagKeys());
  ok(P_TAGS.tag_bunc_triple.in_pool() === true, 'Triple Tag in the pool with Pin Collector');
  // Shell Game
  start('SHELL');
  G.GAME.used_vouchers.v_bunc_shell_game = true;
  openPack('p_arcana_normal_1');
  const first = G.pack_cards.cards.map((c) => c.sort_id);
  const st = G.STATE, d0 = G.GAME.dollars, ch = G.GAME.pack_choices;
  ok(toView().mod_buttons.some((b) => b.action.type === 'bunc_reroll_pack'), 'Shell Game: a Reroll button');
  let r = act({ type: 'bunc_reroll_pack' });
  ok(r.ok && G.STATE === st && G.pack_cards.cards.length === 3 && G.GAME.dollars === d0 && G.GAME.pack_choices === ch, 'Shell Game: new cards, same pack, free', r.error);
  ok(G.pack_cards.cards.every((c) => !first.includes(c.sort_id)), 'Shell Game: the old cards are gone');
  ok(!act({ type: 'bunc_reroll_pack' }).ok && !(toView().mod_buttons || []).some((b) => b.action.type === 'bunc_reroll_pack'), 'Shell Game: once per pack');
  act({ type: 'skip_booster' });
  ok(G.STATE === STATES.SHOP, 'back in the shop after a rerolled pack');
  start('SHELL2'); openPack('p_arcana_normal_1');
  ok(!act({ type: 'bunc_reroll_pack' }).ok, 'no Shell Game: no reroll');
  for (const k of STATUS.vouchers) ok(filled(describeCenter(k)), 'describe ' + k);
}

// ================================================================= decks
{
  start('FAIRY', { back: 'b_bunc_fairy', noBlind: true });
  ok(G.GAME.Exotic === true, 'Fairy: the Exotic System is on');
  const n = G.playing_cards.length;
  toBossSelect(); act({ type: 'select_blind' }); clearHand();
  winRound(); flush();
  ok(G.playing_cards.filter((c) => c.base.suit === 'bunc_Fleurons' || c.base.suit === 'bunc_Halberds').length === 4, 'Fairy: 4 exotic cards after the Boss', [G.playing_cards.length, n]);
  start('DIGITAL', { back: 'b_bunc_digital' });
  ok(G.GAME.polymino_rate === 2 && G.consumeables.cards.some((c) => c.config.center.key === 'c_bunc_the_i'), 'Digital: Polymino shop rate 2, starts with The I');
  start('RED');
  ok(G.GAME.polymino_rate === 0, 'other decks: no Polyminoes in the shop');
  ok(describeBack('b_bunc_fairy').lines.length > 0 && filled(describeBack('b_bunc_fairy')) && filled(describeBack('b_bunc_digital')), 'describe the decks');
}

// ================================================================== tags
{
  // Breaking: disables the Boss Blind when its round starts
  start('BREAK', { noBlind: true });
  add_tag(new Tag('tag_bunc_breaking'));
  act({ type: 'select_blind' }); flush();
  ok(!G.GAME.blind.disabled && tagKeys().includes('tag_bunc_breaking'), 'Breaking: waits for a Boss');
  nextRound(); nextRound();
  ok(G.GAME.blind.boss && G.GAME.blind.disabled && !tagKeys().includes('tag_bunc_breaking'), 'Breaking: the Boss is disabled');
  // Arcade: a free Mega Virtual Pack
  start('ARCADE', { noBlind: true });
  const d0 = G.GAME.dollars;
  add_tag(new Tag('tag_bunc_arcade'));
  act({ type: 'skip_blind' }); flush();
  ok(G.STATE === STATES.MOD_PACK_HAND && G.GAME.pack_center === 'p_bunc_virtual_mega' && G.pack_cards.cards.length === 4 && G.GAME.pack_choices === 2 && G.GAME.dollars === d0, 'Arcade Tag: a free Mega Virtual Pack');
  act({ type: 'skip_booster' });
  // Glitter / Fluorescent: the next base-edition shop joker -> free + that edition
  for (const [t, ed] of [['tag_bunc_glitter', 'bunc_glitter'], ['tag_bunc_fluorescent', 'bunc_fluorescent']]) {
    start('ED' + t);
    add_tag(new Tag(t));
    toShop(); flush();
    const j = G.shop_jokers.cards.find((c) => c.edition && c.edition[ed]);
    ok(!!j && j.cost === 0, t + ': a free ' + ed + ' shop joker', G.shop_jokers.cards.map((c) => [c.ability.name, c.edition && c.edition.type, c.cost]));
  }
  // Chips / Mult: before the hand; Megamult / Ultrachips: at its end
  start('HANDTAGS');
  add_tag(new Tag('tag_bunc_chips'));
  let r = play(hand(['S_K']));
  ok(tot(r)[0] === 65 && tot(r)[1] === 1 && !tagKeys().includes('tag_bunc_chips'), 'Chips Tag: +50 chips next hand', tot(r));
  add_tag(new Tag('tag_bunc_mult'));
  r = play(hand(['S_K']));
  ok(tot(r)[1] === 11, 'Mult Tag: +10 Mult', tot(r));
  add_tag(new Tag('tag_bunc_xmult'));
  r = play(hand(['S_K']));
  ok(near(tot(r)[1], 1.5), 'Megamult Tag: X1.5 Mult', tot(r));
  add_tag(new Tag('tag_bunc_xchips'));
  r = play(hand(['S_K']));
  ok(near(tot(r)[0], 15 * 1.3), 'Ultrachips Tag: X1.3 Chips', tot(r));
  r = play(hand(['S_K']));
  ok(tot(r)[0] === 15 && tot(r)[1] === 1, 'the hand tags are used up');
  for (const k of ['tag_bunc_chips', 'tag_bunc_mult', 'tag_bunc_xmult', 'tag_bunc_xchips', 'tag_bunc_eternal', 'tag_bunc_perishable', 'tag_bunc_scattering', 'tag_bunc_hindered', 'tag_bunc_reactive', 'tag_bunc_rental']) {
    ok(P_TAGS[k].in_pool() === false, k + ' never in the tag pool');
  }
  // Filigree: the next Standard Pack is all exotic
  start('FILIGREE');
  add_tag(new Tag('tag_bunc_filigree'));
  openPack('p_standard_normal_1'); flush();
  ok(G.pack_cards.cards.every((c) => c.base.suit === 'bunc_Fleurons' || c.base.suit === 'bunc_Halberds' || c.ability.effect === 'Stone Card') && G.GAME.Exotic === true && !tagKeys().includes('tag_bunc_filigree'), 'Filigree: an all-exotic Standard Pack', G.pack_cards.cards.map((c) => c.base.suit));
  // sticker tags on the next shop joker
  const stick = { tag_bunc_eternal: (a) => a.eternal, tag_bunc_perishable: (a) => a.perishable, tag_bunc_scattering: (a) => a.bunc_scattering, tag_bunc_hindered: (a) => a.bunc_hindered, tag_bunc_reactive: (a) => a.bunc_reactive, tag_bunc_rental: (a) => a.rental };
  for (const [t, f] of Object.entries(stick)) {
    let hit = false;
    for (let i = 0; i < 8 && !hit; i++) {
      start('ST' + t + i);
      add_tag(new Tag(t));
      toShop(); flush();
      hit = !!(G.shop_jokers.cards[0] && f(G.shop_jokers.cards[0].ability)) && !tagKeys().includes(t);
    }
    ok(hit, t + ': the next shop joker gets it');
  }
  // Breaking / Arcade / Fluorescent in_pool rolls exist
  start('POOLS');
  ok(typeof P_TAGS.tag_bunc_breaking.in_pool() === 'boolean' && P_TAGS.tag_bunc_filigree.in_pool() === false, 'tag pool rolls');
  G.GAME.Exotic = true;
  ok(P_TAGS.tag_bunc_filigree.in_pool() === true, 'Filigree only once the Exotic System is on');
  for (const k of STATUS.tags) ok(filled(describeTag(k)), 'describe ' + k);
}

// ================================================================ blinds
/** Put the Boss on deck at the blind select (no skips, so no tag side effects). */
function toBossSelect() {
  const bs = G.GAME.round_resets.blind_states;
  bs.Small = 'Defeated'; bs.Big = 'Defeated'; bs.Boss = 'Select';
  G.GAME.blind_on_deck = 'Boss';
}
const fight = (boss, seed) => {
  start(seed || ('B' + boss), { boss, noBlind: true });
  toBossSelect();
  act({ type: 'select_blind' });
  clearHand();
  ok(G.GAME.blind.name === boss, 'fighting ' + boss);
};
{
  const B = (k) => P_BLINDS[k];
  // stats
  const mins = { paling: 3, umbrella: 2, tine: 2, swing: 3, miser: 2, gate: 1, flame: 3, mask: 2, bulwark: 2, knoll: 4, stone: 4, sand: 4, blade: 4, claw: 1, veil: 1, cadaver: 2, wind: 6, prince: 6, depths: 4, chasm: 4 };
  for (const [k, m] of Object.entries(mins)) ok(B('bl_bunc_' + k).boss.min === m && B('bl_bunc_' + k).mult === 2 && B('bl_bunc_' + k).dollars === 5, k + ': min ante ' + m + ', X2, $5');
  for (const k of ['final_crown', 'final_trident', 'final_tower', 'final_dagger', 'final_shield']) ok(B('bl_bunc_' + k).boss.showdown && B('bl_bunc_' + k).dollars === 8, k + ': finisher, $8');
  // The Paling: $1 per discarded card
  fight('bl_bunc_paling');
  let d0 = G.GAME.dollars;
  discard(hand(['S_2', 'S_3', 'S_4']));
  ok(G.GAME.dollars === d0 - 3, 'The Paling: -$3 for 3 discards', G.GAME.dollars - d0);
  // The Umbrella: after Play, the rest of the hand flips face down
  fight('bl_bunc_umbrella');
  const keep = hand(['S_5', 'H_6']);
  play(hand(['S_2']), { keepHand: true });
  ok(keep.every((c) => c.facing === 'back'), 'The Umbrella: the hand is face down after a play');
  G.GAME.blind.disable();
  ok(keep.every((c) => c.facing === 'front'), 'The Umbrella disabled: face up again');
  // The Tine: the most played rank (after a Boss) is debuffed
  fight('bl_bunc_tine');
  G.GAME.current_round.most_played_rank = 'King';
  const [tk, tq] = hand(['S_K', 'S_Q']); G.GAME.blind.debuff_card(tk); G.GAME.blind.debuff_card(tq);
  ok(tk.debuff && !tq.debuff, 'The Tine: Kings debuffed');
  ok(describeBlind('bl_bunc_tine').lines.join(' ').includes('King'), 'The Tine text names the rank', describeBlind('bl_bunc_tine').lines);
  // most played rank tally: tie -> highest rank
  start('TINETALLY', { boss: 'bl_wall' });
  play(hand(['S_5', 'H_5', 'D_5'])); play(hand(['S_9', 'H_9'])); play(hand(['C_9']));
  for (let i = 0; i < 3; i++) nextRound();
  // tally: 5 x3, 9 x3, 2 x3 (the three winning plays) -> the tie goes to the highest rank
  ok(G.GAME.current_round.most_played_rank === '9', 'The Tine tally: most played rank (tie -> highest)', [G.GAME.current_round.most_played_rank, G.GAME.played_ranks]);
  // The Swing: a play or a discard flips the hand; cards drawn later stay as flipped
  fight('bl_bunc_swing');
  const sw = hand(['S_5', 'H_6']);
  play(hand(['S_2']), { keepHand: true });
  ok(sw.every((c) => c.facing === 'back') && G.GAME.Swing === true, 'The Swing: a play flips the hand');
  ok(G.hand.cards.filter((c) => !sw.includes(c)).every((c) => c.facing === 'back'), 'The Swing: newly drawn cards come face down');
  discard([G.hand.cards.find((c) => !sw.includes(c))]);
  ok(sw.every((c) => c.facing === 'front') && G.GAME.Swing === false, 'The Swing: a discard flips them back');
  // The Miser: no shop after it
  fight('bl_bunc_miser');
  winRound(); act({ type: 'cash_out' });
  ok(G.STATE === STATES.BLIND_SELECT && !G.GAME.Miser, 'The Miser: straight to the blind select');
  // The Gate: selected cards can't be deselected
  fight('bl_bunc_gate');
  const [g1] = hand(['S_5', 'H_6']);
  act({ type: 'highlight', id: g1.sort_id }); act({ type: 'highlight', id: g1.sort_id });
  ok(g1.highlighted, 'The Gate: a selected card stays selected');
  // The Flame: enhanced cards are debuffed
  fight('bl_bunc_flame');
  const [fe, fb] = hand(['S_5', 'H_6']); fe.set_ability(P_CENTERS.m_bonus); G.GAME.blind.debuff_card(fe); G.GAME.blind.debuff_card(fb);
  ok(fe.debuff && !fb.debuff, 'The Flame: Bonus card debuffed, plain card not');
  // The Mask: the most played hand scores as the least played hand's base
  fight('bl_bunc_mask');
  G.GAME.current_round.most_played_poker_hand = 'Pair';
  G.GAME.current_round.least_played_poker_hand = 'Flush Five';
  let r = play(hand(['S_5', 'H_5']));
  ok(tot(r)[0] === 160 + 10 && tot(r)[1] === 16, 'The Mask: a Pair scores as Flush Five base (160 x 16)', tot(r));
  ok(filled(describeBlind('bl_bunc_mask')), 'The Mask text filled');
  // The Bulwark: playing the most played hand discards the hand
  fight('bl_bunc_bulwark');
  G.GAME.current_round.most_played_poker_hand = 'Pair';
  const rest = hand(['S_9', 'H_3', 'D_7']);
  play(hand(['S_5', 'H_5']), { keepHand: true });
  ok(rest.every((c) => c.area === G.discard), 'The Bulwark: the rest of the hand is discarded');
  // The Knoll: with more than $5, the first hand drawn is debuffed
  start('KNOLL', { boss: 'bl_bunc_knoll', noBlind: true });
  toBossSelect();
  G.GAME.dollars = 20;
  act({ type: 'select_blind' });
  ok(G.hand.cards.length === 8 && G.hand.cards.every((c) => c.debuff), 'The Knoll: the first hand drawn is debuffed');
  start('KNOLL2', { boss: 'bl_bunc_knoll', noBlind: true });
  toBossSelect(); G.GAME.dollars = 5; act({ type: 'select_blind' });
  ok(G.hand.cards.every((c) => !c.debuff), 'The Knoll: not with $5');
  // The Stone: +1X base per $10; The Sand: +1X per tag
  start('STONE', { boss: 'bl_bunc_stone', noBlind: true });
  toBossSelect(); G.GAME.dollars = 35;
  const base = G.GAME.blind.chips;
  act({ type: 'select_blind' });
  const per = G.GAME.blind.chips; // the blind's own chips after
  const { get_blind_amount } = await import('../../js/engine/core.js');
  const amt = get_blind_amount(G.GAME.round_resets.ante) * G.GAME.starting_params.ante_scaling;
  ok(near(G.GAME.blind.chips, amt * (3 + 2)), 'The Stone: $35 -> X5 base', [G.GAME.blind.chips, amt]);
  G.GAME.blind.disable();
  ok(near(G.GAME.blind.chips, amt * 2), 'The Stone disabled: back to X2');
  start('SAND', { boss: 'bl_bunc_sand', noBlind: true });
  ok(!P_BLINDS.bl_bunc_sand.in_pool(P_BLINDS.bl_bunc_sand), 'The Sand: not before ante 4 / with fewer than 2 tags');
  toBossSelect(); add_tag(new Tag('tag_economy')); add_tag(new Tag('tag_handy')); flush();
  const nt = G.GAME.tags.length;
  act({ type: 'select_blind' });
  ok(nt > 0 && near(G.GAME.blind.chips, amt * (nt + 2)), 'The Sand: +1X base per tag held', [nt, G.GAME.blind.chips / amt]);
  // The Blade: over 1.5X the blind -> the hand scores 0 and the blind is disabled
  fight('bl_bunc_blade');
  G.GAME.blind.chips = 100;
  G.GAME.chips = 0; G.GAME.current_round.hands_left = 3;
  act({ type: 'highlight', ids: hand(['S_A', 'H_A', 'D_A', 'C_A']).map((c) => c.sort_id) });
  r = act({ type: 'play' });
  const bt = r.events.find((e) => e.type === 'hand_total');
  ok(bt.total === 0 && G.GAME.blind.disabled && G.GAME.chips === 0, 'The Blade: 4 Aces over 150 -> 0 and disabled', bt);
  ok(filled(describeBlind('bl_bunc_blade')), 'The Blade text filled');
  // The Claw: discards go back into the deck
  fight('bl_bunc_claw');
  const cl = hand(['S_2', 'S_3']);
  discard(cl);
  ok(cl.every((c) => c.area === G.deck || c.area === G.hand), 'The Claw: discarded cards back in the deck', cl.map((c) => c.area && c.area.name));
  // The Veil: selected cards flip face down
  fight('bl_bunc_veil');
  const [v1] = hand(['S_5']);
  act({ type: 'highlight', id: v1.sort_id });
  ok(v1.facing === 'back' && v1.highlighted, 'The Veil: a selected card is face down');
  // The Cadaver: the hand must contain a face card
  fight('bl_bunc_cadaver');
  r = play(hand(['S_5', 'H_5']));
  ok(r.total.total === 0, 'The Cadaver: no face card -> no score');
  r = play(hand(['S_K', 'H_K']));
  ok(r.total.total > 0, 'The Cadaver: with a face card it scores');
  // The Wind: leftmost joker debuffed (from the first draw); The Prince: all jokers until the first hand
  start('WIND', { boss: 'bl_bunc_wind', noBlind: true });
  const w1 = add('j_joker'), w2 = add('j_joker');
  toBossSelect(); act({ type: 'select_blind' });
  ok(w1.debuff && !w2.debuff, 'The Wind: the leftmost joker is debuffed');
  act({ type: 'reorder', area: 'jokers', ids: [w2.sort_id, w1.sort_id] });
  ok(w2.debuff && !w1.debuff, 'The Wind: whichever joker is leftmost');
  start('PRINCE', { boss: 'bl_bunc_prince', noBlind: true });
  const p1 = add('j_joker'), p2 = add('j_joker');
  toBossSelect(); act({ type: 'select_blind' });
  ok(p1.debuff && p2.debuff, 'The Prince: all jokers debuffed');
  clearHand();
  G.GAME.blind.chips = 1e15;
  act({ type: 'highlight', ids: hand(['S_2']).map((c) => c.sort_id) }); act({ type: 'play' });
  ok(!p1.debuff && !p2.debuff && G.GAME.blind.disabled, 'The Prince: disabled after the first hand');
  // The Depths / The Chasm: after Play, a sticker tag
  fight('bl_bunc_depths');
  play(hand(['S_2']));
  ok(G.GAME.tags.some((t) => ['tag_bunc_eternal', 'tag_bunc_perishable', 'tag_bunc_scattering'].includes(t.key)), 'The Depths: an Eternal / Perishable / Scattering tag', tagKeys());
  fight('bl_bunc_chasm');
  play(hand(['S_2']));
  ok(G.GAME.tags.some((t) => ['tag_bunc_hindered', 'tag_bunc_reactive', 'tag_bunc_rental'].includes(t.key)), 'The Chasm: a Hindered / Reactive / Rental tag', tagKeys());
  // Chartreuse Crown: base suits debuffed; Indigo Tower: cards not played this ante debuffed
  fight('bl_bunc_final_crown');
  const [cr1, cr2, cr3] = hand(['S_5', 'bunc_FLEURON_5', 'H_2']); cr3.set_ability(P_CENTERS.m_stone);
  for (const c of [cr1, cr2, cr3]) G.GAME.blind.debuff_card(c);
  ok(cr1.debuff && !cr2.debuff && !cr3.debuff, 'Chartreuse Crown: base suits debuffed (not exotic, not Stone)');
  ok(!P_BLINDS.bl_bunc_final_crown.in_pool(), 'Chartreuse Crown: only with 10+ exotic cards');
  fight('bl_bunc_final_tower');
  const [it1, it2] = hand(['S_5', 'H_6']); it1.ability.played_this_ante = true;
  G.GAME.blind.debuff_card(it1); G.GAME.blind.debuff_card(it2);
  ok(!it1.debuff && it2.debuff, 'Indigo Tower: unplayed cards debuffed');
  // Vermilion Trident: +1X base per purchase this ante
  start('TRIDENT', { boss: 'bl_bunc_final_trident' });
  toShop(); G.GAME.dollars = 100; act({ type: 'reroll_shop' }); act({ type: 'reroll_shop' });
  ok(G.GAME.ante_purchases >= 2, 'Vermilion Trident: purchases counted', G.GAME.ante_purchases);
  // Magenta Dagger: a discard plays the cards and subtracts the score
  fight('bl_bunc_final_dagger');
  G.GAME.chips = 100; G.GAME.blind.chips = 1e15;
  const dh = G.GAME.current_round.hands_left, dd = G.GAME.current_round.discards_left;
  r = act({ type: 'highlight', ids: hand(['S_K']).map((c) => c.sort_id) }); r = act({ type: 'discard' });
  ok(r.ok && G.GAME.chips === 100 - 15 && G.GAME.current_round.hands_left === dh && G.GAME.current_round.discards_left === dd - 1, 'Magenta Dagger: a discard scores -15 and uses a discard', [G.GAME.chips, G.GAME.current_round.hands_left, G.GAME.current_round.discards_left]);
  // Turquoise Shield: score over a blind this ante adds to its requirement
  start('SHIELD', { boss: 'bl_bunc_final_shield' });
  G.GAME.chips = G.GAME.blind.chips + 500; G.GAME.current_round.hands_left = 1;
  act({ type: 'highlight', ids: hand(['S_2']).map((c) => c.sort_id) }); act({ type: 'play' });
  ok(G.GAME.overscore >= 500, 'Turquoise Shield: overscore banked', G.GAME.overscore);
  for (const k of STATUS.blinds) ok(filled(describeBlind(k)), 'describe ' + k);
}

// ====================================================== Trident's blind
{
  start('TRIDENT2', { boss: 'bl_bunc_final_trident', noBlind: true });
  G.GAME.ante_purchases = 3;
  toBossSelect(); act({ type: 'select_blind' });
  const { get_blind_amount } = await import('../../js/engine/core.js');
  const amt = get_blind_amount(G.GAME.round_resets.ante) * G.GAME.starting_params.ante_scaling;
  ok(near(G.GAME.blind.chips, amt * 5), 'Vermilion Trident: 3 purchases -> X5 base', G.GAME.blind.chips / amt);
}

// ============================================================== stickers
{
  start('STICKERS');
  const { apply_sticker } = await import('../../mods/bunco/stickers.js');
  // exclusive with each other and with Eternal
  const j = add('j_joker'); apply_sticker('bunc_scattering', j, true); apply_sticker('bunc_hindered', j, true);
  ok(j.ability.bunc_scattering && !j.ability.bunc_hindered, 'stickers are exclusive');
  const je = add('j_joker'); je.set_eternal(true); apply_sticker('bunc_reactive', je, true);
  ok(!je.ability.bunc_reactive, 'no sticker on an Eternal joker');
  clearJokers();
  // Scattering: removing it destroys a random adjacent non-Eternal joker
  const a = add('j_joker'), s = add('j_joker'), b = add('j_joker');
  apply_sticker('bunc_scattering', s, true);
  act({ type: 'sell', id: s.sort_id });
  ok(s.removed && ((a.removed && !b.removed) || (!a.removed && b.removed)), 'Scattering: a neighbour goes with it', [a.removed, b.removed]);
  clearJokers();
  const e1 = add('j_joker'), s2 = add('j_joker'), e2 = add('j_joker');
  e1.set_eternal(true); e2.set_eternal(true); apply_sticker('bunc_scattering', s2, true);
  act({ type: 'sell', id: s2.sort_id });
  ok(!e1.removed && !e2.removed, 'Scattering: Eternal neighbours are safe');
  clearJokers();
  // Hindered: sold -> paid, stays (and works) until the end of the round, then gone; can't be sold twice
  const h = add('j_joker'); apply_sticker('bunc_hindered', h, true);
  const d0 = G.GAME.dollars, sc = h.sell_cost;
  act({ type: 'sell', id: h.sort_id });
  ok(G.GAME.dollars === d0 + sc && !h.removed && h.area === G.jokers && h.sell_cost === 0, 'Hindered: paid, still here');
  ok(!act({ type: 'sell', id: h.sort_id }).ok, 'Hindered: cannot be sold again');
  let r = play(hand(['S_K']));
  ok(tot(r)[1] === 5, 'Hindered: a sold Hindered joker still scores');
  winRound(); flush();
  ok(h.removed, 'Hindered: gone at the end of the round');
  // Reactive: debuffed unless a blind was skipped this ante
  start('REACT', { noBlind: true });
  const rj = add('j_joker'); apply_sticker('bunc_reactive', rj, true); act({ type: 'select_blind' }); flush();
  ok(rj.debuff, 'Reactive: debuffed with no skip this ante');
  start('REACT2', { noBlind: true });
  const rj2 = add('j_joker'); apply_sticker('bunc_reactive', rj2, true);
  act({ type: 'skip_blind' }); flush();
  ok(!rj2.debuff, 'Reactive: fine after a skip');
  ok(describe(rj2).badges.some((x) => x.key === 'bunc_reactive') && toView().areas.jokers[0].mod_stickers.length === 1, 'Reactive: badge + sticker art in the view');
}

// ================================================================ stakes
{
  const st = P_BLINDS && (await import('../../js/engine/core.js')).P_STAKES;
  ok(st.stake_bunc_cyan && st.stake_bunc_pink && st.stake_bunc_magenta, 'three stakes');
  newRun({ seed: 'CYAN', back: 'b_red', mods: ['bunco'], stake: 'stake_bunc_cyan' });
  ok(G.GAME.stake === 7 && G.GAME.modifiers.enable_scattering_in_shop && !G.GAME.modifiers.enable_hindered_in_shop && G.GAME.modifiers.enable_perishables_in_shop, 'Cyan: Orange + Scattering jokers');
  newRun({ seed: 'PINK', back: 'b_red', mods: ['bunco'], stake: 'stake_bunc_pink' });
  ok(G.GAME.modifiers.enable_scattering_in_shop && G.GAME.modifiers.enable_hindered_in_shop && !G.GAME.modifiers.enable_reactive_in_shop, 'Pink: + Hindered');
  newRun({ seed: 'MAGENTA', back: 'b_red', mods: ['bunco'], stake: 'stake_bunc_magenta' });
  ok(G.GAME.modifiers.enable_scattering_in_shop && G.GAME.modifiers.enable_hindered_in_shop && G.GAME.modifiers.enable_reactive_in_shop && !G.GAME.modifiers.enable_rentals_in_shop, 'Magenta: + Reactive');
  newRun({ seed: 'GOLD', back: 'b_red', mods: ['bunco'], stake: 8 });
  ok(G.GAME.modifiers.enable_reactive_in_shop && G.GAME.modifiers.enable_rentals_in_shop, 'Gold (Bunco takeover): applies Magenta too');
  newRun({ seed: 'GOLD', back: 'b_red', mods: [], stake: 8 });
  ok(!G.GAME.modifiers.enable_reactive_in_shop, 'Gold without Bunco: vanilla');
  // the shop rolls the stickers (and a stickered joker skips the Eternal roll)
  let seen = 0, both = 0;
  for (let i = 0; i < 20; i++) {
    newRun({ seed: 'MAG' + i, back: 'b_red', mods: ['bunco'], stake: 'stake_bunc_magenta' });
    G.E_MANAGER.flush();
    act({ type: 'select_blind' }); toShop();
    for (const c of G.shop_jokers.cards) {
      if (c.ability.bunc_scattering || c.ability.bunc_hindered || c.ability.bunc_reactive) { seen++; if (c.ability.eternal) both++; }
    }
  }
  ok(seen > 0 && both === 0, 'Magenta shops roll Bunco stickers, never with Eternal', [seen, both]);
}

// ============================================================ reworks
{
  start('REWORK', { noBlind: true });
  ok(P_CENTERS.c_lovers.config.max_highlighted === 2, 'rework: The Lovers selects 2');
  // Luchador: Breaking Tag
  const lu = add('j_luchador');
  act({ type: 'sell', id: lu.sort_id }); flush();
  ok(tagKeys().includes('tag_bunc_breaking'), 'rework: Luchador gives a Breaking Tag', tagKeys());
  ok(describe(add('j_luchador')).lines.join(' ').includes('Breaking Tag'), 'rework: Luchador text');
  // Red Card: +3 x picks left per skipped pack
  const rc = add('j_red_card');
  act({ type: 'select_blind' }); clearHand();
  openPack('p_arcana_mega_1');
  const left = G.GAME.pack_choices;
  act({ type: 'skip_booster' }); flush();
  ok(left === 2 && rc.ability.mult === 6, 'rework: Red Card +3 x 2 choices skipped', [left, rc.ability.mult]);
  // Boss Tag: a free Blind Pack
  start('BOSSTAG', { noBlind: true });
  add_tag(new Tag('tag_boss'));
  act({ type: 'skip_blind' }); flush();
  ok(G.STATE === STATES.MOD_PACK && /^p_bunc_blind_/.test(G.GAME.pack_center), 'rework: Boss Tag opens a Blind Pack', G.GAME.pack_center);
  // D6 Tag: a free reroll in the next shop
  start('D6');
  add_tag(new Tag('tag_d_six'));
  toShop(); flush();
  ok(G.GAME.current_round.free_rerolls === 1 && G.GAME.current_round.reroll_cost === 0, 'rework: D6 Tag = 1 free reroll');
  act({ type: 'reroll_shop' });
  ok(G.GAME.current_round.reroll_cost > 0, 'rework: then rerolls cost again');
  // Wheel of Fortune / Aura can give Glitter
  let glit = 0;
  start('WHEEL');
  for (let i = 0; i < 200; i++) { const e = poll_edition('aura', null, true, true); if (e && e.bunc_glitter) glit++; }
  ok(glit > 20, 'rework: Aura / Wheel roll Glitter (9 of 49)', glit);
  ok(describe(add_joker('c_wheel_of_fortune')).lines.join(' ').includes('Glitter'), 'rework: Wheel of Fortune text');
  // option off: vanilla behaviour while Bunco is on
  start('NOREWORK', { noBlind: true, modOptions: { bunco: { gameplay_reworks: false } } });
  ok(P_CENTERS.c_lovers.config.max_highlighted === 1, 'option off: The Lovers 1');
  add_tag(new Tag('tag_boss'));
  const boss0 = G.GAME.round_resets.blind_choices.Boss;
  act({ type: 'skip_blind' }); flush();
  ok(G.STATE !== STATES.MOD_PACK, 'option off: Boss Tag rerolls the boss (no pack)');
  glit = 0;
  for (let i = 0; i < 200; i++) { const e = poll_edition('aura', null, true, true); if (e && e.bunc_glitter) glit++; }
  ok(glit === 0, 'option off: no Glitter from Aura');
  const lu2 = add('j_luchador');
  ok(!describe(lu2).lines.join(' ').includes('Breaking'), 'option off: vanilla Luchador text');
  // Bunco off (the next run): The Lovers back to 1
  newRun({ seed: 'OFF2', back: 'b_red', mods: [] });
  ok(P_CENTERS.c_lovers.config.max_highlighted === 1, 'Bunco off: The Lovers back to 1');
  // fixed sprites / badges
  start('SPRITES');
  const jg = add('j_juggler');
  ok(toView().areas.jokers.find((x) => x.id === jg.sort_id).atlas === 'bunco_resprites_jokers', 'fixed_sprites: Juggler drawn from Bunco\'s resprites');
  start('SPRITES2', { modOptions: { bunco: { fixed_sprites: false, fixed_badges: true } } });
  const jg2 = add('j_juggler');
  ok(!toView().areas.jokers.find((x) => x.id === jg2.sort_id).atlas, 'fixed_sprites off: vanilla art');
  ok(describe(add_joker('c_pluto')).badges[0].label === 'Planet', 'fixed_badges: Pluto is a Planet');
}

// ================================================ Fiendish + Bounty Hunter
{
  // one walk over the jokers in order (the Lua's single loop): Bounty Hunter then Fiendish -> ($5-1) doubled
  start('FIENDBH');
  add('j_bunc_bounty_hunter'); const fi = add('j_bunc_fiendish');
  const { ease_dollars } = await import('../../js/engine/core.js');
  let seen = new Set();
  for (let i = 0; i < 12; i++) { const d = G.GAME.dollars; ease_dollars(5); flush(); seen.add(G.GAME.dollars - d); }
  ok([...seen].every((x) => x === 8 || x === 1), 'Bounty Hunter then Fiendish: 8 or 1', [...seen]);
  act({ type: 'reorder', area: 'jokers', ids: [fi.sort_id, G.jokers.cards[0].sort_id] });
  seen = new Set();
  for (let i = 0; i < 12; i++) { const d = G.GAME.dollars; ease_dollars(5); flush(); seen.add(G.GAME.dollars - d); }
  ok([...seen].every((x) => x === 9 || x === 0), 'Fiendish then Bounty Hunter: 9 or 0', [...seen]);
}

// =================================================== every center described
{
  start('DESCRIBE');
  G.GAME.Exotic = true;
  for (const k of [...STATUS.jokers, ...STATUS.tarots, ...STATUS.planets, ...STATUS.spectrals, ...STATUS.polyminoes, ...STATUS.boosters, ...STATUS.vouchers, ...STATUS.editions, ...STATUS.enhancements]) {
    const d = describeCenter(k);
    ok(d && d.name && filled(d), 'describeCenter ' + k, d && d.lines);
    if (P_CENTERS[k].set === 'Joker' || P_CENTERS[k].consumeable) {
      const c = add_joker(k); flush();
      const dl = describe(c);
      ok(dl && filled(dl) && dl.lines.length > 0, 'describe ' + k, dl && dl.lines);
      c.remove(); flush();
    }
  }
  for (const k of STATUS.stakes) ok(filled(describeCenter(k) || { lines: [] }), 'stake ' + k);
}

done();
