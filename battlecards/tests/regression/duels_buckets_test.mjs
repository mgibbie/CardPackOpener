// duels_buckets_test.mjs — the Duels loot-bucket table.
//
// HS authored ~216 named Duels buckets; we had 17 generic ones (plus per-class
// signatures), so a run kept seeing the same handful of offers. The rest of the
// authored names are either ONE EXPANSION ("Boomsday Project", "Blackrock
// Mountain", …) — which our `set` field maps directly — or a mechanical theme.
// Both families are now imported.
//
// The danger with a filter-defined bucket is silent dead content: a bucket whose
// filter matches nothing is never offered and nobody notices. Every bucket is
// checked here against the real card pool.
import fs from 'fs';
import * as D from '../../duels.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const CLASSES = ['warrior', 'rogue', 'mage', 'paladin', 'priest', 'shaman', 'warlock', 'hunter', 'druid', 'demon_hunter', 'death_knight'];
const pools = CLASSES.map(c => D.draftPool(byId, [c]));
const bestMatch = b => Math.max(...pools.map(p => p.filter(d => b.match(d)).length));

// ---- the table grew, and stayed well-formed ----
ok('the generic bucket table was expanded', D.DUELS_BUCKETS.length >= 70, D.DUELS_BUCKETS.length);
{
	const ids = D.DUELS_BUCKETS.map(b => b.id), names = D.DUELS_BUCKETS.map(b => b.name);
	ok('every bucket id is unique (bucketsFor dedupes by id — a clash hides a bucket)',
		new Set(ids).size === ids.length, ids.filter((x, i) => ids.indexOf(x) !== i).join(','));
	ok('every bucket name is unique (the offer UI shows names)',
		new Set(names).size === names.length, names.filter((x, i) => names.indexOf(x) !== i).join(','));
	ok('every bucket has an id, a name and a match function',
		D.DUELS_BUCKETS.every(b => b.id && b.name && typeof b.match === 'function'));
}

// ---- no dead content: every bucket can actually be offered ----
{
	const dead = D.DUELS_BUCKETS.filter(b => bestMatch(b) === 0).map(b => b.name);
	ok('no bucket matches NOTHING for every class', dead.length === 0, dead.join(','));
	const thin = D.DUELS_BUCKETS.filter(b => bestMatch(b) < 3).map(b => `${b.name}(${bestMatch(b)})`);
	ok('every bucket clears the 3-card offer threshold for some class', thin.length === 0, thin.join(','));
}

// ---- set buckets really are that set ----
{
	const setBuckets = D.DUELS_BUCKETS.filter(b => b.id.startsWith('set_'));
	ok('the expansion buckets were imported', setBuckets.length >= 30, setBuckets.length);
	const pool = D.draftPool(byId, ['mage']);
	let impure = [];
	for (const b of setBuckets) {
		const hits = pool.filter(d => b.match(d));
		if (!hits.length) continue;
		const sets = new Set(hits.map(d => d.set));
		if (sets.size !== 1) impure.push(`${b.name}: ${[...sets].join('/')}`);
	}
	ok('each expansion bucket offers cards from exactly ONE set', impure.length === 0, impure.join(' | '));
	const boom = D.DUELS_BUCKETS.find(b => b.id === 'set_boomsday');
	const rolled = D.rollBucket(byId, ['mage'], boom, seededRng(7), 3);
	ok('rolling "Boomsday Project" yields 3 distinct Boomsday cards',
		rolled.length === 3 && new Set(rolled).size === 3 && rolled.every(id => byId[id].set === 'BOOMSDAY'),
		rolled.map(id => `${id}:${byId[id].set}`).join(','));
}

// ---- mechanic buckets return only cards that fit the theme ----
{
	const pool = D.draftPool(byId, ['warrior']);
	const check = (id, label, pred) => {
		const b = D.DUELS_BUCKETS.find(x => x.id === id);
		if (!b) { ok(`${label} exists`, false, id); return; }
		const hits = pool.filter(d => b.match(d));
		ok(`${label} offers only matching cards (${hits.length} in pool)`, hits.length >= 3 && hits.every(pred),
			hits.filter(d => !pred(d)).slice(0, 3).map(d => d.id).join(','));
	};
	check('m_weapons', 'Weapon Cache', d => d.type === 'weapon');
	check('m_trample', 'Overwhelm', d => (d.keywords || []).includes('trample'));
	check('m_lifesteal', 'Life Problems', d => (d.keywords || []).includes('lifesteal'));
	check('m_windfury', 'Wild Winds', d => (d.keywords || []).includes('windfury'));
	check('m_one_health', '1-Health Crusaders', d => d.type === 'creature' && (d.health || 0) === 1);
	check('m_little', 'Little Buddies', d => (d.cost || 0) <= 1);
}

// ---- the original buckets and the offer flow still work ----
{
	ok('the original tribal buckets survive', ['beasts', 'dragons', 'mechs', 'murlocs'].every(id => D.DUELS_BUCKETS.some(b => b.id === id)));
	const offered = D.offerBuckets(byId, 'hunter', seededRng(5), 3);
	ok('offerBuckets still returns 3 distinct usable buckets', offered.length === 3 && new Set(offered.map(b => b.id)).size === 3, offered.map(b => b.id).join(','));
	ok('a class still gets MORE than the generic table (its signatures)', D.bucketsFor(['hunter']).length > D.DUELS_BUCKETS.length);
	// variety: the whole point of the import
	const seen = new Set();
	for (let i = 0; i < 40; i++) for (const b of D.offerBuckets(byId, 'mage', seededRng(100 + i), 3)) seen.add(b.id);
	ok('40 draws surface a wide spread of buckets (variety, not the same few)', seen.size >= 30, seen.size);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
