// The owner's 25 new Pokermon jokers (Desktop/Pokermon_Joker_Design_Guide.txt section 5; jokers/pokejokers_designs.js; PORTING.md
// "The owner's 25 new jokers"). Every ability is FIRED through real plays (act) with exact numbers, and every evolution runs:
//   Shinx -> Luxio -> Luxray, Honedge -> Doublade -> Aegislash (a real Dusk Stone), Spheal -> Sealeo -> Walrein, Grookey ->
//   Thwackey -> Rillaboom, Kubfu -> Urshifu (Single Strike / Rapid Strike by its training), Tandemaus -> Maushold, Darumaka ->
//   Darmanitan, Scraggy -> Scrafty, Mudbray -> Mudsdale; Xerneas, Spiritomb, Tatsugiri.
// Plus: the pin (contentRev 21 since the Whismur line: pokermon_whismur_test.mjs), the static data, the Pokédex order, families, pools (rarity, gens, the Starter Pack, Urshifu only
// through Kubfu), the text, the debuff rules (Kubfu / Urshifu / Unseen Fist) and the art (upstream 3.9.1's own cells + Shiny twins).
//   node micatro/tests/mods/pokermon_new_jokers_test.mjs
import path from 'path';
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act } from './poke_helpers.mjs';
import { P_CENTER_POOLS, get_current_pool } from '../../js/engine/core.js';
import { STATES } from '../../js/engine/run.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { describe } from '../../js/engine/describe.js';
import { is_type, apply_type_sticker } from '../../mods/pokermon/systems/types.js';
import { starter_lists } from '../../mods/pokermon/boosters/packs1.js';
import { seriesA } from '../../mods/pokermon/ui.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const C = (n) => P_CENTERS['j_poke_' + n];
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
/** A section: an error (e.g. on a build without these jokers) is one failure, not the end of the suite. */
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 400)); } };
const NEW = ['shinx', 'luxio', 'luxray', 'honedge', 'doublade', 'aegislash', 'spheal', 'sealeo', 'walrein', 'grookey', 'thwackey', 'rillaboom',
  'kubfu', 'urshifu_single', 'urshifu_rapid', 'xerneas', 'tandemaus', 'maushold', 'darumaka', 'darmanitan', 'scraggy', 'scrafty', 'spiritomb',
  'tatsugiri', 'mudbray', 'mudsdale'];
/** Win the round with its first hand, cash out, into the next Blind (the hand emptied). */
const roundWon = () => { winRound(); nextRound(); };
/** Put a deck card of this rank id on top of the deck (the Foresight view shows the top). */
function toTop(id) {
  const c = G.deck.cards.find((x) => x.get_id() === id && x.config.center.key === 'c_base');
  G.deck.cards.splice(G.deck.cards.indexOf(c), 1);
  G.deck.cards.push(c);
  return c;
}
const money = () => G.GAME.dollars;
/** Hold exactly these cards (every other hand card goes back to the deck: the draw after a play refills the hand). */
const only = (cards) => { for (const c of G.hand.cards.slice()) if (!cards.includes(c)) { G.hand.remove_card(c); G.deck.emplace(c); } G.hand.highlighted.length = 0; };
/** Play these cards as the round's LAST hand (hands_left 1 -> 0), not winning. */
function playLast(cards) {
  G.GAME.chips = 0;
  G.GAME.blind.chips = 1e15;
  G.GAME.current_round.hands_left = 1;
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  const res = act({ type: 'play' });
  return { res, total: res.events.find((e) => e.type === 'hand_total'), events: res.events };
}

// ------------------------------------------------------------------- the pin and the static data
sec('pin', () => {
  ok(MODS.pokermon.contentRev === 47 && PINS.modPin('pokermon') === '3.9.1+r47', 'Pokermon contentRev 47 (pin 3.9.1+r47; the Gen 7 starters; r46 the Lake trio, Cresselia, Manaphy and Phione; r45 the creation trio, Regigigas and Arceus; r44 the last Gen 4 regulars; r43 the Gible line; r42 the Stunky line; r41 the Burmy three-pile cloak; r40 the Shellos line; r39 the Cherubi line)', PINS.modPin('pokermon'));
  ok(MODS.pokermon.version === '3.9.1' && PINS.pinLabel(PINS.modPin('pokermon')) === '3.9.1 (rev 47)', 'version stays 3.9.1: "3.9.1 (rev 47)"', PINS.pinLabel(PINS.modPin('pokermon')));
  ok(PINS.LEGACY_MOD_VERSIONS && PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  ok(NEW.every((n) => C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n)), 'all 26 jokers (25 species, Urshifu twice) registered and ported',
    NEW.filter((n) => !C(n) || C(n).unported));
  ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).length === 26 + 3 + 3 + 2 + 3 + 2 + 1 + 2 + 2 + 3 + 3 + 5 + 2 + 2 + 2 + 3 + 2 + 2 + 2 + 2 + 3 + 7 + 5 + 6 + 9, 'defs: 26 (+ the 3 of the Sprigatito line, the 3 of the Whismur line, the 2 of the Gulpin line, the 3 of the Trapinch line, the 2 of the Spoink line, Castform, the 2 of the Barboach line, Lunatone + Solrock, the Regi trio, the 3 of the Starly line, the 5 Gen 3 Legendaries, Chatot + Pachirisu, the 2 of the Glameow line, the 2 of the Drifloon line, the 3 of the Burmy line, the 2 of the Combee line, the 2 of the Cherubi line, the 2 of the Shellos line, the 2 of the Stunky line, the 3 of the Gible line, the 7 last Gen 4 regulars, the creation trio + Regigigas + Arceus, the Lake trio + Cresselia + Phione + Manaphy, the 9 Gen 7 starters) from micatro/pokejokers_designs', (STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).length);
});
sec('static', () => {
  // [rarity, cost, stage, type, gen] as designed (Grookey $5: the starter convention; Kubfu $10: Shaymin's precedent)
  const S = 'poke_safari';
  const want = {
    shinx: [2, 6, 'Basic', 'Lightning', 4], luxio: [S, 8, 'One', 'Lightning', 4], luxray: [S, 10, 'Two', 'Lightning', 4],
    honedge: [2, 6, 'Basic', 'Metal', 6], doublade: [S, 8, 'One', 'Metal', 6], aegislash: [S, 10, 'Two', 'Metal', 6],
    spheal: [2, 6, 'Basic', 'Water', 3], sealeo: [S, 8, 'One', 'Water', 3], walrein: [S, 10, 'Two', 'Water', 3],
    grookey: [2, 5, 'Basic', 'Grass', 8], thwackey: [S, 8, 'One', 'Grass', 8], rillaboom: [S, 10, 'Two', 'Grass', 8],
    kubfu: [4, 10, 'Legendary', 'Fighting', 8], urshifu_single: [4, 20, 'Legendary', 'Dark', 8], urshifu_rapid: [4, 20, 'Legendary', 'Water', 8],
    xerneas: [4, 20, 'Legendary', 'Fairy', 6], tandemaus: [1, 5, 'Basic', 'Colorless', 9], maushold: [S, 8, 'One', 'Colorless', 9],
    darumaka: [1, 5, 'Basic', 'Fire', 5], darmanitan: [S, 8, 'One', 'Fire', 5], scraggy: [1, 5, 'Basic', 'Dark', 5], scrafty: [S, 8, 'One', 'Dark', 5],
    spiritomb: [3, 7, 'Basic', 'Psychic', 4], tatsugiri: [3, 7, 'Basic', 'Dragon', 9], mudbray: [1, 5, 'Basic', 'Earth', 7], mudsdale: [S, 8, 'One', 'Earth', 7],
  };
  for (const [n, [rarity, cost, stage, ptype, gen]] of Object.entries(want)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === ptype && c.config.extra.ptype === ptype && c.gen === gen,
      `${n}: rarity / cost / stage / type / gen as designed`, [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
  }
  ok(C('doublade').config.extra.item_req === 'duskstone' && C('grookey').starter === true && C('grookey').attributes.includes('starter')
    && C('honedge').config.evo_rqmt === 20 && C('grookey').config.evo_rqmt === 12 && C('thwackey').config.evo_rqmt === 16 && C('kubfu').config.evo_rqmt === 10
    && C('shinx').config.extra.rounds === 4 && C('luxio').config.extra.rounds === 5 && C('spheal').config.extra.rounds === 5 && C('sealeo').config.extra.rounds === 5
    && C('tandemaus').config.extra.rounds === 5 && C('darumaka').config.extra.rounds === 4 && C('scraggy').config.extra.rounds === 4 && C('mudbray').config.extra.rounds === 5,
  'evolution conditions: Dusk Stone, +20 Mult, 12 / 16 beats, 10 trainings, 4 / 5 rounds; Grookey is a starter');
  // Pokédex order: each right after its predecessor
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const chain = [['glalie', 'spheal', 'sealeo', 'walrein', 'clamperl'], ['kricketune', 'shinx', 'luxio', 'luxray', 'budew'], ['happiny', 'chatot', 'spiritomb', 'gible', 'gabite', 'garchomp', 'munchlax'],
    ['excadrill', 'darumaka', 'darmanitan', 'scraggy', 'scrafty', 'trubbish'], ['pyroar', 'honedge', 'doublade', 'aegislash', 'sylveon'], ['gourgeist', 'xerneas', 'grubbin'],
    ['lycanroc_dusk', 'mudbray', 'mudsdale', 'mimikyu'], ['mega_drampa', 'grookey', 'thwackey', 'rillaboom', 'nickit'], ['dreepy_dart', 'kubfu', 'urshifu_single', 'urshifu_rapid', 'wyrdeer'],
    ['spidops', 'tandemaus', 'maushold', 'fidough'], ['houndstone', 'tatsugiri', 'annihilape']];
  for (const ch of chain) ok(ch.every((n, i) => i === 0 || keys.indexOf('j_poke_' + n) === keys.indexOf('j_poke_' + ch[i - 1]) + 1), 'Pokédex order: ' + ch.join(' > '));
  const fam = (n) => JSON.stringify(poke_get_family_list(n));
  ok(fam('luxio') === '["shinx","luxio","luxray"]' && fam('aegislash') === '["honedge","doublade","aegislash"]' && fam('walrein') === '["spheal","sealeo","walrein"]'
    && fam('thwackey') === '["grookey","thwackey","rillaboom"]' && fam('urshifu_rapid') === '["kubfu","urshifu_single","urshifu_rapid"]'
    && fam('maushold') === '["tandemaus","maushold"]' && fam('darmanitan') === '["darumaka","darmanitan"]' && fam('scrafty') === '["scraggy","scrafty"]'
    && fam('mudsdale') === '["mudbray","mudsdale"]', 'families: the 9 lines');
  ok(poke_get_family_list('xerneas').length <= 1 && poke_get_family_list('spiritomb').length <= 1 && poke_get_family_list('tatsugiri').length <= 1, 'Xerneas, Spiritomb, Tatsugiri stand alone');
});
sec('text', () => {
  const L = MODS.pokermon.content.loc.descriptions;
  start('LOCNEW');
  const keysOf = (n) => [n === 'maushold' ? 'j_poke_maushold_three' : null, n === 'tatsugiri' ? 'j_poke_tatsugiri_curly' : null, 'j_poke_' + n].filter(Boolean);
  for (const n of NEW) {
    const card = add('j_poke_' + n);
    const lv = C(n).loc_vars(C(n), [], card) || {};
    for (const k of keysOf(n)) {
      const e = L.Joker[k];
      const used = [...new Set(((e && e.text) || []).join(' ').match(/#(\d+)#/g) || [])].map((m) => +m.slice(1, -1));
      ok(e && e.name && used.every((i) => { const v = (lv.vars || [])[i - 1]; return v !== undefined && v !== null && !Number.isNaN(v); }), `${k}: text, loc_vars fill #${used.join('#, #')}#`, lv.vars);
    }
    card.remove();
  }
  ok(L.Joker.j_poke_doublade.text.some((l) => l.includes('Dusk Stone')) && L.Joker.j_poke_aegislash.text.some((l) => /^\{br:2\}/.test(l))
    && L.Joker.j_poke_kubfu.text.some((l) => l.includes('Rapid Strike')), 'Doublade names the Dusk Stone; Aegislash has two boxes; Kubfu names both schools');
});

// ------------------------------------------------------------------- LINE A: Shinx -> Luxio -> Luxray
sec('shinx', () => {
  start('SHINX');
  const j = add('j_poke_shinx');
  ok(G.GAME.scry_amount === 1 && G.scry_view.cards.length === 1, 'shinx: +1 Foresight');
  toTop(7);
  let m0 = money();
  let r = play(hand(['S_7', 'H_7']));
  ok(money() - m0 === 2 && r.total.mult === 2, 'shinx: two scored 7s with a Foreseen 7 earn $1 each', [money() - m0, r.total]);
  toTop(9);
  m0 = money();
  play(hand(['S_7', 'H_7']));
  ok(money() - m0 === 0, 'shinx: no Foreseen 7, no money', money() - m0);
  for (let i = 0; i < 3; i++) roundWon();
  ok(key(j) === 'j_poke_shinx' && j.ability.extra.rounds === 1, 'shinx: 3 rounds in, 1 to go', j.ability.extra.rounds);
  winRound();
  ok(key(j) === 'j_poke_luxio' && G.GAME.scry_amount === 2, 'shinx -> luxio after 4 rounds (Foresight 1 -> 2)', [key(j), G.GAME.scry_amount]);
  nextRound();
  toTop(9); toTop(7);
  m0 = money();
  r = play(hand(['S_7', 'H_7']));
  ok(r.total.mult === 2 + 6 + 6 && money() - m0 === 2, 'luxio: each Foreseen-rank card gives +6 Mult and $1', [r.total, money() - m0]);
  for (let i = 0; i < 4; i++) roundWon();
  winRound();
  ok(key(j) === 'j_poke_luxray' && G.GAME.scry_amount === 3, 'luxio -> luxray after 5 rounds (Foresight 3)', [key(j), G.GAME.scry_amount]);
  nextRound();
  toTop(9); toTop(4); toTop(7);
  ok(G.scry_view.cards.map((c) => c.get_id()).join() === '7,4,9', 'luxray: sees the top 3');
  m0 = money();
  r = play(hand(['S_7', 'H_7', 'D_9', 'C_9']));
  ok(near(r.total.mult, 2 * 1.4 ** 4) && money() - m0 === 4, 'luxray: four matching cards (two 7s, two 9s) give X1.4 each and $1 each', [r.total, money() - m0]);
  j.remove();
  ok(G.GAME.scry_amount === 0, 'luxray sold: Foresight back to 0');
});

// ------------------------------------------------------------------- LINE B: Honedge -> Doublade -> Aegislash
sec('honedge', () => {
  start('HONEDGE');
  const j = add('j_poke_honedge');
  hand(['S_K', 'H_K'], { center: 'm_steel' });
  let r = play(hand(['S_2']));
  ok(j.ability.extra.mult === 2 && near(r.total.mult, 1.5 * 1.5 + 2), 'honedge: 2 Steel held -> +2 Mult, given after the held X1.5s', [j.ability.extra.mult, r.total]);
  r = play(hand(['S_3']));
  ok(j.ability.extra.mult === 4 && near(r.total.mult, 2.25 + 4), 'honedge: +2 more', [j.ability.extra.mult, r.total]);
  clearHand();
  r = play(hand(['S_4']));
  ok(j.ability.extra.mult === 4 && r.total.mult === 1 + 4, 'honedge: no Steel held, no growth', [j.ability.extra.mult, r.total]);
  winRound();
  ok(key(j) === 'j_poke_honedge', 'honedge: +4 is short of +20');
  nextRound();
  j.ability.extra.mult = 19;
  hand(['S_K'], { center: 'm_steel' });
  play(hand(['S_5']));
  ok(j.ability.extra.mult === 20, 'honedge: reaches +20');
  winRound();
  ok(key(j) === 'j_poke_doublade' && j.ability.extra.mult === 20 && j.ability.extra.mult_mod === 2, 'honedge -> doublade at +20 Mult (the Mult carries over)', [key(j), j.ability.extra]);
  nextRound();
  const st = hand(['S_K', 'H_K', 'D_K'], { center: 'm_steel' });
  only(st);
  r = play(hand(['S_2']));
  ok(j.ability.extra.mult === 26 && near(r.total.mult, 1.5 ** 5 + 26), 'doublade: +2 per held Steel (3 -> +6); the first 2 Steel held are retriggered (5 x X1.5)', [j.ability.extra.mult, r.total]);
  st[0].set_debuff(true);
  ok(st[0].debuff, 'doublade: a held Steel debuffed');
  only(st);
  r = play(hand(['S_3']));
  ok(j.ability.extra.mult === 32 && near(r.total.mult, 1.5 ** 4 + 32), 'doublade: a debuffed Steel card is skipped: the next 2 scoring ones are retriggered', [j.ability.extra.mult, r.total]);
  st[0].set_debuff(false);
  clearHand();
  const stone = add('c_poke_duskstone');
  act({ type: 'use', id: stone.sort_id, joker_targets: [j.sort_id] }); flush();
  ok(j.ability.extra.evolve === true || typeof j.ability.extra.evolve === 'string', 'doublade: a Dusk Stone readies its evolution', j.ability.extra.evolve);
  winRound();
  ok(key(j) === 'j_poke_aegislash' && j.ability.extra.mult === 32 && j.ability.extra.form === 'shield', 'doublade -> aegislash with a Dusk Stone (+32 Mult kept, Shield Forme)', [key(j), j.ability.extra]);
  nextRound();
  const st2 = hand(['S_K', 'H_K'], { center: 'm_steel' });
  r = play(hand(['S_2']));
  ok(near(r.total.mult, 1.5 ** 4 + 32) && j.ability.extra.form === 'blade', 'aegislash: first hand is Shield (every held Steel retriggered, +32), then Blade', [r.total, j.ability.extra.form]);
  only(st2);
  r = play(hand(['S_3']));
  ok(near(r.total.mult, (1.5 ** 2 + 32) * 2.5), 'aegislash: Blade Forme X2.5 (held Steel not retriggered)', r.total);
  const d = hand(['C_9']);
  act({ type: 'highlight', ids: [d[0].sort_id] });
  act({ type: 'discard' }); flush();
  ok(j.ability.extra.form === 'shield', 'aegislash: a discard switches to Shield Forme', j.ability.extra.form);
  only(st2);
  r = play(hand(['S_4']));
  ok(near(r.total.mult, 1.5 ** 4 + 32) && j.ability.extra.form === 'blade', 'aegislash: Shield again after the discard, Blade after the hand', [r.total, j.ability.extra.form]);
  winRound();
  ok(j.ability.extra.form === 'shield', 'aegislash: each round starts in Shield Forme', j.ability.extra.form);
});

// ------------------------------------------------------------------- LINE C: Spheal -> Sealeo -> Walrein
sec('spheal', () => {
  start('SPHEAL');
  const j = add('j_poke_spheal');
  const pairChips = (r) => r.total.chips - 10 - 10; // Pair of 5s: 10 base + 5 + 5
  const got = [];
  for (let i = 0; i < 6; i++) got.push(pairChips(play(hand(['S_5', 'H_5']))));
  ok(got.join() === '10,20,40,80,160,160', 'spheal: Rollout +10, doubled per consecutive Pair, max 4 doublings', got);
  let r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 11 + 10 && j.ability.extra.streak === 0, 'spheal: the hand changed -> back to +10', r.total);
  r = play(hand(['S_K']));
  ok(r.total.chips === 5 + 10 + 20, 'spheal: High Card twice -> +20', r.total);
  roundWon();
  ok(j.ability.extra.streak === 0 && j.ability.extra.last_hand === undefined, 'spheal: Rollout resets at end of round', j.ability.extra);
  r = play(hand(['S_K']));
  ok(r.total.chips === 5 + 10 + 10, 'spheal: a new round starts at +10', r.total);
  increment_energy(j, 'Water');
  ok(j.ability.extra.chips === 13, 'spheal: a Water Energy raises its base +10 -> +13', j.ability.extra.chips);
  for (let i = 0; i < 3; i++) roundWon();
  const h0 = G.GAME.round_resets.hands;
  winRound();
  ok(key(j) === 'j_poke_sealeo' && j.ability.extra.chips === 26 && j.ability.extra.energy_count === 1 && G.GAME.round_resets.hands === h0 + 1,
    'spheal -> sealeo after 5 rounds: +1 hand; its Energy carries over (+20 base -> +26)', [key(j), j.ability.extra, G.GAME.round_resets.hands - h0]);
  nextRound();
  const hl = G.GAME.current_round.hands_left;
  ok(hl === h0 + 1, 'sealeo: the next round has the extra hand', [hl, h0]);
  for (let i = 0; i < 4; i++) roundWon();
  winRound();
  ok(key(j) === 'j_poke_walrein' && G.GAME.round_resets.hands === h0 + 1, 'sealeo -> walrein after 5 rounds (still +1 hand, not +2)', [key(j), G.GAME.round_resets.hands - h0]);
  nextRound();
  const base = j.ability.extra.chips;
  ok(base === 52, 'walrein: +40 base, energized x1.3 = +52', base);
  const seq = [];
  for (let i = 0; i < 5; i++) { r = play(hand(['S_5', 'H_5'])); seq.push([pairChips(r), r.total.mult]); }
  // (its Energy raises Sheer Cold too: X3 + 20% = X3.6)
  ok(near(j.ability.extra.Xmult, 3.6) && JSON.stringify(seq) === JSON.stringify([[52, 2], [104, 2], [208, 2], [416, 2], [832, 7.2]]), 'walrein: Rollout +52 doubling to +832; Sheer Cold X3 (energized X3.6) at full power', seq);
});

// ------------------------------------------------------------------- LINE D: Grookey -> Thwackey -> Rillaboom
sec('grookey', () => {
  start('GROOKEY');
  const h0 = G.hand.config.card_limit;
  const j = add('j_poke_grookey');
  ok(G.hand.config.card_limit === h0 + 1, 'grookey: +1 hand size');
  const straight = () => hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']);
  let r = play(straight());
  ok(r.total.chips === 30 + 20 + 5 && j.ability.extra.beat === 5 && j.ability.extra.beats === 1, 'grookey: the 4th card scored this round (the 5) is retriggered', [r.total, j.ability.extra]);
  r = play(straight());
  ok(r.total.chips === 30 + 20 + 4 && j.ability.extra.beat === 10, 'grookey: the 8th card scored (this hand\'s 3rd, the 4) is retriggered', r.total);
  r = play(hand(['S_9']));
  ok(r.total.chips === 5 + 9, 'grookey: the 11th card: no beat', r.total);
  r = play(hand(['S_8']));
  ok(r.total.chips === 5 + 8 + 8 && j.ability.extra.beats === 3, 'grookey: the 12th card is on the beat', [r.total, j.ability.extra.beats]);
  winRound();
  ok(j.ability.extra.beat === 0 && key(j) === 'j_poke_grookey', 'grookey: the beat count resets at end of round (3 + 1 beats, short of 12)', j.ability.extra);
  nextRound();
  j.ability.extra.beats = 11;
  play(straight());
  ok(j.ability.extra.beats === 12, 'grookey: 12 beats');
  winRound();
  ok(key(j) === 'j_poke_thwackey' && G.hand.config.card_limit === h0 + 1 && j.ability.extra.beats === 0, 'grookey -> thwackey after 12 beats (hand size stays +1; its own beat count)', [key(j), G.hand.config.card_limit - h0, j.ability.extra]);
  nextRound();
  r = play(straight());
  ok(r.total.chips === 30 + 20 + 4 && j.ability.extra.beats === 1, 'thwackey: every 3rd card (the 4)', [r.total, j.ability.extra.beats]);
  j.ability.extra.beats = 16;
  winRound();
  ok(key(j) === 'j_poke_rillaboom', 'thwackey -> rillaboom after 16 beats', key(j));
  nextRound();
  r = play(straight());
  // every 2nd card: the 3 and the 5 are retriggered, and each of their 4 scorings gives +3 Mult
  ok(r.total.chips === 30 + 20 + 3 + 5 && r.total.mult === 4 + 4 * 3, 'rillaboom: every 2nd card retriggered; Drum Beating +3 Mult each time they score', r.total);
  j.remove(); flush();
  ok(G.hand.config.card_limit === h0, 'rillaboom sold: hand size back', [G.hand.config.card_limit, h0]);
  start('GROOKEY2');
  ok(starter_lists().grass.includes('j_poke_grookey') && !starter_lists().grass.includes('j_poke_thwackey'), 'Grookey is a Grass starter (the Starter Pack); Thwackey is not');
});

// Grookey / Thwackey's Mult (contentRev 21, the lead-in to Drum Beating): on-beat cards also give +1 / +2 Mult each time they score —
// the `mult` field, so Energy scales it as Rillaboom's (energy_values.mult per Energy, of its base), and carries into the evolutions.
sec('grookey mult', () => {
  start('GROOKM');
  const j = add('j_poke_grookey');
  const straight = () => hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']);
  let r = play(straight());
  ok(r.total.chips === 30 + 20 + 5 && r.total.mult === 4 + 2 * 1, 'grookey: the on-beat 5 (scored twice) gives +1 Mult each time', r.total);
  r = play(hand(['S_9']));
  ok(r.total.mult === 1, 'grookey: an off-beat card (the 6th scored) gives no Mult', r.total);
  play(hand(['S_8']));
  r = play(hand(['S_7']));
  ok(r.total.chips === 5 + 7 + 7 && r.total.mult === 1 + 2 * 1, 'grookey: the 8th card scored is on the beat: +1 Mult twice', r.total);
  increment_energy(j, 'Grass');
  const em = energy_values.mult;
  ok(near(j.ability.extra.mult, 1 + 1 * em) && j.ability.extra.energy_count === 1, 'grookey: 1 Grass Energy -> +' + (1 + em) + ' Mult (energy_values.mult of its base)', j.ability.extra);
  r = play(straight()); // beats 9..13: the 12th is this hand's 4th card (the 5)
  ok(near(r.total.mult, 4 + 2 * (1 + em)), 'grookey (1 Energy): the on-beat card gives the energized Mult', r.total);
  ok(/1\.4/.test(JSON.stringify(describe(j))) && /Mult/.test(JSON.stringify(describe(j))), 'grookey: the tooltip shows the energized +1.4 Mult', JSON.stringify(describe(j)).slice(0, 500));
  j.ability.extra.beats = 12;
  winRound();
  ok(key(j) === 'j_poke_thwackey' && near(j.ability.extra.mult, 2 + 2 * em) && j.ability.extra.energy_count === 1, 'grookey -> thwackey keeps its Energy: +' + (2 + 2 * em) + ' Mult (the evolving energize)', [key(j), j.ability.extra]);
  nextRound();
  r = play(straight());
  ok(near(r.total.mult, 4 + 2 * (2 + 2 * em)), 'thwackey (1 Energy): the on-beat 4 gives +2.8 Mult each time it scores', r.total);
  r = play(hand(['S_9'])); // the 6th card scored: on the beat
  ok(near(r.total.mult, 1 + 2 * (2 + 2 * em)), 'thwackey: the 6th card scored is on the beat', r.total);
  r = play(hand(['S_8']));
  ok(r.total.mult === 1, 'thwackey: an off-beat card (the 7th) gives no Mult', r.total);
  j.ability.extra.beats = 16;
  winRound();
  ok(key(j) === 'j_poke_rillaboom' && near(j.ability.extra.mult, 3 + 3 * em), 'thwackey -> rillaboom keeps the Energy: Drum Beating +' + (3 + 3 * em), [key(j), j.ability.extra]);
  nextRound();
  r = play(straight());
  ok(near(r.total.mult, 4 + 4 * (3 + 3 * em)), 'rillaboom (1 Energy): the 3 and the 5 give +4.2 Mult each scoring', r.total);
  start('GROOKM2');
  const t = add('j_poke_thwackey');
  r = play(straight());
  ok(r.total.mult === 4 + 2 * 2, 'thwackey (fresh): +2 Mult on each scoring of the on-beat card', r.total);
  increment_energy(t, 'Grass'); increment_energy(t, 'Grass');
  ok(near(t.ability.extra.mult, 2 + 2 * 2 * em), 'thwackey: 2 Energy -> +' + (2 + 4 * em) + ' Mult', t.ability.extra);
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  ok(J.j_poke_grookey.text.some((l) => /#6#\{\} Mult/.test(l)) && J.j_poke_thwackey.text.some((l) => /#4#\{\} Mult/.test(l)), 'the texts name the Mult');
});
// Audit: every joker of the owner's designs has an Energy-scaled field (a numeric config.extra key in energy_values), or says it
// doesn't on purpose (poke_no_energy_field: true) — so Energy is never silently a no-op (Grookey / Thwackey were, before contentRev 21).
sec('design energy audit', () => {
  const names = STATUS.PORTED_FILES['micatro/pokejokers_designs'] || [];
  const bad = names.filter((n) => {
    const c = MODS.pokermon.content.centers.find((x) => x.key === 'j_poke_' + n);
    const ex = (c && c.config && c.config.extra) || {};
    return !(c && c.poke_no_energy_field) && !Object.keys(ex).some((k) => k in energy_values && typeof ex[k] === 'number');
  });
  ok(names.length >= 32 && bad.length === 0, 'every owner-designed joker has an Energy-scaled field (or poke_no_energy_field)', bad);
});

// ------------------------------------------------------------------- LINE E: Kubfu -> Urshifu
sec('kubfu', () => {
  start('KUBFU');
  const j = add('j_poke_kubfu');
  const other = add('j_poke_spiritomb');
  j.set_debuff(true); other.set_debuff(true);
  ok(!j.debuff && other.debuff, 'kubfu: can\'t be debuffed (another joker can)', [j.debuff, other.debuff]);
  other.set_debuff(false); other.remove();
  let r = play(hand(['S_A']));
  ok(near(j.ability.extra.Xmult, 1.1) && near(r.total.mult, 1.1) && j.ability.extra.single === 1, 'kubfu: a 1-card hand trains X0.1 (X1.1, given at once)', [j.ability.extra, r.total]);
  r = play(hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']));
  ok(near(j.ability.extra.Xmult, 1.2) && near(r.total.mult, 4 * 1.2) && j.ability.extra.rapid === 1, 'kubfu: 5 scoring cards train too (X1.2)', [j.ability.extra, r.total]);
  r = play(hand(['S_7', 'H_7']));
  ok(near(j.ability.extra.Xmult, 1.2) && near(r.total.mult, 2 * 1.2), 'kubfu: 2 scoring cards: no training', [j.ability.extra.Xmult, r.total]);
  r = play(hand(['S_7', 'H_7', 'D_9']));
  ok(near(j.ability.extra.Xmult, 1.2), 'kubfu: 3 played, 2 scoring: no training', j.ability.extra.Xmult);
  winRound(); // a 1-card hand: training 3 (2 single, 1 rapid)
  ok(key(j) === 'j_poke_kubfu' && j.ability.extra.single === 2 && j.ability.extra.rapid === 1, 'kubfu: 3 trainings, no evolution yet', j.ability.extra);
  nextRound();
  j.ability.extra.single = 5; j.ability.extra.rapid = 4; j.ability.extra.Xmult = 2;
  winRound(); // the 10th training, a 1-card hand: single 6, rapid 4
  ok(key(j) === 'j_poke_urshifu_single' && near(j.ability.extra.Xmult, 2.1), 'kubfu -> Single Strike Urshifu after 10 trainings, more of them 1-card hands (X2.1 kept)', [key(j), j.ability.extra]);
  nextRound();
  // Wicked Blow: a 1-card hand's card gives the X Mult too (training first: X2.2)
  r = play(hand(['S_A']));
  ok(near(r.total.mult, 2.2 * 2.2), 'urshifu single: Wicked Blow X2.2 on the card + X2.2 from the joker', r.total);
  r = play(hand(['S_7', 'H_7']));
  ok(near(r.total.mult, 2 * 2.2), 'urshifu single: a 2-card hand gets only the joker\'s X', r.total);
  const pc = hand(['S_Q'])[0];
  pc.set_debuff(true);
  ok(!pc.debuff, 'urshifu single: Unseen Fist — a playing card can\'t be debuffed');
  j.set_debuff(true);
  ok(!j.debuff, 'urshifu single: can\'t be debuffed itself');
  j.remove();
  pc.set_debuff(true);
  ok(pc.debuff, 'urshifu gone: the playing card can be debuffed again');
  // Rapid Strike: more 5-card trainings
  start('KUBFU2');
  const k = add('j_poke_kubfu');
  k.ability.extra.single = 2; k.ability.extra.rapid = 7; k.ability.extra.Xmult = 1.9;
  winRound(); // a 1-card hand: single 3, rapid 7 = 10
  ok(key(k) === 'j_poke_urshifu_rapid' && near(k.ability.extra.Xmult, 2), 'kubfu -> Rapid Strike Urshifu (more 5-card trainings; X2 kept)', [key(k), k.ability.extra]);
  nextRound();
  r = play(hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']));
  ok(r.total.chips === 30 + 20 + 2 + 3 + 4 && near(r.total.mult, 4 * 2.1), 'urshifu rapid: Surging Strikes retrigger the first 3 scored cards; training X2.1', r.total);
  const pc2 = hand(['S_Q'])[0];
  pc2.set_debuff(true);
  ok(pc2.debuff, 'urshifu rapid: no Unseen Fist (playing cards still debuffable)');
  k.set_debuff(true);
  ok(!k.debuff, 'urshifu rapid: can\'t be debuffed itself');
  // a tie: the school of the last training
  start('KUBFU3');
  const t = add('j_poke_kubfu');
  t.ability.extra.single = 4; t.ability.extra.rapid = 5;
  winRound(); // single 5, rapid 5, the last a 1-card hand
  ok(key(t) === 'j_poke_urshifu_single', 'kubfu: a 5 / 5 tie goes to the last training\'s school (Single Strike)', key(t));
});
sec('urshifu pools', () => {
  start('URPOOL');
  const leg = get_current_pool('Joker', 0.5, true)[0];
  ok(leg.includes('j_poke_kubfu') && leg.includes('j_poke_xerneas') && !leg.includes('j_poke_urshifu_single') && !leg.includes('j_poke_urshifu_rapid'),
    'Legendary pool (The Soul): Kubfu, Xerneas; Urshifu only through Kubfu');
});

// ------------------------------------------------------------------- Xerneas
sec('xerneas', () => {
  start('XERNEAS');
  const j = add('j_poke_xerneas');
  let r = play(hand(['S_7', 'H_7']));
  ok(r.total.mult === 2, 'xerneas: the first hand of the round is Charging (no X)', r.total);
  ok(G.GAME.current_round.hands_played === 1, 'one hand played');
  r = play(hand(['S_7', 'H_7']));
  ok(near(r.total.mult, 2 * 1.25 * 1.25), 'xerneas: Geomancy — each scored card X1.25 after the first hand', r.total);
  // The Hanged Man destroys 2 cards: the first comes back to hand as a copy, once per round
  clearHand();
  const [a, b] = hand(['D_Q', 'C_3']);
  const hm = add('c_hanged_man');
  const before = G.hand.cards.length, deck0 = G.playing_cards.length;
  act({ type: 'use', id: hm.sort_id, targets: [a.sort_id, b.sort_id] }); flush();
  const back = G.hand.cards.filter((c) => c !== a && c !== b && [a, b].some((x) => c.base.value === x.base.value && c.base.suit === x.base.suit));
  ok(back.length === 1 && !G.hand.cards.includes(a) && !G.hand.cards.includes(b) && G.hand.cards.length === before - 1 && G.playing_cards.length === deck0 - 1,
    'xerneas: of 2 destroyed cards the first one destroyed returns to hand as a copy (the other stays gone)', [back.length, G.hand.cards.length - before, G.playing_cards.length - deck0]);
  const [c2] = hand(['H_4']);
  const hm2 = add('c_hanged_man');
  act({ type: 'use', id: hm2.sort_id, targets: [c2.sort_id] }); flush();
  ok(!G.hand.cards.some((c) => c.base.value === '4' && c.base.suit === 'Hearts'), 'xerneas: only the first destroyed card each round');
  roundWon();
  ok(j.ability.extra.revived === false, 'xerneas: the rebirth comes back at end of round');
  const [c3] = hand(['S_J']);
  const hm3 = add('c_hanged_man');
  act({ type: 'use', id: hm3.sort_id, targets: [c3.sort_id] }); flush();
  ok(G.hand.cards.some((c) => c !== c3 && c.base.value === 'Jack' && c.base.suit === 'Spades'), 'xerneas: a new round, a new rebirth');
});

// ------------------------------------------------------------------- LINE F: Tandemaus -> Maushold
sec('tandemaus', () => {
  start('TANDEM');
  const j = add('j_poke_tandemaus');
  let r = play(hand(['S_5', 'H_5', 'D_9']));
  ok(r.total.mult === 2 + 3 + 3, 'tandemaus: a Pair: each card sharing a rank gives +3', r.total);
  r = play(hand(['S_5', 'H_5', 'D_9', 'C_9']));
  ok(r.total.mult === 2 + 12, 'tandemaus: Two Pair +12', r.total);
  r = play(hand(['S_5', 'H_5', 'D_5', 'C_9', 'S_9']));
  ok(r.total.mult === 4 + 15, 'tandemaus: Full House +15', r.total);
  r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'tandemaus: a lone card gives nothing', r.total);
  for (let i = 0; i < 4; i++) roundWon();
  winRound();
  ok(key(j) === 'j_poke_maushold' && (j.ability.extra.form === 'four' || j.ability.extra.form === 'three'), 'tandemaus -> maushold after 5 rounds (its family rolled)', [key(j), j.ability.extra.form]);
  nextRound();
  j.ability.extra.form = 'four';
  G.GAME.probabilities.normal = 2; // 2 in 2: every roll hits
  r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 11 * 5, 'maushold: Population Bomb, every roll hit -> the first card retriggered 4 times (the cap)', r.total);
  G.GAME.probabilities.normal = 0;
  r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 11 * 2, 'maushold: no roll hits -> retriggered once', r.total);
  G.GAME.probabilities.normal = 1;
  const reps = [];
  for (let i = 0; i < 40; i++) reps.push((play(hand(['S_A'])).total.chips - 5) / 11 - 1);
  const avg = reps.reduce((s, x) => s + x, 0) / reps.length;
  ok(reps.every((x) => x >= 1 && x <= 4) && avg > 1.4 && avg < 2.4, 'maushold: 1 in 2 per extra retrigger: 1-4, about 1.9 on average', [avg, reps.join('')]);
  G.GAME.probabilities.normal = 0;
  r = play(hand(['S_5', 'H_5']));
  ok(r.total.mult === 2 + 3 * 2 + 3, 'maushold: keeps Tandemaus\'s +3 per shared rank (the first card scores twice)', r.total);
  j.ability.extra.form = 'three';
  G.GAME.probabilities.normal = 2;
  const m0 = money();
  r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 11 * 4 && money() - m0 === 3, 'maushold (Family of Three): up to 3 retriggers, each earning $1', [r.total, money() - m0]);
  G.GAME.probabilities.normal = 1;
  // the Family of Three is 1 in 100, rolled when the card is made
  let three = 0;
  for (let i = 0; i < 400; i++) { const c = add('j_poke_maushold'); if (c.ability.extra.form === 'three') three++; c.remove(); }
  ok(three >= 1 && three <= 12, 'maushold: the Family of Three about 1 in 100 (400 made)', three);
  const L = MODS.pokermon.content.loc.descriptions.Joker;
  ok(C('maushold').loc_vars(C('maushold'), [], j).key === 'j_poke_maushold_three' && L.j_poke_maushold_three.text.some((l) => l.includes('Family of Three')), 'maushold: the Family of Three\'s own text');
});

// ------------------------------------------------------------------- LINE G: Darumaka -> Darmanitan
sec('darumaka', () => {
  start('DARUMAKA');
  const j = add('j_poke_darumaka');
  G.GAME.probabilities.normal = 0; // Absol-style: never misses
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 15, 'darumaka: +15 Mult', r.total);
  G.GAME.probabilities.normal = 4; // 4 in 4: Hustle always misses (probability jokers make it miss MORE)
  r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'darumaka: Hustle — gives nothing', r.total);
  G.GAME.probabilities.normal = 1;
  let miss = 0;
  for (let i = 0; i < 80; i++) if (play(hand(['S_A'])).total.mult === 1) miss++;
  ok(miss >= 10 && miss <= 32, 'darumaka: misses about 1 in 4 (80 hands)', miss);
  for (let i = 0; i < 3; i++) roundWon();
  winRound();
  ok(key(j) === 'j_poke_darmanitan', 'darumaka -> darmanitan after 4 rounds', key(j));
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 30 && is_type(j, 'Fire'), 'darmanitan: +30 Mult', r.total);
  // Zen Mode on the round's final hand: X3 instead, and Psychic for that hand
  const center = C('darmanitan'), orig = center.calculate;
  let seen = null;
  center.calculate = function (self, card, context) { if (context.joker_main) seen = [is_type(card, 'Psychic'), card.ability.psychic_sticker]; return orig.call(this, self, card, context); };
  try {
    G.GAME.chips = 0; G.GAME.blind.chips = 1; // this last hand wins the round
    G.GAME.current_round.hands_left = 1;
    const c = hand(['S_A']);
    act({ type: 'highlight', ids: c.map((x) => x.sort_id) });
    const res = act({ type: 'play' });
    const tot = res.events.find((e) => e.type === 'hand_total');
    ok(tot.mult === 3, 'darmanitan: Zen Mode — X3 Mult instead of +30 on the final hand', tot);
  } finally { center.calculate = orig; }
  ok(seen && seen[0] === true, 'darmanitan: Psychic during the final hand (a Tera sticker)', seen);
  ok(G.STATE === STATES.ROUND_EVAL && is_type(j, 'Fire') && !is_type(j, 'Psychic') && !j.ability.psychic_sticker && j.ability.extra.ptype === 'Fire', 'darmanitan: Fire again at end of round', [j.ability.extra.ptype, j.ability.psychic_sticker]);
  nextRound();
  apply_type_sticker(j, 'Water');
  center.calculate = function (self, card, context) { if (context.joker_main) seen = is_type(card, 'Psychic'); return orig.call(this, self, card, context); };
  try {
    G.GAME.chips = 0; G.GAME.blind.chips = 1;
    G.GAME.current_round.hands_left = 1;
    const c = hand(['S_A']);
    act({ type: 'highlight', ids: c.map((x) => x.sort_id) });
    act({ type: 'play' });
  } finally { center.calculate = orig; }
  ok(seen === true && j.ability.water_sticker && !j.ability.psychic_sticker && j.ability.extra.ptype === 'Water', 'darmanitan: a Tera Water Darmanitan goes Psychic and back to its Water sticker', [seen, j.ability.extra.ptype]);
});

// ------------------------------------------------------------------- LINE H: Scraggy -> Scrafty
sec('scraggy', () => {
  start('SCRAGGY');
  const j = add('j_poke_scraggy');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4, 'scraggy: +4 Mult', r.total);
  winRound(); // the round's 2nd hand
  ok(j.ability.extra.mult === 4, 'scraggy: a Blind beaten with the 2nd hand: no Moxie', j.ability.extra.mult);
  nextRound();
  winRound(); // the round's 1st hand
  ok(j.ability.extra.mult === 7 && G.GAME.current_round.hands_played === 1, 'scraggy: Moxie +3 when the Blind falls to the first hand', j.ability.extra.mult);
  nextRound(); roundWon(); roundWon();
  ok(key(j) === 'j_poke_scrafty' && j.ability.extra.mult === 13, 'scraggy -> scrafty after 4 rounds (Moxie 3 times: +13 Mult kept; the last one-shot grows it before it evolves)', [key(j), j.ability.extra.mult]);
  r = play(hand(['S_A']));
  ok(near(r.total.mult, (1 + 13) * 1.5), 'scrafty: X1.5 on the round\'s first hand (with its Mult)', r.total);
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 13, 'scrafty: later hands: just the Mult', r.total);
  winRound();
  ok(j.ability.extra.mult === 13, 'scrafty: a 3rd-hand win: no Moxie', j.ability.extra.mult);
  nextRound();
  winRound();
  ok(j.ability.extra.mult === 16, 'scrafty: Moxie +3 (no other Dark Joker)', j.ability.extra.mult);
  nextRound();
  add('j_poke_murkrow'); add('j_poke_poochyena');
  winRound();
  ok(j.ability.extra.mult === 16 + 3 + 2, 'scrafty: Moxie +3, +1 per other Dark Joker (Murkrow, Poochyena)', j.ability.extra.mult);
});

// ------------------------------------------------------------------- Spiritomb
sec('spiritomb', () => {
  start('SPIRITOMB');
  const j = add('j_poke_spiritomb');
  const [a, b] = hand(['D_Q', 'C_3']);
  const hm = add('c_hanged_man');
  act({ type: 'use', id: hm.sort_id, targets: [a.sort_id, b.sort_id] }); flush();
  ok(j.ability.extra.spirits === 2, 'spiritomb: 2 playing cards destroyed -> 2 spirits', j.ability.extra.spirits);
  const s = add('j_poke_tandemaus');
  act({ type: 'sell', id: s.sort_id }); flush();
  ok(j.ability.extra.spirits === 3, 'spiritomb: a Joker sold -> 1 spirit', j.ability.extra.spirits);
  clearHand();
  let r = play(hand(['S_A']));
  ok(near(r.total.mult, 1 + 3 * 0.02), 'spiritomb: X0.02 per spirit (X1.06)', r.total);
  // The Soul at 108 (once, must have room)
  j.ability.extra.spirits = 106;
  for (const c of G.consumeables.cards.slice()) c.remove();
  add('c_hanged_man'); add('c_fool'); flush();
  ok(G.consumeables.cards.length === G.consumeables.config.card_limit, 'consumable slots full');
  const s2 = add('j_poke_tandemaus');
  act({ type: 'sell', id: s2.sort_id }); flush();
  const s3 = add('j_poke_tandemaus');
  act({ type: 'sell', id: s3.sort_id }); flush();
  ok(j.ability.extra.spirits === 108 && !j.ability.extra.created && !G.consumeables.cards.some((c) => key(c) === 'c_soul'), 'spiritomb: 108 spirits but no room: no Soul yet', j.ability.extra);
  G.consumeables.cards[0].remove(); flush();
  const s4 = add('j_poke_tandemaus');
  act({ type: 'sell', id: s4.sort_id }); flush();
  ok(j.ability.extra.created && G.consumeables.cards.filter((c) => key(c) === 'c_soul').length === 1, 'spiritomb: with room, The Soul', G.consumeables.cards.map(key));
  for (const c of G.consumeables.cards.slice()) c.remove();
  const s5 = add('j_poke_tandemaus');
  act({ type: 'sell', id: s5.sort_id }); flush();
  ok(!G.consumeables.cards.some((c) => key(c) === 'c_soul') && j.ability.extra.spirits === 110, 'spiritomb: only once (spirits still count)', j.ability.extra.spirits);
  r = play(hand(['S_A']));
  ok(near(r.total.mult, 1 + 110 * 0.02), 'spiritomb: X3.2 at 110 spirits', r.total);
});

// ------------------------------------------------------------------- Tatsugiri
sec('tatsugiri', () => {
  start('TATSU');
  const forms = new Set();
  for (let i = 0; i < 30; i++) { const c = add('j_poke_tatsugiri'); forms.add(c.ability.extra.form); c.remove(); }
  ok(forms.size === 3 && ['curly', 'droopy', 'stretchy'].every((f) => forms.has(f)), 'tatsugiri: its Nature is rolled on creation (Curly / Droopy / Stretchy)', [...forms]);
  const water = add('j_poke_magikarp');
  water.ability.extra.chips = 0;
  const t = add('j_poke_tatsugiri');
  const base = play(hand(['S_A'])).total; // Commander (whatever the form) on Magikarp
  t.ability.extra.form = 'curly';
  let r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 11 && near(r.total.mult, 1.75), 'tatsugiri (Curly): the leftmost Water Joker gives X1.75', [r.total, base]);
  t.ability.extra.form = 'droopy';
  r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 11 + 100 && r.total.mult === 1, 'tatsugiri (Droopy): +100 Chips', r.total);
  t.ability.extra.form = 'stretchy';
  r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 11 && r.total.mult === 1 + 20, 'tatsugiri (Stretchy): +20 Mult', r.total);
  const w2 = add('j_poke_squirtle');
  w2.ability.extra.chips = 0; w2.ability.extra.chip_mod = 0;
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 20, 'tatsugiri: only the leftmost Water Joker (one Commander)', r.total);
  water.remove(); w2.remove();
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 && r.total.chips === 5 + 11, 'tatsugiri: no Water Joker, nothing (it gives nothing itself)', r.total);
  apply_type_sticker(t, 'Water');
  r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'tatsugiri: never commands itself, even Tera Water', r.total);
  const L = MODS.pokermon.content.loc.descriptions.Joker;
  ok(C('tatsugiri').loc_vars(C('tatsugiri'), [], t).key === 'j_poke_tatsugiri_stretchy' && L.j_poke_tatsugiri_stretchy.text.some((l) => l.includes('Stretchy')), 'tatsugiri: its Nature\'s own text');
});

// ------------------------------------------------------------------- LINE I: Mudbray -> Mudsdale
sec('mudbray', () => {
  start('MUDBRAY');
  const j = add('j_poke_mudbray');
  let r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 11 + 20 && j.ability.extra.chips === 20, 'mudbray: +20 Chips; the round\'s first hand doesn\'t grow it', r.total);
  r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 11 + 26, 'mudbray: Stamina +6 on a later hand', r.total);
  winRound(); // +6 (3rd hand)
  ok(j.ability.extra.chips === 32, 'mudbray: +32', j.ability.extra.chips);
  nextRound();
  for (let i = 0; i < 3; i++) roundWon();
  winRound();
  ok(key(j) === 'j_poke_mudsdale' && j.ability.extra.chips === 32 && j.ability.extra.chip_mod === 10, 'mudbray -> mudsdale after 5 rounds (+32 Chips kept)', [key(j), j.ability.extra]);
  nextRound();
  const [x, y, z] = hand(['S_A', 'H_3', 'D_8']);
  r = play([x, y, z]);
  ok(y.config.center.key === 'm_stone' && z.config.center.key === 'c_base' && x.config.center.key === 'c_base' && r.total.chips === 5 + 11 + 32,
    'mudsdale: Mud Spit — the first unscored card becomes Stone; the first hand doesn\'t grow Stamina', [y.config.center.key, z.config.center.key, r.total]);
  r = play(hand(['S_K']));
  ok(r.total.chips === 5 + 10 + 42, 'mudsdale: Stamina +10', r.total);
});

// ------------------------------------------------------------------- pools
sec('pools', () => {
  start('POOLNEW');
  const avail = (r) => get_current_pool('Joker', r)[0].filter((k) => k !== 'UNAVAILABLE');
  const ofNew = (r) => avail(r).filter((k) => NEW.includes(k.replace('j_poke_', ''))).sort();
  ok(JSON.stringify(ofNew(0.1)) === JSON.stringify(['j_poke_darumaka', 'j_poke_mudbray', 'j_poke_scraggy', 'j_poke_tandemaus']), 'Common pool: Tandemaus, Darumaka, Scraggy, Mudbray', ofNew(0.1));
  ok(JSON.stringify(ofNew(0.8)) === JSON.stringify(['j_poke_grookey', 'j_poke_honedge', 'j_poke_shinx', 'j_poke_spheal']), 'Uncommon pool: Shinx, Honedge, Spheal, Grookey', ofNew(0.8));
  ok(JSON.stringify(ofNew(0.99)) === JSON.stringify(['j_poke_spiritomb', 'j_poke_tatsugiri']), 'Rare pool: Spiritomb, Tatsugiri (Safari stages never)', ofNew(0.99));
  const pool = P_CENTER_POOLS.Joker.map((c) => c.key);
  ok(NEW.every((n) => pool.includes('j_poke_' + n)), 'every new joker is in the Joker pool list (the collection)');
  add('j_poke_shinx');
  ok(!avail(0.8).includes('j_poke_shinx') && !avail(0.8).includes('j_poke_luxio'), 'one per family: Shinx held -> its line is out');
  start('POOLNEW2', { gen_four: false, gen_nine: false });
  const off = (r) => avail(r).filter((k) => ['j_poke_shinx', 'j_poke_spiritomb', 'j_poke_tandemaus', 'j_poke_tatsugiri'].includes(k));
  ok(off(0.8).length === 0 && off(0.99).length === 0 && off(0.1).length === 0 && avail(0.1).includes('j_poke_darumaka'), 'the Gen options take them out (Gen 4 / Gen 9 off)');
});

// ------------------------------------------------------------------- the art: upstream 3.9.1's own cards
// Pokermon 3.9.1's pokespriteload.lua draws every one of these species (no upstream joker uses them yet): Natdex-sheet cells, Gen-sheet
// cells for Aegislash / Xerneas (Gen 6), Darmanitan (Gen 5), the Urshifu formes (Gen 8), Maushold / Tatsugiri (Gen 9); Legendaries
// float a soul. Each cell holds a picture, its Shiny twin a recolour (not a copy, not blank).
const SPR = {
  shinx: ['Natdex', 24, 26], luxio: ['Natdex', 26, 26], luxray: ['Natdex', 28, 26], honedge: ['Natdex', 6, 45], doublade: ['Natdex', 8, 45], aegislash: ['Gen06', 6, 8],
  spheal: ['Natdex', 4, 24], sealeo: ['Natdex', 6, 24], walrein: ['Natdex', 8, 24], grookey: ['Natdex', 28, 53], thwackey: ['Natdex', 0, 54], rillaboom: ['Natdex', 2, 54],
  kubfu: ['Natdex', 10, 59, 11, 59], urshifu_single: ['Gen08', 2, 10, 3, 10], urshifu_rapid: ['Gen08', 4, 10, 5, 10], xerneas: ['Gen06', 8, 10, 9, 10],
  tandemaus: ['Natdex', 16, 61], maushold: ['Gen09', 6, 0], darumaka: ['Natdex', 26, 36], darmanitan: ['Gen05', 10, 0], scraggy: ['Natdex', 6, 37], scrafty: ['Natdex', 8, 37],
  spiritomb: ['Natdex', 12, 29], tatsugiri: ['Gen09', 0, 3], mudbray: ['Natdex', 26, 49], mudsdale: ['Natdex', 28, 49],
};
sec('art centers', () => {
  for (const [n, [sheet, x, y, sx, sy]] of Object.entries(SPR)) {
    const c = C(n);
    ok(c.atlas === 'poke_AtlasJokersBasic' + sheet + '391' && c.pos.x === x && c.pos.y === y && (sx === undefined ? !c.soul_pos : c.soul_pos && c.soul_pos.x === sx && c.soul_pos.y === sy),
      `${n}: its 3.9.1 card (${sheet} {${x},${y}}${sx === undefined ? '' : ` + soul {${sx},${sy}}`})`, [c.atlas, c.pos, c.soul_pos]);
  }
  const ATL = MODS.pokermon.content.atlases;
  ok(['Natdex', 'Gen05', 'Gen06', 'Gen08', 'Gen09'].every((g) => ATL['poke_AtlasJokersBasic' + g + '391'] && ATL['poke_AtlasJokersBasic' + g + 'Shiny391']), 'the sheets and their Shiny twins are registered');
  // Series A (the cosmetic option): Spiritomb and Mudbray have 3.9.1 alternates
  const sa = (n) => seriesA({ center: 'j_poke_' + n, atlas: C(n).atlas, pos: C(n).pos, soul_pos: C(n).soul_pos }, true);
  ok(sa('spiritomb') && sa('spiritomb').atlas === 'poke_AtlasJokersSeriesANatdex391' && sa('spiritomb').soul_pos && sa('mudbray') && !sa('shinx'),
    'Series A: Spiritomb (with its floating soul) and Mudbray draw their alternates; Shinx has none', [sa('spiritomb'), sa('mudbray')]);
});
if (!ART) console.log('(Pokermon art not on disk: the sprite checks are skipped; set MICATRO_MAIN)');
else {
  const want = {};
  const rect = (x, y) => [x * 142, y * 190, 142, 190];
  for (const [n, [sheet, x, y, sx, sy]] of Object.entries(SPR)) {
    for (const sh of ['', 'Shiny']) {
      const f = `Basic Series/AtlasJokersBasic${sheet}${sh}-391.png`;
      (want[f] = want[f] || {})[n + sh] = rect(x, y);
      if (sx !== undefined) want[f][n + sh + '_soul'] = rect(sx, sy);
    }
  }
  const px = {};
  for (const [file, rects] of Object.entries(want)) Object.assign(px, await crops(path.join(ART, file), rects));
  const opaque = (r) => { let n = 0; for (let i = 3; i < r.px.length; i += 4) if (r.px[i] > 0) n++; return n; };
  const colours = (r) => { const s = new Set(); for (let i = 0; i < r.px.length; i += 4) if (r.px[i + 3]) s.add((r.px[i] << 16) | (r.px[i + 1] << 8) | r.px[i + 2]); return s.size; };
  const diff = (a, b) => { let d = 0; for (let i = 0; i < a.px.length; i++) d += Math.abs(a.px[i] - b.px[i]); return d / a.px.length; };
  for (const [n, [, , , sx]] of Object.entries(SPR)) {
    const a = px[n], s = px[n + 'Shiny'];
    ok(a && a.inside && opaque(a) > 142 * 190 * 0.9 && colours(a) >= 12, `${n}: a real card`, a && [opaque(a), colours(a)]);
    ok(s && s.inside && diff(a, s) > 1, `${n}: its Shiny twin is a recolour`, s && diff(a, s));
    if (sx !== undefined) {
      const so = px[n + '_soul'], ss = px[n + 'Shiny_soul'];
      ok(so && opaque(so) > 2000 && opaque(so) < 142 * 190 * 0.9 && colours(so) >= 8 && diff(so, ss) > 0.1, `${n}: its floating soul (and a Shiny one)`, so && [opaque(so), colours(so), diff(so, ss)]);
    }
  }
  // not one card drawn twice
  const names = Object.keys(SPR);
  ok(names.every((a, i) => names.every((b, k) => k <= i || diff(px[a], px[b]) > 1)), 'all 26 cards are different pictures');
  // and none of them is upstream's "Please refer to the Atlas" note card (white text on red): those have few colours
  ok(names.every((n) => colours(px[n]) >= 12), 'no placeholder note cards');
}

done();
