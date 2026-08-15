// engine/validate.js — development-only game-state invariant checker.
//
// Pure read: never mutates state, never emits events. Returns an array of
// violation strings (empty array = healthy). Intended to run at ACTION
// BOUNDARIES only — mid-effect states legally violate several invariants
// (corpses awaiting sweepDeaths, hand overflow awaiting cleanup discard).
//
// Invariant references (docs/engine-hardening/03-state-invariants.md):
//   I1  unique uids            I2/I3 zone membership (limbo whitelisted)
//   I5  resource floors        I8    valid current/priority
//   I17 decks hold ids         + numeric sanity (NaN poisoning)
//
// Deliberately NOT checked here (soft or timing-dependent invariants):
//   hand size (legal overflow until cleanup), board corpses (legal until
//   sweep), aura delta consistency (recomputeAuras self-heals).

const INSTANCE_ZONES = [
	'hand', 'board', 'graveyard', 'exile', 'secrets', 'traps', 'quests',
	'enchantments', 'artifacts', 'emblems', 'planeswalkers', 'heroPowers', 'command',
];
// fields that legally hold card instances "outside" any zone (see 03-state-invariants)
const LIMBO_FIELDS = ['savedHand', 'godfreyHeld'];

const num = v => typeof v === 'number' && Number.isFinite(v);

export function validateGameState(state) {
	const errs = [];
	if (!state || !Array.isArray(state.players)) return ['no state / players array'];
	const seen = new Map(); // uid -> location label

	const checkCard = (c, where, pi) => {
		if (c == null) { errs.push(`${where}[p${pi}] holds null/undefined`); return; }
		if (c.uid == null) { errs.push(`${where}[p${pi}] card '${c.id}' has no uid`); return; }
		if (seen.has(c.uid)) errs.push(`uid ${c.uid} ('${c.id}') in ${where} AND ${seen.get(c.uid)}`);
		else seen.set(c.uid, `p${pi}.${where}`);
		if (c.type === 'creature' || c.type === 'location') {
			if (!num(c.attack) && c.type === 'creature') errs.push(`${where} '${c.id}' non-numeric attack (${c.attack})`);
			if (!num(c.maxHealth ?? c.durability)) errs.push(`${where} '${c.id}' non-numeric health`);
			if (!num(c.damage ?? 0)) errs.push(`${where} '${c.id}' non-numeric damage`);
		}
		if (c.cost != null && !num(c.cost)) errs.push(`${where} '${c.id}' non-numeric cost (${c.cost})`);
	};

	for (let pi = 0; pi < state.players.length; pi++) {
		const p = state.players[pi];
		if (!p) { errs.push(`players[${pi}] missing`); continue; }

		for (const zone of INSTANCE_ZONES) {
			const arr = p[zone];
			if (arr == null) continue;
			if (!Array.isArray(arr)) { errs.push(`p${pi}.${zone} is not an array`); continue; }
			for (const c of arr) checkCard(c, zone, pi);
		}
		if (p.weapon) checkCard(p.weapon, 'weapon', pi);
		for (const lf of LIMBO_FIELDS) for (const c of p[lf] || []) checkCard(c, lf, pi);
		for (const f of p.futureCards || []) if (f && f.card) checkCard(f.card, 'futureCards', pi);

		// resource floors + numeric sanity
		if (p.mana) {
			if (!num(p.mana.cur) || p.mana.cur < 0) errs.push(`p${pi} mana.cur invalid (${p.mana.cur})`);
			if (!num(p.mana.max) || p.mana.max < 0) errs.push(`p${pi} mana.max invalid (${p.mana.max})`);
			if (!num(p.mana.bonus) || p.mana.bonus < 0) errs.push(`p${pi} mana.bonus invalid (${p.mana.bonus})`);
		}
		if (!num(p.life)) errs.push(`p${pi} life is not a finite number (${p.life})`);
		if (p.armor != null && (!num(p.armor) || p.armor < 0)) errs.push(`p${pi} armor invalid (${p.armor})`);
		if (p.corpses != null && (!num(p.corpses) || p.corpses < 0)) errs.push(`p${pi} corpses invalid (${p.corpses})`);

		// decks hold ids, never instances (I17)
		if (!Array.isArray(p.deck)) errs.push(`p${pi} deck is not an array`);
		else for (const id of p.deck) if (typeof id !== 'string') errs.push(`p${pi} deck holds a non-id value (${typeof id})`);
	}

	// turn / priority ownership (I8) — skipped once the game is over
	if (!state.over) {
		const cur = state.players[state.current];
		if (!cur) errs.push(`state.current out of range (${state.current})`);
		else if (cur.eliminated) errs.push('current player is eliminated');
		if (state.priority != null) {
			const pp = state.players[state.priority];
			if (!pp) errs.push(`state.priority out of range (${state.priority})`);
			else if (pp.eliminated) errs.push('priority player is eliminated');
		}
	}

	// elimination consistency (I20), enforced only while the game is live (end-of-game
	// cleanup order is tolerated, like the turn/priority checks above): an eliminated
	// seat holds no board creatures and no weapon — checkGameOver clears them and
	// nothing re-adds (summon/reborn skip the dead), so a lingering board/weapon on a
	// dead seat is real corruption. NOTE: an eliminated seat's HAND can legally gain
	// dead cards from all-player draw effects (harmless — it can't act), and a live
	// seat momentarily at <=0 life is a timing-dependent transient — neither is a hard
	// invariant, so neither is checked here (see the module header's "soft" list).
	if (!state.over) {
		for (let pi = 0; pi < state.players.length; pi++) {
			const p = state.players[pi];
			if (p && p.eliminated && ((p.board && p.board.length) || p.weapon))
				errs.push(`p${pi} eliminated but keeps a board/weapon (board ${p.board ? p.board.length : 0}, weapon ${p.weapon ? 1 : 0})`);
		}
	}
	// a finished game names a valid, living winner (null = an FFA wipe / abandonment)
	if (state.over && state.winner != null) {
		const w = state.players[state.winner];
		if (!w) errs.push(`state.winner out of range (${state.winner})`);
		else if (w.eliminated) errs.push(`winner p${state.winner} is eliminated`);
	}
	// I19: no Sets/Maps in serialized state — they JSON.stringify to {} and
	// crash or silently lose data after a duel/spectate snapshot round-trip
	// (found live: tribesPlayedGame was a Set; guests crashed post-ingest)
	for (let pi = 0; pi < state.players.length; pi++) {
		for (const [k, v] of Object.entries(state.players[pi])) {
			if (v instanceof Set || v instanceof Map) errs.push(`p${pi}.${k} is a ${v.constructor.name} — not snapshot-safe`);
		}
	}
	return errs;
}
