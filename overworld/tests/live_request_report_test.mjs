// live_request_report_test.mjs — tools/live-request-report.mjs (owner's list 5, item 10, 2026-11-19: a report of how
// many server requests the live features make; the Cloudflare plan bills requests). A cheap slice of it:
//   1. the report runs (real server over sqlite, headless Chrome) for a 30 s window on the idle overworld player, and
//      finishes with a table and a total
//   2. an overworld player standing still, signed in, no friend online, stays under IDLE_CEILING /api/mp calls a
//      minute. The ceiling: on 2026-11-19 an idle player alone made ~21/min (challenges 8, chat-get 4, friends 2,
//      pack-timer 2, quests 2, heartbeat / ow-save / async-list 1 each). 30 leaves room for a slow new cadence and
//      fails when something new polls every 5 s or faster (12/min on its own). Raise it on purpose, with the report's
//      numbers in the PR, never just to make it pass.
//   node overworld/tests/live_request_report_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const IDLE_CEILING = 30;   // /api/mp calls per minute, an idle overworld player alone
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'livereq-')), 'report.json');
const t0 = Date.now();
const res = await new Promise((resolve) => {
	const ch = spawn(process.execPath, [path.join(ROOT, 'tools/live-request-report.mjs'), '--seconds=30', '--only=ow-idle-alone', '--json=' + out, '--no-file', '--quiet'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
	let so = '', se = '';
	ch.stdout.on('data', (d) => { so += d; }); ch.stderr.on('data', (d) => { se += d; });
	const kill = setTimeout(() => ch.kill(), 300000);
	ch.on('close', (code) => { clearTimeout(kill); resolve({ code, so, se }); });
});
const secs = Math.round((Date.now() - t0) / 1000);
A(res.code === 0, `the report finishes (exit 0, ${secs} s)`, res.se.slice(-800));
A(/\| situation \| role \| load \| calls\/min \|/.test(res.so) && /\*\*total\*\*/.test(res.so), 'it prints the table (situation x action -> calls/min) and a total', res.so.slice(0, 400));
let rep = null; try { rep = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { /* checked below */ }
const row = rep && rep.rows.find((r) => r.situation === 'ow-idle-alone' && r.role === 'player');
A(rep && !rep.failed.length && row, 'the idle overworld player was measured', rep && rep.failed);
A(row && row.load > 0 && Object.keys(row.perMin).length > 0, 'its calls were counted by action (it made some: heartbeat at least)', row);
A(row && row.total <= IDLE_CEILING, `an idle overworld player alone makes at most ${IDLE_CEILING} calls/min (measured ${row && row.total}: ${row && JSON.stringify(row.perMin)})`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
