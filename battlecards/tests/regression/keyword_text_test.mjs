// keyword_text_test.mjs — keyword-only card text uses the ampersand house form.
//
// "Taunt & Rush." rather than "Taunt. Rush." Three or more read as an ordinary
// English list, "A, B & C." Swept by tools/normalize_keyword_text.mjs, which is
// idempotent and can be re-run after adding cards.
//
// The keyword list comes from keywords.js's glossary, NOT a hand-written one —
// a partial list undercounted the real set by 150 cards when this was first
// measured, and worse, could rewrite a description that isn't purely keywords.
import fs from 'fs';

const kwSrc = fs.readFileSync(new URL('../../keywords.js', import.meta.url), 'utf8');
const PHRASES = new Set(
	[...kwSrc.matchAll(/\{\s*p:\s*\[([^\]]+)\]/g)]
		.flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])),
);
const { cards } = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

ok('the keyword glossary loaded', PHRASES.size > 50, String(PHRASES.size));

const segs = d => d.trim().split(/\s*(?:[.&,\n])\s*/).map(s => s.trim()).filter(Boolean);
const kwOnly = c => {
	const d = c.description;
	if (!d) return false;
	const p = segs(d);
	return p.length >= 2 && p.every(x => PHRASES.has(x));
};
const all = cards.filter(kwOnly);
ok('there is a real population of keyword-only cards', all.length > 300, String(all.length));

// every one of them must be in the house form
const wrong = all.filter(c => {
	const p = segs(c.description);
	const want = (p.length === 2 ? `${p[0]} & ${p[1]}` : `${p.slice(0, -1).join(', ')} & ${p[p.length - 1]}`) + '.';
	return c.description !== want;
});
ok('every keyword-only description uses the ampersand form', wrong.length === 0,
	wrong.slice(0, 5).map(c => `${c.id}: ${JSON.stringify(c.description)}`).join(' | '));

// the specific shapes the sweep replaced must be gone
const oldForms = all.filter(c => /\.\s*\n|\.\s+[A-Z]/.test(c.description));
ok('none still separates keywords with a period or newline', oldForms.length === 0,
	oldForms.slice(0, 4).map(c => `${c.id}: ${JSON.stringify(c.description)}`).join(' | '));

// and cards that are NOT keyword-only were left alone — an ability line still
// follows its keywords on its own line
const abilityCards = cards.filter(c => /^(Taunt|Rush|Charge|Lifesteal)\.\n(Deathrattle|Battlecry):/.test(c.description || ''));
ok('cards with an ability line kept their period + newline', abilityCards.length > 0,
	String(abilityCards.length));
ok('a specific one is untouched',
	cards.find(c => c.id === 'grizzly_bears')?.description === 'Taunt.\nDeathrattle: Target creature gains +2/+2.',
	JSON.stringify(cards.find(c => c.id === 'grizzly_bears')?.description));

// the reported card
ok('Ambush Viper reads "Deathtouch & Rush."',
	cards.find(c => c.id === 'ambush_viper')?.description === 'Deathtouch & Rush.',
	JSON.stringify(cards.find(c => c.id === 'ambush_viper')?.description));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
