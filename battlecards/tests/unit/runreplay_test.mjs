// runreplay_test.mjs — a cleared run's "super replay" playlist bookkeeping.
//
// Each fight's tape is uploaded as it finishes and only its short share id is kept
// on the run, in order. It cannot be deferred to the end of the run: the local replay
// store is a 10-deep ring buffer and a 12-win Lorequest run is ~14 fights, so the
// opening fights would already be evicted by the time the run is cleared.
//   node battlecards/tests/unit/runreplay_test.mjs
import { appendFightReplay, playlistFights, canBuildPlaylist, playlistMeta, fightLabel, MAX_RUN_FIGHTS } from '../../runreplay.js';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL:', l, x ?? ''); } };

// ── order is chronological and preserved ──
{
	let list = [];
	list = appendFightReplay(list, { id: 'aaaaaaaa', result: 'win', label: 'Fight 1' });
	list = appendFightReplay(list, { id: 'bbbbbbbb', result: 'loss', label: 'Fight 2' });
	list = appendFightReplay(list, { id: 'cccccccc', result: 'win', label: 'Fight 3' });
	ok('fights chain in the order they were played', list.map(f => f.id).join(',') === 'aaaaaaaa,bbbbbbbb,cccccccc', list.map(f => f.id).join(','));
	ok('each fight keeps its result', list.map(f => f.result).join(',') === 'win,loss,win');
}

// ── a retried upload must not double-append ──
{
	let list = appendFightReplay([], { id: 'aaaaaaaa', result: 'win' });
	list = appendFightReplay(list, { id: 'aaaaaaaa', result: 'win' });
	ok('the same share id is never appended twice', list.length === 1, list.length);
}

// ── junk and failures are simply skipped ──
{
	ok('an entry with no id is ignored', appendFightReplay([], { result: 'win' }).length === 0);
	ok('a null entry is ignored', appendFightReplay([], null).length === 0);
	ok('a corrupt existing list is repaired, not trusted', appendFightReplay([null, {}, { id: 'aaaaaaaa' }], { id: 'bbbbbbbb' }).map(f => f.id).join(',') === 'aaaaaaaa,bbbbbbbb');
	ok('a non-array list does not throw', appendFightReplay(undefined, { id: 'aaaaaaaa' }).length === 1);
}

// ── bounded: a runaway run cannot grow the save forever ──
{
	let list = [];
	for (let i = 0; i < MAX_RUN_FIGHTS + 5; i++) list = appendFightReplay(list, { id: String(i).padStart(8, '0') });
	ok(`the list is capped at ${MAX_RUN_FIGHTS}`, list.length === MAX_RUN_FIGHTS, list.length);
	ok('the cap keeps the MOST RECENT fights', list[list.length - 1].id === String(MAX_RUN_FIGHTS + 4).padStart(8, '0'));
}

// ── a playlist needs at least two fights ──
{
	ok('no fights -> no playlist', canBuildPlaylist({ fightReplays: [] }) === false);
	ok('one fight -> no playlist (that is just a normal replay)', canBuildPlaylist({ fightReplays: [{ id: 'aaaaaaaa' }] }) === false);
	ok('two fights -> playlist', canBuildPlaylist({ fightReplays: [{ id: 'aaaaaaaa' }, { id: 'bbbbbbbb' }] }) === true);
	ok('a run with no replays at all is safe', canBuildPlaylist({}) === false && canBuildPlaylist(null) === false);
	ok('playlistFights drops idless entries', playlistFights({ fightReplays: [{ id: 'aaaaaaaa' }, {}, null] }).length === 1);
}

// ── meta describes the cleared run for the viewer's chapter bar ──
{
	const run = { characterId: 'Garruk', wins: 12, losses: 1, fightReplays: [{ id: 'aaaaaaaa', label: 'Fight 1 — Jace (win)' }, { id: 'bbbbbbbb', label: 'Fight 2 — Vivien (win)' }] };
	const m = playlistMeta(run, 'lorequest');
	ok('meta carries mode, hero and the record', m.mode === 'lorequest' && m.hero === 'Garruk' && m.wins === 12 && m.losses === 1, JSON.stringify(m));
	ok('meta carries one label per fight, in order', m.labels.join('|') === 'Fight 1 — Jace (win)|Fight 2 — Vivien (win)', m.labels.join('|'));
	ok('a dungeon run falls back to its classId for the hero', playlistMeta({ classId: 'warrior', fightReplays: [] }, 'dungeon').hero === 'warrior');
}

// ── chapter labels ──
{
	ok('labels count the fight and name the foe', fightLabel({ wins: 2, losses: 0, enemy: { name: 'Vivien' } }, 'win') === 'Fight 3 — Vivien (win)', fightLabel({ wins: 2, losses: 0, enemy: { name: 'Vivien' } }, 'win'));
	ok('a first fight with no known foe still labels cleanly', fightLabel({}, 'loss') === 'Fight 1 (loss)', fightLabel({}, 'loss'));
	ok('losses count toward the fight number', fightLabel({ wins: 1, losses: 1, enemy: { name: 'Bolas' } }, 'win') === 'Fight 3 — Bolas (win)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
