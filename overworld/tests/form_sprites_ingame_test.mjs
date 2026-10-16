// form_sprites_ingame_test.mjs — an alternate form LOOKS like itself in the real game:
// a Hisuian Qwilfish (the owner's report) fights with the Hisuian BACK sprite when it
// is your mon, follows you on the HISUIAN walk sheet, and the design wiki's form page
// shows the form's own (loaded, non-broken) art on desktop and on a phone.
//
// Covers: overworld/battle.js (loadSprite), overworld/ow_follower.js (followSheet,
// refreshFollower), designwiki/app.js (pokemonDetail), tools/gen_form_sprites.py,
// overworld/data/pokemon_follow, overworld/data/pokemon (form -b sprites).
//
// Screenshots (to LOOK at): $SHOTS or overworld/tests/form_sprites_*.png
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/form_sprites_ingame_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const SHOTS = process.env.SHOTS || HERE;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8893;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'formsprites', friendCode: 'FSFSFS', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 150)); } return false; }
const bat = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8'));
const FORM = 'qwilfish_hisui', BASE = 'qwilfish';
const FORM_BACK = bat[FORM].sprite.replace('.png', '-b.png'), BASE_BACK = bat[BASE].sprite.replace('.png', '-b.png');

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
			window.__samePixels = async (img, url) => {
				if (!img || !img.width) return false;
				const ref = new Image(); ref.src = url; await ref.decode();
				if (ref.width !== img.width || ref.height !== img.height) return false;
				const px = im => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
				const a = px(img), b = px(ref);
				for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
				return true;
			};
		});
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.startWildBattle && window.__ow.player)), 30000);
		A(ready, 'overworld ready');
		if (!ready) throw new Error('no overworld');

		// ---------- the follower: Hisuian Qwilfish leads, and walks on its own sheet ----------
		await page.evaluate(async (FORM) => {
			const ow = window.__ow, Bmod = await import('/overworld/battle.js');
			ow.Settings?.set?.('followers', true);
			ow.party.length = 0;
			ow.party.push(Bmod.buildMon(FORM, 30, ow.battle.data));
			ow.refreshFollower();
			const f = ow.follower, p = ow.player;
			p.facing = 'down';
			// park it a tile below the player, facing down, so it is on screen
			if (f) { f.tx = p.tx; f.ty = p.ty + 1; f.px = p.tx * 16; f.py = (p.ty + 1) * 16; f.facing = 'down'; }
		}, FORM);
		const sheetOk = await waitFor(() => page.evaluate(FORM => { const img = window.__ow.followSheet(FORM); return !!(img && img.width); }, FORM), 10000);
		const fol = await page.evaluate(async (FORM, BASE) => {
			const ow = window.__ow, img = ow.followSheet(FORM);
			return { id: ow.follower?.id, w: img?.width, h: img?.height,
				isForm: await window.__samePixels(img, `/overworld/data/pokemon_follow/${FORM}.png`),
				isBase: await window.__samePixels(img, `/overworld/data/pokemon_follow/${BASE}.png`) };
		}, FORM, BASE);
		A(fol.id === FORM, 'the follower is the party lead, Hisuian Qwilfish', fol.id);
		A(sheetOk && fol.isForm && !fol.isBase, 'it walks on the HISUIAN sheet, not the base Qwilfish one', JSON.stringify(fol));
		A(fol.w === 128 && fol.h === 128, 'a 128x128 4x4 walk sheet', `${fol.w}x${fol.h}`);
		await new Promise(r => setTimeout(r, 600));
		await page.screenshot({ path: path.join(SHOTS, 'form_sprites_follower.png') });

		// ---------- battle: your Hisuian Qwilfish is drawn from BEHIND, in Hisuian art ----------
		const bt = await page.evaluate(async (files) => {
			const ow = window.__ow, B = ow.battle;
			ow.startWildBattle({ id: 'qwilfish', level: 8 });
			for (let i = 0; i < 100 && !B.active; i++) await new Promise(r => setTimeout(r, 50));
			const a = () => B.active;
			for (let i = 0; i < 300 && a() && a().phase !== 'menu'; i++) {
				const q = a().queue; if (q && q.length) { const e = q.shift(); e.fn?.(); e.anim?.done?.(); } await new Promise(r => setTimeout(r, 20));
			}
			const meImg = a()?.meImg, foeImg = a()?.foeImg;
			const P = f => '/overworld/data/pokemon/' + f;
			return { phase: a()?.phase, me: a()?.me?.speciesId, meW: meImg?.naturalWidth || meImg?.width || 0,
				meIsFormBack: await window.__samePixels(meImg, P(files.formBack)),
				meIsFormFront: await window.__samePixels(meImg, P(files.formFront)),
				meIsBaseBack: await window.__samePixels(meImg, P(files.baseBack)),
				foeIsBaseFront: await window.__samePixels(foeImg, P(files.baseFront)) };
		}, { formBack: FORM_BACK, formFront: bat[FORM].sprite, baseBack: BASE_BACK, baseFront: bat[BASE].sprite });
		A(bt.me === FORM, 'your mon in battle is the Hisuian Qwilfish', bt.me);
		A(bt.meIsFormBack, `it is drawn with its own BACK sprite (${FORM_BACK})`, JSON.stringify(bt));
		A(!bt.meIsFormFront && !bt.meIsBaseBack, 'not the front (the old fallback) nor plain Qwilfish\'s back', JSON.stringify(bt));
		A(bt.meW > 0, 'and the image actually loaded');
		A(bt.foeIsBaseFront, 'the wild plain Qwilfish keeps its own front sprite', JSON.stringify(bt));
		await new Promise(r => setTimeout(r, 400));
		await page.screenshot({ path: path.join(SHOTS, 'form_sprites_battle.png') });
		await page.close();

		// ---------- the design wiki's form page (desktop + phone) ----------
		for (const [label, vp] of [['desktop', { width: 1200, height: 800 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
			const wp = await browser.newPage();
			await wp.setViewport(vp);
			await wp.goto(`http://localhost:${PORT}/designwiki/index.html#/pokemon/${FORM}`, { waitUntil: 'domcontentloaded' });
			const got = await waitFor(() => wp.evaluate(() => { const i = document.querySelector('#content img.sprite, img.sprite'); return !!(i && i.complete && i.naturalWidth); }), 15000);
			const w = await wp.evaluate(() => { const i = document.querySelector('#content img.sprite, img.sprite'); return { src: i?.getAttribute('src') || '', nw: i?.naturalWidth || 0, h1: document.querySelector('h1')?.textContent || '' }; });
			A(got && w.src === 'sprites/' + bat[FORM].sprite && w.nw > 0, `wiki (${label}): the form page shows the form's own sprite, loaded`, JSON.stringify(w));
			await wp.screenshot({ path: path.join(SHOTS, `form_sprites_wiki_${label}.png`) });
			await wp.close();
		}
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
