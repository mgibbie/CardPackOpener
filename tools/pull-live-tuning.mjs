// pull-live-tuning.mjs — fold the LIVE tuning overrides into the repo.
//
// The owner saves art/sprite tuning from the live site (arttune.html /
// ?spritetune=1); those saves land in production D1 as mp_store keys
// owner_tuning_art / owner_tuning_sprite and are merged over the committed
// files at runtime (tuning-get). This tool makes the repo authoritative
// again: it merges the overrides into battlecards/art_tuning.json and
// overworld/sprite_tuning.json (override wins per id), then clears the
// server keys. Commit + deploy afterwards.
//
//   node tools/pull-live-tuning.mjs           (merge + clear the overrides)
//   node tools/pull-live-tuning.mjs --keep    (merge only, leave overrides)
import { execSync } from 'child_process';
import fs from 'fs';

const KEEP = process.argv.includes('--keep');
const d1 = sql => {
	const out = execSync(`npx wrangler d1 execute magepunk-users --remote --json --command "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });
	return JSON.parse(out.slice(out.indexOf('[')));
};

const rows = d1("SELECT key, value FROM mp_store WHERE key IN ('owner_tuning_art','owner_tuning_sprite')")[0]?.results || [];
const artRows = d1("SELECT key, value FROM mp_store WHERE key LIKE 'owner_art%'")[0]?.results || [];
if (!rows.length && !artRows.length) {
	console.log('no live tuning overrides on the server — nothing to pull.');
	process.exit(0);
}

// ---- live replacement IMAGES (owner_art:<id> data URLs, saved by arttune on
// the live site) -> battlecards/art/<id>.jpg + index.json + an ART_REVS bump
// so clients drop their cached copy of the old image after the art deploy
let imagesFolded = 0;
const imgRows = artRows.filter(r => r.key.startsWith('owner_art:'));
for (const row of imgRows) {
	const id = row.key.slice('owner_art:'.length);
	const dataUrl = JSON.parse(row.value);
	const m = /^data:image\/jpeg;base64,(.+)$/.exec(dataUrl || '');
	if (!m) { console.warn(`skipping ${id}: not a jpeg data URL`); continue; }
	fs.writeFileSync(`battlecards/art/${id}.jpg`, Buffer.from(m[1], 'base64'));
	let index = [];
	try { index = JSON.parse(fs.readFileSync('battlecards/art/index.json', 'utf8')); } catch (e) {}
	if (!index.includes(id)) { index.push(id); index.sort(); fs.writeFileSync('battlecards/art/index.json', JSON.stringify(index)); }
	// bump the id's rev in cardart.js's single-line ART_REVS literal
	const srcPath = 'battlecards/cardart.js';
	const src = fs.readFileSync(srcPath, 'utf8');
	const lit = /const ART_REVS = \{[^}]*\};/.exec(src);
	if (!lit) throw new Error('ART_REVS literal not found in cardart.js');
	const revs = new Function('return ' + lit[0].slice('const ART_REVS = '.length, -1))();
	revs[id] = (revs[id] || 1) + 1;
	const litBody = Object.keys(revs).sort().map(k => `${/^[a-z_][a-z0-9_]*$/.test(k) ? k : JSON.stringify(k)}: ${revs[k]}`).join(', ');
	fs.writeFileSync(srcPath, src.replace(lit[0], `const ART_REVS = { ${litBody} };`));
	imagesFolded++;
	console.log(`battlecards/art/${id}.jpg: folded a live replacement image (rev ${revs[id]})`);
}
if (imagesFolded) console.log(`-> ${imagesFolded} image${imagesFolded > 1 ? 's' : ''} folded: commit cardart.js + index.json and run npm run deploy-art`);
const FILES = { owner_tuning_art: 'battlecards/art_tuning.json', owner_tuning_sprite: 'overworld/sprite_tuning.json' };
for (const row of rows) {
	const file = FILES[row.key];
	const override = JSON.parse(row.value);
	let base = {};
	try { base = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
	const merged = { ...base, ...override }; // override wins per id
	fs.writeFileSync(file, (file.endsWith('art_tuning.json')
		? JSON.stringify(merged, null, '\t')
		: JSON.stringify(merged)) + '\n');
	console.log(`${file}: merged ${Object.keys(override).length} live entries -> ${Object.keys(merged).length} total`);
}
if (!KEEP) {
	d1("DELETE FROM mp_store WHERE key IN ('owner_tuning_art','owner_tuning_sprite','owner_art_ids') OR key LIKE 'owner_art:%'");
	console.log('cleared the server overrides — commit the files and deploy to make the repo authoritative again.');
} else {
	console.log('--keep: server overrides left in place.');
}
