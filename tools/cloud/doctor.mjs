// doctor.mjs — can this machine (a Claude Code cloud session) run the gate and
// read the playtest/bug data? Read-only: it changes nothing anywhere.
//   1. node + puppeteer-core installed
//   2. CHROME points at a browser that actually launches
//   3. overworld/data is complete (vs tools/cloud/owdata_manifest.txt)
//   4. D1 (wrangler + CLOUDFLARE_API_TOKEN): counts the bug-report and to-do rows
//   5. gh is authenticated (branches / PRs / merges)
//
//   node tools/cloud/doctor.mjs
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let bad = 0;
const row = (ok, what, note = '') => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${note ? '  — ' + note : ''}`); };
const sh = (cmd, timeout = 120000) => execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout }).toString();

row(+process.versions.node.split('.')[0] >= 20, `node ${process.versions.node}`);

let puppeteer = null;
try { puppeteer = (await import('puppeteer-core')).default; row(true, 'puppeteer-core installed'); }
catch (e) { row(false, 'puppeteer-core installed', 'run npm install'); }

const chrome = process.env.CHROME || (fs.existsSync('/opt/chrome/chrome') ? '/opt/chrome/chrome' : null);   // the gate runner defaults to the same
if (!chrome) row(false, 'a Chrome to test with', 'run bash tools/cloud/setup.sh (installs /opt/chrome/chrome)');
else if (puppeteer) {
	try {
		const b = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const v = await b.version(); await b.close();
		row(true, `CHROME launches (${v})`);
	} catch (e) { row(false, `CHROME launches (${chrome})`, String(e.message).split('\n')[0]); }
}

const want = fs.readFileSync(path.join(ROOT, 'tools/cloud/owdata_manifest.txt'), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);   // a Windows checkout has CRLF
const missing = want.filter(p => !fs.existsSync(path.join(ROOT, 'overworld/data', p)));
row(missing.length === 0, `overworld/data has all ${want.length} manifest files`, missing.length ? `${missing.length} missing (e.g. ${missing[0]}) — run node tools/cloud/fetch-owdata.mjs` : '');

{   // a cloud session authenticates with CLOUDFLARE_API_TOKEN; a dev machine may use `wrangler login` instead
	try {
		const sql = "SELECT (SELECT COUNT(*) FROM mp_store WHERE key LIKE 'bug:%') AS bugs, (SELECT COUNT(*) FROM mp_store WHERE key='owner_todo') AS todo";
		const out = sh(`npx --yes wrangler d1 execute magepunk-users --remote --json --command "${sql}"`, 180000);
		const r = JSON.parse(out.slice(out.indexOf('[')))[0].results[0];
		row(true, `D1 reachable: ${r.bugs} open bug report(s), to-do inbox ${r.todo ? 'has notes' : 'empty'}`);
	} catch (e) { row(false, 'D1 reachable' + (process.env.CLOUDFLARE_API_TOKEN ? '' : ' (no CLOUDFLARE_API_TOKEN set)'), String(e.stderr || e.message).split('\n').filter(Boolean).slice(-2).join(' / ').slice(0, 300)); }
}

try { sh('gh auth status'); row(true, 'gh authenticated'); }
catch (e) { row(false, 'gh authenticated', String(e.stderr || e.message).split('\n')[0]); }

console.log(bad ? `\n${bad} problem(s)` : '\nall good — the gate and the D1 workflows can run here');
process.exit(bad ? 1 : 0);
