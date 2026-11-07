// Gen 8, batch 4: the Gen 8 Legendaries (contentRev 74+; jokers/pokejokers_designs.js; PORTING.md "Gen 8, batch 4"). The owner's "Yes"
// (2026-11-03); each complete ALONE (the solo rule, r59), so every joker here is played on its own through real hands and rounds.
//   Zacian     (Fairy)      X2; Crowned Sword after 3 Boss Blinds beaten while held: X3 (its Crowned card).
//   Zamazenta  (Fighting)   +1 hand; Crowned Shield after 3 Boss Blinds: +2 hands in all and X1.5 (its Crowned card).
//   Eternatus  (Dark)       +X0.5 banked per Boss Blind (from X1); Eternamax at the 5th: the X doubled (its Gen 8 sheet card).
//   Zarude     (Grass)      each Blind drains $1 of sell value from each other Joker (never below $1), +X0.05 per $1 drained.
//   Regieleki  (Lightning)  +1 hand; each unused hand at end of round +X0.1 banked.
//   Regidrago  (Dragon)     X3 on the round's first hand, X0.5 less per hand already played, never below X1.
//   Glastrier  (Water)      +80 Chips; Glass cards X2.5 instead of X2 (the card's own X, its tooltip too).
//   Spectrier  (Psychic)    +X0.25 banked per Spectral card used.
//   Calyrex    (Psychic)    each Blind a random unenhanced card becomes a Seed; X1 + X0.1 per Flower card in the full deck.
//   Enamorus   (Fairy)      scored Hearts X1.25; Therian Forme after 4 rounds: each also earns $1 (its Therian card).
// Then Energy (the standard shares; the fixed numbers stay), save / resume and the art (every cell's type, the forms' cells).
//   node micatro/tests/mods/pokermon_gen8_legendaries_test.mjs
import path from 'path';
// (Session runs here start with engineRev: 1 = the rules before Pages: these suites measure the mod alone)
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe, enh_live_vars } from '../../js/engine/describe.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import { ART } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { if (process.env.G8_TRACE) console.log('--', name); try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 700)); } };
const ex = (j) => j.ability.extra;
/** The card's text, every line and box joined by one space. */
const plain = (j) => describe(j).lines.join(' ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
const cr = () => G.GAME.current_round;
const J = (k) => G.jokers.cards.find((c) => key(c) === 'j_poke_' + k);
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list` (never the round's last hand), `held` cards staying in hand -> {mult, chips, money}. */
function play(list, { held, left } = {}) {
  clearHand();
  const cs = cards(list);
  if (held) cards(held);
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (left !== undefined) cr().hands_left = left;
  else if (cr().hands_left < 2) cr().hands_left = 2;
  const $0 = G.GAME.dollars;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const total = ((r && r.events) || []).find((e) => e.type === 'hand_total') || {};
  return { total, mult: Number(total.mult), chips: Number(total.chips), money: G.GAME.dollars - $0, cards: cs };
}
/** Win the round with a lone 2 of Spades (`left` hands left before it: the unused hands are left - 1). */
function endRound(left) {
  clearHand(); const c = cards(['S_2']);
  G.GAME.chips = G.GAME.blind.chips;
  if (left !== undefined) cr().hands_left = left; else if (cr().hands_left < 2) cr().hands_left = 2;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush();
}
function advance() {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  clearHand();
}
/** A full round: win it and select the next Blind. */
function round(left) { endRound(left); flush(); advance(); }
/** Rounds until `n` more Boss Blinds are beaten (start() is on the Small Blind of Ante 1: every 3rd round is a Boss). */
function bosses(n) { let k = 0; while (k < n) { const b = G.GAME.blind.boss; round(); if (b) k++; } }
function useOn(k, target) { const c = add(k); const r = act({ type: 'use', id: c.sort_id, targets: [], ...(target ? { joker_targets: [target.sort_id] } : {}) }); flush(); return r; }
const form = (j) => { const v = {}; view_card(j, v); return v.poke && v.poke.form; };
const face = (j) => {
  const v = {}; view_card(j, v);
  const f = POKE_UI.face({ center: key(j), facing: 'front', poke: v.poke, atlas: j.config.center.atlas, pos: j.config.center.pos, soul_pos: j.config.center.soul_pos }, { area: 'jokers' });
  return f || j.config.center;
};
const drawn = (j) => { const d = face(j); return `{${d.pos.x},${d.pos.y}}+{${d.soul_pos.x},${d.soul_pos.y}}`; };
const moveLeftOf = (a, b) => { G.jokers.cards.splice(G.jokers.cards.indexOf(a), 1); G.jokers.cards.splice(G.jokers.cards.indexOf(b), 0, a); };
const sell = (j) => { act({ type: 'sell', id: j.sort_id }); flush(); };
const NAMES = ['zacian', 'zamazenta', 'eternatus', 'zarude', 'regieleki', 'regidrago', 'glastrier', 'spectrier', 'calyrex', 'enamorus'];

// ------------------------------------------------------------------- the pin and the ten centers
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 74 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 74+ (Gen 8 batch 4)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  const want = { zacian: 'Fairy', zamazenta: 'Fighting', eternatus: 'Dark', zarude: 'Grass', regieleki: 'Lightning', regidrago: 'Dragon', glastrier: 'Water', spectrier: 'Psychic', calyrex: 'Psychic', enamorus: 'Fairy' };
  for (const [n, t] of Object.entries(want)) {
    const c = P_CENTERS['j_poke_' + n];
    ok(c && c.rarity === 4 && c.cost === 20 && c.stage === 'Legendary' && c.ptype === t && c.gen === 8 && c.blueprint_compat === true, `${n}: Legendary $20, ${t}, Gen 8, Blueprint-compatible`, c && [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
  }
  start('G8LPOOL');
  for (const n of NAMES) { const c = P_CENTERS['j_poke_' + n]; ok(!c.custom_pool_func && c.in_pool(c) !== false, `${n}: in the Legendary pool (The Soul)`); }
  ok(['crown_bosses', 'crowned_hands', 'hands', 'bosses', 'eterna_Xmult', 'drain', 'jungle_Xmult', 'eleki_Xmult', 'drago_step', 'grim_Xmult', 'heart_money', 'therian_rounds'].every((f) => !(f in energy_values)),
    'the counts, the banks, the hands, the drain, the step and the money are no energy fields');
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key.replace('j_poke_', ''));
  const after = (a, b) => keys.indexOf(b) === keys.indexOf(a) + 1;
  const chain = (list) => list.every((n, i) => i === 0 || after(list[i - 1], n));
  ok(chain(['dreepy_dart', 'zacian', 'zamazenta', 'eternatus', 'kubfu', 'urshifu_single', 'urshifu_rapid', 'zarude', 'regieleki', 'regidrago', 'glastrier', 'spectrier', 'calyrex', 'wyrdeer'])
    && chain(['ursaluna', 'basculegion', 'enamorus', 'sprigatito']),
    'Pokédex order: Dreepy (Dart) > Zacian > Zamazenta > Eternatus > Kubfu > Urshifu x2 > Zarude ... Calyrex > Wyrdeer (899); Basculegion (902) > Enamorus > Sprigatito (906)',
    keys.slice(keys.indexOf('dreepy_dart'), keys.indexOf('dreepy_dart') + 15));
});

// ------------------------------------------------------------------- Zacian alone
await sec('zacian', () => {
  start('G8ZAC');
  const z = add('j_poke_zacian');
  let r = play(['S_5']);
  ok(near(r.mult, 2) && form(z) === 'hero' && drawn(z) === '{6,9}+{7,9}', 'X2, its Hero card {6,9}', [r.total, drawn(z)]);
  ok(/Intrepid Sword: X2 Mult Crowned Sword: for good once you beat 3 Boss Blinds while you have it: X3 Mult instead \(Boss Blinds: 0\/3\)/.test(plain(z)), 'text', plain(z));
  round(); round();
  ok(ex(z).crown_bosses === 0 && G.GAME.blind.boss, 'the Small and Big Blinds count nothing; now the Boss Blind', ex(z).crown_bosses);
  round();
  ok(ex(z).crown_bosses === 1 && /\(Boss Blinds: 1\/3\)/.test(plain(z)), 'a Boss Blind beaten: 1/3', [ex(z).crown_bosses, plain(z)]);
  // a debuffed Zacian through a Boss: that Boss doesn't count
  round(); round();
  debuff(z); round(); undebuff(z);
  ok(ex(z).crown_bosses === 1, 'debuffed through a Boss Blind: not counted', ex(z).crown_bosses);
  bosses(1);
  ok(ex(z).crown_bosses === 2 && form(z) === 'hero', '2/3: still the Hero of Many Battles', ex(z).crown_bosses);
  r = play(['S_5']);
  ok(near(r.mult, 2), '... X2', r.total);
  bosses(1);
  ok(ex(z).crown_bosses === 3 && form(z) === 'crowned' && drawn(z) === '{8,9}+{9,9}', 'the 3rd Boss: Crowned Sword, its Crowned card {8,9}', [ex(z).crown_bosses, drawn(z)]);
  r = play(['S_5']);
  ok(near(r.mult, 3) && /\(Crowned Sword\)/.test(plain(z)), 'Crowned: X3', [r.total, plain(z)]);
  bosses(1);
  ok(ex(z).crown_bosses === 3 && form(z) === 'crowned', 'for good (the count stops at 3)', ex(z).crown_bosses);
  const bp = add('j_blueprint'); moveLeftOf(bp, z);
  r = play(['S_5']);
  ok(near(r.mult, 9), 'Blueprint copies the X (X3 x X3)', r.total);
});

// ------------------------------------------------------------------- Zamazenta alone
await sec('zamazenta', () => {
  start('G8ZAM');
  const h0 = G.GAME.round_resets.hands, l0 = cr().hands_left;
  const z = add('j_poke_zamazenta');
  ok(G.GAME.round_resets.hands === h0 + 1 && cr().hands_left === l0 + 1, '+1 hand (this round too)', [G.GAME.round_resets.hands, cr().hands_left]);
  let r = play(['S_5']);
  ok(near(r.mult, 1) && drawn(z) === '{10,9}+{11,9}', 'no X before it is crowned; its Hero card {10,9}', [r.total, drawn(z)]);
  ok(/Dauntless Shield: \+1 hand each round Crowned Shield: for good once you beat 3 Boss Blinds while you have it: \+2 hands in all and X1\.5 Mult \(Boss Blinds: 0\/3\)/.test(plain(z)), 'text', plain(z));
  debuff(z);
  ok(G.GAME.round_resets.hands === h0, 'debuffed: the hand goes', G.GAME.round_resets.hands);
  undebuff(z);
  ok(G.GAME.round_resets.hands === h0 + 1, 'back (once)', G.GAME.round_resets.hands);
  bosses(2);
  ok(ex(z).crown_bosses === 2 && G.GAME.round_resets.hands === h0 + 1, '2/3: still +1 hand', [ex(z).crown_bosses, G.GAME.round_resets.hands]);
  bosses(1);
  ok(form(z) === 'crowned' && drawn(z) === '{12,9}+{13,9}' && G.GAME.round_resets.hands === h0 + 2 && cr().hands_left === h0 + 2, 'the 3rd Boss: Crowned Shield, +2 hands in all (the next round has them), its Crowned card {12,9}',
    [form(z), drawn(z), G.GAME.round_resets.hands, cr().hands_left]);
  r = play(['S_5']);
  ok(near(r.mult, 1.5) && /Dauntless Shield: \+1 hand each round .* hands in all and X1\.5 Mult \(Crowned Shield\)/.test(plain(z)), 'Crowned: X1.5', [r.total, plain(z)]);
  const bp = add('j_blueprint'); moveLeftOf(bp, z);
  r = play(['S_5']);
  ok(near(r.mult, 2.25) && G.GAME.round_resets.hands === h0 + 2, 'Blueprint copies the X, never the hands', [r.total, G.GAME.round_resets.hands]);
  sell(bp);
  debuff(z);
  ok(G.GAME.round_resets.hands === h0, 'debuffed: both hands go', G.GAME.round_resets.hands);
  undebuff(z);
  ok(G.GAME.round_resets.hands === h0 + 2, 'back: both', G.GAME.round_resets.hands);
  sell(z);
  ok(G.GAME.round_resets.hands === h0, 'sold: both taken back', G.GAME.round_resets.hands);
});

// ------------------------------------------------------------------- Eternatus alone
await sec('eternatus', () => {
  start('G8ETE');
  const e = add('j_poke_eternatus');
  let r = play(['S_5']);
  ok(near(r.mult, 1) && drawn(e) === '{8,59}+{9,59}' && face(e).atlas === e.config.center.atlas, 'a fresh Eternatus: X1 (nothing banked), its own card (Natdex {8,59})', [r.total, drawn(e), face(e).atlas]);
  ok(/Dynamax: permanently gains X0\.5 Mult for each Boss Blind you beat \(Currently X1 Mult\) Eternamax: for good after 5 Boss Blinds, its X Mult is doubled \(Boss Blinds: 0\/5\)/.test(plain(e)), 'text', plain(e));
  round(); round();
  ok(near(ex(e).eterna_Xmult, 1), 'Small and Big Blinds: nothing', ex(e).eterna_Xmult);
  round();
  ok(near(ex(e).eterna_Xmult, 1.5) && ex(e).bosses === 1, 'a Boss Blind: X1.5', [ex(e).eterna_Xmult, ex(e).bosses]);
  r = play(['S_5']);
  ok(near(r.mult, 1.5), '... plays X1.5', r.total);
  bosses(3);
  ok(near(ex(e).eterna_Xmult, 3) && ex(e).bosses === 4 && form(e) === 'base', '4 Bosses: X3, not yet Eternamax', [ex(e).eterna_Xmult, form(e)]);
  bosses(1);
  ok(near(ex(e).eterna_Xmult, 3.5) && form(e) === 'eternamax' && drawn(e) === '{0,10}+{1,10}' && /Gen08/.test(face(e).atlas), 'the 5th Boss banks first (X3.5), then Eternamax: its card on the Gen 8 sheet {0,10}', [ex(e).eterna_Xmult, form(e), drawn(e), face(e).atlas]);
  r = play(['S_5']);
  ok(near(r.mult, 7) && /\(Currently X7 Mult\)/.test(plain(e)) && /\(Eternamax: X3\.5 doubled\)/.test(plain(e)), 'Eternamax: X3.5 doubled = X7', [r.total, plain(e)]);
  bosses(1);
  r = play(['S_5']);
  ok(near(ex(e).eterna_Xmult, 4) && near(r.mult, 8), 'the bank keeps growing: X4 doubled = X8', [ex(e).eterna_Xmult, r.total]);
  const bp = add('j_blueprint'); moveLeftOf(bp, e);
  r = play(['S_5']);
  ok(near(r.mult, 64), 'Blueprint copies the X (X8 x X8)', r.total);
  bosses(1);
  ok(near(ex(e).eterna_Xmult, 4.5), 'with a Blueprint: still +X0.5 a Boss', ex(e).eterna_Xmult);
});

// ------------------------------------------------------------------- Zarude alone
await sec('zarude', () => {
  start('G8ZAR');
  const z = add('j_poke_zarude');
  const jk = add('j_joker');                     // $2: sells for $1, nothing to drain
  const big = add('j_cavendish');                // sells for more
  big.ability.extra_value = 2; big.set_cost();
  const s0 = big.sell_cost;
  ok(jk.sell_cost === 1 && s0 >= 4, 'the row: Joker sells for $1, Cavendish for $' + s0, [jk.sell_cost, s0]);
  ok(/Jungle Drain: when a Blind is selected, drains \$1 of sell value from each other Joker and gains X0\.05 Mult for each \$1 drained \(Currently X1 Mult\)/.test(plain(z)), 'text', plain(z));
  round();
  ok(big.sell_cost === s0 - 1 && jk.sell_cost === 1 && near(ex(z).jungle_Xmult, 1.05), 'a Blind selected: Cavendish -$1, Joker stays $1 (never below), X1.05', [big.sell_cost, jk.sell_cost, ex(z).jungle_Xmult]);
  ok(z.sell_cost === 10, 'one way: Zarude\'s own sell value unchanged', z.sell_cost);
  const r = play(['S_5']);
  ok(near(r.mult, (1 * 1.05 + 4) * 3), '... plays X1.05 (then Joker +4, Cavendish X3)', r.total);
  const bp = add('j_blueprint'); moveLeftOf(bp, z);
  const b0 = bp.sell_cost;
  round();
  ok(near(ex(z).jungle_Xmult, 1.15) && bp.sell_cost === b0 - 1, 'with a Blueprint copying it: drained once ($1 from Cavendish and $1 from the Blueprint: +X0.1)', [ex(z).jungle_Xmult, bp.sell_cost]);
  sell(bp);
  for (let i = 0; i < 8; i++) round();
  ok(big.sell_cost === 1 && near(ex(z).jungle_Xmult, r9(1 + 0.05 * s0 - 0.05 + 0.05)), 'drained down to $1, never lower; X1 + X0.05 per $1 it took', [big.sell_cost, ex(z).jungle_Xmult]);
});
function r9(x) { return Math.round(x * 1e9) / 1e9; }

// ------------------------------------------------------------------- Regieleki alone
await sec('regieleki', () => {
  start('G8ELE');
  const h0 = G.GAME.round_resets.hands;
  const e = add('j_poke_regieleki');
  ok(G.GAME.round_resets.hands === h0 + 1, '+1 hand each round', G.GAME.round_resets.hands);
  let r = play(['S_5']);
  ok(near(r.mult, 1), 'nothing banked yet: X1', r.total);
  ok(/\+1 hand each round Transistor: at end of round, permanently gains X0\.1 Mult for each unused hand \(Currently X1 Mult\)/.test(plain(e)), 'text', plain(e));
  round(4);
  ok(near(ex(e).eleki_Xmult, 1.3), 'won with 4 hands left before the winning hand: 3 unused, +X0.3', ex(e).eleki_Xmult);
  r = play(['S_5']);
  ok(near(r.mult, 1.3), '... plays X1.3', r.total);
  round(1);
  ok(near(ex(e).eleki_Xmult, 1.3), 'won on the last hand: nothing unused, nothing gained', ex(e).eleki_Xmult);
  const bp = add('j_blueprint'); moveLeftOf(bp, e);
  r = play(['S_5']);
  ok(near(r.mult, 1.69), 'Blueprint copies the X', r.total);
  round(2);
  ok(near(ex(e).eleki_Xmult, 1.4), 'with a Blueprint: banked once (+X0.1)', ex(e).eleki_Xmult);
  sell(bp); sell(e);
  ok(G.GAME.round_resets.hands === h0, 'sold: the hand taken back', G.GAME.round_resets.hands);
});

// ------------------------------------------------------------------- Regidrago alone
await sec('regidrago', () => {
  start('G8DRA');
  const d = add('j_poke_regidrago');
  ok(/Dragon Energy: X3 Mult on the first hand of the round, X0\.5 less for each hand already played this round \(Never below X1\) \(Currently X3 Mult\)/.test(plain(d)), 'text', plain(d));
  const xs = [];
  for (let i = 0; i < 6; i++) xs.push(play(['S_5']).mult);
  ok([3, 2.5, 2, 1.5, 1, 1].every((x, i) => near(xs[i], x)), 'hands 1-6 of a round: X3 / 2.5 / 2 / 1.5 / 1 / 1 (never below X1)', xs);
  round();
  let r = play(['S_5']);
  ok(near(r.mult, 3), 'the next round\'s first hand: X3 again', r.total);
  // a discard isn't a hand
  round();
  clearHand(); const dc = cards(['D_9']); act({ type: 'highlight', ids: [dc[0].sort_id] }); act({ type: 'discard' }); flush();
  r = play(['S_5']);
  ok(near(r.mult, 3), 'a discard first: still the first hand, X3', r.total);
  const bp = add('j_blueprint'); moveLeftOf(bp, d);
  r = play(['S_5']);
  ok(near(r.mult, 6.25), 'Blueprint copies it (2nd hand: X2.5 x X2.5)', r.total);
});

// ------------------------------------------------------------------- Glastrier alone
await sec('glastrier', () => {
  start('G8GLA');
  // Glass cards: their own X2 without Glastrier
  let r = play([['S_5', 'm_glass']]);
  const base = r.chips;
  ok(near(r.mult, 2), 'no Glastrier: a Glass card X2', r.total);
  const g = add('j_poke_glastrier');
  r = play([['S_5', 'm_glass']]);
  ok(near(r.mult, 2.5) && near(r.chips, base + 80), 'Glastrier: +80 Chips, the Glass card X2.5', r.total);
  ok(/\+80 Chips Chilling Neigh: Glass cards give X2\.5 Mult instead of X2/.test(plain(g)), 'text', plain(g));
  r = play([['S_5', 'm_glass'], ['H_5', 'm_glass']]);
  ok(near(r.mult, 2 * 2.5 * 2.5), 'a Pair of Glass 5s: X2.5 each', r.total);
  r = play(['S_5'], { held: [['D_K', 'm_glass']] });
  ok(near(r.mult, 1), 'a Glass card held does nothing (Glass is a scored X)', r.total);
  // the card's own X: a retrigger repeats X2.5
  const chad = add('j_hanging_chad');
  r = play([['S_5', 'm_glass']]);
  ok(near(r.mult, 2.5 ** 3), 'Hanging Chad: the Glass card X2.5 each time it scores', r.total);
  sell(chad);
  // the Glass card's tooltip
  clearHand();
  const [gc] = cards([['S_9', 'm_glass']]);
  ok(near(enh_live_vars(gc)[0], 2.5) && /X2\.5/.test(describe(gc).lines.join(' ')), 'the Glass card\'s own tooltip reads X2.5', [enh_live_vars(gc), describe(gc).lines.join(' ')]);
  // two Glastriers: the best one, once (never X3.125)
  const g2 = add('j_poke_glastrier');
  increment_energy(g2, 'Water');
  r = play([['S_5', 'm_glass']]);
  ok(near(r.mult, 2.625) && near(enh_live_vars(gc)[0], 2.625), 'two Glastriers (one energized): the best X2.625, never stacked', [r.total, enh_live_vars(gc)]);
  sell(g2);
  // a Blueprint copies the Chips, not the rule
  const bp = add('j_blueprint'); moveLeftOf(bp, g);
  r = play([['S_5', 'm_glass']]);
  ok(near(r.mult, 2.5) && near(r.chips, base + 160), 'Blueprint copies the +80 Chips, never the Glass rule', r.total);
  sell(bp);
  debuff(g);
  r = play([['S_5', 'm_glass']]);
  ok(near(r.mult, 2) && near(enh_live_vars(gc)[0], 2), 'debuffed: Glass back to X2 (tooltip too)', [r.total, enh_live_vars(gc)]);
  undebuff(g);
  sell(g);
  r = play([['S_5', 'm_glass']]);
  ok(near(r.mult, 2), 'sold: X2', r.total);
});

// ------------------------------------------------------------------- Spectrier alone
await sec('spectrier', () => {
  start('G8SPE');
  const s = add('j_poke_spectrier');
  G.consumeables.config.card_limit = 30;
  useOn('c_hermit');
  ok(near(ex(s).grim_Xmult, 1), 'a Tarot: nothing', ex(s).grim_Xmult);
  useOn('c_black_hole');
  ok(near(ex(s).grim_Xmult, 1.25), 'a Spectral (Black Hole): +X0.25', ex(s).grim_Xmult);
  ok(/Grim Neigh: permanently gains X0\.25 Mult for each Spectral card used \(Currently X1\.25 Mult\)/.test(plain(s)), 'text', plain(s));
  const hm = () => G.GAME.hands['High Card'].mult;   // (Black Hole levels every hand)
  let r = play(['S_5']);
  ok(near(r.mult, hm() * 1.25), '... plays X1.25', r.total);
  const bp = add('j_blueprint'); moveLeftOf(bp, s);
  useOn('c_black_hole');
  ok(near(ex(s).grim_Xmult, 1.5), 'with a Blueprint: banked once (+X0.25)', ex(s).grim_Xmult);
  r = play(['S_5']);
  ok(near(r.mult, hm() * 2.25), 'Blueprint copies the X', r.total);
});

// ------------------------------------------------------------------- Calyrex alone
await sec('calyrex', () => {
  start('G8CAL');
  const c = add('j_poke_calyrex');
  const seeds = () => G.playing_cards.filter((x) => key(x) === 'm_poke_seed').length;
  let r = play(['S_5']);
  ok(near(r.mult, 1) && seeds() === 0, 'no Flowers: X1; no Seed yet (it was added after this Blind was selected)', [r.total, seeds()]);
  round();
  ok(seeds() === 1, 'a Blind selected: 1 random unenhanced card became a Seed', seeds());
  const bp = add('j_blueprint'); moveLeftOf(bp, c);
  round();
  ok(seeds() === 3, 'with a Blueprint: 2 Seeds (it copies the conversion)', seeds());
  sell(bp);
  ok(/Bountiful Harvest: when a Blind is selected, a random unenhanced card in your deck becomes a Seed card X1 Mult, plus X0\.1 for each Flower card in your full deck \(Currently 0: X1 Mult\)/.test(plain(c)), 'text', plain(c));
  // Flowers in the deck (bloomed Seeds): each adds X0.1, read live
  const plainCards = G.playing_cards.filter((x) => key(x) === 'c_base');
  for (const x of plainCards.slice(0, 4)) x.set_ability(P_CENTERS.m_poke_flower, null, true);
  r = play(['S_5']);
  ok(near(r.mult, 1.4) && /\(Currently 4: X1\.4 Mult\)/.test(plain(c)), '4 Flower cards in the deck: X1.4', [r.total, plain(c)]);
  // never overwrites: with no unenhanced card left, nothing
  for (const x of G.playing_cards) if (key(x) === 'c_base') x.set_ability(P_CENTERS.m_bonus, null, true);
  const bonus = G.playing_cards.filter((x) => key(x) === 'm_bonus');
  endRound(); advance();
  ok(bonus.every((x) => key(x) === 'm_bonus'), 'no unenhanced card left but the round\'s new 2: never overwrites a Bonus card', bonus.filter((x) => key(x) !== 'm_bonus').length);
});

// ------------------------------------------------------------------- Enamorus alone
await sec('enamorus', () => {
  start('G8ENA');
  const e = add('j_poke_enamorus');
  let r = play(['H_5', 'H_5', 'C_9']);
  ok(near(r.mult, 2 * 1.25 * 1.25) && r.money === 0 && form(e) === 'incarnate' && drawn(e) === '{6,11}+{7,11}', 'a Pair of Hearts: X1.25 each, no money; its Incarnate card {6,11}', [r.total, r.money, drawn(e)]);
  ok(/Springtide Storm: each scored Heart gives X1\.25 Mult Therian Forme: after you have had it for 4 rounds, each scored Heart also earns \$1 \(Therian in 4 rounds\)/.test(plain(e)), 'text', plain(e));
  r = play([['S_5', 'm_wild']]);
  ok(near(r.mult, 1.25), 'a Wild card is a Heart', r.total);
  r = play(['S_5', 'D_5']);
  ok(near(r.mult, 2), 'no Heart: nothing', r.total);
  round(); round(); round();
  ok(ex(e).therian_rounds === 3 && form(e) === 'incarnate' && /\(Therian in 1 round\)/.test(plain(e)), '3 rounds: Incarnate, 1 to go', [ex(e).therian_rounds, plain(e)]);
  round();
  ok(form(e) === 'therian' && drawn(e) === '{8,11}+{9,11}' && /\(Therian Forme\)/.test(plain(e)), '4 rounds held: Therian Forme, its Therian card {8,11}', [form(e), drawn(e)]);
  r = play(['H_K', 'H_K']);
  ok(near(r.mult, 2 * 1.25 * 1.25) && r.money === 2, 'Therian: a Pair of Hearts X1.25 and $1 each', [r.total, r.money]);
  const bp = add('j_blueprint'); moveLeftOf(bp, e);
  r = play(['H_3']);
  ok(near(r.mult, 1.25 * 1.25) && r.money === 2, 'Blueprint copies both', [r.total, r.money]);
});

// ------------------------------------------------------------------- Energy: the standard shares; the fixed numbers stay
await sec('energy', () => {
  const steps = (n, fields, type) => {
    start('G8EN' + n);
    const j = add('j_poke_' + n);
    const got = {};
    for (let i = 0; i < 3; i++) { increment_energy(j, type); for (const [f] of fields) (got[f] || (got[f] = [])).push(Math.round(ex(j)[f] * 1e9) / 1e9); }
    for (const [f, want] of fields) ok(got[f].every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${f} ${want.join(' / ')}`, got[f]);
    return j;
  };
  const za = steps('zacian', [['Xmult', [2.4, 2.8, 3.2]], ['Xmult2', [3.6, 4.2, 4.8]]], 'Fairy');
  let r = play(['S_5']);
  ok(near(r.mult, 3.2) && ex(za).crown_bosses === 0, 'energized Zacian: X3.2 (the count untouched)', r.total);
  const zm = steps('zamazenta', [['Xmult', [1.8, 2.1, 2.4]]], 'Fighting');
  ok(ex(zm).hands === 1 && ex(zm).crowned_hands === 2, 'Zamazenta: the hands fixed');
  const et = steps('eternatus', [['Xmult_mod', [0.6, 0.7, 0.8]]], 'Dark');
  ok(ex(et).eterna_Xmult === 1 && ex(et).bosses === 0, 'Eternatus: the bank and the count untouched');
  bosses(1);
  ok(near(ex(et).eterna_Xmult, 1.8), 'energized Eternatus banks +X0.8 a Boss', ex(et).eterna_Xmult);
  const zr = steps('zarude', [['Xmult_mod', [0.06, 0.07, 0.08]]], 'Grass');
  ok(ex(zr).drain === 1 && ex(zr).jungle_Xmult === 1, 'Zarude: the $1 drain fixed, the bank untouched');
  const el = steps('regieleki', [['Xmult_mod', [0.12, 0.14, 0.16]]], 'Lightning');
  ok(ex(el).hands === 1 && ex(el).eleki_Xmult === 1, 'Regieleki: the hand fixed, the bank untouched');
  const dr = steps('regidrago', [['Xmult', [3.6, 4.2, 4.8]]], 'Dragon');
  r = play(['S_5']);
  const r2 = play(['S_5']);
  ok(ex(dr).drago_step === 0.5 && near(r.mult, 4.8) && near(r2.mult, 4.3), 'energized Regidrago: X4.8 first, then X4.3 (the X0.5 step fixed)', [r.total, r2.total]);
  steps('glastrier', [['chips', [104, 128, 152]], ['Xmult_multi', [2.625, 2.75, 2.875]]], 'Water');
  r = play([['S_5', 'm_glass']]);
  ok(near(r.mult, 2.875), 'energized Glastrier: a Glass card X2.875', r.total);
  const sp = steps('spectrier', [['Xmult_mod', [0.3, 0.35, 0.4]]], 'Psychic');
  ok(ex(sp).grim_Xmult === 1, 'Spectrier: the bank untouched');
  steps('calyrex', [['Xmult_mod', [0.12, 0.14, 0.16]]], 'Psychic');
  const en = steps('enamorus', [['Xmult_multi', [1.3125, 1.375, 1.4375]]], 'Fairy');
  ok(ex(en).heart_money === 1 && ex(en).therian_rounds === 0, 'Enamorus: the $1 and the clock fixed');
  r = play(['H_5']);
  ok(near(r.mult, 1.4375), 'energized Enamorus: a Heart X1.4375', r.total);
});

// ------------------------------------------------------------------- save / resume (a run is its recipe)
await sec('resume', () => {
  const s = new Session();
  s.start({ engineRev: 1, seed: 'G8RESUME', customDeck: { name: 'Gen8L', mods: ['pokermon'], params: { joker_slots: 12, consumable_slots: 10, blind_scaling: 0.05 },
    jokers: [{ key: 'j_poke_zacian' }, { key: 'j_poke_zamazenta' }, { key: 'j_poke_eternatus' }, { key: 'j_poke_zarude' }, { key: 'j_poke_regieleki' }, { key: 'j_poke_regidrago' },
      { key: 'j_poke_glastrier' }, { key: 'j_poke_spectrier' }, { key: 'j_poke_calyrex' }, { key: 'j_poke_enamorus' }, { key: 'j_cavendish' }],
    consumables: [{ key: 'c_black_hole' }, { key: 'c_black_hole' }, { key: 'c_poke_fairy_energy' }] } });
  flush();
  const must = (a) => { const r = s.act(a); flush(); if (!r.ok) throw new Error(JSON.stringify(a) + ': ' + r.error); return r; };
  must({ type: 'select_blind' });
  for (const p of G.consumeables.cards.slice()) if (key(p) === 'c_black_hole') must({ type: 'use', id: p.sort_id, targets: [] });
  let rounds = 0;
  while (rounds < 9 && G.STATE !== STATES.GAME_OVER) {
    if (G.STATE === STATES.BLIND_SELECT) must({ type: 'select_blind' });
    must({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
    must({ type: 'play' });
    if (G.STATE === STATES.ROUND_EVAL) { must({ type: 'cash_out' }); must({ type: 'next_round' }); rounds++; }
  }
  // the Fairy Energy now (the leftmost Fairy: Zacian)
  const fe = G.consumeables.cards.find((c) => key(c) === 'c_poke_fairy_energy');
  if (fe) must({ type: 'use', id: fe.sort_id, targets: [] });
  const snap = () => [ex(J('zacian')).crown_bosses, form(J('zacian')), ex(J('zacian')).energy_count, ex(J('zamazenta')).hands, form(J('zamazenta')), ex(J('eternatus')).bosses, ex(J('eternatus')).eterna_Xmult,
    ex(J('zarude')).jungle_Xmult, ex(J('regieleki')).eleki_Xmult, ex(J('spectrier')).grim_Xmult, ex(J('enamorus')).therian_rounds, form(J('enamorus')),
    G.playing_cards.filter((c) => key(c) === 'm_poke_seed').length, G.GAME.round_resets.hands, G.GAME.dollars, G.jokers.cards.map((j) => j.sell_cost).join(',')];
  const live = snap();
  ok(rounds === 9 && live[0] === 3 && live[1] === 'crowned' && live[2] === 1 && live[3] === 2 && live[4] === 'crowned' && live[5] === 3 && near(live[6], 2.5) && live[8] > 1 && near(live[9], 1.5) && live[11] === 'therian',
    'live, 9 rounds (3 Bosses): Crowned Zacian (energized) and Zamazenta (+2 hands), Eternatus X2.5, Regieleki banked, Spectrier X1.5, Therian Enamorus', live);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  ok(!r.stoppedAt && JSON.stringify(snap()) === JSON.stringify(live), 'resumed: the counts, the forms, the banks, the drained sell values, the Seeds, the hands, the money come back exactly', [r.stoppedAt, snap(), live]);
  ok(drawn(J('zacian')) === '{8,9}+{9,9}' && drawn(J('zamazenta')) === '{12,9}+{13,9}' && drawn(J('enamorus')) === '{8,11}+{9,11}', 'resumed: drawn on their form cards');
  const st = Session.stepper(JSON.parse(JSON.stringify(s.recipe))); st.seek(st.total);
  ok(!st.error && JSON.stringify(snap()) === JSON.stringify(live), 'the replay stepper too', snap());
});

// ------------------------------------------------------------------- the art: every cell's type is the joker's
if (ART) {
  await sec('cell types', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const CELLS = { zacian: ['Gen08', [6, 9], 'Fairy'], zacian_crowned: ['Gen08', [8, 9], 'Fairy'], zamazenta: ['Gen08', [10, 9], 'Fighting'], zamazenta_crowned: ['Gen08', [12, 9], 'Fighting'],
      eternatus: ['Natdex', [8, 59], 'Dark'], eternamax: ['Gen08', [0, 10], 'Dark'], zarude: ['Gen08', [6, 10], 'Grass'], regieleki: ['Natdex', [16, 59], 'Lightning'], regidrago: ['Natdex', [18, 59], 'Dragon'],
      glastrier: ['Natdex', [20, 59], 'Water'], spectrier: ['Natdex', [22, 59], 'Psychic'], calyrex: ['Gen08', [10, 10], 'Psychic'], enamorus: ['Gen08', [6, 11], 'Fairy'], enamorus_therian: ['Gen08', [8, 11], 'Fairy'] };
    for (const [n, [sheet, pos, want]] of Object.entries(CELLS)) {
      const r = typer.typeOfEntry({ atlas: 'AtlasJokersBasic' + sheet, pos });
      ok(r && r.ptype === want, `${n}'s cell ${sheet} {${pos}} shows ${want}`, r);
    }
    for (const n of NAMES) {
      const c = P_CENTERS['j_poke_' + n], [sheet, pos] = CELLS[n];
      ok(c.atlas === 'poke_AtlasJokersBasic' + sheet + '391' && c.pos.x === pos[0] && c.pos.y === pos[1] && c.soul_pos.x === pos[0] + 1, `${n}: its own card is that cell (+ its soul)`, [c.atlas, c.pos, c.soul_pos]);
    }
    const { GEN8_LEGEND_FORMS: F } = await import('../../mods/pokermon/systems/anim.js');
    const at = (f, [x, y]) => f.pos.x === x && f.pos.y === y && f.soul_pos.x === x + 1;
    ok(at(F.j_poke_zacian.crowned, CELLS.zacian_crowned[1]) && at(F.j_poke_zamazenta.crowned, CELLS.zamazenta_crowned[1]) && at(F.j_poke_eternatus.eternamax, CELLS.eternamax[1]) && F.j_poke_eternatus.eternamax.sheet === 'Gen08'
      && at(F.j_poke_enamorus.therian, CELLS.enamorus_therian[1]), 'the four forms point at those typed cells (Eternamax on the Gen 8 sheet)');
  });
} else console.log('(Pokermon art not on disk: the cell type checks are skipped; set MICATRO_MAIN)');

done();
