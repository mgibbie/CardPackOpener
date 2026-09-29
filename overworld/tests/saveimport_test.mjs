// saveimport_test.mjs — importing a full save export WITHOUT the native file chooser.
//
// Automation needed to restore a full export (rev 16413) and could not: OPTIONS >
// IMPORT SAVE raised a DETACHED <input type=file>, which upload tooling cannot
// target. Now:
//   * window.__ow.importSave(json) runs the same pipeline as the chooser:
//     validate the WHOLE export -> size-check -> read the server revision ->
//     back up + apply with read-back (rollback on any failed write) -> stamp the
//     revision -> force-push -> read the server copy back
//   * a malformed / unsupported export fails with every problem listed, and
//     NOTHING changes: no local write, no backup, no push
//   * the result (ok, fileRev, appliedRev, readback) survives the reload, and
//     verifySave() re-checks local against the server afterwards
//   * a forced ow-save stashes the stored game in the server's UNDO slot first
//   * the chooser still works, and its input now sits in the DOM (#ow-save-file)
//
//   node overworld/tests/saveimport_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9158;
const REV = 'magepunk_ow_rev';
const STATE = { username: 'importer', friendCode: 'IMPRT0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const mon = (name, level) => ({
	speciesId: 'squirtle', name, level, gender: 'M', friend: 70, types: ['Water'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 20, atk: 11, def: 12, spa: 11, spd: 11, spe: 10 }, maxHP: 20, curHP: 20,
	exp: 135, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's7.png', num: 7,
});
const STORY = JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} });
// the game on this device (and on the server) before the import
const GAME_A = {
	magepunk_region: 'JOHTO', magepunk_party_v1: JSON.stringify([mon('OLDLEAD', 12)]), magepunk_story: STORY,
	magepunk_pos_v1: JSON.stringify({ map: 'NewBarkTown', x: 10, y: 10 }), magepunk_money: '300', [REV]: '100',
};
// the full export to restore: rev 16413
const exportB = (rev = 16413, extra = {}) => ({
	magic: 'magepunk-ow-save', version: 1, exported_at: '2026-09-27T12:00:00.000Z',
	keys: {
		magepunk_region: 'JOHTO', magepunk_party_v1: JSON.stringify([mon('RESTORED', 50)]), magepunk_story: STORY,
		magepunk_pos_v1: JSON.stringify({ map: 'NewBarkTown', x: 7, y: 8 }), magepunk_money: '4242',
		magepunk_badges_v1: JSON.stringify({ zephyr: true }), [REV]: String(rev), ...extra,
	},
});

// ---- mock server: the real ow-save / ow-load semantics (revision guard, force, UNDO) ----
const DB = new Map();
const calls = { save: 0, forced: 0 };
const revOf = b => Math.max(0, parseInt(b && b[REV], 10) || 0);
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let body = {}; try { body = JSON.parse(raw || '{}'); } catch (e) {}
		const send = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (body.action === 'ow-load') return send({ ow: DB.get('ow') || null });
		if (body.action === 'ow-save') {
			calls.save++; if (body.force) calls.forced++;
			const cur = DB.get('ow');
			if (!body.force && cur && revOf(body.ow) < revOf(cur.ow)) return send({ error: 'stale revision', conflict: true, rev: revOf(cur.ow) }, 409);
			if (body.force && cur && cur.ow) DB.set('undo', cur);
			DB.set('ow', { ow: body.ow, updated_at: Date.now() });
			return send({ ok: true });
		}
		return send({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null });
	}
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	// the source: a forced ow-save stashes the stored game into UNDO first
	const sv = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
	const os = sv.slice(sv.indexOf("action === 'ow-save'"), sv.indexOf("action === 'ow-load'"));
	A(/if \(body\.force\)/.test(os) && /':undo', cur\)/.test(os) && /nothing changed/.test(os),
		'server: a forced ow-save stashes the stored game in the UNDO slot first, and refuses if it cannot');

	DB.set('ow', { ow: { ...GAME_A }, updated_at: Date.now() });
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	page.on('dialog', d => d.accept());
	// seed ONCE (a later reload must see what the import wrote, not the seed)
	await page.evaluateOnNewDocument((st, game) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 'imp-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		for (const [k, v] of Object.entries(game)) localStorage.setItem(k, v);
	}, STATE, GAME_A);
	const boot = async () => {
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!(window.__ow && window.__ow.importSave && window.__ow.battle && window.__ow.battle.data)).catch(() => false))) await sleep(200);
	};
	await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' });
	await boot();
	A(await page.evaluate(() => typeof window.__ow.importSave === 'function' && typeof window.__ow.verifySave === 'function'), 'window.__ow.importSave / verifySave exist');
	const localState = () => page.evaluate(() => {
		const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^magepunk_/.test(k) && !/owsync_log|playtime/.test(k)) o[k] = localStorage.getItem(k); } return JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
	});

	// ===== 1. malformed / unsupported exports: an actionable error, and NO change =====
	const bad = {
		'not JSON': '{"magic": "magepunk-ow-save", "keys": {',
		'wrong magic': { magic: 'something-else', version: 1, keys: exportB().keys },
		'unsupported version': { ...exportB(), version: 2 },
		'party is not a list': exportB(16413, { magepunk_party_v1: '{"oops":1}' }),
		'a key is not valid JSON': exportB(16413, { magepunk_bag_v1: '{broken' }),
		'money is not a number': exportB(16413, { magepunk_money: 'lots' }),
		'a non-string value': exportB(16413, { magepunk_bag_v1: { pokeball: 5 } }),
		'an unknown key': exportB(16413, { evil_key: 'x' }),
		'no game in it': { magic: 'magepunk-ow-save', version: 1, keys: { magepunk_money: '5' } },
		'too large to sync': exportB(16413, { magepunk_journal_v1: JSON.stringify(['x'.repeat(1_000_000)]) }),
	};
	for (const [label, doc] of Object.entries(bad)) {
		const before = await localState();
		const savesBefore = calls.save;
		const serverBefore = JSON.stringify(DB.get('ow'));
		const r = await page.evaluate(d => window.__ow.importSave(d), doc);
		const after = await localState();
		A(r && r.ok === false && r.stage === 'validate' && typeof r.error === 'string' && r.error.length > 10,
			`[${label}] is refused at validation with an error`, JSON.stringify(r && { stage: r.stage, error: (r.error || '').slice(0, 140) }));
		A(before === after && !r.applied, `[${label}] ...and nothing on this device changed (no backup written either)`);
		A(calls.save === savesBefore && JSON.stringify(DB.get('ow')) === serverBefore, `[${label}] ...and nothing was pushed`);
	}
	const errs = await page.evaluate(d => window.__ow.importSave(d).then(r => r.errors), exportB(16413, { magepunk_money: 'lots', magepunk_bag_v1: '{broken' }));
	A(Array.isArray(errs) && errs.length === 2 && errs.some(e => /magepunk_money/.test(e)) && errs.some(e => /magepunk_bag_v1/.test(e)),
		'every problem is listed, by key (not just the first)', JSON.stringify(errs));

	// ===== 2. a storage failure mid-apply rolls the whole game back =====
	// (the running game pushes its own changes in the background, so "nothing was
	// pushed" means no FORCED write: only an import forces)
	{
		const forcedBefore = calls.forced;
		const before = await localState();
		const r = await page.evaluate(d => {
			const orig = Storage.prototype.setItem;
			Storage.prototype.setItem = function (k, v) { if (k === 'magepunk_badges_v1') throw new Error('QuotaExceededError'); return orig.call(this, k, v); };
			return window.__ow.importSave(d).finally(() => { Storage.prototype.setItem = orig; });
		}, exportB());
		const after = await localState();
		A(r.ok === false && r.stage === 'apply' && r.rolledBack === true, 'a write that does not stick fails the import at apply and rolls back', JSON.stringify(r));
		const strip = s => JSON.stringify(JSON.parse(s).filter(([k]) => k !== 'magepunk_ow_import_backup'));
		A(strip(before) === strip(after), '...the previous game is exactly back');
		A(calls.forced === forcedBefore, '...and nothing was pushed');
	}

	// ===== 3. a valid rev-16413 export: apply, push, read back =====
	const res = await page.evaluate(d => window.__ow.importSave(d), exportB());
	A(res.ok === true && res.stage === 'done', 'a valid full export imports end to end', JSON.stringify({ ok: res.ok, stage: res.stage, error: res.error }));
	A(res.fileRev === 16413 && res.appliedRev === 16413 && res.serverRevBefore >= 100 && res.serverRevBefore < 16413, 'it lands at the export\'s own revision (16413) over the older server copy', JSON.stringify({ fileRev: res.fileRev, appliedRev: res.appliedRev, serverRevBefore: res.serverRevBefore }));
	A(res.pushed && res.readback && res.readback.ok && res.readback.rev === 16413 && res.readback.bodyMatches, 'the server copy was read back: same body, rev 16413', JSON.stringify(res.readback));
	A(res.fp && res.fp.lead === 'RESTORED' && res.fp.lvl === 50, 'the result fingerprints the applied player state', JSON.stringify(res.fp));
	A(revOf(DB.get('ow').ow) === 16413 && JSON.parse(DB.get('ow').ow.magepunk_party_v1)[0].name === 'RESTORED', 'the server now holds the restored game');
	A(DB.get('undo') && JSON.parse(DB.get('undo').ow.magepunk_party_v1)[0].name === 'OLDLEAD', 'the server stashed the replaced game in its UNDO slot');
	// the page reloads so every module plays the imported game
	await sleep(1500); await boot();
	const post = await page.evaluate(async () => ({ last: window.__ow.lastImportResult(), verify: await window.__ow.verifySave(), lead: window.__ow.party[0] && window.__ow.party[0].name, money: localStorage.getItem('magepunk_money'), backup: !!localStorage.getItem('magepunk_ow_import_backup') }));
	A(post.last && post.last.ok && post.last.appliedRev === 16413, 'after the reload, lastImportResult() still reports the import', JSON.stringify(post.last && { ok: post.last.ok, appliedRev: post.last.appliedRev }));
	// the reloaded game writes its own defaults and pushes them, so the live
	// revision can only have moved UP from 16413; what matters is agreement
	A(post.verify.ok && post.verify.localRev >= 16413 && post.verify.remoteRev === post.verify.localRev && post.verify.bodiesEqual, 'verifySave(): this device and the server agree (rev >= 16413, same body)', JSON.stringify(post.verify));
	A(post.verify.remoteFp && post.verify.remoteFp.lead === 'RESTORED' && post.verify.remoteFp.lvl === 50 && DB.get('ow').ow.magepunk_money === '4242', '...and the server copy is the restored player (RESTORED Lv50, 4242 money)', JSON.stringify(post.verify.remoteFp));
	A(post.lead === 'RESTORED' && post.money === '4242', 'the running game is the imported one (party, money)', JSON.stringify({ lead: post.lead, money: post.money }));
	A(post.backup, 'the replaced game is kept on this device (magepunk_ow_import_backup)');

	// ===== 4. rollback: the replaced game comes back through the same pipeline =====
	const rb = await page.evaluate(() => window.__ow.rollbackImport());
	A(rb.ok && rb.fp.lead === 'OLDLEAD' && rb.appliedRev === rb.serverRevBefore + 1 && rb.appliedRev > 16413, 'rollbackImport() restores the replaced game, above the import\'s revision', JSON.stringify({ ok: rb.ok, lead: rb.fp && rb.fp.lead, appliedRev: rb.appliedRev, serverRevBefore: rb.serverRevBefore, error: rb.error }));
	await sleep(1500); await boot();
	A(await page.evaluate(() => window.__ow.party[0] && window.__ow.party[0].name) === 'OLDLEAD' && JSON.parse(DB.get('ow').ow.magepunk_party_v1)[0].name === 'OLDLEAD', '...on this device and on the server');

	// ===== 5. the server is AHEAD of the export: the import steps past it =====
	DB.set('ow', { ow: { ...DB.get('ow').ow, [REV]: '20000' }, updated_at: Date.now() });
	const ahead = await page.evaluate(d => window.__ow.importSave(d), exportB());
	A(ahead.ok && ahead.fileRev === 16413 && ahead.serverRevBefore >= 20000 && ahead.appliedRev === ahead.serverRevBefore + 1 && ahead.readback.rev === ahead.appliedRev, 'over a newer server copy (20000+) the import steps one past it', JSON.stringify({ ok: ahead.ok, serverRevBefore: ahead.serverRevBefore, appliedRev: ahead.appliedRev, readback: ahead.readback }));
	await sleep(1500); await boot();

	// ===== 6. the chooser still works, through its in-DOM input =====
	const tmp = path.join(HERE, '_saveimport_upload.json');
	fs.writeFileSync(tmp, JSON.stringify(exportB(1, { magepunk_money: '777' })));
	try {
		await page.evaluate(() => { window.__ow.runSaveAction('import'); });
		const input = await page.waitForSelector('#ow-save-file', { timeout: 5000 }).catch(() => null);
		A(!!input, 'OPTIONS > IMPORT SAVE puts its file input in the DOM (#ow-save-file)');
		if (input) {
			await input.uploadFile(tmp);
			await sleep(2500); await boot();
			const ch = await page.evaluate(() => ({ money: localStorage.getItem('magepunk_money'), last: window.__ow.lastImportResult() }));
			A(ch.money === '777' && ch.last && ch.last.source === 'chooser' && ch.last.ok, 'the chooser flow imports through the same pipeline (confirm accepted)', JSON.stringify({ money: ch.money, src: ch.last && ch.last.source, ok: ch.last && ch.last.ok }));
			A(ch.last && ch.last.appliedRev === ch.last.serverRevBefore + 1 && ch.last.appliedRev > 20000, '...stepping past the server revision (a rev-1 file)', JSON.stringify(ch.last && { applied: ch.last.appliedRev, before: ch.last.serverRevBefore }));
		}
	} finally { try { fs.unlinkSync(tmp); } catch (e) {} }
	// ===== 7. the PERSISTENT input (#ow-save-import): upload only, read the DOM only =====
	// the caller that asked for it can't run page code, so nothing below calls a
	// hook: it uploads files and reads the page
	{
		const status = () => page.$eval('#ow-save-import-status', el => ({ status: el.dataset.status, res: el.textContent ? JSON.parse(el.textContent) : null })).catch(() => null);
		const inputInfo = await page.$eval('#ow-save-import', el => ({ type: el.type, inDoc: document.body.contains(el), display: getComputedStyle(el).display, accept: el.accept })).catch(() => null);
		A(inputInfo && inputInfo.type === 'file' && inputInfo.inDoc && inputInfo.display !== 'none', 'a persistent file input #ow-save-import is in the document from boot (hidden, not display:none)', JSON.stringify(inputInfo));
		const up = async (name, doc) => {
			const f = path.join(HERE, name);
			fs.writeFileSync(f, typeof doc === 'string' ? doc : JSON.stringify(doc));
			try { const el = await page.$('#ow-save-import'); await el.uploadFile(f); } finally { setTimeout(() => { try { fs.unlinkSync(f); } catch (e) {} }, 3000); }
		};
		// malformed: an actionable error in the DOM, and nothing changes
		const before = await localState();
		const forcedBefore = calls.forced;
		await up('_bad_upload.json', exportB(30000, { magepunk_party_v1: '{"oops":1}', magepunk_money: 'lots' }));
		let st = null;
		for (let i = 0; i < 30 && !(st && st.status === 'error'); i++) { await sleep(100); st = await status(); }
		A(st && st.status === 'error' && st.res.stage === 'validate' && /magepunk_party_v1/.test(st.res.error) && /magepunk_money/.test(st.res.error),
			'a malformed upload: data-status=error, and the status names every bad key', JSON.stringify(st));
		A(await localState() === before && calls.forced === forcedBefore, '...nothing on this device changed, and nothing was pushed');
		// valid: applied, pushed, read back, then the page reloads and still shows it
		await up('_good_upload.json', exportB(30000, { magepunk_money: '31337' }));
		let done = null;
		for (let i = 0; i < 60 && !(done && done.status === 'ok'); i++) { await sleep(150); done = await status(); }
		await sleep(1500); await boot();
		const after = await status();
		A(after && after.status === 'ok' && after.res.source === 'dom-input' && after.res.fileRev === 30000 && after.res.appliedRev === 30000,
			'a valid upload imports, and after the reload #ow-save-import-status still reports it (fileRev = appliedRev = 30000)', JSON.stringify(after && after.res && { ok: after.res.ok, source: after.res.source, fileRev: after.res.fileRev, appliedRev: after.res.appliedRev }));
		A(after && after.res.readback && after.res.readback.ok && after.res.readback.rev === 30000 && after.res.readback.bodyMatches, '...the server copy was read back at rev 30000, same body', JSON.stringify(after && after.res.readback));
		A(revOf(DB.get('ow').ow) >= 30000 && DB.get('ow').ow.magepunk_money === '31337', '...and the server holds the restored game');
		A(await page.evaluate(() => localStorage.getItem('magepunk_money')) === '31337', '...and so does this device');
	}
	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
