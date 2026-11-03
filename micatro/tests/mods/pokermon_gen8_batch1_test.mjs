// Gen 8, batch 1 (the owner's "yes — build and merge when the gate passes", 2026-11-02; jokers/pokejokers_designs.js "Gen 8, batch 1";
// PORTING.md "Gen 8, batch 1"): 20 jokers, #821-847, on the guide's price slots (3-stage U $6 / S $8 / S $10, 2-stage C $5 / S $8,
// single-stage R $7), in Pokédex order among the Gen 8 jokers Pokermon already has:
//   Rookidee 821 -> Corvisquire -> Corviknight (Colorless -> Metal)  Flying Taxi: $1 / $2 / $2 at end of round; Corviknight X1.5 and +1
//                                                                    shop card slot.
//   Blipbug 824 (Grass) -> Dottler -> Orbeetle (Psychic)            +1 / +2 / +3 Foresight; each Foreseen card +4 Mult / X1.15.
//   Gossifleur 829 -> Eldegoss (Grass)                              Cotton Down: scored Seeds +4 Mult; Eldegoss plants a Seed each Blind,
//                                                                    +1 growth level (stacks with Cherubi).
//   Wooloo 831 -> Dubwool (Colorless)                               +50 / +100 Chips; Cotton Guard: +1 hand during Boss Blinds.
//   Chewtle 833 -> Drednaw (Water)                                  +3 Mult / X1 + X0.3 for each Water Joker, itself included.
//   Rolycoly 837 (Earth) -> Carkol -> Coalossal (Fire)              a deck card becomes Stone each Blind; Stone +6 Mult / X1.3; +1 discard.
//   Silicobra 843 -> Sandaconda (Earth)                             Sand Spit: discarded cards 1 in 4 Stone; the house SANDSTORM; Stone +20
//                                                                    Chips and X1.2.
//   Cramorant 845 (Water, R $7)                                     Gulp Missile: the first discard loads X2.5 for the next scored hand.
//   Arrokuda 846 -> Barraskewda (Water)                             Propeller Tail: the first scored card +10 Mult / X2.
// Every ability is FIRED through real hands / rounds with exact numbers.
//   node micatro/tests/mods/pokermon_gen8_batch1_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import * as RUN from '../../js/engine/run.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { is_type, get_type } from '../../mods/pokermon/systems/types.js';
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
const LINES = {
  rookidee: ['rookidee', 'corvisquire', 'corviknight'], blipbug: ['blipbug', 'dottler', 'orbeetle'], gossifleur: ['gossifleur', 'eldegoss'],
  wooloo: ['wooloo', 'dubwool'], chewtle: ['chewtle', 'drednaw'], rolycoly: ['rolycoly', 'carkol', 'coalossal'], silicobra: ['silicobra', 'sandaconda'],
  cramorant: ['cramorant'], arrokuda: ['arrokuda', 'barraskewda'],
};
const NAMES = Object.values(LINES).flat();
const enh = (k) => G.playing_cards.filter((c) => key(c) === k).length;
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
function mk(spec, area) {
  const s = typeof spec === 'string' ? { k: spec } : spec;
  return create_playing_card({ front: P_CARDS[s.k], center: P_CENTERS[s.center || 'c_base'] }, area);
}
/** Put cards in hand: a list of keys, or [key, center] pairs (the first is the leftmost). */
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list`; the round never ends by accident unless `last` (the round's final hand). */
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
/** Discard `list` from the hand (a player's discard). */
function discard(list) {
  clearHand();
  const cs = cards(list);
  if (G.GAME.current_round.discards_left < 1) G.GAME.current_round.discards_left = 1;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'discard' });
  flush();
  return { cards: cs, r };
}
/** Play cards that already exist (back into the hand from wherever they are). */
function replay(cs) {
  clearHand();
  for (const c of cs) { if (c.area) c.area.remove_card(c); G.hand.emplace(c); }
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const total = ((r && r.events) || []).find((e) => e.type === 'hand_total') || {};
  return { total, mult: Number(total.mult), chips: Number(total.chips) };
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
/** Win the round and stop at the cash-out: -> the cash-out rows. */
function toEval() { endRound(); return (G.GAME.round_eval && G.GAME.round_eval.rows) || []; }
const rowsOf = (rows, n) => rows.filter((r) => r.center === 'j_poke_' + n);
/** Make the deck exactly these cards so the next Blind's first deal is them (Castform's test). */
function stackDeck(specs) {
  for (const c of G.deck.cards.slice()) { G.deck.remove_card(c); G.discard.emplace(c); }
  return specs.map((s) => mk(s, G.deck));
}
/** A fresh run with these jokers and the first Blind selected (the setting_blind context sees them). */
function fresh(seed, jokers) {
  start(seed, {}, { noBlind: true });
  const js = jokers.map((k) => add(k.startsWith('j_') ? k : 'j_poke_' + k));
  act({ type: 'select_blind' }); flush();
  clearHand();
  return js;
}
const face = (j, shiny) => {
  const v = {}; view_card(j, v);
  return POKE_UI.face({ center: key(j), facing: 'front', poke: v.poke, atlas: j.config.center.atlas, pos: j.config.center.pos, ...(shiny ? { edition: 'poke_shiny' } : {}) }, { area: 'jokers' });
};
const drawn = (j) => { const f = face(j); return f ? [f.atlas, f.pos] : [j.config.center.atlas, j.config.center.pos]; };
const GEN8 = 'poke_AtlasJokersBasicGen08391';
const scry = () => (G.scry_view ? G.scry_view.cards : []);

// ------------------------------------------------------------------- pin, static data, order, families, Energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 70 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 70+ (Gen 8 batch 1)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of NAMES) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs');
  }
  const hits = [];
  const re = new RegExp('\\b(' + NAMES.join('|') + ')\\b', 'i');
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the 20 (nothing to dedupe)', hits);
});
await sec('static', () => {
  start('G8B1S');
  const S = 'poke_safari';
  const N = 'poke_AtlasJokersBasicNatdex391';
  // [rarity, cost, stage, type, rounds|undefined, atlas, x, y]
  const WANT = {
    rookidee: [2, 6, 'Basic', 'Colorless', 4, N, 20, 54], corvisquire: [S, 8, 'One', 'Colorless', 5, N, 22, 54], corviknight: [S, 10, 'Two', 'Metal', undefined, N, 24, 54],
    blipbug: [2, 6, 'Basic', 'Grass', 4, N, 26, 54], dottler: [S, 8, 'One', 'Psychic', 5, N, 28, 54], orbeetle: [S, 10, 'Two', 'Psychic', undefined, N, 0, 55],
    gossifleur: [1, 5, 'Basic', 'Grass', 5, N, 6, 55], eldegoss: [S, 8, 'One', 'Grass', undefined, N, 8, 55],
    wooloo: [1, 5, 'Basic', 'Colorless', 5, N, 10, 55], dubwool: [S, 8, 'One', 'Colorless', undefined, N, 12, 55],
    chewtle: [1, 5, 'Basic', 'Water', 5, N, 14, 55], drednaw: [S, 8, 'One', 'Water', undefined, N, 16, 55],
    rolycoly: [2, 6, 'Basic', 'Earth', 4, N, 22, 55], carkol: [S, 8, 'One', 'Fire', 5, N, 24, 55], coalossal: [S, 10, 'Two', 'Fire', undefined, N, 26, 55],
    silicobra: [1, 5, 'Basic', 'Earth', 5, N, 4, 56], sandaconda: [S, 8, 'One', 'Earth', undefined, N, 6, 56],
    cramorant: [3, 7, 'Basic', 'Water', undefined, GEN8, 0, 0],
    arrokuda: [1, 5, 'Basic', 'Water', 5, N, 10, 56], barraskewda: [S, 8, 'One', 'Water', undefined, N, 12, 56],
  };
  ok(Object.keys(WANT).length === 20 && NAMES.length === 20, '20 jokers');
  for (const [n, [rarity, cost, stage, type, rnds, atlas, x, y]] of Object.entries(WANT)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === type && c.config.extra.ptype === type && c.gen === 8,
      `${n}: ${rarity} $${cost}, ${stage}, ${type}, Gen 8`, [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.config.extra.rounds === rnds, `${n}: ${rnds ? 'evolves after ' + rnds + ' rounds' : 'no round timer'}`, c.config.extra.rounds);
    ok(c.atlas === atlas && c.pos.x === x && c.pos.y === y && !c.soul_pos, `${n}: upstream 3.9.1 cell ${atlas} {${x},${y}} (nothing to deploy)`, [c.atlas, c.pos]);
  }
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const run = (from, list, to) => { const i = keys.indexOf('j_poke_' + list[0]); return i > 0 && [from, ...list, to].every((k, n) => keys[i - 1 + n] === 'j_poke_' + k) ? true : keys.slice(i - 1, i + list.length + 1); };
  const RUNS = [
    ['inteleon', ['rookidee', 'corvisquire', 'corviknight', 'blipbug', 'dottler', 'orbeetle'], 'nickit'],
    ['thievul', ['gossifleur', 'eldegoss', 'wooloo', 'dubwool', 'chewtle', 'drednaw'], 'yamper'],
    ['boltund', ['rolycoly', 'carkol', 'coalossal', 'silicobra', 'sandaconda', 'cramorant', 'arrokuda', 'barraskewda'], 'toxel'],
  ];
  for (const [from, list, to] of RUNS) ok(run(from, list, to) === true, `Pokédex order: ${from}, ${list.join(', ')}, ${to}`, run(from, list, to));
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
  for (const line of Object.values(LINES)) if (line.length > 1) ok(fam(line[0]) === line.join(), 'one family: ' + line.join(' -> '), fam(line[0]));
  ok(NAMES.every((n) => !C(n).poke_no_energy_field), 'every one of the 20 takes Energy (a main number, or its evolution\'s carried)');
  ok(['taxi_money', 'card_slots', 'scry', 'growth', 'hands', 'd_size', 'num', 'dem', 'rounds'].every((f) => !(f in energy_values))
    && ['mult', 'chips', 'Xmult', 'Xmult_mod', 'Xmult_multi'].every((f) => f in energy_values),
    'Energy fields: the main numbers; fixed: the $, the shop slot, Foresight, growth, the hand / discard, the odds');
});

// ------------------------------------------------------------------- Rookidee / Corvisquire / Corviknight: Flying Taxi, the shop slot
await sec('flying taxi', () => {
  start('TAXI');
  const r = add('j_poke_rookidee');
  let t = play(['S_A']);
  ok(near(t.mult, 1), 'Rookidee: nothing in scoring', t.total);
  let rows = toEval();
  ok(rowsOf(rows, 'rookidee').length === 1 && rowsOf(rows, 'rookidee')[0].dollars === 1, 'the cash-out: a $1 Rookidee row', rowsOf(rows, 'rookidee'));
  const d0 = G.GAME.dollars;
  act({ type: 'cash_out' }); flush();
  ok(G.GAME.dollars > d0, 'cashed out', [d0, G.GAME.dollars]);
  act({ type: 'next_round' }); G.GAME.round_resets.blind_choices.Boss = 'bl_wall'; act({ type: 'select_blind' }); flush(); clearHand();
  ok(/Flying Taxi: earn \$1 at end of round/.test(plain(r)) && /Energy carries to Corviknight/.test(plain(r)), 'its text', plain(r));
  rounds(3);
  ok(key(r) === 'j_poke_corvisquire', 'Rookidee -> Corvisquire after 4 rounds', key(r));
  rows = toEval();
  ok(rowsOf(rows, 'corvisquire')[0] && rowsOf(rows, 'corvisquire')[0].dollars === 2, 'Corvisquire: $2', rowsOf(rows, 'corvisquire'));
  advance();
  const base = G.GAME.shop.joker_max;
  ok(base === 2, 'the Red Deck shop: 2 card slots', base);
  rounds(3);
  ok(key(r) === 'j_poke_corvisquire', '4 rounds as Corvisquire: still Corvisquire', key(r));
  rounds(1);
  ok(key(r) === 'j_poke_corviknight' && get_type(r) === 'Metal', 'Corvisquire -> Corviknight (Metal) after 5 rounds', [key(r), get_type(r)]);
  ok(G.GAME.shop.joker_max === 3, 'Corviknight: +1 shop card slot (3)', G.GAME.shop.joker_max);
  t = play(['S_A']);
  ok(near(t.mult, 1.5), 'Corviknight: X1.5 Mult', t.total);
  rows = toEval();
  ok(rowsOf(rows, 'corviknight')[0] && rowsOf(rows, 'corviknight')[0].dollars === 2, 'Corviknight: $2', rowsOf(rows, 'corviknight'));
  act({ type: 'cash_out' }); flush();
  ok(G.STATE === STATES.SHOP && G.shop_jokers.cards.length === 3 && G.shop_jokers.config.card_limit === 3, 'the shop shows 3 cards', G.shop_jokers.cards.length);
  ok(/\+1 card slot available in shop/.test(plain(r)), 'its text', plain(r));
  // sold in the shop: the slot goes, never below the base
  r.remove(); flush();
  ok(G.GAME.shop.joker_max === 2 && G.shop_jokers.cards.length === 2, 'sold: back to 2 slots (the extra shop card goes)', [G.GAME.shop.joker_max, G.shop_jokers.cards.length]);
  // two Corviknights: +2; debuffed: lends none; the floor: never below 1
  start('TAXI2');
  const a = add('j_poke_corviknight'), b = add('j_poke_corviknight');
  ok(G.GAME.shop.joker_max === 4, 'two Corviknights: 4 slots', G.GAME.shop.joker_max);
  debuff(a);
  ok(G.GAME.shop.joker_max === 3, 'one debuffed: 3', G.GAME.shop.joker_max);
  undebuff(a);
  G.GAME.shop.joker_max = 1; // (something else took the shop down to 1)
  b.remove(); flush();
  ok(G.GAME.shop.joker_max === 1, 'never below 1 shop slot', G.GAME.shop.joker_max);
  // Blueprint copies the X, never the $
  start('TAXI3');
  add('j_poke_corviknight'); add('j_blueprint'); G.jokers.cards.reverse();
  t = play(['S_A']);
  ok(near(t.mult, 1.5 * 1.5), 'Blueprint copies the X1.5', t.total);
  rows = toEval();
  ok(rows.filter((x) => x.dollars && (x.center === 'j_blueprint')).length === 0 && rowsOf(rows, 'corviknight').length === 1, 'Blueprint copies no $', rows.map((x) => [x.center, x.dollars]));
});

// ------------------------------------------------------------------- Blipbug / Dottler / Orbeetle: Foresight
await sec('foresight', () => {
  const [b] = fresh('BLIP', ['blipbug']);
  ok(G.GAME.scry_amount === 1 && scry().length === 1, 'Blipbug: +1 Foresight', G.GAME.scry_amount);
  let t = play(['S_A']);
  ok(near(t.mult, 1), 'Blipbug: the Foreseen card gives nothing', t.total);
  rounds(4);
  ok(key(b) === 'j_poke_dottler' && G.GAME.scry_amount === 2 && scry().length === 2, 'Blipbug -> Dottler after 4 rounds: +2 Foresight', [key(b), G.GAME.scry_amount]);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 4 + 4), 'Dottler: each of the 2 Foreseen cards +4 Mult', t.total);
  debuff(scry()[0]);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 4), 'a debuffed Foreseen card gives nothing', t.total);
  undebuff(scry()[0]);
  ok(/Each Foreseen card gives \+4 Mult/.test(plain(b)), 'its text', plain(b));
  rounds(5);
  ok(key(b) === 'j_poke_orbeetle' && G.GAME.scry_amount === 3 && scry().length === 3, 'Dottler -> Orbeetle after 5 rounds: +3 Foresight', [key(b), G.GAME.scry_amount]);
  t = play(['S_A']);
  ok(near(t.mult, Math.pow(1.15, 3)), 'Orbeetle: each of the 3 Foreseen cards X1.15', t.total);
  b.remove(); flush();
  ok((G.GAME.scry_amount || 0) === 0, 'gone: the Foresight is taken back', G.GAME.scry_amount);
  // Blueprint copies Dottler's +4
  fresh('BLIP2', ['j_blueprint', 'dottler']);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 4 * 4), 'Blueprint copies it: +4 twice on each Foreseen card (Foresight not doubled: 2 cards)', [t.total, scry().length]);
});

// ------------------------------------------------------------------- Gossifleur / Eldegoss: Cotton Down, Seeds
await sec('cotton down', () => {
  start('GOSS');
  const g = add('j_poke_gossifleur');
  let t = play([['S_K', 'm_poke_seed'], ['H_K', 'm_poke_seed'], 'D_3']);
  ok(near(t.mult, 2 + 4 + 4), 'Gossifleur: each scored Seed +4 Mult', t.total);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2), 'no Seed: nothing', t.total);
  // a Seed that blooms while it scores still counts (it was a Seed when played)
  const [s] = cards([['S_9', 'm_poke_seed']]);
  s.ability.extra.level = 4;
  const r = replay([s]);
  ok(key(s) === 'm_poke_flower' && near(r.mult, 1 + 4), 'a Seed blooming on this score still gives +4', [key(s), r.total]);
  ok(G.GAME.poke_growth_level === undefined || G.GAME.poke_growth_level === 0, 'Gossifleur: no growth level', G.GAME.poke_growth_level);
  rounds(5);
  ok(key(g) === 'j_poke_eldegoss', 'Gossifleur -> Eldegoss after 5 rounds', key(g));
  ok(G.GAME.poke_growth_level === 1, 'Eldegoss: +1 growth level', G.GAME.poke_growth_level);
  ok(/Seeds now bloom in 3 scores/.test(plain(g)), 'its text: Seeds bloom in 3 scores', plain(g));
  t = play([['S_K', 'm_poke_seed']]);
  ok(near(t.mult, 1 + 4), 'Eldegoss keeps Cotton Down', t.total);
  // a Seed every Blind
  const s0 = enh('m_poke_seed');
  endRound(); advance();
  ok(enh('m_poke_seed') === s0 + 1, 'a Blind selected: 1 unenhanced card became a Seed', enh('m_poke_seed') - s0);
  // stacks with Cherubi: growth 2, a bloom in 2 scores
  const ch = add('j_poke_cherubi');
  ok(G.GAME.poke_growth_level === 2 && /Seeds now bloom in 2 scores/.test(plain(g)), 'with Cherubi: growth level 2 (stacks), a bloom in 2 scores', [G.GAME.poke_growth_level, plain(g)]);
  const [s2] = cards([['S_8', 'm_poke_seed']]);
  replay([s2]);
  ok(key(s2) === 'm_poke_seed' && s2.ability.extra.level === 3, 'a Seed grows 3 a score', s2.ability.extra.level);
  replay([s2]);
  ok(key(s2) === 'm_poke_flower', '... and blooms on its 2nd', key(s2));
  ch.remove(); flush();
  debuff(g);
  ok((G.GAME.poke_growth_level || 0) === 0, 'Eldegoss debuffed: no growth', G.GAME.poke_growth_level);
  undebuff(g);
  // Blueprint copies the planting (a second Seed) and the +4
  start('GOSS2', {}, { noBlind: true });
  add('j_poke_eldegoss'); add('j_blueprint'); G.jokers.cards.reverse();
  const q0 = enh('m_poke_seed');
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(enh('m_poke_seed') === q0 + 2, 'with Blueprint: two Seeds per Blind', enh('m_poke_seed') - q0);
  ok(G.GAME.poke_growth_level === 1, 'Blueprint copies no growth', G.GAME.poke_growth_level);
  t = play([['S_K', 'm_poke_seed']]);
  ok(near(t.mult, 1 + 8), 'Blueprint copies the +4', t.total);
  // none unenhanced: nothing overwritten
  start('GOSS3', {}, { noBlind: true });
  add('j_poke_eldegoss');
  for (const c of G.playing_cards) c.set_ability(P_CENTERS.m_bonus, null, true);
  act({ type: 'select_blind' }); flush();
  ok(enh('m_poke_seed') === 0 && enh('m_bonus') === G.playing_cards.length, 'no unenhanced card: nothing (no Bonus card overwritten)', enh('m_poke_seed'));
});

// ------------------------------------------------------------------- Wooloo / Dubwool: Cotton Guard on Boss Blinds
await sec('cotton guard', () => {
  start('WOOL');
  const w = add('j_poke_wooloo');
  let t = play(['S_A']);
  ok(t.chips === 16 + 50, 'Wooloo: +50 Chips', t.total);
  rounds(5);
  ok(key(w) === 'j_poke_dubwool', 'Wooloo -> Dubwool after 5 rounds', key(w));
  // round 6 is ante 2's Boss Blind: Dubwool (evolved at the end of round 5) gives its hand as the Boss is selected
  ok(G.GAME.round === 6 && G.GAME.blind.boss && G.GAME.current_round.hands_left === 5 && /Active!/.test(plain(w)), 'a Boss Blind selected: 5 hands (+1)', [G.GAME.round, G.GAME.blind.boss, G.GAME.current_round.hands_left, plain(w)]);
  t = play(['S_A']);
  ok(t.chips === 16 + 100, 'Dubwool: +100 Chips', t.total);
  // the cash-out never pays the extra hand: won on the 2nd hand, 3 left -> 2 after it is taken back
  const hl = () => G.GAME.current_round.hands_left;
  clearHand(); const c = hand(['S_2']); G.GAME.chips = G.GAME.blind.chips;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush();
  const rows = (G.GAME.round_eval && G.GAME.round_eval.rows) || [];
  const handsRow = rows.find((r) => r.name === 'hands');
  ok(hl() === 2, 'won on the 2nd hand: the extra hand is taken back at the end of the round (2 left, not 3)', hl());
  ok(handsRow && handsRow.disp === 2 && handsRow.dollars === 2, 'the cash-out pays $1 for 2 hands, not 3', handsRow);
  advance();
  ok(!G.GAME.blind.boss && G.GAME.current_round.hands_left === 4 && /Boss Blinds only/.test(plain(w)), 'the next Small Blind: 4 hands (no extra)', [G.GAME.current_round.hands_left, plain(w)]);
  endRound(); advance();
  ok(!G.GAME.blind.boss && G.GAME.current_round.hands_left === 4, 'the Big Blind: 4 hands', G.GAME.current_round.hands_left);
  // sold mid-Boss: the extra hand goes too
  start('WOOL2', {}, { noBlind: true });
  const d = add('j_poke_dubwool');
  setBoss();
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(G.GAME.blind.boss && G.GAME.current_round.hands_left === 5, 'Boss: 5 hands', G.GAME.current_round.hands_left);
  d.remove(); flush();
  ok(G.GAME.current_round.hands_left === 4, 'sold mid-Boss: back to 4', G.GAME.current_round.hands_left);
  // Blueprint copies the Chips, not the hand
  start('WOOL3', {}, { noBlind: true });
  add('j_poke_dubwool'); add('j_blueprint'); G.jokers.cards.reverse();
  setBoss();
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(G.GAME.blind.boss && G.GAME.current_round.hands_left === 5, 'with Blueprint: still +1 hand (not 2)', G.GAME.current_round.hands_left);
  t = play(['S_A']);
  ok(t.chips === 16 + 200, 'Blueprint copies the +100 Chips', t.total);
});
/** Make the Blind on deck the Boss (The Wall). */
function setBoss() {
  const rr = G.GAME.round_resets;
  rr.blind_states.Small = 'Defeated'; rr.blind_states.Big = 'Defeated'; rr.blind_states.Boss = 'Select';
  rr.blind_choices.Boss = 'bl_wall';
  G.GAME.blind_on_deck = 'Boss';
}

// ------------------------------------------------------------------- Chewtle / Drednaw: the Water team
await sec('water team', () => {
  start('CHEW');
  const c = add('j_poke_chewtle');
  let t = play(['S_A']);
  ok(near(t.mult, 1 + 3), 'Chewtle alone: +3 (itself)', t.total);
  const s = add('j_poke_squirtle'); add('j_joker'); add('j_poke_arrokuda');
  t = play(['S_A']);
  ok(near(t.mult, 1 + 9 + 10 + 4) && /Currently 3: \+9 Mult/.test(plain(c)), 'with Squirtle and Arrokuda (Water; the Joker isn\'t): +9 (then Arrokuda +10, the Joker +4)', [t.total, plain(c)]);
  debuff(s);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 6 + 10 + 4), 'a debuffed Water Joker doesn\'t count', t.total);
  undebuff(s);
  rounds(5);
  ok(key(c) === 'j_poke_drednaw' || key(c) === 'j_poke_drednaw', 'Chewtle -> Drednaw after 5 rounds', key(c));
  for (const j of G.jokers.cards.slice()) if (j !== c) j.remove();
  flush();
  t = play(['S_A']);
  ok(near(t.mult, 1.3), 'Drednaw alone: X1.3 (itself)', t.total);
  add('j_poke_squirtle'); add('j_poke_cramorant');
  t = play(['S_A']);
  ok(near(t.mult, 1.9) && /Currently 3: X1.9/.test(plain(c)), 'with 2 more Water Jokers: X1.9', [t.total, plain(c)]);
});

// ------------------------------------------------------------------- Rolycoly / Carkol / Coalossal: Coal, Stone, Steam Engine
await sec('coal', () => {
  start('ROLY', {}, { noBlind: true });
  const r = add('j_poke_rolycoly');
  let s0 = enh('m_stone'), p0 = enh('c_base');
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(enh('m_stone') === s0 + 1 && enh('c_base') === p0 - 1, 'Rolycoly: a Blind selected, 1 unenhanced deck card became Stone', enh('m_stone') - s0);
  let t = play([['S_K', 'm_stone']]);
  ok(near(t.mult, 1), 'Rolycoly: a scored Stone gives no Mult', t.total);
  ok(/becomes a Stone card/.test(plain(r)) && /Energy carries to Carkol/.test(plain(r)), 'its text', plain(r));
  rounds(4);
  ok(key(r) === 'j_poke_carkol' && get_type(r) === 'Fire', 'Rolycoly -> Carkol (Fire) after 4 rounds', [key(r), get_type(r)]);
  t = play([['S_K', 'm_stone'], ['H_K', 'm_stone']]);
  ok(near(t.mult, 1 + 6 + 6), 'Carkol: scored Stone cards +6 Mult each', t.total);
  s0 = enh('m_stone');
  endRound(); advance();
  ok(enh('m_stone') === s0 + 1, 'Carkol keeps the conversion', enh('m_stone') - s0);
  const d0 = G.GAME.round_resets.discards;
  rounds(4);
  ok(key(r) === 'j_poke_coalossal' && G.GAME.round_resets.discards === d0 + 1 && G.GAME.current_round.discards_left === d0 + 1, 'Carkol -> Coalossal after 5 rounds: +1 discard each round', [key(r), G.GAME.round_resets.discards, G.GAME.current_round.discards_left]);
  t = play([['S_K', 'm_stone'], ['H_K', 'm_stone'], 'D_3']);
  ok(near(t.mult, 1 * 1.3 * 1.3), 'Coalossal: scored Stone cards X1.3 each', t.total);
  s0 = enh('m_stone');
  endRound(); advance();
  ok(enh('m_stone') === s0 + 1, 'Coalossal keeps the conversion', enh('m_stone') - s0);
  r.remove(); flush();
  ok(G.GAME.round_resets.discards === d0, 'sold: the discard goes', G.GAME.round_resets.discards);
  // Blueprint copies the conversion and the X
  start('ROLY2', {}, { noBlind: true });
  add('j_poke_coalossal'); add('j_blueprint'); G.jokers.cards.reverse();
  s0 = enh('m_stone');
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(enh('m_stone') === s0 + 2, 'with Blueprint: two Stones a Blind', enh('m_stone') - s0);
  t = play([['S_K', 'm_stone']]);
  ok(near(t.mult, 1.3 * 1.3), 'Blueprint copies the X1.3', t.total);
  // seeded
  const pick = (seed) => { start(seed, {}, { noBlind: true }); add('j_poke_rolycoly'); act({ type: 'select_blind' }); flush(); const c = G.playing_cards.find((x) => key(x) === 'm_stone'); return c && c.base.suit + c.base.value; };
  ok(pick('COALSEED') === pick('COALSEED'), 'seeded: the same run seed turns the same card', pick('COALSEED'));
});

// ------------------------------------------------------------------- Silicobra / Sandaconda: Sand Spit, the house sandstorm
await sec('sand', () => {
  start('SILI');
  const s = add('j_poke_silicobra');
  G.GAME.probabilities.normal = 1000;
  let d = discard(['S_K', 'H_9', ['D_5', 'm_glass']]);
  ok(key(d.cards[0]) === 'm_stone' && key(d.cards[1]) === 'm_stone' && key(d.cards[2]) === 'm_glass', 'Sand Spit (odds forced): each discarded unenhanced card becomes Stone; a Glass card stays Glass', d.cards.map(key));
  G.GAME.probabilities.normal = 0;
  d = discard(['S_Q']);
  ok(key(d.cards[0]) === 'c_base', 'no luck: it stays', key(d.cards[0]));
  G.GAME.probabilities.normal = 1;
  // the 1 in 4, over many discards
  let stoned = 0, n = 0;
  for (let i = 0; i < 100; i++) { d = discard(['S_7', 'H_7']); n += 2; stoned += d.cards.filter((c) => key(c) === 'm_stone').length; }
  ok(stoned > 30 && stoned < 75, 'about 1 in 4 (200 cards)', stoned);
  ok(/1 in 4 chance to become a Stone card/.test(plain(s)), 'its text', plain(s));
  // The Hook's discards don't count (a player's discard only)
  G.GAME.probabilities.normal = 1000;
  clearHand();
  const hk = cards(['S_3', 'H_4']);
  for (const c of hk) G.hand.add_to_highlighted(c, true);
  // (discard_cards_from_highlighted with hook = true: what The Hook calls)
  RUN.discard_cards_from_highlighted(true); flush();
  ok(hk.every((c) => c.area === G.discard) && hk.every((c) => key(c) === 'c_base'), 'The Hook\'s discard (hook = true, odds forced): the cards are discarded, nothing turns', hk.map(key));
  G.GAME.probabilities.normal = 1;
  rounds(5);
  ok(key(s) === 'j_poke_sandaconda', 'Silicobra -> Sandaconda after 5 rounds', key(s));
  ok(DES.is_sandstorm() === true && /Sandstorm!/.test(plain(s)), 'Sandaconda held: a sandstorm', plain(s));
  let t = play([['S_K', 'm_stone'], ['H_K', 'm_stone']]);
  ok(t.chips === 5 + 50 + 20 + 50 + 20 && near(t.mult, 1 * 1.2 * 1.2), 'Sandaconda: scored Stone cards +20 Chips and X1.2 each', t.total);
  debuff(s);
  ok(DES.is_sandstorm() === false, 'debuffed: no sandstorm', DES.is_sandstorm());
  undebuff(s);
  endRound(); act({ type: 'cash_out' }); flush();
  ok(G.STATE === STATES.SHOP && DES.is_sandstorm() === true, 'in the shop too (live)', DES.is_sandstorm());
  s.remove(); flush();
  ok(DES.is_sandstorm() === false, 'sold: no sandstorm', DES.is_sandstorm());
  // Castform has no sand form: a sandstorm never changes its forecast
  start('SAND2', {}, { noBlind: true });
  const cf = add('j_poke_castform'); add('j_poke_sandaconda');
  stackDeck(['C_2', 'C_3', 'C_4', 'C_5', 'C_6', 'H_7', 'H_8', 'S_9']);
  act({ type: 'select_blind' }); flush();
  ok(DES.is_sandstorm() && ex(cf).form === 'rainy', 'Castform in a sandstorm: still its forecast (Clubs: Rainy)', ex(cf).form);
});

// ------------------------------------------------------------------- Cramorant: Gulp Missile
await sec('gulp missile', () => {
  start('CRAM');
  const c = add('j_poke_cramorant');
  let t = play(['S_A']);
  ok(near(t.mult, 1) && /Missile: Empty/.test(plain(c)), 'no discard yet: nothing', [t.total, plain(c)]);
  ok(drawn(c)[0] === GEN8 && drawn(c)[1].x === 0, 'empty: its own card (Gen 8 {0,0})', drawn(c));
  discard(['S_3']);
  ok(ex(c).missile === true && /Missile: Loaded!/.test(plain(c)), 'the first discard loads it', plain(c));
  ok(drawn(c)[0] === GEN8 && drawn(c)[1].x === 2 && drawn(c)[1].y === 0, 'loaded: its Gulping Form card (Gen 8 {2,0})', drawn(c));
  const sh = face(c, true);
  ok(sh && sh.atlas === 'poke_AtlasJokersBasicGen08Shiny391' && sh.pos.x === 2, 'a Shiny Gulping Cramorant draws the Shiny sheet\'s twin', sh && [sh.atlas, sh.pos]);
  t = play(['S_A']);
  ok(near(t.mult, 2.5), 'the next scored hand fires it: X2.5', t.total);
  ok(!ex(c).missile, 'spent', ex(c));
  t = play(['S_A']);
  ok(near(t.mult, 1), 'the hand after: nothing', t.total);
  discard(['S_4']);
  ok(!ex(c).missile, 'a second discard this round loads nothing (once a round)', ex(c));
  // next round: loaded, then lost unfired
  endRound(); advance();
  discard(['S_5']);
  ok(ex(c).missile === true, 'a new round: the first discard loads it again', ex(c));
  endRound();
  ok(ex(c).missile === false, '... and the round ended with it unfired (the winning hand fired it)', ex(c));
  advance();
  discard(['S_6']);
  ok(ex(c).missile === true, 'loaded again', ex(c));
  ex(c).firing = false;
  // lost: win the round with chips forced but end it with no scoring (a 0-hand round end) — simulate the end_of_round pass directly
  P_CENTERS.j_poke_cramorant.calculate(P_CENTERS.j_poke_cramorant, c, { end_of_round: true, main_eval: true, cardarea: G.jokers });
  ok(ex(c).missile === false, 'unfired at the end of the round: lost', ex(c));
  // a debuffed hand (The Eye) doesn't fire it
  start('CRAM2');
  const c2 = add('j_poke_cramorant');
  discard(['S_3']);
  G.GAME.blind.debuff_hand = () => true;
  t = play(['S_A']);
  delete G.GAME.blind.debuff_hand;
  ok(ex(c2).missile === true, 'a debuffed hand doesn\'t fire it', ex(c2));
  t = play(['S_A']);
  ok(near(t.mult, 2.5), 'the next scoring hand does', t.total);
  // Blueprint copies the X (one missile, fired twice)
  start('CRAM3');
  const c3 = add('j_poke_cramorant'); add('j_blueprint'); G.jokers.cards.reverse();
  discard(['S_3']);
  t = play(['S_A']);
  ok(near(t.mult, 2.5 * 2.5) && !ex(c3).missile, 'Blueprint copies the X2.5 (one missile)', t.total);
});

// ------------------------------------------------------------------- Arrokuda / Barraskewda: Propeller Tail
await sec('propeller tail', () => {
  start('ARRO');
  const a = add('j_poke_arrokuda');
  let t = play(['S_K', 'H_K', 'D_3']);
  ok(near(t.mult, 2 + 10), 'Arrokuda: the first scored card +10 Mult (once)', t.total);
  clearHand();
  const [k1, k2] = cards(['S_9', 'H_9']); debuff(k1);
  const r = replay([k1, k2]);
  ok(near(r.mult, 2), 'a debuffed first card: nothing, and the second isn\'t promoted', r.total);
  t = play([['S_A', 'c_base']]);
  ok(near(t.mult, 1 + 10), 'a lone card is the first', t.total);
  rounds(5);
  ok(key(a) === 'j_poke_barraskewda', 'Arrokuda -> Barraskewda after 5 rounds', key(a));
  t = play(['S_Q', 'H_Q', 'D_Q']);
  ok(near(t.mult, 3 * 2), 'Barraskewda: the first scored card X2', t.total);
  // a retrigger of the first card (Red Seal) gives it again
  clearHand();
  const [rs] = cards(['S_8']); rs.set_seal('Red', true, true);
  const r2 = replay([rs]);
  ok(near(r2.mult, 1 * 2 * 2), 'a Red Seal first card: X2 twice', r2.total);
});

// ------------------------------------------------------------------- Energy: the main number at the standard rate
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
  const fixed = (j, f, v) => ok(ex(j)[f] === v, `${key(j)}: ${f} stays ${v}`, ex(j)[f]);
  let j = steps('rookidee', 'Xmult', 'Colorless', [1.8, 2.1, 2.4]); fixed(j, 'taxi_money', 1);
  j = steps('corvisquire', 'Xmult', 'Colorless', [1.8, 2.1, 2.4]); fixed(j, 'taxi_money', 2);
  j = steps('corviknight', 'Xmult', 'Metal', [1.8, 2.1, 2.4]); fixed(j, 'taxi_money', 2); fixed(j, 'card_slots', 1);
  j = steps('blipbug', 'mult', 'Grass', [5.6, 7.2, 8.8]); fixed(j, 'scry', 1);
  j = steps('dottler', 'mult', 'Psychic', [5.6, 7.2, 8.8]); fixed(j, 'scry', 2);
  j = steps('orbeetle', 'Xmult_multi', 'Psychic', [1.2075, 1.265, 1.3225]); fixed(j, 'scry', 3);
  steps('gossifleur', 'mult', 'Grass', [5.6, 7.2, 8.8]);
  j = steps('eldegoss', 'mult', 'Grass', [5.6, 7.2, 8.8]); fixed(j, 'growth', 1);
  steps('wooloo', 'chips', 'Colorless', [65, 80, 95]);
  j = steps('dubwool', 'chips', 'Colorless', [130, 160, 190]); fixed(j, 'hands', 1);
  steps('chewtle', 'mult', 'Water', [4.2, 5.4, 6.6]);
  steps('drednaw', 'Xmult_mod', 'Water', [0.36, 0.42, 0.48]);
  steps('rolycoly', 'mult', 'Earth', [8.4, 10.8, 13.2]);
  steps('carkol', 'mult', 'Fire', [8.4, 10.8, 13.2]);
  j = steps('coalossal', 'Xmult_multi', 'Fire', [1.365, 1.43, 1.495]); fixed(j, 'd_size', 1);
  j = steps('silicobra', 'chips', 'Earth', [26, 32, 38]); fixed(j, 'num', 1); fixed(j, 'dem', 4);
  steps('sandaconda', 'chips', 'Earth', [26, 32, 38]);
  steps('sandaconda', 'Xmult_multi', 'Earth', [1.26, 1.32, 1.38]);
  const cr = steps('cramorant', 'Xmult', 'Water', [3, 3.5, 4]);
  discard(['S_3']);
  let t = play(['S_A']);
  ok(near(t.mult, 4) && ex(cr).Xmult === 4, 'energized Cramorant fires X4', t.total);
  steps('arrokuda', 'mult', 'Water', [14, 18, 22]);
  steps('barraskewda', 'Xmult_multi', 'Water', [2.1, 2.2, 2.3]);
  // Energy carries through evolution (re-applied to the new base)
  start('ENEVO');
  const rk = add('j_poke_rookidee');
  increment_energy(rk, 'Colorless'); increment_energy(rk, 'Colorless');
  rounds(4); rounds(5);
  ok(key(rk) === 'j_poke_corviknight' && ex(rk).energy_count === 2 && near(ex(rk).Xmult, 2.1), 'Rookidee (2 Energy) -> Corviknight: X2.1', [key(rk), ex(rk).Xmult]);
  t = play(['S_A']);
  ok(near(t.mult, 2.1), '... and it scores X2.1', t.total);
  start('ENEVO2');
  const bb = add('j_poke_blipbug');
  increment_energy(bb, 'Grass');
  rounds(4);
  ok(key(bb) === 'j_poke_dottler' && near(ex(bb).mult, 5.6), 'Blipbug (1 Energy) -> Dottler: +5.6 a Foreseen card', [key(bb), ex(bb).mult]);
  rounds(5);
  ok(key(bb) === 'j_poke_orbeetle' && near(ex(bb).Xmult_multi, 1.2075), '... -> Orbeetle: X1.2075', ex(bb).Xmult_multi);
  start('ENEVO3');
  const sc = add('j_poke_silicobra');
  increment_energy(sc, 'Earth'); increment_energy(sc, 'Earth'); increment_energy(sc, 'Earth');
  rounds(5);
  ok(key(sc) === 'j_poke_sandaconda' && near(ex(sc).chips, 38) && near(ex(sc).Xmult_multi, 1.38), 'Silicobra (3 Energy) -> Sandaconda: +38 Chips, X1.38', [key(sc), ex(sc).chips, ex(sc).Xmult_multi]);
});

// ------------------------------------------------------------------- save / resume
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'G8B1RES', customDeck: { name: 'Gen 8', mods: ['pokermon'], params: { blind_scaling: 0.05 },
    cards: [['S_K', 0, 0, 0, 12], ['H_9', 'm_poke_seed', 0, 0, 10], ['D_5', 'm_stone', 0, 0, 10], ['C_7', 0, 0, 0, 20]],
    jokers: [{ key: 'j_poke_cramorant' }, { key: 'j_poke_corviknight' }, { key: 'j_poke_eldegoss' }, { key: 'j_poke_rolycoly' }, { key: 'j_poke_silicobra' }, { key: 'j_poke_orbeetle' }] } });
  s.act({ type: 'select_blind' }); flush();
  s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 3).map((c) => c.sort_id) }); s.act({ type: 'discard' }); flush();
  for (let i = 0; i < 2; i++) {
    s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush();
    if (G.STATE !== STATES.SELECTING_HAND) break;
  }
  const snap = () => ({
    jokers: G.jokers.cards.map((j) => [key(j), ex(j).missile || false, ex(j).load_round]),
    enh: ['m_stone', 'm_poke_seed', 'm_poke_flower'].map(enh), growth: G.GAME.poke_growth_level, scry: G.GAME.scry_amount, shop: G.GAME.shop.joker_max,
    chips: String(G.GAME.chips), dollars: G.GAME.dollars,
  });
  const want = snap();
  ok(want.enh[0] > 10 && want.shop === 3 && want.scry === 3 && want.growth === 1 && want.jokers[0][2] >= 1, 'the run: Stones made, the shop slot, Foresight, growth, a missile loaded and fired', want);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  const got = snap();
  ok(!r.stoppedAt && JSON.stringify(got) === JSON.stringify(want), 'resume: the conversions, the missile, the slot, the Foresight, growth and the score come back the same', { want, got });
});

// ------------------------------------------------------------------- the art: the 3.9.1 cells show these types (the Gulping form too)
if (ART) {
  await sec('art types', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const sheet = (a) => a.replace(/^poke_/, '').replace(/391$/, '');
    const bad = [];
    for (const n of NAMES) { const r = typer.typeOfEntry({ atlas: sheet(C(n).atlas), pos: [C(n).pos.x, C(n).pos.y] }); if (!r || r.ptype !== C(n).ptype) bad.push([n, C(n).ptype, r && r.ptype]); }
    ok(!bad.length, 'each of the 20 is the type its 3.9.1 card shows', bad);
    const g = ANIM.GEN8_FORM_SPRITES.j_poke_cramorant.gulping;
    const r = typer.typeOfEntry({ atlas: 'AtlasJokersBasicGen08', pos: [g.x, g.y] });
    ok(r && r.ptype === 'Water', 'the Gulping Form cell shows Water too', r);
  });
} else console.log('(Pokermon art not on disk: the art type checks are skipped; set MICATRO_MAIN)');

done();
