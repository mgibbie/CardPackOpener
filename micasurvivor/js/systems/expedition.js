/* ============ expedition.js — the Expedition modes' registry and loader (MicaSurvivor DLC D0b, not upstream) ============
 * Expedition (Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md) is a set of NEW modes picked on the mode select like Tower or
 * Boss Rush: there is no global switch (owner, 2026-10-19), and the existing modes play exactly as before. This file
 * is the only Expedition code a base boot loads; it is small and does nothing on its own:
 *
 *   MODES / NAME / DESC / ICON   the Expedition entries of "Choose a mode" (js/ui/modes-ui.js, the "Expedition"
 *                                group). D0b ships them all as "Coming soon": ENABLED is empty. A later batch turns
 *                                one on with ENABLED.add(id); G.Modes.plan() then plans it ({mode, dv, map, diff}).
 *   DV                           the Expedition content version. Every Expedition run carries {mode: 'exp-…', dv}:
 *                                in its replay header and meta, its live snapshots and its co-op lobby. Base runs
 *                                carry no dv (the fields are optional; old replays and lobbies stay valid).
 *                                Bump it whenever Expedition content changes what a run or a snapshot means.
 *   load()                       the lazy loader: deep-freezes the base data tables (freezeBase), then injects
 *                                SCRIPTS in order (classic <script>s, like the rest of the game) and checks that the
 *                                loaded code is this DV (a stale cache is refused). Only starting an Expedition mode
 *                                calls it (G.Flow.play); a base boot or run never fetches js/expedition/*.
 *   freezeBase()                 Object.freeze, deeply, of G.Moves, G.Items (and its item order), G.Upgrades,
 *                                G.Enemies, G.DEX / G.DEX_BY: once Expedition code is in the page, a write to a base
 *                                table throws (in strict code; Expedition files are 'use strict'). Only plain objects
 *                                and arrays are frozen (functions, Sets, Maps are left alone).
 *   lobbyOk(dv) / replayOk(dv)   the version gates: a co-op lobby needs the SAME dv (else "your game is out of date:
 *                                reload"); a replay / live run with an unknown or newer dv plays with a notice.
 *   wallet                       Pokémonedas are SHARED with the base game (owner): Expedition earns and spends them
 *                                through the base save, here. Nothing calls it yet (D9 / D10 pay the runs).
 * Expedition progress (League catches, unlocks, Lab...) has its OWN save (js/expedition/save.js, the server row
 * micasurvivorexp:<user>); Expedition code never writes the base save micasurvivor:<user> except through `wallet`.
 */
G.I18n.add({
  'Expedición': 'Expedition',
  'Expedición · Clásico': 'Expedition · Classic', 'Expedición · Supervivencia': 'Expedition · Survival', 'Expedición · Liga': 'Expedition · League',
  'Próximamente': 'Coming soon',
  'Expedición · modos nuevos (próximamente)': 'Expedition · new modes (coming soon)',
  'Mapas con alturas, guardianes y un portal final. Marcas por mapa y dificultad.': 'Maps with heights, guardians and a final portal. Records per map and difficulty.',
  'Aguanta todo lo que puedas en un mapa de Expedición, sin final.': 'Last as long as you can on an Expedition map, with no end.',
  'Atrapa y entrena a los Pokémon de tu Liga.': 'Catch and train the Pokémon of your League.',
  'La Expedición llegará pronto.': 'Expedition is coming soon.',
  'Tu juego no está actualizado: recarga la página.': 'Your game is out of date: reload.',
  'No se pudo cargar la Expedición. Recarga la página.': "Couldn't load Expedition. Reload the page.",
  'Esta repetición es de una versión más nueva de la Expedición: recarga la página para verla bien.': 'This replay is from a newer version of Expedition: reload the page to watch it properly.',
  'Esta partida es de una versión más nueva de la Expedición: recarga la página para verla bien.': 'This run is from a newer version of Expedition: reload the page to watch it properly.'
});

G.Expedition = (() => {
  const DV = 1;
  const MODES = ['exp-classic', 'exp-survival', 'exp-league'];
  const NAME = { 'exp-classic': 'Expedición · Clásico', 'exp-survival': 'Expedición · Supervivencia', 'exp-league': 'Expedición · Liga' };
  const DESC = {
    'exp-classic': 'Mapas con alturas, guardianes y un portal final. Marcas por mapa y dificultad.',
    'exp-survival': 'Aguanta todo lo que puedas en un mapa de Expedición, sin final.',
    'exp-league': 'Atrapa y entrena a los Pokémon de tu Liga.'
  };
  const ICON = { 'exp-classic': 'flag', 'exp-survival': 'clock', 'exp-league': 'ball' };
  // the launch maps and difficulties (owner decisions #6 / #8); the boards are per map + difficulty (server/mp.mjs EXP_*)
  const MAPS = ['viridian', 'mtmoon', 'cerulean'];
  const DIFFS = ['normal', 'hard', 'nightmare'];
  const BOARD = 'micasurvivor_expedition';
  const ENABLED = new Set();   // D0b: every Expedition mode is "Coming soon"
  const SCRIPTS = ['js/expedition/save.js', 'js/expedition/core.js'];

  const isExp = m => typeof m === 'string' && MODES.includes(m);
  const enabled = m => isExp(m) && ENABLED.has(m);
  /** The map / difficulty a new Expedition run gets (D0b: the first of each; a later batch adds the pickers). */
  const pick = () => ({ map: MAPS[0], diff: DIFFS[0] });

  // ---------------- the base tables, frozen before any Expedition code runs ----------------
  let frozen = null;
  function deepFreeze(root, seen) {
    let n = 0;
    const stack = [root];
    while (stack.length) {
      const o = stack.pop();
      if (!o || typeof o !== 'object' || seen.has(o)) continue;
      const proto = Object.getPrototypeOf(o);
      if (!Array.isArray(o) && proto !== Object.prototype && proto !== null) continue;   // Sets, Maps, images...: left alone
      seen.add(o);
      for (const k of Reflect.ownKeys(o)) {
        const d = Object.getOwnPropertyDescriptor(o, k);
        if (d && 'value' in d && d.value && typeof d.value === 'object') stack.push(d.value);   // (getters are never called)
      }
      Object.freeze(o);
      n++;
    }
    return n;
  }
  /** Freezes the base data tables (once). -> {ms, objects} */
  function freezeBase() {
    if (frozen) return frozen;
    const t0 = performance.now(), seen = new Set();
    let n = 0;
    for (const t of [G.Moves, G.Items, G.Items && G.Items.LIST, G.Items && G.Items.BY, G.Upgrades, G.Enemies, G.DEX, G.DEX_BY]) n += deepFreeze(t, seen);
    frozen = { ms: Math.round((performance.now() - t0) * 100) / 100, objects: n };
    return frozen;
  }

  // ---------------- the lazy loader ----------------
  let loading = null, loaded = false;
  function inject(src) {
    return new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = false;
      el.dataset.expedition = '1';
      el.onload = () => res();
      el.onerror = () => rej(new Error('Expedition: could not load ' + src));
      document.head.appendChild(el);
    });
  }
  /** Loads the Expedition code (once; a failure can be retried). Resolves true when it is ready. */
  function load() {
    if (loading) return loading;
    loading = (async () => {
      freezeBase();
      for (const s of SCRIPTS) await inject(s);
      if (!G.Exp || G.Exp.dv !== DV) throw new Error('Expedition: stale code (dv ' + (G.Exp && G.Exp.dv) + ', expected ' + DV + ')');
      G.Exp.init();
      loaded = true;
      return true;
    })();
    loading.catch(() => { loading = null; });
    return loading;
  }

  // ---------------- version gates ----------------
  const dvOk = dv => Number.isInteger(dv) && dv >= 1 && dv <= 9999;
  /** A co-op lobby / start: base (no dv) always joins; an Expedition one needs exactly this build's dv. */
  const lobbyOk = dv => dv == null || dv === DV;
  /** A replay or live snapshot: base (no dv) or a dv this build knows (1..DV). An unknown / newer one gets a notice. */
  const replayOk = dv => dv == null || (dvOk(dv) && dv <= DV);
  /** A replay / live run (its mode m and dv) that this build can't show faithfully: an Expedition one ('exp-…' or with a
   *  dv) whose dv is missing, unknown or newer, or whose mode this build doesn't know. A base one never. */
  const viewNotice = (m, dv) => (dv != null || /^exp-/.test(String(m || ''))) && !(dv != null && replayOk(dv) && isExp(m));

  // ---------------- Pokémonedas: the base save's (shared, owner decision #4) ----------------
  const wallet = {
    balance: () => (G.DB.save && G.DB.save.coins) || 0,
    earn(n) {
      n = Math.floor(+n);
      const s = G.DB.save;
      if (!s || !(n > 0)) return false;
      s.coins += n;
      if (s.stats) s.stats.coinsEarned = (s.stats.coinsEarned || 0) + n;
      G.DB.commit(true);
      return true;
    },
    spend(n) {
      n = Math.floor(+n);
      const s = G.DB.save;
      if (!s || !(n > 0) || s.coins < n) return false;
      s.coins -= n;
      G.DB.commit(true);
      return true;
    }
  };

  return {
    DV, MODES, NAME, DESC, ICON, MAPS, DIFFS, BOARD, ENABLED, SCRIPTS,
    isExp, enabled, pick, freezeBase, load, lobbyOk, replayOk, viewNotice, dvOk, wallet,
    get loaded() { return loaded; }, get frozen() { return frozen; },
    /** For tests: turn an Expedition mode on in this page (D0b ships none playable). */
    debugEnable(m) { if (isExp(m)) ENABLED.add(m); return enabled(m); }
  };
})();
