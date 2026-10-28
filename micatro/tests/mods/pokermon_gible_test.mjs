// The owner's Gible line (2026-10-28; jokers/pokejokers_designs.js bite / treasure_nest / dragon_rush_x; PORTING.md "The owner's Gible line"):
// bite -> hoard -> cash in.
//   Gible 443 (Basic, Dragon, Uncommon $6)   Bite: when a hand containing a Pair scores, it permanently gains +1 Mult for each scored card
//                                            (banked in bite_mult; it gives the bank every hand). Evolves at +25 banked Mult.
//   Gabite 444 (Stage 1, Dragon, Safari $8)  Keeps (and keeps growing) the bank. Treasure Nest: when a hand containing a Full House scores,
//                                            one of its scored cards becomes a Gold card (after scoring; unenhanced cards first, else any
//                                            non-Gold one; seeded). Evolves with 6 Gold cards in the full deck (any Gold card counts).
//   Garchomp 445 (Stage 2, Dragon, Safari $10) The bank, and Dragon Rush: X(1 + 0.5 per Gold card held in hand); a debuffed one doesn't count.
//   Energy: mult_mod +20% (1 -> 1.2 / 1.4 / 1.6 a card), Xmult_mod +20% (0.5 -> 0.6 / 0.7 / 0.8); never retroactive; carried through
//   evolution; the conversion is fixed. Blueprint copies the Mult / X, never the bank's growth or the Gold conversion.
// Every ability is FIRED through real hands with exact numbers.
//   node micatro/tests/mods/pokermon_gible_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, state } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
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
const LINE = ['gible', 'gabite', 'garchomp'];
const isGold = (c) => c.config.center.key === 'm_gold';
const deckGold = () => G.playing_cards.filter(isGold).length;
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); return c; }
/** Play exactly these cards (held: cards left in hand, with their own centers). The round never ends by accident. -> {cards, total, events}. */
function play(keys, { center, held = [], heldCenter = 'm_gold', debuffPlayed = [], debuffHeld = [] } = {}) {
  clearHand();
  const hs = held.length ? hand(held, { center: heldCenter }) : [];
  const cs = hand(keys, center ? { center } : {});
  for (const i of debuffPlayed) debuff(cs[i]);
  for (const i of debuffHeld) debuff(hs[i]);
  G.GAME.chips = 0; if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const events = (r && r.events) || [];
  return { cards: cs, held: hs, events, total: events.find((e) => e.type === 'hand_total'), name: (events.find((e) => e.type === 'hand_total') || {}).hand };
}
function fresh(seed, jokers) { start(seed); return jokers.map((k) => add(k.startsWith('j_') ? k : 'j_poke_' + k)); }
/** Win the round with a High Card (no Pair: no bite), cash out, and select the next Blind. */
function nextRound() {
  clearHand();
  const c = hand(['S_2']);
  G.GAME.blind.chips = 1; G.GAME.chips = 1;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) });
  act({ type: 'play' }); flush();
  if (state() === 'ROUND_EVAL') act({ type: 'cash_out' });
  if (state() === 'SHOP') act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  clearHand();
}
const PAIR = ['S_5', 'H_5'];
const TWO_PAIR = ['S_5', 'H_5', 'S_9', 'H_9', 'C_2'];
const TRIPS = ['S_5', 'H_5', 'D_5'];
const FULL_HOUSE = ['S_5', 'H_5', 'D_5', 'S_9', 'H_9'];
const QUADS = ['S_5', 'H_5', 'D_5', 'C_5', 'H_2'];
const HIGH = ['S_2'];
const STRAIGHT = ['S_3', 'H_4', 'D_5', 'C_6', 'S_7'];
const FLUSH = ['S_2', 'S_4', 'S_7', 'S_9', 'S_K'];

// ------------------------------------------------------------------- pin, static data, order, family, precedence
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 43 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 43+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of LINE) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && /gible|gabite|garchomp/i.test(fs.readFileSync(p, 'utf8').replace(/eligible/gi, ''))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has Gible / Gabite / Garchomp (precedence: nothing to dedupe)', hits);
});
await sec('static', () => {
  start('GIBLE0');
  const [g, b, c] = LINE.map((n) => P_CENTERS['j_poke_' + n]);
  ok(g && g.rarity === 2 && g.cost === 6 && g.stage === 'Basic' && g.ptype === 'Dragon' && g.gen === 4 && g.config.evo_rqmt === 25 && g.config.extra.mult_mod === 1 && g.config.extra.bite_mult === 0 && g.blueprint_compat,
    'Gible: Uncommon $6, Basic, Dragon, Gen 4, +1 a card, evolves at +25', g && [g.rarity, g.cost, g.stage, g.ptype, g.config]);
  ok(b && b.rarity === 'poke_safari' && b.cost === 8 && b.stage === 'One' && b.ptype === 'Dragon' && b.config.evo_rqmt === 6 && b.config.extra.mult_mod === 1 && b.blueprint_compat,
    'Gabite: Safari $8, Stage 1, Dragon, +1 a card, evolves at 6 Gold cards', b && [b.rarity, b.cost, b.stage, b.ptype, b.config]);
  ok(c && c.rarity === 'poke_safari' && c.cost === 10 && c.stage === 'Two' && c.ptype === 'Dragon' && c.config.extra.Xmult_mod === 0.5 && !('evo_rqmt' in c.config) && c.blueprint_compat,
    'Garchomp: Safari $10, Stage 2, Dragon, X0.5 a held Gold card, no evolution', c && [c.rarity, c.cost, c.stage, c.ptype, c.config]);
  ok(LINE.every((n) => (P_CENTERS['j_poke_' + n].poke_custom_values_to_keep || []).includes('bite_mult')), 'every stage keeps bite_mult through evolution');
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_gible');
  ok(i > 0 && keys[i - 1] === 'j_poke_spiritomb' && keys[i + 1] === 'j_poke_gabite' && keys[i + 2] === 'j_poke_garchomp' && keys[i + 3] === 'j_poke_munchlax',
    'Pokédex order: Spiritomb (442), Gible, Gabite, Garchomp, Munchlax (446)', keys.slice(i - 1, i + 4));
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
  ok(fam('gible') === 'gible,gabite,garchomp' && fam('garchomp') === fam('gible'), 'one family: Gible, Gabite, Garchomp', fam('gible'));
  ok(g.atlas === 'poke_AtlasJokersBasicNatdex391' && b.atlas === g.atlas && c.atlas === g.atlas && g.pos.x === 14 && b.pos.x === 16 && c.pos.x === 18 && [g, b, c].every((x) => x.pos.y === 29),
    'art: upstream 3.9.1\'s own cells (Natdex {14,29} / {16,29} / {18,29}; nothing to deploy)', [g.atlas, g.pos, b.pos, c.pos]);
  ok(pool_filter(g, 'Joker') === undefined && g.in_pool(g) !== false, 'Gible can be rolled in the shop (Uncommon)');
  ok(near(energy_values.mult_mod, 0.2) && near(energy_values.Xmult_mod, 0.2) && !('bite_mult' in energy_values), 'Energy: mult_mod / Xmult_mod +20%; the bank (bite_mult) in no energy field');
});

// ------------------------------------------------------------------- Gible: Bite, +1 per scored card on a hand containing a Pair
await sec('bite', () => {
  const [g] = fresh('GIB1', ['gible']);
  const seen = [];
  const step = (cards, label) => { const before = ex(g).bite_mult; const r = play(cards); seen.push([label, r.name, r3(ex(g).bite_mult - before), r.total && r.total.mult]); return r; };
  const r3 = (x) => Math.round(x * 1000) / 1000;
  step(HIGH, 'high');
  step(STRAIGHT, 'straight');
  step(FLUSH, 'flush');
  ok(ex(g).bite_mult === 0, 'High Card, Straight, Flush (no Pair): nothing banked', seen);
  let r = step(PAIR, 'pair');
  ok(ex(g).bite_mult === 2 && r.total.mult === 2 + 2, 'Pair: +2 (2 scored cards), given the same hand (Pair 2 Mult + 2)', seen.at(-1));
  step(TWO_PAIR, 'two pair');
  ok(ex(g).bite_mult === 6, 'Two Pair: +4 (the kicker does not score)', seen.at(-1));
  step(TRIPS, 'trips');
  ok(ex(g).bite_mult === 9, 'Three of a Kind: +3 (it contains a Pair)', seen.at(-1));
  step(FULL_HOUSE, 'full house');
  ok(ex(g).bite_mult === 14, 'Full House: +5', seen.at(-1));
  step(QUADS, 'quads');
  ok(ex(g).bite_mult === 18, 'Four of a Kind: +4 (kicker unscored; it contains a Pair)', seen.at(-1));
  r = step(HIGH, 'high again');
  ok(ex(g).bite_mult === 18 && r.total.mult === 1 + 18, 'a High Card banks nothing but gets the bank: 1 + 18 Mult', seen.at(-1));
  // a debuffed scored card is not "scored"
  const [d] = fresh('GIB2', ['gible']);
  play(TRIPS, { debuffPlayed: [2] });
  ok(ex(d).bite_mult === 2, 'Three of a Kind with one card debuffed: +2', ex(d).bite_mult);
  // a debuffed Gible does nothing
  const [x] = fresh('GIB3', ['gible']);
  debuff(x);
  play(PAIR);
  ok(ex(x).bite_mult === 0, 'a debuffed Gible banks nothing', ex(x).bite_mult);
});

// ------------------------------------------------------------------- Gible -> Gabite at +25 banked Mult
await sec('evolve gible', () => {
  const [g] = fresh('GIBEV', ['gible']);
  ex(g).bite_mult = 20;
  play(QUADS); // 24
  ok(ex(g).bite_mult === 24 && /Evolves at \+24 \/ \+25 Mult/.test(plain(g)), 'at +24: the progress line says +24 / +25', plain(g));
  nextRound();
  ok(key(g) === 'j_poke_gible', 'at +24 it does not evolve at end of round', key(g));
  play(PAIR); // 26
  nextRound();
  ok(key(g) === 'j_poke_gabite' && ex(g).bite_mult === 26, 'at +26 (>= 25) it evolves into Gabite at end of round, keeping the bank (+26)', [key(g), ex(g)]);
});

// ------------------------------------------------------------------- Gabite: keeps biting; Treasure Nest
await sec('treasure nest', () => {
  const [b] = fresh('GAB1', ['gabite']);
  ex(b).bite_mult = 10;
  const g0 = deckGold();
  let r = play(FULL_HOUSE);
  const golds = r.cards.filter(isGold);
  ok(r.name === 'Full House' && golds.length === 1 && deckGold() === g0 + 1, 'a Full House: exactly one scored card becomes Gold', [r.name, golds.length, deckGold() - g0]);
  ok(ex(b).bite_mult === 15 && r.total.mult === 4 + 15, 'Gabite keeps biting: +5 (bank 15), given that hand (Full House 4 Mult + 15)', [ex(b).bite_mult, r.total && r.total.mult]);
  // unenhanced first: four Bonus cards and one plain one -> always the plain one (several seeds)
  const picks = [];
  for (const [n, seed] of [0, 1, 2, 3, 4].map((n) => [n, 'GABP' + n])) {
    fresh(seed, ['gabite']);
    clearHand();
    const cs = hand(FULL_HOUSE, { center: 'm_bonus' });
    cs[n].set_ability(P_CENTERS.c_base, null, true);
    G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
    act({ type: 'highlight', ids: cs.map((c) => c.sort_id) }); act({ type: 'play' }); flush();
    picks.push([n, cs.map((c) => c.config.center.key.replace('m_', '').replace('c_base', 'base')).join()]);
  }
  ok(picks.every(([n, s]) => s.split(',')[n] === 'gold' && s.split(',').filter((k) => k === 'gold').length === 1 && s.split(',').filter((k) => k === 'bonus').length === 4),
    'four Bonus cards + one unenhanced: the unenhanced one becomes Gold, wherever it sits', picks);
  // all enhanced: one non-Gold card is overwritten; the hand scored with its old enhancement first
  fresh('GABE', ['gabite']);
  r = play(FULL_HOUSE, { center: 'm_bonus' });
  const kinds = r.cards.map((c) => c.config.center.key);
  fresh('GABE', ['j_joker']);
  const ref = play(FULL_HOUSE, { center: 'm_bonus' });
  ok(kinds.filter((k) => k === 'm_gold').length === 1 && kinds.filter((k) => k === 'm_bonus').length === 4, 'five Bonus cards: one becomes Gold (overwritten)', kinds);
  ok(r.total.chips === ref.total.chips && r.total.chips >= 5 * 30, 'the converted card scored as a Bonus card that hand (Gold comes after scoring)', [r.total.chips, ref.total.chips]);
  // a Gold card is never re-picked; all Gold -> nothing; mixed -> the non-Gold one
  fresh('GABG', ['gabite']);
  r = play(FULL_HOUSE, { center: 'm_gold' });
  ok(r.cards.every(isGold) && deckGold() === 5, 'five Gold cards: nothing to convert', deckGold());
  // not on other hands
  fresh('GABN', ['gabite']);
  const n0 = deckGold();
  for (const h of [PAIR, TWO_PAIR, TRIPS, QUADS, FLUSH, STRAIGHT]) play(h);
  ok(deckGold() === n0, 'Pair / Two Pair / Three / Four of a Kind / Flush / Straight: no Gold', deckGold() - n0);
  // debuffed scored cards are never picked
  fresh('GABD', ['gabite']);
  r = play(FULL_HOUSE, { debuffPlayed: [0, 1, 2, 3] });
  ok(isGold(r.cards[4]) && r.cards.filter(isGold).length === 1, 'four scored cards debuffed: the undebuffed one becomes Gold', r.cards.map((c) => c.config.center.key));
  // a debuffed Gabite does nothing
  const [db] = fresh('GABX', ['gabite']);
  debuff(db);
  r = play(FULL_HOUSE);
  ok(r.cards.filter(isGold).length === 0 && ex(db).bite_mult === 0, 'a debuffed Gabite: no Gold, no bite', ex(db).bite_mult);
  // seeded: the same seed picks the same card
  const pickOf = (seed) => { fresh(seed, ['gabite']); return play(FULL_HOUSE).cards.findIndex(isGold); };
  ok(pickOf('GABS') === pickOf('GABS'), 'the pick is seeded (same seed, same card)');
});

// ------------------------------------------------------------------- Gabite -> Garchomp at 6 Gold cards in the full deck
await sec('evolve gabite', () => {
  const [b] = fresh('GABEV', ['gabite']);
  ex(b).bite_mult = 30;
  const deck = G.playing_cards.filter((c) => !isGold(c));
  for (let i = 0; i < 5; i++) deck[i].set_ability(P_CENTERS.m_gold, null, true);
  ok(deckGold() === 5 && /Gold cards: 5\/6/.test(plain(b)), 'its progress line: Gold cards 5/6', plain(b));
  nextRound();
  ok(key(b) === 'j_poke_gabite', '5 Gold cards: no evolution', key(b));
  deck[5].set_ability(P_CENTERS.m_gold, null, true); // any Gold card counts, not only Gabite's
  nextRound();
  ok(key(b) === 'j_poke_garchomp' && ex(b).bite_mult === 30, '6 Gold cards in the full deck (none made by Gabite): Garchomp, keeping the bank (+30)', [key(b), ex(b)]);
});

// ------------------------------------------------------------------- Garchomp: the bank and Dragon Rush
await sec('dragon rush', () => {
  const [c] = fresh('GAR1', ['garchomp']);
  let r = play(HIGH);
  ok(r.total.mult === 1, 'no bank, no Gold held: nothing (High Card 1 Mult)', r.total && r.total.mult);
  r = play(HIGH, { held: ['H_3', 'H_4', 'H_6'] });
  ok(near(r.total.mult, 2.5), '3 Gold held: X2.5', r.total && r.total.mult);
  r = play(HIGH, { held: ['H_3', 'H_4', 'H_6', 'D_7', 'D_8'] });
  ok(near(r.total.mult, 3.5), '5 Gold held: X3.5', r.total && r.total.mult);
  r = play(HIGH, { held: ['H_3', 'H_4', 'H_6'], debuffHeld: [0] });
  ok(near(r.total.mult, 2), '3 Gold held, one debuffed: X2', r.total && r.total.mult);
  r = play(HIGH, { held: ['H_3', 'H_4', 'H_6'], heldCenter: 'm_steel' });
  ok(near(r.total.mult, 1.5 ** 3), 'held Steel cards are not Gold (only their own X1.5 each)', r.total && r.total.mult);
  ex(c).bite_mult = 10;
  r = play(HIGH, { held: ['H_3', 'H_4', 'H_6'] });
  ok(near(r.total.mult, (1 + 10) * 2.5), 'with a +10 bank and 3 Gold held: (1 + 10) x 2.5', r.total && r.total.mult);
  play(PAIR);
  ok(ex(c).bite_mult === 10, 'Garchomp banks no more (a Pair adds nothing)', ex(c).bite_mult);
  clearHand(); hand(['H_3', 'H_4', 'H_6'], { center: 'm_gold' });
  ok(/Currently 3:\s+X2\.5\s+Mult/.test(plain(c)), 'its tooltip: Currently 3: X2.5', plain(c));
});

// ------------------------------------------------------------------- Energy
await sec('energy', () => {
  const [g] = fresh('GIBE', ['gible']);
  ex(g).bite_mult = 10;
  const got = [];
  for (let n = 0; n < 3; n++) { increment_energy(g, 'Dragon'); got.push(ex(g).mult_mod); }
  ok(got.every((v, i) => near(v, [1.2, 1.4, 1.6][i])) && ex(g).energy_count === 3, 'Dragon Energy: +1 -> 1.2 / 1.4 / 1.6 Mult a card', got);
  ok(ex(g).bite_mult === 10, 'the bank is not retroactive (+10 stays +10)', ex(g).bite_mult);
  play(FULL_HOUSE);
  ok(near(ex(g).bite_mult, 18), 'a 3-Energy Full House: +8 (5 x 1.6)', ex(g).bite_mult);
  const [cg] = fresh('GIBC', ['gible']);
  increment_energy(cg, 'Colorless');
  ok(near(ex(cg).mult_mod, 1.1), 'a mismatched Colorless Energy: half (1.1)', ex(cg).mult_mod);
  const [c] = fresh('GARE', ['garchomp']);
  const xs = [];
  for (let n = 0; n < 3; n++) { increment_energy(c, 'Dragon'); xs.push(ex(c).Xmult_mod); }
  ok(xs.every((v, i) => near(v, [0.6, 0.7, 0.8][i])), 'Garchomp: X0.5 -> 0.6 / 0.7 / 0.8 a Gold card', xs);
  const r = play(HIGH, { held: ['H_3', 'H_4', 'H_6'] });
  ok(near(r.total.mult, 1 + 3 * 0.8), 'a 3-Energy Garchomp, 3 Gold held: X3.4', r.total && r.total.mult);
  // carried through both evolutions
  const [e] = fresh('GIBEE', ['gible']);
  increment_energy(e, 'Dragon'); increment_energy(e, 'Dragon');
  ex(e).bite_mult = 25;
  nextRound();
  ok(key(e) === 'j_poke_gabite' && ex(e).energy_count === 2 && near(ex(e).mult_mod, 1.4) && ex(e).bite_mult === 25, 'a 2-Energy Gible becomes a 2-Energy Gabite (1.4 a card, bank kept)', [key(e), ex(e)]);
  const deck = G.playing_cards.filter((x) => !isGold(x));
  for (let i = 0; i < 6; i++) deck[i].set_ability(P_CENTERS.m_gold, null, true);
  nextRound();
  ok(key(e) === 'j_poke_garchomp' && ex(e).energy_count === 2 && near(ex(e).Xmult_mod, 0.7) && ex(e).bite_mult === 25, '... and a 2-Energy Garchomp (X0.7 a Gold card, bank kept)', [key(e), ex(e)]);
});

// ------------------------------------------------------------------- Blueprint
await sec('blueprint', () => {
  const [, g] = fresh('GIBBP', ['j_blueprint', 'gible']);
  let r = play(PAIR);
  ok(ex(g).bite_mult === 2 && r.total.mult === 2 + 2 + 2, 'Blueprint + Gible: the bank grows once (+2, not +4); Blueprint copies the Mult (2 + 2 + 2)', [ex(g).bite_mult, r.total && r.total.mult]);
  fresh('GABBP', ['j_blueprint', 'gabite']);
  r = play(FULL_HOUSE);
  ok(r.cards.filter(isGold).length === 1, 'Blueprint + Gabite: still one Gold card (the conversion is not copied)', r.cards.map((c) => c.config.center.key));
  const [, c] = fresh('GARBP', ['j_blueprint', 'garchomp']);
  ex(c).bite_mult = 4;
  r = play(HIGH, { held: ['H_3', 'H_4'] });
  ok(near(r.total.mult, ((1 + 4) * 2 + 4) * 2), 'Blueprint + Garchomp (+4, 2 Gold held): Blueprint copies +4 and X2: ((1 + 4) x 2 + 4) x 2', r.total && r.total.mult);
});

// ------------------------------------------------------------------- text
await sec('text', () => {
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  ok(J.j_poke_gible && J.j_poke_gabite && J.j_poke_garchomp, 'the texts');
  const [g, b, c] = fresh('GIBTXT', ['gible', 'gabite', 'garchomp']);
  let d = plain(g);
  ok(/Bite: when a hand containing \| a Pair scores, permanently \| gains \+1 Mult for each \| scored card/.test(d) && /Currently \+0 Mult/.test(d) && /Evolves at \+0 \/ \+25 Mult/.test(d), 'Gible\'s text', d);
  d = plain(b);
  ok(/Bite:/.test(d) && /Treasure Nest: when a hand \| containing a Full House scores, \| one of its scored cards \| becomes a Gold card/.test(d) && /Unenhanced cards first/.test(d) && /Evolves with 6 Gold cards in deck/.test(d) && /Gold cards: 0\/6/.test(d), 'Gabite\'s text', d);
  d = plain(c);
  ok(/\+0 Mult \(banked by Bite\)/.test(d) && /Dragon Rush:\s+X1\s+Mult, plus \|\s+X0\.5\s+for each Gold card \| held in hand/.test(d) && /Currently 0:\s+X1\s+Mult/.test(d), 'Garchomp\'s text', d);
});

done();
