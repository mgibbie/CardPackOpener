// mm_explore.mjs — a headless auto-explorer for Mystery Maze (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md stage 10): plays a
// dungeon many times with a simple, sensible leader and prints how the runs end, so its numbers can be tuned.
// The leader: eats when hungry or hurt, attacks what is next to it (a move when it has PP and SP, else the plain
// Attack), RESTS (waits) while anyone in the party is hurt and no foe is in sight, picks up items on its way, and
// otherwise walks the shortest way to the stairs. It is CAREFUL (--reckless: it is not): hurt with a crowd or the boss in
// sight it uses a Slumber or Petrify Orb; it throws a Sleep or Stun Seed at the boss, or at whoever is on it when it is
// hurt; about to fall, it leaves by an Escape Orb. All only if it carries one. Partners play themselves.
//   node tools/poketactica/mm_explore.mjs [--dungeon=whisper-woods | all] [--runs=30] [--level=5 | suggested] [--party=a,b,c] [--max=12000]
// With no --party it takes the party a player would have at that level: the three starters and a bird, evolved as far as
// their level allows, as many as the dungeon lets in.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { DIR8, cheb } from '../../poketactica/js/mm/shapes8.js';
import { dungeonById, DUNGEONS, dungeonLevels } from '../../poketactica/js/mm/dungeons.js';
import { ITEMS, usable } from '../../poketactica/js/mm/items.js';
import { aimsAtFoes, foesInSight } from '../../poketactica/js/mm/ai.js';
import { ATTACK, moveFor } from '../../poketactica/js/mm/combat.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { slimFig } from '../../poketactica/js/replay.js';
import { makeRng } from '../../overworld/rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
export const loadData = () => ({ species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') });

/** The auto-explorer's next action for the leader. */
export function chooseAction(S, data, opts = {}) {
	const u = MM.leaderOf(S), W = S.F.w;
	const slot = (test) => S.bag.findIndex((it) => !it.sticky && usable(it.id) && test(ITEMS[it.id], it));
	if (S.belly <= 150) { const i = slot((d) => d.group === 'food'); if (i >= 0) return { t: 'use', slot: i }; }
	if (u.hp < u.maxHP * 0.4) { const i = slot((d) => d.heal); if (i >= 0) return { t: 'use', slot: i }; }
	// CAREFUL (owner: "a careful party at the suggested level usually comes back"): about to fall with nothing left to eat,
	// or down to the last one standing with a foe on it, it leaves by an Escape Orb if it has one. The run is lost, the figurines are not.
	if (!opts.reckless && foesInSight(S, u).length && (u.hp < u.maxHP * 0.3 || (MM.partyOf(S).length === 1 && S.fallen.length > 0 && u.hp < u.maxHP * 0.6))) { const i = slot((d) => d.escape); if (i >= 0) return { t: 'use', slot: i }; }
	if (u.status && u.status !== 'slp') { const i = slot((d) => d.cure && d.cure.includes(u.status)); if (i >= 0) return { t: 'use', slot: i }; }
	const near = aimsAtFoes(S, u, ATTACK);
	if (!opts.reckless) {
		// a crowd (or the boss) in sight and it is hurt: an orb that stops them all
		const seen = foesInSight(S, u).filter((f) => !f.nap && f.status !== 'slp' && !f.stone);
		if ((seen.length >= 3 || (seen.length >= 2 && u.hp < u.maxHP * 0.7) || (seen.some((f) => f.boss) && u.hp < u.maxHP * 0.7))) { const i = slot((d) => d.room === 'slp' || d.room === 'stone'); if (i >= 0) return { t: 'use', slot: i }; }
		// the one in front of it, when it is hurt or that one is the boss: a Sleep Seed or a Stun Seed thrown at it
		if (near.length) {
			const foe = MM.unitAt(S, near[0][0], near[0][1]);
			if (foe && !foe.status && !foe.stone && (foe.boss || u.hp < u.maxHP * 0.6)) {
				const i = slot((d) => d.status === 'slp' || d.status === 'par');
				if (i >= 0) { const d = DIR8.findIndex(([dx, dy]) => u.x + dx === near[0][0] && u.y + dy === near[0][1]); return u.dir !== d ? { t: 'face', d } : { t: 'throw', slot: i }; }
			}
		}
	}
	if (near.length) {
		// (a shopkeeper close by: nothing that covers more than one tile. Its Razor Leaf caught the shopkeeper, who then took the party apart.)
		const shop = !opts.reckless && S.units.some((o) => o.keeper && !o.hostile && o.hp > 0 && cheb(o.x, o.y, u.x, u.y) <= 4);
		for (const id of u.fig.equipped) {
			const m = moveFor(u, id, data);
			if (shop && m && m.s !== 'one') continue;
			if (!m || m.category === 'Status' || (u.pp[id] || 0) < 1 || u.sp < m.spCost || (u.sealed || []).includes(id)) continue;
			const aims = aimsAtFoes(S, u, m);
			if (aims.length) return { t: 'move', id, x: aims[0][0], y: aims[0][1] };
		}
		const d = DIR8.findIndex(([dx, dy]) => u.x + dx === near[0][0] && u.y + dy === near[0][1]);
		return u.dir !== d ? { t: 'face', d } : { t: 'attack' };
	}
	// rest: nobody in sight, someone hurt, and food to spare (a full heal takes 200 turns; a belly lasts 1,000)
	if (S.belly > 300 && !foesInSight(S, u).length && MM.partyOf(S).some((p) => p.hp < p.maxHP * 0.75 && p.status !== 'psn' && p.status !== 'tox')) return { t: 'pass' };
	const boss = S.units.find((o) => o.boss && o.hp > 0);
	const [sx, sy] = S.F.stairs;
	if (u.x === sx && u.y === sy && !boss) return { t: 'stairs' };
	const item = S.bag.length < 20 ? S.items.filter((o) => !o.shop && S.seen[o.y * W + o.x]).sort((a, b) => cheb(a.x, a.y, u.x, u.y) - cheb(b.x, b.y, u.x, u.y))[0] : null;
	// (an item it cannot walk to, across water or lava, is not a goal: it stood and starved waiting for one)
	const goals = [...(item && cheb(item.x, item.y, u.x, u.y) <= 8 ? [[item.x, item.y]] : []), boss ? [boss.x, boss.y] : [sx, sy]];
	for (const goal of goals) {
		const dist = MM.walkMap(S.F, u, goal[0], goal[1]), here = dist[u.y * W + u.x];
		if (here > 0) for (let d = 0; d < 8; d++) if (MM.canWalk(S.F, u, d) && dist[(u.y + DIR8[d][1]) * W + u.x + DIR8[d][0]] === here - 1 && !MM.actBlock(S, { t: 'step', d }, data)) return { t: 'step', d };
	}
	// nowhere to go (the stairs are across liquid for this leader, or the way is blocked): a Warp Seed, else any step
	{ const i = slot((dd, it) => it.id === 'warpseed'); if (i >= 0) return { t: 'use', slot: i }; }
	for (let k = 0; k < 8; k++) { const d = (S.turns + k) % 8; if (MM.canWalk(S.F, u, d) && !MM.actBlock(S, { t: 'step', d }, data)) return { t: 'step', d }; }
	return { t: 'pass' };
}
/** One run, played to its end (or `max` actions). -> { over, floor, fallen, kills, level, actions, why: { what knocked a figurine out: how many } } */
export function explore(seed, dungeon, party, data, max = 4000, opts = {}) {
	const S = MM.newRun(seed, { dungeon, party: party.map(slimFig), bag: opts.bag || [], stars: opts.stars || 0 }, data);
	let n = 0;
	const why = {};
	for (; n < max && !S.over; n++) {
		const who = Object.fromEntries(S.units.map((u) => [u.uid, u.boss ? 'the boss' : u.keeper ? 'a shopkeeper' : S.house && (S.F.terrain[u.y * S.F.w + u.x] & 0x40) ? 'a Monster House' : 'a wild Pokémon']));
		let last = null;
		for (const e of MM.act(S, chooseAction(S, data, opts), data)) {
			if (e.t === 'hit') last = who[e.uid] || 'a wild Pokémon';
			else if (e.t === 'hurt') last = e.why === 'hunger' ? 'hunger' : e.why === 'psn' || e.why === 'tox' || e.why === 'brn' ? 'poison or a burn' : ['spike', 'chestnut', 'blast', 'gust', 'pitfall'].includes(e.why) ? 'a trap' : last;
			else if (e.t === 'lost' && !e.recruit) why[last || '?'] = (why[last || '?'] || 0) + 1;
		}
	}
	const L = MM.leaderOf(S);
	return { over: S.over, floor: S.floorNo, actions: n, fallen: S.fallen.length, kills: S.kills, level: L ? L.level : 0, recruits: S.recruits.length, stars: S.stars, bag: S.bag.length, why };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
	const data = loadData(), runs = +arg('runs', 30), level = +arg('level', 5) || 5, max = +arg('max', 12000);
	const LINES = [['bulbasaur', 16, 'ivysaur', 32, 'venusaur'], ['charmander', 16, 'charmeleon', 36, 'charizard'], ['squirtle', 16, 'wartortle', 36, 'blastoise'], ['pidgey', 18, 'pidgeotto', 36, 'pidgeot']];
	const grown = (lv) => LINES.map(([a, l1, b, l2, c]) => (lv >= l2 ? c : lv >= l1 ? b : a));
	const which = arg('dungeon', 'whisper-woods') === 'all' ? DUNGEONS.filter((d) => !d.endless) : [dungeonById(arg('dungeon', 'whisper-woods'))];
	for (const d of which) {
		const sug = (dungeonLevels(d) || {}).suggest || 5, lvl = arg('level', '') === 'suggested' ? sug : level;
		const names = arg('party', '') ? arg('party', '').split(',') : grown(d.lv5 ? 5 : lvl);
		const party = names.slice(0, d.party).map((sp, i) => makeFigurine(sp, lvl, makeRng('x' + sp + lvl), data, { id: sp + '-x' + i, shinyRate: 0 }));
		const out = [];
		for (let k = 0; k < runs; k++) out.push(explore('explore-' + d.id + '-' + k, d, party, data, max, { reckless: process.argv.includes('--reckless') }));
		const won = out.filter((o) => o.over && o.over.won).length, fled = out.filter((o) => o.over && o.over.escaped).length, wiped = out.filter((o) => o.over && !o.over.won && !o.over.escaped).length, avg = (f) => (out.reduce((a, o) => a + f(o), 0) / out.length).toFixed(1);
		console.log(`${d.name} (${d.endless ? 'endless' : d.floors.length + 'F'}), ${party.length} at Lv ${d.lv5 ? 5 : lvl}: cleared ${won}/${runs}, escaped ${fled}, wiped ${wiped}, unfinished ${runs - won - wiped - fled} · avg floor ${avg((o) => o.floor)} · fallen/run ${avg((o) => o.fallen)} · knockouts ${avg((o) => o.kills)} · leader ends Lv ${avg((o) => o.level)} · actions ${avg((o) => o.actions)}`);
		const causes = {}; for (const o of out) for (const [k, v] of Object.entries(o.why)) causes[k] = (causes[k] || 0) + v;
		if (Object.keys(causes).length) console.log('    lost to: ' + Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ×' + v).join(', '));
	}
}
