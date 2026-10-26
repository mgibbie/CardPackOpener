/* ============ modes-ui.js — "Elige un modo" (MicaSurvivor M5 lote 6) ============
 * La pantalla de modos del port de Android de JayElDragon (menu.gd 1496-1675 _refresh_modes): una
 * tarjeta por modo (Partida normal, Desafío diario, Modo Fiesta, Contrarreloj de grietas,
 * Supervivencia por tipo), "Elegir Pokémon de la fiesta", "Cambiar tipo" y los 6 modificadores.
 * Se abre desde "Modos de juego" en el menú; ratón, táctil y mando (todo son botones: el foco del
 * mando los recorre, aceptar los pulsa, atrás vuelve). El Rush de Jefes y la Torre llegan en el lote 8
 * (abajo); el cooperativo local, en el lote 12a (abajo).
 *
 * M5 lote 7 (menu.gd 1640-1657 / 2158-2174): la tarjeta del Modo Equipo con "Elegir equipo (hasta 3)"
 * (con menos de 2 Pokémon, la tarjeta lo dice y no empieza). El selector enseña sólo tus Pokémon,
 * por generación; al abrirlo el equipo empieza de cero, tocar uno lo añade (o lo quita) y con 3
 * vuelve solo ("¡Equipo listo!"). Lo que no elijas se rellena (js/systems/team.js list).
 *
 * M5 lote 8 (menu.gd 1571-1572 / 1601-1625): las tarjetas del Rush de Jefes (con su récord) y de la Torre
 * de pisos (mejor piso y reliquias) en el orden del port, y "Piso inicial: N" (sólo si has desbloqueado
 * algún punto de control: cada pulsación pasa al siguiente; se guarda en save.modes.towerStart).
 *
 * M5 lote 12a (menu.gd 1584-1600 / 2109 / 2151-2156): la tarjeta del Modo Cooperativo (con el compañero que
 * llevarás) tras la de la Fiesta, como en el port, y "Elegir compañero": sólo tus Pokémon, por generación; tocar
 * uno lo elige (save.coopDex, js/systems/localcoop.js) y vuelve a la lista.
 */
G.ModesUI = (() => {
  const $ = G.UI.$;
  const GEN_NAMES = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Teselia', 'Kalos', 'Alola', 'Galar', 'Paldea'];
  let partyGen = 1, teamGen = 1, coopGen = 1;

  function init() {
    $('party-back').onclick = closeParty;
    $('team-back').onclick = closeTeam;
    $('coop-back').onclick = closeCoop;
  }

  const nameOf = dex => (G.DEX_BY[dex] || {}).name || '#' + dex;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function open() {
    G.UI.chrome(true);
    G.UI.show('scr-modes', true);
    closeParty(true);
    closeTeam(true);
    closeCoop(true);
    closeLeague(true);
    if (G.ExpTier) G.ExpTier.close(true);   // (DLC D9)
    if (G.ExpMeta) G.ExpMeta.close(true);   // (DLC D10)
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
      // M5 lote 8: Rush de Jefes (menu.gd 1571-1572)
      card('rush', M.ICON.rush, M.NAME.rush, ['Solo jefes y legendarios, uno tras otro, cada vez más fuertes. Récord: ' + G.BossRush.best(s) + ' jefes.']),
      `<div class="mode-group">${card('party', M.ICON.party, M.NAME.party, ['Cualquier Pokémon, no puedes morir y no se guarda progreso. Pokémon: ' + esc(nameOf(p.party))])}
        <button class="btn mode-sub" id="modes-party-pick">${G.Icons.html('ball', 18)} Elegir Pokémon de la fiesta</button></div>`,
      // M5 lote 12a: Modo Cooperativo (menu.gd 1584-1600)
      `<div class="mode-group">${card('coop', M.ICON.coop, M.NAME.coop, ['Un segundo Pokémon te acompaña y ataca solo. Si conectas un segundo mando, el jugador 2 lo mueve con su stick izquierdo. Comparte tus mejoras. -20% de monedas. Compañero: ' + esc(nameOf(G.LocalCoop.dex(s)))])}
        <button class="btn mode-sub" id="modes-coop-pick">${G.Icons.html('ball', 18)} Elegir compañero</button></div>`,
      // M5 lote 8: la Torre de pisos y su punto de control (menu.gd 1601-1625)
      towerCard(s),
      card('rifts', M.ICON.rifts, M.NAME.rifts, [`8 minutos: las grietas se abren sin parar. Gana todas las peleas que puedas. +25% de monedas. Récord: ${st.riftsBest || 0} grietas.`]),
      `<div class="mode-group">${card('type', 'type:' + p.type, M.NAME.type, [`Solo aparecen Pokémon de tipo ${T(p.type)} (y sus jefes). +50% de monedas.`,
        `Tipos superados: ${M.typeDoneCount(s)} / ${M.TYPES.length}`])}
        <button class="btn mode-sub" id="modes-type">${G.Icons.html('type:' + p.type, 18)} Cambiar tipo: ${T(p.type)}</button></div>`,
      // M5 lote 7: Modo Equipo (menu.gd 1640-1657)
      G.Team.unlocked(s)
        ? `<div class="mode-group">${card('team', M.ICON.team, M.NAME.team, ['Lleva hasta 3 Pokémon y cámbialos en plena partida (botón táctil de la derecha, tocando su ficha, R3 o Tab). Si uno cae, entra el siguiente; los de banca se recuperan. Equipo: ' + G.Team.list(s).map(d => esc(nameOf(d))).join(', ')])}
        <button class="btn mode-sub" id="modes-team-pick">${G.Icons.html('ball', 18)} Elegir equipo (hasta 3)</button></div>`
        : card('team', M.ICON.team, M.NAME.team, ['Necesitas al menos 2 Pokémon para formar un equipo.']),
    ].join('');
    // DLC D0b: the Expedition group (js/systems/expedition.js): "Coming soon" (reachable, not startable) until enabled
    const X = G.Expedition;
    $('modes-exp-h').textContent = X.MODES.some(X.enabled) ? 'Expedición' : 'Expedición · modos nuevos (próximamente)';
    // (DLC D4: Classic carries "League member: X", the member you start with: js/expedition/league.js)
    // (DLC D9: and "Difficulty: X · leaderboards", the tier picker and the Expedition boards: js/expedition/tiers.js)
    // (DLC D10: and "League HQ": the Lab, item unlocks, the Archive, research, tasks, achievements, the card: js/expedition/meta.js)
    const DN = { normal: 'Normal', hard: 'Difícil', nightmare: 'Pesadilla' };
    // (DLC D11: Survival is playable: its group has the same difficulty / boards button (its Survival board) and both groups a
    //  "With friends" button, an Expedition co-op lobby of that mode, map and tier)
    const friends = id => `<button class="btn mode-sub" id="modes-xcoop-${id.slice(4)}" data-xcoop="${id}">${G.Icons.html('friends', 18)} ${esc(G.I18n.f('Con amigos: {x}', G.I18n.t(X.NAME[id])))}</button>`;
    $('modes-exp').innerHTML = X.MODES.map(id => id === 'exp-classic' && X.enabled(id)
      ? `<div class="mode-group">${expCard(id)}<button class="btn mode-sub" id="modes-league-pick">${G.Icons.html('ball', 18)} Miembro de la Liga: ${esc(nameOf(X.leaguePick()))}</button>`
        + `<button class="btn mode-sub" id="modes-tier-pick">${G.Icons.html('medal3', 18)} Dificultad: ${DN[X.pick().diff] || 'Normal'} · clasificaciones</button>`
        + `<button class="btn mode-sub" id="modes-meta-pick">${G.Icons.html('star', 18)} Cuartel de la Liga: laboratorio, tareas y logros</button>${friends(id)}</div>`
      : id === 'exp-survival' && X.enabled(id)
        ? `<div class="mode-group">${expCard(id)}<button class="btn mode-sub" id="modes-surv-tier">${G.Icons.html('medal3', 18)} Dificultad: ${DN[X.pick().diff] || 'Normal'} · clasificaciones</button>${friends(id)}</div>`
        : expCard(id)).join('');
    if ($('modes-league-pick')) $('modes-league-pick').onclick = openLeague;
    if ($('modes-tier-pick')) $('modes-tier-pick').onclick = () => openTier();
    if ($('modes-surv-tier')) $('modes-surv-tier').onclick = () => openTier('survival');
    if ($('modes-meta-pick')) $('modes-meta-pick').onclick = () => openMeta();
    $('modes-exp').querySelectorAll('[data-xcoop]').forEach(b => { b.onclick = () => openExpCoop(b.dataset.xcoop); });
    $('modes-exp').querySelectorAll('[data-exp]').forEach(b => { b.onclick = () => start(b.dataset.exp); });
    $('modes-mods').innerHTML = M.MOD_IDS.map(id => {
      const on = p.mods.includes(id), m = M.MOD[id];
      return `<button class="mod-tog${on ? ' on' : ''}" data-mod="${id}" aria-pressed="${on}" data-sfx="select">
        <span class="mod-ico">${G.Icons.html(m.icon, 26)}</span><span class="mod-txt"><b>${m.name}</b><small>${m.desc}</small></span>
        <span class="mod-sw">${on ? 'Sí' : 'No'}</span></button>`;
    }).join('');
    $('modes-list').querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => start(b.dataset.mode); });
    $('modes-party-pick').onclick = openParty;
    if ($('modes-team-pick')) $('modes-team-pick').onclick = openTeam;
    $('modes-coop-pick').onclick = openCoop;
    $('modes-type').onclick = () => { M.cycleType(); render(); };
    if ($('modes-tower-start')) $('modes-tower-start').onclick = () => { G.Tower.cycleStart(); render(); };
    $('modes-mods').querySelectorAll('[data-mod]').forEach(b => { b.onclick = () => { M.toggleMod(b.dataset.mod); render(); }; });
  }

  /** DLC D0b: an Expedition mode's card; one not playable yet says "Próximamente" and is aria-disabled (the pad still
   *  reaches it: a press says so instead of starting). */
  function expCard(id) {
    const X = G.Expedition, on = X.enabled(id);
    return `<button class="mode-card${on ? '' : ' soon'}" data-exp="${id}"${on ? ' data-sfx="confirm"' : ' aria-disabled="true"'}>
      <span class="mode-ico">${G.Icons.html(X.ICON[id], 36)}</span>
      <span class="mode-txt"><b>${X.NAME[id]}</b><small><span>${X.DESC[id]}</span>${on ? '' : '<span class="soon-tag">Próximamente</span>'}</small></span></button>`;
  }

  /** La tarjeta de la Torre (+ "Piso inicial: N" con algún punto de control desbloqueado). */
  function towerCard(s) {
    const T = G.Tower, cps = T.checkpoints(s);
    const c = card('tower', G.Modes.ICON.tower, G.Modes.NAME.tower, ['30 pisos, cada uno con un jefe fijo. Cada piso da un premio la primera vez y cada 5 pisos ganas una reliquia permanente (+6 de vida y +2% de ataque dentro de la Torre). Entre pisos eliges descanso y pactos de riesgo. Mejor piso: ' + T.rec(s).best + ' · Reliquias: ' + T.relics(s) + ' / ' + T.RELICS_MAX + '.']);
    if (cps.length < 2) return c;
    return `<div class="mode-group">${c}
        <button class="btn mode-sub" id="modes-tower-start">${G.Icons.html('m_tower', 18)} Piso inicial: ${T.startFloor(s)}</button></div>`;
  }

  function start(mode) {
    // DLC D0b: an Expedition mode not playable yet: "coming soon" (G.Flow.play says the same)
    if (G.Expedition.isExp(mode) && !G.Expedition.enabled(mode)) { G.UI.toast('La Expedición llegará pronto.'); G.Audio.sfx('error'); return; }
    if (G.Expedition.hub && G.Expedition.hub(mode)) { openLeagueMode(); return; }   // (DLC D13: League mode is the League's own screen, no run)
    if (G.Social.room) { G.LobbyUI.open(); return; }   // en una sala: la partida en grupo (siempre normal)
    // M5 lote 7 (menu.gd 1657): sin 2 Pokémon el Modo Equipo no empieza
    if (mode === 'team' && !G.Team.unlocked()) { G.UI.toast('Consigue otro Pokémon primero'); G.Audio.sfx('error'); return; }
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
  /** Atrás (Esc / el botón atrás del mando) con un selector abierto: vuelve a la lista. */
  function back() {
    if (!G.UI.isOpen('scr-modes')) return false;
    if (!$('modes-team').classList.contains('hidden')) { closeTeam(); return true; }
    if (!$('modes-coop').classList.contains('hidden')) { closeCoop(); return true; }
    if (!$('modes-league').classList.contains('hidden')) { closeLeague(); return true; }
    if (G.ExpTier && G.ExpTier.back()) return true;   // (DLC D9: "Difficulty and leaderboards")
    if (G.ExpMeta && G.ExpMeta.back()) return true;   // (DLC D10: "League HQ")
    if ($('modes-party').classList.contains('hidden')) return false;
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

  // ---------------- M5 lote 7: elegir el equipo (sólo tus Pokémon; menu.gd 2158-2174) ----------------
  function openTeam() {
    G.Team.pickStart();   // (menu.gd 1652: el equipo empieza de cero)
    const mine = G.Team.owned();
    const sel = G.DEX_BY[G.DB.save.partner];
    teamGen = sel && mine.includes(sel.dex) ? sel.gen : (G.DEX_BY[mine[0]] || { gen: 1 }).gen;
    $('modes-main').classList.add('hidden');
    $('modes-team').classList.remove('hidden');
    document.querySelector('#scr-modes [data-back]').classList.add('hidden');
    G.UI.toast('Toca hasta 3 Pokémon tuyos para el equipo');
    renderTeam();
  }
  function closeTeam(quiet) {
    $('modes-team').classList.add('hidden');
    if ($('modes-party').classList.contains('hidden')) $('modes-main').classList.remove('hidden');
    document.querySelector('#scr-modes [data-back]').classList.remove('hidden');
    if (quiet !== true && G.UI.isOpen('scr-modes')) render();
  }
  function renderTeam() {
    const mine = G.Team.owned(), team = G.Team.picked();
    const gens = [...new Set(mine.map(d => G.DEX_BY[d].gen))].sort((a, b) => a - b);
    if (!gens.includes(teamGen)) teamGen = gens[0] || 1;
    $('team-count').textContent = 'Equipo: ' + team.length + ' / ' + G.Team.MAX;
    const tabs = $('team-gens');
    tabs.innerHTML = '';
    for (const g of gens) {
      const b = document.createElement('button');
      b.className = 'gen-tab' + (g === teamGen ? ' on' : '');
      b.innerHTML = `<b>${GEN_NAMES[g - 1]}</b>`;
      b.onclick = () => { teamGen = g; renderTeam(); };
      tabs.appendChild(b);
    }
    const grid = $('team-grid'), s = G.DB.save;
    grid.innerHTML = '';
    for (const d of mine.slice().sort((a, b) => a - b)) {
      const p = G.DEX_BY[d];
      if (p.gen !== teamGen) continue;
      const at = team.indexOf(d);
      const cell = document.createElement('div');
      cell.className = 'cell' + (at >= 0 ? ' on' : '');
      cell.dataset.dex = d;
      cell.insertAdjacentHTML('beforeend', `<span class="no">${String(d).padStart(3, '0')}</span>` + (at >= 0 ? `<span class="team-no">${at + 1}</span>` : ''));
      cell.appendChild(G.UI.spriteCanvas(d, 92, 80, { scale: 2, shadow: true, shiny: !!s.partnerShiny && G.DB.ownsShiny(d) }));
      cell.insertAdjacentHTML('beforeend', `<b>${p.name}</b>`);
      cell.onclick = () => {
        const tm = G.Team.toggle(d);
        G.Audio.sfx('confirm');
        if (tm.length >= G.Team.MAX) { G.UI.toast('¡Equipo listo!'); closeTeam(); return; }
        G.UI.toast('Equipo: ' + tm.length + ' / ' + G.Team.MAX);
        renderTeam();   // (the pad's focus comes back to the same cell: pad.js ensure)
      };
      grid.appendChild(cell);
    }
  }

  // ---------------- M5 lote 12a: elegir el compañero del cooperativo (sólo tus Pokémon; menu.gd 2109 / 2151-2156) ----------------
  function openCoop() {
    const mine = G.LocalCoop.owned(), cur = G.DEX_BY[G.LocalCoop.dex()];
    coopGen = cur && mine.includes(cur.dex) ? cur.gen : (G.DEX_BY[mine[0]] || { gen: 1 }).gen;
    $('modes-main').classList.add('hidden');
    $('modes-coop').classList.remove('hidden');
    document.querySelector('#scr-modes [data-back]').classList.add('hidden');
    G.UI.toast('Toca el Pokémon que será tu compañero');
    renderCoop();
  }
  function closeCoop(quiet) {
    $('modes-coop').classList.add('hidden');
    if ($('modes-party').classList.contains('hidden') && $('modes-team').classList.contains('hidden')) $('modes-main').classList.remove('hidden');
    document.querySelector('#scr-modes [data-back]').classList.remove('hidden');
    if (quiet !== true && G.UI.isOpen('scr-modes')) render();
  }
  function renderCoop() {
    const mine = G.LocalCoop.owned(), sel = G.LocalCoop.dex(), s = G.DB.save;
    const gens = [...new Set(mine.map(d => G.DEX_BY[d].gen))].sort((a, b) => a - b);
    if (!gens.includes(coopGen)) coopGen = gens[0] || 1;
    const tabs = $('coop-gens');
    tabs.innerHTML = '';
    for (const g of gens) {
      const b = document.createElement('button');
      b.className = 'gen-tab' + (g === coopGen ? ' on' : '');
      b.innerHTML = `<b>${GEN_NAMES[g - 1]}</b>`;
      b.onclick = () => { coopGen = g; renderCoop(); };
      tabs.appendChild(b);
    }
    const grid = $('coop-grid');
    grid.innerHTML = '';
    for (const d of mine) {
      const p = G.DEX_BY[d];
      if (p.gen !== coopGen) continue;
      const cell = document.createElement('div');
      cell.className = 'cell' + (d === sel ? ' on' : '');
      cell.dataset.dex = d;
      cell.insertAdjacentHTML('beforeend', `<span class="no">${String(d).padStart(3, '0')}</span>`);
      cell.appendChild(G.UI.spriteCanvas(d, 92, 80, { scale: 2, shadow: true, shiny: !!s.partnerShiny && G.DB.ownsShiny(d) }));
      cell.insertAdjacentHTML('beforeend', `<b>${p.name}</b>`);
      cell.onclick = () => {
        if (!G.LocalCoop.pick(d)) { G.Audio.sfx('error'); return; }
        G.Audio.sfx('confirm');
        G.UI.toast('Compañero: ' + p.name);
        closeCoop();
      };
      grid.appendChild(cell);
    }
  }

  // ---------------- DLC D4: "Choose your League member" (Expedition · Classic; the roster is js/expedition/league.js) ----------------
  function openLeague() {
    // (the League lives in the lazy Expedition code: load it first, like starting a run does)
    return G.Expedition.load().then(() => {
      if (!G.UI.isOpen('scr-modes')) return false;
      G.ExpLeague.select(G.ExpLeague.pickFor());
      $('modes-main').classList.add('hidden');
      $('modes-league').classList.remove('hidden');
      document.querySelector('#scr-modes [data-back]').classList.add('hidden');
      // (the mode list was scrolled down to the Expedition group: the League screen starts at its top, and the list
      // comes back where it was)
      const box = document.querySelector('#scr-modes .modes-box');
      if (box) { leagueScroll = box.scrollTop; box.scrollTop = 0; }
      renderLeague();
      return true;
    }, e => { console.warn(e); G.UI.toast('No se pudo cargar la Expedición. Recarga la página.', 4000); G.Audio.sfx('error'); return false; });
  }
  function renderLeague() {
    G.ExpLeague.renderPicker($('modes-league'), d => { G.UI.toast(G.I18n.f('Miembro de la Liga: {x}', nameOf(d))); closeLeague(); }, () => closeLeague());
  }
  let leagueScroll = 0;
  function closeLeague(quiet) {
    const was = !$('modes-league').classList.contains('hidden');
    $('modes-league').classList.add('hidden');
    if ($('modes-party').classList.contains('hidden') && $('modes-team').classList.contains('hidden') && $('modes-coop').classList.contains('hidden')) $('modes-main').classList.remove('hidden');
    document.querySelector('#scr-modes [data-back]').classList.remove('hidden');
    if (quiet !== true && G.UI.isOpen('scr-modes')) render();
    const box = document.querySelector('#scr-modes .modes-box');
    if (was && box && quiet !== true) box.scrollTop = leagueScroll;
  }

  // ---------------- DLC D9: "Difficulty and leaderboards" (Expedition · Classic; js/expedition/tiers.js) ----------------
  // (DLC D11: also Survival's, opening on its own board: view 'survival')
  function openTier(view) {
    return G.Expedition.load().then(() => (G.UI.isOpen('scr-modes') ? G.ExpTier.open(() => { if (G.UI.isOpen('scr-modes')) render(); }, view) : false),
      e => { console.warn(e); G.UI.toast('No se pudo cargar la Expedición. Recarga la página.', 4000); G.Audio.sfx('error'); return false; });
  }

  // ---------------- DLC D10: "League HQ" (Expedition; js/expedition/meta.js) ----------------
  function openMeta(tab) {
    return G.Expedition.load().then(() => G.ExpSave.open()).then(() => (G.UI.isOpen('scr-modes') ? G.ExpMeta.open(() => { if (G.UI.isOpen('scr-modes')) render(); }, tab) : false),
      e => { console.warn(e); G.UI.toast('No se pudo cargar la Expedición. Recarga la página.', 4000); G.Audio.sfx('error'); return false; });
  }

  // ---------------- DLC D13: League mode (the League's own screen: the roster, the HQ, the League board; js/expedition/meta.js) ----------------
  /** Opens League mode on the mode select (tab: 'roster' by default). -> Promise<bool> */
  function openLeagueMode(tab) {
    if (!G.UI.isOpen('scr-modes')) open();
    return G.Expedition.load().then(() => G.ExpSave.open()).then(() => (G.UI.isOpen('scr-modes') ? G.ExpMeta.open(() => { if (G.UI.isOpen('scr-modes')) render(); }, tab || 'roster', { league: true }) : false),
      e => { console.warn(e); G.UI.toast('No se pudo cargar la Expedición. Recarga la página.', 4000); G.Audio.sfx('error'); return false; });
  }

  // ---------------- DLC D11: the Expedition with friends (an Expedition co-op lobby: js/mica/social.js createRoom) ----------------
  /** An Expedition lobby of mode `mode` on your map + tier pick, opened for you to invite your friends. -> Promise<bool> */
  function openExpCoop(mode) {
    const X = G.Expedition, A = G.MicaAccount;
    if (!X.enabled(mode)) { G.UI.toast('La Expedición llegará pronto.'); G.Audio.sfx('error'); return Promise.resolve(false); }
    if (!A || !A.name()) { G.UI.toast('Inicia sesión para jugar con amigos'); G.Audio.sfx('error'); return Promise.resolve(false); }
    const R = G.Social.room;
    if (R) {
      if (R.mode === mode) { G.LobbyUI.open(); return Promise.resolve(true); }
      G.UI.toast('Sal de tu sala antes de crear otra.'); G.Audio.sfx('error'); return Promise.resolve(false);
    }
    return X.load().then(async () => {
      const at = X.pick(), room = await G.Social.createRoom({ mode, map: at.map, diff: at.diff });
      if (!room) { G.UI.toast('No se pudo crear la sala.'); G.Audio.sfx('error'); return false; }
      G.LobbyUI.open();
      return true;
    }, e => { console.warn(e); G.UI.toast('No se pudo cargar la Expedición. Recarga la página.', 4000); G.Audio.sfx('error'); return false; });
  }

  return { init, open, render, back, openParty, closeParty, openTeam, closeTeam, openCoop, closeCoop, openLeague, closeLeague, openTier, openMeta, openExpCoop, openLeagueMode };
})();
