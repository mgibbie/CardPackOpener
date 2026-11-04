/* ============ dmglog.js — daño y derrotas por fuente en la partida ============
 * MicaSurvivor (M5 lote 11): el desglose del final de la partida, del port de Android por JayElDragon
 * (main.gd 351-355 run_dmg / run_kills_by / dmg_src, 2481-2485 / 5168-5170 la fuente del golpe en curso,
 * 4484-4492 lo que se apunta, 758-781 / 858 lo que se guarda al acabar; menu.gd 1801-1890 la tabla
 * "Daño y derrotas por movimiento" con el % de cada fila).
 *
 * Como en el port, se apunta la vida que de verdad pierde el enemigo (lo que absorbe un escudo no, y un
 * golpe nunca cuenta más que la vida que le quedaba), en Enemy.hurt, por donde pasa todo el daño:
 *   - G.Combat.land (todos los movimientos, proyectiles, orbes, minas, torretas, charcos, el Z y el
 *     Dynamax) fija la fuente del golpe con `as(key, fn)`;
 *   - lo que no pasa por ahí se etiqueta donde ocurre: el Casco Dentado ('item'), Piel Tosca y demás
 *     ('ability'), las quemaduras / venenos / golpes de un confundido ('status'), lo que manda un compañero
 *     del cooperativo ('ally'), y el resto (trampas, bombas, lava) cae en 'other'.
 *
 * Claves: 'move:<id>' (un movimiento tuyo) · 'z' (Movimiento Z) · 'dyna' (Dynamax) · 'item' · 'ability' ·
 * 'status' · 'ally' · 'other'. El port junta objetos, estados y trampas en "Otros"; aquí van por separado
 * (lo pide el plan M5) y la tabla da el % de TODAS las filas, que suman 100.
 */
G.DmgLog = (() => {
  let dmg = {}, kills = {}, cur = null;
  // Orden y nombres de las filas que no son movimientos (los movimientos van primero, de más a menos daño).
  const ROWS = [
    ['z', 'Movimiento Z'],
    ['dyna', 'Dynamax'],
    ['item', 'Objetos'],
    ['ability', 'Habilidades'],
    ['status', 'Estados alterados'],
    ['ally', 'Compañero / equipo'],
    ['other', 'Otros (trampas, bombas, terreno)']
  ];
  const NAME = Object.fromEntries(ROWS);

  function reset() { dmg = {}; kills = {}; cur = null; }

  /** La clave de la fuente de un golpe de G.Combat.land (`src`: el movimiento, el proyectil o el del Z). */
  function keyOf(src) {
    if (!src) return 'other';
    if (src.dsrc) return src.dsrc;                       // 'dyna' (las ondas Max) u otra fuente fija
    if (src.mkind === 'zmove') return 'z';
    if (typeof src.mid === 'string' && src.mid) return 'move:' + src.mid;   // proyectiles y orbes
    if (src.def && typeof src.id === 'string') return 'move:' + src.id;    // el movimiento (o su vista)
    return 'other';
  }

  /** Ejecuta fn con `key` como fuente de lo que haga daño dentro (anidable). */
  function as(key, fn) {
    const prev = cur;
    cur = key;
    try { return fn(); } finally { cur = prev; }
  }

  /** Enemy.hurt: el enemigo ha perdido `lost` de vida (y ha caído si `killed`). */
  function note(lost, killed, fallback = 'other') {
    if (!(lost > 0) && !killed) return;
    const k = cur || fallback;
    if (lost > 0) dmg[k] = (dmg[k] || 0) + lost;
    if (killed) kills[k] = (kills[k] || 0) + 1;
  }

  /**
   * Las filas para el final de la partida. `moves`: los movimientos que llevas al acabar ({ id, name, lvl,
   * evolved }); el daño de movimientos que ya no llevas (cambiados en el Modo Equipo, de un compañero) va a
   * "Compañero / equipo", como en el port (main.gd 768-777). Los % se reparten por el mayor resto, así que
   * suman 100 exactos.
   */
  function summary(moves = []) {
    const own = new Set(moves.map(m => m.id));
    const d = Object.assign({}, dmg), k = Object.assign({}, kills);
    for (const key of Object.keys(d).concat(Object.keys(k))) {
      if (key.startsWith('move:') && !own.has(key.slice(5))) {
        d.ally = (d.ally || 0) + (d[key] || 0); k.ally = (k.ally || 0) + (k[key] || 0);
        delete d[key]; delete k[key];
      }
    }
    const rows = moves.map(m => ({ key: 'move:' + m.id, id: m.id, name: m.name, lvl: m.lvl, evo: !!m.evolved,
                                   dmg: Math.round(d['move:' + m.id] || 0), kills: k['move:' + m.id] || 0 }))
      .sort((a, b) => b.dmg - a.dmg);
    for (const [key, name] of ROWS) {
      const v = Math.round(d[key] || 0), n = k[key] || 0;
      if (v > 0 || n > 0) rows.push({ key, name, dmg: v, kills: n });
    }
    const total = rows.reduce((t, r) => t + r.dmg, 0);
    // % por el mayor resto: la parte entera de cada uno y los puntos que faltan, a los de mayor decimal.
    if (total > 0) {
      const raw = rows.map(r => r.dmg * 100 / total);
      rows.forEach((r, i) => { r.pct = Math.floor(raw[i]); });
      let left = 100 - rows.reduce((t, r) => t + r.pct, 0);
      const order = rows.map((r, i) => i).sort((a, b) => (raw[b] - Math.floor(raw[b])) - (raw[a] - Math.floor(raw[a])));
      for (const i of order) { if (left <= 0) break; rows[i].pct++; left--; }
    } else rows.forEach(r => { r.pct = 0; });
    return { rows, total, kills: rows.reduce((t, r) => t + r.kills, 0) };
  }

  return { ROWS, NAME, reset, keyOf, as, note, summary,
           get cur() { return cur; }, get raw() { return { dmg: Object.assign({}, dmg), kills: Object.assign({}, kills) }; } };
})();
