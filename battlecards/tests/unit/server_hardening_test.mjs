// server_hardening_test.mjs — CI coverage for the /api/mp input-hardening brakes.
//
// server/mp.mjs can't be plain-imported in Node (attribute-less JSON imports), so
// we extract the self-contained rateLimit() by brace-matching the source and run
// it against a Map-backed store — exactly the shape userStore exposes. The other
// brakes (body cap, intent shape/size cap, IP-bucketed beacons) are proven
// end-to-end by tests/integration/relay_harness.mjs; here we add cheap source
// guards so they can't be silently deleted. Behavioural limiter coverage lives
// here so it runs in CI (the harness needs a browser and is standalone).
import fs from 'fs';

const src = fs.readFileSync(new URL('../../../server/mp.mjs', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// pull a whole `async function <name>(...) { ... }` out of the source by matching braces
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
const rateLimit = new Function(extractFn('rateLimit') + '; return rateLimit;')();

const makeStore = () => { const m = new Map(); return {
	get: async k => (m.has(k) ? JSON.parse(m.get(k)) : null),
	setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
	_m: m,
}; };

// --- behaviour: fixed-window counter per bucket ---
{
	const store = makeStore();
	let within = true;
	for (let i = 0; i < 5; i++) within = within && (await rateLimit(store, 'card-act:bob', 5, 10_000)) === true;
	ok('the first N hits in a window pass', within);
	ok('the (N+1)th hit in the same window is blocked', (await rateLimit(store, 'card-act:bob', 5, 10_000)) === false);
	ok('and it stays blocked while the window holds', (await rateLimit(store, 'card-act:bob', 5, 10_000)) === false);

	ok('a different identity has its own budget', (await rateLimit(store, 'card-act:alice', 5, 10_000)) === true);
	ok('a different action has its own budget', (await rateLimit(store, 'hit:1.2.3.4', 5, 10_000)) === true);

	// keyspace is bounded: ONE rl:* key per bucket, overwritten each hit (not one per window)
	const bobKeys = [...store._m.keys()].filter(k => k.startsWith('rl:card-act:bob'));
	ok('a bucket keeps a single overwritten counter key (bounded keyspace)', bobKeys.length === 1, bobKeys.join(','));

	// an exhausted OLD window resets on the next hit (a new window ⇒ n back to 1)
	await store.setJSON('rl:card-act:bob', { win: 0, n: 9999 }); // win 0 is far in the past
	ok('a new window resets the counter', (await rateLimit(store, 'card-act:bob', 5, 10_000)) === true);
}

// --- source guards: the other brakes must stay wired ---
ok('an oversized body is rejected with 413 before parsing', /content-length/i.test(src) && /MAX_BODY_BYTES/.test(src) && /\b413\b/.test(src));
ok('the request body must be a plain object', /Array\.isArray\(body\)/.test(src));
ok('card-act / matchmake-join are in the rate-limit table', /RATE_LIMITS\s*=/.test(src) && /'card-act'/.test(src) && /'matchmake-join'/.test(src));
ok('the authenticated gate returns 429 on flood', /RATE_LIMITS\[action\]/.test(src) && /slow down/.test(src) && /\b429\b/.test(src));
ok('the hit + err beacons are bucketed by client IP', /hit:'\s*\+\s*clientIp/.test(src) && /err:'\s*\+\s*clientIp/.test(src));
ok('clientIp reads the Cloudflare connecting-IP header', /cf-connecting-ip/i.test(src));
ok('a guest intent is shape- and size-checked', /INTENT_MAX_BYTES/.test(src) && /bad intent/.test(src) && /Array\.isArray\(intent\)/.test(src));
ok('presence free-text is length-capped', /String\(body\.status[^\n]*\.slice\(/.test(src) || /\.slice\(0, 32\)/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
