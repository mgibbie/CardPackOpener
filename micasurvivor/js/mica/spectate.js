/* ============ mica/spectate.js — live spectating of a friend (MicaSurvivor M5 batch 12c, not upstream) ============
 * A friend watches your run read-only, on their own copy of the game's canvas (js/ui/watch-ui.js). There are no
 * sockets: your client publishes a compact SNAPSHOT of the run through the site's backend and the watcher polls it.
 *
 *   snapshot  snap(): your Pokémon (position, facing, animation, HP, level, XP, moves, items, Z / Dynamax state,
 *             Team Mode), the nearby enemies (id, species, position, HP, boss / shiny / status), the pickups, the
 *             clock, biome, mode, world seed and rift arena, your co-op partners (online, and the local one with
 *             its controller and whether you are down), the kills / bosses / coins, whether the level-up (or an
 *             item / bond / Tower) choice is open, and the events since the last one (js/mica/replay.js
 *             observe(): level-ups, picks, boss spawns / kills, Z-moves, Dynamax, death). The same snapshot is
 *             what the replay recorder stores (delta-encoded, js/mica/replay.js).
 *   publish   POST /api/mp `publish-micasurvivor` {run, label, mode, dex, group, over, snapshot?}
 *             - signed-in players with at least one friend only (a guest or a friendless player sends nothing);
 *             - with nobody watching: every CHECK_MS WITHOUT a snapshot. The server only READS the watcher
 *               heartbeats then, and rewrites your "in a run" beacon every 5 minutes: ~0.2 row writes a minute;
 *             - while a friend watches (their heartbeat is in the answer): every PUB_MS WITH a snapshot (1 row
 *               write a second; 1 per 5 s past 60 watched minutes a day, `slow` in the answer);
 *             - at the end: once more with over + the summary (and on closing the tab, a keepalive "over").
 *   watch     POST /api/mp `micasurvivor-state` {username, seq} every POLL_MS (friends only, both ways): the
 *             latest snapshot, or {waiting} (live, but no snapshot yet: the publisher notices you within ~10 s),
 *             or {live:false} / {over}. Each poll heartbeats msurvspec:<them>:<you> (at most every 4 s).
 *
 * Test hooks (window.__msurvNet, set before the page loads): {specCheckMs, specPubMs, specPollMs}.
 *   G.Spectate.snap() · runStarted() · tick() · runEnded(summary) · watch(user, handlers) · unwatch() · stats
 */
G.Spectate = (() => {
  const H = () => window.__msurvNet || {};
  const K = {
    PUB_MS: 1000, CHECK_MS: 10000, SLOW_MS: 5000, POLL_MS: 1000,
    NEAR: 720,           // enemies this close (world units) go in a snapshot...
    BOSS_NEAR: 1600,     // ...bosses this close
    MAX_E: 80, MAX_PK: 24, MAX_XP: 40, PK_NEAR: 520
  };
  const pubMs = () => +H().specPubMs || K.PUB_MS, checkMs = () => +H().specCheckMs || K.CHECK_MS, pollMs = () => +H().specPollMs || K.POLL_MS;
  const ANIMS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint'];
  const PK = ['xp', 'xpBig', 'heal', 'magnet', 'bomb', 'coin', 'ticket', 'ticket10', 'item'];
  const r1 = v => Math.round(v);
  const acc = () => G.MicaAccount;
  const stats = { pubChecks: 0, pubSnaps: 0, pubErr: 0, polls: 0, snapMs: 0, snaps: 0 };

  // ---------------- the snapshot ----------------

  const itemIds = () => Object.keys(G.Items.BY);
  const animIdx = a => { const i = ANIMS.indexOf(a && a.cur); return i < 0 ? 0 : i; };

  /**
   * The run as plain data (live format: positions in world units). `kd`: ids of enemies that died since the
   * previous snapshot (the replay observer works them out), `ev`: events since the previous one.
   */
  function snap(extra) {
    const t0 = performance.now();
    const g = G.Game, pl = g && g.player;
    if (!pl) return null;
    const st = g.state;
    let s = {
      v: 1, t: Math.round(g.st.time * 10), sd: G.World.seed, b: G.World.biome, m: g.mode,
      me: [pl.dex, pl.shiny ? 1 : 0],
      p: [r1(pl.x), r1(pl.y), pl.anim.dir | 0, animIdx(pl.anim), Math.ceil(Math.max(0, pl.hp)), r1(pl.maxHp),
          (pl.dead ? 1 : 0) | (pl.walking ? 2 : 0) | (pl.dyn ? 4 : 0) | (pl.coopDown ? 8 : 0) | (pl.zHidden ? 16 : 0)],
      lv: [pl.level, Math.floor(pl.xp), Math.ceil(pl.xpNext)], k: pl.kills, bo: pl.bosses, co: pl.coins,
      mv: pl.moves.map(m => [m.id, m.lvl, m.evolved ? 1 : 0]), ac: pl.active | 0,
      it: [pl.item || '', pl.item2 || ''],
      lu: st === 'levelup' ? 1 : st === 'choice' || st === 'held' ? 2 : st === 'paused' ? 3 : 0
    };
    const ad = G.Adaptive && G.Adaptive.pct();
    if (ad > 0) s.ad = ad;            // the adaptive difficulty's "Challenge: N%"
    if (pl.dynScale) s.ds = [Math.round(pl.dynScale[0] * 100), Math.round(pl.dynScale[1] * 100)];
    // Z-move / Dynamax (their buttons are not drawn for a watched player: the watcher's own HUD shows these)
    const zt = G.ZMoves && G.ZMoves.activeType(pl);
    if (zt) s.z = [zt, G.ZMoves.state || '', G.ZMoves.used ? 1 : 0, Math.ceil(G.ZMoves.cd || 0)];
    if (G.Dynamax && G.Dynamax.unlocked()) s.dy = [G.Dynamax.active ? 1 : 0, Math.ceil(G.Dynamax.left || 0), G.Dynamax.used ? 1 : 0, Math.ceil(G.Dynamax.cd || 0)];
    if (G.Team && G.Team.on) s.tm = [G.Team.cur | 0, G.Team.view(pl).map(m => [m.dex, Math.round(G.U.clamp(m.frac, 0, 1) * 100)])];
    if (G.World.arena) { const a = G.World.arena; s.ar = [a.tx, a.ty, a.r, a.type || 'normal']; }
    const wx = G.Weather && G.Weather.current;
    if (wx && wx.kind) s.wx = wx.kind;
    // co-op partners: online (G.Coop) and the local one (G.LocalCoop: its controller, and you down / spectating it)
    const mt = [];
    if (G.Coop && G.Coop.active) {
      for (const m of G.Coop.mates) {
        if (!m.connected) continue;
        const o = m.pl;
        mt.push([m.name, o.dex, o.shiny ? 1 : 0, r1(o.x), r1(o.y), Math.ceil(Math.max(0, o.hp)), r1(o.maxHp), (o.dead ? 1 : 0) | (o.walking ? 2 : 0), o.anim.dir | 0, 'o', Math.max(0, G.Coop.COLORS.indexOf(m.color))]);
      }
      s.cr = G.Coop.isHost ? 'h' : 'g';
    }
    const LC = G.LocalCoop;
    if (LC && LC.on && LC.mate) {
      const o = LC.mate;
      const hp = LC.down ? LC.mateHp : o.hp, max = LC.down ? LC.mateMax : o.maxHp;
      mt.push([o.mon.name, o.dex, o.shiny ? 1 : 0, r1(o.x), r1(o.y), Math.ceil(Math.max(0, hp || 0)), r1(max || 1), (o.dead ? 1 : 0) | (o.walking ? 2 : 0), o.anim.dir | 0, 'l', LC.ctrl === 'p2' ? 1 : 0]);
      if (LC.down) s.dn = Math.ceil(LC.downLeft);
    }
    if (mt.length) s.mt = mt;
    // enemies near you (bosses from further away), nearest first past the cap
    const near2 = K.NEAR * K.NEAR, boss2 = K.BOSS_NEAR * K.BOSS_NEAR;
    let es = [];
    for (const e of G.EnemyMgr.all()) {
      if (e.dead) continue;
      const d2 = G.U.dist2(e.x, e.y, pl.x, pl.y);
      if (d2 > (e.boss ? boss2 : near2)) continue;
      es.push([d2, e]);
    }
    if (es.length > K.MAX_E) { es.sort((a, b) => a[0] - b[0]); es = es.slice(0, K.MAX_E); }
    s.e = es.map(([, e]) => [e.id, e.dex, r1(e.x), r1(e.y), Math.round(G.U.clamp(e.hp / (e.maxHp || 1), 0, 1) * 100), Math.ceil(e.maxHp),
      (e.boss ? 1 : 0) | (e.shiny ? 2 : 0) | (e.burn > 0 ? 4 : 0) | (e.poison > 0 ? 8 : 0) | (e.shield > 0 ? 16 : 0) | (e.den ? 32 : 0) | (e.judge ? 64 : 0),
      animIdx(e.anim) * 8 + ((e.anim && e.anim.dir) | 0)]).sort((a, b) => a[0] - b[0]);
    // pickups: the special ones near you, and some XP orbs
    const items = itemIds(), pk = [], xpn = [];
    const pk2 = K.PK_NEAR * K.PK_NEAR;
    for (const o of G.Pickups.all()) {
      const d2 = G.U.dist2(o.x, o.y, pl.x, pl.y);
      if (d2 > pk2) continue;
      const isXp = o.kind === 'xp' || o.kind === 'xpBig';
      (isXp ? xpn : pk).push([d2, o]);
    }
    const pick = (l, n) => (l.length > n ? l.sort((a, b) => a[0] - b[0]).slice(0, n) : l);
    s.pk = [...pick(pk, K.MAX_PK), ...pick(xpn, K.MAX_XP)].map(([, o]) => {
      let k = PK.indexOf(o.kind);
      if (o.kind === 'item') { const j = items.indexOf(o.value); k = j < 0 ? 8 : 100 + j; }
      return [o.id, k, r1(o.x), r1(o.y)];
    }).sort((a, b) => a[0] - b[0]);
    s = G.Hooks.reduce('spectate.snap', s);   // (DLC D0b: an Expedition run adds its dv; a base snapshot is unchanged)
    if (extra) Object.assign(s, extra);
    stats.snapMs += performance.now() - t0; stats.snaps++;
    return s;
  }

  /** A snapshot's pickup kind -> [kind, value] for G.Pickups.addRemote. */
  function pickupKind(k) {
    if (k >= 100) { const id = itemIds()[k - 100]; return id ? ['item', id] : ['coin', 0]; }
    return [PK[k] || 'xp', 0];
  }

  // ---------------- publishing (the player) ----------------

  let pub = null;          // { run, seq, watchers, nextAt, busy, slow, label, mode, group, dex, lastEv }
  const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');

  function canPublish() {
    const a = acc();
    if (!a || !a.name()) return false;
    // nobody can watch a player without friends (the friends list is read on the menu; unknown = try)
    if (G.Social && G.Social.started && !G.Social.friends.length) return false;
    return true;
  }

  // (the label is shown on the site's friends lists, which are in English)
  const MODE_EN = { daily: 'Daily Challenge', rush: 'Boss Rush', party: 'Party Mode', coop: 'Co-op Mode', tower: 'Floor Tower', rifts: 'Rift Time Attack', type: 'Survival by Type', team: 'Team Mode',
    'exp-classic': 'Expedition · Classic', 'exp-survival': 'Expedition · Survival', 'exp-league': 'Expedition · League' };   // (DLC D0b)
  function labelNow() {
    const pl = G.Game.player;
    const mon = pl ? pl.mon.name : '';
    const mode = G.Game.mode;
    const group = groupNow();
    if (group.length) return (mon + ' · co-op with ' + group.filter(u => u !== acc().name()).join(', ')).slice(0, 48);
    return mode && MODE_EN[mode] ? mon + ' · ' + MODE_EN[mode] : mon;
  }
  function groupNow() {
    if (!(G.Coop && G.Coop.active)) return [];
    return (G.Coop.members || []).map(m => m.uid).filter(Boolean);
  }

  /** startRun: a new run id; the first check (which also writes the beacon) right away. */
  function runStarted() {
    pub = null;
    if (!canPublish()) return;
    pub = { run: hex(6), seq: 0, watchers: 0, nextAt: 0, busy: false, slow: false, evq: [], gone: false };
    addEventListener('pagehide', onHide);
  }

  /** Each frame of a run (cheap: a time check). */
  function tick() {
    if (!pub || pub.busy || pub.gone) return;
    if (performance.now() < pub.nextAt) return;
    if (document.visibilityState === 'hidden' && !pub.watchers) { pub.nextAt = performance.now() + checkMs(); return; }
    send(false);
  }

  /** Events for the live snapshot (js/mica/replay.js observe()). */
  function events(list) { if (pub && pub.watchers && list.length) { pub.evq.push(...list); if (pub.evq.length > 60) pub.evq.splice(0, pub.evq.length - 60); } }
  let kdq = [];
  function died(ids) { if (pub && pub.watchers && ids.length) { kdq.push(...ids); if (kdq.length > 200) kdq = kdq.slice(-200); } }

  async function send(over, summary) {
    const p = pub;
    if (!p) return;
    p.busy = true;
    const watched = p.watchers > 0 || (over && p.watchers > 0);
    const body = { run: p.run, label: labelNow(), mode: G.Game.mode || 'normal', dex: G.Game.player ? G.Game.player.dex : 0, group: groupNow(), over: !!over };
    if (watched) {
      const s = snap({ ev: p.evq.splice(0), kd: kdq.splice(0), w: Math.round(performance.now()) });
      if (s) {
        if (over && summary) s.over = summary;
        body.snapshot = s; body.seq = ++p.seq;
      }
    }
    if (body.snapshot) stats.pubSnaps++; else stats.pubChecks++;
    const r = await acc().call('publish-micasurvivor', body, over ? { keepalive: true } : {});
    p.busy = false;
    if (pub !== p) return;
    if (!r.ok) { stats.pubErr++; p.nextAt = performance.now() + (r.status === 429 ? 3000 : checkMs()); return; }
    const was = p.watchers;
    p.watchers = r.body.watchers | 0;
    p.slow = !!r.body.slow;
    p.names = r.body.watcherNames || [];
    // somebody started watching you: a toast once (who, or how many)
    if (p.watchers > was && !over) {
      const fresh = p.names.filter(n => !(p.told || []).includes(n));
      p.told = [...new Set([...(p.told || []), ...p.names])];
      if (fresh.length) G.UI.toast(G.T(p.watchers > 1 ? '{x} personas te están mirando' : '{x} te está mirando').replace('{x}', p.watchers > 1 ? p.watchers : fresh[0]), 2600);
    }
    if (p.watchers !== was && G.Spectate.onWatchers) G.Spectate.onWatchers(p.watchers, p.names);
    // (a 'wait' answer: the server's floor; come back when it lifts)
    const every = p.watchers ? (p.slow ? K.SLOW_MS : pubMs()) : checkMs();
    p.nextAt = performance.now() + (r.body.wait ? Math.max(200, r.body.wait) : every);
  }

  /** endRun: the last publish (over, with the summary for whoever is watching), then nothing. */
  function runEnded(summary) {
    const p = pub;
    if (!p) return;
    removeEventListener('pagehide', onHide);
    p.gone = true;
    const go = () => { pub = p; send(true, summary).finally(() => { if (pub === p) pub = null; }); };
    if (p.busy) setTimeout(go, 400); else go();
  }
  function onHide(e) {
    if (e && e.persisted) return;
    if (!pub || pub.gone) return;
    const p = pub;
    p.gone = true;
    acc().call('publish-micasurvivor', { run: p.run, label: labelNow(), mode: G.Game.mode || 'normal', over: true }, { keepalive: true });
  }

  // ---------------- watching (the friend) ----------------

  let w = null;            // { who, seq, h, timer, gen }
  let wgen = 0;
  /**
   * Polls `who`'s run. handlers: { snapshot(s, info), waiting(info), ended(info), gone(info), error(info) }
   */
  function watch(who, h) {
    unwatch();
    w = { who, seq: null, h, timer: 0, gen: ++wgen, misses: 0, since: performance.now() };
    poll();
  }
  function unwatch() { if (w) clearTimeout(w.timer); w = null; }

  async function poll() {
    const me = w;
    if (!me) return;
    stats.polls++;
    const r = await acc().call('micasurvivor-state', { username: me.who, seq: me.seq });
    if (w !== me) return;
    const b = r.body || {};
    let next = pollMs();
    if (r.status === 403 && b.full) { me.h.error({ full: true, max: b.max }); next = 6000; }
    else if (r.status === 403) { me.h.error({ notFriend: true }); return; }
    else if (!r.ok) { me.h.error({ offline: true }); next = 3000; }
    else if (b.snapshot) {
      me.seq = b.seq;
      me.misses = 0;
      me.h.snapshot(b.snapshot, b);
      if (b.over) return;          // (the summary: nothing more to read)
    } else if (b.unchanged) {
      me.misses++;
      me.h.info && me.h.info(b);
    } else if (b.over) { me.h.ended(b); return; }
    else if (b.live === false) { me.h.gone(b); next = 4000; }
    else if (b.waiting) { me.h.waiting(b); }
    me.timer = setTimeout(poll, next);
  }

  return {
    K, ANIMS, PK, snap, pickupKind, runStarted, tick, runEnded, events, died, watch, unwatch, stats,
    onWatchers: null,
    /** For tests and the HUD line: who watches you right now, and whether the publisher runs. */
    get watchers() { return pub ? pub.watchers : 0; }, get watcherNames() { return pub ? (pub.names || []) : []; },
    get publishing() { return !!pub && !pub.gone; }, get runId() { return pub ? pub.run : null; },
    get watching() { return w ? w.who : null; }
  };
})();
