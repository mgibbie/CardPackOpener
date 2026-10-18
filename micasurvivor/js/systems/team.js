/* ============ team.js — Modo Equipo (MicaSurvivor M5 lote 7) ============
 * Del port de Android de JayElDragon (MIT, github.com/JayElDragon/poke-survivor): save_data.gd 21 /
 * 189-203 (team_list: quién va en el equipo), menu.gd 1640-1657 / 2158-2174 (la tarjeta del modo y
 * "Elegir equipo"), main.gd 265-269 (estado), 436-438 / 498 (empezar), 642 / 667-668 / 704-705 (Tab y
 * el botón del mando), 806-807 / 844-846 (al acabar), 1055 (_team_tick), 1425-1428 (_pdex: el Pokémon
 * activo), 1733-1804 (_setup_team, _team_next, _swap_team, _team_tick), 1885-1902 (al caer: Segunda
 * oportunidad primero, luego entra el siguiente), 8359-8396 (las fichas del equipo en el HUD),
 * 8815-8863 (TeamUi: el botón táctil de cambiar), pad.gd 17 / 42 (la acción swap, R3 por defecto) y
 * progress.gd 129-131 / 253 / 316 / 330 (logros, la misión de Cristal Z de Hada y las misiones; en
 * js/data/achievements.js, js/systems/zmoves.js y js/data/missions.js). Los números son del port.
 *
 *   Equipo: hasta 3 Pokémon tuyos. Se desbloquea con 2 Pokémon. "Elegir equipo (hasta 3)" vacía el
 *   equipo guardado y lo vas llenando tocando Pokémon (otra vez = lo quitas); con 3 vuelve solo. Lo
 *   que falte se rellena como en el port: si no has elegido ninguno, tu compañero; luego los primeros
 *   que conseguiste, hasta 3 (con 2 Pokémon, un equipo de 2). El primero es el que empieza: sus
 *   mejoras, su veto, sus atajos y su movimiento inicial son los de la partida.
 *
 *   Cambiar (Tab, R3 o la acción `swap` del mando, el botón táctil o tocar una ficha): al siguiente
 *   que siga en pie (o a la ficha tocada). 3 s de espera entre cambios. Entra con 1 s invulnerable
 *   (1,5 s si entra porque el otro ha caído) y un destello; un aro dorado, "¡Adelante, X!".
 *   Cada uno tiene su vida: la base es la de su especie + la mejora de Vida (a la mitad con Frágil).
 *   Lo ganado en vida máxima (cartas, objetos) es de todo el equipo: vida máxima = base + ese extra.
 *   Al salir se guarda la vida que tenía; al volver entra con ella (como mucho la máxima). Los de la
 *   banca recuperan un 1,2 % de su vida base por segundo (también con "Sin curación", como en el port).
 *   Tipos, velocidad, ataque, habilidad y sprite son del que juega; nivel, experiencia, movimientos,
 *   objetos, mejoras temporales, corazones de Segunda oportunidad, Movimiento Z (uno por partida) y
 *   enfriamientos son del equipo. El Dynamax se acaba al cambiar (G.Dynamax.stop).
 *   Si el que juega cae: primero un corazón de Segunda oportunidad (si queda); si no, entra el
 *   siguiente sin esperar el enfriamiento. Si no queda nadie, se acaba la partida.
 *
 *   Con modificadores sí (+25 % de monedas cada uno, como la partida normal); no es Diario, Fiesta ni
 *   Supervivencia por tipo (son otros modos). Ni ranking ni en grupo (sólo las partidas normales).
 *   Al acabar: stats.teamRuns y stats.teamBestMin (la fusión de partidas se queda con el mayor).
 *
 *   G.Team.request(pl, i)   cambiar (i = una ficha; sin i, el siguiente)
 *   G.Team.drawHud(ctx, w, h, pl)   las fichas y el botón (los llama hud.js)
 */
G.Team = (() => {
  const MAX = 3;            // hasta 3 Pokémon (save_data.gd team_list)
  const MIN_OWNED = 2;      // hacen falta 2 para formar un equipo (menu.gd 1644)
  const CD = 3;             // s entre cambios (main.gd 1782)
  const INV = 1;            // s invulnerable al cambiar (main.gd 1780)
  const INV_AUTO = 1.5;     // ... al entrar porque el otro ha caído
  const FLASH = 0.5;        // destello al entrar
  const REGEN = 0.012;      // la banca: 1,2 % de su vida base por segundo (main.gd 1797)
  const RING = { r0: 8, r1: 150, color: '#ffd23f', dur: 0.5 };   // main.gd 1787
  const SAY = 1.6;          // s del "¡Adelante, X!"
  const TAU = Math.PI * 2;
  const F = (w, s) => `${w} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  const raw = s => new String(s);   // eslint-disable-line no-new-wrappers (sin traducir: nombres de tecla)

  const save = () => G.DB && G.DB.save;
  const ok = d => !!(G.DEX_BY[d] && G.SPRITE_META[d]);

  // ======================= el equipo guardado (save.modes.team) =======================
  /** Tus Pokémon en el orden en que los conseguiste (el de un diccionario de Godot). */
  function owned(s = save()) {
    if (!s || !s.owned) return [];
    return Object.keys(s.owned).map(Number).filter(ok).sort((a, b) => ((s.owned[a] && s.owned[a].at) || 0) - ((s.owned[b] && s.owned[b].at) || 0) || a - b);
  }
  /** ¿Puedes jugarlo? (2 Pokémon o más) */
  const unlocked = (s = save()) => owned(s).length >= MIN_OWNED;
  /**
   * El equipo (save_data.gd team_list): los elegidos que tienes (sin repetir, hasta 3); si no hay
   * ninguno, tu compañero; luego los primeros que conseguiste hasta llegar a 3.
   */
  function list(s = save()) {
    if (!s) return [];
    const out = [], mine = owned(s);
    const saved = s.modes && Array.isArray(s.modes.team) ? s.modes.team : [];
    for (const x of saved) { const k = +x; if (mine.includes(k) && !out.includes(k) && out.length < MAX) out.push(k); }
    if (!out.length && s.partner && ok(+s.partner)) out.push(+s.partner);
    for (const k of mine) { if (out.length >= MAX) break; if (!out.includes(k)) out.push(k); }
    return out;
  }
  /** Lo elegido a mano (sin rellenar). */
  const picked = () => (G.Modes.prefs().team || []).slice();
  /** "Elegir equipo (hasta 3)": empieza de cero (menu.gd 1652: SV.d["team"] = []). */
  function pickStart() { G.Modes.prefs().team = []; G.DB.commit(); }
  /** Tocar un Pokémon en el selector: entra (si cabe) o sale. Devuelve el equipo elegido. */
  function toggle(dex) {
    dex = +dex;
    const p = G.Modes.prefs();
    p.team = p.team || [];
    if (!owned().includes(dex)) return p.team.slice();
    p.team = p.team.includes(dex) ? p.team.filter(x => x !== dex) : p.team.length < MAX ? p.team.concat(dex) : p.team;
    G.DB.commit();
    return p.team.slice();
  }

  // ======================= la partida =======================
  let on = false, members = [], cur = 0, bonus = 0, cd = 0, swapT = 99;

  /** Al empezar (game.js startRun, después de Frágil): el equipo de la partida (main.gd _setup_team). */
  function begin(pl, perks = {}) {
    members = []; cur = 0; bonus = 0; cd = 0; swapT = 99;
    on = !!pl && G.Game.mode === 'team' && (G.Modes.run.team || []).length >= 2;
    if (!on) return;
    const s = save();
    for (const d of G.Modes.run.team) {
      const mon = G.DEX_BY[d];
      if (!mon) continue;
      let b = mon.hp + (perks.hp || 0);
      if (G.Modes.has('frail')) b = Math.round(b * G.Modes.K.frail);
      const shiny = d === pl.dex ? !!pl.shiny : !!(s && s.partnerShiny) && G.DB.ownsShiny(d) && G.Sprites.hasShiny(d);
      members.push({ dex: d, mon, base: b, hp: b, shiny });
    }
    on = members.length >= 2;
    for (const m of members) if (m.dex !== pl.dex) G.Sprites.preload([m.dex], 8000, m.shiny);
  }

  /** El siguiente que sigue en pie (main.gd _team_next), o -1. */
  function next() {
    for (let k = 1; k < members.length; k++) {
      const i = (cur + k) % members.length;
      if (members[i].hp > 0) return i;
    }
    return -1;
  }

  /** ¿Se puede cambiar a mano ahora? (main.gd _unhandled_input: no con las cartas, en pausa ni durante el Z) */
  function live(pl) {
    const g = G.Game;
    return on && !!pl && !pl.dead && g.state === 'playing' && !(G.ZMoves && (G.ZMoves.busy || G.ZMoves.cine)) && !(G.Judgment && G.Judgment.cinematic);
  }
  const ready = pl => live(pl) && cd <= 0 && next() >= 0;

  /** Cambia el cuerpo del jugador por el de `m` (Player.rebody del port). */
  function body(pl, m) {
    const dir = pl.anim ? pl.anim.dir : 0;
    pl.mon = m.mon; pl.dex = m.dex; pl.shiny = m.shiny;
    pl.anim = new G.Sprites.Animator(m.dex, 1, m.shiny);
    pl.anim.dir = dir;
    pl.r = G.Sprites.bodyRadius(m.dex);
    pl.bodyH = G.Sprites.bodyHeight(m.dex);
    pl.baseSpd = m.mon.spd;
    pl.baseAtk = m.mon.atk;
    G.Abilities.set(pl);   // la habilidad del que entra (deshace la del que sale)
  }

  /** main.gd _swap_team: a la ranura i (auto = porque el otro ha caído: sin esperar el enfriamiento). */
  function swap(pl, i, auto = false) {
    if (!on || !pl || i === cur || i < 0 || i >= members.length) return false;
    if (members[i].hp <= 0 || (!auto && (cd > 0 || !live(pl)))) return false;
    if (G.Dynamax) G.Dynamax.stop(pl);   // (lote 5: el Dynamax se acaba al cambiar)
    const was = members[cur];
    was.hp = Math.max(0, pl.hp);
    bonus = Math.max(0, pl.maxHp - was.base);
    const nx = members[i];
    cur = i;
    body(pl, nx);
    pl.maxHp = nx.base + bonus;
    pl.hp = Math.min(pl.maxHp, nx.hp);
    pl.invuln = Math.max(pl.invuln, auto ? INV_AUTO : INV);
    pl.flash = FLASH;
    cd = CD;
    swapT = 0;
    G.Modes.resetHeal(pl);   // "Sin curación" sigue desde la vida del que entra (main.gd 1783-1784: nh_max / nh_last)
    G.Projectiles.clearOrbs(pl);
    G.Audio.sfx('biome');
    G.FX.ring(pl.x, pl.y, RING.r0, RING.r1, RING.color, RING.dur, 4);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#fff3a8', 18, 170);
    G.Spawner.say('¡Adelante, ' + nx.mon.name + '!', SAY, true);
    return true;
  }

  /** Tab, R3, el botón o una ficha. Sin i: al siguiente en pie. */
  function request(pl, i) {
    if (!on) return false;
    return swap(pl, i == null ? next() : i, false);
  }

  /**
   * Player.hurt, si caes (después de la Banda Focus, Robustez y la Segunda oportunidad, main.gd
   * 1885-1902): entra el siguiente. Devuelve true si te ha salvado.
   */
  function onFaint(pl) {
    if (!on || !pl || pl.remote || pl.hp > 0) return false;
    members[cur].hp = 0;
    const n = next();
    return n >= 0 && swap(pl, n, true);
  }

  /** Cada fotograma de juego (main.gd _team_tick): el enfriamiento y la banca. */
  function tick(dt) {
    if (!on) return;
    cd = Math.max(0, cd - dt);
    swapT += dt;
    members.forEach((m, i) => { if (i !== cur && m.hp > 0) m.hp = Math.min(m.base, m.hp + m.base * REGEN * dt); });
  }

  /** Para el HUD y las pruebas: cada uno con su fracción de vida (main.gd 1800-1803). */
  function view(pl) {
    return members.map((m, i) => {
      const isCur = i === cur;
      return { dex: m.dex, name: m.mon.name, hp: isCur && pl ? pl.hp : m.hp, max: isCur && pl ? pl.maxHp : m.base, base: m.base,
        frac: isCur && pl ? pl.hp / Math.max(1, pl.maxHp) : m.hp / Math.max(1, m.base), cur: isCur, dead: m.hp <= 0 && !isCur };
    });
  }

  // ---------- al acabar (main.gd 806-807 / 844-846) ----------
  function finish(S, min) {
    S.teamRuns = (S.teamRuns || 0) + 1;
    S.teamBestMin = Math.max(S.teamBestMin || 0, min);
  }

  // ======================= HUD =======================
  /** Las fichas (main.gd draw_team): debajo de tu vida, a la izquierda. */
  function chipRects() {
    const out = [], X = 16, Y = 76, W = 150, H = 30, GAP = 5;
    for (let i = 0; i < members.length; i++) out.push({ x: X, y: Y + i * (H + GAP), w: W, h: H });
    return out;
  }
  /** El botón de cambiar (TeamUi): a la izquierda del botón del Movimiento Z. */
  function buttonRect(w, h) {
    const z = G.ZMoves.buttonRect(w, h);
    return { x: z.x - z.s - 14, y: z.y, s: z.s };
  }

  function drawHud(ctx, w, h, pl) {
    if (!on || !pl || members.length < 2) return;
    const HUD = G.HUD, v = view(pl), rs = chipRects();
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    v.forEach((t, i) => {
      const r = rs[i];
      HUD.roundRect(ctx, r.x, r.y, r.w, r.h, 7);
      ctx.fillStyle = t.cur ? 'rgba(51,82,158,.85)' : 'rgba(20,31,64,.72)';
      ctx.fill();
      ctx.lineWidth = t.cur ? 2 : 1.2;
      ctx.strokeStyle = t.cur ? '#ffd23f' : 'rgba(255,255,255,.45)';
      ctx.stroke();
      // (al entrar, la ficha del nuevo late en dorado)
      if (t.cur && swapT < 0.6) { ctx.globalAlpha = 1 - swapT / 0.6; ctx.lineWidth = 4; ctx.strokeStyle = '#fff3a8'; ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.font = F(800, 10);
      ctx.textAlign = 'left';
      ctx.fillStyle = t.dead ? '#9a9aa6' : '#ffffff';
      ctx.fillText(t.name, r.x + 8, r.y + 12);
      ctx.textAlign = 'right';
      ctx.font = F(700, 9);
      ctx.fillStyle = t.dead ? '#ff8a96' : 'rgba(220,232,255,.85)';
      ctx.fillText(t.dead ? 'K.O.' : Math.ceil(t.hp) + '/' + Math.round(t.max), r.x + r.w - 7, r.y + 12);
      const f = G.U.clamp(t.frac, 0, 1);
      HUD.bar(ctx, r.x + 8, r.y + 17, r.w - 16, 7, f, f > 0.5 ? '#5fe08a' : f > 0.25 ? '#ffd33d' : '#ff6b7a', 'rgba(0,0,0,.6)');
      if (!t.cur && cd > 0 && !t.dead) { HUD.roundRect(ctx, r.x, r.y, r.w, r.h, 7); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill(); }
      if (!t.cur && !t.dead) G.Touch.addButton(r.x, r.y, r.w, r.h, () => { if (!request(pl, i)) G.Audio.sfx('error'); }, 2);
    });

    // el botón (TeamUi._draw): dos flechas en círculo, el nombre del siguiente y el enfriamiento en rojo
    // (no con el Pokémon caído)
    if (pl.dead) { ctx.restore(); return; }
    const b = buttonRect(w, h), c = { x: b.x + b.s / 2, y: b.y + b.s / 2 }, R = 30;
    const can = ready(pl), a = can ? 0.85 : 0.4, nx = next();
    ctx.fillStyle = `rgba(20,31,64,${(0.6 * a + 0.2).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = `rgba(255,209,64,${a})`;
    ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.stroke();
    ctx.lineWidth = 3.5; ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath(); ctx.arc(c.x, c.y, 14, -2.6, 0.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(c.x, c.y, 14, 0.54, 3.34); ctx.stroke();
    const tri = (pts) => { ctx.beginPath(); ctx.moveTo(c.x + pts[0], c.y + pts[1]); ctx.lineTo(c.x + pts[2], c.y + pts[3]); ctx.lineTo(c.x + pts[4], c.y + pts[5]); ctx.closePath(); ctx.fill(); };
    tri([18, -4, 10, -4, 14, 4]);
    tri([-18, 4, -10, 4, -14, -4]);
    if (cd > 0) {
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,102,102,.9)';
      ctx.beginPath(); ctx.arc(c.x, c.y, R + 5, -Math.PI / 2, -Math.PI / 2 + TAU * (cd / CD)); ctx.stroke();
    }
    if (nx >= 0) {
      ctx.font = F(700, 11); ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = `rgba(255,255,255,${a + 0.1})`;
      ctx.strokeText(members[nx].mon.name, c.x, b.y + b.s + 12); ctx.fillText(members[nx].mon.name, c.x, b.y + b.s + 12);
    }
    // lo que se pulsa: el botón del mando o la tecla Tab
    if (G.Pad && G.Pad.mode === 'pad') G.Pad.drawGlyph(ctx, 'swap', b.x - 4, b.y - 4, 22);
    else if (!G.Touch.active) {
      ctx.fillStyle = 'rgba(10,16,28,.9)'; ctx.fillRect(b.x - 2, b.y - 2, 27, 15);
      ctx.strokeStyle = 'rgba(244,248,255,.7)'; ctx.lineWidth = 1; ctx.strokeRect(b.x - 1.5, b.y - 1.5, 26, 14);
      ctx.font = '700 10px Arial,Helvetica,sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#f4f8ff'; ctx.fillText(raw('Tab'), b.x + 11, b.y + 9);
    }
    ctx.restore();
    G.Touch.addButton(b.x, b.y, b.s, b.s, () => { if (!request(pl)) G.Audio.sfx('error'); }, 6);
  }

  return {
    MAX, MIN_OWNED, CD, INV, INV_AUTO, FLASH, REGEN, RING, SAY,
    owned, unlocked, list, picked, pickStart, toggle,
    begin, next, live, ready, swap, request, onFaint, tick, view, finish, chipRects, buttonRect, drawHud,
    get on() { return on; }, get cur() { return cur; }, get cd() { return cd; }, get bonus() { return bonus; },
    get members() { return members; }, get swapT() { return swapT; }
  };
})();
