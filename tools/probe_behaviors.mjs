// probe_behaviors.mjs — dump the metatile BEHAVIOR histogram for a few maps, via
// the real engine. Used to answer "can this map's water table ever fire?", which
// needs the tileset attribute tables, not the map JSON.
//
//   node tools/probe_behaviors.mjs MAP_JOHKANTO_ROUTE_20 MAP_ROUTE20 ...
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8914, BASE = `http://localhost:${PORT}`;
const MAPS = process.argv.slice(2);
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); } return false; };

(async () => {
	const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'probe-')), 'u.sqlite');
	const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile } });
	let browser;
	try {
		await waitFor(() => fetch(BASE + '/overworld/pokechess.html').then(r => r.ok), 20000);
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		await page.goto(`${BASE}/overworld/pokechess.html`, { waitUntil: 'domcontentloaded' });
		await page.evaluate(async () => {
			const eng = await import('./engine.js');
			const w = new eng.World(); await w.init(); window.__survey = w;
		});
		const res = await page.evaluate(async (maps) => {
			const w = window.__survey, out = {};
			const MM = 0x3FF, BM = 0x1FF;
			const attrOf = (ts, id) => {
				const i = id & MM;
				if (i >= ts.primaryMetatileCount) return ts.secondary?.attributes?.[i - ts.primaryMetatileCount] ?? 0;
				return ts.primary?.attributes?.[i] ?? 0;
			};
			for (const id of maps) {
				const f = w.fileFor(id);
				if (!f) { out[id] = { error: 'no file' }; continue; }
				try {
					const b = await w.loadBundle(f);
					const hist = {}, mt = {};
					for (let y = 0; y < b.layout.height; y++) for (let x = 0; x < b.layout.width; x++) {
						const v = b.layout.map[y]?.[x] ?? 0; if (!v) continue;
						const bh = attrOf(b.ts, v & MM) & BM;
						hist[bh] = (hist[bh] || 0) + 1;
						mt[v & MM] = (mt[v & MM] || 0) + 1;
					}
					out[id] = {
						file: f, tilesets: [b.layout.primary_tileset, b.layout.secondary_tileset],
						top: Object.entries(hist).sort((a, b2) => b2[1] - a[1]).slice(0, 8).map(([k, n]) => `0x${(+k).toString(16).padStart(2, '0')}:${n}`),
						topMeta: Object.entries(mt).sort((a, b2) => b2[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}:${n}`),
					};
				} catch (e) { out[id] = { error: String(e.message || e).slice(0, 90) }; }
			}
			return out;
		}, MAPS);
		for (const [id, v] of Object.entries(res)) {
			if (v.error) { console.log(id, 'ERROR', v.error); continue; }
			console.log(`\n${id}  (${v.file})`);
			console.log(`  tilesets : ${v.tilesets.join(' + ')}`);
			console.log(`  behaviors: ${v.top.join('  ')}`);
			console.log(`  metatiles: ${v.topMeta.join('  ')}`);
		}
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.kill();
	}
})();
