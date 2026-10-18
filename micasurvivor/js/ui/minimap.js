/* ============ minimap.js — el minimapa redondo (MicaSurvivor M5 lote 10) ============
 * Del port de Android de JayElDragon (MIT, github.com/JayElDragon/poke-survivor): main.gd 546-549 (dónde va) y
 * 7798-8120 (class Minimap). Los números son del port:
 *   - Redondo, 200 px de caja (a 1280×720) con un círculo de 96 de radio y el aro blanco, y una "N" arriba.
 *   - Enseña 48 casillas de diámetro (4 px por casilla), centrado en ti, y se desplaza contigo.
 *   - Terreno de verdad (suelo, flores, paredes con su cara y su luz, agua / lava con la orilla y la espuma) y
 *     niebla de exploración: a 14 casillas o menos se ve a pleno color y queda explorado; lo explorado se ve
 *     apagado (niebla 0,5) y lo que no, casi negro (0,94).
 *   - Cofres, altares y manantiales a 20 casillas o menos (o en una casilla ya explorada); con un aro que late
 *     si están cerca. Trampas sólo a 9 casillas o menos. Enemigos (puntos rojos) sólo a 12 casillas o menos.
 *   - Los jefes siempre, con su Pokémon dentro de un círculo rojo, pegados al borde si están lejos. La grieta
 *     siempre, morada, también pegada al borde, con una puntita en el aro que apunta hacia ella.
 *   - Tú en el centro, con tu Pokémon y un aro dorado.
 *   - Se oculta en la arena de la grieta, durante la Sentencia de Arceus y si estás debilitado.
 * El port lo pone arriba a la izquierda (8, 92), debajo de la vida. Aquí va en esa columna, en el primer
 * hueco libre bajo lo que ya hay (vida, habilidad y mejoras, fichas del Modo Equipo, compañeros del grupo):
 * hud.js apunta el rectángulo de cada elemento y place() busca el sitio más cercano que no pise nada; si en
 * la columna no cabe (un móvil en Modo Equipo con el joystick fijo), a la derecha de esa columna, y si
 * tampoco, más pequeño (hasta 72). Mide 200 a 1280×720 y lo proporcional en pantallas más bajas (como el
 * port, que escala su vista de 720 de alto), por el tamaño de la interfaz.
 * Desviaciones: también se oculta mientras eliges cartas, objetos o en la pausa (el port lo tapa con esas
 * pantallas); la guarida Dynamax sale en rojo como en el HUD; los compañeros del grupo salen como puntos de su
 * color; los cofres / altares / trampas son las figuras de respaldo del port (no sus sprites).
 */
G.Minimap = (() => {
  const K = {
    N: 50, VIEW: 48, PX: 4, BOX: 200, CT: 100, RAD: 96, SIGHT: 14, RADAR: 20, TRAP_R: 9, FOE_R: 12,
    size: 200, refH: 720, x: 16, y: 92, minSize: 72, gap: 8, edge: 12
  };
  const TRAP_COL = ['#c86bdc', '#8bd94a', '#ff7b3d'];   // interact.js: veneno, pegajosa, explosiva
  const POWER_COL = ['#ff5f6d', '#5fd4ff', '#ff8ad8', '#ffd23f'];

  // ---------------- dónde va ----------------
  function shown() {
    const g = G.Game, pl = g && g.player;
    if (!G.Display || !G.Display.minimapOn() || !pl || pl.dead) return false;
    if (g.state !== 'playing' && g.state !== 'held') return false;
    if (G.Rift && G.Rift.inArena) return false;
    if (G.Judgment && G.Judgment.active) return false;
    return true;
  }
  const hits = (a, r, m) => a.x < r.x + r.w + m && a.x + a.s + m > r.x && a.y < r.y + r.h + m && a.y + a.s + m > r.y;
  /**
   * El hueco: w × h en unidades del HUD, `rects` los elementos del HUD (hud.js mark), H el alto real (CSS px).
   * Devuelve { x, y, s } o null si no se enseña.
   */
  function place(w, h, rects, H = h) {
    if (!shown()) return null;
    const list = (rects || []).filter(r => r.name !== 'minimap' && r.name !== 'xp');
    const k = Math.min(1, H / K.refH);
    const s0 = Math.round(K.size * k), y0 = Math.max(K.y * k, 8);
    const sa = G.Touch && G.Touch.active ? G.Touch.safeArea() : { left: 0 };
    const x0 = K.x + Math.min(44, sa.left || 0) / ((G.HUD && G.HUD.k) || 1);
    const free = c => c.x + c.s <= w - 8 && c.y + c.s <= h - 8 && !list.some(r => hits(c, r, K.gap));
    const scan = (x, s) => { for (let y = y0; y + s <= h - 8; y += 2) { const c = { x, y, s }; if (free(c)) return c; } return null; };
    for (let s = s0; s >= K.minSize; s -= 8) {
      let c = scan(x0, s);
      if (c) return c;
      // a la derecha de lo que hay en la columna
      const xs = [...new Set(list.filter(r => r.x < x0 + s && r.x + r.w > x0).map(r => r.x + r.w + K.gap))].sort((a, b) => a - b);
      for (const x of xs) { c = scan(x, s); if (c) return c; }
    }
    return null;
  }

  // ---------------- el terreno (una imagen de N×N casillas, 1 px cada una) ----------------
  let terr = null, fog = null, tctx = null, fctx = null, tImg = null, fImg = null;
  let ti = { x: 1e9, y: 1e9 }, bio = -1, sd = -1, explored = new Set();
  function reset() { ti = { x: 1e9, y: 1e9 }; bio = -1; sd = -1; explored = new Set(); }
  function canvases() {
    if (terr) return true;
    if (typeof document === 'undefined') return false;
    terr = document.createElement('canvas'); terr.width = terr.height = K.N;
    fog = document.createElement('canvas'); fog.width = fog.height = K.N;
    tctx = terr.getContext('2d'); fctx = fog.getContext('2d');
    tImg = tctx.createImageData(K.N, K.N); fImg = fctx.createImageData(K.N, K.N);
    return true;
  }
  const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  /** main.gd _tile_color, con la paleta del bioma de la web (son los mismos colores). */
  function tileColor(pal, tx, ty) {
    const W = G.World, at = (x, y) => W.terrain(x, y);
    const hh = G.U.hash(tx, ty, 31), t = at(tx, ty);
    let c;
    if (t === 1) {
      if (at(tx, ty + 1) !== 1) c = rgb(pal.wallFace[0]);
      else if (at(tx, ty - 1) !== 1) c = rgb(pal.wallLight);
      else c = rgb(pal.wallTop[Math.floor(hh * 3) % 3]);
    } else if (t === 2) {
      const inner = at(tx - 1, ty) === 2 && at(tx + 1, ty) === 2 && at(tx, ty - 1) === 2 && at(tx, ty + 1) === 2;
      c = rgb(inner ? pal.liqDeep : pal.liq);
      if (hh > 0.92) c = lerp(c, rgb(pal.foam), 0.55);
    } else {
      c = rgb(pal.floor[Math.floor(hh * 3) % 3]);
      if (hh > 0.965) c = rgb(pal.flowers[Math.floor(hh * 1000) % 3]);
      else if (hh < 0.07) c = lerp(c, rgb(pal.grass[2]), 0.5);
      if (at(tx, ty + 1) === 1) c = c.map(v => v * 0.75);
      else if (at(tx + 1, ty) === 2 || at(tx - 1, ty) === 2 || at(tx, ty + 1) === 2 || at(tx, ty - 1) === 2) c = lerp(c, rgb(pal.shore), 0.35);
    }
    return c;
  }
  function refresh(ix, iy) {
    const pal = G.Tiles.BIOMES[G.World.biome] || G.Tiles.BIOMES[0], half = K.N / 2, d = tImg.data;
    for (let r = 0; r < K.N; r++) for (let c = 0; c < K.N; c++) {
      const col = tileColor(pal, ix - half + c, iy - half + r), o = (r * K.N + c) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    tctx.putImageData(tImg, 0, 0);
  }
  /** Descubre lo que hay alrededor y repinta la niebla (main.gd _fog_update). */
  function fogUpdate(ix, iy) {
    const S = K.SIGHT, half = K.N / 2, d = fImg.data;
    for (let oy = -S; oy <= S; oy++) for (let ox = -S; ox <= S; ox++) if (ox * ox + oy * oy <= S * S) explored.add((ix + ox) + ',' + (iy + oy));
    for (let r = 0; r < K.N; r++) for (let c = 0; c < K.N; c++) {
      const tx = ix - half + c, ty = iy - half + r, ox = tx - ix, oy = ty - iy;
      const a = ox * ox + oy * oy <= S * S ? 0 : explored.has(tx + ',' + ty) ? 0.5 : 0.94, o = (r * K.N + c) * 4;
      d[o] = 8; d[o + 1] = 13; d[o + 2] = 28; d[o + 3] = Math.round(a * 255);
    }
    fctx.putImageData(fImg, 0, 0);
  }

  // ---------------- dibujar ----------------
  let drawn = [];   // para las pruebas: lo que se ha dibujado y dónde (unidades del HUD)
  /** Un punto del mundo en coordenadas de la caja del port (0..200), sin recortar. */
  function pt(wx, wy, pl) {
    const TS = G.World.TS;
    return { x: ((wx - pl.x) / TS + K.VIEW / 2) * K.PX + 4, y: ((wy - pl.y) / TS + K.VIEW / 2) * K.PX + 4 };
  }
  const inside = (q, pad = 0) => Math.hypot(q.x - K.CT, q.y - K.CT) <= K.RAD - pad;
  /** Pegado al borde si queda fuera (main.gd _edge). */
  function edge(q) {
    const dx = q.x - K.CT, dy = q.y - K.CT, d = Math.hypot(dx, dy), lim = K.RAD - K.edge;
    return d > lim ? { x: K.CT + dx / d * lim, y: K.CT + dy / d * lim } : q;
  }
  /** El fotograma actual de un Pokémon, a mx px como mucho (main.gd _pk_at). */
  function mon(ctx, ent, mx, q) {
    const a = ent && ent.anim;
    if (!a) return false;
    const m = G.Sprites.animMeta(a.dex, a.cur, a.shiny), s = G.Sprites.sheet(a.dex, a.cur, a.shiny);
    if (!m || !s || !s.ready) return false;
    const k = mx / Math.max(m.w, m.h), fw = m.w * k, fh = m.h * k;
    ctx.drawImage(s.img, Math.min(a.frame || 0, m.n - 1) * m.w, Math.min(a.dir || 0, m.r - 1) * m.h, m.w, m.h,
      Math.round(q.x - fw / 2), Math.round(q.y - fh / 2), fw, fh);
    return true;
  }
  const circle = (ctx, x, y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); };
  const ring = (ctx, x, y, r, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke(); };

  function draw(ctx, mm, pl) {
    if (!mm || !pl || !canvases()) return;
    const W = G.World, TS = W.TS, sc = mm.s / K.BOX;
    const ix = Math.floor(pl.x / TS), iy = Math.floor(pl.y / TS);
    if (ix !== ti.x || iy !== ti.y || bio !== W.biome || sd !== W.seed) {
      bio = W.biome; sd = W.seed; ti = { x: ix, y: iy };
      refresh(ix, iy);
      fogUpdate(ix, iy);
    }
    const t = performance.now() / 1000, pul = 0.6 + 0.4 * Math.sin(t * 6);
    const out = [];
    const rec = (kind, q) => out.push({ kind, x: mm.x + q.x * sc, y: mm.y + q.y * sc });
    ctx.save();
    ctx.translate(mm.x, mm.y);
    ctx.scale(sc, sc);
    ctx.save();
    ctx.beginPath(); ctx.arc(K.CT, K.CT, 97, 0, 6.2832); ctx.clip();
    circle(ctx, K.CT, K.CT, 97, 'rgb(8,13,28)');
    const prevSm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    const px = pl.x / TS, py = pl.y / TS, fx = px - Math.floor(px), fy = py - Math.floor(py), half = K.N / 2;
    const sx = half + fx - K.VIEW / 2, sy = half + fy - K.VIEW / 2, box = K.VIEW * K.PX;
    ctx.drawImage(terr, sx, sy, K.VIEW, K.VIEW, 4, 4, box, box);
    ctx.drawImage(fog, sx, sy, K.VIEW, K.VIEW, 4, 4, box, box);
    ctx.imageSmoothingEnabled = prevSm;
    // cofres, altares, manantiales y trampas
    const radar = K.RADAR * TS, trapR = K.TRAP_R * TS, foeR = K.FOE_R * TS;
    for (const p of W.propsAround(pl.x, pl.y, K.VIEW / 2 * TS)) {
      const k = p.type;
      if (k !== 'chest' && k !== 'bigchest' && k !== 'altar' && k !== 'spring' && k !== 'trap') continue;
      if (p.used || p.hp <= 0) continue;
      const q = pt(p.x, p.y, pl);
      if (!inside(q, 6)) continue;
      const d = Math.hypot(p.x - pl.x, p.y - pl.y);
      if (k === 'trap') {
        if (d > trapR) continue;
        const tc = TRAP_COL[p.kind] || TRAP_COL[2];
        ctx.globalAlpha = 0.35; circle(ctx, q.x, q.y, 10.5, tc); ctx.globalAlpha = 1;
        circle(ctx, q.x, q.y, 4, tc);
        rec('trap', q);
        continue;
      }
      if (d > radar && !explored.has(p.tx + ',' + p.ty)) continue;
      const near = d <= radar;
      if (k === 'chest' || k === 'bigchest') {
        if (near) { ctx.globalAlpha = 0.75 * pul; ring(ctx, q.x, q.y, 11 + 2 * pul, '#ffd933', 1.5); ctx.globalAlpha = 1; }
        ctx.fillStyle = '#ffd23f'; ctx.fillRect(q.x - 5, q.y - 4, 10, 8);
        ctx.strokeStyle = '#7a4a10'; ctx.lineWidth = 1; ctx.strokeRect(q.x - 5, q.y - 4, 10, 8);
        rec('chest', q);
      } else if (k === 'altar') {
        const col = POWER_COL[p.kind] || '#ffffff';
        if (near) { ctx.globalAlpha = 0.8 * pul; ring(ctx, q.x, q.y, 13 + 2 * pul, col, 1.5); ctx.globalAlpha = 1; }
        circle(ctx, q.x, q.y, 5, col);
        rec('altar', q);
      } else {
        ctx.globalAlpha = p.charge > 0.02 ? 1 : 0.45;
        circle(ctx, q.x, q.y, 5, '#2fc6e8');
        ctx.globalAlpha = 1;
        rec('spring', q);
      }
    }
    // enemigos (sólo a corta distancia)
    const foes = G.EnemyMgr.all();
    ctx.fillStyle = 'rgba(255,64,77,.95)';
    for (const e of foes) {
      if (e.dead || e.boss) continue;
      if (Math.hypot(e.x - pl.x, e.y - pl.y) > foeR) continue;
      const q = pt(e.x, e.y, pl);
      if (!inside(q, 2)) continue;
      ctx.fillRect(q.x - 1, q.y - 1, 2.5, 2.5);
      rec('enemy', q);
    }
    // compañeros del grupo (desviación: el port no los enseña)
    if (G.Coop && G.Coop.active) {
      for (const m of G.Coop.mates) {
        if (!m.connected || !m.pl) continue;
        const q = edge(pt(m.pl.x, m.pl.y, pl));
        circle(ctx, q.x, q.y, 6, '#ffffff'); circle(ctx, q.x, q.y, 4.5, m.color || '#5fe08a');
        rec('mate', q);
      }
    }
    // MicaSurvivor (M5 lote 12a): el compañero del Modo Cooperativo, con el segundo color del grupo (tampoco en el port)
    if (G.LocalCoop && G.LocalCoop.visible(pl)) {
      const o = G.LocalCoop.mate, q = edge(pt(o.x, o.y, pl));
      circle(ctx, q.x, q.y, 6, '#ffffff'); circle(ctx, q.x, q.y, 4.5, G.LocalCoop.COLOR);
      rec('mate', q);
    }
    // jefes (siempre, en el borde si están lejos)
    for (const e of foes) {
      if (e.dead || !e.boss) continue;
      const q = edge(pt(e.x, e.y, pl));
      ctx.globalAlpha = 0.45 + 0.2 * pul; circle(ctx, q.x, q.y, 11, 'rgb(224,36,59)'); ctx.globalAlpha = 1;
      ring(ctx, q.x, q.y, 11, '#ffffff', 1.5);
      if (!mon(ctx, e, 22, q)) circle(ctx, q.x, q.y, 5, '#e0243a');
      rec('boss', q);
    }
    // la grieta / la guarida (siempre), con una puntita en el aro si queda fuera
    const rift = G.Rift && G.Rift.rift;
    if (rift) {
      const den = !!rift.den, c1 = den ? '#ff3d6e' : '#9b4dff', halo = den ? 'rgba(255,61,110,.35)' : 'rgba(179,102,255,.35)';
      const raw = pt(rift.x, rift.y, pl), q = edge(raw);
      circle(ctx, q.x, q.y, 7.5 + 1.5 * pul, halo);
      circle(ctx, q.x, q.y, 6, '#ffffff');
      circle(ctx, q.x, q.y, 4.8, c1);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, 6.2832 * 0.75); ctx.stroke();
      if (Math.hypot(raw.x - K.CT, raw.y - K.CT) > K.RAD - K.edge) {
        const d = Math.hypot(raw.x - K.CT, raw.y - K.CT), ax = (raw.x - K.CT) / d, ay = (raw.y - K.CT) / d;
        const bx = K.CT + ax * (K.RAD - 2), by = K.CT + ay * (K.RAD - 2), qx = -ay, qy = ax;
        ctx.fillStyle = den ? 'rgba(255,208,214,.95)' : 'rgba(230,209,255,.95)';
        ctx.beginPath(); ctx.moveTo(bx + ax * 7, by + ay * 7); ctx.lineTo(bx - ax * 2 + qx * 6, by - ay * 2 + qy * 6); ctx.lineTo(bx - ax * 2 - qx * 6, by - ay * 2 - qy * 6); ctx.closePath(); ctx.fill();
      }
      rec(den ? 'den' : 'rift', q);
    }
    // tú
    const c = { x: K.CT, y: K.CT };
    ctx.globalAlpha = 0.35; circle(ctx, c.x, c.y, 9, '#ffffff'); ctx.globalAlpha = 1;
    ring(ctx, c.x, c.y, 9, '#ffd23f', 1.5);
    if (!mon(ctx, pl, 20, c)) circle(ctx, c.x, c.y, 3, '#ffd23f');
    rec('you', c);
    ctx.restore();
    // el aro y la "N" (MiniRing)
    ring(ctx, K.CT, K.CT, 97.5, 'rgba(5,10,26,.9)', 3);
    ring(ctx, K.CT, K.CT, 96, '#f4f8ff', 2);
    ctx.font = '700 13px Pixelify,"Segoe UI",system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.fillText('N', K.CT, 20);
    ctx.restore();
    drawn = out;
  }

  return {
    K, shown, place, draw, reset, pt, edge,
    /** Para las pruebas: lo dibujado en el último fotograma ({ kind, x, y } en unidades del HUD) y lo explorado. */
    get drawn() { return drawn.map(d => Object.assign({}, d)); }, get explored() { return explored.size; }
  };
})();
