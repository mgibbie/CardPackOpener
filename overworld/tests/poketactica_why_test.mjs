// poketactica_why_test.mjs — A PRESS EXPLAINS IT (Plans/POKETACTICA_MODES_PLAN.md item A5, the part left over: "a press on
// any of them explains it"). In a unit's panel a status, a lasting mark and the held item are each a button; a press says
// what it does. Every status and every mark the battle can show has its sentence.
// Pure: node only.   node overworld/tests/poketactica_why_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as SF from '../../poketactica/js/engine/statusfx.js';
import * as B from '../../poketactica/js/engine/battle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); } };

A(Object.keys(SF.STATUS_SHOW).every((k) => SF.STATUS_SAY[k] && SF.STATUS_SAY[k].length > 20) && Object.keys(SF.STATUS_SAY).length === Object.keys(SF.STATUS_SHOW).length, 'every status shown has a sentence, and there is none for a status that is not shown', Object.keys(SF.STATUS_SHOW).filter((k) => !SF.STATUS_SAY[k]));
A(Object.keys(SF.MARK_SAY).every((k) => SF.MARK_WHY[k] && SF.MARK_WHY[k].length > 12) && Object.keys(SF.MARK_WHY).every((k) => SF.MARK_SAY[k]), 'every lasting mark has a sentence (' + Object.keys(SF.MARK_SAY).length + ' of them), and no sentence is for a mark that is not there', Object.keys(SF.MARK_SAY).filter((k) => !SF.MARK_WHY[k]));
A([...Object.values(SF.STATUS_SAY), ...Object.values(SF.MARK_WHY)].every((t) => /[.]$/.test(t) && !/undefined|TODO/.test(t)), 'each is a whole sentence');
// the numbers in a status's sentence are the battle's own
A(B.STATUS_CHIP.brn === 1 / 16 && /1\/16/.test(SF.STATUS_SAY.brn) && B.STATUS_CHIP.psn === 1 / 8 && /1\/8/.test(SF.STATUS_SAY.psn) && B.PAR_FAIL === 0.25 && /1 time in 4/.test(SF.STATUS_SAY.par) && B.FRZ_THAW === 0.2 && /1 chance in 5/.test(SF.STATUS_SAY.frz), 'a burn, a poison, paralysis and a freeze say the battle\'s own numbers (1/16, 1/8, 1 in 4, 1 in 5)');
A(SF.whyOf('status', 'brn').name === 'Burned' && SF.whyOf('status', 'brn').text === SF.STATUS_SAY.brn && SF.whyOf('mark', 'reflect').name === 'Reflect' && /Physical/.test(SF.whyOf('mark', 'reflect').text) && SF.whyOf('status', 'nope') === null && SF.whyOf('mark', 'nope') === null, 'a press is answered with the name and the sentence; an unknown one with nothing');
{
	const main = fs.readFileSync(path.join(ROOT, 'poketactica/js/main.js'), 'utf8'), css = fs.readFileSync(path.join(ROOT, 'poketactica/css/poketactica.css'), 'utf8');
	A(/why\('status', u\.status, statusShow\(u\.status\)\)/.test(main) && /why\('mark', t\.id,/.test(main) && /why\('held', u\.heldId \+ ':'/.test(main), 'in a unit\'s panel the status, each mark and the held item are buttons');
	A(/\$\('unit'\)\.addEventListener\('click'/.test(main) && /heldTextAt\(id, \+lv \|\| 1\)/.test(main) && /showTip\(w\.name, w\.text\)/.test(main), 'a press shows what it does (a held item: its own text at its level)');
	A(/\.pt-why \{[^}]*pointer-events: auto/.test(css), 'and the buttons take a tap');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
