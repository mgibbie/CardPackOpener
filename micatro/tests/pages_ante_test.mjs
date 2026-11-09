// Micatro Pages, engine rules rev 5 (owner, 2026-11-09): a Page EVERY ante. Small / Big still roll 25% (seeded); when neither had a
// Page — a SKIPPED Small / Big counts as no Page — that same ante's Boss Blind is guaranteed one; a Boss after a Page earlier in the
// ante still rolls 25%. The blind choice says "Page guaranteed this Boss" exactly while it is owed (view.page_pity). Multiplayer: a
// Nemesis Boss never has Pages, so it is never guaranteed one and nothing carries over (Showdown: the same). A rev-4 run keeps the
// old cross-ante pity timer (fuzz_pages_fair_test.mjs pins rev-4 runs byte for byte).
//   node micatro/tests/pages_ante_test.mjs
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
const { newRun, act, G, STATE_NAMES } = await import('../js/engine/run.js');
const { toView } = await import('../js/engine/view.js');
const P = await import('../js/engine/pages.js');
const PINS = await import('../js/mods/pins.js');
const { NEMESIS } = await import('../js/engine/pvp.js');
const { Session, viewChecksum } = await import('../js/engine/session.js');

let fails = 0, passes = 0;
function ok(cond, msg, extra) {
  if (cond) { passes++; } else { fails++; if (fails < 40) console.log('FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); }
}
const state = () => STATE_NAMES[G.STATE];
const REV = P.PAGES_ANTE_REV;
ok(REV === 5 && PINS.ENGINE_CONTENT_REV >= 5 && PINS.GATED_ENGINE_REVS.includes(5) && PINS.engineRevCompatible(4) && PINS.engineRevCompatible(3), 'engine rev 5, gated (rev 2..4 recipes replay without a prompt)');
ok(P.PAGE_ODDS.chance === 0.25, 'the roll is still 25%');

// ---- the rev gate
newRun({ seed: 'ANTEGATE', engineRev: 4 });
ok(G.GAME.pages_fair === true && !('pages_ante' in G.GAME), 'a rev-4 run: no per-ante flag (its game object is what it was)');
newRun({ seed: 'ANTEGATE', engineRev: REV });
ok(G.GAME.pages_v2 && G.GAME.pages_fair && G.GAME.pages_ante === true, 'a rev-5 run: the per-ante guarantee');

const settle = () => { while (/_PACK/.test(state())) act({ type: 'skip_booster' }); };
const pickQuiet = () => act({ type: 'pick_page', index: P.quietPageIndex(G.GAME.pages.choices) });
const winNow = () => { G.GAME.chips = Math.max(0, G.GAME.blind.chips - 1); act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] }); act({ type: 'play' }); };

/**
 * A bot plays real runs to ante `maxAnte` (each Blind won at once); `skipP` of the Small / Big Blinds are skipped (seeded per run).
 * Checks every Blind choice's hint and every ante's Page; -> counts.
 */
function playMany(prefix, runs, { rev = REV, skipP = 0, maxAnte = 6 } = {}) {
  const c = { sbSel: 0, sbPages: 0, skipped: 0, owed: 0, owedMissed: 0, bossFree: 0, bossFreePages: 0, antes: 0, antesNoPage: 0, hintWrong: 0 };
  for (let i = 0; i < runs; i++) {
    newRun({ seed: prefix + i, engineRev: rev });
    let rs = (i * 7919 + 13) % 1000 + 1; const rnd = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    const seen = {};
    for (let n = 0; n < 400 && G.GAME.round_resets.ante <= maxAnte && !G.GAME.over; n++) {
      const st = state();
      if (st === 'BLIND_SELECT') {
        const which = G.GAME.blind_on_deck, ante = G.GAME.round_resets.ante;
        const owed = rev >= REV ? !seen[ante] : ante > 1 && !seen[ante - 1] && !seen[ante];
        if (!!toView().page_pity !== owed) c.hintWrong++;
        if (which !== 'Boss' && skipP && rnd() < skipP) { act({ type: 'skip_blind' }); settle(); c.skipped++; continue; }
        act({ type: 'select_blind' });
        const got = state() === 'PAGES';
        if (which === 'Boss') {
          if (owed) { c.owed++; if (!got) c.owedMissed++; } else if (seen[ante]) { c.bossFree++; if (got) c.bossFreePages++; }
          c.antes++; if (!got && !seen[ante]) c.antesNoPage++;
        } else { c.sbSel++; if (got) c.sbPages++; }
        if (got) { seen[ante] = true; pickQuiet(); }
      } else if (st === 'SELECTING_HAND') winNow();
      else if (st === 'ROUND_EVAL') act({ type: 'cash_out' });
      else if (st === 'PAGE_REMOVE') act({ type: 'page_remove', id: G.playing_cards[0].sort_id });
      else if (/_PACK/.test(st)) act({ type: 'skip_booster' });
      else if (st === 'SHOP') act({ type: 'next_round' });
      else break;
    }
  }
  return c;
}

// ---- many seeded runs: every ante has a Page; Small / Big ~25%; a Boss after a Page ~25%; the hint exactly when owed
{
  const c = playMany('ANTEODDS', 150);
  const sb = c.sbPages / c.sbSel, bf = c.bossFreePages / c.bossFree;
  console.log(`  rev 5, every Blind played: ${c.antes} antes, ${c.antesNoPage} without a Page; Small/Big Pages ${(sb * 100).toFixed(1)}% of ${c.sbSel}; ` +
    `guaranteed Bosses ${c.owed} (${(c.owed / c.antes * 100).toFixed(1)}% of antes); Boss after a Page: Pages ${(bf * 100).toFixed(1)}% of ${c.bossFree}; ` +
    `Pages per ante ${((c.sbPages + c.bossFreePages + c.owed) / c.antes).toFixed(2)}`);
  ok(c.antes > 600 && c.antesNoPage === 0, 'every ante with a Boss shows at least one Page', c);
  ok(c.owed > 300 && c.owedMissed === 0, 'a Boss after a Page-less Small + Big always gets one', c);
  ok(Math.abs(sb - 0.25) < 0.04, 'Small / Big Pages still ~25%', sb);
  ok(Math.abs(bf - 0.25) < 0.08, 'a Boss after a Page this ante still rolls ~25%', bf);
  ok(c.hintWrong === 0, '"Page guaranteed this Boss" shows exactly while owed (the current ante)', c.hintWrong);
}
// ---- skipped Small / Big count as "no Page"
{
  const c = playMany('ANTESKIP', 100, { skipP: 0.5 });
  console.log(`  rev 5, half the Small/Big skipped: ${c.antes} antes, ${c.antesNoPage} without a Page, ${c.skipped} skips, guaranteed Bosses ${c.owed}`);
  ok(c.skipped > 300 && c.antes > 400 && c.antesNoPage === 0 && c.owedMissed === 0 && c.hintWrong === 0, 'skipping Small / Big: the Boss is still guaranteed its Page', c);
  // skip both -> the Boss is owed
  newRun({ seed: 'ANTESKIP2', engineRev: REV });
  act({ type: 'skip_blind' }); settle(); act({ type: 'skip_blind' }); settle();
  ok(G.GAME.blind_on_deck === 'Boss' && toView().page_pity === true, 'both skipped: the blind choice says "Page guaranteed this Boss"');
  act({ type: 'select_blind' });
  ok(state() === 'PAGES', 'both skipped: the Boss opens the Pages screen');
}
// ---- rev 4 keeps the old pity timer (ante 1's Boss is never guaranteed; a whole quiet ante owes the NEXT Boss)
{
  const c = playMany('ANTEODDS', 150, { rev: 4 });
  console.log(`  rev 4 (old pity timer), same seeds: ${c.antes} antes, ${c.antesNoPage} without a Page, pity Bosses ${c.owed}`);
  ok(c.antesNoPage > 50 && c.owedMissed === 0 && c.hintWrong === 0, 'rev 4: antes without a Page still happen; its pity Bosses + hint as before', c);
  // a seed whose ante-1 Boss rolls no Page on rev 4 (Small + Big skipped) gets the ante-1 Boss Page on rev 5
  let seed = null;
  for (let i = 0; i < 400 && !seed; i++) {
    newRun({ seed: 'ANTEONE' + i, engineRev: 4 });
    act({ type: 'skip_blind' }); settle(); act({ type: 'skip_blind' }); settle();
    const hint = toView().page_pity;
    act({ type: 'select_blind' });
    if (state() !== 'PAGES' && !hint) seed = 'ANTEONE' + i;
  }
  ok(!!seed, 'found a seed with no ante-1 Boss Page on rev 4');
  newRun({ seed, engineRev: REV });
  act({ type: 'skip_blind' }); settle(); act({ type: 'skip_blind' }); settle(); act({ type: 'select_blind' });
  ok(state() === 'PAGES', 'the same seed on rev 5: the ante-1 Boss gets its Page', seed);
}
// ---- save / resume re-simulates a guaranteed Boss's Pages screen exactly
{
  const s = new Session();
  s.start({ seed: 'ANTERESUME' });
  ok(G.GAME.pages_ante === true, 'a new Session plays rev 5');
  s.act({ type: 'skip_blind' }); while (/_PACK/.test(state())) s.act({ type: 'skip_booster' });
  s.act({ type: 'skip_blind' }); while (/_PACK/.test(state())) s.act({ type: 'skip_booster' });
  s.act({ type: 'select_blind' });
  ok(state() === 'PAGES', 'Session: the guaranteed Boss Pages screen');
  const cs = viewChecksum(toView());
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe)));
  ok(!r.stoppedAt && state() === 'PAGES' && viewChecksum(toView()) === cs, 'resume lands on the same Pages screen');
}
// ---- Multiplayer: a Nemesis Boss is never guaranteed (no hint, nothing carried); Showdown the same
{
  const CFG = { lives: 4, pvpStart: 2, deathOnLoss: true, comeback: true };
  const toBoss = () => { act({ type: 'skip_blind' }); settle(); act({ type: 'skip_blind' }); settle(); };
  newRun({ seed: 'ANTEPVP1', engineRev: REV, pvp: CFG });
  toBoss();
  ok(G.GAME.round_resets.blind_choices.Boss !== NEMESIS && toView().page_pity === true, 'PvP ante 1 (a normal Boss): guaranteed as in solo');
  act({ type: 'select_blind' });
  ok(state() === 'PAGES', 'PvP ante 1: the Boss opens its Pages screen');
  pickQuiet(); winNow(); act({ type: 'cash_out' }); settle(); act({ type: 'next_round' });
  ok(G.GAME.round_resets.ante === 2 && G.GAME.round_resets.blind_choices.Boss === NEMESIS, 'PvP ante 2: the Boss is the Nemesis', state());
  ok(!toView().page_pity && !P.pageGuaranteed('Boss'), 'PvP: no "Page guaranteed" for a Nemesis Boss (even before the Small Blind)');
  toBoss();
  ok(G.GAME.blind_on_deck === 'Boss' && !toView().page_pity && !P.pageGuaranteed('Boss'), 'PvP: Small + Big skipped, still no guarantee on the Nemesis');
  ok(act({ type: 'pvp_start_blind' }).ok && state() === 'SELECTING_HAND' && !G.GAME.page, 'PvP: no Pages screen on the Nemesis');
  // Showdown from ante 2: ante 1 normal (guaranteed); from ante 2 every slot is the Nemesis (never)
  newRun({ seed: 'ANTESHOW1', engineRev: REV, pvp: { ...CFG, mode: 'showdown', showdownStart: 2 } });
  toBoss();
  ok(toView().page_pity === true, 'Showdown ante 1 (normal blinds): the Boss is guaranteed');
  act({ type: 'select_blind' }); ok(state() === 'PAGES', 'Showdown ante 1: its Pages screen');
  pickQuiet(); winNow(); act({ type: 'cash_out' }); settle(); act({ type: 'next_round' });
  ok(G.GAME.round_resets.ante === 2 && G.GAME.round_resets.blind_choices.Small === NEMESIS && G.GAME.round_resets.blind_choices.Boss === NEMESIS, 'Showdown ante 2: all Nemesis', state());
  ok(!toView().page_pity && !P.pageGuaranteed('Boss'), 'Showdown: a Nemesis Boss is never guaranteed');
}

console.log(`pages ante: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
