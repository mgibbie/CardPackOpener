// engine/effects/registry.js — the effect-registry INFRASTRUCTURE (docs/06).
// Pure: two maps + the ABORT sentinel. All handler registrations live in the
// themed handlers-*.js files, loaded via index.js.

const HANDLERS = new Map();

export function register(type, fn) {
	if (HANDLERS.has(type)) throw new Error(`effect handler '${type}' registered twice`);
	HANDLERS.set(type, fn);
}
export function getEffectHandler(type) {
	return HANDLERS.get(type);
}
// Abort sentinel: a handler returning ABORT stops the WHOLE effect list
// (velen-exiled-replay's game-over guard was a bare `return` from execEffects).
export const ABORT = Symbol('abort-effects');

// ---------- trigger-side registry (endgame II, PR 38) ----------
// runSecretEffects' 139-case switch, retired. Handlers get the TRIGGER
// context (ctx.self/minion/damaged/amount/...) plus the triggering() helper;
// bodies are the old case bodies verbatim inside do/while(false), so their
// `break` statements end the effect exactly like the old case breaks.
const TRIGGER_HANDLERS = new Map();
export function registerTrigger(type, fn) {
	if (TRIGGER_HANDLERS.has(type)) throw new Error(`trigger handler '${type}' registered twice`);
	TRIGGER_HANDLERS.set(type, fn);
}
export function getTriggerHandler(type) {
	return TRIGGER_HANDLERS.get(type);
}
export function registeredTriggerTypes() {
	return [...TRIGGER_HANDLERS.keys()];
}

export function registeredTypes() {
	return [...HANDLERS.keys()];
}

