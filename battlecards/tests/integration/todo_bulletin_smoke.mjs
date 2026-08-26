// todo_bulletin_smoke.mjs — the /todo/ Design To-Do bulletin (owner inbox).
// Boots the REAL dev server (mp-dev-server: real auth + todo-add/list/done on
// sqlite) and asserts the whole flow: anonymous visitors bounce to /login, a
// non-owner account gets the lock screen, the owner sees filed notes with
// their card links, can mark one done, and can file a general note from the
// composer. Also checks the homepage tile is owner-only.
//
// Standalone (needs headless Chrome/Edge); NOT in run-all.mjs:
//   node battlecards/tests/integration/todo_bulletin_smoke.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8881;
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const api = (action, body = {}, token) => fetch(BASE + '/api/mp', {
	method: 'POST',
	headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
	body: JSON.stringify({ action, ...body }),
}).then(r => r.json());

// the dev server's sqlite persists in tmpdir across runs — register, else login
async function tokenFor(username, password) {
	let r = await api('register', { username, password });
	if (!r.token) r = await api('login', { username, password });
	if (!r.token) throw new Error(username + ' auth failed: ' + JSON.stringify(r));
	return r.token;
}

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) {
		try { if (await fn()) return true; } catch {}
		await new Promise(r => setTimeout(r, 150));
	}
	return false;
}

(async () => {
	// a FRESH db every run — the shared dev sqlite may hold 'mgibbie' under a
	// password from some other session, which would make owner auth impossible
	const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'todo-smoke-')), 'users.sqlite');
	const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)],
		{ cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile } });
	let browser;
	try {
		A(await waitFor(() => fetch(BASE + '/todo/').then(r => r.ok), 15000), 'dev server is up');

		const owner = await tokenFor('mgibbie', 'localdev1');
		const peon = await tokenFor('todopeon', 'localdev1');

		// seed the inbox with a card-attached note (the wiki box files these)
		await api('todo-done', { all: true }, owner); // clean slate across runs
		const added = await api('todo-add', { cardId: 'fireball', cardName: 'Fireball', text: 'make it cost 3 and hit face only' }, owner);
		A(added.ok === true && added.count === 1, 'todo-add filed the wiki-style note', JSON.stringify(added));
		A((await api('todo-add', { text: 'nope' }, peon)).error === 'owner only', 'todo API refuses non-owners');

		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
		const seed = async (ctx, token, username) => {
			const page = await ctx.newPage();
			await page.evaluateOnNewDocument((t, u) => {
				try {
					if (t) localStorage.setItem('magepunk_mp_token_v1', t);
					if (u) localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: u }));
				} catch {}
			}, token, username);
			return page;
		};

		// 1) anonymous → bounced to /login (fresh context: no shared localStorage)
		const anonCtx = await browser.createBrowserContext();
		const anon = await seed(anonCtx, null, null);
		await anon.goto(BASE + '/todo/', { waitUntil: 'networkidle2', timeout: 20000 });
		A(/\/login/.test(anon.url()), 'anonymous visitor bounces to /login', anon.url());
		await anonCtx.close();

		// 2) non-owner → lock screen
		const peonCtx = await browser.createBrowserContext();
		const peonPage = await seed(peonCtx, peon, 'todopeon');
		await peonPage.goto(BASE + '/todo/', { waitUntil: 'networkidle2', timeout: 20000 });
		A(await waitFor(() => peonPage.evaluate(() => document.body.textContent.includes('owner tool')), 8000),
			'non-owner gets the lock screen');
		await peonCtx.close();

		// 3) owner → sees the note, its card link, marks it done, files a new one
		const page = await seed(browser.defaultBrowserContext(), owner, 'mgibbie');
		await page.goto(BASE + '/todo/', { waitUntil: 'networkidle2', timeout: 20000 });
		A(await waitFor(() => page.evaluate(() => document.querySelectorAll('.note').length === 1), 8000),
			'owner sees the filed note');
		const note = await page.evaluate(() => {
			const n = document.querySelector('.note');
			return { name: n?.querySelector('.card-name')?.textContent, href: n?.querySelector('.card-name')?.getAttribute('href'), text: n?.querySelector('.text')?.textContent };
		});
		A(note.name === 'Fireball' && note.href === '/designwiki/#/cards/fireball' && /cost 3/.test(note.text || ''),
			'the note shows its card, wiki link, and text', JSON.stringify(note));

		await page.type('#new-note', 'general: rework the login page theme');
		await page.click('#add');
		A(await waitFor(() => page.evaluate(() => document.querySelectorAll('.note').length === 2), 8000),
			'the composer files a general note');
		A(await page.evaluate(() => [...document.querySelectorAll('.note .card-name')].some(e => e.textContent === 'General note')),
			'general notes render without a card');

		await page.evaluate(() => document.querySelector('.note .done').click()); // newest first = the general note
		A(await waitFor(() => page.evaluate(() => document.querySelectorAll('.note').length === 1), 8000),
			'Done removes a note');
		A((await api('todo-list', {}, owner)).todos.length === 1, 'the removal reached the server');

		// 4) homepage tile is owner-only
		A(await waitFor(async () => {
			await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 20000 });
			return page.evaluate(() => document.getElementById('tile-todo') && !document.getElementById('tile-todo').hidden);
		}, 10000), 'homepage Design To-Do tile shows for the owner');
		const anonCtx2 = await browser.createBrowserContext();
		const anon2 = await seed(anonCtx2, null, null);
		await anon2.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 20000 });
		A(await anon2.evaluate(() => document.getElementById('tile-todo')?.hidden === true), 'tile stays hidden for visitors');
		await anonCtx2.close();

		await api('todo-done', { all: true }, owner); // leave the dev inbox clean
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
		console.error(e);
	} finally {
		if (browser) await browser.close();
		server.kill();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
