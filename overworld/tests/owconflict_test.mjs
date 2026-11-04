// owconflict_test.mjs — the conflict stash can never grow the cloud save.
//
// Playtest 2026-09-27 (instinctloretest0918): every push failed with 'ow too
// large'. magepunk_ow_conflict synced with the save, so each preserved remote
// copy already held the PREVIOUS stash: 12K -> 49K -> 90K -> 147K -> 235K -> 383K
// -> 652K chars, nested six deep, until the snapshot passed the server's
// 1,000,000-byte limit. The stash is now local-only and one save deep; a pre-fix
// nested stash is archived whole (local-only) before it is flattened; and a
// snapshot over the limit is not sent at all, with the heavy keys logged and the
// player told once.
//
//   node overworld/tests/owconflict_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const puppeteer = (await import('puppeteer-core')).default;
const http = await import('http');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8984;
const REV = 'magepunk_ow_rev', CONFLICT = 'magepunk_ow_conflict', ARCHIVE = 'magepunk_ow_conflict_archive';
const OW_MAX_BYTES = 1_000_000;   // server/mp.mjs
const STATE = { username: 'conflict', friendCode: 'CONFL0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = JSON.stringify([{
	speciesId: 'squirtle', name: 'SQUIRTLE', level: 5, gender: 'M', friend: 70, types: ['Water'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 20, atk: 11, def: 12, spa: 11, spd: 11, spe: 10 }, maxHP: 20, curHP: 20,
	exp: 135, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's7.png', num: 7,
}]);

// ---- mock server: real ow-save/ow-load semantics, incl. the size limit ----
const DB = new Map();
let saves = 0, tooLarge = 0;
const revOf = b => Math.max(0, parseInt(b && b[REV], 10) || 0);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let body = {}; try { body = JSON.parse(raw); } catch (e) {}
		const send = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		const key = 'ow:' + STATE.username;
		if (body.action === 'ow-save') {
			saves++;
			if (JSON.stringify(body.ow).length > OW_MAX_BYTES) { tooLarge++; return send({ error: 'ow too large' }, 413); }
			const cur = DB.get(key);
			if (!body.force && cur && cur.ow && revOf(body.ow) < revOf(cur.ow)) return send({ error: 'stale revision', conflict: true, rev: revOf(cur.ow) }, 409);
			DB.set(key, { ow: body.ow, updated_at: Date.now() });
			return send({ ok: true });
		}
		if (body.action === 'ow-load') return send({ ow: DB.get(key) || null });
		return send({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [] });
	}
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
		res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = () => DB.get('ow:' + STATE.username)?.ow || null;

// a save as the server would hold it, at a revision, optionally carrying a stash
const snapAt = (rev, x, extra = {}) => ({
	magepunk_region: 'KANTO', magepunk_party_v1: PARTY, [REV]: String(rev),
	magepunk_pos_v1: JSON.stringify({ map: 'Route1', x, y: 10, back: null }),
	magepunk_story: JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }),
	magepunk_journal_v1: JSON.stringify(Array.from({ length: 400 }, (_, i) => ({ t: i, text: 'walked a long way on route one ' + i }))),
	...extra,
});
// the reported shape: each stash's `ow` holds the previous stash, `depth` deep
const nested = (depth, rev) => {
	let rec = null;
	for (let d = 0; d < depth; d++) {
		const ow = snapAt(rev - depth + d, 30 + d, rec ? { [CONFLICT]: JSON.stringify(rec) } : {});
		rec = { at: new Date(Date.UTC(2026, 8, 27, d)).toISOString(), reason: 'same-revision divergence (remote copy preserved)', localRev: rev - depth + d, remoteRev: rev - depth + d, ow };
	}
	return rec;
};
const depthOf = raw => { let d = 0, r = raw ? JSON.parse(raw) : null; while (r && r.ow) { d++; r = r.ow[CONFLICT] ? JSON.parse(r.ow[CONFLICT]) : null; } return d; };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	await page.evaluateOnNewDocument((st) => {
		localStorage.setItem('magepunk_mp_token_v1', 'conflict-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
	}, STATE);
	const boot = async () => {
		await page.evaluate(() => sessionStorage.clear()).catch(() => {});
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route1&synclog=1`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200);
		await sleep(2500);
	};
	const seedLocal = snap => page.evaluate(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, snap);
	const local = () => page.evaluate((C, R) => ({ conflict: localStorage.getItem(C), archive: localStorage.getItem(R), rev: parseInt(localStorage.getItem('magepunk_ow_rev'), 10) || 0 }), CONFLICT, ARCHIVE);
	const log = ev => page.evaluate(ev => window.__ow.owSync.filter(r => r.event === ev), ev);

	// ===== 1. a pre-fix nested stash (six deep, as reported) is archived, then flattened =====
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route1`, { waitUntil: 'domcontentloaded' });
	const legacy = JSON.stringify(nested(6, 16391));
	DB.set('ow:' + STATE.username, { ow: snapAt(16391, 28, { [CONFLICT]: legacy }), updated_at: Date.now() });   // the remote carries it too
	await seedLocal(snapAt(16392, 16));
	await page.evaluate((C, v) => localStorage.setItem(C, v), CONFLICT, legacy);
	await boot();
	let L = await local();
	A(depthOf(legacy) === 6, 'setup: the stash nests six saves deep', String(depthOf(legacy)));
	A(L.archive === legacy, 'the nested stash is archived WHOLE before anything is dropped', `${L.archive && L.archive.length} vs ${legacy.length}`);
	A(depthOf(L.conflict) === 1, '...and the live stash is flattened to one save', String(depthOf(L.conflict)));
	A(JSON.parse(L.conflict).ow.magepunk_pos_v1 === JSON.parse(legacy).ow.magepunk_pos_v1, '...keeping its newest level', '');

	// the push that follows (local rev 16392 > remote 16391) now fits and is ACKED
	await page.evaluate(() => window.__ow.pushOwForTest());
	await sleep(500);
	const s1 = srv();
	A(s1 && revOf(s1) >= 16392 && JSON.parse(s1.magepunk_pos_v1).x === 16, 'the local game reaches the server (acked, not just a higher local rev)', s1 && `${revOf(s1)} ${s1.magepunk_pos_v1}`);
	A(s1 && s1[CONFLICT] == null && s1[ARCHIVE] == null, '...carrying no stash or archive: both are local-only', s1 && Object.keys(s1).join(','));
	A(tooLarge === 0, 'no push was refused as too large');

	// ===== 2. repeated same-revision divergences stay one save deep =====
	const sizes = [];
	for (let i = 0; i < 4; i++) {
		const r = (await local()).rev;
		// another device wrote the SAME revision with different content — and, as a
		// pre-fix client would, with its own stash riding inside
		DB.set('ow:' + STATE.username, { ow: snapAt(r, 40 + i, { [CONFLICT]: legacy }), updated_at: Date.now() });
		await boot();
		const d = (await log('hydrate.decision')).pop();
		L = await local();
		sizes.push(L.conflict ? L.conflict.length : 0);
		A(d && d.conflict === true && d.winner === 'local', `divergence ${i + 1}: kept local, preserved remote`, JSON.stringify(d && d.reason));
		A(depthOf(L.conflict) === 1 && JSON.parse(JSON.parse(L.conflict).ow.magepunk_pos_v1).x === 40 + i,
			`divergence ${i + 1}: the stash holds exactly that remote copy, one save deep`, String(depthOf(L.conflict)));
		await page.evaluate(() => window.__ow.pushOwForTest()); await sleep(400);
		A(revOf(srv()) > r, `divergence ${i + 1}: the revision moves strictly forward on the server (${r} -> ${revOf(srv())})`);
	}
	A(Math.max(...sizes) - Math.min(...sizes) < 2000, 'the stash does not grow across divergences', sizes.join(' '));
	A(JSON.stringify(srv()).length < 200_000, 'and the cloud save stays small', String(JSON.stringify(srv()).length));

	// ===== 3. a remote that differs ONLY by a legacy stash reads as the same game =====
	{
		const snap = await page.evaluate(() => window.__ow.owSnapshot());
		DB.set('ow:' + STATE.username, { ow: { ...snap, [CONFLICT]: legacy }, updated_at: Date.now() });
		await boot();
		const d = (await log('hydrate.decision')).pop();
		A(d && d.winner === 'equal' && !d.conflict, 'a remote differing only by a local-only key is "equal", not a new divergence', JSON.stringify(d && d.reason));
	}

	// ===== 4. over the server limit: nothing is sent, the heavy key is named, the player is told =====
	{
		const before = saves, revBefore = (await local()).rev;
		await page.evaluate(() => localStorage.setItem('magepunk_journal_v1', JSON.stringify(Array.from({ length: 30000 }, (_, i) => ({ t: i, text: 'x'.repeat(30) })))));
		const ok = await page.evaluate(() => window.__ow.pushOwForTest());
		await sleep(300);
		const ov = (await log('push.oversize')).pop();
		const hud = await page.evaluate(() => document.getElementById('hud')?.textContent || '');
		A(ok === false && saves === before, 'an oversize snapshot is not sent (no request, no "ow too large" loop)', `ok=${ok} sent=${saves - before}`);
		A(ov && ov.bytes > OW_MAX_BYTES * 0.99 && ov.heaviest[0][0] === 'magepunk_journal_v1', '...and the log names the heavy key and the size', JSON.stringify(ov && ov.heaviest.slice(0, 2)));
		A(/too large to sync/i.test(hud) && /EXPORT SAVE/.test(hud), '...and the player is told how to back up', hud);
		A((await local()).rev === revBefore, '...without burning a revision on a write that never left', `${revBefore} -> ${(await local()).rev}`);
		// back under the limit: the retry goes through and is acknowledged
		await page.evaluate(() => localStorage.setItem('magepunk_journal_v1', '[]'));
		const ok2 = await page.evaluate(() => window.__ow.pushOwForTest());
		await sleep(400);
		A(ok2 === true && srv().magepunk_journal_v1 === '[]', 'once it fits again, the next push is acknowledged and persisted', `ok=${ok2}`);
	}

	// ===== 5. reload: the server copy is what hydrates, and it matches =====
	await boot();
	const d5 = (await log('hydrate.decision')).pop();
	A(d5 && d5.winner === 'equal', 'a fresh session finds the server holding exactly this game', JSON.stringify(d5 && d5.reason));
	L = await local();
	A(L.archive === legacy, 'the archive survives reloads, still local', L.archive ? String(L.archive.length) : 'missing');
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
