// where the 112 ms of JavaScript on norms b3 goes: play the beat and print the per-frame submit
// time, so a one-frame spike can be told from a beat that is expensive every frame.
import { createServer } from 'node:http'; import { readFileSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const OUT = path.join(HERE, 'out', args.round || 'r138');
const id = args.id || 'norms-m-315', bi = +(args.beat === undefined ? 2 : args.beat);
const scene = JSON.parse(readFileSync(path.join(OUT, id, 'raw.json'), 'utf8'));
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
await page.evaluate(s => { const S = window.__somnium; const d = { id: 'rr', title: s.title, text: '', scene: S.normalizeScene(s, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; S.Stage.fixedDt = 1 / 30; }, scene);
const start = scene.beats.slice(0, bi).reduce((a, b) => a + b.dur, 0);
await page.evaluate(t0 => { const S = window.__somnium.Stage; S.setTime(t0); S.playing = false; }, start);
await page.waitForTimeout(150);
const out = await page.evaluate(async d => { const S = window.__somnium.Stage; S.submitTimes.length = 0; S.playing = true;
  const rec = []; for (let k = 0; k < 400; k++) { if (S.time >= d) break; await new Promise(r => requestAnimationFrame(r)); rec.push([+S.time.toFixed(2), S.submitTimes[S.submitTimes.length - 1]]); }
  S.playing = false; return rec; }, start + scene.beats[bi].dur);
console.log(id, 'b' + bi, 'frames', out.length);
const v = out.map(r => r[1]).filter(Number.isFinite);
v.sort((a, b) => b - a);
console.log('worst', v.slice(0, 8).map(x => x.toFixed(1)).join(' '), '| median', v[v.length >> 1].toFixed(1));
for (const r of out) if (r[1] > 20) console.log('  t', r[0], 'submit', r[1].toFixed(1));
await browser.close(); server.close();
