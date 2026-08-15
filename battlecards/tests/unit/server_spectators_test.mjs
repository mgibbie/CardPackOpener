// server_spectators_test.mjs — the spectator-count logic in server/mp.mjs.
// A viewer heartbeats spec:<runner>:<viewer> on each cardstate poll; the runner's
// publish counts the ones seen within SPEC_WINDOW_MS. mp.mjs can't be imported
// (attribute-less JSON), so — like the other server tests — we brace-extract the
// real countWatchers() and run it against a Map-backed store, plus source guards.
import fs from 'fs';

const src = fs.readFileSync(new URL('../../../server/mp.mjs', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

function extractFn(name) {
	const i = src.indexOf('async function ' + name);
	if (i < 0) throw new Error('not found: ' + name);
	let depth = 0, started = false, k = i;
	for (; k < src.length; k++) {
		if (src[k] === '{') { depth++; started = true; }
		else if (src[k] === '}') { depth--; if (started && depth === 0) { k++; break; } }
	}
	return src.slice(i, k);
}
const winM = src.match(/SPEC_WINDOW_MS = ([\d_]+)/);
const SPEC_WINDOW_MS = +winM[1].replace(/_/g, '');
ok('SPEC_WINDOW_MS is a sane window', SPEC_WINDOW_MS >= 5000 && SPEC_WINDOW_MS <= 60000, SPEC_WINDOW_MS);
const countWatchers = new Function('SPEC_WINDOW_MS', extractFn('countWatchers') + '; return countWatchers;')(SPEC_WINDOW_MS);

// Map-backed store with the setJSON + prefix-list the handler uses (values parsed)
const makeStore = () => { const m = new Map(); return {
	setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
	list: async (prefix) => [...m.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value: JSON.parse(value) })),
	_m: m,
}; };

// --- counting behaviour ---
{
	const store = makeStore();
	const NOW = 1_000_000;
	ok('no spectators → 0', (await countWatchers(store, 'alice', NOW)) === 0);

	await store.setJSON('spec:alice:bob', NOW - 1000);      // fresh
	await store.setJSON('spec:alice:carol', NOW - 3000);    // fresh
	ok('two fresh heartbeats → 2', (await countWatchers(store, 'alice', NOW)) === 2);

	await store.setJSON('spec:alice:dave', NOW - (SPEC_WINDOW_MS + 5000)); // stale (stopped watching)
	ok('a stale heartbeat is not counted', (await countWatchers(store, 'alice', NOW)) === 2);

	await store.setJSON('spec:bob:eve', NOW - 500);         // a DIFFERENT runner's spectator
	ok("another runner's spectators don't leak into the count", (await countWatchers(store, 'alice', NOW)) === 2);
	ok('each runner counts only its own watchers', (await countWatchers(store, 'bob', NOW)) === 1);

	// a viewer re-heartbeating (same key) stays one distinct spectator
	await store.setJSON('spec:alice:bob', NOW - 100);
	ok('a re-polling viewer is still counted once', (await countWatchers(store, 'alice', NOW)) === 2);
}

// --- source guards: the wiring must stay in place ---
const pubBlock = src.slice(src.indexOf("action === 'publish-cardstate'"), src.indexOf("action === 'cardstate'"));
const csBlock = src.slice(src.indexOf("action === 'cardstate'"), src.indexOf("action === 'cardstate'") + 500);
ok('a cardstate poll heartbeats spec:<who>:<viewer>', /setJSON\('spec:' \+ who \+ ':' \+ username/.test(csBlock));
ok('publish-cardstate computes + stores + returns the watcher count', /countWatchers/.test(pubBlock) && /watchers/.test(pubBlock) && /json\(\{ ok: true, watchers \}\)/.test(pubBlock));
ok('card-publish (duel host) also counts + returns watchers', (src.match(/countWatchers\(store, username/g) || []).length >= 2);
ok('spectator heartbeats are GC-swept (spec: in GC_TABLE)', /\['spec:'/.test(src));

// --- read-only spectators: canPost gates posting, canChat still allows reading ---
const postBlock = src.slice(src.indexOf("action === 'chat-post'"), src.indexOf("action === 'chat-get'"));
const getBlock = src.slice(src.indexOf("action === 'chat-get'"), src.indexOf("action === 'chat-get'") + 300);
ok('a stricter canPost() exists (participants only)', /const canPost = async/.test(src));
ok('canPost lets ONLY the runner post in their own u: room', /room\.slice\(2\) === username/.test(src));
ok('chat-post enforces canPost (not the looser canChat)', /await canPost\(room\)/.test(postBlock) && /read-only/.test(postBlock));
ok('chat-get still uses canChat so spectators can READ the players\' chat', /await canChat\(room\)/.test(getBlock));

// --- spectator-only room + private emotes ---
ok('an isSpectatorOf() helper gates spec: rooms', /const isSpectatorOf = async/.test(src));
ok('a spectator = friend of X, not X, not a co-participant', /X === username \|\| !user\.friends\.includes\(X\)/.test(src) && /humans\.includes\(username\)\) return false/.test(src));
ok('BOTH canChat + canPost route spec: rooms through isSpectatorOf', (src.match(/isSpectatorOf\(room\.slice\(5\)\)/g) || []).length >= 2);
ok('spectator emotes are NO LONGER rejected (shared among spectators)', !/room\.startsWith\('spec:'\) && body\.emote/.test(postBlock));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
