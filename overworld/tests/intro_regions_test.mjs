// intro_regions_test.mjs — the new-game opening, walked end-to-end in ALL
// THREE regions.
//
// What this pins (each was a live bug):
//   * the region picker picks a REGION — region cards only, no 3x3 grid of
//     starters promising a choice that actually happens later in the lab
//   * Pallet Town no longer has the mute intro-scene Oak on the path (his
//     hide-flag was misspelled in the seed), and Oak's lab counter no longer
//     seats two "guys" (POKEDEX props drawn with person-sprite fallbacks)
//   * Littleroot no longer shows Birch's identical-twin scene-rival, the
//     three starter balls stacked on one lab tile, or the outdoor scene
//     copies (trucks/Mom/Birch/rival)
//   * home towns have their townsfolk (Crystal/Johto NPCs silently dropped)
//   * professors LOOK like professors (ELM/BIRCH had no sprite mapping)
//   * the full flow completes: pick region -> narration -> walk into the lab
//     -> greeting -> on-screen starter pick -> rival fight -> party in hand,
//     and re-entering the lab never re-offers
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/intro_regions_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const REGIONS = {
	KANTO: { home: 'PalletTown', lab: 'PalletTown_ProfessorOaksLab', row: 0, prof: 'PROF_OAK', trio: ['bulbasaur', 'charmander', 'squirtle'] },
	JOHTO: { home: 'NewBarkTown', lab: 'ElmsLab', row: 1, prof: 'ELM', trio: ['chikorita', 'cyndaquil', 'totodile'] },
	HOENN: { home: 'LittlerootTown', lab: 'LittlerootTown_ProfessorBirchsLab', row: 2, prof: 'PROF_BIRCH', trio: ['treecko', 'torchic', 'mudkip'] },
};

// ---------- the wirings, in source ----------
{
	const main = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/FLAG_HIDE_OAK_IN_PALLET_TOWN/.test(main) && !/FLAG_HIDE_PALLET_TOWN_OAK/.test(main),
		"the Pallet-path Oak's hide-flag uses the map's real spelling");
	A(/FLAG_HIDE_LITTLEROOT_TOWN_BIRCHS_LAB_RIVAL/.test(main), "Emerald's intro-scene props are seeded hidden");
	A(/for \(const f of seed\.flags \|\| \[\]\) Story\.setFlag\(f\);/.test(main.split('armStoryScenes')[1].split('}')[0] + '}')
		|| /armStoryScenes[\s\S]{0,400}seed\.flags/.test(main),
		'existing saves get the seeded flags retrofitted (armStoryScenes)');
	const npcs = fs.readFileSync(path.join(ROOT, 'overworld/npcs.js'), 'utf8');
	A(/POKEDEX\|TRUCK/.test(npcs), 'prop objects never draw as people');
	const items = fs.readFileSync(path.join(ROOT, 'overworld/items.js'), 'utf8');
	A(/objectHiddenByFlag\(o, !!map\._crystal_tileset\)/.test(items), 'flagged item balls are not grabbable scene props');
	const gfx = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/gfx_map.json'), 'utf8'));
	A(gfx.OBJ_EVENT_GFX_ELM === 'prof_oak.png' && gfx.OBJ_EVENT_GFX_PROF_BIRCH === 'prof_oak.png',
		'ELM and BIRCH wear the professor coat');
}

// ---------- live: the full opening, three times ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8959;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
		await page.evaluateOnNewDocument((st) => {
			localStorage.clear();           // every navigation is a brand-new save
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		}, STATE);

		for (const [region, cfg] of Object.entries(REGIONS)) {
			await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' });
			const t0 = Date.now();
			while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));

			const run = await page.evaluate(async (cfg) => {
				const ow = window.__ow;
				const key = k => dispatchEvent(new KeyboardEvent('keydown', { key: k }));
				const wait = ms => new Promise(r => setTimeout(r, ms));
				const out = {};
				await wait(1200);
				// the picker offers REGION cards, never starter cells
				const ids = ow.menuUi.map(b => b.id || '');
				out.regionCards = ids.filter(i => i.startsWith('region:')).length;
				out.starterCells = ids.filter(i => i.startsWith('starterpick:')).length;
				for (let i = 0; i < cfg.row; i++) { key('ArrowDown'); await wait(140); }
				key('z');
				await wait(2200);
				for (let i = 0; i < 26; i++) { key('z'); await wait(200); }
				out.home = ow.world.current?.name;
				const gfxOf = list => list.map(n => (n.ev?.graphics_id || '').replace('OBJ_EVENT_GFX_', ''));
				const town = gfxOf(ow.npcs.list);
				out.townCount = town.length;
				out.townProps = town.filter(g => /POKEDEX|TRUCK/.test(g)).length;
				out.muteSceneActors = town.filter(g => /PROF_OAK|PROF_BIRCH|^VAR_0$|^MOM$/.test(g)).length;
				// into the lab: greeting -> on-screen pick
				await ow.moveToMap(cfg.lab);
				for (let i = 0; i < 16 && !ow.starterMenu.open; i++) { key('z'); await wait(220); }
				out.pickOpen = !!ow.starterMenu.open && ow.starterMenu.phase === 'pick';
				const lab = gfxOf(ow.npcs.list);
				out.labProf = lab.filter(g => g === cfg.prof).length;
				out.labProps = lab.filter(g => /POKEDEX|TRUCK|^VAR_0$/.test(g)).length;
				out.labBallsOnFloor = ow.items.balls ? ow.items.balls.length : 0;
				// ABNORMAL CLOSE + WALK OUT: nothing lab-flavored may follow into
				// the town (the greeting used to re-fire and its lines trailed the
				// player out the door), and returning must reopen the pick with NO
				// second speech (the professor talks once)
				ow.starterMenu.open = false;
				await ow.moveToMap(cfg.home);
				await wait(700);
				out.townClean = !ow.starterMenu.open && !ow.cutscene.blocking && !ow.dialog.blocking;
				await ow.moveToMap(cfg.lab);
				let silent = true;
				for (let i = 0; i < 40 && !ow.starterMenu.open; i++) { if (ow.cutscene.blocking) silent = false; await wait(100); }
				out.reopenSilent = ow.starterMenu.open && silent;
				// take the first starter; ride the rival flow to the end
				key('z');
				for (let i = 0; i < 200; i++) {
					if (ow.battle.active && (ow.battle.active.phase === 'menu' || ow.battle.active.phase === 'choose')) ow.battle.finish('victory');
					if (ow.party && !ow.dialog.blocking && !ow.cutscene.blocking && !ow.battle.blocking) break;
					key('z'); await wait(200);
				}
				out.party = (ow.party || []).map(m => m.speciesId);
				// re-entering the lab must never re-offer (menuUi holds stale
				// buttons when no menu is open — read the menu itself)
				await ow.moveToMap(cfg.lab);
				await wait(800);
				out.reoffer = !!ow.starterMenu.open || ow.cutscene.blocking;
				return out;
			}, cfg);

			A(run.regionCards === 3 && run.starterCells === 0,
				`${region}: the picker is three region cards, zero starter cells`, JSON.stringify(run));
			A(run.home === cfg.home, `${region}: the intro lands in ${cfg.home}`, run.home);
			A(run.townCount > 0, `${region}: the home town has its townsfolk (${run.townCount})`);
			A(run.townProps === 0 && run.muteSceneActors === 0,
				`${region}: no prop-people or mute scene actors in town`, JSON.stringify(run));
			A(run.pickOpen, `${region}: the lab runs the greeting into the on-screen starter pick`);
			A(run.labProf === 1 && run.labProps === 0,
				`${region}: exactly one professor in the lab, no prop-people`, JSON.stringify({ prof: run.labProf, props: run.labProps }));
			A(run.labBallsOnFloor === 0, `${region}: no scene item-balls on the lab floor`, String(run.labBallsOnFloor));
			A(run.townClean, `${region}: an abandoned pick never follows the player into the town`);
			A(run.reopenSilent, `${region}: back in the lab, the pick reopens with no second speech`);
			A(run.party.length === 1 && run.party[0] === cfg.trio[0],
				`${region}: the flow ends with the chosen starter in hand`, JSON.stringify(run.party));
			A(!run.reoffer, `${region}: re-entering the lab never re-offers a starter`);
		}

		A(errors.length === 0, 'no uncaught page errors across all three openings', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
