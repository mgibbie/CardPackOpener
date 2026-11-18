// account_writes_test.mjs — every write a request makes to its own account row is guarded (server/mp.mjs guardAccount,
// mergeAccount). Owner, 2026-11-18: "Yes, guard them all" (account-row writes could overwrite each other: a gold payout
// landing at the same instant as a dust craft could undo one). The REAL server over sqlite, with one player's requests
// sent at the same instant (Promise.all: their reads and writes interleave, as two tabs' or two games' requests do).
//   1. mergeAccount on hand-made rows: counters add both changes (never below 0); a part only one side changed keeps
//      it; a part both changed takes this request's; a key one side removed is removed
//   2. three fights won at the same instant: all three pay (before: two were lost)
//   3. a fight's gold and a Pocket dust craft at the same instant: the dust spent stays spent and the gold stands
//      (before: the gold's write put the dust back)
//   4. a fight's gold and a deck saved at the same instant: both stand
//   5. one request alone writes exactly as before
//   node overworld/tests/account_writes_test.mjs (needs esbuild, so it lives in the overworld gate)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import * as C from '../../pocketenhanced/js/collection.js';
import { PRINTS } from '../../pocketenhanced/js/data/packs.js';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 600) : '')); } };

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-acct-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const mod = await import(pathToFileURL(bundle).href), handler = mod.default, mergeAccount = mod.mergeAccount;
let ipN = 0;
const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.6.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB })).json();
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));

// ===== 1. the merge =====
A(typeof mergeAccount === 'function', '(mergeAccount is exported for testing)');
if (typeof mergeAccount === 'function') {
	const base = { gold: 100, dust: 50, collection: { a: 1, b: 2 }, stats: { wins: 3 }, decks: ['x'], name: 'ann', tradeHeld: { t1: { packs: 1 } }, note: 1 };
	const mine = { gold: 200, dust: 50, collection: { a: 2, b: 2 }, stats: { wins: 4 }, decks: ['x', 'y'], name: 'ann', tradeHeld: { t1: { packs: 1 } }, note: 1 };
	const theirs = { gold: 130, dust: 10, collection: { a: 1, b: 3 }, stats: { wins: 5 }, decks: ['z'], name: 'ann', note: 1, pkCraft: { d1: { cost: 40 } } };
	const m = mergeAccount(base, mine, theirs);
	A(m.gold === 230 && m.dust === 10 && m.collection.a === 2 && m.collection.b === 3 && m.stats.wins === 6, 'counters add both changes (gold 100 -> +100 and +30 = 230; a card here, another there); dust only they changed keeps theirs', m);
	A(JSON.stringify(m.decks) === '["x","y"]' && !('tradeHeld' in m) && m.pkCraft && m.pkCraft.d1.cost === 40 && m.name === 'ann', "a part both changed takes this request's (the deck list); a note they removed is removed; a note they added is kept", m);
	A(mergeAccount({ packs: 1 }, { packs: 0 }, { packs: 0 }).packs === 0, 'two spends of the last pack at once never leave a negative count');
}

// ===== 2-5. on the real server =====
const tok = (await call('register', { username: 'ann', password: 'acct-pass-1' })).token;
await call('state', {}, tok);
const gold = () => row('ann').gold || 0;
// ---- 5. alone
const g0 = gold(); await call('gold-earn', { kind: 'fight', result: 'win' }, tok);
A(gold() === g0 + 100, 'one request alone: a won fight pays 100, as before', [g0, gold()]);
// ---- 2. three at once
const g1 = gold();
const rs = await Promise.all([1, 2, 3].map(() => call('gold-earn', { kind: 'fight', result: 'win' }, tok)));
A(rs.every(r => r.gold === 100) && gold() === g1 + 300, `three fights won at the same instant: all three pay (${g1} -> ${gold()})`, rs.map(r => r.error || r.gold));
A(rs.some(r => r.state && r.state.gold === g1 + 300), "and the last request's answer shows the gold as stored");
// ---- 3. gold and a dust craft at once
{
	const u = row('ann'); u.dust = 2000; setRow('ann', u);
	setRow('pkcol:ann', { rev: 1, col: C.newCollection(), at: 1, ids: [] });
	const D4 = PRINTS.find(p => p[2] === '4D')[0], g2 = gold();
	const [a, b] = await Promise.all([call('gold-earn', { kind: 'fight', result: 'win' }, tok), call('pkdust-craft', { print: D4, id: 'race000001' }, tok)]);
	const after = row('ann');
	A(b.ok && after.dust === 2000 - C.craftCost(D4) && gold() === g2 + 100 && !after.pkCraft && (row('pkcol:ann').col.prints[D4] || 0) >= 1, `a fight's gold and a dust craft at the same instant: the dust spent stays spent (${after.dust}), the gold stands (+100), the printing is made`, { a: a.error || a.gold, b: b.error || b.dust, dust: after.dust, gold: [g2, gold()], note: after.pkCraft });
}
// ---- 4. gold and a deck saved at once (the Mage Starter's own cards, which every account owns)
{
	const g3 = gold(), starter = (row('ann').decks || []).find(d => d && d.classId === 'mage');
	const [a, b] = await Promise.all([call('gold-earn', { kind: 'fight', result: 'win' }, tok), call('save-deck', { name: 'Race deck', classId: 'mage', deck: starter ? starter.cards.slice() : [] }, tok)]);
	A(!!starter && !b.error && gold() === g3 + 100 && (row('ann').decks || []).some(d => d && d.name === 'Race deck'), "a fight's gold and a deck saved at the same instant: the gold stands (+100) and so does the deck", { a: a.error || a.gold, b: b.error || 'ok', gold: [g3, gold()] });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
