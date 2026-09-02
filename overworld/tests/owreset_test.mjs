// owreset_test.mjs — the owner "reset my overworld game" tool.
//
// A destructive tool on a site where BOTH halves use the `magepunk_` prefix, so
// the two things worth proving are that it clears everything the overworld owns
// and NOTHING that Battlecards or the login owns. `magepunk_class_v1` is the trap:
// the Battlecards deck builder writes it and the overworld only reads it, so a
// prefix sweep would quietly delete a Battlecards setting.
//
// The other trap is the server. The overworld save is mirrored to D1 and
// hydrateOw() treats the SERVER as authoritative on boot, so clearing only the
// browser looks like it worked and then restores the old game on the next load.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/owreset_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const { OW_RESET_KEYS, OW_KEEP_KEYS } = await import('../../site/owreset.js');

// ---------- scope ----------
{
	const keysIn = dir => {
		const out = new Set();
		const walk = d => {
			for (const e of fs.readdirSync(d, { withFileTypes: true })) {
				if (e.isDirectory()) { if (!/^(data|tests|people_extra)$/.test(e.name)) walk(path.join(d, e.name)); continue; }
				if (!/\.(js|mjs)$/.test(e.name)) continue;
				for (const m of fs.readFileSync(path.join(d, e.name), 'utf8').matchAll(/'(magepunk_[a-z0-9_]+)'/g)) out.add(m[1]);
			}
		};
		walk(dir);
		return out;
	};
	const ow = keysIn(path.join(ROOT, 'overworld'));
	const bc = keysIn(path.join(ROOT, 'battlecards'));
	const reset = new Set(OW_RESET_KEYS);
	const keep = new Set(Object.keys(OW_KEEP_KEYS));

	A(OW_RESET_KEYS.length === reset.size, 'the reset list has no duplicates');

	// nothing Battlecards WRITES may be cleared. (It may READ an overworld key —
	// that direction is fine — so this checks writes.)
	const bcWrites = new Set();
	for (const f of fs.readdirSync(path.join(ROOT, 'battlecards')).filter(f => /\.js$/.test(f))) {
		const src = fs.readFileSync(path.join(ROOT, 'battlecards', f), 'utf8');
		for (const m of src.matchAll(/(?:setItem|safeSaveStr|safeSave)\(\s*'(magepunk_[a-z0-9_]+)'/g)) bcWrites.add(m[1]);
	}
	const collide = [...bcWrites].filter(k => reset.has(k));
	A(collide.length === 0, `no key Battlecards writes is in the reset list (${bcWrites.size} checked)`, collide.join(', '));
	A(bcWrites.has('magepunk_class_v1') && !reset.has('magepunk_class_v1'),
		'magepunk_class_v1 — written by Battlecards, read by the overworld — is spared');

	// the login is never touched
	for (const k of ['magepunk_mp_token_v1', 'magepunk_mp_state_v1']) {
		A(!reset.has(k) && keep.has(k), `${k} is spared — resetting it would sign you out`);
	}

	// COMPLETENESS: every key the overworld touches is accounted for, one way or
	// the other. This is what stops the list silently rotting as the game grows.
	const unaccounted = [...ow].filter(k => !reset.has(k) && !keep.has(k) && !bcWrites.has(k));
	A(unaccounted.length === 0,
		`every one of the ${ow.size} overworld keys is either reset or explicitly kept`, unaccounted.join(', '));
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
	const PORT = 8938;
	let owBlob = { magepunk_region: 'HOENN', magepunk_party_v1: '[{"speciesId":"mudkip"}]' }; // the server copy
	let username = 'mgibbie';
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let body = '';
			for await (const c of req) body += c;
			let msg = {}; try { msg = JSON.parse(body || '{}'); } catch (e) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			if (msg.action === 'ow-save') { owBlob = msg.ow; res.end(JSON.stringify({ ok: true })); return; }
			if (msg.action === 'ow-load') { res.end(JSON.stringify({ ow: { ow: owBlob, updated_at: 1 } })); return; }
			res.end(JSON.stringify({ ok: true, state: { username, friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: {} }, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const dialogs = [];
		page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
		const pageErrors = [];
		page.on('pageerror', e => pageErrors.push(e.message));

		const seed = (user) => page.evaluate((u) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: u }));
			// overworld progress
			localStorage.setItem('magepunk_region', 'HOENN');
			localStorage.setItem('magepunk_party_v1', '[{"speciesId":"mudkip"}]');
			localStorage.setItem('magepunk_badges_v1', '{"HOENN":["stone"]}');
			localStorage.setItem('magepunk_money', '9999');
			localStorage.setItem('magepunk_story', '{"flags":{"intro_done":true}}');
			// things that must SURVIVE
			localStorage.setItem('magepunk_class_v1', 'mage');
			localStorage.setItem('magepunk_decks_v1', '[{"name":"My Deck"}]');
			localStorage.setItem('magepunk_cardgold_v1', '4200');
			localStorage.setItem('magepunk_settings', '{"charsPerSec":90}');
		}, user);

		// --- a non-owner must not even see it ---
		username = 'someoneelse';
		await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
		await seed('someoneelse');
		await page.reload({ waitUntil: 'domcontentloaded' });
		await new Promise(r => setTimeout(r, 600));
		A(await page.evaluate(() => !!document.getElementById('tile-owreset')?.hidden),
			'a non-owner does not see the reset tile');

		// --- the owner does ---
		username = 'mgibbie';
		await seed('mgibbie');
		await page.reload({ waitUntil: 'domcontentloaded' });
		await new Promise(r => setTimeout(r, 800));
		A(await page.evaluate(() => document.getElementById('tile-owreset')?.hidden === false),
			'the owner sees it, beside the Map Editor');
		A(await page.evaluate(() => {
			const t = [...document.querySelectorAll('.tile')].map(e => e.id);
			return t.indexOf('tile-owreset') === t.indexOf('tile-mapedit') + 1;
		}), '...immediately after it');

		// --- do it ---
		await page.evaluate(() => document.getElementById('tile-owreset').click());
		// Wait for the REDIRECT, not for a fixed number of milliseconds. The handler
		// awaits a network round-trip before it clears anything, so a sleep raced it
		// and reported "the save is still here" on a slow run — a flaky test on a
		// destructive tool is worse than no test.
		{
			const t0 = Date.now();
			while (Date.now() - t0 < 15000) {
				const done = await page.evaluate(() => location.pathname.includes('/overworld/')).catch(() => false);
				if (done) break;
				await new Promise(r => setTimeout(r, 100));
			}
		}
		A(dialogs.some(d => /Reset your OVERWORLD game/i.test(d)),
			'it asks before wiping anything', dialogs.join(' | ').slice(0, 90));
		const after = await page.evaluate(() => ({
			region: localStorage.getItem('magepunk_region'),
			party: localStorage.getItem('magepunk_party_v1'),
			badges: localStorage.getItem('magepunk_badges_v1'),
			money: localStorage.getItem('magepunk_money'),
			story: localStorage.getItem('magepunk_story'),
			cls: localStorage.getItem('magepunk_class_v1'),
			decks: localStorage.getItem('magepunk_decks_v1'),
			gold: localStorage.getItem('magepunk_cardgold_v1'),
			settings: localStorage.getItem('magepunk_settings'),
			token: localStorage.getItem('magepunk_mp_token_v1'),
			href: location.pathname,
		}));
		A(!after.region && !after.party && !after.badges && !after.money && !after.story,
			'the overworld save is gone', JSON.stringify(after));
		A(after.cls === 'mage' && after.decks && after.gold === '4200',
			'BATTLECARDS survives — class, decks and gold all intact', JSON.stringify({ cls: after.cls, gold: after.gold }));
		A(after.settings === '{"charsPerSec":90}', 'and so do your settings');
		A(after.token === 'smoke-token', 'and you are still logged in');
		A(Object.keys(owBlob).length === 0, 'the SERVER copy was cleared too, so it cannot come back on the next load', JSON.stringify(owBlob));
		A(/\/overworld\//.test(after.href), 'it drops you straight into the overworld to replay the intro', after.href);

		A(true, `(${OW_RESET_KEYS.length} keys in the reset list)`);
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
