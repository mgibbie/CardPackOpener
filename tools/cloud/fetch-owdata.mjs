// fetch-owdata.mjs — download overworld/data from its live Pages project.
//
// overworld/data (~13.5k files, ~270 MB) is gitignored: it is deployed on its
// own to magepunk-owdata.pages.dev (see .gitignore). A fresh clone — a Claude
// Code cloud session, a new machine — has none of it, and most overworld tests
// need it. This pulls it back from the live deployment:
//   1. every path in tools/cloud/owdata_manifest.txt (regenerate it with
//      `node tools/cloud/fetch-owdata.mjs --write-manifest` after adding data)
//   2. then a crawl of the CURRENT indexes for anything the manifest predates:
//      maps/scripts/strings per map_index, layouts per map, tilesets per layout
//      (engine.js naming), palettes per pal_index, music per music_map, species
//      sprites/cries/followers per species_index, people per gfx_map, and every
//      sound/map name the game code spells out literally.
// Only ever WRITES files that are missing (or, with --refresh, differ). `_headers`
// is deploy config Pages never serves; it is written from its known content.
//
//   node tools/cloud/fetch-owdata.mjs [--dest overworld/data] [--refresh] [--write-manifest]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = f => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const DEST = path.resolve(ROOT, opt('--dest', 'overworld/data'));
const MANIFEST = path.join(ROOT, 'tools/cloud/owdata_manifest.txt');
const BASE = process.env.OWDATA_BASE || 'https://magepunk-owdata.pages.dev/';
const HEADERS = '/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=86400\n';

if (flag('--write-manifest')) {
	const out = [];
	const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else out.push(r); } };
	walk(DEST, '');
	fs.writeFileSync(MANIFEST, out.sort().join('\n') + '\n');
	console.log(`manifest: ${out.length} files`);
	process.exit(0);
}

const have = p => fs.existsSync(path.join(DEST, p));
const J = p => { try { return JSON.parse(fs.readFileSync(path.join(DEST, p), 'utf8')); } catch (e) { return null; } };
const tried = new Set();
let wrote = 0, same = 0, notLive = 0;
const failed = [];
async function get(rel, refresh) {
	if (tried.has(rel)) return; tried.add(rel);
	if (!refresh && have(rel)) { same++; return; }
	for (let t = 0; t < 4; t++) {
		try {
			const r = await fetch(BASE + rel.split('/').map(encodeURIComponent).join('/'));
			if (r.status === 404) { notLive++; return; }
			if (!r.ok) throw new Error('HTTP ' + r.status);
			if (/text\/html/.test(r.headers.get('content-type') || '') && !rel.endsWith('.html')) { notLive++; return; }
			const buf = Buffer.from(await r.arrayBuffer());
			const f = path.join(DEST, rel);
			if (have(rel) && fs.readFileSync(f).equals(buf)) { same++; return; }
			fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); wrote++; return;
		} catch (e) { if (t === 3) failed.push(rel + ': ' + e.message); else await new Promise(r => setTimeout(r, 800 * (t + 1))); }
	}
}
async function pool(list, refresh) {
	const q = [...new Set(list)];
	let n = 0;
	await Promise.all(Array.from({ length: 32 }, async () => { while (q.length) { await get(q.shift(), refresh); if (++n % 2000 === 0) console.log(`  ${n}/${list.length}`); } }));
}

// engine.js tileset naming (keep in step with overworld/engine.js)
const SHARED_GRAPHICS = { firered: { SilphCo: 'Condominiums' } };
const gfxName = (name, game) => { const own = String(name || '').replace('gTileset_', ''); const to = SHARED_GRAPHICS[game] && SHARED_GRAPHICS[game][own]; return to ? 'gTileset_' + to : name; };
function mangle(n) { n = n.replace('gTileset_', ''); n = n.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2'); n = n.replace(/([A-Za-z])(\d+)/g, '$1_$2'); return n.toLowerCase().replace(/^_/, '').replace(/__/g, '_'); }
const em = g => g === 'emerald' ? 'emerald_' : '';

function crawlCandidates() {
	const c = ['strings/_common.json', 'tilesets/pal_index.json'];
	for (const name of Object.values(J('map_index.json') || {})) c.push(`maps/${name}_map.json`, `scripts/${name}.json`, `strings/${name}.json`);
	for (const f of fs.existsSync(path.join(DEST, 'maps')) ? fs.readdirSync(path.join(DEST, 'maps')) : []) { const m = J('maps/' + f); if (m && m.layout) c.push(`layouts/${m.layout}.json`); }
	for (const f of fs.existsSync(path.join(DEST, 'layouts')) ? fs.readdirSync(path.join(DEST, 'layouts')) : []) {
		const l = J('layouts/' + f); if (!l) continue;
		for (const [n, prim] of [[l.primary_tileset, true], [l.secondary_tileset, false]]) if (n)
			c.push(`tilesets/${em(l.game)}${mangle(gfxName(n, l.game))}_tiles.png`, `tilesets/${em(l.game)}${prim ? 'primary_' : 'secondary_'}${mangle(n)}_metatiles.json`);
	}
	for (const s of (J('tilesets/pal_index.json') || [])) c.push(`tilesets/${s}_pal.json`);
	for (const v of Object.values(J('music_map.json') || {})) if (typeof v === 'string') c.push(`sounds/bgm/${v}.ogg`);
	for (const [id, sp] of Object.entries(J('species_index.json') || {})) {
		c.push(`sounds/cries/${id}.ogg`, `pokemon_follow/${id}.png`, `pokemon_ow/${id}.png`);
		if (sp && sp.sprite) c.push(`pokemon/${sp.sprite}`, `pokemon/${sp.sprite.replace(/\.png$/, '-b.png')}`);
	}
	for (const v of Object.values(J('gfx_map.json') || {})) if (typeof v === 'string') c.push(`people/${v}`);
	// names the game code spells out: sfx('fanfare_badge'), moveToMap('FollowTest'), music keys
	let src = '';
	for (const d of ['overworld', 'overworld/pokechess']) { try { for (const f of fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('.js'))) src += fs.readFileSync(path.join(ROOT, d, f), 'utf8'); } catch (e) {} }
	for (const m of src.matchAll(/['"`]([A-Za-z][A-Za-z0-9_]{2,60})['"`]/g)) {
		const s = m[1];
		if (/^[a-z0-9_]+$/.test(s)) c.push(`sounds/sfx/${s}.ogg`);
		else if (/^[A-Z][A-Za-z0-9_]+$/.test(s) && !/^[A-Z0-9_]+$/.test(s)) c.push(`maps/${s}_map.json`);
	}
	for (const m of src.matchAll(/\b((?:crystal|emerald|firered)_MUS(?:IC)?_[A-Z0-9_]+)/g)) c.push(`sounds/bgm/${m[1]}.ogg`);
	return c;
}

const t0 = Date.now();
fs.mkdirSync(DEST, { recursive: true });
const manifest = fs.readFileSync(MANIFEST, 'utf8').split('\n').map(s => s.trim()).filter(Boolean).filter(p => p !== '_headers');
console.log(`fetching ${manifest.length} manifest files from ${BASE} into ${path.relative(ROOT, DEST) || '.'}`);
await pool(manifest, flag('--refresh'));
console.log(`manifest: ${wrote} written, ${same} already present, ${notLive} not on live, ${failed.length} failed`);
for (let round = 1; round <= 4; round++) {
	const before = wrote;
	await pool(crawlCandidates().filter(p => !tried.has(p)), false);
	console.log(`crawl ${round}: +${wrote - before}`);
	if (wrote === before) break;
}
if (!have('_headers')) { fs.writeFileSync(path.join(DEST, '_headers'), HEADERS); wrote++; }
console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s: ${wrote} files written, ${failed.length} failed`);
if (failed.length) { console.log(failed.slice(0, 20).join('\n')); process.exit(1); }
