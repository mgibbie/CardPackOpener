// person_agreement_test.mjs — the log speaks to you in the second person.
//
// nameOf() returns "You" for the local player and a third-person name for
// everyone else. Every template that glued a third-person verb or a possessive
// onto it therefore read wrong for the player it was describing:
//   "You rolls the planar die"      (verb agreement)
//   "returned to You's hand"        (possessive)
//   "1 wins"                        (a COUNT pluralised as if it were a name)
//
// Reported from production. Fixed with vbOf(pi, third, second) and
// possOf(pi, cap) next to nameOf, so the person is chosen once per template
// instead of being assumed.
//
//   node battlecards/tests/unit/person_agreement_test.mjs
import fs from 'fs';
import { plural, winLossLabel } from '../../runlabel.js';

const src = fs.readFileSync(new URL('../../game.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };

// ---------- the helpers exist ----------
ok('vbOf picks a verb by person', /const vbOf = \(pi, third, second\)/.test(src));
ok('possOf picks a possessive by person', /const possOf = \(pi, cap = true\)/.test(src));

// ---------- no template glues a possessive straight onto nameOf ----------
// `${nameOf(x)}'s` is only ever correct when guarded by an explicit HUMAN check,
// and those sites now use possOf instead.
// possOf's own definition is the one legitimate place a possessive is built
const body = src.split('\n').filter(l => !/const possOf = /.test(l)).join('\n');
const possHits = [...body.matchAll(/\$\{nameOf\([^)]*\)\}'s/g)];
ok('nothing builds a possessive from nameOf directly', possHits.length === 0,
	possHits.length + ' left, e.g. ' + (possHits[0]?.[0] || ''));

// ---------- no third-person verb is glued onto nameOf ----------
// A bare `${nameOf(x)} verbs ` reads as "You rolls". Anything conjugated must go
// through vbOf, which puts a `${` right after the name.
const VERBS = ['rolls', 'discards', 'loots', 'votes', 'dredges', 'attacks', 'uses', 'taps', 'casts', 'scries', 'gazes', 'plundered'];
const verbHits = [];
for (const m of src.matchAll(/\$\{nameOf\([^)]*\)\} ([a-z]+)\b/g)) {
	if (VERBS.includes(m[1])) verbHits.push(m[0]);
}
ok('no third-person verb is glued onto nameOf', verbHits.length === 0,
	verbHits.length + ' left: ' + verbHits.slice(0, 4).join(' | '));

// ---------- counts are pluralised as counts ----------
ok('the run-over overlay pluralises its win count', /plural\(run\.wins \|\| 0, 'win', 'wins'\)/.test(src));
ok('plural() is imported for it', /import \{ winLossLabel, plural \}/.test(src));
ok('plural(1) is singular', plural(1, 'win', 'wins') === '1 win', plural(1, 'win', 'wins'));
ok('plural(0) is plural', plural(0, 'win', 'wins') === '0 wins', plural(0, 'win', 'wins'));
ok('plural(2) is plural', plural(2, 'win', 'wins') === '2 wins', plural(2, 'win', 'wins'));
ok('a 1-1 record reads naturally', winLossLabel({ wins: 1, losses: 1 }) === '1 win / 1 loss',
	winLossLabel({ wins: 1, losses: 1 }));

// ---------- the emote bar yields the corner to the card inspector ----------
const chat = fs.readFileSync(new URL('../../chat.js', import.meta.url), 'utf8');
ok('the chat has a yield rule', /#mp-chat\.mc-yield\{z-index:6;\}/.test(chat));
const chatZ = +(chat.match(/#mp-chat\{position:fixed;[^}]*z-index:(\d+)/) || [])[1];
const insZ = +(fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
	.match(/#inspect \{[^}]*z-index: (\d+)/) || [])[1];
ok('the chat normally sits above the inspector', chatZ > insZ, `chat ${chatZ} vs inspect ${insZ}`);
ok('...and yields BELOW it while a card is open', 6 < insZ, `yield 6 vs inspect ${insZ}`);
ok('opening the inspector adds the yield class', /classList\.add\('mc-yield'\)/.test(src));
ok('closing it removes the yield class', /classList\.remove\('mc-yield'\)/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
