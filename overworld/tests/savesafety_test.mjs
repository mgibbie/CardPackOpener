// savesafety_test.mjs — Batch D of the second upscale plan: the save safety net.
//
//   * export/import: the whole game as a file (canonical key list = owreset's),
//     a doctored file can't plant foreign keys, a restore clears before writing
//   * server backups: ow-save stashes one automatic daily snapshot (of the
//     PREVIOUS blob), prunes to 7 dailies, never ages out the UNDO slot;
//     ow-restore stashes the replaced game into UNDO first
//   * the full save now syncs (OW_KEYS = the canonical list minus the live
//     battle snapshot), and a hydration that changes module-cached keys
//     reloads once (latched against loops)
//   * repel wear-off re-offers the same repel kind from the bag
//   * the adventure journal records catches and shows on the trainer card
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/savesafety_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- source ----------
{
	const reset = fs.readFileSync(path.join(ROOT, 'site/owreset.js'), 'utf8');
	for (const k of ['magepunk_journal_v1', 'magepunk_repellast', 'magepunk_battle_v1'])
		A(reset.includes(`'${k}'`), `owreset's canonical key list carries ${k}`);

	const mn = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/const OW_KEYS = OW_RESET_KEYS\.filter\(k => k !== 'magepunk_battle_v1'\)/.test(mn),
		'the server sync covers the whole canonical save (minus the live battle snapshot)');
	A(/'battleAnim'\]/.test(mn.match(/const OPTION_KEYS = \[[^\]]+\]/)?.[0] || ''),
		'BATTLE ANIM is reachable from the options menu (the setting existed with no row)');
	A(/mp_ow_hydrated/.test(mn) && /location\.reload\(\)/.test(mn),
		'a hydration that changes module-cached keys reloads once, latched against loops');
	A(/if \(repelSteps === 0\) repelWoreOff\(\)/.test(mn), 'the wear-off site calls the re-offer prompt');

	const sv = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
	for (const a of ['ow-history', 'ow-restore']) A(sv.includes(`action === '${a}'`), `${a} action exists`);
	const os = sv.slice(sv.indexOf("action === 'ow-save'"), sv.indexOf("action === 'ow-load'"));
	A(/'owh:' \+ username \+ ':' \+ day/.test(os) && /prev\.ow/.test(os),
		'ow-save stashes the PREVIOUS blob as the daily snapshot (first save of the day)');
	A(/OW_HISTORY_KEEP/.test(os) && /\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(os),
		'pruning keeps the newest dailies and only matches date-shaped keys (UNDO survives)');
	const orst = sv.slice(sv.indexOf("action === 'ow-restore'"), sv.indexOf("action === 'ow-restore'") + 900);
	A(/:undo'/.test(orst) && /snap\.ow/.test(orst), 'ow-restore stashes the replaced game into the UNDO slot first');
	A(/const OW_MAX_BYTES = 1_000_000/.test(sv), 'the ow size cap grew with the full-save payload');

	const ev = fs.readFileSync(path.join(ROOT, 'overworld/evolution.js'), 'utf8');
	A(/onEvolved\?\.\(this\.cur\.oldName, mon\.name\)/.test(ev), 'evolution announces itself to the journal hook');
}

// ---------- pure: the daily-snapshot prune, replicated ----------
{
	// same shape the handler uses: list ascending by key, keep the newest 7 dailies
	const keys = ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', 'undo']
		.map(s => 'owh:u:' + s);
	const dailies = keys.filter(k => /\d{4}-\d{2}-\d{2}$/.test(k));
	const drop = dailies.slice(0, dailies.length - 7);
	A(drop.length === 1 && drop[0] === 'owh:u:2026-08-20', 'the oldest daily is the one pruned');
	A(!drop.includes('owh:u:undo') && !keys.filter(k => /\d{4}-\d{2}-\d{2}$/.test(k)).includes('owh:u:undo'),
		'the UNDO slot never matches the prune pattern');
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
	const PORT = 8972;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 12, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 40, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 }, maxHP: 40, curHP: 40,
		exp: 1728, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
	}];
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
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
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'JOHTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		// --- options menu: settings + the three save-data actions render ---
		const opt = await page.evaluate(() => {
			const ow = window.__ow;
			const o = { threw: null };
			try {
				ow.optionsMenu.open = true; ow.optionsMenu.mode = 'main'; ow.optionsMenu.idx = 0;
				ow.drawOptions(480, 320);
				o.actions = ow.OPTION_ACTIONS.map(a => a.id);
				o.hasBattleAnim = ow.OPTION_KEYS.includes('battleAnim');
				ow.optionsMenu.mode = 'backups';
				ow.optionsMenu.list = [{ slot: 'undo', bytes: 2048, updated_at: 1 }, { slot: '2026-09-01', bytes: 40960, updated_at: 2 }];
				ow.drawOptions(480, 320);
				ow.optionsMenu.mode = 'main'; ow.optionsMenu.open = false; ow.optionsMenu.list = null;
			} catch (e) { o.threw = e.message; }
			return o;
		});
		A(opt.threw === null, 'the options menu draws (settings, actions, and the backups list)', opt.threw);
		A(JSON.stringify(opt.actions) === JSON.stringify(['export', 'import', 'backups']), 'EXPORT / IMPORT / SERVER BACKUPS rows exist', JSON.stringify(opt.actions));
		A(opt.hasBattleAnim === true, 'BATTLE ANIM appears among the option rows');

		// --- savefile: build -> corrupt the game -> parse -> apply restores it ---
		const sf = await page.evaluate(() => {
			const ow = window.__ow;
			const o = {};
			const before = localStorage.getItem('magepunk_party_v1');
			const doc = ow.Savefile.buildSave();
			o.count = Object.keys(doc.keys).length;
			localStorage.setItem('magepunk_party_v1', '[]');                      // "corruption"
			localStorage.setItem('magepunk_repel_v1', '55');                      // a key the save lacks
			const parsed = ow.Savefile.parseSave(JSON.stringify(doc));
			ow.Savefile.applySave(parsed.keys);
			o.roundtrip = localStorage.getItem('magepunk_party_v1') === before;
			o.cleared = localStorage.getItem('magepunk_repel_v1') == null;        // restore CLEARS first
			try { ow.Savefile.parseSave('{"magic":"nope","keys":{}}'); o.junk = 'accepted'; }
			catch (e) { o.junk = 'rejected'; }
			try { ow.Savefile.parseSave(JSON.stringify({ magic: 'magepunk-ow-save', keys: { evil_key: 'x', magepunk_money: '999' } })); o.foreign = 'accepted'; }
			catch (e) { o.foreign = 'filtered-to-empty-rejected'; }
			o.noEvil = localStorage.getItem('evil_key') == null;
			return o;
		});
		A(sf.count >= 3, 'the export captures the seeded save', String(sf.count));
		A(sf.roundtrip, 'export -> corrupt -> import restores the exact save string');
		A(sf.cleared, 'a restore clears keys the save file lacks (no leakage from the replaced game)');
		A(sf.junk === 'rejected', 'a non-save JSON file is rejected with a message');
		A(sf.noEvil, 'unknown keys in a doctored file never reach localStorage');

		// --- the journal: catches funnel through offerNickname; the card page draws ---
		const jr = await page.evaluate(() => {
			const ow = window.__ow;
			const o = { threw: null };
			try {
				ow.Journal.add('A test entry');
				ow.offerNickname({ name: 'PIDGEY', level: 5 });   // logs the catch, then opens the nickname prompt
				o.first = ow.Journal.list()[0]?.text;
				o.persisted = (JSON.parse(localStorage.getItem('magepunk_journal_v1')) || [])[0]?.text;
				ow.trainerCard.page = 1;
				ow.drawTrainerCard(480, 320);
				ow.trainerCard.page = 0;
			} catch (e) { o.threw = e.message; }
			return o;
		});
		A(jr.threw === null, 'the journal page of the trainer card draws', jr.threw);
		A(jr.first === 'Caught PIDGEY (Lv5)', 'a catch writes the journal through offerNickname', jr.first);
		A(jr.persisted === 'Caught PIDGEY (Lv5)', 'journal entries persist to magepunk_journal_v1', jr.persisted);
		// close the nickname prompt the call above opened
		for (let i = 0; i < 6 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press('x'); await new Promise(r => setTimeout(r, 150)); }

		// --- repel wear-off: the prompt re-offers the same kind, Z uses one ---
		await page.evaluate(() => {
			const ow = window.__ow;
			ow.Bag.addItem('repel', 2);
			localStorage.setItem('magepunk_repellast', 'repel');
			ow.setRepel(0);
			ow.repelWoreOff();
		});
		A(await page.evaluate(() => window.__ow.dialog.blocking), 'wearing off with one in the bag raises the re-use prompt');
		for (let i = 0; i < 8 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press('z'); await new Promise(r => setTimeout(r, 150)); }
		const rp = await page.evaluate(() => ({
			steps: localStorage.getItem('magepunk_repel_v1'),
			left: window.__ow.Bag.count('repel'),
		}));
		A(rp.steps === '100', 'Z re-arms a fresh 100-step repel', rp.steps);
		A(rp.left === 1, 'and one REPEL left the bag', String(rp.left));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
