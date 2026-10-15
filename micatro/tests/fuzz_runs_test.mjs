// Fuzz: random-but-sensible bots play whole runs on many seeds/decks/stakes.
// Catches engine crashes, state-machine stalls and broken invariants, and
// checks determinism (same seed + same actions => identical state).
//   node micatro/tests/fuzz_runs_test.mjs [runs=60]

import { G, P_CENTERS } from '../js/engine/core.js';
import { newRun, act, STATES, get_poker_hand_info } from '../js/engine/run.js';
import { toView } from '../js/engine/view.js';
import { Session } from '../js/engine/session.js';

const RUNS = Number(process.argv[2] || 60);
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };

const BACKS = Object.values(P_CENTERS).filter((v) => v.set === 'Back' && v.key !== 'b_challenge').map((v) => v.key);

// Small deterministic PRNG for the bot (independent of the engine's).
function botRng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function invariants(tag) {
  const before = fail;
  invariants0(tag);
  return fail === before;
}
function invariants0(tag) {
  const seen = new Set();
  for (const a of G.areas) for (const c of a.cards) {
    ok(!seen.has(c.sort_id), `${tag}: card ${c.sort_id} in two areas`);
    seen.add(c.sort_id);
    ok(c.area === a, `${tag}: card.area mismatch in ${a.name}`);
  }
  const pc = new Set(G.playing_cards.map((c) => c.sort_id));
  for (const a of [G.deck, G.hand, G.discard, G.play]) for (const c of a.cards) ok(pc.has(c.sort_id), `${tag}: ${a.name} card ${c.sort_id} not in playing_cards`);
  ok(Number.isFinite(G.GAME.dollars), `${tag}: dollars ${G.GAME.dollars}`);
  ok(G.jokers.cards.length <= G.jokers.config.card_limit + 1 || G.jokers.cards.some((c) => c.edition && c.edition.negative), `${tag}: too many jokers`);
}

function pickAction(r) {
  const S = G.STATE;
  if (S === STATES.BLIND_SELECT) {
    if (G.GAME.blind_on_deck !== 'Boss' && r() < 0.15) return { type: 'skip_blind' };
    return { type: 'select_blind' };
  }
  if (S === STATES.SELECTING_HAND) {
    // Use a consumable sometimes (with random targets)
    if (G.consumeables.cards.length && r() < 0.3) {
      const c = G.consumeables.cards[Math.floor(r() * G.consumeables.cards.length)];
      const n = (c.ability.consumeable && c.ability.consumeable.max_highlighted) || 0;
      const targets = G.hand.cards.slice().sort(() => r() - 0.5).slice(0, n).map((x) => x.sort_id);
      if (c.can_use_consumeable()) return { type: 'use', id: c.sort_id, targets };
      return { type: 'sell', id: c.sort_id };
    }
    // Greedy: best estimated-score subset of up to 5 cards (sometimes random for coverage).
    let ids;
    if (r() < 0.8) ids = bestHand();
    else ids = G.hand.cards.slice().sort(() => r() - 0.5).slice(0, 1 + Math.floor(r() * 5)).map((c) => c.sort_id);
    // Discard the cards outside a weak best hand (keeps the bot alive into later antes).
    const need = G.GAME.blind.chips - G.GAME.chips;
    const weak = lastBestScore * G.GAME.current_round.hands_left < need;
    if (G.GAME.current_round.discards_left > 0 && (weak || r() < 0.1)) {
      const keep = new Set(ids);
      const toss = G.hand.cards.filter((c) => !keep.has(c.sort_id)).slice(0, 5).map((c) => c.sort_id);
      if (toss.length) return [{ type: 'highlight', ids: toss }, { type: 'discard' }];
    }
    return [{ type: 'highlight', ids }, { type: 'play' }];
  }
  if (S === STATES.ROUND_EVAL) return { type: 'cash_out' };
  if (S === STATES.SHOP) {
    const forSale = [...G.shop_jokers.cards, ...G.shop_vouchers.cards, ...G.shop_booster.cards]
      .filter((c) => c.cost <= G.GAME.dollars - G.GAME.bankrupt_at);
    if (forSale.length && r() < 0.6) return { type: 'buy', id: forSale[Math.floor(r() * forSale.length)].sort_id };
    if (G.jokers.cards.length && r() < 0.05) return { type: 'sell', id: G.jokers.cards[0].sort_id };
    if (r() < 0.15) return { type: 'reroll_shop' };
    return { type: 'next_round' };
  }
  if ([STATES.TAROT_PACK, STATES.PLANET_PACK, STATES.SPECTRAL_PACK, STATES.STANDARD_PACK, STATES.BUFFOON_PACK].includes(S)) {
    if (r() < 0.1 || !G.pack_cards.cards.length) return { type: 'skip_booster' };
    const c = G.pack_cards.cards[Math.floor(r() * G.pack_cards.cards.length)];
    const n = (c.ability.consumeable && c.ability.consumeable.max_highlighted) || 0;
    const targets = G.hand.cards.slice().sort(() => r() - 0.5).slice(0, n).map((x) => x.sort_id);
    return { type: 'use', id: c.sort_id, targets };
  }
  return null;
}

let lastBestScore = 0;
function bestHand() {
  const cards = G.hand.cards;
  let best = null, bestScore = -1;
  const n = cards.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    let bits = 0; for (let m = mask; m; m &= m - 1) bits++;
    if (bits > 5) continue;
    const sel = cards.filter((_, i) => mask & (1 << i));
    const info = get_poker_hand_info(sel);
    if (info.text === 'NULL') continue;
    const h = G.GAME.hands[info.text];
    const chips = h.chips + info.scoring_hand.reduce((a, c) => a + c.get_chip_bonus(), 0);
    const score = chips * h.mult - bits * 0.01;
    if (score > bestScore) { bestScore = score; best = sel; }
  }
  lastBestScore = Math.max(bestScore, 0) * (1 + G.jokers.cards.length * 0.5);
  return (best || cards.slice(0, 1)).map((c) => c.sort_id);
}

let lastEvents = [];
let totalActions = 0, wins = 0, maxAnte = 0;
for (let i = 0; i < RUNS; i++) {
  const back = BACKS[i % BACKS.length];
  const stake = 1 + (i % 8);
  const seed = 'FUZZ' + i;
  const r = botRng(i * 7919 + 13);
  const log = [];
  const assisted = i % 2 === 1;
  const shopFunded = new Set();
  try {
    newRun({ seed, back, stake });
    let steps = 0, stuck = 0;
    while (!G.GAME.over && steps < 600) {
      // Assisted runs (odd index): guarantee the blind on the last hand and fund the shop,
      // so late antes, big joker rows, vouchers and endless get exercised.
      if (assisted && G.STATE === STATES.SELECTING_HAND && G.GAME.current_round.hands_left === 1 && G.GAME.chips < G.GAME.blind.chips) G.GAME.chips = G.GAME.blind.chips - 1;
      if (assisted && G.STATE === STATES.SHOP && !shopFunded.has(G.GAME.round)) { shopFunded.add(G.GAME.round); G.GAME.dollars += 20; }
      if (assisted && G.GAME.won && !G.GAME.endless && G.STATE === STATES.ROUND_EVAL) act({ type: 'endless' });
      if (assisted && G.GAME.round_resets.ante > 12) break;
      let a = pickAction(r);
      if (!a) { ok(false, `${seed}: no action in state ${G.STATE}`); break; }
      const acts = Array.isArray(a) ? a : [a];
      let anyOk = false;
      for (const x of acts) {
        const res = act(x);
        if (res.ok) { anyOk = true; log.push(x); }
        lastEvents = res.events.filter((e) => e.type !== 'sound' && e.type !== 'juice' && e.type !== 'hand_text').map((e) => [e.type, e.card, e.to, e.message || e.center || '']);
      }
      G.ui_events.length = 0;
      if (!anyOk) {
        if (++stuck > 40) {
          // escape hatches
          const esc = [{ type: 'skip_booster' }, { type: 'next_round' }, { type: 'cash_out' }, { type: 'select_blind' }, { type: 'highlight', ids: G.hand.cards.slice(0, 1).map((c) => c.sort_id) }, { type: 'play' }];
          let escaped = false;
          for (const e of esc) { const res = act(e); if (res.ok) { log.push(e); escaped = true; } }
          if (!escaped) { ok(false, `${seed}: stuck in state ${G.STATE}`); break; }
          stuck = 0;
        }
      } else stuck = 0;
      steps++;
      if (!invariants(seed + '@' + steps)) {
        console.log('  last actions:', JSON.stringify(log.slice(-4)), 'state', G.STATE, 'events:', JSON.stringify(lastEvents.slice(-12)));
        break;
      }
    }
    totalActions += steps;
    maxAnte = Math.max(maxAnte, G.GAME.round_resets.ante);
    if (G.GAME.won) wins++;
    invariants(seed + '@end');
    const v = toView();
    ok(v && v.areas && Array.isArray(v.areas.hand), `${seed}: toView ok`);
    ok(JSON.stringify(v).length < 200000, `${seed}: view small enough (${JSON.stringify(v).length})`);
    // Determinism: replay the recipe and compare
    const before = JSON.stringify({ d: G.GAME.dollars, a: G.GAME.round_resets.ante, r: G.GAME.round, c: G.GAME.chips, j: G.jokers.cards.map((c) => c.config.center.key), h: G.hand.cards.map((c) => c.config.card.key), s: G.STATE });
    Session.fromRecipe({ seed, back, stake, actions: log });
    const after = JSON.stringify({ d: G.GAME.dollars, a: G.GAME.round_resets.ante, r: G.GAME.round, c: G.GAME.chips, j: G.jokers.cards.map((c) => c.config.center.key), h: G.hand.cards.map((c) => c.config.card.key), s: G.STATE });
    if (!assisted) ok(before === after, `${seed}: replay deterministic\n  ${before}\n  ${after}`);
  } catch (e) {
    fail++;
    console.log('FAIL', seed, back, 'stake', stake, 'state', G.STATE, 'after', log.length, 'actions:', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
  }
}
console.log(`fuzz: ${RUNS} runs, ${totalActions} actions, max ante ${maxAnte}, wins ${wins}, ${fail ? fail + ' FAIL' : 'all ok'}`);
process.exit(fail ? 1 : 0);
