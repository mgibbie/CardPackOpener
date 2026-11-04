// ow_core.js — the overworld's shared singletons (Plans/MAIN_JS_SPLIT_PLAN.md, phase 1).
//
// These were built at main.js's top level. They are created once and never
// reassigned, so every module the split carves out of main.js can import them
// from here instead of reaching back into main.js (which would be an import cycle).
//
// Order note: an imported module evaluates BEFORE main.js's own body, so these
// are now built slightly earlier than they used to be. Every constructor is
// side-effect free, except Trainers and Items, which read their own saved state
// (defeated / rematch, collected / berry times). Nothing in main.js writes those
// keys before this point, so they read exactly what they did before.
import { World, Player } from './engine.js';
import { NPCs } from './npcs.js';
import { Encounters } from './encounters.js';
import { Battle } from './battle.js';
import { Trainers } from './trainers.js';
import { Dialog } from './dialog.js';
import { Services } from './services.js';
import { Arcade } from './arcade.js';
import { Blockers } from './blockers.js';
import { Portals } from './portals.js';
import { Evolution } from './evolution.js';
import { Items } from './items.js';
import { Pvp } from './pvp.js';
import { FactorySpec } from './factoryspec.js';
import * as Story from './events.js';

// the display canvas (the GBA frame is scaled up onto it) and the status line
export const screen = document.getElementById('screen');
export const sctx = screen.getContext('2d', { alpha: false }); // fully repainted opaque every frame
export const hud = document.getElementById('hud');

export const world = new World();
export const player = new Player(world);
export const npcs = new NPCs(world, player);
export const encounters = new Encounters();
export const battle = new Battle();
export const trainers = new Trainers(world, player);
export const dialog = new Dialog();
export const services = new Services(world);
export const arcade = new Arcade(world);
export const blockers = new Blockers(world);
export const portals = new Portals(world);
export const evolution = new Evolution();
export const items = new Items(world);
export const pvp = new Pvp();
export const factorySpec = new FactorySpec();
export const cutscene = new Story.Cutscene();
