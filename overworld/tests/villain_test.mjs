// villain_test.mjs — the evil-team arcs woven into the quest. Part 1 (pure node):
// each required beat surfaces as the objective in place of the gym it gates, seals
// that gym/League until its doneFlag, then reverts to the gym once done; every boss
// team's species resolves. Part 2 (headless): entering a beat's location fires the
// boss cutscene + battle, and setting the doneFlag opens the gated map + advances
// the objective through the real main.js wiring.
//
// Standalone (Part 2 needs headless Chrome + puppeteer-core + local data); NOT in
// run-all.   node overworld/tests/villain_test.mjs
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
const PORT = 8880;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const reset = () => { Badges._reset(); Story.resetStory(); };
const earnN = (region, k) => { for (let i = 0; i < k; i++) Badges.earn(region, Badges.list(region)[i].id); };

// ---------- Part 1: pure-node unit ----------
// every boss-team species resolves against the battle species data
{
	const species = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8'));
	const keys = new Set((Array.isArray(species) ? species.map(s => s.id || s.speciesId || s.name) : Object.keys(species)).map(k => String(k).toLowerCase()));
	const bad = [];
	for (const region of ['KANTO', 'JOHTO', 'HOENN']) for (const b of Quest.VILLAIN_BEATS[region]) for (const e of b.team) if (!keys.has(e.s)) bad.push(`${region}/${b.id}/${e.s}`);
	A(bad.length === 0, 'every villain boss-team species resolves in the battle data', bad.join(', '));
}

// required beat: objective + gate transitions (uses the beat that gates a gym)
const cases = [
	{ region: 'KANTO', badges: 5, gymMap: 'SaffronCity_Gym', beatFlag: 'villain_kanto_silph', keyword: 'SILPH', gymLeader: 'SABRINA' },
	{ region: 'JOHTO', badges: 1, gymMap: 'AzaleaGym', beatFlag: 'villain_johto_slowpoke', keyword: 'SLOWPOKE', gymLeader: 'BUGSY' },
	{ region: 'JOHTO', badges: 6, gymMap: 'MahoganyGym', beatFlag: 'villain_johto_hq', keyword: 'MAHOGANY', gymLeader: 'PRYCE' },
];
for (const c of cases) {
	reset(); Story.setFlag('intro_done'); earnN(c.region, c.badges);
	// the required beat is the objective, and the gym is sealed
	A(Quest.objective(c.region).includes(c.keyword) && !Quest.objective(c.region).includes(c.gymLeader), `[${c.region}@${c.badges}] objective is the villain beat (${c.keyword}), not the gym`, Quest.objective(c.region));
	const b1 = Quest.blocked(c.region, c.gymMap, c.gymMap);
	A(b1 && b1.villain, `[${c.region}] ${c.gymLeader}'s gym is sealed until the villain is beaten`, JSON.stringify(b1));
	// beat the villain -> gym opens, objective reverts to the gym
	Story.setFlag(c.beatFlag);
	A(Quest.blocked(c.region, c.gymMap, c.gymMap) === null, `[${c.region}] the gym opens once the villain doneFlag is set`);
	A(Quest.objective(c.region).includes(c.gymLeader), `[${c.region}] objective reverts to the gym (${c.gymLeader}) after the beat`, Quest.objective(c.region));
}

// HOENN: the Seafloor Cavern beat gates the LEAGUE (all 8 badges + climax)
{
	reset(); Story.setFlag('intro_done'); earnN('HOENN', 8);
	A(Quest.stage('HOENN') === Quest.LEAGUE, 'HOENN with 8 badges is at the LEAGUE stage');
	A(Quest.objective('HOENN').includes('ARCHIE'), 'the League objective is the Seafloor Cavern climax first', Quest.objective('HOENN'));
	const lb = Quest.blocked('HOENN', 'EverGrandeCity', 'Route128');
	A(lb && lb.villain, 'the League (EverGrande) is sealed until the Seafloor climax is done', JSON.stringify(lb));
	Story.setFlag('villain_hoenn_climax');
	A(Quest.blocked('HOENN', 'EverGrandeCity', 'Route128') === null, 'the League opens after the Seafloor climax');
	A(/LEAGUE/.test(Quest.objective('HOENN')), 'the objective becomes the League after the climax', Quest.objective('HOENN'));
}

// beatAt: the encounter fires only at the right location, badge level, and once
{
	reset(); Story.setFlag('intro_done'); earnN('KANTO', 5);
	A(Quest.beatAt('KANTO', 'SilphCo_1F')?.id === 'silph', 'beatAt returns the Silph beat at SilphCo_1F with 5 badges');
	A(Quest.beatAt('KANTO', 'PewterCity') === null, 'beatAt is null on an unrelated map');
	Story.setFlag('villain_kanto_silph');
	A(Quest.beatAt('KANTO', 'SilphCo_1F') === null, 'beatAt is null once the beat is done (one-shot)');
	reset(); Story.setFlag('intro_done'); earnN('KANTO', 4);
	A(Quest.beatAt('KANTO', 'SilphCo_1F') === null, 'beatAt is null before the beat’s afterBadges');
	// the flavor (ungated) beat still fires by location
	A(Quest.beatAt('KANTO', 'RocketHideout_B1F')?.id === 'rocket_hideout', 'the optional Rocket Hideout beat fires at its location');
}
reset();

// ---------- Part 2: headless ----------
const STATE = { username: 'vil', friendCode: 'VILAIN', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
			localStorage.setItem('magepunk_mp_token_v1', 'vil-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'HOENN');
			localStorage.removeItem('magepunk_badges_v1');
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'mudkip', name: 'MUDKIP', nickname: null, level: 45, gender: 'M', ability: 'Torrent', types: ['Water'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 120, atk: 90, def: 80, spa: 80, spd: 80, spe: 70 }, maxHP: 120, curHP: 120, exp: 91125, moves: [{ id: 'surf', name: 'Surf', pp: 15, maxPp: 15 }], num: 258, sprite: 'mudkip.png' }]));
		} catch { }
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=SeafloorCavern_Room1`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.Quest && window.__ow.checkVillainTrigger)), 30000);
	// intro done + all 8 badges so we're at the League stage with the climax pending
	await page.evaluate(() => {
		window.__ow.Story.setFlag('intro_done');
		const B = window.__ow.Badges; for (const b of B.list('HOENN')) B.earn('HOENN', b.id);
		window.__ow.refreshObjective();
	});
	A(await page.evaluate(() => window.__ow.Quest.beatAt('HOENN', 'SeafloorCavern_Room1')?.id) === 'seafloor', 'live: the Seafloor beat is active at its location with 8 badges');
	A(await page.evaluate(() => { const b = window.__ow.Quest.blocked('HOENN', 'EverGrandeCity', 'Route128'); return !!(b && b.villain); }), 'live: the League is villain-sealed before the climax');
	A(/ARCHIE/.test(await page.evaluate(() => window.__ow.Quest.objective('HOENN'))), 'live: the objective is the Seafloor climax');
	A(/ARCHIE|SEAFLOOR|AQUA/i.test(await page.evaluate(() => document.getElementById('objective')?.textContent || '')), 'the #objective HUD line shows the villain climax');

	// entering the location (checkVillainTrigger) fires the boss cutscene, then a battle
	const fired = await page.evaluate(() => { window.__ow.checkVillainTrigger(); const p = window.__ow.dialog?.pages; return { blocking: window.__ow.cutscene.blocking || window.__ow.dialog.blocking, text: p ? p.flat().join(' ') : '' }; });
	A(fired.blocking && /ARCHIE/.test(fired.text), 'entering the cavern fires the ARCHIE confrontation cutscene', JSON.stringify(fired.text));
	const battled = await page.evaluate(async () => { const d = window.__ow.dialog; for (let i = 0; i < 40; i++) { if (window.__ow.battle.blocking) return true; if (d.blocking) d.key('x'); await new Promise(r => setTimeout(r, 40)); } return window.__ow.battle.blocking; });
	A(battled, 'closing the speech starts the ARCHIE boss battle');

	// completing the beat (flag set) opens the League + advances the objective
	const done = await page.evaluate(() => {
		window.__ow.Story.setFlag('villain_hoenn_climax'); window.__ow.refreshObjective();
		return { blocked: window.__ow.Quest.blocked('HOENN', 'EverGrandeCity', 'Route128'), obj: window.__ow.Quest.objective('HOENN') };
	});
	A(done.blocked === null, 'live: the League opens once the climax is done');
	A(/LEAGUE/.test(done.obj), 'live: the objective becomes the League after the climax', done.obj);

	const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
	A(fatal.length === 0, 'no uncaught client errors during the run', fatal.slice(0, 4).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message); console.error(e);
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
