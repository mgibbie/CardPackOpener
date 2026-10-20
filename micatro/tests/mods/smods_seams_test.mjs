// Steamodded seams for Pokermon 3.9.1 (upgrade batch 4, js/engine/smods.js): small synthetic mods fire every seam
// through the real engine flow before any content uses it —
//   1. gating: the new contexts reach only opted-in mods (smods_seams), and only what their code reads;
//   2. the new calculate contexts: setting_ability, money_altered, ante_change / modify_ante (+ ante_end),
//      modify_booster_card / create_booster_card, ending_booster, drawing_cards, debuff_card, debuff_hand,
//      modify_scoring_hand, stay_flipped (+ to_area), modify_hand, modify_final_cashout, poker_hand_changed,
//      playing_card_end_of_round; Blind:calculate on the vanilla contexts;
//   3. SMODS.scale_card / SMODS.reset_card (+ scaling_card overrides, post);
//   4. attributes (Steamodded's built-ins, mod attributes, aliases, Pokermon's type / stage pools);
//   5. SMODS.poll_object (weights, modify_weights, filter, attributes, union) and the object_weights routes;
//   6. the poke_energy / poke_item set aliases;
//   7. the mod-level calculate on a vanilla context (`after`: SMODS.current_mod.calculate; Pokermon 3.9.1's Poli suit).
//   8. batch 7: the mod-level calculate on `individual` / `end_of_round` (Pokermon 3.9.1's Leafeon counter); the
//      destroy_card pass over UNSCORED played cards for an opted-in mod's jokers without the 'unscored' feature
//      (Pokermon 3.9.1's Dusclops); SMODS.add_booster_to_shop (Jirachi Booster).
//   node micatro/tests/mods/smods_seams_test.mjs
import { T, hand, clearHand, winRound, play, G, P_CENTERS, P_CARDS, act, STATES } from './poke_helpers.mjs';
import {
  P_CENTER_POOLS, P_BLINDS, P_TAGS, Card, add_joker, create_card, ease_dollars, ease_ante, localize, poll_edition,
  get_next_tag_key, get_new_boss, get_pack, get_next_voucher_key,
} from '../../js/engine/core.js';
import { newRun, add_booster_to_shop } from '../../js/engine/run.js';
import { registerMod, CONSUMABLE_TYPES, ATTRIBUTES, is_set, resolve_set } from '../../js/mods/registry.js';
import {
  wanted, SEAM_CONTEXTS, scale_card, reset_card, poll_object, get_attribute_pool, has_attribute, card_has_attribute,
  add_attribute, merge_lists, intersect_lists, SEAM_STATE,
} from '../../js/engine/smods.js';
import { loadMods, AVAILABLE } from '../../js/mods/index.js';
import { smods_create_card } from '../../mods/pokermon/systems/utils.js';

const { ok, done } = T();
const flush = () => G.E_MANAGER.flush();
const LOG = [];
const seen = (name) => LOG.filter((e) => e[0] === name);
const clearLog = () => { LOG.length = 0; };
// What the synthetic listeners answer (set per test).
const ANS = {};

// ------------------------------------------------------------------ synthetic mods
// seamtest: opted in. One joker that reads every new context (logs them, answers from ANS), an enhancement that reads
// playing_card_end_of_round, a boss blind with a calculate, its own attribute (+ alias) and a mod-level calculate.
registerMod({
  id: 'seamtest', name: 'Seam Test', prefix: 'st', smods_seams: true,
  content: {
    attributes: [{ key: 'st_shiny_thing', keys: ['j_joker'] }, { key: 'st_alias_of', alias: ['st_shiny_thing'] }],
    centers: [
      { key: 'j_st_listener', set: 'Joker', name: 'Seam Listener', rarity: 1, cost: 1, pos: { x: 0, y: 0 }, config: { extra: {} },
        attributes: ['st_shiny_thing', 'chips'],
        calculate(self, card, context) {
          if (context.setting_ability) LOG.push(['setting_ability', context.old, context.new, context.other_card, context.unchanged]);
          if (context.money_altered) LOG.push(['money_altered', context.amount, context.initial, !!context.from_shop, !!context.from_cashout, !!context.from_scoring]);
          if (context.modify_ante !== undefined && !context.ante_change) { LOG.push(['modify_ante', context.modify_ante, context.ante_end]); if (ANS.modify_ante) return { modify: ANS.modify_ante }; }
          if (context.ante_change) LOG.push(['ante_change', context.ante_change, context.ante_end]);
          if (context.create_booster_card && ANS.booster_create && context.booster.ability.name.includes('Arcana')) return { booster_create_flags: { set: 'Joker', key: 'j_joker' } };
          if (context.modify_booster_card) { LOG.push(['modify_booster_card', context.booster.config.center.key, context.index]); context.card.ability.st_marked = true; }
          if (context.ending_booster) LOG.push(['ending_booster', context.booster && context.booster.key]);
          if (context.drawing_cards) { LOG.push(['drawing_cards', context.amount]); if (ANS.draw) return ANS.draw; }
          if (context.debuff_card && context.debuff_card.base && context.debuff_card.base.suit === 'Spades') {
            if (ANS.debuff_spades === 'debuff') return { debuff: true };
            if (ANS.debuff_spades === 'prevent') return { prevent_debuff: true };
          }
          if (context.debuff_hand) {
            LOG.push(['debuff_hand', context.scoring_name, !!context.check, context.scoring_hand.length]);
            if (ANS.debuff_pair && context.scoring_name === 'Pair') return { debuff: true, debuff_text: 'No Pairs!' };
            if (ANS.prevent_hand_debuff) return { prevent_debuff: true };
          }
          if (context.modify_scoring_hand) {
            LOG.push(['modify_scoring_hand', context.other_card, !!context.in_scoring]);
            if (ANS.add_all) return { add_to_hand: true };
            if (ANS.remove_aces && context.other_card.base.value === 'Ace') return { remove_from_hand: true };
          }
          if (context.stay_flipped) {
            if (ANS.flip_down && context.to_area === G.hand) return { stay_flipped: true };
            if (context.from_area === G.hand && context.to_area === G.discard && context.other_card.st_bounce) {
              context.other_card.st_bounce = undefined;
              return { modify: { to_area: G.hand } };
            }
          }
          if (context.modify_hand && ANS.triple_mult) context.mult = context.mult * 3;
          if (context.modify_final_cashout && ANS.double_cashout) return { modify: context.amount };
          if (context.poker_hand_changed) {
            LOG.push(['poker_hand_changed', context.scoring_name, context.old_level, context.new_level, context.card && context.card.ability.set]);
            if (ANS.natu && context.card && context.card.ability && context.card.ability.set === 'Planet') return { level_up: true, level_up_hand: context.scoring_name };
          }
          if (context.destroy_card && context.cardarea === 'unscored') { LOG.push(['destroy_unscored', context.destroy_card.base.value]); if (ANS.destroy_unscored) return { remove: true }; }
          if (context.scaling_card && ANS.scaling && context.card !== card) return ANS.scaling(context);
          if (context.resetting_card && ANS.resetting) return ANS.resetting(context);
          return undefined;
        } },
      { key: 'm_st_seed', set: 'Enhanced', name: 'Seam Seed', pos: { x: 0, y: 0 }, config: {},
        calculate(self, card, context) {
          if (context.end_of_round && context.cardarea === G.hand && context.playing_card_end_of_round) LOG.push(['playing_card_end_of_round', card.base.value]);
        } },
      // batch 10: a joker that makes Stone cards ALSO Seam Seed cards (quantum) — the quantum enhancement's own calculate runs
      { key: 'j_st_quantum', set: 'Joker', name: 'Seam Quantum', rarity: 1, cost: 1, pos: { x: 0, y: 0 }, config: {}, quantum_enhancements: true,
        calculate(self, card, context) { if (context.check_enhancement && context.other_card.config.center.key === 'm_stone') return { m_st_seed: true }; } },
      { key: 'j_st_plain', set: 'Joker', name: 'Seam Plain', rarity: 1, cost: 1, pos: { x: 0, y: 0 }, config: { extra: { mult: 2, mult_mod: 3, xm: 2 } } },
    ],
    blinds: [
      { key: 'bl_st_boss', name: 'The Seam', dollars: 5, mult: 2, vars: [], debuff: {}, boss: { min: 1, max: 10 }, pos: { x: 0, y: 0 }, boss_colour: '#123456',
        calculate(self, blind, context) {
          for (const k of ['setting_blind', 'first_hand_drawn', 'press_play', 'before', 'pre_discard', 'end_of_round', 'drawing_cards']) if (context[k]) LOG.push(['blind:' + k, !!blind.disabled]);
        } },
    ],
  },
  hooks: {
    calculate(context) {
      if (context.modify_weights && ANS.zero_weight) { const w = context.pool[ANS.zero_weight]; if (w) w.weight = 0; }
      if (context.money_altered) LOG.push(['hook:money_altered', context.amount]);
      if (context.after) { LOG.push(['hook:after', context.scoring_name, G.play.cards.length]); if (ANS.after_func) return { func() { LOG.push(['hook:after_func']); } }; }
      if (context.individual && context.cardarea === G.play) LOG.push(['hook:individual', context.other_card.base.value, !!context.other_card.lucky_trigger]);
      if (context.end_of_round && context.main_eval) LOG.push(['hook:end_of_round', !!context.beat_boss, context.game_over]);
      if (context.first_hand_drawn) LOG.push(['hook:first_hand_drawn', G.hand.cards.length]);
      return undefined;
    },
  },
});
// seamoff: NOT opted in — its joker and blind read the same contexts and must never be called by the seams.
registerMod({
  id: 'seamoff', name: 'Seam Off', prefix: 'so',
  content: {
    centers: [{ key: 'j_so_deaf', set: 'Joker', name: 'Seam Deaf', rarity: 1, cost: 1, pos: { x: 0, y: 0 }, config: {},
      calculate(self, card, context) {
        if (context.money_altered || context.setting_ability || context.drawing_cards || context.stay_flipped) LOG.push(['DEAF', Object.keys(context).join()]);
        if (context.cardarea === 'unscored') { LOG.push(['DEAF-UNSCORED']); return { remove: true }; }
      } },
    // (batch 10) a quantum mod enhancement of a mod that did NOT opt in: its own calculate must never run as a quantum
    { key: 'j_so_quantum', set: 'Joker', name: 'Deaf Quantum', rarity: 1, cost: 1, pos: { x: 0, y: 0 }, config: {}, quantum_enhancements: true,
      calculate(self, card, context) { if (context.check_enhancement && context.other_card.config.center.key === 'm_stone') return { m_so_mark: true }; } },
    { key: 'm_so_mark', set: 'Enhanced', name: 'Deaf Mark', pos: { x: 0, y: 0 }, config: {},
      calculate(self, card, context) { if (context.end_of_round && context.extra_enhancement) LOG.push(['DEAF-QUANTUM']); } }],
    blinds: [{ key: 'bl_so_boss', name: 'The Deaf', dollars: 5, mult: 2, vars: [], debuff: {}, boss: { min: 1, max: 10 }, pos: { x: 0, y: 0 },
      calculate(self, blind, context) { LOG.push(['DEAF-BLIND', Object.keys(context).join()]); } }],
  },
  hooks: { calculate(context) { if (context.after || context.individual || context.end_of_round || context.first_hand_drawn) LOG.push(['DEAF-HOOK', 'after']); return undefined; } },
});

/** A fresh run with these mods, blind selected (the Small slot may hold a test blind), empty hand. */
function fresh(seed, mods = ['seamtest'], { small, noSelect } = {}) {
  for (const k of Object.keys(ANS)) delete ANS[k];
  newRun({ seed, back: 'b_red', mods });
  G.FORCE_BOSS = 'bl_wall';
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  if (small) G.GAME.round_resets.blind_choices.Small = small;
  clearLog();
  if (noSelect) return;
  act({ type: 'select_blind' });
  clearHand();
}
const listener = () => add_joker('j_st_listener');
const toShop = () => {
  if (G.STATE === STATES.SELECTING_HAND) winRound();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
};
const buyPack = (key) => {
  for (const c of G.shop_booster.cards.slice()) c.remove();
  const b = new Card(P_CARDS.empty, P_CENTERS[key]);
  G.shop_booster.emplace(b);
  G.GAME.dollars = 100;
  return act({ type: 'buy', id: b.sort_id });
};

// ================================================================== 1. gating
await loadMods(AVAILABLE.map((m) => m.id));
{
  newRun({ seed: 'SEAM_VAN', back: 'b_red' });
  ok(SEAM_CONTEXTS.every((n) => !wanted(n)), 'vanilla run: no seam context is wanted');
  newRun({ seed: 'SEAM_ALL', back: 'b_red', mods: AVAILABLE.map((m) => m.id) });
  // (3.2.1-era content reads none; Bunco's own stay_flipped is not opted in. Pokermon's 3.9.1 reworks read theirs: batch 6
  // Golduck setting_ability, Natu / Xatu poker_hand_changed; batch 7 Jirachi Banker modify_final_cashout; batch 8 Gimmighoul
  // money_altered; batch 10 the Hazard card playing_card_end_of_round.)
  ok(SEAM_CONTEXTS.filter((n) => wanted(n)).join() === 'setting_ability,money_altered,modify_final_cashout,poker_hand_changed,playing_card_end_of_round', 'every shipped mod on: only the seam contexts the reworked Pokermon 3.9.1 jokers read are wanted', SEAM_CONTEXTS.filter((n) => wanted(n)));
  fresh('SEAM_GATE');
  ok(wanted('money_altered') && wanted('setting_ability') && wanted('modify_weights') && wanted('resetting_card') && !wanted('create_shop_card'), 'seamtest on: exactly the contexts its code reads are wanted');
  fresh('SEAM_GATE2', ['seamtest', 'seamoff']);
  listener(); add_joker('j_so_deaf'); clearLog();
  ease_dollars(3, true);
  hand(['S_5'])[0].set_ability(P_CENTERS.m_bonus);
  ok(seen('money_altered').length === 1 && seen('setting_ability').length === 1, 'the opted-in listener hears money_altered / setting_ability');
  ok(seen('DEAF').length === 0, 'a mod that did not opt in (smods_seams) is never sent the seam contexts', seen('DEAF'));
}
{ // a not-opted-in mod's blind calculate is never run
  fresh('SEAM_GATE3', ['seamtest', 'seamoff'], { small: 'bl_so_boss' });
  ok(G.GAME.blind.config.blind.key === 'bl_so_boss' && seen('DEAF-BLIND').length === 0, 'Blind:calculate: not called for a blind of a mod that did not opt in');
}

// ================================================================== 2. contexts
{ // setting_ability
  fresh('SEAM_SA'); listener(); clearLog();
  const [c] = hand(['H_7']);
  c.set_ability(P_CENTERS.m_gold);
  const e = seen('setting_ability')[0];
  ok(e && e[1] === 'c_base' && e[2] === 'm_gold' && e[3] === c && e[4] === false, 'setting_ability: old / new / other_card / unchanged', e && e.slice(0, 3));
  c.set_ability(P_CENTERS.m_gold);
  ok(seen('setting_ability')[1] && seen('setting_ability')[1][4] === true, 'setting_ability: unchanged when the center stays the same');
  clearLog(); c.set_ability(P_CENTERS.m_steel, true);
  ok(seen('setting_ability').length === 0, 'setting_ability: not for an initial set_ability');
  toShop(); clearLog();
  const [d] = hand(['H_8']);
  d.set_ability(P_CENTERS.m_glass);
  ok(seen('setting_ability').length === 0, 'setting_ability: not in the shop (SMODS: SHOP / booster states)...');
  G.TAROT_INTERRUPT = G.STATE; d.set_ability(P_CENTERS.m_lucky); G.TAROT_INTERRUPT = null;
  ok(seen('setting_ability').length === 1, '... unless a consumable is being used (G.TAROT_INTERRUPT)');
}
{ // money_altered
  fresh('SEAM_MONEY'); listener(); clearLog();
  const d0 = G.GAME.dollars;
  ease_dollars(4); flush();
  const e = seen('money_altered')[0];
  ok(e && e[1] === 4 && e[2] === d0 && !e[3] && !e[4], 'money_altered: amount / initial (no source flags in hand)', e);
  ok(seen('hook:money_altered').length === 1, 'money_altered: a mod-level hooks.calculate that reads it hears it too');
  clearLog(); winRound(); clearLog();
  act({ type: 'cash_out' });
  ok(seen('money_altered').length === 1 && seen('money_altered')[0][4] === true && seen('money_altered')[0][1] > 0, 'money_altered: from_cashout while cash_out pays', seen('money_altered'));
  clearLog(); ease_dollars(-1);
  ok(seen('money_altered')[0] && seen('money_altered')[0][3] === true, 'money_altered: from_shop in the shop');
}
{ // ante_change / modify_ante / ante_end
  fresh('SEAM_ANTE'); listener(); clearLog();
  const a0 = G.GAME.round_resets.ante;
  ease_ante(1); flush();
  ok(seen('modify_ante')[0] && seen('modify_ante')[0][1] === 1 && seen('ante_change')[0] && seen('ante_change')[0][1] === 1 && seen('ante_change')[0][2] === undefined, 'modify_ante then ante_change (no ante_end outside a boss win)');
  ok(G.GAME.round_resets.ante === a0 + 1, 'ante +1');
  ANS.modify_ante = 3; clearLog();
  ease_ante(1); flush();
  ok(G.GAME.round_resets.ante === a0 + 4 && seen('ante_change')[0][1] === 3, 'modify_ante: {modify = 3} changes the ante step (ante_change sees 3)');
  delete ANS.modify_ante;
  // a real boss win: ante_end
  fresh('SEAM_ANTE2'); listener();
  for (let i = 0; i < 3; i++) {
    clearLog();
    winRound();
    if (i === 2) break;
    act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  }
  ok(seen('ante_change').length === 1 && seen('ante_change')[0][2] === true && seen('modify_ante')[0][2] === true, 'beating the boss: modify_ante / ante_change with ante_end = true', seen('ante_change'));
  ok(SEAM_STATE.ante_end === undefined, 'ante_end is cleared after');
}
{ // boosters: create_booster_card, modify_booster_card, ending_booster
  fresh('SEAM_PACK'); listener(); toShop(); clearLog();
  let r = buyPack('p_standard_normal_1');
  flush();
  const mods = seen('modify_booster_card');
  ok(r.ok && mods.length === G.pack_cards.cards.length && mods.every((m, i) => m[1] === 'p_standard_normal_1' && m[2] === i + 1), 'modify_booster_card: every pack card, with booster and index', mods);
  ok(G.pack_cards.cards.every((c) => c.ability.st_marked), 'modify_booster_card: the listener may change the card');
  clearLog(); act({ type: 'skip_booster' }); flush();
  ok(seen('ending_booster')[0] && seen('ending_booster')[0][1] === 'p_standard_normal_1', 'ending_booster: fired with the booster center', seen('ending_booster'));
  ANS.booster_create = true;
  r = buyPack('p_arcana_normal_1'); flush();
  ok(r.ok && G.pack_cards.cards.length > 0 && G.pack_cards.cards.every((c) => c.config.center.key === 'j_joker'), 'create_booster_card: booster_create_flags make the pack cards', G.pack_cards.cards.map((c) => c.config.center.key));
  act({ type: 'skip_booster' }); flush();
}
{ // drawing_cards (+ the blind's calculate)
  fresh('SEAM_DRAW', ['seamtest'], { noSelect: true });
  listener();
  ANS.draw = { cards_to_draw: 3 };
  act({ type: 'select_blind' }); flush();
  ok(seen('drawing_cards')[0] && seen('drawing_cards')[0][1] === 8 && G.hand.cards.length === 3, 'drawing_cards: amount 8, {cards_to_draw = 3} draws 3', [seen('drawing_cards'), G.hand.cards.length]);
  fresh('SEAM_DRAW2', ['seamtest'], { noSelect: true });
  listener(); ANS.draw = { modify: 5 };
  act({ type: 'select_blind' }); flush();
  ok(G.hand.cards.length === 5, 'drawing_cards: {modify = 5} draws 5');
}
{ // debuff_card
  fresh('SEAM_DEBUFF'); listener(); ANS.debuff_spades = 'debuff';
  const [s, h] = hand(['S_9', 'H_9']);
  G.GAME.blind.debuff_card(s); G.GAME.blind.debuff_card(h);
  ok(s.debuff && !h.debuff, 'debuff_card: {debuff = true} debuffs (Spades only)');
  ANS.debuff_spades = 'prevent';
  G.GAME.blind.set_blind(P_BLINDS.bl_goad);
  ok(!s.debuff, 'debuff_card: {prevent_debuff = true} beats The Goad');
  delete ANS.debuff_spades; G.GAME.blind.debuff_card(s);
  ok(s.debuff, '... and without it The Goad debuffs the Spade again');
}
{ // debuff_hand + modify_scoring_hand
  fresh('SEAM_DH'); listener(); ANS.debuff_pair = true;
  let r = (() => { const cs = hand(['S_K', 'H_K']); G.GAME.chips = 0; G.GAME.blind.chips = 1e15; act({ type: 'highlight', ids: cs.map((c) => c.sort_id) }); return act({ type: 'play' }); })();
  let tot = r.events.find((e) => e.type === 'hand_total');
  ok(tot && Number(tot.total) === 0 && SEAM_STATE.debuff_text === 'No Pairs!', 'debuff_hand: {debuff = true} debuffs a Pair (debuff_text kept)', tot);
  ok(seen('debuff_hand').some((e) => e[1] === 'Pair' && e[3] === 2), 'debuff_hand: scoring_name and the (modify_scoring_hand-passed) scoring hand');
  fresh('SEAM_DH2', ['seamtest'], { small: 'bl_psychic' }); listener(); ANS.prevent_hand_debuff = true;
  ok(G.GAME.blind.name === 'The Psychic' && !G.GAME.blind.debuff_hand(hand(['S_2']), { 'High Card': [[1]] }, 'High Card', true), 'debuff_hand: {prevent_debuff = true} beats The Psychic');
  // modify_scoring_hand in evaluate_play
  fresh('SEAM_MSH'); listener();
  const play2 = () => { clearHand(); const cs = hand(['S_A', 'H_2']); G.GAME.chips = 0; G.GAME.blind.chips = 1e15; G.GAME.current_round.hands_left = 3; act({ type: 'highlight', ids: cs.map((c) => c.sort_id) }); return act({ type: 'play' }).events.find((e) => e.type === 'hand_total'); };
  tot = play2();
  ok(tot && Number(tot.chips) === 16 && seen('modify_scoring_hand').filter((e) => e[2]).length === 2, 'modify_scoring_hand: asked for every played card (in_scoring), no answer = High Card scores only the Ace (16 chips)', tot);
  ANS.add_all = true; tot = play2();
  ok(tot && Number(tot.chips) === 18, '{add_to_hand = true}: the 2 scores too (18 chips)', tot);
  delete ANS.add_all; ANS.remove_aces = true; tot = play2();
  ok(tot && Number(tot.chips) === 5, '{remove_from_hand = true}: the Ace no longer scores (5 chips)', tot);
}
{ // modify_hand
  fresh('SEAM_MH'); listener(); ANS.triple_mult = true;
  const cs = hand(['S_A']); G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const tot = act({ type: 'play' }).events.find((e) => e.type === 'hand_total');
  ok(tot && Number(tot.mult) === 3 && Number(tot.total) === 48, 'modify_hand: context.mult x3 (High Card 16 x 3)', tot);
}
{ // stay_flipped (+ to_area)
  fresh('SEAM_SF', ['seamtest'], { noSelect: true }); listener(); ANS.flip_down = true;
  act({ type: 'select_blind' }); flush();
  ok(G.hand.cards.length > 0 && G.hand.cards.every((c) => c.facing === 'back'), '{stay_flipped = true}: drawn face down');
  fresh('SEAM_SF2'); listener();
  const [a, b] = hand(['S_3', 'H_4']);
  a.st_bounce = true;
  act({ type: 'highlight', ids: [a.sort_id, b.sort_id] });
  act({ type: 'discard' }); flush();
  ok(G.hand.cards.includes(a) && !G.hand.cards.includes(b) && G.discard.cards.includes(b), '{modify = {to_area = G.hand}}: the discarded card goes back to the hand instead');
}
{ // modify_final_cashout
  fresh('SEAM_CASH'); listener();
  winRound();
  const base = G.GAME.current_round.dollars;
  fresh('SEAM_CASH'); listener(); ANS.double_cashout = true;
  winRound();
  const rows = G.GAME.round_eval.rows;
  ok(G.GAME.current_round.dollars === base * 2 && rows.some((r) => r.name === 'cashout_mod1' && r.dollars === base), 'modify_final_cashout: {modify = amount} doubles the cash-out, as its own row', [base, G.GAME.current_round.dollars]);
}
{ // poker_hand_changed
  fresh('SEAM_PHC'); listener(); ANS.natu = true;
  const pl = add_joker('c_pluto'); flush(); clearLog();
  const r = act({ type: 'use', id: pl.sort_id }); flush();
  const e = seen('poker_hand_changed');
  ok(r.ok && e[0] && e[0][1] === 'High Card' && e[0][2] === 1 && e[0][3] === 2 && e[0][4] === 'Planet', 'poker_hand_changed: Pluto levels High Card 1 -> 2 (card = the Planet)', e);
  ok(G.GAME.hands['High Card'].level === 3 && e.length === 2 && e[1][4] === 'Joker', 'a listener\'s {level_up} answer levels again (that change names the joker: no loop)', e);
}
{ // playing_card_end_of_round
  fresh('SEAM_PCEOR'); listener();
  hand(['H_5'], { center: 'm_st_seed' });
  clearLog();
  winRound(hand(['S_2'])); flush();
  ok(seen('playing_card_end_of_round').some((e) => e[1] === '5'), 'playing_card_end_of_round: a held card\'s enhancement sees it at end of round', LOG.map((e) => e[0]));
}
{ // Blind:calculate on the vanilla contexts
  fresh('SEAM_BLIND', ['seamtest'], { small: 'bl_st_boss', noSelect: true });
  act({ type: 'select_blind' }); flush();
  ok(seen('blind:setting_blind').length === 1 && seen('blind:first_hand_drawn').length === 1, 'Blind:calculate: setting_blind, first_hand_drawn');
  const cs = G.hand.cards.slice(0, 1);
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) }); act({ type: 'play' }); flush();
  ok(seen('blind:press_play').length === 1 && seen('blind:before').length === 1, 'Blind:calculate: press_play, before');
  act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] }); act({ type: 'discard' }); flush();
  ok(seen('blind:pre_discard').length === 1, 'Blind:calculate: pre_discard');
  G.GAME.blind.disabled = true;
  winRound(); flush();
  ok(seen('blind:end_of_round').length === 1 && seen('blind:end_of_round')[0][1] === true, 'Blind:calculate: end_of_round — called even while disabled (the blind checks blind.disabled itself)');
}

// ================================================================== 3. scale_card / reset_card
{
  fresh('SEAM_SCALE');
  const j = add_joker('j_st_plain'); flush();
  G.ui_events.length = 0;
  let r = scale_card(j, { ref_value: 'mult', scalar_value: 'mult_mod', message_colour: 'MULT' });
  ok(j.ability.extra.mult === 5 && r[0] === 5 && r[1] === 3, 'scale_card: + (2 + 3 = 5) -> [value, change]');
  ok(G.ui_events.some((e) => e.type === 'status' && e.message === localize('k_upgrade_ex')), 'scale_card: the default message is "Upgrade!"');
  r = scale_card(j, { ref_value: 'xm', scalar_value: 'xm', operation: 'X', message_key: 'a_xmult' });
  ok(j.ability.extra.xm === 4 && G.ui_events.some((e) => e.type === 'status' && e.message === localize({ type: 'variable', key: 'a_xmult', vars: [4] })), 'scale_card: X, a_xmult shows the new value');
  scale_card(j, { ref_value: 'mult', scalar_value: 'mult_mod', operation: '-', no_message: true });
  ok(j.ability.extra.mult === 2, 'scale_card: -');
  scale_card(j, { ref_value: 'mult' });
  ok(j.ability.extra.mult === 3 && j.ability.extra.SMODS_scalar_mult === 1, 'scale_card: no scalar_value -> SMODS_scalar_mult = 1 (as Steamodded)');
  scale_card(j, { ref_value: 'mult', scalar_value: 'mult_mod', operation: (t, k, init, ch) => { t[k] = init * 10 + ch; } });
  ok(j.ability.extra.mult === 33, 'scale_card: a function operation');
  scale_card(j, { ref_table: j.ability, ref_value: 'extra_value', scalar_table: { by: 2 }, scalar_value: 'by', scalar_factor: 3 });
  ok(j.ability.extra_value === 6, 'scale_card: ref_table / scalar_table / scalar_factor');
  // listeners: override_scalar, override_value, override_message, post, block_overrides
  listener();
  ANS.scaling = (ctx) => ({ override_scalar: ctx.scalar * 2, post: { message: 'POST' } });
  j.ability.extra.mult = 0; G.ui_events.length = 0;
  scale_card(j, { ref_value: 'mult', scalar_value: 'mult_mod' });
  ok(j.ability.extra.mult === 6 && G.ui_events.some((e) => e.type === 'status' && e.message === 'POST'), 'scaling_card: override_scalar doubles the step; post runs after');
  scale_card(j, { ref_value: 'mult', scalar_value: 'mult_mod', block_overrides: { scalar: true } });
  ok(j.ability.extra.mult === 9, 'scaling_card: block_overrides.scalar ignores it');
  ANS.scaling = () => ({ override_value: 100, override_message: { message: 'BIG' } });
  G.ui_events.length = 0;
  scale_card(j, { ref_value: 'mult', scalar_value: 'mult_mod' });
  ok(j.ability.extra.mult === 103 && G.ui_events.some((e) => e.type === 'status' && e.message === 'BIG'), 'scaling_card: override_value and override_message');
  delete ANS.scaling;
  ANS.resetting = () => ({ override_value: 7 });
  reset_card(j, { ref_value: 'mult' });
  ok(j.ability.extra.mult === 7, 'reset_card + resetting_card: override_value');
  delete ANS.resetting; G.ui_events.length = 0;
  reset_card(j, { ref_value: 'mult', reset_value: 1 });
  ok(j.ability.extra.mult === 1 && G.ui_events.some((e) => e.type === 'status' && e.message === localize('k_reset')), 'reset_card: reset_value and the "Reset" message');
}

// ================================================================== 4. attributes
{
  fresh('SEAM_ATTR', ['seamtest']);
  ok(ATTRIBUTES.mult && get_attribute_pool('mult').includes('j_joker') && get_attribute_pool('chips').includes('m_bonus'), 'Steamodded built-in attributes (vendored): mult has Joker, chips has Bonus');
  ok(has_attribute(P_CENTERS.j_joker, 'mult') && !has_attribute(P_CENTERS.j_joker, 'chips') && !has_attribute(P_CENTERS.j_joker, 'no_such'), 'has_attribute: listed by the attribute');
  const pool = get_attribute_pool('st_shiny_thing');
  ok(pool[0] === 'j_joker' && pool.includes('j_st_listener'), 'a mod attribute: its keys first, then the objects that declare it', pool);
  ok(has_attribute(P_CENTERS.j_st_listener, 'chips') && get_attribute_pool('chips').includes('j_st_listener'), 'an object declaring a built-in attribute joins its pool');
  ok(get_attribute_pool('st_alias_of').includes('j_st_listener') && has_attribute(P_CENTERS.j_st_listener, 'st_alias_of') && has_attribute(P_CENTERS.j_joker, 'st_alias_of'), 'alias: the alias pool holds the aliased attribute\'s objects');
  ok(get_attribute_pool('st_shiny_thing').length === pool.length && has_attribute(P_CENTERS.j_joker, 'st_shiny_thing'), 'alias works both ways (Steamodded post_inject_class)');
  add_attribute('st_shiny_thing', ['j_greedy_joker']);
  ok(get_attribute_pool('st_shiny_thing').includes('j_greedy_joker'), 'add_attribute');
  const j = add_joker('j_st_listener');
  ok(card_has_attribute(j, 'st_shiny_thing') && card_has_attribute(G.GAME.blind, 'boss_blind') === has_attribute(G.GAME.blind.config.blind, 'boss_blind'), 'Card:has_attribute / Blind:has_attribute');
  ok(merge_lists([['a', 'b'], ['b', 'c']]).join() === 'a,b,c' && intersect_lists([['a', 'b', 'b'], ['b', 'c', 'b']]).join() === 'b,b', 'merge_lists / intersect_lists');
  newRun({ seed: 'SEAM_ATTR_OFF', back: 'b_red' });
  ok(!get_attribute_pool('st_shiny_thing').includes('j_st_listener') && get_attribute_pool('st_shiny_thing').includes('j_joker'), 'an inactive mod\'s objects are not in attribute pools');
}
{ // Pokermon's attributes (load_pokemon: <type>_type, stage_<stage>, pokemon)
  newRun({ seed: 'SEAM_POKE_ATTR', back: 'b_red', mods: ['pokermon'] });
  const pokes = Object.values(P_CENTERS).filter((c) => c.mod === 'pokermon' && c.set === 'Joker' && c.stage);
  ok(pokes.length > 400 && pokes.every((c) => c.attributes.includes('stage_' + c.stage.toLowerCase()) && (!c.ptype || c.attributes.includes(c.ptype.toLowerCase() + '_type')) && (c.stage === 'Other') !== c.attributes.includes('pokemon')), 'every Pokémon center: stage_ / _type / pokemon attributes', pokes.length);
  const basic = get_attribute_pool('stage_basic');
  const expect = pokes.filter((c) => c.stage === 'Basic').map((c) => c.key);
  ok(basic.length === expect.length && expect.every((k) => basic.includes(k)), 'stage_basic pool = the Basic Pokémon', [basic.length, expect.length]);
  ok(['pokemon', 'grass_type', 'stage_mega', 'round_evo', 'drain'].every((k) => ATTRIBUTES[k]), 'Pokermon 3.9.1\'s attribute list is registered');
  act({ type: 'select_blind' });
  // 3.9.1's Poké Ball: SMODS.add_card({set = 'Joker', attributes = {'stage_basic'}, rarity = false, key_append = 'pokeball'})
  const keys = [];
  for (let i = 0; i < 6; i++) { const c = smods_create_card({ set: 'Joker', attributes: ['stage_basic'], rarity: false, key_append: 'pokeball' }); keys.push(c.config.center.key); c.remove(); }
  ok(keys.every((k) => P_CENTERS[k].stage === 'Basic'), 'create_card with attributes = {"stage_basic"}: a Basic Pokémon', keys);
  const lg = smods_create_card({ set: 'Joker', attributes: ['stage_legendary'], allow_legendaries: true, key_append: 'masterball' });
  ok(lg.config.center.stage === 'Legendary', 'attributes = {"stage_legendary"} + allow_legendaries: a Legendary', lg.config.center.key);
  const egg = poll_object({ type: 'Joker', attributes: ['stage_baby', 'stage_basic'], union: true, rarity: false, key_append: 'egg' });
  ok(['Baby', 'Basic'].includes(P_CENTERS[egg].stage), 'poll_object attributes + union (3.9.1\'s Egg): Baby or Basic', egg);
  const fireBasic = poll_object({ type: 'Joker', attributes: ['fire_type', 'stage_basic'], rarity: false, seed: 'x' });
  ok(P_CENTERS[fireBasic].ptype === 'Fire' && P_CENTERS[fireBasic].stage === 'Basic', 'poll_object attributes (intersection): a Basic Fire Pokémon', fireBasic);
}

// ================================================================== 5. poll_object + object_weights
{
  fresh('SEAM_POLL');
  const counts = { a: 0, b: 0, z: 0 };
  for (let i = 0; i < 400; i++) counts[poll_object({ type: 'Joker', pool: [{ name: 'a', weight: 1 }, { name: 'b', weight: 3 }, { name: 'z', weight: 0 }], seed: 'w' + i, type_key: 'wt' + i })]++;
  ok(counts.z === 0 && counts.b > 250 && counts.b < 350 && counts.a > 50, 'poll_object: {name, weight} pool — weight 3 vs 1 (~75%), weight 0 never', counts);
  const seq = () => { fresh('SEAM_POLL_SEQ'); const out = []; for (let i = 0; i < 12; i++) out.push(poll_object({ type: 'Joker', pool: [{ name: 'a', weight: 1 }, { name: 'b', weight: 1 }], seed: 's', type_key: 'st' })); return out.join(); };
  const s1 = seq();
  ok(s1 === seq() && s1.includes('a') && s1.includes('b'), 'poll_object: seeded (the same run seed replays the same picks)', s1);
  ok(poll_object({ type: 'Base' }) === 'INTERNAL_PLAYING_CARD', 'poll_object: Base -> INTERNAL_PLAYING_CARD');
  const t = poll_object({ type: 'Tarot', append: 'x' });
  ok(P_CENTERS[t] && P_CENTERS[t].set === 'Tarot', 'poll_object: a set pool (Tarot)', t);
  const f = poll_object({ type: 'Joker', rarity: 1, filter: (pool) => pool.filter((e) => e.key === 'j_joker') });
  ok(f === 'j_joker', 'poll_object: filter');
  ANS.zero_weight = 'j_st_plain';
  let n0 = 0;
  for (let i = 0; i < 40; i++) if (poll_object({ type: 'Joker', pool: [{ name: 'j_st_plain', weight: 5 }, { name: 'j_joker', weight: 1 }], seed: 'mw' + i, type_key: 'mwt' + i }) === 'j_st_plain') n0++;
  ok(n0 === 0, 'modify_weights: a listener setting pool[key].weight = 0 removes it', n0);
  delete ANS.zero_weight;
  let miss = 0;
  for (let i = 0; i < 300; i++) if (poll_object({ type: 'Seal', seed: 'seal' + i }) === undefined) miss++;
  ok(miss > 270, 'poll_object: Seal is non-guaranteed (2% base rate) unless guaranteed', miss);
  const gs = poll_object({ type: 'Seal', guaranteed: true });
  ok(['Red', 'Blue', 'Gold', 'Purple'].includes(gs), 'poll_object: a guaranteed Seal', gs);
}
// object_weights: a mod turns Steamodded's optional feature on
registerMod({
  id: 'seamweights', name: 'Seam Weights', prefix: 'sw', smods_seams: true, optional_features: { object_weights: true },
  content: { centers: [{ key: 'j_sw_heavy', set: 'Joker', name: 'Heavy', rarity: 1, cost: 1, weight: 10000, pos: { x: 0, y: 0 }, config: {} }] },
});
{
  fresh('SEAM_OW', ['seamweights']);
  let heavy = 0;
  for (let i = 0; i < 30; i++) { const c = create_card('Joker', G.jokers, null, 0.1, null, null, null, 'ow' + i); if (c.config.center.key === 'j_sw_heavy') heavy++; c.remove(); }
  ok(heavy >= 25, 'object_weights: create_card picks by weight (a weight-10000 Common dominates the Common pool)', heavy);
  const tag = get_next_tag_key('ow');
  ok(P_TAGS[tag], 'object_weights: get_next_tag_key via poll_object', tag);
  const boss = get_new_boss();
  ok(P_BLINDS[boss] && P_BLINDS[boss].boss, 'object_weights: get_new_boss via poll_object', boss);
  const pack = get_pack('shop_pack');
  ok(pack && pack.set === 'Booster', 'object_weights: get_pack via poll_object', pack && pack.key);
  const v = get_next_voucher_key();
  ok(P_CENTERS[v] && P_CENTERS[v].set === 'Voucher', 'object_weights: get_next_voucher_key via poll_object', v);
  let eds = 0;
  for (let i = 0; i < 50; i++) { const e = poll_edition('owed' + i, null, false, true); if (e && ['foil', 'holo', 'polychrome', 'negative'].includes(Object.keys(e)[0])) eds++; }
  ok(eds === 50, 'object_weights: a guaranteed poll_edition is a shop edition', eds);
  toShop();
  ok(G.STATE === STATES.SHOP && G.shop_jokers.cards.length === G.GAME.shop.joker_max, 'object_weights: the shop stocks (SMODS.create_shop_card)');
  for (let i = 0; i < 3; i++) { act({ type: 'reroll_shop' }); }
  act({ type: 'next_round' }); act({ type: 'select_blind' });
  ok(G.STATE === STATES.SELECTING_HAND, 'object_weights: a run keeps going (rerolls, next blind)');
}

// ================================================================== 6. set aliases (poke_energy / poke_item)
{
  newRun({ seed: 'SEAM_ALIAS', back: 'b_red', mods: ['pokermon'] });
  act({ type: 'select_blind' });
  ok(resolve_set('poke_energy') === 'Energy' && resolve_set('poke_item') === 'Item' && resolve_set('Tarot') === 'Tarot', 'resolve_set');
  ok(P_CENTER_POOLS.poke_item === P_CENTER_POOLS.Item && P_CENTER_POOLS.poke_energy === P_CENTER_POOLS.Energy && !Object.keys(P_CENTER_POOLS).includes('poke_item'), 'P_CENTER_POOLS.poke_item is the Item pool (not enumerated)');
  ok(CONSUMABLE_TYPES.poke_energy === CONSUMABLE_TYPES.Energy && !Object.keys(CONSUMABLE_TYPES).includes('poke_energy'), 'CONSUMABLE_TYPES.poke_energy is Energy');
  const e = create_card('poke_energy', G.consumeables, null, null, null, null, null, 'alias');
  ok(e.ability.set === 'Energy' && is_set(e, 'poke_energy') && is_set(e, 'Energy') && !is_set(e, 'poke_item'), 'create_card("poke_energy") makes an Energy card; is_set answers both names', e.config.center.key);
  const it = smods_create_card({ set: 'poke_item', key_append: 'alias' });
  ok(it.ability.set === 'Item', 'SMODS.create_card{set = "poke_item"} makes an Item card');
  ok(localize({ type: 'name_text', set: 'poke_item', key: 'c_poke_pokeball' }) === localize({ type: 'name_text', set: 'Item', key: 'c_poke_pokeball' }), 'loc: descriptions.poke_item reads descriptions.Item');
  registerMod({ id: 'seamalias', name: 'Seam Alias', prefix: 'sa', requires: ['pokermon'],
    content: { centers: [{ key: 'c_sa_thing', set: 'poke_item', name: 'Thing', consumeable: true, cost: 1, pos: { x: 0, y: 0 }, config: {}, hidden: true, soul_set: 'poke_energy' }] } });
  ok(P_CENTERS.c_sa_thing.set === 'Item' && P_CENTERS.c_sa_thing.soul_set === 'Energy', 'a center registered with set "poke_item" is filed under Item (soul_set too)');
}

// ================================================================== 7. mod-level calculate on `after` (batch 6)
{
  fresh('SEAM_AFTER', ['seamtest', 'seamoff']);
  ANS.after_func = true;
  const [a] = hand(['S_A']);
  act({ type: 'highlight', ids: [a.sort_id] });
  act({ type: 'play' }); flush();
  ok(seen('hook:after').length === 1 && seen('hook:after')[0][1] === 'High Card', 'after: the hooks.calculate of an opted-in mod that reads it hears it once per scored hand', seen('hook:after'));
  ok(seen('hook:after_func').length === 1, 'after: its returned effect runs (calculate_effect: func)', LOG);
  ok(seen('DEAF-HOOK').length === 0, 'after: a mod that did not opt in (smods_seams) never gets it at mod level', seen('DEAF-HOOK'));
  clearLog();
  const [b] = hand(['S_K']);
  act({ type: 'highlight', ids: [b.sort_id] });
  act({ type: 'discard' }); flush();
  ok(seen('hook:after').length === 0, 'after: not on a discard');
}

// ================================================================== 8. batch 7: individual / end_of_round at mod level, unscored destroys, add_booster_to_shop
{
  fresh('SEAM_IND', ['seamtest', 'seamoff']);
  G.GAME.blind.chips = 1e15; // (no early win)
  const cards = hand(['S_A', 'H_A', 'D_7']);
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  act({ type: 'play' }); flush();
  ok(seen('hook:individual').map((e) => e[1]).join() === 'Ace,Ace', 'individual: the hooks.calculate of an opted-in mod hears each SCORED card (once each)', seen('hook:individual'));
  ok(seen('DEAF-HOOK').length === 0, 'individual: a mod that did not opt in never gets it at mod level');
  clearLog();
  G.GAME.probabilities.normal = 1000;
  const [l] = hand(['S_K'], { center: 'm_lucky' });
  act({ type: 'highlight', ids: [l.sort_id] });
  act({ type: 'play' }); flush();
  G.GAME.probabilities.normal = 1;
  ok(seen('hook:individual').length === 1 && seen('hook:individual')[0][2] === true, 'individual: the card\'s lucky_trigger is still set when the mod hears it (Pokermon 3.9.1 Leafeon)', seen('hook:individual'));
  clearLog();
  winRound();
  ok(seen('hook:end_of_round').length === 1 && seen('hook:end_of_round')[0][2] === false, 'end_of_round: heard once at mod level (main_eval, not game over)', seen('hook:end_of_round'));
}
// ================================================================== 9. batch 10: first_hand_drawn at mod level; a quantum MOD enhancement's own calculate
{
  fresh('SEAM_FHD', ['seamtest', 'seamoff'], { noSelect: true });
  act({ type: 'select_blind' }); flush();
  ok(seen('hook:first_hand_drawn').length === 1, 'first_hand_drawn: an opted-in mod hooks.calculate hears it once (with the jokers: the draw is still queued, so an effect it queues lands after it)', seen('hook:first_hand_drawn'));
  ok(seen('DEAF-HOOK').length === 0, 'first_hand_drawn: a mod that did not opt in never gets it at mod level');
  clearHand(); clearLog();
  play(hand(['S_2']));
  ok(seen('hook:first_hand_drawn').length === 0, 'first_hand_drawn: not on later draws');
}
{
  fresh('SEAM_QNT', ['seamtest', 'seamoff']);
  add_joker('j_st_quantum'); add_joker('j_so_quantum'); flush();
  hand(['S_5', 'H_6'], { center: 'm_stone' });
  hand(['D_9'], { center: 'm_st_seed' });
  winRound(hand(['C_2']));
  ok(seen('playing_card_end_of_round').map((e) => e[1]).sort().join() === '5,6,9', 'quantum: held Stone cards made Seam Seed run its OWN end_of_round calculate (+ the real Seed card)', seen('playing_card_end_of_round'));
  ok(seen('DEAF-QUANTUM').length === 0, 'quantum: a not-opted-in mod quantum enhancement is never calculated');
}
{
  fresh('SEAM_UNSC', ['seamtest', 'seamoff']);
  listener();
  add_joker('j_so_deaf');
  ANS.destroy_unscored = true;
  const [a, b, k] = hand(['S_A', 'H_A', 'D_7']);
  const n0 = G.playing_cards.length;
  act({ type: 'highlight', ids: [a.sort_id, b.sort_id, k.sort_id] });
  act({ type: 'play' }); flush();
  ok(seen('destroy_unscored').map((e) => e[1]).join() === '7' && !G.playing_cards.includes(k) && G.playing_cards.length === n0 - 1,
    'unscored: an opted-in mod\'s joker is asked about the unscored card and may destroy it (no \'unscored\' feature)', [seen('destroy_unscored'), G.playing_cards.length - n0]);
  ok(seen('DEAF-UNSCORED').length === 0, 'unscored: a joker of a mod that did not opt in is not asked');
}
{
  fresh('SEAM_ADDB', ['seamtest']);
  winRound();
  act({ type: 'cash_out' });
  const n0 = G.shop_booster.cards.length;
  const c = add_booster_to_shop();
  const k = add_booster_to_shop('p_arcana_normal_1');
  ok(G.shop_booster.cards.length === n0 + 2 && c.ability.set === 'Booster' && k.config.center.key === 'p_arcana_normal_1' && k.ability.booster_pos === n0 + 2,
    'add_booster_to_shop: a random shop pack, or the given one, at the end of the shop row', G.shop_booster.cards.map((x) => x.config.center.key));
  G.GAME.dollars = 100;
  ok(act({ type: 'buy', id: k.sort_id }).ok, '... and it can be bought / opened');
}

done();
