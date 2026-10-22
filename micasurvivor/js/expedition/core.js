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
 */
G.Exp = (() => {
  const dv = 4;   // this file's content version (D3: Classic playable; D4: the League; D5: level-ups and items): G.Expedition.DV must match (the loader refuses a stale cache)
  const X = G.Expedition;
  let inited = false, cur = null;
  const XV = 5;   // the `x` block's schema (G.ExpTerrain.XV): bump it (and keep a reader for the old one) when it grows
  const READS = [1, 2, 3, 4, 5];   // the schemas applyX / viewAir read (v1: D1's terrain only; v2: + air; v3: + the timeline `c`; v4: + the League `l`; v5: + the bag `u`)
  const C = () => G.ExpClassic;
  const LG = () => G.ExpLeague;
  const LV = () => G.ExpLevel, IT = () => G.ExpItems, MV = () => G.ExpMoves;
  const expRun = () => G.Modes.isExp();

  function init() {
    if (inited) return;
    inited = true;
    G.Hooks.on('run.start', cfg => {
      if (!expRun()) { if (C()) C().reset(); if (LG()) LG().reset(); if (LV()) LV().reset(); return; }
      cur = { mode: cfg.mode, dv: cfg.dv, map: cfg.map, diff: cfg.diff, zone: 0, th: '' };
      enterZone(1);
      if (cfg.mode === 'exp-classic' && C()) C().begin(cfg);   // (D3)
      if (LG()) LG().begin(G.Game.player, cfg);                 // (D4: the League member)
      if (LV()) LV().begin(G.Game.player);                      // (D5: the curve, the tools, the bag)
    });
    // (D4: a League run's level-ups: kit moves, evolutions and their choice, Maturity; a base run gets undefined / its cards)
    // (D5: then the Expedition's own cards, rarity-rolled: G.ExpLevel.offer; it adds the League's note itself)
    G.Hooks.on('levelup.offer', (pl, n) => { const b = LG() ? LG().offerHook(pl) : undefined; return b !== undefined ? b : LV() ? LV().offer(pl, n) : undefined; });
    G.Hooks.on('levelup.cards', (cards, pl) => (LG() ? LG().cardsHook(cards, pl) : cards));
    // (D5: the XP curve, the items, the procs, the new archetypes; each listener leaves a base run / another player alone)
    G.Hooks.on('xp.need', (v, L) => (LV() ? LV().xpNeed(v, L) : v));
    G.Hooks.on('item.roll', pl => (expRun() && LV() ? LV().itemRoll(pl) : undefined));
    G.Hooks.on('item.take', (pl, id) => (LV() ? LV().itemTake(pl, id) : undefined));
    G.Hooks.on('player.hurt', (d, pl, type) => (IT() ? IT().hurt(d, pl, type) : d));
    G.Hooks.on('player.ko', pl => { if (IT()) IT().ko(pl); });
    G.Hooks.on('player.dealt', (pl, d) => { if (IT()) IT().dealt(pl, d); });
    G.Hooks.on('combat.out', (k, pl, e, src, dmg) => (IT() ? IT().out(k, pl, e, src, dmg) : k));
    G.Hooks.on('combat.run', (pl, m, ghost) => { if (MV()) MV().run(pl, m, ghost); });
    G.Hooks.on('combat.ghost', (pl, id, lvl, aim) => { if (MV()) MV().ghost(pl, id, lvl, aim); });
    G.Hooks.on('run.tick', (dt, pl) => { if (!expRun()) return; if (MV()) MV().tick(dt); if (IT()) IT().tick(dt, pl); if (LV()) LV().tick(dt); });
    G.Hooks.on('replay.header', h => {
      if (!expRun()) return h;
      const R = G.Modes.run;
      h.dv = R.dv; h.map = R.map; h.diff = R.diff;
      return h;
    });
    G.Hooks.on('spectate.snap', s => {
      if (expRun()) { s.dv = G.Modes.run.dv; const x = xblock(); if (x) { x.a = airSnap(s); const c = C() && C().xblockC(); if (c) x.c = c; const l = leagueSnap(); if (l) x.l = l; const u = bagSnap(); if (u) x.u = u; s.x = x; } }
      return s;
    });
    // (a host frame: m is the guest it goes to; a guest's frame to the host: m is null. A guest's run may not be an
    // Expedition one on its side yet (co-op starts are still base), so a guest goes by the zone the host gave it.)
    G.Hooks.on('net.frame', (f, m) => {
      if (expRun() || (!m && G.World.zone)) {
        const x = xblock();
        if (x) { x.a = m ? airHost(m) : airGuest(); const c = m && C() && C().xblockC(); if (c) x.c = c; const l = m ? leagueHost(m) : leagueGuest(); if (l) x.l = l; const u = m ? bagHost(m) : bagGuest(); if (u) x.u = u; f.x = x; }
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
    liftEnemies(a && a.e);
    if (C()) C().applyC(x && READS.includes(x.xv) && x.xv >= 3 ? x.c || null : null);   // (D3: the timeline state)
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
    liftEnemies(a.e);
    if (C()) C().applyC(x.xv >= 3 ? x.c || null : null);   // (D3: the timeline state)
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
