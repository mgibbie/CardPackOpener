/* ============ ui/watch-ui.js — the spectator view and the replay player (MicaSurvivor M5 batch 12c, not upstream) ============
 * One read-only renderer for both: a friend's live run (js/mica/spectate.js) and a recorded run
 * (js/mica/replay.js). It draws on the game's own canvas with the game's own pieces: the world (the run's seed,
 * biome and rift arena), the Pokémon as puppets (G.Player / G.EnemyMgr.addRemote copies that never think), the
 * pickups, harmless "ghost" attacks (G.Combat.ghostCast, as co-op partners' attacks are drawn), the HUD (HP, level,
 * XP, clock, moves, items, boss bar) and the minimap; plus its own line for what the HUD leaves out for a watched
 * player (Z-move, Dynamax, co-op partners, the level-up screen being open). Nothing you press reaches the run: in
 * this state the game reads no keys but Esc (leave) and, in a replay, Space (play / pause).
 *
 *   Motion: snapshots come once a second (live) or every 0.5 s of run time (replay); positions glide between the
 *   last two (live: one interval behind; replay: exactly between frame i and i+1 at the playback clock).
 *   URLs: /micasurvivor/?watch=<user> (live; needs your Magepunk login and that you are friends) and
 *   /micasurvivor/?replay=<id> (public; /msr/<id> redirects there). Leave goes back to the menu.
 *   U4 (replay format v2, js/mica/replay.js): a replay is a SESSION of segments (a v1 tape is a session of one). The
 *   player seeks by segment (a binary search on the index; a segment not here yet is fetched, the clock waiting on
 *   it; the next one is fetched ahead) and then from the segment's nearest checkpoint. A session of several players
 *   can follow any of them ("Following: <name>": the button, F / Tab / 1-4, or LB / RB on a pad): that player's
 *   Pokémon, HUD and camera; everyone else drawn as partners with their names and HP. Every player's recorded casts
 *   are drawn as ghosts, where they aimed (a v1 tape has none: its watched Pokémon's ghosts aim at the nearest foe).
 *   MP polish: the LIVE view is on the same model: a snapshot of several players (pp / pr / pz / cs, js/mica/spectate.js
 *   pubSnap) is seen from the player followed through G.Replay.liveView (the replay reader's own pov()), so live too every
 *   player is drawn, every player's casts are ghosts and "Following: <name>" (the bar's button, F / Tab / 1-4, LB / RB)
 *   moves the view onto anyone. A snapshot without pp (an older publisher) shows as before (v1 partner rows, no switch).
 *   Every partner's line says its level, its Ultimate's charge and its Z-move / Dynamax (when its row has them), with its
 *   held items as icons.
 */
G.WatchUI = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const q = new URLSearchParams(location.search);
  const WATCH_RE = /^[a-z0-9_.-]{1,40}$/, ID_RE = /^[a-f0-9]{8,20}$/;
  const pending = q.get('watch') && WATCH_RE.test(q.get('watch').toLowerCase()) ? { kind: 'live', arg: q.get('watch').toLowerCase() }
                : q.get('replay') && ID_RE.test(q.get('replay')) ? { kind: 'replay', arg: q.get('replay') } : null;
  const SPEEDS = [1, 2, 4];
  const MATE_COL = ['#ffcb3d', '#5fc8ff', '#7ee07a', '#ff8ad8'];

  let mode = null;         // null | 'live' | 'replay'
  let notice = '';         // DLC D0b: the "newer Expedition version" notice shown for this view ('' = none)
  let who = '', title = '', onLeave = null;
  let pl = null, dexNow = 0;
  const mates = new Map(); // name -> { p: G.Player, from, to, kind, ctrl }
  const ents = new Map();  // enemy id -> { fx, fy, tx, ty }
  let A = null, B = null;  // the frame being shown and the next one
  let timeNow = 0, worldSeed = null, worldBiome = -1, arenaKey = '', zoneKey = '';
  let movesKey = '', castT = new Map();
  // live
  let arriveAt = 0, interval = 1000, lastW = 0, status = 'wait', ended = null, info = {};
  // replay
  let rd = null, T = 0, idx = 0, playing = true, speed = 1, evAt = 0, done = false, shared = null;
  // U4: the session, the segment playing, whose view, the segment being fetched, the casts of the interval shown
  let ss = null, segK = -1, follow = 0, loading = null, castQ = [];
  // MP polish: live, the last two snapshots as they came (seen again from another player when the view switches), their players
  let liveA = null, liveB = null, livePP = null;
  /** The players whose view can be followed: the session's (a replay) or the live snapshot's (MP polish). */
  const playersNow = () => (ss ? ss.players : livePP) || [];
  const stats = { snaps: 0, frames: 0, casts: 0, segLoads: 0 };

  // ---------------- building the puppets from a snapshot ----------------

  function puppet(dex, shiny) {
    const mon = G.DEX_BY[dex] || G.DEX_BY[25];
    const p = new G.Player(mon, {}, !!shiny);
    p.remote = true;
    G.Sprites.preload([mon.dex], 8000, p.shiny);
    return p;
  }

  function world(s) {
    if (s.sd != null && s.sd !== worldSeed) { worldSeed = s.sd; G.World.reset(s.sd); worldBiome = -1; G.Minimap.reset(); }
    if (s.b != null && s.b !== worldBiome) { G.World.setBiome(s.b, worldBiome < 0); worldBiome = s.b; }
    const ak = s.ar ? s.ar.join(',') : '';
    if (ak !== arenaKey) { arenaKey = ak; G.World.setArena(s.ar ? { tx: s.ar[0], ty: s.ar[1], r: s.ar[2], type: s.ar[3] } : null); }
    // DLC D1: an Expedition run's terrain is rebuilt here from the seed + its `x` block (map, zone), never streamed
    // (G.Expedition.viewZone loads the Expedition code first if needed). A base snapshot has no `x`: nothing happens.
    const zk = s.x ? [s.sd, s.x.xv, s.x.m, s.x.z].join(':') : '';
    if (zk !== zoneKey) { zoneKey = zk; if (G.Expedition) G.Expedition.viewZone(s.sd, s.x || null); }
  }

  function setMoves(s) {
    const key = JSON.stringify(s.mv || []) + '|' + (s.ac | 0) + '|' + (s.af | 0) + '|' + (s.sg || []).join(',');
    if (key === movesKey) return;
    movesKey = key;
    G.Projectiles.clearOrbs(pl);
    pl.moves = (s.mv || []).filter(m => G.Moves.BY_ID[m[0]]).map(m => { const x = G.Moves.instance(m[0], m[1] || 1); if (m[2]) G.Moves.evolve(x); return x; });
    // (DLC D16: a new tape / snapshot fires every move (af) and may group a bond's fused slot (sg); an old one shows its
    //  active move alone, as it was recorded)
    pl.af = !!s.af;
    pl.slots = pl.moves.map(m => [m]);
    if (pl.af && Array.isArray(s.sg) && s.sg.reduce((a, b) => a + (b | 0), 0) === pl.moves.length) {
      let i = 0;
      pl.slots = s.sg.map(n => pl.moves.slice(i, (i += n | 0)));
    }
    pl.active = pl.af ? 0 : Math.min(s.ac | 0, Math.max(0, pl.slots.length - 1));
  }

  /** Shows frame `a` (what exists, its fields) gliding towards `b` (positions). */
  function setFrame(a, b, exact) {
    A = a; B = b || a;
    const ex = !!exact || B === a;   // glide from frame a itself (a replay) or from where things are drawn now (live)
    world(a);
    // (the props the run broke and the altars it used: the tape's field 15 / a live snapshot's wp. Owner bug 2026-11-02)
    if (a.wp) G.World.viewProps(a.wp);
    // your Pokémon
    if (!pl || dexNow !== a.me[0]) {
      pl = puppet(a.me[0], a.me[1]); dexNow = a.me[0]; movesKey = ''; castT = new Map();
      pl.x = a.p[0]; pl.y = a.p[1];
      G.Game.watchPlayer(pl);
      G.Camera.x = pl.x; G.Camera.y = pl.y;
    }
    const P = a.p, F = P[6];
    pl.from = ex ? [P[0], P[1]] : [pl.x, pl.y]; pl.to = [B.p[0], B.p[1]];
    if (P[4] < pl.hp - 0.5 && !(F & 1)) pl.flash = 0.14;
    pl.hp = P[4]; pl.maxHp = P[5] || 1;
    pl.level = a.lv[0]; pl.xp = a.lv[1]; pl.xpNext = a.lv[2] || 1;
    pl.kills = a.k | 0; pl.bosses = a.bo | 0; pl.coins = a.co | 0;
    pl.item = a.it && a.it[0] || null; pl.item2 = a.it && a.it[1] || null;
    pl.walking = !!(F & 2);
    pl.coopDown = !!(F & 8); pl.zHidden = !!(F & 16);
    pl.dyn = !!(F & 4);
    pl.dynScale = a.ds ? [a.ds[0] / 100, a.ds[1] / 100] : null;
    pl.anim.dir = P[2] | 0;
    if ((F & 1) && !pl.dead) { pl.dead = true; pl.anim.play('Faint', { hold: true }); G.Projectiles.clearOrbs(pl); }
    else if (!(F & 1) && pl.dead) { pl.dead = false; pl.anim.loop('Idle'); }
    const an = G.Spectate.ANIMS[P[3]];
    if (an && an !== pl.lastAnim && ['Attack', 'Shoot', 'Charge', 'Hurt'].includes(an)) pl.anim.play(an, { speed: 1.3 });
    pl.lastAnim = an;
    setMoves(a);
    // co-op partners (online and local)
    const seen = new Set();
    for (const m of a.mt || []) {
      const v2 = m[9] === 'v';   // (U4: a v2 replay's player row, by slot: [..., 'v', colour, slot, moves])
      const name = v2 ? m[0] : m[9] === 'l' ? G.T((m[10] ? '{x} · J2' : '{x} · IA').replace('{x}', m[0])) : m[0];
      const key = v2 ? 'v' + m[11] : name;
      seen.add(key);
      let o = mates.get(key);
      if (!o || o.p.dex !== m[1]) {
        o = { p: puppet(m[1], m[2]) };
        o.p.x = m[3]; o.p.y = m[4];
        o.p.tag = name;
        o.p.tagColor = m[9] === 'l' ? (G.LocalCoop && G.LocalCoop.COLOR) || '#9ad0ff' : MATE_COL[m[10] | 0] || '#fff';
        mates.set(key, o);
      }
      o.raw = m[0];   // (DLC D2: its name in the x block's air rows)
      o.slot = v2 ? m[11] : null;
      o.info = v2 && m[13] && typeof m[13] === 'object' ? m[13] : null;   // (MP polish: level, held items, the Ultimate's charge, the kit flags)
      if (v2 && Array.isArray(m[12])) mateMoves(o, m[12]);
      const nb = (B.mt || []).find(x => (v2 ? x[9] === 'v' && x[11] === m[11] : x[0] === m[0] && x[9] === m[9])) || m;
      o.from = ex ? [m[3], m[4]] : [o.p.x, o.p.y]; o.to = [nb[3], nb[4]];
      o.p.hp = m[5]; o.p.maxHp = m[6] || 1; o.kind = m[9]; o.ctrl = m[10];
      o.p.walking = !!(m[7] & 2); o.p.anim.dir = m[8] | 0;
      if ((m[7] & 1) && !o.p.dead) { o.p.dead = true; o.p.anim.play('Faint', { hold: true }); }
      else if (!(m[7] & 1) && o.p.dead) { o.p.dead = false; o.p.anim.loop('Idle'); }
    }
    for (const k of [...mates.keys()]) if (!seen.has(k)) mates.delete(k);
    // in an online group, the watched player's name over its head too (U4: a session's followed player, its own name)
    const group = (a.mt || []).some(m => m[9] === 'o');
    const fol = a.pi != null && playersNow()[a.pi];
    pl.tag = fol && (a.mt || []).length ? fol.name || null : group ? who || null : null; pl.tagColor = fol && a.pi ? MATE_COL[fol.c | 0] || '#ffffff' : '#ffffff';
    pl.slot = a.pi != null ? a.pi : 0;
    // enemies
    const bmap = new Map((B.e || []).map(e => [e[0], e]));
    const now = new Set();
    const kd = new Set(a.kd || []);
    for (const r of a.e || []) {
      now.add(r[0]);
      let e = G.EnemyMgr.get(r[0]);
      if (e && e.dead) { G.EnemyMgr.removeRemote(r[0], false); e = null; }
      if (!e) {
        e = G.EnemyMgr.addRemote({ id: r[0], dex: r[1], x: r[2], y: r[3], boss: !!(r[6] & 1), shiny: !!(r[6] & 2), hp: r[5] || 1, dmg: 1, beh: 'remote' });
        if (r[6] & 32) e.den = true;
        if (r[6] & 64) e.judge = true;
      }
      const nb = bmap.get(r[0]) || r;
      const t = ents.get(r[0]) || {};
      t.fx = ex || t.tx == null ? r[2] : e.x; t.fy = ex || t.ty == null ? r[3] : e.y; t.tx = nb[2]; t.ty = nb[3];
      ents.set(r[0], t);
      e.maxHp = r[5] || 1;
      const hp = Math.max(1, Math.round(e.maxHp * r[4] / 100));
      if (hp < e.hp - 0.5) e.flash = 0.08;
      e.hp = hp;
      e.net = e.net || {};
      e.net.st = ((r[6] & 4) ? 1 : 0) | ((r[6] & 8) ? 2 : 0) | ((r[6] & 16) ? 4 : 0);
      if (r[7] != null) {
        e.anim.dir = r[7] & 7;
        const ea = G.Spectate.ANIMS[r[7] >> 3];
        if (ea !== e.lastNetAnim) { e.lastNetAnim = ea; if (ea && !['Idle', 'Walk', 'Faint'].includes(ea)) e.anim.play(ea, { speed: 1.4 }); }
      } else {
        // (a replay does not record an enemy's facing: it faces where it walks)
        const dx = nb[2] - r[2], dy = nb[3] - r[3];
        if (Math.abs(dx) + Math.abs(dy) > 2) e.anim.dir = G.Sprites.dirFromAngle(Math.atan2(dy, dx));
      }
    }
    for (const e of G.EnemyMgr.all().slice()) {
      if (!e.remote || now.has(e.id) || e.dead) continue;
      ents.delete(e.id);
      if (kd.has(e.id)) e.die();              // (the effects, sound and Faint of a copy: no loot, no missions)
      else G.EnemyMgr.removeRemote(e.id, false);
    }
    // pickups (static between frames)
    const want = new Map((a.pk || []).map(k => [k[0], k]));
    for (const o of G.Pickups.all().slice()) {
      const k = want.get(o.id);
      if (!k) G.Pickups.removeId(o.id);
      else { o.x = k[2]; o.y = k[3]; want.delete(o.id); }
    }
    for (const k of want.values()) { const [kind, value] = G.Spectate.pickupKind(k[1]); G.Pickups.addRemote(k[0], kind, k[2], k[3], value); }
    // DLC D2: an Expedition snapshot's airborne state (hops, glides, bounce pads, slides, surf) on the puppets (x.a).
    // A base snapshot has no `x`: nothing happens.
    if (a.x && G.Exp && G.Exp.viewAir) G.Exp.viewAir(a, pl, mates);
    timeNow = a.t / 10;
  }

  /** Between A and B: 0..1. */
  function blend(al) {
    al = G.U.clamp(al, 0, 1);
    if (pl && pl.from) { pl.x = pl.from[0] + (pl.to[0] - pl.from[0]) * al; pl.y = pl.from[1] + (pl.to[1] - pl.from[1]) * al; }
    for (const o of mates.values()) if (o.from) { o.p.x = o.from[0] + (o.to[0] - o.from[0]) * al; o.p.y = o.from[1] + (o.to[1] - o.from[1]) * al; }
    for (const [id, t] of ents) {
      const e = G.EnemyMgr.get(id);
      if (!e || e.dead) continue;
      e.x = t.fx + (t.tx - t.fx) * al; e.y = t.fy + (t.ty - t.fy) * al;
      e.moving = Math.abs(t.tx - t.fx) + Math.abs(t.ty - t.fy) > 3;
    }
    if (A && B && B !== A) timeNow = (A.t + (B.t - A.t) * al) / 10;
  }

  /** Each frame in the watch state (game.js frame). */
  function tick(dt) {
    if (!mode) return;
    if (mode === 'live') {
      if (A) blend((performance.now() - arriveAt) / interval);
      fireCasts();   // (MP polish: a live snapshot of several players carries everyone's casts)
    } else if (ss && !done) {
      if (playing && loading == null) T = Math.min(ss.duration, T + dt * speed);
      seekTo(T, false);
      fireCasts();
      if (T >= ss.duration && playing && loading == null) finishReplay();
      ctrlTick();
    }
    animate(dt);
  }

  function animate(dt) {
    if (pl) {
      pl.anim.update(dt);
      if (pl.flash > 0) pl.flash -= dt;
      if (!pl.dead) pl.anim.loop(pl.walking ? 'Walk' : 'Idle', pl.walking ? pl.baseSpd / 110 : 1);
      ghosts(dt);
      const tgt = pl.coopDown && mates.size ? [...mates.values()].find(o => o.kind === 'l') : null;
      G.Camera.follow(tgt ? tgt.p.x : pl.x, tgt ? tgt.p.y : pl.y, dt);
    }
    for (const o of mates.values()) {
      o.p.anim.update(dt);
      if (!o.p.dead) o.p.anim.loop(o.p.walking ? 'Walk' : 'Idle');
    }
    for (const e of G.EnemyMgr.all().slice()) {
      if (!e.remote) continue;
      e.anim.update(dt);
      if (e.flash > 0) e.flash -= dt;
      e.bob += dt * 6;
      if (e.dead) { e.fade -= dt; if (e.fade <= 0) G.EnemyMgr.removeRemote(e.id, false); continue; }
      if (e.shiny) { e.sparkT -= dt; if (e.sparkT <= 0) { e.sparkT = 0.22; G.FX.twinkle(e.x + G.U.rand(-e.r, e.r) * 1.2, e.y - G.U.rand(4, e.bodyH * 1.1)); } }
      e.anim.loop(e.moving ? 'Walk' : 'Idle');
    }
    for (const o of G.Pickups.all()) o.t += dt;
    G.Projectiles.update(dt, pl || { x: 0, y: 0 }, G.EnemyMgr.all());
    G.Combat.updateFields(dt);
    G.FX.update(dt);
    G.World.update(dt, G.Camera);
    G.Spawner.tickBanner(dt);
  }

  /** U4: a partner's moves (a v2 row's), for its orbit ghosts. */
  function mateMoves(o, mv) {
    const key = JSON.stringify(mv);
    if (key === o.mvKey) return;
    o.mvKey = key;
    G.Projectiles.clearOrbs(o.p);
    o.p.moves = mv.filter(m => G.Moves.BY_ID[m[0]]).map(m => { const x = G.Moves.instance(m[0], m[1] || 1); if (m[2]) G.Moves.evolve(x); return x; });
    o.p.af = true; o.p.slots = o.p.moves.map(m => [m]); o.p.active = 0;
  }
  /** U4: the recorded casts of the interval shown, each fired as a ghost when the playback clock reaches it. */
  function fireCasts() {
    if (!castQ.length || (mode === 'replay' && !playing)) return;
    const now = (mode === 'live' ? timeNow : T) * 10;
    const keep = [];
    for (const c of castQ) {
      if (c[5] > now) { keep.push(c); continue; }
      const who = c[0] === (pl && pl.slot) ? pl : (([...mates.values()].find(o => o.slot === c[0]) || {}).p);
      if (!who || who.dead || who.zHidden) continue;
      try { G.Combat.ghostCast(who, c[1], c[2], c[3], c[4]); stats.casts++; } catch (e) { /* a visual only */ }
    }
    castQ = keep;
  }

  /** Harmless copies of the watched Pokémon's attacks (like a co-op partner's: they hit nothing). */
  function ghosts(dt) {
    if (!pl || pl.dead || pl.zHidden || pl.coopDown || (mode === 'replay' && !playing)) return;
    // (U4: a v2 replay has every player's real casts (fireCasts): only the orbits are drawn here, everyone's)
    if ((mode === 'replay' && rd && rd.v === 2) || (mode === 'live' && A && A.pi != null)) {   // (MP polish: and a live view of several players)
      try {
        G.Combat.ghostOrbit(pl, dt, timeNow);
        for (const o of mates.values()) if (o.slot != null && !o.p.dead && o.p.moves && o.p.moves.length) G.Combat.ghostOrbit(o.p, dt, timeNow);
      } catch (e) { /* a visual only */ }
      return;
    }
    const g = pl.af ? pl.moves : pl.activeGroup();   // (DLC D16: a new tape / snapshot: every move; an old one: its active slot)
    try {
      G.Combat.ghostOrbit(pl, dt, timeNow);
      for (const m of g) {
        if (m.kind === 'orbit' || m.kind === 'buff') continue;
        let t = castT.has(m.id) ? castT.get(m.id) : Math.random() * (m.cd || 1);
        t -= dt * (mode === 'replay' ? speed : 1);
        if (t <= 0) {
          let best = null, bd = 380 * 380;
          for (const e of G.EnemyMgr.all()) { if (e.dead) continue; const d = G.U.dist2(e.x, e.y, pl.x, pl.y); if (d < bd) { bd = d; best = e; } }
          if (best) { G.Combat.ghostCast(pl, m.id, m.lvl, Math.atan2(best.y - pl.y, best.x - pl.x), m.evolved ? 1 : 0); t = Math.max(0.35, m.cd || 1); }
          else t = 0.4;
        }
        castT.set(m.id, t);
      }
    } catch (e) { /* a visual only */ }
  }

  /** The puppets to draw with the scene (game.js render). */
  function drawables() { return pl ? [pl, ...[...mates.values()].map(o => o.p)] : []; }
  function mateList() { return [...mates.values()].map(o => ({ x: o.p.x, y: o.p.y, color: o.p.tagColor, dead: o.p.dead })); }

  // ---------------- the canvas line (what the HUD leaves out for a watched player) ----------------

  const F = (wt, s) => `${wt} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  function chip(ctx, x, y, txt, col, bg) {
    ctx.font = F(800, 10);
    const tw = ctx.measureText(txt).width + 14;
    ctx.fillStyle = bg || 'rgba(8,12,22,.72)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - tw, y, tw, 18, 9) : ctx.rect(x - tw, y, tw, 18); ctx.fill();
    ctx.fillStyle = col;
    ctx.textAlign = 'left';
    ctx.fillText(txt, x - tw + 7, y + 13);
    return tw;
  }
  /**
   * MP polish: what a partner's line adds from its row (a v2 frame / a live snapshot of several players): its level, its
   * Ultimate's charge (or "casting"), and its Z-move / Dynamax when it has them (ready, in use or recharging).
   */
  function mateKit(info) {
    if (!info) return '';
    const KF = G.Replay.KF, kf = info.kf | 0;
    let t = info.lv ? ' · ' + G.T('Nv.') + ' ' + info.lv : '';
    if (kf & KF.ULT) t += ' · ' + G.T('Definitivo') + ' ' + (kf & KF.ULT_CAST ? G.T('¡En uso!') : (info.u | 0) >= 100 ? G.T('¡Listo!') : (info.u | 0) + '%');
    if (kf & KF.Z) t += ' · Z ' + (kf & KF.Z_ON ? '!' : kf & KF.Z_READY ? '✓' : '…');
    if (kf & KF.DYN) t += ' · MAX ' + (kf & KF.DYN_ON ? '!' : kf & KF.DYN_READY ? '✓' : '…');
    return t;
  }
  function drawOverlay(ctx, w, h) {
    if (!mode) return;
    ctx.save();
    const k = G.Display ? G.Display.ui(w, h) : 1;
    ctx.scale(k, k);
    const W = w / k, Hh = h / k;
    const top = (($('watch-bar') && $('watch-bar').getBoundingClientRect().bottom) || 40) / k + 8;
    let y = top;
    const x = W - 12;
    const s = A;
    if (mode === 'replay' && loading != null) { chip(ctx, x, y, G.T('Cargando…'), '#cfe3ff'); y += 22; }
    if (s) {
      if (s.z) { chip(ctx, x, y, G.T('Movimiento Z') + ': ' + (G.U.TYPE_NAME[s.z[0]] || s.z[0]) + ' · ' + G.T(s.z[1] ? '¡en uso!' : s.z[2] ? 'usado' : 'listo'), '#ffd98a'); y += 22; }
      if (s.dy) { chip(ctx, x, y, 'Dynamax · ' + G.T(s.dy[0] ? '¡activo!' : s.dy[2] ? 'usado' : 'listo'), s.dy[0] ? '#ff8aa8' : '#ffb3c6'); y += 22; }
      if (s.tm) { chip(ctx, x, y, G.T('Equipo') + ': ' + s.tm[1].map(m => ((G.DEX_BY[m[0]] || {}).name || '?') + ' ' + m[1] + '%').join(' · '), '#cfe3ff'); y += 22; }
      for (const o of mates.values()) {
        const pct = Math.round(100 * G.U.clamp(o.p.hp / (o.p.maxHp || 1), 0, 1));
        const tw = chip(ctx, x, y, o.p.tag + ' · ' + (o.p.dead ? G.T('caído') : pct + '%') + mateKit(o.info), o.p.dead ? '#ff8a96' : o.p.tagColor || '#fff');
        // (MP polish: its held items, as icons, left of its line)
        const it = o.info && o.info.it ? o.info.it.filter(id => id && G.Items.BY[id]) : [];
        it.forEach((id, i) => G.Icons.draw(ctx, id, x - tw - 20 - i * 19, y + 1, 16));
        y += 22;
      }
      // the level-up screen (or another choice) is open on their side
      const lu = s.lu;
      const msg = s.dn ? G.T('Ha caído: revive en {x} s').replace('{x}', s.dn)
        : lu === 1 ? G.T('Está eligiendo una mejora…') : lu === 2 ? G.T('Está eligiendo…') : lu === 3 ? G.T('En pausa') : '';
      if (msg) {
        ctx.font = F(800, 14);
        ctx.textAlign = 'center';
        const tw = ctx.measureText(msg).width + 28;
        ctx.fillStyle = 'rgba(8,12,22,.78)';
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(W / 2 - tw / 2, Hh * 0.34, tw, 28, 14) : ctx.rect(W / 2 - tw / 2, Hh * 0.34, tw, 28); ctx.fill();
        ctx.fillStyle = '#ffe9a8';
        ctx.fillText(msg, W / 2, Hh * 0.34 + 19);
      }
    }
    if (mode === 'live' && !s) {
      const t = status === 'gone' ? G.T('{x} no está jugando ahora mismo.').replace('{x}', who) : G.T('Esperando a {x}…').replace('{x}', who);
      ctx.font = F(800, 16); ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,12,22,.72)';
      const tw = ctx.measureText(t).width + 32;
      ctx.fillRect(W / 2 - tw / 2, Hh / 2 - 20, tw, 36);
      ctx.fillStyle = '#eaf2ff';
      ctx.fillText(t, W / 2, Hh / 2 + 4);
    }
    ctx.restore();
  }
  /** The HUD's height: a replay's controls take the bottom. */
  function hudH(h) { return mode === 'replay' ? Math.max(200, h - (($('watch-ctrl') && $('watch-ctrl').offsetHeight) || 0) - 6) : h; }

  // ---------------- events (banner) ----------------

  function evText(e) {
    const k = e[1];
    if (k === 'lv') return G.T('¡Nivel {x}!').replace('{x}', e[2]);
    if (k === 'mv') { const d = G.Moves.BY_ID[e[2]]; return d ? G.T(d.name) + (e[3] > 1 ? ' ' + G.T('Nv.') + ' ' + e[3] : '') : ''; }
    if (k === 'xe') { const d = G.Moves.BY_ID[e[2]]; return d ? G.T('¡{x} evoluciona!').replace('{x}', G.T(d.name)) : ''; }
    if (k === 'bs') { const d = G.DEX_BY[e[2]]; return G.T('¡Aparece un jefe: {x}!').replace('{x}', d ? d.name : '?'); }
    if (k === 'bk') return G.T('¡Jefe derrotado!');
    if (k === 'z') return G.T('¡Movimiento Z!');
    if (k === 'dx') return G.T('¡Dynamax!');
    if (k === 'dd') return G.T('¡Ha caído!');
    if (k === 'bi') return '— ' + G.World.biomeName() + ' —';
    return '';
  }
  /** Events that arrive together share one banner ("Level 5!  ·  Ember Lv. 2"). */
  function say(list) {
    const t = list.map(evText).filter(Boolean);
    if (t.length) G.Spawner.say(t.slice(-3).join('  ·  '), 2.6, true);
  }

  // ---------------- entering / leaving ----------------

  function reset() {
    G.Spectate.unwatch();
    A = B = null; pl = null; dexNow = 0; mates.clear(); ents.clear(); movesKey = '';
    worldSeed = null; worldBiome = -1; arenaKey = ''; zoneKey = '';
    rd = null; T = 0; idx = 0; playing = true; speed = 1; done = false; ended = null; status = 'wait'; info = {}; notice = '';
    ss = null; segK = -1; follow = 0; loading = null; castQ = [];
    liveA = liveB = livePP = null;
    G.FX.clear(); G.Projectiles.clear(); G.Combat.clearFields(); G.EnemyMgr.clear(); G.Pickups.clear(); G.Minimap.reset();
    G.World.setArena(null);
  }

  function bar(text, liveDot) {
    const el = $('watch-bar');
    el.innerHTML = `<span class="wb-eye">${G.Icons.html('eye', 18)}</span><span class="wb-t">${text}</span>${liveDot ? '<span class="wb-live">' + esc(G.T('EN DIRECTO')) + '</span>' : ''}<span class="wb-n" id="watch-n"></span>`
      + (liveDot ? `<button class="btn small ghost hidden" id="wb-follow" type="button" translate="no"></button>` : '')   // (MP polish: live, whose view)
      + `<button class="btn small ghost" id="watch-leave" type="button">${esc(G.T('Dejar de ver'))}</button>`;
    el.classList.remove('hidden');
    $('watch-leave').onclick = leave;
    if ($('wb-follow')) $('wb-follow').onclick = () => cycleFollow(1);
  }

  function enter(kind, name, back) {
    reset();
    mode = kind; who = name || ''; onLeave = back || null;
    G.UI.hideAll();
    G.UI.chrome(false);
    G.Game.watchEnter();
  }

  /** Live: watch `user` (a friend). */
  function watchLive(user, back) {
    enter('live', user, back);
    bar(esc(G.T('Viendo a')) + ' <b translate="no">' + esc(user) + '</b>', true);
    if (!G.MicaAccount.name()) { status = 'login'; endCard({ login: true }); return; }
    G.Spectate.watch(user, {
      snapshot(s, b) {
        stats.snaps++;
        // DLC D0b: a run of an unknown / newer Expedition version (dv): still shown, with a notice (once)
        if (!notice && G.Expedition && G.Expedition.viewNotice(s.m, s.dv)) { notice = 'Esta partida es de una versión más nueva de la Expedición: recarga la página para verla bien.'; G.UI.toast(notice, 6000); }
        info = b;
        const now = performance.now();
        // the publisher's clock (ms) between this snapshot and the last one, kept between 0.4 and 3 s
        if (s.w && lastW) interval = G.U.clamp(s.w - lastW, 400, 3000);
        lastW = s.w || 0;
        // (MP polish: a snapshot of several players (pp / pr) is seen from the player followed, as a v2 replay frame is;
        //  an older publisher's (no pp) shows as before)
        liveA = liveB; liveB = s;
        const np = Array.isArray(s.pp) ? s.pp.length : 0;
        livePP = np > 1 ? s.pp : null;
        if (follow >= Math.max(1, np)) follow = 0;
        const v = livePP ? G.Replay.liveView(s, follow) : s;
        const prev = B && B !== A ? B : A;
        setFrame(prev || v, v, !prev);
        if (livePP) castQ = castQ.concat(v.cs || []).slice(-200); else castQ = [];
        followBtn();
        arriveAt = now;
        status = 'live';
        say(s.ev || []);
        watchersLine(b);
        if (s.over) { ended = s.over; setTimeout(() => { if (mode === 'live') endCard({ summary: s.over, live: true }); }, 1400); }
      },
      info(b) { watchersLine(b); },
      waiting(b) { status = 'wait'; watchersLine(b); },
      ended() { status = 'over'; endCard({ live: true, noSummary: true }); },
      gone() { status = 'gone'; },
      error(e) { if (e.notFriend) { status = 'nofriend'; endCard({ notFriend: true }); } else if (e.full) G.UI.toast(G.T('Ya hay demasiada gente mirando.'), 3000); }
    });
  }
  function watchersLine(b) {
    const n = (b && b.watchers) || 0, el = $('watch-n');
    if (el) el.textContent = n > 1 ? G.T('Mirando: {x}').replace('{x}', n) : '';
  }

  /** Replay: a Reader or a Session (js/mica/replay.js); `meta` / `by` for the title. */
  function playReplay(reader, opts = {}) {
    // (a single tape -> a session of one segment, open at once: the player stays synchronous for it)
    const S = reader.session ? reader : G.Replay.session([{ seg: 0, t0: reader.t0, t1: reader.duration, n: reader.length }], () => reader, { h: reader.h });
    if (!reader.session) S.put(0, reader);
    const h = S.h || {};
    enter('replay', opts.by || h.by || '', opts.back);
    shared = opts;
    ss = S;
    rd = S.get(0); segK = rd ? 0 : -1;
    const name = opts.by || h.by;
    bar(name ? esc(G.T('Repetición de')) + ' <b translate="no">' + esc(name) + '</b>' : esc(G.T('Repetición')), false);
    T = 0; idx = -1; playing = true; speed = 1; evAt = 0; done = false; follow = 0; castQ = [];
    buildCtrl();
    // DLC D0b: a replay of an unknown / newer Expedition version (dv) still plays, with a notice
    if (G.Expedition && G.Expedition.viewNotice(h.m, h.dv)) { notice = 'Esta repetición es de una versión más nueva de la Expedición: recarga la página para verla bien.'; G.UI.toast(notice, 6000); }
    seekTo(0, true);
  }

  /** U4: the last frame at or before t in a segment's times (a binary search). */
  function frameAt(times, t) {
    let lo = 0, hi = times.length - 1;
    if (hi < 0 || times[0] > t) return 0;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (times[m] <= t) lo = m; else hi = m - 1; }
    return lo;
  }
  function seekTo(t, hard) {
    if (!ss) return;
    // U4: the segment first (fetched if it is not here yet: the clock waits), then the frame from its nearest checkpoint
    const k = ss.segAt(t);
    const r = ss.get(k);
    if (!r) {
      if (loading == null) {
        loading = k; stats.segLoads++;
        ss.load(k).then(() => { if (loading === k) loading = null; if (mode === 'replay' && ss) seekTo(T, true); });
      }
      return;
    }
    if (loading != null && loading !== k) loading = null;
    let switched = false;
    if (k !== segK) { segK = k; rd = r; idx = -1; switched = true; }
    if (k + 1 < ss.segs.length && !ss.get(k + 1) && t >= ss.segs[k].t1 - 30) ss.load(k + 1);   // (the next one, ahead of time)
    if (!rd.length) return;
    const times = rd.times;
    const i = frameAt(times, t);
    if (i !== idx || hard) {
      const nx = ss.get(k + 1);
      const a = rd.at(i, follow), b = i + 1 < rd.length ? rd.at(i + 1, follow) : nx && nx.length ? nx.at(Math.min(1, nx.length - 1), follow) : a;
      if (hard) { mates.clear(); ents.clear(); G.EnemyMgr.clear(); G.Pickups.clear(); G.Projectiles.clear(); G.FX.clear(); pl = null; dexNow = 0; }
      // events crossed while playing forward (not on a seek)
      if (!hard && !switched && i > idx) say(rd.ev.filter(e => { const et = e[0] / 10; return et > (times[idx] || 0) && et <= times[i]; }));
      setFrame(a, b, true);
      // U4: the casts recorded on the frame being glided to happened in between: queued for fireCasts (a seek drops the past)
      castQ = b !== a && b.cs ? b.cs.filter(c => !hard || c[5] >= t * 10) : [];
      idx = i;
    }
    const t0 = times[i], t1 = i + 1 < times.length ? times[i + 1] : (B && B !== A ? B.t / 10 : t0);
    blend(t1 > t0 ? (t - t0) / (t1 - t0) : 1);
    timeNow = Math.max(timeNow, 0);
  }

  /** U4: whose view to follow (a slot of the session's players). */
  function setFollow(k) {
    const P = playersNow(), n = Math.max(1, P.length);
    k = ((k | 0) % n + n) % n;
    if (n < 2 || k === follow || !(ss || (mode === 'live' && liveB))) return follow;
    follow = k;
    if (mode === 'replay') seekTo(T, true);
    else refollowLive();
    followBtn();
    const d = P[k];
    if (d && d.name) G.UI.toast(G.T('Siguiendo a {x}').replace('{x}', d.name), 1400);
    return follow;
  }
  /** MP polish: live, the last two snapshots seen again from the player now followed (its puppet, HUD and camera). */
  function refollowLive() {
    mates.clear(); ents.clear(); G.EnemyMgr.clear(); G.Pickups.clear(); G.Projectiles.clear(); G.FX.clear(); pl = null; dexNow = 0; castQ = [];
    const b = G.Replay.liveView(liveB, follow), a = liveA ? G.Replay.liveView(liveA, follow) : b;
    setFrame(a, b, true);
  }
  function cycleFollow(d) { return setFollow(follow + (d || 1)); }
  function followBtn() {
    const P = playersNow();
    const b = $('wc-follow') || $('wb-follow');
    if (!b) return;
    if (b.id === 'wb-follow') b.classList.toggle('hidden', P.length < 2);
    if (P.length < 2) return;
    const d = P[follow] || {};
    b.textContent = G.T('Siguiendo: {x}').replace('{x}', d.name || '?');
  }

  // ---------------- the replay controls ----------------

  function fmt(t) { t = Math.max(0, Math.floor(t)); return t >= 3600 ? Math.floor(t / 3600) + ':' + G.U.mmss(t % 3600).padStart(5, '0') : G.U.mmss(t); }
  function buildCtrl() {
    const el = $('watch-ctrl');
    el.innerHTML = `<button class="btn small" id="wc-play" type="button" aria-label="Pausa">❚❚</button>`
      + SPEEDS.map(s => `<button class="btn small ghost wc-sp${s === 1 ? ' on' : ''}" data-sp="${s}" type="button">${s}×</button>`).join('')
      + `<div class="wc-seek"><div class="wc-marks" id="wc-marks"></div><input id="wc-range" type="range" min="0" max="1000" step="1" value="0" aria-label="Posición"></div>`
      + `<span class="wc-time" id="wc-time" translate="no">0:00 / 0:00</span>`
      + (ss && ss.players.length > 1 ? `<button class="btn small ghost" id="wc-follow" type="button" translate="no"></button>` : '');
    el.classList.remove('hidden');
    if ($('wc-follow')) { $('wc-follow').onclick = () => cycleFollow(1); followBtn(); }
    $('wc-play').onclick = () => togglePlay();
    for (const b of el.querySelectorAll('.wc-sp')) b.onclick = () => setSpeed(+b.dataset.sp);
    const r = $('wc-range');
    r.oninput = () => { const t = (+r.value / 1000) * ss.duration; T = t; done = false; seekTo(t, true); hideEnd(); ctrlTick(); };
    // markers: bosses (red) and level-ups (blue) along the bar (U4: the session's, from its index / its segments)
    const marks = $('wc-marks');
    const dur = ss.duration || 1;
    const evs = ss.marks.length ? ss.marks : (rd ? rd.ev : []);
    marks.innerHTML = evs.filter(e => e[1] === 'bs' || e[1] === 'bk' || e[1] === 'z' || e[1] === 'dx').slice(0, 120)
      .map(e => `<i class="wm wm-${e[1]}" style="left:${(100 * (e[0] / 10) / dur).toFixed(2)}%"></i>`).join('');
    ctrlTick();
  }
  let lastCtrl = '';
  function ctrlTick() {
    if (!ss) return;
    const key = Math.floor(T * 4) + '|' + playing + '|' + speed;
    if (key === lastCtrl) return;
    lastCtrl = key;
    const r = $('wc-range');
    if (r && document.activeElement !== r) r.value = Math.round(1000 * T / (ss.duration || 1));
    const tm = $('wc-time'); if (tm) tm.textContent = fmt(T) + ' / ' + fmt(ss.duration);
    const pb = $('wc-play'); if (pb) { pb.textContent = playing ? '❚❚' : '▶'; pb.setAttribute('aria-label', G.T(playing ? 'Pausa' : 'Reproducir')); }
    for (const b of document.querySelectorAll('#watch-ctrl .wc-sp')) b.classList.toggle('on', +b.dataset.sp === speed);
  }
  function togglePlay() {
    if (!ss) return;
    if (done || T >= ss.duration) { T = 0; done = false; hideEnd(); seekTo(0, true); playing = true; }
    else playing = !playing;
    ctrlTick();
  }
  function setSpeed(s) { if (SPEEDS.includes(s)) { speed = s; ctrlTick(); } }

  function finishReplay() {
    done = true; playing = false; ctrlTick();
    endCard({ summary: ss.h.end || null, replay: true, limit: ss.limit });
  }

  // ---------------- the end card ----------------

  function endCard(o) {
    const box = $('watch-end-body');
    const s = o.summary;
    let html = '';
    if (o.login) {
      $('watch-end-title').textContent = G.T('Inicia sesión para ver a tus amigos');
      html = `<p class="sub">${esc(G.T('Para ver la partida de un amigo en directo, inicia sesión en Magepunk con una cuenta que sea su amiga.'))}</p>`;
    } else if (o.notFriend) {
      $('watch-end-title').textContent = G.T('Sólo los amigos pueden mirar');
      html = `<p class="sub">${esc(G.T('Sólo puedes ver las partidas de tus amigos de Magepunk.'))}</p>`;
    } else {
      $('watch-end-title').textContent = o.replay ? G.T('Fin de la repetición') : G.T('La partida de {x} ha terminado').replace('{x}', who);
      if (s) {
        const mv = (s.moves || []).filter(m => G.Moves.BY_ID[m[0]]).map(m => `${G.Icons.html('move:' + m[0], 16)} ${esc(G.T(G.Moves.BY_ID[m[0]].name))} <span>${esc(G.T('Nv.'))}${m[1]}</span>`).join(' · ');
        const mon = G.DEX_BY[(ss && ss.h.dex) || (A && A.me[0])];
        html = `<div class="stats">
          ${mon ? `<div style="grid-column:1/-1"><span>Pokémon</span><b translate="no">${esc(mon.name)}</b></div>` : ''}
          <div><span>${esc(G.T('Tiempo'))}</span><b>${fmt(s.time || 0)}</b></div>
          <div><span>${esc(G.T('Nivel'))}</span><b>${s.level | 0}</b></div>
          <div><span>${esc(G.T('Derrotados'))}</span><b>${s.kills | 0}</b></div>
          <div><span>${esc(G.T('Jefes'))}</span><b>${s.bosses | 0}</b></div>
          ${mv ? `<div style="grid-column:1/-1"><span>${esc(G.T('Movimientos'))}</span><b style="font-size:14px">${mv}</b></div>` : ''}
          <div style="grid-column:1/-1;text-align:center"><span>${esc(G.T(s.dead ? 'Ha caído' : 'Partida terminada'))}</span></div></div>`;
      } else html = `<p class="sub">${esc(G.T('La partida ha terminado.'))}</p>`;
      // (U4: a session that reached its cap says so: the replay ends there, nothing was cut silently)
      if (o.limit) html = `<p class="sub" id="watch-limit">${esc(G.T('La repetición termina aquí (límite de la sesión).'))}</p>` + html;
    }
    box.innerHTML = html;
    $('watch-again').classList.toggle('hidden', !o.replay);
    $('watch-login').classList.toggle('hidden', !o.login);
    $('watch-again').onclick = () => { hideEnd(); T = 0; done = false; playing = true; seekTo(0, true); };
    $('watch-login').onclick = () => { location.href = G.MicaAccount.loginUrl(); };
    $('watch-back').onclick = leave;
    $('scr-watch-end').classList.remove('hidden');
  }
  function hideEnd() { $('scr-watch-end').classList.add('hidden'); }

  function leave() {
    if (!mode) return;
    const back = onLeave;
    mode = null;
    reset();
    $('watch-bar').classList.add('hidden');
    $('watch-ctrl').classList.add('hidden');
    hideEnd();
    G.Spawner.say('', 0, true);
    G.Game.watchExit();
    G.UI.chrome(true);
    if (pending && (q.has('watch') || q.has('replay'))) {
      q.delete('watch'); q.delete('replay');
      try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); } catch (e) { /* fine */ }
    }
    if (back) back(); else G.Flow.goMenu();
  }

  /** Boot (game.js G.Flow.boot): a ?watch= / ?replay= link opens straight into the view. */
  async function boot(after) {
    const p = pending;
    if (p.kind === 'live') { watchLive(p.arg, after); return; }
    enter('replay', '', after);
    bar(esc(G.T('Cargando la repetición…')), false);
    const r = await G.Replay.fetchShared(p.arg);
    if (mode !== 'replay') return;
    if (!r.ok) {
      $('watch-end-title').textContent = G.T('No se encuentra la repetición');
      $('watch-end-body').innerHTML = `<p class="sub">${esc(G.T(r.error === 'missing' ? 'Esta repetición no existe o ha caducado (se guardan 30 días).' : 'No se pudo cargar la repetición. Inténtalo otra vez.'))}</p>`;
      $('watch-again').classList.add('hidden'); $('watch-login').classList.add('hidden');
      $('watch-back').onclick = leave;
      $('scr-watch-end').classList.remove('hidden');
      return;
    }
    playReplay(r.reader, { by: r.by, meta: r.meta, back: after, size: r.size });
  }

  /** A replay kept in this browser (the summary's "Watch replay", the friends screen). */
  async function playLocal(entry, back) {
    if (!entry) return false;
    if (entry.ready) await entry.ready;
    const S = await G.Replay.openEntry(entry);   // (U4: every segment kept here, else fetched by its id)
    if (!S) { G.UI.toast(G.T('No se pudo abrir la repetición.'), 2600); return false; }
    playReplay(S, { by: S.h.by, back: back || (() => G.Flow.goMenu()) });
    return true;
  }

  function keys() {
    if (G.Input.tap('escape')) { if (!$('scr-watch-end').classList.contains('hidden') && mode === 'replay') hideEnd(); else leave(); return; }
    if (mode === 'replay' && (G.Input.tap('space') || G.Input.tap('keyk'))) togglePlay();
    // U4: whose view (F / Tab: the next player; 1-4: that player)
    // (MP polish: live too, when the snapshot has several players)
    const P = playersNow();
    if ((mode === 'replay' || mode === 'live') && P.length > 1) {
      if (G.Input.tap('keyf') || G.Input.tap('tab')) cycleFollow(1);
      for (let i = 0; i < 4; i++) if (G.Input.tap('digit' + (i + 1)) && i < P.length) setFollow(i);
    }
  }

  return {
    pending, boot, watchLive, playReplay, playLocal, leave, tick, keys, drawables, drawOverlay, hudH, mateList, stats,
    togglePlay, setSpeed, seek(t) { if (ss) { T = G.U.clamp(t, 0, ss.duration); done = false; hideEnd(); seekTo(T, true); ctrlTick(); } },
    setFollow, cycleFollow, get follow() { return follow; }, get session() { return ss; }, get segment() { return segK; }, get loading() { return loading; },
    get mode() { return mode; }, get time() { return timeNow; }, get who() { return who; }, get status() { return status; },
    get notice() { return notice; }, get playing() { return playing; }, get speed() { return speed; }, get T() { return T; }, get reader() { return rd; },
    get player() { return pl; }, get frame() { return A; }, get done() { return done; }
  };
})();
