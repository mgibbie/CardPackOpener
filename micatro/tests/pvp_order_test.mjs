// Micatro Multiplayer stage 7a: THE ORDER (core.js theOrder) and the BALANCED ruleset (engine/pvp.js), plus the PvP
// timer's recorded hand loss.
//   The Order: a deck shuffle is keyed by the blind (a skip shifts nothing), shuffles / picks over cards depend on WHAT the
//   cards are (not their order or sort_ids), one continuous queue per card type across antes, one joker queue per rarity
//   whatever made the joker, shop and pack consumable streams apart, the Boss of ante N from 'boss'..N, Idol / Mail-In
//   picks weighted by the deck's copies (deck order irrelevant).
//   Balanced: Hanging Chad retriggers the 1st and 2nd scoring cards once each; Bloodstone's PvP-round rolls come from a
//   per-round queue (both players share it, whatever their RNG history); Glass X1.5; Justice banned; the vanilla Chad /
//   Bloodstone replaced in the pools; a solo run after a match plays vanilla Glass again.
//   Recipes: ruleset + order recorded (absent = a stage-6 Vanilla match); resume / replay exact; pvp_hand_lost.
//   node micatro/tests/pvp_order_test.mjs
import { G, P_CENTERS, P_JOKER_RARITY_POOLS, create_card, pseudoshuffle, pseudoseed, pseudorandom, get_new_boss, reset_idol_card, reset_mail_rank, add_joker, theOrder } from '../js/engine/core.js';
import { newRun, act, STATE_NAMES } from '../js/engine/run.js';
import { toView } from '../js/engine/view.js';
import { Session, viewChecksum, ReplayStepper } from '../js/engine/session.js';
import { pvpConfig, pvpRecipeConfig, pvpBannedKeys, RULESET_BANS } from '../js/engine/pvp.js';

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const st = () => STATE_NAMES[G.STATE];
const BASE = { lives: 4, pvpStart: 2, deathOnLoss: true, comeback: true };
const ORDER = { ...BASE, ruleset: 'balanced', order: true };
const NOORDER = { ...BASE, ruleset: 'balanced', order: false };
const ids = (cards) => cards.map((c) => c.config.card.key + ':' + c.config.center.key).join(',');

function win(A = act) {
  G.GAME.chips = Math.max(0, G.GAME.blind.chips - 1);
  A({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
  A({ type: 'play' });
}
function beat(A = act) { A({ type: 'select_blind' }); win(A); A({ type: 'cash_out' }); A({ type: 'next_round' }); }

// ---- config + recipe
{
  ok(pvpConfig({}).ruleset === 'vanilla' && pvpConfig({}).order === false, 'a config without ruleset / order (every stage-6 recipe) is a Vanilla match without The Order');
  ok(pvpConfig({ ruleset: 'balanced', order: true }).ruleset === 'balanced' && pvpConfig({ ruleset: 'nope' }).ruleset === 'vanilla', 'the ruleset is validated');
  newRun({ seed: 'ORDREC01', pvp: BASE });
  ok(!('ruleset' in pvpRecipeConfig(G.GAME.pvp)) && !('order' in pvpRecipeConfig(G.GAME.pvp)), 'a Vanilla recipe reads as before stage 7');
  newRun({ seed: 'ORDREC01', pvp: ORDER });
  const rc = pvpRecipeConfig(G.GAME.pvp);
  ok(rc.ruleset === 'balanced' && rc.order === true, 'a Balanced / Order recipe records both');
  ok(theOrder(), 'The Order is on in an Order match');
  newRun({ seed: 'ORDREC01' });
  ok(!theOrder(), 'never in a solo run');
}

// ---- The Order: a skip shifts no later shuffle
{
  const deckAtBig = (skip, cfg) => {
    newRun({ seed: 'ORDSKIP7', back: 'b_red', stake: 1, pvp: cfg });
    if (skip) { act({ type: 'skip_blind' }); if (/PACK/.test(st())) act({ type: 'skip_booster' }); } else beat();
    act({ type: 'select_blind' });
    ok(G.GAME.blind_on_deck === 'Big' && st() === 'SELECTING_HAND', 'at the Big blind');
    return ids([...G.hand.cards, ...G.deck.cards]);
  };
  const a = deckAtBig(true, ORDER), b = deckAtBig(false, ORDER);
  ok(a === b, 'The Order: the Big blind deals the same cards whether the Small blind was skipped or played');
  const c = deckAtBig(true, NOORDER), d = deckAtBig(false, NOORDER);
  ok(c !== d, '(without The Order a skip shifts the next shuffle — the property is The Order\'s)');
}

// ---- The Order: a shuffle depends on the cards, not their order or sort_ids
{
  newRun({ seed: 'ORDSHUF1', pvp: ORDER });
  const cards = G.playing_cards.slice(0, 20);
  const l1 = cards.slice(), l2 = cards.slice().reverse();
  pseudoshuffle(l1, 0.123456); pseudoshuffle(l2, 0.123456);
  ok(ids(l1) === ids(l2), 'The Order: the same cards in any order shuffle the same');
  // two players' identical decks with different sort_ids (a card bought / destroyed earlier) shuffle the same
  const ids0 = new Map(cards.map((c) => [c, c.sort_id]));
  const l3 = cards.slice(); pseudoshuffle(l3, 0.5);
  for (const c of cards) c.sort_id += 1000 * ((c.base.id * 7) % 5);
  const l4 = cards.slice(); pseudoshuffle(l4, 0.5);
  for (const c of cards) c.sort_id = ids0.get(c);
  ok(ids(l3) === ids(l4), 'The Order: sort_ids don\'t change a shuffle');
  newRun({ seed: 'ORDSHUF1', pvp: NOORDER });
  const m = G.playing_cards.slice(0, 20), m1 = m.slice(), m2 = m.slice().reverse();
  pseudoshuffle(m1, 0.123456);
  for (const c of m2) c.sort_id = 10000 - c.sort_id;
  pseudoshuffle(m2, 0.123456);
  ok(ids(m1) !== ids(m2), '(without The Order sort_ids decide a shuffle)');
}

// ---- The Order: one continuous queue per type (antes don't restart it); shop and pack streams apart
{
  const tarots = (cfg, plan) => {
    newRun({ seed: 'ORDQUEU1', pvp: cfg });
    const out = [];
    for (const [ante, area, n] of plan) { G.GAME.round_resets.ante = ante; for (let i = 0; i < n; i++) { const c = create_card('Tarot', area === 'pack' ? G.pack_cards : G.shop_jokers, null, null, null, null, null, area === 'pack' ? 'ar1' : 'sho'); if (area === 'shop') out.push(c.config.center.key); c.remove(); } }
    return out.join(',');
  };
  ok(tarots(ORDER, [[1, 'shop', 3]]) === tarots(ORDER, [[1, 'shop', 2], [3, 'pack', 4], [4, 'shop', 1]]), 'The Order: the 3rd shop Tarot is the same whatever the ante and however many pack Tarots came between');
  ok(tarots(NOORDER, [[1, 'shop', 3]]) !== tarots(NOORDER, [[1, 'shop', 2], [3, 'pack', 4], [4, 'shop', 1]]), '(without The Order each ante restarts the queue)');
  // one joker queue per rarity, whatever made the joker (a shop, a Buffoon pack, Judgement...)
  const jokers = (cfg, srcs) => {
    newRun({ seed: 'ORDJOKE1', pvp: cfg });
    const out = [];
    for (const s of srcs) { const c = create_card('Joker', s === 'buf' ? G.pack_cards : s === 'sho' ? G.shop_jokers : G.jokers, null, 0, null, null, null, s); out.push(c.config.center.key + (c.edition ? '+' + c.edition.type : '')); c.remove(); }
    return out.join(',');
  };
  ok(jokers(ORDER, ['sho', 'sho', 'sho', 'sho']) === jokers(ORDER, ['buf', 'sho', 'jud', 'sho']), 'The Order: the nth Common joker is the same from a shop, a pack or Judgement (with its edition)');
  ok(jokers(NOORDER, ['sho', 'sho', 'sho', 'sho']) !== jokers(NOORDER, ['buf', 'sho', 'jud', 'sho']), '(without The Order each source has its own queue)');
}

// ---- The Order: the Boss of ante N, whatever was rolled before
{
  const boss = (cfg, extra) => {
    newRun({ seed: 'ORDBOSS1', pvp: { ...cfg, bossFx: true } });
    for (let i = 0; i < extra; i++) get_new_boss();
    G.GAME.round_resets.ante = 3;
    return get_new_boss();
  };
  ok(boss(ORDER, 0) === boss(ORDER, 2), 'The Order: ante 3\'s Boss is rolled from its own stream (extra rolls before don\'t move it)');
  ok(boss(NOORDER, 0) !== boss(NOORDER, 2), '(without The Order the Boss stream is shared)');
}

// ---- The Order: Idol / Mail-In weighted by the deck's copies, not its order
{
  const idol = (cfg, rev) => {
    newRun({ seed: 'ORDIDOL1', pvp: cfg });
    if (rev) { G.playing_cards.reverse(); G.playing_cards.forEach((c, i) => { c.sort_id = 5000 + i; }); }
    reset_idol_card(); reset_mail_rank();
    const ic = G.GAME.current_round.idol_card, mc = G.GAME.current_round.mail_card;
    return ic.rank + ic.suit + '/' + mc.rank;
  };
  ok(idol(ORDER, false) === idol(ORDER, true), 'The Order: The Idol / Mail-In Rebate pick the same card however the deck is ordered');
  let differs = false;
  for (const s of ['ORDIDOL1', 'ORDIDOL2', 'ORDIDOL3', 'ORDIDOL4']) {
    const f = (rev) => { newRun({ seed: s, pvp: NOORDER }); if (rev) { G.playing_cards.reverse(); G.playing_cards.forEach((c, i) => { c.sort_id = 5000 + i; }); } reset_idol_card(); return G.GAME.current_round.idol_card.rank + G.GAME.current_round.idol_card.suit; };
    if (f(false) !== f(true)) differs = true;
  }
  ok(differs, '(without The Order the pick follows the deck order)');
}

// ---- Balanced: the content + rules
{
  newRun({ seed: 'BALANC01', pvp: ORDER });
  const pool1 = P_JOKER_RARITY_POOLS[1].map((c) => c.key), pool2 = P_JOKER_RARITY_POOLS[2].map((c) => c.key);
  ok(pool1.includes('j_mp_hanging_chad') && pool2.includes('j_mp_bloodstone'), 'Balanced: the reworked Hanging Chad / Bloodstone are in the pools');
  ok(G.GAME.banned_keys.j_hanging_chad && G.GAME.banned_keys.j_bloodstone && G.GAME.banned_keys.c_justice, 'Balanced: vanilla Chad / Bloodstone (silent) and Justice are banned');
  ok(pvpBannedKeys('attrition', 'balanced').includes('c_justice') && !pvpBannedKeys('attrition', 'balanced').includes('j_hanging_chad'), 'the lobby lists Justice, not the silently replaced jokers');
  ok(RULESET_BANS.balanced.silent.length === 2, 'two silent bans');
  // Glass X1.5, 1 in 4
  const g = G.playing_cards[0];
  g.set_ability(P_CENTERS.m_glass);
  ok(g.ability.x_mult === 1.5 && g.ability.extra === 4, 'Balanced: a Glass Card is X1.5, 1 in 4 to break');
  // Hanging Chad: 1st and 2nd scoring cards, once each
  const chad = add_joker('j_mp_hanging_chad');
  const sh = G.playing_cards.slice(0, 3);
  const rep = (i) => { const r = chad.calculate_joker({ repetition: true, cardarea: G.play, scoring_hand: sh, other_card: sh[i] }); return r ? r.repetitions : 0; };
  ok(rep(0) === 1 && rep(1) === 1 && rep(2) === 0, 'Balanced Hanging Chad: the 1st and 2nd scoring cards retrigger once each, not the 3rd');
  const vchad = add_joker('j_hanging_chad');
  const vr = (i) => { const r = vchad.calculate_joker({ repetition: true, cardarea: G.play, scoring_hand: sh, other_card: sh[i] }); return r ? r.repetitions : 0; };
  ok(vr(0) === 2 && vr(1) === 0, '(vanilla Hanging Chad: the first card twice — for comparison)');
  // a Vanilla match: none of it
  newRun({ seed: 'BALANC01', pvp: BASE });
  ok(!P_JOKER_RARITY_POOLS[1].some((c) => c.key === 'j_mp_hanging_chad') && !G.GAME.banned_keys.c_justice, 'a Vanilla match: no reworked jokers in the pools, Justice allowed');
  const g2 = G.playing_cards[0]; g2.set_ability(P_CENTERS.m_glass);
  ok(g2.ability.x_mult === 2, 'a Vanilla match (and so a solo run after a Balanced one): Glass is X2 again');
  newRun({ seed: 'BALANC01' });
  const g3 = G.playing_cards[0]; g3.set_ability(P_CENTERS.m_glass);
  ok(g3.ability.x_mult === 2 && P_CENTERS.m_glass.config.Xmult === 2, 'a solo run: vanilla Glass');
}

// ---- Balanced Bloodstone: a PvP round's rolls are the round's, whatever the RNG history
{
  const rolls = (key, history) => {
    newRun({ seed: 'BLOODST1', pvp: ORDER });
    for (let i = 0; i < history; i++) pseudorandom('bloodstone');
    const bs = add_joker(key);
    G.GAME.pvp_blind = true;
    const hearts = G.playing_cards.filter((c) => c.base.suit === 'Hearts').slice(0, 5);
    const out = [];
    for (let hand = 0; hand < 2; hand++) {
      bs.calculate_joker({ before: true, cardarea: G.jokers, full_hand: hearts, scoring_hand: hearts });
      for (const h of hearts) { const r = bs.calculate_joker({ individual: true, cardarea: G.play, other_card: h, scoring_hand: hearts, full_hand: hearts }); out.push(r && r.x_mult ? 1 : 0); }
    }
    return out.join('');
  };
  const a = rolls('j_mp_bloodstone', 0), b = rolls('j_mp_bloodstone', 7);
  ok(a === b, 'Balanced Bloodstone: the same rolls in a PvP round whatever came before (' + a + ' / ' + b + ')');
  ok(a.slice(0, 5) === a.slice(5), 'Balanced Bloodstone: every hand of the round reuses the round\'s queue');
  const va = rolls('j_bloodstone', 0), vb = rolls('j_bloodstone', 7);
  ok(va !== vb, '(vanilla Bloodstone: the rolls follow the RNG history — ' + va + ' / ' + vb + ')');
}

// ---- the PvP timer's hand: recorded, in order, only takes a hand in a Nemesis round
{
  const s = new Session();
  s.start({ seed: 'HANDLOST', back: 'b_red', stake: 1, pvp: { ...ORDER, deathOnLoss: false }, engineRev: 1 });
  const A = (a) => s.act(a);
  const weak = () => { A({ type: 'highlight', ids: [G.hand.cards[G.hand.cards.length - 1].sort_id] }); A({ type: 'play' }); };
  ok(A({ type: 'pvp_hand_lost', n: 1 }).ok && G.GAME.pvp.hlost === 1, 'a hand lost outside a round is counted (no hand taken)');
  for (let i = 0; i < 5; i++) { A({ type: 'select_blind' }); for (let k = 0; k < 9 && st() === 'SELECTING_HAND'; k++) weak(); A({ type: 'cash_out' }); A({ type: 'next_round' }); }
  ok(A({ type: 'pvp_start_blind' }).ok && st() === 'SELECTING_HAND', 'in the Nemesis');
  const h0 = G.GAME.current_round.hands_left;
  ok(!A({ type: 'pvp_hand_lost', n: 1 }).ok, 'not the next hand lost: refused');
  ok(A({ type: 'pvp_hand_lost', n: 2 }).ok && G.GAME.current_round.hands_left === h0 - 1, 'the PvP timer costs one hand');
  while (G.GAME.current_round.hands_left > 1) weak();
  ok(A({ type: 'pvp_hand_lost', n: 3 }).ok && st() === 'PVP_WAIT', 'the last hand lost to the timer: out of hands, waiting');
  ok(toView().pvp.hlost === 3 && toView().pvp.ruleset === 'balanced' && toView().pvp.order === true, 'the view carries the ruleset, The Order and the hands lost');
  A({ type: 'pvp_outcome', result: 'lose', lives: 3 });
  const cs = viewChecksum(toView());
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe)));
  ok(!r.stoppedAt && viewChecksum(toView()) === cs, 'resume rebuilds a Balanced / Order match exactly');
  const sc = new ReplayStepper(JSON.parse(JSON.stringify(s.recipe))).scan();
  ok(!sc.end.error && sc.end.checksum === cs, 'the replay re-simulates it exactly');
  ok(s.recipe.pvp.ruleset === 'balanced' && s.recipe.pvp.order === true, 'the recipe records the ruleset and The Order');
}

console.log(`pvp order/balanced: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
