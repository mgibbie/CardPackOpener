// Locations render their tap like LANDS do: the double-tap glyph "⟳ ⟳" (they
// stay tapped for 2 turns), NOT the literal "{T}" (which isn't a real symbol —
// it prints as text). And the Durability stat lives in the card's corner, so it
// no longer appears in the rules text.
import fs from 'fs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const locs = raw.cards.filter(c => c.type === 'location');
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

ok('there are locations to check', locs.length > 200, String(locs.length));

const noGlyph = locs.filter(c => !/⟳ ⟳/.test(c.description || ''));
ok('every location shows the double-tap glyph ⟳ ⟳', noGlyph.length === 0, noGlyph.slice(0, 8).map(c => c.id).join(', '));

const literalT = locs.filter(c => /\{T\}/.test(c.description || ''));
ok('no location uses the literal {T}', literalT.length === 0, literalT.slice(0, 8).map(c => c.id).join(', '));

const durText = locs.filter(c => /Durability\s+\d|\d+\s+Durability\b/.test(c.description || ''));
ok('no location prints the Durability stat in its text (it is in the corner)',
	durText.length === 0, durText.slice(0, 8).map(c => c.id + ': ' + c.description).join(' | '));

// spot-check a couple of specific cards
const tower = raw.cards.find(c => c.id === 'mv_cap_10');
ok('Avengers Tower: "⟳ ⟳: Gain 3 Armor, Assemble & Advance."',
	tower.description === '⟳ ⟳: Gain 3 Armor, Assemble & Advance.', JSON.stringify(tower.description));

// lands already use this exact form — the two now match
const plains = raw.cards.find(c => c.id === 'plains');
ok('lands still lead with ⟳ ⟳ (the form locations now match)', /⟳ ⟳/.test(plains.description || ''), JSON.stringify(plains.description));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
