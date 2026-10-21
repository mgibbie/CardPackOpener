// Micatro mod catch-ups (Plans/MICATRO_MODS_UPGRADES.md batches 2, 3 and 21): every fix and change FIRED through the
// engine — Bunco 5.1 -> the jumbocarrot0 fork v5.4.8b (pure fixes + the balance / timing changes, behind the version
// pin), Reverie 1.3.0's two sleeves + Bunco foods in Morsel (+ the 1.2.6 label), Inscrybed's Mycologists.
//   node micatro/tests/mods/mod_catchups_test.mjs
import {
  T, ok, flush, done, start, clearHand, hand, add, clearJokers, play, discard, nextRound, toShop, msgs, tot, same,
} from './bunco_helpers.mjs';
import {
  G, P_CENTERS, P_CARDS, P_BLINDS, Card, add_joker, create_card, ease_dollars, pseudorandom,
} from '../../js/engine/core.js';
import { newRun, act, STATES, HANDLIST } from '../../js/engine/run.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { MODS } from '../../js/mods/registry.js';
import { modPin, LEGACY_MOD_VERSIONS } from '../../js/mods/pins.js';
import { findSleeve } from '../../js/engine/sleeve.js';
import { describe, describeCenter } from '../../js/engine/describe.js';
import { spectrum_part, deal_part } from '../../mods/bunco/systems.js';
import '../../mods/reverie/index.js';
import '../../mods/inscrybed/index.js';
import { get_food_jokers } from '../../mods/reverie/index.js';

const key = (c) => c.config.center.key;
function toBossSelect() {
  const bs = G.GAME.round_resets.blind_states;
  bs.Small = 'Defeated'; bs.Big = 'Defeated'; bs.Boss = 'Select';
  G.GAME.blind_on_deck = 'Boss';
}
function fight(boss, seed, opts = {}) {
  start(seed || ('CU' + boss), { boss, noBlind: true, ...opts });
  toBossSelect();
  act({ type: 'select_blind' });
  clearHand();
}
/** A test enhancement with no rank and no suit (like Pokermon 3.9.1's Ludicolo / an AMM Stone-like card), not a Stone Card. */
P_CENTERS.m_cu_rankless = {
  key: 'm_cu_rankless', set: 'Enhanced', name: 'Rankless Test', order: 99, pos: { x: 5, y: 0 }, config: {},
  no_rank: true, no_suit: true, replace_base_card: true, always_scores: true,
};
const rankless = (k) => { const [c] = hand([k]); c.set_ability(P_CENTERS.m_cu_rankless); return c; };

// =========================================================================== pins
{
  ok(MODS.bunco.version === '5.4.8b-JumboFork' && modPin('bunco') === '5.4.8b-JumboFork+r1', 'Bunco pin: the fork 5.4.8b, rev 1', modPin('bunco'));
  ok(MODS.reverie.version === '1.2.6' && modPin('reverie') === '1.2.6+r1', 'Reverie pin: 1.2.6 (the real version), rev 1', modPin('reverie'));
  ok(modPin('inscrybed') === '1.0+r1', 'Inscrybed pin: rev 1 (Mycologists)', modPin('inscrybed'));
  ok(LEGACY_MOD_VERSIONS.bunco === '5.1' && LEGACY_MOD_VERSIONS.reverie === '1.0 (old-API)' && LEGACY_MOD_VERSIONS.inscrybed === '1.0', 'the legacy table is untouched');
}

// =========================================================================== Bunco — batch 2 (pure fixes)
{ // Spectrum with 6+ cards: the extra cards may repeat a suit / have none
  start('CU-SPEC');
  ok(spectrum_part(hand(['S_2', 'H_3', 'C_4', 'D_5', 'bunc_FLEURON_6', 'S_9'])).length === 1, 'Spectrum: 6 cards, 5 suits + a repeat', null);
  clearHand();
  const six = hand(['S_2', 'H_3', 'C_4', 'D_5', 'bunc_FLEURON_6']); six.push(rankless('S_9'));
  ok(spectrum_part(six).length === 1, 'Spectrum: 6 cards, 5 suits + a suitless card');
  clearHand();
  ok(spectrum_part(hand(['S_2', 'H_3', 'C_4', 'D_5', 'S_6'])).length === 0, 'still no Spectrum: 5 cards with a repeat');
  clearHand();
  ok(spectrum_part(hand(['S_2', 'H_3', 'C_4', 'S_5', 'S_6', 'S_7'])).length === 0, 'still no Spectrum: 6 cards, 3 suits');
  clearHand();
}
{ // The Flame / Indigo Tower never debuff consumables
  for (const boss of ['bl_bunc_flame', 'bl_bunc_final_tower']) {
    fight(boss);
    const t = create_card('Tarot', G.consumeables, null, null, null, null, 'c_fool'); G.consumeables.emplace(t); flush();
    G.GAME.blind.debuff_card(t);
    ok(G.GAME.blind.name === boss && !t.debuff, boss + ': a consumable is never debuffed', t.debuff);
    const [e, b] = hand(['S_5', 'H_6']); e.set_ability(P_CENTERS.m_bonus);
    G.GAME.blind.debuff_card(e); G.GAME.blind.debuff_card(b);
    if (boss === 'bl_bunc_flame') ok(e.debuff && !b.debuff, 'The Flame: enhanced card still debuffed, base card not');
    else ok(e.debuff && b.debuff, 'Indigo Tower: unplayed playing cards still debuffed');
  }
}
{ // rankless / suitless guards — jokers
  start('CU-CROP'); add('j_bunc_crop_circles');
  let r = play([rankless('C_8')]);
  ok(r.total.mult === 1, 'Crop Circles: a rankless, suitless 8 of Clubs gives nothing', tot(r));
  r = play(hand(['C_8'])); ok(r.total.mult === 1 + 5, 'Crop Circles: a plain 8 of Clubs still +5', tot(r));
  start('CU-STYLO'); add('j_bunc_stylophone');
  r = play([rankless('S_9')]); ok(r.total.mult === 1, 'Stylophone: a rankless card gives no Mult', tot(r));
  start('CU-ZERO'); add('j_bunc_zero_shapiro'); G.GAME.probabilities.normal = 100;
  const nt = G.GAME.tags.length; play([rankless('S_9')]); flush();
  ok(G.GAME.tags.filter((t) => t.key === 'tag_d_six').length === 1 && G.GAME.tags.length === nt + 1, 'Zero Shapiro: a rankless card counts', G.GAME.tags.map((t) => t.key));
  G.GAME.probabilities.normal = 1;
  start('CU-DOGS'); add('j_bunc_dogs_playing_poker');
  r = play([...hand(['S_2', 'H_3']), rankless('S_4')]); ok(r.total.mult === 1, 'Dogs Playing Poker: a rankless scored card breaks it', tot(r));
  start('CU-PAWN'); const pawn = add('j_bunc_pawn');
  const low = G.playing_cards[0]; low.set_ability(P_CENTERS.m_cu_rankless);
  const d = describe(pawn).lines.join(' ');
  ok(/\b2\b/.test(d) && !/ERROR|-\d/.test(d), 'Pawn: a rankless card is not the lowest rank', d);
  const [two] = hand(['S_2']); play([two], { keepHand: true }); flush();
  ok(two.base.value === '3', 'Pawn: the real lowest rank (2) still ranks up', two.base.value);
  clearHand();
  start('CU-PROT'); const pr = add('j_bunc_protester');
  discard([rankless('S_K')]); flush(); clearHand();
  ok(pr.ability.extra.chips === 0, 'Protester: a rankless discard does not count', pr.ability.extra.chips);
  const [dk] = hand(['S_K']); dk.set_debuff(true); discard([dk]); flush(); clearHand();
  ok(pr.ability.extra.chips === 0, 'Protester (the fork\'s fix, adopted): a debuffed discard does not count', pr.ability.extra.chips);
  discard(hand(['S_Q'])); flush(); clearHand(); ok(pr.ability.extra.chips === 80, 'Protester: a plain Queen still counts (80)', pr.ability.extra.chips);
}
{ // rankless / suitless guards — blinds
  fight('bl_bunc_tine'); G.GAME.current_round.most_played_rank = '9';
  const nine = rankless('S_9'); const [n9] = hand(['H_9']);
  G.GAME.blind.debuff_card(nine); G.GAME.blind.debuff_card(n9);
  ok(!nine.debuff && n9.debuff, 'The Tine: a rankless card is not debuffed (a real 9 is)', [nine.debuff, n9.debuff]);
  fight('bl_bunc_final_crown');
  const sl = rankless('S_5'); G.GAME.blind.debuff_card(sl);
  ok(!sl.debuff, 'Chartreuse Crown: a suitless card is not debuffed', sl.debuff);
}
{ // Eternal Tag: never on a Scattering / Hindered joker or one that can't be Eternal — and it waits for the next joker
  start('CU-ETAG', { noBlind: true });
  const tag = new Tag('tag_bunc_eternal'); add_tag(tag);
  const gg = new Card(P_CARDS.empty, P_CENTERS.j_bunc_glue_gun); // eternal_compat false
  tag.apply_to_run({ type: 'store_joker_modify', card: gg }); flush();
  ok(!gg.ability.eternal && G.GAME.tags.includes(tag), 'Eternal Tag: skips a joker that can\'t be Eternal (and stays)', [gg.ability.eternal, G.GAME.tags.length]);
  const sc = new Card(P_CARDS.empty, P_CENTERS.j_joker); sc.ability.bunc_scattering = true;
  tag.apply_to_run({ type: 'store_joker_modify', card: sc }); flush();
  ok(!sc.ability.eternal && G.GAME.tags.includes(tag), 'Eternal Tag: skips a Scattering joker', sc.ability.eternal);
  const hi = new Card(P_CARDS.empty, P_CENTERS.j_joker); hi.ability.bunc_hindered = true;
  tag.apply_to_run({ type: 'store_joker_modify', card: hi }); flush();
  ok(!hi.ability.eternal && G.GAME.tags.includes(tag), 'Eternal Tag: skips a Hindered joker', hi.ability.eternal);
  const jk = new Card(P_CARDS.empty, P_CENTERS.j_joker);
  tag.apply_to_run({ type: 'store_joker_modify', card: jk }); flush();
  ok(jk.ability.eternal && !G.GAME.tags.includes(tag), 'Eternal Tag: the next valid joker gets it', [jk.ability.eternal, G.GAME.tags.length]);
  const pt = new Tag('tag_bunc_perishable'); add_tag(pt);
  const ic = new Card(P_CARDS.empty, P_CENTERS.j_ride_the_bus); // vanilla perishable_compat false
  pt.apply_to_run({ type: 'store_joker_modify', card: ic }); flush();
  ok(!ic.ability.perishable && G.GAME.tags.includes(pt), 'Perishable Tag: skips a joker that can\'t be Perishable (and stays)', ic.ability.perishable);
}
{ // Breaking Tag: selling Luchador (gameplay reworks) during the Boss disables it at once
  fight('bl_wall', 'CU-LUCH');
  const lu = add('j_luchador');
  ok(G.GAME.blind.boss && !G.GAME.blind.disabled, 'fighting The Wall');
  act({ type: 'sell', id: lu.sort_id }); flush();
  ok(G.GAME.blind.disabled && !G.GAME.tags.some((t) => t.key === 'tag_bunc_breaking'), 'Luchador sold in the Boss: Breaking Tag disables it now', [G.GAME.blind.disabled, G.GAME.tags.map((t) => t.key)]);
}
{ // Registration Plate: a debuff cycle doesn't re-roll its ranks; the Deal with 6 cards / two Plates
  start('CU-PLATE'); const rp = add('j_bunc_registration_plate');
  const before = JSON.stringify(rp.ability.extra.ranks);
  rp.set_debuff(true); flush(); rp.set_debuff(false); flush();
  ok(JSON.stringify(rp.ability.extra.ranks) === before && rp.ability.extra.ranks.length === 5, 'Registration Plate: re-enabled after a debuff keeps its ranks', [before, rp.ability.extra.ranks]);
  rp.ability.extra.ranks = [2, 3, 4, 5, 6];
  ok(deal_part(hand(['S_2', 'H_3', 'C_4', 'D_5', 'S_6', 'H_6'])).length === 1, 'The Deal: 6 cards (an extra 6) still a Deal');
  clearHand();
  ok(deal_part(hand(['S_2', 'H_3', 'C_4', 'D_5'])).length === 0 && deal_part(hand(['S_2', 'H_3', 'C_4', 'D_5', 'S_7'])).length === 0, 'The Deal: 4 cards / a wrong rank are not');
  clearHand();
  const rp2 = add('j_bunc_registration_plate'); rp2.ability.extra.ranks = [9, 9, 10, 10, 14];
  ok(deal_part(hand(['S_9', 'H_9', 'C_T', 'D_T', 'S_A'])).length === 1, 'The Deal: the second Plate matches when the first doesn\'t (not the fork\'s early return)');
  clearHand();
}
{ // every Bunco joker can be Perishable (Steamodded's default the port had missed)
  ok(P_CENTERS.j_bunc_cassette.perishable_compat === true && P_CENTERS.j_bunc_mosaic.perishable_compat === true && P_CENTERS.j_bunc_glue_gun.perishable_compat === true && P_CENTERS.j_bunc_shepherd.perishable_compat === false, 'perishable_compat: Steamodded\'s default true (an explicit false stays)');
}

// =========================================================================== Bunco — batch 21 (balance / timing, pinned)
{ // Gameplan: +20 Mult per adjacent joker, at that joker's turn
  start('CU-GP');
  add('j_joker'); add('j_bunc_gameplan'); add('j_joker');
  const r = play(hand(['S_2']));
  const m = msgs(r.events);
  ok(r.total.mult === 41 && m.filter((x) => /\+20/.test(x)).length === 2 && !m.some((x) => /\+40/.test(x)), 'Gameplan: two +20 Mult (one per neighbour), not one +40', [tot(r), m]);
}
{ // Conquest: one random pick (never itself), marked on the debuffed joker; cleared when Conquest goes
  start('CU-CQ', { noBlind: true });
  const a = add('j_joker'); const cq = add('j_bunc_conquest'); const b = add('j_joker');
  act({ type: 'select_blind' }); flush();
  const chosen = [a, b].filter((j) => j.ability.bunc_conquest_chosen === cq.sort_id);
  ok(chosen.length === 1 && chosen[0].debuff && !cq.debuff && !cq.ability.bunc_conquest_chosen, 'Conquest: one other joker marked and debuffed', [a.ability.bunc_conquest_chosen, b.ability.bunc_conquest_chosen]);
  act({ type: 'sell', id: cq.sort_id }); flush();
  ok(!a.ability.bunc_conquest_chosen && !b.ability.bunc_conquest_chosen && !a.debuff && !b.debuff, 'Conquest sold: the mark is cleared');
}
{ // Fingerprints: a debuffed scoring card is not upgraded
  start('CU-FP'); add('j_bunc_fingerprints');
  const [c1, c2] = hand(['S_7', 'H_7']); c2.set_debuff(true);
  G.GAME.chips = 0; G.GAME.blind.chips = 10;
  act({ type: 'highlight', ids: [c1.sort_id, c2.sort_id] }); act({ type: 'play' }); flush();
  ok(G.STATE !== STATES.SELECTING_HAND && c1.ability.temporary_extra_chips === 50, 'Fingerprints: the round won, the scored card +50', [G.STATE, c1.ability.temporary_extra_chips]);
  ok(!c2.ability.temporary_extra_chips, 'Fingerprints: the debuffed card is not upgraded', c2.ability.temporary_extra_chips);
}
{ // Games Collector: +10 Chips once per group per round
  start('CU-GC'); const gc = add('j_bunc_games_collector');
  gc.calculate_joker({ groups_drawn: [{ id: 1, source: 'x' }, { id: 2, source: 'x' }] });
  gc.calculate_joker({ groups_drawn: [{ id: 1, source: 'x' }] }); flush();
  ok(gc.ability.extra.chips === 20, 'Games Collector: the same group twice in a round counts once', gc.ability.extra.chips);
  nextRound();
  gc.calculate_joker({ groups_drawn: [{ id: 1, source: 'x' }] }); flush();
  ok(gc.ability.extra.chips === 30, 'Games Collector: again next round', gc.ability.extra.chips);
}
{ // Puzzle Board: no roll (and no "Nope!") when a Tarot is used with no cards selected
  start('CU-PB'); add('j_bunc_puzzle_board'); G.GAME.probabilities.normal = 0;
  const t = create_card('Tarot', G.consumeables, null, null, null, null, 'c_judgement'); G.consumeables.emplace(t); flush();
  const s0 = JSON.stringify(G.GAME.pseudorandom);
  const r = act({ type: 'use', id: t.sort_id }); flush();
  ok(r.ok && !msgs(r.events).some((x) => /Nope/.test(x)), 'Puzzle Board: no selection -> no roll', msgs(r.events));
  ok(JSON.stringify(G.GAME.pseudorandom).includes('puzzle_board') === s0.includes('puzzle_board'), 'Puzzle Board: its seed was not advanced');
  G.GAME.probabilities.normal = 1;
}
{ // Vandalism: Blueprint copies it (each copy rolls its own 1 in 4)
  const rate = (withBp) => {
    start(withBp ? 'CU-VBP' : 'CU-V1');
    if (withBp) add('j_blueprint');
    add('j_bunc_vandalism');
    G.STATE = STATES.SELECTING_HAND;
    let n = 0;
    for (let i = 0; i < 400; i++) { const c = new Card(P_CARDS.S_2, P_CENTERS.c_base); if (G.GAME.blind.stay_flipped(G.hand, c, G.deck)) n++; }
    return n / 400;
  };
  const one = rate(false), two = rate(true);
  ok(one > 0.17 && one < 0.33 && two > 0.35 && two < 0.52, 'Vandalism: ~1 in 4 alone, ~1-(3/4)^2 with a Blueprint copy', [one, two]);
}
{ // Domino: only takes neighbours it could acquire (a voucher next to the bought card stays)
  start('CU-DOM'); add('j_bunc_domino'); toShop();
  for (const c of G.shop_jokers.cards.slice()) c.remove();
  const j = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_joker'); G.shop_jokers.emplace(j);
  const v = new Card(P_CARDS.empty, P_CENTERS.v_overstock_norm); G.shop_jokers.emplace(v);
  flush(); G.GAME.dollars = 100;
  act({ type: 'buy', id: j.sort_id }); flush();
  ok(j.area === G.jokers && v.area === G.shop_jokers && !G.GAME.used_vouchers.v_overstock_norm, 'Domino: a voucher neighbour is not taken', [v.area && v.area.name, !!G.GAME.used_vouchers.v_overstock_norm]);
}
{ // Prehistoric: remembers the card as it was scored (rank + suit), skips rankless / suitless cards
  start('CU-PRE'); add('j_bunc_prehistoric');
  const [a] = hand(['S_5']); play([a], { keepHand: true }); clearHand();
  a.set_base(P_CARDS.H_9); // the remembered card changes afterwards
  let r = play(hand(['S_5'])); ok(r.total.mult === 1 + 16, 'Prehistoric: a 5 of Spades matches what was scored', tot(r));
  r = play(hand(['H_9'])); ok(r.total.mult === 1, 'Prehistoric: the changed card\'s new rank / suit is not remembered', tot(r));
  play([rankless('D_4')]);
  r = play([rankless('D_4')]); ok(r.total.mult === 1, 'Prehistoric: rankless cards are never remembered', tot(r));
}
{ // The Prince: disabled once a hand was played (the press_play flag)
  start('CU-PRINCE', { boss: 'bl_bunc_prince', noBlind: true });
  const p1 = add('j_joker'); toBossSelect(); act({ type: 'select_blind' }); clearHand();
  ok(p1.debuff && G.GAME.bunc_bl_prince_flag === undefined, 'The Prince: jokers debuffed, no hand played yet');
  G.GAME.blind.chips = 1e15;
  act({ type: 'highlight', ids: hand(['S_2']).map((c) => c.sort_id) }); act({ type: 'play' }); flush();
  ok(!p1.debuff && G.GAME.blind.disabled && G.GAME.bunc_bl_prince_flag === true, 'The Prince: disabled after the first hand (flag set at press_play)');
}
{ // shop-only stickers (already so in the port): a joker made by Judgement on Gold Stake has none
  start('CU-STK', { stake: 8 });
  for (let i = 0; i < 30; i++) {
    const j = create_card('Joker', G.jokers, null, null, null, null, null, 'jud'); G.jokers.emplace(j);
  }
  flush();
  ok(G.jokers.cards.every((j) => !j.ability.bunc_scattering && !j.ability.bunc_hindered && !j.ability.bunc_reactive), 'no Bunco sticker outside the shop / packs');
}
{ // Glitter +$3, Fluorescent +$1
  start('CU-COST');
  const a = new Card(P_CARDS.empty, P_CENTERS.j_joker); a.set_edition({ bunc_glitter: true }, true, true);
  const b = new Card(P_CARDS.empty, P_CENTERS.j_joker); b.set_edition({ bunc_fluorescent: true }, true, true);
  const c = new Card(P_CARDS.empty, P_CENTERS.j_joker);
  a.set_cost(); b.set_cost(); c.set_cost();
  ok(a.cost === c.cost + 3 && b.cost === c.cost + 1, 'edition costs: Glitter +$3, Fluorescent +$1', [a.cost, b.cost, c.cost]);
}
{ // The Deal sits above Spectrum Five
  start('CU-HL');
  ok(HANDLIST.indexOf('bunc_Deal') >= 0 && HANDLIST.indexOf('bunc_Deal') < HANDLIST.indexOf('bunc_Spectrum Five'), 'The Deal: above Spectrum Five (above_hand)', HANDLIST.slice(0, 4));
}
{ // fork art: exotic Cassette / Crop Circles / Slothful variants (fork sheet cells 71-74) once exotics are on
  start('CU-ART');
  const cs = add('j_bunc_cassette'); const cc = add('j_bunc_crop_circles'); const sl = add('j_bunc_slothful');
  const pos = (c) => JSON.stringify(c.config.center.get_pos ? c.config.center.get_pos(c.config.center, c) : c.config.center.pos);
  const off = [pos(cs), pos(cc), pos(sl)];
  G.GAME.Exotic = true;
  ok(pos(cs) === JSON.stringify({ x: 0, y: 7 }) && pos(cc) === JSON.stringify({ x: 2, y: 7 }) && pos(sl) === JSON.stringify({ x: 3, y: 7 }), 'exotic art variants', [off, pos(cs), pos(cc), pos(sl)]);
  ok(P_CENTERS.j_bunc_cassette.atlas === 'bunco_jokers' && /Jokers-548b\.png$/.test(MODS.bunco.content.atlases.bunco_jokers.src), 'Jokers sheet: the fork\'s (new name)', MODS.bunco.content.atlases.bunco_jokers.src);
}

{ // the fork's rewordings (descriptions whose #n# placeholders are unchanged)
  ok(describeCenter('j_bunc_domino').lines[0].startsWith('When you') && describeCenter('j_bunc_stylophone').lines.join(' ').includes('their {C:attention}rank{} in'), 'Bunco text: 5.4.8b rewordings', describeCenter('j_bunc_domino').lines);
  ok(describeCenter('j_bunc_registration_plate').lines.length > 0 && !/#\d#/.test(describeCenter('j_bunc_registration_plate').lines.join(' ')), 'Registration Plate keeps its one-var text (filled)');
}

// =========================================================================== Reverie (batch 3)
{
  newRun({ seed: 'CU-RV1', back: 'b_red', mods: ['reverie'] });
  ok(!get_food_jokers().includes('j_bunc_fondue'), 'Morsel: no Bunco foods without Bunco');
  newRun({ seed: 'CU-RV2', back: 'b_red', mods: ['reverie', 'bunco'] });
  const foods = get_food_jokers();
  ok(foods.includes('j_bunc_fondue') && foods.includes('j_bunc_starfruit'), 'Morsel: Fondue and Starfruit are food with Bunco on', foods);
  G.GAME.current_round.used_cine = ['Morsel'];
  const sf = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_bunc_starfruit'); G.shop_jokers.emplace(sf);
  const fo = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_bunc_fondue'); G.shop_jokers.emplace(fo);
  ok(sf.ability.morseled && sf.ability.extra.odds === 8 && fo.ability.morseled, 'Morsel: Starfruit doubled (1 in 8), Fondue morseled', sf.ability.extra);
  const d = describe(fo).lines.join(' ');
  ok(/first and second hand/.test(d), 'Morsel Fondue text: first and second hand', d);
  G.GAME.current_round.used_cine = undefined;
  // a morseled Fondue converts the second hand too
  G.shop_jokers.remove_card(fo); G.jokers.emplace(fo); fo.add_to_deck(); flush();
  act({ type: 'select_blind' }); clearHand();
  play(hand(['S_2'])); flush();
  const [h2] = hand(['S_3']); play([h2], { keepHand: true }); flush();
  ok(h2.base.suit === 'bunc_Fleurons', 'Morsel Fondue: the second hand of the round is converted too', h2.base.suit);
  const [h3] = hand(['S_4']); play([h3], { keepHand: true }); flush();
  ok(h3.base.suit === 'Spades', 'Morsel Fondue: not the third', h3.base.suit);
  clearHand();
}
{ // the two sleeves
  const fs = findSleeve('sleeve_rev_filmstrip'), ss = findSleeve('sleeve_rev_stamp');
  ok(fs && ss && fs.mod === 'reverie' && ss.mod === 'reverie' && fs.atlas === 'rev_sleeves', 'Reverie sleeves: Filmstrip, Stamp', [!!fs, !!ss]);
  if (fs && ss) {
    newRun({ seed: 'CU-SL1', back: 'b_red', mods: ['reverie'], sleeve: 'sleeve_rev_filmstrip' });
    ok(G.cine_quests.config.card_limit === 2, 'Filmstrip Sleeve: +1 Cine slot', G.cine_quests.config.card_limit);
    act({ type: 'select_blind' }); clearHand(); toShop(); G.GAME.dollars = 100;
    const giveCine = (k) => { const c = new Card(P_CARDS.empty, P_CENTERS[k]); c.add_to_deck(); G.cine_quests.emplace(c); return c; };
    const g1 = giveCine('c_rev_gem_heist'), g2 = giveCine('c_rev_unseen');
    const u1 = act({ type: 'use', id: g1.sort_id }); flush();
    const u2 = act({ type: 'use', id: g2.sort_id }); flush();
    ok(u1.ok && u2.ok, 'Filmstrip Sleeve: both Cines used', [u1.error, u2.error]);
    ok((G.GAME.current_round.used_cine || []).join() === 'Gem Heist,The Unseen', 'Filmstrip Sleeve: Cines stack', G.GAME.current_round.used_cine);
    newRun({ seed: 'CU-SL2', back: 'b_rev_filmstrip', mods: ['reverie'], sleeve: 'sleeve_rev_filmstrip' });
    ok(G.cine_quests.config.card_limit === 2, 'Filmstrip Sleeve on the Filmstrip Deck: no second extra slot', G.cine_quests.config.card_limit);
    let neg = 0;
    for (let i = 0; i < 200; i++) { const q = new Card(P_CARDS.empty, P_CENTERS.c_rev_gem_heist_quest); G.shop_jokers.emplace(q); if (q.edition && q.edition.negative) neg++; q.remove(); }
    ok(neg > 25 && neg < 80, 'Filmstrip Sleeve alt: Exchange Coupons in the shop 1 in 4 Negative', neg);
    newRun({ seed: 'CU-SL3', back: 'b_red', mods: ['reverie'], sleeve: 'sleeve_rev_stamp' });
    ok(G.GAME.round_resets.blind_tags.Small === 'tag_rev_mega_tag' && G.GAME.round_resets.blind_tags.Big === 'tag_rev_mega_tag', 'Stamp Sleeve: Stamp Tags on both skips', G.GAME.round_resets.blind_tags);
    newRun({ seed: 'CU-SL4', back: 'b_rev_stamp', mods: ['reverie'], sleeve: 'sleeve_rev_stamp' });
    ok(G.GAME.round_resets.blind_tags.Small === 'tag_rev_mega_stamp', 'Stamp Sleeve on the Stamp Deck: Mega Stamp Tags', G.GAME.round_resets.blind_tags);
    const n0 = G.GAME.tags.length;
    act({ type: 'skip_blind' }); flush();
    ok(G.STATE === STATES.MOD_PACK && G.GAME.pack_center === 'p_rev_tag_jumbo_1' && G.GAME.tags.length >= n0 + 1, 'Mega Stamp Tag: a free Jumbo Tag Pack and a random tag', [G.GAME.pack_center, G.GAME.tags.map((t) => t.key)]);
  }
}

// =========================================================================== Inscrybed (batch 3)
{
  newRun({ seed: 'CU-MY', back: 'b_red', mods: ['inscrybed'] });
  const c = P_CENTERS.j_inscrybed_mycologist;
  ok(c && c.rarity === 2 && c.cost === 5 && c.blueprint_compat && c.atlas === 'inscrybed_mycologist', 'Mycologists: Uncommon, $5', c && [c.rarity, c.cost]);
  act({ type: 'select_blind' }); clearHand();
  if (c) {
  add('j_inscrybed_mycologist');
  let r = play(hand(['S_5', 'H_5']));
  ok(r.total.mult === 2 + 10, 'Mycologists: a Pair of 5s -> +5 Mult each', tot(r));
  r = play(hand(['S_K', 'H_K', 'S_A', 'H_A']));
  ok(r.total.mult === 2 + 10 + 10 + 11 + 11, 'Mycologists: Two Pair K/A -> +10, +10, +11, +11', tot(r));
  r = play(hand(['S_9']));
  ok(r.total.mult === 1, 'Mycologists: no Pair, nothing', tot(r));
  add('j_blueprint'); G.jokers.cards.reverse();
  r = play(hand(['S_4', 'H_4']));
  ok(r.total.mult === 2 + 16, 'Mycologists: Blueprint copies it', tot(r));
  ok(describeCenter('j_inscrybed_mycologist').lines.join(' ').includes('Pair'), 'Mycologists text');
  }
  // our intended-design numbers stay (owner rule): Deathly 2 x rank from +22, Techno from +8
  ok(P_CENTERS.j_inscrybed_deathly.config.extra.current_chips === 22 && P_CENTERS.j_inscrybed_techno.config.mult === 8, 'Inscrybed: the other four keep our numbers');
}

done();
