// Gen 5, batch 2 (the owner's "Yes", 2026-10-28; jokers/pokejokers_designs.js "Gen 5, batch 2"; PORTING.md "Gen 5, batch 2"): 26 jokers,
// #540-573, on the guide's price slots (3-stage U $6 / S $8 / S $10, 2-stage C $5 / S $8, single-stage R $7):
//   Sewaddle 540 -> Swadloon -> Leavanny (Grass)   Tailor: each Blind, 1 random unenhanced deck card becomes Bonus / Bonus-or-Mult /
//                                                  Bonus-Mult-or-Lucky; Leavanny's scored enhanced cards +3 Mult. 4 rounds, then 5.
//   Venipede 543 -> Whirlipede -> Scolipede (Dark) Poison Point: each card you discard permanently -2 / -3 Chips (floored at 0) and
//                                                  +3 / +5 Mult; Scolipede's unenhanced ones become Mult cards. 4 rounds, then 5.
//   Cottonee 546 -> Whimsicott (Grass)             +1 hand size, the round's first deal draws 1 extra; Whimsicott +2 hand size. 5 rounds.
//   Petilil 548 -> Lilligant (Grass)               scored Flower cards earn $1 / $2; Lilligant's Flowers need 3+ suits. 5 rounds.
//   Basculin 550 (Water, R $7)                     a Red or Blue stripe rolled once (its own art): +20 Chips per scored red / black card.
//   Sandile 551 -> Krokorok -> Krookodile (Dark)   Moxie: +2 / +4 Mult banked per Blind beaten, Krookodile X0.15 (and the Mult). 5 + 5.
//   Maractus 556 (Grass, R $7)                     each Hazard card held in hand +8 Mult.
//   Dwebble 557 -> Crustle (Earth)                 +5 / +10 Chips per Stone card in the full deck. 5 rounds.
//   Sigilyph 561 (Psychic, R $7)                   +2 Foresight; a Planet for Pair levels it 1 extra time.
//   Yamask 562 -> Cofagrigus (Psychic)             X0.1 / X0.2 per other Joker sold; Mummy: the round's first Joker sold stays, Negative,
//                                                  no money (a Negative one sells as usual; it counts for the X). 5 rounds.
//   Tirtouga 564 -> Carracosta (Water)             Ancient 9s: 1+ +30 Chips, 2+ scored 9s +5 Chips for good, 3+ +50; Carracosta 4+
//                                                  retriggers the 9s. Evolves after the 3+ tier fires 5 times.
//   Archen 566 -> Archeops (Earth)                 Ancient 10s: 1+ +4 Mult, 2+ X1.25, 3+ $3; Archeops 4+ X2, all halved on the final hand
//                                                  (Defeatist). Evolves after the 3+ tier fires 5 times.
//   Minccino 572 -> Cinccino (Colorless)           each discard draws 1 extra (+1 hand size until the next hand); Skill Link: the first
//                                                  scored card retriggers once per discard used this round (max 5). 5 rounds.
// Every ability is FIRED through real hands / discards / sales / rounds with exact numbers.
//   node micatro/tests/mods/pokermon_gen5_batch2_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, state, STATES } from './poke_helpers.mjs';
import { create_card, copy_card } from '../../js/engine/core.js';
import { discard_cards_from_highlighted } from '../../js/engine/run.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import * as ANIM from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 700)); } };
const ex = (j) => j.ability.extra;
const C = (n) => P_CENTERS['j_poke_' + n];
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const LINES = {
  sewaddle: ['sewaddle', 'swadloon', 'leavanny'], venipede: ['venipede', 'whirlipede', 'scolipede'], cottonee: ['cottonee', 'whimsicott'],
  petilil: ['petilil', 'lilligant'], basculin: ['basculin'], sandile: ['sandile', 'krokorok', 'krookodile'], maractus: ['maractus'],
  dwebble: ['dwebble', 'crustle'], sigilyph: ['sigilyph'], yamask: ['yamask', 'cofagrigus'], tirtouga: ['tirtouga', 'carracosta'],
  archen: ['archen', 'archeops'], minccino: ['minccino', 'cinccino'],
};
const NAMES = Object.values(LINES).flat();
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
/** Put cards in hand: a list of keys, or [key, center] pairs (in that order: the first is the leftmost). */
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list` (with `held` left in hand); the round never ends by accident unless `last` (the round's final hand: hands_left 1 -> 0). */
function play(list, { held = [], last = false, clear = true } = {}) {
  if (clear) clearHand();
  const cs = cards(list);
  const hs = cards(held);
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (last) G.GAME.current_round.hands_left = 1;
  else if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const events = (r && r.events) || [];
  const total = events.find((e) => e.type === 'hand_total') || {};
  return { cards: cs, held: hs, events, total, mult: Number(total.mult), chips: Number(total.chips) };
}
/** Discard exactly these hand cards (a player discard). */
function discard(cs) {
  if (G.GAME.current_round.discards_left < 1) G.GAME.current_round.discards_left = 1;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'discard' });
  flush();
  return r;
}
/** Back into the hand (from the discard pile or the deck). */
function retake(c) { c.area.remove_card(c); G.hand.emplace(c); return c; }
/** Win the round in progress (High Card 2) -> ROUND_EVAL. */
function endRound() { clearHand(); const c = hand(['S_2']); G.GAME.chips = G.GAME.blind.chips; if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2; act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush(); }
function advance() {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  clearHand();
}
const rounds = (n) => { for (let r = 0; r < n; r++) { endRound(); advance(); } };
function use(k, target) {
  const c = add(k);
  G.jokers.highlighted.length = 0;
  if (target) G.jokers.highlighted.push(target);
  const r = act({ type: 'use', id: c.sort_id, targets: [] });
  flush();
  G.jokers.highlighted.length = 0;
  return r;
}
function sell(j) { const r = act({ type: 'sell', id: j.sort_id }); flush(); return r; }
const face = (j, shiny) => {
  const v = {}; view_card(j, v);
  return POKE_UI.face({ center: key(j), facing: 'front', poke: v.poke, atlas: j.config.center.atlas, pos: j.config.center.pos, ...(shiny ? { edition: 'poke_shiny' } : {}) }, { area: 'jokers' });
};
const drawn = (j, shiny) => { const f = face(j, shiny); return f ? [f.atlas, f.pos] : [j.config.center.atlas, j.config.center.pos]; };
const plainDeck = () => G.playing_cards.filter((c) => key(c) === 'c_base');
const enhKeys = () => G.playing_cards.map(key).filter((k) => k !== 'c_base');

// ------------------------------------------------------------------- pin, static data, order, families, art, Energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 54 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 54+ (Gen 5 batch 2)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of NAMES) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs');
  }
  const hits = [];
  const re = new RegExp(NAMES.join('|'), 'i');
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the 26 (nothing to dedupe)', hits);
});
await sec('static', () => {
  start('G5B2S');
  const S = 'poke_safari';
  // [rarity, cost, stage, type, rounds|undefined, sheet, x, y]
  const WANT = {
    sewaddle: [2, 6, 'Basic', 'Grass', 4, 'Natdex', 28, 35], swadloon: [S, 8, 'One', 'Grass', 5, 'Natdex', 0, 36], leavanny: [S, 10, 'Two', 'Grass', undefined, 'Natdex', 2, 36],
    venipede: [2, 6, 'Basic', 'Dark', 4, 'Natdex', 4, 36], whirlipede: [S, 8, 'One', 'Dark', 5, 'Natdex', 6, 36], scolipede: [S, 10, 'Two', 'Dark', undefined, 'Natdex', 8, 36],
    cottonee: [1, 5, 'Basic', 'Grass', 5, 'Natdex', 10, 36], whimsicott: [S, 8, 'One', 'Grass', undefined, 'Natdex', 12, 36],
    petilil: [1, 5, 'Basic', 'Grass', 5, 'Natdex', 14, 36], lilligant: [S, 8, 'One', 'Grass', undefined, 'Natdex', 16, 36],
    basculin: [3, 7, 'Basic', 'Water', undefined, 'Gen05', 4, 0],
    sandile: [2, 6, 'Basic', 'Dark', 5, 'Natdex', 20, 36], krokorok: [S, 8, 'One', 'Dark', 5, 'Natdex', 22, 36], krookodile: [S, 10, 'Two', 'Dark', undefined, 'Natdex', 24, 36],
    maractus: [3, 7, 'Basic', 'Grass', undefined, 'Natdex', 0, 37],
    dwebble: [1, 5, 'Basic', 'Earth', 5, 'Natdex', 2, 37], crustle: [S, 8, 'One', 'Earth', undefined, 'Natdex', 4, 37],
    sigilyph: [3, 7, 'Basic', 'Psychic', undefined, 'Natdex', 10, 37],
    yamask: [1, 5, 'Basic', 'Psychic', 5, 'Natdex', 12, 37], cofagrigus: [S, 8, 'One', 'Psychic', undefined, 'Natdex', 14, 37],
    tirtouga: [1, 5, 'Basic', 'Water', undefined, 'Natdex', 16, 37], carracosta: [S, 8, 'One', 'Water', undefined, 'Natdex', 18, 37],
    archen: [1, 5, 'Basic', 'Earth', undefined, 'Natdex', 20, 37], archeops: [S, 8, 'One', 'Earth', undefined, 'Natdex', 22, 37],
    minccino: [1, 5, 'Basic', 'Colorless', 5, 'Natdex', 2, 38], cinccino: [S, 8, 'One', 'Colorless', undefined, 'Natdex', 4, 38],
  };
  for (const [n, [rarity, cost, stage, type, rnds, sheet, x, y]] of Object.entries(WANT)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === type && c.config.extra.ptype === type && c.gen === 5,
      `${n}: ${rarity} $${cost}, ${stage}, ${type}, Gen 5`, [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.config.extra.rounds === rnds, `${n}: ${rnds ? 'evolves after ' + rnds + ' rounds' : 'no round timer'}`, c.config.extra.rounds);
    ok(c.atlas === 'poke_AtlasJokersBasic' + sheet + '391' && c.pos.x === x && c.pos.y === y && !c.soul_pos, `${n}: upstream 3.9.1 cell ${sheet} {${x},${y}} (nothing to deploy)`, [c.atlas, c.pos]);
  }
  ok(C('tirtouga').config.evo_rqmt === 5 && C('archen').config.evo_rqmt === 5, 'the fossils evolve after their 3+ tier fires 5 times (evo_rqmt 5)');
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const run = (from, list, to) => { const i = keys.indexOf('j_poke_' + list[0]); return i > 0 && [from, ...list, to].every((k, n) => keys[i - 1 + n] === 'j_poke_' + k) ? true : keys.slice(i - 1, i + list.length + 1); };
  const r1 = run(keys[keys.indexOf('j_poke_sewaddle') - 1].slice(7), ['sewaddle', 'swadloon', 'leavanny', 'venipede', 'whirlipede', 'scolipede', 'cottonee', 'whimsicott', 'petilil', 'lilligant', 'basculin', 'sandile', 'krokorok', 'krookodile', 'darumaka'].slice(0, 14), 'darumaka');
  ok(r1 === true && /^j_poke_(excadrill|sawk)$/.test(keys[keys.indexOf('j_poke_sewaddle') - 1]), 'Pokédex order: Excadrill (530) or Sawk (539), Sewaddle ... Krookodile (540-553), Darumaka (554)', r1);
  const r2 = run('darmanitan', ['maractus', 'dwebble', 'crustle'], 'scraggy');
  ok(r2 === true, 'Pokédex order: Darmanitan (555), Maractus, Dwebble, Crustle (556-558), Scraggy (559)', r2);
  const r3 = run('scrafty', ['sigilyph', 'yamask', 'cofagrigus', 'tirtouga', 'carracosta', 'archen', 'archeops'], 'trubbish');
  ok(r3 === true, 'Pokédex order: Scrafty (560), Sigilyph ... Archeops (561-567), Trubbish (568)', r3);
  const r4 = run('zoroark', ['minccino', 'cinccino'], 'gothita');
  ok(r4 === true, 'Pokédex order: Zoroark (571), Minccino, Cinccino (572-573), Gothita (574)', r4);
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
  for (const line of Object.values(LINES)) if (line.length > 1) ok(fam(line[0]) === line.join(), 'one family: ' + line.join(' -> '), fam(line[0]));
  const inert = ['cottonee', 'whimsicott', 'petilil', 'lilligant', 'sigilyph', 'minccino', 'cinccino'];
  ok(inert.every((n) => C(n).poke_no_energy_field === true) && NAMES.filter((n) => !inert.includes(n)).every((n) => !C(n).poke_no_energy_field),
    'Energy-inert by design (poke_no_energy_field): Cottonee / Whimsicott (hand size), Petilil / Lilligant (money), Sigilyph (Foresight, a level), Minccino / Cinccino (draws, retriggers)');
  ok(['chip_loss', 'flower_money', 'ancient_money', 'moxie_mult', 'moxie_Xmult', 'grudge_Xmult', 'third_times', 'link_cap', 'levels', 'scry', 'h_size', 'prank_draw', 'tidy_draws', 'retriggers'].every((f) => !(f in energy_values)),
    'fixed: the Chips poison, the money, the banks, the 3+ count, the cap, the level, Foresight, hand size, retriggers (no energy field)');
});

// ------------------------------------------------------------------- Sewaddle line: the tailor + Leavanny's enhanced cards
await sec('tailor', () => {
  start('TAILOR1', {}, { noBlind: true });
  const s = add('j_poke_sewaddle');
  const before = plainDeck().length, e0 = enhKeys().length;
  act({ type: 'select_blind' }); flush();
  ok(plainDeck().length === before - 1 && enhKeys().length === e0 + 1 && enhKeys().every((k) => k === 'm_bonus'), 'Sewaddle: selecting a Blind turns ONE unenhanced deck card into a Bonus card', [before, plainDeck().length, enhKeys()]);
  // none unenhanced: nothing (never overwrites)
  endRound();
  for (const c of G.playing_cards) c.set_ability(P_CENTERS.m_glass, null, true);
  advance();
  ok(enhKeys().every((k) => k === 'm_glass') && plainDeck().length === 0, 'a fully enhanced deck: nothing is converted (it never overwrites)');
  // seeded: the same seed converts the same card
  const pickOf = (seed) => { start(seed, {}, { noBlind: true }); add('j_poke_sewaddle'); act({ type: 'select_blind' }); flush(); const c = G.playing_cards.find((x) => key(x) !== 'c_base'); return c && c.base.id + c.base.suit; };
  ok(pickOf('TAILSEED') === pickOf('TAILSEED') && pickOf('TAILSEED2') === pickOf('TAILSEED2'), 'seeded: the same seed tailors the same card', [pickOf('TAILSEED'), pickOf('TAILSEED2')]);
  // Swadloon / Leavanny's cloths, over many seeds
  for (const [n, want] of [['swadloon', ['m_bonus', 'm_mult']], ['leavanny', ['m_bonus', 'm_lucky', 'm_mult']]]) {
    const seen = {};
    for (let i = 0; i < 30; i++) {
      start('CLOTH' + n + i, {}, { noBlind: true }); add('j_poke_' + n); act({ type: 'select_blind' }); flush();
      const k = enhKeys(); ok(k.length === 1, `${n} CLOTH${i}: one card`, k); seen[k[0]] = (seen[k[0]] || 0) + 1;
    }
    ok(Object.keys(seen).sort().join() === want.join(), `${n}: its cloths are ${want.join(' / ')} (seeded; each occurs over 30 seeds)`, seen);
  }
  // Blueprint copies it (Marble Joker's moment): two cards
  start('TAILBP', {}, { noBlind: true });
  add('j_blueprint'); add('j_poke_sewaddle');
  act({ type: 'select_blind' }); flush();
  ok(enhKeys().length === 2 && enhKeys().every((k) => k === 'm_bonus'), 'Blueprint copies the tailor: 2 Bonus cards a Blind', enhKeys());
  // Leavanny: each scored enhanced card +3 Mult
  start('LEAF');
  add('j_poke_leavanny');
  let t = play([['S_5', 'm_bonus'], 'H_5']);
  ok(t.chips === 10 + 5 + 30 + 5 && near(t.mult, 2 + 3), 'Leavanny: a Pair, one Bonus 5: 50 Chips x (2 + 3) (the plain 5 gives nothing)', t.total);
  t = play([['S_9', 'm_mult'], ['H_9', 'm_stone'], ['D_9', 'm_lucky']]);
  ok(near(t.mult, 2 + 4 + 3 * 3), 'a Mult 9, a Stone card and a Lucky 9 (a Pair of 9s; the Stone card always scores): +3 for each of the 3 enhanced scored cards (+4 the Mult card\'s own)', t.total);
  // evolution: Sewaddle 4 rounds -> Swadloon 5 -> Leavanny
  start('TAILEVO');
  const e = add('j_poke_sewaddle');
  rounds(3); ok(key(e) === 'j_poke_sewaddle', 'Sewaddle: still Sewaddle after 3 rounds');
  rounds(1); ok(key(e) === 'j_poke_swadloon', 'Sewaddle -> Swadloon after 4 rounds', key(e));
  rounds(5); ok(key(e) === 'j_poke_leavanny', 'Swadloon -> Leavanny after 5 more', key(e));
  void s;
});

// ------------------------------------------------------------------- Venipede line: Poison Point
await sec('poison point', () => {
  start('VENI');
  const v = add('j_poke_venipede');
  const [k, two] = cards(['S_K', 'H_2']);
  discard([k, two]);
  ok(k.ability.perma_bonus === -2 && k.ability.perma_mult === 3 && two.ability.perma_bonus === -2 && two.ability.perma_mult === 3,
    'Venipede: each discarded card -2 Chips and +3 Mult for good', [k.ability.perma_bonus, k.ability.perma_mult, two.ability.perma_bonus]);
  retake(two); discard([two]);
  ok(two.ability.perma_bonus === -2 && two.ability.perma_mult === 6, 'the floor: a 2 (2 Chips) stops at -2 (0 Chips) and still gains the Mult', [two.ability.perma_bonus, two.ability.perma_mult]);
  clearHand(); retake(k); G.hand.highlighted.length = 0;
  act({ type: 'highlight', ids: [k.sort_id] }); G.GAME.chips = 0; G.GAME.current_round.hands_left = Math.max(2, G.GAME.current_round.hands_left);
  let r = act({ type: 'play' }); flush();
  let tot = r.events.find((e) => e.type === 'hand_total');
  ok(Number(tot.chips) === 5 + 10 - 2 && near(Number(tot.mult), 1 + 3), 'the poisoned King scores 13 Chips x 4 (High Card 5 + 1; the King 10 - 2; +3 Mult)', tot);
  // Stone: floored at -50
  const [st] = cards([['S_5', 'm_stone']]);
  st.ability.perma_bonus = -49;
  discard([st]);
  ok(st.ability.perma_bonus === -50 && st.ability.perma_mult === 3, 'a Stone card (+50) floors at -50', st.ability.perma_bonus);
  retake(st); discard([st]);
  ok(st.ability.perma_bonus === -50 && st.ability.perma_mult === 6, '... and stays there', st.ability.perma_bonus);
  // an effect discard (hook: The Hook, seals) doesn't poison
  const [h] = cards(['D_7']);
  G.hand.highlighted = [h];
  discard_cards_from_highlighted(true); flush();
  ok(!h.ability.perma_bonus && !h.ability.perma_mult, 'an effect discard (The Hook\'s) is not poisoned', [h.ability.perma_bonus, h.ability.perma_mult]);
  // Blueprint copies it (a second dose)
  start('VENIBP');
  add('j_blueprint'); add('j_poke_venipede');
  const [q] = cards(['C_Q']);
  discard([q]);
  ok(q.ability.perma_bonus === -4 && q.ability.perma_mult === 6, 'Blueprint copies the poison: -4 Chips, +6 Mult', [q.ability.perma_bonus, q.ability.perma_mult]);
  // Whirlipede / Scolipede
  start('WHIRL');
  add('j_poke_whirlipede');
  const [w] = cards(['S_A']);
  discard([w]);
  ok(w.ability.perma_bonus === -3 && w.ability.perma_mult === 5 && key(w) === 'c_base', 'Whirlipede: -3 Chips, +5 Mult (no conversion)', [w.ability.perma_bonus, w.ability.perma_mult, key(w)]);
  start('SCOLI');
  add('j_poke_scolipede');
  const [p9, b8] = cards(['S_9', ['H_8', 'm_bonus']]);
  discard([p9, b8]);
  ok(key(p9) === 'm_mult' && p9.ability.perma_bonus === -3 && p9.ability.perma_mult === 5, 'Scolipede: the unenhanced 9 becomes a Mult card, poisoned (-3, +5)', [key(p9), p9.ability.perma_bonus, p9.ability.perma_mult]);
  ok(key(b8) === 'm_bonus' && b8.ability.perma_bonus === -3 && b8.ability.perma_mult === 5, 'the Bonus 8 stays a Bonus card (only unenhanced ones convert), poisoned', [key(b8), b8.ability.perma_bonus]);
  clearHand(); retake(p9);
  act({ type: 'highlight', ids: [p9.sort_id] }); G.GAME.chips = 0; G.GAME.current_round.hands_left = Math.max(2, G.GAME.current_round.hands_left);
  r = act({ type: 'play' }); flush();
  tot = r.events.find((e) => e.type === 'hand_total');
  ok(Number(tot.chips) === 5 + 9 - 3 && near(Number(tot.mult), 1 + 4 + 5), 'the poisoned Mult 9: 11 Chips x (1 + 4 Mult card + 5 poison)', tot);
  // evolution: 4, then 5
  start('VENIEVO');
  const e = add('j_poke_venipede');
  rounds(4); ok(key(e) === 'j_poke_whirlipede', 'Venipede -> Whirlipede after 4 rounds', key(e));
  rounds(5); ok(key(e) === 'j_poke_scolipede', 'Whirlipede -> Scolipede after 5 more', key(e));
  void v;
});

// ------------------------------------------------------------------- Cottonee / Whimsicott: hand size + Prankster
await sec('prankster', () => {
  start('COTT', {}, { noBlind: true });
  const base = G.hand.config.card_limit;
  const c = add('j_poke_cottonee');
  ok(G.hand.config.card_limit === base + 1, 'Cottonee: +1 hand size', [base, G.hand.config.card_limit]);
  act({ type: 'select_blind' }); flush();
  ok(G.hand.cards.length === base + 2 && G.hand.config.card_limit === base + 1, 'Prankster: the round\'s first deal draws 1 extra card (10 cards, hand size 9)', [G.hand.cards.length, G.hand.config.card_limit]);
  discard([G.hand.cards[0]]);
  ok(G.hand.cards.length === base + 1, '... and the refill after a discard only reaches the hand size (9)', G.hand.cards.length);
  endRound(); advance();
  // a real deal again: clearHand above emptied it; deal the next round for real
  start('COTT2', {}, { noBlind: true });
  add('j_poke_cottonee');
  act({ type: 'select_blind' }); flush();
  ok(G.hand.cards.length === base + 2, 'every round\'s first deal (a new run, round 1)', G.hand.cards.length);
  ok(ex(G.jokers.cards[0]).prank_draw === 0, 'the temporary +1 is taken back on that deal');
  c.remove(); flush();
  // sold while it is pending: both back
  start('COTT3', {}, { noBlind: true });
  const c3 = add('j_poke_cottonee');
  ex(c3).prank_draw = 1; G.hand.change_size(1); flush();
  sell(c3);
  ok(G.hand.config.card_limit === base, 'sold with the +1 still pending: the hand size is back to 8', G.hand.config.card_limit);
  // Whimsicott: +2, fixed
  start('WHIMS', {}, { noBlind: true });
  const w = add('j_poke_whimsicott');
  ok(G.hand.config.card_limit === base + 2, 'Whimsicott: +2 hand size', G.hand.config.card_limit);
  act({ type: 'select_blind' }); flush();
  ok(G.hand.cards.length === base + 2, 'Whimsicott\'s deal: exactly its hand size (no Prankster)', G.hand.cards.length);
  increment_energy(w, 'Grass');
  ok(ex(w).h_size === 2 && G.hand.config.card_limit === base + 2, 'Energy never raises Whimsicott\'s +2 (the hand-size pitfall)', ex(w).h_size);
  // evolution: Cottonee -> Whimsicott after 5 rounds, the hand size +1 -> +2 (never doubled)
  start('COTTEVO', {}, { noBlind: true });
  const e = add('j_poke_cottonee');
  act({ type: 'select_blind' }); flush(); clearHand();
  rounds(4); ok(key(e) === 'j_poke_cottonee', 'Cottonee: still Cottonee after 4 rounds');
  endRound(); ok(key(e) === 'j_poke_whimsicott' && G.hand.config.card_limit === base + 2, 'Cottonee -> Whimsicott after 5 rounds: hand size 8 + 2', [key(e), G.hand.config.card_limit]);
});

// ------------------------------------------------------------------- Petilil / Lilligant: Flower money, 3+ suits
await sec('flower dance', () => {
  start('PETI');
  add('j_poke_petilil');
  let d0 = G.GAME.dollars;
  play([['S_5', 'm_poke_flower'], ['H_5', 'm_poke_flower'], 'D_7', 'D_7']);
  ok(G.GAME.dollars === d0 + 2, 'Petilil: 2 scored Flower cards earn $1 each', [d0, G.GAME.dollars]);
  // Petilil doesn't change the rule: 3 suits, no X2
  let t = play([['S_5', 'm_poke_flower'], 'H_5', 'D_7', 'D_7']);
  ok(near(t.mult, 2), 'Petilil: a 3-suit Two Pair: the Flower gives nothing (4+ suits needed)', t.total);
  start('LILLI');
  add('j_poke_lilligant');
  d0 = G.GAME.dollars;
  t = play([['S_5', 'm_poke_flower'], 'H_5', 'D_7', 'D_7']);
  ok(near(t.mult, 2 * 2) && G.GAME.dollars === d0 + 2, 'Lilligant: the same 3-suit hand: the Flower X2 (3+ suits), and $2', [t.total, d0, G.GAME.dollars]);
  t = play([['S_5', 'm_poke_flower'], 'S_5', 'S_7', 'S_7']);
  ok(near(t.mult, 2), '... but 1 suit is still too few', t.total);
  add('j_poke_cherrim');
  t = play([['S_5', 'm_poke_flower'], 'H_5', 'D_7']);
  ok(near(t.mult, 2), 'with Cherrim too (also 3+): still 3 suits needed, never 2 (the fewest asked wins, they never stack)', t.total);
  t = play([['S_5', 'm_poke_flower'], 'H_5', 'D_7', 'D_7']);
  ok(near(t.mult, 2 * 2), '... and 3 suits still X2', t.total);
  start('PETIEVO');
  const e = add('j_poke_petilil');
  rounds(5); ok(key(e) === 'j_poke_lilligant', 'Petilil -> Lilligant after 5 rounds', key(e));
});

// ------------------------------------------------------------------- Basculin: the stripe (rolled once, seeded, kept, resumed, its art)
await sec('stripe', () => {
  const seen = {};
  for (let i = 0; i < 24; i++) {
    const roll = () => { start('STRIPE' + i); return ex(add('j_poke_basculin')).form; };
    const x = roll(); seen[x] = (seen[x] || 0) + 1;
    ok(roll() === x, `STRIPE${i}: the same seed rolls the same stripe (${x})`);
  }
  ok(Object.keys(seen).sort().join() === 'blue,red', 'both stripes occur over 24 seeds', seen);
  start('STRIPEC');
  const c = create_card('Joker', G.jokers, null, null, null, null, 'j_poke_basculin');
  ok(['red', 'blue'].includes(ex(c).form), 'create_card (a shop / pack card) rolls it', ex(c).form);
  for (const f of ['red', 'blue']) { ex(c).form = f; ok(ex(copy_card(c)).form === f, `a copy keeps the ${f} stripe`); }
  // the Chips
  start('STRIPE2');
  const b = add('j_poke_basculin');
  ex(b).form = 'red';
  let t = play(['H_5', 'D_5']);
  ok(t.chips === 10 + 10 + 40, 'Red-Striped: a Pair of a Heart and a Diamond: +20 Chips each', t.total);
  t = play(['S_5', 'C_5']);
  ok(t.chips === 10 + 10, 'Red-Striped: Spades and Clubs give nothing', t.total);
  t = play([['S_5', 'm_wild']]);
  ok(t.chips === 5 + 5 + 20, 'a Wild card counts once (+20, not +40)', t.total);
  ex(b).form = 'blue';
  t = play(['S_5', 'C_5']);
  ok(t.chips === 10 + 10 + 40, 'Blue-Striped: Spades and Clubs +20 each', t.total);
  t = play(['H_5', 'D_5']);
  ok(t.chips === 10 + 10, 'Blue-Striped: red cards nothing', t.total);
  ok(/Blue-Striped: scored \| Clubs and Spades/.test(plain(b)), 'the tooltip names the stripe and its suits', plain(b));
  // art: each stripe its own cell (+ Shiny)
  ex(b).form = 'red';
  ok(JSON.stringify(drawn(b)) === JSON.stringify(['poke_AtlasJokersBasicGen05391', { x: 4, y: 0 }]), 'Red: its own cell, Gen 5 {4,0}', drawn(b));
  ex(b).form = 'blue';
  ok(JSON.stringify(drawn(b)) === JSON.stringify(['poke_AtlasJokersBasicGen05391', { x: 6, y: 0 }]), 'Blue: Gen 5 {6,0} (ui.js ownFace, BASCULIN_SPRITES)', drawn(b));
  ok(JSON.stringify(drawn(b, true)) === JSON.stringify(['poke_AtlasJokersBasicGen05Shiny391', { x: 6, y: 0 }]), 'Blue Shiny: the Shiny sheet\'s {6,0}', drawn(b, true));
  ok(ANIM.BASCULIN_SPRITES && ANIM.BASCULIN_SPRITES.blue.x === 6, 'BASCULIN_SPRITES exported');
});
await sec('stripe resume', () => {
  const both = {};
  for (let i = 0; i < 12 && Object.keys(both).length < 2; i++) {
    const s = new Session();
    s.start({ seed: 'BASRES' + i, customDeck: { name: 'Stripes', mods: ['pokermon'], jokers: [{ key: 'j_poke_basculin' }] } });
    s.act({ type: 'select_blind' }); flush();
    const j = G.jokers.cards.find((c) => key(c) === 'j_poke_basculin');
    const want = ex(j).form, art = JSON.stringify(drawn(j));
    s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 1).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush();
    const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
    const j2 = G.jokers.cards.find((c) => key(c) === 'j_poke_basculin');
    ok(!r.stoppedAt && j2 && ex(j2).form === want && JSON.stringify(drawn(j2)) === art, `resume (BASRES${i}): the ${want} Basculin comes back ${want}, same art`, [want, j2 && ex(j2).form]);
    both[want] = true;
  }
  ok(both.red && both.blue, 'resumed runs of both stripes', both);
});

// ------------------------------------------------------------------- Sandile line: Moxie
await sec('moxie', () => {
  start('SANDI');
  const s = add('j_poke_sandile');
  let t = play(['S_A']);
  ok(near(t.mult, 1), 'Sandile: nothing banked yet', t.total);
  endRound();
  ok(near(ex(s).moxie_mult, 2), 'beating a Blind banks +2 Mult', ex(s).moxie_mult);
  advance();
  t = play(['S_A']);
  ok(near(t.mult, 1 + 2), '... which it gives every hand', t.total);
  // a game over banks nothing
  const was = ex(s).moxie_mult;
  s.calculate_joker({ end_of_round: true, game_over: true }); flush();
  ok(ex(s).moxie_mult === was, 'a lost round (game over) banks nothing', ex(s).moxie_mult);
  // Blueprint copies the Mult, never the bank
  start('SANDBP');
  add('j_blueprint'); const s2 = add('j_poke_sandile');
  endRound();
  ok(near(ex(s2).moxie_mult, 2), 'with Blueprint: still +2 banked (Blueprint never banks)', ex(s2).moxie_mult);
  advance();
  t = play(['S_A']);
  ok(near(t.mult, 1 + 2 + 2), 'Blueprint copies the +2 Mult', t.total);
  // evolution with the bank: 5 rounds (+2 each), then Krokorok +4 each, then Krookodile X0.15 each with the Mult kept
  start('SANDEVO');
  const e = add('j_poke_sandile');
  rounds(4); ok(key(e) === 'j_poke_sandile' && near(ex(e).moxie_mult, 8), 'Sandile after 4 Blinds: +8', [key(e), ex(e).moxie_mult]);
  rounds(1); ok(key(e) === 'j_poke_krokorok' && near(ex(e).moxie_mult, 10), 'the 5th Blind banks first, then Sandile -> Krokorok, keeping +10', [key(e), ex(e).moxie_mult]);
  rounds(5); ok(key(e) === 'j_poke_krookodile' && near(ex(e).moxie_mult, 30) && near(ex(e).moxie_Xmult, 1), 'Krokorok +4 a Blind (+30), -> Krookodile after 5 (X1 to start)', [key(e), ex(e).moxie_mult, ex(e).moxie_Xmult]);
  rounds(2); ok(near(ex(e).moxie_mult, 30) && near(ex(e).moxie_Xmult, 1.3), 'Krookodile banks X0.15 a Blind (X1.3 after 2) and no more Mult', [ex(e).moxie_mult, ex(e).moxie_Xmult]);
  t = play(['S_A']);
  ok(near(t.mult, (1 + 30) * 1.3), 'Krookodile gives the banked +30 Mult and X1.3', t.total);
});

// ------------------------------------------------------------------- Maractus: held Hazards
await sec('maractus', () => {
  start('MARAC');
  add('j_poke_maractus');
  let t = play(['S_A'], { held: [['S_5', 'm_poke_hazard'], ['H_6', 'm_poke_hazard'], 'D_9'] });
  ok(t.chips === 5 + 11 && near(t.mult, 1 + 16), 'Maractus: 2 Hazard cards held: +8 Mult each (the plain held card gives nothing)', t.total);
  clearHand();
  const hz = cards([['S_5', 'm_poke_hazard'], ['H_6', 'm_poke_hazard']]);
  debuff(hz[1]);
  const [a] = cards(['S_A']);
  act({ type: 'highlight', ids: [a.sort_id] }); G.GAME.chips = 0; G.GAME.current_round.hands_left = Math.max(2, G.GAME.current_round.hands_left);
  const r = act({ type: 'play' }); flush();
  ok(near(Number(r.events.find((e) => e.type === 'hand_total').mult), 1 + 8), 'a debuffed Hazard gives nothing', r.events.find((e) => e.type === 'hand_total'));
  undebuff(hz[1]);
  clearHand(); cards([['S_5', 'm_poke_hazard'], 'H_2']);
  ok(/Currently 1: \+8 Mult/.test(plain(G.jokers.cards[0])), 'its tooltip counts the Hazards held now (1: +8)', plain(G.jokers.cards[0]));
  start('MARACMIME');
  add('j_poke_maractus'); add('j_mime');
  t = play(['S_A'], { held: [['S_5', 'm_poke_hazard']] });
  ok(near(t.mult, 1 + 8 + 8), 'Mime retriggers the held Hazard: +8 twice', t.total);
});

// ------------------------------------------------------------------- Dwebble / Crustle: Stone cards in the deck
await sec('dwebble', () => {
  start('DWEB');
  const d = add('j_poke_dwebble');
  let t = play(['S_A']);
  ok(t.chips === 16, 'Dwebble: no Stone cards, nothing', t.total);
  G.playing_cards.filter((c) => c.area === G.deck).slice(0, 3).forEach((c) => c.set_ability(P_CENTERS.m_stone, null, true));
  t = play(['S_A']);
  ok(t.chips === 16 + 15, 'Dwebble: 3 Stone cards in the deck: +15 Chips', t.total);
  ok(/Currently \+15 Chips/.test(plain(d)), 'its tooltip: +15', plain(d));
  rounds(5); ok(key(d) === 'j_poke_crustle', 'Dwebble -> Crustle after 5 rounds', key(d));
  const n = G.playing_cards.filter((c) => key(c) === 'm_stone').length;
  t = play(['S_A']);
  ok(t.chips === 16 + 10 * n, `Crustle: +10 per Stone card (${n})`, [t.total, n]);
});

// ------------------------------------------------------------------- Sigilyph: Foresight + the Pair Planet
await sec('sigilyph', () => {
  start('SIGIL');
  const f0 = G.GAME.scry_amount || 0;
  const s = add('j_poke_sigilyph');
  ok(G.GAME.scry_amount === f0 + 2, 'Sigilyph: +2 Foresight', [f0, G.GAME.scry_amount]);
  const p0 = G.GAME.hands.Pair.level, t0 = G.GAME.hands['Three of a Kind'].level;
  use('c_mercury');
  ok(G.GAME.hands.Pair.level === p0 + 2, 'Mercury (Pair) levels Pair twice: its own + Sigilyph\'s', [p0, G.GAME.hands.Pair.level]);
  use('c_venus');
  ok(G.GAME.hands['Three of a Kind'].level === t0 + 1, 'another Planet (Venus) only its own level', [t0, G.GAME.hands['Three of a Kind'].level]);
  add('j_blueprint');
  G.jokers.cards = [G.jokers.cards[1], G.jokers.cards[0]];
  use('c_mercury');
  ok(G.GAME.hands.Pair.level === p0 + 4, 'Blueprint copies nothing (Mercury +1, Sigilyph +1)', G.GAME.hands.Pair.level);
  s.remove(); flush();
  ok(G.GAME.scry_amount === f0, 'gone: the Foresight with it');
});

// ------------------------------------------------------------------- Yamask / Cofagrigus: sales and Mummy
await sec('yamask', () => {
  start('YAMA');
  const y = add('j_poke_yamask');
  const j = add('j_joker');
  const d0 = G.GAME.dollars, cost = j.sell_cost;
  sell(j);
  ok(!G.jokers.cards.includes(j) && G.GAME.dollars === d0 + cost && near(ex(y).grudge_Xmult, 1.1), 'Yamask: a Joker sold (paid as usual) banks X0.1', [ex(y).grudge_Xmult, G.GAME.dollars - d0]);
  const t = play(['S_A']);
  ok(near(t.mult, 1.1), '... X1.1 every hand', t.total);
  sell(add('c_mercury'));
  ok(near(ex(y).grudge_Xmult, 1.1), 'a consumable sold doesn\'t count', ex(y).grudge_Xmult);
  // evolution keeps the bank
  start('YAMAEVO');
  const e = add('j_poke_yamask');
  sell(add('j_joker'));
  rounds(5);
  ok(key(e) === 'j_poke_cofagrigus' && near(ex(e).grudge_Xmult, 1.1), 'Yamask -> Cofagrigus after 5 rounds, X1.1 kept', [key(e), ex(e).grudge_Xmult]);
});
await sec('mummy', () => {
  start('MUMMY');
  const cof = add('j_poke_cofagrigus');
  const a = add('j_joker'), b = add('j_joker');
  const lim0 = G.jokers.config.card_limit, n0 = G.jokers.cards.length, d0 = G.GAME.dollars;
  sell(a);
  ok(G.jokers.cards.includes(a) && a.edition && a.edition.negative, 'Mummy: the round\'s first Joker sold is not sold: it stays, Negative', [G.jokers.cards.includes(a), a.edition]);
  ok(G.GAME.dollars === d0, '... no money is paid', [d0, G.GAME.dollars]);
  ok(G.jokers.cards.length === n0 && G.jokers.config.card_limit === lim0 + 1, '... its Negative +1 slot: 3 jokers, 6 slots (it takes no slot)', [G.jokers.cards.length, G.jokers.config.card_limit]);
  ok(near(ex(cof).grudge_Xmult, 1.2), '... and it counts as a sale: X0.2', ex(cof).grudge_Xmult);
  ok(/Mummy: used this round/.test(plain(cof)), 'the tooltip: used this round', plain(cof));
  const bc = b.sell_cost;
  sell(b);
  ok(!G.jokers.cards.includes(b) && G.GAME.dollars === d0 + bc && near(ex(cof).grudge_Xmult, 1.4), 'the second Joker this round sells as usual ($ paid), X0.2 more', [G.GAME.dollars - d0, ex(cof).grudge_Xmult]);
  const ac = a.sell_cost;
  ok(ac > 1, 'the mummified Joker\'s sell value is a Negative\'s now', ac);
  sell(a);
  ok(!G.jokers.cards.includes(a) && G.GAME.dollars === d0 + bc + ac && G.jokers.config.card_limit === lim0, 'sold later: paid its (Negative) sell value, and its slot goes with it', [G.GAME.dollars - d0, G.jokers.config.card_limit]);
  // a new round: ready again; a Negative Joker first sells as usual and uses it up
  endRound(); advance();
  ok(/Mummy: ready/.test(plain(cof)), 'a new round: Mummy ready', plain(cof));
  const neg = add('j_joker', 'negative'), c2 = add('j_joker');
  const d1 = G.GAME.dollars, nc = neg.sell_cost;
  sell(neg);
  ok(!G.jokers.cards.includes(neg) && G.GAME.dollars === d1 + nc, 'an already Negative Joker is sold as usual', [G.GAME.dollars - d1, nc]);
  const cc = c2.sell_cost;
  sell(c2);
  ok(!G.jokers.cards.includes(c2) && G.GAME.dollars === d1 + nc + cc, '... and it was the round\'s first sale: the next one sells too', G.GAME.dollars - d1);
  // the shop belongs to the round it follows: used in that Blind, used in its shop too
  endRound();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  ok(state() === 'SHOP', 'in the shop');
  const sh = add('j_joker');
  sell(sh);
  ok(!G.jokers.cards.includes(sh), 'the shop after a Blind whose Mummy was used: sold as usual', G.jokers.cards.includes(sh));
  act({ type: 'next_round' }); G.GAME.round_resets.blind_choices.Boss = 'bl_wall'; act({ type: 'select_blind' }); flush(); clearHand();
  // a Blind with no sale: the first sale in its shop is caught
  endRound();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  const sh2 = add('j_joker');
  sell(sh2);
  ok(G.jokers.cards.includes(sh2) && sh2.edition && sh2.edition.negative, 'a Blind with no sale: the first sale in its shop is mummified (once a round: the Blind and its shop)', sh2.edition);
  const sh3 = add('j_joker');
  sell(sh3);
  ok(!G.jokers.cards.includes(sh3), '... once', G.jokers.cards.includes(sh3));
  act({ type: 'next_round' }); G.GAME.round_resets.blind_choices.Boss = 'bl_wall'; act({ type: 'select_blind' }); flush(); clearHand();
  // Cofagrigus itself sells as usual
  const d2 = G.GAME.dollars, cofc = cof.sell_cost;
  sell(cof);
  ok(!G.jokers.cards.includes(cof) && G.GAME.dollars === d2 + cofc, 'Cofagrigus itself is never mummified: sold, paid', [G.GAME.dollars - d2, cofc]);
  // debuffed: no Mummy
  start('MUMDEB');
  const cd = add('j_poke_cofagrigus'); const x = add('j_joker');
  debuff(cd);
  sell(x);
  ok(!G.jokers.cards.includes(x), 'a debuffed Cofagrigus: no Mummy (sold)');
  // Blueprint can't copy Mummy: one a round however it is copied
  start('MUMBP');
  const bp = add('j_blueprint'); const cb = add('j_poke_cofagrigus'); const m1 = add('j_joker'), m2 = add('j_joker');
  ok(G.jokers.cards.indexOf(bp) + 1 === G.jokers.cards.indexOf(cb), 'Blueprint copies Cofagrigus (its right neighbour)');
  sell(m1); sell(m2);
  ok(G.jokers.cards.includes(m1) && !G.jokers.cards.includes(m2), 'with Blueprint copying it: still ONE Mummy a round (the second sells)', [G.jokers.cards.includes(m1), G.jokers.cards.includes(m2)]);
  ok(near(ex(cb).grudge_Xmult, 1.4), 'Blueprint never banks: X0.2 a sale on Cofagrigus only (X1.4)', ex(cb).grudge_Xmult);
  start('MUMBP2');
  add('j_blueprint'); const yk = add('j_poke_yamask'); const m3 = add('j_joker');
  sell(m3);
  ok(!G.jokers.cards.includes(m3) && near(ex(yk).grudge_Xmult, 1.1), 'Yamask (and a Blueprint of it) has no Mummy: sold', ex(yk).grudge_Xmult);
  // a full row: the mummified Joker stays and a slot opens
  start('MUMFULL');
  const cf = add('j_poke_cofagrigus'); for (let i = 0; i < 4; i++) add('j_joker');
  ok(G.jokers.cards.length === G.jokers.config.card_limit, 'a full row (5 / 5)');
  sell(G.jokers.cards[2]);
  ok(G.jokers.cards.length === 5 && G.jokers.config.card_limit === 6, 'mummified: 5 jokers, 6 slots (a slot opens, nothing over the limit)', [G.jokers.cards.length, G.jokers.config.card_limit]);
  // Yamask + Cofagrigus: the mummy counts for both
  start('MUMYAM');
  const y2 = add('j_poke_yamask'), c3 = add('j_poke_cofagrigus'), v = add('j_joker');
  sell(v);
  ok(G.jokers.cards.includes(v) && near(ex(y2).grudge_Xmult, 1.1) && near(ex(c3).grudge_Xmult, 1.2), 'a mummified Joker counts as sold for the whole line (Yamask X1.1, Cofagrigus X1.2)', [ex(y2).grudge_Xmult, ex(c3).grudge_Xmult]);
  // a consumable is never mummified
  start('MUMCON');
  add('j_poke_cofagrigus');
  const pl = add('c_mercury'); const dd = G.GAME.dollars, pc = pl.sell_cost;
  sell(pl);
  ok(!G.consumeables.cards.includes(pl) && G.GAME.dollars === dd + pc, 'a consumable sells as usual', [G.GAME.dollars - dd, pc]);
  // the X scores
  start('MUMX');
  const cx = add('j_poke_cofagrigus'); sell(add('j_joker'));
  const t = play(['S_A']);
  ok(near(t.mult, 1 * 1.2 + 4), 'Cofagrigus X1.2 after one (mummified) sale; the mummified Joker still gives its +4 (it stayed)', [t.total, ex(cx).grudge_Xmult]);
  // resume: the recipe rebuilds the mummified Joker
  const s = new Session();
  s.start({ seed: 'MUMRES', customDeck: { name: 'Tomb', mods: ['pokermon'], jokers: [{ key: 'j_poke_cofagrigus' }, { key: 'j_joker' }] } });
  s.act({ type: 'select_blind' }); flush();
  const jj = G.jokers.cards.find((c) => key(c) === 'j_joker');
  s.act({ type: 'sell', id: jj.sort_id }); flush();
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  const j2 = G.jokers.cards.find((c) => key(c) === 'j_joker');
  ok(!r.stoppedAt && j2 && j2.edition && j2.edition.negative && G.jokers.config.card_limit === 6, 'resume: the mummified Joker comes back Negative, the row 2 / 6', [r.stoppedAt, j2 && j2.edition, G.jokers.config.card_limit]);
});

// ------------------------------------------------------------------- the fossils: Ancient 9s / 10s, evolution by the 3+ count
await sec('ancient 9s', () => {
  start('TIRT');
  const t9 = add('j_poke_tirtouga');
  let t = play(['S_9']);
  ok(t.chips === 5 + 9 + 30, 'Tirtouga, one 9: +30 Chips', t.total);
  t = play(['S_9', 'H_9']);
  ok(t.chips === 10 + 18 + 30 && t.cards.every((c) => c.ability.perma_bonus === 5), 'two 9s: +30, and each scored 9 gains +5 Chips for good (from its next score)', [t.total, t.cards.map((c) => c.ability.perma_bonus)]);
  ok((ex(t9).third_times || 0) === 0, 'no 3+ yet');
  t = play(['S_9', 'H_9', 'D_9']);
  ok(t.chips === 30 + 27 + 30 + 50 && ex(t9).third_times === 1, 'three 9s: +30 +50, the 3+ tier counted (1/5)', [t.total, ex(t9).third_times]);
  // replay the same 9s: their +5 now scores
  clearHand();
  for (const c of t.cards) retake(c);
  act({ type: 'highlight', ids: t.cards.map((c) => c.sort_id) }); G.GAME.chips = 0; G.GAME.current_round.hands_left = Math.max(2, G.GAME.current_round.hands_left);
  const r = act({ type: 'play' }); flush();
  ok(Number(r.events.find((e) => e.type === 'hand_total').chips) === 30 + 27 + 15 + 80 && t.cards.every((c) => c.ability.perma_bonus === 10), 'the same 9s again: +5 each scored, now +10 banked', r.events.find((e) => e.type === 'hand_total'));
  ok(ex(t9).third_times === 2, '2/5');
  ok(/Trigger 3\+ ability 3 times to evolve/.test(plain(t9)), 'its tooltip counts down (3 to go)', plain(t9));
  // Blueprint copies the tiers but never counts
  add('j_blueprint');
  G.jokers.cards = [G.jokers.cards[1], G.jokers.cards[0]];
  t = play(['S_9', 'H_9', 'D_9']);
  ok(t.chips === 30 + 27 + 160 && ex(t9).third_times === 3, 'with Blueprint: +80 twice, counted once (3/5)', [t.total, ex(t9).third_times]);
  G.jokers.cards[0].remove(); flush();
  play(['S_9', 'H_9', 'D_9']);
  endRound();
  ok(key(t9) === 'j_poke_tirtouga' && ex(t9).third_times === 4, '4 times: still Tirtouga after the round', [key(t9), ex(t9).third_times]);
  advance();
  play(['S_9', 'H_9', 'D_9', 'C_9']);
  ok(ex(t9).third_times === 5 && key(t9) === 'j_poke_tirtouga', '5 times (a 4-of-a-kind counts as 3+ too): evolves at the end of the round', ex(t9).third_times);
  endRound();
  ok(key(t9) === 'j_poke_carracosta', 'Tirtouga -> Carracosta', key(t9));
  advance();
  // Carracosta: 4+ retriggers each scored 9 (their +5 grows between the scorings)
  t = play(['S_9', 'H_9', 'D_9', 'C_9']);
  ok(t.chips === 60 + 4 * (9 + 14) + 80 && t.cards.every((c) => c.ability.perma_bonus === 10), 'Carracosta, four 9s: each scores twice (9, then 9 + 5), +30 +50', [t.total, t.cards.map((c) => c.ability.perma_bonus)]);
  t = play(['S_9', 'H_9', 'D_9']);
  ok(t.chips === 30 + 27 + 80, 'three 9s: no retrigger (4+ only)', t.total);
});
await sec('ancient 10s', () => {
  start('ARCH');
  const a = add('j_poke_archen');
  let t = play(['S_T']);
  ok(t.chips === 5 + 10 && near(t.mult, 1 + 4), 'Archen, one 10: +4 Mult', t.total);
  t = play(['S_T', 'H_T']);
  ok(near(t.mult, (2 + 4) * 1.25), 'two 10s: +4, X1.25', t.total);
  let d0 = G.GAME.dollars;
  t = play(['S_T', 'H_T', 'D_T']);
  ok(near(t.mult, (3 + 4) * 1.25) && G.GAME.dollars === d0 + 3 && ex(a).third_times === 1, 'three 10s: +4, X1.25, earn $3 (counted 1/5)', [t.total, G.GAME.dollars - d0, ex(a).third_times]);
  t = play(['S_T', 'H_T', 'D_T', 'C_T']);
  ok(near(t.mult, (7 + 4) * 1.25) && ex(a).third_times === 2, 'Archen, four 10s: no 4+ tier (X1.25 only)', t.total);
  for (let i = 0; i < 3; i++) play(['S_T', 'H_T', 'D_T']);
  ok(ex(a).third_times === 5 && key(a) === 'j_poke_archen', '5 times', ex(a).third_times);
  endRound();
  ok(key(a) === 'j_poke_archeops', 'Archen -> Archeops at the end of the round', key(a));
  advance();
  t = play(['S_T', 'H_T', 'D_T', 'C_T']);
  d0 = G.GAME.dollars;
  ok(near(t.mult, (7 + 4) * 1.25 * 2), 'Archeops, four 10s: +4, X1.25 and X2', t.total);
  t = play(['S_T', 'H_T', 'D_T']);
  ok(near(t.mult, (3 + 4) * 1.25) && G.GAME.dollars === d0 + 3, 'three 10s: $3', [t.total, G.GAME.dollars - d0]);
  ok(/This hand: full/.test(plain(a)), 'its tooltip: full strength (not the final hand)', plain(a));
  // Defeatist: the final hand halves everything
  d0 = G.GAME.dollars;
  t = play(['S_T', 'H_T', 'D_T', 'C_T'], { last: true });
  ok(near(t.mult, (7 + 2) * 1.125 * 1.5) && G.GAME.dollars === d0 + 1, 'Defeatist, the final hand: +2, X1.125, X1.5, $1', [t.total, G.GAME.dollars - d0]);
  // energized numbers, halved too
  start('ARCHEN');
  const b = add('j_poke_archeops');
  increment_energy(b, 'Earth');
  ok(near(ex(b).mult, 5.6) && near(ex(b).Xmult, 1.5) && near(ex(b).Xmult2, 2.4) && ex(b).ancient_money === 3, 'Archeops + Earth Energy: +5.6 Mult, X1.5, X2.4; $3 fixed', ex(b));
  t = play(['S_T', 'H_T', 'D_T', 'C_T']);
  ok(near(t.mult, (7 + 5.6) * 1.5 * 2.4), 'energized: (7 + 5.6) x 1.5 x 2.4', t.total);
  t = play(['S_T', 'H_T', 'D_T', 'C_T'], { last: true });
  ok(near(t.mult, (7 + 2.8) * 1.25 * 1.7), 'energized, the final hand: +2.8, X1.25, X1.7', t.total);
});

// ------------------------------------------------------------------- Minccino / Cinccino
await sec('tidy up', () => {
  start('MINC', {}, { noBlind: true });
  const base = G.hand.config.card_limit;
  const m = add('j_poke_minccino');
  act({ type: 'select_blind' }); flush();
  ok(G.hand.cards.length === base, 'Minccino: the deal is the usual 8');
  discard(G.hand.cards.slice(0, 2));
  ok(G.hand.cards.length === base + 1 && G.hand.config.card_limit === base + 1, 'a discard draws 1 extra card (9 in hand; +1 hand size until the next hand)', [G.hand.cards.length, G.hand.config.card_limit]);
  discard(G.hand.cards.slice(0, 1));
  ok(G.hand.cards.length === base + 2, 'each discard (10 after two)', G.hand.cards.length);
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
  act({ type: 'play' }); flush();
  ok(G.hand.config.card_limit === base && G.hand.cards.length === base && ex(m).tidy_draws === 0, 'playing a hand takes the +2 back: hand size 8, refilled to 8', [G.hand.config.card_limit, G.hand.cards.length]);
  discard(G.hand.cards.slice(0, 1));
  m.remove(); flush();
  ok(G.hand.config.card_limit === base, 'sold / gone with one pending: the hand size is back', G.hand.config.card_limit);
  // an effect discard doesn't count
  start('MINC2');
  const m2 = add('j_poke_minccino');
  const [h] = cards(['S_4']); G.hand.highlighted = [h];
  discard_cards_from_highlighted(true); flush();
  ok(!ex(m2).tidy_draws, 'an effect discard (hook) draws nothing extra');
  rounds(5); ok(key(m2) === 'j_poke_cinccino', 'Minccino -> Cinccino after 5 rounds', key(m2));
  ok(G.hand.config.card_limit === 8, 'hand size back to 8 after evolving');
});
await sec('skill link', () => {
  start('CINC');
  const c = add('j_poke_cinccino');
  let t = play(['S_K']);
  ok(t.chips === 5 + 10, 'Cinccino: no discard this round, no retrigger', t.total);
  discard(cards(['H_2'])); discard(cards(['H_3']));
  t = play(['S_K', 'S_Q']);
  ok(t.chips === 5 + 10 * 3, 'after 2 discards: the first scored card (the King; the Queen is not scored) retriggers twice', t.total);
  t = play(['S_K', 'H_K']);
  ok(t.chips === 10 + 10 * 3 + 10, 'a Pair: only the FIRST scored King retriggers (twice)', t.total);
  for (let i = 0; i < 6; i++) discard(cards(['C_2']));
  ok(G.GAME.current_round.discards_used === 8, '8 discards used');
  t = play(['S_K']);
  ok(t.chips === 5 + 10 * 6, 'capped at 5 retriggers', t.total);
  ok(/Max 5; currently 5/.test(plain(c)), 'its tooltip: max 5, currently 5', plain(c));
  endRound(); advance();
  t = play(['S_K']);
  ok(t.chips === 15, 'a new round starts at 0', t.total);
  add('j_blueprint');
  G.jokers.cards = [G.jokers.cards[1], G.jokers.cards[0]];
  discard(cards(['H_2']));
  t = play(['S_K']);
  ok(t.chips === 5 + 10 * 3, 'Blueprint copies Skill Link (1 + 1 + 1)', t.total);
});

// ------------------------------------------------------------------- Energy: each line's main number at the standard rate
await sec('energy', () => {
  const steps = (n, field, type, want) => {
    start('EN' + n);
    const j = add('j_poke_' + n);
    const got = [];
    for (let i = 0; i < 3; i++) { increment_energy(j, type); got.push(r3(ex(j)[field])); }
    ok(got.every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${field} ${want.join(' / ')}`, got);
    return j;
  };
  const r3 = (x) => Math.round(x * 1000) / 1000;
  steps('leavanny', 'mult', 'Grass', [4.2, 5.4, 6.6]);
  steps('venipede', 'mult_mod', 'Dark', [3.6, 4.2, 4.8]);
  const w = steps('whirlipede', 'mult_mod', 'Dark', [6, 7, 8]);
  ok(ex(w).chip_loss === 3, 'the -3 Chips stays fixed', ex(w).chip_loss);
  const b = steps('basculin', 'chips', 'Water', [26, 32, 38]);
  ex(b).form = 'red';
  let t = play(['H_5']);
  ok(t.chips === 10 + 38, 'energized Basculin: +38', t.total);
  steps('sandile', 'mult_mod', 'Dark', [2.4, 2.8, 3.2]);
  steps('krokorok', 'mult_mod', 'Dark', [4.8, 5.6, 6.4]);
  steps('krookodile', 'Xmult_mod', 'Dark', [0.18, 0.21, 0.24]);
  steps('maractus', 'mult', 'Grass', [11.2, 14.4, 17.6]);
  t = play(['S_A'], { held: [['S_5', 'm_poke_hazard']] });
  ok(near(t.mult, 1 + 17.6), 'energized Maractus: +17.6 per held Hazard', t.total);
  steps('dwebble', 'chips', 'Earth', [6.5, 8, 9.5]);
  steps('crustle', 'chips', 'Earth', [13, 16, 19]);
  steps('yamask', 'Xmult_mod', 'Psychic', [0.12, 0.14, 0.16]);
  const cf = steps('cofagrigus', 'Xmult_mod', 'Psychic', [0.24, 0.28, 0.32]);
  ok(near(ex(cf).grudge_Xmult, 1), 'the bank is not raised (X1: never retroactive)', ex(cf).grudge_Xmult);
  const tt = steps('tirtouga', 'chips1', 'Water', [39, 48, 57]);
  ok(near(ex(tt).chips2, 9.5) && near(ex(tt).chips3, 95), 'Tirtouga, 3 Energy: 2+ +9.5, 3+ +95 too (chips2 / chips3 +30%)', ex(tt));
  steps('archen', 'mult', 'Earth', [5.6, 7.2, 8.8]);
  steps('archen', 'Xmult', 'Earth', [1.5, 1.75, 2]);
  // Energy carries: Sewaddle's unused +3 (Leavanny's) is raised and re-applied at each evolution
  start('ENCARRY');
  const s = add('j_poke_sewaddle');
  increment_energy(s, 'Grass');
  ok(near(ex(s).mult, 4.2), 'Sewaddle + Grass Energy: its carried +3 -> +4.2', ex(s).mult);
  rounds(9);
  ok(key(s) === 'j_poke_leavanny' && ex(s).energy_count === 1 && near(ex(s).mult, 4.2), 'Sewaddle -> Swadloon -> Leavanny keeps the Energy: +4.2 per enhanced card', [key(s), ex(s).mult]);
  t = play([['S_5', 'm_bonus']]);
  ok(near(t.mult, 1 + 4.2), 'energized Leavanny: +4.2', t.total);
  // the banks keep what they were worth: Sandile's +2 banked, then Energy, then +2.4
  start('ENBANK');
  const sd = add('j_poke_sandile');
  endRound(); advance();
  increment_energy(sd, 'Dark');
  endRound();
  ok(near(ex(sd).moxie_mult, 4.4), 'Sandile: +2 banked, then energized: +2.4 (4.4; the first +2 not raised)', ex(sd).moxie_mult);
});

// ------------------------------------------------------------------- the art: real cells
if (ART) {
  await sec('art cells', async () => {
    const ATL = MODS.pokermon.content.atlases;
    const file = (atlas) => path.join(ART, decodeURIComponent(ATL[atlas].src).replace(/^.*\/assets\/2x\//, ''));
    start('BASPX');
    const cases = [];
    for (const f of ['red', 'blue']) for (const sh of [false, true]) { const j = add('j_poke_basculin'); ex(j).form = f; const [atlas, pos] = drawn(j, sh); cases.push({ f, sh, atlas, pos }); }
    const byFile = {};
    cases.forEach((c, i) => { (byFile[file(c.atlas)] || (byFile[file(c.atlas)] = {}))[i] = [c.pos.x * 142 + 20, c.pos.y * 190 + 40, 102, 100]; });
    const px = {};
    for (const [f, rects] of Object.entries(byFile)) Object.assign(px, await crops(f, rects));
    // the stripe: red pixels on the Red-Striped fish, blue on the Blue-Striped one (the art area's background is light green)
    const count = (r, test) => { let n = 0; for (let i = 0; i < r.px.length; i += 4) if (r.px[i + 3] && test(r.px[i], r.px[i + 1], r.px[i + 2])) n++; return n; };
    const red = (R, Gc, B) => R > 140 && R - Gc > 90 && R - B > 90;
    const blue = (R, Gc, B) => B > 140 && B - R > 120 && B - Gc > 35;
    const got = cases.map((c, i) => [c.f + (c.sh ? ' shiny' : ''), px[i] && px[i].inside, px[i] && count(px[i], red), px[i] && count(px[i], blue)]);
    ok(got.every(([n, inside, r, b]) => inside && (/red/.test(n) ? r > 3 * b && r > 20 : b > 3 * r && b > 20)), 'each stripe\'s card is the right picture: Red more red pixels, Blue more blue (Shiny too)', got);
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const r = typer.typeOfEntry({ atlas: 'AtlasJokersBasicGen05', pos: [6, 0] });
    ok(r && r.ptype === 'Water', 'the Blue-Striped cell shows the Water icon too', r);
  });
} else console.log('(Pokermon art not on disk: the sprite checks are skipped; set MICATRO_MAIN)');

done();
