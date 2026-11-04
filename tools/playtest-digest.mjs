// playtest-digest.mjs — a daily, READ-ONLY report on what the playtesters did and
// what looks broken, from the production D1 (owner's standing OK, 2026-10-01).
//
//   node tools/playtest-digest.mjs                  # the watched accounts below
//   node tools/playtest-digest.mjs someuser other   # any accounts
//
// Per account it reads ow:<user> (the overworld save), presence:<user> and
// run:<user> (Battlecards), compares them with the snapshot from the previous run
// (kept OUTSIDE the repo, in %LOCALAPPDATA%/magepunk-digest), and writes
// Desktop/playtest-reports/<date>.md. It also lists the day's error-beacon
// rollup (anonymous, site-wide). It never writes to D1, and it prints only game
// state — no tokens, no account records.
//
// Flags the bug shapes we have actually hit:
//   * junk `eventscript…` items in the bag (scripted balls minted as items, #626)
//   * story flags or badges LOST since the last check (the 2026-10-01 rollback, #624)
//   * playtime grew but the position did not move (stuck / soft-lock)
//   * many saves with little playtime (a write loop)
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ACCOUNTS = process.argv.slice(2).length ? process.argv.slice(2)
	: ['instinctloretest0918', 'remygl'];           // Instinct, Muse
const NAMES = { instinctloretest0918: 'Instinct', remygl: 'Muse' };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const STATE_DIR = path.join(process.env.LOCALAPPDATA || os.homedir(), 'magepunk-digest');
const OUT_DIR = path.join(os.homedir(), 'Desktop', 'playtest-reports');
fs.mkdirSync(STATE_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------- read-only D1 ----------
function d1(sql) {
	if (!/^\s*SELECT\b/i.test(sql)) throw new Error('read-only: SELECT only');
	// Windows runs npx.cmd through a shell, which splits an unquoted argument on its
	// spaces — the SQL must go in as ONE double-quoted argument (it never contains
	// a double quote or a cmd metacharacter: SELECT ... IN ('...') only)
	const win = process.platform === 'win32';
	if (win && /["%^&|<>]/.test(sql)) throw new Error('unsafe SQL for the Windows shell');
	const out = execFileSync(win ? 'npx.cmd' : 'npx',
		['wrangler', 'd1', 'execute', 'magepunk-users', '--remote', '--json', '--command', win ? `"${sql}"` : sql],
		{ cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: win, stdio: ['ignore', 'pipe', 'pipe'] });
	return JSON.parse(out.slice(out.indexOf('[')))[0].results;
}
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const J = (s, d = null) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } };

// ---------- one snapshot of an account ----------
function snapshot(user) {
	const rows = d1(`SELECT key, value, updated_at FROM mp_store WHERE key IN (${[`ow:${user}`, `presence:${user}`, `run:${user}`].map(q).join(',')})`);
	const by = Object.fromEntries(rows.map(r => [r.key.split(':')[0], r]));
	const snap = { user, at: Date.now() };
	if (by.ow) {
		const ow = (J(by.ow.value) || {}).ow || {};
		const story = J(ow.magepunk_story, { flags: {}, vars: {} });
		const pos = J(ow.magepunk_pos_v1, {});
		const party = J(ow.magepunk_party_v1, []);
		const badges = (J(ow.magepunk_badges_v1, {}) || {}).badges || {};
		const dex = J(ow.magepunk_dex_v1, {}) || {};
		const coll = J(ow.magepunk_collected_v1, []);
		const defeated = J(ow.magepunk_defeated_v1, []);
		snap.ow = {
			updated: by.ow.updated_at * 1000, rev: +ow.magepunk_ow_rev || 0, playtime: +ow.magepunk_playtime || 0,
			region: ow.magepunk_region || null, pos: { map: pos.map, x: pos.x, y: pos.y },
			money: +ow.magepunk_money || 0,
			flags: Object.keys(story.flags || {}).filter(k => story.flags[k]).sort(),
			vars: story.vars || {},
			badges: Object.fromEntries(Object.entries(badges).map(([r, b]) => [r, Object.keys(b || {}).filter(k => b[k]).sort()])),
			party: (Array.isArray(party) ? party : []).map(m => m && { species: m.speciesId, name: m.name, level: m.level, hp: m.curHP, max: m.maxHP }),
			bag: J(ow.magepunk_bag_v1, {}) || {},
			dex: { caught: Object.keys(dex.caught || {}).length, seen: Object.keys(dex.seen || {}).length },
			collected: Array.isArray(coll) ? coll.length : Object.keys(coll || {}).length,
			defeated: Array.isArray(defeated) ? defeated.length : Object.keys(defeated || {}).length,
		};
	}
	if (by.presence) {
		const p = J(by.presence.value, {});
		snap.presence = { map: p.map, x: p.x, y: p.y, status: p.status, lastSeen: p.lastSeen || by.presence.updated_at * 1000 };
	}
	if (by.run) {
		const r = J(by.run.value, {}) || {};
		snap.run = { updated: by.run.updated_at * 1000, bytes: by.run.value.length, mode: r.mode || r.kind || null, keys: Object.keys(r).slice(0, 12) };
	}
	return snap;
}

// ---------- compare two snapshots ----------
const fmtDur = s => s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`;
const when = ms => ms ? new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' EDT' : '—';
function diff(prev, cur) {
	const out = { lines: [], anomalies: [] };
	const A = cur.ow, P = prev && prev.ow;
	if (!A) { out.lines.push('No overworld save on the server.'); return out; }
	// junk is an anomaly whether or not there is a baseline
	const junk = Object.keys(A.bag).filter(k => /^eventscript/.test(k));
	if (junk.length) out.anomalies.push(`Junk items in the bag (a scripted ball minted as an item): ${junk.join(', ')}`);
	if (!P) {
		out.lines.push(`Baseline taken. ${A.region || '?'} · ${A.pos.map} (${A.pos.x},${A.pos.y}) · rev ${A.rev} · playtime ${fmtDur(A.playtime)}`);
		out.lines.push(`Party: ${A.party.filter(Boolean).map(m => `${m.name} ${m.level}`).join(', ')}`);
		out.lines.push(`Badges: ${Object.entries(A.badges).map(([r, b]) => `${r} ${b.length}`).join(' · ')} · story flags ${A.flags.length} · dex ${A.dex.caught} caught / ${A.dex.seen} seen`);
		return out;
	}
	const dPlay = A.playtime - P.playtime, dRev = A.rev - P.rev;
	out.lines.push(`Played ${fmtDur(Math.max(0, dPlay))} · ${dRev} saves · now ${A.pos.map} (${A.pos.x},${A.pos.y}) — was ${P.pos.map} (${P.pos.x},${P.pos.y})`);
	if (A.region !== P.region) out.lines.push(`Region: ${P.region} → ${A.region}`);
	// story
	const gained = A.flags.filter(f => !P.flags.includes(f) && !/^FLAG_TEMP_/.test(f));
	const lost = P.flags.filter(f => !A.flags.includes(f) && !/^FLAG_TEMP_/.test(f));
	if (gained.length) out.lines.push(`Story flags gained (${gained.length}): ${gained.slice(0, 40).join(', ')}${gained.length > 40 ? ' …' : ''}`);
	if (lost.length) out.anomalies.push(`Story flags LOST since the last check (${lost.length}) — rollback? ${lost.slice(0, 30).join(', ')}${lost.length > 30 ? ' …' : ''}`);
	const stateVars = Object.keys({ ...A.vars, ...P.vars }).filter(k => /_STATE$/.test(k) && JSON.stringify(A.vars[k]) !== JSON.stringify(P.vars[k]));
	if (stateVars.length) out.lines.push(`Story state vars: ${stateVars.map(k => `${k} ${JSON.stringify(P.vars[k] ?? '—')}→${JSON.stringify(A.vars[k] ?? '—')}`).join(', ')}`);
	// badges
	for (const r of new Set([...Object.keys(A.badges), ...Object.keys(P.badges)])) {
		const a = A.badges[r] || [], p = P.badges[r] || [];
		const g = a.filter(b => !p.includes(b)), l = p.filter(b => !a.includes(b));
		if (g.length) out.lines.push(`New ${r} badges: ${g.join(', ')}`);
		if (l.length) out.anomalies.push(`${r} badges LOST: ${l.join(', ')}`);
	}
	// party
	const pp = new Map(P.party.filter(Boolean).map(m => [m.species + '|' + m.name, m]));
	const lv = A.party.filter(Boolean).map(m => { const o = pp.get(m.species + '|' + m.name); return o ? (o.level !== m.level ? `${m.name} ${o.level}→${m.level}` : null) : `NEW ${m.name} ${m.level}`; }).filter(Boolean);
	if (lv.length) out.lines.push(`Party: ${lv.join(', ')}`);
	// bag / money / progress counters
	const items = Object.keys({ ...A.bag, ...P.bag }).map(k => [k, (A.bag[k] || 0) - (P.bag[k] || 0)]).filter(([, d]) => d);
	if (items.length) out.lines.push(`Bag: ${items.map(([k, d]) => `${k} ${d > 0 ? '+' : ''}${d}`).join(', ')}`);
	if (A.money !== P.money) out.lines.push(`Money: ${P.money} → ${A.money}`);
	const ctr = [['trainers beaten', 'defeated'], ['items picked up', 'collected']].map(([n, k]) => A[k] !== P[k] ? `${n} ${P[k]}→${A[k]}` : null).filter(Boolean);
	if (A.dex.caught !== P.dex.caught) ctr.push(`caught ${P.dex.caught}→${A.dex.caught}`);
	if (ctr.length) out.lines.push(ctr.join(' · '));
	// stuck / loop heuristics
	if (dPlay > 20 * 60 && A.pos.map === P.pos.map && A.pos.x === P.pos.x && A.pos.y === P.pos.y)
		out.anomalies.push(`Played ${fmtDur(dPlay)} but the saved position never moved from ${A.pos.map} (${A.pos.x},${A.pos.y}) — stuck?`);
	if (dRev > 400 && dPlay < 15 * 60) out.anomalies.push(`${dRev} saves in only ${fmtDur(Math.max(0, dPlay))} of play — a save loop?`);
	return out;
}

// ---------- run ----------
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const md = [`# Playtest digest — ${today}`, '', `_Read-only report from production D1 (tools/playtest-digest.mjs). Compared with the previous run's snapshot._`, ''];
const allAnomalies = [];
for (const user of ACCOUNTS) {
	const name = NAMES[user] ? `${NAMES[user]} (${user})` : user;
	md.push(`## ${name}`);
	let cur;
	try { cur = snapshot(user); } catch (e) { md.push(`Could not read: ${e.message.split('\n')[0]}`, ''); continue; }
	const file = path.join(STATE_DIR, user + '.json');
	const prev = J(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 'null');
	const d = diff(prev, cur);
	if (prev) md.push(`_Since ${when(prev.at)}_`);
	if (cur.presence) md.push(`Last seen ${when(cur.presence.lastSeen)} at ${cur.presence.map} (${cur.presence.x},${cur.presence.y}), ${cur.presence.status || ''}`);
	if (cur.ow) md.push(`Save updated ${when(cur.ow.updated)}`);
	if (cur.run) md.push(`Battlecards run data updated ${when(cur.run.updated)} (${Math.round(cur.run.bytes / 1024)} KB${prev && prev.run && prev.run.updated !== cur.run.updated ? ', changed since last check' : ''})`);
	md.push('', ...d.lines.map(l => '- ' + l));
	if (d.anomalies.length) { md.push('', '**Needs a look:**', ...d.anomalies.map(a => '- ⚠ ' + a)); allAnomalies.push(...d.anomalies.map(a => `${NAMES[user] || user}: ${a}`)); }
	md.push('');
	fs.writeFileSync(file, JSON.stringify(cur));
}
// the error beacon: anonymous, site-wide
{
	const days = [0, 1].map(n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10));
	md.push('## Error reports (site-wide, anonymous)');
	try {
		const rows = d1(`SELECT key, value FROM mp_store WHERE key IN (${days.map(d => q('err:' + d)).join(',')})`);
		const all = [];
		for (const r of rows) for (const e of Object.values(J(r.value, {}) || {})) if (e && e.msg) all.push({ ...e, day: r.key.slice(4) });
		all.sort((a, b) => (b.count || 0) - (a.count || 0));
		if (!all.length) md.push('- none');
		for (const e of all.slice(0, 15)) md.push(`- ×${e.count} [${e.day}] ${e.page || '?'} — ${String(e.msg).slice(0, 160)}${e.where ? ` (${String(e.where).slice(0, 80)})` : ''}`);
	} catch (e) { md.push('Could not read: ' + e.message.split('\n')[0]); }
	md.push('');
}
if (allAnomalies.length) md.splice(4, 0, '**Needs a look:**', ...allAnomalies.map(a => '- ⚠ ' + a), '');
const outFile = path.join(OUT_DIR, `${today}.md`);
fs.writeFileSync(outFile, md.join('\n'));
console.log(md.join('\n'));
console.log('\nwrote ' + outFile);
