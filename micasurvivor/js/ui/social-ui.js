/* ============ social-ui.js — apodo, amigos, sala e invitaciones ============ */
(() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** ¿Se puede usar lo online? Si no, explica por qué. */
  function needOnline() {
    // MicaSurvivor (M5 batch 12b): online play needs a Magepunk account (friends live there), not a
    // controller or anything else: a guest is told to sign in.
    if (G.MicaAccount && G.MicaAccount.name()) return true;
    G.UI.toast('Inicia sesión para jugar con amigos.', 3200);
    return false;
  }

  // ======================= APODO =======================

  G.NickUI = (() => {
    let then = null, skipped = false;

    function init() {
      $('nick-form').onsubmit = async e => {
        e.preventDefault();
        $('nick-err').textContent = '';
        $('nick-ok').disabled = true;
        const r = await G.Social.claimNick($('nick-in').value);
        $('nick-ok').disabled = false;
        if (!r.ok) { $('nick-err').textContent = r.error; G.Audio.sfx('error'); return; }
        G.Audio.sfx('confirm');
        G.UI.toast('Tu apodo es ' + G.Social.me.name);
        const cb = then; then = null;
        if (cb) cb(); else G.MenuUI.open();
      };
      $('nick-later').onclick = () => { skipped = true; then = null; G.MenuUI.open(); };
    }

    /** @param next  qué abrir después de elegirlo */
    function open(next) {
      then = next || null;
      G.UI.show('scr-nick');
      $('nick-err').textContent = '';
      $('nick-in').value = '';
      setTimeout(() => $('nick-in').focus(), 50);
    }

    return { init, open, get skipped() { return skipped; } };
  })();

  /** Abre `fn` si tienes apodo; si no, pide el apodo primero. */
  function withNick(fn) {
    if (!needOnline()) return;
    if (G.Social.me) { fn(); return; }
    // MicaSurvivor (M5 batch 12b): your Magepunk username is your name: no nickname to choose.
    G.Social.start().then(r => { if (r === 'ok') fn(); });
  }

  // ======================= AMIGOS =======================

  G.FriendsUI = (() => {
    function init() {
      $('fr-add').onsubmit = async e => {
        e.preventDefault();
        const name = $('fr-name').value;
        msg('');
        const r = await G.Social.request(name);
        msg(r.ok ? r.msg : r.error, !r.ok);
        if (r.ok) $('fr-name').value = '';
      };
      $('fr-room').onclick = () => G.LobbyUI.open();
      // MicaSurvivor (M5 batch 12b): "Play with friends" opens a lobby to invite them into.
      $('fr-play').onclick = async () => {
        $('fr-play').disabled = true;
        const room = await G.Social.createRoom();
        $('fr-play').disabled = false;
        if (room) G.LobbyUI.open(); else msg('No se pudo crear la sala.', true);
      };
      G.Social.on(() => { if (G.UI.isOpen('scr-friends')) render(); });
    }

    function msg(t, bad) {
      $('fr-msg').textContent = t || '';
      $('fr-msg').style.color = bad ? '#ffb0b8' : '';
      if (t) G.Audio.sfx(bad ? 'error' : 'confirm');
    }

    function open() { withNick(() => { G.UI.show('scr-friends', true); msg(''); render(); G.Social.refreshPresence(); }); }

    /** "hace 5 min", "hace 2 h", "hace 3 días". */
    function ago(t) {
      const m = Math.max(1, Math.round((G.Social.now() - t) / 60000));
      if (m < 60) return 'hace ' + m + ' min';
      const h = Math.round(m / 60);
      if (h < 48) return 'hace ' + h + ' h';
      return 'hace ' + Math.round(h / 24) + ' días';
    }

    function stateText(f) {
      if (f.status === 'in') return 'Quiere ser tu amigo';
      if (f.status === 'out') return 'Solicitud enviada';
      if (!f.online) return f.seen ? 'Visto ' + ago(f.seen) : 'Desconectado';
      return f.play ? 'Jugando' : f.here ? 'En MicaSurvivor' : 'En línea';   // (MicaSurvivor 12b: here = in MicaSurvivor)
    }

    function render() {
      const room = G.Social.room;
      // MicaSurvivor (M5 batch 12b): your Magepunk username, and the lobby button.
      $('fr-me').innerHTML = 'Juegas como <b class="gold" translate="no">' + esc(G.Social.me ? G.Social.me.name : '') + '</b>. Crea una sala e invita a tus amigos para jugar juntos en línea (hasta 4).';
      $('fr-room').classList.toggle('hidden', !room);
      $('fr-play').classList.toggle('hidden', !!room);
      const list = G.Social.friends.sort((a, b) => {
        const rank = f => f.status === 'in' ? 0 : f.status === 'ok' ? (f.online ? (f.play ? 2 : 1) : 3) : 4;
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
      renderLive(list);
      renderReplays();
      const box = $('fr-list');
      box.innerHTML = '';
      if (!list.length) {
        box.innerHTML = '<p class="sub">Aún no tienes amigos. Añade arriba a un amigo por su nombre de usuario de Magepunk.</p>';
        return;
      }
      for (const f of list) {
        const el = document.createElement('div');
        el.className = 'fr-row';
        const dot = f.status !== 'ok' ? 'pend' : !f.online ? 'off' : f.play ? 'play' : 'on';
        const inRoom = room && room.members.some(m => m.uid === f.uid);
        el.innerHTML = `<i class="dot ${dot}"></i><b translate="no"><a href="#" class="plink" title="Ver su perfil">${esc(f.name)}</a></b><span class="st">${inRoom ? 'En tu sala' : stateText(f)}</span><span class="grow"></span>`;
        if (f.status === 'ok') el.querySelector('.plink').onclick = e => { e.preventDefault(); G.ProfileUI.show(f.uid); };
        else el.querySelector('.plink').onclick = e => e.preventDefault();
        const btn = (txt, cls, fn) => {
          const b = document.createElement('button');
          b.className = 'btn small ' + cls; b.textContent = txt; b.onclick = fn; el.appendChild(b); return b;
        };
        if (f.status === 'in') {
          btn('Aceptar', 'gold', async () => { const r = await G.Social.accept(f.uid); msg(r.ok ? r.msg : r.error, !r.ok); });
          btn('Rechazar', 'ghost', () => G.Social.remove(f.uid));
        } else if (f.status === 'out') {
          btn('Cancelar', 'ghost', () => G.Social.remove(f.uid));
        } else {
          if (f.online && !f.play && !inRoom && (!room || room.isHost)) {
            btn('Invitar', 'gold', async () => {
              const r = await G.Social.invite(f.uid);
              msg(r.ok ? r.msg : r.error, !r.ok);
              if (r.ok) G.LobbyUI.open();
            });
          }
          // (MicaSurvivor 12b: friends are managed on Magepunk; no Remove here)
        }
        box.appendChild(el);
      }
    }

    /**
     * MicaSurvivor (M5 lote 12c): "En directo ahora": los amigos que están en una partida (su baliza en el servidor,
     * también en solitario), con "Ver" (js/ui/watch-ui.js). Un grupo online se puede ver desde cualquiera de ellos.
     */
    function renderLive(list) {
      const box = $('fr-live');
      const live = list.filter(f => f.status === 'ok' && f.play && f.uid !== G.Social.uid);
      $('fr-live-h').classList.toggle('hidden', !live.length);
      box.innerHTML = '';
      for (const f of live) {
        const el = document.createElement('div');
        el.className = 'fr-row';
        el.innerHTML = `<i class="dot play"></i><b translate="no">${esc(f.name)}</b><span class="live-badge">${esc(G.T('EN DIRECTO'))}</span>`
          + `<span class="st" translate="no">${esc(f.where || '')}</span><span class="grow"></span>`;
        const b = document.createElement('button');
        b.className = 'btn small gold'; b.type = 'button';
        b.innerHTML = G.Icons.html('eye', 14) + ' ' + esc(G.T('Ver'));
        b.dataset.watch = f.uid;
        b.onclick = () => G.WatchUI.watchLive(f.uid, () => open());
        el.appendChild(b);
        box.appendChild(el);
      }
    }
    /** MicaSurvivor (M5 lote 12c): las últimas partidas guardadas en este navegador: verlas o compartirlas. */
    function renderReplays() {
      const box = $('fr-replays');
      const list = G.Replay.local();
      $('fr-replays-h').classList.toggle('hidden', !list.length);
      box.innerHTML = '';
      for (const e of list) {
        const m = e.meta || {}, mon = G.DEX_BY[m.dex];
        const el = document.createElement('div');
        el.className = 'fr-row';
        el.innerHTML = `<b translate="no">${esc(mon ? mon.name : '?')}</b><span class="st">${esc(G.T('Nv.'))} ${m.level | 0} · ${G.U.mmss(m.time || 0)} · ${(m.kills || 0).toLocaleString('en')} ${esc(G.T('derrotados'))}</span><span class="grow"></span>`;
        const mk = (txt, cls, fn) => { const b = document.createElement('button'); b.className = 'btn small ' + cls; b.type = 'button'; b.textContent = G.T(txt); b.onclick = fn; el.appendChild(b); return b; };
        mk('Ver', 'ghost', () => G.WatchUI.playLocal(e, () => open()));
        const sh = mk(e.id ? 'Copiar enlace' : 'Compartir', 'gold', async () => {
          sh.disabled = true;
          const r = await G.Replay.share(e.rid);
          sh.disabled = false;
          if (!r.ok) { msg(r.error === 'login' ? 'Inicia sesión en Magepunk para compartir repeticiones.' : 'No se pudo subir. Inténtalo otra vez.', true); return; }
          e.id = r.id;
          sh.textContent = G.T('Copiar enlace');
          try { await navigator.clipboard.writeText(r.link); msg('¡Enlace copiado! ' + r.link); } catch (err) { msg(r.link); }
        });
        box.appendChild(el);
      }
    }

    return { init, open, render };
  })();

  // ======================= SALA =======================

  G.LobbyUI = (() => {
    let membersKey = '';

    function init() {
      $('lobby-leave').onclick = async () => {
        await G.Social.leaveRoom();
        G.Net.close();
        G.MenuUI.open();
      };
      $('lobby-menu').onclick = () => G.MenuUI.open();
      $('lobby-start').onclick = start;
      $('lobby-start').dataset.sfx = 'confirm';
      // MicaSurvivor (M5 batch 12b): ready, and changing your Pokémon (the collection; Play brings you back)
      $('lobby-ready').onclick = async () => {
        const room = G.Social.room, mine = room && room.members.find(m => m.uid === G.Social.uid);
        if (!mine) return;
        $('lobby-ready').disabled = true;
        const r = await G.Social.setReady(!mine.ready);
        $('lobby-ready').disabled = false;
        if (!r.ok && r.error) G.UI.toast(r.error, 2600);
      };
      $('lobby-mon').onclick = () => { if (G.MenuUI.openDex) G.MenuUI.openDex(); };
      // Conecta / desconecta la red al entrar o salir de una sala.
      G.Social.on(what => {
        const room = G.Social.room;
        if (room) {
          G.Net.open(room.id, room.isHost, room.host);
          G.Net.syncMembers(room.members.map(m => m.uid));
        } else if (G.Net.open_) G.Net.close();
        if (what === 'room-closed') {
          G.UI.toast('La sala se ha cerrado', 2600);
          if (G.UI.isOpen('scr-lobby') || G.UI.isOpen('scr-friends')) G.MenuUI.open();
        }
        if (G.UI.isOpen('scr-lobby')) render();
      });
      G.Net.onPeer(() => { if (G.UI.isOpen('scr-lobby')) render(); });
    }

    function open() {
      if (!G.Social.room) { G.MenuUI.open(); return; }
      G.Social.refreshMember();
      G.Social.refreshPresence();
      G.UI.show('scr-lobby', true);
      membersKey = '';
      render();
    }

    function close() { G.UI.hide('scr-lobby'); }

    // MicaSurvivor (M5 batch 12b): the host sees each guest's connection; a guest sees theirs to the host
    // (on the host's card) and their own ready state.
    const modeText = mode => mode === 'direct' ? 'Conectado' : mode === 'relay' ? 'Conectado (por servidor)' : mode === 'failed' ? 'No se pudo conectar (reintentando…)' : 'Conectando…';
    function connText(m, room) {
      if (m.uid === room.host) return room.isHost ? 'Anfitrión' : 'Anfitrión · ' + modeText(G.Net.mode(m.uid));
      if (!room.isHost) return m.uid === G.Social.uid ? (m.ready ? 'Tú · Listo' : 'Tú · No estás listo') : (m.ready ? 'Listo' : 'No está listo');
      return (m.ready ? 'Listo' : 'No está listo') + ' · ' + modeText(G.Net.mode(m.uid));
    }

    function render() {
      const room = G.Social.room;
      if (!room) return;
      const ms = room.members;
      $('lobby-sub').textContent = room.isHost
        ? 'Eres el anfitrión. Invita a tus amigos (hasta ' + G.Social.MAX_PLAYERS + ') y empezad cuando estéis.'
        : 'Estás en la sala de ' + ((ms.find(m => m.uid === room.host) || {}).name || '…') + '. El anfitrión empezará la partida.';

      // Las tarjetas sólo se rehacen si cambian los miembros (los sprites no parpadean).
      const key = ms.map(m => m.uid + ':' + m.dex + ':' + (m.shiny ? 1 : 0)).join('|') + '|' + G.I18n.lang;
      const box = $('lobby-members');
      if (key !== membersKey) {
        membersKey = key;
        box.innerHTML = '';
        for (let i = 0; i < G.Social.MAX_PLAYERS; i++) {
          const m = ms[i];
          const c = document.createElement('div');
          c.className = 'lob-card' + (m ? '' : ' empty');
          if (m) {
            c.style.setProperty('--pc', G.Coop.COLORS[i]);
            c.appendChild(G.UI.spriteCanvas(m.dex, 120, 96, { scale: 2, lively: true, shiny: !!m.shiny }));
            c.insertAdjacentHTML('beforeend', `<b translate="no">${esc(m.name)}</b><small>${esc((G.DEX_BY[m.dex] || {}).name || '')}</small><span class="conn" data-u="${m.uid}"></span>`);
          } else c.innerHTML = '<span>Libre</span>';
          box.appendChild(c);
        }
      }
      box.querySelectorAll('.conn').forEach(el => {
        const m = ms.find(x => x.uid === el.dataset.u);
        if (!m) return;
        const t = connText(m, room);
        el.textContent = t;
        el.className = 'conn' + (/Conectando|No está listo|No estás listo|No se pudo/.test(t) ? ' wait' : '');
      });

      // Invitar (sólo el anfitrión y si queda sitio).
      const canInvite = room.isHost && ms.length < G.Social.MAX_PLAYERS;
      $('lobby-inv-title').classList.toggle('hidden', !canInvite);
      const inv = $('lobby-invite');
      inv.classList.toggle('hidden', !canInvite);
      if (canInvite) {
        inv.innerHTML = '';
        const free = G.Social.friends.filter(f => f.status === 'ok' && f.online && !ms.some(m => m.uid === f.uid))
          .sort((a, b) => (b.here - a.here) || a.name.localeCompare(b.name));
        if (!free.length) inv.innerHTML = '<p class="sub" style="margin:0">Ningún amigo en línea ahora mismo.</p>';
        const invited = new Set(room.invited || []);
        for (const f of free) {
          const el = document.createElement('div');
          el.className = 'fr-row';
          el.innerHTML = `<i class="dot ${f.play ? 'play' : 'on'}"></i><b translate="no">${esc(f.name)}</b><span class="st">${f.play ? 'Jugando' : f.here ? 'En MicaSurvivor' : 'En línea'}</span><span class="grow"></span>`;
          const b = document.createElement('button');
          const sent = invited.has(f.uid);
          b.className = 'btn small ' + (sent ? 'ghost' : 'gold'); b.textContent = sent ? 'Ya invitado' : 'Invitar';
          b.disabled = f.play;
          b.onclick = async () => { const r = await G.Social.invite(f.uid); G.UI.toast(r.ok ? r.msg : r.error); };
          el.appendChild(b);
          inv.appendChild(el);
        }
      }

      const btn = $('lobby-start');
      btn.classList.toggle('hidden', !room.isHost);
      const connecting = ms.some(m => m.uid !== room.host && G.Net.mode(m.uid) === 'connecting');
      const failed = ms.some(m => m.uid !== room.host && G.Net.mode(m.uid) === 'failed');
      const unready = ms.some(m => m.uid !== room.host && !m.ready);   // (MicaSurvivor 12b: everyone ready first)
      btn.disabled = !room.isHost || ms.length < 2 || connecting || failed || unready || starting;
      btn.textContent = 'Empezar partida (' + ms.length + '/' + G.Social.MAX_PLAYERS + ')';
      const mine = ms.find(m => m.uid === G.Social.uid);
      const rb = $('lobby-ready');
      rb.classList.toggle('hidden', room.isHost || !mine);
      rb.textContent = mine && mine.ready ? 'Ya no estoy listo' : 'Estoy listo';
      rb.classList.toggle('gold', !(mine && mine.ready));
      rb.classList.toggle('ghost', !!(mine && mine.ready));
      const relay = ms.some(m => m.uid !== G.Social.uid && G.Net.mode(room.isHost ? m.uid : room.host) === 'relay');
      const budgetOut = G.Net.budgetOut;
      const base = !room.isHost ? (mine && mine.ready ? 'Cuando el anfitrión empiece, entraréis todos a la vez.' : 'Pulsa "Estoy listo" cuando quieras empezar.')
        : ms.length < 2 ? 'Necesitas al menos un amigo en la sala.'
        : budgetOut && failed ? ''
        : failed ? 'No se puede conectar con algún amigo: su red (o la tuya) no deja jugar en grupo. Probad con otra wifi o datos móviles; se reintenta solo.'
        : connecting ? 'Conectando con tus amigos…'
        : unready ? 'Esperando a que todos estén listos…'
        : relay ? 'Alguien juega por el servidor (sin conexión directa): irá algo más a saltos.' : 'La partida empieza para todos a la vez.';
      // MicaSurvivor (M5 batch 12b): the relay's daily minutes (the host's), warned ahead while a pair is on it
      const left = G.MicaNet.relayLeft;
      const line = budgetOut ? G.Coop.BUDGET_MSG : relay && left != null ? 'Relé: quedan ' + left + ' min hoy' : '';
      $('lobby-note').innerHTML = (base ? esc(base) : '') + (line ? (base ? '<br>' : '') + '<b class="relay-left' + (budgetOut || left < 6 ? ' low' : '') + '">' + esc(line) + '</b>' : '');
    }

    // MicaSurvivor (M5 batch 12b): the server checks everyone is ready and stores the seed and the
    // members (guests read the start from the lobby too); then the 'start' message, as upstream.
    let starting = false;
    async function start() {
      const room = G.Social.room;
      if (!room || !room.isHost || room.members.length < 2 || starting) return;
      starting = true; render();
      const r = await G.Social.startRoom(Math.floor(Math.random() * 1e6));
      starting = false;
      if (!r.ok) { G.UI.toast(r.error || 'No se pudo empezar.', 2600); render(); return; }
      G.Net.broadcast(r.cfg);
      G.Flow.startCoop(r.cfg);
    }

    return { init, open, close, render };
  })();

  // ======================= INVITACIONES =======================

  G.InvitePop = (() => {
    let cur = null;

    function init() {
      $('inv-yes').onclick = async () => {
        if (!cur) return;
        const from = cur.from;
        hide();
        const r = await G.Social.acceptInvite(from);
        if (!r.ok) { G.UI.toast(r.error, 3000); return; }
        G.LobbyUI.open();
      };
      $('inv-no').onclick = () => { if (cur) G.Social.declineInvite(cur.from); hide(); };
      G.Social.on(what => { if (what === 'invites' || what === 'room') refresh(); });
    }

    function hide() { cur = null; $('invite-pop').classList.add('hidden'); }

    /** Enseña la invitación más antigua si estás en los menús (no en plena partida). */
    const told = new Set();
    function refresh() {
      const room = G.Social.room;
      const list = G.Social.invites.filter(i => !room || i.room !== room.id).sort((a, b) => a.at - b.at);
      // MicaSurvivor (M5 batch 12b): in a solo run, a toast (once per invite) instead of the popup
      if (list.length && G.Game.state !== 'ui' && G.DB.loggedIn && !G.Coop.active) {
        for (const i of list) if (!told.has(i.from + i.room)) { told.add(i.from + i.room); G.UI.toast(i.name + ' te invita a jugar en su sala · abre el menú para unirte', 4200); }
      }
      if (!list.length || G.Game.state !== 'ui' || !G.DB.loggedIn) { hide(); return; }
      if (cur && cur.from === list[0].from) return;
      cur = list[0];
      $('inv-text').innerHTML = `${G.Icons.html('friends', 22)} <b class="gold" translate="no">${esc(cur.name)}</b> te invita a jugar en su sala`;
      $('invite-pop').classList.remove('hidden');
      G.Audio.sfx('shiny');
    }

    return { init, refresh };
  })();

  G.SocialUI = {
    init() { G.NickUI.init(); G.FriendsUI.init(); G.LobbyUI.init(); G.InvitePop.init(); },
    withNick, needOnline
  };
})();
