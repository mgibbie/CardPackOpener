// dm_post_test.mjs — direct messages from the inbox bell actually send.
//
// site/topbar.js sent a DM by posting into the FRIEND's u: room — the runner's
// live-chat room, where friends are read-only spectators — so every DM was
// refused with "spectators are read-only" (found 2026-10-01 while messaging the
// playtesters). DMs now have their own inbox room, dm:<name>: a friend or the
// owner may post; the recipient reads all of it, anyone else only their own side.
// The u: spectator rule is unchanged. Boots the REAL dev server.
//   1. a friend's DM lands in the recipient's room, and the recipient reads it
//   2. a non-friend can't post into someone's room
//   3. the owner can message any player (the playtesters) without befriending them
//   4. your own room still works; the topbar still sends to the friend's room
//
//   node overworld/tests/dm_post_test.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const PORT = 9199;
const BASE = `http://localhost:${PORT}`;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = (action, body = {}, token) => fetch(BASE + '/api/mp', {
	method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
	body: JSON.stringify({ action, ...body }),
}).then(r => r.json());
async function tokenFor(username, password) {
	let r = await api('register', { username, password });
	if (!r.token) r = await api('login', { username, password });
	if (!r.token) throw new Error(username + ' auth failed: ' + JSON.stringify(r));
	return r.token;
}

const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dmpost-')), 'users.sqlite');
const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile } });
try {
	let up = false;
	for (let i = 0; i < 100 && !up; i++) { up = await fetch(BASE + '/').then(r => r.ok).catch(() => false); if (!up) await sleep(200); }
	A(up, 'dev server is up');
	const owner = await tokenFor('mgibbie', 'localdev1');
	const amy = await tokenFor('dmamy', 'localdev1');
	const ben = await tokenFor('dmben', 'localdev1');
	const cat = await tokenFor('dmcat', 'localdev1');
	const added = await api('add-friend', { username: 'dmben' }, amy);
	A(added.added === 'dmben', 'setup: amy and ben are friends', JSON.stringify(added));

	const dan = await tokenFor('dmdan', 'localdev1');
	await api('add-friend', { username: 'dmben' }, dan);
	// 1
	const sent = await api('chat-post', { room: 'dm:dmben', text: 'hey ben, rematch?' }, amy);
	A(sent.ok === true, "a friend can DM: amy posts into ben's DM inbox", JSON.stringify(sent));
	await api('chat-post', { room: 'dm:dmben', text: 'from dan, private' }, dan);
	const benInbox = (await api('chat-get', { room: 'dm:dmben' }, ben)).messages || [];
	A(benInbox.some(m => m.from === 'dmamy' && m.text === 'hey ben, rematch?') && benInbox.some(m => m.from === 'dmdan'), 'ben reads every DM sent to him', JSON.stringify(benInbox));
	const amySide = (await api('chat-get', { room: 'dm:dmben' }, amy)).messages || [];
	A(amySide.length >= 1 && amySide.every(m => m.from === 'dmamy'), "amy reading ben's inbox sees ONLY her own messages (not dan's)", JSON.stringify(amySide));
	const reply = await api('chat-post', { room: 'dm:dmamy', text: 'sure!' }, ben);
	A(reply.ok === true && ((await api('chat-get', { room: 'dm:dmamy' }, amy)).messages || []).some(m => m.from === 'dmben'), "ben replies into amy's inbox (friendship is mutual)");
	// 2
	const stranger = await api('chat-post', { room: 'dm:dmben', text: 'spam' }, cat);
	A(stranger.error && !stranger.ok, 'a non-friend cannot DM ben', JSON.stringify(stranger));
	A(!!(await api('chat-get', { room: 'dm:dmben' }, cat)).error, "...nor read ben's inbox");
	// the runner's live-chat room keeps its rule: friends (spectators) are read-only there
	A(!!(await api('chat-post', { room: 'u:dmben', text: 'heckle' }, amy)).error, "a friend still cannot post into ben's live-run chat room (u:) — spectators stay read-only");
	// 3
	const fromOwner = await api('chat-post', { room: 'dm:dmcat', text: 'Please pause playtesting for now.' }, owner);
	A(fromOwner.ok === true && ((await api('chat-get', { room: 'dm:dmcat' }, cat)).messages || []).some(m => m.from === 'mgibbie'), 'the owner can message any player without befriending them', JSON.stringify(fromOwner));
	// 4
	A((await api('chat-post', { room: 'u:dmcat', text: 'run chat' }, cat)).ok === true, 'a runner still posts in their own live-chat room');
	const tb = fs.readFileSync(path.join(ROOT, 'site/topbar.js'), 'utf8');
	A(/MP\.call\('chat-post', \{ room: 'dm:' \+ other, text \}\)/.test(tb) && /room: 'dm:' \+ me/.test(tb), 'the inbox sends to and reads from dm: rooms');
} catch (e) {
	A(false, 'harness crashed: ' + e.message);
} finally {
	server.kill();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
