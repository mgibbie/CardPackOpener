// keyword_list_alpha_test.mjs (2026-09-08)
// Owner convention: whenever a card's description LISTS multiple keywords
// ("Taunt & Rush", "Bushido, Windfury, Bash & Meteoric"), they must appear
// ALPHABETICALLY ("Rush & Taunt", "Bash, Bushido, Meteoric & Windfury").
// Only pure keyword-list sentences are checked; prose and triggered-ability
// clauses ("Battlecry: ...") are ignored.
import fs from 'fs';
const cards = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url))).cards;
const kwSrc = fs.readFileSync(new URL('../../keywords.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const KNOWN = new Set();
for (const m of kwSrc.matchAll(/p:\s*\[([^\]]*)\]/g)) for (const q of m[1].matchAll(/'([^']+)'/g)) KNOWN.add(q[1]);
const SCHOOLS = ['Arcane', 'Fel', 'Fire', 'Frost', 'Holy', 'Nature', 'Shadow', 'Song'];
const normToken = tok => { let t = tok.replace(/\s*\(\d+\)$/, '').replace(/\s*\+?\d+$/, '').trim(); const m = t.match(new RegExp('^(?:' + SCHOOLS.join('|') + ')\\s+(Spell Damage)$')); if (m) t = m[1]; return t; };
const isKw = tok => KNOWN.has(normToken(tok));
const sortKey = tok => tok.replace(/\s*\(\d+\)$/, '').replace(/\s*\+?\d+$/, '').trim().toLowerCase();

// a keyword-list sentence that isn't alphabetical -> offending pair
function unsortedList(sentence) {
	const parts = sentence.split(/,\s+|\s+&\s+/).map(s => s.trim()).filter(Boolean);
	if (parts.length < 2 || !parts.every(isKw)) return null;
	const sorted = [...parts].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
	return sorted.every((t, i) => t === parts[i]) ? null : `${parts.join(' / ')}  ->  ${sorted.join(' / ')}`;
}

const offenders = [];
for (const c of cards) {
	if (!c.description || c.token) continue;
	for (const line of c.description.split('\n'))
		for (const sent of line.split(/(?<=\.)\s+/)) {
			const body = sent.replace(/\.$/, '');
			const bad = unsortedList(body);
			if (bad) offenders.push(`${c.id}: ${bad}`);
		}
}
ok('every multi-keyword description list is alphabetical', offenders.length === 0,
	'\n  - ' + offenders.slice(0, 30).join('\n  - ') + (offenders.length > 30 ? `\n  ... +${offenders.length - 30} more` : ''));

// the game resource "Life" is Capitalized everywhere, except the resurrect idiom "to life"
const lifeOffenders = cards.filter(c => c.description && /(?<!\bto )\blife\b/.test(c.description)).map(c => c.id);
ok('"Life" is capitalized (except "to life")', lifeOffenders.length === 0, lifeOffenders.slice(0, 20).join(', '));

// spot-checks
const byId = Object.fromEntries(cards.map(c => [c.id, c]));
ok('Fusion Elemental -> "Meteoric & Trample."', byId.fusion_elemental.description === 'Meteoric & Trample.');
ok('Mistweaver Ronin -> "Bash, Bushido, Meteoric & Windfury."', byId.mistweaver_ronin.description === 'Bash, Bushido, Meteoric & Windfury.');
ok('Leatherback Baloth -> "Regenerate 3 & Trample."', byId.leatherback_baloth.description === 'Regenerate 3 & Trample.');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
