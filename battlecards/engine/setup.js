// engine/setup.js — narrow out-of-band setup/run-modifier APIs (PR 15).
//
// game.js used to reach into player objects directly for dungeon-boss setup,
// duel guest-deck setup, and treasure application (the risk-register's "27
// direct-mutation sites" — the reason engine field renames were frozen).
// These APIs are the ONLY sanctioned out-of-band writes now; each validates
// its inputs loudly instead of silently poking fields.
//
// Everything here runs OUTSIDE normal play (encounter boot, between-fight
// treasure grants), so no triggers fire and no events are emitted except
// where the old inline code emitted/behaved identically.
import { allocUid, recomputeAuras } from './core.js';

// Replace a player's deck with `ids` (Fisher-Yates via state.rng) and empty
// the hand — encounter boot for dungeon bosses and duel guests. NOTE: the old
// boss path shuffled with `.sort(() => Math.random() - 0.5)`, which is a
// biased shuffle; this is the engine's canonical unbiased one.
export function resetDeckAndHand(state, pi, ids, { shuffle = true } = {}) {
	const p = state.players[pi];
	p.deck = [...ids];
	if (shuffle) {
		for (let i = p.deck.length - 1; i > 0; i--) {
			const j = Math.floor(state.rng() * (i + 1));
			[p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]];
		}
	}
	p.hand = [];
}

// Out-of-band hero-state writes, allow-listed so a typo (or a future engine
// field rename) fails loudly at the call site instead of silently no-oping.
const HERO_MOD_FIELDS = new Set(['life', 'maxLife', 'deathrattlesTwice', 'battlecriesTwice']);
export function applyHeroMods(state, pi, mods) {
	const p = state.players[pi];
	for (const [k, v] of Object.entries(mods)) {
		if (!HERO_MOD_FIELDS.has(k)) throw new Error(`applyHeroMods: '${k}' is not an allowed field`);
		p[k] = v;
	}
}

// Permanent empty-crystal gain (dungeon Crystal Gem): current AND max.
export function addManaCrystal(state, pi, n = 1) {
	const p = state.players[pi];
	p.mana.cur += n;
	p.mana.max += n;
}

// Grant a passive emblem (dungeon treasures: auras, costMods, statics).
// Emblems participate in fireOngoing/staticValue/recomputeAuras scans, so the
// aura pass runs after the grant. Uids come from the engine allocator (the
// old inline code minted string uids like 'treasure_0').
export function grantEmblem(state, pi, { id, name, description, ...fields }) {
	const card = {
		uid: allocUid(), id, name: name || id, type: 'emblem', zone: 'emblem',
		controller: pi, keywords: [], description: description || '',
		...fields,
	};
	state.players[pi].emblems.push(card);
	// no event emitted (the old inline grant was silent — treasures apply at
	// encounter boot, before the renderer starts consuming events)
	recomputeAuras(state);
	return card;
}

// Cap a hero power's cost (Justicar's Ring: "your Hero Power costs (1)").
export function capHeroPowerCost(state, pi, cap) {
	for (const hp of state.players[pi].heroPowers) {
		if (hp.power) hp.power.cost = Math.min(hp.power.cost, cap);
	}
}

// Dungeon fights strip commanders/companions (their zones render in the
// western corners that dungeon mode doesn't show).
export function stripLoadouts(state) {
	for (const p of state.players) { p.companion = null; p.command = []; }
}
