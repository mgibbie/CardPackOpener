/* ============ hud.js — interfaz dentro del canvas ============
 * Se dibuja en coordenadas de PANTALLA (sin la transformación de cámara).
 */
G.HUD = (() => {
  const F = (w, s) => `${w} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function bar(ctx, x, y, w, h, frac, col, bg = 'rgba(0,0,0,.55)') {
    roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
    if (frac > 0) {
      ctx.save();
      roundRect(ctx, x, y, w, h, h / 2); ctx.clip();
      ctx.fillStyle = col;
      ctx.fillRect(x, y, w * G.U.clamp(frac, 0, 1), h);
      ctx.restore();
    }
  }

  // MicaSurvivor (M5 lote 10): el HUD se dibuja escalado por el tamaño de la interfaz (display.js) en unidades
  // propias (w / k × h / k). Cada elemento apunta su rectángulo (mark) para colocar el minimapa en un hueco libre
  // y para las pruebas de solapes; el minimapa se coloca con los del fotograma anterior.
  let hudK = 1, rects = [], last = [], mm = null;
  function mark(name, x, y, w, h) { if (w > 0 && h > 0) rects.push({ name, x, y, w, h }); }
  /** Un punto del mundo en unidades del HUD. */
  function toHud(x, y) { const cam = G.Camera; return [(x - cam.left()) * cam.scale / hudK, (y - cam.top()) * cam.scale / hudK]; }
  /** Las flechas del borde (grieta, shinies, compañeros, eventos) no se meten debajo del minimapa. */
  function avoid(ex, ey, r) {
    if (mm && ex - r < mm.x + mm.s + 6 && ex + r > mm.x && ey + r > mm.y && ey - r < mm.y + mm.s) ex = mm.x + mm.s + 6 + r;
    return ex;
  }

  function draw(ctx, W, H, pl, st) {
    ctx.save();
    const k = G.Display ? G.Display.ui(W, H) : 1;
    hudK = k;
    ctx.scale(k, k);
    const w = W / k, h = H / k;
    last = rects; rects = [];
    mm = G.Minimap ? G.Minimap.place(w, h, last, H) : null;
    ctx.textBaseline = 'alphabetic';
    G.Touch.clearButtons();
    G.Touch.scaleButtons(k);
    // MicaSurvivor (M5 lote 12c): viendo la partida de otro, su HUD sin los controles (ni pausa, ni pistas, ni botones)
    const watching = !!G.Game && G.Game.state === 'watch';
    const touch = G.Touch.active && !watching;

    // ---------- barra de experiencia (borde superior) ----------
    const xpF = pl.xp / pl.xpNext;
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(0, 0, w, 7);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#4fd1ff'); g.addColorStop(1, '#a98bff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w * G.U.clamp(xpF, 0, 1), 7);

    // ---------- vida + nivel ----------
    const px = 16, py = 20;
    ctx.font = F(800, 13);
    ctx.fillStyle = '#eaf2ff';
    ctx.textAlign = 'left';
    ctx.fillText(pl.mon.name, px, py + 10);

    ctx.font = F(700, 11);
    ctx.fillStyle = '#ffcb3d';
    ctx.fillText('Nv. ' + pl.level, px, py + 26);

    bar(ctx, px + 48, py + 17, 168, 11, pl.hp / pl.maxHp, '#ff5f6d');
    ctx.font = F(700, 10);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(pl.hp) + ' / ' + Math.round(pl.maxHp), px + 48 + 84, py + 26);
    // MicaSurvivor (M5 lote 3, main.gd 8670): corazones de Segunda oportunidad que quedan.
    for (let i = 0; i < (pl.revives || 0); i++) G.Icons.draw(ctx, 'revive', px + 48 + 168 + 6 + i * 22, py + 12, 20);
    mark('hp', px, py, 48 + 168 + (pl.revives ? 6 + pl.revives * 22 : 0), 32);

    // buffs activos
    const COL = { atk: '#ff6b4d', spd: '#7fe0ff', def: '#b0b8c8', regen: '#5fe08a' };
    const LBL = { atk: 'ATK', spd: 'VEL', def: 'DEF', regen: 'REG' };
    let bx = px;
    ctx.textAlign = 'left';
    // MicaSurvivor (M5): la habilidad (main.gd 1043 / 8651), primera de la fila: dorada, más viva
    // cuando está actuando, con su recarga (Robustez, Multiescala) o su bonus (Autoestima).
    // Tocarla (o pulsarla con el ratón) dice lo que hace.
    if (pl.ability) {
      const ab = G.Abilities.def(pl.ability), st = G.Abilities.state(pl);
      ctx.font = F(800, 9);
      const name = G.I18n.t(ab.name), extra = st.txt ? ' ' + st.txt : '';
      const nw = ctx.measureText(name).width, tw = nw + ctx.measureText(extra).width + 22;
      roundRect(ctx, bx, py + 34, tw, 15, 7);
      ctx.fillStyle = st.on ? 'rgba(90,64,10,.75)' : 'rgba(0,0,0,.5)'; ctx.fill();
      if (st.on) { ctx.strokeStyle = 'rgba(255,217,138,.8)'; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.fillStyle = st.on ? '#ffe9a8' : '#ffd98a';
      ctx.fillText('✦', bx + 5, py + 45);
      ctx.fillText(name, bx + 16, py + 45);
      if (extra) { ctx.fillStyle = '#c8d6ee'; ctx.fillText(extra, bx + 16 + nw, py + 45); }
      G.Touch.addButton(bx, py + 34, tw, 15, () => G.Spawner.say(G.I18n.t(ab.name) + ': ' + G.I18n.t(ab.desc), 4, true), 4);
      bx += tw + 5;
    }
    for (const k in pl.buffs) {
      const b = pl.buffs[k];
      if (b.n <= 0) continue;
      ctx.font = F(800, 9);
      const txt = LBL[k] + ' ×' + b.n;
      const tw = ctx.measureText(txt).width + 12;
      roundRect(ctx, bx, py + 34, tw, 15, 7);
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
      ctx.fillStyle = COL[k];
      ctx.fillText(txt, bx + 6, py + 45);
      bx += tw + 5;
    }

    // ---------- reloj / bioma / kills ----------
    ctx.textAlign = 'center';
    ctx.font = F(800, 26);
    if (G.Modes.rifts()) {
      // MicaSurvivor (M5 lote 6, main.gd 8701-8705): la Contrarreloj cuenta hacia atrás (rojo los últimos
      // 30 s) y debajo, las grietas ganadas.
      const left = G.Modes.timeLeft(st.time);
      ctx.fillStyle = left < 30 ? '#ff6b7a' : 'rgba(255,255,255,.95)';
      ctx.fillText(G.U.mmss(left), w / 2, 42);
      ctx.font = F(700, 12);
      ctx.fillStyle = '#c9a6ff';
      ctx.fillText('Grietas ganadas: ' + G.Modes.riftsWon, w / 2, 58);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.fillText(G.U.mmss(st.time), w / 2, 42);
      if (G.Tower.on) {
        // MicaSurvivor (M5 lote 8, main.gd 8711-8720): en la Torre, bajo el reloj: piso, cuenta atrás del jefe,
        // pactos (ya traducida por trozos: se dibuja tal cual)
        ctx.font = F(800, 12);
        ctx.fillStyle = '#ffd23f';
        const tl = new String(G.Tower.hudLine());   // eslint-disable-line no-new-wrappers
        ctx.fillText(tl, w / 2, 58);
      } else if (G.World.zone && G.ExpClassic && G.ExpClassic.active()) {
        // MicaSurvivor (DLC D3): an Expedition zone: zone, the final swarm's countdown and the objective (already translated)
        ctx.font = F(800, 11);
        ctx.fillStyle = G.ExpClassic.hudColor();
        ctx.fillText(new String(G.ExpClassic.hudLine(pl, st)), w / 2, 58);   // eslint-disable-line no-new-wrappers
      } else {
        ctx.font = F(600, 10);
        ctx.fillStyle = '#8fa3c4';
        ctx.fillText(G.World.biomeName().toUpperCase() + '  ·  ' + pl.kills + ' DERROTADOS  ·  ' + pl.coins + ' MONEDAS', w / 2, 58);
      }
    }
    // MicaSurvivor (M5 lote 9, main.gd 8708-8710): el "Reto: N%" de la dificultad adaptativa bajo el reloj (sólo
    // en la partida normal con el ajuste encendido): verde por debajo de 100, dorado en 100, naranja por encima.
    const adPct = watching ? (G.WatchUI.frame && G.WatchUI.frame.ad) || 0 : G.Adaptive.pct();   // (M5 lote 12c: el de quien miras)
    if (adPct > 0) {
      ctx.font = F(800, 11);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)';
      ctx.strokeText('Reto: ' + adPct + '%', w / 2, 72);
      ctx.fillStyle = G.Adaptive.color(adPct);
      ctx.fillText('Reto: ' + adPct + '%', w / 2, 72);
    }
    {
      // (M5 lote 10) el bloque del centro: reloj, línea de debajo y el "Reto"
      ctx.font = F(600, 10);
      const xl = G.World.zone && G.ExpClassic && G.ExpClassic.active() ? G.ExpClassic.hudLine(pl, st) : null;   // (DLC D3)
      if (xl) ctx.font = F(800, 11);
      const sub = G.Modes.rifts() || G.Tower.on ? 190 : xl ? ctx.measureText(xl).width : ctx.measureText(G.I18n.t(G.World.biomeName().toUpperCase() + '  ·  ' + pl.kills + ' DERROTADOS  ·  ' + pl.coins + ' MONEDAS')).width;
      const cw = Math.max(90, sub + 8);
      mark('clock', w / 2 - cw / 2, 18, cw, (adPct > 0 ? 76 : 62) - 18);
    }

    // ---------- clima (arriba a la derecha) ----------
    const wx = G.Weather.current;
    if (wx) {
      ctx.font = F(800, 11);
      ctx.textAlign = 'left';
      const txt = wx.name.toUpperCase() + ' · ' + Math.ceil(wx.left) + 's';
      const tw = ctx.measureText(txt).width + 40;
      const x0 = w - tw - 16 - (touch ? 56 : 0), y0 = 14;
      roundRect(ctx, x0, y0, tw, 26, 9);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
      G.Icons.draw(ctx, wx.icon, x0 + 6, y0 + 3, 20);
      ctx.fillStyle = wx.color;
      ctx.fillText(txt, x0 + 32, y0 + 17);
      mark('weather', x0, y0, tw, 26);
    }
    // MicaSurvivor (M5 lote 6): el modo de la partida y los iconos de sus modificadores, arriba a la derecha.
    const MD = G.Modes, mt = MD.title();
    if (mt || MD.mods.length) {
      let mx = w - 16 - (touch ? 56 : 0);
      const my = wx ? 46 : 16;
      for (const id of MD.mods.slice().reverse()) { mx -= 16; G.Icons.draw(ctx, MD.MOD[id].icon, mx, my, 14); mx -= 3; }
      if (mt) {
        ctx.font = F(800, 10);
        ctx.textAlign = 'right';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
        ctx.strokeText(mt.toUpperCase(), mx - 4, my + 11);
        ctx.fillStyle = '#ffb36b';
        ctx.fillText(mt.toUpperCase(), mx - 4, my + 11);
        mx -= 4 + ctx.measureText(G.I18n.t(mt.toUpperCase())).width;
      }
      mark('mode', mx, my, w - 16 - (touch ? 56 : 0) - mx, 15);
    }

    // ---------- barra del jefe ----------
    const boss = G.EnemyMgr.all().find(e => e.boss && !e.dead);
    if (boss) {
      const bw = Math.min(420, w - 80), by = adPct > 0 ? 80 : 70;   // (M5 lote 9: bajo el "Reto")
      bar(ctx, (w - bw) / 2, by, bw, 12, boss.hp / boss.maxHp, '#ffcb3d');
      ctx.font = F(800, 10);
      ctx.fillStyle = '#20160a';
      ctx.fillText(boss.name.toUpperCase(), w / 2, by + 10);
      mark('boss', (w - bw) / 2, by, bw, 12);
    }

    // ---------- aviso ----------
    // ---------- shinies fuera de pantalla: destello en el borde ----------
    const cam = G.Camera, pulse = 0.6 + Math.sin(performance.now() / 160) * 0.4;
    for (const e of G.EnemyMgr.shinies()) {
      const [sx, sy] = toHud(e.x, e.y);
      if (sx > 0 && sx < w && sy > 0 && sy < h) continue;
      const M = 34;
      const ey = G.U.clamp(sy, M + 60, h - M - 70), ex = avoid(G.U.clamp(sx, M, w - M), ey, 24);
      const a = Math.atan2(sy - ey, sx - ex);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.translate(ex, ey);
      ctx.fillStyle = '#9ae6ff';
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
      ctx.lineTo(Math.cos(a + 2.5) * 12, Math.sin(a + 2.5) * 12);
      ctx.lineTo(Math.cos(a - 2.5) * 12, Math.sin(a - 2.5) * 12);
      ctx.fill();
      ctx.globalAlpha = 1;
      G.Icons.draw(ctx, 'shiny', -12, -12, 24);
      ctx.restore();
    }

    // Poder de altar activo.
    if (pl.power) {
      const pw = pl.power, txt = pw.def.name.toUpperCase() + ' ' + Math.ceil(pw.t) + 's';
      ctx.font = F(800, 9);
      ctx.textAlign = 'left';
      const tw = ctx.measureText(txt).width + 12;
      roundRect(ctx, bx, py + 34, tw, 15, 7);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill();
      ctx.fillStyle = pw.def.color;
      ctx.fillText(txt, bx + 6, py + 45);
      bx += tw + 5;
    }
    mark('chips', px, py + 34, bx - 5 - px, 15);

    if (G.Coop.active) drawCoop(ctx, w, h, pl, px, py + (bx > px ? 56 : 40));
    else if (G.LocalCoop && G.LocalCoop.on) drawLocalCoop(ctx, w, h, pl, px, py + (bx > px ? 56 : 40));   // (M5 lote 12a)

    // Grieta: flecha grande que late en el borde si no se ve, y si se ve, una
    // flecha que bota encima; en la arena, cuenta atrás.
    const rift = G.Rift.rift;
    if (rift) {
      const [sx, sy] = toHud(rift.x, rift.y - 40);
      const now = performance.now() / 1000, beat = 0.5 + Math.sin(now * 7) * 0.5;
      // MicaSurvivor (M5 lote 5): la guarida Dynamax, en rojo y "GUARIDA ·".
      const den = !!rift.den, LBL = den ? 'GUARIDA · ' : 'GRIETA · ';
      const C1 = den ? '#ffd0d6' : '#e2d0ff', C2 = den ? '#ff3d6e' : '#a06bff', DARK = den ? '#330b14' : '#1a0b33';
      const label = LBL + Math.round(G.U.dist(pl.x, pl.y, rift.x, rift.y) / 32) + ' m · ' + Math.ceil(rift.ttl) + ' s';
      const off = sx < 0 || sx > w || sy < 0 || sy > h;
      ctx.save();
      if (off) {
        const M = 52, ey = G.U.clamp(sy, M + 70, h - M - 80), ex = avoid(G.U.clamp(sx, M, w - M), ey, 40);
        const a = Math.atan2(sy - ey, sx - ex), ca = Math.cos(a), sa = Math.sin(a);
        ctx.translate(ex, ey);
        // Halo que late.
        ctx.globalAlpha = 0.18 + beat * 0.22;
        ctx.fillStyle = den ? '#ff3d6e' : '#b48aff';
        ctx.beginPath(); ctx.arc(0, 0, 30 + beat * 8, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
        const tri = (k) => {
          ctx.beginPath();
          ctx.moveTo(ca * 40 * k, sa * 40 * k);
          ctx.lineTo(Math.cos(a + 2.45) * 20 * k, Math.sin(a + 2.45) * 20 * k);
          ctx.lineTo(Math.cos(a - 2.45) * 20 * k, Math.sin(a - 2.45) * 20 * k);
          ctx.closePath();
        };
        tri(1.12); ctx.fillStyle = DARK; ctx.fill();
        tri(1); ctx.fillStyle = beat > 0.5 ? C1 : C2; ctx.fill();
        ctx.font = F(800, 12);
        ctx.textAlign = ca > 0.3 ? 'right' : ca < -0.3 ? 'left' : 'center';
        const lx = -ca * 34, ly = -sa * 30 + 4;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        ctx.strokeText(label, lx, ly);
        ctx.fillStyle = C1;
        ctx.fillText(label, lx, ly);
      } else {
        // Encima de la grieta: flecha hacia abajo que bota.
        const by = sy - 46 - Math.abs(Math.sin(now * 4)) * 10;
        ctx.translate(sx, by);
        ctx.beginPath(); ctx.moveTo(-15, -12); ctx.lineTo(15, -12); ctx.lineTo(0, 8); ctx.closePath();
        ctx.lineWidth = 4; ctx.strokeStyle = DARK; ctx.stroke();
        ctx.fillStyle = beat > 0.5 ? C1 : C2; ctx.fill();
        ctx.font = F(800, 11); ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
        const l2 = LBL + Math.ceil(rift.ttl) + ' s';
        ctx.strokeText(l2, 0, -18); ctx.fillStyle = C1; ctx.fillText(l2, 0, -18);
      }
      ctx.restore();
    }
    if (G.Rift.inArena) {
      ctx.textAlign = 'center';
      ctx.font = F(800, 12);
      ctx.fillStyle = G.Rift.den ? '#ffd0d6' : '#d9c2ff';
      ctx.fillText((G.Rift.den ? 'GUARIDA · ' : 'GRIETA · ') + G.U.mmss(G.Rift.timeLeft), w / 2, boss ? 98 : 76);
      mark('arena', w / 2 - 60, (boss ? 98 : 76) - 11, 120, 14);
    }

    // Eventos: cuenta atrás, flecha al Pokémon perdido / a la marca y a los duendes.
    G.Events.drawHud(ctx, w, h, pl, F);
    // MicaSurvivor (DLC D3): the arrow to the altar / portal / shrine and a guardian's exhaustion (an Expedition zone only)
    if (G.World.zone && G.ExpClassic) G.ExpClassic.drawHud(ctx, w, h, pl, st, F, mark);

    // Aviso propio al abrirse una grieta (no lo tapan los otros avisos).
    if (rift && rift.t < 4.5) {
      const a = Math.min(1, rift.t * 4, (4.5 - rift.t) * 2), pop = 1 + Math.max(0, 0.25 - rift.t) * 1.6;
      const y0 = h * 0.2;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(w / 2, y0); ctx.scale(pop, pop);
      ctx.font = F(800, 20);
      const t1 = rift.den ? '¡SE HA ABIERTO UNA GUARIDA DYNAMAX!' : '¡SE HA ABIERTO UNA GRIETA!';
      const t2 = rift.den ? 'Sigue la flecha roja: dentro te espera un Pokémon gigante' : 'Sigue la flecha morada: dentro te espera un legendario';
      const bw = Math.min(w - 24, Math.max(ctx.measureText(t1).width, (ctx.font = F(700, 11), ctx.measureText(t2).width)) + 36);
      roundRect(ctx, -bw / 2, -26, bw, 52, 10);
      ctx.fillStyle = 'rgba(26,11,51,.88)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = rift.den ? '#ff3d6e' : '#b48aff'; ctx.stroke();   // (port: borde rojo en la guarida)
      ctx.textAlign = 'center';
      ctx.font = F(800, 20); ctx.fillStyle = '#e2d0ff'; ctx.fillText(t1, 0, -2);
      ctx.font = F(700, 11); ctx.fillStyle = '#c9b0ff'; ctx.fillText(t2, 0, 16);
      ctx.restore();
    }

    const ban = G.Spawner.banner();
    if (ban) {
      const a = Math.min(1, ban.t * 1.6);
      ctx.save();
      ctx.globalAlpha = a;
      // Siempre centrado (antes heredaba la alineación de lo último dibujado, p.
      // ej. la flecha de un duende del tesoro, y salía descolocado).
      ctx.textAlign = 'center';
      ctx.font = F(800, 22);
      ctx.fillStyle = '#ffcb3d';
      ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 4;
      ctx.strokeText(ban.text, w / 2, h * 0.3);
      ctx.fillText(ban.text, w / 2, h * 0.3);
      ctx.restore();
    }

    // ---------- ranura de movimientos ----------
    const S = 54, GAP = 9;
    const n = Math.max(1, pl.slots.length);
    const totalW = n * S + (n - 1) * GAP;
    let sx = (w - totalW) / 2;
    // Por encima de la barra de inicio del iPhone (allí los toques a veces no llegan).
    let sy = h - S - 18 - (touch ? Math.min(28, G.Touch.safeArea().bottom) : 0);
    // En móvil, donde la haya puesto el jugador: el bloque objeto + todos los
    // huecos (aunque aún no estén llenos), por su centro, como en el editor
    // (layout-ui.js); los ataques nuevos van saliendo hacia la derecha.
    const pb = touch && G.Touch.spot('bar');
    if (pb) {
      const nAll = Math.max(n, pl.maxMoves), bw = S + 18 + nAll * S + (nAll - 1) * GAP;
      sx = G.U.clamp(pb[0] * w - bw / 2, 6, Math.max(6, w - bw - 6)) + S + 18;
      sy = G.U.clamp(pb[1] * h - S / 2, 24, h - S - 6);
    }
    const BOND = '#ff8ad8';
    const cdOf = m => m.kind === 'orbit' ? 0 : G.U.clamp(m.t / (m.cd * pl.cdMul), 0, 1);

    for (let i = 0; i < n; i++) {
      const g = pl.slots[i] || [];
      const m = g[0];
      const fused = g.length > 1;
      const on = i === pl.active;
      const x = sx + i * (S + GAP);
      const y = on ? sy - 6 : sy;
      // Tocar (o hacer clic en) un icono activa ese movimiento.
      if (m) G.Touch.addButton(x, y, S, S, () => { if (G.Game.state === 'playing' && pl.active !== i) { pl.setActive(i); G.Audio.sfx('click'); } }, GAP / 2 + 3);
      const col = m ? G.U.TYPE_COLOR[m.type] : '#4a5468';

      // fondo
      roundRect(ctx, x, y, S, S, 12);
      ctx.fillStyle = on ? 'rgba(20,30,50,.95)' : 'rgba(10,16,28,.8)';
      ctx.fill();
      ctx.lineWidth = on ? 2.5 : fused || (m && m.evolved) ? 2 : 1.2;
      // Vínculo: borde rosa. Evolucionado: dorado.
      ctx.strokeStyle = fused ? BOND : m && m.evolved ? '#ffd23f' : on ? col : 'rgba(140,170,210,.22)';
      ctx.stroke();

      if (!m) continue;

      if (fused) {
        // Vínculo: los movimientos en una cuadrícula de 2×2, cada uno con su recarga.
        const C = 22, P = (S - C * 2) / 3;
        g.forEach((gm, k) => {
          const cx = x + P + (k % 2) * (C + P), cy = y + P + Math.floor(k / 2) * (C + P);
          G.Icons.draw(ctx, 'move:' + gm.id, cx, cy, C);
          const f = cdOf(gm);
          if (f > 0) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(cx, cy, C, C * f); }
          if (gm.evolved) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, cy + 0.5, C - 1, C - 1); }
          // Destello al lanzarse.
          const fl = 1 - (performance.now() - (gm.castAt || 0)) / 180;
          if (fl > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (fl * 0.55).toFixed(2) + ')'; ctx.fillRect(cx, cy, C, C); }
        });
      } else {
        // recarga: se vacía de abajo a arriba
        const cdFrac = cdOf(m);
        if (cdFrac > 0) {
          ctx.save();
          roundRect(ctx, x, y, S, S, 12); ctx.clip();
          ctx.fillStyle = 'rgba(0,0,0,.6)';
          ctx.fillRect(x, y, S, S * cdFrac);
          ctx.restore();
        }

        // emblema del tipo + insignia de la familia
        G.Icons.draw(ctx, 'move:' + m.id, x + (S - 32) / 2, y + (S - 32) / 2 - 2, 32);

        // nivel del movimiento (puntitos)
        const dots = m.def.maxLvl;
        const dw = 4, dgap = 2;
        const tw = dots * dw + (dots - 1) * dgap;
        for (let d = 0; d < dots; d++) {
          ctx.fillStyle = d < m.lvl ? col : 'rgba(255,255,255,.18)';
          ctx.fillRect(x + (S - tw) / 2 + d * (dw + dgap), y + S - 9, dw, 3);
        }
      }

      // tecla
      ctx.font = F(800, 9);
      ctx.fillStyle = fused ? BOND : on ? col : 'rgba(180,200,230,.6)';
      ctx.textAlign = 'left';
      ctx.fillText(String(i + 1), x + 3, y + 10);

      // nombre encima del activo (con un vínculo: "Ascuas +2")
      if (on) {
        ctx.font = F(700, 10);
        ctx.textAlign = 'center';
        ctx.fillStyle = fused ? BOND : col;
        ctx.fillText(fused ? m.name + ' +' + (g.length - 1) : m.name, x + S / 2, y - 7);
      }
    }

    mark('moves', sx, sy - 6 - 18, totalW, S + 6 + 18);
    // MicaSurvivor (M2): with a controller, its prev / next move buttons either side of the bar.
    const padOn = G.Pad && G.Pad.mode === 'pad' && !watching;
    if (padOn && n > 1) {
      G.Pad.drawGlyph(ctx, 'prev', sx - S - 18 - 32, sy + S / 2 - 13, 26);
      G.Pad.drawGlyph(ctx, 'next', sx + totalW + 6, sy + S / 2 - 13, 26);
    }

    // ---------- vínculo guardado (aún no hay dos movimientos sueltos) ----------
    if (pl.bonds > 0) {
      const bx = sx + totalW + 12 + (padOn && n > 1 ? 30 : 0), by = sy + S / 2 - 12;
      G.Icons.draw(ctx, 'bond', bx, by, 24);
      if (pl.bonds > 1) {
        ctx.font = F(800, 10);
        ctx.textAlign = 'left';
        ctx.fillStyle = BOND;
        ctx.fillText('×' + pl.bonds, bx + 25, by + 20);
      }
    }

    // ---------- objeto equipado (a la izquierda de los movimientos) ----------
    // (M5 lote 3: con la Mochila, el segundo hueco va encima del primero, cada uno con su nombre.)
    {
      const slots = pl.itemSlots ? pl.itemSlots() : 1;
      for (let k = 0; k < slots; k++) {
        const id = k === 0 ? pl.item : pl.item2;
        const ix = sx - S - 18, iy = sy - k * (S + 20);
        roundRect(ctx, ix, iy, S, S, 12);
        ctx.fillStyle = id ? 'rgba(40,30,10,.9)' : 'rgba(10,16,28,.55)';
        ctx.fill();
        mark('item', ix, iy - 16, S, S + 16);
        ctx.lineWidth = id ? 2 : 1;
        ctx.strokeStyle = id ? '#ffd23f' : 'rgba(140,170,210,.18)';
        ctx.stroke();
        if (id) {
          G.Icons.draw(ctx, id, ix + (S - 36) / 2, iy + (S - 36) / 2, 36);
          ctx.font = F(700, 9);
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffd23f';
          ctx.fillText(G.Items.BY[id].name, ix + S / 2, iy - 6);
        }
      }
    }

    // ---------- Movimiento Z (MicaSurvivor M5 lote 4, main.gd draw_z): botón con su recarga ----------
    if (G.ZMoves && !pl.remote) G.ZMoves.drawButton(ctx, w, h, pl);
    // ---------- MicaSurvivor (DLC D6): in an Expedition zone the Ultimate takes the Z's place (its meter for a viewer) ----------
    if (G.World.zone && G.ExpUlt) { const ur = G.ExpUlt.drawButton(ctx, w, h, pl); if (ur) mark('ult', ur.x - 6, ur.y - 6, ur.s + 12, ur.s + 36); }
    // ---------- Dynamax (M5 lote 5, main.gd draw_dyn): el botón MAX, encima del Z ----------
    if (G.Dynamax && !pl.remote) G.Dynamax.drawButton(ctx, w, h, pl);
    // ---------- Modo Equipo (M5 lote 7, main.gd draw_team / TeamUi): las fichas y el botón de cambiar ----------
    if (G.Team && !pl.remote) G.Team.drawHud(ctx, w, h, pl);
    // ---------- MicaSurvivor (DLC D2): the HOP and SLIDE buttons, in an Expedition zone only (js/expedition/verbs.js) ----------
    if (G.World.zone && G.ExpVerbs && !pl.remote) {
      const vr = G.ExpVerbs.drawButtons(ctx, w, h, pl);
      if (vr) for (const k of ['hop', 'slide']) mark(k, vr[k].x - 6, vr[k].y - 6, vr[k].s + 12, vr[k].s + 26);
    }
    // (M5 lote 10) la columna de la derecha: Z, MAX y el botón de cambiar (con su texto de debajo) y las fichas del equipo
    if (G.ZMoves && !pl.remote && G.ZMoves.activeType(pl) && !G.World.zone) { const r = G.ZMoves.buttonRect(w, h); mark('zmove', r.x - 6, r.y - 6, r.s + 12, r.s + 26); }
    if (G.Dynamax && !pl.remote && G.Dynamax.unlocked()) { const r = G.Dynamax.buttonRect(w, h); mark('dynamax', r.x - 6, r.y - 6, r.s + 12, r.s + 26); }
    if (G.Team && G.Team.on && !pl.remote && G.Team.view(pl).length > 1) {
      G.Team.chipRects().forEach((r, i) => mark('team' + i, r.x, r.y, r.w, r.h));
      const r = G.Team.buttonRect(w, h); mark('swap', r.x - 6, r.y - 6, r.s + 12, r.s + 26);
    }

    // ---------- botón de pausa (táctil) ----------
    if (touch) {
      const sa = G.Touch.safeArea();
      const pp = G.Touch.spot('pause');
      const bx = pp ? G.U.clamp(pp[0] * w - 20, 4, w - 44) : w - 52 - Math.min(44, sa.right);
      const by = pp ? G.U.clamp(pp[1] * h - 20, 10, h - 44) : 12 + Math.min(20, sa.top), bs = 40;
      roundRect(ctx, bx, by, bs, bs, 10);
      ctx.fillStyle = 'rgba(10,16,28,.7)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(244,248,255,.8)'; ctx.stroke();
      ctx.fillStyle = '#f4f8ff';
      ctx.fillRect(bx + 13, by + 11, 5, 18); ctx.fillRect(bx + 22, by + 11, 5, 18);
      G.Touch.addButton(bx, by, bs, bs, () => G.Game.togglePause(), 8);
      mark('pause', bx, by, bs, bs);
    }
    // (M5 lote 10) el joystick fijo (se dibuja sin escalar, en px de pantalla)
    if (touch && G.Settings.get('stickMode') === 'fixed') { const b = G.Touch.stickBase(W, H), r = G.Touch.R(); mark('stick', (b.x - r) / k, (b.y - r) / k, 2 * r / k, 2 * r / k); }

    // pista de controles
    if (st.time < 14 && !watching) mark('hint', w / 2 - Math.min(w, 620) / 2, h - 16, Math.min(w, 620), 16);
    if (watching) { /* (M5 lote 12c: sin pistas de controles) */ }
    else if (st.time < 14 && G.Pad && G.Pad.mode === 'pad') padHint(ctx, w, h);   // MicaSurvivor (M2)
    else if (st.time < 14) {
      ctx.font = F(600, 10);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(180,200,230,.55)';
      // (M5 lote 7: en el Modo Equipo, cómo se cambia de Pokémon)
      const team = G.Team && G.Team.on;
      ctx.fillText(touch ? (team ? 'Arrastra el dedo para moverte  ·  toca un ataque para cambiarlo  ·  toca una ficha para cambiar de Pokémon' : 'Arrastra el dedo para moverte  ·  toca un ataque para cambiarlo')
                         : team ? 'WASD moverse  ·  1-4 / Q / E o clic en un ataque para cambiarlo  ·  Tab cambiar de Pokémon  ·  Esc pausa'
                         : 'WASD moverse  ·  1-4 / Q / E o clic en un ataque para cambiarlo  ·  Esc pausa', w / 2, h - 4);
    }

    // ---------- minimapa (MicaSurvivor M5 lote 10, js/ui/minimap.js) ----------
    if (mm) { G.Minimap.draw(ctx, mm, pl); mark('minimap', mm.x, mm.y, mm.s, mm.s); }

    ctx.restore();
    G.Touch.scaleButtons(1);
  }

  /** MicaSurvivor (M2): the bottom controls hint with the controller's glyphs. */
  function padHint(ctx, w, h) {
    const parts = [['g', 'lstick'], ['t', 'moverse  ·  '], ['g', 'prev'], ['g', 'next'], ['t', 'cambiar de ataque  ·  '],
      ...(G.Team && G.Team.on ? [['g', 'swap'], ['t', 'cambiar de Pokémon  ·  ']] : []), ['g', 'pause'], ['t', 'pausa']];   // (M5 lote 7)
    const GS = 14;
    ctx.font = F(600, 10);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(180,200,230,.7)';
    const items = parts.map(([k, v]) => (k === 'g' ? { g: v, w: GS + 2 } : { t: ' ' + G.T(v.replace(/[\s·]+$/, '')) + (v.includes('·') ? '  ·  ' : ''), w: 0 }));
    for (const it of items) if (it.t) it.w = ctx.measureText(it.t).width;
    let x = (w - items.reduce((a, it) => a + it.w, 0)) / 2;
    const y = h - 4;
    for (const it of items) {
      if (it.g) G.Pad.drawGlyph(ctx, it.g, x, y - GS + 3, GS);
      else ctx.fillText(it.t, x, y);
      x += it.w;
    }
  }

  // ---------------- cooperativo ----------------

  /**
   * - Vida de cada compañero debajo de la tuya.
   * - Flecha en el borde de la pantalla hacia los que no se ven, con su nombre
   *   y a cuántos metros están (roja y parpadeando si está caído).
   * - Si has caído tú: aviso y barra de "te están levantando".
   */
  function drawCoop(ctx, w, h, pl, px, top) {
    const cam = G.Camera;
    const t = performance.now() / 1000;
    let y = top;
    ctx.textAlign = 'left';
    for (const m of G.Coop.mates) {
      if (!m.connected) continue;
      const o = m.pl;
      ctx.font = F(800, 10);
      ctx.fillStyle = m.color;
      ctx.fillText(m.name, px, y + 9);
      const lx = px + 78;
      bar(ctx, lx, y + 1, 110, 8, o.dead ? 0 : o.hp / o.maxHp, o.dead ? '#ff5f6d' : '#5fe08a');
      if (o.dead) {
        ctx.font = F(800, 9);
        ctx.fillStyle = Math.sin(t * 8) > 0 ? '#ff8a96' : '#ffd0d5';
        ctx.fillText('CAÍDO', lx + 116, y + 9);
      }
      y += 15;
    }
    mark('coop', px, top, 200, y - top);

    // Flechas hacia los compañeros fuera de la vista.
    for (const m of G.Coop.mates) {
      if (!m.connected) continue;
      const o = m.pl;
      const [sx, sy] = toHud(o.x, o.y - o.bodyH * 0.5);
      if (sx > 0 && sx < w && sy > 0 && sy < h) continue;
      const M = 42;
      const ey = G.U.clamp(sy, M + 70, h - M - 80), ex = avoid(G.U.clamp(sx, M, w - M), ey, 28);
      const a = Math.atan2(sy - ey, sx - ex);
      const metres = Math.round(G.U.dist(pl.x, pl.y, o.x, o.y) / 32);
      const col = o.dead ? (Math.sin(t * 8) > 0 ? '#ff5f6d' : '#ffd0d5') : m.color;
      ctx.save();
      ctx.translate(ex, ey);
      // Flecha
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.beginPath(); ctx.arc(0, 0, 17, 0, 6.2832); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 28, Math.sin(a) * 28);
      ctx.lineTo(Math.cos(a + 2.4) * 14, Math.sin(a + 2.4) * 14);
      ctx.lineTo(Math.cos(a - 2.4) * 14, Math.sin(a - 2.4) * 14);
      ctx.closePath(); ctx.fill();
      // Inicial del compañero dentro del círculo
      ctx.font = F(800, 14);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(m.name.charAt(0).toUpperCase(), 0, 5);
      // Nombre y distancia: al lado contrario de la flecha, para que no se salga
      const lx = -Math.cos(a) * 30, ly = -Math.sin(a) * 26 + 4;
      ctx.font = F(800, 12);
      const label = (o.dead ? '¡' + m.name + ' necesita ayuda! ' : m.name + ' ') + '· ' + metres + ' m';
      ctx.textAlign = Math.cos(a) > 0.3 ? 'right' : Math.cos(a) < -0.3 ? 'left' : 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.strokeText(label, lx, ly);
      ctx.fillStyle = col;
      ctx.fillText(label, lx, ly);
      ctx.restore();
    }

    // Tú, caído.
    if (pl.dead) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = F(800, 20);
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.75)';
      const msg = G.Coop.players().every(p => p.dead) ? 'Habéis caído todos…' : 'Has caído: un compañero puede levantarte';
      ctx.strokeText(msg, w / 2, h * 0.62);
      ctx.fillStyle = '#ffb0b8';
      ctx.fillText(msg, w / 2, h * 0.62);
      const f = (pl.reviveT || 0) / G.Player.REVIVE_TIME;
      if (f > 0) bar(ctx, w / 2 - 110, h * 0.62 + 12, 220, 10, f, '#5fe08a');
      ctx.restore();
    }
  }

  /**
   * MicaSurvivor (M5 lote 12a): el Modo Cooperativo (js/systems/localcoop.js).
   * - Debajo de tu vida: una ficha con tu compañero y quién lo lleva (IA, o J2 y el stick del jugador 2).
   * - Si se aleja fuera de la vista, una flecha en el borde con su nombre y a cuántos metros está (como net/coop.js).
   * - Si has caído (main.gd 8653-8661): "Espectando: revivirás en N s" y la vida de tu compañero.
   */
  function drawLocalCoop(ctx, w, h, pl, px, top) {
    const LC = G.LocalCoop, o = LC.mate;
    if (!o) return;
    const col = LC.COLOR, p2 = LC.ctrl === 'p2';
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = F(800, 10);
    const label = o.mon.name + ' · ' + (p2 ? 'J2' : 'IA');
    const tw = ctx.measureText(G.I18n.t(label)).width, cw = tw + 28 + (p2 ? 18 : 0);
    roundRect(ctx, px, top, cw, 17, 7);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
    G.Icons.draw(ctx, 'm_coop', px + 4, top + 2, 13);
    ctx.fillStyle = col;
    ctx.fillText(label, px + 21, top + 12);
    if (p2 && G.Pad) G.Pad.drawGlyph(ctx, 'lstick', px + 23 + tw, top + 1, 15);
    mark('coop', px, top, cw, 17);

    // flecha hacia el compañero si no se ve
    if (LC.visible(pl)) {
      const [sx, sy] = toHud(o.x, o.y - o.bodyH * 0.5);
      if (!(sx > 0 && sx < w && sy > 0 && sy < h)) {
        const M = 42;
        const ey = G.U.clamp(sy, M + 70, h - M - 80), ex = avoid(G.U.clamp(sx, M, w - M), ey, 28);
        const a = Math.atan2(sy - ey, sx - ex);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.beginPath(); ctx.arc(0, 0, 17, 0, 6.2832); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 28, Math.sin(a) * 28);
        ctx.lineTo(Math.cos(a + 2.4) * 14, Math.sin(a + 2.4) * 14);
        ctx.lineTo(Math.cos(a - 2.4) * 14, Math.sin(a - 2.4) * 14);
        ctx.closePath(); ctx.fill();
        G.Icons.draw(ctx, 'm_coop', -8, -8, 16);
        const lx = -Math.cos(a) * 30, ly = -Math.sin(a) * 26 + 4;
        ctx.font = F(800, 12);
        const t2 = o.mon.name + ' · ' + Math.round(G.U.dist(pl.x, pl.y, o.x, o.y) / 32) + ' m';
        ctx.textAlign = Math.cos(a) > 0.3 ? 'right' : Math.cos(a) < -0.3 ? 'left' : 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
        ctx.strokeText(t2, lx, ly);
        ctx.fillStyle = col;
        ctx.fillText(t2, lx, ly);
        ctx.restore();
      }
    }
    ctx.restore();

    // caído: espectas a tu compañero
    if (LC.down) {
      const bw = Math.min(300, w - 40), x0 = w / 2 - bw / 2, y0 = Math.round(h * 0.62) - 30;
      ctx.save();
      roundRect(ctx, x0 - 6, y0 - 6, bw + 12, 66, 9);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
      ctx.textAlign = 'center';
      ctx.font = F(800, 14);
      ctx.fillStyle = '#ffd2d8';
      ctx.fillText('Espectando: revivirás en ' + Math.ceil(LC.downLeft) + ' s', w / 2, y0 + 12);
      bar(ctx, x0, y0 + 21, bw, 12, LC.mateHp / Math.max(1, LC.mateMax), '#9ad0ff', 'rgba(0,0,0,.6)');
      ctx.font = F(700, 11);
      ctx.fillStyle = '#cfe6ff';
      ctx.fillText('Vida de tu compañero', w / 2, y0 + 50);
      ctx.restore();
      mark('down', x0 - 6, y0 - 6, bw + 12, 66);
    }
  }

  return {
    draw, roundRect, bar, toHud, avoid,
    /** MicaSurvivor (M5 lote 10): la escala del último fotograma y los rectángulos de sus elementos (unidades del HUD). */
    get k() { return hudK; }, rects: () => rects.map(r => Object.assign({}, r)), get minimap() { return mm; }
  };
})();
