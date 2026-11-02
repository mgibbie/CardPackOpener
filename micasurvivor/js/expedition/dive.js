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
 * Determinism: the floors, the groups' species and the lost Pokémon come from G.DLC.rng streams of {seed, route, floor};
 * combat stays Math.random, as in base. Viewers rebuild a floor from the zone block (core.js applyX: classic.build).
 */
G.I18n.add({
  '— Piso {x} · {x} —': '— Floor {x} · {x} —',
  'B{x}F': 'F{x}', 'PISO {x}': 'FLOOR {x}',
  '{x} asegurado · {x} en juego': '{x} secured · {x} at stake',
  '¡Alfa! Derrótalo para abrir las escaleras': 'An alpha! Beat it to open the stairs',
  '¡Alfa derrotado! Botín asegurado': 'Alpha defeated! Loot secured',
  '¡Alfa derrotado! Las escaleras están libres': 'Alpha defeated! The stairs are clear',
  '¡{x}, el guardián de la ruta!': '{x}, the route\'s guardian!',
  '¡Guardián derrotado! Etapa guardada': 'Guardian defeated! Stage saved',
  '¡{x} rescatado!': '{x} rescued!',
  'Cuerda Huida: quédate quieto…': 'Escape Rope: hold still…',
  '¡Escapas con todo!': 'You escape with everything!',
  'Escaleras selladas': 'The stairs are sealed',
  'ESCALERAS': 'STAIRS', 'CUERDA': 'ROPE',
  'Inmersión · {x}: piso {x}': 'Dive · {x}: floor {x}',
  'Botín asegurado: {x} · en juego: {x}': 'Loot secured: {x} · at stake: {x}',
  'Escapaste: te llevas todo el botín': 'You escaped: you keep all the loot',
  'Caíste: conservas lo asegurado y una cuarta parte del resto': 'You fell: you keep what was secured and a quarter of the rest',
  'Rescatados: {x}': 'Rescued: {x}', 'Alfas: {x} · Guardianes: {x}': 'Alphas: {x} · Guardians: {x}',
  '¡Nuevo récord en {x}: piso {x}!': 'New record on {x}: floor {x}!',
  'Bosque Musgoso': 'Mossy Woods', 'Cañón Dorado': 'Golden Canyon', 'Cráter Ascua': 'Ember Crater', 'Arrecife Hundido': 'Sunken Reef',
  'Gruta Helada': 'Frost Grotto', 'Pantano Lúgubre': 'Gloom Marsh', 'Ruinas Olvidadas': 'Forgotten Ruins', 'Bosque Fúngico': 'Fungal Grove'
});

G.ExpDive = (() => {
  const K = {
    STAIRS_R: 0.9, STAIRS_T: 0.5,      // tiles / s on the stairs to go down
    ROPE_R: 1.6, ROPE_T: 3,            // the rope circle (tiles), s standing still in it
    WAKE_R: 7,                         // tiles: a sleeping group wakes when you come this close (or one of it is hit)
    RESCUE_R: 1.2,                     // tiles: reach the lost Pokémon
    GROUP: [2, 6], GUARD_PLUS: 1,      // foes a group (grows with depth), a guard group +1
    SIGMA: 45, TYPE_BIAS: 2,           // the species curve
    T_PER_FLOOR: 18,                   // s of "run time" a floor is worth for the base stat curves (G.Enemies.scale)
    HP_K: 3.3, DMG_K: 2.4, XP_K: 5.6,  // as Classic (js/expedition/classic.js K)
    ALPHA: { scale: 1.45, hp: 9, dmg: 1.5, xp: 8 },
    GUARD: { scale: 1.9, hp: 70, dmg: 1.8, xp: 30 },
    LOOT: { ko: 1, koPer: 0.1, rescue: 12, rescuePer: 1, alpha: 25, alphaPer: 2, guard: 150, guardPer: 4, floor: 3, floorPer: 0.2 },
    FAINT_KEEP: 0.25
  };
  const NAME = { forest: 'Bosque Musgoso', canyon: 'Cañón Dorado', crater: 'Cráter Ascua', reef: 'Arrecife Hundido',
                 grotto: 'Gruta Helada', marsh: 'Pantano Lúgubre', ruins: 'Ruinas Olvidadas', fungal: 'Bosque Fúngico' };
  // each route's 4 guardians (floor 25, 50, 75, 100, then again), PokéDive's choice where it had one
  const GUARDIANS = {
    forest: [251, 492, 787, 151], canyon: [383, 645, 377, 718], crater: [244, 146, 485, 250], reef: [382, 249, 245, 490],
    grotto: [144, 378, 646, 896], marsh: [491, 717, 1015, 890], ruins: [480, 482, 481, 487], fungal: [786, 788, 801, 893]
  };
  const DG = () => G.DiveGen;
  const T = () => G.I18n;
  const TS = () => G.World.TS;
  let S = null;
  const on = () => !!(S && G.Modes.is('exp-dive'));
  const routeOf = map => (typeof map === 'string' && map.startsWith('dive:') && DG().ROUTES[map.slice(5)] ? map.slice(5) : 'forest');
  const say = (t, s = 3) => G.Spawner.say(t, s);
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

  // ---------------- the run ----------------
  function begin(cfg) {
    const route = routeOf(cfg.map);
    S = { route, floor: 0, seed: G.World.seed | 0, bank: 0, stake: 0, rescued: [], rescuedBank: 0, kills: 0, alphas: 0, guardians: 0,
          ended: false, escaped: false, groups: [], boss: null, stairsT: 0, ropeT: 0, ropeHurt: false, lost: null, deepest: 0, t0: 0 };
    startFloor(1, 0);
    return S;
  }
  function reset() { S = null; pools.clear(); }

  /** The floor's foes, the lost Pokémon, the alpha / guardian (the zone is already set: core.js enterZone). */
  function startFloor(f, t) {
    const L = G.World.zone && G.World.zone.dive;
    Object.assign(S, { floor: f, ft: t, L, groups: [], boss: null, stairsT: 0, ropeT: 0, lost: null, sealed: false });
    S.deepest = Math.max(S.deepest, f);
    if (!L) return;
    const r = rng(S.route, f, 0xD1), P = pool(S.route, f);
    const n = Math.min(K.GROUP[1], K.GROUP[0] + Math.floor(f / 8));
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
      if (e) { S.boss = e; S.sealed = true; pre.push(dex); say(T().f('¡{x}, el guardián de la ruta!', e.name), 3.6); G.Audio.sfx('surge'); }
    } else if (L.cadence.arena) {
      const ar = rng(S.route, f, 0xA1), [x, y] = wpos(L.path[Math.max(0, L.path.length - 5)]);
      const dex = draw(pool(S.route, f + 4), ar);
      const e = spawn(dex, x, y, t, { alpha: true });
      if (e) { S.boss = e; S.sealed = true; pre.push(dex); say(T().t('¡Alfa! Derrótalo para abrir las escaleras'), 3.4); }
    }
    G.Sprites.preload(pre, 8000);
    if (!L.cadence.guardian && !L.cadence.arena) say(T().f('— Piso {x} · {x} —', f, T().t(NAME[S.route])), 2.8);
  }

  /** A foe of this floor. o: {alpha, boss} -> the enemy */
  function spawn(dex, x, y, t, o) {
    const C = G.ExpClassic, f = S.floor, teff = f * K.T_PER_FLOOR;
    const ti = G.U.clamp(Math.floor((target(f) - 260) / 72), 0, 5);
    const def = C.defOf(dex, ti);
    const sc = G.Enemies.scale(teff), n = Math.max(1, G.Game.everyone ? G.Game.everyone().length : 1);
    const X = o.boss ? K.GUARD : o.alpha ? K.ALPHA : null;
    const hp = sc.hp * G.Coop.scaleHp(n) * (K.HP_K + Math.min(1.7, teff / 210)) * (X ? X.hp : 1);
    const e = new G.Enemy(def, x, y, { hp, dmg: sc.dmg, spd: sc.spd }, !!o.boss);
    e.dmg *= K.DMG_K * (X ? X.dmg : 1);
    e.xp = Math.round(e.xp * K.XP_K * (X ? X.xp : 1));
    if (X) {
      e.scale = X.scale; e.anim = new G.Sprites.Animator(e.dex, X.scale, e.shiny);
      e.r = G.Sprites.bodyRadius(e.dex, X.scale); e.bodyH = G.Sprites.bodyHeight(e.dex, X.scale);
      e.xk = o.boss ? 'guardian' : 'alpha';   // (not G.ExpCap.mark: a Dive alpha FALLS, it doesn't faint at 1 HP for the Friend Ball)
    }
    if (!o.boss && !o.alpha) e.xmove = sleeper;
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
    // the lost Pokémon
    if (S.lost && !S.lost.done && alive.some(p => G.U.dist2(p.x, p.y, S.lost.x, S.lost.y) < (K.RESCUE_R * R) ** 2)) rescue();
    // the alpha / guardian down
    if (S.boss && S.boss.dead) bossDown();
    const L = S.L;
    // the rope (on a rope floor): stand still in the circle by the spawn
    if (L.cadence.rope) {
      const pl = alive[0], [rx, ry] = wpos(L.spawn), inR = G.U.dist2(pl.x, pl.y, rx, ry) < (K.ROPE_R * R) ** 2;
      const still = S.ropeAt && G.U.dist2(pl.x, pl.y, S.ropeAt[0], S.ropeAt[1]) < 4;
      if (inR && still && !S.ropeHurt) {
        if (S.ropeT === 0) say(T().t('Cuerda Huida: quédate quieto…'), K.ROPE_T);
        S.ropeT += dt;
        if (S.ropeT >= K.ROPE_T) { escape(); return; }
      } else S.ropeT = 0;
      S.ropeAt = [pl.x, pl.y]; S.ropeHurt = false;
    }
    // the stairs
    const [sx, sy] = wpos(L.stairs), onS = alive.some(p => G.U.dist2(p.x, p.y, sx, sy) < (K.STAIRS_R * R) ** 2);
    if (onS && S.sealed) { if (!S.sealSaid) { S.sealSaid = true; say(T().t('Escaleras selladas'), 2); G.Audio.sfx('error'); } }
    else if (!onS) S.sealSaid = false;
    S.stairsT = onS && !S.sealed ? S.stairsT + dt : 0;
    if (S.stairsT >= K.STAIRS_T) nextFloor(t, players);
  }

  function loot(n) { if (n > 0 && S) S.stake += Math.round(n); }
  function secure() { S.bank += S.stake; S.stake = 0; S.rescuedBank = S.rescued.length; }
  function rescue() {
    S.lost.done = true;
    S.rescued.push(S.lost.dex);
    loot(K.LOOT.rescue + K.LOOT.rescuePer * S.floor);
    say(T().f('¡{x} rescatado!', G.DEX_BY[S.lost.dex].name), 2.4);
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
  }

  // ---------------- the end ----------------
  /** The run's Pokémonedas (bank + stake on an escape, + a quarter of it on a faint). */
  const pay = () => (S ? S.bank + (S.escaped ? S.stake : Math.floor(S.stake * K.FAINT_KEEP)) : 0);
  function scoreParts(sum) {
    return { floor: S.floor, deepest: S.deepest, route: S.route, kills: sum.kills || 0, time: sum.time || 0, alphas: S.alphas, guardians: S.guardians,
             rescued: S.escaped ? S.rescued.length : S.rescuedBank, escaped: S.escaped, divePay: pay(), zone: Math.min(4, 1 + Math.floor(S.floor / 10)) };
  }
  function result() {
    const lines = [T().f('Inmersión · {x}: piso {x}', T().t(NAME[S.route]), S.floor),
      T().f('Botín asegurado: {x} · en juego: {x}', S.bank, S.stake),
      T().t(S.escaped ? 'Escapaste: te llevas todo el botín' : 'Caíste: conservas lo asegurado y una cuarta parte del resto'),
      T().f('Rescatados: {x}', S.escaped ? S.rescued.length : S.rescuedBank), T().f('Alfas: {x} · Guardianes: {x}', S.alphas, S.guardians)];
    return { lines, title: S.escaped ? T().t('¡Escapas con todo!') : null, won: S.escaped };
  }
  /** Into the Expedition save: the deepest floor and the stage per route, the counters. -> lines */
  function record() {
    const X = G.ExpSave, out = [];
    if (!X || !S) return out;
    const k = 'dive.' + S.route;
    X.bump('dive.runs');
    if (S.escaped) X.bump('dive.escapes');
    if (S.deepest > (X.get(k + '.best') || 0)) out.push(T().f('¡Nuevo récord en {x}: piso {x}!', T().t(NAME[S.route]), S.deepest));
    X.best(k + '.best', S.deepest);
    if (S.stage) X.best(k + '.stage', S.stage);
    X.bump('dive.rescued', S.escaped ? S.rescued.length : S.rescuedBank);
    X.commit();
    return out;
  }

  // ---------------- drawing ----------------
  function drawGround(ctx) {
    if (!S || !G.World.zone || !G.World.zone.dive) return;
    const L = G.World.zone.dive, now = performance.now() / 1000, cam = G.Camera, R = TS();
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
      lo.anim.update(1 / 60); lo.anim.loop('Idle');
      ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#7fe0ff';
      ctx.beginPath(); ctx.ellipse(lo.x, lo.y, R * 0.9, R * 0.45, 0, 0, 6.2832); ctx.fill(); ctx.restore();
      lo.anim.draw(ctx, lo.x, lo.y);
      ctx.save(); ctx.font = '800 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffd23f';
      ctx.fillText('!', lo.x, lo.y - 30 - Math.abs(Math.sin(now * 4)) * 4); ctx.restore();
    }
  }
  function hudLine() {
    if (!S) return '';
    return T().f('PISO {x}', S.floor) + ' · ' + T().t(NAME[S.route]).toUpperCase() + ' · ' + T().f('{x} asegurado · {x} en juego', S.bank, S.stake);
  }
  const hudColor = () => (S && S.sealed ? '#ff9a6b' : S && S.ropeT > 0 ? '#b48aff' : '#9fd8ff');
  function drawHud(ctx, w, h, pl, st, F) {
    if (!S) return;
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
    if (!S || !G.World.zone || !G.World.zone.dive) return;
    const L = G.World.zone.dive, pts = [[wpos(L.stairs), S.sealed ? '#ff6b7a' : '#ffd23f']];
    if (S.lost && !S.lost.done) pts.push([[S.lost.x, S.lost.y], '#7fe0ff']);
    for (const [[x, y], col] of pts) {
      const q = api.edge(api.pt(x, y));
      ctx.save(); ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(q.x - 3, q.y - 3, 6, 6); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }

  return { K, NAME, GUARDIANS, target, pool, guardianOf, routeOf, begin, reset, update, hurt, onKill, pay, scoreParts, result, record,
           drawGround, drawHud, drawMini, hudLine, hudColor, on, get run() { return S; } };
})();
