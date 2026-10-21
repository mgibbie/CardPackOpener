'use strict';
/* ============ expedition/core.js — the Expedition's entry point (MicaSurvivor DLC D0b, not upstream) ============
 * Lazy-loaded by G.Expedition.load() (js/systems/expedition.js) after the base tables are frozen; a base boot never
 * runs it. Loading registers nothing until init(); init() attaches to the base game ONLY through the G.Hooks seams
 * (js/core/hooks.js), and every listener leaves a base run alone (G.Modes.isExp() is false), so a base run plays the
 * same with this file loaded (overworld/tests/micasurvivor_expedition_forceload_test.mjs re-runs the D0a golden runs).
 *
 * D0b is plumbing only (no gameplay yet):
 *   run.start       an Expedition run starts: its {mode, dv, map, diff}
 *   replay.header   its replay header gets dv / map / diff (G.Modes.run; the mode is already h.m)
 *   spectate.snap   its live / replay snapshots get dv
 *   run.end         its progress goes into the Expedition save (G.ExpSave: runs, best time per map + difficulty) and a
 *                   clean solo run's mark to the Expedition board (run-score mode 'micasurvivor_expedition', per map +
 *                   difficulty: never the base board)
 *
 * D1 (terrain layers, js/expedition/terrain.js):
 *   run.start       the run's first zone is generated from the world seed + map + zone 1 (G.DLC.rng) and set on the
 *                   world (G.World.setZone): heights, cliffs, ramps; the player starts in its flat clearing
 *   spectate.snap   each snapshot carries the `x` block v1 {xv: 1, m: map, z: zone, th: terrain hash} (so a replay and
 *                   a spectator rebuild the zone: js/ui/watch-ui.js -> G.Expedition.viewZone -> applyX)
 *   net.frame       each co-op host frame carries the same `x` (a guest rebuilds from its start seed: js/net/coop.js)
 *   applyX(seed, x) the rebuild: the same zone from the same seed + x (its hash checked against x.th)
 */
G.Exp = (() => {
  const dv = 1;   // this file's content version: G.Expedition.DV must match (the loader refuses a stale cache)
  const X = G.Expedition;
  let inited = false, cur = null;
  const XV = 1;   // the `x` block's schema (G.ExpTerrain.XV): bump it (and keep a reader for the old one) when it grows
  const expRun = () => G.Modes.isExp();

  function init() {
    if (inited) return;
    inited = true;
    G.Hooks.on('run.start', cfg => {
      if (!expRun()) return;
      cur = { mode: cfg.mode, dv: cfg.dv, map: cfg.map, diff: cfg.diff, zone: 0, th: '' };
      enterZone(1);
    });
    G.Hooks.on('replay.header', h => {
      if (!expRun()) return h;
      const R = G.Modes.run;
      h.dv = R.dv; h.map = R.map; h.diff = R.diff;
      return h;
    });
    G.Hooks.on('spectate.snap', s => {
      if (expRun()) { s.dv = G.Modes.run.dv; const x = xblock(); if (x) s.x = x; }
      return s;
    });
    G.Hooks.on('net.frame', f => {
      if (expRun()) { const x = xblock(); if (x) f.x = x; }
      return f;
    });
    G.Hooks.on('run.end', (out, sum) => {
      if (!X.isExp(sum.mode)) return out;
      record(sum);
      if (sum.clean && !sum.group) submitScore(sum);
      cur = null;
      return out;
    });
    G.ExpSave.open();
  }

  // ---------------- D1: the zone ----------------
  /** Generates zone `z` of this run's map from the world seed and puts it in the world (the player in its clearing). */
  function enterZone(z) {
    const zone = G.ExpTerrain.generate({ seed: G.World.seed, map: (cur && cur.map) || G.Modes.run.map, zone: z });
    G.World.setZone(zone);
    G.Path.clear();
    G.Minimap.reset();
    if (cur) { cur.zone = z; cur.th = zone.hash; }
    return zone;
  }
  /** The `x` block v1 of the current zone: {xv, m, z, th} (null outside a zone). Terrain itself is never sent. */
  function xblock() {
    const zn = G.World.zone;
    return zn && zn.map ? { xv: XV, m: zn.map, z: zn.zone, th: zn.hash } : null;
  }
  /** A viewer / guest: the same zone from the same seed + `x`. -> its hash, or null (an unknown schema). */
  function applyX(seed, x) {
    if (!x || x.xv !== XV || !G.ExpTerrain.MAPS.includes(x.m)) { if (x) console.warn('[Exp] unknown terrain block', x); return null; }
    if ((G.World.seed | 0) !== (seed | 0)) return null;   // (the view has moved on to another run)
    const zone = G.ExpTerrain.generate({ seed, map: x.m, zone: x.z });
    if (x.th && zone.hash !== x.th) console.warn('[Exp] terrain rebuild differs from the host (' + zone.hash + ' vs ' + x.th + ')');
    G.World.setZone(zone);
    G.Minimap.reset();
    return zone.hash;
  }

  /** The run's progress into the Expedition save (never the base save). */
  function record(sum) {
    const S = G.ExpSave;
    S.bump('runs');
    S.bump('runs.' + sum.mode);
    if (X.MAPS.includes(sum.map) && X.DIFFS.includes(sum.diff)) S.best('best.time.' + sum.map + '.' + sum.diff, sum.time);
    S.commit();
  }

  /**
   * A mark on the Expedition board (per map + difficulty). D0b's score is the time survived (D9 brings the
   * Expedition score formula). -> {ok, better, best, rank} | {error}
   */
  async function submitScore(m) {
    const A = G.MicaAccount;
    if (!A || !A.name()) return { error: 'not logged in' };
    const d = await A.call('run-score', {
      mode: X.BOARD, expMode: m.mode, dv: m.dv, map: m.map, diff: m.diff,
      score: Math.floor(m.score != null ? m.score : m.time), time: Math.floor(m.time),
      kills: Math.floor(m.kills || 0), level: Math.floor(m.level || 1), dex: m.dex | 0, shiny: !!m.shiny
    });
    return d.ok ? d.body : { error: (d.body && d.body.error) || 'offline' };
  }
  /** The board of one map + difficulty: {top, you} */
  async function leaderboard(map, diff) {
    const A = G.MicaAccount;
    if (!A || !A.name()) return { top: [], you: null, error: 'not logged in' };
    const d = await A.call('run-leaderboard', { mode: X.BOARD, map, diff });
    if (!d.ok) return { top: [], you: null, error: (d.body && d.body.error) || 'offline' };
    return { top: d.body.top || [], you: d.body.you || null };
  }

  return { dv, XV, init, submitScore, leaderboard, record, enterZone, xblock, applyX, get run() { return cur; }, get inited() { return inited; } };
})();
