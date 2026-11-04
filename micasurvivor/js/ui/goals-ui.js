/* ============ goals-ui.js — misiones, logros y perfil ============
 * Una pantalla con tres pestañas:
 *   Misiones  3 diarias + 2 semanales, con barra, premio y botón de recoger
 *   Logros    medallas por categoría; los legendarios, uno a uno con su sprite
 *   Perfil    tus 3 favoritos y tu título; vista previa del perfil público
 *   Cristales Z  las 18 misiones de Cristal Z (MicaSurvivor M5 lote 4, menu.gd _goals_zcrystals) y la
 *                ficha del Dynamax (M5 lote 5: desbloqueado o "vence una guarida", guaridas vencidas)
 *   Títulos   (M5 lote 11, menu.gd _goals_titles 3772-3806) todos los títulos: el que llevas, "Sin título" y,
 *             por cada uno, su logro y Usar / En uso / Bloqueado
 * la ventana del perfil público de cualquier jugador (G.ProfileUI.show) y la tarjeta de entrenador
 * (G.TrainerCard, M5 lote 11: menu.gd _show_card 3681-3740).
 */
(() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = t => (t >= 3600 ? Math.floor(t / 3600) + ':' + G.U.mmss(t % 3600).padStart(5, '0') : G.U.mmss(t));

  // ======================= PANTALLA =======================

  G.GoalsUI = (() => {
    let tab = 'missions', cat = 'coleccion';

    function init() {
      document.querySelectorAll('#goals-tabs .tab').forEach(t => {
        t.onclick = () => { tab = t.dataset.tab; render(); };
      });
    }

    function open(t) {
      if (t) tab = t;
      G.UI.show('scr-goals', true);
      G.Progress.ensure(G.DB.save);
      G.Progress.checkAch();
      render();
    }

    function render() {
      document.querySelectorAll('#goals-tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
      const box = $('goals-body');
      box.innerHTML = '';
      if (tab === 'missions') missions(box);
      else if (tab === 'ach') achievements(box);
      else if (tab === 'zcr') zcrystals(box);
      else if (tab === 'titles') titlesTab(box);
      else profile(box);
    }

    // ---------------- misiones ----------------

    function untilText(kind) {
      const now = new Date();
      // Medianoche (diarias) o lunes (semanales), hora de España aproximada por la del navegador.
      const end = new Date(now);
      end.setHours(24, 0, 0, 0);
      if (kind === 'w') { const add = (8 - (now.getDay() || 7)) % 7; end.setDate(end.getDate() + add); }
      const mins = Math.max(1, Math.round((end - now) / 60000));
      return mins >= 1440 ? Math.floor(mins / 1440) + ' d ' + Math.floor(mins % 1440 / 60) + ' h'
                          : Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min';
    }

    function missions(box) {
      const M = G.DB.save.missions;
      const section = (title, list, weekly) => {
        box.insertAdjacentHTML('beforeend', `<div class="row between goals-h"><h3>${title}</h3>
          <span class="sub">Se renuevan en ${untilText(weekly ? 'w' : 'd')}</span></div>`);
        list.forEach((m, i) => {
          const d = G.MissionDefs.BY[m.id];
          const done = G.Progress.done(m);
          const el = document.createElement('div');
          el.className = 'mission' + (m.claimed ? ' claimed' : done ? ' ready' : '');
          const pct = Math.min(100, m.prog / m.goal * 100);
          el.innerHTML = `
            <div class="m-txt"><b>${esc(G.Progress.text(m))}</b>
              <div class="bar"><i style="width:${pct}%"></i></div>
              <small>${Math.min(m.prog, m.goal).toLocaleString('es')} / ${m.goal.toLocaleString('es')}</small></div>
            <div class="m-rw">${G.Progress.rewardText(d.reward)}</div>`;
          const btn = document.createElement('button');
          if (m.claimed) { btn.className = 'btn small'; btn.disabled = true; btn.textContent = 'Recogido'; }
          else if (done) {
            btn.className = 'btn small gold'; btn.textContent = 'Recoger'; btn.dataset.sfx = 'none';
            btn.onclick = () => { if (G.Progress.claim(m, weekly)) { G.Audio.sfx('buy'); G.UI.toast('¡Premio recogido!'); render(); } };
          } else if (!weekly && !M.rerolled) {
            btn.className = 'btn small ghost'; btn.textContent = 'Cambiar';
            btn.title = 'Cambia esta misión por otra (una vez al día)';
            btn.onclick = () => { if (G.Progress.reroll(i)) render(); };
          } else { btn.className = 'btn small ghost'; btn.disabled = true; btn.textContent = 'En curso'; }
          el.appendChild(btn);
          box.appendChild(el);
        });
      };
      section('Diarias', M.daily, false);
      section('Semanales', M.weekly, true);
    }

    // ---------------- logros ----------------

    function achievements(box) {
      const s = G.DB.save;
      const all = G.AchDefs.LIST;
      const got = all.filter(a => s.ach && s.ach[a.id]).length;
      const chips = document.createElement('div');
      chips.className = 'filters';
      for (const [k, label] of G.AchDefs.CATS) {
        const list = all.filter(a => a.cat === k);
        const n = list.filter(a => s.ach && s.ach[a.id]).length;
        const b = document.createElement('button');
        b.className = 'chip' + (k === cat ? ' on' : '');
        b.textContent = `${label} ${n}/${list.length}`;
        b.onclick = () => { cat = k; render(); };
        chips.appendChild(b);
      }
      box.insertAdjacentHTML('beforeend', `<p class="sub">${got} de ${all.length} logros · títulos: ${G.Progress.titles().length}</p>`);
      box.appendChild(chips);

      const list = all.filter(a => a.cat === cat && !a.dex);
      const grid = document.createElement('div');
      grid.className = 'ach-grid';
      for (const a of list) grid.appendChild(achCard(a, s));
      box.appendChild(grid);

      // Legendarios: uno a uno, con su sprite (en sombra si aún no le has vencido).
      if (cat === 'legendarios') {
        const legs = all.filter(a => a.dex);
        const beaten = legs.filter(a => s.legends && s.legends[a.dex]).length;
        box.insertAdjacentHTML('beforeend', `<h3 style="margin:14px 0 6px">Legendarios vencidos ${beaten} / ${legs.length}</h3>`);
        const lg = document.createElement('div');
        lg.className = 'leg-grid';
        for (const a of legs) {
          const ok = !!(s.legends && s.legends[a.dex]);
          const c = document.createElement('div');
          c.className = 'leg-cell' + (ok ? ' ok' : '');
          c.title = a.name + (ok ? ' · ¡vencido!' : '');
          c.appendChild(G.UI.spriteCanvas(a.dex, 64, 56, { scale: 1, silhouette: !ok, shadow: ok }));
          c.insertAdjacentHTML('beforeend', `<small>${ok ? esc(G.DEX_BY[a.dex].name) : '???'}</small>`);
          lg.appendChild(c);
        }
        box.appendChild(lg);
      }
    }

    function achCard(a, s) {
      const ok = !!(s.ach && s.ach[a.id]);
      const v = Math.min(a.goal, a.value(s));
      const el = document.createElement('div');
      el.className = 'ach' + (ok ? ' ok' : '');
      el.innerHTML = `${G.Icons.html(ok ? 'medal' + a.tier : 'medalOff', 36)}
        <div class="a-txt"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>
          ${ok ? '' : `<div class="bar"><i style="width:${v / a.goal * 100}%"></i></div>`}
          <div class="a-rw">${ok ? '¡Conseguido!' : v.toLocaleString('es') + ' / ' + a.goal.toLocaleString('es')} · ${G.Progress.rewardText(a.reward)}
          ${a.title ? ` · <span class="gold">Título: ${esc(a.title)}</span>` : ''}</div></div>`;
      return el;
    }

    // ---------------- Cristales Z (MicaSurvivor M5 lote 4) ----------------

    function zcrystals(box) {
      const s = G.DB.save, Z = G.ZMoves;
      const nd = Z.ZMIS.filter(zm => Z.zdone(zm, s)).length;
      box.insertAdjacentHTML('beforeend', `<p class="sub">Cristales Z: ${nd} / ${Z.ZMIS.length}</p>
        <p class="sub">Cumple la misión de un tipo para desbloquear su movimiento Z. También se desbloquea derrotando a 250 Pokémon de ese tipo o con un cristal del gacha.</p>`);
      // MicaSurvivor (M5 lote 5, menu.gd 3167-3171, la ficha "Z y Dynamax"): el Dynamax y sus guaridas.
      const D = G.Dynamax;
      if (D) {
        const dn = (s.stats && s.stats.dens) || 0, dok = D.unlocked(s);
        const dg = document.createElement('div');
        dg.className = 'ach-grid dyn-card';
        dg.innerHTML = `<div class="ach dyn${dok ? ' ok' : ''}" data-dyn="1"><span class="dyn-ic${dok ? '' : ' off'}">MAX</span>
          <div class="a-txt"><b>Dynamax</b><small>Cada 4 minutos (desde el nivel ${D.MIN_LEVEL}): tu Pokémon se vuelve gigante ${D.DUR} s con +30% a todos sus atributos y lanza ondas Max de su tipo. Cada guarida Dynamax vencida lo recarga al instante.</small>
            <div class="a-rw">${dok ? 'Desbloqueado' : `Vence una guarida Dynamax: ${Math.min(dn, 1)}/1`}</div>
            <small>Guaridas Dynamax vencidas: ${dn}</small></div></div>`;
        box.appendChild(dg);
      }
      const grid = document.createElement('div');
      grid.className = 'ach-grid zc-missions';
      for (const zm of Z.ZMIS) {
        const done = Z.zdone(zm, s), un = Z.unlocked(zm.type, s);
        const v = Math.min(zm.goal, Z.stat(zm.stat, s));
        const kills = (s.stats && s.stats['tk_' + zm.type]) || 0;
        const el = document.createElement('div');
        el.className = 'ach zc' + (done ? ' ok' : '') + (un ? ' unlocked' : '');
        el.dataset.zc = zm.type;
        el.innerHTML = `<span class="zc-ic${done || un ? '' : ' off'}">${G.Icons.html('zc:' + zm.type, 48)}</span>
          <div class="a-txt"><b>${esc(Z.DEF[zm.type].name)}</b><small>${esc(zm.desc)}</small>
            ${done ? '' : `<div class="bar"><i style="width:${v / zm.goal * 100}%"></i></div>`}
            <div class="a-rw">${done ? '¡Conseguido!' : v.toLocaleString('es') + ' / ' + zm.goal.toLocaleString('es')} · ${G.Progress.rewardText({ coins: Z.ZMIS_COINS })}</div>
            <small>${un ? 'Movimiento Z desbloqueado' : `Derrotados de tipo ${G.U.TYPE_NAME[zm.type]}: ${Math.min(kills, Z.NEED)} / ${Z.NEED}`}</small></div>`;
        grid.appendChild(el);
      }
      box.appendChild(grid);
    }

    // ---------------- títulos (MicaSurvivor M5 lote 11, menu.gd _goals_titles) ----------------

    function titlesTab(box) {
      const s = G.DB.save, cur = (s.profile && s.profile.title) || '';
      const all = G.Progress.titleList(s);
      box.insertAdjacentHTML('beforeend', `<h3 class="title-cur">Título en uso: <span class="gold">${cur ? esc(cur) : 'ninguno'}</span></h3>
        <p class="sub">Títulos: ${all.filter(t => t.done).length} / ${all.length} · Se ven en tu perfil, en tu tarjeta de entrenador y en el menú.</p>`);
      const none = document.createElement('button');
      none.className = 'btn small' + (cur ? '' : ' gold');
      none.id = 'title-none';
      none.textContent = 'Sin título';
      none.disabled = !cur;
      none.onclick = () => { if (G.Progress.setTitle('')) { G.Audio.sfx('confirm'); render(); } };
      box.appendChild(none);
      const grid = document.createElement('div');
      grid.className = 'title-list';
      for (const t of all) {
        const el = document.createElement('div');
        el.className = 'title-row' + (t.done ? ' ok' : '') + (t.title === cur ? ' on' : '');
        el.dataset.title = t.title;
        el.innerHTML = `${G.Icons.html(t.done ? 'medal' + t.ach.tier : 'medalOff', 32)}
          <div class="a-txt"><b class="${t.done ? 'gold' : ''}">${esc(t.title)}</b><small>Logro: ${esc(t.ach.name)}</small></div>`;
        const b = document.createElement('button');
        b.className = 'btn small' + (t.done && t.title !== cur ? ' gold' : '');
        if (!t.done) { b.textContent = 'Bloqueado'; b.disabled = true; }
        else if (t.title === cur) { b.textContent = 'En uso'; b.disabled = true; }
        else { b.textContent = 'Usar'; b.onclick = () => { if (G.Progress.setTitle(t.title)) { G.Audio.sfx('confirm'); render(); } }; }
        el.appendChild(b);
        grid.appendChild(el);
      }
      box.appendChild(grid);
    }

    // ---------------- perfil (editar) ----------------

    function profile(box) {
      const s = G.DB.save;
      s.profile = s.profile || { favs: [], title: '' };
      const P = s.profile;
      box.insertAdjacentHTML('beforeend', `<p class="sub">${G.DB.online ? 'Así te ven los demás jugadores (desde el ranking y la lista de amigos).'
        : 'Tu perfil se publica cuando juegas con una cuenta online.'}</p>
        <h3>Tus 3 Pokémon favoritos</h3>`);
      const favs = document.createElement('div');
      favs.className = 'fav-slots';
      for (let i = 0; i < 3; i++) {
        const f = P.favs[i];
        const slot = document.createElement('div');
        slot.className = 'fav-slot';
        if (f && G.DEX_BY[f.dex]) {
          slot.appendChild(G.UI.spriteCanvas(f.dex, 120, 100, { scale: 2, lively: true, shiny: !!f.shiny }));
          slot.insertAdjacentHTML('beforeend', `<b>${f.shiny ? G.Icons.html('shiny', 12) + ' ' : ''}${esc(G.DEX_BY[f.dex].name)}</b>`);
        } else slot.innerHTML = '<span>Elegir</span>';
        slot.onclick = () => pickFav(i);
        favs.appendChild(slot);
      }
      box.appendChild(favs);

      const titles = G.Progress.titles();
      box.insertAdjacentHTML('beforeend', `<h3 style="margin-top:14px">Título</h3>`);
      const sel = document.createElement('select');
      sel.className = 'field';
      sel.style.maxWidth = '320px';
      sel.innerHTML = `<option value="">(sin título)</option>` + titles.map(t => `<option value="${esc(t)}" ${t === P.title ? 'selected' : ''}>${esc(t)}</option>`).join('');
      sel.onchange = () => { G.Progress.setTitle(sel.value); G.Audio.sfx('confirm'); };   // (M5 lote 11: con la hora, para fusionar)
      box.appendChild(sel);
      if (!titles.length) box.insertAdjacentHTML('beforeend', '<p class="note">Consigue logros para desbloquear títulos.</p>');

      const row = document.createElement('div');
      row.className = 'row prof-btns';
      // MicaSurvivor (M5 lote 11, menu.gd 3600 "Ver mi tarjeta de entrenador")
      const card = document.createElement('button');
      card.className = 'btn gold'; card.id = 'btn-tcard';
      card.textContent = 'Ver mi tarjeta de entrenador';
      card.onclick = () => G.TrainerCard.show();
      row.appendChild(card);
      const prev = document.createElement('button');
      prev.className = 'btn';
      prev.textContent = 'Ver mi perfil público';
      prev.onclick = () => G.ProfileUI.showData(G.Social.profileData());
      row.appendChild(prev);
      box.appendChild(row);
    }

    function pickFav(i) {
      const s = G.DB.save;
      const box = $('goals-body');
      box.innerHTML = `<div class="row between"><h3>Elige el favorito ${i + 1}</h3>
        <button class="btn small ghost" id="fav-back">Volver</button></div>
        <input class="field" id="fav-q" placeholder="Buscar por nombre" style="max-width:320px;margin:6px 0 10px">
        <div class="grid" id="fav-grid"></div>`;
      $('fav-back').onclick = () => { tab = 'profile'; render(); };
      const fill = q => {
        const g = $('fav-grid');
        g.innerHTML = '';
        const mons = Object.keys(s.owned).map(Number).filter(d => G.DEX_BY[d] && (!q || G.DEX_BY[d].name.toLowerCase().includes(q)));
        for (const d of mons.slice(0, 120)) {
          for (const shiny of G.DB.ownsShiny(d) ? [false, true] : [false]) {
            const c = document.createElement('div');
            c.className = 'cell';
            c.appendChild(G.UI.spriteCanvas(d, 92, 80, { scale: 2, shiny }));
            c.insertAdjacentHTML('beforeend', `<b>${shiny ? G.Icons.html('shiny', 12) + ' ' : ''}${esc(G.DEX_BY[d].name)}</b>`);
            c.onclick = () => {
              s.profile.favs = (s.profile.favs || []).slice();
              s.profile.favs[i] = { dex: d, shiny };
              s.profile.favs = s.profile.favs.filter(Boolean).slice(0, 3);
              save(); tab = 'profile'; render();
            };
            g.appendChild(c);
          }
        }
      };
      $('fav-q').oninput = () => fill($('fav-q').value.trim().toLowerCase());
      fill('');
    }

    function save() {
      G.DB.commit();
      if (G.Social.me) G.Social.publishProfile(true);
      G.Audio.sfx('confirm');
    }

    return { init, open, render };
  })();

  // ======================= TARJETA DE ENTRENADOR =======================
  /*
   * MicaSurvivor (M5 lote 11): la tarjeta del port (menu.gd _show_card 3681-3740): tu nombre, tu título (o
   * "(sin título)"), tu Pokémon y tus 3 favoritos, y 9 datos: Partidas, Mejor tiempo, Mejor nivel, Derrotados,
   * Jefes, Cofres, Pokémon (x / total), Logros (x / total) y Tiempo jugado. Debajo, los récords de cada modo
   * (lo pidió el lote 8 para la Torre y el Rush). Como en el port, sólo se ve (no se comparte ni se exporta) y no
   * enseña nada de la cuenta salvo el nombre que ya ven los demás.
   */
  G.TrainerCard = (() => {
    function init() {
      $('tcard-close').onclick = close;
      $('scr-tcard').onclick = e => { if (e.target.id === 'scr-tcard') close(); };
    }
    const isOpen = () => !$('scr-tcard').classList.contains('hidden');
    function close() { $('scr-tcard').classList.add('hidden'); }

    /** Lo que sale en la tarjeta (de la partida guardada). */
    function data(s = G.DB.save) {
      const st = s.stats || {}, prof = s.profile || {};
      const owned = Object.keys(s.owned || {}).filter(d => G.DEX_BY[d]).length;
      const tt = st.totalTime || 0;
      const loc = G.I18n.lang === 'en' ? 'en' : 'es';   // 54,321 en inglés, 54.321 en español
      return {
        name: (G.Social.me && G.Social.me.name) || G.DB.user || s.name || 'Entrenador',
        title: prof.title || '',
        partner: s.partner, partnerShiny: !!s.partnerShiny && G.DB.ownsShiny(s.partner),
        favs: (prof.favs || []).filter(f => f && G.DEX_BY[f.dex]).slice(0, 3),
        cells: [
          ['Partidas', (st.runs || 0).toLocaleString(loc)],
          ['Mejor tiempo', G.U.mmss(st.bestTime || 0)],
          ['Mejor nivel', String(st.bestLevel || 0)],
          ['Derrotados', (st.totalKills || 0).toLocaleString(loc)],
          ['Jefes', (st.bossesTotal || 0).toLocaleString(loc)],
          ['Cofres', (st.chests || 0).toLocaleString(loc)],
          ['Pokémon', owned + ' / ' + G.DEX.length],
          ['Logros', Object.keys(s.ach || {}).filter(k => G.AchDefs.BY[k]).length + ' / ' + G.AchDefs.LIST.length],
          ['Tiempo jugado', Math.floor(tt / 3600) + 'h ' + String(Math.floor(tt % 3600 / 60)).padStart(2, '0') + 'm']
        ],
        modes: [
          ['Desafío diario', (st.dailyPlays || 0) + ' · ' + (st.dailyBestMin || 0) + ' min'],
          ['Rush de Jefes', G.BossRush.best(s) + ' jefes'],
          ['Torre de pisos', 'Piso ' + G.Tower.rec(s).best + ' · ' + G.Tower.relics(s) + '/' + G.Tower.RELICS_MAX + ' reliquias'],
          ['Contrarreloj de grietas', (st.riftsBest || 0) + ' grietas'],
          ['Supervivencia por tipo', G.Modes.typeDoneCount(s) + '/' + G.Modes.TYPES.length + ' tipos · ' + (st.typeBestMin || 0) + ' min'],
          ['Modo Equipo', (st.teamBestMin || 0) + ' min'],
          ['Ante Arceus', G.U.mmss(st.judgeTime || 0)]
        ]
      };
    }

    function show() {
      const d = data();
      const body = $('tcard-body');
      body.innerHTML = `<div class="tcard">
        <h2 class="tcard-name" translate="no">${esc(d.name)}</h2>
        <div class="tcard-title">${d.title ? esc(d.title) : '(sin título)'}</div>
        <div class="tcard-mons" id="tcard-mons"></div>
        <div class="tcard-cells">${d.cells.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>
        <h3 class="tcard-h">Récords por modo</h3>
        <div class="tcard-modes">${d.modes.map(([k, v]) => `<div><span>${k}</span><b>${String(v).split(' · ').map(p => `<span>${esc(p)}</span>`).join(' · ')}</b></div>`).join('')}</div></div>`;
      const mons = $('tcard-mons');
      if (G.DEX_BY[d.partner]) mons.appendChild(G.UI.spriteCanvas(d.partner, 150, 124, { scale: 3, lively: true, shiny: d.partnerShiny, shadow: true }));
      for (const f of d.favs) mons.appendChild(G.UI.spriteCanvas(f.dex, 84, 72, { scale: 2, shiny: !!f.shiny }));
      $('scr-tcard').classList.remove('hidden');
    }

    return { init, show, close, isOpen, data };
  })();

  // ======================= PERFIL PÚBLICO =======================

  G.ProfileUI = (() => {
    function init() {
      $('prof-close').onclick = close;
      $('scr-profile').onclick = e => { if (e.target.id === 'scr-profile') close(); };
    }
    function close() { $('scr-profile').classList.add('hidden'); }

    /** Abre el perfil de otro jugador por su uid. */
    async function show(uid) {
      if (!uid) return;
      if (uid === G.Social.uid) { showData(G.Social.profileData()); return; }
      $('prof-body').innerHTML = '<p class="sub">Cargando…</p>';
      $('scr-profile').classList.remove('hidden');
      const d = await G.Social.getProfile(uid);
      if (!d) { $('prof-body').innerHTML = '<p class="sub">Este jugador aún no tiene perfil.</p>'; return; }
      showData(d);
    }

    function showData(d) {
      const b = d.best || {};
      const body = $('prof-body');
      body.innerHTML = `
        <div class="prof-head"><h2 translate="no">${esc(d.name || '???')}</h2>${d.title ? `<span class="prof-title">${esc(d.title)}</span>` : ''}</div>
        <div class="fav-slots view" id="prof-favs"></div>
        <div class="prof-marks">
          <div><span>Mejor tiempo</span><b>${fmt(b.solo || 0)}</b></div>
          <div><span>En grupo</span><b>${fmt(b.group || 0)}</b></div>
          <div><span>Nivel máximo</span><b>${b.level || 0}</b></div>
          <div><span>Jefes</span><b>${(b.bosses || 0).toLocaleString('es')}</b></div>
          <div><span>Legendarios</span><b>${b.legends || 0}</b></div>
          <div><span>Derrotados</span><b>${(b.kills || 0).toLocaleString('es')}</b></div>
        </div>
        <h3>Medallas <span class="sub">${b.medals || 0}</span></h3>
        <div class="prof-medals" id="prof-medals"></div>`;
      const favs = $('prof-favs');
      for (const f of (d.favs || []).slice(0, 3)) {
        if (!G.DEX_BY[f.dex]) continue;
        const slot = document.createElement('div');
        slot.className = 'fav-slot';
        slot.appendChild(G.UI.spriteCanvas(f.dex, 120, 100, { scale: 2, lively: true, shiny: !!f.shiny }));
        slot.insertAdjacentHTML('beforeend', `<b>${f.shiny ? G.Icons.html('shiny', 12) + ' ' : ''}${esc(G.DEX_BY[f.dex].name)}</b>`);
        favs.appendChild(slot);
      }
      if (!favs.children.length) favs.innerHTML = '<p class="sub">Sin favoritos todavía.</p>';
      const med = $('prof-medals');
      for (const id of d.medals || []) {
        const a = G.AchDefs.BY[id];
        if (!a) continue;
        const m = document.createElement('div');
        m.className = 'pm';
        m.title = a.name;
        if (a.dex) m.appendChild(G.UI.spriteCanvas(a.dex, 48, 40, { scale: 1 }));
        else m.innerHTML = G.Icons.html('medal' + a.tier, 36);
        m.insertAdjacentHTML('beforeend', `<small>${esc(a.name)}</small>`);
        med.appendChild(m);
      }
      if (!med.children.length) med.innerHTML = '<p class="sub">Aún sin medallas.</p>';
      $('scr-profile').classList.remove('hidden');
    }

    return { init, show, showData };
  })();
})();
