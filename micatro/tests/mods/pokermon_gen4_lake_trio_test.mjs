// The owner's Gen 4 Legendaries, batch B (2026-10-28; jokers/pokejokers_designs.js "The Lake trio", "Cresselia", "Phione / Manaphy";
// PORTING.md "The owner's Lake trio, Cresselia, Manaphy and Phione"). All Legendary $20.
//   Uxie 480 (Psychic)      Knowledge: +2 Foresight; each Foreseen card gives X1.3 Mult (scored like a held card; a debuffed one: nothing).
//   Mesprit 481 (Psychic)   Emotion: X1.5 Mult, or X2.5 on a hand whose poker hand hasn't been played yet this round.
//   Azelf 482 (Psychic)     Willpower: X2.5 Mult on the final hand of each round.
//   Lake Guardians: +X0.25 to each guardian's X values for each OTHER guardian species held, undebuffed (a twin never counts) — all three:
//   Uxie X1.8 a Foreseen card, Mesprit X2 / X3, Azelf X3.
//   Cresselia 488 (Psychic) Lunar Blessing: while held, playing cards can't be debuffed (Boss Blinds, or anything else); X1.5 Mult.
//   Phione 489 (Water)      Each Water Joker (itself included) gives +6 Mult.
//   Manaphy 490 (Water)     Sea Guardian: each Water Joker (itself included) gives X1.2 Mult; Egg: at the end of each shop, with a free
//                           Joker slot, a 1 in 4 chance (seeded) to create a Phione.
//   Energy: Uxie Xmult_multi +5%, Mesprit Xmult / Xmult2 +20%, Azelf Xmult +20%, Cresselia Xmult +20%, Manaphy Xmult_multi +5%, Phione mult
//   +40%; the +0.25 per guardian, the Foresight, the blessing and the 1 in 4 are fixed.
// Every ability is FIRED through real hands / shops with exact numbers.
//   node micatro/tests/mods/pokermon_gen4_lake_trio_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, state } from './poke_helpers.mjs';
import { P_BLINDS, pseudorandom } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { apply_type_sticker } from '../../mods/pokermon/systems/types.js';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const flat = (j) => describe(j).lines.join(' ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const NAMES = ['uxie', 'mesprit', 'azelf', 'cresselia', 'phione', 'manaphy'];
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
/** A pure Water / other-type "count" with no effect of its own: an Egg with a Tera sticker. */
function tera(type) { const e = add('j_egg'); apply_type_sticker(e, type); return e; }
/** Play exactly these cards; the round never ends by accident unless `final` (then this is the last hand, and it wins the Blind). */
function play(keys, { final = false, center } = {}) {
  clearHand();
  const cs = hand(keys, center ? { center } : {});
  G.GAME.chips = 0;
  if (final) { G.GAME.current_round.hands_left = 1; G.GAME.blind.chips = 1; }
  else { if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15; if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2; }
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const events = (r && r.events) || [];
  const total = events.find((e) => e.type === 'hand_total') || {};
  return { cards: cs, events, total, mult: Number(total.mult), chips: Number(total.chips) };
}
function fresh(seed, jokers, extra) { start(seed, {}, extra); return jokers.map((k) => add(k.startsWith('j_') ? k : 'j_poke_' + k)); }
/** A deck with no Foresight to see: empty the scry by setting the amount (Uxie's own +2 is the only Foresight in these runs). */
const scry = () => (G.scry_view ? G.scry_view.cards : []);
/** Win the round (High Card), cash out: -> SHOP. */
function toShop() {
  clearHand();
  const c = hand(['S_2']);
  G.GAME.blind.chips = 1; G.GAME.chips = 1; G.GAME.current_round.hands_left = Math.max(2, G.GAME.current_round.hands_left);
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) });
  act({ type: 'play' }); flush();
  if (state() === 'ROUND_EVAL') act({ type: 'cash_out' });
  flush();
}
/** Leave the shop (ending_shop), then select the next Blind. */
function leaveShop() { act({ type: 'next_round' }); flush(); }
const deep = (o) => JSON.parse(JSON.stringify(o));
/** What the 'manaphy_egg' roll WILL give at the next shop end (computed on a copy of the seeded stream, then restored). */
function eggWillHatch() {
  const saved = deep(G.GAME.pseudorandom);
  const hit = pseudorandom('manaphy_egg') < ((G.GAME.probabilities && G.GAME.probabilities.normal) || 1) / 4;
  G.GAME.pseudorandom = saved;
  return hit;
}

// ------------------------------------------------------------------- pin, static data, order, art, precedence, energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 44 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 44+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of NAMES) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && /"(uxie|mesprit|azelf|cresselia|phione|manaphy)"|'(uxie|mesprit|azelf|cresselia|phione|manaphy)'|_(uxie|mesprit|azelf|cresselia|phione|manaphy)\b/i.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the six (precedence: nothing to dedupe)', hits);
});
await sec('static', () => {
  start('LAKE0');
  const want = { uxie: ['Psychic', 28, 31], mesprit: ['Psychic', 0, 32], azelf: ['Psychic', 2, 32], cresselia: ['Psychic', 14, 32], phione: ['Water', 16, 32], manaphy: ['Water', 18, 32] };
  for (const [n, [t, x, y]] of Object.entries(want)) {
    const c = P_CENTERS['j_poke_' + n];
    ok(c.rarity === 4 && c.cost === 20 && c.stage === 'Legendary' && c.ptype === t && c.gen === 4 && c.blueprint_compat, n + ': Legendary $20, ' + t + ', Gen 4', [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.atlas === 'poke_AtlasJokersBasicNatdex391' && c.pos.x === x && c.pos.y === y && c.soul_pos && c.soul_pos.x === x + 1 && c.soul_pos.y === y,
      n + ': upstream 3.9.1 cell Natdex {' + x + ',' + y + '} with its soul (nothing to deploy)', [c.atlas, c.pos, c.soul_pos]);
  }
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_uxie');
  const want_order = ['j_poke_rotomm', 'j_poke_uxie', 'j_poke_mesprit', 'j_poke_azelf'];
  ok(i > 0 && want_order.every((k, n) => keys[i - 1 + n] === k), 'Pokédex order: Rotom (479, last form), Uxie, Mesprit, Azelf', keys.slice(i - 1, i + 4));
  const j = keys.indexOf('j_poke_cresselia');
  ok(j > i && keys[j + 1] === 'j_poke_phione' && keys[j + 2] === 'j_poke_manaphy' && keys.indexOf('j_poke_shaymin') > j + 2 && keys.indexOf('j_poke_azelf') < j,
    'Pokédex order: ... Azelf, (the creation trio), Cresselia (488), Phione, Manaphy, Shaymin (492)', keys.slice(j - 1, j + 4));
  ok(keys[j - 1] === 'j_poke_giratina' && keys[i + 3] === 'j_poke_dialga', 'the creation trio (483-487) sits between Azelf and Cresselia: Azelf > Dialga, Giratina > Cresselia', [keys[i + 3], keys[j - 1]]);
  const E = (n) => P_CENTERS['j_poke_' + n].config.extra;
  ok(E('uxie').scry === 2 && E('uxie').Xmult_multi === 1.3 && E('uxie').lake_mod === 0.25, 'Uxie: +2 Foresight, X1.3 a Foreseen card, +0.25 a guardian', E('uxie'));
  ok(E('mesprit').Xmult === 1.5 && E('mesprit').Xmult2 === 2.5 && E('mesprit').lake_mod === 0.25, 'Mesprit: X1.5 / X2.5', E('mesprit'));
  ok(E('azelf').Xmult === 2.5 && E('azelf').lake_mod === 0.25, 'Azelf: X2.5 on the final hand', E('azelf'));
  ok(E('cresselia').Xmult === 1.5 && E('phione').mult === 6 && E('manaphy').Xmult_multi === 1.2 && E('manaphy').num === 1 && E('manaphy').dem === 4, 'Cresselia X1.5, Phione +6, Manaphy X1.2 and 1 in 4', [E('cresselia'), E('phione'), E('manaphy')]);
  ok(!('lake_mod' in energy_values) && !('scry' in energy_values) && !('num' in energy_values) && !('dem' in energy_values)
    && near(energy_values.Xmult_multi, 0.05) && near(energy_values.Xmult, 0.2) && near(energy_values.Xmult2, 0.2) && near(energy_values.mult, 0.4),
    'Energy fields: Xmult_multi +5%, Xmult / Xmult2 +20%, mult +40%; lake_mod, scry, num / dem fixed');
});

// ------------------------------------------------------------------- Uxie: +2 Foresight, X1.3 per Foreseen card
await sec('uxie', () => {
  const [u] = fresh('UXIE1', ['uxie']);
  ok(G.GAME.scry_amount === 2, 'Uxie: +2 Foresight while held', G.GAME.scry_amount);
  ok(scry().length === 2, 'two Foreseen cards (the top of the deck)', scry().length);
  let r = play(['S_2']);
  ok(near(r.mult, 1.3 * 1.3) && r.chips === 5 + 2, 'High Card with 2 Foreseen cards: X1.3 each -> X1.69 (chips untouched)', r.total);
  debuff(scry()[0]);
  r = play(['S_2']);
  ok(near(r.mult, 1.3), 'a debuffed Foreseen card gives nothing: X1.3', r.total);
  undebuff(scry().find((c) => c.debuff) || scry()[0]);
  G.GAME.scry_amount = 4;
  r = play(['S_2']);
  ok(near(r.mult, Math.pow(1.3, 4)), 'more Foresight (4, another joker\'s), 4 Foreseen cards: X1.3^4', r.total);
  G.GAME.scry_amount = 2;
  u.remove(); flush();
  ok(G.GAME.scry_amount === 0, 'Uxie gone: the +2 Foresight is taken back', G.GAME.scry_amount);
});

// ------------------------------------------------------------------- Mesprit: X1.5, X2.5 on a poker hand not yet played this round
await sec('mesprit', () => {
  fresh('MESP1', ['mesprit']);
  let r = play(['S_2']);
  ok(near(r.mult, 2.5), 'first High Card of the round: X2.5', r.total);
  r = play(['H_3']);
  ok(near(r.mult, 1.5), 'second High Card this round: X1.5', r.total);
  r = play(['S_5', 'H_5']);
  ok(near(r.mult, 2 * 2.5), 'a Pair, new this round: X2.5', r.total);
  r = play(['S_9', 'H_9']);
  ok(near(r.mult, 2 * 1.5), 'a second Pair: X1.5', r.total);
  toShop(); leaveShop(); act({ type: 'select_blind' }); flush();
  r = play(['S_2']);
  ok(near(r.mult, 2.5), 'a new round: High Card is new again (played_this_round resets): X2.5', r.total);
});

// ------------------------------------------------------------------- Azelf: X2.5 on the final hand
await sec('azelf', () => {
  fresh('AZEL1', ['azelf']);
  let r = play(['S_2']);
  ok(near(r.mult, 1), 'not the final hand: nothing', r.total);
  r = play(['S_2'], { final: true });
  ok(near(r.mult, 2.5), 'the final hand (hands_left 0 while it scores): X2.5', r.total);
});

// ------------------------------------------------------------------- Lake Guardians: 1, 2 and 3 guardians
await sec('lake trio scaling', () => {
  // Uxie per Foreseen card: 1.3 alone, 1.55 with one other, 1.8 with both
  for (const [others, x] of [[[], 1.3], [['azelf'], 1.55], [['azelf', 'mesprit'], 1.8]]) {
    const [u, ...os] = fresh('LAKEU' + others.length, ['uxie', ...others]);
    ok(near(u.ability.extra.lake_mod * others.length + 1.3, x), 'setup');
    const r = play(['S_2', 'H_2']);
    // a Pair, new this round: Mesprit's X2.5 (+0.25 per other guardian) when held; Azelf does nothing (not the final hand)
    const mes = os.find((o) => key(o) === 'j_poke_mesprit') ? 2.5 + 0.25 * others.length : 1;
    ok(near(r.mult, 2 * x * x * mes), (others.length + 1) + ' guardian(s): Uxie X' + x + ' per Foreseen card' + (mes > 1 ? ', Mesprit X' + mes : ''), [r.total, x, mes]);
  }
  // Mesprit X1.5 / X2.5 -> 1.75 / 2.75 -> 2 / 3; Azelf X2.5 -> 2.75 -> 3
  for (const [others, lo, hi, az] of [[[], 1.5, 2.5, 2.5], [['uxie'], 1.75, 2.75, 2.75], [['uxie', 'azelf'], 2, 3, 3]]) {
    const js = fresh('LAKEM' + others.length, ['mesprit', ...others]);
    G.GAME.scry_amount = 0; // (an Uxie here: no Foreseen cards, so only Mesprit scores; Uxie still counts as a held guardian)
    const m = js[0];
    let r = play(['S_2']);
    ok(near(r.mult, hi), (others.length + 1) + ' guardian(s): Mesprit X' + hi + ' on a new poker hand', r.total);
    r = play(['H_3']);
    ok(near(r.mult, lo), (others.length + 1) + ' guardian(s): Mesprit X' + lo + ' on a repeat', r.total);
    ok(plain(m).includes('Currently X' + lo + ' / X' + hi + ' )'), 'Mesprit tooltip: currently X' + lo + ' / X' + hi, plain(m));
  }
  for (const [others, az] of [[[], 2.5], [['mesprit'], 2.75], [['mesprit', 'uxie'], 3]]) {
    const js = fresh('LAKEA' + others.length, ['azelf', ...others]);
    G.GAME.scry_amount = 0;
    const r = play(['S_2', 'H_2'], { final: true });
    const mes = others.includes('mesprit') ? 2.5 + 0.25 * others.length : 1;
    ok(near(r.mult, 2 * az * mes), (others.length + 1) + ' guardian(s): Azelf X' + az + ' on the final hand', [r.total, az, mes]);
    ok(js[0].ability.extra && plain(js[0]).includes('X' + az), 'Azelf tooltip: currently X' + az, plain(js[0]));
  }
  // twins and debuffs: distinct OTHER species, undebuffed
  const [a1, a2] = fresh('LAKET', ['azelf', 'azelf']);
  let r = play(['S_2'], { final: true });
  ok(near(r.mult, 2.5 * 2.5), 'two Azelfs (a twin): each X2.5, a twin is never an "other guardian"', r.total);
  fresh('LAKET2', ['azelf', 'mesprit', 'mesprit']);
  G.GAME.scry_amount = 0;
  r = play(['S_2'], { final: true });
  ok(near(r.mult, 2.75 * 2.75 * 2.75), 'Azelf + two Mesprits: the Mesprits count once (X2.75), each Mesprit X2.75 (one other)', r.total);
  const [az, me] = fresh('LAKED', ['azelf', 'mesprit']);
  debuff(me);
  r = play(['S_2'], { final: true });
  ok(near(r.mult, 2.5), 'a debuffed Mesprit doesn\'t count (and does nothing): Azelf X2.5', r.total);
});

// ------------------------------------------------------------------- Energy
await sec('energy', () => {
  start('LAKEE');
  const u = add('j_poke_uxie'), m = add('j_poke_mesprit'), a = add('j_poke_azelf'), c = add('j_poke_cresselia'), p = add('j_poke_phione'), y = add('j_poke_manaphy');
  const seen = {};
  for (let i = 1; i <= 3; i++) {
    for (const [j, t] of [[u, 'Psychic'], [m, 'Psychic'], [a, 'Psychic'], [c, 'Psychic'], [p, 'Water'], [y, 'Water']]) increment_energy(j, t);
    seen[i] = [ex(u).Xmult_multi, ex(m).Xmult, ex(m).Xmult2, ex(a).Xmult, ex(c).Xmult, ex(p).mult, ex(y).Xmult_multi];
  }
  const want = { 1: [1.365, 1.8, 3, 3, 1.8, 8.4, 1.26], 2: [1.43, 2.1, 3.5, 3.5, 2.1, 10.8, 1.32], 3: [1.495, 2.4, 4, 4, 2.4, 13.2, 1.38] };
  for (const i of [1, 2, 3]) ok(seen[i].every((v, k) => near(v, want[i][k])), i + ' Energy: Uxie X' + want[i][0] + ', Mesprit X' + want[i][1] + ' / X' + want[i][2] + ', Azelf X' + want[i][3] + ', Cresselia X' + want[i][4] + ', Phione +' + want[i][5] + ', Manaphy X' + want[i][6], seen[i]);
  ok([u, m, a].every((j) => ex(j).lake_mod === 0.25) && ex(u).scry === 2 && ex(y).num === 1 && ex(y).dem === 4, 'fixed: +0.25 a guardian, +2 Foresight, 1 in 4');
  // energized + all three guardians: Uxie 1.495 + 0.5, Mesprit 2.4 + 0.5 / 4 + 0.5, Azelf 4 + 0.5
  ok(plain(u).includes('X1.995') && plain(m).includes('X2.9') && plain(m).includes('X4.5') && plain(a).includes('X4.5'), 'energized numbers + the trio in the tooltips (X1.995 a card; X2.9 / X4.5; X4.5)', [plain(u), plain(m), plain(a)]);
  // fire them: a 3-Energy Azelf with both others on the final hand
  start('LAKEE2');
  const a3 = add('j_poke_azelf');
  for (let i = 0; i < 3; i++) increment_energy(a3, 'Psychic');
  const r = play(['S_2'], { final: true });
  ok(near(r.mult, 4), 'a 3-Energy Azelf alone fires X4 on the final hand', r.total);
});

// ------------------------------------------------------------------- Cresselia: no debuffs, X1.5
await sec('cresselia', () => {
  const [c] = fresh('CRES1', ['cresselia']);
  let r = play(['S_2']);
  ok(near(r.mult, 1.5), 'X1.5 Mult every hand', r.total);
  // a Boss Blind's debuff: The Goad (Spades)
  G.GAME.blind.set_blind(P_BLINDS.bl_goad); flush();
  const [s, h] = hand(['S_9', 'H_9']);
  G.GAME.blind.debuff_card(s); G.GAME.blind.debuff_card(h);
  ok(!s.debuff && !h.debuff, 'The Goad with Cresselia: the Spade is NOT debuffed');
  ok(G.playing_cards.filter((x) => x.base.suit === 'Spades').every((x) => !x.debuff), 'no Spade in the whole deck is debuffed');
  clearHand();
  r = play(['S_K']);
  ok(r.chips === 5 + 10 && near(r.mult, 1.5), 'a Spade plays and scores under The Goad (+10 Chips, X1.5)', r.total);
  // anything else: an SMODS.debuff_card source / a mod's debuff_card answer
  const x = hand(['D_4'])[0];
  x.ability.debuff_sources = { other_mod: true }; x.set_debuff();
  ok(!x.debuff, 'any other debuff source (SMODS.debuff_card) is blocked too');
  // jokers can still be debuffed
  const egg = add('j_egg'); debuff(egg);
  ok(egg.debuff, 'Jokers can still be debuffed (the blessing is for playing cards)');
  // Cresselia debuffed: the blessing lifts at once, The Goad's debuffs come back
  debuff(c);
  ok(c.debuff && G.playing_cards.filter((y) => y.base.suit === 'Spades').every((y) => y.debuff), 'Cresselia debuffed: every Spade is debuffed again at once');
  undebuff(c);
  ok(!c.debuff && G.playing_cards.filter((y) => y.base.suit === 'Spades').every((y) => !y.debuff), 'Cresselia undebuffed: the Spades are lifted at once');
  // sold: gone, so the Boss debuffs come back; bought (gained) mid-Blind: lifted at once
  c.remove(); flush();
  ok(G.playing_cards.filter((y) => y.base.suit === 'Spades').every((y) => y.debuff), 'Cresselia gone: The Goad debuffs every Spade again');
  const c2 = add('j_poke_cresselia');
  ok(G.playing_cards.filter((y) => y.base.suit === 'Spades').every((y) => !y.debuff), 'a Cresselia gained mid-Blind lifts the Boss\'s debuffs at once');
  // another Boss: The Plant (face cards), Verdant Leaf (every card)
  G.GAME.blind.set_blind(P_BLINDS.bl_plant); flush();
  ok(G.playing_cards.every((y) => !y.debuff), 'The Plant: no face card is debuffed');
  G.GAME.blind.set_blind(P_BLINDS.bl_final_leaf); flush();
  ok(G.playing_cards.every((y) => !y.debuff), 'Verdant Leaf: no card is debuffed');
  c2.remove(); flush();
  ok(G.playing_cards.every((y) => y.debuff), 'without Cresselia, Verdant Leaf debuffs every card');
});
await sec('cresselia boss blind selected', () => {
  // a real Boss Blind, selected while Cresselia is held: its set_blind pass already debuffs nothing
  start('CRES2', {}, { noBlind: true });
  add('j_poke_cresselia');
  G.GAME.round_resets.blind_choices.Small = 'bl_goad';
  act({ type: 'select_blind' }); flush();
  ok(G.GAME.blind.name === 'The Goad' && G.playing_cards.every((y) => !y.debuff), 'The Goad selected with Cresselia: no card debuffed', G.GAME.blind.name);
  const r = play(['S_A', 'C_A']);
  ok(r.chips === 10 + 22 && near(r.mult, 2 * 1.5), 'a Pair of Aces (one a Spade) scores both: 10 + 11 + 11 Chips, X1.5', r.total);
});
// ------------------------------------------------------------------- Phione: +6 Mult per Water Joker
await sec('phione', () => {
  const [p] = fresh('PHIO1', ['phione']);
  let r = play(['S_2']);
  ok(near(r.mult, 1 + 6), 'alone (itself a Water Joker): +6 Mult', r.total);
  const w = tera('Water');
  r = play(['S_2']);
  ok(near(r.mult, 1 + 12), '+ a Water-Tera Egg: +12 Mult', r.total);
  tera('Fire');
  r = play(['S_2']);
  ok(near(r.mult, 1 + 12), 'a Fire-Tera Egg doesn\'t count', r.total);
  debuff(w);
  r = play(['S_2']);
  ok(near(r.mult, 1 + 6), 'a debuffed Water Joker doesn\'t count', r.total);
  apply_type_sticker(p, 'Grass');
  r = play(['S_2']);
  ok(near(r.mult, 1), 'Phione with a Grass Tera is not Water: nothing for itself', r.total);
  ok(plain(p).includes('+6 Mult') && plain(p).includes('Currently 0: +0 Mult'), 'tooltip with a Grass Tera (and the Water Egg debuffed): currently 0 Water Jokers', plain(p));
  undebuff(w);
  ok(plain(p).includes('Currently 1: +6 Mult'), 'tooltip: the Water Egg back: currently 1', plain(p));
});

// ------------------------------------------------------------------- Manaphy: X1.2 per Water Joker; the Egg
await sec('manaphy', () => {
  const [m] = fresh('MANA1', ['manaphy']);
  let r = play(['S_2']);
  ok(near(r.mult, 1.2), 'alone (itself a Water Joker): X1.2', r.total);
  const w = tera('Water');
  add('j_poke_phione');
  r = play(['S_2']);
  // Phione's +6 per Water Joker comes before... each joker's other_joker bonus lands right after that joker scores, in row order:
  // Manaphy (X1.2 itself, +6 Phione), Egg (X1.2, +6), Phione (X1.2, +6)
  const want = ((((1 * 1.2) + 6) * 1.2 + 6) * 1.2 + 6);
  ok(near(r.mult, want), '+ a Water Egg + Phione: each of the 3 Water Jokers gives X1.2 and +6 in turn', [r.total, want]);
  debuff(w);
  r = play(['S_2']);
  ok(near(r.mult, ((1 * 1.2) + 6) * 1.2 + 6), 'the debuffed Water Egg gives nothing', r.total);
  ok(plain(m).includes('X1.2 Mult') && plain(m).includes('Currently 2: X1.44 Mult') && plain(m).includes('1 in 4'), 'tooltip: X1.2 per Water Joker, currently 2 (X1.44), 1 in 4', plain(m));
});
await sec('phione / manaphy + arceus', () => {
  // the owner's Arceus (Multitype: counts as every type) is a Water Joker for both
  const [p, m] = fresh('ARCW', ['phione', 'manaphy']);
  const a = add('j_poke_arceus');
  const rp = p.calculate_joker({ other_joker: a }), rm = m.calculate_joker({ other_joker: a });
  ok(rp && rp.mult_mod === 6 && rm && near(rm.Xmult_mod, 1.2), 'Arceus counts as a Water Joker: +6 Mult from Phione, X1.2 from Manaphy', [rp, rm]);
  ok(flat(p).includes('Currently 3: +18 Mult') && flat(m).includes('Currently 3: X1.728 Mult'), 'tooltips count Arceus: 3 Water Jokers', [flat(p), flat(m)]);
  debuff(a);
  ok(!p.calculate_joker({ other_joker: a }) && !m.calculate_joker({ other_joker: a }), 'a debuffed Arceus counts for neither');
});
await sec('manaphy egg', () => {
  // the roll is the run's seeded stream ('manaphy_egg'): predicted on a copy of it, so the test holds for any seed
  let hatched = 0, rolls = 0;
  for (const seed of ['EGG1', 'EGG2', 'EGG3', 'EGG4', 'EGG5', 'EGG6']) {
    start(seed);
    const m = add('j_poke_manaphy');
    for (let round = 0; round < 4; round++) {
      const held = G.jokers.cards.length;
      toShop();
      ok(state() === 'SHOP', 'in the shop');
      const before = G.jokers.cards.length, will = eggWillHatch();
      ok(before === held, 'nothing hatches on entering the shop (only at its end)', [held, before]);
      leaveShop();
      const phi = G.jokers.cards.filter((j) => key(j) === 'j_poke_phione');
      const got = G.jokers.cards.length - before;
      rolls++;
      if (will) hatched++;
      ok(got === (will ? 1 : 0), seed + ' shop ' + (round + 1) + ': the seeded roll ' + (will ? 'hits' : 'misses') + ' -> ' + got + ' Phione', [got, will]);
      if (will) ok(key(G.jokers.cards[G.jokers.cards.length - 1]) === 'j_poke_phione', 'the Phione appears at the right end of the row');
      for (const j of phi.slice(1)) { j.remove(); }
      flush();
      act({ type: 'select_blind' }); flush();
      if (G.jokers.cards.length > 1) for (const j of G.jokers.cards.slice(1)) { j.remove(); flush(); }
    }
    ok(m.area === G.jokers, 'Manaphy stays');
  }
  ok(rolls === 24 && hatched > 0 && hatched < rolls, 'over 24 seeded shops some hatch and some don\'t', [hatched, rolls]);
  // the same seed twice: the same eggs
  const runEggs = (seed) => { start(seed); add('j_poke_manaphy'); const out = []; for (let i = 0; i < 6; i++) { toShop(); const n = G.jokers.cards.length; leaveShop(); out.push(G.jokers.cards.length - n); for (const j of G.jokers.cards.slice(1)) j.remove(); flush(); act({ type: 'select_blind' }); flush(); } return out.join(''); };
  const a = runEggs('EGGSAME'), b = runEggs('EGGSAME');
  ok(a === b, 'the same seed hatches the same eggs (deterministic: ' + a + ')', [a, b]);
});
await sec('manaphy egg: slots and odds', () => {
  // guaranteed odds (G.GAME.probabilities.normal 4: the Oops! All 6s rule): a free slot hatches, a full row never rolls
  start('EGGSLOT');
  const m = add('j_poke_manaphy');
  G.GAME.probabilities.normal = 4;
  for (let i = 0; i < 4; i++) add('j_egg');
  ok(G.jokers.cards.length === G.jokers.config.card_limit, 'a full row (5 / 5)', [G.jokers.cards.length, G.jokers.config.card_limit]);
  toShop();
  const saved = deep(G.GAME.pseudorandom);
  leaveShop();
  ok(!G.jokers.cards.some((j) => key(j) === 'j_poke_phione') && G.jokers.cards.length === 5, 'no free slot: no Phione (never pushes a joker out)', G.jokers.cards.map(key));
  ok(JSON.stringify(saved.manaphy_egg) === JSON.stringify(G.GAME.pseudorandom.manaphy_egg), 'no free slot: no roll either (the seeded stream is untouched)');
  act({ type: 'select_blind' }); flush();
  G.jokers.cards[4].remove(); flush();
  toShop(); leaveShop();
  ok(G.jokers.cards.length === 5 && key(G.jokers.cards[4]) === 'j_poke_phione', 'one free slot, guaranteed odds: a Phione fills it', G.jokers.cards.map(key));
  // two Manaphys and one free slot: only one Phione (the first takes the slot at once)
  act({ type: 'select_blind' }); flush();
  G.jokers.cards[4].remove(); G.jokers.cards[3].remove(); flush();
  add('j_poke_manaphy');
  toShop(); leaveShop();
  ok(G.jokers.cards.length === 5 && G.jokers.cards.filter((j) => key(j) === 'j_poke_phione').length === 1, 'two Manaphys, one free slot: one Phione', G.jokers.cards.map(key));
  // Blueprint copies the X, never the Egg
  start('EGGBP');
  add('j_blueprint'); add('j_poke_manaphy');
  G.GAME.probabilities.normal = 4;
  toShop(); leaveShop();
  ok(G.jokers.cards.filter((j) => key(j) === 'j_poke_phione').length === 1, 'Blueprint + Manaphy, 3 free slots: one Phione (Blueprint never hatches)', G.jokers.cards.map(key));
  act({ type: 'select_blind' }); flush();
  G.GAME.probabilities.normal = 1;
  for (const j of G.jokers.cards.filter((x) => key(x) === 'j_poke_phione')) j.remove();
  flush();
  const r = play(['S_2']);
  ok(near(r.mult, 1.2 * 1.2), 'Blueprint copies the X1.2 (Manaphy as a Water Joker: X1.2 from each of them)', r.total);
});

await sec('cresselia + darkrai', async () => {
  // Pokermon+'s Darkrai: no rule between them; Darkrai's held-Energy energizing reaches Cresselia like any Psychic joker
  await import('../../mods/pokermonplus/index.js'); // (loaded only here, last: the sections above run without it)
  start('CRES3', {}, { mods: ['pokermonplus'] });
  const c = add('j_poke_cresselia');
  add('j_sonfive_darkrai'); flush();
  const e = add('c_poke_psychic_energy');
  ok(e && e.ability.set === 'Energy', 'a held Psychic Energy', e && e.ability.set);
  const r = play(['S_2']);
  ok(near(ex(c).Xmult, 1.8) && near(r.mult, 1.8), 'Darkrai\'s held Psychic Energy energizes Cresselia: X1.5 -> X1.8', [ex(c).Xmult, r.total]);
  G.GAME.blind.set_blind(P_BLINDS.bl_goad); flush();
  ok(G.playing_cards.filter((y) => y.base.suit === 'Spades').every((y) => !y.debuff), '... and the blessing still holds with Darkrai');
});

// ------------------------------------------------------------------- the in-game texts
await sec('texts', () => {
  start('LAKET0');
  const T = {};
  for (const n of NAMES) T[n] = flat(add('j_poke_' + n));
  console.log(JSON.stringify(T, null, 1));
  ok(/\+2 Foresight/.test(T.uxie) && /each Foreseen card gives X1\.3 Mult/.test(T.uxie) && /Lake Guardians: plus X0\.25/.test(T.uxie), 'Uxie text', T.uxie);
  ok(/X1\.5 Mult, or X2\.5 if the poker hand hasn't been played yet this round/.test(T.mesprit), 'Mesprit text', T.mesprit);
  ok(/Willpower: X2\.5 Mult on the final hand of each round/.test(T.azelf), 'Azelf text', T.azelf);
  ok(/Lunar Blessing: while you have this Joker, playing cards can't be debuffed/.test(T.cresselia) && /X1\.5 Mult/.test(T.cresselia), 'Cresselia text', T.cresselia);
  ok(/Each Water Joker gives \+6 Mult/.test(T.phione), 'Phione text', T.phione);
  ok(/each Water Joker gives X1\.2 Mult/.test(T.manaphy) && /Egg: at the end of the shop, if you have a free Joker slot, 1 in 4 chance to create a Phione/.test(T.manaphy), 'Manaphy text', T.manaphy);
  // all six held: the guardians read 2 others each
  ok(/Currently 2\/2 others/.test(flat(G.jokers.cards[0])) && /X1\.8 a card/.test(flat(G.jokers.cards[0])), 'with all three: Uxie reads 2/2 others, X1.8 a card', flat(G.jokers.cards[0]));
});

done();
