// A run session: the engine plus a record of how to rebuild it.
//
// A run is fully determined by (seed, back, stake, actions[]) — the engine
// has no unseeded randomness — so saving is just persisting that recipe and
// resuming is replaying it. That also makes every run a tiny replay.

import { G } from './core.js';
import { newRun, act } from './run.js';
import { toView } from './view.js';

export const ENGINE_VERSION = 1;
const SAVE_KEY = 'micatro_run_v1';

export class Session {
  constructor() { this.recipe = null; this.events = []; }

  start({ seed, back = 'b_red', stake = 1, mods = [], modOptions = {}, customDeck = null } = {}) {
    newRun({ seed, back, stake, mods, modOptions, customDeck });
    this.recipe = { v: ENGINE_VERSION, seed: G.GAME.pseudorandom.seed, back, stake, mods: G.GAME.mods.slice(), modOptions: G.GAME.mod_options, actions: [], started: Date.now() };
    // A custom deck (the deck editor): its validated definition is part of the recipe, so a resume /
    // replay / spectator rebuilds exactly this run.
    if (G.GAME.custom_deck) this.recipe.customDeck = G.GAME.custom_deck;
    this.events = G.ui_events.splice(0);
    this.save();
    return this.events;
  }

  /** Apply a player action. Returns {ok, error, events}. */
  act(a) {
    const r = act(a);
    G.ui_events.length = 0;
    if (r.ok) {
      this.recipe.actions.push(a);
      this.save();
    }
    return r;
  }

  view() { return toView(); }
  get over() { return !!(G.GAME && G.GAME.over); }

  /** Rebuild from a recipe. Stops at the first action the engine rejects. */
  static fromRecipe(recipe) {
    const s = new Session();
    newRun({ seed: recipe.seed, back: recipe.back, stake: recipe.stake, mods: recipe.mods || [], modOptions: recipe.modOptions || {}, customDeck: recipe.customDeck || null });
    s.recipe = { ...recipe, actions: [] };
    for (const a of recipe.actions || []) {
      const r = act(a);
      if (!r.ok) break;
      s.recipe.actions.push(a);
    }
    G.ui_events.length = 0;
    return s;
  }

  /** A step-by-step player for a finished run's recipe (the replay viewer). See ReplayStepper. */
  static stepper(recipe) { return new ReplayStepper(recipe); }

  save() {
    try {
      if (!this.recipe) return;
      if (this.over) localStorage.removeItem(SAVE_KEY);
      else localStorage.setItem(SAVE_KEY, JSON.stringify(this.recipe));
    } catch (e) { /* storage full / private mode — the run just isn't resumable */ }
  }

  static saved() {
    try {
      const r = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (r && r.v === ENGINE_VERSION && r.seed) return r;
    } catch (e) { /* ignore */ }
    return null;
  }
  static clearSaved() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }
}

// ------------------------------------------------------------------ replays
// A Micatro replay is a whole RUN, never a single round: the finished run's recipe, re-simulated
// action by action. The engine is deterministic, so rebuilding from (seed, back, stake, mods,
// modOptions, customDeck) and re-applying the actions reproduces every view and every UI event the
// player saw. Seeking backward rebuilds from the start (the engine state can't be cloned) — about
// 0.3 ms an action, so even a long Endless run seeks in well under a second.

/** Actions that only change a selection / an order: a replay runs these instantly. */
export const INSTANT_ACTIONS = new Set(['highlight', 'reorder', 'sort_hand']);

/** A short fingerprint of a run's end state. The replay stores it; a re-simulation that ends
 *  elsewhere (the engine or a mod changed since the recording) is detected by comparing it. */
export function viewChecksum(v) {
  if (!v) return '';
  const str = (x) => (x == null ? '' : typeof x === 'object' && x.toJSON ? String(x.toJSON()) : String(x));
  const sig = [v.state, v.ante, v.round, v.dollars, str(v.chips), str(v.stats && v.stats.best_hand), v.seq, v.deck_total,
    v.won ? 1 : 0, v.over ? 1 : 0, v.endless ? 1 : 0,
    ((v.areas && v.areas.jokers) || []).map((c) => c.center).join(','),
    ((v.areas && v.areas.consumeables) || []).map((c) => c.center).join(',')].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < sig.length; i++) { h ^= sig.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `A${v.ante}R${v.round}$${v.dollars}#${h.toString(16).padStart(8, '0')}`;
}

export class ReplayStepper {
  constructor(recipe) {
    if (!recipe || typeof recipe !== 'object' || !Array.isArray(recipe.actions)) throw new Error('not a run recipe');
    this.recipe = recipe;
    this.actions = recipe.actions;
    this.reset();
  }
  get total() { return this.actions.length; }
  /** Rejected / threw at `error.index` (the run can't be rebuilt past it), or reached the end. */
  get done() { return !!this.error || this.index >= this.actions.length; }

  /** Back to the run's first view. Returns the run-start UI events. */
  reset() {
    const r = this.recipe;
    newRun({ seed: r.seed, back: r.back || 'b_red', stake: r.stake == null ? 1 : r.stake, mods: r.mods || [], modOptions: r.modOptions || {}, customDeck: r.customDeck || null });
    this.index = 0;
    this.error = null;
    this.startEvents = G.ui_events.splice(0);
    return this.startEvents;
  }

  /** Apply the next action -> {ok, index, action, events} | {ok:false, error} | null at the end. */
  step() {
    if (this.done) return null;
    const a = this.actions[this.index];
    let r;
    try { r = act(a); } catch (e) { r = { ok: false, error: 'engine error: ' + (e && e.message), events: [] }; }
    G.ui_events.length = 0;
    if (!r.ok) {
      this.error = { index: this.index, action: a, error: r.error || 'rejected' };
      return { ok: false, index: this.index, action: a, error: this.error.error, events: [] };
    }
    this.index++;
    return { ok: true, index: this.index, action: a, events: r.events || [] };
  }

  /** Go to the state after `i` actions (backward = rebuild from the start). Returns the index reached. */
  seek(i) {
    i = Math.max(0, Math.min(this.actions.length, i | 0));
    if (i < this.index || (this.error && i <= this.error.index)) this.reset();
    while (this.index < i && !this.error) this.step();
    return this.index;
  }

  view() { return toView(); }

  /** One headless pass over the whole run (then back to the start): per-action ante/round/state,
   *  the blind + ante boundaries for the scrubber, the final view's checksum and where (if anywhere)
   *  the engine rejected an action. */
  scan() {
    this.reset();
    const n = this.actions.length;
    const ante = new Array(n + 1), state = new Array(n + 1);
    const GM = () => G.GAME;
    ante[0] = GM().round_resets.ante; state[0] = G.STATE;
    const blinds = [], antes = [{ index: 0, ante: ante[0] }];
    let winIndex = null;
    while (!this.done) {
      const r = this.step();
      if (!r || !r.ok) break;
      const i = this.index;
      ante[i] = GM().round_resets.ante; state[i] = G.STATE;
      if (r.action.type === 'select_blind') blinds.push({ index: i - 1, ante: ante[i], blind: GM().blind && GM().blind.name });
      if (ante[i] !== ante[i - 1]) antes.push({ index: i, ante: ante[i] });
      if (winIndex == null && GM().won) winIndex = i;
    }
    const end = { index: this.index, error: this.error, view: toView() };
    end.checksum = viewChecksum(end.view);
    this.reset();
    return { total: n, ante, state, blinds, antes, winIndex, end };
  }
}
