// goals.js — Poketactica's GOALS (owner, 2026-11-24: "both" milestones and daily tasks; Plans/POKETACTICA_IMPROVEMENT_PLAN.md
// item 15: after the Story there was nothing to chase, and stars ran out of things to earn them for).
//
//   MILESTONES  one-time targets across every mode, each paying stars once. What counts is read from the collection
//               itself (maps cleared, the deepest checkpoint, the book, best waves, dungeons cleared, item and gemstone
//               levels): nothing extra is counted, so a milestone reached before this existed is there to claim.
//   DAILY       three small tasks a day, the same three for everyone that day (from the UTC date). What a task counts
//               (battles won, foes knocked out, waves, floors) is counted ON THIS DEVICE for the day; that it was PAID
//               is kept in the collection, so the account is paid once a task a day wherever it is played.
//
// The collection's `goals`: { done: [milestone id], daily: { day: 20261125, paid: [task id] } }. Two devices merge it by
// union (a milestone claimed anywhere is claimed; the later day's tasks win). Pure: no page, no storage but what is handed in.
import { cleanGear, parseGem } from './gear.js';
import { makeRng } from '../../overworld/rules/rng.js';

const M = (id, group, name, at, stars, key) => Object.freeze({ id, group, name, at, stars, key });
export const MILESTONES = Object.freeze([
	M('story-5', 'Story', 'Clear 5 Story maps', 5, 40, 'story'), M('story-11', 'Story', 'Clear 11 Story maps', 11, 80, 'story'), M('story-22', 'Story', 'Clear all 22 Story maps', 22, 200, 'story'),
	M('deep-10', 'Dungeon', 'Beat the Dungeon\'s floor 10 boss', 10, 60, 'deep'), M('deep-30', 'Dungeon', 'Beat the floor 30 boss', 30, 120, 'deep'), M('deep-50', 'Dungeon', 'Beat the floor 50 boss', 50, 200, 'deep'), M('deep-100', 'Dungeon', 'Beat the floor 100 boss', 100, 500, 'deep'),
	M('book-25', 'Figurines', 'Own 25 different Pokémon', 25, 40, 'species'), M('book-50', 'Figurines', 'Own 50 different Pokémon', 50, 80, 'species'), M('book-100', 'Figurines', 'Own 100 different Pokémon', 100, 150, 'species'), M('book-151', 'Figurines', 'Own 151 different Pokémon', 151, 300, 'species'),
	M('lv-50', 'Figurines', 'Raise a figurine to Lv 50', 50, 60, 'figLv'), M('lv-100', 'Figurines', 'Raise a figurine to Lv 100', 100, 150, 'figLv'), M('lv-255', 'Figurines', 'Raise a figurine to Lv 255', 255, 400, 'figLv'),
	M('road-10', 'Tower Defense', 'Clear wave 10 on a Road map', 10, 50, 'road'), M('road-20', 'Tower Defense', 'Clear wave 20 on a Road map', 20, 120, 'road'),
	M('maze-10', 'Tower Defense', 'Clear wave 10 in Maze Builder', 10, 60, 'maze'), M('maze-20', 'Tower Defense', 'Clear wave 20 in Maze Builder', 20, 150, 'maze'), M('maze-30', 'Tower Defense', 'Clear wave 30 in Maze Builder', 30, 300, 'maze'),
	M('heroes-5', 'Tower Defense', 'Clear wave 10 as five different heroes', 5, 250, 'heroes10'),
	M('mm-1', 'Mystery Maze', 'Clear a Mystery Maze dungeon', 1, 50, 'mmClears'), M('mm-4', 'Mystery Maze', 'Clear 4 different dungeons', 4, 120, 'mmClears'), M('mm-8', 'Mystery Maze', 'Clear 8 different dungeons', 8, 300, 'mmClears'),
	M('abyss-10', 'Mystery Maze', 'Reach floor 10 of The Abyss', 10, 80, 'abyss'), M('abyss-25', 'Mystery Maze', 'Reach floor 25 of The Abyss', 25, 250, 'abyss'),
	M('item-10', 'Item World', 'Raise a held item to level 10', 10, 50, 'itemLv'), M('item-50', 'Item World', 'Raise a held item to level 50', 50, 200, 'itemLv'), M('item-100', 'Item World', 'Raise a held item to level 100', 100, 500, 'itemLv'),
	M('gem-25', 'Item World', 'Make a plush gemstone of level 25', 25, 80, 'gemLv'), M('gem-50', 'Item World', 'Make a plush gemstone of level 50', 50, 200, 'gemLv'), M('gem-100', 'Item World', 'Make a plush gemstone of level 100', 100, 500, 'gemLv'),
]);
const MILESTONE_BY = Object.freeze(Object.fromEntries(MILESTONES.map((m) => [m.id, m])));

const D = (id, name, key, at, stars) => Object.freeze({ id, name, key, at, stars });
export const DAILY = Object.freeze([
	D('win2', 'Win 2 battles', 'wins', 2, 30), D('ko10', 'Knock out 10 foes', 'kos', 10, 30), D('train1', 'Win a Training battle', 'training', 1, 20),
	D('deadly1', 'Win a deadly battle (Story, Dungeon or Item World)', 'deadly', 1, 40), D('catch1', 'Catch a wild Pokémon', 'caught', 1, 30),
	D('waves8', 'Clear 8 Tower Defense waves', 'waves', 8, 30), D('floors3', 'Clear 3 Mystery Maze floors', 'floors', 3, 30),
]);
const DAILY_BY = Object.freeze(Object.fromEntries(DAILY.map((d) => [d.id, d])));
export const DAILY_COUNT = 3;
export const DAILY_KEY = 'magepunk_poketactica_daily_v1';   // { day, n: { wins, kos, ... } } what this device counted today
export const COUNT_KEYS = Object.freeze(['wins', 'kos', 'training', 'deadly', 'caught', 'waves', 'floors']);

/** The UTC day as a number: 20261125. */
export const dayOf = (ms = Date.now()) => { const d = new Date(ms); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
/** The day's three tasks: the same for everyone, from the date. */
export function dailyOf(day) {
	const rng = makeRng('pt-daily:' + day), pool = DAILY.slice();
	for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
	return pool.slice(0, DAILY_COUNT);
}

// ---------- the collection's record
/** `goals` read defensively -> { done: [id], daily: { day, paid: [id] } | null }, or null when there is nothing to say. */
export function cleanGoals(x) {
	if (!x || typeof x !== 'object') return null;
	const done = [...new Set((Array.isArray(x.done) ? x.done : []).filter((id) => typeof id === 'string' && MILESTONE_BY[id]))];
	const dd = x.daily && typeof x.daily === 'object' ? x.daily : null, day = dd ? Math.floor(+dd.day) || 0 : 0;
	const paid = day >= 20200101 && day <= 21001231 ? [...new Set((Array.isArray(dd.paid) ? dd.paid : []).filter((id) => typeof id === 'string' && DAILY_BY[id]))].slice(0, DAILY.length) : [];
	if (!done.length && !paid.length) return null;
	return { done, ...(paid.length ? { daily: { day, paid } } : {}) };
}
/** Two devices: a milestone claimed on either is claimed; the later day's tasks win (the same day: paid on either). */
export function mergeGoals(a, b) {
	const A = cleanGoals(a), B = cleanGoals(b);
	if (!A || !B) return A || B;
	const done = [...new Set([...B.done, ...A.done])];
	const da = A.daily, db = B.daily;
	const daily = da && db ? (da.day === db.day ? { day: da.day, paid: [...new Set([...db.paid, ...da.paid])] } : da.day > db.day ? da : db) : da || db || null;
	return cleanGoals({ done, ...(daily ? { daily } : {}) });
}

// ---------- milestones
/**
 * How far a collection is on everything a milestone counts. env: what this file does not know by itself
 * { roadIds, mazeIds, heroIds, mmIds (the story dungeons), abyssId }.
 */
export function progressOf(col, env = {}) {
	const figs = Object.values((col && col.figs) || {}), td = (col && col.td) || {}, mm = (col && col.mm) || {};
	const best = (ids) => Math.max(0, ...(ids || []).map((id) => td[id] || 0));
	const gears = [...Object.values((col && col.gear) || {}), ...figs.map((f) => f.gear)].map((g) => cleanGear(g)).filter(Boolean);
	const gemLvs = [...Object.values((col && col.gems) || {}), ...gears.flatMap((g) => g.gems)].map((s) => (parseGem(s) || { lv: 0 }).lv);
	const hasItem = figs.some((f) => f.held) || Object.keys((col && col.items) || {}).length > 0;
	return {
		story: ((col && col.cleared) || []).length, deep: (col && col.deep) | 0, species: new Set(figs.map((f) => f.species)).size, figLv: Math.max(0, ...figs.map((f) => f.level | 0)),
		road: best(env.roadIds), maze: best(env.mazeIds), heroes10: (env.heroIds || []).filter((h) => (td['hero-' + h] || 0) >= 10).length,
		mmClears: Object.keys(mm.clear || {}).filter((id) => (env.mmIds || []).includes(id) && mm.clear[id] > 0).length, abyss: ((mm.best || {})[env.abyssId || 'the-abyss']) | 0,
		itemLv: Math.max(hasItem ? 1 : 0, ...gears.map((g) => g.lv)), gemLv: Math.max(0, ...gemLvs),
	};
}
/** Every milestone with where the collection stands: [{ ...milestone, have, done, claimed }]. */
export function milestoneState(col, env) {
	const p = progressOf(col, env), got = new Set((cleanGoals(col && col.goals) || { done: [] }).done);
	return MILESTONES.map((m) => ({ ...m, have: Math.min(m.at, p[m.key] || 0), done: (p[m.key] || 0) >= m.at, claimed: got.has(m.id) }));
}
/** Claim a milestone that is reached and not yet claimed. -> { col, stars }, or null */
export function claimMilestone(col, id, env) {
	const m = milestoneState(col, env).find((x) => x.id === id);
	if (!m || !m.done || m.claimed) return null;
	const g = cleanGoals(col.goals) || { done: [] };
	return { col: { ...col, goals: cleanGoals({ ...g, done: [...g.done, id] }) }, stars: m.stars };
}

// ---------- daily tasks
/** This device's counts for a day ({} for another day's, or none). */
export function loadDaily(day, LS = globalThis.localStorage) {
	try { const o = JSON.parse(LS.getItem(DAILY_KEY) || 'null'); if (!o || o.day !== day || !o.n || typeof o.n !== 'object') return {}; const n = {}; for (const k of COUNT_KEYS) { const v = Math.floor(+o.n[k]); if (v > 0) n[k] = Math.min(v, 1e6); } return n; } catch { return {}; }
}
/** Something happened today: add to this device's counts. what: { wins: 1, kos: 3, ... } -> the new counts */
export function noteDaily(what, day = dayOf(), LS = globalThis.localStorage) {
	const n = loadDaily(day, LS);
	for (const k of COUNT_KEYS) { const v = Math.floor(+(what || {})[k]); if (v > 0) n[k] = (n[k] || 0) + v; }
	try { LS.setItem(DAILY_KEY, JSON.stringify({ day, n })); } catch { /* private mode: today's tasks count for the visit only */ }
	return n;
}
/** The day's tasks with where they stand: [{ ...task, have, done, claimed }]. counts: this device's for that day. */
export function dailyState(col, day, counts = {}) {
	const g = cleanGoals(col && col.goals), paid = new Set(g && g.daily && g.daily.day === day ? g.daily.paid : []);
	return dailyOf(day).map((t) => ({ ...t, have: Math.min(t.at, counts[t.key] || 0), done: (counts[t.key] || 0) >= t.at, claimed: paid.has(t.id) }));
}
/** Claim one of today's tasks that is done and not yet paid. -> { col, stars }, or null */
export function claimDaily(col, id, day, counts) {
	const t = dailyState(col, day, counts).find((x) => x.id === id);
	if (!t || !t.done || t.claimed) return null;
	const g = cleanGoals(col.goals) || { done: [] }, paid = g.daily && g.daily.day === day ? g.daily.paid : [];
	return { col: { ...col, goals: cleanGoals({ done: g.done, daily: { day, paid: [...paid, id] } }) }, stars: t.stars };
}
/** How many goals wait to be claimed (the camp's badge). */
export const toClaim = (col, env, day, counts) => milestoneState(col, env).filter((m) => m.done && !m.claimed).length + dailyState(col, day, counts).filter((t) => t.done && !t.claimed).length;
