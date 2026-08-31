// mapedit_test.mjs — the owner-only tile editor and the region clone tool.
//
// The gate is the part worth being careful about: ?mapedit=1 must do nothing at
// all for anyone who isn't mgibbie, and the check has to be the SERVER's answer
// (the username derived from the token) rather than anything the client can
// set. This drives both sides by changing what the stubbed /api/mp reports.
//
// The editing assertions cover the thing that makes this editor trustworthy:
// it writes the real u16 grid cell — metatile id | collision | elevation — via
// world.setGridValue, so an edit round-trips through the layout file exactly as
// the loader will read it back. (world.setMetatile, the cutscene op, masks the
// elevation nibble off; an editor using it would quietly flatten every map.)
//
//   node overworld/tests/mapedit_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8875;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const seedMon = {
	speciesId: 'rattata', name: 'RATTATA', level: 5, gender: 'M', friend: 70,
	types: ['Normal'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
	stats: { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, maxHP: 20, curHP: 20,
	exp: 125, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
};
// the account the stub server will claim the token belongs to
let SERVER_USERNAME = 'mgibbie';
const stateFor = () => ({ username: SERVER_USERNAME, friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } });

// ---------- static: the clone tool ----------
// Selecting a region by tileset does NOT work (Kanto interiors reuse Emerald
// layouts), so the tool walks the map graph. Prove the walk is clean.
let clone = '';
try {
	clone = execFileSync('node', ['tools/clone_region.mjs', '--name=Testland'], { cwd: ROOT, encoding: 'utf8' });
} catch (e) { clone = 'FAILED: ' + (e.stdout || e.message); }
A(/maps\s+3\d\d/.test(clone), 'the clone tool finds a few hundred Hoenn maps', clone.split('\n')[1]);
A(/exits still pointing at the source region: 0/.test(clone),
	'and the region is self-contained — no exit leaks back into Hoenn',
	(clone.match(/exits still pointing.*/) || [''])[0]);
A(/dry run/.test(clone), 'it defaults to a dry run rather than writing 300 files');
const cloneSrc = fs.readFileSync(path.join(ROOT, 'tools/clone_region.mjs'), 'utf8');
A(/REFUSING/.test(cloneSrc), 'it refuses to overwrite an existing clone');
A(/layouts\/\$\{lay\.id\}\.json/.test(cloneSrc) || /layouts\/'/.test(cloneSrc) || /\$\{D\}\/layouts/.test(cloneSrc),
	'it gives the clone its OWN layout files (shared interiors would otherwise write back into Kanto)');

// ---------- static: the dev-server write path ----------
const devSrc = fs.readFileSync(path.join(ROOT, 'mp-dev-server.mjs'), 'utf8');
A(/save-layout/.test(devSrc), 'the dev server exposes /dev/save-layout');
A(/join\('overworld\/data\/layouts', id \+ '\.json'\)/.test(devSrc),
	'and rebuilds the path from the layout id rather than trusting the client');

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
			res.end(JSON.stringify({ ok: true, state: stateFor(), friends: [], challenges: [], match: null, presence: null }));
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
	const openPage = async (mapedit) => {
		// a fresh context per page: two pages in the same context share
		// localStorage, and the second boot would inherit the first's account
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.evaluateOnNewDocument((st, mon) => {
			try {
				localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				localStorage.setItem('magepunk_party_v1', JSON.stringify([mon]));
				localStorage.setItem('magepunk_region', 'HOENN');
			} catch {}
		}, stateFor(), seedMon);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LittlerootTown${mapedit ? '&mapedit=1' : ''}`,
			{ waitUntil: 'domcontentloaded' });
		return page;
	};

	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

		// ---- the gate, from the WRONG account ----
		SERVER_USERNAME = 'someone_else';
		const bad = await openPage(true);
		A(await waitFor(() => bad.evaluate(() => !!window.__ow?.world?.current), 30000), 'boot as a non-owner');
		await new Promise(r => setTimeout(r, 1200)); // let the gate resolve
		const denied = await bad.evaluate(() => ({
			mounted: !!window.__mapedit,
			panel: !!document.getElementById('mapedit'),
			toldWhy: /owner tool/i.test(document.body.innerText || ''),
		}));
		A(!denied.mounted, 'a non-owner does NOT get the editor');
		A(!denied.panel, 'and no editor panel is in the DOM');
		A(denied.toldWhy, 'they are told it is an owner tool rather than left guessing');
		await bad.close();

		// ---- the home page tile sits with the other owner tools ----
		// This reveal is client-side (cached username) and is only a convenience:
		// the real gate is the server check above, which is why a spoofed state
		// still gets no editor. Assert both halves so neither drifts.
		const tileFor = async (username) => {
			const ctx = await browser.createBrowserContext();
			const pg = await ctx.newPage();
			await pg.evaluateOnNewDocument(u => {
				localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: u, decks: [], collection: {}, stats: {} }));
			}, username);
			await pg.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
			await new Promise(r => setTimeout(r, 700));
			const out = await pg.evaluate(() => {
				const t = document.getElementById('tile-mapedit');
				const sib = document.getElementById('tile-spritetune');
				return {
					exists: !!t,
					shown: !!t && !t.hidden,
					href: t?.getAttribute('href'),
					nextToTuners: !!(t && sib && sib.parentElement === t.parentElement),
				};
			});
			await pg.close();
			return out;
		};
		const ownerTile = await tileFor('mgibbie');
		const strangerTile = await tileFor('someone_else');
		A(ownerTile.exists, 'the home page has a Map Editor tile');
		A(ownerTile.shown, 'it shows for the owner');
		A(ownerTile.href === 'overworld/?mapedit=1', 'and points at the editor', ownerTile.href);
		A(ownerTile.nextToTuners, 'sitting with the other owner tools');
		A(!strangerTile.shown, 'and stays hidden for everyone else');

		// ---- the gate, as the owner ----
		SERVER_USERNAME = 'mgibbie';
		const page = await openPage(true);
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		A(await waitFor(() => page.evaluate(() => !!window.__mapedit), 30000), 'the owner gets the editor');
		A(await page.evaluate(() => !!document.getElementById('mapedit')), 'the panel is mounted');

		// ---- palette ----
		const pal = await page.evaluate(() => ({
			size: window.__mapedit.paletteSize(),
			canvas: (() => { const c = document.getElementById('me-pal'); return { w: c.width, h: c.height }; })(),
			map: window.__ow.world.current.name,
			layout: window.__ow.world.current.layout.id,
		}));
		A(pal.size > 100, `the palette covers the map's whole tileset pair (${pal.size} metatiles)`);
		A(pal.canvas.w > 0 && pal.canvas.h > 0, 'and it rendered to a real canvas', JSON.stringify(pal.canvas));
		A(pal.map === 'LittlerootTown' && /^LAYOUT_/.test(pal.layout), 'editing the booted map', JSON.stringify(pal));

		// ---- painting writes the real grid cell ----
		const paint = await page.evaluate(() => {
			const ed = window.__mapedit, lay = window.__ow.world.current.layout;
			const out = {};
			const before = lay.map[5][5];
			ed.sel = 42; ed.collision = 'block'; ed.elevation = '3';
			ed.paintAt(5, 5);
			const after = lay.map[5][5];
			out.before = before; out.after = after;
			out.id = after & 0x3FF;
			out.blocked = (after & 0x0C00) !== 0;
			out.elev = (after & 0xF000) >> 12;
			// 'keep' must carry the existing collision/elevation through
			ed.sel = 7; ed.collision = 'keep'; ed.elevation = 'keep';
			ed.paintAt(5, 5);
			const kept = lay.map[5][5];
			out.keptId = kept & 0x3FF;
			out.keptBlocked = (kept & 0x0C00) !== 0;
			out.keptElev = (kept & 0xF000) >> 12;
			return out;
		});
		A(paint.id === 42, 'paint writes the selected metatile id', JSON.stringify(paint));
		A(paint.blocked, 'the collision bits go in');
		A(paint.elev === 3, 'and the elevation nibble survives — the whole point of setGridValue', String(paint.elev));
		A(paint.keptId === 7, 'a second paint changes the tile');
		A(paint.keptBlocked && paint.keptElev === 3, '"keep" carries collision and elevation through', JSON.stringify(paint));

		// ---- fill / rect / undo / redo ----
		const ops = await page.evaluate(() => {
			const ed = window.__mapedit, lay = window.__ow.world.current.layout;
			const out = {};
			ed.collision = 'keep'; ed.elevation = 'keep';
			// rect over a known box
			ed.sel = 99;
			ed.rectAt(2, 2, 4, 4);
			out.rect = [lay.map[2][2] & 0x3FF, lay.map[4][4] & 0x3FF, lay.map[3][3] & 0x3FF];
			out.outside = lay.map[5][2] & 0x3FF;
			ed.undoOnce();
			out.afterUndo = lay.map[3][3] & 0x3FF;
			ed.redoOnce();
			out.afterRedo = lay.map[3][3] & 0x3FF;
			// flood fill from inside the rect recolours exactly the rect
			ed.sel = 123;
			ed.fillAt(3, 3);
			out.filled = lay.map[3][3] & 0x3FF;
			out.fillStayedInside = (lay.map[5][2] & 0x3FF) !== 123;
			return out;
		});
		A(ops.rect.every(v => v === 99), 'rect fills its box', JSON.stringify(ops.rect));
		A(ops.outside !== 99, 'and stops at the box edge');
		A(ops.afterUndo !== 99, 'undo restores the previous tiles', String(ops.afterUndo));
		A(ops.afterRedo === 99, 'redo puts them back');
		A(ops.filled === 123, 'flood fill paints the region', String(ops.filled));
		A(ops.fillStayedInside, 'and does not bleed into a different metatile');

		// ---- what Save would write ----
		const save = await page.evaluate(() => {
			const ed = window.__mapedit, lay = window.__ow.world.current.layout;
			return {
				file: ed.layoutFile(),
				rows: lay.map.length, height: lay.height,
				widthOk: lay.map.every(r => r.length === lay.width),
				u16: lay.map.every(r => r.every(v => Number.isInteger(v) && v >= 0 && v <= 0xFFFF)),
			};
		});
		A(save.file === 'overworld/data/layouts/LAYOUT_LITTLEROOT_TOWN.json',
			'Save targets the layout file the loader reads', save.file);
		A(save.rows === save.height && save.widthOk, 'the edited grid still matches its declared size');
		A(save.u16, 'every cell is still a valid u16 the dev server will accept');

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
