// Pokermon contentRev 111 (SIMPLE_TRIO_REV, jokers/pokejokers_designs.js; the owner, 2026-11-09: "Kyogre's tooltip is unreadable"): the
// weather trio and its Primal / Mega forms are plain, separate Legendaries — no weather, no Castform, no reference to each other:
//   Kyogre          +1 hand each round. Scored Clubs retrigger once and give X1.25 Mult.        (X: Xmult_multi, +5% per Energy)
//   Groudon         +1 discard each round. Scored Hearts and Diamonds give X1.25 Mult.          (unchanged numbers)
//   Rayquaza        +1 hand and +1 discard each round. Gains X0.2 Mult whenever a played hand contains a Straight or a Flush (its bank).
//   Primal Kyogre   +2 hands each round. Scored Clubs retrigger twice and give X1.5 Mult.        (Xmult_multi, +5%)
//   Primal Groudon  +2 discards each round. Scored Hearts and Diamonds give X1.75 Mult.          (Xmult_multi2, +5%; X1.5 before r111)
//   Mega Rayquaza   +2 hands and +2 discards each round. Gains X0.4 Mult per Straight or Flush (Rayquaza's bank).
// Gone: the Primal Clash, Rayquaza's calm, Kyogre / Groudon (and the Primals) making rain / sun and locking Castform (Castform reads its own
// forecast again). Every effect is FIRED in real hands. A run recorded on r110 (micatro/tests/fixtures/pokermon_weathertrio_r110_recipe.json,
// recorded on main before this change: Kyogre + Groudon + Primal Groudon + Castform + Tympole, a Clubs-majority first deal, a Pair of Aces)
// replays exactly as recorded; the same moves on the current rules play the new ones. A card made on r110 and played on r111 gains its new
// X at once, scaled by the Energy it holds.
//   node micatro/tests/mods/pokermon_simple_trio_test.mjs
import { readFileSync } from 'fs';
import { T, start, hand, add, play, clearHand, G, P_CENTERS, act } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { increment_energy, energy_can_use } from '../../mods/pokermon/systems/energy.js';
import { SIMPLE_TRIO_REV, swift_swim_raining, cherrim_sunny, castform_lock } from '../../mods/pokermon/jokers/pokejokers_designs.js';

const { ok, done } = T();
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 700)); } };
const ex = (j) => j.ability.extra;
const key = (c) => c.config.center.key;
const plain = (j) => describe(j).lines.join(' ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
const cr = () => G.GAME.current_round;
const J = (k) => G.jokers.cards.find((c) => key(c) === k);
const r110 = (fn) => { PINS.RULES.pins = { pokermon: '3.9.1+r110' }; try { return fn(); } finally { PINS.RULES.pins = null; } };
const dry = { ability: { extra: {} } }; // a reader with no first-deal read of its own: only a held joker can make rain / sun

function stackDeck(specs) {
  for (const c of G.deck.cards.slice()) { G.deck.remove_card(c); G.discard.emplace(c); }
  return specs.map((s) => create_playing_card({ front: P_CARDS[s], center: P_CENTERS.c_base }, G.deck));
}
/** A new run at the first blind select with these jokers (prep(js) before the blind); the first deal is `specs`. -> the jokers */
function deal(seed, specs, jokers, prep) {
  start(seed, {}, { noBlind: true });
  const js = jokers.map((k) => add(k));
  if (prep) prep(js);
  stackDeck(specs);
  act({ type: 'select_blind' }); flush();
  return js;
}
const play2 = (keys) => { clearHand(); return play(hand(keys)).total; };
function useOrb(k) { const c = add(k); const r = act({ type: 'use', id: c.sort_id, targets: [] }); flush(); return r; }
const CLUBS = ['C_2', 'C_3', 'C_4', 'C_5', 'H_9'];   // 4 Clubs vs 1 red
const REDS = ['H_2', 'H_3', 'D_4', 'D_5', 'C_9'];    // 4 red vs 1 Club
const SPADES = ['S_2', 'S_3', 'S_4', 'S_5', 'C_6'];  // Spades most

sec('pin', () => {
  ok(SIMPLE_TRIO_REV === 111 && MODS.pokermon.contentRev >= SIMPLE_TRIO_REV && PINS.rulesRev('pokermon') >= SIMPLE_TRIO_REV, 'Pokermon contentRev 111+ (the simple weather trio)', [SIMPLE_TRIO_REV, MODS.pokermon.contentRev]);
});

// ------------------------------------------------------------------- the six texts (no weather, no Castform, no each other)
sec('texts', () => {
  start('TRIO0');
  const want = {
    kyogre: '+1 hand each round Scored Clubs retrigger once and give X1.25 Mult',
    groudon: '+1 discard each round Scored Hearts and Diamonds give X1.25 Mult',
    rayquaza: '+1 hand and +1 discard each round Gains X0.2 Mult whenever a played hand contains a Straight or a Flush (Currently X1 Mult)',
    primal_kyogre: '+2 hands each round Scored Clubs retrigger twice and give X1.5 Mult',
    primal_groudon: '+2 discards each round Scored Hearts and Diamonds give X1.75 Mult',
    mega_rayquaza: '+2 hands and +2 discards each round Gains X0.4 Mult per Straight or Flush (Currently X1 Mult)',
  };
  for (const [n, w] of Object.entries(want)) {
    const j = add('j_poke_' + n);
    ok(plain(j) === w, n + ': "' + w + '"', plain(j));
    j.remove(); flush();
  }
  // the weather readers' notes name neither Kyogre nor Groudon any more
  const readers = ['castform', 'cherrim', 'larvesta', 'volcarona', 'lurantis', 'tympole', 'palpitoad', 'seismitoad', 'dewpider', 'araquanid', 'koraidon',
    'eiscue', 'great_tusk', 'alolan_sandshrew'];
  const bad = [];
  for (const n of readers) {
    if (!P_CENTERS['j_poke_' + n]) { bad.push(n + ' missing'); continue; }
    const j = add('j_poke_' + n);
    if (/Kyogre|Groudon|Rayquaza|Primal Clash/.test(plain(j))) bad.push(n + ': ' + plain(j));
    j.remove(); flush();
  }
  ok(bad.length === 0, 'no weather reader\'s tooltip mentions Kyogre / Groudon / Rayquaza / the Primal Clash', bad);
});

// ------------------------------------------------------------------- Kyogre
sec('kyogre', () => {
  start('TRIO1');
  const h0 = cr().hands_left;
  const k = add('j_poke_kyogre'); flush();
  ok(cr().hands_left === h0 + 1, '+1 hand', [h0, cr().hands_left]);
  let t = play2(['C_A']);
  ok(t.chips === 5 + 11 + 11 && near(t.mult, 1.25 * 1.25), 'a Club High Card: retriggers once (27 Chips) and gives X1.25 each time (X1.5625)', t);
  t = play2(['H_A']);
  ok(t.chips === 16 && near(t.mult, 1), 'a Heart: nothing', t);
  t = play2(['C_K', 'S_K']);
  ok(t.chips === 10 + 10 + 10 + 10 && near(t.mult, 2 * 1.25 * 1.25), 'a Pair of Kings, one Club: only the Club retriggers and gives X1.25 (twice)', t);
  // Energy: X1.25 -> 1.3125 / 1.375 / 1.4375 (the standard per-card rate); the hand and the retrigger fixed
  ok(energy_can_use({ etype: 'Water' }) === k, 'a Water Energy can now energize Kyogre (it has an energy field)');
  const xs = [];
  for (let n = 0; n < 3; n++) { increment_energy(k, 'Water'); xs.push(ex(k).Xmult_multi); }
  ok(xs.every((v, n) => near(v, 1.25 + 0.0625 * (n + 1))) && ex(k).hands === 1 && ex(k).retriggers === 1, 'Water Energy: X1.3125 / X1.375 / X1.4375; +1 hand, 1 retrigger fixed', [xs, ex(k)]);
  t = play2(['C_A']);
  ok(near(t.mult, 1.4375 * 1.4375), 'and a Club gives X1.4375, twice', t);
  // on r110 a Kyogre had no number (Energy-inert): one made there has no field and takes no Energy
  start('TRIO1b');
  const old = r110(() => add('j_poke_kyogre'));
  ok(ex(old).Xmult_multi === undefined && r110(() => energy_can_use({ etype: 'Water' })) === false, 'r110: a Kyogre made there has no X field and no Energy fits it', ex(old));
});

// ------------------------------------------------------------------- Groudon
sec('groudon', () => {
  start('TRIO2');
  const d0 = cr().discards_left;
  add('j_poke_groudon'); flush();
  ok(cr().discards_left === d0 + 1, '+1 discard');
  ok(near(play2(['H_K', 'D_K']).mult, 2 * 1.25 * 1.25), 'a Heart + Diamond Pair: 2 x 1.25 x 1.25');
  ok(near(play2(['C_K', 'S_K']).mult, 2), 'black cards: nothing');
});

// ------------------------------------------------------------------- Rayquaza / Mega Rayquaza (their banks)
sec('rayquaza', () => {
  start('TRIO3');
  const h0 = G.GAME.round_resets.hands, d0 = G.GAME.round_resets.discards;
  const r = add('j_poke_rayquaza'); flush();
  ok(G.GAME.round_resets.hands === h0 + 1 && G.GAME.round_resets.discards === d0 + 1, '+1 hand and +1 discard each round');
  let t = play2(['C_2', 'C_3', 'D_4', 'H_5', 'S_6']);
  ok(near(ex(r).ascent_Xmult, 1.2) && near(t.mult, 4 * 1.2), 'a Straight: +X0.2, scores X1.2', [ex(r).ascent_Xmult, t]);
  t = play2(['H_2', 'H_7', 'H_9', 'H_J', 'H_K']);
  ok(near(ex(r).ascent_Xmult, 1.4), 'a Flush: X1.4', ex(r).ascent_Xmult);
  start('TRIO3b');
  const m = add('j_poke_mega_rayquaza'); flush();
  ok(G.GAME.round_resets.hands === h0 + 2 && G.GAME.round_resets.discards === d0 + 2, 'Mega Rayquaza: +2 hands and +2 discards');
  t = play2(['C_2', 'C_3', 'D_4', 'H_5', 'S_6']);
  ok(near(ex(m).ascent_Xmult, 1.4) && near(t.mult, 4 * 1.4), 'Mega Rayquaza: a Straight gains X0.4 (X1.4)', [ex(m).ascent_Xmult, t]);
});

// ------------------------------------------------------------------- Primal Kyogre / Primal Groudon (and Energy carried through the Orb)
sec('primal kyogre', () => {
  start('TRIO4');
  const h0 = cr().hands_left;
  const k = add('j_poke_kyogre'); flush();
  increment_energy(k, 'Water');
  ok(near(ex(k).Xmult_multi, 1.3125), 'Kyogre, 1 Water Energy: X1.3125');
  useOrb('c_poke_blueorb');
  ok(key(k) === 'j_poke_primal_kyogre' && cr().hands_left === h0 + 2 && ex(k).energy_count === 1 && near(ex(k).Xmult_multi, 1.575), 'Primal Kyogre: +2 hands; keeps the Energy: X1.5 -> X1.575', [key(k), cr().hands_left, ex(k)]);
  increment_energy(k, 'Water'); increment_energy(k, 'Water');
  ok(near(ex(k).Xmult_multi, 1.725) && ex(k).hands === 2 && ex(k).retriggers === 2, 'three: X1.725; +2 hands, 2 retriggers fixed', ex(k));
  const t = play2(['C_A']);
  ok(t.chips === 5 + 11 * 3 && near(t.mult, Math.pow(1.725, 3)), 'a Club: retriggers twice (38 Chips), X1.725 each time', t);
  ok(near(play2(['H_A']).mult, 1), 'a Heart: nothing');
  ok(!swift_swim_raining(dry), 'Primal Kyogre makes no rain');
});
sec('primal groudon', () => {
  start('TRIO5');
  const d0 = cr().discards_left;
  const g = add('j_poke_groudon'); flush();
  increment_energy(g, 'Earth'); increment_energy(g, 'Earth');
  useOrb('c_poke_redorb');
  ok(key(g) === 'j_poke_primal_groudon' && cr().discards_left === d0 + 2 && near(ex(g).Xmult_multi2, 1.925) && ex(g).Xmult_multi === undefined,
    'Primal Groudon: +2 discards; keeps the 2 Energy: X1.75 -> X1.925 (its own field, Xmult_multi2)', [cr().discards_left, ex(g)]);
  increment_energy(g, 'Earth');
  ok(near(ex(g).Xmult_multi2, 2.0125) && ex(g).d_size === 2, 'a third: X2.0125; +2 discards fixed', ex(g));
  ok(near(play2(['H_K', 'D_K']).mult, 2 * 2.0125 * 2.0125), 'a Heart + Diamond Pair: 2 x 2.0125 x 2.0125');
  start('TRIO5b');
  add('j_poke_groudon'); useOrb('c_poke_redorb');
  ok(near(play2(['H_K', 'D_K']).mult, 2 * 1.75 * 1.75) && near(play2(['C_K', 'S_K']).mult, 2), 'no Energy: X1.75 a Heart / Diamond (2 x 1.75 x 1.75); black cards nothing');
  ok(!cherrim_sunny(dry), 'Primal Groudon makes no sun');
});

// ------------------------------------------------------------------- no clash, no weather, Castform free
sec('no clash', () => {
  const js = deal('TRIO6', CLUBS, ['j_poke_kyogre', 'j_poke_groudon']);
  const rr = G.GAME.round_resets;
  ok(!G.GAME.poke_primal && cr().hands_left === rr.hands && cr().discards_left === rr.discards, 'Kyogre + Groudon on a Clubs deal: no clash read; both the +1 hand and the +1 discard apply', [G.GAME.poke_primal, cr().hands_left, cr().discards_left, rr.hands, rr.discards]);
  ok(play2(['C_A']).chips === 27 && near(play2(['H_K']).mult, 1.25), 'both work: the Club retriggers, the Heart X1.25');
  deal('TRIO6b', REDS, ['j_poke_kyogre', 'j_poke_groudon'], () => { useOrb('c_poke_blueorb'); useOrb('c_poke_redorb'); });
  ok(!G.GAME.poke_primal && play2(['C_A']).chips === 38 && near(play2(['H_K']).mult, 1.75), 'both Primals on a red deal: both work (Clubs twice, Hearts X1.75)', G.GAME.poke_primal);
  ok(js.length === 2 && castform_lock() === null, 'castform_lock: none');
  deal('TRIO7', REDS, ['j_poke_kyogre', 'j_poke_tympole']);
  ok(!swift_swim_raining(J('j_poke_tympole')), 'Kyogre on a red deal: not raining for Tympole');
  deal('TRIO7b', CLUBS, ['j_poke_groudon', 'j_poke_larvesta']);
  ok(!cherrim_sunny(J('j_poke_larvesta')), 'Groudon on a Clubs deal: not sunny for Larvesta');
  deal('TRIO7c', CLUBS, ['j_poke_tympole']);
  ok(swift_swim_raining(J('j_poke_tympole')), 'control: a Clubs deal still rains (the forecast)');
});
sec('castform', () => {
  const cf = () => ex(J('j_poke_castform')).form;
  deal('TRIO8', SPADES, ['j_poke_castform', 'j_poke_kyogre']);
  ok(cf() === 'snowy', 'Kyogre held, Spades most: Castform Snowy (its own forecast; no Rainy lock)', cf());
  deal('TRIO8b', CLUBS, ['j_poke_groudon', 'j_poke_castform']);
  ok(cf() === 'rainy', 'Groudon held, Clubs most: Castform Rainy (no Sunny lock)', cf());
  deal('TRIO8c', REDS, ['j_poke_castform', 'j_poke_kyogre'], () => useOrb('c_poke_blueorb'));
  ok(J('j_poke_primal_kyogre') && cf() === 'sunny', 'Primal Kyogre held, red most: Castform Sunny', cf());
  deal('TRIO8d', CLUBS, ['j_poke_castform', 'j_poke_groudon'], () => useOrb('c_poke_redorb'));
  ok(J('j_poke_primal_groudon') && cf() === 'rainy', 'Primal Groudon held, Clubs most: Castform Rainy', cf());
  deal('TRIO8e', SPADES, ['j_poke_castform', 'j_poke_kyogre', 'j_poke_volcarona']);
  ok(cf() === 'sunny', 'Kyogre + Volcarona: Sunny (Volcarona; Kyogre locks nothing)', cf());
});

// ------------------------------------------------------------------- made on r110, played on r111: the new X at once (never retroactive on banks)
sec('carried over', () => {
  start('TRIO9');
  const pg = r110(() => { const g = add('j_poke_primal_groudon'); increment_energy(g, 'Earth'); increment_energy(g, 'Earth'); return g; });
  ok(near(ex(pg).Xmult_multi, 1.65) && ex(pg).Xmult_multi2 === undefined, 'r110: a Primal Groudon with 2 Energy is X1.65 (no new field)', ex(pg));
  ok(near(play2(['H_K']).mult, 1.925) && near(ex(pg).Xmult_multi2, 1.925) && ex(pg).Xmult_multi === undefined, 'played on r111: X1.925 (X1.75 + its 2 Energy)', ex(pg));
  pg.remove(); flush();
  const k = r110(() => add('j_poke_kyogre'));
  ok(near(play2(['C_A']).mult, 1.5625) && near(ex(k).Xmult_multi, 1.25), 'an r110 Kyogre on r111: its Clubs give X1.25 at once', ex(k));
  k.remove(); flush();
  const r = add('j_poke_rayquaza');
  ex(r).ascent_Xmult = 1.6;
  play2(['C_2', 'C_3', 'D_4', 'H_5', 'S_6']);
  ok(near(ex(r).ascent_Xmult, 1.8), 'Rayquaza\'s bank kept and grown as before (1.6 -> 1.8)', ex(r).ascent_Xmult);
});

// ------------------------------------------------------------------- an r110 run replays exactly; the same moves on r111 play the new rules
sec('r110 recipe', () => {
  const FIX = JSON.parse(readFileSync(new URL('../fixtures/pokermon_weathertrio_r110_recipe.json', import.meta.url), 'utf8'));
  ok(FIX.modVersions.pokermon === '3.9.1+r110' && FIX.customDeck.jokers.map((j) => j.key).join() === 'j_poke_kyogre,j_poke_groudon,j_poke_primal_groudon,j_poke_castform,j_poke_tympole',
    'the fixture: recorded on 3.9.1+r110 (main before r111), Kyogre / Groudon / Primal Groudon / Castform / Tympole', [FIX.modVersions, FIX.customDeck.jokers]);
  const run = (recipe) => {
    const st = Session.stepper(recipe);
    let tot = null, form = null, primal = null, hands = null, discards = null;
    while (!st.done) {
      const r = st.step();
      const h = r && (r.events || []).find((e) => e.type === 'hand_total');
      if (h) tot = h;
      if (st.index === 1) { form = ex(J('j_poke_castform')).form; primal = G.GAME.poke_primal ? G.GAME.poke_primal.winner : null; hands = cr().hands_left; discards = cr().discards_left; }
    }
    return { err: st.error, index: st.index, chips: tot && Number(tot.chips), mult: tot && Number(tot.mult), total: tot && Number(tot.total), form, primal, hands, discards, pgX: ex(J('j_poke_primal_groudon')).Xmult_multi };
  };
  // recorded on main (r110): Primal Groudon wins the clash every round, so Kyogre sits out (its +1 hand taken back: 4 hands), Castform is
  // locked Sunny on a 4 Clubs / 3 red deal; the Pair of Aces (Heart + Club): 92 Chips (Tympole's rain from the Clubs deal: +60), Mult
  // 2 x 1.25 x 1.5 + 4 (Sunny Castform on the Heart) = 7.75, 713.
  const got = run(JSON.parse(JSON.stringify(FIX)));
  ok(!got.err && got.index === FIX.actions.length, 'every r110 move re-plays', got.err);
  ok(got.chips === 92 && near(got.mult, 7.75) && got.total === 713 && got.form === 'sunny' && got.primal === 'groudon' && got.hands === 4 && got.discards === 6 && near(got.pgX, 1.5),
    'the r110 run re-plays EXACTLY as recorded (the clash, the Sunny lock, Kyogre sitting out, Primal Groudon X1.5)', got);
  const s = Session.fromRecipe(JSON.parse(JSON.stringify(FIX)), { repin: true }); flush();
  ok(!s.stoppedAt && s.recipe.modVersions.pokermon === PINS.modPin('pokermon') && PINS.RULES.pins === null, 'resumed with "Continue anyway": every move kept, re-pinned; live play back on the current rules', [s.stoppedAt, s.recipe.modVersions]);
  // the same moves recorded on r111: no clash, Castform reads Rainy (Clubs most), Kyogre works (5 hands), the Club Ace retriggers with X1.25
  const asNew = { ...JSON.parse(JSON.stringify(FIX)), modVersions: { ...FIX.modVersions, pokermon: PINS.modPin('pokermon') } };
  const neu = run(asNew);
  // Chips 10 + 11 (Heart Ace) + 3 x (11 + 30) (the Club Ace: Kyogre's retrigger + Rainy Castform's first-Club one, +30 each) + 60 = 204;
  // Mult 2 x 1.25 (Groudon) x 1.75 (Primal Groudon, r111) on the Heart, x 1.25 (Kyogre) for each of the Club's 3 scores = 8.544921875; 1743
  ok(!neu.err && neu.form === 'rainy' && neu.primal === null && neu.hands === 5 && neu.discards === 6 && neu.chips === 204 && near(neu.mult, 8.544921875) && neu.total === 1743,
    'the same moves on r111: no clash, Castform Rainy (its forecast), Kyogre\'s +1 hand kept (5); 204 x 8.5449 = 1743', neu);
});

done();
