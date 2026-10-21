// Steamodded's `{br:N}` line splits a description into separate boxes; the rest of that line is
// filler the author wrote only because the line can't be empty ("text", "text needs to be here
// to work", "ERROR - CONTACT STEAK", "ribbit", "exexexexexe"). Micatro printed the filler in
// tooltips, the Pokédex and the wiki (a tester saw Lechonk's "text"). It must be a gap instead.
//   node micatro/tests/mods/br_lines_test.mjs
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import { P_CENTERS, P_CENTER_POOLS } from '../../js/engine/core.js';
import { newRun } from '../../js/engine/run.js';
import { describeCenter } from '../../js/engine/describe.js';
import { loadMods, AVAILABLE } from '../../js/mods/index.js';
import { MOD_LOC } from '../../js/mods/registry.js';

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
const MODS = await loadMods(AVAILABLE.map((m) => m.id));
newRun({ seed: 'BRLINES', back: 'b_red', stake: 1, mods: MODS });

const FILLER = /^(text( needs to be here to work)?|ERROR - CONTACT STEAK|ribbit|seppuku|exexexexexe)$/i;
const leaks = (d) => (d && d.lines || []).concat(...((d && d.info) || []).map((i) => i.lines || []))
  .filter((l) => typeof l === 'string' && (/\{br:/.test(l) || FILLER.test(l.replace(/\{[^}]*\}/g, '').trim())));

// the cards the tester and the data show
for (const k of ['j_sonfive_archaludon', 'j_sonfive_shroodle', 'j_sonfive_ninjask', 'j_sonfive_croagunk', 'j_sonfive_shedinja', 'j_sonfive_cetitan', 'j_sonfive_garganacl']) {
  const d = describeCenter(k);
  ok(d && d.lines.length && !leaks(d).length, 'no {br} filler on ' + k, d && leaks(d));
}
// the box break still separates the boxes (a gap line), it isn't just deleted
{
  // (Pokermon+ 1.2.0 reworked Lechonk, whose text had one; Archaludon's has "{br:3}brrrr")
  const d = describeCenter('j_sonfive_archaludon');
  const i = d.lines.findIndex((l) => /1 remaining/.test(l));
  ok(i >= 0 && d.lines[i + 1] === '', 'the {br} becomes a gap between the boxes', d.lines);
}
// every joker / consumable of every mod: none leaks a {br} line
let n = 0; const bad = [];
for (const c of Object.values(P_CENTERS)) {
  if (!c.mod || !(c.set === 'Joker' || P_CENTER_POOLS[c.set])) continue;
  let d = null; try { d = describeCenter(c.key); } catch (e) { continue; }
  n++;
  const l = leaks(d); if (l.length) bad.push(c.key + ': ' + l[0]);
}
ok(n > 1000 && bad.length === 0, `no mod card shows {br} filler (${n} checked)`, bad.slice(0, 10));
// the loc data really has them (so the test means something)
const raw = JSON.stringify(MOD_LOC);
ok(/\{br:[0-9.]+\}text/.test(raw) && /\{br:[0-9.]+\}ERROR - CONTACT STEAK/.test(raw), 'the mods\' loc text carries {br} filler lines');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
