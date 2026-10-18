/* ============ display.js — campo de visión, tamaño de la interfaz y minimapa (MicaSurvivor M5 lote 10) ============
 * Del port de Android de JayElDragon (MIT, github.com/JayElDragon/poke-survivor):
 *   - Campo de visión ("Visión", pause_ui.gd 178-216, main.gd 335 / 3176-3180, save_data.gd 87 / 126-129):
 *     100-200 %, de 5 en 5, 165 % por defecto. Es el zoom de la cámara: 100 % se ve más mundo, 200 % se ve
 *     de más cerca. Se aplica al instante. En el port el zoom no cambia con el Dynamax ni en la arena de la
 *     grieta / la Torre (la cámara sólo sigue al jugador), y aquí tampoco.
 *     El 165 % del port es la vista que la web ya tenía (768 px de mundo a lo ancho, 420 de alto como mínimo);
 *     los demás valores la escalan igual que el zoom del port: ancho visible = 768 × 165 / visión.
 *     En pantallas pequeñas (el lado corto por debajo de 500 px: un móvil) la visión no baja de 130 %, para
 *     que los Pokémon no queden diminutos (desviación: el port deja el 100 % también en el móvil).
 *   - Tamaño de pantalla (display.gd, menu.gd 3965-4001, save_data.gd 87 "view"): 60-140 %, de 5 en 5, 100 %
 *     por defecto, con "Restablecer" y la línea "Pantalla (px) → vista del juego". En el port escala todo el
 *     lienzo; aquí escala la interfaz: el HUD del lienzo y los menús (HTML) por igual. Para que nada se salga,
 *     el tamaño efectivo no pasa de lo que cabe: la vista virtual (pantalla / escala) se queda en el mismo tramo
 *     de alto de style.css (781 / 661 / 521 / 401 px; 360 en un móvil en horizontal) y de ancho (761, o 640),
 *     así que a 1280×720 llega al 109 % y a 1920×1080 al 138 %; nunca por debajo del 100 %. Con pantalla táctil no baja del
 *     85 % (los botones siguen siendo fáciles de tocar; además las zonas táctiles del HUD nunca son más pequeñas
 *     que al 100 %).
 *   - Minimapa (main.gd 546-549 / 7798-8120, js/ui/minimap.js). El port no tiene interruptor; aquí se puede
 *     apagar en Ajustes (encendido por defecto).
 * Son ajustes de pantalla de este aparato: se guardan con los demás en el navegador (G.Settings), no en la
 * cuenta (el port también los guarda en su archivo local; cada móvil / PC tiene los suyos).
 *
 *   G.Display.zoom(w, h)   zoom efectivo de la cámara (1..2)
 *   G.Display.ui(w, h)     escala efectiva de la interfaz
 */
G.Display = (() => {
  const FOV = { min: 100, max: 200, step: 5, def: 165, phoneMin: 130, phoneSide: 500 };
  // fitH / fitW: the floors of style.css's height / width brackets (max-height 400 / 520 / 660 / 780, max-width 760)
  const UI = { min: 60, max: 140, step: 5, def: 100, touchMin: 85, fitH: [781, 661, 521, 401], fitHSmall: 360, fitW: 761, fitWSmall: 640 };
  const VIEW = { w: 768, h: 420 };   // la vista de la web, que es la del port al 165 %
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const get = k => (G.Settings ? G.Settings.get(k) : undefined);
  const snap = (v, o) => clamp(Math.round((v - o.min) / o.step) * o.step + o.min, o.min, o.max);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const scrW = () => (typeof innerWidth === 'number' ? innerWidth : 1280);
  const scrH = () => (typeof innerHeight === 'number' ? innerHeight : 720);
  const touchy = () => !!((G.Touch && G.Touch.active) || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches));

  // ---------------- campo de visión ----------------
  /** Lo elegido (100-200). */
  const fov = () => snap(num(get('fov'), FOV.def), FOV);
  const small = (w, h) => Math.min(w, h) < FOV.phoneSide;
  /** El mínimo en esta pantalla (130 en un móvil). */
  const fovMin = (w = scrW(), h = scrH()) => (small(w, h) ? FOV.phoneMin : FOV.min);
  /** Lo que se aplica de verdad. */
  const fovEff = (w = scrW(), h = scrH()) => Math.max(fovMin(w, h), fov());
  const zoom = (w, h) => fovEff(w, h) / 100;
  /** Ancho / alto mínimo de mundo visibles (camera.js). */
  const viewW = (w, h) => VIEW.w * FOV.def / fovEff(w, h);
  const viewH = (w, h) => VIEW.h * FOV.def / fovEff(w, h);

  // ---------------- tamaño de la interfaz ----------------
  const uiSet = () => snap(num(get('uiScale'), UI.def), UI);
  /** Lo más grande que cabe aquí (nunca menos de 1). */
  function uiMax(w = scrW(), h = scrH()) {
    const fh = UI.fitH.find(f => h >= f) || UI.fitHSmall;
    return Math.max(1, Math.min(h / fh, w / (w >= UI.fitW ? UI.fitW : UI.fitWSmall)));
  }
  const uiMin = () => (touchy() ? UI.touchMin : UI.min) / 100;
  /** La escala efectiva (HUD y menús). */
  const ui = (w = scrW(), h = scrH()) => clamp(uiSet() / 100, uiMin(), uiMax(w, h));

  const minimapOn = () => get('minimap') !== false;

  // ---------------- aplicar ----------------
  let lastK = 0;
  /** Los menús (HTML): style.css escala las capas con --ui (sólo si no es 100 %). */
  function applyDom() {
    if (typeof document === 'undefined' || !document.documentElement || !document.documentElement.style) return;
    const k = ui(), root = document.documentElement;
    if (k === lastK) return;
    lastK = k;
    root.style.setProperty('--ui', String(k));
    root.classList.toggle('ui-scaled', Math.abs(k - 1) > 1e-3);
  }
  function apply() {
    if (G.Camera && G.Camera.refit) G.Camera.refit();
    applyDom();
  }
  function init() {
    if (G.Settings) G.Settings.on(k => { if (k === 'fov' || k === 'uiScale') { apply(); sync(); } });
    if (typeof addEventListener === 'function') addEventListener('resize', () => { lastK = 0; applyDom(); });
    apply();
  }
  /** Los dos deslizadores del campo de visión (Ajustes y Pausa) enseñan siempre el valor actual. */
  function sync() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    for (const pre of ['set', 'pause']) {
      const f = document.getElementById(pre + '-fov');
      if (!f) continue;
      if (+f.value !== fov()) f.value = fov();
      const l = document.getElementById(pre + '-fov-val'); if (l) l.textContent = fov() + '%';
      const n = document.getElementById(pre + '-fov-note'); if (n) n.textContent = fovNote();
    }
  }
  function setFov(v) { G.Settings.set('fov', snap(+v, FOV)); }
  function setUi(v) { G.Settings.set('uiScale', snap(+v, UI)); }
  function setMinimap(on) { G.Settings.set('minimap', !!on); }

  // ---------------- filas de Ajustes / Pausa ----------------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function fovNote() { const m = fovMin(); return fov() < m ? G.T('En pantallas pequeñas, como mínimo {x}%').replace('{x}', m) : ''; }
  function uiInfo() {
    const k = ui(), w = scrW(), h = scrH();
    return G.T('Pantalla (px) → vista del juego: ') + w + '×' + h + '  →  ' + Math.round(w / k) + '×' + Math.round(h / k);
  }
  function slider(id, o, v) {
    return `<input type="range" id="${id}" min="${o.min}" max="${o.max}" step="${o.step}" data-pad-step="${o.step}" value="${v}">`
      + `<span class="range-val" id="${id}-val" translate="no">${v}%</span>`;
  }
  /** La fila del campo de visión (también en la pausa, como en el port). */
  function fovRow(prefix = 'set') {
    return `<div class="set-row set-range" id="${prefix}-fov-row"><div class="grow"><b>Campo de visión</b>`
      + `<small>${esc('Acerca o aleja la cámara: con menos se ve más mundo, con más se ve de más cerca.')}</small>`
      + `<div class="range-line">${slider(prefix + '-fov', FOV, fov())}</div><small class="range-note" id="${prefix}-fov-note">${esc(fovNote())}</small></div></div>`;
  }
  function settingsHTML() {
    const on = minimapOn();
    return fovRow('set')
      + `<div class="set-row set-range" id="set-ui-row"><div class="grow"><b>Tamaño de la interfaz</b>`
      + `<small>${esc('El tamaño del HUD, los menús y los botones.')}</small>`
      + `<div class="range-line">${slider('set-ui', UI, uiSet())}<button class="btn small ghost" id="set-ui-reset">Restablecer</button></div>`
      + `<small class="range-note" id="set-ui-info" translate="no">${esc(uiInfo())}</small></div></div>`
      + `<div class="set-row" id="set-minimap-row"><div class="grow"><b>Minimapa</b><small>${esc('El mapa redondo de la izquierda: el terreno que has explorado, los enemigos cercanos, los cofres y altares, los jefes y la grieta.')}</small></div>`
      + `<button class="btn small switch ${on ? 'gold' : ''}" id="set-minimap">${on ? 'Sí' : 'No'}</button></div>`;
  }
  /** Conecta las filas que haya en `box` (Ajustes o Pausa); onToggle redibuja tras el interruptor. */
  function wire(box, onToggle) {
    const $ = s => box.querySelector(s);
    for (const pre of ['set', 'pause']) {
      const f = $('#' + pre + '-fov');
      if (!f) continue;
      f.oninput = () => { setFov(f.value); $('#' + pre + '-fov-val').textContent = fov() + '%'; $('#' + pre + '-fov-note').textContent = fovNote(); };
      f.onchange = () => { if (G.Audio) G.Audio.sfx('click'); };
    }
    const u = $('#set-ui');
    if (u) {
      const show = () => { $('#set-ui-val').textContent = u.value + '%'; };
      // El valor se ve al arrastrar; la escala se aplica al soltar (si no, el propio control se movería bajo el dedo).
      u.oninput = show;
      u.onchange = () => { setUi(u.value); show(); $('#set-ui-info').textContent = uiInfo(); if (G.Audio) G.Audio.sfx('click'); };
      const r = $('#set-ui-reset');
      if (r) r.onclick = () => { u.value = UI.def; u.onchange(); };
    }
    const m = $('#set-minimap');
    if (m) m.onclick = () => { setMinimap(!minimapOn()); if (onToggle) onToggle(); };
  }

  return {
    FOV, UI, VIEW, fov, fovMin, fovEff, zoom, viewW, viewH, uiSet, uiMax, uiMin, ui, minimapOn,
    init, apply, applyDom, setFov, setUi, setMinimap, settingsHTML, fovRow, wire, uiInfo
  };
})();
