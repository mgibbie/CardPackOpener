// Run replays (micatro/js/engine/session.js ReplayStepper + micatro/js/replays.js): a finished
// run's recipe re-simulated action by action reproduces EXACTLY what the player saw — every view
// and every UI event — for a vanilla run, a modded run (Pokermon), and a custom-deck run that won
// and went on into Endless. The stored meta checksum matches the rebuild; a tampered or "older"
// recipe is detected; seeking backward lands on the same view as stepping forward; the share code
// round-trips; the local list keeps the newest 10, extends a run's entry instead of duplicating it,
// and evicts the oldest when storage is full.
//   node micatro/tests/replay_test.mjs
const mem = new Map();
let quota = Infinity;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { v = String(v); const used = [...mem].reduce((a, [kk, vv]) => a + (kk === k ? 0 : vv.length), 0); if (used + v.length > quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } mem.set(k, v); },
  removeItem: (k) => { mem.delete(k); },
};

const { Session, ReplayStepper, viewChecksum, INSTANT_ACTIONS } = await import('../js/engine/session.js');
const RP = await import('../js/replays.js');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log('FAIL', m, extra != null ? extra : ''); } };

const { playRun } = await import('./replay_bot.mjs');

/** Step a recipe and compare against the live frames, action for action. */
function verifyRecipe(tag, run) {
  const st = Session.stepper(run.recipe);
  ok(st instanceof ReplayStepper && st.total === run.recipe.actions.length, `${tag}: a stepper over ${run.recipe.actions.length} actions`);
  ok(JSON.stringify(st.view()) === run.frames[0].view, `${tag}: the stepper's first view is the run's first view`);
  ok(JSON.stringify(st.startEvents) === run.frames[0].events, `${tag}: run-start events match`);
  let mism = -1;
  for (let i = 1; i < run.frames.length; i++) {
    const r = st.step();
    if (!r || !r.ok || JSON.stringify(st.view()) !== run.frames[i].view || JSON.stringify(r.events) !== run.frames[i].events) { mism = i; break; }
  }
  ok(mism === -1, `${tag}: every view + every UI event is reproduced action for action`, mism);
  ok(st.done && !st.error && st.step() === null, `${tag}: the stepper ends cleanly at the last action`);
  const meta = RP.buildMeta(run.recipe, run.finalView, { username: 'tester' });
  ok(meta.checksum === viewChecksum(st.view()) && meta.checksum.length > 8, `${tag}: the stored meta checksum matches the rebuilt run`, meta.checksum);
  const scan = st.scan();
  ok(scan.end.checksum === meta.checksum && !scan.end.error && scan.end.index === run.recipe.actions.length, `${tag}: scan() re-simulates to the same end`, JSON.stringify(scan.end.error));
  ok(st.index === 0 && JSON.stringify(st.view()) === run.frames[0].view, `${tag}: scan() leaves the stepper at the start`);
  // seeking (backward and forward) lands exactly where stepping forward does
  const n = run.recipe.actions.length;
  const marks = [n, Math.floor(n * 0.7), 1, Math.floor(n / 2), 0, n - 1, Math.floor(n / 3)];
  let seekBad = null;
  for (const k of marks) {
    st.seek(k);
    if (st.index !== k || JSON.stringify(st.view()) !== run.frames[k].view) { seekBad = k; break; }
  }
  ok(seekBad === null, `${tag}: seek() backward + forward equals stepping forward to the same index`, seekBad);
  // ante marks: the first action index of every ante the run reached
  const antes = scan.antes.map((a) => a.ante);
  ok(antes[0] === 1 && antes[antes.length - 1] === run.finalView.ante && scan.blinds.length >= 1, `${tag}: scan() marks antes ${antes.join(',')} and ${scan.blinds.length} blinds`);
  ok(scan.ante.length === n + 1 && scan.ante[n] === run.finalView.ante, `${tag}: a per-action ante table`);
  return { st, meta, scan };
}

// ------------------------------------------------------------------ 1. a vanilla run (to game over)
const van = playRun({ seed: 'REPLAY1', back: 'b_blue', stake: 2 }, { seed: 11 });
ok(van.session.over && van.recipe.actions.length > 20, 'vanilla: the bot plays a whole run to game over', van.recipe.actions.length);
ok(van.recipe.actions.some((a) => INSTANT_ACTIONS.has(a.type)) && van.recipe.actions.some((a) => a.type === 'play'), 'vanilla: the run has instant (highlight/sort/reorder) and real actions');
const V = verifyRecipe('vanilla', van);
ok(V.scan.antes.length >= 2, 'vanilla: the run crossed at least one ante', V.scan.antes.length);

// the share code round-trips the whole recipe
const code = await RP.packRecipe(van.recipe);
ok(/^G1\.[A-Za-z0-9_-]+$/.test(code) && code.length < JSON.stringify(van.recipe).length, 'pack: a gzip G1. share code, smaller than the recipe', code.length);
const back = await RP.unpackRecipe(code);
ok(JSON.stringify(back) === JSON.stringify(van.recipe), 'unpack: the code gives back the exact recipe');
ok(await RP.unpackRecipe('G1.@@@') === null && await RP.unpackRecipe('nope') === null && await RP.unpackRecipe(await RP.pack('{"v":1}')) === null, 'unpack: junk / a non-recipe is refused (null)');
ok(await RP.unpack('R1.' + Buffer.from('{"a":1}').toString('base64url')) === '{"a":1}', 'unpack: the raw R1. fallback reads');

// ------------------------------------------------------------------ 2. tampered / older recipes are detected
{
  // one action dropped: the engine rejects a later action, or the run ends elsewhere
  const acts = van.recipe.actions;
  const i = acts.findIndex((a, j) => j > 5 && a.type === 'play');
  const t1 = { ...van.recipe, actions: acts.slice(0, i - 1).concat(acts.slice(i)) };
  const s1 = Session.stepper(t1).scan();
  ok(!!s1.end.error || s1.end.checksum !== V.meta.checksum, 'tamper: a recipe missing an action is detected (rejected or a different end)', JSON.stringify({ err: s1.end.error && s1.end.error.error, at: s1.end.index }));
  // a rejected action stops the stepper gracefully (no throw) and seek() can't pass it
  const t2 = { ...van.recipe, actions: acts.slice(0, 3).concat([{ type: 'buy', id: 99999 }], acts.slice(3)) };
  const st2 = Session.stepper(t2);
  let r; for (let k = 0; k < 4; k++) r = st2.step();
  ok(r && r.ok === false && st2.error && st2.error.index === 3 && st2.done && st2.step() === null, 'tamper: a rejected action stops the stepper with an error at its index', JSON.stringify(st2.error));
  ok(st2.seek(10) === 3 && st2.seek(2) === 2 && !st2.error, 'tamper: seek() stops at the rejection; seeking back before it rebuilds cleanly');
  const s2 = st2.scan();
  ok(s2.end.error && s2.end.index === 3, 'tamper: scan() reports where the run could not be rebuilt');
  // an "older" recording: the same actions on a different engine setting (stake changed) end elsewhere
  const t3 = { ...van.recipe, stake: 1 };
  const s3 = Session.stepper(t3).scan();
  ok(!!s3.end.error || s3.end.checksum !== V.meta.checksum, 'older: a recipe re-simulated under different rules is detected', s3.end.checksum);
  // and a recipe that was never a recipe can't make a stepper
  let threw = false; try { Session.stepper({ seed: 'X' }); } catch (e) { threw = true; }
  ok(threw, 'a non-recipe throws instead of stepping');
}

// ------------------------------------------------------------------ 3. a custom-deck run that won and went into Endless
const easy = { name: 'Easy Street', back: 'b_green', params: { win_ante: 2, blind_scaling: 0.25, dollars: 20 }, jokers: [{ key: 'j_joker', n: 1 }] };
const cd = playRun({ seed: 'REPLAY3', back: 'b_red', stake: 1, customDeck: easy }, { seed: 33, endless: true, maxSteps: 1500 });
ok(cd.recipe.customDeck && cd.recipe.customDeck.name === 'Easy Street', 'custom deck: the definition is part of the recipe');
ok(cd.wonAt != null && cd.wentEndless && cd.finalView.endless, 'custom deck: the run WON and continued into Endless', JSON.stringify({ wonAt: cd.wonAt, endless: cd.finalView.endless }));
ok(cd.session.over && cd.finalView.ante > 2, 'custom deck: the Endless run went on past the winning ante to a game over', JSON.stringify({ over: cd.session.over, ante: cd.finalView.ante }));
const C = verifyRecipe('custom+endless', cd);
ok(C.meta.won && C.meta.endless && C.meta.customDeck === 'Easy Street' && C.scan.winIndex != null && C.scan.winIndex < C.scan.total, 'custom deck: the meta says won + endless; the scan marks the win inside the run', JSON.stringify({ won: C.meta.won, win: C.scan.winIndex }));
// the replay saved at the WIN is a prefix of the full run: it re-simulates to the win, and the
// whole-run recipe re-simulates past it (one replay per run, extended — never a per-round clip)
{
  const atWin = { ...cd.recipe, actions: cd.recipe.actions.slice(0, cd.wonAt) };
  const sw = Session.stepper(atWin).scan();
  ok(!sw.end.error && sw.end.view.won && !sw.end.view.endless && sw.end.view.state === 'ROUND_EVAL', 'custom deck: the win-time recipe ends on the win');
  ok(RP.localId(atWin) === RP.localId(cd.recipe), 'custom deck: the win-time and the final replay share one local id');
}

// ------------------------------------------------------------------ 4. a modded run (Pokermon)
{
  const { loadMods } = await import('../js/mods/index.js');
  await loadMods(['pokermon']);
  const mod = playRun({ seed: 'POKE1', back: 'b_red', stake: 1, mods: ['pokermon'], modOptions: {} }, { seed: 22, maxSteps: 700 });
  ok(mod.recipe.mods.includes('pokermon') && mod.session.over, 'modded: a Pokermon run plays to game over', mod.recipe.actions.length);
  ok(mod.finalView.areas.jokers.some((c) => c.mod === 'pokermon'), 'modded: the run bought a Pokermon joker');
  const M = verifyRecipe('modded', mod);
  ok(M.meta.mods.includes('pokermon'), 'modded: the meta lists the mods');
  // the same actions WITHOUT the mod are a different run
  const s = Session.stepper({ ...mod.recipe, mods: [] }).scan();
  ok(!!s.end.error || s.end.checksum !== M.meta.checksum, 'modded: re-simulating without the mod is detected');
}

// ------------------------------------------------------------------ 5. the local list
{
  mem.clear();
  const e1 = RP.save(van.recipe, V.meta);
  ok(e1 && e1.id === RP.localId(van.recipe) && RP.list().length === 1 && RP.get(e1.id).meta.checksum === V.meta.checksum, 'local: a finished run is saved under its local id');
  const e1b = RP.save(van.recipe, { ...V.meta, ante: 99 });
  ok(RP.list().length === 1 && RP.get(e1.id).meta.ante === 99, 'local: saving the same run again extends its entry (no duplicate)');
  ok(RP.setServerId(e1.id, 'abcdef12') && RP.get(e1.id).serverId === 'abcdef12' && RP.save(van.recipe, V.meta).serverId === 'abcdef12', 'local: the uploaded id is remembered (and kept when the entry is extended)');
  for (let i = 0; i < 12; i++) RP.save({ ...van.recipe, started: 1000 + i }, { ...V.meta, ante: i });
  const l = RP.list();
  ok(l.length === RP.LOCAL_MAX && l[0].recipe.started === 1011 && !l.some((e) => e.id === e1.id), 'local: only the newest 10 are kept', l.length);
  ok(RP.remove(l[0].id) && RP.list().length === 9 && !RP.get(l[0].id), 'local: delete removes one replay');
  // a full storage evicts the oldest replays and never touches the live run save
  mem.set('micatro_run_v1', 'x'.repeat(1000));
  const each = JSON.stringify(RP.list()[0]).length;
  quota = 1000 + each * 3 + 200;
  const e2 = RP.save({ ...van.recipe, started: 5000 }, V.meta);
  ok(e2 && RP.list()[0].id === e2.id && RP.list().length <= 3 && RP.list().length >= 1, 'local: a full storage evicts the oldest replays to fit the new one', RP.list().length);
  ok(mem.get('micatro_run_v1') === 'x'.repeat(1000), 'local: the live run save is never evicted');
  quota = 10;
  let threw = false, r = 'unset';
  try { r = RP.save({ ...van.recipe, started: 6000 }, V.meta); } catch (e) { threw = true; }
  ok(!threw && r === null, 'local: when nothing fits, save() returns null instead of throwing');
  quota = Infinity;
  mem.set(RP.STORE_KEY, '{not json');
  ok(Array.isArray(RP.list()) && RP.list().length === 0, 'local: a corrupt list reads as empty');
}
ok(RP.save({ seed: 'x' }, {}) === null, 'local: a non-recipe is refused');
ok(RP.watchUrl('abcdef12') === '/micatro/?replay=abcdef12' && RP.watchUrl('Lx', { local: true }) === '/micatro/?replay=local:Lx' && RP.shareUrl('abcdef12', 'https://x.test') === 'https://x.test/mr/abcdef12', 'urls: watch + share links');
ok(RP.scoreOf({ stats: { best_hand: Infinity } }) === 'naneinf' && RP.scoreOf({ stats: { best_hand: '1.234e450' } }) === '1.234e450' && RP.scoreOf({ stats: { best_hand: { toJSON: () => '2e400' } } }) === '2e400' && RP.scoreOf({ stats: { best_hand: 812 } }) === 812, 'meta: big-number safe scores');

console.log(`replay: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
