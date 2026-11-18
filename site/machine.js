// site/machine.js — the site's state machines, DECLARED (Plans/STATE_MACHINES.md has the whole inventory).
//
// The app is full of flows that are state machines in everything but name: a `phase` string compared in a dozen
// places, five booleans that together mean one thing, a chain of `if (x.open)` deciding which screen is up. The
// flows work, players' saves and replays depend on their exact behaviour, and rewriting them would risk all of that
// for no gain a player could see. So this does NOT run them. It WATCHES them:
//
//   observe(name, { states, read, moves?, detail?, where? })
//     states   every state the flow can be in, by name (the one list a reader, a test or an agent needs)
//     read     () => one of `states`, worked out from the fields the flow ALREADY keeps. It changes nothing.
//              A combination the fields can hold but the flow never means returns 'illegal: <what is wrong>'.
//     moves    { from: [to, ...] }: the moves the flow makes. Omitted = any.
//     detail   () => a small plain object worth seeing beside the state (an id, a count). No secrets, no tokens.
//     where    the file that owns the flow
//
//   machine.check()   call it where the flow already redraws or polls: it reads the state and, if it is illegal or
//                     was reached by a move that is not declared, notes it ONCE per kind and tells the site's error
//                     beacon (window.reportErr, site/topbar.js), so a flow that drifts on a real player's screen is
//                     seen at /errors.html instead of becoming a bug report weeks later. It never throws and never
//                     blocks: the player's game carries on exactly as it would have.
//
//   window.__states()             every flow on this page: { name: { state, detail?, where } }
//   window.__states.problems()    what check() has noted
//   window.__states.describe()    the declarations themselves (states and moves), for a tool or an agent
//
// For whom: a player gets drifts fixed before they bite; a developer gets one list of states per flow and one call
// to see them; a test or an agent gets `await page.evaluate(() => __states())` instead of reading five fields and
// guessing. Node-safe (no window: the registry still works, for unit tests).
const REG = new Map(), PROBLEMS = [], SEEN = new Set();
const say = (name, kind, text) => {
	const key = name + '|' + kind + '|' + text;
	if (SEEN.has(key)) return; SEEN.add(key);
	PROBLEMS.push({ name, kind, text, at: Date.now() }); if (PROBLEMS.length > 50) PROBLEMS.shift();
	try { if (typeof window !== 'undefined' && window.reportErr) window.reportErr(`state machine ${name}: ${kind}: ${text}`, 'site/machine.js'); } catch (e) { /* the beacon is best-effort */ }
};

export function observe(name, spec) {
	const states = Object.freeze([...(spec.states || [])]), moves = spec.moves || null;
	const m = {
		name, states, moves, where: spec.where || '', last: null,
		/** The state now (one of `states`, or 'illegal: ...'). Never throws. */
		state() { try { return String(spec.read()); } catch (e) { return 'illegal: read threw: ' + (e && e.message); } },
		detail() { try { return spec.detail ? spec.detail() : undefined; } catch (e) { return undefined; } },
		/** Look at the flow now; note anything that should not be. -> the state. */
		check() {
			const s = m.state(), was = m.last;
			if (s.startsWith('illegal')) say(name, 'illegal state', s);
			else if (!states.includes(s)) say(name, 'undeclared state', s);
			else if (was != null && was !== s && !was.startsWith('illegal') && moves && states.includes(was) && !(moves[was] || []).includes(s)) say(name, 'undeclared move', `${was} -> ${s}`);
			m.last = s; return s;
		},
	};
	REG.set(name, m);
	return m;
}
/** Every flow on this page. */
export function snapshot() { const out = {}; for (const [name, m] of REG) { const d = m.detail(); out[name] = { state: m.state(), ...(d !== undefined ? { detail: d } : {}), where: m.where }; } return out; }
export const problems = () => PROBLEMS.map(p => ({ ...p }));
export const describe = () => Object.fromEntries([...REG].map(([name, m]) => [name, { states: [...m.states], moves: m.moves ? JSON.parse(JSON.stringify(m.moves)) : null, where: m.where }]));
/** For unit tests: forget everything. */
export function resetForTest() { REG.clear(); PROBLEMS.length = 0; SEEN.clear(); }

if (typeof window !== 'undefined') {
	// (one registry per page, whichever module asks first: a second copy of this file must not start a second list)
	if (!window.__states) { const f = () => snapshot(); f.problems = problems; f.describe = describe; f.observe = observe; window.__states = f; }
}
