// Þe Autumn Circus (micatro/mods/autumncircus): off -> nothing (and AutumnMoodMechanics alone -> only AMM's
// content); on -> every system item fired through real act() plays with the mod's numbers: the 10 Stamps, the
// 12 Aspects, 4 enhancements, the Gilded edition, 2 tags, 2 blinds, the Culmination stake, the Option Select
// pack, 12 vouchers, 9 decks, overrides.lua's rules; registration counts; describe() fills every #n#; the
// feature-gated Suits / Graveyard tabs. Jokers / Oddities / tarots-planets-spectrals have their own suites
// (autumncircus_jokers_{a,b}_test, autumncircus_oddities_test, autumncircus_consumables_test).
//   node micatro/tests/mods/autumncircus_test.mjs
import {
  start, clearHand, hand, add, clearJokers, clearConsumables, play, discard, use, winRound, nextRound, toShop, destroy, msgs, tot, filled,
  ok, near, flush, done, G, P_CENTERS, P_CARDS, act, STATES, describe, describeCenter, AMM,
} from './autumncircus_helpers.mjs';
import { P_CENTER_POOLS, P_SEALS, P_TAGS, P_BLINDS, P_STAKES, add_joker, create_card, probability_vars, Card } from '../../js/engine/core.js';
import { newRun, pump } from '../../js/engine/run.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { describeBlind, describeTag, describeBack } from '../../js/engine/describe.js';
import { toView } from '../../js/engine/view.js';
import { MODS, ATLASES } from '../../js/mods/registry.js';
import { loadMods } from '../../js/mods/index.js';
import { STATUS } from '../../mods/autumncircus/index.js';

const cons = (key) => { const c = add_joker(key); flush(); return c; };
const P = (n) => { G.GAME.probabilities.normal = n; };
/** From the blind select: fight this boss now. */
function fightBoss(key) {
  const rr = G.GAME.round_resets;
  rr.blind_states.Small = 'Defeated'; rr.blind_states.Big = 'Defeated'; rr.blind_states.Boss = 'Select';
  rr.blind_choices.Boss = key; G.GAME.blind_on_deck = 'Boss';
  act({ type: 'select_blind' });
  clearHand();
}

// ===================================================================== off
{
  start('TACOFF', { mods: [] });
  ok(!Object.values(P_CENTER_POOLS).some((p) => p.some((c) => c.mod === 'autumncircus')), 'off: no TAC center in any pool');
  ok(!P_CENTER_POOLS.Stamp && !P_CENTER_POOLS.Tag.some((t) => t.mod === 'autumncircus') && !Object.keys(P_SEALS).some((k) => P_CENTER_POOLS.Seal.includes(P_SEALS[k]) && P_SEALS[k].mod), 'off: no stamps / tags');
  start('TACAMMONLY', { mods: ['autumnmood'] });
  ok(!Object.values(P_CENTER_POOLS).some((p) => p.some((c) => c.mod === 'autumncircus')) && AMM.active_aspects().length === 0 && !P_CENTER_POOLS.Stamp, 'AMM alone: no TAC content (no stamps / aspects / cards)');
  ok(G.GAME.oddity_rate === 0, 'AMM alone: no Oddities, so no Oddity shop rate');
}

// ===================================================================== on
start('TACON');
{
  ok(G.GAME.mods.join() === 'autumnmood,autumncircus', 'TAC pulls in AMM');
  ok(STATUS.stamps.length === 10 && STATUS.aspects.length === 12 && STATUS.enhancements.length === 4 && STATUS.editions.length === 1, '10 stamps / 12 aspects / 4 enhancements / 1 edition', STATUS);
  ok(STATUS.vouchers.length === 12 && STATUS.decks.length === 9 && STATUS.tags.length === 2 && STATUS.blinds.length === 2 && STATUS.stakes.length === 1 && STATUS.boosters.length === 1, '12 vouchers / 9 decks / 2 tags / 2 blinds / 1 stake / 1 pack');
  ok(P_CENTER_POOLS.Stamp.length === 10 && !P_CENTER_POOLS.Seal.some((s) => s.mod === 'autumncircus'), 'stamps pool apart from seals');
  ok(G.GAME.oddity_rate === 3 && P_CENTER_POOLS.Oddity.length > 0, 'Oddities registered: shop rate 3');
  ok(ATLASES.thac_LooksLikeTheJokers.src.endsWith('/autumncircus/assets/2x/LooksLikeTheJokers.png') && ATLASES.thac_Emojiokers.px === 84 && ATLASES.thac_ShowdownThrowdown.frames === 21, 'atlases');
  ok(MODS.autumncircus.optional_features.unscored && MODS.autumncircus.optional_features.amm_suit_levels && MODS.autumncircus.optional_features.amm_graveyard, 'optional features: unscored, suit levels, graveyard');
  const v = toView();
  ok(v.mod_runinfo_tabs && v.mod_runinfo_tabs.some((t) => t.key === 'amm_suits') && v.mod_deck_tabs && v.mod_deck_tabs.some((t) => t.key === 'amm_graveyard'), 'TAC turns on the Suits and Graveyard tabs');
  const bad = [];
  for (const k of [...STATUS.enhancements, ...STATUS.editions, ...STATUS.vouchers, ...STATUS.boosters]) if (!filled(describeCenter(k))) bad.push(k);
  for (const k of STATUS.decks) { const d = describeBack(k); if (!d || !d.lines.length || d.lines.some((l) => /#\d+#/.test(l))) bad.push(k); }
  for (const k of STATUS.tags) { const d = describeTag(k); if (!d.lines.length || d.lines.some((l) => /#\d+#/.test(l))) bad.push(k); }
  for (const k of STATUS.blinds) { const d = describeBlind(k); if (!d.lines.length) bad.push(k); }
  ok(!bad.length, 'describe(): every enhancement / edition / voucher / pack / deck / tag / blind text filled', bad);
}

// ================================================================== stamps
{
  start('TACSTAMP');
  const hs = G.hand.config.card_limit, cs = G.consumeables.config.card_limit;
  const j = cons('j_joker');
  j.set_seal('thac_jimbo'); flush();
  ok(G.hand.config.card_limit === hs + 1, "Jimbo's Stamp: +1 hand size");
  j.set_seal('thac_todd'); flush();
  ok(G.hand.config.card_limit === hs && G.GAME.starting_params.play_limit === 6, "Todd's Stamp: +1 play limit (Jimbo's undone)");
  const six = hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_6', 'H_9']);
  act({ type: 'highlight', ids: six.map((c) => c.sort_id) });
  ok(G.hand.highlighted.length === 6, 'six cards can be selected');
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  ok(act({ type: 'play' }).ok, '... and played');
  clearHand();
  j.set_seal('thac_steven'); flush();
  ok(G.GAME.starting_params.play_limit === 5 && G.GAME.starting_params.discard_limit === 6, "Steven's Stamp: +1 discard limit");
  j.set_seal('thac_andy'); flush();
  ok(G.consumeables.config.card_limit === cs + 1 && G.GAME.starting_params.discard_limit === 5, "Andy's Stamp: +1 consumable slot");
  j.set_seal(null); flush();
  ok(G.consumeables.config.card_limit === cs, 'stamp removed: back to normal');
  // Gros Michel stamp: +15 Mult; 1 in 40 to fall off at end of round
  j.set_seal('thac_gros_michel');
  let r = play(hand(['H_A']));
  ok(tot(r).join() === '16,20,320', 'Gros Michel Stamp: +15 Mult (then the Joker +4)', tot(r));
  P(1000);
  r = winRound(); flush();
  ok(!j.seal && msgs(r.events).includes('Removed!'), 'Gros Michel Stamp: removed at end of round (1 in 40, forced)');
  P(1);
  // Sock and Buskin: the joker's effect happens once more
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  j.set_seal('thac_sock_and_buskin');
  r = play(hand(['H_A']));
  ok(tot(r).join() === '16,9,144', 'Sock and Buskin Stamp: Joker +4 Mult twice', tot(r));
  // Chaos' Stamp: $4 when the round is won
  j.set_seal('thac_chaos');
  const d0 = G.GAME.dollars;
  winRound(); flush();
  ok(G.GAME.dollars === d0 + 4, "Chaos' Stamp: +$4 on a won round", G.GAME.dollars - d0);
  // Mr. Bones' Stamp: blinds 15% weaker (two -> 0.85^2)
  act({ type: 'cash_out' }); act({ type: 'next_round' });
  j.set_seal('thac_mr_bones');
  const j2 = cons('j_joker'); j2.set_seal('thac_mr_bones');
  act({ type: 'select_blind' });
  ok(G.GAME.blind.chips === Math.floor(300 * 4 * (0.85 * 0.85)), "Mr. Bones' Stamps: The Wall (1200) x 0.85 x 0.85", G.GAME.blind.chips);
  // Dusk: on the final hand a joker's listed probabilities have a denominator of at most 1
  j.set_seal('thac_dusk');
  G.GAME.current_round.hands_left = 2;
  ok(probability_vars(j, 1, 4).join() === '1,4', 'Dusk Stamp: normal probabilities before the final hand');
  G.GAME.current_round.hands_left = 1;
  ok(probability_vars(j, 1, 4).join() === '1,1', 'Dusk Stamp: 1 in 1 on the final hand');
  ok(probability_vars(j2, 1, 4).join() === '1,4', 'only the stamped joker');
  // the stamp price (+$2 unless Stamp Coupon)
  const plain = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_joker'); plain.set_cost();
  const st = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_joker'); st.set_seal('thac_jimbo', true);
  ok(st.cost === plain.cost + 2, 'a stamped joker costs $2 more', [st.cost, plain.cost]);
  G.GAME.used_vouchers.v_thac_stamp_coupon = true;
  st.set_cost();
  ok(st.cost === plain.cost, 'Stamp Coupon: no stamp surcharge');
  const d = describe(j);
  ok(d.badges.some((b) => b.key === 'thac_dusk_stamp' && b.label === 'Dusk Stamp') && d.info.some((i) => i.name === 'Dusk Stamp' && i.lines.length), 'describe: Dusk Stamp badge + text');
}
{
  // Blueprint Stamp: 1 in 10 on a reroll -> another copy of the joker in the shop
  start('TACBPS');
  const j = cons('j_greedy_joker'); j.set_seal('thac_blueprint');
  toShop();
  P(1000);
  G.GAME.dollars = 100;
  const r = act({ type: 'reroll_shop' });
  ok(G.shop_jokers.cards.some((c) => c.config.center.key === 'j_greedy_joker') && msgs(r.events).includes('Manufactured!'), 'Blueprint Stamp: a copy appears on reroll');
}
{
  // Stamp Savvy: shop / pack jokers can come with stamps (3 in 10)
  start('TACSAVVY');
  G.GAME.used_vouchers.v_thac_stamp_savvy = true;
  let n = 0, total = 400;
  for (let i = 0; i < total; i++) { const c = create_card('Joker', G.shop_jokers, null, null, null, null, null, 'sv' + i); if (c.seal) { n++; ok(P_SEALS[c.seal].set === 'Stamp', 'a Savvy stamp is a Stamp'); } }
  ok(n > total * 0.2 && n < total * 0.4, 'Stamp Savvy: about 3 in 10 jokers stamped', n);
}

// ================================================================== aspects
const asp = (key, k) => { const c = hand([key])[0]; AMM.set_aspect(c, 'thac_' + k, true); return c; };
{
  start('TACASP');
  // Heart X3: K of Hearts -> 5+10 = 15 x 3
  let r = play([asp('H_K', 'heart')]);
  ok(tot(r).join() === '15,3,45', 'Heart: X3 Mult', tot(r));
  // Rage: +300 chips on the first hand of the round, +60 after
  G.GAME.current_round.hands_played = 0;
  r = play([asp('S_2', 'rage')]);
  ok(tot(r).join() === '307,1,307', 'Rage: +300 Chips on the first hand', tot(r));
  r = play([asp('S_2', 'rage')]);
  ok(tot(r).join() === '67,1,67', 'Rage: +60 Chips after', tot(r));
  // Space: X(1 + 0.5 x held cards): 4 held -> X3
  hand(['C_3', 'C_4', 'C_5', 'C_7']);
  r = play([asp('S_9', 'space')], { keepHand: true });
  ok(tot(r).join() === '14,3,42', 'Space: X0.5 per held card (4 held -> X3)', tot(r));
  clearHand();
  // Blood: +80 chips per held card sharing a suit, +25 mult per held card sharing a rank
  hand(['S_4', 'S_7', 'H_9', 'D_9']);
  r = play([asp('S_9', 'blood')], { keepHand: true });
  // shares suit with S_4, S_7 -> +160; rank with H_9, D_9 -> +50; 5+9+160 = 174, 1+50 = 51
  ok(tot(r).join() === '174,51,8874', 'Blood: +80 chips per suit match, +25 Mult per rank match', tot(r));
  clearHand();
  // Hope: retrigger once; 3 times on the final hand
  r = play([asp('S_5', 'hope')]);
  ok(tot(r).join() === '15,1,15', 'Hope: retriggers the card once', tot(r));
  G.GAME.current_round.hands_left = 1;
  act({ type: 'highlight', ids: [asp('S_5', 'hope').sort_id] });
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  r = act({ type: 'play' });
  const t = r.events.find((e) => e.type === 'hand_total');
  ok(t && t.chips === 25, 'Hope: retriggers 3 times on the final hand', t);
}
{
  start('TACASP2');
  // Life: 1 in 3 for +2 hands (forced)
  P(1000);
  let h0 = G.GAME.current_round.hands_left;
  play([asp('S_5', 'life')], { left: h0 });
  ok(G.GAME.current_round.hands_left === h0 - 1 + 2, 'Life: +2 Hands when scored (1 in 3, forced)');
  P(1);
  // Time: +1 discard when scored or discarded
  const d0 = G.GAME.current_round.discards_left;
  play([asp('S_5', 'time')]);
  ok(G.GAME.current_round.discards_left === d0 + 1, 'Time: +1 Discard when scored');
  const tc = asp('S_6', 'time');
  const d1 = G.GAME.current_round.discards_left;
  discard([tc]);
  ok(G.GAME.current_round.discards_left === d1, 'Time: +1 Discard when discarded (the discard used is refunded)');
  // Doom: Blind -25% when scored
  G.GAME.chips = 0; G.GAME.blind.chips = 1000;
  G.GAME.current_round.hands_left = 3;
  act({ type: 'highlight', ids: [asp('S_5', 'doom').sort_id] });
  act({ type: 'play' });
  ok(G.GAME.blind.chips === 750, 'Doom: Blind requirement -25%', G.GAME.blind.chips);
  clearHand();
  // Light: $5 and every joker AND consumable +$2 sell value (FIX: the Lua forgot consumables)
  const j = cons('j_joker');
  const c = cons('c_tower');
  const js = j.sell_cost, csell = c.sell_cost, m0 = G.GAME.dollars;
  play([asp('S_5', 'light')]);
  ok(G.GAME.dollars === m0 + 5 && j.sell_cost === js + 2, 'Light: $5 and the jokers +$2 sell value');
  ok(c.sell_cost === csell + 2, 'fix: Light also raises consumables (its text: "each Joker and consumable")', [c.sell_cost, csell]);
  clearJokers(); clearConsumables();
  // Mind: while held, +X0.3 per hand played
  const m = asp('S_K', 'mind');
  play(hand(['H_2']), { keepHand: true });
  ok(near(m.ability.perma_h_x_mult, 0.3), 'Mind: gains X0.3 (held) each hand played while held');
  const r = play(hand(['H_2']), { keepHand: true });
  // second hand: held Mind card now X1.6 (gains first, before scoring): 7 x 1.6
  ok(near(m.ability.perma_h_x_mult, 0.6) && near(tot(r)[1], 1.6), 'Mind: held X Mult = 1 + gains', tot(r));
  clearHand();
  // Void (FIX): held in hand, it scores as if played
  const vc = asp('S_K', 'void');
  const r2 = play(hand(['H_2']), { keepHand: true });
  // H_2 scores 2; the held King of Spades scores as played: +10 -> 5 + 2 + 10 = 17
  ok(tot(r2).join() === '17,1,17', 'fix: Void scores the held card as if played', tot(r2));
  void vc;
  clearHand();
  // Breath: a Breath card doesn't count against selection limits (6 selected, 6 played)
  const cards = [asp('S_2', 'breath'), ...hand(['S_3', 'S_4', 'S_5', 'S_6', 'H_8'])];
  act({ type: 'highlight', ids: cards.map((x) => x.sort_id) });
  ok(G.hand.highlighted.length === 6, 'Breath: six cards selectable');
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15; G.GAME.current_round.hands_left = 3;
  ok(act({ type: 'play' }).ok, 'Breath: and playable');
  clearHand();
  const tw = cons('c_strength');
  const sel = [asp('S_2', 'breath'), ...hand(['S_3', 'S_4'])];
  act({ type: 'highlight', ids: sel.map((x) => x.sort_id) });
  ok(tw.can_use_consumeable(), 'Breath: Strength (2 max) applies to 2 cards + a Breath card');
  const desc = describe(sel[0]);
  ok(desc.badges.some((b) => b.key === 'thac_breath_aspect' && b.label === 'Breath') && desc.info.some((i) => i.lines.length), 'describe: aspect badge + text');
}

// ============================================================= enhancements
{
  start('TACENH');
  // Star: Blind -10% when scored
  G.GAME.chips = 0; G.GAME.blind.chips = 1000; G.GAME.current_round.hands_left = 3;
  act({ type: 'highlight', ids: hand(['S_5'], 'm_thac_star').map((c) => c.sort_id) });
  act({ type: 'play' });
  ok(G.GAME.blind.chips === 900, 'Star Card: Blind -10%', G.GAME.blind.chips);
  clearHand();
  // Bone: +1 Mult per graveyard card
  for (const c of hand(['D_2', 'D_3', 'D_4'])) destroy(c);
  let r = play(hand(['S_5'], 'm_thac_bone'));
  ok(tot(r).join() === '10,4,40', 'Bone Card: +1 Mult per graveyard card (3)', tot(r));
  // Jewel: $5 when scored, always scores, no rank / suit
  const jw = hand(['S_5'], 'm_thac_jewel')[0];
  const m0 = G.GAME.dollars;
  r = play([...hand(['H_A']), jw]);
  ok(G.GAME.dollars === m0 + 5 && tot(r)[0] === 16, 'Jewel Card: $5 when scored (always scores, no chips)', [G.GAME.dollars - m0, tot(r)]);
  ok(AMM.has_no_rank(jw) && AMM.has_no_suit(jw) && !jw.is_suit('Spades'), 'Jewel Card: no rank or suit');
  ok(filled(describe(jw)), 'Jewel description filled');
}
{
  // Soulbound: back from the graveyard after a Boss, +X1 Mult permanently
  start('TACSOUL', { noBlind: true });
  fightBoss('bl_wall');
  const sb = hand(['S_5'], 'm_thac_soulbound')[0];
  destroy(sb);
  const ghost = G.graveyard[0];
  ok(ghost && ghost.config.center.key === 'm_thac_soulbound', 'a Soulbound card in the graveyard');
  winRound(); flush();
  ok(!G.graveyard.includes(ghost) && G.playing_cards.includes(ghost) && ghost.ability.perma_x_mult === 1, 'Soulbound: returns after the Boss with +X1 Mult', ghost.ability.perma_x_mult);
}
{
  // Undying Deck (FIX): everything comes back after a Boss
  start('TACUNDY', { noBlind: true, back: 'b_thac_undying_deck' });
  ok(G.GAME.modifiers.thac_undying_deck === true, 'Undying Deck sets its modifier');
  fightBoss('bl_wall');
  for (const c of hand(['S_5', 'H_6'])) destroy(c);
  ok(G.graveyard.length === 2, 'two cards in the graveyard');
  winRound(); flush();
  ok(G.graveyard.length === 0 && G.playing_cards.some((c) => c.base.value === '5' && c.base.suit === 'Spades') && G.playing_cards.some((c) => c.base.value === '6' && c.base.suit === 'Hearts'), 'fix: Undying Deck brings every graveyard card back after a Boss', G.graveyard.map((c) => c.base.value));
}

// ================================================================== edition
{
  start('TACGILD');
  const j = cons('j_joker');
  const s0 = j.sell_cost;
  const c = hand(['S_5'])[0];
  c.set_edition({ thac_gilded: true }, true, true);
  ok(c.edition.thac_gilded && c.edition.extra.gold === 3, 'Gilded edition on a playing card');
  play([c]);
  ok(j.sell_cost === s0 + 3, 'Gilded playing card: a random joker gains $3 of sell value when scored');
  const g = cons('j_greedy_joker'); g.set_edition({ thac_gilded: true }, true, true);
  const gs = g.sell_cost;
  winRound(); flush();
  ok(g.sell_cost === gs + 3, 'Gilded joker: +$3 sell value at end of round');
  const ed = P_CENTERS.e_thac_gilded;
  ok(ed.in_shop && ed.weight === 20 && ed.extra_cost === 4 && ed.shader_fs.includes('gilded') && ed.shader_overlay, 'Gilded: in shop, weight 20, +$4, its shader drawn over the card');
  const d = describe(g);
  ok(d.badges.some((b) => /gilded/.test(b.key)), 'describe: Gilded badge');
}

// ===================================================================== tags
{
  start('TACTAGS');
  toShop();
  add_tag(new Tag('tag_thac_gilded'));
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand(); winRound(); flush();
  act({ type: 'cash_out' });
  const gj = G.shop_jokers.cards.find((c) => c.edition && c.edition.thac_gilded);
  ok(gj && gj.cost === 0, 'Gilded Tag: the next shop joker is Gilded and free', gj && [gj.cost]);
  ok(!G.GAME.tags.some((t) => t.key === 'tag_thac_gilded'), 'the tag is used up');
  act({ type: 'next_round' });
  const before = G.GAME.tags.length;
  add_tag(new Tag('tag_thac_chaos'));
  for (const t of G.GAME.tags.slice()) t.apply_to_run({ type: 'immediate' });
  pump();
  const keys = G.GAME.tags.map((t) => t.key);
  ok(!keys.includes('tag_thac_chaos'), 'Chaos Tag: used');
  ok(G.GAME.tag_tally >= before + 4, 'Chaos Tag: three more tags created', G.GAME.tag_tally);
}

// =================================================================== blinds
{
  start('TACJERA', { noBlind: true });
  P(1000);
  fightBoss('bl_thac_jera');
  ok(G.GAME.blind.name === 'bl_thac_jera' && G.GAME.blind.dollars === 0, 'Jera: a boss with no reward');
  const n0 = G.playing_cards.length;
  const cards = hand(['S_5', 'H_6']);
  play(cards, { keepHand: true });
  ok(G.playing_cards.length === n0 + 4 && G.hand.cards.filter((c) => c.base.suit === 'Spades' && c.base.value === '5').length >= 1, 'Jera: copies played cards into the hand (1 in 4, forced)', [G.playing_cards.length - n0]);
  P(1);
  ok(describeBlind('bl_thac_jera').lines.join(' ').includes('copy played cards'), 'Jera text');
}
{
  start('TACTHAC', { noBlind: true });
  ok(P_BLINDS.bl_thac_thac.boss.showdown && P_BLINDS.bl_thac_thac.mult === 3 && P_BLINDS.bl_thac_thac.dollars === 8, 'Þe Autumn Circus: a showdown boss, X3, $8');
  destroy(hand(['S_7'])[0]);
  fightBoss('bl_thac_thac');
  const [seven, eight] = hand(['H_7', 'H_8']);
  G.GAME.blind.debuff_card(seven); G.GAME.blind.debuff_card(eight);
  ok(seven.debuff && !eight.debuff, 'Þe Autumn Circus: debuffs cards whose rank is in the graveyard');
}

// ==================================================================== stake
{
  newRun({ seed: 'TACSTAKE', mods: ['autumncircus'], stake: 'stake_thac_culmination' });
  ok(G.GAME.stake === 8 && G.GAME.modifiers.enable_rentals_in_shop && G.GAME.modifiers.inflation, 'Culmination: plays as Gold stake + Inflation');
}

// ============================================================ option select
{
  start('TACOPT');
  ok(P_CENTERS.p_thac_option_select.config.extra === 4 && P_CENTERS.p_thac_option_select.config.choose === 1 && P_CENTERS.p_thac_option_select.cost === 13, 'Option Select: 4 cards, choose 1, $13');
  toShop();
  const pk = create_card('Booster', G.shop_booster, null, null, null, null, 'p_thac_option_select');
  G.shop_booster.emplace(pk); G.GAME.dollars = 50;
  act({ type: 'buy', id: pk.sort_id });
  const keys = G.pack_cards.cards.map((c) => c.config.center.key);
  ok(G.pack_cards.cards.length === 4 && ['c_emperor', 'c_thac_quest_bed'].includes(keys[0]) && ['c_high_priestess', 'c_black_hole'].includes(keys[1]) && keys[2] === 'c_thac_scry' && ['c_judgement', 'c_soul'].includes(keys[3]), 'Option Select: Emperor / High Priestess / Scry / Judgement (rare upgrades)', keys);
  await loadMods(['pokermon']);
  newRun({ seed: 'TACOPTP', mods: ['autumncircus', 'pokermon'] });
  ok(P_CENTERS.p_thac_option_select.config.extra === 5 && P_CENTERS.p_thac_option_select.config.choose === 2, 'with Pokermon on: + Poke Ball, 5 cards / choose 2');
}

// ================================================================= vouchers
{
  start('TACVOU');
  const redeem = (k) => { const c = create_card('Voucher', G.shop_vouchers, null, null, null, null, k); c.redeem(); flush(); return c; };
  redeem('v_thac_spectral_merchant');
  ok(near(G.GAME.spectral_rate, 4.8), 'Spectral Merchant: spectral rate 4.8');
  redeem('v_thac_spectral_tycoon');
  ok(near(G.GAME.spectral_rate, 9.6), 'Spectral Tycoon: 9.6');
  redeem('v_thac_oddity_merchant');
  ok(near(G.GAME.oddity_rate, 7.2), 'Oddity Merchant: oddity rate 3 x 2.4');
  redeem('v_thac_oddity_tycoon');
  ok(near(G.GAME.oddity_rate, 14.4), 'Oddity Tycoon: 3 x 4.8');
  redeem('v_thac_limit_breaker');
  ok(G.GAME.starting_params.play_limit === 6 && G.GAME.starting_params.discard_limit === 6, 'Limit Breaker: +1 play / discard limit');
  redeem('v_thac_transcendant');
  ok(G.GAME.starting_params.play_limit === 7 && G.GAME.starting_params.discard_limit === 7, 'Transcendant: +1 more');
  redeem('v_thac_plus_four');
  let r = play(hand(['H_A']));
  ok(tot(r).join() === '16,5,80', '+4 voucher: +4 Mult', tot(r));
  redeem('v_thac_x_four');
  r = play(hand(['H_A']));
  ok(tot(r).join() === '16,20,320', 'X4 voucher: X4 Mult (after +4)', tot(r));
}
{
  // Wheel of Wheel of Fortune: 1 in 4 for a Wheel of Fortune when a blind is selected; Ceaseless Wheel
  start('TACWHEEL', { noBlind: true });
  G.GAME.wheel_of_wheel_of_fortune = true;
  P(1000);
  act({ type: 'select_blind' });
  ok(G.consumeables.cards.some((c) => c.config.center.key === 'c_wheel_of_fortune'), 'Wheel of Wheel of Fortune: a Wheel of Fortune on blind select');
  clearConsumables();
  G.GAME.ceaseless_wheel = true;
  const w = cons('c_wheel_of_fortune');
  cons('j_joker');
  act({ type: 'use', id: w.sort_id });
  const made = G.consumeables.cards.filter((c) => c.config.center.key === 'c_wheel_of_fortune');
  ok(made.length === 1 && made[0].edition && made[0].edition.negative, 'Ceaseless Wheel: using a Wheel makes another (forced Negative)');
  // FIX: a Negative Wheel's chance is a plain 1 in 4 (Oops-boosted, the Lua chained Negative Wheels forever)
  let made2 = 0;
  for (let i = 0; i < 40; i++) {
    clearConsumables(); clearJokers(); cons('j_joker'); // (an editionless joker for the Wheel to work on)
    const nw = cons('c_wheel_of_fortune'); nw.set_edition({ negative: true }, true, true);
    act({ type: 'use', id: nw.sort_id });
    if (G.consumeables.cards.some((c) => c.config.center.key === 'c_wheel_of_fortune')) made2++;
  }
  ok(made2 > 2 && made2 < 22, 'fix: a Negative Wheel rolls a plain 1 in 4 (not 1000 in 4)', made2);
  // and Ectoplasm / Hex no longer roll (FIX: only The Wheel of Fortune)
  clearConsumables(); clearJokers(); cons('j_joker');
  const ex = cons('c_ectoplasm');
  act({ type: 'use', id: ex.sort_id });
  ok(!G.consumeables.cards.some((c) => c.config.center.key === 'c_wheel_of_fortune'), 'fix: using Ectoplasm doesn\'t trigger Ceaseless Wheel');
  // selling a Wheel rolls too
  clearConsumables();
  const sw = cons('c_wheel_of_fortune');
  act({ type: 'sell', id: sw.sort_id });
  ok(G.consumeables.cards.some((c) => c.config.center.key === 'c_wheel_of_fortune'), 'Ceaseless Wheel: selling a Wheel makes another');
  P(1);
}

// ==================================================================== decks
{
  start('TACDECKW', { noBlind: true, back: 'b_thac_wheel_of_fortune_deck' });
  ok(G.GAME.used_vouchers.v_thac_wheel_of_wheel_of_fortune && G.GAME.wheel_of_wheel_of_fortune && G.consumeables.cards.filter((c) => c.config.center.key === 'c_wheel_of_fortune').length === 2, 'Wheel of Fortune Deck: the voucher + 2 Wheels');
  start('TACDECKC', { noBlind: true, back: 'b_thac_collectors_deck' });
  ok(G.consumeables.config.card_limit === 4 && G.GAME.modifiers.consumables_all_oddities, "Collector's Deck: +2 consumable slots");
  const t = create_card('Tarot', G.consumeables, null, null, null, null, 'c_fool');
  const p = create_card('Planet', G.consumeables);
  ok(t.ability.set === 'Oddity' && p.ability.set === 'Oddity', "Collector's Deck: every consumable made is an Oddity");
  start('TACDECKD', { noBlind: true, back: 'b_thac_duality' });
  ok(G.jokers.config.card_limit === 6 && G.consumeables.config.card_limit === 3 && G.GAME.round_resets.hands === 3 && G.GAME.round_resets.discards === 2, 'Duality Deck: +1 joker / +1 consumable slot, -1 hand / discard');
  start('TACDECKG', { noBlind: true, back: 'b_thac_gambling' });
  ok(probability_vars(null, 1, 4).join() === '2,4', 'Gambling Deck: doubles listed probabilities');
  start('TACDECKP', { noBlind: true, back: 'b_thac_purple' });
  ok(G.GAME.starting_params.play_limit === 6 && G.GAME.starting_params.discard_limit === 6, 'Purple Deck: +1 limits');
  start('TACDECKT', { noBlind: true, back: 'b_thac_teal' });
  ok(G.GAME.starting_params.play_limit === 7 && G.hand.config.card_limit === 7, 'Teal Deck: +2 limits, -1 hand size');
  start('TACDECKK', { noBlind: true, back: 'b_thac_pink' });
  ok(G.GAME.starting_params.play_limit === 4 && G.hand.config.card_limit === 10, 'Pink Deck: -1 limits, +2 hand size');
  start('TACDECKY', { noBlind: true, back: 'b_thac_grey' });
  ok(G.GAME.selected_back_key === 'b_thac_grey' && G.hand.config.card_limit === 8, 'Grey Deck: does nothing');
}

// ============================================== the run counter and the Joker tarot's edition
{
  start('TACMISC');
  const h0 = G.GAME.round_resets.hands_played;
  play(hand(['S_2'])); play(hand(['S_3']));
  ok(G.GAME.round_resets.hands_played === h0 + 2, 'round_resets.hands_played counts every hand');
  let eds = 0;
  for (let i = 0; i < 300; i++) { const c = create_card('Tarot', G.consumeables, null, null, null, null, 'c_thac_joker', 'jt' + i); if (c.edition) eds++; }
  ok(eds > 0, 'the Joker tarot rolls an edition when created', eds);
}

done();
