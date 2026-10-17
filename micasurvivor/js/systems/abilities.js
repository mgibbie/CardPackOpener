/* ============ abilities.js — habilidades pasivas (una por Pokémon) ============
 * MicaSurvivor (M5, lote 2; del port de Android de JayElDragon, MIT: scripts/abilities.gd y sus
 * ganchos en main.gd 468, 1325-1381, 1820-1829, 1878-1884, 2508-2520, 3974-3980, 4373, 5057,
 * 6310). 54 habilidades con los números del port; cada Pokémon tiene la suya (BY_DEX) y los que
 * no salen en la tabla llevan Mutatipo, como en el port.
 *
 * Qué hace cada clave de `fx` y dónde se aplica:
 *   pinch, pinch_k   por debajo del 40 % de vida, +k a los movimientos de ese tipo   (outK)
 *   dmg              +daño a todo                                                  (atkK)
 *   moxie, moxie_cap +moxie por cada 40 derrotas de la run, con tope                (atkK)
 *   defiant          al recibir un golpe, +k de daño durante 4 s                    (inK / atkK)
 *   owntype          +k con movimientos de un tipo de tu Pokémon                    (outK)
 *   typedmg          {tipo: k}: +k con movimientos de ese tipo                      (outK)
 *   kind_dmg, kind_k +k con movimientos de esas familias (melee, projectile...)     (outK)
 *   boss_dmg         +k contra jefes                                                (outK)
 *   tinted           +k en los golpes poco eficaces                                 (outK)
 *   crit             +probabilidad de crítico                                       (set)
 *   spd              +velocidad                                                     (spdK)
 *   wspd, wspd_k     +k de velocidad con ese clima (con intensidad > 0,5)           (spdK)
 *   cd               -k de recarga                                                  (set)
 *   magnet, xp, coin +k de imán / experiencia / Pokémonedas al acabar               (set)
 *   regen            recuperas k de tu vida máxima por segundo                      (regen)
 *   taken            -k de daño recibido (suma con la defensa, tope 80 %)           (taken)
 *   resist, resist_k los ataques de esos tipos te hacen ×k                          (inK)
 *   se_taken         los súper eficaces te hacen -k                                 (inK)
 *   first_hit        el primer golpe cada N s te hace la mitad                      (inK)
 *   sturdy           un golpe mortal te deja con 1 de vida (cada N s)               (sturdy)
 *   contact, contact_p  al tocarte un enemigo: probabilidad de quemarlo / envenenarlo /
 *                    paralizarlo / confundirlo / dormirlo (G.Status)                (contact)
 *   thorns           quien te toca recibe 12 + 3 × nivel                            (contact)
 *   trapimm          las trampas del mapa no te afectan                             (trapImmune)
 *   wximm            el clima (arena / nieve) no te quita vida                      (weatherImmune)
 *   stimm            inmune a esos estados (trampas de sueño, confusión, parálisis, congelación)
 *                    (statusImmune: el gancho está listo; en la web todavía no hay trampas que
 *                    te pongan esos estados, llegarán con el resto del port)
 *
 * Equipo (lote 7): la habilidad es la del Pokémon ACTIVO. G.Abilities.set(pl, id) quita la de
 * antes (deshace sus multiplicadores) y pone la nueva; los relojes (Robustez, Multiescala) son
 * del jugador, como en el port (ab_sturdy_t / ab_first_t no se reinician al cambiar).
 */
G.Abilities = (() => {
  const FX = {
    blaze: { name: 'Mar Llamas', desc: 'Por debajo del 40% de vida, tus movimientos de Fuego hacen +35% de daño.',
      fx: {pinch: 'fire', pinch_k: 0.35} },
    overgrow: { name: 'Espesura', desc: 'Por debajo del 40% de vida, tus movimientos de Planta hacen +35% de daño.',
      fx: {pinch: 'grass', pinch_k: 0.35} },
    torrent: { name: 'Torrente', desc: 'Por debajo del 40% de vida, tus movimientos de Agua hacen +35% de daño.',
      fx: {pinch: 'water', pinch_k: 0.35} },
    swarm: { name: 'Enjambre', desc: 'Por debajo del 40% de vida, tus movimientos de Bicho hacen +35% de daño.',
      fx: {pinch: 'bug', pinch_k: 0.35} },
    intimidate: { name: 'Intimidación', desc: 'Los enemigos te hacen un 10% menos de daño.',
      fx: {taken: 0.1} },
    levitate: { name: 'Levitación', desc: 'Eres inmune a las trampas del mapa.',
      fx: {trapimm: 1} },
    static: { name: 'Elec. Estática', desc: 'Al golpearte cuerpo a cuerpo, 25% de paralizar al enemigo.',
      fx: {contact: 'para', contact_p: 0.25} },
    flamebody: { name: 'Cuerpo Llama', desc: 'Al golpearte cuerpo a cuerpo, 25% de quemar al enemigo.',
      fx: {contact: 'burn', contact_p: 0.25} },
    poisonpoint: { name: 'Punto Tóxico', desc: 'Al golpearte cuerpo a cuerpo, 25% de envenenar al enemigo.',
      fx: {contact: 'poison', contact_p: 0.25} },
    cutecharm: { name: 'Gran Encanto', desc: 'Al golpearte cuerpo a cuerpo, 25% de confundir al enemigo.',
      fx: {contact: 'conf', contact_p: 0.25} },
    effectspore: { name: 'Efecto Espora', desc: 'Al golpearte cuerpo a cuerpo, 20% de dormir al enemigo.',
      fx: {contact: 'sleep', contact_p: 0.2} },
    roughskin: { name: 'Piel Tosca', desc: 'Los que te golpean cuerpo a cuerpo reciben daño.',
      fx: {thorns: 1} },
    thickfat: { name: 'Sebo', desc: 'Recibes la mitad de daño de ataques de Fuego y Hielo.',
      fx: {resist: ['fire', 'ice'], resist_k: 0.5} },
    waterabsorb: { name: 'Absorbe Agua', desc: 'Recibes la mitad de daño de ataques de Agua.',
      fx: {resist: ['water'], resist_k: 0.5} },
    voltabsorb: { name: 'Absorbe Elec', desc: 'Recibes la mitad de daño de ataques Eléctricos.',
      fx: {resist: ['electric'], resist_k: 0.5} },
    flashfire: { name: 'Absorbe Fuego', desc: 'Recibes la mitad de daño de ataques de Fuego.',
      fx: {resist: ['fire'], resist_k: 0.5} },
    sapsipper: { name: 'Herbívoro', desc: 'Recibes la mitad de daño de ataques de Planta.',
      fx: {resist: ['grass'], resist_k: 0.5} },
    hugepower: { name: 'Potencia', desc: '+25% de daño.',
      fx: {dmg: 0.25} },
    sturdy: { name: 'Robustez', desc: 'Un golpe que te dejaría KO te deja con 1 de vida (cada 90 s).',
      fx: {sturdy: 90} },
    regenerator: { name: 'Regeneración', desc: 'Recuperas un 1% de tu vida por segundo.',
      fx: {regen: 0.01} },
    speedboost: { name: 'Impulso', desc: '+12% de velocidad.',
      fx: {spd: 0.12} },
    swiftswim: { name: 'Nado Rápido', desc: '+30% de velocidad con lluvia.',
      fx: {wspd: 'rain', wspd_k: 0.3} },
    chlorophyll: { name: 'Clorofila', desc: '+30% de velocidad con sol.',
      fx: {wspd: 'sun', wspd_k: 0.3} },
    sandrush: { name: 'Ímpetu Arena', desc: '+30% de velocidad en tormenta de arena y eres inmune a ella.',
      fx: {wspd: 'sand', wspd_k: 0.3, wximm: 1} },
    slushrush: { name: 'Quitanieves', desc: '+30% de velocidad con nieve y eres inmune a ella.',
      fx: {wspd: 'snow', wspd_k: 0.3, wximm: 1} },
    sandveil: { name: 'Velo Arena', desc: 'Eres inmune al daño del clima (arena y nieve).',
      fx: {wximm: 1} },
    technician: { name: 'Experto', desc: '+10% de daño.',
      fx: {dmg: 0.1} },
    ironfist: { name: 'Puño Férreo', desc: '+20% de daño con movimientos cuerpo a cuerpo.',
      fx: {kind_dmg: ['melee'], kind_k: 0.2} },
    megalauncher: { name: 'Megadisparador', desc: '+20% de daño con proyectiles y rayos.',
      fx: {kind_dmg: ['projectile', 'beam', 'boomerang', 'cone', 'chain', 'meteor'], kind_k: 0.2} },
    adaptability: { name: 'Adaptable', desc: '+20% de daño con movimientos del tipo de tu Pokémon.',
      fx: {owntype: 0.2} },
    compoundeyes: { name: 'Ojo Compuesto', desc: '+10% de probabilidad de golpe crítico.',
      fx: {crit: 0.1} },
    luck: { name: 'Afortunado', desc: '+8% de crítico y +10% de Pokémonedas.',
      fx: {crit: 0.08, coin: 0.1} },
    pickup: { name: 'Recogida', desc: '+20% de Pokémonedas al acabar la run.',
      fx: {coin: 0.2} },
    magnetpull: { name: 'Imán', desc: '+40% de alcance de imán.',
      fx: {magnet: 0.4} },
    earlybird: { name: 'Madrugar', desc: '+12% de experiencia.',
      fx: {xp: 0.12} },
    runaway: { name: 'Fuga', desc: '+8% de velocidad y +5% de experiencia.',
      fx: {spd: 0.08, xp: 0.05} },
    innerfocus: { name: 'Foco Interno', desc: 'Eres inmune a las trampas de sueño y confusión.',
      fx: {stimm: ['sleep', 'conf']} },
    limber: { name: 'Flexibilidad', desc: 'Eres inmune a las trampas de parálisis y congelación.',
      fx: {stimm: ['para', 'freeze']} },
    battlearmor: { name: 'Armadura Batalla', desc: 'Recibes un 8% menos de daño.',
      fx: {taken: 0.08} },
    solidrock: { name: 'Roca Sólida', desc: 'Recibes un 25% menos de daño de ataques súper efectivos.',
      fx: {se_taken: 0.25} },
    multiscale: { name: 'Multiescala', desc: 'El primer golpe que recibes (cada 25 s) hace la mitad de daño.',
      fx: {first_hit: 25} },
    furcoat: { name: 'Pelaje Recio', desc: 'Recibes un 12% menos de daño.',
      fx: {taken: 0.12} },
    guts: { name: 'Agallas', desc: '+12% de daño y +4% de defensa.',
      fx: {dmg: 0.12, taken: 0.04} },
    moxie: { name: 'Autoestima', desc: 'Cada 40 derrotas ganas +2% de daño (máx. +20%).',
      fx: {moxie: 0.02, moxie_cap: 0.2} },
    prankster: { name: 'Bromista', desc: '-10% de recarga en tus movimientos.',
      fx: {cd: 0.1} },
    tintedlens: { name: 'Cromolente', desc: 'Tus golpes poco eficaces hacen +40% de daño.',
      fx: {tinted: 0.4} },
    defiant: { name: 'Competitivo', desc: 'Al recibir un golpe, +15% de daño durante 4 s.',
      fx: {defiant: 0.15} },
    moldbreaker: { name: 'Rompemoldes', desc: '+10% de daño contra jefes y +6% contra el resto.',
      fx: {boss_dmg: 0.1, dmg: 0.06} },
    wonderguard: { name: 'Superguarda', desc: 'Recibes un 35% menos de daño.',
      fx: {taken: 0.35} },
    drought: { name: 'Sequía', desc: '+15% de daño con movimientos de Fuego.',
      fx: {typedmg: {fire: 0.15}} },
    drizzle: { name: 'Llovizna', desc: '+15% de daño con movimientos de Agua.',
      fx: {typedmg: {water: 0.15}} },
    snowwarning: { name: 'Nevada', desc: '+15% de daño con movimientos de Hielo.',
      fx: {typedmg: {ice: 0.15}} },
    sandstream: { name: 'Chorro Arena', desc: '+15% de daño de Roca y Tierra, e inmunidad a la arena.',
      fx: {typedmg: {rock: 0.15, ground: 0.15}, wximm: 1} },
    protean: { name: 'Mutatipo', desc: '+8% de daño y +4% de velocidad.',
      fx: {dmg: 0.08, spd: 0.04} },
  };

  // Pokémon (nº de la Pokédex) -> habilidad (abilities.gd BY_DEX; 966 entradas).
  const BY_DEX = {
    1:'overgrow',2:'overgrow',3:'overgrow',4:'blaze',5:'blaze',6:'blaze',7:'torrent',8:'torrent',9:'torrent',10:'battlearmor',11:'regenerator',12:'compoundeyes',
    13:'battlearmor',14:'regenerator',15:'swarm',16:'compoundeyes',17:'compoundeyes',18:'compoundeyes',19:'runaway',20:'runaway',21:'compoundeyes',22:'compoundeyes',23:'intimidate',24:'intimidate',
    25:'static',26:'static',27:'sandveil',28:'sandveil',29:'poisonpoint',30:'poisonpoint',31:'poisonpoint',32:'poisonpoint',33:'poisonpoint',34:'poisonpoint',35:'cutecharm',36:'cutecharm',
    37:'flashfire',38:'flashfire',39:'cutecharm',40:'cutecharm',41:'innerfocus',42:'innerfocus',43:'chlorophyll',44:'chlorophyll',45:'chlorophyll',46:'effectspore',47:'effectspore',48:'compoundeyes',
    49:'battlearmor',50:'sandveil',51:'sandveil',52:'pickup',53:'limber',54:'waterabsorb',55:'waterabsorb',56:'innerfocus',57:'innerfocus',58:'intimidate',59:'intimidate',60:'waterabsorb',
    61:'waterabsorb',62:'waterabsorb',63:'innerfocus',64:'innerfocus',65:'innerfocus',66:'guts',67:'guts',68:'guts',69:'chlorophyll',70:'chlorophyll',71:'chlorophyll',72:'battlearmor',
    73:'battlearmor',74:'battlearmor',75:'battlearmor',76:'battlearmor',77:'runaway',78:'runaway',79:'innerfocus',80:'innerfocus',81:'magnetpull',82:'magnetpull',83:'compoundeyes',84:'runaway',
    85:'runaway',86:'thickfat',87:'thickfat',88:'intimidate',89:'intimidate',90:'battlearmor',91:'battlearmor',92:'levitate',93:'levitate',94:'effectspore',95:'battlearmor',96:'innerfocus',
    97:'innerfocus',98:'ironfist',99:'ironfist',100:'battlearmor',101:'battlearmor',102:'chlorophyll',103:'chlorophyll',104:'battlearmor',105:'battlearmor',106:'limber',107:'compoundeyes',108:'innerfocus',
    109:'levitate',110:'levitate',111:'voltabsorb',112:'voltabsorb',113:'regenerator',114:'chlorophyll',115:'earlybird',116:'swiftswim',117:'poisonpoint',118:'swiftswim',119:'swiftswim',120:'compoundeyes',
    121:'compoundeyes',122:'battlearmor',123:'swarm',124:'innerfocus',125:'static',126:'flamebody',127:'ironfist',128:'intimidate',129:'swiftswim',130:'intimidate',131:'waterabsorb',132:'limber',
    133:'runaway',134:'waterabsorb',135:'voltabsorb',136:'flashfire',137:'protean',138:'swiftswim',139:'swiftswim',140:'swiftswim',141:'swiftswim',142:'battlearmor',143:'limber',144:'battlearmor',
    145:'battlearmor',146:'battlearmor',147:'regenerator',148:'regenerator',149:'innerfocus',150:'battlearmor',151:'innerfocus',152:'overgrow',153:'overgrow',154:'overgrow',155:'blaze',156:'blaze',
    157:'blaze',158:'torrent',159:'torrent',160:'torrent',161:'runaway',162:'runaway',163:'innerfocus',164:'innerfocus',165:'swarm',166:'swarm',167:'swarm',168:'swarm',
    169:'innerfocus',170:'voltabsorb',171:'voltabsorb',172:'static',173:'cutecharm',174:'cutecharm',175:'compoundeyes',176:'compoundeyes',177:'innerfocus',178:'innerfocus',179:'static',180:'static',
    181:'static',182:'chlorophyll',183:'thickfat',184:'thickfat',185:'sturdy',186:'waterabsorb',187:'chlorophyll',188:'chlorophyll',189:'chlorophyll',190:'runaway',191:'chlorophyll',192:'chlorophyll',
    193:'speedboost',194:'waterabsorb',195:'waterabsorb',196:'innerfocus',197:'innerfocus',198:'innerfocus',199:'innerfocus',200:'levitate',201:'levitate',202:'protean',203:'innerfocus',204:'sturdy',
    205:'sturdy',206:'luck',207:'ironfist',208:'battlearmor',209:'intimidate',210:'intimidate',211:'poisonpoint',212:'swarm',213:'sturdy',214:'swarm',215:'innerfocus',216:'pickup',
    217:'guts',218:'limber',219:'limber',220:'innerfocus',221:'innerfocus',222:'compoundeyes',223:'compoundeyes',224:'battlearmor',225:'innerfocus',226:'swiftswim',227:'compoundeyes',228:'earlybird',
    229:'earlybird',230:'swiftswim',231:'pickup',232:'sturdy',233:'protean',234:'intimidate',235:'innerfocus',236:'guts',237:'intimidate',238:'innerfocus',239:'static',240:'flamebody',
    241:'thickfat',242:'regenerator',243:'battlearmor',244:'battlearmor',245:'battlearmor',246:'guts',247:'regenerator',248:'sandstream',249:'battlearmor',250:'battlearmor',251:'regenerator',252:'overgrow',
    253:'overgrow',254:'overgrow',255:'blaze',256:'blaze',257:'blaze',258:'torrent',259:'torrent',260:'torrent',261:'runaway',262:'intimidate',263:'pickup',264:'pickup',
    265:'battlearmor',266:'regenerator',267:'swarm',268:'regenerator',269:'battlearmor',270:'swiftswim',271:'swiftswim',272:'swiftswim',273:'chlorophyll',274:'chlorophyll',275:'chlorophyll',276:'guts',
    277:'guts',278:'compoundeyes',279:'compoundeyes',280:'innerfocus',281:'innerfocus',282:'innerfocus',283:'swiftswim',284:'intimidate',285:'effectspore',286:'effectspore',287:'protean',288:'innerfocus',
    289:'protean',290:'compoundeyes',291:'speedboost',292:'wonderguard',293:'battlearmor',294:'battlearmor',295:'battlearmor',296:'thickfat',297:'thickfat',298:'thickfat',299:'sturdy',300:'cutecharm',
    301:'cutecharm',302:'compoundeyes',303:'ironfist',304:'sturdy',305:'sturdy',306:'sturdy',307:'hugepower',308:'hugepower',309:'static',310:'static',311:'voltabsorb',312:'voltabsorb',
    313:'compoundeyes',314:'innerfocus',315:'regenerator',316:'poisonpoint',317:'poisonpoint',318:'roughskin',319:'roughskin',320:'limber',321:'limber',322:'innerfocus',323:'limber',324:'battlearmor',
    325:'thickfat',326:'thickfat',327:'innerfocus',328:'ironfist',329:'levitate',330:'levitate',331:'sandveil',332:'sandveil',333:'regenerator',334:'regenerator',335:'limber',336:'regenerator',
    337:'levitate',338:'levitate',339:'innerfocus',340:'innerfocus',341:'ironfist',342:'ironfist',343:'levitate',344:'levitate',345:'battlearmor',346:'battlearmor',347:'battlearmor',348:'battlearmor',
    349:'swiftswim',350:'furcoat',351:'protean',352:'protean',353:'innerfocus',354:'innerfocus',355:'levitate',356:'battlearmor',357:'chlorophyll',358:'levitate',359:'battlearmor',360:'protean',
    361:'innerfocus',362:'innerfocus',363:'thickfat',364:'thickfat',365:'thickfat',366:'battlearmor',367:'swiftswim',368:'swiftswim',369:'swiftswim',370:'swiftswim',371:'battlearmor',372:'battlearmor',
    373:'intimidate',374:'battlearmor',375:'battlearmor',376:'battlearmor',377:'battlearmor',378:'battlearmor',379:'battlearmor',380:'levitate',381:'levitate',382:'drizzle',383:'drought',384:'sandveil',
    385:'luck',386:'battlearmor',387:'overgrow',388:'overgrow',389:'overgrow',390:'blaze',391:'blaze',392:'blaze',393:'torrent',394:'torrent',395:'torrent',396:'compoundeyes',
    397:'intimidate',398:'intimidate',399:'protean',400:'protean',401:'regenerator',402:'swarm',403:'moxie',404:'moxie',405:'moxie',406:'regenerator',407:'regenerator',408:'moldbreaker',
    409:'moldbreaker',410:'sturdy',411:'sturdy',412:'regenerator',413:'innerfocus',414:'swarm',415:'pickup',416:'battlearmor',417:'runaway',418:'swiftswim',419:'swiftswim',420:'chlorophyll',
    421:'chlorophyll',422:'battlearmor',423:'battlearmor',424:'technician',425:'roughskin',426:'roughskin',427:'runaway',428:'cutecharm',429:'levitate',430:'innerfocus',431:'limber',432:'thickfat',
    433:'levitate',434:'intimidate',435:'intimidate',436:'levitate',437:'levitate',438:'sturdy',439:'battlearmor',440:'regenerator',441:'compoundeyes',442:'battlearmor',443:'sandveil',444:'sandveil',
    445:'sandveil',446:'pickup',447:'innerfocus',448:'innerfocus',449:'sandstream',450:'sandstream',451:'battlearmor',452:'battlearmor',453:'innerfocus',454:'innerfocus',455:'levitate',456:'swiftswim',
    457:'swiftswim',458:'swiftswim',459:'snowwarning',460:'snowwarning',461:'battlearmor',462:'magnetpull',463:'innerfocus',464:'voltabsorb',465:'chlorophyll',466:'voltabsorb',467:'flamebody',468:'compoundeyes',
    469:'speedboost',470:'chlorophyll',471:'sandveil',472:'ironfist',473:'innerfocus',474:'adaptability',475:'innerfocus',476:'sturdy',477:'battlearmor',478:'sandveil',479:'levitate',480:'levitate',
    481:'levitate',482:'levitate',483:'battlearmor',484:'battlearmor',485:'flashfire',486:'protean',487:'battlearmor',488:'levitate',489:'regenerator',490:'regenerator',491:'protean',492:'regenerator',
    493:'protean',494:'luck',495:'overgrow',496:'overgrow',497:'overgrow',498:'blaze',499:'blaze',500:'blaze',501:'torrent',502:'torrent',503:'torrent',504:'runaway',
    505:'compoundeyes',506:'innerfocus',507:'intimidate',508:'intimidate',509:'limber',510:'limber',511:'regenerator',512:'regenerator',513:'regenerator',515:'regenerator',517:'innerfocus',518:'innerfocus',
    519:'battlearmor',521:'battlearmor',524:'sturdy',525:'sturdy',526:'sturdy',527:'battlearmor',528:'battlearmor',529:'sandrush',530:'sandrush',531:'regenerator',532:'guts',533:'guts',
    534:'guts',535:'swiftswim',536:'swiftswim',537:'swiftswim',539:'sturdy',540:'swarm',541:'chlorophyll',542:'swarm',543:'poisonpoint',544:'poisonpoint',545:'poisonpoint',546:'prankster',
    547:'prankster',548:'chlorophyll',549:'chlorophyll',550:'ironfist',551:'intimidate',552:'intimidate',553:'intimidate',554:'compoundeyes',555:'moldbreaker',556:'waterabsorb',557:'sturdy',559:'regenerator',
    560:'regenerator',561:'battlearmor',562:'roughskin',563:'roughskin',566:'protean',567:'protean',568:'intimidate',569:'intimidate',570:'protean',571:'protean',572:'cutecharm',573:'cutecharm',
    574:'innerfocus',575:'innerfocus',576:'innerfocus',577:'sandveil',578:'sandveil',579:'sandveil',580:'compoundeyes',581:'compoundeyes',582:'regenerator',583:'regenerator',584:'regenerator',585:'chlorophyll',
    586:'chlorophyll',587:'static',588:'swarm',589:'swarm',590:'effectspore',594:'regenerator',595:'compoundeyes',596:'compoundeyes',597:'roughskin',598:'roughskin',599:'voltabsorb',600:'voltabsorb',
    601:'voltabsorb',602:'levitate',603:'levitate',604:'levitate',605:'innerfocus',606:'innerfocus',607:'flashfire',608:'flashfire',609:'flashfire',610:'moxie',611:'moxie',612:'moxie',
    613:'sandveil',614:'sandveil',615:'levitate',617:'regenerator',619:'innerfocus',620:'innerfocus',621:'roughskin',622:'ironfist',623:'ironfist',624:'defiant',625:'defiant',627:'compoundeyes',
    628:'compoundeyes',629:'battlearmor',630:'battlearmor',631:'regenerator',632:'swarm',633:'compoundeyes',634:'compoundeyes',635:'levitate',636:'flamebody',637:'flamebody',638:'defiant',639:'defiant',
    640:'defiant',641:'prankster',642:'prankster',643:'moldbreaker',644:'moldbreaker',645:'sandstream',646:'battlearmor',647:'defiant',648:'luck',649:'protean',650:'overgrow',651:'overgrow',
    652:'overgrow',653:'blaze',654:'blaze',655:'blaze',656:'torrent',657:'torrent',658:'torrent',659:'pickup',660:'pickup',661:'battlearmor',662:'flamebody',663:'flamebody',
    664:'battlearmor',665:'regenerator',666:'battlearmor',667:'moxie',669:'battlearmor',670:'battlearmor',671:'battlearmor',672:'sapsipper',673:'sapsipper',674:'ironfist',675:'ironfist',676:'furcoat',
    677:'compoundeyes',678:'compoundeyes',679:'compoundeyes',680:'compoundeyes',681:'protean',682:'regenerator',684:'innerfocus',685:'innerfocus',686:'protean',687:'protean',688:'ironfist',689:'ironfist',
    690:'poisonpoint',691:'poisonpoint',692:'megalauncher',693:'megalauncher',694:'waterabsorb',695:'waterabsorb',696:'ironfist',697:'ironfist',698:'protean',699:'protean',700:'cutecharm',701:'limber',
    702:'regenerator',703:'battlearmor',704:'sapsipper',705:'sapsipper',706:'sapsipper',707:'prankster',708:'regenerator',709:'regenerator',710:'pickup',711:'pickup',712:'innerfocus',713:'innerfocus',
    714:'innerfocus',715:'innerfocus',716:'protean',717:'protean',718:'protean',719:'battlearmor',720:'pickup',721:'waterabsorb',722:'overgrow',723:'overgrow',724:'overgrow',725:'blaze',
    726:'blaze',727:'blaze',728:'torrent',729:'torrent',730:'torrent',731:'compoundeyes',734:'compoundeyes',736:'swarm',737:'voltabsorb',738:'levitate',739:'ironfist',740:'ironfist',
    741:'prankster',742:'pickup',743:'pickup',744:'compoundeyes',745:'compoundeyes',746:'protean',747:'poisonpoint',748:'poisonpoint',749:'innerfocus',750:'innerfocus',751:'waterabsorb',752:'waterabsorb',
    753:'chlorophyll',754:'chlorophyll',755:'compoundeyes',757:'poisonpoint',758:'poisonpoint',759:'furcoat',760:'furcoat',761:'chlorophyll',762:'chlorophyll',763:'chlorophyll',764:'battlearmor',766:'protean',
    767:'runaway',768:'sturdy',769:'battlearmor',770:'battlearmor',771:'roughskin',772:'battlearmor',773:'protean',774:'sturdy',775:'sturdy',776:'battlearmor',777:'roughskin',778:'sturdy',
    779:'battlearmor',780:'defiant',781:'ironfist',782:'battlearmor',783:'battlearmor',784:'battlearmor',785:'voltabsorb',786:'innerfocus',787:'sapsipper',788:'protean',789:'battlearmor',790:'sturdy',
    791:'battlearmor',792:'multiscale',793:'moxie',794:'moxie',795:'moxie',796:'moxie',797:'moxie',798:'moxie',799:'moxie',800:'solidrock',801:'moxie',802:'technician',
    803:'moxie',804:'moxie',805:'moxie',806:'moxie',807:'voltabsorb',808:'magnetpull',809:'ironfist',810:'overgrow',811:'overgrow',812:'overgrow',813:'blaze',814:'blaze',
    815:'blaze',816:'torrent',817:'torrent',818:'torrent',819:'regenerator',820:'regenerator',821:'compoundeyes',822:'compoundeyes',823:'battlearmor',824:'swarm',825:'swarm',826:'swarm',
    827:'runaway',828:'runaway',829:'furcoat',830:'furcoat',831:'furcoat',832:'furcoat',833:'ironfist',834:'ironfist',835:'pickup',836:'ironfist',840:'regenerator',841:'regenerator',
    842:'regenerator',843:'sandstream',844:'sandstream',845:'protean',846:'swiftswim',847:'swiftswim',848:'defiant',849:'ironfist',850:'flashfire',851:'flashfire',852:'limber',853:'limber',
    854:'battlearmor',855:'battlearmor',856:'regenerator',857:'regenerator',858:'regenerator',859:'prankster',860:'prankster',861:'prankster',862:'ironfist',863:'battlearmor',864:'battlearmor',867:'protean',
    868:'innerfocus',869:'innerfocus',871:'voltabsorb',872:'battlearmor',873:'battlearmor',874:'protean',875:'sturdy',876:'innerfocus',877:'protean',880:'voltabsorb',881:'voltabsorb',882:'waterabsorb',
    883:'waterabsorb',884:'battlearmor',885:'battlearmor',886:'battlearmor',887:'battlearmor',888:'moxie',889:'furcoat',890:'battlearmor',891:'innerfocus',892:'ironfist',894:'voltabsorb',895:'moldbreaker',
    896:'moxie',897:'moxie',898:'intimidate',899:'intimidate',900:'swarm',901:'guts',902:'swiftswim',903:'battlearmor',904:'poisonpoint',905:'cutecharm',906:'overgrow',907:'overgrow',
    908:'overgrow',909:'blaze',910:'blaze',911:'blaze',912:'torrent',913:'torrent',914:'torrent',915:'innerfocus',916:'poisonpoint',917:'innerfocus',918:'innerfocus',919:'swarm',
    920:'swarm',921:'static',922:'voltabsorb',923:'voltabsorb',924:'runaway',925:'furcoat',926:'innerfocus',927:'flashfire',928:'earlybird',930:'sapsipper',932:'battlearmor',933:'battlearmor',
    934:'battlearmor',935:'flashfire',936:'flashfire',937:'flashfire',938:'innerfocus',939:'voltabsorb',940:'voltabsorb',941:'voltabsorb',946:'runaway',951:'chlorophyll',952:'chlorophyll',953:'compoundeyes',
    955:'innerfocus',957:'moldbreaker',958:'moldbreaker',959:'moldbreaker',960:'roughskin',961:'roughskin',963:'limber',964:'protean',965:'sandveil',966:'sandveil',967:'regenerator',968:'regenerator',
    969:'poisonpoint',970:'poisonpoint',971:'pickup',972:'sandrush',974:'thickfat',975:'thickfat',976:'moldbreaker',977:'battlearmor',978:'protean',979:'innerfocus',980:'poisonpoint',981:'regenerator',
    982:'luck',983:'defiant',984:'moldbreaker',985:'moldbreaker',987:'moldbreaker',988:'moldbreaker',989:'moldbreaker',991:'moldbreaker',992:'moldbreaker',994:'moldbreaker',995:'moldbreaker',996:'flashfire',
    997:'flashfire',998:'flashfire',1000:'furcoat',1004:'moldbreaker',1005:'moldbreaker',1006:'moldbreaker',1007:'drought',1009:'moldbreaker',1010:'moldbreaker',1011:'intimidate',1012:'regenerator',1013:'regenerator',
    1015:'poisonpoint',1016:'poisonpoint',1017:'defiant',1018:'furcoat',1019:'intimidate',1024:'protean'
  };

  const DEFAULT = 'protean';
  const PINCH = 0.4;          // por debajo del 40 % de vida
  const MOXIE_EVERY = 40;     // derrotas por escalón de Autoestima
  const DEFIANT_T = 4;        // segundos de Competitivo
  const WEATHER_MIN = 0.5;    // intensidad del clima que hace falta (main.gd _ab_wspd)
  const THORNS = [12, 3];     // Piel Tosca: 12 + 3 × nivel, empuje 60
  const THORNS_KNOCK = 60;

  // Claves de `fx` que este archivo sabe aplicar (el test comprueba que no queda ninguna sin hacer).
  const HANDLED = ['pinch', 'pinch_k', 'dmg', 'moxie', 'moxie_cap', 'defiant', 'owntype', 'typedmg', 'kind_dmg', 'kind_k',
    'boss_dmg', 'tinted', 'crit', 'spd', 'wspd', 'wspd_k', 'cd', 'magnet', 'xp', 'coin', 'regen', 'taken', 'resist',
    'resist_k', 'se_taken', 'first_hit', 'sturdy', 'contact', 'contact_p', 'thorns', 'trapimm', 'wximm', 'stimm'];

  const of = dex => BY_DEX[dex] || DEFAULT;
  const def = id => FX[id] || FX[DEFAULT];
  const fxOf = pl => (pl && pl.abFx) || {};
  const n = (pl, k) => +(fxOf(pl)[k] || 0);

  /** Lo que la habilidad cambia de golpe en los stats del jugador (y se deshace al quitarla). */
  function statOn(p, fx, sign) {
    const mul = (k, v) => { if (v !== 1) p[k] = sign > 0 ? p[k] * v : p[k] / v; };
    mul('cdMul', fx.cd ? 1 - fx.cd : 1);
    mul('magnet', fx.magnet ? 1 + fx.magnet : 1);
    mul('xpMul', fx.xp ? 1 + fx.xp : 1);
    mul('coinMul', fx.coin ? 1 + fx.coin : 1);
    if (fx.crit) p.critChance = (p.critChance || 0) + sign * fx.crit;
  }

  /**
   * Pone a `pl` la habilidad `id` (por defecto, la de su Pokémon). La de antes se quita.
   * Es lo que llamará el modo Equipo al cambiar de Pokémon.
   */
  function set(pl, id) {
    if (!pl) return null;
    id = FX[id] ? id : of(pl.dex);
    if (pl.abT == null) { pl.abT = 0; pl.abFirstT = -999; pl.abSturdyT = -999; pl.defiantT = 0; }
    if (pl.ability === id) return id;
    if (pl.ability) statOn(pl, FX[pl.ability].fx, -1);
    pl.ability = id;
    pl.abFx = FX[id].fx;
    statOn(pl, pl.abFx, +1);
    return id;
  }

  /** Cada fotograma (Player.update): el reloj de la run y Competitivo. */
  function tick(pl, dt) {
    pl.abT = (pl.abT || 0) + dt;
    if (pl.defiantT > 0) pl.defiantT = Math.max(0, pl.defiantT - dt);
  }

  // ---------------- stats ----------------

  /** Autoestima: +2 % por cada 40 derrotas de la run (tope +20 %). */
  function moxie(pl) {
    const st = n(pl, 'moxie');
    return st > 0 ? Math.min(n(pl, 'moxie_cap'), Math.floor((pl.kills || 0) / MOXIE_EVERY) * st) : 0;
  }

  /** Multiplicador de ataque (main.gd _atk): 1 + daño + Autoestima + Competitivo activo. */
  function atkK(pl) {
    if (!pl || !pl.abFx) return 1;
    return 1 + n(pl, 'dmg') + moxie(pl) + (pl.defiantT > 0 ? n(pl, 'defiant') : 0);
  }

  /** Velocidad extra con el clima de la habilidad (Nado Rápido, Clorofila...). */
  function wspd(pl) {
    const w = fxOf(pl).wspd;
    const cur = w && G.Weather.current;
    return cur && cur.kind === w && G.Weather.level() > WEATHER_MIN ? n(pl, 'wspd_k') : 0;
  }

  /** Multiplicador de velocidad (main.gd _spd): 1 + velocidad + la del clima. */
  function spdK(pl) { return pl && pl.abFx ? 1 + n(pl, 'spd') + wspd(pl) : 1; }

  /** Reducción de daño que suma la habilidad (main.gd _reduction). */
  function taken(pl) { return n(pl, 'taken'); }

  /** Vida por segundo que da la habilidad (main.gd _regen). */
  function regen(pl) { return pl.maxHp * n(pl, 'regen'); }

  // ---------------- golpes ----------------

  /**
   * Tus golpes (main.gd _hit_enemy 2508-2520). @param kind  familia del movimiento
   * @returns multiplicador del daño contra `e` de un ataque de tipo `mtype`.
   */
  function outK(pl, e, mtype, kind) {
    if (!pl || !pl.abFx) return 1;
    const fx = pl.abFx;
    let k = 1;
    if (fx.pinch && fx.pinch === mtype && pl.hp < pl.maxHp * PINCH) k *= 1 + n(pl, 'pinch_k');
    if (mtype && pl.mon && pl.mon.types.includes(mtype)) k *= 1 + n(pl, 'owntype');
    if (fx.typedmg && mtype) k *= 1 + (fx.typedmg[mtype] || 0);
    if (fx.kind_dmg && kind && fx.kind_dmg.includes(kind)) k *= 1 + n(pl, 'kind_k');
    if (e && e.boss) k *= 1 + n(pl, 'boss_dmg');
    if (fx.tinted && mtype && e && G.Types.label(G.Types.mult(mtype, e.types)) === 'weak') k *= 1 + fx.tinted;
    return k;
  }

  /**
   * Un golpe que recibes (main.gd _hurt_player 1820-1829), ya pasado el parpadeo de invencible.
   * Tipos resistidos, súper eficaces, Multiescala (y su reloj) y Competitivo (lo enciende).
   * @param eff  'super' | 'weak' | null (tabla de tipos)
   * @returns multiplicador del daño.
   */
  function inK(pl, type, eff) {
    if (!pl || !pl.abFx) return 1;
    const fx = pl.abFx;
    let k = 1;
    if (type && fx.resist && fx.resist.includes(type)) k *= fx.resist_k != null ? fx.resist_k : 1;
    if (eff === 'super') k *= 1 - n(pl, 'se_taken');
    if (fx.first_hit && pl.abT - pl.abFirstT > fx.first_hit) {
      pl.abFirstT = pl.abT;
      k *= 0.5;
    }
    if (fx.defiant) pl.defiantT = DEFIANT_T;
    return k;
  }

  /** Robustez (main.gd 1878-1884): un golpe mortal te deja con 1 de vida, cada 90 s. */
  function sturdy(pl) {
    const cd = n(pl, 'sturdy');
    if (!(pl.hp <= 0) || !cd || pl.abT - pl.abSturdyT <= cd) return false;
    pl.abSturdyT = pl.abT;
    pl.hp = 1; pl.invuln = 1.2;
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 16, '¡Robustez!', '#c9b27a', true);
    G.FX.ring(pl.x, pl.y, 6, 70, '#c9b27a', 0.5, 4);
    return true;
  }

  /**
   * Un enemigo te toca (main.gd 3973-3984): Piel Tosca le hace daño y las de contacto le pueden
   * poner un estado (quemar / envenenar: 1 carga; paralizar / confundir / dormir: G.Status).
   */
  function contact(pl, e) {
    if (!pl || !pl.abFx || !e) return;
    const fx = pl.abFx;
    if (fx.thorns) e.hurt(THORNS[0] + pl.level * THORNS[1], '#9aa6b5', e.x - pl.x, e.y - pl.y, THORNS_KNOCK);
    if (fx.contact && !e.dead && Math.random() < n(pl, 'contact_p')) {
      if (fx.contact === 'burn') e.applyBurn(1);
      else if (fx.contact === 'poison') e.applyPoison(1);
      else G.Status.apply(e, fx.contact);
    }
  }

  // (M5 lote 3: también los objetos Botas Gruesas y Gafas Protectoras, main.gd 5057 / 6310.)
  const hasIt = (pl, id) => !!(pl && pl.hasItem && pl.hasItem(id));
  const trapImmune = pl => n(pl, 'trapimm') > 0 || hasIt(pl, 'heavyboots');
  const weatherImmune = pl => n(pl, 'wximm') > 0 || hasIt(pl, 'safetygoggles');
  /** ¿Inmune a este estado? (Foco Interno: sueño y confusión; Flexibilidad: parálisis y congelación) */
  const statusImmune = (pl, kind) => !!(fxOf(pl).stimm && fxOf(pl).stimm.includes(kind));

  /**
   * Para el HUD: lo que hay que enseñar junto al nombre ahora mismo.
   * { on: activa ahora (vida baja, Competitivo, clima, Robustez / Multiescala listas), txt: recarga o bonus ('12s', '+6%') }
   */
  function state(pl) {
    const r = { on: false, txt: '' };
    if (!pl || !pl.abFx) return r;
    const fx = pl.abFx;
    if (fx.pinch && pl.hp < pl.maxHp * PINCH) r.on = true;
    if (fx.defiant && pl.defiantT > 0) r.on = true;
    if (fx.wspd && wspd(pl) > 0) r.on = true;
    const cd = fx.sturdy ? [fx.sturdy, pl.abSturdyT] : fx.first_hit ? [fx.first_hit, pl.abFirstT] : null;
    if (cd) {
      const left = cd[0] - (pl.abT - cd[1]);
      if (left > 0) r.txt = Math.ceil(left) + 's';
      else r.on = true;
    }
    if (fx.moxie) { const m = moxie(pl); if (m > 0) { r.txt = '+' + Math.round(m * 100) + '%'; r.on = true; } }
    return r;
  }

  /** Todas, en el orden del port (enciclopedia, wiki). */
  const list = () => Object.keys(FX).map(id => ({ id, name: FX[id].name, desc: FX[id].desc, fx: FX[id].fx }));

  return { FX, BY_DEX, DEFAULT, HANDLED, PINCH, MOXIE_EVERY, DEFIANT_T, THORNS, of, def, set, tick, moxie, atkK, wspd, spdK,
           taken, regen, outK, inK, sturdy, contact, trapImmune, weatherImmune, statusImmune, state, list,
           name: id => def(id).name, desc: id => def(id).desc };
})();
