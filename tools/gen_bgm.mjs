// gen_bgm.mjs — accurate per-map background music from the three source games.
//
// Every transpiled map JSON already carries its decomp music constant
// (MUS_* for FireRed/Emerald, MUSIC_* for Crystal). This tool:
//   1. resolves each map's PROVENANCE (the same constant names different songs
//      per game — MUS_GYM is a different track in FR vs Emerald), by checking
//      which decomp defines that map with that music;
//   2. maps every needed constant to its track in the Zophar sound rips
//      (GBS/GSF -> MP3). The Crystal rip is numbered by MUSIC ID — verified
//      against 12 named tracks — so all 47 Crystal songs resolve mechanically
//      from pokecrystal's music_constants.asm. The GBA rips are matched by
//      official track title, pinned via the decomps' internal sequence names
//      (MUS_LOAD02 = "Road to Cerulean - From Mt. Moon" = MUS_ROUTE3, etc.);
//   3. downloads the ~130 unique tracks and transcodes them with ffmpeg to
//      looping-friendly ogg (trailing silence trimmed so the loop seam is
//      tight) at data/sounds/bgm/<game>_<CONST>.ogg;
//   4. writes overworld/data/music_map.json  { mapId: fileKey }.
//
// Known approximations (the rips lack a few discrete titles):
//   * FR MUS_SEVII_ROUTE shares the "Sevii Islands" file with MUS_SEVII_123;
//     MUS_SEVII_DUNGEON falls back to the cave theme (MUS_SEVII_CAVE is
//     canonically identical to Mt. Moon per pokeemerald's own comment).
//   * FR MUS_TRAINER_TOWER = "Tense Competition!" (best title match).
//   * Emerald MUS_ROUTE118 is a split-music map special (0x7FFF) — the west
//     half's song (Route 110) is used.
//
//   node tools/gen_bgm.mjs             (report only)
//   node tools/gen_bgm.mjs --write     (write music_map.json + download + transcode)
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const WRITE = process.argv.includes('--write');
const M66 = 'C:/Users/guide/Desktop/Magepunk66/Reference';
const DATA = path.resolve('overworld/data');
const BGM_DIR = path.join(DATA, 'sounds/bgm');
const CACHE = path.join(process.env.TEMP || '/tmp', 'magepunk_bgm_cache');

const PAGES = {
	crystal: 'https://www.zophar.net/music/gameboy-gbs/pokemon-crystal',
	gold: 'https://www.zophar.net/music/gameboy-gbs/pokemon-gold',
	leafgreen: 'https://www.zophar.net/music/gameboy-advance-gsf/pokemon-leafgreen',
	sapphire: 'https://www.zophar.net/music/gameboy-advance-gsf/pokemon-sapphire',
	emerald: 'https://www.zophar.net/music/gameboy-advance-gsf/pokemon-emerald',
};

// FireRed constants -> LeafGreen-rip track-number prefix
const FR = {
	MUS_CELADON: '40', MUS_CINNABAR: '55', MUS_EVOLUTION: '30', MUS_FUCHSIA: '50',
	MUS_GAME_CORNER: '41', MUS_GYM: '25', MUS_LAVENDER: '38', MUS_MT_MOON: '34',
	MUS_NET_CENTER: '57', MUS_OAK_LAB: '08', MUS_PALLET: '06', MUS_PEWTER: '15',
	MUS_POKE_CENTER: '21', MUS_POKE_MANSION: '56', MUS_POKE_TOWER: '39',
	MUS_ROCKET_HIDEOUT: '45', MUS_ROUTE1: '13', MUS_ROUTE11: '48',
	MUS_ROUTE24: '02',      // internal MUS_OPENING: the routes-24/25 song IS the opening-demo track
	MUS_ROUTE3: '32',       // internal MUS_LOAD02 = "Road to Cerulean City - From Mt. Moon"
	MUS_SEVII_123: '63', MUS_SEVII_45: '59', MUS_SEVII_67: '64',
	MUS_SILPH: '47', MUS_SLOW_PALLET: '05', MUS_SS_ANNE: '36',
	MUS_TRAINER_TOWER: '26', MUS_VERMILLION: '35', MUS_VICTORY_ROAD: '69',
	MUS_VIRIDIAN_FOREST: '17',
	// battle + field overrides (not map music; keyed the same way)
	MUS_VS_WILD: '18', MUS_VS_TRAINER: '11', MUS_VS_GYM_LEADER: '27',
	MUS_VS_CHAMPION: '70', MUS_VS_LEGEND: '53',
	MUS_SURF: '52', MUS_CYCLING: '37',
};
// constants whose song is another constant's file (no separate download)
const FR_ALIAS = {
	MUS_SEVII_CAVE: 'firered_MUS_MT_MOON',      // pokeemerald: "Identical to MUS_RG_MT_MOON"
	MUS_SEVII_DUNGEON: 'firered_MUS_MT_MOON',   // approximation: rip carries no discrete title
	MUS_SEVII_ROUTE: 'firered_MUS_SEVII_123',   // approximation: one "Sevii Islands" title
};

// Emerald constants -> Sapphire (S) / Emerald (E) / Gold (G) rip prefixes
const EM = {
	MUS_ABANDONED_SHIP: 'S240', MUS_AQUA_MAGMA_HIDEOUT: 'S219', MUS_BIRCH_LAB: 'S106',
	MUS_B_ARENA: 'E08', MUS_B_DOME: 'E05', MUS_B_DOME_LOBBY: 'E06', MUS_B_FACTORY: 'E09',
	MUS_B_FRONTIER: 'E03', MUS_B_PALACE: 'E07', MUS_B_PIKE: 'E10', MUS_B_PYRAMID: 'E11',
	MUS_B_TOWER: 'E04', MUS_B_TOWER_RS: 'S241', MUS_CAVE_OF_ORIGIN: 'S228',
	MUS_CONTEST: 'S234', MUS_CONTEST_LOBBY: 'S233', MUS_DEWFORD: 'S130',
	MUS_EVER_GRANDE: 'S231', MUS_EVOLUTION: 'S212b', MUS_FALLARBOR: 'S144',
	MUS_FORTREE: 'S202', MUS_GAME_CORNER: 'S136', MUS_GSC_PEWTER: 'G21',
	MUS_GYM: 'S149', MUS_HALL_OF_FAME_ROOM: 'S249', MUS_LILYCOVE: 'S207',
	MUS_LILYCOVE_MUSEUM: 'S208', MUS_LITTLEROOT: 'S105', MUS_MT_CHIMNEY: 'S146',
	MUS_MT_PYRE: 'S215', MUS_MT_PYRE_EXTERIOR: 'S218', MUS_OCEANIC_MUSEUM: 'S133',
	MUS_OLDALE: 'S112', MUS_PETALBURG: 'S120', MUS_PETALBURG_WOODS: 'S123',
	MUS_POKE_CENTER: 'S113', MUS_POKE_MART: 'S214', MUS_ROUTE101: 'S111',
	MUS_ROUTE104: 'S122', MUS_ROUTE110: 'S134', MUS_ROUTE113: 'S142',
	MUS_ROUTE119: 'S201', MUS_ROUTE120: 'S203',
	MUS_ROUTE122: 'S121',   // internal MUS_DOORO_X4; official title "Come Along" (Birch intro / Routes 122-123)
	MUS_RUSTBORO: 'S127', MUS_SAFARI_ZONE: 'S205', MUS_SAILING: 'S129',
	MUS_SCHOOL: 'S128', MUS_SEALED_CHAMBER: 'S237', MUS_SLATEPORT: 'S132',
	MUS_SOOTOPOLIS: 'S227', MUS_TRICK_HOUSE: 'S239', MUS_UNDERWATER: 'S226',
	MUS_VERDANTURF: 'S141', MUS_VICTORY_ROAD: 'S242',
	// battle + field overrides
	MUS_VS_WILD: 'S109', MUS_VS_TRAINER: 'S117', MUS_VS_GYM_LEADER: 'S150',
	MUS_VS_ELITE_FOUR: 'S245', MUS_VS_CHAMPION: 'S247', MUS_VS_RIVAL: 'S211',
	MUS_VS_AQUA_MAGMA: 'S125', MUS_VS_AQUA_MAGMA_LEADER: 'S222',
	MUS_VS_KYOGRE_GROUDON: 'S229', MUS_VS_REGI: 'S238',
	MUS_SURF: 'S154', MUS_CYCLING: 'S135',
};
const EM_ALIAS = {
	MUS_RG_SEVII_CAVE: 'firered_MUS_MT_MOON',
	MUS_RG_SEVII_ROUTE: 'firered_MUS_SEVII_123',
	MUS_ROUTE118: 'emerald_MUS_ROUTE110',       // split-music map (0x7FFF): west half's song
};

// ---------- 1. Crystal music IDs from pokecrystal ----------
function crystalIds() {
	const src = fs.readFileSync(path.join(M66, 'pokecrystal/constants/music_constants.asm'), 'utf8');
	const ids = {}; let n = null;
	for (const line of src.split('\n')) {
		if (/const_def/.test(line)) { n = parseInt((line.match(/const_def\s+(\d+)/) || [])[1] || '0', 10); continue; }
		const m = line.match(/^\s*const\s+(MUSIC_\w+)/);
		if (m && n !== null) { ids[m[1]] = n; n++; }
	}
	// aliased constants (EQU) resolve to their target's id
	for (const m of src.matchAll(/DEF\s+(MUSIC_\w+)\s+EQU\s+(MUSIC_\w+)/g)) ids[m[1]] = ids[m[2]];
	return ids;
}

// ---------- 2. provenance + needed tracks ----------
function buildMap() {
	const frMaps = new Set(fs.readdirSync(path.join(M66, 'pokefirered/data/maps')));
	const emMaps = new Set(fs.readdirSync(path.join(M66, 'pokeemerald/data/maps')));
	const decompMusic = (game, name) => {
		try { return JSON.parse(fs.readFileSync(path.join(M66, game, 'data/maps', name, 'map.json'), 'utf8')).music; }
		catch (e) { return null; }
	};
	const map = {}, needed = new Set();
	for (const f of fs.readdirSync(path.join(DATA, 'maps'))) {
		if (!f.endsWith('_map.json')) continue;
		const m = JSON.parse(fs.readFileSync(path.join(DATA, 'maps', f), 'utf8'));
		const mus = m.music, stem = f.slice(0, -9);
		if (!m.id || !mus || ['MUS_NONE', 'MUS_DUMMY', 'MUSIC_NONE'].includes(mus)) continue;
		let key = null;
		if (mus.startsWith('MUSIC_')) key = 'crystal_' + mus;
		else {
			const base = stem.replace(/^Hoenn2_/, '');
			if (frMaps.has(base) && decompMusic('pokefirered', base) === mus) key = FR_ALIAS[mus] || 'firered_' + mus;
			else if (emMaps.has(base) && decompMusic('pokeemerald', base) === mus) key = EM_ALIAS[mus] || 'emerald_' + mus;
			else if (stem.startsWith('KantoVictoryRoad')) key = FR_ALIAS[mus] || 'firered_' + mus;
			else key = EM_ALIAS[mus] || 'emerald_' + mus;   // link rooms etc.
		}
		map[m.id] = key;
		needed.add(key);
	}
	return { map, needed };
}

// ---------- 3. Zophar URL index ----------
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

// ---------- main ----------
// tracks with no map of their own: battle themes and the surf/bike overrides.
// Crystal keys resolve through the same ID table as everything MUSIC_-named;
// FR/Emerald keys resolve through the FR/EM tables above.
const EXTRA = [
	// Crystal — Johto set, the separate KANTO set JohKanto uses, night wilds
	'crystal_MUSIC_JOHTO_WILD_BATTLE', 'crystal_MUSIC_JOHTO_WILD_BATTLE_NIGHT',
	'crystal_MUSIC_JOHTO_TRAINER_BATTLE', 'crystal_MUSIC_JOHTO_GYM_LEADER_BATTLE',
	'crystal_MUSIC_KANTO_WILD_BATTLE', 'crystal_MUSIC_KANTO_TRAINER_BATTLE',
	'crystal_MUSIC_KANTO_GYM_LEADER_BATTLE',
	'crystal_MUSIC_CHAMPION_BATTLE', 'crystal_MUSIC_RIVAL_BATTLE',
	'crystal_MUSIC_ROCKET_BATTLE', 'crystal_MUSIC_SUICUNE_BATTLE',
	'crystal_MUSIC_SURF', 'crystal_MUSIC_BICYCLE',
	// FireRed
	'firered_MUS_VS_WILD', 'firered_MUS_VS_TRAINER', 'firered_MUS_VS_GYM_LEADER',
	'firered_MUS_VS_CHAMPION', 'firered_MUS_VS_LEGEND',
	'firered_MUS_SURF', 'firered_MUS_CYCLING',
	// Emerald
	'emerald_MUS_VS_WILD', 'emerald_MUS_VS_TRAINER', 'emerald_MUS_VS_GYM_LEADER',
	'emerald_MUS_VS_ELITE_FOUR', 'emerald_MUS_VS_CHAMPION', 'emerald_MUS_VS_RIVAL',
	'emerald_MUS_VS_AQUA_MAGMA', 'emerald_MUS_VS_AQUA_MAGMA_LEADER',
	'emerald_MUS_VS_KYOGRE_GROUDON', 'emerald_MUS_VS_REGI',
	'emerald_MUS_SURF', 'emerald_MUS_CYCLING',
];

const ids = crystalIds();
const { map, needed } = buildMap();
for (const k of EXTRA) needed.add(k);
const files = [...needed].sort();
console.log(`maps mapped: ${Object.keys(map).length}   unique files: ${files.length}`);

// resolve every needed key to a source URL
const links = {};
for (const [page, url] of Object.entries(PAGES)) links[page] = await pageLinks(url);
const srcOf = key => {
	const [game, ...rest] = key.split('_');
	const c = rest.join('_');
	if (game === 'crystal') {
		const id = ids[c.replace(/^MUSIC_/, 'MUSIC_')] ?? ids[c];
		const n2 = String(id).padStart(2, '0');
		return links.crystal[n2] || links.crystal[String(id)];
	}
	if (game === 'firered') return links.leafgreen[FR[c]];
	// emerald: S/E/G prefixed
	const t = EM[c];
	if (!t) return null;
	const [pg, num] = t[0] === 'S' ? ['sapphire', t.slice(1)] : t[0] === 'E' ? ['emerald', t.slice(1).padStart(2, '0')] : ['gold', t.slice(1)];
	return links[pg][num];
};
let missing = 0;
const plan = files.map(k => { const u = srcOf(k); if (!u) { missing++; console.log('  NO SOURCE:', k); } return [k, u]; });
console.log(`sources resolved: ${files.length - missing}/${files.length}`);
if (!WRITE) { console.log('\n(dry run — pass --write)'); process.exit(missing ? 1 : 0); }
if (missing) { console.error('unresolved sources — refusing to write'); process.exit(1); }

fs.mkdirSync(BGM_DIR, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
let done = 0, skipped = 0;
for (const [key, url] of plan) {
	const out = path.join(BGM_DIR, key + '.ogg');
	if (fs.existsSync(out) && fs.statSync(out).size > 10000) { skipped++; continue; }
	const raw = path.join(CACHE, key + '.mp3');
	if (!fs.existsSync(raw) || fs.statSync(raw).size < 10000) {
		const buf = await (await fetch(url)).arrayBuffer();
		fs.writeFileSync(raw, Buffer.from(buf));
	}
	// trim the trailing fade-silence so the whole-file loop seam is tight
	execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw,
		'-af', 'areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse',
		'-c:a', 'libvorbis', '-q:a', '1', out]);
	done++;
	if (done % 10 === 0) console.log(`  ${done} transcoded...`);
}
fs.writeFileSync(path.join(DATA, 'music_map.json'), JSON.stringify(map));
const total = fs.readdirSync(BGM_DIR).reduce((s, f) => s + fs.statSync(path.join(BGM_DIR, f)).size, 0);
console.log(`\ntranscoded ${done} (+${skipped} already present) -> ${(total / 1e6).toFixed(1)} MB in data/sounds/bgm`);
console.log('wrote overworld/data/music_map.json — owdata deploys separately:');
console.log('  npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true');
