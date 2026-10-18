/* ============ icons.js — iconos pixel art (sustituyen a los emojis) ============
 * Todo se dibuja desde mapas de caracteres, igual que los tiles: así la
 * interfaz comparte estilo con los sprites de Mundo Misterioso.
 *
 *   G.Icons.html('coin', 18)     <img> para el DOM
 *   G.Icons.draw(ctx, 'coin', x, y, 18)   en el canvas
 *   G.Icons.url('star')          data URL (para CSS)
 *   'move:<id>'                  emblema del tipo + insignia de la familia
 *   'type:<tipo>'                sólo el emblema
 *   'zc:<tipo>'                  Cristal Z de un tipo (24×16; MicaSurvivor M5 lote 4)
 */
G.Icons = (() => {
  const K = '#1b1528';          // contorno

  // ---------------- iconos de interfaz (12×12) ----------------
  const MEDAL = ['.kkk....kkk.', '.krk....kqk.', '..krk..kqk..', '...krkkqk...', '....kkkk....', '...kmmmmk...',
                 '..kmwmmmnk..', '.kmwmsmmmnk.', '.kmmsssmmnk.', '.kmmmsmmmnk.', '..kmmmmmnk..', '...kkkkkk...'];

  const UI = {
    gear: { pal: { g: '#c9d6ff', d: '#7f93c9' }, rows: [
      '....kkkk....', '.kk.kggk.kk.', '.kgkkggkkgk.', '..kggggggk..', 'kkggkkkkggkk', 'kgggk..kgddk',
      'kgggk..kgddk', 'kkggkkkkddkk', '..kggddddk..', '.kgkkddkkdk.', '.kk.kddk.kk.', '....kkkk....'] },
    full: { pal: { w: '#f4f8ff' }, rows: [
      'kkkkk..kkkkk', 'kwwwk..kwwwk', 'kwkk....kkwk', 'kwk......kwk', 'kkk......kkk', '............',
      '............', 'kkk......kkk', 'kwk......kwk', 'kwkk....kkwk', 'kwwwk..kwwwk', 'kkkkk..kkkkk'] },
    phone: { pal: { b: '#2c519f', s: '#9fd8ff', w: '#e6f4ff' }, rows: [
      '...kkkkkk...', '...kbbbbk...', '...kssssk...', '...kswssk...', '...kssssk...', '...kssssk...',
      '...kssssk...', '...kssssk...', '...kssssk...', '...kbbbbk...', '...kbwwbk...', '...kkkkkk...'] },
    // Banderita: reportar una marca del ranking.
    flag: { pal: { r: '#ff5f6d', w: '#c9cfdc' }, rows: [
      '.kk.........', '.kwkkkkkk...', '.kwkrrrrrk..', '.kwkrrrrrrk.', '.kwkrrrrrk..', '.kwkrrrrk...',
      '.kwkkkkk....', '.kwk........', '.kwk........', '.kwk........', 'kkwkk.......', 'kkkkk.......'] },
    // MicaSurvivor (M5 lote 6, icons.gd m_daily / m_party / m_horde): modos y el modificador Horda.
    m_daily: { pal: { r: '#ff5f6d', w: '#f4f4ff' }, rows: [
      '.k..k..k..k.', 'kkkkkkkkkkkk', 'krrrrrrrrrrk', 'kkkkkkkkkkkk', 'kwwwwwwwwwwk', 'kwkkwkkwkkwk',
      'kwwwwwwwwwwk', 'kwkkwkkwrrwk', 'kwwwwwwwrrwk', 'kwkkwkkwwwwk', 'kwwwwwwwwwwk', 'kkkkkkkkkkkk'] },
    m_party: { pal: { o: '#ffb347', y: '#ffd23f', p: '#ff8ad8', b: '#4fb4ff' }, rows: [
      '.......y..p.', '..b..y......', '.........b..', '....kk.p....', '...kook.....', '..kooyk..y..',
      '..koyook....', '.kooyook..b.', '.koyooook...', 'kooyoook....', 'kkooook.....', '.kkkkk......'] },
    // MicaSurvivor (M5 lote 7, icons.gd m_team): dos Poké Balls, el Modo Equipo.
    m_team: { pal: { W: '#f4f6fb', R: '#e0434f' }, rows: [
      '................', '...........k....', '.........kkRkk..', '........kRRRRRk.', '.....k.kRRRRRRRk', '...kkRkkRRRRRRRk',
      '..kRRRRkkkkWkkkk', '.kRRRRRRWWWWWWWk', '.kRRRRRRWWWWWWWk', '.kkkkWkkkWWWWWk.', '.kWWWWWWWkkWkk..', '.kWWWWWWWk.k....',
      '..kWWWWWk.......', '...kkWkk........', '.....k..........', '................'] },
    // MicaSurvivor (M5 lote 12a, icons.gd EXTRA m_coop): dos Pokémon juntos, azul y naranja, el Modo Cooperativo.
    m_coop: { pal: { A: '#4fa8ff', B: '#ff8a5b' }, rows: [
      '................', '................', '.....k.....k....', '...kkAkk.kkBkk..', '..kAAAAAkBBBBBk.', '..kAAAAAkBBBBBk.',
      '.kAAkAkABBkBkBBk', '..kAAAAAkBBBBBk.', '..kAAAAAkBBBBBk.', '..kkkAkkkkkBkkk.', '.kAAAAAABBBBBBBk', '.kAAAAAABBBBBBBk',
      '.kAAAAAABBBBBBBk', '.kAAAAAABBBBBBBk', '.kAAAAAABBBBBBBk', '..kkkkkkkkkkkkk.'] },
    // MicaSurvivor (M5 lote 8, icons.gd EXTRA): Rush de Jefes, Torre de pisos, descansos y cartas de riesgo.
    m_rush: { pal: { W: '#f4f6fb', R: '#e0434f', H: '#ff9aa2', S: '#c9cfdc' }, rows: [
      '........k.......', '.....kkkRkkk....', '....kRRRRRRRk...', '...kHHRRRRRRRk..', '..kRHRRRRRRRRRk.', '.kRRRRRRRRRRRRRk',
      '.kRRRRRRkRRRRRRk', '..kkkkkkWkkkkkk.', '.kkkkkkWWWkkkkkk', '.kWWWWWkWkWWWWWk', '.kWWWWWWkWWWWWWk', '.kWWWWWWWWWWWWWk',
      '..kWWWWWWWWWWWk.', '...kWSSSWWWWWk..', '....kWWWWWWWk...', '.....kkkWkkk....'] },
    m_tower: { pal: { S: '#b9bfcc', d: '#5b6a8a', R: '#e0434f' }, rows: [
      '....k.k.k.kkRRRk', '...kSkSkSkSkRRRk', '...kSSSSSSSSkkk.', '...kSSSSSSSSk...', '...kSSSSSSSSk...', '....kSSSSSSk....',
      '....kSSddSSk....', '....kSSddSSk....', '....kSSSSSSk....', '....kSSSSSSk....', '....kSSddSSk....', '....kSSddSSk....',
      '....kSSddSSk....', '....kSSddSSk....', '....kSSddSSk....', '.....kkkkkk.....'] },
    contract: { pal: { P: '#f0dfae', D: '#c9a26a', T: '#7a5a35', R: '#c0392b' }, rows: [
      '..kkkkkkkkkkkk..', '.kDDDDDDDDDDDDk.', 'kDDkkkkkkkkkkDDk', '.kkPPPPPPPPPPkk.', '..kPTTTTTTTTPk..', '..kPPPPPPPPPPk..',
      '..kPTTTTTTTTPk..', '..kPPPPPPPPPPk..', '..kPTTTTTTPPPk..', '..kPPPPPPPPPPk..', '..kPTTTTPPRRPk..', '..kPPPPPPRRRPk..',
      '.kkPPPPPPPPPPkk.', 'kDDkkkkkkkkkkDDk', '.kDDDDDDDDDDDDk.', '..kkkkkkkkkkkk..'] },
    r_l_reap: { pal: { Y: '#ffd23f', y: '#fff3a8', o: '#b8860b', W: '#ffffff', S: '#e8edf5', s: '#9aa6bd', B: '#8a4b1f', b: '#5b3a1f', R: '#d12a3c', r: '#8a1424', H: '#ff8a96' }, rows: [
      '......kRk.......', '.....kRHRk......', '.....kRRRk......', '.....kRRRk......', '.....kRWrk......', '.....kRWsk......',
      '.....krWsk......', '.....kSWsk......', '.....kSWsk......', '...kkkSWskkkk...', '..kyyyyyyyyyyk..', '..koYYYYYYYYok..',
      '...kkkkBbkkkk...', '......kBbk......', '.....kyYYYk.....', '......kkkk......'] },
    r_l_time: { pal: { Y: '#ffd23f', y: '#fff3a8', o: '#b8860b', C: '#cfeeff', W: '#ffffff', S: '#ffb81c' }, rows: [
      '..kkkkkkkkkkkk..', '.kyyyyyyyyyyyyk.', '.kYYYYYYYYYYYYk.', '.koCCCCCCCCCkk..', '..kkWCSSSSCCk...', '...kWCCSSCCk....',
      '....kkCSCCk.....', '......kSCk......', '......kSCk......', '.....kCSCCk.....', '....kCCSSCCk....', '...kCCSSSSCCkk..',
      '..kkkkkkkkkkkok.', '.kYYYYYYYYYYYYk.', '.kYYYYYYYYYYYYk.', '..kkkkkkkkkkkk..'] },
    r_l_bag: { pal: { Y: '#ffd23f', y: '#fff3a8', o: '#b8860b', B: '#a8682a', b: '#6b3f15', R: '#e0434f', W: '#ffffff' }, rows: [
      '.......kkk......', '......koook.....', '.....kokkkok....', '...kkokkkkkok...', '..kyyyyyyyyyyk..', '..kYYYYYYYYYYk..',
      '..kYYYYYYYYYYk..', '..kYYYYWRYYYYk..', '..kooooRRooook..', '..kBBBBRRBBBBk..', '..kBooooooooBk..', '..kBbbbbbbbbBk..',
      '..kBbbbbbbbbBk..', '..kBBBBBBBBBBk..', '...kkkkkkkkkk...', '................'] },
    r_l_armor: { pal: { Y: '#ffd23f', y: '#fff3a8', o: '#b8860b', R: '#e0434f', W: '#ffffff', d: '#7a5a0b' }, rows: [
      '................', '...kkkk..kkk....', '.kkyYYYkkYYYkk..', 'kYyYYYYyyYYYYYk.', '.kYYYYYyyYYYYYk.', '.kYYYYYyyYYYYYk.',
      '.kYoooYWRYoooYk.', '.kYYYYYRRYYYYYk.', '.kooooooooooook.', '..kYYYYyyYYYYk..', '..kYYYYyyYYYk...', '...kddYyyYddk...',
      '...kYYYyyYYk....', '....kYYyyYYk....', '.....kkkkkk.....', '................'] },
    r_frenzy: { pal: { R: '#e0434f', r: '#a82a35', W: '#fff6e0', Y: '#ffd23f', g: '#9aa3b5' }, rows: [
      '......kkkk......', '.....kggggk.....', '.....kggggk.kk..', '.....kkRRkkkggk.', '....kRRRRRRkggk.', '...kRRWWYWRRkk..',
      '..kRRWWWYWWRRk..', '..kRWWWYYWWWRk..', '.kRRWWYYYYWWRRk.', '.kRRWWWWYYWWRRk.', '..krWWWYYWWWRk..', '..krRWWYWWWRRk..',
      '...krRWWWWRRk...', '....kRRRRRRk....', '.....kkRRkk.....', '.......kk.......'] },
    r_glass: { pal: { C: '#b9ecff', W: '#ffffff', B: '#5fb4e8', b: '#3a6fa8', D: '#2a3f66', Y: '#ffd23f' }, rows: [
      '................', '................', '................', '..........kkk...', '..kkkkkkkkBBBk..', '.kWWWDWWWWBbBkk.',
      '.kCCCCDCCCBbBkYk', '.kCCCDCCCCBbBYYk', '.kCCCCDCCCBbBkYk', '.kCCCDCCCCBbBkk.', '..kbbBBBbbBBBk..', '..kbBBDBBbkkk...',
      '...kBDDDBk......', '...kBBDBBk......', '....kBBBk.......', '.....kkk........'] },
    r_swift: { pal: { B: '#a8683a', T: '#d9a066', d: '#5b3a1f', W: '#ffffff', L: '#cfe8ff' }, rows: [
      '................', '......kkkkk.....', '.....kTTTTTk....', '..kkkkTTTTTk....', '.kLWWkBBBBBk....', '.kWWWkBTBBBk....',
      'kWLWWkBTBBBk....', '.kWWWkBBBBBk....', '..kLWkBBBBBk....', '...kkkBBBBBkkk..', '.....kBBBBBBBBk.', '.....kBBBBBBBBk.',
      '.....kBBBBBBBBk.', '.....kddddddddk.', '......kkkkkkkk..', '................'] },
    r_blood: { pal: { R: '#d12a3c', D: '#8a1424', H: '#ff9aa8', Y: '#ffd23f' }, rows: [
      '................', '.......kk.......', '......kRRk......', '......kHRk......', '.....kRRRRk.....', '....kkRRRRkk....',
      '...kRRRRRRRRk...', '...kRRRRRRRRk...', '..kRRHRRRRRRRk..', '..kRRHRRRRRRRk..', '..kRRHRRRRRRRk..', '..kRRRHRRRRRRk..',
      '...kRRRRRRRRk...', '...kRDRRRRDRk...', '....kkDDDDkk....', '......kkkk......'] },
    r_scholar: { pal: { P: '#7a4fd0', p: '#4a2a96', W: '#f4f0e0', Y: '#ffd23f', y: '#fff3a8', d: '#2a1a4a', R: '#e0434f' }, rows: [
      '................', '...kkkkkkkkkk...', '..kppPPPPPPPPk..', '..kpppPPPPPPPWk.', '..kppPRPPPRPPWk.', '..kppPPPPPPPPWk.',
      '..kppPPyyyPPPWk.', '..kppYyyyyyYYWk.', '..kppYyydyyYYWk.', '..kppYyydyyYYWk.', '..kppPPyyyPPPWk.', '..kppPRPPPRPPWk.',
      '..kppPPPPPPPPWk.', '..kppPPPPPPPPk..', '...kkkkkkkkkk...', '................'] },
    r_stone: { pal: { S: '#9aa3b2', L: '#c9d0dc', d: '#5d6674', D: '#3a4150' }, rows: [
      '................', '..kkkkkkkkkkkk..', '.kLLLLLLLLLLLLk.', '.kLLLLLLLLLLLLk.', '.kSSLSSDSSSLSk..', '.kSSddSSDSSSSk..',
      '.kSSSSSSDSddSk..', '.kSSSSSSDSSSSk..', '.kSSSLSSSDSSSk..', '..kSSSdSSDSSSk..', '...kSSSSDdSSk...', '....kSSdDSSk....',
      '....kSSSSSk.....', '.....kkSSk......', '.......kk.......', '................'] },
    r_fast: { pal: { W: '#f4f6fb', L: '#c9d0dc', g: '#9aa3b5', d: '#6b7385' }, rows: [
      '................', '.kkk.........kk.', 'kgggk.......kWLk', 'kgkgk.......kWLk', 'kgkgk..kkkk.kWLk', 'kgkgk.kWWWWkkWLk',
      'kgggkkWWWWWWkWLk', '.kgkkWWLLLLWWWLk', '.kgkkWWLLLLWWWLk', '.kgkkWWLLLLWWggk', '.kgkkWWLLLLWWggk', '.kgk.kWWWWWWkggk',
      '.kgk..kWWWWkkggk', '.kgk...kkkk.kggk', '..k..........kk.', '................'] },
    r_swarm: { pal: { C: '#f0dfae', c: '#c9a26a', Y: '#ffd23f', d: '#6b4a2b', W: '#ffffff' }, rows: [
      '....k...........', '...kYk..........', '..kYk......kk...', '.kYk......kYYk..', '.kk......kYddYk.', 'kYk.....kCYddYk.',
      '.kYk...kCCYddYk.', '..k...kCCcYddYk.', '.....kCCcCCYYk..', '....kCCcCCcCk...', '...kCCcCccCk....', '..kCCcCCCCk.....',
      '.kCCcCCCkk......', '..kCCCkk........', '...kkk..........', '................'] },
    r_berserk: { pal: { W: '#fff0f0', R: '#e0434f', r: '#ff9aa2', d: '#3a0f16', D: '#5b1f2a' }, rows: [
      '................', '.kk...........kk', 'kDDk.........kDD', 'kDDDkk.....kkDDD', '.kDDDDk...kDDDDk', '..kDDDDkkkDDDDk.',
      '...kWDDDRDDDkk..', '..kWWrDDdDDWk...', '.kWWWRrddRRWWk..', 'kWWrWRRddRRWrWk.', '.kWWWRRddRRWWk..', '..kWrWRddRWrk...',
      '...kWWWRRWWk....', '....kkkkkkk.....', '................', '................'] },
    r_quick: { pal: { F: '#f5c9a0', f: '#e0a878', W: '#ffffff', g: '#9aa3b5', s: '#c98f60' }, rows: [
      '................', '.......kk.......', '.....kkffkk.....', '.kkkkFFffFFk....', 'kWWWkFFffFFkk...', '.kkkkFFffFFffk..',
      '....kFFffFFffk..', '.kkkkFFffFFffkk.', 'kWWWkFFffFFffFFk', '.kkkkFFFFFFFFFFk', '....kFFFFFFFFFFk', '.kkkkFFFFFFFFkk.',
      'kWWWkFFFFFFFFk..', '.kkkkssssssssk..', '.....kkkkkkkk...', '................'] },
    r_heavy: { pal: { S: '#9aa3b2', L: '#d4dae6', d: '#5d6674', B: '#a8683a', D: '#5b3a1f', Y: '#ffd23f' }, rows: [
      '................', '..kkkkkkkkkk.k..', '.kLLLLLLLLLLkYk.', '.kSSSSSSSSSSkkk.', '.kSSSSSSSSSSYYYk', '.kSSSSSSSSSSkkk.',
      '.kSSSSSSSSSSkYk.', '.kddddddddddkk..', '..kkkkBBkkkk.k..', '.....kBBk...kYk.', '.....kBBk..kYkYk', '.....kBBk...kYk.',
      '.....kDDk....k..', '.....kDDk.......', '......kk........', '................'] },
    r_overclock: { pal: { S: '#9aa3b2', R: '#e8643a', Y: '#ffd23f', d: '#5d6674' }, rows: [
      '......kkkk......', '.....kSSSSk.....', '...kkkSSSSkkk...', '..kSSSSSSSSSSk..', '..kSdSSRRSSSSk..', '.kkSSRRRRRRSSkk.',
      'kSSSSRRYYRRSSSSk', 'kSSSRRYYYYRRSSSk', 'kSSSRRYYYYRRSSSk', 'kSSSSRRYYRRSSSSk', '.kkSSRRRRRRSSkk.', '..kSSSSRRSSdSk..',
      '..kSSSSSSSSSSk..', '...kkkSSSSkkk...', '.....kSSSSk.....', '......kkkk......'] },
    r_metronome: { pal: { B: '#a8683a', T: '#d9a066', D: '#5b3a1f', Y: '#ffd23f', R: '#e0434f', W: '#fff3a8' }, rows: [
      '...........k....', '..........kYk...', '.........kkYk...', '........kRRk....', '.....kkkkRRk....', '....kBBBBYk.....',
      '....kBBTTYBk....', '....kBBTTYBk....', '...kBBDTYDBBk...', '...kBBTTYTBBk...', '...kBBTYTTBBk...', '..kBBBTWTTBBBk..',
      '.kkBBBBBBBBBBkk.', 'kDDDDDDDDDDDDDDk', 'kDDDDDDDDDDDDDDk', '.kkkkkkkkkkkkkk.'] },
    r_slowburn: { pal: { d: '#4a4f5e', D: '#2f3340', O: '#ff8a3d', Y: '#ffd23f', R: '#e0434f' }, rows: [
      '................', '........k.......', '.......kOk......', '......kOOOk.....', '.....kOOYOOk....', '.....kOOYOOk....',
      '....kOOOOOOOk...', '...kddddddddk...', '...kddddddOddk..', '..kddOddOdddddk.', '.kddddOddddOddk.', '..kddddddOddddk.',
      '..kDDDDODDDDDDk.', '..kDDDDDDDDDDDk.', '...kkkkkkkkkkk..', '................'] },
    r_skip: { pal: { B: '#a8683a', W: '#ffffff', g: '#c9d0dc', G: '#5fa84a', d: '#5b3a1f' }, rows: [
      '...kk...........', '..kBBk..........', '..kBBkkkkkkkk...', '..kBBWWWWWWWWk..', '..kBBWWWWWWWk...', '..kBBWWWWWWkk...',
      '..kBBWWWWggggk..', '..kBBggggWWWWk..', '..kBBkkkkkkkk...', '..kBBk..........', '..kBBk..........', '..kBBk..........',
      '.kkBBkkkk.......', 'kGGGGGGGGk......', 'kGGGGGGGGk......', '.kkkkkkkk.......'] },
    r_rest: { pal: { B: '#a8683a', D: '#5b3a1f', O: '#ff8a3d', Y: '#ffd23f', R: '#e0434f' }, rows: [
      '................', '........k.......', '.......kOk......', '......kOOOk.....', '.....kOOOOOk....', '.....kOOOOOk....',
      '....kOOOYOOOk...', '....kOOYYYOOk...', '...kOOYYYYOOk...', '..kkkOOYYYOOkkk.', '.kDDDOOYYYOkBBBk', '.kDDDDDDDBBBBBBk',
      '..kkDDDDDDDDDkk.', '.kBBBBBBDDDDDDDk', '.kBBBkkkkkkkDDDk', '..kkk.......kkk.'] },
    r_train: { pal: { B: '#4f8fd8', L: '#9cc8ff', d: '#2a4a7a', g: '#9aa3b5', W: '#d4dae6' }, rows: [
      '................', '................', '..kkk......kkk..', '.kLBBk....kLBBk.', '.kLBBk....kLBBk.', '.kLBdkkkkkkdBBk.',
      '.kLBdWWWWWWdBBk.', '.kLBdggggggdBBk.', '.kLBdggggggdBBk.', '.kLBdggggggdBBk.', '.kLBdkkkkkkdBBk.', '.kLBBk....kLBBk.',
      '.kLBBk....kLBBk.', '..kkk......kkk..', '................', '................'] },
    r_shield: { pal: { Y: '#ffd23f', B: '#3f7fe0', C: '#9cd0ff', W: '#ffffff', d: '#2a4a8a' }, rows: [
      '................', '.....kkkkkk.....', '...kkYYYYYYkk...', '..kYYWdBBddYYk..', '..kYWBBBBBBdYk..', '.kYdWBBCCBBBdYk.',
      '.kYdBBCCCCBBdYk.', '.kYBBCCYYCCBBYk.', '.kYBBCCYYCCBBYk.', '.kYdBBCCCCBBdYk.', '.kYdBBBCCBBBdYk.', '..kYdBBBBBBdYk..',
      '..kYYddBBddYYk..', '...kkYYYYYYkk...', '.....kkkkkk.....', '................'] },
    m_horde: { pal: { r: '#ff5f6d', g: '#5fe08a', b: '#4fb4ff', w: '#f4f8ff' }, rows: [
      '............', '.kkk....kkk.', 'krrrk..kgggk', 'krwrk..kgwgk', 'krrrkkkkgggk', '.kkkbbbbkkk.',
      '...kbwwbk...', '..kbbbbbbk..', '..kbbbbbbk..', '...kkkkkk...', '............', '............'] },
    // Prohibido (Veto: movimiento bloqueado).
    ban: { pal: { r: '#ff5f6d' }, rows: [
      '...kkkkkk...', '..krrrrrrk..', '.krrkkkkrrk.', 'krrk..krrrrk', 'krk..krrkkrk', 'krk.krrk.krk',
      'krkkrrk..krk', 'krrrrk..krrk', '.krrkkkkrrk.', '..krrrrrrk..', '...kkkkkk...', '............'] },
    heart: { pal: { r: '#ff5f6d', s: '#c23a4b', w: '#ffd3d8' }, rows: [
      '............', '.kkk....kkk.', 'kwwrk..krrrk', 'kwrrrkkrrrsk', 'krrrrrrrrrsk', 'krrrrrrrrrsk',
      '.krrrrrrrsk.', '..krrrrrsk..', '...krrrsk...', '....krsk....', '.....kk.....', '............'] },
    fist: { pal: { r: '#ff5f6d', s: '#c23a4b', w: '#ffd3d8', c: '#e8e8f0' }, rows: [
      '............', '..kkkkkk....', '.krrrrrrk...', 'krwwrrrrrkk.', 'krwrrrrrrrrk', 'krrrrrrrkrsk',
      'krrrrrrrkrsk', '.krrrrrrskk.', '..kssssssk..', '..kcccccck..', '..kkkkkkkk..', '............'] },
    up: { pal: { g: '#5fe08a', d: '#2f9a52', w: '#c8ffd8' }, rows: [
      '.....kk.....', '....kwgk....', '...kwgggk...', '..kwgggggk..', '.kwgggggggk.', 'kkkkggggkkkk',
      '...kggggk...', '...kggggk...', '...kggddk...', '...kgdddk...', '...kddddk...', '...kkkkkk...'] },
    boot: { pal: { b: '#4fb4ff', d: '#2a6fb0', w: '#e6f4ff', g: '#e8e8f0' }, rows: [
      '............', '....kkkk....', '....kbbk....', '....kbbk....', '....kbbk....', '....kbbbkk..',
      '...kbwbbbbk.', '..kbbbbbbbbk', '..kdddddddbk', '..kgggggggk.', '...kkkkkkk..', '............'] },
    // Vínculo (premio de los legendarios): dos eslabones enlazados.
    bond: { pal: { y: '#ffd23f', w: '#fff3b0', p: '#ff8ad8', q: '#ffd3f1' }, rows: [
      '.kkkkk......', 'kwyyyyk.....', 'kykkkyk.....', 'kyk.kyk.....', 'kykkkyk.....', 'kyyyyykkkkk.',
      '.kkkkkqppppk', '.....kpkkkpk', '.....kpk.kpk', '.....kpkkkpk', '.....kpppppk', '......kkkkk.'] },
    clock: { pal: { w: '#f4f4ff', y: '#ffd23f', o: '#c9c9e0' }, rows: [
      '....kkkk....', '..kkyyyykk..', '.kyywwwwyyk.', '.kywwwkwwyk.', 'kywwwwkwwwyk', 'kywwwwkwwwyk',
      'kywwwwkkkwyk', 'kywwwwwwwwyk', '.kywwwwwwyk.', '.kyyowwwyyk.', '..kkyyyykk..', '....kkkk....'] },
    shield: { pal: { s: '#9fb1c9', d: '#5d6f8c', w: '#e6eef8', r: '#4fb4ff' }, rows: [
      '............', '.kkkkkkkkkk.', '.kwwsssssdk.', '.kwssrrssdk.', '.kwssrrssdk.', '.kssrrrrsdk.',
      '.kssrrrrsdk.', '..kssrrsdk..', '..kssssddk..', '...ksssdk...', '....kddk....', '.....kk.....'] },
    sprout: { pal: { g: '#5fe08a', d: '#2f9a52', b: '#8a5a2b' }, rows: [
      '............', '..kkk..kkk..', '.kgggk.kgggk', '.kggggkgggdk', '..kdggkggdk.', '...kkdgdkk..',
      '.....kgk....', '.....kgk....', '...kkkdkkk..', '..kbbbbbbbk.', '..kbbbbbbbk.', '...kkkkkkk..'] },
    // MicaSurvivor (M5): Calibre (carta de stat): un orbe con flechas que lo agrandan.
    size: { pal: { b: '#4fb4ff', d: '#2a6fb0', w: '#f4f8ff' }, rows: [
      'kkkk....kkkk', 'kwwk....kwwk', 'kwk......kwk', 'kk..kkkk..kk', '...kbwbbk...', '..kbwbbbdk..',
      '..kbbbbbdk..', '...kbbddk...', 'kk..kkkk..kk', 'kwk......kwk', 'kwwk....kwwk', 'kkkk....kkkk'] },
    magnet: { pal: { r: '#ff5f6d', s: '#c23a4b', w: '#e8e8f0' }, rows: [
      '............', '..kkkkkkkk..', '.krrrrrrrrk.', 'krrsskkssrrk', 'krrk....krrk', 'krrk....krrk',
      'krrk....krrk', 'kwwk....kwwk', 'kwwk....kwwk', 'kkkk....kkkk', '............', '............'] },
    book: { pal: { c: '#4fb4ff', d: '#2a6fb0', p: '#f4f4ff', y: '#ffd23f' }, rows: [
      '............', '.kkkkkkkkkk.', '.kcccccccck.', '.kcyyyyyyck.', '.kcccccccck.', '.kccyyyyyck.',
      '.kcccccccck.', '.kcccccccck.', '.kddddddddk.', '.kppppppppk.', '.kkkkkkkkkk.', '............'] },
    coin: { pal: { y: '#ffd23f', o: '#c08a10', w: '#fff4b0' }, rows: [
      '....kkkk....', '..kkyyyykk..', '.kyywwyyyyk.', '.kywyyyyyok.', 'kyyyyooyyyok', 'kywyoyyoyyok',
      'kyyyoyyoyyok', 'kyyyyooyyyok', '.kyyyyyyyok.', '.kooyyyyook.', '..kkooookk..', '....kkkk....'] },
    cards: { pal: { a: '#ffd23f', b: '#4fb4ff', w: '#e6f4ff' }, rows: [
      '............', '.kkkkkk.....', '.kaaaaakkkk.', '.kaaaakbbbbk', '.kaaaakbwwbk', '.kaaaakbwwbk',
      '.kaaaakbbbbk', '.kaaaakbwwbk', '.kkkkkkbwwbk', '......kbbbbk', '......kkkkkk', '............'] },
    berry: { pal: { r: '#ff7a9e', s: '#c23a6b', w: '#ffd3e0', g: '#5fe08a', d: '#2f9a52' }, rows: [
      '............', '.....kkk....', '....kgggk...', '..kkkgdkkk..', '.krrrkkrrrk.', 'krwwrrrrrrsk',
      'krwrrrrrrrsk', 'krrrrrrrrrsk', 'krrrrrrrrssk', '.krrrrrrssk.', '..kkssssskk.', '....kkkkk...'] },
    bomb: { pal: { b: '#3a3a4a', w: '#8a8aa0', f: '#ffd23f', r: '#ff7b3d' }, rows: [
      '........r...', '.......rfr..', '......kfr...', '.....kfk....', '...kkkkkk...', '..kbbbbbbk..',
      '.kbwwbbbbbk.', '.kbwbbbbbbk.', '.kbbbbbbbbk.', '.kbbbbbbbbk.', '..kbbbbbbk..', '...kkkkkk...'] },
    star: { pal: { y: '#ffd23f', o: '#c08a10', w: '#fff4b0' }, rows: [
      '.....kk.....', '.....kk.....', '....kwyk....', '....kyyk....', 'kkkkwyyykkkk', 'kwyyyyyyyyok',
      '.kyyyyyyyok.', '..kyyyyyyk..', '..kyyyoyyk..', '.kyok..koyk.', '.kok....kok.', '.kk......kk.'] },
    // Marca de shiny: la estrella roja de la ficha de los juegos, con un destello.
    shiny: { pal: { y: '#ff4d5e', w: '#ffd0d6', o: '#b8283a', x: '#fff6b0' }, rows: [
      '.....kk...x.', '.....kk..xxx', '....kwyk..x.', '....kyyk....', 'kkkkwyyykkkk', 'kwyyyyyyyyok',
      '.kyyyyyyyok.', '..kyyyyyyk..', '..kyyyoyyk..', '.kyok..koyk.', '.kok....kok.', '.kk......kk.'] },
    crown: { pal: { y: '#ffd23f', o: '#c08a10', r: '#ff5f6d' }, rows: [
      '............', '............', 'k....k....k.', 'kk..kyk..kk.', 'kyk.kyk.kyk.', 'kyykyyykyyk.',
      'kyyyyyyyyyk.', 'kyyryyyryyk.', 'kyyyyyyyyyk.', 'koooooooook.', 'kkkkkkkkkkk.', '............'] },
    user: { pal: { u: '#b9cbf0', d: '#7f93c0' }, rows: [
      '............', '....kkkk....', '...kuuuuk...', '...kuuuuk...', '...kuuuuk...', '....kuuk....',
      '..kkkuukkk..', '.kuuuuuuuuk.', '.kuuuuuuuuk.', '.kdduuuuddk.', '.kkkkkkkkkk.', '............'] },
    cursor: { pal: { y: '#ffd23f' }, rows: [
      'k.......', 'kk......', 'kyk.....', 'kyyk....', 'kyyyk...', 'kyyyyk..',
      'kyyyk...', 'kyyk....', 'kyk.....', 'kk......', 'k.......', '........'] },
    sound: { pal: { w: '#e8eef8' }, rows: [
      '............', '.....kk.....', '....kwk..k..', '...kwwk...k.', 'kkkwwwk.k..k', 'kwwwwwk..k.k',
      'kwwwwwk..k.k', 'kkkwwwk.k..k', '...kwwk...k.', '....kwk..k..', '.....kk.....', '............'] },
    mute: { pal: { w: '#e8eef8', r: '#ff5f6d' }, rows: [
      '............', '.....kk.....', '....kwk.....', '...kwwk.....', 'kkkwwwk.r..r', 'kwwwwwk..rr.',
      'kwwwwwk..rr.', 'kkkwwwk.r..r', '...kwwk.....', '....kwk.....', '.....kk.....', '............'] },
    ticket: { pal: { y: '#ffd23f', d: '#c08a10', w: '#fff3b0', r: '#ff5f6d' }, rows: [
      '............', '............', 'kkkkkkkkkkkk', 'kwyyydyyyyyk', 'kyyyyyyrryyk', '.kyyydyrryk.',
      '.kyyyyyrryk.', 'kyyyydyyyyyk', 'kddddddddddk', 'kkkkkkkkkkkk', '............', '............'] },
    ticket10: { pal: { p: '#c47bff', q: '#8a3fd0', w: '#f0d8ff', y: '#ffd23f' }, rows: [
      '............', '............', 'kkkkkkkkkkkk', 'kwpppqppyypk', 'kppppqpyyypk', '.kpppqpyyyk.',
      '.kpppqppyyk.', 'kppppqpppppk', 'kqqqqqqqqqqk', 'kkkkkkkkkkkk', '............', '............'] },
    wsun: { pal: { y: '#ffd23f', o: '#ff9a3d' }, rows: [
      '.....yy.....', '..y..yy..y..', '...y....y...', '....kkkk....', 'yy.kyyyyk.yy', 'yy.kyyoyk.yy',
      '...kyooyk...', '....kkkk....', '...y....y...', '..y..yy..y..', '.....yy.....', '............'] },
    wrain: { pal: { w: '#e8eef8', g: '#9fb1c9', b: '#4fb4ff' }, rows: [
      '............', '...kkkk.....', '..kwwwwkkk..', '.kwwwwwwwwk.', 'kwwwwwwwwwgk', 'kggggggggggk',
      '.kkkkkkkkkk.', '..b...b...b.', '.b...b...b..', '..b...b...b.', '.b...b...b..', '............'] },
    wsand: { pal: { s: '#e0bf73', d: '#9a7a3a' }, rows: [
      '............', '..ssssss....', '........ss..', 'ssssssss..s.', '.........s..', '..dddddd....',
      '........dd..', 'dddddd....d.', '.........d..', '...sssss....', '............', '............'] },
    wsnow: { pal: { w: '#ffffff', c: '#9fe0ff' }, rows: [
      '.....w......', '...w.w.w....', '....www.....', '.w..cwc..w..', '..w.cwc.w...', 'wwwwwwwwwww.',
      '..w.cwc.w...', '.w..cwc..w..', '....www.....', '...w.w.w....', '.....w......', '............'] },
    wfog: { pal: { g: '#c9cfdc', d: '#8f98ab' }, rows: [
      '............', '............', '..gggggg....', '.g......gg..', '............', '....gggggg..',
      '..dd......d.', '............', '.ggggggg....', 'g.......gg..', '............', '............'] },
    // Bolas del tragaperras del gacha (una por rareza).
    ball2: { pal: { r: '#3d7bff', s: '#2a56b8', w: '#cfe0ff', b: '#f4f4f4' }, rows: [
      '....kkkk....', '..kkrrrrkk..', '.krwrrrrrrk.', '.krwrrrrrsk.', 'krrrrkkrrssk', 'kkkkkbbkkkkk', 'kbbbkbbkbbbk', 'kbbbbkkbbbbk', '.kbbbbbbbbk.', '.kbbbbbbbbk.', '..kkbbbbkk..', '....kkkk....'] },
    ball3: { pal: { r: '#3a3a46', s: '#1d1d26', w: '#ffd23f', b: '#f4f4f4' }, rows: [
      '....kkkk....', '..kkrrrrkk..', '.krwrrrrrrk.', '.krwrrrrrsk.', 'krrrrkkrrssk', 'kkkkkbbkkkkk', 'kbbbkbbkbbbk', 'kbbbbkkbbbbk', '.kbbbbbbbbk.', '.kbbbbbbbbk.', '..kkbbbbkk..', '....kkkk....'] },
    ball4: { pal: { r: '#8a3fd0', s: '#5e2a96', w: '#ff8ad8', b: '#f4f4f4' }, rows: [
      '....kkkk....', '..kkrrrrkk..', '.krwrrrrrrk.', '.krwrrrrrsk.', 'krrrrkkrrssk', 'kkkkkbbkkkkk', 'kbbbkbbkbbbk', 'kbbbbkkbbbbk', '.kbbbbbbbbk.', '.kbbbbbbbbk.', '..kkbbbbkk..', '....kkkk....'] },
    ballLux: { pal: { r: '#30303a', s: '#18181e', w: '#ff5f6d', b: '#ffd23f' }, rows: [
      '....kkkk....', '..kkrrrrkk..', '.krwrrrrrrk.', '.krwrrrrrsk.', 'krrrrkkrrssk', 'kkkkkbbkkkkk', 'kbbbkbbkbbbk', 'kbbbbkkbbbbk', '.kbbbbbbbbk.', '.kbbbbbbbbk.', '..kkbbbbkk..', '....kkkk....'] },
    // ---------- objetos equipables (data/items.js) ----------
    leftovers: { pal: { r: '#ff5f6d', d: '#b8283a', w: '#ffd8d8', g: '#5fe08a' }, rows: [
      '.....kgk....', '....kggk....', '..kkkkkkkk..', '.krwrrrrrrk.', 'krwrrrrrrrdk', 'krrrrrrrrrdk',
      'krrrrrrrrrdk', 'krrrrrrrrddk', '.krrrrrrrdk.', '..kdrrrrdk..', '...kkkkkk...', '............'] },
    choiceband: { pal: { p: '#ff8ad8', q: '#c04a98', w: '#ffe0f4' }, rows: [
      '............', '............', '...kkkkkk...', '.kkppwwppkk.', 'kpp......ppk', 'kq........qk',
      'kq........qk', 'kpp......ppk', '.kkppppppkk.', '...kkkkkk...', '............', '............'] },
    quickclaw: { pal: { y: '#ffd23f', o: '#c08a10', b: '#8a5a2b' }, rows: [
      '........kk..', '.......kyk..', '......kyok..', '..kk..kyok..', '.kyk.kyok...', '.kyokyok....',
      '.kyyyok..kk.', '.kbbbbk.kyk.', 'kbbbbbbkyok.', 'kbbbbbbyok..', '.kkkkkkkk...', '............'] },
    focussash: { pal: { o: '#ff9a3d', d: '#c0601a', w: '#ffd0a0' }, rows: [
      '.kk.........', 'kook........', 'kwook.......', '.kwook......', '..kwook.....', '...kwook....',
      '....kwook...', '.....kwook..', '......kwook.', '.......koodk', '........kddk', '.........kk.'] },
    shellbell: { pal: { p: '#ff9ec4', q: '#c05a88', w: '#ffe0ee', y: '#ffd23f' }, rows: [
      '.....kk.....', '....kyyk....', '...kkkkkk...', '..kwppppqk..', '.kwppppppqk.', '.kpppppppqk.',
      'kpppppppppqk', 'kppqpqpqppqk', 'kkkkkkkkkkkk', '....kyyk....', '.....kk.....', '............'] },
    amuletcoin: { pal: { y: '#ffd23f', o: '#c08a10', w: '#fff3b0', r: '#ff5f6d' }, rows: [
      '..kk....kk..', '..krk..krk..', '...krkkrk...', '....kkkk....', '...kyyyyk...', '..kywyyyok..',
      '..kyyooyok..', '..kyyooyok..', '..kyyyyyok..', '...kooook...', '....kkkk....', '............'] },
    luckyegg: { pal: { w: '#fffaf0', s: '#e0d6c8', r: '#ff5f6d' }, rows: [
      '....kkkk....', '...kwwwwk...', '..kwwrwwwk..', '..kwwwwwwk..', '.kwrwwwwrwk.', '.kwwwwwwwwk.',
      '.kwwwrwwwsk.', '.kwwwwwwwsk.', '.kwrwwwwssk.', '..kwwwwssk..', '...kkkkkk...', '............'] },
    lifeorb: { pal: { p: '#c04a98', d: '#7a1f5a', w: '#ffb0e0', r: '#ff3048' }, rows: [
      '....kkkk....', '..kkpppdkk..', '.kwwpppppdk.', '.kwpprrpppk.', 'kppprrrrppdk', 'kpprrrrrrpdk',
      'kpprrrrrrpdk', 'kppprrrrppdk', '.kpppprppdk.', '.kdpppppddk.', '..kkddddkk..', '....kkkk....'] },
    choicescarf: { pal: { b: '#4fb4ff', d: '#2a6fb0', w: '#cfe8ff' }, rows: [
      '............', '............', 'kkkkkkkkkk..', 'kwbbbbbbbbk.', 'kbbbbbbbbdk.', 'kkkkkkkbbdk.',
      '......kbbdk.', '......kbbdk.', '.....kbbbdk.', '.....kbbddk.', '.....kkkkkk.', '............'] },
    rockyhelmet: { pal: { g: '#9aa6b5', d: '#5d6773', w: '#e0e6ee' }, rows: [
      '............', '.k...k...k..', 'kgk.kgk.kgk.', '.kkkkkkkkk..', 'kwggggggggk.', 'kwgggggggdk.',
      'kggggggggdk.', 'kgggkkkkgdk.', 'kggk....kdk.', 'kkk......kk.', '............', '............'] },
    assaultvest: { pal: { g: '#4f8a3a', d: '#2f5a22', y: '#ffd23f' }, rows: [
      '............', '.kkk....kkk.', 'kggk....kggk', 'kgggkkkkgggk', 'kgggyggygggk', 'kgggggggggdk',
      'kggyggggygdk', 'kgggggggggdk', 'kgggggggggdk', 'kddddddddddk', 'kkkkkkkkkkkk', '............'] },
    // MicaSurvivor (M5 lote 3): los 15 objetos del port de Android (data/icons.json "ui" y
    // scripts/icons.gd EXTRA para la Esfera Colosal), copiados tal cual: 20×20 (16×16 la Esfera), sin contorno extra.
    eternalice: { pal: { a: '#7fc8ee', b: '#bfe9ff', c: '#ffffff', e: '#4f9ad0' }, outline: false, rows: [
      '....................', '..........kk........', '.........kaak.......', '........kabbak......',
      '.......kabbbbak.....', '......kabcbbbbak....', '.....kabccbbbbbak...', '....kabcccbbbbbbak..',
      '...kabcccbbbbbbbbak.', '..kabbccbbbbbbbbbbak', '..kaebbbbbbbbbbbbeak', '..kaeebbbbbbbbbbeeak',
      '...kaeeebbbbbbeeeak.', '....kaaeeeeeeeeaak..', '.....kkaaaaaaaakk...', '.......kkkkkkkk.....',
      '....................', '....................', '....................', '....................'] },
    scopelens: { pal: { a: '#e8493f', b: '#bfe6ff', c: '#ffffff' }, outline: false, rows: [
      '....................', '....................', '......kkkkkkkk......', '.....kaaaakaaak.....',
      '....kaaakkkkaaak....', '...kaakkbbkbkkaak...', '..kaakbbbbkbbbkaak..', '..kaakbbbbkbbbkaak..',
      '..kakbbbcbkbbbbkak..', '..kakbbcbbkbbbbkak..', '..kkkkkkkkkkkkkkkk..', '..kakbbbbbkbbbbkak..',
      '..kaakbbbbkbbbkaak..', '..kaakbbbbkbbbkaak..', '...kaakkbbkbkkaak...', '....kaaakkkkaaak....',
      '.....kaaaakaaak.....', '......kkkkkkkk......', '....................', '....................'] },
    expertbelt: { pal: { a: '#ffd23f', b: '#3a3a48', c: '#6a6a7a' }, outline: false, rows: [
      '....................', '....................', '....................', '....................',
      '....................', '.......kkkkkk.......', '.......kaaaak.......', '.kkkkkkkaaaakkkkkkk.',
      '.kbbbbbkabbakbbbbbk.', '.kbbbbbkabbakbbbbbk.', '.kbcbbckabbakbbcbbk.', '.kbbbbbkabbakbbbbbk.',
      '.kbbbbbkabbakbbbbbk.', '.kkkkkkkaaaakkkkkkk.', '.......kaaaak.......', '.......kkkkkk.......',
      '....................', '....................', '....................', '....................'] },
    widelens: { pal: { a: '#d6f2a0', b: '#9ad94a', c: '#ffffff', d: '#8a6a3a' }, outline: false, rows: [
      '....................', '....................', '.....kkkkkkkk.......', '....kkaaaaaakk......',
      '...kaaakkkkaaak.....', '..kkakkbbbbkkakk....', '..kaakccbbbbkaak....', '..kakbcbbbbbbkak....',
      '..kakbbbbbbbbkak....', '..kakbbbbbbbbkak....', '..kakbbbbbbbbkak....', '..kaakbbbbbbkaak....',
      '..kkakkbbbbkkakk....', '...kaaakkkkaaak.....', '....kkaaaaaakkd.....', '.....kkkkkkkkkkd....',
      '..............kkd...', '...............kkd..', '................kkd.', '.................k..'] },
    bigorb: { pal: { O: '#8a5ad0', Y: '#c9a6ff', W: '#f4ecff', o: '#4a2a96' }, outline: false, rows: [
      '......kWWk......', '.....kWWWWk.....', '......kWWk......', '....kkkOOkkk....',
      '...kOOYYYYOOk...', '..kOYWWYYYYOk...', 'kWOYWYYYYYYYOWk.', 'kWWOYYYYYYYYOWWk',
      'kWWOYYYYYYYYOWWk', 'kWOOYYYYYYYOOWk.', '..kOOYYYYYOOk...', '...kooOOOOook...',
      '....kkoooookk...', '......kWWk......', '.....kWWWWk.....', '......kWWk......'] },
    typegem: { pal: { a: '#d9f1ff', b: '#9fd8ff', c: '#5fb0e8' }, outline: false, rows: [
      '....................', '....................', '..........k.........', '.........kak........',
      '........kbaak.......', '.......kbbaaak......', '.....kbbbbaaaaak....', '....kbbbbbaaaaaak...',
      '...kkkkkkkkkkkkkkk..', '....kccccccbbbbbk...', '....kkcccccbbbbkk...', '.....kcccccbbbbk....',
      '......kccccbbbk.....', '.......kcccbbk......', '.......kkccbkk......', '........kccbk.......',
      '.........kck........', '.........kkk........', '..........k.........', '....................'] },
    sitrusberry: { pal: { a: '#5fb84a', b: '#ffd83d', c: '#fff7c8', d: '#ffe98a' }, outline: false, rows: [
      '....................', '..............a.....', '............aaa.....', '..........kaaaaa....',
      '......kkkkkaaaaa....', '.....kkbbbkabkk.....', '....kbbbbbbbbbbk....', '...kkbbbcbbbbbbkk...',
      '...kbbbcddddbbbbk...', '...kbbbddddddbbbk...', '...kbbddddddddbbk...', '...kbbddddddddbbk...',
      '...kbbddddddddbbk...', '...kbbddddddddbbk...', '...kkbbddddddbbkk...', '....kbbbddddbbbk....',
      '.....kkbbbbbbkk.....', '......kkkkkkkk......', '....................', '....................'] },
    heavyboots: { pal: { a: '#a8aebf', b: '#7a7f8f', c: '#c9cfdc', d: '#3a3a48' }, outline: false, rows: [
      '....................', '....................', '......kkkkkkk.......', '......kaaaabk.......',
      '......kaaaabk.......', '......kaaaabk.......', '......kaaaabk.......', '......kbbbbbk.......',
      '......kbbbbbk.......', '......kbbbbbk.......', '......kbbbbbk.......', '....kkkbbbbbk.......',
      '....kbbbbbbbkkkk....', '....kbbbbbbbbbbkkkk.', '....kbbbbbbbbccccck.', '....kdddddddddddddk.',
      '....kdddddddddddddk.', '....kkkkkkkkkkkkkkk.', '....................', '....................'] },
    safetygoggles: { pal: { a: '#ffb347', b: '#fff3c8' }, outline: false, rows: [
      '....................', '....................', '....................', '....................',
      '....................', '....................', '...kkkkkk..kkkkkk...', '..kkaaaakkkkaaaakk..',
      '.kkaabaaakkaabaaakk.', '.kkaaaaaakkaaaaaakk.', '.kkaaaaaakkaaaaaakk.', '.kkaaaaaakkaaaaaakk.',
      '..kkaaaakkkkaaaakk..', '...kkkkkk..kkkkkk...', '....................', '....................',
      '....................', '....................', '....................', '....................'] },
    weaknesspolicy: { pal: { a: '#f4f0e0', b: '#9a9a9a', c: '#e0434f' }, outline: false, rows: [
      '....................', '....................', '....kkkkkkkkkkkk....', '....kaaaaaaaaaak....',
      '....kaaaaaaaaaak....', '....kaaaaaaaaaak....', '....kaabbbbbbaak....', '....kaaaaaaaaaak....',
      '....kaabbbbbbaak....', '....kaaaaaaaaaak....', '....kaaaaaaaaaak....', '....kaaccccccaak....',
      '....kaaccccccaak....', '....kcccccccccck....', '....kaccccccccak....', '....kaacccccaaak....',
      '....kaaacccaaaak....', '....kaaaacaaaaak....', '....kkkkkkkkkkkk....', '....................'] },
    rarecandy: { pal: { a: '#ffffff', b: '#4f9cf0', c: '#bfe0ff' }, outline: false, rows: [
      '....................', '....................', '....................', '....................',
      '....................', '.k.....kkkkkk......k', '.kak..kbbcccbk...kak', '.kaakkbccbbbcck.kaak',
      '.kaaakbcbbbbbbkaaaak', '.kaaakbbbbbbbbkaaaak', '.kaaakbbbbbbbbkaaaak', '.kaaakbbbbbbbbkaaaak',
      '.kaaakbbbbbbbbkaaaak', '.kaak.kbbbbbbk..kaak', '.kak...kkkkkk....kak', '.k.................k',
      '....................', '....................', '....................', '....................'] },
    pureincense: { pal: { a: '#dfe8f5', b: '#bcd0ea', c: '#e8493f', d: '#a8683a' }, outline: false, rows: [
      '....................', '..........a.........', '.........a..........', '..........a.b.......',
      '........b..a........', '..........a.........', '....................', '.........cc.........',
      '.........cc.........', '.........dd.........', '.........dd.........', '.........dd.........',
      '.........dd.........', '.........dd.........', '.........dd.........', '.........dd.........',
      '.........dd.........', '........kkkk........', '........kkkk........', '....................'] },
    lightball: { pal: { a: '#ffd23f', b: '#e0434f', c: '#fffbe0', d: '#ffe98a' }, outline: false, rows: [
      '....................', '....................', '.......kkkkkk.......', '.....kkaaaaaakk.....',
      '....kkaaaaabaakk....', '...kkaaaaabbaaakk...', '...kaacaddbbaaaak...', '..kaaaaddbbbdaaaak..',
      '..kaaadddbbbbbbaak..', '..kaaaddbbbbbbaaak..', '..kaaaddbbbbbbaaak..', '..kaaadbbbbbbdaaak..',
      '..kaaaadddbbdaaaak..', '...kaaaaddbbaaaak...', '...kkaaaabbaaaakk...', '....kkaaabbaaakk....',
      '.....kkaabaaakk.....', '.......kkkkkk.......', '....................', '....................'] },
    thickclub: { pal: { a: '#f1ead6', b: '#ffffff', c: '#d8cba8', d: '#e0d6b8' }, outline: false, rows: [
      '..............kk....', '.............kaak...', '............kaaakk..', '............kaakaak.',
      '.............kkaaaak', '.............akaaaak', '............abakaak.', '...........abaaakk..',
      '..........abaaa.....', '.........abaaa......', '........abaaa.......', '.......abaaa........',
      '..kk..abaaa.........', '.kaakabaaa..........', 'kaaakkaaa...........', 'kaakaaka............',
      '.kkaacak............', '..kacaak.......d....', '...kaak.............', '....kk..............'] },
    silverpowder: { pal: { a: '#aeb8c8', b: '#c9453b', c: '#d6deea', d: '#ffffff', e: '#8793a8', f: '#e8f0ff' }, outline: false, rows: [
      '....................', '....................', '....................', '......k.......k.....',
      '.......ak...ka......', '.......kaaaaak......', '........aaaaa.......', '.......kbbbbbk......',
      '......kkkkkkkkk.....', '.....kkccccaaakk....', '....kkccccaaaaakk...', '....kacccaaaaaaak...',
      '...kacccaaaaaaaaak..', '..kacccaadaaaeeeeak.', '..kaaaaaaaaaaeeeeak.', '...kaaaaaaadeeeeek..',
      '...kaaaafaaaeeeeek..', '...kkkaaaaaaaeekkk..', '.....kkaaaaaaekk....', '.......kkkkkkk......'] },
    // MicaSurvivor (M5 lote 3): iconos de las mejoras MT, Segunda oportunidad y Mochila (port, data/icons.json).
    tm: { pal: { a: '#2a3a5a', b: '#3f5a8a', c: '#1a2640', d: '#8fb0e8', e: '#ffd23f', f: '#e0e8f8' }, outline: false, rows: [
      '....................', '....................', '....kkkkkkkkkkkk....', '...kbbbbbbbbbbbbk...',
      '..kbddbbbbbbbbbbbk..', '..kbdbbbbbbbbbbbbk..', '..kbbbbbbbbbbbbbbk..', '..kbbbkkkkkkkkbbbk..',
      '..kbbkaaaaaaaakbbk..', '..kbbkaaffffaakbbk..', '..kbbkaafaaaaakbbk..', '..kbbkaafffaaakbbk..',
      '..kbbkaafaaaaakbbk..', '..kbbkaaffffaakbbk..', '..kbbkaaaaaaaakbbk..', '..kbbbkkkkkkkkbbbk..',
      '..kbbbbbbbbeebbbbk..', '...kbbbbbbbeebbbk...', '....kkkkkkkkkkkk....', '....................'] },
    revive: { pal: { r: '#e8435a', h: '#ff9aa8', d: '#a82a3c', w: '#f6f6f6', g: '#a8a8a8' }, outline: false, rows: [
      '....................', '....kkk......kkk....', '...krrrkk..kkrrrk...', '..krhhrrrkkrrrrrgg..',
      '.krhhrrrrrrrrrggwwg.', '.krhrrrrrrrrggwwwwg.', '.krrrrrrrrrgwwwwggk.', '.krrrrrrrggwwwwwrrk.',
      '.ggggggggwwwwwwwggg.', '.gwwwwwwwwwwwwwwwwg.', '..gwwwwwgggggggggg..', '..gwwwwgrrrrrrrrdk..',
      '...gwggrrrrrrrrrk...', '...ggrrrrrrrrrrdk...', '....krrrrrrrrrdk....', '.....kkrrrrrdkk.....',
      '.......krrrrk.......', '........krrk........', '.........kk.........', '....................'] },
    bag: { pal: { a: '#c24a2a', b: '#e0673f', c: '#8a2a14', d: '#ffb088', e: '#f09060', f: '#ffd23f' }, outline: false, rows: [
      '....................', '....................', '.......kkkkkk.......', '......kaaaaaak......',
      '.....kaaaaaaaak.....', '.....kaaaaaaaak.....', '....kbcaaaaaacbk....', '...kbbckkkkkkcbbk...',
      '...kbdcbbbbbbcbbk...', '...kbdcbbbbbbcbbk...', '...kbbkkkkkkkkbbk...', '...kbbkeeeeeekbbk...',
      '...kbbkeeffeekbbk...', '...kbbkeeffeekbbk...', '...kbbkeeeeeekbbk...', '...kbbkeeeeeekbbk...',
      '...kbbkkkkkkkkbbk...', '....kbbbbbbbbbbk....', '.....kkkkkkkkkk.....', '....................'] },
    // ---------- medallas de logros (bronce, plata, oro) ----------
    medal1: { pal: { r: '#ff5f6d', q: '#b8283a', m: '#d08a4a', n: '#8a5226', w: '#ffd0a0', s: '#ffe8c8' }, rows: MEDAL },
    medal2: { pal: { r: '#4fb4ff', q: '#2a6fb0', m: '#c9d2de', n: '#7d8899', w: '#ffffff', s: '#ffffff' }, rows: MEDAL },
    medal3: { pal: { r: '#c47bff', q: '#7a3fb0', m: '#ffd23f', n: '#c08a10', w: '#fff3b0', s: '#fffbe0' }, rows: MEDAL },
    medalOff: { pal: { r: '#3a4870', q: '#2a3458', m: '#3a4870', n: '#2a3458', w: '#4a5a88', s: '#4a5a88' }, rows: MEDAL },
    trophy: { pal: { y: '#ffd23f', d: '#c08a10', w: '#fff3b0' }, rows: [
      '............', '..kkkkkkkk..', 'kkkwyyyydkkk', 'k.kwyyyydk.k', 'k.kwyyyydk.k', '.kkwyyyydkk.',
      '...kyyyyk...', '....kyyk....', '....kyyk....', '...kddddk...', '..kyyyyyyk..', '..kkkkkkkk..'] },
    friends: { pal: { b: '#4fb4ff', d: '#2a6fb0', g: '#5fe08a', h: '#2f9a52' }, rows: [
      '............', '..kkk..kkk..', '.kbbbkkgggk.', '.kbbbkkgggk.', '..kkk..kkk..', '............',
      '.kkkkkkkkkk.', 'kbbbbkkggggk', 'kbbbbkkggggk', 'kddddkkhhhhk', 'kkkkkkkkkkkk', '............'] },
    ball: { pal: { r: '#ff4d4d', w: '#f4f4f4', s: '#c23a3a' }, rows: [
      '....kkkk....', '..kkrrrrkk..', '.krwrrrrrrk.', '.krwrrrrrsk.', 'krrrrkkrrssk', 'kkkkkwwkkkkk',
      'kwwwkwwkwwwk', 'kwwwwkkwwwwk', '.kwwwwwwwwk.', '.kwwwwwwwwk.', '..kkwwwwkk..', '....kkkk....'] }
  };
  // Variantes de paleta.
  UI.starDim = { rows: UI.star.rows, pal: { y: '#3a4870', o: '#2a3458', w: '#4a5a88' } };

  // ---------------- glifos de tipo (8×8, blancos sobre el emblema) ----------------
  const TYPE_GLYPH = {
    normal:   ['..####..', '.#....#.', '#......#', '#..##..#', '#..##..#', '#......#', '.#....#.', '..####..'],
    fire:     ['...#....', '...##...', '..###.#.', '.#####..', '.######.', '##.####.', '##..###.', '.######.'],
    water:    ['...##...', '...##...', '..####..', '.######.', '.##.###.', '.#.####.', '.######.', '..####..'],
    grass:    ['.....###', '...#####', '..######', '.####.##', '.###.###', '.##.####', '.#.####.', '#.......'],
    electric: ['....###.', '...###..', '..###...', '.######.', '...###..', '..###...', '.##.....', '#.......'],
    psychic:  ['.######.', '#......#', '#.####.#', '#.#..#.#', '#.#.##.#', '#.#....#', '#.######', '#.......'],
    ice:      ['...#....', '.#.#.#..', '..###...', '#######.', '..###...', '.#.#.#..', '...#....', '........'],
    fighting: ['.######.', '########', '########', '#.#.#.##', '########', '.#######', '..#####.', '..####..'],
    poison:   ['.....##.', '....####', '.....##.', '.###....', '#####...', '#####.##', '.###.###', '.....##.'],
    ground:   ['........', '...##...', '..####..', '.##..##.', '.######.', '##.##.##', '########', '........'],
    flying:   ['#.......', '##......', '###.....', '####....', '######..', '########', '.#######', '...####.'],
    bug:      ['.#....#.', '..#..#..', '..####..', '.##.###.', '########', '###.####', '.######.', '..####..'],
    rock:     ['...###..', '..#####.', '.###.###', '######.#', '##.#####', '#######.', '.#####..', '........'],
    ghost:    ['..####..', '.######.', '##.##.##', '##.##.##', '########', '########', '########', '#.#..#.#'],
    dragon:   ['#.......', '##....#.', '.##..##.', '.######.', '..####..', '.######.', '##.##.##', '#..##..#'],
    dark:     ['..####..', '.###....', '###.....', '###.....', '###.....', '###.....', '.###....', '..####..'],
    steel:    ['..####..', '.######.', '###..###', '##....##', '##....##', '###..###', '.######.', '..####..'],
    fairy:    ['...#....', '...#....', '..###...', '#######.', '..###...', '..#.#...', '.#...#..', '........']
  };

  // Insignia de la familia de movimiento (5×5).
  const KIND_GLYPH = {
    projectile: ['..#..', '...#.', '#####', '...#.', '..#..'],
    melee:      ['....#', '...#.', '..#..', '.#...', '#....'],
    beam:       ['.....', '#####', '.....', '#####', '.....'],
    orbit:      ['.###.', '#...#', '#...#', '#...#', '.###.'],
    nova:       ['#.#.#', '.###.', '#####', '.###.', '#.#.#'],
    aura:       ['.###.', '#...#', '#.#.#', '#...#', '.###.'],
    buff:       ['..#..', '.###.', '#####', '..#..', '..#..'],
    boomerang:  ['####.', '#....', '#....', '#....', '#....'],
    chain:      ['##...', '..#..', '...##', '..#..', '##...'],
    mine:       ['..#..', '.###.', '##.##', '.###.', '..#..'],
    meteor:     ['....#', '...#.', '.##..', '####.', '.##..'],
    turret:     ['.###.', '.#.#.', '.###.', '..#..', '#####'],
    dash:       ['#.#..', '.#.#.', '..#.#', '.#.#.', '#.#..'],
    trail:      ['#....', '.....', '..#..', '.....', '....#'],
    cone:       ['....#', '..###', '#####', '..###', '....#']
  };

  // ---------------- render ----------------

  const cache = new Map();      // clave -> canvas a 1×
  const urls = new Map();

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.max(0, Math.min(255, Math.round(c * k)));
    return '#' + [f(n >> 16 & 255), f(n >> 8 & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function fromRows(def) {
    const h = def.rows.length, w = Math.max(...def.rows.map(r => r.length));
    const pad = def.outline ? 1 : 0;
    const cv = document.createElement('canvas');
    cv.width = w + pad * 2; cv.height = h + pad * 2;
    const c = cv.getContext('2d', { willReadFrequently: true });   // se lee en svgOf()
    const pal = Object.assign({ k: K }, def.pal);
    if (def.outline) {
      c.fillStyle = K;
      def.rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch === '.' || ch === ' ') return;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.fillRect(x + pad + dx, y + pad + dy, 1, 1);
      }));
    }
    def.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.' || ch === ' ' || !pal[ch]) return;
      c.fillStyle = pal[ch];
      c.fillRect(x + pad, y + pad, 1, 1);
    }));
    return cv;
  }

  /** Emblema circular de un tipo (16×16), con insignia de familia opcional. */
  function emblem(type, kind) {
    const S = 16;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d', { willReadFrequently: true });   // se lee en svgOf()
    const col = G.U.TYPE_COLOR[type] || '#b0a99f';
    const dark = shade(col, 0.55), lite = shade(col, 1.3);
    // Disco con contorno, sombra abajo-derecha y brillo arriba-izquierda.
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 7.6) continue;
      let f = col;
      if (d > 6.6) f = K;
      else if ((x - 7.5) + (y - 7.5) > 6) f = dark;
      else if ((x - 7.5) + (y - 7.5) < -6.5) f = lite;
      c.fillStyle = f; c.fillRect(x, y, 1, 1);
    }
    const g = TYPE_GLYPH[type] || TYPE_GLYPH.normal;
    // Sombra del glifo y glifo.
    c.fillStyle = dark;
    g.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') c.fillRect(x + 5, y + 5, 1, 1); }));
    c.fillStyle = '#ffffff';
    g.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') c.fillRect(x + 4, y + 4, 1, 1); }));

    if (kind && KIND_GLYPH[kind]) {
      c.fillStyle = K; c.fillRect(9, 9, 7, 7);
      c.fillStyle = '#2b3454'; c.fillRect(10, 10, 5, 5);
      c.fillStyle = '#ffd23f';
      KIND_GLYPH[kind].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') c.fillRect(x + 10, y + 10, 1, 1); }));
    }
    return cv;
  }

  /**
   * MicaSurvivor (M5 lote 4, icons.gd _zcrystal_img): Cristal Z de un tipo, 24×16. Rombo con borde
   * negro y filo blanco, el color del tipo a dos tonos y su símbolo en oscuro.
   */
  function zcrystal(type) {
    const W = 24, H = 16;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d', { willReadFrequently: true });   // se lee en svgOf()
    const col = G.U.TYPE_COLOR[type] || '#b0a99f';
    const lite = shade(col, 1.25), dark = shade(col, 0.72);
    const cx = (W - 1) * 0.5, cy = (H - 1) * 0.5;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.abs(x - cx) / 11.8 + Math.abs(y - cy) / 7.8;
      if (d > 1) continue;
      let f;
      if (d > 0.86) f = K;
      else if (d > 0.78) f = '#f4f6fb';
      else {
        f = (y - cy) + (x - cx) * 0.25 < 0 ? lite : dark;
        if (d > 0.70) f = shade(f, 0.85);
      }
      c.fillStyle = f; c.fillRect(x, y, 1, 1);
    }
    const g = TYPE_GLYPH[type] || TYPE_GLYPH.normal;
    const gw = Math.max(...g.map(r => r.length)), ox = Math.floor((W - gw) / 2), oy = Math.floor((H - g.length) / 2);
    c.fillStyle = K;
    g.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') c.fillRect(ox + x, oy + y, 1, 1); }));
    return cv;
  }

  function canvas(name) {
    let cv = cache.get(name);
    if (cv) return cv;
    if (name.startsWith('move:')) {
      const m = G.Moves.BY_ID[name.slice(5)];
      cv = emblem(m ? m.type : 'normal', m ? m.kind : null);
    } else if (name.startsWith('type:')) {
      cv = emblem(name.slice(5));
    } else if (name.startsWith('zc:')) {
      cv = zcrystal(name.slice(3));
    } else {
      cv = fromRows(UI[name] || UI.star);
    }
    cache.set(name, cv);
    return cv;
  }

  function url(name) {
    let u = urls.get(name);
    if (!u) {
      // Los de interfaz, directamente de su dibujo; los emblemas (tipos, movimientos), del canvas.
      const plain = !name.startsWith('move:') && !name.startsWith('type:') && !name.startsWith('zc:');
      u = plain ? svgOfRows(UI[name] || UI.star) : svgOf(canvas(name));
      urls.set(name, u);
    }
    return u;
  }

  /**
   * El icono como SVG de texto (un rectángulo por tramo de píxeles iguales).
   * toDataURL() hacía lo mismo en PNG, pero la primera vez el navegador tarda
   * ~175 ms en prepararlo y eso bloqueaba la carga de la página (Lighthouse).
   */
  function svgDoc(W, H, rects) {
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${rects}</svg>`);
  }

  /** Igual que fromRows() pero sin canvas (ni lectura de píxeles). */
  function svgOfRows(def) {
    const h = def.rows.length, w = Math.max(...def.rows.map(r => r.length));
    const pad = def.outline ? 1 : 0;
    const pal = Object.assign({ k: K }, def.pal);
    const px = new Map();
    if (def.outline) def.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.' || ch === ' ') return;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) px.set((x + pad + dx) + ',' + (y + pad + dy), K);
    }));
    def.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.' || ch === ' ' || !pal[ch]) return;
      px.set((x + pad) + ',' + (y + pad), pal[ch]);
    }));
    let out = '';
    for (const [k, c] of px) { const [x, y] = k.split(','); out += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`; }
    return svgDoc(w + pad * 2, h + pad * 2, out);
  }

  function svgOf(cv) {
    const W = cv.width, H = cv.height;
    const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    let out = '';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W;) {
        const i = (y * W + x) * 4, a = d[i + 3];
        if (!a) { x++; continue; }
        let n = 1;
        while (x + n < W && d[i + n * 4] === d[i] && d[i + n * 4 + 1] === d[i + 1] && d[i + n * 4 + 2] === d[i + 2] && d[i + n * 4 + 3] === a) n++;
        const hex = '#' + ((1 << 24) | (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]).toString(16).slice(1);
        out += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${hex}"${a < 255 ? ` fill-opacity="${(a / 255).toFixed(3)}"` : ''}/>`;
        x += n;
      }
    }
    return svgDoc(W, H, out);
  }

  /**
   * Ajusta el tamaño a un múltiplo entero de la resolución del icono: un
   * icono de 16 px pintado a 24 duplicaría unos píxeles sí y otros no.
   */
  function snap(name, size) {
    const w = canvas(name).width;
    return w * Math.max(1, Math.round(size / w));
  }

  /** <img> pixelado para el DOM. */
  function html(name, size = 20, cls = '') {
    const cv = canvas(name), w = snap(name, size), h = w * cv.height / cv.width;
    return `<img class="pix ${cls}" src="${url(name)}" width="${w}" height="${h}" alt="" draggable="false">`;
  }

  function draw(ctx, name, x, y, size) {
    const cv = canvas(name);
    const s2 = snap(name, size);
    x += (size - s2) / 2; y += (size - s2) / 2; size = s2;
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, Math.round(x), Math.round(y), size, size * cv.height / cv.width);
    ctx.imageSmoothingEnabled = prev;
  }

  /**
   * Centelleo de shiny, dibujado píxel a píxel (no es un icono): una cruz que
   * nace, crece, echa puntas en diagonal y se apaga, como en los juegos.
   * phase 0..1 · px = tamaño de píxel en pantalla.
   */
  function twinkle(ctx, x, y, phase, px = 2) {
    const st = phase < 0.15 ? 0 : phase < 0.32 ? 1 : phase < 0.62 ? 2 : phase < 0.82 ? 1 : 0;
    const X = Math.round(x / px) * px, Y = Math.round(y / px) * px;
    const dot = (dx, dy, c) => { ctx.fillStyle = c; ctx.fillRect(X + dx * px, Y + dy * px, px, px); };
    const ARM = '#fff3a8', TIP = '#9ae6ff';
    dot(0, 0, '#ffffff');
    if (st >= 1) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(dx, dy, ARM);
    if (st >= 2) {
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) dot(dx, dy, ARM);
      for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) dot(dx, dy, TIP);
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) dot(dx, dy, TIP);
    }
  }

  /**
   * Rareza como Poké Ball: Poké (Común), Super (Poco común), Ultra (Rara),
   * Lujo (Épica) y Master (Legendaria).
   */
  const RARITY_BALL = { 1: 'ball', 2: 'ball2', 3: 'ball3', 4: 'ballLux', 5: 'ball4' };
  function rarity(n, size = 12) {
    return `<span class="rarity-ball" title="${(G.Gacha && G.Gacha.RARITY_NAME[n]) || ''}">${html(RARITY_BALL[n] || 'ball', size)}</span>`;
  }

  /** Publica en CSS los iconos que usan las hojas de estilo. */
  function installCss() {
    const r = document.documentElement.style;
    r.setProperty('--ico-coin', `url("${url('coin')}")`);
    r.setProperty('--ico-cursor', `url("${url('cursor')}")`);
  }

  return { canvas, url, html, draw, twinkle, rarity, RARITY_BALL, installCss, UI, TYPE_GLYPH };
})();
