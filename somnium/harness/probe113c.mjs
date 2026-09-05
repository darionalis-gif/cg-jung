// r113: how fast does an uncut beat swing? Records the camera azimuth every frame of a real
// playthrough and reports, per beat, the total swing and the fastest 1 s of it.
import { createServer } from 'node:http'; import { readFileSync, writeFileSync, existsSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(args.html || path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const OUT = path.join(HERE, 'out', 'r113');
const ids = (args.ids ? String(args.ids).split(',') : ['alta-263', 'hall_female-365', 'natural_scientist-203', 'norms-m-315', 'pegasus-1015', 'vietnam_vet-89']);
const rawOf = id => { const p = path.join(OUT, id, 'raw.json'); if (existsSync(p)) { try { const r = JSON.parse(readFileSync(p, 'utf8')); if (r && Array.isArray(r.actors) && r.actors.length) return r; } catch (e) { } } return JSON.parse(readFileSync(path.join(OUT, id, 'scene.json'), 'utf8')); };
const out = {};
for (const id of ids) {
  const scene = rawOf(id);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
  await page.evaluate(s => { const S = window.__somnium; const d = { id: 'rr', title: s.title, text: '', scene: S.normalizeScene(s, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; }, scene);
  const total = scene.beats.reduce((s, b) => s + b.dur, 0);
  await page.evaluate(() => { window.__somnium.Stage.setTime(0); window.__somnium.Stage.playing = true; });
  const trace = await page.evaluate(async T => {
    const S = window.__somnium.Stage; const rows = []; const t0 = performance.now();
    while (S.time < T - 0.05 && performance.now() - t0 < 300000) {
      await new Promise(r => requestAnimationFrame(r));
      const p = S.camera.position, l = S.cam.look;
      rows.push([+S.time.toFixed(3), S.beatAt(S.time), Math.atan2(p.x - l.x, p.z - l.z) * 180 / Math.PI, Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z)]);
    }
    return rows;
  }, total);
  await ctx.close();
  const byBeat = {}; for (const r of trace) (byBeat[r[1]] = byBeat[r[1]] || []).push(r);
  console.log('===', id, `(${trace.length} frames)`);
  for (const k of Object.keys(byBeat)) {
    const rs = byBeat[k]; if (rs.length < 4) continue;
    const un = (a, b) => ((a - b + 540) % 360) - 180;
    let swing = 0; for (let i = 1; i < rs.length; i++) swing += Math.abs(un(rs[i][2], rs[i - 1][2]));
    let fastest = 0, fj = 0;
    for (let i = 0; i < rs.length; i++) { let j = i; let acc = 0; while (j + 1 < rs.length && rs[j + 1][0] - rs[i][0] <= 1.0) { acc += Math.abs(un(rs[j + 1][2], rs[j][2])); j++; } if (acc > fastest) { fastest = acc; fj = rs[i][0]; } }
    const rr = rs.map(r => r[3]);
    console.log(`  beat ${+k + 1}: total swing ${swing.toFixed(0)}°, fastest second ${fastest.toFixed(0)}°/s at t=${fj.toFixed(1)}, range ${Math.min(...rr).toFixed(1)}..${Math.max(...rr).toFixed(1)} m`);
  }
  out[id] = trace;
}
writeFileSync(path.join(HERE, 'out', args.tag ? `probe113c-${args.tag}.json` : 'probe113c.json'), JSON.stringify(out));
await browser.close(); server.close();
