// Plays engine UI events back on the board with Balatro-like pacing.
// An update is {view, events}: the events describe how the table got from the
// previously shown view to `view`. Updates queue up; input is blocked while a
// sequence with real animation is playing. Spectators feed the same updates.

const INSTANT = new Set(['highlight', 'sorted', 'shuffle', 'run_start']);
const KEY = 'micatro_speed';

export class Player {
  constructor(board) {
    this.board = board;
    this.queue = [];
    this.busy = false;
    this.lastSeq = 0;
    this.speed = 1;
    try { const s = +localStorage.getItem(KEY); if ([1, 2, 4].includes(s)) this.speed = s; } catch (e) { /* ignore */ }
    board.speed = this.speed;
    this.onIdle = null;
  }
  setSpeed(s) {
    this.speed = s; this.board.speed = s;
    try { localStorage.setItem(KEY, String(s)); } catch (e) { /* ignore */ }
  }
  idle() { return !this.busy && this.queue.length === 0; }

  /** Queue an update. opts.jump: snap without animating. */
  push(view, events = [], opts = {}) {
    this.queue.push({ view, events: events || [], jump: !!opts.jump });
    if (!this.busy) this.run();
  }
  /** Spectator ingest: animate only events newer than what we've shown. */
  ingest(view, events = []) {
    const evs = (events || []).filter((e) => e && typeof e.seq === 'number');
    const newest = evs.length ? evs[evs.length - 1].seq : this.lastSeq;
    const restarted = newest < this.lastSeq || (view && this.seed && view.seed !== this.seed); // a new run (seq reset)
    this.seed = view && view.seed;
    const fresh = restarted ? [] : evs.filter((e) => e.seq > this.lastSeq);
    // view.seq is the engine's event counter: if the snapshot is further along than the
    // events we were handed, some were missed — jump rather than animate half a story
    const missed = view && typeof view.seq === 'number' && view.seq - this.lastSeq > fresh.length;
    const gap = !this.board.view || this.lastSeq === 0 || missed || (fresh.length && fresh[0].seq > this.lastSeq + 1);
    if (restarted || gap || !fresh.length) {
      this.lastSeq = view && typeof view.seq === 'number' ? Math.max(newest, view.seq) : newest;
      this.push(view, [], { jump: true });
      return;
    }
    this.lastSeq = fresh[fresh.length - 1].seq;
    this.push(view, fresh);
  }

  async run() {
    this.busy = true;
    const B = this.board;
    while (this.queue.length) {
      const u = this.queue.shift();
      const evs = u.events;
      for (const e of evs) if (typeof e.seq === 'number' && e.seq > this.lastSeq) this.lastSeq = e.seq;
      const animated = !u.jump && B.view && evs.some((e) => !INSTANT.has(e.type));
      // collapse a backlog: if several updates are waiting, skip straight through older ones
      if (!animated || this.queue.length > 3) {
        if (!u.jump && B.view) for (const e of evs) if (INSTANT.has(e.type)) B.applyEvent(e);
        B.setView(u.view, { instant: u.jump && !B.view });
        continue;
      }
      B.setLocked(true);
      B.beginSequence(u.view);
      for (const e of evs) {
        let d = 0;
        try { d = B.applyEvent(e) || 0; } catch (err) { console.error('micatro: event', e.type, err); }
        if (d > 0) await this.wait(d);
      }
      await this.wait(0.15);
      B.setView(u.view);
      B.setLocked(this.queue.length > 0);
    }
    B.setLocked(false);
    this.busy = false;
    if (this.onIdle) this.onIdle();
  }
  wait(sec) {
    const ms = (sec * 1000) / this.speed;
    return new Promise((r) => setTimeout(r, ms));
  }
}
