// owsync_test.mjs — the overworld save must never travel backwards.
//
// Reported bug: progress made in one session vanished when a brand-new browser
// session loaded, repeatedly restoring the same stale snapshot (Route 1 x19/y32,
// Squirtle 10/20, Tackle 29/35).
//
// Root cause: hydrateOw() treated the server as authoritative with NO comparison
// of any kind — every key the server held overwrote the local value. Any local
// progress not yet acknowledged by the server was destroyed on the next load.
// Nothing surfaced, because MP.call does not throw on a non-2xx response, pushOw
// discarded the result, and the de-dupe marker advanced before the write landed:
// a failed save was indistinguishable from a successful one at every layer.
//
// Fix: an explicit monotonic revision (magepunk_ow_rev) carried inside the
// snapshot. Ordering never comes from position/HP/progress. Local wins when its
// revision is higher, a same-revision divergence preserves BOTH copies, and the
// server refuses a write whose revision is older than the one it holds.
//
//   node overworld/tests/owsync_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- source ----------
{
	const mn = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/const OW_REV_KEY = 'magepunk_ow_rev'/.test(mn), 'the client carries an explicit revision key');
	A(/refusing to rewrite local backward/.test(mn), 'hydration refuses to rewrite local backward');
	A(/_lastAckedBody = body/.test(mn) && !/_lastOwJson/.test(mn),
		'the de-dupe marker advances on ACK, not on send');
	A(/keepalive: true/.test(mn), 'the unload write uses keepalive');
	A(/function owGameWeight/.test(mn) && /local holds no game/.test(mn),
		'an empty local save can never beat a populated remote one');
	A(/const VOLATILE_KEYS = \[OW_REV_KEY, 'magepunk_playtime'\]/.test(mn),
		'a self-advancing counter is excluded from the divergence comparison');
	A(!/setOwRev\(localRev \+ 1\)/.test(mn),
		'the conflict path does not double-bump the revision');
	const rs0 = fs.readFileSync(path.join(ROOT, 'site/owreset.js'), 'utf8');
	A(/ow: \{\}, force: true/.test(rs0), 'the deliberate owner wipe still passes force');
	const sv = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
	A(/stale revision/.test(sv) && /incomingRev < storedRev/.test(sv), 'the server rejects an older revision');
	A(/!body\.force/.test(sv), 'an explicit import/restore can still force a replace');
	const rs = fs.readFileSync(path.join(ROOT, 'site/owreset.js'), 'utf8');
	A(/magepunk_ow_rev/.test(rs), 'a save reset clears the revision too');
}

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8979;
	const REV = 'magepunk_ow_rev';
	const STATE = { username: 'rollback', friendCode: 'ROLLBK', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const mkParty = (hp, pp) => [{
		speciesId: 'squirtle', name: 'SQUIRTLE', level: 5, gender: 'M', friend: 70, types: ['Water'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 20, atk: 11, def: 12, spa: 11, spd: 11, spe: 10 }, maxHP: 20, curHP: hp,
		exp: 135, moves: [{ id: 'tackle', name: 'Tackle', pp, maxPp: 35 }], sprite: 's7.png', num: 7,
	}];

	// ---- mock server: the real ow-save/ow-load semantics, incl. the revision guard ----
	const DB = new Map();
	const keysTouched = { save: new Set(), load: new Set() };
	let dropSaves = false, delaySaveMs = 0, rejected409 = 0;
	const revOf = b => Math.max(0, parseInt(b && b[REV], 10) || 0);
	const weigh = b => {
		let w = 0;
		const arr = k => { try { const v = JSON.parse((b && b[k]) || 'null'); return Array.isArray(v) ? v.length : 0; } catch (e) { return 0; } };
		if (arr('magepunk_party_v1') > 0) w++;
		if (arr('magepunk_box_v1') > 0) w++;
		if (b && b['magepunk_region']) w++;
		try { const x = JSON.parse((b && b['magepunk_badges_v1']) || 'null'); if (x && Object.keys(x).length) w++; } catch (e) {}
		return w;
	};
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let raw = ''; for await (const c of req) raw += c;
			let body = {}; try { body = JSON.parse(raw); } catch (e) {}
			const send = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
			const key = 'ow:' + STATE.username;
			if (body.action === 'ow-save') {
				if (delaySaveMs) await new Promise(r => setTimeout(r, delaySaveMs));
				if (dropSaves) return send({ error: 'simulated drop' }, 500);
				keysTouched.save.add(key);
				const cur = DB.get(key);
				if (!body.force && cur && cur.ow && revOf(body.ow) < revOf(cur.ow)) {
					rejected409++;
					return send({ error: 'stale revision', conflict: true, rev: revOf(cur.ow) }, 409);
				}
				// mirrors the backstop in server/mp.mjs
				if (!body.force && cur && cur.ow && weigh(cur.ow) > 0 && weigh(body.ow) === 0) {
					rejected409++;
					return send({ error: 'refusing to overwrite a populated save with an empty one', conflict: true, rev: revOf(cur.ow) }, 409);
				}
				DB.set(key, { ow: body.ow, updated_at: Date.now() });
				return send({ ok: true });
			}
			if (body.action === 'ow-load') { keysTouched.load.add(key); return send({ ow: DB.get(key) || null }); }
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
	const srvFp = () => {
		const rec = DB.get('ow:' + STATE.username);
		if (!rec) return null;
		const p = JSON.parse(rec.ow['magepunk_pos_v1'] || 'null');
		return { x: p && p.x, y: p && p.y, map: p && p.map, rev: revOf(rec.ow) };
	};

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		await page.setViewport({ width: 1100, height: 800 });
		await page.evaluateOnNewDocument((st, seedParty) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			// ?fresh=1 models a brand-new signed-in device: the login and NOTHING else.
			// Without this the harness would re-seed a party on every navigation and
			// could never express the case that actually broke.
			if (new URLSearchParams(location.search).has('fresh')) return;
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			if (!localStorage.getItem('magepunk_party_v1')) localStorage.setItem('magepunk_party_v1', JSON.stringify(seedParty));
		}, STATE, mkParty(10, 29));

		const boot = async () => {
			await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route1&synclog=1`, { waitUntil: 'domcontentloaded' });
			const t0 = Date.now();
			while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200);
			await sleep(1800);
		};
		const newSession = async () => { await page.evaluate(() => sessionStorage.clear()); await boot(); };
		const localFp = () => page.evaluate(() => {
			const p = JSON.parse(localStorage.getItem('magepunk_pos_v1') || 'null');
			const party = JSON.parse(localStorage.getItem('magepunk_party_v1') || 'null');
			const l = party && party[0];
			return { x: p && p.x, y: p && p.y, map: p && p.map, hp: l && l.curHP, pp: l && l.moves[0].pp, rev: parseInt(localStorage.getItem('magepunk_ow_rev'), 10) || 0 };
		});
		const setLocal = (x, y, hp, pp, map = 'Route1') => page.evaluate((x, y, hp, pp, map, party) => {
			localStorage.setItem('magepunk_pos_v1', JSON.stringify({ map, x, y, back: null }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		}, x, y, hp, pp, map, mkParty(hp, pp));
		const flush = () => page.evaluate(() => window.__ow.pushOwForTest());
		const lastDecision = () => page.evaluate(() => {
			const d = window.__ow.owSync.filter(r => r.event === 'hydrate.decision');
			return d.length ? d[d.length - 1] : null;
		});

		// ===== seed: the stale snapshot =====
		await boot();
		await setLocal(19, 32, 10, 29);
		await flush(); await sleep(400);
		A(srvFp() && srvFp().x === 19, 'seed: the server holds Route 1 x19/y32', JSON.stringify(srvFp()));
		const seedRev = srvFp().rev;
		A(seedRev >= 1, 'seed: the stored save carries a revision', String(seedRev));

		// ===== 7 + 3 + 5: x19/y32 -> x16/y32 with the write never acknowledged =====
		dropSaves = true;
		await setLocal(16, 32, 10, 29);
		const durable = await page.evaluate(() => window.__ow.pushOwForTest());
		A(durable === false, '5: an unacknowledged write is NOT reported durable');
		A(await page.evaluate(() => window.__ow.owDirtyForTest()) === true,
			'5: the client still considers that state unsaved');
		await newSession();
		const after7 = await localFp();
		A(after7.x === 16 && after7.y === 32, '7: a brand-new session keeps x16/y32 (the reported rollback)', JSON.stringify(after7));
		const d7 = await lastDecision();
		A(d7 && d7.winner === 'local' && /refusing to rewrite local backward/.test(d7.reason),
			'3: newer local beats stale remote, and says why', JSON.stringify(d7 && d7.reason));
		A(d7 && d7.rewroteLocal === false, '3: local was not rewritten backward');

		// ===== 1 + 8: Route 2 x10/y79 healed milestone survives a new session =====
		dropSaves = false;
		await setLocal(10, 79, 20, 35, 'Route2');
		await flush(); await sleep(400);
		await newSession();
		const after8 = await localFp();
		A(after8.map === 'Route2' && after8.x === 10 && after8.y === 79 && after8.hp === 20 && after8.pp === 35,
			'8: the healed Route 2 milestone survives a brand-new session exactly', JSON.stringify(after8));
		A(srvFp().x === 10 && srvFp().map === 'Route2', '1: the server holds that exact latest state', JSON.stringify(srvFp()));

		// ===== 4: newer remote + stale local — local must not win =====
		const ahead = await page.evaluate((party) => {
			const snap = window.__ow.owSnapshot();
			snap['magepunk_pos_v1'] = JSON.stringify({ map: 'Route2', x: 4, y: 9, back: null });
			snap['magepunk_party_v1'] = JSON.stringify(party);
			snap['magepunk_ow_rev'] = String((parseInt(snap['magepunk_ow_rev'], 10) || 0) + 50);
			return snap;
		}, mkParty(18, 30));
		await page.evaluate(async (snap) => {
			await fetch('/api/mp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'ow-save', ow: snap, force: true }) });
		}, ahead);
		await newSession();
		const after4 = await localFp();
		A(after4.x === 4 && after4.y === 9, '4: a genuinely newer remote is adopted', JSON.stringify(after4));
		const d4 = await lastDecision();
		A(d4 && (d4.winner === 'remote' || d4.winner === 'equal'), '4: and the decision names remote', JSON.stringify(d4 && d4.winner));

		// ===== 2: out-of-order / stale writes must never win at the server =====
		const before2 = srvFp().rev;
		const stale = await page.evaluate((party) => {
			const snap = window.__ow.owSnapshot();
			snap['magepunk_pos_v1'] = JSON.stringify({ map: 'Route1', x: 19, y: 32, back: null });
			snap['magepunk_party_v1'] = JSON.stringify(party);
			snap['magepunk_ow_rev'] = '1';   // an old client replaying its write
			return snap;
		}, mkParty(10, 29));
		const resp = await page.evaluate(async (snap) => {
			const r = await fetch('/api/mp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'ow-save', ow: snap }) });
			return { status: r.status, body: await r.json() };
		}, stale);
		A(resp.status === 409 && resp.body.conflict === true, '2: the server rejects the older revision', JSON.stringify(resp));
		A(srvFp().rev === before2 && srvFp().x === 4, '2: and the stored save is untouched', JSON.stringify(srvFp()));

		// ===== 6: save and load use the same account-scoped key =====
		A(keysTouched.save.size === 1 && keysTouched.load.size === 1
			&& [...keysTouched.save][0] === [...keysTouched.load][0],
			'6: save and load address the same key', [...keysTouched.save] + ' vs ' + [...keysTouched.load]);

		// ===== same-revision divergence preserves BOTH copies =====
		await newSession();
		const localRevNow = (await localFp()).rev;
		const diverged = await page.evaluate((rev, party) => {
			const snap = window.__ow.owSnapshot();
			snap['magepunk_pos_v1'] = JSON.stringify({ map: 'Route3', x: 7, y: 7, back: null });
			snap['magepunk_party_v1'] = JSON.stringify(party);
			snap['magepunk_ow_rev'] = String(rev);   // same revision, different game
			return snap;
		}, localRevNow, mkParty(12, 12));
		await page.evaluate(async (snap) => {
			await fetch('/api/mp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'ow-save', ow: snap, force: true }) });
		}, diverged);
		await newSession();
		const dC = await lastDecision();
		A(dC && dC.conflict === true && dC.winner === 'local', 'a same-revision divergence keeps local', JSON.stringify(dC && dC.reason));
		const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_ow_conflict') || 'null'));
		A(kept && kept.ow && JSON.parse(kept.ow['magepunk_pos_v1']).map === 'Route3',
			'9: and the losing copy is preserved, not discarded', kept ? kept.reason : 'nothing stashed');

		// ===== playtime-only drift at ONE revision is not a divergence =====
		// Reported twice in one morning on instinctloretest0918: the conflict message
		// and a magepunk_ow_conflict stash on a save whose position, party, story
		// flags, defeated flags, region, starter, rival, bag, money, dex, journal and
		// flypoints were ALL byte-identical. The only difference was magepunk_playtime
		// (44880 remote vs 44905 local) — a counter the game loop writes every ~5s
		// WITHOUT bumping the revision, so any abruptly-ended session leaves local
		// ahead of remote at an identical rev. The reconciliation then wrote rev +2
		// (2679 -> 2681) with only one push behind it.
		const pt = () => page.evaluate(() => parseInt(localStorage.getItem('magepunk_playtime'), 10) || 0);
		const putRemote = (mut) => page.evaluate(async (mutSrc) => {
			const snap = window.__ow.owSnapshot();
			(new Function('s', mutSrc))(snap);
			await fetch('/api/mp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'ow-save', ow: snap, force: true }) });
		}, mut);
		{
			await newSession();
			await page.evaluate(() => { localStorage.removeItem('magepunk_ow_conflict'); localStorage.setItem('magepunk_playtime', '44905'); });
			await flush(); await sleep(400);
			const before = await localFp();
			// remote is the same game, 25 seconds behind on the clock — the exact repro
			await putRemote("s['magepunk_playtime'] = '44880';");
			await newSession();
			const d = await lastDecision();
			A(d && d.winner === 'equal' && !d.conflict,
				'playtime-only drift at one revision is not a divergence', JSON.stringify(d && d.reason));
			A(await page.evaluate(() => localStorage.getItem('magepunk_ow_conflict')) === null,
				'and nothing is stashed as a conflict for it');
			const after = await localFp();
			A(after.rev === before.rev, 'and the revision does not jump (the reported +2)', `${before.rev} -> ${after.rev}`);
			A(after.x === before.x && after.y === before.y && after.hp === before.hp,
				'the save loads exactly where it was', JSON.stringify(after));
			A(await pt() >= 44905, 'the local clock is not rolled backward to the remote one', String(await pt()));
		}
		{
			// the other direction: a device returning to a save with MORE time on it
			// adopts the larger value, so the counter stays monotonic either way
			await putRemote("s['magepunk_playtime'] = '99999';");
			await newSession();
			A(await pt() >= 99999, 'a higher remote clock is adopted, so no time is lost', String(await pt()));
			A(await page.evaluate(() => localStorage.getItem('magepunk_ow_conflict')) === null,
				'and that is not a conflict either');
		}
		{
			// and the guarantee this must not have broken: REAL divergence at one
			// revision still surfaces and still preserves both copies
			await newSession();
			await page.evaluate(() => localStorage.removeItem('magepunk_ow_conflict'));
			await putRemote("s['magepunk_pos_v1'] = JSON.stringify({ map: 'Route4', x: 3, y: 3, back: null }); s['magepunk_playtime'] = '1';");
			await newSession();
			const d = await lastDecision();
			A(d && d.conflict === true, 'a genuine same-revision divergence still conflicts', JSON.stringify(d && d.reason));
			const k2 = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_ow_conflict') || 'null'));
			A(k2 && k2.ow && JSON.parse(k2.ow['magepunk_pos_v1']).map === 'Route4',
				'and the remote copy is still preserved', k2 ? k2.reason : 'nothing stashed');
		}

		// ===== THE FRESH-DEVICE CASE (regression from the first revision fix) =====
		// Both sides at revision 0 is not a rare tie — before revisions existed EVERY
		// save read as 0, so a signed-in fresh device hits it on its very first load
		// with an empty local save. Preferring local there handed the account a blank
		// game and pushed the blank up over the real one.
		DB.clear();
		await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
		await boot();                       // re-seeds token/region/story/party
		await setLocal(19, 32, 10, 29);
		await flush(); await sleep(400);
		await page.evaluate(() => { const r = localStorage.getItem('magepunk_ow_rev'); localStorage.removeItem('magepunk_ow_rev'); return r; });
		// the server now holds a real Route 1 game; strip its revision too, so BOTH
		// sides read 0 exactly as a pre-revision save pair does
		const real = DB.get('ow:' + STATE.username);
		delete real.ow[REV];
		DB.set('ow:' + STATE.username, real);
		A(!!real.ow['magepunk_party_v1'], 'fresh-device: the server holds the real save at revision 0');

		// wipe the device the way a brand-new browser looks, keeping only the login
		await page.evaluate(() => {
			const tok = localStorage.getItem('magepunk_mp_token_v1'), st = localStorage.getItem('magepunk_mp_state_v1');
			localStorage.clear(); sessionStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', st);
		});
		await page.goto(`http://localhost:${PORT}/overworld/index.html?synclog=1&fresh=1`, { waitUntil: 'domcontentloaded' });
		{ const t0 = Date.now(); while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200); }
		await sleep(2200);
		const fresh = await localFp();
		A(fresh.x === 19 && fresh.y === 32, 'fresh-device: the account\'s real save is adopted, not the empty one', JSON.stringify(fresh));
		// the decisive decision is followed by a reload, whose second pass correctly
		// reads "identical" — so look for it across the trace, not just at the end
		const dFresh = await page.evaluate(() => window.__ow.owSync.filter(r => r.event === 'hydrate.decision').find(r => /holds no game/.test(r.reason || '')) || null);
		A(dFresh && dFresh.winner === 'remote',
			'fresh-device: and the decision says the local side held no game', JSON.stringify(dFresh && dFresh.reason));
		A(srvFp() && srvFp().x === 19, 'fresh-device: the server save was NOT blanked', JSON.stringify(srvFp()));
		const party = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_party_v1') || 'null'));
		A(Array.isArray(party) && party.length === 1, 'fresh-device: the party came back too', JSON.stringify(party && party.length));

		// ===== server backstop: an empty blob may not replace a populated save =====
		const blank = await page.evaluate(() => ({ magepunk_ow_rev: '9999', magepunk_playtime: '12' }));
		const blankResp = await page.evaluate(async (snap) => {
			const r = await fetch('/api/mp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'ow-save', ow: snap }) });
			return { status: r.status, body: await r.json() };
		}, blank);
		A(blankResp.status === 409, 'the server refuses an empty save over a populated one, even at a higher revision', JSON.stringify(blankResp));
		A(srvFp().x === 19, 'and the real save is still there', JSON.stringify(srvFp()));
		const forced = await page.evaluate(async (snap) => {
			const r = await fetch('/api/mp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'ow-save', ow: snap, force: true }) });
			return r.status;
		}, blank);
		A(forced === 200, 'but a deliberate forced wipe (owreset) still works', String(forced));

		// ===== 9: a pre-revision save migrates without losing anything =====
		DB.clear();
		await page.evaluate(() => { localStorage.removeItem('magepunk_ow_rev'); sessionStorage.clear(); });
		const beforeMig = await page.evaluate(() => {
			const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o;
		});
		await boot();
		await flush(); await sleep(400);
		const afterMig = await page.evaluate(() => {
			const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o;
		});
		const lost = Object.keys(beforeMig).filter(k => k !== 'magepunk_ow_rev' && afterMig[k] === undefined);
		A(lost.length === 0, '9: migrating a pre-revision save loses no keys', 'lost: ' + lost.join(','));
		A((parseInt(afterMig['magepunk_ow_rev'], 10) || 0) >= 1, '9: and it gains a revision', afterMig['magepunk_ow_rev']);
	} catch (e) {
		A(false, 'harness crashed: ' + e.message, e.stack);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
