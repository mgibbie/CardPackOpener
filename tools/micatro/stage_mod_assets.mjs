// Stage every Micatro mod's assets (micatro/mods/<id>/assets/**, gitignored) into
// .micatromods/<id>/assets/** with a CORS _headers file, for the separate Pages
// project magepunk-micatromods (the main site 301s /micatro/mods/<id>/assets/*
// there — see _redirects). Then: npm run deploy-micatro-mods
import fs from 'fs';
import path from 'path';

const SRC = 'micatro/mods', OUT = '.micatromods';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let files = 0;
for (const id of fs.readdirSync(SRC)) {
  const a = path.join(SRC, id, 'assets');
  if (!fs.existsSync(a)) continue;
  fs.cpSync(a, path.join(OUT, id, 'assets'), { recursive: true });
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? walk(path.join(d, e.name)) : 1), 0);
  files += walk(a);
}
fs.writeFileSync(path.join(OUT, '_headers'), '/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=86400\n');
console.log(`staged ${files} files into ${OUT}`);
