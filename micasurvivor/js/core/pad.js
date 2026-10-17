/* ============ pad.js — controller play (MicaSurvivor M2, Plans/MICASURVIVOR_PLAN.md) ============
 *
 * The controller design of the Godot Android port by JayElDragon (MIT,
 * github.com/JayElDragon/poke-survivor, scripts/pad.gd + padicons.gd), re-built in
 * JS on the site's gamepad core (/site/gamepad.js: edges, held-direction repeat,
 * blur latching, remap capture).
 *
 *   - Left stick (radial deadzone, analog speed) or D-pad moves the partner, next to
 *     keyboard and touch (G.Input.axis asks G.Pad.axis first).
 *   - Remappable ACTIONS with per-layout defaults: prev / next move, pause, confirm,
 *     cancel, reroll. Layouts Xbox / PlayStation / Nintendo (Nintendo swaps confirm
 *     and cancel: the RIGHT face button confirms, the site standard). The port's
 *     ban / swap / zmove / dynamax are left out: the web game has no in-run card ban
 *     (Veto is picked in Upgrades), no team mode, no Z-moves and no Dynamax.
 *   - Remap with swap-on-conflict + reset, in Settings > Controls; saved with the
 *     game's settings (micasurvivor_settings: padLayout, padMap, padRumble).
 *   - Button glyphs (inline SVG for the DOM, the same SVG as an <img> for the canvas
 *     HUD) wherever keys are shown; body.pad-input switches every prompt between keys
 *     and glyphs: on with pad use, off with keyboard / mouse use.
 *   - Every screen is focus-navigable (spatial, like battlecards/padnav.js) with a
 *     visible ring; confirm activates, cancel is "back" everywhere, LB / RB cycle a
 *     screen's tabs.
 *   - Hot-plug: the first pad that presses something drives until it is unplugged.
 *     Rumble on hit (setting, off by default like the site's).
 *   - Site rule (owner, 2026-09-28): controller play is for SIGNED-IN Magepunk players;
 *     a guest's pad only shows how to enable it. One switch: SIGNED_IN_ONLY.
 *
 *   G.Pad.poll(ts)        once a frame, from game.js (before the keyboard)
 *   G.Pad.axis()          [x, y] movement or null
 *   G.Pad.glyphHTML(k)    a glyph <span> (k = action, button index or 'dpad'/'dpad_lr'/'lstick'...)
 *   G.Pad.drawGlyph(ctx, k, x, y, size)   the same on a canvas
 */
G.Pad = (() => {
  const SIGNED_IN_ONLY = true;
  const LAYOUTS = ['xbox', 'playstation', 'nintendo'];
  const LAYOUT_NAME = { xbox: 'Xbox', playstation: 'PlayStation', nintendo: 'Nintendo' };
  const ACTIONS = ['prev', 'next', 'pause', 'confirm', 'cancel', 'reroll'];
  const LABELS = {
    prev: 'Movimiento anterior', next: 'Movimiento siguiente', pause: 'Pausa',
    confirm: 'Aceptar / elegir', cancel: 'Atrás / cancelar', reroll: 'Cambiar cartas'
  };
  // Buttons an action may take (W3C standard mapping). The D-pad always moves /
  // navigates and Guide belongs to the system.
  const BINDABLE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const MOVE_DZ = 0.2;          // movement: radial deadzone, rescaled so speed starts at 0
  const NAV_DZ = 0.5;           // menus: the stick must really mean it
  const CORE_URL = new URL('../../../site/gamepad.js', document.currentScript ? document.currentScript.src : location.href).href;

  // ---------------------------------------------------------------- settings
  function siteLayout() {
    try { const v = JSON.parse(localStorage.getItem('magepunk_pad_v1') || 'null'); return v && v.layout === 'xbox' ? 'xbox' : 'nintendo'; }
    catch (e) { return 'nintendo'; }
  }
  function layout() {
    const l = G.Settings.get('padLayout');
    return LAYOUTS.includes(l) ? l : siteLayout();
  }
  function defaults(lay = layout()) {
    const n = lay === 'nintendo';
    return { prev: 4, next: 5, pause: 9, confirm: n ? 1 : 0, cancel: n ? 0 : 1, reroll: 3 };
  }
  function map() {
    const m = G.Settings.get('padMap');
    if (m && typeof m === 'object') {
      const vals = ACTIONS.map(a => m[a]);
      if (vals.every(v => BINDABLE.includes(v)) && new Set(vals).size === vals.length) return Object.assign({}, m);
    }
    return defaults();
  }
  const btn = a => map()[a];
  /** Give `action` button `b`; the action that had `b` takes `action`'s old button. */
  function setBtn(action, b) {
    if (!ACTIONS.includes(action) || !BINDABLE.includes(b)) return false;
    const cur = map(), old = cur[action];
    for (const a of ACTIONS) if (a !== action && cur[a] === b) cur[a] = old;
    cur[action] = b;
    G.Settings.set('padMap', cur);
    apply();
    return true;
  }
  function reset(lay) {
    if (LAYOUTS.includes(lay)) G.Settings.set('padLayout', lay);
    G.Settings.set('padMap', defaults());
    apply();
  }
  /** Button index -> what it does, for the core (every index spelled out). */
  function table() {
    const t = {};
    for (let i = 0; i <= 17; i++) t[i] = null;
    const m = map();
    for (const a of ACTIONS) t[m[a]] = a;
    t[12] = 'up'; t[13] = 'down'; t[14] = 'left'; t[15] = 'right';
    // View / Back with nothing on it: back in menus, pause in a run (as the port does).
    if (t[8] == null) t[8] = 'back';
    return t;
  }

  // ---------------------------------------------------------------- names + glyphs
  const NAMES = {
    0: ['A', 'Cross', 'B'], 1: ['B', 'Circle', 'A'], 2: ['X', 'Square', 'Y'], 3: ['Y', 'Triangle', 'X'],
    4: ['LB', 'L1', 'L'], 5: ['RB', 'R1', 'R'], 6: ['LT', 'L2', 'ZL'], 7: ['RT', 'R2', 'ZR'],
    8: ['View', 'Share', '−'], 9: ['Menu', 'Options', '+'], 10: ['LS', 'L3', 'LS'], 11: ['RS', 'R3', 'RS'],
    12: ['D-pad ↑', 'D-pad ↑', 'D-pad ↑'], 13: ['D-pad ↓', 'D-pad ↓', 'D-pad ↓'],
    14: ['D-pad ←', 'D-pad ←', 'D-pad ←'], 15: ['D-pad →', 'D-pad →', 'D-pad →'], 16: ['Guide', 'PS', 'Home']
  };
  const li = (lay = layout()) => LAYOUTS.indexOf(lay);
  function buttonName(i, lay) { const n = NAMES[i]; return n ? n[li(lay)] : 'Button ' + i; }

  const OUT = '#0b0f1e', DARK = '#20263c', MID = '#3b4466', LIGHT = '#e6e8f0';
  const XB = ['#3fb83a', '#e0382c', '#2f6fe0', '#f2c21e'];          // A B X Y
  const PS = ['#6fb0ff', '#ff6f7d', '#ff93d6', '#5fe8a0'];          // cross circle square triangle
  const N3 = ['#f2c21e', '#e0382c', '#3fae4a', '#2f6fe0'];          // bottom B, right A, left Y, top X
  const FONT = 'font-family="Arial,Helvetica,sans-serif" font-weight="700" text-anchor="middle"';
  const txt = (s, size, fill, y = 12) => `<text x="12" y="${y}" dy="0.36em" font-size="${size}" fill="${fill}" ${FONT}>${s}</text>`;
  const disc = (fill, ring) => `<circle cx="12" cy="12" r="11.6" fill="${OUT}"/><circle cx="12" cy="12" r="10.4" fill="${ring}"/><circle cx="12" cy="12" r="9.2" fill="${fill}"/>`;

  function face(i, lay) {
    if (lay === 'playstation') {
      const c = PS[i];
      const sym = i === 0 ? `<path d="M7.5 7.5l9 9M16.5 7.5l-9 9" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>`
        : i === 1 ? `<circle cx="12" cy="12" r="4.8" fill="none" stroke="${c}" stroke-width="2.3"/>`
        : i === 2 ? `<rect x="7.4" y="7.4" width="9.2" height="9.2" fill="none" stroke="${c}" stroke-width="2.2"/>`
        : `<path d="M12 6.6L17.4 16H6.6Z" fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round"/>`;
      return disc(DARK, MID) + sym;
    }
    if (lay === 'nintendo') {
      const c = N3[i];
      return `<circle cx="12" cy="12" r="11.6" fill="${OUT}"/><circle cx="12" cy="12" r="10.4" fill="${c}" opacity=".75"/><circle cx="12" cy="11.4" r="9.6" fill="${c}"/>` + txt(['B', 'A', 'Y', 'X'][i], 12, '#fdfdff', 11.6);
    }
    const c = XB[i];
    return `<circle cx="12" cy="12" r="11.8" fill="${c}" opacity=".35"/><circle cx="12" cy="12" r="10" fill="${c}"/><circle cx="12" cy="12" r="8.4" fill="#07080c"/>` + txt(['A', 'B', 'X', 'Y'][i], 11, c);
  }
  function shoulder(i, lay) {
    const trig = i === 6 || i === 7;
    const s = NAMES[i][li(lay)];
    const shape = trig ? `<path d="M3 21V9q0-6 9-6t9 6v12z" fill="${OUT}"/><path d="M4.4 19.6V9.4q0-4.8 7.6-4.8t7.6 4.8v10.2z" fill="${MID}" stroke="#aab2cc" stroke-width="1"/>`
      : `<rect x="1" y="5" width="22" height="14" rx="4" fill="${OUT}"/><rect x="2.4" y="6.4" width="19.2" height="11.2" rx="3" fill="${MID}" stroke="#aab2cc" stroke-width="1"/>`;
    return shape + txt(s, s.length > 1 ? 8.5 : 10, '#fff', trig ? 13 : 12);
  }
  function startBtn(lay) {
    if (lay === 'nintendo') return disc(DARK, MID) + `<path d="M12 6.5v11M6.5 12h11" stroke="${LIGHT}" stroke-width="2.6"/>`;
    if (lay === 'playstation') return disc(DARK, MID) + `<path d="M8.6 7v10M11.4 7v10M14.2 7v10M17 7v10" stroke="${LIGHT}" stroke-width="1.4"/>`;
    return disc(DARK, MID) + `<path d="M7 8h10M7 12h10M7 16h10" stroke="${LIGHT}" stroke-width="1.8"/>`;
  }
  function backBtn(lay) {
    if (lay === 'nintendo') return disc(DARK, MID) + `<path d="M6.5 12h11" stroke="${LIGHT}" stroke-width="2.6"/>`;
    if (lay === 'playstation') return disc(DARK, MID) + `<path d="M8 7l-1 2M11 7l-1 2M14 7l-1 2M17 7l-1 2" stroke="${LIGHT}" stroke-width="1.3"/><rect x="7" y="11" width="10" height="5" rx="2.5" fill="none" stroke="${LIGHT}" stroke-width="1.4"/>`;
    return disc(DARK, MID) + `<rect x="6.5" y="6.5" width="7" height="7" fill="none" stroke="${LIGHT}" stroke-width="1.3"/><rect x="10.5" y="10.5" width="7" height="7" fill="${DARK}" stroke="${LIGHT}" stroke-width="1.3"/>`;
  }
  function stick(left, arrows) {
    const ar = arrows ? `<path d="M12 1.6l2 2.4h-4zM12 22.4l2-2.4h-4zM1.6 12l2.4 2v-4zM22.4 12l-2.4 2v-4z" fill="#fff"/>` : '';
    return `<circle cx="12" cy="12" r="${arrows ? 9.4 : 11.6}" fill="${OUT}"/><circle cx="12" cy="12" r="${arrows ? 8.2 : 10.4}" fill="#aab2cc"/><circle cx="12" cy="12" r="${arrows ? 5.6 : 6.6}" fill="${MID}"/>` + txt(left ? 'L' : 'R', arrows ? 7 : 8.5, '#fff') + ar;
  }
  function dpad(active) {
    const arm = { 12: [9, 2, 6, 8], 13: [9, 14, 6, 8], 14: [2, 9, 8, 6], 15: [14, 9, 8, 6] };
    let s = `<path d="M8 1h8v7h7v8h-7v7H8v-7H1V8h7z" fill="${OUT}"/>`;
    for (const k of [12, 13, 14, 15]) { const [x, y, w, h] = arm[k]; s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${active.includes(k) ? '#fff' : '#5b648a'}"/>`; }
    return s + `<rect x="9" y="9" width="6" height="6" fill="#5b648a"/>`;
  }
  const NAMED = { dpad: [12, 13, 14, 15], dpad_lr: [14, 15], dpad_ud: [12, 13] };
  /** k: an action name, a button index, or a named glyph ('dpad', 'dpad_lr', 'dpad_ud', 'lstick', 'rstick'). */
  function resolve(k) {
    if (typeof k === 'number') return k;
    if (ACTIONS.includes(k)) return btn(k);
    if (/^\d+$/.test(String(k))) return +k;
    return k;
  }
  function svgBody(k, lay = layout()) {
    const i = resolve(k);
    if (NAMED[i]) return dpad(NAMED[i]);
    if (i === 'lstick' || i === 'rstick') return stick(i === 'lstick', true);
    if (i >= 0 && i <= 3) return face(i, lay);
    if (i >= 4 && i <= 7) return shoulder(i, lay);
    if (i === 8) return backBtn(lay);
    if (i === 9) return startBtn(lay);
    if (i === 10 || i === 11) return stick(i === 10, false);
    if (i >= 12 && i <= 15) return dpad([i]);
    return disc(DARK, MID) + `<circle cx="12" cy="12" r="2.6" fill="${LIGHT}"/>`;
  }
  function svg(k, size = 22, lay) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${svgBody(k, lay)}</svg>`;
  }
  function glyphTitle(k) {
    const i = resolve(k);
    return typeof i === 'number' ? buttonName(i) : i === 'lstick' ? 'Left stick' : 'D-pad';
  }
  function glyphHTML(k, size = 22) {
    return `<span class="pad-glyph" translate="no" data-g="${k}" data-s="${size}" title="${glyphTitle(k)}">${svg(k, size)}</span>`;
  }
  /** Re-draw every glyph on the page (after a layout change or a remap). */
  function refreshGlyphs(root = document) {
    root.querySelectorAll('.pad-glyph[data-g]').forEach(el => {
      const k = el.dataset.g;
      el.innerHTML = svg(/^\d+$/.test(k) ? +k : k, +el.dataset.s || 22);
      el.title = glyphTitle(/^\d+$/.test(k) ? +k : k);
    });
    hintKey = '';
  }
  const imgCache = new Map();
  function glyphImage(k, size) {
    const lay = layout(), i = resolve(k), px = Math.round(size * 2);
    const key = lay + '|' + i + '|' + px;
    let im = imgCache.get(key);
    if (!im) {
      im = new Image();
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(i, px, lay));
      imgCache.set(key, im);
    }
    return im;
  }
  function drawGlyph(ctx, k, x, y, size) {
    const im = glyphImage(k, size);
    if (im.complete && im.naturalWidth) ctx.drawImage(im, x, y, size, size);
  }

  // ---------------------------------------------------------------- who may play
  let signedAt = -1e9, signedVal = false;
  function signedIn() {
    const now = performance.now();
    if (now - signedAt > 2000) {
      signedAt = now;
      try { signedVal = !!localStorage.getItem('magepunk_mp_token_v1') && !!(JSON.parse(localStorage.getItem('magepunk_mp_state_v1') || 'null') || {}).username; }
      catch (e) { signedVal = false; }
    }
    return signedVal;
  }
  const allowed = () => !SIGNED_IN_ONLY || signedIn();

  // ---------------------------------------------------------------- input mode (keys / pad)
  let mode = 'keys';
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    document.body.classList.toggle('pad-input', m === 'pad');
    if (m === 'pad') ensure();
    syncHint();
  }
  let mdx = 0;
  addEventListener('keydown', e => {
    if (listening && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); stopListening(); return; }
    if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) setMode('keys');
  }, true);
  addEventListener('mousedown', () => setMode('keys'), true);
  addEventListener('wheel', () => setMode('keys'), { passive: true });
  addEventListener('mousemove', e => { if (mode !== 'pad') return; mdx += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0); if (mdx > 24) { mdx = 0; setMode('keys'); } });
  addEventListener('touchstart', () => setMode('keys'), { passive: true, capture: true });

  // ---------------------------------------------------------------- the pad itself
  let core = null, activeIdx = null, cur = null, lastHintAt = -1e9, guardRaw = new Set(), modeAtPoll = 'keys';
  const readAll = () => {
    let l = [];
    try { l = navigator.getGamepads ? [...navigator.getGamepads()] : []; } catch (e) { l = []; }
    return l.filter(p => p && p.connected !== false);
  };
  const isDown = b => !!b && (typeof b === 'object' ? (b.pressed || b.value > 0.5) : b > 0.5);
  const busy = p => (p.buttons || []).some(isDown) || Math.hypot(+(p.axes && p.axes[0]) || 0, +(p.axes && p.axes[1]) || 0) > NAV_DZ;

  import(CORE_URL).then(m => {
    core = m.createGamepad({
      readPads: () => (cur ? [cur] : []),
      deadzone: NAV_DZ,
      remap: table(),
      onPress: (a, o) => route(a, o.repeat),
      onButton: i => { if (listening) capture(i); },
    });
  }).catch(e => console.warn('[Pad] gamepad core did not load:', e && e.message));
  // leaving the tab lets go of everything, latched until physically released (site core rule)
  addEventListener('blur', () => { if (core) core.releaseAll(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && core) core.releaseAll(); });

  function apply() {
    // a button still held from the press that changed the map (the layout chip, a
    // remap) now means something else: it must be let go before it acts again
    if (cur) (cur.buttons || []).forEach((b, i) => { if (isDown(b)) guardRaw.add(i); });
    if (core) core.setOptions({ remap: table() });
    refreshGlyphs();
    imgCache.clear();
  }

  function poll(ts) {
    const pads = readAll();
    cur = activeIdx != null ? pads.find(p => p.index === activeIdx) || null : null;
    if (activeIdx != null && !cur) {
      activeIdx = null;
      if (core) core.releaseAll();
      G.UI && G.UI.toast(G.T('Mando desconectado'));
      setMode('keys');
    }
    if (!cur) {
      const p = pads.find(busy);
      if (p && !allowed()) {
        if (performance.now() - lastHintAt > 4000) { lastHintAt = performance.now(); G.UI && G.UI.toast(G.T('Inicia sesión en Magepunk para usar el mando'), 3000); }
        return;
      }
      if (p) { activeIdx = p.index; cur = p; G.UI && G.UI.toast(G.T('Mando conectado')); }
    }
    if (!cur || !core) return;
    modeAtPoll = mode;
    if (busy(cur)) setMode('pad');
    core.poll(ts);
    for (const i of [...guardRaw]) if (!isDown(cur.buttons && cur.buttons[i])) guardRaw.delete(i);
    if (mode === 'pad') { ensure(); scrollWithRightStick(); }
  }

  /** Movement: D-pad (digital) or the left stick (analog, radial deadzone rescaled to 0..1). */
  function axis() {
    if (!cur || !allowed()) return null;
    const b = cur.buttons || [];
    let x = (isDown(b[15]) ? 1 : 0) - (isDown(b[14]) ? 1 : 0), y = (isDown(b[13]) ? 1 : 0) - (isDown(b[12]) ? 1 : 0);
    if (x || y) { const m = Math.hypot(x, y); return [x / m, y / m]; }
    x = +(cur.axes && cur.axes[0]) || 0; y = +(cur.axes && cur.axes[1]) || 0;
    const m = Math.hypot(x, y);
    if (m < MOVE_DZ) return null;
    const k = Math.min(1, (m - MOVE_DZ) / (1 - MOVE_DZ)) / m;
    return [x * k, y * k];
  }

  function rumble(strength = 0.6, ms = 120) {
    if (!G.Settings.get('padRumble') || mode !== 'pad' || !cur) return false;
    const act = cur.vibrationActuator;
    if (!act || typeof act.playEffect !== 'function') return false;
    try { act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }); return true; } catch (e) { return false; }
  }

  // ---------------------------------------------------------------- remap capture
  let listening = null;      // { action, t }
  function listen(action) {
    listening = { action, t: performance.now() };
    clearTimeout(listen.to);
    listen.to = setTimeout(() => { if (listening && listening.action === action) stopListening(); }, 8000);
    rerenderSettings();
  }
  function stopListening() { listening = null; clearTimeout(listen.to); rerenderSettings(); }
  function capture(i) {
    if (!BINDABLE.includes(i)) return;        // D-pad / Guide: keep listening
    const a = listening.action;
    listening = null; clearTimeout(listen.to);
    setBtn(a, i);
    guardRaw.add(i);                          // this press must not also act
    G.Audio && G.Audio.sfx('confirm');
    rerenderSettings();
  }
  function rerenderSettings() { if (G.SettingsUI && G.SettingsUI.isOpen && G.SettingsUI.refresh) G.SettingsUI.refresh(); }

  // ---------------------------------------------------------------- focus navigation
  const $ = id => document.getElementById(id);
  const SEL = 'button, a[href], select, input:not([type=hidden]), .menu-item, .tab, .chip, .card, .cell, .answer, .gen-tab, .fav-slot, [data-pad]';
  const LAYERS = '.scr, #pull-fx, #tap-start, #sound-panel';
  const GUARDED = ['scr-levelup', 'scr-item', 'scr-bond'];      // pop up mid-run: no accidental pick
  let focus = null, focusKey = '', focusRect = null, lastScope, scopeSince = 0;
  const remembered = new Map();

  function shown(el) {
    if (!el || el.classList.contains('hidden') || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }
  function topScope() {
    let best = null, bz = -Infinity;
    for (const el of document.querySelectorAll(LAYERS)) {
      if (!shown(el)) continue;
      const z = parseInt(getComputedStyle(el).zIndex, 10) || 0;
      if (z >= bz) { bz = z; best = el; }          // equal z: the later one is on top
    }
    return best;
  }
  function usable(el) {
    if (el.disabled || el.closest('.hidden')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) return false;
    return getComputedStyle(el).visibility !== 'hidden';
  }
  function stops(scope) {
    const out = [...scope.querySelectorAll(SEL)].filter(usable);
    if (scope.id === 'scr-menu') for (const b of document.querySelectorAll('#topbar button, #user-pill')) if (usable(b)) out.push(b);
    return out;
  }
  const isBack = el => el.matches('[data-back]') || /-(close|back|cancel)$/.test(el.id || '');
  const HOME = ['#btn-guest', '.menu-item.play', '#btn-resume', '#btn-again', '#pull-close', '#res-ok', '#lobby-start',
                '.cell.on', '.card:not(.picked)', '.answer', '.gen-tab.on', '.tab.on'];
  function home(scope, list) {
    const mem = remembered.get(scope.id || scope);
    if (mem && list.includes(mem)) return mem;
    for (const s of HOME) { const el = list.find(x => x.matches(s)); if (el) return el; }
    return list.find(x => !isBack(x)) || list[0] || null;
  }
  function keyOf(el) {
    if (el.id) return '#' + el.id;
    const cls = String(el.className || '').replace(/\b(pad-focus|on|ban|picked)\b/g, '').replace(/\s+/g, ' ').trim();
    return el.tagName + '|' + cls + '|' + JSON.stringify(el.dataset) + '|' + (el.textContent || '').trim().slice(0, 30);
  }
  const center = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  function nearest(list, r0) {
    const c0 = center(r0);
    let best = null, bd = Infinity;
    for (const el of list) { const c = center(el.getBoundingClientRect()), d = Math.hypot(c.x - c0.x, c.y - c0.y); if (d < bd) { bd = d; best = el; } }
    return best;
  }
  function setFocus(el, scope, sound) {
    if (focus && focus !== el) focus.classList.remove('pad-focus');
    focus = el;
    if (!el) { focusKey = ''; return; }
    el.classList.add('pad-focus');
    focusKey = keyOf(el);
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* old browsers */ }
    focusRect = el.getBoundingClientRect();
    if (scope) remembered.set(scope.id || scope, el);
    if (sound && G.Audio) G.Audio.sfx('hover');
  }
  /** Keep the focus on a live stop of the top screen; returns { scope, list, fresh }. */
  function ensure() {
    const scope = topScope();
    if (scope !== lastScope) {
      lastScope = scope; scopeSince = performance.now();
      if (focus) focus.classList.remove('pad-focus');
      focus = null;
      syncHint();
      if (!scope) return { scope, list: [], fresh: true };
      const list = stops(scope);
      setFocus(home(scope, list), scope);
      return { scope, list, fresh: true };
    }
    if (!scope) return { scope, list: [], fresh: false };
    if (focus && focus.isConnected && scope.contains(focus) || (focus && scope.id === 'scr-menu' && focus.isConnected && focus.closest('#topbar'))) {
      if (!focus.classList.contains('pad-focus')) focus.classList.add('pad-focus');
      if (usable(focus)) return { scope, list: null, fresh: false };
    }
    // the focused control was rebuilt (a re-render) or went away: same control, else the nearest one
    const list = stops(scope);
    const same = list.filter(el => keyOf(el) === focusKey);
    const next = same.length ? (focusRect ? nearest(same, focusRect) : same[0]) : focusRect && list.length ? nearest(list, focusRect) : home(scope, list);
    setFocus(next, scope);
    return { scope, list, fresh: false };
  }
  function move(dir) {
    const { scope } = ensure();
    if (!scope || !focus) return;
    const list = stops(scope);
    const r0 = focus.getBoundingClientRect(), c0 = center(r0);
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    // Prefer controls inside a 2:1 cone that way: a slightly offset one a row above is not "right"
    // (MicaSurvivor M5 batch 3: right from Repertoire's wide price button jumped up to Magnet).
    let best = null, bs = Infinity, cone = false;
    for (const el of list) {
      if (el === focus || el.contains(focus) || focus.contains(el)) continue;
      const c = center(el.getBoundingClientRect());
      const along = (c.x - c0.x) * dx + (c.y - c0.y) * dy;
      if (along <= 4) continue;
      const across = Math.abs((c.x - c0.x) * dy) + Math.abs((c.y - c0.y) * dx);
      const inCone = across <= along * 2;
      if (cone && !inCone) continue;
      const s = along + across * 2.2;
      if ((inCone && !cone) || s < bs) { bs = s; best = el; cone = cone || inCone; }
    }
    if (best) { setFocus(best, scope, true); return; }
    // nothing that way: scroll a long panel (credits, news, settings) instead
    if (dy) { const sc = scroller(focus, scope); if (sc) sc.scrollBy(0, dy * 140); }
  }
  function scroller(el, scope) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 4) return n;
      if (n === scope) break;
    }
    return null;
  }
  function scrollWithRightStick() {
    if (!cur || !focus || !lastScope) return;
    const y = +(cur.axes && cur.axes[3]) || 0;
    if (Math.abs(y) < 0.4) return;
    const sc = scroller(focus, lastScope);
    if (sc) sc.scrollBy(0, y * 14);
  }
  function adjust(el, d) {
    if (el.tagName === 'SELECT') {
      const n = el.options.length;
      if (!n) return;
      el.selectedIndex = (el.selectedIndex + d + n) % n;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const min = +el.min || 0, max = el.max === '' ? 100 : +el.max, step = (max - min) / 10;
    el.value = Math.max(min, Math.min(max, +el.value + d * step));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const isAdjustable = el => !!el && (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'range'));
  function activate(scope) {
    const { fresh } = ensure();
    if (fresh || !focus) return;
    if (GUARDED.includes(scope.id) && performance.now() - scopeSince < 400) return;
    const el = focus;
    if (el.tagName === 'SELECT') { adjust(el, 1); return; }
    if (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range'].includes(el.type)) { el.focus(); return; }
    if (el.tagName === 'INPUT' && el.type === 'range') return;
    el.click();
  }
  function clickIf(sel) { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (el && usable(el)) { el.click(); return true; } return false; }
  const BACK = {
    'scr-settings': '#set-close', 'scr-legal': '#legal-close', 'scr-news': '#news-close', 'scr-profile': '#prof-close',
    'scr-layout': '#lay-cancel', 'scr-starters': '#starter-back', 'scr-bond': '#bond-back', 'scr-mod': '#mod-back',
    'scr-recover': '#rec-later', 'scr-nick': '#nick-later', 'scr-lobby': '#lobby-menu', 'scr-pause': '#btn-resume'
  };
  function back(scope) {
    if (listening) { stopListening(); return; }
    const id = scope.id;
    if (id === 'tap-start') { scope.click(); return; }
    if (id === 'pull-fx') { if (!clickIf('#pull-close')) { const s = $('slot'); if (s && s.onclick) s.onclick(); } return; }
    if (id === 'sound-panel') { scope.classList.add('hidden'); return; }
    if (BACK[id] && clickIf(BACK[id])) return;
    const b = [...scope.querySelectorAll('[data-back], [data-a=no], button[id$="-close"], button[id$="-back"]')].find(usable);
    if (b) b.click();
  }
  function cycleTabs(scope, d) {
    const row = [...scope.querySelectorAll('.tabs, .gen-tabs')].find(r => usable(r) && r.querySelector('.tab, .gen-tab'));
    if (!row) return false;
    const tabs = [...row.querySelectorAll('.tab, .gen-tab')].filter(usable);
    if (tabs.length < 2) return false;
    const i = Math.max(0, tabs.findIndex(t => t.classList.contains('on')));
    const t = tabs[(i + d + tabs.length) % tabs.length];
    const k = keyOf(t);
    t.click();
    // the tab row may have been rebuilt by the click
    const again = [...scope.querySelectorAll('.tab, .gen-tab')].find(x => keyOf(x) === k) || (t.isConnected ? t : null);
    if (again) setFocus(again, scope);
    return true;
  }

  /** Card choice (level-up / item / bond): prev / next walk the cards in order, wrapping (as the port's LB / RB). */
  function stepCards(scope, d) {
    const cards = [...scope.querySelectorAll('.card')].filter(usable);
    if (!cards.length) return;
    const i = cards.indexOf(focus);
    setFocus(cards[i < 0 ? 0 : (i + d + cards.length) % cards.length], scope, true);
  }

  // ---------------------------------------------------------------- routing
  function route(a, repeat) {
    if (guardRaw.size) { const t = table(); for (const i of guardRaw) if (t[i] === a) return; }
    if (listening) return;                     // the next press is being captured
    const wasPad = modeAtPoll === 'pad';
    modeAtPoll = 'pad';
    setMode('pad');
    const tap = $('tap-start');
    if (tap && shown(tap)) { if (!repeat) tap.click(); return; }
    const game = G.Game;
    if (game && game.state === 'playing' && G.Judgment && G.Judgment.cinematic) {
      if (!repeat && ['confirm', 'cancel', 'pause', 'back'].includes(a)) G.Judgment.skip();
      return;
    }
    const { scope } = ensure();
    if (!scope) { if (!repeat) gameplay(a); return; }
    if (!wasPad) return;                       // coming from keyboard / mouse: this press only shows the ring
    const dir = ['up', 'down', 'left', 'right'].includes(a);
    if (dir) {
      if ((a === 'left' || a === 'right') && isAdjustable(focus)) adjust(focus, a === 'left' ? -1 : 1);
      else move(a);
      return;
    }
    if (repeat) return;
    switch (a) {
      case 'confirm': activate(scope); break;
      case 'cancel': case 'back': back(scope); break;
      case 'prev': case 'next':
        if (GUARDED.includes(scope.id)) stepCards(scope, a === 'prev' ? -1 : 1);
        else cycleTabs(scope, a === 'prev' ? -1 : 1);
        break;
      case 'pause':
        if (scope.id === 'scr-pause') clickIf('#btn-resume');
        else if (scope.id === 'scr-settings' && game && game.state !== 'ui') clickIf('#set-close');
        break;
      case 'reroll':
        if (scope.id === 'scr-levelup') G.RunUI.reroll();
        break;
    }
  }
  function gameplay(a) {
    const game = G.Game, pl = game && game.player;
    if (!game || game.state !== 'playing' || !pl || pl.dead) return;
    if (a === 'prev') pl.cycle(-1);
    else if (a === 'next') pl.cycle(1);
    else if (a === 'pause' || a === 'back') game.togglePause();
  }

  // ---------------------------------------------------------------- the menu hint bar
  let hintEl = null, hintKey = '';
  function syncHint() {
    if (!document.body) return;
    if (!hintEl) { hintEl = document.createElement('div'); hintEl.id = 'pad-hint'; hintEl.className = 'pad-hint-bar hidden'; document.body.appendChild(hintEl); }
    const scope = lastScope;
    const on = mode === 'pad' && !!scope && scope.id !== 'tap-start';
    hintEl.classList.toggle('hidden', !on);
    if (!on) return;
    const tabs = !!scope.querySelector('.tabs:not(.hidden) .tab, .gen-tabs .gen-tab, .tabs .gen-tab');
    const k = [layout(), JSON.stringify(map()), tabs, G.I18n && G.I18n.lang].join('|');
    if (k === hintKey) return;
    hintKey = k;
    const T = s => G.T(s);
    hintEl.innerHTML = `<span>${glyphHTML('confirm', 24)} ${T('Aceptar')}</span><span>${glyphHTML('cancel', 24)} ${T('Atrás')}</span>`
      + (tabs ? `<span>${glyphHTML('prev', 24)}${glyphHTML('next', 24)} ${T('Pestañas')}</span>` : '');
  }

  // ---------------------------------------------------------------- Settings > Controls
  function settingsHTML() {
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const lay = layout(), m = map();
    const pads = readAll();
    const status = !allowed() ? '<span class="err">Inicia sesión en Magepunk para usar el mando.</span>'
      : cur ? `Mando: <span translate="no">${esc(String(cur.id || '').slice(0, 48))}</span>`
      : pads.length ? 'Pulsa cualquier botón del mando para usarlo.' : 'Conecta un mando y pulsa cualquier botón.';
    const rows = ACTIONS.map(a => {
      const on = listening && listening.action === a;
      return `<div class="set-row pad-row"><div class="grow"><b>${esc(LABELS[a])}</b></div>
        <button class="btn small pad-bind ${on ? 'gold' : ''}" data-bind="${a}">${on ? 'Pulsa un botón…' : glyphHTML(m[a], 22) + (buttonName(m[a]).length > 2 ? ' <span translate="no">' + esc(buttonName(m[a])) + '</span>' : '')}</button></div>`;
    }).join('');
    const rumbleOn = !!G.Settings.get('padRumble');
    return `<h3 class="set-h">Mando</h3><p class="sub" id="pad-status">${status}</p>
      <div class="set-row"><div class="grow"><b>Tipo de mando</b><small>Cambia los iconos de los botones y restablece la asignación.</small></div></div>
      <div class="chips set-chips" id="pad-layouts" translate="no">${LAYOUTS.map(l => `<button class="chip ${l === lay ? 'on' : ''}" data-pad-layout="${l}">${LAYOUT_NAME[l]}</button>`).join('')}</div>
      <p class="sub">Elige una acción y pulsa el botón que quieras: si otra acción lo usaba, se intercambian.</p>
      <div class="set-row pad-row"><div class="grow"><b>Moverse</b><small>Stick izquierdo o cruceta (no se cambia).</small></div><span>${glyphHTML('lstick', 22)} ${glyphHTML('dpad', 22)}</span></div>
      ${rows}
      <div class="set-row"><div class="grow"><b>Vibración</b><small>El mando vibra cuando te golpean (si lo admite).</small></div>
        <button class="btn small switch ${rumbleOn ? 'gold' : ''}" data-pad-rumble>${rumbleOn ? 'Sí' : 'No'}</button></div>
      <div class="row" style="margin-top:8px"><button class="btn small" id="pad-reset">Restablecer asignación</button></div>`;
  }
  function wireSettings(box) {
    box.querySelectorAll('[data-pad-layout]').forEach(b => { b.onclick = () => { reset(b.dataset.padLayout); rerenderSettings(); }; });
    box.querySelectorAll('[data-bind]').forEach(b => {
      b.onclick = () => { if (listening && listening.action === b.dataset.bind) stopListening(); else listen(b.dataset.bind); };
    });
    const r = box.querySelector('[data-pad-rumble]');
    if (r) r.onclick = () => { G.Settings.set('padRumble', !G.Settings.get('padRumble')); if (G.Settings.get('padRumble')) rumble(0.5, 160); rerenderSettings(); };
    const rs = box.querySelector('#pad-reset');
    if (rs) rs.onclick = () => { reset(); G.UI.toast(G.T('Asignación restablecida')); rerenderSettings(); };
  }

  // ---------------------------------------------------------------- static prompts in index.html
  // <span class="key-p" data-glyphs="dpad_lr confirm"> -> those glyphs (CSS shows them in pad mode only)
  function fillStatic(root = document) {
    root.querySelectorAll('.key-p[data-glyphs]').forEach(el => { el.innerHTML = el.dataset.glyphs.split(/\s+/).map(k => glyphHTML(k, 20)).join(''); });
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => fillStatic()); else fillStatic();

  return {
    poll, axis, rumble, glyphHTML, drawGlyph, refreshGlyphs, settingsHTML, wireSettings,
    layout, map, defaults, setBtn, reset, buttonName, ACTIONS, LAYOUTS, SIGNED_IN_ONLY,
    get mode() { return mode; }, get listening() { return listening ? listening.action : null; },
    get active() { return !!cur; }, get ready() { return !!core; }, signedIn, allowed,
    get focus() { return focus; }, topScope
  };
})();
