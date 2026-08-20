// Advanced-land pool naming rule: EVERY card in an advanced land's themed pool must carry the
// pool/set word in its title (e.g. every "Esper" pool card contains "Esper", every "Heliod" card
// contains "Heliod"). This keeps a Discovered pool visually self-identifying. Basic land sets
// (Plains/Island/…/Wastes) are exempt — they're real colour/colorless cards, not themed by name.
import fs from 'fs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cards = raw.cards;
const BASIC = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']);
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const advSets = [...new Set(cards.map(c => c.landSet).filter(Boolean))].filter(s => !BASIC.has(s)).sort();
ok('advanced land sets exist', advSets.length > 0, advSets.length);

let offenders = 0;
for (const set of advSets) {
  const pool = cards.filter(c => c.landSet === set && !c.token);
  const bad = pool.filter(c => !(c.name || '').toLowerCase().includes(set.toLowerCase()));
  ok('every "' + set + '" pool card name contains "' + set + '"', bad.length === 0, bad.map(c => c.name));
  offenders += bad.length;
}
ok('zero advanced-pool cards missing their set word', offenders === 0, offenders);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
