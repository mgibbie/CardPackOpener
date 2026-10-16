// base_sprites_ingame_test.mjs — the Galar species fight in their real battle art and
// your own Gen-9 mon is drawn from BEHIND, in the real game; the design wiki shows the
// new art on desktop and on a phone.
//
// Covers: overworld/battle.js (loadSprite, drawSide), tools/gen_base_sprites.py, tools/gen_fakemon_sprites.py,
// designwiki/app.js (pokemonDetail), overworld/data/pokemon, designwiki/sprites.
//
// Screenshots (to LOOK at): $SHOTS or overworld/tests/base_sprites_*.png
//   node overworld/tests/base_sprites_ingame_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const SHOTS = process.env.SHOTS || HERE;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8894;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'basesprites', friendCode: 'BSBSBS', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 150)); } return false; }
const bat = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8'));

(async () => {
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	await new Promise(r => server.listen(PORT, r));
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 960, height: 640 });
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', st.username);
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'johto');
			localStorage.setItem('magepunk_name', 'GOLD');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'quilava', name: 'QUILAVA', level: 40, gender: 'M', ability: 'blaze', types: ['Fire'], ivs: { hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 }, stats: { hp: 120, atk: 80, def: 64, spa: 90, spd: 66, spe: 105 }, maxHP: 120, curHP: 120, exp: 64000, num: 156, sprite: 's4992.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
		}, STATE);
		// getImage() serves blob: URLs, so identify an image by its PIXELS
		await page.evaluateOnNewDocument(() => {
			window.__samePixels = async (img, url, flip) => { // flip: compare with the reference MIRRORED
				if (!img || !img.width) return false;
				const ref = new Image(); ref.src = url; await ref.decode();
				if (ref.width !== img.width || ref.height !== img.height) return false;
				const px = (im, f) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); if (f) { x.translate(im.width, 0); x.scale(-1, 1); } x.drawImage(im, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
				const a = px(img), b = px(ref, flip);
				for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
				return true;
			};
		});
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.startWildBattle && window.__ow.player)), 30000);
		A(ready, 'overworld ready');
		if (!ready) throw new Error('no overworld');

		// ---------- battles: (your mon, the wild foe) ----------
		const fights = [['grookey', 'urshifu', 'base_sprites_battle_urshifu.png'], ['sprigatito', 'morpeko', 'base_sprites_battle_morpeko.png'],
			['scorbunny', 'calyrex', 'base_sprites_battle_calyrex.png'],
			['okidogi', 'ogerpon', 'base_sprites_battle_okidogi.png'], // a #1011+ DLC species as your mon: its real back
			// fakemon (tools/gen_fakemon_sprites.py): your Uranium Aotius / Zephy from BEHIND (both were the
			// mirrored front), vs Ransei fakemon in their full-size source art; your CAP Tactite (real back)
			['aotius', 'hydrotaur', 'fakemon_sprites_battle_aotius.png'], ['zephy', 'monstricity', 'fakemon_sprites_battle_zephy.png'],
			['tactite', 'sakurovix', 'fakemon_sprites_battle_tactite.png']];
		for (const [mine, foe, shot] of fights) {
			const bt = await page.evaluate(async (mine, foe, files) => {
				const ow = window.__ow, B = ow.battle, Bmod = await import('/overworld/battle.js');
				ow.party.length = 0;
				ow.party.push(Bmod.buildMon(mine, 30, B.data));
				ow.startWildBattle({ id: foe, level: 30 });
				for (let i = 0; i < 100 && !B.active; i++) await new Promise(r => setTimeout(r, 50));
				const a = () => B.active;
				for (let i = 0; i < 300 && a() && a().phase !== 'menu'; i++) {
					const q = a().queue; if (q && q.length) { const e = q.shift(); e.fn?.(); e.anim?.done?.(); } await new Promise(r => setTimeout(r, 20));
				}
				const meImg = a()?.meImg, foeImg = a()?.foeImg, P = f => '/overworld/data/pokemon/' + f;
				return { phase: a()?.phase, me: a()?.me?.speciesId, foe: a()?.foe?.speciesId, foeW: Math.max(foeImg?.width || 0, foeImg?.height || 0),
					meIsBack: await window.__samePixels(meImg, P(files.myBack)), meIsFront: await window.__samePixels(meImg, P(files.myFront)), meIsMirroredFront: await window.__samePixels(meImg, P(files.myFront), true),
					foeIsFront: await window.__samePixels(foeImg, P(files.foeFront)) };
			}, mine, foe, { myBack: bat[mine].sprite.replace('.png', '-b.png'), myFront: bat[mine].sprite, foeFront: bat[foe].sprite });
			A(bt.me === mine && bt.foe === foe, `battle: your ${mine} vs a wild ${foe}`, JSON.stringify(bt));
			A(bt.foeIsFront && bt.foeW >= 40, `the wild ${foe} is drawn with its full-size front (${bat[foe].sprite}, ${bt.foeW}px, not the old icon)`, JSON.stringify(bt));
			A(bt.meIsBack && !bt.meIsFront, `your ${mine} is drawn with its BACK sprite`, JSON.stringify(bt));
			if (!(bat[mine].num > 0)) A(!bt.meIsMirroredFront, `your fakemon ${mine}'s back is a real back view, not its front mirrored`, JSON.stringify(bt));
			await new Promise(r => setTimeout(r, 400));
			await page.screenshot({ path: path.join(SHOTS, shot) });
			await page.evaluate(() => { const B = window.__ow.battle; if (B.active) B.active = null; });
			await new Promise(r => setTimeout(r, 300));
		}
		await page.close();

		// ---------- the design wiki's species page (desktop + phone) ----------
		for (const [label, vp] of [['desktop', { width: 1200, height: 800 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
			const wp = await browser.newPage();
			await wp.setViewport(vp);
			await wp.goto(`http://localhost:${PORT}/designwiki/index.html#/pokemon/urshifu`, { waitUntil: 'domcontentloaded' });
			const got = await waitFor(() => wp.evaluate(() => { const i = document.querySelector('#content img.sprite, img.sprite'); return !!(i && i.complete && i.naturalWidth); }), 15000);
			const w = await wp.evaluate(() => { const i = document.querySelector('#content img.sprite, img.sprite'); return { src: i?.getAttribute('src') || '', nw: i?.naturalWidth || 0, h1: document.querySelector('h1')?.textContent || '' }; });
			A(got && w.src === 'sprites/' + bat.urshifu.sprite && w.nw >= 60, `wiki (${label}): Urshifu's page shows the new sprite, loaded at full size`, JSON.stringify(w));
			await wp.screenshot({ path: path.join(SHOTS, `base_sprites_wiki_${label}.png`) });
			await wp.close();
		}
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
