// state_machines_test.mjs — site/machine.js: the site's state machines, declared and watched.
// Owner, 2026-11-18: "Find all of the implicit state machines in my app. Make the best decision that will elevate all
// three: the user experience (UX), developer experience (DX), and agent experience (AX) always, without breaking
// anything". The decision (Plans/STATE_MACHINES.md): the flows are not rewritten; each is DECLARED beside the code
// that owns it and WATCHED, so its state can be read in one call and a drift is reported instead of becoming a bug.
//   1. the helper: a flow's state is read from the fields it already keeps; nothing is changed by reading
//   2. an illegal combination, an undeclared state and an undeclared move are each noted ONCE and sent to the
//      site's error beacon; a declared move is not; nothing ever throws, even when the reader itself does
//   3. one call lists every flow on the page with its state; another gives the declarations
//   4. the four flows declared so far say what they are (their states and moves), in the files that own them
//   5. the dust note that could never be settled (found by this survey): a half-made printing whose price has gone
//      gives the dust back, once
//   node overworld/tests/state_machines_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as M from '../../site/machine.js';
import * as C from '../../pocketenhanced/js/collection.js';
import { PRINTS } from '../../pocketenhanced/js/data/packs.js';
import { handlePkdust } from '../../server/pocket_collection.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
let pass = 0, fail = 0;
const A = (ok, msg, extra) => { if (ok) { pass++; console.log('ok  - ' + msg); } else { fail++; console.log('FAIL: ' + msg, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600)); } };

// ===== 1. reading =====
M.resetForTest();
const door = { open: false, locked: false, writes: 0 };
const m = M.observe('door', { where: 'test', states: ['closed', 'open', 'locked'], moves: { closed: ['open', 'locked'], open: ['closed'], locked: ['closed'] },
	read: () => (door.open && door.locked ? 'illegal: open and locked at once' : door.open ? 'open' : door.locked ? 'locked' : 'closed'), detail: () => ({ writes: door.writes }) });
const before = JSON.stringify(door);
A(m.state() === 'closed' && m.check() === 'closed' && JSON.stringify(door) === before && M.problems().length === 0, 'a flow\'s state is worked out from its own fields; reading and checking change nothing');

// ===== 2. what is noted =====
const beacon = []; globalThis.window = { reportErr: (msg, where) => beacon.push([msg, where]) };
door.open = true; m.check(); door.open = false; m.check();
A(M.problems().length === 0 && beacon.length === 0, 'declared moves (closed -> open -> closed) are not noted');
door.locked = true; m.check(); door.locked = false; door.open = true; m.check();
A(M.problems().length === 1 && M.problems()[0].kind === 'undeclared move' && M.problems()[0].text === 'locked -> open' && /state machine door: undeclared move: locked -> open/.test(beacon[0][0]), 'a move that is not declared (locked -> open) is noted and sent to the error beacon', [M.problems(), beacon]);
door.open = false; m.check(); door.locked = true; m.check(); door.locked = false; door.open = true; m.check();
A(M.problems().length === 1 && beacon.length === 1, 'the same thing again is not noted twice');
door.locked = true; const ill = m.check();
A(ill === 'illegal: open and locked at once' && M.problems().length === 2 && M.problems()[1].kind === 'illegal state', 'a combination the fields can hold but the flow never means is noted as illegal', M.problems());
door.locked = false; m.check();
A(M.problems().length === 2, 'coming back from an illegal state is not itself a bad move');
const odd = M.observe('odd', { states: ['a'], read: () => 'b' }), thrower = M.observe('thrower', { states: ['a'], read: () => { throw new Error('boom'); }, detail: () => { throw new Error('boom2'); } });
A(odd.check() === 'b' && M.problems().some(p => p.name === 'odd' && p.kind === 'undeclared state') && /^illegal: read threw: boom/.test(thrower.check()) && thrower.detail() === undefined, 'a state that was never declared is noted; a reader that throws is reported as illegal and nothing is thrown');
globalThis.window = { reportErr: () => { throw new Error('the beacon is down'); } };
const q = M.observe('q', { states: ['a'], read: () => 'zzz' });
A(q.check() === 'zzz', 'a beacon that fails does not stop the game');
delete globalThis.window;

// ===== 3. one call =====
const snap = M.snapshot(), desc = M.describe();
A(snap.door && snap.door.state === 'open' && snap.door.detail.writes === 0 && snap.door.where === 'test' && Object.keys(snap).length === 4, 'one call gives every flow with its state, its detail and the file that owns it', snap);
A(JSON.stringify(desc.door.states) === '["closed","open","locked"]' && desc.door.moves.closed.join() === 'open,locked' && desc.odd.moves === null, 'another gives the declarations: each flow\'s states and moves');

// ===== 4. the flows declared so far =====
const FLOWS = [['inventory.trade', 'inventory/inventory.js'], ['overworld.trade', 'overworld/ow_pvp.js'], ['pocket.page', 'pocketenhanced/js/main.js'], ['pocket.turn', 'pocketenhanced/js/main.js']];
for (const [name, file] of FLOWS) {
	const src = fs.readFileSync(path.join(ROOT, file), 'utf8'), at = src.indexOf(`observe('${name}'`);
	const block = at >= 0 ? src.slice(at, at + 2600) : '';
	A(at >= 0 && new RegExp(`where: '${file.replace(/[/.]/g, '\\$&')}'`).test(block) && /states: \[/.test(block) && /read\(\) \{/.test(block) && /illegal: /.test(block), `${name} is declared in ${file}: its states, how they are read from its own fields, and what counts as illegal`);
}
const doc = fs.readFileSync(path.join(ROOT, 'Plans/STATE_MACHINES.md'), 'utf8');
A(FLOWS.every(([name]) => doc.includes('`' + name + '`')) && /## The decision/.test(doc) && /## Every flow found/.test(doc), 'the inventory of every flow found, and the decision, are written down (Plans/STATE_MACHINES.md), naming the four declared so far');

// ===== 5. the dust note that could never be settled =====
{
	const rows = new Map();
	const store = { get: async k => (rows.has(k) ? JSON.parse(rows.get(k)) : null), setIfRev: async (k, v, expect) => { const cur = rows.has(k) ? JSON.parse(rows.get(k)) : null; if (((cur && cur.rev) || 0) !== expect) return false; rows.set(k, JSON.stringify(v)); return true; },
		getWithLength: async k => (rows.has(k) ? { value: JSON.parse(rows.get(k)), n: rows.get(k).length } : { value: null, n: null }), setIfLength: async (k, v, n) => { if ((rows.has(k) ? rows.get(k).length : null) !== n) return false; rows.set(k, JSON.stringify(v)); return true; } };
	const dust = (action, body) => handlePkdust({ action, body: body || {}, store, username: 'ann', json: (o, status) => ({ ...o, status: status || 200 }), now: 9 });
	const D4 = PRINTS.find(p => p[2] === '4D')[0];
	// a making that died after the dust left, for a printing that has since left the price table; and one that can still be made
	rows.set('ann', JSON.stringify({ username: 'ann', dust: 100, pkCraft: { gone000001: { print: 'XX-000', cost: 1600 }, fine000001: { print: D4, cost: 1600 } } }));
	rows.set('pkcol:ann', JSON.stringify({ rev: 2, col: C.newCollection(), at: 1, ids: [] }));
	let r = await dust('pkdust-settle');
	const a = JSON.parse(rows.get('ann')), col = JSON.parse(rows.get('pkcol:ann')).col;
	A(r.ok && a.dust === 1700 && !a.pkCraft && col.prints[D4] === (C.newCollection().prints[D4] || 0) + 1 && !col.prints['XX-000'], 'a half-made printing whose price has gone: its 1,600 dust comes back and the note is cleared; the one that can still be made is made', [r.dust, a.pkCraft, col.prints[D4]]);
	r = await dust('pkdust-settle');
	A(r.dust === 1700 && JSON.parse(rows.get('pkcol:ann')).col.prints[D4] === col.prints[D4], 'settling again gives nothing more');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
