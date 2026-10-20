// The Elite win sticker (level 9; Pokermon 3.9.1's own Elite sticker; Pokermon PORTING.md "Batch 17"):
//   - a stake DECLARES its sticker level (`sticker_level`): Pokermon's Elite stake and Nacho's (while its customStakes
//     option is on) declare 9; the engine's 'win' event carries `sticker_level` (run.js win_sticker_level) — a real won
//     run on either Elite stake reports 9, Gold / a mod stake that declares nothing (Pokermon+'s Lilac) reports 8
//   - stickers.js recordWin records 9 in every category of the win; levels max-merge (a later Gold win keeps 9); records
//     clean 1..9; stickerName(9) = 'Elite'; the Elite colour is upstream's #ba8514 (the special stickers' ring)
//   - the plain level-9 sticker draws its own art (drawOwnSticker -> micatro/assets/textures/winstickers/elite.png, the
//     vendored elite_stake_sticker.png cell 0); every other stake still draws its stickers.png cell; cardsprite.js,
//     decksticker.js and the design wiki use it; board.js has a tooltip for it
//   node micatro/tests/mods/elite_sticker_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
// a browser Image stand-in: loads (async) when its src is set
const loaded = [];
globalThis.Image = class { constructor() { this.width = 0; this.height = 0; } set src(v) { this._src = v; loaded.push(v); setTimeout(() => { this.width = 142; this.height = 190; if (this.onload) this.onload(); }, 0); } get src() { return this._src; } };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 400)); } };
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

const { G, P_STAKES } = await import('../../js/engine/core.js');
const RUN = await import('../../js/engine/run.js');
const { newRun, act, STATES } = RUN;
const MODS = await import('../../js/mods/index.js');
for (const id of ['pokermon', 'nacho', 'pokermonplus']) await MODS.AVAILABLE.find((m) => m.id === id).load();
const { hand, play, clearHand } = await import('./poke_helpers.mjs');
const S = await import('../../js/ui/stickers.js');

/** Start a run on `stake` and win it (win ante 1: three blinds) -> the 'win' event (or null). */
function winOn(stake, mods, modOptions = {}) {
  newRun({ seed: 'ELITE_STK', back: 'b_red', stake, mods, modOptions });
  G.FORCE_BOSS = 'bl_wall';
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  const level = G.GAME.stake;
  G.GAME.win_ante = 1;
  for (let i = 0; i < 3; i++) {
    if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
    if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
    act({ type: 'select_blind' });
    clearHand();
    G.GAME.chips = G.GAME.blind.chips;
    const r = play(hand(['S_2']), { keepChips: true });
    const w = ((r && r.events) || []).find((e) => e.type === 'win');
    if (w) return { w, level };
  }
  return { w: null, level };
}

// ===================================================================== the engine: the win event's level
await sec('engine', () => {
  ok(P_STAKES.stake_poke_elite && P_STAKES.stake_poke_elite.sticker_level === 9, "Pokermon's Elite stake declares sticker_level 9");
  const pe = winOn('stake_poke_elite', ['pokermon']);
  ok(pe.w && pe.level === 8 && pe.w.stake === 8 && pe.w.sticker_level === 9, "a won run on Pokermon's Elite stake: plays at level 8, its win event carries sticker_level 9", pe);
  const gold = winOn(8, ['pokermon']);
  ok(gold.w && gold.w.stake === 8 && gold.w.sticker_level === 8, 'a won Gold-stake run: sticker_level 8', gold);
  const white = winOn(1, []);
  ok(white.w && white.w.sticker_level === 1, 'a won White-stake run (no mods): sticker_level 1', white);
  const nk = 'stake_nacho_elite_stake';
  ok(!!P_STAKES[nk], "Nacho's Elite stake is still registered", Object.keys(P_STAKES).filter((k) => /elite/.test(k)));
  const ne = winOn(nk, ['pokermon', 'nacho']);
  ok(ne.w && ne.w.stake === 8 && ne.w.sticker_level === 9, "a won run on Nacho's (superseded) Elite stake: sticker_level 9", ne);
  const off = winOn(nk, ['pokermon', 'nacho'], { nacho: { customStakes: false } });
  ok(off.w && off.w.sticker_level === 8, "Nacho's Elite with its customStakes option off (no Elite rules): Gold, 8", off);
  const lilac = Object.keys(P_STAKES).find((k) => /lilac_stake$/.test(k));
  ok(!!lilac, "Pokermon+'s Lilac stake is registered");
  if (lilac) {
    const li = winOn(lilac, ['pokermon', 'pokermonplus']);
    ok(li.w && li.w.sticker_level === 8, 'a mod stake that declares no sticker level (Lilac) still records Gold (8)', li);
  }
});

// ===================================================================== stickers.js: recording, levels, names, colours
await sec('record', () => {
  ok(S.MAX_LEVEL === 9 && S.STICKER_NAMES[8] === 'Elite' && S.stickerName(9) === 'Elite' && S.stickerName(8) === 'Gold' && S.stickerName(42) === 'Elite', 'level 9 = Elite (stickerName; higher clamps to Elite)');
  ok(S.STAKE_COLOURS.Elite === '#ba8514', "the Elite colour is upstream's Elite stake colour (#ba8514)", S.STAKE_COLOURS.Elite);
  ok(S.winEventLevel({ stake: 8, sticker_level: 9 }) === 9 && S.winEventLevel({ stake: 8 }) === 8 && S.winEventLevel({ stake: 12 }) === 8 && S.winEventLevel({ sticker_level: 15 }) === 9,
    'winEventLevel: the declared sticker_level (max 9), else the stake clamped to Gold');
  const ev = winOn('stake_poke_elite', ['pokermon']).w;
  const n = S.recordWin({ ...ev, jokers: ['j_joker', 'b_red'], categories: ['win', 'poke', 'nuz'] });
  ok(n === 2 && JSON.stringify(S.winRecord('j_joker')) === '{"win":9,"poke":9,"nuz":9}' && S.winRecord('b_red').win === 9, 'an Elite win records 9 in every category of the win (jokers and the deck)', S.winRecord('j_joker'));
  ok(JSON.parse(localStorage.getItem('micatro_joker_wins_v1:guest')).j_joker.win === 9, '...and saves 9 locally');
  ok(S.recordWin({ jokers: ['j_joker'], stake: 8, categories: ['win'] }) === 0 && S.winRecord('j_joker').win === 9, 'a later Gold win never lowers it');
  ok(JSON.stringify(S.cleanWins({ a_x: { win: 9 }, a_y: { win: 10 }, a_z: 9 })) === '{"a_x":{"win":9},"a_z":{"win":9}}', 'records clean 1..9 (10 dropped; flat 9 = {win: 9})');
  const plain = S.stickerFor({ win: 9 });
  ok(plain && plain.stake === 'Elite' && plain.level === 9 && plain.colour === '#ba8514' && plain.label === 'Win — Elite Stake' && !plain.special, 'a plain level-9 record: the Elite sticker', plain);
  const sp = S.winStickerInfo('j_joker', true);
  ok(sp && sp.category === 'nuz' && sp.stake === 'Elite' && sp.colour === '#ba8514' && sp.special.pokemon === 'Aipom', 'a special sticker (Aipom) gets the Elite ring colour', sp);
  for (const [cat, mon] of [['poke', 'Pikachu'], ['mono', 'Ambipom'], ['both', 'Arceus']]) {
    const i = S.stickerFor({ [cat]: 9 });
    ok(i && i.special.pokemon === mon && i.colour === '#ba8514' && i.stake === 'Elite', mon + ' at Elite: the Elite ring', i);
  }
  ok(S.STICKER_TEXT.Elite && /Elite/.test(S.STICKER_TEXT.Elite.text.join(' ')), 'a tooltip text for the Elite sticker (3.9.1 poke_elite_sticker)');
});

// ===================================================================== drawing
await sec('draw', async () => {
  const mk = () => { const calls = []; return { calls, drawImage: (...a) => calls.push(a), save() {}, restore() {}, beginPath() {}, arc() {}, fill() {} }; };
  const info = S.stickerFor({ win: 9 });
  const c1 = mk();
  ok(S.drawOwnSticker(c1, info, 142, 190) === true, 'drawOwnSticker claims the Elite sticker (the caller skips stickers.png) while its art loads');
  await tick(20);
  const c2 = mk();
  ok(S.drawOwnSticker(c2, info, 142, 190) === true && c2.calls.length === 1, '...and draws its art once loaded', c2.calls.length);
  const src = c2.calls[0] && c2.calls[0][0] && c2.calls[0][0].src;
  ok(/\/micatro\/assets\/textures\/winstickers\/elite\.png$/.test(String(src)), 'the art is micatro/assets/textures/winstickers/elite.png', src);
  ok(c2.calls[0] && c2.calls[0].slice(5).join() === '0,0,142,190', 'over the whole card face (like a stickers.png cell)', c2.calls[0] && c2.calls[0].slice(1));
  const c3 = mk();
  ok(S.drawOwnSticker(c3, S.stickerFor({ win: 8 })) === false && c3.calls.length === 0, 'Gold (and every other stake) is not drawn by it: stickers.png as before');
  ok(S.drawOwnSticker(mk(), S.stickerFor({ nuz: 9 })) === false, 'a special sticker at Elite is the ring (drawSpecialSticker), not the plain art');
  // the art: a 142x190 PNG (a card face, like a stickers.png cell), the chip top right
  const file = path.join(ROOT, 'micatro/assets/textures/winstickers/elite.png');
  const buf = fs.existsSync(file) ? fs.readFileSync(file) : null;
  ok(buf && buf.readUInt32BE(16) === 142 && buf.readUInt32BE(20) === 190, 'elite.png exists, 142x190', buf && [buf.readUInt32BE(16), buf.readUInt32BE(20)]);
  // every draw site goes through drawOwnSticker before stickers.png
  for (const f of ['micatro/js/ui/cardsprite.js', 'micatro/js/ui/decksticker.js', 'designwiki/app.js']) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    ok(/drawOwnSticker\(/.test(t), f + ' draws a stake\'s own sticker art (Elite)');
  }
  ok(/STICKER_TEXT\[st\.stake\]/.test(fs.readFileSync(path.join(ROOT, 'micatro/js/ui/board.js'), 'utf8')), 'board.js: the Elite sticker tooltip');
  ok(/maxLevel: 9/.test(fs.readFileSync(path.join(ROOT, 'micatro/js/net.js'), 'utf8')) && /maxLevel: 9/.test(fs.readFileSync(path.join(ROOT, 'designwiki/app.js'), 'utf8')), 'net.js and the wiki ask the server for level 9 (maxLevel: 9)');
});

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
