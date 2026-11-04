// Gen 6, batch 1 (the owner's "go ahead", 2026-11-02; jokers/pokejokers_designs.js "Gen 6, batch 1"; PORTING.md "Gen 6, batch 1"):
// 16 jokers (the spec's heading says 15; its list is 16 species), #661-678, on the guide's price slots (3-stage U $6 / S $8 / S $10, 2-stage C $5 / S $8, single-stage R $7):
//   Fletchling 661 -> Fletchinder -> Talonflame   Gale Wings, the round's first hand: +8 Mult / X1.5 / X2.5 and its first scored card
//                                                 retriggers. Fletchling is Colorless (Starly's flock counts it). 4 then 5 rounds.
//   Scatterbug 664 -> Spewpa -> Vivillon (Grass)   scored Wild +4 Mult; each Blind a random unenhanced deck card becomes Wild; Vivillon both and
//                                                 Wild X1.3, a pattern of 20 rolled once (its own 3.9.1 card). 4 then 4 rounds.
//   Flabébé 669 -> Floette -> Florges (Fairy)      Garden Queen: scored Queens +4 Mult / retrigger once / retrigger twice and X1.25; a flower
//                                                 colour rolled once, kept through the line (its own card). 4 then 5 rounds.
//   Skiddo 672 -> Gogoat (Grass)                  +30 / +60 Chips, plus +10 / +20 per other Grass Joker; Gogoat +1 hand size. 5 rounds.
//   Pancham 674 -> Pangoro (Fighting)             scored faces +3 Mult / X1.3; evolves after 5 rounds only with a Dark Joker held.
//   Furfrou 676 (Colorless, R $7)                 a trim each Ante (Heart Hearts, Diamond Diamonds, Star Spades, Debutante Clubs): its suit
//                                                 +20 Chips +4 Mult; each trim its own card.
//   Espurr 677 -> Meowstic (Psychic)              +1 Foresight; Meowstic's gender rolled when it evolves: Male a Tarot each round, Female X1.5
//                                                 + X0.25 per Tarot held (their own cards). 5 rounds.
// Every ability is FIRED through real hands / Blinds / rounds with exact numbers; Energy at 1 / 2 / 3; save / resume; the form art.
//   node micatro/tests/mods/pokermon_gen6_batch1_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values, energy_can_use } from '../../mods/pokermon/systems/energy.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import * as ANIM from '../../mods/pokermon/systems/anim.js';
import * as DES from '../../mods/pokermon/jokers/pokejokers_designs.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import { apply_type_sticker } from '../../mods/pokermon/api.js';
import { ART, crops } from './poke_art_helpers.mjs';

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
  fletchling: ['fletchling', 'fletchinder', 'talonflame'], scatterbug: ['scatterbug', 'spewpa', 'vivillon'], flabebe: ['flabebe', 'floette', 'florges'],
  skiddo: ['skiddo', 'gogoat'], pancham: ['pancham', 'pangoro'], furfrou: ['furfrou'], espurr: ['espurr', 'meowstic'],
};
const NAMES = Object.values(LINES).flat();
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
/** Put cards in hand: a list of keys, or [key, center] pairs (in that order: the first is the leftmost). */
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list` (with `held` left in hand); the round never ends by accident. */
function play(list, { held = [] } = {}) {
  clearHand();
  const cs = cards(list);
  cards(held);
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const events = (r && r.events) || [];
  const total = events.find((e) => e.type === 'hand_total') || {};
  return { events, total, mult: Number(total.mult), chips: Number(total.chips), score: Number(total.total) };
}
function discard(cs) {
  if (G.GAME.current_round.discards_left < 1) G.GAME.current_round.discards_left = 1;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  act({ type: 'discard' });
  flush();
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
const face = (j, shiny) => {
  const v = {}; view_card(j, v);
  return POKE_UI.face({ center: key(j), facing: 'front', poke: v.poke, atlas: j.config.center.atlas, pos: j.config.center.pos, ...(shiny ? { edition: 'poke_shiny' } : {}) }, { area: 'jokers' });
};
const drawn = (j, shiny) => { const f = face(j, shiny); return f ? [f.atlas, f.pos] : [j.config.center.atlas, j.config.center.pos]; };
const wilds = () => G.playing_cards.filter((c) => c.config.center.key === 'm_wild');
const tarots = () => G.consumeables.cards.filter((c) => c.ability.set === 'Tarot').length;
const GEN6 = 'poke_AtlasJokersBasicGen06391', GEN6S = 'poke_AtlasJokersBasicGen06Shiny391';

// ------------------------------------------------------------------- pin, static data, order, families, Energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 61 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 61+ (Gen 6 batch 1)', PINS.modPin('pokermon'));
  for (const n of NAMES) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs');
  }
  const hits = [];
  const re = new RegExp('\\b(' + NAMES.join('|') + ')\\b', 'i');
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the 16 (nothing to dedupe)', hits);
});
await sec('static', () => {
  start('G6B1S');
  const S = 'poke_safari';
  // [rarity, cost, stage, type, rounds|undefined, sheet, x, y]
  const WANT = {
    fletchling: [2, 6, 'Basic', 'Colorless', 4, 'Natdex', 0, 44], fletchinder: [S, 8, 'One', 'Fire', 5, 'Natdex', 2, 44], talonflame: [S, 10, 'Two', 'Fire', undefined, 'Natdex', 4, 44],
    scatterbug: [2, 6, 'Basic', 'Grass', 4, 'Natdex', 6, 44], spewpa: [S, 8, 'One', 'Grass', 4, 'Natdex', 8, 44], vivillon: [S, 10, 'Two', 'Grass', undefined, 'Gen06', 2, 0],
    flabebe: [2, 6, 'Basic', 'Fairy', 4, 'Gen06', 10, 3], floette: [S, 8, 'One', 'Fairy', 5, 'Gen06', 8, 4], florges: [S, 10, 'Two', 'Fairy', undefined, 'Gen06', 8, 5],
    skiddo: [1, 5, 'Basic', 'Grass', 5, 'Natdex', 22, 44], gogoat: [S, 8, 'One', 'Grass', undefined, 'Natdex', 24, 44],
    pancham: [1, 5, 'Basic', 'Fighting', 5, 'Natdex', 26, 44], pangoro: [S, 8, 'One', 'Fighting', undefined, 'Natdex', 28, 44],
    furfrou: [3, 7, 'Basic', 'Colorless', undefined, 'Gen06', 6, 6],
    espurr: [1, 5, 'Basic', 'Psychic', 5, 'Natdex', 2, 45], meowstic: [S, 8, 'One', 'Psychic', undefined, 'Gen06', 2, 8],
  };
  ok(Object.keys(WANT).length === 16 && NAMES.length === 16, '15 species + Meowstic\'s one center: 16 jokers? no — 15 jokers', Object.keys(WANT).length);
  for (const [n, [rarity, cost, stage, type, rnds, sheet, x, y]] of Object.entries(WANT)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === type && c.config.extra.ptype === type && c.gen === 6,
      `${n}: ${rarity} $${cost}, ${stage}, ${type}, Gen 6`, [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.config.extra.rounds === rnds, `${n}: ${rnds ? 'evolves after ' + rnds + ' rounds' : 'no round timer'}`, c.config.extra.rounds);
    ok(c.atlas === 'poke_AtlasJokersBasic' + sheet + '391' && c.pos.x === x && c.pos.y === y && !c.soul_pos, `${n}: upstream 3.9.1 cell ${sheet} {${x},${y}} (nothing to deploy)`, [c.atlas, c.pos]);
  }
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker' && !c.key.startsWith('j_poke_mega_')).map((c) => c.key);
  const run = (from, list, to) => { const i = keys.indexOf('j_poke_' + list[0]); return i > 0 && [from, ...list, to].every((k, n) => keys[i - 1 + n] === 'j_poke_' + k) ? true : keys.slice(i - 1, i + list.length + 1); };
  const RUNS = [
    ['diggersby', ['fletchling', 'fletchinder', 'talonflame', 'scatterbug', 'spewpa', 'vivillon'], 'litleo'],
    ['pyroar', ['flabebe', 'floette', 'florges', 'skiddo', 'gogoat', 'pancham', 'pangoro', 'furfrou', 'espurr', 'meowstic'], 'honedge'],
  ];
  for (const [from, list, to] of RUNS) ok(run(from, list, to) === true, `Pokédex order: ${from}, ${list.join(', ')}, ${to}`, run(from, list, to));
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).filter((k) => !k.startsWith('mega_')).join();
  for (const line of Object.values(LINES)) if (line.length > 1) ok(fam(line[0]) === line.join(), 'one family: ' + line.join(' -> '), fam(line[0]));
  ok(NAMES.every((n) => !C(n).poke_no_energy_field), 'none is Energy-inert (each has a number, or carries its evolution\'s)');
  ok(['retriggers', 'h_size', 'scry', 'rounds'].every((f) => !(f in energy_values)), 'fixed: the retriggers, Gogoat\'s hand size, Espurr\'s Foresight');
  ok(C('fletchling').ptype === 'Colorless' && C('furfrou').ptype === 'Colorless', 'Fletchling and Furfrou are Colorless (Starly\'s flock counts them)');
});

// ------------------------------------------------------------------- the Fletchling line: Gale Wings
await sec('gale wings', () => {
  start('FLET');
  const f = add('j_poke_fletchling');
  ok(/Active!/.test(plain(f)), 'the tooltip: Active! before the first hand', plain(f));
  const [d] = cards(['C_3']); discard([d]);
  let t = play(['S_A']);
  ok(t.chips === 16 && near(t.mult, 1 + 8), 'Fletchling: the round\'s first hand (after a discard) +8 Mult (High Card Ace: 16 x 9)', t.total);
  ok(/Used this round/.test(plain(f)), 'then: Used this round', plain(f));
  t = play(['S_A']);
  ok(near(t.mult, 1), 'the second hand: nothing', t.total);
  rounds(3); ok(key(f) === 'j_poke_fletchling', 'Fletchling: still Fletchling after 3 rounds');
  rounds(1); ok(key(f) === 'j_poke_fletchinder', 'Fletchling -> Fletchinder after 4 rounds', key(f));
  t = play(['S_A']);
  ok(near(t.mult, 1.5), 'Fletchinder: the first hand X1.5', t.total);
  t = play(['S_A']);
  ok(near(t.mult, 1), '... the second nothing', t.total);
  rounds(4); ok(key(f) === 'j_poke_fletchinder', 'Fletchinder: still after 4 rounds');
  rounds(1); ok(key(f) === 'j_poke_talonflame', 'Fletchinder -> Talonflame after 5 rounds', key(f));
  start('TALON');
  add('j_poke_talonflame');
  t = play(['S_K', 'H_K']);
  ok(t.chips === 10 + 10 + 10 + 10 && near(t.mult, 2 * 2.5), 'Talonflame, first hand: a Pair of Kings X2.5 and the first King retriggers (10 + 30 chips, 2 x 2.5)', t.total);
  t = play(['S_K', 'H_K']);
  ok(t.chips === 30 && near(t.mult, 2), 'the second hand: no X, no retrigger', t.total);
  // the flock: Fletchling is a Colorless Joker for Starly; Fletchinder (Fire) is not
  start('FLOCK');
  const st = add('j_poke_starly'); add('j_poke_fletchling');
  play(['S_3']);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 2 * 2), 'Starly + Fletchling: 2 Colorless Jokers, +4 (the second hand, so Gale Wings is off)', t.total);
  start('FLOCK2');
  add('j_poke_starly'); add('j_poke_fletchinder');
  play(['S_3']);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 2), 'Starly + Fletchinder (Fire): only Starly counts', t.total);
  void st;
  // Blueprint copies the X
  start('TALONBP');
  add('j_blueprint'); add('j_poke_fletchinder');
  t = play(['S_A']);
  ok(near(t.mult, 1.5 * 1.5), 'Blueprint copies Fletchinder\'s X1.5', t.total);
});

// ------------------------------------------------------------------- the Scatterbug line: Wild cards
await sec('wild', () => {
  start('SCAT');
  const s = add('j_poke_scatterbug');
  let t = play([['S_5', 'm_wild'], 'H_5']);
  ok(near(t.mult, 2 + 4), 'Scatterbug: a Pair with one Wild: +4 (2 + 4)', t.total);
  t = play([['S_5', 'm_wild'], ['H_5', 'm_wild'], ['D_9', 'm_bonus']]);
  ok(near(t.mult, 2 + 8), 'two Wilds +4 each; the Bonus card nothing', t.total);
  rounds(4); ok(key(s) === 'j_poke_spewpa', 'Scatterbug -> Spewpa after 4 rounds', key(s));
  // Spewpa: one random unenhanced card of the full deck becomes Wild when a Blind is selected
  start('SPEW', {}, { noBlind: true });
  add('j_poke_spewpa');
  ok(wilds().length === 0, 'a fresh deck: no Wild card');
  act({ type: 'select_blind' }); flush();
  ok(wilds().length === 1, 'Spewpa: the Blind selected, 1 card became Wild', wilds().length);
  const first = wilds()[0].base.suit + wilds()[0].base.id;
  start('SPEW', {}, { noBlind: true });
  add('j_poke_spewpa');
  act({ type: 'select_blind' }); flush();
  ok(wilds()[0].base.suit + wilds()[0].base.id === first, 'the same seed picks the same card (seeded)', [first, wilds()[0].base.suit + wilds()[0].base.id]);
  start('SPEWBP', {}, { noBlind: true });
  add('j_blueprint'); add('j_poke_spewpa');
  act({ type: 'select_blind' }); flush();
  ok(wilds().length === 2, 'Blueprint copies the conversion: 2 Wilds', wilds().length);
  start('SPEWFULL', {}, { noBlind: true });
  const sp = add('j_poke_spewpa');
  for (const c of G.playing_cards) c.set_ability(P_CENTERS.m_bonus, null, true);
  const [w] = G.playing_cards; w.set_ability(P_CENTERS.m_glass, null, true);
  act({ type: 'select_blind' }); flush();
  ok(wilds().length === 0 && G.playing_cards.every((c) => c.config.center.key !== 'c_base'), 'no unenhanced card left: nothing (it never overwrites)', wilds().length);
  clearHand();
  rounds(4); ok(key(sp) === 'j_poke_vivillon', 'Spewpa -> Vivillon after 4 rounds', key(sp));
  // Vivillon: the conversion and Wild X1.3
  start('VIVI', {}, { noBlind: true });
  add('j_poke_vivillon');
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(wilds().length === 1, 'Vivillon converts too', wilds().length);
  t = play([['S_5', 'm_wild'], ['H_5', 'm_wild']]);
  ok(near(t.mult, 2 * 1.3 * 1.3), 'Vivillon: two scored Wilds X1.3 each', t.total);
  t = play(['S_5', 'H_5']);
  ok(near(t.mult, 2), 'no Wild: nothing', t.total);
});

// ------------------------------------------------------------------- Vivillon's pattern: rolled once, 20 cells
await sec('vivillon pattern', () => {
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    start('VIVP' + i);
    const v = add('j_poke_vivillon');
    seen.add(ex(v).form);
    if (i === 0) {
      const f0 = ex(v).form;
      ok(Number.isInteger(f0) && f0 >= 1 && f0 <= 20, 'a pattern 1-20', f0);
      ok(new RegExp('Pattern ' + f0 + ' of 20').test(plain(v)), 'the tooltip names it', plain(v));
      rounds(2);
      ok(ex(v).form === f0, 'never re-rolled (2 rounds later)', ex(v).form);
    }
  }
  ok(seen.size >= 10, 'patterns vary by seed (' + seen.size + ' of 20 in 30 seeds)', [...seen]);
  start('VIVEVO');
  const sp = add('j_poke_spewpa');
  ok(ex(sp).form === undefined, 'Spewpa has no pattern');
  rounds(4);
  ok(key(sp) === 'j_poke_vivillon' && Number.isInteger(ex(sp).form), 'it is rolled when Spewpa evolves into Vivillon', [key(sp), ex(sp).form]);
  // the art: form k draws pokespriteload.lua's k-th Vivillon cell (Gen 6), the Shiny sheet's twin
  const CELLS = [[2, 0], [4, 0], [6, 0], [8, 0], [10, 0], [0, 1], [2, 1], [4, 1], [6, 1], [8, 1], [10, 1], [0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [0, 3], [2, 3], [4, 3]];
  const v = add('j_poke_vivillon');
  const bad = [];
  for (let k = 1; k <= 20; k++) {
    ex(v).form = k;
    const [a, p] = drawn(v), [sa, spos] = drawn(v, true);
    if (a !== GEN6 || p.x !== CELLS[k - 1][0] || p.y !== CELLS[k - 1][1] || sa !== GEN6S || spos.x !== p.x || spos.y !== p.y) bad.push([k, a, p, sa]);
  }
  ok(bad.length === 0, 'each of the 20 patterns draws its own Gen 6 cell (and its Shiny twin)', bad);
});

// ------------------------------------------------------------------- the Flabébé line: Garden Queen
await sec('queens', () => {
  start('FLAB');
  const f = add('j_poke_flabebe');
  let t = play(['S_Q', 'H_Q']);
  ok(t.chips === 30 && near(t.mult, 2 + 8), 'Flabébé: a Pair of Queens +4 each (2 + 8)', t.total);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2), 'Kings: nothing', t.total);
  rounds(4); ok(key(f) === 'j_poke_floette', 'Flabébé -> Floette after 4 rounds', key(f));
  t = play(['S_Q', 'H_Q']);
  ok(t.chips === 10 + 4 * 10 && near(t.mult, 2), 'Floette: each Queen retriggers once (10 + 40 chips)', t.total);
  t = play(['S_J', 'H_J']);
  ok(t.chips === 30, 'Jacks: no retrigger', t.total);
  rounds(4); ok(key(f) === 'j_poke_floette', 'Floette: still after 4 rounds');
  rounds(1); ok(key(f) === 'j_poke_florges', 'Floette -> Florges after 5 rounds', key(f));
  t = play(['S_Q', 'H_Q']);
  ok(t.chips === 10 + 6 * 10 && near(t.mult, 2 * Math.pow(1.25, 6)), 'Florges: each Queen retriggers twice, X1.25 every time (70 chips, 2 x 1.25^6)', t.total);
  t = play(['S_Q', 'S_3']);
  ok(t.chips === 5 + 3 * 10 && near(t.mult, Math.pow(1.25, 3)), 'a High Card Queen: X1.25 three times', t.total);
  start('FLABP');
  add('j_poke_flabebe'); add('j_pareidolia');
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2), 'Pareidolia makes faces, not Queens: Kings still nothing', t.total);
});

// ------------------------------------------------------------------- the flower colour: rolled once, kept, its own card
await sec('flowers', () => {
  const seen = new Set();
  let carried = false;
  for (let i = 0; i < 20; i++) {
    start('FLOW' + i);
    const f = add('j_poke_flabebe');
    const col = ex(f).form;
    seen.add(col);
    if (i < 3) {
      rounds(4);
      const kept1 = key(f) === 'j_poke_floette' && ex(f).form === col;
      rounds(5);
      carried = (i === 0 || carried) && kept1 && key(f) === 'j_poke_florges' && ex(f).form === col;
      ok(new RegExp(col.charAt(0).toUpperCase() + col.slice(1) + ' Flower').test(plain(f)), 'the tooltip names its flower', plain(f));
    }
  }
  ok([...seen].every((c) => DES.FLOWERS.includes(c)) && seen.size === 5, 'every colour is one of the five, and all five turn up (20 seeds)', [...seen]);
  ok(carried, 'the colour is kept through Floette and Florges');
  const CELLS = {
    flabebe: { red: [10, 3], white: [0, 4], yellow: [2, 4], orange: [4, 4], blue: [6, 4] },
    floette: { red: [8, 4], white: [10, 4], yellow: [0, 5], orange: [2, 5], blue: [4, 5] },
    florges: { red: [8, 5], white: [10, 5], yellow: [0, 6], orange: [2, 6], blue: [4, 6] },
  };
  start('FLOWART');
  const bad = [];
  for (const n of Object.keys(CELLS)) {
    const j = add('j_poke_' + n);
    for (const col of DES.FLOWERS) {
      ex(j).form = col;
      const [a, p] = drawn(j), [sa, spos] = drawn(j, true);
      if (a !== GEN6 || p.x !== CELLS[n][col][0] || p.y !== CELLS[n][col][1] || sa !== GEN6S || spos.x !== p.x || spos.y !== p.y) bad.push([n, col, a, p]);
    }
  }
  ok(bad.length === 0, 'each colour of each stage draws its own Gen 6 cell (and its Shiny twin)', bad);
});

// ------------------------------------------------------------------- the Skiddo line: the Grass team
await sec('grass team', () => {
  start('SKID');
  const s = add('j_poke_skiddo');
  let t = play(['S_A']);
  ok(t.chips === 16 + 30, 'Skiddo alone: +30 Chips', t.total);
  const b = add('j_poke_bulbasaur'); add('j_poke_oddish');
  t = play(['S_A']);
  ok(t.chips === 16 + 30 + 20, 'with 2 other Grass Jokers: +50', t.total);
  ok(/Currently 2: \+50 Chips/.test(plain(s)), 'the tooltip counts them', plain(s));
  debuff(b);
  t = play(['S_A']);
  ok(t.chips === 16 + 30 + 10, 'a debuffed one doesn\'t count: +40', t.total);
  undebuff(b);
  add('j_poke_skiddo');
  t = play(['S_A']);
  ok(t.chips === 16 + 2 * (30 + 30), 'two Skiddos count each other (3 others each): +60 twice', t.total);
  start('SKIDEVO');
  const k = add('j_poke_skiddo');
  const h0 = G.hand.config.card_limit;
  rounds(4); ok(key(k) === 'j_poke_skiddo', 'Skiddo: still after 4 rounds');
  rounds(1); ok(key(k) === 'j_poke_gogoat' && G.hand.config.card_limit === h0 + 1, 'Skiddo -> Gogoat after 5 rounds: +1 hand size', [key(k), G.hand.config.card_limit - h0]);
  add('j_poke_bulbasaur');
  t = play(['S_A']);
  ok(t.chips === 16 + 60 + 20, 'Gogoat with 1 other Grass Joker: +80', t.total);
  act({ type: 'sell', id: k.sort_id }); flush();
  ok(G.hand.config.card_limit === h0 + 1, 'Gogoat sold: its +1 hand size goes (Bulbasaur\'s own +1 stays)', G.hand.config.card_limit - h0);
});

// ------------------------------------------------------------------- the Pancham line: Iron Fist, and the Dark Joker gate
await sec('pancham', () => {
  start('PANC');
  add('j_poke_pancham');
  let t = play(['S_K', 'H_K', 'D_9']);
  ok(near(t.mult, 2 + 6), 'Pancham: a Pair of Kings +3 each', t.total);
  t = play(['S_Q', 'H_J', 'D_A']);
  ok(near(t.mult, 1), 'High Card Ace: only the Ace scores, no face', t.total);
  start('PANG');
  add('j_poke_pangoro');
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 1.3 * 1.3), 'Pangoro: X1.3 each scored face card', t.total);
  // the gate: 5 rounds, but only with a Dark Joker
  start('PANEVO');
  const p = add('j_poke_pancham');
  rounds(5);
  ok(key(p) === 'j_poke_pancham' && ex(p).rounds === 0, 'no Dark Joker: after 5 rounds it waits at 0', [key(p), ex(p).rounds]);
  ok(/now: needs a Dark Joker/.test(plain(p)), 'the tooltip: needs a Dark Joker', plain(p));
  rounds(2);
  ok(key(p) === 'j_poke_pancham', '... still waiting 2 rounds later');
  const dk = add('j_poke_houndour');
  ok(/now: has a Dark Joker/.test(plain(p)), 'with Houndour (Dark): has a Dark Joker', plain(p));
  debuff(dk);
  rounds(1);
  ok(key(p) === 'j_poke_pancham', 'a DEBUFFED Dark Joker doesn\'t count', key(p));
  undebuff(dk);
  rounds(1);
  ok(key(p) === 'j_poke_pangoro', 'an undebuffed Dark Joker held at the end of round: Pancham -> Pangoro', key(p));
  start('PANEVO2');
  const p2 = add('j_poke_pancham'); add('j_poke_houndour');
  rounds(4); ok(key(p2) === 'j_poke_pancham', 'with a Dark Joker all along: still Pancham after 4 rounds');
  rounds(1); ok(key(p2) === 'j_poke_pangoro', '... Pangoro after exactly 5', key(p2));
  start('PANEVO3');
  const p3 = add('j_poke_pancham');
  rounds(5);
  const um = add('j_poke_houndour');
  add('j_poke_everstone');
  rounds(2);
  ok(key(p3) === 'j_poke_pancham', 'an Everstone stops it even with a Dark Joker', key(p3));
  void um;
  start('PANTERA');
  const p4 = add('j_poke_pancham'); const bulb = add('j_poke_bulbasaur');
  rounds(5);
  // a Dark Tera sticker makes any Joker a Dark Joker
  apply_type_sticker(bulb, 'Dark'); flush();
  rounds(1);
  ok(key(p4) === 'j_poke_pangoro', 'a Joker with a Dark Tera sticker counts (is_type)', key(p4));
});

// ------------------------------------------------------------------- Furfrou: a trim each Ante
await sec('furfrou', () => {
  start('FURF', {}, { noBlind: true });
  const shop = P_CENTERS.j_poke_furfrou;
  ok(shop.config.extra.form === undefined, 'no trim on the center (never picked on creation)');
  const f = add('j_poke_furfrou');
  const t0 = ex(f).form;
  ok(Object.keys(DES.TRIMS).includes(t0), 'obtained: a trim is picked', t0);
  act({ type: 'select_blind' }); flush(); clearHand();
  const suit = DES.TRIMS[t0].suit, S = suit[0];
  const other = ['S', 'H', 'C', 'D'].find((x) => x !== S);
  let t = play([S + '_A']);
  ok(t.chips === 16 + 20 && near(t.mult, 1 + 4), `${DES.TRIMS[t0].name} (${suit}): its suit +20 Chips +4 Mult`, t.total);
  t = play([other + '_A']);
  ok(t.chips === 16 && near(t.mult, 1), 'another suit: nothing', t.total);
  t = play([[other + '_A', 'm_wild']]);
  ok(t.chips === 16 + 20 && near(t.mult, 1 + 4), 'a Wild card counts as its suit', t.total);
  ok(new RegExp('Now: ' + DES.TRIMS[t0].name + ', ' + suit).test(plain(f)), 'the tooltip names the trim and its suit', plain(f));
  // a new trim each Ante: kept through the Small and Big Blinds, changed when the Boss is beaten (the shop is already the new one)
  endRound(); advance(); endRound(); advance();
  ok(ex(f).form === t0, 'kept through the Ante\'s Small and Big Blinds');
  const seq = [t0];
  for (let a = 0; a < 5; a++) {
    endRound(); // the Boss
    seq.push(ex(f).form);
    advance(); endRound(); advance(); endRound(); advance();
  }
  ok(seq.slice(1).every((x, i) => x !== seq[i]), 'a new trim at each Ante change, never the same twice running', seq);
  ok(G.GAME.round_resets.ante === 6, 'five Antes later', G.GAME.round_resets.ante);
  // seeded: the same run gives the same trims
  start('FURF', {}, { noBlind: true });
  const f2 = add('j_poke_furfrou');
  ok(ex(f2).form === t0, 'the same seed picks the same first trim', [t0, ex(f2).form]);
  // the art: each trim its own Gen 6 cell; no trim yet (the shop): the Natural card
  const CELLS = { heart: [8, 6], star: [0, 7], diamond: [2, 7], debutante: [6, 7] };
  const bad = [];
  for (const [tr, [x, y]] of Object.entries(CELLS)) {
    ex(f2).form = tr;
    const [a, p] = drawn(f2), [sa, sp] = drawn(f2, true);
    if (a !== GEN6 || p.x !== x || p.y !== y || sa !== GEN6S || sp.x !== x || sp.y !== y) bad.push([tr, a, p]);
  }
  ok(bad.length === 0, 'each trim draws its own Gen 6 cell (Heart {8,6}, Star {0,7}, Diamond {2,7}, Debutante {6,7}; Shiny twins)', bad);
  ex(f2).form = undefined;
  const [a, p] = drawn(f2);
  ok(a === GEN6 && p.x === 6 && p.y === 6, 'no trim yet: the Natural card {6,6}', [a, p]);
});

// ------------------------------------------------------------------- Espurr / Meowstic
await sec('meowstic', () => {
  start('ESP');
  const e = add('j_poke_espurr');
  ok(G.GAME.scry_amount === 1, 'Espurr: +1 Foresight', G.GAME.scry_amount);
  rounds(4); ok(key(e) === 'j_poke_espurr', 'Espurr: still after 4 rounds');
  rounds(1);
  ok(key(e) === 'j_poke_meowstic' && ['male', 'female'].includes(ex(e).form), 'Espurr -> Meowstic after 5 rounds, with a gender', [key(e), ex(e).form]);
  ok(!G.GAME.scry_amount, 'Meowstic has no Foresight (Espurr\'s is gone)', G.GAME.scry_amount);
  // the gender: rolled when it evolves (seeded), both turn up
  const by = {};
  for (let i = 0; i < 16 && !(by.male && by.female); i++) {
    start('MEOW' + i);
    const j = add('j_poke_espurr');
    rounds(5);
    by[ex(j).form] = by[ex(j).form] || 'MEOW' + i;
  }
  ok(by.male && by.female, 'both genders turn up', by);
  start(by.male);
  const again = add('j_poke_espurr'); rounds(5);
  ok(ex(again).form === 'male', 'the same seed rolls the same gender', ex(again).form);
  // Male: a Tarot at end of round, with room
  start('MALE');
  const m = add('j_poke_meowstic');
  ex(m).form = 'male'; delete ex(m).Xmult; delete ex(m).Xmult_mod;
  let t = play(['S_A']);
  ok(near(t.mult, 1), 'Male: no X', t.total);
  ok(/Prankster/.test(plain(m)) && /♂/.test(plain(m)), 'Male\'s text: Prankster', plain(m));
  endRound();
  ok(tarots() === 1, 'Male, Prankster: a Tarot at end of round', tarots());
  advance(); endRound(); advance();
  ok(tarots() === 2, 'one each round (2)', tarots());
  endRound(); advance();
  ok(tarots() === 2 && G.consumeables.cards.length === 2, 'no room (2 slots full): nothing', tarots());
  add('j_blueprint'); G.jokers.cards.unshift(G.jokers.cards.pop()); // (Blueprint left of Meowstic: it copies it)
  G.consumeables.cards.slice().forEach((c) => { act({ type: 'sell', id: c.sort_id }); flush(); });
  endRound();
  ok(tarots() === 1, 'Blueprint doesn\'t copy the Tarot (1, not 2)', tarots());
  // Female: X1.5 + X0.25 per Tarot held
  start('FEMALE');
  const fm = add('j_poke_meowstic');
  ex(fm).form = 'female'; ex(fm).Xmult = 1.5; ex(fm).Xmult_mod = 0.25;
  t = play(['S_A']);
  ok(near(t.mult, 1.5), 'Female, no Tarot: X1.5', t.total);
  add('c_fool'); add('c_magician'); add('c_pluto');
  t = play(['S_A']);
  ok(near(t.mult, 2), 'two Tarots held (a Planet doesn\'t count): X2', t.total);
  ok(/Currently 2: X2 Mult/.test(plain(fm)) && /♀/.test(plain(fm)), 'the tooltip counts them', plain(fm));
  endRound();
  ok(tarots() === 2, 'Female makes no Tarot', tarots());
  // Energy: carried from Espurr to a Female; a Male can't take it
  const femaleSeed = by.female, maleSeed = by.male;
  start(femaleSeed);
  const ef = add('j_poke_espurr');
  increment_energy(ef, 'Psychic');
  rounds(5);
  ok(ex(ef).form === 'female' && near(ex(ef).Xmult, 1.8) && near(ex(ef).Xmult_mod, 0.3), 'Espurr\'s Energy is re-applied to a Female Meowstic: X1.8, +X0.3', [ex(ef).form, ex(ef).Xmult, ex(ef).Xmult_mod]);
  start(maleSeed);
  const em = add('j_poke_espurr');
  rounds(5);
  ok(ex(em).form === 'male' && ex(em).Xmult === undefined && !energy_can_use({ etype: 'Psychic' }, null), 'a Male has no number: Psychic Energy can\'t be used on it', [ex(em), energy_can_use({ etype: 'Psychic' }, null)]);
  // art: the Female card beside the Male one
  ex(em).form = 'female';
  const [a, p] = drawn(em), [sa, sp] = drawn(em, true);
  ok(a === GEN6 && p.x === 4 && p.y === 8 && sa === GEN6S && sp.x === 4 && sp.y === 8, 'Female: the Gen 6 {4,8} card (Shiny twin)', [a, p]);
  ex(em).form = 'male';
  const [a2, p2] = drawn(em);
  ok(a2 === GEN6 && p2.x === 2 && p2.y === 8, 'Male: its own {2,8}', [a2, p2]);
});

// ------------------------------------------------------------------- Energy numbers
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
  steps('fletchling', 'mult', 'Colorless', [11.2, 14.4, 17.6]);
  steps('fletchinder', 'Xmult', 'Fire', [1.8, 2.1, 2.4]);
  const ta = steps('talonflame', 'Xmult', 'Fire', [3, 3.5, 4]);
  ok(ex(ta).retriggers === 1, 'Talonflame\'s retrigger stays 1');
  let t = play(['S_A']);
  ok(near(t.mult, 4), 'energized Talonflame: X4 on the first hand', t.total);
  steps('scatterbug', 'mult', 'Grass', [5.6, 7.2, 8.8]);
  steps('spewpa', 'Xmult_multi', 'Grass', [1.365, 1.43, 1.495]);
  steps('vivillon', 'Xmult_multi', 'Grass', [1.365, 1.43, 1.495]);
  steps('flabebe', 'mult', 'Fairy', [5.6, 7.2, 8.8]);
  const fl = steps('floette', 'Xmult_multi', 'Fairy', [1.3125, 1.375, 1.4375]);
  ok(ex(fl).retriggers === 1, 'Floette\'s retrigger stays 1');
  const fg = steps('florges', 'Xmult_multi', 'Fairy', [1.3125, 1.375, 1.4375]);
  ok(ex(fg).retriggers === 2, 'Florges\'s retriggers stay 2');
  steps('skiddo', 'chips', 'Grass', [39, 48, 57]);
  steps('skiddo', 'chips1', 'Grass', [13, 16, 19]);
  const gg = steps('gogoat', 'chips', 'Grass', [78, 96, 114]);
  ok(ex(gg).h_size === 1, 'Gogoat\'s hand size stays +1');
  steps('gogoat', 'chips1', 'Grass', [26, 32, 38]);
  steps('pancham', 'mult', 'Fighting', [4.2, 5.4, 6.6]);
  steps('pangoro', 'Xmult_multi', 'Fighting', [1.365, 1.43, 1.495]);
  steps('furfrou', 'chips', 'Colorless', [26, 32, 38]);
  steps('furfrou', 'mult', 'Colorless', [5.6, 7.2, 8.8]);
  const es = steps('espurr', 'Xmult_mod', 'Psychic', [0.3, 0.35, 0.4]);
  ok(ex(es).scry === 1, 'Espurr\'s Foresight stays 1');
  // the carried Energy lands on the evolution
  start('ENCARRY');
  const s = add('j_poke_scatterbug');
  increment_energy(s, 'Grass');
  rounds(8);
  ok(key(s) === 'j_poke_vivillon' && near(ex(s).Xmult_multi, 1.365), 'Scatterbug\'s Energy reaches Vivillon: X1.365', [key(s), ex(s).Xmult_multi]);
  start('ENCARRY2');
  const f = add('j_poke_flabebe');
  increment_energy(f, 'Fairy'); increment_energy(f, 'Fairy');
  rounds(9);
  ok(key(f) === 'j_poke_florges' && near(ex(f).Xmult_multi, 1.375), 'Flabébé\'s 2 Energy reach Florges: X1.375', [key(f), ex(f).Xmult_multi]);
  void t;
});

// ------------------------------------------------------------------- save / resume: the rolled forms come back
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'G6RES', customDeck: { name: 'G6', mods: ['pokermon'], params: { blind_scaling: 0.05 }, jokers: [{ key: 'j_poke_flabebe' }, { key: 'j_poke_furfrou' }, { key: 'j_poke_vivillon' }, { key: 'j_poke_meowstic' }, { key: 'j_poke_spewpa' }] } });
  s.act({ type: 'select_blind' }); flush();
  const forms = () => G.jokers.cards.map((j) => key(j).slice(7) + ':' + ex(j).form).join();
  const wild = () => G.playing_cards.filter((c) => c.config.center.key === 'm_wild').map((c) => c.base.suit + c.base.id).sort().join();
  const f0 = forms(), w0 = wild();
  ok(/flabebe:(red|white|yellow|orange|blue)/.test(f0) && /furfrou:(heart|diamond|star|debutante)/.test(f0) && /vivillon:\d+/.test(f0) && /meowstic:(male|female)/.test(f0), 'a run: the flower, the trim, the pattern and the gender are set', f0);
  ok(w0.split(',').filter(Boolean).length === 2, 'Spewpa and Vivillon each made a Wild card', w0);
  const hc = G.hand.cards.slice(0, 5);
  s.act({ type: 'highlight', ids: hc.map((c) => c.sort_id) }); s.act({ type: 'play' }); flush();
  const r1 = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  ok(!r1.stoppedAt && forms() === f0 && wild() === w0, 'resume (rebuilt from the recipe): the same forms and the same Wild cards', [r1.stoppedAt, forms(), wild()]);
  // across an Ante change: Furfrou's new trim comes back too
  let guard = 0;
  while (G.GAME.round_resets.ante === 1 && guard++ < 40 && !r1.over) {
    if (G.STATE === STATES.ROUND_EVAL) r1.act({ type: 'cash_out' });
    else if (G.STATE === STATES.SHOP) r1.act({ type: 'next_round' });
    else if (G.STATE === STATES.BLIND_SELECT) r1.act({ type: 'select_blind' });
    else { const cs = G.hand.cards.slice(0, 5); r1.act({ type: 'highlight', ids: cs.map((c) => c.sort_id) }); r1.act({ type: 'play' }); }
    flush();
  }
  ok(G.GAME.round_resets.ante === 2, 'the run reached Ante 2', [G.GAME.round_resets.ante, r1.over]);
  const f1 = forms();
  const r2 = Session.fromRecipe(JSON.parse(JSON.stringify(r1.recipe))); flush();
  ok(!r2.stoppedAt && forms() === f1 && f1 !== f0, 'resume in Ante 2: the new trim comes back exactly', [f0, f1, forms()]);
});

// ------------------------------------------------------------------- the art: the pixels tell the forms apart
if (ART) {
  await sec('art cells', async () => {
    const ATL = MODS.pokermon.content.atlases;
    const file = (atlas) => path.join(ART, decodeURIComponent(ATL[atlas].src).replace(/^.*\/assets\/2x\//, ''));
    const cut = async (cells) => {
      const byFile = {};
      cells.forEach((c, i) => { (byFile[file(c.atlas)] || (byFile[file(c.atlas)] = {}))[i] = [c.pos.x * 142 + 20, c.pos.y * 190 + 40, 102, 100]; });
      const px = {};
      for (const [f, rects] of Object.entries(byFile)) Object.assign(px, await crops(f, rects));
      return cells.map((c, i) => px[i]);
    };
    const count = (r, test) => { let n = 0; for (let i = 0; i < r.px.length; i += 4) if (r.px[i + 3] && test(r.px[i], r.px[i + 1], r.px[i + 2])) n++; return n; };
    const red = (R, Gc, B) => R > 170 && Gc < 90 && B < 90;
    const white = (R, Gc, B) => R > 215 && Gc > 215 && B > 215;
    const yellow = (R, Gc, B) => R > 235 && Gc > 215 && B > 125 && B < 170; // (the pale petals; the card's sand is darker)
    const orange = (R, Gc, B) => R > 180 && Gc > 90 && Gc < 160 && B < 90;
    const blue = (R, Gc, B) => B > 140 && B - R > 60 && B - Gc > 10;
    const pink = (R, Gc, B) => R > 200 && B > 120 && Gc < 150 && R - Gc > 70;
    const purple = (R, Gc, B) => R > 100 && B > 100 && Gc < 100 && Math.abs(R - B) < 70;
    const lightblue = (R, Gc, B) => B > 180 && Gc > 150 && R < 170 && B - R > 40;
    start('G6PX');
    // the Flabébé line: each colour's card has the most of its own colour (normal and Shiny cells inside their sheets)
    const TESTS = { red, white, yellow, orange, blue };
    for (const n of ['flabebe', 'floette', 'florges']) {
      const j = add('j_poke_' + n);
      const cells = DES.FLOWERS.map((col) => { ex(j).form = col; const [atlas, pos] = drawn(j); return { atlas, pos }; });
      const px = await cut(cells);
      ok(px.every((r) => r.inside), n + ': every flower cell is inside its sheet');
      for (const [i, col] of DES.FLOWERS.entries()) {
        const mine = count(px[i], TESTS[col]);
        const others = DES.FLOWERS.filter((c) => c !== col).map((c) => count(px[DES.FLOWERS.indexOf(c)], TESTS[col]));
        ok(others.every((o) => mine > o), `${n} ${col}: its card has the most ${col}`, [mine, others]);
      }
    }
    // Furfrou's trims: Heart the pinkest, Diamond the most orange, Star the most light blue, Debutante the most purple, Natural none of them
    const f = add('j_poke_furfrou');
    const TR = ['heart', 'diamond', 'star', 'debutante', undefined];
    const cells = TR.map((tr) => { ex(f).form = tr; const [atlas, pos] = drawn(f); return { atlas, pos }; });
    const px = await cut(cells);
    const score = (test) => px.map((r) => count(r, test));
    const best = (arr) => arr.indexOf(Math.max(...arr));
    ok(best(score(pink)) === 0, 'Heart Trim: the pinkest card (its hearts)', score(pink));
    ok(best(score(orange)) === 1, 'Diamond Trim: the most orange card', score(orange));
    ok(best(score(lightblue)) === 2, 'Star Trim: the most light-blue card', score(lightblue));
    ok(best(score(purple)) === 3, 'Debutante Trim: the most purple card', score(purple));
    // Meowstic: the Female card is white where the Male one is dark blue
    const m = add('j_poke_meowstic');
    const mc = ['male', 'female'].map((g) => { ex(m).form = g; const [atlas, pos] = drawn(m); return { atlas, pos }; });
    const mp = await cut(mc);
    ok(count(mp[1], white) > count(mp[0], white) && count(mp[0], blue) > count(mp[1], blue), 'Meowstic: the Female card is whiter, the Male bluer', [count(mp[0], white), count(mp[1], white), count(mp[0], blue), count(mp[1], blue)]);
    // Vivillon: all 20 cells are different pictures
    const v = add('j_poke_vivillon');
    const vc = []; for (let k = 1; k <= 20; k++) { ex(v).form = k; const [atlas, pos] = drawn(v); vc.push({ atlas, pos }); }
    const vp = await cut(vc);
    const sig = vp.map((r) => [red, white, yellow, orange, blue, pink, purple].map((fn) => count(r, fn)).join('/'));
    ok(new Set(sig).size === 20 && vp.every((r) => r.inside), 'Vivillon: the 20 pattern cells are 20 different pictures', sig);
    // the type icon on every form cell is the joker's type
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const ty = (x, y) => (typer.typeOfEntry({ atlas: 'AtlasJokersBasicGen06', pos: [x, y] }) || {}).ptype;
    const want = [
      ...Object.values(ANIM.GEN6_FORM_SPRITES.j_poke_vivillon).map((p) => [p, 'Grass']),
      ...['j_poke_flabebe', 'j_poke_floette', 'j_poke_florges'].flatMap((k) => Object.values(ANIM.GEN6_FORM_SPRITES[k]).map((p) => [p, 'Fairy'])),
      ...Object.values(ANIM.GEN6_FORM_SPRITES.j_poke_furfrou).map((p) => [p, 'Colorless']),
      [ANIM.GEN6_FORM_SPRITES.j_poke_meowstic.female, 'Psychic'],
    ];
    const wrong = want.filter(([p, t]) => ty(p.x, p.y) !== t).map(([p, t]) => [p, t, ty(p.x, p.y)]);
    ok(wrong.length === 0, `every form cell shows its joker's type icon (${want.length} cells)`, wrong);
  });
} else console.log('(Pokermon art not on disk: the sprite checks are skipped; set MICATRO_MAIN)');

done();
