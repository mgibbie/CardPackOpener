// gen_bgm_extras.mjs — background-music tracks shipped from the MAIN project
// (overworld/bgm_extra/<key>.ogg, tracked in git) instead of the separate
// overworld/data Pages project, so adding one doesn't need an owdata redeploy.
// overworld/sound.js serves these keys from bgm_extra/ (BGM_EXTRA).
//
// Same source and settings as tools/gen_bgm.mjs: the Zophar Crystal GBS rip is
// numbered by MUSIC ID (pokecrystal constants/music_constants.asm) — the named
// tracks confirm it: 01 Title, 05 Magnet Train, 13 Heal, 63 Pokemon Channel —
// and the transcode trims the trailing fade-silence so the loop seam is tight.
//
//   node tools/gen_bgm_extras.mjs            (report only)
//   node tools/gen_bgm_extras.mjs --write    (download + transcode)
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// keys sound.js serves from bgm_extra/ — keep in step with BGM_EXTRA there
export const EXTRAS = [
	'crystal_MUSIC_POKE_FLUTE_CHANNEL',   // the JohKanto RADIO's POKé FLUTE station (wakes Snorlax)
];

const WRITE = process.argv.includes('--write');
const M66 = 'C:/Users/guide/Desktop/Magepunk66/Reference';
const OUT_DIR = path.resolve('overworld/bgm_extra');
const CACHE = path.join(process.env.TEMP || '/tmp', 'magepunk_bgm_cache');
const CRYSTAL_PAGE = 'https://www.zophar.net/music/gameboy-gbs/pokemon-crystal';

function crystalIds() {
	const src = fs.readFileSync(path.join(M66, 'pokecrystal/constants/music_constants.asm'), 'utf8');
	const ids = {}; let n = null;
	for (const line of src.split('\n')) {
		if (/const_def/.test(line)) { n = parseInt((line.match(/const_def\s+(\d+)/) || [])[1] || '0', 10); continue; }
		const m = line.match(/^\s*const\s+(MUSIC_\w+)/);
		if (m && n !== null) { ids[m[1]] = n; n++; }
	}
	return ids;
}
async function pageLinks(url) {
	const html = await (await fetch(url)).text();
	const out = {};
	for (const m of html.matchAll(/href="(https:\/\/fi\.zophar\.net\/soundfiles\/[^"]*\.mp3)"/g)) {
		const name = decodeURIComponent(m[1].split('/').pop());
		const num = (name.match(/^(\d+[a-z]?)/) || [])[1];
		if (num && !out[num]) out[num] = m[1];
	}
	return out;
}

const ids = crystalIds();
const links = await pageLinks(CRYSTAL_PAGE);
const plan = EXTRAS.map(key => {
	const c = key.replace(/^crystal_/, '');
	const id = ids[c];
	const url = id == null ? null : (links[String(id).padStart(2, '0')] || links[String(id)]);
	console.log(`${key}: MUSIC id ${id} -> ${url ? decodeURIComponent(url.split('/').pop()) : 'NO SOURCE'}`);
	return [key, url];
});
if (plan.some(([, u]) => !u)) { console.error('unresolved sources'); process.exit(1); }
if (!WRITE) { console.log('(dry run — pass --write)'); process.exit(0); }

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
for (const [key, url] of plan) {
	const raw = path.join(CACHE, key + '.mp3');
	if (!fs.existsSync(raw) || fs.statSync(raw).size < 10000) fs.writeFileSync(raw, Buffer.from(await (await fetch(url)).arrayBuffer()));
	const out = path.join(OUT_DIR, key + '.ogg');
	execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw,
		'-af', 'areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse',
		'-c:a', 'libvorbis', '-q:a', '1', out]);
	console.log(`wrote ${path.relative(process.cwd(), out)} (${fs.statSync(out).size} bytes)`);
}
