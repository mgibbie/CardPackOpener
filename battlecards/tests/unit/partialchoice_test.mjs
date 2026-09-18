// partialchoice_test.mjs — the half-made part of a discard choice survives a
// walk-away, but can never leak into a DIFFERENT choice.
//
// Resume is frame-exact: the snapshot restores that a discard is pending and
// resumePendingChoices reopens the modal, but the cards already ticked lived only
// in a DOM-local Set — so a reopen used to put you back at zero ticks. These are
// the pure matching rules behind persisting them.
//   node battlecards/tests/unit/partialchoice_test.mjs
import { makePartial, matchPartial, handSig, PARTIAL_DISCARD_KEY } from '../../partialchoice.js';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL:', l, x ?? ''); } };

const HAND = ['u1', 'u2', 'u3', 'u4'];
const pend = { player: 0, count: 2, cleanup: true };
const saved = makePartial(pend, HAND, ['u2', 'u4']);

ok('the key is namespaced', PARTIAL_DISCARD_KEY === 'magepunk_partial_discard_v1');
ok('makePartial records the picks + a hand fingerprint',
	saved.uids.join() === 'u2,u4' && saved.sig === handSig(HAND) && saved.player === 0 && saved.count === 2 && saved.cleanup === true, JSON.stringify(saved));

// ---- the point of the feature: same choice, same hand -> ticks come back ----
ok('same pending + same hand -> restores the exact ticks',
	matchPartial(saved, pend, HAND).join() === 'u2,u4');

// ---- it must NOT leak into a different decision ----
ok('different player -> no restore', matchPartial(saved, { player: 1, count: 2, cleanup: true }, HAND).length === 0);
ok('different count -> no restore', matchPartial(saved, { player: 0, count: 3, cleanup: true }, HAND).length === 0);
ok('cleanup vs loot discard -> no restore', matchPartial(saved, { player: 0, count: 2, cleanup: false }, HAND).length === 0);
ok('hand changed (drew a card) -> no restore', matchPartial(saved, pend, [...HAND, 'u5']).length === 0);
ok('hand changed (different order) -> no restore', matchPartial(saved, pend, ['u2', 'u1', 'u3', 'u4']).length === 0);
ok('nothing saved -> no restore', matchPartial(null, pend, HAND).length === 0);
ok('no pending -> no restore', matchPartial(saved, null, HAND).length === 0);

// ---- defensive shaping ----
{
	const dirty = { ...makePartial(pend, HAND, ['u2', 'u2', 'ghost', 'u4']) };
	const got = matchPartial(dirty, pend, HAND);
	ok('drops duplicates and uids no longer in hand', got.join() === 'u2,u4', got.join());
}
{
	const over = { ...makePartial({ player: 0, count: 2, cleanup: true }, HAND, ['u1', 'u2', 'u3']) };
	ok('never restores more picks than the choice allows', matchPartial(over, pend, HAND).length === 2);
}
{
	const empty = makePartial(pend, HAND, []);
	ok('an empty selection round-trips as empty (no ticks, no crash)', matchPartial(empty, pend, HAND).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
