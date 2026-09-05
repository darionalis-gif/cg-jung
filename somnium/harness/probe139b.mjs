// r139 technical review, pass B: does the stage hold people apart, do figures sit on the ground,
// and does every named pose actually reach the rig?  Plays each dream once from t=0 at the
// harness's fixed 1/30 s step and samples every 0.25 s.
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
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
  await page.evaluate(x => { const S = window.__somnium; const d = { id: 'p', title: x.title, text: '', scene: S.normalizeScene(x, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.setTime(0); S.Stage.playing = true; S.Stage.fixedDt = 1 / 30; }, scene);
  const rows = await page.evaluate(async () => {
    const S = window.__somnium.Stage; const total = S.scene.beats.reduce((a, b) => a + b.dur, 0);
    const res = [];
    while (S.time < total - 0.05) {
      await new Promise(r => requestAnimationFrame(r));
      if (res.length && S.time - res[res.length - 1].t < 0.25) continue;
      const people = [];
      for (const [aid, rec] of S.actors) { const st = S.states.get(aid); if (!st) continue;
        const L = rec.g.userData.limbs; if (!L) continue; if (st.op <= 0.05) continue;
        people.push({ id: aid, x: st.pos[0], y: st.pos[1], z: st.pos[2], state: st.state,
          rootY: +rec.g.position.y.toFixed(3),
          armX: rec.g.userData.pose ? [+rec.g.userData.pose.armsX[0].toFixed(2), +rec.g.userData.pose.armsX[1].toFixed(2)] : null,
          legs: rec.g.userData.pose ? [+rec.g.userData.pose.legs[0].toFixed(2), +rec.g.userData.pose.legs[1].toFixed(2)] : null,
          py: rec.g.userData.pose ? +rec.g.userData.pose.y.toFixed(2) : null }); }
      let worst = null;
      for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
        const a = people[i], b = people[j]; if (Math.abs(a.y - b.y) > 1.5) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (!worst || d < worst.d) worst = { d: +d.toFixed(2), a: a.id, b: b.id }; }
      res.push({ t: +S.time.toFixed(2), beat: S.beatAt(S.time), worst, people: people.map(p => ({ id: p.id, s: p.state, rootY: p.rootY, py: p.py, armX: p.armX, legs: p.legs })) });
    }
    S.playing = false; return res;
  });
  out[id] = rows; await ctx.close();
  // summarise
  const close = rows.filter(r => r.worst && r.worst.d < 0.75);
  console.log(id, 'samples=' + rows.length, 'frames with two people < 0.75 m apart: ' + close.length,
    close.length ? 'min=' + Math.min(...close.map(r => r.worst.d)) + ' e.g. b' + (close[0].beat + 1) + ' ' + close[0].worst.a + '/' + close[0].worst.b + ' @' + close[0].worst.d + 'm' : '');
}
writeFileSync(path.join(HERE, 'out', (args.round || 'r139') + '-probe139b.json'), JSON.stringify(out));
await browser.close(); server.close();
