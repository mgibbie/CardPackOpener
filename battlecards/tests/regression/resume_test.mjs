// resume_test.mjs — Phase 1 deterministic mid-fight resume (the run-fight scenario).
// Models what game.js now does for a single-player run: seed the fight, snapshot the live board mid-play,
// then restore via fromSnapshot on resume. Asserts BOTH players' hands (exact cards + uids) AND deck ORDER
// come back identical, plus board/mana/turn — and that seeded play continues on the same timeline.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';
import { normalize } from '../../engine/serialize.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const digest = st => JSON.stringify(normalize(st));
const ids = z => z.map(c => c.id).join(',');
const uids = z => z.map(c => c.uid).join(',');

// a run fight: seeded game (game.js uses seededGame() → E.seededRng(randomSeed)), player 0 a real deck,
// player 1 an "enemy" deck dealt like the boot fns do (resetDeckAndHand + draw 4).
function runFight(seed) {
  const deck0 = Array.from({ length: 30 }, () => 'chillwind_yeti');
  const enemy = Array.from({ length: 30 }, () => 'bloodfen_raptor');
  const st = E.createGame(byId, seededRng(seed), [...deck0], 2, [{ id: 'mage', name: 'You', power: null }, { id: 'mage', name: 'Foe', power: null }]);
  st.classPicks = [{ id: 'mage', name: 'You' }, { id: 'mage', name: 'Foe' }];
  E.resetDeckAndHand(st, 1, [...enemy]);
  E.drawCards(st, 1, 4);
  return st;
}
// play a few settled actions so hands/board/deck are non-trivial
function playSome(st) {
  for (let t = 0; t < 3; t++) {
    const p = st.players[st.current];
    // play the cheapest affordable creature from hand, if any
    const c = p.hand.find(x => x.type === 'creature' && (x.cost || 0) <= (p.mana.cur || 0));
    if (c) { try { E.playCard(st, st.current, c.uid, null, null); } catch (e) {} }
    E.endTurn(st);
  }
}

// ── the core guarantee: mid-fight snapshot → restore is byte-identical for both seats ──
{
  const live = runFight(12345);
  playSome(live);
  ok('mid-fight state is valid', validateGameState(live).length === 0);
  // game.js saveRunSnapshot: deep-copy toSnapshot (toSnapshot shares players by reference)
  const wire = JSON.parse(JSON.stringify(E.toSnapshot(live)));
  // record what the player must get back
  const h0 = uids(live.players[0].hand), h1 = uids(live.players[1].hand);
  const d0 = [...live.players[0].deck].join(','), d1 = [...live.players[1].deck].join(',');
  const b0 = uids(live.players[0].board), b1 = uids(live.players[1].board);
  const beforeDigest = digest(live);

  // game.js resumeRunSnapshot: fromSnapshot + ensureUidsAbove
  const resumed = E.fromSnapshot(wire, byId);
  E.ensureUidsAbove(E.maxSnapshotUid(wire));

  ok('resume: your hand is identical (same cards + uids)', uids(resumed.players[0].hand) === h0, [h0, uids(resumed.players[0].hand)]);
  ok('resume: opponent hand is identical (same cards + uids)', uids(resumed.players[1].hand) === h1);
  ok('resume: your deck ORDER is identical', [...resumed.players[0].deck].join(',') === d0);
  ok('resume: opponent deck ORDER is identical', [...resumed.players[1].deck].join(',') === d1);
  ok('resume: both boards identical', uids(resumed.players[0].board) === b0 && uids(resumed.players[1].board) === b1);
  ok('resume: mana / turn / current identical', resumed.players[0].mana.cur === live.players[0].mana.cur
    && resumed.turnNumber === live.turnNumber && resumed.current === live.current);
  ok('resume: full-state digest identical', digest(resumed) === beforeDigest);
  ok('resumed fight is playable + valid', (() => { E.endTurn(resumed); return validateGameState(resumed).length === 0; })());
}

// ── seeding: the whole fight is reproducible from its seed (enables run replays) ──
{
  const a = runFight(999); playSome(a);
  const b = runFight(999); playSome(b);
  ok('a seeded run fight is fully reproducible from its seed', digest(a) === digest(b));
  // and post-resume, seeded randomness continues on the SAME timeline
  const wire = JSON.parse(JSON.stringify(E.toSnapshot(a)));
  const twin = E.fromSnapshot(wire, byId); // carries the rng {seed,calls} position
  for (let i = 0; i < 5; i++) { E.endTurn(a); E.endTurn(twin); }
  ok('post-resume seeded continuation stays on the same timeline', digest(a) === digest(twin));
}

// ── the bug guard: an UNSEEDED (Math.random) fight can't round-trip its rng (why runs are now seeded) ──
{
  const un = E.createGame(byId, Math.random, Array.from({ length: 30 }, () => 'chillwind_yeti'), 2);
  const snap = E.toSnapshot(un);
  ok('unseeded game emits NO rng position (would diverge post-resume — hence seededGame())', snap.rng === undefined);
  // but hands + deck order STILL restore exactly even unseeded (data, not rng)
  const r = E.fromSnapshot(JSON.parse(JSON.stringify(snap)), byId);
  ok('even unseeded, hands + deck order restore exactly', ids(r.players[0].hand) === ids(un.players[0].hand)
    && [...r.players[0].deck].join(',') === [...un.players[0].deck].join(','));
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
