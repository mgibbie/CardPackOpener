// audit_missing_labels.mjs — script labels that are called but resolve NOWHERE.
//
// gen_shared_scripts.mjs recovered the bodies the decomps keep outside the map
// files, but it only followed labels a map OBJECT points at. A label that a map's
// OWN script calls was never pulled in: Pokemon Mansion's statues
// (`call PokemonMansion_EventScript_SecretSwitch`, 2026-10-04 Instinct) said
// "A secret switch! Press it?" and then nothing — events.js `_goto` returns false
// for a label it can't find, silently.
//
// This walks every call / goto / branch target in every map's scripts and checks
// it against everything the engine merges at load: the map's own labels,
// shared_scripts.json, the tracked overlays (multichoice_data shared + per-map
// patches, crystal_scriptvar_data, missing_labels_data), events.js COMMON stubs,
// and Crystal's std table.
//
//   node tools/audit_missing_labels.mjs            report
//   node tools/audit_missing_labels.mjs --write    also restore what the decomps
//       have (FireRed/Emerald, minus the families gen_shared_scripts.mjs
//       deliberately leaves out) into overworld/missing_labels_data.json — a
//       tracked overlay main.js merges under shared_scripts.json — with the
//       strings their msgs speak
//   node tools/audit_missing_labels.mjs --json     machine-readable report (tests)
//
// MAGEPUNK66=<path> points at the Magepunk66 checkout (default ../Magepunk66,
// which a git worktree breaks).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const WRITE = process.argv.includes('--write');
const JSON_OUT = process.argv.includes('--json');
// the Magepunk66 checkout: $MAGEPUNK66, else the first ancestor folder that has a
// Magepunk66 sibling (../Magepunk66 from the repo; a git worktree sits deeper)
const MP66 = process.env.MAGEPUNK66 || (() => {
	for (let d = path.resolve('.'); ; d = path.dirname(d)) {
		const c = path.join(path.dirname(d), 'Magepunk66');
		if (fs.existsSync(path.join(c, 'tools'))) return c;
		if (path.dirname(d) === d) return path.resolve('../Magepunk66');
	}
})();
const TR = path.join(MP66, 'tools/transpile_scripts.py');
const D = path.resolve('overworld/data');
const OVERLAY = path.resolve('overworld/missing_labels_data.json');
const log = (...a) => { if (!JSON_OUT) console.log(...a); };
// the same families gen_shared_scripts.mjs refuses to wake (no link play, natively
// reimplemented venues, unmodelled systems) — a body that fights the system that
// owns the object is worse than none
const SKIP = /cable_?club|union_?room|trade_?center|record_?corner|battle_?pike|battle_?pyramid|battle_?tower|battle_?dome|battle_?factory|battle_?arena|battle_?palace|battle_?tent|trainer_?tower|secret_?base|contest|berry_?blender|roulette|link_?contest|mystery_?(gift|event)/i;

// What --write restores. NOT everything the decomps have: many unresolved labels
// belong to systems this port runs natively (NPC trades, sailing, gift Pokémon,
// Silph Co's doors, the Petalburg Gym state, Trick House, the Elite Four, static
// legendaries) and a restored body would fight them — Emerald's
// Common_EventScript_ReadyPetalburgGymForBattle would add to VAR_PETALBURG_GYM_STATE
// on top of syncPetalburgGym (#645) and skip Norman's battle. So restoration is an
// explicit allow-list of self-contained, story-path labels; the rest is reported.
const ALLOW = [
	/^PokemonMansion_EventScript_/,          // the statue switches + every floor's doors (Instinct, 2026-10-04)
	/^EventScript_AwakenSnorlax$/,           // the Poké Flute song before the Route 12/16 Snorlax battle
	/^Aide_EventScript_/,                    // Prof. Oak's aides' replies (not enough caught / no room / declined)
	/^Common_EventScript_PlayerHandedOverTheItem$/,   // "handed over the LETTER / METEORITE" (Steven, Cozmo)
	/^RusturfTunnel_EventScript_SetRusturfTunnelOpen$/, // Rusturf Tunnel opens after Wanda's boyfriend digs through
	// FireRed's Elite Four rooms: the walk-in past the closed entry (Common_Movement_WalkUp5
	// — the entry row is solid; a scripted walk ignores it), the entry closing behind you
	// and each room's door opening after the win. Missing, you arrived at (6,12) facing a
	// wall in Lorelei's room and could only leave (door audit, 2026-10-07). Emerald's E4
	// (PokemonLeague_EliteFour_*) stays native.
	/^PokemonLeague_EventScript_(EnterRoom|CloseEntry|SetDoorOpen|OpenDoor|SetDoorOpenLance|OpenDoorLance)$/,
	// FireRed's move tutors reached by `goto` (Cinnabar Metronome, ...): the map
	// labels jump into pokefirered's shared move_tutors.inc (Instinct, 2026-10-05).
	// They teach through special ChooseMonForMoveTutor (ow_story.js).
	/^EventScript_(ThunderWave|DreamEater|Softboiled|Counter|Metronome|Mimic)(Tutor|Declined|Taught|TaughtMale|TaughtFemale)$/,
	/^CapeBrinkTutor_EventScript_FadeTaughtMove$/,   // the Cape Brink starter-move tutor's fade
	// static_pokemon.inc: a scripted static battle's ending — the object leaves
	// (removeobject VAR_LAST_TALKED). Missing, Power Plant's ELECTRODE item stayed
	// on the floor after its fight and could be fought again (Instinct, 2026-10-06).
	// The legendaries on these maps are native (ow_legendaries.js), not these scripts.
	/^EventScript_(RemoveStaticMon|MonFlewAway)$/,
];
const SHOW = process.argv.includes('--show');
const readJ = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return d; } };

// ---------- what the engine can resolve ----------
const shared = readJ(path.join(D, 'shared_scripts.json'), { scripts: {}, strings: {} });
const mc = readJ(path.resolve('overworld/multichoice_data.json'), { patches: {}, shared: {} });
const sv = readJ(path.resolve('overworld/crystal_scriptvar_data.json'), {});
const overlay = WRITE ? { scripts: {}, strings: {} } : readJ(OVERLAY, { scripts: {}, strings: {} });
const ev = fs.readFileSync(path.resolve('overworld/events.js'), 'utf8');
const commonStubs = new Set([...ev.matchAll(/^\t([A-Za-z0-9_]+):\s*\[/gm)].map(m => m[1]));
let crystalStd = new Set();
try { const { STD_OF } = await import('file:///' + path.resolve('overworld/crystal_stds.js').replace(/\\/g, '/')); crystalStd = new Set(Object.keys(STD_OF)); } catch (e) {}
const svOf = stem => (sv.maps || sv.patches || sv)[stem] || {};
const globalLabels = new Set([...Object.keys(shared.scripts || {}), ...Object.keys(mc.shared || {}), ...Object.keys(overlay.scripts || {}), ...commonStubs, ...crystalStd]);

const frMaps = new Set(fs.existsSync(path.join(MP66, 'Reference/pokefirered/data/maps')) ? fs.readdirSync(path.join(MP66, 'Reference/pokefirered/data/maps')) : []);
const gameOf = (stem, mapJ) => (mapJ && mapJ._crystal_tileset) ? 'crystal' : /^Hoenn2_/.test(stem) ? 'emerald' : frMaps.has(stem) ? 'firered' : 'emerald';

const targetsOf = ops => {
	const t = [];
	for (const o of ops || []) {
		if (!o || typeof o !== 'object') continue;
		for (const k of ['label', 'labelTrue', 'labelFalse']) if (typeof o[k] === 'string' && /^[A-Za-z_]\w*$/.test(o[k])) t.push(o[k]);
	}
	return t;
};

function audit() {
	const missing = new Map();   // label -> { game, maps:Set }
	for (const f of fs.readdirSync(path.join(D, 'scripts')).filter(f => f.endsWith('.json'))) {
		const stem = f.replace(/\.json$/, '');
		const own = readJ(path.join(D, 'scripts', f), {});
		const mapJ = readJ(path.join(D, 'maps', stem + '_map.json'), null);
		const game = gameOf(stem, mapJ);
		const local = new Set([...Object.keys(own), ...Object.keys(mc.patches?.[stem] || {}), ...Object.keys(svOf(stem))]);
		const bodies = [...Object.values(own), ...Object.values(mc.patches?.[stem] || {}), ...Object.values(svOf(stem))];
		for (const ops of bodies) if (Array.isArray(ops)) for (const t of targetsOf(ops)) {
			if (local.has(t) || globalLabels.has(t)) continue;
			if (!missing.has(t)) missing.set(t, { game, maps: new Set() });
			missing.get(t).maps.add(stem);
		}
	}
	// targets inside the shared bodies (and the overlay) themselves
	for (const ops of [...Object.values(shared.scripts || {}), ...Object.values(overlay.scripts || {})]) for (const t of targetsOf(ops)) {
		if (globalLabels.has(t)) continue;
		if (!missing.has(t)) missing.set(t, { game: 'shared', maps: new Set() });
		missing.get(t).maps.add('(shared)');
	}
	return missing;
}

let missing = audit();
const byGame = {};
for (const [l, { game }] of missing) byGame[game] = (byGame[game] || 0) + 1;
log(`unresolved call/goto/branch targets: ${missing.size}  ` + JSON.stringify(byGame));

if (WRITE) {
	// ---------- the decomp pool (FireRed + Emerald): shared files + every map's own ----------
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'misslbl-'));
	const pool = new Map(), text = new Map();
	for (const dec of ['pokefirered', 'pokeemerald']) {
		const data = path.join(MP66, 'Reference', dec, 'data');
		if (!fs.existsSync(data)) continue;
		const sOut = path.join(tmp, dec + '-shared.json'), tOut = path.join(tmp, dec + '-strings.json');
		execFileSync('python', [path.resolve('tools/shared_transpile.py'), data, sOut, tOut], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, MAGEPUNK66: MP66 } });
		for (const [k, v] of Object.entries(readJ(sOut, {}))) if (!pool.has(k)) pool.set(k, v);
		for (const [k, v] of Object.entries(readJ(tOut, {}))) if (!text.has(k)) text.set(k, v);
		const mOut = path.join(tmp, dec + '-maps');
		execFileSync('python', [TR, path.join(data, 'maps'), mOut], { stdio: ['ignore', 'ignore', 'inherit'] });
		for (const f of fs.readdirSync(path.join(mOut, 'scripts'))) {
			if (!f.endsWith('.json') || f === '_index.json') continue;
			for (const [k, v] of Object.entries(readJ(path.join(mOut, 'scripts', f), {}))) if (k !== '__map__' && !pool.has(k)) pool.set(k, v);
		}
		const sd = path.join(mOut, 'strings');
		if (fs.existsSync(sd)) for (const f of fs.readdirSync(sd)) for (const [k, v] of Object.entries(readJ(path.join(sd, f), {}))) if (!text.has(k)) text.set(k, v);
	}
	// ---------- pull each restorable target and what IT jumps to ----------
	const out = {};
	const pull = (label, depth) => {
		if (depth > 12 || out[label] || globalLabels.has(label) || !pool.has(label) || SKIP.test(label)) return;
		out[label] = pool.get(label);
		for (const t of targetsOf(pool.get(label))) pull(t, depth + 1);
	};
	for (const [label, info] of missing) if (info.game !== 'crystal' && ALLOW.some(r => r.test(label))) pull(label, 0);
	if (SHOW) for (const [k, v] of Object.entries(out)) log('  BODY', k, JSON.stringify(v).slice(0, 600));
	const strings = {};
	for (const ops of Object.values(out)) for (const o of ops) {
		if (o?.op === 'msg' && typeof o.text === 'string' && text.has(o.text) && !(shared.strings || {})[o.text]) strings[o.text] = text.get(o.text);
	}
	fs.writeFileSync(OVERLAY, JSON.stringify({ generated: 'tools/audit_missing_labels.mjs', scripts: out, strings }, null, 0) + '\n');
	log(`restored ${Object.keys(out).length} labels (+${Object.keys(strings).length} strings) into ${path.relative(process.cwd(), OVERLAY)}`);
	for (const l of Object.keys(out)) globalLabels.add(l);
	missing = audit();
	log(`still unresolved after restoring: ${missing.size}`);
}

const rows = [...missing].map(([label, i]) => ({ label, game: i.game, maps: [...i.maps].sort() })).sort((a, b) => a.game.localeCompare(b.game) || a.label.localeCompare(b.label));
if (JSON_OUT) { console.log(JSON.stringify({ unresolved: rows })); }
else {
	let g = null;
	for (const r of rows) { if (r.game !== g) { g = r.game; log(`\n[${g}]`); } log(`  ${r.label}  <- ${r.maps.slice(0, 4).join(', ')}${r.maps.length > 4 ? ` +${r.maps.length - 4}` : ''}`); }
}
