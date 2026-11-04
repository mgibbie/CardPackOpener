// Regional batch C (the owner's "yes", 2026-11-03; jokers/pokejokers_hisui.js, mods/nacho/pokemon/0903_sneasler.js; PORTING.md "Regional
// batch C"): the Hisuian and Paldean forms.
//   Hisuian Growlithe -> Arcanine     +40 Chips, doubled on the round's first hand; Arcanine Head Smash X2.5 on the first hand, its first
//                                     scored card destroyed.
//   Hisuian Voltorb -> Electrode      scored Seed cards +6 Mult; Electrode Chloroblast X1 + X0.15 per Seed card in the full deck.
//   Hisuian Sneasel -> Sneasler       (Nacho's; obtainable from Nacho rev 3) +4 Mult per discard used this round; Sneasler Unburden X3 once
//                                     every discard this round is used.
//   Quilava -> H-Typhlosion (Psychic Energy)   Frisk: +2 Foresight, Foreseen Hearts X1.25 (+1 discard kept).
//   Dewott -> H-Samurott (Dark Energy)          Ceaseless Edge: the first 3 scored cards retrigger, held Hazards X1.2 (+1 hand kept).
//   Petilil -> H-Lilligant (Fighting Energy)    Victory Dance: X1 + X0.1 per hand played this round, this hand included.
//   Rufflet -> H-Braviary (Psychic Energy)      Esper Wing: X1.5, X2.5 during Boss Blinds.
//   Bergmite -> H-Avalugg (Earth Energy)        Mountain Gale: +200 Chips, held Stone cards +20 Chips.
//   Dartrix -> H-Decidueye (Fighting Energy)    Triple Arrows: the first 3 scored cards X1.2 each (+1 hand size kept).
//   Paldean Tauros                    breed rolled when obtained: Combat face X1.2 / Blaze +1 discard, Hearts X1.2 / Aqua +1 hand, Clubs X1.2.
//   Paldean Wooper -> Clodsire        Poison Point: discards 1 in 6 to become a Hazard; +2 Mult per Hazard in the full deck. 5 rounds.
// Every ability is FIRED through real hands / rounds with exact numbers; the branches and Sneasel are checked on the old rules too (a
// recorded run replays as recorded).
//   node micatro/tests/mods/pokermon_hisuian_paldean_test.mjs
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { P_CARDS, create_playing_card, get_current_pool, create_card } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import '../../mods/nacho/index.js';
import { STATUS as NSTATUS } from '../../mods/nacho/index.js';
import { poke_get_family_list, get_highest_evo, can_evolve_to_highest, get_previous_evo } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values, HISUI_REV, GEN9B2_REV } from '../../mods/pokermon/systems/energy.js';
import * as TYPES from '../../mods/pokermon/systems/types.js';
import { view_card, GEN9_FORM_SPRITES } from '../../mods/pokermon/systems/anim.js';
import { SNEASEL_REV } from '../../mods/nacho/pokemon/0903_sneasler.js';
import { ART } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 900)); } };
const ex = (j) => j.ability.extra;
const C = (n) => P_CENTERS[n.startsWith('j_') ? n : 'j_poke_' + n];
const plain = (j) => describe(j).lines.join(' ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const NEW = ['hisuian_growlithe', 'hisuian_arcanine', 'hisuian_voltorb', 'hisuian_electrode', 'paldean_tauros', 'hisuian_typhlosion', 'hisuian_samurott',
  'hisuian_lilligant', 'hisuian_braviary', 'hisuian_avalugg', 'hisuian_decidueye', 'paldean_wooper'];
const NACHO_PIN = (r) => MODS.nacho.version + '+r' + r;
const OLD = { pokermon: '3.9.1+r' + (HISUI_REV - 1), nacho: NACHO_PIN(SNEASEL_REV - 1) };
const oldRules = (fn) => { PINS.RULES.pins = OLD; try { return fn(); } finally { PINS.RULES.pins = null; } };
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
function mk(spec, area, center) { return create_playing_card({ front: P_CARDS[spec], center: P_CENTERS[center || 'c_base'] }, area); }
/** Put cards in hand: a list of keys, or [key, center] pairs (the first is the leftmost). */
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
function play(list, heldList) { clearHand(); const cs = cards(list); if (heldList) cards(heldList); return playCards(cs); }
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
/** A real player discard of `list` (no discards added). */
function discard(list) {
  clearHand();
  const cs = cards(list);
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
function fresh(seed, jokers, mods) {
  start(seed, {}, { noBlind: true, mods });
  const js = jokers.map((k) => add(k.startsWith('j_') ? k : 'j_poke_' + k));
  act({ type: 'select_blind' }); flush();
  clearHand();
  return js;
}
const use = (c, jokers) => { const r = act({ type: 'use', id: c.sort_id, targets: [], joker_targets: jokers ? jokers.map((j) => j.sort_id) : undefined }); flush(); return r; };
const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
const unbroken = (c) => !c.destroyed && !c.shattered && !c.removed;
const count = (enh) => G.playing_cards.filter((c) => unbroken(c) && c.config.center.key === enh).length;
/** Play to a Boss Blind (the 3rd blind of the Ante). */
function toBoss(boss = 'bl_wall') { for (let i = 0; i < 2; i++) { endRound(); advance(boss); } }

// ------------------------------------------------------------------- pin, static data, order, families, Energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= HISUI_REV && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev ' + HISUI_REV + '+ (regional batch C)', PINS.modPin('pokermon'));
  ok(MODS.nacho.contentRev >= SNEASEL_REV && SNEASEL_REV === 3, 'Nacho contentRev 3+ (Hisuian Sneasel / Sneasler obtainable)', MODS.nacho.contentRev);
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1' && PINS.LEGACY_MOD_VERSIONS.nacho === '1.6.4', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of NEW) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_hisui'] || []).includes(n), n + ': defined with the regional batch C forms');
  }
  ok((STATUS.PORTED_FILES['micatro/pokejokers_hisui'] || []).length === 12, '12 jokers in pokejokers_hisui', (STATUS.PORTED_FILES['micatro/pokejokers_hisui'] || []).length);
  ok(NSTATUS.ported.includes('j_nacho_hisuian_sneasel') && NSTATUS.ported.includes('j_nacho_sneasler') && !NSTATUS.unavailable.includes('j_nacho_hisuian_sneasel')
    && NSTATUS.unavailable.length === 4, 'Nacho: Hisuian Sneasel / Sneasler ported; the Loyal Three + Pecharunt still data only', NSTATUS.unavailable);
});
await sec('static', () => {
  start('HISUIS');
  const S = 'poke_safari';
  // [rarity, cost, stage, type, rounds|undefined, gen, sheet, x, y, region]
  const WANT = {
    hisuian_growlithe: [1, 5, 'Basic', 'Earth', 5, 1, 'Gen01', 14, 5, 'hisuian'], hisuian_arcanine: [S, 8, 'One', 'Earth', undefined, 1, 'Gen01', 0, 6, 'hisuian'],
    hisuian_voltorb: [1, 5, 'Basic', 'Grass', 4, 1, 'Gen01', 2, 6, 'hisuian'], hisuian_electrode: [S, 8, 'One', 'Grass', undefined, 1, 'Gen01', 4, 6, 'hisuian'],
    paldean_tauros: [3, 7, 'Basic', 'Fighting', undefined, 1, 'Gen01', 6, 6, 'paldean'],
    hisuian_typhlosion: [S, 10, 'Two', 'Psychic', undefined, 2, 'Gen02', 0, 5, 'hisuian'],
    hisuian_samurott: [S, 10, 'Two', 'Dark', undefined, 5, 'Gen05', 8, 8, 'hisuian'],
    hisuian_lilligant: [S, 8, 'One', 'Fighting', undefined, 5, 'Gen05', 10, 8, 'hisuian'],
    hisuian_braviary: [S, 8, 'One', 'Psychic', undefined, 5, 'Gen05', 4, 9, 'hisuian'],
    hisuian_avalugg: [S, 8, 'One', 'Earth', undefined, 6, 'Gen06', 6, 12, 'hisuian'],
    hisuian_decidueye: [S, 10, 'Two', 'Fighting', undefined, 7, 'Gen07', 6, 5, 'hisuian'],
    paldean_wooper: [1, 5, 'Basic', 'Dark', 5, 2, 'Gen02', 6, 5, 'paldean'],
  };
  ok(Object.keys(WANT).length === 12, '12 jokers');
  for (const [n, [rarity, cost, stage, type, rnds, gen, sheet, x, y, region]] of Object.entries(WANT)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === type && c.config.extra.ptype === type && c.gen === gen && c.poke_region === region,
      `${n}: ${rarity} $${cost}, ${stage}, ${type}, Gen ${gen} (its base species'), ${region}`, [c.rarity, c.cost, c.stage, c.ptype, c.gen, c.poke_region]);
    ok(c.config.extra.rounds === rnds, `${n}: ${rnds ? 'evolves after ' + rnds + ' rounds' : 'no round timer'}`, c.config.extra.rounds);
    ok(c.atlas === 'poke_AtlasJokersBasic' + sheet + '391' && c.pos.x === x && c.pos.y === y && !c.soul_pos, `${n}: upstream 3.9.1 cell ${sheet} {${x},${y}} (nothing to deploy)`, [c.atlas, c.pos]);
    ok(/^(Hisuian|Paldean) /.test(describe(add('j_poke_' + n)).name), n + ': named "Hisuian / Paldean ..."');
  }
  // Nacho's: data unchanged (Uncommon $6 -> Safari $10, Fighting, Dawn Stone)
  const hs = C('j_nacho_hisuian_sneasel'), sl = C('j_nacho_sneasler');
  ok(hs.rarity === 2 && hs.cost === 6 && hs.stage === 'Basic' && hs.ptype === 'Fighting' && hs.gen === 2 && hs.config.extra.item_req === 'dawnstone' && !hs.nacho_unavailable,
    'Hisuian Sneasel: Nacho\'s Uncommon $6 Fighting Basic, Gen 2, Dawn Stone; no longer unavailable', [hs.rarity, hs.cost, hs.ptype, hs.gen, hs.nacho_unavailable]);
  ok(sl.rarity === 'poke_safari' && sl.cost === 10 && sl.stage === 'One' && sl.ptype === 'Fighting' && sl.gen === 8 && !sl.nacho_unavailable, 'Sneasler: Safari $10 Fighting Stage 1, Gen 8 (its own species)');
  ok(C('j_nacho_okidogi').nacho_unavailable === 'ToxicStall' && C('j_nacho_pecharunt').nacho_unavailable === 'ToxicStall', 'the Loyal Three / Pecharunt stay data only');
  // the originals keep their own data
  ok(C('growlithe').ptype === 'Fire' && C('voltorb').ptype === 'Lightning' && C('tauros').ptype === 'Colorless' && C('wooper').ptype === 'Water' && C('typhlosion').ptype === 'Fire'
    && C('samurott').ptype === 'Water' && C('lilligant').ptype === 'Grass' && C('braviary').ptype === 'Colorless' && C('avalugg').ptype === 'Water' && C('decidueye').ptype === 'Grass',
    'the originals keep their types');
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const run = (list) => { const i = keys.indexOf('j_poke_' + list[0]); return i >= 0 && list.every((k, n) => keys[i + n] === 'j_poke_' + k) ? true : keys.slice(i - 1, i + list.length + 1); };
  for (const ch of [['arcanine', 'hisuian_growlithe', 'hisuian_arcanine'], ['electrode', 'hisuian_voltorb', 'hisuian_electrode'], ['taurosh', 'paldean_tauros'],
    ['typhlosion', 'hisuian_typhlosion'], ['quagsire', 'paldean_wooper'], ['samurott', 'hisuian_samurott'], ['lilligant', 'hisuian_lilligant', 'basculin'],
    ['braviary', 'hisuian_braviary'], ['avalugg', 'hisuian_avalugg'], ['decidueye', 'hisuian_decidueye']]) {
    ok(run(ch) === true, 'Pokédex order: ' + ch.join(' > '), run(ch));
  }
  const FAM = {
    hisuian_growlithe: 'hisuian_growlithe,hisuian_arcanine', hisuian_voltorb: 'hisuian_voltorb,hisuian_electrode',
    cyndaquil: 'cyndaquil,quilava,typhlosion,hisuian_typhlosion', oshawott: 'oshawott,dewott,samurott,hisuian_samurott', petilil: 'petilil,lilligant,hisuian_lilligant',
    rufflet: 'rufflet,braviary,hisuian_braviary', bergmite: 'bergmite,avalugg,hisuian_avalugg', rowlet: 'rowlet,dartrix,decidueye,hisuian_decidueye',
    paldean_wooper: 'paldean_wooper,clodsire', wooper: 'wooper,quagsire,clodsire', clodsire: 'wooper,quagsire,clodsire',
    growlithe: 'growlithe,arcanine', voltorb: 'voltorb,electrode', tauros: 'tauros,taurosh', paldean_tauros: '',
  };
  for (const [n, f] of Object.entries(FAM)) ok(fam(n) === f, 'family of ' + n + ': ' + (f || '(none)'), fam(n));
  oldRules(() => ok(fam('cyndaquil') === 'cyndaquil,quilava,typhlosion' && fam('petilil') === 'petilil,lilligant' && fam('rowlet') === 'rowlet,dartrix,decidueye',
    'old rules: the lines without their Hisuian members', [fam('cyndaquil'), fam('petilil')]));
  ok(['d_size', 'hands', 'h_size', 'scry', 'strikes', 'retriggers', 'arrows', 'num', 'dem', 'rounds'].every((f) => !(f in energy_values)), 'fixed: the perks, Foresight, retriggers, odds');
});

// ------------------------------------------------------------------- the regional pill (Alolan batch's region_badge)
await sec('pills', () => {
  start('HISUIPILL', {}, { mods: ['nacho'] });
  ok(!!TYPES.REGIONS && !!TYPES.region_badge, 'the regional pill (systems/types.js REGIONS / region_badge) is there');
  if (!TYPES.REGIONS) return;
  const pillsOf = (j) => describe(j).badges.filter((b) => b && b.key !== 'mod').map((b) => [b.label, b.colour]);
  const pills = (k) => pillsOf(add(k));
  for (const n of NEW) {
    const label = /^paldean_/.test(n) ? 'Paldean' : 'Hisuian', j = add('j_poke_' + n), b = pillsOf(j);
    ok(b.length === 3 && b[1][0] === label && b[1][1] === TYPES.REGIONS[label.toLowerCase()].colour && b[2][0] === TYPES.get_type(j),
      n + ': its pills are its rarity, "' + label + '", then its type (' + TYPES.get_type(j) + ')', b);
  }
  const b = pills('j_nacho_hisuian_sneasel');
  ok(b.length === 3 && b[1][0] === 'Hisuian', 'Hisuian Sneasel: the "Hisuian" pill', b);
  ok(pills('j_nacho_sneasler').length === 2 && pills('j_poke_clodsire').length === 2, 'Sneasler and Clodsire (own species): no region pill');
});

// ------------------------------------------------------------------- the shop pools
await sec('shop', () => {
  start('HISUISHOP', {}, { mods: ['nacho'] });
  const [common] = get_current_pool('Joker', 0.1);
  const [unc] = get_current_pool('Joker', 0.8);
  const [rare] = get_current_pool('Joker', 0.99);
  ok(['hisuian_growlithe', 'hisuian_voltorb', 'paldean_wooper'].every((n) => common.includes('j_poke_' + n)), 'the own-line Basics are in the Common pool');
  ok(rare.includes('j_poke_paldean_tauros'), 'Paldean Tauros is in the Rare pool');
  ok(unc.includes('j_nacho_hisuian_sneasel'), 'Hisuian Sneasel is in the Uncommon pool now');
  ok(NEW.filter((n) => C(n).rarity === 'poke_safari').every((n) => !common.includes('j_poke_' + n) && !unc.includes('j_poke_' + n) && !rare.includes('j_poke_' + n)), 'the Safari ones never roll');
  oldRules(() => { const [u] = get_current_pool('Joker', 0.8); ok(!u.includes('j_nacho_hisuian_sneasel'), 'old rules (Nacho r2): Hisuian Sneasel in no pool, as before'); });
  // a Kanto Wooper held doesn't keep the Paldean one out (its own line), and vice versa
  add('j_poke_wooper'); add('j_poke_hisuian_growlithe');
  const [c2] = get_current_pool('Joker', 0.1);
  ok(c2.includes('j_poke_paldean_wooper') && !c2.includes('j_poke_wooper') && c2.includes('j_poke_growlithe') && !c2.includes('j_poke_hisuian_growlithe'),
    'Wooper held: Paldean Wooper still offered; Hisuian Growlithe held: Growlithe still offered');
});

// ------------------------------------------------------------------- Hisuian Growlithe / Arcanine
await sec('growlithe', () => {
  const [g] = fresh('HGRO', ['hisuian_growlithe']);
  let t = play(['S_K', 'H_K']);
  ok(t.chips === 10 + 20 + 80 && near(t.mult, 2), 'Hisuian Growlithe, the round\'s first hand: +80 Chips (doubled)', t.total);
  t = play(['S_K', 'H_K']);
  ok(t.chips === 10 + 20 + 40, 'the second hand: +40 Chips', t.total);
  rounds(5);
  ok(key(g) === 'j_poke_hisuian_arcanine' && TYPES.get_type(g) === 'Earth', 'Hisuian Growlithe -> Hisuian Arcanine after 5 rounds', key(g));
  const n0 = G.playing_cards.length;
  t = play(['S_Q', 'H_Q', 'D_4']);
  ok(near(t.mult, 2 * 2.5), 'Hisuian Arcanine, the first hand: X2.5', t.total);
  ok(G.playing_cards.length === n0 + 3 - 1 && !unbroken(t.cards[0]) && unbroken(t.cards[1]) && unbroken(t.cards[2]), 'Head Smash: the first scored card (S_Q) is destroyed, nothing else', [G.playing_cards.length, n0]);
  t = play(['S_J', 'H_J']);
  ok(near(t.mult, 2) && unbroken(t.cards[0]), 'the second hand: nothing, no card destroyed', t.total);
  ok(/Used this round/.test(plain(g)), 'its text: used this round', plain(g));
  // a debuffed card scores nothing: it is never "the first scored card"
  endRound(); advance();
  clearHand();
  const cs = cards(['S_10']);
  debuff(cs[0]);
  t = playCards(cs);
  ok(unbroken(cs[0]) && near(t.mult, 2.5), 'the first hand of the round, its only card debuffed: X2.5, nothing destroyed', t.total);
  // Blueprint copies the X, never the destruction
  const [, a] = fresh('HGRO2', ['j_blueprint', 'hisuian_arcanine']);
  const n1 = G.playing_cards.length;
  t = play(['S_9', 'H_9', 'D_9']);
  ok(near(t.mult, 3 * 2.5 * 2.5) && G.playing_cards.length === n1 + 3 - 1, 'Blueprint: X2.5 twice, still one card destroyed', [t.total, G.playing_cards.length - n1]);
  void a;
});

// ------------------------------------------------------------------- Hisuian Voltorb / Electrode
await sec('voltorb', () => {
  const [v] = fresh('HVOL', ['hisuian_voltorb']);
  let t = play([['S_K', 'm_poke_seed'], ['H_K', 'm_poke_seed']]);
  ok(near(t.mult, 2 + 6 + 6), 'Hisuian Voltorb: two scored Seed cards +6 Mult each', t.total);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2), 'plain cards: nothing', t.total);
  rounds(4);
  ok(key(v) === 'j_poke_hisuian_electrode' && TYPES.get_type(v) === 'Grass', 'Hisuian Voltorb -> Hisuian Electrode after 4 rounds', key(v));
  for (const c of G.playing_cards.filter((x) => unbroken(x) && x.config.center.key === 'c_base').slice(0, 5)) c.set_ability(P_CENTERS.m_poke_seed, null, true);
  clearHand();
  const cs = cards(['S_A']);
  const n = count('m_poke_seed');
  t = playCards(cs);
  ok(n >= 5 && near(t.mult, 1 + 0.15 * n), 'Chloroblast: X1 + X0.15 per Seed card in the full deck (' + n + ')', [n, t.total]);
  ok(new RegExp('Currently ' + count('m_poke_seed') + ':').test(plain(v)), 'its text counts them', plain(v));
});

// ------------------------------------------------------------------- Hisuian Sneasel / Sneasler (Nacho)
await sec('sneasel', () => {
  const [s] = fresh('HSNE', ['j_nacho_hisuian_sneasel'], ['nacho']);
  let t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2), 'Hisuian Sneasel, no discards used: nothing', t.total);
  discard(['D_2']); discard(['D_3']);
  ok(G.GAME.current_round.discards_used === 2, '2 discards used', G.GAME.current_round.discards_used);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 + 8), '2 discards used: +8 Mult', t.total);
  ok(/Currently \+8 Mult/.test(plain(s)), 'its text counts them', plain(s));
  oldRules(() => { const t2 = play(['S_K', 'H_K']); ok(near(t2.mult, 2), 'a move recorded on Nacho r2: no effect, as before', t2.total); });
  // Dawn Stone -> Sneasler
  use(add('c_poke_dawnstone'), [s]);
  endRound(); flush();
  ok(key(s) === 'j_nacho_sneasler', 'Hisuian Sneasel + a Dawn Stone: Sneasler', key(s));
  advance();
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2), 'Sneasler, discards left: nothing', t.total);
  const left = G.GAME.current_round.discards_left;
  ok(left >= 2, 'a round starts with discards', left);
  for (let i = 0; i < left - 1; i++) discard(['C_2']);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2) && G.GAME.current_round.discards_left === 1, 'one discard still left: nothing', t.total);
  discard(['C_3']);
  ok(G.GAME.current_round.discards_left === 0, 'every discard used');
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 3), 'Unburden: all discards used: X3', t.total);
  ok(/Active!/.test(plain(s)), 'its text: Active!', plain(s));
  oldRules(() => { const t2 = play(['S_K', 'H_K']); ok(near(t2.mult, 2), 'a move recorded on Nacho r2: Sneasler gives nothing, as before', t2.total); });
  // a round with no discards to use never counts
  const [s2] = fresh('HSNE2', ['j_nacho_sneasler'], ['nacho']);
  G.GAME.current_round.discards_left = 0;
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2) && key(s2) === 'j_nacho_sneasler', 'no discards left and none used: nothing (at least one must be used)', t.total);
});

// ------------------------------------------------------------------- the six branch evolutions (an Energy used on the earlier stage)
const BRANCH = [
  ['quilava', 'Psychic', 'hisuian_typhlosion', 'Psychic', 'Fire', 'typhlosion', 5],
  ['dewott', 'Dark', 'hisuian_samurott', 'Dark', 'Water', 'samurott', 5],
  ['petilil', 'Fighting', 'hisuian_lilligant', 'Fighting', null, 'lilligant', 5],
  ['rufflet', 'Psychic', 'hisuian_braviary', 'Psychic', 'Colorless', 'braviary', 5],
  ['bergmite', 'Earth', 'hisuian_avalugg', 'Earth', 'Water', 'avalugg', 5],
  ['dartrix', 'Fighting', 'hisuian_decidueye', 'Fighting', 'Grass', 'decidueye', 5],
];
const energy = (t) => 'c_poke_' + (t === 'Dark' ? 'darkness' : t.toLowerCase()) + '_energy';
await sec('branches', () => {
  for (const [base, etype, into, itype, own, normal, rnds] of BRANCH) {
    start('HBR' + base);
    let b = add('j_poke_' + base);
    ok(new RegExp('Hisuian form: a ' + etype + ' Energy used on it evolves it into ' + describe(add('j_poke_' + into)).name).test(plain(b)), base + '\'s text: its own, then the Hisuian box', plain(b));
    G.jokers.cards.slice(1).forEach((j) => { j.remove(); }); flush();
    const r = use(add(energy(etype)), [b]);
    ok(r && r.ok !== false && key(b) === 'j_poke_' + into && TYPES.get_type(b) === itype, `${base} + a ${etype} Energy (picked): ${into} (${itype})`, [key(b), r && r.ok]);
    // refused: debuffed, an Everstone, the old rules
    start('HBR2' + base);
    b = add('j_poke_' + base);
    const en = add(energy(etype));
    debuff(b); use(en, [b]);
    ok(key(b) === 'j_poke_' + base && G.consumeables.cards.includes(en), base + ' debuffed: refused', key(b));
    undebuff(b);
    const es = add('j_poke_everstone');
    use(en, [b]);
    ok(key(b) === 'j_poke_' + base && G.consumeables.cards.includes(en), base + ', an Everstone owned: refused', key(b));
    es.remove(); flush();
    oldRules(() => use(en, [b]));
    ok(key(b) === 'j_poke_' + base && G.consumeables.cards.includes(en), base + ', a move recorded on r' + (HISUI_REV - 1) + ': refused, as it was', key(b));
    // its own type's Energy energizes it as before; then the branch Energy evolves it with that Energy carried
    if (own) {
      use(add(energy(own)), [b]);
      ok(key(b) === 'j_poke_' + base && ex(b).energy_count === 1, base + ' + a ' + own + ' Energy: energized as before (no evolution)', [key(b), ex(b).energy_count]);
      use(en, [b]);
      ok(key(b) === 'j_poke_' + into && ex(b).energy_count === 1, '... then the ' + etype + ' Energy: ' + into + ', the Energy carried', [key(b), ex(b).energy_count]);
    } else {
      use(en, [b]);
      ok(key(b) === 'j_poke_' + into, base + ' (Energy-inert) + the ' + etype + ' Energy: ' + into, key(b));
    }
    // the normal path is unchanged
    const [k] = fresh('HBR3' + base, [base]);
    rounds(rnds);
    ok(key(k) === 'j_poke_' + normal, base + ' after ' + rnds + ' rounds: ' + normal + ', as ever', key(k));
  }
  // nothing picked: the Energy goes to the leftmost joker it can energize first, else the leftmost it evolves
  start('HBR4');
  const q = add('j_poke_quilava');
  use(add('c_poke_psychic_energy'));
  ok(key(q) === 'j_poke_hisuian_typhlosion', 'nothing picked, no Psychic joker: the leftmost Quilava evolves', key(q));
  // the highest form: both finals live; the original only on the old rules
  start('HBR5');
  const cy = add('j_poke_cyndaquil'), pe = add('j_poke_petilil'), pw = add('j_poke_paldean_wooper'), wo = add('j_poke_wooper');
  ok(can_evolve_to_highest(cy) && ['typhlosion', 'hisuian_typhlosion'].includes(get_highest_evo(cy)), 'live: Cyndaquil\'s highest form is Typhlosion or Hisuian Typhlosion', get_highest_evo(cy));
  ok(['lilligant', 'hisuian_lilligant'].includes(get_highest_evo(pe)), 'live: Petilil\'s is Lilligant or Hisuian Lilligant', get_highest_evo(pe));
  oldRules(() => ok(get_highest_evo(cy) === 'typhlosion' && get_highest_evo(pe) === 'lilligant', 'old rules: the originals only', [get_highest_evo(cy), get_highest_evo(pe)]));
  ok(get_highest_evo(pw) === 'clodsire', 'Paldean Wooper\'s highest form: Clodsire', get_highest_evo(pw));
  ok(['quagsire', 'clodsire'].includes(get_highest_evo(wo)), 'Wooper\'s: Quagsire or Clodsire, as before', get_highest_evo(wo));
  oldRules(() => ok(get_highest_evo(wo) && ['quagsire', 'clodsire'].includes(get_highest_evo(wo)), 'Wooper on the old rules: unchanged', get_highest_evo(wo)));
  PINS.RULES.pins = { pokermon: '3.9.1+r' + (GEN9B2_REV - 1) };
  try { ok(get_highest_evo(wo) === 'quagsire', 'Wooper before r77: Quagsire only, still', get_highest_evo(wo)); } finally { PINS.RULES.pins = null; }
  const cl = add('j_poke_clodsire');
  ok(get_previous_evo(cl) === 'wooper', 'Clodsire\'s previous evolution is still Wooper', get_previous_evo(cl));
});

// ------------------------------------------------------------------- the branch finals' effects
await sec('typhlosion', () => {
  start('HTYP', {}, { noBlind: true });
  const d0 = G.GAME.round_resets.discards;
  const q = add('j_poke_quilava');
  ok(G.GAME.round_resets.discards === d0 + 1, 'Quilava: +1 discard');
  use(add('c_poke_psychic_energy'), [q]);
  ok(key(q) === 'j_poke_hisuian_typhlosion' && G.GAME.round_resets.discards === d0 + 1 && G.GAME.scry_amount === 2, 'Hisuian Typhlosion: the +1 discard kept, +2 Foresight', [G.GAME.round_resets.discards, G.GAME.scry_amount]);
  act({ type: 'select_blind' }); flush(); clearHand();
  /** The top of the deck becomes these cards (the last is the top): the Foreseen cards. */
  const top = (specs) => { clearHand(); for (const c of G.deck.cards.slice()) { G.deck.remove_card(c); G.discard.emplace(c); } for (const k of specs) mk(k, G.deck); };
  top(['S_5', 'S_6']);
  let t = playCards(cards(['S_2']));
  ok(near(t.mult, 1), 'two Foreseen Spades: nothing', t.total);
  top(['H_5', 'D_6']);
  ok(G.scry_view.cards.map((c) => c.base.suit).sort().join() === 'Diamonds,Hearts', 'Foreseen: a Diamond and a Heart', G.scry_view.cards.map((c) => c.base.suit));
  t = playCards(cards(['S_2']));
  ok(near(t.mult, 1.25), 'one Foreseen Heart: X1.25', t.total);
  top(['H_7', 'H_8']);
  t = playCards(cards(['S_2']));
  ok(near(t.mult, 1.25 * 1.25), 'two Foreseen Hearts: X1.25 each', t.total);
  top(['H_7', [ 'H_8' ][0]]);
  debuff(G.deck.cards[G.deck.cards.length - 1]);
  t = playCards(cards(['S_2']));
  ok(near(t.mult, 1.25), 'a debuffed Foreseen Heart gives nothing', t.total);
  ok(/Frisk: each Foreseen Heart gives X1.25 Mult/.test(plain(q)), 'its text', plain(q));
});
await sec('samurott', () => {
  const [s] = fresh('HSAM', ['hisuian_samurott']);
  const h0 = G.GAME.round_resets.hands;
  void h0;
  let t = play(['S_K', 'H_K', 'D_K', 'C_K', 'S_A']);
  ok(t.chips === 60 + 4 * 10 + 3 * 10, 'Four of a Kind: the first 3 scored cards retrigger (+30 Chips)', t.total);
  t = play(['S_K', 'H_K'], [['D_2', 'm_poke_hazard'], ['C_3', 'm_poke_hazard'], 'D_9']);
  ok(near(t.mult, 2 * 1.2 * 1.2) && t.chips === 10 + 40, 'two Hazard cards held: X1.2 each; the Pair retriggers', t.total);
  ok(/Ceaseless Edge/.test(plain(s)), 'its text', plain(s));
  // +1 hand kept through the evolution
  start('HSAM2', {}, { noBlind: true });
  const hb = G.GAME.round_resets.hands;
  const d = add('j_poke_dewott');
  ok(G.GAME.round_resets.hands === hb + 1, 'Dewott: +1 hand');
  use(add('c_poke_darkness_energy'), [d]);
  ok(key(d) === 'j_poke_hisuian_samurott' && G.GAME.round_resets.hands === hb + 1, 'Hisuian Samurott: the +1 hand kept', G.GAME.round_resets.hands);
});
await sec('lilligant', () => {
  const [l] = fresh('HLIL', ['hisuian_lilligant']);
  ok(/This hand: X1.1 Mult/.test(plain(l)), 'its text before the first hand: X1.1', plain(l));
  let t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 1.1), 'Victory Dance, the round\'s first hand: X1.1 (this hand counts)', t.total);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 1.2), 'the second hand: X1.2', t.total);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 1.3), 'the third: X1.3', t.total);
  endRound(); advance();
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 1.1), 'the next round resets: X1.1', t.total);
});
await sec('braviary', () => {
  const [b] = fresh('HBRA', ['hisuian_braviary']);
  let t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 1.5), 'Esper Wing: X1.5', t.total);
  toBoss();
  ok(G.GAME.blind.boss, 'a Boss Blind');
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 2.5), 'during a Boss Blind: X2.5', t.total);
  void b;
});
await sec('avalugg', () => {
  fresh('HAVA', ['hisuian_avalugg']);
  let t = play(['S_K', 'H_K']);
  ok(t.chips === 30 + 200, 'Mountain Gale: +200 Chips', t.total);
  t = play(['S_K', 'H_K'], [['D_2', 'm_stone'], ['C_3', 'm_stone'], 'D_9']);
  ok(t.chips === 30 + 200 + 40, 'two Stone cards held: +20 Chips each', t.total);
  add('j_mime');
  t = play(['S_K', 'H_K'], [['D_2', 'm_stone']]);
  ok(t.chips === 30 + 200 + 40, 'Mime repeats the held Stone\'s +20', t.total);
});
await sec('decidueye', () => {
  const [d] = fresh('HDEC', ['hisuian_decidueye']);
  let t = play(['S_K', 'H_K', 'D_K', 'C_K', 'S_A']);
  ok(near(t.mult, 7 * 1.2 ** 3), 'Triple Arrows: the first 3 scored cards X1.2 each (Four of a Kind: X1.2^3)', t.total);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 1.2 ** 2), 'a Pair: both X1.2', t.total);
  add('j_hack');
  t = play(['S_2', 'H_2', 'D_2', 'C_2']);
  ok(near(t.mult, 7 * 1.2 ** 6), 'Hack retriggers the 2s: each of the first 3 gives X1.2 twice (X1.2^6)', t.total);
  ok(G.hand.config.card_limit === 8 + 1, '+1 hand size', G.hand.config.card_limit);
  void d;
});

// ------------------------------------------------------------------- Paldean Tauros: the breed
await sec('tauros', () => {
  // the roll: seeded, made when obtained; a shop card doesn't roll
  const seen = {};
  for (let i = 0; i < 24 && Object.keys(seen).length < 3; i++) {
    start('PTAU' + i, {}, { noBlind: true });
    const c = create_card('Joker', G.shop_jokers, null, null, true, null, 'j_poke_paldean_tauros'); flush();
    if (i === 0) {
      ok(!c.ability.poke_tauros_breed && /rolled when obtained/.test(plain(c)) && TYPES.get_type(c) === 'Fighting', 'a shop card: no breed yet (the Combat card, Fighting)', plain(c));
      const v = {}; view_card(c, v);
      ok(v.poke && v.poke.form === 'combat', 'a shop card shows the Combat card', v.poke);
    }
    c.remove(); flush();
    const t = add('j_poke_paldean_tauros');
    const b = t.ability.poke_tauros_breed;
    if (!seen[b]) seen[b] = 'PTAU' + i;
    start('PTAU' + i, {}, { noBlind: true });
    const t2 = add('j_poke_paldean_tauros');
    ok(t2.ability.poke_tauros_breed === b, 'the breed is the run\'s seeded roll (same seed, same breed)', [b, t2.ability.poke_tauros_breed]);
  }
  ok(seen.combat && seen.blaze && seen.aqua, 'all three breeds roll', seen);
  const TYPE = { combat: 'Fighting', blaze: 'Fire', aqua: 'Water' };
  const FORM = { blaze: { x: 8, y: 6 }, aqua: { x: 10, y: 6 } };
  for (const b of ['combat', 'blaze', 'aqua']) {
    if (!seen[b]) continue;
    start(seen[b], {}, { noBlind: true });
    const d0 = G.GAME.round_resets.discards, h0 = G.GAME.round_resets.hands;
    const t = add('j_poke_paldean_tauros');
    ok(t.ability.poke_tauros_breed === b && TYPES.get_type(t) === TYPE[b] && ex(t).ptype === TYPE[b], b + ': its type follows the breed (' + TYPE[b] + ')', [TYPES.get_type(t)]);
    const v = {}; view_card(t, v);
    ok(v.poke.form === b && (b === 'combat' ? !GEN9_FORM_SPRITES.j_poke_paldean_tauros.combat : GEN9_FORM_SPRITES.j_poke_paldean_tauros[b].x === FORM[b].x), b + ': its card is the breed\'s', v.poke.form);
    ok(new RegExp('Breed: ' + b[0].toUpperCase() + b.slice(1) + ' Breed').test(plain(t)), b + ': its text names the breed', plain(t));
    ok(G.GAME.round_resets.discards === d0 + (b === 'blaze' ? 1 : 0) && G.GAME.round_resets.hands === h0 + (b === 'aqua' ? 1 : 0), b + ': ' + (b === 'blaze' ? '+1 discard' : b === 'aqua' ? '+1 hand' : 'no perk'),
      [G.GAME.round_resets.discards - d0, G.GAME.round_resets.hands - h0]);
    act({ type: 'select_blind' }); flush(); clearHand();
    const face = play(['S_K', 'H_K']), hearts = play(['H_7', 'D_7']), clubs = play(['C_7', 'S_7']);
    if (b === 'combat') ok(near(face.mult, 2 * 1.44) && near(hearts.mult, 2) && near(clubs.mult, 2), 'Combat: scored face cards X1.2 each, Hearts / Clubs nothing', [face.total, hearts.total]);
    if (b === 'blaze') ok(near(face.mult, 2 * 1.2) && near(hearts.mult, 2 * 1.2) && near(clubs.mult, 2), 'Blaze: scored Hearts X1.2 (the K of Hearts too), Clubs nothing', [face.total, hearts.total, clubs.total]);
    if (b === 'blaze') ok(G.GAME.current_round.discards_left === d0 + 1, 'Blaze: the round starts with the extra discard', G.GAME.current_round.discards_left);
    if (b === 'aqua') ok(near(face.mult, 2) && near(hearts.mult, 2) && near(clubs.mult, 2 * 1.2), 'Aqua: scored Clubs X1.2, the rest nothing', [face.total, clubs.total]);
    t.remove(); flush();
    ok(G.GAME.round_resets.discards === d0 && G.GAME.round_resets.hands === h0, b + ': sold, the perk is taken back', [G.GAME.round_resets.discards - d0, G.GAME.round_resets.hands - h0]);
    const t3 = add('j_poke_paldean_tauros');
    ok(t3.ability.poke_tauros_breed && TAUROS_ok(t3), 'another one rolls its own breed (and a type to match)', t3.ability.poke_tauros_breed);
  }
  // Kanto Tauros is untouched
  ok(C('tauros').rarity === 2 && C('taurosh').ptype === 'Colorless' && fam('tauros') === 'tauros,taurosh', 'Kanto Tauros and Tauros (Herd): unchanged');
});
function TAUROS_ok(t) { return TYPES.get_type(t) === { combat: 'Fighting', blaze: 'Fire', aqua: 'Water' }[t.ability.poke_tauros_breed]; }

// ------------------------------------------------------------------- Paldean Wooper -> Clodsire
await sec('wooper', () => {
  const [w] = fresh('PWOO', ['paldean_wooper']);
  let t = play(['S_A']);
  ok(count('m_poke_hazard') === 0 && near(t.mult, 1), 'no Hazard in the deck: nothing', t.total);
  G.GAME.probabilities.normal = 6; // (1 in 6 -> always)
  const d = discard(['S_2', 'S_3', ['S_4', 'm_bonus']]);
  ok(key(d.cards[0]) === 'm_poke_hazard' && key(d.cards[1]) === 'm_poke_hazard' && key(d.cards[2]) === 'm_bonus',
    'Poison Point: the two unenhanced discarded cards become Hazards; the Bonus card never rolls', d.cards.map(key));
  G.GAME.probabilities.normal = 1;
  ok(/Currently \+4 Mult/.test(plain(w)) && /1 in 6/.test(plain(w)), 'its text: 1 in 6, +4 Mult', plain(w));
  t = play(['S_A']);
  ok(near(t.mult, 1 + 2 * 2), '+2 Mult per Hazard card in the full deck (2)', t.total);
  ex(w).num = 0;
  discard(['H_2']);
  ok(count('m_poke_hazard') === 2, 'a missed roll: no Hazard', count('m_poke_hazard'));
  ex(w).num = 1;
  rounds(5);
  ok(key(w) === 'j_poke_clodsire' && TYPES.get_type(w) === 'Dark', 'Paldean Wooper -> Clodsire after 5 rounds', key(w));
  const n = count('m_poke_hazard');
  t = play(['S_A']);
  ok(near(t.mult, 1 + 0.05 * n), 'Clodsire: X1 + X0.05 per Hazard (' + n + ')', [n, t.total]);
  // Kanto Wooper's Dark-Energy route to Clodsire stays
  start('PWOO2');
  const kw = add('j_poke_wooper');
  use(add('c_poke_darkness_energy'), [kw]);
  ok(key(kw) === 'j_poke_clodsire', 'Kanto Wooper + a Dark Energy: Clodsire, as before', key(kw));
});

// ------------------------------------------------------------------- Energy at 1 / 2 / 3
await sec('energy', () => {
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const steps = (n, field, type, want, mods) => {
    start('HEN' + n + field, {}, { mods });
    const j = add(n.startsWith('j_') ? n : 'j_poke_' + n), got = [];
    for (let i = 0; i < 3; i++) { increment_energy(j, type); got.push(r4(ex(j)[field])); }
    ok(got.every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${field} ${want.join(' / ')}`, got);
    return j;
  };
  steps('hisuian_growlithe', 'chips', 'Earth', [52, 64, 76]);
  steps('hisuian_arcanine', 'Xmult', 'Earth', [3, 3.5, 4]);
  steps('hisuian_voltorb', 'mult', 'Grass', [8.4, 10.8, 13.2]);
  steps('hisuian_electrode', 'Xmult_mod', 'Grass', [0.18, 0.21, 0.24]);
  steps('j_nacho_hisuian_sneasel', 'mult', 'Fighting', [5.6, 7.2, 8.8], ['nacho']);
  steps('j_nacho_sneasler', 'Xmult', 'Fighting', [3.6, 4.2, 4.8], ['nacho']);
  const ty = steps('hisuian_typhlosion', 'Xmult_multi', 'Psychic', [1.3125, 1.375, 1.4375]); ok(ex(ty).scry === 2 && ex(ty).d_size === 1, 'H-Typhlosion: Foresight and the discard fixed');
  const sa = steps('hisuian_samurott', 'Xmult_multi', 'Dark', [1.26, 1.32, 1.38]); ok(ex(sa).strikes === 3 && ex(sa).hands === 1, 'H-Samurott: the retriggers and the hand fixed');
  steps('hisuian_lilligant', 'Xmult_mod', 'Fighting', [0.12, 0.14, 0.16]);
  steps('hisuian_braviary', 'Xmult', 'Psychic', [1.8, 2.1, 2.4]); steps('hisuian_braviary', 'Xmult2', 'Psychic', [3, 3.5, 4]);
  steps('hisuian_avalugg', 'chips', 'Earth', [260, 320, 380]); steps('hisuian_avalugg', 'chips2', 'Earth', [26, 32, 38]);
  const de = steps('hisuian_decidueye', 'Xmult_multi', 'Fighting', [1.26, 1.32, 1.38]); ok(ex(de).arrows === 3 && ex(de).h_size === 1, 'H-Decidueye: 3 arrows, +1 hand size fixed');
  start('HENTAU');
  const ta = add('j_poke_paldean_tauros'), tg = [];
  for (let i = 0; i < 3; i++) { increment_energy(ta, TYPES.get_type(ta)); tg.push(r4(ex(ta).Xmult_multi)); }
  ok(tg.join() === '1.26,1.32,1.38', 'Paldean Tauros + the Energy of its breed (' + TYPES.get_type(ta) + '): Xmult_multi 1.26 / 1.32 / 1.38', tg);
  const pw = steps('paldean_wooper', 'mult', 'Dark', [2.8, 3.6, 4.4]); ok(ex(pw).num === 1 && ex(pw).dem === 6, 'Paldean Wooper: the odds fixed');
  // the energized number plays: a 2-Energy Hisuian Growlithe's first hand gives +128 Chips
  const [g] = fresh('HENPLAY', ['hisuian_growlithe']);
  increment_energy(g, 'Earth'); increment_energy(g, 'Earth');
  const t = play(['S_K', 'H_K']);
  ok(t.chips === 30 + 128, 'energized twice: +64 Chips, doubled on the first hand', t.total);
  // carried through a branch: Bergmite (Water) + Water Energy, then the Earth Energy -> H-Avalugg +260 Chips
  start('HENBR');
  const bm = add('j_poke_bergmite');
  use(add('c_poke_water_energy'), [bm]);
  use(add('c_poke_earth_energy'), [bm]);
  ok(key(bm) === 'j_poke_hisuian_avalugg' && near(ex(bm).chips, 260) && near(ex(bm).chips2, 26), 'Bergmite (1 Energy) -> H-Avalugg: +260 Chips, held Stone +26', [key(bm), ex(bm).chips, ex(bm).chips2]);
});

// ------------------------------------------------------------------- old-rev replay: the branch Energy and Sneasel as recorded
await sec('old-rev replay', () => {
  const deck = { name: 'Hisui', mods: ['pokermon', 'nacho'], params: { blind_scaling: 0.05 }, consumables: [{ key: 'c_poke_psychic_energy' }],
    jokers: [{ key: 'j_poke_quilava' }, { key: 'j_nacho_hisuian_sneasel' }] };
  const record = (seed, pins) => {
    const s = new Session();
    PINS.RULES.pins = pins;
    try {
      s.start({ seed, mods: ['pokermon', 'nacho'], customDeck: deck });
      s.act({ type: 'select_blind' }); flush();
      const en = G.consumeables.cards.find((c) => key(c) === 'c_poke_psychic_energy');
      s.act({ type: 'use', id: en.sort_id, targets: [], joker_targets: [G.jokers.cards[0].sort_id] }); flush();
      for (let b = 0; b < 2; b++) {
        if (G.STATE === STATES.SELECTING_HAND) { s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 2).map((c) => c.sort_id) }); s.act({ type: 'discard' }); flush(); }
        for (let i = 0; i < 4 && G.STATE === STATES.SELECTING_HAND; i++) { s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush(); }
        if (G.STATE === STATES.ROUND_EVAL) { s.act({ type: 'cash_out' }); flush(); }
        if (G.STATE === STATES.SHOP) { s.act({ type: 'next_round' }); flush(); }
        if (G.STATE === STATES.BLIND_SELECT) { s.act({ type: 'select_blind' }); flush(); }
      }
    } finally { PINS.RULES.pins = null; }
    return s;
  };
  const y = () => G.jokers.cards.map(key).join();
  const snap = () => ({ jokers: y(), chips: String(G.GAME.chips), round: G.GAME.round, dollars: G.GAME.dollars, cons: G.consumeables.cards.length });
  record('HISUIREC', null);
  const live = snap();
  ok(live.jokers === 'j_poke_hisuian_typhlosion,j_nacho_hisuian_sneasel', 'live: the Psychic Energy makes Hisuian Typhlosion', live);
  const sOld = record('HISUIREC', OLD);
  const wantOld = snap();
  ok(wantOld.jokers === 'j_poke_quilava,j_nacho_hisuian_sneasel' && wantOld.cons === 1, 'the same moves on the old rules: Quilava stays (the Energy refused, still held)', wantOld);
  const recOld = JSON.parse(JSON.stringify(sOld.recipe));
  recOld.modVersions.pokermon = OLD.pokermon; recOld.modVersions.nacho = OLD.nacho;
  ok(Session.pinDiff(recOld).length === 2, 'an old-rev recipe differs from the current pins (the resume prompt)', Session.pinDiff(recOld));
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(recOld)), { repin: true }); flush();
  const gotOld = snap();
  ok(!r.stoppedAt && JSON.stringify(gotOld) === JSON.stringify(wantOld), 'resumed: every old move replays on the old rules (Quilava, Sneasel without its Mult, the same score)', { wantOld, gotOld });
  const st = Session.stepper(JSON.parse(JSON.stringify(recOld)));
  st.seek(st.total); flush();
  ok(!st.error && st.index === recOld.actions.length && y() === 'j_poke_quilava,j_nacho_hisuian_sneasel', 'the replay stepper: the same', [st.error, y()]);
});

// ------------------------------------------------------------------- save / resume
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'HISUIRES', customDeck: { name: 'Hisui', mods: ['pokermon', 'nacho'], params: { blind_scaling: 0.05 },
    cards: [['S_J', 0, 0, 0, 12], ['H_9', 'm_poke_seed', 0, 0, 10], ['D_5', 'm_stone', 0, 0, 6], ['C_2', 0, 0, 0, 12], ['H_7', 0, 0, 0, 12]],
    consumables: [{ key: 'c_poke_fighting_energy' }],
    jokers: [{ key: 'j_poke_petilil' }, { key: 'j_poke_paldean_tauros' }, { key: 'j_poke_hisuian_growlithe' }, { key: 'j_poke_paldean_wooper' }, { key: 'j_nacho_hisuian_sneasel' }] } });
  s.act({ type: 'select_blind' }); flush();
  const en = G.consumeables.cards.find((c) => key(c) === 'c_poke_fighting_energy'), pe = G.jokers.cards[0];
  s.act({ type: 'use', id: en.sort_id, targets: [], joker_targets: [pe.sort_id] }); flush();
  ok(key(pe) === 'j_poke_hisuian_lilligant', 'the run: Petilil + its Fighting Energy -> Hisuian Lilligant');
  for (let b = 0; b < 3; b++) {
    if (G.STATE === STATES.SELECTING_HAND) { s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 3).map((c) => c.sort_id) }); s.act({ type: 'discard' }); flush(); }
    for (let i = 0; i < 3 && G.STATE === STATES.SELECTING_HAND; i++) { s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush(); }
    if (G.STATE === STATES.ROUND_EVAL) { s.act({ type: 'cash_out' }); flush(); }
    if (G.STATE === STATES.SHOP) { s.act({ type: 'next_round' }); flush(); }
    if (G.STATE === STATES.BLIND_SELECT) { s.act({ type: 'select_blind' }); flush(); }
  }
  const look = () => ({
    jokers: G.jokers.cards.map((j) => [key(j), j.ability.poke_tauros_breed || null, TYPES.get_type(j), ex(j).rounds]),
    hazards: count('m_poke_hazard'), deck: G.playing_cards.length, discards: G.GAME.round_resets.discards, hands: G.GAME.round_resets.hands,
    chips: String(G.GAME.chips), dollars: G.GAME.dollars, round: G.GAME.round,
  });
  const want = look();
  ok(want.round >= 3 && want.jokers[1][1], 'the run: 3 rounds, Tauros has its breed', want);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  const got = look();
  ok(!r.stoppedAt && JSON.stringify(got) === JSON.stringify(want), 'resume: the branch, the breed (its type and perk), the Hazards and the score come back the same', { want, got });
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
    const cells = NEW.map((n) => [n, sheet(C(n).atlas), C(n).pos.x, C(n).pos.y, C(n).ptype]);
    cells.push(['paldean_tauros blaze', 'AtlasJokersBasicGen01', 8, 6, 'Fire'], ['paldean_tauros aqua', 'AtlasJokersBasicGen01', 10, 6, 'Water']);
    for (const k of ['j_nacho_hisuian_sneasel', 'j_nacho_sneasler']) { const c = C(k); cells.push([k, sheet(c.atlas), c.pos.x, c.pos.y, c.ptype]); }
    for (const [n, sh, x, y, want] of cells) { const r = typer.typeOfEntry({ atlas: sh, pos: [x, y] }); if (!r || r.ptype !== want) bad.push([n, want, r && r.ptype]); }
    ok(!bad.length, 'each card (the 12, both Tauros breeds\' cells, Nacho\'s two) is the type its 3.9.1 card shows', bad);
  });
} else console.log('(Pokermon art not on disk: the art type checks are skipped; set MICATRO_MAIN)');

done();
