// Gen 5, batch 4: the 12 Gen 5 Legendaries (the owner's "Build as pitched", 2026-10-29; jokers/pokejokers_designs.js "Gen 5, batch 4";
// PORTING.md "Gen 5, batch 4"), Legendary $20 each, types from their cards:
//   Swords of Justice   Cobalion 638 (Metal) / Terrakion 639 (Earth) / Virizion 640 (Grass) / Keldeo 647 (Fighting): each scored Spade /
//                       Diamond / Club / Heart X1.25, +X0.1 per OTHER sword species held (undebuffed). Keldeo's Resolute Form (all three
//                       held): its Resolute card, X2 a Heart instead (+ the bonus: X2.3).
//   Forces of Nature    Tornadus 641 (Colorless; +1 hand; Therian +3 Mult per hand left), Thundurus 642 (Lightning; scored cards 1 in 4
//                       $1; Therian 1 in 2 and X1.1 on a card that pays), Landorus 645 (Earth; held Stone +40 Chips; Therian scored Stone
//                       X1.5). Tornadus / Thundurus Therian with Landorus; Landorus Therian with both. The art follows the forme live.
//   Tao trio            Reshiram 643 (Fire) / Zekrom 644 (Lightning): each Fire / Lightning Joker X1.25 (itself included); Truth vs
//                       Ideals, both held: +0.25 each. Kyurem 646 (Water): X1.5; White with Reshiram / Black with Zekrom (the leftmost
//                       of the two), each joker of the partner's type also gives Kyurem the partner's current X.
//   Meloetta 648        Relic Song: Aria (Psychic) X2 / Pirouette (Fighting) the first scored card retriggers 3 times, switching after
//                       every hand; Aria at each round's start; type and art follow; Monotype-exempt; survives save / resume.
//   Genesect 649        Techno Blast: X(1.5 + 0.5 per Water, Lightning or Fire Joker).
// Every ability is FIRED through real hands and rounds with exact numbers.
//   node micatro/tests/mods/pokermon_gen5_legendaries_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { increment_energy, energy_values, energy_matches } from '../../mods/pokermon/systems/energy.js';
import { apply_type_sticker, is_type, get_type } from '../../mods/pokermon/systems/types.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import { ART } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 700)); } };
const ex = (j) => j.ability.extra;
const C = (n) => P_CENTERS['j_poke_' + n];
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const NAMES = ['cobalion', 'terrakion', 'virizion', 'tornadus', 'thundurus', 'reshiram', 'zekrom', 'landorus', 'kyurem', 'keldeo', 'meloetta', 'genesect'];
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
/** Put cards in hand: a list of keys, or [key, center] pairs (in that order: the first is the leftmost). */
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list` (with `held` left in hand). `left`: the hands left BEFORE the play (default: at least 2, so never the round's last). */
function play(list, { held = [], left } = {}) {
  clearHand();
  const cs = cards(list);
  cards(held);
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (left !== undefined) G.GAME.current_round.hands_left = left;
  else if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  const $0 = G.GAME.dollars;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const events = (r && r.events) || [];
  const total = events.find((e) => e.type === 'hand_total') || {};
  return { events, total, mult: Number(total.mult), chips: Number(total.chips), money: G.GAME.dollars - $0 };
}
function endRound() { clearHand(); const c = hand(['S_2']); G.GAME.chips = G.GAME.blind.chips; if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2; act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush(); }
function advance() {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  clearHand();
}
/** A Joker with no scoring effect of its own (Credit Card) given a Tera type: a plain "Fire Joker" etc. */
function typed(t) { const j = add('j_credit_card'); apply_type_sticker(j, t); return j; }
const face = (j, shiny) => {
  const v = {}; view_card(j, v);
  return POKE_UI.face({ center: key(j), facing: 'front', poke: v.poke, atlas: j.config.center.atlas, pos: j.config.center.pos, soul_pos: j.config.center.soul_pos, ...(shiny ? { edition: 'poke_shiny' } : {}) }, { area: 'jokers' });
};
/** The card a joker is DRAWN with: [atlas, pos, soul_pos]. */
const drawn = (j, shiny) => { const f = face(j, shiny); const c = j.config.center; return f ? [f.atlas, f.pos, f.soul_pos] : [c.atlas, c.pos, c.soul_pos]; };
const cell = (j) => { const [, p, s] = drawn(j); return `{${p.x},${p.y}}` + (s ? `/{${s.x},${s.y}}` : ''); };

// ------------------------------------------------------------------- pin, static data, order, art cells, Energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 55 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 55+ (Gen 5 batch 4)', PINS.modPin('pokermon'));
  for (const n of NAMES) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs');
  }
  const hits = [];
  const re = new RegExp(NAMES.join('|'), 'i');
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the 12 (nothing to dedupe)', hits);
});
await sec('static', () => {
  start('G5LS');
  // [type, sheet, x, y] (each with its soul one cell right)
  const WANT = {
    cobalion: ['Metal', 'Natdex', 14, 42], terrakion: ['Earth', 'Natdex', 16, 42], virizion: ['Grass', 'Natdex', 18, 42],
    tornadus: ['Colorless', 'Gen05', 6, 3], thundurus: ['Lightning', 'Gen05', 10, 3], reshiram: ['Fire', 'Gen05', 2, 4], zekrom: ['Lightning', 'Gen05', 6, 4],
    landorus: ['Earth', 'Gen05', 10, 4], kyurem: ['Water', 'Gen05', 2, 5], keldeo: ['Fighting', 'Gen05', 0, 6], meloetta: ['Psychic', 'Gen05', 4, 6], genesect: ['Grass', 'Gen05', 8, 6],
  };
  for (const [n, [type, sheet, x, y]] of Object.entries(WANT)) {
    const c = C(n);
    ok(c.rarity === 4 && c.cost === 20 && c.stage === 'Legendary' && c.ptype === type && c.config.extra.ptype === type && c.gen === 5,
      `${n}: Legendary $20, ${type}, Gen 5`, [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.atlas === 'poke_AtlasJokersBasic' + sheet + '391' && c.pos.x === x && c.pos.y === y && c.soul_pos && c.soul_pos.x === x + 1 && c.soul_pos.y === y,
      `${n}: upstream 3.9.1 cell ${sheet} {${x},${y}} with its soul (nothing to deploy)`, [c.atlas, c.pos, c.soul_pos]);
    ok(!c.config.extra.rounds && !c.config.evo_rqmt, n + ': never evolves');
  }
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const i = keys.indexOf('j_poke_cobalion');
  ok(keys.slice(i, i + 12).join() === NAMES.map((n) => 'j_poke_' + n).join() && /^j_poke_(hydreigon|volcarona)$/.test(keys[i - 1]) && keys[i + 12] === 'j_poke_chespin',
    'Pokédex order: Hydreigon (635) or Volcarona (637), Cobalion ... Genesect (638-649), Chespin (650)', keys.slice(i - 1, i + 13));
  ok(C('meloetta').poke_mono_exempt === true && NAMES.filter((n) => n !== 'meloetta').every((n) => !C(n).poke_mono_exempt), 'Monotype: only Meloetta is exempt (its type follows the forme)');
  ok(NAMES.every((n) => !C(n).poke_no_energy_field), 'every one has an Energy field');
  ok(['sword_mod', 'tao_mod', 'storm_money', 'dem2', 'num', 'dem', 'hands', 'retriggers'].every((f) => !(f in energy_values)),
    'fixed: the sword bonus, Truth vs Ideals, the $1, the odds, the +1 hand, the retriggers (no energy field)');
  ok(['Xmult_multi', 'Xmult_multi2', 'Xmult', 'Xmult_mod', 'mult', 'chips'].every((f) => f in energy_values), 'the X / Mult / Chips numbers are energy fields');
});

// ------------------------------------------------------------------- the Swords of Justice + Keldeo's Resolute Form
await sec('swords', () => {
  start('SWORD1');
  const co = add('j_poke_cobalion');
  let t = play(['S_5']);
  ok(t.chips === 5 + 5 && near(t.mult, 1.25), 'Cobalion alone: a scored Spade X1.25 (High Card 5: 10 x 1.25)', t.total);
  t = play(['H_5']);
  ok(near(t.mult, 1), 'a Heart: nothing from Cobalion', t.total);
  t = play([['H_5', 'm_wild']]);
  ok(near(t.mult, 1.25), 'a Wild card counts as a Spade (is_suit)', t.total);
  t = play(['S_5', 'C_5']);
  ok(near(t.mult, 2 * 1.25), 'a Pair, one Spade: X1.25 once', t.total);
  // 1 to 4 swords: +X0.1 per OTHER sword held
  const te = add('j_poke_terrakion');
  t = play(['S_5']);
  ok(near(t.mult, 1.35), '2 swords (Cobalion + Terrakion): a Spade X1.35', t.total);
  t = play(['D_5']);
  ok(near(t.mult, 1.35), '... and Terrakion\'s Diamond X1.35', t.total);
  const vi = add('j_poke_virizion');
  t = play(['S_5']);
  ok(near(t.mult, 1.45), '3 swords: a Spade X1.45', t.total);
  t = play(['C_5']);
  ok(near(t.mult, 1.45), '... and Virizion\'s Club X1.45', t.total);
  const ke = add('j_poke_keldeo');
  t = play(['S_5']);
  ok(near(t.mult, 1.55), '4 swords (Keldeo counts): a Spade X1.55', t.total);
  t = play(['D_5']); ok(near(t.mult, 1.55), '4 swords: a Diamond X1.55', t.total);
  t = play(['C_5']); ok(near(t.mult, 1.55), '4 swords: a Club X1.55', t.total);
  ok(/3\/3 others: X1\.55/.test(plain(co)), 'Cobalion\'s tooltip: 3/3 others, X1.55', plain(co));
  // Keldeo Resolute: X2 base + 0.3
  t = play(['H_5']);
  ok(near(t.mult, 2.3), 'Keldeo, Resolute (Cobalion, Terrakion and Virizion held): a Heart X2 + 0.3 = X2.3', t.total);
  t = play(['H_5', 'H_6', 'H_9', 'H_K', 'H_2']);
  ok(near(t.mult, 4 * Math.pow(2.3, 5)), 'a Heart Flush: X2.3 on each of the 5 Hearts', t.total);
  ok(cell(ke) === '{2,6}/{3,6}' && drawn(ke)[0] === C('keldeo').atlas, 'Keldeo Resolute: its Resolute card and soul (Gen 5 {2,6} / {3,6})', drawn(ke));
  ok(/Resolute Form/.test(plain(ke)), 'its tooltip says Resolute Form', plain(ke));
  // a debuffed sword counts for nothing: Virizion debuffed -> Keldeo Ordinary, 2 others
  debuff(vi);
  t = play(['H_5']);
  ok(near(t.mult, 1.45), 'Virizion debuffed: Keldeo is back to Ordinary, X1.25 + 2 others = X1.45', t.total);
  ok(cell(ke) === '{0,6}/{1,6}', 'Keldeo Ordinary: its own card again (live)', cell(ke));
  t = play(['C_5']);
  ok(near(t.mult, 1), 'a debuffed Virizion gives nothing', t.total);
  undebuff(vi);
  ok(cell(ke) === '{2,6}/{3,6}', 'un-debuffed: Resolute again', cell(ke));
  // twins: a second Cobalion is not an "other sword"
  start('SWORD2');
  add('j_poke_cobalion'); add('j_poke_cobalion');
  t = play(['S_5']);
  ok(near(t.mult, 1.25 * 1.25), 'two Cobalions: each X1.25 (a twin is no other sword)', t.total);
  add('j_poke_keldeo');
  t = play(['S_5']);
  ok(near(t.mult, 1.35 * 1.35), '+ Keldeo: each Cobalion X1.35 (two Cobalions count once for Keldeo)', t.total);
  t = play(['H_5']);
  ok(near(t.mult, 1.35), 'Keldeo with one other species (Cobalion, twice): X1.35, not Resolute', t.total);
  // Blueprint copies a sword
  start('SWORDBP');
  add('j_blueprint'); add('j_poke_terrakion');
  t = play(['D_5']);
  ok(near(t.mult, 1.25 * 1.25), 'Blueprint copies Terrakion: a Diamond X1.25 twice', t.total);
  void te;
});

// ------------------------------------------------------------------- the Forces of Nature: formes and effects
await sec('forces formes', () => {
  start('FORCE1');
  const to = add('j_poke_tornadus');
  ok(ex(to).hands === 1 && G.GAME.round_resets.hands === 5, 'Tornadus: +1 hand each round (4 -> 5)', G.GAME.round_resets.hands);
  const th = add('j_poke_thundurus');
  ok(cell(to) === '{6,3}/{7,3}' && cell(th) === '{10,3}/{11,3}' && /Incarnate/.test(plain(th)), 'no Landorus: Tornadus / Thundurus Incarnate (their own cards)', [cell(to), cell(th)]);
  const la = add('j_poke_landorus');
  ok(cell(to) === '{8,3}/{9,3}' && cell(th) === '{0,4}/{1,4}', 'Landorus held: Tornadus and Thundurus show their Therian cards (Gen 5 {8,3} / {0,4})', [cell(to), cell(th)]);
  ok(cell(la) === '{0,5}/{1,5}' && /Therian/.test(plain(la)), 'both held: Landorus Therian ({0,5})', cell(la));
  debuff(th);
  ok(cell(la) === '{10,4}/{11,4}' && /Incarnate/.test(plain(la)), 'Thundurus debuffed: Landorus is Incarnate again (needs both)', cell(la));
  ok(cell(to) === '{8,3}/{9,3}', '... Tornadus stays Therian (Landorus still held)', cell(to));
  undebuff(th);
  debuff(la);
  ok(cell(to) === '{6,3}/{7,3}' && cell(th) === '{10,3}/{11,3}', 'Landorus debuffed: both Incarnate', [cell(to), cell(th)]);
  undebuff(la);
  act({ type: 'sell', id: la.sort_id }); flush();
  ok(cell(to) === '{6,3}/{7,3}', 'Landorus sold: Tornadus Incarnate (live)', cell(to));
  ok(get_type(to) === 'Colorless' && get_type(th) === 'Lightning', 'the forme never changes the type');
  act({ type: 'sell', id: to.sort_id }); flush();
  ok(G.GAME.round_resets.hands === 4, 'Tornadus sold: the hand goes back (5 -> 4)', G.GAME.round_resets.hands);
});
await sec('tornadus', () => {
  start('TORN');
  add('j_poke_tornadus');
  let t = play(['S_5'], { left: 4 });
  ok(near(t.mult, 1), 'Tornadus Incarnate: no Mult', t.total);
  add('j_poke_landorus');
  t = play(['S_5'], { left: 4 });
  ok(near(t.mult, 1 + 3 * 3), 'Therian: +3 Mult per hand left when it scores (4 before the hand, 3 after: +9)', t.total);
  t = play(['S_5'], { left: 2 });
  ok(near(t.mult, 1 + 3), '1 hand left: +3', t.total);
  t = play(['S_5'], { left: 1 });
  ok(near(t.mult, 1), 'the final hand (0 left): +0', t.total);
});
await sec('thundurus', () => {
  start('THUN');
  const th = add('j_poke_thundurus');
  ex(th).dem = 1; // forced odds (1 in 1)
  let t = play(['S_5', 'H_5']);
  ok(t.money === 2 && near(t.mult, 2), 'Incarnate, forced odds: each of the 2 scored cards earns $1, no X', [t.money, t.total]);
  t = play(['S_5', 'H_5', 'D_9']);
  ok(t.money === 2, 'only SCORED cards pay (the kicker 9 doesn\'t)', t.money);
  ex(th).dem = 4;
  ok(/1 in 4/.test(plain(th)) && /1 in 2/.test(plain(th)), 'tooltip: 1 in 4, and 1 in 2 for the Therian Forme', plain(th));
  // the rate: 1 in 4 over many seeded cards; each hand's mult stays exactly 2 (no X while Incarnate)
  let paid = 0, n = 0, exact = true;
  for (let i = 0; i < 40; i++) { t = play(['S_5', 'H_5', 'D_5', 'C_5', 'S_9']); paid += t.money; n += 4; if (!near(t.mult, 7)) exact = false; }
  ok(paid >= n * 0.12 && paid <= n * 0.4 && exact, `Incarnate: about 1 in 4 of ${n} scored cards paid (${paid}); Four of a Kind always X1`, [paid, n]);
  // Therian (Landorus held): 1 in 2, and a card that pays also gives X1.1
  const la = add('j_poke_landorus');
  ex(th).dem2 = 1;
  t = play(['S_5', 'H_5']);
  ok(t.money === 2 && near(t.mult, 2 * 1.1 * 1.1), 'Therian, forced odds: $2 and X1.1 per paying card (2 x 1.21)', [t.money, t.total]);
  ex(th).dem2 = 2;
  paid = 0; n = 0; exact = true;
  for (let i = 0; i < 40; i++) { t = play(['S_5', 'H_5', 'D_5', 'C_5', 'S_9']); paid += t.money; n += 4; if (!near(t.mult, 7 * Math.pow(1.1, t.money))) exact = false; }
  ok(paid >= n * 0.35 && paid <= n * 0.65, `Therian: about 1 in 2 of ${n} scored cards paid (${paid})`, [paid, n]);
  ok(exact, 'Therian: every hand is exactly 7 x 1.1^(cards that paid)');
  // Blueprint rolls its own
  start('THUNBP');
  add('j_blueprint'); const t2 = add('j_poke_thundurus'); ex(t2).dem = 1;
  t = play(['S_5']);
  ok(t.money === 2, 'Blueprint copies it: a card earns $1 twice', t.money);
  void la;
});
await sec('landorus', () => {
  start('LAND');
  const la = add('j_poke_landorus');
  let t = play(['S_5'], { held: [['H_7', 'm_stone'], ['D_7', 'm_stone'], 'C_7'] });
  ok(t.chips === 10 + 2 * 40 && near(t.mult, 1), 'Incarnate: each Stone card held +40 Chips (2 Stones: 10 + 80)', t.total);
  t = play([['H_7', 'm_stone']]);
  ok(t.chips === 5 + 50 && near(t.mult, 1), 'Incarnate: a scored Stone card gets nothing from it (50 Chips only)', t.total);
  // a debuffed held Stone gives nothing
  clearHand();
  const [s1] = cards([['H_7', 'm_stone']]); const [p] = cards(['S_5']);
  debuff(s1);
  G.GAME.chips = 0; act({ type: 'highlight', ids: [p.sort_id] }); let r = act({ type: 'play' }); flush();
  let tot = r.events.find((e) => e.type === 'hand_total');
  ok(Number(tot.chips) === 10, 'a debuffed held Stone gives nothing', tot);
  // Therian (Tornadus + Thundurus held): scored Stone X1.5, held Stones nothing
  const to = add('j_poke_tornadus'); const th = add('j_poke_thundurus'); ex(th).num = 0; // (Thundurus never pays here)
  t = play([['H_7', 'm_stone']], { held: [['D_7', 'm_stone']], left: 2 });
  ok(t.chips === 5 + 50 && near(t.mult, 1.5 + 3), 'Therian: a scored Stone card X1.5, the held one +0 (then Tornadus +3 for the 1 hand left)', t.total);
  t = play([['H_7', 'm_stone'], ['D_8', 'm_stone']], { left: 2 });
  ok(near(t.mult, 1.5 * 1.5 + 3), 'Therian: two scored Stones X1.5 each (+3 Tornadus)', t.total);
  void la; void to;
});

// ------------------------------------------------------------------- the Tao trio: Turboblaze, Teravolt, Truth vs Ideals
await sec('tao', () => {
  start('TAO1');
  const re = add('j_poke_reshiram');
  let t = play(['S_5']);
  ok(near(t.mult, 1.25), 'Reshiram alone: itself is a Fire Joker, X1.25', t.total);
  const f = typed('Fire');
  t = play(['S_5']);
  ok(near(t.mult, 1.25 * 1.25), '+ a Fire Joker (Tera): X1.25 each', t.total);
  typed('Water');
  t = play(['S_5']);
  ok(near(t.mult, 1.25 * 1.25), 'a Water Joker: nothing', t.total);
  debuff(f);
  t = play(['S_5']);
  ok(near(t.mult, 1.25), 'a debuffed Fire Joker doesn\'t count', t.total);
  undebuff(f);
  const ar = add('j_poke_arceus');
  t = play(['S_5']);
  // Arceus: X(1 + 0.25 x types: Fire, Water, Colorless itself = 3 -> X1.75); Reshiram: itself, the Fire Tera and Arceus
  ok(near(t.mult, Math.pow(1.25, 3) * 1.75), 'Arceus counts as a Fire Joker: X1.25 x 3, x Arceus X1.75', t.total);
  act({ type: 'sell', id: ar.sort_id }); flush();
  // Truth vs Ideals
  const ze = add('j_poke_zekrom');
  t = play(['S_5']);
  ok(near(t.mult, 1.5 * 1.5 * 1.5), 'Reshiram + Zekrom: +0.25 each — Reshiram X1.5 for itself and the Fire Tera, Zekrom X1.5 for itself', t.total);
  typed('Lightning');
  t = play(['S_5']);
  ok(near(t.mult, Math.pow(1.5, 4)), '+ a Lightning Joker: X1.5 from Zekrom too', t.total);
  ok(/active: X1\.5 each/.test(plain(re)) && /currently 2/.test(plain(re)), 'Reshiram\'s tooltip: 2 Fire Jokers, Truth vs Ideals active', plain(re));
  debuff(ze);
  t = play(['S_5']);
  ok(near(t.mult, 1.25 * 1.25), 'Zekrom debuffed: no Truth vs Ideals, no Teravolt (Reshiram X1.25 twice)', t.total);
  undebuff(ze);
  // a Tera Fire Zekrom is a Fire Joker for Reshiram (the sticker replaces Lightning)
  start('TAO2');
  add('j_poke_reshiram'); const z2 = add('j_poke_zekrom'); apply_type_sticker(z2, 'Fire');
  t = play(['S_5']);
  ok(near(t.mult, 1.5 * 1.5), 'a Fire-Tera Zekrom: Reshiram X1.5 for both; Zekrom finds no Lightning Joker', t.total);
});

// ------------------------------------------------------------------- Kyurem: White / Black, the borrowed boost
await sec('kyurem', () => {
  start('KYU1');
  const ky = add('j_poke_kyurem');
  let t = play(['S_5']);
  ok(near(t.mult, 1.5) && cell(ky) === '{2,5}/{3,5}', 'Kyurem alone: X1.5, its own card', [t.total, cell(ky)]);
  const re = add('j_poke_reshiram');
  ok(cell(ky) === '{8,5}/{9,5}' && /White Kyurem: X1\.25 per Fire Joker/.test(plain(ky)), 'with Reshiram: White Kyurem (Gen 5 {8,5})', [cell(ky), plain(ky)]);
  t = play(['S_5']);
  ok(near(t.mult, 1.5 * 1.25 * 1.25), 'White: Reshiram X1.25 for itself, and Kyurem X1.25 again for it (x X1.5)', t.total);
  typed('Fire');
  t = play(['S_5']);
  ok(near(t.mult, 1.5 * Math.pow(1.25, 4)), '+ a Fire Joker: each Fire Joker X1.25 x X1.25 (separate multipliers)', t.total);
  // the borrowed number is Reshiram's own, Energy included
  increment_energy(re, 'Fire');
  t = play(['S_5']);
  ok(near(t.mult, 1.5 * Math.pow(1.3125, 4)), 'Reshiram energized (X1.3125): Kyurem borrows X1.3125', t.total);
  debuff(re);
  t = play(['S_5']);
  ok(near(t.mult, 1.5) && cell(ky) === '{2,5}/{3,5}', 'Reshiram debuffed: no partner, X1.5, its own card', [t.total, cell(ky)]);
  undebuff(re);
  // Black Kyurem
  start('KYU2');
  const k2 = add('j_poke_kyurem'); add('j_poke_zekrom');
  ok(cell(k2) === '{4,5}/{5,5}', 'with Zekrom: Black Kyurem (Gen 5 {4,5})', cell(k2));
  t = play(['S_5']);
  ok(near(t.mult, 1.5 * 1.25 * 1.25), 'Black: Zekrom X1.25 and Kyurem X1.25 for Zekrom (x X1.5)', t.total);
  typed('Fire');
  t = play(['S_5']);
  ok(near(t.mult, 1.5 * 1.25 * 1.25), 'Black Kyurem: a Fire Joker gets nothing', t.total);
  // both: the leftmost picks it
  start('KYU3');
  const zz = add('j_poke_zekrom'); const k3 = add('j_poke_kyurem'); const rr = add('j_poke_reshiram');
  ok(cell(k3) === '{4,5}/{5,5}' && /Black Kyurem: X1\.5 per Lightning/.test(plain(k3)), 'Zekrom left of Reshiram: Black Kyurem, borrowing Zekrom\'s X1.5 (Truth vs Ideals)', [cell(k3), plain(k3)]);
  t = play(['S_5']);
  ok(near(t.mult, 1.5 * 1.5 * 1.5 * 1.5), 'Black: Reshiram X1.5, Zekrom X1.5, Kyurem X1.5 and X1.5 again for Zekrom', t.total);
  G.jokers.cards.splice(G.jokers.cards.indexOf(rr), 1); G.jokers.cards.unshift(rr);
  ok(cell(k3) === '{8,5}/{9,5}', 'Reshiram moved leftmost: White Kyurem (live)', cell(k3));
  typed('Fire');
  t = play(['S_5']);
  ok(near(t.mult, Math.pow(1.5, 6)), 'White: Reshiram X1.5 for itself and the Fire Tera, Zekrom X1.5, Kyurem X1.5, and X1.5 again for each of the 2 Fire Jokers', t.total);
  ok(G.jokers.cards.includes(zz) && G.jokers.cards.includes(rr), 'nothing is consumed');
});

// ------------------------------------------------------------------- Meloetta: Relic Song
await sec('meloetta', () => {
  start('MELO1');
  const m = add('j_poke_meloetta');
  ok(ex(m).form === 'aria' && get_type(m) === 'Psychic' && cell(m) === '{4,6}/{5,6}', 'Meloetta starts in Aria: Psychic, its own card', [ex(m).form, get_type(m), cell(m)]);
  let t = play(['S_5']);
  ok(t.chips === 10 && near(t.mult, 2), 'Aria: X2 Mult', t.total);
  ok(ex(m).form === 'pirouette' && get_type(m) === 'Fighting' && is_type(m, 'Fighting') && !is_type(m, 'Psychic') && cell(m) === '{6,6}/{7,6}',
    'after the hand: Pirouette, Fighting, its Pirouette card (Gen 5 {6,6})', [ex(m).form, get_type(m), cell(m)]);
  ok(/Pirouette Forme/.test(plain(m)), 'tooltip: Pirouette Forme', plain(m));
  t = play(['S_5', 'H_5']);
  ok(t.chips === 10 + 5 * 4 + 5 && near(t.mult, 2), 'Pirouette: the first scored card retriggers 3 times (5 x 4 + 5 + 10), no X', t.total);
  ok(ex(m).form === 'aria' && get_type(m) === 'Psychic' && cell(m) === '{4,6}/{5,6}', 'and back to Aria', [ex(m).form, cell(m)]);
  t = play(['S_5']);
  ok(near(t.mult, 2) && ex(m).form === 'pirouette', 'Aria X2 again, then Pirouette', t.total);
  // each round starts in Aria
  endRound();
  ok(ex(m).form === 'aria' && get_type(m) === 'Psychic', 'the winning hand switched it, and the round\'s end resets it: Aria in the shop', [ex(m).form]);
  advance();
  t = play(['S_5']);
  ok(near(t.mult, 2), 'the next round starts in Aria: X2', t.total);
  // a Meloetta left in Pirouette from an earlier round (its reset never ran) reads Aria
  ex(m).form = 'pirouette'; ex(m).form_round = G.GAME.round - 1; ex(m).ptype = 'Fighting';
  t = play(['S_5']);
  ok(near(t.mult, 2) && ex(m).form === 'pirouette' && ex(m).form_round === G.GAME.round, 'a stale Pirouette is Aria first (X2), then switches', [t.total, ex(m)]);
  // Energy: the forme's type matches
  ok(energy_matches(m, 'Fighting') && !energy_matches(m, 'Psychic'), 'in Pirouette, Fighting Energy matches (not Psychic)');
  t = play(['S_5']);
  ok(energy_matches(m, 'Psychic') && !energy_matches(m, 'Fighting'), 'in Aria, Psychic Energy matches');
  // Monotype exempt; Blueprint copies the forme's effect
  ok(m.config.center.poke_mono_exempt === true, 'its type never breaks Monotype (poke_mono_exempt)');
  start('MELOBP');
  add('j_blueprint'); const m2 = add('j_poke_meloetta');
  t = play(['S_5']);
  ok(near(t.mult, 4) && ex(m2).form === 'pirouette', 'Blueprint copies Aria (X2 x X2), and the switch happens once', [t.total, ex(m2).form]);
  t = play(['S_5']);
  ok(t.chips === 5 + 5 * 7 && ex(m2).form === 'aria', 'Blueprint copies Pirouette: 3 + 3 retriggers (5 x 7), then Aria once', [t.total, ex(m2).form]);
  // a Tera sticker owns the type
  start('MELOTERA');
  const m3 = add('j_poke_meloetta'); apply_type_sticker(m3, 'Dark');
  play(['S_5']);
  ok(ex(m3).form === 'pirouette' && get_type(m3) === 'Dark', 'a Dark Tera: the forme switches, the type stays Dark', [ex(m3).form, get_type(m3)]);
});
await sec('meloetta resume', () => {
  for (const hands of [1, 2, 3]) {
    const s = new Session();
    s.start({ seed: 'MELRES' + hands, customDeck: { name: 'Relic', mods: ['pokermon'], jokers: [{ key: 'j_poke_meloetta' }] } });
    s.act({ type: 'select_blind' }); flush();
    for (let h = 0; h < hands; h++) { s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 1).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush(); }
    const j = G.jokers.cards.find((c) => key(c) === 'j_poke_meloetta');
    const want = ex(j).form, type = get_type(j), art = JSON.stringify(drawn(j));
    ok(want === (hands % 2 ? 'pirouette' : 'aria'), `${hands} hand(s) played: ${want}`, want);
    const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
    const j2 = G.jokers.cards.find((c) => key(c) === 'j_poke_meloetta');
    ok(!r.stoppedAt && j2 && ex(j2).form === want && get_type(j2) === type && JSON.stringify(drawn(j2)) === art, `resume after ${hands} hand(s): ${want}, ${type}, same art`, [want, j2 && ex(j2).form, j2 && get_type(j2)]);
  }
});

// ------------------------------------------------------------------- Genesect: Techno Blast
await sec('genesect', () => {
  start('GENE');
  const g = add('j_poke_genesect');
  let t = play(['S_5']);
  ok(near(t.mult, 1.5), 'Genesect alone: X1.5', t.total);
  typed('Water'); typed('Lightning');
  t = play(['S_5']);
  ok(near(t.mult, 2.5), '+ a Water and a Lightning Joker: X2.5', t.total);
  const f = typed('Fire');
  t = play(['S_5']);
  ok(near(t.mult, 3), '+ a Fire Joker: X3', t.total);
  typed('Grass');
  t = play(['S_5']);
  ok(near(t.mult, 3), 'a Grass Joker: no change', t.total);
  debuff(f);
  t = play(['S_5']);
  ok(near(t.mult, 2.5), 'a debuffed Fire Joker doesn\'t count', t.total);
  undebuff(f);
  add('j_poke_arceus');
  t = play(['S_5']);
  // Arceus once (not three times): X(1.5 + 0.5 x 4) = X3.5; Arceus's own X(1 + 0.25 x 5 types: Water, Lightning, Fire, Grass, Colorless) = X2.25
  ok(near(t.mult, 3.5 * 2.25), 'Arceus counts once: X3.5 (x Arceus X2.25)', t.total);
  ok(/Currently 4: X3\.5/.test(plain(g)), 'tooltip: 4, X3.5', plain(g));
  apply_type_sticker(g, 'Fire');
  ok(/Currently 5: X4/.test(plain(g)), 'a Fire-Tera Genesect counts itself', plain(g));
});

// ------------------------------------------------------------------- Energy: the standard shares, and energized numbers in play
await sec('energy', () => {
  const r3 = (x) => Math.round(x * 1e9) / 1e9;
  const steps = (n, fields, type) => {
    start('EN' + n);
    const j = add('j_poke_' + n);
    const got = {};
    for (let i = 0; i < 3; i++) { increment_energy(j, type); for (const [f] of fields) (got[f] || (got[f] = [])).push(r3(ex(j)[f])); }
    for (const [f, want] of fields) ok(got[f].every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${f} ${want.join(' / ')}`, got[f]);
    return j;
  };
  const co = steps('cobalion', [['Xmult_multi', [1.3125, 1.375, 1.4375]]], 'Metal');
  ok(ex(co).sword_mod === 0.1, 'the sword bonus stays +0.1');
  let t = play(['S_5']);
  ok(near(t.mult, 1.4375), 'energized Cobalion: a Spade X1.4375', t.total);
  steps('terrakion', [['Xmult_multi', [1.3125, 1.375, 1.4375]]], 'Earth');
  steps('virizion', [['Xmult_multi', [1.3125, 1.375, 1.4375]]], 'Grass');
  const ke = steps('keldeo', [['Xmult_multi', [1.3125, 1.375, 1.4375]], ['Xmult_multi2', [2.1, 2.2, 2.3]]], 'Fighting');
  add('j_poke_cobalion'); add('j_poke_terrakion'); add('j_poke_virizion');
  t = play(['H_5']);
  ok(near(t.mult, 2.6), 'energized Resolute Keldeo: a Heart X2.3 + 0.3 = X2.6', t.total);
  void ke;
  const to = steps('tornadus', [['mult', [4.2, 5.4, 6.6]]], 'Colorless');
  ok(ex(to).hands === 1, 'the +1 hand stays');
  add('j_poke_landorus');
  t = play(['S_5'], { left: 3 });
  ok(near(t.mult, 1 + 6.6 * 2), 'energized Therian Tornadus: +6.6 per hand left (2: +13.2)', t.total);
  const th = steps('thundurus', [['Xmult_multi', [1.155, 1.21, 1.265]]], 'Lightning');
  ok(ex(th).storm_money === 1 && ex(th).dem === 4 && ex(th).dem2 === 2 && ex(th).num === 1, 'the $1 and the odds stay');
  add('j_poke_landorus'); ex(th).dem2 = 1;
  t = play(['S_5']);
  ok(near(t.mult, 1.265) && t.money === 1, 'energized Therian Thundurus: a paying card X1.265', [t.total, t.money]);
  steps('reshiram', [['Xmult_multi', [1.3125, 1.375, 1.4375]]], 'Fire');
  const ze = steps('zekrom', [['Xmult_multi', [1.3125, 1.375, 1.4375]]], 'Lightning');
  ok(ex(ze).tao_mod === 0.25, 'Truth vs Ideals stays +0.25');
  add('j_poke_reshiram');
  t = play(['S_5']);
  ok(near(t.mult, 1.6875 * 1.5), 'energized Zekrom with Reshiram: X1.4375 + 0.25 = X1.6875 (Reshiram X1.5)', t.total);
  const la = steps('landorus', [['chips', [52, 64, 76]], ['Xmult_multi', [1.575, 1.65, 1.725]]], 'Earth');
  t = play(['S_5'], { held: [['H_7', 'm_stone']] });
  ok(t.chips === 10 + 76, 'energized Incarnate Landorus: +76 per held Stone', t.total);
  void la;
  const ky = steps('kyurem', [['Xmult', [1.8, 2.1, 2.4]]], 'Water');
  t = play(['S_5']);
  ok(near(t.mult, 2.4), 'energized Kyurem: X2.4', t.total);
  void ky;
  const me = steps('meloetta', [['Xmult', [2.4, 2.8, 3.2]]], 'Psychic');
  ok(ex(me).retriggers === 3, 'the 3 retriggers stay');
  t = play(['S_5']);
  ok(near(t.mult, 3.2), 'energized Aria: X3.2', t.total);
  const ge = steps('genesect', [['Xmult', [1.8, 2.1, 2.4]], ['Xmult_mod', [0.6, 0.7, 0.8]]], 'Grass');
  typed('Water'); typed('Fire');
  t = play(['S_5']);
  ok(near(t.mult, 2.4 + 0.8 * 2), 'energized Genesect with 2 Water / Fire Jokers: X4', t.total);
  void ge;
});

// ------------------------------------------------------------------- the art: the form cells are the right types
if (ART) {
  await sec('form cell types', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const FORMS = { tornadus: [[8, 3], 'Colorless'], thundurus: [[0, 4], 'Lightning'], landorus: [[0, 5], 'Earth'], kyurem: [[4, 5], 'Water'], kyurem_w: [[8, 5], 'Water'], keldeo: [[2, 6], 'Fighting'], meloetta: [[6, 6], 'Fighting'] };
    for (const [n, [pos, want]] of Object.entries(FORMS)) {
      const r = typer.typeOfEntry({ atlas: 'AtlasJokersBasicGen05', pos });
      ok(r && r.ptype === want, `${n}'s form cell {${pos}} shows ${want}`, r);
    }
  });
} else console.log('(Pokermon art not on disk: the cell type checks are skipped; set MICATRO_MAIN)');

done();
