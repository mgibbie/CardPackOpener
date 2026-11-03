// Gen 9, batch 2 (the owner's "Yes", 2026-11-03; jokers/pokejokers_designs.js "Gen 9, batch 2"; PORTING.md "Gen 9, batch 2"): 17 jokers,
// #951-1013, including a NEW EVOLUTION of an existing joker (owner-approved, the Gen 8 Galarian exception; gated by Pokermon rules rev 75,
// so runs recorded before it replay as recorded):
//   Wooper -> Clodsire (a Dark Energy used on it)   Poison Point: discarded unenhanced cards 1 in 4 Hazard; X1 + X0.05 per Hazard in the deck.
//   Capsakid -> Scovillain        Spicy: scored Clubs +20 Chips; Scovillain's scored Hearts X1.2, +1 discard.
//   Flittle -> Espathra           Opportunist: +1 Mult / +X0.05 banked whenever another Joker permanently grows (SMODS.scale_card).
//   Bombirdier                    Stork Delivery: 1 in 2 at the end of each shop, a random Tag.
//   Varoom -> Revavroom           Rev the Engine: +2 Mult / X0.1 per hand in a row without a discard (run-wide, this hand included).
//   Cyclizar                      Ride: +1 hand each round, +1 hand size.
//   Orthworm                      Earth Eater: +15 Chips per Steel card in the deck.
//   Glimmet -> Glimmora           scored Stone +6 Mult; Toxic Debris: scored Stone -> a deck card becomes a Hazard (3 a hand); held Hazard X1.15.
//   Flamigo                       X1.5, X2 on a Pair.
//   Veluza                        Fillet Away: -$1 sell value a round, +X0.25 banked (stops at $0).
//   Dondozo                       X2, X4 with Tatsugiri directly to its left.
//   Poltchageist -> Sinistcha     Hospitality: neighbours +$1 sell value a round; Sinistcha X1 + X0.05 per $1 of all your Jokers' sell value.
// Every ability is FIRED through real hands / rounds with exact numbers.
//   node micatro/tests/mods/pokermon_gen9_batch2_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list, get_highest_evo, can_evolve_to_highest } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values, GEN9B2_REV } from '../../mods/pokermon/systems/energy.js';
import { get_type } from '../../mods/pokermon/systems/types.js';
import { ART } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 900)); } };
const ex = (j) => j.ability.extra;
const C = (n) => P_CENTERS['j_poke_' + n];
const plain = (j) => describe(j).lines.join(' ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const NEW = ['capsakid', 'scovillain', 'flittle', 'espathra', 'bombirdier', 'varoom', 'revavroom', 'cyclizar', 'orthworm', 'glimmet', 'glimmora',
  'flamigo', 'veluza', 'dondozo', 'clodsire', 'poltchageist', 'sinistcha'];
const OLD = { pokermon: '3.9.1+r' + (GEN9B2_REV - 1) };
const oldRules = (fn) => { PINS.RULES.pins = OLD; try { return fn(); } finally { PINS.RULES.pins = null; } };
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
/** Put cards in hand: a list of keys, or [key, center] pairs (the first is the leftmost). */
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list`; the round never ends by accident. */
function play(list) { clearHand(); return playCards(cards(list)); }
function playCards(cs) {
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const events = (r && r.events) || [];
  const total = events.find((e) => e.type === 'hand_total') || {};
  return { cards: cs, events, total, mult: Number(total.mult), chips: Number(total.chips) };
}
/** Discard `list` (a player discard). */
function discard(list) {
  clearHand();
  const cs = cards(list);
  if (G.GAME.current_round.discards_left < 1) G.GAME.current_round.discards_left = 1;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'discard' });
  flush();
  return { cards: cs, r };
}
/** Win the round in progress (High Card 2) -> ROUND_EVAL. */
function endRound() { clearHand(); const c = hand(['S_2']); G.GAME.chips = G.GAME.blind.chips; if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2; act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush(); }
function advance(boss = 'bl_wall') {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = boss;
  act({ type: 'select_blind' }); flush();
  clearHand();
}
const rounds = (n) => { for (let r = 0; r < n; r++) { endRound(); advance(); } };
/** A fresh run with these jokers and the first Blind selected. */
function fresh(seed, jokers) {
  start(seed, {}, { noBlind: true });
  const js = jokers.map((k) => add(k.startsWith('j_') ? k : 'j_poke_' + k));
  act({ type: 'select_blind' }); flush();
  clearHand();
  return js;
}
/** Use a consumable (on the picked jokers, if any). */
const use = (c, jokers) => { const r = act({ type: 'use', id: c.sort_id, targets: [], joker_targets: jokers ? jokers.map((j) => j.sort_id) : undefined }); flush(); return r; };
const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
const N = 'poke_AtlasJokersBasicNatdex391';
const hazards = () => G.playing_cards.filter((c) => c.config.center.key === 'm_poke_hazard');
const steel = () => G.playing_cards.filter((c) => c.config.center.key === 'm_steel').length;

// ------------------------------------------------------------------- pin, static data, order, families, Energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= GEN9B2_REV && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev ' + GEN9B2_REV + '+ (Gen 9 batch 2)', PINS.modPin('pokermon'));
  for (const n of NEW) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs');
  }
  const hits = [];
  const re = new RegExp('\\b(' + NEW.join('|') + ')\\b', 'i');
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the 17 (nothing to dedupe)', hits);
});
await sec('static', () => {
  start('G9B2S');
  const S = 'poke_safari';
  // [rarity, cost, stage, type, rounds|undefined, x, y] (all on the 3.9.1 Natdex sheet)
  const WANT = {
    capsakid: [1, 5, 'Basic', 'Grass', 5, 10, 63], scovillain: [S, 8, 'One', 'Fire', undefined, 12, 63],
    flittle: [1, 5, 'Basic', 'Psychic', 5, 18, 63], espathra: [S, 8, 'One', 'Psychic', undefined, 20, 63],
    bombirdier: [3, 7, 'Basic', 'Dark', undefined, 2, 64], varoom: [1, 5, 'Basic', 'Metal', 5, 8, 64], revavroom: [S, 8, 'One', 'Metal', undefined, 10, 64],
    cyclizar: [3, 7, 'Basic', 'Dragon', undefined, 12, 64], orthworm: [3, 7, 'Basic', 'Metal', undefined, 14, 64],
    glimmet: [1, 5, 'Basic', 'Earth', 5, 16, 64], glimmora: [S, 8, 'One', 'Earth', undefined, 18, 64], flamigo: [3, 7, 'Basic', 'Fighting', undefined, 24, 64],
    veluza: [3, 7, 'Basic', 'Water', undefined, 0, 65], dondozo: [3, 7, 'Basic', 'Water', undefined, 2, 65], clodsire: [S, 8, 'One', 'Dark', undefined, 8, 65],
    poltchageist: [1, 5, 'Basic', 'Grass', 5, 12, 67], sinistcha: [S, 8, 'One', 'Grass', undefined, 14, 67],
  };
  ok(Object.keys(WANT).length === 17 && NEW.length === 17, '17 jokers');
  for (const [n, [rarity, cost, stage, type, rnds, x, y]] of Object.entries(WANT)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === type && c.config.extra.ptype === type && c.gen === 9,
      `${n}: ${rarity} $${cost}, ${stage}, ${type}, Gen 9`, [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.config.extra.rounds === rnds, `${n}: ${rnds ? 'evolves after ' + rnds + ' rounds' : 'no round timer'}`, c.config.extra.rounds);
    ok(c.atlas === N && c.pos.x === x && c.pos.y === y && !c.soul_pos, `${n}: upstream 3.9.1 cell Natdex {${x},${y}} (nothing to deploy)`, [c.atlas, c.pos]);
  }
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const run = (list) => { const i = keys.indexOf('j_poke_' + list[0]); return i > 0 && list.every((k, n) => keys[i + n] === 'j_poke_' + k) ? true : keys.slice(i - 1, i + list.length + 1); };
  for (const ch of [['capsakid', 'scovillain', 'rellor'], ['rabsca', 'flittle', 'espathra', 'tinkatink'], ['wugtrio', 'bombirdier', 'varoom', 'revavroom', 'cyclizar', 'orthworm', 'glimmet', 'glimmora', 'greavard'],
    ['houndstone', 'flamigo', 'veluza', 'dondozo', 'tatsugiri', 'annihilape', 'clodsire', 'farigiraf'], ['gholdengo', 'poltchageist', 'sinistcha']]) {
    ok(run(ch) === true, 'Pokédex order: ' + ch.join(' > '), run(ch));
  }
  const FAM = { wooper: 'wooper,quagsire,clodsire', capsakid: 'capsakid,scovillain', flittle: 'flittle,espathra', varoom: 'varoom,revavroom', glimmet: 'glimmet,glimmora', poltchageist: 'poltchageist,sinistcha' };
  for (const [n, f] of Object.entries(FAM)) ok(fam(n) === f, 'family: ' + f, fam(n));
  ok(['bombirdier', 'cyclizar', 'orthworm', 'flamigo', 'veluza', 'dondozo'].every((n) => fam(n) === '' || fam(n) === n), 'the single-stage ones have no line');
  ok(NEW.filter((n) => C(n).poke_no_energy_field).sort().join() === 'bombirdier,cyclizar', 'Energy-inert: Bombirdier (odds) and Cyclizar (hand, hand size); every other one has a main number');
  ok(['num', 'dem', 'd_size', 'hands', 'h_size', 'honey', 'val_loss', 'debris_cap', 'opp_mult', 'opp_Xmult', 'fillet_Xmult', 'rounds'].every((f) => !(f in energy_values)),
    'fixed: odds, the discard / hand / hand size, the honey, the $1 loss, the Hazard cap; the banks never take Energy');
  // Wooper / Quagsire keep their own data
  ok(C('wooper').rarity === 1 && C('wooper').cost === 5 && C('wooper').stage === 'Basic' && ex(add('j_poke_wooper')).rounds === 4 && C('quagsire').stage === 'One',
    'Wooper keeps its rarity, cost, stage and 4-round timer; Quagsire its stage');
});

// ------------------------------------------------------------------- Wooper -> Clodsire (a Dark Energy), Wooper -> Quagsire unchanged
await sec('wooper -> clodsire', () => {
  start('PALDEA1');
  let w = add('j_poke_wooper');
  let en = add('c_poke_darkness_energy');
  let r = use(en, [w]);
  ok(r && r.ok !== false && key(w) === 'j_poke_clodsire' && get_type(w) === 'Dark', 'Wooper + a Dark Energy (picked): evolves into Clodsire (Dark)', [key(w), r && r.ok]);
  ok(!G.consumeables.cards.includes(en), 'the Energy is used up');
  ok(/Paldean form: a Dark Energy used on it evolves it into Clodsire/.test(plain(add('j_poke_wooper'))), 'Wooper\'s text: its 3.9.1 box, then the Paldean box');
  // nothing picked: the leftmost joker the Energy can ENERGIZE first; else the leftmost it evolves
  start('PALDEA2');
  w = add('j_poke_wooper'); const dk = add('j_poke_sandile');
  en = add('c_poke_darkness_energy'); use(en);
  ok(key(w) === 'j_poke_wooper' && ex(dk).energy_count === 1, 'nothing picked, a Dark joker held: it energizes the Dark joker (Wooper stays)', [key(w), ex(dk).energy_count]);
  dk.remove(); flush();
  en = add('c_poke_darkness_energy'); use(en);
  ok(key(w) === 'j_poke_clodsire', 'nothing picked, no Dark joker: it evolves the leftmost Wooper', key(w));
  // refused: another type, debuffed, an Everstone, the old rules; a Water Energy still energizes it (its own type)
  start('PALDEA3');
  w = add('j_poke_wooper');
  en = add('c_poke_psychic_energy');
  use(en, [w]);
  ok(key(w) === 'j_poke_wooper' && G.consumeables.cards.includes(en), 'a Psychic Energy on Wooper: refused (nothing happens)', key(w));
  en.remove(); flush();
  use(add('c_poke_water_energy'), [w]);
  ok(key(w) === 'j_poke_wooper' && ex(w).energy_count === 1, 'a Water Energy on Wooper: energizes it as before (no evolution)', [key(w), ex(w).energy_count]);
  en = add('c_poke_darkness_energy');
  debuff(w);
  use(en, [w]);
  ok(key(w) === 'j_poke_wooper' && G.consumeables.cards.includes(en), 'a debuffed Wooper: refused', key(w));
  undebuff(w);
  const es = add('j_poke_everstone');
  use(en, [w]);
  ok(key(w) === 'j_poke_wooper' && G.consumeables.cards.includes(en), 'an Everstone owned: refused (it blocks every evolution)', key(w));
  es.remove(); flush();
  oldRules(() => { use(en, [w]); });
  ok(key(w) === 'j_poke_wooper' && G.consumeables.cards.includes(en), 'a move recorded on r' + (GEN9B2_REV - 1) + ': refused, as it was', key(w));
  use(en, [w]);
  ok(key(w) === 'j_poke_clodsire' && ex(w).energy_count === 1, '... live: evolves, Wooper\'s Water Energy carried (re-applied to Clodsire)', [key(w), ex(w).energy_count]);
  ok(near(ex(w).Xmult_mod, 0.06), 'Clodsire with that 1 Energy: +X0.06 a Hazard', ex(w).Xmult_mod);
  // Quagsire unchanged: Wooper's 4 rounds still evolve it into Quagsire
  const [w2] = fresh('PALDEA4', ['wooper']);
  rounds(4);
  ok(key(w2) === 'j_poke_quagsire', 'Wooper after 4 rounds: Quagsire, as ever', key(w2));
  // Transformation / the highest form see Clodsire only on the new rules
  start('PALDEA5');
  const w3 = add('j_poke_wooper');
  ok(can_evolve_to_highest(w3) && ['quagsire', 'clodsire'].includes(get_highest_evo(w3)), 'live: Wooper\'s highest form is Quagsire or Clodsire (both Stage 1)', get_highest_evo(w3));
  oldRules(() => {
    ok(get_highest_evo(w3) === 'quagsire' && fam('wooper') === 'wooper,quagsire', 'old rules: only Quagsire, the line without Clodsire (Transformation replays as recorded)', [get_highest_evo(w3), fam('wooper')]);
  });
});

// ------------------------------------------------------------------- Clodsire: Poison Point + X per Hazard
await sec('clodsire', () => {
  const [c] = fresh('CLOD', ['clodsire']);
  const h0 = hazards().length;
  let t = play(['S_A']);
  ok(h0 === 0 && near(t.mult, 1), 'no Hazard in the deck: X1 (nothing)', [h0, t.total]);
  G.GAME.probabilities.normal = 4; // (1 in 4 -> always)
  const d = discard(['S_2', 'S_3', ['S_4', 'm_bonus']]);
  ok(d.cards[0].config.center.key === 'm_poke_hazard' && d.cards[1].config.center.key === 'm_poke_hazard' && d.cards[2].config.center.key === 'm_bonus',
    'Poison Point: the two unenhanced discarded cards become Hazards; the Bonus card never rolls', d.cards.map(key));
  ok(hazards().length === 2 && /Currently 2: X1.1 Mult/.test(plain(c)), 'its text: 2 Hazards, X1.1', plain(c));
  t = play(['S_A']);
  ok(near(t.mult, 1.1), 'X1 + X0.05 x 2 Hazards in the full deck = X1.1', t.total);
  G.GAME.probabilities.normal = 1;
  ex(c).num = 0; // (a roll that misses)
  discard(['H_2']);
  ok(hazards().length === 2, 'a missed roll: no Hazard', hazards().length);
  ex(c).num = 1;
  // an effect's discard (hook) is not yours: nothing
  G.GAME.probabilities.normal = 4;
  clearHand(); const hk = cards(['D_2']);
  for (const j of G.jokers.cards) j.calculate_joker({ pre_discard: true, full_hand: hk, hook: true });
  for (const j of G.jokers.cards) j.calculate_joker({ discard: true, other_card: hk[0], full_hand: hk });
  ok(hk[0].config.center.key === 'c_base', 'a discard made by an effect (The Hook): no roll', key(hk[0]));
  G.GAME.probabilities.normal = 1;
});

// ------------------------------------------------------------------- Capsakid / Scovillain
await sec('spicy', () => {
  const [c] = fresh('SPICY', ['capsakid']);
  let t = play(['C_A']);
  ok(t.chips === 16 + 20 && near(t.mult, 1), 'Capsakid: a scored Club +20 Chips', t.total);
  t = play(['H_A']);
  ok(t.chips === 16 && near(t.mult, 1), 'Capsakid: a Heart gives nothing', t.total);
  const d0 = G.GAME.round_resets.discards;
  rounds(5);
  ok(key(c) === 'j_poke_scovillain' && G.GAME.round_resets.discards === d0 + 1, 'after 5 rounds: Scovillain, +1 discard each round', [key(c), G.GAME.round_resets.discards, d0]);
  t = play(['H_A']);
  ok(t.chips === 16 && near(t.mult, 1.2), 'Scovillain: a scored Heart X1.2', t.total);
  t = play(['C_K', 'C_A', 'C_9', 'C_5', 'C_2']);
  ok(t.chips === 35 + 10 + 11 + 9 + 5 + 2 + 5 * 20 && near(t.mult, 4), 'a Club Flush: +20 Chips each (5 Clubs)', t.total);
  t = play(['H_K', 'H_A', 'H_9', 'H_5', 'H_2']);
  ok(t.chips === 35 + 10 + 11 + 9 + 5 + 2 && near(t.mult, 4 * Math.pow(1.2, 5)), 'a Heart Flush: X1.2 each (5 scored Hearts)', t.total);
  c.remove(); flush();
  ok(G.GAME.round_resets.discards === d0, 'sold / removed: the discard goes back', G.GAME.round_resets.discards);
});

// ------------------------------------------------------------------- Flittle / Espathra: Opportunist
await sec('opportunist', () => {
  // a house bank (Fuecoco's Torch Song: scale_card through bank()) grows: +1 Mult banked
  const [fu, fl] = fresh('OPP1', ['fuecoco', 'flittle']);
  let t = play(['S_A']);
  ok(ex(fl).opp_mult === 1 && ex(fu).torch_mult === 1, 'Fuecoco banks +1 Mult (Torch Song): Flittle banks +1 Mult', [ex(fl).opp_mult, ex(fu).torch_mult]);
  ok(near(t.mult, 1 + 1 + 1), 'the same hand: Fuecoco +1, Flittle +1', t.total);
  t = play(['S_A']);
  ok(ex(fl).opp_mult === 2 && near(t.mult, 1 + 2 + 2), 'next hand: +2 / +2', t.total);
  ok(/Currently \+2 Mult/.test(plain(fl)), 'its text shows the bank', plain(fl));
  // a vanilla joker Steamodded scales through SMODS.scale_card (Green Joker: +1 a hand, -1 a discard): its GROWTH counts, its drop doesn't
  const [g, f2] = fresh('OPP2', ['j_green_joker', 'flittle']);
  t = play(['S_A']);
  ok(ex(f2).opp_mult === 1 && g.ability.mult === 1 && near(t.mult, 3), 'Green Joker +1 Mult (a hand): Flittle +1', [ex(f2).opp_mult, g.ability.mult, t.total]);
  discard(['H_2']);
  ok(g.ability.mult === 0 && ex(f2).opp_mult === 1, 'Green Joker -1 (a discard): not growth, Flittle stays +1', [g.ability.mult, ex(f2).opp_mult]);
  // an Ice Cream melting is no growth either; a Veluza's end-of-round bank is
  const [ic, f3, ve] = fresh('OPP3', ['j_ice_cream', 'flittle', 'veluza']);
  play(['S_A']);
  ok(ex(f3).opp_mult === 0, 'Ice Cream loses Chips: nothing', ex(f3).opp_mult);
  endRound(); flush();
  ok(ex(f3).opp_mult === 1 && near(ex(ve).fillet_Xmult, 1.25), 'Veluza banks X0.25 at end of round: Flittle +1', [ex(f3).opp_mult, ex(ve).fillet_Xmult]);
  void ic;
  // two Flittles: each banks once per growth; one Flittle's gain is never growth for the other (no loop)
  const [, a, b] = fresh('OPP4', ['fuecoco', 'flittle', 'flittle']);
  play(['S_A']); play(['S_A']);
  ok(ex(a).opp_mult === 2 && ex(b).opp_mult === 2, 'two Flittles: +1 each per Fuecoco bank (2 hands: 2 each), not each other\'s', [ex(a).opp_mult, ex(b).opp_mult]);
  // Blueprint: copies the Mult it gives, never banks; a debuffed Flittle banks nothing
  const [bp, f4] = fresh('OPP5', ['j_blueprint', 'flittle', 'fuecoco']);
  t = play(['S_A']);
  ok(ex(f4).opp_mult === 1 && near(t.mult, 1 + 1 + 1 + 1), 'Blueprint copying Flittle: +1 twice, the bank grows once', [ex(f4).opp_mult, t.total]);
  debuff(f4);
  play(['S_A']);
  ok(ex(f4).opp_mult === 1, 'a debuffed Flittle banks nothing', ex(f4).opp_mult);
  void bp;
  // Espathra: Flittle's bank kept, X0.05 a growth
  const [gj, fl5] = fresh('OPP6', ['j_green_joker', 'flittle']);
  rounds(5); // (each round's winning hand: Green Joker +1, Flittle +1)
  ok(key(fl5) === 'j_poke_espathra' && ex(fl5).opp_mult === 5 && ex(fl5).opp_Xmult === 1, 'after 5 rounds: Espathra, Flittle\'s +5 Mult kept', [key(fl5), ex(fl5).opp_mult, ex(fl5).opp_Xmult]);
  const gm = gj.ability.mult;
  t = play(['S_A']);
  ok(near(ex(fl5).opp_Xmult, 1.05) && ex(fl5).opp_mult === 5, 'a growth: +X0.05 banked (the Mult bank no longer grows)', [ex(fl5).opp_Xmult, ex(fl5).opp_mult]);
  ok(near(t.mult, (1 + gm + 1 + 5) * 1.05), 'Espathra: +5 Mult, then X1.05', [t.total, gm]);
  ok(/Currently X1.05 Mult/.test(plain(fl5)) && /\+5 Mult \(kept from Flittle\)/.test(plain(fl5)), 'its text', plain(fl5));
});

// ------------------------------------------------------------------- Bombirdier: Stork Delivery
await sec('bombirdier', () => {
  const tagCount = (k) => G.GAME.tags.filter((t) => t.key === k).length;
  const [b] = fresh('BOMB', ['bombirdier']);
  G.GAME.probabilities.normal = 2; // (1 in 2 -> always)
  G.FORCE_TAG = 'tag_uncommon';
  endRound(); act({ type: 'cash_out' }); flush();
  ok(G.STATE === STATES.SHOP && tagCount('tag_uncommon') === 0, 'in the shop: no Tag yet');
  act({ type: 'next_round' }); flush();
  ok(tagCount('tag_uncommon') === 1, 'the end of the shop: a Tag (the engine\'s Tag pool)', G.GAME.tags.map((t) => t.key));
  // an Orbital Tag names a hand
  G.FORCE_TAG = 'tag_orbital';
  act({ type: 'select_blind' }); flush(); endRound(); act({ type: 'cash_out' });
  const nr = act({ type: 'next_round' }); flush();
  const orb = ((nr && nr.events) || []).find((e) => e.type === 'tag_added' && e.tag === 'tag_orbital');
  ok(orb && G.GAME.hands[orb.orbital_hand] && G.GAME.hands[orb.orbital_hand].visible, 'an Orbital Tag names a visible poker hand', orb);
  // the roll misses: nothing
  G.GAME.probabilities.normal = 1;
  ex(b).num = 0;
  const n0 = G.GAME.tags.length;
  act({ type: 'select_blind' }); flush(); endRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); flush();
  ok(G.GAME.tags.length === n0, 'a missed roll: no Tag', G.GAME.tags.length);
  // Blueprint copies it (its own roll)
  const [, b2] = fresh('BOMB2', ['j_blueprint', 'bombirdier']);
  G.GAME.probabilities.normal = 2; G.FORCE_TAG = 'tag_uncommon';
  endRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); flush();
  ok(tagCount('tag_uncommon') === 2, 'Blueprint copies it: 2 Tags', G.GAME.tags.map((t) => t.key));
  G.FORCE_TAG = undefined; G.GAME.probabilities.normal = 1;
  ok(/1 in 2 chance/.test(plain(b2)), 'its text: 1 in 2', plain(b2));
});

// ------------------------------------------------------------------- Varoom / Revavroom: the streak
await sec('rev the engine', () => {
  const [v] = fresh('VROOM', ['varoom']);
  ok((G.GAME.poke_rev_streak || 0) === 0, 'a new run: streak 0');
  let t = play(['S_A']);
  ok(near(t.mult, 1 + 2 * 1), 'the first hand counts itself: +2', t.total);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 2 * 2) && G.GAME.poke_rev_streak === 2, 'second hand in a row: +4', t.total);
  ok(/Streak so far: 2/.test(plain(v)), 'its text', plain(v));
  discard(['H_2']);
  ok(G.GAME.poke_rev_streak === 0, 'a discard: the streak resets', G.GAME.poke_rev_streak);
  t = play(['S_A']);
  ok(near(t.mult, 3), 'after the discard: +2 again', t.total);
  endRound(); advance();
  ok(G.GAME.poke_rev_streak === 2, 'it carries into the next round (the winning hand counted)', G.GAME.poke_rev_streak);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 2 * 3), 'next round: +6 (3rd hand in a row)', t.total);
  // an effect's discard doesn't break it
  const s0 = G.GAME.poke_rev_streak;
  clearHand(); const hk = cards(['D_2']);
  for (const j of G.jokers.cards) j.calculate_joker({ pre_discard: true, full_hand: hk, hook: true });
  ok(G.GAME.poke_rev_streak === s0, 'only your discards break it', G.GAME.poke_rev_streak);
  // Revavroom after 5 rounds
  rounds(4); endRound(); flush();
  ok(key(v) === 'j_poke_revavroom', 'Varoom -> Revavroom after 5 rounds', key(v));
  advance();
  const s = G.GAME.poke_rev_streak;
  t = play(['S_A']);
  ok(near(t.mult, 1 + 0.1 * (s + 1)), `Revavroom: X1 + X0.1 x ${s + 1} hands`, [t.total, s]);
  discard(['H_3']);
  t = play(['S_A']);
  ok(near(t.mult, 1.1), 'after a discard: X1.1', t.total);
  // a late buy sees the streak so far (run-wide)
  play(['S_A']);
  const late = add('j_poke_varoom');
  t = play(['S_A']);
  ok(G.GAME.poke_rev_streak === 3 && near(t.mult, 1 * 1.3 + 2 * 3), 'a Varoom bought mid-streak sees the whole run\'s streak: Revavroom X1.3, then Varoom +6', [t.total, G.GAME.poke_rev_streak]);
  void late;
});

// ------------------------------------------------------------------- Cyclizar, Orthworm, Flamigo
await sec('cyclizar / orthworm / flamigo', () => {
  start('CYCL', {}, { noBlind: true });
  const h0 = G.GAME.round_resets.hands, s0 = G.hand.config.card_limit;
  const cy = add('j_poke_cyclizar');
  ok(G.GAME.round_resets.hands === h0 + 1 && G.hand.config.card_limit === s0 + 1, 'Cyclizar: +1 hand each round, +1 hand size', [G.GAME.round_resets.hands, G.hand.config.card_limit]);
  act({ type: 'select_blind' }); flush();
  ok(G.GAME.current_round.hands_left === h0 + 1, 'the round starts with the extra hand', G.GAME.current_round.hands_left);
  act({ type: 'sell', id: cy.sort_id }); flush();
  ok(G.GAME.round_resets.hands === h0 && G.hand.config.card_limit === s0, 'sold: both go back', [G.GAME.round_resets.hands, G.hand.config.card_limit]);
  // Orthworm
  const [o] = fresh('ORTH', ['orthworm']);
  let t = play(['S_A']);
  ok(steel() === 0 && t.chips === 16, 'no Steel card: nothing', t.total);
  for (const c of G.playing_cards.filter((c) => c.area === G.deck).slice(0, 3)) c.set_ability(P_CENTERS.m_steel, null, true);
  t = play(['S_A']);
  ok(steel() === 3 && t.chips === 16 + 45, 'Orthworm: +15 Chips x 3 Steel cards in the deck', t.total);
  ok(/Currently \+45 Chips/.test(plain(o)), 'its text', plain(o));
  // Flamigo
  fresh('FLAM', ['flamigo']);
  t = play(['S_A']);
  ok(near(t.mult, 1.5), 'Flamigo: X1.5', t.total);
  t = play(['S_A', 'H_A']);
  ok(near(t.mult, 2 * 2), 'a Pair: X2 (Pair base Mult 2)', t.total);
  t = play(['S_A', 'H_A', 'D_A']);
  ok(near(t.mult, 3 * 1.5), 'Three of a Kind: X1.5', t.total);
  t = play(['S_A', 'H_A', 'D_K', 'C_K']);
  ok(near(t.mult, 2 * 1.5), 'Two Pair: X1.5 (only a Pair)', t.total);
});

// ------------------------------------------------------------------- Glimmet / Glimmora
await sec('glimmet / glimmora', () => {
  const [g] = fresh('GLIM', ['glimmet']);
  let t = play([['S_A', 'm_stone']]);
  ok(t.chips === 5 + 50 && near(t.mult, 1 + 6), 'Glimmet: a scored Stone +6 Mult', t.total);
  t = play(['S_A']);
  ok(near(t.mult, 1), 'not a Stone: nothing', t.total);
  rounds(5);
  ok(key(g) === 'j_poke_glimmora', 'after 5 rounds: Glimmora', key(g));
  // Toxic Debris
  for (const c of G.playing_cards.filter((c) => c.area === G.deck).slice(0, 4)) c.set_ability(P_CENTERS.m_stone, null, true);
  const stones0 = G.playing_cards.filter((c) => c.config.center.key === 'm_stone' && c.area === G.deck);
  const plain0 = new Set(G.playing_cards.filter((c) => c.config.center.key === 'c_base'));
  const h0 = hazards().length;
  t = play([['S_A', 'm_stone'], ['S_K', 'm_stone']]);
  const new2 = hazards().slice(h0);
  ok(hazards().length === h0 + 2 && new2.every((c) => plain0.has(c)), 'two scored Stones: two random unenhanced deck cards become Hazards', [h0, hazards().length]);
  ok(stones0.every((c) => c.config.center.key === 'm_stone') && t.cards.every((c) => c.config.center.key === 'm_stone'), 'never a Stone card (the deck\'s and the played ones stay Stone)');
  ok(t.chips === 5 + 100, 'the Stones still score', t.total);
  const h1 = hazards().length;
  play([['S_A', 'm_stone'], ['S_K', 'm_stone'], ['S_Q', 'm_stone'], ['S_J', 'm_stone'], ['S_9', 'm_stone']]);
  ok(hazards().length === h1 + 3, 'five scored Stones: at most 3 Hazards a hand', [h1, hazards().length]);
  const h2 = hazards().length;
  play([['S_A', 'm_stone']]);
  ok(hazards().length === h2 + 1, 'the next hand: the cap is per hand', hazards().length);
  // held Hazards X1.15 each
  clearHand();
  cards([['S_K', 'm_poke_hazard'], ['S_Q', 'm_poke_hazard']]);
  t = playCards(cards(['S_A']));
  ok(near(t.mult, 1 * 1.15 * 1.15), 'two Hazard cards held: X1.15 each', t.total);
  // unenhanced first: with none left, any card that isn't a Hazard (but never a Stone)
  start('GLIM2');
  const gl = add('j_poke_glimmora');
  for (const c of G.playing_cards) if (c.config.center.key === 'c_base') c.set_ability(P_CENTERS.m_bonus, null, true);
  const before = hazards().length;
  t = play([['S_A', 'm_stone']]);
  ok(hazards().length === before + 1, 'no unenhanced card left: an enhanced (Bonus) card becomes the Hazard', hazards().length);
  void gl;
});

// ------------------------------------------------------------------- Veluza: Fillet Away
await sec('veluza', () => {
  const [v] = fresh('VELU', ['veluza']);
  ok(v.sell_cost === 3, 'Veluza sells for $3', v.sell_cost);
  let t = play(['S_A']);
  ok(near(t.mult, 1), 'nothing banked yet: X1', t.total);
  endRound(); flush();
  ok(v.sell_cost === 2 && near(ex(v).fillet_Xmult, 1.25), 'end of round: $3 -> $2, X1.25 banked', [v.sell_cost, ex(v).fillet_Xmult]);
  advance();
  t = play(['S_A']);
  ok(near(t.mult, 1.25), 'X1.25', t.total);
  rounds(1);
  ok(v.sell_cost === 1 && near(ex(v).fillet_Xmult, 1.5), 'another round: $1, X1.5', [v.sell_cost, ex(v).fillet_Xmult]);
  rounds(2);
  ok(v.sell_cost === 1 && ex(v).extra_value === undefined && v.ability.extra_value === -2 && near(ex(v).fillet_Xmult, 1.5), 'at $1 (Pokermon\'s sell-value floor): it loses nothing and stops gaining', [v.sell_cost, v.ability.extra_value, ex(v).fillet_Xmult]);
  ok(/Currently X1.5 Mult/.test(plain(v)) && /Stops at \$1 sell value/.test(plain(v)), 'its text', plain(v));
  // refilled by a Poltchageist on its right: it fillets again
  const p = add('j_poke_poltchageist');
  ok(G.jokers.cards.indexOf(p) === G.jokers.cards.indexOf(v) + 1, 'Poltchageist to its right');
  endRound(); flush();
  ok(v.sell_cost === 2 && near(ex(v).fillet_Xmult, 1.5), 'end of round: Veluza at $1 gains nothing, then Hospitality gives it $1 ($2)', [v.sell_cost, ex(v).fillet_Xmult]);
  advance(); endRound(); flush();
  ok(v.sell_cost === 2 && near(ex(v).fillet_Xmult, 1.75), 'next round: -$1, +X0.25 (X1.75), refilled to $2: it fillets every round now', [v.sell_cost, ex(v).fillet_Xmult]);
});

// ------------------------------------------------------------------- Dondozo + Tatsugiri
await sec('dondozo', () => {
  let [d] = fresh('DOZO', ['dondozo']);
  let t = play(['S_A']);
  ok(near(t.mult, 2), 'Dondozo: X2', t.total);
  const [ta, d2] = fresh('DOZO2', ['tatsugiri', 'dondozo']);
  ex(ta).form = 'droopy'; // (Droopy: the leftmost Water Joker +100 Chips — Dondozo)
  t = play(['S_A']);
  ok(near(t.mult, 4) && t.chips === 16 + 100, 'Tatsugiri directly to its left: X4 (and Tatsugiri commands it: +100 Chips)', t.total);
  ok(/Now: Commanded!/.test(plain(d2)), 'its text says so', plain(d2));
  debuff(ta);
  t = play(['S_A']);
  ok(near(t.mult, 2) && t.chips === 16, 'a debuffed Tatsugiri: X2', t.total);
  undebuff(ta);
  act({ type: 'reorder', area: 'jokers', ids: [d2.sort_id, ta.sort_id] }); flush();
  ok(G.jokers.cards[0] === d2, 'Dondozo moved to the left of Tatsugiri', G.jokers.cards.map(key));
  t = play(['S_A']);
  ok(near(t.mult, 2) && t.chips === 16 + 100, 'Tatsugiri on its RIGHT: X2 (Tatsugiri still commands it)', t.total);
  const [ta3, j3, d3] = fresh('DOZO3', ['tatsugiri', 'j_joker', 'dondozo']);
  ex(ta3).form = 'droopy';
  t = play(['S_A']);
  ok(near(t.mult, (1 + 4) * 2), 'a Joker between them: X2', t.total);
  void d; void j3; void d3;
});

// ------------------------------------------------------------------- Poltchageist / Sinistcha: Hospitality
await sec('hospitality', () => {
  const [j1, p, j2, j3] = fresh('POLT', ['j_joker', 'poltchageist', 'j_joker', 'j_joker']);
  const v0 = [j1, p, j2, j3].map((j) => j.sell_cost);
  endRound(); flush();
  const v1 = [j1, p, j2, j3].map((j) => j.sell_cost);
  ok(v1[0] === v0[0] + 1 && v1[2] === v0[2] + 1 && v1[1] === v0[1] && v1[3] === v0[3], 'end of round: the Jokers directly left and right +$1; itself and the far one not', [v0, v1]);
  advance();
  rounds(4);
  ok(key(p) === 'j_poke_sinistcha', 'after 5 rounds: Sinistcha', key(p));
  const total = G.jokers.cards.reduce((s, j) => s + j.sell_cost, 0);
  const t = play(['S_A']);
  ok(near(t.mult, (1 + 4) * (1 + 0.05 * total) + 4 + 4), `Sinistcha: X1 + X0.05 x $${total} (all your Jokers' sell value, itself included)`, [t.total, total]);
  ok(plain(p).includes('Currently $' + total + ':'), 'its text', plain(p));
  const bv = j1.sell_cost;
  endRound(); flush();
  ok(j1.sell_cost === bv + 1, 'Sinistcha keeps Hospitality ($1)', [bv, j1.sell_cost]);
});

// ------------------------------------------------------------------- Energy (1 / 2 / 3)
await sec('energy', () => {
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const steps = (n, field, type, want) => {
    start('EN' + n);
    const j = add('j_poke_' + n), got = [];
    for (let i = 0; i < 3; i++) { increment_energy(j, type); got.push(r4(ex(j)[field])); }
    ok(got.every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${field} ${want.join(' / ')}`, got);
    return j;
  };
  steps('capsakid', 'chips', 'Grass', [26, 32, 38]);
  steps('scovillain', 'chips', 'Fire', [26, 32, 38]); steps('scovillain', 'Xmult_multi', 'Fire', [1.26, 1.32, 1.38]);
  steps('flittle', 'mult_mod', 'Psychic', [1.2, 1.4, 1.6]);
  steps('espathra', 'Xmult_mod', 'Psychic', [0.06, 0.07, 0.08]);
  steps('varoom', 'mult_mod', 'Metal', [2.4, 2.8, 3.2]);
  steps('revavroom', 'Xmult_mod', 'Metal', [0.12, 0.14, 0.16]);
  steps('orthworm', 'chips', 'Metal', [19.5, 24, 28.5]);
  steps('glimmet', 'mult', 'Earth', [8.4, 10.8, 13.2]);
  const gm = steps('glimmora', 'Xmult_multi', 'Earth', [1.2075, 1.265, 1.3225]); ok(ex(gm).debris_cap === 3, 'Glimmora: the cap stays 3');
  steps('flamigo', 'Xmult', 'Fighting', [1.8, 2.1, 2.4]); steps('flamigo', 'Xmult2', 'Fighting', [2.4, 2.8, 3.2]);
  const ve = steps('veluza', 'Xmult_mod', 'Water', [0.3, 0.35, 0.4]); ok(ex(ve).val_loss === 1 && ex(ve).fillet_Xmult === 1, 'Veluza: the $1 and the bank untouched');
  steps('dondozo', 'Xmult', 'Water', [2.4, 2.8, 3.2]); steps('dondozo', 'Xmult2', 'Water', [4.8, 5.6, 6.4]);
  const cl = steps('clodsire', 'Xmult_mod', 'Dark', [0.06, 0.07, 0.08]); ok(ex(cl).num === 1 && ex(cl).dem === 4, 'Clodsire: 1 in 4 stays');
  const po = steps('poltchageist', 'Xmult_mod', 'Grass', [0.06, 0.07, 0.08]); ok(ex(po).honey === 1, 'Poltchageist: $1 stays (Energy carries to Sinistcha)');
  steps('sinistcha', 'Xmult_mod', 'Grass', [0.06, 0.07, 0.08]);
  // Energy-inert: no Energy can be used on Bombirdier / Cyclizar
  start('ENINERT');
  const bo = add('j_poke_bombirdier');
  const en = add('c_poke_darkness_energy');
  use(en, [bo]);
  ok(G.consumeables.cards.includes(en) && !ex(bo).energy_count, 'Bombirdier: a Dark Energy is refused (odds fixed: nothing to raise)');
  // Energy carries through evolution; banks are never retroactive
  const [gj, fl] = fresh('ENEVO', ['j_green_joker', 'flittle']);
  play(['S_A']);
  increment_energy(fl, 'Psychic');
  play(['S_A']);
  ok(near(ex(fl).opp_mult, 1 + 1.2), 'Flittle: +1 banked before the Energy, +1.2 after (never retroactive)', ex(fl).opp_mult);
  rounds(5);
  ok(key(fl) === 'j_poke_espathra' && near(ex(fl).Xmult_mod, 0.06), 'Flittle (1 Energy) -> Espathra: +X0.06 a growth', [key(fl), ex(fl).Xmult_mod]);
  const po2 = add('j_poke_poltchageist');
  increment_energy(po2, 'Grass'); increment_energy(po2, 'Grass');
  rounds(5);
  ok(key(po2) === 'j_poke_sinistcha' && near(ex(po2).Xmult_mod, 0.07), 'Poltchageist (2 Energy) -> Sinistcha: X0.07 per $1', [key(po2), ex(po2).Xmult_mod]);
  void gj;
});

// ------------------------------------------------------------------- a run recorded on the old rules replays as recorded
await sec('old-rev replay', () => {
  const deck = { name: 'Paldea', mods: ['pokermon'], params: { blind_scaling: 0.05 }, consumables: [{ key: 'c_poke_transformation' }], jokers: [{ key: 'j_poke_wooper' }] };
  const record = (seed, pins) => {
    const s = new Session();
    PINS.RULES.pins = pins;
    try {
      s.start({ seed, mods: ['pokermon'], customDeck: deck });
      s.act({ type: 'select_blind' }); flush();
      const tr = G.consumeables.cards.find((c) => key(c) === 'c_poke_transformation');
      s.act({ type: 'use', id: tr.sort_id, targets: [] }); flush();
      for (let b = 0; b < 2; b++) {
        for (let i = 0; i < 4 && G.STATE === STATES.SELECTING_HAND; i++) { s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush(); }
        if (G.STATE === STATES.ROUND_EVAL) { s.act({ type: 'cash_out' }); flush(); }
        if (G.STATE === STATES.SHOP) { s.act({ type: 'next_round' }); flush(); }
        if (G.STATE === STATES.BLIND_SELECT) { s.act({ type: 'select_blind' }); flush(); }
      }
    } finally { PINS.RULES.pins = null; }
    return s;
  };
  const y = () => G.jokers.cards.map(key).join();
  // a seed where the new rules' Transformation picks Clodsire (the old rules only know Quagsire)
  let seed = null;
  for (let i = 0; i < 20 && !seed; i++) { record('G9B2REC' + i, null); if (y() === 'j_poke_clodsire') seed = 'G9B2REC' + i; }
  ok(!!seed, 'live: Transformation on Wooper can pick Clodsire', seed);
  const sOld = record(seed, OLD);
  const wantOld = { jokers: y(), chips: String(G.GAME.chips), round: G.GAME.round, dollars: G.GAME.dollars };
  ok(wantOld.jokers === 'j_poke_quagsire', 'the same moves on the old rules: Quagsire (its only highest form then)', wantOld);
  const recOld = JSON.parse(JSON.stringify(sOld.recipe));
  recOld.modVersions.pokermon = OLD.pokermon;
  ok(Session.pinDiff(recOld).length === 1, 'an old-rev recipe differs from the current pin (the resume prompt)', Session.pinDiff(recOld));
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(recOld)), { repin: true }); flush();
  const gotOld = { jokers: y(), chips: String(G.GAME.chips), round: G.GAME.round, dollars: G.GAME.dollars };
  ok(!r.stoppedAt && JSON.stringify(gotOld) === JSON.stringify(wantOld), 'resumed: every old move replays on the old rules (Quagsire, the same score)', { wantOld, gotOld });
  const st = Session.stepper(JSON.parse(JSON.stringify(recOld)));
  st.seek(st.total); flush();
  ok(!st.error && st.index === recOld.actions.length && y() === 'j_poke_quagsire', 'the replay stepper: the same', [st.error, y()]);
});

// ------------------------------------------------------------------- save / resume
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'G9B2RES', customDeck: { name: 'Gen 9', mods: ['pokermon'], params: { blind_scaling: 0.05 },
    cards: [['S_J', 0, 0, 0, 12], ['H_9', 'm_stone', 0, 0, 14], ['D_5', 'm_steel', 0, 0, 6], ['C_7', 0, 0, 0, 20]],
    consumables: [{ key: 'c_poke_darkness_energy' }],
    jokers: [{ key: 'j_poke_wooper' }, { key: 'j_poke_flittle' }, { key: 'j_poke_varoom' }, { key: 'j_poke_veluza' }, { key: 'j_poke_poltchageist' }, { key: 'j_poke_glimmora' }, { key: 'j_poke_bombirdier' }] } });
  s.act({ type: 'select_blind' }); flush();
  const en = G.consumeables.cards[0], wo = G.jokers.cards[0];
  s.act({ type: 'use', id: en.sort_id, targets: [], joker_targets: [wo.sort_id] }); flush();
  ok(key(wo) === 'j_poke_clodsire', 'the run: Wooper + its Dark Energy -> Clodsire');
  for (let b = 0; b < 3; b++) {
    for (let i = 0; i < 3 && G.STATE === STATES.SELECTING_HAND; i++) {
      if (i === 1 && G.GAME.current_round.discards_left > 0) { s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 3).map((c) => c.sort_id) }); s.act({ type: 'discard' }); flush(); }
      s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush();
    }
    if (G.STATE === STATES.ROUND_EVAL) { s.act({ type: 'cash_out' }); flush(); }
    if (G.STATE === STATES.SHOP) { s.act({ type: 'next_round' }); flush(); }
    if (G.STATE === STATES.BLIND_SELECT) { s.act({ type: 'select_blind' }); flush(); }
  }
  const snap = () => ({
    jokers: G.jokers.cards.map((j) => [key(j), ex(j).opp_mult, ex(j).fillet_Xmult, ex(j).debris_count, j.sell_cost]),
    streak: G.GAME.poke_rev_streak, hazards: hazards().length, tags: G.GAME.tags.map((t) => t.key),
    chips: String(G.GAME.chips), dollars: G.GAME.dollars, round: G.GAME.round, hands: G.GAME.current_round.hands_left,
  });
  const want = snap();
  ok(want.round >= 3 && want.jokers[0][0] === 'j_poke_clodsire' && want.jokers[1][1] > 0 && want.jokers[3][2] > 1, 'the run: Clodsire, Flittle banked, Veluza filleted', want);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  const got = snap();
  ok(!r.stoppedAt && JSON.stringify(got) === JSON.stringify(want), 'resume: the evolution, the banks, the streak, the Hazards, the sell values, the Tags and the score come back the same', { want, got });
});

// ------------------------------------------------------------------- the art: the 3.9.1 cells show these types
if (ART) {
  await sec('art types', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const sheet = (a) => a.replace(/^poke_/, '').replace(/391$/, '');
    const bad = [];
    for (const n of NEW) { const r = typer.typeOfEntry({ atlas: sheet(C(n).atlas), pos: [C(n).pos.x, C(n).pos.y] }); if (!r || r.ptype !== C(n).ptype) bad.push([n, C(n).ptype, r && r.ptype]); }
    ok(!bad.length, 'each of the 17 is the type its 3.9.1 card shows', bad);
  });
} else console.log('(Pokermon art not on disk: the art type checks are skipped; set MICATRO_MAIN)');

done();
