// Bunco jokers, part B (micatro/mods/bunco/jokers_b.js): every joker fired through real act() plays with the
// mod's numbers, every describe() filled, and one test per intended-design fix.
//   node micatro/tests/mods/bunco_jokers_b_test.mjs
import {
  ok, near, done, flush, start, clearHand, hand, add, clearJokers, clearConsumables, play, discard, nextRound, toShop,
  msgs, tot, filled, G, P_CENTERS, P_CARDS, act, STATES,
} from './bunco_helpers.mjs';
import { P_CENTER_POOLS, create_card, level_up_hand, create_playing_card } from '../../js/engine/core.js';
import { describe, describeCenter } from '../../js/engine/describe.js';
import { centers, reset_run } from '../../mods/bunco/jokers_b.js';

const SLUGS = 'slothful neon gameplan conquest hierarchy_of_needs dwarven aristocrat metallurgist juggalo head_in_the_clouds headshot trigger_finger hopscotch pawn puzzle_board vandalism protester doodle disproportionality running_joke on_broadway rasta critic cellphone wino'.split(' ');
const KEYS = SLUGS.map((k) => 'j_bunc_' + k);
const addCons = (key) => { const c = create_card(null, G.consumeables, null, null, null, null, key); c.add_to_deck(); G.consumeables.emplace(c); flush(); return c; };
const hc = (k = 'S_2', center) => play(hand([k], center));

// ------------------------------------------------------------------ registration
start('BJBON');
ok(centers.length === 25 && centers.every((c, i) => c.key === KEYS[i]), '25 jokers, in the Lua order', centers.map((c) => c.key));
ok(KEYS.every((k) => P_CENTERS[k]), 'all registered');
ok(P_CENTERS.j_bunc_trigger_finger.rarity === 3 && P_CENTERS.j_bunc_trigger_finger.cost === 8 && P_CENTERS.j_bunc_doodle.cost === 10
  && P_CENTERS.j_bunc_hierarchy_of_needs.rarity === 1 && P_CENTERS.j_bunc_neon.blueprint_compat === false, 'data: rarity / cost / compat');
for (const k of KEYS) {
  const c = add(k);
  ok(filled(describe(c)), 'describe filled: ' + k, describe(c));
  ok(filled(describeCenter(k)), 'describeCenter filled: ' + k, describeCenter(k));
  c.remove();
}
flush();
// in_pool gates
{
  start('BJBPOOL');
  ok(!P_CENTERS.j_bunc_slothful.in_pool() && !P_CENTERS.j_bunc_dwarven.in_pool() && !P_CENTERS.j_bunc_metallurgist.in_pool(), 'Slothful / Dwarven / Metallurgist need Wild / Stone / Gold cards');
  ok(!P_CENTERS.j_bunc_head_in_the_clouds.in_pool(), 'Head in the Clouds needs High Card above level 1');
  hand(['S_3'], 'm_wild'); hand(['S_4'], 'm_stone'); hand(['S_5'], 'm_gold'); level_up_hand(null, 'High Card');
  ok(P_CENTERS.j_bunc_slothful.in_pool() && P_CENTERS.j_bunc_dwarven.in_pool() && P_CENTERS.j_bunc_metallurgist.in_pool() && P_CENTERS.j_bunc_head_in_the_clouds.in_pool(), 'in_pool once present');
}

// ------------------------------------------------------------------ jokers
{ // Slothful: scored Wild Cards +9 Mult
  start('BJB1'); add('j_bunc_slothful');
  let r = hc('S_2', 'm_wild'); ok(r.total.chips === 7 && r.total.mult === 10, 'Slothful +9 on a Wild Card', tot(r));
  r = hc('S_2'); ok(r.total.mult === 1, 'Slothful ignores plain cards', tot(r));
}
{ // Neon: a playing card that becomes enhanced gains Fluorescent
  start('BJB2'); add('j_bunc_neon');
  const [a, b] = hand(['S_2', 'S_3']);
  b.set_edition({ foil: true }, true);
  a.set_ability(P_CENTERS.m_bonus); b.set_ability(P_CENTERS.m_bonus); flush();
  ok(a.edition && a.edition.bunc_fluorescent, 'Neon: enhanced card -> Fluorescent', a.edition);
  ok(b.edition && b.edition.foil && !b.edition.bunc_fluorescent, 'Neon: an editioned card keeps its edition', b.edition);
  const [c] = hand(['S_4']); c.set_ability(P_CENTERS.c_base); flush();
  ok(!c.edition, 'Neon: not for a base (non-Enhanced) centre');
}
{ // Gameplan: neighbours debuffed, +20 Mult per neighbour
  start('BJB3');
  const j1 = add('j_joker'); const gp = add('j_bunc_gameplan'); const j2 = add('j_joker'); const j3 = add('j_joker');
  act({ type: 'highlight', ids: [] }); flush();
  ok(j1.debuff && j2.debuff && !j3.debuff && !gp.debuff, 'Gameplan debuffs only its neighbours', [j1.debuff, j2.debuff, j3.debuff]);
  const r = hc(); ok(r.total.chips === 7 && r.total.mult === 1 + 40 + 4, 'Gameplan +40 (two neighbours) + the free Joker', tot(r));
  // reorder: Gameplan to the far right -> only j3 next to it
  act({ type: 'reorder', area: 'jokers', ids: [j1.sort_id, j2.sort_id, j3.sort_id, gp.sort_id] });
  ok(!j1.debuff && !j2.debuff && j3.debuff, 'after reorder: only the new neighbour', [j1.debuff, j2.debuff, j3.debuff]);
  // selling Gameplan frees its neighbour (remove_from_deck runs once it has left G.jokers)
  act({ type: 'sell', id: gp.sort_id }); flush();
  ok(!G.jokers.cards.includes(gp) && !j3.debuff, 'sold Gameplan -> neighbour no longer debuffed', j3.debuff);
}
{ // Conquest: +200 Chips, a random other joker debuffed when the blind is selected
  start('BJB4', { noBlind: true });
  const j1 = add('j_joker'); const cq = add('j_bunc_conquest');
  act({ type: 'select_blind' }); clearHand(); flush();
  ok(cq.ability.extra.joker === j1.sort_id && j1.debuff && !cq.debuff, 'Conquest debuffed the other joker', cq.ability.extra.joker);
  const r = hc(); ok(r.total.chips === 207 && r.total.mult === 1, 'Conquest +200 chips (Joker debuffed)', tot(r));
  act({ type: 'sell', id: cq.sort_id }); flush();
  ok(!j1.debuff, 'sold Conquest -> its target freed', j1.debuff);
  // alone: no target
  start('BJB4b', { noBlind: true }); const c2 = add('j_bunc_conquest'); act({ type: 'select_blind' });
  ok(c2.ability.extra.joker === 0 && !c2.debuff, 'Conquest alone: no target');
}
{ // Hierarchy of Needs: +5 Mult per complete 2..Ace suit run in the full deck (standard deck: 4)
  start('BJB5'); const h = add('j_bunc_hierarchy_of_needs');
  let r = hc(); ok(r.total.mult === 1 + 20, 'Hierarchy: 4 full suits -> +20', tot(r));
  const sa = G.playing_cards.find((c) => c.base.suit === 'Spades' && c.base.value === 'Ace'); sa.remove(); flush();
  r = hc(); ok(r.total.mult === 1 + 15, 'Hierarchy: a missing Ace of Spades -> +15', tot(r));
  for (const c of G.playing_cards.filter((c) => c.base.suit === 'Hearts' && c.base.value === 'King')) c.set_ability(P_CENTERS.m_stone);
  r = hc(); ok(r.total.mult === 1 + 10, 'Hierarchy: Stone cards don\'t count', tot(r));
  ok(h.ability.extra.mult === 10, 'Currently +10');
}
{ // Dwarven: Stone Cards held have Steel (X1.5) and Gold ($3) abilities
  start('BJB6'); const st = hand(['S_K'], 'm_stone')[0]; G.hand.remove_card(st); G.deck.emplace(st);
  add('j_bunc_dwarven');
  ok(P_CENTERS.m_stone.config.h_x_mult === 1.5 && P_CENTERS.m_stone.config.h_dollars === 3, 'Dwarven raised the Stone centre', P_CENTERS.m_stone.config);
  ok(st.ability.h_x_mult === 1.5 && st.ability.h_dollars === 3, 'existing Stone card gained them');
  G.deck.remove_card(st); G.hand.emplace(st);
  const [p] = hand(['S_2']);
  const r = play([p], { keepHand: true }); ok(r.total.chips === 7 && near(r.total.mult, 1.5), 'Dwarven: held Stone X1.5', tot(r));
  const fresh = hand(['H_4'], 'm_stone')[0]; ok(fresh.ability.h_x_mult === 1.5, 'new Stone cards too (centre config)');
  reset_run(); ok(P_CENTERS.m_stone.config.h_x_mult === undefined || P_CENTERS.m_stone.config.h_x_mult === 0, 'reset_run restores the Stone centre', P_CENTERS.m_stone.config);
  start('BJB6b'); ok(!P_CENTERS.m_stone.config.h_dollars, 'new run: vanilla Stone config', P_CENTERS.m_stone.config);
  // remove_from_deck takes it back
  const s2 = hand(['S_K'], 'm_stone')[0]; const dw = add('j_bunc_dwarven'); dw.remove(); flush();
  ok(s2.ability.h_x_mult === 0 && s2.ability.h_dollars === 0 && P_CENTERS.m_stone.config.h_x_mult === 0, 'Dwarven removed -> back to 0', s2.ability);
}
{ // Aristocrat: +1 choice in booster packs
  start('BJB7'); add('j_bunc_aristocrat'); toShop();
  G.GAME.dollars = 100;
  const pack = G.shop_booster.cards[0];
  const choose = pack.config.center.config.choose;
  act({ type: 'buy', id: pack.sort_id });
  ok(G.GAME.pack_choices === Math.min(choose + 1, G.pack_cards.cards.length), 'Aristocrat: +1 pick', [G.GAME.pack_choices, choose, pack.config.center.key]);
}
{ // Metallurgist: held Gold Cards +10 Mult
  start('BJB8'); const g = hand(['S_K'], 'm_gold')[0]; G.hand.remove_card(g); G.deck.emplace(g);
  const m = add('j_bunc_metallurgist');
  ok(g.ability.h_mult === 10 && P_CENTERS.m_gold.config.h_mult === 10, 'Metallurgist: Gold h_mult 10');
  G.deck.remove_card(g); G.hand.emplace(g);
  const r = play(hand(['S_2']), { keepHand: true }); ok(r.total.mult === 11, 'Metallurgist: held Gold +10 Mult', tot(r));
  m.remove(); flush(); ok(g.ability.h_mult === 0 && P_CENTERS.m_gold.config.h_mult === 0, 'removed -> 0');
  reset_run(); ok(P_CENTERS.m_gold.config.h_mult === undefined && P_CENTERS.m_gold.config.h_dollars === 3, 'reset_run restores Gold', P_CENTERS.m_gold.config);
}
{ // Juggalo: an edition on a random editionless consumable when the blind is selected
  start('BJB9', { noBlind: true }); add('j_bunc_juggalo');
  const t = addCons('c_strength');
  act({ type: 'select_blind' }); clearHand(); flush();
  ok(t.edition && ['foil', 'holo', 'polychrome', 'bunc_glitter'].some((k) => t.edition[k]), 'Juggalo gave an edition', t.edition);
  // FIX 2: only editioned consumables -> nothing picked (the Lua's math.random(0) raised)
  start('BJB9b', { noBlind: true }); const jg = add('j_bunc_juggalo');
  const t2 = addCons('c_strength'); t2.set_edition({ foil: true }, true);
  const before = JSON.stringify(G.GAME.pseudorandom.__math_random);
  jg.calculate_joker({ setting_blind: true }); flush();
  ok(JSON.stringify(G.GAME.pseudorandom.__math_random) === before && t2.edition.foil, 'FIX 2: no pick (no math.random(0)) when every consumable has an edition');
}
{ // Head in the Clouds: 1 in 3 to upgrade High Card on any level up
  start('BJB10'); add('j_bunc_head_in_the_clouds');
  G.GAME.probabilities.normal = 3;
  const hcl = G.GAME.hands['High Card'].level, pl = G.GAME.hands.Pair.level;
  level_up_hand(null, 'Pair'); flush();
  ok(G.GAME.hands.Pair.level === pl + 1 && G.GAME.hands['High Card'].level === hcl + 1, 'Head in the Clouds: High Card +1 (no loop)', [G.GAME.hands.Pair.level, G.GAME.hands['High Card'].level]);
  level_up_hand(null, 'Pair', null, -1); flush();
  ok(G.GAME.hands['High Card'].level === hcl + 1, 'not for a level-down');
  G.GAME.probabilities.normal = 0; level_up_hand(null, 'Pair'); flush();
  ok(G.GAME.hands['High Card'].level === hcl + 1, 'roll failed -> nothing');
  const pl2 = addCons('c_pluto'); G.GAME.probabilities.normal = 3;
  act({ type: 'use', id: pl2.sort_id }); flush();
  ok(G.GAME.hands['High Card'].level === hcl + 3, 'Pluto + Head in the Clouds: High Card +2', G.GAME.hands['High Card'].level);
}
{ // Headshot: X3 with exactly one scoring face card
  start('BJB11'); add('j_bunc_headshot');
  let r = hc('S_K'); ok(r.total.chips === 15 && r.total.mult === 3, 'Headshot X3', tot(r));
  r = play(hand(['S_K', 'H_K'])); ok(r.total.mult === 2, 'two faces: no', tot(r));
}
{ // Trigger Finger: X4; selecting a card may play the selection
  start('BJB12'); add('j_bunc_trigger_finger');
  G.GAME.probabilities.normal = 0;
  let r = hc(); ok(r.total.mult === 4 && r.total.total === 28, 'Trigger Finger X4', tot(r));
  G.GAME.probabilities.normal = 10; G.GAME.chips = 0; G.GAME.blind.chips = 1e15; G.GAME.current_round.hands_left = 3;
  const [c] = hand(['S_A']); const hp = G.GAME.current_round.hands_played;
  const res = act({ type: 'highlight', ids: [c.sort_id] });
  ok(G.GAME.current_round.hands_played === hp + 1 && msgs(res.events).includes('Pew!'), 'Trigger Finger played the hand on select', msgs(res.events));
  const t = res.events.find((e) => e.type === 'hand_total'); ok(t && t.chips === 16 && t.mult === 4, 'scored with X4', t);
}
{ // Hopscotch: +1 discard on a Straight
  start('BJB13'); add('j_bunc_hopscotch');
  const d = G.GAME.current_round.discards_left;
  play(hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']));
  ok(G.GAME.current_round.discards_left === d + 1, 'Hopscotch +1 discard', G.GAME.current_round.discards_left);
  hc(); ok(G.GAME.current_round.discards_left === d + 1, 'not without a Straight');
}
{ // Pawn: scored cards of the deck's lowest rank rank up
  start('BJB14'); const pw = add('j_bunc_pawn');
  ok(describe(pw).lines.some((l) => l.includes('2')), 'Pawn shows 2', describe(pw).lines);
  const [c, d] = hand(['S_2', 'H_3']);
  play([c, d], { keepHand: true }); // high card: only the 3 scores
  ok(c.base.value === '2' && d.base.value === '3', 'Pawn: only scoring cards of the lowest rank');
  clearHand();
  const [e] = hand(['S_2']); play([e], { keepHand: true });
  ok(e.base.value === '3' && e.base.suit === 'Spades', 'Pawn: the 2 became a 3', e.base);
  const [a] = hand(['H_A']); for (const x of G.playing_cards) if (x !== a) x.set_ability(P_CENTERS.m_stone);
  play([a], { keepHand: true }); ok(a.base.value === '2', 'Pawn: an Ace wraps to 2 (SMODS Ace.next)', a.base);
  // FIX 3: the description names the rank (the Lua localized the id: '11' for a Jack)
  const save = G.playing_cards; G.playing_cards = [create_playing_card({ front: P_CARDS.S_J, center: P_CENTERS.c_base }, G.deck)];
  const ln = describe(pw).lines.join(' '); G.playing_cards = save;
  ok(/Jack/.test(ln) && !/\b11\b/.test(ln), 'FIX 3: Pawn says "Jack"', ln);
}
{ // Puzzle Board: Tarot used -> 1 in 4 to add Foil/Holo/Poly/Glitter to a random selected card
  start('BJB15'); add('j_bunc_puzzle_board'); G.GAME.probabilities.normal = 4;
  const [c] = hand(['S_5']); const t = addCons('c_strength');
  act({ type: 'use', id: t.sort_id, targets: [c.sort_id] }); flush();
  ok(c.edition && ['foil', 'holo', 'polychrome', 'bunc_glitter'].some((k) => c.edition[k]), 'Puzzle Board: edition added', c.edition);
  G.GAME.probabilities.normal = 0; const [c2] = hand(['S_6']); const t2 = addCons('c_strength');
  const res = act({ type: 'use', id: t2.sort_id, targets: [c2.sort_id] });
  ok(!c2.edition && msgs(res.events).includes('Nope!'), 'Puzzle Board: Nope!', msgs(res.events));
  // the 'wheel_of_fortune' poll: base editions + Glitter (gameplay_reworks on), never Negative / Fluorescent
  G.GAME.probabilities.normal = 4; const pb = G.jokers.cards[0]; const seen = {};
  for (let i = 0; i < 200; i++) {
    const [x] = hand(['S_7']); G.hand.add_to_highlighted(x);
    pb.calculate_joker({ using_consumeable: true, consumeable: t }); flush();
    if (x.edition) seen[x.edition.type || Object.keys(x.edition).find((k) => x.edition[k] === true)] = 1;
    clearHand();
  }
  ok(seen.bunc_glitter && seen.foil && !seen.bunc_fluorescent && !seen.negative, 'Puzzle Board rolls Foil/Holo/Poly/Glitter', seen);
}
{ // Vandalism: 1 in 4 to draw face down; face-down cards X2 when scored
  start('BJB16', { noBlind: true }); add('j_bunc_vandalism'); G.GAME.probabilities.normal = 4;
  act({ type: 'select_blind' }); flush();
  ok(G.hand.cards.length > 0 && G.hand.cards.every((c) => c.facing === 'back'), 'Vandalism: drawn face down', G.hand.cards.map((c) => c.facing));
  const c = G.hand.cards[0];
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15; G.GAME.current_round.hands_left = 3;
  act({ type: 'highlight', ids: [c.sort_id] }); const res = act({ type: 'play' });
  const t = res.events.find((e) => e.type === 'hand_total');
  ok(t && t.mult === 2, 'Vandalism: face-down card X2', t);
  clearHand(); G.GAME.probabilities.normal = 0;
  const [u] = hand(['S_2']); const r2 = play([u]); ok(r2.total.mult === 1, 'face-up card: no X2', tot(r2));
}
{ // Protester: 8X the highest rank discarded this round as Chips
  start('BJB17'); const p = add('j_bunc_protester');
  discard(hand(['S_K', 'H_3'])); flush();
  ok(p.ability.extra.chips === 80, 'Protester: King -> 80', p.ability.extra.chips);
  clearHand(); discard(hand(['S_Q'])); clearHand();
  ok(p.ability.extra.chips === 80, 'Queen (same nominal) keeps 80');
  discard(hand(['S_A'])); clearHand(); ok(p.ability.extra.chips === 88, 'Ace -> 88');
  const r = hc(); ok(r.total.chips === 7 + 88, 'Protester +88 chips', tot(r));
  nextRound(); ok(p.ability.extra.chips === 0 && p.ability.extra.rank === -9999, 'reset at end of round');
  // FIX 1: a discarded Stone Card doesn't count (the Lua tested the i-th HAND card)
  hand(['S_2']); const st = hand(['S_K'], 'm_stone')[0];
  discard([st]); flush();
  ok(p.ability.extra.chips === 0, 'FIX 1: Stone Card discarded -> nothing', p.ability.extra.chips);
}
{ // Doodle: copies the first Tarot / Planet used each round
  start('BJB18'); add('j_bunc_doodle');
  const m = addCons('c_mercury');
  act({ type: 'use', id: m.sort_id }); flush();
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].config.center.key === 'c_mercury', 'Doodle copied Mercury', G.consumeables.cards.map((c) => c.config.center.key));
  act({ type: 'use', id: G.consumeables.cards[0].sort_id }); flush();
  ok(G.consumeables.cards.length === 0, 'only once per round');
  nextRound();
  const v = addCons('c_venus'); act({ type: 'use', id: v.sort_id }); flush();
  ok(G.consumeables.cards.length === 1, 'active again next round');
}
{ // Disproportionality: +0-200 Chips
  start('BJB19'); add('j_bunc_disproportionality');
  const vals = []; for (let i = 0; i < 6; i++) { const r = hc(); vals.push(r.total.chips - 7); }
  ok(vals.every((v) => v >= 0 && v <= 200 && Number.isInteger(v)) && new Set(vals).size > 1, 'Disproportionality 0-200', vals);
  start('BJB19'); add('j_bunc_disproportionality'); const again = hc().total.chips - 7;
  ok(again === vals[0], 'seeded');
}
{ // Running Joke: a Negative Joker in every new shop
  start('BJB20'); add('j_bunc_running_joke'); toShop(); flush();
  const nj = G.shop_jokers.cards.filter((c) => c.config.center.key === 'j_joker' && c.edition && c.edition.negative);
  ok(nj.length >= 1 && G.shop_jokers.cards.length === G.GAME.shop.joker_max, 'Running Joke: Negative Joker in the shop (takes a slot)', G.shop_jokers.cards.map((c) => c.config.center.key));
}
{ // On Broadway: +120 Chips +20 Mult on a Straight with a scoring face
  start('BJB21'); add('j_bunc_on_broadway');
  let r = play(hand(['S_9', 'H_T', 'D_J', 'C_Q', 'S_K'])); ok(r.total.chips === 79 + 120 && r.total.mult === 24, 'On Broadway', tot(r));
  r = play(hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6'])); ok(r.total.chips === 50 && r.total.mult === 4, 'no face: nothing', tot(r));
}
{ // Rasta: +12 Mult with no enhanced scoring card
  start('BJB22'); add('j_bunc_rasta');
  let r = hc(); ok(r.total.mult === 13, 'Rasta +12', tot(r));
  r = hc('S_2', 'm_bonus'); ok(r.total.mult === 1, 'enhanced: no', tot(r));
}
{ // Critic: X2 if the score so far is under 1/3 of the blind
  start('BJB23'); add('j_bunc_critic');
  let r = hc(); ok(r.total.mult === 2, 'Critic X2 (far under)', tot(r));
  clearHand(); G.GAME.chips = 0; G.GAME.current_round.hands_left = 3;
  const [c] = hand(['S_A']); G.GAME.blind.chips = 3 * 16; // 16 x 1 = 16, not < 16
  act({ type: 'highlight', ids: [c.sort_id] }); const res = act({ type: 'play' });
  const t = res.events.find((e) => e.type === 'hand_total'); ok(t && t.mult === 1, 'Critic: 16 not < 48/3 -> no X2', t);
}
{ // Cellphone: scored cards return to hand after the first play (if no discard first)
  start('BJB24'); add('j_bunc_cellphone');
  const cs = hand(['S_K', 'H_K', 'D_4']);
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) }); const res = act({ type: 'play' });
  ok(cs[0].area === G.hand && cs[1].area === G.hand && cs[2].area === G.discard, 'Cellphone: scored Kings back in hand, the 4 discarded', cs.map((c) => c.area && c.area.config.type));
  ok(msgs(res.events).includes('Accepted!'), 'Accepted!', msgs(res.events));
  clearHand();
  const ds = hand(['S_Q']); play(ds, { keepHand: true }); ok(ds[0].area === G.discard, 'second play: to the discard');
  nextRound();
  const r = discard(hand(['S_5'])); ok(msgs(r.events).includes('Declined...'), 'discard first: Declined...', msgs(r.events));
  clearHand(); const q = hand(['S_9']); play(q, { keepHand: true }); ok(q[0].area === G.discard, 'declined: first play goes to the discard');
}
{ // Wino: Hearts / Diamonds +12 Chips
  start('BJB25'); add('j_bunc_wino');
  let r = hc('H_2'); ok(r.total.chips === 19, 'Wino Heart +12', tot(r));
  r = hc('D_2'); ok(r.total.chips === 19, 'Wino Diamond +12', tot(r));
  r = hc('S_2'); ok(r.total.chips === 7, 'Spade: nothing', tot(r));
}
void clearJokers; void clearConsumables; void STATES; void P_CENTER_POOLS;
done();
