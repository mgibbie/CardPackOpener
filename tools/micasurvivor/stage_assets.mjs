// Stage MicaSurvivor's sprite assets (micasurvivor/assets/**, gitignored — ~13.5k PMD
// sheets, ~104 MB) into .micasurvivor/** with a CORS _headers file, for the separate
// Pages project magepunk-micasurvivor (the main site 301s /micasurvivor/assets/* there —
// see _redirects). Deploying from inside .micasurvivor keeps the site's functions/ out
// of that project.  Then: npm run deploy-micasurvivor
import fs from 'fs';
import path from 'path';

const SRC = 'micasurvivor/assets', OUT = '.micasurvivor';
if (!fs.existsSync(path.join(SRC, 'pokemon'))) {
	console.error(`${SRC}/pokemon is missing — copy assets/pokemon from the PokéSurvivor checkout first (see micasurvivor/README.md)`);
	process.exit(1);
}
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? walk(path.join(d, e.name)) : 1), 0);
const files = walk(OUT);
// Sprites never change once published (a new sheet gets a new path), so cache them hard.
fs.writeFileSync(path.join(OUT, '_headers'), '/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=604800\n');
console.log(`staged ${files} files into ${OUT}`);
if (files > 19000) console.warn('WARNING: close to the 20,000-file Cloudflare Pages deployment limit');
const redirects = fs.readFileSync('_redirects', 'utf8');
if (!redirects.includes('/micasurvivor/assets/* https://magepunk-micasurvivor.pages.dev/:splat 301'))
	console.warn('WARNING: _redirects has no /micasurvivor/assets/* rule — add:\n  /micasurvivor/assets/* https://magepunk-micasurvivor.pages.dev/:splat 301');
