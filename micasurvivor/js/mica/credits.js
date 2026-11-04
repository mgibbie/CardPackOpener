/* ============ mica/credits.js — MicaSurvivor glue (not upstream) ============
 * - The Credits & licences screen (#scr-legal in index.html): the Required Notice,
 *   the code licence, the SpriteCollab CC BY-NC 4.0 artist table (read from the
 *   same-origin CREDITS.md, never a network request elsewhere) and the Android-port
 *   controller credit.
 * - English strings for the Spanish text MicaSurvivor added (see js/core/i18n.js:
 *   the game is written in Spanish and translated on the fly).
 */
G.I18n.add({
  'Basado en PokéSurvivor de JPTER78': 'Based on PokéSurvivor by JPTER78',
  'Basado en': 'Based on', 'de JPTER78': 'by JPTER78',
  'Basado en PokéSurvivor de JPTER78 · versión {x}': 'Based on PokéSurvivor by JPTER78 · version {x}',
  'Basado en PokéSurvivor de JPTER78 · Proyecto de fan sin ánimo de lucro · Sprites: SpriteCollab (CC BY-NC 4.0) · Pokémon © Nintendo/Creatures/GAME FREAK ·':
    'Based on PokéSurvivor by JPTER78 · Non-profit fan project · Sprites: SpriteCollab (CC BY-NC 4.0) · Pokémon © Nintendo/Creatures/GAME FREAK ·',
  'Créditos y licencias': 'Credits & licences',
  'Próximamente': 'Coming soon',
  'Próximamente: amigos, partidas en grupo y ranking con tu cuenta de Magepunk.': 'Coming soon: friends, group play and the ranking with your Magepunk account.',
  'Tu partida se guarda en este navegador.': 'Your progress is saved in this browser.'
});

G.MicaCredits = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let rows = null, loading = null;

  /** The artist rows of CREDITS.md's sprite table: [{ name, sprites }]. */
  function parse(md) {
    const out = [];
    const lines = md.split(/\r?\n/);
    const start = lines.findIndex(l => /^\|\s*Artista\s*\|/.test(l));
    if (start < 0) return out;
    for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) {
      const c = lines[i].split('|').slice(1, -1).map(x => x.trim());
      if (c.length >= 3 && c[0]) out.push({ name: c[0], sprites: c[2] });
    }
    return out;
  }

  function load() {
    if (rows) return Promise.resolve(rows);
    if (!loading) {
      loading = fetch('CREDITS.md').then(r => (r.ok ? r.text() : '')).then(t => { rows = parse(t); return rows; })
        .catch(() => { loading = null; return []; });
    }
    return loading;
  }

  function render() {
    const box = document.getElementById('credits-artists');
    if (!box) return;
    load().then(list => {
      if (!list.length) { box.innerHTML = '<p class="note">See CREDITS.md for the full list of sprite artists.</p>'; return; }
      box.innerHTML = `<p class="note">${list.length} artists · hover or tap a name to see their sprites (National Dex numbers).</p>`
        + '<ul class="artist-list">' + list.map(a =>
          `<li title="${esc(a.sprites)}"><b>${esc(a.name)}</b> <small>${esc(a.sprites)}</small></li>`).join('') + '</ul>';
    });
  }

  return { render, load, parse };
})();
