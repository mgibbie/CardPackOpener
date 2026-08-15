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
const listWatchers = new Function('SPEC_WINDOW_MS', extractFn('listWatchers') + '; return listWatchers;')(SPEC_WINDOW_MS);

// Map-backed store with the setJSON + prefix-list the handler uses (values parsed)
const makeStore = () => { const m = new Map(); return {
	setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
	list: async (prefix) => [...m.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value: JSON.parse(value) })),
	_m: m,
}; };

// --- watcher-listing behaviour (names, not just count) ---
const sorted = a => [...a].sort();
{
	const store = makeStore();
	const NOW = 1_000_000;
	ok('no spectators → []', (await listWatchers(store, 'alice', NOW)).length === 0);

	await store.setJSON('spec:alice:bob', NOW - 1000);      // fresh
	await store.setJSON('spec:alice:carol', NOW - 3000);    // fresh
	ok('two fresh heartbeats → both viewer names', JSON.stringify(sorted(await listWatchers(store, 'alice', NOW))) === JSON.stringify(['bob', 'carol']));

	await store.setJSON('spec:alice:dave', NOW - (SPEC_WINDOW_MS + 5000)); // stale (stopped watching)
	ok('a stale watcher is dropped from the list', !(await listWatchers(store, 'alice', NOW)).includes('dave'));

	await store.setJSON('spec:bob:eve', NOW - 500);         // a DIFFERENT runner's spectator
	ok("another runner's spectators don't leak in", !(await listWatchers(store, 'alice', NOW)).includes('eve'));
	ok('each runner lists only its own watchers', JSON.stringify(await listWatchers(store, 'bob', NOW)) === JSON.stringify(['eve']));

	// a viewer re-heartbeating (same key) stays one distinct spectator
	await store.setJSON('spec:alice:bob', NOW - 100);
	ok('a re-polling viewer appears once', (await listWatchers(store, 'alice', NOW)).filter(x => x === 'bob').length === 1);
}

// --- source guards: the wiring must stay in place ---
const pubBlock = src.slice(src.indexOf("action === 'publish-cardstate'"), src.indexOf("action === 'cardstate'"));
const csBlock = src.slice(src.indexOf("action === 'cardstate'"), src.indexOf("action === 'cardstate'") + 900);
ok('a cardstate poll heartbeats spec:<who>:<viewer>', /setJSON\('spec:' \+ who \+ ':' \+ username/.test(csBlock));
// spectator cap
ok('a SPEC_CAP constant caps concurrent spectators per game', /const SPEC_CAP = \d+/.test(src));
ok('a gameWatchers() helper aggregates a game\'s spectators (for the cap)', /async function gameWatchers/.test(src));
ok('cardstate turns away a NEW viewer at the cap (full:true, 403)', /!watching\.includes\(username\) && watching\.length >= SPEC_CAP/.test(csBlock) && /full: true/.test(csBlock));
ok('publish-cardstate lists watchers + stores + returns names', /listWatchers/.test(pubBlock) && /watcherNames/.test(pubBlock) && /json\(\{ ok: true, watchers, watcherNames \}\)/.test(pubBlock));
ok('a duel publish AGGREGATES watchers across ALL participants (host + guests)', /for \(const h of humans\) for \(const w of await listWatchers\(store, h, now\)\)/.test(src));
ok('card-publish returns the aggregated watcher names', /return json\(\{ ok: true, watchers, watcherNames \}\)/.test(src));
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
