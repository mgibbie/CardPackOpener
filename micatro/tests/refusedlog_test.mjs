// refusedlog_test.mjs — the quiet log of REFUSED actions (micatro/js/refusedlog.js; wired in micatro/js/ui/main.js
// onAction, sent by micatro/js/net.js sendRefused to server/mp.mjs micatro-refused).
//   * a refused Tarot (The Magician with 3 cards picked) is described with the right fields: action, card key, area,
//     highlighted count, max_highlighted, reason, ante / round / state, runId, rules
//   * describing it never touches the engine: no Math.random, the seeded RNG state, the view and the hand are the same,
//     and a run that described refusals between its moves plays on exactly like one that didn't
//   * the recorder: nothing while signed out; a burst goes in one send after the minimum delay; then at most one send
//     per 30 s; a page-hide flush is sent at once with keepalive; the same refusal again coalesces (n); the day cap holds
//     (and survives a reload through storage); a failing send is swallowed
//   * main.js records ONLY refusals (the success path never calls it), and the recorder never enters the recipe
//   node micatro/tests/refusedlog_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { newRun, act, G, STATES } from '../js/engine/run.js';
import { add_joker, E_MANAGER } from '../js/engine/core.js';
import { toView } from '../js/engine/view.js';
import { describeRefusal, createRefusedLog, rulesOf, REFUSED_FLUSH_MS, REFUSED_MIN_DELAY_MS } from '../js/refusedlog.js';

let fails = 0, passes = 0;
function ok(cond, msg, extra) { if (cond) { passes++; console.log('ok   ' + msg); } else { fails++; console.log('FAIL ' + msg + (extra != null ? '  ' + extra : '')); } }

function fresh(seed) {
  newRun({ seed, back: 'b_red' });
  const r = act({ type: 'select_blind' });
  if (!r.ok || G.STATE !== STATES.SELECTING_HAND) throw new Error('could not reach SELECTING_HAND');
}
const give = (key) => { const c = add_joker(key); E_MANAGER.flush(); return c; };
const snap = () => JSON.stringify({ rng: G.GAME.pseudorandom, state: G.STATE, hand: G.hand.cards.map((c) => c.sort_id), hl: G.hand.highlighted.map((c) => c.sort_id), dollars: G.GAME.dollars, view: toView() });

// ------------------------------------------------------------ describing a refusal
fresh('REFUSE1');
{
  const mag = give('c_magician'); // max_highlighted 2
  const targets = G.hand.cards.slice(0, 3).map((c) => c.sort_id);
  const view = toView();
  const a = { type: 'use', id: mag.sort_id, targets };
  const r = act(a);
  ok(!r.ok && r.error === 'cannot use now', 'The Magician with 3 cards picked is refused (cannot use now)', JSON.stringify(r));
  const before = snap();
  const realRandom = Math.random; let randomCalls = 0;
  Math.random = () => { randomCalls++; return realRandom(); };
  let e;
  try { e = describeRefusal(a, r, G, { runId: 'Labc123', view, ver: 'e1', now: 1234 }); } finally { Math.random = realRandom; }
  ok(e.action === 'use' && e.card === 'c_magician' && e.area === 'consumeables', 'the entry names the action, the card key and its area', JSON.stringify(e));
  ok(e.hl === 3 && e.targets === 3 && e.max === 2, 'the entry carries the highlighted count (3) and the card\'s max_highlighted (2)', JSON.stringify(e));
  ok(e.reason === 'cannot use now' && e.state === 'SELECTING_HAND' && e.stateId === STATES.SELECTING_HAND, 'the reason and the state', JSON.stringify(e));
  ok(e.ante === 1 && e.round === 1 && e.runId === 'Labc123' && e.ver === 'e1' && e.ts === 1234 && typeof e.dollars === 'number', 'ante / round / runId / rules / ts / dollars', JSON.stringify(e));
  ok(randomCalls === 0, 'describing it never calls Math.random');
  ok(snap() === before, 'describing it leaves the RNG state, the hand, the selection and the view untouched');
  // a card the view doesn't show: the engine's own key + area
  const e2 = describeRefusal(a, r, G, {});
  ok(e2.card === 'c_magician' && e2.area === 'consumeables' && !('runId' in e2), 'without a view the card comes from the engine', JSON.stringify(e2));
  // garbage in never throws
  let threw = false; try { describeRefusal(null, null, null, null); describeRefusal({ type: 'use', id: 99999 }, { error: 'x' }, { GAME: null }); } catch (err) { threw = true; }
  ok(!threw, 'odd inputs never throw');
}
// pack pick / buy / sell / play / discard refusals all describe
fresh('REFUSE2');
{
  const r = act({ type: 'discard' }); // nothing picked
  const e = describeRefusal({ type: 'discard' }, r, G, { view: toView() });
  ok(!r.ok && e.action === 'discard' && e.reason === 'cannot discard' && e.hl === 0, 'a refused discard (nothing picked)', JSON.stringify(e));
  const r2 = act({ type: 'buy', id: 1 });
  ok(!r2.ok && describeRefusal({ type: 'buy', id: 1 }, r2, G).reason === 'shop is closed', 'a refused buy');
}

// ------------------------------------------------------------ the engine plays on exactly the same
{
  const moves = (seed, withLog) => {
    fresh(seed);
    const log = createRefusedLog({ send: async () => {}, setTimer: () => 1, clearTimer: () => {} });
    const out = [];
    for (let i = 0; i < 6; i++) {
      const bad = { type: 'use', id: 424242 };
      const rb = act(bad); // refused (no such card)
      if (withLog) log.record(describeRefusal(bad, rb, G, { view: toView() }));
      const hl = G.hand.cards.slice(0, 1).map((c) => c.sort_id);
      act({ type: 'highlight', ids: hl });
      const r = act({ type: i % 2 ? 'discard' : 'play' });
      out.push(JSON.stringify({ ok: r.ok, rng: G.GAME.pseudorandom, hand: G.hand.cards.map((c) => c.config.card && c.config.card.key) }));
      if (G.STATE !== STATES.SELECTING_HAND) break;
    }
    return out.join('\n');
  };
  ok(moves('SAME1', true) === moves('SAME1', false), 'a run that logs refusals between moves plays on identically (no RNG used, no state changed)');
}

// ------------------------------------------------------------ the recorder
function rig({ enabled = true, storage = null, send = null } = {}) {
  let t = 1_700_000_000_000; const timers = []; const sent = [];
  const log = createRefusedLog({
    send: send || (async (entries, o) => { sent.push({ entries: entries.map((e) => ({ ...e })), keepalive: !!(o && o.keepalive), at: t }); }),
    enabled: () => (typeof enabled === 'function' ? enabled() : enabled), now: () => t, storage,
    setTimer: (fn, ms) => { const h = { fn, at: t + ms, live: true }; timers.push(h); return h; }, clearTimer: (h) => { if (h) h.live = false; },
  });
  const advance = async (ms) => {
    const end = t + ms;
    for (;;) {
      const next = timers.filter((h) => h.live && h.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      t = next.at; next.live = false; await next.fn(); await null;
    }
    t = end;
  };
  return { log, sent, advance, timers, get t() { return t; }, set t(v) { t = v; } };
}
const entry = (over = {}) => ({ ts: 1, action: 'use', card: 'c_magician', reason: 'cannot use now', state: 'SELECTING_HAND', hl: 3, ...over });
{
  const R = rig({ enabled: false });
  ok(R.log.record(entry()) === false && R.log.pending.length === 0 && R.timers.length === 0, 'signed out: nothing is kept or scheduled');
}
{
  const R = rig();
  R.log.record(entry());
  R.log.record(entry({ card: 'c_strength' }));
  ok(R.sent.length === 0 && R.log.pending.length === 2, 'records wait for the batch (nothing sent synchronously)');
  await R.advance(REFUSED_MIN_DELAY_MS - 1);
  ok(R.sent.length === 0, 'not before the minimum delay');
  await R.advance(1);
  ok(R.sent.length === 1 && R.sent[0].entries.length === 2 && !R.sent[0].keepalive, 'a burst goes in ONE send', JSON.stringify(R.sent.map((s) => s.entries.length)));
  const first = R.t;
  R.log.record(entry({ card: 'c_death' }));
  await R.advance(REFUSED_FLUSH_MS - 1);
  ok(R.sent.length === 1, 'the next send waits for the 30 s throttle');
  await R.advance(1);
  ok(R.sent.length === 2 && R.sent[1].at - first >= REFUSED_FLUSH_MS, 'then it is sent, 30 s after the last');
  // page hide: sent now, keepalive
  R.log.record(entry({ card: 'c_hanged_man' }));
  await R.log.flush({ keepalive: true });
  ok(R.sent.length === 3 && R.sent[2].keepalive && R.log.pending.length === 0, 'a page-hide flush sends at once with keepalive');
  ok(!(await R.log.flush({ keepalive: true })) && R.sent.length === 3, 'an empty flush sends nothing');
}
{
  const R = rig();
  R.log.record(entry()); R.t += 1000; R.log.record(entry()); R.t += 1000; R.log.record(entry());
  ok(R.log.pending.length === 1 && R.log.pending[0].n === 3, 'the same refusal again within 5 s coalesces (n: 3)', JSON.stringify(R.log.pending));
  R.t += 6000; R.log.record(entry());
  ok(R.log.pending.length === 2, 'after 5 s quiet it is a new entry');
  R.log.record(entry({ reason: 'busy' }));
  ok(R.log.pending.length === 3, 'a different reason is a new entry');
}
{
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const R = rig({ storage });
  let kept = 0;
  for (let i = 0; i < 230; i++) { if (R.log.record(entry({ card: 'c_' + i }))) kept++; if (R.log.pending.length >= 40) await R.log.flush(); }
  await R.log.flush();
  const total = R.sent.reduce((n, s) => n + s.entries.length, 0);
  ok(kept === 200 && total === 200 && R.log.countToday === 200, 'at most 200 entries a day', `kept ${kept} sent ${total}`);
  const R2 = rig({ storage });
  ok(R2.log.record(entry({ card: 'c_more' })) === false, 'the day cap survives a reload (storage)');
  R2.t += 86_400_000;
  ok(R2.log.record(entry({ card: 'c_tomorrow' })) === true, 'a new UTC day starts a new count');
  const R3 = rig({ storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } });
  ok(R3.log.record(entry()) === true, 'storage that throws is ignored');
}
{
  const R = rig({ send: async () => { throw new Error('offline'); } });
  R.log.record(entry());
  let threw = false; try { await R.advance(REFUSED_MIN_DELAY_MS); await R.log.flush({ keepalive: true }); } catch (e) { threw = true; }
  ok(!threw && R.log.pending.length === 0, 'a failing send is swallowed');
  let signedIn = true;
  const R2 = rig({ enabled: () => signedIn });
  R2.log.record(entry()); signedIn = false;
  await R2.advance(REFUSED_MIN_DELAY_MS);
  ok(R2.sent.length === 0 && R2.log.pending.length === 0, 'signed out before the send: the batch is dropped, not sent');
}
ok(rulesOf({ engineRev: 1, modVersions: { pokermon: '3.9.1+r15' } }) === 'e1 pokermon@3.9.1+r15' && rulesOf(null) === '', 'rulesOf: the engine rev + the mod pins');

// ------------------------------------------------------------ main.js wiring
{
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../js/ui/main.js'), 'utf8').replace(/\r\n/g, '\n');
  const body = src.slice(src.indexOf('function onAction(a)'), src.indexOf('\nfunction record(events)'));
  const fn = body.slice(0, body.indexOf('\n}\n'));
  ok(/if \(!r\.ok\) return noteRefused\(a, r\);/.test(fn), 'onAction logs an engine refusal');
  ok(/return noteRefused\(a, \{ ok: false, error: 'busy' \}\)/.test(fn), "onAction logs a 'busy' refusal");
  const after = fn.slice(fn.indexOf('if (!r.ok) return noteRefused'));
  ok((fn.match(/noteRefused\(/g) || []).length === 3 && !/noteRefused/.test(after.slice(after.indexOf('\n'))), 'the success path never records');
  ok(!/session\.recipe\.actions|recipe\.actions\.push/.test(body.slice(body.indexOf('function noteRefused'))), 'the recorder never touches the recipe');
  ok(/addEventListener\('pagehide', flushRefused\)/.test(src), 'page hide flushes the log');
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
