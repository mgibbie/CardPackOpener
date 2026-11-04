// save_repair_test.mjs — the owner sends a save repair; the player's game offers it.
//
// Repairs for the playtesters (a story restore, a junk-item cleanup) used to be
// files the owner had to deliver by hand (2026-10-01: "send the file to Instinct
// yourself" — nothing could). Now the owner queues one (repair-send) and the
// player's game offers it on load; Z applies it through importSave (backup,
// stale-baseRev refusal, read-back), X keeps it for later; the outcome is
// recorded for the owner (repair-status). Boots the REAL dev server.
//   1. API: only the owner sends; a player sees only their own pending repair
//   2. the game offers it ("Michael sent a save repair"), Z applies it — local and
//      server both carry the repaired save; the owner sees "applied"
//   3. X keeps it pending; it is offered again next load
//   4. a STALE repair (the player played past its baseRev) is refused, nothing
//      changes, and the owner sees "failed / stale"
//
//   node overworld/tests/save_repair_test.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9201;
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
const PARTY = JSON.stringify([{ speciesId: 'pikachu', name: 'PIKA', level: 5, types: ['Electric'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }, stats: { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, maxHP: 20, curHP: 20, exp: 125, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's25.png', num: 25 }]);
const saveAt = (rev, money, play = 1000) => ({ magepunk_region: 'KANTO', magepunk_party_v1: PARTY, magepunk_money: String(money), magepunk_ow_rev: String(rev), magepunk_playtime: String(play),
	magepunk_story: JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }),
	magepunk_pos_v1: JSON.stringify({ map: 'PalletTown', x: 10, y: 10, back: null }) });
const doc = (rev, money, baseRev, basePlay = 1000) => ({ magic: 'magepunk-ow-save', version: 1, exported_at: new Date().toISOString(), baseRev, basePlaytime: basePlay, keys: saveAt(rev, money, basePlay) });

const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'repair-')), 'users.sqlite');
const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile } });
let browser;
try {
	let up = false;
	for (let i = 0; i < 100 && !up; i++) { up = await fetch(BASE + '/').then(r => r.ok).catch(() => false); if (!up) await sleep(200); }
	A(up, 'dev server is up');
	const owner = await tokenFor('mgibbie', 'localdev1');
	const player = await tokenFor('repairtester', 'localdev1');
	const other = await tokenFor('repairother', 'localdev1');
	const pState = (await api('state', {}, player)).state;

	// ===== 1. API =====
	A((await api('repair-send', { to: 'repairtester', doc: doc(50, 777, 50) }, player)).error === 'owner only', 'only the owner can send a repair');
	A(!!(await api('repair-send', { to: 'repairtester', doc: { nope: 1 } }, owner)).error, 'a repair must be a save export');
	A((await api('ow-save', { ow: saveAt(50, 100) }, player)).ok, 'setup: the player has a save at rev 50 with ¥100');
	const sent = await api('repair-send', { to: 'repairtester', title: 'Junk item cleanup', note: 'Removes two junk items.', doc: doc(50, 777, 50) }, owner);
	A(sent.ok, 'the owner queues a repair', JSON.stringify(sent));
	A((await api('repair-get', {}, other)).repair === null, "another player doesn't see it");

	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((t, st) => { localStorage.setItem('magepunk_mp_token_v1', t); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' })); }, player, pState);
	// boot, and wait for the repair prompt (the boot may hydrate + reload once)
	const bootAndWaitPrompt = async () => {
		await page.goto(BASE + '/overworld/index.html', { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300; i++) {
			const t = await page.evaluate(() => JSON.stringify(window.__ow?.dialog?.pages || '')).catch(() => '');
			if (/save repair/.test(t)) return t;
			await sleep(150);
		}
		return null;
	};
	const answer = async key => {   // page through the PROMPT to its last page, close it with `key`
		for (let i = 0; i < 12; i++) {
			const st = await page.evaluate(() => ({ open: !!window.__ow?.dialog?.blocking, idx: window.__ow?.dialog?.idx, n: (window.__ow?.dialog?.pages || []).length, t: JSON.stringify(window.__ow?.dialog?.pages || '') })).catch(() => ({ open: false }));
			if (!st.open || !/save repair:/.test(st.t)) return;
			await page.keyboard.press(st.idx >= st.n - 1 ? key : 'z');
			await sleep(150);
		}
	};

	// ===== 2. apply =====
	const prompt = await bootAndWaitPrompt();
	A(prompt && /Junk item cleanup/.test(prompt) && /Z = Apply/.test(prompt), 'the game offers it: "Michael sent a save repair: Junk item cleanup"', prompt);
	A(+((await api('ow-load', {}, player)).ow.ow.magepunk_ow_rev) > 50, "(loading the game already pushed a save past the repair's baseRev — that is not play)");
	await answer('z');
	await sleep(2500);
	for (let i = 0; i < 100 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false)); i++) await sleep(150);
	const money = await page.evaluate(() => localStorage.getItem('magepunk_money'));
	const srv = (await api('ow-load', {}, player)).ow;
	A(money === '777' && srv && srv.ow.magepunk_money === '777', 'Z applies it: local and server both carry the repaired save (¥777)', JSON.stringify({ money, server: srv && srv.ow.magepunk_money }));
	const st1 = ((await api('repair-status', {}, owner)).repairs || [])[0];
	A(st1 && st1.status === 'applied' && st1.result && st1.result.ok, 'the owner sees it applied', JSON.stringify(st1));
	A((await api('repair-get', {}, player)).repair === null, 'it is no longer offered');

	// ===== 3. later =====
	const rev2 = +srv.ow.magepunk_ow_rev;
	await api('repair-send', { to: 'repairtester', title: 'Second repair', doc: doc(rev2, 888, rev2) }, owner);
	const p2 = await bootAndWaitPrompt();
	A(p2 && /Second repair/.test(p2), 'a new repair is offered on load');
	await answer('x');
	await sleep(500);
	A(await page.evaluate(() => localStorage.getItem('magepunk_money')) === '777' && !!(await api('repair-get', {}, player)).repair, 'X keeps it for later: nothing changed, still pending');

	// ===== 4. stale =====
	await api('ow-save', { ow: { ...srv.ow, magepunk_ow_rev: String(rev2 + 5), magepunk_money: '555', magepunk_playtime: String(1000 + 600) } }, player);   // the player played on (10 minutes)
	const p3 = await bootAndWaitPrompt();
	A(p3 && /Second repair/.test(p3), 'it is offered again on the next load');
	await answer('z');
	await sleep(1500);
	const after = await page.evaluate(() => ({ money: localStorage.getItem('magepunk_money'), dlg: JSON.stringify(window.__ow?.dialog?.pages || '') }));
	A(after.money === '555' && /could not be/.test(after.dlg) && /moved\W+on to/.test(after.dlg), 'a STALE repair is refused and nothing changes (the player\'s ¥555 stays)', JSON.stringify(after));
	const st2 = ((await api('repair-status', {}, owner)).repairs || [])[0];
	A(st2 && st2.status === 'failed' && st2.result && st2.result.stage === 'stale', 'the owner sees it failed as stale (so a fresh one is built)', JSON.stringify(st2));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.kill();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
