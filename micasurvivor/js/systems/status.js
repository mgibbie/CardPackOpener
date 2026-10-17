/* ============ status.js — estados de control de los enemigos ============
 * MicaSurvivor (M5, del port de Android de JayElDragon: main.gd:213-216 y 2489-2641).
 *
 *   freeze  Congelado   1,8 s  no se mueve ni ataca; recibe +25 % de daño
 *   para    Paralizado  3 s    va al 40 % de velocidad y ataca/dispara 2,5 veces más lento;
 *                              recibe +35 % de daño eléctrico
 *   sleep   Dormido     4 s    no se mueve ni ataca; el siguiente golpe hace +30 % y lo despierta
 *                              (salvo los de los movimientos que duermen)
 *   conf    Confundido  3 s    vaga, persigue a otro enemigo y le pega (a ti ya no te ataca)
 *
 * Los jefes lo resisten: congelar y dormir les duran el 35 %, paralizar y confundir el 50 %, y
 * luego quedan inmunes 4 s. Darkrai (491, Mal Sueño) no se duerme nunca. Congelado o dormido no
 * se puede paralizar ni confundir; congelar quita el sueño y la confusión; dormir, la confusión.
 *
 * Se aplican desde combat.js (los movimientos con `cc` y `ccp`: probabilidad por golpe) y
 * cualquier otro sistema puede llamar a G.Status.apply(e, tipo, k). Los indicadores se dibujan
 * aquí, con código (sin arte nuevo).
 */
G.Status = (() => {
  const DUR = { freeze: 1.8, para: 3.0, sleep: 4.0, conf: 3.0 };
  const TEXT = { freeze: '¡Congelado!', para: '¡Paralizado!', sleep: '¡Dormido!', conf: '¡Confundido!' };
  const COL = { freeze: '#8fe3ff', para: '#ffe14d', sleep: '#b9b6ff', conf: '#ff7ad9' };
  const SUFFIX = { freeze: 'Puede congelar ({x}%).', para: 'Puede paralizar ({x}%).', sleep: 'Puede dormir ({x}%).', conf: 'Puede confundir ({x}%).' };
  const KEY = { freeze: 'frozenT', para: 'paraT', sleep: 'sleepT', conf: 'confT' };
  const BOSS_K = { freeze: 0.35, sleep: 0.35, para: 0.5, conf: 0.5 };
  const BOSS_IMMUNE = 4;
  const DARKRAI = 491;
  // Multiplicadores (main.gd _hit_enemy / _damage_enemy).
  const SLEEP_BONUS = 1.3, PARA_ELECTRIC = 1.35, FROZEN_TAKEN = 1.25, PARA_SLOW = 0.4;

  function init(e) {
    e.frozenT = 0; e.paraT = 0; e.sleepT = 0; e.confT = 0;
    e.ccImm = 0; e.confCd = 0; e.immShown = -1e9;
  }

  const stunned = e => e.frozenT > 0 || e.sleepT > 0;
  const any = e => e.frozenT > 0 || e.sleepT > 0 || e.paraT > 0 || e.confT > 0;

  /**
   * Aplica un estado. @param k  multiplicador de la duración (trampas, Z...).
   * @returns la duración puesta (0 si no se aplica).
   */
  function apply(e, kind, k = 1) {
    if (!e || e.dead || e.remote || !DUR[kind] || e.ccImm > 0) return 0;
    if (kind === 'sleep' && e.dex === DARKRAI) {
      const now = performance.now();
      if (now - (e.immShown || -1e9) > 1500) {
        e.immShown = now;
        G.FX.dmgText(e.x, e.y - e.bodyH - 18, '¡Inmune!', '#c8d0dc', true);
      }
      return 0;
    }
    if (stunned(e) && (kind === 'conf' || kind === 'para')) return 0;
    let dur = DUR[kind] * k;
    if (e.boss) {
      dur *= BOSS_K[kind];
      e.ccImm = dur + BOSS_IMMUNE;
    }
    const key = KEY[kind];
    const fresh = !(e[key] > 0);
    e[key] = Math.max(e[key] || 0, dur);
    if (kind === 'freeze') { e.sleepT = 0; e.confT = 0; }
    else if (kind === 'sleep') e.confT = 0;
    if (kind === 'freeze' || kind === 'sleep') {
      // Se queda quieto: corta la embestida que estuviera haciendo.
      if (e.phase === 'dash' || e.phase === 'aim') { e.phase = 'walk'; e.pt = 1.1; }
    }
    if (fresh) {
      G.FX.dmgText(e.x, e.y - e.bodyH - 18, TEXT[kind], COL[kind], true);
      G.FX.ring(e.x, e.y, 4, e.r * 2.2, COL[kind], 0.35, 2.5);
    }
    return dur;
  }

  /** Despierta a un enemigo dormido (al recibir un golpe). */
  function wake(e, quiet = false) {
    if (!(e.sleepT > 0)) return false;
    e.sleepT = 0;
    if (!quiet) G.FX.dmgText(e.x, e.y - e.bodyH - 18, '¡Despertó!', '#ffe9a8', true);
    return true;
  }

  function tick(e, dt) {
    if (e.ccImm > 0) e.ccImm -= dt;
    if (e.frozenT > 0) e.frozenT = Math.max(0, e.frozenT - dt);
    if (e.sleepT > 0) e.sleepT = Math.max(0, e.sleepT - dt);
    if (e.paraT > 0) e.paraT = Math.max(0, e.paraT - dt);
    if (e.confT > 0) e.confT = Math.max(0, e.confT - dt);
    if (e.confCd > 0) e.confCd -= dt;
  }

  /** "Puede congelar (15%)." para la carta de un movimiento nuevo (o '' si no tiene). */
  function suffix(m) {
    return m && m.cc && SUFFIX[m.cc] && m.ccp > 0 ? SUFFIX[m.cc].replace('{x}', Math.round(m.ccp * 100)) : '';
  }

  /**
   * Enemigo confundido (main.gd _confused_step): vaga sin rumbo, persigue al enemigo más
   * cercano (hasta 380) y le pega cada 0,6 s: 1,8 × su daño + el 3 % de la vida del otro
   * (1,2 % si es un jefe), con empuje 140; si el otro dormía, lo despierta.
   */
  function confusedStep(e, dt, spd) {
    let tgt = null, best = 380;
    for (const o of G.EnemyMgr.queryCircle(e.x, e.y, 380)) {
      if (o === e || o.dead || o.remote) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d < best) { best = d; tgt = o; }
    }
    e.zig = (e.zig || 0) + dt;
    const ang = tgt ? Math.atan2(tgt.y - e.y, tgt.x - e.x) + Math.sin(e.zig * 5) * 0.5
                    : e.bob * 0.2 + e.zig * 1.3;
    const vx = Math.cos(ang) * spd * 0.9, vy = Math.sin(ang) * spd * 0.9;
    e.x += (vx + e.kx) * dt; e.y += (vy + e.ky) * dt;
    e.kx *= Math.pow(0.0015, dt); e.ky *= Math.pow(0.0015, dt);
    if (!e.flying) G.World.collide(e);
    e.anim.dir = G.Sprites.dirFromAngle(ang);
    e.anim.loop('Walk', 1.2);
    if (tgt && e.confCd <= 0 && best <= e.r + tgt.r + 6) {
      e.confCd = 0.6;
      e.strike(tgt);
      const hit = e.dmg * 1.8 + tgt.maxHp * (tgt.boss ? 0.012 : 0.03);
      tgt.hurt(hit, COL.conf, tgt.x - e.x, tgt.y - e.y, 140);
      if (!tgt.dead) wake(tgt, true);
      return tgt;
    }
    return null;
  }

  // ---------------- indicadores (dibujados, sin arte) ----------------

  function draw(ctx, e, lift = 0) {
    if (!any(e)) return;
    const t = performance.now() / 1000;
    const top = e.y - e.bodyH - lift;
    ctx.save();
    // Mancha de color en el suelo, como la de quemado / envenenado.
    const kind = e.frozenT > 0 ? 'freeze' : e.sleepT > 0 ? 'sleep' : e.confT > 0 ? 'conf' : 'para';
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = COL[kind];
    ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.25, e.r * 0.5, 0, 0, 6.2832); ctx.fill();

    if (e.frozenT > 0) {
      // Bloque de hielo sobre el cuerpo, con brillos.
      const w = Math.max(14, e.r * 2.3), h = Math.max(14, e.bodyH * 1.05);
      const x0 = Math.round(e.x - w / 2), y0 = Math.round(e.y - lift - h);
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = '#9fe6ff';
      ctx.fillRect(x0, y0, w, h);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
      ctx.beginPath();
      ctx.moveTo(x0 + 3, y0 + h * 0.45); ctx.lineTo(x0 + w * 0.4, y0 + 3);
      ctx.moveTo(x0 + 3, y0 + h * 0.75); ctx.lineTo(x0 + w * 0.65, y0 + 3);
      ctx.stroke();
    }
    if (e.sleepT > 0) {
      // "Z z z" que suben.
      ctx.font = '700 12px Pixelify,"Segoe UI",sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)';
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.7 + i / 3) % 1;
        ctx.globalAlpha = Math.min(1, (1 - k) * 2);
        const x = e.x + e.r * 0.4 + k * 10, y = top + 4 - k * 14;
        const z = i === 0 ? 'Z' : 'z';
        ctx.strokeText(z, x, y);
        ctx.fillStyle = COL.sleep; ctx.fillText(z, x, y);
      }
    }
    if (e.confT > 0) {
      // Tres estrellitas que giran sobre la cabeza.
      for (let i = 0; i < 3; i++) {
        const a = t * 4 + i * 2.094;
        const x = Math.round(e.x + Math.cos(a) * Math.max(9, e.r * 0.9)), y = Math.round(top - 3 + Math.sin(a) * 3);
        ctx.globalAlpha = Math.sin(a) > 0 ? 1 : 0.6;
        // estrellita de 4 puntas con contorno
        ctx.fillStyle = '#1b1528';
        ctx.fillRect(x - 2, y - 4, 5, 9); ctx.fillRect(x - 4, y - 2, 9, 5);
        ctx.fillStyle = i === 1 ? '#ffe14d' : COL.conf;
        ctx.fillRect(x - 1, y - 3, 3, 7); ctx.fillRect(x - 3, y - 1, 7, 3);
        ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 1, 1);
      }
    }
    if (e.paraT > 0 && Math.floor(t * 10 + e.id) % 3 !== 0) {
      // Chispas amarillas en zigzag alrededor del cuerpo.
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const s = G.U.hash(e.id, Math.floor(t * 8), i);
        const x = e.x + (s - 0.5) * e.r * 2.2, y = e.y - lift - e.bodyH * (0.25 + 0.6 * G.U.hash(i, e.id, Math.floor(t * 8)));
        ctx.beginPath();
        ctx.moveTo(x - 3, y - 6); ctx.lineTo(x + 2, y - 1); ctx.lineTo(x - 2, y + 1); ctx.lineTo(x + 3, y + 6);
        ctx.strokeStyle = '#1b1528'; ctx.lineWidth = 3.5; ctx.stroke();
        ctx.strokeStyle = i === 1 ? '#fff6b0' : COL.para; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    ctx.restore();
  }

  return { DUR, TEXT, COL, SUFFIX, BOSS_K, BOSS_IMMUNE, DARKRAI, SLEEP_BONUS, PARA_ELECTRIC, FROZEN_TAKEN, PARA_SLOW,
           init, apply, wake, tick, stunned, any, suffix, confusedStep, draw };
})();
