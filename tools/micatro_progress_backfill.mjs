// micatro_progress_backfill.mjs — what the Micatro Record's per-type fields (monoStake / bothMono / bothStake, PR
// feat/micatro-record-type-stickers) would be for each player whose `micatro_progress:<user>` row predates them,
// derived from that player's saved won replays (`mreplay:<id>` meta {won, stake, badges: {nuz?, mono?}}) — the same
// read-time derivation server/mp.mjs micatro-progress-get does (micatroProgressFromRuns; keep the two in step).
//
// DRY RUN by default: SELECT-only, prints each account's stored record, the derived per-type values, and which types
// still lack a Nuzlocke + Monotype win. Nothing is written.
//
// --apply (ONLY when the owner says so): persists the derived values so they outlive the replays' 30-day GC. Per exact
// key, additive (the server's max-merge: no stored field can go down), guarded by a compare-and-set on the row's `rev`
// (a row that changed since it was read is skipped), after a backup of every row it would touch is written to
// Desktop/playtest-reports/micatro_progress_backup_<ts>.json. Rollback = put the backup's `value` back for that key.
//
//   node tools/micatro_progress_backfill.mjs [user ...]          (default: every micatro_progress row + MP_BUG_REPORTERS)
//   node tools/micatro_progress_backfill.mjs --apply kgib        (writes; owner approval first)
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const named = args.filter((a) => !a.startsWith('--'));
const REPORTERS = (process.env.MP_BUG_REPORTERS || 'instinctloretest0918,remygl,remytest').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const TYPES = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'colorless', 'dark', 'metal', 'fairy', 'dragon', 'earth'];
const MAPS = ['mono', 'monoStake', 'bothMono', 'bothStake'];

const win = process.platform === 'win32';
function wrangler(extra) {
	const out = execFileSync(win ? 'npx.cmd' : 'npx', ['wrangler', 'd1', 'execute', 'magepunk-users', '--remote', '--json', ...extra],
		{ cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: win, stdio: ['ignore', 'pipe', 'pipe'] });
	return JSON.parse(out.slice(out.indexOf('[')));
}
function d1(sql) {
	if (!/^\s*SELECT\b/i.test(sql)) throw new Error('read-only: SELECT only');
	if (win && /["%^&|<>]/.test(sql)) throw new Error('unsafe SQL for the Windows shell');
	return wrangler(['--command', win ? `"${sql}"` : sql])[0].results;
}
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const J = (s, d = null) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch { return d; } };

// ---- the server's shapes (server/mp.mjs: cleanRunBadges, mergeMicatroProgress, micatroProgressFromRuns) ----
function cleanRunBadges(b) {
	if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
	for (const k of Object.keys(b)) if (k !== 'nuz' && k !== 'mono') return null;
	const out = {};
	if (b.nuz != null) { if (typeof b.nuz !== 'boolean') return null; if (b.nuz) out.nuz = true; }
	if (b.mono != null && b.mono !== false) { if (typeof b.mono !== 'string' || !TYPES.includes(b.mono)) return null; out.mono = b.mono; }
	return out;
}
const empty = () => ({ v: 1, nuz: 0, nuzStake: 0, both: 0, mono: {}, ach: {}, monoStake: {}, bothMono: {}, bothStake: {} });
function merge(a, b) {
	const out = empty();
	for (const k of ['nuz', 'nuzStake', 'both']) out[k] = Math.max(+a[k] || 0, +b[k] || 0);
	for (const m of MAPS) for (const t of TYPES) { const n = Math.max(+(a[m] || {})[t] || 0, +(b[m] || {})[t] || 0); if (n) out[m][t] = n; }
	const ids = [...new Set([...Object.keys(a.ach || {}), ...Object.keys(b.ach || {})])].sort().slice(0, 64);
	for (const id of ids) { const x = (a.ach || {})[id], y = (b.ach || {})[id]; out.ach[id] = x && y ? Math.min(x, y) : x || y; }
	return out;
}
function fromRuns(runs) {
	const out = { monoStake: {}, bothMono: {}, bothStake: {} };
	for (const r of runs) {
		const b = cleanRunBadges(r.badges);
		if (!b || !b.mono) continue;
		const lv = Math.min(99, Math.max(1, Math.floor(Number(r.stake)) || 1));
		out.monoStake[b.mono] = Math.max(out.monoStake[b.mono] || 0, lv);
		if (b.nuz) { out.bothMono[b.mono] = (out.bothMono[b.mono] || 0) + 1; out.bothStake[b.mono] = Math.max(out.bothStake[b.mono] || 0, lv); }
	}
	return out;
}
const STAKES = ['White', 'Red', 'Green', 'Black', 'Blue', 'Purple', 'Orange', 'Gold'];
const stake = (lv) => (lv ? STAKES[Math.min(8, lv) - 1] : '?');
const cap = (t) => t[0].toUpperCase() + t.slice(1);

// ---- read ----
const rows = d1("SELECT key, value FROM mp_store WHERE substr(key, 1, 17) = 'micatro_progress:'");
const stored = Object.fromEntries(rows.map((r) => [r.key.slice(17), J(r.value, {})]));
const users = named.length ? named.map((u) => u.toLowerCase()) : [...new Set([...Object.keys(stored), ...REPORTERS])];
const runs = d1("SELECT json_extract(value, '$.by') AS by_, json_extract(value, '$.meta.stake') AS stake, json_extract(value, '$.meta.badges') AS badges FROM mp_store WHERE substr(key, 1, 8) = 'mreplay:' AND json_extract(value, '$.meta.won') AND json_extract(value, '$.meta.badges') IS NOT NULL");

const plan = [];
for (const u of users) {
	const row = stored[u];
	const mine = runs.filter((r) => r.by_ === u).map((r) => ({ stake: r.stake, badges: J(r.badges) }));
	console.log(`\n== ${u} ==`);
	if (!row) { console.log(`  no micatro_progress row (${mine.length} won replays with badges)`); continue; }
	const p = merge(empty(), row.progress || {});
	const derived = fromRuns(mine);
	const next = merge(p, derived);
	const placed = Object.values(next.bothMono).reduce((a, n) => a + n, 0);
	console.log(`  stored: rev ${row.rev}, nuz ${p.nuz} (best ${stake(p.nuzStake)}), both ${p.both}, Monotype types ${Object.keys(p.mono).length}/12; per-type fields stored: ${MAPS.slice(1).some((m) => Object.keys(p[m]).length) ? 'yes' : 'no'}`);
	console.log(`  won replays with badges: ${mine.length}`);
	for (const t of TYPES) {
		if (!p.mono[t] && !next.bothMono[t]) { console.log(`    ${cap(t).padEnd(10)} -`); continue; }
		const b = next.bothMono[t];
		console.log(`    ${cap(t).padEnd(10)} ${b ? `ARCEUS  Nuz+Mono x${b} (best ${stake(next.bothStake[t])})` : `ambipom Monotype only (best ${next.monoStake[t] ? stake(next.monoStake[t]) : 'unknown -> White'})`}`);
	}
	const missing = TYPES.filter((t) => p.mono[t] && !next.bothMono[t]).map(cap);
	console.log(`  placed ${placed}/${p.both} Nuzlocke + Monotype wins; types still missing Nuz+Mono: ${missing.join(', ') || 'none'}`);
	if (JSON.stringify(next) !== JSON.stringify(p)) plan.push({ user: u, key: 'micatro_progress:' + u, rev: row.rev || 0, before: row, progress: next });
}
console.log(`\n${plan.length} row(s) would gain per-type fields: ${plan.map((x) => x.key).join(', ') || 'none'}`);
if (!APPLY) { console.log('dry run: nothing written (--apply writes, owner approval first)'); process.exit(0); }

// ---- --apply: backup, then one guarded, additive UPDATE per exact key ----
const outDir = path.join(os.homedir(), 'Desktop', 'playtest-reports');
fs.mkdirSync(outDir, { recursive: true });
const backup = path.join(outDir, `micatro_progress_backup_${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify(plan.map((x) => ({ key: x.key, value: x.before })), null, 2));
console.log('backup: ' + backup);
for (const x of plan) {
	const value = JSON.stringify({ rev: x.rev + 1, progress: x.progress, updated_at: Date.now() });
	const sql = `UPDATE mp_store SET value = ${q(value)}, updated_at = unixepoch() WHERE key = ${q(x.key)} AND COALESCE(json_extract(value, '$.rev'), 0) = ${Number(x.rev)};`;
	const f = path.join(os.tmpdir(), `micatro_backfill_${x.user}.sql`);
	fs.writeFileSync(f, sql);
	const r = wrangler(['--file', f]);
	const changes = r && r[0] && r[0].meta ? r[0].meta.changes : 0;
	console.log(`${x.key}: ${changes ? 'written (rev ' + (x.rev + 1) + ')' : 'SKIPPED (the row changed since it was read)'}`);
	fs.unlinkSync(f);
}
