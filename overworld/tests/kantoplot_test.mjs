// kantoplot_test.mjs — batch G (Kanto story pass):
//   • the FireRed set-pieces are ARMED via STORY_SEED (onFrame scenes ignore a
//     value-0 gate until the var is set, so seeding to 0 is what turns them on)
//     while the strand-y ones stay dormant / PLOT_BLOCKED;
//   • the Viridian Mart parcel scene actually plays and hands over the parcel;
//   • malformed `give` symbols recover their item instead of dropping junk
//     (37 of them: Erika's TM19, the Coin Case, the fossils…);
//   • a clerk's `openmart` raises the shop and resumes the script on close.
//   node overworld/tests/kantoplot_test.mjs
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
const PORT = 8870;

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

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) {
		try { if (await fn()) return true; } catch {}
		await new Promise(r => setTimeout(r, 150));
	}
	return false;
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
				localStorage.setItem('magepunk_region', 'KANTO');
			} catch {}
		}, STATE, seedMon);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=ViridianCity_Mart`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.STORY_SEED)), 30000);
		A(ready, 'boot: overworld up in the Viridian Mart');
		if (!ready) throw new Error('boot failed');

		// ---- the seed arms the right scenes and leaves the strand-y ones alone ----
		const seed = await page.evaluate(() => window.__ow.STORY_SEED.KANTO.vars);
		A(seed.VAR_MAP_SCENE_VIRIDIAN_CITY_MART === 0, 'the Oak\'s Parcel scene is armed');
		A(seed.VAR_MAP_SCENE_ONE_ISLAND_POKEMON_CENTER_1F === 0, 'the Celio scene is armed');
		A(seed.VAR_MAP_SCENE_TWO_ISLAND_JOYFUL_GAME_CORNER === 0, 'the Lostelle scene is armed');
		A(seed.VAR_MAP_SCENE_FOUR_ISLAND === 0 && seed.VAR_MAP_SCENE_SIX_ISLAND_POKEMON_CENTER_1F === 0,
			'both rival cameos are armed');
		A(seed.VAR_MAP_SCENE_FIVE_ISLAND_LOST_CAVE_ROOM10 === 1, 'the Lost Cave warp-out stays dormant');
		A(seed.VAR_MAP_SCENE_PALLET_TOWN_OAK === 1, 'the old Pallet Town block is still rested');

		// ---- item-symbol recovery (the transpiler wrote text labels) ----
		const items = await page.evaluate(async () => {
			const E = await import('/overworld/events.js');
			return {
				tm19: E.itemId('CeladonCity_Gym_Text_ReceivedTM19FromErika'),
				coin: E.itemId('CeladonCity_Restaurant_Text_ReceivedCoinCaseFromMan'),
				tm28: E.itemId('CeruleanCity_Text_RecoveredTM28FromGrunt'),
				fossil: E.itemId('MtMoon_B2F_Text_ObtainedDomeFossil'),
				flute: E.itemId('X_Text_ReceivedPokeFluteFromMrFuji'),
				plain: E.itemId('ITEM_POKE_BALL'),
				johto: E.itemId('FULL_HEAL'),
				runtime: E.itemId('VAR_0x8009'),
			};
		});
		A(items.tm19 === 'tm19', "Erika's TM19 recovers from its text label");
		A(items.coin === 'coincase', 'the Coin Case recovers');
		A(items.tm28 === 'tm28', '"Recovered…" phrasing works too');
		A(items.fossil === 'domefossil', '"Obtained…" phrasing works too');
		A(items.flute === 'pokeflute', 'the Poke Flute recovers');
		A(items.plain === 'pokeball', 'plain ITEM_ symbols are unchanged');
		A(items.johto === 'fullheal', 'bare Johto symbols still map');
		A(items.runtime === null, 'a runtime VAR_ item yields null (no junk in the bag)');

		// ---- the parcel scene plays on entry and hands the parcel over ----
		const scene = await waitFor(() => page.evaluate(() =>
			window.__ow.cutscene?.blocking || window.__ow.dialog?.blocking), 12000);
		A(scene, 'the parcel scene fires on entering the mart');
		// drive the dialogue to the end
		for (let i = 0; i < 40; i++) {
			await page.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'z' })));
			await new Promise(r => setTimeout(r, 220));
			const done = await page.evaluate(() => !window.__ow.cutscene?.blocking && !window.__ow.dialog?.blocking);
			if (done) break;
		}
		const after = await page.evaluate(async () => {
			const Story = await import('/overworld/events.js');
			const Bag = await import('/overworld/bag.js');
			return { sceneVar: Story.getVar('VAR_MAP_SCENE_VIRIDIAN_CITY_MART'), parcel: Bag.count('oaksparcel') };
		});
		A(after.sceneVar === 1, 'the scene advanced its own var (one-shot)', JSON.stringify(after));
		A(after.parcel > 0, "OAK'S PARCEL is in the bag", JSON.stringify(after));

		// ---- a clerk's openmart raises the shop and resumes the script ----
		const mart = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.cutscene.stop?.();
			ow.shopMenu.open = false;
			// run a tiny two-op program: openmart then a message
			return new Promise(resolve => {
				let done = false;
				ow.startCutscene([{ op: 'openmart' }, { op: 'msg', text: 'AFTER THE MART' }], () => { done = true; });
				setTimeout(() => {
					const opened = ow.shopMenu.open === true && ow.shopMenu.fromScript === true;
					// close the counter — the script should resume and show the message
					dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
					setTimeout(() => resolve({ opened, resumed: ow.dialog.blocking === true || done }), 400);
				}, 400);
			});
		});
		A(mart.opened, 'openmart raises the shop counter');
		A(mart.resumed, 'closing the counter resumes the clerk\'s script');

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
