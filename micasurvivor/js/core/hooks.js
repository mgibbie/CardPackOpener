/* ============ hooks.js — named seams for the Expedition modes (MicaSurvivor DLC D0b, not upstream) ============
 * The Expedition code (js/expedition/*.js, lazy-loaded by G.Expedition.load(), js/systems/expedition.js) plugs into
 * the base game ONLY through these seams. Base code calls a seam at a fixed spot; with no listener the call is a
 * no-op that returns its input unchanged, so a base run behaves exactly as before (proved by
 * overworld/tests/micasurvivor_dlc_base_unchanged_test.mjs, with and without the Expedition scripts loaded).
 * Modelled on Micatro's callHook / reduceHook / firstHook (micatro/js/mods/registry.js).
 *
 *   G.Hooks.on(seam, fn)          add a listener (an unknown seam name throws: no silent typos); returns an off()
 *   G.Hooks.call(seam, ...args)   run every listener (their return values are ignored)
 *   G.Hooks.reduce(seam, v, ...a) v = fn(v, ...a) through every listener (a listener returning undefined keeps v)
 *   G.Hooks.first(seam, ...args)  the first listener result that is not undefined
 *   G.Hooks.count(seam)           how many listeners
 * A listener that throws is logged and skipped: an Expedition bug can't break a base screen or run.
 * Listeners must check the run's mode themselves (G.Expedition.isExp(G.Modes.mode)) and leave base runs alone.
 *
 * The seams (added only where D0b needs one; later batches add theirs here):
 *   run.start       game.js startRun, after the run is set up (cfg = G.Modes.run, the player)
 *   run.end         game.js endRun, an Expedition run only: reduce({lines}, summary) -> the run-over screen's lines;
 *                   summary = {mode, dv, map, diff, time, level, kills, bosses, dead, dex, shiny, clean, group}
 *   replay.header   js/mica/replay.js begin: the replay header h (the Expedition adds dv / map / diff)
 *   spectate.snap   js/mica/spectate.js snap(): each live / replay snapshot (the Expedition adds dv; D1: its `x` block)
 *   net.frame       DLC D1: js/net/coop.js hostFrame: reduce(frame, mate) -> each host frame (the Expedition adds `x`);
 *                   DLC D2: also a guest's frame to the host, reduce(frame, null) (an Expedition guest adds its air row)
 *   levelup.offer   DLC D4: js/systems/levelup.js offer(pl, n), before any card is drawn: first(pl, n) -> cards to show
 *                   instead (an Expedition League run's branch evolution), or undefined (the base cards)
 *   levelup.cards   DLC D4: the end of offer: reduce(cards, pl) -> the cards (an Expedition League run adds `note`)
 *   (DLC D5, level-ups and items: js/expedition/levelups.js, items.js, moves.js. Each is a no-op in a base page.)
 *   xp.need         js/entities/player.js Player.xpNeed: reduce(xp, level) -> the XP to the next level (Expedition: the
 *                   study's 8 + 5.5 L + L^1.8 curve)
 *   item.roll       js/data/items.js roll(): first(pl) -> an item id instead of a base item (Expedition: its own, seeded)
 *   item.take       js/game.js offerItem: first(pl, id) -> true if the Expedition took that pickup (its stacking items)
 *   player.hurt     js/entities/player.js hurt, the damage about to be taken: reduce(d, pl, type) (evasion, shield);
 *                   a result <= 0 is a dodge / absorbed hit
 *   player.ko       js/entities/player.js hurt, hp <= 0 before the base saves: call(pl) (a listener may set hp > 0)
 *   player.dealt    js/entities/player.js onDealt: call(pl, dmg) (lifesteal)
 *   combat.out      js/systems/combat.js land: reduce(k, pl, e, src, dmg) -> the hit's damage factor (items' procs)
 *   combat.run      js/systems/combat.js run, a move kind the base doesn't know: call(pl, m, ghost) (the 8 new archetypes)
 *   combat.ghost    js/systems/combat.js ghostCast, a move id the base doesn't know: call(pl, id, lvl, aim)
 *   run.tick        js/game.js update, an Expedition run only, after the fields: call(dt, pl, time)
 *   (DLC D6, Ultimates: js/expedition/ultimates.js. Each is a no-op in a base page.)
 *   enemy.ko        js/entities/enemy.js EnemyMgr.update, an enemy of this page's sim has fallen: call(e, pl) (the charge)
 *   run.hold        js/game.js update, an Expedition run only, before the clock: first(dt, pl) -> true holds the world
 *                   this frame (an Ultimate's hit-stop)
 */
G.Hooks = (() => {
  const SEAMS = ['run.start', 'run.end', 'replay.header', 'spectate.snap', 'net.frame', 'levelup.offer', 'levelup.cards',
    'xp.need', 'item.roll', 'item.take', 'player.hurt', 'player.ko', 'player.dealt', 'combat.out', 'combat.run', 'combat.ghost', 'run.tick',
    'enemy.ko', 'run.hold'];
  const L = Object.create(null);
  for (const s of SEAMS) L[s] = [];

  function list(seam) {
    const l = L[seam];
    if (!l) throw new Error('G.Hooks: unknown seam ' + seam);
    return l;
  }
  function on(seam, fn) {
    if (typeof fn !== 'function') throw new Error('G.Hooks.on: not a function');
    list(seam).push(fn);
    return () => off(seam, fn);
  }
  function off(seam, fn) {
    const l = list(seam), i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  }
  const warn = (seam, e) => { try { console.warn('[Hooks] ' + seam + ':', e); } catch (e2) { /* nada */ } };
  function call(seam, ...args) {
    const l = L[seam];
    if (!l || !l.length) return;
    for (const fn of l.slice()) { try { fn(...args); } catch (e) { warn(seam, e); } }
  }
  function reduce(seam, v, ...args) {
    const l = L[seam];
    if (!l || !l.length) return v;
    for (const fn of l.slice()) {
      try { const r = fn(v, ...args); if (r !== undefined) v = r; } catch (e) { warn(seam, e); }
    }
    return v;
  }
  function first(seam, ...args) {
    const l = L[seam];
    if (!l || !l.length) return undefined;
    for (const fn of l.slice()) {
      try { const r = fn(...args); if (r !== undefined) return r; } catch (e) { warn(seam, e); }
    }
    return undefined;
  }
  const count = seam => list(seam).length;

  return { SEAMS, on, off, call, reduce, first, count };
})();
