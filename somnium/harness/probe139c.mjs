// r139 technical review: how many pixels of each named actor does the viewer actually see in the
// frame the round shipped?  Seeks to the beat boundary, plays forward to the exact time recorded
// in report.json (so this is the same frame as beat-NN.png), then for each actor renders once
// normally and once with that actor's group hidden and counts the pixels that changed.  Robust to
// sprites, points and transparency, unlike a material swap.
import { createServer } from 'node:http'; import { readFileSync, writeFileSync, existsSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(args.html || path.join(HERE, '..', 'index.html'), 'utf8');
const OUT = path.join(HERE, 'out', args.round || 'r139');
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
    await page.evaluate(t0 => { const S = window.__somnium.Stage; S.setTime(t0); S.playing = false; }, t);
    await page.waitForTimeout(100);
    await page.evaluate(async m => { const S = window.__somnium.Stage; S.playing = true;
      for (let k = 0; k < 4000; k++) { if (S.time >= m) break; await new Promise(r => requestAnimationFrame(r)); } S.playing = false; }, target);
    const r = await page.evaluate(ids2 => {
      const S = window.__somnium.Stage; const gl = S.r.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const base = new Uint8Array(w * h * 4), alt = new Uint8Array(w * h * 4);
      S.r.render(S.three, S.camera); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, base);
      const res = {};
      for (const a of ids2) { const rec = S.actors.get(a); if (!rec) { res[a] = -1; continue; }
        const vis = rec.g.visible; rec.g.visible = false;
        S.r.render(S.three, S.camera); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, alt);
        rec.g.visible = vis;
        let n = 0; for (let k = 0; k < base.length; k += 4) { if (Math.abs(base[k] - alt[k]) + Math.abs(base[k + 1] - alt[k + 1]) + Math.abs(base[k + 2] - alt[k + 2]) > 12) n++; }
        res[a] = n; }
      S.r.render(S.three, S.camera);
      return { time: +S.time.toFixed(2), w, h, res };
    }, sh.metrics.actors.map(a => a.id));
    rows.push({ beat: sh.beat, want: target, ...r,
      flags: Object.fromEntries(sh.metrics.actors.map(a => [a.id, (a.onScreen ? 'on' : 'OFF') + (a.occluded ? '/occ' : '')])) });
    t += sh.dur;
  }
  out[id] = rows; await ctx.close();
  for (const r of rows) {
    const bad = Object.entries(r.res).filter(([k, v]) => v >= 0 && v < 600);
    console.log(id, 'b' + r.beat, 't=' + r.time, Object.entries(r.res).map(([k, v]) => k + '=' + v + '(' + r.flags[k] + ')').join(' '));
  }
}
writeFileSync(path.join(HERE, 'out', (args.round || 'r139') + '-probe139c.json'), JSON.stringify(out, null, 1));
await browser.close(); server.close();
