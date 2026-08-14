// safestore_test.mjs — the localStorage-that-degrades helper (battlecards/safestore.js).
// A corrupt blob must fall back (not throw + brick the page); a failed write
// (quota / blocked storage) must return false (not throw mid-save-flow); both
// must surface through the reportErr beacon.
import { safeLoad, safeSave, safeSaveStr } from '../../safestore.js';

let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const reports = [];
globalThis.reportErr = (msg, where) => reports.push({ msg, where });

// mock localStorage; throwOnSet simulates a QuotaExceededError / blocked store
function mockLS({ throwOnSet = false } = {}) {
	const m = new Map();
	return {
		getItem: k => (m.has(k) ? m.get(k) : null),
		setItem: (k, v) => { if (throwOnSet) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } m.set(k, String(v)); },
		removeItem: k => m.delete(k),
		_m: m,
	};
}

// --- safeLoad: missing is normal, corrupt is an anomaly ---
{
	globalThis.localStorage = mockLS(); reports.length = 0;
	ok('a missing key returns the fallback, silently', JSON.stringify(safeLoad('nope', { a: 1 })) === '{"a":1}' && reports.length === 0);
	globalThis.localStorage.setItem('k', JSON.stringify({ x: 5 }));
	ok('a valid blob parses back', safeLoad('k', null)?.x === 5);
	globalThis.localStorage.setItem('bad', '{not: json,,,');
	const v = safeLoad('bad', []);
	ok('a corrupt blob returns the fallback (no throw)', Array.isArray(v) && v.length === 0);
	ok('a corrupt blob is reported as an anomaly', reports.some(r => /corrupt save discarded: bad/.test(r.msg)));
	globalThis.localStorage.setItem('nul', 'null');
	ok('a stored null yields the fallback', safeLoad('nul', 'fb') === 'fb');
}

// --- safeSave / safeSaveStr: quota-safe writes ---
{
	globalThis.localStorage = mockLS(); reports.length = 0;
	ok('safeSave stores and returns true', safeSave('d', { n: 3 }) === true && JSON.parse(globalThis.localStorage.getItem('d')).n === 3);
	ok('safeSaveStr stores a raw value', safeSaveStr('g', 300) === true && globalThis.localStorage.getItem('g') === '300');
	ok('nothing was reported on a clean write', reports.length === 0);

	globalThis.localStorage = mockLS({ throwOnSet: true }); reports.length = 0;
	ok('a failed (quota) write returns false instead of throwing', safeSave('d', { n: 1 }) === false);
	ok('safeSaveStr also fails soft', safeSaveStr('g', 1) === false);
	ok('both failed writes are reported', reports.filter(r => /save failed/.test(r.msg)).length === 2);
}

// --- no storage at all (node / SSR / storage disabled) ---
{
	delete globalThis.localStorage;
	ok('safeLoad returns the fallback when there is no storage', safeLoad('x', 'fb') === 'fb');
	ok('safeSave returns false when there is no storage', safeSave('x', 1) === false);
	ok('safeSaveStr returns false when there is no storage', safeSaveStr('x', 1) === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
