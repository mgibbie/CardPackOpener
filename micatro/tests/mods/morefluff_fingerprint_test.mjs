// More Fluff seeded run fingerprints: a fixed set of bot runs (micatro/tests/replay_bot.mjs, the live Session path)
// with More Fluff on — its decks and stakes included — hashed frame by frame (every view + every action's events),
// compared to the recorded baseline for THIS More Fluff pin (fixtures/morefluff_<pin>_fingerprints.json).
// Any change to how the mod plays changes a hash: bump the mod's contentRev (js/mods/pins.js) and re-record:
//   node micatro/tests/mods/morefluff_fingerprint_test.mjs --record
// The fixture's name carries the pin it was recorded on (Plans/MICATRO_MODS_PLAN.md §9: drift is attributable).
//   node micatro/tests/mods/morefluff_fingerprint_test.mjs
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { loadMods } from '../../js/mods/index.js';
import { modPin } from '../../js/mods/pins.js';
import { playRun } from '../replay_bot.mjs';

await loadMods(['morefluff']);
const PIN = modPin('morefluff');
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures', `morefluff_${PIN}_fingerprints.json`);
const RUNS = [ // (bot seeds picked so each run gets a few antes in)
  { name: 'red', start: { seed: 'MFFS2', back: 'b_red', stake: 1, mods: ['morefluff'] }, bot: 2, endless: true },
  { name: 'purple deck', start: { seed: 'MFFS3', back: 'b_mf_purple', stake: 1, mods: ['morefluff'] }, bot: 3, endless: true },
  { name: 'rainbow deck', start: { seed: 'MFFS7', back: 'b_mf_rainbow', stake: 2, mods: ['morefluff'] }, bot: 7, endless: true },
  { name: 'philosophical deck', start: { seed: 'MFFS1', back: 'b_mf_philosophical', stake: 1, mods: ['morefluff'] }, bot: 1, endless: true },
  { name: 'pink stake', start: { seed: 'MFFP5', back: 'b_red', stake: 'stake_mf_pink', mods: ['morefluff'] }, bot: 5 },
  { name: 'ultramarine stake', start: { seed: 'MFFS1', back: 'b_red', stake: 'stake_mf_ultramarine', mods: ['morefluff'] }, bot: 1, endless: true },
  { name: 'final stake', start: { seed: 'MFFS1', back: 'b_red', stake: 'stake_mf_final', mods: ['morefluff'] }, bot: 1, endless: true },
];

const got = {};
for (const r of RUNS) {
  const { frames, recipe } = playRun(r.start, { seed: r.bot, endless: !!r.endless, maxSteps: 700 });
  const h = crypto.createHash('sha256');
  for (const f of frames) { h.update(f.view); h.update(f.events); }
  got[r.name] = { actions: recipe.actions.length, frames: frames.length, hash: h.digest('hex').slice(0, 24) };
}

let fail = 0;
if (process.argv.includes('--record')) {
  fs.writeFileSync(FIX, JSON.stringify({ pin: PIN, note: 'recorded by morefluff_fingerprint_test.mjs --record', runs: got }, null, 1) + '\n');
  console.log(`recorded ${RUNS.length} fingerprints for More Fluff ${PIN} -> ${path.basename(FIX)}`);
} else {
  if (!fs.existsSync(FIX)) { console.log(`FAIL no baseline for More Fluff ${PIN}: re-record (--record) — a pin change means the mod's behaviour changed`); fail++; }
  else {
    const base = JSON.parse(fs.readFileSync(FIX, 'utf8'));
    if (base.pin !== PIN) { console.log(`FAIL baseline pin ${base.pin} != ${PIN}`); fail++; }
    for (const r of RUNS) {
      const a = base.runs[r.name], b = got[r.name];
      if (!a || a.hash !== b.hash || a.actions !== b.actions) { fail++; console.log(`FAIL ${r.name}: ${JSON.stringify(a)} -> ${JSON.stringify(b)} (bump contentRev and re-record if this change is meant)`); }
    }
  }
  console.log(`${RUNS.length - (fail ? Math.min(fail, RUNS.length) : 0)} passed, ${fail} failed`);
}
process.exit(fail ? 1 : 0);
