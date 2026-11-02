// The owner's Yamask nerf (contentRev 58; jokers/pokejokers_designs.js grudge / mummy_sell; PORTING.md "The Yamask nerf"). Testers: Yamask
// grew without limit (sell any number of cheap / free Jokers) and Mummy gave a free Negative Joker every round. Now:
//   - Yamask's X grows from the FIRST 1 Joker sold each round, Cofagrigus's from the first 2 (X0.1 / X0.2 unchanged). "Round" =
//     G.GAME.round (a Blind and the shop after it). Per card: grudge_round + grudge_count, carried through the evolution (a Yamask that
//     banked its 1 evolves into a Cofagrigus with 1 left that round). A sale Mummy catches uses one up.
//   - Mummy: once an ANTE (G.GAME.poke_mummy_ante); it re-arms when the Boss is beaten (the shop after the Boss is the next Ante's).
//   - Tooltips: "(Grudges left this round: n/cap)", "(Mummy: ready / used this Ante)".
//   - Never retroactive: an r57 recipe re-plays its moves on the r57 rules (js/mods/pins.js RULES), so its banked X stays; fixture
//     micatro/tests/fixtures/pokermon_yamask_r57_recipe.json (recorded on r57: 4 Jokers sold in one round, Yamask X1.4, Cofagrigus X1.8).
// Every rule is FIRED through real sales / rounds / resumes.
//   node micatro/tests/mods/pokermon_yamask_nerf_test.mjs
import { readFileSync } from 'fs';
import { T, start, add, clearHand, hand, G, act, state, STATES } from './poke_helpers.mjs';
import { add_joker } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { energy_values, increment_energy } from '../../mods/pokermon/systems/energy.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 700)); } };
const ex = (j) => j.ability.extra;
const X = (j) => ex(j).grudge_Xmult;
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const left = (j) => { const m = /Grudges left this round: (\d+)\/(\d+)/.exec(plain(j)); return m ? `${m[1]}/${m[2]}` : null; };
const COUNTS = {};
function endRound() { clearHand(); const c = hand(['S_2']); G.GAME.chips = G.GAME.blind.chips; if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2; act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush(); }
const toShop = () => { endRound(); if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' }); flush(); };
function nextBlind() { if (G.STATE === STATES.SHOP) act({ type: 'next_round' }); G.GAME.round_resets.blind_choices.Boss = 'bl_wall'; act({ type: 'select_blind' }); flush(); clearHand(); }
function sell(j) { const r = act({ type: 'sell', id: j.sort_id }); flush(); return r; }
const sellN = (n) => { const out = []; for (let i = 0; i < n; i++) { const j = add('j_joker'); sell(j); out.push(j); } return out; };

await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 58 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 58 or later (r59 the legendary solo rule)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  ok(!('grudge_round' in energy_values) && !('grudge_count' in energy_values) && !('grudge_Xmult' in energy_values), 'grudge_round / grudge_count / grudge_Xmult are no energy fields');
});

// ------------------------------------------------------------------- the cap: several Jokers sold in one round
await sec('yamask cap', () => {
  start('YNERF1');
  const y = add('j_poke_yamask');
  ok(left(y) === '1/1', 'Yamask tooltip before any sale: (Grudges left this round: 1/1)', plain(y));
  const sold = sellN(4);
  COUNTS.yamask4 = X(y);
  ok(sold.every((j) => !G.jokers.cards.includes(j)), '4 Jokers sold (all paid as usual)');
  ok(near(X(y), 1.1), 'Yamask: 4 Jokers sold in one round -> only the first grows it: X1.1 (was X1.4)', X(y));
  ok(left(y) === '0/1', '... tooltip: (Grudges left this round: 0/1)', plain(y));
  ok(/Gains X0\.1 Mult for the \| first Joker you sell each round/.test(plain(y)), 'Yamask text: "Gains X0.1 Mult for the first Joker you sell each round"', plain(y));
  // the shop after it is the same round: still capped
  toShop();
  ok(state() === 'SHOP', 'in the shop');
  sellN(2);
  ok(near(X(y), 1.1) && left(y) === '0/1', 'the shop after the Blind is the same round: still capped (X1.1)', [X(y), left(y)]);
  // the next Blind re-arms
  nextBlind();
  ok(left(y) === '1/1', 'the next Blind: (Grudges left this round: 1/1) again', plain(y));
  sellN(3);
  COUNTS.yamaskRound2 = X(y);
  ok(near(X(y), 1.2), 'round 2: 3 sold, +X0.1 once: X1.2', X(y));
  // a Blind with no sale: its shop's first sale counts
  toShop(); sellN(2);
  ok(near(X(y), 1.2), 'the shop after round 2: still round 2, capped', X(y));
  nextBlind(); toShop(); sellN(2);
  ok(near(X(y), 1.3), 'a Blind with no sale: the first sale in its shop counts (X1.3), the second doesn\'t', X(y));
  // scores what it banked
  nextBlind();
  clearHand(); const c = hand(['S_A']); G.GAME.chips = 0; G.GAME.blind.chips = 1e15; G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); const r = act({ type: 'play' }); flush();
  const tot = (r.events || []).find((e) => e.type === 'hand_total') || {};
  ok(near(Number(tot.mult), 1.3), 'High Card: Mult 1 x X1.3', tot);
});

await sec('cofagrigus cap + Mummy', () => {
  start('YNERF2');
  const cof = add('j_poke_cofagrigus');
  ok(left(cof) === '2/2' && /Mummy: ready/.test(plain(cof)), 'Cofagrigus tooltip: (Grudges left this round: 2/2), (Mummy: ready)', plain(cof));
  ok(/Gains X0\.2 Mult for each of \| the first 2 Jokers you sell \| each round/.test(plain(cof)) && /sell each Ante is not sold/.test(plain(cof)), 'Cofagrigus text: first 2 Jokers each round; Mummy each Ante', plain(cof));
  const js = [add('j_joker'), add('j_joker'), add('j_joker'), add('j_joker'), add('j_joker')];
  sell(js[0]);
  ok(G.jokers.cards.includes(js[0]) && js[0].edition && js[0].edition.negative, 'Mummy: the first sale stays, Negative', js[0].edition);
  ok(near(X(cof), 1.2) && left(cof) === '1/2' && /Mummy: used this Ante/.test(plain(cof)), '... and uses one of the round\'s 2: X1.2, 1/2 left, Mummy used this Ante', [X(cof), plain(cof)]);
  for (const j of js.slice(1)) sell(j);
  sell(js[0]); // the mummified one, sold now (Negative: sells as usual)
  COUNTS.cofagrigus6 = X(cof);
  ok(near(X(cof), 1.4) && left(cof) === '0/2', 'Cofagrigus: 6 sales in one round (1 mummified) -> 2 count: X1.4 (was X2.2)', [X(cof), left(cof)]);
  // Mummy once an Ante: rounds 2 and 3 (Big Blind, Boss) of Ante 1 have none
  toShop(); nextBlind();
  ok(G.GAME.round_resets.ante === 1 && left(cof) === '2/2' && /Mummy: used this Ante/.test(plain(cof)), 'round 2 (Ante 1): 2/2 grudges again, Mummy still used', plain(cof));
  const b1 = add('j_joker'); sell(b1);
  ok(!G.jokers.cards.includes(b1) && near(X(cof), 1.6), 'round 2: the first sale is a real sale (no Mummy), and grows it: X1.6', [G.jokers.cards.includes(b1), X(cof)]);
  toShop(); const b2 = add('j_joker'); sell(b2);
  ok(!G.jokers.cards.includes(b2) && near(X(cof), 1.8) && left(cof) === '0/2', 'its shop: sold, the 2nd grudge: X1.8, 0/2', [X(cof), left(cof)]);
  nextBlind(); const b3 = add('j_joker'); sell(b3);
  ok(G.GAME.blind && G.GAME.round_resets.ante === 1 && !G.jokers.cards.includes(b3), 'the Boss Blind (Ante 1): no Mummy', G.GAME.round_resets.ante);
  COUNTS.mummiesAnte1 = 1 + [b1, b2, b3].filter((j) => G.jokers.cards.includes(j)).length; // (js[0] + any later one that stayed)
  // the Boss beaten: the shop is Ante 2: Mummy re-armed
  toShop();
  ok(G.GAME.round_resets.ante === 2 && /Mummy: ready/.test(plain(cof)), 'the shop after the Boss is Ante 2: (Mummy: ready)', [G.GAME.round_resets.ante, plain(cof)]);
  const b4 = add('j_joker'); sell(b4);
  ok(G.jokers.cards.includes(b4) && b4.edition && b4.edition.negative, '... its first sale is mummified', b4.edition);
  const b5 = add('j_joker'); sell(b5);
  ok(!G.jokers.cards.includes(b5), '... once', G.jokers.cards.includes(b5));
  // a Negative Joker sold first uses the Ante's Mummy up
  nextBlind(); toShop(); nextBlind(); toShop(); nextBlind(); toShop(); // Ante 2's Small, Big and Boss
  ok(G.GAME.round_resets.ante === 3 && /Mummy: ready/.test(plain(cof)), 'Ante 3 (the shop after Ante 2\'s Boss): ready', [G.GAME.round_resets.ante, plain(cof)]);
  const neg = add('j_joker', 'negative'); sell(neg);
  ok(!G.jokers.cards.includes(neg) && /Mummy: used this Ante/.test(plain(cof)), 'an already Negative Joker sells as usual and uses the Ante\'s Mummy up', plain(cof));
  const b6 = add('j_joker'); sell(b6);
  ok(!G.jokers.cards.includes(b6), '... the next sale is a sale', G.jokers.cards.includes(b6));
});

await sec('the line together + Blueprint', () => {
  start('YNERF3');
  const y = add('j_poke_yamask'), cof = add('j_poke_cofagrigus');
  const v = add('j_joker'); sell(v);
  ok(G.jokers.cards.includes(v) && near(X(y), 1.1) && near(X(cof), 1.2) && left(y) === '0/1' && left(cof) === '1/2', 'a mummified Joker uses one grudge on each: Yamask 0/1, Cofagrigus 1/2', [X(y), X(cof)]);
  sellN(3);
  ok(near(X(y), 1.1) && near(X(cof), 1.4), '3 more sales: Yamask stays X1.1, Cofagrigus X1.4', [X(y), X(cof)]);
  start('YNERF4');
  add('j_blueprint'); const y2 = add('j_poke_yamask');
  sellN(3);
  ok(near(X(y2), 1.1), 'a Blueprint copying Yamask neither banks nor adds a grudge: X1.1', X(y2));
});

// ------------------------------------------------------------------- evolution mid-round: no fresh allowance
await sec('evolution', () => {
  start('YNERF5');
  const y = add('j_poke_yamask');
  sellN(1);
  ok(near(X(y), 1.1) && left(y) === '0/1', 'Yamask banks its 1', X(y));
  ex(y).rounds = 1;
  toShop(); // evolves at the end of the round; the shop is the same round
  ok(key(y) === 'j_poke_cofagrigus', 'evolved into Cofagrigus at the end of the round', key(y));
  ok(near(X(y), 1.1) && ex(y).grudge_count === 1 && ex(y).grudge_round === G.GAME.round, 'X1.1 and this round\'s count (1) carried', ex(y));
  ok(left(y) === '1/2', '... so Cofagrigus has 1 left this round, not a fresh 2: (Grudges left this round: 1/2)', plain(y));
  sellN(3); // the first is mummified (Mummy ready) and uses that 1
  ok(near(X(y), 1.3) && left(y) === '0/2', 'the shop: one more grudge (X1.3), then capped: 2 in all that round', [X(y), left(y)]);
  nextBlind();
  ok(left(y) === '2/2', 'the next round: 2/2', plain(y));
  // Energy raises the gain, never the cap or the count
  const before = [ex(y).grudge_round, ex(y).grudge_count];
  increment_energy(y, 'Psychic'); flush();
  ok(near(ex(y).Xmult_mod, 0.24) && left(y) === '2/2' && ex(y).grudge_round === before[0] && ex(y).grudge_count === before[1], 'Energy: gain 0.24, cap 2, the count untouched', [ex(y).Xmult_mod, left(y), before, ex(y).grudge_count]);
});

// ------------------------------------------------------------------- save / resume (a run is its recipe)
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'YNERFRES', customDeck: { name: 'Grudge', mods: ['pokermon'], jokers: [{ key: 'j_poke_yamask' }, { key: 'j_poke_cofagrigus' }, { key: 'j_joker' }, { key: 'j_joker' }, { key: 'j_joker' }] } });
  s.act({ type: 'select_blind' }); flush();
  for (const j of G.jokers.cards.filter((c) => key(c) === 'j_joker')) { s.act({ type: 'sell', id: j.sort_id }); flush(); }
  const yk = () => G.jokers.cards.find((c) => key(c) === 'j_poke_yamask'), ck = () => G.jokers.cards.find((c) => key(c) === 'j_poke_cofagrigus');
  const live = [X(yk()), X(ck()), left(yk()), left(ck()), plain(ck())];
  ok(near(live[0], 1.1) && near(live[1], 1.4) && live[2] === '0/1' && live[3] === '0/2', 'live: 3 sold (1 mummified): Yamask X1.1, Cofagrigus X1.4', live);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  ok(!r.stoppedAt && Session.pinDiff(r.recipe).length === 0, 'resume: every move replays, no version prompt', r.stoppedAt);
  ok(near(X(yk()), 1.1) && near(X(ck()), 1.4) && left(yk()) === '0/1' && left(ck()) === '0/2' && /Mummy: used this Ante/.test(plain(ck())), 'resumed: the same X, the same grudges left, Mummy used this Ante', [X(yk()), X(ck()), plain(ck())]);
  const extra = add_joker('j_joker'); flush();
  r.act({ type: 'sell', id: extra.sort_id }); flush();
  ok(!G.jokers.cards.includes(extra) && near(X(yk()), 1.1) && near(X(ck()), 1.4), 'a sale after the resume: sold (no Mummy), and the cap still holds', [X(yk()), X(ck())]);
});

// ------------------------------------------------------------------- an r57 save: never retroactive
await sec('r57 recipe', () => {
  const FIX = JSON.parse(readFileSync(new URL('../fixtures/pokermon_yamask_r57_recipe.json', import.meta.url), 'utf8'));
  ok(FIX.modVersions.pokermon === '3.9.1+r57' && FIX.actions.filter((a) => a.type === 'sell').length === 4, 'the fixture: recorded on 3.9.1+r57, 4 Jokers sold in one round', FIX.modVersions);
  const diff = Session.pinDiff(FIX);
  ok(diff.length === 1 && diff[0].id === 'pokermon' && diff[0].recorded === '3.9.1+r57' && diff[0].current === PINS.modPin('pokermon'), 'the resume prompt names r57 -> the current pin', diff);
  const s = Session.fromRecipe(JSON.parse(JSON.stringify(FIX)), { repin: true }); flush();
  const yk = () => G.jokers.cards.find((c) => key(c) === 'j_poke_yamask'), ck = () => G.jokers.cards.find((c) => key(c) === 'j_poke_cofagrigus');
  COUNTS.r57 = [X(yk()), X(ck())];
  ok(!s.stoppedAt, '"Continue anyway": every r57 move replays', s.stoppedAt);
  ok(near(X(yk()), 1.4) && near(X(ck()), 1.8), 'the banked X is kept: Yamask X1.4, Cofagrigus X1.8 (as recorded on r57; the new rules would give X1.1 / X1.4)', COUNTS.r57);
  ok(s.recipe.modVersions.pokermon === PINS.modPin('pokermon') && s.recipe.repinned && s.recipe.repinned[0].from.pokermon === '3.9.1+r57' && s.recipe.repinned[0].at === FIX.actions.length, 're-pinned to r58 at the r57 moves\' end', s.recipe.repinned);
  ok(G.GAME.poke_mummy_round === G.GAME.round && G.GAME.poke_mummy_ante === undefined, 'the r57 Mummy wrote the old key (poke_mummy_round)', [G.GAME.poke_mummy_round, G.GAME.poke_mummy_ante]);
  ok(/Mummy: used this Ante/.test(plain(ck())) && left(yk()) === '0/1' && left(ck()) === '0/2', 'migrated: the old key reads as used this Ante; this round\'s grudges are used up (no fresh allowance mid-round)', [plain(ck())]);
  // live, on r58, in the same round: sell the Yamask itself (a recorded move)
  const y = yk();
  s.act({ type: 'sell', id: y.sort_id }); flush();
  ok(!G.jokers.cards.includes(y) && near(X(ck()), 1.8), 'a live r58 sale that round (the Yamask): sold (Mummy used), Cofagrigus does not grow (its grudges are used up)', [G.jokers.cards.includes(y), X(ck())]);
  // resume the re-pinned recipe again: the r57 moves still re-play on r57, the new one on r58
  const again = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  ok(!again.stoppedAt && Session.pinDiff(again.recipe).length === 0 && !yk() && near(X(ck()), 1.8), 'resumed again (no prompt): Cofagrigus still X1.8, the Yamask sold (moves before the re-pin on r57, after it on r58)', [again.stoppedAt, X(ck())]);
  // the replay viewer re-plays it the same way
  const st = Session.stepper(JSON.parse(JSON.stringify(s.recipe)));
  st.seek(st.total);
  ok(!st.error && st.index === s.recipe.actions.length && !yk() && near(X(ck()), 1.8), 'the replay stepper: X1.8 too', [st.error, X(ck())]);
  ok(PINS.RULES.pins === null && PINS.rulesRev('pokermon') === MODS.pokermon.contentRev, 'live play is back on the current rules (RULES cleared)', PINS.RULES.pins);
  // the fixture re-played on r58 rules from the start (no re-pin history; as if recorded on r58) shows what the gate prevents
  const asNew = { ...JSON.parse(JSON.stringify(FIX)), modVersions: { ...FIX.modVersions, pokermon: '3.9.1+r58' } };
  Session.fromRecipe(asNew); flush();
  COUNTS.r57AsR58 = [X(yk()), X(ck())];
  ok(near(X(yk()), 1.1) && near(X(ck()), 1.4), 'the same moves recorded on r58: Yamask X1.1, Cofagrigus X1.4 (the cap)', COUNTS.r57AsR58);
});

console.log('counts:', JSON.stringify(COUNTS));
done();
