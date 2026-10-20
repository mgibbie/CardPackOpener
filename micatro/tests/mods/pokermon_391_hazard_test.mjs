// pokermon_391_hazard_test.mjs — Pokermon 3.9.1 upgrade, batch 10 (Plans/MICATRO_MODS_UPGRADES.md): the Hazard layer
// rework, the Seed enhancement, Miracle Seed / Heavy-Duty Boots, Flower X2 (X3 with Shaymin), the Debris deck and sleeve,
// the quantum-enhancement seam (Mega Steelix: Stone cards are also Hazard), and the 16 jokers that waited for them.
// Everything is FIRED through real runs:
//   - the run-wide Hazard layer: jokers raise G.GAME.poke_hazard_level while owned (Skarmory the max too); the first hand
//     drawn deals min(max, level) Hazard cards INTO the hand; the Hazard Layer tooltip shows current / max
//   - Hazard 1 in 3, destroyed when held at end of round; Heavy-Duty Boots zero that chance for the round; a quantum Hazard
//     (Mega Steelix's Stone cards) is destroyed too (js/engine/smods.js quantum_mod_calculate)
//   - Seed: grows when scored (growth level adds), becomes a Flower and pays $15 at 5; Miracle Seed; Flower X2 / X3
//   - the un-held jokers' 3.9.1 behaviour; the Debris deck / sleeve; hazards_on = false keeps the 'hazards' jokers out
//   node micatro/tests/mods/pokermon_391_hazard_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { newRun } from '../../js/engine/run.js';
import { describe } from '../../js/engine/describe.js';
import { get_current_pool } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import { playing_card_joker_effects } from '../../js/engine/jokers.js';
import D391 from '../../mods/pokermon/data391.js';
import DATA from '../../mods/pokermon/data.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const plain = (lines) => lines.join(' ').replace(/{[^}]*}/g, '');
const isHazard = (c) => key(c) === 'm_poke_hazard';
const UNHELD = ['qwilfish', 'skarmory', 'mega_steelix', 'bellossom', 'hoppip', 'skiploom', 'jumpluff', 'roggenrola', 'boldore', 'gigalith',
  'golett', 'golurk', 'ferroseed', 'ferrothorn', 'tarountula', 'spidops'];
const HAZARD_JOKERS = ['qwilfish', 'skarmory', 'roggenrola', 'boldore', 'gigalith', 'golett', 'golurk', 'ferroseed', 'ferrothorn', 'tarountula', 'spidops'];
// (each section runs on its own: one that throws — e.g. content missing on an older build — counts as a FAIL)
const sec = (f) => { try { f(); } catch (e) { ok(false, 'section threw: ' + (e && e.message)); } };
const safe = (f) => { try { return f(); } catch (e) { return undefined; } };

// ------------------------------------------------------------------ the overlay / pin
ok(MODS.pokermon.contentRev === 6 && PINS.modPin('pokermon') === '3.9.1+r6', 'Pokermon contentRev 6 (pin 3.9.1+r6)', PINS.modPin('pokermon'));
ok((D391.rework_hold || []).map(([n]) => n).sort().join() === 'unown,unown_swarm', 'rework_hold: only Unown / Unown Swarm are left (the Unown rework)', D391.rework_hold);
ok(UNHELD.every((n) => D391.reworked.includes(n)), 'the 16 Hazard / Seed / quantum jokers are reworked (3.9.1 data + text)', UNHELD.filter((n) => !D391.reworked.includes(n)));
const deferred = Object.fromEntries(D391.rework_deferred || []);
ok(!deferred.shaymin && !deferred.shaymin_sky && /mega_skarmory/.test(deferred.skarmory || ''), 'deferred: Shaymin\'s Flower part is done; Skarmory waits only for Mega Skarmory');
ok(HAZARD_JOKERS.every((n) => P_CENTERS['j_poke_' + n].config.extra.hazard_level === 1), 'every Hazard joker has hazard_level 1 (3.9.1 config)');
ok(P_CENTERS.j_poke_skarmory.config.extra.hazard_max === 1 && P_CENTERS.j_poke_mega_steelix.config.extra.stone_held === 4, 'Skarmory hazard_max 1, Mega Steelix stone_held 4');

// ------------------------------------------------------------------ the Hazard layer
sec(() => {
  start('HZL1', {}, { noBlind: true });
  ok((G.GAME.poke_hazard_level || 0) === 0, 'a new run: Hazard layer 0');
  const q = add('j_poke_qwilfish');
  ok(G.GAME.poke_hazard_level === 1, 'Qwilfish: Hazard layer +1 while owned', G.GAME.poke_hazard_level);
  const sk = add('j_poke_skarmory');
  ok(G.GAME.poke_hazard_level === 2 && G.GAME.poke_hazard_max === 4, 'Skarmory: Hazard layer and its limit +1', [G.GAME.poke_hazard_level, G.GAME.poke_hazard_max]);
  const d = describe(q);
  const tip = (d.info || []).find((i) => i.key === 'hazard_level');
  ok(tip && /Hazard Layer/.test(tip.name) && plain(tip.lines).includes('Current Hazard Layer 2/4'), 'the Hazard Layer tooltip shows current / max (2/4)', tip);
  ok(/hazard layer/i.test(d.lines.join(' ')), 'Qwilfish text: "+1 hazard layer" (3.9.1)', d.lines);
  const n0 = G.playing_cards.length;
  act({ type: 'select_blind' });
  const dealt = G.hand.cards.filter(isHazard);
  ok(dealt.length === 2 && G.playing_cards.length === n0 + 2, 'first hand drawn: 2 Hazard cards dealt INTO the hand (and the deck grows)', [dealt.length, G.playing_cards.length - n0]);
  ok(G.hand.cards.length === 8 + 2, '... on top of the 8 drawn cards', G.hand.cards.length);
  // only the first hand of the round
  clearHand();
  play(hand(['S_2']));
  ok(G.hand.cards.filter(isHazard).length === 0 || G.hand.cards.filter(isHazard).every((c) => dealt.includes(c)), 'later draws deal no new Hazards');
  act({ type: 'sell', id: q.sort_id });
  ok(G.GAME.poke_hazard_level === 1, 'selling Qwilfish: Hazard layer -1', G.GAME.poke_hazard_level);
  act({ type: 'sell', id: sk.sort_id });
  ok(G.GAME.poke_hazard_level === 0 && G.GAME.poke_hazard_max === 3, 'selling Skarmory: layer and limit back', [G.GAME.poke_hazard_level, G.GAME.poke_hazard_max]);
});
sec(() => {
  // the layer is capped by the limit (3)
  start('HZL2', {}, { noBlind: true });
  for (const n of ['qwilfish', 'roggenrola', 'golett', 'tarountula', 'ferroseed']) add('j_poke_' + n);
  ok(G.GAME.poke_hazard_level === 5, '5 Hazard jokers: layer 5', G.GAME.poke_hazard_level);
  act({ type: 'select_blind' });
  ok(G.hand.cards.filter(isHazard).length === 3, '... but only min(limit 3, layer 5) = 3 Hazards are dealt', G.hand.cards.filter(isHazard).length);
});

// ------------------------------------------------------------------ Hazard cards: 1 in 3, Boots, quantum Hazard
sec(() => {
  ok(P_CENTERS.m_poke_hazard.config.dem === 3 && P_CENTERS.m_poke_hazard.config.num === 1, 'Hazard card: 1 in 3 (3.9.1; 3.2.1 was 1 in 6)');
  start('HZD1');
  const hz = hand(['S_2', 'S_3', 'S_4'], { center: 'm_poke_hazard' });
  ok(describe(hz[0]).lines.join(' ').includes('1 in 3'), 'Hazard text: 1 in 3', describe(hz[0]).lines);
  G.GAME.probabilities.normal = 3; // (1 in 3 x3: certain)
  winRound(hand(['H_9']));
  ok(hz.every((c) => !G.playing_cards.includes(c)), 'Hazards held at end of round are destroyed (certain here)');
});
sec(() => {
  start('HZD2');
  const boots = add('c_poke_heavyboots');
  ok(boots && key(boots) === 'c_poke_heavyboots' && boots.ability.extra.usable, 'Heavy-Duty Boots: a reusable Item');
  ok(act({ type: 'use', id: boots.sort_id }).ok && G.consumeables.cards.includes(boots) && boots.ability.extra.hazard_off, 'Boots used: kept, Hazard chances off');
  const hz = hand(['S_2', 'S_3'], { center: 'm_poke_hazard' });
  G.GAME.probabilities.normal = 3;
  ok(describe(hz[0]).lines.join(' ').includes('0 in 3'), 'with the Boots on: "0 in 3"', describe(hz[0]).lines);
  const r = winRound(hand(['H_9']));
  ok(hz.every((c) => G.playing_cards.includes(c)), 'Boots: no Hazard is destroyed this round');
  ok(boots.ability.extra.usable && !boots.ability.extra.hazard_off && statusMsgs(r.events).includes('Reset'), 'Boots: usable again next round', boots.ability.extra);
  ok(!P_CENTERS.c_poke_heavyboots.in_pool() && P_CENTERS.c_poke_heavyboots.hidden && P_CENTERS.c_poke_heavyboots.soul_set === 'Item', 'Boots: a hidden Item, only in the pool with a Hazard layer');
  add('j_poke_qwilfish');
  ok(P_CENTERS.c_poke_heavyboots.in_pool(), '... which Qwilfish gives');
});
sec(() => {
  // Mega Steelix: Stone cards are also Steel AND Hazard (quantum); the Hazard part's own end-of-round destroy runs
  start('MSTL1');
  const ms = add('j_poke_mega_steelix');
  const st = hand(['S_5', 'S_6'], { center: 'm_stone' });
  ok(P_CENTERS.j_poke_mega_steelix.quantum_enhancements && API_has(st[0], 'm_steel') && API_has(st[0], 'm_poke_hazard'), 'Mega Steelix: a Stone card is also Steel and Hazard');
  G.GAME.probabilities.normal = 3;
  winRound(hand(['H_9']));
  ok(st.every((c) => !G.playing_cards.includes(c)), 'Mega Steelix: held Stone cards roll the quantum Hazard destroy (certain here)');
  ok(G.jokers.cards.includes(ms), '(Mega Steelix stays)');
});
sec(() => {
  start('MSTL2');
  const st = hand(['S_5', 'S_6'], { center: 'm_stone' });
  G.GAME.probabilities.normal = 3;
  winRound(hand(['H_9']));
  ok(st.every((c) => G.playing_cards.includes(c)), 'without Mega Steelix: held Stone cards are not Hazards (kept)');
});
sec(() => {
  start('MSTL3');
  add('j_poke_mega_steelix');
  hand(['S_5', 'S_6', 'S_7', 'S_8'], { center: 'm_stone' });
  const r = play(hand(['H_9']));
  // 4 no-rank held cards: each held card (Steel via quantum: X1.5) retriggers once -> X1.5^8
  ok(near(r.total.mult, Math.pow(1.5, 8)), 'Mega Steelix: 4 no-rank cards held -> held cards retrigger once (quantum Steel X1.5 each)', r.total);
  ok(statusMsgs(r.events).includes('Again!'), 'Mega Steelix: "Again!"');
});

// ------------------------------------------------------------------ Seed, Miracle Seed, Flower
sec(() => {
  start('SEED1');
  const s = P_CENTERS.m_poke_seed;
  ok(s && !s.unported && s.weight === 5 && get_current_pool('Enhanced')[0].includes('m_poke_seed'), 'Seed card: registered, in the Enhanced pool (weight 5)');
  const [c] = hand(['H_7'], { center: 'm_poke_seed' });
  ok(s.get_pos(s, c).x === 1, 'a fresh Seed shows its first cell');
  const $0 = G.GAME.dollars;
  for (let i = 1; i <= 4; i++) {
    const r = play([c]);
    ok(c.ability.extra.level === i && key(c) === 'm_poke_seed' && statusMsgs(r.events).includes('Upgrade!'), `Seed: grows when scored (${i})`, c.ability.extra);
    clearHand(); back(c);
  }
  ok(s.get_pos(s, c).x === 5, 'Seed: the art follows the growth (cell 5 at level 4)');
  play([c]);
  ok(key(c) === 'm_poke_flower' && G.GAME.dollars === $0 + 15, 'Seed: at 5 it becomes a Flower card and pays $15', [key(c), G.GAME.dollars - $0]);
});
sec(() => {
  start('SEED2');
  G.GAME.poke_growth_level = 1;
  const [c] = hand(['H_7'], { center: 'm_poke_seed' });
  ok(plain(describe(c).lines).includes('Grows 2 times'), 'growth level 1: "Grows 2 times"', describe(c).lines);
  play([c]);
  ok(c.ability.extra.level === 2, 'growth level 1: a Seed grows twice per score', c.ability.extra.level);
});
sec(() => {
  start('MSEED');
  const ms = add('c_poke_miracleseed');
  const [c] = hand(['D_4']);
  ok(act({ type: 'use', id: ms.sort_id, targets: [c.sort_id] }).ok && key(c) === 'm_poke_seed', 'Miracle Seed: the selected card becomes a Seed card', key(c));
});
sec(() => {
  start('FLWR');
  ok(P_CENTERS.m_poke_flower.config.Xmult_flower === 2, 'Flower: Xmult_flower 2 (3.9.1)');
  const cards = () => { const f = hand(['H_2'], { center: 'm_poke_flower' }); return [...f, ...hand(['S_3', 'D_4', 'C_5', 'H_6'])]; };
  let r = play(cards());
  ok(near(r.total.mult, 4 * 2), 'Flower: X2 with 4 suits', r.total);
  clearHand();
  add('j_poke_shaymin');
  r = play(cards());
  ok(near(r.total.mult, 4 * 3), 'Flower with Shaymin: X3', r.total);
  clearHand();
  r = play([...hand(['H_2'], { center: 'm_poke_flower' }), ...hand(['H_3', 'D_4', 'C_5', 'H_6'])]);
  ok(near(r.total.mult, 4), 'Flower: nothing with 3 suits', r.total);
});

// ------------------------------------------------------------------ the un-held jokers (3.9.1)
sec(() => {
  start('BELL');
  const b = add('j_poke_bellossom');
  let wild = 0, seed = 0;
  for (let i = 0; i < 24; i++) {
    clearHand();
    const [c] = hand(['S_7']);
    play([c]);
    if (key(c) === 'm_wild') wild++;
    if (key(c) === 'm_poke_seed') seed++;
  }
  ok(wild > 0 && seed > 0, 'Bellossom: an odd base card becomes Wild OR Seed (both seen)', [wild, seed]);
  clearHand();
  let ed = false;
  for (let i = 0; i < 16 && !ed; i++) { clearHand(); const [c] = hand(['S_9'], { center: 'm_bonus' }); play([c]); ed = !!c.edition && key(c) === 'm_bonus'; }
  ok(ed, 'Bellossom: an odd ENHANCED card keeps its enhancement and gets an edition');
  ok(b.ability.extra.mult === 7, 'Bellossom +7 Mult');
});
sec(() => {
  start('HOPP');
  const j = add('j_poke_hoppip');
  const d = hand(['S_2', 'S_3', 'S_4']);
  act({ type: 'highlight', ids: d.map((c) => c.sort_id) });
  act({ type: 'discard' });
  ok(d.filter((c) => key(c) === 'm_poke_seed').length === 2 && !G.jokers.cards.includes(j), 'Hoppip: the first 2 discarded cards become Seed cards, then it hops away', d.map(key));
  clearHand();
  const k = add('j_poke_jumpluff');
  const d2 = hand(['S_2', 'S_3', 'S_4', 'S_5']);
  act({ type: 'highlight', ids: d2.map((c) => c.sort_id) });
  act({ type: 'discard' });
  ok(d2.every((c) => key(c) === 'm_poke_seed') && !G.jokers.cards.includes(k), 'Jumpluff: every discarded card becomes a Seed card');
});
sec(() => {
  start('ROGG');
  const j = add('j_poke_roggenrola');
  hand(['S_2', 'S_3'], { center: 'm_poke_hazard' });
  const r = play(hand(['H_9']));
  ok(r.total.mult === 1 + 10 && j.ability.extra.hazard_triggered === 2, 'Roggenrola: +5 Mult per held no-rank card (3.9.1)', r.total);
  j.ability.extra.hazard_triggered = 10;
  nextRound();
  ok(key(j) === 'j_poke_boldore' && G.GAME.poke_hazard_level === 1, 'Roggenrola -> Boldore at 10; the layer stays 1 across the evolution', [key(j), G.GAME.poke_hazard_level]);
});
sec(() => {
  start('GOLM');
  add('j_poke_golurk');
  hand(['S_2'], { center: 'm_poke_hazard' });
  const r = play(hand(['H_9']));
  ok(near(r.total.mult, 1.3), 'Golurk: X1.3 per held Hazard (3.9.1)', r.total);
});
sec(() => {
  start('FERR');
  add('j_poke_ferroseed');
  ok(G.GAME.poke_hazard_level === 1, 'Ferroseed: +1 Hazard layer (3.9.1)');
  const [hz] = hand(['D_3'], { center: 'm_poke_hazard' });
  ok(API_has(hz, 'm_steel'), 'Ferroseed: Hazard cards are also Steel');
});
sec(() => {
  start('TARO', {}, { noBlind: true });
  const j = add('j_poke_tarountula');
  ok(G.hand.config.card_limit === 9 && G.GAME.poke_hazard_level === 1, 'Tarountula: +1 hand size, +1 Hazard layer');
  act({ type: 'select_blind' });
  ok(G.hand.cards.filter(isHazard).length === 1, 'Tarountula: 1 Hazard dealt into the first hand');
  clearHand();
  j.ability.extra.rounds = 1;
  nextRound();
  ok(key(j) === 'j_poke_spidops' && G.hand.config.card_limit === 10 && G.GAME.poke_hazard_level === 1, 'Tarountula -> Spidops (+2 hand size), layer still 1', [key(j), G.hand.config.card_limit]);
  j.ability.extra.cards_added = 7;
  const c = hand(['S_K'])[0];
  // playing_card_added: the next card added gets a seal ("Sticky Web!")
  playing_card_joker_effects([c]);
  ok(c.seal && j.ability.extra.cards_added === 0, 'Spidops: the 8th playing card added gets a random seal', [c.seal, j.ability.extra.cards_added]);
});

// ------------------------------------------------------------------ the Debris deck / sleeve, hazards_on
sec(() => {
  newRun({ seed: 'DEBRIS', back: 'b_poke_diceydeck', mods: ['pokermon'] });
  G.E_MANAGER.flush();
  ok(G.GAME.poke_hazard_level === 1 && G.GAME.poke_hazard_max === 4 && G.hand.config.card_limit === 9 && G.GAME.modifiers.no_interest, 'Debris deck: +1 Hazard layer and limit, +1 hand size, no interest',
    [G.GAME.poke_hazard_level, G.GAME.poke_hazard_max, G.hand.config.card_limit]);
  G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' });
  ok(G.hand.cards.filter(isHazard).length === 1, 'Debris deck: 1 Hazard dealt into the first hand');
  clearHand();
  G.GAME.probabilities.normal = 0; // (keep every Hazard)
  const hz = G.playing_cards.filter(isHazard).length;
  winRound();
  const row = (G.GAME.round_eval.rows || []).find((x) => x.poke_enhance_bonus === 'm_poke_hazard');
  ok(row && row.dollars === hz && /Hazards in Deck/.test(row.name) && !G.GAME.round_eval.rows.some((x) => x.name === 'interest'), 'Debris deck: $1 per Hazard card in the full deck at cash-out, no interest row', row);
  ok(P_CENTERS.b_poke_diceydeck.atlas === 'poke_AtlasDecksBasic391' && P_CENTERS.b_poke_diceydeck.pos.x === 10, 'Debris deck art: AtlasDecksBasic (3.9.1) {10,0}');
});
sec(() => {
  const s = new Session(); s.start({ seed: 'DEBSLV', back: 'b_red', sleeve: 'sleeve_poke_diceysleeve', mods: ['pokermon'] }); G.E_MANAGER.flush();
  ok(G.GAME.poke_hazard_level === 1 && G.GAME.poke_hazard_max === 4 && G.hand.config.card_limit === 9 && G.GAME.modifiers.no_interest && G.GAME.modifiers.poke_money_per_enhancement === 1,
    'Debris sleeve: as the deck', [G.GAME.poke_hazard_level, G.GAME.poke_hazard_max, G.hand.config.card_limit]);
});
sec(() => {
  start('NOHZ', { hazards_on: false }, { noBlind: true });
  const pool = get_current_pool('Joker', 'poke_safari')[0].concat(get_current_pool('Joker', 1)[0], get_current_pool('Joker', 2)[0], get_current_pool('Joker', 3)[0]);
  ok(!pool.includes('j_poke_ferroseed') && !pool.includes('j_poke_qwilfish') && !pool.includes('j_poke_skarmory'), 'hazards_on off: the "hazards" jokers (Ferroseed too) leave the pools');
});

// ------------------------------------------------------------------ loc
ok(['Enhanced', 'Item', 'Back', 'Sleeve', 'Other'].every((s) => DATA.loc.descriptions[s]) && DATA.loc.descriptions.Item.c_poke_miracleseed && DATA.loc.descriptions.Item.c_poke_heavyboots
  && DATA.loc.descriptions.Back.b_poke_diceydeck && DATA.loc.descriptions.Sleeve.sleeve_poke_diceysleeve && DATA.loc.descriptions.Other.hazard_level && DATA.loc.descriptions.Enhanced.m_poke_seed,
'the 3.9.1 text of the new content (poke_item -> Item)');

/** Put a played card back in hand. */
function back(c) { for (const a of [G.discard, G.deck, G.play]) if (a.cards.includes(c)) a.remove_card(c); G.hand.emplace(c); }
function API_has(c, k) { return !!safe(() => API.has_enhancement(c, k)); }
import * as API from '../../mods/pokermon/api.js';
done();
