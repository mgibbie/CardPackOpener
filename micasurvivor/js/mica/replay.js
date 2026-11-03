/* ============ mica/replay.js — full-run replays (MicaSurvivor M5 batch 12c, not upstream; v2 sessions: U4) ============
 * DESIGN (U4, Plans/MICASURVIVOR_UNIFIED_PLAN.md "U4 — unified replays (format v2)"): one tape per SESSION, for all three
 * game families (the base modes, the Expedition, Dive), solo or with partners (local 2-4 players, online co-op).
 *
 *   Who records   every client records what it sees; the HOST's tape is the session's (it sees every player: its own
 *                 Pokémon, its local partners (G.LocalCoop) and the online guests' rows from their co-op frames
 *                 (G.Coop.mates)). A guest keeps its own tape locally (offline / solo) but never uploads it in the
 *                 background. Solo = a session of one player.
 *   Players       slot 0 is the recorder's own Pokémon (frame field 1, as in v1); slots 1.. are the others, in the
 *                 order they were first seen. Each segment's header lists them: players:[{id, name, dex, shiny, k}]
 *                 (k: 'me' the recorder, 'l' a local partner, 'o' an online player; c: its colour index).
 *   Segments      the session is cut into SEGMENTS. A segment closes after SEG_SECS (5 min) of run time, on a Dive
 *                 floor group boundary (every SEG_FLOORS floors), when its raw JSON reaches its size step (SEG_RAW /
 *                 THIN_STOP) or SEG_FRAMES frames. The snapshot that closes one is recorded AGAIN as the first frame
 *                 of the next (a KEYFRAME: the encoder starts from nothing, so every value is absolute), so each
 *                 segment decodes on its own and two segments meet without a gap. Each is packed on its own
 *                 ('G1.' + base64url(gzip(JSON))) under PACKED_MAX: {v:2, h:{...v1 header, sid, seg, players, at,
 *                 end?}, f:[frames], ev:[events]}. A segment index [{seg, t0, t1, n, bytes}] says where each is.
 *   Upload        a signed-in HOST (or solo player) uploads each finished segment in the background as soon as the
 *                 session has a second one (micasurvivor-replay-put {v:2, sid, seg, code, meta, last}); the server
 *                 keeps the index in the session row (msurvsess:<id>) and the segments as msurvseg:<id>:<seg>. A
 *                 short run (one segment) is uploaded only when shared, as one row (msurvreplay:<id>), as before.
 *                 The cap is per SESSION (SESSION_SEGS = 120 segments, ~10 h), never per run.
 *   Size policy   one for every category: within a segment an Expedition tape spaces its frames out as the segment
 *                 grows (THIN: x1.5 / x2 / x3 the interval), a segment that still packs over the cap merges frame
 *                 pairs (halve), and every limit closes the segment and starts the next. The only hard stop is the
 *                 session cap: then the last segment's header says end.lim and the viewer shows "the replay ends
 *                 here (limit)". Nothing is ever cut silently.
 *   Frames        v1's fields (below) + three:
 *                   12 R   the other players' rows [x, y, dir, anim, hp, maxHp, flags, dex, level] (positions / Q) per
 *                          slot 1..: the differences from its previous row (0 = none); a row with no previous one is
 *                          absolute; null = the player left (0 for the whole field = nobody changed). MP polish: + 2
 *                          fields, the Ultimate's charge % and the kit flags (KF: has an Ultimate / casting it, a Z-move
 *                          ready / in use, Dynamax ready / on): a local partner's Ultimate, Z and Dynamax, an online
 *                          partner's Ultimate. A U4 row has 9 fields (no kit shown); the header's rw stays 9 (the base).
 *                          + 1 more (gap fix 2026-11-02): the Z-move's type (1 + G.ZMoves.ORDER index): the viewer plays any
 *                          player's Z cinematic with its card (js/ui/watch-ui.js zWatch)
 *                   13 PS  the other players' slow state [[moves [[id, lvl, evolved]], [item, item2]]] per slot 1..,
 *                          whole, when it changed (MP polish: an online partner's items from its co-op frames' field 17)
 *                   14 A   the moves cast since the previous frame, by every player: [slot, move id, level, aim x 100,
 *                          evolved, time offset (tenths of a second, <= 0, from this frame's time)]: the viewer draws
 *                          every player's attacks as ghosts where they really aimed
 *                   15 W   the world's props (2026-11-02): {c: from nothing, b: tiles broken since the previous frame, u: altars
 *                          used since, s: the springs / locked chests not at rest, anywhere (whole: a segment's first frame),
 *                          d: those that changed since (-1 = at rest)}: the viewer's world is rebuilt from
 *                          the seed, so without it a used altar or a broken chest / rock / patch of grass came back in the
 *                          replay. Every segment's first frame has it (c); a tape from before has none (its world as built)
 *                 A v2 tape has no field 6 (the partners' rows are field 12). Flags (P and R): 1 fainted, 2 walking,
 *                 4 Dynamax, 8 co-op down, 16 hidden (Z-move), 32 airborne (a hop / glide), 64 a verb (dodge, slide).
 *   Viewing       G.Replay.session(...) -> a Session (segments loaded on demand, each a Reader with checkpoints;
 *                 seeking = the segment, then the nearest checkpoint: never a rescan from the start). Reader.at(i,
 *                 follow) gives frame i seen from player `follow`: that player becomes the snapshot's `p` / `me` and
 *                 everyone else (slot 0 included) a partner row, so the viewer (js/ui/watch-ui.js) can follow anyone.
 *   v1            tapes {v:1} still play (the same Reader; no segments, no players, no casts).
 *
 * The v1 notes (the recorder, the encoder, the store) follow; they hold for v2 unless said otherwise.
 * A run is recorded as a stream of snapshots (the live spectating snapshot, js/mica/spectate.js snap()) taken every
 * REC_DT seconds of RUN time, plus the key events. Nothing here touches the game: the recorder only READS the run
 * state (no random numbers, no hooks in the gameplay code but cast(), which only notes a move being cast), so the
 * run plays exactly the same with it on.
 *
 *   observe(dt)  each frame of a run: a time check; every REC_DT of run time a snapshot is taken, compared with the
 *                previous one (events: lv level-up, mv a move learned / levelled up (the card picked), xe a move
 *                evolved, bs a boss appeared, bk a boss beaten, z a Z-move, dx Dynamax, dd fainted, bi biome, ar the
 *                rift arena; and which enemies that vanished died), handed to the live publisher and recorded.
 *   recording    delta-encoded and quantized as it goes (one small JSON string per frame), frame = [dt, P, C, S, E, K, M, ...]:
 *                  dt  run time since the previous frame (tenths of a second; a segment's first frame: the run time)
 *                  P   your Pokémon [x, y, dir, anim, hp, maxHp, flags]: differences from the previous frame (0 = none)
 *                  C   counters [level, xp, xpNext, kills, bosses, coins]: differences (0 = none)
 *                  S   the slow state (moves, items, Z / Dynamax, Team, biome, arena, weather, the level-up screen,
 *                      co-op down...) when it changed, else 0
 *                  E   enemies [died ids, gone ids, added rows, changed rows] (an entity table, below), K the
 *                      pickups (the same), M the co-op partners when they moved, else 0 (v1 only)
 *                Positions are divided by Q (2 world units; QE = 4 for enemies, pickups and partners). An entity
 *                table: ids are delta-coded in ascending order; an added row is id + every field; every entity is
 *                predicted to repeat its last step, and a changed row is id + a bit mask + the corrections of the
 *                fields that differ from that (an enemy standing still, or walking straight on, costs nothing).
 *                Enemies' facing / animation are not recorded (the player derives them from their motion).
 *   finish()     the run's end: one more frame, the last segment closed with the summary (h.end) -> the entry
 *                {rid, segs:[codes], idx, meta, code (= segs[0] when there is one segment)}. Kept in this browser
 *                (localStorage micasurvivor_replays_v1, the last LOCAL_MAX runs within STORE_MAX_CHARS: the site
 *                shares that storage; a session already uploaded may be kept as its id alone) so it can be shared
 *                later even if the upload fails.
 *   share        POST /api/mp micasurvivor-replay-put -> id; the link /msr/<id> (= /micasurvivor/?replay=<id>).
 *                Reading one is public: micasurvivor-replay-get {id} (a tape, or a session's index) / {id, seg}.
 *   playback     open(code) -> a Reader: frame times, events and at(i) (the snapshot of frame i, decoded from the
 *                nearest checkpoint: seeking is cheap), drawn by js/ui/watch-ui.js; session() -> a Session of them.
 */
G.Replay = (() => {
  const K = {
    REC_DT: 0.5,         // seconds of run time between frames
    Q: 2,                // position quantum (your Pokémon, the players)
    QE: 4,               // ...enemies, pickups and (v1) partners
    CHECK_EVERY: 40,     // a decoder checkpoint every 40 frames (20 s)
    LOCAL_MAX: 3,        // runs kept in this browser
    PACKED_MAX: 1200000, // the server's cap on one packed tape / segment (MSURV_REPLAY_MAX)
    FRAMES_MAX: 30000,   // (v1: frames in one tape)
    STORE_MAX_CHARS: 1200000,  // the local copies, together (the newest is always kept, whole or as its upload)
    // DLC D11: an Expedition tape's size. Survival is endless, so its frames are REC_DT_SURV apart, and every Expedition
    // tape spaces its frames out as it grows (raw JSON chars -> x the interval; packed is ~0.3-0.4 of raw). U4: per SEGMENT,
    // and THIN_STOP closes the segment (the next one starts) instead of ending the tape. If a segment still packs over
    // PACKED_MAX, its frames are merged two by two (halve) and packed again, up to HALVE_MAX times. A base run never thins.
    REC_DT_SURV: 1,
    THIN: [[3000000, 1.5], [3300000, 2], [3550000, 3]],
    THIN_STOP: 4500000,
    HALVE_MAX: 3,
    // U4: the segments
    V: 2,
    SEG_SECS: 300,       // a segment per 5 minutes of run time...
    SEG_FLOORS: 10,      // ...or per 10 Dive floors
    SEG_RAW: 3000000,    // a base segment closes at this many raw chars (an Expedition one at THIN_STOP)
    SEG_FRAMES: 3000,    // ...or frames (the server's MSURV_SEG_FRAMES is 4000)
    SESSION_SEGS: 120,   // segments in one session (~10 h): the server's MSURV_SESSION_SEGS
    CASTS_MAX: 96        // casts in one frame (a frame has ~0.5 s of them)
  };
  const STORE_KEY = 'micasurvivor_replays_v1';
  const EW = 6, KW = 3;  // enemy row fields after the id: dex, x, y, hp%, maxHp, flags · pickup: kind, x, y
  const RW = 9;          // a player row (field 12): x, y, dir, anim, hp, maxHp, flags, dex, level (the header's rw: the base fields)
  // (MP polish: a row carries 2 more, RWX: the Ultimate's charge % and the kit flags KF below. A reader goes by each row's own
  //  length, so a U4 tape (9 fields) still reads, and a U4 reader ignores the 2 new ones.)
  // (gap fix 2026-11-02: + 1, its Z-move's type (1 + its index in G.ZMoves.ORDER, 0 = none): the viewer plays that player's Z
  //  cinematic with its own card. A row of 11 fields has none: its Z shows as before.)
  const RWX = 3;
  /** The kit flags (a player row's field 10, and the live snapshot's rows): what that player's HUD would show. */
  const KF = { ULT: 1, ULT_CAST: 2, Z: 4, Z_READY: 8, Z_ON: 16, DYN: 32, DYN_READY: 64, DYN_ON: 128 };
  /**
   * The FORMAT version this build reads and writes (gap fix 2026-11-02): a live snapshot carries it (`fv`, js/mica/spectate.js
   * pubSnap) and so does a tape's header once it passes 1 (h.fv; a tape / snapshot without one is format 1, so every tape
   * recorded so far stays bit for bit as it was). Bump it whenever a snapshot or a tape gains something an older viewer would
   * silently get wrong (as `wa` and field 15's d were): a viewer whose FV is lower then still shows what it can and offers
   * "A newer version is available — refresh" (js/ui/watch-ui.js updatePrompt). Never bump the outer data.v for that: a
   * reader refuses a tape whose v it doesn't know.
   */
  const FV = 1;
  const newer = x => !!x && (x.fv | 0) > FV;
  const stats = { frames: 0, recMs: 0, recMax: 0, obsMs: 0, obsFrames: 0, events: 0, segs: 0, casts: 0, uploads: 0, upErr: 0 };
  const H = () => window.__msurvNet || {};

  // ---------------- the observer (each frame of a run) ----------------

  let rec = null;          // the recording in progress
  let acc = 0, prevS = null, bossSeen = new Set();

  function begin() {
    const g = G.Game, pl = g.player;
    acc = 0; prevS = null; bossSeen = new Set();
    rec = null;
    if (!pl) return;
    const rid = hex(6);
    rec = {
      rid, started: Date.now(),
      h: { v: 2, sid: rid, Q: K.Q, QE: K.QE, dt: K.REC_DT, sd: G.World.seed, m: g.mode || 'normal', dex: pl.dex, shiny: pl.shiny ? 1 : 0, mon: pl.mon.name,
           by: (G.MicaAccount && G.MicaAccount.name()) || '', coop: G.Coop && G.Coop.active ? (G.Coop.members || []).map(m => m.uid) : [],
           items: Object.keys(G.Items.BY), ew: EW, kw: KW, rw: RW, ...(pl.af ? { af: 1 } : {}), ...(FV > 1 ? { fv: FV } : {}) },   // (DLC D16: af = every move fires; an old tape has none)
      // the session: its players (slot -> descriptor), the closed segments, the background upload
      players: [], slots: new Map(), plSlot: new Map(),
      seg: 0, segT0: 0, segFloor: null, closed: [], total: 0, stopped: false, lim: false,
      up: { on: false, id: null, chain: Promise.resolve(), done: new Set(), err: 0 },
      casts: [],
      frames: [], ev: [], bytes: 0
    };
    resetEnc(rec);
    // DLC D0b: an Expedition run's header gains its content version (dv) and map / difficulty (js/expedition/core.js);
    // a base run's is unchanged (no listener, or one that leaves base runs alone)
    rec.h = G.Hooks.reduce('replay.header', rec.h);
    // (DLC D11: an Expedition tape (its header has dv) thins as it grows; Survival's frames are 1 s apart. The reader needs
    //  nothing new: every frame carries its own interval, and the playback blends between frames.)
    rec.thin = rec.h.dv != null;
    rec.dt = rec.thin && rec.h.m === 'exp-survival' ? K.REC_DT_SURV : K.REC_DT;
    if (rec.dt !== K.REC_DT) rec.h.dt = rec.dt;
    // U4: only a host (or a solo player) uploads its session; a co-op guest keeps its tape here
    rec.host = !(G.Coop && G.Coop.active && !G.Coop.isHost);
    sample();
  }
  /** The encoder's memory of the previous frame (a new segment starts from nothing: its first frame is a keyframe). */
  function resetEnc(r) {
    Object.assign(r, { P: null, C: null, S: '', E: { m: new Map(), v: new Map() }, Kp: { m: new Map(), v: new Map() }, M: '', t: 0,
      XA: '', XW: '', XO: '', XF: '', XC: '', R: [], PS: '', WG: null, WB: 0, WU: 0, WS: null });
  }

  /** Each frame of a run (game.js frame): ~a microsecond, a snapshot every REC_DT of run time. */
  function observe(dt, playing) {
    if (!rec) return;
    const t0 = performance.now();
    if (playing) acc += dt;
    const step = rec.thin ? thinDt(rec) : K.REC_DT;
    if (acc >= step) { acc -= step; if (acc > step) acc = 0; sample(); }
    const ms = performance.now() - t0;
    stats.obsMs += ms; stats.obsFrames++;
  }

  /** DLC D11: an Expedition tape's frame interval now (its base, x the step its size has reached). U4: per segment. */
  function thinDt(r) {
    let k = 1;
    for (const [at, m] of K.THIN) if (r.bytes >= at) k = m;
    return r.dt * k;
  }

  // ---------------- U4: the players of the session ----------------

  /** Everyone in the run now: [{key, pl, d (descriptor), hp, max}] — you first. Read-only. */
  function present() {
    const g = G.Game, me = g.player, out = [];
    if (!me) return out;
    const acct = G.MicaAccount && G.MicaAccount.name();
    out.push({ key: 'me', pl: me, d: { id: acct || 'me', name: acct || me.mon.name, k: 'me', c: 0 } });
    const LC = G.LocalCoop;
    if (LC && LC.on && LC.rows) {
      LC.rows.forEach((M, i) => {
        const o = M.pl, dn = LC.down && i === 0;
        out.push({ key: 'l' + (M.n || i + 2), pl: o, M, hp: dn ? LC.mateHp : null, max: dn ? LC.mateMax : null,
          d: { id: 'J' + (M.n || i + 2), name: o.mon.name + ' · J' + (M.n || i + 2), k: 'l', c: (M.n || i + 2) - 1 } });
      });
    }
    if (G.Coop && G.Coop.active) {
      for (const m of G.Coop.mates) {
        if (!m.connected || !m.pl) continue;
        out.push({ key: 'o' + m.uid, pl: m.pl, d: { id: String(m.uid || ''), name: m.name || '?', k: 'o', c: Math.max(0, G.Coop.COLORS.indexOf(m.color)) } });
      }
    }
    return out;
  }
  /** The slot of each player present now (a new one gets the next slot); the descriptors keep their species current. */
  function slotsNow(r) {
    const list = present();
    r.plSlot = new Map();
    for (const x of list) {
      let k = r.slots.get(x.key);
      if (k == null) { k = r.players.length; r.slots.set(x.key, k); r.players.push(Object.assign({}, x.d)); }
      const d = r.players[k];
      d.dex = x.pl.dex; d.shiny = x.pl.shiny ? 1 : 0;
      if (x.d.name) d.name = x.d.name;
      x.slot = k;
      r.plSlot.set(x.pl, k);
    }
    return list;
  }
  const qa = v => Math.round((+v || 0) * 100);
  const lq = [];   // (MP polish: the casts since the last live snapshot: [player, id, lvl, aim x 100, evolved, time])
  /**
   * U4: a move cast by any player of the run (G.Combat's tickMove for every real cast; G.Coop for an online partner's,
   * which arrives as a ghost). Only noted: drawn as a ghost when the tape plays.
   */
  function cast(pl, id, lvl, aim, evolved) {
    // (MP polish: while a friend watches live, every player's casts also go in the next live snapshot: livePlayers)
    if (pl && id && G.Spectate && G.Spectate.watchers > 0 && lq.length < K.CASTS_MAX * 2) lq.push([pl, String(id), lvl | 0, qa(aim), evolved ? 1 : 0, Math.round(G.Game.st.time * 10)]);
    const r = rec;
    if (!r || r.stopped || !pl || !id) return;
    let k = r.plSlot.get(pl);
    if (k == null) { slotsNow(r); k = r.plSlot.get(pl); }
    if (k == null || r.casts.length >= K.CASTS_MAX) return;
    r.casts.push([k, String(id), lvl | 0, qa(aim), evolved ? 1 : 0, Math.round(G.Game.st.time * 10)]);
    stats.casts++;
  }
  const flagsOf = o => (o.dead ? 1 : 0) | (o.walking ? 2 : 0) | (o.dyn ? 4 : 0) | (o.coopDown ? 8 : 0) | (o.zHidden ? 16 : 0) | (o.air ? 32 : 0) | (o.verb ? 64 : 0);

  function sample() {
    if (!rec || rec.stopped) return;
    const t0 = performance.now();
    const s = G.Spectate.snap();
    if (!s) return;
    const ev = [], kd = [];
    const p = prevS;
    if (p) {
      if (s.lv[0] > p.lv[0]) ev.push([s.t, 'lv', s.lv[0]]);
      const pm = new Map(p.mv.map(m => [m[0], m]));
      for (const m of s.mv) {
        const o = pm.get(m[0]);
        if (!o || m[1] > o[1]) ev.push([s.t, 'mv', m[0], m[1]]);
        if (o && m[2] && !o[2]) ev.push([s.t, 'xe', m[0]]);
      }
      if (s.bo > p.bo) ev.push([s.t, 'bk', s.bo]);
      if (s.z && s.z[1] === 'cine' && !(p.z && p.z[1] === 'cine')) ev.push([s.t, 'z', s.z[0]]);
      // (DLC D6: an Expedition Ultimate cast, the `xu` event: its row's cast flag rising; a base snapshot has no x.w)
      const xw = s.x && s.x.w && s.x.w.p, pw = p.x && p.x.w && p.x.w.p;
      if (xw && (xw[4] & 1) && !(pw && (pw[4] & 1))) ev.push([s.t, 'xu', xw[5]]);
      // (DLC D7: an Expedition interactable used, the `xi` event: the x block's `o.n` count rising; a base snapshot has no x.o)
      const xo = s.x && s.x.o, po = p.x && p.x.o;
      if (xo && (xo.n | 0) > ((po && po.n) | 0)) ev.push([s.t, 'xi', xo.u | 0]);
      // (DLC D8: an Expedition capture, the `xc` event: the x block's `p.n` count rising, with the Pokémon caught; a base snapshot has no x.p)
      const xp = s.x && s.x.p, pp = p.x && p.x.p;
      if (xp && (xp.n | 0) > ((pp && pp.n) | 0)) ev.push([s.t, 'xc', xp.u | 0]);
      if ((s.p[6] & 4) && !(p.p[6] & 4)) ev.push([s.t, 'dx']);
      if ((s.p[6] & 1) && !(p.p[6] & 1)) ev.push([s.t, 'dd']);
      if (s.b !== p.b) ev.push([s.t, 'bi', s.b]);
      if (!!s.ar !== !!p.ar) ev.push([s.t, 'ar', s.ar ? 1 : 0]);
      // the enemies that vanished near you while the kill count went up died (the rest walked off / despawned)
      const dk = s.k - p.k;
      if (dk > 0) {
        const now = new Set(s.e.map(e => e[0]));
        const gone = p.e.filter(e => !now.has(e[0])).map(e => [G.U.dist2(e[2], e[3], s.p[0], s.p[1]), e[0]]).filter(x => x[0] < 520 * 520).sort((a, b) => a[0] - b[0]);
        for (let i = 0; i < gone.length && i < dk; i++) kd.push(gone[i][1]);
      }
    }
    for (const e of s.e) if ((e[6] & 1) && !bossSeen.has(e[0])) { bossSeen.add(e[0]); ev.push([s.t, 'bs', e[1]]); }
    prevS = s;
    if (ev.length) { rec.ev.push(...ev); stats.events += ev.length; }
    G.Spectate.events(ev); G.Spectate.died(kd);
    const pls = slotsNow(rec);
    encode(s, kd, pls);
    // U4: a segment closes on its time, its size, its frame count or a Dive floor group; the same snapshot opens the next
    const r = rec;
    const fl = s.m === 'exp-dive' && s.x && s.x.z ? Math.floor(((s.x.z | 0) - 1) / K.SEG_FLOORS) : null;
    if (r.frames.length === 1) r.segFloor = fl;
    const roll = r.frames.length > 1 && ((s.t - r.segT0) >= K.SEG_SECS * 10 || r.bytes >= (r.thin ? K.THIN_STOP : K.SEG_RAW)
      || r.frames.length >= K.SEG_FRAMES || (fl != null && r.segFloor != null && fl !== r.segFloor));
    if (roll) {
      if (r.seg + 1 >= K.SESSION_SEGS) { r.lim = true; r.stopped = true; }   // the session's cap: the tape ends here, and says so
      else { closeSeg(r, false, null); encode(s, [], pls); r.segFloor = fl; }
    }
    const ms = performance.now() - t0;
    stats.recMs += ms; stats.frames++; if (ms > stats.recMax) stats.recMax = ms;
  }

  // ---------------- the encoder ----------------

  const q = v => Math.round(v / K.Q), qe = v => Math.round(v / K.QE);
  const diff = (a, b) => { if (!a) return b.slice(); let z = true; const out = b.map((v, i) => { const d = v - a[i]; if (d) z = false; return d; }); return z ? 0 : out; };
  /**
   * An entity table frame. st = { m: id -> row, v: id -> [vx, vy] }; rows: [[id, ...w fields]] ascending by id, the
   * position in fields 2 and 3. Positions are PREDICTED from each entity's last step (x + vx): a foe walking straight
   * at a steady pace changes nothing, so it costs nothing. Returns the frame part and the new state.
   */
  function table(st, rows, w, kd) {
    const cur = new Map(), vel = new Map(), add = [], chg = [];
    let la = 0, lc = 0;
    for (const r of rows) {
      cur.set(r[0], r);
      const o = st.m.get(r[0]);
      if (!o) { add.push(r[0] - la, ...r.slice(1)); la = r[0]; vel.set(r[0], [0, 0]); continue; }
      const v = st.v.get(r[0]) || [0, 0];
      let mask = 0;
      const vals = [];
      for (let i = 1; i <= w; i++) {
        const base = o[i] + (i === 2 ? v[0] : i === 3 ? v[1] : 0);
        if (r[i] !== base) { mask |= 1 << (i - 1); vals.push(r[i] - base); }
      }
      vel.set(r[0], [r[2] - o[2], r[3] - o[3]]);
      if (mask) { chg.push(r[0] - lc, mask, ...vals); lc = r[0]; }
    }
    const died = [], gone = [];
    const kds = kd ? new Set(kd) : null;
    for (const id of st.m.keys()) if (!cur.has(id)) (kds && kds.has(id) ? died : gone).push(id);
    const dc = l => { l.sort((a, b) => a - b); let x = 0; return l.map(v => { const d = v - x; x = v; return d; }); };
    return { out: died.length || gone.length || add.length || chg.length ? [dc(died), dc(gone), add, chg] : 0, st: { m: cur, v: vel } };
  }
  function slowOf(s) {
    const o = { b: s.b, m: s.m, mv: s.mv, ac: s.ac, it: s.it, lu: s.lu };
    // (DLC D1: 'x', an Expedition run's terrain block {xv, m, z, th}; a base snapshot has none, so its frames don't change)
    for (const k of ['ds', 'z', 'dy', 'tm', 'ar', 'wx', 'dn', 'cr', 'ad', 'x', 'af', 'sg']) if (s[k] !== undefined) o[k] = s[k];   // (DLC D16: af, sg)
    // (DLC D2: the x block's airborne state `a` changes with every hop: it has a frame field of its own, see encode)
    if (o.x && o.x.a) { o.x = Object.assign({}, o.x); delete o.x.a; }
    // (DLC D6: so does the Ultimate's charge `w`: field 8)
    if (o.x && o.x.w) { o.x = Object.assign({}, o.x); delete o.x.w; }
    // (DLC D7: and the interactables' state `o` while an altar charges: field 9)
    if (o.x && o.x.o) { o.x = Object.assign({}, o.x); delete o.x.o; }
    // (DLC D11: and Survival's rows `v` (the siege's %) and the reactions' pop-ups `r`: field 10)
    if (o.x && (o.x.v || o.x.r)) { o.x = Object.assign({}, o.x); delete o.x.v; delete o.x.r; }
    // (DLC D11: and the timeline's state `c` (a boss's exhaustion, the specials alive) changes most frames: field 11)
    if (o.x && o.x.c) { o.x = Object.assign({}, o.x); delete o.x.c; }
    return o;
  }
  /** U4: a player's row (field 12) and slow state (field 13). */
  function rowOf(x, live) {
    const o = x.pl, qq = live ? Math.round : q;
    return [qq(o.x), qq(o.y), (o.anim && o.anim.dir) | 0, G.Spectate.ANIMS.indexOf(o.anim && o.anim.cur) < 0 ? 0 : G.Spectate.ANIMS.indexOf(o.anim.cur),
      Math.ceil(Math.max(0, x.hp != null ? x.hp : o.hp || 0)), Math.round(x.max != null ? x.max : o.maxHp || 1) || 1, flagsOf(o), o.dex | 0, o.level | 0, ...kitOf(x)];
  }
  /**
   * MP polish: a partner's Ultimate charge % and kit flags (KF): a local partner's from G.LocalCoop (its Ultimate, Z-move and
   * Dynamax), an online one's Ultimate from the row its co-op frames carry (pl.xw, js/expedition/core.js guestAir) and its
   * Z-move / Dynamax from their field 18 (js/net/coop.js kitState).
   */
  function kitOf(x) {
    const o = x.pl, LC = G.LocalCoop;
    const w = x.M && LC && LC.ultRow ? LC.ultRow(x.M) : Array.isArray(o.xw) ? o.xw : null;
    let u = 0, kf = 0, zt = '';
    if (w) { u = w[0] | 0; kf |= KF.ULT | ((w[4] & 1) ? KF.ULT_CAST : 0); }
    if (x.M && LC && LC.kitFlags) { kf |= LC.kitFlags(x.M); if ((kf & KF.Z) && G.ZMoves) zt = G.ZMoves.typeFor(o.dex); }
    // (an online partner's Z-move / Dynamax: its co-op frames' field 18, js/net/coop.js kitState)
    else if (o.remote && o.net && o.net.kit) { kf |= o.net.kit.kf & (KF.Z | KF.Z_READY | KF.Z_ON | KF.DYN | KF.DYN_READY | KF.DYN_ON); zt = o.net.kit.zt || ''; }
    return [u, kf, zIdx(zt)];
  }
  /** A Z type <-> a row's number (1 + its index in G.ZMoves.ORDER; 0 none). */
  const zIdx = t => (t && G.ZMoves ? G.ZMoves.ORDER.indexOf(t) + 1 : 0);
  const zOfIdx = i => (i > 0 && G.ZMoves ? G.ZMoves.ORDER[i - 1] || '' : '');
  function slowRow(o) {
    const mv = (o.af && o.slots ? o.slots.flat() : o.moves || []).map(m => [m.id, m.lvl | 0, m.evolved ? 1 : 0]);
    // (MP polish: an online partner's held items come in its co-op frames (net.it: js/net/coop.js field 17); its puppet holds none)
    const it = o.remote && o.net && Array.isArray(o.net.it) ? o.net.it : [o.item || '', o.item2 || ''];
    return [mv, [it[0] || '', it[1] || '']];
  }

  /**
   * MP polish: the live snapshot's players (js/mica/spectate.js send, while a friend watches; null for a solo run): the same
   * players, rows and casts a v2 tape records, so the live view follows anyone and draws everyone's casts (js/ui/watch-ui.js).
   *   pp  [{id, name, dex, shiny, k, c}] by slot (0 = the publisher)   pr  rows by slot 1.. (world units; RW + RWX fields)
   *   pz  slow state by slot 1.. [[moves], [item, item2]]              cs  casts [slot, id, lvl, aim x 100, evolved, time (tenths)]
   */
  function livePlayers() {
    const list = present();
    if (list.length < 2) { lq.length = 0; return null; }
    const slot = new Map(list.map((x, i) => [x.pl, i]));
    const out = {
      pp: list.map(x => ({ id: x.d.id, name: x.d.name, dex: x.pl.dex | 0, shiny: x.pl.shiny ? 1 : 0, k: x.d.k, c: x.d.c | 0 })),
      pr: list.slice(1).map(x => rowOf(x, true)),
      pz: list.slice(1).map(x => slowRow(x.pl))
    };
    const cs = [];
    for (const c of lq) { const k = slot.get(c[0]); if (k != null) cs.push([k, c[1], c[2], c[3], c[4], c[5]]); }
    lq.length = 0;
    if (cs.length) out.cs = cs.slice(-K.CASTS_MAX);
    return out;
  }
  /** MP polish: a live snapshot (with livePlayers' fields) seen from player `follow` (a copy: the snapshot stays as it came). */
  function liveView(s, follow) {
    if (!s || !Array.isArray(s.pr) || !Array.isArray(s.pp)) return s;
    const v = Object.assign({}, s);
    pov(v, { players: s.pp, rows: s.pr, slow: s.pz || [], casts: (s.cs || []).map(c => [c[0], c[1], c[2], c[3] / 100, c[4], c[5]]), follow: follow | 0, by: s.pp[0] && s.pp[0].name });
    return v;
  }
  /** The slot-0 player's kit flags, from its snapshot (s.z, s.dy, the Ultimate row x.w.p). */
  function kf0(s) {
    let k = 0;
    const w = s.x && s.x.w && s.x.w.p;
    if (w) k |= KF.ULT | ((w[4] & 1) ? KF.ULT_CAST : 0);
    if (s.z) k |= KF.Z | (!s.z[1] && !s.z[2] ? KF.Z_READY : 0) | (s.z[1] ? KF.Z_ON : 0);
    if (s.dy) k |= KF.DYN | (!s.dy[0] && !s.dy[2] ? KF.DYN_READY : 0) | (s.dy[0] ? KF.DYN_ON : 0);
    return k;
  }
  const XQ = ['a', 'l', 'u', 'w', 'k', 'v'];   // the x block's per-player rows {p, q: {name: row}} (air, League, bag, Ultimate, meta, Survival)
  /**
   * U4 (shared by the replay reader and, MP polish, the live view): every player of the frame; the one followed becomes the
   * snapshot's own (p, me, its moves and items), everyone else a partner row
   *   [name, dex, shiny, x, y, hp, maxHp, flags, dir, 'v', colour, slot, moves | null, {lv, it, u, kf}]
   * (u: the Ultimate's charge % or null; kf: KF). s.cs = the frame's casts [slot, id, lvl, aim (rad), evolved, time].
   * o: {players, rows (by slot 1.., world units), slow (by slot 1..), casts, follow, by, mv0}. Mutates s (a fresh object).
   */
  function pov(s, o) {
    const players = o.players || [], rows = o.rows || [], slow = o.slow || [], follow = o.follow | 0;
    const all = [], mv0 = o.mv0 || s.mv || [], it0 = s.it || ['', ''];
    const d0 = players[0] || {};
    const w0 = s.x && s.x.w && s.x.w.p;
    all.push({ slot: 0, name: d0.name || o.by || '', dex: s.me[0], shiny: s.me[1], x: s.p[0], y: s.p[1], dir: s.p[2], anim: s.p[3], hp: s.p[4], max: s.p[5], fl: s.p[6], lv: s.lv[0], c: 0, k: 'me',
      u: w0 ? w0[0] | 0 : null, kf: kf0(s), zt: s.z ? s.z[0] : '' });
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      if (!r) continue;
      const d = players[j + 1] || {};
      const kf = r.length > RW + 1 ? r[RW + 1] | 0 : 0;
      all.push({ slot: j + 1, name: d.name || '?', dex: r[7] || d.dex || 25, shiny: d.shiny ? 1 : 0, x: r[0], y: r[1], dir: r[2], anim: r[3], hp: r[4], max: r[5], fl: r[6], lv: r[8], c: d.c | 0, k: d.k || 'o',
        u: kf & KF.ULT ? r[RW] | 0 : null, kf, zt: r.length > RW + 2 ? zOfIdx(r[RW + 2] | 0) : '' });
    }
    // (gap fix 2026-11-02: every player in its Z-move now [slot, name, type]: the viewer plays the Z cinematic as one starts,
    //  whoever's it is and whoever is followed; js/ui/watch-ui.js zWatch)
    const zon = all.filter(x => x.kf & KF.Z_ON).map(x => [x.slot, x.name, x.zt || '']);
    if (zon.length) s.zon = zon; else delete s.zon;   // (none: the frame as before)
    const me = all.find(x => x.slot === follow) || all[0];
    s.pi = me.slot;
    s.np = players.length || 1;
    if (me.slot !== 0) {
      s.p = [me.x, me.y, me.dir, me.anim, me.hp, me.max, me.fl];
      s.me = [me.dex, me.shiny];
      const ps = slow[me.slot - 1];
      s.mv = ps ? ps[0] : [];
      s.it = ps ? ps[1] : ['', ''];
      s.ac = 0; s.af = 1; delete s.sg;
      if (me.lv) s.lv = [me.lv, s.lv[1], s.lv[2]];
      // (the recorder's own Z-move / Dynamax / Team / level-up screen are not this player's)
      delete s.z; delete s.dy; delete s.tm; delete s.ds; delete s.dn; s.lu = 0;
      // (MP polish: nor are the x block's per-player rows: the followed player's become p, the recorder's go in q by its name)
      if (s.x) {
        const x = Object.assign({}, s.x);
        for (const k of XQ) {
          const b = x[k];
          if (!b || typeof b !== 'object' || !('p' in b || 'q' in b)) continue;
          const qq = Object.assign({}, b.q || {}), nb = Object.assign({}, b);
          nb.p = qq[me.name] || null; delete qq[me.name];
          if (b.p) qq[all[0].name] = b.p;
          nb.q = qq; x[k] = nb;
        }
        s.x = x;
      }
    }
    const mt = all.filter(x => x !== me).map(x => {
      const ps = x.slot > 0 ? slow[x.slot - 1] : null;
      return [x.name, x.dex, x.shiny, x.x, x.y, x.hp, x.max, x.fl, x.dir, 'v', x.c, x.slot, x.slot === 0 ? mv0 : ps ? ps[0] : null,
        { lv: x.lv | 0, it: x.slot === 0 ? it0 : ps ? ps[1] : ['', ''], u: x.u, kf: x.kf }];
    });
    if (mt.length) s.mt = mt; else delete s.mt;
    s.cs = o.casts || [];
  }
  function encode(s, kd, pls) {
    const r = rec;
    const P = [q(s.p[0]), q(s.p[1]), s.p[2], s.p[3], s.p[4], s.p[5], s.p[6] | ((G.Game.player && G.Game.player.air) ? 32 : 0) | ((G.Game.player && G.Game.player.verb) ? 64 : 0)];
    const C = [s.lv[0], s.lv[1], s.lv[2], s.k, s.bo, s.co];
    const S = JSON.stringify(slowOf(s));
    // (an enemy's facing and animation are not recorded: the player derives them from its motion)
    const E = table(r.E, s.e.map(e => [e[0], e[1], qe(e[2]), qe(e[3]), e[4], e[5], e[6]]), EW, kd);
    const Kt = table(r.Kp, s.pk.map(k => [k[0], k[1], qe(k[2]), qe(k[3])]), KW, null);
    // DLC D2: an Expedition snapshot's airborne state (x.a) in field 7, only when it changes (0: unchanged; {}: none).
    // A base snapshot has no x: the field stays 0 and is dropped with the other trailing zeros (base frames unchanged).
    const XA = s.x && s.x.a ? JSON.stringify(s.x.a) : '';
    // DLC D6: the Ultimate rows (x.w) in field 8, the same way (a base snapshot: 0, dropped)
    const XW = s.x && s.x.w ? JSON.stringify(s.x.w) : '';
    // DLC D7: the interactables' state (x.o) in field 9, the same way (a base snapshot: 0, dropped)
    const XO = s.x && s.x.o ? JSON.stringify(s.x.o) : '';
    // DLC D11: Survival's rows and the reactions' pop-ups ({v, r}) in field 10, the same way (a base snapshot: 0, dropped)
    const XF = s.x && (s.x.v || s.x.r) ? JSON.stringify({ v: s.x.v || undefined, r: s.x.r || undefined }) : '';
    // DLC D11: the timeline's state (x.c) in field 11, the same way (a base snapshot: 0, dropped; an older tape: in S)
    const XC = s.x && s.x.c ? JSON.stringify(s.x.c) : '';
    // U4: the other players (field 12: rows by slot, delta-coded; 13: their slow state, whole when it changes)
    const n = Math.max(0, r.players.length - 1), rows = new Array(n).fill(null), slow = new Array(n).fill(null);
    for (const x of pls) if (x.slot > 0) { rows[x.slot - 1] = rowOf(x); slow[x.slot - 1] = slowRow(x.pl); }
    let Rf = [], any = false;
    for (let j = 0; j < n; j++) {
      const a = r.R[j] || null, b = rows[j];
      const d = b ? (a ? diff(a, b) : b.slice()) : (a ? null : 0);
      Rf.push(d); if (d !== 0) any = true;
    }
    while (Rf.length && Rf[Rf.length - 1] === 0) Rf.pop();
    const PS = n ? JSON.stringify(slow) : '';
    // U4: the casts since the previous frame (field 14), their times relative to this frame's
    const A = r.casts.length ? r.casts.map(c => [c[0], c[1], c[2], c[3], c[4], Math.min(0, c[5] - s.t)]) : 0;
    r.casts = [];
    const first = !r.frames.length;
    const W = worldOf(r, first);
    const f = [first ? s.t : s.t - r.t, diff(r.P, P), diff(r.C, C), S !== r.S ? JSON.parse(S) : 0, E.out, Kt.out, 0,
      XA !== r.XA ? (XA ? JSON.parse(XA) : {}) : 0, XW !== r.XW ? (XW ? JSON.parse(XW) : {}) : 0,
      XO !== r.XO ? (XO ? JSON.parse(XO) : {}) : 0, XF !== r.XF ? (XF ? JSON.parse(XF) : {}) : 0,
      XC !== r.XC ? (XC ? JSON.parse(XC) : {}) : 0,
      any ? Rf : 0, PS !== r.PS ? JSON.parse(PS || '[]') : 0, A, W];
    while (f.length > 1 && f[f.length - 1] === 0) f.pop();
    const txt = JSON.stringify(f);
    if (first) r.segT0 = s.t;
    r.frames.push(txt); r.bytes += txt.length + 1; r.total++;
    r.P = P; r.C = C; r.S = S; r.E = E.st; r.Kp = Kt.st; r.t = s.t; r.XA = XA; r.XW = XW; r.XO = XO; r.XF = XF; r.XC = XC;
    r.R = rows; r.PS = PS;
  }

  /**
   * Field 15, the world's props (owner bug 2026-11-02: an altar used / a chest or rock broken came back in the replay, whose
   * world is rebuilt from the seed): {c: 1 = from nothing (a segment's first frame, or the world was cleared: a new zone),
   * b: the tiles broken since the previous frame [tx, ty, ...], u: the altars used since [tx, ty, ...], s: the specials
   * that aren't at rest [tx, ty, %] (springs, locked chests), whole (a segment's first frame / a new world), d: those that
   * changed since [tx, ty, %] (-1 = at rest again)}; 0 = nothing new.
   * (Gap fix 2026-11-02: EVERY spring / locked chest the run left not at rest, wherever it is (js/world/world.js
   *  specialsLive), not only those within 900 units of you; sent only as they change: d, a few bytes a frame.)
   */
  function worldOf(r, first) {
    const W = G.World, log = W.propLog ? W.propLog() : null;
    if (!log) return 0;
    const flat = l => { const o = []; for (const k of l) { const i = k.indexOf(','); o.push(+k.slice(0, i), +k.slice(i + 1)); } return o; };
    const sp = W.specialsLive ? W.specialsLive() : [];
    const now = new Map();
    for (let i = 0; i + 2 < sp.length; i += 3) now.set(sp[i] + ',' + sp[i + 1], sp[i + 2]);
    const out = {};
    if (first || r.WG !== log.gen) { out.c = 1; r.WB = 0; r.WU = 0; r.WG = log.gen; r.WS = null; }
    if (log.b.length > r.WB) out.b = flat(log.b.slice(r.WB));
    if (log.u.length > r.WU) out.u = flat(log.u.slice(r.WU));
    if (!r.WS) { if (sp.length) out.s = sp; }
    else {
      const d = [], key = k => { const i = k.indexOf(','); return [+k.slice(0, i), +k.slice(i + 1)]; };
      for (const [k, v] of now) if (r.WS.get(k) !== v) d.push(...key(k), v);
      for (const k of r.WS.keys()) if (!now.has(k)) d.push(...key(k), -1);
      if (d.length) out.d = d;
    }
    r.WB = log.b.length; r.WU = log.u.length; r.WS = now;
    return Object.keys(out).length ? out : 0;
  }

  /** U4: closes the segment being recorded (packed in the background; uploaded too once the session has two). */
  function closeSeg(r, last, end) {
    if (!r || !r.frames.length) return null;
    const h = Object.assign({}, r.h, { seg: r.seg, players: r.players.map(p => Object.assign({}, p)), at: r.started });
    if (end) h.end = end;
    if (r.lim) h.end = Object.assign({}, h.end || {}, { lim: 1 });
    const sg = { seg: r.seg, h, frames: r.frames, ev: r.ev, t0: r.segT0 / 10, t1: r.t / 10, raw: r.bytes, last: !!last, code: null, n: r.frames.length, thin: r.thin };
    sg.ready = packSeg(sg);
    r.closed.push(sg);
    stats.segs++;
    r.seg++; r.frames = []; r.ev = []; r.bytes = 0;
    resetEnc(r);
    // the background upload: a signed-in host's session, from its second segment on (a one-segment run waits for Share)
    if (!r.up.on && !last && r.host && canUpload()) r.up.on = true;
    if (r.up.on) { const rr = r; for (const c of rr.closed) if (!rr.up.done.has(c.seg) && !c.queued) { c.queued = true; queueUpload(rr, c); } }
    return sg;
  }
  const canUpload = () => !H().noBgUpload && !!(G.MicaAccount && G.MicaAccount.name && G.MicaAccount.name()) && !!(G.MicaAccount.call);
  async function packSeg(sg) {
    let frames = sg.frames;
    const h = sg.h;
    const text = () => '{"v":2,"h":' + JSON.stringify(h) + ',"f":[' + frames.join(',') + '],"ev":' + JSON.stringify(sg.ev) + '}';
    let txt = text();
    sg.rawChars = txt.length;
    let code = await pack(txt);
    // (DLC D11: an Expedition segment over the server's cap: every two frames merged, packed again (a base one: never))
    for (let k = 0; sg.thin && code.length > K.PACKED_MAX && k < K.HALVE_MAX; k++) {
      frames = halve(frames, h.ew || EW, h.kw || KW);
      h.halved = k + 1;
      txt = text();
      code = await pack(txt);
    }
    sg.code = code; sg.n = frames.length; sg.bytes = code.length;
    sg.frames = null;   // (only the packed copy stays in memory)
    return sg;
  }
  const segIdx = sg => ({ seg: sg.seg, t0: sg.t0, t1: sg.t1, n: sg.n, bytes: sg.bytes || 0 });

  // ---------------- U4: the background upload ----------------

  function metaOf(r, sum) {
    const frames = r.closed.reduce((a, c) => a + (c.n || 0), 0);
    const meta = { dex: r.h.dex, shiny: !!r.h.shiny, mon: r.h.mon, mode: r.h.m, time: Math.floor((sum && sum.time) || r.t / 10 || 0), level: (sum && sum.level) | 0,
                   kills: (sum && sum.kills) | 0, bosses: (sum && sum.bosses) | 0, dead: !!(sum && sum.dead), coop: r.h.coop, frames,
                   segs: r.closed.length, np: r.players.length };
    if (r.h.dv != null) { meta.dv = r.h.dv; meta.map = r.h.map; meta.diff = r.h.diff; }   // (DLC D0b: an Expedition run only)
    return meta;
  }
  function queueUpload(r, sg) {
    r.up.chain = r.up.chain.then(async () => {
      await sg.ready;
      if (r.up.done.has(sg.seg) || r.up.err > 4) return;
      const res = await putSeg(r.rid, sg.seg, sg.code, r.meta || metaOf(r, null), sg.last, false);
      if (res.ok) { r.up.id = res.id; r.up.done.add(sg.seg); stats.uploads++; if (r.entry) { r.entry.id = res.id; r.entry.bg = true; r.entry.up = r.up.done.size; } }
      else { r.up.err++; stats.upErr++; }
    }).catch(() => { r.up.err++; });
  }
  async function putSeg(sid, seg, code, meta, last, keep) {
    if (code.length > K.PACKED_MAX) return { ok: false, error: 'big' };
    const r = await G.MicaAccount.call('micasurvivor-replay-put', { v: 2, rid: sid, sid, seg, code, meta, last: !!last, keep: !!keep }, { timeout: 30000 });
    if (!r.ok || !r.body || !r.body.id) return { ok: false, error: r.status === 413 ? 'big' : r.status === 0 ? 'offline' : 'server' };
    return { ok: true, id: r.body.id };
  }

  // ---------------- the decoder ----------------

  function undc(l) { let x = 0; return (l || []).map(d => (x += d)); }
  /** The decoder's side of table(): st = { m, v } is updated in place. */
  function applyTable(st, d, w) {
    const [died, gone, add, chg] = d || [[], [], [], []];
    const dl = undc(died);
    for (const id of dl) { st.m.delete(id); st.v.delete(id); }
    for (const id of undc(gone)) { st.m.delete(id); st.v.delete(id); }
    // everyone left moves on by their last step (the prediction), then the recorded corrections
    const old = new Map();
    for (const [id, row] of st.m) {
      old.set(id, row);
      const v = st.v.get(id);
      if (v && (v[0] || v[1])) { const nr = row.slice(); nr[2] += v[0]; nr[3] += v[1]; st.m.set(id, nr); }
    }
    let id = 0;
    for (let i = 0; i < chg.length;) {
      id += chg[i]; const mask = chg[i + 1]; i += 2;
      const row = st.m.get(id);
      const nr = row ? row.slice() : [id, ...new Array(w).fill(0)];
      for (let b = 0; b < w; b++) if (mask & (1 << b)) { nr[b + 1] += chg[i]; i++; }
      st.m.set(id, nr);
    }
    for (const [i2, o] of old) { const n = st.m.get(i2); st.v.set(i2, [n[2] - o[2], n[3] - o[3]]); }
    id = 0;
    for (let i = 0; i < add.length; i += w + 1) { id += add[i]; st.m.set(id, [id, ...add.slice(i + 1, i + 1 + w)]); st.v.set(id, [0, 0]); }
    return { died: dl };
  }
  /** U4: the decoder's side of field 12 (rows by slot; updated in place: new arrays, never mutated). */
  function applyRows(R, d) {
    if (!d) return;
    for (let j = 0; j < d.length; j++) {
      const x = d[j];
      if (x === 0 || x === undefined) continue;
      if (x === null) { R[j] = null; continue; }
      R[j] = R[j] ? R[j].map((v, i) => v + (x[i] || 0)) : x.slice();
    }
  }
  /**
   * DLC D11: a tape with every two frames merged into one (an Expedition tape that packs over the cap). Decoded with the
   * reader's applyTable and encoded again with table(), so any reader plays it: each merged frame carries the summed
   * interval, the counters' summed differences, the latest slow / x fields, and the entities as they stand at its end.
   * (U4: and the players' rows as they stand at its end, with every cast of the pair, their offsets from the merged frame)
   */
  function halve(frames, ew = EW, kw = KW) {
    const out = [];
    const dE = { m: new Map(), v: new Map() }, dK = { m: new Map(), v: new Map() };
    let eE = { m: new Map(), v: new Map() }, eK = { m: new Map(), v: new Map() };
    let P = [0, 0, 0, 0, 0, 0, 0], C = [0, 0, 0, 0, 0, 0], pP = null, pC = null, dt = 0, died = [];
    let R = [], pR = [], casts = [], t = 0, v2 = false, W = null;   // (W: field 15 of the frames merged so far)
    const late = new Array(15).fill(0);   // the latest whole-value fields since the last frame out: 3 S, 6 M, 7-11 the x fields, 13 PS
    const sorted = st => [...st.m.values()].sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < frames.length; i++) {
      const f = typeof frames[i] === 'string' ? JSON.parse(frames[i]) : frames[i];
      dt += f[0] || 0;
      t = i === 0 ? (f[0] || 0) : t + (f[0] || 0);
      if (f[1]) P = P.map((v, j) => v + (f[1][j] || 0));
      if (f[2]) C = C.map((v, j) => v + (f[2][j] || 0));
      died.push(...applyTable(dE, f[4], ew).died);
      applyTable(dK, f[5], kw);
      for (const j of [3, 6, 7, 8, 9, 10, 11, 13]) if (f[j]) late[j] = f[j];
      if (f.length > 12) v2 = true;
      if (f[12]) applyRows(R, f[12]);
      if (f[14]) for (const c of f[14]) casts.push([c[0], c[1], c[2], c[3], c[4], c[5] + t]);
      if (f[15]) {   // (the world's props: from nothing again on c, the tiles of both frames, the latest specials)
        const w = f[15];
        if (w.c || !W) W = w.c ? { c: 1 } : {};
        if (w.b) W.b = (W.b || []).concat(w.b);
        if (w.u) W.u = (W.u || []).concat(w.u);
        if (w.s) { W.s = w.s; delete W.d; }
        if (w.d) W.d = (W.d || []).concat(w.d);   // (the changes of both frames, in order: the reader applies s, then d)
      }
      if (i % 2 === 0 && i !== frames.length - 1) continue;
      const E = table(eE, sorted(dE), ew, died), Kt = table(eK, sorted(dK), kw, null);
      eE = E.st; eK = Kt.st;
      let Rf = 0;
      if (v2) {
        const n = Math.max(R.length, pR.length), l = [];
        let any = false;
        for (let j = 0; j < n; j++) { const a = pR[j] || null, b = R[j] || null; const d = b ? (a ? diff(a, b) : b.slice()) : (a ? null : 0); l.push(d); if (d !== 0) any = true; }
        while (l.length && l[l.length - 1] === 0) l.pop();
        Rf = any ? l : 0;
      }
      const A = casts.length ? casts.map(c => [c[0], c[1], c[2], c[3], c[4], Math.min(0, c[5] - t)]) : 0;
      const o = [dt, diff(pP, P), diff(pC, C), late[3], E.out, Kt.out, late[6], late[7], late[8], late[9], late[10], late[11], Rf, late[13], A, W || 0];
      while (o.length > 1 && o[o.length - 1] === 0) o.pop();
      out.push(JSON.stringify(o));
      pP = P.slice(); pC = C.slice(); dt = 0; died = []; late.fill(0); pR = R.slice(); casts = []; W = null;
    }
    return out;
  }
  /** A Reader over a decoded tape {v, h, f, ev} (v1, or one v2 segment). */
  function reader(data) {
    const h = data.h || {}, frames = data.f || [], Q = h.Q || K.Q, QE = h.QE || K.QE, ew = h.ew || EW, kw = h.kw || KW;
    const v2 = data.v === 2;
    const players = Array.isArray(h.players) ? h.players : [];
    const times = [];
    const tbl = () => ({ m: new Map(), v: new Map() }), ctbl = x => ({ m: new Map(x.m), v: new Map(x.v) });
    const fresh = () => ({ i: -1, t: 0, P: [0, 0, 0, 0, 0, 0, 0], C: [0, 0, 0, 0, 0, 0], S: {}, E: tbl(), K: tbl(), M: [], A: null, W: null, O: null, F: null, X: null, kd: [], R: [], PS: null, CS: [], WB: null, WU: null, WS: null });
    const clone = st => ({ i: st.i, t: st.t, P: st.P.slice(), C: st.C.slice(), S: st.S, E: ctbl(st.E), K: ctbl(st.K), M: st.M, A: st.A, W: st.W, O: st.O, F: st.F, X: st.X, kd: [], R: st.R.slice(), PS: st.PS, CS: st.CS, WB: st.WB, WU: st.WU, WS: st.WS });
    // (field 15: the broken / used tiles as Sets of "tx,ty", copied on write: a checkpoint keeps its own)
    // (and the specials not at rest, [tx, ty, %...], with field 15's changes d applied (-1 = at rest): a new array, copied on write)
    const specDelta = (cur, d) => {
      const m = new Map();
      for (let i = 0; i + 2 < (cur || []).length; i += 3) m.set(cur[i] + ',' + cur[i + 1], [cur[i], cur[i + 1], cur[i + 2]]);
      for (let i = 0; i + 2 < d.length; i += 3) { const k = d[i] + ',' + d[i + 1]; if (d[i + 2] < 0) m.delete(k); else m.set(k, [d[i], d[i + 1], d[i + 2]]); }
      return [].concat(...m.values());
    };
    const addTiles = (set, l) => { const o = new Set(set); for (let i = 0; i + 1 < l.length; i += 2) o.add(l[i] + ',' + l[i + 1]); return o; };
    function step(st) {
      const f = frames[st.i + 1];
      st.i++;
      st.t += f[0] || 0;
      if (f[1]) st.P = st.P.map((v, j) => v + (f[1][j] || 0));
      if (f[2]) st.C = st.C.map((v, j) => v + (f[2][j] || 0));
      if (f[3]) st.S = f[3];
      st.kd = applyTable(st.E, f[4], ew).died;
      applyTable(st.K, f[5], kw);
      if (f[6]) st.M = f[6];
      if (f[7]) st.A = f[7];   // (DLC D2: the x block's airborne state)
      if (f[8]) st.W = f[8];   // (DLC D6: the Ultimate rows)
      if (f[9]) st.O = f[9];   // (DLC D7: the interactables)
      if (f[10]) st.F = f[10];   // (DLC D11: Survival's rows, the pop-ups)
      if (f[11]) st.X = f[11];   // (DLC D11: the timeline's state; a tape from before D11 keeps it in S)
      if (f[12]) { st.R = st.R.slice(); applyRows(st.R, f[12]); }   // (U4: the other players)
      if (f[13]) st.PS = f[13];
      st.CS = f[14] ? f[14].map(c => [c[0], c[1], c[2], c[3] / 100, c[4], st.t + (c[5] || 0)]) : [];   // (U4: this frame's casts, absolute times)
      if (f[15]) {   // (the world's props; a tape from before has none: its viewer's world stays as the seed builds it)
        const w = f[15];
        if (w.c || !st.WB) { st.WB = new Set(); st.WU = new Set(); st.WS = []; }
        if (w.b && w.b.length) st.WB = addTiles(st.WB, w.b);
        if (w.u && w.u.length) st.WU = addTiles(st.WU, w.u);
        if (w.s) st.WS = w.s;
        if (w.d && w.d.length) st.WS = specDelta(st.WS, w.d);
      }
    }
    // one pass: the frame times and a checkpoint every CHECK_EVERY frames
    const checks = [];
    {
      const st = fresh();
      for (let i = 0; i < frames.length; i++) {
        if (i % K.CHECK_EVERY === 0) checks.push(clone(st));
        step(st);
        times.push(st.t / 10);
      }
    }
    let cur = null;
    /** The snapshot (live format) of frame i, seen from player `follow` (U4; 0 = the recorder, as in v1). */
    function at(i, follow) {
      i = Math.max(0, Math.min(frames.length - 1, i | 0));
      if (!cur || cur.i > i || i - cur.i > K.CHECK_EVERY) cur = clone(checks[Math.floor(i / K.CHECK_EVERY)]);
      while (cur.i < i) step(cur);
      return view(cur, follow | 0);
    }
    function view(st, follow) {
      const P = st.P, C = st.C, S = st.S;
      const s = Object.assign({ v: 1, t: st.t, sd: h.sd, me: [h.dex, h.shiny], p: [P[0] * Q, P[1] * Q, P[2], P[3], P[4], P[5], P[6]],
        lv: [C[0], C[1], C[2]], k: C[3], bo: C[4], co: C[5] }, S);
      if (h.af && s.af == null) s.af = h.af;   // (DLC D16: the header says every move fires)
      s.e = [...st.E.m.values()].map(r => [r[0], r[1], r[2] * QE, r[3] * QE, r[4], r[5], r[6]]);
      s.pk = [...st.K.m.values()].map(r => [r[0], r[1], r[2] * QE, r[3] * QE]);
      if (st.M && st.M.length) s.mt = st.M.map(m => [m[0], m[1], m[2], m[3] * QE, m[4] * QE, m[5], m[6], m[7], m[8], m[9], m[10]]);
      if (s.x && st.A) s.x = Object.assign({}, s.x, { a: st.A });   // (DLC D2)
      if (s.x && st.W && st.W.p) s.x = Object.assign({}, s.x, { w: st.W });   // (DLC D6)
      if (s.x && st.O && st.O.h) s.x = Object.assign({}, s.x, { o: st.O });   // (DLC D7)
      if (s.x && st.F && (st.F.v || st.F.r)) s.x = Object.assign({}, s.x, st.F.v ? { v: st.F.v } : {}, st.F.r ? { r: st.F.r } : {});   // (DLC D11)
      if (s.x && st.X) { s.x = Object.assign({}, s.x); if (Object.keys(st.X).length) s.x.c = st.X; else delete s.x.c; }   // (DLC D11)
      s.kd = st.kd;
      if (st.WB) s.wp = { b: st.WB, u: st.WU, s: st.WS || [] };   // (field 15: js/world/world.js viewProps)
      if (v2) povOf(s, st, follow);
      return s;
    }
    /** U4: frame i seen from player `follow` (the shared pov(): the decoder's rows in world units; slot 0's moves from its slow state). */
    function povOf(s, st, follow) {
      pov(s, { players, rows: st.R.map(r => (r ? [r[0] * Q, r[1] * Q, ...r.slice(2)] : null)), slow: st.PS || [], casts: st.CS, follow,
        by: h.by || h.mon || '', mv0: (st.S && st.S.mv) || [] });
    }
    return { h, v: data.v, ev: data.ev || [], times, length: frames.length, at, players, get duration() { return times.length ? times[times.length - 1] : 0; },
      get t0() { return times.length ? times[0] : 0; } };
  }

  // ---------------- U4: sessions (segments loaded on demand) ----------------

  /**
   * A Session: idx [{seg, t0, t1, n, bytes, mk?}] sorted by seg; load(k) -> Promise<Reader|null> (the segment's tape).
   * opts: {h (a header to start from), players, end, marks}. Seeking finds the segment by time (a binary search), then the
   * segment's Reader seeks from its nearest checkpoint.
   */
  function session(idx, load, opts = {}) {
    const segs = idx.slice().sort((a, b) => a.seg - b.seg);
    const got = new Map(), wait = new Map();
    const S = {
      session: true, v: 2, segs,
      h: Object.assign({}, opts.h || {}, opts.end && opts.end.time != null ? { end: opts.end } : {}), players: opts.players || [], end: opts.end || null,
      marks: (opts.marks || []).slice(),
      get duration() { const l = segs[segs.length - 1]; return l ? l.t1 : 0; },
      get t0() { return segs.length ? segs[0].t0 : 0; },
      get limit() { return !!(S.end && S.end.lim) || !!(S.h.end && S.h.end.lim); },
      /** The segment (index into segs) playing at time t. */
      segAt(t) { let lo = 0, hi = segs.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (segs[m].t0 <= t) lo = m; else hi = m - 1; } return lo; },
      get(k) { return got.get(k) || null; },
      load(k) {
        if (k < 0 || k >= segs.length) return Promise.resolve(null);
        if (got.has(k)) return Promise.resolve(got.get(k));
        if (wait.has(k)) return wait.get(k);
        const p = Promise.resolve(load(segs[k].seg)).then(rd => { wait.delete(k); return rd ? S.put(k, rd) : null; })
          .catch(() => { wait.delete(k); return null; });
        wait.set(k, p);
        return p;
      },
      /** A segment's Reader, here now (a local tape: no waiting). */
      put(k, rd) {
        got.set(k, rd);
        // the session's header: the first segment's (by whoever recorded it), with the summary of the last one
        const prevEnd = S.h.end, prevBy = S.h.by;
        if (!S.h.v || k === 0) { S.h = Object.assign({}, rd.h); if (!S.h.by && prevBy) S.h.by = prevBy; delete S.h.end; if (prevEnd) S.h.end = prevEnd; }
        if (rd.h.end && (k === segs.length - 1 || rd.h.end.lim)) { S.h.end = rd.h.end; if (rd.h.end.lim) S.end = Object.assign({}, S.end || {}, { lim: 1 }); }
        if (rd.players && rd.players.length > S.players.length) S.players = rd.players;
        if (!opts.marks) for (const e of rd.ev) if (['bs', 'bk', 'z', 'dx'].includes(e[1]) && !S.marks.some(m => m[0] === e[0] && m[1] === e[1])) S.marks.push([e[0], e[1]]);
        return rd;
      },
      get loaded() { return got.size; }
    };
    return S;
  }
  /** A Session over packed codes (a local entry / a single tape): every segment opened up front. */
  async function sessionOfCodes(codes) {
    const rds = [];
    for (const c of codes) { const rd = await open(c); if (!rd) return null; rds.push(rd); }
    return sessionOfReaders(rds);
  }
  /** A Session over Readers already open (a v1 tape is a session of one segment). */
  async function sessionOfReaders(rds) {
    if (!rds.length) return null;
    const idx = rds.map((rd, k) => ({ seg: rd.h.seg != null ? rd.h.seg : k, t0: rd.t0, t1: rd.duration, n: rd.length }));
    const by = new Map(rds.map((rd, k) => [idx[k].seg, rd]));
    const S = session(idx, seg => by.get(seg), { h: rds[0].h });
    for (let k = 0; k < rds.length; k++) S.put(k, rds[k]);
    return S;
  }

  // ---------------- finishing, packing, local store ----------------

  const b64url = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const fromB64url = (str) => {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  };
  async function stream(bytes, mode) {
    const cs = mode === 'gzip' ? new CompressionStream('gzip') : new DecompressionStream('gzip');
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
    return new Uint8Array(buf);
  }
  async function pack(str) {
    const bytes = new TextEncoder().encode(str);
    if (typeof CompressionStream !== 'undefined') {
      try { return 'G1.' + b64url(await stream(bytes, 'gzip')); } catch (e) { /* the raw form below */ }
    }
    return 'R1.' + b64url(bytes);
  }
  async function unpack(code) {
    try {
      code = String(code || '').trim();
      if (code.startsWith('G1.')) return new TextDecoder().decode(await stream(fromB64url(code.slice(3)), 'gunzip'));
      if (code.startsWith('R1.')) return new TextDecoder().decode(fromB64url(code.slice(3)));
    } catch (e) { /* malformed */ }
    return null;
  }
  const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');

  function readStore() { try { const l = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  const sizeOf = e => (e.code || '').length + (e.segs || []).reduce((a, c) => a + (c || '').length, 0) + 400;
  /**
   * U4: an entry as stored. A session too big for the budget: if it is uploaded (its id, every segment up), only its id
   * and index stay; else its first segments that fit, marked `partial` (the summary's "Watch replay" still plays it whole
   * from memory until the page closes).
   */
  function fitEntry(e, budget) {
    if (sizeOf(e) <= budget || !e.segs || e.segs.length < 2) return e;
    const o = Object.assign({}, e);
    if (e.id && e.up >= e.segs.length) { o.segs = null; o.code = null; o.remote = true; return o; }
    const keep = [];
    let n = 400;
    for (const c of e.segs) { if (n + c.length > budget) break; keep.push(c); n += c.length; }
    o.segs = keep; o.partial = true; o.code = keep.length === 1 ? keep[0] : null;
    return o;
  }
  function writeStore(list) {
    // localStorage is the whole site's (the overworld, Battlecards and Micatro saves live there too): the replays keep
    // to STORE_MAX_CHARS, newest first, and a full storage drops the oldest replays (never anything else)
    let total = 0, keep = 0;
    list = list.map((e, i) => (i === 0 ? fitEntry(e, K.STORE_MAX_CHARS) : e));
    for (const e of list) { total += sizeOf(e); if (keep && total > K.STORE_MAX_CHARS) break; keep++; }
    list = list.slice(0, keep).map(e => { const o = Object.assign({}, e); delete o.ready; return o; });
    for (let n = list.length; n >= 0; n--) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, n))); return n; } catch (e) { /* smaller */ }
    }
    return 0;
  }
  function remember(entry) {
    const list = readStore().filter(e => e.rid !== entry.rid);
    list.unshift(entry);
    writeStore(list.slice(0, K.LOCAL_MAX));
  }
  function storeUpdate(rid, patch) {
    const l = readStore(), s = l.find(x => x.rid === rid);
    if (s) { Object.assign(s, patch); writeStore([s, ...l.filter(x => x !== s)].sort((a, b) => (b.when || 0) - (a.when || 0))); }
  }

  let last = null;         // the last finished run: { rid, segs, code, idx, meta, when, id?, ready:Promise }
  /**
   * endRun: closes the recording. `sum` = {time, level, kills, bosses, coins, dead, moves:[[id,lvl]]}.
   * Returns the entry at once; entry.ready resolves when every segment is packed and it is stored.
   */
  function finish(sum) {
    if (!rec) return null;
    try { sample(); } catch (e) { /* the run state may be half torn down */ }
    const r = rec;
    rec = null;
    closeSeg(r, true, sum);   // (a segment always holds a frame: the one that opened it)
    const meta = metaOf(r, sum);
    r.meta = meta;
    const entry = { rid: r.rid, when: r.started, meta, code: null, segs: null, idx: null, id: null, v: 2 };
    r.entry = entry;
    entry.ready = (async () => {
      const t0 = performance.now();
      const segs = [];
      for (const sg of r.closed) { await sg.ready; segs.push(sg); }
      entry.segs = segs.map(sg => sg.code);
      entry.idx = segs.map(segIdx);
      entry.code = entry.segs.length === 1 ? entry.segs[0] : null;
      meta.frames = segs.reduce((a, c) => a + c.n, 0);
      entry.packMs = Math.round(performance.now() - t0);
      entry.raw = segs.reduce((a, c) => a + (c.rawChars || 0), 0);
      // a session that was uploading: its last segment too (in the background)
      if (r.up.on) {
        for (const sg of segs) if (!r.up.done.has(sg.seg) && !sg.queued) { sg.queued = true; queueUpload(r, sg); }
        entry.upload = r.up.chain.then(() => { entry.id = r.up.id; entry.up = r.up.done.size; entry.bg = true; if (entry.id) storeUpdate(entry.rid, { id: entry.id, up: entry.up, bg: true }); });
      }
      remember({ rid: entry.rid, when: entry.when, meta, code: entry.code, segs: entry.segs, idx: entry.idx, id: entry.id, up: r.up.done.size, bg: r.up.on || undefined, v: 2 });
      return entry;
    })();
    last = entry;
    return entry;
  }

  // ---------------- sharing ----------------

  const linkOf = id => location.origin + '/msr/' + id;
  /** Uploads a stored replay (by rid) -> {ok, id, link} | {ok:false, error}. A retry reuses the first id. */
  async function share(rid) {
    const list = readStore();
    let e = list.find(x => x.rid === rid) || null;
    if (last && last.rid === rid) {
      if (last.upload) await last.upload;
      e = Object.assign({}, e || {}, { rid, meta: last.meta, code: last.code, segs: last.segs || (e && e.segs), idx: last.idx, id: last.id || (e && e.id), up: last.up, bg: last.bg });
    }
    if (!e || !(e.code || (e.segs && e.segs.length) || e.id)) return { ok: false, error: 'missing' };
    if (e.id && !e.bg) return { ok: true, id: e.id, link: linkOf(e.id) };
    if (!G.MicaAccount || !G.MicaAccount.name()) return { ok: false, error: 'login' };
    const done = id => {
      if (last && last.rid === rid) { last.id = id; last.bg = false; }
      storeUpdate(rid, { id, bg: false });
      return { ok: true, id, link: linkOf(id) };
    };
    // a session already uploaded in the background (every segment): it is kept (no longer the first to go past the cap)
    const segs = e.segs || (e.code ? [e.code] : []);
    if (e.id && e.bg && (e.remote || (e.up | 0) >= segs.length)) {
      const r = await G.MicaAccount.call('micasurvivor-replay-keep', { id: e.id }, { timeout: 15000 });
      if (!r.ok) return { ok: false, error: r.status === 0 ? 'offline' : 'server' };
      return done(e.id);
    }
    if (segs.some(c => c.length > K.PACKED_MAX)) return { ok: false, error: 'big' };
    if (e.partial) return { ok: false, error: 'missing' };
    // a v1 tape (kept from before U4): as it always was
    if (!e.v && e.code && segs.length === 1) {
      const r = await G.MicaAccount.call('micasurvivor-replay-put', { code: e.code, meta: e.meta, rid: e.rid }, { timeout: 30000 });
      if (!r.ok || !r.body.id) return { ok: false, error: r.status === 413 ? 'big' : r.status === 0 ? 'offline' : 'server' };
      return done(r.body.id);
    }
    let id = null;
    for (let k = 0; k < segs.length; k++) {
      const r = await putSeg(rid, k, segs[k], e.meta, k === segs.length - 1, true);
      if (!r.ok) return r;
      id = r.id;
    }
    return id ? done(id) : { ok: false, error: 'server' };
  }

  async function getJSON(body) {
    let res, out;
    try {
      res = await fetch('/api/mp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      out = await res.json();
    } catch (e) { return { ok: false, error: 'offline' }; }
    return { ok: res.ok, status: res.status, body: out || {} };
  }
  /** A shared replay by id (public): -> {ok, reader (a Reader, or a Session for a segmented one), meta, by} */
  async function fetchShared(id) {
    if (!/^[a-f0-9]{8,20}$/.test(String(id || ''))) return { ok: false, error: 'bad' };
    const r = await getJSON({ action: 'micasurvivor-replay-get', id });
    if (!r.ok && r.error === 'offline') return r;
    const body = r.body;
    if (!r.ok || !body || !(body.code || body.session)) return { ok: false, error: r.status === 404 ? 'missing' : 'server' };
    if (body.code) {
      const rd = await open(body.code);
      return rd ? { ok: true, reader: rd, meta: body.meta || {}, by: body.by || '', size: body.code.length } : { ok: false, error: 'bad' };
    }
    // U4: a session: its index now, its segments as the viewer needs them
    const ss = body.session, idx = Array.isArray(ss.idx) ? ss.idx.filter(Boolean) : [];
    if (!idx.length) return { ok: false, error: 'missing' };
    const S = session(idx, async seg => {
      for (let i = 0; i < 3; i++) {
        const g = await getJSON({ action: 'micasurvivor-replay-get', id, seg });
        if (g.ok && g.body && g.body.code) return open(g.body.code);
        if (g.status === 404) return null;
        await new Promise(res => setTimeout(res, 600 * (i + 1)));
      }
      return null;
    }, { players: ss.players || [], end: ss.end || null, marks: idx.flatMap(x => x.mk || []), h: { by: body.by || '' } });
    if (!(await S.load(0))) return { ok: false, error: 'server' };
    return { ok: true, reader: S, meta: body.meta || {}, by: body.by || '', size: idx.reduce((a, x) => a + (x.bytes | 0), 0) };
  }
  /** A packed tape (v1, or one v2 segment) -> a Reader (null if it is not one). */
  async function open(code) {
    const text = await unpack(code);
    if (!text) return null;
    try {
      const d = JSON.parse(text);
      if (!d || (d.v !== 1 && d.v !== 2) || !d.h || !Array.isArray(d.f) || !d.f.length) return null;
      return reader(d);
    } catch (e) { return null; }
  }
  /** U4: a local entry (or the last run) -> a Session (its segments in this browser, else fetched by its id). */
  async function openEntry(entry) {
    if (!entry) return null;
    if (entry.ready) await entry.ready;
    const segs = entry.segs && entry.segs.length ? entry.segs : entry.code ? [entry.code] : null;
    if (segs && !entry.partial) return sessionOfCodes(segs);
    if (entry.id) { const r = await fetchShared(entry.id); if (r.ok) return r.reader.session ? r.reader : sessionOfReaders([r.reader]); }
    return segs ? sessionOfCodes(segs) : null;
  }

  return {
    K, KF, RW, RWX, FV, newer, stats, thinDt, halve, begin, observe, finish, livePlayers, liveView, pov, share, fetchShared, open, openEntry, reader, session, sessionOfCodes, sessionOfReaders, pack, unpack, linkOf, cast,
    /** For tests: the entity-table codec (encode a frame / apply it). */
    _codec: { table, applyTable, applyRows },
    local: readStore,
    get recording() { return !!rec; }, get last() { return last; },
    /** For tests: the frames of the segment being recorded (JSON strings, as encoded). */
    get recFrames() { return rec ? rec.frames.slice() : null; },
    /** For tests: the recording's size so far (frames, JSON chars of the segment being recorded, segments closed). */
    get size() { return rec ? { frames: rec.total, bytes: rec.bytes, events: rec.ev.length, segs: rec.closed.length, seg: rec.seg, players: rec.players.length, up: rec.up.done.size, upOn: rec.up.on, id: rec.up.id, host: rec.host } : null; },
    STORE_KEY
  };
})();
