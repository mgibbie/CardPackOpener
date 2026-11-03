// Gen 8, batch 3 (the owner's "yes build it and merge when the gate passes", 2026-11-02; jokers/pokejokers_designs.js "Gen 8, batch 3";
// PORTING.md "Gen 8, batch 3"): 21 jokers, #862-902, including SIX NEW EVOLUTIONS of existing jokers (owner-approved exception to "base
// Pokermon wins"; gated by Pokermon rules rev 72, so runs recorded before it replay as recorded):
//   Linoone -> Obstagoon (a Dark Energy used on it)         Obstagoon X2, X3 while the Boss Blind debuffs any of your cards.
//   Corsola -> Cursola (a Psychic Energy)                   Perish Body: X3, crumbles at the end of its 4th round held.
//   Farfetch'd -> Sirfetch'd (3 Lucky triggers in a round)  Meteor Assault: X1 + X0.5 per Lucky trigger this round.
//   Mr. Mime -> Mr. Rime (a Water Energy)                   Screen Cleaner: the Boss Blind's ability is off on your final hand.
//   Yamask -> Runerigus instead of Cofagrigus (10 Stones)   Wandering Spirit: scored Stone X1.25; keeps Yamask's grudge X.
//   Basculin -> Basculegion (25 cards of its stripe)        Last Respects: X1 + X0.1 per Joker sold or destroyed this run.
//   Milcery -> Alcremie (Fairy)        Decorate: edition cards +5 Mult; Alcremie's Whipped Cream: a deck card Foil / Holo each Blind.
//   Falinks (Fighting)                 Formation: +6 Mult per scored card if all share a suit.
//   Pincurchin (Lightning)             X1 + X0.25 per Lightning Energy used this run.
//   Snom -> Frosmoth (Water)           scored Glass +6 Mult; held Glass X1.2.
//   Eiscue (Water)                     Ice Face X2.5 / Noice Face X1.25 (broken by a failed first hand, re-formed in a Snowy round).
//   Indeedee (Psychic)                 ♂ X1.5 + 1 consumable slot; ♀ $2 per Tarot used.
//   Morpeko (Lightning)                Hunger Switch: +20 Mult / X2, alternating every hand.
//   Cufant -> Copperajah (Metal)       +10 Chips per Steel card in the deck; held Steel $1 each at end of round.
//   Dracozolt / Arctozolt / Dracovish / Arctovish: Ancient Jacks.
// Every ability is FIRED through real hands / rounds with exact numbers.
//   node micatro/tests/mods/pokermon_gen8_batch3_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list, get_highest_evo, can_evolve_to_highest } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { get_type } from '../../mods/pokermon/systems/types.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import * as ANIM from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import * as DES from '../../mods/pokermon/jokers/pokejokers_designs.js';
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
const NEW = ['obstagoon', 'cursola', 'sirfetchd', 'mrrime', 'runerigus', 'milcery', 'alcremie', 'falinks', 'pincurchin', 'snom', 'frosmoth', 'eiscue',
  'indeedee', 'morpeko', 'cufant', 'copperajah', 'dracozolt', 'arctozolt', 'dracovish', 'arctovish', 'basculegion'];
const R71 = { pokermon: '3.9.1+r71' };
const oldRules = (fn) => { PINS.RULES.pins = R71; try { return fn(); } finally { PINS.RULES.pins = null; } };
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function mk(spec, area) {
  const s = typeof spec === 'string' ? { k: spec } : spec;
  return create_playing_card({ front: P_CARDS[s.k], center: P_CENTERS[s.center || 'c_base'] }, area);
}
/** Put cards in hand: a list of keys, or [key, center] pairs (the first is the leftmost). */
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list`; the round never ends by accident. */
function play(list) {
  clearHand();
  const cs = cards(list);
  return playCards(cs);
}
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
/** Make the Blind on deck the Boss. */
function setBoss(boss = 'bl_wall') {
  const rr = G.GAME.round_resets;
  rr.blind_states.Small = 'Defeated'; rr.blind_states.Big = 'Defeated'; rr.blind_states.Boss = 'Select';
  rr.blind_choices.Boss = boss;
  G.GAME.blind_on_deck = 'Boss';
}
/** A fresh run with these jokers and the first Blind selected. */
function fresh(seed, jokers, boss) {
  start(seed, {}, { noBlind: true });
  const js = jokers.map((k) => add(k.startsWith('j_') ? k : 'j_poke_' + k));
  if (boss) setBoss(boss);
  act({ type: 'select_blind' }); flush();
  clearHand();
  return js;
}
/** Use a consumable (on the picked jokers, if any). */
const use = (c, jokers) => { const r = act({ type: 'use', id: c.sort_id, targets: [], joker_targets: jokers ? jokers.map((j) => j.sort_id) : undefined }); flush(); return r; };
const face = (j, shiny) => {
  const v = {}; view_card(j, v);
  return POKE_UI.face({ center: key(j), facing: 'front', poke: v.poke, atlas: j.config.center.atlas, pos: j.config.center.pos, ...(shiny ? { edition: 'poke_shiny' } : {}) }, { area: 'jokers' });
};
const drawn = (j) => { const f = face(j); return f ? [f.atlas, JSON.stringify(f.pos)] : [j.config.center.atlas, JSON.stringify(j.config.center.pos)]; };
const GEN8 = 'poke_AtlasJokersBasicGen08391';
const N = 'poke_AtlasJokersBasicNatdex391';
const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();

// ------------------------------------------------------------------- pin, static data, order, families, Energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 72 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 72+ (Gen 8 batch 3)', PINS.modPin('pokermon'));
  for (const n of NEW) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs');
  }
  const hits = [];
  const re = new RegExp('\\b(' + NEW.join('|') + ')\\b', 'i');
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the 21 (nothing to dedupe)', hits);
});
await sec('static', () => {
  start('G8B3S');
  const S = 'poke_safari';
  // [rarity, cost, stage, type, rounds|undefined, atlas, x, y]
  const WANT = {
    obstagoon: [S, 10, 'Two', 'Dark', undefined, N, 12, 57], cursola: [S, 8, 'One', 'Psychic', undefined, N, 16, 57], sirfetchd: [S, 8, 'One', 'Fighting', undefined, N, 18, 57],
    mrrime: [S, 8, 'One', 'Water', undefined, N, 20, 57], runerigus: [S, 8, 'One', 'Psychic', undefined, N, 22, 57],
    milcery: [1, 5, 'Basic', 'Fairy', 5, N, 24, 57], alcremie: [S, 8, 'One', 'Fairy', undefined, GEN8, 10, 0],
    falinks: [3, 7, 'Basic', 'Fighting', undefined, N, 28, 57], pincurchin: [3, 7, 'Basic', 'Lightning', undefined, N, 0, 58],
    snom: [1, 5, 'Basic', 'Water', 5, N, 2, 58], frosmoth: [S, 8, 'One', 'Water', undefined, N, 4, 58],
    eiscue: [3, 7, 'Basic', 'Water', undefined, GEN8, 8, 8], indeedee: [3, 7, 'Basic', 'Psychic', undefined, GEN8, 12, 8], morpeko: [3, 7, 'Basic', 'Lightning', undefined, GEN8, 0, 9],
    cufant: [1, 5, 'Basic', 'Metal', 5, N, 14, 58], copperajah: [S, 8, 'One', 'Metal', undefined, N, 16, 58],
    dracozolt: [3, 7, 'Basic', 'Lightning', undefined, N, 18, 58], arctozolt: [3, 7, 'Basic', 'Lightning', undefined, N, 20, 58],
    dracovish: [3, 7, 'Basic', 'Water', undefined, N, 22, 58], arctovish: [3, 7, 'Basic', 'Water', undefined, N, 24, 58],
    basculegion: [S, 8, 'One', 'Psychic', undefined, GEN8, 2, 11],
  };
  ok(Object.keys(WANT).length === 21 && NEW.length === 21, '21 jokers');
  for (const [n, [rarity, cost, stage, type, rnds, atlas, x, y]] of Object.entries(WANT)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === type && c.config.extra.ptype === type && c.gen === 8,
      `${n}: ${rarity} $${cost}, ${stage}, ${type}, Gen 8`, [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.config.extra.rounds === rnds, `${n}: ${rnds ? 'evolves after ' + rnds + ' rounds' : 'no round timer'}`, c.config.extra.rounds);
    ok(c.atlas === atlas && c.pos.x === x && c.pos.y === y && !c.soul_pos, `${n}: upstream 3.9.1 cell ${atlas} {${x},${y}} (nothing to deploy)`, [c.atlas, c.pos]);
  }
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const run = (list, to) => { const i = keys.indexOf('j_poke_' + list[0]); return i > 0 && [...list, to].every((k, n) => keys[i + n] === 'j_poke_' + k) ? true : keys.slice(i - 1, i + list.length + 1); };
  const chain = ['obstagoon', 'cursola', 'sirfetchd', 'mrrime', 'runerigus', 'milcery', 'alcremie', 'falinks', 'pincurchin', 'snom', 'frosmoth', 'eiscue', 'indeedee', 'morpeko',
    'cufant', 'copperajah', 'dracozolt', 'arctozolt', 'dracovish', 'arctovish'];
  ok(run(chain, 'dreepy') === true, 'Pokédex order: Obstagoon (862) ... Arctovish (883), then Dreepy (885)', run(chain, 'dreepy'));
  ok(keys[keys.indexOf('j_poke_obstagoon') - 1] === 'j_poke_grimmsnarl' || keys[keys.indexOf('j_poke_obstagoon') - 1] === 'j_poke_barraskewda', 'Obstagoon right after the last Gen 8 joker before it', keys[keys.indexOf('j_poke_obstagoon') - 1]);
  ok(run(['ursaluna', 'basculegion'], 'sprigatito') === true, 'Pokédex order: Ursaluna (901), Basculegion (902), Sprigatito (906)', run(['ursaluna', 'basculegion'], 'sprigatito'));
  const FAM = {
    linoone: 'zigzagoon,linoone,obstagoon', corsola: 'corsola,cursola', farfetchd: 'farfetchd,sirfetchd', mrmime: 'mimejr,mrmime,mrrime',
    yamask: 'yamask,cofagrigus,runerigus', basculin: 'basculin,basculegion', milcery: 'milcery,alcremie', snom: 'snom,frosmoth', cufant: 'cufant,copperajah',
  };
  for (const [n, f] of Object.entries(FAM)) ok(fam(n) === f, 'family: ' + f, fam(n));
  ok(['falinks', 'pincurchin', 'eiscue', 'indeedee', 'morpeko', 'dracozolt', 'arctozolt', 'dracovish', 'arctovish'].every((n) => fam(n) === '' || fam(n) === n), 'the single-stage ones have no line');
  ok(NEW.filter((n) => C(n).poke_no_energy_field).sort().join() === 'copperajah,mrrime', 'Energy-inert: Mr. Rime (no number) and Copperajah ($ fixed); every other one has a main number');
  ok(['perish_rounds', 'steel_money', 'tarot_money', 'card_limit', 'ancient_money', 'retriggers', 'hands', 'rounds'].every((f) => !(f in energy_values)), 'fixed: the countdown, the $, the slot, retriggers, the hand');
  // the old lines' own data is unchanged
  ok(C('linoone').stage === 'One' && C('linoone').rarity === 2 && C('linoone').cost === 5 && C('corsola').rarity === 3 && C('corsola').cost === 7
    && C('farfetchd').cost === 7 && C('mrmime').cost === 8 && C('yamask').cost === 5 && C('basculin').rarity === 3 && C('basculin').cost === 7, 'the evolving upstream / owner jokers keep their rarity, cost and stage');
});

// ------------------------------------------------------------------- Energy-triggered evolutions: Linoone / Corsola / Mr. Mime
await sec('energy evolutions', () => {
  // Linoone + a Dark Energy, picked: Obstagoon
  start('GALAR1');
  let l = add('j_poke_linoone');
  let en = add('c_poke_darkness_energy');
  let r = use(en, [l]);
  ok(r && r.ok !== false && key(l) === 'j_poke_obstagoon' && get_type(l) === 'Dark', 'Linoone + a Dark Energy (picked): evolves into Obstagoon (Dark)', [key(l), r && r.ok]);
  ok(!G.consumeables.cards.includes(en), 'the Energy is used up');
  ok(/Galarian form: a Dark Energy used on it evolves it into Obstagoon/.test(plain(add('j_poke_linoone'))), 'Linoone\'s text: its 3.9.1 box, then the Galarian box');
  // nothing picked: the leftmost joker the Energy can ENERGIZE first; else the leftmost it evolves
  start('GALAR2');
  l = add('j_poke_linoone'); const dk = add('j_poke_sandile');
  en = add('c_poke_darkness_energy'); use(en);
  ok(key(l) === 'j_poke_linoone' && ex(dk).energy_count === 1, 'nothing picked, a Dark joker held: it energizes the Dark joker (Linoone stays)', [key(l), ex(dk).energy_count]);
  dk.remove(); flush();
  en = add('c_poke_darkness_energy'); use(en);
  ok(key(l) === 'j_poke_obstagoon', 'nothing picked, no Dark joker: it evolves the leftmost Linoone', key(l));
  // refused: another type, a debuffed Linoone, an Everstone, the old rules
  start('GALAR3');
  l = add('j_poke_linoone');
  en = add('c_poke_water_energy');
  r = use(en, [l]);
  ok(key(l) === 'j_poke_linoone' && G.consumeables.cards.includes(en), 'a Water Energy on Linoone: refused (nothing happens)', key(l));
  en.remove(); flush();
  en = add('c_poke_darkness_energy');
  debuff(l);
  use(en, [l]);
  ok(key(l) === 'j_poke_linoone' && G.consumeables.cards.includes(en), 'a debuffed Linoone: refused', key(l));
  l.ability.debuff_sources = {}; l.set_debuff(); flush();
  const es = add('j_poke_everstone');
  use(en, [l]);
  ok(key(l) === 'j_poke_linoone' && G.consumeables.cards.includes(en), 'an Everstone owned: refused (it blocks every evolution)', key(l));
  es.remove(); flush();
  oldRules(() => { use(en, [l]); });
  ok(key(l) === 'j_poke_linoone' && G.consumeables.cards.includes(en), 'a move recorded on r71: refused, as it was', key(l));
  use(en, [l]);
  ok(key(l) === 'j_poke_obstagoon', '... live (r72): evolves', key(l));
  // Corsola + Psychic: Cursola, its Water Energy re-applied (X3 -> X3.6)
  start('GALAR4');
  const co = add('j_poke_corsola');
  increment_energy(co, 'Water');
  use(add('c_poke_psychic_energy'), [co]);
  ok(key(co) === 'j_poke_cursola' && ex(co).energy_count === 1 && near(ex(co).Xmult, 3.6), 'Corsola (1 Water Energy) + a Psychic Energy: Cursola, X3.6 (the Energy carries)', [key(co), ex(co).Xmult]);
  // Mr. Mime + Water: Mr. Rime
  const mm = add('j_poke_mrmime');
  use(add('c_poke_water_energy'), [mm]);
  ok(key(mm) === 'j_poke_mrrime', 'Mr. Mime + a Water Energy: Mr. Rime', key(mm));
  // the order: energize first (a matching Tera sticker: Psychic on Corsola), then evolve (the new Energy re-applied to Cursola's X)
  start('GALAR5');
  const c2 = add('j_poke_corsola');
  c2.ability.psychic_sticker = true;
  use(add('c_poke_psychic_energy'), [c2]);
  ok(key(c2) === 'j_poke_cursola' && ex(c2).energy_count === 1 && near(ex(c2).Xmult, 3.6), 'a Psychic-Tera Corsola: the Energy energizes it first, then it evolves (Cursola X3.6)', [key(c2), ex(c2).energy_count, ex(c2).Xmult]);
  // Transformation / Eevee see the new lines only on r72
  start('GALAR6');
  const l3 = add('j_poke_linoone'), y3 = add('j_poke_yamask'), b3 = add('j_poke_basculin');
  ok(can_evolve_to_highest(l3) && get_highest_evo(l3) === 'obstagoon' && can_evolve_to_highest(b3) && get_highest_evo(b3) === 'basculegion', 'r72: Linoone\'s / Basculin\'s highest form is Obstagoon / Basculegion (Transformation)');
  ok(['cofagrigus', 'runerigus'].includes(get_highest_evo(y3)), 'r72: Yamask\'s highest: Cofagrigus or Runerigus', get_highest_evo(y3));
  oldRules(() => {
    ok(!can_evolve_to_highest(l3) && !can_evolve_to_highest(b3) && get_highest_evo(y3) === 'cofagrigus' && fam('linoone') === 'zigzagoon,linoone' && fam('mrmime') === 'mimejr,mrmime',
      'r71: Linoone / Basculin can\'t evolve, Yamask only into Cofagrigus, the lines without their new members (Transformation, Eevee replay as recorded)');
  });
});

// ------------------------------------------------------------------- Obstagoon
await sec('obstagoon', () => {
  const [o] = fresh('OBST', ['obstagoon']);
  let t = play(['S_A']);
  ok(near(t.mult, 2), 'Obstagoon: X2 (Small Blind)', t.total);
  const [o2] = fresh('OBST2', ['obstagoon'], 'bl_club');
  ok(G.GAME.blind.boss && G.GAME.blind.name === 'The Club', 'The Club (Boss: debuffs Clubs)', G.GAME.blind.name);
  ok(G.playing_cards.some((c) => c.debuff), 'some Clubs in the deck are debuffed');
  t = play(['S_A']);
  ok(near(t.mult, 3), 'Obstagoon: X3 while the Boss Blind debuffs your cards', t.total);
  ok(/Now: Blocking!/.test(plain(o2)), 'its text says so', plain(o2));
  G.GAME.blind.disable(); flush();
  t = play(['S_A']);
  ok(near(t.mult, 2), 'the Boss disabled: X2 again', t.total);
  void o;
});

// ------------------------------------------------------------------- Cursola: Perish Body
await sec('cursola', () => {
  const [c, j] = fresh('CURS', ['cursola', 'j_joker']);
  let t = play(['S_A']);
  ok(near(t.mult, 1 * 3 + 4), 'Cursola: X3 (then Joker +4)', t.total);
  const gone0 = G.GAME.poke_jokers_gone || 0;
  rounds(3);
  ok(G.jokers.cards.includes(c) && ex(c).perish_rounds === 1 && /Rounds left: 1/.test(plain(c)), 'after 3 rounds: still held, 1 left', ex(c).perish_rounds);
  endRound(); flush();
  ok(!G.jokers.cards.includes(c) && G.jokers.cards.includes(j), 'the end of its 4th round: it crumbles (destroyed)', G.jokers.cards.map(key));
  ok((G.GAME.poke_jokers_gone || 0) === gone0 + 1, 'it counts as a Joker destroyed (Last Respects)', G.GAME.poke_jokers_gone);
  const [e] = fresh('CURS2', ['cursola']);
  e.ability.eternal = true;
  rounds(5);
  ok(G.jokers.cards.includes(e) && ex(e).perish_rounds === 0, 'an Eternal Cursola never crumbles', ex(e).perish_rounds);
});

// ------------------------------------------------------------------- Farfetch'd -> Sirfetch'd: Lucky triggers
await sec('sirfetchd', () => {
  const [f] = fresh('FARF', ['farfetchd']);
  G.GAME.probabilities.normal = 15; // (every Lucky roll hits: 2 triggers a card)
  play([['S_A', 'm_lucky']]);
  ok(/This round: 2\/3/.test(plain(f)), 'one Lucky card hitting both rolls: 2 triggers this round', plain(f));
  endRound(); advance();
  ok(key(f) === 'j_poke_farfetchd', '2 triggers: no evolution', key(f));
  play([['S_A', 'm_lucky']]); play([['S_K', 'm_lucky']]);
  endRound(); flush();
  ok(key(f) === 'j_poke_sirfetchd', '4 triggers in a round: Farfetch\'d -> Sirfetch\'d at the end of it', key(f));
  advance();
  G.GAME.probabilities.normal = 15;
  let t = play(['S_A']);
  ok(near(t.mult, 1), 'Sirfetch\'d: no Lucky trigger this round, X1', t.total);
  t = play([['S_A', 'm_lucky']]);
  // the Lucky card: +20 Mult (1 + 20), then X(1 + 0.5 x 2)
  ok(near(t.mult, (1 + 20) * 2), 'one Lucky card (2 triggers): +20 Mult, then X2', t.total);
  t = play([['S_A', 'm_lucky']]);
  ok(near(t.mult, (1 + 20) * 3), 'the round\'s count goes on: 4 triggers, X3', t.total);
  endRound(); advance();
  t = play(['S_A']);
  ok(near(t.mult, 1), 'a new round: back to X1', t.total);
  // r71: no evolution
  const [f2] = fresh('FARF2', ['farfetchd']);
  G.GAME.probabilities.normal = 15;
  play([['S_A', 'm_lucky']]); play([['S_K', 'm_lucky']]);
  oldRules(() => endRound());
  ok(key(f2) === 'j_poke_farfetchd', 'a move recorded on r71: Farfetch\'d doesn\'t evolve', key(f2));
  // upstream Farfetch'd unchanged: the Leek, its $4 roll
  start('FARF3');
  const f3 = add('j_poke_farfetchd');
  ok(G.consumeables.cards.some((c) => key(c) === 'c_poke_leek'), 'Farfetch\'d still brings its Leek');
  const d0 = G.GAME.dollars;
  use(G.consumeables.cards.find((c) => key(c) === 'c_poke_leek'));
  ok(G.GAME.dollars >= d0 + 4, 'a Leek used: its $4 (unchanged)', [d0, G.GAME.dollars]);
  void f3;
});

// ------------------------------------------------------------------- Mr. Rime: the Boss Blind is off on the final hand
await sec('mr rime', () => {
  const [m] = fresh('RIME', ['mrrime'], 'bl_club');
  ok(G.GAME.blind.boss && G.GAME.blind.name === 'The Club' && !G.GAME.blind.suspended, 'The Club', G.GAME.blind.name);
  G.GAME.current_round.hands_left = 2;
  clearHand();
  const first = cards(['C_K', 'C_9']);
  for (const c of first) G.GAME.blind.debuff_card(c);
  ok(first.every((c) => c.debuff), 'not the final hand: the Clubs are debuffed');
  let t = playCards(first);
  ok(t.total && t.chips === 5, 'not the final hand: the Clubs are debuffed (5 Chips: High Card, nothing from them)', t.total);
  ok(G.GAME.current_round.hands_left === 1 && G.GAME.blind.suspended, 'the draw that leaves 1 hand: the Boss Blind\'s ability is off', [G.GAME.current_round.hands_left, G.GAME.blind.suspended]);
  ok(/active this hand/.test(plain(m)), 'its text says so', plain(m));
  clearHand();
  const cs = cards(['C_K', 'C_9']);
  for (const c of cs) G.GAME.blind.debuff_card(c);
  ok(cs.every((c) => !c.debuff) && G.playing_cards.filter((c) => c.base.suit === 'Clubs').every((c) => !c.debuff), 'the Clubs are not debuffed (in hand and in the deck)');
  G.GAME.chips = G.GAME.blind.chips;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' }); flush();
  const tot = ((r && r.events) || []).find((e) => e.type === 'hand_total') || {};
  ok(Number(tot.chips) === 5 + 10, 'the final hand: the Club King scores (+10 Chips)', tot);
  ok(!G.GAME.blind.suspended, 'after the final hand the Blind is back', G.GAME.blind.suspended);
  // no Mr. Rime: never suspended; Mr. Mime (upstream) still retriggers the leftmost held card
  fresh('RIME2', ['mrmime'], 'bl_club');
  G.GAME.current_round.hands_left = 2;
  playCards(cards(['S_K']));
  ok(G.GAME.current_round.hands_left === 1 && !G.GAME.blind.suspended, 'Mr. Mime: the final hand is not touched');
  // sold during the suspended final hand: the Blind comes back at once
  const [m3] = fresh('RIME3', ['mrrime'], 'bl_club');
  G.GAME.current_round.hands_left = 2;
  playCards(cards(['S_K']));
  ok(G.GAME.blind.suspended, 'suspended on the final hand');
  m3.remove(); flush();
  ok(!G.GAME.blind.suspended, 'Mr. Rime sold: the Blind is back', G.GAME.blind.suspended);
});

// ------------------------------------------------------------------- Yamask -> Runerigus (10 Stones) / Cofagrigus
await sec('runerigus', () => {
  const [y, j] = fresh('YAMA', ['yamask', 'j_joker']);
  // a grudge first: X1.1 banked
  act({ type: 'sell', id: j.sort_id }); flush();
  ok(near(ex(y).grudge_Xmult, 1.1), 'Yamask banks X1.1 (a Joker sold)', ex(y).grudge_Xmult);
  play([['S_K', 'm_stone'], ['S_Q', 'm_stone'], ['S_J', 'm_stone'], ['S_9', 'm_stone'], ['S_8', 'm_stone']]);
  play([['H_K', 'm_stone'], ['H_Q', 'm_stone'], ['H_J', 'm_stone'], ['H_9', 'm_stone']]);
  ok(ex(y).stones_scored === 9 && /Stone cards have scored: 9\/10/.test(plain(y)), '9 Stones scored', ex(y).stones_scored);
  play([['D_K', 'm_stone']]);
  ok(ex(y).stones_scored === 10, '10 Stones scored', ex(y).stones_scored);
  rounds(5);
  ok(key(y) === 'j_poke_runerigus' && near(ex(y).grudge_Xmult, 1.1), 'after 5 rounds: Runerigus (not Cofagrigus), the grudge X1.1 kept', [key(y), ex(y).grudge_Xmult]);
  let t = play([['S_K', 'm_stone'], ['S_Q', 'm_stone']]);
  ok(near(t.mult, 1 * 1.25 * 1.25 * 1.1), 'Runerigus: each scored Stone X1.25, then the grudge X1.1', t.total);
  // fewer than 10: Cofagrigus as ever
  const [y2] = fresh('YAMA2', ['yamask']);
  play([['S_K', 'm_stone'], ['S_Q', 'm_stone']]);
  rounds(5);
  ok(key(y2) === 'j_poke_cofagrigus', '2 Stones only: Yamask -> Cofagrigus (unchanged)', key(y2));
  // r71: Cofagrigus even with 10
  const [y3] = fresh('YAMA3', ['yamask']);
  play([['S_K', 'm_stone'], ['S_Q', 'm_stone'], ['S_J', 'm_stone'], ['S_9', 'm_stone'], ['S_8', 'm_stone']]);
  play([['H_K', 'm_stone'], ['H_Q', 'm_stone'], ['H_J', 'm_stone'], ['H_9', 'm_stone'], ['H_8', 'm_stone']]);
  rounds(4); oldRules(() => endRound());
  ok(key(y3) === 'j_poke_cofagrigus', 'a move recorded on r71: 10 Stones, still Cofagrigus', key(y3));
});

// ------------------------------------------------------------------- Basculin -> Basculegion; Last Respects
await sec('basculegion', () => {
  const [b] = fresh('BASC', ['basculin']);
  const suit = DES.STRIPES[DES.stripe_of(b)].suits[0][0];
  const flush5 = () => play(['A', 'K', 'Q', 'J', '9'].map((r) => suit + '_' + r));
  for (let i = 0; i < 4; i++) flush5();
  ok(ex(b).stripe_scored === 20, '20 cards of its stripe scored', ex(b).stripe_scored);
  endRound(); advance();
  ok(key(b) === 'j_poke_basculin', '20 (plus the round\'s winning 2, maybe): not yet', [key(b), ex(b).stripe_scored]);
  flush5();
  ok(ex(b).stripe_scored >= 25 && /suits have scored: 2\d\/25|suits have scored: 3\d\/25/.test(plain(b)), '25 or more', ex(b).stripe_scored);
  endRound(); flush();
  ok(key(b) === 'j_poke_basculegion' && get_type(b) === 'Psychic', 'Basculin -> Basculegion (Psychic) at the end of the round', key(b));
  // Last Respects: a run counter from the run's start (a late Basculegion counts every one)
  start('BASC2');
  const gone0 = G.GAME.poke_jokers_gone || 0;
  ok(gone0 === 0, 'a new run: 0 Jokers gone', gone0);
  const a = add('j_joker'), c = add('j_joker'), d = add('j_joker');
  act({ type: 'sell', id: a.sort_id }); flush();
  act({ type: 'sell', id: c.sort_id }); flush();
  d.start_dissolve(); flush();
  ok(G.GAME.poke_jokers_gone === 3, '2 sold + 1 destroyed = 3', G.GAME.poke_jokers_gone);
  const bg = add('j_poke_basculegion');
  const t = play(['S_A']);
  ok(near(t.mult, 1.3) && /Currently 3: X1.3 Mult/.test(plain(bg)), 'a Basculegion bought after: X1.3', [t.total, plain(bg)]);
  // an evolution is not a Joker gone
  const y = add('j_poke_wooloo');
  rounds(5);
  ok(key(y) === 'j_poke_dubwool' && G.GAME.poke_jokers_gone === 3, 'an evolution doesn\'t count', G.GAME.poke_jokers_gone);
  // r71: Basculin doesn't evolve
  const [b2] = fresh('BASC3', ['basculin']);
  ex(b2).stripe_scored = 30;
  oldRules(() => endRound());
  ok(key(b2) === 'j_poke_basculin', 'a move recorded on r71: Basculin doesn\'t evolve', key(b2));
});

// ------------------------------------------------------------------- Milcery / Alcremie: Decorate, Whipped Cream, the 63 forms
await sec('alcremie', () => {
  const [m] = fresh('MILC', ['milcery']);
  clearHand();
  const cs = cards(['S_A', 'H_A']);
  cs[0].set_edition({ foil: true }, true, true); cs[1].set_edition({ holo: true }, true, true);
  let t = playCards(cs);
  ok(near(t.mult, 2 + 5 + 10 + 5) && t.chips === 10 + 11 + 11 + 50, 'Milcery: each scored card with an edition +5 Mult (Foil +50 Chips, Holo +10 Mult)', t.total);
  t = play(['S_A']);
  ok(near(t.mult, 1), 'no edition: nothing', t.total);
  const noed = () => G.playing_cards.filter((c) => !c.edition).length;
  rounds(5);
  ok(key(m) === 'j_poke_alcremie', 'Milcery -> Alcremie after 5 rounds', key(m));
  const f = ex(m).form;
  ok(Number.isInteger(f) && f >= 0 && f < 63, 'Alcremie\'s form rolled: ' + f, f);
  ok(new RegExp(DES.ALCREMIE_SWEETS[Math.floor(f / 9)] + ' Sweet, ' + DES.ALCREMIE_CREAMS[f % 9]).test(plain(m)), 'its text names it', plain(m));
  const [atl, pos] = drawn(m);
  const want = f === 0 ? { x: 10, y: 0 } : ANIM.GEN8_FORM_SPRITES.j_poke_alcremie[f];
  ok(atl === GEN8 && pos === JSON.stringify(want), 'it is drawn as its form\'s cell', [atl, pos, want]);
  endRound(); const before = noed(); advance();
  ok(noed() === before - 1, 'Whipped Cream: a Blind selected, one card without an edition became Foil or Holographic', [before, noed()]);
  ok(G.playing_cards.filter((c) => c.edition && (c.edition.foil || c.edition.holo)).length >= 1, 'a Foil / Holo card in the deck');
  t = play(['S_A']);
  // the forms table: 62 cells beside {10,0}, all distinct
  const cells = Object.values(ANIM.GEN8_FORM_SPRITES.j_poke_alcremie).map((p) => p.x + ',' + p.y);
  ok(cells.length === 62 && new Set([...cells, '10,0']).size === 63 && cells.includes('12,0') && cells.includes('0,1') && cells.includes('14,7') && cells.includes('6,8'), '63 Alcremie cells, {10,0} ... {6,8}', cells.slice(0, 4));
  // Blueprint copies Whipped Cream
  start('MILC2', {}, { noBlind: true });
  add('j_poke_alcremie'); add('j_blueprint'); G.jokers.cards.reverse();
  const b0 = G.playing_cards.filter((c) => !c.edition).length;
  act({ type: 'select_blind' }); flush();
  ok(G.playing_cards.filter((c) => !c.edition).length === b0 - 2, 'Blueprint: a second card decorated', [b0, G.playing_cards.filter((c) => !c.edition).length]);
});

// ------------------------------------------------------------------- Falinks: Formation
await sec('falinks', () => {
  fresh('FALI', ['falinks']);
  let t = play(['S_A', 'S_K', 'S_Q', 'S_J', 'S_9']);
  ok(near(t.mult, 4 + 6 * 5), 'a Spade Flush: each of the 5 +6 Mult', t.total);
  t = play(['S_A', 'H_A']);
  ok(near(t.mult, 2), 'a Pair of mixed suits: nothing', t.total);
  t = play(['S_A', ['H_A', 'm_wild']]);
  ok(near(t.mult, 2 + 12), 'a Wild card fits: +6 each', t.total);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 6), 'one card shares its own suit: +6', t.total);
  t = play(['S_A', 'S_K', 'S_Q', 'S_J', ['S_9', 'm_stone']]);
  ok(near(t.mult, 1), 'a Stone card scores: it breaks the formation', t.total);
});

// ------------------------------------------------------------------- Pincurchin: Lightning Rod
await sec('pincurchin', () => {
  start('PINC');
  const pk = add('j_poke_pikachu');
  use(add('c_poke_lightning_energy'), [pk]); use(add('c_poke_lightning_energy'), [pk]);
  ok(ex(pk).energy_count === 2, '2 Lightning Energy used (on Pikachu)', ex(pk).energy_count);
  pk.remove(); flush();
  const p = add('j_poke_pincurchin');
  let t = play(['S_A']);
  ok(near(t.mult, 1.5), 'Pincurchin bought after: X1 + 2 x 0.25 = X1.5 (the run counts from its start)', t.total);
  use(add('c_poke_lightning_energy'), [p]);
  t = play(['S_A']);
  ok(near(ex(p).Xmult_mod, 0.3) && near(t.mult, 1 + 0.3 * 3), 'a third used on Pincurchin itself: energized (0.3 each), X1.9', [ex(p).Xmult_mod, t.total]);
  use(add('c_poke_water_energy'));
  ok(/Currently 3: X1.9 Mult/.test(plain(p)), 'other Energy doesn\'t count', plain(p));
});

// ------------------------------------------------------------------- Snom / Frosmoth: Glass
await sec('snom', () => {
  const [s] = fresh('SNOM', ['snom']);
  let t = play([['S_A', 'm_glass'], ['H_A', 'm_glass']]);
  ok(near(t.mult, (2 * 2 + 6) * 2 + 6), 'Snom: each scored Glass +6 Mult (after its own X2)', t.total);
  rounds(5);
  ok(key(s) === 'j_poke_frosmoth', 'Snom -> Frosmoth after 5 rounds', key(s));
  clearHand();
  const held = cards([['D_3', 'm_glass'], ['C_4', 'm_glass'], 'D_5']);
  const pl = cards(['S_A']);
  t = playCards(pl);
  ok(near(t.mult, 1.2 * 1.2), 'Frosmoth: 2 Glass held X1.2 each', t.total);
  void held;
});

// ------------------------------------------------------------------- Eiscue: Ice Face
await sec('eiscue', () => {
  const [e] = fresh('EISC', ['eiscue']);
  let t = play(['S_A']);
  ok(near(t.mult, 2.5) && ex(e).form === 'noice', 'Ice Face X2.5; the round\'s first hand fell short: the ice breaks', [t.total, ex(e).form]);
  ok(drawn(e)[1] === JSON.stringify({ x: 10, y: 8 }) && /Noice Face: X1.25/.test(plain(e)), 'it shows its Noice Face (card + text)', [drawn(e), plain(e)]);
  t = play(['S_A']);
  ok(near(t.mult, 1.25), 'Noice Face X1.25', t.total);
  // a round whose first deal is not Snowy: stays broken
  endRound();
  act({ type: 'cash_out' }); act({ type: 'next_round' });
  for (const c of G.deck.cards.slice()) { G.deck.remove_card(c); G.discard.emplace(c); }
  for (const k of ['H_2', 'H_3', 'H_4', 'H_5', 'H_6', 'H_7', 'H_8', 'S_9']) mk(k, G.deck);
  act({ type: 'select_blind' }); flush();
  ok(ex(e).form === 'noice', 'a Sunny round (Hearts held most): still broken', ex(e).form);
  endRound();
  act({ type: 'cash_out' }); act({ type: 'next_round' });
  for (const c of G.deck.cards.slice()) { G.deck.remove_card(c); G.discard.emplace(c); }
  for (const k of ['S_2', 'S_3', 'S_4', 'S_5', 'S_6', 'S_7', 'H_8', 'C_9']) mk(k, G.deck);
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  ok(ex(e).form === 'ice' && drawn(e)[1] === JSON.stringify({ x: 8, y: 8 }), 'a Snowy round (Spades held most): the ice re-forms', ex(e).form);
  // won with the round's first hand: it holds
  endRound();
  ok(ex(e).form === 'ice', 'the Blind beaten by the first hand: the ice holds', ex(e).form);
  advance();
  clearHand();
  G.GAME.chips = 0;
  // Blueprint copies the face's X; it never breaks it twice
  start('EISC2', {}, { noBlind: true });
  add('j_poke_eiscue'); add('j_blueprint'); G.jokers.cards.reverse();
  act({ type: 'select_blind' }); flush(); clearHand();
  t = play(['S_A']);
  ok(near(t.mult, 2.5 * 2.5), 'Blueprint copies X2.5', t.total);
});

// ------------------------------------------------------------------- Indeedee: ♂ / ♀
await sec('indeedee', () => {
  const found = {};
  for (let i = 0; i < 40 && !(found.male && found.female); i++) {
    start('INDE' + i);
    const s0 = G.consumeables.config.card_limit;
    const j = add('j_poke_indeedee');
    if (!found[ex(j).gender]) found[ex(j).gender] = { seed: 'INDE' + i, s0 };
  }
  ok(found.male && found.female, 'both genders roll (seeded)', Object.keys(found));
  // ♂
  start(found.male.seed);
  let s0 = G.consumeables.config.card_limit;
  const m = add('j_poke_indeedee');
  ok(ex(m).gender === 'male' && G.consumeables.config.card_limit === s0 + 1, '♂: +1 consumable slot', [ex(m).gender, G.consumeables.config.card_limit]);
  let t = play(['S_A']);
  ok(near(t.mult, 1.5), '♂: X1.5', t.total);
  ok(/X1.5 Mult \+1 consumable slot \(♂: its gender is rolled/.test(plain(m)) && !/Male|Female/.test(plain(m)), '♂ text: the symbol, no word', plain(m));
  ok(drawn(m)[1] === JSON.stringify({ x: 12, y: 8 }), '♂: its own card {12,8}', drawn(m));
  debuff(m);
  ok(G.consumeables.config.card_limit === s0, 'debuffed: lends no slot', G.consumeables.config.card_limit);
  m.ability.debuff_sources = {}; m.set_debuff(); flush();
  m.remove(); flush();
  ok(G.consumeables.config.card_limit === s0, 'sold: the slot goes', G.consumeables.config.card_limit);
  // ♀
  start(found.female.seed);
  s0 = G.consumeables.config.card_limit;
  const f = add('j_poke_indeedee');
  ok(ex(f).gender === 'female' && G.consumeables.config.card_limit === s0 && ex(f).Xmult === undefined, '♀: no slot, no X (Energy-inert)', ex(f));
  t = play(['S_A']);
  ok(near(t.mult, 1), '♀: no X', t.total);
  const d0 = G.GAME.dollars;
  use(add('c_high_priestess'));
  ok(G.GAME.dollars === d0 + 2, '♀: a Tarot used earns $2', [d0, G.GAME.dollars]);
  use(add('c_poke_water_energy'));
  ok(G.GAME.dollars === d0 + 2, '... not any other consumable', G.GAME.dollars);
  ok(drawn(f)[1] === JSON.stringify({ x: 14, y: 8 }) && /Each Tarot card used earns \$2 \(♀/.test(plain(f)), '♀: its own card {14,8} and text', [drawn(f), plain(f)]);
  // a shop Indeedee has no gender yet
  start('INDEX');
  const shop = P_CENTERS.j_poke_indeedee;
  ok(!shop.config.extra.gender, 'the center has no gender (rolled when obtained)');
});

// ------------------------------------------------------------------- Morpeko: Hunger Switch
await sec('morpeko', () => {
  const [m] = fresh('MORP', ['morpeko']);
  let t = play(['S_A']);
  ok(near(t.mult, 1 + 20) && ex(m).form === 'hangry', 'Full Belly +20 Mult; then it turns Hangry', [t.total, ex(m).form]);
  ok(drawn(m)[1] === JSON.stringify({ x: 2, y: 9 }), 'Hangry: its Hangry Mode card {2,9}', drawn(m));
  t = play(['S_A']);
  ok(near(t.mult, 2) && ex(m).form === 'full', 'Hangry X2; then Full Belly', [t.total, ex(m).form]);
  t = play(['S_A']);
  ok(near(t.mult, 21), 'Full Belly again', t.total);
  endRound(); // (the winning hand switches it too: Hangry -> into the next round)
  ok(ex(m).form === 'full', 'the round-winning hand switched it back', ex(m).form);
  advance();
  t = play(['S_A']);
  ok(near(t.mult, 21) && ex(m).form === 'hangry', 'it carries across rounds (no reset)', [t.total, ex(m).form]);
  ok(get_type(m) === 'Lightning', 'its type stays Lightning', get_type(m));
});

// ------------------------------------------------------------------- Cufant / Copperajah: Steel
await sec('cufant', () => {
  const [c] = fresh('CUFA', ['cufant']);
  for (let i = 0; i < 3; i++) mk({ k: 'H_' + (i + 2), center: 'm_steel' }, G.deck);
  G.playing_cards.length; // (create_playing_card adds them to the full deck)
  let t = play(['S_A']);
  ok(t.chips === 16 + 30, 'Cufant: +10 Chips per Steel card in the full deck (3)', t.total);
  rounds(5);
  ok(key(c) === 'j_poke_copperajah', 'Cufant -> Copperajah after 5 rounds', key(c));
  clearHand();
  cards([['D_5', 'm_steel'], ['C_6', 'm_steel'], 'D_7']);
  const win = cards(['S_2']);
  G.GAME.chips = G.GAME.blind.chips;
  const d0 = G.GAME.dollars;
  act({ type: 'highlight', ids: win.map((x) => x.sort_id) }); act({ type: 'play' }); flush();
  ok(G.GAME.dollars - d0 === 2, 'Copperajah: 2 Steel cards held at end of round: +$2 (Gold card style)', G.GAME.dollars - d0);
});

// ------------------------------------------------------------------- the Galar fossils: Ancient Jacks
await sec('fossils', () => {
  fresh('FOSS', ['dracozolt']);
  let t = play(['S_J']);
  ok(near(t.mult, 1 + 5), 'Dracozolt 1 Jack: +5 Mult', t.total);
  t = play(['S_J', 'H_J']);
  ok(near(t.mult, (2 + 5) * 1.5), 'Dracozolt 2 Jacks: +5, X1.5', t.total);
  let d0 = G.GAME.dollars;
  t = play(['S_J', 'H_J', 'D_J']);
  ok(near(t.mult, (3 + 5) * 1.5) && G.GAME.dollars === d0 + 3, 'Dracozolt 3 Jacks: +5, X1.5, $3', [t.total, G.GAME.dollars - d0]);
  fresh('FOSS2', ['arctozolt']);
  t = play(['S_J']);
  ok(t.chips === 5 + 10 + 40, 'Arctozolt 1 Jack: +40 Chips', t.total);
  t = play(['S_J', 'H_J']);
  ok(t.chips === 10 + 10 * 2 * 2 + 40 && near(t.mult, 2), 'Arctozolt 2 Jacks: each retriggers once (4 x 10)', t.total);
  t = play(['S_J', 'H_J', 'D_J']);
  ok(t.chips === 30 + 10 * 3 * 2 + 40 && near(t.mult, 3 * 2), 'Arctozolt 3 Jacks: retriggers and X2', t.total);
  fresh('FOSS3', ['dracovish']);
  t = play(['S_J', 'H_J']);
  ok(t.chips === 10 + 10 * 2 + 10 * 2 && near(t.mult, 2 + 5), 'Dracovish 2 Jacks: the first retriggers twice, +5 Mult', t.total);
  t = play(['S_J', 'H_J', 'D_J']);
  ok(t.chips === 30 + 10 * 3 + 20 && near(t.mult, (3 + 5) * 2), 'Dracovish 3 Jacks: X2 too', t.total);
  fresh('FOSS4', ['arctovish']);
  t = play(['S_J', 'H_J']);
  ok(t.chips === 10 + 20 + 40 && near(t.mult, 2 * 1.5), 'Arctovish 2 Jacks: +40 Chips, X1.5', t.total);
  const h0 = G.GAME.current_round.hands_left;
  t = play(['S_J', 'H_J', 'D_J']);
  ok(G.GAME.current_round.hands_left === h0, 'Arctovish 3 Jacks: +1 hand this round (the one played is given back)', [h0, G.GAME.current_round.hands_left]);
  const h1 = G.GAME.current_round.hands_left;
  play(['S_J', 'H_J', 'D_J']);
  ok(G.GAME.current_round.hands_left === h1 - 1, '... once per round', [h1, G.GAME.current_round.hands_left]);
  t = play(['S_A']);
  ok(near(t.mult, 1), 'no Jack: nothing', t.total);
});

// ------------------------------------------------------------------- Energy at 1 / 2 / 3
await sec('energy', () => {
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const steps = (n, field, type, want) => {
    start('EN' + n);
    const j = add('j_poke_' + n), got = [];
    for (let i = 0; i < 3; i++) { increment_energy(j, type); got.push(r4(ex(j)[field])); }
    ok(got.every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${field} ${want.join(' / ')}`, got);
    return j;
  };
  steps('obstagoon', 'Xmult', 'Dark', [2.4, 2.8, 3.2]);
  steps('obstagoon', 'Xmult2', 'Dark', [3.6, 4.2, 4.8]);
  const cu = steps('cursola', 'Xmult', 'Psychic', [3.6, 4.2, 4.8]); ok(ex(cu).perish_rounds === 4, 'Cursola: the countdown stays 4');
  steps('sirfetchd', 'Xmult_mod', 'Fighting', [0.6, 0.7, 0.8]);
  steps('runerigus', 'Xmult_multi', 'Psychic', [1.3125, 1.375, 1.4375]);
  steps('milcery', 'mult', 'Fairy', [7, 9, 11]);
  steps('alcremie', 'mult', 'Fairy', [7, 9, 11]);
  steps('falinks', 'mult', 'Fighting', [8.4, 10.8, 13.2]);
  steps('pincurchin', 'Xmult_mod', 'Lightning', [0.3, 0.35, 0.4]);
  steps('snom', 'mult', 'Water', [8.4, 10.8, 13.2]);
  steps('frosmoth', 'Xmult_multi', 'Water', [1.26, 1.32, 1.38]);
  steps('eiscue', 'Xmult', 'Water', [3, 3.5, 4]);
  steps('eiscue', 'Xmult2', 'Water', [1.5, 1.75, 2]);
  start('ENIND');
  let found = null;
  for (let i = 0; i < 40 && !found; i++) { start('INDE' + i); const j = add('j_poke_indeedee'); if (ex(j).gender === 'male') found = 'INDE' + i; }
  start(found);
  const ind = add('j_poke_indeedee');
  const got = []; for (let i = 0; i < 3; i++) { increment_energy(ind, 'Psychic'); got.push(r4(ex(ind).Xmult)); }
  ok(got.join() === '1.8,2.1,2.4' && ex(ind).card_limit === 1 && ex(ind).tarot_money === 2, 'Indeedee ♂ + Psychic: X1.8 / 2.1 / 2.4 (slot, $ fixed)', got);
  steps('morpeko', 'mult', 'Lightning', [28, 36, 44]);
  steps('morpeko', 'Xmult', 'Lightning', [2.4, 2.8, 3.2]);
  steps('cufant', 'chips', 'Metal', [13, 16, 19]);
  steps('dracozolt', 'mult', 'Lightning', [7, 9, 11]); steps('dracozolt', 'Xmult', 'Lightning', [1.8, 2.1, 2.4]);
  steps('arctozolt', 'chips', 'Lightning', [52, 64, 76]); steps('arctozolt', 'Xmult', 'Lightning', [2.4, 2.8, 3.2]);
  steps('dracovish', 'mult', 'Water', [7, 9, 11]); steps('dracovish', 'Xmult', 'Water', [2.4, 2.8, 3.2]);
  steps('arctovish', 'chips', 'Water', [52, 64, 76]); steps('arctovish', 'Xmult', 'Water', [1.8, 2.1, 2.4]);
  steps('basculegion', 'Xmult_mod', 'Psychic', [0.12, 0.14, 0.16]);
  // Energy carries through the evolutions
  start('ENEVO');
  const y = add('j_poke_yamask');
  increment_energy(y, 'Psychic'); increment_energy(y, 'Psychic');
  ex(y).stones_scored = 10;
  rounds(5);
  ok(key(y) === 'j_poke_runerigus' && near(ex(y).Xmult_multi, 1.375), 'Yamask (2 Energy) -> Runerigus: X1.375 a Stone', [key(y), ex(y).Xmult_multi]);
  const sn = add('j_poke_snom');
  increment_energy(sn, 'Water');
  rounds(5);
  ok(key(sn) === 'j_poke_frosmoth' && near(ex(sn).Xmult_multi, 1.26), 'Snom (1 Energy) -> Frosmoth: X1.26', [key(sn), ex(sn).Xmult_multi]);
});

// ------------------------------------------------------------------- a run recorded on r71 replays as recorded
await sec('r71 replay', () => {
  const deck = { name: 'Galar', mods: ['pokermon'], params: { blind_scaling: 0.05 },
    cards: [['S_K', 'm_stone', 0, 0, 20], ['H_Q', 'm_stone', 0, 0, 20]],
    jokers: [{ key: 'j_poke_yamask' }] };
  const record = (pins) => {
    const s = new Session();
    PINS.RULES.pins = pins;
    try {
      s.start({ seed: 'G8B3REC', mods: ['pokermon'], customDeck: deck });
      s.act({ type: 'select_blind' }); flush();
      for (let b = 0; b < 5; b++) {
        for (let i = 0; i < 4 && G.STATE === STATES.SELECTING_HAND; i++) { s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush(); }
        if (G.STATE === STATES.ROUND_EVAL) { s.act({ type: 'cash_out' }); flush(); }
        if (G.STATE === STATES.SHOP) { s.act({ type: 'next_round' }); flush(); }
        if (G.STATE === STATES.BLIND_SELECT) { s.act({ type: 'select_blind' }); flush(); }
      }
    } finally { PINS.RULES.pins = null; }
    return s;
  };
  const y = () => G.jokers.cards.map(key).join();
  const s71 = record(R71);
  const want71 = { jokers: y(), chips: String(G.GAME.chips), round: G.GAME.round, dollars: G.GAME.dollars };
  ok(want71.jokers === 'j_poke_cofagrigus' && want71.round >= 6, 'the r71 run: 10+ Stones scored, Yamask -> Cofagrigus as on r71', want71);
  const rec71 = JSON.parse(JSON.stringify(s71.recipe));
  rec71.modVersions.pokermon = '3.9.1+r71';
  ok(Session.pinDiff(rec71).length === 1, 'an r71 recipe differs from the current pin (the resume prompt)', Session.pinDiff(rec71));
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(rec71)), { repin: true }); flush();
  const got71 = { jokers: y(), chips: String(G.GAME.chips), round: G.GAME.round, dollars: G.GAME.dollars };
  ok(!r.stoppedAt && JSON.stringify(got71) === JSON.stringify(want71), 'resumed: every r71 move replays on r71 (Cofagrigus, the same score)', { want71, got71 });
  const st = Session.stepper(JSON.parse(JSON.stringify(rec71)));
  st.seek(st.total); flush();
  ok(!st.error && st.index === rec71.actions.length && y() === 'j_poke_cofagrigus', 'the replay stepper: the same', [st.error, y()]);
  record(null);
  ok(y() === 'j_poke_runerigus', 'the same moves on r72: Runerigus', y());
});

// ------------------------------------------------------------------- the upstream jokers otherwise unchanged
await sec('upstream unchanged', () => {
  // Corsola: its Blind-select Mult and Basic Water Joker
  start('CORS', {}, { noBlind: true });
  const co = add('j_poke_corsola');
  act({ type: 'select_blind' }); flush();
  ok(ex(co).mult === 1 && G.jokers.cards.length === 2, 'Corsola: +1 Mult per Water Joker and a Basic Water Joker on Blind select (unchanged)', [ex(co).mult, G.jokers.cards.map(key)]);
  // Linoone: a Straight still guarantees its Pickup
  start('LINO');
  add('j_poke_linoone');
  const c0 = G.consumeables.cards.length;
  play(['S_9', 'H_8', 'D_7', 'C_6', 'S_5']);
  ok(G.consumeables.cards.length === c0 + 1, 'Linoone: a Straight -> a Pickup Item (unchanged)', G.consumeables.cards.length);
  // Mr. Mime: retriggers the leftmost held card's ability 3 times (a Steel King: X1.5 x4)
  start('MIME');
  add('j_poke_mrmime');
  clearHand();
  cards([['S_K', 'm_steel']]);
  const t = playCards(cards(['S_A']));
  ok(near(t.mult, Math.pow(1.5, 4)), 'Mr. Mime: the held Steel King X1.5, 3 more times (unchanged)', t.total);
  // Yamask's grudge, Basculin's stripe Chips
  start('YAMB');
  const ya = add('j_poke_yamask'), jj = add('j_joker');
  act({ type: 'sell', id: jj.sort_id }); flush();
  ok(near(ex(ya).grudge_Xmult, 1.1), 'Yamask: its grudge (unchanged)', ex(ya).grudge_Xmult);
  const ba = add('j_poke_basculin');
  const s = DES.STRIPES[DES.stripe_of(ba)].suits[0][0];
  const t2 = play([s + '_A']);
  ok(t2.chips === 16 + 20, 'Basculin: +20 Chips per stripe card (unchanged)', t2.total);
});

// ------------------------------------------------------------------- save / resume
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'G8B3RES', customDeck: { name: 'Gen 8', mods: ['pokermon'], params: { blind_scaling: 0.05 },
    cards: [['S_J', 0, 0, 0, 12], ['H_9', 'm_glass', 0, 0, 10], ['D_5', 'm_steel', 0, 0, 10], ['C_7', 'm_stone', 0, 0, 20]],
    jokers: [{ key: 'j_poke_morpeko' }, { key: 'j_poke_eiscue' }, { key: 'j_poke_indeedee' }, { key: 'j_poke_alcremie' }, { key: 'j_poke_cursola' }, { key: 'j_poke_arctovish' }] } });
  s.act({ type: 'select_blind' }); flush();
  for (let i = 0; i < 3; i++) {
    s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush();
    if (G.STATE !== STATES.SELECTING_HAND) break;
  }
  const snap = () => ({
    jokers: G.jokers.cards.map((j) => [key(j), ex(j).form, ex(j).gender, ex(j).perish_rounds, ex(j).hand_round]),
    eds: G.playing_cards.filter((c) => c.edition).length, slots: G.consumeables.config.card_limit,
    chips: String(G.GAME.chips), dollars: G.GAME.dollars, round: G.GAME.round, hands: G.GAME.current_round.hands_left,
  });
  const want = snap();
  ok(want.eds >= 1 && want.jokers[0][1] !== undefined && want.jokers[2][2], 'the run: a card decorated, Morpeko switched, Indeedee\'s gender rolled', want);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  const got = snap();
  ok(!r.stoppedAt && JSON.stringify(got) === JSON.stringify(want), 'resume: Morpeko\'s mode, Eiscue\'s face, Indeedee\'s gender, Alcremie\'s form, the score come back the same', { want, got });
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
    ok(!bad.length, 'each of the 21 is the type its 3.9.1 card shows', bad);
    const cell = (p) => typer.typeOfEntry({ atlas: 'AtlasJokersBasicGen08', pos: [p.x, p.y] });
    const F = ANIM.GEN8_FORM_SPRITES;
    ok(cell(F.j_poke_eiscue.noice)?.ptype === 'Water' && cell(F.j_poke_indeedee.female)?.ptype === 'Psychic', 'Noice Face Water, Indeedee ♀ Psychic');
    const alc = Object.values(F.j_poke_alcremie).map(cell).filter((r) => !r || r.ptype !== 'Fairy');
    ok(!alc.length, 'all 62 other Alcremie cells are Fairy', alc.length);
    ok(cell(F.j_poke_morpeko.hangry)?.ptype === 'Dark', 'Hangry Morpeko\'s card shows Dark (art only: Morpeko stays Lightning)', cell(F.j_poke_morpeko.hangry));
  });
} else console.log('(Pokermon art not on disk: the art type checks are skipped; set MICATRO_MAIN)');

done();
