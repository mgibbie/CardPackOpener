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
if (!rows.length) {
	console.log('no live tuning overrides on the server — nothing to pull.');
	process.exit(0);
}
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
	d1("DELETE FROM mp_store WHERE key IN ('owner_tuning_art','owner_tuning_sprite')");
	console.log('cleared the server overrides — commit the files and deploy to make the repo authoritative again.');
} else {
	console.log('--keep: server overrides left in place.');
}
