// triage_specials.mjs — sort every `special` the port does not implement by what
// its silence actually costs a player.
//
// main.js runSpecial() has ~35 cases; everything else falls to a default that
// does nothing (a store-writing query gets 0). 423 distinct names reach that
// default. Most are harmless — a fade, a music cue, a camera shake — but some
// were the whole mechanism of a story beat (DoSSAnneDepartureCutscene, the
// Mauville gym switches, SetVermilionTrashCans). This separates the two.
//
// Per call site it decides:
//   kind      cosmetic  — visual/audio/window only; a no-op is invisible
//             query     — its answer is read by a following branch; a no-op
//                         answers 0 and the script silently takes that path
//             action    — changes game state (party, items, map, flags...)
//   where     facility  — optional venues this port reimplements natively or
//                         does not model (Frontier, Tower, Contest, Game Corner,
//                         fan club, link/mystery gift, lottery, TV...)
//             story     — anything else
//   stakes    the script it sits in goes on to set a flag, warp, give, or
//             hide/show an object — i.e. progress rides on it
//
// Tiers:  HIGH   story + (action|query) + stakes
//         MED    story + (action|query), no stakes in the same script
//         LOW    facility, or cosmetic anywhere
//
//   node tools/triage_specials.mjs            (summary + HIGH/MED detail)
//   node tools/triage_specials.mjs --all      (every name)
import fs from 'fs';

const D = 'overworld/data/scripts';
const main = fs.readFileSync('overworld/main.js', 'utf8');
const rsAt = main.indexOf('function runSpecial(');
const rs = main.slice(rsAt, main.indexOf('\n}\n', rsAt));
const handled = new Set([...rs.matchAll(/case '([A-Za-z0-9_]+)'/g)].map(m => m[1]));

const COSMETIC = /Fade|Music|Sound|SE$|Cry|Sprite|Palette|Shake|Camera|Window|Menu|Anim|Screen|Weather|Flash|Draw|Reload|Wait|Blink|Rotat|Particle|Emote|Tile(?!Collision)|Print|Buffer|String|Nickname|Show[A-Z](?!.*Mon)|Close[A-Z]|Remove[A-Z].*(Window|Menu)|Record|QuestLog|Tv|TV|Link|Spin|Cutscene_?Fade|Pan|Scroll|Door(Anim)?|Bike(Music)?|Signpost|Textbox|Money(Box|TopRight)|PlaceMoney|DisplayCoin|HideMoney/;
const FACILITY = /BattleFrontier|BattleTower|BattleDome|BattlePalace|BattleArena|BattleFactory|BattlePike|BattlePyramid|TrainerHill|TrainerTower|BattleTent|Contest|GameCorner|Slot|Roulette|FanClub|Fans?Of|MysteryGift|MysteryEvent|Union|WirelessClub|CableClub|Colosseum|TradeCenter|Lottery|Lotto|Tv|TV|Berry(Blender|Crush|Powder)|Pokeblock|DirectCorner|RecordCorner|Mobile|SecretBase|Decoration|DewfordTrend|Trendy|Bard|Storyteller|Giddy|Hipster|Trader|Bravo|MatchCall|Rematch|Registered|Frontier|Ranking/;
const STAKES = new Set(['setflag', 'clearflag', 'warp', 'give', 'givemon', 'hideobj', 'showobj', 'setvar', 'takeitem']);

// ---- reachability: can a player actually cause this label to run? ----
// Entry points: object/sign/step-trigger scripts, the map's onFrame/onTransition
// hooks (onLoad only on the maps main.js enables it for), and trainers'
// post-battle `<script>.Script`. Then follow goto/call/branch. Labels main.js
// intercepts before they run (NPC trades, radios) or blocks outright
// (Frontier / Trainer Hill / battle tents) do not count.
const Trades = await import('../overworld/trades.js').catch(() => null);
const { ONLOAD_MAPS } = await import('../overworld/gym_puzzles.js');
const blocked = l => /^BattleFrontier_|^TrainerHill_|_BattleTent/.test(l) || /Radio$/.test(l);
function reachableLabels(map, prog) {
	let m = null; try { m = JSON.parse(fs.readFileSync(`overworld/data/maps/${map}_map.json`, 'utf8')); } catch {}
	const entry = new Set();
	for (const o of (m?.object_events || [])) { if (o.script && o.script !== '0x0') { entry.add(o.script); entry.add(o.script + '.Script'); } }
	for (const b of (m?.bg_events || [])) if (b.script && b.script !== '0x0') entry.add(b.script);
	for (const c of (m?.coord_events || [])) if (c.script && c.script !== '0x0') entry.add(c.script);
	const meta = prog.__map__ || {};
	if (meta.onTransition) entry.add(meta.onTransition);
	if (meta.onLoad && ONLOAD_MAPS.has(map)) entry.add(meta.onLoad);
	for (const f of (meta.onFrame || [])) if (f.label) entry.add(f.label);
	const seen = new Set(), q = [...entry];
	while (q.length) {
		const l = q.pop();
		if (seen.has(l) || !prog[l] || blocked(l)) continue;
		if (Trades?.forScript && Trades.forScript(map, l)) continue;
		seen.add(l);
		for (const o of prog[l]) if (o && o.label) q.push(o.label);
	}
	return seen;
}

const uses = [];   // { name, map, label, kind, facility, stakes, reachable }
for (const f of fs.readdirSync(D)) {
	if (!f.endsWith('.json')) continue;
	const map = f.replace(/\.json$/, '');
	let prog; try { prog = JSON.parse(fs.readFileSync(`${D}/${f}`, 'utf8')); } catch { continue; }
	const reach = reachableLabels(map, prog);
	for (const [label, ops] of Object.entries(prog)) {
		if (!Array.isArray(ops)) continue;
		ops.forEach((op, i) => {
			if (!op || op.op !== 'special' || !op.name || handled.has(op.name)) return;
			const name = op.name;
			const after = ops.slice(i + 1);
			// read by what follows? (store var, or VAR_RESULT, compared in the next few ops)
			const reads = op.store || 'VAR_RESULT';
			const isQuery = !!op.store || after.slice(0, 4).some(o => o && o.op === 'branch' && o.cond && o.cond.var === reads);
			const kind = COSMETIC.test(name) && !isQuery ? 'cosmetic' : isQuery ? 'query' : 'action';
			const facility = FACILITY.test(name) || FACILITY.test(label) || FACILITY.test(map);
			const stakes = after.some(o => o && STAKES.has(o.op)) || after.some(o => o && (o.op === 'goto' || o.op === 'call') && /Give|Receive|Obtain/i.test(o.label || ''));
			uses.push({ name, map, label, kind, facility, stakes, reachable: reach.has(label) });
		});
	}
}

// unreachable call sites cannot hurt anyone, whatever they do
const tierOf = u => !u.reachable || u.kind === 'cosmetic' || u.facility ? 'LOW' : u.stakes ? 'HIGH' : 'MED';
const byName = new Map();
for (const u of uses) {
	const t = tierOf(u);
	const e = byName.get(u.name) || { name: u.name, n: 0, tiers: { HIGH: 0, MED: 0, LOW: 0 }, kinds: new Set(), sites: [] };
	e.n++; e.tiers[t]++; e.kinds.add(u.kind);
	if (t !== 'LOW') e.sites.push(`${u.map}::${u.label}`);
	byName.set(u.name, e);
}
const names = [...byName.values()];
const top = e => (e.tiers.HIGH ? 'HIGH' : e.tiers.MED ? 'MED' : 'LOW');
const count = t => names.filter(e => top(e) === t);
console.log(`unhandled specials: ${names.length} names, ${uses.length} call sites (runSpecial handles ${handled.size})\n`);
for (const t of ['HIGH', 'MED', 'LOW']) {
	const list = count(t);
	console.log(`${t.padEnd(5)} ${String(list.length).padStart(4)} names  ${String(list.reduce((a, e) => a + e.n, 0)).padStart(5)} sites`);
}
const show = t => {
	const list = count(t).sort((a, b) => b.tiers[t] - a.tiers[t] || b.n - a.n);
	console.log(`\n==== ${t} ====`);
	for (const e of list) {
		const eg = [...new Set(e.sites)].slice(0, 2).join('  |  ');
		console.log(`${String(e.tiers[t]).padStart(4)}  ${e.name.padEnd(40)} ${[...e.kinds].join('/').padEnd(16)} ${eg}`);
	}
};
show('HIGH');
if (process.argv.includes('--all') || process.argv.includes('--med')) show('MED');
if (process.argv.includes('--all')) show('LOW');
