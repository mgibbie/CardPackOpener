// server_gc_test.mjs — CI coverage for the /api/mp lazy GC of ephemeral keys.
//
// server/mp.mjs can't be plain-imported in Node (attribute-less JSON imports), so
// we extract the REAL GC constants (GC_INTERVAL_MS / HR / GC_TABLE) and maybeGC()
// by slicing the source, then run them against a faithful in-memory store that
// mirrors userStore.sweepOld's updated_at semantics. This pins the policy — which
// prefixes, which TTLs, the interval guard, and that durable data is never swept.
import fs from 'fs';

const src = fs.readFileSync(new URL('../../../server/mp.mjs', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// slice out the const block (GC_INTERVAL_MS … GC_TABLE = [ … ];) + the maybeGC fn
const constsSrc = src.slice(src.indexOf('const GC_INTERVAL_MS'), src.indexOf('];', src.indexOf('const GC_TABLE')) + 2);
function fnSrc(name) {
	const i = src.indexOf('async function ' + name);
	let depth = 0, started = false, k = i;
	for (; k < src.length; k++) { if (src[k] === '{') { depth++; started = true; } else if (src[k] === '}') { depth--; if (started && depth === 0) { k++; break; } } }
	return src.slice(i, k);
}
const maybeGC = new Function(constsSrc + '\n' + fnSrc('maybeGC') + '\nreturn maybeGC;')();

const GC_INTERVAL_MS = 30 * 60_000; // mirrors the source (guarded below)
const HR_MS = 3600 * 1000;

// in-memory store mirroring userStore: setJSON stamps updated_at = _now (ms);
// sweepOld deletes prefix-matching rows older than _now - ttlSec
function makeStore(now) {
	const m = new Map();
	const s = {
		_now: now,
		get: async k => (m.has(k) ? m.get(k).v : null),
		setJSON: async (k, v) => m.set(k, { v, ts: s._now }),
		sweepOld: async (prefix, ttlSec) => { const cut = s._now - ttlSec * 1000; for (const [k, e] of [...m]) if (k.startsWith(prefix) && e.ts < cut) m.delete(k); },
		_put: (k, tsMs) => m.set(k, { v: 1, ts: tsMs }),
		_has: k => m.has(k),
	};
	return s;
}

const T = 1_700_000_000_000;

// --- a due sweep drops stale ephemera, keeps fresh + durable rows ---
{
	const store = makeStore(T);
	// stale ephemeral (past their TTL) — must be deleted
	store._put('cardmatchstate:m1', T - 2 * HR_MS);   // 1h TTL
	store._put('alive:m1:host', T - 2 * HR_MS);       // 1h
	store._put('cardintent:m1:1_000001', T - 2 * HR_MS); // 1h
	store._put('rl:hit:1.2.3.4', T - 2 * HR_MS);      // 1h
	store._put('mm:matched:bob', T - 2 * HR_MS);      // 1h
	store._put('cardmatch:m1', T - 13 * HR_MS);       // 12h
	store._put('chat:m:m1', T - 13 * HR_MS);          // 12h
	store._put('presence:bob', T - 25 * HR_MS);       // 24h
	store._put('trade:t1', T - 7 * HR_MS);            // 6h
	// fresh / within-TTL ephemeral — must survive
	store._put('cardmatchstate:live', T - 5 * 60_000);
	store._put('cardmatch:recent', T - 2 * HR_MS);    // < 12h
	store._put('presence:online', T - 1 * HR_MS);     // < 24h
	// durable — must NEVER be swept even when ancient
	for (const k of ['bob', 'code:ABCDEF', 'stat:2026-08-14', 'err:2026-08-14', 'aideckpool', 'mm:queue']) store._put(k, T - 1000 * HR_MS);

	const swept = await maybeGC(store, T);
	ok('a first run sweeps (no prior gc:last)', swept === true);
	ok('stale ephemeral rows past their TTL are deleted',
		!['cardmatchstate:m1', 'alive:m1:host', 'cardintent:m1:1_000001', 'rl:hit:1.2.3.4', 'mm:matched:bob', 'cardmatch:m1', 'chat:m:m1', 'presence:bob', 'trade:t1'].some(k => store._has(k)));
	ok('fresh / within-TTL ephemeral rows are kept',
		store._has('cardmatchstate:live') && store._has('cardmatch:recent') && store._has('presence:online'));
	ok('durable rows are NEVER swept (user record, code:, stat:, err:, aideckpool, mm:queue)',
		['bob', 'code:ABCDEF', 'stat:2026-08-14', 'err:2026-08-14', 'aideckpool', 'mm:queue'].every(k => store._has(k)));
	ok('the gc:last marker is stamped', (await store.get('gc:last')) === T);
}

// --- the interval guard: no re-sweep before GC_INTERVAL_MS elapses ---
{
	const store = makeStore(T);
	await maybeGC(store, T);                       // first sweep stamps gc:last = T
	store._put('cardmatchstate:x', T - 2 * HR_MS); // stale, seeded AFTER the sweep
	store._now = T + 60_000;
	const swept2 = await maybeGC(store, T + 60_000);
	ok('a call within the interval does not sweep', swept2 === false && store._has('cardmatchstate:x'));
	store._now = T + GC_INTERVAL_MS + 1;
	const swept3 = await maybeGC(store, T + GC_INTERVAL_MS + 1);
	ok('after the interval elapses it sweeps again', swept3 === true && !store._has('cardmatchstate:x'));
}

// --- source guards: the wiring stays intact ---
ok('the source interval is 30 minutes', /GC_INTERVAL_MS\s*=\s*30\s*\*\s*60_000/.test(src));
ok('sweepOld keys off the updated_at column with a LIKE prefix', /DELETE FROM mp_store WHERE key LIKE \? AND updated_at < \?/.test(src));
ok('the GC table covers the high-growth per-match prefixes', ['cardmatch:', 'cardmatchstate:', 'cardintent:', 'alive:', 'rl:'].every(p => src.includes(`'${p}'`)));
ok('the handler actually calls maybeGC', /maybeGC\(store,\s*Date\.now\(\)\)/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
