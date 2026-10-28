// The owner's Gen 4 Legendaries, batch C (2026-10-28; jokers/pokejokers_designs.js "The creation trio" / Regigigas / Arceus; PORTING.md
// "The owner's creation trio, Regigigas and Arceus"). Legendary $20 each.
//   Dialga 483 (Metal)      Roar of Time: the round's FIRST hand is scored twice: every scored card retriggers once (the jokers' own
//                           hand effects run once). Energy-inert.
//   Palkia 484 (Water)      Spacial Rend: +1 Joker slot and +1 hand size while held; taken back when sold, destroyed or debuffed (a
//                           debuff on a full row leaves it one over: nobody is pushed out). Energy-inert.
//   Regigigas 486 (Colorless) Slow Start: gives nothing until its countdown (5) reaches 0, then X4 Mult for good. Each end of round
//                           it drops by 1 + the distinct Regis held (all three: awake after 2 rounds). Awake with all three Regis: each
//                           Regi converts 1 extra card per Blind. Energy: Xmult +20% (X4.8 / X5.6 / X6.4).
//   Giratina 487 (Psychic)  Shadow Force: +X0.25 Mult for each playing card destroyed (any cause); Origin Forme (Dialga or Palkia held):
//                           X0.5 instead, and its Origin card (Gen 4 {10,3} + soul {11,3}). Energy: Xmult_mod +20% (0.3 / 0.35 / 0.4).
//   Arceus 493 (Colorless)  Multitype: counts as every type (is_type / find_pokemon_type / energy_matches); never breaks Monotype.
//                           Judgment: X(1 + 0.25 per different type among your Jokers, itself one; max 12). Energy: Xmult_mod +20%.
// Every ability is FIRED through real hands / rounds with exact numbers.
//   node micatro/tests/mods/pokermon_gen4_creation_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, play, winRound, clearHand, nextRound, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS } from '../../js/engine/core.js';
import { newRun } from '../../js/engine/run.js';
import { get_current_pool } from '../../js/engine/core.js';
import { toView } from '../../js/engine/view.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { increment_energy, energy_values, energy_matches } from '../../mods/pokermon/systems/energy.js';
import { is_type, find_pokemon_type, apply_type_sticker, POKETYPES } from '../../mods/pokermon/systems/types.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '');
const NEW = ['dialga', 'palkia', 'regigigas', 'giratina', 'arceus'];
const REGIS = ['j_poke_regirock', 'j_poke_regice', 'j_poke_registeel'];
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); G.E_MANAGER.flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(false); G.E_MANAGER.flush(); return c; }
const limit = () => G.jokers.config.card_limit;
const hsize = () => G.hand.config.card_limit;
const sell = (j) => { const r = act({ type: 'sell', id: j.sort_id }); flush(); return r; };
function fresh(seed, jokers) { start(seed); return jokers.map((k) => add(k.startsWith('j_') || k.startsWith('c_') ? k : 'j_poke_' + k)); }
/** Play exactly these cards (keys) -> the hand total {chips, mult}. */
function playKeys(keys, opts = {}) {
  clearHand();
  const cs = hand(keys, opts.center ? { center: opts.center } : {});
  const r = play(cs); flush();
  return r.total;
}
/** Win the round in progress, cash out and select the next Blind (The Wall). */
function round() { clearHand(); nextRound(); flush(); }
const enh = (k) => (G.playing_cards || []).filter((c) => c.config.center.key === k).length;

// ------------------------------------------------------------------- pin, static data, order, pool, art, precedence
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 45 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 45+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of NEW) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && /dialga|palkia|giratina|regigigas|arceus/i.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of them (precedence: nothing to dedupe)', hits);
});
await sec('static', () => {
  start('G4C0');
  const want = { dialga: ['Metal', 'Gen04', 10, 2], palkia: ['Water', 'Gen04', 4, 3], regigigas: ['Colorless', 'Natdex', 10, 32], giratina: ['Psychic', 'Gen04', 8, 3], arceus: ['Colorless', 'Gen04', 4, 4] };
  for (const n of NEW) {
    const c = P_CENTERS['j_poke_' + n], [t, sheet, x, y] = want[n];
    ok(c.rarity === 4 && c.cost === 20 && c.stage === 'Legendary' && c.ptype === t && c.gen === 4, n + ': Legendary $20, ' + t + ', Gen 4', [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.atlas === 'poke_AtlasJokersBasic' + sheet + '391' && c.pos.x === x && c.pos.y === y && c.soul_pos && c.soul_pos.x === x + 1 && c.soul_pos.y === y,
      n + ': upstream 3.9.1 cell + its floating soul (' + sheet + ' ' + x + ',' + y + ')', [c.atlas, c.pos, c.soul_pos]);
  }
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_dialga');
  ok(keys.slice(i - 1, i + 5).join() === 'j_poke_azelf,j_poke_dialga,j_poke_palkia,j_poke_regigigas,j_poke_giratina,j_poke_cresselia',
    'Pokédex order: Azelf (482, the Lake trio), Dialga, Palkia, Regigigas, Giratina, then Cresselia (488)', keys.slice(i - 1, i + 5));
  const a = keys.indexOf('j_poke_arceus');
  ok(keys.slice(a - 1, a + 2).join() === 'j_poke_shaymin_sky,j_poke_arceus,j_poke_pansage', 'Pokédex order: Shaymin Sky (492), Arceus, then Pansage (511)', keys.slice(a - 1, a + 2));
  const [leg] = get_current_pool('Joker', 4, true);
  ok(NEW.every((n) => leg.includes('j_poke_' + n)), 'all five are in the Legendary pool (The Soul)', leg.filter((k) => NEW.some((n) => k.includes(n))));
  ok(P_CENTERS.j_poke_dialga.poke_no_energy_field === true && P_CENTERS.j_poke_palkia.poke_no_energy_field === true, 'Dialga / Palkia are Energy-inert by design (poke_no_energy_field)');
  ok(near(energy_values.Xmult, 0.2) && near(energy_values.Xmult_mod, 0.2) && !('slow_start' in energy_values) && !('shadow_Xmult' in energy_values) && !('slots' in energy_values) && !('h_size' in energy_values) && !('retriggers' in energy_values),
    'energy fields: Xmult / Xmult_mod +20%; the wait, the bank, the slot, the hand size and the retrigger in none');
  ok(P_CENTERS.j_poke_arceus.poke_mono_exempt === true && P_CENTERS.j_poke_arceus.poke_multitype === true, 'Arceus: poke_multitype, poke_mono_exempt');
});

// ------------------------------------------------------------------- Dialga, Roar of Time
const PAIR5 = ['D_5', 'S_5'];
await sec('dialga', () => {
  fresh('DIA0', ['j_joker']);
  const base = playKeys(PAIR5);
  ok(base.chips === 20 && base.mult === 6, 'reference (Joker only): a Pair of 5s scores 10 + 5 + 5 = 20 Chips, 2 + 4 Mult', base);
  const [d] = fresh('DIA1', ['dialga', 'j_joker', 'j_greedy_joker']);
  let t = playKeys(PAIR5);
  ok(t.chips === 10 + 2 * (5 + 5) && t.mult === 2 + 2 * 3 + 4, 'the first hand is scored twice: 30 Chips (each 5 twice); Greedy\'s Diamond +3 twice; the Joker\'s +4 once: 12 Mult', t);
  t = playKeys(PAIR5);
  ok(t.chips === 20 && t.mult === 2 + 3 + 4, 'the second hand: scored once (20 Chips, 9 Mult)', t);
  ok(/Used this round/.test(plain(d)), 'tooltip: Used this round', plain(d));
  round();
  ok(/Active!/.test(plain(d)), 'the next round: Active! again', plain(d));
  // a discard first doesn't use it up
  clearHand();
  const dc = hand(['H_9']);
  act({ type: 'highlight', ids: dc.map((c) => c.sort_id) }); act({ type: 'discard' }); flush();
  t = playKeys(PAIR5);
  ok(G.GAME.current_round.discards_used === 1 && t.chips === 30, 'after a discard, the round\'s first hand is still scored twice (30 Chips)', [G.GAME.current_round.discards_used, t]);
  t = playKeys(PAIR5);
  ok(t.chips === 20, '... and only that hand', t);
  // a Glass card's X Mult happens twice, a Red Seal adds its own retrigger on top
  fresh('DIA2', ['dialga']);
  t = playKeys(['S_5'], { center: 'm_glass' });
  ok(t.chips === 5 + 2 * 5 && near(t.mult, 1 * 2 * 2), 'a Glass 5 on the first hand: X2 twice (4 Mult), 15 Chips', t);
  // a debuffed Dialga does nothing; Blueprint copies it (a second retrigger), as on Whiscash
  const [dd] = fresh('DIA3', ['dialga']);
  debuff(dd);
  t = playKeys(PAIR5);
  ok(t.chips === 20, 'a debuffed Dialga: scored once', t);
  fresh('DIA4', ['j_blueprint', 'dialga']);
  t = playKeys(PAIR5);
  ok(t.chips === 10 + 3 * 10, 'Blueprint + Dialga: each card scores three times (40 Chips)', t);
});

// ------------------------------------------------------------------- Palkia, Spacial Rend
await sec('palkia', () => {
  start('PAL0');
  const L = limit(), H = hsize();
  ok(L === 5 && H === 8, 'a Red Deck run: 5 Joker slots, hand size 8', [L, H]);
  let p = add('j_poke_palkia');
  ok(limit() === 6 && hsize() === 9, 'Palkia held: 6 slots, hand size 9', [limit(), hsize()]);
  ok(sell(p).ok && limit() === 5 && hsize() === 8, 'sold: 5 / 8', [limit(), hsize()]);
  p = add('j_poke_palkia');
  p.start_dissolve(); flush();
  ok(limit() === 5 && hsize() === 8 && !G.jokers.cards.includes(p), 'destroyed: 5 / 8', [limit(), hsize()]);
  p = add('j_poke_palkia');
  debuff(p);
  ok(limit() === 5 && hsize() === 8, 'debuffed: 5 / 8 (both taken back)', [limit(), hsize()]);
  undebuff(p);
  ok(limit() === 6 && hsize() === 9, 'the debuff lifted: 6 / 9 again', [limit(), hsize()]);
  debuff(p);
  ok(sell(p).ok && limit() === 5 && hsize() === 8, 'a debuffed Palkia sold: 5 / 8 (never taken twice)', [limit(), hsize()]);
  p = add('j_poke_palkia'); debuff(p); p.start_dissolve(); flush();
  ok(limit() === 5 && hsize() === 8, 'a debuffed Palkia destroyed: 5 / 8', [limit(), hsize()]);
  const n = add('j_poke_palkia', 'negative');
  ok(limit() === 7, 'a Negative Palkia: 7 slots (+1 Negative, +1 Spacial Rend)', limit());
  debuff(n);
  ok(limit() === 6, 'a debuffed Negative Palkia: 6 (the Negative keeps its slot, as vanilla; Spacial Rend\'s goes)', limit());
  ok(sell(n).ok && limit() === 5 && hsize() === 8, 'sold: 5 / 8', [limit(), hsize()]);
  // a full row: the debuff leaves it one over, nobody is pushed out; a joker can't be bought meanwhile
  p = add('j_poke_palkia');
  const others = ['j_joker', 'j_greedy_joker', 'j_lusty_joker', 'j_wrathful_joker', 'j_gluttenous_joker'].map((k) => add(k));
  ok(G.jokers.cards.length === 6 && limit() === 6, 'a full row: Palkia + 5 Jokers in 6 slots', [G.jokers.cards.length, limit()]);
  debuff(p);
  ok(G.jokers.cards.length === 6 && limit() === 5 && others.every((j) => G.jokers.cards.includes(j)), 'debuffed: 6 Jokers in 5 slots — nobody is pushed out', [G.jokers.cards.length, limit()]);
  undebuff(p);
  ok(limit() === 6, 'lifted: 6 slots for the 6', limit());
  // the hand size is real: the next Blind deals 9
  fresh('PAL1', []);
  add('j_poke_palkia');
  round();
  ok(G.hand.cards.length === 0 && hsize() === 9, 'hand size 9 through rounds', hsize());
  ok(/Spacial Rend: \+1 Joker slot \| and \+1 hand size/.test(plain(p)), 'text', plain(p));
});

// ------------------------------------------------------------------- Giratina, Shadow Force / Origin Forme
await sec('giratina', () => {
  const [g] = fresh('GIR0', ['giratina']);
  let t = playKeys(['S_2']);
  ok(near(t.mult, 1) && ex(g).shadow_Xmult === 1, 'nothing destroyed yet: X1 (nothing)', t);
  const hm = add('c_hanged_man');
  clearHand();
  const two = hand(['S_3', 'S_4']);
  ok(act({ type: 'use', id: hm.sort_id, targets: two.map((c) => c.sort_id) }).ok, 'The Hanged Man destroys 2 cards'); flush();
  ok(near(ex(g).shadow_Xmult, 1.5), '2 cards destroyed: X1.5', ex(g).shadow_Xmult);
  t = playKeys(['S_2']);
  ok(near(t.mult, 1.5), 'a High Card: X1.5 Mult', t);
  // Glass shattering is a destroyed card too
  const p0 = G.GAME.probabilities.normal;
  G.GAME.probabilities.normal = 1e6;
  t = playKeys(['S_6'], { center: 'm_glass' });
  G.GAME.probabilities.normal = p0;
  ok(near(ex(g).shadow_Xmult, 1.75), 'a Glass card shatters: +0.25 (X1.75)', ex(g).shadow_Xmult);
  ok(/Altered Forme/.test(plain(g)), 'tooltip: Altered Forme', plain(g));
  let v = {}; view_card(g, v);
  ok(v.poke.form === 'altered' && POKE_UI.face({ center: 'j_poke_giratina', facing: 'front', poke: v.poke, atlas: P_CENTERS.j_poke_giratina.atlas, pos: P_CENTERS.j_poke_giratina.pos, soul_pos: P_CENTERS.j_poke_giratina.soul_pos }, { area: 'jokers' }) === null,
    'Altered: its own card', v.poke);
  // Origin Forme with Dialga: X0.5 per card, the Origin card
  const d = add('j_poke_dialga');
  v = {}; view_card(g, v);
  const face = POKE_UI.face({ center: 'j_poke_giratina', facing: 'front', poke: v.poke, atlas: P_CENTERS.j_poke_giratina.atlas, pos: P_CENTERS.j_poke_giratina.pos, soul_pos: P_CENTERS.j_poke_giratina.soul_pos }, { area: 'jokers' });
  ok(v.poke.form === 'origin' && face && face.atlas === 'poke_AtlasJokersBasicGen04391' && face.pos.x === 10 && face.pos.y === 3 && face.soul_pos.x === 11 && face.soul_pos.y === 3,
    'Origin Forme (Dialga held): drawn as giratina_origin, Gen 4 {10,3} + soul {11,3}', [v.poke, face]);
  ok(/Origin Forme/.test(plain(g)) && /X0\.5\s+instead/.test(plain(g)), 'tooltip: Origin Forme, X0.5 instead', plain(g));
  const hm2 = add('c_hanged_man');
  clearHand();
  const tw = hand(['H_3', 'H_4']);
  act({ type: 'use', id: hm2.sort_id, targets: tw.map((c) => c.sort_id) }); flush();
  ok(near(ex(g).shadow_Xmult, 2.75), 'Origin Forme: 2 cards destroyed, +X1 (X2.75)', ex(g).shadow_Xmult);
  // a debuffed Dialga breaks it; Palkia works too
  debuff(d);
  v = {}; view_card(g, v);
  ok(v.poke.form === 'altered', 'a debuffed Dialga: Altered again', v.poke);
  const hm3 = add('c_hanged_man'); clearHand(); const one = hand(['C_3']);
  act({ type: 'use', id: hm3.sort_id, targets: one.map((c) => c.sort_id) }); flush();
  ok(near(ex(g).shadow_Xmult, 3), '... and the gain is X0.25 (X3)', ex(g).shadow_Xmult);
  const pk = add('j_poke_palkia');
  v = {}; view_card(g, v);
  ok(v.poke.form === 'origin', 'Palkia held: Origin Forme', v.poke);
  const hm4 = add('c_hanged_man'); clearHand(); const one2 = hand(['C_4']);
  act({ type: 'use', id: hm4.sort_id, targets: one2.map((c) => c.sort_id) }); flush();
  ok(near(ex(g).shadow_Xmult, 3.5), 'with Palkia: +0.5 (X3.5)', ex(g).shadow_Xmult);
  t = playKeys(['S_2']);
  ok(near(t.mult, 3.5), 'a High Card: X3.5 Mult', t);
  sell(pk);
  // a debuffed Giratina gains nothing; Blueprint copies the X, not the growth
  const [gd] = fresh('GIR1', ['giratina']);
  debuff(gd);
  const h5 = add('c_hanged_man'); clearHand(); const c5 = hand(['S_3']);
  act({ type: 'use', id: h5.sort_id, targets: c5.map((c) => c.sort_id) }); flush();
  ok(ex(gd).shadow_Xmult === 1, 'a debuffed Giratina gains nothing', ex(gd).shadow_Xmult);
  const [, gb] = fresh('GIR2', ['j_blueprint', 'giratina']);
  const h6 = add('c_hanged_man'); clearHand(); const c6 = hand(['S_3', 'S_4']);
  act({ type: 'use', id: h6.sort_id, targets: c6.map((c) => c.sort_id) }); flush();
  ok(near(ex(gb).shadow_Xmult, 1.5), 'Blueprint + Giratina: the bank grows once (X1.5)', ex(gb).shadow_Xmult);
  t = playKeys(['S_2']);
  ok(near(t.mult, 1.5 * 1.5), 'Blueprint copies the X: X1.5 x X1.5', t);
});

// ------------------------------------------------------------------- Regigigas, Slow Start
await sec('regigigas', () => {
  const [r] = fresh('GIG0', ['regigigas']);
  const trace = [ex(r).slow_start];
  let t = playKeys(['S_2']);
  ok(near(t.mult, 1), 'asleep: gives nothing (1 Mult)', t);
  ok(/Asleep: 5 left, -1 a round/.test(plain(r)), 'tooltip: Asleep: 5 left, -1 a round', plain(r));
  for (let i = 0; i < 4; i++) { round(); trace.push(ex(r).slow_start); }
  t = playKeys(['S_2']);
  ok(trace.join() === '5,4,3,2,1' && near(t.mult, 1), 'no Regi: 5 4 3 2 1 after 4 rounds, still asleep', [trace, t]);
  round(); trace.push(ex(r).slow_start);
  t = playKeys(['S_2']);
  ok(ex(r).slow_start === 0 && near(t.mult, 4), 'the 5th round: awake, X4 Mult', [trace, t]);
  ok(/Awake!/.test(plain(r)), 'tooltip: Awake!', plain(r));
  round();
  t = playKeys(['S_2']);
  ok(ex(r).slow_start === 0 && near(t.mult, 4), 'and for good', t);
  // each distinct Regi cuts a round
  const cut = (seed, regis) => { const [g] = fresh(seed, ['regigigas', ...regis]); const out = [ex(g).slow_start]; while (ex(g).slow_start > 0 && out.length < 8) { round(); out.push(ex(g).slow_start); } return out.join(); };
  ok(cut('GIG1', ['j_poke_regirock']) === '5,3,1,0', 'one Regi: 5 3 1 0 (3 rounds)', cut('GIG1', ['j_poke_regirock']));
  ok(cut('GIG2', ['j_poke_regirock', 'j_poke_regice']) === '5,2,0', 'two Regis: 5 2 0 (2 rounds)');
  ok(cut('GIG3', REGIS) === '5,1,0', 'all three: 5 1 0 — awake after 2 rounds');
  ok(cut('GIG4', ['j_poke_regice', 'j_poke_regice']) === '5,3,1,0', 'two Regices count once: 5 3 1 0');
  const [g5, rk] = fresh('GIG5', ['regigigas', 'j_poke_regirock']);
  debuff(rk);
  round();
  ok(ex(g5).slow_start === 4, 'a debuffed Regi doesn\'t cut (5 -> 4)', ex(g5).slow_start);
  const [g6] = fresh('GIG6', ['regigigas']);
  debuff(g6);
  round();
  ok(ex(g6).slow_start === 5, 'a debuffed Regigigas waits (still 5)', ex(g6).slow_start);
  const [, g7] = fresh('GIG7', ['j_blueprint', 'regigigas']);
  t = playKeys(['S_2']);
  ok(near(t.mult, 1), 'Blueprint copies nothing while it sleeps', t);
  ex(g7).slow_start = 0;
  t = playKeys(['S_2']);
  ok(near(t.mult, 16), 'awake: Blueprint copies the X4 (X16)', t);
  // the Regi Trio bonus: all three + an awake Regigigas -> each converts 1 more card per Blind
  const blind = (seed, keys, awake) => {
    start(seed, {}, { noBlind: true });
    const js = keys.map((k) => add(k));
    for (const j of js) if (j.config.center.key === 'j_poke_regigigas' && awake) ex(j).slow_start = 0;
    const b = { s: enh('m_stone'), g: enh('m_glass'), t: enh('m_steel') };
    act({ type: 'select_blind' }); flush();
    return [enh('m_stone') - b.s, enh('m_glass') - b.g, enh('m_steel') - b.t].join();
  };
  ok(blind('GIGT0', REGIS, false) === '3,3,3', 'reference: the trio converts 3 cards each', blind('GIGT0', REGIS, false));
  ok(blind('GIGT1', [...REGIS, 'j_poke_regigigas'], true) === '4,4,4', 'with an awake Regigigas: 4 each', blind('GIGT1', [...REGIS, 'j_poke_regigigas'], true));
  ok(blind('GIGT2', [...REGIS, 'j_poke_regigigas'], false) === '3,3,3', 'an asleep Regigigas: still 3 each');
  ok(blind('GIGT3', ['j_poke_regirock', 'j_poke_regice', 'j_poke_regigigas'], true) === '2,2,0', 'two Regis + an awake Regigigas: no bonus (2 each)', blind('GIGT3', ['j_poke_regirock', 'j_poke_regice', 'j_poke_regigigas'], true));
  ok(blind('GIGT4', [...REGIS, 'j_poke_regigigas', 'j_poke_regigigas'], true) === '4,4,4', 'two awake Regigigas: still +1 (once)');
  start('GIGT5', {}, { noBlind: true });
  const tr = REGIS.map((k) => add(k)); const gg = add('j_poke_regigigas'); ex(gg).slow_start = 0;
  ok(/4 random card/.test(plain(tr[0])), 'the Regi\'s tooltip shows the bonus (4 cards)', plain(tr[0]));
  debuff(gg);
  ok(/3 random card/.test(plain(tr[0])), 'a debuffed Regigigas: 3', plain(tr[0]));
});

// ------------------------------------------------------------------- Arceus, Multitype / Judgment
await sec('arceus', () => {
  const [a] = fresh('ARC0', ['arceus']);
  ok(POKETYPES.every((t) => is_type(a, t)), 'is_type: Arceus is every one of the 12 types');
  ok(!is_type(a, 'Bird') && !is_type(a, 'Stellar'), '... and not Bird / Stellar');
  ok(['Fire', 'Water', 'Dragon'].every((t) => find_pokemon_type(t).includes(a)), 'find_pokemon_type finds it for any type (Fire, Water, Dragon)');
  ok(POKETYPES.every((t) => energy_matches(a, t, false)), 'every type\'s Energy matches it (energy_matches)');
  let t = playKeys(['S_2']);
  ok(near(t.mult, 1.25), 'alone: 1 type (itself): X1.25', t);
  // Barboach: Water OR Earth Jokers, Arceus counted once
  const [, b] = fresh('ARC1', ['arceus', 'barboach']);
  t = playKeys(['S_2']);
  ok(t.chips === 7 + 12 * 2, 'Barboach counts Arceus as a Water / Earth Joker, once: +24 Chips', t);
  // Starly's Colorless flock (Arceus is Colorless anyway) and Pachirisu's Lightning Jokers
  fresh('ARC2', ['arceus', 'pachirisu']);
  t = playKeys(['S_2']);
  ok(near(t.mult, 1 * 2.25 * (1 + 0.25 * 2)), 'Pachirisu: Arceus is an other Lightning Joker (X2.25); Arceus: 2 types (X1.5)', t);
  // a Tera sticker gives it one type
  const [at] = fresh('ARC3', ['arceus', 'barboach']);
  apply_type_sticker(at, 'Fire');
  ok(is_type(at, 'Fire') && !is_type(at, 'Water') && !is_type(at, 'Grass'), 'a Fire Tera sticker: only Fire', [is_type(at, 'Fire'), is_type(at, 'Water')]);
  t = playKeys(['S_2']);
  ok(t.chips === 7 + 12 * 1, 'then Barboach no longer counts it (+12)', t);
  // a debuffed Arceus isn't counted by the house counters
  const [ad] = fresh('ARC4', ['arceus', 'barboach']);
  debuff(ad);
  t = playKeys(['S_2']);
  ok(t.chips === 7 + 12, 'a debuffed Arceus: Barboach +12 only', t);
  // Judgment: X per different type among your Jokers (scored last, so the X multiplies the others' Mult)
  fresh('ARC5', ['barboach', 'starly', 'pachirisu', 'j_joker', 'arceus']);
  t = playKeys(['S_2']);
  // Barboach +24 (itself + Arceus); Starly +4 (itself + Arceus); Pachirisu X2.25 (Arceus an other Lightning); Joker +4;
  // Arceus: itself + Water + Colorless + Lightning (the Joker has no type) = 4 types: X2
  ok(t.chips === 7 + 24 && near(t.mult, ((1 + 4) * 2.25 + 4) * 2), 'with Barboach, Starly, Pachirisu and a Joker: +24 Chips, ((1 + 4) x 2.25 + 4) x 2 Mult', t);
  ok(/Currently 4:\s+X2\s+Mult/.test(plain(G.jokers.cards[4])), 'tooltip: Currently 4: X2', plain(G.jokers.cards[4]));
  // two Colorless Jokers are one type; a debuffed one counts for none; a second Arceus is one more type; at most 12
  start('ARC6');
  G.jokers.config.card_limit = 30;
  const a6 = add('j_poke_arceus');
  const st = add('j_poke_starly'), st2 = add('j_poke_starly');
  ok(/Currently 2:/.test(plain(a6)), 'two Starlys: one type (Colorless) + itself = 2', plain(a6));
  debuff(st);
  ok(/Currently 2:/.test(plain(a6)), 'one of them debuffed: still 2', plain(a6));
  sell(st); sell(st2);
  const fire = add('j_credit_card'); apply_type_sticker(fire, 'Fire');
  ok(/Currently 2:/.test(plain(a6)), 'a Fire Tera Credit Card: 2 types', plain(a6));
  const a7 = add('j_poke_arceus');
  ok(/Currently 3:/.test(plain(a6)), 'a second Arceus: one more type (3), not twelve', plain(a6));
  for (const ty of POKETYPES) { const j = add('j_credit_card'); apply_type_sticker(j, ty); }
  ok(/Currently 12:\s+X4\s+Mult/.test(plain(a6)) && /Currently 12:\s+X4\s+Mult/.test(plain(a7)), 'all 12 types: X4 (the most), each Arceus', plain(a6));
  t = playKeys(['S_2']);
  ok(near(t.mult, 4 * 4), 'two Arceus at 12 types (13 typed Credit Cards): X4 x X4 = 16 Mult', t);
  // Energy: any type's Energy, full strength
  const [ae] = fresh('ARC7', ['arceus', 'barboach', 'starly', 'pachirisu']);
  const got = [];
  for (const ty of ['Fire', 'Dragon', 'Colorless']) { increment_energy(ae, ty); got.push(ex(ae).Xmult_mod); }
  ok(got.every((v, i) => near(v, [0.3, 0.35, 0.4][i])) && ex(ae).energy_count === 3 && !ex(ae).c_energy_count, 'Fire / Dragon / Colorless Energy: each full strength: X0.25 -> 0.3 / 0.35 / 0.4 a type', [got, ex(ae)]);
  ok(/Currently 4:\s+X2\.6\s+Mult/.test(plain(ae)), 'a 3-Energy Arceus, 4 types: X2.6', plain(ae));
  t = playKeys(['S_2']);
  ok(near(t.mult, (1 * 2.6 + 4) * 2.25), 'played: (1 x 2.6 + 4) x 2.25 Mult', t);
});

// ------------------------------------------------------------------- Monotype: Arceus never breaks it
await sec('monotype', () => {
  const RB = () => G.GAME.run_badges;
  newRun({ seed: 'ARCMONO', seeded: false, back: 'b_red', mods: ['pokermon'] }); G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  add('j_poke_charmander');
  const a = add('j_poke_arceus');
  act({ type: 'select_blind' }); flush();
  ok(RB().mono && RB().type === 'Fire', 'a Charmander + Arceus run locks Fire (Arceus left out)', RB());
  clearHand(); winRound(); flush(); act({ type: 'cash_out' });
  ok(G.STATE === STATES.SHOP && toView().run_badges.mono_at_risk === false, 'the shop: no Monotype warning for Arceus', toView().run_badges);
  act({ type: 'next_round' }); act({ type: 'select_blind' }); flush();
  ok(RB().mono && RB().mono_reason === '', 'the next round: still Monotype', RB());
  ok(a.ability.rb_type === 'Colorless', 'Nuzlocke / Monotype record: Arceus was gained as Colorless (a Pokémon)', a.ability.rb_type);
  newRun({ seed: 'ARCMONO2', seeded: false, back: 'b_red', mods: ['pokermon'] }); G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  add('j_poke_arceus');
  act({ type: 'select_blind' }); flush();
  ok(RB().mono && RB().type === null && RB().nuz, 'Arceus alone: Monotype intact, no type locked; Nuzlocke intact (a typed gain)', RB());
});

// ------------------------------------------------------------------- Energy: Regigigas and Giratina
await sec('energy', () => {
  const [r] = fresh('GIGE', ['regigigas']);
  const xs = [];
  for (let n = 0; n < 3; n++) { increment_energy(r, 'Colorless'); xs.push(ex(r).Xmult); }
  ok(xs.every((v, i) => near(v, [4.8, 5.6, 6.4][i])) && ex(r).slow_start === 5, 'Regigigas, Colorless Energy: X4 -> X4.8 / X5.6 / X6.4; the wait stays 5', [xs, ex(r).slow_start]);
  ex(r).slow_start = 0;
  let t = playKeys(['S_2']);
  ok(near(t.mult, 6.4), 'a 3-Energy awake Regigigas: X6.4', t);
  const [g, d] = fresh('GIRE', ['giratina', 'dialga']);
  const gs = [];
  for (let n = 0; n < 3; n++) { increment_energy(g, 'Psychic'); gs.push(ex(g).Xmult_mod); }
  ok(gs.every((v, i) => near(v, [0.3, 0.35, 0.4][i])), 'Giratina, Psychic Energy: X0.25 -> 0.3 / 0.35 / 0.4 a card', gs);
  const hm = add('c_hanged_man'); clearHand(); const c = hand(['S_3']);
  act({ type: 'use', id: hm.sort_id, targets: c.map((x) => x.sort_id) }); flush();
  ok(near(ex(g).shadow_Xmult, 1.8), 'Origin Forme (Dialga), 3 Energy: X0.8 a card (X1.8)', ex(g).shadow_Xmult);
  ok(/X0\.8\s+instead/.test(plain(g)), 'its tooltip: X0.8 instead', plain(g));
  void d;
  const [p] = fresh('PALE', ['palkia']);
  const lim = limit();
  increment_energy(p, 'Water');
  ok(limit() === lim && ex(p).slots === 1 && ex(p).h_size === 1, 'Palkia: Energy changes nothing (Energy-inert)', ex(p));
});

// ------------------------------------------------------------------- text
await sec('text', () => {
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  ok(NEW.every((n) => J['j_poke_' + n]), 'the texts');
  const [d, p, r, g, a] = fresh('G4CTXT', NEW);
  G.jokers.config.card_limit = 10;
  ok(/Roar of Time: the first hand \| of each round is scored twice: \| every scored card \| retriggers once/.test(plain(d)), 'Dialga', plain(d));
  ok(/Spacial Rend: \+1 Joker slot \| and \+1 hand size/.test(plain(p)), 'Palkia', plain(p));
  ok(/Slow Start: gives nothing for \| its first 5 rounds, then \|\s+X4\s+Mult for the rest of the run/.test(plain(r)) && /Regi Trio: while awake/.test(plain(r)), 'Regigigas', plain(r));
  ok(/Shadow Force: gains\s+X0\.25\s+Mult \| each time a playing card \| is destroyed/.test(plain(g)) && /Origin Forme: with Dialga or/.test(plain(g)) && /\(Origin Forme\)/.test(plain(g)), 'Giratina (Origin with Dialga / Palkia held)', plain(g));
  ok(/Multitype: counts as \| every type/.test(plain(a)) && /Monotype/.test(plain(a)) && /Judgment:/.test(plain(a)), 'Arceus', plain(a));
});

if (ART) {
  await sec('art', async () => {
    const ATL = MODS.pokermon.content.atlases;
    const want = {};
    const cell = (atlas, pos, id) => { const file = decodeURIComponent(ATL[atlas].src).replace(/^.*\/assets\/2x\//, ''); (want[file] || (want[file] = {}))[id] = [pos.x * 142, pos.y * 190, 142, 190]; };
    const g = P_CENTERS.j_poke_giratina;
    // (a Legendary's card is a background cell + its floating soul: Giratina's two backgrounds are the same picture, the souls differ)
    cell(g.atlas, g.pos, 'altered'); cell(g.atlas, g.soul_pos, 'altered_soul'); cell(g.atlas, { x: 10, y: 3 }, 'origin'); cell(g.atlas, { x: 11, y: 3 }, 'origin_soul');
    cell(g.atlas.replace(/391$/, 'Shiny391'), { x: 11, y: 3 }, 'origin_soul_shiny');
    for (const n of ['dialga', 'palkia', 'regigigas', 'arceus']) { const c = P_CENTERS['j_poke_' + n]; cell(c.atlas, c.pos, n); cell(c.atlas, c.soul_pos, n + '_soul'); }
    const px = {};
    for (const [file, rects] of Object.entries(want)) Object.assign(px, await crops(path.join(ART, file), rects));
    const opaque = (q) => { let k = 0; for (let i = 3; i < q.px.length; i += 4) if (q.px[i] > 0) k++; return k / (q.px.length / 4); };
    const hash = (q) => { let h = 0; for (let i = 0; i < q.px.length; i += 97) h = (h * 31 + q.px[i]) >>> 0; return h; };
    const cards = ['altered', 'origin', 'dialga', 'palkia', 'regigigas', 'arceus'];
    ok(cards.every((k) => px[k] && px[k].inside && opaque(px[k]) > 0.5), 'art: every card background is a real 3.9.1 picture', cards.map((k) => px[k] && opaque(px[k])));
    const souls = ['altered_soul', 'origin_soul', 'origin_soul_shiny', 'dialga_soul', 'palkia_soul', 'regigigas_soul', 'arceus_soul'];
    ok(souls.every((k) => px[k] && px[k].inside && opaque(px[k]) > 0.1) && new Set(souls.map((k) => hash(px[k]))).size === souls.length,
      'art: the floating souls are real, distinct pictures (Giratina Altered {9,3} / Origin {11,3}, its Shiny twin, the other four)', souls.map((k) => px[k] && opaque(px[k])));
  });
} else console.log('(Pokermon art not on disk: the sprite checks are skipped; set MICATRO_MAIN)');

void create_playing_card; void P_CARDS;
done();
