/* ============ modes-ui.js — "Elige un modo" (MicaSurvivor M5 lote 6) ============
 * La pantalla de modos del port de Android de JayElDragon (menu.gd 1496-1675 _refresh_modes): una
 * tarjeta por modo (Partida normal, Desafío diario, Modo Fiesta, Contrarreloj de grietas,
 * Supervivencia por tipo), "Elegir Pokémon de la fiesta", "Cambiar tipo" y los 6 modificadores.
 * Se abre desde "Modos de juego" en el menú; ratón, táctil y mando (todo son botones: el foco del
 * mando los recorre, aceptar los pulsa, atrás vuelve). Los modos de lotes posteriores (Rush de
 * Jefes, Torre, Equipo, cooperativo local) se añadirán aquí con sus lotes.
 */
G.ModesUI = (() => {
  const $ = G.UI.$;
  const GEN_NAMES = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Teselia', 'Kalos', 'Alola', 'Galar', 'Paldea'];
  let partyGen = 1;

  function init() {
    $('party-back').onclick = closeParty;
  }

  const nameOf = dex => (G.DEX_BY[dex] || {}).name || '#' + dex;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function open() {
    G.UI.chrome(true);
    G.UI.show('scr-modes', true);
    closeParty(true);
    render();
  }

  /** Una tarjeta de modo: icono, título y frases (cada una en su <span> para que se traduzca sola). */
  function card(mode, icon, title, lines) {
    return `<button class="mode-card" data-mode="${mode}" data-sfx="confirm">
      <span class="mode-ico">${G.Icons.html(icon, 36)}</span>
      <span class="mode-txt"><b>${title}</b><small>${lines.filter(Boolean).map(l => `<span>${l}</span>`).join(' ')}</small></span></button>`;
  }

  function render() {
    const s = G.DB.save, M = G.Modes, p = M.prefs(s), st = s.stats || {};
    const sd = M.dailySeed(), best = M.dailyBest(s, sd);
    const T = t => G.U.TYPE_NAME[t];
    $('modes-list').innerHTML = [
      card('normal', M.ICON.normal, M.NAME.normal, ['La experiencia de siempre, igual que el juego original.']),
      card('daily', M.ICON.daily, M.NAME.daily, [
        `Hoy: ${esc(nameOf(M.dailyDex(sd)))} con la regla «${M.MOD[M.dailyMod(sd)].name}» (misma para todos). +25% de monedas.`,
        best > 0 ? 'Tu mejor tiempo de hoy: ' + G.U.mmss(best) : 'Aún no lo has jugado hoy.']),
      `<div class="mode-group">${card('party', M.ICON.party, M.NAME.party, ['Cualquier Pokémon, no puedes morir y no se guarda progreso. Pokémon: ' + esc(nameOf(p.party))])}
        <button class="btn mode-sub" id="modes-party-pick">${G.Icons.html('ball', 18)} Elegir Pokémon de la fiesta</button></div>`,
      card('rifts', M.ICON.rifts, M.NAME.rifts, [`8 minutos: las grietas se abren sin parar. Gana todas las peleas que puedas. +25% de monedas. Récord: ${st.riftsBest || 0} grietas.`]),
      `<div class="mode-group">${card('type', 'type:' + p.type, M.NAME.type, [`Solo aparecen Pokémon de tipo ${T(p.type)} (y sus jefes). +50% de monedas.`,
        `Tipos superados: ${M.typeDoneCount(s)} / ${M.TYPES.length}`])}
        <button class="btn mode-sub" id="modes-type">${G.Icons.html('type:' + p.type, 18)} Cambiar tipo: ${T(p.type)}</button></div>`,
    ].join('');
    $('modes-mods').innerHTML = M.MOD_IDS.map(id => {
      const on = p.mods.includes(id), m = M.MOD[id];
      return `<button class="mod-tog${on ? ' on' : ''}" data-mod="${id}" aria-pressed="${on}" data-sfx="select">
        <span class="mod-ico">${G.Icons.html(m.icon, 26)}</span><span class="mod-txt"><b>${m.name}</b><small>${m.desc}</small></span>
        <span class="mod-sw">${on ? 'Sí' : 'No'}</span></button>`;
    }).join('');
    $('modes-list').querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => start(b.dataset.mode); });
    $('modes-party-pick').onclick = openParty;
    $('modes-type').onclick = () => { M.cycleType(); render(); };
    $('modes-mods').querySelectorAll('[data-mod]').forEach(b => { b.onclick = () => { M.toggleMod(b.dataset.mod); render(); }; });
  }

  function start(mode) {
    if (G.Social.room) { G.LobbyUI.open(); return; }   // en una sala: la partida en grupo (siempre normal)
    G.Flow.play(mode);
  }

  // ---------------- Pokémon de la fiesta (cualquiera, también los que no tienes) ----------------
  function openParty() {
    const cur = G.DEX_BY[G.Modes.prefs().party];
    if (cur) partyGen = cur.gen;
    $('modes-main').classList.add('hidden');
    $('modes-party').classList.remove('hidden');
    document.querySelector('#scr-modes [data-back]').classList.add('hidden');   // (one way back: "Back" of the picker)
    renderParty();
  }
  function closeParty(quiet) {
    $('modes-party').classList.add('hidden');
    $('modes-main').classList.remove('hidden');
    document.querySelector('#scr-modes [data-back]').classList.remove('hidden');
    if (quiet !== true && G.UI.isOpen('scr-modes')) render();
  }
  /** Atrás (Esc / el botón atrás del mando) con el selector abierto: vuelve a la lista. */
  function back() {
    if (!G.UI.isOpen('scr-modes') || $('modes-party').classList.contains('hidden')) return false;
    closeParty();
    return true;
  }
  function renderParty() {
    const tabs = $('party-gens');
    tabs.innerHTML = '';
    GEN_NAMES.forEach((name, i) => {
      const b = document.createElement('button');
      b.className = 'gen-tab' + (i + 1 === partyGen ? ' on' : '');
      b.innerHTML = `<b>${name}</b>`;
      b.onclick = () => { partyGen = i + 1; renderParty(); };
      tabs.appendChild(b);
    });
    const grid = $('party-grid'), sel = G.Modes.prefs().party;
    grid.innerHTML = '';
    for (const p of G.DEX) {
      if (p.gen !== partyGen || !G.SPRITE_META[p.dex]) continue;
      const cell = document.createElement('div');
      cell.className = 'cell' + (p.dex === sel ? ' on' : '');
      cell.dataset.dex = p.dex;
      cell.insertAdjacentHTML('beforeend', `<span class="no">${String(p.dex).padStart(3, '0')}</span>`);
      cell.appendChild(G.UI.spriteCanvas(p.dex, 92, 80, { scale: 2, shadow: true }));
      cell.insertAdjacentHTML('beforeend', `<b>${p.name}</b>`);
      cell.onclick = () => {
        G.Modes.setParty(p.dex);
        G.Audio.sfx('confirm');
        closeParty();
      };
      grid.appendChild(cell);
    }
  }

  return { init, open, render, back, openParty, closeParty };
})();
