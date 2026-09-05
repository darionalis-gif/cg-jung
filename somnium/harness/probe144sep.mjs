// r144: are people held apart -- ALL of them, crowd members included, and against solid walls?
// Plays each dream once at the harness's fixed 1/30 s step, samples every 0.25 s, and reports the
// closest pair of bodies (each body a 0.26-0.30 m cylinder) at every sample, plus the deepest
// intrusion of a body into a building's box.
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
  const scene = rawOf(id);
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/*', r => { const u = r.request().url(); if (u.includes('cdnjs.cloudflare.com') && u.endsWith('three.min.js')) return r.fulfill({ path: path.join(HERE, 'vendor', 'three.min.js'), contentType: 'application/javascript' }); if (u.includes('fonts.g')) return r.abort(); return r.continue(); });
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.__somnium && window.__somnium.Stage.ready, null, { timeout: 20000 });
  await page.evaluate(x => { const S = window.__somnium; const d = { id: 'p', title: x.title, text: '', scene: S.normalizeScene(x, ''), chat: [], src: null, at: Date.now() }; S.App.cur = d; S.App.open(d); S.Stage.setTime(0); S.Stage.playing = true; S.Stage.fixedDt = 1 / 30; }, scene);
  const rows = await page.evaluate(async () => {
    const S = window.__somnium.Stage, THREE = window.THREE; const total = S.scene.beats.reduce((a, b) => a + b.dur, 0);
    const res = []; const wp = new THREE.Vector3();
    while (S.time < total - 0.05) {
      await new Promise(r => requestAnimationFrame(r));
      if (res.length && S.time - res[res.length - 1].t < 0.25) continue;
      const bodies = [];
      for (const [aid, rec] of S.actors) { const st = S.states.get(aid); if (!st || st.op < 0.3) continue;
        if (!rec.g.userData.limbs && !rec.g.userData.members) continue;
        const mem = rec.g.userData.members;
        if (mem && mem.length) mem.forEach((m, k) => { m.getWorldPosition(wp); bodies.push({ id: aid + '#' + k, x: wp.x, y: st.pos[1], z: wp.z, s: st.state }); });
        else bodies.push({ id: aid, x: st.pos[0], y: st.pos[1], z: st.pos[2], s: st.state }); }
      let worst = null, worstX = null;   // worstX = closest pair that are NOT in the same crowd
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j]; if (Math.abs(a.y - b.y) > 1.5) continue;
        const d = +Math.hypot(a.x - b.x, a.z - b.z).toFixed(3);
        const same = a.id.split('#')[0] === b.id.split('#')[0];
        if (!worst || d < worst.d) worst = { d, a: a.id, b: b.id, sa: a.s, sb: b.s, same };
        if (!same && (!worstX || d < worstX.d)) worstX = { d, a: a.id, b: b.id, sa: a.s, sb: b.s }; }
      // deepest intrusion of a body into a solid building box
      let inWall = null;
      for (const bx of (S.solidBoxes || [])) for (const b of bodies) {
        if (b.x > bx.min.x && b.x < bx.max.x && b.z > bx.min.z && b.z < bx.max.z && b.y + 0.9 > bx.min.y && b.y < bx.max.y) {
          const depth = +Math.min(b.x - bx.min.x, bx.max.x - b.x, b.z - bx.min.z, bx.max.z - b.z).toFixed(2);
          if (!inWall || depth > inWall.depth) inWall = { id: b.id, depth }; } }
      res.push({ t: +S.time.toFixed(2), beat: S.beatAt(S.time), n: bodies.length, worst, worstX, inWall });
    }
    S.playing = false; return res;
  });
  out[id] = rows; await ctx.close();
  const all = rows.filter(r => r.worst);
  const mn = all.reduce((m, r) => r.worst.d < m.worst.d ? r : m, all[0]);
  const cross = rows.filter(r => r.worstX);
  const mnx = cross.length ? cross.reduce((m, r) => r.worstX.d < m.worstX.d ? r : m, cross[0]) : null;
  const bad = rows.filter(r => r.worst && r.worst.d < 0.6);
  const badx = rows.filter(r => r.worstX && r.worstX.d < 0.9);
  const wall = rows.filter(r => r.inWall && r.inWall.depth > 0.35);
  console.log(id.padEnd(22), 'samples', rows.length,
    '| closest pair overall', mn.worst.d + 'm (b' + (mn.beat + 1) + ' ' + mn.worst.a + '/' + mn.worst.b + ')',
    '| <0.6m in', bad.length, 'samples',
    '| closest ACROSS actors', mnx ? mnx.worstX.d + 'm (b' + (mnx.beat + 1) + ' ' + mnx.worstX.a + '/' + mnx.worstX.b + ')' : '-',
    '| <0.9m across in', badx.length,
    '| body >0.35m inside a building in', wall.length, 'samples', wall.length ? '(worst ' + Math.max(...wall.map(r => r.inWall.depth)) + 'm, ' + wall[0].inWall.id + ' b' + (wall[0].beat + 1) + ')' : '');
}
writeFileSync(path.join(HERE, 'out', 'probe144sep.json'), JSON.stringify(out));
await browser.close(); server.close();
