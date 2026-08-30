// regionparity_test.mjs — Johto + Hoenn brought to the Kanto pass's level.
//   • Hoenn also ships set-pieces as dormant `onFrame` scenes; the three safe
//     ones are ARMED (Devon President / Lilycove museum / S.S. Tidal Scott) and
//     the strand-y ones are not;
//   • the Devon President scene really plays and hands over the LETTER;
//   • the Battle Frontier / battle-tent family is inert (the port implements
//     those natively; their decomp scripts would warp a resuming player);
//   • Johto has NO dormant onFrame scenes — its plot is all coord_events, so it
//     was already at parity (asserted against the shipped data so a future
//     re-transpile can't silently regress it).
//   node overworld/tests/regionparity_test.mjs
import http from 'http';
import fs from 'fs';
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
const PORT = 8867;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const seedMon = {
	speciesId: 'rattata', name: 'RATTATA', level: 5, gender: 'M', friend: 70,
	types: ['Normal'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
	stats: { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, maxHP: 20, curHP: 20,
	exp: 125, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
};

// ---- static data checks (no browser needed) ----
const SDIR = path.join(ROOT, 'overworld/data/scripts');
const dormant = { JOHTO: [], HOENN: [] };
for (const f of fs.readdirSync(SDIR)) {
	if (!f.endsWith('.json')) continue;
	let j;
	try { j = JSON.parse(fs.readFileSync(path.join(SDIR, f), 'utf8')); } catch { continue; }
	for (const fr of (j.__map__?.onFrame || [])) {
		if ((fr.value | 0) !== 0) continue;
		if (/^VAR_SCENE_/.test(fr.var)) dormant.JOHTO.push(`${f}:${fr.label}`);
		else if (!/^VAR_MAP_SCENE_/.test(fr.var)) dormant.HOENN.push({ file: f, ...fr });
	}
}
A(dormant.JOHTO.length === 0, 'Johto ships no dormant onFrame scenes (its plot is coord_events)', dormant.JOHTO.slice(0, 3).join(', '));
const hoennLive = dormant.HOENN.filter(r => !/^BattleFrontier_|^TrainerHill_|_BattleTent/.test(r.label));
A(dormant.HOENN.length > 50, 'Hoenn does ship dormant onFrame scenes', String(dormant.HOENN.length));
A(hoennLive.length < dormant.HOENN.length / 2, 'most of them are Battle Frontier machinery, not story',
	`${hoennLive.length} non-frontier of ${dormant.HOENN.length}`);
for (const label of ['RustboroCity_DevonCorp_3F_EventScript_MeetPresident',
	'LilycoveCity_LilycoveMuseum_2F_EventScript_ShowExhibitHall',
	'SSTidalCorridor_EventScript_ScottScene']) {
	A(dormant.HOENN.some(r => r.label === label), `the armed beat exists in the data: ${label.split('_EventScript_')[1]}`);
}

(async () => {
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
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument((st, mon) => {
			try {
				localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				localStorage.setItem('magepunk_party_v1', JSON.stringify([mon]));
				localStorage.setItem('magepunk_region', 'HOENN');
			} catch {}
		}, STATE, seedMon);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=RustboroCity_DevonCorp_3F`, { waitUntil: 'domcontentloaded' });
		const ready = await new Promise(async resolve => {
			for (let i = 0; i < 200; i++) {
				if (await page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.STORY_SEED)).catch(() => false)) return resolve(true);
				await new Promise(r => setTimeout(r, 150));
			}
			resolve(false);
		});
		A(ready, 'boot: overworld up in Devon Corp 3F');
		if (!ready) throw new Error('boot failed');

		// ---- the Hoenn seed arms the right three and rests the rest ----
		const seed = await page.evaluate(() => window.__ow.STORY_SEED.HOENN.vars);
		A(seed.VAR_DEVON_CORP_3F_STATE === 0, 'the Devon President scene is armed');
		A(seed.VAR_LILYCOVE_MUSEUM_2F_STATE === 0, 'the Lilycove museum tour is armed');
		A(seed.VAR_SS_TIDAL_SCOTT_STATE === 0, "Scott's ferry cameo is armed");
		A(!('VAR_SS_TIDAL_STATE' in seed), 'the ferry-ride state machine is NOT armed');
		A(!('VAR_ICE_STEP_COUNT' in seed), 'the Sootopolis ice puzzle is NOT armed');
		A(seed.VAR_SEAFLOOR_CAVERN_STATE === 1 && seed.VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE === 1,
			'the previously-rested unsafe Hoenn scenes are untouched');

		// ---- the frontier family is inert ----
		const blocked = await page.evaluate(() => {
			const ow = window.__ow;
			return {
				frontier: ow.plotBlocked('BattleFrontier_BattleDomeBattleRoom_EventScript_EnterRoom'),
				hill: ow.plotBlocked('TrainerHill_Entrance_EventScript_Something'),
				tent: ow.plotBlocked('SlateportCity_BattleTentLobby_EventScript_Whatever'),
				ice: ow.plotBlocked('SootopolisCity_Gym_1F_EventScript_FallThroughIce'),
				ereader: ow.plotBlocked('SevenIsland_House_Room2_EventScript_BattleVisitingTrainer'),
				story: ow.plotBlocked('RustboroCity_DevonCorp_3F_EventScript_MeetPresident'),
			};
		});
		A(blocked.frontier && blocked.hill && blocked.tent, 'Battle Frontier / Trainer Hill / battle tents are inert');
		A(blocked.ice, 'the Sootopolis ice-fall is blocked');
		A(blocked.ereader, 'the e-Reader trainer stays blocked');
		A(!blocked.story, 'a real story scene is NOT blocked');

		// ---- the Devon President scene plays and hands over the LETTER ----
		const fired = await new Promise(async resolve => {
			for (let i = 0; i < 80; i++) {
				if (await page.evaluate(() => window.__ow.cutscene?.blocking || window.__ow.dialog?.blocking).catch(() => false)) return resolve(true);
				await new Promise(r => setTimeout(r, 150));
			}
			resolve(false);
		});
		A(fired, 'the Devon President scene fires on entry');
		// 40 ops with walk choreography + a typewriter: give it room to play out
		for (let i = 0; i < 200; i++) {
			await page.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'z' })));
			await new Promise(r => setTimeout(r, 150));
			if (await page.evaluate(() => !window.__ow.cutscene?.blocking && !window.__ow.dialog?.blocking)) break;
		}
		const after = await page.evaluate(async () => {
			const Story = await import('/overworld/events.js');
			const Bag = await import('/overworld/bag.js');
			return { v: Story.getVar('VAR_DEVON_CORP_3F_STATE'), letter: Bag.count('letter') };
		});
		A(after.v === 1, 'it advanced its own var (one-shot)', JSON.stringify(after));
		A(after.letter > 0, 'the LETTER is in the bag', JSON.stringify(after));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
