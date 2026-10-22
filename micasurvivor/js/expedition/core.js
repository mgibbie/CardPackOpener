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
 *
 * D2 (movement verbs, js/expedition/verbs.js): the `x` block is v2, {xv: 2, m, z, th, a}. `a` is the airborne state:
 *   a.p   the player's air row (G.ExpVerbs.row: [lift, verb, layer x2, phase cs, airtime cs, hops]): in a snapshot the
 *         watched player's, in a co-op GUEST's frame to the host the guest's own
 *   a.q   the co-op players' rows: in a host frame {uid: row} (the host and every other guest), in a snapshot
 *         {name: row} (the partners, airborne / using a verb only)
 *   a.e   airborne enemies (a jumper mid-leap), flat [id, lift, id, lift, ...] (their layer is the zone's under them)
 *   The replay keeps {xv, m, z, th} in its slow state and `a` in a frame field of its own (js/mica/replay.js), so a hop
 *   costs a few bytes, not a slow-state rewrite. A v1 block (no `a`) still loads: terrain, everyone on the ground.
 *   viewAir(s, pl, mates)   a replay / spectator view shows a snapshot's `a` (js/ui/watch-ui.js)
 *   hostAir(x, mateOf)      a co-op guest shows the host frame's `a` (js/net/coop.js onHostFrame)
 *   guestAir(m, x)          the host keeps a guest's own row (js/net/coop.js onClientFrame), for its frames and snapshots
 *
 * D3 (Expedition · Classic, js/expedition/classic.js): Classic is PLAYABLE, so the content version starts moving: dv 2
 * (G.Expedition.DV; a dv-1 replay still plays: G.Expedition.replayOk). The `x` block is v3, {xv: 3, m, z, th, a, c}:
 *   c     the zone's timeline state, from the host (G.ExpClassic.xblockC): zone start, phase (altar / guardian / portal /
 *         legendary / won), altar charge, final swarm, events fired, difficulty, the special enemies (alphas, elites,
 *         totems, summoners) and the boss's exhaustion. The plan itself (events, guardian, altar) is rebuilt from the seed
 *         by every viewer (G.ExpClassic.plan / sitesOf), so it is never sent. Zone 4 is the hand-made shrine
 *         (G.ExpClassic.build). The replay keeps c in its slow state (it changes a few times a minute).
 *   The v1 / v2 readers are kept: no `c` = no timeline shown (terrain and air as before).
 *   run.start       a Classic run's timeline starts (G.ExpClassic.begin); a base run drops any old one (reset)
 *   run.end         the run-over screen gets the victory title, the map / difficulty and the zone splits against your best
 *                   (G.ExpClassic.result), the save the splits, wins and best clear (G.ExpClassic.record), the board the
 *                   Classic score (G.ExpClassic.score, the study's 2.12 formula until D9)
 *
 * D4 (the League, js/expedition/league.js): an Expedition run is played as a League member (G.ExpLeague): its kit, its
 * evolutions, Maturity, stats from base stats. dv 3. The `x` block is v4, {xv: 4, m, z, th, a, c, l}:
 *   l     the League rows [member, form, kit moves unlocked, Maturity, evolutions] (G.ExpLeague.row): l.p the watched /
 *         sending player's, l.q the co-op players' (by uid in host frames, by name in snapshots). A viewer's puppet takes
 *         the form's sprite (G.ExpLeague.applyRow). The replay keeps `l` in its slow state (it changes a few times a run).
 *   The v1-v3 readers are kept: a block without `l` shows every player as its snapshot draws it.
 *   run.start       the League member's first stage, kit move and passive (G.ExpLeague.begin)
 *   levelup.offer   kit moves at Lv 2 / 4 / 7, evolutions (a branch: its cards), Maturity (G.ExpLeague.offerHook)
 *   levelup.cards   the level's news on the cards (G.ExpLeague.cardsHook)
 *   run.end         the League's counters, its challenges, the new members (G.ExpLeague.record / lines)
 *
 * D5 (level-ups and items, js/expedition/levelups.js, items.js, moves.js): rarity-rolled cards of its own, move levels to 8,
 * the 8 new archetypes, 21 vitamins, 60 stacking items, Refresh / Skip / Banish, the study's XP curve. dv 4. The `x` block
 * is v5, {xv: 5, m, z, th, a, c, l, u}:
 *   u     the bag rows {v: [[vitamin, lv]], i: {item: n}, m: {move: lv}, e: [Expedition moves], t: [refresh, skip, banish]}
 *         (G.ExpLevel.row): u.p the watched / sending player's, u.q the co-op players' (by uid in host frames, by name in
 *         snapshots). A viewer's puppet shows its bag and its Expedition moves (G.ExpLevel.applyRow). The replay keeps
 *         `u` in its slow state (it changes at a level-up or a pickup).
 *   The v1-v4 readers are kept: a block without `u` shows no bag.
 *   levelup.offer   after the League's branch: the Expedition's own cards (G.ExpLevel.offer)
 *   xp.need         the curve (G.ExpLevel.xpNeed); item.roll / item.take: the Expedition's items (seeded drops, stacking)
 *   player.hurt / player.ko / player.dealt / combat.out: the items' and vitamins' procs (G.ExpItems)
 *   combat.run / combat.ghost: the 8 new archetypes (G.ExpMoves); run.tick: their effects, the items' timers, the bag strip
 *
 * D6 (Ultimates, js/expedition/ultimates.js): a charge meter (95 s passive, a kill bucket, elite / alpha / boss kills,
 * damage taken), the cast (hit-stop, i-frames, the cut-in), type Ultimates from the Z-moves' choreographies, 16 signature
 * Ultimates by evolution tier, the auto-Ultimate setting. dv 5. The `x` block is v6, {xv: 6, m, z, th, a, c, l, u, w}:
 *   w     the Ultimate rows [charge %, pieces cast, piece code, tier, flags (1 casting, 2 auto), the cast's code]
 *         (G.ExpUlt.row): w.p the watched / sending player's, w.q the co-op players' (by uid in host frames, by name in
 *         snapshots). A viewer's puppet shows the meter, the cut-in and each piece's choreography (no damage) when the
 *         count goes up (G.ExpUlt.applyRow). The replay keeps `w` in a frame field of its own (field 8: it changes with
 *         the charge), and an `xu` event when a cast starts.
 *   The v1-v5 readers are kept: a block without `w` shows no Ultimate.
 *   enemy.ko        the kill bucket and the elite / alpha / boss bonuses (G.ExpUlt.onKill)
 *   player.hurt     the cast's i-frames first (before the items' shield), then the damage-taken charge
 *   run.hold        the cast's hit-stop; run.tick: the charge, the keys, auto, the cast itself
 *
 * D7 (economy and interactables, js/expedition/economy.js): ₽ (the run's coins: KOs, gold rocks, Skip), paid / free / cursed
 * Poké Balls, Meowth's shop with market heat, Unown altars in 4 tiers and the comet, challenge / cursed / greed altars, Ditto,
 * Hypno, gold rocks, berries and cages; the zone map with its legend and the fog of war; first-run tips. dv 6. The `x` block
 * is v7, {xv: 7, m, z, th, a, c, l, u, w, o}:
 *   o     the interactables' host state (G.ExpEco.oBlock): {s: [index, state, charge %, ...] of every one that isn't fresh,
 *         h: [balls bought, shop buys, balls opened], g: [difficulty, spawns, XP, ₽ %, loot], m: Meowth while he's in,
 *         n: interactables used, u: the last one}. Where they are comes from the seed (G.ExpEco.layoutOf), so it's never
 *         sent. The replay keeps `o` in a frame field of its own (field 9) and an `xi` event when one is used.
 *   The v1-v6 readers are kept: a block without `o` shows every interactable fresh.
 *   enemy.ko        ₽ for the kill; run.tick: the interactables; minimap.draw: their icons, under the fog of war
 *
 * D8 (alphas, capture and shinies, js/expedition/capture.js; elemental reactions and weather boosts, js/expedition/reactions.js):
 * an alpha faints at 1 HP and a Friend Ball makes it a Support Alpha (2 slots, a type perk each); a challenge completed from D8
 * on brings its League member's wild encounter (weaken it, catch it: league.own); shiny encounters; the capture cinematic
 * (run.hold); reactions and weather boosts through combat.out. dv 7. The `x` block is v8, {xv: 8, m, z, th, a, c, l, u, w, o, p}:
 *   p     the captures' host state (G.ExpCap.pBlock): {s: the Support Alphas' dex, t: [id, kind, ...] the League / shiny
 *         encounters, f: [kind, dex, x, y, flags, ...] the fainted Pokémon, k: the capture under way [kind, dex, x, y, flags,
 *         seq], n: captures, u: the last one's dex, h: (host frames) the host's uid}. A viewer draws the Support Alphas round
 *         the watched player, the fainted ones, the cinematic when `k`'s seq changes (G.ExpCap.applyP). The replay keeps it in
 *         its slow state (it changes a few times a zone) and an `xc` event when `n` rises.
 *   The v1-v7 readers are kept: a block without `p` shows no Support Alpha, encounter or capture.
 *   run.tick        the encounters, the faint windows, the Support Alphas; run.hold: the cinematic; combat.out: reactions,
 *                   weather; enemy.ko: an encounter KO'd some other way still faints; minimap.draw: the encounters
 */
G.Exp = (() => {
  const dv = 7;   // this file's content version (D3: Classic playable; D4: the League; D5: level-ups and items; D6: Ultimates; D7: economy and interactables; D8: alphas, capture and shinies): G.Expedition.DV must match (the loader refuses a stale cache)
  const X = G.Expedition;
  let inited = false, cur = null;
  const XV = 8;   // the `x` block's schema (G.ExpTerrain.XV): bump it (and keep a reader for the old one) when it grows
  const READS = [1, 2, 3, 4, 5, 6, 7, 8];   // the schemas applyX / viewAir read (v1: D1's terrain only; v2: + air; v3: + the timeline `c`; v4: + the League `l`; v5: + the bag `u`; v6: + the Ultimates `w`; v7: + the interactables `o`; v8: + the captures `p`)
  const C = () => G.ExpClassic;
  const LG = () => G.ExpLeague;
  const LV = () => G.ExpLevel, IT = () => G.ExpItems, MV = () => G.ExpMoves;
  const UL = () => G.ExpUlt;
  const EC = () => G.ExpEco;
  const CP = () => G.ExpCap, RX = () => G.ExpRx;
  const expRun = () => G.Modes.isExp();

  function init() {
    if (inited) return;
    inited = true;
    G.Hooks.on('run.start', cfg => {
      if (!expRun()) { if (C()) C().reset(); if (LG()) LG().reset(); if (LV()) LV().reset(); if (UL()) UL().reset(); if (EC()) EC().reset(); if (CP()) CP().reset(); if (RX()) RX().reset(); return; }
      cur = { mode: cfg.mode, dv: cfg.dv, map: cfg.map, diff: cfg.diff, zone: 0, th: '' };
      enterZone(1);
      if (cfg.mode === 'exp-classic' && C()) C().begin(cfg);   // (D3)
      if (LG()) LG().begin(G.Game.player, cfg);                 // (D4: the League member)
      if (LV()) LV().begin(G.Game.player);                      // (D5: the curve, the tools, the bag)
      if (UL()) UL().begin(G.Game.player);                      // (D6: the Ultimate's meter)
      if (EC()) EC().begin(G.Game.player);                      // (D7: ₽, the interactables, the fog, the tips)
      if (CP()) CP().begin(G.Game.player);                      // (D8: alphas, Support Alphas, League encounters, shinies)
      if (RX()) RX().begin(G.Game.player);                      // (D8: elemental reactions, weather boosts)
    });
    // (D4: a League run's level-ups: kit moves, evolutions and their choice, Maturity; a base run gets undefined / its cards)
    // (D5: then the Expedition's own cards, rarity-rolled: G.ExpLevel.offer; it adds the League's note itself)
    G.Hooks.on('levelup.offer', (pl, n) => { const b = LG() ? LG().offerHook(pl) : undefined; return b !== undefined ? b : LV() ? LV().offer(pl, n) : undefined; });
    G.Hooks.on('levelup.cards', (cards, pl) => (LG() ? LG().cardsHook(cards, pl) : cards));
    // (D5: the XP curve, the items, the procs, the new archetypes; each listener leaves a base run / another player alone)
    G.Hooks.on('xp.need', (v, L) => (LV() ? LV().xpNeed(v, L) : v));
    G.Hooks.on('item.roll', pl => (expRun() && LV() ? LV().itemRoll(pl) : undefined));
    G.Hooks.on('item.take', (pl, id) => (LV() ? LV().itemTake(pl, id) : undefined));
    // (D6: an Ultimate's i-frames come first, so a cast never spends the shield; then the items; then the hurt charge)
    G.Hooks.on('player.hurt', (d, pl, type) => {
      if (UL() && UL().guard(pl)) return 0;
      if (IT()) d = IT().hurt(d, pl, type);
      if (UL()) UL().hurt(d, pl);
      return d;
    });
    G.Hooks.on('player.ko', pl => { if (IT()) IT().ko(pl); });
    G.Hooks.on('player.dealt', (pl, d) => { if (IT()) IT().dealt(pl, d); });
    G.Hooks.on('combat.out', (k, pl, e, src, dmg) => { if (IT()) k = IT().out(k, pl, e, src, dmg); return RX() ? RX().out(k, pl, e, src, dmg) : k; });   // (D8: reactions, weather)
    G.Hooks.on('combat.run', (pl, m, ghost) => { if (MV()) MV().run(pl, m, ghost); });
    G.Hooks.on('combat.ghost', (pl, id, lvl, aim) => { if (MV()) MV().ghost(pl, id, lvl, aim); });
    G.Hooks.on('run.tick', (dt, pl) => { if (!expRun()) return; if (MV()) MV().tick(dt); if (IT()) IT().tick(dt, pl); if (LV()) LV().tick(dt); if (UL()) UL().tick(dt, pl); if (EC()) EC().tick(dt, pl); if (CP()) CP().tick(dt, pl); if (RX()) RX().tick(dt, pl); });
    // (D6: the Ultimate's charge from kills, and its hit-stop)
    G.Hooks.on('enemy.ko', (e, pl) => { if (!expRun()) return; if (UL()) UL().onKill(e, pl); if (EC()) EC().onKill(e, pl); });   // (D7: ₽ for the kill; D8: a capture target's faint is seen in run.tick)
    // (D7: the zone's interactables on the minimap, under the fog of war; the seam only runs in a zone)
    G.Hooks.on('minimap.draw', (ctx, pl, api) => { if (EC()) EC().drawMini(ctx, pl, api); if (CP()) CP().drawMini(ctx, pl, api); });   // (D8: the encounters)
    G.Hooks.on('run.hold', (dt, pl) => { if (!expRun()) return undefined; const u = UL() ? UL().hold(dt, pl) : undefined; return u || (CP() ? CP().hold(dt, pl) : undefined); });   // (D8: the capture cinematic)
    G.Hooks.on('replay.header', h => {
      if (!expRun()) return h;
      const R = G.Modes.run;
      h.dv = R.dv; h.map = R.map; h.diff = R.diff;
      return h;
    });
    G.Hooks.on('spectate.snap', s => {
      if (expRun()) { s.dv = G.Modes.run.dv; const x = xblock(); if (x) { x.a = airSnap(s); const c = C() && C().xblockC(); if (c) x.c = c; const l = leagueSnap(); if (l) x.l = l; const u = bagSnap(); if (u) x.u = u; const w = ultSnap(); if (w) x.w = w; const o = EC() && EC().oBlock(); if (o) x.o = o; const p = CP() && CP().pBlock(); if (p) x.p = p; s.x = x; } }
      return s;
    });
    // (a host frame: m is the guest it goes to; a guest's frame to the host: m is null. A guest's run may not be an
    // Expedition one on its side yet (co-op starts are still base), so a guest goes by the zone the host gave it.)
    G.Hooks.on('net.frame', (f, m) => {
      if (expRun() || (!m && G.World.zone)) {
        const x = xblock();
        if (x) { x.a = m ? airHost(m) : airGuest(); const c = m && C() && C().xblockC(); if (c) x.c = c; const l = m ? leagueHost(m) : leagueGuest(); if (l) x.l = l; const u = m ? bagHost(m) : bagGuest(); if (u) x.u = u; const w = m ? ultHost(m) : ultGuest(); if (w) x.w = w; const o = m && EC() && EC().oBlock(); if (o) x.o = o; const p = m && CP() && CP().pBlock(); if (p) { if (G.Net && G.Net.uid) p.h = G.Net.uid; x.p = p; } f.x = x; }
      }
      return f;
    });
    G.Hooks.on('run.end', (out, sum) => {
      if (!X.isExp(sum.mode)) return out;
      // D3: the Classic run's outcome (read before it is recorded, so the splits compare with the old bests)
      const res = sum.mode === 'exp-classic' && C() ? C().result() : null;
      if (res) {
        out.lines = out.lines.concat(res.lines);
        out.title = res.title; out.splits = res.splits; out.won = res.won;
        sum.score = C().score(sum); sum.won = res.won; sum.zone = res.zone;
        C().record();
      }
      record(sum);
      // D4: the League's counters, then its challenges (after record(): "finish N runs" counts this one), its lines on the screen
      if (LG() && LG().run) { const newly = LG().record(sum); G.ExpSave.commit(); out.lines = out.lines.concat(LG().lines(newly)); out.league = newly; }
      // D5: the level-ups' and items' counters, a line with the bag
      if (LV() && LV().run) { out.lines = out.lines.concat(LV().record(sum)); G.ExpSave.commit(); }
      // D6: the Ultimates cast (counters), a line
      if (UL() && UL().run) { out.lines = out.lines.concat(UL().record(sum)); G.ExpSave.commit(); }
      // D7: ₽, Poké Balls, the shop, altars (counters), a line
      if (EC() && EC().run) { out.lines = out.lines.concat(EC().record(sum)); G.ExpSave.commit(); }
      // D8: Support Alphas, captures, shinies, reactions (sets and counters), their lines
      if (CP() && CP().run) { out.lines = out.lines.concat(CP().record(sum)); G.ExpSave.commit(); }
      if (RX() && RX().run) { out.lines = out.lines.concat(RX().record(sum)); G.ExpSave.commit(); }
      if (sum.clean && !sum.group) submitScore(sum);
      cur = null;
      return out;
    });
    G.ExpSave.open();
  }

  // ---------------- D1: the zone ----------------
  /** Generates zone `z` of this run's map from the world seed and puts it in the world (the player in its clearing). */
  function enterZone(z) {
    const map = (cur && cur.map) || G.Modes.run.map;
    const zone = C() ? C().build(G.World.seed, map, z) : G.ExpTerrain.generate({ seed: G.World.seed, map, zone: z });   // (D3: zone 4 = the shrine)
    G.World.setZone(zone);
    G.Path.clear();
    G.Minimap.reset();
    if (cur) { cur.zone = z; cur.th = zone.hash; }
    return zone;
  }
  /** The `x` block of the current zone: {xv, m, z, th} (null outside a zone; D2 adds `a`, D3 `c`). Terrain is never sent. */
  function xblock() {
    const zn = G.World.zone;
    return zn && zn.map ? { xv: XV, m: zn.map, z: zn.zone, th: zn.hash } : null;
  }

  // ---------------- D2: the airborne state in the `x` block ----------------
  const V = () => G.ExpVerbs;
  const NEAR = 720;
  /** Airborne enemies near (x, y): flat [id, lift, ...] (enemies only leave the ground by leaping). */
  function airEnemies(x, y) {
    const out = [];
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || !(e.jumpLift > 0.5) || G.U.dist2(e.x, e.y, x, y) > NEAR * NEAR) continue;
      out.push(e.id, Math.round(e.jumpLift));
    }
    return out;
  }
  const busy = r => r && (r[0] > 0 || r[1] > 0);
  /** A snapshot's `a`: the player's row, its co-op partners' (by name, only those in the air / using a verb). */
  function airSnap() {
    const pl = G.Game.player;
    if (!pl) return {};
    const a = { p: V().row(pl) };
    if (G.Coop && G.Coop.active) {
      const q = {};
      for (const m of G.Coop.mates) if (m.connected && busy(m.xrow)) q[m.name] = m.xrow;
      if (Object.keys(q).length) a.q = q;
    }
    const e = airEnemies(pl.x, pl.y);
    if (e.length) a.e = e;
    return a;
  }
  /** A host frame's `a` for guest m: every player's row by uid (the host's own, the other guests'), airborne enemies near m. */
  function airHost(m) {
    const pl = G.Game.player, q = {};
    if (pl && G.Net && G.Net.uid) q[G.Net.uid] = V().row(pl);
    for (const o of G.Coop.mates) if (o.connected && o.uid !== m.uid && o.xrow) q[o.uid] = o.xrow;
    const a = { q };
    const e = airEnemies(m.pl ? m.pl.x : 0, m.pl ? m.pl.y : 0);
    if (e.length) a.e = e;
    return a;
  }
  /** A guest's own frame to the host: its row. */
  function airGuest() { const pl = G.Game.player; return pl ? { p: V().row(pl) } : {}; }

  const lifted = new Set();
  /** Airborne enemies (a flat [id, lift] list) on their copies; the ones no longer listed come down. */
  function liftEnemies(list) {
    const now = new Set();
    for (let i = 0; i + 1 < (list || []).length; i += 2) {
      const e = G.EnemyMgr.get(list[i]);
      if (!e || !e.remote) continue;
      e.jumpLift = list[i + 1]; now.add(e.id);
    }
    for (const id of lifted) if (!now.has(id)) { const e = G.EnemyMgr.get(id); if (e && e.remote) e.jumpLift = 0; }
    lifted.clear();
    for (const id of now) lifted.add(id);
  }
  /** A replay / spectator view: snapshot s's `a` on the watched player, its partners (mates: name -> {p}) and enemies. */
  function viewAir(s, pl, mates) {
    const x = s && s.x, a = x && READS.includes(x.xv) && x.xv >= 2 ? x.a || {} : null;
    if (pl) V().applyRow(pl, a && a.p);
    if (mates) for (const [name, o] of mates) V().applyRow(o.p, a && a.q ? a.q[o.raw || name] : null);
    const l = lOf(x);   // (D4: the League forms; a replay's `me` is the member, a live one's the form)
    if (l && LG()) {
      if (pl && l.p) LG().applyRow(pl, l.p);
      if (mates && l.q) for (const [name, o] of mates) if (l.q[o.raw || name]) LG().applyRow(o.p, l.q[o.raw || name]);
    }
    const u = uOf(x);   // (D5: the bags; the watched player's shows in the strip)
    if (LV()) {
      if (pl) { LV().applyRow(pl, u && u.p); LV().watch(pl); }
      if (mates && u && u.q) for (const [name, o] of mates) LV().applyRow(o.p, u.q[o.raw || name] || null);
    }
    const w = wOf(x);   // (D6: the Ultimates: the watched player's meter, everyone's casts)
    if (UL()) {
      if (pl) UL().applyRow(pl, w && w.p);
      if (mates) for (const [name, o] of mates) UL().applyRow(o.p, w && w.q ? w.q[o.raw || name] || null : null);
    }
    liftEnemies(a && a.e);
    if (C()) C().applyC(x && READS.includes(x.xv) && x.xv >= 3 ? x.c || null : null);   // (D3: the timeline state)
    if (EC()) EC().applyO(oOf(x));   // (D7: the interactables)
    if (CP()) CP().applyP(pOf(x));   // (D8: the captures)
    return !!a;
  }
  /** A co-op guest: the host frame's `a` (rows by uid: mateOf(uid) -> that player's puppet, or null). */
  function hostAir(x, mateOf) {
    if (!x || !READS.includes(x.xv)) return false;
    const a = x.xv >= 2 && x.a ? x.a : {};
    for (const u in a.q || {}) { const p = mateOf(u); if (p) V().applyRow(p, a.q[u]); }
    const l = lOf(x);   // (D4: the other players' League forms)
    if (l && l.q && LG()) for (const u in l.q) { const p = mateOf(u); if (p) LG().applyRow(p, l.q[u]); }
    const ub = uOf(x);   // (D5: the other players' bags and Expedition moves)
    if (ub && ub.q && LV()) for (const u in ub.q) { const p = mateOf(u); if (p) LV().applyRow(p, ub.q[u]); }
    const w = wOf(x);   // (D6: the other players' Ultimates)
    if (w && w.q && UL()) for (const u in w.q) { const p = mateOf(u); if (p) UL().applyRow(p, w.q[u]); }
    liftEnemies(a.e);
    if (C()) C().applyC(x.xv >= 3 ? x.c || null : null);   // (D3: the timeline state)
    if (EC()) EC().applyO(oOf(x));   // (D7: the interactables)
    if (CP()) CP().applyP(pOf(x));   // (D8: the captures; the host's Support Alphas round its puppet: p.h)
    return true;
  }
  /** The host: a guest's frame `x` -> its row, kept on the mate (m.xrow) and shown on its puppet. */
  function guestAir(m, x) {
    if (!m || !x || !READS.includes(x.xv)) return;
    m.xrow = x.xv >= 2 && x.a && Array.isArray(x.a.p) ? x.a.p : null;
    if (m.pl) V().applyRow(m.pl, m.xrow);
    const l = lOf(x);   // (D4: the guest's League row: its puppet's form here, and so in the host's frames / snapshots)
    if (l && l.p && m.pl && LG()) LG().applyRow(m.pl, l.p);
    const u = uOf(x);   // (D5: the guest's bag: on its puppet here, and so in the host's frames / snapshots)
    if (u && u.p && m.pl && LV()) LV().applyRow(m.pl, u.p);
    const w = wOf(x);   // (D6: the guest's Ultimate: on its puppet here, and so in the host's frames / snapshots)
    if (w && w.p && m.pl && UL()) UL().applyRow(m.pl, w.p);
  }

  // ---------------- D4: the League rows in the `x` block ----------------
  /** A snapshot's `l`: the player's row, its co-op partners' (by name, those with a row). Null outside a League run. */
  function leagueSnap() {
    const r = LG() && LG().row();
    if (!r) return null;
    const l = { p: r };
    if (G.Coop && G.Coop.active) {
      const q = {};
      for (const m of G.Coop.mates) if (m.connected && m.pl && m.pl.xlg) q[m.name] = m.pl.xlg;
      if (Object.keys(q).length) l.q = q;
    }
    return l;
  }
  /** A host frame's `l` for guest m: every other player's row by uid (the host's own, the other guests'). */
  function leagueHost(m) {
    const q = {}, r = LG() && LG().row();
    if (r && G.Net && G.Net.uid) q[G.Net.uid] = r;
    for (const o of G.Coop.mates) if (o.connected && o.uid !== m.uid && o.pl && o.pl.xlg) q[o.uid] = o.pl.xlg;
    return Object.keys(q).length ? { q } : null;
  }
  /** A guest's own frame to the host: its row. */
  function leagueGuest() { const r = LG() && LG().row(); return r ? { p: r } : null; }
  /** The `l` of a v4+ block (an older block: none, everyone stays as drawn). */
  const lOf = x => (x && READS.includes(x.xv) && x.xv >= 4 && x.l) || null;

  // ---------------- D5: the bag rows in the `x` block ----------------
  /** A snapshot's `u`: the player's bag row, its co-op partners' (by name, those with one). Null outside an Expedition run. */
  function bagSnap() {
    const r = LV() && LV().row();
    if (!r) return null;
    const u = { p: r };
    if (G.Coop && G.Coop.active) {
      const q = {};
      for (const m of G.Coop.mates) if (m.connected && m.pl && m.pl.xu) q[m.name] = m.pl.xu;
      if (Object.keys(q).length) u.q = q;
    }
    return u;
  }
  /** A host frame's `u` for guest m: every other player's row by uid. */
  function bagHost(m) {
    const q = {}, r = LV() && LV().row();
    if (r && G.Net && G.Net.uid) q[G.Net.uid] = r;
    for (const o of G.Coop.mates) if (o.connected && o.uid !== m.uid && o.pl && o.pl.xu) q[o.uid] = o.pl.xu;
    return Object.keys(q).length ? { q } : null;
  }
  function bagGuest() { const r = LV() && LV().row(); return r ? { p: r } : null; }
  /** The `u` of a v5+ block (an older block: none, no bag shown). */
  const uOf = x => (x && READS.includes(x.xv) && x.xv >= 5 && x.u) || null;

  // ---------------- D6: the Ultimate rows in the `x` block ----------------
  /** A snapshot's `w`: the player's row, its co-op partners' (by name, those with one). Null outside an Expedition run. */
  function ultSnap() {
    const r = UL() && UL().row();
    if (!r) return null;
    const w = { p: r };
    if (G.Coop && G.Coop.active) {
      const q = {};
      for (const m of G.Coop.mates) if (m.connected && m.pl && m.pl.xw) q[m.name] = m.pl.xw;
      if (Object.keys(q).length) w.q = q;
    }
    return w;
  }
  /** A host frame's `w` for guest m: every other player's row by uid. */
  function ultHost(m) {
    const q = {}, r = UL() && UL().row();
    if (r && G.Net && G.Net.uid) q[G.Net.uid] = r;
    for (const o of G.Coop.mates) if (o.connected && o.uid !== m.uid && o.pl && o.pl.xw) q[o.uid] = o.pl.xw;
    return Object.keys(q).length ? { q } : null;
  }
  function ultGuest() { const r = UL() && UL().row(); return r ? { p: r } : null; }
  /** The `w` of a v6+ block (an older block: none, no Ultimate shown). */
  const wOf = x => (x && READS.includes(x.xv) && x.xv >= 6 && x.w) || null;
  /** The `o` of a v7+ block (D7: an older block: none, every interactable fresh). */
  const oOf = x => (x && READS.includes(x.xv) && x.xv >= 7 && x.o) || null;
  /** The `p` of a v8+ block (D8: an older block: none, no capture shown). */
  const pOf = x => (x && READS.includes(x.xv) && x.xv >= 8 && x.p) || null;

  /** A viewer / guest: the same zone from the same seed + `x`. -> its hash, or null (an unknown schema). */
  function applyX(seed, x) {
    if (!x || !READS.includes(x.xv) || !G.ExpTerrain.MAPS.includes(x.m)) { if (x) console.warn('[Exp] unknown terrain block', x); return null; }
    if ((G.World.seed | 0) !== (seed | 0)) return null;   // (the view has moved on to another run)
    const zone = C() ? C().build(seed, x.m, x.z) : G.ExpTerrain.generate({ seed, map: x.m, zone: x.z });   // (D3: zone 4 = the shrine)
    if (x.th && zone.hash !== x.th) console.warn('[Exp] terrain rebuild differs from the host (' + zone.hash + ' vs ' + x.th + ')');
    G.World.setZone(zone);
    G.Minimap.reset();
    return zone.hash;
  }

  /** The run's progress into the Expedition save (never the base save). (D3: Classic's splits / wins: G.ExpClassic.record) */
  function record(sum) {
    const S = G.ExpSave;
    S.bump('runs');
    S.bump('runs.' + sum.mode);
    if (X.MAPS.includes(sum.map) && X.DIFFS.includes(sum.diff)) S.best('best.time.' + sum.map + '.' + sum.diff, sum.time);
    S.commit();
  }

  /**
   * A mark on the Expedition board (per map + difficulty). D0b's score is the time survived; D3's Classic runs send the
   * study's Classic score (G.ExpClassic.score); D9 brings the boards' UI and the tiers. -> {ok, better, best, rank} | {error}
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

  return { dv, XV, READS, init, submitScore, leaderboard, record, enterZone, xblock, applyX, viewAir, hostAir, guestAir,
    get run() { return cur; }, get inited() { return inited; } };
})();
