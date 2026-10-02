// bugreview_test.mjs — the Bug Report Review list (owner, 2026-10-01): the
// playtesters (Instinct, Muse) file bug reports to the site; the owner reviews
// them at /bugreview/ like the Design To-Do. Boots the REAL dev server (real
// auth + the bug-* actions on sqlite) and checks:
//   1. API: a playtester files (long markdown kept whole, context attached,
//      credential-looking context keys dropped); a stranger is refused; only the
//      owner can list / mark done; done removes exactly the ids given
//   2. /bugs/: a playtester files through the form; the game's context rides in
//      on the URL; their open reports are listed
//   3. /bugreview/: owner-only (anonymous -> /login, a stranger -> lock screen);
//      the owner sees the report and marks it done
//   4. the overworld's OPTIONS menu offers REPORT A BUG
//
//   node overworld/tests/bugreview_test.mjs
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
const PORT = 9188;
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
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; }

const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bugreview-')), 'users.sqlite');
const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)],
	{ cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile, MP_BUG_REPORTERS: 'bugtester1,remygl' } });
let browser;
try {
	A(await waitFor(() => fetch(BASE + '/bugs/').then(r => r.ok), 20000), 'dev server is up');
	const owner = await tokenFor('mgibbie', 'localdev1');
	const tester = await tokenFor('bugtester1', 'localdev1');
	const stranger = await tokenFor('bugstranger', 'localdev1');

	// ===== 1. API =====
	const long = '# BUG: Aqua Hideout Electrode ball becomes a junk item\n\n' + 'Steps… '.repeat(2500);
	const added = await api('bug-add', { title: 'Electrode junk', area: 'overworld', severity: 'blocker', text: long,
		context: { map: 'AquaHideout_B1F', x: 15, y: 10, rev: 25323, authToken: 'SHOULD-NOT-BE-KEPT', password: 'nope' } }, tester);
	A(added.ok && /^\d+-bugtester1$/.test(added.id || ''), 'a playtester files a report', JSON.stringify(added));
	A((await api('bug-add', { text: 'hi' }, stranger)).error, 'someone who is not a playtester is refused');
	// 2026-10-02: Remy's bot signed in as remytest and read the bare refusal as a broken button
	A(/signed in as bugstranger/.test((await api('bug-mine', {}, stranger)).error || ''), '...and the refusal names the account they are signed in as');
	A(/'instinctloretest0918,remygl,remytest'/.test(fs.readFileSync(path.join(ROOT, 'server', 'mp.mjs'), 'utf8')), 'the default reporters are Instinct, Muse and remytest (the account Remy\'s bot uses)');
	A((await api('bug-list', {}, tester)).error === 'owner only', 'only the owner can list the review queue');
	const list = (await api('bug-list', {}, owner)).bugs || [];
	const b = list.find(x => x.id === added.id);
	A(b && b.text === long.trim() && b.text.length > 15000, 'the whole long report is kept', b && b.text.length);
	A(b && b.severity === 'blocker' && b.area === 'overworld' && b.title === 'Electrode junk' && b.user === 'bugtester1', '...with its title, area, severity and the VERIFIED reporter', JSON.stringify(b && { t: b.title, s: b.severity, u: b.user }));
	A(b && b.context.map === 'AquaHideout_B1F' && b.context.x === 15 && !('authToken' in b.context) && !('password' in b.context), '...its context, minus anything credential-looking', JSON.stringify(b && b.context));
	const mine = (await api('bug-mine', {}, tester)).bugs || [];
	A(mine.length === 1 && mine[0].title === 'Electrode junk' && !('text' in mine[0]), 'a playtester sees their own open reports (titles only)');
	const second = await api('bug-add', { text: 'second one' }, tester);
	await api('bug-done', { id: added.id }, owner);
	const after = ((await api('bug-list', {}, owner)).bugs || []).map(x => x.id);
	A(!after.includes(added.id) && after.includes(second.id), 'done removes exactly the reviewed report', JSON.stringify(after));
	A((await api('bug-done', { id: second.id }, tester)).error === 'owner only', 'a playtester cannot mark reports done');
	await api('bug-done', { id: second.id }, owner);

	// ===== 2. /bugs/ =====
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
	const seed = async (ctx, token, username) => {
		const page = await ctx.newPage();
		await page.evaluateOnNewDocument((t, u) => { try { if (t) localStorage.setItem('magepunk_mp_token_v1', t); if (u) localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: u })); } catch {} }, token, username);
		return page;
	};
	{
		const ctx = await browser.createBrowserContext();
		const p = await seed(ctx, tester, 'bugtester1');
		await p.goto(BASE + '/bugs/?from=overworld&area=overworld&map=RocketHideout_B4F&x=3&y=3&region=kanto&rev=25436', { waitUntil: 'networkidle2' });
		A(await p.evaluate(() => /map=RocketHideout_B4F/.test(document.getElementById('ctx').textContent)), '/bugs/ shows the context the game attached');
		await p.type('#title', 'Lift Key ball junk');
		await p.select('#severity', 'blocker');
		await p.type('#text', 'Found _EVENT SCRIPT_LIFT KEY! — no FLAG_CAN_USE_ROCKET_HIDEOUT_LIFT');
		await p.click('#send');
		A(await waitFor(() => p.evaluate(() => /Sent/.test(document.getElementById('msg').textContent)), 8000), 'the form sends it');
		A(await waitFor(() => p.evaluate(() => /Lift Key ball junk/.test(document.getElementById('mine-list').textContent)), 5000), '...and it appears under "Your open reports"');
		const got = ((await api('bug-list', {}, owner)).bugs || []).find(x => x.title === 'Lift Key ball junk');
		A(got && got.context.map === 'RocketHideout_B4F' && got.context.rev === 25436 && got.severity === 'blocker', 'the server has it with the game context', JSON.stringify(got && got.context));
		await ctx.close();
	}

	// ===== 3. /bugreview/ =====
	{
		const anonCtx = await browser.createBrowserContext();
		const anon = await anonCtx.newPage();
		await anon.goto(BASE + '/bugreview/', { waitUntil: 'networkidle2' });
		A(/\/login/.test(anon.url()), 'anonymous visitors bounce to /login', anon.url());
		await anonCtx.close();
		const sCtx = await browser.createBrowserContext();
		const sp = await seed(sCtx, tester, 'bugtester1');
		await sp.goto(BASE + '/bugreview/', { waitUntil: 'networkidle2' });
		A(await waitFor(() => sp.evaluate(() => /owner tool/.test(document.body.textContent)), 8000), 'a playtester gets the owner lock screen (with a link to file instead)');
		await sCtx.close();
		const oCtx = await browser.createBrowserContext();
		const op = await seed(oCtx, owner, 'mgibbie');
		await op.goto(BASE + '/bugreview/', { waitUntil: 'networkidle2' });
		A(await waitFor(() => op.evaluate(() => /Lift Key ball junk/.test(document.body.textContent) && /RocketHideout_B4F/.test(document.body.textContent)), 8000), 'the owner sees the report with its context');
		await op.evaluate(() => [...document.querySelectorAll('.bug')].find(b => /Lift Key ball junk/.test(b.textContent)).querySelector('.done').click());
		A(await waitFor(() => op.evaluate(() => /No open bug reports/.test(document.body.textContent)), 8000), '✓ Done clears it from the list');
		A(((await api('bug-list', {}, owner)).bugs || []).length === 0, '...and from the server');
		await oCtx.close();
	}

	// ===== 4. the game's menu =====
	{
		const src = fs.readFileSync(path.join(ROOT, 'overworld/ow_menustate.js'), 'utf8');
		A(/id: 'bugreport', label: 'REPORT A BUG'/.test(src), 'the overworld OPTIONS menu offers REPORT A BUG');
		const sv = fs.readFileSync(path.join(ROOT, 'overworld/ow_saves.js'), 'utf8');
		A(/'\/bugs\/\?'/.test(sv) && /map: world\.current\?\.name/.test(sv), '...which opens /bugs/ with the map and position attached');
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.kill();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
