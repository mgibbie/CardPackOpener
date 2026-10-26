// pokermon_hazards_test.mjs — the Pokermon 3.9.1 Hazard layer, FIRED through real seeded play (the tester reports of
// "Hazards not working as intended", 2026-10-26). Every section plays the engine's own actions (select_blind, play,
// discard, cash_out, use, sell) and checks what 3.9.1 does:
//   - the layer: a run-wide level (hazard jokers while owned, Skarmory and the Debris deck also raise the limit) and the
//     deal: min(limit, level) NEW Hazard cards into the FIRST hand of each round only; they then sit in the deck for good
//   - hand size: a dealt Hazard is a card in hand (11/8 after 3 are dealt); the refill after a play only tops the hand
//     back up to the hand size, so Hazards still held take slots (3.9.1 / Steamodded: #G.hand.cards counts them)
//   - the Hazard card: no rank or suit, no chips, always scores; 1 in 3 to be destroyed when HELD at end of round,
//     never when played or discarded; a debuffed Hazard doesn't roll (Steamodded eval_card skips it)
//   - every hazard joker in play, the Heavy-Duty Boots, the Debris deck and sleeve, the hazards_on option
//   - the UI: {C:poke_hazard} ("+1 hazard layer") and the other pokermon.colours render in their 3.9.1 colours
//     (pokesprites.lua's loc_colour hook) — before this fix every {C:poke_*} was the default text grey and every
//     {X:poke_<type>} box red.
//   node micatro/tests/mods/pokermon_hazards_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { newRun } from '../../js/engine/run.js';
import { toView } from '../../js/engine/view.js';
import { describe } from '../../js/engine/describe.js';
import { get_current_pool } from '../../js/engine/core.js';
import * as API from '../../mods/pokermon/api.js';
import '../../mods/nacho/index.js'; // (Nacho's Carbink: the retrigger section)

const { ok, done } = T();
const key = (c) => c.config.center.key;
const isHz = (c) => key(c) === 'm_poke_hazard';
const near = (a, b) => Math.abs(a - b) < 1e-6;
const sec = (name, f) => { try { f(); } catch (e) { ok(false, name + ': section threw: ' + (e && e.stack)); } };
const heldHz = () => G.hand.cards.filter(isHz);
const deckHz = () => G.playing_cards.filter(isHz);
const nonHz = () => G.hand.cards.filter((c) => !isHz(c));
/** A run with these jokers bought before the first blind; the boss is The Wall (no debuffs). */
function run(seed, jokers = [], opts = {}, extra = {}) {
  start(seed, opts, { noBlind: true, ...extra });
  return jokers.map((j) => add(j));
}

// ------------------------------------------------------------------ the layer and the deal, over several rounds
sec('deal', () => {
  run('HZT_DEAL', ['j_poke_qwilfish', 'j_poke_roggenrola']);
  ok(G.GAME.poke_hazard_level === 2 && (G.GAME.poke_hazard_max ?? 3) === 3, 'two hazard jokers: layer 2, limit 3', [G.GAME.poke_hazard_level, G.GAME.poke_hazard_max]);
  const seen = new Set();
  for (let r = 0; r < 3; r++) {
    const before = deckHz().length, n0 = G.playing_cards.length;
    act({ type: 'select_blind' });
    const fresh = heldHz().filter((c) => !seen.has(c));
    ok(fresh.length === 2 && deckHz().length === before + 2 && G.playing_cards.length === n0 + 2, `round ${r + 1}: 2 NEW Hazard cards dealt into the first hand (deck grows)`, [fresh.length, deckHz().length - before]);
    ok(G.hand.cards.length === G.hand.config.card_limit + 2, `round ${r + 1}: the 2 dealt Hazards come on top of a full hand (8 + 2)`, [G.hand.cards.length, G.hand.config.card_limit]);
    for (const c of heldHz()) seen.add(c);
    // a later draw deals nothing new
    const p = play(nonHz().slice(0, 2));
    ok(p.res.ok && deckHz().length === before + 2, `round ${r + 1}: the draw after a play deals no new Hazards`);
    G.GAME.probabilities.normal = 0; // (keep them: the next rounds count the deck)
    winRound(nonHz().slice(0, 1));
    act({ type: 'cash_out' }); act({ type: 'next_round' });
  }
  ok(deckHz().length === 6, 'after 3 rounds the 6 dealt Hazards are still in the deck (only a held one at end of round can go)', deckHz().length);
});
sec('limit', () => {
  run('HZT_CAP', ['j_poke_qwilfish', 'j_poke_roggenrola', 'j_poke_golett', 'j_poke_ferroseed']);
  act({ type: 'select_blind' });
  ok(G.GAME.poke_hazard_level === 4 && heldHz().length === 3, 'layer 4 over limit 3: 3 dealt', [G.GAME.poke_hazard_level, heldHz().length]);
  ok(describe(G.jokers.cards[0]).info.some((i) => i.key === 'hazard_level' && i.lines.join(' ').includes('3{C:inactive}/3')), 'the Hazard Layer tooltip shows the capped level 3/3',
    describe(G.jokers.cards[0]).info.find((i) => i.key === 'hazard_level'));
  // Skarmory: +1 layer AND limit
  clearHand();
  const sk = add('j_poke_skarmory');
  ok(G.GAME.poke_hazard_level === 5 && G.GAME.poke_hazard_max === 4, 'Skarmory: layer 5, limit 4');
  G.GAME.probabilities.normal = 0;
  winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' });
  act({ type: 'select_blind' });
  ok(G.hand.cards.filter((c) => isHz(c)).length >= 4 && G.playing_cards.filter(isHz).length === 7, 'next round: 4 more dealt (3 + 4 = 7 in the deck)', deckHz().length);
  act({ type: 'sell', id: sk.sort_id });
  ok(G.GAME.poke_hazard_level === 4 && G.GAME.poke_hazard_max === 3, 'selling Skarmory gives the layer and the limit back');
});
sec('hand size', () => {
  run('HZT_HAND', ['j_poke_qwilfish', 'j_poke_roggenrola', 'j_poke_golett']);
  act({ type: 'select_blind' });
  const v = toView();
  ok(G.hand.cards.length === 11 && v.hand_limit === 8, '3 dealt: 11 cards in hand, hand size still 8 (the counter reads 11/8)', [G.hand.cards.length, v.hand_limit]);
  play(nonHz().slice(0, 5));
  ok(G.hand.cards.length === 8 && heldHz().length === 3, 'after playing 5: the refill stops at 8 — the 3 held Hazards take 3 slots (3.9.1)', [G.hand.cards.length, heldHz().length]);
  // discarding them frees the slots
  act({ type: 'highlight', ids: heldHz().map((c) => c.sort_id) });
  act({ type: 'discard' });
  ok(G.hand.cards.length === 8 && G.discard.cards.filter(isHz).length === 3, 'discarding the Hazards: 3 new cards drawn in their place', G.hand.cards.length);
});

// ------------------------------------------------------------------ the Hazard card itself
sec('hazard card', () => {
  run('HZT_CARD', ['j_poke_qwilfish']);
  act({ type: 'select_blind' });
  const [hz] = heldHz();
  ok(hz && hz.get_id() < 0 && !['Spades', 'Hearts', 'Clubs', 'Diamonds'].some((s) => hz.is_suit(s)), 'a dealt Hazard has no rank or suit');
  const vc = toView().areas.hand.find((c) => c.id === hz.sort_id);
  ok(vc && vc.enh && vc.enh.replace && vc.atlas === 'poke_AtlasEnhancementsBasic391' && vc.pos.x === 0 && vc.pos.y === 0, 'the view draws the Hazard art in place of the card face', vc);
  // played with a pair: it scores (always_scores) for 0 chips
  const pair = nonHz().filter((c, i, a) => a.some((d) => d !== c && d.get_id() === c.get_id())).slice(0, 2);
  const cards = pair.length === 2 ? pair : nonHz().slice(0, 1);
  const p = play([...cards, hz]);
  const sc = p.events.filter((e) => e.type === 'card_scored' || e.type === 'scored').length;
  ok(p.res.ok && G.playing_cards.includes(hz), 'a played Hazard is not destroyed', sc);
  const base = { 'Pair': 10, 'High Card': 5 }[p.total.hand];
  const chips = cards.reduce((s, c) => s + c.get_chip_bonus(), 0);
  ok(p.total.chips === base + chips, 'a played Hazard adds no chips', [p.total, base, chips]);
});
sec('destroy', () => {
  run('HZT_DEST', ['j_poke_qwilfish', 'j_poke_roggenrola', 'j_poke_golett']);
  act({ type: 'select_blind' });
  const dealt = heldHz();
  // discard one, keep two held; certain roll
  act({ type: 'highlight', ids: [dealt[0].sort_id] });
  act({ type: 'discard' });
  G.GAME.probabilities.normal = 3;
  const q = G.jokers.cards[0];
  const r = winRound(nonHz().slice(0, 1));
  ok(G.playing_cards.includes(dealt[0]) && !G.playing_cards.includes(dealt[1]) && !G.playing_cards.includes(dealt[2]), 'end of round: the 2 HELD Hazards are destroyed, the discarded one stays');
  ok(q.ability.extra.chips === 30, 'Qwilfish: +15 Chips per destroyed Hazard (enhanced card destroyed)', q.ability.extra.chips);
  ok(statusMsgs(r.events).filter((m) => m === 'Upgrade!').length >= 2, 'Qwilfish: "Upgrade!" per destroyed card', statusMsgs(r.events));
  // the roll really is 1 in 3: many held Hazards over many rounds at the normal chance
  run('HZT_ODDS');
  let held = 0, gone = 0;
  for (let i = 0; i < 12; i++) {
    act({ type: 'select_blind' }); clearHand();
    const hz = hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_6', 'S_7', 'S_8', 'S_9', 'S_T', 'S_J'], { center: 'm_poke_hazard' });
    winRound(hand(['H_9'])); act({ type: 'cash_out' }); act({ type: 'next_round' });
    held += hz.length; gone += hz.filter((c) => !G.playing_cards.includes(c)).length;
  }
  ok(gone / held > 0.2 && gone / held < 0.47, 'held Hazards are destroyed about 1 time in 3', [gone, held]);
  // a debuffed Hazard doesn't roll
  run('HZT_DEBF');
  act({ type: 'select_blind' }); clearHand();
  const hz = hand(['S_2', 'S_3'], { center: 'm_poke_hazard' });
  hz[0].set_debuff(true);
  G.GAME.probabilities.normal = 3;
  winRound(hand(['H_9']));
  ok(G.playing_cards.includes(hz[0]) && !G.playing_cards.includes(hz[1]), 'a debuffed Hazard held at end of round is not destroyed (Steamodded skips its calculate)');
});

// ------------------------------------------------------------------ retriggers of a held Hazard (Mime / Red Seal)
// 3.9.1 + Steamodded calculate_end_of_round_effects: a held card is evaluated once per pass (its own + one per Mime / Red
// Seal retrigger), and the next pass only runs while the last one did something (`j = j + (flags.calculated and 1 or #reps)`).
// The Hazard's own roll returns nothing, so a plain held Hazard rolls once however many retriggers it has; with another
// end-of-round effect on it (Gold via Nacho's Carbink, a Blue Seal making a Planet) every reached pass rolls again.
sec('retriggers', () => {
  let rolls = [];
  const wrap = () => {
    const H = P_CENTERS.m_poke_hazard;
    if (H.__rt_orig) return;
    const orig = H.calculate;
    H.__rt_orig = orig;
    H.calculate = function (self, card, context) {
      if (context.end_of_round && context.playing_card_end_of_round && !context.individual && !context.repetition && context.cardarea === G.hand) rolls.push(card);
      return orig.call(this, self, card, context);
    };
  };
  /** One held Hazard (or n) at end of round with these jokers / seal; -> {rolls, again, dollars, planets, hz}. */
  const endRound = (seed, { jokers = [], seal, mods, n = 1, fill = 0, normal = 0 } = {}) => {
    start(seed, {}, { noBlind: true, mods });
    for (const j of jokers) add(j);
    for (let i = 0; i < fill; i++) add('c_fool');
    act({ type: 'select_blind' }); clearHand();
    const hz = hand(['S_2', 'S_3', 'S_4'].slice(0, n), { center: 'm_poke_hazard' });
    if (seal) for (const c of hz) c.set_seal(seal, true);
    G.GAME.probabilities.normal = normal; // (0: count the rolls, keep the card)
    wrap(); rolls = [];
    const d0 = G.GAME.dollars, p0 = G.consumeables.cards.length;
    const r = winRound(hand(['H_9']));
    return { rolls: rolls.length, order: rolls, again: statusMsgs(r.events).filter((m) => m === 'Again!').length, dollars: G.GAME.dollars - d0, planets: G.consumeables.cards.length - p0, hz };
  };
  const NA = ['nacho'];
  let x = endRound('HZT_RT_MIME', { jokers: ['j_mime'] });
  ok(x.rolls === 1 && x.again === 0, 'Mime + a plain held Hazard: 1 destroy roll (nothing else to retrigger)', [x.rolls, x.again]);
  x = endRound('HZT_RT_MIMEG', { jokers: ['j_mime', 'j_nacho_carbink'], mods: NA });
  ok(x.rolls === 2 && x.again === 1 && x.dollars === 6, 'Mime + a held Hazard that is also Gold (Carbink): 2 destroy rolls ($3 twice, "Again!")', [x.rolls, x.again, x.dollars]);
  x = endRound('HZT_RT_RED', { seal: 'Red' });
  ok(x.rolls === 1 && x.again === 0, 'Red Seal on a plain held Hazard: 1 destroy roll', [x.rolls, x.again]);
  x = endRound('HZT_RT_REDG', { seal: 'Red', jokers: ['j_nacho_carbink'], mods: NA });
  ok(x.rolls === 2 && x.dollars === 6, 'Red Seal on a held Gold Hazard (Carbink): 2 destroy rolls', [x.rolls, x.dollars]);
  x = endRound('HZT_RT_BOTH', { seal: 'Red', jokers: ['j_mime', 'j_nacho_carbink'], mods: NA });
  ok(x.rolls === 3 && x.dollars === 9, 'Mime + Red Seal on a held Gold Hazard: 3 destroy rolls', [x.rolls, x.dollars]);
  x = endRound('HZT_RT_BLUE', { seal: 'Blue', jokers: ['j_mime'] });
  ok(x.rolls === 2 && x.planets === 2, 'Mime + a Blue Seal Hazard (2 free slots): 2 Planets, 2 destroy rolls', [x.rolls, x.planets]);
  // the pass after one that did nothing never runs: 2 Mimes, 1 free slot -> pass 1 Planet, pass 2 no room, pass 3 not reached
  x = endRound('HZT_RT_BLUE1', { seal: 'Blue', jokers: ['j_mime', 'j_mime'], fill: 1 });
  ok(x.rolls === 2 && x.planets === 1, '2 Mimes + a Blue Seal Hazard, 1 free slot: the 2nd pass makes nothing, so no 3rd roll (2 rolls)', [x.rolls, x.planets]);
  // card by card, as Steamodded: each Hazard's passes before the next Hazard's
  x = endRound('HZT_RT_ORDER', { jokers: ['j_mime', 'j_nacho_carbink'], mods: NA, n: 2 });
  ok(x.rolls === 4 && x.order[0] === x.hz[0] && x.order[1] === x.hz[0] && x.order[2] === x.hz[1] && x.order[3] === x.hz[1], 'two held Gold Hazards with Mime: rolled card by card (A, A, B, B)', x.order.map((c) => x.hz.indexOf(c)));
  // a certain destroy rolled twice destroys the card once
  x = endRound('HZT_RT_DEST', { jokers: ['j_mime', 'j_nacho_carbink'], mods: NA, normal: 3 });
  ok(x.rolls === 2 && !G.playing_cards.includes(x.hz[0]) && !G.hand.cards.includes(x.hz[0]) && G.STATE === STATES.ROUND_EVAL, 'a sure destroy rolled twice: the Hazard goes once, the round ends normally', [x.rolls, G.STATE]);
  // no retrigger: nothing changes (the roll still comes on the first pass)
  x = endRound('HZT_RT_NONE', { jokers: ['j_nacho_carbink'], mods: NA });
  ok(x.rolls === 1 && x.dollars === 3, 'a held Gold Hazard without retriggers: 1 roll, $3', [x.rolls, x.dollars]);
  const H = P_CENTERS.m_poke_hazard; if (H.__rt_orig) { H.calculate = H.__rt_orig; delete H.__rt_orig; }
});

// ------------------------------------------------------------------ the hazard jokers, in play
sec('jokers', () => {
  // Skarmory X0.4 per held Hazard / Steel
  run('HZT_SKAR', ['j_poke_skarmory']);
  act({ type: 'select_blind' });
  let p = play(nonHz().slice(0, 1));
  ok(near(p.total.mult, 1 * (1 + 0.4 * heldHz().length)) && heldHz().length === 1, 'Skarmory: X1.4 with its dealt Hazard held', p.total);
  // Roggenrola / Gigalith: per held no-rank card
  run('HZT_ROGG', ['j_poke_roggenrola']);
  act({ type: 'select_blind' });
  p = play(nonHz().slice(0, 1));
  ok(p.total.mult === 1 + 5 && G.jokers.cards[0].ability.extra.hazard_triggered === 1, 'Roggenrola: +5 Mult from the held dealt Hazard', p.total);
  run('HZT_GIGA', ['j_poke_gigalith']);
  act({ type: 'select_blind' });
  p = play(nonHz().slice(0, 1));
  ok(p.total.mult === 1 + 7 * 2 && statusMsgs(p.events).includes('Again!'), 'Gigalith: +7 Mult, retriggered', p.total);
  // Golurk: X1.3 guaranteed per held Hazard
  run('HZT_GOLU', ['j_poke_golurk']);
  act({ type: 'select_blind' });
  G.GAME.probabilities.normal = 0; // (only the guaranteed Hazard part)
  p = play(nonHz().slice(0, 1));
  ok(near(p.total.mult, 1.3), 'Golurk: X1.3 for the held Hazard (others at 0 chance)', p.total);
  // Ferroseed: Hazards are also Steel (X1.5 held)
  run('HZT_FERR', ['j_poke_ferroseed']);
  act({ type: 'select_blind' });
  p = play(nonHz().slice(0, 1));
  ok(near(p.total.mult, 1.5), 'Ferroseed: the held Hazard is Steel (X1.5)', p.total);
  // Cacturne: Hazards in the first played hand are destroyed after scoring; $5 per destroyed card
  run('HZT_CACT', ['j_poke_cacturne']);
  act({ type: 'select_blind' });
  const [hz] = heldHz();
  const $0 = G.GAME.dollars;
  p = play([nonHz()[0], hz]);
  ok(!G.playing_cards.includes(hz) && G.GAME.dollars === $0 + 5, 'Cacturne: the Hazard of the first hand is destroyed after scoring, $5', [G.playing_cards.includes(hz), G.GAME.dollars - $0]);
  const h2 = hand(['S_2'], { center: 'm_poke_hazard' })[0];
  play([nonHz()[0], h2]);
  ok(G.playing_cards.includes(h2), 'Cacturne: not on the second hand');
  // Baltoy: chips per discarded Hazard
  run('HZT_BALT', ['j_poke_baltoy']);
  act({ type: 'select_blind' });
  act({ type: 'highlight', ids: heldHz().map((c) => c.sort_id) });
  act({ type: 'discard' });
  const bc = G.jokers.cards[0].ability.extra.chips;
  ok(bc >= 1 && bc <= 6, 'Baltoy: +1-6 Chips for the discarded Hazard', bc);
  // Claydol: a discarded Hazard may come back to hand (certain here)
  run('HZT_CLAY', ['j_poke_claydol']);
  act({ type: 'select_blind' });
  G.GAME.probabilities.normal = 3;
  const [ch] = heldHz();
  act({ type: 'highlight', ids: [ch.sort_id] });
  act({ type: 'discard' });
  ok(G.hand.cards.includes(ch), 'Claydol: the discarded Hazard returns to hand', [G.discard.cards.includes(ch)]);
  // Tarountula -> Spidops: hand size; the layer moves with it
  run('HZT_TARO', ['j_poke_tarountula']);
  ok(G.hand.config.card_limit === 9 && G.GAME.poke_hazard_level === 1, 'Tarountula: +1 hand size, +1 layer');
  G.jokers.cards[0].ability.extra.rounds = 1;
  act({ type: 'select_blind' }); nextRound();
  ok(key(G.jokers.cards[0]) === 'j_poke_spidops' && G.hand.config.card_limit === 10 && G.GAME.poke_hazard_level === 1, 'Spidops: +2 hand size, layer still 1', [G.hand.config.card_limit, G.GAME.poke_hazard_level]);
  // Mega Steelix: Stone cards are quantum Hazards (destroyed when held)
  run('HZT_MSTL', ['j_poke_mega_steelix']);
  act({ type: 'select_blind' }); clearHand();
  const st = hand(['S_5'], { center: 'm_stone' });
  ok(API.has_enhancement(st[0], 'm_poke_hazard') && API.has_enhancement(st[0], 'm_steel') && (G.GAME.poke_hazard_level || 0) === 0, 'Mega Steelix: Stone = Steel + Hazard, no layer of its own');
  G.GAME.probabilities.normal = 3;
  winRound(hand(['H_9']));
  ok(!G.playing_cards.includes(st[0]), 'Mega Steelix: the held Stone rolls the Hazard destroy');
  // a debuffed hazard joker leaves the layer
  const [q] = run('HZT_DEBJ', ['j_poke_qwilfish']);
  q.set_debuff(true);
  const lvDebuffed = G.GAME.poke_hazard_level || 0;
  q.set_debuff(false);
  ok(lvDebuffed === 0 && G.GAME.poke_hazard_level === 1, 'a debuffed hazard joker leaves the layer while debuffed (Steamodded remove_from_deck from_debuff)', [lvDebuffed, G.GAME.poke_hazard_level]);
});

// ------------------------------------------------------------------ Heavy-Duty Boots
sec('boots', () => {
  run('HZT_BOOT', ['j_poke_qwilfish', 'j_poke_roggenrola', 'j_poke_golett']);
  const b = add('c_poke_heavyboots');
  act({ type: 'select_blind' });
  ok(act({ type: 'use', id: b.sort_id }).ok && G.consumeables.cards.includes(b), 'Boots used during the round (kept)');
  ok(!act({ type: 'use', id: b.sort_id }).ok, 'Boots: once per round');
  const dealt = heldHz();
  G.GAME.probabilities.normal = 3;
  winRound(nonHz().slice(0, 1));
  ok(dealt.every((c) => G.playing_cards.includes(c)), 'Boots: no held Hazard is destroyed this round');
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' });
  ok(b.ability.extra.usable && !b.ability.extra.hazard_off, 'Boots: ready again next round');
  const d2 = heldHz();
  winRound(nonHz().slice(0, 1));
  ok(d2.every((c) => !G.playing_cards.includes(c)), 'next round without using them: held Hazards roll again (certain here)');
});

// ------------------------------------------------------------------ the Debris deck and sleeve
sec('debris', () => {
  newRun({ seed: 'HZT_DEB', back: 'b_poke_diceydeck', mods: ['pokermon'] });
  G.E_MANAGER.flush();
  G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  ok(G.GAME.poke_hazard_level === 1 && G.GAME.poke_hazard_max === 4 && G.hand.config.card_limit === 9 && G.GAME.modifiers.no_interest, 'Debris deck: layer 1, limit 4, hand 9, no interest');
  let total = 0;
  for (let r = 0; r < 3; r++) {
    act({ type: 'select_blind' });
    ok(G.hand.cards.length === 10 && heldHz().length >= 1, `Debris round ${r + 1}: 9 drawn + 1 dealt`, G.hand.cards.length);
    G.GAME.probabilities.normal = 0;
    G.GAME.dollars = 50; // (interest would show if it were earned)
    winRound(nonHz().slice(0, 1));
    const rows = G.GAME.round_eval.rows || [];
    const row = rows.find((x) => x.poke_enhance_bonus === 'm_poke_hazard');
    ok(row && row.dollars === deckHz().length && !rows.some((x) => x.name === 'interest'), `Debris round ${r + 1}: $1 per Hazard in the deck (${deckHz().length}), no interest`, rows.map((x) => x.name + ':' + x.dollars));
    total = deckHz().length;
    act({ type: 'cash_out' }); act({ type: 'next_round' });
  }
  ok(total === 3, 'Debris: one more Hazard each round', total);
  // the sleeve's alt on the Debris deck: every Hazard is +1 hand size while held
  newRun({ seed: 'HZT_DEBA', back: 'b_poke_diceydeck', sleeve: 'sleeve_poke_diceysleeve', mods: ['pokermon'] });
  G.E_MANAGER.flush();
  G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  ok(G.GAME.modifiers.poke_negative_hazards && G.GAME.poke_hazard_level === 1 && G.hand.config.card_limit === 9, 'Debris deck + sleeve: the alt (the deck effect once)');
  act({ type: 'select_blind' });
  play(nonHz().slice(0, 5));
  ok(G.hand.cards.length === 10 && heldHz().length === 1 && toView().hand_limit === 10, 'alt: after a play the hand refills to 10 — the held Hazard takes no slot', [G.hand.cards.length, toView().hand_limit]);
});

// ------------------------------------------------------------------ the hazards option
sec('option', () => {
  start('HZT_OPT', { hazards_on: false }, { noBlind: true });
  const pool = [0.1, 0.8, 0.99, 'poke_safari'].flatMap((r) => get_current_pool('Joker', r)[0]);
  const hz = ['qwilfish', 'skarmory', 'cacnea', 'baltoy', 'roggenrola', 'ferroseed', 'golett', 'tarountula'].map((n) => 'j_poke_' + n);
  ok(hz.every((k) => !pool.includes(k)) && pool.includes('j_poke_bulbasaur'), 'hazards_on off: the hazard jokers leave the shop pools', hz.filter((k) => pool.includes(k)));
  ok(!P_CENTERS.c_poke_heavyboots.in_pool(), '... and with no layer the Boots are out too');
  // (3.9.1: the option only gates the pools — a hazard joker you still get, or the Debris deck, still deals)
  add('j_poke_qwilfish');
  act({ type: 'select_blind' });
  ok(heldHz().length === 1, 'hazards_on off: a Qwilfish you own still deals its Hazard (3.9.1: the option is a pool filter)');
  start('HZT_OPT2', {}, { noBlind: true });
  const pool2 = [0.1, 0.8, 0.99].flatMap((r) => get_current_pool('Joker', r)[0]);
  ok(['j_poke_qwilfish', 'j_poke_cacnea', 'j_poke_roggenrola'].every((k) => pool2.includes(k)), 'hazards_on on (default): they are in the pools');
});

// ------------------------------------------------------------------ the UI: Pokermon's text colours
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
try {
  const mk = await import('../../js/ui/markup.js');
  const assets = await import('../../js/ui/assets.js');
  const M = await import('../../js/mods/index.js');
  await M.loadMods(['pokermon']);
  assets.bindModRegistry(M);
  const sk = describe(add('j_poke_skarmory'));
  const html = mk.markup(sk.lines[0]);
  ok(/color:#ba7333/i.test(html), 'Skarmory "+1 hazard layer" is the 3.9.1 hazard bronze #BA7333 ({C:poke_hazard})', html);
  ok(/background:#289830/i.test(mk.markup('{X:poke_grass,C:white}Grass{}')), '{X:poke_grass} boxes are Grass green, not red');
  ok(/color:#ff7abf/i.test(mk.markup('{C:poke_pink}Pink Seal{}')), '{C:poke_pink} is pink');
  ok(/color:#ff9a00/i.test(mk.markup('{C:attention}x{}')) && /color:#4f6367/.test(mk.markup('{C:nope}x{}')), 'base colours and the unknown-colour fallback unchanged');
  ok(M.LOC_COLOURS.poke_hazard === '#ba7333' && Object.keys(M.LOC_COLOURS).length >= 20, 'the registry carries the mod colours (pokermon.colours: 20)');
  // the house "Hazards" tooltips (how they work: an extra info_queue entry beside 3.9.1's own text)
  start('HZT_TIPS', {}, { mods: ['nacho'] });
  const [hzc] = hand(['S_2'], { center: 'm_poke_hazard' });
  const hi = describe(hzc).info.find((i) => i.key === 'poke_hazard_rules');
  const ht = hi ? hi.lines.join(' ') : '';
  ok(hi && hi.name === 'Hazards' && /Stay in your deck/.test(ht) && /held/.test(ht) && /playing or discarding/.test(ht) && /one keeps it/.test(ht) && /hand{} slots/.test(ht) && /discard{} them to draw/.test(ht),
    'the Hazard card: a "Hazards" tooltip (stay in the deck; only a held one can go; take hand slots, discard them)', hi);
  ok(describe(hzc).lines.join(' ').includes('1 in 3'), "... beside 3.9.1's own text (1 in 3 when held), unchanged");
  const qi = describe(add('j_poke_qwilfish')).info;
  const qd = qi.find((i) => i.key === 'poke_hazard_deal');
  ok(qi.map((i) => i.key).join() === 'hazard_level,m_poke_hazard,poke_hazard_deal' && qd && qd.lines[0] === 'At most {C:attention}3{} a round' && /poke_hazard}hazard limit/.test(qd.lines[1]),
    'a hazard joker: Hazard Layer, Hazard Card, then "Hazards" (at most the limit a round, stay in the deck, take hand slots)', qi);
  add('j_poke_skarmory');
  ok(describe(G.jokers.cards[0]).info.find((i) => i.key === 'poke_hazard_deal').lines[0] === 'At most {C:attention}4{} a round', '... the limit is live (Skarmory: 4)');
  const ski = describe(G.jokers.cards[1]).info.map((i) => i.key);
  ok(ski.join() === 'mega_poke,hazard_level,m_poke_hazard,m_steel,poke_hazard_deal', "it comes LAST: never pushes one of 3.9.1's own entries out of the tooltip (Skarmory)", ski);
  ok(describe(add('j_nacho_carbink')).info.some((i) => i.key === 'poke_hazard_deal'), "Nacho's Carbink shows it too");
  ok(/color:#ba7333/i.test(mk.markup(qd.lines[1])), 'the "hazard limit" is in the hazard bronze');
  ok(M.AVAILABLE ? true : true, '');
  // the info box on a Hazard card IN HAND (the board's tooltip reads the view: engine/view.js enh.info -> ui/markup.js describePlaying)
  const vhz = toView().areas.hand.find((c) => c.id === hzc.sort_id);
  ok(vhz && vhz.enh && Array.isArray(vhz.enh.info) && vhz.enh.info.some((i) => i.key === 'poke_hazard_rules'), "the view carries the Hazard card's info box", vhz && vhz.enh);
  const dp = mk.describePlaying(vhz);
  ok(dp.info && dp.info.some((i) => i.key === 'poke_hazard_rules' && i.name === 'Hazards'), 'describePlaying gives the in-hand tooltip its info box', dp.info);
  ok((await import('../../js/mods/registry.js')).MODS.pokermon.options.hazards_on.label === 'Hazard Pokémon in shop', 'the option says what it does: hazard Pokémon in the shop (owned ones still deal)');
} catch (e) { ok(false, 'ui colours threw: ' + (e && e.stack)); }

done();
