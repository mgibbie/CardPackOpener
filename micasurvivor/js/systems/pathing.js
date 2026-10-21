/* ============ pathing.js — los enemigos rodean rocas y lagos ============
 * Un "campo de distancias" por jugador: cada pocas décimas se hace un
 * recorrido en anchura (BFS) por las casillas de alrededor del jugador,
 * apuntando cuántos pasos faltan desde cada casilla hasta él. Un enemigo
 * sólo tiene que ir hacia la casilla vecina con menos pasos, y así encuentra
 * el camino alrededor de paredes, rocas, árboles y charcos peligrosos.
 *
 *   - 8 vecinos, sin cortar esquinas (no se cuela entre dos rocas en diagonal).
 *   - Bloquean: paredes, objetos sólidos y lava/veneno/descarga.
 *     El agua se puede cruzar (sólo frena).
 *   - Los que flotan (G.Sprites.hovers) no lo necesitan: van en línea recta.
 *
 * Coste: R=28 casillas de radio → 57×57 = 3.249 casillas por jugador, cada
 * 0,35 s. Los enemigos fuera del campo (muy lejos) van en línea recta.
 *
 * MicaSurvivor (DLC D1): in an Expedition zone (G.World.zone) each cell holds its LAYER MASK (G.World.maskAt: a bit
 * per height it joins, 0 = blocked) instead of 1, and a step only joins two cells whose masks share a bit: a ground
 * enemy goes round a cliff and up or down its ramp. Without a zone (every base mode) the code below runs exactly as
 * before (the `Z` branches are skipped).
 */
G.Path = (() => {
  const R = 28, N = R * 2 + 1, EVERY = 0.35;
  const UNSEEN = 0x7fff;
  const fields = new Map();          // jugador -> { ox, oy, dist: Int16Array, t }
  const queue = new Int32Array(N * N);
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let timer = 0;

  function build(pl) {
    const TS = G.World.TS;
    const px = Math.floor(pl.x / TS), py = Math.floor(pl.y / TS);
    const ox = px - R, oy = py - R;
    let f = fields.get(pl);
    if (!f) { f = { dist: new Int16Array(N * N) }; fields.set(pl, f); }
    f.ox = ox; f.oy = oy;
    const dist = f.dist;
    dist.fill(UNSEEN);
    // Casillas transitables del área (se consultan una vez).
    const open = f.open || (f.open = new Uint8Array(N * N));
    const Z = !!G.World.zone;
    f.z = Z;
    if (Z) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) open[j * N + i] = G.World.walkable(ox + i, oy + j) ? G.World.maskAt(ox + i, oy + j) : 0;
    else for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) open[j * N + i] = G.World.walkable(ox + i, oy + j) ? 1 : 0;

    const start = R * N + R;
    if (Z) open[start] = open[start] || pl.zMask || 1;   // (DLC D1: the player's own layer)
    else open[start] = 1;                 // donde está el jugador siempre cuenta
    dist[start] = 0;
    let head = 0, tail = 0;
    queue[tail++] = start;
    while (head < tail) {
      const c = queue[head++];
      const cx = c % N, cy = (c / N) | 0, d = dist[c] + 1;
      for (let k = 0; k < 8; k++) {
        const nx = cx + D8[k][0], ny = cy + D8[k][1];
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const n = ny * N + nx;
        if (!open[n] || dist[n] !== UNSEEN) continue;
        if (Z) { if (!joins(open, n, c, cy * N + nx, ny * N + cx, k)) continue; }   // (DLC D2: an enemy on n steps to c)
        // Diagonal: las dos casillas de al lado tienen que estar libres.
        else if (k >= 4 && (!open[cy * N + nx] || !open[ny * N + cx])) continue;
        dist[n] = d;
        queue[tail++] = n;
      }
    }
  }

  /**
   * DLC D1: can a ground enemy step from cell c to cell n (k >= 4: a diagonal past the side cells a and b)? Two cells
   * join if their masks share a bit (D1), or (D2, walking down a ledge) if n is exactly one level below: a ledge is a
   * one-way edge, down only (G.World.ledgeDown, collideZone's own rule). The BFS runs from the player outwards, so it
   * asks it the other way round (from the farther cell to the nearer one). Pure: the same field from the same zone.
   */
  const step = (m, t) => !!(m & t) || G.World.ledgeDown(m, t);
  function joins(open, c, n, a, b, k, mc) {
    const m = mc || open[c], t = open[n];
    if (!step(m, t)) return false;
    if (k < 4) return true;
    return step(m, open[a]) && step(open[a], t) && step(m, open[b]) && step(open[b], t);
  }

  /** Recalcula los campos de los jugadores vivos (lo llama el anfitrión / solitario). */
  function update(dt, players) {
    timer -= dt;
    if (timer > 0) return;
    timer = EVERY;
    for (const p of [...fields.keys()]) if (!players.includes(p)) fields.delete(p);
    for (const p of players) if (!p.dead) build(p);
  }

  /**
   * Dirección (normalizada) para que `e` llegue hasta `pl` rodeando
   * obstáculos, o null si no hace falta (cerca, fuera del campo o sin camino).
   */
  function dirFor(e, pl) {
    const f = fields.get(pl);
    if (!f) return null;
    const TS = G.World.TS;
    const tx = Math.floor(e.x / TS) - f.ox, ty = Math.floor(e.y / TS) - f.oy;
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return null;
    const here = f.dist[ty * N + tx];
    if (here <= 1 || here === UNSEEN) return null;   // pegado a ti, o sin camino: directo
    // Con vista despejada hasta el jugador, en línea recta (más natural).
    // Se comprueba cada 0,2 s por enemigo (es lo más caro).
    const now = performance.now();
    if (!e.losAt || now - e.losAt > 200) { e.losAt = now; e.los = f.z ? clearLineZ(f, e.x, e.y, pl.x, pl.y, e.r) : clearLine(f, e.x, e.y, pl.x, pl.y, e.r); }
    if (e.los) return null;
    // Siguiente casilla del camino (la vecina con menos pasos, sin cortar esquinas).
    let bx = tx, by = ty, best = here;
    const em = f.z ? (f.open[ty * N + tx] || e.zMask || 0) : 0;   // (DLC D1: the enemy's layer)
    for (let k = 0; k < 8; k++) {
      const x = tx + D8[k][0], y = ty + D8[k][1];
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const v = f.dist[y * N + x];
      if (v >= best) continue;
      if (f.z) { if (!joins(f.open, ty * N + tx, y * N + x, ty * N + x, y * N + tx, k, em)) continue; }
      else if (k >= 4 && (!f.open[ty * N + x] || !f.open[y * N + tx])) continue;
      best = v; bx = x; by = y;
    }
    if (bx === tx && by === ty) return null;
    let gx = (f.ox + bx + 0.5) * TS, gy = (f.oy + by + 0.5) * TS;
    // Si va descentrado y el atajo hasta esa casilla roza un obstáculo,
    // primero al centro de la suya (así no se engancha en las esquinas).
    if (!(f.z ? clearLineZ(f, e.x, e.y, gx, gy, e.r) : clearLine(f, e.x, e.y, gx, gy, e.r))) { gx = (f.ox + tx + 0.5) * TS; gy = (f.oy + ty + 0.5) * TS; }
    return G.U.norm(gx - e.x, gy - e.y);
  }

  /** ¿Cabe un cuerpo de radio r en línea recta de (ax,ay) a (bx,by)? */
  function clearLine(f, ax, ay, bx, by, r) {
    const TS = G.World.TS;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1) return true;
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    const w = Math.min(r * 0.9, TS * 0.45);
    for (let d = 0; d <= len; d += TS * 0.4) {
      const cx = ax + ux * d, cy = ay + uy * d;
      for (const s of [-w, 0, w]) {
        const x = Math.floor((cx - uy * s) / TS) - f.ox, y = Math.floor((cy + ux * s) / TS) - f.oy;
        if (x < 0 || y < 0 || x >= N || y >= N) return false;
        if (!f.open[y * N + x]) return false;
      }
    }
    return true;
  }

  /**
   * DLC D1: clearLine in a zone: along each of the three lines every next cell must share a layer bit with the one
   * before it (so a straight line may go up a ramp, never up a cliff edge; D2: it may go down a ledge, one level).
   */
  function clearLineZ(f, ax, ay, bx, by, r) {
    const TS = G.World.TS;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1) return true;
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    const w = Math.min(r * 0.9, TS * 0.45), offs = [-w, 0, w], run = [0, 0, 0];
    for (let d = 0; d <= len; d += TS * 0.4) {
      const cx = ax + ux * d, cy = ay + uy * d;
      for (let s = 0; s < 3; s++) {
        const x = Math.floor((cx - uy * offs[s]) / TS) - f.ox, y = Math.floor((cy + ux * offs[s]) / TS) - f.oy;
        if (x < 0 || y < 0 || x >= N || y >= N) return false;
        const m = f.open[y * N + x];
        if (!m || (run[s] && !step(run[s], m))) return false;   // (D2: or one level down a ledge)
        run[s] = m;
      }
    }
    return true;
  }

  function clear() { fields.clear(); timer = 0; }

  return { update, dirFor, clear };
})();
