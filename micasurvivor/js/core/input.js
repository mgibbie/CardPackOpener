/* ============ input.js — teclado y ratón (el táctil está en touch.js) ============ */
G.Input = (() => {
  const down = new Set();
  const pressed = new Set();   // se limpia cada frame
  let mx = 0, my = 0, mdown = false;

  const MOVE_KEYS = {
    up: ['keyw', 'arrowup'], down: ['keys', 'arrowdown'],
    left: ['keya', 'arrowleft'], right: ['keyd', 'arrowright']
  };

  function code(e) { return (e.code || e.key).toLowerCase(); }

  // (controls sweep B4) typing in a field (a nickname, a friend's name, the search) never moves or presses anything
  const TEXTY = /^(text|search|email|url|number|tel|password)$/i;
  const typing = el => !!el && !!el.tagName && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && TEXTY.test(el.type || 'text')) || !!el.isContentEditable);
  addEventListener('keydown', e => {
    if (typing(e.target)) return;
    const c = code(e);
    if (!down.has(c)) pressed.add(c);
    down.add(c);
    // Evita que el navegador haga scroll con flechas/espacio durante el juego.
    // (controls sweep B4: Tab only while playing, where it swaps Pokémon in Team mode; in the menus it moves the focus again)
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'space'].includes(c) || (c === 'tab' && G.Game && G.Game.state === 'playing')) e.preventDefault();
  });
  addEventListener('keyup', e => down.delete(code(e)));
  addEventListener('blur', () => { down.clear(); });
  addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
  addEventListener('mousedown', () => mdown = true);
  addEventListener('mouseup', () => mdown = false);

  return {
    /** Vector de movimiento del jugador (teclado o joystick táctil). */
    axis() {
      const t = G.Touch && G.Touch.vector();
      if (t && (t[0] || t[1])) return t;
      // MicaSurvivor (M2): a controller's left stick / D-pad (js/core/pad.js), analog.
      const p = G.Pad && G.Pad.axis();
      if (p) return p;
      let x = 0, y = 0;
      if (MOVE_KEYS.left.some(k => down.has(k))) x -= 1;
      if (MOVE_KEYS.right.some(k => down.has(k))) x += 1;
      if (MOVE_KEYS.up.some(k => down.has(k))) y -= 1;
      if (MOVE_KEYS.down.some(k => down.has(k))) y += 1;
      return G.U.norm(x, y);
    },
    held(c) { return down.has(c); },
    /** true sólo en el frame en que se pulsó. */
    tap(c) { return pressed.has(c); },
    mouse() { return { x: mx, y: my, down: mdown }; },
    endFrame() { pressed.clear(); }
  };
})();
