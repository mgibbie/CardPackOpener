// runlabel_test.mjs — a run's record must read naturally at one.
// Every run overlay hard-coded "N wins / N losses", so a 1-1 record read
// "1 wins / 1 losses". "loss" is irregular, so a naive +"s" would give "losss".
//   node battlecards/tests/unit/runlabel_test.mjs
import { plural, winLossLabel } from '../../runlabel.js';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL:', l, x ?? ''); } };

ok('1 win / 1 loss (the reported case)', winLossLabel({ wins: 1, losses: 1 }) === '1 win / 1 loss', winLossLabel({ wins: 1, losses: 1 }));
ok('0 wins / 0 losses', winLossLabel({ wins: 0, losses: 0 }) === '0 wins / 0 losses', winLossLabel({ wins: 0, losses: 0 }));
ok('12 wins / 2 losses', winLossLabel({ wins: 12, losses: 2 }) === '12 wins / 2 losses', winLossLabel({ wins: 12, losses: 2 }));
ok('mixed: 1 win / 0 losses', winLossLabel({ wins: 1, losses: 0 }) === '1 win / 0 losses', winLossLabel({ wins: 1, losses: 0 }));
ok('mixed: 3 wins / 1 loss', winLossLabel({ wins: 3, losses: 1 }) === '3 wins / 1 loss', winLossLabel({ wins: 3, losses: 1 }));
ok('missing fields read as zero', winLossLabel({}) === '0 wins / 0 losses', winLossLabel({}));
ok('a null run does not throw', winLossLabel(null) === '0 wins / 0 losses', winLossLabel(null));
ok('never produces "losss"', !winLossLabel({ wins: 2, losses: 2 }).includes('losss'), winLossLabel({ wins: 2, losses: 2 }));
ok('plural() handles irregulars via an explicit pair', plural(2, 'loss', 'losses') === '2 losses' && plural(1, 'loss', 'losses') === '1 loss');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
