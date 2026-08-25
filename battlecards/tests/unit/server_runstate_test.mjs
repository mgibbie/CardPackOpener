// server_runstate_test.mjs — the authoritative run + overworld state endpoints in server/mp.mjs
// (run-save / run-load / run-clear / ow-save / ow-load). Like the other server tests, mp.mjs can't be
// plain-imported, so pin the handler's shape from source and exercise the pure reconciliation logic.
// Full round-trip is covered by tests/integration/relay_harness.mjs.
import fs from 'fs';

const src = fs.readFileSync(new URL('../../../server/mp.mjs', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };
const block = (name, n = 700) => { const i = src.indexOf(`action === '${name}'`); return i < 0 ? '' : src.slice(i, i + n); };

// --- actions exist ---
for (const a of ['run-save', 'run-load', 'run-clear', 'ow-save', 'ow-load'])
  ok(`${a} action exists`, src.includes(`action === '${a}'`));

// --- run-save: validated + capped + durable dedicated key + updated_at ---
const rs = block('run-save');
ok('run-save validates the run key against RUN_KEYS', /RUN_KEYS\.has\(key\)/.test(rs));
ok('run-save rejects a non-object run', /typeof run !== 'object'|Array\.isArray\(run\)/.test(rs));
ok('run-save enforces a size cap', /RUN_MAX_BYTES/.test(rs) && /413/.test(rs));
ok('run-save stores under the durable per-user key run:<username> with updated_at', /'run:' \+ username/.test(rs) && /updated_at: Date\.now\(\)/.test(rs));

// --- run-load / run-clear ---
ok('run-load returns the per-user run doc', /'run:' \+ username/.test(block('run-load', 200)) && /runs:/.test(block('run-load', 200)));
const rc = block('run-clear');
ok('run-clear deletes one key (or all) from the doc', /delete doc\[key\]/.test(rc) && /'run:' \+ username/.test(rc));

// --- ow-save / ow-load ---
const os = block('ow-save');
ok('ow-save is size-capped + durable (ow:<username>) with updated_at', /OW_MAX_BYTES/.test(os) && /'ow:' \+ username/.test(os) && /updated_at: Date\.now\(\)/.test(os));
ok('ow-load returns the per-user overworld doc', /'ow:' \+ username/.test(block('ow-load', 160)));

// --- constants: the 7 run keys + caps, and DURABILITY (not swept) ---
ok('RUN_KEYS lists all 7 run-mode localStorage keys', ['dungeon', 'heist', 'tombs', 'duels', 'arena', 'lorequest', 'middleearth'].every(m => src.includes(`magepunk_${m}_v1`)));
ok('RUN_MAX_BYTES + OW_MAX_BYTES defined', /const RUN_MAX_BYTES =/.test(src) && /const OW_MAX_BYTES =/.test(src));
// GC_TABLE lists only EPHEMERAL prefixes; run:/ow: are durable by omission (never swept)
const gc = src.slice(src.indexOf('const GC_TABLE'), src.indexOf('const GC_TABLE') + 700);
ok('run: and ow: are NOT in the GC sweep table (durable)', !gc.includes("'run:'") && !gc.includes("'ow:'"), gc.match(/\['[a-z]+:'/g)?.join(','));

// --- pure logic: last-write-wins reconciliation (the client picks the newer of server vs local) ---
const newer = (server, local) => {
  if (!server) return local || null;         // no server copy -> keep local
  if (!local) return server;                 // no local -> take server
  return (server.updated_at || 0) >= (local.updated_at || 0) ? server : local; // tie/newer -> server wins
};
ok('reconcile: server wins when strictly newer', newer({ updated_at: 200, v: 's' }, { updated_at: 100, v: 'l' }).v === 's');
ok('reconcile: local wins when strictly newer (offline edits survive until pushed)', newer({ updated_at: 100, v: 's' }, { updated_at: 200, v: 'l' }).v === 'l');
ok('reconcile: server wins ties (authoritative)', newer({ updated_at: 100, v: 's' }, { updated_at: 100, v: 'l' }).v === 's');
ok('reconcile: missing server -> keep local', newer(null, { v: 'l' }).v === 'l');
ok('reconcile: missing local -> take server', newer({ v: 's' }, null).v === 's');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
