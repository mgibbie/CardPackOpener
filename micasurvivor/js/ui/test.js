/* ============ test.js — elección de compañero ============
 * (Owner, 2026-11-12: "get rid of that personality test for new players". A new player used to answer eight questions
 * and be handed a partner by its "personality"; now it goes straight to choosing one of the starters. The file and
 * G.TestUI keep their names: game.js calls G.TestUI.start() for a save with no partner yet.) */
G.TestUI = (() => {
  const $ = G.UI.$;
  let picked = null;

  function init() {
    $('starter-ok').onclick = () => { if (picked) choose(picked); };
  }

  /** A new player: choose your partner. */
  function start() {
    G.UI.chrome(false);
    openStarters();
  }

  /** Abre la rejilla de starters. */
  function openStarters() {
    picked = null;
    $('starter-ok').disabled = true;
    $('starter-info').textContent = 'Selecciona un Pokémon';
    const grid = $('starter-grid');
    grid.innerHTML = '';
    for (const s of G.STARTERS) {
      const mon = G.DEX_BY[s.dex];
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.appendChild(G.UI.spriteCanvas(s.dex, 92, 80, { scale: 2 }));
      cell.insertAdjacentHTML('beforeend', `<b>${mon.name}</b>`);
      cell.onclick = () => {
        if (picked === s.dex && cell.classList.contains('on')) { choose(picked); return; }   // (pressed again: that one)
        grid.querySelectorAll('.cell').forEach(c => c.classList.remove('on'));
        cell.classList.add('on');
        picked = s.dex;
        const mv = G.Moves.BY_ID[s.start];
        $('starter-info').innerHTML = `${G.UI.typeChips(mon.types)} ${G.Icons.html('move:' + s.start, 16)} ${mv.name} · ${s.traits.join(', ')}`
          + G.UI.abilityLine(s.dex);   // MicaSurvivor (M5): su habilidad
        $('starter-ok').disabled = false;
      };
      grid.appendChild(cell);
    }
    G.UI.show('scr-starters');
  }

  function choose(dex) {
    const save = G.DB.save;
    save.starter = dex;
    save.partner = dex;
    G.DB.grant(dex, 'starter');
    G.DB.commit();
    G.UI.toast('¡' + G.DEX_BY[dex].name + ' se une a ti!');
    G.Flow.goMenu();
  }

  return { init, start };
})();
