'use strict';
/* ============ expedition/verbs.js — the Expedition's movement verbs (MicaSurvivor DLC D2, not upstream) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load()); a base page never runs it, and every hook into the
 * base game is behind `G.World.zone` (an Expedition zone, js/expedition/terrain.js), which base modes never have.
 * PokéBonk's jump / slide / glide / climb / surf / bounce pads, rebuilt as the GBA's ledges, Surf and Fly
 * (Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 5.2):
 *
 *   hop     Space / A (the pad's confirm) / the HOP button: a 0.45 s arc, the sprite lifted up to 12 art px with the shadow
 *           left on the ground. Airborne you pass over ground enemies (no contact damage: i-frames from CONTACT only,
 *           projectiles still hit) and over deep water, and you can drop off a ledge onto ANY lower level (one way,
 *           Pokémon style: you land on the level of the tile under you). You can't hop up a level.
 *   2nd hop pressing hop again in the air (once: K.EXTRA_HOPS): a new arc that also reaches ONE level above the take-off
 *           level, so hopping into a cliff face lands you on top. Never two levels.
 *   glide   Flying types: hold hop past the top of the arc and the airtime stretches to 1.2 s (gaps of ~3 tiles: water,
 *           and the chasms of later maps). Let go and you drop.
 *   slide   Shift / B (the pad's cancel) / the SLIDE button: 0.55 s at x1.9 the way you move (or face), then 0.9 s of
 *           cool-down. On the ground only, with a dust trail (Shed Shell-style i-frames are an item: D5).
 *   climb   Fighting, Bug and Ghost types walk up (and down) a cliff face, one level at a time, at half speed.
 *   surf    Water types cross deep water (a liquid tile with liquid all round) at x1.35 instead of being slowed; anyone
 *           else is blocked by deep water (the shallow rim only slows, as before) unless airborne.
 *   bounce  a bounce pad (zone.pads, a mushroom painted in code) at the foot of a cliff throws whoever steps on it 2 tiles
 *           its way along a fixed 0.85 s arc onto the plateau above (a forced landing one level up).
 *
 * The types come from the study's PokéBonk reference: Flying glides, Water surfs, Fighting / Bug / Ghost climb (a dual
 * type gets both, e.g. Gyarados surfs, Scyther climbs, Charizard glides). TYPES below is the table.
 *
 * The hooks (each one a single `if` on the zone in a base file):
 *   js/entities/player.js update   step() before the move (input, arcs, slide, surf / climb speed, pads) and after()
 *                                  once collided (the landing); airborne you are not "in" liquid
 *   js/world/world.js collideZone  pass() (deep water), airMask() (every level up to the air's top) and reach() (a
 *                                  climber's one level up or down) instead of the bare layer mask, for the player only
 *   js/systems/combat.js           no contact damage from ground enemies while airborne
 *   js/core/pad.js gameplay        confirm -> hop, cancel -> slide; held('confirm') for glide
 *   js/ui/hud.js                   drawButtons(): the HOP and SLIDE buttons (touch, mouse, and their key / pad glyphs)
 *   js/entities/player.js draw     lift() and drawUnder(): the sprite in the air, a smaller shadow, the wake / dust
 * Snapshots: row(p) is the per-player air row of the `x` block v2 (js/expedition/core.js), applyRow() shows one on a
 * puppet (a co-op mate, a replay or a live spectator's view).
 */
G.I18n.add({
  'Saltar': 'Hop', 'Deslizarse': 'Slide', 'Planear': 'Glide', 'Escalar': 'Climb', 'Surf': 'Surf',
  'Espacio': 'Space', 'Mayús': 'Shift'
});

G.ExpVerbs = (() => {
  const K = {
    HOP_T: 0.45, HOP_H: 24,            // 12 art px (x2 world units per art px)
    GLIDE_T: 1.2, FALL_T: 0.18,        // total airtime when gliding; dropping when you let go
    SLIDE_T: 0.55, SLIDE_K: 1.9, SLIDE_CD: 0.9,
    CLIMB_K: 0.5, SURF_K: 1.35,
    PAD_T: 0.85, PAD_H: 56, PAD_D: 2, PAD_CD: 0.5,
    EXTRA_HOPS: 1                      // hops in the air after the first (D5's items may change it per player)
  };
  const TYPES = { glide: ['flying'], surf: ['water'], climb: ['fighting', 'bug', 'ghost'] };
  // the verb a snapshot row carries (0: none)
  const CODE = { hop: 1, glide: 2, bounce: 3, slide: 4, surf: 5, climb: 6, fall: 2 };
  const NAME = [null, 'hop', 'glide', 'bounce', 'slide', 'surf', 'climb'];
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const TS = () => G.World.TS;
  const tileOf = v => Math.floor(v / G.World.TS);

  /** What a Pokémon's types let it do: {glide, surf, climb}. */
  function verbsOf(types) {
    const has = l => (types || []).some(t => l.includes(t));
    return { glide: has(TYPES.glide), surf: has(TYPES.surf), climb: has(TYPES.climb) };
  }
  function ensure(pl) {
    if (!pl.xverbs || pl.xverbsDex !== pl.dex) { pl.xverbs = verbsOf(pl.mon && pl.mon.types); pl.xverbsDex = pl.dex; }
    return pl.xverbs;
  }

  // ---------------- input: keys, the pad, the HUD buttons ----------------
  const queued = { hop: false, slide: false };
  /** A press from the pad (G.Pad gameplay) or a HUD button: used by the next step. */
  function press(what) { if (what in queued) queued[what] = true; }
  const take = k => { const v = queued[k]; queued[k] = false; return v; };
  // the pointers down (touch, pen, mouse) and where, for "hold the HOP button to glide"
  const ptrs = new Map();
  let hopRect = null, slideRect = null;   // the HOP / SLIDE buttons in screen px (drawButtons), null when not drawn
  const inside = (r, x, y) => !!r && x >= r.x - 6 && x <= r.x + r.s + 6 && y >= r.y - 6 && y <= r.y + r.s + 6;
  // The buttons are pressed here, on the pointer going down on the game canvas (touch, pen or mouse), not through
  // G.Touch's button callback: that one ignores a second tap on the same spot within 350 ms (one touch arrives as both
  // touchstart and pointerdown), and the extra hop IS a quick second tap. The buttons are still registered with G.Touch
  // (a no-op callback) so a finger on them never opens the joystick.
  addEventListener('pointerdown', e => {
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (!e.target || e.target.id !== 'game' || !G.World.zone || !G.Game || G.Game.state !== 'playing') return;
    if (inside(hopRect, e.clientX, e.clientY)) press('hop');
    else if (inside(slideRect, e.clientX, e.clientY)) press('slide');
  }, true);
  addEventListener('pointermove', e => { if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]); }, true);
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, e => ptrs.delete(e.pointerId), true);
  addEventListener('blur', () => ptrs.clear());
  function buttonHeld() {
    for (const [x, y] of ptrs.values()) if (inside(hopRect, x, y)) return true;
    return false;
  }
  /** Is hop held (Space, the pad's confirm, a finger / the mouse on the HOP button)? */
  const hopHeld = () => G.Input.held('space') || !!(G.Pad && G.Pad.held && G.Pad.held('confirm')) || buttonHeld();

  // ---------------- the air ----------------
  /** The highest level a layer mask joins (a ramp: its upper one). */
  const topOf = m => (m & 8 ? 3 : m & 4 ? 2 : m & 2 ? 1 : 0);
  /** The levels an airborne entity may be over: every one up to its air's top. */
  const airMask = e => (2 << e.air.top) - 1;
  /** A climber reaches one level up and one down from where it stands (on the ground). */
  const reach = (e, m) => (e.xverbs && e.xverbs.climb && !e.air ? (m | (m << 1) | (m >> 1)) & 15 : m);
  /** The tile rule for an entity with verbs: deep water is a wall unless it surfs or is in the air. */
  function pass(e, tx, ty) {
    const m = G.World.maskAt(tx, ty);
    if (!m || !e.xverbs || e.air || e.xverbs.surf) return m;
    const z = G.World.zone;
    return z && z.deep && z.deep(tx, ty) ? 0 : m;
  }
  /** The lift (world units above the shadow) of an air state at its time t. */
  function liftOf(a) {
    const u = G.U.clamp((a.t - a.t0) / Math.max(1e-3, a.dur - a.t0), 0, 1);
    if (a.kind === 'glide') return a.l0 * (1 - u * u * u);
    if (a.kind === 'fall') return a.l0 * (1 - u);
    return a.l0 * (1 - u) + Math.sin(u * Math.PI) * a.h;
  }

  function hop(pl) {
    const a = pl.air;
    if (!a) {
      pl.air = { kind: 'hop', t: 0, t0: 0, hop0: 0, dur: K.HOP_T, h: K.HOP_H, l0: 0, top: topOf(pl.zMask || 1), top0: topOf(pl.zMask || 1), hops: 1 };
      pl.aLx = pl.x; pl.aLy = pl.y;
      pl.slideT = 0;
      pl.hopN = (pl.hopN || 0) + 1;
      G.FX.ring(pl.x, pl.y, 4, 16, '#e8f4ff', 0.18, 2);
      G.Audio.sfx('select');
      return true;
    }
    if (a.kind === 'bounce' || a.hops >= 1 + (pl.extraHops != null ? pl.extraHops : K.EXTRA_HOPS)) return false;
    // the extra hop: a new arc from where you are, one level higher than the take-off (never two)
    a.l0 = liftOf(a); a.kind = 'hop'; a.t0 = a.t; a.hop0 = a.t; a.dur = a.t + K.HOP_T; a.h = K.HOP_H;
    a.top = Math.min(3, a.top0 + 1); a.hops++;
    pl.hopN = (pl.hopN || 0) + 1;
    G.FX.ring(pl.x, pl.y - a.l0, 4, 20, '#bfe8ff', 0.2, 2);
    G.Audio.sfx('select');
    return true;
  }
  function bounce(pl, p) {
    const [dx, dy] = DIRS[p[2] - 1], T = TS();
    const lx = (p[0] + dx * K.PAD_D) * T + T / 2, ly = (p[1] + dy * K.PAD_D) * T + T / 2;
    const z = G.World.zone, top = z.height(p[0] + dx * K.PAD_D, p[1] + dy * K.PAD_D);
    pl.air = { kind: 'bounce', t: 0, t0: 0, hop0: 0, dur: K.PAD_T, h: K.PAD_H, l0: 0, top, top0: top, hops: 99,
      sx: pl.x, sy: pl.y, lx, ly };
    pl.aLx = pl.x; pl.aLy = pl.y;
    pl.slideT = 0;
    pl.hopN = (pl.hopN || 0) + 1;
    pl.squash = 0.18;
    G.FX.ring(p[0] * T + T / 2, p[1] * T + T / 2, 6, 34, '#ff6b7a', 0.3, 3);
    G.Audio.sfx('select');
  }
  function land(pl) {
    const a = pl.air;
    pl.air = null; pl.airZ = 0;
    const tx = tileOf(pl.x), ty = tileOf(pl.y), m = pass(pl, tx, ty);
    let splash = false;
    if (m) { pl.zMask = m; pl.zLx = pl.x; pl.zLy = pl.y; }
    else { splash = true; pl.x = pl.zLx; pl.y = pl.zLy; }
    G.World.collide(pl);   // settle against the edges of the level you landed on
    pl.landed = { from: a.top0, to: G.World.zone ? Math.floor(pl.layer || 0) : 0, kind: a.kind, splash };
    pl.padCd = K.PAD_CD;
    if (splash) G.FX.burst(pl.x, pl.y, '#b3defa', 8, 70);
    else G.FX.ring(pl.x, pl.y, 4, a.kind === 'bounce' ? 30 : 18, '#e6dccb', 0.22, 2);
    if (a.kind === 'bounce') pl.squash = 0.16;
  }

  // ---------------- each step (js/entities/player.js update) ----------------
  /** Before the move: input, the air arc, slide, surf and climb speeds, pads. Changes pl.svx / svy. */
  function step(pl, dt, ax, ay) {
    const z = G.World.zone;
    if (!z) return;
    const V = ensure(pl);
    if (pl.slideCd > 0) pl.slideCd = Math.max(0, pl.slideCd - dt);
    if (pl.padCd > 0) pl.padCd -= dt;
    if (pl.squash > 0) pl.squash -= dt;
    const ctl = !pl.frozen && !pl.remote && !pl.dead;
    const hopP = take('hop') && ctl || (ctl && G.Input.tap('space'));
    const slideP = take('slide') && ctl || (ctl && (G.Input.tap('shiftleft') || G.Input.tap('shiftright')));
    pl.verb = 0;
    // a bounce pad under you (on the ground)
    if (ctl && !pl.air && !(pl.padCd > 0)) { const p = z.padAt && z.padAt(tileOf(pl.x), tileOf(pl.y)); if (p) bounce(pl, p); }
    if (hopP) hop(pl);
    if (slideP && !pl.air && !(pl.slideT > 0) && !(pl.slideCd > 0)) {
      const [dx, dy] = ax || ay ? G.U.norm(ax, ay) : [Math.cos(pl.moveAngle), Math.sin(pl.moveAngle)];
      pl.slideT = K.SLIDE_T; pl.sdx = dx; pl.sdy = dy;
      G.Audio.sfx('select');
    }
    const a = pl.air;
    if (a) {
      // glide: a Flying type holding hop once the arc starts to come down; letting go drops you
      const held = hopHeld();
      if (V.glide && a.kind === 'hop' && held && a.t >= a.t0 + (a.dur - a.t0) / 2) {
        a.l0 = liftOf(a); a.kind = 'glide'; a.t0 = a.t; a.dur = Math.max(a.dur, a.hop0 + K.GLIDE_T);
      } else if (a.kind === 'glide' && !held) {
        a.l0 = liftOf(a); a.kind = 'fall'; a.t0 = a.t; a.dur = Math.min(a.dur, a.t + K.FALL_T);
      }
      a.t = Math.min(a.dur, a.t + dt);
      if (a.kind === 'bounce') {
        // the fixed arc: from the pad to its landing tile, whatever the stick says
        const k = a.t / a.dur, tx = a.sx + (a.lx - a.sx) * k, ty = a.sy + (a.ly - a.sy) * k;
        pl.svx = (tx - pl.x) / dt; pl.svy = (ty - pl.y) / dt;
      }
      pl.airZ = liftOf(a);
      pl.verb = CODE[a.kind];
      if (a.kind === 'glide' && Math.random() < dt * 10) G.FX.burst(pl.x, pl.y - pl.airZ - pl.bodyH * 0.4, '#eaf6ff', 1, 30);
      return;
    }
    if (pl.slideT > 0) {
      pl.slideT -= dt;
      const s = pl.spd * K.SLIDE_K;
      pl.svx = pl.sdx * s; pl.svy = pl.sdy * s;
      pl.verb = CODE.slide;
      if (Math.random() < dt * 30) G.FX.burst(pl.x - pl.sdx * pl.r, pl.y - pl.sdy * pl.r * 0.5, '#d8c8a8', 1, 40);
      if (pl.slideT <= 1e-6) { pl.slideT = 0; pl.slideCd = K.SLIDE_CD; }   // (1e-6: 33 steps of 1/60 s are 0.55 s)
      return;
    }
    if (V.surf && G.World.isLiquid(pl.x, pl.y)) {
      // (Water types are not slowed by water already: liquidEffect's immunity; the 1 / slow keeps it right in any case)
      const k = K.SURF_K / (G.World.liquidEffect(pl.mon.types).slow || 1);
      pl.svx *= k; pl.svy *= k;
      pl.verb = CODE.surf;
      return;
    }
    if (V.climb && (ax || ay)) {
      // walking into a tile one level up or down (not joined by a ramp): climbing it, at half speed
      const [nx, ny] = G.U.norm(ax, ay), d = pl.r + 3;
      const m2 = pass(pl, tileOf(pl.x + nx * d), tileOf(pl.y + ny * d)), here = pl.zMask || 1;
      if (m2 && !(m2 & here) && (m2 & reach(pl, here))) { pl.svx *= K.CLIMB_K; pl.svy *= K.CLIMB_K; pl.verb = CODE.climb; }
    }
  }
  /** After the move and the collision: the landing. */
  function after(pl) {
    if (!G.World.zone || !pl.air) return;
    if (pl.air.t >= pl.air.dur) land(pl);
    else pl.layer = pl.air.top;
  }

  // ---------------- snapshots (the `x` block v2) ----------------
  /**
   * The per-player air row: [lift, verb, layer x2, phase cs, airtime cs, hops]. lift in world units (0 on the ground),
   * verb a CODE (0 none), phase / airtime: where in its arc (a viewer plays the rest), hops: a running count (so a
   * viewer that missed a whole hop between two snapshots still plays one).
   */
  function row(p) {
    const a = p.air;
    return [Math.round(p.airZ || 0), p.verb | 0, Math.round((p.layer || 0) * 2), a ? Math.round(a.t * 100) : 0,
      a ? Math.round(a.dur * 100) : 0, (p.hopN | 0) & 1023];
  }
  /** Shows an air row on a puppet (a co-op mate, a watched player). row null: on the ground. */
  function applyRow(p, r) {
    if (!r) { p.airRow = null; p.verb = 0; p.airRowN = null; return; }
    const now = performance.now(), seen = p.airRowN, n = r[5] | 0;
    p.verb = r[1] | 0;
    p.layer = (r[2] | 0) / 2;
    if (r[0] > 0 && r[4] > r[3]) p.airRow = { code: r[1] | 0, l0: r[0], t: r[3] / 100, dur: r[4] / 100, at: now };
    // a hop that came and went between two snapshots (a 1 s live view, a 0.5 s replay frame): play one
    else if (seen != null && n !== seen && !(liftView(p) > 0)) p.airRow = { code: CODE.hop, l0: 0, t: 0, dur: K.HOP_T, at: now };
    // (otherwise an arc still playing finishes by itself)
    p.airRowN = n;
  }
  /** A puppet's lift from its row, played on from the time it came. */
  function liftView(p) {
    const r = p.airRow;
    if (!r) return 0;
    const t = r.t + (performance.now() - r.at) / 1000;
    if (t >= r.dur) return 0;
    if (r.code === CODE.hop || r.code === CODE.bounce) {
      const h = r.code === CODE.bounce ? K.PAD_H : K.HOP_H;
      return Math.max(Math.sin(G.U.clamp(t / r.dur, 0, 1) * Math.PI) * h, r.l0 * (1 - (t - r.t) / Math.max(1e-3, r.dur - r.t)));
    }
    const u = G.U.clamp((t - r.t) / Math.max(1e-3, r.dur - r.t), 0, 1);
    return r.l0 * (1 - u * u * u);
  }
  /** The lift to draw (js/entities/player.js draw): the arc of a local player, or a puppet's row. */
  const lift = p => (p.air ? p.airZ || 0 : p.airRow ? liftView(p) : 0);
  const verbOf = p => NAME[p.verb | 0] || (p.airRow && liftView(p) > 0 ? NAME[p.airRow.code] : null);

  /** Under the sprite: a surfer's wake, a slider's dust streak, a glider's wider shadow ring. */
  function drawUnder(ctx, p) {
    const v = verbOf(p);
    if (!v) return;
    ctx.save();
    if (v === 'surf') {
      const t = performance.now() / 1000;
      ctx.strokeStyle = 'rgba(235,248,255,.75)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * (1.5 + 0.15 * Math.sin(t * 7)), p.r * 0.55, 0, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, p.r * 2.1, p.r * 0.8, 0, 0, 6.2832); ctx.stroke();
    } else if (v === 'slide') {
      const a = p.moveAngle || 0;
      ctx.fillStyle = 'rgba(216,200,168,.45)';
      for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(p.x - Math.cos(a) * p.r * i * 0.9, p.y - Math.sin(a) * p.r * i * 0.45, p.r * (1.1 - i * 0.2), p.r * 0.4, 0, 0, 6.2832); ctx.fill(); }
    } else if (v === 'glide') {
      ctx.strokeStyle = 'rgba(200,232,255,.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 2, p.r * 0.75, 0, 0, 6.2832); ctx.stroke();
    } else if (v === 'climb') {
      ctx.fillStyle = 'rgba(150,130,110,.5)';
      ctx.fillRect(p.x - p.r, p.y - 2, p.r * 2, 3);
    }
    ctx.restore();
  }
  /** The shadow's scale while airborne (smaller the higher you are). */
  const shadowK = p => { const l = lift(p); return l > 0 ? Math.max(0.55, 1 - l / 90) : 1; };

  // ---------------- the HUD buttons ----------------
  const F = (wt, s) => `${wt} ${Math.round(s)}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  const raw = s => new String(s);   // eslint-disable-line no-new-wrappers
  /** HOP to the left of the Z-move button, SLIDE above it (to the left of MAX), in HUD units. */
  function buttonRects(w, h) {
    const z = G.ZMoves.buttonRect(w, h);
    const x = z.x - z.s - 14;
    return { hop: { x, y: z.y, s: z.s }, slide: { x, y: z.y - z.s - 30, s: z.s } };
  }
  function keyChip(ctx, x, y, label) {
    ctx.font = '700 9px Arial,Helvetica,sans-serif';
    const tw = Math.max(13, ctx.measureText(label).width + 6);
    ctx.fillStyle = 'rgba(10,16,28,.9)'; ctx.fillRect(x - 2, y - 2, tw + 2, 15);
    ctx.strokeStyle = 'rgba(244,248,255,.7)'; ctx.lineWidth = 1; ctx.strokeRect(x - 1.5, y - 1.5, tw + 1, 14);
    ctx.fillStyle = '#f4f8ff'; ctx.textAlign = 'left'; ctx.fillText(label, x + 2, y + 9);
  }
  function drawButtons(ctx, w, h, pl) {
    if (!G.World.zone || !pl || pl.remote || pl.dead) return null;
    const V = ensure(pl), R = buttonRects(w, h), k = (G.HUD && G.HUD.k) || 1;
    const pad = G.Pad && G.Pad.mode === 'pad', touch = G.Touch.active;
    const one = (r, kind) => {
      const c = { x: r.x + r.s / 2, y: r.y + r.s / 2 }, Rr = 27;
      const cool = kind === 'slide' && pl.slideCd > 0, busy = kind === 'hop' ? !!pl.air : pl.slideT > 0;
      ctx.save();
      ctx.fillStyle = busy ? 'rgba(60,90,140,.9)' : 'rgba(13,18,36,.82)';
      ctx.beginPath(); ctx.arc(c.x, c.y, Rr, 0, 6.2832); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = cool ? 'rgb(128,133,148)' : kind === 'hop' ? '#9ad8ff' : '#ffd08a';
      ctx.beginPath(); ctx.arc(c.x, c.y, Rr, 0, 6.2832); ctx.stroke();
      if (cool) {
        ctx.strokeStyle = '#ffd08a'; ctx.beginPath();
        ctx.arc(c.x, c.y, Rr, -Math.PI / 2, -Math.PI / 2 + 6.2832 * (1 - pl.slideCd / K.SLIDE_CD)); ctx.stroke();
      }
      // the icon, in code: an arc with an arrow up (hop), speed lines and an arrow (slide)
      ctx.strokeStyle = '#f4f8ff'; ctx.fillStyle = '#f4f8ff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      if (kind === 'hop') {
        ctx.beginPath(); ctx.moveTo(c.x - 12, c.y + 9); ctx.quadraticCurveTo(c.x, c.y - 20, c.x + 12, c.y + 9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(c.x, c.y - 14); ctx.lineTo(c.x - 6, c.y - 6); ctx.moveTo(c.x, c.y - 14); ctx.lineTo(c.x + 6, c.y - 6); ctx.stroke();
      } else {
        for (const [dy, l] of [[-7, 10], [0, 16], [7, 10]]) { ctx.beginPath(); ctx.moveTo(c.x - 14, c.y + dy); ctx.lineTo(c.x - 14 + l, c.y + dy); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(c.x + 6, c.y - 8); ctx.lineTo(c.x + 14, c.y); ctx.lineTo(c.x + 6, c.y + 8); ctx.stroke();
      }
      ctx.font = F(700, 10); ctx.textAlign = 'center';
      const label = kind === 'hop' ? (V.glide ? 'Saltar · Planear' : 'Saltar') : 'Deslizarse';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(label, c.x, r.y + r.s + 11); ctx.fillStyle = 'rgb(214,222,238)'; ctx.fillText(label, c.x, r.y + r.s + 11);
      if (pad) G.Pad.drawGlyph(ctx, kind === 'hop' ? 'confirm' : 'cancel', r.x - 4, r.y - 4, 22);
      else if (!touch) keyChip(ctx, r.x - 4, r.y - 4, kind === 'hop' ? 'Espacio' : 'Mayús');
      ctx.restore();
      G.Touch.addButton(r.x, r.y, r.s, r.s, () => {}, 6);   // (pressed by the pointerdown listener above)
    };
    one(R.hop, 'hop');
    one(R.slide, 'slide');
    hopRect = { x: R.hop.x * k, y: R.hop.y * k, s: R.hop.s * k };
    slideRect = { x: R.slide.x * k, y: R.slide.y * k, s: R.slide.s * k };
    // what this Pokémon's types add (surf / climb), as a chip over SLIDE
    const extra = [V.surf && 'Surf', V.climb && 'Escalar'].filter(Boolean);
    if (extra.length) {
      ctx.save();
      ctx.font = F(700, 10); ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)';
      const tx = R.slide.x + R.slide.s / 2, ty = R.slide.y - 8, s = extra.join(' · ');
      ctx.strokeText(s, tx, ty); ctx.fillStyle = '#9ff0c8'; ctx.fillText(s, tx, ty);
      ctx.restore();
    }
    return R;
  }

  return { K, TYPES, CODE, NAME, verbsOf, press, hopHeld, pass, airMask, reach, step, after, row, applyRow, lift, liftOf,
    drawUnder, shadowK, buttonRects, drawButtons, topOf,
    /** For tests: the queued presses, and clear them. */
    debugReset() { queued.hop = queued.slide = false; ptrs.clear(); } };
})();
