// token_name_rules_test.mjs — a token's rules must not be its NAME, part 2 (Plans/IMPROVEMENT_PLAN_2026_11.md 4a).
//
// token_clause_test.mjs fixed the two cards a tester reported (BEEEES!!!, Al'ar) and the "attack a random enemy" family.
// A sweep of cards.json for the same fault found sixteen more: a plain `summon` (or `equip`) whose NAME carried the
// rule, so the card made ONE token called e.g. "Glowfly for each spell in your hand" and the rule never happened.
//   counts      Glowfly Swarm, Wispering Woods, Derailed Coaster, Coral Keeper, Kargal Battlescar, Flight Master,
//               Deathborne ("for each ...")
//   keywords    Derailed Coaster (Rush), Crop Rotation (Rush, dies at end of turn), Hailbringer (Freeze),
//               Sleep Paralysis (Taunt, can't attack), Hench-Clan Hag (all creature types), Cookie the Cook's weapon
//               (Lifesteal), the Adventurers of Devouring Ectoplasm / Party Up! / Final Gasp (a random bonus)
//   an effect   Pterrordax Egg (its Pterrordax steals 1 Health from every other creature)
// Each is PLAYED here; on the old cards.json every section fails. No mana cost is changed.
//
//   node battlecards/tests/regression/token_name_rules_test.mjs
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._wall = { id: '_wall', name: 'Wall', type: 'creature', cost: 2, attack: 0, health: 40, rarity: 'common' };
byId._thin = { id: '_thin', name: 'Thin', type: 'creature', cost: 1, attack: 1, health: 2, rarity: 'common' };
byId._one = { id: '_one', name: 'One', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
byId._bolt = { id: '_bolt', name: 'Bolt', type: 'instant', cost: 1, rarity: 'common', effects: [] };

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };

const ME = 0, FOE = 1;
function game(seed = 5) {
	const st = E.createGame(byId, seededRng(seed), null, 2,
		[{ id: 'mage', name: 'You', power: null }, { id: 'mage', name: 'Foe', power: null }]);
	st.current = ME; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana = { cur: 10, max: 10, bonus: 0 }; }
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; };
const hand = (st, pi, ...ids) => { for (const id of ids) { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); } };
const live = (st, pi, name) => st.players[pi].board.filter(c => c.name === name && !E.isDead(c));
const names = (st, pi) => st.players[pi].board.map(c => c.name).join(' | ');
const kw = (c, k) => (c.keywords || []).includes(k);
const run = (st, id, target = null, source = null) => E.execEffects(st, ME, byId[id].effects, target, source);
const noRuleNames = (st) => st.players.every(p => p.board.every(c => !/ (for each|with|that) /.test(c.name)));

// ---------- no token or weapon in the pool is NAMED with a rule any more ----------
{
	const bad = [];
	const walk = (o, id) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { o.forEach(v => walk(v, id)); return; } if ((o.type === 'summon' || o.type === 'equip') && typeof o.name === 'string' && / (for each|with|that|whose|which|equal to|until) /i.test(o.name)) bad.push(id + ': ' + o.name); for (const k of Object.keys(o)) walk(o[k], id); };
	for (const c of raw.cards) walk(c, c.id);
	ok('no summon or equip in cards.json has a rule for a name', bad.length === 0, bad.join(' ;; '));
}

// ---------- "for each ..." ----------
{
	const st = game(); hand(st, ME, '_bolt', '_bolt', '_bolt', '_thin');
	run(st, 'glowfly_swarm');
	ok('Glowfly Swarm: three spells in hand -> three 2/2 Glowflies', live(st, ME, 'Glowfly').length === 3 && live(st, ME, 'Glowfly').every(c => c.attack === 2 && c.maxHealth === 2) && noRuleNames(st), names(st, ME));
	const s0 = game(); hand(s0, ME, '_thin'); run(s0, 'glowfly_swarm');
	ok('...and none with no spell in hand', s0.players[ME].board.length === 0, names(s0, ME));
}
{
	const st = game(); hand(st, ME, '_bolt', '_thin', '_thin', '_one');
	run(st, 'wispering_woods');
	ok('Wispering Woods: four cards in hand -> four 1/1 Wisps', live(st, ME, 'Wisp').length === 4 && noRuleNames(st), names(st, ME));
}
{
	const st = game(); hand(st, ME, '_bolt', '_thin', '_one');
	run(st, 'derailed_coaster');
	const r = live(st, ME, 'Rider');
	ok('Derailed Coaster: two creatures in hand -> two 1/1 Riders with Rush', r.length === 2 && r.every(c => kw(c, 'rush') && c.attack === 1) && noRuleNames(st), names(st, ME));
}
{
	const st = game(); st.players[ME].schoolsCastGame = { Fire: true, Frost: true, Arcane: true };
	run(st, 'coral_keeper');
	ok('Coral Keeper: three spell schools cast this game -> three 3/3 Elementals', live(st, ME, 'Elemental').length === 3 && live(st, ME, 'Elemental').every(c => c.attack === 3 && /Elemental/.test(c.tribe || '')), names(st, ME));
	const s0 = game(); run(s0, 'coral_keeper');
	ok('...and none when no school was cast', s0.players[ME].board.length === 0, names(s0, ME));
}
{
	const st = game();
	E.summon(st, ME, byId.far_watch_post); E.summon(st, ME, byId.crossroads_watch_post); E.summon(st, FOE, byId.morshan_watch_post);
	ok('a Watch Post entering play is counted for its controller', st.players[ME].watchPostsSummoned === 2 && st.players[FOE].watchPostsSummoned === 1, JSON.stringify([st.players[ME].watchPostsSummoned, st.players[FOE].watchPostsSummoned]));
	run(st, 'kargal_battlescar');
	ok('Kargal Battlescar: two Watch Posts came in under you -> two 5/5 Lookouts', live(st, ME, 'Lookout').length === 2 && live(st, ME, 'Lookout').every(c => c.attack === 5 && c.maxHealth === 5), names(st, ME));
	const s0 = game(); run(s0, 'kargal_battlescar');
	ok('...and none with no Watch Post', s0.players[ME].board.length === 0, names(s0, ME));
}
{
	const st = game(); run(st, 'flight_master');
	ok('Flight Master: a 2/2 Gryphon for EACH player', live(st, ME, 'Gryphon').length === 1 && live(st, FOE, 'Gryphon').length === 1, names(st, ME) + ' // ' + names(st, FOE));
}
{
	const st = game();
	put(st, ME, '_one'); put(st, FOE, '_thin'); put(st, FOE, '_one'); const wall = put(st, FOE, '_wall');
	run(st, 'deathborne');
	const sk = live(st, ME, 'Volatile Skeleton');
	ok('Deathborne: 2 damage to all creatures', E.hp(wall) === 38, 'wall ' + E.hp(wall));
	ok('...three died of it -> three Volatile Skeletons (the real card: its Deathrattle is theirs)', sk.length === 3 && sk.every(c => c.attack === 2 && c.maxHealth === 2 && (c.deathrattle || []).length > 0), names(st, ME));
	const s0 = game(); put(s0, FOE, '_wall'); run(s0, 'deathborne');
	ok('...and none when nothing dies', s0.players[ME].board.length === 0, names(s0, ME));
}

// ---------- keywords ----------
{
	const st = game(); run(st, 'crop_rotation');
	const u = live(st, ME, 'Undead');
	ok('Crop Rotation: four 1/1 Undead with Rush', u.length === 4 && u.every(c => kw(c, 'rush') && /Undead/.test(c.tribe || '')), names(st, ME));
	ok('...marked to die at the end of this turn', u.every(c => c.doomTurn === st.turnNumber), JSON.stringify(u.map(c => c.doomTurn)));
	E.endTurn(st);
	ok('...and at the end of the turn they are gone', live(st, ME, 'Undead').length === 0, names(st, ME));
}
{
	const st = game(); run(st, 'hailbringer');
	const sh = live(st, ME, 'Ice Shard'), wall = put(st, FOE, '_wall');
	ok('Hailbringer: two 1/1 Ice Shards that Freeze', sh.length === 2 && sh.every(c => kw(c, 'freezer')), names(st, ME));
	sh[0].sick = false;
	E.resolveCombat(st, ME, sh[0].uid, { type: 'creature', uid: wall.uid, player: FOE });
	ok('...what an Ice Shard hits is Frozen', !!wall.frozen, JSON.stringify({ frozen: wall.frozen }));
}
{
	const st = game();
	E.execEffects(st, ME, byId.sleep_paralysis.choices[0].effects, null, null);
	const d = live(st, ME, 'Demon');
	ok("Sleep Paralysis: two 3/6 Demons with Taunt that can't attack", d.length === 2 && d.every(c => kw(c, 'taunt') && kw(c, 'pacifist') && c.attack === 3 && c.maxHealth === 6 && /Demon/.test(c.tribe || '')), names(st, ME));
	d[0].sick = false;
	const free = put(st, ME, '_thin');
	ok("...the engine does not let one attack (a plain creature beside it may)", E.canAttackWith(st, ME, d[0]) === false && E.canAttackWith(st, ME, free) === true, JSON.stringify([E.canAttackWith(st, ME, d[0]), E.canAttackWith(st, ME, free)]));
}
{
	const st = game(); run(st, 'hench_clan_hag');
	const a = live(st, ME, 'Amalgam');
	ok('Hench-Clan Hag: two 1/1 Amalgams with all creature types', a.length === 2 && a.every(c => c.tribe === 'All'), names(st, ME) + ' ' + JSON.stringify(a.map(c => c.tribe)));
}
{
	const st = game();
	E.execEffects(st, ME, byId.cookie_the_cook.deathrattle, null, null);
	const w = st.players[ME].weapon;
	ok('Cookie the Cook: a 2/3 weapon named "Stirring Rod" with Lifesteal', !!w && w.name === 'Stirring Rod' && w.attack === 2 && w.durability === 3 && kw(w, 'lifesteal'), JSON.stringify(w && { name: w.name, kw: w.keywords }));
}
{
	const BONUS = ['taunt', 'divine_shield', 'rush', 'stealth', 'windfury', 'lifesteal', 'poisonous'];
	const st = game(); run(st, 'party_up');
	const a = live(st, ME, 'Adventurer');
	ok('Party Up!: five 2/2 Adventurers, each with ONE random bonus', a.length === 5 && a.every(c => c.attack === 2 && c.maxHealth === 2 && (c.keywords || []).filter(k => BONUS.includes(k)).length === 1), JSON.stringify(a.map(c => c.keywords)));
	const seen = new Set(); for (let s = 1; s <= 12; s++) { const g = game(s); run(g, 'party_up'); for (const c of live(g, ME, 'Adventurer')) seen.add(c.keywords.find(k => BONUS.includes(k))); }
	ok('...over a dozen games the bonus varies (at least four kinds)', seen.size >= 4, [...seen].join(','));
	ok('...and each says what it has', a.every(c => / with /.test(c.description || '')), JSON.stringify(a.map(c => c.description)));
	const s2 = game(); E.execEffects(s2, ME, byId.devouring_ectoplasm.deathrattle, null, null);
	ok('Devouring Ectoplasm: its Deathrattle makes one such Adventurer', live(s2, ME, 'Adventurer').length === 1 && live(s2, ME, 'Adventurer')[0].keywords.some(k => BONUS.includes(k)), names(s2, ME));
	const s3 = game(); const one = put(s3, FOE, '_one');
	E.execEffects(s3, ME, byId.final_gasp.effects, { type: 'creature', uid: one.uid, player: FOE }, null);
	ok('Final Gasp: the creature dies -> one such Adventurer', live(s3, ME, 'Adventurer').length === 1 && live(s3, ME, 'Adventurer')[0].keywords.some(k => BONUS.includes(k)), names(s3, ME));
	const s4 = game(); const wall = put(s4, FOE, '_wall');
	E.execEffects(s4, ME, byId.final_gasp.effects, { type: 'creature', uid: wall.uid, player: FOE }, null);
	ok('...it lives -> none', s4.players[ME].board.length === 0, names(s4, ME));
}

// ---------- Pterrordax Egg ----------
{
	const st = game();
	const mine = put(st, ME, '_thin'), wall = put(st, FOE, '_wall'), one = put(st, FOE, '_one');
	E.execEffects(st, ME, byId.pterrordax_egg.deathrattle, null, null);
	const p = live(st, ME, 'Pterrordax')[0];
	ok('Pterrordax Egg: a Pterrordax named "Pterrordax"', !!p && p.attack === 3, names(st, ME));
	ok('...it steals 1 Health from every other creature that has it to give (2 -> 1, 40 -> 39; a 1-Health one keeps its 1)', mine.maxHealth === 1 && wall.maxHealth === 39 && one.maxHealth === 1 && !E.isDead(one), JSON.stringify([mine.maxHealth, wall.maxHealth, one.maxHealth]));
	ok('...and has what it stole: 3 + 2 = 5 Health', !!p && p.maxHealth === 5 && E.hp(p) === 5, p && p.maxHealth);
}

// ---------- no mana cost was touched (owner rule: a buff never lowers a mana cost) ----------
{
	const COSTS = { cookie_the_cook: 3, hench_clan_hag: 4, kargal_battlescar: 7, glowfly_swarm: 5, deathborne: 6, flight_master: 3, derailed_coaster: 5, wispering_woods: 4, pterrordax_egg: 3, coral_keeper: 5, devouring_ectoplasm: 3, party_up: 7, crop_rotation: 3, hailbringer: 5, sleep_paralysis: 5, final_gasp: 1 };
	const off = Object.keys(COSTS).filter(id => byId[id].cost !== COSTS[id]);
	ok('all sixteen cards cost what they did', off.length === 0, off.map(id => id + ' ' + byId[id].cost).join(','));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
