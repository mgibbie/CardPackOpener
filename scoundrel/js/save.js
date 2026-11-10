// Scoundrel — this device's run save and replays. A run is its recipe (seed + the action
// string, engine.js): saved after EVERY action, so a reload resumes on the exact frame
// (mid-room, mid fight choice, on the "dungeon cleared" screen). Finished runs keep a
// replay (the last 10) and share as a link: /scoundrel/?replay=<seed>.<actions>.
import { ENGINE_VERSION, replay as rebuild, STATE } from './engine.js';

export const RUN_KEY = 'scoundrel_run_v1';
export const REPLAYS_KEY = 'scoundrel_replays_v1';
const MAX_REPLAYS = 10;
const SEED_RE = /^[A-Za-z0-9_-]{1,24}$/;
const ACTS_RE = /^[0-3wbcrd]*$/;

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

export const cleanSeed = (s) => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
/** A fresh random seed (the only randomness outside the engine: which run to play). */
export function randomSeed() {
  const a = new Uint32Array(2);
  try { crypto.getRandomValues(a); } catch (e) { a[0] = Date.now() >>> 0; a[1] = (Math.random() * 2 ** 32) >>> 0; }
  return (a[0].toString(36) + a[1].toString(36)).toUpperCase().slice(0, 10);
}

/** The saved run in progress: {seed, actions, v, started} or null (a finished or corrupt one is not offered). */
export function loadRun() {
  const r = read(RUN_KEY);
  if (!r || !SEED_RE.test(String(r.seed)) || !ACTS_RE.test(String(r.actions || ''))) return null;
  return { seed: r.seed, actions: r.actions || '', v: r.v || 1, started: r.started || 0 };
}
export function saveRun(s, started) {
  return write(RUN_KEY, { v: ENGINE_VERSION, seed: s.seed, actions: s.actions, started: started || Date.now(), dungeon: s.dungeon, hp: s.hp, maxHp: s.maxHp });
}
export function clearRun() { try { localStorage.removeItem(RUN_KEY); } catch (e) { /* private mode */ } }

/** The saved run rebuilt (null when there is none, or it is already over). */
export function resumeRun() {
  const r = loadRun();
  if (!r) return null;
  const s = rebuild(r.seed, r.actions);
  if (s.state === STATE.OVER) return null;
  return { state: s, started: r.started };
}

export function listReplays() { const l = read(REPLAYS_KEY); return Array.isArray(l) ? l.filter((x) => x && SEED_RE.test(String(x.seed)) && ACTS_RE.test(String(x.actions))) : []; }
export function addReplay(s) {
  const list = listReplays().filter((x) => !(x.seed === s.seed && x.actions === s.actions));
  list.unshift({ id: s.seed + '.' + s.actions.length, seed: s.seed, actions: s.actions, result: s.result, when: Date.now() });
  write(REPLAYS_KEY, list.slice(0, MAX_REPLAYS));
}

/** ?replay=<seed>.<actions> */
export const replayParam = (seed, actions) => cleanSeed(seed) + '.' + String(actions || '');
export function parseReplayParam(p) {
  const m = /^([A-Za-z0-9_-]{1,24})\.([0-3wbcrd]*)$/.exec(String(p || '').trim());
  return m ? { seed: m[1], actions: m[2] } : null;
}
export const replayUrl = (seed, actions) => location.origin + '/scoundrel/?replay=' + replayParam(seed, actions);
