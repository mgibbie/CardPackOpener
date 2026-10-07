// gen_pokeblock_data.mjs — the POKeBLOCK data and scripts from pokeemerald, into
// the tracked overlay overworld/pokeblock_data.json.
//
//   berries   the 43 berries in ITEM_TO_BERRY order (src/berry.c gBerries):
//             name, the five flavors (spicy, dry, sweet, bitter, sour) and
//             smoothness — what the BERRY BLENDER adds up (CalculatePokeblock)
//   scripts   the Lilycove Contest Lobby's three BERRY BLENDERS and the Blend
//             Master (data/scripts/berry_blender.inc), the Safari Zone's
//             POKeBLOCK FEEDER (data/scripts/safari_zone.inc) and the contest
//             receptionist's POKeBLOCK CASE gift (data/scripts/contest_hall.inc).
//             gen_shared_scripts / audit_missing_labels skip the berry_blender
//             and contest families on purpose (their venues were native), so the
//             blender machines and their NPCs said nothing the decomp wrote.
//             The link blender (wireless/cable) is left out: there is no link.
//   strings   the text those scripts speak
//
// main.js merges `scripts`/`strings` under shared_scripts.json, like
// missing_labels_data.json; pokeblock.js reads `berries`.
//
//   node tools/gen_pokeblock_data.mjs
//
// MAGEPUNK66=<path> points at the Magepunk66 checkout (default: the first
// ancestor folder with a Magepunk66 sibling).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const MP66 = process.env.MAGEPUNK66 || (() => {
	for (let d = path.resolve('.'); ; d = path.dirname(d)) {
		const c = path.join(path.dirname(d), 'Magepunk66');
		if (fs.existsSync(path.join(c, 'tools'))) return c;
		if (path.dirname(d) === d) return path.resolve('../Magepunk66');
	}
})();
const EM = path.join(MP66, 'Reference', 'pokeemerald');
const OUT = path.resolve('overworld/pokeblock_data.json');

// ---------- berries ----------
const src = fs.readFileSync(path.join(EM, 'src/berry.c'), 'utf8');
const body = src.slice(src.indexOf('const struct Berry gBerries[]'));
const berries = [];
for (const m of body.matchAll(/\[ITEM_(\w+)_BERRY - FIRST_BERRY_INDEX\]\s*=\s*\{([\s\S]*?)\n\s*\},/g)) {
	const f = k => +(new RegExp(`\\.${k} = (\\d+)`).exec(m[2]) || [0, 0])[1];
	const name = /\.name = _\("([^"]*)"\)/.exec(m[2])[1];
	berries.push({ id: m[1].toLowerCase().replace(/_/g, '') + 'berry', name, flavors: [f('spicy'), f('dry'), f('sweet'), f('bitter'), f('sour')], smoothness: f('smoothness') });
}
if (berries.length !== 43) throw new Error(`expected 43 berries, got ${berries.length}`);

// ---------- scripts ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pokeblock-'));
const sOut = path.join(tmp, 'shared.json'), tOut = path.join(tmp, 'strings.json');
execFileSync('python', [path.resolve('tools/shared_transpile.py'), path.join(EM, 'data'), sOut, tOut],
	{ stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, MAGEPUNK66: MP66 } });
const pool = JSON.parse(fs.readFileSync(sOut, 'utf8'));
const text = JSON.parse(fs.readFileSync(tOut, 'utf8'));

const LINK = /Link|TwoPlayer|ThreePlayer|FourPlayer|DecideLink|TryLeadGroup|TryJoinGroup|TryBecomeLinkLeader|TryJoinLinkGroup/;
const WANT = [
	...Object.keys(pool).filter(l => /^BerryBlender_EventScript_/.test(l) && !LINK.test(l)),
	'EventScript_PokeBlockFeeder', 'SafariZone_EventScript_ChoosePokeblock',
	'SafariZone_EventScript_PokeblockPlaced', 'SafariZone_EventScript_PokeblockPresent',
	'LilycoveCity_ContestLobby_EventScript_GivePokeblockCase',
];
// berry_blender.inc: `.set NUM_OPPONENTS, VAR_0x8009`
const fix = v => (v === 'NUM_OPPONENTS' ? 'VAR_0x8009' : v);
const scripts = {}, strings = {};
for (const l of WANT) {
	if (!pool[l]) throw new Error('missing ' + l);
	scripts[l] = pool[l].map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? fix(v) : v])));
	for (const o of scripts[l]) if (o.op === 'msg' && typeof o.text === 'string' && text[o.text]) strings[o.text] = text[o.text];
}
// a goto/call into a label we didn't take would silently stop the script
for (const [l, ops] of Object.entries(scripts)) for (const o of ops) {
	const t = o.label;
	if (t && !scripts[t] && /^(BerryBlender|SafariZone|EventScript_PokeBlock)/.test(t)) throw new Error(`${l} jumps to ${t}, not restored`);
}

fs.writeFileSync(OUT, JSON.stringify({ generated: 'tools/gen_pokeblock_data.mjs', berries, scripts, strings }) + '\n');
console.log(`${berries.length} berries, ${Object.keys(scripts).length} labels, ${Object.keys(strings).length} strings -> ${path.relative(process.cwd(), OUT)}`);
