// normalize_keyword_text.mjs — write keyword-only card text in the ampersand
// house form: "Taunt & Rush." instead of "Taunt. Rush."
//
// Only touches descriptions that are NOTHING BUT keywords. The keyword list is
// read from battlecards/keywords.js's glossary rather than hand-listed — an
// ad-hoc list undercounts badly (a partial one found 210 of the real 360) and,
// worse, could rewrite a description that isn't purely keywords.
//
// Two keywords join with "&" (21 cards already read this way). Three or more
// have no precedent in the data, so they take ordinary English list form,
// "A, B & C." The card renderer wraps rules text (cardart.js wrapText), so the
// longer single line reflows rather than overflowing.
//
// Idempotent — re-running changes nothing.
//
//   node tools/normalize_keyword_text.mjs          (dry run)
//   node tools/normalize_keyword_text.mjs --write
import fs from 'fs';

const WRITE = process.argv.includes('--write');
const CARDS = 'battlecards/cards.json';

const kwSrc = fs.readFileSync('battlecards/keywords.js', 'utf8');
const PHRASES = new Set(
	[...kwSrc.matchAll(/\{\s*p:\s*\[([^\]]+)\]/g)]
		.flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])),
);
if (PHRASES.size < 50) { console.error('keyword glossary looks wrong — aborting'); process.exit(1); }

const db = JSON.parse(fs.readFileSync(CARDS, 'utf8'));
// Split on every separator this file can produce — including the COMMA used for
// three-or-more, or the tool stops recognising its own output and would report
// those cards as "not keyword text" forever after. A stray comma in ordinary
// rules text is harmless: the every()-is-a-glossary-phrase check still rejects it.
const segs = d => d.trim().split(/\s*(?:[.&,\n])\s*/).map(s => s.trim()).filter(Boolean);
const join = p => (p.length === 2 ? `${p[0]} & ${p[1]}` : `${p.slice(0, -1).join(', ')} & ${p[p.length - 1]}`);

let changed = 0, already = 0;
const byCount = {};
const samples = [];
for (const c of db.cards) {
	const d = c.description;
	if (!d) continue;
	const parts = segs(d);
	if (parts.length < 2 || !parts.every(p => PHRASES.has(p))) continue; // not keyword-only
	const next = join(parts) + '.';
	if (d === next) { already++; continue; }
	byCount[parts.length] = (byCount[parts.length] || 0) + 1;
	if (samples.length < 8) samples.push(`${JSON.stringify(d)}  ->  ${JSON.stringify(next)}`);
	c.description = next;
	changed++;
}

console.log(`keyword-only cards rewritten: ${changed}  (already in the house form: ${already})`);
console.log('by keyword count:', JSON.stringify(byCount));
for (const s of samples) console.log('  ' + s);
if (WRITE) { fs.writeFileSync(CARDS, JSON.stringify(db)); console.log('\nwritten to ' + CARDS); }
else console.log('\n(dry run — pass --write)');
