// replayview.js — MODE 'replay' (/micatro/?replay=<server id> | ?replay=local:<id>, /mr/<id>):
// watch a FINISHED RUN from its first blind to its end (game over, the win, or the end of Endless).
// There are no per-round replays: the source is always the whole run's recipe (micatro/js/replays.js).
//
// The board is the spectator's read-only table; the engine runs locally and re-simulates the
// recipe with a ReplayStepper (engine/session.js), feeding player.push(view, events) so every move
// animates exactly like live play. Selections / reorders run instantly. Seeking rebuilds from the
// start (engine state can't be cloned), then jumps the table to that point.
//
// Controls (a bar fixed to the bottom of the screen, tucked away while it plays untouched):
//   ⏮ first · ◀ step back · ▶/❚❚ play-pause · ▶ step forward · ⏭ last · 1×/2×/4× · scrubber with
//   blind ticks + ante marks · "Ante N" chips · action counter · Exit
//   keys: Space play/pause · ←/→ step · Home/End · controller: LB/RB step · secondary play/pause
//   (the bar's buttons are pad stops too, ui/pad.js)
import { setStickerSource } from './stickers.js';

const STEP_PAUSE = { instant: 0.22, move: 0.38 };   // seconds (at 1×) after an action before the next

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const OLDER_NOTICE = 'This replay was recorded on an older version and may play out differently';

/**
 * ctx: { spec, Engine:{Session, INSTANT_ACTIONS, viewChecksum, ENGINE_VERSION}, RP (replays.js), net,
 *        board, player, UI, ensureMods(ids) -> {ok, missing}, decorateView(v) -> v, direct, fmt, autoplay }
 * Returns the controller (also window.__micatro.replay).
 */
export async function startReplay(ctx) {
  const { spec, Engine, RP, net, board, player } = ctx;
  const home = '/micatro/' + (ctx.direct ? '?direct=1' : '');
  const backLink = `<a href="${home}">← Micatro</a>`;
  const fail = (msg) => { board.setBanner(`${backLink}<span class="spec-status">${msg}</span>`); ctrl.error = msg; return ctrl; };
  const ctrl = { ready: false, error: null };
  board.setBanner(`${backLink}<span class="spec-status">Loading replay…</span>`);

  // ---------------------------------------------------------------- the recipe
  let recipe = null, meta = {}, by = '', serverId = null, localId = null;
  if (/^local:/.test(spec)) {
    localId = spec.slice(6);
    const e = RP.get(localId);
    if (!e) return fail('That replay is no longer on this device (only your last 10 finished runs are kept).');
    recipe = e.recipe; meta = e.meta || {}; by = meta.username || ''; serverId = e.serverId || null;
  } else {
    if (!RP.SERVER_ID.test(spec)) return fail('That replay link is not valid.');
    if (!net || !net.fetchReplay) return fail('Replays need the network — try again later.');
    const d = await net.fetchReplay(spec);
    if (!d || d.error) return fail(d && d.error === 'not found' ? 'That replay has expired or never existed (shared replays last 30 days).' : 'Could not load that replay — try again later.');
    recipe = await RP.unpackRecipe(d.code);
    if (!recipe) return fail('That replay is damaged and cannot be played.');
    meta = d.meta || {}; by = d.by || ''; serverId = spec;
  }
  // the player's win stickers as they were when the run was recorded (recipe.win_stickers); an older replay
  // without them: this viewer's own. The viewer's own record is never changed.
  setStickerSource(recipe.win_stickers || null);
  const needMods = [...new Set([...(recipe.mods || []), ...((recipe.customDeck && Array.isArray(recipe.customDeck.mods)) ? recipe.customDeck.mods : [])])];
  if (needMods.length) {
    board.setBanner(`${backLink}<span class="spec-status">Loading mods…</span>`);
    const r = await ctx.ensureMods(needMods);
    if (r.missing && r.missing.length) return fail(`This run used mods this site no longer has: ${esc(r.missing.join(', '))}`);
    if (!r.ok) return fail('A mod this run used failed to load.');
  }

  // ---------------------------------------------------------------- the stepper
  let st, scan;
  board.setBanner(`${backLink}<span class="spec-status">Preparing the replay…</span>`);
  await sleep(30);
  try { st = Engine.Session.stepper(recipe); scan = st.scan(); } catch (e) { console.error('micatro: replay failed to start', e); return fail('This replay could not be rebuilt.'); }
  const total = st.total;
  const INSTANT = Engine.INSTANT_ACTIONS;
  const isMoveEnd = (j) => j === 0 || j >= total || !INSTANT.has(recipe.actions[j - 1].type);
  const who = by ? `<b>${esc(by)}</b>'s run` : 'Run replay';
  const deck = recipe.customDeck ? esc(recipe.customDeck.name || 'Custom deck') : '';
  board.setBanner(`${backLink}<span class="watching">▶ ${who}</span><span class="spec-status">${deck ? deck + ' · ' : ''}Seed <b>${esc(recipe.seed)}</b></span>`);

  // ---------------------------------------------------------------- the bar
  const bar = h('div', 'replay-bar');
  bar.id = 'replay-bar';
  const B = (label, cls, title, fn) => { const b = h('button', 'rb-btn ' + cls, label); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); poke(); fn(); }); return b; };
  const row1 = h('div', 'rb-row rb-main');
  const bFirst = B('⏮', 'rb-first', 'Back to the start', () => seekTo(0, { keepPlaying: false }));
  const bPrev = B('◀', 'rb-prev', 'Step back (←)', () => stepBack());
  const bPlay = B('▶', 'rb-play', 'Play / pause (Space)', () => toggle());
  const bNext = B('▶|', 'rb-next', 'Step forward (→)', () => stepForward());
  const bLast = B('⏭', 'rb-last', 'Jump to the end', () => seekTo(total, { keepPlaying: false }));
  const speeds = h('div', 'rb-speeds');
  for (const s of [1, 2, 4]) { const b = B(s + '×', 'rb-speed', `Speed ${s}×`, () => setSpeed(s)); b.dataset.speed = s; speeds.appendChild(b); }
  const counter = h('div', 'rb-count');
  const bExit = B('<span class="rb-xl">Exit</span><span class="rb-x">✕</span>', 'rb-exit', 'Leave the replay', () => { location.href = home; });
  row1.append(bFirst, bPrev, bPlay, bNext, bLast, speeds, counter, bExit);
  // scrubber + marks
  const scrubWrap = h('div', 'rb-scrub');
  const marks = h('div', 'rb-marks');
  const range = h('input', 'rb-range');
  range.type = 'range'; range.min = '0'; range.max = String(total); range.step = '1'; range.value = '0';
  range.setAttribute('aria-label', 'Replay position');
  const pct = (i) => (total ? (i / total) * 100 : 0);
  for (const b of scan.blinds) { const m = h('span', 'rb-mark blind'); m.style.left = pct(b.index) + '%'; m.title = `Ante ${b.ante}${b.blind ? ' · ' + b.blind : ''}`; marks.appendChild(m); }
  for (const a of scan.antes.slice(1)) { const m = h('span', 'rb-mark ante'); m.style.left = pct(a.index) + '%'; m.title = 'Ante ' + a.ante; marks.appendChild(m); }
  if (scan.winIndex != null) { const m = h('span', 'rb-mark win', '★'); m.style.left = pct(scan.winIndex) + '%'; m.title = 'Won!'; marks.appendChild(m); }
  if (scan.end.error) { const m = h('span', 'rb-mark stop'); m.style.left = pct(scan.end.error.index) + '%'; m.title = 'The replay stops here'; marks.appendChild(m); }
  scrubWrap.append(marks, range);
  // ante chips
  const chips = h('div', 'rb-antes');
  for (const a of scan.antes) {
    const c = B('Ante ' + a.ante, 'rb-ante', `Skip to Ante ${a.ante}`, () => seekTo(a.index));
    c.dataset.index = a.index; c.dataset.ante = a.ante;
    chips.appendChild(c);
  }
  if (scan.winIndex != null) { const c = B('★ Win', 'rb-ante rb-win', 'Skip to the win', () => seekTo(scan.winIndex)); c.dataset.index = scan.winIndex; chips.appendChild(c); }
  const note = h('div', 'rb-note');
  note.style.display = 'none';
  const tuck = h('button', 'rb-handle', '▴ Replay');
  tuck.type = 'button';
  tuck.addEventListener('click', (e) => { e.stopPropagation(); poke(); });
  bar.append(tuck, note, row1, scrubWrap, chips);
  document.body.appendChild(bar);
  document.body.classList.add('has-replay-bar');
  // the controller's hint strip sits just above the bar (--rb-h)
  const sizeVar = () => document.body.style.setProperty('--rb-h', bar.offsetHeight + 'px');
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(sizeVar).observe(bar);
  sizeVar();

  // ---------------------------------------------------------------- state
  let playing = false, token = 0, speed = [1, 2, 4].includes(player.speed) ? player.speed : 1, ended = false, notice = '';
  const nowView = () => ctx.decorateView(st.view());
  function setSpeed(s) {
    speed = s;
    player.setSpeed(s, { save: false });
    for (const b of speeds.children) b.classList.toggle('on', +b.dataset.speed === s);
  }
  setSpeed(speed);
  function showNotice(text) {
    notice = text;
    note.textContent = text;
    note.style.display = text ? '' : 'none';
  }
  function update() {
    const i = st.index;
    if (!scrubbing) range.value = String(i);   // (never yank the thumb out from under a drag)
    const a = scan.ante[i] != null ? scan.ante[i] : (nowView() || {}).ante;
    const v = board.view || {};
    counter.innerHTML = `<b>${i}</b> / ${total}<span class="rb-where">Ante ${a}${v.round ? ' · Round ' + v.round : ''}</span>`;
    bPlay.textContent = playing ? '❚❚' : '▶';
    bPlay.classList.toggle('on', playing);
    bPrev.disabled = bFirst.disabled = i <= 0;
    bNext.disabled = bLast.disabled = st.done;
    let cur = null;
    for (const c of chips.children) { if (!c.classList.contains('rb-win') && +c.dataset.index <= i) cur = c; c.classList.remove('on'); }
    if (cur) cur.classList.add('on');
    bar.classList.toggle('playing', playing);
  }
  /** The table after `st` moved: jump (no animation) to its view. */
  function jump() {
    player.cancel();
    player.push(nowView(), [], { jump: true });
  }
  function atEnd() {
    if (ended) return;
    ended = true;
    playing = false;
    const v = nowView();
    if (st.error) {
      showNotice(`${OLDER_NOTICE}. (It stops at move ${st.error.index + 1} of ${total}.)`);
    } else if (meta.checksum && Engine.viewChecksum(v) !== meta.checksum) {
      showNotice(OLDER_NOTICE + '.');
    } else {
      const best = ctx.fmt ? ctx.fmt(v.stats && v.stats.best_hand) : String((v.stats && v.stats.best_hand) || 0);
      showNotice(`End of the run — ${v.won ? (v.endless ? 'won, then Endless to ante ' + v.ante : 'won!') : 'game over at ante ' + v.ante} · best hand ${best}`);
    }
    note.classList.toggle('warn', !!st.error || (!!meta.checksum && Engine.viewChecksum(v) !== meta.checksum));
    ctrl.mismatch = !!st.error || (!!meta.checksum && Engine.viewChecksum(v) !== meta.checksum);
    update();
  }
  function idle() { return new Promise((res) => { const t = () => (player.idle() ? res() : setTimeout(t, 40)); t(); }); }
  async function loop() {
    const my = ++token;
    while (playing && my === token) {
      if (st.done) { atEnd(); break; }
      await idle();
      if (!playing || my !== token) break;
      const r = st.step();
      if (!r || !r.ok) { atEnd(); break; }
      player.push(nowView(), r.events);
      update();
      await sleep(((INSTANT.has(r.action.type) ? STEP_PAUSE.instant : STEP_PAUSE.move) * 1000) / speed);
    }
    if (my === token) { if (st.done) atEnd(); update(); }
  }
  function play() {
    if (st.done) { if (st.error) return; seekTo(0, { keepPlaying: false }); }
    playing = true; ended = false;
    poke();
    if (!notice || !note.classList.contains('warn')) showNotice('');
    update();
    loop();
  }
  function pause() { playing = false; token++; update(); }
  function toggle() { if (playing) pause(); else play(); }
  function seekTo(i, { keepPlaying = true } = {}) {
    const was = playing && keepPlaying;
    pause();
    st.seek(i);
    ended = false;
    if (!(note.classList.contains('warn') && st.error)) showNotice('');
    jump();
    update();
    if (st.done && i >= total) atEnd();
    else if (st.error) atEnd();
    if (was) play();
  }
  /** One move forward: any selections first (instant), then the next real action, animated. */
  async function stepForward() {
    pause();
    if (st.done) { atEnd(); return; }
    await idle();
    for (;;) {
      const r = st.step();
      if (!r || !r.ok) { jump(); atEnd(); return; }
      if (INSTANT.has(r.action.type) && !st.done) { player.push(nowView(), r.events); continue; }
      player.push(nowView(), r.events);
      break;
    }
    update();
    if (st.done) atEnd();
  }
  function stepBack() {
    let j = st.index - 1;
    while (j > 0 && !isMoveEnd(j)) j--;
    seekTo(Math.max(0, j), { keepPlaying: false });
  }

  // scrubbing: seek as the thumb moves (one seek per frame), resume on release if it was playing
  let scrubbing = null, raf = 0;
  range.addEventListener('pointerdown', (e) => e.stopPropagation());
  range.addEventListener('input', () => {
    if (!scrubbing) { scrubbing = { was: playing }; pause(); }
    poke();
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; st.seek(+range.value); jump(); update(); });
  });
  range.addEventListener('change', () => {
    const was = scrubbing ? scrubbing.was : false;
    scrubbing = null;
    seekTo(+range.value, { keepPlaying: false });
    if (was && !st.done) play();
  });

  // keys
  addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName) && e.target !== range) return;
    if (ctx.UI.modalOpen()) return;
    const k = e.key;
    if (k === ' ' || k === 'Spacebar') { e.preventDefault(); poke(); toggle(); }
    else if (k === 'ArrowRight') { e.preventDefault(); poke(); stepForward(); }
    else if (k === 'ArrowLeft') { e.preventDefault(); poke(); stepBack(); }
    else if (k === 'Home') { poke(); seekTo(0, { keepPlaying: false }); }
    else if (k === 'End') { poke(); seekTo(total, { keepPlaying: false }); }
  });

  // auto-tuck: while it plays untouched, the bar slides down to a small handle
  let tuckTimer = 0, mouseIn = false, swallow = false;   // (a mouse resting on the bar keeps it open; a touch's sticky :hover must not)
  bar.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') mouseIn = true; });
  bar.addEventListener('pointerleave', () => { mouseIn = false; });
  function poke() {
    bar.classList.remove('tucked'); document.body.classList.remove('rb-tucked');
    clearTimeout(tuckTimer);
    tuckTimer = setTimeout(() => { if (playing && !scrubbing && !mouseIn) { bar.classList.add('tucked'); document.body.classList.add('rb-tucked'); } else if (playing) poke(); }, 4000);
  }
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && e.clientY > innerHeight - 220) poke(); }, { passive: true });
  // a tap on the TUCKED bar only brings it back: the click that follows lands on whatever slid up
  // under the finger (▶, ⏭ ...) and must not press it
  addEventListener('pointerdown', (e) => { swallow = bar.classList.contains('tucked') && e.target instanceof Node && bar.contains(e.target); poke(); }, { passive: true, capture: true });
  bar.addEventListener('click', (e) => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);

  // ---------------------------------------------------------------- go
  player.lastSeq = 0;
  player.push(nowView(), [], { jump: true });
  update();
  poke();
  // (defineProperties, not Object.assign: the getters must stay live)
  Object.defineProperties(ctrl, Object.getOwnPropertyDescriptors({
    ready: true, total, scan, recipe, meta, by, serverId, localId,
    get index() { return st.index; }, get playing() { return playing; }, get speed() { return speed; }, get ended() { return ended; }, get notice() { return notice; },
    play, pause, toggle, seekTo, stepForward, stepBack, setSpeed, stepper: st, bar,
  }));
  if (ctx.autoplay !== false) setTimeout(() => { if (!playing && st.index === 0) play(); }, 700);
  return ctrl;
}
