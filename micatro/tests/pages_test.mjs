// Micatro's Pages (engine/pages.js): the offer, every target and effect, the required-score modifier, the prizes, and the
// switches that turn Pages off (legacy engine rev, a challenge, the Joker Toggle mod's "Pages").
//   node micatro/tests/pages_test.mjs
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
const { newRun, act, G, STATES, STATE_NAMES } = await import('../js/engine/run.js');
const { P_CENTERS, P_CARDS, add_joker, E_MANAGER } = await import('../js/engine/core.js');
const P = await import('../js/engine/pages.js');
const { Session } = await import('../js/engine/session.js');
const PINS = await import('../js/mods/pins.js');
await import('../mods/jokertoggle/index.js');

let fails = 0, passes = 0;
function ok(cond, msg, extra) {
  if (cond) { passes++; } else { fails++; console.log('FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); }
}
const REV = PINS.ENGINE_CONTENT_REV;
const state = () => STATE_NAMES[G.STATE];

// ------------------------------------------------------------------ on / off
newRun({ seed: 'PG1', engineRev: REV });
ok(G.GAME.pages_on === true, 'current rules: Pages are on');
ok(act({ type: 'select_blind' }).ok && state() === 'PAGES', 'select_blind opens the Pages screen', state());
ok(G.GAME.round === 0 && !G.GAME.facing_blind, 'the round has not started yet');
for (const t of ['skip_blind', 'select_blind', 'reroll_boss', 'cash_out', 'next_round', 'play']) ok(!act({ type: t }).ok, `no ${t} on the Pages screen (no Back, no Skip)`);
ok(!act({ type: 'pick_page', index: 3 }).ok && !act({ type: 'pick_page', index: -1 }).ok && !act({ type: 'pick_page' }).ok, 'pick_page needs one of the 3');
ok(G.GAME.pages.choices.length === 3, '3 Pages');
const first = JSON.stringify(G.GAME.pages.choices);
ok(act({ type: 'pick_page', index: 2 }).ok && state() === 'SELECTING_HAND', 'picking a Page starts the round', state());
ok(G.GAME.page && JSON.stringify(G.GAME.page) === JSON.stringify(JSON.parse(first)[2]), 'the picked Page is the round\'s');
ok(!act({ type: 'pick_page', index: 0 }).ok, 'no second pick');

newRun({ seed: 'PG1' });
ok(!G.GAME.pages_on && act({ type: 'select_blind' }).ok && state() === 'SELECTING_HAND', 'legacy rules (no engineRev): no Pages');
newRun({ seed: 'PG1', engineRev: 1 });
ok(!G.GAME.pages_on, 'engine rev 1: no Pages');
newRun({ seed: 'PG1', engineRev: REV, mods: ['jokertoggle'], modOptions: { jokertoggle: { pages: false } } });
ok(!G.GAME.pages_on && act({ type: 'select_blind' }).ok && state() === 'SELECTING_HAND', 'Joker Toggle "Pages" off: no Pages');
newRun({ seed: 'PG1', engineRev: REV, mods: ['jokertoggle'] });
ok(G.GAME.pages_on, 'Joker Toggle on, Pages switch left on: Pages');
newRun({ seed: 'PG1', engineRev: REV, challenge: 'c_omelette_1' });
ok(!G.GAME.pages_on, 'a challenge plays without Pages');

// ------------------------------------------------------------------ the offer
function offer(seed, which = 'Small') {
  newRun({ seed, engineRev: REV });
  const settle = () => { while (/_PACK/.test(state())) act({ type: 'skip_booster' }); };
  if (which !== 'Small') { act({ type: 'skip_blind' }); settle(); if (which === 'Boss') { act({ type: 'skip_blind' }); settle(); } }
  act({ type: 'select_blind' });
  return G.GAME.pages.choices;
}
ok(JSON.stringify(offer('SEEDA')) === JSON.stringify(offer('SEEDA')), 'same seed, same Pages');
ok(JSON.stringify(offer('SEEDA')) !== JSON.stringify(offer('SEEDB')), 'another seed, other Pages');
ok(JSON.stringify(offer('SEEDA')) !== JSON.stringify(offer('SEEDA', 'Big')), 'the Big Blind gets its own Pages');
const seenT = new Set(), seenE = new Set(), seenP = new Set(), seenPrize = new Set(), seenTier = new Set();
for (let i = 0; i < 300; i++) {
  const ch = offer('GEN' + i, ['Small', 'Big', 'Boss'][i % 3]);
  ok(ch.length === 3 && new Set(ch.map((p) => p.target + p.effect)).size === 3, 'three distinct Pages');
  for (const p of ch) {
    seenT.add(p.target); seenE.add(p.effect); seenP.add(p.pct); seenTier.add(p.tier);
    ok(P.PAGE_TARGETS[p.target] && P.PAGE_EFFECTS[p.effect] && P.PAGE_PCTS.includes(p.pct), 'a valid Page', p);
    ok(p.difficulty === p.pct + (P.PAGE_EFFECTS[p.effect].down ? P.DOWNSIDE_BONUS : 0) && p.tier === P.tierOf(p.difficulty).tier, 'tier from difficulty', p);
    if (P.PAGE_EFFECTS[p.effect].down) ok(p.tier >= 3, 'a downside draws from a better tier', p);
    const tier = P.PRIZE_TIERS.find((t) => t.tier === p.tier);
    const z = p.prize;
    seenPrize.add(z.kind + (z.perk || z.set || ''));
    ok(tier.prizes.some((q) => q.kind === z.kind && (q.kind !== 'money' || q.amount === z.amount) && (q.kind !== 'pack' || q.key === z.key) && (q.kind !== 'card' || q.set === z.set) && (q.kind !== 'shop' || q.perk === z.perk)), 'the prize is from its tier', p);
    if (z.kind === 'card') ok(P_CENTERS[z.key] && P_CENTERS[z.key].set === z.set && !['c_soul', 'c_black_hole'].includes(z.key), 'a named consumable', z);
    ok(!['Item', 'Oddity'].includes(z.set), 'no Item / Oddity prize without their mods', z);
    const d = P.describePage(p);
    ok(d.lines.length === 3 && /Required score/.test(d.lines[1]) && /^Prize: /.test(d.lines[2]), 'plain-language text', d);
    ok(!/[pc]_[a-z]/.test(d.lines.join(' ')), 'names, not keys', d.lines[2]);
  }
}
ok(seenT.size === P.TARGET_KEYS.length && seenE.size === P.EFFECT_KEYS.length && seenP.size === P.PAGE_PCTS.length && seenTier.size === 4, 'every target / effect / modifier / tier is offered', { t: seenT.size, e: seenE.size });
for (const k of ['money', 'pack', 'cardTarot', 'cardSpectral', 'shophalf_off', 'shoprerolls', 'shopnegative']) ok(seenPrize.has(k), 'prize offered: ' + k, [...seenPrize]);
ok(P.tierOf(-10).tier === 1 && P.tierOf(-5).tier === 1 && P.tierOf(0).tier === 2 && P.tierOf(15).tier === 2 && P.tierOf(20).tier === 3 && P.tierOf(25).tier === 3 && P.tierOf(30).tier === 4 && P.tierOf(60).tier === 4, 'the tier table');

// ------------------------------------------------------------------ a round with a chosen Page
/** A fresh run on the Small Blind with this Page; the hand's first cards set to `cards` (P_CARDS keys). */
function round(page, cards = [], seed = 'RND') {
  newRun({ seed, engineRev: REV });
  act({ type: 'select_blind' });
  G.GAME.pages.choices[0] = { difficulty: 0, tier: 2, prize: { kind: 'money', amount: 2 }, pct: 0, ...page };
  const r = act({ type: 'pick_page', index: 0 });
  if (!r.ok) throw new Error('pick: ' + r.error);
  cards.forEach((k, i) => G.hand.cards[i].set_base(P_CARDS[k]));
  G.GAME.blind.chips = 1e9;
  G.consumeables.config.card_limit = 5;
}
function play(n) {
  const sel = G.hand.cards.slice(0, n).map((c) => c.sort_id);
  act({ type: 'highlight', ids: sel });
  const r = act({ type: 'play' });
  if (!r.ok) throw new Error('play: ' + r.error);
  return r;
}
const score = () => Number(G.GAME.chips);
// High Card, one King: (5 + 10) x 1 = 15
round({ target: 'Spades', effect: 'chips' }, ['S_K']); play(1);
ok(score() === 30, '+15 Chips on a scored Spade', score());
round({ target: 'Hearts', effect: 'chips' }, ['S_K']); play(1);
ok(score() === 15, 'not a target: nothing', score());
round({ target: 'face', effect: 'mult' }, ['S_K']); play(1);
ok(score() === 30, '+1 Mult on a face card', score());
round({ target: 'face', effect: 'chips' }, ['S_K']);
G.hand.cards[0].set_seal('Red', true); play(1);
ok(score() === 10 + 5 + 10 + 30, 'a retrigger (Red Seal) triggers the Page again', score());
round({ target: 'face', effect: 'minus_mult' }, ['S_K', 'H_K']); play(2);
ok(score() === (10 + 20) * 1, 'Pair -1 Mult per King, never below 1', score()); // (10 base + two 10s) x max(2-1-1, 1)
round({ target: 'face', effect: 'minus_mult' }, ['S_K']); play(1);
ok(score() === 15, '-1 Mult never takes Mult below 1', score());
round({ target: 'Spades', effect: 'perma_chips' }, ['S_K']);
let card = G.hand.cards[0]; play(1);
ok(card.ability.perma_bonus === 15 && score() === 15, '+15 Chips permanently (Hiker: counts from its next scoring)', [card.ability.perma_bonus, score()]);
round({ target: 'Spades', effect: 'perma_mult' }, ['S_K']);
card = G.hand.cards[0]; play(1);
ok(card.ability.perma_mult === 1, '+1 Mult permanently', card.ability.perma_mult);
round({ target: 'ace', effect: 'gain_dollar' }, ['S_A']);
let $0 = G.GAME.dollars; play(1);
ok(G.GAME.dollars === $0 + 1, 'gain $1 on an Ace');
round({ target: 'ace', effect: 'lose_dollar' }, ['S_A', 'H_A']);
G.GAME.dollars = 1; play(2);
ok(G.GAME.dollars === 0, 'lose $1 a trigger, never into debt the run doesn\'t allow', G.GAME.dollars);
round({ target: 'ace', effect: 'lose_dollar' }, ['S_A']);
G.GAME.dollars = 0; G.GAME.bankrupt_at = -20; play(1);
ok(G.GAME.dollars === -1, 'with Credit Card\'s room: into debt', G.GAME.dollars);
for (const [eff, set] of [['tarot', 'Tarot'], ['planet', 'Planet']]) {
  round({ target: 'Spades', effect: eff }, ['S_K', 'S_K', 'S_K']); // (Three of a Kind: all three score)
  G.GAME.probabilities.normal = 4; // (Oops! All 6s x2: certain)
  play(3);
  ok(G.consumeables.cards.length === 3 && G.consumeables.cards.every((c) => c.ability.set === set), `1 in 4 ${set} (Oops! makes it certain)`, G.consumeables.cards.map((c) => c.config.center.key));
  round({ target: 'Spades', effect: eff }, ['S_K', 'S_K', 'S_K']);
  G.GAME.probabilities.normal = 4; G.consumeables.config.card_limit = 1;
  play(3);
  ok(G.consumeables.cards.length === 1, `${set}: only while there's room`);
  round({ target: 'Spades', effect: eff }, ['S_K', 'S_Q', 'S_J', 'S_9', 'S_7']);
  play(5);
  ok(G.consumeables.cards.length <= 5, `${set}: 1 in 4 without Oops!`);
}
for (const [eff, enh] of [['lucky_discard', 'm_lucky'], ['bonus_discard', 'm_bonus']]) {
  round({ target: 'Hearts', effect: eff }, ['H_K', 'H_Q', 'S_J']);
  G.GAME.probabilities.normal = 4;
  const [a, b, c] = G.hand.cards;
  b.set_ability(P_CENTERS.m_glass, null, true);
  act({ type: 'highlight', ids: [a.sort_id, b.sort_id, c.sort_id] });
  ok(act({ type: 'discard' }).ok, 'discard');
  ok(a.config.center.key === enh, `discarded Heart became ${enh}`);
  ok(b.config.center.key === 'm_glass', 'an enhanced card keeps its enhancement');
  ok(c.config.center.key === 'c_base', 'a non-target stays');
  round({ target: 'Hearts', effect: eff }, ['H_K', 'H_Q', 'H_J', 'H_9', 'H_7']);
  act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((x) => x.sort_id) });
  act({ type: 'discard' });
  const n = G.discard.cards.filter((x) => x.config.center.key === enh).length;
  ok(n <= 5, `${enh}: 1 in 4 without Oops!`);
}

// ------------------------------------------------------------------ targets
round({ target: 'Spades', effect: 'chips' }, ['S_K']);
const C = G.hand.cards[0];
const T = (k) => P.PAGE_TARGETS[k].test(C);
const as = (key, enh) => { C.set_base(P_CARDS[key]); C.set_ability(P_CENTERS[enh || 'c_base'], null, true); };
as('S_K'); ok(T('Spades') && !T('Hearts') && T('face') && !T('odd') && !T('even') && !T('ace'), 'King of Spades');
as('H_A'); ok(T('Hearts') && T('odd') && T('ace') && !T('even') && !T('face'), 'Ace of Hearts: odd (as Odd Todd)');
as('D_9'); ok(T('Diamonds') && T('odd') && !T('even'), '9 is odd');
as('C_T'); ok(T('Clubs') && T('even') && !T('odd'), '10 is even');
as('C_2'); ok(T('even'), '2 is even');
as('H_5', 'm_wild'); ok(['Spades', 'Clubs', 'Hearts', 'Diamonds'].every(T), 'a Wild card is every suit');
as('H_5', 'm_stone'); ok(!['Spades', 'Clubs', 'Hearts', 'Diamonds', 'odd', 'even', 'face', 'ace'].some(T), 'a Stone card is no target');
as('H_5'); ok(!T('face'), '5 is no face'); add_joker('j_pareidolia'); E_MANAGER.flush(); ok(T('face'), 'Pareidolia: every card is a face');

// ------------------------------------------------------------------ required score
function req(page, setup) {
  newRun({ seed: 'REQ', engineRev: REV });
  if (setup) setup();
  act({ type: 'select_blind' });
  G.GAME.pages.choices[0] = { target: 'Spades', effect: 'chips', prize: { kind: 'money', amount: 1 }, tier: 1, difficulty: page, pct: page };
  act({ type: 'pick_page', index: 0 });
  return Number(G.GAME.blind.chips);
}
ok(req(0) === 300 && req(20) === 360 && req(-10) === 270 && req(30) === 390 && req(5) === 315, 'Small Blind 300: x(100 + pct)%', [req(0), req(20), req(-10)]);
const wall = (pct, chicot) => req(pct, () => {
  for (let i = 0; i < 2; i++) { act({ type: 'skip_blind' }); while (/_PACK/.test(state())) act({ type: 'skip_booster' }); }
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  if (chicot) { add_joker('j_chicot'); E_MANAGER.flush(); }
});
ok(wall(0) === 1200 && wall(20) === 1440, 'The Wall (x4) then the Page: 1440', wall(20));
ok(wall(20, true) === 720, 'Chicot disables The Wall after the Page (halved: 720)', wall(20, true));

// ------------------------------------------------------------------ prizes
/** Win the round with this prize (Page index 0), stopping on the cash-out. */
function win(prize, seed = 'PRZ', before) {
  round({ target: 'Hearts', effect: 'chips', prize }, ['S_K'], seed);
  if (before) before();
  G.GAME.blind.chips = 1;
  play(1);
  if (state() !== 'ROUND_EVAL') throw new Error('not in cash-out: ' + state());
  return G.GAME.round_eval.rows.find((r) => r.name === 'page');
}
let row = win({ kind: 'money', amount: 4 });
ok(row && row.dollars === 4 && G.GAME.round_eval.total >= 4, '$4 prize: a cash-out row', row);
ok(!G.GAME.page, 'the Page ends with the round');
$0 = G.GAME.dollars; act({ type: 'cash_out' });
ok(G.GAME.dollars >= $0 + 4, 'paid at the cash-out');
row = win({ kind: 'card', set: 'Tarot', key: 'c_hermit' });
ok(row && G.consumeables.cards.some((c) => c.config.center.key === 'c_hermit'), 'The Hermit prize: in the consumable slots', row);
row = win({ kind: 'card', set: 'Spectral', key: 'c_ankh' }, 'PRZ', () => { G.consumeables.config.card_limit = 0; });
ok(row && row.dollars === P_CENTERS.c_ankh.cost && G.consumeables.cards.length === 0, 'no room: its price instead', row);
row = win({ kind: 'pack', key: 'p_standard_mega_1' });
ok(row && row.dollars === 0, 'pack prize: a row');
act({ type: 'cash_out' });
ok(state() === 'STANDARD_PACK' && G.pack_cards.cards.length === 5 && G.GAME.pack_choices === 2, 'the Mega Standard Pack opens after the cash-out', [state(), G.pack_cards.cards.length]);
ok(act({ type: 'skip_booster' }).ok && state() === 'SHOP' && G.shop_jokers.cards.length > 0, 'then the shop');
// no prize when the run was saved (Mr. Bones) or lost
round({ target: 'Hearts', effect: 'chips', prize: { kind: 'money', amount: 5 } }, ['S_K']);
add_joker('j_mr_bones'); E_MANAGER.flush();
G.GAME.blind.chips = 40; G.GAME.current_round.hands_left = 1; play(1);
ok(state() === 'ROUND_EVAL' && !G.GAME.round_eval.rows.some((r) => r.name === 'page'), 'saved by Mr. Bones: no prize', state());
round({ target: 'Hearts', effect: 'chips', prize: { kind: 'money', amount: 5 } }, ['S_K']);
G.GAME.blind.chips = 1e6; G.GAME.current_round.hands_left = 1; play(1);
ok(state() === 'GAME_OVER', 'lost on that Blind: game over, no prize');
// next-shop prizes
function shopWith(perk, seed = 'SHP') {
  win(perk ? { kind: 'shop', perk } : { kind: 'money', amount: 1 }, seed);
  act({ type: 'cash_out' });
  return G.STATE === STATES.SHOP;
}
shopWith(null);
const plain = [...G.shop_jokers.cards, ...G.shop_vouchers.cards, ...G.shop_booster.cards].map((c) => [c.config.center.key, c.cost]);
const plainReroll = G.GAME.current_round.reroll_cost;
ok(shopWith('half_off'), 'half off: shop');
const half = [...G.shop_jokers.cards, ...G.shop_vouchers.cards, ...G.shop_booster.cards].map((c) => [c.config.center.key, c.cost]);
ok(JSON.stringify(half.map((x) => x[0])) === JSON.stringify(plain.map((x) => x[0])), 'the same shop (the prize rolls nothing)');
ok(half.every((x, i) => x[1] === Math.max(1, Math.floor((plain[i][1] + 0.5) / 2)) || x[1] === Math.max(1, Math.floor(plain[i][1] / 2))), 'everything half off', { plain, half });
ok(G.GAME.current_round.reroll_cost === plainReroll, 'rerolls are not half off');
G.GAME.dollars = 100;
act({ type: 'next_round' });
ok(!G.GAME.page_half_off, 'half off ends with the shop');
act({ type: 'select_blind' }); act({ type: 'pick_page', index: 0 });
ok(G.GAME.page && state() === 'SELECTING_HAND', 'the next blind has Pages again');
ok(shopWith('rerolls') && G.GAME.current_round.free_rerolls === 3 && G.GAME.current_round.reroll_cost === 0, '3 free rerolls', G.GAME.current_round.free_rerolls);
G.GAME.dollars = 0;
for (let i = 0; i < 3; i++) ok(act({ type: 'reroll_shop' }).ok, 'a free reroll');
ok(!act({ type: 'reroll_shop' }).ok, 'then they cost again');
win({ kind: 'shop', perk: 'rerolls' }, 'SHP', () => { add_joker('j_chaos'); E_MANAGER.flush(); });
act({ type: 'cash_out' });
ok(G.GAME.current_round.free_rerolls === 4, 'stacks with Chaos the Clown', G.GAME.current_round.free_rerolls);
for (const seed of ['NEG1', 'NEG2', 'NEG3', 'NEG4']) {
  shopWith('negative', seed);
  ok(G.shop_jokers.cards.some((c) => c.ability.set === 'Joker' && c.edition && c.edition.negative), 'a Negative Joker in the next shop: ' + seed);
}
shopWith('negative', 'NEG1'); const n1 = G.shop_jokers.cards.map((c) => c.config.center.key + (c.edition ? c.edition.type : '')).join();
shopWith('negative', 'NEG1'); ok(n1 === G.shop_jokers.cards.map((c) => c.config.center.key + (c.edition ? c.edition.type : '')).join(), 'seeded');

// ------------------------------------------------------------------ save / resume / replay
const s = new Session(); s.start({ seed: 'RESUME' });
ok(s.recipe.engineRev === REV, 'a new run records the engine rev');
s.act({ type: 'select_blind' });
const want = JSON.stringify(s.view().pages);
const back = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe)));
ok(back.view().state === 'PAGES' && JSON.stringify(back.view().pages) === want, 'resume mid-Pages: the same 3 Pages');
ok(back.act({ type: 'pick_page', index: 1 }).ok && back.view().page && back.view().state === 'SELECTING_HAND', 'and the pick works after the resume');
const st = Session.stepper(back.recipe); st.seek(1);
ok(st.view().state === 'PAGES' && JSON.stringify(st.view().pages) === want, 'the replay shows the same Pages');
st.seek(2); ok(st.view().state === 'SELECTING_HAND' && st.view().page, 'and the pick');
// an old recipe (engine rev 1) never sees Pages and asks nothing
const old = { ...JSON.parse(JSON.stringify(back.recipe)), engineRev: 1, actions: [{ type: 'select_blind' }] };
const o = Session.fromRecipe(old);
ok(o.view().state === 'SELECTING_HAND' && !o.view().pages_on, 'a rev-1 recipe replays without Pages');
ok(!Session.pinDiff(old).some((d) => d.engine), 'a rev-1 recipe: no "versions changed" for the engine (Pages are gated)');
ok(PINS.startEngineRev({ ...old, engineRev: 2, repinned: [{ at: 3, from: {}, engineRev: 1 }] }) === 1, 'a re-pinned old run keeps its starting rev');
ok(Session.pinDiff({ ...old, engineRev: REV + 1 }).some((d) => d.engine), 'a future ungated rev still differs');

console.log(`pages: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
