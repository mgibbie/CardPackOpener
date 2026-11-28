// poketactica_goals_test.mjs — Poketactica's GOALS (owner, 2026-11-24: "both" milestones and daily tasks;
// Plans/POKETACTICA_IMPROVEMENT_PLAN.md item 15): milestones read from the collection itself and claimed once; three
// daily tasks from the date, counted on the device and paid once a day on the account; the collection's record cleaned
// and merged across devices. The camp's screen is in poketactica_items_test.mjs.
// Pure: node only.   node overworld/tests/poketactica_goals_test.mjs
import * as G from '../../poketactica/js/goals.js';
import * as FC from '../../poketactica/js/figcol.js';
import { TD_MAPS, MAZE_MAPS } from '../../poketactica/js/td/maps.js';
import { HEROES } from '../../poketactica/js/td/heroes.js';
import { DUNGEONS } from '../../poketactica/js/mm/dungeons.js';
import { MAPS } from '../../poketactica/js/campaign.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const J = JSON.stringify;
const env = { roadIds: TD_MAPS.map((m) => m.id), mazeIds: MAZE_MAPS.map((m) => m.id), heroIds: HEROES.map((h) => h.id), mmIds: DUNGEONS.filter((d) => !d.endless).map((d) => d.id), abyssId: 'the-abyss' };
const fg = (id, sp, lv, more = {}) => ({ v: 1, id, species: sp, level: lv, exp: 0, ability: null, shiny: false, pool: [{ id: 'tackle', lv: 1, xp: 0 }], equipped: ['tackle'], ...more });
const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; };

// ---------- the lists
{
	const ids = G.MILESTONES.map((m) => m.id);
	A(new Set(ids).size === ids.length && ids.length === 44 && G.MILESTONES.every((m) => m.stars > 0 && m.at > 0 && m.name && m.group), '44 milestones (13 for the new things: plan item R1), each with a name, a group, a target and stars');
	A(J([...new Set(G.MILESTONES.map((m) => m.group))]) === J(['Story', 'Dungeon', 'Figurines', 'Tower Defense', 'Mystery Maze', 'Item World']), 'they cover every mode: Story, Dungeon, Figurines, Tower Defense, Mystery Maze, Item World');
	const p0 = G.progressOf({ v: 1, figs: {} }, env);
	A(G.MILESTONES.every((m) => m.key in p0), 'every milestone counts something the collection knows', G.MILESTONES.filter((m) => !(m.key in p0)).map((m) => m.id));
	A(G.MILESTONES.find((m) => m.id === 'story-22').at === MAPS.length && G.MILESTONES.find((m) => m.id === 'heroes-5').at === 5 && HEROES.length >= 5 && G.MILESTONES.find((m) => m.id === 'mm-8').at <= env.mmIds.length, 'the Story\'s last one is every map there is; the heroes\' one every hero; the dungeons\' one can be reached');
	A(G.DAILY.length === 7 && new Set(G.DAILY.map((d) => d.id)).size === 7 && G.DAILY.every((d) => G.COUNT_KEYS.includes(d.key) && d.stars >= 20 && d.stars <= 40), 'seven daily tasks, each counting one of the things the page counts, 20 to 40 stars');
}

// ---------- what a collection has reached
{
	const col = { v: 1, starters: true, cleared: MAPS.slice(0, 6).map((m) => m.id), deep: 30,
		figs: { a: fg('fig-a01', 'pikachu', 104), b: fg('fig-b02', 'eevee', 12, { held: 'charcoal', gear: { lv: 51, gems: ['atk:26'] } }), c: fg('fig-c03', 'eevee', 9) },
		items: { 'leftovers-aaaa1': 'leftovers' }, gear: { 'leftovers-aaaa1': { lv: 12, gems: ['hp:3'] } }, gems: { 'gem-aaaa1': 'spe:50' },
		td: { [TD_MAPS[0].id]: 21, [MAZE_MAPS[0].id]: 9, [MAZE_MAPS[1].id]: 14, 'hero-brock': 14, 'hero-misty': 10, 'hero-surge': 9 },
		mm: { clear: { 'whisper-woods': 3, 'pebble-hollow': 1, 'the-abyss': 0, 'iw-charcoal-1': 1 }, best: { 'the-abyss': 12 }, store: {} } };
	const p = G.progressOf(col, env);
	A(J(p) === J({ story: 6, deep: 30, species: 2, figLv: 104, road: 21, maze: 14, heroes10: 2, mmClears: 2, abyss: 12, itemLv: 51, gemLv: 50, medals: 0, hard: 0, road10: 1, maze10: 1, heroes15: 0, mmCh: 0 }), 'progress is read from the collection: maps, checkpoint, species, levels, best waves, dungeons, item and gemstone levels', p);
	// MILESTONES FOR THE NEW THINGS (plan item R1): medals and hard sets, every Road and Maze Builder map, the heroes'
	// second decks, Mystery Maze challenges, deeper in the Abyss. Each reads what the collection already keeps.
	{
		const first = G.MILESTONES.slice(0, 31).map((m) => m.id), more = G.MILESTONES.slice(31);
		A(first[0] === 'story-5' && first[30] === 'gem-100' && more.map((m) => m.id).join() === 'medal-5,medal-22,hard-5,hard-22,roadall-6,mazeall-3,mazeall-6,decks-3,decks-7,ch-1,ch-6,ch-12,abyss-50', 'the 31 there were keep their places; the 13 new ones follow');
		A(more.find((m) => m.id === 'medal-22').at === MAPS.length && more.find((m) => m.id === 'hard-22').at === MAPS.length && more.find((m) => m.id === 'roadall-6').at === TD_MAPS.length && more.find((m) => m.id === 'mazeall-6').at === MAZE_MAPS.length && more.find((m) => m.id === 'decks-7').at === HEROES.length, 'the ones that say "all" ask for exactly as many as there are (22 maps, 6 Road maps, 6 Maze Builder maps, 7 heroes)', [MAPS.length, TD_MAPS.length, MAZE_MAPS.length, HEROES.length]);
		const c2 = { ...FC.cleanFigs({ v: 1, figs: {} }), medals: ['c1-1', 'c1-2', 'c1-3', 'c1-4', 'c1-5'], hard: ['c1-1'],
			td: { ...Object.fromEntries(TD_MAPS.map((m) => [m.id, 10])), [MAZE_MAPS[0].id]: 12, [MAZE_MAPS[1].id]: 10, [MAZE_MAPS[2].id]: 9, 'hero-brock': 15, 'hero-misty': 22, 'hero-koga': 14 },
			mm: { clear: {}, best: { 'the-abyss': 50 }, ch: { [env.mmIds[0]]: ['noitems', 'solo'], [env.mmIds[1]]: ['clock'], 'not-a-dungeon': ['solo'] } } };
		const q = G.progressOf(c2, env);
		A(q.medals === 5 && q.hard === 1 && q.road10 === TD_MAPS.length && q.maze10 === 2 && q.heroes15 === 2 && q.mmCh === 3 && q.abyss === 50, 'counted: 5 medals, 1 hard set, wave 10 on every Road map and on 2 Maze Builder maps, 2 second decks, 3 challenges (an unknown dungeon is not counted), Abyss floor 50', q);
		const st = Object.fromEntries(G.milestoneState(c2, env).map((m) => [m.id, m.done]));
		A(st['medal-5'] && !st['medal-22'] && !st['hard-5'] && st['roadall-6'] && !st['mazeall-3'] && !st['decks-3'] && st['ch-1'] && !st['ch-6'] && st['abyss-50'], 'and the milestones they reach are done, the others not');
		const paid = G.claimMilestone(c2, 'medal-5', env);
		A(paid && paid.stars === 60 && G.claimMilestone(paid.col, 'medal-5', env) === null && G.claimMilestone(c2, 'hard-5', env) === null, 'a new milestone pays once, and only when it is reached');
		A(more.reduce((n, m) => n + m.stars, 0) === 3290, 'the 13 pay 3,290 stars in all', more.reduce((n, m) => n + m.stars, 0));
		// A TROPHY SHELF (plan item R2): every mode on one screen, what is done and what is next in each
		const empty = G.shelfOf(FC.cleanFigs({ v: 1, figs: {} }), env), shelf = G.shelfOf(c2, env), by = Object.fromEntries(shelf.map((x) => [x.mode, x]));
		A(shelf.map((x) => x.mode).join() === 'Story,Dungeon,Tower Defense,Mystery Maze,Item World,Figurines' && shelf.every((x) => x.icon && x.facts.length >= 1 && x.total > 0) && shelf.reduce((n, x) => n + x.total, 0) === G.MILESTONES.length, 'the shelf: six modes, each with its facts, and every milestone on exactly one shelf');
		A(empty.every((x) => x.done === 0 && x.next && x.next.have / x.next.at <= 0.5) && /^0 maps cleared$/.test(empty[0].facts[0]) && empty[1].facts[0] === 'no boss beaten yet', 'a new player: nothing done, and each mode says what is next', empty.map((x) => [x.mode, x.next && x.next.id]));
		A(by.Story.facts.join(' · ') === '0 maps cleared · 5 medals · 1 hard set cleared' && by.Story.done === 1 && by.Story.next.id === 'medal-22' && by['Mystery Maze'].facts.join(' · ') === '0 dungeons cleared · The Abyss: floor 50 · 3 challenges cleared' && by['Mystery Maze'].next.id === 'ch-6', 'facts are counted from the collection; the next milestone is the one furthest along', [by.Story.facts, by.Story.next.id, by['Mystery Maze'].next.id]);
		A(by['Tower Defense'].list.length === by['Tower Defense'].total && by['Tower Defense'].list.filter((m) => m.done).length === by['Tower Defense'].done && by['Tower Defense'].facts[0] === 'the Road: wave 10', 'each shelf lists its milestones, done or not');
		const all = { ...c2, cleared: MAPS.map((m) => m.id), medals: MAPS.map((m) => m.id), hard: MAPS.map((m) => m.id) }, full = G.shelfOf(all, env)[0];
		A(full.done === full.total && full.next === null, 'a mode with every milestone reached has nothing next');
	}
	const st = G.milestoneState(col, env), by = Object.fromEntries(st.map((m) => [m.id, m]));
	A(by['story-5'].done && !by['story-11'].done && by['story-11'].have === 6 && by['deep-30'].done && !by['deep-50'].done && by['lv-100'].done && !by['lv-255'].done && by['road-20'].done && by['maze-10'].done && !by['maze-20'].done && by['maze-20'].have === 14
		&& !by['heroes-5'].done && by['heroes-5'].have === 2 && by['mm-1'].done && !by['mm-4'].done && by['abyss-10'].done && by['item-50'].done && !by['item-100'].done && by['gem-50'].done && !by['gem-100'].done && st.every((m) => !m.claimed),
		'each milestone: how far, done or not; nothing claimed yet', st.filter((m) => m.done).map((m) => m.id));
	A(st.every((m) => m.have <= m.at), 'what is shown never runs past the target');
	// claim
	const r = G.claimMilestone(col, 'deep-30', env);
	A(r && r.stars === 120 && J(r.col.goals) === J({ done: ['deep-30'] }) && !col.goals, 'claimed: its stars, and the collection remembers (the one handed in is unchanged)', r && r.col.goals);
	A(G.claimMilestone(r.col, 'deep-30', env) === null && G.claimMilestone(col, 'deep-50', env) === null && G.claimMilestone(col, 'nope', env) === null, 'not twice; not one that is not reached; not one that does not exist');
	const r2 = G.claimMilestone(r.col, 'story-5', env);
	A(r2 && r2.stars === 40 && J(r2.col.goals.done) === J(['deep-30', 'story-5']) && G.milestoneState(r2.col, env).filter((m) => m.claimed).length === 2, 'a second one joins it');
	A(G.toClaim(col, env, 20261125, {}) === st.filter((m) => m.done).length && G.toClaim(r2.col, env, 20261125, {}) === st.filter((m) => m.done).length - 2, 'the camp\'s count of what waits to be claimed goes down as they are');
	// an empty collection has reached nothing; an item with no level still counts as level 1 (never a milestone)
	A(G.milestoneState({ v: 1, figs: {} }, env).every((m) => !m.done && m.have === 0) && G.progressOf({ v: 1, figs: {}, items: { 'charcoal-aaaa1': 'charcoal' } }, env).itemLv === 1, 'a new player has reached none');
}

// ---------- the day's tasks
{
	A(G.dayOf(Date.UTC(2026, 10, 25, 23, 59)) === 20261125 && G.dayOf(Date.UTC(2026, 10, 26, 0, 0)) === 20261126 && G.dayOf(Date.UTC(2027, 0, 1)) === 20270101, 'the day is the UTC date');
	const t = G.dailyOf(20261125);
	A(t.length === 3 && new Set(t.map((x) => x.id)).size === 3 && J(t) === J(G.dailyOf(20261125)), 'three different tasks a day, the same for everyone that day');
	const seen = new Set(); let differ = 0;
	for (let d = 20261101; d <= 20261130; d++) { const ids = G.dailyOf(d).map((x) => x.id); ids.forEach((i) => seen.add(i)); if (J(ids) !== J(G.dailyOf(d + 1).map((x) => x.id))) differ++; }
	A(seen.size === 7 && differ >= 20, 'over a month every task turns up, and the days differ', [seen.size, differ]);
	// counting on the device
	const LS = mem();
	A(J(G.loadDaily(20261125, LS)) === '{}', 'nothing counted yet');
	G.noteDaily({ wins: 1, kos: 4 }, 20261125, LS); G.noteDaily({ wins: 1, kos: 7, waves: 0, nonsense: 9, caught: -3 }, 20261125, LS);
	A(J(G.loadDaily(20261125, LS)) === J({ wins: 2, kos: 11 }), 'what happens is added up (only what is known, only what is more than nothing)', G.loadDaily(20261125, LS));
	A(J(G.loadDaily(20261126, LS)) === '{}', 'another day starts from nothing');
	G.noteDaily({ floors: 2 }, 20261126, LS);
	A(J(G.loadDaily(20261126, LS)) === J({ floors: 2 }) && J(G.loadDaily(20261125, LS)) === '{}', 'and the day before is forgotten');
	LS.setItem(G.DAILY_KEY, '{broken'); A(J(G.loadDaily(20261126, LS)) === '{}', 'a spoiled record reads as nothing');
	// state and claiming: a day whose tasks we choose by finding one
	const day = 20261125, tasks = G.dailyOf(day), first = tasks[0], counts = { [first.key]: first.at };
	const col = { v: 1, figs: {} };
	let st = G.dailyState(col, day, counts);
	A(st[0].done && !st[0].claimed && st[0].have === first.at && st.slice(1).every((x) => x.key === first.key ? x.done : !x.done || x.at <= (counts[x.key] || 0)), 'a task whose count is reached is done');
	A(G.claimDaily(col, tasks[1].id, day, tasks[1].key === first.key ? {} : counts) === null || tasks[1].key === first.key, 'one that is not done cannot be claimed');
	const r = G.claimDaily(col, first.id, day, counts);
	A(r && r.stars === first.stars && J(r.col.goals) === J({ done: [], daily: { day, paid: [first.id] } }), 'claimed: its stars, and the collection remembers it is paid for that day', r && r.col.goals);
	A(G.claimDaily(r.col, first.id, day, counts) === null && G.dailyState(r.col, day, counts)[0].claimed, 'not twice the same day');
	A(G.claimDaily(col, 'nope', day, counts) === null && G.claimDaily(col, G.DAILY.find((d) => !tasks.includes(d)).id, day, { wins: 99, kos: 99, training: 9, deadly: 9, caught: 9, waves: 99, floors: 99 }) === null, 'only one of that day\'s three');
	// the next day: yesterday's payment does not stand in the way, and is replaced
	const next = day + 1, t2 = G.dailyOf(next)[0], r2 = G.claimDaily(r.col, t2.id, next, { [t2.key]: t2.at });
	A(r2 && J(r2.col.goals.daily) === J({ day: next, paid: [t2.id] }) && !G.dailyState(r2.col, next, {})[0].done, 'the next day is a new day');
	// a milestone claimed stays claimed through a day's claim
	const env2 = env, both = G.claimDaily({ v: 1, figs: {}, cleared: MAPS.slice(0, 5).map((m) => m.id), goals: { done: ['story-5'] } }, first.id, day, counts);
	A(J(both.col.goals) === J({ done: ['story-5'], daily: { day, paid: [first.id] } }) && G.milestoneState(both.col, env2).find((m) => m.id === 'story-5').claimed, 'the day\'s tasks and the milestones are kept side by side');
}

// ---------- the collection's record: cleaned, and merged across devices
{
	A(G.cleanGoals(null) === null && G.cleanGoals({}) === null && G.cleanGoals({ done: [], daily: { day: 20261125, paid: [] } }) === null, 'nothing to say: nothing kept');
	A(J(G.cleanGoals({ done: ['story-5', 'story-5', 'nope', 7, 'deep-10'], daily: { day: 20261125, paid: ['win2', 'hax', 'win2'] }, extra: 1 })) === J({ done: ['story-5', 'deep-10'], daily: { day: 20261125, paid: ['win2'] } }), 'only real milestones and tasks, each once');
	A(J(G.cleanGoals({ done: ['story-5'], daily: { day: 5, paid: ['win2'] } })) === J({ done: ['story-5'] }) && J(G.cleanGoals({ daily: { day: '<x>', paid: ['win2'] } })) === 'null', 'a day that is no day is dropped');
	const a = { done: ['story-5'], daily: { day: 20261125, paid: ['win2'] } }, b = { done: ['deep-10'], daily: { day: 20261125, paid: ['ko10'] } }, later = { done: [], daily: { day: 20261126, paid: ['train1'] } };
	A(J(G.mergeGoals(a, b)) === J({ done: ['deep-10', 'story-5'], daily: { day: 20261125, paid: ['ko10', 'win2'] } }), 'two devices, the same day: claimed on either is claimed; paid on either is paid');
	A(J(G.mergeGoals(a, later).daily) === J(later.daily) && J(G.mergeGoals(later, a).daily) === J(later.daily) && J(G.mergeGoals(a, later).done) === J(['story-5']), 'different days: the later day\'s tasks win; milestones are kept');
	A(J(G.mergeGoals(a, null)) === J(a) && J(G.mergeGoals(null, b)) === J(b) && G.mergeGoals(null, null) === null, 'one side with nothing: the other\'s');
	// through figcol: kept on reading, merged on sync, and seen as a change
	const col = { v: 1, starters: true, figs: { 'fig-a01': fg('fig-a01', 'pikachu', 30) }, goals: a }, other = { ...col, goals: b };
	const clean = FC.cleanFigs(col);
	A(J(clean.goals) === J(a) && !('goals' in FC.cleanFigs({ ...col, goals: { done: ['nope'] } })), 'the collection keeps its goals when it is read (and drops a forged record)');
	const m3 = FC.merge3Figs(clean, col, other), link = FC.linkFigs(col, other);
	A(J(m3.goals) === J(G.mergeGoals(a, b)) && J(link.goals) === J(G.mergeGoals(a, b)), 'a sync merges them (with or without an agreed copy)');
	A(!FC.sameFigs(col, other) && FC.sameFigs(col, JSON.parse(JSON.stringify(col))) && !FC.sameFigs(col, { ...col, goals: undefined }), 'and the sync sees a claim as a change');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
