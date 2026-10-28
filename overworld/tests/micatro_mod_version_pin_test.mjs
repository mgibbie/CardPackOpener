// micatro_mod_version_pin_test.mjs — Micatro mod version pins + key aliases, end to end.
// Saved runs and replays are recipes that re-simulate from their actions, so each records which VERSION
// of every mod (and of the engine's rules) it was played on (micatro/js/mods/pins.js), and old keys a
// mod upgrade renamed / removed stay loadable (micatro/js/mods/aliases.js).
//   0. server: micatro-replay-put keeps the meta's modVersions / engineRev / pinAssumed (allow-listed,
//      size-capped, malformed entries dropped) and refuses a recipe whose pins are malformed
//   1. recorded: a new Pokermon run's save carries {pokermon: '3.9.1+r47'} + engineRev; its finished replay
//      does too — locally (micatro_replays_v1) and uploaded (micatro-replay-put, the code + the meta)
//   2. resume after a mod upgrade (recorded on Pokermon 3.2.1, now 3.9.1 rev 47): the prompt names the
//      mod and both versions; "Continue anyway" resumes re-pinned (old pins kept, a backup kept, no second
//      prompt); "Abandon run" (pressed twice) clears it with a backup; Back keeps the save untouched
//   3. a legacy save (no pins) resumes as today, without a prompt, and records the assumption
//   4. a replay with a mismatch shows the warning banner up front and still plays to the end; a legacy
//      replay shows none
//   5. a forced desync (a rejected move) on a mismatched replay stops there with a message — never hangs
//   6. aliases: a saved run naming a renamed back resumes on the new one; a win sticker stored under a renamed
//      key shows on the new card; a removed key is listed greyed out as a retired card (the Record tab, the
//      deck editor) without errors
// Covers micatro/js/mods/pins.js, micatro/js/mods/aliases.js, micatro/js/mods/registry.js (keyKnown,
// resolveCardKey, isRetiredKey), micatro/js/engine/session.js (stampRecipe, fromRecipe repin / stoppedAt,
// backupSaved), micatro/js/engine/run.js (newRun key aliases), micatro/js/engine/customdeck.js (validateDeck
// aliases), micatro/js/replays.js (buildMeta pins), micatro/js/ui/main.js (continueRun prompt),
// micatro/js/ui/replayview.js (pin banner, desync notice), micatro/js/ui/screens.js (resumePrompt, retired
// cards), micatro/js/ui/stickers.js (aliased stickers), micatro/js/ui/deckeditor.js (retired cards),
// micatro/mods/pokermon/index.js (contentRev), micatro/css/micatro.css, server/mp.mjs (cleanReplayMeta pins).
//   node overworld/tests/micatro_mod_version_pin_test.mjs
//   MICATRO_SHOTS=<dir>  save screenshots of the prompt + the banner there
//   MICATRO_ROOT=<dir>   run against another checkout's code (the before/after check)
//   MICATRO_MAIN=<dir>   where the gitignored mod art is served from (read-only; default: the main checkout)
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MICATRO_ROOT ? path.resolve(process.env.MICATRO_ROOT) : path.resolve(HERE, '../../');
// the gitignored mod art: this checkout's, else the main checkout's (served read-only)
const MAIN = process.env.MICATRO_MAIN || path.resolve(HERE, '../../../..');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8754;
const SHOTS = process.env.MICATRO_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const STATE = { username: 'pinner', friendCode: 'MICPN0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }
const J = (x) => JSON.parse(JSON.stringify(x));

// ---- recipes made by the engine in node (only modules that exist before pins: the before/after check runs this on main)
globalThis.localStorage = { getItem() { return null; }, setItem() { }, removeItem() { } };
const { playRun } = await import(pathToFileURL(path.join(ROOT, 'micatro/tests/replay_bot.mjs')).href);
const RPm = await import(pathToFileURL(path.join(ROOT, 'micatro/js/replays.js')).href);
await import(pathToFileURL(path.join(ROOT, 'micatro/mods/pokermon/index.js')).href);
const strip = (r) => { const o = J(r); delete o.modVersions; delete o.engineRev; delete o.pinAssumed; return o; };
const poke = playRun({ seed: 'PINPOKE', back: 'b_red', stake: 1, mods: ['pokermon'] }, { seed: 7, maxSteps: 260, weak: true });
const van = playRun({ seed: 'PINVAN', back: 'b_blue', stake: 1 }, { seed: 2, maxSteps: 260, weak: true });
if (!poke.session.over || !van.session.over) throw new Error('the fixture runs must end');
const OLD = { pokermon: '3.2.1' };                    // recorded on Pokermon 3.2.1 before contentRev 1 (the 2026-10-18/19 house rules)
const CUR = '3.9.1+r47';                              // Pokermon 3.9.1, the Gen 7 starters (r46 the owner's Lake trio, Cresselia, Manaphy and Phione, r45 the creation trio, Regigigas and Arceus, r44 the last Gen 4 regulars, r43 the Gible line, r42 the Stunky line, r41 the Burmy three-pile cloak ruling, r40 the Shellos line, r39 the Cherubi line, r38 the Combee line, r37 the Burmy line, r36 the Drifloon line, r35 the Glameow line, r34 the Chatot + Pachirisu, r33 the Gen 3 Legendaries, r32 the Starly line, r31 the Regi trio, r30 the types from their card art, r29 the Lunatone + Solrock, r28 the Barboach line, r27 the Castform, r26 the Spoink line, r25 the Trapinch line, r24 the Gulpin line, r23 the Sprigatito rework, r22 the Type Sleeves, r21 the Whismur line, r20 the Sprigatito line, r19 the 25 new jokers, r18 the Hazard follow-ups, r17 the leftovers batch, r16 the seals fix)
const part = (run, n) => ({ ...strip(run.recipe), actions: run.recipe.actions.slice(0, n) });
const savedOld = { ...part(poke, 5), modVersions: OLD, engineRev: 1 };            // a save on the old Pokermon rules
const savedLegacy = part(van, 5);                                                 // a save from before pins
const savedAlias = { ...part(van, 5), back: 'b_legacy_blue', modVersions: {}, engineRev: 1 };   // its back key was renamed since
const pokeOld = { ...strip(poke.recipe), modVersions: OLD, engineRev: 1 };
const pokeBroken = { ...pokeOld, actions: [...pokeOld.actions.slice(0, 5), { type: 'buy', id: 999999 }, ...pokeOld.actions.slice(5)] };
const pokeMeta = RPm.buildMeta(poke.recipe, poke.finalView, { username: 'bob' });
const vanMeta = RPm.buildMeta(van.recipe, van.finalView, { username: 'bob' });
const SERVER = {
	aaaa0001: { code: await RPm.packRecipe(pokeOld), meta: { ...pokeMeta, modVersions: OLD }, by: 'bob', when: Date.now() },
	aaaa0002: { code: await RPm.packRecipe(pokeBroken), meta: { ...pokeMeta, modVersions: OLD }, by: 'bob', when: Date.now() },
	bbbb0001: { code: await RPm.packRecipe(strip(van.recipe)), meta: { ...vanMeta, modVersions: undefined, engineRev: undefined }, by: 'bob', when: Date.now() },
};
// account data that names card keys (aliases): a win sticker under a renamed key + one under a removed key
const EXTRA_ALIASES = { pintest: { renamed: { b_legacy_blue: 'b_blue', j_legacy_joker: 'j_joker' }, removed: ['j_retired_clown'], names: { j_retired_clown: 'Old Clown' } } };
const WINS = { j_legacy_joker: { win: 3 }, j_retired_clown: { win: 2 } };

// ===== 0. the server keeps (and validates) the pins =====
{
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
	const MP_DB = { prepare(sql) { const stmt = sqlite.prepare(sql); const bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return stmt.get(...bound) ?? null; }, async run() { return stmt.run(...bound); }, async all() { return { results: stmt.all(...bound) }; } }; return api; } };
	const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
	const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-modpin-')), 'mp.bundle.mjs');
	buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
	const { default: handler } = await import(pathToFileURL(bundle).href);
	let ipN = 0;
	const raw = async (action, body = {}, token) => {
		const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
		const res = await handler(req, { MP_DB });
		return { status: res.status, body: await res.json() };
	};
	const tok = (await raw('register', { username: 'pinsrv', password: 'micatro-pass-1' })).body.token;
	const recipe = { ...strip(poke.recipe), modVersions: { pokermon: CUR }, engineRev: 1 };
	const meta = { ...pokeMeta, modVersions: { pokermon: CUR, bunco: '5.1', reverie: '1.0 (old-API)', 'bad id!': '1', nacho: '<script>', pokermonplus: 'x'.repeat(41), betmma: 7 }, engineRev: 1, pinAssumed: 'legacy:2026-10-19' };
	const p1 = await raw('micatro-replay-put', { code: await RPm.packRecipe(recipe), meta }, tok);
	const m = p1.body.id && row('mreplay:' + p1.body.id) && row('mreplay:' + p1.body.id).meta;
	A(p1.status === 200 && m && m.modVersions && m.modVersions.pokermon === CUR && m.modVersions.bunco === '5.1' && m.modVersions.reverie === '1.0 (old-API)', 'server: the replay meta keeps the mod versions', JSON.stringify(m && m.modVersions));
	A(m && m.modVersions && !('bad id!' in m.modVersions) && !('nacho' in m.modVersions) && !('pokermonplus' in m.modVersions) && !('betmma' in m.modVersions), 'server: malformed pins (bad id, markup, over 40 chars, not a string) are dropped', JSON.stringify(m && m.modVersions));
	A(m && m.engineRev === 1 && m.pinAssumed === 'legacy:2026-10-19', 'server: engineRev + pinAssumed are kept', JSON.stringify(m && { e: m.engineRev, a: m.pinAssumed }));
	const many = {}; for (let i = 0; i < 40; i++) many['mod' + i] = '1.0';
	const p2 = await raw('micatro-replay-put', { code: await RPm.packRecipe(recipe), meta: { ...meta, modVersions: many, pinAssumed: '<b>x</b>', engineRev: 'nope' } }, tok);
	const m2 = row('mreplay:' + p2.body.id).meta;
	A(Object.keys(m2.modVersions || {}).length === 32 && !('pinAssumed' in m2) && m2.engineRev === 0, 'server: at most 32 pins; a bad pinAssumed / engineRev is dropped / zeroed', JSON.stringify({ n: Object.keys(m2.modVersions || {}).length, a: m2.pinAssumed, e: m2.engineRev }));
	const bad1 = await raw('micatro-replay-put', { code: await RPm.packRecipe({ ...recipe, modVersions: { pokermon: { evil: 1 } } }), meta }, tok);
	const bad2 = await raw('micatro-replay-put', { code: await RPm.packRecipe({ ...recipe, modVersions: ['3.2.1'] }), meta }, tok);
	const bad3 = await raw('micatro-replay-put', { code: await RPm.packRecipe({ ...recipe, engineRev: -1 }), meta }, tok);
	A(bad1.status === 400 && bad2.status === 400 && bad3.status === 400, 'server: a recipe with malformed pins is refused (400)', JSON.stringify([bad1.status, bad2.status, bad3.status]));
	const legacy = await raw('micatro-replay-put', { code: await RPm.packRecipe(strip(poke.recipe)), meta: { ...pokeMeta, modVersions: undefined, engineRev: undefined } }, tok);
	A(legacy.status === 200, 'server: a recipe without pins (an older client) is still accepted');
}

// ---- the page server: static files (+ the main checkout's mod art) and an /api/mp stub
const seen = { put: [] };
let putN = 0;
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let rawb = ''; for await (const c of req) rawb += c;
		let body = {}; try { body = JSON.parse(rawb); } catch { }
		let out = { ok: true, state: STATE };
		const a = body.action;
		if (a === 'micatro-replay-put') {
			seen.put.push(body);
			const id = body.id && SERVER[body.id] ? body.id : 'abcd' + String(++putN).padStart(4, '0');
			SERVER[id] = { code: body.code, meta: body.meta, by: 'pinner', when: Date.now() };
			out = { ok: true, id };
		} else if (a === 'micatro-replay-get') {
			const r = SERVER[body.id];
			out = r ? { code: r.code, meta: r.meta, by: r.by, when: r.when } : { error: 'not found' };
			res.writeHead(r ? 200 : 404, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return;
		} else if (a === 'run-score') out = { ok: true, rank: 2 };
		else if (a === 'publish-micatro') out = { ok: true, watchers: 0, watcherNames: [] };
		else if (a === 'micatro-stickers-get') out = { wins: {} };
		else if (a === 'micatro-stickers-put') out = { wins: body.wins || {} };
		else if (a === 'micatro-progress-get') out = { progress: null };
		else if (a === 'chat-get') out = { messages: [] };
		res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const send = (d) => { res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
	const nf = () => { res.writeHead(404); res.end('nf'); };
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (!e) return send(d);
		if (!f.startsWith('/micatro/mods/') || path.resolve(MAIN) === ROOT || f.includes('..')) return nf();
		fs.readFile(path.join(MAIN, f), (e2, d2) => (e2 ? nf() : send(d2)));
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	/** A fresh browser context. `store`: localStorage to seed once (before the first boot). */
	const newCtx = async ({ signedIn = false, store = {}, aliases = null } = {}) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|404/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.evaluateOnNewDocument((st, signedIn, store, aliases) => {
			if (aliases) window.__micatroExtraAliases = aliases;
			try {
				if (!sessionStorage.getItem('pin_init')) {
					sessionStorage.setItem('pin_init', '1');
					localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
					for (const [k, v] of Object.entries(store)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
				}
				if (signedIn) { localStorage.setItem('magepunk_mp_token_v1', 'pin-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
				else { localStorage.removeItem('magepunk_mp_token_v1'); localStorage.removeItem('magepunk_mp_state_v1'); }
			} catch { }
		}, STATE, signedIn, store, aliases);
		const go = async (url) => {
			await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
			await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		};
		return { ctx, page, errors, go };
	};
	const idle = (page) => waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000);
	const shot = async (page, name) => { if (SHOTS) { await sleep(800); await page.screenshot({ path: path.join(SHOTS, name) }); } };
	const LS = (page, k) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), k);
	/** Click if it is there (a missing element is an assertion failure elsewhere, never a crash). */
	const tryClick = async (page, sel) => { const e = await page.$(sel); if (!e) return false; await e.click(); return true; };
	const clickContinue = async (page) => {
		await waitFor(() => page.evaluate(() => !!document.querySelector('.b-continue')), 10000);
		return tryClick(page, '.b-continue');
	};
	const promptShown = (page, ms = 15000) => waitFor(() => page.evaluate(() => !!document.querySelector('.resume-modal .b-resume-abandon')), ms);
	const resumed = (page, ms = 20000) => waitFor(() => page.evaluate(() => !!(window.__micatro.session && !document.querySelector('.menu-modal') && !document.querySelector('.resume-modal'))), ms);

	// ================================================================ 1. versions recorded (save + replay)
	{
		const { ctx, page, errors, go } = await newCtx({ signedIn: true });
		await go('/micatro/');
		await page.evaluate(() => window.__micatro.newRun({ seed: 'PINREC1', mods: ['pokermon'] }));
		await waitFor(() => page.evaluate(() => !!localStorage.getItem('micatro_run_v1')), 20000);
		await idle(page);
		const sv = await LS(page, 'micatro_run_v1');
		A(sv && sv.modVersions && sv.modVersions.pokermon === CUR && sv.engineRev === 1, 'a new Pokermon run\'s save records {pokermon: "3.9.1+r47"} + the engine rev', JSON.stringify(sv && { mv: sv.modVersions, e: sv.engineRev }));
		// play it to a game over: its replay is kept locally + uploaded
		await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
		await idle(page);
		for (let i = 0; i < 8; i++) {
			const v = await page.evaluate(() => window.__micatro.view());
			if (v.over || v.state !== 'SELECTING_HAND') break;
			await page.evaluate((id) => window.__micatro.act({ type: 'highlight', ids: [id] }), v.areas.hand[0].id);
			await idle(page);
			await page.evaluate(() => window.__micatro.act({ type: 'play' }));
			await idle(page);
		}
		await waitFor(() => seen.put.length > 0, 15000);
		const put = seen.put[0];
		const rec = put ? await RPm.unpackRecipe(put.code) : null;
		A(put && put.meta && put.meta.modVersions && put.meta.modVersions.pokermon === CUR && put.meta.engineRev === 1, 'the uploaded replay\'s meta carries the versions', JSON.stringify(put && put.meta && { mv: put.meta.modVersions, e: put.meta.engineRev }));
		A(rec && rec.modVersions && rec.modVersions.pokermon === CUR && rec.engineRev === 1, 'the uploaded replay\'s recipe carries the versions', JSON.stringify(rec && rec.modVersions));
		const local = await LS(page, 'micatro_replays_v1');
		A(local && local[0] && local[0].recipe.modVersions && local[0].recipe.modVersions.pokermon === CUR && local[0].meta.modVersions.pokermon === CUR, 'the local replay (recipe + meta) carries the versions', JSON.stringify(local && local[0] && local[0].meta.modVersions));
		A(!errors.length, 'no page errors (recording)', errors.join(' | '));
		await ctx.close();
	}

	// ================================================================ 2. resume with a bumped contentRev
	{
		// 2a. Continue anyway
		const { ctx, page, errors, go } = await newCtx({ store: { micatro_run_v1: savedOld } });
		await go('/micatro/');
		await clickContinue(page);
		const shown = await promptShown(page);
		A(shown, 'resuming a run recorded on older Pokermon rules shows a prompt (not a silent resume)');
		const txt = shown ? await page.evaluate(() => document.querySelector('.resume-modal').textContent) : '';
		A(/Pokermon/.test(txt) && /3\.2\.1\s*→\s*3\.9\.1 \(rev 47\)/.test(txt) && /may play differently/.test(txt), 'the prompt names the mod and both versions, and says the run may play differently', txt.slice(0, 300));
		A(shown && await page.evaluate(() => !!document.querySelector('.resume-modal .b-resume-continue')), 'it offers "Continue anyway" and "Abandon run"');
		A(!(await page.evaluate(() => window.__micatro.session)), 'nothing resumes before the player chooses');
		if (shown) await shot(page, 'resume_prompt.png');
		if (shown) await tryClick(page, '.b-resume-continue');
		A(await resumed(page), 'Continue anyway resumes the run');
		await idle(page);
		const sr = await page.evaluate(() => window.__micatro.session && window.__micatro.session.recipe);
		A(sr && sr.actions.length === savedOld.actions.length && sr.modVersions && sr.modVersions.pokermon === CUR, 'it rebuilt every move and re-pinned the run to the current versions', JSON.stringify(sr && { n: sr.actions.length, mv: sr.modVersions }));
		A(sr && Array.isArray(sr.repinned) && sr.repinned[0].from.pokermon === '3.2.1' && sr.repinned[0].at === savedOld.actions.length, 'the old pins are kept in recipe.repinned', JSON.stringify(sr && sr.repinned));
		const sv = await LS(page, 'micatro_run_v1'), bk = await LS(page, 'micatro_run_backup_v1');
		A(sv && sv.modVersions.pokermon === CUR, 'the save is re-pinned at once', JSON.stringify(sv && sv.modVersions));
		A(bk && bk.recipe && bk.recipe.modVersions.pokermon === '3.2.1' && bk.recipe.actions.length === savedOld.actions.length, 'a backup of the original save is kept', JSON.stringify(bk && bk.reason));
		await go('/micatro/');
		await clickContinue(page);
		A(await resumed(page) && !(await page.evaluate(() => !!document.querySelector('.resume-modal'))), 'the next resume goes straight in (no second prompt)');
		A(!errors.length, 'no page errors (continue anyway)', errors.join(' | '));
		await ctx.close();
	}
	{
		// 2b. Back, then Abandon run
		const { ctx, page, errors, go } = await newCtx({ store: { micatro_run_v1: savedOld } });
		await go('/micatro/');
		await clickContinue(page);
		await promptShown(page);
		const back = await page.$('.resume-modal .b-back');
		if (back) await back.click();
		await sleep(300);
		const kept = await LS(page, 'micatro_run_v1');
		A(back && kept && kept.modVersions.pokermon === '3.2.1' && !(await page.evaluate(() => window.__micatro.session)), 'Back closes the prompt and keeps the save untouched');
		await clickContinue(page);
		A(await promptShown(page), 'the prompt comes back on the next Continue');
		await tryClick(page, '.b-resume-abandon');
		await sleep(200);
		A(await LS(page, 'micatro_run_v1') && /Really/.test(await page.evaluate(() => (document.querySelector('.b-resume-abandon') || {}).textContent || '')), 'Abandon run asks once more before clearing');
		await tryClick(page, '.b-resume-abandon');
		await sleep(400);
		const bk = await LS(page, 'micatro_run_backup_v1');
		A(!(await LS(page, 'micatro_run_v1')) && bk && bk.recipe && bk.recipe.seed === savedOld.seed, 'Abandon run clears the save, keeping a backup', JSON.stringify(bk && bk.reason));
		A(await page.evaluate(() => !!document.querySelector('.menu-modal') && !document.querySelector('.b-continue')), 'back at the main menu, with no Continue');
		A(!errors.length, 'no page errors (abandon)', errors.join(' | '));
		await ctx.close();
	}

	// ================================================================ 3. a legacy save (no pins)
	{
		const { ctx, page, errors, go } = await newCtx({ store: { micatro_run_v1: savedLegacy } });
		await go('/micatro/');
		await clickContinue(page);
		A(await resumed(page) && !(await page.evaluate(() => !!document.querySelector('.resume-modal'))), 'a legacy save (no versions) resumes as today, without a prompt');
		const sr = await page.evaluate(() => window.__micatro.session && window.__micatro.session.recipe);
		A(sr && sr.actions.length === savedLegacy.actions.length && sr.pinAssumed === 'legacy:2026-10-19' && sr.engineRev === 1, 'every move is rebuilt and the legacy assumption is recorded', JSON.stringify(sr && { n: sr.actions.length, a: sr.pinAssumed }));
		A(!errors.length, 'no page errors (legacy save)', errors.join(' | '));
		await ctx.close();
	}

	// ================================================================ 4-5. replays: the banner, legacy, a desync
	{
		const { ctx, page, errors, go } = await newCtx();
		const R = () => page.evaluate(() => { const r = window.__micatro.replay; return r && r.ready ? { index: r.index, total: r.total, ended: r.ended, playing: r.playing, notice: r.notice, warn: r.pinWarning, diff: r.pinDiff } : null; });
		await go('/micatro/?replay=aaaa0001');
		await waitFor(() => page.evaluate(() => !!(window.__micatro.replay && window.__micatro.replay.ready)), 30000);
		const bn = await page.evaluate(() => { const e = document.querySelector('.banner .mod-pin-warn'); return e ? e.textContent : ''; });
		A(/Recorded with Pokermon 3\.2\.1; current 3\.9\.1 \(rev 47\)\. Playback may differ\./.test(bn), 'a replay recorded on other versions shows the warning banner up front', bn);
		if (bn) await shot(page, 'replay_banner.png');
		A(await waitFor(async () => { const r = await R(); return r && r.ended; }, 120000), 'it still plays (to the end)');
		const r1 = await R();
		A(r1 && r1.index === r1.total && !/stopped/.test(r1.notice || ''), 'it reached the last move', JSON.stringify(r1 && { i: r1.index, t: r1.total, n: r1.notice }));
		A(await page.evaluate(() => !!document.querySelector('.banner .mod-pin-warn')), 'the banner stays while it plays');
		// legacy replay: no banner
		await go('/micatro/?replay=bbbb0001');
		await waitFor(() => page.evaluate(() => !!(window.__micatro.replay && window.__micatro.replay.ready)), 30000);
		const r2 = await R();
		A(r2 && !(await page.evaluate(() => !!document.querySelector('.banner .mod-pin-warn'))) && Array.isArray(r2.diff) && r2.diff.length === 0, 'a legacy replay (no versions) plays as today — no banner', JSON.stringify(r2 && r2.diff));
		// a forced desync
		await go('/micatro/?replay=aaaa0002');
		await waitFor(() => page.evaluate(() => !!(window.__micatro.replay && window.__micatro.replay.ready)), 30000);
		A(await waitFor(async () => { const r = await R(); return r && r.ended; }, 60000), 'a desynced replay ends (it does not hang)');
		const r3 = await R();
		A(r3 && r3.index === 5 && !r3.playing && /Playback stopped at move 6 of \d+/.test(r3.notice) && /Pokermon 3\.2\.1 → 3\.9\.1 \(rev 47\)/.test(r3.notice), 'it stops at the rejected move with a message naming the version change', JSON.stringify(r3 && { i: r3.index, n: r3.notice }));
		await tryClick(page, '.rb-play'); await sleep(600);
		const r4 = await R();
		A(r4 && r4.index === 5 && !r4.playing, 'pressing play again stays stopped (no loop, no hang)', JSON.stringify(r4 && { i: r4.index, p: r4.playing }));
		if (r3) await shot(page, 'replay_desync.png');
		A(!errors.length, 'no page errors (replays)', errors.join(' | '));
		await ctx.close();
	}

	// ================================================================ 6. aliases: renamed + removed keys
	{
		const { ctx, page, errors, go } = await newCtx({ aliases: EXTRA_ALIASES, store: { micatro_run_v1: savedAlias, 'micatro_joker_wins_v1:guest': WINS } });
		await go('/micatro/');
		await clickContinue(page);
		A(await resumed(page), 'a saved run naming a renamed back resumes');
		const v = await page.evaluate(() => window.__micatro.view());
		const sr = await page.evaluate(() => window.__micatro.session.recipe);
		A(v.back === 'b_blue' && sr.actions.length === savedAlias.actions.length, 'it plays on the new key (b_legacy_blue -> b_blue), every move rebuilt', JSON.stringify({ back: v.back, n: sr.actions.length }));
		const st = await page.evaluate(async () => { const S = await import('/micatro/js/ui/stickers.js'); const i = S.winStickerInfo('j_joker', true); return { lv: S.winLevel('j_joker'), stake: i && i.stake, old: JSON.stringify(JSON.parse(localStorage.getItem('micatro_joker_wins_v1:guest')).j_legacy_joker) }; });
		A(st.lv === 3 && st.stake === 'Green' && st.old === '{"win":3}', 'a win sticker stored under the renamed key shows on the new card (stored record untouched)', JSON.stringify(st));
		// the removed key: listed greyed out in the Record tab
		await page.evaluate(async () => { const UI = await import('/micatro/js/ui/screens.js'); UI.achievementsScreen('rec'); });
		await waitFor(() => page.evaluate(() => !!document.querySelector('.retired-card')), 5000);
		const rc = await page.evaluate(() => { const e = document.querySelector('.retired-card'); return e ? { t: e.textContent, key: e.dataset.key, op: getComputedStyle(e).opacity } : null; });
		A(rc && /Old Clown/.test(rc.t) && /retired card/.test(rc.t) && /Red Stake/.test(rc.t) && rc.key === 'j_retired_clown' && +rc.op < 1, 'a sticker on a removed card is kept and listed greyed out as a "retired card"', JSON.stringify(rc));
		if (rc) await shot(page, 'retired_record.png');
		await page.evaluate(async () => { (await import('/micatro/js/ui/screens.js')).closeAll(); });
		// ... and in a custom deck (the deck editor)
		await page.evaluate(async () => {
			const DE = await import('/micatro/js/ui/deckeditor.js');
			DE.openEditor({ def: { name: 'Old deck', jokers: [{ key: 'j_legacy_joker', n: 1 }, { key: 'j_retired_clown', n: 1 }] } }, {}, () => { });
		});
		await waitFor(() => page.evaluate(() => !!document.querySelector('.b-cd-tab-items')), 5000);
		await tryClick(page, '.b-cd-tab-items');
		await waitFor(() => page.evaluate(() => !!document.querySelector('.cd-item')), 5000);
		const items = await page.evaluate(() => [...document.querySelectorAll('.cd-item')].map((e) => ({ k: e.dataset.item, t: e.textContent, retired: e.classList.contains('retired') })));
		A(items.some((i) => i.k === 'joker:j_joker' && !i.retired) && !items.some((i) => i.k === 'joker:j_legacy_joker'), 'a custom deck\'s renamed joker loads as the new card', JSON.stringify(items));
		A(items.some((i) => i.k === 'joker:j_retired_clown' && i.retired && /Old Clown/.test(i.t) && /retired card/.test(i.t)), 'a custom deck\'s removed joker is kept and shown as a retired card', JSON.stringify(items));
		A(!errors.length, 'no page errors (aliases)', errors.join(' | '));
		await ctx.close();
	}
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
