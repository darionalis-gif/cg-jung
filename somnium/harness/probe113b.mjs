// r113 technical review, part B, run against a chosen build (--html=...):
//  1. reproducibility: the harness's own beat loop, run twice, against report.json
//  2. seek convergence: how far the camera travels after a cut, at frozen time
//  3. a real playthrough: per-frame camera jumps, tagged at-a-cut or mid-beat
//  4. the biggest azimuth swing inside a single beat
//  5. the moon / sky bodies: ndc position each beat, and indoors
//  6. camera height vs the floor
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
const sceneOf = (id, f) => JSON.parse(readFileSync(path.join(OUT, id, f), 'utf8'));
const rawOf = id => { const p = path.join(OUT, id, 'raw.json'); if (existsSync(p)) { try { const r = JSON.parse(readFileSync(p, 'utf8')); if (r && Array.isArray(r.actors) && r.actors.length) return r; } catch (e) { } } return sceneOf(id, 'scene.json'); };
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
  return { ctx, page };
};
const load = (page, x) => page.evaluate(s => { const S = window.__somnium; const d = { id: 'rr', title: s.title, text: '', scene: S.normalizeScene(s, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.playing = false; }, x);
const d3 = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
const all = {};

for (const id of ids) {
  const scene = rawOf(id); const beats = scene.beats; const rep = JSON.parse(readFileSync(path.join(OUT, id, 'report.json'), 'utf8'));
  console.log('='.repeat(72)); console.log(id);
  // --- 1+2: the harness beat loop, exactly, twice
  const runs = [];
  for (let run = 0; run < 2; run++) {
    const { ctx, page } = await newPage(); await load(page, scene);
    const rows = []; let t = 0;
    for (let i = 0; i < beats.length; i++) {
      const mid = t + beats[i].dur * 0.5;
      await page.evaluate(m => { window.__somnium.Stage.setTime(m); window.__somnium.Stage.playing = false; }, mid); await page.waitForTimeout(240);
      const snap = await page.evaluate(() => ({ p: window.__somnium.Stage.cam.pos.toArray(), l: window.__somnium.Stage.cam.look.toArray() }));
      const settle = () => page.evaluate(async () => {
        const S = window.__somnium.Stage; let last = null;
        for (let k = 0; k < 150; k++) { await new Promise(r => requestAnimationFrame(r)); const now = S.camera.position.clone().add(S.cam.look); if (last && now.distanceTo(last) < 0.002) return k; last = now; } return -1; });
      const s1 = await settle();
      const afterSettle = await page.evaluate(() => ({ p: window.__somnium.Stage.cam.pos.toArray() }));
      const p1 = await page.evaluate(() => window.__somnium.pixels());
      await page.evaluate(() => { window.__somnium.Stage.playing = true; }); await page.waitForTimeout(700);
      const p2 = await page.evaluate(() => window.__somnium.pixels()); await page.evaluate(() => { window.__somnium.Stage.playing = false; });
      const diff = p1.reduce((s, v, k) => s + Math.abs(v - p2[k]), 0) / p1.length;
      const s2 = await settle();
      const m = await page.evaluate(() => window.__somnium.Stage.metrics());
      rows.push({ beat: i + 1, snap, seekDrift: d3(snap.p, afterSettle.p), settle: [s1, s2], motion: +diff.toFixed(2), cam: m.camera, time: m.time });
      t += beats[i].dur;
    }
    runs.push(rows); await ctx.close();
  }
  console.log(' -- beat loop (two runs vs the shipped report)');
  for (let i = 0; i < beats.length; i++) {
    const a = runs[0][i], b = runs[1][i], r = rep.shots[i];
    console.log(`  b${i + 1} settle ${JSON.stringify(a.settle)}/${JSON.stringify(b.settle)} rep${JSON.stringify(r.settleFrames)} | seekDrift ${a.seekDrift.toFixed(2)}/${b.seekDrift.toFixed(2)} m` +
      ` | pos A${JSON.stringify(a.cam.pos)} B${JSON.stringify(b.cam.pos)} rep${JSON.stringify(r.metrics.camera.pos)} | A-B ${d3(a.cam.pos, b.cam.pos).toFixed(2)} A-rep ${d3(a.cam.pos, r.metrics.camera.pos).toFixed(2)}` +
      ` | motion ${a.motion}/${b.motion}/rep ${r.motion}`);
  }
  // --- 3+4+5+6: one real playthrough, sampled every frame
  const { ctx, page } = await newPage(); await load(page, scene);
  await page.evaluate(() => { window.__somnium.Stage.setTime(0); window.__somnium.Stage.playing = true; });
  const total = beats.reduce((s, b) => s + b.dur, 0);
  const trace = await page.evaluate(async T => {
    const S = window.__somnium.Stage, THREE = window.THREE || window.__somnium.THREE;
    const out = []; let last = null, lastBeat = -1;
    const t0 = performance.now();
    while (S.time < T - 0.05 && performance.now() - t0 < 240000) {
      await new Promise(r => requestAnimationFrame(r));
      const p = S.camera.position.clone(), l = S.cam.look.clone();
      const bi = S.beatAt(S.time);
      const az = Math.atan2(p.x - l.x, p.z - l.z) * 180 / Math.PI;
      const rec = { t: +S.time.toFixed(2), b: bi, p: [p.x, p.y, p.z], az, jump: last ? p.distanceTo(last.p3) : 0, cut: bi !== lastBeat };
      last = { p3: p }; lastBeat = bi; out.push(rec);
    }
    return out;
  }, total);
  // moon / sky bodies per beat
  const sky = await page.evaluate(async bts => {
    const S = window.__somnium.Stage; const rows = [];
    let t = 0;
    for (let i = 0; i < bts.length; i++) {
      const mid = t + bts[i].dur * 0.5; t += bts[i].dur;
      S.setTime(mid); S.playing = false;
      for (let k = 0; k < 40; k++) await new Promise(r => requestAnimationFrame(r));
      const inRoom = !!S.roomAround(S.camera.position), inRoomLook = !!S.roomAround(S.cam.look);
      const bodies = [];
      for (const [id, rec] of S.actors) {
        const a = rec.a; if (!['moon', 'sun', 'star', 'orb'].includes(a.kind)) continue;
        const wp = new window.THREE.Vector3(); rec.g.getWorldPosition(wp);
        const nd = wp.clone().project(S.camera);
        bodies.push({ id, kind: a.kind, vis: rec.g.visible, x: +nd.x.toFixed(2), y: +nd.y.toFixed(2), z: +nd.z.toFixed(2), dist: +wp.distanceTo(S.camera.position).toFixed(1), py: +wp.y.toFixed(1) });
      }
      rows.push({ beat: i + 1, inRoom, inRoomLook, camY: +S.cam.pos.y.toFixed(2), bodies });
    }
    return rows;
  }, beats);
  await ctx.close();
  // report
  const jumps = trace.filter(r => r.jump > 1.5).sort((a, b) => b.jump - a.jump).slice(0, 12);
  console.log(' -- per-frame camera jumps > 1.5 m in a full playthrough (' + trace.length + ' frames)');
  for (const j of jumps) console.log(`    t=${j.t} beat ${j.b + 1} jump ${j.jump.toFixed(2)} m ${j.cut ? '(AT A CUT)' : '*** MID-BEAT ***'}`);
  // azimuth swing inside a beat
  const byBeat = {};
  for (const r of trace) { (byBeat[r.b] = byBeat[r.b] || []).push(r); }
  console.log(' -- azimuth swing and range change inside each beat');
  for (const k of Object.keys(byBeat)) {
    const rs = byBeat[k]; if (rs.length < 3) continue;
    let mx = 0; for (let i = 1; i < rs.length; i++) { const d = Math.abs(((rs[i].az - rs[0].az + 540) % 360) - 180); if (d > mx) mx = d; }
    const ys = rs.map(r => r.p[1]);
    console.log(`    beat ${+k + 1}: max |Δaz| from the beat's first frame = ${mx.toFixed(0)}°, camY ${Math.min(...ys).toFixed(2)}..${Math.max(...ys).toFixed(2)}`);
  }
  console.log(' -- sky bodies / room test per beat');
  for (const s of sky) console.log(`    b${s.beat} camInRoom=${s.inRoom} lookInRoom=${s.inRoomLook} camY=${s.camY} ${s.bodies.map(b => `${b.id}(${b.kind}) vis=${b.vis} ndc=(${b.x},${b.y}) d=${b.dist} y=${b.py}`).join(' | ') || '(none)'}`);
  const minY = Math.min(...trace.map(r => r.p[1]));
  console.log(` -- lowest camera y over the whole playthrough: ${minY.toFixed(2)}`);
  all[id] = { runs, trace: trace.filter(r => r.jump > 1.0), sky, minY };
}
writeFileSync(path.join(HERE, 'out', args.tag ? `probe113b-${args.tag}.json` : 'probe113b.json'), JSON.stringify(all, null, 1));
await browser.close(); server.close();
