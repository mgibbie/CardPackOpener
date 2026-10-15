// Sonfive's Pokermon+ (micatro/mods/pokermonplus): every joker fired through real plays, the
// Timer Ball, the 5 decks, Lilac stake + Weakened, negative Energy, and one test per
// intended-design fix (each would FAIL on the shipped behaviour — noted per test).
//   node micatro/tests/mods/pokermonplus_test.mjs
import { T, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { newRun } from '../../js/engine/run.js';
import { P_CENTER_POOLS, create_card, find_joker } from '../../js/engine/core.js';
import { centerActive } from '../../js/mods/registry.js';
import '../../mods/pokermonplus/index.js';
import * as P from '../../mods/pokermon/api.js';
import * as F from '../../mods/pokermonplus/src/functions.js';
import { STATUS } from '../../mods/pokermonplus/index.js';

const { ok, done } = T();
const near = (a, b) => Math.abs(a - b) < 1e-9;

/** A Pokermon + Pokermon+ run, blind selected, empty hand (like poke_helpers.start). */
function start(seed = 'PLUS', { plus = {}, poke = {}, back = 'b_red', stake = 1, mods = ['pokermon', 'pokermonplus'], noBlind = false } = {}) {
  newRun({ seed, back, stake, mods, modOptions: { pokermon: poke, pokermonplus: plus } });
  G.FORCE_BOSS = 'bl_wall';
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  G.E_MANAGER.flush();
  if (noBlind) return;
  act({ type: 'select_blind' });
  clearHand();
}
const toBoss = () => { let g = 0; while (!G.GAME.blind.boss && g++ < 5) nextRound(); };
const key = (c) => c.config.center.key;
const sealed = (cards, seal) => { for (const c of cards) c.set_seal(seal, true); return cards; };
const discard = (cards) => { act({ type: 'highlight', ids: cards.map((c) => c.sort_id) }); return act({ type: 'discard' }); };
const flush = () => G.E_MANAGER.flush();

// ======================================================================== off
{
  start('OFF', { mods: ['pokermon'] });
  ok(!P_CENTER_POOLS.Joker.some((c) => c.mod === 'pokermonplus'), 'off: no Pokermon+ joker in the pools');
  ok(!centerActive(P_CENTERS.j_sonfive_nincada), 'off: centers inactive');
  let leaked = 0;
  for (let i = 0; i < 300; i++) if (P.get_random_poke_key('offtest' + i).startsWith('j_sonfive')) leaked++;
  ok(leaked === 0, 'off: Poké Balls never give a Pokermon+ joker (registered-but-inactive add-on)', leaked);
  newRun({ seed: 'OFF2', back: 'b_sonfive_voiddeck', stake: 'stake_sonfive_lilac_stake', mods: ['pokermon'] });
  ok(G.GAME.selected_back_key === 'b_red' && G.GAME.stake === 1 && !G.GAME.modifiers.enable_weakened_in_shop && !G.GAME.modifiers.void,
    'off: its decks / stake fall back to Red / White', [G.GAME.selected_back_key, G.GAME.stake]);
  newRun({ seed: 'VAN', back: 'b_red', stake: 'stake_sonfive_lilac_stake' });
  ok(G.GAME.stake === 1 && G.GAME.mods.length === 0, 'vanilla run: unknown stake key -> 1');
}

// ========================================================================= on
{
  start('ON');
  ok(STATUS.PORTED.filter((k) => k.startsWith('j_')).length === 18, '18 jokers registered', STATUS.PORTED.length);
  ok(STATUS.PORTED.filter((k) => k.startsWith('b_')).length === 5 && P_CENTERS.c_sonfive_timerball.set === 'Item', '5 decks + the Timer Ball (Item)');
  ok(STATUS.challenges.length === 4, '4 challenges registered as data', STATUS.challenges.map((c) => c.key));
  const pool = P_CENTER_POOLS.Joker.filter((c) => c.mod === 'pokermonplus').map((c) => c.key);
  ok(pool.length === 18, 'on: all 18 in the joker pool', pool.length);
  // Fix 1 — the shipped mod loaded NONE (src/pokemon.lua needed sonfive_config.customJokers).
  const inPool = (k) => P_CENTERS[k].in_pool(P_CENTERS[k]);
  for (const k of ['j_sonfive_nincada', 'j_sonfive_croagunk', 'j_sonfive_vullaby', 'j_sonfive_meltan', 'j_sonfive_stonjourner', 'j_sonfive_lechonk', 'j_sonfive_nacli', 'j_sonfive_darkrai']) {
    ok(inPool(k), 'fix 1: ' + k + ' can appear (on by default, Croagunk & Vullaby included)');
  }
  ok(!inPool('j_sonfive_shedinja') && !inPool('j_sonfive_melmetal'), 'Shedinja / Melmetal never in a pool (evolution-only)');
  const nc = P_CENTERS.j_sonfive_nincada;
  ok(nc.atlas === 'poke_AtlasJokersBasicNatdex' && nc.pos.x === 8 && nc.pos.y === 19 && nc.poke_custom_prefix === 'sonfive', 'sprites from Pokermon\'s Natdex sheet');
  ok(P_CENTERS.j_sonfive_oinkologne.pos.y === 61, 'Oinkologne: its own sprite cell (not Gen09 {0,0})');
  ok(P_CENTERS.j_sonfive_darkrai.soul_pos && P_CENTERS.j_sonfive_darkrai.config.extra.ptype === 'Dark', 'Darkrai: soul layer + type');
  ok(P.get_family_keys('nincada', 'sonfive').join() === 'j_sonfive_nincada,j_sonfive_ninjask,j_sonfive_shedinja', 'families registered', P.get_family_keys('nincada', 'sonfive'));
}

// ============================================================ Fix: per-line toggles scoped
{
  const pokeSnapshot = () => {
    const pool = P_CENTER_POOLS.Joker.filter((c) => c.mod === 'pokermon' && c.in_pool && c.in_pool(c)).map((c) => c.key).join();
    const balls = []; for (let i = 0; i < 80; i++) balls.push(P.get_random_poke_key('tog' + i, 'Basic'));
    return { pool, balls: balls.filter((k) => k.startsWith('j_poke_')).join() };
  };
  start('TOG');
  const allOn = pokeSnapshot();
  const off = {}; for (const k of ['nincada', 'croagunk', 'darkrai', 'vullaby', 'meltan', 'stonjourner', 'lechonk', 'nacli', 'cetoddle']) off[k] = false;
  start('TOG', { plus: off });
  const allOff = pokeSnapshot();
  ok(allOn.pool === allOff.pool && allOn.pool.length > 1000, 'fix 2: toggles leave Pokermon\'s own pool unchanged');
  const sonBalls = []; for (let i = 0; i < 300; i++) sonBalls.push(P.get_random_poke_key('tog' + i, 'Basic'));
  ok(!sonBalls.some((k) => k.startsWith('j_sonfive')), 'all lines off: no Pokermon+ from a Poké Ball');
  ok(!P_CENTERS.j_sonfive_nincada.in_pool(P_CENTERS.j_sonfive_nincada) && !P_CENTERS.j_sonfive_ninjask.in_pool(P_CENTERS.j_sonfive_ninjask), 'a line toggle covers its evolutions');
  start('TOG', { plus: { nacli: false } });
  ok(!P_CENTERS.j_sonfive_nacli.in_pool(P_CENTERS.j_sonfive_nacli) && P_CENTERS.j_sonfive_lechonk.in_pool(P_CENTERS.j_sonfive_lechonk), 'one line off, the others on');
  ok(P_CENTERS.j_poke_bulbasaur.in_pool(P_CENTERS.j_poke_bulbasaur), 'Pokermon jokers unaffected');
}

// ======================================================================= Nincada line
{
  start('NIN');
  const n = add('j_sonfive_nincada');
  const r = play(hand(['S_2']));
  const base = 5 + 2; // High Card 5 chips + the 2
  ok((r.total.chips === base + 45 && r.total.mult === 1) || (r.total.chips === base && r.total.mult === 1 + 3), 'nincada: +45 Chips or +3 Mult', r.total);
  for (let i = 0; i < 5; i++) nextRound();
  flush();
  ok(key(n) === 'j_sonfive_ninjask', 'nincada -> ninjask after 5 rounds', key(n));
  ok(G.jokers.cards.some((c) => key(c) === 'j_sonfive_shedinja'), 'evolving leaves a Shedinja (room in the row)');
  const r2 = play(hand(['S_2']));
  ok(r2.total.chips === base + 90 && r2.total.mult === 1 + 5, 'ninjask: +90 Chips +5 Mult', r2.total);
  // Speed Boost after each Boss Blind: +1 Energy's worth, no limit, no Energy count.
  const sh = G.jokers.cards.find((c) => key(c) === 'j_sonfive_shedinja'); sh.ability.extra.targets = [{ value: 'Ace', id: 99 }];
  toBoss(); winRound(); flush();
  ok(n.ability.extra.speedboost === 2 && near(n.ability.extra.chips, 90 + 90 * 0.3) && near(n.ability.extra.mult, 5 + 5 * 0.4) && !n.ability.extra.energy_count,
    'ninjask: Speed Boost after the Boss = +1 Energy (117 chips, 7 mult)', n.ability.extra);
}
{
  start('SHED');
  const s = add('j_sonfive_shedinja');
  ok(s.ability.extra.targets.length === 3 && typeof s.ability.extra.targets[0].id === 'number', 'shedinja: 3 target ranks rolled from the deck');
  s.ability.extra.targets = [{ value: 'Ace', id: 14 }, { value: 'King', id: 13 }, { value: 'Queen', id: 12 }];
  hand(['S_2', 'H_2', 'S_5', 'D_9']);
  play(hand(['C_3']));
  ok(s.ability.extra.money === 6, 'shedinja: $2 x 3 unique ranks held', s.ability.extra.money);
  ok(s.config.center.calc_dollar_bonus(s.config.center, s) === 6 && s.ability.extra.earned === 6, 'shedinja: pays it at cash-out');
  clearHand();
  hand(['S_K']);
  play(hand(['C_3'])); flush();
  ok(!G.jokers.cards.includes(s), 'shedinja: a target rank held in hand -> it faints');
}

// ======================================================================= Croagunk line
{
  start('CROAK');
  const c = add('j_sonfive_croagunk');
  const discardPurple = () => { clearHand(); G.GAME.current_round.discards_left = 5; discard(sealed(hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_6']), 'Purple')); flush(); clearHand(); };
  discardPurple();
  ok(c.ability.extra.retriggers === 1, 'croagunk: 5 Purple Seal discard -> +1 retrigger', c.ability.extra.retriggers);
  clearHand(); G.GAME.current_round.discards_left = 5; discard(hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_6'])); flush(); clearHand();
  ok(c.ability.extra.retriggers === 1, 'croagunk: an unsealed discard adds nothing');
  // Fix: a hand WITHOUT Purple Seal scoring cards keeps the stored retriggers (shipped: zeroed after every hand).
  play(hand(['H_9']));
  ok(c.ability.extra.retriggers === 1, 'fix: croagunk keeps its retriggers through a hand with no Purple Seal', c.ability.extra.retriggers);
  discardPurple(); discardPurple();
  ok(c.ability.extra.retriggers === 3, 'croagunk: 3 stored');
  // 3 retriggers over a 2-card scoring hand: first card 2, second 1.
  const pair = sealed(hand(['S_7', 'H_7']), 'Purple');
  const r = play(pair);
  ok(r.total.chips === 10 + 7 * 3 + 7 * 2 && c.ability.extra.retriggers === 0, 'croagunk: retriggers split over the scoring cards, then reset', [r.total, c.ability.extra.retriggers]);
  for (let i = 0; i < 5; i++) discardPurple();
  ok(c.ability.extra.retriggers === 5, 'croagunk: 5 stored');
  winRound(); flush(); // the winning hand has no Purple Seal: the 5 survive to end of round
  ok(key(c) === 'j_sonfive_toxicroak', 'fix: croagunk evolves at 5 retriggers (impossible as shipped)', key(c));
  ok(c.ability.extra.retriggers === 5, 'toxicroak keeps the retriggers (poke_custom_values_to_keep)');
}
{
  start('TOXIC');
  const t = add('j_sonfive_toxicroak');
  const use = (k) => { const c = add(k); act({ type: 'use', id: c.sort_id, targets: [] }); flush(); };
  // The Lua compared consumeable.ability.key (never set): any consumable counted as "the same Tarot".
  use('c_mercury'); // a Planet: not a Tarot
  ok(t.ability.extra.retriggers === 0, 'fix: toxicroak ignores non-Tarot consumables', t.ability.extra.retriggers);
  use('c_judgement');
  ok(t.ability.extra.retriggers === 1 && t.ability.extra.previous_tarot.key === 'c_judgement', 'toxicroak: first Tarot = 1');
  for (const c of G.jokers.cards.slice()) if (c !== t) { G.jokers.remove_card(c); c.remove(); }
  use('c_judgement');
  for (const c of G.jokers.cards.slice()) if (c !== t) { G.jokers.remove_card(c); c.remove(); }
  ok(t.ability.extra.retriggers === 2, 'toxicroak: same Tarot again = 2', t.ability.extra.retriggers);
  use('c_wheel_of_fortune');
  ok(t.ability.extra.retriggers === 1 && t.ability.extra.previous_tarot.key === 'c_wheel_of_fortune', 'toxicroak: a different Tarot restarts at 1');
  const desc = t.config.center.loc_vars(t.config.center, [], t);
  ok(desc.vars[0] === 1 && desc.vars[1] === 'The Wheel of Fortune', 'toxicroak: tooltip names the previous Tarot', desc.vars);
  use('c_wheel_of_fortune');
  const r = play(sealed(hand(['S_7']), 'Purple'));
  ok(r.total.chips === 5 + 7 * 3, 'toxicroak: Purple Seal card retriggered 2x', r.total);
  // Fix: resets at the end of an Ante with no Tarot (shipped: `reset` never re-armed).
  toBoss(); winRound(); flush();
  ok(t.ability.extra.retriggers === 2, 'toxicroak: a Tarot used this Ante -> kept at the Boss');
  nextRound(); toBoss(); winRound(); flush();
  ok(t.ability.extra.retriggers === 0, 'fix: toxicroak resets after an Ante with no Tarot', t.ability.extra.retriggers);
}

// =========================================================================== Darkrai
{
  start('DARK');
  const b = add('j_poke_bulbasaur');
  const base = JSON.parse(JSON.stringify(b.ability.extra));
  const d = add('j_sonfive_darkrai');
  add('c_poke_grass_energy');
  play(hand(['S_2']));
  const field = Object.keys(P.energy_values).find((f) => typeof base[f] === 'number');
  ok(field && near(b.ability.extra[field], base[field] + P_CENTERS.j_poke_bulbasaur.config.extra[field] * P.energy_values[field]) && !b.ability.extra.energy_count,
    'darkrai: a held Grass Energy energizes Grass jokers (no Energy count)', [field, base[field], b.ability.extra[field]]);
  play(hand(['S_2']));
  ok(near(b.ability.extra[field], base[field] + P_CENTERS.j_poke_bulbasaur.config.extra[field] * P.energy_values[field]), 'darkrai: applied once, not per calculate');
  add('c_poke_grass_energy'); play(hand(['S_2']));
  ok(near(b.ability.extra[field], base[field] + 2 * P_CENTERS.j_poke_bulbasaur.config.extra[field] * P.energy_values[field]), 'darkrai: two Energies = 2x');
  // Fix: a base-game joker with a number `extra` (Hiker) and a Grass Tera sticker — crashed the Lua.
  const h = add('j_hiker'); P.apply_type_sticker(h, 'Grass');
  let threw = false; try { play(hand(['S_2'])); } catch (e) { threw = e; }
  ok(!threw && near(h.ability.extra, 5 + 5 * 0.2 * 2), 'fix: darkrai on a base-game (number extra) joker works', [threw && threw.message, h.ability.extra]);
  act({ type: 'sell', id: d.sort_id }); flush();
  ok(near(b.ability.extra[field], base[field]) && near(h.ability.extra, 5), 'darkrai: selling it takes the Energy back', [b.ability.extra[field], h.ability.extra]);
  // Nightmare after each Boss Blind.
  add('j_sonfive_darkrai');
  for (const c of G.consumeables.cards.slice()) { G.consumeables.remove_card(c); c.remove(); }
  toBoss(); winRound(); flush();
  ok(G.consumeables.cards.some((c) => key(c) === 'c_poke_nightmare'), 'darkrai: a Nightmare after the Boss Blind');
}

// ======================================================================= Vullaby line
{
  start('VULL');
  const v = add('j_sonfive_vullaby');
  const cards = hand(['S_9', 'H_9', 'D_9']);
  const r = play(cards);
  ok(cards.every((c) => c.debuff) && v.ability.extra.chips === 12, 'vullaby: first hand\'s scoring cards permanently debuffed, +4 Chips each', [cards.map((c) => c.debuff), v.ability.extra.chips]);
  ok(r.total.chips === 30 + 9 + 12, 'vullaby: the first card scored, then the rest were debuffed; +12 Chips', r.total);
  const r2 = play(hand(['S_2']));
  ok(r2.total.chips === 5 + 2 + 12 && v.ability.extra.chips === 12, 'vullaby: later hands only give the chips', r2.total);
  const five = hand(['S_2', 'S_4', 'S_6', 'S_8', 'S_K']); for (const c of five) P.smods_debuff_card(c, true, 'test');
  play(five);
  ok(v.ability.extra.flush === 1, 'vullaby: 5 debuffed scoring cards -> ready to evolve');
  winRound(); flush();
  ok(key(v) === 'j_sonfive_mandibuzz', 'vullaby -> mandibuzz', key(v));
  ok(v.ability.extra.chips >= 12, 'mandibuzz keeps the chips', v.ability.extra.chips);
}
{
  start('MANDI');
  const m = add('j_sonfive_mandibuzz');
  const deb = hand(['S_3', 'D_3']); for (const c of deb) P.smods_debuff_card(c, true, 'test');
  const r = play([...deb, ...hand(['H_3'])]);
  ok(m.ability.extra.chips === 16, 'mandibuzz: +8 Chips per debuffed card in the scoring hand', m.ability.extra.chips);
  let n = 0; for (const c of G.playing_cards) if (n < 9 && !c.debuff) { P.smods_debuff_card(c, true, 'test'); n++; }
  const dcount = G.playing_cards.filter((c) => c.debuff).length;
  ok(m.config.center.calc_dollar_bonus(m.config.center, m) === Math.floor(dcount / 4), 'mandibuzz: $1 per 4 debuffed cards in the deck', dcount);
  ok(r.total.chips === 30 + 3 + 16, 'mandibuzz: chips scored (only the undebuffed 3 scores)', r.total);
}

// ========================================================================= Meltan line
{
  start('MELT');
  const m = add('j_sonfive_meltan');
  const coat = G.consumeables.cards.find((c) => key(c) === 'c_poke_metalcoat');
  ok(coat && coat.edition && coat.edition.negative, 'meltan: brings a Negative Metal Coat');
  hand(['S_K', 'H_K'], { center: 'm_steel' });
  const r = play(hand(['S_2']));
  ok(r.total.mult === 1 * 1.5 ** 4 && m.ability.extra.count === 4, 'meltan: each held Steel card retriggered once (count 4)', [r.total.mult, m.ability.extra.count]);
  m.ability.extra.count = 100; winRound(); flush();
  ok(key(m) === 'j_sonfive_melmetal', 'meltan -> melmetal at 100 Steel triggers', key(m));
  nextRound();
  hand(['S_K'], { center: 'm_steel' });
  add('c_poke_metal_energy');
  const r2 = play(hand(['S_2']));
  // retriggers = Metal Energy held (1) + Metal jokers (Melmetal itself) = 2 -> 3 triggers
  ok(r2.total.mult === 1.5 ** 3, 'melmetal: a retrigger per Metal joker / Metal Energy', r2.total.mult);
}

// ========================================================================= Stonjourner
{
  start('STON');
  const a = add('j_joker');
  const s = add('j_sonfive_stonjourner');
  const b = add('j_joker');
  const r = play(hand(['S_2']));
  // Mult: Joker A +4 then X1.25 (adjacent), Joker B +4 then X1.25.
  ok(near(r.total.mult, ((1 + 4) * 1.25 + 4) * 1.25), 'stonjourner: adjacent jokers each X1.25', r.total.mult);
  ok(s.ability.extra.count === 7 && s.ability.extra.played_hands['High Card'], 'stonjourner: High Card counted (7 to go)');
  play(hand(['S_2']));
  ok(s.ability.extra.count === 7, 'stonjourner: a repeated hand doesn\'t count');
  const hands = [['S_3', 'H_3'], ['S_3', 'H_3', 'S_4', 'H_4'], ['S_3', 'H_3', 'D_3'], ['S_2', 'H_3', 'D_4', 'C_5', 'S_6'], ['S_2', 'S_4', 'S_6', 'S_8', 'S_T'],
    ['S_3', 'H_3', 'D_3', 'S_4', 'H_4'], ['S_3', 'H_3', 'D_3', 'C_3']];
  for (const h of hands) play(hand(h));
  ok(near(s.ability.extra.Xmult_multi, 1.5) && s.ability.extra.count === 8 && Object.keys(s.ability.extra.played_hands).length === 0, 'stonjourner: 8 unique hands -> X1.5, list reset', s.ability.extra);
  const iq = []; play(hand(['S_2'])); s.config.center.loc_vars(s.config.center, iq, s);
  ok(iq.some((q) => q.key === 'ston_hands1' && q.vars[0] === 'High Card'), 'stonjourner: played-hands tooltip');
  void a; void b;
}

// ======================================================================= Lechonk line
{
  start('PIG', { noBlind: true });
  const l = add('j_sonfive_lechonk');
  G.GAME.dollars = 20;
  const sell0 = l.sell_cost;
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(G.GAME.dollars === 0 && near(l.ability.extra_value, 15) && near(l.sell_cost, sell0 + 15), 'lechonk: Blind select: $20 -> $0, +$15 (75%) sell value', [G.GAME.dollars, l.ability.extra_value]);
  ok(l.ability.extra.triggers === 1, 'lechonk: 1 trigger');
  // Volatile Right: a normal joker to its right switches it off.
  const j = add('j_joker'); const ev0 = l.ability.extra_value;
  winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); G.GAME.dollars = 10;
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(l.ability.extra_value === ev0 && G.GAME.dollars === 10, 'lechonk: inactive unless rightmost (Volatile Right)');
  act({ type: 'sell', id: j.sort_id }); flush();
  // Fix: Lechonk carries the volatile flag, so another volatile-right joker doesn't switch it off.
  ok(P_CENTERS.j_sonfive_lechonk.volatile === true, 'fix: lechonk is volatile (center flag)');
  const volt = add('j_poke_voltorb');
  G.jokers.cards.splice(G.jokers.cards.indexOf(volt), 1); G.jokers.cards.unshift(volt); // [Voltorb, Lechonk]
  ok(P.volatile_active(volt.config.center, volt, 'right') && P.volatile_active(l.config.center, l, 'right'),
    'fix: Lechonk is Volatile Right, so a Voltorb left of it still counts as rightmost (shipped: Lechonk switched it off)');
  act({ type: 'sell', id: volt.sort_id }); flush();
  l.ability.extra.triggers = 5; winRound(); flush();
  ok(key(l) === 'j_sonfive_oinkologne', 'lechonk -> oinkologne after 5 triggers', key(l));
  act({ type: 'cash_out' }); act({ type: 'next_round' });
  G.GAME.dollars = 10; const ev1 = l.ability.extra_value;
  act({ type: 'select_blind' }); flush();
  ok(near(l.ability.extra_value, ev1 + 15) && G.GAME.dollars === 0, 'oinkologne: 150%', [ev1, l.ability.extra_value]);
}

// ========================================================================= Nacli line
{
  start('SALT', {}, );
  // Fix check (Nacli staged Basic): a Poké Ball (Basic) can give Nacli; a Great Ball (One) can't.
  const basics = new Set(), ones = new Set();
  for (let i = 0; i < 3000; i++) { basics.add(P.get_random_poke_key('ball' + i, 'Basic')); ones.add(P.get_random_poke_key('gball' + i, 'One')); }
  ok(basics.has('j_sonfive_nacli') && !ones.has('j_sonfive_nacli'), 'fix: a Poké Ball (Basic) can give Nacli, a Great Ball cannot (shipped: the reverse)');
  const n = add('j_sonfive_nacli');
  ok(n.config.center.stage === 'Basic', 'fix: nacli is a Basic Pokémon (shipped: "One")');
  add('j_poke_squirtle'); // Water: guaranteed
  nextRound(); flush();
  ok(!G.jokers.cards.some((c) => key(c) === 'j_poke_squirtle') && near(n.ability.extra.Xmult, 1.2), 'nacli: Salt Cure eats the Water joker (guaranteed), X1.2', n.ability.extra.Xmult);
  const r = play(hand(['S_2']));
  ok(near(r.total.mult, 1.2), 'nacli: X1.2 Mult', r.total.mult);
  // can't be debuffed
  n.set_debuff(true); P.smods_debuff_card(n, true, 'test');
  ok(!n.debuff, 'nacli: can\'t be debuffed');
  const e = add('j_joker'); e.set_eternal(true);
  nextRound(); flush();
  ok(G.jokers.cards.includes(e), 'nacli: never an Eternal joker');
  G.jokers.remove_card(e); e.remove();
  n.ability.extra.Xmult = 2; winRound(); flush();
  ok(key(n) === 'j_sonfive_naclstack' && near(n.ability.extra.Xmult, 2), 'nacli -> naclstack at X2', key(n));
  // Fix check (Nacli staged Basic): Naclstack devolves to Nacli; a Poké Ball (Basic) can give Nacli.
  ok(P.get_previous_evo(n, true) === 'j_sonfive_nacli', 'fix: naclstack\'s previous stage is nacli (none as shipped)', P.get_previous_evo(n, true));
  act({ type: 'cash_out' }); act({ type: 'next_round' });
  add('j_poke_pawniard'); // Metal: 1 in 2 for Naclstack
  let ate = false; for (let i = 0; i < 6 && !ate; i++) { act({ type: 'select_blind' }); flush(); ate = !G.jokers.cards.some((c) => key(c) === 'j_poke_pawniard'); if (!ate) { winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); } }
  ok(ate && near(n.ability.extra.Xmult, 2.5), 'naclstack: Salt Cure +X0.5', n.ability.extra.Xmult);
  n.ability.extra.Xmult = 4; clearHand(); winRound(); flush();
  ok(key(n) === 'j_sonfive_garganacl' && near(n.ability.extra.Xmult, 4), 'naclstack -> garganacl at X4', key(n));
  act({ type: 'cash_out' }); act({ type: 'next_round' });
  add('j_poke_squirtle'); n.ability.extra.denominator = 2; // Water: 1 in 1
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(near(n.ability.extra.Xmult, 4.4), 'garganacl: Salt Cure multiplies its XMult by 1.1', n.ability.extra.Xmult);
  ok(F.set_debuff(n) === 'prevent_debuff', 'garganacl: can\'t be debuffed');
}

// ===================================================================== Cetoddle line
{
  start('ICE');
  const c = add('j_sonfive_cetoddle');
  ok(P_CENTERS.j_sonfive_cetoddle.enhancement_gate === 'm_glass', 'cetoddle: needs a Glass Card in the deck to appear');
  const g = hand(['S_A'], { center: 'm_glass' });
  G.GAME.probabilities.normal = 4; // glass always breaks
  play(g); flush();
  G.GAME.probabilities.normal = 1;
  ok(near(c.ability.extra.Xmult, 1.25), 'cetoddle: +X0.25 per shattered Glass Card', c.ability.extra.Xmult);
  const r = play(hand(['S_2']));
  ok(near(r.total.mult, 1.25), 'cetoddle: XMult', r.total.mult);
  const hm = add('c_hanged_man'); const two = hand(['S_3', 'H_3'], { center: 'm_glass' });
  act({ type: 'use', id: hm.sort_id, targets: two.map((x) => x.sort_id) }); flush();
  ok(near(c.ability.extra.Xmult, 1.75), 'cetoddle: The Hanged Man destroying 2 Glass = +X0.5', c.ability.extra.Xmult);
  clearHand();
  const ice = add('c_poke_icestone');
  act({ type: 'use', id: ice.sort_id, joker_targets: [c.sort_id] }); flush();
  winRound(); flush();
  ok(key(c) === 'j_sonfive_cetitan', 'cetoddle -> cetitan with an Ice Stone', key(c));
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  const x = c.ability.extra.Xmult;
  hand(['S_4', 'H_5'], { center: 'm_glass' });
  const r2 = play(hand(['S_2']));
  ok(near(r2.total.mult, x * 2), 'cetitan: hail (all held cards Glass) scores double', [x, r2.total.mult]);
  clearHand(); hand(['S_4'], { center: 'm_glass' }); hand(['S_5']);
  const r3 = play(hand(['S_2']));
  ok(near(r3.total.mult, x), 'cetitan: one non-Glass held card = normal', r3.total.mult);
}

// ======================================================================= Timer Ball
{
  start('TIMER', {}, );
  const t = add('c_sonfive_timerball');
  ok(!t.can_use_consumeable(), 'timer ball: unusable the round it was gained');
  ok(t.config.center.in_pool(t.config.center), 'timer ball: in the pool (option on)');
  nextRound();
  ok(t.ability.extra.count === 2 && t.can_use_consumeable(), 'timer ball: counts Blinds selected', t.ability.extra.count);
  let d = t.config.center.loc_vars(t.config.center, [], t);
  ok(d.vars[0] === 'Common' && d.vars[1] === 2, 'timer ball: Common, Uncommon in 2 rounds', d.vars);
  const use = () => { const n0 = G.jokers.cards.length; act({ type: 'use', id: t.sort_id }); flush(); return G.jokers.cards.length > n0 ? G.jokers.cards[G.jokers.cards.length - 1] : null; };
  const t2 = add('c_sonfive_timerball'); t2.ability.extra.count = 4;
  act({ type: 'use', id: t2.sort_id }); flush();
  ok(G.jokers.cards[0].config.center.rarity === 2, 'timer ball: 3+ rounds -> Uncommon Pokémon', G.jokers.cards[0].config.center.rarity);
  const t3 = add('c_sonfive_timerball'); t3.ability.extra.count = 9; act({ type: 'use', id: t3.sort_id }); flush();
  ok(G.jokers.cards[1].config.center.rarity === 3, 'timer ball: 7+ -> Rare');
  const t4 = add('c_sonfive_timerball'); t4.ability.extra.count = 20; act({ type: 'use', id: t4.sort_id }); flush();
  ok(G.jokers.cards[2].config.center.stage === 'Legendary', 'timer ball: 15+ -> Legendary', key(G.jokers.cards[2]));
  d = t4.config.center.loc_vars(t4.config.center, [], t4);
  ok(d.key === 'c_sonfive_timerball_max', 'timer ball: max tooltip');
  const j = use();
  ok(j && j.config.center.rarity === 1 && j.config.center.stage, 'timer ball: 1 round -> Common Pokémon', j && key(j));
  start('TIMER2', { plus: { timerball: false } });
  ok(!P_CENTERS.c_sonfive_timerball.in_pool(P_CENTERS.c_sonfive_timerball), 'timer ball: option off -> out of the pool');
}

// ============================================================================ Decks
{
  start('VIRT', { back: 'b_sonfive_virtuousdeck', noBlind: true });
  ok(G.consumeables.cards.some((c) => key(c) === 'c_sonfive_timerball') && G.GAME.round_resets.hands === 3, 'Virtuous: Timer Ball, -1 hand');
  start('PROPH', { back: 'b_sonfive_propheticdeck', noBlind: true });
  ok(G.hand.config.card_limit === 7 && G.GAME.scry_amount === 3, 'Prophetic: -1 hand size, 3 Foresight');
  start('ROGUE', { back: 'b_sonfive_roguedeck', noBlind: true });
  ok(G.GAME.win_ante === 12 && G.consumeables.cards.some((c) => key(c) === 'c_poke_megastone'), 'Rogue: +4 win Ante, a Megastone');
  start('SHINY', { back: 'b_sonfive_shinydeck', noBlind: true });
  const w = P_CENTERS.e_poke_shiny.weight;
  const { reduceHook } = await import('../../js/mods/registry.js');
  ok(G.GAME.shiny_edition_rate === 100 && reduceHook('edition_weight', w, 'poke_shiny') === w * 100, 'Shiny: shiny weight x100', reduceHook('edition_weight', w, 'poke_shiny'));
  // Fix: a second Shiny run (same session) — the Lua stacked another get_weight wrapper.
  start('SHINY2', { back: 'b_sonfive_shinydeck', noBlind: true });
  ok(reduceHook('edition_weight', w, 'poke_shiny') === w * 100, 'fix: a second Shiny-deck run is still x100 (not stacked)');
  start('RED', { noBlind: true });
  ok(reduceHook('edition_weight', w, 'poke_shiny') === w, 'other decks: shiny weight unchanged');
  start('VOID', { back: 'b_sonfive_voiddeck' });
  ok(G.GAME.modifiers.void, 'Void: modifier on');
  toBoss(); winRound(); flush();
  ok(G.consumeables.cards.some((c) => key(c) === 'c_poke_nightmare'), 'Void: a Nightmare after the Boss Blind');
}

// =============================================================== negative Energy (Void)
{
  start('NEG', { back: 'b_sonfive_voiddeck' });
  const b = add('j_poke_bulbasaur');
  for (let i = 0; i < 3; i++) act({ type: 'use', id: add('c_poke_grass_energy').sort_id, joker_targets: [b.sort_id] });
  ok(P.get_total_energy(b) === 3 && !add('c_poke_grass_energy').can_use_consumeable(), 'void: normal Energy still capped at 3');
  const neg = add('c_poke_grass_energy', 'negative');
  G.jokers.highlighted.length = 0; G.jokers.add_to_highlighted(b);
  ok(neg.can_use_consumeable(), 'void: a Negative Energy works past the cap');
  act({ type: 'use', id: neg.sort_id, joker_targets: [b.sort_id] }); flush();
  ok(P.get_total_energy(b) === 4 && b.ability.extra.energy_plus === 1, 'void: Negative Energy = +1 Energy and +1 to this joker\'s limit', b.ability.extra);
  const g5 = add('c_poke_grass_energy');
  ok(!g5.can_use_consumeable(), 'void: limit is now 4 for it (full)');
  act({ type: 'sell', id: g5.sort_id });
  const iq = []; P.type_tooltip(null, iq, b);
  ok(iq[0].vars[1] === 4, 'void: tooltip shows the raised limit', iq[0].vars);
  // energy_plus survives evolution (lovely patch -> Pokermon EVO_KEEP).
  P.poke_evolve(b, 'j_poke_ivysaur', true);
  ok(key(b) === 'j_poke_ivysaur' && b.ability.extra.energy_plus === 1 && P.get_total_energy(b) === 4, 'void: per-joker limit kept through evolution');
  // Fix: Negative Energy on a base-game joker (crashed the Lua).
  const h = add('j_hiker'); P.apply_type_sticker(h, 'Grass');
  const n2 = add('c_poke_grass_energy', 'negative');
  let threw = false; try { act({ type: 'use', id: n2.sort_id, joker_targets: [h.sort_id] }); } catch (e) { threw = e; }
  ok(!threw && h.ability.energy_plus === 1 && h.ability.energy_count === 1, 'fix: negative Energy on a base-game joker', [threw && threw.message, h.ability.energy_plus]);
  // Not a Void run: Negative Energy is just Energy.
  start('NEG2');
  const b2 = add('j_poke_bulbasaur');
  for (let i = 0; i < 3; i++) act({ type: 'use', id: add('c_poke_grass_energy').sort_id, joker_targets: [b2.sort_id] });
  const neg2 = add('c_poke_grass_energy', 'negative');
  G.jokers.highlighted.length = 0; G.jokers.add_to_highlighted(b2);
  ok(!neg2.can_use_consumeable(), 'not Void: a Negative Energy is capped like any Energy');
}

// =================================================================== Lilac + Weakened
{
  start('LILAC', { stake: 'stake_sonfive_lilac_stake', noBlind: true });
  ok(G.GAME.stake === 8 && G.GAME.modifiers.enable_rentals_in_shop && G.GAME.modifiers.enable_weakened_in_shop, 'Lilac: Gold stake rules + Weakened shop jokers');
  let weak = 0, total = 0, chk = true;
  for (let i = 0; i < 200; i++) {
    G.GAME.round_resets.ante = 1 + (i % 8);
    const c = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_poke_caterpie', 'sh' + i);
    total++;
    if (c.ability.sonfive_weakened) {
      weak++;
      if (!near(c.ability.extra.mult, 3 * (1 - 2 * 0.4))) chk = false;
    } else if (c.ability.extra.mult !== 3) chk = false;
  }
  G.GAME.round_resets.ante = 1;
  ok(weak > 0 && weak < total && chk, 'Lilac: some shop Pokémon are Weakened (-2 Energies of mult)', [weak, total]);
  const plain = create_card('Joker', G.jokers, null, null, null, null, 'j_poke_caterpie');
  ok(!plain.ability.sonfive_weakened, 'Lilac: only shop / pack jokers');
  const wk = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_poke_caterpie');
  if (!wk.ability.sonfive_weakened) (await import('../../mods/pokermonplus/src/stakes.js')).apply_weakened(wk);
  wk.add_to_deck(); G.shop_jokers.remove_card(wk); G.jokers.emplace(wk);
  const desc = (await import('../../js/engine/describe.js')).describe(wk);
  ok(desc.badges.some((b) => b.key === 'sonfive_weakened'), 'Weakened badge');
  ok(near(wk.ability.extra.mult, 0.6), 'Weakened caterpie: 3 - 2 x (3 x 0.4)', wk.ability.extra.mult);
  P.poke_evolve(wk, 'j_poke_metapod', true);
  ok(wk.ability.sonfive_weakened && near(wk.ability.extra.mult, 6 * (1 - 2 * 0.4)), 'Weakened re-applied after evolution (metapod 6 -> 1.2)', wk.ability.extra.mult);
  start('GOLD', { stake: 8, noBlind: true });
  ok(!G.GAME.modifiers.enable_weakened_in_shop, 'Gold stake: no Weakened');
}

// ================================================================ fix: sandstorm etc.
{
  start('WEATHER');
  hand(['S_2', 'S_3'], { center: 'm_stone' });
  ok(F.sandstorm(), 'fix: sandstorm = every held card is a Stone Card (shipped checked nonexistent m_count)');
  hand(['S_4']);
  ok(!F.sandstorm(), 'sandstorm: a non-Stone card breaks it');
  clearHand(); hand(['S_2'], { center: 'm_glass' }); ok(F.hail(), 'hail: Glass');
  clearHand(); hand(['S_2'], { center: 'm_bonus' }); ok(F.rain(), 'rain: Bonus');
  clearHand(); hand(['S_2'], { center: 'm_mult' }); ok(F.sunny(), 'sunny: Mult');
  // energy_shift's restored vanilla names: Stone Joker scales.
  const sj = add('j_stone');
  const before = sj.ability.extra;
  F.energy_shift(sj, 1, 'Grass', false, true);
  ok(sj.ability.extra > before, 'fix: energy_shift knows Stone Joker (shipped list said "count Joker")', [before, sj.ability.extra]);
  ok(F.sonfive_base_evo_name(P_CENTERS.j_sonfive_garganacl) === 'nacli' && F.sonfive_base_evo_name(P_CENTERS.j_sonfive_darkrai) === 'darkrai', 'sonfive_base_evo_name');
}

done();
