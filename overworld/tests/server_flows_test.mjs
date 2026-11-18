// server_flows_test.mjs — four server flows the state machine survey found could lose something (Plans/STATE_MACHINES.md,
// "Defects the survey found"). The REAL server (server/mp.mjs over an in-memory sqlite), with requests sent at the
// same instant (Promise.all: the handlers' reads and writes interleave, as two players' requests do).
//   1. a gift whose first answer was lost is not gone: the same claim key gets the same items again; any other is refused;
//      a gift sent while another is being claimed is kept
//   2. a save repair the player has not answered is not replaced without saying so
//   3. two players acting at the same instant in an async Pokémon match, and in a live match: neither action is lost and
//      the turn resolves
//   4. a replay session whose first upload died between the player's list and the session row is filled in on retry,
//      not made twice
//   5. the game's own half of a gift claim (overworld/ow_saves.js claimGifts): a note before asking, items applied once
//   node overworld/tests/server_flows_test.mjs (needs esbuild, so it lives in the overworld gate)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import { createMatch } from '../../battlecards/pvpbattle.js';

process.env.MP_GC_RATE = '0';
process.env.MP_ADMINS = 'owner1';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 600) : '')); } };

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
let dropAfterWrite = null;   // (a key: the request dies right after writing it)
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; },
	async run() { const r = st.run(...b); if (dropAfterWrite && /^(INSERT|UPDATE)/i.test(sql) && b[0] === dropAfterWrite) { dropAfterWrite = null; throw Object.assign(new Error('the request died'), { died: true }); } return r; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-flows-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const api = async (action, body = {}, token) => {
	try {
		const res = await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.5.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB });
		return { status: res.status, ...(await res.json()) };
	} catch (e) { if (e.died) return { died: true }; throw e; }
};
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
const reg = async n => (await api('register', { username: n, password: 'flows-pass-1' })).token;
const TO = await reg('owner1'), TA = await reg('ann'), TB = await reg('bob');

// ===== 1. gifts =====
{
	const g = await api('gift-send', { to: 'ann', title: 'Potions', items: { potion: 3 } }, TO);
	A(g.ok, '(the owner sends ann a gift)');
	const k1 = 'devicekey001';
	const first = await api('gift-claim', { id: g.gift.id, key: k1 }, TA);
	A(first.ok && first.gift.items.potion === 3 && row('gifts:ann')[0].claimed === true, 'ann claims it: the items come back and the gift is marked claimed');
	const again = await api('gift-claim', { id: g.gift.id, key: k1 }, TA);
	A(again.ok && again.again === true && again.gift.items.potion === 3, "her first answer was lost: asking again with the same key gives the same items (before: 'already claimed', and the gift was gone)", again);
	const other = await api('gift-claim', { id: g.gift.id, key: 'otherdevice1' }, TA), none = await api('gift-claim', { id: g.gift.id }, TA);
	A(other.status === 409 && none.status === 409, 'any other key (another device), or none, is refused: it cannot be claimed twice');
	// a send at the same instant as a claim
	const g2 = await api('gift-send', { to: 'ann', title: 'Balls', items: { pokeball: 2 } }, TO);
	const [c2, s3] = await Promise.all([api('gift-claim', { id: g2.gift.id, key: 'devicekey002' }, TA), api('gift-send', { to: 'ann', title: 'Candy', items: { rare_candy: 1 } }, TO)]);
	const list = row('gifts:ann');
	A(c2.ok && s3.ok && list.length === 3 && list.find(x => x.id === g2.gift.id).claimed && list.find(x => x.id === s3.gift.id && !x.claimed), 'a gift sent while another is being claimed: both writes land (the claim, and the new gift)', list.map(x => [x.title, x.claimed]));
}

// ===== 2. repairs =====
{
	const doc = (n) => ({ magic: 'magepunk-ow-save', baseRev: 1, keys: { magepunk_money: String(n) } });
	const r1 = await api('repair-send', { to: 'ann', title: 'First repair', doc: doc(100) }, TO);
	const r2 = await api('repair-send', { to: 'ann', title: 'Second repair', doc: doc(200) }, TO);
	A(r1.ok && r2.status === 409 && /First repair/.test(r2.error) && row('repair:ann').title === 'First repair', 'a second repair while the first is still pending is refused, naming it (before: the first vanished silently)', r2);
	const r3 = await api('repair-send', { to: 'ann', title: 'Second repair', doc: doc(200), replace: true }, TO);
	A(r3.ok && row('repair:ann').title === 'Second repair', 'with replace: true it takes its place');
	await api('repair-done', { id: r3.id, ok: true }, TA);
	const r4 = await api('repair-send', { to: 'ann', title: 'Third repair', doc: doc(300) }, TO);
	A(r4.ok && row('repair:ann').title === 'Third repair', 'once she has answered, a new one goes straight in');
}

// ===== 3. two players at the same instant =====
{
	const mon = (name, hp) => ({ speciesId: name.toLowerCase(), name, level: 20, types: ['Normal'], sprite: 's1.png', weightkg: 10, stats: { hp, atk: 60, def: 40, spa: 40, spd: 40, spe: 50 }, maxHP: hp, curHP: hp, status: null,
		moves: [{ id: 'tackle', name: 'Tackle', pp: 30, maxPp: 30, power: 40, type: 'Normal', category: 'Physical', acc: 100 }] });
	const party = t => [mon(t + '1', 200), mon(t + '2', 200)];
	setRow('amatch:race0001', { id: 'race0001', players: ['ann', 'bob'], game: 'pokemon', decks: [party('A'), party('B')], status: 'active', snap: null, pk: createMatch('race0001', 'ann', party('A'), 'bob', party('B')), turn: null, turnNumber: 0, winner: null, lines: [], createdAt: 1, updatedAt: 1 });
	setRow('amlist:ann', ['race0001']); setRow('amlist:bob', ['race0001']);
	let lost = 0, rounds = 0;
	for (let t = 0; t < 4; t++) {
		const before = row('amatch:race0001').pk.turn;
		const [a, b] = await Promise.all([api('async-act', { id: 'race0001', act: { kind: 'move', moveIdx: 0 } }, TA), api('async-act', { id: 'race0001', act: { kind: 'move', moveIdx: 0 } }, TB)]);
		const after = row('amatch:race0001').pk;
		rounds++; if (!(a.ok && b.ok && after.turn === before + 1)) lost++;
		if (after.over) break;
	}
	A(lost === 0 && rounds >= 2, `an async Pokémon match: both players act at the same instant, ${rounds} turns running; every turn resolves (before: one action was lost and the turn waited for ever)`, { lost, rounds, pk: row('amatch:race0001').pk.actions });
	setRow('match:live0001', { ...createMatch('live0001', 'ann', party('A'), 'bob', party('B')), lastActive: 1 });
	let lostL = 0, roundsL = 0;
	for (let t = 0; t < 4; t++) {
		const before = row('match:live0001').turn;
		const [a, b] = await Promise.all([api('match-action', { id: 'live0001', act: { kind: 'move', moveIdx: 0 } }, TA), api('match-action', { id: 'live0001', act: { kind: 'move', moveIdx: 0 } }, TB)]);
		const after = row('match:live0001');
		roundsL++; if (!(a.match && b.match && after.turn === before + 1)) lostL++;
		if (after.over) break;
	}
	A(lostL === 0 && roundsL >= 2, `a live match: the same, ${roundsL} turns; every turn resolves`, { lostL, roundsL, actions: row('match:live0001').actions });
	const old = row('match:live0001'); delete old.rev; setRow('match:live0001', old);
	const one = await api('match-action', { id: 'live0001', act: { kind: 'move', moveIdx: 0 } }, TA);
	A(!!one.match, 'a match row from before (no rev) is still played');
}

// ===== 4. a replay session that died half way =====
{
	const zlib = await import('zlib');
	const pack = obj => 'G1.' + zlib.gzipSync(Buffer.from(JSON.stringify(obj))).toString('base64url');
	const seg0 = { v: 2, h: { v: 2, sid: 'abcd0001', seg: 0, players: [{ name: 'ann', dex: 25, k: 'me' }] }, f: [[0, 1, 2], [5, 1, 2]], ev: [] };
	const meta = { mode: 'normal', time: 10, level: 2, kills: 1, dex: 25, mon: 'Pikachu' };
	dropAfterWrite = 'msurvreplays:ann';   // (dies right after the player's list is written, before the session row)
	const d = await api('micasurvivor-replay-put', { v: 2, rid: 'abcd0001', sid: 'abcd0001', seg: 0, code: pack(seg0), meta, last: false }, TA);
	const listed = (row('msurvreplays:ann') || { ids: [] }).ids.filter(e => e.rid === 'abcd0001');
	A(d.died && listed.length === 1, '(the first upload dies after the list names the session, before the session row)', { d, listed });
	const sessions0 = sqlite.prepare("SELECT key FROM mp_store WHERE key LIKE 'msurvsess:%'").all().length;
	const listA = await api('micasurvivor-replay-list', {}, TA);
	A(sessions0 === 0 && listA.replays.length === 0, 'meanwhile her list of replays shows nothing broken (an entry with no session is skipped)');
	const r = await api('micasurvivor-replay-put', { v: 2, rid: 'abcd0001', sid: 'abcd0001', seg: 0, code: pack(seg0), meta, last: true }, TA);
	const sessions = sqlite.prepare("SELECT key FROM mp_store WHERE key LIKE 'msurvsess:%'").all().map(x => x.key), ids = row('msurvreplays:ann').ids.filter(e => e.rid === 'abcd0001');
	A(r.ok && r.id === listed[0].id && sessions.length === 1 && sessions[0] === 'msurvsess:' + r.id && ids.length === 1, 'the retry fills in the session the list names: one session, one entry, the same id (before: a second session, and the first was an orphan)', { r, sessions, ids });
}

// ===== 5. the game's half of a gift claim =====
{
	const src = fs.readFileSync(path.join(ROOT, 'overworld/ow_saves.js'), 'utf8'), at = src.indexOf('export async function claimGifts'), fn = src.slice(at, src.indexOf('\n}\n', at));
	const noteAt = fn.indexOf('safeSave(GIFT_CLAIMS_KEY, notes)'), askAt = fn.indexOf("MP.call('gift-claim'"), addAt = fn.indexOf('Bag.addItem'), clearAt = fn.lastIndexOf('delete notes[g.id]');
	const between = fn.slice(addAt, clearAt);
	A(noteAt > 0 && noteAt < askAt && addAt > askAt && clearAt > addAt && !/await/.test(between), "the game notes its claim key BEFORE asking, and applies the items and clears the note together after (no await between them: a key's items are applied once)");
	const reset = fs.readFileSync(path.join(ROOT, 'site/owreset.js'), 'utf8');
	A(/magepunk_gift_claims_v1:/.test(reset) && /GIFT_CLAIMS_KEY = 'magepunk_gift_claims_v1'/.test(src), 'the note is a device key, kept through a new journey (site/owreset.js) and not synced');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
