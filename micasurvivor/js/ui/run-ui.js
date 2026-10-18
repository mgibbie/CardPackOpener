/* ============ run-ui.js — cartas de nivel, pausa y fin de run ============ */
G.RunUI = (() => {
  const $ = G.UI.$;
  let offers = null, offerCb = null, coopMode = false;
  // MicaSurvivor (M5 lote 6, main_e16.gd / main.gd Cards 7484-7670): vetar una carta. "Vetar (N)" al lado
  // de "Cambiar"; con el veto activo, la carta de movimiento nuevo que toques no vuelve a salir en la
  // partida y se reparten cartas nuevas (gratis: no gasta cambios). N = nivel de la mejora Veto.
  let banMode = false;

  /** @param coop  en grupo: tras elegir, se queda esperando a los demás */
  function showLevelUp(level, list, cb, coop = false) {
    offerCb = cb; coopMode = coop;
    $('lvl-num').textContent = level;
    $('lvl-wait').textContent = '';
    $('lvl-wait').classList.toggle('hidden', !coop);
    $('cards').classList.remove('done');
    renderCards(list);
    $('lvl-reroll').onclick = reroll;
    $('lvl-ban').onclick = toggleBan;
    G.UI.show('scr-levelup');
  }

  /**
   * Cambiar las cartas: 1 vez gratis por partida y 1 más por cada jefe
   * derrotado (en grupo cuentan los jefes del equipo; cada uno tiene los suyos).
   */
  function rerollsLeft() {
    const p = G.Game.player;
    // 1 gratis + los comprados en Mejoras (antes, 1 más por cada jefe).
    return p ? Math.max(0, 1 + (p.rerollBonus || 0) - (p.rerolls || 0)) : 0;
  }

  function reroll() {
    if (!offers || rerollsLeft() <= 0 || banMode) return;
    const p = G.Game.player;
    p.rerolls = (p.rerolls || 0) + 1;
    G.Audio.sfx('select');
    renderCards(G.LevelUp.offer(p));
  }

  /** Vetos que te quedan en esta partida. */
  function bansLeft() { const p = G.Game.player; return p ? Math.max(0, p.bansLeft || 0) : 0; }

  /** Activa / desactiva el veto (botón, tecla B o la acción `ban` del mando). */
  function toggleBan() {
    if (!offers || (!banMode && bansLeft() <= 0)) return false;
    banMode = !banMode;
    G.Audio.sfx('select');
    syncBan();
    return banMode;
  }

  /** Veta la carta i (sólo un movimiento nuevo) y reparte otras. */
  function ban(i) {
    const p = G.Game.player, c = offers && offers[i];
    if (!c || !p || c.type !== 'new' || bansLeft() <= 0) return false;
    p.banned = p.banned || new Set();
    p.banned.add(c.key.slice(4));
    p.bansLeft--;
    banMode = false;
    G.Audio.sfx('break');
    renderCards(G.LevelUp.offer(p));
    return true;
  }

  function syncBan() {
    const left = bansLeft();
    $('lvl-ban-n').textContent = left;
    $('lvl-ban').classList.toggle('hidden', left <= 0 && !banMode);
    $('lvl-ban').classList.toggle('on', banMode);
    $('lvl-banhint').classList.toggle('hidden', !banMode);
    $('cards').classList.toggle('ban-mode', banMode);
    $('cards').querySelectorAll('.card').forEach((el, j) => el.classList.toggle('no-ban', banMode && !(offers && offers[j] && offers[j].type === 'new')));
    $('lvl-reroll').classList.toggle('hidden', rerollsLeft() <= 0 || banMode);
  }

  function renderCards(list) {
    offers = list;
    banMode = false;
    const left = rerollsLeft();
    $('lvl-rr-n').textContent = left;
    $('lvl-reroll').classList.toggle('hidden', left <= 0);
    const box = $('cards');
    box.innerHTML = '';
    list.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'card';
      const tag = c.type === 'new'
        ? `<span class="tag-chip" style="background:${c.color}">Nuevo · ${c.tag}</span>`
        : c.type === 'up' || c.type === 'evo'
          ? `<span class="tag-chip" style="background:${c.color}">${c.tag}</span>`
          : `<span class="tag-chip" style="background:${c.color === '#ffd23f' ? '#ffd23f' : '#9fb1c9'}">${c.tag}</span>`;
      if (c.type === 'evo') el.classList.add('evo');
      el.innerHTML =
        `<div class="ico" style="background:${c.color}33">${G.Icons.html(c.icon, 32)}</div>
         <div class="txt"><div class="nm">${c.title} ${tag}</div><div class="ds">${c.desc}</div></div>
         <div class="key"><span class="key-k">${i + 1}</span>${G.Pad.glyphHTML('confirm', 22)}</div>`;   // MicaSurvivor (M2): the pad's confirm glyph on the focused card
      el.dataset.sfx = 'none';             // el juego pone su propio sonido al elegir
      el.onclick = () => pick(i);
      box.appendChild(el);
    });
    syncBan();
  }

  function pick(i) {
    if (!offers || !offers[i]) return;
    if (banMode) { ban(i); return; }    // con el veto activo, tocar una carta la veta (si es un movimiento nuevo)
    const c = offers[i], cb = offerCb;
    offers = null; offerCb = null;
    $('lvl-reroll').classList.add('hidden');
    $('lvl-ban').classList.add('hidden');
    if (coopMode) {
      // Se queda la carta elegida a la vista mientras eligen los demás.
      $('cards').querySelectorAll('.card').forEach((el, j) => el.classList.toggle('picked', j === i));
      $('cards').classList.add('done');
    } else G.UI.hide('scr-levelup');
    cb(c);
  }

  /** Cooperativo: quién falta por elegir. */
  function setWaiting(names) {
    const me = G.Social.me ? G.Social.me.name : '';
    const others = names.filter(n => n !== me);
    const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] : a[0];
    $('lvl-wait').textContent = !names.length ? ''
      : !others.length ? 'Elige tu carta'
      : names.includes(me) ? 'Faltan por elegir: ' + list([...others, 'tú'])
      : 'Esperando a ' + list(others) + '…';
  }

  function closeLevelUp() {
    offers = null; offerCb = null; banMode = false;
    $('lvl-banhint').classList.add('hidden');
    $('cards').classList.remove('ban-mode');
    $('cards').classList.remove('done');
    G.UI.hide('scr-levelup');
  }

  /**
   * Mensaje de apoyo (Ko-fi) al acabar: tras un récord o cada 10 partidas,
   * nunca en la primera y como mucho una vez al día. Se cierra con la X.
   */
  function askSupport(r) {
    if (!G.Funding || !G.Funding.url) return false;
    const runs = (G.DB.save && G.DB.save.stats && G.DB.save.stats.runs) || 0;
    if (runs < 2 || !(r.record || runs % 10 === 0)) return false;
    const today = new Date().toISOString().slice(0, 10);
    try { if (localStorage.getItem('micasurvivor_ask') === today) return false; localStorage.setItem('micasurvivor_ask', today); } catch (e) { return false; }
    return true;
  }

  function showOver(r, onBack) {
    // MicaSurvivor (M5 lote 6): "¡Tiempo!" al acabar la Contrarreloj; las líneas del modo (récords del Diario,
    // grietas ganadas, el tipo, la Fiesta) bajo el título.
    // (M5 lote 8: «¡TORRE COMPLETA!» al superar el piso 30, main.gd _tower_win)
    $('over-title').textContent = r.title || (r.timeUp ? '¡Tiempo!' : r.dead ? 'Has caído…' : 'Run terminada');
    const modeLine = (r.modeLines || []).length ? `<div style="grid-column:1/-1;text-align:center" class="over-mode"><p>${r.modeLines.map(l => `<span>${l}</span>`).join(' · ')}</p></div>` : '';
    $('over-stats').innerHTML = modeLine + (r.rifts != null ? `<div style="grid-column:1/-1"><span>Grietas ganadas</span><b class="gold">${r.rifts}</b></div>` : '') + `
      <div><span>Tiempo</span><b>${G.U.mmss(r.time)}</b></div>
      <div><span>Nivel</span><b>${r.level}</b></div>
      <div><span>Derrotados</span><b>${r.kills}</b></div>
      <div><span>Jefes</span><b>${r.bosses}</b></div>
      ${r.judge ? `<div style="grid-column:1/-1"><span>Ante Arceus</span><b class="gold">${G.U.mmss(r.judge.time)} · ${r.judge.bosses} ${r.judge.bosses === 1 ? 'legendario' : 'legendarios'}</b></div>` : ''}
      <div style="grid-column:1/-1"><span>Pokémonedas ganadas</span>
        <b class="gold"><span class="coin"></span> +${r.coins}</b>
        <div style="font-size:12px;color:var(--muted)">${r.breakdown}</div></div>
      ${r.t1 || r.t10 ? `<div style="grid-column:1/-1"><span>Tickets del gacha</span><b>
        ${r.t1 ? G.Icons.html('ticket', 22) + ' +' + r.t1 + ' ' : ''}${r.t10 ? G.Icons.html('ticket10', 22) + ' +' + r.t10 + ' ×10' : ''}</b></div>` : ''}
      <div style="grid-column:1/-1"><span>Movimientos</span><b style="font-size:15px">
        ${r.moves.map(m => `${G.Icons.html('move:' + m.id, 16)} ${m.name} <span>Nv.${m.lvl}</span>`).join(' · ') || '—'}</b></div>
      ${r.caught && r.caught.length ? `<div style="grid-column:1/-1" class="caught"><span>${G.Icons.html('shiny', 12)} Shinies conseguidos</span>
        <div class="caught-row" id="over-caught"></div></div>` : ''}
      ${r.record ? '<div style="grid-column:1/-1;text-align:center" class="gold">¡Nuevo récord de tiempo!</div>' : ''}
      ${askSupport(r) ? `<div class="support-ask" id="over-ask" style="grid-column:1/-1">
        <button class="x" type="button" aria-label="Cerrar">×</button>
        <p>¿Te está gustando PokéSurvivor? Lo hago yo solo y los servidores cuestan dinero. Si quieres, puedes ayudarme a mantenerlo en línea.</p>
        <a class="btn small gold" href="${G.Funding.url}" target="_blank" rel="noopener">${G.Icons.html('heart', 14)} Apoyar en Ko-fi</a>
      </div>` : ''}`;
    const ask = $('over-ask');
    if (ask) ask.querySelector('.x').onclick = () => ask.remove();
    $('btn-again').onclick = onBack;
    if (r.caught && r.caught.length) {
      const row = $('over-caught');
      for (const c of r.caught) {
        const w = document.createElement('div');
        w.appendChild(G.UI.spriteCanvas(c.dex, 90, 72, { shiny: true, lively: true, scale: 2 }));
        w.insertAdjacentHTML('beforeend', `<small>${G.DEX_BY[c.dex].name}${c.isNew ? ' · ¡nuevo!' : ''}</small>`);
        row.appendChild(w);
      }
    }
    G.UI.show('scr-over');
  }

  /** Has encontrado un objeto llevando ya otro: ¿con cuál te quedas? */
  /**
   * @param held  los que llevas: [uno] o, con la Mochila llena, [hueco 1, hueco 2]
   * @param next  el que has encontrado
   * @param cb    recibe { slot } (te lo pones en ese hueco) o null (te quedas como estabas)
   * MicaSurvivor (M5 lote 3, main.gd _offer_item): con dos objetos, una carta por hueco
   * ("Sustituye: …") y otra para quedarte con los dos.
   */
  function showItemChoice(held, next, cb) {
    if (!Array.isArray(held)) held = [held];
    const box = $('item-cards');
    box.innerHTML = '';
    const nx = G.Items.BY[next];
    const opts = held.length > 1
      ? [...held.map((id, i) => ({ icon: next, cls: ' evo', nm: 'Cambiar a ' + nx.name, ds: 'Sustituye: ' + G.Items.BY[id].name, pick: { slot: i + 1 } })),
         { icon: held[0], cls: '', nm: 'Quedarme con los dos', ds: 'Sigues con tus objetos actuales.', pick: null }]
      : [{ icon: held[0], cls: '', nm: 'Quedarme con ' + G.Items.BY[held[0]].name, ds: G.Items.BY[held[0]].desc, pick: null },
         { icon: next, cls: ' evo', nm: 'Cambiar a ' + nx.name, ds: nx.desc, pick: { slot: 1 } }];
    $('item-sub').textContent = held.length > 1 ? 'Puedes llevar dos objetos ·' : 'Sólo puedes llevar uno ·';
    const keys = document.querySelector('#scr-item .sub .key-k');
    if (keys) keys.innerHTML = opts.map((_, i) => `<kbd>${i + 1}</kbd>`).join(' ');
    if (held.length > 1) {
      // Lo que hace el nuevo, encima de las cartas (las de sustituir dicen a cuál quitas).
      const info = document.createElement('p');
      info.className = 'sub item-new';
      info.innerHTML = `${G.Icons.html(next, 20)} <b>${nx.name}</b>: ${nx.desc}`;
      box.appendChild(info);
    }
    opts.forEach((o, i) => {
      const el = document.createElement('div');
      el.className = 'card' + o.cls;
      el.innerHTML = `<div class="ico">${G.Icons.html(o.icon, 36)}</div>
        <div class="txt"><div class="nm">${o.nm}</div><div class="ds">${o.ds}</div></div>
        <div class="key"><span class="key-k">${i + 1}</span>${G.Pad.glyphHTML('confirm', 22)}</div>`;
      el.onclick = () => { G.UI.hide('scr-item'); cb(o.pick); };
      box.appendChild(el);
    });
    G.UI.show('scr-item');
  }

  // ---------------- vínculo: qué movimientos se fusionan ----------------

  let bond = null;          // { opt, cb, first, list }

  /**
   * @param opt  pl.bondOptions(): 'add' (uno suelto al grupo) o 'pair' (dos sueltos, en dos pasos)
   * @param cb   recibe la lista de movimientos que se juntan
   */
  function showBond(opt, cb) {
    bond = { opt, cb, first: null, list: [] };
    $('bond-back').onclick = bondBack;
    renderBond();
    G.UI.show('scr-bond');
  }

  function renderBond() {
    const { opt, first } = bond;
    const names = ms => ms.map(m => m.name).join(' + ');
    const step2 = opt.mode === 'pair' && first;
    $('bond-sub').textContent = opt.mode === 'add' ? 'Elige qué movimiento se une a ' + names(opt.group)
      : step2 ? '¿Con cuál unes ' + first.name + '?' : 'Elige el primer movimiento que vas a unir';
    $('bond-back').classList.toggle('hidden', !step2);
    bond.list = step2 ? opt.loose.filter(m => m !== first) : opt.loose;
    const box = $('bond-cards');
    box.innerHTML = '';
    bond.list.forEach((m, i) => {
      const col = G.U.TYPE_COLOR[m.type];
      const desc = opt.mode === 'add' ? 'Se lanzará a la vez que ' + names(opt.group) + '.'
        : step2 ? 'Se lanzará a la vez que ' + first.name + '. Queda un hueco libre.'
        : m.desc || '';
      const el = document.createElement('div');
      el.className = 'card' + (opt.mode === 'add' || step2 ? ' bond' : '');
      el.innerHTML =
        `<div class="ico" style="background:${col}33">${G.Icons.html('move:' + m.id, 32)}</div>
         <div class="txt"><div class="nm">${m.name} <span class="tag-chip" style="background:${col}">Nv.${m.lvl}</span></div><div class="ds">${desc}</div></div>
         <div class="key"><span class="key-k">${i + 1}</span>${G.Pad.glyphHTML('confirm', 22)}</div>`;
      el.dataset.sfx = 'none';
      el.onclick = () => pickBond(i);
      box.appendChild(el);
    });
  }

  function pickBond(i) {
    if (!bond || !bond.list[i]) return;
    const m = bond.list[i];
    if (bond.opt.mode === 'pair' && !bond.first) {
      bond.first = m;
      G.Audio.sfx('select');
      renderBond();
      return;
    }
    const picked = bond.opt.mode === 'add' ? [m] : [bond.first, m];
    const cb = bond.cb;
    bond = null;
    G.UI.hide('scr-bond');
    cb(picked);
  }

  function bondBack() {
    if (!bond) return;
    bond.first = null;
    renderBond();
  }

  function showPause(coop = false) {
    G.UI.soundControls($('pause-sound'));
    $('pause-coop').classList.toggle('hidden', !coop);
    $('btn-quit').textContent = coop ? 'Salir de la partida' : 'Abandonar run';
    // MicaSurvivor (M5): la habilidad del Pokémon activo (el modo Equipo la cambiará).
    const pl = G.Game.player;
    $('pause-ability').innerHTML = pl && pl.ability ? G.UI.abilityLine(pl.dex, false, pl.ability) : '';
    // MicaSurvivor (M5 lote 6): el modo y sus modificadores.
    const lbl = G.Modes.label();
    $('pause-mode').innerHTML = lbl ? lbl.split(' · ').map(t => `<span>${t}</span>`).join(' · ') : '';
    $('pause-mode').classList.toggle('hidden', !lbl);
    G.UI.show('scr-pause');
  }

  function wirePause(onResume, onQuit) {
    $('btn-resume').onclick = onResume;
    $('btn-quit').onclick = onQuit;
  }

  return { showLevelUp, reroll, toggleBan, ban, bansLeft, get banMode() { return banMode; }, showItemChoice, showBond, pickBond, bondBack, pick, setWaiting, closeLevelUp, showOver, wirePause, showPause };
})();
