// game_state.js — the match client's shared mutable state (the game.js split, 2026-11).
//
// These were top-level `let`s in game.js that many of its sections read AND reassign. ES module
// imports are read-only, so a module split out of game.js couldn't reassign an exported `let`.
// They live on one object instead, and any module that imports GS reads and writes the same state.
// (GS, not S: game.js has locals named S. The overworld's twin is overworld/ow_state.js.)
//
// Initial values are still assigned in game.js at the spot each `let` used to be
// (tools/codemod_state.mjs --file=battlecards/game.js --obj=GS did the rewrite), so evaluation
// order is unchanged; the fields here only document what exists.
export const GS = {
	state: undefined,            // the engine game (E.createGame / fromSnapshot); null until a match boots
	HUMAN: undefined,            // the seat this tab plays (0 unless a duel guest / spectator): the board reorients so it sits at the bottom
	playerCount: undefined,      // seats in this match, 2..E.MAX_PLAYERS (?players=N, or the duel / run that booted it)
	classRegistry: undefined,    // the class definitions loaded at boot (id, name, hero power, …)
	heistBossName: undefined,    // the current heist / tombs boss display name, else null
	dungeonBossId: undefined,    // the dungeon boss being fought (a Dungeon.BOSSES id), else null
	pending: undefined,          // { card, spec, targets } while a spell / battlecry is choosing targets, else null
	selectedAttacker: undefined, // uid of the creature picked to attack, else null
	hoverUid: undefined,         // uid of the card under the pointer, else null
	placing: undefined,          // { card } while a creature is dragged out of hand to pick a board gap, else null
	handMini: undefined,         // true = the hand is tucked down so the hero panel reads clearly
	mouseX: undefined,           // last pointer position (client px); the targeting arrow and drags read it
	mouseY: undefined,
	telegraphs: undefined,       // [{ from, to, until, friendly }] — attack / effect lines being shown before they resolve
	queueBusy: undefined,        // true while the event animation queue is playing a step
};
