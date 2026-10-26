/* ============ expedition.js — the Expedition modes' registry and loader (MicaSurvivor DLC D0b, not upstream) ============
 * Expedition (Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md) is a set of NEW modes picked on the mode select like Tower or
 * Boss Rush: there is no global switch (owner, 2026-10-19), and the existing modes play exactly as before. This file
 * is the only Expedition code a base boot loads; it is small and does nothing on its own:
 *
 *   MODES / NAME / DESC / ICON   the Expedition entries of "Choose a mode" (js/ui/modes-ui.js, the "Expedition"
 *                                group). D0b shipped them all as "Coming soon"; D3 turns Classic on (ENABLED), D11 Survival,
 *                                D13 League. G.Modes.plan() plans an enabled run mode ({mode, dv, map, diff}); League is a
 *                                HUB (a screen: the roster, the HQ and the League board), never a run.
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
 *   viewZone(seed, x)            DLC D1: a viewer (replay, spectator) or co-op guest rebuilds an Expedition zone from the
 *                                run's world seed + the `x` block {xv, m, z, th} of its snapshots / host frames (the
 *                                terrain is never streamed), loading the Expedition code first if needed; x = null
 *                                drops the zone. A base run's snapshots and frames have no `x`, so this never runs.
 *   lobbyOk(dv) / replayOk(dv)   the version gates: a co-op lobby needs the SAME dv (else "your game is out of date:
 *                                reload"); a replay / live run with an unknown or newer dv plays with a notice.
 *   pick()                       DLC D9: the map + tier a Classic run starts on (G.ExpTier.pick once loaded; the button on
 *                                the Classic card opens "Difficulty and leaderboards", js/expedition/tiers.js).
 *   coopPlan(start)              DLC D11: an Expedition lobby's start -> the run every member plays ({mode, dv, map, diff, dex: your
 *                                own League member}); null / base -> Normal. game.js startRun uses it for a co-op start.
 *   wallet                       Pokémonedas are SHARED with the base game (owner decision #4, confirmed 2026-10-22): the
 *                                Expedition earns (runs, tasks, achievements) and spends (the Lab, item unlocks) the base
 *                                save's coins, only here: save.coins changes, then G.DB.commit, whose fold() books it on this
 *                                device's ledger entry (js/core/db.js), so a merge of two devices never repeats a payment.
 *                                js/expedition/meta.js calls it (and reconciles a thing paid for on two devices).
 * Expedition progress (League catches, unlocks, Lab...) has its OWN save (js/expedition/save.js, the server row
 * micasurvivorexp:<user>); Expedition code never writes the base save micasurvivor:<user> except through `wallet`.
 */
G.I18n.add({
  'Expedición': 'Expedition',
  'Expedición · Clásico': 'Expedition · Classic', 'Expedición · Supervivencia': 'Expedition · Survival', 'Expedición · Liga': 'Expedition · League',
  'Próximamente': 'Coming soon',
  'Expedición · modos nuevos (próximamente)': 'Expedition · new modes (coming soon)',
  'Mapas con alturas, guardianes y un portal final. Marcas por mapa y dificultad.': 'Maps with heights, guardians and a final portal. Records per map and difficulty.',
  'Bosque Verde: 3 zonas con alturas, un guardián en cada altar, el portal y el santuario de Mew. Gana el mapa.': "Viridian Forest: 3 zones with heights, a guardian at each altar, the portal and Mew's shrine. Win the map.",
  'Bosque Verde, Monte Moon y Cabo Celeste: 3 zonas con alturas, un guardián en cada altar, el portal y el santuario. Gana un mapa y se abre el siguiente.': 'Viridian Forest, Mt. Moon and Cerulean Cape: 3 zones with heights, a guardian at each altar, the portal and the shrine. Win a map to open the next.',   // (DLC D12)
  'Aguanta todo lo que puedas en un mapa de Expedición, sin final.': 'Last as long as you can on an Expedition map, with no end.',
  'Atrapa y entrena a los Pokémon de tu Liga.': 'Catch and train the Pokémon of your League.',
  // (DLC D13: League mode is the League's own screen: the roster, the HQ, the League board)
  'Tu Liga: 245 miembros con su kit, evoluciones, definitivo y reto; el laboratorio, las tareas, los logros y la clasificación de la Liga.': 'Your League: 245 members with their kit, evolutions, Ultimate and challenge; the Lab, tasks, achievements and the League board.',
  'La Expedición llegará pronto.': 'Expedition is coming soon.',
  'Tu juego no está actualizado: recarga la página.': 'Your game is out of date: reload.',
  'No se pudo cargar la Expedición. Recarga la página.': "Couldn't load Expedition. Reload the page.",
  'Esta repetición es de una versión más nueva de la Expedición: recarga la página para verla bien.': 'This replay is from a newer version of Expedition: reload the page to watch it properly.',
  'Esta partida es de una versión más nueva de la Expedición: recarga la página para verla bien.': 'This run is from a newer version of Expedition: reload the page to watch it properly.',
  'Miembro de la Liga: {x}': 'League member: {x}',   // (DLC D4: the Classic card's pick, before the Expedition code loads)
  'Dificultad: {x} · clasificaciones': 'Difficulty: {x} · leaderboards', 'Difícil': 'Hard', 'Pesadilla': 'Nightmare',   // (DLC D9: the Classic card's second button)
  'Cuartel de la Liga: laboratorio, tareas y logros': 'League HQ: Lab, tasks and achievements',   // (DLC D10: the third button; D11: no balance on it, the currency is the base game's Pokémonedas)
  // (DLC D11: Survival is playable; the Expedition with friends)
  'Hitos cada 5 min, fases, pactos, asedio, noche sin fin a los 45 min y Mewtwo. Hasta donde aguantes.': 'Milestones every 5 min, phases, pacts, sieges, an endless night at 45 min and Mewtwo. As long as you last.',
  'Con amigos: {x}': 'With friends: {x}', 'Juega la Expedición con tus amigos': 'Play the Expedition with your friends',
  'Sal de tu sala antes de crear otra.': 'Leave your lobby before you make another.', 'Inicia sesión para jugar con amigos': 'Sign in to play with friends',
  '¡Nueva marca de Supervivencia! Puesto #{x}': 'New Survival record! Rank #{x}'
});

G.Expedition = (() => {
  const DV = 14;   // (DLC D3: Classic is playable; D4: the League, kits, evolution, Maturity, stats from base stats: 3; D5: level-ups and items: 4; D6: Ultimates: 5; D7: economy and interactables: 6; D8: alphas, capture and shinies: 7; D9: tiers, score and boards: 8; D10: the League meta (Lab, unlocks, boosts, shiny perks change a run): 9; D11: Survival, Expedition co-op (a guest's run is an Expedition one): 10; D12: maps 2-3, Mt. Moon and Cerulean Cape: 11; D13: the whole League (245 members: 167 new kits, evolutions and challenges): 12; D14: Mega Evolution: 13; D15: the slot machine, Survival's respawns: 14. Older dv replays / snapshots still play, replayOk)
  const MODES = ['exp-classic', 'exp-survival', 'exp-league'];
  const NAME = { 'exp-classic': 'Expedición · Clásico', 'exp-survival': 'Expedición · Supervivencia', 'exp-league': 'Expedición · Liga' };
  const DESC = {
    'exp-classic': 'Bosque Verde, Monte Moon y Cabo Celeste: 3 zonas con alturas, un guardián en cada altar, el portal y el santuario. Gana un mapa y se abre el siguiente.',   // (DLC D12: the 3 maps)
    'exp-survival': 'Hitos cada 5 min, fases, pactos, asedio, noche sin fin a los 45 min y Mewtwo. Hasta donde aguantes.',
    'exp-league': 'Tu Liga: 245 miembros con su kit, evoluciones, definitivo y reto; el laboratorio, las tareas, los logros y la clasificación de la Liga.'   // (DLC D13)
  };
  const ICON = { 'exp-classic': 'flag', 'exp-survival': 'clock', 'exp-league': 'ball' };
  // the launch maps and difficulties (owner decisions #6 / #8); the boards are per map + difficulty (server/mp.mjs EXP_*)
  const MAPS = ['viridian', 'mtmoon', 'cerulean'];
  const DIFFS = ['normal', 'hard', 'nightmare'];
  const BOARD = 'micasurvivor_expedition';
  const ENABLED = new Set(['exp-classic', 'exp-survival', 'exp-league']);   // D3: Classic is playable; D11: Survival too; D13: League
  // DLC D13: League mode is a SCREEN, not a run (study 5.3: "a roster screen with challenges, kits and Ultimates, the Lab,
  // research, tasks and boards"): its card opens the League (G.ExpMeta's League view); G.Modes.plan never plans it as a run.
  const HUB = new Set(['exp-league']);
  const SCRIPTS = ['js/expedition/save.js', 'js/expedition/terrain.js', 'js/expedition/verbs.js', 'js/expedition/classic.js',
    'js/expedition/league-data.js', 'js/expedition/league.js', 'js/expedition/mega-data.js', 'js/expedition/mega.js', 'js/expedition/moves.js', 'js/expedition/items.js', 'js/expedition/levelups.js',
    'js/expedition/ultimates.js', 'js/expedition/economy.js', 'js/expedition/reactions.js', 'js/expedition/capture.js', 'js/expedition/tiers.js', 'js/expedition/meta.js', 'js/expedition/survival.js', 'js/expedition/core.js'];   // (D1: terrain.js; D2: verbs.js; D3: classic.js; D4: league-data.js, league.js; D5: moves.js, items.js, levelups.js; D6: ultimates.js; D7: economy.js; D8: reactions.js, capture.js; D9: tiers.js; D10: meta.js; D11: survival.js; D14: mega-data.js, mega.js)

  const isExp = m => typeof m === 'string' && MODES.includes(m);
  const enabled = m => isExp(m) && ENABLED.has(m);
  /** DLC D13: a mode that opens a screen instead of starting a run (League). */
  const hub = m => HUB.has(m);
  /** The map / difficulty a new Expedition run gets. DLC D9: the device's pick (G.ExpTier.pick: clamped to a playable map
   *  and an unlocked tier, once the Expedition code is loaded; before that, the saved pick as it is, for the button's label). */
  function pick() {
    if (G.ExpTier) return G.ExpTier.pick();
    let p = null;
    try { p = JSON.parse(localStorage.getItem('micasurvivorexp_tier') || 'null'); } catch (e) { /* the pick is a convenience */ }
    return { map: p && MAPS.includes(p.map) ? p.map : MAPS[0], diff: p && DIFFS.includes(p.diff) ? p.diff : DIFFS[0] };
  }
  /** DLC D4: the League member this device starts Classic with (the Expedition code checks you can play it: G.ExpLeague.pickFor). */
  function leaguePick() {
    if (G.ExpLeague) return G.ExpLeague.pickFor();
    let d = 0;
    try { d = +localStorage.getItem('micasurvivorexp_pick') || 0; } catch (e) { /* the pick is a convenience */ }
    return G.DEX_BY && G.DEX_BY[d] ? d : 1;
  }

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

  // ---------------- DLC D1: rebuilding a zone for a viewer / guest ----------------
  let zoneWant = '';
  /** Rebuild (once per seed + zone) the zone a snapshot / host frame's `x` block names. -> a Promise of its hash or null */
  function viewZone(seed, x) {
    const key = x ? [seed, x.xv, x.m, x.z].join(':') : '';
    if (key === zoneWant && (!x || (G.World.zone && G.World.zone.seed === (seed | 0)))) return Promise.resolve(G.World.zone ? G.World.zone.hash : null);
    zoneWant = key;
    if (!x) { if (G.World.zone) G.World.setZone(null); return Promise.resolve(null); }
    const go = () => (zoneWant === key && G.Exp && G.Exp.applyX ? G.Exp.applyX(seed, x) : null);
    if (loaded) return Promise.resolve(go());
    return load().then(go, e => { console.warn(e); zoneWant = ''; return null; });
  }

  // ---------------- DLC D11: an Expedition co-op start ----------------
  /** The run an Expedition lobby's start plays (every member the same mode, map and tier; each its own League member). */
  function coopPlan(c) {
    if (!c || !loaded || !isExp(c.mode) || !enabled(c.mode) || !lobbyOk(c.dv)) return { mode: 'normal' };
    return { mode: c.mode, mods: [], type: null, dex: G.ExpLeague ? G.ExpLeague.pickFor(c.mode) : null, seed: 0, dv: DV,
             map: MAPS.includes(c.map) ? c.map : MAPS[0], diff: DIFFS.includes(c.diff) ? c.diff : DIFFS[0], group: true };   // (group: an online co-op run: no local partner)
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
    DV, MODES, NAME, DESC, ICON, MAPS, DIFFS, BOARD, ENABLED, SCRIPTS, HUB,
    isExp, enabled, hub, pick, leaguePick, freezeBase, load, lobbyOk, replayOk, viewNotice, dvOk, wallet, viewZone, coopPlan,
    get loaded() { return loaded; }, get frozen() { return frozen; },
    /** For tests: turn an Expedition mode on in this page (D0b ships none playable). */
    debugEnable(m) { if (isExp(m)) ENABLED.add(m); return enabled(m); }
  };
})();
