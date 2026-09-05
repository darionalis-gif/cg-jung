// r113 technical review: is the shot solve reproducible?
// A: after a seek (a cut), how far does the camera travel over the following frames at frozen time?
// B: re-run the harness's own beat loop twice and compare motion / pose with report.json.
import { createServer } from 'node:http'; import { readFileSync, writeFileSync, existsSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const OUT = path.join(HERE, 'out', 'r113');
const ids = ['alta-263', 'hall_female-365', 'natural_scientist-203', 'norms-m-315', 'pegasus-1015', 'vietnam_vet-89'];
const res = {};
const sceneOf = id => {
  const rawF = path.join(OUT, id, 'raw.json');
  if (existsSync(rawF)) { try { const r0 = JSON.parse(readFileSync(rawF, 'utf8')); if (r0 && Array.isArray(r0.actors) && r0.actors.length) return r0; } catch (e) { } }
  return JSON.parse(readFileSync(path.join(OUT, id, 'scene.json'), 'utf8'));
};
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
  return { ctx, page };
};
const load = (page, x) => page.evaluate(s => { const S = window.__somnium; const d = { id: 'rr', title: s.title, text: '', scene: S.normalizeScene(s, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; }, x);

for (const id of ids) {
  const scene = sceneOf(id); const beats = scene.beats;
  const runs = [];
  for (let run = 0; run < 2; run++) {
    const { ctx, page } = await newPage(); await load(page, scene);
    const rows = []; let t = 0;
    for (let i = 0; i < beats.length; i++) {
      const mid = t + beats[i].dur * 0.5;
      // A: the seek itself
      const a = await page.evaluate(async m => {
        const S = window.__somnium.Stage; S.setTime(m); S.playing = false;
        const snap = { p: S.cam.pos.toArray(), l: S.cam.look.toArray() };
        const marks = {}; let last = null, settledAt = -1;
        for (let k = 1; k <= 150; k++) { await new Promise(r => requestAnimationFrame(r));
          const p = S.cam.pos.clone(), l = S.cam.look.clone();
          if ([1, 2, 3, 5, 10, 30, 60, 150].includes(k)) marks[k] = { p: p.toArray(), l: l.toArray() };
          const now = S.camera.position.clone().add(S.cam.look);
          if (settledAt < 0 && last && now.distanceTo(last) < 0.002) settledAt = k; last = now; }
        return { snap, marks, settledAt };
      }, mid);
      // B: harness loop
      await page.waitForTimeout(120);
      const p1 = await page.evaluate(() => window.__somnium.pixels());
      await page.evaluate(() => { window.__somnium.Stage.playing = true; }); await page.waitForTimeout(700);
      const p2 = await page.evaluate(() => window.__somnium.pixels());
      await page.evaluate(() => { window.__somnium.Stage.playing = false; });
      const diff = p1.reduce((s, v, k) => s + Math.abs(v - p2[k]), 0) / p1.length;
      await page.evaluate(async () => { const S = window.__somnium.Stage; let last = null; for (let k = 0; k < 150; k++) { await new Promise(r => requestAnimationFrame(r)); const now = S.camera.position.clone().add(S.cam.look); if (last && now.distanceTo(last) < 0.002) return k; last = now; } return -1; });
      const m = await page.evaluate(() => window.__somnium.Stage.metrics());
      rows.push({ beat: i + 1, a, motion: +diff.toFixed(2), cam: m.camera, actors: m.actors });
      t += beats[i].dur;
    }
    runs.push(rows); await ctx.close();
  }
  res[id] = runs;
  const rep = JSON.parse(readFileSync(path.join(OUT, id, 'report.json'), 'utf8'));
  console.log('===', id);
  const d3 = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
  for (let i = 0; i < beats.length; i++) {
    const r0 = runs[0][i], r1 = runs[1][i], rp = rep.shots[i];
    const snapDrift1 = d3(r0.a.snap.p, r0.a.marks[150].p), snapDrift2 = d3(r1.a.snap.p, r1.a.marks[150].p);
    const f1 = d3(r0.a.marks[1].p, r0.a.marks[150].p);
    console.log(`  b${i + 1} settled ${r0.a.settledAt}/${r1.a.settledAt} | seek-drift(snap->150) ${snapDrift1.toFixed(2)}/${snapDrift2.toFixed(2)} m | f1->f150 ${f1.toFixed(2)} m` +
      ` | pose runA${JSON.stringify(r0.cam.pos)} runB${JSON.stringify(r1.cam.pos)} rep${JSON.stringify(rp.metrics.camera.pos)}` +
      ` | AB ${d3(r0.cam.pos, r1.cam.pos).toFixed(2)} Arep ${d3(r0.cam.pos, rp.metrics.camera.pos).toFixed(2)}` +
      ` | motion ${r0.motion}/${r1.motion}/rep ${rp.motion}`);
  }
}
writeFileSync(path.join(HERE, 'out', 'probe113a.json'), JSON.stringify(res, null, 1));
await browser.close(); server.close();
