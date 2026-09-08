// normalize-cards.mjs — canonicalize battlecards/cards.json before it lands.
//
// 1. Alphabetize multi-keyword description lists ("Smoldering & Chromatic" ->
//    "Chromatic & Smoldering"). A "keyword list" is a sentence made ONLY of
//    keyword tokens joined by ", " and " & "; prose and triggered-ability
//    clauses ("Battlecry: …", "Ward: Discard a card") are left untouched. Value
//    keywords sort by name ("Regenerate 3", "Ward (2)", "Spell Damage+2").
// 2. Capitalize the resource "Life" everywhere ("gain 5 life" -> "gain 5 Life"),
//    EXCEPT the resurrect idiom "to life" ("return it to life"). "Lifesteal" is
//    one word so \blife\b never touches it.
//
// Idempotent. Wired into the pre-commit hook (tools/githooks/pre-commit) so new
// cards get fixed automatically — no need to re-order keywords by hand.
//
//   node tools/normalize-cards.mjs            (rewrite cards.json if needed)
//   node tools/normalize-cards.mjs --check    (exit 1 if anything is unnormalized; no write)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CARDS = path.join(ROOT, 'battlecards/cards.json');
const CHECK = process.argv.includes('--check');

const kwSrc = fs.readFileSync(path.join(ROOT, 'battlecards/keywords.js'), 'utf8');
const KNOWN = new Set();
for (const m of kwSrc.matchAll(/p:\s*\[([^\]]*)\]/g)) for (const q of m[1].matchAll(/'([^']+)'/g)) KNOWN.add(q[1]);
const SCHOOLS = ['Arcane', 'Fel', 'Fire', 'Frost', 'Holy', 'Nature', 'Shadow', 'Song'];

const normToken = tok => {
	let t = tok.replace(/\s*\(\d+\)$/, '').replace(/\s*\+?\d+$/, '').trim();
	const m = t.match(new RegExp('^(?:' + SCHOOLS.join('|') + ')\\s+(Spell Damage)$'));
	if (m) t = m[1];
	return t;
};
const isKw = tok => KNOWN.has(normToken(tok));
const sortKey = tok => tok.replace(/\s*\(\d+\)$/, '').replace(/\s*\+?\d+$/, '').trim().toLowerCase();

function reorderSentence(sentence) {
	const parts = sentence.split(/,\s+|\s+&\s+/).map(s => s.trim()).filter(Boolean);
	if (parts.length < 2 || !parts.every(isKw)) return null;
	const sorted = [...parts].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
	if (sorted.every((t, i) => t === parts[i])) return null;
	return sorted.length === 2 ? `${sorted[0]} & ${sorted[1]}`
		: `${sorted.slice(0, -1).join(', ')} & ${sorted[sorted.length - 1]}`;
}
function normalizeDescription(desc) {
	let changed = false;
	const lines = desc.split('\n').map(line =>
		line.split(/(?<=\.)\s+/).map(sent => {
			const m = sent.match(/^(.*?)(\.?)$/s);
			const re = reorderSentence(m[1]);
			if (re == null) return sent;
			changed = true;
			return re + m[2];
		}).join(' '));
	return changed ? lines.join('\n') : null;
}

// the game resource "Life" is Capitalized; "to life" (resurrect) stays lowercase
const capitalizeLife = desc => desc.replace(/(?<!\bto )\blife\b/g, 'Life');

const data = JSON.parse(fs.readFileSync(CARDS, 'utf8'));
const changed = [];
for (const c of data.cards) {
	if (!c.description) continue;
	let nd = c.description;
	if (!c.token) nd = normalizeDescription(nd) ?? nd; // keyword-list reorder: real cards only
	nd = capitalizeLife(nd);                            // "Life" capitalization: everywhere, incl. tokens/planes
	if (nd !== c.description) { changed.push(c.id); c.description = nd; }
}

if (CHECK) {
	if (changed.length) { console.error(`normalize-cards: ${changed.length} card(s) need normalizing (keyword order / "Life" caps) — run: node tools/normalize-cards.mjs\n  ${changed.slice(0, 10).join(', ')}`); process.exit(1); }
	console.log('normalize-cards: descriptions already normalized.');
	process.exit(0);
}
if (changed.length) {
	const out = JSON.stringify(data); JSON.parse(out); fs.writeFileSync(CARDS, out);
	console.log(`normalize-cards: normalized ${changed.length} description(s): ${changed.slice(0, 10).join(', ')}${changed.length > 10 ? ' …' : ''}`);
} else {
	console.log('normalize-cards: nothing to do.');
}
