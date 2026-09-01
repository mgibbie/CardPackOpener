// gen_johkanto_league.mjs — give JOHKANTO the league it never had.
//
// JohKanto's spine ended at Blue, its eighth gym, and stopped. LEAGUE_SCRIPT had
// no JohKanto entries at all, so `Badges.crown('JOHKANTO')` was never called by
// anything — and the postgame level cap's last step to 255 is gated on exactly
// that, so the ladder topped out at 240 forever. Same shape as the badge-routing
// bug: a shipped feature with nothing able to reach it.
//
// THE VENUE IS MT SILVER, and it is the right one rather than a convenient one.
// Crystal gates the mountain on all sixteen badges, so it already IS the JohKanto
// capstone — Red is spawn-gated on `count('JOHKANTO') >= 8` in main.js today. Its
// three cave rooms are large, fully mapped, and hold nothing but item balls, so
// the climb is a venue standing empty.
//
// The four are the canonical Elite Four members that JohKanto's gyms did NOT
// already take: Janine replaced Koga and Blue replaced Giovanni, so Lorelei,
// Agatha, Bruno and Karen are unspoken for — Ice, Ghost, Fighting and Dark, four
// types no JohKanto gym leader leads with. Red is the Champion, which is what he
// has always been.
//
// New script ids on purpose. Reusing `WillScript_Battle` and friends would map
// straight back to JOHTO in LEAGUE_SCRIPT, which is precisely the collision that
// made the gyms award Kanto badges.
//
//   node tools/gen_johkanto_league.mjs           (report)
//   node tools/gen_johkanto_league.mjs --write   (apply)
import fs from 'fs';

const WRITE = process.argv.includes('--write');
const D = 'overworld/data';
const tPath = `${D}/trainers.json`;
const doc = JSON.parse(fs.readFileSync(tPath, 'utf8'));
const bat = JSON.parse(fs.readFileSync(`${D}/species_battle.json`, 'utf8'));
// the deepest REACHABLE tile of each map, flood-filled from its warps with the
// real engine (tools/survey_dungeons.mjs)
const dungeons = JSON.parse(fs.readFileSync('tools/data/dungeon_tiles.json', 'utf8'));

// Six each, type-pure, strongest last so the ace is unambiguous. The LEVELS here
// only pick the ace — main.js levels a JohKanto league fight off the player, the
// same way it levels the gyms.
const LEAGUE = [
	{
		script: 'SilverCaveEliteLorelei', name: 'LORELEI', klass: 'Elite Four', type: 'Ice',
		map: 'SilverCaveOutside', gfx: 'OBJ_EVENT_GFX_LORELEI',
		party: {
			jynx: ['lovelykiss', 'psychic', 'icebeam', 'nastyplot'],
			dewgong: ['icebeam', 'surf', 'rest', 'toxic'],
			glalie: ['iciclespear', 'earthquake', 'protect', 'crunch'],
			weavile: ['iceshard', 'knockoff', 'swordsdance', 'icepunch'],
			cloyster: ['shellsmash', 'iciclespear', 'hydropump', 'spikes'],
			lapras: ['sheercold', 'surf', 'icebeam', 'thunderbolt'],
		},
	},
	{
		script: 'SilverCaveEliteAgatha', name: 'AGATHA', klass: 'Elite Four', type: 'Ghost',
		map: 'SilverCaveRoom1', gfx: 'OBJ_EVENT_GFX_AGATHA',
		party: {
			haunter: ['hex', 'sludgebomb', 'confuseray', 'destinybond'],
			misdreavus: ['shadowball', 'confuseray', 'painsplit', 'willowisp'],
			banette: ['poltergeist', 'willowisp', 'suckerpunch', 'destinybond'],
			mismagius: ['shadowball', 'nastyplot', 'psychic', 'painsplit'],
			gengar: ['shadowball', 'sludgebomb', 'nastyplot', 'destinybond'],
			dusknoir: ['poltergeist', 'earthquake', 'willowisp', 'painsplit'],
		},
	},
	{
		script: 'SilverCaveEliteBruno', name: 'BRUNO', klass: 'Elite Four', type: 'Fighting',
		map: 'SilverCaveRoom2', gfx: 'OBJ_EVENT_GFX_BRUNO',
		party: {
			hitmonlee: ['highjumpkick', 'earthquake', 'stoneedge', 'bulkup'],
			hitmonchan: ['drainpunch', 'icepunch', 'machpunch', 'bulkup'],
			hitmontop: ['closecombat', 'suckerpunch', 'earthquake', 'machpunch'],
			hariyama: ['closecombat', 'knockoff', 'rockslide', 'bulkup'],
			heracross: ['closecombat', 'megahorn', 'rockslide', 'swordsdance'],
			machamp: ['dynamicpunch', 'stoneedge', 'earthquake', 'icepunch'],
		},
	},
	{
		script: 'SilverCaveEliteKaren', name: 'KAREN', klass: 'Elite Four', type: 'Dark',
		map: 'SilverCaveRoom3', gfx: 'OBJ_EVENT_GFX_KAREN',
		party: {
			murkrow: ['bravebird', 'darkpulse', 'suckerpunch', 'nastyplot'],
			sneasel: ['iceshard', 'knockoff', 'swordsdance', 'nightslash'],
			absol: ['nightslash', 'suckerpunch', 'swordsdance', 'playrough'],
			houndoom: ['darkpulse', 'flamethrower', 'nastyplot', 'suckerpunch'],
			honchkrow: ['suckerpunch', 'bravebird', 'darkpulse', 'nastyplot'],
			umbreon: ['foulplay', 'toxic', 'protect', 'moonlight'],
		},
	},
];
// Red keeps his authentic Crystal team; he only needs the Champion class so the
// boss AI and equipment apply, and the league wiring so beating him crowns the
// region.
const CHAMPION = 'Red';
const BASE = [64, 68, 72, 76];   // ace-picking only; see the header

const bst = id => Object.values(bat[id]?.baseStats || {}).reduce((a, b) => a + b, 0);
const typesOf = id => bat[id]?.types || [];
const moves = JSON.parse(fs.readFileSync(`${D}/moves_battle.json`, 'utf8'));

const problems = [];
let wrote = 0;
for (let i = 0; i < LEAGUE.length; i++) {
	const e = LEAGUE[i];
	const species = Object.keys(e.party);
	for (const s of species) {
		if (!bat[s]) { problems.push(`${e.name}: ${s} is not a species`); continue; }
		if (!typesOf(s).includes(e.type)) problems.push(`${e.name}: ${s} is ${typesOf(s).join('/')}, not ${e.type}`);
		for (const mid of e.party[s]) if (!moves[mid]) problems.push(`${e.name}/${s}: no such move '${mid}'`);
	}
	// Authentic movesets, like every other boss roster. Without them buildMon falls
	// back to the last four LEVEL-UP moves, which on a Lv150-scaled Elite Four is a
	// noticeably weaker team than the gyms the player just beat.
	const party = species.filter(s => bat[s]).map(s => ({ s, l: 0, moves: e.party[s].filter(m => moves[m]) }));
	party.sort((a, b) => bst(a.s) - bst(b.s));
	party.forEach((p, k) => { p.l = BASE[i] + Math.round((k / Math.max(1, party.length - 1)) * 4); });
	doc.rosters[e.script] = { name: e.name, class: e.klass, party };
	wrote++;
}
// Red is already rostered with his Crystal team; make sure he is Champion class
const red = doc.rosters[CHAMPION];
if (!red) problems.push('Red has no roster');
else {
	if (red.class !== 'Champion') { red.class = 'Champion'; wrote++; }
	// RED was the ninth champion with no authentic moveset. His Crystal team, given
	// the moves it is famous for.
	const RED_MOVES = {
		pikachu: ['thunderbolt', 'irontail', 'substitute', 'surf'],
		espeon: ['psychic', 'shadowball', 'substitute', 'protect'],
		snorlax: ['bodyslam', 'earthquake', 'crunch', 'rest'],
		venusaur: ['solarbeam', 'sludgebomb', 'sleeppowder', 'earthquake'],
		charizard: ['fireblast', 'airslash', 'earthquake', 'dragonpulse'],
		blastoise: ['hydropump', 'icebeam', 'earthquake', 'rest'],
	};
	for (const p of red.party) {
		const ms = (RED_MOVES[p.s] || []).filter(m => moves[m]);
		if (ms.length) { p.moves = ms; wrote++; }
		else problems.push(`Red/${p.s}: no moveset`);
	}
}

console.log(`league rosters written: ${wrote}\n`);
for (const e of LEAGUE) {
	const p = doc.rosters[e.script].party;
	console.log(`${e.name.padEnd(8)} ${String(e.type).padEnd(8)} ${e.map.padEnd(18)} ${p.map(x => x.s + '@' + x.l).join(' ')}`);
}
if (red) console.log(`${'RED'.padEnd(8)} ${'—'.padEnd(8)} ${'SilverCaveRoom3'.padEnd(18)} ${red.party.map(x => x.s + '@' + x.l).join(' ')}  [${red.class}]`);
if (problems.length) { console.log('\nproblems:'); for (const p of problems) console.log('  ' + p); }

// ---------- place them on the mountain ----------
// Each elite gets an object event on its map, spawn-gated exactly like Red so the
// whole league appears together once JohKanto's eight badges are in.
const placed = [];
for (const e of LEAGUE) {
	const mp = `${D}/maps/${e.map}_map.json`;
	if (!fs.existsSync(mp)) { problems.push(`${e.name}: no map ${e.map}`); continue; }
	const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
	m.object_events = m.object_events || [];
	const already = m.object_events.find(o => o.script === e.script);
	if (already) { placed.push(`${e.name} already at ${e.map} (${already.x},${already.y})`); continue; }
	// Stand them on a tile PROVEN reachable, from the flood fill in
	// tools/data/dungeon_tiles.json (survey_dungeons.mjs walks the map's own warps
	// with the engine's isPassable). The first pass here guessed — "next to an item
	// ball, one tile up" — and put two of the four behind a wall: passable, and
	// unreachable, which is an Elite Four member nobody can ever fight.
	const site = dungeons[`MAP_${e.map.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Za-z])(\d)/g, '$1_$2').toUpperCase()}`];
	if (!site || site.error) { problems.push(`${e.name}: no surveyed tile for ${e.map} — run tools/survey_dungeons.mjs`); continue; }
	const x = site.x, y = site.y;
	m.object_events.push({
		type: 'object', graphics_id: e.gfx, x, y, elevation: 3,
		movement_type: 'MOVEMENT_TYPE_FACE_DOWN', movement_range_x: 0, movement_range_y: 0,
		trainer_type: 'TRAINER_TYPE_NONE', trainer_sight_or_berry_tree_id: '0',
		script: e.script, flag: '0',
	});
	if (WRITE) fs.writeFileSync(mp, JSON.stringify(m));
	placed.push(`${e.name} -> ${e.map} @${x},${y}`);
}
console.log('\nplacement:');
for (const p of placed) console.log('  ' + p);

if (WRITE) {
	fs.writeFileSync(tPath, JSON.stringify(doc));
	console.log('\nWRITTEN to trainers.json + the Silver Cave maps');
	console.log('owdata is gitignored — deploy with:');
	console.log('  npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true');
} else {
	console.log('\n(dry run — pass --write to apply)');
}
