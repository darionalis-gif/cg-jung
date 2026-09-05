// r144: what does the viewer actually see?  Reproduces the shipped frame exactly as run.mjs makes
// it (seek to 1.6 s before the beat boundary, play in to the recorded time), then for EVERY actor
// in the scene -- not only the beat's cast -- renders once normally and once with that actor
// hidden and counts the changed pixels.  Ground truth for `onScreen`, for the new `px` field, and
// for "who is that in the foreground".
import { createServer } from 'node:http'; import { readFileSync, writeFileSync, existsSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const OUT = path.join(HERE, 'out', args.round || 'r144');
const ids = args.ids ? String(args.ids).split(',') : ['alta-263', 'vietnam_vet-89', 'hall_female-365', 'norms-m-315', 'pegasus-1015', 'natural_scientist-203'];
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const rawOf = id => { const p = path.join(OUT, id, 'raw.json'); if (existsSync(p)) { try { const r = JSON.parse(readFileSync(p, 'utf8')); if (r && Array.isArray(r.actors) && r.actors.length) return r; } catch (e) { } } return JSON.parse(readFileSync(path.join(OUT, id, 'scene.json'), 'utf8')); };
const out = {};
for (const id of ids) {
  const scene = rawOf(id); const rep = JSON.parse(readFileSync(path.join(OUT, id, 'report.json'), 'utf8'));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
  await page.evaluate(x => { const S = window.__somnium; const d = { id: 'p', title: x.title, text: '', scene: S.normalizeScene(x, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; S.Stage.fixedDt = 1 / 30; }, scene);
  const rows = []; let t = 0;
  for (const sh of rep.shots) {
    const target = sh.metrics.time;
    await page.evaluate(t0 => { const S = window.__somnium.Stage; S.setTime(t0); S.playing = false; }, Math.max(0, t - 1.6));
    await page.evaluate(async () => { for (let k = 0; k < 3; k++) await new Promise(r => requestAnimationFrame(r)); });
    await page.evaluate(async m => { const S = window.__somnium.Stage; S.playing = true;
      for (let k = 0; k < 4000; k++) { if (S.time >= m) break; await new Promise(r => requestAnimationFrame(r)); } S.playing = false; }, target);
    const r = await page.evaluate(cast => {
      const S = window.__somnium.Stage; const gl = S.r.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const base = new Uint8Array(w * h * 4), alt = new Uint8Array(w * h * 4);
      S.r.render(S.three, S.camera); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, base);
      const res = {};
      for (const [a, rec] of S.actors) {
        const vis = rec.g.visible; if (!vis) { res[a] = { px: 0, cast: cast.includes(a) }; continue; }
        rec.g.visible = false;
        S.r.render(S.three, S.camera); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, alt);
        rec.g.visible = vis;
        let n = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = (y * w + x) * 4;
          if (Math.abs(base[k] - alt[k]) + Math.abs(base[k + 1] - alt[k + 1]) + Math.abs(base[k + 2] - alt[k + 2]) > 12) {
            n++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; } }
        res[a] = { px: n, cast: cast.includes(a), box: n ? [minx, h - maxy, maxx, h - miny] : null, hpx: n ? maxy - miny : 0 };
      }
      S.r.render(S.three, S.camera);
      return { time: +S.time.toFixed(2), w, h, res };
    }, sh.metrics.actors.map(a => a.id));
    const flags = Object.fromEntries(sh.metrics.actors.map(a => [a.id, (a.onScreen ? 'on' : 'OFF') + (a.occluded ? '/occ' : '') + ' px' + a.px]));
    rows.push({ beat: sh.beat, want: target, ...r, flags });
    t += sh.dur;
  }
  out[id] = rows; await ctx.close();
  for (const r of rows) {
    const stage = 900 * 748;
    const es = Object.entries(r.res).filter(([, v]) => v.px > 0 || v.cast).sort((a, b) => b[1].px - a[1].px);
    console.log(id, 'b' + r.beat, 't=' + r.time, es.map(([k, v]) => k + '=' + v.px + (v.hpx ? '/h' + v.hpx : '') + (v.cast ? '[' + (r.flags[k] || '') + ']' : '(uncast)')).join(' '));
  }
}
writeFileSync(path.join(HERE, 'out', 'probe144px.json'), JSON.stringify(out, null, 1));
await browser.close(); server.close();
