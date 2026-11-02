// Gen 6, batch 2 (the owner's "Yes", 2026-11-02; jokers/pokejokers_designs.js "Gen 6, batch 2"; PORTING.md "Gen 6, batch 2"): 22 jokers,
// #682-715, on the guide's price slots (2-stage C $5 / S $8, single-stage R $7), placed after Gen 6 batch 1 (#661-678) in Pokédex order:
//   Spritzee 682 -> Aromatisse (Fairy)       Healing Aroma: each scored Lucky card earns $1 / $2; Aromatisse's Aroma Veil: Lucky odds +1
//                                            (Pidove's Super Luck: the numerator, before Oops! doubles it). 5 rounds.
//   Swirlix 684 -> Slurpuff (Fairy)          Sweet Veil: +1 / +2 Mult banked per Tarot used (the bank carries); Slurpuff +1 consumable slot.
//   Inkay 686 -> Malamar (Dark)              scored 2-5 +4 Mult; Malamar's Topsy-Turvy: every scored card gives its FLIPPED rank's Chips
//                                            (2<->A, 3<->K, 4<->Q, 5<->J, 6<->10, 7<->9; the chip_bonus hook; bonuses stay, Stone unchanged).
//   Binacle 688 -> Barbaracle (Earth)        scored 7s +20 Chips / +20 Chips and X1.3.
//   Skrelp 690 -> Dragalge (Dark)            Poison Point: each Blind, 1 random deck card becomes a Hazard (unenhanced first); Skrelp +3 Mult
//                                            per Hazard in the full deck; Dragalge each held Hazard X1.2.
//   Tyrunt 696 -> Tyrantrum (Dragon)         Ancient Kings: 1+ +5 Mult, 2+ X1.25, 3+ scored Kings retrigger; Tyrantrum 4+ X2.
//   Amaura 698 -> Aurorus (Earth)            Ancient Queens: 1+ +40 Chips, 2+ the leftmost non-Glass scored Queen becomes Glass, 3+ $3;
//                                            Aurorus 4+ X2. Both fossils evolve after their 3+ tier fires 5 times.
//   Hawlucha 701 (Fighting, R $7)            Flying Press: the first and the last scored card retrigger (a lone card once).
//   Klefki 707 (Metal, R $7)                 Key Ring: X1 + X0.25 per Voucher redeemed this run.
//   Phantump 708 -> Trevenant (Grass)        Forest's Curse: +3 / +5 Mult banked per playing card destroyed; Trevenant plants a Seed per card.
//   Bergmite 712 -> Avalugg (Water)          +50 Chips / +150 Chips and X1.5 on the final hand.
//   Noibat 714 -> Noivern (Dragon)           +1 / +2 hand size; Glass breaks 1 in 2; +2 Mult / X0.1 banked per Glass card broken; Noivern turns a
//                                            deck card Glass per break. Every extra break feeds the Whismur line; Regice still stops them all.
// Every ability is FIRED through real hands / Tarots / rounds / shops with exact numbers.
//   node micatro/tests/mods/pokermon_gen6_batch2_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { probability_vars } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
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
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const LINES = {
  spritzee: ['spritzee', 'aromatisse'], swirlix: ['swirlix', 'slurpuff'], inkay: ['inkay', 'malamar'], binacle: ['binacle', 'barbaracle'],
  skrelp: ['skrelp', 'dragalge'], tyrunt: ['tyrunt', 'tyrantrum'], amaura: ['amaura', 'aurorus'], hawlucha: ['hawlucha'], klefki: ['klefki'],
  phantump: ['phantump', 'trevenant'], bergmite: ['bergmite', 'avalugg'], noibat: ['noibat', 'noivern'],
};
const NAMES = Object.values(LINES).flat();
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
/** Put cards in hand: a list of keys, or [key, center] pairs (in that order: the first is the leftmost). */
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list` (with `held` left in hand); the round never ends by accident unless `last` (the round's final hand). */
function play(list, { held = [], clear = true, last = false } = {}) {
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
/** Win the round in progress (High Card 2) -> ROUND_EVAL. */
function endRound() { clearHand(); const c = hand(['S_2']); G.GAME.chips = G.GAME.blind.chips; if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2; act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush(); }
function advance(boss = 'bl_wall') {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = boss;
  act({ type: 'select_blind' }); flush();
  clearHand();
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
const rounds = (n) => { for (let r = 0; r < n; r++) { endRound(); advance(); } };
function use(k, targets) {
  const c = add(k);
  const r = act({ type: 'use', id: c.sort_id, targets: (targets || []).map((x) => x.sort_id) });
  flush();
  return r;
}
const front = (j) => G.jokers.cards.splice(G.jokers.cards.indexOf(j), 1) && G.jokers.cards.unshift(j);
const deckEnh = (enh) => G.playing_cards.filter((c) => !c.shattered && !c.destroyed && key(c) === enh);

// ------------------------------------------------------------------- pin, static data, order, families, Energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 62 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 62+ (Gen 6 batch 2)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of NAMES) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs');
  }
  const hits = [];
  const re = new RegExp('\\b(' + NAMES.join('|') + ')\\b', 'i');
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the 22 (nothing to dedupe)', hits);
});
await sec('static', () => {
  start('G6B2S');
  const S = 'poke_safari';
  // [rarity, cost, stage, type, rounds|undefined, x, y] (all on the 3.9.1 Natdex sheet)
  const WANT = {
    spritzee: [1, 5, 'Basic', 'Fairy', 5, 12, 45], aromatisse: [S, 8, 'One', 'Fairy', undefined, 14, 45],
    swirlix: [1, 5, 'Basic', 'Fairy', 5, 16, 45], slurpuff: [S, 8, 'One', 'Fairy', undefined, 18, 45],
    inkay: [1, 5, 'Basic', 'Dark', 5, 20, 45], malamar: [S, 8, 'One', 'Dark', undefined, 22, 45],
    binacle: [1, 5, 'Basic', 'Earth', 5, 24, 45], barbaracle: [S, 8, 'One', 'Earth', undefined, 26, 45],
    skrelp: [1, 5, 'Basic', 'Dark', 5, 28, 45], dragalge: [S, 8, 'One', 'Dark', undefined, 0, 46],
    tyrunt: [1, 5, 'Basic', 'Dragon', undefined, 10, 46], tyrantrum: [S, 8, 'One', 'Dragon', undefined, 12, 46],
    amaura: [1, 5, 'Basic', 'Earth', undefined, 14, 46], aurorus: [S, 8, 'One', 'Earth', undefined, 16, 46],
    hawlucha: [3, 7, 'Basic', 'Fighting', undefined, 20, 46], klefki: [3, 7, 'Basic', 'Metal', undefined, 2, 47],
    phantump: [1, 5, 'Basic', 'Grass', 5, 4, 47], trevenant: [S, 8, 'One', 'Grass', undefined, 6, 47],
    bergmite: [1, 5, 'Basic', 'Water', 5, 12, 47], avalugg: [S, 8, 'One', 'Water', undefined, 14, 47],
    noibat: [1, 5, 'Basic', 'Dragon', 5, 16, 47], noivern: [S, 8, 'One', 'Dragon', undefined, 18, 47],
  };
  ok(Object.keys(WANT).length === 22 && NAMES.length === 22, '22 jokers');
  for (const [n, [rarity, cost, stage, type, rnds, x, y]] of Object.entries(WANT)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === type && c.config.extra.ptype === type && c.gen === 6,
      `${n}: ${rarity} $${cost}, ${stage}, ${type}, Gen 6`, [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.config.extra.rounds === rnds, `${n}: ${rnds ? 'evolves after ' + rnds + ' rounds' : 'no round timer'}`, c.config.extra.rounds);
    ok(c.atlas === 'poke_AtlasJokersBasicNatdex391' && c.pos.x === x && c.pos.y === y && !c.soul_pos, `${n}: upstream 3.9.1 cell Natdex {${x},${y}} (nothing to deploy)`, [c.atlas, c.pos]);
  }
  ok(C('tyrunt').config.evo_rqmt === 5 && C('amaura').config.evo_rqmt === 5, 'the fossils evolve after their 3+ tier fires 5 times (evo_rqmt 5)');
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const run = (from, list, to) => { const i = keys.indexOf('j_poke_' + list[0]); return i > 0 && [from, ...list, to].every((k, n) => keys[i - 1 + n] === 'j_poke_' + k) ? true : keys.slice(i - 1, i + list.length + 1); };
  const RUNS = [
    ['aegislash', ['spritzee', 'aromatisse', 'swirlix', 'slurpuff', 'inkay', 'malamar', 'binacle', 'barbaracle', 'skrelp', 'dragalge', 'tyrunt', 'tyrantrum', 'amaura', 'aurorus'], 'sylveon'],
    ['sylveon', ['hawlucha', 'klefki', 'phantump', 'trevenant'], 'pumpkaboo'],
    ['gourgeist', ['bergmite', 'avalugg', 'noibat', 'noivern'], 'xerneas'],
  ];
  for (const [from, list, to] of RUNS) ok(run(from, list, to) === true, `Pokédex order: ${from} (${from === 'aegislash' ? 681 : from === 'sylveon' ? 700 : 711}), ${list.join(', ')}, ${to}`, run(from, list, to));
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
  for (const line of Object.values(LINES)) if (line.length > 1) ok(fam(line[0]) === line.join(), 'one family: ' + line.join(' -> '), fam(line[0]));
  const inert = ['spritzee', 'aromatisse', 'malamar', 'hawlucha'];
  ok(inert.every((n) => C(n).poke_no_energy_field === true) && NAMES.filter((n) => !inert.includes(n)).every((n) => !C(n).poke_no_energy_field),
    'Energy-inert by design (poke_no_energy_field): Spritzee / Aromatisse (money, odds), Malamar (a rule), Hawlucha (retriggers)');
  ok(['aroma_money', 'lucky_odds', 'sweet_mult', 'card_limit', 'retriggers', 'ancient_money', 'third_times', 'curse_mult', 'bat_mult', 'bat_Xmult', 'h_size'].every((f) => !(f in energy_values)),
    'fixed: the money, the odds, the banks, the consumable slot, the retriggers, the 3+ count, hand size (no energy field)');
});

// ------------------------------------------------------------------- Spritzee / Aromatisse
await sec('healing aroma', () => {
  start('AROMA');
  const s = add('j_poke_spritzee');
  let d0 = G.GAME.dollars;
  let t = play([['S_A', 'm_lucky'], ['H_A', 'm_lucky']]);
  ok(G.GAME.dollars - d0 >= 2 && (G.GAME.dollars - d0 - 2) % 20 === 0, 'Spritzee: 2 scored Lucky cards earn $1 each (+ whatever their own $20 rolls pay)', G.GAME.dollars - d0);
  d0 = G.GAME.dollars;
  play(['S_K', 'H_K']);
  ok(G.GAME.dollars === d0, 'plain cards: nothing');
  // a played Lucky card that doesn't score earns nothing
  d0 = G.GAME.dollars;
  t = play(['S_K', 'H_K', ['D_4', 'm_lucky']]);
  ok(G.GAME.dollars === d0 && t.cards[2], 'a Lucky kicker that doesn\'t score: nothing', G.GAME.dollars - d0);
  // a debuffed Lucky card scores nothing
  clearHand();
  const [dl] = cards([['S_Q', 'm_lucky']]); debuff(dl);
  d0 = G.GAME.dollars;
  replay([dl]);
  ok(G.GAME.dollars === d0, 'a debuffed Lucky card: nothing', G.GAME.dollars - d0);
  ok(/earns \$1/.test(plain(s)) && /Evolves after 5 rounds/.test(plain(s)), 'its text: $1, 5 rounds', plain(s));
  rounds(5);
  ok(key(s) === 'j_poke_aromatisse', 'Spritzee -> Aromatisse after 5 rounds', key(s));
  // Aromatisse: $2 per scored Lucky card, and Lucky odds +1 (the numerator)
  const L = cards([['S_9', 'm_lucky']])[0];
  ok(JSON.stringify(probability_vars(L, 1, 5, 'lucky_mult')) === '[2,5]' && JSON.stringify(probability_vars(L, 1, 15, 'lucky_money')) === '[2,15]', 'Aromatisse: Lucky cards 2 in 5 Mult, 2 in 15 money',
    [probability_vars(L, 1, 5, 'lucky_mult'), probability_vars(L, 1, 15, 'lucky_money')]);
  ok(/Currently 2 in 5 Mult, | 2 in 15 money/.test(plain(s)) && /earns \$2/.test(plain(s)), 'its tooltip shows the odds and $2', plain(s));
  d0 = G.GAME.dollars;
  play([['S_A', 'm_lucky']]);
  ok(G.GAME.dollars - d0 >= 2 && (G.GAME.dollars - d0 - 2) % 20 === 0, 'Aromatisse: a scored Lucky card earns $2', G.GAME.dollars - d0);
  const p = add('j_poke_pidove');
  ok(JSON.stringify(probability_vars(L, 1, 5, 'lucky_mult')) === '[3,5]', 'stacks with Pidove\'s Super Luck: 3 in 5 (+1 each)', probability_vars(L, 1, 5, 'lucky_mult'));
  p.remove(); flush();
  add('j_oops');
  ok(JSON.stringify(probability_vars(L, 1, 5, 'lucky_mult')) === '[4,5]' && JSON.stringify(probability_vars(L, 1, 15, 'lucky_money')) === '[4,15]', 'Oops! All 6s doubles AFTER: (1 + 1) x 2 = 4 in 5', probability_vars(L, 1, 5, 'lucky_mult'));
  add('j_poke_aromatisse');
  ok(JSON.stringify(probability_vars(L, 1, 5, 'lucky_mult')) === '[6,5]', 'two Aromatisse + Oops: (1 + 2) x 2', probability_vars(L, 1, 5, 'lucky_mult'));
  // the Lucky rolls really move: 60 Lucky plays without / with Aromatisse
  const procs = (withA) => {
    start('LUCKROLL'); if (withA) add('j_poke_aromatisse');
    let n = 0; for (let i = 0; i < 60; i++) { const r = play([['S_A', 'm_lucky']]); if (r.mult > 1) n++; }
    return n;
  };
  const a0 = procs(false), a1 = procs(true);
  ok(a0 >= 3 && a0 <= 22 && a1 >= 14 && a1 <= 38 && a1 > a0, 'played: the +20 Mult roll hits 1 in 5 (~12 of 60) without, 2 in 5 (~24) with Aromatisse', [a0, a1]);
});

// ------------------------------------------------------------------- Swirlix / Slurpuff
await sec('sweet veil', () => {
  start('SWIRL');
  const s = add('j_poke_swirlix');
  let t = play(['S_A']);
  ok(near(t.mult, 1), 'Swirlix: nothing banked yet', t.total);
  use('c_hermit'); use('c_temperance');
  ok(near(ex(s).sweet_mult, 2), 'two Tarots used: +2 Mult banked', ex(s).sweet_mult);
  use('c_mercury');
  ok(near(ex(s).sweet_mult, 2), 'a Planet: nothing', ex(s).sweet_mult);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 2), '... given every hand', t.total);
  add('j_blueprint'); front(G.jokers.cards[G.jokers.cards.length - 1]);
  use('c_hermit');
  ok(near(ex(s).sweet_mult, 3), 'with Blueprint: still +1 a Tarot (Blueprint never banks)', ex(s).sweet_mult);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 3 + 3), 'Blueprint copies the Mult', t.total);
  G.jokers.cards[0].remove(); flush();
  const slots = G.consumeables.config.card_limit;
  rounds(5);
  ok(key(s) === 'j_poke_slurpuff' && near(ex(s).sweet_mult, 3), 'Swirlix -> Slurpuff after 5 rounds, keeping +3', [key(s), ex(s).sweet_mult]);
  ok(G.consumeables.config.card_limit === slots + 1, 'Slurpuff: +1 consumable slot', [slots, G.consumeables.config.card_limit]);
  use('c_hermit');
  ok(near(ex(s).sweet_mult, 5), 'Slurpuff banks +2 a Tarot', ex(s).sweet_mult);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 5), 'Slurpuff gives the bank', t.total);
  ok(/consumable slot/.test(plain(s)) && /Currently \+5 Mult/.test(plain(s)), 'its tooltip', plain(s));
  s.remove(); flush();
  ok(G.consumeables.config.card_limit === slots, 'sold / gone: the slot goes with it', G.consumeables.config.card_limit);
});

// ------------------------------------------------------------------- Inkay / Malamar
await sec('inkay', () => {
  start('INKAY');
  const k = add('j_poke_inkay');
  let t = play(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']);
  ok(t.chips === 30 + 20 && near(t.mult, 4 + 16), 'Inkay, 2-3-4-5-6 Straight: the 2, 3, 4 and 5 +4 Mult each (not the 6)', t.total);
  t = play(['S_A']);
  ok(near(t.mult, 1), 'an Ace: nothing');
  t = play([['S_2', 'm_stone']]);
  ok(near(t.mult, 1), 'a Stone card (no rank): nothing', t.total);
  rounds(5);
  ok(key(k) === 'j_poke_malamar', 'Inkay -> Malamar after 5 rounds', key(k));
});
await sec('topsy-turvy', () => {
  start('MALA');
  const m = add('j_poke_malamar');
  const chipsOf = (k, enh) => play([enh ? [k, enh] : k]).chips - 5;
  const got = {};
  for (const [r, want] of [['2', 11], ['3', 10], ['4', 10], ['5', 10], ['6', 10], ['7', 9], ['8', 8], ['9', 7], ['T', 6], ['J', 5], ['Q', 4], ['K', 3], ['A', 2]]) got[r] = [chipsOf('S_' + r), want];
  ok(Object.values(got).every(([g, w]) => g === w), 'Malamar: each rank scores its flipped rank\'s Chips (2 = 11, 3 = 10 ... K = 3, A = 2; 8 stays 8)', got);
  ok(chipsOf('H_2', 'm_bonus') === 11 + 30, 'a Bonus 2: 11 + its +30 (the enhancement bonus stays)');
  ok(chipsOf('H_K', 'm_stone') === 50, 'a Stone card: +50, unchanged (no rank)');
  let t = play(['S_A', 'H_A']);
  ok(t.chips === 10 + 2 + 2, 'a Pair of Aces: 2 + 2', t.total);
  // perma_bonus (Hiker) stays on top of the flipped rank
  const h = add('j_hiker');
  t = play(['D_2']);
  const two = t.cards[0];
  ok(t.chips === 5 + 11 && two.ability.perma_bonus === 5, 'Hiker: the 2 scores 11, then gains +5 for good', [t.total, two.ability.perma_bonus]);
  const r = replay([two]);
  ok(r.chips === 5 + 11 + 5, 'the same 2 again: flipped 11 + its banked +5 (perma_bonus kept)', r.total);
  h.remove(); flush();
  // a retrigger scores the flipped Chips again
  add('j_hack');
  t = play(['C_3']);
  ok(t.chips === 5 + 10 + 10, 'Hack retriggers a 3: 10 twice', t.total);
  G.jokers.cards.find((j) => key(j) === 'j_hack').remove(); flush();
  // two Malamars flip once; a debuffed one flips nothing
  const m2 = add('j_poke_malamar');
  ok(chipsOf('S_K') === 3, 'two Malamars: still 3 for a King (flipped once)');
  m2.remove(); flush();
  debuff(m);
  ok(chipsOf('S_K') === 10 && chipsOf('S_2') === 2, 'a debuffed Malamar: no flip', [chipsOf('S_K'), chipsOf('S_2')]);
  m.ability.debuff_sources = {}; m.set_debuff(); flush();
  ok(chipsOf('S_K') === 3, 'undebuffed: the flip is back');
  m.remove(); flush();
  ok(chipsOf('S_K') === 10, 'sold: Kings give 10 again');
  ok(DES.flipped_chips(cards(['S_4'])[0]) === 10 && DES.flipped_chips(cards([['S_4', 'm_stone']])[0]) === undefined, 'flipped_chips (the hook\'s helper): a 4 -> 10, a Stone card -> none');
});

// ------------------------------------------------------------------- Binacle / Barbaracle
await sec('seven rocks', () => {
  start('BINA');
  const b = add('j_poke_binacle');
  let t = play(['S_7']);
  ok(t.chips === 5 + 7 + 20, 'Binacle: a scored 7 +20 Chips', t.total);
  t = play(['S_7', 'H_7', 'D_8']);
  ok(t.chips === 10 + 14 + 40, 'a Pair of 7s: +20 each (the 8 doesn\'t score)', t.total);
  rounds(5);
  ok(key(b) === 'j_poke_barbaracle', 'Binacle -> Barbaracle after 5 rounds', key(b));
  t = play(['S_7', 'H_7']);
  ok(t.chips === 10 + 14 + 40 && near(t.mult, 2 * 1.3 * 1.3), 'Barbaracle: each 7 +20 Chips and X1.3', t.total);
  t = play(['S_6']);
  ok(t.chips === 11 && near(t.mult, 1), 'a 6: nothing', t.total);
});

// ------------------------------------------------------------------- Skrelp / Dragalge
await sec('poison point', () => {
  start('SKREL', {}, { noBlind: true });
  const s = add('j_poke_skrelp');
  const plain0 = G.playing_cards.filter((c) => key(c) === 'c_base').length;
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(deckEnh('m_poke_hazard').length === 1 && G.playing_cards.filter((c) => key(c) === 'c_base').length === plain0 - 1, 'Skrelp: selecting a Blind turns 1 unenhanced deck card into a Hazard', deckEnh('m_poke_hazard').length);
  let t = play(['S_A']);
  ok(near(t.mult, 1 + 3), '+3 Mult per Hazard card in the full deck (1)', t.total);
  ok(/Currently \+3 Mult/.test(plain(s)), 'its tooltip', plain(s));
  // a fully enhanced deck: one card is overwritten (never one already a Hazard)
  endRound();
  for (const c of G.playing_cards) if (key(c) !== 'm_poke_hazard') c.set_ability(P_CENTERS.m_bonus, null, true);
  advance();
  ok(deckEnh('m_poke_hazard').length === 2, 'no unenhanced card left: a Bonus card becomes the Hazard (the Regis\' rule)', deckEnh('m_poke_hazard').length);
  // seeded
  const pickOf = (seed) => { start(seed, {}, { noBlind: true }); add('j_poke_skrelp'); act({ type: 'select_blind' }); flush(); const c = deckEnh('m_poke_hazard')[0]; return c && c.base.id + c.base.suit; };
  ok(pickOf('HAZSEED') === pickOf('HAZSEED'), 'seeded: the same seed poisons the same card', pickOf('HAZSEED'));
  // Blueprint copies the conversion
  start('SKRELBP', {}, { noBlind: true });
  add('j_blueprint'); add('j_poke_skrelp');
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(deckEnh('m_poke_hazard').length === 2, 'with Blueprint: 2 Hazards a Blind', deckEnh('m_poke_hazard').length);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 6 + 6), 'and Blueprint copies the +3 per Hazard (2 Hazards: +6 twice)', t.total);
  // evolution, then Dragalge
  start('SKRELEVO');
  const e = add('j_poke_skrelp');
  rounds(5);
  ok(key(e) === 'j_poke_dragalge', 'Skrelp -> Dragalge after 5 rounds', key(e));
  const hz = deckEnh('m_poke_hazard').length;
  endRound(); advance();
  ok(deckEnh('m_poke_hazard').length === hz + 1, 'Dragalge: the same conversion each Blind (+1 Hazard; none was held at the round\'s end, so none was destroyed)', [hz, deckEnh('m_poke_hazard').length]);
  t = play(['S_A'], { held: [['S_5', 'm_poke_hazard'], ['H_6', 'm_poke_hazard'], 'D_9'] });
  ok(t.chips === 5 + 11 && near(t.mult, 1 * 1.2 * 1.2), 'Dragalge: 2 Hazard cards held, X1.2 each (no Skrelp Mult)', t.total);
});

// ------------------------------------------------------------------- the fossils: Ancient Kings / Queens, evolution by the 3+ count
await sec('ancient kings', () => {
  start('TYRU');
  const ty = add('j_poke_tyrunt');
  let t = play(['S_K']);
  ok(t.chips === 5 + 10 && near(t.mult, 1 + 5), 'Tyrunt, one King: +5 Mult', t.total);
  t = play(['S_K', 'H_K']);
  ok(t.chips === 10 + 20 && near(t.mult, (2 + 5) * 1.25), 'two Kings: +5, X1.25 (no retrigger)', t.total);
  t = play(['S_K', 'H_K', 'D_K']);
  ok(t.chips === 30 + 60 && near(t.mult, (3 + 5) * 1.25) && ex(ty).third_times === 1, 'three Kings: every King retriggers (10 twice each), +5, X1.25; counted 1/5', [t.total, ex(ty).third_times]);
  t = play(['S_K', 'H_K', 'D_K', 'C_K']);
  ok(t.chips === 60 + 80 && near(t.mult, (7 + 5) * 1.25) && ex(ty).third_times === 2, 'Tyrunt, four Kings: no 4+ tier (2/5)', [t.total, ex(ty).third_times]);
  ok(/Trigger 3\+ ability 3 times to evolve/.test(plain(ty)), 'its tooltip counts down (3 to go)', plain(ty));
  add('j_blueprint'); front(G.jokers.cards[G.jokers.cards.length - 1]);
  t = play(['S_K', 'H_K', 'D_K']);
  ok(t.chips === 30 + 90 && ex(ty).third_times === 3, 'with Blueprint: the Kings retrigger twice (each 10 x3), counted once (3/5)', [t.total, ex(ty).third_times]);
  G.jokers.cards[0].remove(); flush();
  play(['S_K', 'H_K', 'D_K']); play(['S_K', 'H_K', 'D_K', 'S_Q']);
  ok(ex(ty).third_times === 5 && key(ty) === 'j_poke_tyrunt', '5 times: evolves at the end of the round', ex(ty).third_times);
  endRound();
  ok(key(ty) === 'j_poke_tyrantrum', 'Tyrunt -> Tyrantrum', key(ty));
  advance();
  t = play(['S_K', 'H_K', 'D_K', 'C_K']);
  ok(t.chips === 60 + 80 && near(t.mult, (7 + 5) * 1.25 * 2), 'Tyrantrum, four Kings: retriggers, +5, X1.25 and X2', t.total);
  t = play(['S_Q']);
  ok(near(t.mult, 1), 'no King: nothing', t.total);
});
await sec('ancient queens', () => {
  start('AMAU');
  const am = add('j_poke_amaura');
  let t = play(['S_Q']);
  ok(t.chips === 5 + 10 + 40 && key(t.cards[0]) === 'c_base', 'Amaura, one Queen: +40 Chips (no Glass)', t.total);
  t = play(['S_Q', 'H_Q']);
  ok(t.chips === 10 + 20 + 40 && near(t.mult, 2 * 2) && key(t.cards[0]) === 'm_glass' && key(t.cards[1]) === 'c_base', 'two Queens: the LEFTMOST becomes Glass before scoring (X2 this hand)', [t.total, t.cards.map(key)]);
  let d0 = G.GAME.dollars;
  t = play([['S_Q', 'm_glass'], 'H_Q', 'D_Q']);
  ok(key(t.cards[1]) === 'm_glass' && key(t.cards[2]) === 'c_base' && near(t.mult, 3 * 2 * 2) && G.GAME.dollars === d0 + 3 && ex(am).third_times === 1,
    'three Queens, the first already Glass: the next one turns Glass; earn $3 (1/5)', [t.total, t.cards.map(key), G.GAME.dollars - d0]);
  d0 = G.GAME.dollars;
  t = play([['S_Q', 'm_glass'], ['H_Q', 'm_glass']]);
  ok(near(t.mult, 2 * 4) && G.GAME.dollars === d0, 'every Queen already Glass: nothing converted, no $ (2+ only)', t.total);
  for (let i = 0; i < 4; i++) play(['S_Q', 'H_Q', 'D_Q']);
  ok(ex(am).third_times === 5 && key(am) === 'j_poke_amaura', '5 times', ex(am).third_times);
  endRound();
  ok(key(am) === 'j_poke_aurorus', 'Amaura -> Aurorus at the end of the round', key(am));
  advance();
  d0 = G.GAME.dollars;
  t = play(['S_Q', 'H_Q', 'D_Q', 'C_Q']);
  ok(t.chips === 60 + 40 + 40 && near(t.mult, 7 * 2 * 2) && G.GAME.dollars === d0 + 3, 'Aurorus, four Queens: +40, one Glass (X2), $3 and X2', [t.total, G.GAME.dollars - d0]);
});

// ------------------------------------------------------------------- Hawlucha
await sec('flying press', () => {
  start('HAWL');
  add('j_poke_hawlucha');
  let t = play(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']);
  ok(t.chips === 30 + 20 + 2 + 6, 'Hawlucha, a Straight: the first (2) and the last (6) retrigger', t.total);
  t = play(['S_K']);
  ok(t.chips === 5 + 10 + 10, 'a lone scored card: once in all', t.total);
  t = play(['S_K', 'H_K', 'D_3']);
  ok(t.chips === 10 + 40, 'a Pair (the kicker doesn\'t score): each King once', t.total);
  add('j_blueprint'); front(G.jokers.cards[G.jokers.cards.length - 1]);
  t = play(['S_K']);
  ok(t.chips === 5 + 30, 'Blueprint copies it', t.total);
});

// ------------------------------------------------------------------- Klefki
await sec('key ring', () => {
  start('KLEF');
  const k = add('j_poke_klefki');
  let t = play(['S_A']);
  ok(near(t.mult, 1) && /Currently 0/.test(plain(k)), 'Klefki, no Voucher: X1', [t.total, plain(k)]);
  endRound();
  act({ type: 'cash_out' });
  G.GAME.dollars = 100;
  const v = G.shop_vouchers.cards[0];
  ok(!!v && act({ type: 'buy', id: v.sort_id }).ok !== false, 'buy the shop\'s Voucher', v && key(v));
  flush();
  act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush(); clearHand();
  t = play(['S_A']);
  ok(DES.vouchers_redeemed() === 1 && near(t.mult, 1.25), 'one Voucher redeemed: X1.25', [DES.vouchers_redeemed(), t.total]);
  // a late buy sees the whole run's record
  k.remove(); flush();
  G.GAME.used_vouchers.v_grabber = true; G.GAME.used_vouchers.v_wasteful = true;
  add('j_poke_klefki');
  t = play(['S_A']);
  ok(near(t.mult, 1.75), 'a Klefki bought after 3 Vouchers: X1.75 at once', t.total);
});

// ------------------------------------------------------------------- Phantump / Trevenant
await sec('forest curse', () => {
  start('PHAN');
  const p = add('j_poke_phantump');
  const [a, b] = cards(['S_A', 'H_4']);
  ok(use('c_hanged_man', [a, b]).ok !== false && !G.playing_cards.includes(a) && !G.playing_cards.includes(b), 'The Hanged Man destroys 2 cards');
  ok(near(ex(p).curse_mult, 6), 'Phantump: +3 Mult per destroyed card (+6)', ex(p).curse_mult);
  let t = play(['S_A']);
  ok(near(t.mult, 1 + 6), '... given every hand', t.total);
  // a shattered Glass card counts too
  let broke = 0;
  for (let i = 0; i < 30 && !broke; i++) { const r = play([['S_9', 'm_glass']]); if (r.cards[0].shattered) broke++; }
  ok(broke === 1 && near(ex(p).curse_mult, 9), 'a Glass card shattering: +3 more', ex(p).curse_mult);
  rounds(5);
  ok(key(p) === 'j_poke_trevenant' && near(ex(p).curse_mult, 9), 'Phantump -> Trevenant after 5 rounds, keeping +9', [key(p), ex(p).curse_mult]);
  const seeds0 = deckEnh('m_poke_seed').length;
  const [c1, c2] = cards(['S_2', 'H_2']);
  use('c_hanged_man', [c1, c2]);
  ok(near(ex(p).curse_mult, 19) && deckEnh('m_poke_seed').length === seeds0 + 2, 'Trevenant: +5 a card (+10) and a Seed planted for each (2)', [ex(p).curse_mult, deckEnh('m_poke_seed').length - seeds0]);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 19), 'Trevenant gives the bank', t.total);
  // nothing unenhanced left: no Seed
  for (const c of G.playing_cards) if (key(c) === 'c_base') c.set_ability(P_CENTERS.m_bonus, null, true);
  const s1 = deckEnh('m_poke_seed').length;
  clearHand();
  const [c3] = cards([['D_2', 'm_bonus']]);
  use('c_hanged_man', [c3]);
  ok(deckEnh('m_poke_seed').length === s1 && near(ex(p).curse_mult, 24), 'no unenhanced card left: no Seed (never an overwrite), still +5', [deckEnh('m_poke_seed').length - s1, ex(p).curse_mult]);
});

// ------------------------------------------------------------------- Bergmite / Avalugg
await sec('iceberg', () => {
  start('BERG');
  const b = add('j_poke_bergmite');
  let t = play(['S_A']);
  ok(t.chips === 16 + 50, 'Bergmite: +50 Chips', t.total);
  rounds(5);
  ok(key(b) === 'j_poke_avalugg', 'Bergmite -> Avalugg after 5 rounds', key(b));
  t = play(['S_A']);
  ok(t.chips === 16 + 150 && near(t.mult, 1), 'Avalugg: +150 Chips, no X before the final hand', t.total);
  t = play(['S_A'], { last: true });
  ok(t.chips === 16 + 150 && near(t.mult, 1.5), 'the final hand: X1.5 too', t.total);
});

// ------------------------------------------------------------------- Noibat / Noivern: the Glass odds, the banks, the refill, the Whismur line
await sec('supersonic', () => {
  start('NOIB', {}, { noBlind: true });
  const base = G.hand.config.card_limit;
  const n = add('j_poke_noibat');
  ok(G.hand.config.card_limit === base + 1, 'Noibat: +1 hand size', G.hand.config.card_limit);
  act({ type: 'select_blind' }); flush(); clearHand();
  const g = cards([['S_9', 'm_glass']])[0];
  ok(JSON.stringify(probability_vars(g, 1, 4, 'glass')) === '[1,2]', 'Glass cards break 1 in 2 (was 1 in 4)', probability_vars(g, 1, 4, 'glass'));
  ok(/Now 1 in 2/.test(plain(n)), 'its tooltip shows the odds', plain(n));
  add('j_poke_noibat');
  ok(JSON.stringify(probability_vars(g, 1, 4, 'glass')) === '[1,2]', 'two Noibats: still 1 in 2 (copies never stack)');
  G.jokers.cards[G.jokers.cards.length - 1].remove(); flush();
  const oo = add('j_oops');
  ok(JSON.stringify(probability_vars(g, 1, 4, 'glass')) === '[2,2]', 'with Oops! All 6s: 2 in 2 (it doubles the numerator after)', probability_vars(g, 1, 4, 'glass'));
  oo.remove(); flush();
  const rg = add('j_poke_regice');
  ok(probability_vars(g, 1, 4, 'glass')[0] === 0, 'with Regice (Ice Body): 0 in 2, no Glass ever breaks (the anti-synergy)', probability_vars(g, 1, 4, 'glass'));
  rg.remove(); flush();
  // played: shatters over 120 Glass hands, with and without Noibat; each one banks +2 and feeds a Whismur
  const breaks = (withN) => {
    start('GLASSRUN');
    const w = add('j_poke_whismur'); const nb = withN ? add('j_poke_noibat') : null;
    let k = 0; for (let i = 0; i < 120; i++) { const r = play([['S_9', 'm_glass']]); if (r.cards[0].shattered) k++; }
    return { k, w: ex(w).glass_chips, nb: nb && ex(nb).bat_mult };
  };
  const b0 = breaks(false), b1 = breaks(true);
  ok(b0.k >= 15 && b0.k <= 45 && b1.k >= 45 && b1.k <= 75, 'played: about 30 of 120 Glass cards break without Noibat, about 60 with it', [b0.k, b1.k]);
  ok(b0.w === 30 + 20 * b0.k && b1.w === 30 + 20 * b1.k && b1.w > b0.w, 'every break (the extra ones too) grows the Whismur line: +20 Chips each', [b0.w, b1.w]);
  ok(near(b1.nb, 2 * b1.k), 'Noibat banks +2 Mult per break', [b1.nb, b1.k]);
  // the bank scores; Blueprint copies the Mult but never banks
  start('NOIBANK');
  const nb = add('j_poke_noibat');
  let broke = 0;
  for (let i = 0; i < 20 && broke < 2; i++) { const r = play([['S_9', 'm_glass']]); if (r.cards[0].shattered) broke++; }
  ok(broke === 2 && near(ex(nb).bat_mult, 4), '2 breaks: +4 Mult banked', ex(nb).bat_mult);
  let t = play(['S_A']);
  ok(near(t.mult, 1 + 4), 'given every hand', t.total);
  add('j_blueprint'); front(G.jokers.cards[G.jokers.cards.length - 1]);
  for (let i = 0; i < 20; i++) { const r = play([['S_9', 'm_glass']]); if (r.cards[0].shattered) break; }
  ok(near(ex(nb).bat_mult, 6), 'with Blueprint: still +2 a break', ex(nb).bat_mult);
  G.jokers.cards[0].remove(); flush();
  // evolution: Noivern keeps the Mult and banks X0.1 a break; each break turns a deck card Glass
  rounds(5);
  ok(key(nb) === 'j_poke_noivern' && near(ex(nb).bat_mult, 6) && near(ex(nb).bat_Xmult, 1) && G.hand.config.card_limit === 8 + 2, 'Noibat -> Noivern after 5 rounds: keeps +6, X1 to start, +2 hand size', [key(nb), ex(nb).bat_mult, ex(nb).bat_Xmult, G.hand.config.card_limit]);
  const glass0 = deckEnh('m_glass').length;
  let pl = null;
  for (let i = 0; i < 20; i++) { const r = play([['S_9', 'm_glass']]); if (r.cards[0].shattered) { pl = r; break; } }
  ok(pl && near(ex(nb).bat_Xmult, 1.1) && near(ex(nb).bat_mult, 6), 'Noivern: a break banks X0.1 (X1.1), no more Mult', ex(nb));
  ok(deckEnh('m_glass').length === glass0 + 1 && !G.playing_cards.includes(pl.cards[0]), 'the refill: the broken card is gone and a random deck card is Glass now (one more Glass in the deck than before the hand)', [glass0, deckEnh('m_glass').length]);
  t = play(['S_A']);
  ok(near(t.mult, (1 + 6) * 1.1), 'Noivern gives both banks: +6, X1.1', t.total);
  ok(JSON.stringify(probability_vars(cards([['S_3', 'm_glass']])[0], 1, 4, 'glass')) === '[1,2]', 'Noivern: Glass still 1 in 2');
  nb.remove(); flush();
  ok(G.hand.config.card_limit === 8, 'sold: hand size back to 8', G.hand.config.card_limit);
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
  const sw = steps('swirlix', 'mult_mod', 'Fairy', [1.2, 1.4, 1.6]);
  ok(ex(sw).sweet_mult === 0, 'the bank is not raised', ex(sw).sweet_mult);
  const sl = steps('slurpuff', 'mult_mod', 'Fairy', [2.4, 2.8, 3.2]);
  ok(ex(sl).card_limit === 1, 'Slurpuff\'s slot stays +1', ex(sl).card_limit);
  steps('inkay', 'mult', 'Dark', [5.6, 7.2, 8.8]);
  let t = play(['S_2']);
  ok(near(t.mult, 1 + 8.8), 'energized Inkay: +8.8 a low card', t.total);
  steps('binacle', 'chips', 'Earth', [26, 32, 38]);
  steps('barbaracle', 'chips', 'Earth', [26, 32, 38]);
  steps('barbaracle', 'Xmult_multi', 'Earth', [1.365, 1.43, 1.495]);
  t = play(['S_7']);
  ok(t.chips === 5 + 7 + 38 && near(t.mult, 1.495), 'energized Barbaracle: +38, X1.495', t.total);
  steps('skrelp', 'mult', 'Dark', [4.2, 5.4, 6.6]);
  steps('dragalge', 'Xmult_multi', 'Dark', [1.26, 1.32, 1.38]);
  steps('tyrunt', 'mult', 'Dragon', [7, 9, 11]);
  steps('tyrunt', 'Xmult', 'Dragon', [1.5, 1.75, 2]);
  const tr = steps('tyrantrum', 'Xmult2', 'Dragon', [2.4, 2.8, 3.2]);
  ok(ex(tr).retriggers === 1, 'the retrigger stays fixed', ex(tr).retriggers);
  t = play(['S_K', 'H_K', 'D_K', 'C_K']);
  ok(near(t.mult, (7 + 11) * 2 * 3.2), 'energized Tyrantrum, four Kings: (7 + 11) x 2 x 3.2', t.total);
  const am = steps('amaura', 'chips', 'Earth', [52, 64, 76]);
  ok(ex(am).ancient_money === 3, 'the $3 stays fixed', ex(am).ancient_money);
  steps('aurorus', 'Xmult2', 'Earth', [2.4, 2.8, 3.2]);
  const kl = steps('klefki', 'Xmult_mod', 'Metal', [0.3, 0.35, 0.4]);
  G.GAME.used_vouchers.v_grabber = true; G.GAME.used_vouchers.v_wasteful = true;
  t = play(['S_A']);
  ok(near(t.mult, 1.8), 'energized Klefki, 2 Vouchers: X1.8 (every Voucher\'s share raised: it is read, not banked)', t.total);
  void kl;
  steps('phantump', 'mult_mod', 'Grass', [3.6, 4.2, 4.8]);
  steps('trevenant', 'mult_mod', 'Grass', [6, 7, 8]);
  steps('bergmite', 'chips', 'Water', [65, 80, 95]);
  steps('avalugg', 'chips', 'Water', [195, 240, 285]);
  steps('avalugg', 'Xmult', 'Water', [1.8, 2.1, 2.4]);
  const nb = steps('noibat', 'mult_mod', 'Dragon', [2.4, 2.8, 3.2]);
  ok(ex(nb).h_size === 1 && G.hand.config.card_limit === 9, 'Noibat\'s hand size stays +1', [ex(nb).h_size, G.hand.config.card_limit]);
  steps('noivern', 'Xmult_mod', 'Dragon', [0.12, 0.14, 0.16]);
  for (const n of ['spritzee', 'aromatisse', 'malamar', 'hawlucha']) {
    start('ENIN' + n);
    const j = add('j_poke_' + n), before = JSON.stringify(ex(j));
    increment_energy(j, C(n).ptype);
    const after = { ...ex(j) }; delete after.energy_count;
    const b = JSON.parse(before); delete b.energy_count;
    ok(JSON.stringify(after) === JSON.stringify(b), n + ': Energy-inert (nothing changes)', [before, JSON.stringify(ex(j))]);
  }
  // banks keep their worth; Energy carries through the evolution
  start('ENBANK');
  const p = add('j_poke_phantump');
  use('c_hanged_man', cards(['S_A']));
  increment_energy(p, 'Grass');
  use('c_hanged_man', cards(['S_K']));
  ok(near(ex(p).curse_mult, 3 + 3.6), 'Phantump: +3 banked, then energized: +3.6 (the first +3 not raised)', ex(p).curse_mult);
  rounds(5);
  ok(key(p) === 'j_poke_trevenant' && ex(p).energy_count === 1 && near(ex(p).mult_mod, 6) && near(ex(p).curse_mult, 6.6), 'Phantump -> Trevenant keeps the Energy (+6 a card) and the bank', [key(p), ex(p).mult_mod, ex(p).curse_mult]);
});

// ------------------------------------------------------------------- save / resume: the banks, the counts, the converted cards
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'G6B2RES', customDeck: { name: 'Gen 6', mods: ['pokermon'], params: { blind_scaling: 0.05 },
    cards: [['S_K', 0, 0, 0, 12], ['H_9', 'm_glass', 0, 0, 20], ['D_5', 0, 0, 0, 20]],
    jokers: [{ key: 'j_poke_noibat' }, { key: 'j_poke_swirlix' }, { key: 'j_poke_skrelp' }, { key: 'j_poke_tyrunt' }, { key: 'j_poke_malamar' }],
    consumables: [{ key: 'c_hermit', n: 2 }], vouchers: ['v_grabber'] } });
  s.act({ type: 'select_blind' }); flush();
  for (const c of G.consumeables.cards.slice()) { s.act({ type: 'use', id: c.sort_id, targets: [] }); flush(); }
  for (let i = 0; i < 3; i++) {
    const kings = G.hand.cards.filter((c) => c.base.id === 13).slice(0, 3);
    const pick = kings.length >= 3 ? kings : G.hand.cards.slice(0, 5);
    s.act({ type: 'highlight', ids: pick.map((c) => c.sort_id) }); s.act({ type: 'play' }); flush();
    if (G.STATE !== STATES.SELECTING_HAND) break;
  }
  const snap = () => ({
    jokers: G.jokers.cards.map((j) => [key(j), ex(j).bat_mult, ex(j).sweet_mult, ex(j).third_times]),
    deck: G.playing_cards.map((c) => c.base.suit + c.base.id + ':' + key(c)).sort().join(),
    hsize: G.hand.config.card_limit, chips: String(G.GAME.chips), dollars: G.GAME.dollars,
  });
  const want = snap();
  ok(want.jokers.find((j) => j[0] === 'j_poke_swirlix')[2] === 2 && want.hsize === 9 && want.deck.includes('m_poke_hazard'), 'the run: Swirlix +2 banked, +1 hand size, a Hazard in the deck', want);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  const got = snap();
  ok(!r.stoppedAt && JSON.stringify(got) === JSON.stringify(want), 'resume: every bank, count, converted card, hand size and the score come back the same', { want, got });
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
    ok(!bad.length, 'each of the 22 is the type its 3.9.1 card shows', bad);
  });
} else console.log('(Pokermon art not on disk: the art type checks are skipped; set MICATRO_MAIN)');

done();
