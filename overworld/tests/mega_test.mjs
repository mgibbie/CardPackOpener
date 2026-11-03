// mega_test.mjs — MEGA EVOLUTION + PRIMAL REVERSION in the overworld battle engine.
//
// The feature, end to end, through the real engine (headless Chrome + local
// overworld/data):
//   * data: all 99 Megas/Primals as battle forms, wave 1 (48 X/Y+ORAS + 2 Primals)
//     with art + stones + icons, wave 2 (Z-A / Mega Dimension) data-only and OFF;
//     none of them a species (Pokedex, coverage, RIFT PRISM)
//   * the fight menu's MEGA toggle (key M / the MEGA button), once per battle, the
//     KEY STONE required; stats/types/ability change at once and revert at the end
//   * the party SAVE never holds a Mega (mid-battle saves write the base form; the
//     battle snapshot re-applies it on a resume)
//   * Primal Reversion on entering battle (BLUE ORB Kyogre: Primordial Sea's heavy
//     rain douses Fire moves); Parental Bond; Delta Stream
//   * AI trainers (mega.js TRAINER_MEGAS) Mega Evolve their ace, only once the player
//     holds the KEY STONE; doubles; an in-game partner (Steven's Metagross)
//   * acquisition: the 8th badge's leader gives the KEY STONE; the League counters
//     sell the stones to that region's champion; MT. PYRE's old couple keep the ORBS
// Standalone:  node overworld/tests/mega_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 8893;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'mg', friendCode: 'MGMGMG', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 150)); } return false; }

// ---------- static: the data, the art, the items ----------
let M = null;
try { M = await import(pathToFileURL(path.join(ROOT, 'overworld/mega.js')).href); } catch (e) { /* the module is the feature */ }
A(!!M, 'overworld/mega.js exists (the Mega rules module)');
if (M) {
	const F = M.MEGA_FORMS, ids = Object.keys(F);
	const w1 = ids.filter(i => F[i].wave === 1), w2 = ids.filter(i => F[i].wave === 2);
	A(ids.length === 99 && w1.length === 50 && w2.length === 49, `99 Megas/Primals as battle forms: 50 wave 1, 49 wave 2`, `${ids.length}/${w1.length}/${w2.length}`);
	A(F.charizard_mega_x?.types.join('/') === 'Fire/Dragon' && F.charizard_mega_x.ability === 'toughclaws' && F.charizard_mega_x.baseStats.atk === 130,
		'Mega Charizard X: Fire/Dragon, Tough Claws, 130 Atk (Showdown data)');
	A(F.kyogre_primal?.primal && F.kyogre_primal.orb === 'blueorb' && F.groudon_primal?.orb === 'redorb', 'the Primals are keyed to their ORBS');
	A(F.rayquaza_mega?.move === 'dragonascent' && !F.rayquaza_mega.stone, 'Mega Rayquaza needs Dragon Ascent, not a stone');
	const noArt = w1.filter(i => !fs.existsSync(path.join(ROOT, 'overworld/mega_sprites', F[i].sprite))
		|| !fs.existsSync(path.join(ROOT, 'overworld/mega_sprites', F[i].sprite.replace('.png', '-b.png'))));
	A(noArt.length === 0, 'every wave-1 form has its own front AND back sprite in overworld/mega_sprites', noArt.join(','));
	A(M.MEGA_WAVE2_ENABLED === false && w2.every(i => !M.megaEnabled(i)) && w1.every(i => M.megaEnabled(i)), 'wave 2 is switched OFF by the one flag, wave 1 is on');
	const bat = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8'));
	const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_index.json'), 'utf8'));
	A(!ids.some(i => i in bat || i in idx) && !Object.keys(bat).some(k => /_(mega|primal)(_|$)/.test(k)),
		'no Mega is a species: not in species_battle.json or species_index.json (Pokedex / coverage)');
	const Bag = await import(pathToFileURL(path.join(ROOT, 'overworld/bag.js')).href).catch(() => null);
	const w1stones = Object.keys(M.MEGA_STONES).filter(k => M.MEGA_STONES[k].wave === 1);
	A(w1stones.length === 47 && w1stones.every(k => Bag?.ITEMS[k]?.kind === 'held' && Bag.ITEMS[k].held?.megaStone),
		'all 47 wave-1 MEGA STONES are held items in the bag', String(w1stones.filter(k => !Bag?.ITEMS[k]).slice(0, 5)));
	A(Object.keys(M.MEGA_STONES).filter(k => M.MEGA_STONES[k].wave === 2).every(k => !Bag?.ITEMS[k]), 'no wave-2 stone exists as an item');
	A(Bag?.ITEMS.keystone?.kind === 'key' && Bag?.ITEMS.redorb?.held?.primalOrb && Bag?.ITEMS.blueorb?.held?.primalOrb, 'the KEY STONE (key item) and the RED/BLUE ORBS (held)');
	A(Bag?.ITEMS.charizarditex?.name === 'CHARIZARDITE X' && Bag?.ITEMS.venusaurite?.name === 'VENUSAURITE', 'stones carry their real names');
	const icons = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/item_icons_index.json'), 'utf8'));
	const noIcon = [...w1stones, 'keystone', 'redorb', 'blueorb'].filter(k => !icons[k] || !fs.existsSync(path.join(ROOT, 'overworld/item_icons', icons[k])));
	A(noIcon.length === 0, 'every obtainable Mega item has a real icon', noIcon.join(','));
	// the trainers who Mega Evolve
	const party = sp => sp.map(s => ({ speciesId: s }));
	A(M.trainerMegaPick('Gym Leader Wattson', party(['voltorb', 'electrike', 'magneton', 'manectric']))?.stone === 'manectite', 'WATTSON arms Manectric with MANECTITE');
	A(M.trainerMegaPick('Champion WALLACE', party(['wailord', 'gyarados', 'milotic']))?.stone === 'gyaradosite', 'Champion WALLACE arms Gyarados');
	A(M.trainerMegaPick('Champion TERRY', party(['pidgeot', 'venusaur']))?.stone === 'venusaurite', "the FireRed Champion (a player-named rival) arms his starter");
	A(M.trainerMegaPick('Champion RED', party(['pikachu', 'charizard']))?.stone === 'charizarditey', 'RED arms Charizard (Y)');
	A(M.trainerMegaPick('Gym Leader MISTY', party(['starmie', 'lapras'])) === null, 'a wave-2-only ace (Misty\'s Starmie) is never armed');
	A(M.trainerMegaPick('Youngster JOEY', party(['rattata'])) === null, 'an ordinary trainer never Mega Evolves');
}

// ---------- the engine ----------
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
try {
	const page = await browser.newPage();
	page.on('pageerror', e => console.log('pageerror:', e.message));
	await page.evaluateOnNewDocument(st => {
		localStorage.setItem('magepunk_mp_token_v1', 'mg');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'hoenn');
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
		localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'charmeleon', name: 'CHARMELEON', level: 40, gender: 'M', ability: 'blaze', types: ['Fire'], ivs: { hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 }, stats: { hp: 120, atk: 90, def: 80, spa: 95, spd: 80, spe: 90 }, maxHP: 120, curHP: 120, exp: 64000, num: 5, sprite: 's160.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
	const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data?.species && window.__ow.startWildBattle && window.__ow.party)), 45000);
	A(ready, 'battle engine ready');
	if (!ready) throw new Error('no engine');

	const o = await page.evaluate(async () => {
		const ow = window.__ow, B = ow.battle, data = B.data;
		const Bmod = await import('/overworld/battle.js');
		const Bag = await import('/overworld/bag.js');
		const mega = await import('/overworld/mega.js').catch(() => null);
		const a = () => B.active;
		const o = { hasMega: !!mega };
		const drain = (n = 1500) => { const msgs = []; while (a() && a().queue.length && n--) { const e = a().queue.shift(); if (e.text) msgs.push(e.text); if (e.ifAlive && e.ifAlive.curHP <= 0) continue; e.fn?.(); e.anim?.done?.(); } return msgs; };
		const toMenu = async () => { for (let i = 0; i < 200 && a() && a().phase !== 'menu' && a().phase !== 'done'; i++) { drain(); a().msgT = 99; a().foeShownHP = a().foe.curHP; a().meShownHP = a().me.curHP; B.update?.(0.05); await new Promise(r => setTimeout(r, 10)); } };
		const end = () => { if (a() && a().phase !== 'done') B.finish('escaped'); B.active = null; };
		const SAVED = () => JSON.parse(localStorage.getItem('magepunk_party_v1'));
		const mon = (id, lv, item, moves) => {
			const m = Bmod.buildMon(id, lv, data); m.heldItem = item || null;
			if (moves) m.moves = moves.map(k => ({ id: k, name: data.moves[k]?.name || k, pp: 20, maxPp: 20 }));
			return m;
		};
		const setParty = list => { ow.party.length = 0; ow.party.push(...list); };
		const startWild = async (id, lv, second) => { await B.start(ow.party, id, lv, () => {}, second); await toMenu(); a().foe.maxHP = a().foe.curHP = 9999; if (a().foeAlly) a().foeAlly.maxHP = a().foeAlly.curHP = 9999; };
		const bagSet = (id, n) => { const b = Bag.getBag(); if (n) b[id] = n; else delete b[id]; localStorage.setItem('magepunk_bag_v1', JSON.stringify(b)); };

		// ===== 1. the singles flow: the MEGA toggle, once per battle, revert, save =====
		bagSet('keystone', 1);
		const zard = mon('charizard', 60, 'charizarditex', ['flamethrower', 'dragonclaw', 'slash', 'tackle']);
		setParty([zard, mon('pidgeot', 60, 'pidgeotite')]);
		const base = { stats: { ...zard.stats }, types: [...zard.types], ability: zard.ability, sprite: zard.sprite };
		await startWild('snorlax', 60);
		a().foe.moves = [{ id: 'splash', name: 'Splash', pp: 40, maxPp: 40 }];
		o.canMegaAtStart = B.canMega?.(zard) || null;
		a().phase = 'moves'; a().moveIdx = 3;
		B.key('m');
		o.armed = !!a().megaArmed;
		B.key('z');                 // Tackle, with the Mega armed
		const turn1 = drain();
		o.megaLines = turn1.filter(t => /Mega Evolved|reacting to/i.test(t));
		o.formAfter = zard.megaForm || null;
		o.typesAfter = zard.types.join('/');
		o.abilityAfter = zard.ability;
		o.atkUp = zard.stats.atk > base.stats.atk;
		o.hpSame = zard.stats.hp === base.stats.hp;
		o.usedOnce = !!a().megaUsed?.player;
		// the second mon holds a stone too: still no second Mega this battle
		o.secondMega = B.canMega?.(ow.party[1]) || null;
		// the mid-battle save writes the BASE form
		const { saveParty } = await import('/overworld/party.js');
		saveParty(ow.party);
		const sv = SAVED()[0];
		o.savedTypes = sv.types.join('/'); o.savedAbility = sv.ability; o.savedAtk = sv.stats.atk; o.savedMega = sv.megaForm ?? null; o.savedBase = '_megaBase' in sv;
		// the resume snapshot remembers who stood Mega
		const snap = B.snapshot();
		o.snapMine = JSON.stringify(snap?.megaMine); o.snapUsed = !!snap?.megaUsed?.player;
		// the battle ends: everything back
		B.finish('victory');
		o.endTypes = zard.types.join('/'); o.endAbility = zard.ability; o.endAtk = zard.stats.atk === base.stats.atk;
		o.endForm = zard.megaForm ?? null; o.endBase = '_megaBase' in zard;
		saveParty(ow.party);
		o.endSaved = JSON.stringify(SAVED()[0].stats) === JSON.stringify(base.stats) && SAVED()[0].types.join('/') === base.types.join('/');
		end();
		// a reload mid-battle: the party comes back from the save in its base form and
		// the resume puts the Mega back (and keeps it spent)
		const reloaded = SAVED();
		setParty(reloaded);
		await B.start(ow.party, 'snorlax', 60, () => {}, null, { restore: snap });
		o.resumedForm = ow.party[0].megaForm || null; o.resumedTypes = ow.party[0].types.join('/');
		o.resumedUsed = !!a()?.megaUsed?.player;
		B.finish('escaped');
		o.resumeReverted = !ow.party[0].megaForm && ow.party[0].types.join('/') === base.types.join('/');
		end();
		o.baseTypes = base.types.join('/'); o.baseAbility = base.ability;

		// ===== 2. no KEY STONE, no Mega =====
		bagSet('keystone', 0);
		setParty([mon('charizard', 60, 'charizarditex', ['tackle'])]);
		await startWild('snorlax', 60);
		o.noKeyStone = B.canMega ? B.canMega(ow.party[0]) : 'nofn';
		end();
		bagSet('keystone', 1);

		// ===== 3. wave 2 is disabled =====
		setParty([mon('lucario', 60, 'lucarionitez', ['tackle'])]);
		await startWild('snorlax', 60);
		o.wave2 = B.canMega ? B.canMega(ow.party[0]) : 'nofn';
		o.wave2Item = !!Bag.ITEMS.lucarionitez;
		ow.party[0].heldItem = 'lucarionite';   // the wave-1 stone does work
		o.wave1Lucario = B.canMega?.(ow.party[0]) ?? null;
		end();

		// ===== 4. PRIMAL REVERSION: Kyogre + BLUE ORB, on entering battle =====
		const kyo = mon('kyogre', 70, 'blueorb', ['surf', 'tackle']);
		setParty([kyo]);
		await startWild('arcanine', 60);
		o.primalForm = kyo.megaForm || null; o.primalAbility = kyo.ability;
		o.primalWeather = JSON.stringify(a().weather);
		o.primalUsedMega = !!a().megaUsed?.player;     // a Primal is not the once-per-battle Mega
		a().foe.curHP = 9999;
		B.useMove(a().foe, a().foeBoosts, kyo, a().meBoosts, { id: 'flamethrower', name: 'Flamethrower', pp: 15, maxPp: 15 }, true);
		const fz = drain();
		o.fizzled = fz.some(t => /fizzled out in the heavy rain/i.test(t)); o.kyoHP = kyo.curHP === kyo.maxHP;
		o.rainLocked = (() => { B.switchInAbility({ ...Bmod.buildMon('pelipper', 50, data), ability: 'drought', curHP: 50 }, 'foe'); return a().weather?.primal === 'primordialsea'; })();
		B.finish('victory');
		o.primalReverted = !kyo.megaForm && kyo.ability !== 'primordialsea' && kyo.types.join('/') === 'Water';
		end();

		// ===== 5. PARENTAL BOND: Mega Kangaskhan hits twice =====
		setParty([mon('kangaskhan', 60, 'kangaskhanite', ['tackle', 'bodyslam'])]);
		await startWild('snorlax', 60);
		B.megaEvolve?.(ow.party[0]); drain();
		B.useMove(ow.party[0], a().meBoosts, a().foe, a().foeBoosts, ow.party[0].moves[1], false);
		o.parental = drain().some(t => /Hit 2 time/.test(t));
		end();

		// ===== 6. an AI trainer Mega Evolves its ace (only once you hold the KEY STONE) =====
		const trainer = async (name, foes, info = {}) => {
			await B.startTrainer(ow.party, foes, { displayName: name, boss: true, money: 0, ...info }, () => {});
			await toMenu();
		};
		setParty([mon('swampert', 50, null, ['tackle'])]);
		const manectric = mon('manectric', 30, 'sitrusberry', ['tackle']);
		await trainer('Gym Leader Wattson', [mon('magneton', 28), manectric]);
		o.wattsonArmed = manectric.heldItem; o.wattsonOK = !!a().info.megaOK;
		a().foe = manectric; a().foeImg = null;
		B.resolveTurn(ow.party[0].moves[0]); drain();
		o.wattsonMega = manectric.megaForm || null;
		o.wattsonUsed = !!a().megaUsed?.foe;
		B.finish('victory');
		o.wattsonReverted = !manectric.megaForm;
		end();
		bagSet('keystone', 0);
		const manectric2 = mon('manectric', 30, 'sitrusberry', ['tackle']);
		await trainer('Gym Leader Wattson', [manectric2]);
		o.noKeyNoFoeMega = manectric2.heldItem === 'sitrusberry' && !a().info.megaOK;
		end();
		bagSet('keystone', 1);

		// ===== 7. doubles: one Mega per side; the toggle on the first mon blocks the second =====
		const dz = mon('charizard', 60, 'charizarditey', ['tackle']), dv = mon('venusaur', 60, 'venusaurite', ['tackle']);
		setParty([dz, dv]);
		await startWild('snorlax', 60, { id: 'snorlax', level: 60 });
		o.isDouble = !!a().double;
		a().foe.moves = a().foeAlly.moves = [{ id: 'splash', name: 'Splash', pp: 40, maxPp: 40 }];
		a().phase = 'moves'; a().actionFor = 0; a().moveIdx = 0;
		B.key('m'); B.key('z');
		if (a().phase === 'target') B.key('z');
		o.allyToggle = B.megaToggleOK ? B.megaToggleOK(dv) : 'nofn';
		a().phase = 'moves'; a().moveIdx = 0;
		B.key('m'); B.key('z');
		if (a().phase === 'target') B.key('z');
		drain();
		o.doubleMe = dz.megaForm || null; o.doubleAlly = dv.megaForm || null;
		o.doubleSun = a().weather?.kind;   // Mega Charizard Y's Drought
		end();

		// ===== 8. an in-game PARTNER (Steven) Mega Evolves his Metagross =====
		const meta = mon('metagross', 45, null, ['tackle']);
		setParty([mon('swampert', 45, null, ['tackle']), mon('manectric', 45, null, ['tackle'])]);
		await trainer('MAXIE & TABITHA', [mon('mightyena', 40), mon('crobat', 40)], { double: true, partner: { name: 'STEVEN', party: [meta] } });
		o.partnerOK = !!a().partner?.megaOK; o.partnerStone = meta.heldItem;
		a().phase = 'moves'; a().moveIdx = 0; B.key('z'); if (a().phase === 'target') B.key('z');
		drain();
		o.partnerMega = meta.megaForm || null;
		B.finish('victory');
		o.partnerReverted = !meta.megaForm;
		end();

		// ===== 9. the RIFT PRISM never offers a Mega, even when one sits in the data =====
		if (mega) {
			for (const id of ['charizard_mega_x', 'charizard_mega_y']) data.species[id] = { ...mega.MEGA_FORMS[id], mega: true };
		}
		const fam = ow.formsOf('charizard');
		o.prism = fam ? fam.join(',') : 'none';
		delete data.species.charizard_mega_x; delete data.species.charizard_mega_y;
		return o;
	});
	A(o.hasMega, 'the page loads mega.js');
	A(o.canMegaAtStart === 'charizard_mega_x', 'a Charizard holding CHARIZARDITE X can Mega Evolve (KEY STONE owned)', o.canMegaAtStart);
	A(o.armed, 'M arms the MEGA toggle on the move list');
	A(o.megaLines?.length >= 2, 'the Key Stone + Mega Evolved lines play', JSON.stringify(o.megaLines));
	A(o.formAfter === 'charizard_mega_x' && o.typesAfter === 'Fire/Dragon' && o.abilityAfter === 'toughclaws' && o.atkUp && o.hpSame,
		'it becomes Mega Charizard X at once: Fire/Dragon, Tough Claws, higher Atk, same HP', JSON.stringify([o.formAfter, o.typesAfter, o.abilityAfter, o.atkUp, o.hpSame]));
	A(o.usedOnce && o.secondMega === null, 'once per battle: a second stone holder cannot Mega Evolve', o.secondMega);
	A(o.savedTypes === o.baseTypes && o.savedAbility === o.baseAbility && o.savedMega === null && !o.savedBase,
		'a mid-battle save writes the BASE form (types/ability), never the Mega', JSON.stringify([o.savedTypes, o.savedAbility, o.savedMega]));
	A(o.snapMine === '[[0,"charizard_mega_x"]]' && o.snapUsed, 'the battle snapshot remembers the Mega for a resume', o.snapMine);
	A(o.endTypes === o.baseTypes && o.endAbility === o.baseAbility && o.endAtk && o.endForm === null && !o.endBase,
		'the Mega reverts when the battle ends', JSON.stringify([o.endTypes, o.endAbility, o.endAtk, o.endForm]));
	A(o.endSaved, 'and the saved party is exactly the base form');
	A(o.resumedForm === 'charizard_mega_x' && o.resumedTypes === 'Fire/Dragon' && o.resumedUsed, 'a resumed battle puts the Mega back on the saved (base) mon, still spent', JSON.stringify([o.resumedForm, o.resumedTypes, o.resumedUsed]));
	A(o.resumeReverted, 'and it reverts when that battle ends');
	A(o.noKeyStone === null, 'without the KEY STONE there is no Mega', o.noKeyStone);
	A(o.wave2 === null && !o.wave2Item && o.wave1Lucario === 'lucario_mega', 'wave 2 is disabled (Lucario + Lucarionite Z: no), wave 1 works (Lucarionite: yes)', JSON.stringify([o.wave2, o.wave2Item, o.wave1Lucario]));
	A(o.primalForm === 'kyogre_primal' && o.primalAbility === 'primordialsea', 'Kyogre holding the BLUE ORB reverts to Primal Kyogre on entering battle', JSON.stringify([o.primalForm, o.primalAbility]));
	A(/"primal":"primordialsea"/.test(o.primalWeather || '') && /"kind":"rain"/.test(o.primalWeather || ''), 'Primordial Sea brings the heavy rain', o.primalWeather);
	A(!o.primalUsedMega, 'a Primal Reversion does not spend the Mega');
	A(o.fizzled && o.kyoHP, 'a Fire move fizzles out in the heavy rain');
	A(o.rainLocked, 'and an ordinary weather ability cannot replace it');
	A(o.primalReverted, 'Primal Kyogre reverts at the end of the battle');
	A(o.parental, 'Mega Kangaskhan\'s Parental Bond hits twice');
	A(o.wattsonArmed === 'manectite' && o.wattsonOK, 'Gym Leader WATTSON hands his Manectric its MANECTITE', o.wattsonArmed);
	A(o.wattsonMega === 'manectric_mega' && o.wattsonUsed, 'and the trainer AI Mega Evolves it', o.wattsonMega);
	A(o.wattsonReverted, 'the foe\'s Mega reverts at the end too');
	A(o.noKeyNoFoeMega, 'before the player holds the KEY STONE, no trainer Mega Evolves');
	A(o.isDouble, 'a wild double battle formed');
	A(o.allyToggle === false, 'doubles: with the first mon\'s Mega planned, the second cannot take the toggle', o.allyToggle);
	A(o.doubleMe === 'charizard_mega_y' && o.doubleAlly === null, 'doubles: exactly one Mega on the player\'s side', JSON.stringify([o.doubleMe, o.doubleAlly]));
	A(o.doubleSun === 'sun', 'Mega Charizard Y\'s Drought fires on Mega Evolving', o.doubleSun);
	A(o.partnerOK && o.partnerStone === 'metagrossite', 'the in-game partner STEVEN is armed with METAGROSSITE', o.partnerStone);
	A(o.partnerMega === 'metagross_mega' && o.partnerReverted, 'the partner\'s Metagross Mega Evolves, and reverts after', o.partnerMega);
	A(o.prism === 'none' || !/mega/.test(o.prism), 'the RIFT PRISM\'s form cycle never includes a Mega', o.prism);

	// ---------- acquisition: Key Stone, Mega marts, the ORBS ----------
	const q = await page.evaluate(async () => {
		const ow = window.__ow;
		const Bag = await import('/overworld/bag.js');
		const Badges = await import('/overworld/badges.js');
		const owm = await import('/overworld/ow_mega.js').catch(() => null);
		const q = { hasOwMega: !!owm };
		const bag = Bag.getBag(); delete bag.keystone; delete bag.redorb; delete bag.blueorb;
		localStorage.setItem('magepunk_bag_v1', JSON.stringify(bag));
		// seven Hoenn badges, then Juan's (the 8th): his win hands over the KEY STONE
		const hoenn = Badges.BADGES.HOENN;
		for (const b of hoenn.slice(0, 7)) Badges.earn('HOENN', b.id);
		ow.dialog.close?.();
		ow.onTrainerDefeated('SootopolisCity_Gym_1F_EventScript_Juan');
		q.keyAfter8 = Bag.count('keystone');
		const texts = [];
		for (let i = 0; i < 6 && ow.dialog.blocking; i++) { texts.push(JSON.stringify(ow.dialog.lines || ow.dialog.text || ow.dialog.pages || '')); ow.dialog.key('z'); ow.dialog.key('z'); }
		q.dialogs = texts.join(' | ');
		// the Mega marts
		if (owm) {
			q.martBefore = owm.megaStockAt('MAP_EVER_GRANDE_CITY_POKEMON_LEAGUE_1F').length;
			Badges.crown('HOENN');
			q.martAfter = owm.megaStockAt('MAP_EVER_GRANDE_CITY_POKEMON_LEAGUE_1F').length;
			q.martElsewhere = owm.megaStockAt('MAP_PETALBURG_CITY_MART').length;
			q.martKanto = owm.megaStockAt('MAP_INDIGO_PLATEAU_POKEMON_CENTER_1F').length;   // not Kanto's champion
			// MT. PYRE: the old couple (the map faked onto the current world)
			const real = ow.world.current.map;
			ow.world.current.map = { ...real, id: 'MAP_MT_PYRE_SUMMIT' };
			const fake = [{ tx: 22, ty: 5, ev: { script: 'MtPyre_Summit_EventScript_OldMan' } }, { tx: 23, ty: 5, ev: { script: 'MtPyre_Summit_EventScript_OldLady' } }];
			ow.npcs.list.push(...fake);
			q.oldMan = owm.megaNpcTalk(22, 5); while (ow.dialog.blocking) ow.dialog.key('z');
			q.oldLady = owm.megaNpcTalk(23, 5); while (ow.dialog.blocking) ow.dialog.key('z');
			q.orbs = [Bag.count('redorb'), Bag.count('blueorb')];
			q.again = owm.megaNpcTalk(23, 5);     // nothing more to give: their own script runs
			q.orbsAfter = [Bag.count('redorb'), Bag.count('blueorb')];
			ow.npcs.list.splice(ow.npcs.list.indexOf(fake[0]), 2);
			ow.world.current.map = real;
		}
		return q;
	});
	A(q.hasOwMega, 'overworld/ow_mega.js loads');
	A(q.keyAfter8 === 1, 'the 8th badge\'s leader (JUAN) hands over the KEY STONE', q.keyAfter8);
	A(/KEY STONE/.test(q.dialogs || ''), 'and the badge dialog says so', (q.dialogs || '').slice(0, 200));
	A(q.martBefore === 0 && q.martAfter === 47, 'the Ever Grande League counter sells the 47 wave-1 stones only to Hoenn\'s Champion', `${q.martBefore} -> ${q.martAfter}`);
	A(q.martElsewhere === 0 && q.martKanto === 0, 'no other mart sells them, nor a League you have not won');
	A(q.oldMan && q.oldLady && q.orbs?.[0] === 1 && q.orbs?.[1] === 1, 'MT. PYRE\'s old man gives the RED ORB, the old woman the BLUE ORB', JSON.stringify(q.orbs));
	A(q.again === false && q.orbsAfter?.[1] === 1, 'only once each');
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e?.stack || e));
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
