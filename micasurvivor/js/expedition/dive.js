'use strict';
/* ============ expedition/dive.js — Expedition · Dive, the floor-by-floor run (MicaSurvivor Dive V2, not upstream) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load()); a base page never runs it, and every entry point acts
 * only in a Dive run (G.Modes.is('exp-dive')). Plans/MICASURVIVOR_DIVE_MODE_PLAN.md 2.1 / 2.5 / 2.7: PokéDive's loop.
 *
 *   floors     each floor is G.DiveGen's (dive-gen.js: the zone "dive:<route>", zone number = the floor). Walk to the
 *              STAIRS and stand on them STAIRS_T s: the next floor (everything on the old one is gone: foes, pickups).
 *   foes       its foe groups SLEEP where the generator put them (an enemy's xmove holds it) until you come within
 *              WAKE_R or hit one; a group wakes together. Species by depth (pool()): PokéDive's target base-stat total,
 *              260 + 12 x floor to floor 25, then 620 - 60 e^(-(floor - 25) / 45), each species weighted by a Gaussian
 *              on its BST (sigma 45) x (1 + 2 if it shares a type with the route); legendaries never come as foes.
 *   alpha      every 5th floor: one big foe by the stairs (x1.45, ALPHA hp / dmg); the stairs stay SEALED until it falls.
 *              Up to floor 25 its fall SECURES your loot (everything at stake is banked).
 *   guardian   every 25th floor: the route's legendary (ROUTES[route].guardians, in turn) in the oval arena; its fall
 *              banks everything, saves the STAGE (you can start the route on the next floor later: V7) and opens the stairs.
 *   rescue     every floor but a guardian's has a lost Pokémon (the generator's spot): reach it and it is rescued, on
 *              your stake (banked with the loot; lost if you faint). (V6: the escort to the stairs.)
 *   loot       Pokémonedas earned on the dive: AT STAKE until an alpha / guardian banks them. Faint: you keep the bank and
 *              a quarter of the stake. The Escape Rope: on floors 10, 20 and every 25th a rope circle by the spawn;
 *              stand still in it ROPE_T s (moving or a hit cancels) and you leave with EVERYTHING.
 *   pay        the run's Pokémonedas = bank (+ stake on an escape, + stake / 4 on a faint), through the Expedition's
 *              shared wallet (js/expedition/meta.js record: sum.parts.divePay).
 *   progress   the Expedition save: dive.<route>.best (deepest floor), dive.<route>.stage, dive.runs, dive.escapes.
 *   moves      (V4, owner 2026-11-02: "for moves go with poke dive default") PokéDive's kit: slot 1 is the BASIC attack, it
 *              fires on its own; slots 2 and 3 are SPECIALS that fire only when pressed (m.xman: js/systems/combat.js waits
 *              for the press, m.xreq): keys 1 / 2 (J / K), left / right click, the pad's X / Y, the SPECIAL buttons. Auto-aimed
 *              (the player's target); a press up to BUFFER s before the cool-down ends is kept. Specials hit x SPECIAL_K.
 *              3 move slots (pl.maxMoves), + the held item. The Ultimate: 3 / Z / R, the pad's LB / LT / RT / L3.
 *   dodge      (V4) Expedition's slide, PokéDive's way (js/expedition/verbs.js DODGE_*): 0.2 s, invulnerable, 1.2 s cool-down;
 *              Space / Shift, the pad's A (and B), the DODGE button. No hop in a Dive run.
 *   combo      (V5) PokéDive's "Racha": KOs within 3 s chain; +2 % XP a step (to +30 %), loot every 10; hit-stops on an
 *              alpha / guardian and on the floor's last foe (run.hold).
 *   red ground (V4) PokéDive's telegraphs (TELE): brawlers slam, alphas / guardians slam wider and charge; dodge or step out.
 *   viewers    (V4) dBlock() rides in the x block's c slot (classic.js xblockC / applyC): a spectator, a replay and a co-op
 *              guest see the floor, the loot, the seal, the rope, the lost Pokémon and the red ground (applyD -> view).
 * Determinism: the floors, the groups' species and the lost Pokémon come from G.DLC.rng streams of {seed, route, floor};
 * combat stays Math.random, as in base. Viewers rebuild a floor from the zone block (core.js applyX: classic.build).
 */
G.I18n.add({
  'Un {x} legendario aparece': 'A legendary {x} appears',   // (U3)
  '— Piso {x} · {x} —': '— Floor {x} · {x} —',
  'B{x}F': 'F{x}', 'PISO {x}': 'FLOOR {x}',
  '{x} asegurado · {x} en juego': '{x} secured · {x} at stake',
  '¡Alfa! Derrótalo para abrir las escaleras': 'An alpha! Beat it to open the stairs',
  '¡Alfa derrotado! Botín asegurado': 'Alpha defeated! Loot secured',
  '¡Alfa derrotado! Las escaleras están libres': 'Alpha defeated! The stairs are clear',
  '{x}, el guardián de la ruta': '{x}, the route\'s guardian',
  '¡Guardián derrotado! Etapa guardada': 'Guardian defeated! Stage saved',
  '{x} rescatado': '{x} rescued', '¡{x} te sigue! Llévalo a las escaleras': '{x} follows you! Take it to the stairs',
  'Santuario': 'Shrine', 'Obelisco': 'Obelisk', 'Altar': 'Altar', 'Pecio': 'Shipwreck', 'Aguja de hielo': 'Frost spire', 'Tótem': 'Totem', 'Monolito': 'Monolith', 'Corro de hadas': 'Fairy ring',
  'el grupo se cura del todo': 'the party is fully healed', '+30 % de daño durante 60 s': '+30% damage for 60 s', 'pagas vida por botín': 'you pay life for loot',
  'botín del naufragio': 'loot from the wreck', 'congela a los enemigos cercanos': 'freezes the foes nearby', 'experiencia para el grupo': 'experience for the party',
  'mucha experiencia': 'a lot of experience', 'revive y cura': 'revives and heals', 'Racha x{x}': 'Combo x{x}', 'x{x} RACHA': 'x{x} COMBO', 'Mejor racha: {x}': 'Best combo: {x}',
  'Cuerda Huida: quédate quieto…': 'Escape Rope: hold still…',
  '¡Escapas con todo!': 'You escape with everything!',
  'Escaleras selladas': 'The stairs are sealed',
  'ESCALERAS': 'STAIRS', 'CUERDA': 'ROPE',
  'Inmersión · {x}: piso {x}': 'Dive · {x}: floor {x}',
  'Botín asegurado: {x} · en juego: {x}': 'Loot secured: {x} · at stake: {x}',
  'Escapaste: te llevas todo el botín': 'You escaped: you keep all the loot',
  'Caíste: conservas lo asegurado y una cuarta parte del resto': 'You fell: you keep what was secured and a quarter of the rest',
  'Rescatados: {x}': 'Rescued: {x}', 'Alfas: {x} · Guardianes: {x}': 'Alphas: {x} · Guardians: {x}',
  'Nuevo récord en {x}: piso {x}': 'New record on {x}: floor {x}',
  'Arrastra el dedo para moverte  ·  toca 1 / 2 para los especiales  ·  Esquivar': 'Drag to move  ·  tap 1 / 2 for the specials  ·  Dodge',
  'WASD moverse  ·  1 / 2 o clic especiales  ·  Espacio esquivar  ·  3 definitivo  ·  Esc pausa': 'WASD move  ·  1 / 2 or click: specials  ·  Space dodge  ·  3 Ultimate  ·  Esc pause',
  'especiales': 'specials', 'esquivar': 'dodge',
  'Esquivar': 'Dodge', 'Especial 1': 'Special 1', 'Especial 2': 'Special 2',
  'Récord: piso {x}': 'Best: floor {x}', 'Etapa: piso {x}': 'Stage: floor {x}', 'Sin etapa aún': 'No stage yet', 'Despierta los 8 Sellos ({x}/8)': 'Awaken the 8 Seals ({x}/8)',
  'Sello despierto': 'Seal awakened', '¡Sello despertado!': 'Seal awakened!', 'Inmersión · ruta y piso inicial': 'Dive · route and start floor', 'Empezar en:': 'Start on:', 'Piso {x}': 'Floor {x}',
  'Vence al guardián de cada 25 pisos para guardar una etapa. El primero de cada ruta despierta su Sello: +10 % de daño y −10 % de daño recibido en esa ruta.': 'Beat the guardian every 25 floors to save a stage. The first on each route awakens its Seal: +10% damage and −10% damage taken on that route.',
  '¡A bucear!': 'Dive!',
  'Una roca: la rompe un Pokémon de tipo Roca, Tierra, Lucha o Acero': 'A boulder: a Rock, Ground, Fighting or Steel Pokémon breaks it',
  'Maleza: la quema un Pokémon de tipo Fuego': 'A thicket: a Fire Pokémon burns it',
  '¡La roca se rompe! Hay algo detrás': 'The boulder breaks! Something is behind it', '¡La maleza arde! Hay algo detrás': 'The thicket burns! Something is behind it',
  'Cañón de cristal': 'Glass Cannon', 'Horda': 'Horde', 'Veloces': 'Swift', 'Hierro': 'Iron', 'pegas y recibes ×1,5': 'you hit and are hit ×1.5', '+2 enemigos por grupo': '+2 foes a group',
  'enemigos ×1,25 de velocidad': 'foes ×1.25 speed', 'enemigos ×1,4 de vida': 'foes ×1.4 HP', 'Inmersión semanal · {x}': 'Weekly Dive · {x}',
  '¡Nueva marca en la Inmersión semanal! Puesto #{x}': 'New Weekly Dive record! Rank #{x}', '¡Nueva marca de Inmersión! Puesto #{x}': 'New Dive record! Rank #{x}',
  'Inmersión semanal': 'Weekly Dive', 'La misma para todos esta semana, desde el piso 1: {x} · {x} ({x}).': 'The same for everyone this week, from floor 1: {x} · {x} ({x}).',
  'Jugar la semanal': 'Play the weekly', 'Clasificación': 'Leaderboard', 'Esta ruta': 'This route', 'Semanal': 'Weekly', 'Inicia sesión para ver la clasificación': 'Sign in to see the leaderboard',
  'Nadie aún': 'Nobody yet', 'piso {x}': 'floor {x}', 'Cargando…': 'Loading…', 'Tú: puesto #{x}, piso {x}': 'You: rank #{x}, floor {x}'
});

G.ExpDive = (() => {
  const K = {
    STAIRS_R: 0.9, STAIRS_T: 0.5,      // tiles / s on the stairs to go down
    ROPE_R: 1.6, ROPE_T: 3,            // the rope circle (tiles), s standing still in it
    WAKE_R: 7,                         // tiles: a sleeping group wakes when you come this close (or one of it is hit)
    RESCUE_R: 1.2,                     // tiles: reach the lost Pokémon
    GROUP: [2, 6], GUARD_PLUS: 1,      // foes a group (grows with depth), a guard group +1
    SIGMA: 45, TYPE_BIAS: 2,           // the species curve
    T_PER_FLOOR: 13,                   // s of "run time" a floor is worth for the base stat curves (G.Enemies.scale)
    // (balance 2026-11-02, tools/micasurvivor/dive_sim.mjs: Classic's 3.3 / 2.4 walled the bot near floor 10-20; x0.85 HP, x0.7 damage
    //  -> a fresh partner ~floor 10, half the shop upgrades ~18-20, a maxed one at the floor-25 guardian and past it)
    HP_K: 2.8, DMG_K: 1.68, XP_K: 5.6, TIER_BST: 80,
    ALPHA: { scale: 1.45, hp: 7, dmg: 1.2, xp: 8 },
    GUARD: { scale: 1.9, hp: 50, dmg: 1.4, xp: 30 },
    // V9 (owner default #8: an escaped floor-25 dive pays about a 15-minute base run, ~1,500 Pokémonedas): the loot in the
    // Expedition's pay units (meta.js coinsOf: x K.SCALE 3). expectedPay() below is the model; micasurvivor_dive_test pins it.
    LOOT: { ko: 0.12, koPer: 0.01, rescue: 2, rescuePer: 0.2, alpha: 6, alphaPer: 0.4, guard: 40, guardPer: 0.8, floor: 0.5, floorPer: 0.04 },
    FAINT_KEEP: 0.25,
    // MicaSurvivor U3 (owner decision #3, "Megas ... Dive below floor 30, sometimes an alpha / boss"; and the 61 legendaries the
    // guardians leave out, PokéDive's way): below floor MEGA.from a floor has a Mega elite MEGA.p of the time and an arena's alpha
    // is a Mega MEGA.arenaP of the time; from floor LEGEND.from (below the first guardian) a floor has a legendary encounter
    // LEGEND.p of the time, sure after LEGEND.pity floors without one. Both from their own streams; any of their pool (uniform).
    MEGA: { from: 30, p: 0.2, arenaP: 0.35 }, LEGEND: { from: 26, p: 0.35, pity: 3, scale: 1.5, hp: 9, dmg: 1.3, xp: 10, loot: 5, lootPer: 0.3 },
    SLOTS: 3, SPECIAL_K: 1.25, BUFFER: 0.15, HOLD: 0.6   // V4: the kit; a press is kept HOLD s while it waits for a foe in reach
  };
  const NAME = G.Expedition.DIVE_NAME;   // (V7: one table, js/systems/expedition.js)
  // each route's 4 guardians (floor 25, 50, 75, 100, then again), PokéDive's choice where it had one
  const GUARDIANS = {
    forest: [251, 492, 787, 151], canyon: [383, 645, 377, 718], crater: [244, 146, 485, 250], reef: [382, 249, 245, 490],
    grotto: [144, 378, 646, 896], marsh: [491, 717, 1015, 890], ruins: [480, 482, 481, 487], fungal: [786, 788, 801, 893],
    origin: [493, 493, 493, 493]   // (V7: Arceus)
  };
  const DG = () => G.DiveGen;
  const T = () => G.I18n;
  const TS = () => G.World.TS;
  let S = null;      // the host's run (null for a viewer / co-op guest)
  let view = null;   // a viewer's / guest's copy of the host's block (applyD)
  /** A Dive run on this page (the host's, or a co-op guest's: the kit, the inputs, the buttons). */
  const live = () => G.Modes.is('exp-dive');
  /** The host's Dive run (the floors, the foes, the loot). */
  const on = () => !!(S && live());
  /** Something to draw: the host's run or a viewer's block. */
  const shown = () => on() || !!(view && G.World.zone && G.World.zone.dive);
  const cur = () => (on() ? S : view);
  const routeOf = map => (typeof map === 'string' && map.startsWith('dive:') && DG().ROUTES[map.slice(5)] ? map.slice(5) : 'forest');
  const say = (t, s = 3) => G.Spawner.say(t, s);
  /** "¡...!" in Spanish, "...!" in English (a key starting with ¡ would be caught by items.js's '¡{x}!' pattern). */
  const bang = s => (G.I18n.lang === 'es' ? '¡' + s + '!' : s + '!');
  const rng = (route, floor, k) => G.DLC.rng(DG().seedOf(S ? S.seed : 0, route, floor, k));
  const wpos = p => [(p[0] + G.World.zone.x0) * TS() + TS() / 2, (p[1] + G.World.zone.y0) * TS() + TS() / 2];   // (a layout tile -> the world: tile = local + x0)

  // ---------------- the species ----------------
  /** PokéDive's target base-stat total at a depth. */
  const target = f => (f <= 25 ? 260 + 12 * f : 620 - 60 * Math.exp(-(f - 25) / 45));
  const pools = new Map();
  /** The foe species of a route at a floor: [[dex, weight], ...] (no legendaries), cumulative. */
  function pool(route, floor) {
    const key = route + ':' + floor;
    if (pools.has(key)) return pools.get(key);
    const tg = target(floor), types = DG().ROUTES[route].types, out = [];
    let sum = 0;
    for (const p of G.DEX) {
      if (p.leg) continue;
      const z = (p.bst - tg) / K.SIGMA, share = p.types.some(t => types.includes(t)) ? 1 : 0;
      const w = Math.exp(-0.5 * z * z) * (1 + K.TYPE_BIAS * share) * Math.pow(6 - (p.rarity || 3), 0.3);
      if (w < 1e-6) continue;
      sum += w; out.push([p.dex, sum]);
    }
    const r = { list: out, sum };
    if (pools.size > 200) pools.clear();
    pools.set(key, r);
    return r;
  }
  function draw(P, r) { const v = r() * P.sum; for (const [d, c] of P.list) if (c >= v) return d; return P.list[P.list.length - 1][0]; }
  /** A guardian floor's legendary: the route's list in turn (floor 25 -> 1st, 50 -> 2nd, ...). */
  const guardianOf = (route, floor) => GUARDIANS[route][(Math.max(1, Math.floor(floor / 25)) - 1) % 4];
  // ---------------- U3: the Megas and the other legendaries (pure from the run's seed) ----------------
  const GUARD_SET = new Set(Object.values(GUARDIANS).flat());
  /** The legendaries (and mythicals, the Galarian birds too) that are no route's guardian: the encounters' pool. */
  const legendPool = () => G.DEX.filter(p => p.leg && !GUARD_SET.has(p.dex) && G.SPRITE_META[p.dex]).map(p => p.dex);
  const u3rng = (seed, route, f, k) => G.DLC.rng(DG().seedOf(seed | 0, route, f, k));
  /** Floor f's legendary encounter draw: {hit (the chance alone, before the pity), dex}. Pure. */
  function legendRoll(seed, route, f) {
    const r = u3rng(seed, route, f, 0x1E9), L = legendPool();
    const hit = r() < K.LEGEND.p;
    return { hit, dex: L.length ? L[Math.min(L.length - 1, Math.floor(r() * L.length))] : 0 };
  }
  /** Floor f's Mega draw: {elite (a Mega elite on the floor), arena (the arena's alpha is a Mega), dex}. Pure. */
  function megaRoll(seed, route, f) {
    const r = u3rng(seed, route, f, 0x3E6A);
    const elite = r() < K.MEGA.p, arena = r() < K.MEGA.arenaP, dex = G.Megas ? G.Megas.pick(r) : 0;
    return { elite: elite && !!dex, arena: arena && !!dex, dex };
  }

  // ---------------- the run ----------------
  function begin(cfg) {
    let route = routeOf(cfg.map);
    if (!routeOpen(route)) route = 'forest';   // (V7: the Route of Origin needs the 8 Seals)
    const wk = cfg.weekly != null ? G.Expedition.diveWeekly() : null;   // (V8: the Weekly Dive: its route and modifier)
    if (wk && wk.week === cfg.weekly) route = wk.route;
    S = { route, floor: 0, seed: G.World.seed | 0, bank: 0, stake: 0, rescued: [], rescuedBank: 0, kills: 0, alphas: 0, guardians: 0,
          ended: false, escaped: false, groups: [], boss: null, stairsT: 0, ropeT: 0, ropeHurt: false, lost: null, deepest: 0, t0: 0 };
    // (V7: a saved stage: the dive starts on that floor)
    S.weekly = wk && wk.week === cfg.weekly ? wk : null;
    // (MicaSurvivor U2: an online dive starts on the host's stage: the lobby refused the start until everyone had reached it)
    const st = S.weekly ? 1 : cfg.group && cfg.start > 1 && (cfg.start - 1) % 25 === 0 ? cfg.start : startOf(route, cfg.start);
    S.start = st;
    if (st > 1) G.Exp.enterZone(st);
    startFloor(st, 0);
    return S;
  }
  function reset() { S = null; view = null; pools.clear(); }

  /** The floor's foes, the lost Pokémon, the alpha / guardian (the zone is already set: core.js enterZone). */
  function startFloor(f, t) {
    const L = G.World.zone && G.World.zone.dive;
    Object.assign(S, { floor: f, ft: t, L, groups: [], boss: null, stairsT: 0, ropeT: 0, lost: null, sealed: false, tg: [], lmUsed: false, lmT: 0, plugsOpen: 0 });
    S.deepest = Math.max(S.deepest, f);
    if (!L) return;
    const r = rng(S.route, f, 0xD1), P = pool(S.route, f);
    const n = Math.min(K.GROUP[1], K.GROUP[0] + Math.floor(f / 8)) + (S.weekly && S.weekly.mod === 'horde' ? 2 : 0);   // (V8: Horde)
    const pre = [];
    for (const [gi, g] of L.groups.entries()) {
      const k = Math.max(1, n + (g.guard ? K.GUARD_PLUS : 0) + Math.floor(r() * 3) - 1), [x, y] = wpos(g.at), list = [];
      for (let i = 0; i < k; i++) {
        const a = r() * 6.2832, d = (i ? 18 + r() * 22 : 0), dex = draw(P, r);
        pre.push(dex);
        const e = spawn(dex, x + Math.cos(a) * d, y + Math.sin(a) * d, t, {});
        if (e) { e.xdive = gi; list.push(e); }
      }
      S.groups.push({ awake: false, list, at: [x, y] });
    }
    // the lost Pokémon: a gentle species of the route
    if (L.rescue) {
      const lr = rng(S.route, f, 0x105), tg = target(f) - 60, cand = G.DEX.filter(p => !p.leg && Math.abs(p.bst - tg) < 70 && p.types.some(t2 => DG().ROUTES[S.route].types.includes(t2)));
      const dex = cand.length ? cand[Math.floor(lr() * cand.length)].dex : 25;
      const [x, y] = wpos(L.rescue);
      S.lost = { dex, x, y, done: false, anim: null };
      pre.push(dex);
    }
    if (L.cadence.guardian) {
      const dex = guardianOf(S.route, f), [x, y] = wpos([40, L.h / 2]);
      const e = spawn(dex, x, y, t, { boss: true });
      if (e) { S.boss = e; S.sealed = true; pre.push(dex); say(bang(T().f('{x}, el guardián de la ruta', e.name)), 3.6); G.Audio.sfx('surge'); }
    } else if (L.cadence.arena) {
      const ar = rng(S.route, f, 0xA1), [x, y] = wpos(L.path[Math.max(0, L.path.length - 5)]);
      let dex = draw(pool(S.route, f + 4), ar);
      const mg = f > K.MEGA.from ? megaRoll(S.seed, S.route, f) : null;   // (U3: below floor 30, sometimes a Mega alpha)
      if (mg && mg.arena) dex = mg.dex;
      const e = spawn(dex, x, y, t, { alpha: true });
      if (e) { S.boss = e; S.sealed = true; pre.push(dex); say(T().t('¡Alfa! Derrótalo para abrir las escaleras'), 3.4); }
    }
    if (!L.cadence.guardian) u3Floor(f, t, L, pre);
    G.Sprites.preload(pre, 8000);
    if (!L.cadence.guardian && !L.cadence.arena && !S.u3say) say(T().f('— Piso {x} · {x} —', f, T().t(NAME[S.route])), 2.8);
    S.u3say = null;
  }

  /** (U3) Floor f's Mega elite (below floor 30) and legendary encounter (from floor 26, with the pity): awake, alpha-sized. */
  function u3Floor(f, t, L, pre) {
    const spot = salt => { const r = u3rng(S.seed, S.route, f, salt), g = L.groups.length ? L.groups[Math.floor(r() * L.groups.length)] : null;
      return g ? wpos(g.at) : wpos(L.path[Math.floor(L.path.length / 2)] || [L.w / 2, L.h / 2]); };
    if (f > K.MEGA.from && !L.cadence.arena) {
      const mg = megaRoll(S.seed, S.route, f);
      if (mg.elite) {
        const [x, y] = spot(0x3E6B), e = spawn(mg.dex, x, y, t, { alpha: true });
        if (e) { e.xu3 = 'mega'; pre.push(mg.dex); S.u3say = 1; say(T().f('¡{x} salvaje aparece!', T().t(e.name)), 3.2); }
      }
    }
    if (f >= K.LEGEND.from) {
      const lr = legendRoll(S.seed, S.route, f);
      S.legPity = S.legPity || 0;
      if (lr.dex && (lr.hit || S.legPity >= K.LEGEND.pity)) {
        S.legPity = 0;
        const [x, y] = spot(0x1EA), e = spawn(lr.dex, x, y, t, { legend: true });
        if (e) { e.xu3 = 'legend'; pre.push(lr.dex); S.u3say = 1; say(bang(T().f('Un {x} legendario aparece', T().t(e.name))), 3.4); G.Audio.sfx('boss'); }
      } else S.legPity++;
    }
  }
  /** A foe of this floor. o: {alpha, boss, legend (U3)} -> the enemy */
  function spawn(dex, x, y, t, o) {
    const C = G.ExpClassic, f = S.floor, teff = f * K.T_PER_FLOOR;
    const ti = G.U.clamp(Math.floor((target(f) - 260) / K.TIER_BST), 0, 5);   // (a stats tier every TIER_BST of the target)
    const def = C.defOf(dex, ti);
    const sc = G.Enemies.scale(teff), n = Math.max(1, G.Game.everyone ? G.Game.everyone().length : 1);
    const X = o.boss ? K.GUARD : o.legend ? K.LEGEND : o.alpha ? K.ALPHA : null;
    const hp = sc.hp * G.Coop.scaleHp(n) * (K.HP_K + Math.min(1.7, teff / 210)) * (X ? X.hp : 1);
    const e = new G.Enemy(def, x, y, { hp, dmg: sc.dmg, spd: sc.spd }, !!o.boss);
    e.dmg *= K.DMG_K * (X ? X.dmg : 1);
    if (S.weekly && S.weekly.mod === 'iron') e.maxHp = e.hp = Math.round(e.maxHp * WEEKLY.IRON);   // (V8: the Weekly Dive's modifiers)
    if (S.weekly && S.weekly.mod === 'swift') e.spd *= WEEKLY.SWIFT;
    e.xp = Math.round(e.xp * K.XP_K * (X ? X.xp : 1));
    if (X) {
      e.scale = X.scale; e.anim = new G.Sprites.Animator(e.dex, X.scale, e.shiny);
      e.r = G.Sprites.bodyRadius(e.dex, X.scale); e.bodyH = G.Sprites.bodyHeight(e.dex, X.scale);
      e.xk = o.boss ? 'guardian' : 'alpha';   // (not G.ExpCap.mark: a Dive alpha FALLS, it doesn't faint at 1 HP for the Friend Ball)
    }
    if (!o.boss && !o.alpha && !o.legend) e.xmove = sleeper;
    G.EnemyMgr.add(e);
    return e;
  }
  /** A sleeping foe: it holds still (true) until its group wakes. */
  function sleeper() {
    if (!S || this.xdive == null) { this.xmove = null; return false; }
    const g = S.groups[this.xdive];
    if (!g || g.awake) { this.xmove = null; return false; }
    if (this.hp < this.maxHp) { wake(g); return false; }
    this.anim.loop('Idle', 0.05);
    return true;
  }
  function wake(g) { if (g.awake) return; g.awake = true; for (const e of g.list) if (e && !e.dead) e.xmove = null; }

  /** Every step of a Dive run on the host (js/systems/spawner.js -> classic.js update). */
  function update(dt, players, t) {
    if (!on() || S.ended || !G.World.zone || !G.World.zone.dive || G.World.zone.zone !== S.floor) return;
    const alive = players.filter(p => !p.dead && !p.coopDown);
    if (!alive.length) return;
    const R = TS(), wr = (K.WAKE_R * R) ** 2;
    // the groups wake when someone comes close
    for (const g of S.groups) if (!g.awake && alive.some(p => G.U.dist2(p.x, p.y, g.at[0], g.at[1]) < wr)) wake(g);
    teleTick(dt, alive);   // (V4: the red ground)
    // the lost Pokémon
    if (S.lost && !S.lost.done && !S.lost.follow && alive.some(p => G.U.dist2(p.x, p.y, S.lost.x, S.lost.y) < (K.RESCUE_R * R) ** 2)) rescue();
    escortTick(dt, alive);   // (V6)
    plugTick(dt, alive);   // (the secret pockets)
    landmarkTick(dt, alive);
    if (S.obeliskT > 0) S.obeliskT -= dt;
    // the alpha / guardian down
    if (S.boss && S.boss.dead) bossDown();
    const L = S.L;
    // the rope (on a rope floor): stand still in the circle by the spawn
    if (L.cadence.rope) {
      // (V8: in co-op every player standing must be in the circle and still: PokéDive's unanimous vote)
      const [rx, ry] = wpos(L.spawn), inR = alive.every(p => G.U.dist2(p.x, p.y, rx, ry) < (K.ROPE_R * R) ** 2);
      const at = alive.map(p => [p.x, p.y]), still = S.ropeAt && S.ropeAt.length === at.length && at.every((q, i) => G.U.dist2(q[0], q[1], S.ropeAt[i][0], S.ropeAt[i][1]) < 4);
      if (inR && still && !S.ropeHurt) {
        if (S.ropeT === 0) say(T().t('Cuerda Huida: quédate quieto…'), K.ROPE_T);
        S.ropeT += dt;
        if (S.ropeT >= K.ROPE_T) { escape(); return; }
      } else S.ropeT = 0;
      S.ropeAt = at; S.ropeHurt = false;
    }
    // the stairs
    const [sx, sy] = wpos(L.stairs), onS = alive.some(p => G.U.dist2(p.x, p.y, sx, sy) < (K.STAIRS_R * R) ** 2);
    if (onS && S.sealed) { if (!S.sealSaid) { S.sealSaid = true; say(T().t('Escaleras selladas'), 2); G.Audio.sfx('error'); } }
    else if (!onS) S.sealSaid = false;
    S.stairsT = onS && !S.sealed ? S.stairsT + dt : 0;
    if (S.stairsT >= K.STAIRS_T) nextFloor(t, players);
  }

  function loot(n) { if (n > 0 && S) S.stake += n; }   // (V9: fractions kept: a KO is worth ~0.13; shown and paid rounded down)
  function secure() { S.bank += S.stake; S.stake = 0; S.rescuedBank = S.rescued.length; }
  function rescue() {
    S.lost.follow = true;
    say(T().f('¡{x} te sigue! Llévalo a las escaleras', G.DEX_BY[S.lost.dex].name), 2.6);
    G.Audio.sfx('select');
  }
  function rescueDone() {
    S.lost.done = true;
    S.rescued.push(S.lost.dex);
    loot(K.LOOT.rescue + K.LOOT.rescuePer * S.floor);
    say(bang(T().f('{x} rescatado', G.DEX_BY[S.lost.dex].name)), 2.4);
    G.Audio.sfx('levelup');
    for (let i = 0; i < 14; i++) G.FX.twinkle(S.lost.x + G.U.rand(-14, 14), S.lost.y - G.U.rand(0, 26));
  }
  function bossDown() {
    const e = S.boss, guard = e.xk === 'guardian';
    S.boss = null; S.sealed = false;
    if (guard) {
      S.guardians++;
      loot(K.LOOT.guard + K.LOOT.guardPer * S.floor);
      secure();
      S.stage = S.floor + 1;
      if (!S.weekly && X() && X().add('dive.seal', S.route)) { S.newSeal = true; say(T().t('¡Sello despertado!') + ' ' + T().t(NAME[S.route]), 3.6); }   // (V7)
      say(T().t('¡Guardián derrotado! Etapa guardada'), 3.4);
      G.Audio.sfx('victory'); G.Game.flash('#ffe9a0', 0.6);
    } else {
      S.alphas++;
      loot(K.LOOT.alpha + K.LOOT.alphaPer * S.floor);
      if (S.floor <= 25) { secure(); say(T().t('¡Alfa derrotado! Botín asegurado'), 3); }
      else say(T().t('¡Alfa derrotado! Las escaleras están libres'), 3);
      G.Audio.sfx('surge');
    }
    G.Camera.kick(0.5);
  }
  function nextFloor(t, players) {
    escortOut(players.filter(p => !p.dead));   // (V6: an escorted Pokémon leaves with you)
    loot(K.LOOT.floor + K.LOOT.floorPer * S.floor);
    const f = S.floor + 1;
    G.EnemyMgr.clear(); G.Pickups.clear(); G.Projectiles.clear(); G.Hazards.clear(); G.Combat.clearFields();
    G.Exp.enterZone(f);
    const mates = (G.LocalCoop && G.LocalCoop.mate ? [G.LocalCoop.mate] : []);
    for (const [i, p] of players.concat(mates).entries()) {
      if (p.remote) continue;
      p.x = i ? 20 * i : 0; p.y = 0; p.zMask = null; p.air = null; p.airZ = 0; p._px = null;
    }
    G.Camera.x = players[0].x; G.Camera.y = players[0].y;
    G.Game.flash('#000000', 0.5); G.Audio.sfx('biome');
    startFloor(f, t);
  }
  function escape() {
    escortOut([G.Game.player].filter(Boolean));
    S.escaped = true; S.ended = true;
    say(T().t('¡Escapas con todo!'), 3);
    G.Audio.sfx('victory');
    G.Game.endRun(false);
  }
  /** The player was hurt (core.js player.hurt): a hit cancels the rope. */
  function hurt() { if (S) { S.ropeHurt = true; S.ropeT = 0; } }
  /** A foe fainted (core.js enemy.ko). */
  function onKill(e) {
    if (!on() || !e) return;
    S.kills++;
    loot(K.LOOT.ko + K.LOOT.koPer * S.floor);
    if (e.xu3) loot((e.xu3 === 'legend' ? K.LEGEND.loot : K.LOOT.alpha) + (e.xu3 === 'legend' ? K.LEGEND.lootPer : K.LOOT.alphaPer) * S.floor);   // (U3: a Mega elite pays an alpha's, a legendary more)
    comboKo(e);   // (V5)
  }

  // ---------------- V4: PokéDive's kit (basic + 2 specials), the dodge, the inputs ----------------
  /** After the League / level-up modules set the kit (core.js run.start): PokéDive starts you with the basic and both
   *  specials, so the kit's 2nd and 3rd moves come now (the League would teach them at Lv 2 / 4); 3 slots. */
  function setup(pl) {
    if (!live() || !pl) return;
    pl.maxMoves = K.SLOTS;
    pl.xspare = []; pl.xlearnAt = {};
    const LG = G.ExpLeague;
    if (LG && LG.run && LG.learnKit) for (let i = 1; i < K.SLOTS && pl.slots.length < K.SLOTS; i++) LG.learnKit(pl, i);
    while (pl.slots.length > K.SLOTS) pl.xspare.push(pl.slots.pop());
    pl.setActive && pl.setActive(0);
    roles(pl);
  }
  /** PokéDive's new special at Lv 4, 10, 16, 22...: the level's cards are "learn X, forget special 1" / "... special 2"
   *  (Expedition's swap cards) and a training card to keep your moves. X: the kit's 4th move first, then a move of your
   *  types / League (the level-ups' candidates), seeded. core.js levelup.offer; null on any other level. */
  const LEARN_AT = L => L >= 4 && (L - 4) % 6 === 0;
  function offerLearn(pl) {
    if (!live() || !pl || pl.remote || !LEARN_AT(pl.level) || (pl.xlearnAt && pl.xlearnAt[pl.level])) return null;
    const LV = G.ExpLevel, LG = G.ExpLeague;
    if (!LV || !LV.swapCard) return null;
    pl.xlearnAt = pl.xlearnAt || {}; pl.xlearnAt[pl.level] = 1;
    const r = G.DLC.rng(DG().seedOf(G.World.seed | 0, 'learn', pl.level, 0x1EA));
    const kit = LG && LG.run && LG.BY[LG.run.member] ? LG.BY[LG.run.member].kit || [] : [];
    let id = kit.slice(K.SLOTS).find(k => k && !pl.hasMove(k)) || null;
    if (!id) { const cs = LV.moveCands(pl).filter(c => !pl.hasMove(c.id)); if (cs.length) id = cs[Math.floor(r() * cs.length)].id; }
    if (!id) return null;
    const cards = [];
    for (let i = 1; i < pl.slots.length; i++) { const old = pl.slots[i][0]; if (old) cards.push(LV.swapCard(pl, { id }, old, 0, r)); }
    if (!cards.length) return null;
    const keep = LV.trainCards(pl)[0];
    if (keep) cards.push(keep);
    return cards;
  }
  /** Slot 1 the basic (auto), slots 2-3 the specials (pressed): by slot, so a swapped-in move takes its slot's role. */
  function roles(pl) { pl.slots.forEach((g, i) => { for (const m of g) { m.xman = i > 0; if (!(i > 0)) m.xreq = 0; } }); }
  /** A special pressed (i = 1 or 2): kept if its cool-down is (nearly) over. -> true when it will fire */
  function press(i, pl = G.Game && G.Game.player) {
    if (!live() || !pl || pl.dead || pl.remote) return false;
    const g = pl.slots[i];
    if (!g || !g.length) return false;
    let ok = false;
    for (const m of g) if (m.t <= K.BUFFER) { m.xreq = K.HOLD; ok = true; }
    return ok;
  }
  function ult() { if (G.ExpUlt) G.ExpUlt.press(); }
  /** The pad's gameplay action in a Dive run (js/core/pad.js): true when Dive took it. */
  function pad(a) {
    if (a === 'confirm' || a === 'cancel') { if (G.ExpVerbs) G.ExpVerbs.press('slide'); return true; }
    if (a === 'ban' || a === 'dynx') { press(1); return true; }
    if (a === 'reroll') { press(2); return true; }
    if (a === 'prev' || a === 'dtrigger' || a === 'ztrigger' || a === 'zmove') { ult(); return true; }
    if (a === 'next') return true;
    return false;
  }
  /** run.tick: the roles, the keys. */
  function tick(dt, pl) {
    if (!live() || !pl || pl.remote) return;
    if (on()) comboTick(dt, pl);   // (V5: the host's combo)
    if (pl.slots.length > K.SLOTS) { pl.xspare = pl.xspare || []; while (pl.slots.length > K.SLOTS) pl.xspare.push(pl.slots.pop()); }
    roles(pl);
    const I = G.Input;
    if (I.tap('digit1') || I.tap('numpad1') || I.tap('keyj')) press(1, pl);
    if (I.tap('digit2') || I.tap('numpad2') || I.tap('keyk')) press(2, pl);
    if (I.tap('digit3') || I.tap('numpad3') || I.tap('keyl')) ult();
  }
  /** combat.out: a special's hit is worth SPECIAL_K. */
  function out(k, pl, e, src) {
    if (on()) k *= obeliskK();   // (V6: the obelisk)
    if (sealK()) k *= 1 + SEAL.DMG;   // (V7: the route's Seal)
    if (glass()) k *= WEEKLY.GLASS;   // (V8: Glass Cannon)
    if (!live() || !pl || !src || !pl.slots) return k;
    const id = typeof src.mid === 'string' ? src.mid : src.def && typeof src.id === 'string' ? src.id : null;
    if (!id) return k;
    for (let i = 1; i < pl.slots.length; i++) if (pl.slots[i].some(m => m.id === id)) return k * K.SPECIAL_K;
    return k;
  }
  // the buttons (screen px, set by drawButtons) and the pointer: a finger / pen / mouse on a button; a mouse click elsewhere
  // on the game: left = special 1, right = special 2 (PokéDive's)
  let rects = null;
  const inR = (r, x, y) => !!r && x >= r.x - 6 && x <= r.x + r.s + 6 && y >= r.y - 6 && y <= r.y + r.s + 6;
  addEventListener('pointerdown', e => {
    if (!live() || !e.target || e.target.id !== 'game' || !G.Game || G.Game.state !== 'playing') return;
    const x = e.clientX, y = e.clientY;
    if (rects && inR(rects.sp1, x, y)) { press(1); return; }
    if (rects && inR(rects.sp2, x, y)) { press(2); return; }
    if (rects && inR(rects.dodge, x, y)) { if (G.ExpVerbs) G.ExpVerbs.press('slide'); return; }
    if (e.pointerType !== 'mouse') return;
    const hit = (G.Touch.buttonList ? G.Touch.buttonList() : []).some(b => x >= b.x - b.px && x <= b.x + b.w + b.px && y >= b.y - b.py && y <= b.y + b.h + b.py);
    if (hit) return;
    if (e.button === 0) press(1); else if (e.button === 2) press(2);
  }, true);
  addEventListener('contextmenu', e => { if (live() && e.target && e.target.id === 'game') e.preventDefault(); }, true);

  /** The DODGE and SPECIAL 1 / 2 buttons (js/expedition/verbs.js drawButtons in a Dive run). R: verbs' rects (hop, slide). */
  function drawButtons(ctx, w, h, pl, R, keyChip) {
    const k = (G.HUD && G.HUD.k) || 1, F = (wt, sz) => wt + ' ' + sz + 'px Arial,Helvetica,sans-serif';
    const padMode = G.Pad && G.Pad.mode === 'pad', touch = G.Touch.active;
    const sp1 = R.hop, sp2 = { x: R.hop.x - R.hop.s - 14, y: R.hop.y, s: R.hop.s }, dodge = R.slide;
    const VK = G.ExpVerbs.K;
    const one = (r, kind) => {
      const c = { x: r.x + r.s / 2, y: r.y + r.s / 2 }, Rr = 27;
      const g = kind === 'dodge' ? null : pl.slots[kind === 'sp1' ? 1 : 2] || [], m = g && g[0];
      const cdMax = kind === 'dodge' ? VK.DODGE_CD : m ? Math.max(0.05, m.cd * (pl.cdMul || 1)) : 1;
      const left = kind === 'dodge' ? pl.slideCd || 0 : m ? Math.max(0, m.t) : 0, cool = left > 0.001, queued = m && m.xreq > 0;
      ctx.save();
      ctx.globalAlpha = kind !== 'dodge' && !m ? 0.45 : 1;
      ctx.fillStyle = queued ? 'rgba(90,70,20,.92)' : (kind === 'dodge' && pl.slideT > 0) ? 'rgba(60,90,140,.9)' : 'rgba(13,18,36,.82)';
      ctx.beginPath(); ctx.arc(c.x, c.y, Rr, 0, 6.2832); ctx.fill();
      const col = kind === 'dodge' ? '#ffd08a' : kind === 'sp1' ? '#ff9a6b' : '#b48aff';
      ctx.lineWidth = 3; ctx.strokeStyle = cool ? 'rgb(128,133,148)' : col;
      ctx.beginPath(); ctx.arc(c.x, c.y, Rr, 0, 6.2832); ctx.stroke();
      if (cool) { ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(c.x, c.y, Rr, -Math.PI / 2, -Math.PI / 2 + 6.2832 * (1 - left / cdMax)); ctx.stroke(); }
      ctx.strokeStyle = '#f4f8ff'; ctx.fillStyle = '#f4f8ff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      if (kind === 'dodge') {
        for (const [dy, l] of [[-7, 10], [0, 16], [7, 10]]) { ctx.beginPath(); ctx.moveTo(c.x - 14, c.y + dy); ctx.lineTo(c.x - 14 + l, c.y + dy); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(c.x + 6, c.y - 8); ctx.lineTo(c.x + 14, c.y); ctx.lineTo(c.x + 6, c.y + 8); ctx.stroke();
      } else {
        ctx.font = F(900, 20); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(kind === 'sp1' ? '1' : '2', c.x, c.y + 1);
        if (cool) { ctx.font = F(800, 10); ctx.fillStyle = '#ffd23f'; ctx.fillText(left.toFixed(1), c.x, c.y + 15); }
      }
      ctx.textBaseline = 'alphabetic';
      ctx.font = F(700, 10); ctx.textAlign = 'center';
      const nm = m ? G.I18n.t((m.def && m.def.name) || m.name || '') : '';
      const label = kind === 'dodge' ? G.I18n.t('Esquivar') : (nm || G.I18n.t(kind === 'sp1' ? 'Especial 1' : 'Especial 2'));
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(label, c.x, r.y + r.s + 11); ctx.fillStyle = 'rgb(214,222,238)'; ctx.fillText(label, c.x, r.y + r.s + 11);
      if (padMode) G.Pad.drawGlyph(ctx, kind === 'dodge' ? 'confirm' : kind === 'sp1' ? 'ban' : 'reroll', r.x - 4, r.y - 4, 22);
      else if (!touch) keyChip(ctx, r.x - 4, r.y - 4, kind === 'dodge' ? G.I18n.t('Espacio') : kind === 'sp1' ? '1' : '2');
      ctx.restore();
      G.Touch.addButton(r.x, r.y, r.s, r.s, () => {}, 6);   // (pressed by the pointerdown listener above; no joystick under it)
    };
    one(sp1, 'sp1'); one(sp2, 'sp2'); one(dodge, 'dodge');
    rects = { sp1: { x: sp1.x * k, y: sp1.y * k, s: sp1.s * k }, sp2: { x: sp2.x * k, y: sp2.y * k, s: sp2.s * k }, dodge: { x: dodge.x * k, y: dodge.y * k, s: dodge.s * k } };
    return { hop: sp1, slide: dodge, sp2 };
  }

  // ---------------- V9: the pay model ----------------
  /** The loot (pay units, before meta.js coinsOf) of a dive from floor 1 down to `floors`, with `kos` KOs a floor, every
   *  lost Pokémon escorted, every alpha / guardian beaten and `combo` KOs in a typical chain; escaped: the whole stake. */
  function expectedPay(floors, kos = 35, combo = 20) {
    const L = K.LOOT;
    let v = 0;
    for (let f = 1; f <= floors; f++) {
      v += kos * (L.ko + L.koPer * f) + (f % 25 ? L.rescue + L.rescuePer * f : 0) + L.floor + L.floorPer * f;
      if (f % 25 === 0) v += L.guard + L.guardPer * f; else if (f % 5 === 0) v += L.alpha + L.alphaPer * f;
      for (let m = COMBO.MILESTONE; m <= combo; m += COMBO.MILESTONE) v += COMBO.COINS_PER * m / COMBO.MILESTONE * kos / Math.max(combo, 1);
    }
    return v;
  }

  // ---------------- the end ----------------
  /** The run's Pokémonedas (bank + stake on an escape, + a quarter of it on a faint). */
  const pay = () => { const S = cur(); return S ? Math.floor(S.bank + (S.escaped ? S.stake : S.stake * K.FAINT_KEEP)) : 0; };
  const rescuedOf = S => (S.rescued && S.rescued.length ? (S.escaped ? S.rescued.length : S.rescuedBank || 0) : S.rescuedN || 0);
  function scoreParts(sum) {
    const S = cur();
    return { floor: S.floor, deepest: S.deepest || S.floor, route: S.route, kills: sum.kills || 0, time: sum.time || 0, alphas: S.alphas || 0, guardians: S.guardians || 0,
             rescued: rescuedOf(S), escaped: !!S.escaped, divePay: pay(), zone: Math.min(4, 1 + Math.floor(S.floor / 10)), start: S.start || 1,
             weekly: S.weekly ? S.weekly.week : null };
  }
  function result() {
    const S = cur();
    const lines = [S.weekly ? T().f('Inmersión semanal · {x}', T().t(MOD_NAME[S.weekly.mod])) : null,T().f('Inmersión · {x}: piso {x}', T().t(NAME[S.route]), S.floor),
      T().f('Botín asegurado: {x} · en juego: {x}', Math.floor(S.bank), Math.floor(S.stake)),
      T().t(S.escaped ? 'Escapaste: te llevas todo el botín' : 'Caíste: conservas lo asegurado y una cuarta parte del resto'),
      T().f('Rescatados: {x}', rescuedOf(S)), T().f('Alfas: {x} · Guardianes: {x}', S.alphas || 0, S.guardians || 0),
      T().f('Mejor racha: {x}', S.combo && S.combo.best ? S.combo.best : 0)].filter(Boolean);
    return { lines, title: S.escaped ? T().t('¡Escapas con todo!') : null, won: S.escaped };
  }
  /** Into the Expedition save: the deepest floor and the stage per route, the counters. -> lines */
  function record() {
    const X = G.ExpSave, out = [], S = cur();
    if (!X || !S) return out;
    S.deepest = S.deepest || S.floor;
    const k = 'dive.' + S.route;
    X.bump('dive.runs');
    if (S.escaped) X.bump('dive.escapes');
    if (S.deepest > (X.get(k + '.best') || 0)) out.push(bang(T().f('Nuevo récord en {x}: piso {x}', T().t(NAME[S.route]), S.deepest)));
    if (S.weekly) { X.bump('dive.weekly'); X.commit(); return out; }   // (V8: the Weekly Dive keeps no record, stage or Seal)
    X.best(k + '.best', S.deepest);
    if (S.stage) X.best(k + '.stage', S.stage);
    X.bump('dive.rescued', rescuedOf(S));
    X.commit();
    return out;
  }






  // ---------------- V8: the Weekly Dive, the boards, co-op ----------------
  // The Weekly Dive (G.Expedition.diveWeekly): this week's seed, route and modifier for everyone, from floor 1, no stages or
  // Seals: Glass Cannon (you hit and are hit x1.5), Horde (+2 foes a group), Swift (foes x1.25 speed), Iron (foes x1.4 HP).
  // Boards (server/mp.mjs, the deepest floor): one per route, one per week. Co-op: a guest follows the host's floors (placed
  // on the new floor's spawn once its rebuild of the floor is in); the rope takes EVERY player standing still in its circle.
  const WEEKLY = { GLASS: 1.5, SWIFT: 1.25, IRON: 1.4 };
  const MOD_NAME = { glass: 'Cañón de cristal', horde: 'Horda', swift: 'Veloces', iron: 'Hierro' };
  const MOD_TXT = { glass: 'pegas y recibes ×1,5', horde: '+2 enemigos por grupo', swift: 'enemigos ×1,25 de velocidad', iron: 'enemigos ×1,4 de vida' };
  const glass = () => { const c = cur(); if (c && c.weekly) return c.weekly.mod === 'glass'; const r = G.Modes.run; return !!(live() && r && r.weekly != null && G.Expedition.diveWeekly().week === r.weekly && G.Expedition.diveWeekly().mod === 'glass'); };
  /** The run's score to its board (core.js run.end, a clean solo run). -> Promise of the server's answer */
  async function submit(sum) {
    const A = G.MicaAccount, S = cur();
    if (!A || !A.name() || !S) return { error: 'not logged in' };
    const p = sum.parts || scoreParts(sum);
    const body = { mode: G.Expedition.BOARD, expMode: 'exp-dive', dv: G.Expedition.DV, route: p.route, floor: p.deepest, start: p.start || 1, time: Math.floor(sum.time || 0),
                   escaped: !!p.escaped, kills: Math.floor(sum.kills || 0), level: Math.floor(sum.level || 1), dex: sum.dex | 0, shiny: !!sum.shiny };
    if (p.weekly != null) { body.weekly = true; body.week = p.weekly; }
    const d = await A.call('run-score', body);
    if (d.ok && d.body && d.body.better && d.body.rank) G.UI.toast(T().f(p.weekly != null ? '¡Nueva marca en la Inmersión semanal! Puesto #{x}' : '¡Nueva marca de Inmersión! Puesto #{x}', d.body.rank), 3400);
    return d.ok ? d.body : { error: (d.body && d.body.error) || 'offline' };
  }
  /** A board: {top, you} (route: a route's; weekly: this week's). */
  async function board(o) {
    const A = G.MicaAccount;
    if (!A || !A.name()) return { top: [], you: null, error: 'not logged in' };
    const body = { mode: G.Expedition.BOARD, expMode: 'exp-dive', board: 'dive' };
    if (o && o.weekly) { body.weekly = true; body.week = G.Expedition.diveWeekly().week; } else body.route = (o && o.route) || 'forest';
    const d = await A.call('run-leaderboard', body);
    if (!d.ok) return { top: [], you: null, error: (d.body && d.body.error) || 'offline' };
    return { top: d.body.top || [], you: d.body.you || null };
  }
  /** A co-op guest: the host moved to another floor -> once this page's floor is that one, stand on its spawn. */
  let guestFloor = 0;
  function guestFollow(f) {
    if (!(G.Coop && G.Coop.active && !G.Coop.isHost)) { guestFloor = 0; return; }
    const pl = G.Game && G.Game.player, z = G.World.zone;
    if (!pl || pl.remote || !z || !z.dive || z.zone !== f || guestFloor === f) return;
    const first = guestFloor === 0;
    guestFloor = f;
    if (first && f === 1) return;   // (the run's start: already on the spawn)
    pl.x = 20 * (1 + (G.Coop.slot ? G.Coop.slot() : 1)); pl.y = 0; pl.zMask = null; pl.air = null; pl.airZ = 0; pl._px = null;
    G.Camera.x = pl.x; G.Camera.y = pl.y;
    G.Game.flash('#000000', 0.5);
  }

  // ---------------- V7: routes, stages, Seals, the Route of Origin, the picker ----------------
  // A route's STAGE (the Expedition save: dive.<route>.stage) is the floor after its deepest guardian beaten: 26, 51, ...;
  // a dive may start on floor 1 or on any stage reached (the picker's pick, checked again at the start). The first guardian
  // beaten on a route awakens its SEAL (the set dive.seal): on that route, +10 % damage and -10 % damage taken. All 8 Seals
  // open the Route of Origin (Arceus).
  const SEAL = { DMG: 0.1, TAKEN: 0.1 };
  const MAIN = ['forest', 'canyon', 'crater', 'reef', 'grotto', 'marsh', 'ruins', 'fungal'];
  const X = () => G.ExpSave;
  const stageOf = r => (X() ? X().get('dive.' + r + '.stage') || 0 : 0);
  const bestOf = r => (X() ? X().get('dive.' + r + '.best') || 0 : 0);
  const sealOf = r => !!(X() && X().has('dive.seal', r));
  const seals = () => MAIN.filter(sealOf).length;
  const routeOpen = r => r !== 'origin' || seals() >= MAIN.length;
  /** The start floors open on a route: 1, then every stage reached (26, 51, ...). */
  function starts(r) { const out = [1], st = stageOf(r); for (let f = 26; f <= st; f += 25) out.push(f); return out; }
  /** The start a run really gets: the pick if the save has that stage, else 1. */
  const startOf = (r, want) => (starts(r).includes(want | 0) ? want | 0 : 1);
  /** The seal on the run's route (host or guest: each player's own save). */
  const sealK = () => { const r = routeOf(G.Modes.run && G.Modes.run.map); return live() && sealOf(r); };
  /** player.hurt (core.js): the Seal's -10 %. */
  const hurtK = d => (sealK() ? d * (1 - SEAL.TAKEN) : d) * (glass() ? WEEKLY.GLASS : 1);

  let pel = null, ponClose = null, pscroll = 0;
  const pui = { route: 'forest', board: 'route', tok: 0 };
  /** The picker's board (the route's or this week's), fetched; a newer render wins. */
  async function loadBoard() {
    const tok = ++pui.tok, t = T(), el2 = () => document.getElementById('xd-list');
    const d = await board(pui.board === 'weekly' ? { weekly: true } : { route: pui.route });
    if (tok !== pui.tok || !el2()) return;
    if (d.error === 'not logged in') { el2().textContent = t.t('Inicia sesión para ver la clasificación'); return; }
    const rows = (d.top || []).slice(0, 10).map((e, i) => `<div class="rk-row"><span class="rk-n">#${i + 1}</span> <b>${esc(e.name)}</b> <span>${esc(t.f('piso {x}', e.floor))}</span></div>`).join('');
    el2().innerHTML = (rows || esc(t.t('Nadie aún'))) + (d.you && d.you.rank ? `<div class="rk-me">${esc(t.f('Tú: puesto #{x}, piso {x}', d.you.rank, d.you.floor))}</div>` : '');
  }
  const PCSS = `
#modes-xdive .xd-head h3 { margin: 0; font-size: 18px; }
#modes-xdive .xd-routes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0; }
#modes-xdive .xd-route { text-align: left; border: 2px solid rgba(244,248,255,.2); border-radius: 10px; background: rgba(0,0,0,.22); padding: 7px 9px; font-size: 12px; color: #dfe7f3; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
#modes-xdive .xd-route b { font-size: 15px; color: #f4f8ff; }
#modes-xdive .xd-route.on { border-color: #ffd23f; box-shadow: 0 0 0 2px rgba(255,210,63,.25) inset; }
#modes-xdive .xd-route.locked { opacity: .55; }
#modes-xdive .xd-route .xd-seal { color: #ffd23f; font-weight: 800; }
#modes-xdive .xd-route .xd-row { color: #aab6c8; }
#modes-xdive .xd-starts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; }
#modes-xdive .xd-note { color: #aab6c8; font-size: 12px; margin: 4px 0 0; }
#modes-xdive .xd-weekly, #modes-xdive .xd-board { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
#modes-xdive .xd-list { flex-basis: 100%; max-height: 180px; overflow: auto; font-size: 13px; }
@media (max-width: 600px) { #modes-xdive .xd-routes { grid-template-columns: 1fr 1fr; } }
@media (max-height: 520px) { #modes-xdive .xd-route { padding: 3px 7px; } #modes-xdive .xd-route .xd-row { display: none; } #modes-xdive .xd-routes { grid-template-columns: repeat(5, 1fr); gap: 5px; } }
`;
  function pmount() {
    if (pel || typeof document === 'undefined') return pel;
    const box = document.querySelector('#scr-modes .modes-box');
    if (!box) return null;
    const st = document.createElement('style'); st.id = 'exp-dive-style'; st.textContent = PCSS; document.head.appendChild(st);
    pel = document.createElement('div'); pel.id = 'modes-xdive'; pel.className = 'hidden';
    box.appendChild(pel);
    return pel;
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Opens "Route and start floor" on the mode select (the Expedition code and save are loaded). */
  function openPicker(onBack) {
    if (!pmount()) return false;
    ponClose = onBack || null;
    pui.route = G.Expedition.diveRoute();
    if (!routeOpen(pui.route)) pui.route = 'forest';
    document.getElementById('modes-main').classList.add('hidden');
    pel.classList.remove('hidden');
    const b0 = document.querySelector('#scr-modes [data-back]'); if (b0) b0.classList.add('hidden');
    const box = document.querySelector('#scr-modes .modes-box'); if (box) { pscroll = box.scrollTop; box.scrollTop = 0; }
    prender();
    return true;
  }
  function closePicker(quiet) {
    if (!pel || pel.classList.contains('hidden')) return false;
    pel.classList.add('hidden');
    document.getElementById('modes-main').classList.remove('hidden');
    const b0 = document.querySelector('#scr-modes [data-back]'); if (b0) b0.classList.remove('hidden');
    const box = document.querySelector('#scr-modes .modes-box'); if (box && quiet !== true) box.scrollTop = pscroll;
    if (quiet !== true && ponClose) ponClose();
    return true;
  }
  const back = () => (pel && !pel.classList.contains('hidden') ? closePicker() : false);
  function prender() {
    if (!pel) return;
    const t = T(), cur0 = G.Expedition.diveStart(), sts = starts(pui.route), st = sts.includes(cur0) ? cur0 : 1, wk = G.Expedition.diveWeekly();
    const card = r => {
      const open1 = routeOpen(r), on = r === pui.route, sealed = sealOf(r), best = bestOf(r), stage = stageOf(r);
      const types = DG().ROUTES[r].types.map(x => t.t(G.U.TYPE_NAME[x] || x)).join(' · ');
      const rows = open1 ? [t.f('Récord: piso {x}', best), stage ? t.f('Etapa: piso {x}', stage) : t.t('Sin etapa aún')]
        : [t.f('Despierta los 8 Sellos ({x}/8)', seals())];
      return `<button type="button" class="xd-route${on ? ' on' : ''}${open1 ? '' : ' locked'}" data-route="${r}"${open1 ? ' data-sfx="select"' : ' aria-disabled="true"'}>
        <b>${open1 ? '' : G.Icons.html('ban', 14)}${esc(t.t(NAME[r]))}</b><span class="xd-row">${esc(types)}</span>
        ${rows.map(x => `<span class="xd-row">${esc(x)}</span>`).join('')}${sealed ? `<span class="xd-seal">${G.Icons.html('star', 12)} ${esc(t.t('Sello despierto'))}</span>` : ''}</button>`;
    };
    pel.innerHTML = `
      <div class="row between xd-head"><h3>${esc(t.t('Inmersión · ruta y piso inicial'))}</h3><button id="xd-back" class="btn small" type="button">${esc(t.t('Atrás'))}</button></div>
      <div class="xd-routes">${G.Expedition.DIVE_ROUTES.map(card).join('')}</div>
      <div class="xd-starts"><b>${esc(t.t('Empezar en:'))}</b>${sts.map(f => `<button type="button" class="chip${f === st ? ' on' : ''}" data-start="${f}">${esc(t.f('Piso {x}', f))}</button>`).join('')}</div>
      <p class="xd-note">${esc(t.t('Vence al guardián de cada 25 pisos para guardar una etapa. El primero de cada ruta despierta su Sello: +10 % de daño y −10 % de daño recibido en esa ruta.'))}</p>
      <button type="button" class="btn primary" id="xd-go">${esc(t.t('¡A bucear!'))}</button>
      <div class="xd-weekly"><b>${esc(t.t('Inmersión semanal'))}</b> <span class="xd-note">${esc(t.f('La misma para todos esta semana, desde el piso 1: {x} · {x} ({x}).', t.t(NAME[wk.route]), t.t(MOD_NAME[wk.mod]), t.t(MOD_TXT[wk.mod])))}</span>
        <button type="button" class="btn" id="xd-weekly">${esc(t.t('Jugar la semanal'))}</button></div>
      <div class="xd-board"><b>${esc(t.t('Clasificación'))}</b> <span class="filters">${[['route', 'Esta ruta'], ['weekly', 'Semanal']].map(([k, l]) => `<button type="button" class="chip${pui.board === k ? ' on' : ''}" data-board="${k}">${esc(t.t(l))}</button>`).join('')}</span>
        <div id="xd-list" class="rk-list xd-list">${esc(t.t('Cargando…'))}</div></div>`;
    document.getElementById('xd-back').onclick = () => closePicker();
    pel.querySelectorAll('[data-route]').forEach(b => { b.onclick = () => {
      const r = b.dataset.route;
      if (!routeOpen(r)) { G.UI.toast(t.f('Despierta los 8 Sellos ({x}/8)', seals())); G.Audio.sfx('error'); return; }
      pui.route = r; G.Expedition.diveRoute(r);
      if (!starts(r).includes(G.Expedition.diveStart())) G.Expedition.diveStart(1);
      prender();
    }; });
    pel.querySelectorAll('[data-start]').forEach(b => { b.onclick = () => { G.Expedition.diveStart(+b.dataset.start); prender(); }; });
    document.getElementById('xd-go').onclick = () => { closePicker(true); G.Flow.play('exp-dive'); };
    document.getElementById('xd-weekly').onclick = () => { closePicker(true); G.Expedition.playWeekly(); G.Flow.play('exp-dive'); };
    pel.querySelectorAll('[data-board]').forEach(b => { b.onclick = () => { pui.board = b.dataset.board; prender(); }; });
    loadBoard();
  }


  // ---------------- secret pockets (PokéDive's): the generator's plugs (dive-gen.js L.plugs) ----------------
  // A BOULDER breaks for a Rock / Ground / Fighting / Steel Pokémon, a THICKET burns for a Fire type: stand against it
  // PLUG.T s (any input: you just walk into it). In co-op any player of the right type opens it for everyone. The first
  // time someone without the type leans on one, a tip says what it needs. Behind it: a chest (a free Poké Ball, eco).
  const PLUG = { T: 0.6, R: 1.25, TYPES: { boulder: ['rock', 'ground', 'fighting', 'steel'], thicket: ['fire'] } };
  const typesOf = p => (p.mon && p.mon.types) || (G.DEX_BY[p.dex] && G.DEX_BY[p.dex].types) || [];
  const canOpen = (p, kind) => typesOf(p).some(t => PLUG.TYPES[kind].includes(t));
  /** Opens plug i of the current floor (the host, or a viewer from the block): its tile becomes floor. */
  function openPlug(i) {
    const z = G.World.zone, L = z && z.dive, pg = L && L.plugs && L.plugs[i];
    if (!pg || pg.open) return false;
    pg.open = true;
    for (const p of [pg.at, pg.at2].filter(Boolean)) { const idx = p[1] * z.w + p[0]; z.kind[idx] = DG().FLOOR; L.kind[idx] = DG().FLOOR; }   // (a carved pocket's mouth is 2 tiles)
    G.World.setZone(z);   // (the world forgets its chunks and repaints; walkers re-learn their tile)
    if (G.Path) G.Path.clear();
    const [x, y] = wpos(pg.at);
    G.FX.burst(x, y, pg.kind === 'boulder' ? '#b8a890' : '#ff9a3d', 20, 140);
    return true;
  }
  function plugTick(dt, alive) {
    const L = S.L;
    if (!L || !L.plugs) return;
    const R = TS();
    L.plugs.forEach((pg, i) => {
      if (pg.open) return;
      const [x, y] = plugXY(pg), by = alive.filter(p => G.U.dist2(p.x, p.y, x, y) < ((PLUG.R + (pg.at2 ? 0.5 : 0)) * R) ** 2);
      const ok = by.some(p => canOpen(p, pg.kind));
      pg.t = ok ? (pg.t || 0) + dt : 0;
      if (by.length && !ok && !S.plugTip) { S.plugTip = true; say(T().t(pg.kind === 'boulder' ? 'Una roca: la rompe un Pokémon de tipo Roca, Tierra, Lucha o Acero' : 'Maleza: la quema un Pokémon de tipo Fuego'), 3.2); }
      if (pg.t >= PLUG.T && openPlug(i)) { S.plugsOpen = (S.plugsOpen | 0) | (1 << i); say(T().t(pg.kind === 'boulder' ? '¡La roca se rompe! Hay algo detrás' : '¡La maleza arde! Hay algo detrás'), 2.6); G.Audio.sfx(pg.kind === 'boulder' ? 'break' : 'grass'); }
    });
  }
  /** The middle of a plug (one tile, or a carved pocket's 2-tile mouth). */
  function plugXY(pg) { const a = wpos(pg.at); if (!pg.at2) return a; const b = wpos(pg.at2); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  function drawPlugs(ctx, L, cam) {
    if (!L.plugs) return;
    const R = TS();
    for (const pg of L.plugs) for (const at of [pg.at, pg.at2].filter(Boolean)) {
      if (pg.open) continue;
      const [x, y] = wpos(at);
      if (!cam.sees(x, y, 40)) continue;
      ctx.save();
      if (pg.kind === 'boulder') {
        ctx.fillStyle = '#8a8478'; ctx.beginPath(); ctx.ellipse(x, y - 2, R * 0.55, R * 0.48, 0, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = '#4f4a42'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 6, y - 8); ctx.lineTo(x - 1, y - 2); ctx.lineTo(x - 4, y + 4); ctx.moveTo(x + 5, y - 6); ctx.lineTo(x + 2, y + 1); ctx.stroke();
      } else {
        ctx.fillStyle = '#2f5a2a';
        for (const [ox, oy, rr] of [[-6, 2, 8], [6, 1, 8], [0, -6, 9], [0, 4, 8]]) { ctx.beginPath(); ctx.arc(x + ox, y + oy, rr, 0, 6.2832); ctx.fill(); }
        ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 8, y + 8); ctx.lineTo(x + 8, y - 6); ctx.moveTo(x + 7, y + 8); ctx.lineTo(x - 6, y - 7); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ---------------- V6: the escort, the landmarks, the floor's interactables ----------------
  // The lost Pokémon, once reached, FOLLOWS the nearest player (S.lost.follow) and is rescued when it leaves the floor with you
  // (the stairs or the rope: within ESCORT_R of a player). Leave it behind and it stays lost.
  // Landmarks (the generator's, 40 % of the plain floors): stand on one LANDMARK_T s to use it, once:
  //   shrine full heal · obelisk +30 % damage for 60 s · altar pay 30 % HP for loot · shipwreck loot · spire freezes the foes
  //   near it · totem a burst of XP for the party · monolith XP · fairy ring revives the downed and heals.
  const ESCORT = { R: 4, SPEED: 1.15 };
  const LM = { T: 1, R: 1.4, OBELISK: 0.3, OBELISK_T: 60, ALTAR_HP: 0.3, SPIRE_R: 6, SPIRE_T: 4 };
  function escortTick(dt, alive) {
    const lo = S.lost;
    if (!lo || !lo.follow || lo.done) return;
    let p = null, d2 = Infinity;
    for (const q of alive) { const d = G.U.dist2(q.x, q.y, lo.x, lo.y); if (d < d2) { d2 = d; p = q; } }
    if (!p) return;
    const want = 1.6 * TS(), d = Math.sqrt(d2);
    if (d > want) { const v = Math.min(d - want, (p.spd || 80) * ESCORT.SPEED * dt); lo.x += (p.x - lo.x) / d * v; lo.y += (p.y - lo.y) / d * v; }
    if (d > 14 * TS()) { lo.x = p.x - 20; lo.y = p.y; }   // (never left behind by a dodge across a lake)
  }
  /** On the way out (the stairs, the rope): an escorted Pokémon near a player is rescued. */
  function escortOut(alive) {
    const lo = S.lost;
    if (!lo || !lo.follow || lo.done) return;
    if (alive.some(p => G.U.dist2(p.x, p.y, lo.x, lo.y) < (ESCORT.R * TS()) ** 2)) rescueDone();
  }
  function landmarkTick(dt, alive) {
    const L = S.L, lm = L && L.landmark;
    if (!lm || S.lmUsed) return;
    const [x, y] = wpos(lm.at), R = TS();
    const on1 = alive.find(p => G.U.dist2(p.x, p.y, x, y) < (LM.R * R) ** 2);
    S.lmT = on1 ? (S.lmT || 0) + dt : 0;
    if (S.lmT < LM.T) return;
    S.lmUsed = true;
    const k = lm.kind, f = S.floor;
    if (k === 'shrine') for (const p of alive) p.hp = p.maxHp;
    else if (k === 'obelisk') S.obeliskT = LM.OBELISK_T;
    else if (k === 'altar') { for (const p of alive) p.hp = Math.max(1, p.hp - p.maxHp * LM.ALTAR_HP); loot(20 + 3 * f); }
    else if (k === 'shipwreck') loot(15 + 2 * f);
    else if (k === 'spire') { for (const e of G.EnemyMgr.all()) if (!e.dead && !e.boss && G.U.dist2(e.x, e.y, x, y) < (LM.SPIRE_R * R) ** 2) { e.frozenT = Math.max(e.frozenT || 0, LM.SPIRE_T); } }
    else if (k === 'totem' || k === 'monolith') { for (const p of alive) if (p.gainXp && !p.remote) p.gainXp(Math.round((p.xpNext || 20) * (k === 'monolith' ? 0.6 : 0.35) / (p.xpMul || 1))); }
    else if (k === 'fairy') for (const p of alive) { p.hp = p.maxHp; if (p.coopDown && G.Coop && G.Coop.revive) G.Coop.revive(p); }
    G.FX.ring(x, y, 8, 90, LMCOL[k] || '#ffe9a0', 0.6, 4); G.Audio.sfx('heal');
    say(T().t(LMNAME[k]) + ' · ' + T().t(LMTXT[k]), 3);
  }
  const LMNAME = { shrine: 'Santuario', obelisk: 'Obelisco', altar: 'Altar', shipwreck: 'Pecio', spire: 'Aguja de hielo', totem: 'Tótem', monolith: 'Monolito', fairy: 'Corro de hadas' };
  const LMTXT = { shrine: 'el grupo se cura del todo', obelisk: '+30 % de daño durante 60 s', altar: 'pagas vida por botín', shipwreck: 'botín del naufragio',
                  spire: 'congela a los enemigos cercanos', totem: 'experiencia para el grupo', monolith: 'mucha experiencia', fairy: 'revive y cura' };
  const LMCOL = { shrine: '#9fffc8', obelisk: '#ffb347', altar: '#ff6b7a', shipwreck: '#ffd23f', spire: '#9fe8ff', totem: '#c9a6ff', monolith: '#e0e0ff', fairy: '#ff9ed8' };
  /** combat.out: the obelisk's +30 %. */
  const obeliskK = () => (S && S.obeliskT > 0 ? 1 + LM.OBELISK : 1);

  /** A Dive floor's interactables for js/expedition/economy.js (pure from the floor): the chests as free Poké Balls, the
   *  Kecleon shop (a Meowth stall open all floor, ~1 in 4 plain floors), 2 berry bushes, 3 gold rocks. */
  function ecoLayout(z, ts) {
    const L = z.dive, objs = [], r = G.DLC.rng(DG().seedOf(z.seed | 0, L.route, L.floor, 0xEC0));
    const put = (kind, p, v = 0) => objs.push({ i: objs.length, kind, tx: p[0] + z.x0, ty: p[1] + z.y0, x: (p[0] + z.x0 + 0.5) * ts, y: (p[1] + z.y0 + 0.5) * ts, v });
    for (const c of L.chests) put('freeball', c);
    for (const pg of L.plugs || []) put('freeball', pg.chest);   // (the secret pockets' chests)
    const free = [];
    const near = (p, q, k) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) < k;
    for (let y = 2; y < L.h - 2; y++) for (let x = 2; x < L.w - 2; x++) {
      const i = y * L.w + x, p = [x, y];
      if (L.kind[i] !== 0 || near(p, L.spawn, 6) || near(p, L.stairs, 4) || objs.some(o => near(p, [o.tx - z.x0, o.ty - z.y0], 5))) continue;
      if (L.landmark && near(p, L.landmark.at, 4)) continue;
      free.push(p);
    }
    const take = () => { if (!free.length) return null; const j = Math.floor(r() * free.length), p = free[j]; free.splice(j, 1); for (let k = free.length - 1; k >= 0; k--) if (near(free[k], p, 5)) free.splice(k, 1); return p; };
    const shop = !L.cadence.arena && !L.cadence.guardian && r() < 0.25;
    let sp = null;
    if (shop) { const mid = L.path[Math.floor(L.path.length * (0.3 + r() * 0.3))]; sp = mid && !objs.some(o => near(mid, [o.tx - z.x0, o.ty - z.y0], 5)) ? mid : take(); if (sp) put('meowth', sp); }
    for (let k = 0; k < 2; k++) { const p = take(); if (p) put('berry', p); }
    for (let k = 0; k < 3; k++) { const p = take(); if (p) put('rock', p, 6 + Math.floor(r() * 9)); }
    const visits = sp ? [{ v: 0, at: 0, until: 1e9, spot: objs.find(o => o.kind === 'meowth').i }] : [];
    return { objs, visits, cometAt: 1e9, key: [z.seed | 0, z.map, z.zone | 0, z.hash].join(':') };
  }

  // ---------------- V5: the combo ("Racha", PokéDive's gs table) and the hit-stops ----------------
  // A KO within WINDOW s of the last one adds a step; WINDOW s without one breaks it. Each step +2 % XP (to +30 %), and every
  // 10th pays 3 x (n / 10) loot at stake with a pop-up ("Combo x20!", orange from 20). The XP rides pl.xpMul (the previous
  // combo factor divided out, so the items / League factors on it stay). Hit-stops (the run.hold seam, as the Ultimate's):
  // an alpha / guardian down 0.16 s, the floor's last foe 0.12 s with a ring and a chime.
  const COMBO = { WINDOW: 3, XP_PER: 0.02, XP_CAP: 0.3, MILESTONE: 10, COINS_PER: 0.5, HOT: 10, FIRE: 20 };   // (V9: milestone loot in pay units)
  const HITSTOP = { boss: 0.16, clear: 0.12 };
  function comboKo(e) {
    const c = S.combo = S.combo || { n: 0, t: 0, best: 0 };
    c.n++; c.t = COMBO.WINDOW; c.best = Math.max(c.best, c.n);
    if (c.n % COMBO.MILESTONE === 0) {
      loot(COMBO.COINS_PER * c.n / COMBO.MILESTONE);
      const pl = G.Game.player;
      if (pl) G.FX.dmgText(pl.x, pl.y - (pl.bodyH || 30) - 18, T().f('Racha x{x}', c.n) + '!', c.n >= COMBO.FIRE ? '#ff9a3d' : '#ffd23f', true);
      G.Audio.sfx('coin');
    }
    // the floor's last foe (none left awake or asleep, the boss included): the clear
    const left = G.EnemyMgr.all().some(o => !o.dead && o !== e && !o.remote);
    if (!left && !(e && (e.xk === 'alpha' || e.xk === 'guardian'))) {
      S.holdT = Math.max(S.holdT || 0, HITSTOP.clear);
      G.FX.ring(e.x, e.y, 8, 120, '#ffe9a0', 0.45, 4);
      G.Audio.sfx('chest');
    }
    if (e && (e.xk === 'alpha' || e.xk === 'guardian')) { S.holdT = Math.max(S.holdT || 0, HITSTOP.boss); G.Camera.kick(0.7); G.FX.burst(e.x, e.y, '#ffd23f', 26, 200); }
  }
  /** run.tick (host): the combo's window, its XP on pl.xpMul. */
  function comboTick(dt, pl) {
    const c = S.combo;
    if (c && c.n > 0) { c.t -= dt; if (c.t <= 0) { c.n = 0; c.t = 0; } }
    const k = 1 + Math.min(COMBO.XP_CAP, COMBO.XP_PER * (c ? c.n : 0));
    if (pl && !pl.remote) { pl.xpMul = (pl.xpMul || 1) / (pl.xcomboK || 1) * k; pl.xcomboK = k; }
  }
  /** run.hold: a hit-stop holds the world. */
  function hold(dt) {
    if (!on() || !(S.holdT > 0)) return undefined;
    S.holdT -= dt;
    return true;
  }
  /** The combo meter (under the HUD line): "x12 COMBO", its drain bar; hot at 10, fire at 20. */
  function drawCombo(ctx, w, S, F) {
    const c = S.combo;
    if (!c || c.n < 2) return;
    const x = w / 2, y = 92, col = c.n >= COMBO.FIRE ? '#ff7a3d' : c.n >= COMBO.HOT ? '#ffb347' : '#ffe9a0';
    const bump = 1 + Math.max(0, (c.t - (COMBO.WINDOW - 0.15)) / 0.15) * 0.25;
    ctx.save();
    ctx.translate(x, y); ctx.scale(bump, bump);
    ctx.font = F(900, 14); ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)';
    const s = new String(T().f('x{x} RACHA', c.n));   // eslint-disable-line no-new-wrappers
    ctx.strokeText(s, 0, 0); ctx.fillStyle = col; ctx.fillText(s, 0, 0);
    ctx.restore();
    const bw = 70, u = G.U.clamp(c.t / COMBO.WINDOW, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - bw / 2, y + 5, bw, 4);
    ctx.fillStyle = col; ctx.fillRect(x - bw / 2, y + 5, bw * u, 4);
    ctx.restore();
  }

  // ---------------- V4: the red ground (PokéDive's telegraphs: slam / charge), the host's ----------------
  // A brawler (a foe with no shot) that reaches you winds up a SLAM: a red circle round it fills for TELE.slam s, then
  // everyone still inside is hit (dmg x SLAM_DMG). An alpha also CHARGES (a red lane toward you fills, then it dashes along
  // it, hitting what it crosses); a guardian slams wider and charges more often. The foe holds still while winding up.
  // Dodge (i-frames) or step out. Viewers see them through the block (tg, in 10 steps of their fill).
  const TELE = { slam: 0.8, slamR: 1.6, alphaR: 2.6, guardR: 3.4, charge: 0.9, chargeLen: 7, chargeW: 1.3, chargeT: 0.35,
                 SLAM_DMG: 1.35, CHARGE_DMG: 1.6, CD: [2.6, 4.2], REACH: 2.2, ALPHA_CD: [2.2, 3.4], GUARD_CD: [1.6, 2.6] };
  function teleTick(dt, alive) {
    const R = TS();
    S.tg = S.tg || [];
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || e.remote || (e.xmove && e.xmove === sleeper)) continue;
      const big = e.xk === 'alpha' || e.xk === 'guardian';
      if (!big && (e.shotCd || e.behavior === 'thief')) continue;
      if (e.xtele) continue;
      e.xtcd = (e.xtcd == null ? 1 + Math.random() * 1.5 : e.xtcd) - dt;
      if (e.xtcd > 0) continue;
      let tgt = null, d2 = Infinity;
      for (const p of alive) { const d = G.U.dist2(p.x, p.y, e.x, e.y); if (d < d2) { d2 = d; tgt = p; } }
      if (!tgt) continue;
      const reach = (big ? TELE.chargeLen : TELE.REACH) * R;
      if (d2 > reach * reach) { e.xtcd = 0.3; continue; }
      const cdR = e.xk === 'guardian' ? TELE.GUARD_CD : big ? TELE.ALPHA_CD : TELE.CD;
      e.xtcd = cdR[0] + Math.random() * (cdR[1] - cdR[0]);
      const charge = big && (Math.sqrt(d2) > 2 * R || Math.random() < (e.xk === 'guardian' ? 0.45 : 0.35));
      const t = charge
        ? { k: 'charge', e, x: e.x, y: e.y, a: Math.atan2(tgt.y - e.y, tgt.x - e.x), len: TELE.chargeLen * R, w: TELE.chargeW * R, t: 0, T: TELE.charge }
        : { k: 'slam', e, x: e.x, y: e.y, r: (e.xk === 'guardian' ? TELE.guardR : big ? TELE.alphaR : TELE.slamR) * R, t: 0, T: TELE.slam };
      e.xtele = t; e.xmove0 = e.xmove; e.xmove = teleHold;
      S.tg.push(t);
    }
    for (let i = S.tg.length - 1; i >= 0; i--) {
      const t = S.tg[i], e = t.e;
      if (e.dead) { S.tg.splice(i, 1); continue; }
      t.t += dt;
      if (t.k === 'dash') {
        const u = Math.min(1, t.t / TELE.chargeT), px = t.x + Math.cos(t.a) * t.len * u, py = t.y + Math.sin(t.a) * t.len * u;
        e.x = px; e.y = py; G.World.collide(e);
        for (const p of alive) if (!t.hit.has(p) && G.U.dist2(p.x, p.y, e.x, e.y) < (t.w * 0.6 + (p.r || 10)) ** 2) { t.hit.add(p); p.hurt(e.dmg * TELE.CHARGE_DMG, 'normal'); }
        if (u >= 1) { S.tg.splice(i, 1); release(e); }
        continue;
      }
      if (t.t < t.T) continue;
      if (t.k === 'slam') {
        for (const p of alive) if (G.U.dist2(p.x, p.y, t.x, t.y) < t.r * t.r) p.hurt(e.dmg * TELE.SLAM_DMG, 'normal');
        G.FX.burst(t.x, t.y, '#ff6b5a', 14, 120);
        if (G.Camera.sees(t.x, t.y, 80)) G.Camera.kick(e.xk ? 0.35 : 0.12);
        S.tg.splice(i, 1); release(e);
      } else {   // the charge's wind-up is over: the dash
        Object.assign(t, { k: 'dash', t: 0, hit: new Set() });
      }
    }
  }
  function teleHold() { this.anim.loop('Idle', 0.05); return true; }
  function release(e) { e.xmove = e.xmove0 === teleHold ? null : e.xmove0 || null; e.xmove0 = null; e.xtele = null; }
  function drawTele(ctx, S, now) {
    const list = S.tg || [];
    for (const t of list) {
      const u = t.k === 'dash' ? 1 : G.U.clamp(t.t / t.T, 0, 1);
      ctx.save();
      ctx.fillStyle = 'rgba(255,60,50,' + (0.14 + 0.3 * u).toFixed(3) + ')';
      ctx.strokeStyle = 'rgba(255,90,70,.9)'; ctx.lineWidth = 2;
      if (t.k === 'slam') {
        ctx.beginPath(); ctx.ellipse(t.x, t.y, t.r, t.r * 0.62, 0, 0, 6.2832); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(t.x, t.y, t.r * u, t.r * 0.62 * u, 0, 0, 6.2832); ctx.fill();
      } else if (t.k === 'charge') {
        ctx.translate(t.x, t.y); ctx.rotate(t.a);
        ctx.strokeRect(0, -t.w / 2, t.len, t.w);
        ctx.fillRect(0, -t.w / 2, t.len * u, t.w);
      }
      ctx.restore();
      const e = t.e && t.e.id != null ? t.e : null;
      if (e && t.k !== 'dash') {
        ctx.save(); ctx.font = '900 14px Arial,Helvetica,sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = Math.sin(now * 18) > 0 ? '#ff4d4d' : '#ffd23f';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
        const y = e.y - (e.bodyH || 30) - 10;
        ctx.strokeText('!', e.x, y); ctx.fillText('!', e.x, y); ctx.restore();
      }
    }
  }

  // ---------------- V4: the viewers' block (the x block's c slot: snapshots, host frames, the replay's field 11) ----------------
  /** The host's state: {dv: 1, f floor, r route index, b bank, s stake, n rescued, q flags (1 sealed, 2 lost rescued, 4 escaped),
   *  o rope (quarters of a s), e the boss's id, l the lost Pokémon [dex, x, y], tg the telegraphs [k, x, y, r | len, a x100, w, fill 0-10, foe id]}.
   *  Coarse on purpose (the replay keeps it only when it changes). */
  function dBlock() {
    if (!on()) return null;
    const c = { dv: 1, f: S.floor, r: DG().ROUTE_IDS.indexOf(S.route), b: Math.floor(S.bank), s: Math.floor(S.stake), n: S.rescued.length,
                q: (S.sealed ? 1 : 0) | (S.lost && S.lost.done ? 2 : 0) | (S.escaped ? 4 : 0) | (S.lost && S.lost.follow ? 8 : 0) | (S.lmUsed ? 16 : 0) | (S.obeliskT > 0 ? 32 : 0), o: Math.round(S.ropeT * 4) };
    if (S.lost) c.l = [S.lost.dex, Math.round(S.lost.x), Math.round(S.lost.y)];
    if (S.weekly) c.w = [S.weekly.week, G.Expedition.DIVE_MODS.indexOf(S.weekly.mod)];   // (V8)
    if (S.plugsOpen) c.pg = S.plugsOpen;   // (the opened plugs, a bitmask)
    if (S.start > 1) c.st = S.start;
    if (S.boss && !S.boss.dead) c.e = S.boss.id;
    if (S.combo && S.combo.n >= 2) c.k = [S.combo.n, Math.round(S.combo.t * 10 / COMBO.WINDOW)];   // (V5: the combo, its window in tenths)
    if (S.tg && S.tg.length) c.tg = S.tg.map(t => [t.k === 'slam' ? 1 : t.k === 'charge' ? 2 : 3, Math.round(t.x), Math.round(t.y), Math.round(t.k === 'slam' ? t.r : t.len),
      Math.round((t.a || 0) * 100), Math.round(t.w || 0), t.k === 'dash' ? 10 : Math.min(10, Math.floor(t.t / t.T * 10)), t.e ? t.e.id : 0]);
    return c;
  }
  /** A viewer / co-op guest: the host's block (null: none). */
  function applyD(c) {
    if (!c) { view = null; return; }
    const route = DG().ROUTE_IDS[c.r | 0] || 'forest', old = view;
    const lost = c.l ? { dex: c.l[0], x: c.l[1], y: c.l[2], done: !!(c.q & 2), follow: !!(c.q & 8), anim: old && old.lost && old.lost.dex === c.l[0] ? old.lost.anim : null } : null;
    const K3 = [null, 'slam', 'charge', 'dash'];
    if (c.f) queueMicrotask(() => guestFollow(c.f | 0));   // (V8)
    if (c.pg && G.World.zone && G.World.zone.dive && G.World.zone.zone === (c.f | 0)) for (let i = 0; i < 8; i++) if (c.pg & (1 << i)) openPlug(i);   // (a viewer opens what the host did)
    view = { weekly: c.w ? { week: c.w[0], mod: G.Expedition.DIVE_MODS[c.w[1]] } : null, rescuedN: c.n | 0, start: c.st || 1, lmUsed: !!(c.q & 16), obeliskT: c.q & 32 ? 1 : 0, floor: c.f | 0, route, bank: c.b | 0, stake: c.s | 0, sealed: !!(c.q & 1), escaped: !!(c.q & 4), ropeT: (c.o || 0) / 4, lost,
             rescued: [], combo: c.k ? { n: c.k[0], t: c.k[1] / 10 * COMBO.WINDOW } : null, tg: (c.tg || []).map(a => ({ k: K3[a[0]], x: a[1], y: a[2], r: a[3], len: a[3], a: a[4] / 100, w: a[5], t: a[6] / 10, T: 1, e: G.EnemyMgr.get ? G.EnemyMgr.get(a[7]) : null })) };
  }

  // ---------------- drawing ----------------
  function drawGround(ctx) {
    const S = cur();
    if (!S || !G.World.zone || !G.World.zone.dive) return;
    const L = G.World.zone.dive, now = performance.now() / 1000, cam = G.Camera, R = TS();
    drawTele(ctx, S, now);
    drawPlugs(ctx, L, cam);
    const [sx, sy] = wpos(L.stairs);
    if (cam.sees(sx, sy, 60)) {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(now * 3) * 0.15;
      ctx.fillStyle = S.sealed ? '#ff6b7a' : '#ffe9a0';
      ctx.beginPath(); ctx.ellipse(sx, sy, R * 1.1, R * 0.6, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#3a2a1a';
      for (let i = 0; i < 4; i++) ctx.fillRect(sx - R / 2 + i * 2, sy - R / 2 + i * (R / 4), R - i * 4, R / 4 - 1);
      ctx.strokeStyle = S.sealed ? '#ff6b7a' : '#ffd23f'; ctx.lineWidth = 1.5;
      ctx.strokeRect(sx - R / 2, sy - R / 2, R, R);
      ctx.restore();
    }
    if (L.cadence.rope) {
      const [rx, ry] = wpos(L.spawn);
      if (cam.sees(rx, ry, 60)) {
        ctx.save();
        ctx.strokeStyle = '#b48aff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.5 + Math.sin(now * 4) * 0.2;
        ctx.beginPath(); ctx.ellipse(rx, ry, K.ROPE_R * R, K.ROPE_R * R * 0.55, 0, 0, 6.2832); ctx.stroke();
        if (S.ropeT > 0) { ctx.globalAlpha = 0.9; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(rx, ry, K.ROPE_R * R, K.ROPE_R * R * 0.55, 0, -Math.PI / 2, -Math.PI / 2 + 6.2832 * S.ropeT / K.ROPE_T); ctx.stroke(); }
        ctx.restore();
      }
    }
    const lo = S.lost;
    if (lo && !lo.done && cam.sees(lo.x, lo.y, 60)) {
      if (!lo.anim || lo.anim.dex !== lo.dex) lo.anim = new G.Sprites.Animator(lo.dex, 1);
      lo.anim.update(1 / 60); lo.anim.loop(lo.follow ? 'Walk' : 'Idle');
      ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = lo.follow ? '#9fffc8' : '#7fe0ff';
      ctx.beginPath(); ctx.ellipse(lo.x, lo.y, R * 0.9, R * 0.45, 0, 0, 6.2832); ctx.fill(); ctx.restore();
      lo.anim.draw(ctx, lo.x, lo.y);
      ctx.save(); ctx.font = '800 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = lo.follow ? '#ff9ed8' : '#ffd23f';
      ctx.fillText(lo.follow ? '♥' : '!', lo.x, lo.y - 30 - Math.abs(Math.sin(now * 4)) * 4); ctx.restore();   // (V6: a heart while it follows you)
    }
    // (V6) the landmark: a glowing stone with its name, dim once used
    const lm = L.landmark;
    if (lm) {
      const [mx, my] = wpos(lm.at), col = LMCOL[lm.kind] || '#ffe9a0';
      if (cam.sees(mx, my, 80)) {
        ctx.save();
        ctx.globalAlpha = S.lmUsed ? 0.35 : 0.45 + Math.sin(now * 3) * 0.15;
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(mx, my, LM.R * R, LM.R * R * 0.55, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = S.lmUsed ? 0.5 : 1;
        ctx.fillStyle = '#3a3f52'; ctx.fillRect(mx - 6, my - 26, 12, 26);
        ctx.fillStyle = col; ctx.fillRect(mx - 4, my - 22, 8, 6);
        ctx.font = '700 9px Arial,Helvetica,sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)';
        const nm = T().t(LMNAME[lm.kind] || '');
        ctx.strokeText(nm, mx, my - 32); ctx.fillStyle = '#f4f8ff'; ctx.fillText(nm, mx, my - 32);
        ctx.restore();
      }
    }
  }
  function hudLine() {
    const S = cur();
    if (!S) return '';
    return T().f('PISO {x}', S.floor) + ' · ' + T().t(NAME[S.route]).toUpperCase() + ' · ' + T().f('{x} asegurado · {x} en juego', Math.floor(S.bank), Math.floor(S.stake));
  }
  const hudColor = () => { const S = cur(); return S && S.sealed ? '#ff9a6b' : S && S.ropeT > 0 ? '#b48aff' : '#9fd8ff'; };
  function drawHud(ctx, w, h, pl, st, F) {
    const S = cur();
    if (!S) return;
    drawCombo(ctx, w, S, F);   // (V5)
    // the route's 25 pips (every 5th: alpha, the 25th: the guardian)
    const pos = ((S.floor - 1) % 25) + 1, x0 = w / 2 - 25 * 5, y = 74;
    ctx.save();
    for (let i = 1; i <= 25; i++) {
      const x = x0 + (i - 1) * 10, big = i % 5 === 0;
      ctx.fillStyle = i < pos ? '#9fd8ff' : i === pos ? '#ffffff' : 'rgba(255,255,255,.22)';
      if (i === 25) ctx.fillStyle = i <= pos ? '#ffd23f' : 'rgba(255,210,63,.4)';
      const r = big ? 3.2 : 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }
  function drawMini(ctx, pl, api) {
    const S = cur();
    if (!S || !G.World.zone || !G.World.zone.dive) return;
    const L = G.World.zone.dive, pts = [[wpos(L.stairs), S.sealed ? '#ff6b7a' : '#ffd23f']];
    if (S.lost && !S.lost.done) pts.push([[S.lost.x, S.lost.y], '#7fe0ff']);
    for (const [[x, y], col] of pts) {
      const q = api.edge(api.pt(x, y));
      ctx.save(); ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(q.x - 3, q.y - 3, 6, 6); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }

  return { K, NAME, GUARDIANS, target, pool, guardianOf, legendPool, legendRoll, megaRoll, routeOf, begin, reset, update, hurt, onKill, pay, scoreParts, result, record,
           setup, roles, press, pad, tick, out, drawButtons, offerLearn, LEARN_AT, get rects() { return rects; },
           submit, board, guestFollow, WEEKLY, MOD_NAME, expectedPay, openPlug, canOpen, PLUG,
           openPicker, closePicker, back, starts, startOf, stageOf, bestOf, sealOf, seals, routeOpen, hurtK, SEAL, MAIN,
           live, shown, dBlock, applyD, TELE, COMBO, HITSTOP, hold, ecoLayout, LM, ESCORT, get view() { return view; },
           drawGround, drawHud, drawMini, hudLine, hudColor, on, get run() { return S; } };
})();
