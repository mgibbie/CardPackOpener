// poketactica_status_words_test.mjs — a status condition is shown as a picture and its word (plan item A5; the screens
// pass, 2026-11-26: it was a three-letter code, "BRN", in the unit panel, over the board and in the maze's messages).
//   node overworld/tests/poketactica_status_words_test.mjs
import { STATUS_SHOW, statusShow } from '../../poketactica/js/engine/statusfx.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra) : '')); } };

const ALL = ['brn', 'psn', 'tox', 'par', 'slp', 'frz'];
A(ALL.every((s) => STATUS_SHOW[s] && STATUS_SHOW[s][0] && /^[A-Z][a-z]/.test(STATUS_SHOW[s][1])), 'each of the six conditions has a picture and a word', STATUS_SHOW);
A(statusShow('brn') === '🔥 Burned' && statusShow('par') === '⚡ Paralysed' && statusShow('slp') === '💤 Asleep', 'said together: "🔥 Burned", "⚡ Paralysed", "💤 Asleep"');
A(statusShow('tox') !== statusShow('psn') && /Badly poisoned/.test(statusShow('tox')), 'badly poisoned is told from poisoned by its word');
A(statusShow('zzz') === 'ZZZ' && statusShow(null) === '', 'a condition this list does not know is still said (its code), never blank or a crash');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
