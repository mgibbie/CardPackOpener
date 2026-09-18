// snapshot_save_guarantee_test.mjs — a run's mid-fight snapshot must ALWAYS land.
//
// The bug: saveRunSnapshot silently `return`ed on an oversize board and ignored a
// failed (quota-exceeded) write. The replay recorder — cosmetic, regenerable, up
// to 10 games of frames in the SAME localStorage — already popped its own entries
// on quota failure, so replay data could win the space while the fight the player
// was actually in froze at an older turn. That is how a resume came back a turn
// (or several) behind the saved position.
//
// safeSaveRetry(key, value, freeSpace) is the fix: on a failed write it evicts
// something expendable and retries until the value lands or nothing is left to free.
//   node battlecards/tests/unit/snapshot_save_guarantee_test.mjs

// a fake localStorage with a hard byte budget, so a write really can fail
function makeStore(budget) {
	const map = new Map();
	const used = () => [...map.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0);
	return {
		map,
		getItem: k => (map.has(k) ? map.get(k) : null),
		removeItem: k => { map.delete(k); },
		setItem(k, v) {
			const prev = map.has(k) ? map.get(k).length : 0;
			if (used() - prev + v.length > budget) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
			map.set(k, String(v));
		},
	};
}

const store = makeStore(1000);
globalThis.localStorage = store;
const { safeSave, safeSaveRetry, safeLoad } = await import('../../safestore.js');

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL:', l, x ?? ''); } };

const REPLAYS = 'magepunk_replays_v1', RUN = 'magepunk_lorequest_v1';
const filler = n => 'x'.repeat(n);

// ---- 1) plain safeSave gives up when the store is full (the old behaviour) ----
{
	store.map.clear();
	store.setItem(REPLAYS, filler(900)); // replays hog the budget
	const snapshot = { snapshot: { turnNumber: 18 }, active: true, pad: filler(300) };
	ok('baseline: a plain safeSave FAILS when the store is full', safeSave(RUN, snapshot) === false);
	ok('baseline: the run snapshot is absent -> resume would rewind', safeLoad(RUN, null) === null);
}

// ---- 2) safeSaveRetry evicts the expendable data and lands the snapshot ----
{
	store.map.clear();
	store.setItem(REPLAYS, filler(900));
	const snapshot = { snapshot: { turnNumber: 18 }, active: true, pad: filler(300) };
	let evictions = 0;
	const freeSpace = () => { if (store.map.has(REPLAYS)) { store.map.delete(REPLAYS); evictions++; return true; } return false; };
	ok('safeSaveRetry stores the snapshot after evicting replays', safeSaveRetry(RUN, snapshot, freeSpace) === true);
	ok('it evicted exactly once', evictions === 1, evictions);
	const back = safeLoad(RUN, null);
	ok('the snapshot round-trips intact (turn 18 preserved)', back && back.snapshot.turnNumber === 18, JSON.stringify(back && back.snapshot));
	ok('the expendable replay data is what was dropped', !store.map.has(REPLAYS));
}

// ---- 3) it gives up cleanly (no throw / no hang) when nothing can be freed ----
{
	store.map.clear();
	const tooBig = { pad: filler(5000) }; // larger than the whole budget
	let calls = 0;
	const res = safeSaveRetry(RUN, tooBig, () => { calls++; return false; }); // nothing to free
	ok('returns false when the value cannot fit', res === false);
	ok('stops asking once freeSpace reports nothing freed', calls === 1, calls);
}

// ---- 4) a successful first write never evicts anything ----
{
	store.map.clear();
	store.setItem(REPLAYS, filler(100));
	let calls = 0;
	ok('small snapshot saves on the first try', safeSaveRetry(RUN, { snapshot: { turnNumber: 3 } }, () => { calls++; return true; }) === true);
	ok('no eviction happened', calls === 0, calls);
	ok('replays are untouched', store.map.has(REPLAYS));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
