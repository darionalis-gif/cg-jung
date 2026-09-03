#!/usr/bin/env node
// Inline analyst.js into index.html between the ANALYST-MODULE markers.
//   node build.mjs          write index.html
//   node build.mjs --check  exit 1 if index.html is out of date
import { readFileSync, writeFileSync } from 'node:fs';
const START = '<!-- ANALYST-MODULE-START -->', END = '<!-- ANALYST-MODULE-END -->';
const html = readFileSync('index.html', 'utf8'), mod = readFileSync('analyst.js', 'utf8');
if (mod.includes('</script')) throw new Error('analyst.js must not contain "</script"');
const a = html.indexOf(START), b = html.indexOf(END);
if (a < 0 || b < 0 || b < a) throw new Error('index.html lacks the ANALYST-MODULE markers');
const built = html.slice(0, a + START.length) + '\n<script>\n' + mod.trimEnd() + '\n</script>\n' + html.slice(b);
if (process.argv.includes('--check')) {
  if (built !== html) { console.error('index.html is out of date: run `node build.mjs`'); process.exit(1); }
  console.log('index.html is up to date');
} else {
  writeFileSync('index.html', built);
  console.log(`inlined analyst.js (${Buffer.byteLength(mod)} bytes) into index.html (${Buffer.byteLength(built)} bytes)`);
}
