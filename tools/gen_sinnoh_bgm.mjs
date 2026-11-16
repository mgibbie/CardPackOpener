// gen_sinnoh_bgm.mjs — SINNOH's music: its maps' tracks and battle themes.
//
// The Sinnoh source (Reference/sinnoh-pokeemerald-expansion) carries its Diamond/Pearl/Platinum arrangements as MIDI
// (sound/songs/midi/mus_dpp_*.mid, written for the GBA's own sound engine). There is no recording to download, so
// each is RENDERED: FluidSynth plays the MIDI through a General MIDI soundfont, and ffmpeg trims the tail and writes
// the same ogg the other regions' tracks are. The instruments are the soundfont's, not the GBA's: a faithful
// arrangement in an approximate voice (the owner's /audioswap/ page can replace any of them).
//
//   data/sounds/bgm/sinnoh_MUS_DPP_<NAME>.ogg     one per mus_dpp_*.mid
//   data/music_map.json                           MAP_SINNOH_* -> its track
//       MUS_DPP_X            -> sinnoh_MUS_DPP_X
//       MUS_RG_X / MUS_X     -> the FireRed / Emerald track of that name the game already has (the source reuses
//                               them for marts, caves, gyms), when it has one
//
//   node tools/gen_sinnoh_bgm.mjs            (report)
//   FLUIDSYNTH=<fluidsynth.exe> SOUNDFONT=<gm.sf2> node tools/gen_sinnoh_bgm.mjs --write
// Without FLUIDSYNTH/SOUNDFONT, --write still writes music_map.json for the tracks already rendered.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const WRITE = process.argv.includes('--write');
const REF = (() => { for (let d = path.resolve('.'); ; d = path.dirname(d)) { const p = path.join(d, 'Magepunk66', 'Reference'); if (fs.existsSync(p)) return p; if (path.dirname(d) === d) throw new Error('Magepunk66/Reference not found'); } })();
const MIDI = path.join(REF, 'sinnoh-pokeemerald-expansion', 'sound', 'songs', 'midi');
const DATA = path.resolve('overworld/data'), BGM = path.join(DATA, 'sounds', 'bgm');
const FS = process.env.FLUIDSYNTH, SF = process.env.SOUNDFONT;
const has = key => fs.existsSync(path.join(BGM, key + '.ogg'));

// ---- 1. render every DPP midi ----
const midis = fs.readdirSync(MIDI).filter(f => /^mus_dpp_.*\.mid$/.test(f)).sort();
let rendered = 0, kept = 0, skipped = 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sinnoh-bgm-'));
for (const f of midis) {
	const key = 'sinnoh_' + f.slice(0, -4).toUpperCase(), out = path.join(BGM, key + '.ogg');
	if (fs.existsSync(out) && !process.argv.includes('--force')) { kept++; continue; }
	if (!WRITE || !FS || !SF) { skipped++; continue; }
	const wav = path.join(tmp, key + '.wav');
	execFileSync(FS, ['-ni', '-q', '-g', '0.8', '-r', '44100', '-F', wav, SF, path.join(MIDI, f)], { stdio: 'ignore' });
	// trim the silent tail (so the loop seam is tight), bring it to the other tracks' level, 80k vorbis like them
	execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-af', 'areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,volume=-5dB', '-c:a', 'libvorbis', '-b:a', '80k', out], { stdio: 'inherit' });
	fs.rmSync(wav, { force: true });
	rendered++;
}
fs.rmSync(tmp, { recursive: true, force: true });

// ---- 2. each Sinnoh map's track ----
const index = JSON.parse(fs.readFileSync(path.join(DATA, 'map_index.json'), 'utf8'));
const mm = JSON.parse(fs.readFileSync(path.join(DATA, 'music_map.json'), 'utf8'));
// (FireRed's Sevii cave theme IS Mt. Moon's: pokeemerald's own note on MUS_RG_SEVII_CAVE)
const ALIAS = { MUS_RG_SEVII_CAVE: 'firered_MUS_MT_MOON', MUS_HALL_OF_FAME: 'emerald_MUS_HALL_OF_FAME_ROOM' };
const keyFor = mus => {
	if (!mus || mus === 'MUS_NONE') return null;
	if (/^MUS_DPP_/.test(mus)) return has('sinnoh_' + mus) ? 'sinnoh_' + mus : null;
	if (ALIAS[mus] && has(ALIAS[mus])) return ALIAS[mus];
	if (/^MUS_RG_/.test(mus)) { const k = 'firered_MUS_' + mus.slice(7); return has(k) ? k : null; }
	return has('emerald_' + mus) ? 'emerald_' + mus : has('firered_' + mus) ? 'firered_' + mus : null;
};
let mapped = 0; const silent = {};
for (const [id, stem] of Object.entries(index)) {
	if (!id.startsWith('MAP_SINNOH_')) continue;
	const m = JSON.parse(fs.readFileSync(path.join(DATA, 'maps', stem + '_map.json'), 'utf8'));
	const k = keyFor(m.music);
	if (k) { mm[id] = k; mapped++; } else { delete mm[id]; silent[m.music] = (silent[m.music] || 0) + 1; }
}
console.log(`midis: ${midis.length} (rendered ${rendered}, already there ${kept}, not rendered ${skipped}${skipped && WRITE ? ': set FLUIDSYNTH and SOUNDFONT' : ''})`);
console.log(`Sinnoh maps with a track: ${mapped}; without: ${Object.values(silent).reduce((a, b) => a + b, 0)}  ${JSON.stringify(silent)}`);
if (WRITE) { fs.writeFileSync(path.join(DATA, 'music_map.json'), JSON.stringify(mm)); console.log('music_map.json written'); }
else console.log('(dry run — pass --write)');
