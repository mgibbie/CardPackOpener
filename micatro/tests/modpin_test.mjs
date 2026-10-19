// Mod version pins + key aliases, engine side (micatro/js/mods/pins.js, micatro/js/mods/aliases.js,
// engine/session.js, engine/run.js newRun, engine/customdeck.js validateDeck, replays.js buildMeta):
//   * a new run's recipe records {modId: version(+r<contentRev>)} for every active mod (requirements
//     included) and the engine's rules rev; a replay's meta copies them
//   * pinDiff: nothing changed -> []; a bumped contentRev / a new version / an engine rev -> listed, and the
//     replay warning names both versions
//   * a recipe from before pins is read as LEGACY_MOD_VERSIONS (and fromRecipe records that assumption)
//   * "Continue anyway" re-pins the recipe to the current versions and keeps the old pins in `repinned`
//   * a forced desync (an action the engine rejects) stops the rebuild where it is, never throws
//   * aliases: a renamed key (no longer registered) resolves to its new key in a recipe's back and a custom
//     deck; a key still registered is never re-mapped (the seeded Pokermon rename stays dormant); a removed
//     key is "retired", is skipped in play, and never throws
//   node micatro/tests/modpin_test.mjs
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { G, P_CENTERS, P_BLINDS } = await import('../js/engine/core.js');
const { newRun } = await import('../js/engine/run.js');
const { Session, ENGINE_CONTENT_REV } = await import('../js/engine/session.js');
const { registerMod, MODS, resolveCardKey, isRetiredKey, keyKnown } = await import('../js/mods/registry.js');
const PINS = await import('../js/mods/pins.js');
const AL = await import('../js/mods/aliases.js');
const { validateDeck } = await import('../js/engine/customdeck.js');
const RP = await import('../js/replays.js');
await import('../mods/pokermon/index.js');
await import('../mods/nacho/index.js');
const { playRun } = await import('./replay_bot.mjs');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };

// ---------------------------------------------------------------- pins in the recipe
ok(ENGINE_CONTENT_REV === PINS.ENGINE_CONTENT_REV && ENGINE_CONTENT_REV >= 1, 'session re-exports the engine content rev');
ok(MODS.pokermon.contentRev === 1, 'Pokermon declares contentRev 1 (the 2026-10-18/19 house rules)');
ok(PINS.pinOf('3.2.1', 1) === '3.2.1+r1' && PINS.pinOf('3.2.1') === '3.2.1' && PINS.pinOf('1.0 (old-API)', 0) === '1.0 (old-API)', 'pinOf: version + "+r<rev>" only when a rev is set');
ok(PINS.pinLabel('3.2.1+r2') === '3.2.1 (rev 2)' && PINS.pinLabel('3.9.1') === '3.9.1', 'pinLabel reads a pin for people');

const s = new Session();
s.start({ seed: 'PIN1', mods: ['nacho'] });   // nacho requires pokermon
ok(s.recipe.mods.includes('pokermon') && s.recipe.mods.includes('nacho'), 'the run activates nacho + its requirement');
ok(s.recipe.modVersions && s.recipe.modVersions.pokermon === '3.2.1+r1' && s.recipe.modVersions.nacho === MODS.nacho.version, 'the recipe pins every active mod (requirements included)', s.recipe.modVersions);
ok(s.recipe.engineRev === ENGINE_CONTENT_REV, 'the recipe pins the engine rules rev');
const saved = JSON.parse(mem.get('micatro_run_v1'));
ok(saved.modVersions.pokermon === '3.2.1+r1' && saved.engineRev === ENGINE_CONTENT_REV, 'the saved run (localStorage) carries the pins');
ok(Session.pinDiff(saved).length === 0, 'a freshly saved run has no version difference');
const van = new Session(); van.start({ seed: 'PIN2' });
ok(JSON.stringify(van.recipe.modVersions) === '{}' && van.recipe.engineRev === ENGINE_CONTENT_REV, 'a vanilla run pins only the engine');

// a replay's meta
const run = playRun({ seed: 'PINRUN', back: 'b_red', stake: 1, mods: ['pokermon'] }, { seed: 3, maxSteps: 120 });
const meta = RP.buildMeta(run.recipe, run.finalView, { username: 't' });
ok(meta.modVersions && meta.modVersions.pokermon === '3.2.1+r1' && meta.engineRev === ENGINE_CONTENT_REV && !('pinAssumed' in meta), 'buildMeta copies the pins into the replay meta', meta);

// ---------------------------------------------------------------- mismatch
const bumped = JSON.parse(JSON.stringify(saved));
const was = MODS.pokermon.contentRev;
MODS.pokermon.contentRev = 2;
let d = Session.pinDiff(bumped);
ok(d.length === 1 && d[0].id === 'pokermon' && d[0].recorded === '3.2.1+r1' && d[0].current === '3.2.1+r2' && d[0].name === 'Pokermon', 'a bumped contentRev is a difference', d);
ok(PINS.replayWarning(d) === 'Recorded with Pokermon 3.2.1 (rev 1); current 3.2.1 (rev 2). Playback may differ.', 'the replay warning names both', PINS.replayWarning(d));
MODS.pokermon.contentRev = was;
const oldVer = { ...bumped, modVersions: { ...bumped.modVersions, pokermon: '3.2.1' } };
const vwas = MODS.pokermon.version; MODS.pokermon.version = '3.9.1'; MODS.pokermon.contentRev = 0;
d = Session.pinDiff(oldVer);
ok(d.length === 1 && PINS.replayWarning(d) === 'Recorded with Pokermon 3.2.1; current 3.9.1. Playback may differ.', 'an upstream version change reads "Recorded with Pokermon 3.2.1; current 3.9.1"', PINS.replayWarning(d));
MODS.pokermon.version = vwas; MODS.pokermon.contentRev = was;
d = Session.pinDiff({ ...saved, engineRev: ENGINE_CONTENT_REV + 1 });
ok(d.length === 1 && d[0].engine, 'a different engine rules rev is a difference', d);
d = Session.pinDiff({ ...saved, mods: [...saved.mods, 'gonemod'], modVersions: { ...saved.modVersions, gonemod: '1.0' } });
ok(d.length === 1 && d[0].id === 'gonemod' && d[0].current === null, 'a mod the site no longer has is reported (current: null)', d);

// re-pin ("Continue anyway")
MODS.pokermon.contentRev = 2;
const cont = Session.fromRecipe(run.recipe, { repin: true });
ok(cont.recipe.modVersions.pokermon === '3.2.1+r2' && Session.pinDiff(cont.recipe).length === 0, '"Continue anyway" re-pins the run to the current versions');
ok(Array.isArray(cont.recipe.repinned) && cont.recipe.repinned[0].from.pokermon === '3.2.1+r1' && cont.recipe.repinned[0].at === run.recipe.actions.length, 'the old pins are kept in recipe.repinned (with the move it switched at)', cont.recipe.repinned);
MODS.pokermon.contentRev = was;

// ---------------------------------------------------------------- legacy (no pins)
const legacy = JSON.parse(JSON.stringify(run.recipe));
delete legacy.modVersions; delete legacy.engineRev;
const lp = PINS.recordedPins(legacy);
ok(lp.assumed && lp.modVersions.pokermon === PINS.LEGACY_MOD_VERSIONS.pokermon && lp.engineRev === PINS.LEGACY_ENGINE_REV, 'a recipe without pins reads as the legacy table', lp);
ok(Session.pinDiff(legacy).length === 0, 'a legacy recipe loads as today (the legacy table is today\'s versions)');
ok(Object.isFrozen(PINS.LEGACY_MOD_VERSIONS) && PINS.PIN_DATE === '2026-10-19', 'the legacy table is frozen and dated');
const lr = Session.fromRecipe(legacy);
ok(lr.recipe.pinAssumed === 'legacy:2026-10-19' && lr.recipe.modVersions.pokermon === PINS.LEGACY_MOD_VERSIONS.pokermon && lr.recipe.actions.length === legacy.actions.length && !lr.stoppedAt, 'resuming a legacy recipe records the assumption and rebuilds every move', lr.recipe.pinAssumed);
const lmeta = RP.buildMeta(legacy, run.finalView, {});
ok(lmeta.pinAssumed === 'legacy:2026-10-19' && lmeta.modVersions.pokermon === PINS.LEGACY_MOD_VERSIONS.pokermon, 'a legacy replay\'s meta records the assumption', lmeta);
// the legacy table lists every shipped mod
const shipped = ['pokermon', 'nacho', 'pokermonplus', 'riskofjesters', 'sylviesilly', 'milatro', 'mikas', 'olympus', 'inscrybed', 'tagteam', 'smirkeo', 'altavista', 'omertadeck', 'morefluff', 'betmma', 'bunco', 'reverie', 'autumnmood', 'autumncircus'];
ok(shipped.every((id) => typeof PINS.LEGACY_MOD_VERSIONS[id] === 'string'), 'the legacy table has every shipped mod');

// ---------------------------------------------------------------- forced desync
const broken = { ...run.recipe, actions: [...run.recipe.actions.slice(0, 4), { type: 'buy', id: 999999 }, ...run.recipe.actions.slice(4)] };
let threw = null, ds = null;
try { ds = Session.fromRecipe(broken); } catch (e) { threw = e; }
ok(!threw && ds.stoppedAt && ds.stoppedAt.index === 4 && ds.recipe.actions.length === 4, 'a desynced resume stops at the rejected move (no throw)', ds && ds.stoppedAt);
const st = Session.stepper(broken);
const sc = st.scan();
ok(sc.end.error && sc.end.error.index === 4, 'a desynced replay stops at the rejected move', sc.end.error);

// ---------------------------------------------------------------- aliases
registerMod({
  id: 'pintest', name: 'Pin Test', prefix: 'pt', version: '2.0', contentRev: 3,
  aliases: { renamed: { b_pt_old: 'b_pt_new', j_pt_old: 'j_pt_new' }, removed: ['j_pt_gone'], names: { j_pt_gone: 'Gone Joker' } },
  content: {
    centers: [
      { key: 'b_pt_new', set: 'Back', name: 'New Deck', pos: { x: 0, y: 0 }, config: { dollars: 10 } },
      { key: 'j_pt_new', set: 'Joker', name: 'New Joker', rarity: 1, cost: 4, pos: { x: 0, y: 0 }, config: {} },
    ],
  },
});
ok(PINS.modPin('pintest') === '2.0+r3', 'a mod\'s pin is version + contentRev');
ok(resolveCardKey('b_pt_old') === 'b_pt_new' && resolveCardKey('j_pt_old') === 'j_pt_new' && resolveCardKey('j_joker') === 'j_joker', 'a renamed key resolves to its new key; others are untouched');
ok(P_BLINDS.bl_poke_cgoose && resolveCardKey('bl_poke_cgoose') === 'bl_poke_cgoose' && AL.isRenamed('bl_poke_cgoose'), 'the seeded Pokermon rename (cgoose -> iridescent_hacker) stays dormant while cgoose is registered');
ok(AL.resolveKey('bl_poke_cgoose') === 'bl_poke_iridescent_hacker' && AL.aliasesOf('bl_poke_iridescent_hacker').includes('bl_poke_cgoose'), '... and resolves once it is gone (the stickers of the old key count for the new one)');
ok(isRetiredKey('j_pt_gone') && !isRetiredKey('j_pt_new') && AL.retiredName('j_pt_gone') === 'Gone Joker' && !keyKnown('j_pt_gone'), 'a removed key is retired (with its display name)');
// a saved run whose back was renamed
newRun({ seed: 'AL1', back: 'b_pt_old', mods: ['pintest'] });
ok(G.GAME.selected_back_key === 'b_pt_new', 'a recipe naming a renamed back plays on the new one', G.GAME.selected_back_key);
const ar = new Session(); ar.start({ seed: 'AL2', back: 'b_pt_new', mods: ['pintest'] });
const aliasedRecipe = { ...JSON.parse(JSON.stringify(ar.recipe)), back: 'b_pt_old' };
const resumed = Session.fromRecipe(aliasedRecipe);
ok(resumed.view().back === 'b_pt_new' && !resumed.stoppedAt, 'resuming a saved run with the old back key resolves it', resumed.view().back);
// a custom deck with a renamed + a removed joker
const deck = validateDeck({ name: 'Old', back: 'b_pt_old', mods: ['pintest'], jokers: [{ key: 'j_pt_old', n: 1 }, { key: 'j_pt_gone', n: 1 }], bans: { jokers: ['j_pt_old'] } });
ok(deck.back === 'b_pt_new' && deck.jokers[0].key === 'j_pt_new' && deck.bans.jokers[0] === 'j_pt_new', 'a custom deck\'s renamed keys resolve (back, jokers, bans)', deck);
ok(deck.jokers[1].key === 'j_pt_gone', 'a custom deck keeps a removed key stored');
let cdErr = null;
try { newRun({ seed: 'AL3', customDeck: deck }); } catch (e) { cdErr = e; }
ok(!cdErr && G.jokers.cards.some((c) => c.config.center.key === 'j_pt_new') && !G.jokers.cards.some((c) => c.config.center.key === 'j_pt_gone'), 'a custom-deck run with a retired joker plays (the retired one is skipped, never a crash)', cdErr && cdErr.message);
// a removed back in a saved run: falls back, never throws
let rbErr = null;
try { Session.fromRecipe({ ...aliasedRecipe, back: 'b_pt_gone_forever' }); } catch (e) { rbErr = e; }
ok(!rbErr, 'a recipe naming an unknown back does not throw');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
