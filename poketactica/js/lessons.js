// lessons.js — THE COACH GOES PAST THE FIRST MAP (Plans/POKETACTICA_MODES_PLAN.md item S3). "One popup each today":
// combos, throwing and catching, and Geo panels each had a tip as their map opened and nothing after. Each now gets a
// guided moment on the map that first needs it: a few steps in the coach's bar, each ticked off by DOING it, as the
// first battle's are.
//
// Pure: what a step needs is read from the battle's state and the orders given so far (no page, no storage). main.js
// shows the steps in the bar the first battle's coach uses, and keeps which lessons this device has finished.
//
//   LESSONS[mapId] = { id, name, steps: [{ done(S, acts, map), key, touch }], end(S) }
//     key / touch   the step's words for a keyboard or controller / for a phone
//     end           the words once every step is done

/** The orders of the stretch being built now: everything since the last Execute or End turn. */
function stretch(acts) {
	let from = 0;
	for (let i = 0; i < acts.length; i++) if (acts[i].t === 'execute' || acts[i].t === 'end') from = i + 1;
	return acts.slice(from);
}
/** The attacks still queued in a run of orders (one taken back is not there). */
function queued(list) {
	const q = [];
	for (const a of list) {
		if (a.t === 'attack') q.push(a);
		else if (a.t === 'unqueue' || a.t === 'undo') { const i = q.map((x) => x.uid).lastIndexOf(a.uid); if (i >= 0) q.splice(i, 1); else if (a.t === 'undo') q.pop(); }
	}
	return q;
}
/** Do two figurines aim at one tile in this run of orders? */
const twoOnOne = (list) => { const q = queued(list); return q.some((a, i) => q.some((b, j) => j > i && b.uid !== a.uid && b.x === a.x && b.y === a.y)); };
/** Was a stretch with two figurines on one tile ever Executed? */
export function comboExecuted(acts) {
	let from = 0;
	for (let i = 0; i < acts.length; i++) {
		if (acts[i].t !== 'execute' && acts[i].t !== 'end') continue;
		if (acts[i].t === 'execute' && twoOnOne(acts.slice(from, i))) return true;
		from = i + 1;
	}
	return false;
}
const foes = (S) => S.units.filter((u) => u.side !== 'p');
const threwOntoBase = (S, acts) => acts.some((a) => a.t === 'throw' && a.x === S.map.base.x && a.y === S.map.base.y);
const symbolAimed = (acts, map) => acts.some((a) => a.t === 'attack' && (map.symbols || []).some((g) => g.x === a.x && g.y === a.y));
const symbolBroken = (S, map) => S.symbols.length < (map.symbols || []).length;

export const LESSONS = Object.freeze({
	'c1-2': Object.freeze({ id: 'combo', name: 'Combos', steps: Object.freeze([
		{ done: (S, acts) => queued(stretch(acts)).length > 0 || comboExecuted(acts),
			key: 'Send out two figurines. With one, choose <b>Attack</b> and aim at a foe. Do <b>not</b> Execute yet.',
			touch: 'Send out two figurines. With one, choose <b>Attack</b> and aim at a foe. Do <b>not</b> tap Execute yet.' },
		{ done: (S, acts) => twoOnOne(stretch(acts)) || comboExecuted(acts),
			key: 'Now a <b>second</b> figurine: Attack the <b>same</b> foe. Both wait in the queue, in the order you gave them.',
			touch: 'Now a <b>second</b> figurine: Attack the <b>same</b> foe. Both wait in the queue, in the order you gave them.' },
		{ done: (S, acts) => comboExecuted(acts),
			key: 'Press <b>V</b> (<b>Execute</b>). The second hit is a <b>combo</b>: it lands harder than it would alone.',
			touch: 'Tap <b>Execute</b>. The second hit is a <b>combo</b>: it lands harder than it would alone.' },
	]), end: () => 'That is a combo. Every attack after the first on one foe, in one Execute, hits harder.' }),
	'c1-4': Object.freeze({ id: 'catch', name: 'Throwing and catching', steps: Object.freeze([
		{ done: (S, acts) => foes(S).some((u) => u.hp > 0 && u.hp * 2 < u.maxHP) || threwOntoBase(S, acts) || (S.captured || []).length > 0,
			key: 'To catch a wild Pokémon, <b>weaken</b> it first: under half HP. Do not knock it out.',
			touch: 'To catch a wild Pokémon, <b>weaken</b> it first: under half HP. Do not knock it out.' },
		{ done: (S, acts) => threwOntoBase(S, acts) || (S.captured || []).length > 0,
			key: 'Stand a figurine that can <b>Throw</b> next to it (Fighting types and strong ones can). Choose <b>Throw</b>, pick the foe, then aim at your <b>base</b> tile.',
			touch: 'Stand a figurine that can <b>Throw</b> next to it (Fighting types and strong ones can). Tap <b>Throw</b>, the foe, then your <b>base</b> tile.' },
	]), end: (S) => ((S.captured || []).length ? 'Caught! It joins your figurines when the map is won.' : 'It broke free, and it is angrier. Weaken it more and throw again, or simply win.') }),
	'c2-1': Object.freeze({ id: 'geo', name: 'Geo panels', steps: Object.freeze([
		{ done: (S, acts, map) => symbolAimed(acts, map) || symbolBroken(S, map),
			key: 'The foes standing on <b>blue</b> cannot be hurt: the pyramid on blue (a <b>Geo Symbol</b>) makes them so. Choose <b>Attack</b> and aim at the <b>pyramid</b>.',
			touch: 'The foes standing on <b>blue</b> cannot be hurt: the pyramid on blue (a <b>Geo Symbol</b>) makes them so. Tap <b>Attack</b>, then the <b>pyramid</b>.' },
		{ done: (S, acts, map) => symbolBroken(S, map),
			key: 'A symbol has HP, as a foe has. <b>Execute</b>, and keep hitting it until it breaks.',
			touch: 'A symbol has HP, as a foe has. <b>Execute</b>, and keep hitting it until it breaks.' },
	]), end: () => 'Broken: blue is plain ground now, and the foes on it can be hurt.' }),
});
/** The lesson a map gives, or null. */
export const lessonOf = (mapId) => LESSONS[mapId] || null;
/** How far along a lesson is: the first step not yet done (steps.length when all are). */
export function lessonStep(lesson, S, acts, map, from = 0) {
	let i = from;
	while (i < lesson.steps.length && lesson.steps[i].done(S, acts || [], map)) i++;
	return i;
}
/** The lessons this device has finished, from what it stored (anything else reads as none). */
export function lessonsDone(raw) {
	try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 20) : []; } catch { return []; }
}
