// Assembles index.html from the shell (index.html up to the three.js script tag) + the JS parts + examples.
import { readFileSync, writeFileSync } from 'node:fs';
const shell = readFileSync('index.html', 'utf8').split('<script>\n/* ====')[0];
const examples = JSON.parse(readFileSync('harness/examples.json', 'utf8'));
const staged = (() => { try { return JSON.parse(readFileSync('harness/staged.json', 'utf8')); } catch { return {}; } })();
for (const e of examples) if (staged[e.id]) e.scene = staged[e.id];
const ui = readFileSync('part_ui.js', 'utf8').replace('/*__EXAMPLES__*/[]', JSON.stringify(examples));
const js = '<script>\n' + readFileSync('part_core.js', 'utf8') + '\n' + readFileSync('part_builders.js', 'utf8') + '\n' + readFileSync('part_stage.js', 'utf8') + '\n' + ui.replace(/^<script>\n?/, '');
writeFileSync('index.html', shell + js);
console.log('built index.html', (shell + js).length, 'bytes');
