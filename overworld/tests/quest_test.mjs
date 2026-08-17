// quest_test.mjs — the linear main-quest spine. Part 1 is pure-node unit coverage
// of quest.js (stage/objective/gate/log derive correctly from badges + intro/champ
// state, across 0..8 badges for every region). Part 2 is a headless check that the
// live wiring is present: Quest is exposed, the #objective HUD line updates, the
// QUEST menu + Trainer Card render, and the corridor gate decision is live.
//
// The reachability / no-strand guarantee for the gates lives in quest_reach.mjs.
// Standalone (Part 2 needs headless Chrome + puppeteer-core + local data);
// NOT in run-all.mjs.   node overworld/tests/quest_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import * as Badges from '../badges.js';
import * as Story from '../events.js';
import * as Quest from '../quest.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8878;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const reset = () => { Badges._reset(); Story.resetStory(); };
const earn = (region, k) => Badges.earn(region, Badges.list(region)[k].id);

// ---------- Part 1: pure-node unit ----------
for (const region of ['KANTO', 'JOHTO', 'HOENN']) {
	reset();
	A(Quest.stage(region) === Quest.INTRO, `[${region}] fresh save is the INTRO stage`);
	A(/first POKeMON/i.test(Quest.objective(region)), `[${region}] intro objective points at the starter`);
	Story.setFlag('intro_done');
	A(Quest.stage(region) === 0, `[${region}] after the intro, stage 0 (first gym)`);
	A(Quest.objective(region).includes(Quest.GYMS[region][0].leader), `[${region}] stage-0 objective names gym 1's leader`, Quest.objective(region));
	for (let k = 0; k < 8; k++) {
		earn(region, k);
		const want = k + 1 < 8 ? k + 1 : Quest.LEAGUE;
		A(Quest.stage(region) === want, `[${region}] ${k + 1} badges -> stage ${want}`);
	}
	A(/LEAGUE/.test(Quest.objective(region)), `[${region}] 8 badges -> League objective`);
	Badges.crown(region);
	A(Quest.stage(region) === Quest.DONE, `[${region}] champion -> DONE`);
	A(/CHAMPION/.test(Quest.objective(region)), `[${region}] done objective congratulates the champion`);
}

// gates: gym-door gate needs the gym's index; corridor entry needs its badge; a
// blocked map opens the moment you earn the badge; ungated maps are free
reset(); Story.setFlag('intro_done');
A(Quest.gateFor('KANTO', 'CeruleanCity') === 1, 'KANTO Cerulean corridor gate = 1 badge');
A(Quest.gateFor('KANTO', 'SaffronCity_Gym') === 5, 'KANTO Saffron gym-DOOR gate = 5 badges (gym index)');
A(Quest.gateFor('KANTO', 'ViridianCity_Gym') === 7, 'KANTO Viridian gym-door gate = 7 (early-pass town, late gym)');
A(Quest.gateFor('KANTO', 'PalletTown') === 0, 'the start town is ungated');
A(Quest.blocked('KANTO', 'CeruleanCity') !== null, 'Cerulean is blocked at 0 badges');
A(Quest.blocked('KANTO', 'PewterCity_Gym') === null, 'gym 1 is open at 0 badges (its door needs 0)');
earn('KANTO', 0); // Brock
A(Quest.blocked('KANTO', 'CeruleanCity') === null, 'Cerulean opens the moment you earn the Boulder Badge');
A(Quest.blocked('KANTO', 'VermilionCity') !== null, 'Vermilion is still blocked at 1 badge (needs 2)');
{
	const vb = Quest.blocked('KANTO', 'VermilionCity');
	const need2Name = Badges.list('KANTO')[1].name; // the 2nd badge (Cascade)
	A(vb.need === 2 && vb.msg.includes(need2Name), 'the block message names the required badge', `${need2Name} :: ${vb.msg}`);
}
A(Quest.blocked('HOENN', 'PetalburgCity_Gym') !== null && Quest.blocked('HOENN', 'PetalburgCity_Gym').need === 4, 'HOENN Petalburg gym (Norman) needs 4 badges though the town is early');

// strand-proof: a player standing DEEP (e.g. an old save left in Cerulean) at 0
// badges can still RETREAT through the gated route back to gym 1 — a move is only
// blocked when it goes DEEPER than where you already are.
reset(); Story.setFlag('intro_done'); // 0 badges
A(Quest.blocked('KANTO', 'Route4', 'CeruleanCity') === null, 'retreat: Cerulean(1)->Route4(1) allowed at 0 badges (not deeper)');
A(Quest.blocked('KANTO', 'PewterCity', 'Route3') === null, 'retreat: Route3(1)->Pewter(0) always allowed (shallower)');
A(Quest.blocked('KANTO', 'Route3', 'PewterCity') !== null, 'advance: Pewter(0)->Route3(1) blocked at 0 badges (deeper)');

// quest log marks done / current / locked
reset(); Story.setFlag('intro_done'); earn('KANTO', 0); // 1 badge
const lg = Quest.log('KANTO');
A(lg[0].state === 'done', 'log: gym 1 is done after 1 badge');
A(lg[1].state === 'current', 'log: gym 2 is the current objective');
A(lg[2].state === 'locked', 'log: gym 3 is locked');
A(lg[8].label === 'POKeMON LEAGUE' && lg[8].state === 'locked', 'log: the League row is locked pre-8-badges');
A(lg[9].label === 'CHAMPION', 'log: the last row is CHAMPION');
reset();

// ---------- Part 2: headless wiring ----------
const STATE = { username: 'quest', friendCode: 'QUESTT', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 120)); } return false; }

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req) { } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
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
			localStorage.setItem('magepunk_mp_token_v1', 'quest-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.removeItem('magepunk_badges_v1');
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'bulbasaur', name: 'BULBASAUR', nickname: null, level: 12, gender: 'M', ability: 'Overgrow', types: ['Grass', 'Poison'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 34, atk: 18, def: 18, spa: 22, spd: 20, spe: 18 }, maxHP: 34, curHP: 34, exp: 1728, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], num: 1, sprite: 'bulbasaur.png' }]));
		} catch { }
	}, STATE);
	// mark the intro done so the quest starts at gym 1 (not the starter step)
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PewterCity`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.Quest && window.__ow.refreshObjective)), 30000);
	await page.evaluate(() => { window.__ow.Story.setFlag('intro_done'); window.__ow.refreshObjective(); });

	A(await page.evaluate(() => !!window.__ow.Quest), 'Quest is exposed on the live game');

	// #objective HUD line reflects the stage
	const obj = await page.evaluate(() => document.getElementById('objective')?.textContent || '');
	A(/NEXT:/.test(obj) && /BROCK/i.test(obj), 'the #objective HUD line shows the current gym-1 objective', JSON.stringify(obj));

	// corridor gate is live: Cerulean blocked at 0 badges, opens after Brock
	const gate = await page.evaluate(() => {
		const before = window.__ow.Quest.blocked('KANTO', 'CeruleanCity');
		window.__ow.Badges.earn('KANTO', window.__ow.Badges.list('KANTO')[0].id);
		const after = window.__ow.Quest.blocked('KANTO', 'CeruleanCity');
		window.__ow.refreshObjective();
		return { before: !!before, after: !!after, obj: document.getElementById('objective')?.textContent || '' };
	});
	A(gate.before === true, 'live: Cerulean is corridor-blocked at 0 badges');
	A(gate.after === false, 'live: Cerulean opens after earning the Boulder Badge');
	A(/MISTY/i.test(gate.obj), 'the objective advances to gym 2 (MISTY) after the badge', JSON.stringify(gate.obj));

	// QUEST menu + Trainer Card render without throwing
	const render = await page.evaluate(() => {
		try { window.__ow.drawQuest(240, 160); window.__ow.drawTrainerCard(240, 160); return 'ok'; } catch (e) { return 'throw: ' + e.message; }
	});
	A(render === 'ok', 'the QUEST menu + Trainer Card render with the objective', render);
	A(await page.evaluate(() => window.__ow.Quest.log('KANTO')[0].state) === 'done', 'the live quest log marks gym 1 done after the badge');

	const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
	A(fatal.length === 0, 'no uncaught client errors during the run', fatal.slice(0, 4).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message);
	console.error(e);
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
