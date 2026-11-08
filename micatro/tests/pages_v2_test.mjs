// Micatro's Pages v2 (engine/pages.js, engine rules rev 3): every new target, effect, required-score modifier, prize and
// Round rule, each DRIVEN THROUGH PLAY — real hands, rounds, cash-outs and shops — plus the offer's odds (30% Round rules,
// ~5% Legendary), save / resume / replay, and the rev gate (a rev-2 run keeps the v1 tables).
//   node micatro/tests/pages_v2_test.mjs            (MICATRO_PAGES_ONLY=<label part> runs only the checks whose label has it)
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
const { newRun, act, G, STATES, STATE_NAMES } = await import('../js/engine/run.js');
const { P_CENTERS, P_CARDS, add_joker, E_MANAGER } = await import('../js/engine/core.js');
const P = await import('../js/engine/pages.js');
const { Session } = await import('../js/engine/session.js');
const { toView } = await import('../js/engine/view.js');
const PINS = await import('../js/mods/pins.js');

let fails = 0, passes = 0;
function ok(cond, msg, extra) {
  if (cond) { passes++; } else { fails++; console.log('FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); }
}
const REV = P.PAGES_V2_REV;
const state = () => STATE_NAMES[G.STATE];
// (every Blind gets its Pages screen in the checks below; the 25% chance + the pity timer have their own section, at the real odds)
const CHANCE = P.PAGE_ODDS.chance;
ok(CHANCE === 0.25, 'Pages on 25% of Blinds (owner)');
P.PAGE_ODDS.chance = 1;
ok(PINS.ENGINE_CONTENT_REV === REV && PINS.GATED_ENGINE_REVS.includes(2) && PINS.GATED_ENGINE_REVS.includes(3), 'engine rev 3, gated');

// ------------------------------------------------------------------ helpers
/** A fresh rev-3 run on the Small Blind with this (v2) Page; the hand's first cards set to `cards` (P_CARDS keys). */
function round(page, cards = [], seed = 'V2RND', setup) {
  newRun({ seed, engineRev: REV });
  if (setup) setup();
  act({ type: 'select_blind' });
  if (state() !== 'PAGES') throw new Error('no Pages screen: ' + state());
  G.GAME.pages.choices[0] = { v: 2, difficulty: 0, tier: 2, prize: { kind: 'money', amount: 2 }, pct: 0, ...page };
  const r = act({ type: 'pick_page', index: 0 });
  if (!r.ok) throw new Error('pick: ' + r.error);
  cards.forEach((k, i) => G.hand.cards[i].set_base(P_CARDS[k]));
  G.GAME.blind.chips = 1e9;
  G.consumeables.config.card_limit = 5;
}
function play(n, ids) {
  const sel = ids || G.hand.cards.slice(0, n).map((c) => c.sort_id);
  act({ type: 'highlight', ids: sel });
  const r = act({ type: 'play' });
  if (!r.ok) throw new Error('play: ' + r.error);
  return r;
}
const score = () => Number(G.GAME.chips);
/** In the PAGES state: take this Page (v2). */
function takePage(page) {
  if (state() !== 'PAGES') throw new Error('not on Pages: ' + state());
  G.GAME.pages.choices[0] = { v: 2, difficulty: 0, tier: 2, prize: { kind: 'money', amount: 1 }, pct: 0, target: 'Hearts', effect: 'chips', ...page };
  const r = act({ type: 'pick_page', index: 0 });
  if (!r.ok) throw new Error('pick: ' + r.error);
}
/** Win the round now (one hand), stopping on the cash-out. */
function winNow() {
  G.GAME.blind.chips = 1;
  play(1);
  if (state() !== 'ROUND_EVAL') throw new Error('not in cash-out: ' + state());
  return G.GAME.round_eval.rows.find((r) => r.name === 'page');
}
/** Win a round with this prize (a quiet Page otherwise), stopping on the cash-out. -> the Page's cash-out row */
function winWith(prize, seed = 'V2PRZ', before) {
  round({ target: 'Hearts', effect: 'chips', prize }, ['S_K'], seed, before);
  return winNow();
}
/** From the cash-out: cash out, leave the shop, select the next blind and take this Page. */
function nextRound(page = {}) {
  if (state() === 'ROUND_EVAL') act({ type: 'cash_out' });
  while (/_PACK/.test(state())) act({ type: 'skip_booster' });
  if (state() === 'PAGE_REMOVE') act({ type: 'page_remove', id: G.playing_cards[0].sort_id });
  G.GAME.dollars = Math.max(G.GAME.dollars, 0);
  if (state() === 'SHOP') act({ type: 'next_round' });
  act({ type: 'select_blind' });
  takePage(page);
  G.GAME.blind.chips = 1e9;
}

// ------------------------------------------------------------------ the offer (odds, combos, tiers)
function offer(seed, which = 'Small', mods) {
  newRun({ seed, engineRev: REV, ...(mods ? { mods } : {}) });
  const settle = () => { while (/_PACK/.test(state())) act({ type: 'skip_booster' }); };
  if (which !== 'Small') { act({ type: 'skip_blind' }); settle(); if (which === 'Boss') { act({ type: 'skip_blind' }); settle(); } }
  act({ type: 'select_blind' });
  return G.GAME.pages.choices;
}
ok(JSON.stringify(offer('V2A')) === JSON.stringify(offer('V2A')), 'offer: same seed, same Pages');
const seen = { t: new Set(), e: new Set(), pct: new Set(), tier: new Set(), rule: new Set(), prize: new Set(), enh: new Set() };
let pages = 0, withRule = 0, legendary = 0, low = 0, withPrize = 0;
const N = 1500;
for (let i = 0; i < N; i++) {
  const ch = offer('V2GEN' + i, ['Small', 'Big', 'Boss'][i % 3]);
  ok(ch.length === 3 && new Set(ch.map((p) => p.target + p.effect)).size === 3, 'offer: three distinct Pages');
  for (const p of ch) {
    pages++;
    if (p.rule) withRule++;
    if (p.prize.kind !== 'none') withPrize++;
    if (P.LEGENDARY_PCTS.includes(p.roll)) legendary++;
    if (P.LOW_PCTS.includes(p.roll)) low++;
    seen.t.add(p.target); seen.e.add(p.effect); seen.pct.add(p.roll); seen.tier.add(p.tier); if (p.rule) seen.rule.add(p.rule); if (p.enh) seen.enh.add(p.enh);
    seen.prize.add(p.prize.kind + (p.prize.perk || p.prize.set || p.prize.rarity || ''));
    ok(p.v === 2, 'offer: a v2 Page', p);
    ok(P.comboOk(p.target, p.effect, p.rule), 'offer: an allowed target / effect / rule', p);
    ok(P.PAGE_PCTS_V2.includes(p.roll), 'offer: a v2 modifier (the roll)', p);
    ok(p.value === P.prizeValue(p.prize) && (p.prize.kind === 'none' ? p.value === 0 : p.value > 0) && p.pct === p.roll + p.value, 'offer: required score = the roll + the prize\'s value', p);
    const down = P.effectWeight(p.effect) > 0, harderRule = p.rule && P.ROUND_RULES[p.rule].d > 0;
    if (P.LOW_PCTS.includes(p.roll)) ok(down || harderRule, 'offer: -15% / -20% only with a downside or a harder Round rule', p);
    ok(p.difficulty === p.pct + P.effectWeight(p.effect) + (p.rule ? P.ROUND_RULES[p.rule].d : 0), 'offer: difficulty = total required % + effect + rule', p);
    ok(p.tier === P.tierOfV2(p.difficulty).tier, 'offer: tier label from the total', p);
    ok(P.describePage(p).lines[1].includes((p.pct > 0 ? '+' : p.pct < 0 ? '-' : '±') + Math.abs(p.pct) + '%'), 'offer: the card shows the total required score', P.describePage(p).lines[1]);
    if (p.target === 'single') ok(p.rank >= 2 && p.rank <= 14, 'offer: one rank', p);
    if (p.target === 'nature') ok(p.ranks.length === 3 && new Set(p.ranks).size === 3 && p.ranks.every((x) => x >= 2 && x <= 14) && /^\{C:attention\}Nature \(/.test(P.describePage(p).lines[0]), 'offer: a Nature of 3 different ranks', p);
    if (P.LEGENDARY_PCTS.includes(p.roll)) {
      ok(!p.rule || P.ROUND_RULES[p.rule].d > 0, 'offer: a +40% / +50% roll never has an easier rule', p);
      ok(p.prize.kind === 'none' || ((['joker', 'joker_slot'].includes(p.prize.kind) || p.prize.key === 'c_soul') && (p.prize.kind !== 'joker' || p.prize.rarity === 4) && p.tier === 5), 'offer: +40% / +50% is Legendary: a Legendary-only prize (or none)', p);
    } else ok(!(p.prize.kind === 'joker' && p.prize.rarity === 4) && p.prize.kind !== 'joker_slot' && p.prize.key !== 'c_soul', 'offer: Legendary prizes only on a +40% / +50% roll', p);
    if (p.prize.kind === 'named_joker') ok(P_CENTERS[p.prize.key] && P_CENTERS[p.prize.key].rarity === p.prize.rarity && p.prize.rarity <= 2 && /\(Joker\)/.test(P.describePage(p).lines[2]), 'offer: a named Common / Uncommon Joker', p.prize);
    if (p.target === 'rank') ok(p.rank >= 2 && p.rank <= 14 && G.playing_cards.some((c) => c.get_id() === p.rank), 'offer: the round\'s rank is a rank of the deck', p);
    if (p.effect === 'become') ok(P.BECOME_ENH.includes(p.enh), 'offer: become names Glass / Steel / Gold', p);
    ok(!(p.prize.kind === 'card' && ['Item', 'Energy'].includes(p.prize.set)) && p.prize.kind !== 'poke', 'offer: no Pokermon prize without Pokermon', p.prize);
    const d = P.describePage(p);
    ok(d.lines.length === (p.rule ? 4 : 3) && /Required score/.test(d.lines[1]) && (p.prize.kind === 'none' ? d.lines[2] === '{C:inactive}No prize' : /^Prize: /.test(d.lines[2])) && (!p.rule || /^Round rule: /.test(d.lines[3])), 'offer: text lines (+ the Round rule)', d);
    ok(!/[pc]_[a-z]|#\d#|undefined/.test(d.lines.join(' ')), 'offer: names, not keys', d.lines);
  }
}
const ruleShare = withRule / pages, legShare = legendary / pages;
console.log(`  offer: ${pages} Pages, prize ${(withPrize / pages * 100).toFixed(1)}%, Round rule ${(ruleShare * 100).toFixed(1)}%, Legendary ${(legShare * 100).toFixed(1)}%, -15/-20% ${(low / pages * 100).toFixed(1)}%`);
ok(Math.abs(ruleShare - 0.30) < 0.025, 'offer: Round rules on ~30% of Pages (owner)', ruleShare);
ok(legShare > 0.03 && legShare < 0.07, 'offer: Legendary ~5% of Pages', legShare);
ok(Math.abs(withPrize / pages - 0.5) < 0.03, 'offer: a prize on ~50% of Pages (owner)', withPrize / pages);
for (const k of P.TARGET_KEYS_V2) ok(seen.t.has(k), 'offer: target offered: ' + k);
for (const k of P.EFFECT_KEYS_V2) ok(seen.e.has(k), 'offer: effect offered: ' + k);
for (const k of P.PAGE_PCTS_V2) ok(seen.pct.has(k), 'offer: modifier offered: ' + k);
for (const k of P.RULE_KEYS) ok(seen.rule.has(k), 'offer: Round rule offered: ' + k);
for (const k of P.BECOME_ENH) ok(seen.enh.has(k), 'offer: become ' + k);
ok(seen.tier.size === 5, 'offer: all 5 tiers', [...seen.tier]);
for (const k of ['cardPlanet', 'named_joker1', 'named_joker2', 'tag', 'level_most', 'joker1', 'enhanced_card', 'hand_size', 'joker2', 'remove_card', 'interest', 'joker3', 'joker_edition', 'joker4', 'joker_slot']) ok(seen.prize.has(k), 'offer: prize offered: ' + k, [...seen.prize]);
ok(P.tierOfV2(49).tier === 1 && P.tierOfV2(50).tier === 2 && P.tierOfV2(99).tier === 2 && P.tierOfV2(100).tier === 3 && P.tierOfV2(174).tier === 3 && P.tierOfV2(175).tier === 4 && P.tierOfV2(274).tier === 4 && P.tierOfV2(275).tier === 5, 'the v2 tier labels (from the total)');
ok(P.poolOfV2(-5, -5).tier === 1 && P.poolOfV2(15, 15).tier === 2 && P.poolOfV2(25, 25).tier === 3 && P.poolOfV2(26, 20).tier === 4 && P.poolOfV2(25, 40).tier === 5, 'the v2 prize pools (from the roll)');
// prize values (one table, owner-tunable): Temperance on a +10% roll lands around +150-200% (Jack's example)
ok(P.prizeValue({ kind: 'money', amount: 3 }) === 30 && P.prizeValue({ kind: 'card', set: 'Tarot', key: 'c_temperance' }) === 150 && P.prizeValue({ kind: 'card', set: 'Tarot', key: 'c_star' }) === 40 &&
  P.prizeValue({ kind: 'pack', key: 'p_arcana_normal_1' }) === 50 && P.prizeValue({ kind: 'pack', key: 'p_arcana_jumbo_1' }) === 80 && P.prizeValue({ kind: 'pack', key: 'p_celestial_mega_1' }) === 110 &&
  P.prizeValue({ kind: 'joker', rarity: 1 }) === 60 && P.prizeValue({ kind: 'joker', rarity: 2 }) === 90 && P.prizeValue({ kind: 'joker', rarity: 3 }) === 150 && P.prizeValue({ kind: 'joker', rarity: 4 }) === 300 && P.prizeValue({ kind: 'joker_slot' }) === 300, 'prize values');
{
  // a real round: Temperance on a +10% roll -> +160%: the Small Blind's 300 becomes 780
  newRun({ seed: 'V2TEMP', engineRev: REV }); act({ type: 'select_blind' });
  const pg = { v: 2, target: 'Hearts', effect: 'chips', roll: 10, prize: { kind: 'card', set: 'Tarot', key: 'c_temperance' } };
  pg.value = P.prizeValue(pg.prize); pg.pct = pg.roll + pg.value; pg.difficulty = pg.pct; pg.tier = P.tierOfV2(pg.difficulty).tier;
  G.GAME.pages.choices[0] = pg; act({ type: 'pick_page', index: 0 });
  ok(pg.pct === 160 && Number(G.GAME.blind.chips) === 780 && /\+160%/.test(P.describePage(pg).lines[1]) && P.describePage(pg).name === 'Hard Page', 'Temperance on +10%: required score +160% (780 of 300), a Hard Page', [Number(G.GAME.blind.chips), P.describePage(pg)]);
}
// the combos a Page never pairs
ok(!P.comboOk('first', 'lucky_discard') && !P.comboOk('last', 'debuffed') && !P.comboOk('enhanced', 'become') && !P.comboOk('sealed', 'gain_seal') && !P.comboOk('unenhanced', 'debuffed') && !P.comboOk('numbered', 'debuffed') && !P.comboOk('Hearts', 'bonus_discard', 'no_discards') && P.comboOk('red', 'debuffed'), 'combos that could never act are never offered');
// rev 2 (Pages v1) never offers a v2 Page
newRun({ seed: 'V2GEN1', engineRev: 2 }); act({ type: 'select_blind' });
ok(G.GAME.pages.choices.every((p) => !p.v && !p.rule && P.TARGET_KEYS.includes(p.target) && P.EFFECT_KEYS.includes(p.effect) && P.PAGE_PCTS.includes(p.pct)) && !G.GAME.pages_v2, 'rev 2: the v1 tables');
// Pokermon on: the Poke Ball / Energy prize
{
  const { loadMods } = await import('../js/mods/index.js');
  await loadMods(['pokermon']);
  let poke = 0;
  for (let i = 0; i < 300 && poke < 3; i++) for (const p of offer('V2POKE' + i, 'Small', ['pokermon'])) if (p.prize.kind === 'card' && (p.prize.key === 'c_poke_pokeball' || p.prize.set === 'Energy')) poke++;
  ok(poke > 0, 'Pokermon on: a Poke Ball / Energy prize is offered on Hard Pages');
}

// ------------------------------------------------------------------ targets (in play: +15 Chips on a High Card King = 30, else 15)
const tgt = (target, card, extra = {}, setup) => { round({ target, effect: 'chips', ...extra }, [card]); if (setup) setup(G.hand.cards[0]); play(1); return score(); };
const bonus = (sc, base) => sc - base;
ok(tgt('red', 'H_K') === 30 && tgt('red', 'D_K') === 30 && tgt('red', 'S_K') === 15, 'target red: Hearts / Diamonds score, Spades don\'t');
ok(tgt('black', 'S_K') === 30 && tgt('black', 'C_K') === 30 && tgt('black', 'H_K') === 15, 'target black: Spades / Clubs');
ok(tgt('black', 'H_K', {}, (c) => c.set_ability(P_CENTERS.m_wild, null, true)) === 30 && tgt('red', 'S_K', {}, (c) => c.set_ability(P_CENTERS.m_wild, null, true)) === 30, 'target red / black: a Wild card counts for both');
ok(tgt('low', 'S_2') === 5 + 2 + 15 && tgt('low', 'S_5') === 5 + 5 + 15 && tgt('low', 'S_6') === 5 + 6, 'target low: 2-5');
ok(tgt('high', 'S_T') === 30 && tgt('high', 'S_A') === 5 + 11 + 15 && tgt('high', 'S_9') === 5 + 9, 'target high: 10, J, Q, K, A');
ok(tgt('numbered', 'S_2') === 22 && tgt('numbered', 'S_T') === 30 && tgt('numbered', 'S_J') === 15 && tgt('numbered', 'S_A') === 16, 'target numbered: 2-10');
ok(tgt('enhanced', 'S_K', {}, (c) => c.set_ability(P_CENTERS.m_mult, null, true)) === (5 + 10 + 15) * (1 + 4) && tgt('enhanced', 'S_K') === 15, 'target enhanced');
ok(tgt('unenhanced', 'S_K') === 30 && tgt('unenhanced', 'S_K', {}, (c) => c.set_ability(P_CENTERS.m_mult, null, true)) === 15 * 5, 'target unenhanced');
ok(tgt('sealed', 'S_K', {}, (c) => c.set_seal('Gold', true)) === 30 && tgt('sealed', 'S_K') === 15, 'target sealed');
// first / last scored card: a Pair of Kings -> (10 + 10 + 10 [+15]) x 2
round({ target: 'first', effect: 'chips' }, ['S_K', 'H_K']); play(2);
ok(score() === (10 + 20 + 15) * 2, 'target first: one card (the first) of a Pair', score());
round({ target: 'last', effect: 'mult' }, ['S_K', 'H_K']); play(2);
ok(score() === 30 * 3, 'target last: one card of a Pair', score());
round({ target: 'first', effect: 'xmult' }, ['S_K', 'H_K', 'D_K']); play(3);
const firstOnly = score();
ok(firstOnly === Math.floor((30 + 30) * 3 * 1.1), 'target first: X1.1 once in a Three of a Kind', firstOnly);
// a debuffed card is skipped: the first card that scores is the next one
round({ target: 'first', effect: 'mult' }, ['S_K', 'H_K'], 'V2RND', null);
G.GAME.blind.debuff = { suit: 'Spades' }; G.hand.cards[0].set_debuff(true);
const [k1, k2] = G.hand.cards; play(2);
ok(score() === (10 + 10) * 3, 'target first: a debuffed card is skipped (the first scoring card gets it)', score());
// the round's rank
{
  let found = null;
  for (let i = 0; i < 1500 && !found; i++) for (const p of offer('V2RANK' + i)) if (p.target === 'rank' && p.effect === 'chips') { found = p; break; }
  ok(found && P.describePage(found).lines[0].includes({ 2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' }[found.rank]), 'target rank: the rank shows in the text', found && P.describePage(found).lines[0]);
  const rk = found ? found.rank : 13;
  const key = 'S_' + ({ 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[rk] || String(rk));
  const other = rk === 13 ? 'S_Q' : 'S_K';
  round({ target: 'rank', rank: rk, effect: 'mult' }, [key]); const chipsOf = 5 + P_CARDS[key].value.length * 0 + G.hand.cards[0].get_chip_bonus(); play(1);
  ok(score() === chipsOf * 2, 'target rank: that rank scores +1 Mult', [score(), chipsOf]);
  round({ target: 'rank', rank: rk, effect: 'mult' }, [other]); play(1);
  ok(score() === 15, 'target rank: another rank doesn\'t');
}

// one rank / a Nature, in play
round({ target: 'single', rank: 7, effect: 'chips' }, ['S_7']); play(1);
ok(score() === 5 + 7 + 15, 'target single: a Seven scores +15 Chips', score());
round({ target: 'single', rank: 7, effect: 'chips' }, ['S_8']); play(1);
ok(score() === 5 + 8, 'target single: an Eight doesn\'t');
ok(P.describePage({ v: 2, target: 'single', rank: 7, effect: 'chips', pct: 0, tier: 1, prize: { kind: 'money', amount: 1 } }).lines[0].startsWith('{C:attention}Sevens{}'), 'target single: named ("Sevens give ...")');
for (const [card, hit] of [['S_4', true], ['S_9', true], ['S_K', true], ['S_5', false], ['S_A', false]]) {
  round({ target: 'nature', ranks: [4, 9, 13], effect: 'mult' }, [card]); const base = 5 + G.hand.cards[0].get_chip_bonus(); play(1);
  ok(score() === base * (hit ? 2 : 1), `target nature (4, 9, King): ${card} ${hit ? 'scores +1 Mult' : 'doesn\'t'}`, score());
}
ok(P.describePage({ v: 2, target: 'nature', ranks: [4, 9, 13], effect: 'mult', pct: 0, tier: 1, prize: { kind: 'money', amount: 1 } }).lines[0].includes('Nature (4, 9, King)'), 'target nature: "Nature (4, 9, King)"');

// ------------------------------------------------------------------ effects (in play)
round({ target: 'face', effect: 'xmult' }, ['S_K']); play(1);
ok(score() === Math.floor(15 * 1.1), 'effect xmult: X1.1 Mult', score());
round({ target: 'face', effect: 'xmult' }, ['S_K']); G.hand.cards[0].set_seal('Red', true); play(1);
ok(score() === Math.floor(25 * 1.21), 'effect xmult: every trigger (Red Seal: X1.1 twice)', score());
round({ target: 'face', effect: 'five_mult' }, ['S_K', 'S_Q', 'S_J', 'S_9', 'S_7']); play(5); // (Flush: 35 + 10+10+10+9+7 = 81, x4 + 3 x 3 faces)
ok(score() === 81 * (4 + 9), 'effect five_mult: +3 Mult per target in a 5-card hand', score());
round({ target: 'face', effect: 'five_mult' }, ['S_K', 'H_K', 'D_K', 'C_K']); play(4); // (Four of a Kind: 60 + 40 = 100 x 7)
ok(score() === 100 * 7, 'effect five_mult: nothing in a 4-card hand', score());
round({ target: 'face', effect: 'retrigger' }, ['S_K']); G.GAME.probabilities.normal = 4; play(1);
ok(score() === 25, 'effect retrigger: certain with Oops! x2 (the King scores twice)', score());
{
  let n = 0;
  for (let i = 0; i < 40; i++) { round({ target: 'face', effect: 'retrigger' }, ['S_K'], 'V2RT' + i); play(1); if (score() === 25) n++; }
  ok(n > 2 && n < 22, 'effect retrigger: about 1 in 4 without Oops!', n);
}
round({ target: 'face', effect: 'gain_seal' }, ['S_K', 'H_Q']); G.GAME.probabilities.normal = 10;
let [a, b] = G.hand.cards; b.set_seal('Gold', true); play(2, [a.sort_id, b.sort_id]);
ok(['Red', 'Blue', 'Gold', 'Purple'].includes(a.seal), 'effect gain_seal: a scored target gains a seal', a.seal);
ok(b.seal === 'Gold', 'effect gain_seal: a card with a seal keeps it');
round({ target: 'face', effect: 'become', enh: 'm_glass' }, ['S_K', 'H_Q']); G.GAME.probabilities.normal = 10;
[a, b] = G.hand.cards; b.set_ability(P_CENTERS.m_mult, null, true); play(2, [a.sort_id, b.sort_id]);
ok(a.config.center.key === 'm_glass' && b.config.center.key === 'm_mult', 'effect become: unenhanced -> Glass; an enhanced card keeps its own', [a.config.center.key, b.config.center.key]);
for (const enh of ['m_steel', 'm_gold']) {
  round({ target: 'face', effect: 'become', enh }, ['S_K']); G.GAME.probabilities.normal = 10; a = G.hand.cards[0]; play(1);
  ok(a.config.center.key === enh, 'effect become: ' + enh);
}
round({ target: 'face', effect: 'level_up' }, ['S_K', 'H_K']); G.GAME.probabilities.normal = 8; play(2);
ok(G.GAME.hands.Pair.level === 3, 'effect level_up: each scored King levels the Pair (Oops! certain)', G.GAME.hands.Pair.level);
round({ target: 'face', effect: 'spectral' }, ['S_K', 'H_K', 'D_K']); G.GAME.probabilities.normal = 20; play(3);
ok(G.consumeables.cards.length === 3 && G.consumeables.cards.every((c) => c.ability.set === 'Spectral'), 'effect spectral: Spectral cards (certain with Oops!)', G.consumeables.cards.map((c) => c.config.center.key));
round({ target: 'face', effect: 'spectral' }, ['S_K', 'H_K', 'D_K']); G.GAME.probabilities.normal = 20; G.consumeables.config.card_limit = 1; play(3);
ok(G.consumeables.cards.length === 1, 'effect spectral: needs room');
round({ target: 'face', effect: 'minus_chips' }, ['S_K']); play(1);
ok(score() === 5, 'effect minus_chips: -10 Chips', score());
round({ target: 'low', effect: 'minus_chips' }, ['S_2']); play(1);
ok(score() === 0, 'effect minus_chips: never below 0 Chips', score());
round({ target: 'face', effect: 'xmult_down' }, ['S_K']); play(1);
ok(score() === Math.floor(15 * 0.9), 'effect xmult_down: X0.9 Mult', score());
round({ target: 'face', effect: 'destroy' }, ['S_K', 'H_K'], 'V2RND', () => { add_joker('j_caino'); E_MANAGER.flush(); });
G.GAME.probabilities.normal = 8; [a, b] = G.hand.cards; play(2, [a.sort_id, b.sort_id]);
ok(!G.playing_cards.includes(a) && !G.playing_cards.includes(b) && a.removed, 'effect destroy: the scored targets are destroyed after scoring');
ok(G.jokers.cards[0].ability.caino_xmult === 3, 'effect destroy: the destroy contexts fire (Canio +X1 per face)', G.jokers.cards[0].ability.caino_xmult);
{
  let n = 0;
  for (let i = 0; i < 40; i++) { round({ target: 'face', effect: 'destroy' }, ['S_K'], 'V2DS' + i); const c = G.hand.cards[0]; play(1); if (c.removed) n++; }
  ok(n >= 1 && n < 14, 'effect destroy: about 1 in 8', n);
}
// debuffed this round: the target cards are debuffed while the round lasts, and restored after
round({ target: 'face', effect: 'debuffed' }, ['S_K', 'S_9']);
const kd = G.hand.cards[0];
ok(kd.debuff && !G.hand.cards[1].debuff && G.playing_cards.filter((c) => c.is_face(true)).every((c) => c.debuff), 'effect debuffed: every face card is debuffed this round');
play(1);
ok(score() === 0 || score() === 5, 'effect debuffed: a debuffed King scores nothing', score());
G.GAME.blind.chips = 1; play(1, [G.hand.cards[0].sort_id]);
ok(state() === 'ROUND_EVAL', 'effect debuffed: the round ends');
ok(G.playing_cards.every((c) => !c.debuff), 'effect debuffed: restored when the round ends');

// ------------------------------------------------------------------ required score
function req(pct) {
  newRun({ seed: 'V2REQ', engineRev: REV });
  act({ type: 'select_blind' });
  takePage({ pct, target: 'Hearts', effect: 'minus_mult' });
  return Number(G.GAME.blind.chips);
}
ok(req(-15) === 255 && req(-20) === 240 && req(40) === 420 && req(50) === 450, 'required score: -15% / -20% / +40% / +50% (Small Blind 300)', [req(-15), req(-20), req(40), req(50)]);

// ------------------------------------------------------------------ Round rules (through the round and the next)
round({ target: 'Hearts', effect: 'chips', rule: 'minus_hand' });
ok(G.GAME.current_round.hands_left === 3, 'rule minus_hand: 3 hands', G.GAME.current_round.hands_left);
winNow(); nextRound();
ok(G.GAME.current_round.hands_left === 4, 'rule minus_hand: back to 4 next round');
// (the Red Deck: 4 discards a round)
round({ target: 'Hearts', effect: 'chips', rule: 'plus_discard' });
ok(G.GAME.current_round.discards_left === 5, 'rule plus_discard: 5 discards (Red Deck 4 + 1)', G.GAME.current_round.discards_left);
for (let i = 0; i < 5; i++) { act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] }); ok(act({ type: 'discard' }).ok, 'rule plus_discard: discard ' + (i + 1)); }
winNow(); nextRound();
ok(G.GAME.current_round.discards_left === 4, 'rule plus_discard: 4 next round');
round({ target: 'Hearts', effect: 'chips', rule: 'minus_hand_size' });
ok(G.hand.cards.length === 7 && G.hand.config.card_limit === 7, 'rule minus_hand_size: 7 cards dealt', G.hand.cards.length);
play(1);
ok(G.hand.cards.length === 7, 'rule minus_hand_size: drawn back up to 7');
winNow(); nextRound();
ok(G.hand.cards.length === 8 && G.hand.config.card_limit === 8, 'rule minus_hand_size: 8 again next round', G.hand.cards.length);
round({ target: 'Hearts', effect: 'chips', rule: 'no_discards' });
act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] });
ok(G.GAME.current_round.discards_left === 0 && !act({ type: 'discard' }).ok, 'rule no_discards: no discard this round');
winNow(); nextRound();
ok(G.GAME.current_round.discards_left === 4, 'rule no_discards: discards back next round');
round({ target: 'Hearts', effect: 'chips', rule: 'double_first' }, ['S_K', 'S_K']);
play(1);
ok(score() === 30, 'rule double_first: the first hand counts double (15 -> 30)', score());
play(1);
ok(score() === 45, 'rule double_first: only the first', score());
// the rule's view + text
round({ target: 'Hearts', effect: 'chips', rule: 'no_discards' });
ok(toView().page.rule === 'no_discards' && /No discards/.test(toView().page.desc.lines[3]), 'rule: in the round\'s view (the badge)', toView().page.desc);

// ------------------------------------------------------------------ prizes (won, cashed out, used in the next rounds / shops)
// no prize (half of the Pages): no cash-out row, nothing added to the score
{
  newRun({ seed: 'V2NONE', engineRev: REV }); act({ type: 'select_blind' });
  const pg = { v: 2, target: 'Hearts', effect: 'chips', roll: 20, prize: { kind: 'none' } };
  pg.value = P.prizeValue(pg.prize); pg.pct = pg.roll + pg.value; pg.difficulty = pg.pct; pg.tier = P.tierOfV2(pg.difficulty).tier;
  G.GAME.pages.choices[0] = pg; act({ type: 'pick_page', index: 0 });
  ok(pg.value === 0 && Number(G.GAME.blind.chips) === 360 && P.describePage(pg).lines[2] === '{C:inactive}No prize', 'no prize: the score is just the roll (+20%: 360), the card says "No prize"', [Number(G.GAME.blind.chips), P.describePage(pg).lines[2]]);
  const r0 = winNow();
  ok(!r0 && !G.GAME.page, 'no prize: no cash-out row');
}
let row = winWith({ kind: 'tag', key: 'tag_juggle' });
ok(row && /Juggle Tag/.test(row.prize) && G.GAME.tags.some((t) => t.key === 'tag_juggle'), 'prize tag: the Tag is yours', row);
nextRound();
ok(G.hand.cards.length === 11, 'prize tag: Juggle\'s +3 hand size next round', G.hand.cards.length);
for (const key of P.PRIZE_TAGS) { winWith({ kind: 'tag', key }); ok(G.GAME.tags.some((t) => t.key === key) || key === 'tag_top_up', 'prize tag: ' + key); }
winWith({ kind: 'tag', key: 'tag_top_up' }); E_MANAGER.flush();
ok(G.jokers.cards.length === 2 && G.jokers.cards.every((j) => j.config.center.rarity === 1), 'prize tag: Top-up\'s immediate Jokers', G.jokers.cards.map((j) => j.config.center.key));
winWith({ kind: 'tag', key: 'tag_coupon' }); act({ type: 'cash_out' });
ok(state() === 'SHOP' && G.shop_jokers.cards.every((c) => c.cost === 0), 'prize tag: Coupon, the shop\'s cards free');
// level up the most played hand
round({ target: 'Hearts', effect: 'chips', prize: { kind: 'level_most' } }, ['S_K', 'H_K', 'S_9', 'H_9', 'D_2']);
G.GAME.hands['Two Pair'].played = 5; G.GAME.hands.Flush.played = 5; // (a tie: the stronger hand)
G.GAME.blind.chips = 1; play(2);
ok(G.GAME.hands.Flush.level === 2 && G.GAME.hands['Two Pair'].level === 1 && G.GAME.hands.Pair.level === 1, 'prize level_most: the most played hand (ties: the stronger)', [G.GAME.hands.Flush.level]);
// jokers by rarity (room / no room)
for (const rarity of [1, 2, 3, 4]) {
  row = winWith({ kind: 'joker', rarity });
  ok(G.jokers.cards.length === 1 && G.jokers.cards[0].config.center.rarity === rarity && row.dollars === 0, 'prize joker: rarity ' + rarity, G.jokers.cards.map((j) => j.config.center.key));
  row = winWith({ kind: 'joker', rarity }, 'V2PRZ', () => { G.jokers.config.card_limit = 0; });
  ok(G.jokers.cards.length === 0 && row.dollars >= 1, 'prize joker: no room -> its sell value: rarity ' + rarity, row);
}
// an enhanced card for the deck
row = winWith({ kind: 'enhanced_card' });
const added = G.playing_cards[G.playing_cards.length - 1];
ok(G.playing_cards.length === 53 && added.config.center.set === 'Enhanced' && added.area === G.deck, 'prize enhanced_card: an enhanced card in the deck', [G.playing_cards.length, added.config.center.key]);
nextRound();
ok(G.playing_cards.length === 53, 'prize enhanced_card: it stays');
// +1 hand size next round
winWith({ kind: 'hand_size' });
nextRound();
ok(G.hand.cards.length === 9, 'prize hand_size: 9 cards next round', G.hand.cards.length);
winNow(); nextRound();
ok(G.hand.cards.length === 8, 'prize hand_size: 8 the round after');
// remove a card of your choice
winWith({ kind: 'remove_card' }, 'V2PRZ', () => { add_joker('j_caino'); E_MANAGER.flush(); });
act({ type: 'cash_out' });
ok(state() === 'PAGE_REMOVE' && toView().page_remove && toView().page_remove.cards.length === 52, 'prize remove_card: the remove screen after the cash-out', state());
ok(!act({ type: 'next_round' }).ok && !act({ type: 'reroll_shop' }).ok && !act({ type: 'page_remove', id: 99999 }).ok, 'prize remove_card: no skipping it, no such card');
const king = G.playing_cards.find((c) => c.get_id() === 13);
ok(act({ type: 'page_remove', id: king.sort_id }).ok && !G.playing_cards.includes(king) && G.playing_cards.length === 51, 'prize remove_card: the card is gone');
ok(G.jokers.cards[0].ability.caino_xmult === 2, 'prize remove_card: the destroy contexts fire (Canio)', G.jokers.cards[0].ability.caino_xmult);
ok(state() === 'SHOP' && G.shop_jokers.cards.length > 0, 'prize remove_card: then the shop');
// the interest cap
function interestAfter(prize) {
  winWith(prize || { kind: 'money', amount: 1 });
  nextRound();
  G.GAME.dollars = 100;
  winNow();
  const r = G.GAME.round_eval.rows.find((x) => x.name === 'interest');
  return r ? r.dollars : 0;
}
ok(interestAfter() === 5 && interestAfter({ kind: 'interest' }) === 6, 'prize interest: +$5 cap at the next cash-out ($6 interest at $100)');
act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); takePage({}); G.GAME.dollars = 100; winNow();
ok(G.GAME.round_eval.rows.find((x) => x.name === 'interest').dollars === 5, 'prize interest: that cash-out only');
// edition on the leftmost Joker
winWith({ kind: 'joker_edition' }, 'V2PRZ', () => { add_joker('j_joker'); add_joker('j_egg'); E_MANAGER.flush(); G.jokers.cards[0].set_edition({ foil: true }, true); });
ok(!!G.jokers.cards[1].edition && ['foil', 'holo', 'polychrome'].includes(G.jokers.cards[1].edition.type), 'prize joker_edition: the leftmost Joker without one', G.jokers.cards.map((j) => j.edition && j.edition.type));
row = winWith({ kind: 'joker_edition' });
ok(row.dollars === 5, 'prize joker_edition: no Joker without one -> $5', row);
// +1 Joker slot
winWith({ kind: 'joker_slot' });
ok(G.jokers.config.card_limit === 6, 'prize joker_slot: 6 Joker slots');
nextRound(); winNow(); nextRound();
ok(G.jokers.config.card_limit === 6, 'prize joker_slot: for the rest of the run');
// Pokermon: a Poke Ball / an Energy card
{
  newRun({ seed: 'V2POKE', engineRev: REV, mods: ['pokermon'] });
  act({ type: 'select_blind' });
  G.GAME.pages.choices[0] = { v: 2, target: 'Hearts', effect: 'chips', pct: 0, difficulty: 20, tier: 3, prize: { kind: 'card', set: 'Item', key: 'c_poke_pokeball' } };
  act({ type: 'pick_page', index: 0 });
  winNow();
  ok(G.consumeables.cards.some((c) => c.config.center.key === 'c_poke_pokeball'), 'prize poke: a Poke Ball Item');
}

// ------------------------------------------------------------------ 25% of Blinds, and the pity timer (the real odds)
P.PAGE_ODDS.chance = CHANCE;
{
  // a bot plays real runs (every Blind selected, won at once): how often a Pages screen opens, and the pity timer
  let blinds = 0, shown = 0, pityBosses = 0, pityMissed = 0, quietAntes = 0;
  for (let i = 0; i < 120; i++) {
    newRun({ seed: 'V2ODDS' + i, engineRev: REV });
    const seenAnte = {};
    for (let n = 0; n < 200 && G.GAME.round_resets.ante <= 5 && !G.GAME.over; n++) {
      const st = state();
      if (st === 'BLIND_SELECT') {
        const which = G.GAME.blind_on_deck, ante = G.GAME.round_resets.ante;
        const owed = which === 'Boss' && ante > 1 && !seenAnte[ante - 1] && !seenAnte[ante];
        const v = toView();
        if (which === 'Boss') ok(!!v.page_pity === owed, 'pity: the blind choice says "Page guaranteed this Boss" exactly when owed', { ante, owed });
        act({ type: 'select_blind' });
        blinds++;
        const got = state() === 'PAGES';
        if (got) { shown++; seenAnte[ante] = true; }
        if (owed) { pityBosses++; if (!got) pityMissed++; }
        if (got) act({ type: 'pick_page', index: G.GAME.pages.choices.findIndex((p) => !p.rule && !P.effectWeight(p.effect)) >= 0 ? G.GAME.pages.choices.findIndex((p) => !p.rule && !P.effectWeight(p.effect)) : 0 });
        if (which === 'Boss' && !seenAnte[ante]) quietAntes++;
      } else if (st === 'SELECTING_HAND') { G.GAME.blind.chips = 1; play(1); }
      else if (st === 'ROUND_EVAL') act({ type: 'cash_out' });
      else if (st === 'PAGE_REMOVE') act({ type: 'page_remove', id: G.playing_cards[0].sort_id });
      else if (/_PACK/.test(st)) act({ type: 'skip_booster' });
      else if (st === 'SHOP') act({ type: 'next_round' });
      else break;
    }
  }
  const share = shown / blinds;
  console.log(`  odds: ${blinds} Blinds, Pages on ${(share * 100).toFixed(1)}%, pity Bosses ${pityBosses}, whole antes without a Page ${quietAntes}`);
  ok(pityBosses > 10 && pityMissed === 0, 'pity: a Boss after an ante without a Page always gets one', { pityBosses, pityMissed });
  ok(share > 0.25 && share < 0.36, 'Pages on ~25% of Blinds (+ the pity Bosses)', share);
  // the roll alone (no pity): ~25% of the first Small Blinds
  let first = 0;
  for (let i = 0; i < 800; i++) { newRun({ seed: 'V2FIRST' + i, engineRev: REV }); act({ type: 'select_blind' }); if (state() === 'PAGES') first++; }
  ok(Math.abs(first / 800 - 0.25) < 0.04, 'a Blind gets Pages 25% of the time (seeded roll)', first / 800);
  newRun({ seed: 'V2FIRST1', engineRev: REV }); act({ type: 'select_blind' }); const a1 = state();
  newRun({ seed: 'V2FIRST1', engineRev: REV }); act({ type: 'select_blind' });
  ok(a1 === state(), 'the roll is seeded');
  // a rev-2 run: Pages on every Blind, as recorded
  let all = 0;
  for (let i = 0; i < 40; i++) { newRun({ seed: 'V2FIRST' + i, engineRev: 2 }); act({ type: 'select_blind' }); if (state() === 'PAGES') all++; }
  ok(all === 40, 'rev 2 (Pages v1): every Blind still has its Pages', all);
}
P.PAGE_ODDS.chance = 1;

// ------------------------------------------------------------------ every specific prize (owner, 2026-11-08): each one granted in a real round
{
  newRun({ seed: 'V2ELIG', engineRev: REV });
  const list = P.eligiblePrizes();
  const by = (f) => list.filter(f).length;
  ok(by((z) => z.set === 'Tarot') === 22 && by((z) => z.set === 'Planet') >= 9 && by((z) => z.set === 'Spectral') === 18 && by((z) => z.kind === 'named_joker' && z.rarity === 1) > 50 && by((z) => z.kind === 'named_joker' && z.rarity === 2) > 50,
    'eligible: every Tarot, the open Planets, every Spectral (Black Hole + The Soul), Common + Uncommon Jokers', { t: by((z) => z.set === 'Tarot'), p: by((z) => z.set === 'Planet'), s: by((z) => z.set === 'Spectral'), j1: by((z) => z.rarity === 1), j2: by((z) => z.rarity === 2) });
  ok(list.some((z) => z.key === 'c_black_hole') && list.some((z) => z.key === 'c_soul') && !P.prizePoolV2('Spectral').some((v) => v.key === 'c_soul'), 'eligible: Black Hole a Spectral prize; The Soul only as its own (Legendary) prize');
  ok(!list.some((z) => z.kind === 'named_joker' && P_CENTERS[z.key].rarity > 2) && !list.some((z) => z.basic), 'eligible: no Rare / Legendary named Joker, no Pokermon without Pokermon');
  ok(list.every((z) => P.prizeValue(z) > 0), 'eligible: every one has a value');
  ok(P.prizeValue({ kind: 'named_joker', key: 'j_joker' }) === 15 * P_CENTERS.j_joker.cost && P.prizeValue({ kind: 'card', set: 'Planet', key: 'c_pluto' }) === 35 && P.prizeValue({ kind: 'card', set: 'Spectral', key: 'c_black_hole' }) === 160 && P.prizeValue({ kind: 'card', set: 'Spectral', key: 'c_soul' }) === 300, 'values: a Joker by its cost x15, a Planet +35%, Black Hole +160%, The Soul +300%');
  let granted = 0;
  const failed = [];
  const grantAll = (items, seed, mods) => {
    for (const z of items) {
      newRun({ seed, engineRev: REV, ...(mods ? { mods } : {}) });
      act({ type: 'select_blind' });
      G.GAME.pages.choices[0] = { v: 2, target: 'Hearts', effect: 'chips', roll: 0, value: 0, pct: 0, difficulty: 0, tier: 1, prize: z };
      act({ type: 'pick_page', index: 0 });
      G.consumeables.config.card_limit = 5;
      const row = winNow();
      const area = z.kind === 'named_joker' ? G.jokers : G.consumeables;
      if (row && area.cards.some((c) => c.config.center.key === z.key)) granted++; else failed.push(z.key);
    }
  };
  grantAll(list, 'V2ELIG');
  // with Pokermon on: its Items and every Basic-stage Pokermon Joker too
  newRun({ seed: 'V2ELIGP', engineRev: REV, mods: ['pokermon'] });
  const plist = P.eligiblePrizes().filter((z) => z.set === 'Item' || z.basic);
  ok(plist.filter((z) => z.basic).length > 300 && plist.some((z) => z.set === 'Item'), 'eligible with Pokermon: its Items + its Basic Jokers', plist.length);
  ok(plist.filter((z) => z.basic).every((z) => P_CENTERS[z.key].stage === 'Basic' && P_CENTERS[z.key].mod === 'pokermon'), 'eligible with Pokermon: Basic stage only');
  grantAll(plist, 'V2ELIGP', ['pokermon']);
  ok(failed.length === 0, `every eligible prize is granted in a real round (${granted} of ${list.length + plist.length})`, failed.slice(0, 10));
  // switched off / banned content never appears
  await import('../mods/jokertoggle/index.js');
  newRun({ seed: 'V2ELIGT', engineRev: REV, mods: ['jokertoggle'], modOptions: { jokertoggle: { j_joker: false } } });
  ok(!P.eligiblePrizes().some((z) => z.key === 'j_joker') && P.eligiblePrizes().some((z) => z.key === 'j_greedy_joker'), 'Joker Toggle: a switched-off Joker is never a prize');
  newRun({ seed: 'V2ELIGT', engineRev: REV }); add_joker('j_greedy_joker'); E_MANAGER.flush();
  ok(!P.eligiblePrizes().some((z) => z.key === 'j_greedy_joker'), 'a Joker you own is not offered again');
  // no room: its sell value
  const row2 = winWith({ kind: 'named_joker', rarity: 1, key: 'j_joker' }, 'V2PRZ', () => { G.jokers.config.card_limit = 0; });
  ok(row2 && row2.dollars >= 1 && G.jokers.cards.length === 0, 'a named Joker with no room: its sell value', row2);
}

// ------------------------------------------------------------------ save / resume / replay
const s = new Session(); s.start({ seed: 'V2RESUME' });
ok(s.recipe.engineRev === REV, 'a new run records engine rev 3');
s.act({ type: 'select_blind' });
const want = JSON.stringify(s.view().pages);
ok(s.view().pages.choices.every((p) => p.v === 2), 'a new run offers v2 Pages');
const back = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe)));
ok(JSON.stringify(back.view().pages) === want, 'resume mid-Pages: the same 3 v2 Pages');
// a remove-a-card prize, saved on its screen
{
  // (a real recipe can't edit the offer: find a seed whose first offer has the prize; the deck is 40 Aces of Spades so the bot's
  //  first hand — a Flush Five — beats the raised requirement)
  const ACES = { name: 'Aces', cards: [['S_A', 0, 0, 0, 40]] };
  let seed = null;
  for (let i = 0; i < 2000 && !seed; i++) {
    newRun({ seed: 'V2RMS' + i, engineRev: REV, customDeck: ACES }); act({ type: 'select_blind' });
    const j = G.GAME.pages.choices.findIndex((p) => p.prize.kind === 'remove_card' && !p.rule && !P.effectWeight(p.effect));
    if (j >= 0) seed = ['V2RMS' + i, j];
  }
  ok(!!seed, 'a seed whose first offer has the remove prize');
  const s3 = new Session(); s3.start({ seed: seed[0], customDeck: ACES });
  s3.act({ type: 'select_blind' }); s3.act({ type: 'pick_page', index: seed[1] });
  let guard = 0;
  while (s3.view().state === 'SELECTING_HAND' && guard++ < 10) {
    const ids = s3.view().areas.hand.slice(0, 5).map((c) => c.id);
    s3.act({ type: 'highlight', ids }); s3.act({ type: 'play' });
  }
  if (s3.view().state === 'ROUND_EVAL') s3.act({ type: 'cash_out' });
  ok(s3.view().state === 'PAGE_REMOVE' && s3.view().page_remove.cards.length === 40, 'a real run reaches the remove screen', s3.view().state);
  const r3 = Session.fromRecipe(JSON.parse(JSON.stringify(s3.recipe)));
  ok(r3.view().state === 'PAGE_REMOVE' && JSON.stringify(r3.view().page_remove) === JSON.stringify(s3.view().page_remove), 'resume on the remove screen: frame-exact');
  const id = r3.view().page_remove.cards[7].id;
  ok(r3.act({ type: 'page_remove', id }).ok && r3.view().state === 'SHOP' && r3.view().deck_list.length === 39, 'and the removal works after the resume');
  const st = Session.stepper(r3.recipe); st.seek(r3.recipe.actions.length - 1);
  ok(st.view().state === 'PAGE_REMOVE', 'the replay shows the remove screen');
  st.seek(r3.recipe.actions.length);
  ok(st.view().state === 'SHOP' && st.view().deck_list.length === 39, 'and the removal');
}
// a Pages-v1 recipe (rev 2) replays on v1 tables, no "versions changed"
{
  const s1 = new Session(); s1.start({ seed: 'V2OLD', engineRev: 2 });
  s1.act({ type: 'select_blind' });
  ok(s1.view().pages.choices.every((p) => !p.v), 'a rev-2 run: v1 Pages');
  const r1 = Session.fromRecipe(JSON.parse(JSON.stringify(s1.recipe)));
  ok(JSON.stringify(r1.view().pages) === JSON.stringify(s1.view().pages) && r1.view().pages.choices.every((p) => !p.v), 'a rev-2 recipe resumes on v1 Pages');
  ok(!Session.pinDiff(s1.recipe).some((d) => d.engine), 'a rev-2 recipe: no "versions changed" (rev 3 is gated)');
}

console.log(`pages v2: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
