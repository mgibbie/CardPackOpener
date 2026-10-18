/* ============ tower-ui.js — descanso y cartas de riesgo de la Torre (MicaSurvivor M5 lote 8) ============
 * Las dos pantallas entre pisos del port de Android (main.gd 3485-3532, con las cartas de subir de
 * nivel): "Elige cómo descansar" (Descanso / Entrenamiento / Escudo) y "Un pacto: gran poder, a cambio
 * de un coste" (3 pactos, quizá una legendaria dorada, y "Sin riesgos"). Ratón, táctil, teclas 1-4 y
 * mando: el foco recorre las cartas (cruceta, LB / RB), aceptar elige y atrás es "Sin riesgos" en los
 * pactos (js/core/pad.js). La partida está parada mientras eliges (G.Game.choiceStart / choiceEnd).
 */
G.TowerUI = (() => {
  const $ = G.UI.$;
  let list = null, cb = null, kind = '';

  /**
   * @param k      'rest' | 'risk'
   * @param cards  [{ id, title, desc, icon, tag, color, legend? }]
   * @param onPick recibe el id elegido
   */
  function show(k, title, sub, cards, onPick) {
    kind = k; list = cards; cb = onPick;
    $('tower-title').textContent = title;
    $('tower-sub').textContent = sub;
    $('tower-keys').innerHTML = cards.map((_, i) => `<kbd>${i + 1}</kbd>`).join(' ');
    const box = $('tower-cards');
    box.innerHTML = '';
    box.className = 'cards tower-cards ' + k;
    cards.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'card' + (c.legend ? ' legend' : '') + (c.id === 'skip' ? ' skip' : '');
      if (c.id === 'skip') el.id = 'tower-skip';
      el.dataset.id = c.id;
      el.innerHTML =
        `<div class="ico" style="background:${c.color}33">${G.Icons.html(c.icon, 32)}</div>
         <div class="txt"><div class="nm">${c.title} <span class="tag-chip" style="background:${c.color}">${c.tag}</span></div><div class="ds">${c.desc}</div></div>
         <div class="key"><span class="key-k">${i + 1}</span>${G.Pad.glyphHTML('confirm', 22)}</div>`;
      el.dataset.sfx = 'none';
      el.onclick = () => pick(i);
      box.appendChild(el);
    });
    G.UI.show('scr-tower');
  }

  function pick(i) {
    if (!list || !list[i]) return false;
    const c = list[i], f = cb;
    list = null; cb = null;
    G.UI.hide('scr-tower');
    f(c.id);
    return true;
  }

  function hide() { list = null; cb = null; G.UI.hide('scr-tower'); }

  return { show, pick, hide, get open() { return !!list; }, get kind() { return kind; }, get cards() { return list ? list.slice() : []; } };
})();
