// Micatro Pages, engine rules rev 4 (owner, 2026-11-08): every Pages screen offers AT LEAST ONE Page with NO prize in the FAIR tier
// (difficulty 50 .. 79). The 3 Pages roll exactly as on rev 3; when none qualifies, one slot is adjusted from its own seeded stream
// (engine/pages.js ensureFairSafe). Checks: thousands of seeded screens (vanilla + Pokermon) all have one, every Page still obeys
// the offer's rules, at most one slot differs from rev 3 (and none when rev 3 already had one), a rev-3 run never gets the guarantee,
// the safe Page plays (its required score lands on the Blind), save / resume re-simulates it; prints how the Round-rule and prize
// shares shift.
//   node micatro/tests/pages_fair_test.mjs
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
const { newRun, act, G, STATE_NAMES } = await import('../js/engine/run.js');
const P = await import('../js/engine/pages.js');
const { Session } = await import('../js/engine/session.js');
const PINS = await import('../js/mods/pins.js');

let fails = 0, passes = 0;
function ok(cond, msg, extra) {
  if (cond) { passes++; } else { fails++; if (fails < 40) console.log('FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); }
}
const state = () => STATE_NAMES[G.STATE];
P.PAGE_ODDS.chance = 1; // (every Blind gets its Pages screen here)

ok(P.PAGES_FAIR_REV === 4 && PINS.ENGINE_CONTENT_REV === 4 && PINS.GATED_ENGINE_REVS.includes(4) && PINS.engineRevCompatible(3) && PINS.engineRevCompatible(2), 'engine rev 4, gated (rev 2 / 3 recipes replay without a prompt)');
ok(P.FAIR_MIN === 50 && P.FAIR_MAX === 79 && P.tierOfV2(50).tier === 2 && P.tierOfV2(79).tier === 2, 'Fair = difficulty 50 .. 79');

function offer(seed, which, rev, mods) {
  newRun({ seed, engineRev: rev, ...(mods ? { mods } : {}) });
  const settle = () => { while (/_PACK/.test(state())) act({ type: 'skip_booster' }); };
  if (which !== 'Small') { act({ type: 'skip_blind' }); settle(); if (which === 'Boss') { act({ type: 'skip_blind' }); settle(); } }
  act({ type: 'select_blind' });
  if (state() !== 'PAGES') throw new Error('no Pages screen: ' + state());
  return JSON.parse(JSON.stringify(G.GAME.pages.choices));
}
const keyOf = (p) => JSON.stringify(p);

// ---- the rev gate
newRun({ seed: 'FAIRGATE', engineRev: 3 });
ok(G.GAME.pages_v2 === true && !('pages_fair' in G.GAME), 'a rev-3 run: Pages v2, no fair-safe flag (its game object is what it was)');
newRun({ seed: 'FAIRGATE', engineRev: 4 });
ok(G.GAME.pages_v2 === true && G.GAME.pages_fair === true, 'a rev-4 run: the fair-safe guarantee');
newRun({ seed: 'FAIRGATE' });
ok(!G.GAME.pages_on && !G.GAME.pages_fair, 'legacy rules (no rev): no Pages');

// ---- thousands of seeded screens
const stats = { 3: { pages: 0, rule: 0, prize: 0, safe: 0, screens: 0 }, 4: { pages: 0, rule: 0, prize: 0, safe: 0, screens: 0 } };
let adjusted = 0, adjustedInPlace = 0, rerolled = 0, rev3Lacking = 0;
function screen(seed, which, mods) {
  const o3 = offer(seed, which, 3, mods), o4 = offer(seed, which, 4, mods);
  for (const [rev, o] of [[3, o3], [4, o4]]) {
    const s = stats[rev]; s.screens++;
    if (o.some(P.isFairSafe)) s.safe++;
    for (const p of o) { s.pages++; if (p.rule) s.rule++; if (p.prize.kind !== 'none') s.prize++; }
  }
  ok(o4.length === 3 && o4.some(P.isFairSafe), 'every rev-4 screen has a no-prize Fair Page', { seed, which, o4 });
  ok(new Set(o4.map((p) => p.target + '|' + p.effect)).size === 3, 'rev 4: three distinct target / effect pairs', o4);
  for (const p of o4) {
    ok(p.v === 2 && P.comboOk(p.target, p.effect, p.rule), 'rev 4: an allowed target / effect / rule', p);
    ok(P.PAGE_PCTS_V2.includes(p.roll) && p.value === P.prizeValue(p.prize) && p.pct === p.roll + p.value, 'rev 4: required score = the roll + the prize\'s value', p);
    ok(p.difficulty === P.difficultyOfV2(p.effect, p.pct, p.rule) && p.tier === P.tierOfV2(p.difficulty).tier, 'rev 4: difficulty + tier label from the total', p);
    if (P.LOW_PCTS.includes(p.roll)) ok(P.effectWeight(p.effect) > 0 || (p.rule && P.ROUND_RULES[p.rule].d > 0), 'rev 4: -15% / -20% only with a downside or a harder rule', p);
    if (P.LEGENDARY_PCTS.includes(p.roll)) ok(!p.rule || P.ROUND_RULES[p.rule].d > 0, 'rev 4: a Legendary roll never has an easier rule', p);
    if (p.target === 'rank' || p.target === 'single') ok(p.rank >= 2 && p.rank <= 14, 'rev 4: a rank', p);
    if (p.target === 'nature') ok(p.ranks && p.ranks.length === 3, 'rev 4: a Nature', p);
    if (p.effect === 'become') ok(P.BECOME_ENH.includes(p.enh), 'rev 4: become names an enhancement', p);
  }
  const diff = o3.map((p, i) => keyOf(p) !== keyOf(o4[i]));
  const nDiff = diff.filter(Boolean).length;
  if (o3.some(P.isFairSafe)) ok(nDiff === 0, 'rev 3 already had a no-prize Fair Page: rev 4 offers the same 3 Pages', { seed, which });
  else {
    rev3Lacking++;
    ok(nDiff === 1, 'rev 3 had none: rev 4 changes exactly one slot (the other two untouched)', { seed, which, nDiff });
    if (nDiff === 1) {
      adjusted++;
      const i = diff.indexOf(true), a = o3[i], b = o4[i];
      ok(P.isFairSafe(b), 'the changed slot is the no-prize Fair Page', b);
      if (a.target === b.target && a.effect === b.effect && a.prize.kind === 'none') adjustedInPlace++; else rerolled++;
    }
  }
}
const N = 1800;
for (let i = 0; i < N; i++) screen('FAIR' + i, ['Small', 'Big', 'Boss'][i % 3]);
for (let i = 0; i < 300; i++) screen('FAIRPK' + i, ['Small', 'Big', 'Boss'][i % 3], ['pokermon']);
const pc = (a, b) => (a / b * 100).toFixed(1) + '%';
ok(rev3Lacking > 100, 'the guarantee has teeth: many rev-3 screens lack a no-prize Fair Page', rev3Lacking);
ok(stats[4].safe === stats[4].screens, 'all rev-4 screens have one', stats[4]);
console.log(`  screens: ${stats[3].screens}; with a no-prize Fair Page: rev 3 ${pc(stats[3].safe, stats[3].screens)}, rev 4 ${pc(stats[4].safe, stats[4].screens)}`);
console.log(`  adjusted: ${adjusted} screens (${pc(adjusted, stats[4].screens)}): ${adjustedInPlace} a no-prize Page re-rolled its roll / rule in place, ${rerolled} a slot re-rolled whole`);
console.log(`  Round rule: rev 3 ${pc(stats[3].rule, stats[3].pages)} -> rev 4 ${pc(stats[4].rule, stats[4].pages)}; prize: rev 3 ${pc(stats[3].prize, stats[3].pages)} -> rev 4 ${pc(stats[4].prize, stats[4].pages)}`);
ok(Math.abs(stats[3].rule / stats[3].pages - 0.30) < 0.025 && Math.abs(stats[3].prize / stats[3].pages - 0.5) < 0.03, 'rev 3 shares unchanged (30% rule, 50% prize)');
ok(stats[4].prize < stats[3].prize, 'rev 4: a few fewer prizes (a re-rolled slot never has one)');
// (the shifts: the safe Page keeps a Round rule on the same 30% roll whenever it can -> ~31%; a screen whose 3 Pages all had a prize
// (1 in 8) loses one -> ~45% prizes)
ok(Math.abs(stats[4].rule / stats[4].pages - 0.30) < 0.03, 'rev 4: Round rules stay ~30% of Pages', stats[4].rule / stats[4].pages);
ok(Math.abs(stats[4].prize / stats[4].pages - 0.4583) < 0.03, 'rev 4: prizes on ~46% of Pages (50% less one prize on the all-prize screens)', stats[4].prize / stats[4].pages);

// ---- fairOptions: every option it gives lands in Fair, under the offer's rules
for (const t of P.TARGET_KEYS_V2) for (const e of P.EFFECT_KEYS_V2) {
  if (!P.comboOk(t, e)) continue;
  for (const o of P.fairOptions(t, e)) {
    const d = P.difficultyOfV2(e, o.pct, o.rule);
    ok(d >= 50 && d <= 79 && !P.LEGENDARY_PCTS.includes(o.pct) && (!o.rule || P.comboOk(t, e, o.rule)), 'fairOptions: a Fair, allowed option', { t, e, o });
  }
}

// ---- the safe Page plays: its total lands on the Blind; save / resume re-simulates the same offer + pick
{
  let found = null;
  for (let i = 0; i < 400 && !found; i++) {
    const o3 = offer('FAIRPLAY' + i, 'Small', 3), o4 = offer('FAIRPLAY' + i, 'Small', 4);
    if (!o3.some(P.isFairSafe)) found = { seed: 'FAIRPLAY' + i, o4 };
  }
  ok(!!found, 'found a screen the guarantee adjusted');
  if (found) {
    const s = new Session();
    s.start({ seed: found.seed, engineRev: 4 });
    s.act({ type: 'select_blind' });
    ok(state() === 'PAGES' && keyOf(G.GAME.pages.choices) === keyOf(found.o4), 'a Session run offers the same rev-4 screen');
    const idx = G.GAME.pages.choices.findIndex(P.isFairSafe);
    const page = G.GAME.pages.choices[idx];
    const base = 300; // (ante 1 Small Blind, white stake)
    const r = s.act({ type: 'pick_page', index: idx });
    ok(r.ok && state() === 'SELECTING_HAND', 'took the no-prize Fair Page', r);
    ok(Number(G.GAME.blind.chips) === Math.floor(base * (1 + page.pct / 100)) || Math.abs(Number(G.GAME.blind.chips) - base * (1 + page.pct / 100)) <= 1, 'its required score lands on the Blind', { chips: Number(G.GAME.blind.chips), pct: page.pct });
    ok(G.GAME.page && G.GAME.page.prize.kind === 'none', 'no prize waits for the cash-out', G.GAME.page);
    const recipe = JSON.parse(JSON.stringify(s.recipe));
    const chips = Number(G.GAME.blind.chips);
    const s2 = Session.fromRecipe(recipe);
    ok(s2 && keyOf(G.GAME.page) === keyOf(page) && Number(G.GAME.blind.chips) === chips, 'resume re-simulates the same Page and Blind');
    const s3 = Session.fromRecipe({ ...recipe, engineRev: 3 });
    ok(s3 && keyOf(G.GAME.page) !== keyOf(page), 'the same moves on rev 3 take rev 3\'s Page (the guarantee is rev-4 only)');
  }
}

console.log(`pages fair: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
