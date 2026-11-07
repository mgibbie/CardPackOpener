// Regional batch A (the owner's "Yes", 2026-11-03; jokers/pokejokers_regional.js; PORTING.md "Regional batch A"): the 18 Alolan forms and the
// regional pill. Own lines (their own pool entries beside the Kanto originals) and three BRANCH evolutions of Kanto Basics, an Energy used
// on them (gated by Pokermon rules rev ALOLA_REV, so runs recorded before it replay as recorded):
//   Alolan Rattata -> Raticate        Hoarder: scored 2s / 3s / 4s +5 Mult; Raticate X1 + X0.2 per consumable held (and keeps the +5).
//   Pikachu -> Alolan Raichu (Psychic Energy)   Surge Surfer: X1.5; each Planet used permanently adds X0.1.
//   Alolan Sandshrew -> Sandslash     Slush Rush: +30 Chips on a snowy round; Sandslash X2 on a snowy round, +30 Chips otherwise.
//   Alolan Vulpix -> Ninetales        scored Spades +4 Mult; Ninetales Snow Warning (every round snowy) and scored Spades X1.2.
//   Alolan Diglett -> Dugtrio         Golden hair: each Gold card held at end of round $1 more; Dugtrio held Gold X1.2.
//   Alolan Meowth -> Persian          Pay Day: $2 at end of round; Persian X1 + X0.1 per $10 you have.
//   Alolan Geodude -> Graveler -> Golem   Galvanize: scored Stone $1; Graveler +6 Mult; Golem X1.25, and held Stone counts as Steel.
//   Alolan Grimer -> Muk              Gluttony: when a Blind is selected, eat the lowest-ranked deck card; +3 Mult / X0.1 banked.
//   Exeggcute -> Alolan Exeggutor (Dragon Energy)   Long Neck: +1 hand size, X2 on a 5-card hand.
//   Cubone -> Alolan Marowak (Fire Energy)          Shadow Bone: X2, X2.5 if a playing card was destroyed this round.
// Every ability is FIRED through real hands / rounds with exact numbers; the pills are checked on describe() (the tooltip's data) —
// overworld/tests/micatro_pokermon_regional_ui_test.mjs checks them drawn.
//   node micatro/tests/mods/pokermon_alolan_test.mjs
import path from 'path';
// (Session runs here start with engineRev: 1 = the rules before Pages: these suites measure the mod alone)
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { P_CARDS, create_playing_card, get_current_pool } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import '../../mods/nacho/index.js';
import { poke_get_family_list, get_highest_evo, can_evolve_to_highest } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values, ALOLA_REV } from '../../mods/pokermon/systems/energy.js';
import { get_type, REGIONS } from '../../mods/pokermon/systems/types.js';
import { is_snowy } from '../../mods/pokermon/jokers/pokejokers_designs.js';
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
const NEW = ['alolan_rattata', 'alolan_raticate', 'alolan_raichu', 'alolan_sandshrew', 'alolan_sandslash', 'alolan_vulpix', 'alolan_ninetales',
  'alolan_diglett', 'alolan_dugtrio', 'alolan_meowth', 'alolan_persian', 'alolan_geodude', 'alolan_graveler', 'alolan_golem', 'alolan_grimer',
  'alolan_muk', 'alolan_exeggutor', 'alolan_marowak'];
const OLD = { pokermon: '3.9.1+r' + (ALOLA_REV - 1) };
const oldRules = (fn) => { PINS.RULES.pins = OLD; try { return fn(); } finally { PINS.RULES.pins = null; } };
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
function mk(spec, area, center) { return create_playing_card({ front: P_CARDS[spec], center: P_CENTERS[center || 'c_base'] }, area); }
/** Put cards in hand: a list of keys, or [key, center] pairs (the first is the leftmost). */
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
function play(list) { clearHand(); return playCards(cards(list)); }
function playCards(cs) {
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const events = (r && r.events) || [];
  const total = events.find((e) => e.type === 'hand_total') || {};
  return { cards: cs, events, total, mult: Number(total.mult), chips: Number(total.chips) };
}
/** Win the round in progress (High Card 2) -> ROUND_EVAL. */
function endRound(heldList) {
  clearHand();
  const held = heldList ? cards(heldList) : [];
  const c = hand(['S_2']);
  G.GAME.chips = G.GAME.blind.chips; if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush();
  return held;
}
/** From the round's end to the next Blind selected; `deal` = the 8 cards the round's first deal draws (the deck is emptied first). */
function advance(deal) {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  if (deal) stack(deal);
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  clearHand();
}
/** The draw pile becomes exactly these cards (the rest go to the discard pile): the next deal draws them. */
function stack(keys) {
  for (const c of G.deck.cards.slice()) { G.deck.remove_card(c); G.discard.emplace(c); }
  for (const k of keys) mk(k, G.deck);
}
const rounds = (n) => { for (let r = 0; r < n; r++) { endRound(); advance(); } };
const SPADES = ['S_2', 'S_3', 'S_4', 'S_5', 'S_6', 'S_7', 'H_8', 'C_9'];
const HEARTS = ['H_2', 'H_3', 'H_4', 'H_5', 'H_6', 'H_7', 'S_8', 'C_9'];
/** A fresh run with these jokers, and the first Blind selected (its first deal: `deal`, if given). */
function fresh(seed, jokers, deal, mods) {
  start(seed, {}, { noBlind: true, mods });
  const js = jokers.map((k) => add(k.startsWith('j_') ? k : 'j_poke_' + k));
  if (deal) stack(deal);
  act({ type: 'select_blind' }); flush();
  clearHand();
  return js;
}
const use = (c, jokers) => { const r = act({ type: 'use', id: c.sort_id, targets: [], joker_targets: jokers ? jokers.map((j) => j.sort_id) : undefined }); flush(); return r; };
const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
const G1 = 'poke_AtlasJokersBasicGen01391';

// ------------------------------------------------------------------- pin, static data, order, families, Energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= ALOLA_REV && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev ' + ALOLA_REV + '+ (regional batch A)', PINS.modPin('pokermon'));
  for (const n of NEW) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_regional'] || []).includes(n), n + ': defined with the regional forms');
  }
  ok((STATUS.PORTED_FILES['micatro/pokejokers_regional'] || []).length === 18, '18 regional jokers', (STATUS.PORTED_FILES['micatro/pokejokers_regional'] || []).length);
});
await sec('static', () => {
  start('ALOLAS');
  const S = 'poke_safari';
  // [rarity, cost, stage, type, rounds|undefined, x, y] — the Kanto line's slots; the cells on 3.9.1's Gen 1 sheet
  const WANT = {
    alolan_rattata: [1, 5, 'Basic', 'Dark', 5, 2, 2], alolan_raticate: [S, 7, 'One', 'Dark', undefined, 4, 2],
    alolan_raichu: [S, 8, 'One', 'Psychic', undefined, 6, 2],
    alolan_sandshrew: [1, 4, 'Basic', 'Water', 4, 8, 2], alolan_sandslash: [S, 6, 'One', 'Water', undefined, 10, 2],
    alolan_vulpix: [1, 4, 'Basic', 'Water', 5, 12, 2], alolan_ninetales: [S, 8, 'One', 'Fairy', undefined, 14, 2],
    alolan_diglett: [1, 5, 'Basic', 'Metal', 4, 0, 3], alolan_dugtrio: [2, 6, 'One', 'Metal', undefined, 2, 3],
    alolan_meowth: [1, 5, 'Basic', 'Dark', 5, 4, 3], alolan_persian: [S, 9, 'One', 'Dark', undefined, 6, 3],
    alolan_geodude: [1, 6, 'Basic', 'Lightning', 4, 8, 3], alolan_graveler: [S, 8, 'One', 'Lightning', 5, 10, 3], alolan_golem: [S, 10, 'Two', 'Lightning', undefined, 12, 3],
    alolan_grimer: [1, 4, 'Basic', 'Dark', 5, 14, 3], alolan_muk: [S, 6, 'One', 'Dark', undefined, 0, 4],
    alolan_exeggutor: [S, 10, 'One', 'Dragon', undefined, 2, 4], alolan_marowak: [S, 8, 'One', 'Fire', undefined, 6, 4],
  };
  ok(Object.keys(WANT).length === 18, '18 jokers');
  for (const [n, [rarity, cost, stage, type, rnds, x, y]] of Object.entries(WANT)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === type && c.config.extra.ptype === type && c.gen === 1 && c.poke_region === 'alolan',
      `${n}: ${rarity} $${cost}, ${stage}, ${type}, Gen 1 (its base species'), Alolan`, [c.rarity, c.cost, c.stage, c.ptype, c.gen, c.poke_region]);
    ok(c.config.extra.rounds === rnds, `${n}: ${rnds ? 'evolves after ' + rnds + ' rounds' : 'no round timer'}`, c.config.extra.rounds);
    ok(c.atlas === G1 && c.pos.x === x && c.pos.y === y && !c.soul_pos, `${n}: upstream 3.9.1 cell Gen01 {${x},${y}} (nothing to deploy)`, [c.atlas, c.pos]);
    ok(/^Alolan /.test(describe(add('j_poke_' + n)).name), n + ': named "Alolan ..."');
  }
  // the Kanto originals keep their own data
  ok(C('rattata').ptype === 'Colorless' && C('rattata').rarity === 1 && C('pikachu').ptype === 'Lightning' && C('exeggcute').ptype === 'Grass' && C('cubone').ptype === 'Earth'
    && C('raichu').ptype === 'Lightning' && C('marowak').ptype === 'Earth' && C('exeggutor').ptype === 'Grass', 'the Kanto forms keep their types and rarities');
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const run = (list) => { const i = keys.indexOf('j_poke_' + list[0]); return i >= 0 && list.every((k, n) => keys[i + n] === 'j_poke_' + k) ? true : keys.slice(i - 1, i + list.length + 1); };
  for (const ch of [['raticate', 'alolan_rattata', 'alolan_raticate', 'spearow'], ['raichu', 'mega_raichu_x', 'mega_raichu_y', 'alolan_raichu', 'sandshrew'], ['sandslash', 'alolan_sandshrew', 'alolan_sandslash'],
    ['ninetales', 'alolan_vulpix', 'alolan_ninetales'], ['dugtrio', 'alolan_diglett', 'alolan_dugtrio', 'meowth'], ['persian', 'alolan_meowth', 'alolan_persian'],
    ['golem', 'alolan_geodude', 'alolan_graveler', 'alolan_golem'], ['muk', 'alolan_grimer', 'alolan_muk'], ['exeggutor', 'alolan_exeggutor', 'cubone'], ['marowak', 'alolan_marowak']]) {
    ok(run(ch) === true, 'Pokédex order: ' + ch.join(' > '), run(ch));
  }
  const FAM = {
    alolan_rattata: 'alolan_rattata,alolan_raticate', alolan_sandshrew: 'alolan_sandshrew,alolan_sandslash', alolan_vulpix: 'alolan_vulpix,alolan_ninetales',
    alolan_diglett: 'alolan_diglett,alolan_dugtrio', alolan_meowth: 'alolan_meowth,alolan_persian', alolan_geodude: 'alolan_geodude,alolan_graveler,alolan_golem',
    alolan_grimer: 'alolan_grimer,alolan_muk', pikachu: 'pichu,pikachu,raichu,alolan_raichu,mega_raichu_x,mega_raichu_y',
    exeggcute: 'exeggcute,exeggutor,alolan_exeggutor', cubone: 'cubone,marowak,alolan_marowak',
    rattata: 'rattata,raticate', sandshrew: 'sandshrew,sandslash', geodude: 'geodude,graveler,golem', grimer: 'grimer,muk',
  };
  for (const [n, f] of Object.entries(FAM)) ok(fam(n) === f, 'family: ' + f, fam(n));
  oldRules(() => ok(fam('pikachu') === 'pichu,pikachu,raichu,mega_raichu_x,mega_raichu_y' && fam('cubone') === 'cubone,marowak' && fam('exeggcute') === 'exeggcute,exeggutor',
    'old rules: the Kanto lines without their Alolan members', [fam('pikachu'), fam('cubone')]));
  ok(['gold_money', 'pay_money', 'stone_money', 'h_size', 'eat_mult', 'eat_Xmult', 'surf_Xmult', 'rounds'].every((f) => !(f in energy_values)), 'fixed: the $, the hand size; the banks never take Energy');
});

// ------------------------------------------------------------------- the regional pill (incl. the retrofitted Galarian / Hisuian forms)
await sec('pills', () => {
  start('ALOLAPILL', {}, { mods: ['nacho'] });
  const pills = (k) => describe(add(k)).badges.filter((b) => b && b.key !== 'mod').map((b) => [b.label, b.colour]);
  for (const n of NEW) {
    const b = pills('j_poke_' + n);
    ok(b.length === 3 && b[1][0] === 'Alolan' && b[1][1] === REGIONS.alolan.colour && b[2][0] === C(n).ptype,
      n + ': its pills are its rarity, "Alolan" (' + REGIONS.alolan.colour + '), then its type', b);
  }
  for (const [k, label] of [['j_poke_hisuian_qwilfish', 'Hisuian'], ['j_nacho_galarian_meowth', 'Galarian'], ['j_nacho_hisuian_zorua', 'Hisuian'], ['j_nacho_hisuian_zoroark', 'Hisuian'],
    ['j_nacho_hisuian_sliggoo', 'Hisuian'], ['j_nacho_hisuian_goodra', 'Hisuian'], ['j_nacho_hisuian_sneasel', 'Hisuian']]) {
    if (!P_CENTERS[k]) { ok(false, k + ' registered', k); continue; }
    const b = pills(k);
    ok(b.length === 3 && b[1][0] === label && b[1][1] === REGIONS[label.toLowerCase()].colour, k + ': retrofitted "' + label + '" pill before its type', b);
  }
  for (const k of ['j_poke_rattata', 'j_poke_raichu', 'j_poke_perrserker', 'j_poke_overqwil', 'j_poke_obstagoon', 'j_poke_clodsire']) {
    if (!P_CENTERS[k]) continue;
    const b = pills(k);
    ok(b.length === 2 && !b.some(([l]) => /Alolan|Galarian|Hisuian|Paldean/.test(l)), k + ': no region pill (not a regional form)', b);
  }
  // white text on each region colour passes WCAG AA
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  for (const [r, v] of Object.entries(REGIONS)) ok(1.05 / (lum(v.colour) + 0.05) >= 4.5, r + ' pill: white text contrast >= 4.5', (1.05 / (lum(v.colour) + 0.05)).toFixed(2));
});

// ------------------------------------------------------------------- the own lines in the shop pool
await sec('shop', () => {
  start('ALOLASHOP');
  const [common] = get_current_pool('Joker', 0.1);
  const [unc] = get_current_pool('Joker', 0.8);
  const basics = ['alolan_rattata', 'alolan_sandshrew', 'alolan_vulpix', 'alolan_diglett', 'alolan_meowth', 'alolan_geodude', 'alolan_grimer'];
  ok(basics.every((n) => common.includes('j_poke_' + n)), 'the 7 own-line Basics are in the Common pool', basics.filter((n) => !common.includes('j_poke_' + n)));
  ok(unc.includes('j_poke_alolan_dugtrio'), 'Alolan Dugtrio is in the Uncommon pool (as Dugtrio)');
  ok(NEW.filter((n) => C(n).rarity === 'poke_safari').every((n) => !common.includes('j_poke_' + n) && !unc.includes('j_poke_' + n)), 'the Safari ones never roll');
  // a Kanto Rattata held doesn't keep the Alolan one out (its own line), and vice versa
  add('j_poke_rattata'); add('j_poke_alolan_vulpix');
  const [c2] = get_current_pool('Joker', 0.1);
  ok(c2.includes('j_poke_alolan_rattata') && !c2.includes('j_poke_rattata') && c2.includes('j_poke_vulpix') && !c2.includes('j_poke_alolan_vulpix'), 'Kanto Rattata held: Alolan Rattata still offered; Alolan Vulpix held: Kanto Vulpix still offered (only the held one is out)');
  // a real shop, rerolled: an own-line Alolan joker turns up
  let seen = null;
  for (let s = 0; s < 8 && !seen; s++) {
    start('ALOLASHOP' + s);
    endRound(); act({ type: 'cash_out' }); flush();
    for (let i = 0; i < 60 && G.STATE === STATES.SHOP && !seen; i++) {
      const c = G.shop_jokers.cards.find((x) => /^j_poke_alolan_/.test(key(x)));
      if (c) seen = key(c);
      G.GAME.dollars = 1000; act({ type: 'reroll_shop' }); flush();
    }
  }
  ok(!!seen && basics.concat('alolan_dugtrio').includes(seen.slice(7)), 'a real shop offers an own-line Alolan joker', seen);
});

// ------------------------------------------------------------------- Alolan Rattata / Raticate, Hoarder
await sec('rattata', () => {
  const [r] = fresh('ARAT', ['alolan_rattata']);
  let t = play(['S_2', 'H_2']);
  ok(near(t.mult, 2 + 5 + 5), 'Alolan Rattata: a Pair of 2s, +5 Mult each', t.total);
  t = play(['S_4', 'H_4', 'D_3', 'C_3']);
  ok(near(t.mult, 2 + 4 * 5), 'Two Pair 4s and 3s: +5 Mult each of the four', t.total);
  t = play(['S_5', 'H_5']);
  ok(near(t.mult, 2), 'a Pair of 5s: nothing', t.total);
  t = play([['S_2', 'm_stone']]);
  ok(near(t.mult, 1), 'a Stone card (no rank): nothing', t.total);
  rounds(5);
  ok(key(r) === 'j_poke_alolan_raticate' && get_type(r) === 'Dark', 'Alolan Rattata -> Alolan Raticate after 5 rounds', key(r));
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2), 'Alolan Raticate, no consumables: X1 (nothing)', t.total);
  add('c_poke_darkness_energy'); add('c_pluto');
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 1.4), '2 consumables held: X1.4', t.total);
  t = play(['S_3', 'H_3']);
  ok(near(t.mult, (2 + 10) * 1.4), 'and a Pair of 3s keeps Rattata\'s +5 Mult each: (2 + 10) x 1.4', t.total);
  ok(/Currently 2: X1.4 Mult/.test(plain(r)), 'its text counts them', plain(r));
});

// ------------------------------------------------------------------- Pikachu -> Alolan Raichu (Psychic Energy); Surge Surfer
await sec('raichu', () => {
  start('ARAI1');
  let p = add('j_poke_pikachu');
  ok(/Alolan form: a Psychic Energy used on it evolves it into Alolan Raichu/.test(plain(p)), 'Pikachu\'s text: its 3.9.1 box, then the Alolan box', plain(p));
  let r = use(add('c_poke_psychic_energy'), [p]);
  ok(r && r.ok !== false && key(p) === 'j_poke_alolan_raichu' && get_type(p) === 'Psychic', 'Pikachu + a Psychic Energy (picked): Alolan Raichu (Psychic)', [key(p), r && r.ok]);
  // refused: debuffed, an Everstone, the old rules; a Lightning Energy energizes it as before
  start('ARAI2');
  p = add('j_poke_pikachu');
  const en = add('c_poke_psychic_energy');
  debuff(p); use(en, [p]);
  ok(key(p) === 'j_poke_pikachu' && G.consumeables.cards.includes(en), 'a debuffed Pikachu: refused', key(p));
  undebuff(p);
  const es = add('j_poke_everstone');
  use(en, [p]);
  ok(key(p) === 'j_poke_pikachu' && G.consumeables.cards.includes(en), 'an Everstone owned: refused', key(p));
  es.remove(); flush();
  oldRules(() => use(en, [p]));
  ok(key(p) === 'j_poke_pikachu' && G.consumeables.cards.includes(en), 'a move recorded on r' + (ALOLA_REV - 1) + ': refused, as it was', key(p));
  use(add('c_poke_lightning_energy'), [p]);
  ok(key(p) === 'j_poke_pikachu' && ex(p).energy_count === 1, 'a Lightning Energy on Pikachu: energized as before (no evolution)', [key(p), ex(p).energy_count]);
  use(en, [p]);
  ok(key(p) === 'j_poke_alolan_raichu' && ex(p).energy_count === 1 && near(ex(p).Xmult, 1.8), '... live: Alolan Raichu, Pikachu\'s Energy carried (X1.8)', [key(p), ex(p).energy_count, ex(p).Xmult]);
  // the Kanto path: a Thunder Stone still makes Raichu
  const [k] = fresh('ARAI3', ['pikachu']);
  use(add('c_poke_thunderstone'), [k]);
  endRound(); flush();
  ok(key(k) === 'j_poke_raichu', 'Pikachu + a Thunder Stone: Raichu, as ever', key(k));
  // Surge Surfer
  const [a] = fresh('ARAI4', ['alolan_raichu']);
  let t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 1.5), 'Alolan Raichu: X1.5', t.total);
  use(add('c_mercury')); use(add('c_mercury'));
  ok(near(ex(a).surf_Xmult, 0.2), '2 Planets used: +X0.2 banked', ex(a).surf_Xmult);
  use(add('c_black_hole'));
  ok(near(ex(a).surf_Xmult, 0.2), 'a Black Hole (Spectral) adds nothing', ex(a).surf_Xmult);
  use(add('c_poke_psychic_energy'), [a]);
  use(add('c_mercury'));
  ok(near(ex(a).surf_Xmult, 0.2 + 0.12) && near(ex(a).Xmult, 1.8), 'energized: Xmult 1.8, the next Planet adds 0.12 (the bank is never retroactive)', [ex(a).Xmult, ex(a).surf_Xmult]);
  t = play(['S_A']);
  ok(near(t.mult, 2 * (1.8 + 0.32)), 'X(1.8 + 0.32) on High Card (level 2 after the Black Hole)', t.total);
  // the highest form: Raichu or Alolan Raichu live; Raichu only on the old rules
  start('ARAI5');
  const p2 = add('j_poke_pikachu');
  ok(can_evolve_to_highest(p2) && ['raichu', 'alolan_raichu'].includes(get_highest_evo(p2)), 'live: Pikachu\'s highest form is Raichu or Alolan Raichu', get_highest_evo(p2));
  oldRules(() => ok(get_highest_evo(p2) === 'raichu', 'old rules: Raichu only (Transformation replays as recorded)', get_highest_evo(p2)));
});

// ------------------------------------------------------------------- the house snow: is_snowy, Sandshrew / Sandslash, Ninetales, Eiscue
await sec('snow', () => {
  let [s] = fresh('ASNOW1', ['alolan_sandshrew'], SPADES);
  ok(is_snowy(s), 'Spades held most on the first deal: snowy', ex(s));
  let t = play(['S_K', 'H_K']);
  ok(near(t.chips, 10 + 20 + 30), 'Alolan Sandshrew: +30 Chips on a snowy round', t.total);
  [s] = fresh('ASNOW2', ['alolan_sandshrew'], HEARTS);
  ok(!is_snowy(s), 'Hearts held most: not snowy');
  t = play(['S_K', 'H_K']);
  ok(near(t.chips, 10 + 20), 'not snowy: nothing', t.total);
  ok(/Not snowy/.test(plain(s)), 'its text says so', plain(s));
  // a Kyogre locks the forecast to rain: no snow from the Spades — but an Alolan Ninetales still brings it (snow ADDS)
  [s] = fresh('ASNOW3', ['alolan_sandshrew', 'kyogre'], SPADES);
  ok(!is_snowy(s), 'Kyogre held: Castform\'s forecast is Rainy, so Spades bring no snow');
  const nt = add('j_poke_alolan_ninetales');
  ok(is_snowy(s), 'an Alolan Ninetales gained mid-round: snowy at once (live)');
  t = play(['S_K', 'H_K']);
  ok(near(t.chips, 10 + 20 + 30) && near(t.mult, 2 * 1.2), 'with Kyogre and Ninetales: +30 Chips (the snow), the Spade X1.2', t.total);
  debuff(nt);
  ok(!is_snowy(s), 'Ninetales debuffed: no snow');
  undebuff(nt);
  nt.remove(); flush();
  ok(!is_snowy(s), 'Ninetales sold: no snow');
  // the shop: only Snow Warning counts
  const sw = add('j_poke_alolan_ninetales');
  endRound(); act({ type: 'cash_out' }); flush();
  ok(G.STATE === STATES.SHOP && is_snowy(s), 'in the shop with Ninetales: snowy');
  sw.remove(); flush();
  ok(!is_snowy(s), 'in the shop without it: not');
  // Sandslash: X2 snowy, +30 Chips otherwise
  [s] = fresh('ASNOW4', ['alolan_sandslash'], SPADES);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 2) && near(t.chips, 30), 'Alolan Sandslash on a snowy round: X2', t.total);
  [s] = fresh('ASNOW5', ['alolan_sandslash'], HEARTS);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2) && near(t.chips, 30 + 30), 'not snowy: +30 Chips', t.total);
  add('j_poke_alolan_ninetales');
  t = play(['H_K', 'D_K']);
  ok(near(t.mult, 2 * 2), '... with an Alolan Ninetales gained: X2 (every round is snowy)', t.total);
  // Sandshrew evolves after 4 rounds
  [s] = fresh('ASNOW6', ['alolan_sandshrew']);
  rounds(4);
  ok(key(s) === 'j_poke_alolan_sandslash', 'Alolan Sandshrew -> Alolan Sandslash after 4 rounds', key(s));
  // Vulpix -> Ninetales
  const [v] = fresh('AVUL', ['alolan_vulpix']);
  t = play(['S_K', 'S_9', 'S_7', 'S_4', 'S_2']);
  ok(near(t.mult, 4 + 5 * 4), 'Alolan Vulpix: a Spade Flush, +4 Mult each', t.total);
  t = play(['H_K', 'C_K']);
  ok(near(t.mult, 2), 'no Spades: nothing', t.total);
  rounds(5);
  ok(key(v) === 'j_poke_alolan_ninetales' && get_type(v) === 'Fairy', 'Alolan Vulpix (Water) -> Alolan Ninetales (Fairy) after 5 rounds', [key(v), get_type(v)]);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 1.2), 'Alolan Ninetales: a scored Spade X1.2', t.total);
  // Castform's form never changes for it (its Forecast stands)
  const [cf] = fresh('ACAST', ['castform', 'alolan_ninetales'], HEARTS);
  ok(ex(cf).form === 'sunny', 'Castform with an Alolan Ninetales on a Hearts deal: still Sunny (snow adds, its Forecast stands)', ex(cf).form);
  // Eiscue: its ice re-forms on a snowy round — with Ninetales, every round (live); the old rules read the forecast only
  for (const [label, old] of [['live', false], ['old rules', true]]) {
    const [e] = fresh('AEISC' + label, ['eiscue', 'alolan_ninetales']);
    ex(e).form = 'noice';
    endRound();
    if (old) oldRules(() => advance(HEARTS)); else advance(HEARTS);
    ok(ex(e).form === (old ? 'noice' : 'ice'), label + ': a Hearts deal with an Alolan Ninetales held: Eiscue\'s ice ' + (old ? 'stays broken (as recorded)' : 're-forms'), ex(e).form);
  }
  ok(/or an Alolan Ninetales held/.test(plain(add('j_poke_eiscue'))), 'Eiscue\'s text names it', plain(add('j_poke_eiscue')));
});

// ------------------------------------------------------------------- Alolan Diglett / Dugtrio, Golden hair
await sec('diglett', () => {
  const [d] = fresh('ADIG', ['alolan_diglett']);
  let $0 = G.GAME.dollars;
  endRound([['S_K', 'm_gold'], ['H_K', 'm_gold'], 'D_5']);
  ok(G.GAME.dollars - $0 === 2 * (3 + 1), 'Alolan Diglett: 2 Gold cards held at end of round pay $3 + $1 each', G.GAME.dollars - $0);
  advance(); rounds(3);
  ok(key(d) === 'j_poke_alolan_dugtrio' && get_type(d) === 'Metal', 'Alolan Diglett -> Alolan Dugtrio after 4 rounds', key(d));
  clearHand();
  cards([['D_3', 'm_gold'], ['C_4', 'm_gold'], 'D_5']);
  const t = playCards(cards(['S_K', 'H_K']));
  ok(near(t.mult, 2 * 1.2 * 1.2), 'Alolan Dugtrio: 2 Gold held X1.2 each', t.total);
  $0 = G.GAME.dollars;
  endRound([['S_K', 'm_gold']]);
  ok(G.GAME.dollars - $0 === 3 + 1, '... and Golden hair stays ($1 more)', G.GAME.dollars - $0);
  // debuffed Gold: nothing
  const [d2] = fresh('ADIG2', ['alolan_diglett']);
  clearHand();
  const g = cards([['S_K', 'm_gold']])[0]; debuff(g);
  $0 = G.GAME.dollars;
  const c = hand(['S_2']); G.GAME.chips = G.GAME.blind.chips;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush();
  ok(G.GAME.dollars === $0, 'a debuffed Gold card: no $ (neither its own nor Diglett\'s)', G.GAME.dollars - $0);
  void d2;
});

// ------------------------------------------------------------------- Alolan Meowth / Persian, Pay Day
await sec('meowth', () => {
  const [m] = fresh('AMEO', ['alolan_meowth']);
  endRound(); flush();
  ok(m.config.center.calc_dollar_bonus(m.config.center, m) === 2, 'Alolan Meowth: $2 at end of round (a cash-out row)');
  let $0 = G.GAME.dollars;
  act({ type: 'cash_out' }); flush();
  const got = G.GAME.dollars - $0;
  advance(); rounds(4);
  ok(key(m) === 'j_poke_alolan_persian', 'Alolan Meowth -> Alolan Persian after 5 rounds', key(m));
  G.GAME.dollars = 37;
  let t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 1.3), 'Alolan Persian with $37: X1.3', t.total);
  G.GAME.dollars = -5;
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2), 'in debt: X1 (nothing)', t.total);
  G.GAME.dollars = 9;
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2), '$9: X1', t.total);
  // the cash-out pays the $2 (compare with no Meowth)
  fresh('AMEO0', []);
  endRound(); flush(); $0 = G.GAME.dollars; act({ type: 'cash_out' }); flush();
  ok(got - (G.GAME.dollars - $0) === 2, 'the cash-out pays $2 more with Alolan Meowth', [got, G.GAME.dollars - $0]);
});

// ------------------------------------------------------------------- Alolan Geodude / Graveler / Golem, Galvanize
await sec('geodude', () => {
  const [g] = fresh('AGEO', ['alolan_geodude']);
  let $0 = G.GAME.dollars;
  let t = play([['S_K', 'm_stone'], ['H_K', 'm_stone']]);
  ok(G.GAME.dollars - $0 === 2, 'Alolan Geodude: 2 scored Stone cards, $1 each', G.GAME.dollars - $0);
  rounds(4);
  ok(key(g) === 'j_poke_alolan_graveler', 'Alolan Geodude -> Alolan Graveler after 4 rounds', key(g));
  $0 = G.GAME.dollars;
  t = play([['S_K', 'm_stone'], ['H_K', 'm_stone']]);
  ok(G.GAME.dollars - $0 === 2 && near(t.mult, 1 + 6 + 6), 'Alolan Graveler: $1 and +6 Mult per scored Stone', [G.GAME.dollars - $0, t.total]);
  rounds(5);
  ok(key(g) === 'j_poke_alolan_golem' && C('alolan_golem').stage === 'Two', 'Alolan Graveler -> Alolan Golem after 5 rounds', key(g));
  $0 = G.GAME.dollars;
  t = play([['S_K', 'm_stone'], ['H_K', 'm_stone']]);
  ok(G.GAME.dollars - $0 === 2 && near(t.mult, 1 * 1.25 * 1.25), 'Alolan Golem: $1 and X1.25 per scored Stone', [G.GAME.dollars - $0, t.total]);
  // held Stone counts as Steel: X1.5 each
  clearHand();
  cards([['D_3', 'm_stone'], ['C_4', 'm_stone'], 'D_5']);
  t = playCards(cards(['S_K', 'H_K']));
  ok(near(t.mult, 2 * 1.5 * 1.5), 'held Stone cards count as Steel: X1.5 each', t.total);
  // with Registeel (held Steel X2): the best rule, once (never stacking)
  const rs = add('j_poke_registeel');
  clearHand();
  cards([['D_3', 'm_stone'], ['C_4', 'm_steel']]);
  t = playCards(cards(['S_K', 'H_K']));
  ok(near(t.mult, 2 * 2 * 2), 'with Registeel: a held Stone and a held Steel each X2 (the best rule, not X1.5 x X2)', t.total);
  rs.remove(); flush();
  // a Red Seal repeats it; debuffed: nothing
  clearHand();
  const rd = cards([['D_3', 'm_stone']])[0]; rd.set_seal('Red', true);
  t = playCards(cards(['S_K', 'H_K']));
  ok(near(t.mult, 2 * 1.5 * 1.5), 'a Red Seal Stone held: X1.5 twice', t.total);
  clearHand();
  const db = cards([['D_3', 'm_stone']])[0]; debuff(db);
  t = playCards(cards(['S_K', 'H_K']));
  ok(near(t.mult, 2), 'a debuffed held Stone: nothing', t.total);
  // without Golem: a held Stone gives nothing
  fresh('AGEO2', ['alolan_graveler']);
  clearHand();
  cards([['D_3', 'm_stone']]);
  t = playCards(cards(['S_K', 'H_K']));
  ok(near(t.mult, 2), 'no Alolan Golem: a held Stone card gives nothing', t.total);
});

// ------------------------------------------------------------------- Alolan Grimer / Muk, Gluttony
await sec('grimer', () => {
  start('AGRIM', {}, { noBlind: true });
  const g = add('j_poke_alolan_grimer');
  for (const c of G.playing_cards.slice()) c.remove();
  flush();
  const stone = mk('S_2', G.deck, 'm_stone');
  const fives = [mk('H_5', G.deck), mk('D_5', G.deck)];
  const king = mk('C_K', G.deck);
  for (let i = 0; i < 6; i++) mk('C_A', G.deck);
  act({ type: 'select_blind' }); flush();
  const gone = fives.filter((c) => c.removed);
  ok(gone.length === 1 && !stone.removed && !king.removed && G.playing_cards.length === 9, 'Gluttony: the lowest-ranked card (a 5; the Stone 2 has no rank) is destroyed, one of the tied 5s', [gone.length, stone.removed, G.playing_cards.length]);
  ok(near(ex(g).eat_mult, 3), '+3 Mult banked', ex(g).eat_mult);
  clearHand();
  let t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 + 3), 'Alolan Grimer gives its +3 Mult', t.total);
  // the tie pick is the seeded stream: the same seed eats the same card
  start('AGRIM', {}, { noBlind: true });
  add('j_poke_alolan_grimer');
  for (const c of G.playing_cards.slice()) c.remove();
  flush();
  mk('S_2', G.deck, 'm_stone'); const f2 = [mk('H_5', G.deck), mk('D_5', G.deck)]; mk('C_K', G.deck); for (let i = 0; i < 6; i++) mk('C_A', G.deck);
  act({ type: 'select_blind' }); flush();
  ok(f2.findIndex((c) => c.removed) === fives.findIndex((c) => c.removed), 'the tie is seeded: the same seed eats the same 5');
  // Blueprint doesn't eat twice
  start('AGRIM2', {}, { noBlind: true });
  const g2 = add('j_poke_alolan_grimer'); add('j_blueprint');
  const n0 = G.playing_cards.length;
  act({ type: 'select_blind' }); flush();
  ok(G.playing_cards.length === n0 - 1 && near(ex(g2).eat_mult, 3), 'with a Blueprint: one card eaten, +3 once', [n0 - G.playing_cards.length, ex(g2).eat_mult]);
  // Energy: +3.6 from then on (the bank never retroactive); evolves after 5 rounds into Muk, which keeps the Mult and banks X
  increment_energy(g2, 'Dark');
  endRound(); advance();
  ok(near(ex(g2).eat_mult, 3 + 3.6), 'energized: the next eat banks +3.6 (3 + 3.6)', ex(g2).eat_mult);
  for (let i = 0; i < 3; i++) { endRound(); advance(); }
  ok(key(g2) === 'j_poke_alolan_grimer', 'still Grimer after 4 rounds');
  const kept = ex(g2).eat_mult;
  endRound(); advance();
  ok(key(g2) === 'j_poke_alolan_muk' && near(ex(g2).eat_mult, kept) && near(ex(g2).Xmult_mod, 0.12), 'Alolan Grimer -> Alolan Muk after 5 rounds: the Mult kept, its gain energized (X0.12)', [key(g2), ex(g2).eat_mult, ex(g2).Xmult_mod]);
  ok(near(ex(g2).eat_Xmult, 1.12), '... and it ate on that Blind: X1.12', ex(g2).eat_Xmult);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, (2 + kept) * 1.12), 'Alolan Muk: +Mult kept and X1.12', t.total);
  // nothing ranked: nothing eaten
  start('AGRIM3', {}, { noBlind: true });
  const g3 = add('j_poke_alolan_grimer');
  for (const c of G.playing_cards.slice()) c.remove();
  flush();
  for (let i = 0; i < 8; i++) mk('S_2', G.deck, 'm_stone');
  act({ type: 'select_blind' }); flush();
  ok(G.playing_cards.length === 8 && ex(g3).eat_mult === 0, 'only Stone cards: nothing eaten, nothing gained', [G.playing_cards.length, ex(g3).eat_mult]);
});

// ------------------------------------------------------------------- Exeggcute -> Alolan Exeggutor (Dragon); Long Neck
await sec('exeggutor', () => {
  start('AEGG1');
  let e = add('j_poke_exeggcute');
  ok(/Alolan form: a Dragon Energy used on it evolves it into Alolan Exeggutor/.test(plain(e)), 'Exeggcute\'s text: the Alolan box', plain(e));
  const h0 = G.hand.config.card_limit;
  use(add('c_poke_dragon_energy'), [e]);
  ok(key(e) === 'j_poke_alolan_exeggutor' && get_type(e) === 'Dragon' && G.hand.config.card_limit === h0 + 1, 'Exeggcute + a Dragon Energy: Alolan Exeggutor (Dragon), +1 hand size', [key(e), G.hand.config.card_limit - h0]);
  e.remove(); flush();
  ok(G.hand.config.card_limit === h0, 'sold: the hand size goes back');
  // nothing picked: the leftmost it can ENERGIZE first (a Dragon joker), else the leftmost it evolves
  start('AEGG2');
  e = add('j_poke_exeggcute'); const dr = add('j_poke_dratini');
  use(add('c_poke_dragon_energy'));
  ok(key(e) === 'j_poke_exeggcute' && ex(dr).energy_count === 1, 'nothing picked, a Dragon joker held: it energizes the Dragon joker', [key(e), ex(dr).energy_count]);
  dr.remove(); flush();
  use(add('c_poke_dragon_energy'));
  ok(key(e) === 'j_poke_alolan_exeggutor', 'nothing picked, no Dragon joker: it evolves the leftmost Exeggcute', key(e));
  // Kanto path: a Leaf Stone still makes Exeggutor
  const [k] = fresh('AEGG3', ['exeggcute']);
  use(add('c_poke_leafstone'), [k]);
  endRound(); flush();
  ok(key(k) === 'j_poke_exeggutor', 'Exeggcute + a Leaf Stone: Exeggutor, as ever', key(k));
  const [x] = fresh('AEGG4', ['alolan_exeggutor']);
  let t = play(['S_K', 'S_9', 'S_7', 'S_4', 'S_2']);
  ok(near(t.mult, 4 * 2), 'Alolan Exeggutor: a 5-card Flush X2', t.total);
  t = play(['S_K', 'H_K', 'D_9', 'C_7', 'S_4']);
  ok(near(t.mult, 2 * 2), 'a Pair with 3 kickers (5 played): X2', t.total);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2), '2 cards: nothing', t.total);
  void x;
});

// ------------------------------------------------------------------- Cubone -> Alolan Marowak (Fire); Shadow Bone
await sec('marowak', () => {
  start('AMAR1');
  let c = add('j_poke_cubone');
  ok(/Alolan form: a Fire Energy used on it evolves it into Alolan Marowak/.test(plain(c)), 'Cubone\'s text: the Alolan box', plain(c));
  use(add('c_poke_fire_energy'), [c]);
  ok(key(c) === 'j_poke_alolan_marowak' && get_type(c) === 'Fire', 'Cubone + a Fire Energy: Alolan Marowak (Fire)', key(c));
  oldRules(() => { const c2 = add('j_poke_cubone'); const en = add('c_poke_fire_energy'); use(en, [c2]); ok(key(c2) === 'j_poke_cubone' && G.consumeables.cards.includes(en), 'old rules: refused'); });
  // Kanto path: Cubone still evolves into Marowak (20 consumables used)
  const [k] = fresh('AMAR2', ['cubone']);
  ex(k).consumables_used = 20;
  endRound(); flush();
  ok(key(k) === 'j_poke_marowak', 'Cubone after 20 consumables: Marowak, as ever', key(k));
  const [m] = fresh('AMAR3', ['alolan_marowak']);
  let t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 2), 'Alolan Marowak: X2', t.total);
  ok(/This round: No/.test(plain(m)), 'its text: nothing destroyed yet');
  t = play([['S_A', 'm_glass']]);
  const shattered = G.GAME.poke_destroyed_round === G.GAME.round;
  // destroy one with The Hanged Man for certain
  clearHand();
  const hc = cards(['D_3'])[0];
  act({ type: 'highlight', ids: [hc.sort_id] });
  const hm = add('c_hanged_man');
  act({ type: 'use', id: hm.sort_id, targets: [hc.sort_id] }); flush();
  ok(hc.removed, 'The Hanged Man destroys a card');
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 2.5), 'a card destroyed this round: X2.5', t.total);
  ok(/This round: Yes/.test(plain(m)), 'its text says so');
  endRound(); advance();
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 2), 'the next round: X2 again', t.total);
  // Grimer's Gluttony (when the Blind is selected) counts for that round; a Cubone evolving mid-round sees an earlier destruction
  const [m2] = fresh('AMAR4', ['alolan_marowak', 'alolan_grimer']);
  t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 2.5 + 3), 'with Alolan Grimer\'s Blind-select eat: X2.5 that round (Marowak first, then Grimer\'s +3)', t.total);
  start('AMAR5', {}, { noBlind: true });
  add('j_poke_alolan_grimer');
  const cu = add('j_poke_cubone');
  act({ type: 'select_blind' }); flush(); clearHand();
  use(add('c_poke_fire_energy'), [cu]);
  t = play(['S_K', 'H_K']);
  ok(key(cu) === 'j_poke_alolan_marowak' && near(t.mult, (2 + 3) * 2.5), 'a Cubone evolved after the eat: X2.5 (the round is marked run-wide)', [key(cu), t.total]);
  void shattered; void m2;
});

// ------------------------------------------------------------------- Energy (1 / 2 / 3)
await sec('energy', () => {
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const steps = (n, field, type, want) => {
    start('AEN' + n);
    const j = add('j_poke_' + n), got = [];
    for (let i = 0; i < 3; i++) { increment_energy(j, type); got.push(r4(ex(j)[field])); }
    ok(got.every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${field} ${want.join(' / ')}`, got);
    return j;
  };
  steps('alolan_rattata', 'mult', 'Dark', [7, 9, 11]);
  steps('alolan_raticate', 'Xmult_mod', 'Dark', [0.24, 0.28, 0.32]); steps('alolan_raticate', 'mult', 'Dark', [7, 9, 11]);
  steps('alolan_raichu', 'Xmult', 'Psychic', [1.8, 2.1, 2.4]); const ra = steps('alolan_raichu', 'Xmult_mod', 'Psychic', [0.12, 0.14, 0.16]); ok(ex(ra).surf_Xmult === 0, 'Alolan Raichu: the bank untouched');
  steps('alolan_sandshrew', 'chips', 'Water', [39, 48, 57]);
  steps('alolan_sandslash', 'Xmult', 'Water', [2.4, 2.8, 3.2]); steps('alolan_sandslash', 'chips', 'Water', [39, 48, 57]);
  steps('alolan_vulpix', 'mult', 'Water', [5.6, 7.2, 8.8]);
  steps('alolan_ninetales', 'Xmult_multi', 'Fairy', [1.26, 1.32, 1.38]);
  const dg = steps('alolan_diglett', 'Xmult_multi', 'Metal', [1.26, 1.32, 1.38]); ok(ex(dg).gold_money === 1, 'Alolan Diglett: $1 stays (Energy carries to Dugtrio)');
  const du = steps('alolan_dugtrio', 'Xmult_multi', 'Metal', [1.26, 1.32, 1.38]); ok(ex(du).gold_money === 1, 'Alolan Dugtrio: $1 stays');
  const me = steps('alolan_meowth', 'Xmult_mod', 'Dark', [0.12, 0.14, 0.16]); ok(ex(me).pay_money === 2, 'Alolan Meowth: $2 stays (Energy carries to Persian)');
  const pe = steps('alolan_persian', 'Xmult_mod', 'Dark', [0.12, 0.14, 0.16]); ok(ex(pe).pay_money === 2, 'Alolan Persian: $2 stays');
  const ge = steps('alolan_geodude', 'mult', 'Lightning', [8.4, 10.8, 13.2]); ok(ex(ge).stone_money === 1, 'Alolan Geodude: $1 stays (Energy carries to Graveler)');
  steps('alolan_graveler', 'mult', 'Lightning', [8.4, 10.8, 13.2]);
  const go = steps('alolan_golem', 'Xmult_multi', 'Lightning', [1.3125, 1.375, 1.4375]); ok(ex(go).stone_money === 1, 'Alolan Golem: $1 stays (its held-Stone X1.5 is the Steel card\'s own)');
  const gr = steps('alolan_grimer', 'mult_mod', 'Dark', [3.6, 4.2, 4.8]); ok(ex(gr).eat_mult === 0, 'Alolan Grimer: the bank untouched');
  const mu = steps('alolan_muk', 'Xmult_mod', 'Dark', [0.12, 0.14, 0.16]); ok(ex(mu).eat_Xmult === 1, 'Alolan Muk: the bank untouched');
  const eg = steps('alolan_exeggutor', 'Xmult', 'Dragon', [2.4, 2.8, 3.2]); ok(ex(eg).h_size === 1, 'Alolan Exeggutor: +1 hand size stays');
  steps('alolan_marowak', 'Xmult', 'Fire', [2.4, 2.8, 3.2]); steps('alolan_marowak', 'Xmult2', 'Fire', [3, 3.5, 4]);
  // carried through evolution
  const [d] = fresh('AENEVO', ['alolan_diglett']);
  increment_energy(d, 'Metal'); increment_energy(d, 'Metal');
  rounds(4);
  ok(key(d) === 'j_poke_alolan_dugtrio' && near(ex(d).Xmult_multi, 1.32), 'Alolan Diglett (2 Energy) -> Dugtrio: held Gold X1.32', [key(d), ex(d).Xmult_multi]);
  const [gd] = fresh('AENEVO2', ['alolan_geodude']);
  increment_energy(gd, 'Lightning');
  rounds(9);
  ok(key(gd) === 'j_poke_alolan_golem' && near(ex(gd).Xmult_multi, 1.3125), 'Alolan Geodude (1 Energy) -> Graveler -> Golem: X1.3125 per Stone', [key(gd), ex(gd).Xmult_multi]);
});

// ------------------------------------------------------------------- a run recorded on the old rules replays as recorded
await sec('old-rev replay', () => {
  const deck = { name: 'Alola', mods: ['pokermon'], params: { blind_scaling: 0.05 }, consumables: [{ key: 'c_poke_psychic_energy' }], jokers: [{ key: 'j_poke_pikachu' }] };
  const record = (seed, pins) => {
    const s = new Session();
    PINS.RULES.pins = pins;
    try {
      s.start({ engineRev: 1, seed, mods: ['pokermon'], customDeck: deck });
      s.act({ type: 'select_blind' }); flush();
      const en = G.consumeables.cards.find((c) => key(c) === 'c_poke_psychic_energy');
      s.act({ type: 'use', id: en.sort_id, targets: [], joker_targets: [G.jokers.cards[0].sort_id] }); flush();
      for (let b = 0; b < 2; b++) {
        for (let i = 0; i < 4 && G.STATE === STATES.SELECTING_HAND; i++) { s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush(); }
        if (G.STATE === STATES.ROUND_EVAL) { s.act({ type: 'cash_out' }); flush(); }
        if (G.STATE === STATES.SHOP) { s.act({ type: 'next_round' }); flush(); }
        if (G.STATE === STATES.BLIND_SELECT) { s.act({ type: 'select_blind' }); flush(); }
      }
    } finally { PINS.RULES.pins = null; }
    return s;
  };
  const y = () => G.jokers.cards.map(key).join();
  const snap = () => ({ jokers: y(), chips: String(G.GAME.chips), round: G.GAME.round, dollars: G.GAME.dollars, cons: G.consumeables.cards.length });
  record('ALOLAREC', null);
  ok(y() === 'j_poke_alolan_raichu', 'live: the Psychic Energy makes Alolan Raichu', y());
  const sOld = record('ALOLAREC', OLD);
  const wantOld = snap();
  ok(wantOld.jokers === 'j_poke_pikachu' && wantOld.cons === 1, 'the same moves on the old rules: Pikachu stays (the Energy refused, still held)', wantOld);
  const recOld = JSON.parse(JSON.stringify(sOld.recipe));
  recOld.modVersions.pokermon = OLD.pokermon;
  ok(Session.pinDiff(recOld).length === 1, 'an old-rev recipe differs from the current pin (the resume prompt)', Session.pinDiff(recOld));
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(recOld)), { repin: true }); flush();
  const gotOld = snap();
  ok(!r.stoppedAt && JSON.stringify(gotOld) === JSON.stringify(wantOld), 'resumed: every old move replays on the old rules (Pikachu, the same score)', { wantOld, gotOld });
  const st = Session.stepper(JSON.parse(JSON.stringify(recOld)));
  st.seek(st.total); flush();
  ok(!st.error && st.index === recOld.actions.length && y() === 'j_poke_pikachu', 'the replay stepper: the same', [st.error, y()]);
});

// ------------------------------------------------------------------- save / resume
await sec('resume', () => {
  const s = new Session();
  s.start({ engineRev: 1, seed: 'ALOLARES', customDeck: { name: 'Alola', mods: ['pokermon'], params: { blind_scaling: 0.05 },
    cards: [['S_J', 0, 0, 0, 12], ['H_9', 'm_stone', 0, 0, 10], ['D_5', 'm_gold', 0, 0, 6], ['C_2', 0, 0, 0, 12], ['S_7', 0, 0, 0, 12]],
    consumables: [{ key: 'c_poke_fire_energy' }, { key: 'c_pluto' }],
    jokers: [{ key: 'j_poke_cubone' }, { key: 'j_poke_alolan_raichu' }, { key: 'j_poke_alolan_grimer' }, { key: 'j_poke_alolan_sandshrew' }, { key: 'j_poke_alolan_golem' }] } });
  s.act({ type: 'select_blind' }); flush();
  const en = G.consumeables.cards.find((c) => key(c) === 'c_poke_fire_energy'), cu = G.jokers.cards[0];
  s.act({ type: 'use', id: en.sort_id, targets: [], joker_targets: [cu.sort_id] }); flush();
  const pl = G.consumeables.cards.find((c) => key(c) === 'c_pluto');
  s.act({ type: 'use', id: pl.sort_id, targets: [] }); flush();
  ok(key(cu) === 'j_poke_alolan_marowak', 'the run: Cubone + its Fire Energy -> Alolan Marowak');
  for (let b = 0; b < 3; b++) {
    for (let i = 0; i < 3 && G.STATE === STATES.SELECTING_HAND; i++) { s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush(); }
    if (G.STATE === STATES.ROUND_EVAL) { s.act({ type: 'cash_out' }); flush(); }
    if (G.STATE === STATES.SHOP) { s.act({ type: 'next_round' }); flush(); }
    if (G.STATE === STATES.BLIND_SELECT) { s.act({ type: 'select_blind' }); flush(); }
  }
  const want = {
    jokers: G.jokers.cards.map((j) => [key(j), ex(j).surf_Xmult, ex(j).eat_mult, ex(j).snowy_round, ex(j).rounds]),
    deck: G.playing_cards.length, destroyed: G.GAME.poke_destroyed_round,
    chips: String(G.GAME.chips), dollars: G.GAME.dollars, round: G.GAME.round,
  };
  ok(want.round >= 3 && want.jokers[1][1] > 0 && want.jokers[2][2] >= 9 && want.destroyed === want.round, 'the run: Raichu banked a Planet, Grimer ate each Blind', want);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  const got = {
    jokers: G.jokers.cards.map((j) => [key(j), ex(j).surf_Xmult, ex(j).eat_mult, ex(j).snowy_round, ex(j).rounds]),
    deck: G.playing_cards.length, destroyed: G.GAME.poke_destroyed_round,
    chips: String(G.GAME.chips), dollars: G.GAME.dollars, round: G.GAME.round,
  };
  ok(!r.stoppedAt && JSON.stringify(got) === JSON.stringify(want), 'resume: the evolution, the banks, the eaten cards, the snow reads and the score come back the same', { want, got });
});

// ------------------------------------------------------------------- the art: the 3.9.1 cells show these types
if (ART) {
  await sec('art types', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const sheet = (a) => a.replace(/^poke_/, '').replace(/391$/, '');
    const bad = [];
    for (const n of NEW) { const r = typer.typeOfEntry({ atlas: sheet(C(n).atlas), pos: [C(n).pos.x, C(n).pos.y] }); if (!r || r.ptype !== C(n).ptype) bad.push([n, C(n).ptype, r && r.ptype]); }
    ok(!bad.length, 'each of the 18 is the type its 3.9.1 card shows', bad);
  });
} else console.log('(Pokermon art not on disk: the art type checks are skipped; set MICATRO_MAIN)');

done();
