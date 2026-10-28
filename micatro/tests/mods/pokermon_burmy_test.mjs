// The owner's Burmy line (2026-10-28; jokers/pokejokers_designs.js "The Burmy line"; PORTING.md "The owner's Burmy line"):
//   Burmy 412 (Basic, Common $5)      Cloak: at the end of each round it wears the cloak of the most common enhancement in the full
//                                     deck — unenhanced (or any enhancement but Stone / Steel) Plant, Stone Sandy, Steel Trash; a tie
//                                     between kinds calling for different cloaks keeps the cloak. Starts as Plant. Its type and card
//                                     follow: Plant Grass +5 Mult, Sandy Earth +40 Chips, Trash Metal $1 at end of round.
//                                     Gender rolled once when created (the run's seeded RNG). Evolves after 4 rounds: Female ->
//                                     Wormadam (keeping its cloak), Male -> Mothim. Its cloak type never breaks Monotype.
//   Wormadam 413 (Stage 1, Safari $8)  Cloaked (locked): Plant, scored unenhanced cards +3 Mult; Sandy, scored Stone cards X1.5 Mult;
//                                     Trash, each Steel card held in hand at end of round earns $1.
//   Mothim 414 (Stage 1, Safari $8)    Free Flight: X(1 + 0.25 per different enhancement in the full deck; the 8 vanilla + Seed, Flower).
//   Energy: Burmy mult1 / chips1, Wormadam mult1 / Xmult_multi, Mothim Xmult_mod at the standard shares; the $ are fixed; it carries
//   through evolution.
// Every ability is FIRED through real rounds with exact numbers.
//   node micatro/tests/mods/pokermon_burmy_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, play, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS, create_card, copy_card } from '../../js/engine/core.js';
import { newRun } from '../../js/engine/run.js';
import { toView } from '../../js/engine/view.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_matches, energy_values } from '../../mods/pokermon/systems/energy.js';
import { is_type, get_type, find_pokemon_type, apply_type_sticker } from '../../mods/pokermon/systems/types.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import * as ANIM from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import * as DESIGNS from '../../mods/pokermon/jokers/pokejokers_designs.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const lines = (j) => describe(j).lines.join(' | ');
const LINE = ['burmy', 'wormadam', 'mothim'];
const cloak_of_deck = DESIGNS.cloak_of_deck || (() => 'n/a');
const CLOAKS = DESIGNS.BURMY_CLOAKS || {};
const SPRITES = ANIM.BURMY_SPRITES || {};

/** Give the WHOLE deck (every playing card) these enhancements, in order; the rest become `rest`. counts may be fn(N). */
function setDeck(counts, rest = 'c_base') {
  const cards = G.playing_cards, N = cards.length;
  const want = typeof counts === 'function' ? counts(N) : counts;
  let i = 0;
  for (const [k, n] of Object.entries(want)) for (let j = 0; j < n; j++) cards[i++].set_ability(P_CENTERS[k], null, true);
  for (; i < N; i++) cards[i].set_ability(P_CENTERS[rest], null, true);
  return N;
}
/** Win the round in progress with a High Card 2 (the deck set to `counts` first, the played card included), landing in ROUND_EVAL. */
function endRound(counts, rest) {
  clearHand();
  const c = hand(['S_2']);
  if (counts) setDeck(counts, rest);
  G.GAME.chips = G.GAME.blind.chips;
  const r = play(c, { keepChips: true });
  flush();
  return r;
}
/** From ROUND_EVAL: cash out, next round, select the blind (a harmless Wall), hand emptied. */
function advance() {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  clearHand();
}
/** The joker rows of the round's cash-out. */
const cashRows = (k) => ((G.GAME.round_eval && G.GAME.round_eval.rows) || []).filter((r) => r.center === k);
/** High Card of one 2 of Spades (7 Chips, 1 Mult before the jokers). */
const high = () => { clearHand(); const t = play(hand(['S_2'])).total; flush(); return t; };
function burmy(seed, gender) { start(seed); const b = add('j_poke_burmy'); if (gender) ex(b).gender = gender; return b; }
const face = (j) => { const v = {}; view_card(j, v); return POKE_UI.face({ center: key(j), facing: 'front', poke: v.poke, atlas: j.config.center.atlas, pos: j.config.center.pos }, { area: 'jokers' }); };

// ------------------------------------------------------------------- pin, static data, order, pool, family, precedence
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 33 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 33+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of LINE) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && /burmy|wormadam|mothim/i.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has Burmy / Wormadam / Mothim (precedence: nothing to dedupe)', hits);
});
await sec('static', () => {
  start('BURMY0');
  const [b, w, m] = LINE.map((n) => P_CENTERS['j_poke_' + n]);
  ok(b.rarity === 1 && b.cost === 5 && b.stage === 'Basic' && b.ptype === 'Grass' && b.gen === 4 && b.config.extra.mult1 === 5 && b.config.extra.chips1 === 40
    && b.config.extra.trash_money === 1 && b.config.extra.rounds === 4 && b.config.extra.form === 'plant', 'Burmy: Common $5, Basic, Grass, Gen 4, +5 / +40 / $1, 4 rounds, starts Plant', [b.rarity, b.cost, b.stage, b.ptype, b.config.extra]);
  ok(w.rarity === 'poke_safari' && w.cost === 8 && w.stage === 'One' && w.ptype === 'Grass' && w.config.extra.mult1 === 3 && w.config.extra.Xmult_multi === 1.5 && w.config.extra.steel_money === 1 && !('rounds' in w.config.extra),
    'Wormadam: Safari $8, Stage 1, +3 / X1.5 / $1, no evolution', [w.rarity, w.cost, w.stage, w.config.extra]);
  ok(m.rarity === 'poke_safari' && m.cost === 8 && m.stage === 'One' && m.ptype === 'Grass' && m.config.extra.Xmult_mod === 0.25, 'Mothim: Safari $8, Stage 1, Grass (its card), X0.25 per enhancement', [m.rarity, m.cost, m.stage, m.ptype, m.config.extra]);
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_burmy');
  ok(i > 0 && keys[i - 1] === 'j_poke_roserade' && keys[i + 1] === 'j_poke_wormadam' && keys[i + 2] === 'j_poke_mothim', 'Pokédex order: Roserade (407), Burmy, Wormadam, Mothim', keys.slice(i - 1, i + 4));
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
  ok(fam('burmy') === 'burmy,wormadam,mothim' && fam('mothim') === fam('burmy'), 'one family: Burmy, Wormadam, Mothim', fam('burmy'));
  ok(b.atlas === 'poke_AtlasJokersBasicGen04391' && b.pos.x === 0 && b.pos.y === 0 && w.atlas === b.atlas && w.pos.x === 6 && w.pos.y === 0
    && m.atlas === 'poke_AtlasJokersBasicNatdex391' && m.pos.x === 16 && m.pos.y === 27, 'art: upstream 3.9.1\'s cells (Gen 4 {0,0} / {6,0}, Natdex {16,27})', [b.atlas, b.pos, w.pos, m.atlas, m.pos]);
  ok(pool_filter(b, 'Joker') === undefined && b.in_pool(b) !== false, 'Burmy can be rolled in the shop (Common)');
  ok(['mult1', 'chips1', 'Xmult_multi', 'Xmult_mod'].every((f) => f in energy_values) && !['trash_money', 'steel_money', 'rounds'].some((f) => f in energy_values),
    'Energy fields: mult1 / chips1 / Xmult_multi / Xmult_mod (the $ and the timer are not)');
  ok(b.poke_mono_exempt === true && !w.poke_mono_exempt && !m.poke_mono_exempt, 'Burmy is poke_mono_exempt; Wormadam and Mothim are not');
});

// ------------------------------------------------------------------- Cloak: the most common enhancement, ties
await sec('cloak rule', () => {
  const deck = (spec) => Object.entries(spec).flatMap(([k, n]) => Array.from({ length: n }, () => ({ config: { center: { key: k } } })));
  const cases = [
    [{ c_base: 30, m_stone: 22 }, 'sandy', 'plant', 'unenhanced most -> Plant'],
    [{ c_base: 20, m_stone: 22, m_glass: 10 }, 'plant', 'sandy', 'Stone most (22 > 20 > 10) -> Sandy (each enhancement is its own kind: not 30 non-Stone)'],
    [{ c_base: 10, m_steel: 12, m_stone: 11 }, 'plant', 'trash', 'Steel most -> Trash'],
    [{ c_base: 5, m_glass: 30, m_stone: 17 }, 'sandy', 'plant', 'Glass most -> Plant (any other enhancement is Plant)'],
    [{ c_base: 5, m_poke_hazard: 30, m_steel: 17 }, 'trash', 'plant', 'Hazard most -> Plant'],
    [{ m_stone: 20, m_steel: 20, c_base: 12 }, 'plant', 'plant', 'a Stone / Steel tie keeps the cloak (Plant)'],
    [{ m_stone: 20, m_steel: 20, c_base: 12 }, 'trash', 'trash', 'a Stone / Steel tie keeps the cloak (Trash)'],
    [{ m_stone: 20, c_base: 20, m_steel: 12 }, 'trash', 'trash', 'a Stone / unenhanced tie keeps the cloak (Trash: neither tied kind)'],
    [{ m_glass: 20, c_base: 20, m_stone: 12 }, 'sandy', 'plant', 'a Glass / unenhanced tie is Plant either way -> Plant'],
    [{}, 'sandy', 'sandy', 'no cards: keeps the cloak'],
  ];
  for (const [spec, cur, want, why] of cases) ok(cloak_of_deck(deck(spec), cur) === want, why, [cloak_of_deck(deck(spec), cur), spec, cur]);
});
await sec('cloak fired', () => {
  const b = burmy('BCLOAK1');
  ok(ex(b).form === 'plant' && ex(b).ptype === 'Grass', 'a new Burmy wears Plant (Grass)', ex(b));
  endRound({ m_stone: 30 });
  ok(ex(b).form === 'sandy' && ex(b).ptype === 'Earth' && get_type(b) === 'Earth', 'a Stone-heavy deck: Sandy, Earth, at the end of the round', [ex(b).form, ex(b).ptype]);
  advance();
  ok(ex(b).form === 'sandy', 'it stays Sandy through the shop and the next round', ex(b).form);
  endRound((N) => ({ m_steel: Math.floor(N / 2), m_stone: Math.floor(N / 2) }), 'm_glass');
  ok(ex(b).form === 'sandy', 'a Stone / Steel tie at end of round keeps Sandy', ex(b).form);
  advance();
  const r = endRound({ m_steel: 30 });
  ok(ex(b).form === 'trash' && ex(b).ptype === 'Metal', 'a Steel-heavy deck: Trash, Metal', [ex(b).form, ex(b).ptype]);
  ok(r.events.some((e) => e.type === 'status' && e.message === 'Trash Cloak!'), 'a "Trash Cloak!" pop-up when it changes');
  advance();
  endRound({ m_glass: 30 });
  ok(ex(b).form === 'plant' && ex(b).ptype === 'Grass', 'a Glass-heavy deck: Plant again, Grass', [ex(b).form, ex(b).ptype]);
  // Blueprint copying Burmy never changes its own cloak (nor crashes)
  const b2 = burmy('BCLOAK2');
  const bp = add('j_blueprint');
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); G.jokers.cards.unshift(bp);
  endRound({ m_stone: 40 });
  ok(ex(b2).form === 'sandy' && key(bp) === 'j_blueprint', 'with a Blueprint left of it: Burmy turns Sandy once, the Blueprint stays itself');
});

// ------------------------------------------------------------------- type and art per cloak
await sec('type', () => {
  const b = burmy('BTYPE1');
  ok(is_type(b, 'Grass') && energy_matches(b, 'Grass', false) && !energy_matches(b, 'Earth', false), 'Plant: Grass (Grass Energy matches, Earth doesn\'t)');
  endRound({ m_stone: 30 });
  ok(is_type(b, 'Earth') && !is_type(b, 'Grass') && find_pokemon_type('Earth').includes(b) && energy_matches(b, 'Earth', false) && !energy_matches(b, 'Grass', false),
    'Sandy: Earth (is_type / find_pokemon_type / Earth Energy), no longer Grass');
  advance(); endRound({ m_steel: 30 });
  ok(is_type(b, 'Metal') && !is_type(b, 'Earth') && energy_matches(b, 'Metal', false) && energy_matches(b, 'Colorless', true), 'Trash: Metal (Metal Energy; Colorless Energy works)');
  const v = {}; view_card(b, v);
  ok(v.poke && v.poke.ptype === 'Metal' && v.poke.form === 'trash', 'the view: Metal, form trash', v.poke);
  // a Tera sticker owns the type: the cloak changes, the type stays the sticker's
  const t = burmy('BTYPE2');
  apply_type_sticker(t, 'Fire');
  endRound({ m_stone: 30 });
  ok(ex(t).form === 'sandy' && get_type(t) === 'Fire' && ex(t).ptype === 'Fire' && !is_type(t, 'Earth'), 'with a Fire Tera sticker: Sandy cloak, still Fire', [ex(t).form, get_type(t), ex(t).ptype]);
});
await sec('art', () => {
  const b = burmy('BART1');
  const WANT = { plant: null, sandy: 2, trash: 4 };
  for (const [f, x] of Object.entries(WANT)) {
    ex(b).form = f;
    const fc = face(b);
    ok(x === null ? fc === null : (fc && fc.atlas === 'poke_AtlasJokersBasicGen04391' && fc.pos.x === x && fc.pos.y === 0), `Burmy ${f}: drawn as ${x === null ? 'its own card (Gen 4 {0,0})' : 'the Gen 4 card {' + x + ',0}'}`, fc);
  }
  const w = add('j_poke_wormadam');
  for (const [f, x] of Object.entries({ plant: null, sandy: 8, trash: 10 })) {
    ex(w).form = f;
    const fc = face(w);
    ok(x === null ? fc === null : (fc && fc.atlas === 'poke_AtlasJokersBasicGen04391' && fc.pos.x === x && fc.pos.y === 0), `Wormadam ${f}: drawn as ${x === null ? 'its own card (Gen 4 {6,0})' : 'the Gen 4 card {' + x + ',0}'}`, fc);
  }
  const m = add('j_poke_mothim');
  ok(face(m) === null, 'Mothim: its own card (no cloak)');
});

// ------------------------------------------------------------------- each cloak's effect, exact
await sec('plant', () => {
  burmy('BPLANT');
  const t = high();
  ok(t.chips === 7 && near(t.mult, 1 + 5), 'Plant: +5 Mult (High Card 7 x 6)', t);
});
await sec('sandy', () => {
  const b = burmy('BSANDY');
  endRound({ m_stone: 30 }); advance();
  const t = high();
  ok(ex(b).form === 'sandy' && t.chips === 7 + 40 && near(t.mult, 1), 'Sandy: +40 Chips (47 x 1)', t);
});
await sec('trash', () => {
  const b = burmy('BTRASH');
  endRound({ m_steel: 30 });
  const rows = cashRows('j_poke_burmy');
  ok(ex(b).form === 'trash' && rows.length === 1 && rows[0].dollars === 1, 'Trash: $1 in the cash-out (it turned Trash at this round\'s end)', rows);
  const d0 = G.GAME.dollars; const tot = G.GAME.round_eval.total;
  act({ type: 'cash_out' });
  ok(G.GAME.dollars === d0 + tot, '... paid out', [d0, tot, G.GAME.dollars]);
  advance();
  endRound({ m_steel: 30 });
  ok(cashRows('j_poke_burmy').length === 1 && cashRows('j_poke_burmy')[0].dollars === 1, 'and every round it stays Trash');
  // Plant and Sandy earn nothing
  burmy('BTRASH2'); endRound({ m_stone: 30 });
  ok(cashRows('j_poke_burmy').length === 0, 'Sandy: no cash-out row');
  burmy('BTRASH3'); endRound();
  ok(cashRows('j_poke_burmy').length === 0, 'Plant: no cash-out row');
});

// ------------------------------------------------------------------- gender: once, seeded, kept, resumed
await sec('gender', () => {
  const g = (seed) => { start(seed); return ex(add('j_poke_burmy')).gender; };
  const seen = {};
  for (let i = 0; i < 24; i++) { const x = g('BGEN' + i); seen[x] = (seen[x] || 0) + 1; ok(g('BGEN' + i) === x, 'BGEN' + i + ': the same seed rolls the same gender (' + x + ')'); }
  ok(Object.keys(seen).sort().join() === 'female,male', 'both genders occur over 24 seeds', seen);
  // created through create_card (a shop / pack card is made this way) it rolls too
  start('BGENC');
  const c = create_card('Joker', G.jokers, null, null, null, null, 'j_poke_burmy');
  ok(['female', 'male'].includes(ex(c).gender), 'create_card rolls it', ex(c).gender);
  for (const gd of ['female', 'male']) {
    ex(c).gender = gd;
    const cp = copy_card(c);
    ok(ex(cp).gender === gd, `a copy (Invisible Joker / Ankh: copy_card) keeps the ${gd} gender`, ex(cp).gender);
  }
  // once: rounds and cloak changes never re-roll it
  const b = burmy('BGEN0');
  const was = ex(b).gender;
  endRound({ m_stone: 30 }); advance(); endRound({ m_steel: 30 }); advance();
  ok(ex(b).gender === was, 'kept through rounds and cloak changes', [was, ex(b).gender]);
  const sign = was === 'male' ? '♂' : '♀';
  ok(lines(b).includes('Cloak, ' + sign + ')'), 'the tooltip shows it as its sign (' + sign + ')', lines(b));
});
await sec('resume', () => {
  let both = {};
  for (let i = 0; i < 10 && Object.keys(both).length < 2; i++) {
    const s = new Session();
    s.start({ seed: 'BRES' + i, customDeck: { name: 'Bagworm', mods: ['pokermon'], jokers: [{ key: 'j_poke_burmy' }] } });
    s.act({ type: 'select_blind' }); flush();
    const b = G.jokers.cards.find((c) => key(c) === 'j_poke_burmy');
    const want = ex(b).gender;
    s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 1).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush();
    const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
    const b2 = G.jokers.cards.find((c) => key(c) === 'j_poke_burmy');
    ok(!r.stoppedAt && b2 && ex(b2).gender === want && ex(b2).form === 'plant', `resume (BRES${i}): the ${want} Burmy comes back ${want}`, [want, b2 && ex(b2)]);
    both[want] = true;
  }
  ok(both.female && both.male, 'resumed runs of both genders', both);
});

// ------------------------------------------------------------------- evolution at 4 rounds: Female Wormadam (cloak locked), Male Mothim
function evolve(seed, gender, counts) {
  const b = burmy(seed, gender);
  for (let r = 1; r <= 3; r++) { endRound(); ok(key(b) === 'j_poke_burmy' && ex(b).rounds === 4 - r, `${seed}: round ${r}, still Burmy (${4 - r} left)`, [key(b), ex(b).rounds]); advance(); }
  endRound(counts);
  return b;
}
await sec('evolve female', () => {
  const w = evolve('BEVO1', 'female', { m_stone: 30 });
  ok(key(w) === 'j_poke_wormadam' && ex(w).form === 'sandy' && ex(w).ptype === 'Earth', 'a Female Burmy becomes Wormadam after 4 rounds, in the cloak it took at that round\'s end (Sandy, Earth)', [key(w), ex(w)]);
  const fc = face(w);
  ok(fc && fc.pos.x === 8 && fc.pos.y === 0, 'drawn as Sandy Wormadam (Gen 4 {8,0})', fc);
  ok(/Sandy Cloak/.test(lines(w)) && /X1\.5/.test(lines(w)), 'its tooltip: Cloaked, Sandy Cloak, X1.5 per Stone', lines(w));
  advance(); endRound({ m_steel: 40 }); advance(); endRound({ c_base: 40 });
  ok(ex(w).form === 'sandy' && ex(w).ptype === 'Earth', 'locked: Steel- or unenhanced-heavy decks never change it', ex(w));
  const t = evolve('BEVO2', 'female', { m_steel: 30 });
  ok(key(t) === 'j_poke_wormadam' && ex(t).form === 'trash' && ex(t).ptype === 'Metal' && is_type(t, 'Metal') && !is_type(t, 'Grass'), 'Trash Wormadam, Metal', ex(t));
  const p = evolve('BEVO3', 'female');
  ok(key(p) === 'j_poke_wormadam' && ex(p).form === 'plant' && ex(p).ptype === 'Grass' && face(p) === null, 'Plant Wormadam, Grass (its own card)', ex(p));
});
await sec('evolve male', () => {
  const m = evolve('BEVO4', 'male', { m_stone: 30 });
  ok(key(m) === 'j_poke_mothim' && ex(m).ptype === 'Grass' && ex(m).form === undefined, 'a Male Burmy becomes Mothim after 4 rounds (Grass; no cloak), whatever it wore', [key(m), ex(m)]);
});

// ------------------------------------------------------------------- Wormadam's cloaks, exact
function worm(seed, form) { start(seed); const w = add('j_poke_wormadam'); ex(w).form = form; return w; }
await sec('wormadam plant', () => {
  worm('BWP', 'plant');
  clearHand();
  let t = play(hand(['H_K', 'D_K'])).total;
  ok(t.chips === 30 && near(t.mult, 2 + 3 + 3), 'Plant: two scored unenhanced Kings +3 each (2 + 6 = 8 Mult)', t);
  clearHand();
  t = play([...hand(['H_Q']), ...hand(['D_Q'], { center: 'm_bonus' })]).total;
  ok(near(t.mult, 2 + 3), 'Plant: a scored Bonus card gives nothing (2 + 3)', t);
});
await sec('wormadam sandy', () => {
  worm('BWS', 'sandy');
  clearHand();
  let t = play(hand(['H_K', 'D_K'], { center: 'm_stone' })).total;
  ok(near(t.mult, 1 * 1.5 * 1.5), 'Sandy: two scored Stone cards X1.5 each (1 x 2.25)', t);
  clearHand();
  t = play(hand(['H_K', 'D_K'])).total;
  ok(near(t.mult, 2), 'Sandy: unenhanced cards give nothing', t);
});
await sec('wormadam trash', () => {
  worm('BWT', 'trash');
  clearHand();
  hand(['S_3', 'S_4', 'S_5'], { center: 'm_steel' }); hand(['S_6']);
  const c = hand(['S_2']);
  const held = G.hand.cards.filter((x) => x !== c[0] && x.config.center.key === 'm_steel').length;
  const d0 = G.GAME.dollars;
  G.GAME.chips = G.GAME.blind.chips;
  play(c, { keepChips: true }); flush();
  ok(G.STATE === STATES.ROUND_EVAL && held === 3 && G.GAME.dollars - d0 === 3, 'Trash: 3 Steel cards held at end of round earn $3', [held, G.GAME.dollars - d0]);
  // Plant / Sandy Wormadams earn nothing from held Steel
  worm('BWT2', 'sandy');
  clearHand(); hand(['S_3', 'S_4'], { center: 'm_steel' });
  const c2 = hand(['S_2']); const e0 = G.GAME.dollars;
  G.GAME.chips = G.GAME.blind.chips; play(c2, { keepChips: true }); flush();
  ok(G.GAME.dollars === e0, 'Sandy: held Steel earns nothing', G.GAME.dollars - e0);
});

// ------------------------------------------------------------------- Mothim: X per DIFFERENT enhancement in the full deck
await sec('mothim', () => {
  start('BMOTH');
  add('j_poke_mothim');
  let t = high();
  ok(near(t.mult, 1), 'no enhancement in the deck: X1 (nothing)', t);
  const deckWith = (keys, rest = 'c_base') => setDeck(Object.fromEntries(keys.map((k) => [k, 3])), rest);
  const xs = [[['m_glass'], 1.25], [['m_glass', 'm_stone', 'm_lucky'], 1.75], [['m_bonus', 'm_mult', 'm_wild', 'm_glass', 'm_steel', 'm_stone', 'm_gold', 'm_lucky'], 3],
    [['m_bonus', 'm_mult', 'm_wild', 'm_glass', 'm_steel', 'm_stone', 'm_gold', 'm_lucky', 'm_poke_seed', 'm_poke_flower'], 3.5]];
  for (const [keys, x] of xs) {
    clearHand(); const c = hand(['S_2']); deckWith(keys); c[0].set_ability(P_CENTERS.c_base, null, true);
    t = play(c).total; flush();
    ok(near(t.mult, x), `${keys.length} different enhancements: X${x}`, [t, keys]);
  }
  clearHand(); let c = hand(['S_2']); setDeck({ m_glass: 40 }); c[0].set_ability(P_CENTERS.c_base, null, true);
  t = play(c).total; flush();
  ok(near(t.mult, 1.25), '40 Glass cards are ONE enhancement: X1.25', t);
  clearHand(); c = hand(['S_2']); setDeck({ m_poke_hazard: 10, m_glass: 2 }); c[0].set_ability(P_CENTERS.c_base, null, true);
  t = play(c).total; flush();
  ok(near(t.mult, 1.25), 'Hazard cards don\'t count (Hazard + Glass: X1.25)', t);
  ok(/Currently \{C:attention\}1\{C:inactive\}: \{X:mult,C:white\} X1\.25/.test(lines(G.jokers.cards[0])), 'the tooltip: (Currently 1: X1.25 Mult)', lines(G.jokers.cards[0]));
});

// ------------------------------------------------------------------- Energy: standard shares, $ fixed, carried through evolution
await sec('energy', () => {
  const b = burmy('BEN1');
  increment_energy(b, 'Grass');
  ok(ex(b).energy_count === 1 && near(ex(b).mult1, 7) && near(ex(b).chips1, 52) && ex(b).trash_money === 1, 'Burmy + 1 Grass Energy: +7 Mult / +52 Chips, $1 fixed', ex(b));
  increment_energy(b, 'Grass'); increment_energy(b, 'Grass');
  ok(near(ex(b).mult1, 11) && near(ex(b).chips1, 76), '3 Energy: +11 / +76', ex(b));
  let t = high();
  ok(near(t.mult, 1 + 11), 'energized Plant: +11 Mult', t);
  const s = burmy('BEN2');
  endRound({ m_stone: 30 }); advance();
  increment_energy(s, 'Grass');
  ok(!(ex(s).energy_count > 0), 'a Sandy (Earth) Burmy: Grass Energy does nothing', ex(s));
  increment_energy(s, 'Earth');
  t = high();
  ok(ex(s).energy_count === 1 && t.chips === 7 + 52, 'Earth Energy on Sandy: +52 Chips (59)', t);
  // carried through evolution
  const w = evolve('BEN3', 'female', { m_stone: 30 });
  void w;
  const e = burmy('BEN4', 'female');
  increment_energy(e, 'Grass');
  for (let r = 1; r <= 3; r++) { endRound(); advance(); }
  endRound({ m_stone: 30 });
  ok(key(e) === 'j_poke_wormadam' && ex(e).energy_count === 1 && near(ex(e).mult1, 4.2) && near(ex(e).Xmult_multi, 1.575) && ex(e).steel_money === 1,
    'a 1-Energy Burmy becomes a 1-Energy Wormadam: +4.2 / X1.575, $1 fixed', ex(e));
  increment_energy(e, 'Earth'); increment_energy(e, 'Earth');
  ok(ex(e).energy_count === 3 && near(ex(e).mult1, 6.6) && near(ex(e).Xmult_multi, 1.725), 'Sandy Wormadam + 2 Earth Energy (3): +6.6 / X1.725', ex(e));
  advance(); clearHand();
  t = play(hand(['H_K'], { center: 'm_stone' })).total;
  ok(near(t.mult, 1.725), 'energized Sandy Wormadam: a Stone card X1.725', t);
  const m = burmy('BEN5', 'male');
  increment_energy(m, 'Grass');
  for (let r = 1; r <= 4; r++) { endRound(); if (r < 4) advance(); }
  ok(key(m) === 'j_poke_mothim' && ex(m).energy_count === 1 && near(ex(m).Xmult_mod, 0.3), 'a 1-Energy Burmy becomes Mothim X0.3 per enhancement', ex(m));
  increment_energy(m, 'Grass'); increment_energy(m, 'Grass');
  ok(near(ex(m).Xmult_mod, 0.4), '3 Energy: X0.4 per enhancement', ex(m));
  advance(); clearHand(); const c = hand(['S_2']); setDeck({ m_glass: 2, m_stone: 2 }); c[0].set_ability(P_CENTERS.c_base, null, true);
  t = play(c).total;
  ok(near(t.mult, 1.8), 'energized Mothim, 2 enhancements: X1.8', t);
});

// ------------------------------------------------------------------- Monotype: Burmy never breaks it; Wormadam does like any joker
await sec('monotype', () => {
  const RB = () => G.GAME.run_badges;
  const fresh = (seed) => { newRun({ seed, seeded: false, back: 'b_red', mods: ['pokermon'] }); G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall'; };
  fresh('BMONO1');
  add('j_poke_charmander');
  const b = add('j_poke_burmy');
  ex(b).gender = 'female';
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(RB().mono && RB().type === 'Fire', 'Charmander + Burmy (Grass) lock Fire at the first round (Burmy left out)', RB());
  endRound({ m_stone: 30 });
  ok(ex(b).form === 'sandy', 'Burmy turns Sandy (Earth) in the Fire run');
  act({ type: 'cash_out' });
  ok(G.STATE === STATES.SHOP && toView().run_badges.mono_at_risk === false, 'the shop: no Monotype warning for Burmy', toView().run_badges);
  advance();
  ok(RB().mono && RB().type === 'Fire', 'the next round: Monotype intact', RB());
  endRound({ m_steel: 30 }); advance();
  ok(RB().mono && ex(b).form === 'trash', 'Trash (Metal) too: still Monotype', [RB(), ex(b).form]);
  endRound(); advance();
  endRound({ m_stone: 30 });
  ok(key(b) === 'j_poke_wormadam' && ex(b).ptype === 'Earth', 'it evolves into Sandy Wormadam (Earth) at the 4th round\'s end', [key(b), ex(b)]);
  advance();
  ok(!RB().mono && /Wormadam/.test(RB().mono_reason), 'Wormadam is checked like any joker: an Earth Wormadam (gained as a Grass Burmy) breaks the Fire run', RB().mono_reason);
  fresh('BMONO2');
  add('j_poke_burmy');
  act({ type: 'select_blind' }); flush();
  ok(RB().mono && RB().type === null, 'Burmy alone: Monotype intact, no type locked', RB());
  ok(RB().nuz, 'Nuzlocke: Burmy is a typed gain like any Pokémon', RB());
});

// ------------------------------------------------------------------- the art: real cells, the type each one shows
if (ART) {
  await sec('art cells', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const read = (atlas, x, y) => { const r = typer.typeOfEntry({ atlas, pos: [x, y] }); return r && r.ptype; };
    const got = [];
    for (const [k, own] of [['j_poke_burmy', { x: 0, y: 0 }], ['j_poke_wormadam', { x: 6, y: 0 }]]) {
      got.push([k, 'plant', CLOAKS.plant && CLOAKS.plant.ptype, read('AtlasJokersBasicGen04', own.x, own.y)]);
      for (const f of ['sandy', 'trash']) got.push([k, f, CLOAKS[f] && CLOAKS[f].ptype, SPRITES[k] && read('AtlasJokersBasicGen04', SPRITES[k][f].x, SPRITES[k][f].y)]);
    }
    ok(got.length === 6 && got.every(([, , want, card]) => want && want === card), 'each cloak\'s type is its card\'s: Plant Grass, Sandy Earth, Trash Metal (Burmy and Wormadam)', got);
    ok(read('AtlasJokersBasicNatdex', 16, 27) === P_CENTERS.j_poke_mothim.ptype, 'Mothim\'s ptype is its card\'s (Grass)', read('AtlasJokersBasicNatdex', 16, 27));
    const want = {};
    for (const sh of ['', 'Shiny']) for (const x of [0, 2, 4, 6, 8, 10]) want['g' + sh + x] = [x * 142, 0, 142, 190];
    const px = { ...(await crops(path.join(ART, 'Basic Series/AtlasJokersBasicGen04-391.png'), Object.fromEntries(Object.entries(want).filter(([k]) => !k.startsWith('gShiny'))))),
      ...(await crops(path.join(ART, 'Basic Series/AtlasJokersBasicGen04Shiny-391.png'), Object.fromEntries(Object.entries(want).filter(([k]) => k.startsWith('gShiny'))))) };
    const opaque = (r) => { let k = 0; for (let i = 3; i < r.px.length; i += 4) if (r.px[i] > 0) k++; return k / (r.px.length / 4); };
    const hash = (r) => { let h = 0; for (let i = 0; i < r.px.length; i += 97) h = (h * 31 + r.px[i]) >>> 0; return h; };
    const base = [0, 2, 4, 6, 8, 10].map((x) => px['g' + x]);
    ok(base.every((r) => r && r.inside && opaque(r) > 0.5) && new Set(base.map(hash)).size === 6, 'the six cloak cards are real, distinct 3.9.1 pictures', base.map((r) => r && opaque(r)));
    ok([0, 2, 4, 6, 8, 10].every((x) => { const a = px['g' + x], s = px['gShiny' + x]; let d = 0; for (let i = 0; i < a.px.length; i++) d += Math.abs(a.px[i] - s.px[i]); return s.inside && opaque(s) > 0.5 && d > 0; }),
      'each has its Shiny twin on the Gen 4 Shiny sheet');
  });
} else console.log('(Pokermon art not on disk: the sprite checks are skipped; set MICATRO_MAIN)');

// ------------------------------------------------------------------- text
await sec('text', () => {
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  ok(['j_poke_burmy', 'j_poke_wormadam', 'j_poke_wormadam_sandy', 'j_poke_wormadam_trash', 'j_poke_mothim'].every((k) => J[k]), 'the texts: Burmy, Wormadam per cloak, Mothim');
  const b = burmy('BTXT', 'male');
  const d = lines(b);
  ok(/Cloak:/.test(d) && /\+5/.test(d) && /\+40/.test(d) && /\$1/.test(d) && /Plant\{C:inactive\} Cloak, ♂\)/.test(d) && /Monotype/.test(d) && /♀ into Wormadam, ♂ into Mothim/.test(d) && /\{C:attention,s:0\.8\}4\{/.test(d),
    'Burmy\'s tooltip: Cloak, +5 / +40 / $1, (Currently Plant Cloak, ♂), the Monotype rule, 4 rounds and the branches (♀ into Wormadam, ♂ into Mothim)', d);
  // the gender signs, not the words (m6x11plus draws ♀ / ♂ since tools/micatro/add_gender_glyphs.py; the owner: "get the symbols")
  const f = lines(burmy('BTXT2', 'female'));
  ok(/Plant\{C:inactive\} Cloak, ♀\)/.test(f), 'a female Burmy: (Currently Plant Cloak, ♀)', f);
  ok(!/Female|Male/.test(d + f), 'no "Female" / "Male" in either Burmy\'s tooltip', [d, f]);
  const w = add('j_poke_wormadam');
  ok(/Plant Cloak/.test(lines(w)) && /unenhanced/.test(lines(w)) && /\+3/.test(lines(w)), 'Plant Wormadam', lines(w));
  ex(w).form = 'trash';
  ok(/Trash Cloak/.test(lines(w)) && /Steel/.test(lines(w)) && /\$1/.test(lines(w)), 'Trash Wormadam', lines(w));
  const m = add('j_poke_mothim');
  ok(/Free Flight/.test(lines(m)) && /X0\.25/.test(lines(m)) && /Seed, Flower/.test(lines(m)), 'Mothim: Free Flight, X0.25, the list', lines(m));
});

done();
