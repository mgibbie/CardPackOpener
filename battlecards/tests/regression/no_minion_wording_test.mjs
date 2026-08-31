// no_minion_wording_test.mjs — the game says "creature", never "minion".
//
// The card pool came from Hearthstone, which calls them minions; this game calls
// them creatures. 336 pieces of prose still said minion.
//
// The split that matters: only `description` and `text` are player-visible.
// Everything else carrying the word is an INTERNAL IDENTIFIER — effect types
// like 'summon-minion', triggers like 'minion-played', 'ongoing.on', a
// `cardType` filter — and renaming those would break the engine. This asserts
// the prose is clean AND that the identifiers were left alone, so a future pass
// can't "helpfully" rename them.
import fs from 'fs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const PROSE = new Set(['description', 'text']);
const offenders = [], sentenceStarts = [];
const walk = (node, card) => {
	if (Array.isArray(node)) return node.forEach(n => walk(n, card));
	if (!node || typeof node !== 'object') return;
	for (const [k, v] of Object.entries(node)) {
		if (typeof v === 'string' && PROSE.has(k)) {
			if (/\bminions?\b/i.test(v)) offenders.push(`${card.id}: ${JSON.stringify(v).slice(0, 80)}`);
			// a lowercase "creature" opening a sentence is the fingerprint of a
			// careless rename — 10 of these existed before the sweep
			if (/(^|[.!?]\s+|\n)creatures?\b/.test(v)) sentenceStarts.push(`${card.id}: ${JSON.stringify(v).slice(0, 80)}`);
		} else walk(v, card);
	}
};
for (const c of raw.cards) walk(c, c);

ok('no card prose says "minion"', offenders.length === 0, offenders.slice(0, 5).join(' | '));
ok('no sentence starts with a lowercase "creature"', sentenceStarts.length === 0, sentenceStarts.slice(0, 5).join(' | '));

// the engine's own vocabulary must NOT have been renamed with it
const internal = { type: 0, trigger: 0, on: 0, per: 0, cardType: 0 };
const scan = node => {
	if (Array.isArray(node)) return node.forEach(scan);
	if (!node || typeof node !== 'object') return;
	for (const [k, v] of Object.entries(node)) {
		if (typeof v === 'string') { if (k in internal && /minion/i.test(v)) internal[k]++; }
		else scan(v);
	}
};
for (const c of raw.cards) scan(c);
ok('effect types still use the engine\'s own "minion" identifiers', internal.type > 50, String(internal.type));
ok('so do secret/ongoing triggers', internal.trigger + internal.on > 20, `${internal.trigger}+${internal.on}`);

// the glossary players read
const kw = fs.readFileSync(new URL('../../keywords.js', import.meta.url), 'utf8');
const glossary = [...kw.matchAll(/t:\s*'([^']*)'/g)].map(m => m[1]);
ok('the keyword glossary says creature too',
	!glossary.some(t => /\bminions?\b/i.test(t)),
	glossary.filter(t => /\bminions?\b/i.test(t)).slice(0, 2).join(' | '));

// the generated featured list is rebuilt from cards.json, so it must agree
const feat = JSON.parse(fs.readFileSync(new URL('../../featured.json', import.meta.url)));
ok('featured.json was regenerated after the sweep',
	!feat.cards.some(c => /\bminions?\b/i.test(c.description || '')),
	feat.cards.filter(c => /\bminions?\b/i.test(c.description || '')).slice(0, 2).map(c => c.id).join(','));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
