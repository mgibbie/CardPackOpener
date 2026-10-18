// designwiki_micasurvivor_test.mjs — the design wiki's MicaSurvivor section (designwiki/app.js
// micasurvivorRoute + micasurvivor*View, designwiki/style.css .ms-*, designwiki/index.html nav,
// designwiki/data/micasurvivor.json from tools/micasurvivor/gen_designwiki.mjs).
//   1. micasurvivor.json is exactly what the generator builds from micasurvivor/js/data today
//      (every Pokémon with its ability, starter, move, item, upgrade and the 54 abilities of M5
//      batch 2; English names). On drift, regenerate:
//        node tools/micasurvivor/gen_designwiki.mjs
//   2. Every #/micasurvivor route renders in headless Chrome with no console errors: the overview
//      (how to play, the Pewter Museum cabinet, accounts + leaderboard, the controller table, the
//      credits / PolyForm Noncommercial notice, the Game modes of M5 batch 6), all 966 Pokémon with their ability (+ the filter,
//      also by ability), the abilities list, every move, every
//      item and upgrade; the sidebar links them; the phone layout (390 px) has no horizontal overflow.
//   node overworld/tests/designwiki_micasurvivor_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9521;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

// ---------- 1. data parity (node only)
const { build } = await import(pathToFileURL(path.join(ROOT, 'tools/micasurvivor/gen_designwiki.mjs')).href);
const fresh = build();
const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'designwiki/data/micasurvivor.json'), 'utf8'));
A(JSON.stringify(fresh) === JSON.stringify(W), 'micasurvivor.json matches the game data', 'regen: node tools/micasurvivor/gen_designwiki.mjs');
A(W.pokemon.length === 966 && W.counts.pokemon === 966 && W.starters.length === 29 && W.moves.length >= 60 && W.items.length >= 10 && W.upgrades.length >= 10, 'counts: 966 Pokémon, 29 starters, the moves, items and upgrades', JSON.stringify(W.counts));
A(W.moves.find(m => m.id === 'ember')?.name === 'Ember' && W.items.find(i => i.id === 'leftovers')?.name === 'Leftovers' && W.upgrades.find(u => u.id === 'hp')?.name === 'Vitality', 'names are in English (the game translates from Spanish)');
A(W.moves.find(m => m.id === 'flamethrower')?.evo?.name === 'Overheat', 'move evolutions are listed (Flamethrower -> Overheat)');
// MicaSurvivor M5 batch 3: 26 items (15 from the Android port) and 17 upgrades (+Caliber, TM, Second Chance, Backpack)
A(W.counts.items === 26 && W.counts.upgrades === 17 && W.items.find(i => i.id === 'lightball')?.only?.join() === 'Pichu,Pikachu,Raichu' && W.items.find(i => i.id === 'rarecandy')?.instant && JSON.stringify(W.upgrades.find(u => u.id === 'size')?.costs) === '[80,110,160,220,310,430]', 'items + upgrades of M5 batch 3 (species locks, Rare Candy, Caliber prices)', JSON.stringify(W.counts));
// MicaSurvivor M5 batch 2: abilities
const ABI = new Map((W.abilities || []).map(a => [a.id, a]));
A(W.counts.abilities === 54 && ABI.size === 54 && W.abilities.every(a => a.name && a.desc && !/[¡¿ñáíóú]/.test(a.desc.replace(/Poké/g, ''))), '54 abilities, each with an English name and description', JSON.stringify(W.counts));
A(W.pokemon.every(p => ABI.has(p[6])) && W.abilities.reduce((s, a) => s + a.pokemon, 0) === 966, 'every Pokémon has its ability (the counts add up to 966)');
A(W.pokemon.find(p => p[0] === 4)[6] === 'blaze' && ABI.get('blaze').name === 'Blaze' && ABI.get('sturdy').desc === 'A hit that would KO you leaves you at 1 HP (every 90 s).', 'Charmander has Blaze; Sturdy is described with the port\'s numbers');

// MicaSurvivor M5 batch 5: Dynamax + raid dens
A(W.dynrules && W.dynrules.dur === 60 && W.dynrules.minLevel === 20 && W.dynrules.cooldown === 240 && W.dynrules.denRate === 0.05 && W.dynrules.reward.coins === 120 && W.dynrules.status.length === 11, 'Dynamax rules from dynamax.js (60 s, level 20, 240 s, dens 5 %, 120 coins, 11 status types)', JSON.stringify(W.dynrules));
// MicaSurvivor M5 batch 4: the Z-moves
A(W.counts.zmoves === 18 && W.zmoves.length === 18 && W.zmoves[0].name === 'Starlight Dash' && W.zmoves.every(z => z.name && z.desc && z.mission && !/[¡¿ñáíóú]/.test(z.desc + z.mission)) && W.zrules.cooldown === 240 && W.zrules.need === 250, '18 Z-moves in English with their missions and the rules (240 s, 250 kills)', JSON.stringify(W.counts));

// MicaSurvivor M5 batch 6: the quick modes, the 6 modifiers and the level-up ban
const MO = W.modes || {};
A(JSON.stringify((MO.list || []).map(m => m.name)) === JSON.stringify(['Normal run', 'Daily Challenge', 'Boss Rush', 'Party Mode', 'Co-op Mode', 'Floor Tower', 'Rift Time Attack', 'Survival by Type', 'Team Mode']) && (MO.mods || []).length === 6 && MO.mods.every(m => m.name && m.desc && !/[¡¿ñáíóú]/.test(m.desc))
	&& MO.rifts.limit === 480 && MO.coins.daily === 1.25 && MO.coins.type === 0.5 && MO.k.horde === 1.8 && MO.ban.max === 3 && JSON.stringify(MO.ban.costs) === '[300,570,1080]',
	'Game modes from modes.js: 6 modes (+ Team, batch 7; + Boss Rush and Floor Tower, batch 8; + Co-op, batch 12a), 6 modifiers in English, the port numbers (480 s, x1.25, +0.5, horde x1.8) and the ban (Ban upgrade, 3 levels)', JSON.stringify(MO).slice(0, 300));
// MicaSurvivor M5 batch 7: Team mode
A(JSON.stringify(MO.team) === JSON.stringify({ max: 3, minOwned: 2, cooldown: 3, inv: 1, invAuto: 1.5, regen: 0.012 }), 'Team mode from team.js: 3 Pokémon, unlocked with 2, 3 s cooldown, 1 s / 1.5 s invulnerable, 1.2 %/s bench recovery', JSON.stringify(MO.team));
// MicaSurvivor M5 batch 12a: Co-op Mode (the local partner)
A(MO.coop && MO.coop.speed === 118 && MO.coop.follow === 150 && MO.coop.engage === 120 && MO.coop.seek === 240 && MO.coop.leash === 520 && MO.coop.deadzone === 0.22 && MO.coop.dmg === 0.8 && MO.coop.cd === 1.15
	&& MO.coop.lvEvery === 6 && MO.coop.coins === 0.8 && MO.coop.groupMin === 60 && MO.coop.reviveT === 20 && MO.coop.downK === 0.8 && MO.coop.reviveHp === 0.5 && MO.coop.fallback === 'Eevee',
	'Co-op Mode from localcoop.js: speed 118, follow 150 / engage 120 / seek 240, leash 520, 0.22 deadzone, ×0.8 damage, ×1.15 cooldown, -20 % coins, 20 s to revive at half HP', JSON.stringify(MO.coop));
// MicaSurvivor M5 batch 8: Boss Rush and the Floor Tower
A(MO.rush && MO.rush.first === 5 && MO.rush.rest === 8 && MO.rush.legEvery === 3 && MO.rush.biome === 150 && MO.rush.hp.base === 1400 && MO.rush.hp.grow === 1.27, 'Boss Rush from bossrush.js: 5 s, 8 s between bosses, a legendary every third, 150 s biomes, HP 1400 x 1.27^i', JSON.stringify(MO.rush));
A(MO.tower && MO.tower.floors === 30 && MO.tower.bossAt === 50 && MO.tower.maxRisks === 6 && MO.tower.risks.length === 15 && MO.tower.legends.length === 4 && MO.tower.relicsMax === 6 && MO.tower.risks.every(r => r.name && r.desc && !/[¡¿ñáíóú]/.test(r.name + r.desc)) && MO.tower.risks[0].name === 'Frenzy' && MO.tower.legends[0].name === 'Time mastery',
	'the Floor Tower from tower.js: 30 floors, the boss at 50 s, 6 pacts, the 15 risk cards and 4 legendary ones in English, 6 relics', JSON.stringify(MO.tower).slice(0, 300));
// MicaSurvivor M5 batch 9: adaptive difficulty, biome spawns and the support caps
// MicaSurvivor M5 batch 10: the minimap, the field of view and the UI scale
const DP = W.display || {};
A(DP.fov && DP.fov.min === 100 && DP.fov.max === 200 && DP.fov.step === 5 && DP.fov.def === 165 && DP.fov.name === 'Field of view' && DP.ui && DP.ui.min === 60 && DP.ui.max === 140 && DP.ui.def === 100 && DP.ui.name === 'Interface size'
	&& DP.minimap && DP.minimap.size === 200 && DP.minimap.tiles === 48 && DP.minimap.foes === 12 && DP.minimap.name === 'Minimap' && !/[¡¿ñáíóú]/.test(DP.minimap.desc),
	'display from display.js + minimap.js: the port\'s field of view (100-200, 165), Screen size (60-140, 100) and minimap numbers, in English', JSON.stringify(DP).slice(0, 300));
// MicaSurvivor M5 batch 11: achievements, missions, titles, the damage breakdown, the Lexicon and the trainer card
const GO = W.goals || {};
A(GO.achievements && GO.achievements.total === 223 && GO.achievements.types === 54 && JSON.stringify(GO.achievements.cats.map(c => c.key)) === '["coleccion","supervivencia","combate","tipos","grietas","legendarios","modos","otros"]'
	&& GO.achievements.cats[3].name === 'By type' && GO.achievements.bosses.length === 7 && GO.achievements.bosses.find(b => b.id === 'boss1000').title === 'King of bosses'
	&& JSON.stringify(GO.achievements.byType.map(t => t.goal)) === '[250,1000,5000]' && GO.achievements.byType[0].name === 'X-type tracker',
	'goals from achievements.js: 223 achievements, the "By type" category in its place, the 7 boss ones (King of bosses), the per-type tiers 250 / 1,000 / 5,000', JSON.stringify(GO.achievements || {}).slice(0, 300));
A(Array.isArray(GO.missions) && GO.missions.filter(m => m.period === 'daily').length === 17 && GO.missions.filter(m => m.period === 'weekly').length === 13
	&& GO.missions.find(m => m.id === 'mDaily').text === 'Play the Daily Challenge' && GO.missions.find(m => m.id === 'wMods').text === 'Survive 6 / 8 minutes with 3 or more modifiers'
	&& GO.missions.every(m => !/[¡¿ñáíóú]/.test(m.text.replace(/Pokémon/g, ''))),
	'missions from missions.js: 17 daily + 13 weekly, in English (Play the Daily Challenge, Survive 6 / 8 minutes with 3 or more modifiers)', JSON.stringify((GO.missions || []).slice(10, 12)));
A(GO.titles && GO.titles.length === 36 && GO.titles.some(t => t.title === 'Boss executioner') && GO.breakdown && GO.breakdown.map(b => b.name).join('|') === 'Z-Move|Dynamax|Items|Abilities|Status effects|Partner / team|Other (traps, bombs, terrain)'
	&& GO.lexicon && GO.lexicon.tabs.length === 8 && GO.lexicon.tabs[4].name === 'Z-Moves & Dynamax' && GO.lexicon.status.length === 7 && GO.lexicon.status[0].name === 'Frozen' && GO.card && GO.card.length === 9 && GO.card[8] === 'Time played',
	'titles (36), the breakdown rows, the Lexicon tabs and status texts, the trainer card’s 9 cells, in English', JSON.stringify([GO.breakdown, GO.card]));
const DF = W.difficulty || {};
A(DF.adaptive && DF.adaptive.base === 0.62 && DF.adaptive.max === 1.5 && DF.adaptive.min === 0.55 && DF.adaptive.every === 45 && DF.adaptive.setting === 'Adaptive difficulty' && !/[¡¿ñáíóú]/.test(DF.adaptive.desc)
	&& JSON.stringify((DF.biomes || []).map(b => [b.key, b.name, b.types.join('/')])) === JSON.stringify([['forest', 'Shady Forest', 'bug/grass'], ['cave', 'Crystal Cave', 'rock/ground'], ['volcano', 'Ash Volcano', 'fire']])
	&& DF.biomes[1].dex[0] === 'Zubat' && DF.extra === 2 && DF.mul === 1.6 && DF.arenas === 18 && DF.support.minions === 20 && DF.support.shieldK === 0.3,
	'difficulty from adaptive.js + enemies.js: the adaptive curve (0.62, 0.55-1.5, 45 s), the 3 biomes in English with their types and own Pokémon, 2 extras x1.6, the support caps', JSON.stringify(DF).slice(0, 300));

// ---------- 2. the pages
const server = http.createServer((req, res) => {
	let u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/favicon.ico') { res.writeHead(204); res.end(); return; }
	if (u.endsWith('/')) u += 'index.html';
	fs.readFile(path.join(ROOT, u), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(u)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
	const page = await browser.newPage();
	await page.setViewport({ width: 1400, height: 900 });
	const errors = [], failed = [];
	page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
	page.on('pageerror', e => errors.push(e.message));
	page.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
	const go = async (route, sel, n) => {
		await page.goto(`http://localhost:${PORT}/designwiki/index.html#/${route}`, { waitUntil: 'networkidle0' });
		const ok = await page.waitForFunction((s, k) => document.querySelectorAll('#content ' + s).length >= k, { timeout: 15000 }, sel, n).then(() => true, () => false);
		const got = await page.$$eval('#content ' + sel, els => els.length);
		A(ok && got === n, `#/${route} renders ${n} × ${sel}`, `got ${got}`);
	};
	const nav = fs.readFileSync(path.join(ROOT, 'designwiki/index.html'), 'utf8');
	A(['#/micasurvivor', '#/micasurvivor/pokemon', '#/micasurvivor/moves', '#/micasurvivor/items'].every(hh => nav.includes(`href="${hh}"`)) && nav.includes('<div class="nav-group">MicaSurvivor</div>'), 'sidebar: a MicaSurvivor group with every page');

	await go('micasurvivor', '.ms-idx', 3);
	const ov = await page.$eval('#content', el => ({ text: el.textContent, play: !!el.querySelector('a[href="/micasurvivor/"]'), art: el.querySelector('img.ms-hero-art')?.naturalWidth || 0, tables: el.querySelectorAll('table').length }));
	A(ov.play && ov.art === 96, 'overview: the play link and the tile art', JSON.stringify({ play: ov.play, art: ov.art }));
	A(/How to play/.test(ov.text) && /Pewter Museum/.test(ov.text) && /best survival time/.test(ov.text) && /Magepunk/.test(ov.text), 'overview: how to play, the Pewter Museum cabinet, accounts + the leaderboard');
	A(/Required Notice: Copyright 2026 JPTER78 \(https:\/\/github\.com\/JPTER78\/pokesurvivor\)/.test(ov.text) && /PolyForm Noncommercial/.test(ov.text) && /CC BY-NC 4\.0/.test(ov.text) && /JayElDragon/.test(ov.text) && /never gets ads, paid items/.test(ov.text), 'overview: credits + the licence notice (Required Notice, PolyForm NC, CC BY-NC, JayElDragon, never sold)');
	A(ov.tables === 13 && /Nintendo/.test(ov.text), 'overview: the modes, pacts, modifiers, biomes, support, display, achievement (2), mission (2) and status tables, the keyboard and controller tables');
	A(/Goals, titles, Lexicon and trainer card/.test(ov.text) && /223 achievements in 8 categories/.test(ov.text) && /King of bosses/.test(ov.text) && /Play the Daily Challenge/.test(ov.text) && /After a run: damage and defeats/.test(ov.text) && /View my trainer card/.test(ov.text)
		&& await page.$$eval('#content .ms-daily tbody tr', r => r.length) === 17 && await page.$$eval('#content .ms-weekly tbody tr', r => r.length) === 13 && await page.$$eval('#content .ms-achcats tbody tr', r => r.length) === 8 && await page.$$eval('#content .ms-status tbody tr', r => r.length) === 7,
		'overview: Goals (8 achievement categories, the boss / per-type table, 17 daily + 13 weekly missions, titles, the damage breakdown, the Lexicon’s 7 statuses, the trainer card; M5 batch 11)');
	A(/Display/.test(ov.text) && /Minimap/.test(ov.text) && /Field of view/.test(ov.text) && /100–200 % in steps of 5 \(165 %\)/.test(ov.text) && /Interface size/.test(ov.text) && /60–140 % in steps of 5 \(100 %\)/.test(ov.text)
		&& await page.$$eval('#content .ms-display tbody tr', r => r.length) === 3, 'overview: Display (the minimap, the field of view 100-200 % and the interface size 60-140 %; M5 batch 10)');
	A(/Game modes/.test(ov.text) && /Rift Time Attack/.test(ov.text) && /8:00 on the clock/.test(ov.text) && /Survival by Type/.test(ov.text) && /Heavy hitters/.test(ov.text) && /Banning a level-up card/.test(ov.text) && /Ban a level-up card/.test(ov.text)
		&& await page.$$eval('#content .ms-modes tbody tr', r => r.length) === 9 && await page.$$eval('#content .ms-mods tbody tr', r => r.length) === 6,
		'overview: Game modes (6 modes, 6 modifiers, the ban, the B key and the controller row; M5 batch 6)');
	A(/Team Mode/.test(ov.text) && /swap them mid-run/.test(ov.text) && /Switch Pokémon \(Team Mode\)/.test(ov.text), 'overview: Team Mode (its row, the Tab key and the controller\'s swap row; M5 batch 7)');
	A(/Co-op Mode/.test(ov.text) && /player 2 moves it with the left stick \(speed 118/.test(ov.text) && /after 20 s it revives you at 50 % HP/.test(ov.text) && /coins ×0\.8 \(−20 %\)/.test(ov.text) && /guests included/.test(ov.text) && !/Log in to Magepunk to use a controller/.test(ov.text),
		'overview: Co-op Mode (its row: the partner, player 2, spectating, -20 % coins) and controllers for guests too (M5 batch 12a)');
	A(/Boss Rush/.test(ov.text) && /Only bosses, one after another: the first after 5 s/.test(ov.text) && /Floor Tower: rest and risk pacts/.test(ov.text) && /Starting floor/.test(ov.text) && /Thirty-five achievements/.test(ov.text)
		&& await page.$$eval('#content .ms-pacts tbody tr', r => r.length) === 19, 'overview: Boss Rush and the Floor Tower rows, the 19-card pacts table, the checkpoints, 35 mode achievements (M5 batch 8)');
	A(/Difficulty and biomes/.test(ov.text) && /Adaptive difficulty/.test(ov.text) && /Challenge: N%/.test(ov.text) && /Biome-themed spawns/.test(ov.text) && /Support Pokémon caps/.test(ov.text)
		&& await page.$$eval('#content .ms-biomes tbody tr', r => r.length) === 3 && await page.$$eval('#content .ms-support tbody tr', r => r.length) === 4,
		'overview: Difficulty and biomes (adaptive difficulty, the Challenge %, the 3-biome table, the 4-row support caps table; M5 batch 9)');
	A(await page.$eval('#sidebar a.active', a => a.getAttribute('href')) === '#/micasurvivor', 'nav: Overview is active');

	await go('micasurvivor/pokemon', '.ms-pokemon tbody tr', 966);
	await go('micasurvivor/pokemon', '.ms-abilities tbody tr', 54);
	A(await page.$$eval('#content .ms-pokemon tbody tr', r => /Blaze/.test(r[3].textContent) && r.every(x => x.querySelector('.ms-ab'))), 'pokemon: every row shows its ability (Charmander: Blaze)');
	A(await page.$$eval('#content .ms-starter', s => s.length) === 29, 'pokemon: the 29 starters');
	await page.type('#content .ms-filter', 'pikachu');
	A(await page.$$eval('#content .ms-pokemon tbody tr', r => r.length === 1 && /Pikachu/.test(r[0].textContent) && /Static/.test(r[0].textContent)), 'pokemon: the filter finds Pikachu (Static)');
	await page.$eval('#content .ms-filter', el => { el.value = ''; el.dispatchEvent(new Event('input')); });
	await page.type('#content .ms-filter', 'dragon');
	const dragons = W.pokemon.filter(p => p[2].includes('dragon') || p[1].toLowerCase().includes('dragon')).length;
	A(await page.$$eval('#content .ms-pokemon tbody tr', r => r.length) === dragons, `pokemon: filtering by type (dragon: ${dragons})`);
	await page.$eval('#content .ms-abilities tbody tr:nth-child(19) a', a => a.click());   // Sturdy
	A(await page.$$eval('#content .ms-pokemon tbody tr', r => r.length) === ABI.get('sturdy').pokemon, `pokemon: clicking an ability's count lists its Pokémon (Sturdy: ${ABI.get('sturdy').pokemon})`);
	await go('micasurvivor/moves', 'tbody tr', W.moves.length + W.zmoves.length + W.dynrules.status.length);
	A(await page.$eval('#content', el => /Overheat/.test(el.textContent) && /Reflexes/.test(el.textContent)), 'moves: evolutions and their stat');
	A(await page.$$eval('#content .ms-zmoves tbody tr', r => r.length) === 18 && await page.$eval('#content', el => /Z-Moves/.test(el.textContent) && /Pyrotechnic Holocaust.*Survive 8 minutes in a run./s.test(el.textContent) && /at most 28 %/.test(el.textContent) && /defeating 250 Pokémon/.test(el.textContent)), 'moves: the 18 Z-moves with their Z-crystal missions and rules (M5 batch 4)');
	A(await page.$$eval('#content .ms-dynamax tbody tr', r => r.length) === 11 && await page.$eval('#content', el => /Dynamax & raid dens/.test(el.textContent) && /for 60 s/.test(el.textContent) && /5 % chance to open a den/.test(el.textContent) && /120 coins/.test(el.textContent) && /paralyses/.test(el.textContent)), 'moves: Dynamax and raid dens with the port numbers and the Max-wave status per type (M5 batch 5)');
	await go('micasurvivor/items', 'tbody tr', W.items.length + W.upgrades.length);
	A(await page.$eval('#content', el => /Light Ball.*Pichu, Pikachu, Raichu/s.test(el.textContent) && /Rare Candy.*takes no slot/s.test(el.textContent) && /Backpack.*7500/s.test(el.textContent) && /Second Chance.*2500 · 5000/s.test(el.textContent) && /TWO with the Backpack/.test(el.textContent)), 'items: who can use the species-locked ones, the Backpack, upgrade prices per level (M5 batch 3)');

	// phone
	await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
	for (const r of ['micasurvivor', 'micasurvivor/pokemon', 'micasurvivor/moves', 'micasurvivor/items']) {
		await page.goto(`http://localhost:${PORT}/designwiki/index.html#/${r}`, { waitUntil: 'networkidle0' });
		await page.waitForFunction(() => document.querySelectorAll('#content table, #content .ms-idx').length > 0, { timeout: 15000 }).catch(() => { });
		const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		A(over <= 1, `phone: #/${r} has no horizontal overflow`, String(over));
	}
	A(errors.length === 0, 'no console errors', errors.slice(0, 5).join(' | '));
	A(failed.length === 0, 'no failed requests', failed.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
