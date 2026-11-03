// Gen 9, batch 4: the Gen 9 Legendaries (contentRev 79+; jokers/pokejokers_designs.js; PORTING.md "Gen 9, batch 4"). The owner's "yes"
// (2026-11-03); each complete ALONE (the solo rule, r59), so every joker here is played on its own through real hands and rounds.
//   Wo-Chien  (Grass)   Tablets of Ruin: every Blind's chip requirement is 15% lower (cut when the Blind is set; the HUD shows it; copies
//                       don't stack; save / resume and the replay stepper rebuild it exactly).
//   Chien-Pao (Water)   Sword of Ruin: every scored card X1.1.
//   Ting-Lu   (Earth)   Vessel of Ruin: +2 hands during Boss Blinds (given at the Boss's selection, an unused one gone at the round's end).
//   Chi-Yu    (Fire)    Beads of Ruin: the Boss Blind's ability is disabled (Chicot's; with Chicot, once: The Wall halved once).
//   Koraidon  (Dragon)  Orichalcum Pulse: always sunny (Larvesta / Castform / Cherrim's sun; Kyogre's rain kept); X2 + X0.5 per Ancient Paradox.
//   Miraidon  (Dragon)  Hadron Engine: always Electric Terrain; X2 + X0.5 per Future Paradox.
//   Ogerpon   (Grass)   a mask each Ante (Teal +30 Mult, Wellspring +1 hand and X1.5, Hearthflame X2.5, Cornerstone +150 Chips); its type
//                       and card follow the mask (Monotype-exempt).
// Then Energy (the standard shares; the fixed numbers stay), save / resume + replay and the art (every cell's type, Ogerpon's mask cells).
//   node micatro/tests/mods/pokermon_gen9_legendaries_test.mjs
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { increment_energy, energy_values, energy_can_use } from '../../mods/pokermon/systems/energy.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import { is_type } from '../../mods/pokermon/systems/types.js';
import * as DESIGNS from '../../mods/pokermon/jokers/pokejokers_designs.js';
// (through the namespace, so on a checkout without them the checks fail instead of the import)
const { cherrim_sunny, castform_lock } = DESIGNS;
const mask_of_ante = (a) => (DESIGNS.mask_of_ante ? DESIGNS.mask_of_ante(a) : undefined);
const RUIN_PCT = DESIGNS.RUIN_PCT;
import { ART } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { if (process.env.G9_TRACE) console.log('--', name); try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 700)); } };
const ex = (j) => j.ability.extra;
/** The card's text, every line and box joined by one space. */
const plain = (j) => describe(j).lines.join(' ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
const cr = () => G.GAME.current_round;
const J = (k) => G.jokers.cards.find((c) => key(c) === 'j_poke_' + k);
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list` (never the round's last hand) -> {mult, chips, money}. */
function play(list, { left } = {}) {
  clearHand();
  const cs = cards(list);
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (left !== undefined) cr().hands_left = left;
  else if (cr().hands_left < 2) cr().hands_left = 2;
  const $0 = G.GAME.dollars;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const total = ((r && r.events) || []).find((e) => e.type === 'hand_total') || {};
  return { total, mult: Number(total.mult), chips: Number(total.chips), money: G.GAME.dollars - $0, cards: cs };
}
/** Win the round with a lone 2 of Spades (`left` hands left before it). */
function endRound(left) {
  clearHand(); const c = cards(['S_2']);
  G.GAME.chips = G.GAME.blind.chips;
  if (left !== undefined) cr().hands_left = left;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush();
}
/** Cash out, leave the shop and select the next Blind -> the select's events. */
function advance() {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  const r = act({ type: 'select_blind' }); flush();
  clearHand();
  return (r && r.events) || [];
}
/** A full round: win it and select the next Blind. */
function round(left) { endRound(left); flush(); return advance(); }
/** Rounds until the next Boss Blind is selected (start() is on the Small Blind of Ante 1: every 3rd round is a Boss). */
function toBoss() { let ev = []; while (!G.GAME.blind.boss) ev = round(); return ev; }
const form = (j) => { const v = {}; view_card(j, v); return v.poke && v.poke.form; };
const face = (j) => {
  const v = {}; view_card(j, v);
  const f = POKE_UI.face({ center: key(j), facing: 'front', poke: v.poke, atlas: j.config.center.atlas, pos: j.config.center.pos, soul_pos: j.config.center.soul_pos }, { area: 'jokers' });
  return f || j.config.center;
};
const drawn = (j) => { const d = face(j); return `{${d.pos.x},${d.pos.y}}+{${d.soul_pos.x},${d.soul_pos.y}}`; };
const moveLeftOf = (a, b) => { G.jokers.cards.splice(G.jokers.cards.indexOf(a), 1); G.jokers.cards.splice(G.jokers.cards.indexOf(b), 0, a); };
const sell = (j) => { act({ type: 'sell', id: j.sort_id }); flush(); };
const chips = () => Number(G.GAME.blind.chips);
const chipEvents = (evs) => evs.filter((e) => e.type === 'blind' && e.action === 'chips');
const NAMES = ['wochien', 'chienpao', 'tinglu', 'chiyu', 'koraidon', 'miraidon', 'ogerpon'];
/** The requirement the Blind about to be selected would have with no joker touching it (a twin run on the same seed, same rounds). */
function bareRequirement(seed, rounds) {
  start(seed);
  for (let i = 0; i < rounds; i++) round();
  return chips();
}

// ------------------------------------------------------------------- the pin and the seven centers
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 79 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 79+ (Gen 9 batch 4)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  const want = { wochien: ['Grass', false], chienpao: ['Water', true], tinglu: ['Earth', false], chiyu: ['Fire', false], koraidon: ['Dragon', true], miraidon: ['Dragon', true], ogerpon: ['Grass', true] };
  for (const [n, [t, bp]] of Object.entries(want)) {
    const c = P_CENTERS['j_poke_' + n];
    ok(c && c.rarity === 4 && c.cost === 20 && c.stage === 'Legendary' && c.ptype === t && c.gen === 9 && c.blueprint_compat === bp, `${n}: Legendary $20, ${t}, Gen 9, Blueprint ${bp ? 'copies it' : 'has nothing to copy'}`, c && [c.rarity, c.cost, c.stage, c.ptype, c.gen, c.blueprint_compat]);
  }
  ok(P_CENTERS.j_poke_ogerpon.poke_mono_exempt === true && !P_CENTERS.j_poke_koraidon.poke_mono_exempt, 'Ogerpon (its type follows the mask) is Monotype-exempt; the others are not');
  start('G9LPOOL');
  for (const n of NAMES) { const c = P_CENTERS['j_poke_' + n]; ok(!c.custom_pool_func && c.in_pool(c) !== false, `${n}: in the Legendary pool (The Soul)`); }
  ok(['hands', 'well_round', 'guard_round'].every((f) => !(f in energy_values)), 'the hands and the round markers are no energy fields');
  ok(RUIN_PCT === 15, 'the Tablets of Ruin cut is 15%');
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key.replace('j_poke_', ''));
  const i = keys.indexOf('wochien');
  ok(i > 0 && keys[i - 1] === 'gholdengo' && keys.indexOf('chienpao') === i + 1 && keys.indexOf('tinglu') === i + 2 && keys.indexOf('chiyu') === i + 3
    && keys.indexOf('koraidon') > keys.indexOf('chiyu') && keys.indexOf('miraidon') > keys.indexOf('koraidon') && keys.indexOf('ogerpon') > keys.indexOf('miraidon')
    && keys.indexOf('ogerpon') < keys.indexOf('missingno'),
    'Pokédex order: Gholdengo (1000) > Wo-Chien > Chien-Pao > Ting-Lu > Chi-Yu ... Koraidon ... Miraidon ... Ogerpon (1017), before the non-Pokémon jokers',
    keys.slice(i - 1, i + 16));
});

// ------------------------------------------------------------------- Wo-Chien alone
await sec('wochien', () => {
  const bare = bareRequirement('G9WO', 1);
  start('G9WO');
  const w = add('j_poke_wochien');
  ok(/Tablets of Ruin: every Blind's score requirement is 15% lower \(Copies don't stack\) \(From the next Blind\)/.test(plain(w)), 'text (bought mid-Blind: from the next Blind)', plain(w));
  const ev = round();
  const want = bare - Math.floor(bare * 0.15);
  ok(chips() === want && G.GAME.blind.chip_text === String(want).replace(/\B(?=(\d{3})+(?!\d))/g, ','), `the Big Blind: ${bare} -> ${want} (15% lower), its text too`, [bare, chips(), G.GAME.blind.chip_text]);
  const ce = chipEvents(ev);
  ok(ce.length === 1 && Number(ce[0].chips) === want, 'the HUD hears the new requirement ("Score at least")', ce);
  ok(/\(This Blind: -15%\)/.test(plain(w)), 'its tooltip: "This Blind: -15%"', plain(w));
  // the Boss (The Wall, x4 base) — and a second copy and a Blueprint change nothing
  const w2 = add('j_poke_wochien'); const bp = add('j_blueprint'); moveLeftOf(bp, w);
  const bareBoss = bareRequirement('G9WO', 2);
  start('G9WO'); add('j_poke_wochien'); add('j_poke_wochien'); const bp2 = add('j_blueprint'); moveLeftOf(bp2, J('wochien'));
  round(); round();
  ok(G.GAME.blind.boss && chips() === bareBoss - Math.floor(bareBoss * 0.15), `The Wall: ${bareBoss} -> 15% lower once (two Wo-Chiens and a Blueprint don't stack)`, [bareBoss, chips()]);
  void w2;
  // sold mid-Blind: this Blind keeps its cut, the next has none
  const was = chips();
  sell(J('wochien')); sell(J('wochien'));
  ok(chips() === was, 'sold mid-Blind: this Blind keeps its cut', [was, chips()]);
  const bareNext = bareRequirement('G9WO', 3);
  start('G9WO'); add('j_poke_wochien'); round(); round(); sell(J('wochien')); round();
  ok(chips() === bareNext, 'the next Blind (none held): no cut', [bareNext, chips()]);
  // debuffed when the Blind is set: no cut
  start('G9WO'); const wd = add('j_poke_wochien'); debuff(wd); round(); undebuff(wd);
  ok(chips() === bareRequirement('G9WO', 1), 'debuffed when the Blind is set: no cut');
});

// ------------------------------------------------------------------- Chien-Pao alone
await sec('chienpao', () => {
  start('G9CP');
  const c = add('j_poke_chienpao');
  ok(/Sword of Ruin: every scored card gives X1\.1 Mult/.test(plain(c)), 'text', plain(c));
  let r = play(['S_5']);
  ok(near(r.mult, 1.1), 'High Card, one scored card: X1.1', r.total);
  r = play(['S_5', 'H_5']);
  ok(near(r.mult, 2 * 1.1 * 1.1), 'a Pair: two scored cards, X1.1 each (2 x 1.21)', r.total);
  r = play(['S_5', 'H_5', 'D_5', 'C_9', 'S_K']);
  ok(near(r.mult, 3 * 1.1 ** 3), 'Three of a Kind: only the three scored cards (the kickers don\'t score)', r.total);
  const bp = add('j_blueprint'); moveLeftOf(bp, c);
  r = play(['S_5']);
  ok(near(r.mult, 1.21), 'Blueprint copies it (X1.1 twice per card)', r.total);
});

// ------------------------------------------------------------------- Ting-Lu alone
await sec('tinglu', () => {
  start('G9TL');
  const t = add('j_poke_tinglu');
  const base = G.GAME.round_resets.hands;
  ok(/Vessel of Ruin: \+2 hands during Boss Blinds \(Boss Blinds only\)/.test(plain(t)), 'text', plain(t));
  ok(cr().hands_left === base, 'the Small Blind: no extra hands', cr().hands_left);
  round();
  ok(cr().hands_left === base, 'the Big Blind: none', cr().hands_left);
  round();
  ok(G.GAME.blind.boss && cr().hands_left === base + 2 && G.GAME.round_resets.hands === base && /\(Active!\)/.test(plain(t)), 'the Boss Blind: +2 hands for this round only (round_resets untouched)', [cr().hands_left, G.GAME.round_resets.hands, plain(t)]);
  // win with 2 hands left: the unused extra hands are taken back before the cash-out counts them
  const $0 = G.GAME.dollars;
  endRound(base + 2);
  const evals = (G.GAME.round_eval_lines || null);
  void evals;
  ok(cr().hands_left === base + 1 - 2, 'at the round\'s end the 2 unused extra hands are gone (none pays $1)', cr().hands_left);
  act({ type: 'cash_out' }); flush();
  const paid = G.GAME.dollars - $0;
  advance();
  ok(cr().hands_left === base, 'the next Ante\'s Small Blind: back to normal', cr().hands_left);
  // a twin: the same Boss without Ting-Lu, won with the same hands left - 2 pays the same
  start('G9TL'); round(); round();
  const $1 = G.GAME.dollars; endRound(base); act({ type: 'cash_out' }); flush();
  ok(paid === G.GAME.dollars - $1, 'the cash-out pays the same as without it (the extra hands never pay)', [paid, G.GAME.dollars - $1]);
  // sold mid-Boss: the hands go (never the last)
  start('G9TL'); const t2 = add('j_poke_tinglu'); round(); round();
  ok(cr().hands_left === base + 2, 'Boss: +2');
  sell(t2);
  ok(cr().hands_left === base, 'sold mid-Boss: the 2 hands are taken back', cr().hands_left);
  // debuffed when the Boss is selected: nothing
  start('G9TL'); const t3 = add('j_poke_tinglu'); round(); debuff(t3); round(); undebuff(t3);
  ok(G.GAME.blind.boss && cr().hands_left === base, 'debuffed when the Boss is selected: no hands', cr().hands_left);
  // a Blueprint copies nothing
  start('G9TL'); const t4 = add('j_poke_tinglu'); const bp = add('j_blueprint'); moveLeftOf(bp, t4); round(); round();
  ok(cr().hands_left === base + 2, 'Blueprint: still +2 (it copies nothing)', cr().hands_left);
});

// ------------------------------------------------------------------- Chi-Yu alone (and with Chicot)
await sec('chiyu', () => {
  const wall = bareRequirement('G9CY', 2);
  ok(G.GAME.blind.boss && G.GAME.blind.name === 'The Wall' && !G.GAME.blind.disabled, 'control: The Wall, not disabled', [G.GAME.blind.name, wall]);
  start('G9CY');
  const c = add('j_poke_chiyu');
  ok(/Beads of Ruin: disables the effect of every Boss Blind \(Boss Blinds only\)/.test(plain(c)), 'text', plain(c));
  round();
  ok(!G.GAME.blind.disabled && chips() === bareRequirement('G9CY', 1), 'the Big Blind: untouched');
  start('G9CY'); const c1 = add('j_poke_chiyu'); round(); round();
  ok(G.GAME.blind.disabled && chips() === wall / 2 && /\(Boss disabled\)/.test(plain(c1)), `the Boss: disabled (The Wall's x4 halved: ${wall} -> ${wall / 2})`, [G.GAME.blind.disabled, chips(), plain(c1)]);
  // with Chicot (either side): disabled ONCE
  for (const chicotFirst of [true, false]) {
    start('G9CY');
    const a = chicotFirst ? add('j_chicot') : add('j_poke_chiyu');
    const b = chicotFirst ? add('j_poke_chiyu') : add('j_chicot');
    void a; void b;
    round(); round();
    ok(G.GAME.blind.disabled && chips() === wall / 2, `with Chicot ${chicotFirst ? 'left' : 'right'} of it: disabled once (The Wall halved once, not quartered)`, chips());
  }
  // gained during a Boss: disables it at once (Chicot's add_to_deck)
  start('G9CY'); round(); round();
  ok(!G.GAME.blind.disabled, 'a Boss without it');
  add('j_poke_chiyu');
  ok(G.GAME.blind.disabled && chips() === wall / 2, 'gained mid-Boss: disabled at once', chips());
  // gained during a Boss with Chicot already there: nothing more
  start('G9CY'); add('j_chicot'); round(); round(); add('j_poke_chiyu');
  ok(G.GAME.blind.disabled && chips() === wall / 2, 'gained mid-Boss after Chicot: no second disable', chips());
  // debuffed at the Boss's selection: not disabled; un-debuffed mid-Boss: disabled then
  start('G9CY'); const cd = add('j_poke_chiyu'); round(); debuff(cd); round();
  ok(!G.GAME.blind.disabled && chips() === wall, 'debuffed when the Boss is selected: not disabled');
  undebuff(cd);
  ok(G.GAME.blind.disabled && chips() === wall / 2, '... un-debuffed during it: disabled', chips());
  // a Blueprint copies nothing (and never disables twice)
  start('G9CY'); const c3 = add('j_poke_chiyu'); const bp = add('j_blueprint'); moveLeftOf(bp, c3); round(); round();
  ok(G.GAME.blind.disabled && chips() === wall / 2, 'Blueprint: disabled once', chips());
  // with Wo-Chien too: halved and 15% lower
  start('G9CY'); add('j_poke_chiyu'); add('j_poke_wochien'); round(); round();
  ok(chips() === Math.floor((wall - Math.floor(wall * 0.15)) / 2) || chips() === (wall / 2) - Math.floor((wall / 2) * 0.15), 'with Wo-Chien: halved and 15% lower', [wall, chips()]);
});

// ------------------------------------------------------------------- Koraidon alone: the sun
await sec('koraidon', () => {
  start('G9KO');
  const lv = add('j_poke_larvesta');
  ok(!cherrim_sunny(lv), 'control: not sunny (a Spades first deal is not red)');
  const k = add('j_poke_koraidon');
  ok(cherrim_sunny(lv), 'Koraidon held: it is sunny (live)');
  ok(/Orichalcum Pulse: while you have this Joker it's always sunny \(Castform Sunny unless Kyogre; rain still falls\) X2 Mult, plus X0\.5 for each Ancient Paradox Joker \(Currently 0: X2 Mult\)/.test(plain(k)), 'text', plain(k));
  let r = play(['S_5']);
  ok(near(r.mult, (1 + 10) * 2), 'Larvesta +5 Mult doubled in the sun, then Koraidon X2: (1 + 10) x 2', r.total);
  // Castform turns Sunny on its first deal
  const cf = add('j_poke_castform');
  round();
  ok(ex(cf).form === 'sunny' && is_type(cf, 'Fire'), 'Castform: Sunny (Fire) on the round\'s first deal', [ex(cf).form, ex(cf).ptype]);
  // Kyogre's rain coexists: Castform Rainy (Kyogre's lock wins), Larvesta still in the sun
  add('j_poke_kyogre');
  round();
  ok(castform_lock() === 'rainy' && ex(cf).form === 'rainy' && cherrim_sunny(lv), 'with Kyogre: Castform Rainy (its lock), and still sunny for Larvesta: both', [castform_lock(), ex(cf).form, cherrim_sunny(lv)]);
  // debuffed / sold: no sun from it
  debuff(k);
  ok(!cherrim_sunny(lv) || ex(lv).sun_round === G.GAME.round, 'debuffed: no sun from it');
  undebuff(k);
  sell(k);
  round();
  ok(!(cherrim_sunny(lv) && ex(lv).sun_round !== G.GAME.round), 'sold: the sun is only the deal\'s again');
  // Blueprint copies the X
  start('G9KO'); const k2 = add('j_poke_koraidon'); const bp = add('j_blueprint'); moveLeftOf(bp, k2);
  r = play(['S_5']);
  ok(near(r.mult, 4), 'Blueprint copies the X (X2 x X2)', r.total);
});

// ------------------------------------------------------------------- Miraidon alone: Electric Terrain
await sec('miraidon', () => {
  start('G9MI');
  const terrain = DESIGNS.is_electric_terrain;
  ok(typeof terrain === 'function' && !terrain(), 'control: no Electric Terrain');
  const m = add('j_poke_miraidon');
  ok(terrain(), 'Miraidon held: Electric Terrain (live)');
  ok(/Hadron Engine: while you have this Joker it's always Electric Terrain X2 Mult, plus X0\.5 for each Future Paradox Joker \(Currently 0: X2 Mult\)/.test(plain(m)), 'text', plain(m));
  const r = play(['S_5']);
  ok(near(r.mult, 2), 'X2', r.total);
  debuff(m);
  ok(!terrain(), 'debuffed: no terrain');
  undebuff(m); sell(m);
  ok(!terrain(), 'sold: no terrain');
});

// ------------------------------------------------------------------- Ogerpon alone: a mask an Ante
await sec('ogerpon', () => {
  ok(['teal', 'wellspring', 'hearthflame', 'cornerstone', 'teal'].every((m, i) => mask_of_ante(i + 1) === m) && mask_of_ante(0) === 'cornerstone', 'the masks cycle from the Ante: 1 Teal, 2 Wellspring, 3 Hearthflame, 4 Cornerstone, 5 Teal (0 Cornerstone)');
  start('G9OG');
  const o = add('j_poke_ogerpon');
  const base = G.GAME.round_resets.hands;
  ok(form(o) === 'teal' && is_type(o, 'Grass') && drawn(o) === '{4,4}+{5,4}', 'Ante 1: Teal Mask, Grass, its own card {4,4}', [form(o), ex(o).ptype, drawn(o)]);
  ok(/Masks: wears a new mask each Ante; its type follows the mask \(Now: Teal Mask\) \(Its type never breaks Monotype\) Teal: \+30 Mult Wellspring: \+1 hand each round and X1\.5 Mult Hearthflame: X2\.5 Mult Cornerstone: \+150 Chips/.test(plain(o)), 'text', plain(o));
  let r = play(['S_5']);
  ok(near(r.mult, 1 + 30) && near(r.chips, 5 + 5), 'Teal: +30 Mult', r.total);
  round(); round();
  ok(cr().hands_left === base, 'Teal: no extra hand');
  round();
  ok(G.GAME.round_resets.ante === 2 && form(o) === 'wellspring' && is_type(o, 'Water') && !is_type(o, 'Grass') && drawn(o) === '{2,5}+{3,5}', 'Ante 2: Wellspring Mask, Water, its card {2,5}', [G.GAME.round_resets.ante, form(o), ex(o).ptype, drawn(o)]);
  ok(cr().hands_left === base + 1 && G.GAME.round_resets.hands === base, 'Wellspring: +1 hand this round', cr().hands_left);
  r = play(['S_5']);
  ok(near(r.mult, 1.5), 'Wellspring: X1.5', r.total);
  endRound(2);
  ok(cr().hands_left === 0, 'the round\'s end: the unused extra hand is taken back (never pays $1)', cr().hands_left);
  advance();
  ok(cr().hands_left === base + 1, 'every round of the Ante (the Big Blind too)', cr().hands_left);
  round();
  ok(G.GAME.blind.boss && cr().hands_left === base + 1, '... and the Boss');
  sell(o);
  ok(cr().hands_left === base, 'sold mid-round: the hand goes back', cr().hands_left);
  // Hearthflame, Cornerstone, then Teal again (ante set directly: the mask is read from the Ante, nothing stored)
  start('G9OG'); const o2 = add('j_poke_ogerpon');
  G.GAME.round_resets.ante = 3;
  r = play(['S_5']);
  ok(form(o2) === 'hearthflame' && is_type(o2, 'Fire') && drawn(o2) === '{8,4}+{9,4}' && near(r.mult, 2.5), 'Ante 3: Hearthflame Mask, Fire, its card {8,4}: X2.5', [form(o2), ex(o2).ptype, drawn(o2), r.total]);
  G.GAME.round_resets.ante = 4;
  r = play(['S_5']);
  ok(form(o2) === 'cornerstone' && is_type(o2, 'Earth') && drawn(o2) === '{6,5}+{7,5}' && near(r.chips, 5 + 5 + 150) && near(r.mult, 1), 'Ante 4: Cornerstone Mask, Earth, its card {6,5}: +150 Chips', [form(o2), ex(o2).ptype, drawn(o2), r.total]);
  G.GAME.round_resets.ante = 5;
  r = play(['S_5']);
  ok(form(o2) === 'teal' && is_type(o2, 'Grass') && near(r.mult, 31), 'Ante 5: Teal again', [form(o2), r.total]);
  // a Tera sticker still overrides the type; Blueprint copies the score, never the hand
  const bp = add('j_blueprint'); moveLeftOf(bp, o2);
  r = play(['S_5']);
  ok(near(r.mult, 61), 'Blueprint copies Teal\'s +30 (1 + 30 + 30)', r.total);
  start('G9OG'); const o3 = add('j_poke_ogerpon'); const bp3 = add('j_blueprint'); moveLeftOf(bp3, o3);
  G.GAME.round_resets.ante = 2; round();
  ok(cr().hands_left === base + 1, 'Blueprint never copies the Wellspring hand', cr().hands_left);
});

// ------------------------------------------------------------------- Energy: the standard shares; the fixed numbers stay
await sec('energy', () => {
  const steps = (n, fields, type) => {
    start('G9EN' + n);
    const j = add('j_poke_' + n);
    const got = {};
    for (let i = 0; i < 3; i++) { increment_energy(j, type); for (const [f] of fields) (got[f] || (got[f] = [])).push(Math.round(ex(j)[f] * 1e9) / 1e9); }
    for (const [f, want] of fields) ok(got[f].every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${f} ${want.join(' / ')}`, got[f]);
    return j;
  };
  steps('chienpao', [['Xmult_multi', [1.155, 1.21, 1.265]]], 'Water');
  let r = play(['S_5']);
  ok(near(r.mult, 1.265), 'energized Chien-Pao: a scored card X1.265', r.total);
  steps('koraidon', [['Xmult', [2.4, 2.8, 3.2]], ['Xmult_mod', [0.6, 0.7, 0.8]]], 'Dragon');
  r = play(['S_5']);
  ok(near(r.mult, 3.2), 'energized Koraidon: X3.2', r.total);
  steps('miraidon', [['Xmult', [2.4, 2.8, 3.2]], ['Xmult_mod', [0.6, 0.7, 0.8]]], 'Dragon');
  const og = steps('ogerpon', [['mult', [42, 54, 66]], ['Xmult', [1.8, 2.1, 2.4]], ['Xmult2', [3, 3.5, 4]], ['chips', [195, 240, 285]]], 'Grass');
  ok(ex(og).hands === 1, 'Ogerpon: the Wellspring hand fixed');
  r = play(['S_5']);
  ok(near(r.mult, 67), 'energized Ogerpon (Teal): +66 Mult', r.total);
  // its CURRENT type's Energy matches: Grass at Teal, Water at Wellspring (a fresh one: that one has its 3)
  start('G9ENOG'); const og2 = add('j_poke_ogerpon');
  ok(energy_can_use({ etype: 'Grass' }, null) === og2 && energy_can_use({ etype: 'Water' }, null) !== og2, 'Teal: a Grass Energy finds it, a Water Energy doesn\'t');
  G.GAME.round_resets.ante = 2; play(['S_5']);
  const wellUse = energy_can_use({ etype: 'Water' }, null), grassUse = energy_can_use({ etype: 'Grass' }, null);
  ok(wellUse === og2 && grassUse !== og2, 'Wellspring: a Water Energy finds it, a Grass Energy doesn\'t', [!!wellUse, !!grassUse]);
  // the Energy-inert three: no Energy of their type finds them
  for (const [n, t] of [['wochien', 'Grass'], ['tinglu', 'Earth'], ['chiyu', 'Fire']]) {
    start('G9ENI' + n);
    const j = add('j_poke_' + n);
    ok(P_CENTERS['j_poke_' + n].poke_no_energy_field === true && energy_can_use({ etype: t }, null) !== j, `${n}: Energy-inert (a ${t} Energy has nothing to raise)`);
  }
});

// ------------------------------------------------------------------- save / resume (a run is its recipe) and the replay stepper
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'G9RESUME', customDeck: { name: 'Gen9L', mods: ['pokermon'], params: { joker_slots: 12, consumable_slots: 10, blind_scaling: 0.05 },
    jokers: [{ key: 'j_poke_wochien' }, { key: 'j_poke_chienpao' }, { key: 'j_poke_tinglu' }, { key: 'j_poke_chiyu' }, { key: 'j_poke_koraidon' }, { key: 'j_poke_miraidon' },
      { key: 'j_poke_ogerpon' }, { key: 'j_poke_cherrim' }, { key: 'j_cavendish' }],
    consumables: [{ key: 'c_black_hole' }, { key: 'c_black_hole' }, { key: 'c_poke_water_energy' }] } });
  flush();
  const must = (a) => { const r = s.act(a); flush(); if (!r.ok) throw new Error(JSON.stringify(a) + ': ' + r.error); return r; };
  const reqs = [];
  must({ type: 'select_blind' });
  reqs.push(String(G.GAME.blind.chips));
  for (const p of G.consumeables.cards.slice()) if (key(p) === 'c_black_hole') must({ type: 'use', id: p.sort_id, targets: [] });
  let rounds = 0;
  while (rounds < 4 && G.STATE !== STATES.GAME_OVER) {
    if (G.STATE === STATES.BLIND_SELECT) { must({ type: 'select_blind' }); reqs.push(String(G.GAME.blind.chips)); }
    must({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
    must({ type: 'play' });
    if (G.STATE === STATES.ROUND_EVAL) { must({ type: 'cash_out' }); must({ type: 'next_round' }); rounds++; }
  }
  // mid-Blind of Ante 2 (Wellspring): the Water Energy now (the leftmost Water: Chien-Pao), then select the Blind
  const we = G.consumeables.cards.find((c) => key(c) === 'c_poke_water_energy');
  if (we) must({ type: 'use', id: we.sort_id, targets: [] });
  if (G.STATE === STATES.BLIND_SELECT) { must({ type: 'select_blind' }); reqs.push(String(G.GAME.blind.chips)); }
  const snap = () => [String(G.GAME.blind.chips), G.GAME.blind.chip_text, G.GAME.blind.disabled, G.GAME.poke_ruin_tablets, cr().hands_left, G.GAME.round_resets.ante, form(J('ogerpon')), ex(J('ogerpon')).ptype,
    ex(J('ogerpon')).well_round, ex(J('chienpao')).Xmult_multi, ex(J('chienpao')).energy_count, cherrim_sunny(J('cherrim')), G.GAME.round_resets.hands, G.GAME.dollars];
  const live = snap();
  ok(rounds === 4 && live[5] === 2 && live[6] === 'wellspring' && live[7] === 'Water' && live[3] === G.GAME.round && near(live[9], 1.155) && live[11] === true,
    'live, 4 rounds in (Ante 2): the cut requirement, Ogerpon Wellspring (Water) with its hand, energized Chien-Pao, the sun', live);
  ok(reqs.length >= 5 && reqs.every((x) => Number(x) > 0), 'every Blind selected had its requirement cut', reqs);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  ok(!r.stoppedAt && JSON.stringify(snap()) === JSON.stringify(live), 'resumed: the shown requirement, the hands, the mask, the type, the Energy, the sun come back exactly', [r.stoppedAt, snap(), live]);
  ok(drawn(J('ogerpon')) === '{2,5}+{3,5}', 'resumed: Ogerpon drawn in its Wellspring Mask');
  const st = Session.stepper(JSON.parse(JSON.stringify(s.recipe))); st.seek(st.total);
  ok(!st.error && JSON.stringify(snap()) === JSON.stringify(live), 'the replay stepper too', snap());
  // a resume stopped on the Boss (Ting-Lu's hands, Chi-Yu's disable): play on to it
  while (G.STATE !== STATES.GAME_OVER && !(G.GAME.blind.boss && G.STATE === STATES.SELECTING_HAND)) {
    if (G.STATE === STATES.BLIND_SELECT) must({ type: 'select_blind' });
    else if (G.STATE === STATES.ROUND_EVAL) { must({ type: 'cash_out' }); must({ type: 'next_round' }); }
    else { must({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) }); must({ type: 'play' }); }
  }
  // (s.act runs on the live session: the recipe resumed above was a separate rebuild; play the original's next moves)
  const boss = snap();
  ok(G.GAME.blind.boss && boss[2] === true, 'the Boss: disabled by Chi-Yu', boss);
  const r2 = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  ok(!r2.stoppedAt && JSON.stringify(snap()) === JSON.stringify(boss), 'resumed on the Boss: disabled, cut, +2 hands (Ting-Lu) exactly', [snap(), boss]);
});

// ------------------------------------------------------------------- the art: every cell's type is the joker's (the mask's)
if (ART) {
  await sec('cell types', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const CELLS = { wochien: ['Natdex', [20, 66], [21, 66], 'Grass'], chienpao: ['Natdex', [22, 66], [23, 66], 'Water'], tinglu: ['Natdex', [24, 66], [25, 66], 'Earth'],
      chiyu: ['Natdex', [26, 66], [27, 66], 'Fire'], koraidon: ['Natdex', [2, 67], [1, 67], 'Dragon'], miraidon: ['Natdex', [4, 67], [3, 67], 'Dragon'],
      ogerpon: ['Gen09', [4, 4], [5, 4], 'Grass'], ogerpon_wellspring: ['Gen09', [2, 5], [3, 5], 'Water'], ogerpon_hearthflame: ['Gen09', [8, 4], [9, 4], 'Fire'], ogerpon_cornerstone: ['Gen09', [6, 5], [7, 5], 'Earth'] };
    for (const [n, [sheet, pos, , want]] of Object.entries(CELLS)) {
      const r = typer.typeOfEntry({ atlas: 'AtlasJokersBasic' + sheet, pos });
      ok(r && r.ptype === want, `${n}'s cell ${sheet} {${pos}} shows ${want}`, r);
    }
    for (const n of NAMES) {
      const c = P_CENTERS['j_poke_' + n], [sheet, pos, soul] = CELLS[n];
      ok(c.atlas === 'poke_AtlasJokersBasic' + sheet + '391' && c.pos.x === pos[0] && c.pos.y === pos[1] && c.soul_pos.x === soul[0] && c.soul_pos.y === soul[1], `${n}: its own card is that cell (+ its soul, as the sprite table lists it)`, [c.atlas, c.pos, c.soul_pos]);
    }
    const { GEN9_LEGEND_FORMS: F } = await import('../../mods/pokermon/systems/anim.js');
    const at = (f, [, pos, soul]) => f.pos.x === pos[0] && f.pos.y === pos[1] && f.soul_pos.x === soul[0] && f.soul_pos.y === soul[1];
    ok(at(F.j_poke_ogerpon.wellspring, CELLS.ogerpon_wellspring) && at(F.j_poke_ogerpon.hearthflame, CELLS.ogerpon_hearthflame) && at(F.j_poke_ogerpon.cornerstone, CELLS.ogerpon_cornerstone) && !F.j_poke_ogerpon.teal,
      'Ogerpon\'s three other masks point at those typed cells (Teal is its own card)');
  });
} else console.log('(Pokermon art not on disk: the cell type checks are skipped; set MICATRO_MAIN)');

done();
