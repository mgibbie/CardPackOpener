/* ============ lexicon-ui.js — el Léxico (enciclopedia del juego) ============
 * MicaSurvivor (M5 lote 11): el "Léxico" del port de Android por JayElDragon (menu.gd 3047-3194: una entrada
 * del menú principal con las pestañas Objetos, Movimientos, Estados, Habilidades y "Z y Dynamax"; cada ficha
 * con icono, nombre, una línea de estado y la descripción). Como en el port:
 *   - Objetos: "✔ Encontrado" / "Aún sin encontrar" (save.itemsFound) y "Objetos: N / 26 encontrados";
 *   - Movimientos: por tipo, con "Evoluciona en: …" (EVO y EVO_ALT);
 *   - Estados: los 7 estados alterados, con el texto del port (LEX_STATUS);
 *   - Habilidades: todas, en el orden del port;
 *   - Z y Dynamax: la regla de los Z, la ficha del Dynamax ("Desbloqueado" / "Vence una guarida Dynamax: n/1")
 *     y los 18 Movimientos Z con "Derrota 250 Pokémon de tipo X: n/250" o "Desbloqueado".
 * Lo que añade el plan M5 (el port no lo tiene en el Léxico): las guaridas Dynamax, los Pokémon (los que tienes,
 * con sprite; los demás, en sombra), los modos con tus récords (Torre y Rush incluidos), los modificadores, la
 * dificultad adaptativa y la Torre de pisos (reliquias, descanso, pactos y el registro de jefes, que antes sólo
 * salía al perder). Cada ficha se abre (ratón, toque o mando) en una ventana con todo su texto y sus datos.
 */
G.LexiconUI = (() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = t => G.U.TYPE_NAME[t];
  const n = v => Number(v || 0).toLocaleString(G.I18n.lang === 'en' ? 'en' : 'es');
  const mm = sec => G.U.mmss(sec || 0);
  // Un texto con partes "a · b": cada parte en su <span>, para que la traducción (i18n.js, por nodo de texto) las coja.
  const parts = v => String(v).split(' · ').map(p => `<span>${esc(p)}</span>`).join(' · ');
  const GEN_NAMES = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Teselia', 'Kalos', 'Alola', 'Galar', 'Paldea'];

  // Las pestañas: las 5 del port (menu.gd 3075) y las del plan M5.
  const TABS = [['i', 'Objetos'], ['m', 'Movimientos'], ['s', 'Estados'], ['a', 'Habilidades'], ['z', 'Z y Dynamax'],
                ['p', 'Pokémon'], ['md', 'Modos'], ['t', 'Torre de pisos']];
  // menu.gd LEX_STATUS (3056-3063)
  const STATUS = [
    ['freeze', 'Congelado', 'El enemigo no se mueve ni ataca y recibe un 25% más de daño. Los jefes lo resisten.'],
    ['para', 'Paralizado', 'El enemigo va mucho más lento y recibe más daño eléctrico. Los jefes lo resisten.'],
    ['sleep', 'Dormido', 'El enemigo no actúa, recibe un 30% más de daño y se despierta con el primer golpe. Darkrai es inmune.'],
    ['conf', 'Confundido', 'El enemigo se mueve sin rumbo y ataca a otros enemigos. Los jefes lo resisten.'],
    ['burn', 'Quemado', 'Daño continuo y el enemigo hace menos daño.'],
    ['poison', 'Envenenado', 'Daño continuo según su vida máxima (menos contra jefes).'],
    ['slow', 'Ralentizado', 'El enemigo se mueve más despacio durante un rato.']
  ];
  const STATUS_COL = { freeze: '#7fe0ff', para: '#ffe14d', sleep: '#b9a6ff', conf: '#ff8ad8', burn: '#ff9a4d', poison: '#d47cf0', slow: '#8bd94a' };
  // Lo que hace cada modo (lo mismo que dice su tarjeta en Modos de juego, sin los récords, que van en los datos).
  const MODE_DESC = {
    normal: 'La experiencia de siempre, igual que el juego original.',
    daily: 'Cada día, el mismo Pokémon y la misma regla para todos. +25% de monedas.',
    rush: 'Solo jefes y legendarios, uno tras otro, cada vez más fuertes.',
    party: 'Cualquier Pokémon, no puedes morir y no se guarda progreso.',
    coop: 'Un segundo Pokémon te acompaña y ataca solo. Si conectas un segundo mando, el jugador 2 lo mueve con su stick izquierdo. Comparte tus mejoras. -20% de monedas.',   // (M5 lote 12a)
    tower: '30 pisos, cada uno con un jefe fijo. Cada piso da un premio la primera vez y cada 5 pisos ganas una reliquia permanente (+6 de vida y +2% de ataque dentro de la Torre). Entre pisos eliges descanso y pactos de riesgo.',
    rifts: '8 minutos: las grietas se abren sin parar. Gana todas las peleas que puedas. +25% de monedas.',
    type: 'Solo aparecen Pokémon del tipo que elijas (y sus jefes). +50% de monedas.',
    team: 'Lleva hasta 3 Pokémon y cámbialos en plena partida. Si uno cae, entra el siguiente; los de banca se recuperan.'
  };

  let tab = 'i', gen = 1, list = [];

  function init() {
    $('lexpop-close').onclick = closeEntry;
    $('scr-lexpop').onclick = e => { if (e.target.id === 'scr-lexpop') closeEntry(); };
  }

  function open(t) {
    if (t) tab = t;
    G.UI.show('scr-lexicon', true);
    render();
  }
  const isOpen = () => G.UI.isOpen('scr-lexicon');
  const entryOpen = () => !$('scr-lexpop').classList.contains('hidden');

  // ======================= las fichas de cada pestaña =======================
  // Una ficha: { key, icon (html), sprite ({ dex, sil, shiny }), title, sub, subCol, desc, dim, facts: [[etiqueta, valor]] }

  function items(s) {
    const found = s.itemsFound || {};
    return G.Items.LIST.map(it => {
      const ok = !!found[it.id];
      return { key: 'i:' + it.id, icon: G.Icons.html(it.id, 40), title: it.name, sub: ok ? '✔ Encontrado' : 'Aún sin encontrar',
               subCol: ok ? '#8fe3b0' : '#8fa3c4', desc: it.desc, dim: !ok,
               facts: ok ? [['Encontrado el', new Date(found[it.id]).toLocaleDateString('es')]] : [] };
    });
  }

  function moves(s) {
    const out = [], evo = s.evoMoves || {};
    for (const t of Object.keys(G.U.TYPE_NAME)) {
      for (const m of G.Moves.ALL.filter(m => m.type === t)) {
        const e = G.Moves.EVO[m.id], a = G.Moves.EVO_ALT[m.id];
        let desc = m.desc;
        if (e) desc += '\nEvoluciona en: ' + e[0];
        if (a) desc += '\nEvoluciona en: ' + a[0];
        const facts = [['Tipo', T(t)]];
        if (m.dmg) facts.push(['Daño', m.dmg]);
        if (m.cd) facts.push(['Recarga', m.cd + ' s']);
        if (e) facts.push(['Evoluciona en: ' + e[0], 'Necesita: ' + G.Moves.NEED_NAME[e[1]]]);
        if (a) facts.push(['Evoluciona en: ' + a[0], 'Necesita: ' + G.Moves.NEED_NAME[a[1]]]);
        if (e || a) facts.push(['Evolucionado alguna vez', evo[m.id] ? 'Sí' : 'No']);
        out.push({ key: 'm:' + m.id, group: T(t), groupCol: G.U.TYPE_COLOR[t], icon: G.Icons.html('move:' + m.id, 36), title: m.name,
                   sub: T(t) + (evo[m.id] ? ' · ✔ Evolucionado' : ''), subCol: G.U.TYPE_COLOR[t], desc, facts });
      }
    }
    return out;
  }

  function statuses() {
    return STATUS.map(([id, name, desc]) => {
      const facts = [];
      if (G.Status.DUR[id]) facts.push(['Duración', G.Status.DUR[id] + ' s']);
      return { key: 's:' + id, icon: `<span class="lex-dot" style="background:${STATUS_COL[id]}"></span>`, title: name, sub: '', desc, facts };
    });
  }

  function abilities() {
    return G.Abilities.list().map(a => ({ key: 'a:' + a.id, icon: G.Icons.html('star', 28), title: a.name, sub: '', desc: a.desc,
      facts: [['Pokémon con esta habilidad', G.DEX.filter(p => G.Abilities.of(p.dex) === a.id).length]] }));
  }

  function zdyn(s) {
    const Z = G.ZMoves, D = G.Dynamax, st = s.stats || {};
    const out = [];
    const dn = st.dens || 0, dok = D.unlocked(s);
    // (lote 5: la ficha del Dynamax que quedó pendiente para el Léxico, menu.gd 3167-3171)
    out.push({ key: 'z:dynamax', icon: `<span class="dyn-ic${dok ? '' : ' off'}">MAX</span>`, title: 'Dynamax',
      sub: dok ? 'Desbloqueado' : `Vence una guarida Dynamax: ${Math.min(dn, 1)}/1`, subCol: '#ff7a9a', dim: !dok,
      desc: `Cada 4 minutos (desde el nivel ${D.MIN_LEVEL}): tu Pokémon se vuelve gigante ${D.DUR} s con +30% a todos sus atributos y lanza ondas Max de su tipo. Cada guarida Dynamax vencida lo recarga al instante.`,
      facts: [['Guaridas Dynamax vencidas', dn], ['Recarga', Math.round(D.COOLDOWN / 60) + ' min'], ['Desde el nivel', D.MIN_LEVEL], ['Duración', D.DUR + ' s']] });
    out.push({ key: 'z:dens', icon: G.Icons.html('crown', 32), title: 'Guaridas Dynamax',
      sub: 'Guaridas Dynamax vencidas: ' + dn, subCol: '#ff7a9a',
      desc: `A partir del minuto ${Math.round(D.DEN_FROM / 60)}, a veces una grieta se abre en rojo: es una guarida Dynamax. Dentro espera un Pokémon gigante con mucha vida que a veces lanza su Movimiento Max. Vencerlo desbloquea el Dynamax (o lo recarga al instante) y suelta experiencia, objetos, tickets y monedas. No hay guaridas en la Contrarreloj de grietas.`,
      facts: [['Probabilidad por grieta', Math.round(D.DEN_RATE * 100) + '%'], ['Tiempo para entrar', D.DEN_TTL + ' s'], ['Premio', `${D.DEN_REWARD.orbs} orbes · ${D.DEN_REWARD.items} objetos · ${D.DEN_REWARD.tickets} tickets`]] });
    for (const t of Z.ORDER) {
      const zd = Z.DEF[t], ok = Z.unlocked(t, s), k = st['tk_' + t] || 0;
      out.push({ key: 'z:' + t, icon: G.Icons.html('zc:' + t, 44), title: zd.name, subCol: G.U.TYPE_COLOR[t], dim: !ok,
        sub: T(t) + ' · ' + (ok ? 'Desbloqueado' : `Derrota ${Z.NEED} Pokémon de tipo ${T(t)}: ${Math.min(k, Z.NEED)}/${Z.NEED}`),
        desc: zd.desc, facts: [['Tipo', T(t)], ['Misión de Cristal Z', (Z.ZMIS.find(x => x.type === t) || {}).desc || '—']] });
    }
    return out;
  }

  function pokemon(s) {
    return G.DEX.filter(p => p.gen === gen && G.SPRITE_META[p.dex]).map(p => {
      const own = !!(s.owned && s.owned[p.dex]), shiny = G.DB.ownsShiny(p.dex), ab = G.Abilities.def(G.Abilities.of(p.dex));
      const sm = G.Moves.BY_ID[G.Moves.startFor(p)];
      return { key: 'p:' + p.dex, sprite: { dex: p.dex, sil: !own }, title: p.name, sub: '#' + p.dex + (own ? ' · ✔ Lo tienes' : ''),
        subCol: own ? '#8fe3b0' : '#8fa3c4', dim: !own, types: p.types, line: 'Habilidad: ' + ab.name,
        desc: ab.desc,
        facts: [['Habilidad', ab.name], ['Tipo', p.types.map(T).join(' / ')], ['Rareza', G.Gacha.RARITY_NAME[p.rarity] || p.rarity], ['Movimiento inicial', sm ? sm.name : '—'],
                ['Legendario', p.leg ? 'Sí' : 'No'], ['Lo tienes', own ? 'Sí' : 'No'], ['Shiny', shiny ? 'Sí' : 'No']] };
    });
  }

  /** Los modos con tus récords (lote 8: los de la Torre y el Rush también aquí y en la tarjeta de entrenador). */
  function modes(s) {
    const M = G.Modes, st = s.stats || {};
    const rec = {
      normal: [['Mejor tiempo', mm(st.bestTime)], ['Mejor nivel', st.bestLevel || 0], ['Partidas', n(st.runs)]],
      daily: [['Jugados', n(st.dailyPlays)], ['Mejor marca', (st.dailyBestMin || 0) + ' min']],
      rush: [['Récord de jefes', G.BossRush.best(s)], ['Partidas', n(st.rushRuns)]],
      party: [],
      coop: [['Partidas', n(st.coopRuns)], ['Compañero', (G.DEX_BY[G.LocalCoop.dex(s)] || {}).name || '—']],   // (M5 lote 12a)
      tower: [['Mejor piso', G.Tower.rec(s).best + ' / ' + G.Tower.FLOORS], ['Reliquias', G.Tower.relics(s) + ' / ' + G.Tower.RELICS_MAX], ['Arceus vencido', st.arceus ? 'Sí' : 'No'], ['Partidas', n(st.towerRuns)]],
      rifts: [['Récord de grietas', st.riftsBest || 0], ['Partidas', n(st.riftsRuns)]],
      type: [['Tipos superados', M.typeDoneCount(s) + ' / ' + M.TYPES.length], ['Mejor marca', (st.typeBestMin || 0) + ' min']],
      team: [['Mejor marca', (st.teamBestMin || 0) + ' min'], ['Partidas', n(st.teamRuns)]]
    };
    const out = M.LIST.map(id => ({ key: 'md:' + id, group: 'Modos de juego', icon: G.Icons.html(id === 'type' ? 'type:' + M.prefs(s).type : M.ICON[id], 36), title: M.NAME[id],
      sub: rec[id].length ? rec[id][0][0] + ': ' + rec[id][0][1] : 'No se guarda progreso', subCol: '#ffd23f', desc: MODE_DESC[id], facts: rec[id] }));
    for (const id of M.MOD_IDS) {
      const m = M.MOD[id];
      out.push({ key: 'md:mod_' + id, group: 'Modificadores', icon: G.Icons.html(m.icon, 32), title: m.name, sub: '+25% de monedas', subCol: '#ffd23f', desc: m.desc,
        facts: [['Mejor marca con él', (st['mb_' + id] || 0) + ' min']] });
    }
    const A = G.Adaptive;
    out.push({ key: 'md:adaptive', group: 'Dificultad', icon: G.Icons.html('up', 32), title: 'Dificultad adaptativa', sub: A.enabled() ? 'Activada' : 'Desactivada',
      subCol: A.enabled() ? '#8fe3b0' : '#8fa3c4',
      desc: 'En la partida normal, el juego empieza fácil y se pone más difícil según tus mejoras: más vida y daño, más enemigos, hordas más seguidas y más experiencia por nivel.',
      facts: [['Dónde se cambia', 'Ajustes → Gráficos']] });
    return out;
  }

  function tower(s) {
    const W = G.Tower, out = [];
    out.push({ key: 't:relics', group: 'Reliquias', icon: G.Icons.html('m_tower', 36), title: 'Reliquias', sub: W.relics(s) + ' / ' + W.RELICS_MAX, subCol: '#ffd23f',
      desc: `Cada ${W.RELIC.every} pisos superados por primera vez ganas una reliquia permanente: +${W.RELIC.hp} de vida y +${Math.round(W.RELIC.atk * 100)}% de ataque dentro de la Torre.`,
      facts: [['Mejor piso', W.rec(s).best + ' / ' + W.FLOORS], ['Piso inicial', W.startFloor(s)]] });
    for (const c of W.REST_CARDS) {
      out.push({ key: 't:rest_' + c.id, group: 'Descanso', icon: G.Icons.html(c.icon, 32), title: c.title, sub: c.tag, subCol: c.color,
        desc: c.desc || `Recuperas el ${Math.round(W.REST.heal * 100)}% de tu vida.`, facts: [] });
    }
    for (const r of W.RISKS) out.push({ key: 't:' + r.id, group: 'Pactos de riesgo', icon: G.Icons.html(r.icon, 32), title: r.name, sub: '', desc: r.desc, facts: [] });
    for (const r of W.LEGENDS) out.push({ key: 't:' + r.id, group: 'Pactos legendarios', icon: G.Icons.html(r.icon, 32), title: r.name, sub: 'Legendario', subCol: '#ffd23f', desc: r.desc, facts: [] });
    // (lote 8: el registro de jefes de la Torre, que sólo salía al perder)
    const log = W.rec(s).log.slice(-10).reverse();
    out.push({ key: 't:log', group: 'Registro de jefes', icon: G.Icons.html('trophy', 32), title: 'Registro de jefes', sub: log.length ? log.length + ' últimos' : 'Aún sin jefes',
      desc: 'Los últimos jefes de la Torre que has vencido: piso, tiempo y vida perdida.',
      facts: log.map(e => ['Piso ' + e.f + (e.name ? ' · ' + e.name : ''), e.s + ' s, -' + e.p + '%']) });
    return out;
  }

  /** Todas las fichas de una pestaña (para las pruebas también; en Pokémon, las de la generación elegida). */
  function entries(t = tab, s = G.DB.save) {
    if (t === 'i') return items(s);
    if (t === 'm') return moves(s);
    if (t === 's') return statuses();
    if (t === 'a') return abilities();
    if (t === 'z') return zdyn(s);
    if (t === 'p') return pokemon(s);
    if (t === 'md') return modes(s);
    return tower(s);
  }

  // ======================= pintar =======================

  function header(s) {
    if (tab === 'i') { const f = Object.keys(s.itemsFound || {}).filter(k => G.Items.BY[k]).length; return `Objetos: ${f} / ${G.Items.LIST.length} encontrados`; }
    if (tab === 'm') return `Movimientos: ${G.Moves.ALL.length}`;
    if (tab === 's') return 'Estados alterados';
    if (tab === 'a') return `Habilidades: ${G.Abilities.list().length}`;
    if (tab === 'z') return `Movimientos Z: ${G.ZMoves.ORDER.length}`;
    if (tab === 'p') { const o = Object.keys(s.owned || {}).filter(d => G.DEX_BY[d]).length; return `Pokémon: ${o} / ${G.DEX.length}`; }
    if (tab === 'md') return 'Modos de juego, modificadores y dificultad';
    return `Mejor piso: ${G.Tower.rec(s).best} / ${G.Tower.FLOORS}`;
  }

  function render() {
    const s = G.DB.save;
    const tabs = $('lex-tabs');
    if (!tabs.children.length) {
      tabs.innerHTML = TABS.map(([k, label]) => `<div class="tab" data-tab="${k}">${label}</div>`).join('');
      tabs.querySelectorAll('.tab').forEach(el => { el.onclick = () => { tab = el.dataset.tab; render(); }; });
    }
    tabs.querySelectorAll('.tab').forEach(el => el.classList.toggle('on', el.dataset.tab === tab));
    const box = $('lex-body');
    box.innerHTML = `<h3 class="lex-h">${esc(header(s))}</h3>`;
    if (tab === 'z') box.insertAdjacentHTML('beforeend', `<p class="sub">Se recargan cada 4 minutos, desde el nivel ${G.ZMoves.MIN_LEVEL}. Se desbloquean derrotando ${G.ZMoves.NEED} Pokémon de ese tipo.</p>`);
    if (tab === 'p') {
      const chips = document.createElement('div');
      chips.className = 'filters lex-gens';
      GEN_NAMES.forEach((name, i) => {
        const g = i + 1, b = document.createElement('button');
        const tot = G.DEX.filter(p => p.gen === g && G.SPRITE_META[p.dex]).length, have = G.DEX.filter(p => p.gen === g && s.owned && s.owned[p.dex]).length;
        b.className = 'chip' + (g === gen ? ' on' : '');
        b.dataset.gen = g;
        b.textContent = `${name} ${have}/${tot}`;
        b.onclick = () => { gen = g; render(); };
        chips.appendChild(b);
      });
      box.appendChild(chips);
    }
    list = entries(tab, s);
    let grid = null, group = null;
    list.forEach((e, i) => {
      if (!grid || e.group !== group) {
        group = e.group;
        if (group) box.insertAdjacentHTML('beforeend', `<h4 class="lex-g" style="color:${e.groupCol || 'var(--gold)'}">${esc(group)}</h4>`);
        grid = document.createElement('div');
        grid.className = 'lex-grid';
        box.appendChild(grid);
      }
      grid.appendChild(card(e, i));
    });
  }

  function card(e, i) {
    const b = document.createElement('button');
    b.className = 'lex-card' + (e.dim ? ' dim' : '');
    b.dataset.lex = e.key;
    b.dataset.sfx = 'select';
    b.innerHTML = `<span class="lex-ic">${e.icon || ''}</span><span class="lex-tx"><b>${esc(e.title)}</b>`
      + (e.sub ? `<small style="color:${e.subCol || 'var(--muted)'}">${parts(e.sub)}</small>` : '')
      + (e.types ? `<span class="lex-types">${G.UI.typeChips(e.types)}</span>` : '')
      + `<span class="lex-ds">${esc(e.line || e.desc.split('\n')[0])}</span></span>`;
    if (e.sprite) b.querySelector('.lex-ic').appendChild(G.UI.spriteCanvas(e.sprite.dex, 56, 48, { scale: 1, silhouette: e.sprite.sil }));
    b.onclick = () => openEntry(i);
    return b;
  }

  /** Abre una ficha (su índice en la pestaña, o su clave 'm:ember'). */
  function openEntry(i) {
    const e = typeof i === 'string' ? list.find(x => x.key === i) : list[i];
    if (!e) return false;
    const pop = $('lexpop-body');
    pop.dataset.key = e.key;
    pop.innerHTML = `<div class="lexpop-head"><span class="lexpop-ic">${e.icon || ''}</span><div><h2>${esc(e.title)}</h2>`
      + (e.sub ? `<div class="lexpop-sub" style="color:${e.subCol || 'var(--muted)'}">${parts(e.sub)}</div>` : '')
      + (e.types ? `<div>${G.UI.typeChips(e.types)}</div>` : '') + `</div></div>`
      + e.desc.split('\n').map(l => `<p>${esc(l)}</p>`).join('')
      + (e.facts && e.facts.length ? `<div class="lexpop-facts">${e.facts.map(([k, v]) => `<div><span>${esc(k)}</span><b>${parts(v)}</b></div>`).join('')}</div>` : '');
    if (e.sprite) pop.querySelector('.lexpop-ic').appendChild(G.UI.spriteCanvas(e.sprite.dex, 112, 96, { scale: 2, silhouette: e.sprite.sil, lively: !e.sprite.sil }));
    $('scr-lexpop').classList.remove('hidden');
    return true;
  }
  function closeEntry() { $('scr-lexpop').classList.add('hidden'); }

  /** Esc: cierra la ficha abierta; si no, vuelve al menú. */
  function back() {
    if (entryOpen()) { closeEntry(); return true; }
    return false;
  }

  return { TABS, STATUS, init, open, render, entries, openEntry, closeEntry, back, isOpen, entryOpen,
           get tab() { return tab; }, set tab(v) { tab = v; }, get gen() { return gen; }, set gen(v) { gen = v; } };
})();
