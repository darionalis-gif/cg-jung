// r123 technical review: does the shipped still equal what a continuous playthrough shows?
// Pass A replicates run.mjs's per-beat capture exactly (seek to the boundary, play into the beat,
// 0.7 s motion window, screenshot).  Pass B plays the whole dream once from t=0 without a single
// seek and grabs the frame at the same story times.  The gap between them is the instrument error.
import { createServer } from 'node:http'; import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const html = readFileSync(args.html || path.join(HERE, '..', 'index.html'), 'utf8');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const OUT = path.join(HERE, 'out', args.round || 'r123');
const ids = (args.ids ? String(args.ids).split(',') : ['alta-263', 'hall_female-365', 'natural_scientist-203', 'norms-m-315', 'pegasus-1015', 'vietnam_vet-89']);
const rawOf = id => { const p = path.join(OUT, id, 'raw.json'); if (existsSync(p)) { try { const r = JSON.parse(readFileSync(p, 'utf8')); if (r && Array.isArray(r.actors) && r.actors.length) return r; } catch (e) { } } return JSON.parse(readFileSync(path.join(OUT, id, 'scene.json'), 'utf8')); };
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
  return { ctx, page };
};
const load = (page, x) => page.evaluate(s => { const S = window.__somnium; const d = { id: 'rr', title: s.title, text: '', scene: S.normalizeScene(s, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; S.Stage.fixedDt = 1 / 30; }, x);
const d3 = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
const grid = (a, b) => +(a.reduce((s, v, k) => s + Math.abs(v - b[k]), 0) / a.length).toFixed(2);
const all = {};

for (const id of ids) {
  const scene = rawOf(id); const beats = scene.beats;
  const rep = JSON.parse(readFileSync(path.join(OUT, id, 'report.json'), 'utf8'));
  const dir = path.join(OUT, id, 'cont'); mkdirSync(dir, { recursive: true });
  console.log('='.repeat(74)); console.log(id);

  // ---------- pass A: run.mjs, exactly ----------
  const A = [];
  { const { ctx, page } = await newPage(); await load(page, scene);
    let t = 0;
    for (let i = 0; i < beats.length; i++) {
      // ...and the mean of the windows is not where the verbs are either: four throws written at
      // 0.1 for 0.3 are over by 0.4, and a floor of 0.32 caught every one of them with its arms back
      // at its sides. Take the picture where the most of the beat's own action windows are open.
      const mid = (() => { const acts = (beats[i].actions || []).filter(x => x.actor && (x.move || x.state || x.say));
        if (!acts.length) return t + beats[i].dur * 0.5;
        let bf = 0.5, bs = -1e9;
        for (let k = 1; k < 20; k++) { const fr = k / 20; let s = 0;
          for (const x of acts) { const a0 = x.at || 0, a1 = a0 + (x.for === undefined ? 1 : x.for);
            if (fr < a0 || fr > a1) continue;
            const w = (x.say ? 2 : 0) + (x.state ? 2 : 0) + (x.move ? 1 : 0);
            s += w * (1 - Math.abs(fr - (a0 + a1) / 2) / Math.max(0.05, (a1 - a0) / 2) * 0.5); }
          s -= Math.abs(fr - 0.5) * 0.25;
          if (s > bs) { bs = s; bf = fr; } }
        return t + beats[i].dur * Math.min(0.85, Math.max(0.12, bf)); })();
      await page.evaluate(t0 => { const S = window.__somnium.Stage; S.setTime(t0); S.playing = false; }, Math.max(0, t - 1.6));
      await page.evaluate(async () => { for (let k = 0; k < 3; k++) await new Promise(r => requestAnimationFrame(r)); });
      await page.evaluate(async m => { const S = window.__somnium.Stage; S.playing = true;
        for (let k = 0; k < 4000; k++) { if (S.time >= m) break; await new Promise(r => requestAnimationFrame(r)); }
        S.playing = false; }, mid);
      const step = () => page.evaluate(async () => { const S = window.__somnium.Stage;
        const a0 = S.camera.position.clone(); await new Promise(r => requestAnimationFrame(r));
        return +S.camera.position.distanceTo(a0).toFixed(3); });
      const settled = await step();
      const p1 = await page.evaluate(() => window.__somnium.pixels());
      await page.evaluate(async () => { const S = window.__somnium.Stage; S.playing = true; for (let k = 0; k < 21; k++) await new Promise(r => requestAnimationFrame(r)); });
      const p2 = await page.evaluate(() => window.__somnium.pixels()); await page.evaluate(() => { window.__somnium.Stage.playing = false; });
      const motion = grid(p1, p2);
      const settled2 = await step();
      const m = await page.evaluate(() => window.__somnium.Stage.metrics());
      const px = await page.evaluate(() => window.__somnium.pixels());
      await page.screenshot({ path: path.join(dir, `A-${String(i + 1).padStart(2, '0')}.png`) });
      A.push({ beat: i + 1, mid: +mid.toFixed(2), time: m.time, cam: m.camera, actors: m.actors, motion, settleFrames: [settled, settled2], px, frameMs: m.frameMs });
      t += beats[i].dur;
    }
    await ctx.close(); }

  // ---------- pass B: one continuous playthrough, no seeks ----------
  const targets = A.map(a => a.time);
  const B = [];
  { const { ctx, page } = await newPage(); await load(page, scene);
    await page.evaluate(() => { const S = window.__somnium.Stage; S.setTime(0); S.playing = true; });
    for (let i = 0; i < targets.length; i++) {
      const hit = await page.evaluate(async tt => { const S = window.__somnium.Stage;
        S.playing = true;
        for (let k = 0; k < 8000; k++) { if (S.time >= tt) break; await new Promise(r => requestAnimationFrame(r)); }
        S.playing = false;   // frozen at the very frame the viewer sees
        return { time: +S.time.toFixed(3) }; }, targets[i]);
      const m = await page.evaluate(() => window.__somnium.Stage.metrics());
      const px = await page.evaluate(() => window.__somnium.pixels());
      await page.screenshot({ path: path.join(dir, `B-${String(i + 1).padStart(2, '0')}.png`) });
      B.push({ beat: i + 1, time: hit.time, cam: m.camera, actors: m.actors, px, frameMs: m.frameMs });
    }
    await ctx.close(); }

  console.log('  beat | report t | contin. t | dCam A-rep | dCam B-A | grid B-A | mode A/B | onScreen A/B');
  const rows = [];
  for (let i = 0; i < A.length; i++) {
    const r = rep.shots[i], a = A[i], b = B[i];
    const onA = a.actors.filter(x => x.onScreen).length + '/' + a.actors.length;
    const onB = b.actors.filter(x => x.onScreen).length + '/' + b.actors.length;
    const row = { beat: i + 1, repT: r.metrics.time, aT: a.time, bT: b.time,
      dCamArep: +d3(a.cam.pos, r.metrics.camera.pos).toFixed(2), dCamBA: +d3(b.cam.pos, a.cam.pos).toFixed(2),
      dLookBA: +d3(b.cam.look, a.cam.look).toFixed(2), gridBA: grid(b.px, a.px),
      modeA: a.cam.mode, modeB: b.cam.mode, onA, onB, motionRep: r.motion, motionA: a.motion,
      posA: a.cam.pos.map(v => +v.toFixed(1)), posB: b.cam.pos.map(v => +v.toFixed(1)), posRep: r.metrics.camera.pos };
    rows.push(row);
    console.log(`   b${String(i + 1).padStart(2)} | ${String(r.metrics.time).padStart(7)} | ${String(b.time).padStart(8)} | ${String(row.dCamArep).padStart(9)} | ${String(row.dCamBA).padStart(7)} | ${String(row.gridBA).padStart(7)} | ${a.cam.mode}/${b.cam.mode} | ${onA} ${onB}` + (row.dCamBA > 1 ? '   <<< GAP' : ''));
  }
  const g = rows.map(r => r.gridBA), dc = rows.map(r => r.dCamBA);
  console.log(`  gap B vs A: cam mean ${(dc.reduce((x, y) => x + y, 0) / dc.length).toFixed(2)} m, max ${Math.max(...dc).toFixed(2)} m; grid mean ${(g.reduce((x, y) => x + y, 0) / g.length).toFixed(2)}, max ${Math.max(...g).toFixed(2)}`);
  all[id] = rows;
}
writeFileSync(path.join(HERE, 'out', 'probe123cont.json'), JSON.stringify(all, null, 1));
await browser.close(); server.close();
