// r144: who is that in the foreground?  Reproduces one shipped frame the way run.mjs makes it and
// reports, for EVERY actor in the scene (not only the beat's cast), the rendered pixel count, the
// on-screen bounding box, and the distance to the lens.
import { createServer } from 'node:http'; import { readFileSync, existsSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const OUT = path.join(HERE, 'out', args.round || 'r144');
const id = args.id; const beats = String(args.beats).split(',').map(Number);
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const rawOf = i => { const p = path.join(OUT, i, 'raw.json'); if (existsSync(p)) { try { const r = JSON.parse(readFileSync(p, 'utf8')); if (r && Array.isArray(r.actors) && r.actors.length) return r; } catch (e) { } } return JSON.parse(readFileSync(path.join(OUT, i, 'scene.json'), 'utf8')); };
const scene = rawOf(id); const rep = JSON.parse(readFileSync(path.join(OUT, id, 'report.json'), 'utf8'));
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
await page.evaluate(x => { const S = window.__somnium; const d = { id: 'p', title: x.title, text: '', scene: S.normalizeScene(x, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; S.Stage.fixedDt = 1 / 30; }, scene);
for (const b of beats) {
  const sh = rep.shots[b - 1]; const start = rep.shots.slice(0, b - 1).reduce((s, x) => s + x.dur, 0);
  await page.evaluate(t0 => { const S = window.__somnium.Stage; S.setTime(t0); S.playing = false; }, Math.max(0, start - 1.6));
  await page.evaluate(async () => { for (let k = 0; k < 3; k++) await new Promise(r => requestAnimationFrame(r)); });
  await page.evaluate(async m => { const S = window.__somnium.Stage; S.playing = true; for (let k = 0; k < 4000; k++) { if (S.time >= m) break; await new Promise(r => requestAnimationFrame(r)); } S.playing = false; }, sh.metrics.time);
  const res = await page.evaluate(cast => {
    const S = window.__somnium.Stage, THREE = window.THREE; const gl = S.r.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const base = new Uint8Array(w * h * 4), alt = new Uint8Array(w * h * 4);
    S.r.render(S.three, S.camera); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, base);
    const out = [];
    for (const [a, rec] of S.actors) {
      const st = S.states.get(a); if (!st || st.op < 0.05 || !rec.g.visible) continue;
      rec.g.visible = false; S.r.render(S.three, S.camera); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, alt); rec.g.visible = true;
      let n = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = (y * w + x) * 4;
        if (Math.abs(base[k] - alt[k]) + Math.abs(base[k + 1] - alt[k + 1]) + Math.abs(base[k + 2] - alt[k + 2]) > 12) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
      const p = new THREE.Vector3(st.pos[0], st.pos[1], st.pos[2]);
      out.push({ id: a, kind: rec.a.kind, px: n, dist: +p.distanceTo(S.camera.position).toFixed(1),
        box: n ? [x0, h - y1, x1, h - y0] : null, wpx: n ? x1 - x0 : 0, hpx: n ? y1 - y0 : 0, cast: cast.includes(a) });
    }
    S.r.render(S.three, S.camera);
    return { t: +S.time.toFixed(2), w, h, out: out.sort((p, q) => q.px - p.px) };
  }, sh.metrics.actors.map(a => a.id));
  console.log('=== ' + id + ' b' + b + ' t=' + res.t + '  canvas ' + res.w + 'x' + res.h);
  for (const o of res.out) if (o.px > 0 || o.cast)
    console.log('   ' + (o.cast ? '*' : ' ') + o.id.padEnd(16) + o.kind.padEnd(10) + String(o.px).padStart(7) + ' px  ' + (o.px / (res.w * res.h) * 100).toFixed(2) + '% of canvas  ' + o.wpx + 'x' + o.hpx + '  d=' + o.dist + '  box ' + JSON.stringify(o.box));
}
await browser.close(); server.close();
