// The owner's last Gen 4 regulars (2026-10-28, PR A of the "last 18 Gen 4 jokers"; jokers/pokejokers_designs.js sand_stream / sand_stone /
// sniper / flytrap / luminous; PORTING.md "The owner's last Gen 4 regulars"):
//   Hippopotas 449 (Basic, Earth, Common $5)   Sand Stream: scored Stone cards give +30 extra Chips (on top of Stone's own). 5 rounds.
//   Hippowdon 450 (Stage 1, Earth, Safari $8)  +60 extra; on each round's FIRST deal, 1 random unenhanced card in hand becomes Stone.
//   Skorupi 451 (Basic, Dark, Common $5)       Sniper: each scored card, 1 in 5 to crit for X1.25 (Pokermon's probability helpers). 5 rounds.
//   Drapion 452 (Stage 1, Dark, Safari $8)     1 in 3 for X1.5; Lucky cards always crit (no roll).
//   Carnivine 455 (Basic, Grass, Rare $7)      Flytrap: the first card you discard each round is devoured (destroyed) and banks +4 Mult.
//   Finneon 456 (Basic, Water, Common $5)      +40 Chips on night hands (each round's 2nd and 4th). 5 rounds.
//   Lumineon 457 (Stage 1, Water, Safari $8)   Night hands: each scored card +15 Chips; with Lunatone, day hands too.
// Every ability is FIRED through real hands, discards and rounds with exact numbers; evolutions and Energy too.
//   node micatro/tests/mods/pokermon_gen4_regulars_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, state } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { discard_cards_from_highlighted } from '../../js/engine/run.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '');
const NEW = ['hippopotas', 'hippowdon', 'skorupi', 'drapion', 'carnivine', 'finneon', 'lumineon'];
const isStone = (c) => c.config.center.key === 'm_stone';
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); return c; }
/** Play exactly these cards (the round never ends by accident). -> {cards, total, name, events}. */
function play(keys, { center, debuffPlayed = [] } = {}) {
  clearHand();
  const cs = hand(keys, center ? { center } : {});
  for (const i of debuffPlayed) debuff(cs[i]);
  G.GAME.chips = 0; if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const events = (r && r.events) || [];
  const total = events.find((e) => e.type === 'hand_total');
  return { cards: cs, events, total, name: (total || {}).hand };
}
/** Discard exactly these cards (put in hand left to right) as the player. -> the cards. */
function discard(keys, { hook = false } = {}) {
  clearHand();
  const cs = hand(keys);
  if (G.GAME.current_round.discards_left < 1) G.GAME.current_round.discards_left = 1;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  cs.leftmost = cs.slice().sort((x, y) => G.hand.cards.indexOf(x) - G.hand.cards.indexOf(y))[0];
  if (hook) discard_cards_from_highlighted(true); else act({ type: 'discard' });
  flush();
  return cs;
}
function fresh(seed, jokers) { start(seed); return jokers.map((k) => add(k.startsWith('j_') ? k : 'j_poke_' + k)); }
/** Win the round, cash out, and select the next Blind (The Wall). The new hand stays dealt unless `clear`. */
function nextRound({ clear = true } = {}) {
  clearHand();
  const c = hand(['S_2']);
  G.GAME.blind.chips = 1; G.GAME.chips = 1;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) });
  act({ type: 'play' }); flush();
  if (state() === 'ROUND_EVAL') act({ type: 'cash_out' });
  if (state() === 'SHOP') act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  if (clear) clearHand();
}
const HIGH = ['S_2'];
const FLUSH = ['S_2', 'S_4', 'S_7', 'S_9', 'S_K'];
/** How many X`x` crits a hand's mult holds over its base: an integer, or NaN when it isn't base * x^k. */
const crits = (mult, base, x) => { const k = Math.round(Math.log(mult / base) / Math.log(x)); return near(mult, base * x ** k) ? k : NaN; };

// ------------------------------------------------------------------- pin, static data, order, families, precedence
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 44 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 44+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of NEW) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs');
  }
  const hits = [];
  const re = new RegExp(NEW.join('|'), 'i');
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the seven (nothing to dedupe)', hits);
});
await sec('static', () => {
  start('G4R0');
  const C = (n) => P_CENTERS['j_poke_' + n];
  const want = {
    hippopotas: [1, 5, 'Basic', 'Earth'], hippowdon: ['poke_safari', 8, 'One', 'Earth'], skorupi: [1, 5, 'Basic', 'Dark'], drapion: ['poke_safari', 8, 'One', 'Dark'],
    carnivine: [3, 7, 'Basic', 'Grass'], finneon: [1, 5, 'Basic', 'Water'], lumineon: ['poke_safari', 8, 'One', 'Water'],
  };
  for (const [n, [r, c, s, t]] of Object.entries(want)) {
    const x = C(n);
    ok(x && x.rarity === r && x.cost === c && x.stage === s && x.ptype === t && x.gen === 4 && x.blueprint_compat, n + ': ' + [r, c, s, t].join(' '), x && [x.rarity, x.cost, x.stage, x.ptype, x.gen]);
  }
  ok(C('hippopotas').config.extra.chips === 30 && C('hippopotas').config.extra.rounds === 5 && C('hippowdon').config.extra.chips === 60, 'Sand Stream +30 / +60; Hippopotas 5 rounds');
  ok(C('skorupi').config.extra.num === 1 && C('skorupi').config.extra.dem === 5 && C('skorupi').config.extra.Xmult_multi === 1.25 && C('skorupi').config.extra.rounds === 5, 'Skorupi 1 in 5, X1.25, 5 rounds');
  ok(C('drapion').config.extra.num === 1 && C('drapion').config.extra.dem === 3 && C('drapion').config.extra.Xmult_multi === 1.5, 'Drapion 1 in 3, X1.5');
  ok(C('carnivine').config.extra.mult_mod === 4 && C('carnivine').config.extra.devour_mult === 0 && !C('carnivine').config.extra.rounds, 'Carnivine +4 a devour, single-stage');
  ok(C('finneon').config.extra.chips === 40 && C('finneon').config.extra.rounds === 5 && C('lumineon').config.extra.chips === 15, 'Finneon +40, 5 rounds; Lumineon +15 a card');
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_hippopotas');
  ok(keys.slice(i - 1, i + 8).join() === ['mega_lucario', ...NEW, 'mantyke'].map((n) => 'j_poke_' + n).join(), 'Pokédex order: Mega Lucario (448), 449-452, 455-457, Mantyke (458)', keys.slice(i - 1, i + 8));
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
  ok(fam('hippopotas') === 'hippopotas,hippowdon' && fam('skorupi') === 'skorupi,drapion' && fam('lumineon') === 'finneon,lumineon', 'families: Hippopotas / Skorupi / Finneon lines', [fam('hippopotas'), fam('skorupi'), fam('lumineon')]);
  const cells = { hippopotas: [26, 29], hippowdon: [28, 29], skorupi: [0, 30], drapion: [2, 30], carnivine: [8, 30], finneon: [10, 30], lumineon: [12, 30] };
  ok(Object.entries(cells).every(([n, [x, y]]) => C(n).atlas === 'poke_AtlasJokersBasicNatdex391' && C(n).pos.x === x && C(n).pos.y === y), 'art: upstream 3.9.1\'s own Natdex cells (nothing to deploy)',
    NEW.map((n) => [C(n).atlas, C(n).pos]));
  for (const n of ['hippopotas', 'skorupi', 'carnivine', 'finneon']) ok(pool_filter(C(n), 'Joker') === undefined && C(n).in_pool(C(n)) !== false, n + ' can be rolled in the shop');
  ok(near(energy_values.chips, 0.3) && near(energy_values.Xmult_multi, 0.05) && near(energy_values.mult_mod, 0.2) && !('devour_mult' in energy_values) && !('num' in energy_values), 'Energy fields: chips +30%, Xmult_multi +5%, mult_mod +20%; the bank and the odds are not energized');
});

// ------------------------------------------------------------------- Hippopotas / Hippowdon: Sand Stream extra Chips
await sec('sand stream chips', () => {
  fresh('G4H1', ['hippopotas']);
  let r = play(HIGH, { center: 'm_stone' });
  ok(r.total.chips === 5 + 50 + 30, 'Hippopotas: a Stone card scores 5 + 50 + 30 = 85 Chips', r.total && r.total.chips);
  r = play(['S_2', 'H_9'], { center: 'm_stone' });
  ok(r.total.chips === 5 + 2 * 80, 'two Stone cards: 5 + 2 x 80', r.total && r.total.chips);
  r = play(HIGH);
  ok(r.total.chips === 5 + 2, 'a plain card: nothing extra (7 Chips)', r.total && r.total.chips);
  r = play(['S_2', 'H_9'], { center: 'm_stone', debuffPlayed: [1] });
  ok(r.total.chips === 5 + 80, 'a debuffed Stone card gives nothing', r.total && r.total.chips);
  fresh('G4H2', ['hippopotas', 'regirock']);
  r = play(HIGH, { center: 'm_stone' });
  ok(r.total.chips === 5 + 100 + 30, 'stacks with Regirock\'s Stone Body: 5 + 100 + 30', r.total && r.total.chips);
  fresh('G4H3', ['hippowdon']);
  r = play(HIGH, { center: 'm_stone' });
  ok(r.total.chips === 5 + 50 + 60, 'Hippowdon: 5 + 50 + 60', r.total && r.total.chips);
  fresh('G4H4', ['j_blueprint', 'hippopotas']);
  r = play(HIGH, { center: 'm_stone' });
  ok(r.total.chips === 5 + 50 + 60, 'Blueprint copies it: 5 + 50 + 30 + 30', r.total && r.total.chips);
  const [d] = fresh('G4H5', ['hippopotas']);
  debuff(d);
  r = play(HIGH, { center: 'm_stone' });
  ok(r.total.chips === 5 + 50, 'a debuffed Hippopotas gives nothing', r.total && r.total.chips);
});

// ------------------------------------------------------------------- Hippowdon: a card in hand turns Stone on each first deal
await sec('sand stream conversion', () => {
  const [h] = fresh('G4HC', ['hippowdon']);
  const s0 = G.playing_cards.filter(isStone).length;
  const plain0 = new Set(G.playing_cards.filter((c) => c.config.center === P_CENTERS.c_base));
  nextRound({ clear: false });
  const stones = G.playing_cards.filter(isStone);
  const turned = stones.filter((c) => plain0.has(c));
  ok(stones.length === s0 + 1 && turned.length === 1 && G.hand.cards.includes(turned[0]), 'the first deal: exactly 1 unenhanced card in hand becomes Stone', [s0, stones.length, turned.length]);
  ok(ex(h).sand_round === G.GAME.round, 'once a round (sand_round)', [ex(h).sand_round, G.GAME.round]);
  // later draws this round (after a play and a discard) never convert again
  const hc = G.hand.cards.filter((c) => !isStone(c)).slice(0, 2);
  act({ type: 'highlight', ids: [hc[0].sort_id] }); G.GAME.chips = 0; G.GAME.blind.chips = 1e15; act({ type: 'play' }); flush();
  act({ type: 'highlight', ids: [G.hand.cards.find((c) => !isStone(c)).sort_id] }); act({ type: 'discard' }); flush();
  ok(G.playing_cards.filter(isStone).length === s0 + 1, 'the draws after a play and a discard convert nothing', G.playing_cards.filter(isStone).length);
  nextRound({ clear: false });
  ok(G.playing_cards.filter(isStone).length === s0 + 2, 'the next round\'s first deal converts one more', G.playing_cards.filter(isStone).length);
  // never an enhanced card: an all-Bonus deck converts nothing
  fresh('G4HB', ['hippowdon']);
  for (const c of G.playing_cards) c.set_ability(P_CENTERS.m_bonus, null, true);
  nextRound({ clear: false });
  ok(G.playing_cards.filter(isStone).length === 0, 'no unenhanced card in hand: nothing (never overwrites)', G.playing_cards.filter(isStone).length);
  // Blueprint doesn't copy the conversion; a debuffed Hippowdon doesn't convert
  fresh('G4HP', ['j_blueprint', 'hippowdon']);
  const b0 = G.playing_cards.filter(isStone).length;
  nextRound({ clear: false });
  ok(G.playing_cards.filter(isStone).length === b0 + 1, 'Blueprint + Hippowdon: still 1 card a round', G.playing_cards.filter(isStone).length - b0);
  const [x] = fresh('G4HX', ['hippowdon']);
  debuff(x);
  nextRound({ clear: false });
  ok(G.playing_cards.filter(isStone).length === 0, 'a debuffed Hippowdon converts nothing');
  // seeded: the same seed turns the same card
  const pick = (seed) => { fresh(seed, ['hippowdon']); nextRound({ clear: false }); return G.playing_cards.findIndex(isStone); };
  const p1 = pick('G4HS'), p2 = pick('G4HS');
  ok(p1 >= 0 && p1 === p2, 'the pick is seeded (same seed, same card)', [p1, p2]);
});

// ------------------------------------------------------------------- Hippopotas -> Hippowdon after 5 rounds (Energy carried)
await sec('evolve hippopotas', () => {
  const [h] = fresh('G4HE', ['hippopotas']);
  increment_energy(h, 'Earth');
  ok(near(ex(h).chips, 39), 'one Earth Energy: +30 -> +39', ex(h).chips);
  for (let i = 0; i < 4; i++) nextRound();
  ok(key(h) === 'j_poke_hippopotas' && ex(h).rounds === 1, 'after 4 rounds: still Hippopotas (1 to go)', [key(h), ex(h).rounds]);
  nextRound();
  ok(key(h) === 'j_poke_hippowdon' && ex(h).energy_count === 1 && near(ex(h).chips, 78), 'after 5 rounds: Hippowdon, its Energy re-applied (+60 -> +78)', [key(h), ex(h)]);
  const r = play(HIGH, { center: 'm_stone' });
  ok(near(r.total.chips, 5 + 50 + 78), 'and it scores +78 on a Stone card', r.total && r.total.chips);
  const [w] = fresh('G4HE2', ['hippowdon']);
  const got = [];
  for (let n = 0; n < 3; n++) { increment_energy(w, 'Earth'); got.push(ex(w).chips); }
  ok(got.every((v, i) => near(v, [78, 96, 114][i])), 'Hippowdon: +60 -> 78 / 96 / 114', got);
});

// ------------------------------------------------------------------- Skorupi / Drapion: Sniper crits
await sec('sniper', () => {
  // the X is exact: forced odds (num = dem) crit every scored card
  const [s] = fresh('G4S1', ['skorupi']);
  ex(s).num = 5;
  let r = play(FLUSH);
  ok(near(r.total.mult, 4 * 1.25 ** 5), 'every card crits: Flush 4 x 1.25^5', r.total && r.total.mult);
  ex(s).num = 1;
  // the 1 in 5 roll, over many seeded cards: each hand is base x 1.25^k (k crits), about a fifth of the cards
  let k = 0, n = 0, bad = 0;
  for (let h = 0; h < 40; h++) { r = play(FLUSH); const c = crits(r.total.mult, 4, 1.25); if (Number.isNaN(c)) bad++; else k += c; n += 5; }
  ok(bad === 0 && k > n * 0.1 && k < n * 0.32, 'Skorupi: about 1 in 5 cards crits (each hand exactly 4 x 1.25^k)', [k, n, bad]);
  ok(/1 in 5 chance to \| crit for\s+X1\.25\s+Mult/.test(plain(s)), 'its text: 1 in 5, X1.25', plain(s));
  // Oops! All 6s doubles the odds (2 in 5)
  const [o] = fresh('G4S2', ['skorupi', 'j_oops']);
  k = 0; n = 0;
  for (let h = 0; h < 40; h++) { r = play(FLUSH); k += crits(r.total.mult, 4, 1.25); n += 5; }
  ok(k > n * 0.28 && k < n * 0.52 && /2 in 5 chance/.test(plain(o)), 'Oops! All 6s: 2 in 5 (about two cards in five crit)', [k, n, plain(o)]);
  // Absol fixes every roll at 0
  fresh('G4S3', ['skorupi', 'absol']);
  let any = 0;
  for (let h = 0; h < 20; h++) { r = play(FLUSH); if (!near(r.total.mult, 4 * 2)) any++; }
  ok(any === 0, 'Absol: never a crit (Flush 4 x Absol X2 every time)', any);
  // a debuffed card can't crit; a debuffed Skorupi does nothing
  const [d] = fresh('G4S4', ['skorupi']);
  ex(d).num = 5;
  r = play(FLUSH, { debuffPlayed: [0, 1] });
  ok(near(r.total.mult, 4 * 1.25 ** 3), 'two debuffed cards: 3 crits', r.total && r.total.mult);
  debuff(d);
  r = play(FLUSH);
  ok(r.total.mult === 4, 'a debuffed Skorupi: nothing', r.total && r.total.mult);
  // Drapion: 1 in 3, X1.5
  const [p] = fresh('G4D1', ['drapion']);
  k = 0; n = 0;
  for (let h = 0; h < 40; h++) { r = play(FLUSH); k += crits(r.total.mult, 4, 1.5); n += 5; }
  ok(k > n * 0.2 && k < n * 0.47, 'Drapion: about 1 in 3 cards crits for X1.5', [k, n]);
  ok(/1 in 3 chance to \| crit for\s+X1\.5\s+Mult \| Lucky cards always crit/.test(plain(p)), 'its text', plain(p));
  // Lucky cards always crit, even with Absol (no roll); Absol stops the rest (and the Lucky cards' own odds)
  fresh('G4D2', ['drapion', 'absol']);
  r = play(FLUSH, { center: 'm_lucky' });
  ok(near(r.total.mult, 4 * 1.5 ** 5 * 2), 'five Lucky cards with Absol: all crit, 4 x 1.5^5 x 2', r.total && r.total.mult);
  r = play(FLUSH);
  ok(near(r.total.mult, 4 * 2), 'plain cards with Absol: none', r.total && r.total.mult);
  // Blueprint: its own roll (forced odds: both crit every card)
  const [, q] = fresh('G4D3', ['j_blueprint', 'drapion']);
  ex(q).num = 3;
  r = play(HIGH);
  ok(near(r.total.mult, 1.5 * 1.5), 'Blueprint + Drapion (forced odds): two X1.5 crits on the card', r.total && r.total.mult);
  // Energy: X1.25 -> 1.3125 / 1.375 / 1.4375; X1.5 -> 1.575 / 1.65 / 1.725; the odds stay
  const [e] = fresh('G4SE', ['skorupi']);
  const xs = [];
  for (let i = 0; i < 3; i++) { increment_energy(e, 'Dark'); xs.push(ex(e).Xmult_multi); }
  ok(xs.every((v, i) => near(v, [1.3125, 1.375, 1.4375][i])) && ex(e).num === 1 && ex(e).dem === 5, 'Skorupi Energy: X1.3125 / 1.375 / 1.4375 (odds unchanged)', [xs, ex(e).num, ex(e).dem]);
  const [f] = fresh('G4DE', ['drapion']);
  const ys = [];
  for (let i = 0; i < 3; i++) { increment_energy(f, 'Dark'); ys.push(ex(f).Xmult_multi); }
  ok(ys.every((v, i) => near(v, [1.575, 1.65, 1.725][i])), 'Drapion Energy: X1.575 / 1.65 / 1.725', ys);
  ex(f).num = 3;
  r = play(HIGH);
  ok(near(r.total.mult, 1.725), 'a 3-Energy crit gives X1.725', r.total && r.total.mult);
});

// ------------------------------------------------------------------- Skorupi -> Drapion after 5 rounds
await sec('evolve skorupi', () => {
  const [s] = fresh('G4SV', ['skorupi']);
  increment_energy(s, 'Dark'); increment_energy(s, 'Dark');
  for (let i = 0; i < 5; i++) nextRound();
  ok(key(s) === 'j_poke_drapion' && ex(s).energy_count === 2 && near(ex(s).Xmult_multi, 1.65) && ex(s).dem === 3 && ex(s).always_crit, 'after 5 rounds: a 2-Energy Drapion (X1.65, 1 in 3, Lucky always)', [key(s), ex(s)]);
});

// ------------------------------------------------------------------- Carnivine: Flytrap
await sec('flytrap', () => {
  const [c, caino] = fresh('G4C1', ['carnivine', 'j_caino']);
  const n0 = G.playing_cards.length;
  let cs = discard(['S_K', 'H_3', 'D_4']);
  ok(cs.leftmost === cs[0] && !G.playing_cards.includes(cs[0]) && G.playing_cards.includes(cs[1]) && G.playing_cards.includes(cs[2]) && G.playing_cards.length === n0 + 2,
    'the round\'s first discard: its leftmost card (the King) is destroyed, the others discarded', [G.playing_cards.length - n0]);
  ok(ex(c).devour_mult === 4, 'it banks +4 Mult', ex(c).devour_mult);
  ok(caino.ability.caino_xmult === 2, 'the engine\'s destroy plumbing: Canio sees the destroyed King (X1 -> X2)', caino.ability.caino_xmult);
  cs = discard(['S_Q']);
  ok(G.playing_cards.includes(cs[0]) && ex(c).devour_mult === 4 && caino.ability.caino_xmult === 2, 'the second discard this round: nothing devoured', ex(c).devour_mult);
  let r = play(HIGH);
  ok(r.total.mult === (1 + 4) * 2, 'it gives the bank: High Card (1 + 4) Mult, then Canio X2', r.total && r.total.mult);
  ok(/Currently \+4 Mult; fed this round/.test(plain(c)), 'tooltip: +4, fed this round', plain(c));
  nextRound();
  ok(/Currently \+4 Mult; hungry/.test(plain(c)), 'a new round: hungry', plain(c));
  discard(['H_5']);
  ok(ex(c).devour_mult === 8, 'the next round\'s first discard: +4 more (+8)', ex(c).devour_mult);
  // an effect's discard (The Hook's: hook) is not yours: nothing; the player's first discard after it still devours
  const [h] = fresh('G4C2', ['carnivine']);
  cs = discard(['S_9'], { hook: true });
  ok(G.playing_cards.includes(cs[0]) && ex(h).devour_mult === 0, 'an effect discard (hook): not devoured', ex(h).devour_mult);
  cs = discard(['S_8']);
  ok(!G.playing_cards.includes(cs[0]) && ex(h).devour_mult === 4, '... the player\'s first discard then is', ex(h).devour_mult);
  // a Glass card shatters; Blueprint copies only the Mult; a debuffed Carnivine devours nothing
  const [g] = fresh('G4C3', ['carnivine']);
  clearHand(); const [gl] = hand(['S_7'], { center: 'm_glass' });
  act({ type: 'highlight', ids: [gl.sort_id] }); act({ type: 'discard' }); flush();
  ok(!G.playing_cards.includes(gl) && !gl.area && ex(g).devour_mult === 4, 'a Glass card is devoured too (shattered)', [G.playing_cards.includes(gl), ex(g).devour_mult]);
  const [, b] = fresh('G4C4', ['j_blueprint', 'carnivine']);
  const nb = G.playing_cards.length;
  discard(['S_7', 'S_6']);
  ok(ex(b).devour_mult === 4 && G.playing_cards.length === nb + 2 - 1, 'Blueprint + Carnivine: one card devoured, +4 once', [ex(b).devour_mult, G.playing_cards.length]);
  r = play(HIGH);
  ok(r.total.mult === 1 + 4 + 4, 'Blueprint copies the Mult: 1 + 4 + 4', r.total && r.total.mult);
  const [x] = fresh('G4C5', ['carnivine']);
  debuff(x);
  cs = discard(['S_7']);
  ok(G.playing_cards.includes(cs[0]) && ex(x).devour_mult === 0, 'a debuffed Carnivine devours nothing', ex(x).devour_mult);
  // Energy: +4 -> 4.8 / 5.6 / 6.4 a devour, never retroactive
  const [e] = fresh('G4CE', ['carnivine']);
  ex(e).devour_mult = 8;
  const got = [];
  for (let i = 0; i < 3; i++) { increment_energy(e, 'Grass'); got.push(ex(e).mult_mod); }
  ok(got.every((v, i) => near(v, [4.8, 5.6, 6.4][i])) && ex(e).devour_mult === 8, 'Grass Energy: +4.8 / 5.6 / 6.4 a devour; the +8 bank stays', [got, ex(e).devour_mult]);
  discard(['S_7']);
  ok(near(ex(e).devour_mult, 14.4), 'a 3-Energy devour banks +6.4 (8 -> 14.4)', ex(e).devour_mult);
});

// ------------------------------------------------------------------- Finneon / Lumineon: night hands
await sec('night hands', () => {
  const [f] = fresh('G4F1', ['finneon']);
  const chips = [];
  for (let i = 0; i < 5; i++) chips.push(play(HIGH).total.chips);
  ok(chips.join() === [7, 47, 7, 47, 7].join(), 'Finneon: +40 Chips on the 2nd and 4th hands only (7 / 47 / 7 / 47 / 7)', chips);
  nextRound();
  ok(play(HIGH).total.chips === 7 && play(HIGH).total.chips === 47, 'the cycle restarts each round (day, then night)');
  ok(/\+40 Chips on night hands/.test(plain(f)) && /Next hand: Day/.test(plain(f)), 'its text: +40 on night hands; next hand Day (the 3rd)', plain(f));
  const [l] = fresh('G4L1', ['lumineon']);
  const lc = [];
  for (let i = 0; i < 4; i++) lc.push(play(FLUSH).total.chips);
  const base = 35 + 2 + 4 + 7 + 9 + 10;
  ok(lc.join() === [base, base + 75, base, base + 75].join(), 'Lumineon: each scored card +15 on night hands (Flush: +75)', lc);
  const [l2, luna] = fresh('G4L2', ['lumineon', 'lunatone']);
  const dc = [];
  for (let i = 0; i < 2; i++) dc.push(play(FLUSH).total.chips);
  ok(dc.join() === [base + 75, base + 75].join() && /Lunatone: active/.test(plain(l2)), 'with Lunatone: day hands too', [dc, plain(l2)]);
  debuff(luna);
  ok(play(FLUSH).total.chips === base && /Lunatone: needs Lunatone/.test(plain(l2)), 'a debuffed Lunatone: day hands get nothing again', plain(l2));
  fresh('G4L3', ['j_blueprint', 'lumineon']);
  play(HIGH);
  ok(play(HIGH).total.chips === 7 + 30, 'Blueprint + Lumineon, a night High Card: +15 twice', 0);
  const [fe] = fresh('G4FE', ['finneon']);
  const got = [];
  for (let i = 0; i < 3; i++) { increment_energy(fe, 'Water'); got.push(ex(fe).chips); }
  ok(got.every((v, i) => near(v, [52, 64, 76][i])), 'Finneon Energy: +52 / 64 / 76', got);
  for (let i = 0; i < 5; i++) nextRound();
  ok(key(fe) === 'j_poke_lumineon' && ex(fe).energy_count === 3 && near(ex(fe).chips, 28.5), 'after 5 rounds: a 3-Energy Lumineon (+28.5 a card)', [key(fe), ex(fe)]);
  play(HIGH);
  ok(near(play(HIGH).total.chips, 7 + 28.5), 'and a night card gets +28.5', 0);
  const [le] = fresh('G4LE', ['lumineon']);
  const lg = [];
  for (let i = 0; i < 3; i++) { increment_energy(le, 'Water'); lg.push(ex(le).chips); }
  ok(lg.every((v, i) => near(v, [19.5, 24, 28.5][i])), 'Lumineon Energy: +19.5 / 24 / 28.5', lg);
});

// ------------------------------------------------------------------- text
await sec('text', () => {
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  ok(NEW.every((n) => J['j_poke_' + n]), 'the seven texts');
  const js = fresh('G4TXT', NEW);
  const d = Object.fromEntries(NEW.map((n, i) => [n, plain(js[i])]));
  ok(/Sand Stream: scored \| Stone cards give \| \+30 extra Chips/.test(d.hippopotas) && /Evolves after 5 rounds/.test(d.hippopotas), 'Hippopotas', d.hippopotas);
  ok(/\+60 extra Chips/.test(d.hippowdon) && /On each round's first deal, 1 \| random unenhanced card held \| in hand becomes a Stone card/.test(d.hippowdon), 'Hippowdon', d.hippowdon);
  ok(/Sniper: each scored card \| has a 1 in 5 chance to/.test(d.skorupi) && /Evolves after 5 rounds/.test(d.skorupi), 'Skorupi', d.skorupi);
  ok(/Flytrap: the first card you \| discard each round is \| devoured \(destroyed\) and \| permanently adds \+4 Mult/.test(d.carnivine) && /Currently \+0 Mult; hungry/.test(d.carnivine), 'Carnivine', d.carnivine);
  ok(/\+40 Chips on night hands/.test(d.finneon) && /Evolves after 5 rounds/.test(d.finneon), 'Finneon', d.finneon);
  ok(/each scored \| card gives \+15 Chips/.test(d.lumineon) && /With Lunatone, on day hands too/.test(d.lumineon), 'Lumineon', d.lumineon);
});

done();
