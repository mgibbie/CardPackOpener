// server_replay_test.mjs — CI coverage for the shared-replay endpoints in
// server/mp.mjs (replay-put / replay-get). mp.mjs can't be plain-imported in Node
// (attribute-less JSON imports), so — like server_hardening_test — we extract the
// self-contained rateLimit() and assert the handler's shape from source, plus test
// the actual validation regexes and the store round-trip the endpoints rely on.
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
const rateLimit = new Function(extractFn('rateLimit') + '; return rateLimit;')();
const makeStore = () => { const m = new Map(); return {
	get: async k => (m.has(k) ? JSON.parse(m.get(k)) : null),
	setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
	_m: m,
}; };

// --- source shape: replay-get is PUBLIC, replay-put is TOKEN-GATED ---
const gateIdx = src.indexOf('everything below requires a valid token');
const getIdx = src.indexOf("action === 'replay-get'");
const putIdx = src.indexOf("action === 'replay-put'");
ok('replay-get exists and is PUBLIC (before the auth gate — shared links open logged-out)', getIdx > 0 && gateIdx > getIdx, `get=${getIdx} gate=${gateIdx}`);
ok('replay-put exists and is TOKEN-GATED (after the auth gate)', putIdx > gateIdx && gateIdx > 0, `put=${putIdx} gate=${gateIdx}`);

// --- source guards: the brakes must stay wired ---
ok('replay-put caps size (REPLAY_MAX_BYTES) and validates the code shape', /REPLAY_MAX_BYTES/.test(src) && src.includes('/^[GR]1\\.[A-Za-z0-9_-]+$/'));
ok('replay-get validates the id shape', src.includes('/^[a-f0-9]{8,20}$/'));
ok('both endpoints use the replay: store prefix', /'replay:'/.test(src));
ok('replay-put is rate-limited', /'replay-put':/.test(src));
ok('replay-get is IP rate-limited (RGET_LIMIT bucketed by clientIp)', /rget:'\s*\+\s*clientIp/.test(src) && /RGET_LIMIT/.test(src));
ok('shared replays are GC-swept (replay: in GC_TABLE)', /\['replay:'/.test(src));
ok('a missing replay returns 404', /not found[^]*404|404[^]*not found/.test(src.slice(getIdx, getIdx + 400)));

// --- behaviour: the ACTUAL validation regexes (copies pinned by the presence asserts above) ---
const idRe = /^[a-f0-9]{8,20}$/;
const codeRe = /^[GR]1\.[A-Za-z0-9_-]+$/;
ok('id regex accepts a 12-hex share id', idRe.test('a1b2c3d4e5f6'));
ok('id regex rejects junk / wrong charset / bad length', !idRe.test('ABCDEF12') && !idRe.test('') && !idRe.test('xyz') && !idRe.test('a1'));
ok('code regex accepts a gzip (G1.) and raw (R1.) base64url code', codeRe.test('G1.aB-_9xYz') && codeRe.test('R1.abcDEF012'));
ok('code regex rejects arbitrary junk, wrong prefix, and spaces', !codeRe.test('hello') && !codeRe.test('X1.abc') && !codeRe.test('G1.') && !codeRe.test('G1.has space'));

// --- store round-trip the endpoints depend on ---
{
	const store = makeStore();
	await store.setJSON('replay:deadbeef1234', { code: 'G1.abc', by: 'bob', when: 1 });
	const got = await store.get('replay:deadbeef1234');
	ok('a stored replay round-trips (put → get)', got && got.code === 'G1.abc' && got.by === 'bob');
	ok('an unknown id returns null (→ 404)', (await store.get('replay:missing')) === null);
}

// --- behaviour: the public fetch is IP rate-limited ---
{
	const store = makeStore();
	let within = true;
	for (let i = 0; i < 5; i++) within = within && (await rateLimit(store, 'rget:1.2.3.4', 5, 10_000)) === true;
	ok('the first N public fetches in a window pass', within);
	ok('the (N+1)th public fetch is blocked (429)', (await rateLimit(store, 'rget:1.2.3.4', 5, 10_000)) === false);
	ok('a different IP has its own budget', (await rateLimit(store, 'rget:9.9.9.9', 5, 10_000)) === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
