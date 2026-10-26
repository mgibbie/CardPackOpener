/* ============ localcoop.js — Modo Cooperativo local (MicaSurvivor M5 lote 12a) ============
 * Del port de Android de JayElDragon (MIT, github.com/JayElDragon/poke-survivor): menu.gd 1584-1600 (la
 * tarjeta "Modo Cooperativo" y "Elegir compañero"), 2109 / 2151-2156 (el selector: sólo tus Pokémon;
 * guarda coop_dex), main.gd 162-167 / 195-202 (estado), 439 / 523-524 (empezar), 815-817 / 838-841 (al
 * acabar: -20 % de monedas, stats coopRuns y groupRuns), 985-989 (cada fotograma), 1062 (la barra), 1243 /
 * 1267 (sin Z ni Dynamax mientras espectas), 1623-1731 (coop_dex, _partner_move_for, _setup_partner,
 * _update_partner), 1807-1811 (los golpes van al compañero), 1917 (al caer), 1939-2007 (_enter_down,
 * _update_down, _revive_from_down, _hurt_partner), 8653-8661 (el aviso de espectador) y progress.gd 105-106 /
 * 155 (los logros "partida en grupo" cuentan el cooperativo). Los números son del port.
 *
 *   Un segundo Pokémon (el compañero, `mate`) te acompaña en la partida. Nunca le pegan mientras tú estés en
 *   pie: los enemigos van a por ti, como en el port.
 *   - Lo mueve la IA, o el jugador 2 con el stick izquierdo de un SEGUNDO mando (el port: el segundo mando
 *     conectado; aquí, el que no usa el jugador 1, js/core/pad.js p2). Zona muerta 0,22 sin reescalar,
 *     velocidad fija 118. El jugador 2 no tiene botones ni maneja los menús (el port sólo lee su stick). Si
 *     el mando se desconecta, vuelve la IA; si se conecta, manda él. El segundo mando pasa por la misma capa
 *     que el primero (js/core/pad.js): funciona para quien pueda usar el del jugador 1.
 *   - IA: si estás a más de 150, va hacia ti; si estás a menos de 120 y hay un enemigo a menos de 240, se
 *     acerca a él a media velocidad; si no, se para. El giro se suaviza (×5 por segundo). Si se queda a más
 *     de 520 de ti, aparece a 70 de ti con un aro azul (también con el jugador 2; no mientras espectas).
 *   - Ataca solo: el primer movimiento de proyectil de su tipo principal (si no hay, uno Normal; si tampoco,
 *     Ascuas), de nivel 1 + tu nivel / 6 (hasta 6), al enemigo más cercano a menos de 520. Cada disparo ×0,8
 *     de daño y su recarga ×1,15 (sin tus mejoras de recarga). "Comparte tus mejoras": el daño sale de tu
 *     ataque (mejoras, cartas, objetos, habilidad, Dynamax), el tamaño de tu Calibre / Esfera Colosal, tus
 *     críticos y los efectos de tus objetos al golpear. Sus golpes van a "Compañero / equipo" en el desglose.
 *   - En la grieta no está (ni se ve); vuelve al salir.
 *   - Si caes (después de la Segunda oportunidad), no se acaba: espectas a tu compañero (la cámara le sigue)
 *     durante 20 s y luego te revive con la mitad de tu vida (2,5 s invulnerable, empuja a los enemigos a
 *     menos de 220). Mientras, él tiene tu vida máxima, recibe los golpes que te tocarían a ti (×0,8; con su
 *     tipo y el clima; 0,45 s invulnerable tras cada uno) y la IA huye de los enemigos a menos de 190. Si cae
 *     él, se acaba la partida. Sin Movimiento Z ni Dynamax mientras espectas (el Dynamax se acaba al caer).
 *   - Es su propio modo (con los modificadores elegidos, como la partida normal): -20 % de monedas al acabar
 *     (multiplica, como el port). Ni ranking ni grupo online. Stats coopRuns y, si dura 60 s o más,
 *     groupRuns (los logros "En compañía" y "Compañero fiel", progress.gd 105-106).
 *
 *   El compañero se guarda en save.coopDex (el coop_dex del port) con save.coopAt (cuándo se eligió): al
 *   fusionar dos partidas gana el elegido más tarde. Sin elegir (o si ya no vale): el primero del equipo
 *   (js/systems/team.js list) que no sea el tuyo; si no, Eevee (Pikachu si juegas con Eevee).
 */
G.LocalCoop = (() => {
  const K = {
    speed: 118,          // velocidad fija (main.gd 1697)
    follow: 150,         // a más de esto de ti, va hacia ti
    engage: 120,         // a menos de esto de ti, se acerca a un enemigo...
    seek: 240,           // ... que esté a menos de esto de él
    flee: 190,           // espectando: huye de los enemigos a menos de esto
    steer: 5,            // suavizado del giro (lerp × dt × 5)
    leash: 520,          // a más de esto de ti, aparece a tu lado
    tpR: 70,             // ... a esta distancia
    tpRing: { r0: 6, r1: 80, color: '#9ad0ff', dur: 0.5 },
    dz: 0.22,            // zona muerta del stick del jugador 2
    reach: 520,          // AIM_REACH: alcance para apuntar
    dmg: 0.8,            // daño de cada disparo
    cd: 1.15,            // recarga
    lvEvery: 6, lvMax: 6,
    start: [60, 20],     // dónde aparece al empezar
    coins: 0.8,          // -20 % de monedas
    groupMin: 60,        // s para que cuente como partida en grupo
    reviveT: 20,         // s espectando hasta que te revive
    downK: 0.8,          // daño que recibe él mientras espectas
    downInv: 0.45,
    reviveHp: 0.5, reviveInv: 2.5, reviveR: 220, reviveKnock: 450, reviveOff: [-50, 10],
    downRing: { r0: 8, r1: 160, color: '#9ad0ff', dur: 0.7 },
    reviveRing: { r0: 8, r1: 240, color: '#7dffb0', dur: 0.8 },
    fallback: 133, fallback2: 25,
  };
  const COLOR = '#5fc8ff';   // el segundo color del cooperativo (net/coop.js COLORS[1])

  const save = () => G.DB && G.DB.save;
  const valid = d => !!(G.DEX_BY && G.DEX_BY[d] && G.SPRITE_META && G.SPRITE_META[d]);

  // ======================= el compañero elegido (save.coopDex) =======================
  /** El compañero de la partida (main.gd coop_dex): el elegido; si no, el primero del equipo que no seas tú; si no, Eevee. */
  function dex(s = save(), runDex = s && s.partner) {
    if (!s) return K.fallback;
    const d = Math.floor(+s.coopDex);
    if (d > 0 && valid(d)) return d;
    const team = G.Team ? G.Team.list(s) : [];
    for (const x of team) if (+x !== +runDex) return +x;
    return +runDex === K.fallback ? K.fallback2 : K.fallback;
  }
  /** "Elegir compañero": sólo uno de los tuyos (menu.gd 2109). */
  function pick(d) {
    d = Math.floor(+d);
    const s = save();
    if (!s || !valid(d) || !(s.owned && s.owned[d])) return false;
    s.coopDex = d; s.coopAt = Date.now();
    G.DB.commit();
    return true;
  }
  /** Tus Pokémon para el selector. */
  const owned = (s = save()) => (s && s.owned ? Object.keys(s.owned).map(Number).filter(valid).sort((a, b) => a - b) : []);

  /** db.js merge: gana el elegido más tarde (coopAt). */
  function merge(r, older) {
    if (!older || older.coopDex == null) return;
    if (r.coopDex == null || (+older.coopAt || 0) > (+r.coopAt || 0)) { r.coopDex = older.coopDex; r.coopAt = older.coopAt || 0; }
  }
  /** db.js sanitize: un número de Pokémon que exista, y su fecha. */
  function sanitize(s) {
    if (s.coopDex == null && s.coopAt == null) return;
    const d = Math.floor(+s.coopDex);
    if (!(d > 0) || !(G.DEX_BY && G.DEX_BY[d])) { delete s.coopDex; delete s.coopAt; return; }
    s.coopDex = d;
    s.coopAt = Number.isFinite(+s.coopAt) && +s.coopAt > 0 ? Math.floor(+s.coopAt) : 0;
  }

  // ======================= la partida =======================
  let on = false, mate = null, move = null, lvl = 0, cd = 0, dir = [0, 0], ctrl = 'ai', padIdx = null, padId = '';
  let down = false, downT = 0, mateHp = 1, mateMax = 1, mateInv = 0, tpN = 0;
  const reset = () => { on = false; mate = null; move = null; lvl = 0; cd = 0; dir = [0, 0]; ctrl = 'ai'; padIdx = null; padId = ''; down = false; downT = 0; mateHp = mateMax = 1; mateInv = 0; tpN = 0; };

  /** El movimiento del compañero (main.gd _partner_move_for). */
  function moveFor(d, level) {
    const mon = G.DEX_BY[d], ty = (mon && mon.types && mon.types[0]) || 'normal';
    const all = G.Moves.ALL;
    const m = all.find(x => x.kind === 'projectile' && x.type === ty) || all.find(x => x.kind === 'projectile' && x.type === 'normal');
    const id = m ? m.id : 'ember';
    return G.Moves.instance(id, Math.min(level, G.Moves.BY_ID[id].maxLvl));
  }
  const levelFor = pl => G.U.clamp(1 + Math.floor(pl.level / K.lvEvery), 1, K.lvMax);

  /** Un sitio libre cerca de (x, y) (main.gd _free_spot). */
  function freeSpot(x, y, r = 14) {
    if (G.World.isFree(x, y, r)) return [x, y];
    for (let ring = 1; ring <= 8; ring++) {
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2, d = ring * 16;
        const nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d;
        if (G.World.isFree(nx, ny, r)) return [nx, ny];
      }
    }
    return [x, y];
  }

  /** Al empezar (game.js startRun): main.gd _setup_partner. */
  function begin(pl) {
    reset();
    // (MicaSurvivor DLC D11: an Expedition run with player 2's pad connected, or the Expedition's "local partner" setting,
    //  brings the partner too: G.Exp.localMate, js/expedition/core.js. A base run: only the 'coop' mode, as always.)
    const expMate = !!(G.Modes && G.Modes.isExp && G.Modes.isExp() && G.Exp && G.Exp.localMate && G.Exp.localMate());
    if (!pl || !G.Game || (G.Game.mode !== 'coop' && !expMate) || (G.Coop && G.Coop.active)) return;
    const s = save(), d = dex(s, pl.dex), mon = G.DEX_BY[d];
    if (!mon) return;
    const shiny = !!(s && s.partnerShiny) && G.DB.ownsShiny(d) && G.Sprites.hasShiny(d);
    mate = new G.Player(mon, {}, shiny);
    mate.remote = true;            // (no es tuyo: ni objetos ni Segunda oportunidad ni daño de terreno)
    mate.isMate = true;
    mate.tagColor = COLOR;
    const [x, y] = freeSpot(pl.x + K.start[0], pl.y + K.start[1]);
    mate.x = x; mate.y = y;
    on = true;
    syncMove(pl);
    G.Sprites.preload([d], 8000, shiny);
    poll(true);
  }
  function end() { if (mate) G.Projectiles.clearOrbs(mate); if (G.Game && G.Game.player) G.Game.player.coopDown = false; reset(); }

  function syncMove(pl) {
    const L = levelFor(pl);
    if (L === lvl && move) return;
    lvl = L;
    move = moveFor(mate.dex, L);
    mate.moves = [move]; mate.slots = [[move]]; mate.active = 0;
  }

  /** ¿Quién lleva al compañero? (main.gd 1672: el segundo mando conectado, cada fotograma) */
  function poll(quiet) {
    const p = G.Pad && G.Pad.p2 ? G.Pad.p2() : null;
    const was = ctrl;
    padIdx = p ? p.index : null; padId = p ? String(p.id || '') : '';
    ctrl = p ? 'p2' : 'ai';
    if (mate) mate.tag = ctrl === 'p2' ? 'J2' : '';
    if (!quiet && was !== ctrl && G.UI) G.UI.toast(ctrl === 'p2' ? 'Jugador 2: mando conectado' : 'Jugador 2: mando desconectado, la IA lleva a tu compañero', 2600);
  }

  function nearestEnemy(x, y, reach) {
    let best = null, bd = reach * reach;
    for (const e of G.EnemyMgr.all()) {
      if (e.dead) continue;
      const d2 = G.U.dist2(x, y, e.x, e.y);
      if (d2 <= bd) { bd = d2; best = e; }
    }
    return best;
  }

  const visible = pl => on && !!mate && !!pl && !pl.dead && !(G.Rift && G.Rift.inArena);

  /** Cada fotograma de juego (main.gd _update_partner), después de moverte tú. */
  function update(dt, pl) {
    if (!on || !mate) return;
    poll(false);
    mate.anim.update(dt);
    if (mate.flash > 0) mate.flash -= dt;
    if (!visible(pl)) return;
    let vx = 0, vy = 0;
    const ax = ctrl === 'p2' && G.Pad.p2Axis ? G.Pad.p2Axis() : null;
    if (ax) {
      [vx, vy] = ax;
    } else {
      // IA: te sigue a distancia y se acerca un poco a los enemigos
      const tx = pl.x - mate.x, ty = pl.y - mate.y, tl = Math.hypot(tx, ty);
      let wx = 0, wy = 0;
      const near = nearestEnemy(mate.x, mate.y, K.seek);
      if (down) {
        // sin ti cerca: huye de los enemigos mientras dispara
        const close = nearestEnemy(mate.x, mate.y, K.flee);
        if (close) [wx, wy] = G.U.norm(mate.x - close.x, mate.y - close.y);
      } else if (tl > K.follow) [wx, wy] = G.U.norm(tx, ty);
      else if (near && tl < K.engage) { const [nx, ny] = G.U.norm(near.x - mate.x, near.y - mate.y); wx = nx * 0.5; wy = ny * 0.5; }
      const f = Math.min(1, dt * K.steer);
      dir = [dir[0] + (wx - dir[0]) * f, dir[1] + (wy - dir[1]) * f];
      [vx, vy] = dir;
    }
    const len = Math.hypot(vx, vy);
    if (len > 1) { vx /= len; vy /= len; }
    const moving = Math.hypot(vx, vy) > 0.05;
    // MicaSurvivor (DLC D11): in an Expedition zone the partner has the movement verbs (js/expedition/verbs.js): player 2's A
    // hops (held: a Flying type glides), B slides; the AI hops up to you when you stand a level above it, and slides to catch
    // up. A base run has no zone: the plain step below, as always.
    const XV = G.World.zone && G.ExpVerbs && G.Modes.isExp() ? G.ExpVerbs : null;
    if (XV) {
      mate.svx = vx * K.speed; mate.svy = vy * K.speed;
      XV.step(mate, dt, vx, vy, mateInput(pl, dt));
      mate.x += mate.svx * dt; mate.y += mate.svy * dt;
    } else {
      mate.x += vx * K.speed * dt;
      mate.y += vy * K.speed * dt;
    }
    const r = mate.r;
    mate.r = r * 0.55;             // (el port choca con el 55 % de su radio)
    G.World.collide(mate);
    mate.r = r;
    if (XV) XV.after(mate, dt);
    if (!down && G.U.dist2(mate.x, mate.y, pl.x, pl.y) > K.leash * K.leash) {
      const a = Math.random() * Math.PI * 2;
      [mate.x, mate.y] = freeSpot(pl.x + Math.cos(a) * K.tpR, pl.y + Math.sin(a) * K.tpR);
      G.FX.ring(mate.x, mate.y, K.tpRing.r0, K.tpRing.r1, K.tpRing.color, K.tpRing.dur, 3);
      tpN++;
    }
    // ataque automático
    syncMove(pl);
    const tg = nearestEnemy(mate.x, mate.y, K.reach);
    if (tg) mate.aim = Math.atan2(tg.y - mate.y, tg.x - mate.x);
    else if (moving) mate.aim = Math.atan2(vy, vx);
    mate.walking = moving;
    mate.anim.dir = G.Sprites.dirFromAngle(tg || !moving ? mate.aim : Math.atan2(vy, vx));
    mate.anim.loop(moving ? 'Walk' : 'Idle', moving ? K.speed / 110 : 1);
    cd -= dt;
    if (cd <= 0 && tg) {
      cd = move.cd * K.cd;
      fire(pl, move);
    }
  }

  // MicaSurvivor (DLC D11): the partner's verbs in an Expedition zone: player 2's buttons (A hop / hold to glide, B slide), else its AI
  let p2a = false, p2b = false, aiHopT = 0, aiSlideT = 0;
  function mateInput(pl, dt) {
    const p = ctrl === 'p2' && G.Pad && G.Pad.p2 ? G.Pad.p2() : null;
    if (p) {
      const bt = i => !!(p.buttons && p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
      const a = bt(0), b = bt(1), out = { hop: a && !p2a, slide: b && !p2b, held: a };
      p2a = a; p2b = b;
      return out;
    }
    aiHopT -= dt; aiSlideT -= dt;
    const d = Math.hypot(pl.x - mate.x, pl.y - mate.y), out = { hop: false, slide: false, held: false };
    if (!down && !mate.air && aiHopT <= 0 && (pl.layer || 0) >= (mate.layer || 0) + 0.9 && d < 200) { out.hop = true; aiHopT = 1.2; }
    else if (!down && !mate.air && aiSlideT <= 0 && d > 330) { out.slide = true; aiSlideT = 2.5; }
    return out;
  }

  /** Un disparo (main.gd 1719-1730): tu ataque, tu tamaño y tus objetos; ×0,8; al desglose como "Compañero". */
  function fire(pl, m0) {
    const m = G.Combat.eff(pl, m0);   // el Calibre / la Esfera Colosal / la Lente Amplia y el empuje por nivel
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    const n = Math.max(1, m.count | 0), spread = m.spread || 0;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * n;
      const a = mate.aim + off + G.U.rand(-0.03, 0.03);
      G.Projectiles.spawn({
        x: mate.x + Math.cos(a) * 3, y: mate.y + Math.sin(a) * 3,
        vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed,
        dmg: m.dmg * pl.atk * K.dmg, r: m.size, life: m.life || 1.4,
        pierce: m.pierce | 0, color: col, homing: m.homing || 0,
        hits: new Set(), vis, ghost: false, owner: pl,
        burn: m.burn || 0, poison: m.poison || 0, slow: m.slow || 0, knock: m.knock || 0, mtype: m.type,
        cc: m.cc || '', ccp: m.ccp || 0, mkind: m.kind, mid: m.id,
        dsrc: 'ally', fromMate: true
      });
    }
    G.FX.spark(mate.x + Math.cos(mate.aim) * mate.r, mate.y - G.LIFT + Math.sin(mate.aim) * mate.r, col, Math.cos(mate.aim), Math.sin(mate.aim), 3);
  }

  // ---------- espectador (main.gd 1917 / 1939-2007) ----------
  /** Player.hurt, si caes (después de la Banda Focus, Robustez y la Segunda oportunidad): a espectar. */
  function onFaint(pl) {
    if (!on || !mate || !pl || pl.remote || pl.hp > 0 || down || (G.Rift && G.Rift.inArena)) return false;
    if (G.Dynamax) G.Dynamax.stop(pl);
    down = true; downT = 0;
    pl.coopDown = true;
    pl.hp = 0; pl.invuln = 0; pl.flash = 0;
    mateMax = Math.max(1, pl.maxHp); mateHp = mateMax; mateInv = 0;
    pl.x = mate.x; pl.y = mate.y;
    G.Projectiles.clearOrbs(pl);
    G.Audio.sfx('hurt');
    G.Camera.kick(0.6);
    G.FX.ring(mate.x, mate.y, K.downRing.r0, K.downRing.r1, K.downRing.color, K.downRing.dur, 5);
    G.FX.dmgText(mate.x, mate.y - mate.bodyH - 14, '¡Has caído! Mira a tu compañero', '#ff8a9a', true);
    return true;
  }
  /** game.js, en lugar de Player.update mientras espectas (main.gd _update_down). */
  function downTick(dt, pl) {
    downT += dt;
    mateInv = Math.max(0, mateInv - dt);
    pl.x = mate.x; pl.y = mate.y;
    if (downT >= K.reviveT) revive(pl);
  }
  function revive(pl) {
    down = false;
    pl.coopDown = false;
    [pl.x, pl.y] = freeSpot(mate.x + K.reviveOff[0], mate.y + K.reviveOff[1]);
    pl.hp = pl.maxHp * K.reviveHp;
    pl.invuln = K.reviveInv;
    pl.flash = 0;
    pl.dead = false;
    pl.anim._start('Idle', false);
    G.Audio.sfx('legend');
    G.Camera.kick(0.4);
    G.FX.ring(pl.x, pl.y, K.reviveRing.r0, K.reviveRing.r1, K.reviveRing.color, K.reviveRing.dur, 5);
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 22, '¡Tu compañero te ha revivido!', '#7dffb0', true);
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || G.U.dist2(e.x, e.y, pl.x, pl.y) >= K.reviveR * K.reviveR) continue;
      const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y);
      e.kx = nx * K.reviveKnock; e.ky = ny * K.reviveKnock;
    }
  }
  /** Mientras espectas, los golpes que te tocarían los recibe él (main.gd _hurt_partner). */
  function hurtMate(amount, type, pure) {
    if (!down || mateInv > 0) return;
    const pl = G.Game && G.Game.player;
    let eff = null;
    if (type) {
      const k = G.Types.mult(type, mate.mon.types);
      eff = G.Types.label(k);
      amount *= k * G.Weather.mult(type);
    }
    const d = pure ? Math.max(1, amount) : Math.max(1, amount * K.downK);
    mateHp -= d;
    mateInv = K.downInv;
    mate.flash = 0.6;
    G.Camera.kick(0.28);
    G.Audio.sfx('hurt');
    G.FX.dmgText(mate.x, mate.y - mate.bodyH - 4, '-' + Math.round(d), eff === 'super' ? '#ff3048' : '#ff6b7a', eff === 'super');
    if (mateHp <= 0) {
      mateHp = 0;
      down = false;
      if (pl) {
        // main.gd _player_final_death: se acaba (game.js ve al jugador caído y cierra la partida)
        pl.coopDown = false;
        pl.hp = 0; pl.dead = true;
        pl.anim.play('Faint', { hold: true });
        G.Projectiles.clearOrbs(pl);
        if (G.Dynamax) G.Dynamax.stop(pl);
      }
    }
  }

  // ---------- al acabar (main.gd 815-817 / 838-841) ----------
  function finish(S, time) {
    S.coopRuns = (S.coopRuns || 0) + 1;
    if (time >= K.groupMin) S.groupRuns = (S.groupRuns || 0) + 1;
  }

  /** Lo que se dibuja en el mundo (game.js drawScene). */
  const drawables = pl => (visible(pl) ? [mate] : []);

  return {
    K, COLOR, dex, pick, owned, merge, sanitize, moveFor, levelFor,
    begin, end, update, onFaint, downTick, hurtMate, finish, drawables, visible, nearestEnemy,
    get on() { return on; }, get mate() { return mate; }, get move() { return move; }, get ctrl() { return ctrl; },
    get padIdx() { return padIdx; }, get padId() { return padId; }, get down() { return down; }, get downT() { return downT; },
    get downLeft() { return Math.max(0, K.reviveT - downT); }, get mateHp() { return mateHp; }, get mateMax() { return mateMax; },
    get mateInv() { return mateInv; }, get cd() { return cd; }, get teleports() { return tpN; }, get dir() { return dir.slice(); }
  };
})();
