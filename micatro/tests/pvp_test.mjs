// Micatro Multiplayer (PvP): the engine's match rules (engine/pvp.js) and its recorded actions.
//   the Nemesis from pvpStart, READY-only start (pvp_start_blind), no target + every hand played, PVP_WAIT, the
//   referee's pvp_outcome (lives, comeback money, no unused-hands money), a failed normal blind (counts as passed,
//   a life, logged), skips logged, deck-out, out of lives, pvp_end, bans (Attrition + the mods'), forced mod options,
//   Pages never on the Nemesis, reroll_boss keeps it, recipe resume + replay re-simulate exactly, and a solo run is untouched.
//   node micatro/tests/pvp_test.mjs
import { G, P_BLINDS } from '../js/engine/core.js';
import { newRun, act, STATE_NAMES } from '../js/engine/run.js';
import { toView } from '../js/engine/view.js';
import { Session, PVP_SAVE_KEY, viewChecksum, ReplayStepper } from '../js/engine/session.js';
import { NEMESIS, ATTRITION_BANS, PVP_MOD_BANS, pvpMods, pvpBannedKeys } from '../js/engine/pvp.js';
import { ACTIVE } from '../js/mods/registry.js';
import { PAGE_ODDS } from '../js/engine/pages.js';

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const st = () => STATE_NAMES[G.STATE];
const CFG = { lives: 4, pvpStart: 2, deathOnLoss: true, comeback: true };

/** Play the selected blind to a win (the score topped up to one short first). */
function win(A = act) {
  G.GAME.chips = Math.max(0, G.GAME.blind.chips - 1);
  A({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
  A({ type: 'play' });
}
function shopToNext(A = act) { ok(A({ type: 'cash_out' }).ok, 'cash out'); ok(A({ type: 'next_round' }).ok, 'leave shop'); }
/** Beat the blind on deck (a normal one). */
function beat(A = act) { ok(A({ type: 'select_blind' }).ok, 'select ' + G.GAME.blind_on_deck); win(A); ok(st() === 'ROUND_EVAL', 'round eval after a win, got ' + st()); shopToNext(A); }
/** Play one weak card per hand (never reaching a target). */
const weak = (A = act) => { A({ type: 'highlight', ids: [G.hand.cards[G.hand.cards.length - 1].sort_id] }); return A({ type: 'play' }); };

// ---- a solo run is untouched
newRun({ seed: 'PVPSOLO1', back: 'b_red', stake: 1 });
ok(!G.GAME.pvp && !ACTIVE.includes('pvp') && G.GAME.win_ante === 8 && !G.GAME.banned_keys.j_mr_bones, 'a solo run: no PvP state, no internal mod, win at ante 8, no bans');
for (let i = 0; i < 3; i++) beat();
for (let i = 0; i < 2; i++) beat();
ok(G.GAME.round_resets.blind_choices.Boss !== NEMESIS, 'a solo run never meets the Nemesis');

// ---- a PvP run
newRun({ seed: 'PVPTEST1', back: 'b_red', stake: 1, pvp: CFG });
ok(G.GAME.pvp && G.GAME.pvp.lives === 4 && G.GAME.win_ante === 999 && !G.GAME.mods.includes('pvp'), 'PvP run: 4 lives, no ante-8 win, the internal mod is not listed');
ok(ATTRITION_BANS.every((k) => G.GAME.banned_keys[k]) && PVP_MOD_BANS.pokermon.every((k) => G.GAME.banned_keys[k]), 'Attrition bans + the mods\' PvP bans are banned');
ok(G.GAME.round_resets.blind_choices.Boss !== NEMESIS, 'ante 1 (before pvpStart) has a normal boss');
ok(P_BLINDS[G.GAME.round_resets.blind_choices.Boss] && !['bl_wall', 'bl_final_vessel'].includes(G.GAME.round_resets.blind_choices.Boss), 'a normal boss is drawn');
beat();
// a skip is logged for the referee (counts as beaten)
ok(act({ type: 'skip_blind' }).ok, 'skip the Big blind');
const sk = G.GAME.pvp.blinds.at(-1);
ok(sk && sk.ante === 1 && sk.slot === 'Big' && sk.r === 'skip', 'a skip is logged', JSON.stringify(sk));
beat();
ok(G.GAME.round_resets.ante === 2, 'ante 2');
ok(G.GAME.pvp.blinds.map((b) => b.slot + ':' + b.r).join(',') === 'Small:beat,Big:skip,Boss:beat', 'beaten blinds are logged ' + JSON.stringify(G.GAME.pvp.blinds));
ok(G.GAME.round_resets.blind_choices.Boss === NEMESIS, 'from ante 2 the Boss is Your Nemesis');
// a failed normal blind: no game over, a life, logged, reward paid, comeback money
ok(act({ type: 'select_blind' }).ok, 'select Small (ante 2)');
const smallReward = G.GAME.blind.dollars;
for (let i = 0; i < 6 && st() === 'SELECTING_HAND'; i++) weak();
ok(!G.GAME.over && st() === 'ROUND_EVAL', 'a failed normal blind never ends the run, got ' + st());
ok(G.GAME.pvp.lives === 3, 'a failed normal blind costs a life (deathOnLoss)');
ok(JSON.stringify(G.GAME.pvp.blinds.at(-1)) === JSON.stringify({ ante: 2, slot: 'Small', r: 'fail' }), 'the failure is logged for the referee');
const rows = G.GAME.round_eval.rows;
ok(rows.find((r) => r.name === 'blind1').dollars === smallReward, 'the failed blind still pays its reward (counts as passed)');
ok((rows.find((r) => r.name === 'pvp_comeback') || {}).dollars === 4, 'comeback money: $4 at the next cash-out after a life lost');
shopToNext();
beat();
ok(G.GAME.blind_on_deck === 'Boss' && st() === 'BLIND_SELECT', 'the Nemesis is up');
// the Nemesis: READY only
const sel = act({ type: 'select_blind' });
ok(!sel.ok && /READY/.test(sel.error), 'select_blind on the Nemesis is refused (press READY)');
ok(!act({ type: 'pvp_outcome', result: 'win', lives: 3 }).ok, 'no outcome before the round started');
const ps = act({ type: 'pvp_start_blind' });
ok(ps.ok && st() === 'SELECTING_HAND' && G.GAME.blind.config.blind.key === NEMESIS && +G.GAME.blind.chips === 0, 'pvp_start_blind enters the Nemesis: no score target');
ok(toView().pvp.nemesis === true && toView().blind.key === NEMESIS, 'the view says we are in the Nemesis');
win();
ok(st() === 'SELECTING_HAND' && G.GAME.current_round.hands_left === 3, 'a big hand does not end the Nemesis: every hand is played, got ' + st());
for (let i = 0; i < 5 && st() === 'SELECTING_HAND'; i++) weak();
ok(st() === 'PVP_WAIT' && G.GAME.current_round.hands_left === 0, 'out of hands -> PVP_WAIT (waiting for the opponent), got ' + st());
ok(!act({ type: 'play' }).ok && !act({ type: 'select_blind' }).ok, 'nothing to do while waiting');
const out = act({ type: 'pvp_outcome', result: 'lose', lives: 2 });
ok(out.ok && st() === 'ROUND_EVAL' && G.GAME.pvp.lives === 2, 'pvp_outcome lose -> the round ends, lives from the referee');
const r2 = G.GAME.round_eval.rows;
ok(r2.find((r) => r.name === 'blind1').dollars === 5 && !r2.some((r) => r.name === 'hands'), 'the Nemesis pays $5 and no unused-hands money');
ok((r2.find((r) => r.name === 'pvp_comeback') || {}).dollars === 4, 'a lost Nemesis round earns comeback money');
ok(G.GAME.round_resets.ante === 3 && !G.GAME.won, 'the ante advances; no win');
shopToNext();
// ante 3: an early end with hands left (the opponent is out and behind)
beat(); beat();
ok(act({ type: 'pvp_start_blind' }).ok, 'ante 3 Nemesis');
weak();
const early = act({ type: 'pvp_outcome', result: 'win', lives: 2 });
ok(early.ok && st() === 'ROUND_EVAL' && G.GAME.current_round.hands_left > 0, 'the referee can end the round while hands are left');
const r3 = G.GAME.round_eval.rows;
ok(!r3.some((r) => r.name === 'hands') && !r3.some((r) => r.name === 'pvp_comeback'), 'a won round: no unused-hands money, no comeback');
ok(JSON.stringify(G.GAME.pvp.rounds.map((r) => r.result)) === '["lose","win"]', 'the rounds are recorded');
shopToNext();
// reroll_boss can never swap the Nemesis out
beat(); beat();
G.GAME.used_vouchers.v_retcon = true; G.GAME.dollars = 50;
ok(act({ type: 'reroll_boss' }).ok && G.GAME.round_resets.blind_choices.Boss === NEMESIS, 'a boss reroll keeps the Nemesis');
// deck-out in the Nemesis -> out of hands
ok(act({ type: 'pvp_start_blind' }).ok, 'ante 4 Nemesis');
while (G.deck.cards.length) G.discard.emplace(G.deck.cards.pop());
while (G.hand.cards.length > 1) G.discard.emplace(G.hand.cards.pop());
weak();
ok(st() === 'PVP_WAIT' && G.GAME.current_round.hands_left === 0, 'out of cards in the Nemesis -> out of hands, waiting; got ' + st());
ok(act({ type: 'pvp_outcome', result: 'tie', lives: 2 }).ok, 'a tie');
// out of lives
G.GAME.pvp.lives = 0;
ok(!act({ type: 'cash_out' }).ok, 'out of lives: the run waits for the match result');
const end = act({ type: 'pvp_end', result: 'lose' });
ok(end.ok && G.GAME.over && !G.GAME.won && toView().pvp.result === 'lose', 'pvp_end lose -> game over');
ok(!(end.events || []).some((e) => e.type === 'win'), 'no solo "win" event (no stickers, no board)');

// ---- recipes: resume + replay rebuild the PvP run exactly; the save key is its own
{
  // (played for real — no score top-ups, which a recipe can't record: every normal blind is failed, at no cost of lives)
  const s = new Session();
  s.start({ seed: 'PVPREC01', back: 'b_blue', stake: 2, pvp: { ...CFG, deathOnLoss: false }, engineRev: 1 });
  ok(s.recipe.pvp && s.recipe.pvp.lives === 4 && s.recipe.pvp.deathOnLoss === false && !s.recipe.seeded, 'the recipe carries the match config; the lobby seed is not a typed one');
  const A = (a) => s.act(a);
  const lose = () => { A({ type: 'select_blind' }); for (let i = 0; i < 9 && st() === 'SELECTING_HAND'; i++) weak(A); shopToNext(A); };
  for (let i = 0; i < 5; i++) lose();
  ok(G.GAME.pvp.lives === 4 && G.GAME.round_resets.ante === 2, 'deathOnLoss off: failed blinds cost no life');
  A({ type: 'pvp_start_blind' }); weak(A); A({ type: 'pvp_outcome', result: 'win', lives: 4 });
  shopToNext(A);
  ok(s.recipe.actions.some((a) => a.type === 'pvp_start_blind') && s.recipe.actions.some((a) => a.type === 'pvp_outcome'), 'the referee actions are recorded');
  const cs = viewChecksum(toView());
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe)));
  ok(!r.stoppedAt && viewChecksum(toView()) === cs, 'resume rebuilds the PvP run exactly');
  ok(r.saveKey === PVP_SAVE_KEY, 'a PvP recipe resumes into its own save slot');
  const step = new ReplayStepper(JSON.parse(JSON.stringify(s.recipe)));
  const sc = step.scan();
  ok(!sc.end.error && sc.end.checksum === cs, 'the replay re-simulates the PvP run exactly');
  const solo = new Session();
  ok(solo.saveKey !== PVP_SAVE_KEY, 'a solo session keeps the solo save key');
}

// ---- Pages: on normal blinds as in solo, never on the Nemesis
{
  const was = PAGE_ODDS.chance;
  PAGE_ODDS.chance = 1;
  const s = new Session();
  s.start({ seed: 'PVPPAGE1', pvp: CFG });
  const A = (a) => s.act(a);
  ok(A({ type: 'select_blind' }).ok && st() === 'PAGES', 'Pages are offered on a normal blind in a PvP run');
  const offer = JSON.stringify(G.GAME.pages.choices);
  A({ type: 'pick_page', index: 0 }); win(A); shopToNext(A);
  for (let i = 0; i < 2; i++) { A({ type: 'select_blind' }); A({ type: 'pick_page', index: 0 }); win(A); shopToNext(A); }
  for (let i = 0; i < 2; i++) { A({ type: 'select_blind' }); A({ type: 'pick_page', index: 0 }); win(A); shopToNext(A); }
  ok(G.GAME.round_resets.blind_choices.Boss === NEMESIS && G.GAME.blind_on_deck === 'Boss', 'at the Nemesis');
  ok(A({ type: 'pvp_start_blind' }).ok && st() === 'SELECTING_HAND' && !G.GAME.page, 'no Pages screen on the Nemesis');
  const s2 = new Session();
  s2.start({ seed: 'PVPPAGE1', pvp: CFG });
  s2.act({ type: 'select_blind' });
  ok(JSON.stringify(G.GAME.pages.choices) === offer, 'both players (same seed) get the same Pages offer');
  PAGE_ODDS.chance = was;
}

// ---- mods: forced options
{
  const pm = pvpMods(['bunco', 'pokermon'], { bunco: { gameplay_reworks: true, other: 1 } });
  ok(pm.ids.includes('pvp') && pm.options.bunco.gameplay_reworks === false && pm.options.bunco.other === 1, "Bunco's gameplay reworks are forced off; the host's other options kept");
  ok(pvpBannedKeys().length > 60, 'the ban list covers Attrition + the mods (' + pvpBannedKeys().length + ' keys)');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
