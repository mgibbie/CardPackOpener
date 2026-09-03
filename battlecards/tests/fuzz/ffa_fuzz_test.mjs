// ffa_fuzz_test.mjs — CI-sized FFA fuzz: random 2-8 player games in --split
// mode (replayable/shrinkable traces) with mid-game concedes and the
// eliminated-seat target oracle active (see fuzz_test.mjs). The default
// fuzz_test.mjs invocation keeps its legacy 2-player determinism seeds; this
// wrapper is what makes every push exercise the FFA elimination paths too.
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const args = ['--players=0', '--games=6', '--actions=250', '--seed=20260903', '--split'];
const r = spawnSync(process.execPath, [join(here, 'fuzz_test.mjs'), ...args], { encoding: 'utf8' });

const out = (r.stdout || '').trim();
const tail = out.split('\n').pop() || '(no output)';
const stats = out.split('\n').find(l => l.includes('fuzz actions across')) || '';
if (r.status === 0 && /^\d+ passed, 0 failed$/.test(tail)) {
	console.log(`ffa fuzz (${args.join(' ')}): ${tail} ${stats}`);
	console.log('\n1 passed, 0 failed');
	process.exit(0);
}
console.log(`FAIL: ffa fuzz run\n${out.slice(-3000)}\n${(r.stderr || '').slice(0, 1500)}`);
console.log('\n0 passed, 1 failed');
process.exit(1);
