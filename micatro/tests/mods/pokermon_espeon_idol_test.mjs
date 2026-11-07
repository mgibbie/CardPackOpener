// The owner's Espeon rework, Future Sight (contentRev 57; jokers/pokejokers_07.js espeon; PORTING.md "The Espeon rework"):
//   +2 Foresight. Each scored card that is the round's card (rank AND suit, matched as The Idol: get_id, is_suit so a Wild card counts,
//   a debuffed card never) gives X2.5 Mult and retriggers once; each Foreseen card (the top of the deck, G.scry_view) that is the
//   round's card gives X1.5. Energy: both per-card X +5% of base (2.625 / 2.75 / 2.875 and 1.575 / 1.65 / 1.725); retrigger and
//   Foresight fixed. Old saves (contentRev 56: {scry, Xmult}) load and are normalised.
// Every ability is FIRED through real plays with exact numbers.
//   node micatro/tests/mods/pokermon_espeon_idol_test.mjs
import { readFileSync } from 'fs';
// (Session runs here start with engineRev: 1 = the rules before Pages: these suites measure the mod alone)
import { T, start, hand, add, play, G, P_CENTERS, STATES } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { Session } from '../../js/engine/session.js';
import { create_playing_card, P_CARDS } from '../../js/engine/core.js';
import { increment_energy } from '../../mods/pokermon/systems/energy.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 500)); } };
const ex = (j) => j.ability.extra;
const lines = (j) => describe(j).lines.join(' | ');
/** The round's card: the King of Hearts. */
const kingOfHearts = () => { const cr = G.GAME.current_round; cr.espeon_rank = 'King'; cr.espeon_id = 13; cr.espeon_suit = 'Hearts'; };
/** Put fresh cards on top of the deck (the last one given is the very top): they are the Foreseen cards. */
function top(keys, opts = {}) {
  return keys.map((k) => {
    const c = create_playing_card({ front: P_CARDS[k], center: P_CENTERS[opts.center || 'c_base'] }, G.deck);
    const i = G.deck.cards.indexOf(c);
    if (i >= 0) G.deck.cards.splice(i, 1);
    G.deck.cards.push(c); c.area = G.deck;
    return c;
  });
}
/** Two plain non-matching cards on top: nothing Foreseen matches. */
const cleanTop = () => top(['C_3', 'C_4']);

sec('static', () => {
  start('ESPS');
  const c = P_CENTERS.j_poke_espeon;
  ok(c && !c.unported && c.ptype === 'Psychic' && c.stage === 'One' && c.rarity === 'poke_safari' && c.cost === 7, 'Psychic, Stage 1, Safari $7', c && [c.ptype, c.stage, c.rarity, c.cost]);
  const e = c.config.extra;
  ok(e.scry === 2 && e.Xmult_multi === 2.5 && e.Xmult_multi2 === 1.5 && e.retriggers === 1 && e.Xmult === undefined, 'config: +2 Foresight, X2.5 / X1.5 per card, 1 retrigger (no old Xmult)', e);
  ok(c.blueprint_compat === true, 'Blueprint-compatible');
  ok(MODS.pokermon.contentRev >= 57 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev && PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'pinned 3.9.1+r57 or later (r58 the Yamask nerf); LEGACY_MOD_VERSIONS untouched', PINS.modPin('pokermon'));
  const ev = add('j_poke_eevee'); ev.ability.extra.evolve = 'sunstone';
  G.GAME.chips = G.GAME.blind.chips; play(hand(['S_2']), { keepChips: true }); flush();
  ok(key(ev) === 'j_poke_espeon', 'Eevee + Sun Stone still evolves into Espeon', key(ev));
});

sec('tooltip', () => {
  start('ESPT');
  const j = add('j_poke_espeon');
  kingOfHearts();
  const d = describe(j);
  const txt = d.lines.join(' | ');
  ok(txt.includes('King of Hearts') && d.colours && d.colours[0] === 'SUITS.Hearts', 'the tooltip names the round\'s card "King of Hearts" in Hearts\' colour', [txt, d.colours]);
  ok(txt.includes('{C:purple}+2 Foresight') && txt.includes('X2.5') && txt.includes('X1.5') && /retriggers/.test(txt) && /Foreseen/.test(txt) && !/top card/.test(txt), 'it says +2 Foresight, retriggers, X2.5, Foreseen X1.5 (no old top-card text)', txt);
  const cr = G.GAME.current_round; cr.espeon_rank = 'Queen'; cr.espeon_id = 12; cr.espeon_suit = 'Spades';
  ok(lines(j).includes('Queen of Spades') && describe(j).colours[0] === 'SUITS.Spades', 'follows the round\'s card (Queen of Spades)', lines(j));
  console.log('    text:', describe(j).lines.join(' / '));
});

sec('played', () => {
  start('ESPP');
  const j = add('j_poke_espeon');
  ok(G.GAME.scry_amount === 2, '+2 Foresight', G.GAME.scry_amount);
  kingOfHearts();
  cleanTop();
  let r = play(hand(['H_K']));
  ok(r.total.chips === 5 + 10 + 10 && near(r.total.mult, 2.5 * 2.5), 'the King of Hearts retriggers and gives X2.5 twice (High Card: 25 chips, X6.25)', r.total);
  ok(r.events.some((e) => e.type === 'status' && /Again/.test(String(e.message || ''))), '"Again!"');
  cleanTop();
  r = play(hand(['H_Q']));
  ok(r.total.chips === 15 && r.total.mult === 1, 'the Queen of Hearts (right suit, wrong rank): nothing', r.total);
  cleanTop();
  r = play(hand(['S_K']));
  ok(r.total.chips === 15 && r.total.mult === 1, 'the King of Spades (right rank, wrong suit): nothing', r.total);
  cleanTop();
  r = play(hand(['S_K'], { center: 'm_wild' }));
  ok(near(r.total.mult, 6.25), 'a Wild King counts as the King of Hearts (is_suit)', r.total);
  cleanTop();
  const deb = hand(['H_K'])[0]; deb.ability.perma_debuff = true; deb.set_debuff(true);
  r = play([deb]);
  ok(r.total.mult === 1, 'a debuffed King of Hearts: nothing', r.total);
  cleanTop();
  r = play(hand(['H_K', 'D_K']));
  ok(near(r.total.mult, 2 * 6.25) && r.total.chips === 10 + 10 + 10 + 10, 'a Pair of Kings (10 chips, 2 Mult): only the King of Hearts retriggers / multiplies', r.total);
  // held in hand: nothing (Espeon is played and Foreseen cards only)
  cleanTop();
  const held = hand(['H_K'])[0];
  r = play(hand(['S_2']));
  ok(r.total.mult === 1 && G.hand.cards.includes(held), 'a King of Hearts held in hand: nothing', r.total);
  ok(key(j) === 'j_poke_espeon', 'still Espeon');
});

sec('foreseen', () => {
  start('ESPF');
  add('j_poke_espeon');
  kingOfHearts();
  top(['C_3', 'H_K']);
  let r = play(hand(['S_2']));
  ok(r.total.chips === 7 && near(r.total.mult, 1.5), 'a Foreseen King of Hearts gives X1.5', r.total);
  top(['H_K', 'H_K']);
  r = play(hand(['S_2']));
  ok(near(r.total.mult, 2.25), 'two Foreseen Kings of Hearts: X1.5 each', r.total);
  const [a, b] = top(['H_K', 'C_3']);
  ok(G.scry_view.cards.includes(a) && G.scry_view.cards.includes(b), 'setup: both on top (Foreseen)');
  r = play(hand(['S_2']));
  ok(near(r.total.mult, 1.5), 'second from the top still Foreseen (+2 Foresight): X1.5', r.total);
  top(['H_K', 'C_3', 'C_4']);
  r = play(hand(['S_2']));
  ok(r.total.mult === 1, 'third from the top: not Foreseen, nothing', r.total);
  const [d] = top(['C_3', 'H_K']).slice(1); d.ability.perma_debuff = true; d.set_debuff(true);
  r = play(hand(['S_2']));
  ok(r.total.mult === 1, 'a debuffed Foreseen King of Hearts: nothing', r.total);
  top(['C_3', 'D_K']);
  r = play(hand(['S_2']));
  ok(r.total.mult === 1, 'a Foreseen King of Diamonds: nothing', r.total);
  // played AND Foreseen in the same hand: X2.5 x2 then X1.5
  top(['C_3', 'H_K']);
  r = play(hand(['H_K']));
  ok(near(r.total.mult, 2.5 * 2.5 * 1.5) && r.total.chips === 25, 'played and Foreseen at once: X2.5 twice, then X1.5', r.total);
});

sec('mime', () => {
  start('ESPM');
  add('j_poke_espeon'); add('j_mime');
  kingOfHearts();
  top(['C_3', 'H_K']);
  hand(['H_K']); // a King of Hearts held: Mime retriggers held cards, Espeon gives held cards nothing
  const r = play(hand(['S_2']));
  ok(near(r.total.mult, 1.5), 'with Mime: the Foreseen X1.5 fires once (X2.25 if retriggered), the held King nothing', r.total);
});

sec('blueprint', () => {
  start('ESPB');
  add('j_blueprint'); add('j_poke_espeon');
  ok(key(G.jokers.cards[0]) === 'j_blueprint', 'Blueprint left of Espeon');
  kingOfHearts();
  cleanTop();
  let r = play(hand(['H_K']));
  // 1 + Espeon's retrigger + Blueprint's copied retrigger = 3 scorings, each X2.5 (Espeon) and X2.5 (Blueprint)
  ok(r.total.chips === 5 + 30 && near(r.total.mult, Math.pow(2.5, 6)), 'Blueprint copies the retrigger and the X2.5: 3 scorings x X2.5 x2', r.total);
  top(['C_3', 'H_K']);
  r = play(hand(['S_2']));
  ok(near(r.total.mult, 2.25), 'Blueprint copies the Foreseen X1.5', r.total);
  start('ESPB2');
  add('j_poke_espeon'); add('j_brainstorm');
  ok(key(G.jokers.cards[0]) === 'j_poke_espeon' && key(G.jokers.cards[1]) === 'j_brainstorm', 'Espeon leftmost, Brainstorm copies it');
  kingOfHearts();
  cleanTop();
  r = play(hand(['H_K']));
  ok(near(r.total.mult, Math.pow(2.5, 6)), 'Brainstorm copies it too', r.total);
});

sec('energy', () => {
  start('ESPE');
  const j = add('j_poke_espeon');
  kingOfHearts();
  const want = [[2.625, 1.575], [2.75, 1.65], [2.875, 1.725]];
  for (let n = 0; n < 3; n++) {
    increment_energy(j, 'Psychic');
    ok(near(ex(j).Xmult_multi, want[n][0]) && near(ex(j).Xmult_multi2, want[n][1]) && ex(j).retriggers === 1 && ex(j).scry === 2,
      `${n + 1} Energy: X${want[n][0]} / X${want[n][1]}; retrigger and Foresight fixed`, ex(j));
  }
  ok(G.GAME.scry_amount === 2, 'Foresight stays +2', G.GAME.scry_amount);
  cleanTop();
  let r = play(hand(['H_K']));
  ok(near(r.total.mult, 2.875 * 2.875), '3 Energy: X2.875 twice', r.total);
  top(['C_3', 'H_K']);
  r = play(hand(['S_2']));
  ok(near(r.total.mult, 1.725), '3 Energy: Foreseen X1.725', r.total);
  ok(lines(j).includes('X2.875') && lines(j).includes('X1.725'), 'the tooltip shows the energized values', lines(j));
  start('ESPE2');
  const k = add('j_poke_espeon');
  increment_energy(k, 'Colorless');
  ok(near(ex(k).Xmult_multi, 2.5625) && near(ex(k).Xmult_multi2, 1.5375), 'a Colorless Energy: half (X2.5625 / X1.5375)', ex(k));
});

sec('legacy extra', () => {
  start('ESPL');
  const j = add('j_poke_espeon');
  // the contentRev-56 shape, energized once (X2.5 -> X3)
  j.ability.extra = { Xmult: 3, scry: 2, ptype: 'Psychic', energy_count: 1 };
  let d = null;
  try { d = describe(j); } catch (e) { d = null; }
  ok(d && d.lines.join(' ').includes('X2.625') && d.lines.join(' ').includes('X1.575'), 'an old Espeon\'s tooltip reads the new values with its 1 Energy', d && d.lines);
  ok(near(ex(j).Xmult_multi, 2.625) && near(ex(j).Xmult_multi2, 1.575) && ex(j).retriggers === 1 && ex(j).Xmult === undefined && ex(j).energy_count === 1, 'normalised: per-card X from base with its Energy, retrigger 1, old Xmult dropped', ex(j));
  const k = add('j_poke_espeon');
  k.ability.extra = { Xmult: 2.5, scry: 2, ptype: 'Psychic' };
  for (const x of G.jokers.cards.slice()) if (x !== k) { x.remove_from_deck(); x.remove(); }
  flush();
  kingOfHearts();
  cleanTop();
  const r = play(hand(['H_K']));
  ok(near(r.total.mult, 6.25) && r.total.chips === 25, 'an old Espeon met in scoring plays the new ability (X2.5 twice)', [r.total, ex(k)]);
  increment_energy(k, 'Psychic');
  ok(near(ex(k).Xmult_multi, 2.625) && ex(k).Xmult === undefined, 'and energizes on the new fields', ex(k));
});

sec('save and resume', () => {
  const s = new Session();
  s.start({ engineRev: 1, seed: 'ESPRES', mods: ['pokermon'], customDeck: { name: 'Sunstone', mods: ['pokermon'], jokers: [{ key: 'j_poke_espeon' }] } });
  flush();
  s.act({ type: 'select_blind' }); flush();
  const j = G.jokers.cards.find((c) => key(c) === 'j_poke_espeon');
  increment_energy(j, 'Psychic'); // (not an action: a resume rebuilds without it — checked below)
  const cr = G.GAME.current_round;
  const card0 = [cr.espeon_rank, cr.espeon_id, cr.espeon_suit];
  s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush();
  const rec = JSON.parse(JSON.stringify(s.recipe));
  ok(rec.modVersions.pokermon === PINS.modPin('pokermon'), 'a new run records the current pin (3.9.1+r57 or later)', rec.modVersions);
  const r = Session.fromRecipe(rec); flush();
  const j2 = G.jokers.cards.find((c) => key(c) === 'j_poke_espeon');
  ok(!r.stoppedAt && j2 && ex(j2).Xmult_multi === 2.5 && ex(j2).Xmult_multi2 === 1.5 && ex(j2).retriggers === 1 && G.GAME.scry_amount === 2, 'resume: Espeon comes back with its fields and +2 Foresight', [r.stoppedAt, j2 && ex(j2), G.GAME.scry_amount]);
  const cr2 = G.GAME.current_round;
  ok(JSON.stringify([cr2.espeon_rank, cr2.espeon_id, cr2.espeon_suit]) === JSON.stringify(card0), 'resume: the same round\'s card', [card0, [cr2.espeon_rank, cr2.espeon_id, cr2.espeon_suit]]);
  ok(G.STATE === STATES.SELECTING_HAND && G.GAME.current_round.hands_played === 1, 'resume: back in the round after the first hand', [G.STATE, G.GAME.current_round.hands_played]);
});

sec('old recipe (r56)', () => {
  const FIX = JSON.parse(readFileSync(new URL('../fixtures/pokermon_espeon_r56_recipe.json', import.meta.url), 'utf8'));
  for (const [name, rec] of [['mid', FIX.mid], ['full', FIX.full]]) {
    ok(rec.modVersions.pokermon === '3.9.1+r56', `${name}: recorded on 3.9.1+r56`, rec.modVersions);
    const diff = Session.pinDiff(rec);
    ok(diff.length === 1 && diff[0].id === 'pokermon' && diff[0].current === PINS.modPin('pokermon'), `${name}: the resume prompt names the Pokermon change`, diff);
    let s = null;
    try { s = Session.fromRecipe(rec, { repin: true }); } catch (e) { ok(false, name + ': fromRecipe threw ' + e.message); continue; }
    flush();
    ok(!s.stoppedAt || (!/engine error/.test(s.stoppedAt.error) && s.stoppedAt.index > 0), `${name}: the moves replay (or stop at a move the new rules reject, no engine error)`, s.stoppedAt);
    if (name === 'mid') ok(!s.stoppedAt, 'mid: every move replays', s.stoppedAt);
    const jk = G.jokers.cards.filter((c) => key(c) === 'j_poke_espeon');
    ok(jk.length === 1 && ex(jk[0]).Xmult_multi === 2.5 && ex(jk[0]).retriggers === 1 && ex(jk[0]).Xmult === undefined, `${name}: Espeon is there on the new ability`, jk.map((c) => ex(c)));
    ok(s.recipe.modVersions.pokermon === PINS.modPin('pokermon') && Session.pinDiff(s.recipe).length === 0, `${name}: re-pinned`, s.recipe.modVersions);
    const st = G.STATE;
    ok([STATES.BLIND_SELECT, STATES.SELECTING_HAND, STATES.SHOP, STATES.ROUND_EVAL].includes(st), `${name}: a live run state`, st);
  }
});

done();
