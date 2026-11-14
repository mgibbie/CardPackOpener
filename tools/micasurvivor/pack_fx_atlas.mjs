// tools/micasurvivor/pack_fx_atlas.mjs — packs the soft effect textures of MicaSurvivor 3D (micasurvivor/m3d/fx.js) into one
// atlas: micasurvivor/m3d/fx/particles.png, CELL px cells, COLS across, in the order of NAMES (fx.js reads the same list
// from particles.json, written beside it).
// Source: Kenney's "Particle Pack" 1.1 (kenney.nl/assets/particle-pack), Creative Commons Zero. Download and unzip it,
// then:   node tools/micasurvivor/pack_fx_atlas.mjs "<pack>/PNG (Transparent)"
// The textures are white on transparent: the game tints them (a type's colour) and draws them as light.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) { console.error('usage: node tools/micasurvivor/pack_fx_atlas.mjs "<Particle Pack>/PNG (Transparent)"'); process.exit(1); }
const CELL = 128, COLS = 6;
// the game's name for each cell -> the pack's file
export const NAMES = [
	['ring', 'circle_02'], ['ringsoft', 'circle_05'], ['flare', 'flare_01'], ['star', 'star_05'], ['burst', 'star_08'], ['glint', 'star_01'],
	['bolt', 'spark_05'], ['boltwide', 'spark_01'], ['streak', 'trace_01'], ['slash', 'slash_01'], ['crescent', 'slash_03'], ['scratch', 'scratch_01'],
	['smoke', 'smoke_02'], ['smokering', 'smoke_08'], ['puff', 'smoke_05'], ['muzzle', 'muzzle_02'], ['flame', 'flame_03'], ['fire', 'fire_01'],
	['magic', 'magic_03'], ['rune', 'magic_05'], ['twirl', 'twirl_02'], ['scorch', 'scorch_01'], ['dirt', 'dirt_02'], ['light', 'light_01'],
];
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const urls = NAMES.map(([, f]) => 'data:image/png;base64,' + fs.readFileSync(path.join(SRC, f + '.png')).toString('base64'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const b64 = await page.evaluate(async (urls, CELL, COLS) => {
	const rows = Math.ceil(urls.length / COLS), c = document.createElement('canvas'); c.width = COLS * CELL; c.height = rows * CELL;
	const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
	for (let i = 0; i < urls.length; i++) { const im = new Image(); im.src = urls[i]; await im.decode(); g.drawImage(im, (i % COLS) * CELL + 1, Math.floor(i / COLS) * CELL + 1, CELL - 2, CELL - 2); }   // (a clear pixel round each: no bleed)
	return c.toDataURL('image/png').split(',')[1];
}, urls, CELL, COLS);
await browser.close();
const dir = path.join(ROOT, 'micasurvivor/m3d/fx'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'particles.png'), Buffer.from(b64, 'base64'));
fs.writeFileSync(path.join(dir, 'particles.json'), JSON.stringify({ source: 'Kenney Particle Pack 1.1 (kenney.nl), CC0', cell: CELL, cols: COLS, rows: Math.ceil(NAMES.length / COLS), names: NAMES.map((n) => n[0]) }) + '\n');
console.log('wrote', path.join(dir, 'particles.png'), fs.statSync(path.join(dir, 'particles.png')).size, 'bytes,', NAMES.length, 'cells');
