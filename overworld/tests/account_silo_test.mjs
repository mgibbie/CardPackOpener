// account_silo_test.mjs — one browser, several accounts (bug:1792610921028).
//
// A brand-new account on a shared browser was shown the previous account's
// Lorequest run as its own RESUME card and opened the previous account's Overworld
// game, because every game keeps its local copy in global localStorage keys and
// login / create-account / logout only swap the auth token. site/account_silo.js
// records which account owns the browser's existing (un-namespaced) data and gives
// every OTHER signed-in account its own `acct@<user>/` namespace; nothing is moved.
//
// Covered (the reporter's list): a new account B on A's browser sees no resume card
// and an empty Overworld, and nothing of A's is pushed to B's server copy; A's data
// stays byte-identical; A logging back in gets it all back, same revision; both
// directions of logout/login; untagged legacy data is not given to a NEW account but
// is claimed by a login; guests stay guests (a guest who signs up keeps their game);
// a namespaced account keeps its own namespace; device prefs stay global; another
// tab's write reaches listeners under the name they asked for.
//
//   node overworld/tests/account_silo_test.mjs
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
const PORT = 9275;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// the server: whoever the token says; every ow-save is recorded
let SERVER_USER = 'alice';
const OW_SAVES = [];
const stateOf = u => ({ username: u, friendCode: u.toUpperCase().slice(0, 6), decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } });
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') { OW_SAVES.push({ user: SERVER_USER, ow: b.ow || {} }); return res.end(JSON.stringify({ ok: true })); }
		if (b.action === 'run-load') return res.end(JSON.stringify({ ok: true, runs: {} }));
		return res.end(JSON.stringify({ ok: true, state: stateOf(SERVER_USER), friends: [], challenges: [] }));
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

// alice's browser before the fix shipped: a Lorequest run and an Overworld game in
// the global keys, no owner tag
const RUN = JSON.stringify({ active: true, characterId: 'Garruk', cls: 'hunter', wins: 0, losses: 1, deck: Array.from({ length: 30 }, (_, i) => 'c' + i), snapshotAt: '2026-09-18T13:44:35Z' });
const ALICE = {
	magepunk_lorequest_v1: RUN,
	magepunk_region: 'HOENN', magepunk_ow_rev: '8446', magepunk_money: '2706',
	magepunk_pos_v1: JSON.stringify({ map: 'Route112', x: 10, y: 10 }),
	magepunk_party_v1: JSON.stringify([{ speciesId: 'blastoise', name: 'BLASTOISE', level: 40 }]),
	magepunk_story: JSON.stringify({ flags: { intro_done: true, story_seeded: true }, vars: {} }),
	magepunk_cardgold_v1: '325',
	micatro_run_v1: JSON.stringify({ id: 'm1', ante: 3 }),
};

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'] });
	const ctx = await browser.createBrowserContext();   // ONE browser profile for the whole story
	const page = await ctx.newPage();
	page.on('pageerror', e => console.log('  (pageerror) ' + String(e.message).slice(0, 160)));
	const go = async p => { await page.goto(`http://localhost:${PORT}${p}`, { waitUntil: 'domcontentloaded' }); await sleep(300); };
	// the raw stored value, past the shim (named-property access is not patched)
	const raw = k => page.evaluate(k => { const d = Object.getOwnPropertyDescriptor(localStorage, k); return d ? d.value : null; }, k);
	const rawKeys = () => page.evaluate(() => Object.keys(localStorage));
	const get = k => page.evaluate(k => localStorage.getItem(k), k);
	const silo = () => page.evaluate(() => window.MagepunkSilo ? { user: window.MagepunkSilo.user, owner: window.MagepunkSilo.owner, scope: window.MagepunkSilo.scope } : {});
	const signIn = async (u, action) => {
		SERVER_USER = u;
		await page.evaluate((u, action) => {
			window.MagepunkSilo?.onAuth(action, u);   // what battlecards/mpmode.js auth() does first
			localStorage.setItem('magepunk_mp_token_v1', 't-' + u);
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: u, friendCode: u.toUpperCase() }));
		}, u, action);
	};
	const signOut = () => page.evaluate(() => { localStorage.removeItem('magepunk_mp_token_v1'); localStorage.removeItem('magepunk_mp_state_v1'); });

	// ---- the browser as it is on the day this ships: alice signed in, untagged data ----
	await go('/stats.html');
	await page.evaluate((data, st) => {
		localStorage.clear();
		for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
		localStorage.setItem('magepunk_mp_token_v1', 't-alice');
		localStorage.setItem('magepunk_mp_state_v1', st);
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, ALICE, JSON.stringify(stateOf('alice')));
	await go('/stats.html');
	let s = await silo();
	A(s && s.owner === 'alice' && s.scope === null, 'an existing signed-in player claims the untagged data: alice keeps using the global keys, nothing moved', JSON.stringify(s));
	A(await get('magepunk_lorequest_v1') === RUN, '...and reads her Lorequest run exactly as before');
	const before = Object.fromEntries(await Promise.all(Object.keys(ALICE).map(async k => [k, await raw(k)])));

	// ---- alice logs out; a NEW account bob is created in the same browser ----
	await signOut();
	await go('/login/');
	await signIn('bob', 'register');
	await go('/battlecards/start.html');
	await sleep(800);
	s = await silo();
	A(s && s.user === 'bob' && s.owner === 'alice' && s.scope === 'bob', '[1792610921028] the new account bob gets his own namespace (alice still owns the global data)', JSON.stringify(s));
	const tile = await page.evaluate(() => { const el = document.querySelector('.tile[data-run="magepunk_lorequest_v1"]'); return el ? { inprogress: el.getAttribute('data-inprogress'), rec: el.querySelector('.run-record')?.textContent || '' } : null; });
	A(tile && !tile.inprogress && !tile.rec, '[1792610921028] bob\'s Battlecards start page shows NO Lorequest resume card', JSON.stringify(tile));
	A(await get('magepunk_lorequest_v1') === null && await get('magepunk_party_v1') === null && await get('micatro_run_v1') === null && await get('magepunk_cardgold_v1') === null,
		'...and every game key reads empty for bob: Lorequest, Overworld party, Micatro run, card gold');
	A(await get('magepunk_settings') !== null, '...while device preferences (text speed) stay shared');

	// the Overworld as bob: a fresh game, and nothing of alice's is pushed as his
	OW_SAVES.length = 0;
	await go('/overworld/index.html');
	for (let i = 0; i < 200 && !(await page.evaluate(() => !!(window.__ow?.world?.current)).catch(() => false)); i++) await sleep(100);
	await sleep(2500);
	const ow = await page.evaluate(() => ({ party: (window.__ow.S?.party || []).map(m => m.speciesId), map: window.__ow.world.current.name, money: localStorage.getItem('magepunk_money') }));
	A(!ow.party.includes('blastoise') && ow.map !== 'Route112', '[1792610921028] bob\'s Overworld is not alice\'s game (no Blastoise, not on Route 112)', JSON.stringify(ow));
	const leaked = OW_SAVES.filter(x => x.user === 'bob' && (/blastoise/i.test(x.ow.magepunk_party_v1 || '') || x.ow.magepunk_ow_rev === '8446' || x.ow.magepunk_lorequest_v1));
	A(!leaked.length, '...and nothing of alice\'s is pushed to bob\'s server copy', JSON.stringify(leaked.map(x => Object.keys(x.ow))));
	// bob plays: his writes land in his namespace only
	await page.evaluate(() => localStorage.setItem('magepunk_lorequest_v1', JSON.stringify({ active: true, characterId: 'Chandra', wins: 2, losses: 0 })));
	const bobKey = (await rawKeys()).find(k => k === 'acct@bob/magepunk_lorequest_v1');
	A(!!bobKey && /Chandra/.test(await raw('acct@bob/magepunk_lorequest_v1')), '...bob\'s own run is stored under acct@bob/magepunk_lorequest_v1');
	const after = Object.fromEntries(await Promise.all(Object.keys(ALICE).map(async k => [k, await raw(k)])));
	A(JSON.stringify(after) === JSON.stringify(before), '...and alice\'s global keys are byte-identical (not read, written or deleted while bob played)',
		JSON.stringify(Object.keys(ALICE).filter(k => after[k] !== before[k])));
	// another tab's write: the listener hears the name it asked for
	const heard = await page.evaluate(() => new Promise(res => {
		addEventListener('storage', e => res(e.key));
		dispatchEvent(new StorageEvent('storage', { key: 'acct@bob/magepunk_defeated_v1', newValue: '[]', storageArea: localStorage }));
		setTimeout(() => res('(nothing)'), 300);
	}));
	A(heard === 'magepunk_defeated_v1', '...and a storage event for bob\'s own key reaches listeners as magepunk_defeated_v1', heard);

	// ---- bob logs out, alice logs back in ----
	await signOut();
	await go('/login/');
	await signIn('alice', 'login');
	await go('/battlecards/start.html');
	await sleep(800);
	s = await silo();
	const tileA = await page.evaluate(() => document.querySelector('.tile[data-run="magepunk_lorequest_v1"]')?.getAttribute('data-inprogress'));
	A(s.owner === 'alice' && s.scope === null && tileA === '1' && await get('magepunk_lorequest_v1') === RUN && await get('magepunk_ow_rev') === '8446',
		'alice logs back in: her Lorequest resume card, run and Overworld revision (8446) are all intact', JSON.stringify({ s, tileA }));
	// ---- and back to bob: his own run, not alice's ----
	await signOut();
	await signIn('bob', 'login');
	await go('/stats.html');
	A(/Chandra/.test(await get('magepunk_lorequest_v1') || '') && (await silo()).scope === 'bob', 'bob logs back in: he gets his own run back (the other direction)');

	// ---- a guest on alice's browser stays a guest (sees the global, local-only data, as today) ----
	await signOut();
	await go('/stats.html');
	s = await silo();
	A(s.user === null && s.scope === null && await get('magepunk_lorequest_v1') === RUN && (await silo()).owner === 'alice', 'logged out: a guest uses the global keys, and the tag still says alice');

	// ---- untagged LEGACY data and a brand-new account (the exact reported order) ----
	await page.evaluate((data) => { localStorage.clear(); for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v); }, ALICE);
	await go('/stats.html');   // a guest page load finds data nobody vouches for
	s = await silo();
	A(s.owner === '?legacy', 'untagged data first seen by a guest is marked ?legacy (whose it is is unknown)', JSON.stringify(s));
	await go('/login/');
	await signIn('carol', 'register');
	await go('/stats.html');
	s = await silo();
	A(s.scope === 'carol' && await get('magepunk_lorequest_v1') === null, '[1792610921028] creating a NEW account on it: carol does not inherit it', JSON.stringify(s));
	await signOut();
	await go('/login/');
	await signIn('alice', 'login');
	await go('/stats.html');
	s = await silo();
	A(s.owner === 'alice' && s.scope === null && await get('magepunk_lorequest_v1') === RUN, '...a LOGIN claims it (the last signed-in user) — alice gets her game', JSON.stringify(s));
	await signOut();
	await go('/login/');
	await signIn('carol', 'login');
	await go('/stats.html');
	s = await silo();
	A(s.scope === 'carol', '...and carol, who already has a namespace here, keeps it rather than claiming anything', JSON.stringify(s));

	// ---- a guest who signs up keeps their game ----
	await page.evaluate(() => localStorage.clear());
	await go('/stats.html');
	s = await silo();
	A(s.owner === 'guest', 'a fresh browser opened as a guest is tagged guest', JSON.stringify(s));
	await page.evaluate(() => localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'mudkip', level: 7 }])));
	await go('/login/');
	await signIn('dave', 'register');
	await go('/stats.html');
	s = await silo();
	A(s.owner === 'dave' && s.scope === null && /mudkip/.test(await get('magepunk_party_v1') || ''), '...and when that guest creates an account, the account keeps the guest\'s game', JSON.stringify(s));

	await ctx.close();
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
