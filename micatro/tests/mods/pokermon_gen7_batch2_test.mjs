// Gen 7, batch 2 (the owner's "Yes build it and merge when the gate passes", 2026-11-02; jokers/pokejokers_designs.js "Gen 7, batch 2";
// PORTING.md "Gen 7, batch 2"): 13 jokers, #757-784, on the guide's price slots (3-stage U $6 / S $8 / S $10, 2-stage C $5 / S $8,
// single-stage R $7), in Pokédex order:
//   Salandit 757 -> Salazzle (Fire)        +1 discard; scored Queens +5 Mult / X1.5. The gender is rolled when OBTAINED (seeded, 50/50, kept
//                                          on the card, shown ♀ / ♂); only a ♀ evolves (5 rounds), a ♂ never does.
//   Stufful 759 -> Bewear (Fighting)       +40 Chips and +4 Mult (5 rounds) / X2.5; Strong Hug: at end of round, 1 in 4 to destroy the Joker
//                                          directly to its right (not Eternal; nothing if none; Oops! doubles; not Blueprint).
//   Comfey 764 (Fairy, R $7)               Floral Gift: at end of round, 1 in 3 to give +1 Energy (full strength, any type) to a random OTHER
//                                          Pokémon Joker still under its Energy cap. Energy-inert itself.
//   Sandygast 769 -> Palossand (Psychic)   +10 Chips banked per scored Stone card / X0.05 banked from X1 (Palossand keeps giving the Chips).
//   Pyukumuku 771 (Water, R $7)            +10 Chips banked each end of round; Innards Out: sold or destroyed, $1 per round held.
//   Komala 775 (Colorless, R $7)           X1.5; Comatose: can't be debuffed, and a Joker can't destroy it (no_destroy).
//   Bruxish 779 (Water, R $7)              Strong Jaw: every scored card with a seal retriggers once.
//   Jangmo-o 782 -> Hakamo-o -> Kommo-o    +2 / +4 Mult banked per Full House played (evolving at +16 / +40); Kommo-o keeps the bank and
//   (Dragon)                               gives X1 + X0.15 per Full House played this run (G.GAME.hands['Full House'].played).
// Every ability is FIRED through real hands / rounds / Blinds / sales with exact numbers.
//   node micatro/tests/mods/pokermon_gen7_batch2_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_card } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { ART } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 900)); } };
const ex = (j) => j.ability.extra;
const C = (n) => P_CENTERS['j_poke_' + n];
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const LINES = {
  salandit: ['salandit', 'salazzle'], stufful: ['stufful', 'bewear'], comfey: ['comfey'], sandygast: ['sandygast', 'palossand'],
  pyukumuku: ['pyukumuku'], komala: ['komala'], bruxish: ['bruxish'], jangmoo: ['jangmoo', 'hakamoo', 'kommoo'],
};
const NAMES = Object.values(LINES).flat();
const owned = (j) => G.jokers.cards.includes(j);
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
/** Put cards in hand: a list of keys, or [key, center] / [key, center, seal] entries (the first is the leftmost). */
function cards(list) {
  return list.map((k) => {
    if (!Array.isArray(k)) return hand([k])[0];
    const c = hand([k[0]], { center: k[1] || 'c_base' })[0];
    if (k[2]) c.set_seal(k[2], true);
    return c;
  });
}
/** Play `list` (the round never ends by accident unless `last`). */
function play(list, { last = false } = {}) {
  clearHand();
  const cs = cards(list);
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (last) G.GAME.current_round.hands_left = 1;
  else if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const events = (r && r.events) || [];
  const total = events.find((e) => e.type === 'hand_total') || {};
  return { cards: cs, events, total, mult: Number(total.mult), chips: Number(total.chips) };
}
/** Win the round in progress (High Card 2) -> ROUND_EVAL. */
function endRound() { clearHand(); const c = hand(['S_2']); G.GAME.chips = G.GAME.blind.chips; if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2; act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush(); }
function toShop() { if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' }); flush(); }
function nextBlind(boss = 'bl_wall') {
  toShop();
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = boss;
  act({ type: 'select_blind' }); flush();
  clearHand();
}
const rounds = (n) => { for (let r = 0; r < n; r++) { endRound(); nextBlind(); } };
function use(k, targets) {
  const c = add(k);
  const r = act({ type: 'use', id: c.sort_id, targets: (targets || []).map((x) => x.sort_id) });
  flush();
  return r;
}
const FH = ['S_K', 'H_K', 'D_K', 'S_Q', 'H_Q'];          // a Full House, mixed suits: 40 + 50 Chips, 4 Mult
const FLUSH_HOUSE = ['H_K', 'H_K', 'H_K', 'H_Q', 'H_Q']; // a Flush House: its own poker hand

// ------------------------------------------------------------------- pin, static data, order, families, Energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 65 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 65+ (Gen 7 batch 2)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of NAMES) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs');
  }
  const hits = [];
  const re = new RegExp('\\b(' + NAMES.join('|') + ')\\b', 'i');
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the 13 (nothing to dedupe)', hits);
});
await sec('static', () => {
  start('G7B2S');
  const S = 'poke_safari';
  // [rarity, cost, stage, type, rounds|undefined, x, y] (all on the 3.9.1 Natdex sheet)
  const WANT = {
    salandit: [1, 5, 'Basic', 'Fire', 5, 12, 50], salazzle: [S, 8, 'One', 'Fire', undefined, 14, 50],
    stufful: [1, 5, 'Basic', 'Fighting', 5, 16, 50], bewear: [S, 8, 'One', 'Fighting', undefined, 18, 50],
    comfey: [3, 7, 'Basic', 'Fairy', undefined, 26, 50],
    sandygast: [1, 5, 'Basic', 'Psychic', 5, 6, 51], palossand: [S, 8, 'One', 'Psychic', undefined, 8, 51],
    pyukumuku: [3, 7, 'Basic', 'Water', undefined, 10, 51], komala: [3, 7, 'Basic', 'Colorless', undefined, 18, 51],
    bruxish: [3, 7, 'Basic', 'Water', undefined, 26, 51],
    jangmoo: [2, 6, 'Basic', 'Dragon', undefined, 2, 52], hakamoo: [S, 8, 'One', 'Dragon', undefined, 4, 52], kommoo: [S, 10, 'Two', 'Dragon', undefined, 6, 52],
  };
  ok(Object.keys(WANT).length === 13 && NAMES.length === 13, '13 jokers');
  for (const [n, [rarity, cost, stage, type, rnds, x, y]] of Object.entries(WANT)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === type && c.config.extra.ptype === type && c.gen === 7,
      `${n}: ${rarity} $${cost}, ${stage}, ${type}, Gen 7`, [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.config.extra.rounds === rnds, `${n}: ${rnds ? 'evolves after ' + rnds + ' rounds' : 'no round timer'}`, c.config.extra.rounds);
    ok(c.atlas === 'poke_AtlasJokersBasicNatdex391' && c.pos.x === x && c.pos.y === y && !c.soul_pos, `${n}: upstream 3.9.1 cell Natdex {${x},${y}} (nothing to deploy)`, [c.atlas, c.pos]);
  }
  ok(C('jangmoo').config.evo_rqmt === 16 && C('hakamoo').config.evo_rqmt === 40, 'Jangmo-o evolves at +16 Mult, Hakamo-o at +40 (scaling_evo)');
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const run = (from, list, to) => { const i = keys.indexOf('j_poke_' + list[0]); return i > 0 && [from, ...list, to].every((k, n) => keys[i - 1 + n] === 'j_poke_' + k) ? true : keys.slice(i - 1, i + list.length + 1); };
  const RUNS = [
    [keys[keys.indexOf('j_poke_salandit') - 1].slice(7), ['salandit', 'salazzle', 'stufful', 'bewear', 'comfey', 'sandygast', 'palossand', 'pyukumuku', 'komala'], 'mimikyu'],
    ['mimikyu', ['bruxish'], 'drampa'],
    ['mega_drampa', ['jangmoo', 'hakamoo', 'kommoo'], 'grookey'],
  ];
  const before = keys[keys.indexOf('j_poke_salandit') - 1];
  ok(P_CENTERS[before] && P_CENTERS[before].gen === 7 && keys.indexOf(before) > keys.indexOf('j_poke_mudsdale') - 1, 'Salandit follows the last Gen 7 joker before #757 (Mudsdale, or Gen 7 batch 1\'s last)', before);
  for (const [from, list, to] of RUNS) ok(run(from, list, to) === true, `Pokédex order: ${from}, ${list.join(', ')}, ${to}`, run(from, list, to));
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
  for (const line of Object.values(LINES)) if (line.length > 1) ok(fam(line[0]) === line.join(), 'one family: ' + line.join(' -> '), fam(line[0]));
  const inert = ['comfey', 'bruxish'];
  ok(inert.every((n) => C(n).poke_no_energy_field === true) && NAMES.filter((n) => !inert.includes(n)).every((n) => !C(n).poke_no_energy_field),
    'Energy-inert by design (poke_no_energy_field): Comfey (a gift, odds), Bruxish (a retrigger)');
  ok(['d_size', 'num', 'dem', 'retriggers', 'castle_chips', 'castle_Xmult', 'innards_chips', 'innards_money', 'held_rounds', 'clang_mult', 'gender'].every((f) => !(f in energy_values)),
    'fixed: the discard, the odds, the retrigger, the $, the round count, the banks, the gender (no energy field)');
});

// ------------------------------------------------------------------- Salandit / Salazzle
await sec('salandit', () => {
  // the gender: none on a shop card, rolled (seeded) when obtained, both seen across seeds
  const seen = { female: 0, male: 0 };
  for (let i = 0; i < 24; i++) {
    start('SALG' + i);
    const shop = create_card('Joker', G.jokers, null, null, null, null, 'j_poke_salandit');
    ok(ex(shop).gender === undefined, 'a created (shop) Salandit has no gender yet');
    if (i === 0) ok(/Gender rolled when obtained/.test(plain(shop)) && /Only ♀ evolves, after 5 rounds/.test(plain(shop)), 'its shop tooltip: rolled when obtained, only ♀ evolves', plain(shop));
    const s = add('j_poke_salandit');
    seen[ex(s).gender] = (seen[ex(s).gender] || 0) + 1;
    start('SALG' + i);
    const again = add('j_poke_salandit');
    ok(ex(again).gender === ex(s).gender, 'seeded: the same run gives the same gender', [ex(s).gender, ex(again).gender]);
  }
  ok(seen.female >= 5 && seen.male >= 5 && seen.female + seen.male === 24, 'both genders come up (24 runs: ' + seen.female + ' ♀, ' + seen.male + ' ♂)', seen);
  start('SALANDIT');
  const d0 = G.GAME.round_resets.discards;
  const s = add('j_poke_salandit');
  ok(G.GAME.round_resets.discards === d0 + 1, '+1 discard each round', [d0, G.GAME.round_resets.discards]);
  const g = ex(s).gender;
  ok(g === 'female' || g === 'male', 'obtained: a gender', g);
  // a debuff + un-debuff runs add_to_deck again: the gender is kept
  s.remove_from_deck(true); s.add_to_deck(true); flush();
  ok(ex(s).gender === g && G.GAME.round_resets.discards === d0 + 1, 'add_to_deck again (from a debuff): the gender stays, still +1 discard', [ex(s).gender, G.GAME.round_resets.discards]);
  let t = play(['S_Q', 'H_Q']);
  ok(t.chips === 10 + 10 + 10 && near(t.mult, 2 + 5 + 5), 'a Pair of Queens: each scored Queen +5 Mult (2 + 5 + 5)', t.total);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2), 'Kings: nothing', t.total);
  t = play(['S_Q', 'H_Q', 'D_4']);
  ok(near(t.mult, 12), 'a kicker that doesn\'t score: still just the two Queens', t.total);
  // ♂: never evolves (and the tooltip says so)
  ex(s).gender = 'male';
  ok(/♂: never evolves/.test(plain(s)) && !/\bMale\b/.test(plain(s)), 'its tooltip: ♂: never evolves', plain(s));
  rounds(7);
  ok(key(s) === 'j_poke_salandit' && ex(s).rounds === 5, '♂ Salandit after 7 rounds: still Salandit, its countdown never moved', [key(s), ex(s).rounds]);
  // ♀: evolves after 5 rounds
  ex(s).gender = 'female';
  ok(/\(♀\)/.test(plain(s)), 'its tooltip: ♀', plain(s));
  rounds(4);
  ok(key(s) === 'j_poke_salandit' && ex(s).rounds === 1, '♀: 4 rounds, 1 to go', [key(s), ex(s).rounds]);
  rounds(1);
  ok(key(s) === 'j_poke_salazzle', '♀ Salandit -> Salazzle after 5 rounds', key(s));
  ok(G.GAME.round_resets.discards === d0 + 1, 'Salazzle: still exactly +1 discard', [d0, G.GAME.round_resets.discards]);
  t = play(['S_Q', 'H_Q']);
  ok(near(t.mult, 2 * 1.5 * 1.5), 'Salazzle, a Pair of Queens: X1.5 each (2 x 1.5 x 1.5)', t.total);
  const r = play([['S_Q', 'c_base', 'Red'], 'H_Q']);
  ok(near(r.mult, 2 * 1.5 * 1.5 * 1.5), 'a Red Seal Queen scores twice: X1.5 three times', r.total);
  s.remove(); flush();
  ok(G.GAME.round_resets.discards === d0, 'sold: the discard goes back', G.GAME.round_resets.discards);
});

// ------------------------------------------------------------------- Stufful / Bewear
await sec('stufful bewear', () => {
  start('STUFFUL');
  const s = add('j_poke_stufful');
  let t = play(['S_A']);
  ok(t.chips === 5 + 11 + 40 && near(t.mult, 1 + 4), 'Stufful: +40 Chips and +4 Mult', t.total);
  ok(/Evolves after 5 rounds/.test(plain(s)), 'its text: 5 rounds', plain(s));
  rounds(5);
  ok(key(s) === 'j_poke_bewear', 'Stufful -> Bewear after 5 rounds', key(s));
  t = play(['S_A']);
  ok(t.chips === 16 && near(t.mult, 2.5), 'Bewear: X2.5', t.total);
  ok(/1 in 4 chance to destroy/.test(plain(s)) && /Nothing to its right/.test(plain(s)), 'its tooltip: 1 in 4, nothing to its right', plain(s));

  // guaranteed odds (probabilities 4 x 1/4): the joker to its RIGHT is destroyed at end of round, never the one to its left
  start('BEWEAR');
  const left = add('j_joker');
  const b = add('j_poke_bewear');
  const right = add('j_egg');
  const far = add('j_droll');
  ok(/In its arms: Egg/.test(plain(b)), 'its tooltip names the joker in its arms', plain(b));
  G.GAME.probabilities.normal = 4;
  ok(/4 in 4 chance/.test(plain(b)), 'Oops-style odds raise it (4 in 4)', plain(b));
  play(['S_A']);
  ok(owned(right), 'scoring a hand: nothing destroyed (only at end of round)');
  endRound();
  ok(!owned(right) && owned(left) && owned(far) && owned(b), 'end of round: the Joker directly to its right is destroyed; left and further right untouched', G.jokers.cards.map(key));
  nextBlind(); endRound();
  ok(!owned(far) && owned(left), 'the next round: the new right neighbour goes', G.jokers.cards.map(key));
  nextBlind(); endRound();
  ok(G.jokers.cards.length === 2 && owned(left) && owned(b), 'nothing to its right: nothing happens', G.jokers.cards.map(key));
  // Eternal: kept
  nextBlind();
  const et = add('j_joker'); et.set_eternal(true);
  endRound();
  ok(owned(et), 'an Eternal Joker to its right is kept');
  // Blueprint copying it destroys nothing more
  start('BEWEARBP');
  const bp = add('j_blueprint');
  const b2 = add('j_poke_bewear');
  const r1 = add('j_joker'), r2 = add('j_egg');
  G.GAME.probabilities.normal = 4;
  t = play(['S_A']);
  ok(near(t.mult, 2.5 * 2.5 + 4), 'Blueprint copies the X2.5 (then Joker +4)', t.total);
  endRound();
  ok(!owned(r1) && owned(r2) && owned(bp) && owned(b2), 'Blueprint copies only the X: one Joker hugged, not two', G.jokers.cards.map(key));
  // natural odds: about 1 in 4 over many rounds (the seeded roll)
  let hugged = 0;
  for (let i = 0; i < 40; i++) {
    start('BEWODDS' + i);
    add('j_poke_bewear'); const v = add('j_joker');
    endRound();
    if (!owned(v)) hugged++;
  }
  ok(hugged >= 4 && hugged <= 18, 'natural odds: ' + hugged + ' of 40 rounds hugged (about 1 in 4)', hugged);
});

// ------------------------------------------------------------------- Comfey
await sec('comfey', () => {
  start('COMFEY');
  const c = add('j_poke_comfey');
  ok(/1 in 3 chance to give \+1/.test(plain(c)) && /0 Jokers can take it/.test(plain(c)), 'its text: 1 in 3, no Joker can take it yet', plain(c));
  G.GAME.probabilities.normal = 3;
  endRound();
  ok(!ex(c).energy_count, 'alone: nothing (it never energizes itself)', ex(c));
  nextBlind();
  const st = add('j_poke_stufful');
  const e0 = G.GAME.energies_used || 0;
  endRound();
  ok(ex(st).energy_count === 1 && near(ex(st).chips, 52) && near(ex(st).mult, 5.6), 'a gift: Stufful +1 Energy at full strength (+40 -> 52 Chips, +4 -> 5.6 Mult)', ex(st));
  ok((G.GAME.energies_used || 0) === e0, 'not an Energy card: the run\'s Energy-used count is unchanged', G.GAME.energies_used);
  // a mismatched type still gets the full share (a Water Joker: no half-strength Colorless rule)
  nextBlind();
  st.remove(); flush();
  const pk = add('j_poke_pyukumuku');
  endRound();
  ok(ex(pk).energy_count === 1 && near(ex(pk).chip_mod, 12), 'any type, full strength: Pyukumuku +10 -> +12 a round', ex(pk));
  // the cap: a joker with 3 Energy is never picked; the gift goes to one that can take it
  nextBlind();
  for (let i = 0; i < 2; i++) increment_energy(pk, 'Water');
  ok(ex(pk).energy_count === 3, 'Pyukumuku at its cap (3)');
  endRound();
  ok(ex(pk).energy_count === 3, 'at the cap: no fourth Energy', ex(pk).energy_count);
  nextBlind();
  const ko = add('j_poke_komala');
  const br = add('j_poke_bruxish');
  ok(/1 Joker can take it/.test(plain(c)), 'its tooltip counts the Jokers that can take it (Komala; Bruxish has no number, Pyukumuku is capped)', plain(c));
  endRound();
  ok(ex(ko).energy_count === 1 && near(ex(ko).Xmult, 1.8) && ex(pk).energy_count === 3 && !ex(br).energy_count, 'the only eligible one gets it: Komala X1.5 -> X1.8', [ex(ko), ex(pk).energy_count, ex(br).energy_count]);
  // energy_plus raises the cap (Porygon's +1): the capped one is eligible again
  nextBlind();
  ko.remove(); flush();
  G.GAME.energy_plus = 1;
  endRound();
  ok(ex(pk).energy_count === 4, 'with +1 Energy cap, Pyukumuku takes a fourth', ex(pk).energy_count);
  // the gift picks among several (seeded): over rounds, both get some
  start('COMFEY2');
  add('j_poke_comfey');
  const a = add('j_poke_stufful'), b = add('j_poke_jangmoo');
  G.GAME.probabilities.normal = 3;
  for (let i = 0; i < 4; i++) { endRound(); nextBlind(); }
  ok((ex(a).energy_count || 0) + (ex(b).energy_count || 0) === 4 && ex(a).energy_count > 0 && ex(b).energy_count > 0, 'two eligible: 4 gifts spread over both (a random pick)', [ex(a).energy_count, ex(b).energy_count]);
  // natural odds: about 1 in 3
  let gifts = 0;
  for (let i = 0; i < 30; i++) { start('COMODDS' + i); add('j_poke_comfey'); const s2 = add('j_poke_stufful'); endRound(); if (ex(s2).energy_count) gifts++; }
  ok(gifts >= 4 && gifts <= 18, 'natural odds: ' + gifts + ' gifts in 30 rounds (about 1 in 3)', gifts);
  // Blueprint copies nothing
  start('COMFEYBP');
  add('j_blueprint'); add('j_poke_comfey');
  const s3 = add('j_poke_stufful');
  G.GAME.probabilities.normal = 3;
  endRound();
  ok(ex(s3).energy_count === 1, 'a Blueprint copying it gives no second gift', ex(s3).energy_count);
});

// ------------------------------------------------------------------- Sandygast / Palossand
await sec('sandygast palossand', () => {
  start('SANDY');
  const s = add('j_poke_sandygast');
  let t = play(['S_A']);
  ok(t.chips === 16 && ex(s).castle_chips === 0, 'no Stone card: nothing banked, nothing given', [t.total, ex(s).castle_chips]);
  t = play([['S_A', 'm_stone']]);
  ok(ex(s).castle_chips === 10 && t.chips === 5 + 50 + 10, 'a scored Stone card: +10 banked, given the same hand (5 + 50 + 10)', [ex(s).castle_chips, t.total]);
  t = play([['S_A', 'm_stone'], ['H_A', 'm_stone']]);
  ok(ex(s).castle_chips === 30 && t.chips === 5 + 100 + 30, 'two Stone cards: +20 more (30)', [ex(s).castle_chips, t.total]);
  t = play([['S_A', 'm_stone', 'Red']]);
  ok(ex(s).castle_chips === 50, 'a Red Seal Stone card scores twice: +20', ex(s).castle_chips);
  t = play(['S_K']);
  ok(t.chips === 5 + 10 + 50, 'a hand with no Stone: still gives the bank', t.total);
  rounds(5);
  ok(key(s) === 'j_poke_palossand' && ex(s).castle_chips === 50 && ex(s).castle_Xmult === 1, 'Sandygast -> Palossand after 5 rounds: keeps +50 Chips, X1 to start', [key(s), ex(s)]);
  t = play([['S_A', 'm_stone']]);
  ok(near(ex(s).castle_Xmult, 1.05) && ex(s).castle_chips === 50 && t.chips === 5 + 50 + 50 && near(t.mult, 1.05), 'Palossand: a Stone card banks X0.05 (X1.05), the Chips stay +50', [ex(s), t.total]);
  t = play([['S_A', 'm_stone'], ['H_A', 'm_stone'], ['D_A', 'm_stone']]);
  ok(near(ex(s).castle_Xmult, 1.2) && near(t.mult, 1.2), 'three more: X1.2', [ex(s).castle_Xmult, t.total]);
  ok(/Currently X1.2 Mult/.test(plain(s)) && /\+50 Chips/.test(plain(s)), 'its tooltip shows both banks', plain(s));
});

// ------------------------------------------------------------------- Pyukumuku
await sec('pyukumuku', () => {
  start('PYUKU');
  const p = add('j_poke_pyukumuku');
  let t = play(['S_A']);
  ok(t.chips === 16, 'bought: +0 Chips yet', t.total);
  rounds(3);
  ok(ex(p).innards_chips === 30 && ex(p).held_rounds === 3, '3 rounds held: +30 Chips banked, 3 rounds counted', ex(p));
  t = play(['S_A']);
  ok(t.chips === 16 + 30, 'gives the bank', t.total);
  ok(/Currently \$3/.test(plain(p)), 'its tooltip: currently $3', plain(p));
  // sold: sell value + $1 per round held
  let d0 = G.GAME.dollars;
  const sv = p.sell_cost;
  act({ type: 'sell', id: p.sort_id }); flush();
  ok(!owned(p) && G.GAME.dollars - d0 === sv + 3, 'sold: its sell value + $3 (3 rounds)', [G.GAME.dollars - d0, sv]);
  // destroyed by Ceremonial Dagger at Blind select: $1 per round held
  start('PYUKUDAG');
  add('j_ceremonial');
  const p2 = add('j_poke_pyukumuku');
  rounds(2);
  ok(!owned(p2), 'Ceremonial Dagger sliced it at the second Blind', G.jokers.cards.map(key));
  start('PYUKUDAG2');
  add('j_ceremonial');
  const p3 = add('j_poke_pyukumuku');
  // move it out of the Dagger's reach, hold 2 rounds, then put it back to the Dagger's right
  G.jokers.cards.splice(G.jokers.cards.indexOf(p3), 1); G.jokers.cards.unshift(p3);
  rounds(2);
  G.jokers.cards.splice(G.jokers.cards.indexOf(p3), 1); G.jokers.cards.push(p3);
  endRound(); toShop(); act({ type: 'next_round' });
  d0 = G.GAME.dollars;
  act({ type: 'select_blind' }); flush();
  ok(!owned(p3) && G.GAME.dollars - d0 === 3, 'destroyed (Ceremonial Dagger): $3 for 3 rounds held', [owned(p3), G.GAME.dollars - d0]);
  // destroyed by Bewear's hug: pays too
  start('PYUKUBEW');
  add('j_poke_bewear');
  const p4 = add('j_poke_pyukumuku');
  rounds(1);
  G.GAME.probabilities.normal = 4;
  d0 = G.GAME.dollars;
  endRound();
  ok(!owned(p4) && G.GAME.dollars - d0 === 2, 'destroyed by Bewear at end of round (after its 2nd round counted): $2', [owned(p4), G.GAME.dollars - d0]);
  // a debuffed one pays nothing
  start('PYUKUDEB');
  const p5 = add('j_poke_pyukumuku');
  rounds(2);
  debuff(p5);
  d0 = G.GAME.dollars;
  p5.getting_sliced = true; p5.start_dissolve(); flush();
  ok(G.GAME.dollars === d0, 'a debuffed Pyukumuku destroyed: nothing', G.GAME.dollars - d0);
});

// ------------------------------------------------------------------- Komala
await sec('komala', () => {
  start('KOMALA');
  const k = add('j_poke_komala');
  let t = play(['S_A']);
  ok(near(t.mult, 1.5), 'Komala: X1.5', t.total);
  const ctl = add('j_joker');
  debuff(ctl); debuff(k);
  ok(ctl.debuff && !k.debuff, 'can\'t be debuffed (a joker beside it can)', [ctl.debuff, k.debuff]);
  ctl.remove(); flush();
  // Crimson Heart debuffs a random joker each hand: never Komala
  endRound(); nextBlind(); endRound(); nextBlind('bl_final_heart');
  ok(G.GAME.blind.name === 'Crimson Heart', 'the Boss Blind is Crimson Heart', G.GAME.blind.name);
  const j2 = add('j_joker');
  let hit = 0;
  for (let i = 0; i < 4; i++) { t = play(['S_A']); if (j2.debuff) hit++; ok(!k.debuff, 'Crimson Heart: Komala never debuffed (hand ' + (i + 1) + ')', k.debuff); }
  ok(hit >= 1, 'Crimson Heart debuffed the other joker instead', hit);
  j2.remove(); flush();
  // Madness: it picks Komala (the only other joker) and Komala stays
  start('KOMMAD');
  const mad = add('j_madness');
  const k2 = add('j_poke_komala');
  rounds(1);
  ok(owned(k2) && near(mad.ability.x_mult, 1.5), 'Madness at the Big Blind (it fired: X1.5): Komala stays', [G.jokers.cards.map(key), mad.ability.x_mult]);
  // Ceremonial Dagger: stays (the Dagger still gains, Steamodded's no_destroy rule)
  start('KOMDAG');
  const dag = add('j_ceremonial');
  const k3 = add('j_poke_komala');
  rounds(1);
  ok(owned(k3) && G.jokers.cards.length === 2 && dag.ability.mult > 0, 'Ceremonial Dagger (it fired: +' + dag.ability.mult + ' Mult, the no_destroy rule): Komala stays', [G.jokers.cards.map(key), dag.ability.mult]);
  // Bewear's hug: stays
  start('KOMBEW');
  add('j_poke_bewear');
  const k4 = add('j_poke_komala');
  G.GAME.probabilities.normal = 4;
  endRound();
  ok(owned(k4), 'Bewear\'s Strong Hug: Komala stays', G.jokers.cards.map(key));
  // selling still works; a direct destroy (Hex / Ankh call start_dissolve without a joker) still removes it
  nextBlind();
  act({ type: 'sell', id: k4.sort_id }); flush();
  ok(!owned(k4), 'selling still works');
  start('KOMHEX');
  const k5 = add('j_poke_komala');
  k5.start_dissolve(); flush();
  ok(!owned(k5), 'a non-Joker destroy (Hex, Ankh) still removes it');
  ok(/can't be debuffed/.test(plain(k5)) && /Jokers can't destroy it/.test(plain(k5)), 'its text', plain(k5));
});

// ------------------------------------------------------------------- Bruxish
await sec('bruxish', () => {
  start('BRUX');
  let t = play([['S_K', 'c_base', 'Gold'], 'H_K']);
  ok(t.chips === 30, 'no Bruxish: a Pair of Kings with a Gold Seal: 10 + 10 + 10', t.total);
  add('j_poke_bruxish');
  let d0 = G.GAME.dollars;
  t = play([['S_K', 'c_base', 'Gold'], 'H_K']);
  ok(t.chips === 40 && G.GAME.dollars - d0 === 6, 'Bruxish: the sealed King retriggers (+10 Chips, its Gold Seal pays twice: $6)', [t.total, G.GAME.dollars - d0]);
  t = play([['S_K', 'c_base', 'Blue'], ['H_K', 'c_base', 'Purple'], ['D_5', 'c_base', 'Gold']]);
  ok(t.chips === 10 + 20 + 20, 'two sealed scored Kings retrigger; a sealed kicker that doesn\'t score: nothing', t.total);
  t = play([['S_K', 'c_base', 'Red'], 'H_K']);
  ok(t.chips === 10 + 30 + 10, 'a Red Seal King: its own retrigger + Bruxish\'s (scored 3 times)', t.total);
  t = play(['H_K', 'D_K']);
  ok(t.chips === 30, 'unsealed: nothing', t.total);
  add('j_blueprint');
  G.jokers.cards.unshift(G.jokers.cards.pop());
  t = play([['S_K', 'c_base', 'Gold'], 'H_K']);
  ok(t.chips === 10 + 30 + 10, 'Blueprint copies it: retriggered twice', t.total);
});

// ------------------------------------------------------------------- Jangmo-o / Hakamo-o / Kommo-o
await sec('jangmoo line', () => {
  start('JANGMO');
  const j = add('j_poke_jangmoo');
  let t = play(FH);
  ok(ex(j).clang_mult === 2 && t.chips === 40 + 50 && near(t.mult, 4 + 2), 'a Full House: +2 banked, given the same hand (4 + 2)', [ex(j).clang_mult, t.total]);
  t = play(['S_K', 'H_K', 'D_K']);
  ok(ex(j).clang_mult === 2 && near(t.mult, 3 + 2), 'Three of a Kind: no gain, still gives +2', [ex(j).clang_mult, t.total]);
  t = play(FLUSH_HOUSE);
  ok(ex(j).clang_mult === 2, 'a Flush House is its own hand: no gain (Larvitar\'s rule)', ex(j).clang_mult);
  for (let i = 0; i < 6; i++) play(FH);
  ok(ex(j).clang_mult === 14, '7 Full Houses: +14', ex(j).clang_mult);
  endRound();
  ok(key(j) === 'j_poke_jangmoo', '+14 < 16: no evolution', key(j));
  nextBlind();
  play(FH);
  ok(/Evolves at \+16 \/ \+16 Mult/.test(plain(j)), 'its footer: +16 / +16', plain(j));
  endRound();
  ok(key(j) === 'j_poke_hakamoo' && ex(j).clang_mult === 16, 'at +16: Jangmo-o -> Hakamo-o at end of round, the bank kept', [key(j), ex(j).clang_mult]);
  nextBlind();
  t = play(FH);
  ok(ex(j).clang_mult === 20 && near(t.mult, 4 + 20), 'Hakamo-o: +4 a Full House (20)', [ex(j).clang_mult, t.total]);
  for (let i = 0; i < 5; i++) play(FH);
  ok(ex(j).clang_mult === 40, '+40', ex(j).clang_mult);
  endRound();
  ok(key(j) === 'j_poke_kommoo' && ex(j).clang_mult === 40, 'at +40: Hakamo-o -> Kommo-o, the bank kept', [key(j), ex(j).clang_mult]);
  nextBlind();
  const n0 = G.GAME.hands['Full House'].played;
  ok(n0 === 14, '14 Full Houses played this run', n0);
  t = play(FH);
  ok(ex(j).clang_mult === 40 && near(t.mult, (4 + 40) * (1 + 0.15 * 15)), 'Kommo-o: the bank no longer grows; +40 and X1 + X0.15 x 15 (the hand being played counts)', [ex(j).clang_mult, t.total]);
  t = play(['S_A']);
  ok(near(t.mult, (1 + 40) * (1 + 0.15 * 15)), 'any hand: +40 and X3.25', t.total);
  ok(/Currently 15: X3.25 Mult/.test(plain(j)), 'its tooltip: the count and the X', plain(j));
  // a Kommo-o bought late counts every Full House of the run
  start('KOMMOLATE');
  for (let i = 0; i < 4; i++) play(FH);
  const k = add('j_poke_kommoo');
  t = play(['S_A']);
  ok(near(t.mult, 1 * (1 + 0.15 * 4)) && ex(k).clang_mult === 0, 'a late Kommo-o: X1.6 for the 4 Full Houses before it', t.total);
});

// ------------------------------------------------------------------- Energy: each line's main number at the standard rate
await sec('energy', () => {
  const r4 = (x) => Math.round(x * 10000) / 10000;
  const steps = (n, field, type, want) => {
    start('EN' + n + field);
    const j = add('j_poke_' + n);
    const got = [];
    for (let i = 0; i < 3; i++) { increment_energy(j, type); got.push(r4(ex(j)[field])); }
    ok(got.every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${field} ${want.join(' / ')}`, got);
    return j;
  };
  const sa = steps('salandit', 'mult', 'Fire', [7, 9, 11]);
  ok(ex(sa).d_size === 1, 'the discard stays +1');
  let t = play(['S_Q', 'H_Q']);
  ok(near(t.mult, 2 + 11 + 11), 'energized Salandit: +11 a Queen', t.total);
  steps('salazzle', 'Xmult_multi', 'Fire', [1.575, 1.65, 1.725]);
  steps('stufful', 'chips', 'Fighting', [52, 64, 76]);
  steps('stufful', 'mult', 'Fighting', [5.6, 7.2, 8.8]);
  const bw = steps('bewear', 'Xmult', 'Fighting', [3, 3.5, 4]);
  ok(ex(bw).num === 1 && ex(bw).dem === 4, 'the 1 in 4 stays fixed');
  const sg = steps('sandygast', 'chip_mod', 'Psychic', [12, 14, 16]);
  ok(ex(sg).castle_chips === 0, 'the bank is not raised');
  steps('palossand', 'Xmult_mod', 'Psychic', [0.06, 0.07, 0.08]);
  const pk = steps('pyukumuku', 'chip_mod', 'Water', [12, 14, 16]);
  ok(ex(pk).innards_money === 1, 'the $1 per round stays fixed');
  steps('komala', 'Xmult', 'Colorless', [1.8, 2.1, 2.4]);
  steps('jangmoo', 'mult_mod', 'Dragon', [2.4, 2.8, 3.2]);
  steps('hakamoo', 'mult_mod', 'Dragon', [4.8, 5.6, 6.4]);
  steps('kommoo', 'Xmult_mod', 'Dragon', [0.18, 0.21, 0.24]);
  for (const n of ['comfey', 'bruxish']) {
    start('ENIN' + n);
    const j = add('j_poke_' + n), before = JSON.stringify(ex(j));
    increment_energy(j, C(n).ptype);
    const after = { ...ex(j) }; delete after.energy_count;
    const b = JSON.parse(before); delete b.energy_count;
    ok(JSON.stringify(after) === JSON.stringify(b), n + ': Energy-inert (nothing changes)', [before, JSON.stringify(ex(j))]);
  }
  // banks keep their worth; Energy carries through the evolutions
  start('ENBANK');
  const j = add('j_poke_jangmoo');
  play(FH);
  increment_energy(j, 'Dragon');
  play(FH);
  ok(near(ex(j).clang_mult, 2 + 2.4), 'Jangmo-o: +2 banked, then energized: +2.4 (the first +2 not raised)', ex(j).clang_mult);
  for (let i = 0; i < 5; i++) play(FH);
  endRound();
  ok(key(j) === 'j_poke_hakamoo' && ex(j).energy_count === 1 && near(ex(j).mult_mod, 4.8) && near(ex(j).clang_mult, 2 + 6 * 2.4), 'Jangmo-o -> Hakamo-o keeps the Energy (+4.8 a Full House) and the bank', [key(j), ex(j).mult_mod, ex(j).clang_mult]);
  start('ENSAND');
  const s = add('j_poke_sandygast');
  increment_energy(s, 'Psychic');
  play([['S_A', 'm_stone']]);
  rounds(5);
  ok(key(s) === 'j_poke_palossand' && near(ex(s).Xmult_mod, 0.06) && near(ex(s).castle_chips, 12), 'Sandygast -> Palossand: Energy carries (X0.06 a Stone), +12 Chips kept', [key(s), ex(s)]);
});

// ------------------------------------------------------------------- save / resume: genders, banks, counts
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'G7B2RES', customDeck: { name: 'Gen 7', mods: ['pokermon'], params: { blind_scaling: 0.05 },
    cards: [['S_K', 0, 0, 0, 14], ['H_Q', 0, 0, 0, 14], ['D_9', 'm_stone', 0, 0, 12]],
    jokers: [{ key: 'j_poke_salandit' }, { key: 'j_poke_sandygast' }, { key: 'j_poke_pyukumuku' }, { key: 'j_poke_jangmoo' }, { key: 'j_poke_comfey' }, { key: 'j_poke_komala' }] } });
  s.act({ type: 'select_blind' }); flush();
  const playBest = () => {
    const ks = G.hand.cards.filter((c) => c.base.id === 13).slice(0, 3), qs = G.hand.cards.filter((c) => c.base.id === 12 && !c.config.center.key.includes('stone')).slice(0, 2);
    const pick = ks.length === 3 && qs.length === 2 ? [...ks, ...qs] : G.hand.cards.slice(0, 5);
    s.act({ type: 'highlight', ids: pick.map((c) => c.sort_id) }); s.act({ type: 'play' }); flush();
  };
  for (let i = 0; i < 4 && G.STATE === STATES.SELECTING_HAND; i++) playBest();
  if (G.STATE === STATES.ROUND_EVAL) { s.act({ type: 'cash_out' }); flush(); }
  if (G.STATE === STATES.SHOP) { s.act({ type: 'next_round' }); flush(); }
  if (G.STATE === STATES.BLIND_SELECT) { s.act({ type: 'select_blind' }); flush(); }
  if (G.STATE === STATES.SELECTING_HAND) playBest();
  const snap = () => ({
    jokers: G.jokers.cards.map((j) => [key(j), ex(j).gender, ex(j).castle_chips, ex(j).innards_chips, ex(j).held_rounds, ex(j).clang_mult, ex(j).energy_count || 0]),
    discards: G.GAME.round_resets.discards, chips: String(G.GAME.chips), dollars: G.GAME.dollars, round: G.GAME.round,
  });
  const want = snap();
  const sal = want.jokers.find((x) => x[0] === 'j_poke_salandit'), py = want.jokers.find((x) => x[0] === 'j_poke_pyukumuku');
  ok(sal && (sal[1] === 'female' || sal[1] === 'male') && py && py[4] >= 1 && want.round >= 2, 'the run: Salandit has a gender, Pyukumuku counted a round', want);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  const got = snap();
  ok(!r.stoppedAt && JSON.stringify(got) === JSON.stringify(want), 'resume: the gender, every bank and count, the discards and the score come back the same', { want, got });
});

// ------------------------------------------------------------------- the art: the 3.9.1 cells show these types
if (ART) {
  await sec('art types', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const bad = [];
    for (const n of NAMES) { const r = typer.typeOfEntry({ atlas: 'AtlasJokersBasicNatdex', pos: [C(n).pos.x, C(n).pos.y] }); if (!r || r.ptype !== C(n).ptype) bad.push([n, C(n).ptype, r && r.ptype]); }
    ok(!bad.length, 'each of the 13 is the type its 3.9.1 card shows', bad);
  });
} else console.log('(Pokermon art not on disk: the art type checks are skipped; set MICATRO_MAIN)');

done();
