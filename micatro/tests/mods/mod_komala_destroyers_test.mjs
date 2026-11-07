// Komala's Comatose vs EVERY other mod's Joker destroyer (the owner's follow-up to Pokermon r68, 2026-11-02). r68 made the vanilla,
// Pokermon and Pokermon+ destroyers choose their target with the engine's can_be_destroyed_by_joker (an Eternal, or a joker a mod makes
// act Eternal for destroy: Pokermon's hooks.joker_destroy_immune -> Komala). The other mods still picked Komala: it refused the dissolve
// (no_destroy) and the destroyer kept its gain, or (Bunco's Scattering, which never marks getting_sliced) it was simply destroyed.
// Now each skips it exactly as it skips an Eternal (no target, no gain, no slice), on a contentRev bump of its own:
//   Risk of Jesters r1   Egocentrism (converts a random Joker), Benthic Bloom (upgrades a random Joker after a Boss)
//   Bunco r2             Carnival (destroys a random Joker after a Boss, back an Ante), a Scattering joker's neighbour
//   Milatro r1           Betrayal (destroys a random Joker on Blind select, +$20)
//   BETMMA r1            the Tentacle edition (eats the Joker to its right, adds its values)
//   More Fluff r3        Less Fluff (destroys every other modded Joker, X0.2 each)
// Egocentrism, Benthic Bloom and Less Fluff never skipped an Eternal and still don't (only the mod-immune joker is passed over); the
// others skip both. Every destroyer is PLAYED with Komala, with an Eternal (unchanged: compared with the old rules), and on the old
// pin (js/mods/pins.js RULES: a run recorded before replays as recorded).
//   node micatro/tests/mods/mod_komala_destroyers_test.mjs
import { T, start, hand, add, clearHand, G, act, STATES } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { loadMods } from '../../js/mods/index.js';
import { Session } from '../../js/engine/session.js';

const { ok, done } = T();
const MODLIST = ['riskofjesters', 'bunco', 'milatro', 'betmma', 'morefluff'];
await loadMods(['pokermon', ...MODLIST]);
const key = (c) => c.config.center.key;
const flush = () => G.E_MANAGER.flush();
const owned = (j) => G.jokers.cards.includes(j);
const keys = () => G.jokers.cards.map(key);
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 900)); } };
const OLD = { riskofjesters: '1.0.0', bunco: '5.4.8b-JumboFork+r1', milatro: '1.1.0', betmma: '3.0.2.3', morefluff: '1.9.9999+r2' };
const oldRules = (id, fn) => { PINS.RULES.pins = { [id]: OLD[id] }; try { return fn(); } finally { PINS.RULES.pins = null; } };
/** A fresh run with these mods on and no Blind selected, these jokers left to right. */
function row(seed, mod, ks) { start(seed, {}, { noBlind: true, mods: [mod] }); return ks.map((k) => add(k)); }
function winRound() { clearHand(); const c = hand(['S_2']); G.GAME.chips = G.GAME.blind.chips; if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2; act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush(); }
function nextBlind() {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  flush();
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush(); clearHand();
}
const selectBlind = () => { act({ type: 'select_blind' }); flush(); clearHand(); };
/** From a fresh run: Small, Big, then beat the Boss (its end_of_round is where Carnival and Benthic Bloom fire). */
function beatBoss() { selectBlind(); winRound(); nextBlind(); winRound(); nextBlind(); const boss = G.GAME.blind.boss; winRound(); return boss; }

await sec('pins', () => {
  const want = { riskofjesters: '1.0.0+r1', bunco: '5.4.8b-JumboFork+r2', milatro: '1.1.0+r1', betmma: '3.0.2.3+r1', morefluff: '1.9.9999+r3' };
  for (const [id, pin] of Object.entries(want)) ok(PINS.modPin(id) === pin, id + ': contentRev bumped (pin ' + pin + ')', PINS.modPin(id));
  ok(PINS.LEGACY_MOD_VERSIONS.riskofjesters === '1.0.0' && PINS.LEGACY_MOD_VERSIONS.bunco === '5.1' && PINS.LEGACY_MOD_VERSIONS.morefluff === '1.5.6', 'LEGACY_MOD_VERSIONS untouched');
  ok(MODS.pokermon.contentRev >= 68, 'Pokermon r68+: Komala answers joker_destroy_immune');
});

// ------------------------------------------------------------------- Risk of Jesters: Egocentrism
await sec('egocentrism', () => {
  const [, k] = row('KMEGO', 'riskofjesters', ['j_roj_egocentrism', 'j_poke_komala']);
  selectBlind();
  ok(owned(k) && keys().length === 2 && keys().filter((x) => x === 'j_roj_egocentrism').length === 1 && !k.getting_sliced, 'Egocentrism with only Komala: nothing converted, no new Egocentrism', keys());
  const [, k2, j2] = row('KMEGO2', 'riskofjesters', ['j_roj_egocentrism', 'j_poke_komala', 'j_joker']);
  selectBlind();
  ok(owned(k2) && !owned(j2) && keys().filter((x) => x === 'j_roj_egocentrism').length === 2, 'Egocentrism, Komala, Joker: the Joker is converted, never Komala', keys());
  // the old rules (a run recorded on 1.0.0): Komala picked, it stayed AND a new Egocentrism arrived (the leak)
  const [, k3] = row('KMEGO', 'riskofjesters', ['j_roj_egocentrism', 'j_poke_komala']);
  oldRules('riskofjesters', selectBlind);
  ok(owned(k3) && keys().length === 3, 'old rules: Komala stayed and an Egocentrism was still made (as recorded)', keys());
  // an Eternal: as before (Egocentrism never skipped one)
  const ego = (rules) => { const [, e] = row('KMEGOE', 'riskofjesters', ['j_roj_egocentrism', 'j_joker']); e.set_eternal(true); rules(selectBlind); return JSON.stringify([keys(), owned(e)]); };
  ok(ego((f) => f()) === ego((f) => oldRules('riskofjesters', f)), 'an Eternal Joker: Egocentrism does the same as before', ego((f) => f()));
});

// ------------------------------------------------------------------- Risk of Jesters: Benthic Bloom
await sec('benthic', () => {
  const [, k] = row('KMBEN', 'riskofjesters', ['j_roj_benthic', 'j_poke_komala']);
  ok(beatBoss(), 'at the Boss');
  ok(owned(k) && keys().length === 2 && !k.getting_sliced, 'Benthic Bloom with only Komala: nothing upgraded, no new joker', keys());
  const [, k3] = row('KMBEN', 'riskofjesters', ['j_roj_benthic', 'j_poke_komala']);
  oldRules('riskofjesters', beatBoss);
  ok(owned(k3) && keys().length === 3, 'old rules: Komala stayed and a Legendary still arrived (as recorded)', keys());
  const ben = (rules) => { const [, e] = row('KMBENE', 'riskofjesters', ['j_roj_benthic', 'j_joker']); e.set_eternal(true); rules(beatBoss); return JSON.stringify([keys().length, owned(e)]); };
  ok(ben((f) => f()) === ben((f) => oldRules('riskofjesters', f)), 'an Eternal Joker: Benthic Bloom does the same as before', ben((f) => f()));
});

// ------------------------------------------------------------------- Bunco: Carnival
await sec('carnival', () => {
  const [c, k] = row('KMCAR', 'bunco', ['j_bunc_carnival', 'j_poke_komala']);
  beatBoss(); flush();
  ok(owned(k) && !k.getting_sliced && c.ability.extra.ante < 0 && G.GAME.round_resets.ante === 2, 'Carnival with only Komala: nothing destroyed, no Ante back (no gain)', [keys(), c.ability.extra.ante, G.GAME.round_resets.ante]);
  const [c2, k2, j2] = row('KMCAR2', 'bunco', ['j_bunc_carnival', 'j_poke_komala', 'j_joker']);
  beatBoss(); flush();
  ok(owned(k2) && !owned(j2) && c2.ability.extra.ante === 1, 'Carnival, Komala, Joker: the Joker goes, the Ante loops', [keys(), c2.ability.extra.ante]);
  const [c3, k3] = row('KMCAR', 'bunco', ['j_bunc_carnival', 'j_poke_komala']);
  oldRules('bunco', () => { beatBoss(); flush(); });
  ok(owned(k3) && c3.ability.extra.ante === 1 && G.GAME.round_resets.ante === 1, 'old rules: Komala picked, it stayed and the Ante still went back (as recorded)', [keys(), c3.ability.extra.ante, G.GAME.round_resets.ante]);
  const car = (rules) => { const [c4, e] = row('KMCARE', 'bunco', ['j_bunc_carnival', 'j_joker']); e.set_eternal(true); rules(() => { beatBoss(); flush(); }); return JSON.stringify([keys(), owned(e), c4.ability.extra.ante, G.GAME.round_resets.ante]); };
  const ce = car((f) => f());
  ok(ce === car((f) => oldRules('bunco', f)) && JSON.parse(ce)[1] === true && JSON.parse(ce)[2] < 0, 'an Eternal Joker: skipped, as before', ce);
});

// ------------------------------------------------------------------- Bunco: a Scattering joker's neighbour
await sec('scattering', async () => {
  const { apply_sticker } = await import('../../mods/bunco/stickers.js');
  const scatter = (rules, nb) => {
    const [s, n] = row('KMSCA', 'bunco', ['j_joker', nb]);
    if (nb === 'j_greedy_joker') n.set_eternal(true);
    apply_sticker('bunc_scattering', s, true);
    selectBlind();
    rules(() => { act({ type: 'sell', id: s.sort_id }); flush(); });
    return { s, n };
  };
  let r = scatter((f) => f(), 'j_poke_komala');
  ok(r.s.removed && owned(r.n) && !r.n.removed, 'a Scattering Joker sold next to Komala: Komala stays', keys());
  r = scatter((f) => oldRules('bunco', f), 'j_poke_komala');
  ok(r.s.removed && r.n.removed, 'old rules: Komala was destroyed with it (as recorded)', keys());
  r = scatter((f) => f(), 'j_greedy_joker');
  ok(owned(r.n), 'an Eternal neighbour: stays, as before');
  r = scatter((f) => f(), 'j_joker');
  ok(r.n.removed, 'control: a plain neighbour goes with it');
});

// ------------------------------------------------------------------- Milatro: Betrayal
await sec('betrayal', () => {
  for (const seed of ['KMBET1', 'KMBET2', 'KMBET3', 'KMBET4', 'KMBET5']) {
    const [, k, j] = row(seed, 'milatro', ['j_mlnc_betrayal', 'j_poke_komala', 'j_joker']);
    const d0 = G.GAME.dollars;
    selectBlind();
    ok(owned(k) && !owned(j) && !k.getting_sliced && G.GAME.dollars === d0 + 20, seed + ': Betrayal destroys the other Joker, never Komala (+$20)', keys());
  }
  let picked = 0;
  for (const seed of ['KMBET1', 'KMBET2', 'KMBET3', 'KMBET4', 'KMBET5', 'KMBET6', 'KMBET7', 'KMBET8']) {
    const [, k, j] = row(seed, 'milatro', ['j_mlnc_betrayal', 'j_poke_komala', 'j_joker']);
    oldRules('milatro', selectBlind);
    if (owned(k) && owned(j)) picked++;
  }
  ok(picked >= 1, 'old rules: Betrayal could pick Komala (it refused, the other Joker survived) on ' + picked + ' of 8 seeds', picked);
  const [, e] = row('KMBETE', 'milatro', ['j_mlnc_betrayal', 'j_joker']);
  e.set_eternal(true);
  selectBlind();
  ok(owned(e) && keys().length === 2, 'an Eternal Joker: skipped, as before');
});

// ------------------------------------------------------------------- BETMMA: the Tentacle edition
await sec('tentacle', () => {
  const tent = (rules, right) => {
    start('KMTEN', {}, { noBlind: true, mods: ['betmma'] });
    const t = add('j_joker'); t.set_edition('e_betmma_tentacle', true);
    const r = add(right);
    if (right === 'j_scary_face') r.set_eternal(true);
    rules(selectBlind);
    return { t, r };
  };
  let x = tent((f) => f(), 'j_poke_komala');
  ok(owned(x.r) && !x.r.getting_sliced && x.t.ability.mult === 4 && !x.t.ability.x_mult_added, 'Tentacle Joker, Komala to its right: not eaten, no values added (+4 Mult still)', [keys(), x.t.ability.mult]);
  const before = JSON.stringify(x.t.ability);
  x = tent((f) => oldRules('betmma', f), 'j_poke_komala');
  ok(owned(x.r) && JSON.stringify(x.t.ability) !== before, 'old rules: Komala refused, but its values were added to the Joker (as recorded)', x.t.ability);
  x = tent((f) => f(), 'j_scary_face');
  ok(owned(x.r) && x.t.ability.mult === 4, 'an Eternal to its right: safe, as before', x.t.ability.mult);
  x = tent((f) => f(), 'j_joker');
  ok(!owned(x.r), 'control: a plain Joker to its right is eaten');
});

// ------------------------------------------------------------------- More Fluff: Less Fluff
await sec('less fluff', () => {
  const [lf, k] = row('KMLF', 'morefluff', ['j_mf_lessfluff', 'j_poke_komala']);
  selectBlind();
  ok(owned(k) && !k.getting_sliced && Math.abs(lf.ability.extra.x_mult - 1) < 1e-9, 'Less Fluff with Komala: not sliced, no X Mult for it (X1)', [keys(), lf.ability.extra.x_mult]);
  const [lf2, k2, tri] = row('KMLF2', 'morefluff', ['j_mf_lessfluff', 'j_poke_komala', 'j_mf_triangle']);
  selectBlind();
  ok(owned(k2) && !owned(tri) && Math.abs(lf2.ability.extra.x_mult - 1.2) < 1e-9, 'Less Fluff, Komala, Triangle: Triangle goes (X1.2), Komala stays', [keys(), lf2.ability.extra.x_mult]);
  const [lf3, k3] = row('KMLF', 'morefluff', ['j_mf_lessfluff', 'j_poke_komala']);
  oldRules('morefluff', selectBlind);
  ok(owned(k3) && Math.abs(lf3.ability.extra.x_mult - 1.2) < 1e-9, 'old rules: Komala stayed and Less Fluff still gained X0.2 (as recorded)', lf3.ability.extra.x_mult);
  const lfe = (rules) => { const [l, e] = row('KMLFE', 'morefluff', ['j_mf_lessfluff', 'j_mf_triangle']); e.set_eternal(true); rules(selectBlind); return JSON.stringify([keys(), l.ability.extra.x_mult]); };
  ok(lfe((f) => f()) === lfe((f) => oldRules('morefluff', f)), 'an Eternal modded Joker: Less Fluff does the same as before', lfe((f) => f()));
});

// ------------------------------------------------------------------- a run recorded on the old pin replays as recorded
await sec('old-rev replay', () => {
  const deck = { name: 'Komala', mods: ['pokermon', 'morefluff'], params: { blind_scaling: 0.05 },
    cards: [['S_K', 0, 0, 0, 20], ['H_Q', 0, 0, 0, 20]],
    jokers: [{ key: 'j_mf_lessfluff' }, { key: 'j_poke_komala' }] };
  const record = (pins) => {
    const s = new Session();
    PINS.RULES.pins = pins;
    try {
      s.start({ seed: 'KMREC', mods: ['pokermon', 'morefluff'], customDeck: deck, engineRev: 1 }); // (engine rev 1: before Pages, as recorded)
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
  const lfx = () => { const l = G.jokers.cards.find((c) => key(c) === 'j_mf_lessfluff'); return l ? l.ability.extra.x_mult : null; };
  const komala = () => G.jokers.cards.some((c) => key(c) === 'j_poke_komala');
  const s2 = record({ morefluff: OLD.morefluff });
  const want = { x: lfx(), komala: komala(), chips: String(G.GAME.chips), round: G.GAME.round };
  ok(want.x > 1.3 && want.komala && want.round >= 3, 'the run on More Fluff rev 2: Less Fluff banked X0.2 a Blind off Komala, Komala stayed', want);
  const rec = JSON.parse(JSON.stringify(s2.recipe));
  rec.modVersions.morefluff = OLD.morefluff;
  ok(Session.pinDiff(rec).some((d) => d.id === 'morefluff'), 'a rev 2 recipe differs from the current pin (the resume prompt)', Session.pinDiff(rec));
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(rec)), { repin: true }); flush();
  const got = { x: lfx(), komala: komala(), chips: String(G.GAME.chips), round: G.GAME.round };
  ok(!r.stoppedAt && JSON.stringify(got) === JSON.stringify(want), 'resumed: every rev 2 move replays on rev 2 (the banked X kept)', { want, got });
  const st = Session.stepper(JSON.parse(JSON.stringify(rec)));
  st.seek(st.total); flush();
  ok(!st.error && st.index === rec.actions.length && lfx() === want.x, 'the replay stepper: the same', [st.error, lfx()]);
  record(null);
  ok(lfx() === 1 && komala(), 'the same moves on rev 3: Less Fluff gains nothing, Komala stays', lfx());
});

done();
