// micatro_resume_win_badges_test.mjs — a RESUMED Pokermon run that is won still earns everything (bug: jfost711's
// Grass Monotype win, 2026-10-19, recorded nothing: no `poke` / `mono` stickers, no Nuzlocke / Monotype record, no
// `badges` in the replay meta). Every recipe carries a seed (the random one too), and rebuilding a run from it
// (Continue, after an iPhone reload) passed that seed to newRun, which marked the run SEEDED — so the win earned no
// stickers and run_badges said "not eligible" (the HUD hid the badges, the win wrote no record).
// Plays a real tester's run (micatro/tests/fixtures/pokermon_grass_monotype_win.json: a Yellow Deck Pokermon run,
// Nuzlocke broken by a sale, Monotype Grass intact) through the real page, signed in, against the REAL account
// handler (server/mp.mjs over in-memory sqlite) in headless Chrome:
//   1. the saved run, cut before the last boss blind, is resumed through the main menu's Continue button: the HUD
//      shows "Monotype: Grass" (and no Nuzlocke), so the run is eligible again
//   2. the rest of the run is played through the board's actions (window.__micatro.act = the UI's onAction) to the win:
//      the win screen lists "Monotype: Grass"; the stickers get win + poke + mono (never nuz / both) on every joker of
//      the win and on the deck (b_yellow), locally and on the account; the progress record gets mono.grass = 1 (the
//      first account push FAILS and is retried until it lands); the replay meta (local + server) has
//      badges {mono: 'grass'}; the leaderboard row carries the tag
//   3. Endless Mode, then a reload + Continue (the won run resumed): still eligible, and the win is NOT counted again
//   4. a run the player typed a seed for stays seeded after a resume (no badges, no stickers)
// The fixture was recorded on Pokermon 3.2.1 (no pins: read as 3.2.1+r1). Since the 3.9.1 data batch (Pokermon
// 3.9.1+r2) its moves no longer replay on the new numbers (the shops differ from move 523), so the page is served
// micatro/mods/pokermon/data391.js with its joker data and sprites emptied: Pokermon plays the 3.2.1 numbers (the
// renamed boss is the same boss), and the resume goes through the "Mod updated" prompt (3.2.1 -> 3.9.1, Continue anyway).
// Since batch 6 (3.9.1+r3) pokejokers_01-08 play their 3.9.1 behaviour too, so the page also gets those 8 files as of the
// batch-5 merge (git show aa4bfab2: their 3.2.1 behaviour; the fixture holds Kakuna, Butterfree, Parasect, Victreebel...).
// Since batch 7 (3.9.1+r4) pokejokers_09-17 do too, so the page gets those 9 files as of the batch-6 merge (git show
// e295b8b7: their 3.2.1 behaviour; the fixture holds Shroomish and Breloom).
// Since batch 8 (3.9.1+r5) pokejokers_18-34, zotherjokers and zmissingno do too, so the page gets those files as of the
// batch-7 merge (git show a7b29c1b: their 3.2.1 behaviour).
// Since batch 10 (3.9.1+r6: the Hazard layer, the Seed card in the pools) the page also gets index.js, enhancement1.js and
// mart2.js as of the batch-8 merge (git show 94347e16).
// Mod art missing from this checkout (a worktree) is served read-only from the main checkout two levels up
// (MICATRO_MAIN overrides). Covers micatro/js/engine/session.js (recipeSeeded), micatro/js/engine/run.js (newRun seeded),
// micatro/js/ui/main.js, micatro/js/ui/progress.js (push retry, once per run), micatro/js/net.js,
// micatro/mods/pokermon/systems/runbadges.js.
//   node overworld/tests/micatro_resume_win_badges_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'child_process';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const MAIN = process.env.MICATRO_MAIN || path.resolve(ROOT, '../..');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9563;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(150); } return false; }

const RECIPE = JSON.parse(fs.readFileSync(path.join(ROOT, 'micatro/tests/fixtures/pokermon_grass_monotype_win.json'), 'utf8'));
// the last boss blind's select_blind (the run's 24th): the save is cut just before it
const lastSelect = RECIPE.actions.map((a, i) => (a.type === 'select_blind' ? i : -1)).filter((i) => i >= 0).pop();
// the jokers of the win (the engine's win event: the row + their earlier evolutions) and the deck
const WIN_JOKERS = ['j_poke_pineco', 'j_poke_breloom', 'j_poke_shroomish', 'j_poke_parasect', 'j_poke_paras', 'j_poke_butterfree', 'j_poke_caterpie', 'j_poke_metapod', 'j_poke_victreebel', 'j_poke_bellsprout', 'j_poke_weepinbell'];

// ---------- the real handler over sqlite ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { return stmt.run(...bound); },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const rowsLike = (p) => sqlite.prepare('SELECT key, value FROM mp_store WHERE key LIKE ?').all(p).map((r) => ({ key: r.key, value: JSON.parse(r.value) }));
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-micatro-resumewin-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.11.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	return (await handler(req, { MP_DB })).json();
};
// a flaky network for the progress push: the next N micatro-progress-put calls fail (a 503), then it works again
let failProgressPuts = 0, progressPutsFailed = 0, progressPuts = 0;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.fs': 'text/plain' };
// (the fixture's rules: the 3.9.1 overlay without its joker numbers / sprites — see the header)
const D391 = (await import(pathToFileURL(path.join(ROOT, 'micatro/mods/pokermon/data391.js')).href)).default;
const DATA321 = 'export default ' + JSON.stringify({ ...D391, jokers: {}, sprites: {} }) + ';\n';
// ... and pokejokers_01-08 before their 3.9.1 reworks (batch 6), from the batch-5 merge commit
const PRE_B6 = 'aa4bfab21f5724e699bfcea17185216b1793019d';
const JOKERS321 = {};
for (let i = 1; i <= 8; i++) {
	const p = `micatro/mods/pokermon/jokers/pokejokers_0${i}.js`;
	JOKERS321['/' + p] = execFileSync('git', ['show', `${PRE_B6}:${p}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });
}
// ... and pokejokers_09-17 before theirs (batch 7), from the batch-6 merge commit
const PRE_B7 = 'e295b8b7c7aa3fb38b3d65658a54bf92cb125ac8';
for (let i = 9; i <= 17; i++) {
	const p = `micatro/mods/pokermon/jokers/pokejokers_${String(i).padStart(2, '0')}.js`;
	JOKERS321['/' + p] = execFileSync('git', ['show', `${PRE_B7}:${p}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });
}
// ... and pokejokers_18-34 / zotherjokers / zmissingno before theirs (batch 8), from the batch-7 merge commit
const PRE_B8 = 'a7b29c1b5e42b619085d6d5494e7e5bcd15dd2bf';
for (const n of ['18', '19', '20', '21', '22', '23', '24', '25', '26', '28', '30', '31', '32', '33', '34'].map((i) => 'pokejokers_' + i).concat(['zotherjokers', 'zmissingno'])) {
	const p = `micatro/mods/pokermon/jokers/${n}.js`;
	JOKERS321['/' + p] = execFileSync('git', ['show', `${PRE_B8}:${p}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });
}
// ... and the content batch 10 changed (the Hazard layer / Seed card / Flower X2; new Items and the Seed card in the pools: the
// Enhanced and Item rolls differ) as of the batch-8 merge (3.9.1+r5): its index.js (no Miracle Seed / Heavy-Duty Boots / Seed card
// / Debris deck registered), the 3.2.1 Hazard / Flower enhancements, and Up-Grade without the Seed option
const PRE_B10 = '94347e16fd6a5de788d0c51c8860b8f534ca10e3';
for (const p of ['micatro/mods/pokermon/index.js', 'micatro/mods/pokermon/enhancements/enhancement1.js', 'micatro/mods/pokermon/consumables/mart2.js']) {
	JOKERS321['/' + p] = execFileSync('git', ['show', `${PRE_B10}:${p}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });
}
// That old index.js wires the CURRENT systems/runbadges.js by hook name, so it gets the hooks added since: the Monotype check
// moved from new_round to the round's first deal (draw_from_deck_to_hand: RB.round_begin, owner rule 2026-10-21), and the
// shop warning re-checks on a joker reorder.
{
	const k = '/micatro/mods/pokermon/index.js', a = '  new_round: RB.new_round,';
	if (!JOKERS321[k].includes(a)) throw new Error('the pre-batch-10 index.js no longer wires RB.new_round');
	JOKERS321[k] = JOKERS321[k].replace(a, a + ' draw_from_deck_to_hand: RB.round_begin, reordered: RB.reordered,');
}
// ... and the Pocket Packs before their 3.9.1 contents rework (the leftovers batch, 3.9.1+r16: the pack's Item roll differs)
const PRE_LEFTOVERS = 'd3827c0ce7a1c2feef41d6cb8c992ccfaf5ebaaa';
JOKERS321['/micatro/mods/pokermon/boosters/packs1.js'] = execFileSync('git', ['show', `${PRE_LEFTOVERS}:micatro/mods/pokermon/boosters/packs1.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });
let prompted = 0;
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let action = ''; try { action = JSON.parse(raw).action; } catch { }
		if (action === 'micatro-progress-put') {
			progressPuts++;
			if (failProgressPuts > 0) { failProgressPuts--; progressPutsFailed++; res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unavailable' })); return; }
		}
		const ip = '10.12.0.' + (req.socket.remotePort % 250 + 1);
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); }
		catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	if (f === '/micatro/mods/pokermon/data391.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(DATA321); return; }
	if (JOKERS321[f]) { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(JOKERS321[f]); return; }
	const send = (d) => { res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
	const nf = () => { res.writeHead(404); res.end('nf'); };
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (!e) return send(d);
		if (!f.startsWith('/micatro/mods/') || path.resolve(MAIN) === ROOT || f.includes('..')) return nf();
		fs.readFile(path.join(MAIN, f), (e2, d2) => (e2 ? nf() : send(d2)));
	});
});
await new Promise(r => server.listen(PORT, r));

const USER = 'resumewin';
const token = (await call('register', { username: USER, password: 'resume-win-e2e-pass' })).token;
A(!!token, 'a real account registered');
const state = (await call('state', {}, token)).state;

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport({ width: 390, height: 664, deviceScaleFactor: 1, isMobile: true, hasTouch: true }); // (an iPhone-sized portrait page)
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	await page.goto(`http://localhost:${PORT}/micatro/nothing.txt`);
	await page.evaluate((tok, st, saved) => {
		localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
		localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('micatro_run_v1', JSON.stringify(saved)); // (the run in progress, as the page saved it)
	}, token, state, { ...RECIPE, actions: RECIPE.actions.slice(0, lastSelect) });
	const boot = async () => {
		await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
		return waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready) && !!document.querySelector('.b-continue')), 40000);
	};
	const idle = () => waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000);
	/** The main menu's Continue (+ "Continue anyway" if the versions changed since the recording). */
	const continueRun = async () => {
		await page.evaluate(() => document.querySelector('.b-continue').click());
		await waitFor(() => page.evaluate(() => !!document.querySelector('.b-resume-continue') || (!!window.__micatro.session && !!window.__micatro.view())), 40000);
		if (await page.evaluate(() => !!document.querySelector('.b-resume-continue'))) { prompted++; await page.evaluate(() => document.querySelector('.b-resume-continue').click()); }
		await waitFor(() => page.evaluate(() => !!window.__micatro.session && !!window.__micatro.view() && window.__micatro.idle()), 60000);
	};
	const pills = () => page.evaluate(() => [...document.querySelectorAll('.hud.has-rb .hud-rbadges .rb-pill')].filter((e) => e.offsetParent).map((e) => e.textContent));
	const stk = (k) => page.evaluate(async (k) => (await import('/micatro/js/ui/stickers.js')).winRecord(k), k);

	// ===== 1. resume the saved run (Continue) before the last boss blind =====
	A(await boot(), 'signed in; the main menu offers Continue');
	await continueRun();
	A(prompted === 1, 'the run recorded on Pokermon 3.2.1 asks first ("Mod updated": Continue anyway)', String(prompted));
	const v0 = await page.evaluate(() => { const v = window.__micatro.view(); return { ante: v.ante, round: v.round, state: v.state, rb: v.run_badges }; });
	A(v0.ante === 8 && v0.round === 23 && v0.state === 'BLIND_SELECT', 'the run resumed at ante 8, before the boss blind', JSON.stringify(v0));
	A(v0.rb && v0.rb.eligible === true && v0.rb.mono === true && v0.rb.type === 'Grass' && v0.rb.nuz === false, 'the resumed run is still eligible: Monotype Grass intact, Nuzlocke broken (a sale)', JSON.stringify(v0.rb));
	A(await page.evaluate(() => window.__micatro.session.recipe.seeded !== true), 'the resumed run is not a seeded one');
	A(JSON.stringify(await pills()) === '["Monotype: Grass"]', 'the HUD shows "Monotype: Grass"', JSON.stringify(await pills()));

	// ===== 2. play the rest of the run through the board's actions, to the win =====
	failProgressPuts = 1; // (the first account push of the record fails: it must be retried)
	let bad = null;
	for (let i = lastSelect; i < RECIPE.actions.length; i++) {
		await idle();
		const r = await page.evaluate((a) => { const r = window.__micatro.act(a); return { ok: r.ok, error: r.error }; }, RECIPE.actions[i]);
		if (!r.ok) { bad = { i, a: RECIPE.actions[i], r }; break; }
	}
	A(!bad, `the last ${RECIPE.actions.length - lastSelect} actions play through the board`, JSON.stringify(bad));
	A(await waitFor(() => page.evaluate(() => !!document.querySelector('.go-modal')), 20000), 'the win screen opens');
	const vw = await page.evaluate(() => { const v = window.__micatro.view(); return { won: v.won, rb: v.run_badges }; });
	A(vw.won && vw.rb && JSON.stringify(vw.rb.earned) === '{"nuz":false,"mono":"Grass"}', 'the win earned Monotype: Grass (not Nuzlocke)', JSON.stringify(vw.rb));
	const goB = await page.evaluate(() => [...document.querySelectorAll('.go-badges .rb-pill')].map((e) => e.textContent));
	A(JSON.stringify(goB) === '["Monotype: Grass"]', 'the win screen lists "Monotype: Grass"', JSON.stringify(goB));
	// the stickers: win + poke (Pikachu: a Pokermon win) + mono (Ambipom) on the win's jokers and the deck
	const want = '{"win":1,"poke":1,"mono":1}';
	const recs = {};
	for (const k of [...WIN_JOKERS, 'b_yellow']) recs[k] = JSON.stringify(await stk(k));
	A(Object.values(recs).every((r) => r === want), 'every joker of the win and the deck (b_yellow) get win + poke + mono at White stake', JSON.stringify(recs));
	A(await waitFor(() => { const r = row('micatro_stickers:' + USER); return r && WIN_JOKERS.every((k) => JSON.stringify(r.wins[k]) === want) && JSON.stringify(r.wins.b_yellow) === want; }, 20000), 'the account\'s stickers row has them too', JSON.stringify(row('micatro_stickers:' + USER)));
	// the Nuzlocke / Monotype record
	const prog = await page.evaluate(() => window.__micatro.progress.getProgress());
	A(prog.nuz === 0 && prog.both === 0 && JSON.stringify(prog.mono) === '{"grass":1}' && !!prog.ach.first_monotype && !prog.ach.first_nuzlocke, 'the record: mono.grass = 1, no Nuzlocke; the Monotype achievement', JSON.stringify(prog));
	A(await waitFor(() => { const r = row('micatro_progress:' + USER); return r && r.progress && r.progress.mono && r.progress.mono.grass === 1 && r.progress.ach.first_monotype; }, 20000), 'the record reaches the account (micatro_progress row) after a failed push is retried', JSON.stringify({ row: row('micatro_progress:' + USER), progressPuts, progressPutsFailed }));
	A(progressPutsFailed === 1 && progressPuts >= 2, 'the failed push was retried', JSON.stringify({ progressPuts, progressPutsFailed }));
	// the replay meta (local list + the uploaded row) and the leaderboard row
	const localMeta = await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('micatro_replays_v1') || '[]'); return l[0] && l[0].meta; });
	A(localMeta && localMeta.won && JSON.stringify(localMeta.badges) === '{"mono":"grass"}', 'the local replay\'s meta has badges {mono: "grass"}', JSON.stringify(localMeta && { won: localMeta.won, badges: localMeta.badges }));
	A(await waitFor(() => rowsLike('mreplay:%').some((r) => r.value.meta && r.value.meta.won && JSON.stringify(r.value.meta.badges) === '{"mono":"grass"}'), 20000), 'the uploaded replay\'s meta has badges {mono: "grass"}', JSON.stringify(rowsLike('mreplay:%').map((r) => r.value.meta && r.value.meta.badges)));
	A(await waitFor(() => { const b = row('runboard:micatro_modded') || []; const e = b.find((x) => x.name === USER); return e && e.badges && e.badges.mono === 'grass' && !e.badges.nuz; }, 20000), 'the leaderboard row carries the Grass tag', JSON.stringify(row('runboard:micatro_modded')));

	// ===== 3. Endless, then the won run is resumed: eligible, and not counted twice =====
	await page.evaluate(() => document.querySelector('.go-modal .b-endless').click());
	await idle();
	await sleep(500);
	A(await boot(), 'reloaded during Endless: the main menu offers Continue');
	await continueRun();
	const v1 = await page.evaluate(() => { const v = window.__micatro.view(); return { won: v.won, endless: v.endless, rb: v.run_badges }; });
	A(v1.won && v1.rb && v1.rb.eligible && JSON.stringify(v1.rb.earned) === '{"nuz":false,"mono":"Grass"}', 'the resumed won run still holds its badges', JSON.stringify(v1));
	await sleep(1500);
	const prog2 = await page.evaluate(() => window.__micatro.progress.getProgress());
	A(JSON.stringify(prog2.mono) === '{"grass":1}', 'the win is not counted again', JSON.stringify(prog2));
	const again = await page.evaluate(async () => {
		const P = window.__micatro.progress, RP = await import('/micatro/js/replays.js');
		const id = RP.localId(window.__micatro.session.recipe);
		P.recordRunWin({ nuz: false, mono: 'Grass' }, 1, Date.now(), id);
		return { recorded: P.runRecorded(id), grass: P.getProgress().mono.grass };
	});
	A(again.recorded && again.grass === 1, 'the run id is remembered: recording the same run again changes nothing', JSON.stringify(again));

	// ===== 4. a typed seed stays seeded after a resume =====
	await page.evaluate(async () => { await window.__micatro.loadMods(['pokermon']); await window.__micatro.newRun({ seed: 'TYPED123', back: 'b_red', mods: ['pokermon'] }); });
	await waitFor(() => page.evaluate(() => !!window.__micatro.view() && window.__micatro.idle()), 40000);
	A(await page.evaluate(() => window.__micatro.session.recipe.seeded === true && window.__micatro.view().run_badges.eligible === false), 'a typed seed: the recipe says seeded, the run is not eligible');
	A(await boot(), 'reloaded: Continue');
	await continueRun();
	A(await page.evaluate(() => window.__micatro.view().run_badges.eligible === false && (window.__micatro.view().seed === 'TYPED123')), 'resumed, the typed-seed run is still seeded (not eligible)');
	A((await pills()).length === 0, 'its HUD shows no badges');

	A(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
