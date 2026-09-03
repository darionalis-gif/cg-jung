// Copies the critic-approved stage scripts of a harness round into harness/staged.json,
// which build.mjs embeds into index.html so the page opens with real dreams already staged.
// usage: node harness/stage-examples.mjs --round=harness/out/r3 [--ids=alta-263,...]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'; import path from 'node:path';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a, true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname); const round = args.round; if (!round) throw new Error('--round required');
const file = path.join(HERE, 'staged.json'); const staged = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const summary = JSON.parse(readFileSync(path.join(round, 'summary.json'), 'utf8'));
const ids = args.ids ? String(args.ids).split(',') : summary.filter(r => r.ok).map(r => r.id);
for (const id of ids) { const p = path.join(round, id, 'scene.json'); if (!existsSync(p)) { console.log('missing', id); continue; } staged[id] = JSON.parse(readFileSync(p, 'utf8')); console.log('staged', id, staged[id].title); }
writeFileSync(file, JSON.stringify(staged)); console.log('wrote', file, Object.keys(staged).length, 'scenes');
