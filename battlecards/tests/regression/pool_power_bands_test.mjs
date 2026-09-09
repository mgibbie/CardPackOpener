// pool_power_bands_test.mjs — guards the advanced-pool power ladder
// (Plans/ADVANCED_POOL_POWER_PLAN.md): every pool in the audit tool's ENFORCED
// list must sit at or above its tier band, and no advanced-pool card may carry
// a rarity (owner rule 2026-09-09 — pool cards are uncollectible Discover
// rewards, not pack cards).
import fs from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

// ---- tier bands hold for every enforced pool ----
let out = '', code = 0;
try {
  out = execFileSync(process.execPath, [path.join(HERE, '../../../tools/pool_power_audit.mjs'), '--check'], { encoding: 'utf8' });
} catch (e) {
  code = e.status ?? 1; out = (e.stdout || '') + (e.stderr || '');
}
ok('pool_power_audit --check passes', code === 0, out.trim());

// ---- no advanced-pool card carries rarity ----
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const offenders = raw.cards.filter(c => c.landSet && !c.token && 'rarity' in c);
ok('no landSet pool card carries a rarity', offenders.length === 0, offenders.slice(0, 8).map(c => c.id));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
