// poketactica_lessons_test.mjs — THE COACH GOES PAST THE FIRST MAP (Plans/POKETACTICA_MODES_PLAN.md item S3;
// poketactica/js/lessons.js). Combos, throwing and catching, and Geo panels each get a guided moment on the map that
// first needs them: steps ticked off by doing them. Here each step is ticked by the orders that should tick it, on the
// real maps built by the engine, and not by ones that should not.
// Pure: node only.   node overworld/tests/poketactica_lessons_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as C from '../../poketactica/js/campaign.js';
import * as B from '../../poketactica/js/engine/battle.js';
import * as L from '../../poketactica/js/lessons.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { STARTERS } from '../../poketactica/js/figcol.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const team = STARTERS.slice(0, 3).map((sp, i) => makeFigurine(sp, 12, makeRng('ls' + i), data, { id: 'ls-' + i, shinyRate: 0 }));
const battle = (id) => { const m = C.mapById(id); return { m, S: B.newBattle('ls-' + id, C.campaignSetup(m, team, data, 'ls-' + id), data) }; };
const at = (id, S, acts, m) => L.lessonStep(L.lessonOf(id), S, acts, m);

// ---------- which maps teach, and that each lesson is whole
{
	A(Object.keys(L.LESSONS).join() === 'c1-2,c1-4,c2-1' && L.lessonOf('c1-1') === null && L.lessonOf('c3-1') === null, 'three lessons: Combo Field, Catch! and Blue Shield (the first map keeps its own tutorial)');
	A(Object.keys(L.LESSONS).every((id) => C.mapById(id)), 'each is a real map');
	A(Object.values(L.LESSONS).every((l) => l.name && l.steps.length >= 2 && l.steps.length <= 3 && l.steps.every((s) => s.key.length > 30 && s.touch.length > 30 && !/\bpress\b|\bV\b|\bZ\b/i.test(s.touch)) && typeof l.end === 'function'), 'each has two or three steps, in words for keys and for a phone (the phone words name no key)');
	A(new Set(Object.values(L.LESSONS).map((l) => l.id)).size === 3, 'each has an id of its own (what the device remembers)');
	A(C.mapById('c2-1').symbols.length === 1 && C.mapById('c1-4').tip && /caught/.test(C.mapById('c1-4').tip), 'the maps are the ones the lessons speak of: one symbol on Blue Shield, catching on Catch!');
}
// ---------- combos (c1-2)
{
	const { m, S } = battle('c1-2');
	const a1 = { t: 'attack', uid: 'p1', move: 'tackle', x: 5, y: 3 }, a2 = { t: 'attack', uid: 'p2', move: 'tackle', x: 5, y: 3 }, other = { t: 'attack', uid: 'p2', move: 'tackle', x: 6, y: 3 };
	A(at('c1-2', S, [], m) === 0 && at('c1-2', S, [{ t: 'deploy', uid: 'p1' }, { t: 'move', uid: 'p1', x: 2, y: 2 }], m) === 0, 'it opens at step 1, and deploying or moving does not tick it');
	A(at('c1-2', S, [a1], m) === 1, 'one attack queued: step 2 (a second figurine on the same foe)');
	A(at('c1-2', S, [a1, other], m) === 1 && at('c1-2', S, [a1, { ...a1 }], m) === 1, 'a second attack on ANOTHER foe does not tick it; nor the same figurine twice');
	A(at('c1-2', S, [a1, a2], m) === 2, 'two figurines on one foe: step 3 (Execute)');
	A(at('c1-2', S, [a1, a2, { t: 'unqueue', uid: 'p2' }], m) === 1, 'the second taken back: step 2 again');
	A(at('c1-2', S, [a1, a2, { t: 'execute' }], m) === 3 && L.comboExecuted([a1, a2, { t: 'execute' }]), 'Executed: the lesson is done');
	A(at('c1-2', S, [a1, { t: 'execute' }, a2, { t: 'execute' }], m) === 0 && at('c1-2', S, [a1, a2, { t: 'end' }], m) === 0, 'one at a time, each Executed alone, is not a combo; nor is ending the turn with them queued');
	A(/combo/.test(L.lessonOf('c1-2').end(S)), 'it signs off saying what a combo is');
}
// ---------- throwing and catching (c1-4)
{
	const { m, S } = battle('c1-4');
	const foe = S.units.find((u) => u.side !== 'p'), base = S.map.base;
	A(foe && at('c1-4', S, [], m) === 0, 'it opens at step 1: weaken it');
	const hp = foe.hp; foe.hp = Math.ceil(foe.maxHP / 2) + 1;
	A(at('c1-4', S, [], m) === 0, 'just over half HP: not yet');
	foe.hp = Math.max(1, Math.floor(foe.maxHP / 2) - 1);
	A(at('c1-4', S, [], m) === 1, 'under half HP: step 2 (throw it onto the base)');
	A(at('c1-4', S, [{ t: 'throw', uid: 'p1', target: foe.uid, x: base.x + 1, y: base.y }], m) === 1, 'thrown somewhere else: still step 2');
	A(at('c1-4', S, [{ t: 'throw', uid: 'p1', target: foe.uid, x: base.x, y: base.y }], m) === 2, 'thrown onto the base: the lesson is done');
	A(/broke free/.test(L.lessonOf('c1-4').end(S)), 'not caught: it says it broke free, and what to do');
	S.captured = [{ uid: foe.uid }];
	A(/Caught!/.test(L.lessonOf('c1-4').end(S)) && at('c1-4', S, [], m) === 2, 'caught: it says so');
	foe.hp = hp; delete S.captured;
}
// ---------- Geo panels (c2-1)
{
	const { m, S } = battle('c2-1');
	const g = m.symbols[0];
	A(S.symbols.length === 1 && at('c2-1', S, [], m) === 0, 'it opens at step 1: aim at the pyramid');
	A(at('c2-1', S, [{ t: 'attack', uid: 'p1', move: 'tackle', x: 6, y: 1 }], m) === 0, 'an attack on a foe does not tick it');
	A(at('c2-1', S, [{ t: 'attack', uid: 'p1', move: 'tackle', x: g.x, y: g.y }], m) === 1, 'an attack aimed at the symbol: step 2 (keep hitting it)');
	S.symbols.length = 0;
	A(at('c2-1', S, [], m) === 2 && /Broken/.test(L.lessonOf('c2-1').end(S)), 'the symbol is broken: the lesson is done');
}
// ---------- a step once passed is not gone back over when asked from there; and what the device remembers
{
	const { m, S } = battle('c1-2');
	A(L.lessonStep(L.lessonOf('c1-2'), S, [], m, 2) === 2, 'the bar does not go back a step once it has moved on');
	A(L.lessonsDone('["combo","geo"]').join() === 'combo,geo' && L.lessonsDone('junk').length === 0 && L.lessonsDone(null).length === 0 && L.lessonsDone('{"a":1}').length === 0 && L.lessonsDone('[1,"catch"]').join() === 'catch', 'what was stored is read safely');
}
// ---------- the page: the bar is the first battle's, with the lesson's name; skipping or finishing is remembered; the reset clears it
{
	const main = fs.readFileSync(path.join(ROOT, 'poketactica/js/main.js'), 'utf8'), hub = fs.readFileSync(path.join(ROOT, 'poketactica/js/hub.js'), 'utf8'), html = fs.readFileSync(path.join(ROOT, 'poketactica/index.html'), 'utf8');
	A(/P\.coach = coachFor\(m\)/.test(main) && /id="coach-title"/.test(html) && /coach-title'\)\.textContent = l\.name/.test(main), 'a battle starts with the first map\'s tutorial or the map\'s lesson, named in the bar');
	A(/if \(P\.coach && P\.coach\.lesson\) lessonFinished\(P\.coach\.lesson\)/.test(main), 'Skip ends the lesson for good');
	A(/lsWrite\('magepunk_poketactica_lessons_v1', null\)/.test(hub), '"Show the coaches again" brings the lessons back too');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
