// The owner's Cherubi line (2026-10-28; jokers/pokejokers_designs.js "LINE J: Cherubi -> Cherrim"; PORTING.md "The owner's Cherubi line"):
//   Cherubi 420 (Common $5, Grass)   Sweet Seeds: when a Blind is selected, 1 random UNENHANCED card in the full deck becomes a Seed card
//                                    (seeded; none unenhanced, nothing); +1 growth level while owned, so a scored Seed blooms in 3 scores
//                                    instead of 5. Evolves after 2 Seeds bloom into Flowers while it is held ("Bloomed: k/2").
//   Cherrim 421 (Safari $8, Grass)   Sweet Seeds; Flower Gift: Flower cards need only 3+ suits (as Roserade; with both still 3);
//                                    Sunshine Form: while sunny, Flower cards give X2.5 instead of X2 (Overcast otherwise).
//   Sunny = the round's FIRST deal holds Hearts + Diamonds most (Castform's forecast: a tie isn't sunny), for the round; or Groudon is
//   held and working (Desolate Land; not the loser of a Primal Clash; Rayquaza keeps it working). Energy: the Sunshine X (Xmult_multi
//   +5% of base: X2.625 / X2.75 / X2.875), carried from Cherubi through evolution.
// Every ability is FIRED through real rounds with exact numbers.
//   node micatro/tests/mods/pokermon_cherubi_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, play, winRound, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 700)); } };
const ex = (j) => j.ability.extra;
const lines = (j) => JSON.stringify(describe(j));
const enh = (k) => (G.playing_cards || []).filter((c) => c.config.center.key === k).length;
function debuff(j) { j.ability.debuff_sources = { test: true }; j.set_debuff(); return j; }
function back(c) { if (c.area) c.area.remove_card(c); G.hand.emplace(c); return c; }

/** A new run at the blind select, these jokers, then the Blind selected: -> {js, seeds made, plain cards used}. */
function blind(seed, keys, prep) {
  start(seed, {}, { noBlind: true });
  const js = keys.map((k) => add(k));
  if (prep) prep(js);
  const s0 = enh('m_poke_seed'), p0 = enh('c_base');
  act({ type: 'select_blind' }); flush();
  return { js, seeds: enh('m_poke_seed') - s0, plain: p0 - enh('c_base') };
}
/** Spec 'H_K' -> a plain card in `area`. */
const mk = (k, area) => create_playing_card({ front: P_CARDS[k], center: P_CENTERS.c_base }, area);
/** Make the deck exactly these cards (the rest wait in the discard pile), so the blind's first deal is exactly them. */
function stackDeck(specs) {
  for (const c of G.deck.cards.slice()) { G.deck.remove_card(c); G.discard.emplace(c); }
  return specs.map((s) => mk(s, G.deck));
}
const RED = ['H_2', 'D_3', 'H_4', 'C_5', 'C_6', 'S_7', 'S_8', 'D_9'];    // red 4, Clubs 2, Spades 2 -> sunny
const CLUBS = ['C_2', 'C_3', 'C_4', 'H_5', 'S_6', 'D_7', 'S_8', 'C_9'];  // Clubs 4 -> not sunny
const TIE = ['H_2', 'H_3', 'D_4', 'C_5', 'C_6', 'C_7', 'S_8', 'S_9'];    // red 3 = Clubs 3 -> a tie: not sunny
/** A new run whose first blind's first deal is `specs`, with these jokers. -> the jokers */
function deal(seed, specs, jokers, prep) {
  start(seed, {}, { noBlind: true });
  const js = jokers.map((k) => add(k));
  if (prep) prep(js);
  stackDeck(specs);
  act({ type: 'select_blind' }); flush();
  return js;
}
/** Play a Straight 5-9 (or 6-T) holding a Flower card first, with these suits: -> the hand total. Base: Straight 30 Chips x 4 Mult. */
function flowerStraight(suits, ranks = ['5', '6', '7', '8', '9']) {
  clearHand();
  const cards = ranks.map((r, i) => create_playing_card({ front: P_CARDS[suits[i] + '_' + r], center: P_CENTERS[i === 0 ? 'm_poke_flower' : 'c_base'] }, G.hand));
  return play(cards).total;
}
const S3 = ['D', 'S', 'C', 'S', 'S'];   // 3 suits, one red card (the Flower, a Diamond)
const S4 = ['D', 'S', 'C', 'H', 'S'];   // 4 suits
const S2 = ['D', 'S', 'D', 'S', 'S'];   // 2 suits

// ------------------------------------------------------------------- pin, static data, order, family, art cells, precedence
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 34 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 34+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of ['cherubi', 'cherrim']) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs');
  }
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== 'assets') walk(p); } else if (/\.(js|json|lua)$/.test(f.name) && /cherubi|cherrim/i.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has Cherubi / Cherrim (precedence: nothing to dedupe)', hits);
});
sec('static', () => {
  start('CHERUBI0');
  const a = P_CENTERS.j_poke_cherubi, b = P_CENTERS.j_poke_cherrim;
  ok(a.rarity === 1 && a.cost === 5 && a.stage === 'Basic' && a.ptype === 'Grass' && a.gen === 4, 'Cherubi: Common $5, Basic, Grass, Gen 4', [a.rarity, a.cost, a.stage, a.ptype]);
  ok(b.rarity === 'poke_safari' && b.cost === 8 && b.stage === 'One' && b.ptype === 'Grass' && b.gen === 4, 'Cherrim: Safari $8, Stage 1, Grass, Gen 4', [b.rarity, b.cost, b.stage, b.ptype]);
  ok(a.config.evo_rqmt === 2 && poke_get_family_list('cherubi').join() === 'cherubi,cherrim', 'one family; Cherubi evolves after 2 blooms', poke_get_family_list('cherubi'));
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_cherubi');
  ok(i > 0 && keys[i - 1] === 'j_poke_floatzel' && keys[i + 1] === 'j_poke_cherrim', 'Pokédex order: Floatzel (419), Cherubi, Cherrim', keys.slice(i - 1, i + 3));
  ok(a.atlas === 'poke_AtlasJokersBasicNatdex391' && a.pos.x === 28 && a.pos.y === 27, 'Cherubi art: upstream 3.9.1 Natdex {28,27}', [a.atlas, a.pos]);
  ok(b.atlas === 'poke_AtlasJokersBasicGen04391' && b.pos.x === 0 && b.pos.y === 1, 'Cherrim art: upstream 3.9.1 Gen 4 {0,1} (Overcast)', [b.atlas, b.pos]);
  ok(pool_filter(a, 'Joker') === undefined && a.in_pool(a) !== false, 'Cherubi can be rolled in the shop (Common)');
  ok(energy_values.Xmult_multi === 0.05 && !('growth' in energy_values) && !('suits' in energy_values) && !('seeds_bloomed' in energy_values),
    'Energy: only the Sunshine X (Xmult_multi +5%); the growth, the 3 suits and the bloom count are fixed');
});

// ------------------------------------------------------------------- Sweet Seeds: one unenhanced card per Blind becomes a Seed
sec('seed conversion', () => {
  let r = blind('CHS1', ['j_joker']);
  ok(r.seeds === 0, 'no Cherubi: no Seed made', r.seeds);
  r = blind('CHS1', ['j_poke_cherubi']);
  ok(r.seeds === 1 && r.plain === 1, 'Cherubi: 1 unenhanced card became a Seed when the Blind was selected', r);
  const first = G.playing_cards.find((c) => key(c) === 'm_poke_seed');
  r = blind('CHS1', ['j_poke_cherubi']);
  const again = G.playing_cards.find((c) => key(c) === 'm_poke_seed');
  ok(first && again && first.base.suit === again.base.suit && first.base.value === again.base.value, 'seeded: the same run seed picks the same card', [first && first.base, again && again.base]);
  r = blind('CHS2', ['j_poke_cherubi', 'j_blueprint'], (js) => { G.jokers.remove_card(js[1]); G.jokers.emplace(js[1], 0); });
  ok(r.seeds === 2, 'a Blueprint copying it makes a second Seed (Marble Joker\'s moment)', r.seeds);
  r = blind('CHS3', ['j_poke_cherrim']);
  ok(r.seeds === 1, 'Cherrim keeps Sweet Seeds: 1 Seed per Blind', r.seeds);
  // only unenhanced cards: a deck with none left gets nothing (it never overwrites)
  r = blind('CHS4', ['j_poke_cherubi'], () => { for (const c of G.playing_cards) c.set_ability(P_CENTERS.m_bonus, null, true); });
  ok(r.seeds === 0 && enh('m_bonus') === G.playing_cards.length, 'no unenhanced card: nothing happens (no Bonus card overwritten)', r);
  r = blind('CHS5', ['j_poke_cherubi'], () => { const ps = G.playing_cards; for (let k = 1; k < ps.length; k++) ps[k].set_ability(P_CENTERS.m_glass, null, true); });
  ok(r.seeds === 1 && key(G.playing_cards[0]) === 'm_poke_seed', 'the one unenhanced card left is the one that becomes a Seed', key(G.playing_cards[0]));
  // every Blind: three rounds, three Seeds
  start('CHS6', {}, { noBlind: true });
  add('j_poke_cherubi');
  let made = 0;
  for (let k = 0; k < 3; k++) {
    const s0 = enh('m_poke_seed');
    act({ type: 'select_blind' }); flush();
    made += enh('m_poke_seed') - s0;
    clearHand(); winRound(); flush();
    if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
    if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
    G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  }
  ok(made === 3, 'one Seed per Blind, every Blind (3 Blinds: 3 Seeds)', made);
});

// ------------------------------------------------------------------- the extra growth: a Seed blooms in 3 scores
function growSeed(jokers) {
  start('CHG' + jokers.join(''));
  const js = jokers.map((k) => add(k));
  const [s] = hand(['S_A'], { center: 'm_poke_seed' });
  const levels = [];
  let money = G.GAME.dollars, paid = 0, n = 0;
  while (key(s) === 'm_poke_seed' && n < 8) {
    back(s); play([s]); flush(); n++;
    levels.push(key(s) === 'm_poke_seed' ? s.ability.extra.level : 'flower');
  }
  paid = G.GAME.dollars - money;
  return { js, s, n, levels, paid };
}
sec('growth', () => {
  let r = growSeed(['j_joker']);
  ok(r.n === 5 && r.levels.join() === '1,2,3,4,flower' && r.paid === 15, 'no Cherubi: a Seed blooms on its 5th score (and earns $15)', r.levels);
  r = growSeed(['j_poke_cherubi']);
  ok(G.GAME.poke_growth_level === 1, 'Cherubi: +1 growth level while owned', G.GAME.poke_growth_level);
  ok(r.n === 3 && r.levels.join() === '2,4,flower' && key(r.s) === 'm_poke_flower' && r.paid === 15, 'Cherubi: it grows 2 a score and blooms on the 3rd (still $15)', r.levels);
  r = growSeed(['j_poke_cherrim']);
  ok(r.n === 3 && r.levels.join() === '2,4,flower', 'Cherrim keeps it: a bloom in 3 scores', r.levels);
  // sold: back to 5; debuffed: no growth (SMODS removes a debuffed joker's add_to_deck effects)
  start('CHG2');
  const c = add('j_poke_cherubi');
  ok(G.GAME.poke_growth_level === 1, 'owned: growth level 1', G.GAME.poke_growth_level);
  debuff(c); flush();
  ok(G.GAME.poke_growth_level === 0, 'debuffed: growth level 0', G.GAME.poke_growth_level);
  c.ability.debuff_sources = {}; c.set_debuff(); flush();
  ok(!c.debuff && G.GAME.poke_growth_level === 1, 'undebuffed: 1 again', G.GAME.poke_growth_level);
  c.remove(); flush();
  ok(G.GAME.poke_growth_level === 0, 'sold / removed: 0', G.GAME.poke_growth_level);
  // it stacks with Shiftry (+1 each): 3 growth a score, a bloom on the 2nd
  r = growSeed(['j_poke_cherubi', 'j_poke_shiftry']);
  ok(G.GAME.poke_growth_level === 2 && r.n === 2 && r.levels.join() === '3,flower', 'with Shiftry: growth level 2, a bloom in 2 scores', [G.GAME.poke_growth_level, r.levels]);
});

// ------------------------------------------------------------------- evolution: after 2 Seeds bloom while held
sec('evolution', () => {
  start('CHE1');
  const c = add('j_poke_cherubi');
  G.consumeables.config.card_limit = 10;
  increment_energy(c, 'Grass'); increment_energy(c, 'Grass');
  ok(ex(c).energy_count === 2 && near(ex(c).Xmult_multi, 2.75), 'Energy on Cherubi: its banked Sunshine X 2.5 -> 2.75 (2 Grass Energy)', ex(c));
  ok(/Bloomed: 0\/2/.test(lines(c)) && /X2\.75/.test(lines(c)), 'tooltip: "Bloomed: 0/2" and the Sunshine X it carries', lines(c).slice(0, 900));
  const [s1] = hand(['S_A'], { center: 'm_poke_seed' });
  for (let k = 0; k < 3; k++) { back(s1); play([s1]); flush(); }
  ok(key(s1) === 'm_poke_flower' && ex(c).seeds_bloomed === 1 && /Bloomed: 1\/2/.test(lines(c)), 'one Seed bloomed: "Bloomed: 1/2"', [key(s1), ex(c).seeds_bloomed]);
  // a round ends with 1 bloom: no evolution
  clearHand(); winRound(); flush();
  ok(key(c) === 'j_poke_cherubi', 'after 1 bloom it does not evolve at end of round', key(c));
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush(); clearHand();
  // a Flower doesn't count again; a debuffed Cherubi doesn't count a bloom
  debuff(c); flush();
  const [s2] = hand(['H_A'], { center: 'm_poke_seed' });
  for (let k = 0; k < 5; k++) { back(s2); play([s2]); flush(); }
  ok(key(s2) === 'm_poke_flower' && ex(c).seeds_bloomed === 1, 'a bloom while Cherubi is debuffed does not count (5 scores without its growth too)', [key(s2), ex(c).seeds_bloomed]);
  c.ability.debuff_sources = {}; c.set_debuff(); flush();
  const [s3] = hand(['D_A'], { center: 'm_poke_seed' });
  for (let k = 0; k < 3; k++) { back(s3); play([s3]); flush(); }
  ok(ex(c).seeds_bloomed === 2 && /Bloomed: 2\/2/.test(lines(c)), 'the second bloom: "Bloomed: 2/2"', ex(c).seeds_bloomed);
  clearHand(); winRound(); flush();
  ok(key(c) === 'j_poke_cherrim', 'after 2 blooms it evolves into Cherrim at end of round', key(c));
  ok(ex(c).energy_count === 2 && near(ex(c).Xmult_multi, 2.75), 'Energy carried through evolution: Cherrim\'s Sunshine X 2.75', ex(c));
  ok(G.GAME.poke_growth_level === 1, 'the growth level stays 1 across the evolution (Cherubi\'s removed, Cherrim\'s added)', G.GAME.poke_growth_level);
});

// ------------------------------------------------------------------- Flower Gift: 3 suits; Sunshine X2.5 / Overcast X2 (the first deal)
sec('flower gift', () => {
  start('CHF0');
  let t = flowerStraight(S3);
  ok(near(t.mult, 4), 'no Cherrim: a Flower in a 3-suit Straight gives nothing (needs 4 suits): 4 Mult', t);
  t = flowerStraight(S4);
  ok(near(t.mult, 8), 'no Cherrim: 4 suits, X2: 8 Mult', t);
  const [cr] = deal('CHF1', CLUBS, ['j_poke_cherrim']);
  ok(ex(cr).sun_round !== G.GAME.round && /Overcast/.test(lines(cr)), 'a Clubs first deal: Overcast', lines(cr).slice(0, 600));
  t = flowerStraight(S3);
  ok(near(t.mult, 8), 'Cherrim (Overcast): a 3-suit Straight\'s Flower gives X2: 8 Mult', t);
  t = flowerStraight(S2);
  ok(near(t.mult, 4), 'Cherrim: 2 suits still nothing: 4 Mult', t);
  debuff(cr);
  t = flowerStraight(S3);
  ok(near(t.mult, 4), 'a debuffed Cherrim: back to 4 suits (4 Mult)', t);
});
sec('sunshine', () => {
  const [cr] = deal('CHU1', RED, ['j_poke_cherrim']);
  ok(ex(cr).sun_round === G.GAME.round, 'a red first deal (Hearts + Diamonds held most): sunny for the round', ex(cr));
  let t = flowerStraight(S3);
  ok(near(t.mult, 4 * 2.5), 'Sunshine: the Flower gives X2.5 instead of X2: 10 Mult (exact)', t);
  t = flowerStraight(S4);
  ok(near(t.mult, 10), 'Sunshine with 4 suits too: 10', t);
  ok(/Sunshine/.test(lines(cr)) && /X2\.5/.test(lines(cr)), 'tooltip: "Currently Sunshine", X2.5', lines(cr).slice(0, 700));
  // later hands of the round stay sunny (the deal is read once)
  t = flowerStraight(S3);
  ok(near(t.mult, 10), 'the whole round stays sunny', t);
  // the art: the Sunshine card on the Gen 4 sheet {2,1}
  const v = {}; view_card(cr, v);
  const face = POKE_UI.face({ center: 'j_poke_cherrim', facing: 'front', poke: v.poke, atlas: P_CENTERS.j_poke_cherrim.atlas, pos: P_CENTERS.j_poke_cherrim.pos }, { area: 'jokers' });
  ok(v.poke && v.poke.form === 'sunshine' && face && face.atlas === 'poke_AtlasJokersBasicGen04391' && face.pos.x === 2 && face.pos.y === 1, 'Sunshine: drawn as its 3.9.1 Gen 4 card {2,1}', [v.poke, face]);
  // next round on a Clubs deal: Overcast again
  clearHand(); winRound(); flush();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  const v2 = {}; view_card(cr, v2);
  ok(v2.poke.form === 'overcast' && POKE_UI.face({ center: 'j_poke_cherrim', facing: 'front', poke: v2.poke, atlas: P_CENTERS.j_poke_cherrim.atlas, pos: P_CENTERS.j_poke_cherrim.pos }, { area: 'jokers' }) === null,
    'in the shop: Overcast, its own card', v2.poke);
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  stackDeck(CLUBS);
  act({ type: 'select_blind' }); flush();
  t = flowerStraight(S3);
  ok(near(t.mult, 8), 'next round, a Clubs deal: Overcast, X2 (8)', t);
  // a tie (red 3 = Clubs 3) is not sunny
  deal('CHU2', TIE, ['j_poke_cherrim']);
  t = flowerStraight(S3);
  ok(near(t.mult, 8), 'a tie for the most (3 red, 3 Clubs) is not sunny: X2 (8)', t);
  // Shaymin's +1 still stacks on top of the Sunshine X: X3.5
  deal('CHU3', RED, ['j_poke_cherrim', 'j_poke_shaymin']);
  t = flowerStraight(S3);
  ok(near(t.mult, 4 * 3.5 * 3.5), 'with Shaymin (first hand: it makes the last scoring card a Flower too): two Flowers at X2.5 + 1 = X3.5 each (49)', t);
  t = flowerStraight(S3);
  ok(near(t.mult, 4 * 3.5), 'with Shaymin, the next hand: X2.5 + 1 = X3.5 (14 Mult)', t);
});

// ------------------------------------------------------------------- Groudon (Desolate Land) makes it sunny
sec('groudon', () => {
  ok(!!P_CENTERS.j_poke_groudon, 'Groudon is in the game (tested against the real joker)');
  // a Clubs deal, Groudon held: sunny. The Straight has one red card (the Diamond Flower): Groudon's own X1.25 on it too.
  deal('CHGR1', CLUBS, ['j_poke_cherrim']);
  let t = flowerStraight(S3);
  ok(near(t.mult, 8), 'control: Clubs deal, no Groudon: 8', t);
  const [cr] = deal('CHGR2', CLUBS, ['j_poke_cherrim', 'j_poke_groudon']);
  t = flowerStraight(S3);
  ok(near(t.mult, 4 * 2.5 * 1.25), 'Groudon held: sunny on a Clubs deal: X2.5 (x Groudon\'s X1.25 on the Diamond): 12.5', t);
  ok(/Sunshine/.test(lines(cr)), 'tooltip: Sunshine', lines(cr).slice(0, 500));
  const gr = G.jokers.cards.find((j) => key(j) === 'j_poke_groudon');
  gr.remove(); flush();
  t = flowerStraight(S3);
  ok(near(t.mult, 8) && /Overcast/.test(lines(cr)), 'Groudon sold mid-round: Overcast at once (8)', t);
  // Groudon gained mid-round: sunny at once
  add('j_poke_groudon');
  t = flowerStraight(S3);
  ok(near(t.mult, 12.5), 'a Groudon gained mid-round: sunny at once (12.5)', t);
  // in the shop with Groudon: Sunshine
  clearHand(); winRound(); flush();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  const v = {}; view_card(cr, v);
  ok(v.poke.form === 'sunshine', 'in the shop with Groudon: Sunshine form', v.poke);
  // a debuffed Groudon: no sun
  deal('CHGR3', CLUBS, ['j_poke_cherrim', 'j_poke_groudon'], (js) => debuff(js[1]));
  t = flowerStraight(S3);
  ok(near(t.mult, 8), 'a debuffed Groudon makes no sun: 8', t);
  // Primal Clash: Kyogre wins a Clubs deal, Groudon does nothing that round: no sun
  deal('CHGR4', CLUBS, ['j_poke_cherrim', 'j_poke_kyogre', 'j_poke_groudon']);
  ok(G.GAME.poke_primal && G.GAME.poke_primal.winner === 'kyogre', 'Kyogre wins the Clubs deal\'s clash', G.GAME.poke_primal);
  t = flowerStraight(S3);
  ok(near(t.mult, 8), 'Groudon lost the Primal Clash: no Desolate Land, no sun: X2 (8)', t);
  // Groudon wins a red deal's clash: sunny (both ways)
  deal('CHGR5', RED, ['j_poke_cherrim', 'j_poke_kyogre', 'j_poke_groudon']);
  t = flowerStraight(S3);
  ok(near(t.mult, 12.5), 'Groudon wins a red deal: sunny (12.5)', t);
  // Rayquaza (Delta Stream) keeps Groudon working: still sunny on a Clubs deal
  deal('CHGR6', CLUBS, ['j_poke_cherrim', 'j_poke_kyogre', 'j_poke_groudon', 'j_poke_rayquaza']);
  t = flowerStraight(S3);
  ok(near(t.mult, 12.5 * 1.2), 'Rayquaza calms the clash; Groudon still works, so still sunny (12.5; x Rayquaza\'s Dragon Ascent X1.2 on the Straight: 15)', t);
});

// ------------------------------------------------------------------- Energy: the Sunshine X at the per-card rate
sec('energy', () => {
  const [cr] = deal('CHN1', RED, ['j_poke_cherrim']);
  const want = [2.625, 2.75, 2.875];
  for (let k = 0; k < 3; k++) {
    increment_energy(cr, 'Grass');
    ok(ex(cr).energy_count === k + 1 && near(ex(cr).Xmult_multi, want[k]), `${k + 1} Grass Energy: Sunshine X${want[k]}`, ex(cr));
  }
  let t = flowerStraight(S3);
  ok(near(t.mult, 4 * 2.875), 'energized Sunshine Flower: 4 x 2.875 = 11.5 Mult', t);
  ok(ex(cr).suits === 3 && ex(cr).growth === 1, 'the 3 suits and the growth stay fixed', ex(cr));
  // Overcast: Energy doesn't touch the X2 (a Clubs deal)
  const [c2] = deal('CHN2', CLUBS, ['j_poke_cherrim']);
  increment_energy(c2, 'Grass'); increment_energy(c2, 'Grass'); increment_energy(c2, 'Grass');
  t = flowerStraight(S3);
  ok(near(t.mult, 8), 'Overcast: the Flower stays X2 however energized (8)', t);
  // Colorless Energy: half (+2.5%)
  const [c3] = deal('CHN3', RED, ['j_poke_cherrim']);
  increment_energy(c3, 'Colorless');
  ok(ex(c3).c_energy_count === 1 && near(ex(c3).Xmult_multi, 2.5625), 'Colorless Energy: half strength, X2.5625', ex(c3));
});

// ------------------------------------------------------------------- no stacking with Roserade
sec('roserade', () => {
  // the Flower's first scoring card is even (a 6): Roserade's odd retrigger never touches it
  const R3 = ['D', 'S', 'C', 'S', 'S'], R2 = ['D', 'S', 'D', 'S', 'S'], RK = ['6', '7', '8', '9', 'T'];
  start('CHR1');
  add('j_poke_roserade');
  let t = flowerStraight(R3, RK);
  ok(near(t.mult, 8), 'Roserade alone: 3 suits, X2 (8)', t);
  deal('CHR2', CLUBS, ['j_poke_roserade', 'j_poke_cherrim']);
  t = flowerStraight(R3, RK);
  ok(near(t.mult, 8), 'Roserade + Cherrim: still 3 suits, X2 (8)', t);
  t = flowerStraight(R2, RK);
  ok(near(t.mult, 4), 'Roserade + Cherrim: NOT 2 suits (no stacking): 4', t);
  deal('CHR3', RED, ['j_poke_roserade', 'j_poke_cherrim']);
  t = flowerStraight(R3, RK);
  ok(near(t.mult, 10), 'with Roserade, sunny: X2.5 (10)', t);
});

// ------------------------------------------------------------------- the art on disk + text
sec('text', () => {
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  const txt = (k) => J[k].text.join(' ');
  ok(/Sweet Seeds/.test(txt('j_poke_cherubi')) && /Bloomed: #2#\/#3#/.test(txt('j_poke_cherubi')), 'Cherubi: Sweet Seeds and the "Bloomed: k/2" line');
  ok(['j_poke_cherrim', 'j_poke_cherrim_sunshine'].every((k) => /Flower Gift/.test(txt(k)) && /Sunshine Form/.test(txt(k)) && /Sweet Seeds/.test(txt(k))), 'Cherrim: Sweet Seeds, Flower Gift, Sunshine Form');
  ok(/Overcast/.test(txt('j_poke_cherrim')) && /poke_sun\}Sunshine/.test(txt('j_poke_cherrim_sunshine')), 'its two forms\' state lines (Overcast / Sunshine)');
});
if (ART && !P_CENTERS.j_poke_cherrim) ok(false, 'art: Cherrim is not registered');
else if (ART) {
  const ATL = MODS.pokermon.content.atlases;
  const want = {};
  const cell = (atlas, pos, id) => { const file = decodeURIComponent(ATL[atlas].src).replace(/^.*\/assets\/2x\//, ''); (want[file] || (want[file] = {}))[id] = [pos.x * 142, pos.y * 190, 142, 190]; };
  const b = P_CENTERS.j_poke_cherrim;
  cell(b.atlas, b.pos, 'overcast'); cell(b.atlas, { x: 2, y: 1 }, 'sunshine');
  cell(b.atlas.replace(/391$/, 'Shiny391'), { x: 2, y: 1 }, 'sunshine_shiny');
  cell(P_CENTERS.j_poke_cherubi.atlas, P_CENTERS.j_poke_cherubi.pos, 'cherubi');
  const px = {};
  for (const [file, rects] of Object.entries(want)) Object.assign(px, await crops(path.join(ART, file), rects));
  const opaque = (r) => { let k = 0; for (let i = 3; i < r.px.length; i += 4) if (r.px[i] > 0) k++; return k / (r.px.length / 4); };
  const hash = (r) => { let h = 0; for (let i = 0; i < r.px.length; i += 97) h = (h * 31 + r.px[i]) >>> 0; return h; };
  const all = ['cherubi', 'overcast', 'sunshine', 'sunshine_shiny'].map((f) => px[f]);
  ok(all.every((r) => r && r.inside && opaque(r) > 0.5) && new Set(all.map(hash)).size === 4, 'art: Cherubi, Cherrim Overcast / Sunshine and its Shiny twin are real, distinct 3.9.1 pictures', all.map((r) => r && opaque(r)));
} else console.log('(Pokermon art not on disk: the sprite checks are skipped; set MICATRO_MAIN)');

done();
