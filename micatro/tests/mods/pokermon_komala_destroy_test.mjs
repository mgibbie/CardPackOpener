// Komala's Comatose vs the Jokers that destroy Jokers (Pokermon r68, the owner's fix, 2026-11-02).
// r65-r67: a destroyer TARGETED Komala, Komala refused (joker_type_destroyed -> no_destroy) and the destroyer still took its gain:
// Ceremonial Dagger with Komala to its right got +2x Komala's sell value Mult every Blind while Komala stayed (a free infinite engine).
// r68: every Joker effect that picks a Joker to destroy asks the engine's can_be_destroyed_by_joker (an Eternal, or a joker a mod makes
// act Eternal for destroy: Pokermon's hooks.joker_destroy_immune -> Komala), so Komala is skipped exactly like an Eternal: not targeted,
// no gain, no slice. Ceremonial Dagger, Madness, Bewear, Carvanha / Sharpedo, Scyther, Pokermon+'s Nacli are PLAYED here.
// Never retroactive: a run recorded on r67 replays as recorded (js/mods/pins.js RULES).
//   node micatro/tests/mods/pokermon_komala_destroy_test.mjs
import { T, start, hand, add, clearHand, G, act, STATES } from './poke_helpers.mjs';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { can_be_destroyed_by_joker } from '../../js/engine/core.js';
import { describe } from '../../js/engine/describe.js';
import '../../mods/pokermon/index.js';
import '../../mods/pokermonplus/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 900)); } };
const ex = (j) => j.ability.extra;
const owned = (j) => G.jokers.cards.includes(j);
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const R67 = { pokermon: '3.9.1+r67' };
const oldRules = (fn) => { PINS.RULES.pins = R67; try { return fn(); } finally { PINS.RULES.pins = null; } };
/** Win the round in progress (High Card 2) -> ROUND_EVAL. */
function endRound() { clearHand(); const c = hand(['S_2']); G.GAME.chips = G.GAME.blind.chips; if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2; act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush(); }
function nextBlind(boss = 'bl_wall') {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  flush();
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = boss;
  act({ type: 'select_blind' }); flush();
  clearHand();
}
const rounds = (n) => { for (let r = 0; r < n; r++) { endRound(); nextBlind(); } };
/** A fresh run with no Blind selected yet, these jokers left to right (so the first Blind's setting_blind sees them). */
function row(seed, keys, extra = {}) {
  start(seed, {}, { noBlind: true, ...extra });
  return keys.map((k) => add(k));
}
const blinds = (n) => { act({ type: 'select_blind' }); flush(); clearHand(); for (let i = 1; i < n; i++) { endRound(); nextBlind(); } };

await sec('pin', () => {
  ok(MODS.pokermon.contentRev === 68 && PINS.modPin('pokermon') === '3.9.1+r68', 'Pokermon contentRev 68 (pin 3.9.1+r68: the Komala fix)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
});

// ------------------------------------------------------------------- the helper
await sec('can_be_destroyed_by_joker', () => {
  const [k, j, e] = row('KDHELP', ['j_poke_komala', 'j_joker', 'j_joker']);
  e.set_eternal(true);
  ok(!can_be_destroyed_by_joker(k) && can_be_destroyed_by_joker(j) && !can_be_destroyed_by_joker(e), 'Komala and an Eternal: no; a plain joker: yes', [can_be_destroyed_by_joker(k), can_be_destroyed_by_joker(j), can_be_destroyed_by_joker(e)]);
  ok(oldRules(() => can_be_destroyed_by_joker(k)), 'on r67 rules Komala was a target (it refused later)');
});

// ------------------------------------------------------------------- Ceremonial Dagger
await sec('dagger', () => {
  const [dag, k] = row('KDDAG', ['j_ceremonial', 'j_poke_komala']);
  blinds(4);
  ok(dag.ability.mult === 0, 'Ceremonial Dagger with Komala to its right: +0 Mult over 4 Blinds (vanilla skips an Eternal neighbour)', dag.ability.mult);
  ok(owned(k) && G.jokers.cards.length === 2 && !k.getting_sliced && G.GAME.joker_buffer === 0, 'Komala stays, never marked getting_sliced (no slice)', [G.jokers.cards.map(key), k.getting_sliced, G.GAME.joker_buffer]);
  // the control: a plain joker to its right is sliced for +2x its sell value
  const [dag2, j] = row('KDDAG2', ['j_ceremonial', 'j_joker']);
  const sell = j.sell_cost;
  blinds(1);
  ok(!owned(j) && dag2.ability.mult === 2 * sell, 'control: a plain Joker to its right is sliced, +2x its sell value', [dag2.ability.mult, sell]);
  // an Eternal neighbour: as before (nothing)
  const [dag3, e] = row('KDDAG3', ['j_ceremonial', 'j_joker']);
  e.set_eternal(true);
  blinds(3);
  ok(owned(e) && dag3.ability.mult === 0, 'an Eternal neighbour: +0, it stays (unchanged)', dag3.ability.mult);
  // the Joker past Komala is never reached (only the neighbour counts)
  const [dag4, , j4] = row('KDDAG4', ['j_ceremonial', 'j_poke_komala', 'j_joker']);
  blinds(2);
  ok(owned(j4) && dag4.ability.mult === 0, 'Dagger, Komala, Joker: nothing destroyed, +0', [G.jokers.cards.map(key), dag4.ability.mult]);
  // r67 rules (a recorded run): the old behaviour, Dagger gains while Komala stays
  const [dag5, k5] = row('KDDAG5', ['j_ceremonial', 'j_poke_komala']);
  oldRules(() => blinds(2));
  ok(owned(k5) && dag5.ability.mult === 4 * k5.sell_cost, 'r67 rules: Dagger targeted Komala, gained +2x sell value each Blind, Komala stayed (as recorded)', [dag5.ability.mult, k5.sell_cost]);
});

// ------------------------------------------------------------------- Madness
await sec('madness', () => {
  for (const seed of ['KDMAD1', 'KDMAD2', 'KDMAD3', 'KDMAD4', 'KDMAD5']) {
    const [mad, k, j] = row(seed, ['j_madness', 'j_poke_komala', 'j_joker']);
    blinds(1); // the Small Blind: Madness fires (not on a Boss)
    ok(owned(k) && !owned(j) && mad.ability.x_mult === 1.5, seed + ': Madness destroys the other Joker, never Komala (X1.5)', [G.jokers.cards.map(key), mad.ability.x_mult]);
  }
  const [mad, k] = row('KDMADK', ['j_madness', 'j_poke_komala']);
  blinds(1);
  ok(owned(k) && mad.ability.x_mult === 1.5 && !k.getting_sliced, 'Madness with only Komala: it still gains its X0.5, destroys nothing', [G.jokers.cards.map(key), mad.ability.x_mult]);
  // r67 rules: Komala is in the pool again (some seed picks it, the plain Joker survives)
  let picked = 0;
  for (const seed of ['KDMAD1', 'KDMAD2', 'KDMAD3', 'KDMAD4', 'KDMAD5', 'KDMAD6', 'KDMAD7', 'KDMAD8']) {
    const [, k2, j2] = row(seed, ['j_madness', 'j_poke_komala', 'j_joker']);
    oldRules(() => blinds(1));
    if (owned(k2) && owned(j2)) picked++;
  }
  ok(picked >= 1, 'r67 rules: Madness could pick Komala (it refused, the other Joker survived) on ' + picked + ' of 8 seeds', picked);
});

// ------------------------------------------------------------------- Bewear, Carvanha, Sharpedo, Scyther, Nacli
await sec('pokermon destroyers', () => {
  const [bw, k] = row('KDBEW', ['j_poke_bewear', 'j_poke_komala']);
  ok(/Comatose: safe/.test(plain(bw)), 'Bewear\'s tooltip: Komala in its arms is "Comatose: safe"', plain(bw));
  act({ type: 'select_blind' }); flush(); clearHand();
  G.GAME.probabilities.normal = 4;
  for (let i = 0; i < 3; i++) { endRound(); ok(owned(k) && !k.getting_sliced, 'Bewear\'s Strong Hug (1 in 1): Komala stays, never targeted (round ' + (i + 1) + ')', G.jokers.cards.map(key)); nextBlind(); }
  const [bw2, e] = row('KDBEWE', ['j_poke_bewear', 'j_joker']);
  e.set_eternal(true);
  act({ type: 'select_blind' }); flush(); clearHand();
  G.GAME.probabilities.normal = 4;
  endRound();
  ok(owned(e) && /Eternal: safe/.test(plain(bw2)), 'Bewear and an Eternal: unchanged', plain(bw2));

  const [cv, k2] = row('KDCARV', ['j_poke_carvanha', 'j_poke_komala']);
  blinds(3);
  ok(owned(k2) && ex(cv).eaten === 0 && key(cv) === 'j_poke_carvanha', 'Carvanha: Komala to its right is skipped, nothing eaten (no step toward Sharpedo)', [ex(cv).eaten, key(cv)]);
  const [cv2, j2] = row('KDCARV2', ['j_poke_carvanha', 'j_joker']);
  blinds(1);
  ok(!owned(j2) && ex(cv2).eaten === 1, 'control: Carvanha eats a plain Joker', ex(cv2).eaten);

  const [, k3] = row('KDSHARP', ['j_poke_sharpedo', 'j_poke_komala']);
  blinds(2);
  ok(owned(k3) && G.consumeables.cards.length === 0, 'Sharpedo: Komala skipped, no Spectral card', [G.jokers.cards.map(key), G.consumeables.cards.length]);

  const [sc, k4] = row('KDSCY', ['j_poke_scyther', 'j_poke_komala']);
  const m0 = ex(sc).mult;
  blinds(2);
  ok(owned(k4) && ex(sc).mult === m0, 'Scyther: Komala skipped, +0 Mult', [ex(sc).mult, m0]);

  const [na, k5] = row('KDNACL', ['j_sonfive_nacli', 'j_poke_komala'], { mods: ['pokermonplus'] });
  const x0 = ex(na).Xmult;
  G.GAME.probabilities.normal = 100;
  blinds(2);
  ok(owned(k5) && ex(na).Xmult === x0, 'Pokermon+ Nacli (Salt Cure, the rightmost): Komala skipped, no growth', [ex(na).Xmult, x0]);

  // r67 rules: Carvanha took Komala as a meal it never ate (the old leak)
  const [cv3, k6] = row('KDCARV3', ['j_poke_carvanha', 'j_poke_komala']);
  oldRules(() => blinds(1));
  ok(owned(k6) && ex(cv3).eaten === 1, 'r67 rules: Carvanha counted Komala as eaten while it stayed (as recorded)', ex(cv3).eaten);
});

// ------------------------------------------------------------------- Komala's text, Hex / Ankh / selling unchanged
await sec('text and other removals', () => {
  const [k] = row('KDTXT', ['j_poke_komala']);
  ok(/Jokers skip it when choosing/.test(plain(k)) && /what to destroy/.test(plain(k)), 'the tooltip: "Jokers skip it when choosing what to destroy"', plain(k));
  k.start_dissolve(); flush();
  ok(!owned(k), 'a non-Joker destroy (Hex, Ankh) still removes it');
});

// ------------------------------------------------------------------- a run recorded on r67 replays as recorded
await sec('r67 replay', () => {
  const deck = { name: 'Komala', mods: ['pokermon'], params: { blind_scaling: 0.05 },
    cards: [['S_K', 0, 0, 0, 20], ['H_Q', 0, 0, 0, 20]],
    jokers: [{ key: 'j_ceremonial' }, { key: 'j_poke_komala' }] };
  const record = (pins) => {
    const s = new Session();
    PINS.RULES.pins = pins;
    try {
      s.start({ seed: 'KDREC', mods: ['pokermon'], customDeck: deck });
      s.act({ type: 'select_blind' }); flush();
      for (let b = 0; b < 2; b++) {
        for (let i = 0; i < 4 && G.STATE === STATES.SELECTING_HAND; i++) { s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush(); }
        if (G.STATE === STATES.ROUND_EVAL) { s.act({ type: 'cash_out' }); flush(); }
        if (G.STATE === STATES.SHOP) { s.act({ type: 'next_round' }); flush(); }
        if (G.STATE === STATES.BLIND_SELECT) { s.act({ type: 'select_blind' }); flush(); }
      }
    } finally { PINS.RULES.pins = null; }
    return s;
  };
  const dagMult = () => { const d = G.jokers.cards.find((c) => key(c) === 'j_ceremonial'); return d ? d.ability.mult : null; };
  const komala = () => G.jokers.cards.some((c) => key(c) === 'j_poke_komala');
  // recorded on r67 (main before the fix)
  const s67 = record(R67);
  const want67 = { mult: dagMult(), komala: komala(), chips: String(G.GAME.chips), round: G.GAME.round };
  ok(want67.mult > 0 && want67.komala && want67.round >= 3, 'the r67 run: the Dagger banked Mult off Komala, Komala stayed', want67);
  const rec67 = JSON.parse(JSON.stringify(s67.recipe));
  rec67.modVersions.pokermon = '3.9.1+r67';
  ok(Session.pinDiff(rec67).length === 1, 'an r67 recipe differs from the current pin (the resume prompt)', Session.pinDiff(rec67));
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(rec67)), { repin: true }); flush();
  const got67 = { mult: dagMult(), komala: komala(), chips: String(G.GAME.chips), round: G.GAME.round };
  ok(!r.stoppedAt && JSON.stringify(got67) === JSON.stringify(want67), 'resumed: every r67 move replays on r67 (the banked Dagger Mult kept)', { want67, got67 });
  const st = Session.stepper(JSON.parse(JSON.stringify(rec67)));
  st.seek(st.total); flush();
  ok(!st.error && st.index === rec67.actions.length && dagMult() === want67.mult, 'the replay stepper: the same', [st.error, dagMult()]);
  // the same moves recorded on r68: no gain
  record(null);
  ok(dagMult() === 0 && komala(), 'recorded on r68: the Dagger gains nothing, Komala stays', dagMult());
});

done();
