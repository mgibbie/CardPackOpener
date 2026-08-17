// tierreward_test.mjs — Phase-3 spine tuning. Covers:
//   1) per-tier completion REWARD: clearing gym N in the LAST region advances globalTier and
//      grants a one-shot scaling reward (money + items) through onTrainerDefeated,
//   2) the gym-leader LEVEL FLOOR: same-tier gyms are evened out across regions at boot
//      (laggards raised to the per-tier floor; already-strong leaders untouched).
// Headless Chrome + a mock /api/mp.  node overworld/tests/tierreward_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8898;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 120)); } return false; }

const STATE = { username: 'tr', friendCode: 'TIER', decks: [], collection: {}, packs: 0, packInbox: 0, stats: {}, friends: [] };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { let raw = ''; for await (const c of req) raw += c; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, snapshot: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

const PARTY = [{ speciesId: 'pikachu', name: 'PIKACHU', level: 30, gender: 'M', ability: 'Static', types: ['Electric'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 90, atk: 70, def: 55, spa: 75, spd: 70, spe: 100 }, maxHP: 90, curHP: 90, exp: 27000, moves: [{ id: 'thundershock', name: 'Thunder Shock', pp: 30, maxPp: 30 }], num: 25, sprite: 's25.png' }];

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
	await page.evaluateOnNewDocument((st, party) => {
		try {
			localStorage.setItem('magepunk_mp_token_v1', 'tr-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			for (const k of ['magepunk_badges_v1', 'magepunk_story', 'magepunk_money']) localStorage.removeItem(k);
		} catch { }
	}, STATE, PARTY);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PewterCity`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.grantTierReward && window.__ow.applyGymLevelFloors)), 30000);

	// 1: completing a tier across all three regions grants the reward (via onTrainerDefeated)
	const reward = await page.evaluate(() => {
		const ow = window.__ow, B = ow.Badges, S = ow.Story, Bag = ow.Bag;
		B._reset(); S.setFlag('intro_done');
		for (let t = 1; t <= 8; t++) S.clearFlag('tier_reward_' + t);
		B.earn('KANTO', B.list('KANTO')[0].id);   // Kanto gym 1
		B.earn('JOHTO', B.list('JOHTO')[0].id);    // Johto gym 1 -> still globalTier 0 (Hoenn at 0)
		const before = ow.Quest.globalTier(), money0 = Bag.getMoney();
		ow.onTrainerDefeated('RustboroCity_Gym_EventScript_Roxanne', { silent: true }); // Hoenn gym 1 -> tier 1
		const after = ow.Quest.globalTier(), money1 = Bag.getMoney(), flagged = S.getFlag('tier_reward_1');
		const again = ow.grantTierReward(1); // idempotent
		return { before, after, money0, money1, flagged, again };
	});
	A(reward.before === 0 && reward.after === 1, 'globalTier advances to 1 when the third region clears gym 1', `${reward.before}->${reward.after}`);
	A(reward.flagged === true, 'completing the tier grants the tier-1 reward (flag set)');
	A(reward.money1 > reward.money0, 'the tier reward pays out money', `${reward.money0} -> ${reward.money1}`);
	A(reward.again === null, 'the tier reward is one-shot (a second grant returns null)');

	// 2: the gym-leader level floor evened out same-tier difficulty (applied at boot)
	const floors = await page.evaluate(() => {
		const ros = window.__ow.trainers.data.rosters;
		const maxByName = (nm) => {
			let best = 0;
			for (const [k, v] of Object.entries(ros)) {
				if (!/Gym Leader/i.test(v.class || '') || /johkanto/i.test(k)) continue;
				if ((v.name || '').toUpperCase().replace(/\s+/g, ' ').trim() !== nm) continue;
				best = Math.max(best, Math.max(...(v.party || []).map(p => p.l | 0)));
			}
			return best;
		};
		return { falkner: maxByName('FALKNER'), whitney: maxByName('WHITNEY'), pryce: maxByName('PRYCE'), blaine: maxByName('BLAINE'), floor: window.__ow.TIER_LEVEL_FLOOR };
	});
	A(floors.falkner >= 14, 'Falkner (tier 1) is raised to at least the tier-1 floor (14)', 'L' + floors.falkner);
	A(floors.whitney >= 26, 'Whitney (tier 3) is raised to at least the tier-3 floor (26)', 'L' + floors.whitney);
	A(floors.pryce >= 46, 'Pryce (tier 7, a big laggard) is raised to the tier-7 floor (46)', 'L' + floors.pryce);
	A(floors.blaine >= 47, 'Blaine (tier 7, already strong) is not lowered by the floor', 'L' + floors.blaine);

	const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
	A(fatal.length === 0, 'no uncaught client errors', fatal.slice(0, 4).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message); console.error(e);
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
