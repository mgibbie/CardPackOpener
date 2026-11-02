// The owner's legendary solo rule (contentRev 59; jokers/pokejokers_designs.js solo59; PORTING.md "The legendary solo rule"): "legendaries
// must be complete alone". Every partner clause of the Gen 3-5 Legendaries became a solo trigger of the same flavour; the numbers stayed.
//   Rayquaza       Delta Stream: +1 hand AND +1 discard each round (still calms Kyogre / Groudon's Primal Clash).
//   Latias/Latios  Soul Dew: also X0.075 from the OTHER consumable (Latias per Planet, Latios per Tarot), half the gain, alone.
//   Lake trio      Lake Guardians: +X0.25 for each OTHER Psychic Joker (Arceus / a Tera count, debuffed don't), at most 2.
//   Regis          Regi Trio: 1 card per Blind, 1 more on a Boss Blind.
//   Regigigas      Slow Start: 5 rounds, 1 sooner per 5 Stone / Glass / Steel cards in the full deck (min 1); Creator: awake, 1 random card
//                  (unenhanced first) becomes Stone, Glass or Steel when a Blind is selected.
//   Giratina       Origin Forme for good once 10 playing cards were destroyed while held ("(Destroyed: k/10)"; the 10th gains Altered).
//   Swords         Swords of Justice: X1.5 instead of X1.25 while the sword's suit is STRICTLY the most common in the full deck (contentRev
//                  60: a tie doesn't count, so a plain 52-card deck gives every sword X1.25; r59 counted ties; Wild every suit, Stone none).
//   Keldeo         Resolute Form for good once 25 Hearts scored while held ("(Hearts: k/25)"); X2 a Heart.
//   Forces         Therian Forme for good after holding it 4 rounds ("(Therian in k rounds)").
//   Reshiram/Zekrom Fusion Flare / Bolt: each Fire / Lightning Energy used (any target) banks +X0.05 on its per-Joker X (no energy field;
//                  Blueprint never banks).
//   Kyurem         X1.5; White with more Fire than Lightning Jokers, Black with more Lightning (itself out; a tie keeps the form; plain
//                  until one side leads): X1.25 per Joker of that type; the art follows.
// Every changed joker is played ALONE (no partner) through real hands / rounds; then save / resume, Energy, and a run RECORDED on r58
// (micatro/tests/fixtures/pokermon_legsolo_r58_recipe.json, on main before this change) that must re-play on the old partner rules, and a
// run RECORDED on r59 (micatro/tests/fixtures/pokermon_swordtie_r59_recipe.json, on main before r60) that must re-play with ties counting.
//   node micatro/tests/mods/pokermon_legendary_solo_test.mjs
import { readFileSync } from 'fs';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { apply_type_sticker } from '../../mods/pokermon/systems/types.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 700)); } };
const ex = (j) => j.ability.extra;
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const oldRules = (fn) => { PINS.RULES.pins = { pokermon: '3.9.1+r58' }; try { return fn(); } finally { PINS.RULES.pins = null; } };
/** Run fn on the rules of a move recorded on r59 (the Swords counted a tie for the most). */
const r59Rules = (fn) => { PINS.RULES.pins = { pokermon: '3.9.1+r59' }; try { return fn(); } finally { PINS.RULES.pins = null; } };
const cr = () => G.GAME.current_round;
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list` (never the round's last hand unless `left` says so) -> {mult, chips, total}. */
function play(list, { left } = {}) {
  clearHand();
  const cs = cards(list);
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (left !== undefined) cr().hands_left = left;
  else if (cr().hands_left < 2) cr().hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const total = ((r && r.events) || []).find((e) => e.type === 'hand_total') || {};
  return { total, mult: Number(total.mult), chips: Number(total.chips) };
}
function endRound() { clearHand(); const c = hand(['S_2']); G.GAME.chips = G.GAME.blind.chips; if (cr().hands_left < 2) cr().hands_left = 2; act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush(); }
function advance() {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  clearHand();
}
const round = () => { endRound(); advance(); };
/** The round's FINAL hand (hands_left 1 before it), made to win the Blind, then on to the next Blind -> its total. */
function finalPlay(list) {
  clearHand();
  const cs = cards(list);
  G.GAME.chips = 0; G.GAME.blind.chips = 1; cr().hands_left = 1;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' }); flush();
  const total = ((r && r.events) || []).find((e) => e.type === 'hand_total') || {};
  advance();
  return { total, mult: Number(total.mult) };
}
function typed(t) { const j = add('j_credit_card'); apply_type_sticker(j, t); return j; }
const form = (j) => { const v = {}; view_card(j, v); return v.poke && v.poke.form; };
const drawnCell = (j) => {
  const v = {}; view_card(j, v);
  const f = POKE_UI.face({ center: key(j), facing: 'front', poke: v.poke, atlas: j.config.center.atlas, pos: j.config.center.pos, soul_pos: j.config.center.soul_pos }, { area: 'jokers' });
  const p = f ? f.pos : j.config.center.pos;
  return `{${p.x},${p.y}}`;
};
const enh = (k) => (G.playing_cards || []).filter((c) => key(c) === k).length;
const sgs = () => enh('m_stone') + enh('m_glass') + enh('m_steel');
/** Every playing card of the full deck becomes `suit` (no card added or removed). */
const allSuit = (suit) => { for (const c of G.playing_cards) c.change_suit(suit); };
function useOn(k, target) { const c = add(k); const r = act({ type: 'use', id: c.sort_id, targets: [], ...(target ? { joker_targets: [target.sort_id] } : {}) }); flush(); return r; }
function hang(n) { const hm = add('c_hanged_man'); clearHand(); const cs = cards(Array.from({ length: n }, (_, i) => 'S_' + (i + 3))); const r = act({ type: 'use', id: hm.sort_id, targets: cs.map((c) => c.sort_id) }); flush(); return r; }
const COUNTS = {};

// ------------------------------------------------------------------- the pin
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 60 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 60+ (pin 3.9.1+r60 when it landed; r59 the legendary solo rule)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  ok(['fusion_x', 'fusion_mod', 'destroyed', 'hearts', 'therian_rounds', 'giga_rounds', 'delta_on', 'kyurem_form', 'hands', 'd_size', 'lake_mod'].every((f) => !(f in energy_values)),
    'the banks, the counters and the +1 hand / discard are no energy fields');
});

// ------------------------------------------------------------------- Rayquaza alone: +1 hand and +1 discard
await sec('rayquaza', () => {
  start('LSRAY', {}, { noBlind: true });
  const h0 = G.GAME.round_resets.hands, d0 = G.GAME.round_resets.discards;
  const r = add('j_poke_rayquaza');
  ok(G.GAME.round_resets.hands === h0 + 1 && G.GAME.round_resets.discards === d0 + 1, 'Rayquaza alone: +1 hand and +1 discard each round', [G.GAME.round_resets.hands, G.GAME.round_resets.discards]);
  act({ type: 'select_blind' }); flush();
  COUNTS.rayHands = [cr().hands_left, cr().discards_left];
  ok(cr().hands_left === h0 + 1 && cr().discards_left === d0 + 1, 'the round: 5 hands, 4 discards', COUNTS.rayHands);
  const t = play(['C_2', 'C_3', 'D_4', 'H_5', 'S_6']);
  ok(near(ex(r).ascent_Xmult, 1.2) && near(t.mult, 4 * 1.2), 'Dragon Ascent unchanged: a Straight +X0.2, X1.2', [ex(r).ascent_Xmult, t.total]);
  ok(/Delta Stream: \+1 hand and \| \+1 discard each round/.test(plain(r)) && /Also calms Kyogre and Groudon/.test(plain(r)), 'text: Delta Stream +1 hand and +1 discard; calms the clash', plain(r));
  round();
  ok(cr().hands_left === h0 + 1 && cr().discards_left === d0 + 1, 'and the next round', [cr().hands_left, cr().discards_left]);
  for (let i = 0; i < 3; i++) increment_energy(r, 'Dragon');
  ok(ex(r).hands === 1 && ex(r).d_size === 1, 'Energy never raises the +1 hand / discard', [ex(r).hands, ex(r).d_size]);
  act({ type: 'sell', id: r.sort_id }); flush();
  ok(G.GAME.round_resets.hands === h0 && G.GAME.round_resets.discards === d0, 'sold: both taken back', [G.GAME.round_resets.hands, G.GAME.round_resets.discards]);
  // a Rayquaza obtained on the r58 rules gives nothing, takes nothing back, and starts giving at the next Blind (live)
  start('LSRAY2', {}, { noBlind: true });
  const old = oldRules(() => add('j_poke_rayquaza'));
  ok(G.GAME.round_resets.hands === h0 && !ex(old).delta_on, 'r58 rules: Rayquaza gave nothing (it only calmed the clash)', G.GAME.round_resets.hands);
  act({ type: 'select_blind' }); flush();
  ok(G.GAME.round_resets.hands === h0 + 1 && cr().hands_left === h0 + 1 && cr().discards_left === d0 + 1 && ex(old).delta_on, '... live (r59) it starts giving them when the next Blind is selected', [cr().hands_left, cr().discards_left]);
  act({ type: 'sell', id: old.sort_id }); flush();
  ok(G.GAME.round_resets.hands === h0 && G.GAME.round_resets.discards === d0, '... and sold, takes back exactly that', [G.GAME.round_resets.hands, G.GAME.round_resets.discards]);
  start('LSRAY3', {}, { noBlind: true });
  const o3 = oldRules(() => add('j_poke_rayquaza'));
  act({ type: 'sell', id: o3.sort_id }); flush();
  ok(G.GAME.round_resets.hands === h0 && G.GAME.round_resets.discards === d0, 'an r58 Rayquaza sold before it gave anything takes nothing back', [G.GAME.round_resets.hands, G.GAME.round_resets.discards]);
});

// ------------------------------------------------------------------- Latias / Latios alone
await sec('eon alone', () => {
  start('LSEON');
  const la = add('j_poke_latias');
  useOn('c_venus'); useOn('c_mercury');
  ok(near(ex(la).eon_Xmult, 1.15), 'Latias alone: two Planets (Venus, Mercury: not High Card), X0.075 each (X1.15)', ex(la).eon_Xmult);
  useOn('c_hermit');
  let t = play(['S_2']);
  ok(near(t.mult, 1.3), '... then a Tarot X0.15: plays X1.3', t.total);
  start('LSEON2');
  const lo = add('j_poke_latios');
  useOn('c_hermit'); useOn('c_venus');
  t = play(['S_2']);
  ok(near(ex(lo).eon_Xmult, 1.225) && near(t.mult, 1.225), 'Latios alone: a Tarot X0.075 + a Planet X0.15: plays X1.225', [ex(lo).eon_Xmult, t.total]);
  ok(/Soul Dew: also gains \| X0\.075 Mult each time \| you use a Tarot card/.test(plain(lo)), 'Latios text: Soul Dew, X0.075 per Tarot', plain(lo));
  for (let i = 0; i < 3; i++) increment_energy(lo, 'Psychic');
  ok(near(ex(lo).Xmult_mod, 0.24) && /\| X0\.12 Mult each time/.test(plain(lo)) && near(ex(lo).eon_Xmult, 1.225), 'Energy x3: gain 0.24, Soul Dew 0.12 (half); the bank untouched', [ex(lo).Xmult_mod, ex(lo).eon_Xmult]);
  useOn('c_hermit');
  ok(near(ex(lo).eon_Xmult, 1.345), '... a Tarot then: +0.12', ex(lo).eon_Xmult);
});

// ------------------------------------------------------------------- the Lake trio with no other guardian
await sec('lake alone', () => {
  start('LSLAKE');
  const az = add('j_poke_azelf');
  let t = finalPlay(['S_2']);
  ok(near(t.mult, 2.5), 'Azelf alone: X2.5 on the final hand', t.total);
  typed('Psychic');
  t = finalPlay(['S_2']);
  ok(near(t.mult, 2.75), '+ a Psychic (Tera) Joker: X2.75', t.total);
  const p2 = add('j_poke_arceus');
  t = finalPlay(['S_2']);
  // Arceus: X(1 + 0.25 x types: Psychic (Azelf), the Tera Psychic, Colorless itself -> 2 types) = X1.5
  ok(near(t.mult, 3 * 1.5), '+ Arceus (counts as Psychic): 2 others, Azelf X3 (Arceus X1.5 itself)', t.total);
  typed('Psychic');
  t = finalPlay(['S_2']);
  ok(near(t.mult, 3 * 1.5) && /Psychic Joker \(max 2\) \| \(Currently 2\/2\)/.test(plain(az)), 'a third Psychic Joker: capped at 2 (still X3)', [t.total, plain(az)]);
  debuff(p2);
  t = finalPlay(['S_2']);
  ok(near(t.mult, 3), 'a debuffed Arceus doesn\'t count (two Teras left: X3)', t.total);
  typed('Fire');
  ok(/\(Currently 2\/2\)/.test(plain(az)), 'a Fire Joker doesn\'t count', plain(az));
  start('LSLAKE2');
  const me = add('j_poke_mesprit'); typed('Psychic');
  t = play(['S_2']);
  ok(near(t.mult, 2.75), 'Mesprit + one Psychic Joker: X2.75 on a new poker hand', t.total);
  t = play(['S_3']);
  ok(near(t.mult, 1.75), '... X1.75 on a repeat', t.total);
  void me;
});

// ------------------------------------------------------------------- the Regis alone: 1 more on a Boss Blind
await sec('regis boss', () => {
  start('LSREGI', {}, { noBlind: true });
  const rk = add('j_poke_regirock');
  const per = [];
  for (let b = 0; b < 3; b++) {
    const s0 = enh('m_stone');
    if (b) { endRound(); if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' }); if (G.STATE === STATES.SHOP) act({ type: 'next_round' }); G.GAME.round_resets.blind_choices.Boss = 'bl_wall'; }
    act({ type: 'select_blind' }); flush(); clearHand();
    per.push([G.GAME.blind.boss ? 'Boss' : 'not', enh('m_stone') - s0]);
  }
  COUNTS.regiBlinds = per.map((p) => p[1]).join();
  ok(per.map((p) => p.join(':')).join() === 'not:1,not:1,Boss:2', 'Regirock alone: Small 1, Big 1, the Boss Blind 2 Stone cards', per);
  ok(/selected, 1 random card\(s\) in/.test(plain(rk)) && /1 more on a Boss Blind/.test(plain(rk)), 'text: 1 card, 1 more on a Boss Blind', plain(rk));
  start('LSREGI2', {}, { noBlind: true });
  const ice = add('j_poke_regice');
  for (let i = 0; i < 2; i++) increment_energy(ice, 'Water');
  act({ type: 'select_blind' }); flush(); round();   // Small, Big
  endRound(); if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' }); if (G.STATE === STATES.SHOP) act({ type: 'next_round' }); G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  const g0 = enh('m_glass');
  act({ type: 'select_blind' }); flush();
  ok(G.GAME.blind.boss && enh('m_glass') - g0 === 4, 'a 2-Energy Regice on a Boss Blind: 3 + 1 = 4 Glass cards', [G.GAME.blind.boss, enh('m_glass') - g0]);
});

// ------------------------------------------------------------------- Regigigas alone: the deck shortens the wait; Creator
await sec('regigigas', () => {
  start('LSGIGA', {}, { noBlind: true });
  const pcs = G.playing_cards.slice().sort((a, b) => a.sort_id - b.sort_id);
  for (const c of pcs.slice(0, 10)) c.set_ability(P_CENTERS[['m_stone', 'm_glass', 'm_steel'][c.sort_id % 3]], null, true);
  const g = add('j_poke_regigigas');
  ok(/Currently 10: wakes after 3/.test(plain(g)) && /Asleep: 3 left/.test(plain(g)), '10 Stone / Glass / Steel cards: wakes after 3 rounds', plain(g));
  act({ type: 'select_blind' }); flush(); clearHand();
  const trace = [];
  let t = play(['S_2']);
  ok(near(t.mult, 1), 'asleep: nothing', t.total);
  round(); trace.push(ex(g).slow_start);
  round(); trace.push(ex(g).slow_start);
  const before = sgs();
  round(); trace.push(ex(g).slow_start);
  COUNTS.gigaTrace = trace.join();
  ok(trace.join() === '2,1,0', 'the countdown: 2 1 0 (awake after round 3)', trace);
  ok(sgs() === before + 1, 'awake: Creator turned 1 card into Stone, Glass or Steel when the next Blind was selected', [before, sgs()]);
  t = play(['S_2']);
  ok(near(t.mult, 4) && /Awake!/.test(plain(g)), 'X4 Mult, Awake!', [t.total, plain(g)]);
  const b2 = sgs(); round();
  ok(sgs() === b2 + 1, 'every Blind: 1 more', [b2, sgs()]);
  // a deck that grows mid-wait shortens it; min 1 round
  start('LSGIGA2', {}, { noBlind: true });
  const g2 = add('j_poke_regigigas');
  act({ type: 'select_blind' }); flush(); clearHand();
  round();
  ok(ex(g2).slow_start === 4, 'no Stone / Glass / Steel: 4 left after a round', ex(g2).slow_start);
  for (const c of G.playing_cards.slice(0, 15)) c.set_ability(P_CENTERS.m_stone, null, true);
  ok(/wakes after 2/.test(plain(g2)) && /Asleep: 1 left/.test(plain(g2)), '15 Stone added mid-wait: wakes after 2 (it has had 1): 1 left', plain(g2));
  round();
  ok(ex(g2).slow_start === 0, '... awake after round 2', ex(g2).slow_start);
  start('LSGIGA3', {}, { noBlind: true });
  for (const c of G.playing_cards.slice(0, 30)) c.set_ability(P_CENTERS.m_glass, null, true);
  const g3 = add('j_poke_regigigas');
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(/wakes after 1/.test(plain(g3)), '30 Glass: wakes after 1 round (the minimum)', plain(g3));
  round();
  ok(ex(g3).slow_start === 0, '... awake after 1 round', ex(g3).slow_start);
  // Creator prefers unenhanced cards, and changes nothing while asleep
  start('LSGIGA4', {}, { noBlind: true });
  const g4 = add('j_poke_regigigas');
  const b4 = sgs(); act({ type: 'select_blind' }); flush();
  ok(sgs() === b4, 'asleep: Creator does nothing', sgs());
  ex(g4).slow_start = 0;
  endRound();
  const only = G.playing_cards[7];
  for (const c of G.playing_cards) if (c !== only) c.set_ability(P_CENTERS.m_bonus, null, true);
  const nb = enh('m_bonus');
  advance();
  ok(['m_stone', 'm_glass', 'm_steel'].includes(key(only)) && enh('m_bonus') === nb, 'Creator: the one unenhanced card is the one converted (no Bonus card touched)', [key(only), nb, enh('m_bonus')]);
});

// ------------------------------------------------------------------- Giratina alone: Origin after 10 destroyed
await sec('giratina', () => {
  start('LSGIR');
  const g = add('j_poke_giratina');
  const dlg = add('j_poke_dialga');
  ok(form(g) === 'altered', 'a Dialga held changes nothing now: Altered', form(g));
  act({ type: 'sell', id: dlg.sort_id }); flush();
  for (let i = 0; i < 4; i++) hang(2);
  ok(near(ex(g).shadow_Xmult, 3) && ex(g).destroyed === 8 && /\(Destroyed: 8\/10\)/.test(plain(g)) && form(g) === 'altered', '8 destroyed: X3, (Destroyed: 8/10), Altered', [ex(g).shadow_Xmult, plain(g)]);
  hang(2);
  ok(near(ex(g).shadow_Xmult, 3.5) && ex(g).destroyed === 10, 'the 9th and 10th gain Altered (+0.25 each): X3.5', ex(g).shadow_Xmult);
  ok(form(g) === 'origin' && drawnCell(g) === '{10,3}' && /\(Origin Forme\)/.test(plain(g)), '10 destroyed: Origin Forme, the Origin card {10,3}', [form(g), drawnCell(g), plain(g)]);
  hang(2);
  COUNTS.giratina = ex(g).shadow_Xmult;
  ok(near(ex(g).shadow_Xmult, 4.5), 'Origin: +X0.5 a card (X4.5)', ex(g).shadow_Xmult);
  const t = play(['S_2']);
  ok(near(t.mult, 4.5), 'a High Card: X4.5', t.total);
  round(); round();
  ok(form(g) === 'origin', 'for good (rounds later)', form(g));
  ok(/Origin Forme: for good once \| 10 playing cards have been \| destroyed while you have it, \| gains X0\.5 instead/.test(plain(g)), 'text', plain(g));
  // r58 rules: a partner still made the Origin
  start('LSGIR2');
  const g2 = add('j_poke_giratina'); add('j_poke_palkia');
  oldRules(() => { hang(2); });
  ok(near(ex(g2).shadow_Xmult, 2) && ex(g2).destroyed === 2, 'r58 rules: with Palkia the gain was doubled (X2), and the count still runs (2)', [ex(g2).shadow_Xmult, ex(g2).destroyed]);
});

// ------------------------------------------------------------------- the Swords alone: Swords of Justice
/** Play n cards taken from the DECK (no card created: the full deck stays as it is) matching pred -> {mult, ...}. */
function playDeck(pred, n = 1) {
  clearHand();
  const cs = G.deck.cards.filter(pred).slice(0, n);
  if (cs.length < n) throw new Error('playDeck: only ' + cs.length + ' matching cards in the deck');
  for (const c of cs) { G.deck.remove_card(c); G.hand.emplace(c); }
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (cr().hands_left < 2) cr().hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const total = ((r && r.events) || []).find((e) => e.type === 'hand_total') || {};
  return { total, mult: Number(total.mult) };
}
const plainSuit = (s) => (c) => key(c) === 'c_base' && c.base.suit === s;
/** The full deck's suits (Wild every suit, Stone none), as the Swords read it. */
const suitCount = () => { const n = { Spades: 0, Hearts: 0, Clubs: 0, Diamonds: 0 }; for (const c of G.playing_cards) for (const s in n) if (c.is_suit(s, true)) n[s]++; return n; };
/** Every played / discarded card back to the deck (the hand emptied), so the next playDeck can take any card. */
const regather = () => { clearHand(); for (const c of G.discard.cards.slice()) { G.discard.remove_card(c); G.deck.emplace(c); } };
await sec('swords', () => {
  // contentRev 60: a plain 52-card deck ties all four suits, and a tie doesn't count: every sword X1.25
  start('LSSWD');
  const co = add('j_poke_cobalion'), te0 = add('j_poke_terrakion'), vi = add('j_poke_virizion'), ke = add('j_poke_keldeo');
  ok(G.playing_cards.length === 52 && JSON.stringify(suitCount()) === '{"Spades":13,"Hearts":13,"Clubs":13,"Diamonds":13}', 'a plain 52-card deck: 13 of each suit', suitCount());
  let t = playDeck(plainSuit('Spades'));
  COUNTS.swordPlain = t.mult;
  ok(G.playing_cards.length === 52 && near(t.mult, 1.25), "a plain 52-card deck (all four suits tie; a tie doesn't count): a Spade X1.25 for Cobalion", t.total);
  ok([co, te0, vi, ke].every((j) => /; now X1\.25 ?\)/.test(plain(j)) && /13, tied for top/.test(plain(j))), 'every sword: "<suit> 13, tied for top; now X1.25"', [co, te0, vi, ke].map(plain));
  // on the rules of a move recorded on r59, the same tie counted: X1.5
  regather();
  t = r59Rules(() => playDeck(plainSuit('Spades')));
  ok(near(t.mult, 1.5), 'r59 rules (a move recorded before r60): the tie counted, X1.5', t.total);
  regather();
  t = playDeck(plainSuit('Spades'));
  ok(near(t.mult, 1.25) && PINS.RULES.pins === null, 'live again: X1.25', t.total);
  // one extra Spade: Spades 14 lead strictly; Cobalion X1.5, the others still X1.25
  regather();
  const extra = hand(['S_5'])[0]; G.hand.remove_card(extra); G.deck.emplace(extra);
  ok(G.playing_cards.length === 53 && suitCount().Spades === 14, 'one extra Spade: 53 cards, Spades 14', suitCount());
  t = playDeck(plainSuit('Spades'));
  ok(near(t.mult, 1.5) && /Spades 14, top 14; now X1\.5 ?\)/.test(plain(co)), 'one extra Spade: Spades lead strictly, Cobalion X1.5', [t.total, plain(co)]);
  regather();
  t = playDeck(plainSuit('Diamonds'));
  ok(near(t.mult, 1.25) && /13, top 14; now X1\.25 ?\)/.test(plain(te0)), '... a Diamond still X1.25 (Terrakion trails)', [t.total, plain(te0)]);
  // a tie of two suits for the most: neither leads
  start('LSSWD3');
  const co3 = add('j_poke_cobalion'); add('j_poke_keldeo');
  const pc3 = G.playing_cards.slice().sort((x, y) => x.sort_id - y.sort_id);
  pc3.forEach((c, i) => c.change_suit(i < 20 ? 'Spades' : i < 40 ? 'Hearts' : i < 46 ? 'Clubs' : 'Diamonds'));
  ok(JSON.stringify(suitCount()) === '{"Spades":20,"Hearts":20,"Clubs":6,"Diamonds":6}', 'Spades 20 / Hearts 20 / Clubs 6 / Diamonds 6', suitCount());
  t = playDeck(plainSuit('Spades'));
  ok(near(t.mult, 1.25) && /Spades 20, tied for top; now X1\.25 ?\)/.test(plain(co3)), 'Spades and Hearts tie for the most: Cobalion X1.25', [t.total, plain(co3)]);
  regather();
  t = playDeck(plainSuit('Hearts'));
  ok(near(t.mult, 1.25), '... and Keldeo X1.25', t.total);
  regather();
  G.deck.cards.find(plainSuit('Hearts')).change_suit('Clubs');               // Hearts 19: Spades lead alone
  t = playDeck(plainSuit('Spades'));
  ok(near(t.mult, 1.5) && /Spades 20, top 20; now X1\.5 ?\)/.test(plain(co3)), 'one Heart fewer (Spades 20, Hearts 19): Cobalion X1.5', [t.total, plain(co3)]);
  regather();
  t = playDeck(plainSuit('Hearts'));
  ok(near(t.mult, 1.25), '... Keldeo X1.25', t.total);
  // Wild cards count for every suit; Stone for none
  start('LSSWD2');
  const te = add('j_poke_terrakion');
  allSuit('Spades');
  const pcs = G.playing_cards.slice().sort((x, y) => x.sort_id - y.sort_id);
  for (const c of pcs.slice(0, 30)) c.set_ability(P_CENTERS.m_wild, null, true);   // 30 Wild = 30 of every suit; 22 plain Spades
  for (const c of pcs.slice(30)) c.set_ability(P_CENTERS.m_stone, null, true);     // the rest Stone: no suit
  ok(JSON.stringify(suitCount()) === '{"Spades":30,"Hearts":30,"Clubs":30,"Diamonds":30}', '30 Wild + 22 Stone: 30 of every suit', suitCount());
  t = playDeck((c) => key(c) === 'm_wild');
  ok(near(t.mult, 1.25), 'Wild cards count for every suit, Stone for none: all four tie at 30, a played Wild (a Diamond) X1.25', t.total);
  regather();
  pcs[30].set_ability(P_CENTERS.c_base, null, true); pcs[30].change_suit('Diamonds');   // one Stone back as a Diamond: Diamonds 31
  t = playDeck((c) => key(c) === 'm_wild');
  ok(near(t.mult, 1.5), 'one Stone becomes a Diamond (Diamonds 31, the rest 30): the Wild X1.5 for Terrakion', t.total);
  regather();
  t = play(['D_5']);
  ok(near(t.mult, 1.5), 'a new Diamond played (Diamonds 32): X1.5', t.total);
  for (const c of pcs.slice(31)) c.set_ability(P_CENTERS.c_base, null, true);     // 21 plain Spades back: Spades 51
  t = play(['D_5']);
  ok(near(t.mult, 1.25), 'Spades 51 vs Diamonds 33: X1.25', t.total);
  for (let i = 0; i < 3; i++) increment_energy(te, 'Earth');
  allSuit('Diamonds');
  t = play(['D_5']);
  ok(near(ex(te).Xmult_multi, 1.4375) && near(t.mult, 1.725), 'Energy x3: X1.4375 base, Justice X1.725 (1.5 +5% a step)', [ex(te).Xmult_multi, t.total]);
  ok(/Swords of Justice: X1\.725 \| instead while Diamonds are the \| most common suit in your \| full deck \(a tie doesn't count\)/.test(plain(te)), "text: \"(a tie doesn't count)\"", plain(te));
  ok(!/ties count/.test(plain(te)), 'the old "(ties count)" is gone', plain(te));
});

// ------------------------------------------------------------------- Keldeo alone: Resolute after 25 Hearts
await sec('keldeo', () => {
  start('LSKEL');
  const k = add('j_poke_keldeo');
  allSuit('Spades');                     // Hearts never lead: the Ordinary X is X1.25
  const H5 = ['H_2', 'H_4', 'H_6', 'H_8', 'H_T'];
  let t;
  for (let i = 0; i < 4; i++) t = play(H5);
  ok(ex(k).hearts === 20 && form(k) === 'ordinary' && /\(Hearts: 20\/25\)/.test(plain(k)) && near(t.mult, 4 * Math.pow(1.25, 5)), '20 Hearts: Ordinary, (Hearts: 20/25), X1.25 a Heart (a Flush: 4 x 1.25^5)', [ex(k).hearts, plain(k), t.total]);
  t = play(H5);
  ok(ex(k).hearts === 25 && near(t.mult, 4 * Math.pow(1.25, 5)), 'the 21st-25th still pay Ordinary', [ex(k).hearts, t.total]);
  ok(form(k) === 'resolute' && drawnCell(k) === '{2,6}' && /\(Resolute Form\)/.test(plain(k)), '25 Hearts: Resolute Form, its Resolute card {2,6}', [form(k), drawnCell(k), plain(k)]);
  t = play(['H_3']);
  COUNTS.keldeo = t.mult;
  ok(near(t.mult, 2), 'Resolute: a Heart X2', t.total);
  round(); round();
  t = play(['H_3']);
  ok(near(t.mult, 2) && form(k) === 'resolute', 'for good', t.total);
  // a Blueprint copy doesn't count Hearts
  start('LSKEL2');
  add('j_blueprint'); const k2 = add('j_poke_keldeo');   // (Blueprint copies the joker to its right)
  const tb = play(['H_4', 'H_4']);
  ok(near(tb.mult, 2 * Math.pow(1.5, 4)), 'Blueprint copies the X (a Pair of Hearts, the 2 new Hearts lead the deck: X1.5 four times)', tb.total);
  ok(ex(k2).hearts === 2, 'Blueprint copies the X but never counts Hearts (2, not 4)', ex(k2).hearts);
});

// ------------------------------------------------------------------- the Forces alone: Therian after 4 rounds
await sec('therian', () => {
  start('LSTOR');
  const to = add('j_poke_tornadus'), th = add('j_poke_thundurus'), la = add('j_poke_landorus');
  ok(/\(Therian in 4 rounds\)/.test(plain(to)) && /\(Therian in 4 rounds\)/.test(plain(th)) && /\(Therian in 4 rounds\)/.test(plain(la)), 'tooltips: (Therian in 4 rounds)', [plain(to)]);
  let t = play(['S_2'], { left: 3 });
  ok(near(t.mult, 1), 'Incarnate Tornadus: no Mult', t.total);
  round(); round(); round();
  ok(form(to) === 'incarnate' && /\(Therian in 1 round\)/.test(plain(to)), '3 rounds: Incarnate, (Therian in 1 round)', plain(to));
  round();
  ok(form(to) === 'therian' && form(th) === 'therian' && form(la) === 'therian' && drawnCell(to) === '{8,3}', '4 rounds: all three Therian (alone, no partner rule), Tornadus\'s Therian card {8,3}', [form(to), form(th), form(la), drawnCell(to)]);
  act({ type: 'sell', id: th.sort_id }); flush();   // (its 1 in 2 money / X1.1 would blur the exact numbers)
  t = play(['S_2'], { left: 3 });
  ok(near(t.mult, 1 + 3 * 2), 'Therian Tornadus: +3 Mult per hand left (2 after this one): +6', t.total);
  t = play([['S_9', 'm_stone']], { left: 3 });
  ok(near(t.mult, 1 * 1.5 + 3 * 2), 'Therian Landorus: a scored Stone X1.5 (the card first, then Tornadus +6)', t.total);
  // each counts its own rounds: one bought later is Incarnate
  const t2 = add('j_poke_tornadus');
  ok(form(t2) === 'incarnate' && /\(Therian in 4 rounds\)/.test(plain(t2)), 'a second Tornadus bought now: its own 4 rounds', plain(t2));
  ok(/Therian Forme: after you \| have had it for 4 rounds/.test(plain(to)), 'text', plain(to));
});

// ------------------------------------------------------------------- Reshiram / Zekrom alone: Fusion Flare / Bolt
await sec('fusion', () => {
  start('LSRES');
  const re = add('j_poke_reshiram');
  const ch = add('j_poke_charmander'), pk = add('j_poke_pikachu');
  ok(useOn('c_poke_fire_energy', ch).ok, 'a Fire Energy used on Charmander');
  ok(useOn('c_poke_fire_energy', re).ok, 'a Fire Energy used on Reshiram itself (energizes it too)');
  ok(near(ex(re).fusion_x, 0.1), 'two Fire Energy used (any target): +X0.1 banked', ex(re).fusion_x);
  ok(useOn('c_poke_lightning_energy', pk).ok && near(ex(re).fusion_x, 0.1), 'a Lightning Energy: nothing for Reshiram', ex(re).fusion_x);
  act({ type: 'sell', id: pk.sort_id }); flush();
  let t = play(['S_2']);
  const x = 1.3125 + 0.1;
  COUNTS.reshiram = t.mult;
  ok(near(t.mult, x * x), 'Reshiram (1 Energy X1.3125 + 0.1 banked = X1.4125) for each Fire Joker: itself and Charmander', [t.total, x]);
  ok(/Fusion Flare: each Fire Energy \| card used permanently adds \| X0\.05 to that X Mult \| \(Banked: \+0\.1\)/.test(plain(re)), 'text: Fusion Flare, Banked +0.1', plain(re));
  for (let i = 0; i < 2; i++) increment_energy(re, 'Fire');
  ok(near(ex(re).fusion_x, 0.1) && near(ex(re).fusion_mod, 0.05), 'Energy never raises the bank or the gain', [ex(re).fusion_x, ex(re).fusion_mod]);
  start('LSZEK');
  const bp = add('j_blueprint'), ze = add('j_poke_zekrom');
  ok(useOn('c_poke_lightning_energy', ze).ok, 'a Lightning Energy on Zekrom');
  ok(near(ex(ze).fusion_x, 0.05), 'Zekrom: +X0.05, once (Blueprint never banks)', ex(ze).fusion_x);
  t = play(['S_2']);
  ok(near(t.mult, 1.3625 * 1.3625), 'Zekrom alone (itself Lightning; 1 Energy X1.3125 + 0.05): X1.3625, and Blueprint copies it', t.total);
  void bp;
  // r58 rules: no bank
  start('LSRES2');
  const r2 = add('j_poke_reshiram');
  const c2 = add('j_poke_charmander');
  oldRules(() => useOn('c_poke_fire_energy', c2));
  ok(!(ex(r2).fusion_x > 0), 'r58 rules: nothing banked', ex(r2).fusion_x);
});

// ------------------------------------------------------------------- Kyurem alone: White / Black by the row
await sec('kyurem', () => {
  start('LSKYU');
  const ky = add('j_poke_kyurem');
  ok(form(ky) === 'base' && drawnCell(ky) === '{2,5}', 'no Fire / Lightning Jokers: plain Kyurem', [form(ky), drawnCell(ky)]);
  let t = play(['S_2']);
  ok(near(t.mult, 1.5), 'X1.5 alone', t.total);
  const f1 = typed('Fire');
  t = play(['S_2']);
  ok(form(ky) === 'white' && drawnCell(ky) === '{8,5}' && near(t.mult, 1.5 * 1.25), 'a Fire Joker: White Kyurem {8,5}, X1.25 for it (X1.5 x X1.25)', [form(ky), drawnCell(ky), t.total]);
  const l1 = typed('Lightning');
  t = play(['S_2']);
  ok(form(ky) === 'white' && near(t.mult, 1.5 * 1.25), '1 Fire, 1 Lightning: a tie keeps White', [form(ky), t.total]);
  const l2 = typed('Lightning');
  t = play(['S_2']);
  ok(form(ky) === 'black' && drawnCell(ky) === '{4,5}' && near(t.mult, 1.5 * 1.25 * 1.25), '2 Lightning: Black Kyurem {4,5}, each Lightning Joker X1.25', [form(ky), drawnCell(ky), t.total]);
  act({ type: 'sell', id: l2.sort_id }); flush();
  t = play(['S_2']);
  ok(form(ky) === 'black' && near(t.mult, 1.5 * 1.25), 'back to a tie: keeps Black', [form(ky), t.total]);
  ok(/\(Black Kyurem: 1 Fire, 1 Lightning\)/.test(plain(ky)), 'tooltip: (Black Kyurem: 1 Fire, 1 Lightning)', plain(ky));
  apply_type_sticker(ky, 'Fire');
  ok(form(ky) === 'black', 'Kyurem itself (a Fire Tera) is never counted', form(ky));
  for (let i = 0; i < 3; i++) increment_energy(ky, 'Fire');
  ok(near(ex(ky).Xmult_multi, 1.4375), 'Energy: the per-type X 1.25 -> 1.4375 (+5% a step)', ex(ky).Xmult_multi);
  void f1; void l1;
});

// ------------------------------------------------------------------- save / resume (a run is its recipe)
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'LSRESUME', customDeck: { name: 'Solo', mods: ['pokermon'], params: { joker_slots: 8, consumable_slots: 8, blind_scaling: 0.05 },
    jokers: [{ key: 'j_poke_giratina' }, { key: 'j_poke_keldeo' }, { key: 'j_poke_tornadus' }, { key: 'j_poke_reshiram' }, { key: 'j_poke_kyurem' }, { key: 'j_poke_rayquaza' }],
    consumables: [{ key: 'c_hanged_man' }, { key: 'c_hanged_man' }, { key: 'c_poke_fire_energy' }] } });
  flush();
  const J = (n) => G.jokers.cards.find((c) => key(c) === 'j_poke_' + n);
  const must = (a) => { const r = s.act(a); flush(); if (!r.ok) throw new Error(JSON.stringify(a) + ': ' + r.error); return r; };
  must({ type: 'select_blind' });
  for (const hm of G.consumeables.cards.filter((c) => key(c) === 'c_hanged_man')) must({ type: 'use', id: hm.sort_id, targets: G.hand.cards.slice(0, 2).map((c) => c.sort_id) });
  must({ type: 'use', id: G.consumeables.cards.find((c) => key(c) === 'c_poke_fire_energy').sort_id, joker_targets: [J('reshiram').sort_id] });
  let rounds = 0;
  while (rounds < 2) {
    if (G.STATE === STATES.BLIND_SELECT) must({ type: 'select_blind' });
    must({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
    must({ type: 'play' });
    if (G.STATE === STATES.ROUND_EVAL) { must({ type: 'cash_out' }); must({ type: 'next_round' }); rounds++; }
  }
  const snap = () => [ex(J('giratina')).destroyed, ex(J('giratina')).shadow_Xmult, ex(J('keldeo')).hearts, ex(J('tornadus')).therian_rounds, ex(J('reshiram')).fusion_x, ex(J('rayquaza')).delta_on, G.GAME.round_resets.hands, G.GAME.round_resets.discards];
  const live = snap();
  ok(live[0] === 4 && near(live[1], 2) && live[2] > 0 && live[3] === 2 && near(live[4], 0.05) && live[5] === true, 'live: 4 destroyed (X2), Hearts counted, 2 rounds held, +X0.05 banked, Delta Stream on', live);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  const back = snap();
  ok(!r.stoppedAt && JSON.stringify(back) === JSON.stringify(live), 'resumed: every counter, bank and the +1 hand / discard come back exactly', [r.stoppedAt, back, live]);
  const st = Session.stepper(JSON.parse(JSON.stringify(s.recipe))); st.seek(st.total);
  ok(!st.error && JSON.stringify(snap()) === JSON.stringify(live), 'the replay stepper too', snap());
});

// ------------------------------------------------------------------- an r58 run re-plays on the partner rules
await sec('r58 recipe', () => {
  const FIX = JSON.parse(readFileSync(new URL('../fixtures/pokermon_legsolo_r58_recipe.json', import.meta.url), 'utf8'));
  ok(FIX.modVersions.pokermon === '3.9.1+r58', 'the fixture: recorded on 3.9.1+r58 (main before the solo rule)', FIX.modVersions);
  const J = (n) => G.jokers.cards.find((c) => key(c) === 'j_poke_' + n);
  const state = (tot) => ({ total: tot && tot.total, mult: tot && tot.mult, hands: cr().hands_left, discards: cr().discards_left, latias: ex(J('latias')).eon_Xmult, latios: ex(J('latios')).eon_Xmult,
    giratina: ex(J('giratina')).shadow_Xmult, stone: enh('m_stone'), glass: enh('m_glass') });
  // what r58 recorded (tests/record run on main: High Card 21784, Mult 622.4252720260623; 4 hands / 3 discards left; Latias / Latios X1.3;
  // Giratina X2 (Origin with Dialga); 2 Stone + 2 Glass from the Regi count)
  const WANT = { total: 21784, mult: 622.4252720260623, hands: 4, discards: 3, latias: 1.3, latios: 1.3, giratina: 2, stone: 2, glass: 2 };
  const st = Session.stepper(JSON.parse(JSON.stringify(FIX)));
  let tot = null;
  while (!st.done) { const r = st.step(); const h = r && (r.events || []).find((e) => e.type === 'hand_total'); if (h) tot = h; }
  const got = state(tot);
  COUNTS.r58 = got;
  ok(!st.error && st.index === FIX.actions.length, 'every r58 move re-plays', st.error);
  ok(Object.keys(WANT).every((k) => near(Number(got[k]), WANT[k])), 'the r58 run re-plays EXACTLY as recorded (the partner rules: Soul Dew, Origin with Dialga, the Regi count, no Delta Stream)', [got, WANT]);
  const s = Session.fromRecipe(JSON.parse(JSON.stringify(FIX)), { repin: true }); flush();
  ok(!s.stoppedAt && near(ex(J('latias')).eon_Xmult, 1.3) && near(ex(J('giratina')).shadow_Xmult, 2) && s.recipe.modVersions.pokermon === PINS.modPin('pokermon'), 'resumed with "Continue anyway": the banked X kept (Latias X1.3, Giratina X2), re-pinned to the current pin', [ex(J('latias')).eon_Xmult, s.recipe.modVersions]);
  ok(ex(J('giratina')).destroyed === 2 && ex(J('rayquaza')).delta_on !== true, '... Giratina\'s count came along (2), Rayquaza gives nothing yet', [ex(J('giratina')).destroyed, ex(J('rayquaza')).delta_on]);
  ok(PINS.RULES.pins === null && PINS.rulesRev('pokermon') === MODS.pokermon.contentRev, 'live play is back on the current rules', PINS.RULES.pins);
  // the same moves recorded on r59 play the solo rules: what the gate prevents
  const asNew = { ...JSON.parse(JSON.stringify(FIX)), modVersions: { ...FIX.modVersions, pokermon: '3.9.1+r59' } };
  const st2 = Session.stepper(asNew);
  tot = null;
  while (!st2.done) { const r = st2.step(); const h = r && (r.events || []).find((e) => e.type === 'hand_total'); if (h) tot = h; }
  const neu = state(tot);
  COUNTS.asR59 = neu;
  ok(!st2.error && neu.hands === 5 && neu.discards === 4 && near(neu.latias, 1.225) && near(neu.latios, 1.225) && near(neu.giratina, 1.5) && neu.stone === 1 && neu.glass === 1 && neu.total !== WANT.total,
    'the same moves on r59: Delta Stream (5 hands / 4 discards), Soul Dew halves (X1.225), Altered Giratina (X1.5), 1 Stone + 1 Glass, another score', neu);
});

// ------------------------------------------------------------------- an r59 run re-plays with the Swords' ties counting
await sec('r59 recipe', () => {
  const FIX = JSON.parse(readFileSync(new URL('../fixtures/pokermon_swordtie_r59_recipe.json', import.meta.url), 'utf8'));
  ok(FIX.modVersions.pokermon === '3.9.1+r59' && FIX.customDeck.jokers.length === 4, 'the fixture: recorded on 3.9.1+r59 (main before r60), the four Swords on a plain deck', FIX.modVersions);
  // what r59 recorded (on main: Two Pair, 62 x 10.125 = 627; every scored card X1.5, the four suits tied at 13 and the tie counted)
  const WANT = { chips: 62, mult: 10.125, total: 627 };
  const run = (recipe) => {
    const st = Session.stepper(recipe);
    let tot = null;
    while (!st.done) { const r = st.step(); const h = r && (r.events || []).find((e) => e.type === 'hand_total'); if (h) tot = h; }
    return { err: st.error, index: st.index, chips: tot && Number(tot.chips), mult: tot && Number(tot.mult), total: tot && Number(tot.total), suits: suitCount() };
  };
  const got = run(JSON.parse(JSON.stringify(FIX)));
  COUNTS.r59 = got;
  ok(!got.err && got.index === FIX.actions.length && JSON.stringify(got.suits) === '{"Spades":13,"Hearts":13,"Clubs":13,"Diamonds":13}', 'every r59 move re-plays (a plain deck, 13 of each)', got);
  ok(near(got.mult, WANT.mult) && got.chips === WANT.chips && got.total === WANT.total, 'the r59 run re-plays EXACTLY as recorded: ties counted, X1.5 a card (Mult 10.125, 627)', [got, WANT]);
  const s = Session.fromRecipe(JSON.parse(JSON.stringify(FIX)), { repin: true }); flush();
  ok(!s.stoppedAt && s.recipe.modVersions.pokermon === PINS.modPin('pokermon') && s.recipe.repinned && s.recipe.repinned[0].from.pokermon === '3.9.1+r59',
    'resumed with "Continue anyway": every move kept, re-pinned to r60', [s.stoppedAt, s.recipe.modVersions, s.recipe.repinned]);
  ok(PINS.RULES.pins === null && /tied for top; now X1\.25 ?\)/.test(plain(G.jokers.cards[0])), 'live play after the resume is on r60: the tie no longer counts (X1.25)', plain(G.jokers.cards[0]));
  // the same moves recorded on r60: what the gate prevents
  const neu = run({ ...JSON.parse(JSON.stringify(FIX)), modVersions: { ...FIX.modVersions, pokermon: '3.9.1+r60' } });
  COUNTS.asR60 = neu;
  ok(!neu.err && near(neu.mult, 2 * Math.pow(1.25, 4)) && neu.total !== WANT.total, 'the same moves on r60: X1.25 a card (Mult 4.8828125), another score', neu);
});

console.log('counts:', JSON.stringify(COUNTS));
done();
