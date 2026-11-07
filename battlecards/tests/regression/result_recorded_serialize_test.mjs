// result_recorded_serialize_test.mjs — recording a fight's result serializes without drift warnings.
//
// 2026-11-04 (instinctgauntlet, Lorequest fights 7 and 8): every fight-result save printed
//   serialize: unknown state field 'resultRecorded' — add it to FIELD_DEFAULTS in engine/serialize.js
// game.js recordRunResult() sets state.resultRecorded = true (ONE fight, ONE result) and the next
// toSnapshot (replay frame / snapshot save) met a field engine/serialize.js didn't know. The value was
// still copied (fail-safe), so results were never lost; the field is now a known one. It is kept
// (not stripped): a finished state that is ever restored must not record a second result.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { toSnapshot, fromSnapshot } from '../../engine/serialize.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const gameJs = fs.readFileSync(new URL('../../game.js', import.meta.url), 'utf8');
ok('game.js still marks a recorded result on the state', /state\.resultRecorded = true/.test(gameJs));

const warnings = [];
const realWarn = console.warn;
console.warn = m => warnings.push(String(m));
const state = E.createGame(byId, seededRng(3), null, 2);
for (let i = 0; i < 2; i++) E.endTurn(state);
state.over = true; state.winner = 0;
state.resultRecorded = true;   // what recordRunResult does
const snap = JSON.parse(JSON.stringify(toSnapshot(state)));
console.warn = realWarn;
ok('a recorded-result state serializes with no unknown-field warning', !warnings.some(w => w.includes('resultRecorded')), warnings.join(' | '));
ok('the flag survives the snapshot', snap.resultRecorded === true, snap.resultRecorded);
const back = fromSnapshot(snap, byId);
ok('...and the restore (a restored finished state never records twice)', back.resultRecorded === true, back.resultRecorded);

// a snapshot written before the change (no field) still loads, as "not recorded"
const old = JSON.parse(JSON.stringify(snap)); delete old.resultRecorded;
let loaded = null, threw = null;
try { loaded = fromSnapshot(old, byId); } catch (e) { threw = e.message; }
ok('an older snapshot without the field loads cleanly', !threw && loaded && loaded.players.length === 2, threw);
ok('...defaulting to not-recorded', loaded && loaded.resultRecorded === false, loaded && loaded.resultRecorded);
// a live fight's snapshot is unaffected
const live = E.createGame(byId, seededRng(5), null, 2);
ok('a fresh fight snapshots as not-recorded', toSnapshot(live).resultRecorded === false);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
