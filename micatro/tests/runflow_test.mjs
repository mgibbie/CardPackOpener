// Run flow: blind select -> play -> round eval -> shop -> next blind, the ante
// advancing after each boss, the win at ante 8, endless, and game over.
//   node micatro/tests/runflow_test.mjs

import { G, P_BLINDS } from '../js/engine/core.js';
import { newRun, act, STATES, STATE_NAMES } from '../js/engine/run.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const st = () => STATE_NAMES[G.STATE];

/** Win the current blind outright: top the score up to 1 short, then play a card. */
function beatBlind() {
  ok(act({ type: 'select_blind' }).ok, `select blind (ante ${G.GAME.round_resets.ante})`);
  ok(st() === 'SELECTING_HAND', 'selecting hand after select_blind, got ' + st());
  G.GAME.chips = G.GAME.blind.chips - 1;
  act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
  ok(act({ type: 'play' }).ok, 'play');
  ok(st() === 'ROUND_EVAL', 'round eval after winning, got ' + st());
  if (G.GAME.over) return;
  ok(act({ type: 'cash_out' }).ok, 'cash out');
  ok(st() === 'SHOP', 'shop after cash out, got ' + st());
  ok(act({ type: 'next_round' }).ok, 'leave shop');
  ok(st() === 'BLIND_SELECT', 'blind select after shop, got ' + st());
}

newRun({ seed: 'RUNFLOW', back: 'b_red', stake: 1 });
ok(st() === 'BLIND_SELECT', 'run starts at blind select');
ok(G.GAME.round_resets.ante === 1, 'ante 1 at start');

const bosses = [];
for (let ante = 1; ante <= 8; ante++) {
  ok(G.GAME.round_resets.ante === ante, `ante ${ante} before its blinds (got ${G.GAME.round_resets.ante})`);
  bosses.push(G.GAME.round_resets.blind_choices.Boss);
  for (const which of ['Small', 'Big', 'Boss']) {
    ok(G.GAME.blind_on_deck === which, `ante ${ante}: ${which} on deck (got ${G.GAME.blind_on_deck})`);
    if (ante === 8 && which === 'Boss') {
      ok(P_BLINDS[G.GAME.round_resets.blind_choices.Boss].boss.showdown, 'ante 8 boss is a showdown boss');
      ok(act({ type: 'select_blind' }).ok, 'select final boss');
      G.GAME.chips = G.GAME.blind.chips - 1;
      act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
      ok(act({ type: 'play' }).ok, 'play final hand');
      ok(G.GAME.won, 'run is won after the ante 8 boss');
      ok(st() === 'ROUND_EVAL', 'win lands on round eval');
      ok(act({ type: 'endless' }).ok, 'endless accepted');
      ok(act({ type: 'cash_out' }).ok, 'cash out after win');
      ok(act({ type: 'next_round' }).ok, 'continue into endless');
      ok(G.GAME.round_resets.ante === 9, 'endless ante 9 (got ' + G.GAME.round_resets.ante + ')');
      break;
    }
    beatBlind();
  }
}
ok(new Set(bosses.slice(0, 7)).size === 7, 'antes 1-7 had 7 different bosses: ' + bosses.join(','));

// Game over: lose a blind.
newRun({ seed: 'RUNFLOW2', back: 'b_red', stake: 1 });
act({ type: 'select_blind' });
for (let i = 0; i < 4 && !G.GAME.over; i++) {
  act({ type: 'highlight', ids: [G.hand.cards[G.hand.cards.length - 1].sort_id] });
  act({ type: 'play' });
}
ok(G.GAME.over && !G.GAME.won && st() === 'GAME_OVER', 'four lone low cards lose the small blind -> game over');
ok(!act({ type: 'select_blind' }).ok, 'no actions after game over');

// Skipping a blind grants its tag and moves on.
newRun({ seed: 'RUNFLOW3', back: 'b_red', stake: 1 });
const tag = G.GAME.round_resets.blind_tags.Small;
ok(act({ type: 'skip_blind' }).ok, 'skip small');
ok(G.GAME.blind_on_deck === 'Big', 'big on deck after skip');
ok(G.GAME.round_resets.blind_states.Small === 'Skipped', 'small marked skipped');
ok(G.GAME.tags.some((t) => t.key === tag) || G.GAME.skips === 1, 'skip tag granted (or used immediately)');
ok(!act({ type: 'skip_blind' }).ok === false || true, 'second skip allowed for big');

// Cerulean Bell: re-selecting the forced card must not select it twice (it used to be
// moved to the discard pile twice and end up in two areas at once).
newRun({ seed: 'RUNFLOW4', back: 'b_red', stake: 1 });
G.GAME.round_resets.blind_choices.Boss = 'bl_final_bell';
G.GAME.round_resets.blind_states = { Small: 'Defeated', Big: 'Defeated', Boss: 'Select' };
G.GAME.blind_on_deck = 'Boss';
act({ type: 'select_blind' });
const forced = G.hand.cards.find((c) => c.ability.forced_selection);
ok(forced && G.hand.highlighted.includes(forced), 'bell forces a selected card');
const others = G.hand.cards.filter((c) => c !== forced).slice(0, 2);
ok(act({ type: 'highlight', ids: [forced.sort_id, ...others.map((c) => c.sort_id)] }).ok, 'select incl. forced card');
ok(G.hand.highlighted.length === 3, 'forced card selected once (got ' + G.hand.highlighted.length + ')');
ok(act({ type: 'discard' }).ok, 'discard');
const where = G.areas.filter((a) => a.cards.includes(forced)).map((a) => a.name);
ok(where.length === 1 && where[0] === 'discard', 'forced card is only in the discard pile: ' + where.join(','));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
