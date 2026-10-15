// Blinds / Tags / Backs / describe — port of blind.lua, tag.lua, back.lua and
// card.lua generate_UIBox_ability_table. Plain node:
//   node micatro/tests/blinds_tags_backs_test.mjs
import { newRun, act, pump, G, STATES, STATE_NAMES, create_card_for_shop } from '../js/engine/run.js';
import {
  P_CENTERS, P_CARDS, P_BLINDS, Card, add_joker, E_MANAGER, level_up_hand, get_blind_amount,
} from '../js/engine/core.js';
import { Blind } from '../js/engine/blind.js';
import { Tag, add_tag } from '../js/engine/tag.js';
import { Back } from '../js/engine/back.js';
import { describe, describeBlind, describeTag, describeBack, describeCenter } from '../js/engine/describe.js';

let fails = 0, passes = 0;
function ok(cond, msg) {
  if (cond) { passes++; console.log('ok   ' + msg); } else { fails++; console.log('FAIL ' + msg); }
}
function section(name, fn) {
  try { fn(); } catch (e) { fails++; console.log('FAIL ' + name + ' threw: ' + (e && e.stack || e)); }
}

// ------------------------------------------------------------------ helpers
const H = (i) => G.hand.cards[i];
const ids = (cards) => cards.map((c) => c.sort_id);
const setCard = (card, key) => card.set_base(P_CARDS[key]);
const give = (key, edition) => { const c = add_joker(key, edition); E_MANAGER.flush(); return c; };
function play(cards) {
  let r = act({ type: 'highlight', ids: ids(cards) });
  if (!r.ok) return r;
  return act({ type: 'play' });
}
function discard(cards) {
  let r = act({ type: 'highlight', ids: ids(cards) });
  if (!r.ok) return r;
  return act({ type: 'discard' });
}
/** Fresh run straight into a chosen Boss Blind (Small/Big marked skipped). */
function boss(key, opts = {}) {
  newRun({ seed: opts.seed || 'BOSS', back: opts.back || 'b_red' });
  if (opts.setup) opts.setup();
  const rr = G.GAME.round_resets;
  rr.blind_states.Small = 'Skipped'; rr.blind_states.Big = 'Skipped'; rr.blind_states.Boss = 'Select';
  G.GAME.blind_on_deck = 'Boss';
  rr.blind_choices.Boss = key;
  const r = act({ type: 'select_blind' });
  if (!r.ok || G.STATE !== STATES.SELECTING_HAND) throw new Error('could not start ' + key + ': ' + r.error + ' ' + STATE_NAMES[G.STATE]);
  return r;
}
/** Fresh run in Small Blind. */
function small(opts = {}) {
  newRun({ seed: opts.seed || 'SMALL', back: opts.back || 'b_red' });
  if (opts.setup) opts.setup();
  const r = act({ type: 'select_blind' });
  if (!r.ok || G.STATE !== STATES.SELECTING_HAND) throw new Error('could not start small: ' + r.error);
}
function gotoShop(opts = {}) {
  small(opts);
  G.GAME.blind.chips = 1;
  play([H(0)]);
  if (G.STATE !== STATES.ROUND_EVAL) throw new Error('expected ROUND_EVAL, got ' + STATE_NAMES[G.STATE]);
  act({ type: 'cash_out' });
  if (G.STATE !== STATES.SHOP) throw new Error('expected SHOP, got ' + STATE_NAMES[G.STATE]);
  G.GAME.dollars = 500;
}
const scored = (r) => { const e = r.events.filter((x) => x.type === 'hand_total').pop(); return e ? e.total : undefined; };

// ================================================================= BLINDS
section('blind basics', () => {
  small();
  ok(G.GAME.blind.name === 'Small Blind' && G.GAME.blind.get_type() === 'Small', 'Small Blind set, get_type Small');
  ok(G.GAME.blind.chips === 300 && G.GAME.blind.chip_text === '300', 'Small Blind chips 300 at ante 1');
  ok(G.GAME.blind.dollars === 3 && G.GAME.blind.boss === false, 'Small Blind reward $3, not boss');
  ok(G.GAME.blind.config.blind === P_BLINDS.bl_small, 'config.blind is the P_BLINDS proto');
  ok(G.GAME.last_blind && G.GAME.last_blind.name === 'Small Blind', 'G.GAME.last_blind tracks the blind');
  ok(G.ui_events.some((e) => e.type === 'blind' && e.action === 'set' && e.key === 'bl_small'), 'emit blind set');
  const empty = new Blind();
  ok(empty.chips === 0 && empty.get_type() === undefined, 'new Blind() is empty');
});

section('The Wall', () => {
  boss('bl_wall');
  ok(G.GAME.blind.chips === get_blind_amount(1) * 4 && G.GAME.blind.boss, 'The Wall: 4x base chips (1200)');
  G.GAME.blind.disable();
  ok(G.GAME.blind.chips === 600 && G.GAME.blind.chip_text === '600', 'The Wall disabled: chips halved');
  ok(G.ui_events.some((e) => e.type === 'blind' && e.action === 'disable'), 'emit blind disable');
});

section('The Needle', () => {
  boss('bl_needle');
  ok(G.GAME.current_round.hands_left === 1 && G.GAME.blind.hands_sub === 3, 'The Needle: 1 hand');
  ok(G.GAME.blind.chips === 300, 'The Needle: 1x chips');
  G.GAME.blind.disable(); E_MANAGER.flush();
  ok(G.GAME.current_round.hands_left === 4, 'The Needle disabled: hands restored');
});

section('The Water', () => {
  boss('bl_water');
  ok(G.GAME.current_round.discards_left === 0 && G.GAME.blind.discards_sub === 4, 'The Water: 0 discards');
  G.GAME.blind.disable(); E_MANAGER.flush();
  ok(G.GAME.current_round.discards_left === 4, 'The Water disabled: discards restored');
});

section('The Manacle', () => {
  boss('bl_manacle');
  ok(G.hand.config.card_limit === 7 && G.hand.cards.length === 7, 'The Manacle: -1 hand size');
  G.GAME.blind.disable(); pump();
  // Lua: change_size(1) draws a card AND draw_from_deck_to_hand(1) draws another -> 9 in hand.
  ok(G.hand.config.card_limit === 8 && G.hand.cards.length === 9, 'The Manacle disabled: hand size back, 2 cards drawn like Lua (' + G.hand.cards.length + ')');
  boss('bl_manacle', { seed: 'MAN2' });
  G.GAME.blind.chips = 1;
  play([H(0)]);
  ok(G.STATE === STATES.ROUND_EVAL && G.hand.config.card_limit === 8, 'The Manacle defeat: hand size restored');
  ok(G.GAME.blind.name === '' && G.GAME.blind.chips === 0, 'defeat clears the blind (set_blind(nil))');
  ok(G.ui_events.some((e) => e.type === 'blind' && e.action === 'defeat'), 'emit blind defeat');
});

section('The Arm', () => {
  boss('bl_arm', { setup: () => level_up_hand(null, 'Pair', true, 2) });
  ok(G.GAME.hands.Pair.level === 3, 'Pair at level 3 before');
  setCard(H(0), 'S_9'); setCard(H(1), 'H_9');
  play([H(0), H(1)]);
  ok(G.GAME.hands.Pair.level === 2, 'The Arm: Pair levelled down to 2');
  const lvl1 = G.GAME.hands['High Card'].level;
  setCard(H(0), 'S_A');
  play([H(0)]);
  ok(G.GAME.hands['High Card'].level === lvl1 && lvl1 === 1, 'The Arm: level 1 hand not reduced');
});

section('The Psychic', () => {
  boss('bl_psychic');
  const r = play([H(0)]);
  ok(scored(r) === 0 && G.GAME.chips === 0, 'The Psychic: 1-card hand scores 0');
  ok(G.GAME.blind.triggered === true, 'The Psychic: triggered');
  const r2 = play([H(0), H(1), H(2), H(3), H(4)]);
  ok(scored(r2) > 0, 'The Psychic: 5-card hand scores');
});

section('The Fish', () => {
  boss('bl_fish');
  ok(G.hand.cards.every((c) => c.facing === 'front'), 'The Fish: first draw face up');
  play([H(0), H(1)]);
  const back = G.hand.cards.filter((c) => c.facing === 'back').length;
  ok(back === 2, 'The Fish: cards drawn after a play are face down (' + back + ')');
});

section('The House', () => {
  boss('bl_house');
  ok(G.hand.cards.length === 8 && G.hand.cards.every((c) => c.facing === 'back'), 'The House: first hand drawn face down');
  discard([H(0)]);
  ok(G.hand.cards.filter((c) => c.facing === 'back').length === 7, 'The House: later draws face up');
  G.GAME.blind.disable();
  ok(G.hand.cards.every((c) => c.facing === 'front'), 'The House disabled: hand flipped face up');
});

section('The Wheel', () => {
  boss('bl_wheel', { setup: () => { G.GAME.probabilities.normal = 7; } });
  ok(G.hand.cards.every((c) => c.facing === 'back'), 'The Wheel: 7 in 7 -> all drawn face down');
  boss('bl_wheel', { seed: 'WHEEL2' });
  const n = G.hand.cards.filter((c) => c.facing === 'back').length;
  ok(n >= 0 && n < 8, 'The Wheel: 1 in 7 -> some face up (' + n + ' down)');
});

section('The Mark', () => {
  boss('bl_mark', { setup: () => { for (const c of G.playing_cards) if (c.base.id >= 11 && c.base.id <= 13) {} } });
  const faces = G.hand.cards.filter((c) => c.is_face(true));
  ok(G.hand.cards.every((c) => (c.facing === 'back') === c.is_face(true)), 'The Mark: exactly the face cards are face down (' + faces.length + ')');
});

section('The Ox', () => {
  boss('bl_ox', { setup: () => { G.GAME.current_round.most_played_poker_hand = 'High Card'; G.GAME.dollars = 10; } });
  E_MANAGER.flush();
  setCard(H(0), 'S_9'); setCard(H(1), 'H_9');
  play([H(0), H(1)]);
  ok(G.GAME.dollars === 10, 'The Ox: Pair keeps money');
  setCard(H(0), 'S_A');
  play([H(0)]);
  ok(G.GAME.dollars === 0, 'The Ox: most played hand sets money to $0');
});

section('The Hook', () => {
  boss('bl_hook');
  const before = G.GAME.current_round.discards_left;
  const played = H(0);
  play([played]);
  ok(G.discard.cards.length === 3 && G.discard.cards.includes(played), 'The Hook: played card + 2 random hand cards discarded');
  ok(G.GAME.current_round.discards_left === before, 'The Hook: no discard spent');
  ok(G.hand.cards.length === 8, 'The Hook: hand refilled');
});

section('The Tooth', () => {
  boss('bl_tooth', { setup: () => { G.GAME.dollars = 10; } });
  E_MANAGER.flush();
  play([H(0), H(1), H(2)]);
  ok(G.GAME.dollars === 7, 'The Tooth: -$1 per played card');
});

section('The Mouth', () => {
  boss('bl_mouth');
  setCard(H(0), 'S_9'); setCard(H(1), 'H_9');
  const r1 = play([H(0), H(1)]);
  ok(scored(r1) > 0 && G.GAME.blind.only_hand === 'Pair', 'The Mouth: first hand (Pair) locks the type');
  setCard(H(0), 'S_A');
  const r2 = play([H(0)]);
  ok(scored(r2) === 0, 'The Mouth: other hand type scores 0');
  setCard(H(0), 'S_4'); setCard(H(1), 'H_4');
  const r3 = play([H(0), H(1)]);
  ok(scored(r3) > 0, 'The Mouth: Pair again scores');
});

section('The Eye', () => {
  boss('bl_eye');
  setCard(H(0), 'S_A');
  const r1 = play([H(0)]);
  ok(scored(r1) > 0 && G.GAME.blind.hands['High Card'] === true, 'The Eye: first High Card scores');
  setCard(H(0), 'S_K');
  const r2 = play([H(0)]);
  ok(scored(r2) === 0, 'The Eye: repeated hand type scores 0');
  const b = Blind.load(G.GAME.blind.save());
  ok(b.hands['High Card'] === true && b.name === 'The Eye' && b.config.blind === P_BLINDS.bl_eye, 'The Eye: save/load keeps used hands');
});

section('The Plant', () => {
  boss('bl_plant');
  ok(G.playing_cards.every((c) => c.debuff === (c.base.id >= 11 && c.base.id <= 13)), 'The Plant: face cards debuffed');
  const c = G.playing_cards.find((x) => x.base.value === '2');
  setCard(c, 'S_K');
  ok(c.debuff === true, 'The Plant: card turned into a King gets debuffed');
  G.GAME.blind.disable();
  ok(G.playing_cards.every((x) => !x.debuff), 'The Plant disabled: debuffs cleared');
  G.GAME.blind.disabled = false;
  G.GAME.blind.set_blind(null, true);
  ok(G.playing_cards.some((x) => x.debuff) && G.playing_cards.every((x) => x.debuff === x.is_face(true)), 'set_blind(reset=true) re-applies debuffs to all cards');
});

section('The Serpent', () => {
  boss('bl_serpent');
  play([H(0), H(1), H(2), H(3), H(4)]);
  ok(G.hand.cards.length === 6, 'The Serpent: only 3 drawn after a play (' + G.hand.cards.length + ')');
});

section('The Pillar', () => {
  boss('bl_pillar', { setup: () => { G.playing_cards.slice(0, 10).forEach((c) => { c.ability.played_this_ante = true; }); } });
  ok(G.playing_cards.filter((c) => c.debuff).length === 10, 'The Pillar: cards played this ante are debuffed');
});

section('The Flint', () => {
  boss('bl_flint');
  setCard(H(0), 'S_A');
  const r = play([H(0)]);
  // High Card base 5 chips / 1 mult -> 3 chips / 1 mult, + Ace 11 chips = 14
  ok(scored(r) === 14, 'The Flint: base chips and mult halved (score ' + scored(r) + ')');
  ok(r.events.some((e) => e.type === 'hand_text' && e.modded), 'The Flint: modded hand_text emitted');
  const [m, c, modded] = G.GAME.blind.modify_hand([], {}, 'Pair', 9, 31);
  ok(m === 5 && c === 16 && modded === true, 'modify_hand returns [mult, chips, modded]');
});

for (const [key, suit] of [['bl_club', 'Clubs'], ['bl_goad', 'Spades'], ['bl_window', 'Diamonds'], ['bl_head', 'Hearts']]) {
  section(key, () => {
    boss(key);
    ok(G.playing_cards.every((c) => c.debuff === (c.base.suit === suit)), `${P_BLINDS[key].name}: ${suit} debuffed, nothing else`);
    const card = G.hand.cards.find((c) => c.base.suit === suit);
    if (card) {
      const r = play([card]);
      ok(r.events.some((e) => e.type === 'status' && e.eval_type === 'debuff'), `${P_BLINDS[key].name}: debuffed card shows debuff status`);
    }
  });
}

section('Amber Acorn', () => {
  boss('bl_final_acorn', { setup: () => { give('j_joker'); give('j_greedy_joker'); give('j_lusty_joker'); } });
  ok(G.jokers.cards.length === 3 && G.jokers.cards.every((c) => c.facing === 'back'), 'Amber Acorn: jokers flipped face down');
  ok(G.ui_events.some((e) => e.type === 'shuffle' && e.area === 'jokers'), 'Amber Acorn: jokers shuffled');
  ok(G.GAME.blind.chips === 600 && G.GAME.blind.dollars === 8, 'Amber Acorn: showdown 2x chips, $8');
  G.GAME.blind.disable();
  ok(G.jokers.cards.every((c) => c.facing === 'front'), 'Amber Acorn disabled: jokers face up');
});

section('Verdant Leaf', () => {
  boss('bl_final_leaf', { setup: () => { give('j_joker'); } });
  ok(G.playing_cards.every((c) => c.debuff), 'Verdant Leaf: all playing cards debuffed');
  ok(G.jokers.cards.every((c) => !c.debuff), 'Verdant Leaf: jokers not debuffed');
  act({ type: 'sell', id: G.jokers.cards[0].sort_id });
  ok(G.GAME.blind.disabled && G.playing_cards.every((c) => !c.debuff), 'Verdant Leaf: selling a joker disables it');
});

section('Violet Vessel', () => {
  boss('bl_final_vessel');
  ok(G.GAME.blind.chips === 1800, 'Violet Vessel: 6x chips');
  G.GAME.blind.disable();
  ok(G.GAME.blind.chips === 600, 'Violet Vessel disabled: chips / 3');
});

section('Crimson Heart', () => {
  boss('bl_final_heart', { setup: () => { give('j_joker'); give('j_greedy_joker'); give('j_lusty_joker'); } });
  ok(G.jokers.cards.filter((c) => c.debuff).length === 1, 'Crimson Heart: one joker debuffed on first draw');
  const first = G.jokers.cards.find((c) => c.debuff);
  play([H(0)]);
  const now = G.jokers.cards.filter((c) => c.debuff);
  ok(now.length === 1 && now[0] !== first, 'Crimson Heart: a different joker debuffed after each hand');
});

section('Cerulean Bell', () => {
  boss('bl_final_bell');
  const forced = G.hand.cards.filter((c) => c.ability.forced_selection);
  ok(forced.length === 1 && G.hand.highlighted.length === 1 && G.hand.highlighted[0] === forced[0], 'Cerulean Bell: one card forced selected');
  G.hand.unhighlight_all();
  ok(G.hand.highlighted.includes(forced[0]), 'Cerulean Bell: forced card cannot be deselected');
  act({ type: 'highlight', ids: [forced[0].sort_id, H(G.hand.cards.indexOf(forced[0]) === 0 ? 1 : 0).sort_id] });
  ok(G.hand.highlighted.includes(forced[0]), 'Cerulean Bell: still selected after re-highlight');
  G.GAME.blind.disable();
  ok(G.playing_cards.every((c) => !c.ability.forced_selection), 'Cerulean Bell disabled: forced selection cleared');
});

section('blind save/load + disable win', () => {
  boss('bl_wall');
  const s = G.GAME.blind.save();
  ok(s.config_blind === 'bl_wall' && JSON.stringify(JSON.parse(JSON.stringify(s))) === JSON.stringify(s), 'Blind.save is plain JSON with config_blind key');
  const b = Blind.load(s);
  ok(b.chips === 1200 && b.name === 'The Wall' && b.boss && b.config.blind === P_BLINDS.bl_wall && b.dollars === 5, 'Blind.load restores fields');
  // disable when chips already meet the target -> NEW_ROUND
  G.GAME.chips = 700;
  G.GAME.blind.disable();
  pump();
  ok(G.STATE === STATES.ROUND_EVAL, 'disable() with chips >= target ends the round');
});

section('debuff_hand check flag', () => {
  boss('bl_eye');
  const r = G.GAME.blind.debuff_hand([H(0)], {}, 'Flush', true);
  ok(!r && G.GAME.blind.hands.Flush === false, 'debuff_hand(check=true) does not record the hand');
});

// =================================================================== TAGS
section('Uncommon / Rare tags', () => {
  gotoShop();
  add_tag(new Tag('tag_uncommon'));
  const c = create_card_for_shop(G.shop_jokers); G.shop_jokers.emplace(c); E_MANAGER.flush();
  ok(c.config.center.rarity === 2 && c.ability.couponed && c.cost === 0, 'Uncommon Tag: free uncommon joker');
  ok(!G.GAME.tags.length, 'Uncommon Tag removed after use');
  ok(G.ui_events.some((e) => e.type === 'tag_removed' && e.tag === 'tag_uncommon'), 'emit tag_removed');
  add_tag(new Tag('tag_rare'));
  const r = create_card_for_shop(G.shop_jokers); G.shop_jokers.emplace(r); E_MANAGER.flush();
  ok(r.config.center.rarity === 3 && r.ability.couponed && r.cost === 0, 'Rare Tag: free rare joker');
});

for (const [tag, ed] of [['tag_foil', 'foil'], ['tag_holo', 'holo'], ['tag_polychrome', 'polychrome'], ['tag_negative', 'negative']]) {
  section(tag, () => {
    gotoShop();
    const t = new Tag(tag); add_tag(t);
    const j = new Card(P_CARDS.empty, P_CENTERS.j_joker);
    G.shop_jokers.emplace(j);
    const applied = t.apply_to_run({ type: 'store_joker_modify', card: j });
    E_MANAGER.flush();
    ok(applied === true && j.edition && j.edition[ed] && j.ability.couponed && j.cost === 0, `${t.name}: shop joker becomes free ${ed}`);
    ok(!G.GAME.tags.includes(t), `${t.name}: removed`);
  });
}

section('Investment Tag', () => {
  boss('bl_wall');
  add_tag(new Tag('tag_investment'));
  G.GAME.blind.chips = 1;
  play([H(0)]);
  const row = G.GAME.round_eval.rows.find((r) => r.tag === 'tag_investment');
  ok(row && row.dollars === 25, 'Investment Tag: +$25 after defeating the boss');
  small({ setup: () => add_tag(new Tag('tag_investment')) });
  G.GAME.blind.chips = 1; play([H(0)]);
  ok(!G.GAME.round_eval.rows.some((r) => r.tag) && G.GAME.tags.length === 1, 'Investment Tag: waits through a non-boss blind');
});

section('Voucher Tag', () => {
  small({ setup: () => add_tag(new Tag('tag_voucher')) });
  G.GAME.blind.chips = 1; play([H(0)]);
  act({ type: 'cash_out' });
  ok(G.shop_vouchers.cards.length === 2 && G.shop_vouchers.config.card_limit === 2, 'Voucher Tag: extra voucher in shop');
  ok(G.shop_vouchers.cards[0].config.center.key !== G.shop_vouchers.cards[1].config.center.key, 'Voucher Tag: different voucher');
});

section('Boss Tag', () => {
  newRun({ seed: 'BOSSTAG' });
  const before = G.GAME.round_resets.blind_choices.Boss;
  const dollars = G.GAME.dollars;
  G.GAME.round_resets.blind_tags.Small = 'tag_boss';
  act({ type: 'skip_blind' });
  ok(G.GAME.round_resets.boss_rerolled && G.GAME.dollars === dollars, 'Boss Tag: boss rerolled for free');
  ok(G.ui_events.some((e) => e.type === 'boss_rerolled'), 'Boss Tag: boss_rerolled emitted (' + before + ' -> ' + G.GAME.round_resets.blind_choices.Boss + ')');
  ok(G.GAME.tags.length === 0, 'Boss Tag consumed');
});

for (const [tag, state, n] of [['tag_charm', 'TAROT_PACK', 5], ['tag_meteor', 'PLANET_PACK', 5], ['tag_ethereal', 'SPECTRAL_PACK', 2], ['tag_standard', 'STANDARD_PACK', 5], ['tag_buffoon', 'BUFFOON_PACK', 4]]) {
  section(tag, () => {
    newRun({ seed: 'PACK' + tag });
    G.GAME.round_resets.blind_tags.Small = tag;
    const dollars = G.GAME.dollars;
    act({ type: 'skip_blind' });
    ok(STATE_NAMES[G.STATE] === state, `${tag}: free pack opened -> ${state} (${STATE_NAMES[G.STATE]})`);
    ok(G.pack_cards.cards.length === n, `${tag}: ${n} pack cards (${G.pack_cards.cards.length})`);
    ok(G.GAME.dollars === dollars, `${tag}: pack was free`);
    act({ type: 'skip_booster' });
    ok(G.STATE === STATES.BLIND_SELECT && G.GAME.tags.length === 0, `${tag}: back to blind select, tag used`);
  });
}

section('Handy / Garbage / Skip / Economy tags', () => {
  newRun({ seed: 'MONEY' });
  G.GAME.hands_played = 3; G.GAME.dollars = 4;
  G.GAME.round_resets.blind_tags.Small = 'tag_handy';
  act({ type: 'skip_blind' });
  ok(G.GAME.dollars === 7, 'Handy Tag: $1 per hand played');
  newRun({ seed: 'MONEY' });
  G.GAME.unused_discards = 5; G.GAME.dollars = 4;
  G.GAME.round_resets.blind_tags.Small = 'tag_garbage';
  act({ type: 'skip_blind' });
  ok(G.GAME.dollars === 9, 'Garbage Tag: $1 per unused discard');
  newRun({ seed: 'MONEY' });
  G.GAME.skips = 1; G.GAME.dollars = 4;
  G.GAME.round_resets.blind_tags.Small = 'tag_skip';
  act({ type: 'skip_blind' });
  ok(G.GAME.dollars === 14, 'Skip Tag: $5 per skip (2 skips)');
  newRun({ seed: 'MONEY' });
  G.GAME.dollars = 30;
  G.GAME.round_resets.blind_tags.Small = 'tag_economy';
  act({ type: 'skip_blind' });
  ok(G.GAME.dollars === 60, 'Economy Tag: doubles money');
  newRun({ seed: 'MONEY' });
  G.GAME.dollars = 100;
  G.GAME.round_resets.blind_tags.Small = 'tag_economy';
  act({ type: 'skip_blind' });
  ok(G.GAME.dollars === 140, 'Economy Tag: capped at $40');
});

section('Top-up Tag', () => {
  newRun({ seed: 'TOPUP' });
  G.GAME.round_resets.blind_tags.Small = 'tag_top_up';
  act({ type: 'skip_blind' });
  ok(G.jokers.cards.length === 2 && G.jokers.cards.every((c) => c.config.center.rarity === 1), 'Top-up Tag: 2 common jokers');
});

section('Orbital Tag', () => {
  newRun({ seed: 'ORBIT' });
  G.GAME.round_resets.ante = 2;
  G.GAME.round_resets.blind_tags.Small = 'tag_orbital';
  const t = new Tag('tag_orbital', false, 'Small');
  const hand = t.ability.orbital_hand;
  ok(G.GAME.hands[hand] && G.GAME.orbital_choices[2].Small === hand && G.GAME.orbital_choices[2].Big && G.GAME.orbital_choices[2].Boss, 'Orbital Tag: hand rolled from orbital_choices (' + hand + ')');
  act({ type: 'skip_blind' });
  ok(G.GAME.hands[hand].level === 4, 'Orbital Tag: +3 levels to ' + hand);
  const d = describeTag(t);
  ok(d.lines.join(' ').includes(hand) && d.lines.join(' ').includes('3'), 'describeTag(orbital) names the hand: ' + d.lines.join(' / '));
});

section('Double Tag', () => {
  newRun({ seed: 'DOUBLE' });
  add_tag(new Tag('tag_double'));
  G.GAME.round_resets.blind_tags.Small = 'tag_juggle';
  act({ type: 'skip_blind' });
  const keys = G.GAME.tags.map((t) => t.key);
  ok(keys.length === 2 && keys.every((k) => k === 'tag_juggle'), 'Double Tag: copies the next tag (' + keys.join(',') + ')');
  newRun({ seed: 'DOUBLE2' });
  add_tag(new Tag('tag_double'));
  G.orbital_hand = undefined;
  const o = new Tag('tag_orbital', false, 'Small');
  add_tag(o); E_MANAGER.flush();
  const copies = G.GAME.tags.filter((t) => t.key === 'tag_orbital');
  ok(copies.length === 2 && copies[1].ability.orbital_hand === o.ability.orbital_hand, 'Double Tag: Orbital copy keeps the same hand');
});

section('Juggle Tag', () => {
  newRun({ seed: 'JUGGLE' });
  G.GAME.round_resets.blind_tags.Small = 'tag_juggle';
  act({ type: 'skip_blind' });
  act({ type: 'select_blind' });
  ok(G.hand.config.card_limit === 11 && G.hand.cards.length === 11 && G.GAME.round_resets.temp_handsize === 3, 'Juggle Tag: +3 hand size this round');
  G.GAME.blind.chips = 1; play([H(0)]);
  pump();
  ok(G.hand.config.card_limit === 8 && !G.GAME.round_resets.temp_handsize, 'Juggle Tag: hand size back after the round');
});

section('D6 Tag', () => {
  small({ setup: () => add_tag(new Tag('tag_d_six')) });
  G.GAME.blind.chips = 1; play([H(0)]);
  act({ type: 'cash_out' });
  ok(G.GAME.current_round.reroll_cost === 0, 'D6 Tag: rerolls start at $0');
  G.GAME.dollars = 50;
  act({ type: 'reroll_shop' });
  ok(G.GAME.dollars === 50 && G.GAME.current_round.reroll_cost === 1, 'D6 Tag: first reroll free, then $1');
});

section('Coupon Tag', () => {
  small({ setup: () => add_tag(new Tag('tag_coupon')) });
  G.GAME.blind.chips = 1; play([H(0)]);
  act({ type: 'cash_out' });
  ok(G.shop_jokers.cards.length > 0 && G.shop_jokers.cards.every((c) => c.cost === 0) && G.shop_booster.cards.every((c) => c.cost === 0), 'Coupon Tag: shop jokers + boosters free');
  ok(G.shop_vouchers.cards.every((c) => c.cost > 0), 'Coupon Tag: voucher not free');
});

section('Tag save/load + nope', () => {
  newRun({ seed: 'TAGSAVE' });
  const t = new Tag('tag_orbital', false, 'Big');
  const s = t.save();
  const t2 = Tag.load(s);
  ok(t2.key === 'tag_orbital' && t2.ability.orbital_hand === t.ability.orbital_hand && t2.config.levels === 3, 'Tag.save/load roundtrip');
  gotoShop();
  // Rare Tag with every rare already owned -> NOPE
  for (const c of G.jokers.cards.slice()) c.remove();
  G.jokers.config.card_limit = 100;
  for (const k of Object.keys(P_CENTERS)) if (P_CENTERS[k].set === 'Joker' && P_CENTERS[k].rarity === 3) { const j = new Card(P_CARDS.empty, P_CENTERS[k]); G.jokers.cards.push(j); j.area = G.jokers; }
  const rt = new Tag('tag_rare'); add_tag(rt);
  const out = rt.apply_to_run({ type: 'store_joker_create', area: G.shop_jokers });
  E_MANAGER.flush();
  ok(out === undefined && G.ui_events.some((e) => e.type === 'tag_nope') && !G.GAME.tags.includes(rt), 'Rare Tag: NOPE when all rares owned');
});

// ================================================================== BACKS
const deckSize = () => G.playing_cards.length;
section('decks', () => {
  newRun({ seed: 'D', back: 'b_red' });
  ok(G.GAME.round_resets.discards === 4 && G.GAME.current_round.discards_left === 4, 'Red Deck: +1 discard');
  newRun({ seed: 'D', back: 'b_blue' });
  ok(G.GAME.round_resets.hands === 5, 'Blue Deck: +1 hand');
  newRun({ seed: 'D', back: 'b_yellow' });
  ok(G.GAME.dollars === 14, 'Yellow Deck: +$10');
  newRun({ seed: 'D', back: 'b_green' });
  ok(G.GAME.modifiers.money_per_hand === 2 && G.GAME.modifiers.money_per_discard === 1 && G.GAME.modifiers.no_interest, 'Green Deck: $2/hand, $1/discard, no interest');
  newRun({ seed: 'D', back: 'b_black' });
  ok(G.jokers.config.card_limit === 6 && G.GAME.round_resets.hands === 3, 'Black Deck: +1 joker slot, -1 hand');
  newRun({ seed: 'D', back: 'b_magic' });
  ok(G.GAME.used_vouchers.v_crystal_ball && G.consumeables.config.card_limit === 3, 'Magic Deck: Crystal Ball (3 consumable slots)');
  ok(G.consumeables.cards.length === 2 && G.consumeables.cards.every((c) => c.config.center.key === 'c_fool'), 'Magic Deck: 2 x The Fool');
  newRun({ seed: 'D', back: 'b_nebula' });
  ok(G.GAME.used_vouchers.v_telescope && G.consumeables.config.card_limit === 1, 'Nebula Deck: Telescope, -1 consumable slot');
  newRun({ seed: 'D', back: 'b_ghost' });
  ok(G.GAME.spectral_rate === 2 && G.consumeables.cards.length === 1 && G.consumeables.cards[0].config.center.key === 'c_hex', 'Ghost Deck: spectral rate 2, starts with Hex');
  newRun({ seed: 'D', back: 'b_abandoned' });
  ok(deckSize() === 40 && G.playing_cards.every((c) => c.base.id < 11 || c.base.id > 13), 'Abandoned Deck: 40 cards, no faces');
  newRun({ seed: 'D', back: 'b_checkered' });
  ok(G.playing_cards.filter((c) => c.base.suit === 'Spades').length === 26 && G.playing_cards.filter((c) => c.base.suit === 'Hearts').length === 26, 'Checkered Deck: 26 Spades + 26 Hearts');
  newRun({ seed: 'D', back: 'b_zodiac' });
  ok(['v_tarot_merchant', 'v_planet_merchant', 'v_overstock_norm'].every((v) => G.GAME.used_vouchers[v]), 'Zodiac Deck: 3 vouchers redeemed');
  ok(G.GAME.shop.joker_max === 3 && G.GAME.tarot_rate > 4 && G.GAME.planet_rate > 4, 'Zodiac Deck: voucher effects applied');
  newRun({ seed: 'D', back: 'b_painted' });
  ok(G.hand.config.card_limit === 10 && G.jokers.config.card_limit === 4, 'Painted Deck: +2 hand size, -1 joker slot');
  newRun({ seed: 'D', back: 'b_plasma' });
  ok(G.GAME.starting_params.ante_scaling === 2, 'Plasma Deck: ante scaling 2');
  act({ type: 'select_blind' });
  ok(G.GAME.blind.chips === 600, 'Plasma Deck: Small Blind 600');
  const r = G.GAME.selected_back.trigger_effect({ context: 'final_scoring_step', chips: 10, mult: 5 });
  ok(Array.isArray(r) && r[0] === 7 && r[1] === 7, 'Plasma Deck: trigger_effect returns averaged [chips, mult]');
  setCard(H(0), 'S_A');
  const pr = play([H(0)]);
  ok(scored(pr) === 64, 'Plasma Deck: played Ace High Card balanced 16x1 -> 8x8 = 64 (' + scored(pr) + ')');
  newRun({ seed: 'D', back: 'b_red' });
  ok(G.GAME.selected_back.trigger_effect({ context: 'final_scoring_step', chips: 10, mult: 5 }) === undefined, 'non-Plasma trigger_effect returns undefined');
  newRun({ seed: 'D', back: 'b_erratic' });
  const keys = new Set(G.playing_cards.map((c) => c.base.suit + c.base.value));
  ok(deckSize() === 52 && keys.size < 52, 'Erratic Deck: 52 random cards (' + keys.size + ' distinct)');
  newRun({ seed: 'D', back: 'b_anaglyph' });
  ok(G.GAME.tags.length === 0, 'Anaglyph Deck: no tag at start');
  act({ type: 'select_blind' }); G.GAME.blind.chips = 1; play([H(0)]);
  ok(G.GAME.tags.length === 0, 'Anaglyph Deck: no Double Tag after Small Blind');
  boss('bl_wall', { back: 'b_anaglyph' }); G.GAME.blind.chips = 1; play([H(0)]);
  ok(G.GAME.tags.length === 1 && G.GAME.tags[0].key === 'tag_double', 'Anaglyph Deck: Double Tag after defeating the boss');
  const bk = Back.load(JSON.parse(JSON.stringify(G.GAME.selected_back.save())));
  ok(bk.name === 'Anaglyph Deck' && bk.effect.center === P_CENTERS.b_anaglyph, 'Back.save/load roundtrip');
});

// =============================================================== DESCRIBE
section('describe', () => {
  small({ seed: 'DESC' });
  const txt = (d) => d.lines.join(' | ');
  const J = (key, f) => { const c = give(key); if (f) f(c); return [c, describe(c)]; };
  let c, d;
  [, d] = J('j_joker'); ok(txt(d).includes('+4') && d.name === 'Joker' && d.badges[0].key === 'common', 'Joker: +4 Mult, common badge');
  [, d] = J('j_ride_the_bus', (x) => { x.ability.mult = 7; }); ok(txt(d).includes('Currently {C:mult}+7'), 'Ride the Bus: current mult 7');
  [, d] = J('j_castle', (x) => { x.ability.extra.chips = 12; });
  ok(txt(d).includes('+12') && txt(d).includes(G.GAME.current_round.castle_card.suit.replace(/s$/, '')) && d.colours[0] === G.GAME.current_round.castle_card.suit, 'Castle: current chips + suit');
  [c, d] = J('j_todo_list'); ok(txt(d).includes(c.ability.to_do_poker_hand), 'To Do List: shows hand ' + c.ability.to_do_poker_hand);
  [, d] = J('j_idol'); ok(txt(d).includes(G.GAME.current_round.idol_card.rank) && txt(d).includes(G.GAME.current_round.idol_card.suit), 'The Idol: rank + suit');
  [, d] = J('j_ancient'); ok(txt(d).includes(G.GAME.current_round.ancient_card.suit.replace(/s$/, '')), 'Ancient Joker: suit');
  [, d] = J('j_loyalty_card'); ok(txt(d).includes('remaining'), 'Loyalty Card: remaining text: ' + txt(d));
  [, d] = J('j_blue_joker'); ok(txt(d).includes('+' + 2 * G.deck.cards.length), 'Blue Joker: chips from deck size');
  [, d] = J('j_misprint'); ok(txt(d).includes('+0-23'), 'Misprint: range line');
  [, d] = J('j_blueprint'); ok(/compatible/.test(txt(d)), 'Blueprint: compat line');
  [, d] = J('j_bull', () => { G.GAME.dollars = 9; }); ok(txt(d).includes('+18'), 'Bull: 2 x $9');
  [, d] = J('j_erosion'); ok(txt(d).includes('+0') && txt(d).includes('52'), 'Erosion: deck size');
  [, d] = J('j_satellite'); ok(txt(d).includes('$0'), 'Satellite: $0 with no planets');
  [, d] = J('j_sly'); ok(txt(d).includes('+50') && txt(d).includes('Pair'), 'Sly Joker: chips + Pair');
  [, d] = J('j_greedy_joker'); ok(txt(d).includes('Diamond'), 'Greedy Joker: Diamond');
  [, d] = J('j_space', () => { G.GAME.probabilities.normal = 2; }); ok(txt(d).includes('2 in 4'), 'Space Joker: probability 2 in 4: ' + txt(d));
  G.GAME.probabilities.normal = 1;
  [, d] = J('j_gros_michel'); ok(txt(d).includes('+15') && txt(d).includes('1 in 6'), 'Gros Michel');
  [, d] = J('j_drivers_license'); ok(txt(d).includes('Currently {C:attention}' ) || txt(d).includes('0'), "Driver's License tally");
  [, d] = J('j_bootstraps', () => { G.GAME.dollars = 11; }); ok(txt(d).includes('+4'), 'Bootstraps: +2 per $5 at $11 -> +4');
  [, d] = J('j_yorick'); ok(txt(d).includes('23'), 'Yorick: 23 discards remaining');
  [c, d] = J('j_joker', (x) => { x.set_edition({ holo: true }, true, true); x.set_eternal(true); x.set_rental(true); });
  ok(d.badges.map((b) => b.key).join(',') === 'common,holographic,eternal,rental' && d.info.some((i) => i.key === 'e_holo') && d.info.some((i) => i.key === 'rental' && i.lines.join().includes('$3')), 'Joker badges: edition/eternal/rental + info boxes');
  [c, d] = J('j_joker', (x) => { x.set_perishable(); x.ability.perish_tally = 3; });
  ok(d.badges.some((b) => b.key === 'perishable' && b.tally === 3) && d.info.some((i) => i.key === 'perishable' && i.lines.join().includes('3')), 'Perishable badge + remaining');

  // consumables
  const C = (key) => describe(new Card(P_CARDS.empty, P_CENTERS[key]));
  level_up_hand(null, 'Pair', true, 2);
  d = C('c_mercury'); ok(txt(d).includes('lvl.3') && txt(d).includes('Pair') && d.badges[0].key === 'planet', 'Mercury: live level 3');
  G.GAME.last_tarot_planet = 'c_strength';
  d = C('c_fool'); ok(txt(d).includes('Strength'), 'The Fool: last used Strength');
  d = C('c_magician'); ok(txt(d).includes('2') && txt(d).includes('Lucky') && d.info.some((i) => i.key === 'm_lucky'), 'The Magician: 2 cards, Lucky info');
  d = C('c_star'); ok(txt(d).includes('Diamonds'), 'The Star: Diamonds');
  d = C('c_temperance'); ok(/\$\d+/.test(txt(d)), 'Temperance: sell value total');
  d = C('c_immolate'); ok(txt(d).includes('5') && txt(d).includes('$20'), 'Immolate: 5 cards, $20');
  d = C('c_ectoplasm'); ok(txt(d).includes('1') && d.badges[0].key === 'spectral', 'Ectoplasm: ecto_minus');
  d = C('v_seed_money'); ok(txt(d).includes('$10'), 'Seed Money: interest cap $10');
  d = C('p_arcana_mega_1'); ok(d.name.includes('Arcana') && txt(d).includes('2') && txt(d).includes('5'), 'Mega Arcana: choose 2 of 5');

  // playing cards
  const pc = G.hand.cards[0];
  setCard(pc, 'H_K'); pc.set_seal('Gold', true); pc.set_edition({ foil: true }, true, true); pc.ability.perma_bonus = 5;
  d = describe(pc);
  ok(d.name.includes('King') && d.name.includes('Hearts') && txt(d).includes('+10') && txt(d).includes('+5'), 'playing card: King of Hearts, +10 chips, +5 extra');
  ok(d.badges.map((b) => b.key).join(',') === 'foil,gold_seal' && d.info.some((i) => i.key === 'gold_seal') && d.info.some((i) => i.key === 'e_foil'), 'playing card: foil + gold seal badges/info');
  const glass = G.hand.cards[1]; glass.set_ability(P_CENTERS.m_glass);
  d = describe(glass); ok(txt(d).includes('X2') && txt(d).includes('1 in 4'), 'Glass Card: X2, 1 in 4');
  const stone = G.hand.cards[2]; stone.set_ability(P_CENTERS.m_stone);
  d = describe(stone); ok(txt(d).includes('+50'), 'Stone Card: +50 chips');
  const deb = G.hand.cards[3]; deb.set_debuff(true);
  d = describe(deb); ok(txt(d).includes('Scores no chips') && d.badges[0].key === 'debuffed', 'debuffed card text');
  deb.set_debuff(false);

  // blinds / tags / backs
  G.GAME.current_round.most_played_poker_hand = 'Flush';
  ok(describeBlind('bl_ox').lines.join(' ').includes('Flush'), 'describeBlind Ox: most played hand');
  G.GAME.probabilities.normal = 2;
  ok(describeBlind('bl_wheel').lines[0].startsWith('2 in 7'), 'describeBlind Wheel: probability');
  G.GAME.probabilities.normal = 1;
  ok(describeBlind('bl_wall').chips === 1200 && describeBlind('bl_wall').dollars === 5, 'describeBlind Wall: chips + reward');
  ok(describeBlind('bl_small').active && describeBlind('bl_small').chips === 300, 'describeBlind: live Small Blind');
  ok(describeTag('tag_skip').lines.join(' ').includes('$5'), 'describeTag Skip: $5 per skip');
  ok(describeTag('tag_economy').lines.join(' ').includes('$40'), 'describeTag Economy: max $40');
  ok(describeTag('tag_handy').lines.join(' ').includes('$1'), 'describeTag Handy');
  for (const k of Object.keys(P_CENTERS).filter((x) => P_CENTERS[x].set === 'Back' && x !== 'b_challenge')) {
    const b = describeBack(k);
    if (!(b && b.lines.length && b.lines.every((l) => !/#\d#/.test(l)))) ok(false, 'describeBack ' + k + ': ' + JSON.stringify(b));
  }
  ok(describeBack('b_plasma').lines.join(' ').includes('X2'), 'describeBack Plasma: X2 blind size');
  ok(describeBack('b_black').lines.join(' ').includes('-1'), 'describeBack Black: -1 hand');
  // No unfilled #n# placeholders anywhere in the collection.
  const unfilled = [];
  for (const k of Object.keys(P_CENTERS)) {
    const s = P_CENTERS[k].set;
    if (!['Joker', 'Tarot', 'Planet', 'Spectral', 'Voucher', 'Booster', 'Edition', 'Enhanced'].includes(s)) continue;
    const dd = describeCenter(k);
    if (!dd || dd.lines.some((l) => /#\d#/.test(l))) unfilled.push(k);
  }
  ok(unfilled.length === 0, 'describeCenter fills every placeholder (' + unfilled.join(',') + ')');
  const unfilledB = Object.keys(P_BLINDS).filter((k) => describeBlind(k).lines.some((l) => /#\d#/.test(l)));
  ok(unfilledB.length === 0, 'describeBlind fills every placeholder (' + unfilledB.join(',') + ')');
});

console.log(`\n${passes} passed, ${fails} failed`);
if (fails) process.exit(1);
