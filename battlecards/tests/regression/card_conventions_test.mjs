// card_conventions_test.mjs — MTG/paper card text follows the house conventions.
//
// The owner's to-do batches (78 of them, 2026-08-26..10-04) kept rewording
// cards one at a time to the same rules. A pass on 2026-10-05 applied them to
// the whole MTG/paper pool (338 cards); this keeps new cards from drifting back:
//   "+N/+0"            -> "+N Attack"
//   "gets +"           -> "gains +"
//   weapon  "After your hero attacks, X"       -> "Swing: X"   (Swing on a weapon = the HERO attacks)
//   creature "Whenever this/<its name> attacks" -> "Swing: X"   (Swing on a creature = IT attacks)
//   "Whenever you play a creature, X"          -> "Alliance: X"
//   tribe Thopter -> Mech; a comma/& keyword line is alphabetical
// Hearthstone imports keep Hearthstone's own wording, so they are out of scope.
import fs from 'fs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const isHS = c => ['hs', 'hsx', 'DUELS'].includes(c.set) || (c.set && /^[A-Z_]+$/.test(c.set) && !['DUELS', 'YNEO', 'YMID', 'YSNC'].includes(c.set));
const mtg = c => !c.token && !isHS(c) && (c.set === 'paper' || c.set === 'wubrg' || /^Y/.test(c.set || ''));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// deliberate exceptions: the wording carries a condition "Swing:" can't express,
// or the trigger is the HERO's attack on a non-weapon
const SWING_EXEMPT = new Set(['Bone Breaker', 'Soulbreaker', 'Battlefiend', 'Battleworn Vanguard', 'Fighter Class', "Kazuul's Gratuitous Violence", "Zalto's Gratuitous Violence"]);

const cards = raw.cards.filter(mtg);
ok(`scope: the MTG/paper pool (${cards.length} cards)`, cards.length > 4000, cards.length);
const bad = { plus0: [], gets: [], swingWeapon: [], swingCreature: [], alliance: [], thopter: [], kwOrder: [] };
for (const c of cards) {
	const d = String(c.description || '');
	if (/\+\d+\/\+0\b/.test(d)) bad.plus0.push(c.name);
	if (/\bgets? \+/.test(d)) bad.gets.push(c.name);
	if (!SWING_EXEMPT.has(c.name)) {
		if (c.type === 'weapon' && /After your hero attacks,/i.test(d)) bad.swingWeapon.push(c.name);
		if (c.type === 'creature' && new RegExp('When(ever)? (this|it|this creature|' + esc(c.name) + ') attacks,').test(d)) bad.swingCreature.push(c.name);
	}
	if (/Whenever (you (play|cast|summon) (a|another) creature|another creature (you control )?enters)/i.test(d)) bad.alliance.push(c.name);
	if (/\bThopter\b/.test(c.tribe || '') && !/\bMech\b/.test(c.tribe || '')) bad.thopter.push(c.name);
	const first = d.split('\n')[0].trim();
	if (/^[A-Z][A-Za-z' ]+((, | & )[A-Z][A-Za-z' ]+)+\.$/.test(first)) {
		const ws = first.replace(/\.$/, '').split(/, | & /);
		if (ws.every(w => w.split(' ').length <= 2) && [...ws].sort((a, b) => a.localeCompare(b)).join('|') !== ws.join('|')) bad.kwOrder.push(c.name);
	}
}
ok('no "+N/+0" (write "+N Attack")', !bad.plus0.length, bad.plus0.slice(0, 8).join(', '));
ok('no "gets +" (write "gains +")', !bad.gets.length, bad.gets.slice(0, 8).join(', '));
ok('weapons: "Swing:", not "After your hero attacks,"', !bad.swingWeapon.length, bad.swingWeapon.slice(0, 8).join(', '));
ok('creatures: "Swing:", not "Whenever this attacks,"', !bad.swingCreature.length, bad.swingCreature.slice(0, 8).join(', '));
ok('"Alliance:", not "Whenever you play a creature,"', !bad.alliance.length, bad.alliance.slice(0, 8).join(', '));
ok('no Thopter tribe (Mech)', !bad.thopter.length, bad.thopter.join(', '));
ok('keyword lines are alphabetical', !bad.kwOrder.length, bad.kwOrder.slice(0, 8).join(', '));
// the exemptions must still exist, or the list goes stale
const names = new Set(raw.cards.map(c => c.name));
ok('every Swing exemption is a real card', [...SWING_EXEMPT].every(n => names.has(n)), [...SWING_EXEMPT].filter(n => !names.has(n)).join(', '));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
