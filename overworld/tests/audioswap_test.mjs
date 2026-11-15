// audioswap_test.mjs — the owner's AUDIO SWAPS (site/audioswap.js, /audioswap/, server tuning-save kind 'audio').
// The owner, 2026-11-15: "a new developer tool that will only be active on the mgibbie account that will let me swap
// audio tracks for anywhere that audio is placed in any of the games".
//   * the table: a place with no swap plays the game's own; "-" is silence; the list the page offers is up to date
//   * the server: only the owner saves it; anybody reads it; nothing but short "<kind>:<id>" -> name entries gets in
//   * the page: a stranger is locked out; the owner sees every game's places, swaps one, saves, and it is on the server
//   * the overworld plays by it: a map's music, a battle theme, a track everywhere, silence; and gives it back
//   * Micatro's music loop takes an overworld track
//   node overworld/tests/audioswap_test.mjs
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9947, BASE = `http://localhost:${PORT}`;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = (action, body = {}, token) => fetch(BASE + '/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }).then(r => r.json());
async function tokenFor(username, password) { let r = await api('register', { username, password }); if (!r.token) r = await api('login', { username, password }); if (!r.token) throw new Error(username + ' auth failed: ' + JSON.stringify(r)); return r.token; }
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(150); } return false; }

// ===== 1. the table =====
{
	const S = await import(pathToFileURL(path.join(ROOT, 'site/audioswap.js')).href);
	A(S.pick('ow.map', 'MAP_X', 'own') === 'own' && !S.has('ow.map', 'MAP_X'), 'a place with no swap plays the game\'s own');
	S.setLocal({ 'ow.map:MAP_X': 'other', 'ow.sfx:select': '-', 'bad:1': 5 });
	A(S.pick('ow.map', 'MAP_X', 'own') === 'other' && S.pick('ow.sfx', 'select', 'select') === null && Object.keys(S.SWAPS).length === 2, 'a swap answers for its place; "-" is silence; an entry that is not a name is dropped', S.SWAPS);
	S.setLocal({});
	A(S.pick('ow.map', 'MAP_X', 'own') === 'own', 'clearing the table gives every place back');
	const chk = spawnSync(process.execPath, [path.join(ROOT, 'tools/gen_audio_index.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
	A(chk.status === 0, 'the list the page offers (audioswap/audio_index.json) is up to date with the games', chk.stderr);
	const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'audioswap/audio_index.json'), 'utf8'));
	A(idx.ow.bgm.length >= 160 && idx.ow.sfx.length >= 25 && idx.mt.sounds.length >= 45 && idx.ms.music.length >= 7 && idx.ms.sfx.length >= 25 && idx.bc.sfx.length >= 20, 'it lists every game\'s tracks and sounds', { bgm: idx.ow.bgm.length, sfx: idx.ow.sfx.length, mt: idx.mt.sounds.length, ms: [idx.ms.music.length, idx.ms.sfx.length], bc: idx.bc.sfx.length });
}

const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'audioswap-')), 'users.sqlite');
const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile } });
let browser;
try {
	A(await waitFor(() => fetch(BASE + '/audioswap/').then(r => r.ok), 20000), 'dev server is up');
	const owner = await tokenFor('mgibbie', 'localdev1'), peon = await tokenFor('audiopeon', 'localdev1');

	// ===== 2. the server =====
	const good = { 'ow.map:MAP_NEW_BARK_TOWN': 'crystal_MUSIC_ROUTE_29', 'mt.music:base': '/overworld/data/sounds/bgm/emerald_MUS_SURF.ogg', 'ow.sfx:select': '-' };
	A((await api('tuning-save', { kind: 'audio', content: good }, peon)).error === 'owner only', 'somebody else cannot save swaps');
	A((await api('tuning-save', { kind: 'audio', content: good })).error, 'nor can a visitor who is not signed in');
	const bad = [{ 'ow.map:MAP_X': 5 }, { 'nokind': 'x' }, { 'ow.map:MAP_X': 'https://evil.example/a.ogg' }, { 'ow.map:MAP_X': '/a/../../secret.ogg' }, { 'ow.map:MAP_X': '<script>' }, { 'ow.map:MAP_X': 'x'.repeat(200) }];
	const refused = []; for (const b of bad) refused.push((await api('tuning-save', { kind: 'audio', content: b }, owner)).error || null);
	A(refused.every((e) => e === 'bad swap'), 'the owner\'s table takes only short names and files on this site (a number, a keyless entry, another site, "..", markup, a long value are refused)', refused);
	A((await api('tuning-get')).audio == null, 'and a refused save leaves nothing behind');
	const ok = await api('tuning-save', { kind: 'audio', content: good }, owner);
	const got = await api('tuning-get');
	A(ok.ok && ok.count === 3 && JSON.stringify(got.audio) === JSON.stringify(good), 'the owner saves it, and anybody (no sign-in) reads it back', { ok, got: got.audio });
	A((await api('tuning-save', { kind: 'audio', content: {} }, owner)).ok && (await api('tuning-get')).audio == null, 'saving an empty table clears it');

	// ===== 3. the page =====
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'] });
	const seed = async (ctx, token, username, extra) => { const page = await ctx.newPage(); await page.evaluateOnNewDocument((t, u, x) => { try { if (t) localStorage.setItem('magepunk_mp_token_v1', t); if (u) localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: u })); for (const [k, v] of Object.entries(x || {})) localStorage.setItem(k, v); } catch { } }, token, username, extra || null); return page; };
	const pctx = await browser.createBrowserContext(), pp = await seed(pctx, peon, 'audiopeon');
	await pp.goto(BASE + '/audioswap/', { waitUntil: 'networkidle2', timeout: 30000 });
	A(await waitFor(() => pp.evaluate(() => document.body.textContent.includes('owner tool') && !document.getElementById('list')), 8000), 'somebody else gets the lock screen, and none of the tool');
	await pctx.close();
	const hctx = await browser.createBrowserContext(), hp = await seed(hctx, peon, 'audiopeon');
	await hp.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 }); await sleep(600);
	A(await hp.evaluate(() => document.getElementById('tile-audioswap').hidden === true), 'its tile on the home page is hidden from them');
	await hctx.close();

	const page = await seed(browser.defaultBrowserContext(), owner, 'mgibbie'), errors = [];
	page.on('pageerror', e => errors.push(e.message));
	await page.goto(BASE + '/audioswap/', { waitUntil: 'networkidle2', timeout: 30000 });
	A(await waitFor(() => page.evaluate(() => !!window.__audioswap), 15000), 'the owner gets the tool');
	const tabs = await page.evaluate(() => window.__audioswap.tabs());
	const byName = (re) => tabs.find((t) => re.test(t.name));
	A(tabs.length === 7 && byName(/map music/).rows > 1600 && byName(/battle/).rows >= 40 && byName(/tracks everywhere/).rows >= 160 && byName(/sound effects/).rows >= 25 && byName(/Micatro/).rows >= 47 && byName(/MicaSurvivor/).rows >= 32 && byName(/Battlecards/).rows >= 20,
		'it lists the places of every game: the overworld\'s maps, battle and field themes, tracks and effects; Micatro, Scoundrel and Pair of Pears; MicaSurvivor; Battlecards', tabs);
	const edit = await page.evaluate(() => {
		const T = window.__audioswap, out = {};
		out.own = T.row('ow.map:MAP_NEW_BARK_TOWN').own;
		out.wrong = T.set('ow.map:MAP_NEW_BARK_TOWN', 'not_a_track');
		out.set = T.set('ow.map:MAP_NEW_BARK_TOWN', 'crystal_MUSIC_ROUTE_29');
		out.silence = T.set('ow.sfx:' + T.row('ow.sfx:ui_select').own, '(silence)');
		out.same = T.set('ow.theme:emerald.gym', 'emerald_MUS_VS_GYM_LEADER');   // (its own: no swap)
		out.work = T.work(); out.dirty = T.dirty(); out.save = document.getElementById('save').disabled;
		return out;
	});
	A(edit.own === 'crystal_MUSIC_NEW_BARK_TOWN' && edit.wrong === false && edit.set && edit.silence && edit.same && JSON.stringify(edit.work) === JSON.stringify({ 'ow.map:MAP_NEW_BARK_TOWN': 'crystal_MUSIC_ROUTE_29', 'ow.sfx:ui_select': '-' }) && edit.dirty && edit.save === false,
		'a place takes one of its choices or silence, not something else; choosing its own track is no swap; Save lights up', edit);
	await page.evaluate(() => { const T = window.__audioswap; T.go(1); document.getElementById('q').value = 'new bark town'; document.getElementById('q').dispatchEvent(new Event('input')); });
	const typedIn = await page.evaluate(() => { const r = document.querySelector('.row[data-k="ow.map:MAP_NEW_BARK_TOWN"] input.to'); return r && r.value; });
	A(typedIn === 'crystal_MUSIC_ROUTE_29', 'the filter finds the map, with its swap in the box', typedIn);
	await page.click('#save');
	A(await waitFor(() => page.evaluate(() => !window.__audioswap.dirty() && /Saved/.test(document.getElementById('status').textContent)), 10000), 'Save sends it');
	const after = await api('tuning-get');
	A(after.audio && after.audio['ow.map:MAP_NEW_BARK_TOWN'] === 'crystal_MUSIC_ROUTE_29' && after.audio['ow.sfx:ui_select'] === '-' && Object.keys(after.audio).length === 2, 'and it is on the server for everybody', after.audio);
	A(errors.length === 0, 'the page raised no error', errors.slice(0, 3));

	// ===== 4. the overworld plays by it =====
	const PARTY = [{ speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 120, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 120, curHP: 120, exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19 }];
	const gctx = await browser.createBrowserContext();
	const game = await seed(gctx, owner, 'mgibbie', { magepunk_party_v1: JSON.stringify(PARTY), magepunk_region: 'JOHTO' });
	await game.goto(BASE + '/overworld/index.html?map=NewBarkTown', { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => game.evaluate(() => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.musicMap)), 60000), 'the overworld boots (a fresh browser: the table comes from the server)');
	const until = (fn, ms) => waitFor(() => game.evaluate(fn), ms || 10000);
	A(await until(() => window.__ow.bgmNow() === 'crystal_MUSIC_ROUTE_29'), 'New Bark Town plays the track the owner chose for it', await game.evaluate(() => window.__ow.bgmNow()));
	const th = await game.evaluate(async () => {
		const ow = window.__ow, S = window.AudioSwap, out = {}, npc = { isTrainer: true, info: { displayName: 'Leader Falkner' } };
		const tick = async (want) => { const t = Date.now(); while (Date.now() - t < 6000) { ow.syncMapBgm(); if (ow.bgmNow() === want) return true; await new Promise((r) => setTimeout(r, 60)); } return ow.bgmNow(); };
		out.gymOwn = ow.battleThemeKey(npc);
		S.setLocal({ 'ow.theme:crystal.gym': 'crystal_MUSIC_CHAMPION_BATTLE' });
		out.gymSwapped = ow.battleThemeKey(npc); out.trainerUntouched = ow.battleThemeKey({ isTrainer: true, info: { displayName: 'Youngster Joey' } });
		out.back = await tick('crystal_MUSIC_NEW_BARK_TOWN');                       // (the map's swap is gone from the table: its own again)
		S.setLocal({ 'ow.bgm:crystal_MUSIC_NEW_BARK_TOWN': 'emerald_MUS_SURF' });
		out.everywhere = await tick('emerald_MUS_SURF');                             // (a track, wherever it plays)
		S.setLocal({ 'ow.map:MAP_NEW_BARK_TOWN': 'firered_MUS_SURF', 'ow.bgm:crystal_MUSIC_NEW_BARK_TOWN': 'emerald_MUS_SURF' });
		out.placeFirst = await tick('firered_MUS_SURF');                             // (the place first)
		S.setLocal({ 'ow.map:MAP_NEW_BARK_TOWN': '-' });
		out.silent = await tick(null);
		S.setLocal({}); out.own = await tick('crystal_MUSIC_NEW_BARK_TOWN');
		return out;
	});
	A(th.gymOwn === 'crystal_MUSIC_JOHTO_GYM_LEADER_BATTLE' && th.gymSwapped === 'crystal_MUSIC_CHAMPION_BATTLE' && th.trainerUntouched === 'crystal_MUSIC_JOHTO_TRAINER_BATTLE', 'a battle theme is swapped for its role alone (the Gym Leader\'s, not a trainer\'s)', th);
	A(th.back === true && th.everywhere === true && th.placeFirst === true, 'a track is swapped wherever it plays; a place\'s own swap comes first', th);
	A(th.silent === true && th.own === true, 'a place can be silent; and with the table cleared the map plays its own again', th);
	await gctx.close();

	// ===== 5. Micatro's music =====
	const mctx = await browser.createBrowserContext(), mp = await seed(mctx, owner, 'mgibbie');
	await mp.goto(BASE + '/audioswap/', { waitUntil: 'domcontentloaded' });
	const mus = await mp.evaluate(async () => {
		const { sound } = await import('/micatro/js/ui/sound.js'), S = window.AudioSwap || (await import('/site/audioswap.js'));
		S.setLocal({ 'mt.music:base': '/overworld/data/sounds/bgm/emerald_MUS_SURF.ogg' }); sound.unlocked = true; sound.startMusic(); const a = sound.musicEl && sound.musicEl.dataset.src;
		S.setLocal({}); sound.startMusic(); const b = sound.musicEl && sound.musicEl.dataset.src;
		S.setLocal({ 'mt.music:base': '-' }); sound.startMusic(); const c = sound.musicEl ? sound.musicEl.paused : true;
		return { a, b, c };
	});
	A(mus.a === '/overworld/data/sounds/bgm/emerald_MUS_SURF.ogg' && /music1\.ogg$/.test(mus.b || '') && mus.c === true, 'Micatro\'s music loop takes an overworld track, goes back to its own, and can be silent', mus);
	await mctx.close();
} finally {
	if (browser) await browser.close();
	server.kill();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
