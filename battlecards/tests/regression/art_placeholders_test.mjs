// art-placeholders.json — cards that render a reused stand-in image and still want
// their own authentic art. They must (a) be real cards, (b) already be in art/index.json
// (so the game shows a real picture, not procedural fallback), and (c) borrow a real art id.
// The wiki's /missing-art queue reads this so a stand-in never silently disappears once
// the card lands in index.json. Guards the fix from 2026-09-11 (5 text-only Duels passives).
import fs from 'fs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardIds = new Set(raw.cards.map(c => c.id));
// art/index.json is an OFFLOADED, gitignored asset (it moved to the magepunk-cardart
// Pages project for the 20k-file deploy limit) — present on a dev machine, absent in
// CI. Reading it unguarded made this suite fail on EVERY CI run, which is why the
// Tests gate sat red: the workflow reads only in-repo data by design. The same guard
// is already used by totemic_power_test and generated_cards_test.
let index = null;
try { index = new Set(JSON.parse(fs.readFileSync(new URL('../../art/index.json', import.meta.url)))); }
catch { console.log('note: battlecards/art/index.json absent (gitignored) — art-coverage checks skipped, every in-repo check still enforced'); }
const doc = JSON.parse(fs.readFileSync(new URL('../../art-placeholders.json', import.meta.url)));
const list = Array.isArray(doc) ? doc : (doc.cards || []);

let pass = 0, fail = 0, skipped = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
// an art check only runs when the offloaded index is actually here; skips are
// COUNTED and reported so an absent index can never read as a clean pass
const okArt = (l, c, x) => { if (index) ok(l, c, x); else skipped++; };

ok('placeholder list is non-empty', list.length > 0, list.length);

// the 5 text-only Duels passives/tokens that must stay on /missing-art
for (const id of ['duelshp_summon_the_pack', 'duelshp_rush_the_keep', 'duels_choose_a_new_tactic', 'duels_choose_a_new_command', 'duelshp_gather_resources']) {
  ok(id + ' is listed as a placeholder', list.some(p => (typeof p === 'string' ? p : p.id) === id), 'missing from art-placeholders.json');
}

const seen = new Set();
for (const entry of list) {
  const id = typeof entry === 'string' ? entry : entry.id;
  ok('entry has an id', !!id, JSON.stringify(entry));
  if (!id) continue;
  ok(id + ' is not duplicated', !seen.has(id)); seen.add(id);
  ok(id + ' is a real card', cardIds.has(id));
  okArt(id + ' is in art/index.json (has a real picture)', index && index.has(id));
  const source = typeof entry === 'object' ? entry.source : null;
  if (source) okArt(id + ' borrows a real source art (' + source + ')', index && index.has(source), 'source not in index.json');
}

console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped (art index offloaded)` : ''}`);
process.exit(fail ? 1 : 0);
