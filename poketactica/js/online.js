// online.js — Poketactica online (PvP, 2-4 players; owner 2026-11-22) on the page's side: the lobby's calls to
// server/ptpvp.mjs, and a match's lockstep sync. The page plays every action through its own engine; this file only moves
// actions between the page and the server:
//   - mine: an action the engine accepted here is sent at once, in order (each carries the count of actions it follows);
//   - theirs: while nothing of ours is on its way, the page polls and plays the new actions (the other players', the
//     computer seats' come out of the engine itself, the server's clock: 'idle' / 'concede');
//   - out of step (the server had something we hadn't seen when we sent): the page is handed the whole recipe again and
//     rebuilds the battle from it.
import { PTPVP_PROTOCOL } from './arenas.js';

export const POLL_MS = 1500;

/** The lobby's calls. call(action, body) -> the server's JSON ({ error } on a refusal). */
export function createOnline(call) {
	const c = async (action, body = {}) => { try { return (await call(action, { pv: PTPVP_PROTOCOL, ...body })) || { error: 'no answer' }; } catch (e) { return { error: 'offline: try again' }; } };
	return {
		mine: () => c('ptpvp-mine'),
		create: (o) => c('ptpvp-create', o),
		join: (code, team) => c('ptpvp-join', { code, team }),
		update: (id, patch) => c('ptpvp-update', { id, ...patch }),
		start: (id) => c('ptpvp-start', { id }),
		state: (id, n) => c('ptpvp-state', { id, n }),
		act: (id, n, a) => c('ptpvp-act', { id, n, a }),
		over: (id, n, winner) => c('ptpvp-over', { id, n, winner }),
		leave: (id) => c('ptpvp-leave', { id }),
	};
}

/**
 * A match's sync. hooks: { count() -> actions the page has played, play(a) (a remote action, animated), rebuild(actions)
 * (the whole recipe: start again from it), busy() (animations running: wait), onLobby(lobby), onError(msg) }
 */
export function createMatchSync(api, id, hooks) {
	const outbox = [];   // [{ n, a }]: ours, not yet acknowledged
	let sending = false, timer = null, stopped = false, polling = false, deadline = 0;
	async function flush() {
		if (sending || stopped) return;
		sending = true;
		while (outbox.length && !stopped) {
			const { n, a } = outbox[0];
			const r = await api.act(id, n, a);
			if (r && r.ok) { outbox.shift(); continue; }
			if (r && r.stale) { outbox.length = 0; await resync(); break; }
			if (r && r.over) { outbox.length = 0; break; }
			if (r && r.error && !/offline|busy/.test(r.error)) { outbox.length = 0; hooks.onError && hooks.onError(r.error); await resync(); break; }
			await new Promise((res) => setTimeout(res, 1200));   // (offline / busy: the same action again, shortly)
		}
		sending = false;
	}
	async function resync() {
		const r = await api.state(id, 0);
		if (r && r.match) { hooks.rebuild(r.match.actions); deadline = r.match.deadline; if (r.lobby) hooks.onLobby && hooks.onLobby(r.lobby); }
	}
	async function poll() {
		if (stopped || polling) return;
		if (outbox.length || sending || hooks.busy()) return;
		polling = true;
		try {
			const n = hooks.count(), r = await api.state(id, n);
			if (stopped || !r || !r.match) return;
			if (r.lobby) hooks.onLobby && hooks.onLobby(r.lobby);
			deadline = r.match.deadline;
			if (outbox.length || sending || hooks.count() !== n) return;   // (we acted meanwhile: the next poll catches up)
			if (r.match.from !== n) return resync();
			for (const a of r.match.actions) hooks.play(a);
		} finally { polling = false; }
	}
	timer = setInterval(poll, POLL_MS);
	return {
		/** An action the engine accepted here, the `n`th (0-based) of the match. */
		send(n, a) { outbox.push({ n, a }); flush(); },
		poll,
		pending: () => outbox.length > 0 || sending,
		deadline: () => deadline,
		stop() { stopped = true; clearInterval(timer); },
	};
}
