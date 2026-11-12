/* ============ play-ui.js — "Jugar": one flow for every mode (MicaSurvivor U1, Plans/MICASURVIVOR_UNIFIED_PLAN.md) ============
 * The owner (2026-11-02): "1 character picker for all modes. Then you pick between the 3 mode categories Survival, Expedition
 * (Bonk), or Dive. Then you select what variant of that mode category. Then select number of players/do local multiplayer or
 * online with friends. Then a final screen where you select a map/add run modifiers/adjust difficulty. Visually I want this
 * new UI to have the style of the Micatro UI. Make sure it stays good with controllers."
 *
 * One screen, #scr-play (css/mx.css: Micatro's look), five steps:
 *   1 Pokémon     your collection (G.DB.owns, the one unlock list: js/systems/unlocks.js), by generation. Picking one writes
 *                 save.partner (base modes) AND the Expedition League pick + starting form (G.ExpLeague.setPick(family root) /
 *                 setForm(dex)), so every mode starts as it.
 *   2 Category    Survival / Expedition / Dive.
 *   3 Variant     Survival: normal, daily, rush, party, tower, rifts, type, team. Expedition: Classic, Survival (+ the League HQ,
 *                 a side door to the old screen). Dive: route dive, weekly.
 *   4 Players     Solo / Local 2 players / Local 3-4 / Online with friends. Only what works today is enabled (U2 builds the rest):
 *                 local = the base 'coop' mode (Survival normal) or the Expedition's local partner (micasurvivorexp_mate);
 *                 online = a base lobby (always Normal) or an Expedition lobby (G.ModesUI.openExpCoop). The rest says
 *                 "Coming soon" and is aria-disabled (the pad still reaches it: pressing it says why).
 *   5 Setup       the variant's own options (modifiers, Tower start floor, type, party Pokémon, team, co-op partner; the
 *                 Expedition's map + difficulty; Dive's route + start floor; the Weekly's route + rule), then START.
 * It only WRITES the existing prefs (save.partner, save.modes.*, the Expedition picks in localStorage) and starts through
 * G.Flow.play(mode) -> G.Game.startRun -> G.Modes.plan(mode): the runs themselves don't change. Mouse, touch and pad: every
 * control is a button; one [data-back] per step (cancel / Esc go back one step, from step 1 to the menu); the current
 * choice is .on and gets the pad's focus on each step (G.Pad.focusOn), so confirm, confirm... replays your last setup.
 */
G.I18n.add({
  'Pokémon': 'Pokémon', 'Modo': 'Mode', 'Variante': 'Variant', 'Jugadores': 'Players', 'Preparación': 'Setup',
  'Cambiar Pokémon': 'Change Pokémon',
  'Elige tu Pokémon': 'Choose your Pokémon', 'Elige un modo': 'Choose a mode', 'Elige la variante': 'Choose the variant',
  '¿Cuántos jugáis?': 'How many players?', 'Prepara la partida': 'Set up the run',
  'Atrás': 'Back', 'Continuar': 'Continue', 'Variocolor: sí': 'Shiny: on', 'Variocolor: no': 'Shiny: off',
  'Tu colección: {x} / {x}': 'Your collection: {x} / {x}',
  'Lo usarás en todos los modos: Supervivencia, Expedición e Inmersión.': 'You play it in every mode: Survival, Expedition and Dive.',
  'Aún no tienes Pokémon de esta región.': 'You have no Pokémon from this region yet.',
  'Supervivencia': 'Survival', 'Expedición': 'Expedition', 'Inmersión': 'Dive',
  'La partida de siempre y sus modos: diario, jefes, torre, grietas, tipo, equipo y fiesta.': 'The classic run and its modes: daily, bosses, tower, rifts, type, team and party.',
  'Mapas con alturas, guardianes, la Liga, objetos y capturas. Gana un mapa y se abre el siguiente.': 'Maps with heights, guardians, the League, items and captures. Win a map to open the next.',
  'Baja piso a piso por 9 rutas: rescata Pokémon perdidos, vence alfas y guardianes legendarios.': 'Go down floor by floor on 9 routes: rescue lost Pokémon, beat alphas and legendary guardians.',
    'Hoy: {x} con la regla «{x}». El mismo para todos.': 'Today: {x} with the "{x}" rule. The same for everyone.',
  'Solo jefes y legendarios, cada vez más fuertes. Récord: {x}': 'Only bosses and legendaries, ever stronger. Record: {x}',
  'Cualquier Pokémon, no puedes morir y no se guarda nada.': 'Any Pokémon, you can\'t die and nothing is saved.',
  '30 pisos con su jefe, descansos y pactos. Mejor piso: {x}': '30 floors with a boss each, rests and pacts. Best floor: {x}',
  '8 minutos de grietas sin parar. Récord: {x}': '8 minutes of nonstop rifts. Record: {x}',
  'Solo aparecen Pokémon de un tipo. Superados: {x} / {x}': 'Only one type spawns. Cleared: {x} / {x}',
  'Hasta 3 Pokémon tuyos; cámbialos en plena partida.': 'Up to 3 of your Pokémon; switch them mid-run.',
  'Necesitas al menos 2 Pokémon.': 'You need at least 2 Pokémon.',
  'Clásico': 'Classic', 'Inmersión por rutas': 'Route dive', 'Inmersión semanal': 'Weekly Dive',
  '3 mapas con zonas, altares, guardianes, portal y santuario.': '3 maps with zones, altars, guardians, the portal and the shrine.',
  'Hitos cada 5 minutos, pactos, asedio y Mewtwo a medianoche. Hasta donde aguantes.': 'Milestones every 5 minutes, pacts, siege and Mewtwo at midnight. As long as you last.',
  'Elige ruta y piso inicial. Sal con la Cuerda Huida o arriésgalo todo.': 'Choose a route and start floor. Escape with the Escape Rope or risk it all.',
  'La misma para todos esta semana: {x} · {x}.': 'The same for everyone this week: {x} · {x}.',
  'Cuartel de la Liga': 'League HQ', 'Laboratorio, tareas, logros y la Liga': 'Lab, tasks, achievements and the League',
  'Solo': 'Solo', 'Tú solo.': 'Just you.', 'Local · 2 jugadores': 'Local · 2 players', 'Local · 3-4 jugadores': 'Local · 3-4 players',
  'En línea con amigos': 'Online with friends',
  'Un segundo mando mueve a tu compañero.': 'A second controller moves your partner.',
  'Tu compañero te acompaña; un segundo mando lo mueve.': 'Your partner comes along; a second controller moves it.',
  'Crea una sala e invita a tus amigos (hasta 4).': 'Create a lobby and invite your friends (up to 4).',
  'Las salas en línea juegan la partida normal, sin modificadores.': 'Online lobbies play a normal run, without modifiers.',
  'Desde el piso 1 por ahora.': 'From floor 1 for now.',
  'Próximamente': 'Coming soon',
  'Esta combinación llegará pronto.': 'This combination is coming soon.',
  'Modificadores': 'Modifiers', '+25% de monedas por cada uno.': '+25% coins each.',
  'Piso {x}': 'Floor {x}', 'Supera 5 pisos para abrir un punto de control.': 'Clear 5 floors to open a checkpoint.',
  'Punto de control': 'Checkpoint', 'Desde el principio': 'From the start',
  'Tipo': 'Type', 'Superado': 'Cleared', 'Aguanta 10 minutos para superarlo.': 'Last 10 minutes to clear it.',
  'Pokémon de la fiesta: {x}': 'Party Pokémon: {x}', 'Elegir': 'Choose', 'Equipo: {x}': 'Team: {x}', 'Elegir equipo': 'Choose team',
  'Compañero: {x}': 'Partner: {x}', 'Elegir compañero': 'Choose partner',
  'Toca un Pokémon para la fiesta': 'Tap a Pokémon for the party', 'Toca hasta 3 Pokémon tuyos para el equipo': 'Tap up to 3 of your Pokémon for the team',
  'Toca el Pokémon que será tu compañero': 'Tap the Pokémon that will be your partner', 'Hecho': 'Done',
  'Equipo: {x} / {x}': 'Team: {x} / {x}', '¡Equipo listo!': 'Team ready!',
  'El Desafío diario trae su propio Pokémon: hoy, {x}.': 'The Daily Challenge brings its own Pokémon: today, {x}.',
  'El Modo Fiesta usa el Pokémon de la fiesta.': 'Party Mode uses the party Pokémon.',
  'El Modo Equipo empieza con el primero del equipo.': 'Team Mode starts with the first of the team.',
  'Regla del día: {x}': 'Rule of the day: {x}',
  'Mapa': 'Map', 'Dificultad': 'Difficulty', 'Mapa {x} de {x}': 'Map {x} of {x}',
  'Enemigos: vida ×{x}, daño ×{x} · monedas ×{x}': 'Foes: HP ×{x}, damage ×{x} · coins ×{x}',
  'Gana {x} para abrirlo': 'Clear {x} to open it', 'Gana el mapa en {x} para abrirla': 'Win the map on {x} to open it',
  'Ruta': 'Route', 'Despierta los 8 Sellos ({x}/8)': 'Awaken the 8 Seals ({x}/8)',
  'Etapa guardada: piso {x}': 'Stage saved: floor {x}', 'Vence al guardián del piso 25 para guardar una etapa.': 'Beat the floor 25 guardian to save a stage.',
  'Ruta de la semana': 'Route of the week', 'Regla de la semana': 'Rule of the week',
  'Empiezas como {x}.': 'You start as {x}.', 'Empezar': 'Start', 'Crear sala': 'Create lobby', 'Ir a tu sala': 'Go to your lobby',
  'Bloqueado': 'Locked', 'Cargando…': 'Loading…',
  'No se pudo cargar la Expedición. Recarga la página.': 'The Expedition could not load. Reload the page.',
'Consigue otro Pokémon primero': 'Get another Pokémon first',
  'Partida normal': 'Normal run', 'Desafío diario': 'Daily Challenge', 'Rush de Jefes': 'Boss Rush', 'Modo Fiesta': 'Party Mode',
  'Torre de pisos': 'Floor Tower', 'Contrarreloj de grietas': 'Rift Time Attack', 'Modo Equipo': 'Team Mode',
  'Hasta 4 jugadores en un mismo aparato.': 'Up to 4 players on one device.', 'Teselia': 'Unova',
  // (U2: online for every variant)
  'Cada uno juega con su Pokémon; el anfitrión elige el modo.': 'Everyone plays their own Pokémon; the host picks the mode.',
  'En línea: todos los de la sala deben haber llegado a ese piso.': 'Online: everyone in the lobby must have reached that floor.',
  'No han llegado al piso {x} de esta ruta: {x}': "Haven't reached floor {x} on this route: {x}",
  'No han llegado al piso de salida de esta ruta: {x}': "Haven't reached this route's start floor: {x}",
  'Local · {x} jugadores': 'Local · {x} players',
  // (U2: local players)
  'Conecta 3 o 4 mandos': 'Connect 3 or 4 controllers', 'Un segundo mando lleva al jugador 2, con todo su equipo.': 'A second controller plays player 2, with a full kit.',
  'Sin otro mando, la IA lleva a tu compañero.': 'With no other controller, the AI plays your partner.',
  'Hasta 4 jugadores en un mismo aparato, cada uno con su mando.': 'Up to 4 players on one device, each on their own controller.',
  'Mandos de más conectados: {x}': 'Extra controllers connected: {x}', 'Toca el Pokémon del jugador {x}': "Tap player {x}'s Pokémon",
  'Pulsa A en tu mando para unirte.': 'Press A on your controller to join.', 'Mando {x}': 'Controller {x}', 'IA': 'AI', 'Jugador {x}': 'Player {x}',
  'Pulsa A en otro mando para unirte': 'Press A on another controller to join', 'Pulsa A en 2 o 3 mandos para unirlos': 'Press A on 2 or 3 controllers to join them'
});

G.PlayUI = (() => {
  const $ = id => document.getElementById(id);
  const T = s => G.I18n.t(s), F = (s, ...v) => G.I18n.f(s, ...v);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const GEN_NAMES = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Teselia', 'Kalos', 'Alola', 'Galar', 'Paldea'];
  const STEPS = ['Pokémon', 'Modo', 'Variante', 'Jugadores', 'Preparación'];
  const TITLES = ['Elige tu Pokémon', 'Elige un modo', 'Elige la variante', '¿Cuántos jugáis?', 'Prepara la partida'];
  const CATS = {
    survival: { name: 'Supervivencia', icon: 'm_horde', col: 'red', desc: 'La partida de siempre y sus modos: diario, jefes, torre, grietas, tipo, equipo y fiesta.' },
    expedition: { name: 'Expedición', icon: 'flag', col: 'blue', desc: 'Mapas con alturas, guardianes, la Liga, objetos y capturas. Gana un mapa y se abre el siguiente.' },
    dive: { name: 'Inmersión', icon: 'm_tower', col: 'green', desc: 'Baja piso a piso por 9 rutas: rescata Pokémon perdidos, vence alfas y guardianes legendarios.' }
  };
  const VARIANTS = {
    survival: ['normal', 'daily', 'rush', 'party', 'tower', 'rifts', 'type', 'team'],
    expedition: ['exp-classic', 'exp-survival'],
    dive: ['dive', 'weekly']
  };
  /** The mode G.Flow.play gets for a variant (+ players: Survival normal with a local partner is the base 'coop' mode). */
  const MODE = { dive: 'exp-dive', weekly: 'exp-dive' };
  // (U2: local players are a count on every variant, js/systems/localcoop.js setPlayers; the old 'coop' mode id stays for old
  //  saves, replays and the old screen's card, never planned here)
  const modeOf = v => MODE[v] || v;
  const catOf = v => Object.keys(VARIANTS).find(c => VARIANTS[c].includes(v)) || 'survival';
  const PLAYERS = ['solo', 'local', 'local4', 'online'];
  const LOCAL_OK = ['normal', 'daily', 'rush', 'party', 'tower', 'rifts', 'type', 'team', 'exp-classic', 'exp-survival', 'dive', 'weekly'];
  // (U2: online plays every variant: the lobby carries the host's mode and options, js/systems/modes.js coopPlan)
  const ONLINE_OK = ['normal', 'daily', 'rush', 'party', 'tower', 'rifts', 'type', 'team', 'exp-classic', 'exp-survival', 'dive', 'weekly'];
  const MOD_TXT = { glass: 'pegas y recibes ×1,5', horde: '+2 enemigos por grupo', swift: 'enemigos ×1,25 de velocidad', iron: 'enemigos ×1,4 de vida' };
  const KEY = 'micasurvivor_playflow';

  // ---------------- state (the last category / variant / players are remembered on this device: a convenience) ----------------
  const st = { step: 1, cat: 'survival', variant: 'normal', players: 'solo', gen: 1, sub: null, subGen: 1, busy: false, joined: [], usePartner: false,
               map: null, diff: null, route: null };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && VARIANTS[v.cat] && VARIANTS[v.cat].includes(v.variant)) { st.cat = v.cat; st.variant = v.variant; }
    if (v && PLAYERS.includes(v.players)) st.players = v.players;
  } catch (e) { /* a convenience */ }
  function remember() { try { localStorage.setItem(KEY, JSON.stringify({ cat: st.cat, variant: st.variant, players: st.players })); } catch (e) { /* a convenience */ } }

  const save = () => G.DB.save;
  const nameOf = d => (G.DEX_BY[d] ? G.I18n.t(G.DEX_BY[d].name) : '#' + d);
  const isOpen = () => G.UI.isOpen('scr-play');
  const loggedIn = () => !!(G.MicaAccount && G.MicaAccount.name());
  const needsExp = () => st.cat !== 'survival';

  /** Every species you can play (the unified collection), dex order. */
  function owned() {
    const s = save();
    return Object.keys((s && s.owned) || {}).map(Number).filter(d => G.DEX_BY[d] && G.SPRITE_META[d]).sort((a, b) => a - b);
  }

  // ---------------- open / close / back ----------------
  function open({ usePartner = false } = {}) {
    G.UI.chrome(false);
    G.UI.show('scr-play');
    st.usePartner = usePartner;
    st.step = usePartner ? 2 : 1; st.sub = null;
    const p = G.DEX_BY[save().partner];
    st.gen = p ? p.gen : 1;
    render();
  }
  /** Back one step (Esc, the pad's cancel, the Back button). false at step 1 (the caller goes to the menu). */
  function back() {
    if (!isOpen()) return false;
    if (st.sub) { st.sub = null; render(); return true; }
    if (st.step === 1 && st.usePartner) { go(2); return true; }
    if (st.step === 2 && st.usePartner) return false;
    if (st.step > 1) { go(st.step - 1); return true; }
    return false;
  }
  function go(step) {
    st.step = step; st.sub = null;
    if (step === 5) initSetup();
    render();
    joinWatch();
  }

  // ---------------- the Expedition: loaded only when a Expedition / Dive category is chosen ----------------
  function loadExp() {
    const X = G.Expedition;
    return X.load().then(() => G.ExpSave && G.ExpSave.open ? G.ExpSave.open() : null).then(() => { syncLeague(); return true; },
      e => { console.warn(e); G.UI.toast('No se pudo cargar la Expedición. Recarga la página.', 4000); G.Audio.sfx('error'); return false; });
  }
  /** The one character choice -> the Expedition's League pick (its family's first stage) and starting form (that species). */
  function syncLeague() {
    const L = G.ExpLeague, d = +save().partner;
    if (!L || !d) return false;
    const m = L.FAM[d];
    if (m == null || !L.setPick(m)) return false;
    L.setForm(d);
    return true;
  }

  // ---------------- rendering ----------------
  function render() {
    if (!isOpen()) return;
    const crumbs = STEPS.map((s, i) => `<li class="mx-crumb${i + 1 === st.step ? ' on' : i + 1 < st.step ? ' done' : ''}"><span class="n">${i + 1}</span>${esc(s)}</li>`).join('');
    $('mx-crumbs').innerHTML = crumbs;
    $('mx-title').textContent = TITLES[st.step - 1];
    const body = $('mx-body');
    body.innerHTML = '';
    let home = null;
    if (st.step === 1) home = renderChar(body);
    else if (st.step === 2) home = renderCats(body);
    else if (st.step === 3) home = renderVariants(body);
    else if (st.step === 4) home = renderPlayers(body);
    else home = st.sub ? renderSub(body) : renderSetup(body);
    if (home && G.Pad && G.Pad.focusOn) G.Pad.focusOn(home);
  }

  function tile(attr, id, col, icon, name, lines, dis) {
    return `<button type="button" class="mx-tile c-${col} in" ${attr}="${id}"${dis ? ' aria-disabled="true"' : ' data-sfx="confirm"'}>
      <span class="t-name">${esc(name)}</span><span class="t-ico">${G.Icons.html(icon, 48)}</span>
      <span class="t-desc">${lines.filter(Boolean).map(l => `<span>${esc(l)}</span>`).join('<br>')}</span>${dis ? `<span class="t-tag">${G.Icons.html('ban', 14)} ${esc(dis)}</span>` : ''}</button>`;
  }
  /** A refused press on an aria-disabled control: say why (the pad and touch reach it too). */
  function refuse(why) { G.UI.toast(why || 'Esta combinación llegará pronto.'); G.Audio.sfx('error'); }

  // ---- step 1: the character ----
  function gridCells(list, sel, opts = {}) {
    const s = save();
    return list.map(d => {
      const p = G.DEX_BY[d], at = opts.order ? opts.order.indexOf(d) : -1;
      return { d, html: `<span class="no">${String(d).padStart(3, '0')}</span>${at >= 0 ? `<span class="tno">${at + 1}</span>` : ''}`, name: p.name,
        on: Array.isArray(sel) ? sel.includes(d) : d === sel, shiny: !!opts.shiny && !!s.partnerShiny && G.DB.ownsShiny(d) };
    });
  }
  /** A generation-tabbed grid of `list` (cells .cell.mx-cell[data-dex]); onPick(dex); returns the .on cell (or the first). */
  function grid(box, list, sel, gen, setGen, onPick, opts = {}) {
    const gens = [...new Set(list.map(d => G.DEX_BY[d].gen))].sort((a, b) => a - b);
    if (!gens.includes(gen)) gen = gens[0] || 1;
    const tabs = document.createElement('div');
    tabs.className = 'mx-tabs gen-tabs';
    for (const g of gens) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gen-tab mx-tab' + (g === gen ? ' on' : '');
      b.dataset.gen = g;
      const n = list.filter(d => G.DEX_BY[d].gen === g).length, all = G.DEX.filter(p => p.gen === g).length;
      b.innerHTML = `<b>${esc(GEN_NAMES[g - 1] || 'Gen ' + g)}</b><small>${opts.all ? all : n + '/' + all}</small>`;
      b.onclick = () => { setGen(g); render(); };
      tabs.appendChild(b);
    }
    box.appendChild(tabs);
    const gr = document.createElement('div');
    gr.className = 'mx-grid';
    let home = null;
    for (const c of gridCells(list.filter(d => G.DEX_BY[d].gen === gen), sel, opts)) {
      const cell = document.createElement('div');
      cell.className = 'cell mx-cell' + (c.on ? ' on' : '');
      cell.dataset.dex = c.d;
      cell.dataset.sfx = 'confirm';
      cell.innerHTML = c.html;
      cell.appendChild(G.UI.spriteCanvas(c.d, 92, 80, { scale: 2, shadow: true, shiny: c.shiny }));
      cell.insertAdjacentHTML('beforeend', `<b>${esc(c.name)}</b>`);
      cell.onclick = () => onPick(c.d);
      gr.appendChild(cell);
      if (c.on && !home) home = cell;
    }
    if (!gr.children.length) gr.innerHTML = `<div class="mx-empty">${esc(T('Aún no tienes Pokémon de esta región.'))}</div>`;
    box.appendChild(gr);
    return home || gr.querySelector('.mx-cell') || tabs.querySelector('.on');
  }
  function hero(box, d, opts = {}) {
    const p = G.DEX_BY[d], s = save();
    if (!p) return;
    const shiny = !!s.partnerShiny && G.DB.ownsShiny(d) && !opts.noShiny;
    const cv = document.createElement('canvas');
    cv.width = 200; cv.height = 160;
    box.appendChild(cv);
    G.UI.sprite(cv, d, { lively: true, scale: 3, hero: true, shiny });
    box.insertAdjacentHTML('beforeend', `<div class="nm">${esc(nameOf(d))}${shiny ? ' ' + G.Icons.html('shiny', 20) : ''}</div><div>${G.UI.typeChips(p.types)}</div>`);
  }
  function renderChar(body) {
    const s = save(), mine = owned();
    const wrap = document.createElement('div');
    wrap.className = 'mx-char';
    const left = document.createElement('div');
    left.className = 'mx-panel mx-hero in';
    hero(left, s.partner);
    if (G.DB.ownsShiny(s.partner)) {
      left.insertAdjacentHTML('beforeend', `<button type="button" class="mx-btn small purple" id="mx-shiny">${esc(s.partnerShiny ? 'Variocolor: sí' : 'Variocolor: no')}</button>`);
    }
    left.insertAdjacentHTML('beforeend', `<button type="button" class="mx-btn blue" id="mx-next" data-sfx="confirm">${esc(T('Continuar'))}</button>
      <div class="mx-note">${esc(F('Tu colección: {x} / {x}', mine.length, G.DEX.length))}</div>
      <div class="mx-note">${esc(T('Lo usarás en todos los modos: Supervivencia, Expedición e Inmersión.'))}</div>`);
    const right = document.createElement('div');
    right.className = 'mx-panel mx-grid-box in';
    wrap.append(left, right);
    body.appendChild(wrap);
    const home = grid(right, mine, +s.partner, st.gen, g => { st.gen = g; }, pickChar);
    if ($('mx-shiny')) $('mx-shiny').onclick = () => { s.partnerShiny = !s.partnerShiny; G.DB.commit(); G.Audio.sfx('confirm'); refocusAfter('#mx-shiny'); };
    // (Continue keeps the partner as it is, even a save without one: the run picks as it always did)
    $('mx-next').onclick = () => { if (G.ExpLeague) syncLeague(); go(2); };
    return home;
  }
  /** Step 1's choice: the partner for every mode. */
  function pickChar(d) {
    const s = save();
    if (!G.DB.owns(d) || !G.DEX_BY[d]) { G.Audio.sfx('error'); return; }
    if (s.partner !== d) {
      s.partnerShiny = !!s.partnerShiny && G.DB.ownsShiny(d);
      s.partner = d;
      G.DB.commit();
    }
    if (G.ExpLeague) syncLeague();
    go(2);
  }

  // ---- step 2: the category ----
  function renderCats(body) {
    if (st.usePartner) {
      const selected = document.createElement('div');
      selected.className = 'mx-selected-partner';
      selected.innerHTML = `<span>${esc(nameOf(save().partner))}</span><button type="button" id="mx-change-character" class="mx-btn small blue">${esc(T('Cambiar Pokémon'))}</button>`;
      selected.querySelector('button').onclick = () => go(1);
      body.appendChild(selected);
    }
    const box = document.createElement('div');
    box.className = 'mx-tiles big';
    box.innerHTML = Object.keys(CATS).map(c => tile('data-cat', c, CATS[c].col, CATS[c].icon, CATS[c].name, [CATS[c].desc], null)).join('');
    body.appendChild(box);
    box.querySelectorAll('[data-cat]').forEach(b => {
      b.classList.toggle('on', b.dataset.cat === st.cat);
      b.onclick = () => pickCat(b.dataset.cat);
    });
    return box.querySelector('.on');
  }
  function pickCat(c) {
    if (st.busy || !CATS[c]) return;
    if (st.cat !== c) { st.cat = c; st.variant = VARIANTS[c][0]; }
    remember();
    if (c === 'survival') { go(3); return; }
    st.busy = true;
    loadExp().then(ok => { st.busy = false; if (ok && isOpen() && st.step === 2) go(3); });
  }

  // ---- step 3: the variant ----
  function variantInfo(v) {
    const s = save(), M = G.Modes, X = G.Expedition, sts = s.stats || {};
    if (v === 'normal') return { name: M.NAME.normal, icon: M.ICON.normal, col: 'blue', lines: ['La experiencia de siempre, igual que el juego original.'] };
    if (v === 'daily') { const sd = M.dailySeed(); return { name: M.NAME.daily, icon: M.ICON.daily, col: 'orange', lines: [F('Hoy: {x} con la regla «{x}». El mismo para todos.', nameOf(M.dailyDex(sd)), T(M.MOD[M.dailyMod(sd)].name))] }; }
    if (v === 'rush') return { name: M.NAME.rush, icon: M.ICON.rush, col: 'red', lines: [F('Solo jefes y legendarios, cada vez más fuertes. Récord: {x}', G.BossRush.best(s))] };
    if (v === 'party') return { name: M.NAME.party, icon: M.ICON.party, col: 'purple', lines: ['Cualquier Pokémon, no puedes morir y no se guarda nada.'] };
    if (v === 'tower') return { name: M.NAME.tower, icon: M.ICON.tower, col: 'grey', lines: [F('30 pisos con su jefe, descansos y pactos. Mejor piso: {x}', G.Tower.rec(s).best)] };
    if (v === 'rifts') return { name: M.NAME.rifts, icon: M.ICON.rifts, col: 'purple', lines: [F('8 minutos de grietas sin parar. Récord: {x}', sts.riftsBest || 0)] };
    if (v === 'type') return { name: M.NAME.type, icon: 'type:' + M.prefs(s).type, col: 'orange', lines: [F('Solo aparecen Pokémon de un tipo. Superados: {x} / {x}', M.typeDoneCount(s), M.TYPES.length)] };
    if (v === 'team') return { name: M.NAME.team, icon: M.ICON.team, col: 'green', lines: ['Hasta 3 Pokémon tuyos; cámbialos en plena partida.'], dis: G.Team.unlocked(s) ? null : 'Necesitas al menos 2 Pokémon.' };
    if (v === 'exp-classic') return { name: 'Clásico', icon: X.ICON['exp-classic'], col: 'blue', lines: ['3 mapas con zonas, altares, guardianes, portal y santuario.'], dis: X.enabled(v) ? null : 'Próximamente' };
    if (v === 'exp-survival') return { name: 'Supervivencia', icon: X.ICON['exp-survival'], col: 'red', lines: ['Hitos cada 5 minutos, pactos, asedio y Mewtwo a medianoche. Hasta donde aguantes.'], dis: X.enabled(v) ? null : 'Próximamente' };
    if (v === 'dive') return { name: 'Inmersión por rutas', icon: 'm_tower', col: 'green', lines: ['Elige ruta y piso inicial. Sal con la Cuerda Huida o arriésgalo todo.'], dis: X.enabled('exp-dive') ? null : 'Próximamente' };
    if (v === 'weekly') { const w = X.diveWeekly(); return { name: 'Inmersión semanal', icon: 'm_daily', col: 'orange', lines: [F('La misma para todos esta semana: {x} · {x}.', T(X.DIVE_NAME[w.route]), T((G.ExpDive && G.ExpDive.MOD_NAME[w.mod]) || w.mod))], dis: X.enabled('exp-dive') ? null : 'Próximamente' }; }
    return { name: v, icon: 'flag', col: 'grey', lines: [] };
  }
  function renderVariants(body) {
    const list = VARIANTS[st.cat];
    const box = document.createElement('div');
    box.className = 'mx-tiles n' + list.length + (list.length === 8 ? ' n4' : '');
    box.innerHTML = list.map(v => { const i = variantInfo(v); return tile('data-var', v, i.col, i.icon, T(i.name), i.lines.map(T), i.dis ? T(i.dis) : null); }).join('');
    body.appendChild(box);
    box.querySelectorAll('[data-var]').forEach(b => {
      b.classList.toggle('on', b.dataset.var === st.variant);
      b.onclick = () => {
        if (b.getAttribute('aria-disabled') === 'true') { refuse(variantInfo(b.dataset.var).dis); return; }
        st.variant = b.dataset.var; remember(); go(4);
      };
    });
    if (st.cat === 'expedition') {
      const side = document.createElement('div');
      side.className = 'mx-side in';
      side.innerHTML = `<button type="button" class="mx-btn purple" id="mx-hq">${G.Icons.html('star', 18)} ${esc(T('Cuartel de la Liga'))} · <span>${esc(T('Laboratorio, tareas, logros y la Liga'))}</span></button>`;
      body.appendChild(side);
      $('mx-hq').onclick = () => G.ModesUI.openLeagueMode();
    }
    return box.querySelector('.on:not([aria-disabled=true])') || box.querySelector('[data-var]:not([aria-disabled=true])');
  }

  // ---- step 4: players ----
  /** {solo, local, local4, online}: null when it works for this variant, else why not. */
  function playersOf(v = st.variant) {
    return {
      solo: null,
      local: LOCAL_OK.includes(v) ? null : 'Próximamente',
      local4: !LOCAL_OK.includes(v) ? 'Próximamente' : padsOther() >= 2 ? null : 'Conecta 3 o 4 mandos',
      online: !ONLINE_OK.includes(v) ? 'Próximamente' : loggedIn() ? null : 'Inicia sesión para jugar con amigos'
    };
  }
  function renderPlayers(body) {
    const why = playersOf(), base = st.cat === 'survival';
    const P = {
      solo: ['Solo', 'ball', 'blue', ['Tú solo.']],
      local: ['Local · 2 jugadores', 'm_coop', 'green', [padsOther() ? 'Un segundo mando lleva al jugador 2, con todo su equipo.' : 'Sin otro mando, la IA lleva a tu compañero.']],
      local4: ['Local · 3-4 jugadores', 'm_coop', 'purple', ['Hasta 4 jugadores en un mismo aparato, cada uno con su mando.', F('Mandos de más conectados: {x}', padsOther())]],
      online: ['En línea con amigos', 'friends', 'orange', ['Crea una sala e invita a tus amigos (hasta 4).', 'Cada uno juega con su Pokémon; el anfitrión elige el modo.']]
    };
    const box = document.createElement('div');
    box.className = 'mx-tiles n4';
    box.innerHTML = PLAYERS.map(k => tile('data-players', k, P[k][2], P[k][1], T(P[k][0]), P[k][3].filter(Boolean).map(T), why[k] ? T(why[k]) : null)).join('');
    body.appendChild(box);
    if (why[st.players]) st.players = 'solo';
    box.querySelectorAll('[data-players]').forEach(b => {
      b.classList.toggle('on', b.dataset.players === st.players);
      b.onclick = () => {
        const w = playersOf()[b.dataset.players];
        if (w) { refuse(T(w)); return; }
        st.players = b.dataset.players; remember(); go(5);
      };
    });
    return box.querySelector('.on');
  }

  // ---- step 5: setup ----
  /** A Micatro new-run carousel row: ‹ [label / name / desc / dots] ›. */
  function carousel(id, label, name, desc, i, n, locked, lockTxt) {
    const dots = Array.from({ length: n }, (_, k) => `<span${k === i ? ' class="on"' : ''}>●</span>`).join('');
    return `<div class="mx-nr${locked ? ' locked' : ''} in" data-row="${id}">
      <button type="button" class="mx-btn red mx-arrow" data-car="${id}" data-d="-1" aria-label="${esc(T('Atrás'))}">‹</button>
      <div class="mx-nr-info"><div class="mx-nr-k">${esc(T(label))}</div><div class="mx-nr-name">${locked ? G.Icons.html('ban', 16) + ' ' : ''}${esc(name)}</div>
        ${desc ? `<div class="mx-nr-desc">${esc(desc)}</div>` : ''}${locked && lockTxt ? `<div class="mx-nr-desc lock">${esc(lockTxt)}</div>` : ''}<div class="mx-nr-dots">${dots}</div></div>
      <button type="button" class="mx-btn red mx-arrow" data-car="${id}" data-d="1" aria-label="${esc(T('Continuar'))}">›</button></div>`;
  }
  const wrapI = (i, n) => ((i % n) + n) % n;

  /** What START would do now: { mode, ok, why }. */
  function plan() {
    const v = st.variant, mode = modeOf(v, st.players), X = G.Expedition;
    const pw = playersOf(v)[st.players];
    if (pw) return { mode, ok: false, why: pw };
    if (v === 'team' && !G.Team.unlocked()) return { mode, ok: false, why: 'Consigue otro Pokémon primero' };
    if (st.players === 'local4' && st.joined.length < 2) return { mode, ok: false, why: 'Pulsa A en 2 o 3 mandos para unirlos' };
    if (v === 'exp-classic' || v === 'exp-survival') {
      if (!G.ExpTier) return { mode, ok: false, why: 'Cargando…' };
      if (!G.ExpTier.isOpen(st.map, st.diff)) return { mode, ok: false, why: 'Bloqueado' };
    }
    if (v === 'dive') {
      if (!G.ExpDive) return { mode, ok: false, why: 'Cargando…' };
      if (!G.ExpDive.routeOpen(st.route)) return { mode, ok: false, why: 'Bloqueado' };
    }
    if (X.isExp(mode) && !X.enabled(mode)) return { mode, ok: false, why: 'Próximamente' };
    return { mode, ok: true, why: null };
  }

  function renderSetup(body) {
    const s = save(), v = st.variant, M = G.Modes, X = G.Expedition, p = M.prefs(s), online = st.players === 'online';
    const wrap = document.createElement('div');
    wrap.className = 'mx-setup';
    // the summary: who you play, what, with whom
    const sum = document.createElement('div');
    sum.className = 'mx-panel mx-sum in';
    const notes = [];
    let who = +s.partner;
    if (v === 'daily') { const sd = M.dailySeed(); who = M.dailyDex(sd); notes.push(F('El Desafío diario trae su propio Pokémon: hoy, {x}.', nameOf(who)), F('Regla del día: {x}', T(M.MOD[M.dailyMod(sd)].name))); }
    else if (v === 'party') { who = p.party; notes.push(T('El Modo Fiesta usa el Pokémon de la fiesta.')); }
    else if (v === 'team') { who = G.Team.list(s)[0] || who; notes.push(T('El Modo Equipo empieza con el primero del equipo.')); }
    else if (needsExp() && G.ExpLeague) { who = G.ExpLeague.formFor(G.ExpLeague.pickFor()); notes.push(F('Empiezas como {x}.', nameOf(who))); }
    hero(sum, who, { noShiny: v === 'daily' || v === 'party' });
    const P = { solo: 'Solo', local: 'Local · 2 jugadores', local4: 'Local · 3-4 jugadores', online: 'En línea con amigos' };
    sum.insertAdjacentHTML('beforeend', `<div class="line">${esc(T(CATS[st.cat].name))} · ${esc(T(variantInfo(v).name))}</div><div class="line">${esc(T(P[st.players]))}</div>`
      + notes.map(n => `<div class="mx-note">${esc(n)}</div>`).join(''));
    // the options
    const opts = document.createElement('div');
    opts.className = 'mx-panel mx-opts';
    let html = '';
    if (st.cat === 'survival') {
      if (v === 'tower') {
        const cps = G.Tower.checkpoints(s), cur = G.Tower.startFloor(s), i = Math.max(0, cps.indexOf(cur));
        html += carousel('tower', 'Piso inicial', F('Piso {x}', cur), cur === 1 ? T('Desde el principio') : T('Punto de control'), i, cps.length, false)
          + (cps.length < 2 ? `<div class="mx-note">${esc(T('Supera 5 pisos para abrir un punto de control.'))}</div>` : '');
      }
      if (v === 'type') {
        const i = M.TYPES.indexOf(p.type), done = !!(s.typeDone && s.typeDone[p.type]);
        html += carousel('type', 'Tipo', T(G.U.TYPE_NAME[p.type]), done ? T('Superado') : T('Aguanta 10 minutos para superarlo.'), i, M.TYPES.length, false);
      }
      if (v === 'party') html += `<div class="mx-row in"><span class="grow">${esc(F('Pokémon de la fiesta: {x}', nameOf(p.party)))}</span><button type="button" class="mx-btn blue" id="mx-sub-party">${esc(T('Elegir'))}</button></div>`;
      if (v === 'team') html += `<div class="mx-row in"><span class="grow">${esc(F('Equipo: {x}', G.Team.list(s).map(nameOf).join(', ')))}</span><button type="button" class="mx-btn blue" id="mx-sub-team">${esc(T('Elegir equipo'))}</button></div>`;
      if (v !== 'daily' && v !== 'party') {
        html += `<div class="in"><h3 class="mx-h">${esc(T('Modificadores'))} <span class="mx-note mx-money">${esc(T('+25% de monedas por cada uno.'))}</span></h3><div class="mx-mods">`
          + M.MOD_IDS.map(id => { const on = p.mods.includes(id), m = M.MOD[id]; return `<button type="button" class="mx-mod${on ? ' on' : ''}" data-mod="${id}" aria-pressed="${on}" data-sfx="select">${G.Icons.html(m.icon, 24)}<span class="m-t"><b>${esc(T(m.name))}</b><small>${esc(T(m.desc))}</small></span><span class="m-sw">${esc(T(on ? 'Sí' : 'No'))}</span></button>`; }).join('')
          + '</div></div>';
      }
    } else if (v === 'exp-classic' || v === 'exp-survival') {
      const R = G.ExpTier, maps = R.MAP_ORDER, mi = Math.max(0, maps.indexOf(st.map)), di = Math.max(0, R.DIFFS.indexOf(st.diff));
      const mOpen = R.mapOpen(st.map), dOpen = R.isOpen(st.map, st.diff), tr = R.K.TIERS[st.diff];
      const pv = R.prevMap(st.map);
      html += carousel('map', 'Mapa', T(R.MAP_NAME[st.map]), F('Mapa {x} de {x}', mi + 1, maps.length), mi, maps.length, !mOpen,
        R.playable().includes(st.map) && pv ? F('Gana {x} para abrirlo', T(R.MAP_NAME[pv])) : T('Próximamente'));
      html += carousel('diff', 'Dificultad', T(R.DIFF_NAME[st.diff]), F('Enemigos: vida ×{x}, daño ×{x} · monedas ×{x}', tr.hp, tr.dmg, tr.pay), di, R.DIFFS.length, mOpen && !dOpen,
        di > 0 ? F('Gana el mapa en {x} para abrirla', T(R.DIFF_NAME[R.DIFFS[di - 1]])) : '');
    } else if (v === 'dive') {
      const D = G.ExpDive, routes = X.DIVE_ROUTES, ri = Math.max(0, routes.indexOf(st.route)), open1 = D.routeOpen(st.route);
      const types = G.DiveGen.ROUTES[st.route].types.map(t => T(G.U.TYPE_NAME[t] || t)).join(' · ');
      const best = D.bestOf(st.route), stage = D.stageOf(st.route);
      html += carousel('route', 'Ruta', T(X.DIVE_NAME[st.route]), types + (open1 && best ? ' · ' + F('Récord: piso {x}', best) : '') + (D.sealOf(st.route) ? ' · ' + T('Sello despierto') : ''), ri, routes.length, !open1, F('Despierta los 8 Sellos ({x}/8)', D.seals()));
      if (open1) {
        const sts = D.starts(st.route), cur = sts.includes(X.diveStart()) ? X.diveStart() : 1, si = sts.indexOf(cur);
        html += carousel('start', 'Piso inicial', F('Piso {x}', cur), stage ? F('Etapa guardada: piso {x}', stage) : T('Vence al guardián del piso 25 para guardar una etapa.'), si, sts.length, false);
        if (online && cur > 1) html += `<div class="mx-note in">${esc(T('En línea: todos los de la sala deben haber llegado a ese piso.'))}</div>`;
      }
    } else if (v === 'weekly') {
      const w = X.diveWeekly();
      html += `<div class="mx-row in"><span class="grow">${esc(T('Ruta de la semana'))}: <b>${esc(T(X.DIVE_NAME[w.route]))}</b></span></div>`
        + `<div class="mx-row in"><span class="grow">${esc(T('Regla de la semana'))}: <b>${esc(T(G.ExpDive.MOD_NAME[w.mod]))}</b> (${esc(T(MOD_TXT[w.mod]))})</span></div>`;
    }
    if (isLocal()) html += joinRows();
    const pl = plan();
    html += `<div class="mx-go in"><span class="mx-note attn">${pl.ok ? '' : esc(T(pl.why))}</span>
      <button type="button" class="mx-btn big orange" id="mx-start"${pl.ok ? ' data-sfx="confirm"' : ' aria-disabled="true"'}>${esc(T(online ? (G.Social.room ? 'Ir a tu sala' : 'Crear sala') : 'Empezar'))}</button></div>`;
    opts.innerHTML = html;
    wrap.append(sum, opts);
    body.appendChild(wrap);
    // wiring
    opts.querySelectorAll('[data-car]').forEach(b => { b.onclick = () => turn(b.dataset.car, +b.dataset.d); });
    opts.querySelectorAll('[data-mod]').forEach(b => { b.onclick = () => { M.toggleMod(b.dataset.mod); refocusAfter(`[data-mod="${b.dataset.mod}"]`); }; });
    if ($('mx-sub-party')) $('mx-sub-party').onclick = () => openSub('party');
    if ($('mx-sub-team')) $('mx-sub-team').onclick = () => openSub('team');
    opts.querySelectorAll('[data-sub-coop]').forEach(b => { b.onclick = () => openSub('coop' + b.dataset.subCoop); });
    $('mx-start').onclick = start;
    return $('mx-start').getAttribute('aria-disabled') === 'true' ? opts.querySelector('.mx-arrow') || $('mx-start') : $('mx-start');
  }
  /** Re-render and keep the pad's focus on the same control (found again by its selector). */
  function refocusAfter(sel) {
    render();
    const el = sel && document.querySelector('#scr-play ' + sel);
    if (el && G.Pad && G.Pad.focusOn) G.Pad.focusOn(el);
    if (el && el.closest('.mx-nr')) el.closest('.mx-nr').querySelector('.mx-nr-info').classList.add('bump');
  }
  /** A carousel arrow: the next / previous map, difficulty, route, start floor, Tower floor or type. */
  function turn(id, d) {
    const s = save(), M = G.Modes, X = G.Expedition;
    if (id === 'tower') {
      const cps = G.Tower.checkpoints(s);
      if (cps.length > 1) { M.prefs(s).towerStart = cps[wrapI(cps.indexOf(G.Tower.startFloor(s)) + d, cps.length)]; G.DB.commit(); }
    } else if (id === 'type') {
      const p = M.prefs(s);
      p.type = M.TYPES[wrapI(M.TYPES.indexOf(p.type) + d, M.TYPES.length)];
      G.DB.commit();
    } else if (id === 'map' || id === 'diff') {
      const R = G.ExpTier;
      if (id === 'map') {
        st.map = R.MAP_ORDER[wrapI(R.MAP_ORDER.indexOf(st.map) + d, R.MAP_ORDER.length)];
        if (R.mapOpen(st.map) && !R.isOpen(st.map, st.diff)) st.diff = R.DIFFS[R.unlocked(st.map)];
      } else st.diff = R.DIFFS[wrapI(R.DIFFS.indexOf(st.diff) + d, R.DIFFS.length)];
      R.setPick(st.map, st.diff);   // (refused while locked: the saved pick stays the last open one)
    } else if (id === 'route') {
      st.route = X.DIVE_ROUTES[wrapI(X.DIVE_ROUTES.indexOf(st.route) + d, X.DIVE_ROUTES.length)];
      if (G.ExpDive.routeOpen(st.route)) { X.diveRoute(st.route); if (!G.ExpDive.starts(st.route).includes(X.diveStart())) X.diveStart(1); }
    } else if (id === 'start') {
      const sts = G.ExpDive.starts(st.route), cur = sts.includes(X.diveStart()) ? X.diveStart() : 1;
      X.diveStart(sts[wrapI(sts.indexOf(cur) + d, sts.length)]);
    }
    G.Audio.sfx('select');
    refocusAfter(`[data-car="${id}"][data-d="${d}"]`);
  }

  // ---- the sub pickers on the setup step: party Pokémon (any), team (yours, up to 3), co-op partner (yours) ----
  function openSub(kind) {
    if (kind === 'team') G.Team.pickStart();   // (as the old picker: the team starts from scratch)
    const cur = kind === 'party' ? G.Modes.prefs().party : /^coop/.test(kind) ? G.LocalCoop.dex(save(), save().partner, coopN(kind)) : save().partner;
    st.sub = kind; st.subGen = (G.DEX_BY[cur] || { gen: 1 }).gen;
    render();
  }
  function renderSub(body) {
    const kind = st.sub;
    const box = document.createElement('div');
    box.className = 'mx-panel mx-pick in';
    const head = /^coop/.test(kind) ? F('Toca el Pokémon del jugador {x}', coopN(kind)) : { party: 'Toca un Pokémon para la fiesta', team: 'Toca hasta 3 Pokémon tuyos para el equipo' }[kind];
    const team = kind === 'team' ? G.Team.picked() : null;
    box.innerHTML = `<div class="mx-row"><span class="grow">${esc(T(head))}${team ? ' · ' + esc(F('Equipo: {x} / {x}', team.length, G.Team.MAX)) : ''}</span>${kind === 'team' ? `<button type="button" class="mx-btn green" id="mx-sub-done">${esc(T('Hecho'))}</button>` : ''}</div>`;
    body.appendChild(box);
    let list, sel, onPick;
    if (kind === 'party') {
      list = G.DEX.filter(p => G.SPRITE_META[p.dex]).map(p => p.dex); sel = G.Modes.prefs().party;
      onPick = d => { G.Modes.setParty(d); st.sub = null; render(); };
    } else if (/^coop/.test(kind)) {
      const n = coopN(kind);
      list = G.LocalCoop.owned().slice().sort((a, b) => a - b); sel = G.LocalCoop.dex(save(), save().partner, n);
      onPick = d => { if (!G.LocalCoop.pick(d, n)) { G.Audio.sfx('error'); return; } st.sub = null; render(); joinWatch(); };
    } else {
      list = G.Team.owned().slice().sort((a, b) => a - b); sel = team;
      onPick = d => {
        const tm = G.Team.toggle(d);
        if (tm.length >= G.Team.MAX) { G.UI.toast('¡Equipo listo!'); st.sub = null; render(); return; }
        refocusAfter('[data-dex="' + d + '"]');
      };
    }
    const home = grid(box, list, sel, st.subGen, g => { st.subGen = g; }, onPick, { all: kind === 'party', order: team, shiny: kind !== 'party' });
    if ($('mx-sub-done')) $('mx-sub-done').onclick = () => { st.sub = null; render(); };
    return home;
  }

  // ---------------- 3D Expedition (micasurvivor/m3d/): the way in, behind a switch ----------------
  // Owner, 2026-11-12: the 2D Expedition stays what players get until the 3D one is complete. Until then the 3D one is
  // reached from here only on a browser that asked for it: /micasurvivor/?exp3d=1 turns the switch on (this browser
  // only), ?exp3d=0 off. With it on, START on Expedition · Classic or Survival, playing alone, opens the 3D page with
  // the same choices (your League member, the map, the tier). Local and online play stay 2D: the 3D one has neither.
  const X3D_KEY = 'micasurvivor_exp3d';
  try { const m = /[?&]exp3d=([01])\b/.exec(location.search); if (m) { if (m[1] === '1') localStorage.setItem(X3D_KEY, '1'); else localStorage.removeItem(X3D_KEY); } } catch (e) { /* a convenience */ }
  const exp3d = () => { try { return localStorage.getItem(X3D_KEY) === '1'; } catch (e) { return false; } };
  /** The 3D page's address for this setup, or null when this run is a 2D one. */
  function exp3dUrl(mode) {
    if (!exp3d() || st.players !== 'solo' || (mode !== 'exp-classic' && mode !== 'exp-survival') || st.variant !== mode) return null;
    const L = G.ExpLeague, dex = L && L.pickFor ? L.pickFor() : 0;
    if (!dex) return null;
    let seed = 1; try { const a = new Uint32Array(1); crypto.getRandomValues(a); seed = (a[0] % 2147483646) + 1; } catch (e) { seed = (Date.now() % 2147483646) + 1; }
    const form = L.formFor ? L.formFor(dex) : dex;   // (the form you chose to start as, if it is a later stage)
    return '/micasurvivor/m3d/?exp=' + seed + '&map=' + encodeURIComponent(st.map) + '&diff=' + encodeURIComponent(st.diff) + '&dex=' + dex + (form && form !== dex ? '&form=' + form : '') + (mode === 'exp-survival' ? '&mode=survival' : '');
  }

  // ---------------- START ----------------
  function start() {
    const pl = plan(), v = st.variant, X = G.Expedition;
    if (!pl.ok) { refuse(T(pl.why || 'Esta combinación llegará pronto.')); return Promise.resolve(false); }
    const mode = pl.mode;
    if (st.players === 'online') return startOnline(mode);
    if (G.Social.room) { G.LobbyUI.open(); return Promise.resolve(false); }   // (in a lobby: its run, as the old screen did)
    // (U2: how many play on this device: players 2-4 with full kits, on the pads that joined; 1 = solo)
    G.LocalCoop.setPlayers(localCount(), st.joined.slice());
    if (X.isExp(mode)) {
      try { localStorage.setItem('micasurvivorexp_mate', '0'); } catch (e) { /* a convenience (U2: the old local partner is off: the players count instead) */ }
      syncLeague();
      if (v === 'weekly') X.playWeekly();
      const url3 = exp3dUrl(mode);   // (the switch: this run is the 3D one)
      if (url3) { if (G.DB && G.DB.flush) G.DB.flush(); location.assign(url3); return Promise.resolve(true); }
    }
    return Promise.resolve(G.Flow.play(mode)).then(r => r !== false);
  }
  /** U2: what an online lobby of this setup carries: {mode?, map?, diff?, bmode?, opts}. */
  function lobbyOpts(mode) {
    const v = st.variant, X = G.Expedition;
    if (!X.isExp(mode)) return G.Modes.lobbyCfg(mode);
    if (v === 'weekly') { const w = X.diveWeekly(); return { mode, map: 'dive:' + w.route, diff: 'normal', opts: { weekly: w.week } }; }
    if (v === 'dive') { const sts = G.ExpDive ? G.ExpDive.starts(st.route) : [1], s0 = X.diveStart(); return { mode, map: 'dive:' + st.route, diff: 'normal', opts: { start: sts.includes(s0) ? s0 : 1 } }; }
    return { mode, map: st.map, diff: st.diff, opts: {} };
  }
  async function startOnline(mode) {
    if (!loggedIn()) { refuse(T('Inicia sesión para jugar con amigos')); return false; }
    const X = G.Expedition, exp = X.isExp(mode), o = lobbyOpts(mode), R = G.Social.room;
    if (exp) syncLeague();
    if (R) {
      // your lobby: the host's new pick replaces what it plays (same kind: base, or the same Expedition mode)
      const same = exp ? R.mode === mode : !R.mode;
      if (R.isHost && R.cv && same) {
        const r = await G.Social.setCfg(exp ? { opts: o.opts, map: o.map } : { bmode: o.bmode, opts: o.opts });
        if (!r.ok && r.error) G.UI.toast(r.error, 3000);
      } else if (!same && R.isHost) { refuse(T('Sal de tu sala antes de crear otra.')); return false; }
      G.LobbyUI.open();
      return true;
    }
    const room = await G.Social.createRoom(o);
    if (!room) { refuse(T('No se pudo crear la sala.')); return false; }
    G.LobbyUI.open();
    return true;
  }

  // ---------------- U2: local players (2-4 pads): the join rows on the setup step ----------------
  function padsOther() { return G.Pad && G.Pad.others ? G.Pad.others().length : 0; }
  const isLocal = () => st.players === 'local' || st.players === 'local4';
  const coopN = kind => +(kind.slice(4) || 2) || 2;
  /** Players this run: Local 2 = you + one partner (a pad that joined, else the AI); Local 3-4 = you + every pad that joined. */
  const localCount = () => (st.players === 'local' ? 2 : st.players === 'local4' ? 1 + Math.min(3, st.joined.length) : 1);
  function joinRows() {
    const s = save(), max = st.players === 'local' ? 2 : 4, taken = [+s.partner];
    let html = `<div class="in"><h3 class="mx-h">${esc(T('Jugadores'))} <span class="mx-note">${esc(T('Pulsa A en tu mando para unirte.'))}</span></h3><div class="mx-join">`;
    for (let n = 2; n <= max; n++) {
      const idx = st.joined[n - 2], d = G.LocalCoop.dex(s, s.partner, n, taken);
      taken.push(d);
      const who = idx != null ? F('Mando {x}', idx + 1) : n === 2 && st.players === 'local' ? T('IA') : null;
      html += `<div class="mx-row mx-joinrow${who ? ' on' : ''}" data-join="${n}"><span class="grow"><b style="color:${G.LocalCoop.COLORS[n - 1]}">${esc(F('Jugador {x}', n))}</b> · ${who ? esc(who) + ' · ' + esc(nameOf(d)) : esc(T('Pulsa A en otro mando para unirte'))}</span>`
        + (who ? `<button type="button" class="mx-btn blue small" data-sub-coop="${n}">${esc(T('Elegir'))}</button>` : '') + '</div>';
    }
    return html + '</div></div>';
  }
  /** While the setup of a local run is open: a press of A / B on a pad that isn't player 1's joins it (unplugged: it leaves). */
  let joinTimer = null;
  const prevBtn = new Map();
  function joinWatch() {
    const on = isOpen() && st.step === 5 && !st.sub && isLocal();
    if (!on) { if (joinTimer) { clearInterval(joinTimer); joinTimer = null; } prevBtn.clear(); return; }
    if (joinTimer) return;
    joinTimer = setInterval(() => {
      if (!(isOpen() && st.step === 5 && !st.sub && isLocal())) { joinWatch(); return; }
      const pads = G.Pad && G.Pad.others ? G.Pad.others() : [], max = st.players === 'local' ? 1 : 3;
      let changed = false;
      const live = new Set(pads.map(p => p.index));
      const kept = st.joined.filter(i => live.has(i));
      if (kept.length !== st.joined.length) { st.joined = kept; changed = true; }
      for (const p of pads) {
        const b = p.buttons || [], dn = i => !!(b[i] && (b[i].pressed || b[i].value > 0.5));
        const now = dn(0) || dn(1), was = prevBtn.get(p.index);
        prevBtn.set(p.index, now);
        if (now && !was && !st.joined.includes(p.index) && st.joined.length < max) { st.joined.push(p.index); changed = true; G.Audio.sfx('confirm'); }
      }
      if (changed) refocusAfter('#mx-start');
    }, 50);
  }

  /** Step 5's state from the saved picks (the carousels start where your last run was). */
  function initSetup() {
    if (G.ExpTier) { const at = G.ExpTier.pick(); st.map = at.map; st.diff = at.diff; }
    if (G.ExpDive) { st.route = G.Expedition.diveRoute(); if (!G.ExpDive.routeOpen(st.route)) st.route = 'forest'; }
  }
  function init() {
    $('mx-back').onclick = () => { if (!back()) G.MenuUI.open(); };
  }

  return {
    init, open, back, render, start, plan, playersOf, modeOf, owned, syncLeague, lobbyOpts, exp3d, exp3dUrl,
    VARIANTS, CATS,
    get state() { return { step: st.step, cat: st.cat, variant: st.variant, players: st.players, sub: st.sub, map: st.map, diff: st.diff, route: st.route }; }
  };
})();
