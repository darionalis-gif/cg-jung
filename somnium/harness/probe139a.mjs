// r139 technical review: exact on-screen pixel footprint of every actor a beat names.
// The report's onScreen/occluded flags are derived from a raycast to one point; this measures
// what the viewer actually sees, by re-rendering each beat's frame with one actor forced to a
// flat magenta and counting the magenta pixels that survive the depth test.
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
  const scene = rawOf(id);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
  await page.evaluate(x => { const S = window.__somnium; const d = { id: 'p', title: x.title, text: '', scene: S.normalizeScene(x, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; S.Stage.fixedDt = 1 / 30; }, scene);
  const beats = await page.evaluate(() => window.__somnium.App.cur.scene.beats.map(b => ({ dur: b.dur, actions: b.actions })));
  const rows = []; let t = 0;
  for (let i = 0; i < beats.length; i++) {
    const mid = (() => { const acts = (beats[i].actions || []).filter(x => x.actor && (x.move || x.state || x.say));
      if (!acts.length) return t + beats[i].dur * 0.5;
      const f = acts.reduce((s2, x) => s2 + ((x.at || 0) + (x.for === undefined ? 1 : x.for) / 2), 0) / acts.length;
      return t + beats[i].dur * Math.min(0.68, Math.max(0.32, f)); })();
    await page.evaluate(t0 => { const S = window.__somnium.Stage; S.setTime(t0); S.playing = false; }, t);
    await page.waitForTimeout(120);
    await page.evaluate(async m => { const S = window.__somnium.Stage; S.playing = true;
      for (let k = 0; k < 4000; k++) { if (S.time >= m) break; await new Promise(r => requestAnimationFrame(r)); } S.playing = false; }, mid);
    const r = await page.evaluate(() => {
      const S = window.__somnium.Stage, THREE = window.THREE;
      const bi = S.beatAt(S.time), b = S.scene.beats[bi];
      const ids2 = [...new Set(b.actions.filter(x => x.actor).map(x => x.actor).concat([b.camera.target]))].filter(Boolean);
      const gl = S.r.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const buf = new Uint8Array(w * h * 4);
      const flat = new THREE.MeshBasicMaterial({ color: 0xff00ff, fog: false });
      const res = {};
      for (const id2 of ids2) { const rec = S.actors.get(id2); if (!rec) { res[id2] = null; continue; }
        const saved = []; rec.g.traverse(o => { if (o.isMesh) { saved.push([o, o.material]); o.material = flat; } });
        S.r.render(S.three, S.camera); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let n = 0; for (let k = 0; k < buf.length; k += 4) if (buf[k] > 200 && buf[k + 1] < 90 && buf[k + 2] > 200) n++;
        for (const [o, m2] of saved) o.material = m2;
        res[id2] = { px: n, pct: +(100 * n / (w * h)).toFixed(3) }; }
      S.r.render(S.three, S.camera);
      return { beat: bi, time: +S.time.toFixed(2), w, h, res };
    });
    rows.push(r); t += beats[i].dur;
  }
  out[id] = rows; await ctx.close();
  console.log(id, rows.map(r => 'b' + (r.beat + 1) + ':' + Object.entries(r.res).filter(([k, v]) => v && v.px < 400).map(([k, v]) => k + '=' + v.px).join(',')).filter(s => s.split(':')[1]).join(' | '));
}
writeFileSync(path.join(HERE, 'out', (args.round || 'r139') + '-probe139a.json'), JSON.stringify(out, null, 1));
await browser.close(); server.close();
