// bgm_test.mjs — accurate per-map music + the BGM/SFX split (upscale Batch 3's
// music item, built on user order).
//
//   * every map's decomp music constant resolves through music_map.json to a
//     real transcoded track (tools/gen_bgm.mjs; Crystal by music-ID alignment,
//     FR/Emerald by internal-sequence-name-pinned titles)
//   * PROVENANCE matters: MUS_GAME_CORNER is a different song in FireRed than
//     in Emerald — Celadon's corner must get the Kanto track, Mauville's the
//     Hoenn one
//   * the engine plays one looping track, never restarting when two maps share
//     a song; the first user gesture unsticks autoplay-blocked audio
//   * Settings grows SEPARATE sliders: MUSIC (BGM) and SOUND FX, with the old
//     single 'sound' option migrated so nobody's preference is lost
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/bgm_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- the map -> track table and the files behind it ----------
{
	const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/music_map.json'), 'utf8'));
	const bgmDir = path.join(ROOT, 'overworld/data/sounds/bgm');
	const have = new Set(fs.readdirSync(bgmDir).filter(f => f.endsWith('.ogg')).map(f => f.slice(0, -4)));
	A(Object.keys(map).length > 1600, `${Object.keys(map).length} maps carry a track`);
	const missing = [...new Set(Object.values(map))].filter(k => !have.has(k));
	A(missing.length === 0, `every referenced track file exists (${have.size} files)`, missing.slice(0, 5).join(', '));
	const small = [...have].filter(k => fs.statSync(path.join(bgmDir, k + '.ogg')).size < 30000);
	A(small.length === 0, 'no truncated audio files', small.slice(0, 5).join(', '));

	// the provenance proof: the SAME constant, two different songs
	A(map.MAP_CELADON_CITY_GAME_CORNER === 'firered_MUS_GAME_CORNER'
		&& map.MAP_MAUVILLE_CITY_GAME_CORNER === 'emerald_MUS_GAME_CORNER',
		'MUS_GAME_CORNER resolves per game — Kanto and Hoenn corners differ',
		JSON.stringify([map.MAP_CELADON_CITY_GAME_CORNER, map.MAP_MAUVILLE_CITY_GAME_CORNER]));
	A(map.MAP_PALLET_TOWN === 'firered_MUS_PALLET', 'Pallet Town plays FireRed Pallet', map.MAP_PALLET_TOWN);
	A(map.MAP_LITTLEROOT_TOWN === 'emerald_MUS_LITTLEROOT', 'Littleroot plays Emerald Littleroot', map.MAP_LITTLEROOT_TOWN);
	A(map.MAP_NEW_BARK_TOWN === 'crystal_MUSIC_NEW_BARK_TOWN', 'New Bark plays Crystal New Bark', map.MAP_NEW_BARK_TOWN);
	A(map.MAP_ROUTE118 === 'emerald_MUS_ROUTE110', "Route 118's split-music special resolves to its west half", map.MAP_ROUTE118);
	A(map.MAP_KANTO_VICTORY_ROAD_1F === 'firered_MUS_MT_MOON', 'the de-dup-renamed Kanto Victory Road keeps its FR track', map.MAP_KANTO_VICTORY_ROAD_1F);
	A(map.MAP_BATTLE_TOWER_OUTSIDE === 'crystal_MUSIC_BATTLE_TOWER_THEME' || !('MAP_BATTLE_TOWER_OUTSIDE' in map)
		, 'Crystal ID-alignment holds where checkable', map.MAP_BATTLE_TOWER_OUTSIDE);
}

// ---------- the engine + settings, in source ----------
{
	const snd = fs.readFileSync(path.join(ROOT, 'overworld/sound.js'), 'utf8');
	A(/if \(\(key \|\| null\) === bgmKey\) \{ bgmKick\(\); return; \}/.test(snd),
		'crossing into a map with the SAME song never restarts it');
	A(/bgmEl\.loop = true/.test(snd) && /addEventListener\('pointerdown', bgmKick\)/.test(snd),
		'tracks loop, and the first gesture unsticks autoplay-blocked audio');
	const st = fs.readFileSync(path.join(ROOT, 'overworld/settings.js'), 'utf8');
	A(/bgmVol: \{ label: 'MUSIC \(BGM\)'/.test(st) && /sfxVol: \{ label: 'SOUND FX'/.test(st),
		'Settings carries separate MUSIC and SOUND FX sliders');
	A(/d\.sound != null && d\.sfxVol == null/.test(st), "the legacy single 'sound' option migrates");
	const main = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/'textSpeed', 'bgmVol', 'sfxVol'/.test(main), 'the sliders are in the options menu');
	A((main.match(/syncMapBgm\(\);/g) || []).length >= 2, 'both map-entry paths (transition + boot) retune the music');
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
	const PORT = 8953;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 120, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 120, curHP: 120,
		exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
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
			// a legacy save with the old single knob at LOW
			localStorage.setItem('magepunk_settings', JSON.stringify({ sound: 'low' }));
			localStorage.removeItem('magepunk_story');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		await page.evaluate(() => {
			window.__until = async (fn, ms = 10000) => {
				const t = Date.now();
				while (Date.now() - t < ms) { if (fn()) return true; await new Promise(r => setTimeout(r, 80)); }
				return fn();
			};
		});

		const live = await page.evaluate(async () => {
			const ow = window.__ow;
			const out = {};
			await window.__until(() => ow.musicMap && ow.bgmNow());
			out.newBark = ow.bgmNow();
			// a Johto route: different Crystal track
			await ow.moveToMap('Route29');
			await window.__until(() => ow.bgmNow() !== out.newBark);
			out.route29 = ow.bgmNow();
			// hop regions: Hoenn plays Emerald music
			await ow.moveToMap('LittlerootTown');
			await window.__until(() => /emerald/.test(ow.bgmNow() || ''));
			out.littleroot = ow.bgmNow();
			// the legacy 'sound: low' knob became both sliders
			out.sfxVol = ow.Settings.get('sfxVol');
			out.bgmVol = ow.Settings.get('bgmVol');
			out.bgmMult = ow.Settings.bgmMult();
			// slider to zero pauses; back up resumes (state flips even with autoplay blocked)
			ow.Settings.set('bgmVol', 0);
			out.mutedMult = ow.Settings.bgmMult();
			return out;
		});
		A(live.newBark === 'crystal_MUSIC_NEW_BARK_TOWN', 'New Bark boots into its Crystal theme', JSON.stringify(live.newBark));
		A(live.route29 === 'crystal_MUSIC_ROUTE_29', 'Route 29 switches to the road theme', JSON.stringify(live.route29));
		A(live.littleroot === 'emerald_MUS_LITTLEROOT', 'crossing regions swaps to Emerald music', JSON.stringify(live.littleroot));
		A(live.sfxVol === 40 && live.bgmVol === 40, "the legacy 'low' knob migrated into both sliders", JSON.stringify(live));
		A(live.bgmMult === 0.4 && live.mutedMult === 0, 'the BGM slider drives its own multiplier', JSON.stringify(live));

		// the served audio is real: fetch one track through the same origin
		const audio = await page.evaluate(async () => {
			const r = await fetch('data/sounds/bgm/crystal_MUSIC_NEW_BARK_TOWN.ogg');
			const b = r.ok ? await r.arrayBuffer() : null;
			return { ok: r.ok, bytes: b ? b.byteLength : 0 };
		});
		A(audio.ok && audio.bytes > 100000, 'the New Bark track serves as real audio', JSON.stringify(audio));

		// ---------- battle themes + surf/bike overrides ----------
		const themes = await page.evaluate(async () => {
			const ow = window.__ow; const b = ow.battle;
			const out = {};
			// currently standing in Littleroot (emerald): classification is pure
			out.game = ow.bgmGame();
			out.champion = ow.battleThemeKey({ isTrainer: true, info: { displayName: 'Champion Steven' } });
			out.elite = ow.battleThemeKey({ isTrainer: true, info: { displayName: 'Elite Four Phoebe' } });
			out.grunt = ow.battleThemeKey({ isTrainer: true, info: { displayName: 'Team Aqua Grunt' } });
			out.evilboss = ow.battleThemeKey({ isTrainer: true, info: { displayName: 'Aqua Leader Archie' } });
			out.gym = ow.battleThemeKey({ isTrainer: true, info: { displayName: 'Leader Roxanne' } });
			out.plain = ow.battleThemeKey({ isTrainer: true, info: { displayName: 'Youngster Timmy' } });
			b.themeHint = 'regi';
			out.regi = ow.battleThemeKey({ isTrainer: false });
			b.themeHint = null;
			// a REAL wild battle flips the live track, and its end restores the map's
			const done = new Promise(res => b.start(ow.party, 'zigzagoon', 5, r => res(r)));
			for (let i = 0; i < 300; i++) { const a = b.active; if (a && (a.phase === 'choose' || a.phase === 'menu')) break; await new Promise(r => setTimeout(r, 60)); }
			await window.__until(() => /VS_WILD/.test(ow.bgmNow() || ''));
			out.duringBattle = ow.bgmNow();
			b.finish('ran'); await done;
			await window.__until(() => ow.bgmNow() === 'emerald_MUS_LITTLEROOT');
			out.afterBattle = ow.bgmNow();
			// surf + bike overrides, and the dismount restore
			ow.player.surfing = true;
			await window.__until(() => /SURF/.test(ow.bgmNow() || ''));
			out.surf = ow.bgmNow();
			ow.player.surfing = false; ow.player.biking = true;
			await window.__until(() => /CYCLING/.test(ow.bgmNow() || ''));
			out.bike = ow.bgmNow();
			ow.player.biking = false;
			await window.__until(() => ow.bgmNow() === 'emerald_MUS_LITTLEROOT');
			out.dismount = ow.bgmNow();
			// JohKanto gets Crystal's separate KANTO battle set
			const jkId = Object.keys(ow.musicMap).find(k => k.startsWith('MAP_JOHKANTO'));
			await ow.moveToMap(ow.world.fileFor(jkId));
			out.jkWild = ow.battleThemeKey({ isTrainer: false });
			out.jkTrainer = ow.battleThemeKey({ isTrainer: true, info: { displayName: 'Youngster Joey' } });
			return out;
		});
		A(themes.game === 'emerald' && themes.champion === 'emerald_MUS_VS_CHAMPION'
			&& themes.elite === 'emerald_MUS_VS_ELITE_FOUR' && themes.gym === 'emerald_MUS_VS_GYM_LEADER',
			'bosses get their boss themes',
			JSON.stringify({ game: themes.game, champion: themes.champion, elite: themes.elite, gym: themes.gym }));
		A(themes.grunt === 'emerald_MUS_VS_AQUA_MAGMA' && themes.evilboss === 'emerald_MUS_VS_AQUA_MAGMA_LEADER'
			&& themes.plain === 'emerald_MUS_VS_TRAINER',
			'evil teams, their leaders, and plain trainers all differ', JSON.stringify([themes.grunt, themes.evilboss]));
		A(themes.regi === 'emerald_MUS_VS_REGI', 'the Regi trio get their own battle theme', themes.regi);
		A(themes.duringBattle === 'emerald_MUS_VS_WILD' && themes.afterBattle === 'emerald_MUS_LITTLEROOT',
			'a live wild battle swaps the track in and the map music returns after', JSON.stringify([themes.duringBattle, themes.afterBattle]));
		A(themes.surf === 'emerald_MUS_SURF' && themes.bike === 'emerald_MUS_CYCLING' && themes.dismount === 'emerald_MUS_LITTLEROOT',
			'surf and bike override the map, dismount restores it', JSON.stringify([themes.surf, themes.bike]));
		A(themes.jkWild === 'crystal_MUSIC_KANTO_WILD_BATTLE' && themes.jkTrainer === 'crystal_MUSIC_KANTO_TRAINER_BATTLE',
			"JohKanto uses Crystal's separate KANTO battle set", JSON.stringify([themes.jkWild, themes.jkTrainer]));

		// every theme key BATTLE_THEMES references exists as a real file
		{
			const main = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
			const bgmDir = path.join(ROOT, 'overworld/data/sounds/bgm');
			const refs = [...new Set([...main.matchAll(/'((?:crystal|firered|emerald)_MUS\w+)'/g)].map(m => m[1]))];
			const gone = refs.filter(k => !fs.existsSync(path.join(bgmDir, k + '.ogg')));
			A(refs.length > 30 && gone.length === 0,
				`all ${refs.length} theme keys in BATTLE_THEMES have real files`, gone.slice(0, 4).join(', '));
		}

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
