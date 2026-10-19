/* ============ mica/replay.js — full-run replays (MicaSurvivor M5 batch 12c, not upstream) ============
 * A run is recorded as a stream of snapshots (the live spectating snapshot, js/mica/spectate.js snap()) taken every
 * REC_DT seconds of RUN time, plus the key events. Nothing here touches the game: the recorder only READS the run
 * state (no random numbers, no hooks in the gameplay code), so the run plays exactly the same with it on.
 *
 *   observe(dt)  each frame of a run: a time check; every REC_DT of run time a snapshot is taken, compared with the
 *                previous one (events: lv level-up, mv a move learned / levelled up (the card picked), xe a move
 *                evolved, bs a boss appeared, bk a boss beaten, z a Z-move, dx Dynamax, dd fainted, bi biome, ar the
 *                rift arena; and which enemies that vanished died), handed to the live publisher and recorded.
 *   recording    delta-encoded and quantized as it goes (one small JSON string per frame, so a long run holds a
 *                couple of MB at most), frame = [dt, P, C, S, E, K, M]:
 *                  dt  run time since the previous frame (tenths of a second)
 *                  P   your Pokémon [x, y, dir, anim, hp, maxHp, flags]: differences from the previous frame (0 = none)
 *                  C   counters [level, xp, xpNext, kills, bosses, coins]: differences (0 = none)
 *                  S   the slow state (moves, items, Z / Dynamax, Team, biome, arena, weather, the level-up screen,
 *                      co-op down...) when it changed, else 0
 *                  E   enemies [died ids, gone ids, added rows, changed rows] (an entity table, below), K the
 *                      pickups (the same), M the co-op partners when they moved, else 0
 *                Positions are divided by Q (2 world units; QE = 4 for enemies, pickups and partners). An entity
 *                table: ids are delta-coded in ascending order; an added row is id + every field; every entity is
 *                predicted to repeat its last step, and a changed row is id + a bit mask + the corrections of the
 *                fields that differ from that (an enemy standing still, or walking straight on, costs nothing).
 *                Enemies' facing / animation are not recorded (the player derives them from their motion).
 *   finish()     the run's end: one more frame, the header (seed, mode, Pokémon, co-op group, the summary) ->
 *                {v:1, h, f:[frames], ev:[[t, kind, ...]]} packed 'G1.' + base64url(gzip(JSON)) ('R1.' raw
 *                fallback), the same format as the Micatro replays. Kept in this browser (localStorage
 *                micasurvivor_replays_v1, the last LOCAL_MAX runs within STORE_MAX_CHARS: the site shares that storage)
 *                so it can be shared later even if the upload fails.
 *   share        POST /api/mp micasurvivor-replay-put {code, meta, rid} -> id; the link /msr/<id>
 *                (= /micasurvivor/?replay=<id>). Reading one is public: micasurvivor-replay-get {id}.
 *   playback     open(code) -> a Reader: frame times, events and at(i) (the snapshot of frame i, decoded from the
 *                nearest checkpoint: seeking is cheap), drawn by js/ui/watch-ui.js.
 */
G.Replay = (() => {
  const K = {
    REC_DT: 0.5,         // seconds of run time between frames
    Q: 2,                // position quantum (your Pokémon)
    QE: 4,               // ...enemies, pickups and partners
    CHECK_EVERY: 40,     // a decoder checkpoint every 40 frames (20 s)
    LOCAL_MAX: 3,        // runs kept in this browser
    PACKED_MAX: 1200000, // the server's cap (MSURV_REPLAY_MAX)
    FRAMES_MAX: 30000,
    STORE_MAX_CHARS: 1200000   // the local copies, together (the newest is always kept)
  };
  const STORE_KEY = 'micasurvivor_replays_v1';
  const EW = 6, KW = 3;  // enemy row fields after the id: dex, x, y, hp%, maxHp, flags · pickup: kind, x, y
  const stats = { frames: 0, recMs: 0, recMax: 0, obsMs: 0, obsFrames: 0, events: 0 };

  // ---------------- the observer (each frame of a run) ----------------

  let rec = null;          // the recording in progress
  let acc = 0, prevS = null, bossSeen = new Set();

  function begin() {
    const g = G.Game, pl = g.player;
    acc = 0; prevS = null; bossSeen = new Set();
    rec = null;
    if (!pl) return;
    rec = {
      rid: hex(6), started: Date.now(),
      h: { v: 1, Q: K.Q, QE: K.QE, dt: K.REC_DT, sd: G.World.seed, m: g.mode || 'normal', dex: pl.dex, shiny: pl.shiny ? 1 : 0, mon: pl.mon.name,
           by: (G.MicaAccount && G.MicaAccount.name()) || '', coop: G.Coop && G.Coop.active ? (G.Coop.members || []).map(m => m.uid) : [],
           items: Object.keys(G.Items.BY), ew: EW, kw: KW },
      frames: [], ev: [], bytes: 0,
      // the encoder's memory of the previous frame
      P: null, C: null, S: '', E: { m: new Map(), v: new Map() }, Kp: { m: new Map(), v: new Map() }, M: '', t: 0
    };
    // DLC D0b: an Expedition run's header gains its content version (dv) and map / difficulty (js/expedition/core.js);
    // a base run's is unchanged (no listener, or one that leaves base runs alone)
    rec.h = G.Hooks.reduce('replay.header', rec.h);
    sample();
  }

  /** Each frame of a run (game.js frame): ~a microsecond, a snapshot every REC_DT of run time. */
  function observe(dt, playing) {
    if (!rec) return;
    const t0 = performance.now();
    if (playing) acc += dt;
    if (acc >= K.REC_DT) { acc -= K.REC_DT; if (acc > K.REC_DT) acc = 0; sample(); }
    const ms = performance.now() - t0;
    stats.obsMs += ms; stats.obsFrames++;
  }

  function sample() {
    if (!rec || rec.frames.length >= K.FRAMES_MAX) return;
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
    encode(s, kd);
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
    for (const k of ['ds', 'z', 'dy', 'tm', 'ar', 'wx', 'dn', 'cr', 'ad']) if (s[k] !== undefined) o[k] = s[k];
    return o;
  }
  function encode(s, kd) {
    const r = rec;
    const P = [q(s.p[0]), q(s.p[1]), s.p[2], s.p[3], s.p[4], s.p[5], s.p[6]];
    const C = [s.lv[0], s.lv[1], s.lv[2], s.k, s.bo, s.co];
    const S = JSON.stringify(slowOf(s));
    // (an enemy's facing and animation are not recorded: the player derives them from its motion)
    const E = table(r.E, s.e.map(e => [e[0], e[1], qe(e[2]), qe(e[3]), e[4], e[5], e[6]]), EW, kd);
    const Kt = table(r.Kp, s.pk.map(k => [k[0], k[1], qe(k[2]), qe(k[3])]), KW, null);
    const Mq = (s.mt || []).map(m => [m[0], m[1], m[2], qe(m[3]), qe(m[4]), m[5], m[6], m[7], m[8], m[9], m[10]]);
    const M = JSON.stringify(Mq);
    const f = [r.frames.length ? s.t - r.t : s.t, diff(r.P, P), diff(r.C, C), S !== r.S ? JSON.parse(S) : 0, E.out, Kt.out, M !== r.M ? Mq : 0];
    while (f.length > 1 && f[f.length - 1] === 0) f.pop();
    const txt = JSON.stringify(f);
    r.frames.push(txt); r.bytes += txt.length + 1;
    r.P = P; r.C = C; r.S = S; r.E = E.st; r.Kp = Kt.st; r.M = M; r.t = s.t;
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
  /** A Reader over a decoded replay {v, h, f, ev}. */
  function reader(data) {
    const h = data.h || {}, frames = data.f || [], Q = h.Q || K.Q, QE = h.QE || K.QE, ew = h.ew || EW, kw = h.kw || KW;
    const times = [];
    const tbl = () => ({ m: new Map(), v: new Map() }), ctbl = x => ({ m: new Map(x.m), v: new Map(x.v) });
    const fresh = () => ({ i: -1, t: 0, P: [0, 0, 0, 0, 0, 0, 0], C: [0, 0, 0, 0, 0, 0], S: {}, E: tbl(), K: tbl(), M: [], kd: [] });
    const clone = st => ({ i: st.i, t: st.t, P: st.P.slice(), C: st.C.slice(), S: st.S, E: ctbl(st.E), K: ctbl(st.K), M: st.M, kd: [] });
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
    /** The snapshot (live format) of frame i. */
    function at(i) {
      i = Math.max(0, Math.min(frames.length - 1, i | 0));
      if (!cur || cur.i > i || i - cur.i > K.CHECK_EVERY) cur = clone(checks[Math.floor(i / K.CHECK_EVERY)]);
      while (cur.i < i) step(cur);
      return view(cur);
    }
    function view(st) {
      const P = st.P, C = st.C, S = st.S;
      const s = Object.assign({ v: 1, t: st.t, sd: h.sd, me: [h.dex, h.shiny], p: [P[0] * Q, P[1] * Q, P[2], P[3], P[4], P[5], P[6]],
        lv: [C[0], C[1], C[2]], k: C[3], bo: C[4], co: C[5] }, S);
      s.e = [...st.E.m.values()].map(r => [r[0], r[1], r[2] * QE, r[3] * QE, r[4], r[5], r[6]]);
      s.pk = [...st.K.m.values()].map(r => [r[0], r[1], r[2] * QE, r[3] * QE]);
      if (st.M && st.M.length) s.mt = st.M.map(m => [m[0], m[1], m[2], m[3] * QE, m[4] * QE, m[5], m[6], m[7], m[8], m[9], m[10]]);
      s.kd = st.kd;
      return s;
    }
    return { h, ev: data.ev || [], times, length: frames.length, at, get duration() { return times.length ? times[times.length - 1] : 0; } };
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
  function writeStore(list) {
    // localStorage is the whole site's (the overworld, Battlecards and Micatro saves live there too): the replays keep
    // to STORE_MAX_CHARS, newest first, and a full storage drops the oldest replays (never anything else)
    let total = 0, keep = 0;
    for (const e of list) { total += (e.code || '').length + 400; if (keep && total > K.STORE_MAX_CHARS) break; keep++; }
    list = list.slice(0, keep);
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

  let last = null;         // the last finished run: { rid, code, meta, when, id?, packing:Promise }
  /**
   * endRun: closes the recording. `sum` = {time, level, kills, bosses, coins, dead, moves:[[id,lvl]]}.
   * Returns the entry at once; entry.ready resolves when it is packed and stored.
   */
  function finish(sum) {
    if (!rec) return null;
    try { sample(); } catch (e) { /* the run state may be half torn down */ }
    const r = rec;
    rec = null;
    const meta = { dex: r.h.dex, shiny: !!r.h.shiny, mon: r.h.mon, mode: r.h.m, time: Math.floor(sum.time || 0), level: sum.level | 0, kills: sum.kills | 0,
                   bosses: sum.bosses | 0, dead: !!sum.dead, coop: r.h.coop, frames: r.frames.length };
    if (r.h.dv != null) { meta.dv = r.h.dv; meta.map = r.h.map; meta.diff = r.h.diff; }   // (DLC D0b: an Expedition run only)
    const h = Object.assign({}, r.h, { end: sum, at: r.started });
    const entry = { rid: r.rid, when: r.started, meta, code: null, id: null };
    entry.ready = (async () => {
      const t0 = performance.now();
      const text = '{"v":1,"h":' + JSON.stringify(h) + ',"f":[' + r.frames.join(',') + '],"ev":' + JSON.stringify(r.ev) + '}';
      entry.raw = text.length;
      entry.code = await pack(text);
      entry.packMs = Math.round(performance.now() - t0);
      remember({ rid: entry.rid, when: entry.when, meta, code: entry.code, id: null });
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
    const e = list.find(x => x.rid === rid) || (last && last.rid === rid ? last : null);
    if (!e || !e.code) return { ok: false, error: 'missing' };
    if (e.id) return { ok: true, id: e.id, link: linkOf(e.id) };
    if (!G.MicaAccount || !G.MicaAccount.name()) return { ok: false, error: 'login' };
    if (e.code.length > K.PACKED_MAX) return { ok: false, error: 'big' };
    const r = await G.MicaAccount.call('micasurvivor-replay-put', { code: e.code, meta: e.meta, rid: e.rid }, { timeout: 30000 });
    if (!r.ok || !r.body.id) return { ok: false, error: r.status === 413 ? 'big' : r.status === 0 ? 'offline' : 'server' };
    e.id = r.body.id;
    if (last && last.rid === rid) last.id = e.id;
    const l2 = readStore();
    const s = l2.find(x => x.rid === rid);
    if (s) { s.id = e.id; writeStore(l2); }
    return { ok: true, id: e.id, link: linkOf(e.id) };
  }

  /** A shared replay by id (public): -> {ok, reader, meta, by} */
  async function fetchShared(id) {
    if (!/^[a-f0-9]{8,20}$/.test(String(id || ''))) return { ok: false, error: 'bad' };
    let res, body;
    try {
      res = await fetch('/api/mp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'micasurvivor-replay-get', id }) });
      body = await res.json();
    } catch (e) { return { ok: false, error: 'offline' }; }
    if (!res.ok || !body || !body.code) return { ok: false, error: res.status === 404 ? 'missing' : 'server' };
    const rd = await open(body.code);
    return rd ? { ok: true, reader: rd, meta: body.meta || {}, by: body.by || '', size: body.code.length } : { ok: false, error: 'bad' };
  }
  /** A packed replay -> a Reader (null if it is not one). */
  async function open(code) {
    const text = await unpack(code);
    if (!text) return null;
    try {
      const d = JSON.parse(text);
      if (!d || d.v !== 1 || !d.h || !Array.isArray(d.f) || !d.f.length) return null;
      return reader(d);
    } catch (e) { return null; }
  }

  return {
    K, stats, begin, observe, finish, share, fetchShared, open, reader, pack, unpack, linkOf,
    /** For tests: the entity-table codec (encode a frame / apply it). */
    _codec: { table, applyTable },
    local: readStore,
    get recording() { return !!rec; }, get last() { return last; },
    /** For tests: the recording's size so far (frames, JSON chars). */
    get size() { return rec ? { frames: rec.frames.length, bytes: rec.bytes, events: rec.ev.length } : null; },
    STORE_KEY
  };
})();
