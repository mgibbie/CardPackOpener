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
