// The owner's Gen 9 starters (2026-10-28, contentRev 51; jokers/pokejokers_designs.js LINES F2b / F2c; PORTING.md "The owner's Gen 9 starters"):
//   Fuecoco (909) -> Crocalor (910) -> Skeledirge (911), a Fire starter: +1 discard at every stage. Torch Song: every hand played
//   (its `before`: the hand being played counts itself) permanently banks +1 / +2 Mult; Skeledirge gives the banked Mult and banks
//   X0.05 per hand played instead.
//   Quaxly (912) -> Quaxwell (913) -> Quaquaval (914), a Water starter: +1 hand at every stage. Moxie: when you beat a Blind it
//   permanently banks +4 / +6 Chips per unused hand (the hands left after the winning one); Quaquaval gives the banked Chips and
//   banks X0.2 per unused hand instead.
//   Basic Uncommon $5 (a starter: the Starter Pack), Stage 1 Safari $8, Stage 2 Safari $10; 5 rounds, then 5 (Cyndaquil's timers).
//   Energy raises the gain only (+20% of its base each: mult_mod / chip_mod / Xmult_mod); the banks are in no energy field (never
//   retroactive) and carry through both evolutions, the Energy too. The perks never change with Energy.
// Every ability is FIRED through real plays / rounds (act) with exact numbers.
//   node micatro/tests/mods/pokermon_starters_gen9_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, G, P_CENTERS, P_CARDS, act, STATES } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { Card } from '../../js/engine/core.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy } from '../../mods/pokermon/systems/energy.js';
import { starter_lists } from '../../mods/pokermon/boosters/packs1.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const C = (n) => P_CENTERS['j_poke_' + n];
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 400)); } };
const ex = (j) => j.ability.extra;
const cr = () => G.GAME.current_round;
const rr = () => G.GAME.round_resets;
const FIRE = ['fuecoco', 'crocalor', 'skeledirge'];
const WATER = ['quaxly', 'quaxwell', 'quaquaval'];
const ALL = [...FIRE, ...WATER];
/** Play a lone Ace (High Card: 5 + 11 Chips, 1 Mult before the jokers). */
const ace = () => { clearHand(); const r = play(hand(['S_A'])); flush(); return r.total; };
/** Win the round with `left` hands left BEFORE the winning hand (so left - 1 unused after it). */
function winWith(left) {
  cr().hands_left = left;
  G.GAME.chips = G.GAME.blind.chips;
  clearHand();
  const cs = hand(['C_2']);
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  return r;
}
const sell = (j) => { act({ type: 'sell', id: j.sort_id }); flush(); };
function blueprintLeft() {
  const bp = add('j_blueprint');
  G.jokers.remove_card(bp); G.jokers.cards.unshift(bp); bp.area = G.jokers;
  return bp;
}

// ------------------------------------------------------------------- pin, static data, order, families, art, Starter Pack lists
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 51 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 51+ (the Gen 9 starters)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  ok(ALL.every((n) => C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n)), 'all 6 registered and ported', ALL.filter((n) => !C(n) || C(n).unported));
  ok(ALL.every((n) => (STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n)), 'defined with the owner\'s designs (micatro/pokejokers_designs)');
  const addon = ['nacho', 'pokermonplus'].flatMap((m) => (MODS[m] && MODS[m].content && MODS[m].content.centers || []).filter((c) => ALL.some((n) => (c.name || '') === n || (c.key || '').endsWith('_' + n))).map((c) => c.key));
  ok(addon.length === 0, 'neither Nacho nor Pokermon+ has these species', addon);
});
sec('static', () => {
  start('GEN9S0');
  const S = 'poke_safari';
  const want = { fuecoco: [2, 5, 'Basic', 'Fire', 909], crocalor: [S, 8, 'One', 'Fire', 910], skeledirge: [S, 10, 'Two', 'Fire', 911],
    quaxly: [2, 5, 'Basic', 'Water', 912], quaxwell: [S, 8, 'One', 'Water', 913], quaquaval: [S, 10, 'Two', 'Water', 914] };
  const SPR = { fuecoco: 16, crocalor: 18, skeledirge: 20, quaxly: 22, quaxwell: 24, quaquaval: 26 };
  for (const [n, [rarity, cost, stage, type]] of Object.entries(want)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === type && c.config.extra.ptype === type && c.gen === 9,
      `${n}: rarity / cost / stage / ${type} / Gen 9`, [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.atlas === 'poke_AtlasJokersBasicNatdex391' && c.pos.x === SPR[n] && c.pos.y === 60 && !c.soul_pos, `${n}: upstream 3.9.1's own card (Natdex ${SPR[n]}, 60)`, [c.atlas, c.pos]);
    ok(c.attributes.includes('starter') && c.attributes.includes(type.toLowerCase() + '_type'), `${n}: 'starter' + ${type.toLowerCase()}_type attributes`, c.attributes);
  }
  ok(C('fuecoco').starter === true && C('quaxly').starter === true && ['crocalor', 'skeledirge', 'quaxwell', 'quaquaval'].every((n) => !C(n).starter),
    'only the Basics are starters (the Starter Pack flag)');
  const x = (n) => C(n).config.extra;
  ok(FIRE.every((n) => x(n).d_size === 1 && x(n).hands === undefined && x(n).h_size === undefined), 'Fire perk: +1 discard at every stage', FIRE.map(x));
  ok(WATER.every((n) => x(n).hands === 1 && x(n).d_size === undefined && x(n).h_size === undefined), 'Water perk: +1 hand at every stage', WATER.map(x));
  ok(x('fuecoco').rounds === 5 && x('crocalor').rounds === 5 && x('skeledirge').rounds === undefined && x('quaxly').rounds === 5 && x('quaxwell').rounds === 5 && x('quaquaval').rounds === undefined,
    'evolves after 5 rounds, then 5 (round_evo)', ALL.map((n) => x(n).rounds));
  ok(x('fuecoco').mult_mod === 1 && x('crocalor').mult_mod === 2 && x('skeledirge').Xmult_mod === 0.05 && x('skeledirge').mult_mod === undefined
    && x('fuecoco').torch_mult === 0 && x('skeledirge').torch_Xmult === 1, 'Torch Song: +1 / +2 Mult a hand, then X0.05 (banks from 0 / X1)', FIRE.map(x));
  ok(x('quaxly').chip_mod === 4 && x('quaxwell').chip_mod === 6 && x('quaquaval').Xmult_mod === 0.2 && x('quaquaval').chip_mod === undefined
    && x('quaxly').moxie_chips === 0 && x('quaquaval').moxie_Xmult === 1, 'Moxie: +4 / +6 Chips per unused hand, then X0.2 (banks from 0 / X1)', WATER.map(x));
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const i = keys.indexOf('j_poke_meowscarada');
  ok(i > 0 && keys.slice(i + 1, i + 8).join() === [...ALL.map((n) => 'j_poke_' + n), 'j_poke_tarountula'].join(), 'Pokédex order: after Meowscarada (908), before Tarountula (917)', keys.slice(i, i + 8));
  ok(JSON.stringify(poke_get_family_list('crocalor')) === JSON.stringify(FIRE) && JSON.stringify(poke_get_family_list('quaxwell')) === JSON.stringify(WATER), 'two families',
    [poke_get_family_list('crocalor'), poke_get_family_list('quaxwell')]);
  const L = starter_lists();
  ok(L.fire.includes('j_poke_fuecoco') && !L.fire.includes('j_poke_crocalor') && !L.fire.includes('j_poke_skeledirge'), 'Starter Pack Fire slot: Fuecoco, not its evolutions', L.fire);
  ok(L.water.includes('j_poke_quaxly') && !L.water.includes('j_poke_quaxwell') && !L.water.includes('j_poke_quaquaval'), 'Starter Pack Water slot: Quaxly, not its evolutions', L.water);
  ok(!L.grass.includes('j_poke_fuecoco') && !L.grass.includes('j_poke_quaxly') && !L.water.includes('j_poke_fuecoco') && !L.fire.includes('j_poke_quaxly'), 'each only in its own type\'s slot');
  add('j_poke_crocalor');
  ok(!starter_lists().fire.includes('j_poke_fuecoco') && starter_lists().water.includes('j_poke_quaxly'), 'holding Crocalor: Fuecoco leaves the Starter Pack (family present); Quaxly stays');
});

// ------------------------------------------------------------------- the Starter Pack, opened
sec('starter pack', () => {
  start('GEN9PACK');
  winRound(); act({ type: 'cash_out' });
  ok(G.STATE === STATES.SHOP, 'in the shop');
  let fire = null, water = null, n = 0;
  for (; n < 300; n++) {
    const pack = new Card(P_CARDS.empty, P_CENTERS.p_poke_pokepack_starter_pack);
    G.shop_booster.emplace(pack);
    G.GAME.dollars = 2000;
    if (!act({ type: 'buy', id: pack.sort_id }).ok) break;
    const ks = G.pack_cards.cards.map(key);
    if (!fire && ks[1] === 'j_poke_fuecoco') fire = ks;
    if (!water && ks[2] === 'j_poke_quaxly') water = ks;
    if (fire && water && ks[1] === 'j_poke_fuecoco') break; // keep this pack open to pick Fuecoco
    act({ type: 'skip_booster' });
  }
  ok(fire && water, 'Starter Packs offer Fuecoco in the Fire slot and Quaxly in the Water slot', [n, fire, water]);
  if (G.STATE === STATES.MOD_PACK) {
    const d0 = rr().discards;
    const f = G.pack_cards.cards.find((c) => key(c) === 'j_poke_fuecoco');
    ok(f && act({ type: 'use', id: f.sort_id }).ok && G.jokers.cards.some((c) => key(c) === 'j_poke_fuecoco') && rr().discards === d0 + 1,
      'picking Fuecoco from the pack: it joins the jokers with its +1 discard', [rr().discards, d0]);
  } else ok(false, 'a pack with Fuecoco left open to pick it', G.STATE);
});

// ------------------------------------------------------------------- Fuecoco -> Crocalor -> Skeledirge, Torch Song
sec('fuecoco line', () => {
  start('GEN9F');
  const d0 = rr().discards, dl0 = cr().discards_left;
  const j = add('j_poke_fuecoco');
  ok(rr().discards === d0 + 1 && cr().discards_left === dl0 + 1, 'fuecoco: +1 discard (this round and every round)', [rr().discards, cr().discards_left, d0, dl0]);
  let t = ace();
  ok(t.chips === 16 && t.mult === 1 + 1 && ex(j).torch_mult === 1, 'fuecoco: the first hand banks +1 Mult and counts itself (+1 Mult)', [t, ex(j).torch_mult]);
  t = ace();
  ok(t.mult === 1 + 2 && ex(j).torch_mult === 2, 'fuecoco: the second hand: +2 Mult banked', [t, ex(j).torch_mult]);
  const bp = blueprintLeft();
  t = ace();
  ok(t.mult === 1 + 3 + 3 && ex(j).torch_mult === 3, 'fuecoco + Blueprint: both give the +3 Mult; the bank grows once', [t, ex(j).torch_mult]);
  sell(bp);
  // Energy: the gain only (2 Fire Energy: 1 -> 1.4); what is banked stays 3 (not retroactive)
  increment_energy(j, 'Fire'); increment_energy(j, 'Fire');
  ok(near(ex(j).mult_mod, 1.4) && ex(j).torch_mult === 3 && ex(j).d_size === 1 && ex(j).rounds === 5, 'fuecoco: 2 Fire Energy -> +1.4 a hand; the bank stays +3; the discard and the timer fixed', ex(j));
  t = ace();
  ok(near(t.mult, 1 + 4.4) && near(ex(j).torch_mult, 4.4), 'fuecoco (2 Energy): banks +1.4 -> +4.4 Mult', [t, ex(j).torch_mult]);
  const d = JSON.stringify(describe(j));
  ok(/Torch Song/.test(d) && /1\.4/.test(d) && /4\.4/.test(d) && /Evolves after \{C:attention,s:0\.8\}5\{C:inactive,s:0\.8\} rounds/.test(d), 'fuecoco: the tooltip shows Torch Song, +1.4, the +4.4 bank and 5 rounds', d.slice(0, 700));
  // 5 rounds (each winning hand banks +1.4 too)
  for (let i = 1; i <= 4; i++) {
    winRound(); flush();
    ok(key(j) === 'j_poke_fuecoco' && ex(j).rounds === 5 - i, 'fuecoco: round ' + i + ' won, still Fuecoco (' + (5 - i) + ' left)', [key(j), ex(j).rounds]);
    nextRound();
  }
  winRound(); flush();
  ok(key(j) === 'j_poke_crocalor', 'fuecoco -> crocalor after 5 rounds', key(j));
  ok(near(ex(j).torch_mult, 4.4 + 5 * 1.4) && near(ex(j).mult_mod, 2.8) && ex(j).energy_count === 2 && ex(j).rounds === 5 && ex(j).d_size === 1,
    'crocalor keeps the +11.4 bank and its 2 Energy (+2.8 a hand: 2 x 1.4)', ex(j));
  ok(rr().discards === d0 + 1, 'crocalor: still exactly +1 discard (evolving swaps the perk, never stacks it)', [rr().discards, d0]);
  nextRound();
  t = ace();
  ok(near(t.mult, 1 + 14.2) && near(ex(j).torch_mult, 14.2), 'crocalor: banks +2.8 -> +14.2 Mult', [t, ex(j).torch_mult]);
  for (let i = 1; i <= 4; i++) { winRound(); flush(); ok(key(j) === 'j_poke_crocalor' && ex(j).rounds === 5 - i, 'crocalor: round ' + i + ', ' + (5 - i) + ' left', ex(j).rounds); nextRound(); }
  winRound(); flush();
  ok(key(j) === 'j_poke_skeledirge', 'crocalor -> skeledirge after 5 rounds', key(j));
  ok(near(ex(j).torch_mult, 14.2 + 5 * 2.8) && ex(j).torch_Xmult === 1 && near(ex(j).Xmult_mod, 0.07) && ex(j).energy_count === 2 && ex(j).d_size === 1 && ex(j).mult_mod === undefined,
    'skeledirge keeps the +28.2 Mult bank; X1 banked; its 2 Energy: X0.07 a hand', ex(j));
  nextRound();
  t = ace();
  ok(near(ex(j).torch_Xmult, 1.07) && near(ex(j).torch_mult, 28.2) && near(t.mult, (1 + 28.2) * 1.07), 'skeledirge: +28.2 Mult (banks no more) and X1.07 (this hand counts)', [t, ex(j)]);
  t = ace();
  ok(near(ex(j).torch_Xmult, 1.14) && near(t.mult, 29.2 * 1.14), 'skeledirge: X1.14 on the next hand', [t, ex(j).torch_Xmult]);
  increment_energy(j, 'Fire');
  ok(near(ex(j).Xmult_mod, 0.08) && near(ex(j).torch_Xmult, 1.14) && near(ex(j).torch_mult, 28.2), 'skeledirge: a 3rd Energy -> X0.08 a hand; neither bank re-grows', ex(j));
  t = ace();
  ok(near(ex(j).torch_Xmult, 1.22) && near(t.mult, 29.2 * 1.22), 'skeledirge (3 Energy): X1.22', [t, ex(j).torch_Xmult]);
  ok(rr().discards === d0 + 1, 'skeledirge: +1 discard', [rr().discards, d0]);
  sell(j);
  ok(rr().discards === d0 && cr().discards_left <= dl0, 'sold: the +1 discard goes', [rr().discards, d0]);
});
sec('skeledirge fresh', () => {
  start('GEN9SK');
  const j = add('j_poke_skeledirge');
  let t = ace();
  ok(t.mult === 1.05 && ex(j).torch_Xmult === 1.05 && ex(j).torch_mult === 0, 'a fresh Skeledirge: X1.05 on its first hand, no Mult', [t, ex(j)]);
  const bp = blueprintLeft();
  t = ace();
  ok(near(t.mult, 1.1 * 1.1) && ex(j).torch_Xmult === 1.1, 'skeledirge + Blueprint: X1.1 twice; the bank grows once', [t, ex(j).torch_Xmult]);
  sell(bp);
});

// ------------------------------------------------------------------- Quaxly -> Quaxwell -> Quaquaval, Moxie
sec('quaxly line', () => {
  start('GEN9Q');
  const h0 = rr().hands, hl0 = cr().hands_left;
  const j = add('j_poke_quaxly');
  ok(rr().hands === h0 + 1 && cr().hands_left === hl0 + 1, 'quaxly: +1 hand (this round and every round)', [rr().hands, cr().hands_left, h0, hl0]);
  let t = ace();
  ok(t.chips === 16 && t.mult === 1 && ex(j).moxie_chips === 0, 'quaxly: nothing banked before a Blind is beaten', [t, ex(j)]);
  winWith(4);
  ok(ex(j).moxie_chips === 12 && ex(j).rounds === 4, 'quaxly: the Blind beaten with 3 hands unused -> +12 Chips banked (3 x 4)', ex(j));
  nextRound();
  t = ace();
  ok(t.chips === 16 + 12 && t.mult === 1, 'quaxly: +12 Chips every hand', t);
  winWith(1);
  ok(ex(j).moxie_chips === 12 && ex(j).rounds === 3, 'quaxly: won on the last hand (0 unused): nothing banked', ex(j));
  const r0 = ex(j).rounds; // (a bare end_of_round pass also counts the evolution down: put it back)
  j.calculate_joker({ end_of_round: true, game_over: true, main_eval: true });
  ok(ex(j).moxie_chips === 12, 'quaxly: a game over (the Blind not beaten) banks nothing', ex(j));
  ex(j).rounds = r0;
  nextRound();
  const bp = blueprintLeft();
  winWith(3);
  ok(ex(j).moxie_chips === 20 && ex(j).rounds === 2, 'quaxly + Blueprint: 2 unused -> +8 once (Blueprint copies the Chips, not the growth)', ex(j));
  nextRound();
  t = ace();
  ok(t.chips === 16 + 20 + 20, 'quaxly + Blueprint: both give +20 Chips', t);
  sell(bp);
  increment_energy(j, 'Water');
  ok(near(ex(j).chip_mod, 4.8) && ex(j).moxie_chips === 20 && ex(j).hands === 1 && ex(j).rounds === 2, 'quaxly: 1 Water Energy -> +4.8 per unused hand; the bank stays +20; the hand and the timer fixed', ex(j));
  const d = JSON.stringify(describe(j));
  ok(/Moxie/.test(d) && /4\.8/.test(d) && /\+20/.test(d) && /unused hand/.test(d), 'quaxly: the tooltip shows Moxie, +4.8 and the +20 bank', d.slice(0, 700));
  winWith(2);
  ok(near(ex(j).moxie_chips, 24.8) && ex(j).rounds === 1 && key(j) === 'j_poke_quaxly', 'quaxly (1 Energy): 1 unused -> +4.8 (24.8); 1 round left', ex(j));
  nextRound();
  winWith(3);
  ok(key(j) === 'j_poke_quaxwell', 'quaxly -> quaxwell after 5 rounds', key(j));
  ok(near(ex(j).moxie_chips, 34.4) && near(ex(j).chip_mod, 7.2) && ex(j).energy_count === 1 && ex(j).rounds === 5 && ex(j).hands === 1,
    'quaxwell keeps the bank (its last Blind\'s 2 unused hands banked first: 34.4) and its Energy (+7.2 per unused hand)', ex(j));
  ok(rr().hands === h0 + 1, 'quaxwell: still exactly +1 hand', [rr().hands, h0]);
  nextRound();
  t = ace();
  ok(near(t.chips, 16 + 34.4), 'quaxwell: +34.4 Chips', t);
  winWith(4);
  ok(near(ex(j).moxie_chips, 34.4 + 3 * 7.2) && ex(j).rounds === 4, 'quaxwell: 3 unused -> +21.6 (56)', ex(j));
  for (let i = 3; i >= 1; i--) { nextRound(); winWith(2); ok(key(j) === 'j_poke_quaxwell' && ex(j).rounds === i, 'quaxwell: ' + i + ' left', ex(j).rounds); }
  nextRound(); winWith(2);
  ok(key(j) === 'j_poke_quaquaval', 'quaxwell -> quaquaval after 5 rounds', key(j));
  ok(near(ex(j).moxie_chips, 56 + 4 * 7.2) && ex(j).moxie_Xmult === 1 && near(ex(j).Xmult_mod, 0.24) && ex(j).energy_count === 1 && ex(j).chip_mod === undefined && ex(j).hands === 1,
    'quaquaval keeps the +84.8 Chips; X1 banked; its Energy: X0.24 per unused hand', ex(j));
  nextRound();
  t = ace();
  ok(near(t.chips, 16 + 84.8) && t.mult === 1, 'quaquaval: +84.8 Chips (banks no more); no X yet', t);
  winWith(4);
  ok(near(ex(j).moxie_Xmult, 1.72) && near(ex(j).moxie_chips, 84.8), 'quaquaval: 3 unused -> X1.72 banked; the Chips unchanged', ex(j));
  nextRound();
  t = ace();
  ok(near(t.chips, 100.8) && near(t.mult, 1.72), 'quaquaval: +84.8 Chips and X1.72', t);
  ok(rr().hands === h0 + 1, 'quaquaval: +1 hand', [rr().hands, h0]);
  sell(j);
  ok(rr().hands === h0, 'sold: the +1 hand goes', [rr().hands, h0]);
});
sec('quaquaval fresh', () => {
  start('GEN9QQ');
  const j = add('j_poke_quaquaval');
  winWith(3);
  ok(ex(j).moxie_Xmult === 1.4 && ex(j).moxie_chips === 0, 'a fresh Quaquaval: 2 unused -> X1.4 (2 x 0.2)', ex(j));
  nextRound();
  const t = ace();
  ok(t.chips === 16 && near(t.mult, 1.4), 'quaquaval: X1.4, no Chips', t);
});

// ------------------------------------------------------------------- Energy: every gain at +20% of its base, the perks fixed
sec('energy', () => {
  start('GEN9E');
  const want = { fuecoco: ['mult_mod', 'Fire', [1.2, 1.4, 1.6]], crocalor: ['mult_mod', 'Fire', [2.4, 2.8, 3.2]], skeledirge: ['Xmult_mod', 'Fire', [0.06, 0.07, 0.08]],
    quaxly: ['chip_mod', 'Water', [4.8, 5.6, 6.4]], quaxwell: ['chip_mod', 'Water', [7.2, 8.4, 9.6]], quaquaval: ['Xmult_mod', 'Water', [0.24, 0.28, 0.32]] };
  for (const [n, [f, type, steps]] of Object.entries(want)) {
    const j = add('j_poke_' + n);
    const got = steps.map(() => { increment_energy(j, type); return ex(j)[f]; });
    const perk = FIRE.includes(n) ? ex(j).d_size === 1 : ex(j).hands === 1;
    const bank = ex(j).torch_mult === 0 || ex(j).moxie_chips === 0;
    ok(got.every((v, i) => near(v, steps[i])) && perk && bank, `${n}: 1 / 2 / 3 ${type} Energy -> ${f} ${steps.join(' / ')}; the perk fixed, the bank untouched`, [got, ex(j)]);
    sell(j);
  }
  const c = add('j_poke_fuecoco');
  increment_energy(c, 'Colorless');
  ok(near(ex(c).mult_mod, 1.1), 'fuecoco: a Colorless Energy at half strength -> +1.1', ex(c).mult_mod);
  const w = add('j_poke_quaxly');
  increment_energy(w, 'Fire');
  ok(ex(w).chip_mod === 4, 'quaxly: a Fire Energy doesn\'t match (still +4)', ex(w).chip_mod);
});

done();
