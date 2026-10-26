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
  const stats = { snaps: 0, frames: 0 };

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
      const name = m[9] === 'l' ? G.T((m[10] ? '{x} · J2' : '{x} · IA').replace('{x}', m[0])) : m[0];
      seen.add(name);
      let o = mates.get(name);
      if (!o || o.p.dex !== m[1]) {
        o = { p: puppet(m[1], m[2]) };
        o.p.x = m[3]; o.p.y = m[4];
        o.p.tag = name;
        o.p.tagColor = m[9] === 'l' ? (G.LocalCoop && G.LocalCoop.COLOR) || '#9ad0ff' : MATE_COL[m[10] | 0] || '#fff';
        mates.set(name, o);
      }
      o.raw = m[0];   // (DLC D2: its name in the x block's air rows)
      const nb = (B.mt || []).find(x => x[0] === m[0] && x[9] === m[9]) || m;
      o.from = ex ? [m[3], m[4]] : [o.p.x, o.p.y]; o.to = [nb[3], nb[4]];
      o.p.hp = m[5]; o.p.maxHp = m[6] || 1; o.kind = m[9]; o.ctrl = m[10];
      o.p.walking = !!(m[7] & 2); o.p.anim.dir = m[8] | 0;
      if ((m[7] & 1) && !o.p.dead) { o.p.dead = true; o.p.anim.play('Faint', { hold: true }); }
      else if (!(m[7] & 1) && o.p.dead) { o.p.dead = false; o.p.anim.loop('Idle'); }
    }
    for (const k of [...mates.keys()]) if (!seen.has(k)) mates.delete(k);
    // in an online group, the watched player's name over its head too
    const group = (a.mt || []).some(m => m[9] === 'o');
    pl.tag = group ? who || null : null; pl.tagColor = '#ffffff';
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
    } else if (rd && !done) {
      if (playing) T = Math.min(rd.duration, T + dt * speed);
      seekTo(T, false);
      if (T >= rd.duration && playing) finishReplay();
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

  /** Harmless copies of the watched Pokémon's attacks (like a co-op partner's: they hit nothing). */
  function ghosts(dt) {
    if (!pl || pl.dead || pl.zHidden || pl.coopDown || (mode === 'replay' && !playing)) return;
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
    if (s) {
      if (s.z) { chip(ctx, x, y, G.T('Movimiento Z') + ': ' + (G.U.TYPE_NAME[s.z[0]] || s.z[0]) + ' · ' + G.T(s.z[1] ? '¡en uso!' : s.z[2] ? 'usado' : 'listo'), '#ffd98a'); y += 22; }
      if (s.dy) { chip(ctx, x, y, 'Dynamax · ' + G.T(s.dy[0] ? '¡activo!' : s.dy[2] ? 'usado' : 'listo'), s.dy[0] ? '#ff8aa8' : '#ffb3c6'); y += 22; }
      if (s.tm) { chip(ctx, x, y, G.T('Equipo') + ': ' + s.tm[1].map(m => ((G.DEX_BY[m[0]] || {}).name || '?') + ' ' + m[1] + '%').join(' · '), '#cfe3ff'); y += 22; }
      for (const o of mates.values()) {
        const pct = Math.round(100 * G.U.clamp(o.p.hp / (o.p.maxHp || 1), 0, 1));
        chip(ctx, x, y, o.p.tag + ' · ' + (o.p.dead ? G.T('caído') : pct + '%'), o.p.dead ? '#ff8a96' : o.p.tagColor || '#fff'); y += 22;
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
    G.FX.clear(); G.Projectiles.clear(); G.Combat.clearFields(); G.EnemyMgr.clear(); G.Pickups.clear(); G.Minimap.reset();
    G.World.setArena(null);
  }

  function bar(text, liveDot) {
    const el = $('watch-bar');
    el.innerHTML = `<span class="wb-eye">${G.Icons.html('eye', 18)}</span><span class="wb-t">${text}</span>${liveDot ? '<span class="wb-live">' + esc(G.T('EN DIRECTO')) + '</span>' : ''}<span class="wb-n" id="watch-n"></span>`
      + `<button class="btn small ghost" id="watch-leave" type="button">${esc(G.T('Dejar de ver'))}</button>`;
    el.classList.remove('hidden');
    $('watch-leave').onclick = leave;
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
        const prev = B && B !== A ? B : A;
        setFrame(prev || s, s, !prev);
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

  /** Replay: a Reader (js/mica/replay.js); `meta` / `by` for the title. */
  function playReplay(reader, opts = {}) {
    enter('replay', opts.by || reader.h.by || '', opts.back);
    shared = opts;
    rd = reader;
    const name = opts.by || reader.h.by;
    bar(name ? esc(G.T('Repetición de')) + ' <b translate="no">' + esc(name) + '</b>' : esc(G.T('Repetición')), false);
    buildCtrl();
    T = 0; idx = -1; playing = true; speed = 1; evAt = 0; done = false;
    // DLC D0b: a replay of an unknown / newer Expedition version (dv) still plays, with a notice
    if (G.Expedition && G.Expedition.viewNotice(reader.h.m, reader.h.dv)) { notice = 'Esta repetición es de una versión más nueva de la Expedición: recarga la página para verla bien.'; G.UI.toast(notice, 6000); }
    seekTo(0, true);
  }

  function seekTo(t, hard) {
    if (!rd || !rd.length) return;
    const times = rd.times;
    // the frame at or before t
    let i = idx >= 0 && times[idx] <= t ? idx : 0;
    while (i + 1 < times.length && times[i + 1] <= t) i++;
    if (i !== idx || hard) {
      const a = rd.at(i), b = i + 1 < rd.length ? rd.at(i + 1) : a;
      if (hard) { mates.clear(); ents.clear(); G.EnemyMgr.clear(); G.Pickups.clear(); G.Projectiles.clear(); G.FX.clear(); pl = null; dexNow = 0; }
      // events crossed while playing forward (not on a seek)
      if (!hard && i > idx) say(rd.ev.filter(e => { const et = e[0] / 10; return et > (times[idx] || 0) && et <= times[i]; }));
      setFrame(a, b, true);
      idx = i;
    }
    const t0 = times[i], t1 = i + 1 < times.length ? times[i + 1] : t0;
    blend(t1 > t0 ? (t - t0) / (t1 - t0) : 1);
    timeNow = Math.max(timeNow, 0);
  }

  // ---------------- the replay controls ----------------

  function fmt(t) { t = Math.max(0, Math.floor(t)); return t >= 3600 ? Math.floor(t / 3600) + ':' + G.U.mmss(t % 3600).padStart(5, '0') : G.U.mmss(t); }
  function buildCtrl() {
    const el = $('watch-ctrl');
    el.innerHTML = `<button class="btn small" id="wc-play" type="button" aria-label="Pausa">❚❚</button>`
      + SPEEDS.map(s => `<button class="btn small ghost wc-sp${s === 1 ? ' on' : ''}" data-sp="${s}" type="button">${s}×</button>`).join('')
      + `<div class="wc-seek"><div class="wc-marks" id="wc-marks"></div><input id="wc-range" type="range" min="0" max="1000" step="1" value="0" aria-label="Posición"></div>`
      + `<span class="wc-time" id="wc-time" translate="no">0:00 / 0:00</span>`;
    el.classList.remove('hidden');
    $('wc-play').onclick = () => togglePlay();
    for (const b of el.querySelectorAll('.wc-sp')) b.onclick = () => setSpeed(+b.dataset.sp);
    const r = $('wc-range');
    r.oninput = () => { const t = (+r.value / 1000) * rd.duration; T = t; done = false; seekTo(t, true); hideEnd(); ctrlTick(); };
    // markers: bosses (red) and level-ups (blue) along the bar
    const marks = $('wc-marks');
    const dur = rd.duration || 1;
    marks.innerHTML = rd.ev.filter(e => e[1] === 'bs' || e[1] === 'bk' || e[1] === 'z' || e[1] === 'dx').slice(0, 120)
      .map(e => `<i class="wm wm-${e[1]}" style="left:${(100 * (e[0] / 10) / dur).toFixed(2)}%"></i>`).join('');
    ctrlTick();
  }
  let lastCtrl = '';
  function ctrlTick() {
    if (!rd) return;
    const key = Math.floor(T * 4) + '|' + playing + '|' + speed;
    if (key === lastCtrl) return;
    lastCtrl = key;
    const r = $('wc-range');
    if (r && document.activeElement !== r) r.value = Math.round(1000 * T / (rd.duration || 1));
    const tm = $('wc-time'); if (tm) tm.textContent = fmt(T) + ' / ' + fmt(rd.duration);
    const pb = $('wc-play'); if (pb) { pb.textContent = playing ? '❚❚' : '▶'; pb.setAttribute('aria-label', G.T(playing ? 'Pausa' : 'Reproducir')); }
    for (const b of document.querySelectorAll('#watch-ctrl .wc-sp')) b.classList.toggle('on', +b.dataset.sp === speed);
  }
  function togglePlay() {
    if (!rd) return;
    if (done || T >= rd.duration) { T = 0; done = false; hideEnd(); seekTo(0, true); playing = true; }
    else playing = !playing;
    ctrlTick();
  }
  function setSpeed(s) { if (SPEEDS.includes(s)) { speed = s; ctrlTick(); } }

  function finishReplay() {
    done = true; playing = false; ctrlTick();
    endCard({ summary: rd.h.end || null, replay: true });
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
        const mon = G.DEX_BY[(rd && rd.h.dex) || (A && A.me[0])];
        html = `<div class="stats">
          ${mon ? `<div style="grid-column:1/-1"><span>Pokémon</span><b translate="no">${esc(mon.name)}</b></div>` : ''}
          <div><span>${esc(G.T('Tiempo'))}</span><b>${fmt(s.time || 0)}</b></div>
          <div><span>${esc(G.T('Nivel'))}</span><b>${s.level | 0}</b></div>
          <div><span>${esc(G.T('Derrotados'))}</span><b>${s.kills | 0}</b></div>
          <div><span>${esc(G.T('Jefes'))}</span><b>${s.bosses | 0}</b></div>
          ${mv ? `<div style="grid-column:1/-1"><span>${esc(G.T('Movimientos'))}</span><b style="font-size:14px">${mv}</b></div>` : ''}
          <div style="grid-column:1/-1;text-align:center"><span>${esc(G.T(s.dead ? 'Ha caído' : 'Partida terminada'))}</span></div></div>`;
      } else html = `<p class="sub">${esc(G.T('La partida ha terminado.'))}</p>`;
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
    const rd2 = entry.code ? await G.Replay.open(entry.code) : null;
    if (!rd2) { G.UI.toast(G.T('No se pudo abrir la repetición.'), 2600); return false; }
    playReplay(rd2, { by: rd2.h.by, back: back || (() => G.Flow.goMenu()) });
    return true;
  }

  function keys() {
    if (G.Input.tap('escape')) { if (!$('scr-watch-end').classList.contains('hidden') && mode === 'replay') hideEnd(); else leave(); return; }
    if (mode === 'replay' && (G.Input.tap('space') || G.Input.tap('keyk'))) togglePlay();
  }

  return {
    pending, boot, watchLive, playReplay, playLocal, leave, tick, keys, drawables, drawOverlay, hudH, mateList, stats,
    togglePlay, setSpeed, seek(t) { if (rd) { T = G.U.clamp(t, 0, rd.duration); done = false; hideEnd(); seekTo(T, true); ctrlTick(); } },
    get mode() { return mode; }, get time() { return timeNow; }, get who() { return who; }, get status() { return status; },
    get notice() { return notice; }, get playing() { return playing; }, get speed() { return speed; }, get T() { return T; }, get reader() { return rd; },
    get player() { return pl; }, get frame() { return A; }, get done() { return done; }
  };
})();
