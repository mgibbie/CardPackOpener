// badgeart_test.mjs — real per-badge art on the Trainer Card (fx/badges/).
// Disk side: every badge id in badges.js has a 16x16 sprite for its region.
// Browser side: the art serves and decodes, JOHKANTO shares KANTO's sprites,
// the unearned ghost is a same-shape darkened silhouette, and the Trainer Card
// renders with the art loaded (earned + unearned + JohKanto rows) error-free.
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/badgeart_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { BADGES } from '../badges.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8897;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'ba', friendCode: 'BABABA', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 150)); } return false; }

// ---- disk side: the badge set drives the file set (JOHKANTO maps to kanto art)
const ART_REGION = { KANTO: 'kanto', JOHTO: 'johto', HOENN: 'hoenn', JOHKANTO: 'kanto' };
const files = new Set();
for (const [region, list] of Object.entries(BADGES)) for (const b of list) files.add(`${ART_REGION[region]}_${b.id}.png`);
A(files.size === 24, 'the badge tables need exactly 24 distinct sprites', files.size);
let missing = 0, badSize = 0;
for (const f of files) {
	const p = path.join(ROOT, 'overworld', 'fx', 'badges', f);
	if (!fs.existsSync(p)) { missing++; console.log('  missing: ' + f); continue; }
	const buf = fs.readFileSync(p); // PNG IHDR: width/height big-endian at bytes 16..23
	const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
	if (w !== 16 || h !== 16) { badSize++; console.log(`  bad size ${w}x${h}: ` + f); }
}
A(missing === 0, 'every badge sprite exists in overworld/fx/badges', missing);
A(badSize === 0, 'every badge sprite is 16x16', badSize);

(async () => {
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	await new Promise(r => server.listen(PORT, r));
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	const errors = [];
	try {
		const page = await browser.newPage();
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'ba');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([
				{ speciesId: 'pikachu', name: 'PIKACHU', level: 20, gender: 'M', ability: 'static', types: ['Electric'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 60, atk: 40, def: 34, spa: 40, spd: 40, spe: 60 }, maxHP: 60, curHP: 60, exp: 8000, num: 25, sprite: 's800.png', moves: [{ id: 'thundershock', name: 'ThunderShock', pp: 30, maxPp: 30 }] },
			]));
			// a mixed badge case: all 8 KANTO, 2 JOHTO, 0 HOENN, plus 3 JOHKANTO so the
			// postgame row draws too (it needs the JOHTO champion crown to appear)
			localStorage.setItem('magepunk_badges_v1', JSON.stringify({
				badges: {
					KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true, marsh: true, volcano: true, earth: true },
					JOHTO: { zephyr: true, hive: true },
					JOHKANTO: { boulder: true, cascade: true, thunder: true },
				},
				champion: { JOHTO: true },
			}));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.badgeSprite && window.__ow.trainerCard)), 30000);
		A(ready, 'overworld ready with badgeSprite exposed');
		if (!ready) throw new Error('no overworld');

		// every sprite the badge tables reference serves as a real PNG
		const fetched = await page.evaluate(async fl => {
			const bad = [];
			for (const f of fl) {
				const r = await fetch('fx/badges/' + f);
				if (!r.ok || !(r.headers.get('content-type') || '').includes('png')) bad.push(f + ':' + r.status);
			}
			return bad;
		}, [...files]);
		A(fetched.length === 0, 'all 24 badge sprites serve as PNG', fetched.join(','));

		// sprites decode; JOHKANTO resolves to the same element as KANTO
		await page.evaluate(() => { window.__ow.badgeSprite('KANTO', 'boulder'); window.__ow.badgeSprite('JOHTO', 'zephyr'); window.__ow.badgeSprite('HOENN', 'stone'); });
		const loaded = await waitFor(() => page.evaluate(() =>
			[['KANTO', 'boulder'], ['JOHTO', 'zephyr'], ['HOENN', 'stone']].every(([r, id]) => window.__ow.badgeSprite(r, id)?.width === 16)), 10000);
		A(loaded, 'badge sprites decode at 16x16');
		const shared = await page.evaluate(() => window.__ow.badgeSprite('JOHKANTO', 'boulder') === window.__ow.badgeSprite('KANTO', 'boulder'));
		A(shared, "JOHKANTO shares KANTO's art (same badges)");

		// the ghost is a same-footprint darkened silhouette
		const ghost = await page.evaluate(() => {
			const ow = window.__ow;
			const read = el => {
				const c = document.createElement('canvas'); c.width = 16; c.height = 16;
				const x = c.getContext('2d'); x.drawImage(el, 0, 0);
				const d = x.getImageData(0, 0, 16, 16).data;
				let sum = 0, n = 0;
				for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { sum += d[i] + d[i + 1] + d[i + 2]; n++; }
				return { avg: sum / (n * 3), n };
			};
			const s = read(ow.badgeSprite('KANTO', 'boulder')), g = read(ow.badgeGhost('KANTO', 'boulder'));
			return { sn: s.n, gn: g.n, sAvg: s.avg, gAvg: g.avg };
		});
		A(ghost.sn > 0 && ghost.gn === ghost.sn, 'ghost keeps the badge silhouette (same opaque footprint)', `${ghost.gn} vs ${ghost.sn}`);
		A(ghost.gAvg < ghost.sAvg * 0.5, 'ghost is a dark silhouette (well under half the sprite brightness)', `${Math.round(ghost.gAvg)} vs ${Math.round(ghost.sAvg)}`);

		// the card renders with art in every row state: earned (KANTO), partial
		// (JOHTO), all-ghost (HOENN), and the JohKanto postgame row
		await page.evaluate(() => { window.__ow.trainerCard.open = true; window.__ow.trainerCard.page = 0; });
		await new Promise(r => setTimeout(r, 400));
		const rows = await page.evaluate(() => ({
			jk: window.__ow.Badges.isChampion('JOHTO'), kanto: window.__ow.Badges.count('KANTO'), johto: window.__ow.Badges.count('JOHTO'),
		}));
		A(rows.jk && rows.kanto === 8 && rows.johto === 2, 'seeded badge case reached the card', JSON.stringify(rows));
		A(errors.length === 0, 'the Trainer Card renders the badge art without error', errors[0]);
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
