'use strict';
/* ============ expedition/save.js — the Expedition's own save (MicaSurvivor DLC D0b, not upstream) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load, js/systems/expedition.js): a base boot never runs it.
 * Expedition progress (League catches, unlocks, Lab levels, records...) lives HERE, never in the base save:
 *
 *   signed in   the server row micasurvivorexp:<user> = {rev, save, updated_at} through POST /api/mp
 *               micasurvivor-exp-save-get / -put (server/mp.mjs). A put is compare-and-set on `rev`: a stale one
 *               gets 409 + the stored save, which is merged in, and the put retried. The server ALSO merges every
 *               put into what it holds, so nothing ever goes backwards. This browser keeps a copy
 *               (localStorage micasurvivorexp_save.mp:<user>, its rev in micasurvivorexp_rev.mp:<user>).
 *   guest       localStorage micasurvivorexp_save.guest only: no network request at all. The first time Expedition
 *               opens signed in in that browser, the guest progress is merged into the account (once:
 *               micasurvivorexp_migrated.guest; the guest copy is kept, like the base save's carry-over).
 *
 * The blob: {v: 1, counters: {name: n}, sets: {name: [id, ...]}}. The merge never loses progress: the MAX of each
 * counter, the UNION of each set. So a counter is a level or a record (best time, Lab level, catches), and something
 * that can be spent is two counters (earned, spent). Names: /^[a-z][a-z0-9_.:-]{0,63}$/; set ids are strings
 * /^[A-Za-z0-9_.:-]{1,64}$/ (numbers are stored as strings). Pokémonedas are NOT here: they are the base game's
 * (G.Expedition.wallet).
 */
G.ExpSave = (() => {
  const K_SAVE = 'micasurvivorexp_save.', K_REV = 'micasurvivorexp_rev.', K_MIG = 'micasurvivorexp_migrated.guest';
  const NAME_RE = /^[a-z][a-z0-9_.:-]{0,63}$/, ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
  const MAX = { counters: 2000, sets: 200, items: 5000, value: 1e15 };
  const PUSH_MS = 2000;

  const blank = () => ({ v: 1, counters: {}, sets: {} });
  const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
  /** A copy with only valid entries (a hand-edited or old copy can't break anything). */
  function clean(s) {
    const out = blank();
    if (!isObj(s)) return out;
    if (Number.isInteger(s.v) && s.v > 1) out.v = s.v;
    if (isObj(s.counters)) for (const k of Object.keys(s.counters).slice(0, MAX.counters)) {
      const n = s.counters[k];
      if (NAME_RE.test(k) && Number.isSafeInteger(n) && n >= 0 && n <= MAX.value) out.counters[k] = n;
    }
    if (isObj(s.sets)) for (const k of Object.keys(s.sets).slice(0, MAX.sets)) {
      if (!NAME_RE.test(k) || !Array.isArray(s.sets[k])) continue;
      const ids = [...new Set(s.sets[k].map(x => typeof x === 'number' && Number.isSafeInteger(x) ? String(x) : x).filter(x => typeof x === 'string' && ID_RE.test(x)))];
      out.sets[k] = ids.slice(0, MAX.items);
    }
    return out;
  }
  /** a + b without losing anything: the max of each counter, the union of each set. */
  function merge(a, b) {
    const out = clean(a), o = clean(b);
    out.v = Math.max(out.v, o.v);
    for (const k of Object.keys(o.counters)) out.counters[k] = Math.max(out.counters[k] || 0, o.counters[k]);
    for (const k of Object.keys(o.sets)) {
      const have = out.sets[k] || (out.sets[k] = []), seen = new Set(have);
      for (const id of o.sets[k]) if (!seen.has(id) && have.length < MAX.items) { have.push(id); seen.add(id); }
    }
    return out;
  }

  function read(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  const acc = () => G.MicaAccount;
  const user = () => (acc() && acc().name()) || null;
  let data = blank(), who = null, rev = 0, opened = null, pushT = 0, pushing = null, dirty = false, carried = false;

  /** Opens the save of whoever plays now (an account, or the guest). Resolves when it is ready. */
  function open() {
    const n = user(), w = n ? 'mp:' + n : 'guest';
    if (opened && who === w) return opened;
    who = w; carried = false;
    opened = (async () => {
      let s = clean(read(K_SAVE + w));
      if (!n) { data = s; rev = 0; return data; }
      rev = +read(K_REV + w) || 0;
      const r = await acc().call('micasurvivor-exp-save-get');
      let remote = null;
      if (r.ok) { rev = +r.body.rev || 0; remote = r.body.save ? clean(r.body.save) : null; if (remote) s = merge(s, remote); }
      // the guest's Expedition progress in this browser joins the account once (the merge never loses anything)
      const g = read(K_SAVE + 'guest');
      if (g && !read(K_MIG)) { s = merge(s, g); write(K_MIG, { to: n, at: Date.now() }); carried = true; }
      data = s;
      write(K_SAVE + w, data); write(K_REV + w, rev);
      if (!remote || JSON.stringify(remote) !== JSON.stringify(data)) await push();
      return data;
    })();
    return opened;
  }

  /** Writes to the account: compare-and-set on rev; a 409 merges what the server holds and tries again. */
  function push(opts = {}) {
    if (!user() || who !== 'mp:' + user()) return Promise.resolve({ ok: true, local: true });
    if (pushing) { dirty = true; return pushing; }
    clearTimeout(pushT); pushT = 0; dirty = false;
    pushing = (async () => {
      for (let i = 0; i < 4; i++) {
        const r = await acc().call('micasurvivor-exp-save-put', { save: data, rev }, opts);
        if (r.ok) {
          rev = +r.body.rev || rev + 1;
          if (r.body.save) data = merge(data, r.body.save);
          write(K_SAVE + who, data); write(K_REV + who, rev);
          return { ok: true, rev };
        }
        if (r.status === 409 && r.body && r.body.error === 'stale') {
          rev = +r.body.rev || 0;
          if (r.body.save) data = merge(data, r.body.save);
          write(K_SAVE + who, data); write(K_REV + who, rev);
          continue;
        }
        dirty = true;
        return { ok: false, status: r.status, error: r.body && r.body.error };
      }
      dirty = true;
      return { ok: false, error: 'busy' };
    })().finally(() => { pushing = null; if (dirty && !pushT) pushT = setTimeout(() => { pushT = 0; push(); }, PUSH_MS * 5); });
    return pushing;
  }

  /** After a change: the local copy now, the account a moment later. */
  function commit() {
    if (!who) return false;
    write(K_SAVE + who, data);
    if (who !== 'guest' && !pushT) pushT = setTimeout(() => { pushT = 0; push(); }, PUSH_MS);
    return true;
  }
  addEventListener('pagehide', () => { if (who && who !== 'guest' && (pushT || dirty)) push({ keepalive: true }); });

  const counter = k => data.counters[k] || 0;
  return {
    blank, clean, merge, open, push, commit,
    flush: () => push(),
    get: counter,
    /** A counter += n (merged by max: two devices adding at once keep the larger, never less). */
    bump(k, n = 1) { if (!NAME_RE.test(k)) return 0; data.counters[k] = Math.min(MAX.value, counter(k) + Math.max(0, Math.floor(n))); return data.counters[k]; },
    /** A record: the counter becomes max(itself, v). */
    best(k, v) { if (!NAME_RE.test(k)) return 0; data.counters[k] = Math.max(counter(k), Math.min(MAX.value, Math.max(0, Math.floor(v) || 0))); return data.counters[k]; },
    add(set, id) { id = String(id); if (!NAME_RE.test(set) || !ID_RE.test(id)) return false; const l = data.sets[set] || (data.sets[set] = []); if (l.includes(id)) return false; l.push(id); return true; },
    has: (set, id) => !!(data.sets[set] && data.sets[set].includes(String(id))),
    list: set => (data.sets[set] || []).slice(),
    get data() { return data; }, get who() { return who; }, get rev() { return rev; }, get carried() { return carried; },
    KEYS: { save: K_SAVE, rev: K_REV, migrated: K_MIG }
  };
})();
