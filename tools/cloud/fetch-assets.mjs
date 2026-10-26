// fetch-assets.mjs — download the OTHER gitignored asset folders some gate suites
// serve, from the Pages projects they are deployed to (overworld/data has its own,
// smarter fetcher: fetch-owdata.mjs). Each set is a manifest of paths, written from
// a checkout that has the assets:
//   micasurvivor  micasurvivor/assets/**     <- magepunk-micasurvivor.pages.dev  (npm run deploy-micasurvivor)
//   micatromods   micatro/mods/<id>/assets/** <- magepunk-micatromods.pages.dev   (npm run deploy-micatro-mods)
// (battlecards/art, 1.4 GB, is not fetched: no suite needs it, the game falls back to procedural art)
// Only writes files that are missing. A path the live project no longer serves is
// counted, not fatal (the manifest may predate a deploy).
//
//   node tools/cloud/fetch-assets.mjs [micasurvivor] [micatromods]   (default: both)
//   node tools/cloud/fetch-assets.mjs --write-manifest [set...]       (after deploying new assets)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SETS = {
	micasurvivor: { base: 'https://magepunk-micasurvivor.pages.dev/', manifest: 'micasurvivor_manifest.txt', local: p => `micasurvivor/assets/${p}`,
		list: () => walk(path.join(ROOT, 'micasurvivor/assets')) },
	micatromods: { base: 'https://magepunk-micatromods.pages.dev/', manifest: 'micatromods_manifest.txt', local: p => `micatro/mods/${p}`,   // p = <id>/assets/...
		list: () => fs.readdirSync(path.join(ROOT, 'micatro/mods')).filter(id => fs.existsSync(path.join(ROOT, 'micatro/mods', id, 'assets')))
			.flatMap(id => walk(path.join(ROOT, 'micatro/mods', id, 'assets')).map(p => `${id}/assets/${p}`)) },
};
function walk(dir, rel = '', out = []) {
	if (!fs.existsSync(dir)) return out;
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const r = rel ? `${rel}/${e.name}` : e.name;
		if (e.isDirectory()) walk(path.join(dir, e.name), r, out); else out.push(r);
	}
	return out;
}
const args = process.argv.slice(2);
const write = args.includes('--write-manifest');
const names = args.filter(a => !a.startsWith('--'));
const sets = names.length ? names : Object.keys(SETS);
for (const n of sets) if (!SETS[n]) { console.error(`unknown set "${n}" (sets: ${Object.keys(SETS).join(', ')})`); process.exit(2); }

let bad = 0;
for (const name of sets) {
	const S = SETS[name], mf = path.join(ROOT, 'tools/cloud', S.manifest);
	if (write) {
		const list = S.list().sort();
		if (!list.length) { console.error(`${name}: no local assets to list`); bad++; continue; }
		fs.writeFileSync(mf, list.join('\n') + '\n');
		console.log(`${name}: manifest of ${list.length} files`);
		continue;
	}
	const want = fs.readFileSync(mf, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
	const todo = want.filter(p => !fs.existsSync(path.join(ROOT, S.local(p))));
	let wrote = 0, notLive = 0;
	const failed = [];
	const q = [...todo];
	await Promise.all(Array.from({ length: 32 }, async () => {
		while (q.length) {
			const p = q.shift();
			for (let t = 0; t < 4; t++) {
				try {
					const r = await fetch(S.base + p.split('/').map(encodeURIComponent).join('/'));
					if (r.status === 404) { notLive++; break; }
					if (!r.ok) throw new Error('HTTP ' + r.status);
					// Pages answers an unknown path with the site's HTML: not the asset
					if (/text\/html/.test(r.headers.get('content-type') || '') && !/\.html?$/.test(p)) { notLive++; break; }
					const f = path.join(ROOT, S.local(p));
					fs.mkdirSync(path.dirname(f), { recursive: true });
					fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
					wrote++; break;
				} catch (e) { if (t === 3) failed.push(`${p}: ${e.message}`); else await new Promise(res => setTimeout(res, 800 * (t + 1))); }
			}
		}
	}));
	console.log(`${name}: ${want.length} in manifest, ${want.length - todo.length} already here, ${wrote} fetched, ${notLive} not live, ${failed.length} failed`);
	if (failed.length) { bad++; console.log(failed.slice(0, 10).map(s => '  ' + s).join('\n')); }
}
process.exit(bad ? 1 : 0);
