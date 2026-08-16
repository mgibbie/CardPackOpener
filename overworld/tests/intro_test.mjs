// intro_test.mjs — headless test for the Fork B authentic campaign open, driven
// through the REAL main.js wiring for ALL THREE regions (Kanto/Johto/Hoenn):
// a fresh save picks a REGION (no starter yet), hears the professor's welcome,
// walks into the lab where a code-triggered cutscene runs the professor greeting
// + an on-screen starter pick, then the rival grabs the type-advantaged starter
// and battles you. Also checks world.setMetatile (live tile edits) and that the
// intro dialogue renders clean (no leaked {control codes}, POKeMON not POKéMON).
//
// Each region runs on a fresh page load; evaluateOnNewDocument wipes every
// magepunk_* key (except the MP token/state) so seedStoryState re-seeds cleanly.
//
// Standalone (needs headless Chrome + puppeteer-core + local overworld/ data);
// NOT in run-all.mjs.   node overworld/tests/intro_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8876;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'intro', friendCode: 'INTROO', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 120)); } return false; }

// each region: picker row, home + lab file stems, the starter column to choose
// and the species it maps to (STARTERS order: K bulbasaur/charmander/squirtle,
// J chikorita/cyndaquil/totodile, H treecko/torchic/mudkip)
const REGIONS = [
	{ key: 'KANTO', row: 0, home: 'PalletTown', lab: 'PalletTown_ProfessorOaksLab', col: 1, species: 'charmander', rival: 'GARY', welcome: /world of POKeMON|OAK/i },
	{ key: 'JOHTO', row: 1, home: 'NewBarkTown', lab: 'ElmsLab', col: 0, species: 'chikorita', rival: 'SILVER', welcome: /ELM|LAB/i },
	{ key: 'HOENN', row: 2, home: 'LittlerootTown', lab: 'LittlerootTown_ProfessorBirchsLab', col: 2, species: 'mudkip', rival: 'BRENDAN', welcome: /BIRCH|LAB/i },
];

const BOOTED = () => page.evaluate(() => !!(window.__ow && window.__ow.NEW_GAME_INTRO && window.__ow.menuTap));
async function freshBoot(page) {
	// a prior region may be left mid-battle; its unload-save can write the party
	// back AFTER the injected fresh-save wipe on the next document. So boot, then
	// if any state bled through, hard-clear from this now-quiescent page + reload.
	await page.goto('about:blank', { waitUntil: 'load' }).catch(() => {});
	await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' });
	await waitFor(BOOTED, 30000);
	const dirty = await page.evaluate(() => !!window.__ow.party || !!localStorage.getItem('magepunk_region'));
	if (dirty) {
		await page.evaluate(() => {
			for (let i = localStorage.length - 1; i >= 0; i--) {
				const k = localStorage.key(i);
				if (k && k.startsWith('magepunk_') && k !== 'magepunk_mp_token_v1' && k !== 'magepunk_mp_state_v1') localStorage.removeItem(k);
			}
		});
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(BOOTED, 30000);
	}
	return page.evaluate(() => !!window.__ow);
}

async function runRegion(page, cfg, doMetatile) {
	// fresh boot (no ?map so beginNewGame warps to the region's home town)
	const booted = await freshBoot(page);
	A(booted, `[${cfg.key}] booted with the intro helpers exposed`);
	await page.evaluate(() => {
		window._dtext = () => { const p = window.__ow?.dialog?.pages; return p ? p.flat().join(' ') : null; };
		window._noDialog = () => !window.__ow.dialog.blocking && !window.__ow.cutscene.blocking;
		window._pickOpen = () => window.__ow.starterMenu.open && window.__ow.starterMenu.phase === 'pick';
		window._rivalBattle = () => window.__ow.battle.blocking;
		window._pumpUntil = async (condName, budget) => {
			for (let i = 0; i < (budget || 80); i++) {
				if (window[condName]()) return true;
				const d = window.__ow.dialog;
				if (d.blocking) d.key('x');
				await new Promise(r => setTimeout(r, 40));
			}
			return window[condName]();
		};
	});

	// 1) fresh save opens the REGION picker with NO party
	const fresh = await page.evaluate(() => ({ open: window.__ow.starterMenu.open, phase: window.__ow.starterMenu.phase, party: window.__ow.party }));
	A(fresh.open && fresh.phase === 'region', `[${cfg.key}] fresh save opens the region picker`, JSON.stringify(fresh));
	A(fresh.party === null, `[${cfg.key}] a fresh save starts with NO party`);

	// 2) choosing the region begins the game: region saved, still no starter, welcome plays
	await page.evaluate(r => window.__ow.menuTap('region:' + r), cfg.row);
	const began = await waitFor(() => page.evaluate(() => window.__ow.cutscene.blocking || window.__ow.dialog.blocking), 10000);
	A(began, `[${cfg.key}] picking the region starts the opening cutscene`);
	const after = await page.evaluate(() => ({ region: localStorage.getItem('magepunk_region'), party: window.__ow.party, home: window.__ow.world.current?.name, text: window._dtext() }));
	A(after.region === cfg.key, `[${cfg.key}] region persisted`, after.region);
	A(after.party === null, `[${cfg.key}] still no starter right after choosing the region`);
	A(after.home === cfg.home, `[${cfg.key}] dropped into the home town (${cfg.home})`, after.home);
	A(cfg.welcome.test(after.text || ''), `[${cfg.key}] the professor welcome opened`, JSON.stringify(after.text));
	A(!/[{}]/.test(after.text || ''), `[${cfg.key}] no leaked {control codes} in the welcome`, JSON.stringify(after.text));
	A(!/é/.test(after.text || ''), `[${cfg.key}] accented é normalized in the welcome`);

	// drain the welcome, then walk into the lab (still partyless)
	await page.evaluate(() => window._pumpUntil('_noDialog', 100));
	await page.evaluate(lab => window.__ow.moveToMap(lab), cfg.lab);
	const atLab = await waitFor(() => page.evaluate(l => window.__ow.world.current?.name === l, cfg.lab), 10000);
	A(atLab, `[${cfg.key}] reached the lab (${cfg.lab})`);
	const greeted = await waitFor(() => page.evaluate(() => window.__ow.cutscene.blocking || window.__ow.dialog.blocking || window.__ow.starterMenu.open), 8000);
	A(greeted, `[${cfg.key}] entering the lab partyless auto-runs the professor greeting`);
	const greet = await page.evaluate(() => ({ text: window._dtext(), party: window.__ow.party }));
	A(greet.party === null, `[${cfg.key}] still no party when the lab greeting begins`);
	A(!/[{}]/.test(greet.text || ''), `[${cfg.key}] the lab greeting renders clean`, JSON.stringify(greet.text));

	// close greeting -> on-screen picker opens, locked to this region
	const pickOpen = await page.evaluate(() => window._pumpUntil('_pickOpen', 100));
	A(pickOpen, `[${cfg.key}] closing the greeting opens the on-screen starter picker`);
	A(await page.evaluate(() => window.__ow.starterMenu.region) === cfg.key, `[${cfg.key}] the picker is locked to this region's trio`);

	// 3) choosing a starter creates the party
	await page.evaluate(c => window.__ow.menuTap('starterpick:' + c), cfg.col);
	const gotStarter = await waitFor(() => page.evaluate(() => !!window.__ow.party), 8000);
	A(gotStarter, `[${cfg.key}] picking a starter creates the party`);
	const mon = await page.evaluate(() => window.__ow.party?.[0]?.speciesId);
	A(mon === cfg.species, `[${cfg.key}] the chosen starter (col ${cfg.col}) is ${cfg.species}`, mon);

	// 4) the rival grabs the type-advantaged starter and a battle begins
	const rival = await page.evaluate(() => window._pumpUntil('_rivalBattle', 140));
	A(rival, `[${cfg.key}] after the pick, the rival challenges you to a battle`);

	// 5) (once) world.setMetatile toggles a tile's passability live
	if (doMetatile) {
		const meta = await page.evaluate(() => {
			const w = window.__ow.world; const lay = w.current.layout; let tx = -1, ty = -1;
			for (let y = 1; y < lay.height - 1 && ty < 0; y++) for (let x = 1; x < lay.width - 1; x++) {
				if (w.isPassable(x, y) && !w.isSurfable(x, y)) { tx = x; ty = y; break; }
			}
			if (tx < 0) return { found: false };
			const prev = lay.map[ty][tx];
			const before = w.isPassable(tx, ty);
			w.setMetatile(tx, ty, prev & 0x3FF, true); const blocked = w.isPassable(tx, ty);
			w.setMetatile(tx, ty, prev & 0x3FF, false); const reopened = w.isPassable(tx, ty);
			return { found: true, before, blocked, reopened };
		});
		A(meta.found && meta.before && !meta.blocked && meta.reopened, 'world.setMetatile toggles a tile’s passability live', JSON.stringify(meta));
	}
}

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) { /* drain */ }
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
		await page.evaluateOnNewDocument((st) => {
			try {
				// wipe every magepunk_* key so each region run is a genuinely fresh save
				// (party/region/story/pos/badges all cleared), but keep the MP session
				for (let i = localStorage.length - 1; i >= 0; i--) {
					const k = localStorage.key(i);
					if (k && k.startsWith('magepunk_') && k !== 'magepunk_mp_token_v1' && k !== 'magepunk_mp_state_v1') localStorage.removeItem(k);
				}
				localStorage.setItem('magepunk_mp_token_v1', 'intro-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			} catch {}
		}, STATE);

		for (let i = 0; i < REGIONS.length; i++) {
			await runRegion(page, REGIONS[i], i === 0); // run the setMetatile check once
		}

		const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
		A(fatal.length === 0, 'no uncaught client errors across all three regions', fatal.slice(0, 4).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
		console.error(e);
	} finally {
		if (browser) await browser.close();
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
